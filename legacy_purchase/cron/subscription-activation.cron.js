/**
 * Cron Job for Subscription Activation
 * 
 * Runs periodically to check and activate pending subscriptions when active ones expire.
 * 
 * Usage:
 * 1. Install node-cron: npm install node-cron
 * 2. Import and initialize in your main server file (app.js or server.js)
 * 3. The cron will run automatically
 */

const cron = require('node-cron');
const activationService = require('../services/hairstyle-api/subscription-activation.service');

/**
 * Initialize the subscription activation cron job
 * Runs every hour at minute 0
 */
function initializeSubscriptionActivationCron() {
    // Run every hour
    cron.schedule('0 * * * *', async () => {
        console.log('[CRON] Running subscription activation check...');
        
        try {
            const result = await activationService.checkAndActivatePendingSubscriptions();
            console.log(`[CRON] Subscription activation completed. Checked: ${result.checked}, Activated: ${result.activated}`);
        } catch (error) {
            console.error('[CRON] Subscription activation failed:', error);
        }
    });

    console.log('[CRON] Subscription activation cron job initialized (runs every hour)');
}

/**
 * Run activation check immediately (for testing)
 */
async function runActivationCheckNow() {
    console.log('[CRON] Running immediate subscription activation check...');
    
    try {
        const result = await activationService.checkAndActivatePendingSubscriptions();
        console.log(`[CRON] Immediate check completed. Checked: ${result.checked}, Activated: ${result.activated}`);
        return result;
    } catch (error) {
        console.error('[CRON] Immediate check failed:', error);
        throw error;
    }
}

module.exports = {
    initializeSubscriptionActivationCron,
    runActivationCheckNow
};
