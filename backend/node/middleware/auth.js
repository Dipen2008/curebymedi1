const jwt = require("jsonwebtoken");
const User = require("../models/User");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === "change-me-in-env" || JWT_SECRET.length < 32) {
  console.error(
    "[FATAL] JWT_SECRET is missing or weak. Set a strong JWT_SECRET (>=32 chars) in backend/.env"
  );
  process.exit(1);
}
const TOKEN_TTL = "7d";

function signToken(user) {
  return jwt.sign(
    { sub: String(user._id), email: user.email, role: user.role, type: "access" },
    JWT_SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

function getToken(req) {
  if (req.cookies && req.cookies.access_token) return req.cookies.access_token;
  const h = req.headers.authorization || "";
  if (h.startsWith("Bearer ")) return h.slice(7);
  return null;
}

async function requireAuth(req, res, next) {
  const token = getToken(req);
  if (!token) return res.status(401).json({ detail: "Not authenticated" });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ detail: "User not found" });
    req.user = user;
    next();
  } catch (_e) {
    return res.status(401).json({ detail: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ detail: "Not authenticated" });
  if (req.user.role !== "admin") return res.status(403).json({ detail: "Admin only" });
  next();
}

function setAuthCookie(res, token) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

function clearAuthCookie(res) {
  res.clearCookie("access_token", { path: "/" });
}

module.exports = { signToken, requireAuth, requireAdmin, setAuthCookie, clearAuthCookie };
