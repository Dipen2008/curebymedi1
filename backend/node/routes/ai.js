/**
 * AI-powered features:
 * POST /api/ai/interactions
 * POST /api/ai/suggest
 */
const axios = require("axios");
const router = require("express").Router();
const Medicine = require("../models/Medicine");
const { requireAuth } = require("../middleware/auth");
const aiCache = new Map();
const CACHE_TIME = 5 * 60 * 1000; // 5 minutes

const PY_PROXY_BASE =
  process.env.PYTHON_PROXY_URL || "http://127.0.0.1:8000";

console.log("======================================");
console.log("PYTHON_PROXY_URL =", PY_PROXY_BASE);
console.log("======================================");

async function callPython(endpoint, body) {

  const url = `${PY_PROXY_BASE}${endpoint}`;

  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {

    try {

      console.log(`Attempt ${attempt}: ${url}`);

      const response = await axios.post(url, body, {
        timeout: 30000,
        headers: {
          "Content-Type": "application/json",
        },
      });

      console.log("Python status:", response.status);

      return response.data;

    } catch (err) {

      console.log(`Attempt ${attempt} failed`);

      if (attempt === MAX_RETRIES) {
        throw err;
      }

      await new Promise(r => setTimeout(r, 2000));
    }

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

    const symptoms = String(req.body.symptoms || "")
      .trim()
      .toLowerCase();

    // Check cache
    const cached = aiCache.get(symptoms);

    if (cached && Date.now() - cached.time < CACHE_TIME) {
      console.log("Returning cached AI response");
      return res.json(cached.data);
    }

    // Call Python
    const data = await callPython(
      "/api/_python/suggest",
      {
        symptoms,
        language: req.user?.language || "en",
      }
    );

    // Save to cache
    aiCache.set(symptoms, {
      data,
      time: Date.now(),
    });

    return res.json(data);

  } catch (err) {

    console.error("=================================");
    console.error("PYTHON FETCH FAILED");
    console.error("URL:", `${PY_PROXY_BASE}/api/_python/suggest`);
    console.error(err);
    console.error("=================================");

    return res.status(503).json({
      success: false,
      message: "AI is waking up. Automatically retry in a few seconds.",
    });
  

}
});

module.exports = router;