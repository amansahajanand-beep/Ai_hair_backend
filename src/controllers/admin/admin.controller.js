const Device = require("../../models/device.model");
const QuotaPolicy = require("../../models/quotaPolicy.model");
const DailyApiUsage = require("../../models/dailyApiUsage.model");
const adminAuth = require("../../middlewares/admin/adminAuth");
const entitlementService = require("../../services/hairstyle-api/entitlement.service");
const usageService = require("../../services/hairstyle-api/usage.service");
const { getDailyQuota, getQuotaTimezone } = require("../../config/hairstyle-api/quota");

const { MAX_SCHEDULE_DAYS, MAX_DAY_LIMIT } = QuotaPolicy;
const DAY_MS = 86400000;

function fail(res, status, message) {
    return res.status(status).json({ success: false, message });
}

function parseCountryParam(raw) {
    const code = String(raw || "").trim().toUpperCase();
    return code === "DEFAULT" || /^[A-Z]{2}$/.test(code) ? code : null;
}

function parseDayLimits(raw) {
    if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SCHEDULE_DAYS) {
        return { error: `Choose between 1 and ${MAX_SCHEDULE_DAYS} days` };
    }
    const values = raw.map((v) => (typeof v === "number" ? v : Number(String(v).trim())));
    const bad = values.findIndex((v) => !Number.isInteger(v) || v < 0 || v > MAX_DAY_LIMIT);
    if (bad !== -1) {
        return { error: `Day ${bad + 1}: enter a whole number between 0 and ${MAX_DAY_LIMIT}` };
    }
    return { values };
}

/** after_limit: a whole number, or null / "unlimited" for no limit. */
function parseAfterLimit(raw) {
    if (raw === null || raw === "unlimited") return { value: null };
    const n = typeof raw === "number" ? raw : Number(String(raw ?? "").trim());
    if (raw === undefined || raw === "" || !Number.isInteger(n) || n < 0 || n > MAX_DAY_LIMIT) {
        return { error: `After the last day: enter a whole number between 0 and ${MAX_DAY_LIMIT}, or choose unlimited` };
    }
    return { value: n };
}

const presentPolicy = (p) => ({
    country: p.country,
    enabled: p.enabled,
    day_limits: p.day_limits,
    // Older policies have no after_limit: they keep the last day's limit.
    after_limit: p.after_limit === undefined ? p.day_limits[p.day_limits.length - 1] : p.after_limit,
    updated_at: p.updatedAt,
    updated_by: p.updated_by || null
});

const daysAgoKey = (n) => usageService.getDateKey(new Date(Date.now() - n * DAY_MS));

exports.login = (req, res) => {
    if (!adminAuth.isConfigured()) {
        return fail(res, 503, "Admin panel is disabled. Set ADMIN_PASSWORD in .env.");
    }
    const { username, password } = req.body || {};
    if (!adminAuth.checkCredentials(username, password)) {
        return fail(res, 401, "Wrong username or password.");
    }
    res.json({ success: true, ...adminAuth.issueToken(username || "admin") });
};

exports.settings = (req, res) => {
    res.json({
        success: true,
        data: {
            max_schedule_days: MAX_SCHEDULE_DAYS,
            max_day_limit: MAX_DAY_LIMIT,
            timezone: getQuotaTimezone(),
            fallback_daily_quota: getDailyQuota(),
            today: usageService.getDateKey()
        }
    });
};

// ---------- policies ----------

exports.listPolicies = async (req, res, next) => {
    try {
        const [policies, counts] = await Promise.all([
            QuotaPolicy.find().sort({ country: 1 }).lean(),
            Device.aggregate([
                { $match: { legacy: false } },
                { $group: { _id: "$country", devices: { $sum: 1 } } }
            ])
        ]);
        const deviceCount = Object.fromEntries(counts.map((c) => [c._id || "UNKNOWN", c.devices]));

        res.json({
            success: true,
            data: policies.map((p) => ({
                ...presentPolicy(p),
                new_devices:
                    p.country === "DEFAULT" ? undefined : deviceCount[p.country] || 0
            }))
        });
    } catch (err) {
        next(err);
    }
};

exports.savePolicy = async (req, res, next) => {
    try {
        const country = parseCountryParam(req.params.country);
        if (!country) return fail(res, 400, "Country must be a 2-letter code like US, or DEFAULT.");

        const { values, error } = parseDayLimits(req.body?.day_limits);
        if (error) return fail(res, 400, error);

        const after = parseAfterLimit(req.body?.after_limit);
        if (after.error) return fail(res, 400, after.error);

        const enabled = req.body?.enabled === undefined ? true : req.body.enabled === true;

        const policy = await QuotaPolicy.findOneAndUpdate(
            { country },
            { $set: { day_limits: values, after_limit: after.value, enabled, updated_by: req.admin.u } },
            { upsert: true, new: true, runValidators: true, lean: true }
        );

        res.json({ success: true, data: presentPolicy(policy) });
    } catch (err) {
        next(err);
    }
};

exports.deletePolicy = async (req, res, next) => {
    try {
        const country = parseCountryParam(req.params.country);
        if (!country) return fail(res, 400, "Invalid country.");
        const { deletedCount } = await QuotaPolicy.deleteOne({ country });
        if (!deletedCount) return fail(res, 404, "No policy for that country.");
        res.json({ success: true });
    } catch (err) {
        next(err);
    }
};

// ---------- overview ----------

/** New devices still inside their country's schedule (length differs per country). */
async function countInOnboarding() {
    const policies = await QuotaPolicy.find({ enabled: true }).select("country day_limits").lean();
    if (!policies.length) return 0;

    const own = policies.filter((p) => p.country !== "DEFAULT");
    const fallback = policies.find((p) => p.country === "DEFAULT");
    const since = (p) => ({ $gte: daysAgoKey(p.day_limits.length - 1) });

    const counts = await Promise.all([
        ...own.map((p) =>
            Device.countDocuments({ legacy: false, country: p.country, first_seen_date: since(p) })
        ),
        fallback
            ? Device.countDocuments({
                  legacy: false,
                  country: { $nin: own.map((p) => p.country) },
                  first_seen_date: since(fallback)
              })
            : 0
    ]);
    return counts.reduce((a, b) => a + b, 0);
}

exports.overview = async (req, res, next) => {
    try {
        const today = usageService.getDateKey();

        const [totalDevices, newDevices, newToday, inOnboarding, usageByDay, activePolicies, byCountry] =
            await Promise.all([
                Device.countDocuments(),
                Device.countDocuments({ legacy: false }),
                Device.countDocuments({ first_seen_date: today, legacy: false }),
                countInOnboarding(),
                DailyApiUsage.aggregate([
                    { $match: { date: { $gte: daysAgoKey(7) } } },
                    { $group: { _id: "$date", generations: { $sum: "$used_count" }, devices: { $sum: 1 } } }
                ]),
                QuotaPolicy.countDocuments({ enabled: true }),
                Device.aggregate([
                    { $match: { legacy: false } },
                    {
                        $lookup: {
                            from: DailyApiUsage.collection.name,
                            let: { id: "$device_id" },
                            pipeline: [
                                {
                                    $match: {
                                        $expr: {
                                            $and: [
                                                { $eq: ["$device_id", "$$id"] },
                                                { $eq: ["$date", today] }
                                            ]
                                        }
                                    }
                                },
                                { $project: { used_count: 1 } }
                            ],
                            as: "usage"
                        }
                    },
                    {
                        $group: {
                            _id: "$country",
                            devices: { $sum: 1 },
                            generations_today: { $sum: { $sum: "$usage.used_count" } }
                        }
                    },
                    { $sort: { devices: -1 } },
                    { $limit: 12 }
                ])
            ]);

        const usageMap = Object.fromEntries(usageByDay.map((d) => [d._id, d]));
        const trend = [];
        for (let i = 6; i >= 0; i--) {
            const key = daysAgoKey(i);
            trend.push({
                date: key,
                generations: usageMap[key]?.generations || 0,
                devices: usageMap[key]?.devices || 0
            });
        }

        res.json({
            success: true,
            data: {
                total_devices: totalDevices,
                new_devices: newDevices,
                new_today: newToday,
                in_onboarding: inOnboarding,
                generations_today: usageMap[today]?.generations || 0,
                active_policies: activePolicies,
                trend,
                countries: byCountry.map((c) => ({
                    country: c._id || null,
                    devices: c.devices,
                    generations_today: c.generations_today
                }))
            }
        });
    } catch (err) {
        next(err);
    }
};

// ---------- users ----------

exports.listUsers = async (req, res, next) => {
    try {
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = 20;
        const filter = {};

        const country = String(req.query.country || "").trim().toUpperCase();
        if (country === "UNKNOWN") filter.country = null;
        else if (/^[A-Z]{2}$/.test(country)) filter.country = country;

        const search = String(req.query.search || "").trim();
        if (search) {
            const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").slice(0, 64);
            filter.device_id = new RegExp(escaped, "i");
        }

        if (req.query.type === "new") filter.legacy = false;
        if (req.query.type === "existing") filter.legacy = true;

        const today = usageService.getDateKey();

        const [total, devices, policies] = await Promise.all([
            Device.countDocuments(filter),
            Device.find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            QuotaPolicy.find({ enabled: true }).lean()
        ]);

        const usage = await DailyApiUsage.find({
            date: today,
            device_id: { $in: devices.map((d) => d.device_id) }
        })
            .select("device_id used_count")
            .lean();
        const usedMap = Object.fromEntries(usage.map((u) => [u.device_id, u.used_count]));
        const policyByCountry = Object.fromEntries(policies.map((p) => [p.country, p]));

        const rows = devices.map((d) => {
            const policy = d.legacy ? null : policyByCountry[d.country] || policyByCountry.DEFAULT || null;
            const e = entitlementService.computeEntitlement(d, policy, today);
            return {
                device_id: d.device_id,
                country: d.country,
                first_seen: d.createdAt,
                day: d.legacy ? null : e.day,
                total_days: policy ? policy.day_limits.length : null,
                phase: d.legacy ? "existing" : e.phase,
                limit: e.limit,
                used_today: usedMap[d.device_id] || 0
            };
        });

        res.json({
            success: true,
            data: { rows, page, pages: Math.max(Math.ceil(total / limit), 1), total }
        });
    } catch (err) {
        next(err);
    }
};
