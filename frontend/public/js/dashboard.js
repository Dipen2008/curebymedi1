/* User Dashboard: search + categories + grid + detail modal + favorites + recents + voice */

const CATEGORIES = ["All", "Tablets", "Capsules", "Syrup", "Injection", "Cream", "Drops", "Ayurvedic", "Homeopathy"];
const PAGE_SIZE = 24;

function translateDashboard() {

    const title = document.getElementById("dashboardTitle");
    if (title) title.textContent = T("dashboard_title");

    const subtitle = document.getElementById("dashboardSubtitle");
    if (subtitle) subtitle.textContent = T("dashboard_subtitle");

    const search = document.getElementById("search");
    if (search) search.placeholder = T("search_placeholder");

    const searchBtn = document.getElementById("searchBtn");
    if (searchBtn) searchBtn.textContent = T("search");

    const results = document.getElementById("resultsTitle");
    if (results && !state.search) {
        results.textContent = T("popular_medicines");
    }

    const loadMore = document.getElementById("loadMore");
    if (loadMore) loadMore.textContent = T("load_more");

}

let state = { search: "", category: "All", skip: 0, total: 0, items: [], favIds: new Set() };

(async function init() {
translateDashboard();
  const me = await requireAuth();
  if (!me) return;
  $("#userEmail").textContent = me.email;
  $("#avatarBtn").textContent = initials(me.email);
  if (me.role === "admin") $("#adminLink").classList.remove("hidden");

  $("#avatarBtn").addEventListener("click", (e) => { e.stopPropagation(); $("#userDropdown").classList.toggle("open"); });
  document.addEventListener("click", () => $("#userDropdown").classList.remove("open"));

  // Categories
  const chipsEl = $("#chips");
  CATEGORIES.forEach((c) => {
    chipsEl.appendChild(el("button", {
      class: "chip" + (c === "All" ? " active" : ""),
      dataset: { cat: c },
      "data-testid": `chip-${c.toLowerCase()}`,
      onclick: () => { state.category = c; state.skip = 0; refreshChips(); load(); },
    }, c));
  });

  // Search
  $("#searchForm").addEventListener("submit", (e) => { e.preventDefault(); state.search = $("#search").value.trim(); state.skip = 0; load(); });
  let debounce;
  $("#search").addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.search = e.target.value.trim(); state.skip = 0; load(); }, 250);
  });

  // Voice search
  $("#micBtn").addEventListener("click", startVoice);

  // Load more
  $("#loadMore").addEventListener("click", () => { state.skip += PAGE_SIZE; load({ append: true }); });

  // Pre-fetch favorites + recents
  try {
    const fav = await A.myFavorites();
    state.favIds = new Set(fav.items.map((m) => m.id));
  } catch (_e) {}
  try {
    const rec = await A.myRecents();
    if (rec.items.length) {
      $("#recentsSection").classList.remove("hidden");
      $("#recentsRow").innerHTML = rec.items.map((m) => `
        <a class="recent-card" href="javascript:openMedicine('${m.id}')">
          <div class="cat">${escapeHtml(m.category)}</div>
          <div class="name">${escapeHtml(m.name)}</div>
        </a>`).join("");
    }
  } catch (_e) {}

  // Honor ?id=… on URL (came from a deep link)
  const initialId = new URLSearchParams(location.search).get("id");
  if (initialId) setTimeout(() => openMedicine(initialId), 200);

  load();
})();

function refreshChips() {
  $$(".chip").forEach((c) => c.classList.toggle("active", c.dataset.cat === state.category));
}

async function load({ append = false } = {}) {
  const params = { limit: PAGE_SIZE, skip: state.skip };
  if (state.category !== "All") params.category = state.category;
  if (state.search) params.search = state.search;
  $("#resultsTitle").textContent = state.search ? `Showing "${state.search}"` : (state.category === "All" ? "Popular medicines" : state.category);
  try {
    const { items, total } = await A.medicines(params);
    state.total = total;
    state.items = append ? state.items.concat(items) : items;
    renderGrid();
  } catch (e) { console.error(e); $("#resultsCount").textContent = "Error loading"; }
}

function renderGrid() {
  const grid = $("#medGrid");
  if (!state.items.length) {
    grid.innerHTML = ""; $("#emptyState").classList.remove("hidden");
    $("#resultsCount").textContent = "0 results"; $("#loadMore").classList.add("hidden"); return;
  }
  $("#emptyState").classList.add("hidden");
  $("#resultsCount").textContent = `${state.total.toLocaleString()} result${state.total === 1 ? "" : "s"}`;
  grid.innerHTML = state.items.map((m) => `
    <article class="med-card" data-id="${m.id}" data-testid="medicine-card-${m.id}">
      <button class="fav-btn ${state.favIds.has(m.id) ? "on" : ""}" data-fav="${m.id}" title="Favorite">${state.favIds.has(m.id) ? "♥" : "♡"}</button>
      <div class="cat">${escapeHtml(m.category)}${m.isDiscontinued ? ' · <span style="color:#B91C1C">discontinued</span>' : ""}</div>
      <div class="name">${escapeHtml(m.name)}</div>
      <div class="comp">${escapeHtml(m.composition || "Composition not available")}</div>
      <div class="foot">
        <div class="price">${escapeHtml(m.price || "—")}</div>
        <div class="mfg">${escapeHtml(m.manufacturer || "")}</div>
      </div>
    </article>`).join("");

  $$(".med-card", grid).forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".fav-btn")) return;
      openMedicine(card.dataset.id);
    });
  });
  $$(".fav-btn", grid).forEach((btn) => btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFav(btn.dataset.fav); }));
  $("#loadMore").classList.toggle("hidden", state.items.length >= state.total);
}

async function toggleFav(id) {
  try {
    if (state.favIds.has(id)) { await A.removeFavorite(id); state.favIds.delete(id); }
    else { await A.addFavorite(id); state.favIds.add(id); }
    renderGrid();
  } catch (e) { alert(e.message); }
}
window.toggleFav = toggleFav;

async function openMedicine(id) {
  let m = state.items.find((x) => x.id === id);
  try { m = await A.medicineById(id); } catch { /* fallback */ }
  if (!m) return;
  A.recordView(id).catch(() => {});

  const modal = $("#modal");
  const card = modal.querySelector(".modal");
  card.innerHTML = renderModal(m, !m.aiEnriched);
  modal.classList.remove("hidden"); document.body.style.overflow = "hidden";
  bindModalActions(m);

  if (!m.aiEnriched) {
    try {
      const enriched = await A.enrichMedicine(id);
      if (!modal.classList.contains("hidden")) {
        card.innerHTML = renderModal(enriched, false);
        bindModalActions(enriched);
      }
    } catch (_e) {
      const loader = card.querySelector("#ai-loader");
      if (loader) loader.innerHTML = `<div class="small muted">Couldn't load AI details — showing basic info only.</div>`;
    }
  }
}
window.openMedicine = openMedicine;

function bindModalActions(m) {
  const btn = $("#modalFavBtn");
  if (btn) {
    btn.classList.toggle("on", state.favIds.has(m.id));
    btn.textContent = state.favIds.has(m.id) ? "♥ Saved" : "♡ Save";
    btn.onclick = async () => { await toggleFav(m.id); btn.classList.toggle("on", state.favIds.has(m.id)); btn.textContent = state.favIds.has(m.id) ? "♥ Saved" : "♡ Save"; };
  }
  const share = $("#modalShareBtn");
  if (share) share.onclick = () => {
    const url = `${location.origin}/medicine.html?slug=${encodeURIComponent(m.slug || m.id)}`;
    if (navigator.share) navigator.share({ title: m.name, text: m.composition, url }).catch(() => {});
    else { navigator.clipboard.writeText(url); alert("Link copied!"); }
  };
}

function renderModal(m, loading) {
  const aiBlock = loading
    ? `<div id="ai-loader" class="alert" style="background: var(--brand-soft); color: var(--brand); display: flex; gap: 10px; align-items: center;">
         <span class="spinner"></span> Reading medical details… (one moment)
       </div>`
    : `
      ${field("Used for", m.usedFor)}
      ${field("Daily dosage", m.dailyDosage)}
      ${field("How to take", m.howToTake)}
      ${field("Benefits", m.benefits)}
      ${field("Effects on the body", m.bodyEffects)}
      ${field("Side effects", m.sideEffects)}
      ${m.warnings ? `<div class="alert" style="background:#fef3c7; color:#92400e; margin-top: 4px;"><strong>⚠ Warnings:</strong> ${escapeHtml(m.warnings)}</div>` : ""}
    `;
  return `
    <div class="modal-header">
      <div>
        <div class="cat">${escapeHtml(m.category)}</div>
        <h2>${escapeHtml(m.name)}</h2>
        ${m.manufacturer ? `<div class="small muted" style="margin-top:4px;">by ${escapeHtml(m.manufacturer)}</div>` : ""}
      </div>
      <button class="btn btn-icon btn-ghost" data-testid="modal-close" aria-label="Close" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="row" style="gap:8px; flex-wrap:wrap; margin-bottom:14px;">
        ${m.price ? `<span class="pill">Price ${escapeHtml(m.price)}</span>` : ""}
        ${m.packSize ? `<span class="pill" style="background:#F5F5F4;color:var(--text-soft);">${escapeHtml(m.packSize)}</span>` : ""}
        ${m.type ? `<span class="pill" style="background:#F5F5F4;color:var(--text-soft);">${escapeHtml(m.type)}</span>` : ""}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap;margin-bottom:14px;">
        <button id="modalFavBtn" class="btn btn-secondary fav-pill">♡ Save</button>
        <button id="modalShareBtn" class="btn btn-secondary">↗ Share</button>
        <a class="btn btn-ghost" href="/reminders.html">⏰ Add reminder</a>
      </div>
      ${field("Composition", m.composition)}
      ${aiBlock}
      ${window.renderPartnerBuyBox ? renderPartnerBuyBox(m.name, { compact: true }) : ""}
      <div class="alert small" style="background:#FEF3C7; color:#78350F; margin-top: 14px;">
        ⚠ <strong>Disclaimer:</strong> This information is for educational purposes only and is NOT medical advice. CureByMedi is <strong>not responsible</strong> for any decision, action, side effect or harm arising from the use of this information. Always consult a qualified doctor or pharmacist before taking, changing, or stopping any medicine.
      </div>
      ${m.isDiscontinued ? `<div class="alert" style="background:#fef2f2; color:#991b1b; margin-top:10px;">⚠️ This medicine has been discontinued by the manufacturer.</div>` : ""}
    </div>`;
}

function field(label, value) {
  if (!value) return "";
  return `<div class="field"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`;
}

function closeModal(e) {
  if (e && e.target && !e.target.classList.contains("modal-bg")) return;
  $("#modal").classList.add("hidden");
  document.body.style.overflow = "";
}
window.closeModal = closeModal;

// --------- Voice search via Web Speech API ---------
function startVoice() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Voice search isn't supported on this browser. Try Chrome on Android."); return; }
  const rec = new SR();
  rec.lang = (getLang() === "hi" ? "hi-IN" : "en-IN");
  rec.interimResults = false; rec.maxAlternatives = 1;
  $("#micBtn").style.background = "#FEE2E2";
  rec.onresult = (e) => {
    const txt = e.results[0][0].transcript.trim();
    $("#search").value = txt;
    state.search = txt; state.skip = 0;
    load();
  };
  rec.onend = () => { $("#micBtn").style.background = ""; };
  rec.onerror = () => { $("#micBtn").style.background = ""; };
  rec.start();
}
