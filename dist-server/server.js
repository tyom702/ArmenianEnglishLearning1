// server.ts
import express2 from "express";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";

// src/server/apiApp.ts
import express from "express";

// src/utils/tokenSecurity.ts
import crypto from "crypto";
var OFFICIAL_OWNER_EMAIL = "kurghinyanartyom2@gmail.com";
var FIREBASE_PROJECT_ID = "ungoogly-sorter-6v9wh";
var EPHEMERAL_FALLBACK_SECRET = crypto.randomBytes(32).toString("hex");
var getServerSecret = () => process.env.SESSION_SECRET && process.env.SESSION_SECRET.trim().length >= 16 ? process.env.SESSION_SECRET.trim() : EPHEMERAL_FALLBACK_SECRET;
function createSignedSessionToken(userId, email) {
  const cleanEmail = email.trim().toLowerCase();
  const isOwner = cleanEmail === OFFICIAL_OWNER_EMAIL.toLowerCase();
  const role = isOwner ? "super_admin" : "student";
  const payload = {
    userId,
    email: cleanEmail,
    role,
    issuedAt: Date.now(),
    expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1e3
    // 30 days
  };
  const payloadJson = JSON.stringify(payload);
  const payloadBase64 = Buffer.from(payloadJson).toString("base64url");
  const signature = crypto.createHmac("sha256", getServerSecret()).update(payloadBase64).digest("base64url");
  return `${payloadBase64}.${signature}`;
}
function verifySignedSessionToken(token) {
  try {
    if (!token || typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadBase64, signature] = parts;
    const expectedSig = crypto.createHmac("sha256", getServerSecret()).update(payloadBase64).digest("base64url");
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson);
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return null;
    }
    if (payload.role === "super_admin" && payload.email.toLowerCase() !== OFFICIAL_OWNER_EMAIL.toLowerCase()) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
var GOOGLE_CERTS_URL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com";
var cachedCerts = null;
var cachedCertsExpiresAt = 0;
async function fetchGooglePublicCerts() {
  if (cachedCerts && Date.now() < cachedCertsExpiresAt) {
    return cachedCerts;
  }
  const res = await fetch(GOOGLE_CERTS_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch Firebase public keys: HTTP ${res.status}`);
  }
  const cacheControl = res.headers.get("cache-control") || "";
  const maxAgeMatch = cacheControl.match(/max-age=(\d+)/i);
  const maxAgeMs = maxAgeMatch ? Number(maxAgeMatch[1]) * 1e3 : 3600 * 1e3;
  const certs = await res.json();
  cachedCerts = certs;
  cachedCertsExpiresAt = Date.now() + maxAgeMs;
  return certs;
}
async function verifyFirebaseIdToken(idToken, projectId = FIREBASE_PROJECT_ID) {
  try {
    if (!idToken || typeof idToken !== "string") return null;
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf8"));
    if (header.alg !== "RS256" || !header.kid) {
      return null;
    }
    const certs = await fetchGooglePublicCerts();
    const cert = certs[header.kid];
    if (!cert) {
      return null;
    }
    const verifier = crypto.createVerify("RSA-SHA256");
    verifier.update(`${headerB64}.${payloadB64}`);
    verifier.end();
    const isValidSig = verifier.verify(cert, signatureB64, "base64url");
    if (!isValidSig) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1e3);
    if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}` || !payload.sub || typeof payload.sub !== "string" || payload.sub.length > 128 || !payload.exp || payload.exp <= nowSec || !payload.iat || payload.iat > nowSec + 300) {
      return null;
    }
    return {
      uid: payload.sub,
      email: (payload.email || "").trim().toLowerCase(),
      emailVerified: payload.email_verified === true,
      name: payload.name,
      picture: payload.picture
    };
  } catch {
    return null;
  }
}
function timingSafeStringMatch(a, b) {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// src/server/apiApp.ts
var serverAds = [
  {
    id: "ad_demo_it_english",
    businessName: "Yerevan Tech Language Hub",
    contactEmail: "partner@yerevantechhub.am",
    contactPhone: "+374 10 55-44-33",
    headline: "IT & Business English Intensive Bootcamp",
    adText: "Specialized 8-week English communication courses for Armenian software developers, PMs, and designers.",
    callToAction: "Get 20% Discount",
    targetUrl: "https://hayenglish.am/partners/tech-hub",
    imageUrl: "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=400&q=80",
    placement: "hero_top",
    duration: "30_days",
    status: "active",
    price: 6e4,
    currency: "AMD",
    adminNotes: "High-value partner. Approved for hero banner placement.",
    submittedAt: "2026-09-10T10:00:00Z",
    reviewedAt: "2026-09-10T11:00:00Z",
    paidAt: "2026-09-10T12:00:00Z",
    expiresAt: "2026-10-10T12:00:00Z"
  },
  {
    id: "ad_demo_cambridge_ielts",
    businessName: "IELTS Prep Armenia (Kentron)",
    contactEmail: "prep@ieltsarmenia.am",
    contactPhone: "+374 91 12-34-56",
    headline: "Achieve Band 7.5+ in IELTS Academic",
    adText: "Certified British Council trainers in Yerevan. Individual speaking mock tests with native teachers.",
    callToAction: "Free Diagnostic Test",
    targetUrl: "https://hayenglish.am/partners/ielts-center",
    imageUrl: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=400&q=80",
    placement: "sidebar_dashboard",
    duration: "14_days",
    status: "active",
    price: 35e3,
    currency: "AMD",
    adminNotes: "Promoted in student dashboard alongside CEFR levels.",
    submittedAt: "2026-09-15T09:30:00Z",
    reviewedAt: "2026-09-15T10:15:00Z",
    paidAt: "2026-09-15T11:00:00Z",
    expiresAt: "2026-09-29T11:00:00Z"
  }
];
var serverProgressStore = /* @__PURE__ */ new Map();
var authenticateSession = async (req, _res, next) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    req.userSession = void 0;
    return next();
  }
  const verified = verifySignedSessionToken(token);
  if (verified) {
    req.userSession = verified;
    return next();
  }
  const firebaseUser = await verifyFirebaseIdToken(token);
  if (firebaseUser && firebaseUser.email) {
    const isOwner = firebaseUser.emailVerified && firebaseUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
    req.userSession = {
      userId: firebaseUser.uid,
      email: firebaseUser.email,
      role: isOwner ? "super_admin" : "student",
      issuedAt: Date.now(),
      expiresAt: Date.now() + 3600 * 1e3
    };
  }
  next();
};
var requireOwnerSuperAdmin = (req, res, next) => {
  const session = req.userSession;
  if (!session || session.role !== "super_admin" || session.email.toLowerCase() !== OFFICIAL_OWNER_EMAIL.toLowerCase()) {
    res.status(403).json({
      error: "Access Denied: Only the official website owner (kurghinyanartyom2@gmail.com) has access to the Admin Panel.",
      authorized: false,
      ownerRequired: OFFICIAL_OWNER_EMAIL
    });
    return;
  }
  next();
};
function createApiApp() {
  const app = express();
  const configuredOrigins = (process.env.ALLOWED_ORIGINS || "").split(",").map((o) => o.trim()).filter(Boolean);
  app.use("/api", (req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    const origin = req.headers.origin;
    if (origin && configuredOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    }
    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  app.use(authenticateSession);
  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "hayenglish-api",
      timestamp: (/* @__PURE__ */ new Date()).toISOString()
    });
  });
  app.post("/api/auth/token", async (req, res) => {
    const { userId, email, idToken, adminPasscode } = req.body || {};
    if (typeof idToken === "string" && idToken.trim().length > 0) {
      const fbUser = await verifyFirebaseIdToken(idToken.trim());
      if (!fbUser || !fbUser.email) {
        res.status(401).json({ error: "Invalid or expired Firebase ID token." });
        return;
      }
      const isOwner = fbUser.emailVerified && fbUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
      if (fbUser.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase() && !fbUser.emailVerified) {
        res.status(403).json({ error: "Owner email must be verified to receive super_admin role." });
        return;
      }
      const token2 = createSignedSessionToken(fbUser.uid, fbUser.email);
      res.json({
        success: true,
        token: token2,
        userId: fbUser.uid,
        email: fbUser.email,
        isOwner,
        role: isOwner ? "super_admin" : "student"
      });
      return;
    }
    if (!email || !userId || typeof email !== "string" || typeof userId !== "string") {
      res.status(400).json({ error: "Missing userId or email" });
      return;
    }
    const cleanEmail = email.trim().toLowerCase();
    const cleanUserId = userId.trim();
    const isOwnerEmail = cleanEmail === OFFICIAL_OWNER_EMAIL.toLowerCase();
    if (isOwnerEmail) {
      const envPasscode = process.env.ADMIN_PASSCODE?.trim();
      const hasValidPasscode = Boolean(envPasscode) && typeof adminPasscode === "string" && timingSafeStringMatch(adminPasscode, envPasscode);
      const alreadyVerifiedOwner = req.userSession?.role === "super_admin" && req.userSession.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
      if (!hasValidPasscode && !alreadyVerifiedOwner) {
        res.status(401).json({
          error: "Owner authentication requires verified Google Sign-In (Firebase Auth) or server ADMIN_PASSCODE.",
          requiresGoogleAuth: true
        });
        return;
      }
    }
    const token = createSignedSessionToken(cleanUserId, cleanEmail);
    res.json({
      success: true,
      token,
      userId: cleanUserId,
      email: cleanEmail,
      isOwner: isOwnerEmail,
      role: isOwnerEmail ? "super_admin" : "student"
    });
  });
  app.get("/api/auth/verify", (req, res) => {
    const session = req.userSession;
    if (!session) {
      res.json({
        authenticated: false,
        isOwner: false,
        role: "guest"
      });
      return;
    }
    const isOwner = session.role === "super_admin" && session.email.toLowerCase() === OFFICIAL_OWNER_EMAIL.toLowerCase();
    res.json({
      authenticated: true,
      email: session.email,
      userId: session.userId,
      role: session.role,
      isOwner
    });
  });
  app.get("/api/admin/check-access", requireOwnerSuperAdmin, (_req, res) => {
    res.json({
      authorized: true,
      owner: OFFICIAL_OWNER_EMAIL,
      role: "super_admin",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      serverMessage: "Welcome Website Owner. Admin Desk access granted."
    });
  });
  app.get("/api/admin/ads", requireOwnerSuperAdmin, (_req, res) => {
    res.json({
      success: true,
      ads: serverAds
    });
  });
  app.post("/api/admin/ads/review", requireOwnerSuperAdmin, (req, res) => {
    const { adId, price, status, adminNotes } = req.body || {};
    if (typeof adId !== "string") {
      res.status(400).json({ error: "Invalid adId" });
      return;
    }
    const target = serverAds.find((a) => a.id === adId);
    if (!target) {
      res.status(404).json({ error: "Ad request not found" });
      return;
    }
    if (price !== void 0 && Number.isFinite(Number(price)) && Number(price) >= 0) {
      target.price = Number(price);
    }
    if (typeof status === "string" && ["pending_review", "approved", "active", "rejected"].includes(status)) {
      target.status = status;
    }
    if (typeof adminNotes === "string") {
      target.adminNotes = adminNotes.slice(0, 500);
    }
    target.reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
    res.json({ success: true, ad: target });
  });
  app.post("/api/admin/ads/toggle", requireOwnerSuperAdmin, (req, res) => {
    const { adId } = req.body || {};
    if (typeof adId !== "string") {
      res.status(400).json({ error: "Invalid adId" });
      return;
    }
    const target = serverAds.find((a) => a.id === adId);
    if (!target) {
      res.status(404).json({ error: "Ad request not found" });
      return;
    }
    target.status = target.status === "active" ? "approved" : "active";
    res.json({ success: true, ad: target });
  });
  app.post("/api/ads/submit", (req, res) => {
    const adData = req.body || {};
    if (typeof adData.businessName !== "string" || !adData.businessName.trim() || typeof adData.contactEmail !== "string" || !adData.contactEmail.trim() || typeof adData.headline !== "string" || !adData.headline.trim()) {
      res.status(400).json({ error: "Missing required ad information" });
      return;
    }
    const allowedPlacements = ["hero_top", "sidebar_dashboard", "lesson_footer", "quiz_finish"];
    const allowedDurations = ["7_days", "14_days", "30_days", "90_days"];
    const newAd = {
      id: `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      businessName: adData.businessName.trim().slice(0, 120),
      contactEmail: adData.contactEmail.trim().slice(0, 120),
      contactPhone: typeof adData.contactPhone === "string" ? adData.contactPhone.trim().slice(0, 40) : void 0,
      headline: adData.headline.trim().slice(0, 140),
      adText: typeof adData.adText === "string" ? adData.adText.trim().slice(0, 500) : "",
      callToAction: typeof adData.callToAction === "string" ? adData.callToAction.trim().slice(0, 50) : "Learn More",
      targetUrl: typeof adData.targetUrl === "string" ? adData.targetUrl.trim().slice(0, 500) : "https://hayenglish.am",
      imageUrl: typeof adData.imageUrl === "string" ? adData.imageUrl.trim().slice(0, 500) : "",
      placement: allowedPlacements.includes(adData.placement) ? adData.placement : "hero_top",
      duration: allowedDurations.includes(adData.duration) ? adData.duration : "30_days",
      status: "pending_review",
      submittedAt: (/* @__PURE__ */ new Date()).toISOString(),
      submitterUserId: req.userSession?.userId
    };
    serverAds.unshift(newAd);
    res.json({ success: true, ad: newAd });
  });
  app.get("/api/ads/active", (req, res) => {
    const placement = req.query.placement;
    const now = (/* @__PURE__ */ new Date()).toISOString();
    let active = serverAds.filter((ad) => {
      if (ad.status !== "active") return false;
      if (ad.expiresAt && ad.expiresAt < now) return false;
      return true;
    });
    if (placement) {
      active = active.filter((ad) => ad.placement === placement);
    }
    res.json({ success: true, ads: active });
  });
  app.get("/api/user/progress", (req, res) => {
    const session = req.userSession;
    if (!session) {
      res.status(401).json({ error: "Unauthorized: login required" });
      return;
    }
    const data = serverProgressStore.get(session.userId) || {
      userId: session.userId,
      email: session.email,
      streakCount: 1,
      userXP: 0,
      completedLessonIds: [],
      masteredWordIds: [],
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    res.json({ success: true, progress: data });
  });
  app.post("/api/user/progress", (req, res) => {
    const session = req.userSession;
    if (!session) {
      res.status(401).json({ error: "Unauthorized: login required" });
      return;
    }
    const { streakCount, userXP, completedLessonIds, masteredWordIds, quizStats } = req.body || {};
    const existing = serverProgressStore.get(session.userId);
    const previousXP = existing ? existing.userXP : 0;
    const safeXP = typeof userXP === "number" && userXP >= 0 ? Math.min(userXP, previousXP + 500) : previousXP;
    const updated = {
      userId: session.userId,
      email: session.email,
      streakCount: typeof streakCount === "number" ? Math.max(1, streakCount) : 1,
      userXP: safeXP,
      completedLessonIds: Array.isArray(completedLessonIds) ? completedLessonIds.map(String) : [],
      masteredWordIds: Array.isArray(masteredWordIds) ? masteredWordIds.map(String) : [],
      quizStats: quizStats && typeof quizStats === "object" ? quizStats : existing?.quizStats,
      updatedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    serverProgressStore.set(session.userId, updated);
    res.json({ success: true, progress: updated });
  });
  app.get("/api/leaderboard", (req, res) => {
    const currentUserId = req.userSession?.userId;
    const mockLeaders = [
      { id: "usr_arm", name: "\u0531\u0580\u0574\u0565\u0576 \u0534\u0561\u057E\u0569\u0575\u0561\u0576 (Armen)", avatar: "\u{1F468}\u200D\u{1F4BB}", userXP: 1450, streakCount: 28, levelNumber: 6, levelTitleHy: "\u0531\u0576\u0563\u056C\u0565\u0580\u0565\u0576\u056B \u057E\u056B\u0580\u057F\u0578\u0582\u0578\u0566", levelTitleEn: "Fluent Virtuoso" },
      { id: "usr_ana", name: "\u0531\u0576\u0561\u0570\u056B\u057F \u0542\u0561\u0566\u0561\u0580\u0575\u0561\u0576 (Anahit)", avatar: "\u{1F3D4}\uFE0F", userXP: 980, streakCount: 14, levelNumber: 5, levelTitleHy: "\u054D\u0561\u0570\u0578\u0582\u0576 \u0570\u0561\u0572\u0578\u0580\u0564\u0561\u056F\u056B\u0581", levelTitleEn: "Confident Speaker" },
      { id: "usr_tig", name: "\u054F\u056B\u0563\u0580\u0561\u0576 \u054A\u0565\u057F\u0580\u0578\u057D\u0575\u0561\u0576 (Tigran)", avatar: "\u26A1", userXP: 680, streakCount: 9, levelNumber: 4, levelTitleHy: "\u0532\u0561\u057C\u0561\u057A\u0561\u0577\u0561\u0580\u056B \u057E\u0561\u0580\u057A\u0565\u057F", levelTitleEn: "Vocabulary Master" },
      { id: "usr_son", name: "\u054D\u0578\u0576\u0561 \u0544\u0561\u0576\u0578\u0582\u056F\u0575\u0561\u0576 (Sona)", avatar: "\u{1F31F}", userXP: 420, streakCount: 6, levelNumber: 3, levelTitleHy: "\u0531\u0576\u0563\u056C\u0565\u0580\u0565\u0576\u056B \u0563\u056B\u057F\u0561\u056F", levelTitleEn: "Language Seeker" },
      { id: "usr_dav", name: "\u0534\u0561\u057E\u056B\u0569 \u053F\u0561\u0580\u0561\u057A\u0565\u057F\u0575\u0561\u0576 (David)", avatar: "\u{1F3AF}", userXP: 290, streakCount: 4, levelNumber: 3, levelTitleHy: "\u0531\u0576\u0563\u056C\u0565\u0580\u0565\u0576\u056B \u0563\u056B\u057F\u0561\u056F", levelTitleEn: "Language Seeker" }
    ];
    const leaders = [...mockLeaders];
    if (currentUserId && serverProgressStore.has(currentUserId)) {
      const userProg = serverProgressStore.get(currentUserId);
      leaders.push({
        id: userProg.userId,
        name: req.userSession?.email === OFFICIAL_OWNER_EMAIL ? "Artyom Kurghinyan (\u{1F451} \u054F\u0565\u0580)" : "\u0534\u0578\u0582\u0584 (You)",
        avatar: req.userSession?.email === OFFICIAL_OWNER_EMAIL ? "\u{1F451}" : "\u{1F393}",
        userXP: userProg.userXP,
        streakCount: userProg.streakCount,
        levelNumber: Math.min(8, Math.floor(userProg.userXP / 250) + 1),
        levelTitleHy: "\u0531\u056F\u057F\u056B\u057E \u057D\u0578\u057E\u0578\u0580\u0578\u0572",
        levelTitleEn: "Active Learner"
      });
    }
    leaders.sort((a, b) => b.userXP - a.userXP);
    const ranked = leaders.map((u, i) => ({
      ...u,
      rank: i + 1,
      isCurrentUser: u.id === currentUserId
    }));
    res.json({ success: true, leaders: ranked });
  });
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "API endpoint not found" });
  });
  return app;
}

// src/server/seoRoutes.ts
function buildRobotsTxt(origin) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /admin",
    "Disallow: /dashboard",
    "Disallow: /profile",
    "Disallow: /review",
    "Disallow: /leaderboard",
    "",
    `Sitemap: ${cleanOrigin}/sitemap.xml`,
    ""
  ].join("\n");
}
function buildSitemapXml(origin) {
  const cleanOrigin = origin.replace(/\/+$/, "");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    "  <url>",
    `    <loc>${cleanOrigin}/</loc>`,
    "    <lastmod>2026-11-27</lastmod>",
    "    <changefreq>weekly</changefreq>",
    "    <priority>1.0</priority>",
    "  </url>",
    "</urlset>",
    ""
  ].join("\n");
}

// server.ts
dotenv.config();
function resolvePublicOrigin(req) {
  const configured = process.env.APP_URL?.trim();
  if (configured && /^https?:\/\//i.test(configured)) {
    return configured.replace(/\/+$/, "");
  }
  const forwardedProto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim();
  const proto = forwardedProto || req.protocol || "https";
  const host = req.get("host") || "armenianenglishlearning1.onrender.com";
  return `${proto}://${host}`;
}
async function startServer() {
  const app = createApiApp();
  const PORT = process.env.PORT || 3e3;
  app.get("/robots.txt", (req, res) => {
    res.type("text/plain; charset=utf-8").send(buildRobotsTxt(resolvePublicOrigin(req)));
  });
  app.get("/sitemap.xml", (req, res) => {
    res.type("application/xml; charset=utf-8").send(buildSitemapXml(resolvePublicOrigin(req)));
  });
  const gscVerification = (process.env.GOOGLE_SITE_VERIFICATION || process.env.VITE_GOOGLE_SITE_VERIFICATION || "").trim();
  if (/^[a-zA-Z0-9_-]{8,128}$/.test(gscVerification)) {
    const fileToken = gscVerification.startsWith("google") ? gscVerification : `google${gscVerification}`;
    app.get(`/${fileToken}.html`, (_req, res) => {
      res.type("text/html; charset=utf-8").send(`google-site-verification: ${fileToken}.html`);
    });
  }
  app.use((req, res, next) => {
    if (/^\/(admin|dashboard|profile|review|leaderboard)(\/|$)/i.test(req.path)) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive");
    }
    next();
  });
  const isDev = process.env.NODE_ENV !== "production";
  if (isDev) {
    const httpServer = app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`[HayEnglish Server] Listening on http://0.0.0.0:${PORT}`);
      console.log(`[HayEnglish Auth] Super Admin & Owner: ${OFFICIAL_OWNER_EMAIL}`);
    });
    const isHmrDisabled = process.env.DISABLE_HMR === "true";
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: isHmrDisabled ? false : { server: httpServer }
      },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), "dist");
    const distIndexHtmlPath = path.resolve(distPath, "index.html");
    const rawHtml = fs.existsSync(distIndexHtmlPath) ? fs.readFileSync(distIndexHtmlPath, "utf-8") : "";
    app.use(express2.static(distPath, { index: false }));
    app.get("*", (req, res) => {
      if (!rawHtml) {
        res.sendFile(distIndexHtmlPath);
        return;
      }
      const origin = resolvePublicOrigin(req);
      let html = rawHtml.replace(/https:\/\/armenianenglishlearning1\.onrender\.com/g, origin);
      if (/^\/(admin|dashboard|profile|review|leaderboard)(\/|$)/i.test(req.path)) {
        html = html.replace(
          'content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"',
          'content="noindex, nofollow, noarchive"'
        );
        html = html.replace(
          '<meta name="googlebot" content="index, follow" />',
          '<meta name="googlebot" content="noindex, nofollow" />'
        );
      }
      if (/^[a-zA-Z0-9_-]{8,128}$/.test(gscVerification) && !html.includes('name="google-site-verification"')) {
        html = html.replace(
          "</head>",
          `    <meta name="google-site-verification" content="${gscVerification}" />
  </head>`
        );
      }
      res.type("text/html; charset=utf-8").send(html);
    });
    app.listen(Number(PORT), "0.0.0.0", () => {
      console.log(`[HayEnglish Server] Listening on http://0.0.0.0:${PORT}`);
      console.log(`[HayEnglish Auth] Super Admin & Owner: ${OFFICIAL_OWNER_EMAIL}`);
    });
  }
}
if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}
export {
  OFFICIAL_OWNER_EMAIL,
  createApiApp,
  createSignedSessionToken,
  verifySignedSessionToken
};
