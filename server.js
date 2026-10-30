require("dotenv").config();

const os = require("os");
const app = require("./src/app");
const { connectDB, disconnectDB } = require("./src/config/db");
const { getDailyQuota, getQuotaTimezone } = require("./src/config/hairstyle-api/quota");

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

function getNetworkAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === "IPv4" && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }

  return addresses;
}

function startServer(port) {
  const server = app.listen(port, HOST, () => {
    console.log(`✅ Server running: http://localhost:${port}`);

    const addresses = getNetworkAddresses();
    if (addresses.length) {
      console.log("🌐 Network access (other devices on same Wi‑Fi/LAN):");
      addresses.forEach(({ name, address }) => {
        console.log(`   http://${address}:${port}  (${name})`);
      });
    } else {
      console.log("🌐 Network access: no external IPv4 address found");
    }

    console.log(`📚 API Documentation: http://localhost:${port}`);
  });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.warn(`⚠️ Port ${port} is busy, trying ${port + 1}...`);
      server.close(() => startServer(port + 1));
    } else {
      console.error("Server error:", error);
      process.exit(1);
    }
  });

  process.on("SIGTERM", async () => {
    console.log("🛑 SIGTERM received, shutting down gracefully...");
    server.close(async () => {
      await disconnectDB();
      console.log("✅ Server closed");
      process.exit(0);
    });
  });
}

async function bootstrap() {
  try {
    // Fail fast on an invalid DAILY_API_QUOTA / QUOTA_TIMEZONE.
    console.log(`Daily API quota: ${getDailyQuota()} per device (timezone ${getQuotaTimezone()})`);
    await connectDB();
    startServer(DEFAULT_PORT);
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

bootstrap();
