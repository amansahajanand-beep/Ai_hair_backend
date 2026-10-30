/**
 * Segment-Based Distribution Service
 * 
 * Handles complex distribution patterns with multiple segments
 * for Monthly 150 and Yearly 900 plans.
 */

// Segment configurations for each plan
const PLAN_SEGMENTS = {
    // Monthly 150: First 3 days high, middle gradual decline, last 3 days low
    // Both "month" and "month150" use same pattern
    month: {
        totalDays: 30,
        totalQuota: 150,
        segments: [
            { name: 'first', days: 3, pattern: 'fixed', amount: 8 },     // 24 images
            { name: 'middle', days: 24, pattern: 'declining', start: 6, end: 3 }, // 120 images
            { name: 'last', days: 3, pattern: 'fixed', amount: 2 }       // 6 images
        ]
    },
    month150: {
        totalDays: 30,
        totalQuota: 150,
        segments: [
            { name: 'first', days: 3, pattern: 'fixed', amount: 8 },     // 24 images
            { name: 'middle', days: 24, pattern: 'declining', start: 6, end: 3 }, // 120 images
            { name: 'last', days: 3, pattern: 'fixed', amount: 2 }       // 6 images
        ]
    },
    
    // Yearly 900: Segment by months
    year: {
        totalMonths: 12,
        totalQuota: 900,
        segments: [
            { name: 'first', months: 3, pattern: 'fixed', amount: 150 },  // 450 images
            { name: 'middle', months: 6, pattern: 'custom', amounts: [80, 70, 60, 55, 50, 45] }, // 360 images
            { name: 'last', months: 3, pattern: 'fixed', amount: 30 }     // 90 images
        ]
    },
    
    // Yearly plan's DAILY distribution within each month (different from monthly plan)
    yearDaily: {
        totalDays: 30,
        segments: [
            { name: 'first', days: 3, pattern: 'fixed', amount: 4 },      // 12 images
            { name: 'middle', days: 24, pattern: 'declining', start: 3, end: 1 }, // Variable
            { name: 'last', days: 3, pattern: 'fixed', amount: 1 }        // 3 images
        ]
    }
};

/**
 * Check if a plan uses segmented distribution
 */
function isSegmentedPlan(planType) {
    const normalized = normalizePlanType(planType);
    return normalized === 'month' || normalized === 'month150' || normalized === 'year';
}

/**
 * Normalize plan type
 */
function normalizePlanType(planType = "") {
    const raw = String(planType || "").trim().toLowerCase();
    
    if (raw === "monthly" || raw === "monthly150" || raw === "monthly-150" || raw === "month-150") return "month";
    if (raw === "month150") return "month150";
    if (raw === "yearly") return "year";
    
    return raw;
}

/**
 * Generate daily distribution for Yearly plan's current month
 * Different pattern from monthly plan: 4→3→1 instead of 8→6→3→2
 * 
 * @param {number} remainingQuota - Total images remaining in current month
 * @param {number} remainingDays - Days left in month
 * @param {number} currentDay - Current day number (1-30)
 * @returns {Array<number>} Daily allocations
 */
function generateYearlyDailyDistribution(remainingQuota, remainingDays, currentDay = 1) {
    if (remainingDays <= 0) return [];
    if (remainingDays === 1) return [Math.max(0, remainingQuota)];
    
    const config = PLAN_SEGMENTS.yearDaily;
    const result = [];
    let day = currentDay;
    let daysToAllocate = remainingDays;
    
    // Segment 1: First 3 days (4 images each)
    if (day <= 3 && daysToAllocate > 0) {
        const firstSegmentDays = Math.min(4 - day, daysToAllocate);
        for (let i = 0; i < firstSegmentDays; i++) {
            result.push(4);
        }
        day += firstSegmentDays;
        daysToAllocate -= firstSegmentDays;
    }
    
    // Segment 2: Middle 24 days (3 declining to 1)
    if (day <= 27 && daysToAllocate > 0) {
        const middleStart = Math.max(4, day);
        const middleEnd = Math.min(27, day + daysToAllocate - 1);
        const middleDays = middleEnd - middleStart + 1;
        
        if (middleDays > 0) {
            const middleDistribution = generateLinearDecline(3, 1, middleDays);
            result.push(...middleDistribution);
            day = middleEnd + 1;
            daysToAllocate -= middleDays;
        }
    }
    
    // Segment 3: Last 3 days (1 image each)
    if (day <= 30 && daysToAllocate > 0) {
        const lastSegmentDays = Math.min(daysToAllocate, 30 - day + 1);
        for (let i = 0; i < lastSegmentDays; i++) {
            result.push(1);
        }
    }
    
    // Adjust to match exact remaining quota
    return adjustToMatchQuota(result, remainingQuota);
}

/**
 * Generate segmented distribution for Monthly 150 plan (and "month" plan)
 * Pattern: 8→6→3→2
 * 
 * @param {number} remainingQuota - Total images remaining
 * @param {number} remainingDays - Days left in plan
 * @param {number} currentDay - Current day number (1-30)
 * @returns {Array<number>} Daily allocations
 */
function generateMonth150Distribution(remainingQuota, remainingDays, currentDay = 1) {
    if (remainingDays <= 0) return [];
    if (remainingDays === 1) return [Math.max(0, remainingQuota)];
    
    const config = PLAN_SEGMENTS.month150;
    const result = [];
    let day = currentDay;
    let daysToAllocate = remainingDays;
    
    // Segment 1: First 3 days (8 images each)
    if (day <= 3 && daysToAllocate > 0) {
        const firstSegmentDays = Math.min(4 - day, daysToAllocate);
        for (let i = 0; i < firstSegmentDays; i++) {
            result.push(8);
        }
        day += firstSegmentDays;
        daysToAllocate -= firstSegmentDays;
    }
    
    // Segment 2: Middle 24 days (6 declining to 3)
    if (day <= 27 && daysToAllocate > 0) {
        const middleStart = Math.max(4, day);
        const middleEnd = Math.min(27, day + daysToAllocate - 1);
        const middleDays = middleEnd - middleStart + 1;
        
        if (middleDays > 0) {
            const middleDistribution = generateLinearDecline(6, 3, middleDays);
            result.push(...middleDistribution);
            day = middleEnd + 1;
            daysToAllocate -= middleDays;
        }
    }
    
    // Segment 3: Last 3 days (2 images each)
    if (day <= 30 && daysToAllocate > 0) {
        const lastSegmentDays = Math.min(daysToAllocate, 30 - day + 1);
        for (let i = 0; i < lastSegmentDays; i++) {
            result.push(2);
        }
    }
    
    // Adjust to match exact remaining quota
    return adjustToMatchQuota(result, remainingQuota);
}

/**
 * Generate linear declining pattern
 */
function generateLinearDecline(start, end, days) {
    if (days === 0) return [];
    if (days === 1) return [start];
    
    const result = [];
    const step = (start - end) / (days - 1);
    
    for (let i = 0; i < days; i++) {
        const value = start - (step * i);
        result.push(Math.round(value));
    }
    
    return result;
}

/**
 * Adjust distribution to match exact quota
 */
function adjustToMatchQuota(distribution, targetQuota) {
    if (distribution.length === 0) return distribution;
    
    const result = [...distribution];
    let currentSum = result.reduce((a, b) => a + b, 0);
    let diff = targetQuota - currentSum;
    
    // Distribute the difference
    let idx = 0;
    let iterations = 0;
    const maxIterations = Math.abs(diff) + 100;
    
    while (diff !== 0 && iterations < maxIterations) {
        if (diff > 0) {
            result[idx] += 1;
            diff -= 1;
        } else if (diff < 0 && result[idx] > 0) {
            result[idx] -= 1;
            diff += 1;
        }
        idx = (idx + 1) % result.length;
        iterations++;
    }
    
    // Ensure non-increasing pattern
    for (let i = result.length - 2; i >= 0; i--) {
        if (result[i] < result[i + 1]) {
            const swap = result[i + 1] - result[i];
            result[i + 1] -= swap;
            result[i] += swap;
        }
    }
    
    return result;
}

/**
 * Day within the CURRENT MONTH cycle of a yearly plan (1-30),
 * not total days since purchase.
 */
function getCurrentDayInYearlyMonth(subscription) {
    if (!subscription?.purchaseDate) return 1;

    const purchase = new Date(subscription.purchaseDate);
    const today = new Date();
    const totalDaysSincePurchase = Math.floor((today - purchase) / (24 * 60 * 60 * 1000));

    // 30-day cycles, wrap into 1-30 range for the current month
    const dayInMonth = (totalDaysSincePurchase % 30) + 1;
    return dayInMonth;
}
/**
 * Generate yearly plan monthly allocations (segmented)
 * 
 * @param {number} remainingQuota - Total images remaining in year
 * @param {number} remainingMonths - Months left in year
 * @param {number} currentMonth - Current month number (1-12)
 * @returns {Array<number>} Monthly allocations
 */
function generateYearlyMonthlyAllocations(remainingQuota, remainingMonths, currentMonth = 1) {
    if (remainingMonths <= 0) return [];
    if (remainingMonths === 1) return [Math.max(0, remainingQuota)];
    
    const config = PLAN_SEGMENTS.year;
    const result = [];
    let month = currentMonth;
    let monthsToAllocate = remainingMonths;
    
    // Segment 1: First 3 months (150 each)
    if (month <= 3 && monthsToAllocate > 0) {
        const firstSegmentMonths = Math.min(4 - month, monthsToAllocate);
        for (let i = 0; i < firstSegmentMonths; i++) {
            result.push(150);
        }
        month += firstSegmentMonths;
        monthsToAllocate -= firstSegmentMonths;
    }
    
    // Segment 2: Middle 6 months (80, 70, 60, 55, 50, 45)
    if (month <= 9 && monthsToAllocate > 0) {
        const middleAmounts = [80, 70, 60, 55, 50, 45];
        const startIdx = Math.max(0, month - 4);
        const endIdx = Math.min(middleAmounts.length, startIdx + monthsToAllocate);
        
        for (let i = startIdx; i < endIdx; i++) {
            result.push(middleAmounts[i]);
        }
        month += (endIdx - startIdx);
        monthsToAllocate -= (endIdx - startIdx);
    }
    
    // Segment 3: Last 3 months (30 each)
    if (month <= 12 && monthsToAllocate > 0) {
        const lastSegmentMonths = Math.min(monthsToAllocate, 12 - month + 1);
        for (let i = 0; i < lastSegmentMonths; i++) {
            result.push(30);
        }
    }
    
    // Adjust to match exact remaining quota
    return adjustMonthlyToMatchQuota(result, remainingQuota);
}

/**
 * Adjust monthly allocations to match quota
 */
function adjustMonthlyToMatchQuota(allocations, targetQuota) {
    if (allocations.length === 0) return allocations;
    
    const result = [...allocations];
    let currentSum = result.reduce((a, b) => a + b, 0);
    let diff = targetQuota - currentSum;
    
    // Distribute the difference proportionally
    let idx = 0;
    let iterations = 0;
    const maxIterations = Math.abs(diff) + 100;
    
    while (diff !== 0 && iterations < maxIterations) {
        if (diff > 0) {
            result[idx] += 1;
            diff -= 1;
        } else if (diff < 0 && result[idx] > 0) {
            result[idx] -= 1;
            diff += 1;
        }
        idx = (idx + 1) % result.length;
        iterations++;
    }
    
    return result;
}

/**
 * Get current day/month in subscription
 */
function getCurrentPeriod(subscription, periodType = 'day') {
    if (!subscription?.purchaseDate) return 1;
    
    const purchase = new Date(subscription.purchaseDate);
    const today = new Date();
    
    if (periodType === 'month') {
        const yearDiff = today.getUTCFullYear() - purchase.getUTCFullYear();
        const monthDiff = today.getUTCMonth() - purchase.getUTCMonth();
        return Math.max(1, yearDiff * 12 + monthDiff + 1);
    } else {
        const dayDiff = Math.floor((today - purchase ) / (24 * 60 * 60 * 1000));
        return Math.max(1, dayDiff + 1);
    }
}

/**
 * Main entry point for segmented distribution
 * 
 * @param {string} planType - Plan type (month, month150, year)
 * @param {number} remainingQuota - Remaining quota
 * @param {number} remainingPeriods - Remaining periods (days or months)
 * @param {Object} subscription - Subscription object
 * @param {string} distributionType - 'daily' or 'monthly' (for year plan)
 */
function generateSegmentedDistribution(planType, remainingQuota, remainingPeriods, subscription, distributionType = 'daily') {
    const normalized = normalizePlanType(planType);
    
    // Monthly plan (both "month" and "month150")
    if (normalized === 'month' || normalized === 'month150') {
        const currentDay = getCurrentPeriod(subscription, 'day');
        return generateMonth150Distribution(remainingQuota, remainingPeriods, currentDay);
    }
    
    // Yearly plan
    if (normalized === 'year') {
        if (distributionType === 'monthly') {
            // Generate monthly allocations for the year
            const currentMonth = getCurrentPeriod(subscription, 'month');
            return generateYearlyMonthlyAllocations(remainingQuota, remainingPeriods, currentMonth);
        } else {
            // For daily distribution within a month: USE SAME PATTERN AS MONTHLY PLAN
            // Pattern: 8→6→3→2 (same as month/month150)
            //const currentDay = getCurrentPeriod(subscription, 'day');
            const currentDay = getCurrentDayInYearlyMonth(subscription);

            return generateMonth150Distribution(remainingQuota, remainingPeriods, currentDay);
        }
    }
    
    return null; // Not a segmented plan
}

module.exports = {
    isSegmentedPlan,
    generateSegmentedDistribution,
    generateMonth150Distribution,
    generateYearlyDailyDistribution,
    generateYearlyMonthlyAllocations,
    getCurrentPeriod,
    PLAN_SEGMENTS
};
