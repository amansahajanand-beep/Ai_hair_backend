const fs = require("fs");
const path = require("path");

const IMAGES_ROOT = path.join(__dirname, "..", "..", "..", "public", "images");
const SUPPORTED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".avif"]);

const BEARD_DESCRIPTIONS = {
  AnchorBeardClean: "Clean and defined anchor beard",
  AnchorBeardFull: "Full anchor beard style",
  Balbo: "Classic Balbo beard with mustache",
  Bandholz: "Long, thick Bandholz beard",
  ChevronMoustache: "Thick classic chevron mustache",
  ChinStrap: "Thin beard outlining the jaw",
  CircleBeard: "Rounded beard with connected mustache",
  CorporateBeard: "Neat professional business beard",
  DucktailBeardFull: "Full ducktail shaped beard",
  DucktailBeardPointed: "Sharp pointed ducktail beard",
  ExtendedGoatee: "Goatee extended to jawline",
  FullBeardClassic: "Traditional full beard",
  FullBeardTapered: "Full beard with tapered sides",
  Garibaldi: "Wide natural rounded beard",
  Goatee: "Simple chin beard style",
  HandlebarMoustache: "Curled handlebar mustache",
  HeavyStubble: "Thick rugged stubble beard",
  ImperialMoustache: "Long outward styled mustache",
  MuttonChops: "Sideburn beard with clean chin",
  PetiteGoatee: "Small neat goatee",
  SoulPatch: "Small patch below lower lip",
  VanDyke: "Pointed goatee with detached mustache",
  Verdi: "Full beard with styled mustache"
};

const FUN_TITLE_OVERRIDES = {
  male_hairstyle_0004: "Grey Textured Messy Quiff",
  male_hairstyle_0020: "Blue Braided High Bun Fade",
  male_hairstyle_0030: "Light Purple Middle-parted",
  male_hairstyle_0034: "Dark Green Curly Shag",
  male_hairstyle_0048: "Multicolored Double Braided",
  male_hairstyle_0051: "Orange Crown Braided",
  female_hairstyle_0026: "Blue Side-Swept Pixie Bob",
  female_hairstyle_0028: "Blue Side-Swept Pixie Bob",
  female_hairstyle_0037: "Pink Curly Pixie Cut",
  female_hairstyle_0069: "Darkblue Messy High Bun",
  female_hairstyle_0070: "LightBrown Double Crown Braid"
};

// Manual mapping for Fun images: image file -> { title, value }.
// A file is matched by the text before "(" + the colour inside "(...)", ignoring case, spaces, "_" and "-"
// (so "Airy Short Curls (lightPurple).jpg" and "Airy_Short_Curls (lightPurple)-Light purple ....png" both match).
// `names` = every style spelling used in image filenames; `value` = what is sent to the generate API.
const FUN_IMAGE_MAP = {
  Men: [
    { names: ["Wind-Tousled_Cropp", "Wind Tousled Crop"], color: "purple", title: "Purple Wind-Tousled Crop", value: "Wind-Tousled_Crop" },
    { names: ["male_hairstyle_0048", "Double Braided"], color: "multicolored", title: "Multicolored Double Braided", value: "male_hairstyle_0048" },
    { names: ["Spiky"], color: "blue", title: "Blue Spiky", value: "Spiky" },
    { names: ["CornrowBraids", "Cornrow Braids"], color: "pink", title: "Pink CornrowBraids", value: "CornrowBraids" },
    { names: ["male_hairstyle_0051", "Crown Braided"], color: "orange", title: "Orange Crown Braided", value: "male_hairstyle_0051" },
    { names: ["LongHairTiedUp", "Long Hair Tied Up"], color: "platinumBlonde", title: "PlatinumBlonde LongHairTiedUp", value: "LongHairTiedUp" },
    { names: ["male_hairstyle_0004", "Textured Messy Quiff"], color: "grey", title: "Grey Textured Messy Quiff", value: "male_hairstyle_0004" },
    { names: ["male_hairstyle_0034", "Textured Spiky Quiff"], color: "pink", title: "Pink Textured Spiky Quiff", value: "male_hairstyle_0034" },
    { names: ["male_hairstyle_0020", "Braided High Bun Fade"], color: "blue", title: "Blue Braided High Bun Fade", value: "male_hairstyle_0020" },
    { names: ["CurlyShag", "Curly Shag"], color: "darkGreen", title: "DarkGreen CurlyShag", value: "CurlyShag" }
  ],
  Women: [
    { names: ["Airy_Short_Curls", "Airy Short Curls"], color: "lightPurple", title: "Light purple Airy Short Curls", value: "Airy_Short_Curls" },
    { names: ["Side Swept Pixie", "Textured Pixie Cut"], color: "lightBlue", title: "lightBlue Textured Pixie Cut", value: "Side Swept Pixie" },
    { names: ["female_hairstyle_0037", "Curly Pixie Cut"], color: "pink", title: "Pink Curly Pixie Cut", value: "female_hairstyle_0037" },
    { names: ["messy bun", "Messy High Bun"], color: "grey", title: "Grey Messy High Bun", value: "messy bun" },
    { names: ["female_hairstyle_0026", "Side-Swept Pixie Bob"], color: "blue", title: "Blue Side-Swept Pixie Bob", value: "female_hairstyle_0026" },
    { names: ["ShortNeatBob", "Short Neat Bob"], color: "multicolored", title: "Multicolored ShortNeatBob", value: "ShortNeatBob" },
    { names: ["WavyFrenchBobVibesfrom1920", "WavyFrenchBobVibesfrom", "Wavy French Bob Vibesfrom"], color: "red", title: "Red WavyFrenchBobVibesfrom", value: "WavyFrenchBobVibesfrom1920" },
    { names: ["Spiked"], color: "blonde", title: "Blonde Spiked", value: "Spiked" },
    { names: ["LooseCurlyAfro", "Loose Curly Afro"], color: "silver", title: "Silver LooseCurlyAfro", value: "LooseCurlyAfro" },
    { names: ["BoxBraids", "Box Braids"], color: "burgundy", title: "Burgundy BoxBraids", value: "BoxBraids" }
  ],
  Baby: [
    { names: ["male_hairstyle_0030", "Middle-parted", "Light Purple Middle-parted"], color: "lightPurple", title: "Light Purple Middle-parted", value: "male_hairstyle_0030" },
    { names: ["TwoBlockHaircut", "Two Block Haircut"], color: "orange", title: "Orange TwoBlockHaircut", value: "TwoBlockHaircut" },
    { names: ["ManBun", "Man Bun"], color: "red", title: "Red ManBun", value: "ManBun" },
    { names: ["LowFade", "Low Fade"], color: "multicolored", title: "Multicolored LowFade", value: "LowFade" },
    { names: ["CornrowBraids", "Cornrow Braids"], color: "blonde", title: "Blonde CornrowBraids", value: "CornrowBraids" },
    { names: ["DoubleBun", "Double Bun"], color: "platinumBlonde", title: "PlatinumBlonde DoubleBun", value: "DoubleBun" },
    { names: ["Retro_Airy_Curl", "Retro Airy Curl"], color: "pink", title: "Pink Retro Airy Curl", value: "Retro_Airy_Curl" },
    { names: ["ShortTwintails", "Short Twintails"], color: "lightBlue", title: "LightBlue ShortTwintails", value: "ShortTwintails" },
    { names: ["female_hairstyle_0069", "Messy High Bun"], color: "darkBlue", title: "Darkblue Messy High Bun", value: "female_hairstyle_0069" },
    { names: ["female_hairstyle_0070", "Double Crown Braid"], color: "lightBrown", title: "LightBrown Double Crown Braid", value: "female_hairstyle_0070" }
  ]
};

const normalizeKey = (text) => String(text || "").toLowerCase().replace(/[^a-z0-9]/g, "");

function findFunMapping(subCategory, baseName) {
  const entries = FUN_IMAGE_MAP[subCategory];
  const match = entries && baseName.match(/^(.*?)\s*\(\s*([^)]+?)\s*\)/);
  if (!match) return null;

  const style = normalizeKey(match[1]);
  const color = normalizeKey(match[2]);
  const sameColor = entries.filter((entry) => normalizeKey(entry.color) === color);

  return (
    sameColor.find((entry) => entry.names.some((name) => normalizeKey(name) === style)) ||
    sameColor.find((entry) => entry.names.some((name) => style.includes(normalizeKey(name)) || normalizeKey(name).includes(style))) ||
    (sameColor.length === 1 ? sameColor[0] : null)
  );
}

function getBaseName(fileName) {
  return fileName.replace(path.extname(fileName), "").trim();
}

function parseFilenameValue(baseName) {
  const match = baseName.match(/^(.*?)\s*\(\s*(.+?)\s*\)\s*$/);
  if (match) {
    return {
      title: match[1].trim(),
      value: match[2].trim()
    };
  }

  return {
    title: baseName,
    value: baseName
  };
}

function parseFunFilename(baseName) {
  const normalizedBase = baseName.trim();
  let rawMain = normalizedBase;
  let rawTitle = null;

  const dashedMatch = normalizedBase.match(/^(.*?\(.*?\))\s*\.?\s*-\s*(.+)$/);
  if (dashedMatch) {
    rawMain = dashedMatch[1].trim();
    rawTitle = dashedMatch[2].trim();
  } else {
    const dashFallback = normalizedBase.match(/^(.*?)\s*-\s*(.+)$/);
    if (dashFallback) {
      rawMain = dashFallback[1].trim();
      rawTitle = dashFallback[2].trim();
    }
  }

  rawMain = rawMain.replace(/[\s\.]+$/, "");
  rawTitle = rawTitle ? rawTitle.replace(/[\s\.]+$/, "") : null;

  const match = rawMain.match(/^(.*?)\s*\(\s*(.+?)\s*\)$/);
  const hairstyle = match ? match[1].trim() : rawMain;
  const hairColor = match ? match[2].trim() : rawMain;

  if (!rawTitle) {
    rawTitle = rawMain;
  }

  return {
    hairstyle,
    hairColor,
    title: rawTitle
  };
}

function formatFunTitle(title) {
  const normalized = title.trim();
  const overrideKey = normalized.toLowerCase();

  if (FUN_TITLE_OVERRIDES[overrideKey]) {
    return FUN_TITLE_OVERRIDES[overrideKey];
  }

  return normalized
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z])([A-Z][a-z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFunValue(value) {
  const normalized = value.trim();
  const spaced = normalized
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();

  return spaced
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function extractColorFromTitle(title) {
  const normalized = title
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  const colors = [
    "dark blue",
    "darkblue",
    "light brown",
    "lightbrown",
    "light purple",
    "lightpurple",
    "light blue",
    "lightblue",
    "multicolored",
    "dark green",
    "darkgreen",
    "red",
    "blue",
    "grey",
    "gray",
    "pink",
    "orange",
    "silver",
    "burgundy",
    "blonde"
  ];

  for (const color of colors) {
    if (normalized.includes(color)) {
      return color
        .replace(/gray/, "grey")
        .split(" ")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
    }
  }

  return null;
}

function mapHomeSubCategory(subCategory) {
  const normalized = subCategory.toLowerCase();
  if (normalized === "baby") return "Children_Hairstyles";
  if (normalized === "male") return "Men_Hairstyles";
  if (normalized === "women") return "Women_Hairstyles";
  if (normalized === "haircolor") return "Haircolor";
  return subCategory.replace(/\s+/g, "_");
}

function buildImageUrl(...segments) {
  return "/" + segments.map((segment) => encodeURIComponent(segment)).join("/");
}

function isBeforeImage(baseName) {
  return /^before_(boy|girl|men|women)_image$/i.test(baseName.replace(/\s+/g, "_").toLowerCase());
}

function normalizeNameForSearch(name) {
  return name
    .replace(/[_\W]+/g, " ")
    .trim()
    .toLowerCase();
}

function isBabyBoyStyle(baseName) {
  const normalized = normalizeNameForSearch(baseName);
  return /\b(male|man|boy|guy)\b/.test(normalized);
}

function isBabyGirlStyle(baseName) {
  const normalized = normalizeNameForSearch(baseName);
  return /\b(female|girl|woman|women|lady)\b/.test(normalized);
}

const BABY_GIRL_OVERRIDE = new Set([
  "CornrowBraids",
  "DoubleBun",
  "ManBun",
  "Retro_Airy_Curl",
  "ShortTwintails"
]);

// Finds a file by its name without extension, so ".png" / ".jpg" / ".webp" all work.
function findByBaseName(files, baseName) {
  return files.find((file) => getBaseName(file).toLowerCase() === baseName.toLowerCase());
}

function getBeforeImageFile(files, subCategory, fileName = null) {
  const lookup = {
    Baby: ["before_boy_image", "before_girl_image"],
    Men: ["before_men_image"],
    Women: ["before_women_image"]
  };

  if (subCategory === "Baby" && fileName) {
    const baseName = getBaseName(fileName);
    const parsed = parseFilenameValue(baseName);
    const title = parsed.title;
    const boyCandidate = findByBaseName(files, "before_boy_image");
    const girlCandidate = findByBaseName(files, "before_girl_image");

    if (BABY_GIRL_OVERRIDE.has(title) && girlCandidate) {
      return girlCandidate;
    }

    if (isBabyGirlStyle(baseName) && girlCandidate) {
      return girlCandidate;
    }

    if (isBabyBoyStyle(baseName) && boyCandidate) {
      return boyCandidate;
    }
  }

  const candidates = lookup[subCategory] || [];
  for (const candidate of candidates) {
    const match = findByBaseName(files, candidate);
    if (match) {
      return match;
    }
  }

  const beforeFiles = files.filter((file) => isBeforeImage(getBaseName(file)));
  return beforeFiles.length ? beforeFiles[0] : null;
}

function createHomeItem(fileName, categoryName, subCategory, id) {
  const baseName = getBaseName(fileName);
  const { title, value } = parseFilenameValue(baseName);
  const mappedSubCategory = mapHomeSubCategory(subCategory);

  const item = {
    _id: id,
    title,
    image: buildImageUrl("images", categoryName, subCategory, fileName),
    value,
    category: mappedSubCategory,
    subCategory: mappedSubCategory,
    folderCategory: subCategory,
    categoryId: mappedSubCategory.toLowerCase(),
    hairstyle: title
  };

  if (mappedSubCategory === "Haircolor") {
    item.hairColor = value;
  }

  return item;
}

const BEARD_BEFORE_IMAGE = "common_image"; // file name without extension

function createBeardItem(fileName, id, beforeFile) {
  const baseName = getBaseName(fileName);
  const { title, value } = parseFilenameValue(baseName);
  const imageUrl = buildImageUrl("images", "Beard", fileName);
  const beforeImageUrl = beforeFile ? buildImageUrl("images", "Beard", beforeFile) : null;

  return {
    _id: id,
    title,
    description: BEARD_DESCRIPTIONS[value] || `Beard style ${title}`,
    beforeImage: beforeImageUrl,
    afterImage: imageUrl,
    value,
    category: "Beard",
    categoryId: "beard"
  };
}


function createFunItem(fileName, categoryName, subCategory, beforeImageFile, id, girlBeforeFile) {
  const baseName = getBaseName(fileName);
  const { hairstyle: rawHairstyle, hairColor: rawHairColor, title: rawTitle } = parseFunFilename(baseName);
  const rawTitleLower = rawTitle.toLowerCase();
  const mapped = findFunMapping(subCategory, baseName);
  if (!mapped) {
    console.warn(`?? Fun image has no entry in FUN_IMAGE_MAP: ${subCategory}/${fileName}`);
  }

  const title = mapped
    ? mapped.title
    : /^(male|female)_hairstyle_\d+$/i.test(rawTitleLower)
      ? FUN_TITLE_OVERRIDES[rawTitleLower] || rawTitle
      : rawTitle;

  const hairstyle = mapped ? mapped.value : rawHairstyle;
  const hairColor = rawHairColor;

  const afterImage = buildImageUrl("images", categoryName, subCategory, fileName);
  

  const beforeImage = beforeImageFile
    ? buildImageUrl("images", categoryName, subCategory, beforeImageFile)
    : null;
let finalBeforeImage = beforeImage;

if (
  subCategory === "Baby" &&
  girlBeforeFile &&
  [2,3,4, 8, 9].includes(id)
) {
  finalBeforeImage = buildImageUrl(
    "images",
    categoryName,
    subCategory,
    girlBeforeFile
  );
}
  return {
    _id: id,
    title,
    description: `Fun ${title}`,
    image: afterImage,
    beforeImage:finalBeforeImage,
    afterImage,
    value: hairstyle,
    hairstyle,
    hairColor,
    category: subCategory,
    subCategory,
    categoryId: subCategory.toLowerCase()
  };
}

function getImagesFromFolders() {
  if (!fs.existsSync(IMAGES_ROOT)) {
    console.warn("?? Images folder not found:", IMAGES_ROOT);
    return {};
  }

  const categoryFolders = fs
    .readdirSync(IMAGES_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const images = {};

  categoryFolders.forEach((categoryName) => {
    const categoryPath = path.join(IMAGES_ROOT, categoryName);
    const categoryEntries = fs.readdirSync(categoryPath, { withFileTypes: true });

    if (categoryName === "Beard") {
      const files = categoryEntries
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
        .sort((a, b) => a.localeCompare(b));

      const beforeFile = findByBaseName(files, BEARD_BEFORE_IMAGE);
      images[categoryName] = files.map((fileName, index) => createBeardItem(fileName, index + 1, beforeFile));
      return;
    }

    const subfolders = categoryEntries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((a, b) => a.localeCompare(b));

    let nextId = 1;
    images[categoryName] = [];

    subfolders.forEach((subCategory) => {
      const subfolderPath = path.join(categoryPath, subCategory);
      const files = fs
        .readdirSync(subfolderPath, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .filter((fileName) => SUPPORTED_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
        .sort((a, b) => a.localeCompare(b));

      if (categoryName === "Home") {
        files.forEach((fileName) => {
          images[categoryName].push(createHomeItem(fileName, categoryName, subCategory, nextId++));
        });
        return;
      }

      if (categoryName === "Fun") {
        files.forEach((fileName) => {
          if (isBeforeImage(getBaseName(fileName))) {
            return;
          }
          const beforeImageFile = getBeforeImageFile(files, subCategory, fileName);
          images[categoryName].push(
            createFunItem(fileName, categoryName, subCategory, beforeImageFile, nextId++, findByBaseName(files, "before_girl_image"))
          );
        });
      }
    });
  });

  return images;
}

function getCategories(images) {
  return Object.keys(images);
}

function normalizeRequestPath(requestPath) {
  const parts = requestPath
    .split("/")
    .map((segment) => decodeURIComponent(segment))
    .filter((segment) => segment.length > 0);

  if (parts[0] === "AI_Hair" || parts[0] === "images") {
    parts.shift();
  }

  return parts;
}

function fileExists(requestPath) {
  const safeParts = normalizeRequestPath(requestPath);
  const imagePath = path.join(IMAGES_ROOT, ...safeParts);
  const resolved = path.resolve(imagePath);

  if (!resolved.startsWith(path.resolve(IMAGES_ROOT))) {
    return false;
  }

  return fs.existsSync(imagePath);
}

function getImagePath(requestPath) {
  const safeParts = normalizeRequestPath(requestPath);
  return path.join(IMAGES_ROOT, ...safeParts);
}

module.exports = {
  getImagesFromFolders,
  getCategories,
  fileExists,
  getImagePath
};
