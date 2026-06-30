/* CureByMedi — Partner pharmacy "Buy from" widget.
   Renders 4 affiliate-style buttons that search the medicine name on each pharmacy.
   To monetise: replace the affiliate IDs in `PARTNERS` below with your real ones.
   Each partner's `template(name)` returns the deep-link URL. */

const PARTNERS = [
  {
    id: "1mg",
    label: "Tata 1mg",
    color: "#FF6F61",
    cdn: "https://1mg.com/favicon.ico",
    aff: "",   // e.g. "?utm_source=curebymedi&aff=YOUR_ID"
    template: (name) => `https://www.1mg.com/search/all?name=${encodeURIComponent(name)}`,
  },
  {
    id: "pharmeasy",
    label: "PharmEasy",
    color: "#10847E",
    cdn: "https://pharmeasy.in/favicon.ico",
    aff: "",
    template: (name) => `https://pharmeasy.in/search/all?name=${encodeURIComponent(name)}`,
  },
  {
    id: "apollo",
    label: "Apollo 24/7",
    color: "#00A0DC",
    cdn: "https://www.apollo247.com/favicon.ico",
    aff: "",
    template: (name) => `https://www.apollopharmacy.in/search-medicines/${encodeURIComponent(name)}`,
  },
  {
    id: "netmeds",
    label: "Netmeds",
    color: "#7BC142",
    cdn: "https://www.netmeds.com/favicon.ico",
    aff: "",
    template: (name) => `https://www.netmeds.com/catalogsearch/result?q=${encodeURIComponent(name)}`,
  },
];

/* Render an HTML block of partner buttons for a given medicine name.
   `compact` mode is used inside the dashboard modal (smaller).        */
function renderPartnerBuyBox(medicineName, { compact = false } = {}) {
  if (!medicineName) return "";
  const name = String(medicineName).trim();
  const links = PARTNERS.map((p) => {
    const href = p.template(name) + (p.aff || "");
    return `
      <a href="${href}"
         target="_blank" rel="nofollow sponsored noopener"
         class="buy-btn"
         data-testid="buy-${p.id}"
         data-partner="${p.id}"
         style="--accent:${p.color};">
        <span class="buy-logo" style="background:${p.color}1a;color:${p.color};">${p.label.charAt(0)}</span>
        <span class="buy-text">
          <span class="buy-name">${p.label}</span>
          <span class="buy-cta">View price →</span>
        </span>
      </a>`;
  }).join("");

  return `
    <section class="partner-box${compact ? " compact" : ""}" data-testid="partner-buy-box">
      <div class="partner-head">
        <div class="partner-title">
          <span class="partner-dot"></span>
          Buy <strong>${escapeHtml(name)}</strong> from a verified pharmacy
        </div>
        <span class="partner-tag">Sponsored</span>
      </div>
      <div class="partner-grid">${links}</div>
      <div class="partner-foot small muted">
        CureByMedi may earn a small commission. Prices &amp; availability are decided by each pharmacy.
      </div>
    </section>`;
}

// Light click telemetry (fire-and-forget, no PII)
document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a.buy-btn");
  if (!a) return;
  try {
    if (window.gtag) window.gtag("event", "partner_click", { partner: a.dataset.partner });
  } catch (_e) {}
});

window.renderPartnerBuyBox = renderPartnerBuyBox;
