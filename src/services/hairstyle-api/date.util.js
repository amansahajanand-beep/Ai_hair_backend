/**
 * UTC-only date helpers so quota days/months are consistent worldwide.
 */

function toUtcDate(value) {
    if (value instanceof Date) {
        return new Date(value.getTime());
    }

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`Invalid date: ${value}`);
    }
    return parsed;
}

/** YYYY-MM-DD in UTC */
function toDateKey(value = new Date()) {
    const d = toUtcDate(value);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** YYYY-MM in UTC */
function toMonthKey(value = new Date()) {
    return toDateKey(value).slice(0, 7);
}

function startOfUtcDay(value = new Date()) {
    const d = toUtcDate(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addUtcDays(value, days) {
    const d = startOfUtcDay(value);
    d.setUTCDate(d.getUTCDate() + days);
    return d;
}

/**
 * Inclusive list of UTC date keys from start → end (capped by expiry).
 */
function listDateKeysInclusive(start, end) {
    const keys = [];
    let cursor = startOfUtcDay(start);
    const last = startOfUtcDay(end);

    if (cursor > last) return keys;

    while (cursor <= last) {
        keys.push(toDateKey(cursor));
        cursor = addUtcDays(cursor, 1);
    }

    return keys;
}

/**
 * Date keys for a UTC calendar month, clipped to [rangeStart, rangeEnd].
 */
function listMonthDateKeys(monthKey, rangeStart, rangeEnd) {
    const [yearStr, monthStr] = monthKey.split("-");
    const year = Number(yearStr);
    const monthIndex = Number(monthStr) - 1;
    const monthStart = new Date(Date.UTC(year, monthIndex, 1));
    const monthEnd = new Date(Date.UTC(year, monthIndex + 1, 0));

    const start = startOfUtcDay(
        Math.max(monthStart.getTime(), startOfUtcDay(rangeStart).getTime())
    );
    const end = startOfUtcDay(
        Math.min(monthEnd.getTime(), startOfUtcDay(rangeEnd).getTime())
    );

    return listDateKeysInclusive(start, end);
}

/**
 * Last UTC calendar day of the month containing `value`.
 */
function endOfUtcMonth(value = new Date()) {
    const d = toUtcDate(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

/**
 * First UTC calendar day of the month containing `value`.
 */
function startOfUtcMonth(value = new Date()) {
    const d = toUtcDate(value);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function isExpired(expiryDate, now = new Date()) {
    return toUtcDate(now).getTime() >= toUtcDate(expiryDate).getTime();
}

module.exports = {
    toUtcDate,
    toDateKey,
    toMonthKey,
    startOfUtcDay,
    addUtcDays,
    listDateKeysInclusive,
    listMonthDateKeys,
    endOfUtcMonth,
    startOfUtcMonth,
    isExpired
};
