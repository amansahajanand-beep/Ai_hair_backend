const mongoose = require("mongoose");

/**
 * One document per device, created the first time the device is seen.
 * `first_seen_date` (YYYY-MM-DD in QUOTA_TIMEZONE) anchors the onboarding
 * schedule: day 1 is that date, day 2 the next, and so on.
 *
 * `legacy` devices were already using the API before the onboarding schedule
 * existed; they keep the flat DAILY_API_QUOTA and are never treated as new.
 */
const deviceSchema = new mongoose.Schema(
    {
        device_id: { type: String, required: true, trim: true },
        country: { type: String, trim: true, uppercase: true, default: null },
        first_seen_date: {
            type: String,
            required: true,
            match: /^\d{4}-\d{2}-\d{2}$/
        },
        legacy: { type: Boolean, default: false }
    },
    { timestamps: true }
);

deviceSchema.index({ device_id: 1 }, { unique: true });
deviceSchema.index({ country: 1, first_seen_date: -1 });
deviceSchema.index({ first_seen_date: -1 });

module.exports = mongoose.model("Device", deviceSchema);
