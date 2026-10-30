const mongoose = require("mongoose");

const monthlyQuotaSchema = new mongoose.Schema(
    {
        subscriptionId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Subscription",
            required: true,
            index: true
        },
        month: {
            type: String,
            required: true,
            trim: true,
            match: /^\d{4}-\d{2}$/
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
        carryForward: {
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

monthlyQuotaSchema.index({ subscriptionId: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("MonthlyQuota", monthlyQuotaSchema);
