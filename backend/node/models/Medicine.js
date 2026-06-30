const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, index: "text" },
    slug: { type: String, index: true, sparse: true },
    manufacturer: { type: String, default: "", index: true },
    price: { type: String, default: "" },           // stored as string for "₹120" style
    type: { type: String, default: "allopathy" },   // allopathy / ayurvedic / homeopathy
    packSize: { type: String, default: "" },
    composition: { type: String, default: "" },     // joined short_composition1 + 2
    category: { type: String, default: "Tablets" },
    isDiscontinued: { type: Boolean, default: false },
    dosage: { type: String, default: "" },
    benefits: { type: String, default: "" },
    sideEffects: { type: String, default: "" },
    howToTake: { type: String, default: "" },
    // AI-enriched detail fields (filled lazily on first view, cached forever)
    usedFor: { type: String, default: "" },
    dailyDosage: { type: String, default: "" },
    bodyEffects: { type: String, default: "" },
    warnings: { type: String, default: "" },
    aiEnriched: { type: Boolean, default: false },
    enrichedAt: { type: Date, default: null },
    image: { type: String, default: "" },
    createdAt: { type: Date, default: Date.now },
  },
  { collection: "medicines" }
);

// Case-insensitive prefix-friendly index for live search
medicineSchema.index({ name: 1 });
medicineSchema.index({ category: 1 });

module.exports = mongoose.model("Medicine", medicineSchema);
