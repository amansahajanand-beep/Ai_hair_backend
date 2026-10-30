/**
 * Onboarding schedule tests (country-wise, day-wise limits for new users).
 *
 *   TEST_MONGODB_URI=mongodb://127.0.0.1:27017/hair-onboarding-test node scripts/test-onboarding-schedule.js
 *
 * Use a throwaway database: it is dropped at the end.
 */
require("dotenv").config();
process.env.MOCK_GENERATION = "true";
process.env.DAILY_API_QUOTA = "3";
process.env.QUOTA_TIMEZONE = "UTC";

const assert = require("assert");
const mongoose = require("mongoose");

const uri = process.env.TEST_MONGODB_URI;
if (!uri) {
    console.error("Set TEST_MONGODB_URI to a throwaway database.");
    process.exit(1);
}

const usage = require("../src/services/hairstyle-api/usage.service");
const entitlement = require("../src/services/hairstyle-api/entitlement.service");
const QuotaPolicy = require("../src/models/quotaPolicy.model");
const Device = require("../src/models/device.model");
const DailyApiUsage = require("../src/models/dailyApiUsage.model");

const DAY = 86400000;
const start = new Date("2030-01-01T10:00:00Z");
const at = (n) => new Date(start.getTime() + n * DAY); // n = days since first launch

async function used(deviceId, now) {
    const s = await usage.getDailyStats(deviceId, now);
    return s;
}

/** Generates until the API says no; returns how many succeeded (capped). */
async function drain(deviceId, now, ctx, cap = 50) {
    let ok = 0;
    for (; ok < cap; ok++) {
        try {
            await usage.reserveQuota(deviceId, now, ctx);
        } catch (e) {
            assert.strictEqual(e.code, "DAILY_QUOTA_EXCEEDED");
            break;
        }
    }
    return ok;
}

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

test("country detection: CDN header, then IP, then body", () => {
    const req = (headers, body) => ({ get: (h) => headers[h.toLowerCase()], body });
    assert.strictEqual(entitlement.detectCountry(req({ "cf-ipcountry": "in" }, { country: "US" })), "IN");
    assert.strictEqual(entitlement.detectCountry(req({}, { country: "us" })), "US");
    assert.strictEqual(entitlement.detectCountry(req({ "cf-ipcountry": "XX" }, {})), null);
    // IP lookup beats the body field; private IPs fall through to the body.
    const withIp = (ip, body) => ({ ip, get: () => undefined, body });
    assert.strictEqual(entitlement.detectCountry(withIp("8.8.8.8", { country: "IN" })), "US");
    assert.strictEqual(entitlement.detectCountry(withIp("::ffff:8.8.8.8", {})), "US");
    assert.strictEqual(entitlement.detectCountry(withIp("127.0.0.1", { country: "IN" })), "IN");
    assert.strictEqual(entitlement.detectCountry(withIp("127.0.0.1", {})), null);
    assert.strictEqual(entitlement.detectCountry(req({}, { country: "USA" })), null);
    assert.strictEqual(entitlement.detectCountry(req({}, { country: { $ne: 1 } })), null);
});

test("US new user follows day 1..6 limits, then unlimited", async () => {
    await QuotaPolicy.create({ country: "US", day_limits: [6, 4, 3, 2, 2, 1], after_limit: null });
    const ctx = { country: "US" };
    const expected = [6, 4, 3, 2, 2, 1];

    for (let day = 0; day < 6; day++) {
        const got = await drain("us-user", at(day), ctx);
        assert.strictEqual(got, expected[day], `day ${day + 1}: expected ${expected[day]}, got ${got}`);
    }

    // Day 7 onwards: no limit.
    assert.strictEqual(await drain("us-user", at(6), ctx, 40), 40);
    const s = await used("us-user", at(6));
    assert.strictEqual(s.unlimited, true);
    assert.strictEqual(s.phase, "unlimited");
    assert.strictEqual(s.exceeded, false);
    assert.strictEqual(await drain("us-user", at(20), ctx, 10), 10);
});

test("day-1 stats reported before any generation", async () => {
    const s = await usage.getDailyStats("peek-user", at(0), { country: "US" });
    assert.strictEqual(s.day, 1);
    assert.strictEqual(s.daily_limit, 6);
    assert.strictEqual(s.remaining, 6);
    assert.strictEqual(s.phase, "onboarding");
});

test("countries are independent; unlisted country uses DEFAULT then standard", async () => {
    await QuotaPolicy.create({ country: "IN", day_limits: [2, 2, 2, 2, 2, 2] });
    assert.strictEqual(await drain("in-user", at(0), { country: "IN" }), 2);

    // No DEFAULT policy yet: falls back to DAILY_API_QUOTA (3) forever.
    assert.strictEqual(await drain("fr-user", at(0), { country: "FR" }), 3);
    assert.strictEqual(await drain("fr-user", at(30), { country: "FR" }), 3);

    await QuotaPolicy.create({ country: "DEFAULT", day_limits: [5, 5, 5, 5, 5, 5] });
    assert.strictEqual(await drain("de-user", at(0), { country: "DE" }), 5);
    assert.strictEqual(await drain("nocountry-user", at(0), {}), 5);
});

test("admin changes apply immediately", async () => {
    await QuotaPolicy.updateOne({ country: "IN" }, { day_limits: [9, 9, 9, 9, 9, 9] });
    assert.strictEqual(await drain("in-user2", at(0), { country: "IN" }), 9);
    await QuotaPolicy.updateOne({ country: "IN" }, { enabled: false });
    // IN paused -> DEFAULT (5)
    assert.strictEqual(await drain("in-user3", at(0), { country: "IN" }), 5);
    await QuotaPolicy.updateOne({ country: "IN" }, { enabled: true });
});

test("0 blocks a day entirely", async () => {
    await QuotaPolicy.create({ country: "BR", day_limits: [0, 1, 1, 1, 1, 1] });
    assert.strictEqual(await drain("br-user", at(0), { country: "BR" }), 0);
    assert.strictEqual(await drain("br-user", at(1), { country: "BR" }), 1);
});

test("admin can choose any schedule length (3 days, 10 days)", async () => {
    await QuotaPolicy.create({ country: "CA", day_limits: [4, 2, 1], after_limit: null });
    for (let d = 0; d < 3; d++) {
        assert.strictEqual(await drain("ca-user", at(d), { country: "CA" }), [4, 2, 1][d]);
    }
    assert.strictEqual(await drain("ca-user", at(3), { country: "CA" }, 25), 25); // day 4 = unlimited

    const ten = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
    await QuotaPolicy.create({ country: "AU", day_limits: ten, after_limit: null });
    for (let d = 0; d < 10; d++) {
        assert.strictEqual(await drain("au-user", at(d), { country: "AU" }), ten[d], "day " + (d + 1));
    }
    assert.strictEqual(await drain("au-user", at(10), { country: "AU" }, 25), 25); // day 11 = unlimited
    const s = await usage.getDailyStats("au-user2", at(0), { country: "AU" });
    assert.strictEqual(s.day, 1);

    // shortening a rule applies to devices already mid-schedule
    await QuotaPolicy.updateOne({ country: "AU" }, { day_limits: [10, 9], after_limit: null });
    assert.strictEqual(await drain("au-user2", at(2), { country: "AU" }, 25), 25);
});

test("policy validation: 1 to 90 days only", async () => {
    await assert.rejects(QuotaPolicy.create({ country: "NZ", day_limits: [] }));
    await assert.rejects(QuotaPolicy.create({ country: "NZ", day_limits: Array(91).fill(1) }));
    await QuotaPolicy.create({ country: "NZ", day_limits: Array(90).fill(1) });
    await QuotaPolicy.create({ country: "SG", day_limits: [2] });
});

test("existing (pre-feature) devices keep the flat daily quota", async () => {
    await DailyApiUsage.create({ device_id: "old-user", date: "2029-12-01", used_count: 1 });
    assert.strictEqual(await drain("old-user", at(0), { country: "US" }), 3);
    assert.strictEqual(await drain("old-user", at(40), { country: "US" }), 3);
    const d = await Device.findOne({ device_id: "old-user" }).lean();
    assert.strictEqual(d.legacy, true);
});

test("country is fixed at first sight; filled in later if first unknown", async () => {
    await usage.getDailyStats("late-country", at(0), {});
    await usage.getDailyStats("late-country", at(0), { country: "US" });
    await usage.getDailyStats("late-country", at(0), { country: "IN" });
    const d = await Device.findOne({ device_id: "late-country" }).lean();
    assert.strictEqual(d.country, "US");
});

test("concurrent requests never exceed a day limit", async () => {
    const results = await Promise.allSettled(
        Array.from({ length: 40 }, () => usage.reserveQuota("race-user", at(0), { country: "US" }))
    );
    assert.strictEqual(results.filter((r) => r.status === "fulfilled").length, 6);
});

test("failed generation gives the unit back", async () => {
    const r = await usage.reserveQuota("refund-user", at(0), { country: "US" });
    await usage.releaseQuota(r);
    assert.strictEqual((await usage.getDailyStats("refund-user", at(0), { country: "US" })).used, 0);
});

test("after the last day the admin-set constant limit applies", async () => {
    await QuotaPolicy.create({ country: "ES", day_limits: [5, 4, 3], after_limit: 2 });
    for (let d = 0; d < 3; d++) {
        assert.strictEqual(await drain("es-user", at(d), { country: "ES" }), [5, 4, 3][d], "es day " + (d + 1));
    }
    // day 4, 5, 20: constant 2/day
    for (const d of [3, 4, 19]) {
        assert.strictEqual(await drain("es-user", at(d), { country: "ES" }), 2, "day " + (d + 1));
    }
    const st = await usage.getDailyStats("es-user", at(19), { country: "ES" });
    assert.deepStrictEqual([st.daily_limit, st.unlimited, st.phase], [2, false, "ongoing"]);

    // after_limit 0 blocks entirely after the schedule
    await QuotaPolicy.create({ country: "SE", day_limits: [3], after_limit: 0 });
    assert.strictEqual(await drain("se-user", at(0), { country: "SE" }), 3, "se d1");
    assert.strictEqual(await drain("se-user", at(1), { country: "SE" }), 0);

    // older policies without after_limit keep the last day's limit
    await QuotaPolicy.collection.insertOne({ country: "NO", enabled: true, day_limits: [4, 2] });
    assert.strictEqual(await drain("no-user", at(0), { country: "NO" }), 4, "no d1");
    assert.strictEqual(await drain("no-user", at(5), { country: "NO" }), 2);
});

test("admin-set limit for countries without a rule (every day)", async () => {
    const settings = require("../src/services/hairstyle-api/settings.service");
    // no policy covers BR2-style countries here; use one with no rule and no DEFAULT
    await QuotaPolicy.deleteOne({ country: "DEFAULT" });
    assert.strictEqual((await settings.getFallbackLimit()).source, "env");
    await settings.setFallbackLimit(7, "test");
    assert.deepStrictEqual(await settings.getFallbackLimit(), { limit: 7, source: "admin" });

    for (const d of [0, 1, 40]) {
        assert.strictEqual(await drain("zz-user", at(d), { country: "JP" }), 7, "day " + (d + 1));
    }
    // a country with its own rule is unaffected
    assert.strictEqual(await drain("es2-user", at(0), { country: "ES" }), 5);
    // existing (legacy) users keep the .env quota
    await require("../src/models/dailyApiUsage.model").create({ device_id: "old-fb", date: "2000-01-01", used_count: 1 });
    assert.strictEqual(await drain("old-fb", at(0), { country: "JP" }), 3);
    // 0 blocks; clearing goes back to .env
    await settings.setFallbackLimit(0, "test");
    assert.strictEqual(await drain("zz-user2", at(0), { country: "JP" }), 0);
    await settings.setFallbackLimit(null);
    assert.strictEqual((await settings.getFallbackLimit()).source, "env");
});

test("quotaSummary for unlimited and onboarding", async () => {
    const r = await usage.reserveQuota("us-user", at(9), { country: "US" });
    const q = usage.quotaSummary(r, at(9)).quota;
    assert.strictEqual(q.unlimited, true);
    const r2 = await usage.reserveQuota("sum-user", at(0), { country: "US" });
    const q2 = usage.quotaSummary(r2, at(0)).quota;
    assert.deepStrictEqual([q2.daily_limit, q2.remaining, q2.day, q2.phase], [6, 5, 1, "onboarding"]);
});

(async () => {
    await mongoose.connect(uri);
    await mongoose.connection.dropDatabase();
    await Promise.all([QuotaPolicy.init(), Device.init(), DailyApiUsage.init()]);

    let failed = 0;
    for (const [name, fn] of tests) {
        try {
            await fn();
            console.log("  ok  ", name);
        } catch (e) {
            failed++;
            console.log("  FAIL", name, "\n      ", e.message);
        }
    }

    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    console.log(failed ? `\n${failed} failed` : "\nall passed");
    process.exit(failed ? 1 : 0);
})();
