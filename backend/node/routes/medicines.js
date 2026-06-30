const router = require("express").Router();
const Medicine = require("../models/Medicine");
const User = require("../models/User");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { slugify } = require("../services/slug");

// Escape user-supplied regex characters so we never crash on weird input
function rx(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// PUBLIC: list / search / filter
router.get("/", async (req, res, next) => {
  try {
    const { category, search, limit = 30, skip = 0 } = req.query;
    const q = {};
    if (category && String(category).toLowerCase() !== "all") q.category = category;
    if (search) {
      const r = new RegExp(rx(String(search)), "i");
      q.$or = [{ name: r }, { composition: r }, { manufacturer: r }];
    }
    const lim = Math.min(Number(limit) || 30, 100);
    const skp = Math.max(Number(skip) || 0, 0);
    const [items, total] = await Promise.all([
      Medicine.find(q).sort({ name: 1 }).skip(skp).limit(lim).lean(),
      Medicine.countDocuments(q),
    ]);
    res.json({ items: items.map(formatMedicine), total, limit: lim, skip: skp });
  } catch (e) { next(e); }
});

// PUBLIC: lookup by slug (used for SEO-friendly /medicine/<slug> pages)
router.get("/by-slug/:slug", async (req, res, next) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase().trim();
    if (!slug) return res.status(400).json({ detail: "Slug required" });
    let m = await Medicine.findOne({ slug }).lean();
    if (!m) {
      // Try matching by slugifying the name (lazy backfill)
      const candidates = await Medicine.find({ name: new RegExp(rx(slug.replace(/-/g, " ")), "i") }).limit(5).lean();
      for (const c of candidates) {
        if (slugify(c.name) === slug) { m = c; break; }
      }
      if (m) {
        await Medicine.updateOne({ _id: m._id }, { $set: { slug } });
        m.slug = slug;
      }
    }
    if (!m) return res.status(404).json({ detail: "Medicine not found" });
    res.json(formatMedicine(m));
  } catch (_e) { res.status(404).json({ detail: "Medicine not found" }); }
});

// PUBLIC: single medicine by id
router.get("/:id", async (req, res, next) => {
  try {
    const m = await Medicine.findById(req.params.id).lean();
    if (!m) return res.status(404).json({ detail: "Medicine not found" });
    // Lazy slug backfill on first read
    if (!m.slug) {
      const sl = slugify(m.name);
      await Medicine.updateOne({ _id: m._id }, { $set: { slug: sl } });
      m.slug = sl;
    }
    res.json(formatMedicine(m));
  } catch (_e) { res.status(404).json({ detail: "Medicine not found" }); }
});

// AUTH: AI-enrich a medicine's details on demand (lazy + cached in DB)
const PY_PROXY_BASE = process.env.PYTHON_PROXY_URL || "http://127.0.0.1:8000";
router.post("/:id/enrich", require("../middleware/auth").requireAuth, async (req, res, next) => {
  try {
    const m = await Medicine.findById(req.params.id);
    if (!m) return res.status(404).json({ detail: "Medicine not found" });

    // Already enriched? return as-is
    if (m.aiEnriched && m.usedFor && m.dailyDosage) {
      return res.json(formatMedicine(m.toObject()));
    }

    const py = await fetch(`${PY_PROXY_BASE}/api/_python/enrich`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: m.name,
        composition: m.composition,
        manufacturer: m.manufacturer,
        type: m.type,
        category: m.category,
      }),
    });
    const data = await py.json();
    if (data.error) return res.status(502).json({ detail: data.error });

    m.usedFor = data.usedFor || "";
    m.dailyDosage = data.dailyDosage || "";
    m.bodyEffects = data.bodyEffects || "";
    m.benefits = data.benefits || m.benefits || "";
    m.sideEffects = data.sideEffects || m.sideEffects || "";
    m.howToTake = data.howToTake || m.howToTake || "";
    m.warnings = data.warnings || "";
    m.aiEnriched = true;
    m.enrichedAt = new Date();
    await m.save();

    res.json(formatMedicine(m.toObject()));
  } catch (e) { next(e); }
});

// ADMIN: create
router.post("/", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const m = await Medicine.create(pickFields(req.body));
    res.json(formatMedicine(m.toObject()));
  } catch (e) { next(e); }
});

// ADMIN: update
router.put("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const m = await Medicine.findByIdAndUpdate(req.params.id, pickFields(req.body), { new: true }).lean();
    if (!m) return res.status(404).json({ detail: "Medicine not found" });
    res.json(formatMedicine(m));
  } catch (e) { next(e); }
});

// ADMIN: delete
router.delete("/:id", requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const r = await Medicine.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ detail: "Medicine not found" });
    res.json({ message: "Deleted" });
  } catch (e) { next(e); }
});

function pickFields(b) {
  const fields = ["name","manufacturer","price","type","packSize","composition","category","isDiscontinued","dosage","benefits","sideEffects","howToTake","usedFor","dailyDosage","bodyEffects","warnings","image"];
  const o = {};
  for (const k of fields) if (b[k] !== undefined) o[k] = b[k];
  return o;
}

function formatMedicine(m) {
  return {
    id: String(m._id),
    slug: m.slug || "",
    name: m.name,
    manufacturer: m.manufacturer || "",
    price: m.price || "",
    type: m.type || "",
    packSize: m.packSize || "",
    composition: m.composition || "",
    category: m.category || "Tablets",
    isDiscontinued: !!m.isDiscontinued,
    dosage: m.dosage || "",
    benefits: m.benefits || "",
    sideEffects: m.sideEffects || "",
    howToTake: m.howToTake || "",
    usedFor: m.usedFor || "",
    dailyDosage: m.dailyDosage || "",
    bodyEffects: m.bodyEffects || "",
    warnings: m.warnings || "",
    aiEnriched: !!m.aiEnriched,
    image: m.image || "",
  };
}

module.exports = router;
