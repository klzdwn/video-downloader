/* script.js
   Client-side fetch ke API downloader (configurable)
   - Sesuaikan API_ENDPOINT ke server / proxy mu
   - Jika API mengembalikan struktur berbeda, sesuaikan bagian mapping (see comments)
*/

/* ================== CONFIG ================== */
// Ganti ini ke URL server yang kamu deploy (server harus tambahkan CORS header)
const API_ENDPOINT = "https://YOUR-SERVER-HERE/api/download?url=";

// Jika mau coba langsung ke tikwm (kemungkinan besar CORS error), isi:
// const API_ENDPOINT = "https://www.tikwm.com/api/?url=";

// Optional: jika kamu mau gunakan CORS proxy sementara (testing), aktifkan
const API_ENDPOINT= false;
const API_ENDPOINT= "https://www.tikwm.com/api/?url="; // contoh public proxy (limit & tidak untuk production)

/* ================== Elemen DOM ================== */
const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
const statusBox = document.getElementById("statusBox");
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");

/* ================== Helper UI ================== */
function showStatus(message, type = "info") {
  if (!statusBox) return;
  statusBox.classList.remove("hidden");
  statusBox.textContent = message;
  statusBox.dataset.type = type;
  // styling classes handled by CSS via data-type or class if needed
}

function hideStatus() {
  if (!statusBox) return;
  statusBox.classList.add("hidden");
  statusBox.textContent = "";
}

function clearResults() {
  if (!resultBox || !resultList) return;
  resultList.innerHTML = "";
  resultBox.classList.add("hidden");
  hideStatus();
}

/* ================== Util: find thumbnail or urls from response ================== */
function collectUrls(obj, out = new Set()) {
  if (!obj) return out;
  if (typeof obj === "string") {
    const s = obj.trim();
    if (/^https?:\/\//i.test(s)) out.add(s);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const it of obj) collectUrls(it, out);
    return out;
  }
  if (typeof obj === "object") {
    for (const k of Object.keys(obj)) collectUrls(obj[k], out);
  }
  return out;
}

function pickThumbnailFromResponse(json) {
  // Common candidates
  if (!json) return null;
  if (json.thumbnail) return json.thumbnail;
  if (json.cover) return json.cover;
  if (json.data && (json.data.cover || json.data.thumbnail)) return json.data.cover || json.data.thumbnail;

  const all = Array.from(collectUrls(json));
  for (const u of all) {
    if (/\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(u)) return u;
  }
  return null;
}

/* ================== Render UI ================== */
function makeDownloadRow(item, thumb) {
  // item: { label, url, size }
  const wrap = document.createElement("div");
  wrap.className = "result-item";

  // left: meta (title/label)
  const meta = document.createElement("div");
  meta.className = "info";

  const title = document.createElement("div");
  title.className = "info-title";
  title.textContent = item.label || "Video";

  const sub = document.createElement("div");
  sub.className = "info-meta";
  sub.textContent = item.size || "";

  meta.appendChild(title);
  meta.appendChild(sub);

  // right: buttons
  const btns = document.createElement("div");
  btns.className = "result-buttons";

  const openBtn = document.createElement("a");
  openBtn.className = "btn btn-small";
  openBtn.href = item.url;
  openBtn.target = "_blank";
  openBtn.rel = "noopener noreferrer";
  openBtn.textContent = "Open";

  const dlBtn = document.createElement("a");
  dlBtn.className = "btn btn-small btn-primary";
  dlBtn.href = item.url;
  dlBtn.target = "_blank";
  dlBtn.rel = "noopener noreferrer";
  dlBtn.download = "";
  dlBtn.textContent = "Download";

  btns.appendChild(openBtn);
  btns.appendChild(dlBtn);

  // optionally thumbnail (small)
  if (thumb) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "thumb";
    const img = document.createElement("img");
    img.src = thumb;
    img.alt = "thumb";
    img.loading = "lazy";
    imgWrap.appendChild(img);
    wrap.appendChild(imgWrap);
  }

  wrap.appendChild(meta);
  wrap.appendChild(btns);
  return wrap;
}

/* ================== Core: fetch API and render ================== */
async function fetchDownloadInfo(videoUrl) {
  // build endpoint
  let endpoint = API_ENDPOINT + encodeURIComponent(videoUrl);

  // if tikwm style needs hd param, append? leave to server - not hardcoded here
  // optional cors proxy wrap
  if (USE_CORS_PROXY) endpoint = CORS_PROXY + encodeURIComponent(endpoint);

  // try fetch
  const res = await fetch(endpoint, { method: "GET" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}`);
    err.raw = text;
    throw err;
  }

  // parse json if possible
  const contentType = res.headers.get("content-type") || "";
  if (contentType.includes("application/json") || contentType.includes("text/json")) {
    const json = await res.json();
    return json;
  } else {
    // try parse text->json
    const txt = await res.text();
    try {
      return JSON.parse(txt);
    } catch (e) {
      const err = new Error("Upstream returned non-JSON response");
      err.raw = txt;
      throw err;
    }
  }
}

async function fetchAndRender(videoUrl) {
  clearResults();
  showStatus("Menghubungi server...", "info");
  gasBtn.disabled = true;
  gasBtn.textContent = "Proses...";

  try {
    const json = await fetchDownloadInfo(videoUrl);

    // If server returns wrapper { ok:true, result: {...} } (like server example earlier), normalize.
    let payload = json;
    if (json && json.ok && json.result) payload = json.result;

    // Try to map payload into UI model: { title, thumbnail, downloads: [{label, url, size}] }
    const model = { title: null, thumbnail: null, downloads: [] };

    // common mappings (adjust if your API differs)
    model.title = payload.title || payload.name || payload.desc || (payload.data && payload.data.title) || null;
    model.thumbnail = pickThumbnailFromResponse(payload);

    // If API already returns downloads array
    if (Array.isArray(payload.downloads) && payload.downloads.length) {
      model.downloads = payload.downloads.map(d => ({
        label: d.label || d.quality || d.name || "Video",
        url: d.url || d.link || d.src || d,
        size: d.size || d.filesize || ""
      }));
    }

    // Try common tikwm-like fields
    if (!model.downloads.length && payload.play) {
      model.downloads.push({ label: "Tanpa Watermark", url: payload.play, size: payload.size || "" });
    }
    if (!model.downloads.length && payload.wmplay) {
      model.downloads.push({ label: "Dengan Watermark", url: payload.wmplay, size: payload.size || "" });
    }

    // Exhaustive fallback: collect urls and pick likely video links
    if (!model.downloads.length) {
      const urls = Array.from(collectUrls(payload));
      // heuristics: prefer .mp4, play entries, or containing 'video' or 'play'
      const filtered = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /play/i.test(u) || /video/i.test(u));
      const uniq = Array.from(new Set(filtered.length ? filtered : urls));
      uniq.forEach((u, i) => {
        model.downloads.push({ label: `Detected ${i+1}`, url: u, size: "" });
      });
    }

    // If still empty, show raw
    if (!model.downloads.length) {
      console.warn("No downloads detected. raw payload:", payload);
      showStatus("Tidak menemukan link download di respons API. Cek console untuk raw data.", "error");
      console.log("RAW API RESPONSE:", payload);
      gasBtn.disabled = false;
      gasBtn.textContent = "Gas";
      return;
    }

    // Render UI
    resultList.innerHTML = "";

    // show title/thumbnail at top
    const header = document.createElement("div");
    header.className = "result-header";
    if (model.thumbnail) {
      const img = document.createElement("img");
      img.src = model.thumbnail;
      img.alt = model.title || "thumbnail";
      img.style.maxWidth = "100%";
      img.style.borderRadius = "12px";
      img.style.marginBottom = "10px";
      header.appendChild(img);
    }
    if (model.title) {
      const t = document.createElement("div");
      t.style.fontWeight = "700";
      t.style.marginBottom = "6px";
      t.textContent = model.title;
      header.appendChild(t);
    }
    resultList.appendChild(header);

    // list downloads
    model.downloads.forEach(d => {
      const row = makeDownloadRow(d, null); // we already show big thumb above; small thumbs optional
      resultList.appendChild(row);
    });

    resultBox.classList.remove("hidden");
    showStatus("Selesai — pilih kualitas dan klik Download.", "success");
  } catch (err) {
    console.error("fetch error:", err);
    let msg = err.message || "Gagal memanggil API";
    // Friendly hint if CORS likely
    if (msg.toLowerCase().includes("cors") || (err.raw && typeof err.raw === "string" && err.raw.toLowerCase().includes("cors"))) {
      msg = "Request diblokir (CORS). Jika kamu pakai GitHub Pages, panggil API lewat server/proxy yang menyediakan header CORS.";
    } else if (err.raw) {
      // show truncated raw content for debugging
      console.log("Upstream raw:", err.raw);
    }
    showStatus("Error: " + msg, "error");
  } finally {
    gasBtn.disabled = false;
    gasBtn.textContent = "Gas";
  }
}

/* ================== Events ================== */
gasBtn.addEventListener("click", () => {
  const url = (urlInput.value || "").trim();
  if (!url) {
    showStatus("Masukkan URL video dulu.", "error");
    return;
  }
  // basic URL validation
  try {
    new URL(url);
  } catch {
    showStatus("Format URL tidak valid.", "error");
    return;
  }
  fetchAndRender(url);
});

clearBtn.addEventListener("click", () => {
  urlInput.value = "";
  clearResults();
});

/* init */
hideStatus();
clearResults();

/* ============== NOTES FOR DEVELOPER ==============
- Ubah API_ENDPOINT ke backend yang kamu hosting (Render, Railway, Vercel, dll).
- Jangan simpan API keys di client-side. Jika API butuh key, letakkan di server.
- Jika API memerlukan POST dengan JSON, ubah fetchDownloadInfo() untuk POST dan kirim body.
- Jika kamu mau preview video player: setelah model.downloads[0] tersedia, set <video> element src to that url.
- Jika menggunakan tikwm langsung dari browser: kemungkinan besar akan muncul CORS error.
================================================= */
