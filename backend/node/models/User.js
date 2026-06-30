const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  // New features
  favorites: [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],
  recents:   [{ type: mongoose.Schema.Types.ObjectId, ref: "Medicine" }],
  reminders: [{
    _id:   { type: mongoose.Schema.Types.ObjectId, auto: true },
    medicineId: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine" },
    name:       { type: String, required: true },
    times:      [{ type: String }],                 // ["08:00","20:00"]
    notes:      { type: String, default: "" },
    active:     { type: Boolean, default: true },
    createdAt:  { type: Date, default: Date.now },
  }],
  language: { type: String, enum: ["en", "hi"], default: "en" },
  passwordResetToken:   { type: String, default: null },
  passwordResetExpires: { type: Date, default: null },
  createdAt:   { type: Date, default: Date.now },
  lastLoginAt: { type: Date, default: null },
});

userSchema.methods.toPublicJSON = function () {
  return {
    id: String(this._id),
    email: this.email,
    role: this.role,
    language: this.language || "en",
    favoritesCount: (this.favorites || []).length,
    remindersCount: (this.reminders || []).length,
    createdAt: this.createdAt,
  };
};

module.exports = mongoose.model("User", userSchema);
