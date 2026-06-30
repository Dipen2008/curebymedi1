/**
 * Public SEO endpoints — no auth.
 *  GET /api/seo/sitemap.xml  — every medicine page indexable by Google
 *  GET /api/seo/robots.txt   — search-engine instructions
 */
const router = require("express").Router();
const Medicine = require("../models/Medicine");
const { slugify } = require("../services/slug");

// We cache the sitemap for 6 hours since 250k entries means a slow query
let CACHED = { xml: null, generatedAt: 0 };
const TTL_MS = 6 * 60 * 60 * 1000;

function publicBase(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/$/, "");
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
  const proto = req.headers["x-forwarded-proto"] || (host.includes("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

router.get("/sitemap.xml", async (req, res, next) => {
  try {
    if (CACHED.xml && Date.now() - CACHED.generatedAt < TTL_MS) {
      res.type("application/xml").send(CACHED.xml);
      return;
    }
    const base = publicBase(req);
    const cursor = Medicine.find({}, { name: 1, slug: 1, updatedAt: 1 }).limit(50000).lean().cursor();
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
    xml += `  <url><loc>${base}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>\n`;
    for await (const m of cursor) {
      const slug = m.slug || slugify(m.name);
      if (!slug) continue;
      xml += `  <url><loc>${base}/medicine/${encodeURIComponent(slug)}</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>\n`;
    }
    xml += "</urlset>";
    CACHED = { xml, generatedAt: Date.now() };
    res.type("application/xml").send(xml);
  } catch (e) { next(e); }
});

router.get("/robots.txt", (req, res) => {
  const base = publicBase(req);
  res.type("text/plain").send(
`User-agent: *
Allow: /
Disallow: /admin.html
Disallow: /api/

Sitemap: ${base}/api/seo/sitemap.xml
`);
});

module.exports = router;
