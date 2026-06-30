/* Admin dashboard: overview + medicines table + users + scans + import */

const ADMIN = {
  medState: { search: "", skip: 0, limit: 25, total: 0 },
  editingId: null,
};

(async function init() {
  const me = await requireAdmin();
  if (!me) return;

  // Tabs
  $$(".tab").forEach((t) => t.addEventListener("click", () => switchTab(t.dataset.tab)));

  // Med toolbar
  let dMed;
  $("#medSearch").addEventListener("input", (e) => {
    clearTimeout(dMed); dMed = setTimeout(() => { ADMIN.medState.search = e.target.value.trim(); ADMIN.medState.skip = 0; loadMedicines(); }, 250);
  });
  $("#medLoadMore").addEventListener("click", () => { ADMIN.medState.skip += ADMIN.medState.limit; loadMedicines({ append: true }); });

  // User toolbar
  let dUser;
  $("#userSearch").addEventListener("input", (e) => {
    clearTimeout(dUser); dUser = setTimeout(() => loadUsers(e.target.value.trim()), 250);
  });

  // Med form
  $("#medForm").addEventListener("submit", saveMed);

  // Import
  $("#csvInput").addEventListener("change", (e) => importCsv(e.target.files[0]));
  $("#importBtn").addEventListener("click", importJson);

  // Initial
  loadStats();
})();

function switchTab(name) {
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  $$(".pane").forEach((p) => p.classList.toggle("hidden", p.id !== `pane-${name}`));
  if (name === "overview") loadStats();
  if (name === "medicines") loadMedicines();
  if (name === "users") loadUsers();
  if (name === "scans") loadScans();
}

async function loadStats() {
  try {
    const s = await A.adminStats();
    $("#stat-meds").textContent = s.totalMedicines.toLocaleString();
    $("#stat-users").textContent = s.totalUsers.toLocaleString();
    $("#stat-admins").textContent = s.totalAdmins.toLocaleString();
    $("#stat-scans-today").textContent = s.scansToday.toLocaleString();
    $("#stat-scans-total").textContent = s.scansTotal.toLocaleString();
    $("#catBody").innerHTML = s.byCategory.map((c) => `<tr><td>${escapeHtml(c.category)}</td><td style="text-align:right">${c.count.toLocaleString()}</td></tr>`).join("");
  } catch (e) { console.error(e); }
}

async function loadMedicines({ append = false } = {}) {
  const params = { limit: ADMIN.medState.limit, skip: ADMIN.medState.skip };
  if (ADMIN.medState.search) params.search = ADMIN.medState.search;
  try {
    const { items, total } = await A.medicines(params);
    ADMIN.medState.total = total;
    const tbody = $("#medBody");
    const rowsHtml = items.map((m) => `
      <tr data-id="${m.id}" data-testid="admin-row-${m.id}">
        <td>${escapeHtml(m.name)}</td>
        <td class="muted small">${escapeHtml(m.manufacturer || "—")}</td>
        <td><span class="badge">${escapeHtml(m.category)}</span></td>
        <td>${escapeHtml(m.price || "—")}</td>
        <td style="text-align:right; white-space:nowrap;">
          <button class="btn btn-ghost" data-action="edit" data-testid="edit-${m.id}">Edit</button>
          <button class="btn btn-danger" data-action="del" data-testid="delete-${m.id}">Delete</button>
        </td>
      </tr>
    `).join("");
    tbody.innerHTML = append ? tbody.innerHTML + rowsHtml : rowsHtml;
    // Hook actions
    $$("button[data-action]", tbody).forEach((btn) => {
      btn.addEventListener("click", async (e) => {
        const tr = btn.closest("tr");
        const id = tr.dataset.id;
        if (btn.dataset.action === "edit") {
          const m = await A.medicineById(id);
          openMedForm(m);
        } else {
          if (!confirm("Delete this medicine?")) return;
          await A.deleteMedicine(id);
          tr.remove();
        }
      });
    });
    $("#medMeta").textContent = `${ADMIN.medState.total.toLocaleString()} total`;
    $("#medLoadMore").classList.toggle("hidden", (ADMIN.medState.skip + items.length) >= ADMIN.medState.total);
  } catch (e) { console.error(e); }
}

function openMedForm(m = null) {
  ADMIN.editingId = m ? m.id : null;
  $("#medFormTitle").textContent = m ? "Edit medicine" : "Add medicine";
  const form = $("#medForm");
  form.reset();
  if (m) {
    for (const k of ["name","manufacturer","price","category","composition","packSize","dosage","benefits","sideEffects","howToTake"]) {
      if (form.elements[k] != null) form.elements[k].value = m[k] || "";
    }
  }
  $("#medFormErr").classList.add("hidden");
  $("#medModal").classList.remove("hidden");
}
function closeMedForm(e) {
  if (e && e.target && !e.target.classList.contains("modal-bg")) return;
  $("#medModal").classList.add("hidden");
}
async function saveMed(e) {
  e.preventDefault();
  const form = $("#medForm");
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    if (ADMIN.editingId) await A.updateMedicine(ADMIN.editingId, data);
    else await A.createMedicine(data);
    closeMedForm();
    loadMedicines();
  } catch (err) {
    const box = $("#medFormErr");
    box.textContent = err.message || "Save failed";
    box.classList.remove("hidden");
  }
}
window.openMedForm = openMedForm;
window.closeMedForm = closeMedForm;

async function loadUsers(search = "") {
  try {
    const { items } = await A.adminUsers({ search, limit: 100 });
    $("#userBody").innerHTML = items.map((u) => `
      <tr data-id="${u.id}">
        <td>${escapeHtml(u.email)}</td>
        <td><span class="badge ${u.role === "admin" ? "admin" : ""}">${escapeHtml(u.role)}</span></td>
        <td class="muted small">${fmtDate(u.createdAt)}</td>
        <td class="muted small">${u.lastLoginAt ? fmtDate(u.lastLoginAt) : "never"}</td>
        <td style="text-align:right; white-space:nowrap;">
          ${u.role === "admin"
            ? `<button class="btn btn-ghost" data-action="demote">Demote</button>`
            : `<button class="btn btn-ghost" data-action="promote">Promote</button>`}
          <button class="btn btn-danger" data-action="del">Delete</button>
        </td>
      </tr>
    `).join("");
    $$("#userBody button[data-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tr = btn.closest("tr");
        const id = tr.dataset.id;
        try {
          if (btn.dataset.action === "promote") await A.setUserRole(id, "admin");
          else if (btn.dataset.action === "demote") await A.setUserRole(id, "user");
          else if (btn.dataset.action === "del") {
            if (!confirm("Delete this user?")) return;
            await A.deleteUser(id);
          }
          loadUsers(search);
          loadStats();
        } catch (e) { alert(e.message); }
      });
    });
  } catch (e) { console.error(e); }
}

async function loadScans() {
  try {
    const { items } = await A.recentScans(100);
    $("#scanBody").innerHTML = items.length
      ? items.map((s) => `
        <tr>
          <td class="muted small">${fmtDate(s.createdAt)}</td>
          <td>${escapeHtml(s.userEmail)}</td>
          <td>${escapeHtml(s.detectedName || "—")}</td>
          <td class="small muted">${escapeHtml((s.summary || "").slice(0, 120))}</td>
        </tr>`).join("")
      : `<tr><td colspan="4" class="empty">No scans yet.</td></tr>`;
  } catch (e) { console.error(e); }
}

/* ---- CSV / JSON bulk import ---- */

function parseCsv(text) {
  // Minimal CSV parser: supports quoted values with commas and "" escape
  const rows = [];
  let i = 0, field = "", row = [], inQuotes = false;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i+1] === '"') { field += '"'; i += 2; continue; }
      if (c === '"') { inQuotes = false; i++; continue; }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ""; i++; continue; }
    if (c === '\n' || c === '\r') {
      if (field !== "" || row.length) { row.push(field); rows.push(row); }
      field = ""; row = [];
      while (text[i] === '\n' || text[i] === '\r') i++;
      continue;
    }
    field += c; i++;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(headers.map((h, idx) => [h, (r[idx] || "").trim()])));
}

async function importCsv(file) {
  if (!file) return;
  const text = await file.text();
  const items = parseCsv(text).filter((r) => r.name);
  await sendImport(items);
}
async function importJson() {
  const raw = $("#jsonInput").value.trim();
  if (!raw) return;
  try {
    const items = JSON.parse(raw);
    if (!Array.isArray(items)) return showImport("error", "JSON must be an array");
    await sendImport(items);
  } catch (e) { showImport("error", "Invalid JSON: " + e.message); }
}
async function sendImport(items) {
  if (!items.length) return showImport("error", "No rows to import");
  showImport("ok", `Uploading ${items.length} medicines…`);
  try {
    const res = await api("/admin/medicines/bulk", { method: "POST", body: { items } });
    showImport("ok", `✅ Imported ${res.inserted.toLocaleString()} medicines`);
    loadStats();
  } catch (e) { showImport("error", e.message); }
}
function showImport(kind, msg) {
  const box = $("#importResult");
  box.className = "alert " + (kind === "ok" ? "alert-success" : "alert-error");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString() + " " + dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
