const mongoose = require("mongoose");

const PLAN_TYPES = ["week", "month", "month75", "month150", "year"];
const STATUSES = ["active", "pending", "expired"];

const subscriptionSchema = new mongoose.Schema(
    {
        userId: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        purchaseId: {
            type: String,
            required: true,
            trim: true,
            index: true
            // Note: Unique constraint is now compound (userId + purchaseId + planType)
        },
        planType: {
            type: String,
            required: true,
            enum: PLAN_TYPES,
            lowercase: true,
            trim: true
        },
        purchaseDate: {
            type: Date,
            required: true
        },
        expiryDate: {
            type: Date,
            required: true
        },
        status: {
            type: String,
            enum: STATUSES,
            default: "active",
            index: true
        },
        activatedAt: {
            type: Date,
            // Set when subscription becomes active (for pending subscriptions)
        },
        queuePosition: {
            type: Number,
            // Position in pending queue (0 = active, 1 = next, 2 = after that, etc.)
            default: 0
        },
        totalQuota: {
            type: Number,
            required: true,
            min: 0
        },
        remainingQuota: {
            type: Number,
            required: true,
            min: 0
        },
        carryForward: {
            type: Number,
            default: 0,
            min: 0
        },
        currentCycle: {
            type: String,
            trim: true
        }
    },
    {
        timestamps: true
    }
);

subscriptionSchema.index({ userId: 1, status: 1 });
subscriptionSchema.index({ expiryDate: 1 });
// Compound unique index: Same purchaseId can have multiple plan types per user
subscriptionSchema.index({ userId: 1, purchaseId: 1, planType: 1 }, { unique: true });

module.exports = mongoose.model("Subscription", subscriptionSchema);
module.exports.PLAN_TYPES = PLAN_TYPES;
module.exports.STATUSES = STATUSES;
