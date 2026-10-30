const fs = require("fs");
const imageService = require("../../utils/hairApi/imageService");

/**
 * Get all categories
 * @route GET /api/categories
 */
exports.getAllCategories = (req, res) => {
  try {
    const categories = imageService.getCategories(global.images);
    res.json({
      success: true,
      count: categories.length,
      categories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching categories",
      error: error.message
    });
  }
};

/**
 * Get all images from all categories
 * @route GET /api/images
 */
exports.getAllImages = (req, res) => {
  try {
    res.json({
      success: true,
      data: global.images
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching images",
      error: error.message
    });
  }
};

/**
 * Get images by category or category/subcategory
 * @route GET /api/images/:category/:subCategory?
 */
exports.getImagesByCategory = (req, res) => {
  try {
    const category = (req.query.category || req.params.category || "").toString().toLowerCase();
    const subCategory = (req.query.subCategory || req.query.subcategory || req.params.subCategory || "").toString().toLowerCase();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 20, 1);
    const categories = imageService.getCategories(global.images);

    let images = [];
    let categoryLabel = "all";

    if (!category) {
      images = Object.values(global.images).flat();
    } else {
      const matchedCategory = categories.find((cat) => cat.toLowerCase() === category);

      if (!matchedCategory) {
        return res.status(404).json({
          success: false,
          message: `Category "${category}" not found`,
          availableCategories: categories,
          tip: "Category search is case-insensitive"
        });
      }

      images = global.images[matchedCategory];
      categoryLabel = matchedCategory;

      if (subCategory) {
        const normalizedSub = subCategory.toLowerCase();
        const filtered = images.filter((item) => {
          return item.subCategory && item.subCategory.toLowerCase() === normalizedSub;
        });

        if (filtered.length === 0) {
          return res.status(404).json({
            success: false,
            message: `Subcategory "${subCategory}" not found in category "${matchedCategory}"`,
            availableSubcategories: [...new Set(images.map((item) => item.subCategory))].filter(Boolean)
          });
        }

        images = filtered;
        categoryLabel = subCategory;
      }
    }

    const totalCount = images.length;
    const totalPages = Math.max(Math.ceil(totalCount / limit), 1);
    const startIndex = (page - 1) * limit;
    const pagedImages = images.slice(startIndex, startIndex + limit).map((item, index) => {
      const { _id, id, originalId, original__id, ...rest } = item;
      return {
        id: startIndex + index + 1,
        ...rest
      };
    });

    res.json({
      success: true,
      category: categoryLabel,
      page,
      limit,
      totalCount,
      totalPages,
      count: pagedImages.length,
      images: pagedImages
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching category images",
      error: error.message
    });
  }
};

/**
 * Serve a specific image file
 * @route GET /images/*
 */
exports.getImageFile = (req, res) => {
  try {
    const imagePathParameter = req.params[0];
    if (!imagePathParameter) {
      return res.status(400).json({
        success: false,
        message: "Image path is required"
      });
    }

    if (!imageService.fileExists(imagePathParameter)) {
      return res.status(404).json({
        success: false,
        message: `Image not found: ${imagePathParameter}`
      });
    }

    const imagePath = imageService.getImagePath(imagePathParameter);
    res.sendFile(imagePath);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error serving image",
      error: error.message
    });
  }
};

/**
 * Root endpoint - API info
 * @route GET /
 */
exports.getInfo = (req, res) => {
  res.json({
    message: "Hair API 🚀",
    version: "1.0.0",
    endpoints: {
      info: "GET /",
      categories: "GET /api/categories",
      allImages: "GET /api/images",
      imagesByCategory: "GET /api/images/:category",
      videos: "GET /api/videos",
      videosByCategory: "GET /api/videos/:category",
      imageFile: "GET /images/:category/:filename"
    },
    example: {
      categories: "/api/categories",
      homeMenImages: "/api/images?category=home&subcategory=men_hairstyles",
      funBabyImages: "/api/images?category=fun&subcategory=baby",
      videos: "/api/videos",
      introVideos: "/api/videos?category=IntroVideo",
      homeVideos: "/api/videos?category=HomeVideo",
      getImage: "/images/Beard/AnchorBeardClean%20(AnchorBeardClean).png"
    }
  });
};
