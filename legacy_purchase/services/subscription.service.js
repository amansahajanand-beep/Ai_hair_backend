const Subscription = require("../../models/subscription.model");
const quotaService = require("./quota.service");
const { toUtcDate, isExpired: isDateExpired } = require("./date.util");

/**
 * Parse purchase fields from the hairstyle request body.
 * Accepts camelCase or snake_case. Returns null if none present.
 */
function normalizePlanType(planType) {
    const raw = String(planType || "")
        .trim()
        .toLowerCase();

    if (!raw) return raw;
    if (raw === "weekly") return "week";
    if (raw === "monthly" || raw === "month") return "month";
    if (raw === "yearly") return "year";
    if (raw === "month75" || raw === "monthly75" || raw === "month-75" || raw === "monthly-75") return "month75";
    if (raw === "month150" || raw === "monthly150" || raw === "month-150" || raw === "monthly-150") return "month150";
    return raw;
}

function parsePurchasePayload(body = {}) {
    const purchaseId = (
        body.purchase_id ||
        body.purchaseId ||
        ""
    )
        .toString()
        .trim();

    const planType = normalizePlanType(
        body.plan_type ||
        body.planType ||
        ""
    );

    const purchaseDateRaw = body.purchase_date || body.purchaseDate;
    const expiryDateRaw = body.expiry_date || body.expiryDate;

    const hasAny =
        purchaseId ||
        planType ||
        purchaseDateRaw ||
        expiryDateRaw;

    if (!hasAny) return null;

    if (!purchaseId) {
        throw new Error("purchase_id is required for premium subscription");
    }
    if (!planType) {
        throw new Error("plan_type is required for premium subscription");
    }
    if (!["week", "month", "month75", "month150", "year"].includes(planType)) {
        throw new Error('plan_type must be "week", "month", "month75", "month150", or "year"');
    }
    if (!purchaseDateRaw) {
        throw new Error("purchase_date is required for premium subscription");
    }
    if (!expiryDateRaw) {
        throw new Error("expiry_date is required for premium subscription");
    }

    const purchaseDate = toUtcDate(purchaseDateRaw);
    const expiryDate = toUtcDate(expiryDateRaw);

    if (expiryDate.getTime() <= purchaseDate.getTime()) {
        throw new Error("expiry_date must be after purchase_date");
    }

    return {
        purchaseId,
        planType,
        purchaseDate,
        expiryDate
    };
}

function extractSubscriptionPayloads(body = {}) {
    // Check for new format: purchase_id at top level with plans array
    const topLevelPurchaseId = body.purchase_id || body.purchaseId;
    const plansArray = body.plans || body.plan_details;
    
    if (topLevelPurchaseId && Array.isArray(plansArray)) {
        // NEW FORMAT: Single purchase_id with multiple plans
        return plansArray
            .map((plan) => {
                // Merge top-level purchase_id with each plan
                return parsePurchasePayload({
                    purchase_id: topLevelPurchaseId,
                    plan_type: plan.plan_type || plan.planType,
                    purchase_date: plan.purchase_date || plan.purchaseDate,
                    expiry_date: plan.expiry_date || plan.expiryDate
                });
            })
            .filter(Boolean);
    }
    
    // OLD FORMAT: Array of subscriptions (each with own purchase_id)
    const nestedInput =
        body.subscriptions ||
        body.subscription_details ||
        body.subscriptionDetails ||
        body.purchases ||
        body.purchase_details;

    if (Array.isArray(nestedInput)) {
        return nestedInput
            .map((item) => parsePurchasePayload(item || {}))
            .filter(Boolean);
    }

    // SINGLE SUBSCRIPTION: Top-level fields
    const single = parsePurchasePayload(body);
    return single ? [single] : [];
}

/**
 * Create or reuse a subscription from a purchase payload.
 * SINGLE ACTIVE SUBSCRIPTION MODEL with PENDING QUEUE:
 * - Only ONE subscription can be active at a time
 * - New subscriptions become "pending" if an active subscription exists
 * - Pending subscriptions auto-activate when current active expires
 * - Validity period starts when subscription becomes active
 */
async function createSubscription(userId, purchase) {
    if (!userId) {
        throw new Error("device_id is required");
    }
    if (!purchase) {
        throw new Error("purchase details are required");
    }

    const Usage = require("../../models/usage.model");

    // Check if this exact combination already exists (userId + purchaseId + planType)
    const existingByPurchase = await Subscription.findOne({
        userId,
        purchaseId: purchase.purchaseId,
        planType: purchase.planType
    });

    if (existingByPurchase) {
        const dateChanged =
            existingByPurchase.purchaseDate?.getTime() !== purchase.purchaseDate.getTime() ||
            existingByPurchase.expiryDate?.getTime() !== purchase.expiryDate.getTime();

        if (dateChanged) {
            const totalQuota = quotaService.getPlanTotal(purchase.planType);

            existingByPurchase.purchaseDate = purchase.purchaseDate;
            existingByPurchase.expiryDate = purchase.expiryDate;
            existingByPurchase.totalQuota = totalQuota;
            existingByPurchase.remainingQuota =
                existingByPurchase.status === "active"
                    ? totalQuota
                    : 0;
            existingByPurchase.carryForward = 0;
            existingByPurchase.currentCycle = undefined;

            await existingByPurchase.save();

            // Keep the user purchase marker in sync for free-limit behavior.
            const Usage = require("../../models/usage.model");
            await Usage.findOneAndUpdate(
                { device_id: userId },
                {
                    $set: {
                        has_purchased_subscription: true,
                        free_limit: 0,
                        remaining_count: 0
                    }
                },
                { upsert: true }
            );

            if (existingByPurchase.status === "active") {
                await quotaService.refreshDailyQuota(existingByPurchase);
            }

            return existingByPurchase;
        }

        // Same purchase + plan combination found and dates are unchanged.
        // Check if expired
        if (
            existingByPurchase.status === "expired" ||
            isDateExpired(existingByPurchase.expiryDate)
        ) {
            await quotaService.markExpired(existingByPurchase);
            // Return expired subscription with complete details
            return existingByPurchase;
        }

        // Return existing subscription as-is (preserve its status)
        return existingByPurchase;
    }

    // NEW SUBSCRIPTION: Check if user already has an active subscription
    const activeSubscription = await Subscription.findOne({
        userId,
        status: "active"
    }).sort({ createdAt: -1 });

    // Determine status: active if no active subscription exists, otherwise pending
    const status = activeSubscription ? "pending" : "active";
    const activatedAt = status === "active" ? new Date() : null;

    // Calculate queue position for pending subscriptions
    let queuePosition = 0;
    if (status === "pending") {
        const pendingCount = await Subscription.countDocuments({
            userId,
            status: "pending"
        });
        queuePosition = pendingCount + 1; // 1-indexed (active is 0)
    }

    if (isDateExpired(purchase.expiryDate) && status === "active") {
        throw new Error("Subscription expired. Please renew to continue.");
    }

    const totalQuota = quotaService.getPlanTotal(purchase.planType);

    const subscription = await Subscription.create({
        userId,
        purchaseId: purchase.purchaseId,
        planType: purchase.planType,
        purchaseDate: purchase.purchaseDate,
        expiryDate: purchase.expiryDate,
        status,
        activatedAt,
        queuePosition,
        totalQuota,
        remainingQuota: status === "active" ? totalQuota : 0, // Pending subs have 0 quota
        carryForward: 0,
        // Set by quota refresh on first use (YYYY-MM-DD of last daily redistribute).
        currentCycle: undefined
    });

    // Mark user as having purchased a subscription (for free limit = 0 logic)
    // This happens even for pending subscriptions
    await Usage.findOneAndUpdate(
        { device_id: userId },
        { 
            $set: { 
                has_purchased_subscription: true,
                free_limit: 0,
                remaining_count: 0
            } 
        },
        { upsert: true }
    );

    // Only refresh quota for active subscriptions
    if (status === "active") {
        await quotaService.refreshDailyQuota(subscription);
    }

    return subscription;
}

async function findActiveSubscriptionsByDeviceId(deviceId) {
    if (!deviceId) return [];

    // SINGLE ACTIVE SUBSCRIPTION: Return only the one active subscription
    const subscription = await Subscription.findOne({
        userId: deviceId,
        status: "active"
    })
        .sort({ createdAt: -1 });

    return subscription ? [subscription] : [];
}

async function findPendingSubscriptionsByDeviceId(deviceId) {
    if (!deviceId) return [];

    // Return all pending subscriptions for this user, sorted by queue position
    const subscriptions = await Subscription.find({
        userId: deviceId,
        status: "pending"
    })
        .sort({ queuePosition: 1, createdAt: 1 });

    return subscriptions;
}

async function findAllSubscriptionsByDeviceId(deviceId) {
    if (!deviceId) return { active: null, pending: [], expired: [] };

    const active = await Subscription.findOne({
        userId: deviceId,
        status: "active"
    }).sort({ createdAt: -1 });

    const pending = await Subscription.find({
        userId: deviceId,
        status: "pending"
    }).sort({ queuePosition: 1, createdAt: 1 });

    const expired = await Subscription.find({
        userId: deviceId,
        status: "expired"
    }).sort({ expiryDate: -1 }).limit(5); // Last 5 expired

    return { active, pending, expired };
}

async function findActiveByDeviceId(deviceId) {
    const subscriptions = await findActiveSubscriptionsByDeviceId(deviceId);
    return subscriptions[0] || null;
}

async function findByPurchaseId(purchaseId) {
    if (!purchaseId) return null;

    return Subscription.findOne({ purchaseId: purchaseId.toString().trim() });
}

/**
 * Create or update multiple subscriptions for the user.
 * MULTIPLE SUBSCRIPTIONS: Processes all subscription payloads.
 * Each unique combination of purchaseId + planType is created/updated.
 */
async function createOrUpdateSubscriptions(userId, purchases = []) {
    const payloads = Array.isArray(purchases) ? purchases : [purchases];
    const validPayloads = payloads
        .map((purchase) => parsePurchasePayload(purchase || {}))
        .filter(Boolean);

    const createdSubscriptions = [];
    const errors = [];

    for (const purchase of validPayloads) {
        try {
            const subscription = await createSubscription(userId, purchase);
            createdSubscriptions.push(subscription);
        } catch (error) {
            errors.push(error.message);
        }
    }

    if (!createdSubscriptions.length && errors.length) {
        throw new Error(errors.join("; "));
    }

    return {
        subscriptions: createdSubscriptions,
        errors
    };
}

async function resolveForGeneration(deviceId, body = {}) {
    const payloads = extractSubscriptionPayloads(body);

    if (payloads.length > 0) {
        const { subscriptions } = await createOrUpdateSubscriptions(
            deviceId,
            payloads
        );
        return subscriptions[0] || null;
    }

    const active = await findActiveByDeviceId(deviceId);
    if (!active) {
        throw new Error(
            "No active subscription found. Purchase details are required."
        );
    }

    await quotaService.refreshDailyQuota(active);
    return active;
}

/**
 * Activate the next pending subscription for a user.
 * Called when the current active subscription expires.
 * Updates validity period to start from activation time.
 */
async function activateNextPendingSubscription(userId) {
    if (!userId) return null;

    // Get the next pending subscription (lowest queue position)
    const nextPending = await Subscription.findOne({
        userId,
        status: "pending"
    }).sort({ queuePosition: 1, createdAt: 1 });

    if (!nextPending) {
        return null; // No pending subscriptions
    }

    // Calculate new validity period starting from now
    const now = new Date();
    const planDuration = getPlanDurationInMs(nextPending.planType);
    const newExpiryDate = new Date(now.getTime() + planDuration);

    // Activate the subscription
    nextPending.status = "active";
    nextPending.activatedAt = now;
    nextPending.purchaseDate = now; // Start validity from activation
    nextPending.expiryDate = newExpiryDate;
    nextPending.queuePosition = 0;
    nextPending.remainingQuota = nextPending.totalQuota;
    nextPending.carryForward = 0;
    nextPending.currentCycle = undefined;

    await nextPending.save();

    // Update queue positions for remaining pending subscriptions
    await Subscription.updateMany(
        {
            userId,
            status: "pending",
            _id: { $ne: nextPending._id }
        },
        { $inc: { queuePosition: -1 } }
    );

    // Initialize quota for newly activated subscription
    await quotaService.refreshDailyQuota(nextPending);

    return nextPending;
}

/**
 * Get plan duration in milliseconds
 */
function getPlanDurationInMs(planType) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    
    switch (normalizePlanType(planType)) {
        case "week":
            return 7 * DAY_MS;
        case "month":
        case "month75":
        case "month150":
            return 30 * DAY_MS;
        case "year":
            return 365 * DAY_MS;
        default:
            return 30 * DAY_MS;
    }
}

/**
 * Synchronize subscriptions - treat check API as source of truth
 * Deletes subscriptions not in the request and recalculates active/pending based on timeline
 * 
 * @param {string} userId - User ID
 * @param {Array} requestedSubscriptions - Subscriptions from the API request
 * @returns {Object} - { deleted: [], active: subscription, pending: [] }
 */
async function synchronizeSubscriptions(userId, requestedSubscriptions) {
    if (!userId) {
        throw new Error("userId is required for synchronization");
    }

    // Get all existing non-expired subscriptions from database
    const existingSubscriptions = await Subscription.find({
        userId,
        status: { $in: ["active", "pending"] }
    });

    // Build a set of requested subscription identifiers (purchaseId + planType)
    const requestedIds = new Set();
    for (const sub of requestedSubscriptions) {
        if (sub && sub.purchaseId && sub.planType) {
            requestedIds.add(`${sub.purchaseId}-${sub.planType}`);
        }
    }

    // Identify subscriptions that exist in DB but NOT in request (should be deleted)
    const subscriptionsToDelete = existingSubscriptions.filter(sub => {
        const key = `${sub.purchaseId}-${sub.planType}`;
        return !requestedIds.has(key);
    });

    // Delete missing subscriptions
    const deletedIds = [];
    for (const sub of subscriptionsToDelete) {
        console.log(`[Sync] Deleting subscription ${sub._id} (${sub.planType}) - not in request`);
        await Subscription.deleteOne({ _id: sub._id });
        deletedIds.push(sub._id);
    }

    // Get remaining subscriptions after deletion
    const remainingSubscriptions = await Subscription.find({
        userId,
        status: { $in: ["active", "pending"] }
    }).sort({ purchaseDate: 1, createdAt: 1 }); // Sort by purchase date (earliest first)

    if (remainingSubscriptions.length === 0) {
        return { deleted: deletedIds, active: null, pending: [] };
    }

    // Recalculate active/pending based on TIMELINE (purchase_date order)
    // The subscription with earliest purchase_date should be active
    const now = new Date();
    let activeSubscription = null;
    const pendingSubscriptions = [];

    for (let i = 0; i < remainingSubscriptions.length; i++) {
        const sub = remainingSubscriptions[i];
        
        // Check if expired
        if (await quotaService.isExpired(sub)) {
            await quotaService.markExpired(sub);
            continue; // Skip expired
        }

        if (i === 0) {
            // First subscription (earliest purchase_date) should be active
            if (sub.status !== "active") {
                sub.status = "active";
                sub.queuePosition = 0;
                sub.activatedAt = sub.activatedAt || now;
                sub.remainingQuota = sub.remainingQuota > 0 ? sub.remainingQuota : sub.totalQuota;
                await sub.save();
                await quotaService.refreshDailyQuota(sub);
            }
            activeSubscription = sub;
        } else {
            // Rest should be pending
            if (sub.status !== "pending") {
                sub.status = "pending";
                sub.remainingQuota = 0; // Pending subs have no quota
            }
            sub.queuePosition = i; // Position in queue
            await sub.save();
            pendingSubscriptions.push(sub);
        }
    }

    console.log(`[Sync] Synchronized subscriptions for user ${userId}:`);
    console.log(`  - Deleted: ${deletedIds.length}`);
    console.log(`  - Active: ${activeSubscription ? activeSubscription.planType : 'none'}`);
    console.log(`  - Pending: ${pendingSubscriptions.length}`);

    return {
        deleted: deletedIds,
        active: activeSubscription,
        pending: pendingSubscriptions
    };
}

module.exports = {
    parsePurchasePayload,
    extractSubscriptionPayloads,
    createOrUpdateSubscriptions,
    createSubscription,
    findActiveSubscriptionsByDeviceId,
    findPendingSubscriptionsByDeviceId,
    findAllSubscriptionsByDeviceId,
    findActiveByDeviceId,
    findByPurchaseId,
    resolveForGeneration,
    activateNextPendingSubscription,
    synchronizeSubscriptions
};
