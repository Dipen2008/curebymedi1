/**
 * AI-powered features:
 *  POST /api/interactions
 *  POST /api/suggest
 *
 * Calls Python sidecar:
 *  /api/_python/interactions
 *  /api/_python/suggest
 */

const router = require("express").Router();
const Medicine = require("../models/Medicine");
const { requireAuth } = require("../middleware/auth");

const PY_PROXY_BASE =
  process.env.PYTHON_PROXY_URL || "http://127.0.0.1:8000";

const PYTHON_TIMEOUT = 10000; // 10 seconds (safer for production)

// -----------------------------
// SAFE FETCH WRAPPER
// -----------------------------
async function safePythonCall(url, payload, signal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });

  let data = null;

  try {
    data = await res.json();
  } catch (e) {
    console.error("❌ Invalid JSON from Python:", e);
    throw new Error("Invalid response from AI service");
  }

  if (!res.ok) {
    console.error("❌ Python error response:", data);
    throw new Error(data?.error || "AI service returned error");
  }

  return data;
}

// -----------------------------
// INTERACTIONS
// -----------------------------
router.post("/interactions", requireAuth, async (req, res) => {
  try {
    let names = [];

    if (Array.isArray(req.body.medicineNames) && req.body.medicineNames.length) {
      names = req.body.medicineNames.map(String).filter(Boolean);
    } else if (Array.isArray(req.body.medicineIds) && req.body.medicineIds.length) {
      const docs = await Medicine.find({
        _id: { $in: req.body.medicineIds },
      }).lean();

      names = docs.map((d) =>
        `${d.name} (${d.composition || ""})`.trim()
      );
    }

    if (names.length < 2) {
      return res.status(400).json({
        detail: "Provide at least 2 medicines",
      });
    }

    if (names.length > 6) {
      return res.status(400).json({
        detail: "Max 6 medicines at a time",
      });
    }

    const lang = req.user?.language || "en";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), PYTHON_TIMEOUT);

    try {
      const data = await safePythonCall(
        `${PY_PROXY_BASE}/api/_python/interactions`,
        {
          medicines: names,
          language: lang,
        },
        controller.signal
      );

      return res.json(data);
    } catch (err) {
      console.error("❌ INTERACTIONS ERROR:", err.message);
      return res.status(503).json({
        detail: "AI service slow or unavailable. Please try again.",
      });
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error("❌ SERVER ERROR:", e);
    return res.status(500).json({
      detail: "Internal server error",
    });
  }
});

// -----------------------------
// SUGGEST (MAIN)
// -----------------------------
router.post("/suggest", requireAuth, async (req, res) => {
  try {
    const symptoms = String(req.body.symptoms || "").trim().slice(0, 400);
    if (symptoms.length < 3) {
      return res.status(400).json({ detail: "Enter symptoms" });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    let r;

    try {
      r = await fetch(`${PY_PROXY_BASE}/api/_python/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms,
          language: req.user?.language || "en",
        }),
        signal: controller.signal,
      });
    } catch (err) {
      return res.status(503).json({
        detail: "Python AI not responding (network issue)",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!r.ok) {
      const text = await r.text();
      return res.status(502).json({
        detail: "Python error",
        raw: text,
      });
    }

    const data = await r.json();
    return res.json(data);

  } catch (e) {
    return res.status(500).json({
      detail: "Server crash in suggest route",
    });
  }
});

module.exports = router;