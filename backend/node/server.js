/**
 * CureByMedi - Backend API (Node.js + Express + Mongoose)
 *
 * This is the REAL backend. The Python file at /app/backend/server.py is just a
 * thin proxy required by the Emergent preview platform — it forwards every
 * /api/* request to THIS Node.js server. When you deploy to Render / Railway /
 * any Node host, you only need this folder. The Python file disappears.
 *
 * All routes are mounted under /api.
 */
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth");
const medicineRoutes = require("./routes/medicines");
const adminRoutes = require("./routes/admin");
const scanRoutes = require("./routes/scan");
const meRoutes = require("./routes/me");
const aiRoutes = require("./routes/ai");
const { seedAdmin, seedMedicinesFromCsv } = require("./services/seed");

const app = express();

// CORS - strict allow-list from env (no wildcard in production)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow same-origin / server-to-server requests (no Origin header)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes("*")) return callback(null, true);
    if (ALLOWED_ORIGINS.length === 0) {
      console.warn("[cors] CORS_ORIGINS env var is empty - rejecting", origin);
      return callback(new Error("CORS not configured"), false);
    }
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    console.warn("[cors] blocked origin:", origin);
    return callback(new Error("Origin not allowed by CORS"), false);
  },
  credentials: true,
}));
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true, limit: "20mb" }));
app.use(cookieParser());

// Healthcheck
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "curebymedi-api" }));

app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/scan", scanRoutes);
app.use("/api/me", meRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/seo", require("./routes/seo"));

// 404 fallback for unknown /api routes
app.use("/api", (_req, res) => res.status(404).json({ detail: "Not found" }));

// Centralised error handler so we never crash on unexpected throws
app.use((err, _req, res, _next) => {
  console.error("[api error]", err);
  res.status(err.status || 500).json({ detail: err.message || "Server error" });
});

const PORT = process.env.PORT || 9001;
const HOST = process.env.HOST || "0.0.0.0";
const MONGO_URL = process.env.MONGO_URL || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "curebymedi";

(async () => {
  await mongoose.connect(MONGO_URL, { dbName: DB_NAME });
  console.log("[api] mongo connected:", DB_NAME);

  await seedAdmin();
  await seedMedicinesFromCsv();

  app.listen(PORT, HOST, () => console.log(`[api] http://${HOST}:${PORT}`));
})().catch((e) => {
  console.error("[api] fatal startup:", e);
  process.exit(1);
});
