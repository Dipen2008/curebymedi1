const router = require("express").Router();
const Medicine = require("../models/Medicine");
const User = require("../models/User");
const Scan = require("../models/Scan");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.use(requireAuth, requireAdmin);

// Stats overview
router.get("/stats", async (_req, res, next) => {
  try {
    const since24h = new Date(Date.now() - 24 * 3600 * 1000);
    const [
      totalMedicines,
      totalUsers,
      totalAdmins,
      scansTotal,
      scansToday,
      byCategory,
    ] = await Promise.all([
      Medicine.countDocuments({}),
      User.countDocuments({ role: "user" }),
      User.countDocuments({ role: "admin" }),
      Scan.countDocuments({}),
      Scan.countDocuments({ createdAt: { $gte: since24h } }),
      Medicine.aggregate([
        { $group: { _id: "$category", count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
    ]);
    res.json({
      totalMedicines,
      totalUsers,
      totalAdmins,
      scansTotal,
      scansToday,
      byCategory: byCategory.map((c) => ({ category: c._id || "Unknown", count: c.count })),
    });
  } catch (e) { next(e); }
});

// Users list (search + paginate)
router.get("/users", async (req, res, next) => {
  try {
    const { search = "", limit = 50, skip = 0 } = req.query;
    const q = search ? { email: new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), "i") } : {};
    const [items, total] = await Promise.all([
      User.find(q).sort({ createdAt: -1 }).skip(Number(skip)||0).limit(Math.min(Number(limit)||50,100)).lean(),
      User.countDocuments(q),
    ]);
    res.json({
      items: items.map((u) => ({
        id: String(u._id),
        email: u.email,
        role: u.role,
        createdAt: u.createdAt,
        lastLoginAt: u.lastLoginAt,
      })),
      total,
    });
  } catch (e) { next(e); }
});

// Promote / demote a user
router.post("/users/:id/role", async (req, res, next) => {
  try {
    const role = req.body.role === "admin" ? "admin" : "user";
    const u = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    if (!u) return res.status(404).json({ detail: "User not found" });
    res.json(u.toPublicJSON());
  } catch (e) { next(e); }
});

// Delete a user
router.delete("/users/:id", async (req, res, next) => {
  try {
    if (String(req.user._id) === req.params.id) return res.status(400).json({ detail: "Cannot delete yourself" });
    const r = await User.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ detail: "User not found" });
    res.json({ message: "Deleted" });
  } catch (e) { next(e); }
});

// Recent scans (audit log)
router.get("/scans", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const items = await Scan.find({}).sort({ createdAt: -1 }).limit(limit).populate("user", "email").lean();
    res.json({
      items: items.map((s) => ({
        id: String(s._id),
        detectedName: s.detectedName,
        summary: s.summary,
        userEmail: s.user ? s.user.email : "—",
        createdAt: s.createdAt,
      })),
    });
  } catch (e) { next(e); }
});

// Bulk import medicines (JSON array)
router.post("/medicines/bulk", async (req, res, next) => {
  try {
    const arr = Array.isArray(req.body) ? req.body : req.body.items;
    if (!Array.isArray(arr)) return res.status(400).json({ detail: "Body must be an array or { items: [] }" });
    const docs = arr.filter((m) => m && m.name).slice(0, 50000);
    if (docs.length === 0) return res.json({ inserted: 0 });
    const result = await Medicine.insertMany(docs, { ordered: false });
    res.json({ inserted: result.length });
  } catch (e) { next(e); }
});

module.exports = router;
