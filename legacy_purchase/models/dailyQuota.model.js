const mongoose = require("mongoose");

const dailyQuotaSchema = new mongoose.Schema(
    {
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subscription",
            required: true,
            index: true
        },
        date: {
            type: String,
            required: true,
            trim: true,
            match: /^\d{4}-\d{2}-\d{2}$/
        },
        allocatedQuota: {
            type: Number,
            required: true,
            min: 0
        },
        usedQuota: {
            type: Number,
            default: 0,
            min: 0
        },
        remainingQuota: {
            type: Number,
            required: true,
            min: 0
        }
    },
    {
        timestamps: true
    }
);

dailyQuotaSchema.index({ subscriptionId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("DailyQuota", dailyQuotaSchema);
