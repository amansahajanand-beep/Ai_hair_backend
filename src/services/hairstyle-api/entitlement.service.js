const geoip = require("geoip-lite");
const Device = require("../../models/device.model");
const QuotaPolicy = require("../../models/quotaPolicy.model");
const DailyApiUsage = require("../../models/dailyApiUsage.model");
const GenerationHistory = require("../../models/generationHistory.model");
const { getDailyQuota } = require("../../config/hairstyle-api/quota");


/**
 * Decides how many generations a device may make today.
 *
 *  - New device, country (or DEFAULT) has an enabled policy:
 *      day 1..N -> policy.day_limits[day - 1]   (N = days the admin set;
 *                  a null entry means unlimited that day)
 *      day N+1+ -> the last entry keeps applying
 *  - Legacy device (used the API before this feature) or no applicable
 *    policy: the flat DAILY_API_QUOTA, exactly as before.
 *
 * "Day N" counts calendar days in QUOTA_TIMEZONE from the day the device was
 * first seen, so day 1 may be a partial day.
 */

const COUNTRY_HEADERS = [
    "cf-ipcountry",
    "cloudfront-viewer-country",
    "x-vercel-ip-country",
    "x-appengine-country",
    "x-country-code"
];

/** "us" -> "US". Anything that is not an ISO alpha-2 code -> null. */
function normalizeCountry(raw) {
    if (typeof raw !== "string") return null;
    const code = raw.trim().toUpperCase();
    // XX / T1 are Cloudflare's "unknown" / "Tor" placeholders.
    if (!/^[A-Z]{2}$/.test(code) || code === "XX" || code === "T1") return null;
    return code;
}

/** Country from the client IP (offline GeoIP database). Private IPs give null. */
function countryFromIp(ip) {
    if (typeof ip !== "string" || !ip) return null;
    // IPv4-mapped IPv6 (::ffff:1.2.3.4) -> 1.2.3.4
    const clean = ip.replace(/^::ffff:/i, "");
    return normalizeCountry(geoip.lookup(clean)?.country);
}

/**
 * Order of trust:
 *  1. CDN/proxy country header (derived from the IP by the CDN)
 *  2. The request IP, looked up in the GeoIP database
 *  3. A `country` field sent by the app (free-form, so least trusted)
 */
function detectCountry(req) {
    for (const header of COUNTRY_HEADERS) {
        const code = normalizeCountry(req.get?.(header));
        if (code) return code;
    }
    return countryFromIp(req.ip) || normalizeCountry(req.body?.country);
}

function dayNumber(firstSeenDate, todayDate) {
    const toUtc = (key) => {
        const [y, m, d] = key.split("-").map(Number);
        return Date.UTC(y, m - 1, d);
    };
    return Math.round((toUtc(todayDate) - toUtc(firstSeenDate)) / 86400000) + 1;
}

async function hadPriorUsage(deviceId) {
    const [usage, history] = await Promise.all([
        DailyApiUsage.exists({ device_id: deviceId }),
        GenerationHistory.exists({ device_id: deviceId })
    ]);
    return Boolean(usage || history);
}

/** Finds the device, creating it on first sight. Race-safe via the unique index. */
async function ensureDevice(deviceId, country, todayDate) {
    let device = await Device.findOne({ device_id: deviceId }).lean();

    if (!device) {
        const legacy = await hadPriorUsage(deviceId);
        device = await Device.findOneAndUpdate(
            { device_id: deviceId },
            {
                $setOnInsert: {
                    device_id: deviceId,
                    first_seen_date: todayDate,
                    country: country || null,
                    legacy
                }
            },
            { upsert: true, new: true, lean: true }
        );
    }

    if (!device.country && country) {
        await Device.updateOne({ _id: device._id, country: null }, { $set: { country } });
        device.country = country;
    }

    return device;
}

async function findPolicy(country) {
    const codes = country ? [country, "DEFAULT"] : ["DEFAULT"];
    const policies = await QuotaPolicy.find({ country: { $in: codes }, enabled: true }).lean();
    return (
        policies.find((p) => p.country === country) ||
        policies.find((p) => p.country === "DEFAULT") ||
        null
    );
}

/**
 * Pure rule: given a device and policy, today's limit.
 * `limit: null` means unlimited.
 */
function computeEntitlement(device, policy, todayDate) {
    const day = dayNumber(device.first_seen_date, todayDate);

    if (device.legacy || !policy) {
        return {
            limit: getDailyQuota(),
            phase: "standard",
            day,
            policy_country: null
        };
    }

    const total = policy.day_limits.length;
    const afterSchedule = day > total && policy.after_limit !== undefined;
    const raw = afterSchedule
        ? policy.after_limit
        : policy.day_limits[Math.min(Math.max(day, 1), total) - 1];
    const limit = raw === null || raw === undefined ? null : raw;

    return {
        limit,
        // "onboarding" while inside the schedule, "ongoing" once past its last day.
        phase: limit === null ? "unlimited" : day <= total ? "onboarding" : "ongoing",
        day,
        policy_country: policy.country
    };
}

/**
 * @param {string} deviceId  already validated
 * @param {{country?: string|null}} context
 * @param {string} todayDate YYYY-MM-DD in the quota timezone
 */
async function resolveEntitlement(deviceId, context, todayDate) {
    const device = await ensureDevice(deviceId, normalizeCountry(context?.country), todayDate);
    const policy = device.legacy ? null : await findPolicy(device.country);

    return {
        ...computeEntitlement(device, policy, todayDate),
        country: device.country
    };
}

module.exports = {
    normalizeCountry,
    detectCountry,
    countryFromIp,
    dayNumber,
    computeEntitlement,
    resolveEntitlement
};
