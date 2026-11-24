// =========================================================
// RWA ULTIMATE ASMANI SKY PRO OTT PLAYER ENGINE (player.js)
// Features: Multi-Worker HLS Failover, Lock-Screen Media Session,
// Playback Speed Auto-Memory, Auto-Resume, Double-Tap Seek,
// Hold 2x, Brightness/Volume Swipe, A-B Loop, Board Screenshot,
// Audio-Only, Sleep Timer, Screen Lock, Auto-Play Next & Split-Screen
// =========================================================

const HLS_STREAM_PROXIES = [
    "https://proplayer.allswbatch22.workers.dev/stream?url=",
    "https://test.src22420.workers.dev/?url="
];
const HLS_SEGMENT_PROXIES = [
    "https://proplayer.allswbatch22.workers.dev/proxy?url=",
    "https://test.src22420.workers.dev/?url="
];

let _activeProxyIdx = 0;

const v = document.getElementById("video");
const input = document.getElementById("url");
const bufferLoader = document.getElementById("bufferLoader");
const hlsScreen = document.getElementById("hlsScreen");
const playerControlsBar = document.getElementById("playerControlsBar");

let hls = null;
let cachedToken = "";
let resumeSeekTime = 0;

let _isScreenLocked = false;
let _isAudioOnly = false;
let _brightnessLevel = 1.0;
let _abLoop = { a: null, b: null };
let _sleepTimerId = null;
let _autoPlayTimerId = null;
let _lastProgressSaveTs = 0;
let _sessionWatchSec = 0;
let _lastWatchTickTs = 0;
let _normalSpeedBeforeHold = 1.0;
let _holdSpeedActive = false;
let _failoverAttempted = false;

function getStreamProxy() {
    return HLS_STREAM_PROXIES[_activeProxyIdx] || HLS_STREAM_PROXIES[0];
}
function getSegmentProxy() {
    return HLS_SEGMENT_PROXIES[_activeProxyIdx] || HLS_SEGMENT_PROXIES[0];
}

function showLoader(show) {
    if (!bufferLoader) return;
    bufferLoader.classList.toggle("hidden", !show);
}

function showGestureHud(text, autoHideMs = 1200) {
    const hud = document.getElementById("gestureHud");
    if (!hud) return;
    hud.textContent = text;
    hud.classList.remove("hidden");
    clearTimeout(hud._t);
    if (autoHideMs > 0) {
        hud._t = setTimeout(() => hud.classList.add("hidden"), autoHideMs);
    }
}

function valid(u) {
    try { return ["http:", "https:"].includes(new URL(u).protocol); }
    catch { return false; }
}

function unwrapOriginalUrl(u) {
    if (!u) return "";
    try {
        const parsed = new URL(u);
        if (parsed.hostname.includes("workers.dev") && parsed.searchParams.has("url")) {
            return decodeURIComponent(parsed.searchParams.get("url"));
        }
    } catch {}
    return u;
}

function manifest(u) {
    const rawUrl = unwrapOriginalUrl(u);
    try {
        const x = new URL(rawUrl);
        if (x.pathname.toLowerCase().includes(".m3u8") || x.hostname.includes("classx.co.in") || x.hostname.includes("akamai.net.in")) {
            return getStreamProxy() + encodeURIComponent(rawUrl);
        }
    } catch {}
    return rawUrl;
}

function segment(u) {
    return /\.(ts|m4s|mp4|aac|mp3|vtt|webvtt)(\?|$)/i.test(u.split("?")[0]);
}

class BackendLoader extends Hls.DefaultConfig.loader {
    load(ctx, cfg, cb) {
        let originalUrl = ctx.url;
        let mainUrl = input ? unwrapOriginalUrl(input.value.trim()) : "";

        let match = mainUrl.match(/(edge-cache-token=[^&]+)/);
        if (match) cachedToken = match[1];

        if (originalUrl.includes("workers.dev")) {
            ctx.url = originalUrl;
            super.load(ctx, cfg, cb);
            return;
        }

        if (cachedToken && !originalUrl.includes("edge-cache-token=")) {
            originalUrl += (originalUrl.includes("?") ? "&" : "?") + cachedToken;
        }

        if (originalUrl.includes(".m3u8")) {
            ctx.url = getStreamProxy() + encodeURIComponent(originalUrl);
        } else if (segment(originalUrl)) {
            ctx.url = getSegmentProxy() + encodeURIComponent(originalUrl);
        } else {
            ctx.url = originalUrl;
        }

        super.load(ctx, cfg, cb);
    }
}

// =========================================================
// LOCK-SCREEN MEDIA CONTROLS (MEDIA SESSION API)
// =========================================================
function setupLockScreenMediaSession() {
    if (!("mediaSession" in navigator)) return;
    try {
        const info = (typeof state !== "undefined" && state.activeKey && state.mediaMap) ? state.mediaMap[state.activeKey] : null;
        const title = (info && info.title) || "RWA Sky Pro Class";
        const artist = (typeof state !== "undefined" && state.courseName) ? state.courseName : "RWA Sky Pro Portal";
        const thumb = (info && info.thumb) ? info.thumb : "https://placehold.co/512x512/0284c7/ffffff.png?text=RWA";

        navigator.mediaSession.metadata = new MediaMetadata({
            title,
            artist,
            album: "RWA Sky Pro",
            artwork: [{ src: thumb, sizes: "512x512", type: "image/png" }]
        });

        navigator.mediaSession.setActionHandler("play", () => { v && v.play().catch(() => {}); });
        navigator.mediaSession.setActionHandler("pause", () => { v && v.pause(); });
        navigator.mediaSession.setActionHandler("seekbackward", () => { if (v) v.currentTime = Math.max(0, v.currentTime - 10); });
        navigator.mediaSession.setActionHandler("seekforward", () => { if (v) v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10); });
        navigator.mediaSession.setActionHandler("nexttrack", () => { playNextClassNow(); });
    } catch {}
}

// =========================================================
// PLAYBACK SPEED AUTO-MEMORY
// =========================================================
function getSavedPlaybackRate() {
    const saved = (window.PRO_STORE && PRO_STORE.preferences && Number(PRO_STORE.preferences.playbackRate))
        || Number(localStorage.getItem("rwa_saved_playback_rate") || 1);
    return (saved >= 0.5 && saved <= 2.5) ? saved : 1.0;
}

function applySavedPlaybackRate() {
    const rate = getSavedPlaybackRate();
    if (v) v.playbackRate = rate;
    document.querySelectorAll(".spd-option").forEach(o => {
        const val = parseFloat(o.dataset.spd || o.textContent);
        o.classList.toggle("active", Math.abs(val - rate) < 0.01);
    });
}

function flushWatchSessionMinutes() {
    if (_sessionWatchSec >= 15) {
        const mins = _sessionWatchSec / 60;
        if (typeof addStudyMinutes === "function") addStudyMinutes(mins);
        if (typeof logUserActivity === "function" && typeof state !== "undefined" && state.activeKey) {
            const info = state.mediaMap[state.activeKey];
            logUserActivity("WATCH_VIDEO", info ? info.title : "Class Video", {
                watch_seconds: Math.round(_sessionWatchSec)
            });
        }
        _sessionWatchSec = 0;
    }
}

function resetAbLoop() {
    _abLoop = { a: null, b: null };
    const badge = document.getElementById("abLoopBadge");
    const btn = document.getElementById("abLoopBtn");
    if (badge) badge.classList.add("hidden");
    if (btn) btn.classList.remove("active-loop");
}

function stopPlayer() {
    flushWatchSessionMinutes();
    cancelAutoPlayNext();
    resetAbLoop();

    if (hls) {
        try { hls.destroy(); } catch {}
        hls = null;
    }
    if (v) {
        v.pause();
        v.removeAttribute("src");
        v.load();
    }
    const ytFrame = document.getElementById("ytFrame");
    if (ytFrame) ytFrame.src = "";
    showLoader(false);
}

window.closePlayerBox = function() {
    if (typeof state !== "undefined" && state.activeKey && state.mediaMap[state.activeKey] && v && Number.isFinite(v.duration)) {
        if (typeof recordWatchProgress === "function") {
            recordWatchProgress(state.mediaMap[state.activeKey], v.currentTime, v.duration);
        }
    }
    stopPlayer();
    togglePlayerScreenLock(false);
    document.body.classList.remove("zen-mode");
    const zenBtn = document.getElementById("zenModeBtn");
    if (zenBtn) zenBtn.textContent = "🧘 Zen";
    const menu = document.getElementById("settingsMenu");
    if (menu) menu.classList.remove("show");
    if (typeof closeInlinePdfAndReset === "function") closeInlinePdfAndReset();
    if (typeof showSlide === "function") showSlide("slideExplorer");
};

function applyAutoResumeIfAvailable() {
    if (resumeSeekTime > 0) {
        v.currentTime = resumeSeekTime;
        resumeSeekTime = 0;
        return;
    }
    if (typeof state !== "undefined" && state.activeKey && typeof getWatchProgress === "function") {
        const saved = getWatchProgress(state.activeKey);
        if (saved && saved.time > 5 && saved.pct < 96 && Number.isFinite(v.duration) && saved.time < v.duration - 5) {
            v.currentTime = saved.time;
            showGestureHud(`▶ Resumed from ${fmt(saved.time)}`, 1800);
        }
    }
}

function start(isFailoverRetry = false) {
    let raw = input ? input.value.trim() : "";
    if (!raw) return;

    if (!isFailoverRetry) {
        _activeProxyIdx = 0;
        _failoverAttempted = false;
    }

    stopPlayer();
    showLoader(true);

    const cleanRaw = unwrapOriginalUrl(raw);
    const isYT = (!cleanRaw.startsWith("http") && cleanRaw.length >= 10 && cleanRaw.length <= 15) || cleanRaw.includes("youtube.com") || cleanRaw.includes("youtu.be");

    if (isYT) {
        showLoader(false);
        document.getElementById("hlsScreen").classList.add("hidden");
        document.getElementById("ytScreen").classList.remove("hidden");

        let ytId = cleanRaw;
        if (cleanRaw.includes("v=")) ytId = cleanRaw.split("v=")[1].split("&")[0];
        else if (cleanRaw.includes("youtu.be/")) ytId = cleanRaw.split("youtu.be/")[1].split("?")[0];

        const ytFrame = document.getElementById("ytFrame");
        if (ytFrame) ytFrame.src = `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0`;
        return;
    }

    document.getElementById("ytScreen").classList.add("hidden");
    document.getElementById("hlsScreen").classList.remove("hidden");

    if (!valid(cleanRaw)) { showLoader(false); return; }

    let tokMatch = cleanRaw.match(/(edge-cache-token=[^&]+)/);
    if (tokMatch) cachedToken = tokMatch[1];

    if (cleanRaw.includes(".mp4") && !cleanRaw.includes(".m3u8")) {
        v.src = cleanRaw;
        populateQualitySettings([]);
        v.onloadedmetadata = () => {
            showLoader(false);
            applyAutoResumeIfAvailable();
            applySavedPlaybackRate();
            setupLockScreenMediaSession();
            if (typeof state !== "undefined") renderSeekbarNoteMarkers(state.activeKey);
            v.play().catch(() => {});
        };
        return;
    }

    let src = manifest(cleanRaw);

    if (Hls.isSupported()) {
        hls = new Hls({
            enableWorker: true,
            lowLatencyMode: false,
            backBufferLength: 30,
            maxBufferLength: 25,
            loader: BackendLoader
        });

        hls.on(Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(src));

        hls.on(Hls.Events.MANIFEST_PARSED, (_, data) => {
            showLoader(false);
            populateQualitySettings(data.levels || []);
            v.onloadedmetadata = () => {
                applyAutoResumeIfAvailable();
                applySavedPlaybackRate();
                setupLockScreenMediaSession();
                if (typeof state !== "undefined") renderSeekbarNoteMarkers(state.activeKey);
            };
            applySavedPlaybackRate();
            setupLockScreenMediaSession();
            v.play().catch(() => {});
        });

        hls.on(Hls.Events.ERROR, (_, d) => {
            if (d.fatal) {
                if (d.type === Hls.ErrorTypes.MEDIA_ERROR) {
                    try { hls.recoverMediaError(); } catch {}
                } else if (d.type === Hls.ErrorTypes.NETWORK_ERROR && !_failoverAttempted && HLS_STREAM_PROXIES.length > 1) {
                    // Multi-Worker Auto-Failover
                    _failoverAttempted = true;
                    _activeProxyIdx = (_activeProxyIdx + 1) % HLS_STREAM_PROXIES.length;
                    resumeSeekTime = v ? v.currentTime : 0;
                    showGestureHud("🔄 Switching to Backup Stream Worker...", 1800);
                    start(true);
                } else {
                    showLoader(false);
                    if (typeof logPortalError === "function") logPortalError("HLSPlayer", `Fatal ${d.type}: ${d.details}`);
                    if (typeof proToast === "function") proToast("⚠️ Stream weak hai, quality switch karke try karein.", "warning");
                }
            }
        });

        hls.attachMedia(v);
    } else if (v.canPlayType("application/vnd.apple.mpegurl")) {
        v.src = src;
        v.onloadedmetadata = () => {
            showLoader(false);
            applyAutoResumeIfAvailable();
            applySavedPlaybackRate();
            setupLockScreenMediaSession();
            if (typeof state !== "undefined") renderSeekbarNoteMarkers(state.activeKey);
            v.play().catch(() => {});
        };
    }
}

// =========================================================
// PRO FEATURES: A-B LOOP, SCREENSHOT, AUDIO-ONLY, SLEEP, LOCK, SPLIT
// =========================================================
window.cycleAbLoop = function() {
    if (!v || !Number.isFinite(v.duration)) return;
    const badge = document.getElementById("abLoopBadge");
    const btn = document.getElementById("abLoopBtn");

    if (_abLoop.a === null) {
        _abLoop.a = v.currentTime;
        if (badge) { badge.textContent = `🔁 Point A Set: ${fmt(_abLoop.a)} (Click again for B)`; badge.classList.remove("hidden"); }
        if (btn) btn.classList.add("active-loop");
        showGestureHud(`🔁 Loop Point A: ${fmt(_abLoop.a)}`);
    } else if (_abLoop.b === null) {
        if (v.currentTime <= _abLoop.a + 1) { if (typeof proToast === "function") proToast("Point B, Point A ke baad hona chahiye.", "warning"); return; }
        _abLoop.b = v.currentTime;
        if (badge) badge.textContent = `🔁 Looping: ${fmt(_abLoop.a)} ➔ ${fmt(_abLoop.b)}`;
        v.currentTime = _abLoop.a;
        showGestureHud(`🔁 Loop Active (${fmt(_abLoop.a)} - ${fmt(_abLoop.b)})`, 1600);
    } else {
        resetAbLoop();
        showGestureHud("🔁 A-B Loop Cleared");
    }
};

window.captureBoardScreenshot = function() {
    if (!v || !v.videoWidth) { if (typeof proToast === "function") proToast("Video load hone ke baad screenshot lein.", "warning"); return; }
    try {
        const canvas = document.createElement("canvas");
        canvas.width = v.videoWidth; canvas.height = v.videoHeight;
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        const a = document.createElement("a");
        a.href = canvas.toDataURL("image/png");
        a.download = `RWA_Board_${fmt(v.currentTime).replace(/:/g, "-")}.png`;
        document.body.appendChild(a); a.click(); a.remove();
        showGestureHud("📸 Board Screenshot Saved!", 1400);
        if (typeof proToast === "function") proToast("📸 Clean HD Board Screenshot Saved!", "success");
    } catch {
        if (typeof proToast === "function") proToast("Is stream par direct screenshot CORS-protected hai.", "warning");
    }
};

window.toggleAudioOnlyMode = function() {
    _isAudioOnly = !_isAudioOnly;
    document.getElementById("audioOnlyBanner")?.classList.toggle("hidden", !_isAudioOnly);
    setupLockScreenMediaSession();
    showGestureHud(_isAudioOnly ? "🎧 Audio-Only Mode ON" : "🎬 Video Mode ON");
};

window.setPlayerSleepTimer = function(minsStr) {
    if (_sleepTimerId) clearTimeout(_sleepTimerId);
    const mins = parseInt(minsStr || "0", 10);
    if (mins <= 0) { if (typeof proToast === "function") proToast("🌙 Sleep Timer OFF", "info"); return; }
    _sleepTimerId = setTimeout(() => {
        if (v && !v.paused) v.pause();
        if (typeof proToast === "function") proToast(`🌙 ${mins}m Sleep Timer complete — Video paused.`, "info");
    }, mins * 60 * 1000);
    if (typeof proToast === "function") proToast(`🌙 Sleep Timer set for ${mins} mins`, "success");
};

window.togglePlayerScreenLock = function(lock) {
    _isScreenLocked = Boolean(lock);
    document.getElementById("screenUnlockOverlay")?.classList.toggle("hidden", !_isScreenLocked);
    if (playerControlsBar) playerControlsBar.classList.toggle("hidden-controls", _isScreenLocked);
    showGestureHud(_isScreenLocked ? "🔒 Screen Locked" : "🔓 Screen Unlocked");
};

window.toggleSplitScreenMode = function() {
    const wrap = document.getElementById("playerSplitContainer"), pdfBox = document.getElementById("inlinePdfBox");
    if (!wrap) return;
    const active = wrap.classList.toggle("split-active");
    if (active && pdfBox && pdfBox.classList.contains("hidden") && typeof openActivePlayerPdf === "function") openActivePlayerPdf(1);
    if (typeof proToast === "function") proToast(active ? "🗔 Split-Screen Mode ON" : "📺 Normal Full-Width Video", "info");
};

window.seekToTimestamp = function(sec) {
    if (!v || !Number.isFinite(sec)) return;
    v.currentTime = Math.max(0, sec);
    v.play().catch(() => {});
    showGestureHud(`⏩ Jumped to ${fmt(sec)}`);
};

window.renderSeekbarNoteMarkers = function(key) {
    const cont = document.getElementById("seekNotesMarkers");
    if (!cont || !v || !Number.isFinite(v.duration) || v.duration <= 0) return;
    const notes = (window.PRO_STORE && PRO_STORE.video_notes && PRO_STORE.video_notes[key]) || [];
    cont.innerHTML = notes.map(n => {
        const pct = Math.min(99, Math.max(1, (n.time / v.duration) * 100));
        return `<span class="note-dot-marker" style="left:${pct}%;" title="${escHtml(n.text)}"></span>`;
    }).join("");
};

function triggerAutoPlayNextCountdown() {
    const toggle = document.getElementById("autoPlayNextToggle");
    if (toggle && !toggle.checked) return;
    if (typeof state === "undefined" || !state.currentLectureKeys) return;
    const idx = state.currentLectureKeys.indexOf(state.activeKey);
    if (idx < 0 || idx >= state.currentLectureKeys.length - 1) return;

    const nextKey = state.currentLectureKeys[idx + 1], nextInfo = state.mediaMap[nextKey];
    if (!nextInfo) return;

    const ov = document.getElementById("autoPlayOverlay"), cntEl = document.getElementById("autoPlayCountdown"), titleEl = document.getElementById("autoPlayNextTitle");
    if (!ov) return;
    ov.dataset.nextKey = nextKey;
    if (titleEl) titleEl.textContent = nextInfo.title;
    ov.classList.remove("hidden");

    let left = 5;
    if (cntEl) cntEl.textContent = left;
    cancelAutoPlayNext(false);
    _autoPlayTimerId = setInterval(() => {
        left--;
        if (cntEl) cntEl.textContent = left;
        if (left <= 0) playNextClassNow();
    }, 1000);
}

window.playNextClassNow = function() {
    const ov = document.getElementById("autoPlayOverlay");
    let nextKey = ov ? ov.dataset.nextKey : "";
    if (!nextKey && typeof state !== "undefined" && state.currentLectureKeys) {
        const idx = state.currentLectureKeys.indexOf(state.activeKey);
        if (idx >= 0 && idx < state.currentLectureKeys.length - 1) nextKey = state.currentLectureKeys[idx + 1];
    }
    cancelAutoPlayNext(true);
    if (nextKey && typeof playClassInRwaPlayer === "function") playClassInRwaPlayer(nextKey);
};

window.cancelAutoPlayNext = function(hide = true) {
    if (_autoPlayTimerId) { clearInterval(_autoPlayTimerId); _autoPlayTimerId = null; }
    if (hide) document.getElementById("autoPlayOverlay")?.classList.add("hidden");
};

// =========================================================
// YOUTUBE / MX-STYLE GESTURES
// =========================================================
(function initProPlayerGestures() {
    if (!hlsScreen) return;
    let lastTapTime = 0, singleTapTimer = null, holdTimer = null;
    let touchStartX = 0, touchStartY = 0, touchStartVol = 1, touchStartBright = 1, swipeMode = null;

    function triggerRipple(side) {
        const el = document.getElementById(side === "left" ? "rippleLeft" : "rippleRight");
        if (!el) return;
        el.classList.remove("hidden");
        clearTimeout(el._t);
        el._t = setTimeout(() => el.classList.add("hidden"), 550);
    }
    function startHold2x() {
        if (_isScreenLocked || !v || v.paused) return;
        _normalSpeedBeforeHold = v.playbackRate || 1.0;
        v.playbackRate = 2.0;
        _holdSpeedActive = true;
        showGestureHud("⚡ 2.0x Speed Holding...", 0);
    }
    function endHold2x() {
        if (!_holdSpeedActive) return;
        _holdSpeedActive = false;
        if (v) v.playbackRate = _normalSpeedBeforeHold;
        document.getElementById("gestureHud")?.classList.add("hidden");
    }

    hlsScreen.addEventListener("touchstart", (e) => {
        if (_isScreenLocked || e.target.closest("button") || e.target.closest("input") || e.target.closest("#settingsMenu")) return;
        const t = e.touches[0];
        touchStartX = t.clientX; touchStartY = t.clientY;
        touchStartVol = v.volume; touchStartBright = _brightnessLevel;
        swipeMode = null;
        holdTimer = setTimeout(startHold2x, 480);
    }, { passive: true });

    hlsScreen.addEventListener("touchmove", (e) => {
        if (_isScreenLocked || !e.touches[0]) return;
        const dx = e.touches[0].clientX - touchStartX, dy = touchStartY - e.touches[0].clientY;
        if (Math.abs(dy) > 16 && Math.abs(dy) > Math.abs(dx)) {
            clearTimeout(holdTimer);
            const rect = hlsScreen.getBoundingClientRect();
            const isLeft = (touchStartX - rect.left) < rect.width / 2;
            const delta = dy / (rect.height * 0.75);
            if (isLeft) {
                swipeMode = "brightness";
                _brightnessLevel = Math.min(1.6, Math.max(0.35, touchStartBright + delta));
                v.style.filter = `brightness(${_brightnessLevel.toFixed(2)})`;
                showGestureHud(`☀️ Brightness ${Math.round(_brightnessLevel * 100)}%`, 900);
            } else {
                swipeMode = "volume";
                v.volume = Math.min(1, Math.max(0, touchStartVol + delta));
                v.muted = v.volume === 0;
                showGestureHud(`🔊 Volume ${Math.round(v.volume * 100)}%`, 900);
            }
        }
    }, { passive: true });

    hlsScreen.addEventListener("touchend", () => { clearTimeout(holdTimer); endHold2x(); });
    hlsScreen.addEventListener("mousedown", (e) => {
        if (_isScreenLocked || e.target.closest("button") || e.target.closest("input") || e.target.closest("#settingsMenu")) return;
        holdTimer = setTimeout(startHold2x, 500);
    });
    window.addEventListener("mouseup", () => { clearTimeout(holdTimer); endHold2x(); });

    hlsScreen.addEventListener("click", (e) => {
        if (_isScreenLocked || e.target.closest("button") || e.target.closest("input") || e.target.closest("#settingsMenu")) return;
        if (swipeMode) { swipeMode = null; return; }
        const now = Date.now(), rect = hlsScreen.getBoundingClientRect(), relX = (e.clientX - rect.left) / rect.width;
        if (now - lastTapTime < 280) {
            clearTimeout(singleTapTimer); lastTapTime = 0;
            if (relX < 0.4) { v.currentTime = Math.max(0, v.currentTime - 10); triggerRipple("left"); }
            else if (relX > 0.6) { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10); triggerRipple("right"); }
            else v.paused ? v.play() : v.pause();
            return;
        }
        lastTapTime = now;
        singleTapTimer = setTimeout(() => {
            if (playerControlsBar) playerControlsBar.classList.toggle("hidden-controls");
            document.getElementById("settingsMenu")?.classList.remove("show");
        }, 280);
    });
})();

document.addEventListener("keydown", (e) => {
    if (typeof state === "undefined" || state.currentSlide !== "slidePlayer") return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.code === "Space") { e.preventDefault(); v.paused ? v.play() : v.pause(); }
    else if (e.code === "ArrowLeft") { v.currentTime = Math.max(0, v.currentTime - 10); showGestureHud("⏪ -10s"); }
    else if (e.code === "ArrowRight") { v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10); showGestureHud("⏩ +10s"); }
    else if (e.key.toLowerCase() === "m") { v.muted = !v.muted; showGestureHud(v.muted ? "🔇 Muted" : "🔊 Unmuted"); }
    else if (e.key.toLowerCase() === "f") { document.getElementById("fs")?.click(); }
});

// =========================================================
// QUALITY, SPEED AUTO-MEMORY, DOWNLOAD & CORE CONTROLS
// =========================================================
function populateQualitySettings(hlsLevels) {
    const qList = document.getElementById("qualityList");
    if (!qList) return;
    const activeInfo = (typeof state !== "undefined" && state.activeKey && state.mediaMap) ? state.mediaMap[state.activeKey] : null;
    const serverQualsObj = (activeInfo && activeInfo.qualities) ? activeInfo.qualities : {};
    const serverKeys = Object.keys(serverQualsObj);

    let html = "";
    if (serverKeys.length > 0) {
        const currentRaw = unwrapOriginalUrl(input.value);
        serverKeys.forEach((qKey, idx) => {
            const targetRaw = unwrapOriginalUrl(serverQualsObj[qKey]);
            const isAct = (currentRaw && targetRaw && currentRaw === targetRaw) || (!currentRaw && idx === 0);
            html += `<div class="q-option ${isAct ? "active" : ""}" onclick="switchServerQuality('${qKey.replace(/'/g, "")}', this)">${qKey}</div>`;
        });
    } else if (hlsLevels && hlsLevels.length > 1) {
        html += `<div class="q-option active" onclick="changeHlsLevel(-1, this)">Auto</div>`;
        const seenHeights = new Set();
        hlsLevels.forEach((lvl, idx) => {
            let label = lvl.height ? `${lvl.height}p` : `${idx + 1}p`;
            if (!seenHeights.has(label)) { seenHeights.add(label); html += `<div class="q-option" onclick="changeHlsLevel(${idx}, this)">${label}</div>`; }
        });
    } else {
        html = `<div class="q-option active" onclick="toggleSettingsMenu()">720p HD</div>`;
    }
    qList.innerHTML = html;
}

window.changeHlsLevel = function(idx, el) {
    if (hls) hls.currentLevel = idx;
    document.querySelectorAll("#qualityList .q-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
};

window.switchServerQuality = function(qKey, el) {
    resumeSeekTime = v ? v.currentTime : 0;
    document.querySelectorAll("#qualityList .q-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
    if (typeof changeLectureQuality === "function") changeLectureQuality(qKey, resumeSeekTime);
};

window.changeSpd = function(rate, el) {
    if (v) v.playbackRate = rate;
    localStorage.setItem("rwa_saved_playback_rate", String(rate));
    if (window.PRO_STORE && PRO_STORE.preferences) {
        PRO_STORE.preferences.playbackRate = rate;
        if (typeof saveProStoreLocal === "function") saveProStoreLocal(false);
    }
    document.querySelectorAll(".spd-option").forEach(o => o.classList.remove("active"));
    if (el) el.classList.add("active");
    toggleSettingsMenu();
    showGestureHud(`⚡ Speed ${rate}x (Saved)`);
};

window.toggleSettingsMenu = function() { document.getElementById("settingsMenu")?.classList.toggle("show"); };

async function downloadMerged() {
    const raw = input ? unwrapOriginalUrl(input.value.trim()) : "";
    if (!valid(raw) || !hls || !hls.levels || hls.levels.length === 0) {
        if (typeof proToast === "function") proToast("Video play hone ke baad download click karein.", "warning");
        return;
    }

    const box = document.getElementById("downloadBox"), text = document.getElementById("downloadText"), bar = document.getElementById("bar");
    if (box) box.classList.add("show");
    if (bar) bar.style.width = "2%";
    if (text) text.textContent = "Preparing video segments...";

    try {
        let levelIndex = hls.currentLevel >= 0 ? hls.currentLevel : 0;
        let fragments = hls.levels[levelIndex].details.fragments;
        let downloadedBuffers = [], total = fragments.length;
        let match = raw.match(/(edge-cache-token=[^&]+)/), tokenStr = match ? match[1] : cachedToken;

        if (fragments[0] && fragments[0].initSegment) {
            let initUrl = fragments[0].initSegment.url;
            if (!initUrl.includes("workers.dev")) {
                if (tokenStr && !initUrl.includes("edge-cache-token=")) initUrl += (initUrl.includes("?") ? "&" : "?") + tokenStr;
                initUrl = getSegmentProxy() + encodeURIComponent(initUrl);
            }
            let res = await fetch(initUrl);
            if (res.ok) downloadedBuffers.push(await res.arrayBuffer());
        }

        for (let i = 0; i < total; i++) {
            if (text) text.textContent = `Downloading: ${i + 1} / ${total} (${Math.round(((i + 1) / total) * 100)}%)`;
            let segUrl = fragments[i].url;
            if (!segUrl.includes("workers.dev")) {
                if (tokenStr && !segUrl.includes("edge-cache-token=")) segUrl += (segUrl.includes("?") ? "&" : "?") + tokenStr;
                segUrl = getSegmentProxy() + encodeURIComponent(segUrl);
            }
            let segRes = await fetch(segUrl);
            if (!segRes.ok) throw new Error(`Segment ${i + 1} Error`);
            downloadedBuffers.push(await segRes.arrayBuffer());
            if (bar) bar.style.width = Math.round(((i + 1) / total) * 100) + "%";
        }

        if (text) text.textContent = "Merging MP4 file...";
        const blob = new Blob(downloadedBuffers, { type: "video/mp4" });
        const finalUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = finalUrl; a.download = `RWA_Class_${Math.floor(Math.random() * 10000)}.mp4`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(finalUrl), 60000);
        if (text) text.textContent = "✅ Download Complete!";
        if (typeof logUserActivity === "function") logUserActivity("DOWNLOAD_VIDEO", "Downloaded merged MP4");
        setTimeout(() => { if (box) box.classList.remove("show"); }, 4000);
    } catch (e) {
        if (text) text.textContent = "⚠️ Download error: " + e.message;
    }
}

function fmt(x) {
    if (!Number.isFinite(x)) return "00:00";
    x = Math.floor(x);
    let h = Math.floor(x / 3600), m = Math.floor((x % 3600) / 60), s = x % 60;
    return h
        ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
        : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const toggleBtn = document.getElementById("toggle");
if (toggleBtn) toggleBtn.onclick = () => v.paused ? v.play() : v.pause();

v.onplay = () => {
    if (toggleBtn) toggleBtn.textContent = "⏸";
    showLoader(false);
    _lastWatchTickTs = Date.now();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "playing";
};
v.onpause = () => {
    if (toggleBtn) toggleBtn.textContent = "▶";
    flushWatchSessionMinutes();
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = "paused";
    if (typeof state !== "undefined" && state.activeKey && state.mediaMap[state.activeKey] && Number.isFinite(v.duration)) {
        if (typeof recordWatchProgress === "function") recordWatchProgress(state.mediaMap[state.activeKey], v.currentTime, v.duration);
    }
};
v.onended = () => {
    flushWatchSessionMinutes();
    if (typeof state !== "undefined" && state.activeKey && state.mediaMap[state.activeKey] && Number.isFinite(v.duration)) {
        if (typeof recordWatchProgress === "function") recordWatchProgress(state.mediaMap[state.activeKey], v.duration, v.duration);
    }
    triggerAutoPlayNextCountdown();
};
v.onwaiting = () => showLoader(true);
v.onplaying = () => showLoader(false);
v.oncanplay = () => showLoader(false);

document.getElementById("back")?.addEventListener("click", () => v.currentTime = Math.max(0, v.currentTime - 10));
document.getElementById("next")?.addEventListener("click", () => v.currentTime = Math.min(v.duration || Infinity, v.currentTime + 10));
const muteBtn = document.getElementById("mute");
if (muteBtn) muteBtn.onclick = () => { v.muted = !v.muted; muteBtn.textContent = v.muted ? "🔇" : "🔊"; };
document.getElementById("download")?.addEventListener("click", downloadMerged);
document.getElementById("pip")?.addEventListener("click", async () => {
    try {
        if (document.pictureInPictureElement) await document.exitPictureInPicture();
        else if (v.requestPictureInPicture) await v.requestPictureInPicture();
    } catch {}
});

const fsBtn = document.getElementById("fs"), headerBar = document.getElementById("playerHeaderBar");
if (fsBtn && hlsScreen) {
    fsBtn.onclick = async () => {
        try {
            if (!document.fullscreenElement) await hlsScreen.requestFullscreen();
            else await document.exitFullscreen();
        } catch {}
    };
}
document.addEventListener("fullscreenchange", () => {
    if (document.fullscreenElement) { if (headerBar) headerBar.classList.add("hidden"); if (fsBtn) fsBtn.textContent = "🗗"; }
    else { if (headerBar) headerBar.classList.remove("hidden"); if (fsBtn) fsBtn.textContent = "⛶"; }
});

v.ontimeupdate = () => {
    let d = v.duration;
    const seekEl = document.getElementById("seek"), timeEl = document.getElementById("time"), notePill = document.getElementById("noteCurrentTimePill");
    if (Number.isFinite(d) && d > 0 && seekEl) seekEl.value = (v.currentTime / d) * 1000;
    if (timeEl) timeEl.textContent = fmt(v.currentTime) + " / " + fmt(d);
    if (notePill) notePill.textContent = "⏱️ " + fmt(v.currentTime);

    if (_abLoop.a !== null && _abLoop.b !== null && v.currentTime >= _abLoop.b) v.currentTime = _abLoop.a;

    const now = Date.now();
    if (!v.paused && _lastWatchTickTs > 0) {
        const deltaSec = (now - _lastWatchTickTs) / 1000;
        if (deltaSec > 0 && deltaSec < 5) _sessionWatchSec += deltaSec;
    }
    _lastWatchTickTs = now;

    if (now - _lastProgressSaveTs > 6000 && Number.isFinite(d) && d > 0) {
        _lastProgressSaveTs = now;
        if (typeof state !== "undefined" && state.activeKey && state.mediaMap[state.activeKey]) {
            if (typeof recordWatchProgress === "function") recordWatchProgress(state.mediaMap[state.activeKey], v.currentTime, d);
        }
    }
};

const seekEl = document.getElementById("seek");
if (seekEl) seekEl.oninput = (e) => { if (Number.isFinite(v.duration)) v.currentTime = (e.target.value / 1000) * v.duration; };
