/**
 * User-scoped routes: favorites, recents, reminders.
 * All require auth. Mounted at /api/me.
 */
const router = require("express").Router();
const mongoose = require("mongoose");
const User = require("../models/User");
const Medicine = require("../models/Medicine");
const { requireAuth } = require("../middleware/auth");

router.use(requireAuth);

function trimMedicine(m) {
  return {
    id: String(m._id),
    slug: m.slug || "",
    name: m.name,
    manufacturer: m.manufacturer || "",
    composition: m.composition || "",
    category: m.category || "Tablets",
    price: m.price || "",
  };
}

// ---- FAVORITES ----
router.get("/favorites", async (req, res, next) => {
  try {
    await req.user.populate({ path: "favorites", options: { lean: true } });
    res.json({ items: (req.user.favorites || []).map(trimMedicine) });
  } catch (e) { next(e); }
});

router.post("/favorites/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ detail: "Invalid id" });
    if (!req.user.favorites.some((x) => String(x) === id)) req.user.favorites.push(id);
    await req.user.save();
    res.json({ count: req.user.favorites.length });
  } catch (e) { next(e); }
});

router.delete("/favorites/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    req.user.favorites = req.user.favorites.filter((x) => String(x) !== id);
    await req.user.save();
    res.json({ count: req.user.favorites.length });
  } catch (e) { next(e); }
});

// ---- RECENTS (auto-recorded on view) ----
const MAX_RECENT = 12;
router.post("/recents/:id", async (req, res, next) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ detail: "Invalid id" });
    req.user.recents = [id, ...req.user.recents.filter((x) => String(x) !== id)].slice(0, MAX_RECENT);
    await req.user.save();
    res.json({ count: req.user.recents.length });
  } catch (e) { next(e); }
});

router.get("/recents", async (req, res, next) => {
  try {
    await req.user.populate({ path: "recents", options: { lean: true } });
    res.json({ items: (req.user.recents || []).map(trimMedicine) });
  } catch (e) { next(e); }
});

// ---- REMINDERS ----
router.get("/reminders", (req, res) => {
  res.json({ items: req.user.reminders });
});

router.post("/reminders", async (req, res, next) => {
  try {
    const { medicineId, name, times = [], notes = "" } = req.body || {};
    if (!name || !Array.isArray(times) || times.length === 0)
      return res.status(400).json({ detail: "Name and at least one time are required" });
    const cleanTimes = times.filter((t) => /^\d{1,2}:\d{2}$/.test(String(t).trim())).slice(0, 6);
    if (cleanTimes.length === 0) return res.status(400).json({ detail: "Times must be like '08:00'" });
    req.user.reminders.push({
      medicineId: medicineId && mongoose.isValidObjectId(medicineId) ? medicineId : null,
      name: String(name).slice(0, 80),
      times: cleanTimes,
      notes: String(notes).slice(0, 200),
      active: true,
    });
    await req.user.save();
    res.json({ items: req.user.reminders });
  } catch (e) { next(e); }
});

router.delete("/reminders/:id", async (req, res, next) => {
  try {
    req.user.reminders = req.user.reminders.filter((r) => String(r._id) !== req.params.id);
    await req.user.save();
    res.json({ items: req.user.reminders });
  } catch (e) { next(e); }
});

router.patch("/reminders/:id", async (req, res, next) => {
  try {
    const r = req.user.reminders.id(req.params.id);
    if (!r) return res.status(404).json({ detail: "Reminder not found" });
    if (typeof req.body.active === "boolean") r.active = req.body.active;
    await req.user.save();
    res.json({ items: req.user.reminders });
  } catch (e) { next(e); }
});

module.exports = router;
