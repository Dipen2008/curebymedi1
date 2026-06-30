/**
 * AI-powered features:
 *  POST /api/interactions  body: { medicineIds: [..] | medicineNames: [..] }
 *  POST /api/suggest       body: { symptoms: "headache, fever, body ache" }
 *
 * Both call Python sidecar (/api/_python/interactions, /api/_python/suggest).
 */
const router = require("express").Router();
const Medicine = require("../models/Medicine");
const { requireAuth } = require("../middleware/auth");

const PY_PROXY_BASE = process.env.PYTHON_PROXY_URL || "http://127.0.0.1:8000";

router.post("/interactions", requireAuth, async (req, res, next) => {
  try {
    let names = [];
    if (Array.isArray(req.body.medicineNames) && req.body.medicineNames.length) {
      names = req.body.medicineNames.map(String).filter(Boolean);
    } else if (Array.isArray(req.body.medicineIds) && req.body.medicineIds.length) {
      const docs = await Medicine.find({ _id: { $in: req.body.medicineIds } }).lean();
      names = docs.map((d) => `${d.name} (${d.composition || ""})`.trim());
    }
    if (names.length < 2) return res.status(400).json({ detail: "Provide at least 2 medicines" });
    if (names.length > 6) return res.status(400).json({ detail: "Max 6 medicines at a time" });

    const lang = (req.user && req.user.language) || "en";
    let r;
    try {
      r = await fetch(`${PY_PROXY_BASE}/api/_python/interactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ medicines: names, language: lang }),
      });
    } catch (_e) {
      return res.status(503).json({ detail: "AI service is starting up — please retry in a moment" });
    }
    const data = await r.json();
    if (data.error) return res.status(502).json({ detail: data.error });
    res.json(data);
  } catch (e) { next(e); }
});

router.post("/suggest", requireAuth, async (req, res, next) => {
  try {
    const symptoms = String(req.body.symptoms || "").trim().slice(0, 400);
    if (symptoms.length < 3) return res.status(400).json({ detail: "Tell us your symptoms (e.g. 'headache, fever')" });
    const lang = (req.user && req.user.language) || "en";
    let r;
    try {
      r = await fetch(`${PY_PROXY_BASE}/api/_python/suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symptoms, language: lang }),
      });
    } catch (_e) {
      return res.status(503).json({ detail: "AI service is starting up — please retry in a moment" });
    }
    const data = await r.json();
    if (data.error) return res.status(502).json({ detail: data.error });
    res.json(data);
  } catch (e) { next(e); }
});

module.exports = router;
