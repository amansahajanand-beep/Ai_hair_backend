const GenerationHistory = require("../../models/generationHistory.model");
const { extractDeviceMetadata } = require("./usage.service");

/**
 * Persists a generation record without affecting the API response.
 * Failures are logged and never propagated to the caller.
 */
function recordGenerationHistory(req, payload = {}) {
    const metadata = extractDeviceMetadata(req.body || {});
    const record = {
        device_id: req.body?.device_id?.trim(),
        user_id: req.body?.user_id?.trim() || undefined,
        uploaded_image: req.file?.path || undefined,
        generated_image: payload.generated_image || undefined,
        original_filename: req.file?.originalname || undefined,
        hairstyle: payload.hairstyle || undefined,
        hair_color: payload.hair_color || undefined,
        category: payload.category || undefined,
        sub_category: payload.sub_category || undefined,
        prompt: payload.prompt || undefined,
        provider: payload.provider || "ailab",
        generation_status: payload.generation_status || "success",
        processing_time: payload.processing_time,
        request_ip: req.ip || undefined,
        user_agent: req.get("user-agent") || undefined,
        error_message: payload.error_message || undefined,
        platform: metadata.platform,
        app_version: metadata.app_version,
        is_premium: payload.is_premium
    };

    GenerationHistory.create(record).catch((error) => {
        console.error("Generation history write error:", error);
    });
}

module.exports = {
    recordGenerationHistory
};
