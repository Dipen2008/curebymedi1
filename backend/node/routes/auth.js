const router = require("express").Router();
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const { signToken, setAuthCookie, clearAuthCookie, requireAuth } = require("../middleware/auth");

function badRequest(res, msg) { return res.status(400).json({ detail: msg }); }

router.post("/signup", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    if (!email || !password) return badRequest(res, "Email and password are required");
    if (password.length < 6) return badRequest(res, "Password must be at least 6 characters");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return badRequest(res, "Invalid email");

    if (await User.findOne({ email })) return res.status(400).json({ detail: "Email already registered" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email, passwordHash, role: "user" });
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: user.toPublicJSON(), token });
  } catch (e) { next(e); }
});

router.post("/login", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const password = String(req.body.password || "");
    if (!email || !password) return badRequest(res, "Email and password are required");

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ detail: "Invalid email or password" });
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ detail: "Invalid email or password" });

    user.lastLoginAt = new Date();
    await user.save();
    const token = signToken(user);
    setAuthCookie(res, token);
    res.json({ user: user.toPublicJSON(), token });
  } catch (e) { next(e); }
});

router.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
});

router.get("/me", requireAuth, (req, res) => {
  res.json(req.user.toPublicJSON());
});

router.post("/change-password", requireAuth, async (req, res, next) => {
  try {
    const oldPw = String(req.body.oldPassword || "");
    const newPw = String(req.body.newPassword || "");
    if (newPw.length < 6) return badRequest(res, "New password must be at least 6 characters");
    const ok = await bcrypt.compare(oldPw, req.user.passwordHash);
    if (!ok) return res.status(401).json({ detail: "Current password is incorrect" });
    req.user.passwordHash = await bcrypt.hash(newPw, 10);
    await req.user.save();
    res.json({ message: "Password updated" });
  } catch (e) { next(e); }
});

router.post("/set-language", requireAuth, async (req, res, next) => {
  try {
    const lang = req.body.language === "hi" ? "hi" : "en";
    req.user.language = lang;
    await req.user.save();
    res.json({ language: lang });
  } catch (e) { next(e); }
});

router.delete("/me", requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === "admin") return res.status(400).json({ detail: "Admin accounts cannot self-delete from the UI" });
    await User.findByIdAndDelete(req.user._id);
    clearAuthCookie(res);
    res.json({ message: "Account deleted" });
  } catch (e) { next(e); }
});

/**
 * Forgot / Reset password (TOKEN-BASED, no email yet)
 * In production: send the token by email via SendGrid/Resend.
 * For now: the token is returned in the response so you can wire it up to email later.
 */
router.post("/forgot-password", async (req, res, next) => {
  try {
    const email = String(req.body.email || "").toLowerCase().trim();
    const user = await User.findOne({ email });
    // Always respond OK to avoid email enumeration
    if (!user) return res.json({ message: "If that email exists, a reset link has been issued.", token: null });

 const token = crypto.randomBytes(24).toString("hex");

user.passwordResetToken = token;
user.passwordResetExpires = new Date(Date.now() + 1000 * 60 * 60);
await user.save();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

const resetUrl =
  `${process.env.APP_URL}/reset.html?token=${token}`;

await transporter.sendMail({
from: process.env.EMAIL_USER,
  to: email,
  subject: "Reset your CureByMedi password",
  html: `
    <h2>Password Reset</h2>
    <p>Click the link below to reset your password:</p>
    <a href="${resetUrl}">${resetUrl}</a>
  `
});

res.json({
  message: "If that email exists, a password reset link has been sent."
});

} catch (e) {
  next(e);
}       
});

router.post("/reset-password", async (req, res, next) => {
  try {
    const token = String(req.body.token || "");
    const newPw = String(req.body.newPassword || "");
    if (!token || newPw.length < 6) return badRequest(res, "Token and new password (>=6 chars) required");
    const user = await User.findOne({ passwordResetToken: token, passwordResetExpires: { $gt: new Date() } });
    if (!user) return res.status(400).json({ detail: "Reset link invalid or expired" });
    user.passwordHash = await bcrypt.hash(newPw, 10);
    user.passwordResetToken = null;
    user.passwordResetExpires = null;
    await user.save();
    res.json({ message: "Password reset successful" });
  } catch (e) { next(e); }
});

module.exports = router;
