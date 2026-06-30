/**
 * Seed scripts:
 *  - seedAdmin(): create / update the admin from ADMIN_EMAIL + ADMIN_PASSWORD env
 *  - seedMedicinesFromCsv(): on first run, bulk-import ~25k Indian medicines from
 *    the public GitHub dataset junioralive/Indian-Medicine-Dataset
 */
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { parse } = require("csv-parse");

const User = require("../models/User");
const Medicine = require("../models/Medicine");

const CSV_URL = "https://raw.githubusercontent.com/junioralive/Indian-Medicine-Dataset/main/DATA/indian_medicine_data.csv";
const CSV_LOCAL = path.join(__dirname, "..", "data", "indian_medicines.csv");

async function seedAdmin() {
  const email = String(process.env.ADMIN_EMAIL || "").toLowerCase().trim();
  const password = String(process.env.ADMIN_PASSWORD || "");
  if (!email || !password) {
    console.error("[FATAL] ADMIN_EMAIL and ADMIN_PASSWORD must be set in backend/.env");
    process.exit(1);
  }
  if (password === "admin123" || password.length < 10) {
    console.error("[FATAL] ADMIN_PASSWORD is too weak. Use a strong (>=10 chars) unique password in backend/.env");
    process.exit(1);
  }
  const existing = await User.findOne({ email });
  if (!existing) {
    await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      role: "admin",
    });
    console.log("[seed] admin created:", email);
    return;
  }
  const updates = {};
  if (existing.role !== "admin") updates.role = "admin";
  const matches = await bcrypt.compare(password, existing.passwordHash);
  if (!matches) updates.passwordHash = await bcrypt.hash(password, 10);
  if (Object.keys(updates).length) {
    await User.updateOne({ email }, { $set: updates });
    console.log("[seed] admin updated:", email);
  }
}

function pickCategory(type, packSize) {
  const t = String(type || "").toLowerCase();
  const p = String(packSize || "").toLowerCase();
  if (p.includes("injection") || p.includes("ampoule") || p.includes("vial")) return "Injection";
  if (p.includes("syrup") || p.includes("suspension") || p.includes("ml")) return "Syrup";
  if (p.includes("capsule")) return "Capsules";
  if (p.includes("cream") || p.includes("ointment") || p.includes("gel") || p.includes("lotion")) return "Cream";
  if (p.includes("drop")) return "Drops";
  if (p.includes("tablet") || p.includes("tab ")) return "Tablets";
  if (t === "ayurvedic") return "Ayurvedic";
  if (t === "homeopathy") return "Homeopathy";
  return "Tablets";
}

async function downloadCsvIfMissing() {
  if (fs.existsSync(CSV_LOCAL) && fs.statSync(CSV_LOCAL).size > 1024 * 1024) return;
  fs.mkdirSync(path.dirname(CSV_LOCAL), { recursive: true });
  console.log("[seed] downloading Indian medicine CSV …");
  const resp = await fetch(CSV_URL);
  if (!resp.ok) throw new Error("CSV download failed: " + resp.status);
  const text = await resp.text();
  fs.writeFileSync(CSV_LOCAL, text);
  console.log("[seed] CSV saved:", CSV_LOCAL, "(", (text.length/1024/1024).toFixed(1), "MB )");
}

async function seedMedicinesFromCsv() {
  const count = await Medicine.estimatedDocumentCount();
  if (count > 1000) {
    console.log("[seed] medicines already loaded:", count);
    return;
  }
  try {
    await downloadCsvIfMissing();
  } catch (e) {
    console.warn("[seed] could not download CSV:", e.message);
    return;
  }

  console.log("[seed] importing medicines from CSV (this takes a moment) …");
  const docs = [];
  const parser = fs.createReadStream(CSV_LOCAL).pipe(parse({ columns: true, skip_empty_lines: true, relax_quotes: true, trim: true }));

  for await (const row of parser) {
    if (!row || !row.name) continue;
    const composition = [row.short_composition1, row.short_composition2].filter(Boolean).map((s) => s.trim()).join(" + ");
    docs.push({
      name: row.name,
      manufacturer: row.manufacturer_name || "",
      price: row["price(₹)"] ? `₹${row["price(₹)"]}` : "",
      type: (row.type || "allopathy").toLowerCase(),
      packSize: row.pack_size_label || "",
      composition,
      category: pickCategory(row.type, row.pack_size_label),
      isDiscontinued: String(row.Is_discontinued || "").toUpperCase() === "TRUE",
    });
  }

  console.log("[seed] parsed", docs.length, "rows. inserting …");
  const BATCH = 2000;
  let inserted = 0;
  for (let i = 0; i < docs.length; i += BATCH) {
    const chunk = docs.slice(i, i + BATCH);
    try {
      const r = await Medicine.insertMany(chunk, { ordered: false });
      inserted += r.length;
    } catch (e) {
      // Duplicate / partial errors are non-fatal
      if (e.insertedDocs) inserted += e.insertedDocs.length;
    }
  }
  console.log("[seed] medicines inserted:", inserted);
}

module.exports = { seedAdmin, seedMedicinesFromCsv };
