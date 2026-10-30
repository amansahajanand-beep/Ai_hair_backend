const express = require("express");

const upload = require("../../middlewares/hairstyle-api/upload");

const hairstyleController = require("../../controllers/hairstyle-api/hairstyle.controller");

const router = express.Router();

router.post(
    "/hairstyle",
    upload.single("image"),
    hairstyleController.changeHairstyle
);

module.exports = router;