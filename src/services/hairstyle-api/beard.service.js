const axios = require("axios");
const FormData = require("form-data");
const fs = require("fs");

const API_KEY = require("../../config/hairstyle-api/api");
const usageService = require("./usage.service");
const entitlementService = require("./entitlement.service");
const generationHistoryService = require("./generationHistory.service");

// Exact, case-sensitive beard presets accepted by the AILab endpoint.
const ALLOWED_BEARDS = [
    "FullBeardClassic", "CorporateBeard", "Garibaldi", "Verdi",
    "FullBeardTapered", "VanDyke", "Bandholz", "VanDykeRefined",
    "Goatee", "ExtendedGoatee", "Balbo", "AnchorBeardClean",
    "DucktailBeardPointed", "AnchorBeardFull", "DucktailBeardFull",
    "HeavyStubble", "ChevronMoustache", "HandlebarMoustache",
    "ImperialMoustache", "CircleBeard", "ChinStrap", "MuttonChops",
    "SoulPatch", "PetiteGoatee"
];

exports.changeBeard = async (req) => {

    if (!req.file) {
        throw new Error("Image is required");
    }

    const beard = req.body?.beard_style?.trim();
    const deviceId = req.body?.device_id; // validated (and trimmed) by usageService
    const startedAt = Date.now();

    if (!beard) {
        throw new Error("beard_style is required");
    }

    if (!ALLOWED_BEARDS.includes(beard)) {
        throw new Error(
            `Invalid beard_style "${beard}". Allowed (case-sensitive): ${ALLOWED_BEARDS.join(", ")}`
        );
    }

    // Atomic daily-quota check + reservation, before hitting the API.
    // Throws a QuotaError (400 invalid device_id / 429 limit reached).
    const reservation = await usageService.reserveQuota(deviceId, new Date(), {
        country: entitlementService.detectCountry(req)
    });

    // MOCK_GENERATION=true → quota runs, AILab is skipped (no API credits).
    if (process.env.MOCK_GENERATION === "true") {
        return {
            success: true,
            image: "https://via.placeholder.com/512x512.png?text=Mock+Beard",
            mocked: true,
            ...usageService.quotaSummary(reservation)
        };
    }

    let image;

    try {
        const formData = new FormData();

        console.log(req.file);
        formData.append("image", fs.createReadStream(req.file.path), {
            filename: req.file.originalname || "image.jpg",
            contentType: req.file.mimetype || "image/jpeg"
        });

        // Built-in beard preset (exact field name expected by the API is `beard`).
        formData.append("beard", beard);

        const response = await axios.post(
            "https://www.ailabapi.com/api/portrait/editing/ai-beard-styling",
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    "ailabapi-api-key": API_KEY
                }
            }
        );

        console.log("Beard Status:", response.status);
        console.log("Beard Response:", response.data);

        const taskId = response.data.task_id;

        if (!taskId) {
            throw new Error(
                response.data.error_msg ||
                response.data.error_detail?.message ||
                "Task ID not received from Beard API"
            );
        }

        console.log("Beard Task ID:", taskId);

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

            // 2 = completed, 3 = failed (same shared async endpoint as hairstyle).
            if (result.task_status === 2) {
                break;
            }

            if (result.task_status === 3) {
                throw new Error(
                    result.error_msg || "Beard Generation Failed"
                );
            }

            await new Promise(resolve => setTimeout(resolve, 2000));
        }

        image =
            result.data?.images?.[0] ||
            result.data?.result_urls?.[0];

        if (!image) {
            throw new Error("Beard task completed but no image URL was returned");
        }

    } catch (error) {
        // Failed generations are not charged.
        await usageService.releaseQuota(reservation);
        throw error;
    }

    generationHistoryService.recordGenerationHistory(req, {
        generated_image: image,
        hairstyle: beard,
        provider: "ailab",
        generation_status: "success",
        processing_time: Date.now() - startedAt
    });

    return {
        success: true,
        image,
        ...usageService.quotaSummary(reservation)
    };
};
