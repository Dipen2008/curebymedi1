// ================= AI SAFETY LAYER =================
const aiCache = new Map();
let lastAiCall = 0;

function canCallAI() {
  const now = Date.now();
  if (now - lastAiCall < 800) return false; // throttle 800ms
  lastAiCall = now;
  return true;
}
/* CureByMedi — shared API client (vanilla JS, no framework) */
const API_BASE = "https://your-node-backend.onrender.com/api";
const TOKEN_KEY = "cbm_token";
const LANG_KEY = "cbm_lang";

function getToken() { return localStorage.getItem(TOKEN_KEY); }
function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }
function getLang() { return localStorage.getItem(LANG_KEY) || "en"; }
function setLang(l) { localStorage.setItem(LANG_KEY, l); document.documentElement.lang = l; }

async function api(path, { method = "GET", body, formData, headers = {} } = {}) {
  const token = getToken();
  const init = { method, credentials: "include", headers: { ...headers } };
  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  if (token) init.headers.Authorization = `Bearer ${token}`;
  const res = await fetch(API_BASE + path, init);
  const ct = res.headers.get("content-type") || "";
  const payload = ct.includes("application/json") ? await res.json().catch(() => ({})) : await res.text();
  if (!res.ok) {
    const detail = (payload && payload.detail) || payload || res.statusText;
    const msg = typeof detail === "string" ? detail : JSON.stringify(detail);
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return payload;
}

const A = {
  signup:  (email, password) => api("/auth/signup", { method: "POST", body: { email, password } }),
  login:   (email, password) => api("/auth/login",  { method: "POST", body: { email, password } }),
  logout:  () => api("/auth/logout", { method: "POST" }),
  me:      () => api("/auth/me"),
  changePassword: (oldPassword, newPassword) => api("/auth/change-password", { method: "POST", body: { oldPassword, newPassword } }),
  setLanguage: (language) => api("/auth/set-language", { method: "POST", body: { language } }),
  deleteMe: () => api("/auth/me", { method: "DELETE" }),
  forgotPassword: (email) => api("/auth/forgot-password", { method: "POST", body: { email } }),
  resetPassword: (token, newPassword) => api("/auth/reset-password", { method: "POST", body: { token, newPassword } }),

  medicines: (q = {}) => {
    const qs = new URLSearchParams(Object.entries(q).filter(([_, v]) => v != null && v !== "")).toString();
    return api(`/medicines${qs ? "?" + qs : ""}`);
  },
  medicineById: (id) => api(`/medicines/${id}`),
  medicineBySlug: (slug) => api(`/medicines/by-slug/${encodeURIComponent(slug)}`),
  enrichMedicine: (id) => api(`/medicines/${id}/enrich`, { method: "POST" }),
  createMedicine: (m) => api("/medicines", { method: "POST", body: m }),
  updateMedicine: (id, m) => api(`/medicines/${id}`, { method: "PUT", body: m }),
  deleteMedicine: (id) => api(`/medicines/${id}`, { method: "DELETE" }),

  // /me/* user-scoped
  myFavorites: () => api("/me/favorites"),
  addFavorite: (id) => api(`/me/favorites/${id}`, { method: "POST" }),
  removeFavorite: (id) => api(`/me/favorites/${id}`, { method: "DELETE" }),
  recordView: (id) => api(`/me/recents/${id}`, { method: "POST" }),
  myRecents: () => api("/me/recents"),
  myReminders: () => api("/me/reminders"),
  addReminder: (data) => api("/me/reminders", { method: "POST", body: data }),
  deleteReminder: (id) => api(`/me/reminders/${id}`, { method: "DELETE" }),
  toggleReminder: (id, active) => api(`/me/reminders/${id}`, { method: "PATCH", body: { active } }),

  // AI features
  checkInteractions: (medicineNames) => api("/ai/interactions", { method: "POST", body: { medicineNames } }),
  suggestForSymptoms: async (symptoms) => {
  if (!symptoms || symptoms.length < 3) return null;

  // throttle
  if (!canCallAI()) return;

  // cache
  if (aiCache.has(symptoms)) {
    return aiCache.get(symptoms);
  }

  const res = await api("/ai/suggest", {
    method: "POST",
    body: { symptoms }
  });

  aiCache.set(symptoms, res);
  return res;
},

  // admin (unchanged)
  adminStats: () => api("/admin/stats"),
  adminUsers: (q = {}) => api(`/admin/users?${new URLSearchParams(q).toString()}`),
  setUserRole: (id, role) => api(`/admin/users/${id}/role`, { method: "POST", body: { role } }),
  deleteUser:  (id) => api(`/admin/users/${id}`, { method: "DELETE" }),
  recentScans: (limit = 50) => api(`/admin/scans?limit=${limit}`),
  scanImage: (file) => {
    const fd = new FormData(); fd.append("image", file);
    return api("/scan", { method: "POST", formData: fd });
  },
};

async function requireAuth() {
  try { const me = await A.me(); window.__cbm_user = me; return me; }
  catch { window.location.href = "/login.html"; return null; }
}
async function requireAdmin() {
  const me = await requireAuth();
  if (me && me.role !== "admin") { window.location.href = "/dashboard.html"; return null; }
  return me;
}
async function redirectIfAuthed() {
  try { const me = await A.me(); if (me) window.location.href = "/dashboard.html"; } catch { /* guest */ }
}

function logout() {
  return A.logout().catch(() => {}).finally(() => { setToken(null); window.location.href = "/"; });
}

// Tiny DOM helpers
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === "class") e.className = attrs[k];
    else if (k === "html") e.innerHTML = attrs[k];
    else if (k.startsWith("on") && typeof attrs[k] === "function") e.addEventListener(k.slice(2).toLowerCase(), attrs[k]);
    else if (k === "dataset") Object.assign(e.dataset, attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
  }
  return e;
}
function escapeHtml(s) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c])); }
function initials(email) { return (email || "?").charAt(0).toUpperCase(); }

// ----- Optional: Google Analytics 4 -----
// To enable: replace the empty string with your GA4 measurement ID (e.g. "G-ABC123XYZ")
const GA4_ID = ""; // e.g. "G-XXXXXXXXXX"
if (GA4_ID) {
  const s = document.createElement("script");
  s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`;
  document.head.appendChild(s);
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", GA4_ID, { anonymize_ip: true });
}

// Reusable legal disclaimer — shown across the app
const LEGAL_DISCLAIMER =
  "⚠ Disclaimer: CureByMedi provides general medicine information for educational purposes only. " +
  "It is NOT medical advice. We are NOT responsible for any decision, action, harm, side effect, or consequence " +
  "arising from the use of information shown here. Always consult a qualified doctor or pharmacist before taking, " +
  "changing, or stopping any medicine.";

function injectLegalFooter() {
  if (document.getElementById("cbm-legal-footer")) return;
  const f = document.createElement("footer");
  f.id = "cbm-legal-footer";
  f.className = "legal-footer";
  f.innerHTML = `
    <div class="legal-inner">
      <div class="legal-disclaimer">${LEGAL_DISCLAIMER}</div>
      <div class="legal-meta">© 2026 CureByMedi · <a href="/about.html">About</a> · <a href="/terms.html">Terms</a> · <a href="/privacy.html">Privacy</a></div>
    </div>`;
  document.body.appendChild(f);
}

// Reusable bottom navigation (call from any logged-in page)
function injectBottomNav(active = "home") {
  const nav = document.createElement("nav");
  nav.className = "bottom-nav";
  nav.innerHTML = `
    <a href="/dashboard.html" ${active==="home"?'class="active"':""}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 12l9-9 9 9"/><path d="M5 10v10h14V10"/></svg>Home</a>
    <a href="/favorites.html" ${active==="favs"?'class="active"':""}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M12 21s-7-4.5-9.5-9.5C.5 7 4 3 8 4.5 10 5.3 11 7 12 7c1 0 2-1.7 4-2.5C20 3 23.5 7 21.5 11.5 19 16.5 12 21 12 21z"/></svg>Favs</a>
    <a href="/scan.html" class="scan-btn ${active==="scan"?"active":""}">
      <span class="scan-icon"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="12" cy="12" r="4"/></svg></span>Scan</a>
    <a href="/profile.html" ${active==="profile"?'class="active"':""}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="8" r="4"/><path d="M4 22c0-4.4 3.6-8 8-8s8 3.6 8 8"/></svg>Profile</a>
  `;
  document.body.appendChild(nav);
  injectLegalFooter();
}

// Auto-inject the legal footer on any page that imports api.js (even if no bottom-nav)
document.addEventListener("DOMContentLoaded", () => {
  // Don't double-add — bottom-nav pages will call injectBottomNav() which also injects this
  setTimeout(() => { if (!document.getElementById("cbm-legal-footer")) injectLegalFooter(); }, 50);
});

// PWA: register service worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  });
}
