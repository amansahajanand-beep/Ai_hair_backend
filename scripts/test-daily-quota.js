/**
 * Daily quota tests. Uses a real MongoDB - point TEST_MONGODB_URI at a
 * THROWAWAY database (collections are written to, never dropped):
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/hair-quota-test node scripts/test-daily-quota.js
 */
process.env.MOCK_GENERATION = "true"; // skip the AILab provider
process.env.DAILY_API_QUOTA = "3";
process.env.QUOTA_TIMEZONE = "UTC";

const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const mongoose = require("mongoose");
const axios = require("axios");
const FormData = require("form-data");

const uri = process.env.TEST_MONGODB_URI;
if (!uri) {
    console.error("Set TEST_MONGODB_URI to a throwaway database.");
    process.exit(1);
}

const usage = require("../src/services/hairstyle-api/usage.service");
const quotaConfig = require("../src/config/hairstyle-api/quota");
const DailyApiUsage = require("../src/models/dailyApiUsage.model");
const app = require("../src/app");

const run = Date.now().toString(36); // unique device ids per run
const dev = (n) => `test-${run}-${n}`;
let passed = 0;

async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        console.log(`  FAIL ${name}\n       ${e.stack}`);
        process.exitCode = 1;
    }
}

async function expectQuotaError(promise, status, code) {
    try {
        await promise;
    } catch (e) {
        assert(e instanceof usage.QuotaError, `expected QuotaError, got ${e}`);
        assert.strictEqual(e.statusCode, status);
        assert.strictEqual(e.code, code);
        return e;
    }
    assert.fail("expected an error");
}

async function main() {
    await mongoose.connect(uri);
    await DailyApiUsage.init(); // make sure the unique index exists

    const img = path.join(os.tmpdir(), "quota-test.png");
    fs.writeFileSync(img, Buffer.from("iVBORw0KGgo=", "base64"));
    const server = app.listen(0);
    const base = `http://127.0.0.1:${server.address().port}/api`;

    const generate = (fields) => {
        const f = new FormData();
        f.append("image", fs.createReadStream(img));
        for (const [k, v] of Object.entries(fields)) f.append(k, v);
        return axios.post(`${base}/hairstyle`, f, {
            headers: f.getHeaders(),
            validateStatus: () => true
        });
    };
    const check = (body) =>
        axios.post(`${base}/check-free-limit`, body, { validateStatus: () => true });

    console.log("Service level");

    await test("first request is allowed", async () => {
        const r = await usage.reserveQuota(dev("a"));
        assert.strictEqual(r.used, 1);
    });

    await test("last allowed request (3rd) succeeds, 4th is rejected with 429", async () => {
        await usage.reserveQuota(dev("a"));
        const r = await usage.reserveQuota(dev("a"));
        assert.strictEqual(r.used, 3);
        const e = await expectQuotaError(usage.reserveQuota(dev("a")), 429, "DAILY_QUOTA_EXCEEDED");
        assert.strictEqual(e.extra.remaining, 0);
        const s = await usage.getDailyStats(dev("a"));
        assert.strictEqual(s.used, 3); // rejected request charged nothing
    });

    await test("devices have independent quotas", async () => {
        const r = await usage.reserveQuota(dev("b"));
        assert.strictEqual(r.used, 1);
    });

    await test("quota resets on the next day", async () => {
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 24 * 3600 * 1000);
        await expectQuotaError(usage.reserveQuota(dev("a"), today), 429, "DAILY_QUOTA_EXCEEDED");
        const r = await usage.reserveQuota(dev("a"), tomorrow);
        assert.strictEqual(r.used, 1);
        assert.notStrictEqual(r.date, usage.getDateKey(today));
    });

    await test("day boundary follows QUOTA_TIMEZONE", async () => {
        const t = new Date("2030-01-01T20:00:00Z"); // 01:30 Jan 2 in Asia/Kolkata
        process.env.QUOTA_TIMEZONE = "Asia/Kolkata";
        assert.strictEqual(usage.getDateKey(t), "2030-01-02");
        process.env.QUOTA_TIMEZONE = "UTC";
        assert.strictEqual(usage.getDateKey(t), "2030-01-01");
    });

    await test("release gives the unit back (failed generation not charged)", async () => {
        const r = await usage.reserveQuota(dev("c"));
        await usage.releaseQuota(r);
        assert.strictEqual((await usage.getDailyStats(dev("c"))).used, 0);
        await usage.releaseQuota(r); // never goes below 0
        assert.strictEqual((await usage.getDailyStats(dev("c"))).used, 0);
    });

    await test("invalid identifiers are rejected (400), not bypassed", async () => {
        for (const bad of [undefined, null, "", "   ", "a b", "x".repeat(129), { $ne: "" }, ["a"], 123]) {
            await expectQuotaError(usage.reserveQuota(bad), 400, "INVALID_DEVICE_ID");
        }
    });

    await test("50 concurrent requests, fresh device: exactly 3 succeed", async () => {
        const results = await Promise.allSettled(
            Array.from({ length: 50 }, () => usage.reserveQuota(dev("race1")))
        );
        const ok = results.filter((r) => r.status === "fulfilled").length;
        const denied = results.filter(
            (r) => r.status === "rejected" && r.reason.code === "DAILY_QUOTA_EXCEEDED"
        ).length;
        assert.strictEqual(ok, 3);
        assert.strictEqual(denied, 47);
        assert.strictEqual((await usage.getDailyStats(dev("race1"))).used, 3);
    });

    await test("concurrent requests with 2 left: exactly 2 succeed", async () => {
        await usage.reserveQuota(dev("race2"));
        const results = await Promise.allSettled(
            Array.from({ length: 30 }, () => usage.reserveQuota(dev("race2")))
        );
        assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, 2);
    });

    await test("DAILY_API_QUOTA is dynamic (5 allows 5)", async () => {
        process.env.DAILY_API_QUOTA = "5";
        for (let i = 1; i <= 5; i++) await usage.reserveQuota(dev("five"));
        await expectQuotaError(usage.reserveQuota(dev("five")), 429, "DAILY_QUOTA_EXCEEDED");
        process.env.DAILY_API_QUOTA = "3";
    });

    await test("DAILY_API_QUOTA validation", async () => {
        const original = process.env.DAILY_API_QUOTA;
        delete process.env.DAILY_API_QUOTA;
        assert.strictEqual(quotaConfig.getDailyQuota(), 3);
        process.env.DAILY_API_QUOTA = "";
        assert.strictEqual(quotaConfig.getDailyQuota(), 3);
        for (const bad of ["0", "-1", "2.5", "abc", "3x"]) {
            process.env.DAILY_API_QUOTA = bad;
            assert.throws(() => quotaConfig.getDailyQuota(), /positive integer/);
        }
        process.env.DAILY_API_QUOTA = original;
    });

    console.log("HTTP level (MOCK_GENERATION=true)");

    await test("POST /api/hairstyle: 3 succeed with unchanged shape, 4th is 429", async () => {
        for (let i = 0; i < 3; i++) {
            const r = await generate({ device_id: dev("http"), hair_style: "Bob", color: "red" });
            assert.strictEqual(r.status, 200);
            assert.strictEqual(r.data.success, true);
            assert(r.data.image);
            assert.strictEqual(r.data.quota.remaining, 2 - i);
            assert(r.data.message.includes(i === 2 ? "last generation" : `${2 - i} of 3`), r.data.message);
        }
        const r = await generate({ device_id: dev("http"), hair_style: "Bob", color: "red" });
        assert.strictEqual(r.status, 429);
        assert.strictEqual(r.data.success, false);
        assert.strictEqual(r.data.code, "DAILY_QUOTA_EXCEEDED");
        assert(r.data.error);
    });

    await test("beard requests share the same quota", async () => {
        const id = dev("beard");
        for (let i = 0; i < 3; i++) {
            const r = await generate({ device_id: id, beard_style: "Goatee" });
            assert.strictEqual(r.status, 200);
        }
        const r = await generate({ device_id: id, beard_style: "Goatee" });
        assert.strictEqual(r.status, 429);
    });

    await test("validation failures and missing device_id cost no quota", async () => {
        const id = dev("val");
        assert.strictEqual((await generate({ device_id: id, hair_style: "Bob" })).status, 500); // no color
        assert.strictEqual((await generate({ device_id: id, beard_style: "Nope" })).status, 500);
        assert.strictEqual((await generate({ hair_style: "Bob", color: "red" })).status, 400);
        assert.strictEqual((await generate({ device_id: "  ", hair_style: "Bob", color: "red" })).status, 400);
        assert.strictEqual((await usage.getDailyStats(id)).used, 0);
    });

    await test("POST /api/check-free-limit reports quota and never consumes it", async () => {
        const id = dev("chk");
        let r = await check({ device_id: id });
        assert.strictEqual(r.status, 200);
        assert.strictEqual(r.data.data.remaining, 3);
        assert.strictEqual(r.data.data.image_generation, true);
        await generate({ device_id: id, hair_style: "Bob", color: "red" });
        r = await check({ device_id: id });
        assert.strictEqual(r.data.data.used, 1);
        assert.strictEqual(r.data.data.remaining, 2);
        r = await check({ device_id: id });
        assert.strictEqual(r.data.data.used, 1);
        assert.strictEqual((await check({})).status, 400);
    });

    await test("concurrent HTTP generation requests cannot exceed the quota", async () => {
        const id = dev("httprace");
        const rs = await Promise.all(
            Array.from({ length: 20 }, () =>
                generate({ device_id: id, hair_style: "Bob", color: "red" })
            )
        );
        assert.strictEqual(rs.filter((r) => r.status === 200).length, 3);
        assert.strictEqual(rs.filter((r) => r.status === 429).length, 17);
    });

    server.close();
    await mongoose.disconnect();
    console.log(`\n${passed} passed${process.exitCode ? ", some FAILED" : ""}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
