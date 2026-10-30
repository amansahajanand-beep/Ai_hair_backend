const mongoose = require("mongoose");

async function connectDB() {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("MONGODB_URI is required");
    }

    await mongoose.connect(uri);
    console.log("MongoDB connected");
}

async function disconnectDB() {
    await mongoose.disconnect();
    console.log("MongoDB disconnected");
}

module.exports = { connectDB, disconnectDB };
