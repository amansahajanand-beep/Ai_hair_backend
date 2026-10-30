/**
 * Plan-aware descending reward distribution.
 *
 * Supported shapes:
 * - week → start near 8, end near 6
 * - month75 → start near 3, end near 2
 * - month150 → SEGMENTED: First 3 days (8), Middle (6→3), Last 3 days (2)
 * - year → SEGMENTED: By months - First 3 (150), Middle 6 (80-45), Last 3 (30)
 *
 * Returns a non-increasing integer array that always sums exactly to
 * `totalImages` and preserves the requested descending pattern.
 * 
 * Note: For month150 and year plans with segmented distribution,
 * use segment-distribution.service.js instead.
 */
function generateDistribution(totalImages, remainingDays, options = {}) {
    const total = Math.max(0, Math.floor(Number(totalImages) || 0));
    const days = Math.max(0, Math.floor(Number(remainingDays) || 0));

    const config = normalizeDistributionOptions(options);
    const minDay = Math.max(0, Math.floor(Number(config.minPerDay) || 0));
    const maxDay = Math.max(minDay, Math.floor(Number(config.maxPerDay) || minDay));

    if (days === 0) return [];
    if (days === 1) return [total];
    if (total === 0) return Array(days).fill(0);

    if (total < days * minDay) {
        return finalize(spreadEven(total, days), total);
    }

    const raw = [];
    const span = maxDay - minDay;
    const step = days > 1 ? span / (days - 1) : 0;

    for (let i = 0; i < days; i++) {
        raw.push(maxDay - step * i);
    }

    const floors = raw.map((n) => Math.floor(n));
    let give = total - floors.reduce((a, b) => a + b, 0);
    const order = raw
        .map((n, i) => ({ i, frac: n - Math.floor(n) }))
        .sort((a, b) => b.frac - a.frac || a.i - b.i);

    for (let k = 0; k < order.length && give > 0; k++) {
        floors[order[k].i] += 1;
        give -= 1;
    }

    return finalize(floors, total);
}

function normalizeDistributionOptions(options = {}) {
    if (typeof options === "number") {
        return {
            minPerDay: options,
            maxPerDay: options
        };
    }

    return {
        minPerDay: Math.max(0, Math.floor(Number(options.minPerDay || 0) || 0)),
        maxPerDay: Math.max(
            0,
            Math.floor(Number(options.maxPerDay || options.minPerDay || 0) || 0)
        )
    };
}

/** Floor + remainder on earliest days (mild decrease / equals OK). */
function spreadEven(total, days) {
    const base = Math.floor(total / days);
    let remainder = total % days;
    const result = Array(days).fill(base);

    for (let i = 0; i < days && remainder > 0; i++) {
        result[i] += 1;
        remainder -= 1;
    }

    return result;
}

/** Non-increasing order, exact sum preserved. First day ends up highest. */
function finalize(values, expectedSum) {
    const result = values.slice();
    const n = result.length;

    for (let pass = 0; pass < n; pass++) {
        for (let i = n - 2; i >= 0; i--) {
            if (result[i] < result[i + 1]) {
                const diff = result[i + 1] - result[i];
                result[i + 1] -= diff;
                result[i] += diff;
            }
        }
    }

    let current = result.reduce((a, b) => a + b, 0);
    let delta = expectedSum - current;
    let idx = 0;
    let guard = 0;

    while (delta !== 0 && n > 0 && guard < expectedSum + n + 10) {
        if (delta > 0) {
            result[idx] += 1;
            delta -= 1;
        } else if (result[idx] > 0) {
            result[idx] -= 1;
            delta += 1;
        }
        idx = (idx + 1) % n;
        guard += 1;
    }

    for (let i = n - 2; i >= 0; i--) {
        if (result[i] < result[i + 1]) {
            const diff = result[i + 1] - result[i];
            result[i + 1] -= diff;
            result[i] += diff;
        }
    }

    return result;
}

module.exports = {
    generateDistribution
};
