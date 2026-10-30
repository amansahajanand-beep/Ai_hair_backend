const express = require("express");
const router = express.Router();
const imageController = require("../../controllers/hairApi/imageController");
const videoController = require("../../controllers/hairApi/videoController");

/**
 * API Routes
 */

// Root endpoint
router.get("/", imageController.getInfo);

// Get all categories
router.get("/api/categories", imageController.getAllCategories);

// Get all images or filter by query params
router.get("/api/images", imageController.getImagesByCategory);

// Get images by category or subcategory path (fallback)
router.get("/api/images/:category/:subCategory?", imageController.getImagesByCategory);

// Get video lists or filter by category
router.get("/api/videos", videoController.getVideosByCategory);
router.get("/api/videos/:category", videoController.getVideosByCategory);

// Get specific image file
router.get("/images/*", imageController.getImageFile);

module.exports = router;
