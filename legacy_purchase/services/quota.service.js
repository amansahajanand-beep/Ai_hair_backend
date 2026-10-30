const DailyQuota = require("../../models/dailyQuota.model");
const MonthlyQuota = require("../../models/monthlyQuota.model");
const Subscription = require("../../models/subscription.model");
const { generateDistribution } = require("./distribution.service");
const {
    isSegmentedPlan,
    generateSegmentedDistribution
} = require("./segment-distribution.service");
const {
    toDateKey,
    toMonthKey,
    listDateKeysInclusive,
    isExpired: isDateExpired,
    startOfUtcDay,
    addUtcDays,
    endOfUtcMonth
} = require("./date.util");

const DEFAULT_DAILY_PROFILE = {
    minPerDay: 1,
    maxPerDay: 4
};
const YEAR_MONTHLY_BASE = 75;

const PLAN_TOTALS = {
    week: 50,
    month: 150,
    month75: 75,
    month150: 150,
    year: 900
};

const PLAN_DISTRIBUTION_PROFILES = {
    week: { minPerDay: 6, maxPerDay: 8 },
    month: { minPerDay: 1, maxPerDay: 8 },
    month75: { minPerDay: 2, maxPerDay: 3 },
    month150: { minPerDay: 2, maxPerDay: 7 },
    year: { minPerDay: 1, maxPerDay: 4 }
};

function normalizePlanType(planType = "") {
    const raw = String(planType || "")
        .trim()
        .toLowerCase();

    if (!raw) return "";

    if (raw === "weekly") return "week";
    if (raw === "yearly") return "year";
    if (raw === "monthly" || raw === "month") return "month";
    if (raw === "month75" || raw === "monthly75" || raw === "monthly-75" || raw === "month-75") return "month75";
    if (raw === "month150" || raw === "monthly150" || raw === "monthly-150" || raw === "month-150") return "month150";

    return raw;
}

function isMonthLikePlan(planType) {
    const normalized = normalizePlanType(planType);
    return normalized === "month" || normalized === "month75" || normalized === "month150";
}

function getDistributionProfile(planType) {
    const normalized = normalizePlanType(planType);
    return PLAN_DISTRIBUTION_PROFILES[normalized] || DEFAULT_DAILY_PROFILE;
}

function getPlanTotal(planType) {
    const normalized = normalizePlanType(planType);
    const total = PLAN_TOTALS[normalized];
    if (!total) {
        throw new Error(`Unsupported planType: ${planType}`);
    }
    return total;
}

async function isExpired(subscription, now = new Date()) {
    if (!subscription) return true;
    if (subscription.status === "expired") return true;
    return isDateExpired(subscription.expiryDate, now);
}

async function markExpired(subscription) {
    if (!subscription) return null;

    const userId = subscription.userId;
    const wasActive = subscription.status === "active";

    subscription.status = "expired";
    subscription.remainingQuota = 0;
    subscription.carryForward = 0;
    await subscription.save();

    await DailyQuota.updateMany(
        { subscriptionId: subscription._id, remainingQuota: { $gt: 0 } },
        { $set: { remainingQuota: 0 } }
    );

    await MonthlyQuota.updateMany(
        { subscriptionId: subscription._id, remainingQuota: { $gt: 0 } },
        { $set: { remainingQuota: 0, carryForward: 0 } }
    );

    // If this was an active subscription, activate the next pending one
    if (wasActive && userId) {
        try {
            const subscriptionService = require("./subscription.service");
            await subscriptionService.activateNextPendingSubscription(userId);
        } catch (error) {
            console.error("Failed to activate next pending subscription:", error);
        }
    }

    return subscription;
}

/**
 * Remaining UTC date keys from today through the last accessible day.
 *
 * The expiry date itself is treated as the first blocked day, so the
 * accessible window ends at expiryDate - 1 day.
 */
function getRemainingDateKeys(subscription, now = new Date()) {
    const today = startOfUtcDay(now);
    const expiry = startOfUtcDay(subscription.expiryDate);
    const lastAccessibleDay = addUtcDays(expiry, -1);

    let end;
    if (normalizePlanType(subscription.planType) === "week") {
        end = lastAccessibleDay;
    } else {
        const monthEnd = endOfUtcMonth(today);
        end = startOfUtcDay(Math.min(lastAccessibleDay.getTime(), monthEnd.getTime()));
    }

    if (today > end) return [];
    return listDateKeysInclusive(today, end);
}

/**
 * Write / replace daily rows for dateKeys with a fresh distribution of `pool`.
 * Sum of allocated remaining ALWAYS equals pool.
 * 
 * For segmented plans (month150, year), uses segment-based distribution.
 */
async function writeDailyDistribution(subscriptionId, dateKeys, pool, planType, subscription = null) {
    if (!dateKeys.length) return [];

    let amounts;
    
    // Check if this is a segmented plan
    if (isSegmentedPlan(planType) && subscription) {
        // Use segment-based distribution
        amounts = generateSegmentedDistribution(
            planType,
            pool,
            dateKeys.length,
            subscription
        );
        
        // Fall back to regular distribution if segment distribution returns null
        if (!amounts) {
            const distributionProfile = getDistributionProfile(planType);
            amounts = generateDistribution(pool, dateKeys.length, distributionProfile);
        }
    } else {
        // Use regular linear descending distribution
        const distributionProfile = getDistributionProfile(planType);
        amounts = generateDistribution(pool, dateKeys.length, distributionProfile);
    }

    const ops = dateKeys.map((date, index) => ({
        updateOne: {
            filter: { subscriptionId, date },
            update: {
                $set: {
                    allocatedQuota: amounts[index],
                    usedQuota: 0,
                    remainingQuota: amounts[index]
                },
                $setOnInsert: {
                    subscriptionId,
                    date
                }
            },
            upsert: true
        }
    }));

    if (ops.length) {
        await DailyQuota.bulkWrite(ops);
    }

    return amounts;
}

/**
 * Clear unused quota on past days (they are already in the pool via
 * subscription/monthly remainingQuota — never lost before expiry).
 */
async function clearPastRemaining(subscriptionId, todayKey) {
    const pastDocs = await DailyQuota.find({
        subscriptionId,
        date: { $lt: todayKey },
        remainingQuota: { $gt: 0 }
    }).select("remainingQuota");

    const carried = pastDocs.reduce((sum, doc) => sum + (doc.remainingQuota || 0), 0);

    if (pastDocs.length) {
        await DailyQuota.updateMany(
            {
                subscriptionId,
                date: { $lt: todayKey },
                remainingQuota: { $gt: 0 }
            },
            { $set: { remainingQuota: 0 } }
        );
    }

    return carried;
}

/**
 * At the start of a new UTC day:
 *   remainingImages + remainingDays → regenerate distribution.
 * Same-day calls are no-ops (no mid-day reshuffle).
 *
 * `currentCycle` stores the last redistribution date (YYYY-MM-DD).
 */
async function redistributeOnNewDay(subscription, pool, todayKey, now = new Date()) {
    if (subscription.currentCycle === todayKey) {
        const existing = await getTodayQuota(subscription, now);
        if (existing) return existing;
    }

    const dateKeys = getRemainingDateKeys(subscription, now);
    const carried = await clearPastRemaining(subscription._id, todayKey);
    const carryPool = Math.max(0, Number(pool) || 0) + carried;

    if (carried > 0) {
        subscription.remainingQuota = Math.max(
            0,
            (subscription.remainingQuota || 0) + carried
        );
    }

    if (!dateKeys.length || carryPool <= 0) {
        subscription.currentCycle = todayKey;
        subscription.carryForward = 0;
        await subscription.save();
        return null;
    }

    await writeDailyDistribution(
        subscription._id,
        dateKeys,
        carryPool,
        subscription.planType,
        subscription
    );

    subscription.currentCycle = todayKey;
    if (normalizePlanType(subscription.planType) === "week" || isMonthLikePlan(subscription.planType)) {
        subscription.carryForward = 0;
    }
    await subscription.save();

    return getTodayQuota(subscription, now);
}

/**
 * Week (50 / 7 days) and Month (150 / calendar month).
 * Pool = subscription.remainingQuota (unused never expires until sub expiry).
 */
async function ensureWeekOrMonthDays(subscription) {
    const now = new Date();
    const todayKey = toDateKey(now);
    const pool = Math.max(0, subscription.remainingQuota || 0);

    return redistributeOnNewDay(subscription, pool, todayKey, now);
}

/**
 * Calculate cumulative carry-forward for yearly plan
 * 
 * Formula:
 * carry_forward = (sum of all previous month allocations) - (total used before current month)
 * 
 * Example:
 * Months 1-3 allocated: 150 + 150 + 150 = 450
 * Used in months 1-3: 200
 * Carry-forward to Month 4: 450 - 200 = 250
 */
async function calculateYearlyCumulativeCarryForward(subscription, currentMonthKey) {
    // Get current month number in subscription (1-12)
    const { getCurrentPeriod } = require("./segment-distribution.service");
    const currentMonth = getCurrentPeriod(subscription, 'month');
    
    // Calculate total allocated in all previous months
    let totalAllocatedPrevious = 0;
    for (let month = 1; month < currentMonth; month++) {
        totalAllocatedPrevious += getYearlyMonthAllocation(month);
    }
    
    // Get total used across all previous months
    const previousMonths = await MonthlyQuota.find({
        subscriptionId: subscription._id,
        month: { $lt: currentMonthKey }
    });
    
    let totalUsedPrevious = 0;
    for (const prevMonth of previousMonths) {
        totalUsedPrevious += (prevMonth.usedQuota || 0);
        
        // Clear daily quotas for completed months
        await DailyQuota.updateMany(
            {
                subscriptionId: subscription._id,
                date: { $regex: `^${prevMonth.month}` },
                remainingQuota: { $gt: 0 }
            },
            { $set: { remainingQuota: 0 } }
        );
        
        // Mark month as closed
        if (prevMonth.remainingQuota > 0) {
            prevMonth.remainingQuota = 0;
            await prevMonth.save();
        }
    }
    
    // Carry-forward = Total allocated - Total used
    const carryForward = Math.max(0, totalAllocatedPrevious - totalUsedPrevious);
    
    return carryForward;
}

/**
 * Close previous month: unused monthly quota becomes carry-forward.
 * For non-yearly plans only.
 */
async function closePreviousMonth(subscription, currentMonthKey) {
    // For yearly plans, use calculateYearlyCumulativeCarryForward instead
    if (normalizePlanType(subscription.planType) === "year") {
        return calculateYearlyCumulativeCarryForward(subscription, currentMonthKey);
    }

    const now = new Date();
    const prevMonthDate = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    const prevKey = toMonthKey(prevMonthDate);

    if (prevKey >= currentMonthKey) return 0;

    const prev = await MonthlyQuota.findOne({
        subscriptionId: subscription._id,
        month: prevKey
    });

    if (!prev) {
        return 0;
    }

    await DailyQuota.updateMany(
        {
            subscriptionId: subscription._id,
            date: { $regex: `^${prevKey}` },
            remainingQuota: { $gt: 0 }
        },
        { $set: { remainingQuota: 0 } }
    );

    prev.carryForward = 0;
    prev.remainingQuota = 0;
    await prev.save();

    return 0;
}

/**
 * Get monthly allocation for yearly plan based on segment pattern
 * Months 1-3: 150 each
 * Months 4-9: 80, 70, 60, 55, 50, 45
 * Months 10-12: 30 each
 */
function getYearlyMonthAllocation(currentMonth) {
    // Segment 1: First 3 months (150 each)
    if (currentMonth >= 1 && currentMonth <= 3) {
        return 150;
    }
    
    // Segment 2: Middle 6 months (80, 70, 60, 55, 50, 45)
    if (currentMonth >= 4 && currentMonth <= 9) {
        const middleAllocations = [80, 70, 60, 55, 50, 45];
        return middleAllocations[currentMonth - 4];
    }
    
    // Segment 3: Last 3 months (30 each)
    if (currentMonth >= 10 && currentMonth <= 12) {
        return 30;
    }
    
    // Default fallback
    return YEAR_MONTHLY_BASE; // 75
}

/**
 * Year plan: 900 total, SEGMENTED monthly allocation + CUMULATIVE carry-forward.
 * 
 * MONTHLY ALLOCATION PATTERN:
 * - Months 1-3: 150 each = 450
 * - Months 4-9: 80, 70, 60, 55, 50, 45 = 360
 * - Months 10-12: 30 each = 90
 * Total: 900
 * 
 * CARRY-FORWARD RULES:
 * - Unused images from ALL previous months carry forward cumulatively
 * - Current month available = base allocation + total carry-forward
 * - Carry-forward continues until used or subscription expires
 * 
 * DAILY DISTRIBUTION (YEARLY):
 * - Uses DESCENDING distribution pattern like Monthly plan (8→6→3→2)
 * - Distributes across remaining days of the month
 * - Recalculates daily based on remaining quota and days
 * - Unused images stay in current_month_remaining
 */
async function ensureYearMonth(subscription) {
    const now = new Date();
    const todayKey = toDateKey(now);
    const monthKey = toMonthKey(now);

    let monthly = await MonthlyQuota.findOne({
        subscriptionId: subscription._id,
        month: monthKey
    });

    if (!monthly) {
        // Calculate CUMULATIVE carry-forward from ALL previous months
        const cumulativeCarryForward = await calculateYearlyCumulativeCarryForward(
            subscription, 
            monthKey
        );

        // Calculate total used across all months
        const usedAcrossMonths = await MonthlyQuota.aggregate([
            { $match: { subscriptionId: subscription._id } },
            { $group: { _id: null, used: { $sum: "$usedQuota" } } }
        ]);
        const usedTotal = usedAcrossMonths[0]?.used || 0;
        const subscriptionLeft = Math.max(
            0,
            subscription.totalQuota - usedTotal
        );

        // Get current month number in subscription (1-12)
        const { getCurrentPeriod } = require("./segment-distribution.service");
        const currentMonth = getCurrentPeriod(subscription, 'month');
        
        // Get base allocation for current month (150, 80, 70, etc.)
        const baseAllocation = getYearlyMonthAllocation(currentMonth);
        
        // Current month available = base + carry-forward (capped by subscription left)
        const base = Math.min(baseAllocation, subscriptionLeft);
        const totalAvailable = Math.min(base + cumulativeCarryForward, subscriptionLeft);

        monthly = await MonthlyQuota.create({
            subscriptionId: subscription._id,
            month: monthKey,
            allocatedQuota: base,  // Store ONLY base allocation
            usedQuota: 0,
            carryForward: cumulativeCarryForward,  // Store cumulative carry-forward
            remainingQuota: totalAvailable  // Total available = base + carry-forward
        });

        subscription.carryForward = 0;
        // Force a fresh daily redistribution for this month
        subscription.currentCycle = null;
        await subscription.save();
        
        // Refresh subscription to ensure currentCycle is null
        const freshSub = await Subscription.findById(subscription._id);
        if (freshSub) {
            subscription.currentCycle = freshSub.currentCycle;
        }
    }

    // Daily pool for the year plan is the current month's remaining quota
    // Use DESCENDING distribution pattern (like Monthly plan: 8→6→3→2)
    const pool = Math.max(0, monthly.remainingQuota || 0);
    
    if (pool === 0) {
        // No images left, return null or create empty quota
        return null;
    }
    
    return redistributeOnNewDay(subscription, pool, todayKey, now);
}

async function refreshDailyQuota(subscription) {
    if (await isExpired(subscription)) {
        await markExpired(subscription);
        return null;
    }

    if (normalizePlanType(subscription.planType) === "year") {
        await ensureYearMonth(subscription);
    } else {
        await ensureWeekOrMonthDays(subscription);
    }

    return getTodayQuota(subscription);
}

async function refreshMonthlyQuota(subscription) {
    if (normalizePlanType(subscription.planType) !== "year") {
        return null;
    }
    return ensureYearMonth(subscription);
}

/**
 * Legacy helper — unused past daily remaining → remaining days.
 * Kept for callers; new-day path uses redistributeOnNewDay instead.
 */
async function carryForwardQuota(subscription, todayKey) {
    const pastDocs = await DailyQuota.find({
        subscriptionId: subscription._id,
        date: { $lt: todayKey },
        remainingQuota: { $gt: 0 }
    }).select("_id remainingQuota");

    if (!pastDocs.length) {
        return 0;
    }

    const carried = pastDocs.reduce((sum, d) => sum + d.remainingQuota, 0);
    await DailyQuota.updateMany(
        { _id: { $in: pastDocs.map((d) => d._id) } },
        { $set: { remainingQuota: 0 } }
    );

    // Force redistribution on next refresh by clearing the day marker.
    if (subscription.currentCycle === todayKey) {
        subscription.currentCycle = null;
    }
    subscription.carryForward = (subscription.carryForward || 0) + carried;
    await subscription.save();

    // Re-run plan refresh so remaining days pick up the pool.
    const fresh = await Subscription.findById(subscription._id);
    if (fresh) {
        if (normalizePlanType(fresh.planType) === "year") {
            // Fold carried into monthly remaining if month exists.
            const monthKey = toMonthKey(new Date());
            await MonthlyQuota.findOneAndUpdate(
                { subscriptionId: fresh._id, month: monthKey },
                { $inc: { remainingQuota: carried, allocatedQuota: carried } }
            );
            fresh.carryForward = 0;
            await fresh.save();
            await ensureYearMonth(fresh);
        } else {
            // Week/month: remainingQuota on subscription already includes
            // unused (only consume decrements it). Just clear cycle + refresh.
            fresh.carryForward = 0;
            await fresh.save();
            await ensureWeekOrMonthDays(fresh);
        }
    }

    return carried;
}

async function getTodayQuota(subscription, now = new Date()) {
    const todayKey = toDateKey(now);
    return DailyQuota.findOne({
        subscriptionId: subscription._id,
        date: todayKey
    }).lean();
}

/**
 * Atomically consume 1 image from today's quota.
 */
async function consumeQuota(subscription) {
    if (await isExpired(subscription)) {
        await markExpired(subscription);
        throw new Error("Subscription expired. Please renew to continue.");
    }

    await refreshDailyQuota(subscription);

    const todayKey = toDateKey(new Date());

    const daily = await DailyQuota.findOneAndUpdate(
        {
            subscriptionId: subscription._id,
            date: todayKey,
            remainingQuota: { $gt: 0 }
        },
        {
            $inc: { usedQuota: 1, remainingQuota: -1 }
        },
        { new: true }
    );

    if (!daily) {
        throw new Error("Daily generation limit exceeded. Try again tomorrow.");
    }

    const updatedSub = await Subscription.findOneAndUpdate(
        {
            _id: subscription._id,
            remainingQuota: { $gt: 0 },
            status: "active"
        },
        {
            $inc: { remainingQuota: -1 }
        },
        { new: true }
    );

    if (!updatedSub) {
        await DailyQuota.findOneAndUpdate(
            { _id: daily._id, usedQuota: { $gt: 0 } },
            { $inc: { usedQuota: -1, remainingQuota: 1 } }
        );
        throw new Error("Subscription quota exhausted.");
    }

    if (normalizePlanType(subscription.planType) === "year") {
        const monthKey = toMonthKey(new Date());
        await MonthlyQuota.findOneAndUpdate(
            {
                subscriptionId: subscription._id,
                month: monthKey,
                remainingQuota: { $gt: 0 }
            },
            {
                $inc: { usedQuota: 1, remainingQuota: -1 }
            }
        );
    }

    return daily;
}

function getSubscriptionDayMetadata(subscription) {
    if (!subscription?.purchaseDate || !subscription?.expiryDate) {
        return {
            total_days: null,
            current_day: null
        };
    }

    const purchase = startOfUtcDay(subscription.purchaseDate);
    const expiry = startOfUtcDay(subscription.expiryDate);
    const today = startOfUtcDay(new Date());
    const lastAccessibleDay = addUtcDays(expiry, -1);

    const totalDays = Math.max(
        1,
        Math.floor((lastAccessibleDay.getTime() - purchase.getTime()) / 86400000) + 1
    );

    const currentDay = Math.max(
        1,
        Math.min(
            totalDays,
            Math.floor((today.getTime() - purchase.getTime()) / 86400000) + 1
        )
    );

    return {
        total_days: totalDays,
        current_day: currentDay
    };
}

/**
 * For Year plan, calculate which month of subscription is currently active
 * Returns: current_month (1-12), total_months
 */
function getSubscriptionMonthMetadata(subscription) {
    if (!subscription?.purchaseDate || !subscription?.expiryDate) {
        return {
            total_months: null,
            current_month: null
        };
    }

    const purchase = startOfUtcDay(subscription.purchaseDate);
    const expiry = startOfUtcDay(subscription.expiryDate);
    const today = startOfUtcDay(new Date());

    // Calculate total months in subscription
    const purchaseDate = new Date(purchase);
    const expiryDate = new Date(expiry);
    
    const yearDiff = expiryDate.getUTCFullYear() - purchaseDate.getUTCFullYear();
    const monthDiff = expiryDate.getUTCMonth() - purchaseDate.getUTCMonth();
    const totalMonths = Math.max(1, yearDiff * 12 + monthDiff + 1);

    // Calculate current month
    const todayDate = new Date(today);
    const currentYearDiff = todayDate.getUTCFullYear() - purchaseDate.getUTCFullYear();
    const currentMonthDiff = todayDate.getUTCMonth() - purchaseDate.getUTCMonth();
    const currentMonth = Math.max(
        1,
        Math.min(totalMonths, currentYearDiff * 12 + currentMonthDiff + 1)
    );

    return {
        total_months: totalMonths,
        current_month: currentMonth
    };
}

async function getRemainingQuota(subscription) {
    if (!subscription) {
        return {
            totalQuota: 0,
            remainingQuota: 0,
            todayRemaining: 0,
            todayAllocated: 0,
            todayUsed: 0,
            expired: true,
            ...getSubscriptionDayMetadata(subscription)
        };
    }

    if (await isExpired(subscription)) {
        await markExpired(subscription);
        return {
            totalQuota: subscription.totalQuota,
            remainingQuota: 0,
            todayRemaining: 0,
            todayAllocated: 0,
            todayUsed: 0,
            expired: true,
            planType: subscription.planType,
            purchaseId: subscription.purchaseId,
            purchaseDate: subscription.purchaseDate,
            expiryDate: subscription.expiryDate,
            ...getSubscriptionDayMetadata(subscription)
        };
    }

    await refreshDailyQuota(subscription);
    const today = await getTodayQuota(subscription);
    const fresh = await Subscription.findById(subscription._id).lean();

    const result = {
        totalQuota: fresh.totalQuota,
        remainingQuota: fresh.remainingQuota,
        todayRemaining: today?.remainingQuota ?? 0,
        todayAllocated: today?.allocatedQuota ?? 0,
        todayUsed: today?.usedQuota ?? 0,
        expired: false,
        planType: fresh.planType,
        purchaseId: fresh.purchaseId,
        purchaseDate: fresh.purchaseDate,
        status: fresh.status,
        expiryDate: fresh.expiryDate,
        carryForward: fresh.carryForward,
        ...getSubscriptionDayMetadata(fresh)
    };

    // For Year plan, add monthly quota information with cumulative carry-forward
    if (normalizePlanType(fresh.planType) === "year") {
        const monthKey = toMonthKey(new Date());
        const monthlyQuota = await MonthlyQuota.findOne({
            subscriptionId: fresh._id,
            month: monthKey
        }).lean();

        if (monthlyQuota) {
            const allocated = monthlyQuota.allocatedQuota || 0;
            const carryForward = monthlyQuota.carryForward || 0;
            const used = monthlyQuota.usedQuota || 0;
            const remaining = monthlyQuota.remainingQuota || 0;
            
            result.current_month_allocated = allocated;  // Base allocation for this month
            result.current_month_carry_forward = carryForward;  // Cumulative from previous months
            result.current_month_available = allocated + carryForward;  // Total available
            result.current_month_used = used;
            result.current_month_remaining = remaining;  // What's left (available - used)
        }

        // Add month metadata
        const monthMetadata = getSubscriptionMonthMetadata(fresh);
        result.total_months = monthMetadata.total_months;
        result.current_month = monthMetadata.current_month;
    }

    return result;
}

module.exports = {
    PLAN_TOTALS,
    YEAR_MONTHLY_BASE,
    MIN_LAST_DAY: DEFAULT_DAILY_PROFILE.minPerDay,
    MIN_PER_DAY: DEFAULT_DAILY_PROFILE.minPerDay,
    getPlanTotal,
    isExpired,
    markExpired,
    generateDistribution,
    writeDailyDistribution,
    carryForwardQuota,
    refreshDailyQuota,
    refreshMonthlyQuota,
    getTodayQuota,
    consumeQuota,
    getRemainingQuota,
    getRemainingDateKeys
};
