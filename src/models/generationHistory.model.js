const mongoose = require("mongoose");

const GENERATION_STATUSES = ["success", "failed", "pending"];
const PLATFORMS = ["android", "ios"];

const generationHistorySchema = new mongoose.Schema(
    {
        device_id: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        user_id: {
            type: String,
            trim: true
        },
        uploaded_image: {
            type: String,
            trim: true
        },
        generated_image: {
            type: String,
            trim: true
        },
        original_filename: {
            type: String,
            trim: true
        },
        hairstyle: {
            type: String,
            trim: true
        },
        hair_color: {
            type: String,
            trim: true,
            lowercase: true
        },
        category: {
            type: String,
            trim: true
        },
        sub_category: {
            type: String,
            trim: true
        },
        prompt: {
            type: String,
            trim: true
        },
        provider: {
            type: String,
            trim: true,
            default: "ailab"
        },
        generation_status: {
            type: String,
            enum: GENERATION_STATUSES,
            default: "success",
            index: true
        },
        processing_time: {
            type: Number,
            min: 0
        },
        request_ip: {
            type: String,
            trim: true
        },
        user_agent: {
            type: String,
            trim: true
        },
        error_message: {
            type: String,
            trim: true
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
        is_premium: {
            type: Boolean
        }
    },
    {
        timestamps: true
    }
);

generationHistorySchema.index({ device_id: 1, createdAt: -1 });
generationHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model("GenerationHistory", generationHistorySchema);
