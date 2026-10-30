/**
 * Subscription Activation Background Service
 * 
 * This service automatically activates pending subscriptions when the current active
 * subscription expires. It runs periodically to ensure timely activation.
 * 
 * Note: Primary activation happens in quotaService.markExpired(), but this provides
 * a backup mechanism in case subscriptions expire without being checked.
 */

const Subscription = require("../../models/subscription.model");
const subscriptionService = require("./subscription.service");
const quotaService = require("./quota.service");

/**
 * Check and activate expired subscriptions
 * Called periodically (e.g., every hour) via cron job
 */
async function checkAndActivatePendingSubscriptions() {
    try {
        console.log("[Subscription Activation] Checking for expired active subscriptions...");
        
        // Find all active subscriptions that have expired
        const now = new Date();
        const expiredActiveSubscriptions = await Subscription.find({
            status: "active",
            expiryDate: { $lt: now }
        });

        console.log(`[Subscription Activation] Found ${expiredActiveSubscriptions.length} expired active subscriptions`);

        let activationCount = 0;

        for (const subscription of expiredActiveSubscriptions) {
            try {
                console.log(`[Subscription Activation] Expiring subscription ${subscription._id} for user ${subscription.userId}`);
                
                // Mark as expired (this will trigger activation of next pending)
                await quotaService.markExpired(subscription);
                
                activationCount++;
            } catch (error) {
                console.error(`[Subscription Activation] Error processing subscription ${subscription._id}:`, error);
            }
        }

        console.log(`[Subscription Activation] Successfully activated ${activationCount} pending subscriptions`);
        
        return {
            checked: expiredActiveSubscriptions.length,
            activated: activationCount
        };
    } catch (error) {
        console.error("[Subscription Activation] Error in checkAndActivatePendingSubscriptions:", error);
        throw error;
    }
}

/**
 * Get pending subscription statistics
 * Useful for monitoring and debugging
 */
async function getPendingSubscriptionStats() {
    try {
        const totalPending = await Subscription.countDocuments({ status: "pending" });
        
        const pendingByPlan = await Subscription.aggregate([
            { $match: { status: "pending" } },
            { $group: { 
                _id: "$planType",
                count: { $sum: 1 }
            }}
        ]);

        return {
            total_pending: totalPending,
            by_plan_type: pendingByPlan
        };
    } catch (error) {
        console.error("[Subscription Activation] Error getting stats:", error);
        throw error;
    }
}

/**
 * Manually activate next pending subscription for a user
 * Useful for admin operations or testing
 */
async function manuallyActivateNextForUser(userId) {
    try {
        console.log(`[Subscription Activation] Manually activating next subscription for user ${userId}`);
        
        const activated = await subscriptionService.activateNextPendingSubscription(userId);
        
        if (activated) {
            console.log(`[Subscription Activation] Activated subscription ${activated._id} (${activated.planType})`);
            return activated;
        } else {
            console.log(`[Subscription Activation] No pending subscriptions found for user ${userId}`);
            return null;
        }
    } catch (error) {
        console.error(`[Subscription Activation] Error activating for user ${userId}:`, error);
        throw error;
    }
}

module.exports = {
    checkAndActivatePendingSubscriptions,
    getPendingSubscriptionStats,
    manuallyActivateNextForUser
};
