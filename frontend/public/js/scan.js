/* Scan page: pick image -> POST to /api/scan -> show result */

let selectedFile = null;

(async function init() {
  if (!(await requireAuth())) return;

  ["camInput", "fileInput"].forEach((id) => {
    document.getElementById(id).addEventListener("change", (e) => onPick(e.target.files[0]));
  });

  const drop = document.getElementById("dropZone");
  ["dragenter", "dragover"].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.add("drag"); }));
  ["dragleave", "drop"].forEach((evt) => drop.addEventListener(evt, (e) => { e.preventDefault(); drop.classList.remove("drag"); }));
  drop.addEventListener("drop", (e) => { if (e.dataTransfer.files[0]) onPick(e.dataTransfer.files[0]); });

  document.getElementById("analyzeBtn").addEventListener("click", analyze);
})();

function onPick(file) {
  if (!file) return;
  if (file.size > 10 * 1024 * 1024) { showError("Image too large (max 10 MB)"); return; }
  if (!/^image\//.test(file.type)) { showError("Please pick an image file"); return; }
  selectedFile = file;

  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById("previewImg").src = e.target.result;
    document.getElementById("preview").classList.remove("hidden");
    document.getElementById("result").classList.add("hidden");
    hideError();
  };
  reader.readAsDataURL(file);
}

async function analyze() {
  if (!selectedFile) return;
  document.getElementById("loading").style.display = "block";
  document.getElementById("result").classList.add("hidden");
  hideError();
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;

  try {
    const res = await A.scanImage(selectedFile);
    showResult(res);
  } catch (e) {
    showError(e.message || "Could not analyse the image");
  } finally {
    document.getElementById("loading").style.display = "none";
    btn.disabled = false;
  }
}

function showResult(res) {
  const name = (res.detected && res.detected.name) || "";
  const summary = (res.detected && res.detected.summary) || "";

  if (!name) {
    showError(summary || "Could not read a medicine name from the photo. Try a clearer, well-lit shot of the strip or label.");
    return;
  }

  document.getElementById("resName").textContent = name;
  document.getElementById("resSummary").textContent = summary || "";

  const matchEl = document.getElementById("resMatch");
  if (res.matched) {
    const m = res.matched;
    matchEl.innerHTML = `
      <div class="match" data-testid="scan-match">
        <div style="font-size:11px; letter-spacing:0.15em; text-transform:uppercase; color: var(--text-mute); font-weight:700;">Match in our database</div>
        <div style="font-family:Outfit; font-weight:600; font-size:17px; margin-top:4px;">${escapeHtml(m.name)}</div>
        <div class="small muted" style="margin-top:2px;">${escapeHtml(m.composition || "")} ${m.manufacturer ? `· ${escapeHtml(m.manufacturer)}` : ""}</div>
        <div style="margin-top: 10px;">
          <a href="/dashboard.html?id=${encodeURIComponent(m.id)}" class="btn btn-secondary btn-sm">Open details</a>
        </div>
      </div>`;
  } else {
    matchEl.innerHTML = `<div class="match" style="color: var(--text-soft); font-size:14px;">We couldn't find this exact medicine in our database — but the summary above is still useful.</div>`;
  }

  document.getElementById("result").classList.remove("hidden");
}

function resetScan() {
  selectedFile = null;
  document.getElementById("camInput").value = "";
  document.getElementById("fileInput").value = "";
  document.getElementById("preview").classList.add("hidden");
  document.getElementById("result").classList.add("hidden");
  hideError();
}
function showError(msg) {
  const e = document.getElementById("error");
  e.textContent = msg;
  e.classList.remove("hidden");
}
function hideError() { document.getElementById("error").classList.add("hidden"); }
window.resetScan = resetScan;
