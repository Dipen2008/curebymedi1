/* Pill reminders: store on server, fire local notifications when due. */
let RS = [];
const fired = new Set();

(async function () {
  await requireAuth();
  injectBottomNav();
  refresh();

  if ("Notification" in window && Notification.permission !== "granted") {
    $("#permPrompt").style.display = "flex";
    $("#permBtn").addEventListener("click", async () => {
      await Notification.requestPermission();
      if (Notification.permission === "granted") $("#permPrompt").style.display = "none";
    });
  }

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.target));
    const times = String(data.times).split(",").map((s) => s.trim()).filter(Boolean);
    try {
      await A.addReminder({ name: data.name, times, notes: data.notes });
      e.target.reset();
      refresh();
    } catch (err) { alert(err.message); }
  });

  // Tick every 30 sec — fire reminders whose time matches
  setInterval(tick, 30 * 1000);
  tick();
})();

async function refresh() {
  const { items } = await A.myReminders();
  RS = items;
  $("#count").textContent = `${items.length} reminder${items.length === 1 ? "" : "s"}`;
  $("#list").innerHTML = items.length
    ? items.map((r) => `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;gap:12px;">
        <div>
          <div style="font-family:Outfit;font-size:17px;font-weight:600;">${escapeHtml(r.name)}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;">
            ${(r.times || []).map((t) => `<span class="pill">${escapeHtml(t)}</span>`).join("")}
          </div>
          ${r.notes ? `<div class="small muted" style="margin-top:6px;">${escapeHtml(r.notes)}</div>` : ""}
        </div>
        <div style="display:flex;gap:6px;align-items:center;">
          <label class="small" style="display:flex;align-items:center;gap:4px;">
            <input type="checkbox" ${r.active ? "checked" : ""} onchange="toggle('${r._id}', this.checked)" /> on
          </label>
          <button class="btn btn-danger" onclick="del('${r._id}')">Delete</button>
        </div>
      </div>`).join("")
    : `<div class="empty">No reminders yet — add one above.</div>`;
}

window.del = async (id) => {
  if (!confirm("Delete this reminder?")) return;
  await A.deleteReminder(id);
  refresh();
};

window.toggle = async (id, active) => {
  await A.toggleReminder(id, active);
};

function tick() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const now = new Date();
  const hhmm = String(now.getHours()).padStart(2, "0") + ":" + String(now.getMinutes()).padStart(2, "0");
  for (const r of RS) {
    if (!r.active) continue;
    for (const t of (r.times || [])) {
      const key = `${r._id}-${t}-${now.toDateString()}`;
      if (t === hhmm && !fired.has(key)) {
        fired.add(key);
        try { new Notification("💊 Time for " + r.name, { body: r.notes || "Take your medicine now.", tag: key }); } catch (_e) {}
      }
    }
  }
}
