const AppSetting = require("../../models/appSetting.model");
const { getDailyQuota } = require("../../config/hairstyle-api/quota");

/**
 * Daily limit for new users whose country has no rule (and there is no
 * "All other countries" rule). Set by the admin; falls back to DAILY_API_QUOTA
 * from .env until the admin sets one.
 */
const FALLBACK_KEY = "fallback_daily_limit";

async function getFallbackLimit() {
    const doc = await AppSetting.findOne({ key: FALLBACK_KEY }).lean();

    if (doc && Number.isInteger(doc.value) && doc.value >= 0) {
        return { limit: doc.value, source: "admin" };
    }
    return { limit: getDailyQuota(), source: "env" };
}

/** @param {number|null} value  null removes the admin value (back to .env). */
async function setFallbackLimit(value, updatedBy) {
    if (value === null) {
        await AppSetting.deleteOne({ key: FALLBACK_KEY });
        return;
    }
    await AppSetting.findOneAndUpdate(
        { key: FALLBACK_KEY },
        { $set: { value, updated_by: updatedBy } },
        { upsert: true }
    );
}

module.exports = { getFallbackLimit, setFallbackLimit };
