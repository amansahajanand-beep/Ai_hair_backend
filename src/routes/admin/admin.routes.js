const express = require("express");
const rateLimit = require("express-rate-limit");

const { requireAdmin } = require("../../middlewares/admin/adminAuth");
const admin = require("../../controllers/admin/admin.controller");

const router = express.Router();

// Brute-force guard on the login endpoint only.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts. Try again in a few minutes." }
});

router.use(express.json({ limit: "10kb" }));

router.post("/login", loginLimiter, admin.login);

router.use(requireAdmin);
router.get("/settings", admin.settings);
router.put("/settings/fallback", admin.saveFallback);
router.get("/overview", admin.overview);
router.get("/users", admin.listUsers);
router.get("/policies", admin.listPolicies);
router.put("/policies/:country", admin.savePolicy);
router.delete("/policies/:country", admin.deletePolicy);

// Admin API errors stay JSON.
router.use((err, req, res, next) => {
    console.error("Admin API error:", err);
    const status = err.name === "ValidationError" ? 400 : 500;
    res.status(status).json({
        success: false,
        message: status === 400 ? err.message : "Something went wrong."
    });
});

module.exports = router;
