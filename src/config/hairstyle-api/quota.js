/**
 * Daily API quota configuration (read from environment).
 *
 * DAILY_API_QUOTA - successful generations allowed per device per day.
 *                   Positive integer. Default: 3 when unset/empty.
 * QUOTA_TIMEZONE  - IANA timezone that defines when the "day" rolls over.
 *                   Default: UTC.
 *
 * An invalid value throws, so a typo fails loudly at startup instead of
 * silently changing the limit.
 */

const DEFAULT_DAILY_API_QUOTA = 3;
const DEFAULT_QUOTA_TIMEZONE = "UTC";

function getDailyQuota() {
    const raw = process.env.DAILY_API_QUOTA;

    if (raw === undefined || String(raw).trim() === "") {
        return DEFAULT_DAILY_API_QUOTA;
    }

    const text = String(raw).trim();

    if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
        throw new Error(
            `Invalid DAILY_API_QUOTA "${raw}": must be a positive integer (e.g. 3)`
        );
    }

    return Number(text);
}

function getQuotaTimezone() {
    const tz = (process.env.QUOTA_TIMEZONE || "").trim() || DEFAULT_QUOTA_TIMEZONE;

    try {
        new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    } catch {
        throw new Error(`Invalid QUOTA_TIMEZONE "${tz}": must be an IANA timezone`);
    }

    return tz;
}

module.exports = {
    DEFAULT_DAILY_API_QUOTA,
    DEFAULT_QUOTA_TIMEZONE,
    getDailyQuota,
    getQuotaTimezone
};
