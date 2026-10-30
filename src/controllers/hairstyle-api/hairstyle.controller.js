const hairstyleService = require("../../services/hairstyle-api/hairstyle.service");
const { QuotaError } = require("../../services/hairstyle-api/usage.service");

exports.changeHairstyle = async (req, res) => {

    try {

        const result = await hairstyleService.changeHairstyle(req);

        res.json(result);

    } catch (error) {

        // Daily quota exceeded (429) / invalid device_id (400)
        if (error instanceof QuotaError) {
            return res.status(error.statusCode).json({
                success: false,
                error: error.message,
                code: error.code,
                ...error.extra
            });
        }

        console.log(error.response?.data || error.message);

        res.status(500).json({
            success: false,
            error: error.response?.data || error.message
        });

    }

};
