
const express = require("express");

const limitStatus = require("../../controllers/hairstyle-api/limitStatus.controller");



const router = express.Router();

router.post("/check-free-limit", limitStatus.checkFreeLimit);
module.exports = router;