const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const API_KEY = require("../../config/hairstyle-api/api");
const beardService = require("./beard.service.js");
const usageService = require("./usage.service");
const entitlementService = require("./entitlement.service");
const generationHistoryService = require("./generationHistory.service");

/**
 * Daily quota flow (see usage.service.js):
 * 1. Validate the request (no quota is charged for invalid requests).
 * 2. Atomically reserve one unit of today's per-device quota.
 * 3. Generate; if generation fails the unit is released.
 *
 * Clients can call /api/check-free-limit to read the remaining quota.
 */
exports.changeHairstyle = async (req) => {

    if (!req.file) {
        throw new Error("Image is required");
    }

    const hairStyle = req.body?.hair_style?.trim();
    const color = req.body?.color?.trim();
    const beardStyle = req.body?.beard_style?.trim();
    const deviceId = req.body?.device_id; // validated (and trimmed) by usageService
    const startedAt = Date.now();

    console.log({
        hairStyle,
        color,
        beardStyle,
        deviceId
    });

    // Don't allow both requests together
    if (beardStyle && (hairStyle || color)) {
        throw new Error(
            "Please provide either hair_style + color OR beard_style."
        );
    }

    // Beard Request
    if (beardStyle) {
        return await beardService.changeBeard(req);
    }

    // Hairstyle Request
    if (!hairStyle) {
        throw new Error("hair_style is required");
    }

    if (!color) {
        throw new Error("color is required");
    }

    // Atomic daily-quota check + reservation, before generation starts.
    // Throws a QuotaError (400 invalid device_id / 429 limit reached).
    const reservation = await usageService.reserveQuota(deviceId, new Date(), {
        country: entitlementService.detectCountry(req)
    });

    // MOCK_GENERATION=true → quota runs, AILab is skipped (no API credits).
    if (process.env.MOCK_GENERATION === "true") {
        return {
            success: true,
            image: "https://via.placeholder.com/512x512.png?text=Mock+Hairstyle",
            mocked: true,
            ...usageService.quotaSummary(reservation)
        };
    }

    let generatedImage;

    try {
        const formData = new FormData();

        formData.append("image", fs.createReadStream(req.file.path));
        formData.append("hair_style", hairStyle);
        formData.append("color", color);

        console.log("Hair Style:", hairStyle);
        console.log("Color:", color);

        const response = await axios.post(
            "https://www.ailabapi.com/api/portrait/effects/hairstyle-editor-pro",
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    "ailabapi-api-key": API_KEY
                }
            }
        );

        const taskId = response.data.task_id;

        if (!taskId) {
            throw new Error(
                response.data.error_msg || "Task ID not received"
            );
        }

        console.log("Task ID:", taskId);

        let result;

        while (true) {

            const taskResponse = await axios.get(
                `https://www.ailabapi.com/api/common/query-async-task-result?task_id=${taskId}`,
                {
                    headers: {
                        "ailabapi-api-key": API_KEY
                    }
                }
            );

            result = taskResponse.data;

            console.log(result);

            if (result.task_status === 2) {
                break;
            }

            if (result.task_status === 3) {
                throw new Error("Image Generation Failed");
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        generatedImage = result.data.images[0];

    } catch (error) {
        // Failed generations are not charged.
        await usageService.releaseQuota(reservation);
        throw error;
    }

    generationHistoryService.recordGenerationHistory(req, {
        generated_image: generatedImage,
        hairstyle: hairStyle,
        hair_color: color,
        provider: "ailab",
        generation_status: "success",
        processing_time: Date.now() - startedAt
    });

    return {
        success: true,
        image: generatedImage,
        ...usageService.quotaSummary(reservation)
    };

};
