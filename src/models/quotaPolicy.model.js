const mongoose = require("mongoose");

const MAX_SCHEDULE_DAYS = 90;
const MAX_DAY_LIMIT = 1000;

/**
 * Onboarding generation schedule for one country.
 * `country` is an ISO 3166-1 alpha-2 code, or "DEFAULT" which applies to any
 * country without its own policy.
 *
 * day_limits[0] is the limit for a new user's day 1, day_limits[1] for day 2,
 * and so on. The admin chooses how many days (1-90). An entry of null means
 * "unlimited" for that day. After the last entry the last entry keeps applying,
 * so ending the list with null makes the user unlimited from then on.
 */
const quotaPolicySchema = new mongoose.Schema(
    {
        country: {
            type: String,
            required: true,
            trim: true,
            uppercase: true,
            match: /^([A-Z]{2}|DEFAULT)$/
        },
        enabled: { type: Boolean, default: true },
        day_limits: {
            type: [
                {
                    type: Number,
                    default: null,
                    min: 0,
                    max: MAX_DAY_LIMIT,
                    validate: { validator: (v) => v === null || Number.isInteger(v), message: "must be a whole number or unlimited" }
                }
            ],
            validate: {
                validator: (v) => Array.isArray(v) && v.length >= 1 && v.length <= MAX_SCHEDULE_DAYS,
                message: `day_limits must contain between 1 and ${MAX_SCHEDULE_DAYS} values`
            }
        },
        // Daily limit once the schedule is over: a number, or null for unlimited.
        // Unset (older policies) keeps the last scheduled day's limit.
        after_limit: {
            type: Number,
            default: undefined,
            min: 0,
            max: MAX_DAY_LIMIT,
            validate: { validator: (v) => v === null || Number.isInteger(v), message: "must be a whole number or unlimited" }
        },
        updated_by: { type: String, trim: true }
    },
    { timestamps: true }
);

quotaPolicySchema.index({ country: 1 }, { unique: true });

const QuotaPolicy = mongoose.model("QuotaPolicy", quotaPolicySchema);

module.exports = QuotaPolicy;
module.exports.MAX_SCHEDULE_DAYS = MAX_SCHEDULE_DAYS;
module.exports.MAX_DAY_LIMIT = MAX_DAY_LIMIT;
