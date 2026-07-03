/**
 * AI-powered features:
 * POST /api/ai/interactions
 * POST /api/ai/suggest
 */

const router = require("express").Router();
const Medicine = require("../models/Medicine");
const { requireAuth } = require("../middleware/auth");

const PY_PROXY_BASE =
  process.env.PYTHON_PROXY_URL || "http://127.0.0.1:8000";

console.log("======================================");
console.log("PYTHON_PROXY_URL =", PY_PROXY_BASE);
console.log("======================================");

const PYTHON_TIMEOUT = 10000;

async function callPython(endpoint, body) {
  console.log("Calling:", `${PY_PROXY_BASE}${endpoint}`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PYTHON_TIMEOUT);

  try {
    const response = await fetch(`${PY_PROXY_BASE}${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const text = await response.text();

    console.log("Python status:", response.status);
    console.log("Python body:", text);

    if (!response.ok) {
      throw new Error(text);
    }

    return JSON.parse(text);
  } catch (err) {
    console.error("========== PYTHON REQUEST FAILED ==========");
    console.error(err);
    console.error("Message:", err.message);
    console.error("Cause:", err.cause);
    console.error("===========================================");
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/* -------------------------------------------------- */
/* INTERACTIONS */
/* -------------------------------------------------- */

router.post("/interactions", requireAuth, async (req, res) => {
  try {
    let names = [];

    if (Array.isArray(req.body.medicineNames)) {
      names = req.body.medicineNames;
    } else if (Array.isArray(req.body.medicineIds)) {
      const docs = await Medicine.find({
        _id: { $in: req.body.medicineIds },
      }).lean();

      names = docs.map(
        d => `${d.name} (${d.composition || ""})`
      );
    }

    const data = await callPython(
      "/api/_python/interactions",
      {
        medicines: names,
        language: req.user?.language || "en",
      }
    );

    res.json(data);

  } catch (err) {
    res.status(503).json({
      detail: err.message,
    });
  }
});

/* -------------------------------------------------- */
/* SUGGEST */
/* -------------------------------------------------- */

router.post("/suggest", requireAuth, async (req, res) => {

  try {

    const symptoms = String(
      req.body.symptoms || ""
    ).trim();

    const data = await callPython(
      "/api/_python/suggest",
      {
        symptoms,
        language: req.user?.language || "en",
      }
    );

    res.json(data);

 } catch (err) {

  console.error("=================================");
  console.error("PYTHON FETCH FAILED");
  console.error("URL:", `${PY_PROXY_BASE}/api/_python/suggest`);
  console.error(err);
  console.error("=================================");

  return res.status(503).json({
    detail: err.message,
    url: `${PY_PROXY_BASE}/api/_python/suggest`,
    error: String(err),
  });

}
});

module.exports = router;