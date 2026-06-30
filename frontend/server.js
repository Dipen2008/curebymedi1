/**
 * CureByMedi - Static frontend server
 * Serves the /public folder.
 */
const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC = path.join(__dirname, "public");

// Service worker needs to be served from root scope with right MIME
app.get("/service-worker.js", (_req, res) => {
  res.set("Service-Worker-Allowed", "/");
  res.type("application/javascript");
  res.sendFile(path.join(PUBLIC, "service-worker.js"));
});

app.use(express.static(PUBLIC, { extensions: ["html"] }));

// SEO redirects so Google sees /sitemap.xml and /robots.txt at the root
app.get("/sitemap.xml", (_req, res) => res.redirect(301, "/api/seo/sitemap.xml"));
app.get("/robots.txt",   (_req, res) => res.redirect(301, "/api/seo/robots.txt"));

// Pretty SEO URLs: /medicine/<slug> -> /medicine.html (the page reads the slug from location.pathname)
app.get("/medicine/:slug", (_req, res) => res.sendFile(path.join(PUBLIC, "medicine.html")));

// SPA-ish fallback for anything else not matching a file: send to landing
app.get("*", (_req, res) => res.sendFile(path.join(PUBLIC, "index.html")));

app.listen(PORT, HOST, () => {
  console.log(`[frontend] http://${HOST}:${PORT}`);
});
