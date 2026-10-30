const fs = require("fs");
const path = require("path");
const imageMetadata = require("./imagesMetadata.js");

const VIDEO_ROOT = path.join(__dirname, "..", "..", "..", "public", "videos");
const SUPPORTED_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);
const SUPPORTED_VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".webm", ".mkv"]);

function mapVideoCategory(folderName) {
  const normalized = folderName.toLowerCase();

  if (normalized === "introvideos" || normalized === "introvideo") {
    return "IntroVideo";
  }
  if (normalized === "introimages" || normalized === "introimage") {
    return "IntroImages";
  }
  if (normalized === "homevideos" || normalized === "homevideo") {
    return "HomeVideo";
  }
  if (normalized === "homeimages" || normalized === "homeimage") {
    return "HomeImages";
  }
  if (normalized === "premiumvideos" || normalized === "premiumvideo") {
    return "PremiumVideo";
  }

  return folderName;
}

function buildUrl(...segments) {
  return "/" + segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function createVideoItem(fileName, folderName, id) {
  const fileUrl = buildUrl("videos", folderName, fileName);

  const item = {
    id,
    url: fileUrl,
    title: path.parse(fileName).name
  };

  const category = mapVideoCategory(folderName);

  if (category === "HomeImages" || category === "IntroImages") {
    const key = path.parse(fileName).name;

    const meta = imageMetadata?.[category]?.[key];

    item.header = meta?.header || "";
    item.description = meta?.description || "";
  }

  return item;
}

function getVideosFromFolders() {
  if (!fs.existsSync(VIDEO_ROOT)) {
    console.warn("⚠️ Videos folder not found:", VIDEO_ROOT);
    return {};
  }

  const categoryFolders = fs
    .readdirSync(VIDEO_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const videos = {};

  categoryFolders.forEach((folderName) => {
    const category = mapVideoCategory(folderName);
    const folderPath = path.join(VIDEO_ROOT, folderName);

    const files = fs
      .readdirSync(folderPath, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((fileName) => {
        const ext = path.extname(fileName).toLowerCase();
        return SUPPORTED_IMAGE_EXTENSIONS.has(ext) || SUPPORTED_VIDEO_EXTENSIONS.has(ext);
      })
      .sort((a, b) => a.localeCompare(b));

    videos[category] = files.map((fileName, index) => createVideoItem(fileName, folderName, index + 1));
  });

  return videos;
}

module.exports = {
  getVideosFromFolders,
  mapVideoCategory
};
