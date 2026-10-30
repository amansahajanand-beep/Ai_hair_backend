const videoService = require("../../utils/hairApi/videoService");

exports.getAllVideos = (req, res) => {
  try {
    const videos = global.videos || videoService.getVideosFromFolders();
    res.json({
      success: true,
      data: videos
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching videos",
      error: error.message
    });
  }
};

const IMAGE_CATEGORIES = new Set(["homeimages", "introimages"]);

exports.getVideosByCategory = (req, res) => {
  try {
    const category = (req.query.category || req.params.category || "").toString().toLowerCase();
    const videos = global.videos || videoService.getVideosFromFolders();
    const categories = Object.keys(videos);

    if (!category) {
      return res.json({
        success: true,
        data: videos
      });
    }

    const matchedCategory = categories.find((cat) => cat.toLowerCase() === category);
    if (!matchedCategory) {
      return res.status(404).json({
        success: false,
        message: `Category "${category}" not found`,
        availableCategories: categories,
        tip: "Category search is case-insensitive"
      });
    }

    const resultKey = IMAGE_CATEGORIES.has(category) ? "images" : "videos";
    res.json({
      success: true,
      category: matchedCategory,
      count: videos[matchedCategory].length,
      [resultKey]: videos[matchedCategory]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "Error fetching videos",
      error: error.message
    });
  }
};
