const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");
const imageService = require("./utils/hairApi/imageService");
const videoService = require("./utils/hairApi/videoService");
const imageRoutes = require("./routes/hairApi/imageRoutes");
const hairstyleRoutes = require("./routes/hairstyle-api/hairstyle.routes");
const limitStatusRoutes = require("./routes/hairstyle-api/limitStatus.routes");
const adminRoutes = require("./routes/admin/admin.routes");

const app = express();

// Behind Nginx: trust the first proxy so req.ip uses X-Forwarded-For
app.set("trust proxy", 1);

// ============================================
// Security
// ============================================

app.disable("x-powered-by");
app.use(helmet());

// Admin API: same-origin only (served with the admin UI), so it sits before the
// public-app CORS allow-list.
app.use("/admin-api", adminRoutes);
app.use((req, res, next) =>
  req.path === "/admin" ? res.redirect("/admin/") : next()
);

const allowedOrigins = [
  "http://localhost:3001",
  "https://hair.champslevl.com",
  "https://www.hair.champslevl.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Origin not allowed by CORS"));
    },
    methods: ["GET", "POST"],
    credentials: false,
  })
);

const hairApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: "Too many requests. Please try again later.",
  },
});

app.use("/api/categories", hairApiLimiter);
app.use("/api/images", hairApiLimiter);
app.use("/api/videos", hairApiLimiter);

// ============================================
// Middleware
// ============================================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, "..", "public")));

// ============================================
// Load Images and Videos (before routes)
// ============================================

global.images = imageService.getImagesFromFolders();
global.videos = videoService.getVideosFromFolders();
console.log(
  `📁 Loaded ${Object.keys(global.images).length} image categories`
);
console.log(
  `🎬 Loaded ${Object.keys(global.videos).length} video categories`
);

// ============================================
// Routes
// ============================================

app.use("/", imageRoutes);
app.use("/api", hairstyleRoutes);
app.use("/api", limitStatusRoutes);

// ============================================
// 404 Handler
// ============================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: "Route not found",
    availableRoutes: {
      "GET /": "API info",
      "GET /api/categories": "Get all categories",
      "GET /api/images": "Get all images",
      "GET /api/images/:category": "Get images by category",
      "GET /api/videos": "Get all videos",
      "GET /api/videos/:category": "Get videos by category",
      "GET /images/:category/:filename": "Get specific image file",
      "POST /api/hairstyle": "Generate hairstyle or beard",
      "POST /api/check-free-limit": "Check remaining daily generation quota",
    },
  });
});

// ============================================
// Error Handler
// ============================================

app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err.message === "Origin not allowed by CORS") {
    return res.status(403).json({
      success: false,
      message: "Access denied.",
    });
  }

  res.status(500).json({
    success: false,
    message: "Internal server error",
    error:
      process.env.NODE_ENV === "development"
        ? err.message
        : undefined,
  });
});

module.exports = app;
