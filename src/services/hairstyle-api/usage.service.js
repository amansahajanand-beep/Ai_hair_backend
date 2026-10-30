const DailyApiUsage = require("../../models/dailyApiUsage.model");
const { getQuotaTimezone } = require("../../config/hairstyle-api/quota");
const entitlementService = require("./entitlement.service");

// Clients parse daily_limit/remaining as numbers, so "unlimited" is reported as
// this large number plus an explicit `unlimited: true` flag.
const UNLIMITED_DISPLAY = 999999;

/**
 * Per-device daily generation quota (DAILY_API_QUOTA).
 *
 * Policy: a request that passed validation reserves one unit atomically
 * BEFORE generation starts. If generation then fails, the unit is released,
 * so only successful generations are charged. Requests rejected before a
 * reservation (validation errors, quota exhausted) cost nothing.
 */

const DEVICE_ID_PATTERN = /^[\x21-\x7E]{1,128}$/;

class QuotaError extends Error {
    constructor(message, statusCode, code, extra = {}) {
        super(message);
        this.name = "QuotaError";
        this.statusCode = statusCode;
        this.code = code;
        this.extra = extra;
    }
}

function extractDeviceMetadata(body = {}) {
    const platform = body.platform?.trim()?.toLowerCase();
    const appVersion = body.app_version?.trim();

    return {
        platform: ["android", "ios"].includes(platform) ? platform : undefined,
        app_version: appVersion || undefined
    };
}

/**
 * Returns the trimmed device_id or throws a 400 QuotaError.
 * Must be a string (blocks object/operator injection) of 1-128 printable
 * ASCII characters without whitespace.
 */
function validateDeviceId(deviceId) {
    if (typeof deviceId !== "string" || !DEVICE_ID_PATTERN.test(deviceId.trim())) {
        throw new QuotaError(
            "device_id is required and must be 1-128 printable characters without spaces",
            400,
            "INVALID_DEVICE_ID"
        );
    }

    return deviceId.trim();
}

/** YYYY-MM-DD for `now` in the configured quota timezone. */
function getDateKey(now = new Date()) {
    // en-CA formats as YYYY-MM-DD
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: getQuotaTimezone(),
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }).format(now);
}

/** Next local midnight in the quota timezone, as an ISO string. */
function getResetAt(now = new Date()) {
    const tz = getQuotaTimezone();
    const parts = (date) =>
        Object.fromEntries(
            new Intl.DateTimeFormat("en-US", {
                timeZone: tz,
                hourCycle: "h23",
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit"
            })
                .formatToParts(date)
                .map((p) => [p.type, p.value])
        );

    const p = parts(now);
    const secondsIntoDay =
        Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);

    // Close enough across DST: re-check the result lands on the next date.
    let candidate = new Date(now.getTime() + (86400 - secondsIntoDay) * 1000);
    const todayKey = getDateKey(now);
    while (getDateKey(candidate) === todayKey) {
        candidate = new Date(candidate.getTime() + 60 * 1000);
    }
    while (getDateKey(new Date(candidate.getTime() - 1000)) !== todayKey) {
        candidate = new Date(candidate.getTime() - 60 * 1000);
    }

    return candidate.toISOString();
}

function buildStats(deviceId, used, now, entitlement) {
    const unlimited = entitlement.limit === null;
    const limit = unlimited ? UNLIMITED_DISPLAY : entitlement.limit;
    const remaining = unlimited ? UNLIMITED_DISPLAY : Math.max(limit - used, 0);

    return {
        device_id: deviceId,
        daily_limit: limit,
        used,
        remaining,
        exceeded: !unlimited && remaining === 0,
        unlimited,
        phase: entitlement.phase,
        day: entitlement.day,
        country: entitlement.country,
        date: getDateKey(now),
        resets_at: getResetAt(now)
    };
}

/**
 * Today's quota for a device. Never consumes anything, but does register a
 * first-time device (that is when its onboarding schedule starts).
 */
async function getDailyStats(rawDeviceId, now = new Date(), context = {}) {
    const deviceId = validateDeviceId(rawDeviceId);
    const date = getDateKey(now);
    const entitlement = await entitlementService.resolveEntitlement(deviceId, context, date);

    const doc = await DailyApiUsage.findOne({ device_id: deviceId, date })
        .select("used_count")
        .lean();

    return buildStats(deviceId, doc?.used_count || 0, now, entitlement);
}

/**
 * Atomically reserves one unit of today's quota.
 *
 * The filter `used_count: { $lt: limit }` makes the check and the increment a
 * single MongoDB operation, so concurrent requests can never exceed the limit.
 * When the day's document does not exist yet, the upsert creates it. If the
 * filter fails because the quota is exhausted, the upsert collides with the
 * unique (device_id, date) index (E11000), which we translate to "exhausted".
 * If two first-requests race to create the document, the loser gets E11000
 * too, so we retry: on the second pass the document exists and the filter
 * decides correctly.
 *
 * Returns a reservation that must be passed to releaseQuota() on failure.
 */
async function reserveQuota(rawDeviceId, now = new Date(), context = {}) {
    const deviceId = validateDeviceId(rawDeviceId);
    const date = getDateKey(now);
    const entitlement = await entitlementService.resolveEntitlement(deviceId, context, date);
    const limit = entitlement.limit; // null = unlimited
    const unlimited = limit === null;

    // The upsert below would create a fresh document and count 1 even though
    // `$lt: 0` can never match, so a zero limit must be refused up front.
    if (limit === 0) {
        throw new QuotaError(
            `No generations are available on day ${entitlement.day} of your welcome period. Please try again tomorrow.`,
            429,
            "DAILY_QUOTA_EXCEEDED",
            buildStats(deviceId, 0, now, entitlement)
        );
    }

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const doc = await DailyApiUsage.findOneAndUpdate(
                unlimited
                    ? { device_id: deviceId, date }
                    : { device_id: deviceId, date, used_count: { $lt: limit } },
                {
                    $inc: { used_count: 1 },
                    $setOnInsert: { createdAt: new Date() }
                },
                { upsert: true, new: true, lean: true }
            );

            return {
                device_id: deviceId,
                date,
                used: doc.used_count,
                limit,
                unlimited,
                phase: entitlement.phase,
                day: entitlement.day
            };
        } catch (error) {
            if (error?.code !== 11000) throw error;

            // Duplicate key: either exhausted, or lost an insert race.
            const existing = await DailyApiUsage.findOne({ device_id: deviceId, date })
                .select("used_count")
                .lean();

            if (!unlimited && existing && existing.used_count >= limit) {
                const dayNote =
                    entitlement.phase === "onboarding"
                        ? ` (day ${entitlement.day} of your welcome period)`
                        : "";
                throw new QuotaError(
                    `Daily limit reached (${limit}/day)${dayNote}. Please try again tomorrow.`,
                    429,
                    "DAILY_QUOTA_EXCEEDED",
                    buildStats(deviceId, existing.used_count, now, entitlement)
                );
            }
            // Otherwise retry.
        }
    }

    throw new QuotaError(
        "Could not reserve quota, please retry",
        503,
        "QUOTA_BUSY"
    );
}

/**
 * Extra fields for a successful generation response: a user-facing message
 * plus the quota left after this request.
 */
function quotaSummary(reservation, now = new Date()) {
    if (reservation.unlimited) {
        return {
            message: "Unlimited generations available.",
            quota: {
                daily_limit: UNLIMITED_DISPLAY,
                used: reservation.used,
                remaining: UNLIMITED_DISPLAY,
                unlimited: true,
                phase: reservation.phase,
                day: reservation.day,
                resets_at: getResetAt(now)
            }
        };
    }

    const remaining = Math.max(reservation.limit - reservation.used, 0);
    const message =
        remaining === 0
            ? `This was your last generation for today (${reservation.limit}/${reservation.limit} used). Your limit resets tomorrow.`
            : `${remaining} of ${reservation.limit} generation${reservation.limit === 1 ? "" : "s"} remaining today.`;

    return {
        message,
        quota: {
            daily_limit: reservation.limit,
            used: reservation.used,
            remaining,
            unlimited: false,
            phase: reservation.phase,
            day: reservation.day,
            resets_at: getResetAt(now)
        }
    };
}

/** Gives back a reservation after a failed generation. Never throws. */
async function releaseQuota(reservation) {
    if (!reservation) return;

    try {
        await DailyApiUsage.updateOne(
            {
                device_id: reservation.device_id,
                date: reservation.date,
                used_count: { $gt: 0 }
            },
            { $inc: { used_count: -1 } }
        );
    } catch (error) {
        console.error("Quota release error:", error);
    }
}

module.exports = {
    QuotaError,
    extractDeviceMetadata,
    validateDeviceId,
    getDateKey,
    getDailyStats,
    reserveQuota,
    releaseQuota,
    quotaSummary
};
