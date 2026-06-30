/* Drug interaction checker page */
const picked = [];

(async function () {
  await requireAuth();
  injectBottomNav();

  const input = $("#medInput");
  const sug = $("#suggestions");
  let debounce;

  input.addEventListener("input", (e) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => searchMeds(e.target.value.trim()), 200);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && input.value.trim()) {
      e.preventDefault();
      const first = sug.querySelector(".sug-item");
      if (first) first.click();
      else addCustom(input.value.trim());
    }
  });

  $("#checkBtn").addEventListener("click", check);

  async function searchMeds(q) {
    if (!q) { sug.style.display = "none"; return; }
    try {
      const { items } = await A.medicines({ search: q, limit: 8 });
      if (!items.length) { sug.style.display = "none"; return; }
      sug.innerHTML = items.map((m) => `
        <div class="sug-item" data-name="${escapeHtml(m.name)}" data-comp="${escapeHtml(m.composition || "")}" style="padding:10px 14px; border-bottom: 1px solid var(--border); cursor:pointer;">
          <div style="font-weight:600;">${escapeHtml(m.name)}</div>
          <div class="small muted">${escapeHtml(m.composition || "")}</div>
        </div>`).join("");
      sug.style.display = "block";
      $$(".sug-item", sug).forEach((it) => it.addEventListener("click", () => {
        addPick(`${it.dataset.name}${it.dataset.comp ? " (" + it.dataset.comp + ")" : ""}`);
      }));
    } catch (_e) { sug.style.display = "none"; }
  }

  function addCustom(name) { addPick(name); }

  function addPick(label) {
    if (picked.includes(label)) return;
    if (picked.length >= 6) { alert("Max 6 medicines"); return; }
    picked.push(label);
    renderPicked();
    input.value = "";
    sug.style.display = "none";
  }

  function renderPicked() {
    $("#picked").innerHTML = picked.map((p, i) => `
      <span class="pill" style="background:var(--brand);color:#fff;padding:8px 12px;display:inline-flex;gap:8px;align-items:center;">
        ${escapeHtml(p)}
        <button onclick="window.removePick(${i})" style="background:transparent;border:0;color:#fff;cursor:pointer;font-size:14px;">✕</button>
      </span>`).join("");
    $("#checkBtn").disabled = picked.length < 2;
  }

  window.removePick = (i) => { picked.splice(i, 1); renderPicked(); };

  async function check() {
    $("#loading").style.display = "block";
    $("#result").classList.add("hidden");
    try {
      const r = await A.checkInteractions(picked);
      renderResult(r);
    } catch (e) {
      $("#result").classList.remove("hidden");
      $("#result").innerHTML = `<div class="alert alert-error">${escapeHtml(e.message)}</div>`;
    } finally {
      $("#loading").style.display = "none";
    }
  }

  function levelColor(l) {
    if (l === "safe") return { bg: "#DCFCE7", fg: "#166534", icon: "✓" };
    if (l === "avoid") return { bg: "#FEE2E2", fg: "#991B1B", icon: "✕" };
    return { bg: "#FEF3C7", fg: "#92400E", icon: "!" };
  }

  function renderResult(r) {
    const top = levelColor(r.riskLevel);
    $("#result").classList.remove("hidden");
    $("#result").innerHTML = `
      <div class="card" style="background:${top.bg};border-color:${top.bg};">
        <div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;font-weight:700;color:${top.fg};">${escapeHtml(r.riskLevel)}</div>
        <div style="font-family:Outfit;font-size:22px;font-weight:600;color:${top.fg};margin-top:4px;">${top.icon} ${escapeHtml(r.summary)}</div>
      </div>
      <div class="card" style="margin-top:14px;">
        <div class="label-small" style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:var(--text-mute);font-weight:700;">Pair-wise breakdown</div>
        ${r.pairs.map((p) => {
          const c = levelColor(p.level);
          return `
          <div style="margin-top:12px;padding:12px;border:1px solid var(--border);border-radius:12px;">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
              <div style="font-weight:600;">${escapeHtml(p.a)} ↔ ${escapeHtml(p.b)}</div>
              <span style="background:${c.bg};color:${c.fg};padding:2px 8px;border-radius:8px;font-size:11px;font-weight:700;text-transform:uppercase;">${escapeHtml(p.level)}</span>
            </div>
            <div class="small muted" style="margin-top:6px;">${escapeHtml(p.explanation)}</div>
          </div>`;
        }).join("")}
      </div>
      <div class="alert" style="background:#FEF3C7;color:#78350F;margin-top:14px;">${escapeHtml(r.advice)}</div>
    `;
  }
})();
