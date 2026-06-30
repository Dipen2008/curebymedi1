/**
 * POST /api/scan - users upload a medicine image, we ask an LLM to extract the medicine
 * name and produce a short summary. Then we try to match it against our DB.
 *
 * Routed THROUGH the Python proxy because the AI call uses the Emergent LLM key
 * which is wired up via the Python `emergentintegrations` library. So this route
 * here just forwards the file to the Python endpoint /api/_python/scan and returns
 * the result. The Node API still saves the Scan record so the admin audit log
 * stays consistent.
 */
const router = require("express").Router();
const multer = require("multer");
const Scan = require("../models/Scan");
const Medicine = require("../models/Medicine");
const { requireAuth } = require("../middleware/auth");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const PY_PROXY_BASE = process.env.PYTHON_PROXY_URL || "http://127.0.0.1:8000";

router.post("/", requireAuth, upload.single("image"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ detail: "No image uploaded (field name: image)" });
    if (!/^image\/(jpeg|png|webp|jpg)$/.test(req.file.mimetype)) {
      return res.status(400).json({ detail: "Only JPEG / PNG / WEBP images are allowed" });
    }

    // Ask the Python sidecar to analyse the image (uses Emergent LLM key)
    const b64 = req.file.buffer.toString("base64");
    const aiResp = await (await fetch(`${PY_PROXY_BASE}/api/_python/scan`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_base64: b64, mime: req.file.mimetype }),
    })).json();

    if (aiResp.error) return res.status(502).json({ detail: aiResp.error });

    const detectedName = (aiResp.name || "").trim();
    const summary = (aiResp.summary || "").trim();

    // Try to match against our local DB (fuzzy by first word of detected name)
    let matched = null;
    if (detectedName) {
      const firstWord = detectedName.split(/[\s,\-]+/)[0];
      if (firstWord && firstWord.length >= 3) {
        matched = await Medicine.findOne({ name: new RegExp("^" + firstWord.replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "i") }).lean();
      }
    }

    // Save the scan event for the admin audit log
    const scan = await Scan.create({
      user: req.user._id,
      detectedName,
      summary,
      matchedMedicine: matched ? matched._id : null,
      imageSizeBytes: req.file.size,
    });

    res.json({
      scanId: String(scan._id),
      detected: { name: detectedName, summary },
      matched: matched
        ? {
            id: String(matched._id),
            name: matched.name,
            manufacturer: matched.manufacturer,
            composition: matched.composition,
            price: matched.price,
            category: matched.category,
          }
        : null,
    });
  } catch (e) { next(e); }
});

module.exports = router;
