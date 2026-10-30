const usageService = require("../../services/hairstyle-api/usage.service");
const entitlementService = require("../../services/hairstyle-api/entitlement.service");

/**
 * Check the device's remaining daily generation quota.
 * Read-only: calling this never consumes quota.
 *
 * Request:  { "device_id": "string" }
 *
 * Response keys are kept compatible with the previous free-limit API
 * (free_limit / used / remaining / expired / total_available_images /
 * image_generation / message); `free_limit` is now DAILY_API_QUOTA and
 * resets every day. Extra keys: daily_limit, date, resets_at.
 */
exports.checkFreeLimit = async (req, res) => {
    try {
        const stats = await usageService.getDailyStats(req.body?.device_id, new Date(), {
            country: entitlementService.detectCountry(req)
        });

        return res.status(200).json({
            success: true,
            data: {
                device_id: stats.device_id,
                free_limit: stats.daily_limit,
                used: stats.used,
                remaining: stats.remaining,
                expired: stats.exceeded,
                total_available_images: stats.remaining,
                image_generation: !stats.exceeded,
                subscription_expired: false,
                daily_limit: stats.daily_limit,
                unlimited: stats.unlimited,
                phase: stats.phase,
                day: stats.day,
                country: stats.country,
                date: stats.date,
                resets_at: stats.resets_at,
                message: stats.unlimited
                    ? "You have unlimited generations."
                    : stats.exceeded
                    ?`Daily limit of ${stats.daily_limit} reached. Your quota resets tomorrow.`
                    : `You have ${stats.remaining} generation${stats.remaining === 1 ? "" : "s"} remaining today.`
            }
        });
    } catch (error) {
        if (error instanceof usageService.QuotaError) {
            return res.status(error.statusCode).json({
                success: false,
                message: error.message,
                code: error.code
            });
        }

        console.error("Check limit error:", error);

        return res.status(500).json({
            success: false,
            message: "An unexpected error occurred",
            error: process.env.NODE_ENV === "development" ? error.stack : undefined
        });
    }
};
