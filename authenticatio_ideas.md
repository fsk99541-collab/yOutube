// utils/authTokens.js
import jwt from "jsonwebtoken";
import crypto from "crypto";

const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || "15m";        // e.g. "15m"
const REFRESH_TTL = process.env.REFRESH_TOKEN_TTL || "30d";     // e.g. "30d"
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.error("Missing ACCESS_TOKEN_SECRET or REFRESH_TOKEN_SECRET");
  // don't throw here; let app startup fail if you prefer
}

export function createAccessToken(payload) {
  // payload should include at least { sub: userId, role?: ... }
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

export function createRefreshToken(payloadWithJti) {
  // include a jti (token id) for rotation/revocation
  // payloadWithJti: { sub: userId, jti: "<uuid-or-random>" }
  return jwt.sign(payloadWithJti, REFRESH_SECRET, { expiresIn: REFRESH_TTL });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, ACCESS_SECRET);
}
export function verifyRefreshToken(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

export function newTokenId() {
  // token id stored in JWT jti and hashed in DB
  return crypto.randomBytes(32).toString("hex");
}

export function hashTokenId(tokenId) {
  return crypto.createHash("sha256").update(tokenId).digest("hex");
}

// cookie options factory
export function cookieOptions(req) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,                     // only send over HTTPS in prod
    sameSite: isProd ? "lax" : "lax",   // "lax" works well for most sites; consider "strict" or "none" with cross-site considerations
    // If your web frontend is on a different domain you may need `sameSite: "none"` and `secure: true`
    path: "/",
    // consider setting domain if using subdomains
  };
}


// middleware/auth.middleware.js
import jwt from "jsonwebtoken";
import { asyncHandler } from "../utils/asyncHandler.js";
import { User } from "../models/user.model.js";
import { verifyAccessToken } from "../utils/authTokens.js";

export const verifyAuth = asyncHandler(async (req, res, next) => {
  // 1) Extract token: Prefer Authorization header (mobile); fallback to cookie (web)
  const header = req.get?.("authorization") ?? req.headers.authorization;
  const cookieToken = req.cookies?.access_token;
  let token;

  if (header && header.startsWith("Bearer ")) {
    token = header.split(" ")[1];
  } else if (cookieToken) {
    token = cookieToken;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: "no_token" });
  }

  let payload;
  try {
    payload = verifyAccessToken(token); // throws if invalid/expired
  } catch (err) {
    // unify errors for client; clients should check error codes/messages
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ success: false, error: "token_expired" });
    }
    return res.status(401).json({ success: false, error: "invalid_token" });
  }

  // Accept common claim names
  const userId = payload.sub ?? payload.id ?? payload.userId;
  if (!userId) {
    return res.status(401).json({ success: false, error: "malformed_token" });
  }

  // Fetch minimal user and run revocation checks
  const user = await User.findById(userId).select("+passwordChangedAt role email").lean();
  if (!user) return res.status(401).json({ success: false, error: "user_not_found" });

  // Revoke tokens issued before password change
  if (user.passwordChangedAt) {
    const pwdChangedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000);
    if (payload.iat && payload.iat < pwdChangedAtSec) {
      return res.status(401).json({ success: false, error: "token_revoked" });
    }
  }

  // Attach sanitized user to req
  req.user = {
    id: user._id,
    email: user.email,
    role: user.role,
  };

  next();
});


// routes/auth.routes.js (or controller)
import express from "express";
import { User } from "../models/user.model.js";
import { createAccessToken, createRefreshToken, verifyRefreshToken, newTokenId, hashTokenId, cookieOptions } from "../utils/authTokens.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

// Helper to save hashed refresh token on user record
async function saveRefreshTokenForUser(userId, jtiHash, expiresAt, meta = {}) {
  // keep only N recent tokens or prune old ones as needed
  await User.findByIdAndUpdate(userId, {
    $push: { refreshTokens: { tokenHash: jtiHash, expiresAt, meta } }
  });
}

// Refresh endpoint (cookie or body)
router.post("/refresh", asyncHandler(async (req, res) => {
  const incoming = req.cookies?.refresh_token || req.body?.refresh_token || req.get("x-refresh-token");
  if (!incoming) {
    return res.status(401).json({ success: false, error: "no_refresh_token" });
  }

  let payload;
  try {
    payload = verifyRefreshToken(incoming);
  } catch (err) {
    return res.status(401).json({ success: false, error: "invalid_refresh" });
  }

  const userId = payload.sub;
  const jti = payload.jti;
  if (!userId || !jti) {
    return res.status(401).json({ success: false, error: "malformed_refresh" });
  }

  const jtiHash = hashTokenId(jti);
  // find user and token entry
  const user = await User.findOne({
    _id: userId,
    "refreshTokens.tokenHash": jtiHash
  });

  if (!user) {
    // token not known / revoked
    return res.status(401).json({ success: false, error: "refresh_revoked" });
  }

  // Rotation: remove the old refresh token entry and issue a new one
  await User.updateOne(
    { _id: userId },
    { $pull: { refreshTokens: { tokenHash: jtiHash } } }
  );

  // create new tokens
  const newJti = newTokenId();
  const newRefreshToken = createRefreshToken({ sub: userId, jti: newJti });
  const newAccessToken = createAccessToken({ sub: userId, role: user.role });

  // store new hashed jti with expiry
  const decodedRefresh = jwt.decode(newRefreshToken); // safe to decode for exp
  const expiresAt = decodedRefresh?.exp ? new Date(decodedRefresh.exp * 1000) : undefined;
  await saveRefreshTokenForUser(userId, hashTokenId(newJti), expiresAt, { ip: req.ip, ua: req.get("user-agent") });

  // send cookies for web or JSON for mobile
  const ckOpts = cookieOptions(req);
  res.cookie("access_token", newAccessToken, { ...ckOpts, maxAge: 15 * 60 * 1000 }); // example 15m
  res.cookie("refresh_token", newRefreshToken, { ...ckOpts, httpOnly: true, maxAge: 30 * 24 * 60 * 60 * 1000 }); // example 30d

  // also return JSON so mobile clients using headers can read tokens
  return res.json({
    success: true,
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  });
}));

export default router;


// login -> issue access + refresh, store hashed refresh jti
router.post("/login", asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;
  const user = await User.findOne({ email }).select("+password");
  if (!user || !(await user.comparePassword(password))) {
    return res.status(401).json({ success: false, error: "invalid_credentials" });
  }

  const accessToken = createAccessToken({ sub: user._id, role: user.role });
  const jti = newTokenId();
  const refreshToken = createRefreshToken({ sub: user._id, jti });

  const decodedRefresh = jwt.decode(refreshToken);
  const expiresAt = decodedRefresh?.exp ? new Date(decodedRefresh.exp * 1000) : undefined;

  // save hashed jti (rotate/prune old tokens as needed)
  await saveRefreshTokenForUser(user._id, hashTokenId(jti), expiresAt, { deviceId, ip: req.ip, ua: req.get("user-agent") });

  // Set cookies for web; also return tokens for mobile
  const ck = cookieOptions(req);
  res.cookie("access_token", accessToken, { ...ck, maxAge: 15*60*1000 });
  res.cookie("refresh_token", refreshToken, { ...ck, maxAge: 30*24*60*60*1000 });

  res.json({ success: true, accessToken, refreshToken });
}));

// logout -> remove refresh token entry(s)
router.post("/logout", asyncHandler(async (req, res) => {
  const incomingRefresh = req.cookies?.refresh_token || req.body?.refresh_token || req.get("x-refresh-token");
  if (incomingRefresh) {
    try {
      const payload = verifyRefreshToken(incomingRefresh);
      const tokenHash = hashTokenId(payload.jti);
      await User.updateOne({ _id: payload.sub }, { $pull: { refreshTokens: { tokenHash } } });
    } catch (e) {
      // ignore - token may be invalid/expired already
    }
  }

  // clear cookies
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  return res.json({ success: true });
}));

CSRF considerations for website flow

When using cookies for authentication on a browser-based website you must protect state-changing endpoints from CSRF:
easiest: use the double-submit cookie pattern (server sets a csrf_token cookie readable by JS and client sends it in header).
or require custom header / same-site cookies + CORS rules to reduce surface.
Mobile apps sending Authorization headers are not vulnerable to classic CSRF.

export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ success: false, error: "not_authenticated" });
    if (!allowedRoles.includes(req.user.role)) return res.status(403).json({ success: false, error: "forbidden" });
    next();
  };
}
How this maps to frontends

Mobile apps (Android/iOS)

Use Authorization header for API calls. Store access token in EncryptedSharedPreferences / Keystore (Android) or Keychain (iOS). Store refresh token securely (Keystore/Keychain). On 401 with token_expired, call /refresh to rotate tokens and retry the request.

Websites

Prefer cookie-based flow with HttpOnly & Secure cookies for access/refresh tokens. Protect state-changing endpoints with CSRF. The browser will automatically send cookies, so the server must identify and verify them. On token expiry, the frontend can call /refresh (or the site can attempt silent refresh in an iframe if using OAuth-like flows) and then retry.

Final security reminders (production checklist)

HTTPS everywhere, HSTS.

Short access token TTL (minutes), refresh token rotation & pruning.

Store hashed refresh token identifiers in DB (never store raw refresh JWTs).

Rate-limit /login and /refresh.

Monitor refresh token usage for unusual device/IP changes.

Log auth events (login, refresh, logout, revocation).

Use SameSite cookie strategy appropriate to your frontend topology (same origin vs cross-site).

Consider refresh token compromise detection and compromise response (revoke all tokens for a user, force password change).

If you want I can:

adapt the code to your exact User schema (paste it) so the DB updates match your fields, or

produce a small sequence diagram for how mobile vs web flows differ, or

give a compact Retrofit/OkHttp interceptor + Android code to pair with this backend.
