const mongoose = require("mongoose");

/** Small admin-editable key/value settings (one document per key). */
const appSettingSchema = new mongoose.Schema(
    {
        key: { type: String, required: true, unique: true, trim: true },
        value: { type: mongoose.Schema.Types.Mixed },
        updated_by: { type: String, trim: true }
    },
    { timestamps: true }
);

module.exports = mongoose.model("AppSetting", appSettingSchema);
