const mongoose = require("mongoose");

/**
 * One document per device per quota day.
 * `date` is YYYY-MM-DD in QUOTA_TIMEZONE, so a new day simply means a new
 * document - no reset job is needed.
 */
const dailyApiUsageSchema = new mongoose.Schema(
    {
        device_id: {
            type: String,
            required: true,
            trim: true
        },
        date: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/
        },
        used_count: {
            type: Number,
            default: 0,
            min: 0
        },
        // Lets MongoDB delete old days automatically (see index below).
        createdAt: {
            type: Date,
            default: Date.now
        }
    },
    {
        timestamps: { createdAt: false, updatedAt: true }
    }
);

// Race-safety relies on this: only one document can exist per device per day.
dailyApiUsageSchema.index({ device_id: 1, date: 1 }, { unique: true });

// Old daily counters are not needed; clean up after 35 days.
dailyApiUsageSchema.index({ createdAt: 1 }, { expireAfterSeconds: 35 * 24 * 60 * 60 });

module.exports = mongoose.model("DailyApiUsage", dailyApiUsageSchema);
