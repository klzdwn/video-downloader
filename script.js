// script.js - frontend client untuk memanggil "public API" (konfigurable)
// ------------------------------------------------------
// CONFIGURATION
// ------------------------------------------------------
const API_BASE = "https://www.tikwm.com/api/?url=";
const API_KEY = "";
const USE_CORS_PROXY = false;
const CORS_PROXY = "https://www.tikwm.com/api/?url=";

// ------------------------------------------------------
// DOM elements
// ------------------------------------------------------
const urlInput = document.getElementById("urlInput");
const gasBtn = document.getElementById("gasBtn");
const clearBtn = document.getElementById("clearBtn");
let statusBox = document.getElementById("statusBox");
const resultBox = document.getElementById("resultBox");
const resultList = document.getElementById("resultList");

const playerBox = document.getElementById("playerBox");
const previewVideo = document.getElementById("previewVideo");
const thumbBox = document.getElementById("thumbBox");
const thumbImg = document.getElementById("thumbImg");

// ------------------------------------------------------
// UI helpers (ensure statusBox placement)
// ------------------------------------------------------
function _ensureStatusBox() {
  let box = document.getElementById("statusBox");
  if (box) return box;

  const anchor = document.querySelector(".button-row") || document.querySelector(".input-row") || null;
  box = document.createElement("div");
  box.id = "statusBox";
  box.dataset.type = "info";
  box.style.display = "none";
  box.style.marginTop = "12px";
  box.style.padding = "10px 12px";
  box.style.borderRadius = "8px";
  box.style.fontWeight = "600";
  box.style.maxWidth = "100%";
  box.style.boxSizing = "border-box";
  box.style.background = "rgba(30,60,90,0.9)";
  box.style.color = "#eaf2ff";
  box.style.textAlign = "center";
  box.style.zIndex = 4;

  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(box, anchor.nextSibling);
  } else if (resultBox && resultBox.parentNode) {
    resultBox.parentNode.insertBefore(box, resultBox);
  } else {
    document.body.appendChild(box);
  }
  return box;
}

function showStatus(msg, kind = "info") {
  let box = document.getElementById("statusBox") || _ensureStatusBox();
  if (!box) {
    try { alert(msg); } catch (e) {}
    return;
  }
  box.dataset.type = kind;
  box.textContent = msg;
  box.style.display = "block";

  if (kind === "error") {
    box.style.background = "rgba(180,40,60,0.95)";
    box.style.color = "#fff";
  } else if (kind === "success") {
    box.style.background = "rgba(30,120,60,0.95)";
    box.style.color = "#fff";
  } else {
    box.style.background = "rgba(30,60,90,0.95)";
    box.style.color = "#eaf2ff";
  }

  clearTimeout(box._hideTimeout);
  if (kind !== "info") {
    box._hideTimeout = setTimeout(() => { hideStatus(); }, 6000);
  }

  return box;
}

function hideStatus() {
  const box = document.getElementById("statusBox");
  if (!box) return;
  box.style.display = "none";
  box.textContent = "";
  box.dataset.type = "";
  if (box._hideTimeout) { clearTimeout(box._hideTimeout); box._hideTimeout = null; }
}

function clearResults() {
  if (resultList) resultList.innerHTML = "";
  if (resultBox) resultBox.classList.add("hidden");
  if (playerBox) playerBox.classList.add("hidden");
  if (thumbBox) thumbBox.classList.add("hidden");
  hideStatus();
}

// ------------------------------------------------------
// Utility: collect possible URLs from JSON
// ------------------------------------------------------
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

function pickThumbnail(json) {
  if (!json) return null;
  if (json.thumbnail) return json.thumbnail;
  if (json.cover) return json.cover;
  if (json.data && (json.data.cover || json.data.thumbnail)) return json.data.cover || json.data.thumbnail;

  const urls = Array.from(collectUrls(json));
  for (const u of urls) {
    if (/\.(jpe?g|png|webp|gif)(\?|$)/i.test(u)) return u;
  }
  return null;
}

// ------------------------------------------------------
// Build request & call API
// ------------------------------------------------------
async function callApi(videoUrl) {
  let endpoint = API_BASE + encodeURIComponent(videoUrl);
  if (USE_CORS_PROXY) endpoint = CORS_PROXY + endpoint;

  const headers = { Accept: "application/json" };
  if (API_KEY && API_KEY.length) headers["Authorization"] = API_KEY;

  const res = await fetch(endpoint, { method: "GET", headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`HTTP ${res.status}`);
    err.raw = text;
    throw err;
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json") || ct.includes("text/json")) {
    return res.json();
  } else {
    const txt = await res.text();
    try { return JSON.parse(txt); } catch (e) {
      const err = new Error("Upstream returned non-JSON response");
      err.raw = txt;
      throw err;
    }
  }
}

// ------------------------------------------------------
// Download utility: fetch -> blob -> save
// ------------------------------------------------------
async function downloadBlob(url, filename = "video.mp4") {
  try {
    showStatus("Mengunduh file...", "info");
    let fetchUrl = url;
    if (USE_CORS_PROXY) fetchUrl = CORS_PROXY + url;

    const res = await fetch(fetchUrl);
    if (!res.ok) throw new Error("Fetch failed: " + res.status);

    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);

    hideStatus();
  } catch (err) {
    console.error("Download error", err);
    let msg = err.message || "Gagal mendownload";
    if (String(msg).toLowerCase().includes("cors")) {
      msg = "Gagal mendownload — kemungkinan diblokir CORS. Gunakan server-proxy untuk mengatasi.";
    }
    showStatus("Error: " + msg, "error");
    throw err;
  }
}

// ------------------------------------------------------
// Render result
// ------------------------------------------------------
function renderResult(payload) {
  if (payload && payload.ok && payload.result) payload = payload.result;

  const title = payload.title || payload.name || payload.desc || (payload.data && payload.data.title) || "";
  const thumbnail = pickThumbnail(payload);

  const downloads = [];
  if (Array.isArray(payload.downloads) && payload.downloads.length) {
    payload.downloads.forEach(d => {
      downloads.push({
        label: d.label || d.quality || d.name || "Video",
        url: d.url || d.link || d.src || d,
        size: d.size || d.filesize || "",
        filename: d.filename || ""
      });
    });
  }

  if (!downloads.length) {
    if (payload.play) downloads.push({ label: "Tanpa Watermark", url: payload.play, size: payload.size || "" });
    if (payload.wmplay) downloads.push({ label: "Dengan Watermark", url: payload.wmplay, size: payload.size || "" });
    if (payload.video && payload.video.play_addr) downloads.push({ label: "Play", url: payload.video.play_addr });
  }

  if (!downloads.length) {
    const urls = Array.from(collectUrls(payload));
    const preferred = urls.filter(u => /\.mp4(\?|$)/i.test(u) || /\/play\/|\/video\//i.test(u) || /play/i.test(u));
    const uniq = Array.from(new Set(preferred.length ? preferred : urls));
    uniq.forEach((u, i) => downloads.push({ label: `Detected ${i+1}`, url: u, size: "" }));
  }

  const allUrls = Array.from(collectUrls(payload));
  const imageUrls = allUrls.filter(u => /\.(jpe?g|png|webp|gif)(\?|$)/i.test(u));
  const audioUrls = allUrls.filter(u => /\.(mp3|m4a|aac|ogg|wav)(\?|$)/i.test(u) || /audio/i.test(u));

  const audioUrl = audioUrls.length ? audioUrls[0] : null;
  const photoUrl = thumbnail || (imageUrls.length ? imageUrls[0] : null);

  if (resultList) resultList.innerHTML = "";

  let playableUrl = null;
  for (const d of downloads) {
    if (d.url && ( /\.mp4(\?|$)/i.test(d.url) || /\/play\/|\/video\//i.test(d.url) )) {
      playableUrl = d.url;
      break;
    }
  }
  if (!playableUrl && downloads.length) {
    const firstCandidate = downloads.find(d => typeof d.url === "string" && /^https?:\/\//i.test(d.url));
    if (firstCandidate) playableUrl = firstCandidate.url;
  }

  if (playableUrl && previewVideo && playerBox) {
    try { previewVideo.crossOrigin = "anonymous"; } catch (e) {}
    previewVideo.src = playableUrl;
    if (photoUrl) previewVideo.poster = photoUrl;
    previewVideo.load();
    playerBox.classList.remove("hidden");
    if (thumbBox) thumbBox.classList.add("hidden");
  } else {
    if (photoUrl) {
      if (thumbBox && thumbImg) {
        thumbImg.src = photoUrl;
        thumbBox.classList.remove("hidden");
      } else if (resultList) {
        const img = document.createElement("img");
        img.src = photoUrl;
        img.alt = title || "thumbnail";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "10px";
        resultList.appendChild(img);
      }
    }
    if (playerBox) playerBox.classList.add("hidden");
  }

  if (title && resultList) {
    const h = document.createElement("div");
    h.style.fontWeight = "700";
    h.style.margin = "8px 0";
    h.textContent = title;
    resultList.appendChild(h);
  }

  if (downloads.length > 1) downloads.splice(1);

  if (downloads.length && resultList) {
    const d = downloads[0];
    const node = document.createElement("div");
    node.className = "result-item";
    node.innerHTML = `
      <div style="display:flex;flex-direction:column;margin-bottom:8px;">
        <div style="font-weight:600">${d.label}</div>
        <div style="opacity:.75;font-size:13px">${d.size || ""}</div>
      </div>

      <div class="download-actions">
        <a href="${d.url}" class="btn-download download-btn" data-url="${d.url}"
           data-fn="${(d.filename || "video").replace(/"/g,'')}.mp4" download>
          Download Video
        </a>
      </div>
    `;
    resultList.appendChild(node);
  } else if (resultList) {
    const hint = document.createElement("div");
    hint.style.opacity = "0.85";
    hint.style.marginTop = "8px";
    hint.textContent = "Tidak ada link video yang terdeteksi.";
    resultList.appendChild(hint);
  }

  if ((photoUrl || audioUrl) && resultList) {
    const box = document.createElement("div");
    box.className = "result-item";
    box.style.display = "flex";
    box.style.justifyContent = "flex-start";
    box.style.gap = "12px";
    box.style.marginTop = "12px";
    box.style.alignItems = "center";

    if (photoUrl) {
      const aPhoto = document.createElement("button");
      aPhoto.className = "download-btn btn-download";
      aPhoto.dataset.url = photoUrl;
      aPhoto.dataset.fn = "photo.jpg";
      aPhoto.textContent = "Download Foto";
      box.appendChild(aPhoto);
    }

    if (audioUrl) {
      const aAudio = document.createElement("button");
      aAudio.className = "download-btn btn-download";
      aAudio.dataset.url = audioUrl;
      aAudio.dataset.fn = "audio.mp3";
      aAudio.textContent = "Download Audio";
      box.appendChild(aAudio);
    }

    resultList.appendChild(box);
  }

  if (resultBox) resultBox.classList.remove("hidden");
}

// ------------------------------------------------------
// Main flow
// ------------------------------------------------------
async function processUrl(videoUrl) {
  clearResults();
  showStatus("Loading...", "info");
  if (gasBtn) {
    gasBtn.disabled = true;
    gasBtn.textContent = "Proses...";
  }

  try {
    const json = await callApi(videoUrl);

    showStatus("Sukses menerima permintaan...", "success");
    renderResult(json);
    // small chance to trigger a flash for drama
    maybeTriggerLightning(0.18);
  } catch (err) {
    console.error("API error:", err);
    let msg = err.message || "Gagal";
    if ((err.raw && String(err.raw).toLowerCase().includes("cors")) || msg.toLowerCase().includes("cors")) {
      msg = "Request diblokir (CORS). Solusi: gunakan server-proxy atau aktifkan CORS proxy untuk testing.";
    } else if (err.raw) {
      console.log("Upstream raw:", err.raw);
    }
    showStatus("Error: " + msg, "error");
  } finally {
    if (gasBtn) {
      gasBtn.disabled = false;
      gasBtn.textContent = "Download";
    }
  }
}

// ------------------------------------------------------
// Event listeners
// ------------------------------------------------------
if (gasBtn) {
  gasBtn.addEventListener("click", () => {
    const u = (urlInput && urlInput.value || "").trim();
    if (!u) {
      showStatus("Masukkan URL video dulu!", "error");
      return;
    }
    try { new URL(u); } catch { showStatus("Format URL tidak valid.", "error"); return; }
    processUrl(u);
  });
}

if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    if (urlInput) urlInput.value = "";
    clearResults();
  });
}

if (resultList) {
  if (!window.__downloadHandlerInstalled) {
    window.__downloadHandlerInstalled = true;

    resultList.addEventListener("click", async (e) => {
      const btn = e.target.closest(".btn-download");
      if (!btn) return;
      e.preventDefault();

      if (!urlInput || !urlInput.value.trim()) {
        showStatus("Masukkan URL video dulu.", "error");
        return;
      }

      const url = btn.dataset.url || btn.getAttribute("href");
      const filename = (btn.dataset.fn || "video.mp4").replace(/"/g, "");
      if (!url) {
        showStatus("URL download tidak tersedia.", "error");
        return;
      }

      showStatus("Mengambil file untuk diunduh...", "info");
      try {
        const fetchUrl = (USE_CORS_PROXY && CORS_PROXY) ? (CORS_PROXY + url) : url;
        const res = await fetch(fetchUrl, { mode: "cors" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const blob = await res.blob();

        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(blobUrl);

        showStatus("Download dimulai.", "success");
        return;
      } catch (err) {
        console.warn("fetch->blob failed:", err);
        try {
          const a2 = document.createElement("a");
          a2.href = url;
          a2.download = filename;
          a2.target = "_blank";
          document.body.appendChild(a2);
          a2.click();
          a2.remove();
          showStatus("Mengambil gagal via fetch — membuka link di tab baru.", "info");
          return;
        } catch (e2) {
          console.error("anchor fallback failed:", e2);
          showStatus("Gagal memulai download. Coba buka link manual.", "error");
          return;
        }
      }
    });
  }
}

// init
clearResults();
hideStatus();

// direct download helper
async function forceDownloadVideo(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const blob = await res.blob();
    const blobUrl = window.URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = "video.mp4";
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(blobUrl);

    showStatus("Download dimulai.", "success");
  } catch(err) {
    console.error("forceDownloadVideo error:", err);
    let msg = err.message || "Gagal download video";
    if (String(msg).toLowerCase().includes("cors")) {
      msg = "Gagal download video — kemungkinan diblokir CORS.";
    }
    showStatus(msg, "error");
  }
}

/* ===========================================================
   LIGHTNING EFFECT (canvas + flash)
   - non-blocking, lightweight, configurable
   =========================================================== */
(function lightningModule(){
  const canvas = document.getElementById("lightningCanvas");
  const flash = document.querySelector(".bg-flash");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  let bolts = [];

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
  }
  window.addEventListener("resize", resize);
  resize();

  // bolt factory: generates branching lightning path
  function createBolt() {
    const startX = Math.random() * W;
    const startY = 0;
    const segments = [];
    const segCount = 14 + Math.floor(Math.random()*14);
    let x = startX, y = startY;
    for (let i=0;i<segCount;i++){
      const dx = (Math.random()-0.5) * 80;
      const dy = (H / segCount) * (0.9 + Math.random()*0.6);
      const nx = Math.max(0, Math.min(W, x + dx));
      const ny = Math.min(H, y + dy);
      segments.push({x1: x, y1: y, x2: nx, y2: ny});
      x = nx; y = ny;
      // occasionally create a fork
      if (Math.random() < 0.12) {
        const fork = {
          x1: x,
          y1: y,
          x2: Math.max(0, Math.min(W, x + (Math.random()-0.5)*160)),
          y2: Math.min(H, y + (H/segCount)*(0.6+Math.random()))
        };
        segments.push(fork);
      }
    }
    return {
      segments,
      life: 0,
      maxLife: 12 + Math.floor(Math.random()*12),
      alpha: 1,
      glow: 0.8 + Math.random()*0.8
    };
  }

  function drawBolt(bolt) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1 + Math.random()*2;
    ctx.shadowBlur = 12 * bolt.glow;
    ctx.shadowColor = "rgba(120,160,255,0.9)";
    ctx.strokeStyle = `rgba(200,230,255,${0.9 * (1 - bolt.life/bolt.maxLife)})`;

    ctx.beginPath();
    bolt.segments.forEach((s) => {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    });
    ctx.stroke();

    // brighter core
    ctx.lineWidth = 2;
    ctx.shadowBlur = 30 * bolt.glow;
    ctx.strokeStyle = `rgba(255,255,255,${0.6 * (1 - bolt.life/bolt.maxLife)})`;
    ctx.beginPath();
    bolt.segments.forEach((s) => {
      ctx.moveTo(s.x1, s.y1);
      ctx.lineTo(s.x2, s.y2);
    });
    ctx.stroke();

    ctx.restore();
  }

  // animate loop
  function tick() {
    // fade canvas a bit
    ctx.clearRect(0,0,W,H);
    // draw each bolt
    for (let i = bolts.length -1; i >= 0; i--) {
      const b = bolts[i];
      drawBolt(b);
      b.life++;
      if (b.life > b.maxLife) bolts.splice(i,1);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // flash effect
  function doFlash(intensity = 0.7, duration = 120) {
    if (!flash) return;
    flash.style.transition = `background ${duration}ms linear`;
    flash.style.background = `rgba(255,255,255,${intensity})`;
    setTimeout(()=> {
      flash.style.background = `rgba(255,255,255,0)`;
    }, duration);
  }

  // expose a function to trigger a bolt + flash
  window.triggerLightning = function(opts = {}) {
    const bolt = createBolt();
    if (opts.glow) bolt.glow = opts.glow;
    bolts.push(bolt);
    // flash intensity relative to bolt
    const intensity = Math.min(0.85, 0.25 + Math.random()*0.7);
    doFlash(intensity, opts.duration || 120);
  };

  // helper: maybe trigger (probability)
  window.maybeTriggerLightning = function(prob=0.12) {
    if (Math.random() < prob) {
      window.triggerLightning();
    }
  };

  // small ambient loop: sometimes trigger a bolt
  setInterval(()=> {
    if (Math.random() < 0.28) {
      window.triggerLightning({ glow: 0.9 + Math.random()*0.8, duration: 100 + Math.random()*180 });
    }
  }, 2500);

})();
