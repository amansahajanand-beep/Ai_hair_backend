require("dotenv").config();

const fs = require("fs");
const path = require("path");

const { connectDB, disconnectDB } = require("../src/config/db");
const Usage = require("../src/models/usage.model");

const FREE_LIMIT = 3;
const USAGE_FILE = path.join(__dirname, "..", "data", "usage.json");

async function migrateUsage() {
    if (!fs.existsSync(USAGE_FILE)) {
        console.log("No usage.json file found. Nothing to migrate.");
        return;
    }

    const raw = fs.readFileSync(USAGE_FILE, "utf8");
    const fileUsage = raw ? JSON.parse(raw) : {};
    const deviceIds = Object.keys(fileUsage);

    if (!deviceIds.length) {
        console.log("usage.json is empty. Nothing to migrate.");
        return;
    }

    let migrated = 0;

    for (const deviceId of deviceIds) {
        const usedCount = Number(fileUsage[deviceId]) || 0;
        const remainingCount = Math.max(FREE_LIMIT - usedCount, 0);
        const isLimitExceeded = usedCount >= FREE_LIMIT;

        await Usage.findOneAndUpdate(
            { device_id: deviceId },
            {
                $set: {
                    device_id: deviceId,
                    free_limit: FREE_LIMIT,
                    used_count: usedCount,
                    remaining_count: remainingCount,
                    is_limit_exceeded: isLimitExceeded
                },
                $setOnInsert: {
                    first_used_at: new Date()
                }
            },
            {
                upsert: true,
                lean: true
            }
        );

        migrated += 1;
    }

    console.log(`Migrated ${migrated} device usage record(s) from usage.json.`);
}

async function main() {
    try {
        await connectDB();
        await migrateUsage();
    } catch (error) {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    } finally {
        await disconnectDB();
    }
}

main();
