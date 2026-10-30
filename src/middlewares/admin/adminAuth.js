const crypto = require("crypto");

/**
 * Minimal stateless admin auth (no extra dependencies).
 *
 * ADMIN_USERNAME / ADMIN_PASSWORD - credentials. If the password is unset the
 *                                   admin panel is disabled (503).
 * ADMIN_SESSION_SECRET            - HMAC key for session tokens. Falls back to a
 *                                   random per-process key (sessions then end on
 *                                   every restart).
 * ADMIN_SESSION_HOURS             - token lifetime, default 12.
 */

const fallbackSecret = crypto.randomBytes(32).toString("hex");

function secret() {
    return process.env.ADMIN_SESSION_SECRET || fallbackSecret;
}

function sessionMs() {
    const hours = Number(process.env.ADMIN_SESSION_HOURS);
    return (Number.isFinite(hours) && hours > 0 ? hours : 12) * 3600 * 1000;
}

function isConfigured() {
    return Boolean(process.env.ADMIN_PASSWORD);
}

function safeEqual(a, b) {
    // Hash first so both buffers have equal length for timingSafeEqual.
    const ha = crypto.createHash("sha256").update(String(a)).digest();
    const hb = crypto.createHash("sha256").update(String(b)).digest();
    return crypto.timingSafeEqual(ha, hb);
}

function checkCredentials(username, password) {
    if (!isConfigured()) return false;
    const expectedUser = process.env.ADMIN_USERNAME || "admin";
    // Evaluate both so timing does not reveal which one was wrong.
    const userOk = safeEqual(username ?? "", expectedUser);
    const passOk = safeEqual(password ?? "", process.env.ADMIN_PASSWORD);
    return userOk && passOk;
}

function sign(payload) {
    return crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
}

function issueToken(username) {
    const payload = Buffer.from(
        JSON.stringify({ u: username, exp: Date.now() + sessionMs() })
    ).toString("base64url");
    return { token: `${payload}.${sign(payload)}`, expires_in: sessionMs() };
}

function verifyToken(token) {
    if (typeof token !== "string") return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;

    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString());
        return data.exp > Date.now() ? data : null;
    } catch {
        return null;
    }
}

function requireAdmin(req, res, next) {
    if (!isConfigured()) {
        return res.status(503).json({
            success: false,
            message: "Admin panel is disabled. Set ADMIN_PASSWORD in .env."
        });
    }

    const header = req.get("authorization") || "";
    const session = verifyToken(header.startsWith("Bearer ") ? header.slice(7) : "");

    if (!session) {
        return res.status(401).json({ success: false, message: "Please sign in again." });
    }

    req.admin = session;
    next();
}

module.exports = { isConfigured, checkCredentials, issueToken, requireAdmin };
