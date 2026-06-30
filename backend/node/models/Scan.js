const mongoose = require("mongoose");

const scanSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", index: true },
  detectedName: { type: String, default: "" },
  summary: { type: String, default: "" },
  matchedMedicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", default: null },
  imageSizeBytes: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
});

// 🧹 Auto-delete scans older than 90 days (TTL index — MongoDB does this for you).
// To change the retention window, edit `expireAfterSeconds` below.
scanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("Scan", scanSchema);
