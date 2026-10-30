const mongoose = require("mongoose");

const PLATFORMS = ["android", "ios"];

const usageSchema = new mongoose.Schema(
    {
        device_id: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            index: true
        },
        free_limit: {
            type: Number,
            default: 3,
            min: 0
        },
        used_count: {
            type: Number,
            default: 0,
            min: 0
        },
        remaining_count: {
            type: Number,
            default: 3,
            min: 0
        },
        is_limit_exceeded: {
            type: Boolean,
            default: false
        },
        has_purchased_subscription: {
            type: Boolean,
            default: false,
            index: true
        },
        platform: {
            type: String,
            enum: PLATFORMS,
            trim: true,
            lowercase: true
        },
        app_version: {
            type: String,
            trim: true
        },
        first_used_at: {
            type: Date
        },
        last_used_at: {
            type: Date
        }
    },
    {
        timestamps: true
    }
);

usageSchema.index({ is_limit_exceeded: 1 });
usageSchema.index({ last_used_at: -1 });

module.exports = mongoose.model("Usage", usageSchema);
