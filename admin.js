// =========================================================
// RWA ULTRA-PRO COMMAND CENTER ENGINE (admin.js)
// Secured via rwa-security.js (HMAC-SHA256 + E2E AES-256)
// Unlimited User & Content Vault DBs + Website-Mirror Explorer +
// Direct Summary + Q-Bank Preview + RAM Cache Flush
// =========================================================

const ADMIN_API_BASE = "https://pdfsownlaoder.onrender.com";
const AUTO_REFRESH_SECONDS = 300; // 5 minutes

let adminState = {
    token: sessionStorage.getItem("rwa_admin_sess_token") || "",
    activeTab: "overview",
    userPage: 1,
    userFilter: "all",
    currentDossier: null,
    activeDossierTab: "info",
    cachedSettings: null,
    refreshLeft: AUTO_REFRESH_SECONDS,
    refreshTimerId: null,
    // Cloud Content Vault Website-Mirror Navigation State
    vaultView: "series", // "series" | "folders" | "tests"
    vaultSeriesId: "",
    vaultSeriesTitle: "",
    vaultFolderId: "-1",
    vaultFolderTitle: "",
    vaultSeriesCache: [],
    vaultFoldersCache: [],
    vaultTestsCache: [],
    vaultPreviewDoc: null
};

// =========================================================
// HELPERS & SECURED ADMIN API WRAPPER
// =========================================================
function esc(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function adminToast(msg, type = "info") {
    const stack = document.getElementById("adminToastStack");
    if (!stack) return;
    const colors = {
        success: "bg-emerald-600",
        error: "bg-rose-600",
        warning: "bg-amber-600",
        info: "bg-blue-600"
    };
    const el = document.createElement("div");
    el.className = `admin-toast ${colors[type] || colors.info}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => {
        el.style.opacity = "0";
        el.style.transition = "opacity 0.25s";
        setTimeout(() => el.remove(), 260);
    }, 3000);
}

async function adminApi(path, method = "GET", bodyObj = null) {
    const headers = {};
    if (adminState.token) headers["X-Admin-Token"] = adminState.token;
    const opts = { method, headers };
    if (bodyObj !== null && method !== "GET") opts.body = bodyObj;

    const res = await window.rwaSecureFetch(`${ADMIN_API_BASE}${path}`, opts);

    if (res.status === 401 && path !== "/api/admin/auth") {
        lockAdminPanel("Session expired. Kripya Admin Key se dobara unlock karein.");
        throw new Error("Unauthorized");
    }
    return res;
}

// =========================================================
// AUTH, LOCK SCREEN & 5-MINUTE AUTO-REFRESH ENGINE
// =========================================================
window.unlockAdminPanel = async function() {
    const inp = document.getElementById("adminKeyInput");
    const errEl = document.getElementById("adminLoginErr");
    const btn = document.getElementById("unlockBtn");
    const key = (inp ? inp.value : "").trim();

    if (!key) {
        errEl.textContent = "Kripya Master Admin Key dalein.";
        errEl.classList.remove("hidden");
        return;
    }

    errEl.classList.add("hidden");
    btn.disabled = true;
    btn.textContent = "🔐 Verifying Encrypted Handshake...";

    try {
        const res = await window.rwaSecureFetch(`${ADMIN_API_BASE}/api/admin/auth`, {
            method: "POST",
            body: { admin_key: key }
        });

        if (res.ok && res.data && res.data.status === "success" && res.data.admin_token) {
            adminState.token = res.data.admin_token;
            sessionStorage.setItem("rwa_admin_sess_token", adminState.token);
            if (inp) inp.value = "";
            showAdminWorkspace();
            adminToast("🔓 Command Center Unlocked!", "success");
        } else {
            errEl.textContent = (res.data && res.data.message) || "Invalid Admin Key or Security Block!";
            errEl.classList.remove("hidden");
        }
    } catch {
        errEl.textContent = "Server unreachable. Render backend status check karein.";
        errEl.classList.remove("hidden");
    } finally {
        btn.disabled = false;
        btn.textContent = "🔓 Unlock Command Center";
    }
};

window.lockAdminPanel = function(customMsg = "") {
    adminState.token = "";
    sessionStorage.removeItem("rwa_admin_sess_token");
    if (adminState.refreshTimerId) clearInterval(adminState.refreshTimerId);
    document.getElementById("adminMainShell")?.classList.add("hidden");
    document.getElementById("adminLoginScreen")?.classList.remove("hidden");
    const errEl = document.getElementById("adminLoginErr");
    if (errEl) {
        if (customMsg) { errEl.textContent = customMsg; errEl.classList.remove("hidden"); }
        else errEl.classList.add("hidden");
    }
};

function showAdminWorkspace() {
    document.getElementById("adminLoginScreen")?.classList.add("hidden");
    document.getElementById("adminMainShell")?.classList.remove("hidden");
    startAutoRefreshClock();
    switchAdminTab(adminState.activeTab || "overview");
}

function startAutoRefreshClock() {
    if (adminState.refreshTimerId) clearInterval(adminState.refreshTimerId);
    adminState.refreshLeft = AUTO_REFRESH_SECONDS;
    updateCountdownLabel();

    adminState.refreshTimerId = setInterval(() => {
        adminState.refreshLeft--;
        if (adminState.refreshLeft <= 0) {
            adminState.refreshLeft = AUTO_REFRESH_SECONDS;
            refreshCurrentTab(true);
        }
        updateCountdownLabel();
    }, 1000);
}

function updateCountdownLabel() {
    const el = document.getElementById("autoRefreshCountdown");
    if (!el) return;
    const m = String(Math.floor(adminState.refreshLeft / 60)).padStart(2, "0");
    const s = String(adminState.refreshLeft % 60).padStart(2, "0");
    el.textContent = `⏱ Auto-Refresh in ${m}:${s}`;
}

window.manualRefreshAdmin = function() {
    adminState.refreshLeft = AUTO_REFRESH_SECONDS;
    updateCountdownLabel();
    adminToast("🔄 Syncing live cluster data...", "info");
    refreshCurrentTab(false);
};

window.flushServerRamCache = async function() {
    const res = await adminApi("/api/admin/cache/flush", "POST", {});
    if (res.ok) {
        adminToast(`⚡ Flushed ${res.data.cleared_keys || 0} RAM cache keys!`, "success");
        refreshCurrentTab(false);
    }
};

async function refreshCurrentTab(isAuto = false) {
    const t = adminState.activeTab;
    try {
        if (t === "overview") await loadOverview();
        else if (t === "vault") await loadContentVaultTab(false);
        else if (t === "radar") await loadRadarAndActivities();
        else if (t === "users") await loadUsers(adminState.userPage);
        else if (t === "analytics") await loadAnalytics();
        else if (t === "tokens") await loadCloudTokens();
        else if (t === "content") await loadContentHub();
        else if (t === "controls") await loadControls();
        else if (t === "reports") await loadReports();
        else if (t === "security") await loadSecurityTab();

        if (isAuto) adminToast("⏱ 5-Min Auto-Refresh Completed", "info");
    } catch {}
}

window.toggleAdminSidebar = function() {
    document.getElementById("adminSidebar")?.classList.toggle("open-mob");
};

window.toggleAdminTheme = function() {
    const isDark = document.body.classList.toggle("dark-admin");
    localStorage.setItem("rwa_admin_dark_v1", isDark ? "1" : "0");
};

if (localStorage.getItem("rwa_admin_dark_v1") === "1") {
    document.body.classList.add("dark-admin");
}

window.switchAdminTab = function(tab) {
    adminState.activeTab = tab;
    document.getElementById("adminSidebar")?.classList.remove("open-mob");

    document.querySelectorAll(".atab-section").forEach(s => s.classList.add("hidden"));
    document.getElementById(`tab_${tab}`)?.classList.remove("hidden");

    document.querySelectorAll(".anav-btn[data-atab]").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.atab === tab);
    });

    const titles = {
        overview: "📊 Overview & Multi-DB Cluster",
        vault: "☁️ Cloud Content Vault (Summary & Website Mirror)",
        radar: "📡 Live Radar & Global Activity Feed",
        users: "👥 All Users & A-Z Dossier",
        analytics: "🏆 Top Performers & Test Analytics",
        tokens: "🔑 Cloud Token Pool Manager",
        content: "📢 Notices, Broadcasts, Quiz & CA Hub",
        controls: "🎛️ Kill-Switches, Version & Promo Popup",
        reports: "🚩 2-Way User Reports & Mistake Flags",
        security: "🛡️ Security, IP Bans, Diagnostics & Logs"
    };
    const titleEl = document.getElementById("adminTabTitle");
    if (titleEl) titleEl.textContent = titles[tab] || "RWA Admin Pro";

    refreshCurrentTab(false);
};

// =========================================================
// TAB 1: OVERVIEW, 7-DAY GROWTH CHART & UNLIMITED DB SHARDS
// =========================================================
async function loadOverview() {
    const [statsRes, actRes] = await Promise.all([
        adminApi("/api/admin/stats"),
        adminApi("/api/admin/activities?limit=12")
    ]);
    if (!statsRes.ok || !statsRes.data.stats) return;

    const st = statsRes.data.stats;
    adminState.cachedSettings = st.settings || {};
    document.getElementById("adminLastUpdated").textContent = `Updated: ${st.updated_at || "--"}`;

    const vs = st.vault_summary || {};
    const kpis = [
        { lbl: "Total Users", val: st.total_users, ico: "👥", cls: "text-blue-600" },
        { lbl: "Live Right Now", val: st.live_radar_count || 0, ico: "📡", cls: "text-emerald-600" },
        { lbl: "Online / Logged Out", val: `${st.online_users} / ${st.logged_out_users}`, ico: "🟢", cls: "text-teal-600" },
        { lbl: "Active Today", val: st.active_today, ico: "🔥", cls: "text-orange-600" },
        { lbl: "Tests Submitted", val: st.total_tests, ico: "📝", cls: "text-indigo-600" },
        { lbl: "Vault Q-Banks", val: `${vs.total_full_banks || 0} (${vs.total_questions_archived || 0} Qs)`, ico: "☁️", cls: "text-sky-600" },
        { lbl: "Cloud Tokens", val: st.total_admin_tokens, ico: "🔑", cls: "text-amber-600" },
        { lbl: "Reports / Errors", val: `${st.open_reports} / ${st.error_logs_count}`, ico: "🚩", cls: "text-rose-600" }
    ];

    document.getElementById("kpiCardsGrid").innerHTML = kpis.map(k => `
        <div class="kpi-card">
            <div class="flex items-center justify-between">
                <span class="text-xl">${k.ico}</span>
                <span class="text-[10px] font-black uppercase opacity-60">${k.lbl}</span>
            </div>
            <div class="text-xl sm:text-2xl font-black mt-2 ${k.cls} truncate">${k.val}</div>
        </div>`).join("");

    // 7-Day Growth Chart
    const gBox = document.getElementById("growth7dChart");
    const days = st.growth_7d || [];
    const maxVal = Math.max(1, ...days.flatMap(d => [d.active_users, d.tests, d.new_users]));
    gBox.innerHTML = days.map(d => {
        const aH = Math.max(6, Math.round((d.active_users / maxVal) * 100));
        const tH = Math.max(6, Math.round((d.tests / maxVal) * 100));
        const nH = Math.max(6, Math.round((d.new_users / maxVal) * 100));
        return `
            <div class="flex-1 min-w-[66px] flex flex-col items-center justify-end h-full gap-1.5" title="${d.date}: Active ${d.active_users}, Tests ${d.tests}, New ${d.new_users}">
                <div class="flex items-end gap-1 h-28">
                    <div class="w-3 bg-blue-600 rounded-t-md" style="height:${aH}%"></div>
                    <div class="w-3 bg-emerald-500 rounded-t-md" style="height:${tH}%"></div>
                    <div class="w-3 bg-purple-600 rounded-t-md" style="height:${nH}%"></div>
                </div>
                <div class="text-[10px] font-black opacity-75">${d.label}</div>
                <div class="text-[9px] font-bold opacity-60">${d.active_users}/${d.tests}/${d.new_users}</div>
            </div>`;
    }).join("");

    // Unlimited User DBs + RAM Cache Badge
    const rc = st.ram_cache || {};
    const rcBadge = document.getElementById("ramCacheBadge");
    if (rcBadge) rcBadge.textContent = `⚡ RAM Cache: ${rc.cached_keys || 0} keys (${rc.hits || 0} hits)`;

    const cfgCount = Math.max(st.configured_dbs || 0, st.connected_dbs || 0);
    document.getElementById("activeShardsBadge").textContent = `${st.connected_dbs} / ${cfgCount} User DBs Active`;
    const shardBox = document.getElementById("shardsHealthContainer");
    if (!st.per_db || !st.per_db.length) {
        shardBox.innerHTML = `<div class="col-span-full p-3 rounded-xl bg-rose-100 text-rose-800 text-xs font-extrabold">No MongoDB shards connected. ${(st.connection_errors || []).join(" | ")}</div>`;
    } else {
        shardBox.innerHTML = st.per_db.map(db => {
            const pct = Math.min(100, Math.round(((db.size_mb || 0) / (db.max_mb || 512)) * 100));
            const barColor = pct > 80 ? "bg-rose-600" : (pct > 60 ? "bg-amber-500" : "bg-emerald-500");
            return `
                <div class="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/60 dark:border-slate-700 space-y-2">
                    <div class="flex justify-between items-center text-xs font-black">
                        <span>🗄️ ${esc(db.label)}</span>
                        <span>${db.size_mb || 0} MB / 512 MB (${pct}%)</span>
                    </div>
                    <div class="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div class="h-full ${barColor}" style="width:${pct}%"></div>
                    </div>
                    <div class="text-[11px] font-bold opacity-70">👥 ${db.users || 0} Users • 📝 ${db.tests || 0} Tests</div>
                </div>`;
        }).join("");
    }

    // Overview Vault Quick Text
    const ovVault = document.getElementById("overviewVaultQuickText");
    if (ovVault) {
        ovVault.textContent = `${vs.total_series || 0} Series • ${vs.total_folders || 0} Folders • ${vs.total_listed_tests || 0} Listed Tests • ${vs.total_full_banks || 0} Full Q-Banks (${vs.total_questions_archived || 0} Questions) across ${vs.connected_vault_dbs || 0} ${vs.using_dedicated ? "Dedicated Content Vault DB(s)" : "Shared Fallback DB(s)"}`;
    }

    // Quick Switches
    const s = st.settings || {};
    document.getElementById("quickSwitchesBox").innerHTML = `
        <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer">
            <div><div class="font-black">🚧 Maintenance Mode</div><div class="opacity-65 text-[11px]">${s.maintenance_mode ? "Portal is LOCKED" : "Portal is LIVE"}</div></div>
            <input type="checkbox" ${s.maintenance_mode ? "checked" : ""} onchange="toggleQuickSwitch('maintenance_mode', this.checked)" class="w-5 h-5 accent-rose-600">
        </label>
        <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer">
            <div><div class="font-black">📱 Single-Device Guard</div><div class="opacity-65 text-[11px]">Auto-logout purana device on multi-login</div></div>
            <input type="checkbox" ${s.single_device_guard ? "checked" : ""} onchange="toggleQuickSwitch('single_device_guard', this.checked)" class="w-5 h-5 accent-blue-600">
        </label>
        <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer">
            <div><div class="font-black">🔔 Telegram Login Alerts</div><div class="opacity-65 text-[11px]">Notify on every new login</div></div>
            <input type="checkbox" ${s.login_alerts ? "checked" : ""} onchange="toggleQuickSwitch('login_alerts', this.checked)" class="w-5 h-5 accent-emerald-600">
        </label>
        <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer">
            <div><div class="font-black">📝 Telegram Test Submit Alerts</div><div class="opacity-65 text-[11px]">Notify when student submits mock test</div></div>
            <input type="checkbox" ${s.test_submit_alerts ? "checked" : ""} onchange="toggleQuickSwitch('test_submit_alerts', this.checked)" class="w-5 h-5 accent-indigo-600">
        </label>`;

    const acts = (actRes.data && actRes.data.activities) || [];
    document.getElementById("overviewActivitiesBox").innerHTML = acts.length
        ? acts.map(renderActivityRowHtml).join("")
        : `<div class="opacity-60 text-center py-6 font-bold">No recent activity yet.</div>`;
}

// =========================================================
// TAB 2: CLOUD CONTENT VAULT (DIRECT SUMMARY + WEBSITE MIRROR)
// =========================================================
async function loadContentVaultTab(resetToRoot = false) {
    if (resetToRoot) adminState.vaultView = "series";

    // 1. Direct Summary Dashboard
    const sumRes = await adminApi("/api/admin/vault/summary");
    if (sumRes.ok && sumRes.data.summary) {
        const vs = sumRes.data.summary;
        const badge = document.getElementById("vaultModeBadge");
        if (badge) {
            badge.textContent = vs.using_dedicated
                ? `✅ ${vs.connected_vault_dbs} Dedicated Content DB(s) Active`
                : `ℹ️ Shared Fallback Mode (${vs.connected_vault_dbs} DB) — Add CONTENT_MONGO_URI_1`;
            badge.className = vs.using_dedicated
                ? "px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-black"
                : "px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-black";
        }

        const vKpis = [
            { lbl: "Saved Series", val: vs.total_series || 0, ico: "🏆", cls: "text-blue-600" },
            { lbl: "Saved Folders", val: vs.total_folders || 0, ico: "📂", cls: "text-indigo-600" },
            { lbl: "Listed Tests", val: vs.total_listed_tests || 0, ico: "📋", cls: "text-teal-600" },
            { lbl: "Full Q-Banks", val: vs.total_full_banks || 0, ico: "☁️", cls: "text-emerald-600" },
            { lbl: "Total Questions", val: vs.total_questions_archived || 0, ico: "❓", cls: "text-purple-600" }
        ];
        document.getElementById("vaultSummaryKpis").innerHTML = vKpis.map(k => `
            <div class="kpi-card">
                <div class="flex items-center justify-between"><span class="text-lg">${k.ico}</span><span class="text-[10px] font-black uppercase opacity-60">${k.lbl}</span></div>
                <div class="text-2xl font-black mt-1.5 ${k.cls}">${k.val}</div>
            </div>`).join("");

        document.getElementById("vaultShardsHealth").innerHTML = (vs.per_shard || []).map(s => {
            const pct = Math.min(100, Math.round(((s.size_mb || 0) / (s.max_mb || 512)) * 100));
            const barColor = pct > 80 ? "bg-rose-600" : (pct > 60 ? "bg-amber-500" : "bg-blue-600");
            return `
                <div class="p-3 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/60 dark:border-slate-700 space-y-1.5">
                    <div class="flex justify-between text-xs font-black"><span>📦 ${esc(s.label)}</span><span>${s.size_mb || 0} MB / 512 MB</span></div>
                    <div class="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden"><div class="h-full ${barColor}" style="width:${pct}%"></div></div>
                    <div class="text-[11px] font-bold opacity-70">☁️ ${s.full_banks || 0} Full Tests • ❓ ${s.questions || 0} Questions</div>
                </div>`;
        }).join("") || `<div class="col-span-full text-xs opacity-65 font-bold">No Vault DB connected.</div>`;
    }

    // 2. Render Current Website-Mirror Level
    if (adminState.vaultView === "series") await loadVaultMirrorSeries();
    else if (adminState.vaultView === "folders") await openVaultMirrorSeries(adminState.vaultSeriesId, adminState.vaultSeriesTitle);
    else if (adminState.vaultView === "tests") await openVaultMirrorTests(adminState.vaultSeriesId, adminState.vaultFolderId, adminState.vaultFolderTitle);
}

async function loadVaultMirrorSeries() {
    adminState.vaultView = "series";
    document.getElementById("vaultBackBtn")?.classList.add("hidden");
    document.getElementById("vaultCrumb").textContent = "Cloud Vault Root";
    document.getElementById("vaultExplorerHeading").textContent = "📂 All Saved Test Series (Website Mirror)";
    const inp = document.getElementById("vaultSearchInput"); if (inp) inp.value = "";

    const grid = document.getElementById("vaultMirrorGrid");
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-xs font-bold opacity-70">🔄 Loading Saved Series...</div>`;

    const res = await adminApi("/api/admin/vault/series");
    const list = (res.data && res.data.series) || [];
    adminState.vaultSeriesCache = list;

    if (!list.length) {
        grid.innerHTML = `<div class="col-span-full py-10 text-center text-xs font-bold opacity-70">Abhi Cloud Vault mein koi series save nahi hui hai. Jaise hi website par koi series ya test khulega, woh automatically yahan save ho jayega!</div>`;
        return;
    }

    grid.innerHTML = list.map((ts, idx) => {
        const logo = esc(ts.logo || "https://placehold.co/600x300/2563eb/ffffff?text=RWA+Series");
        return `
            <div class="vault-card-item admin-glass rounded-2xl overflow-hidden flex flex-col justify-between">
                <div onclick="openVaultMirrorSeriesByIdx(${idx})" class="cursor-pointer">
                    <img src="${logo}" onerror="this.src='https://placehold.co/600x300/2563eb/ffffff?text=RWA+Vault'" class="w-full h-36 object-cover">
                    <div class="p-3.5 space-y-1.5">
                        <div class="flex justify-between items-center gap-1.5 flex-wrap">
                            <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">SERIES #${esc(ts.series_id)}</span>
                            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">☁️ ${ts.saved_full_banks || 0} Full / ${ts.saved_tests_count || 0} Tests</span>
                        </div>
                        <h4 class="font-black text-sm leading-snug">${esc(ts.title)}</h4>
                        <div class="text-[10px] font-bold opacity-60">Updated: ${esc(ts.updated_at || "")}</div>
                    </div>
                </div>
                <div class="px-3.5 pb-3.5 flex items-center justify-between gap-2">
                    <button onclick="openVaultMirrorSeriesByIdx(${idx})" class="admin-btn-primary flex-1 py-2 text-xs">Open Folders / Tests →</button>
                    <button onclick="deleteVaultSeries('${esc(ts.series_id)}')" class="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 font-black text-xs border-0 cursor-pointer" title="Delete Series from Vault">🗑</button>
                </div>
            </div>`;
    }).join("");
}

window.openVaultMirrorSeriesByIdx = function(idx) {
    const ts = adminState.vaultSeriesCache[idx];
    if (!ts) return;
    openVaultMirrorSeries(ts.series_id, ts.title);
};

async function openVaultMirrorSeries(seriesId, seriesTitle) {
    adminState.vaultView = "folders";
    adminState.vaultSeriesId = String(seriesId);
    adminState.vaultSeriesTitle = seriesTitle || `Series #${seriesId}`;
    document.getElementById("vaultBackBtn")?.classList.remove("hidden");
    document.getElementById("vaultCrumb").textContent = `Series #${seriesId}`;
    document.getElementById("vaultExplorerHeading").textContent = `📂 ${adminState.vaultSeriesTitle}`;
    const inp = document.getElementById("vaultSearchInput"); if (inp) inp.value = "";

    const grid = document.getElementById("vaultMirrorGrid");
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-xs font-bold opacity-70">🔄 Loading Folders...</div>`;

    const res = await adminApi(`/api/admin/vault/folders/${encodeURIComponent(seriesId)}`);
    const folders = (res.data && res.data.folders) || [];
    adminState.vaultFoldersCache = folders;

    if (!folders.length || (folders.length === 1 && String(folders[0].subject_id) === "-1")) {
        await openVaultMirrorTests(seriesId, "-1", adminState.vaultSeriesTitle);
        return;
    }

    grid.innerHTML = folders.map((f, idx) => `
        <div onclick="openVaultMirrorFolderByIdx(${idx})" class="vault-card-item admin-glass p-4 rounded-2xl flex items-center gap-3 cursor-pointer hover:border-blue-500">
            <img src="${esc(f.subject_logo || "https://placehold.co/64x64/4f46e5/ffffff?text=DIR")}" onerror="this.src='https://placehold.co/64x64/4f46e5/ffffff?text=DIR'" class="w-14 h-14 rounded-xl object-cover shrink-0">
            <div class="min-w-0 flex-1">
                <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-black">FOLDER #${esc(f.subject_id)}</span>
                <h4 class="font-black text-sm mt-1 truncate">📂 ${esc(f.subject_name)}</h4>
                <div class="text-[11px] font-extrabold text-blue-600 mt-0.5">Open Tests →</div>
            </div>
        </div>`).join("");
}

window.openVaultMirrorFolderByIdx = function(idx) {
    const f = adminState.vaultFoldersCache[idx];
    if (!f) return;
    openVaultMirrorTests(adminState.vaultSeriesId, f.subject_id, f.subject_name);
};

async function openVaultMirrorTests(seriesId, folderId, folderTitle) {
    adminState.vaultView = "tests";
    adminState.vaultSeriesId = String(seriesId);
    adminState.vaultFolderId = String(folderId || "-1");
    adminState.vaultFolderTitle = folderTitle || adminState.vaultSeriesTitle;
    document.getElementById("vaultBackBtn")?.classList.remove("hidden");
    document.getElementById("vaultCrumb").textContent = `${adminState.vaultSeriesTitle} (Series #${seriesId})`;
    document.getElementById("vaultExplorerHeading").textContent = `📝 ${adminState.vaultFolderTitle}`;
    const inp = document.getElementById("vaultSearchInput"); if (inp) inp.value = "";

    const grid = document.getElementById("vaultMirrorGrid");
    grid.innerHTML = `<div class="col-span-full py-8 text-center text-xs font-bold opacity-70">🔄 Loading Saved Tests...</div>`;

    const res = await adminApi(`/api/admin/vault/titles/${encodeURIComponent(seriesId)}?subject_id=${encodeURIComponent(folderId || "-1")}`);
    const tests = (res.data && res.data.tests) || [];
    adminState.vaultTestsCache = tests;

    if (!tests.length) {
        grid.innerHTML = `<div class="col-span-full py-8 text-center text-xs font-bold opacity-70">Is folder mein abhi koi test save nahi hai.</div>`;
        return;
    }

    grid.innerHTML = tests.map(t => {
        const hasFull = Boolean(t.has_full_bank);
        return `
            <div class="vault-card-item admin-glass p-4 rounded-2xl flex flex-col justify-between gap-3">
                <div class="space-y-1.5">
                    <div class="flex justify-between items-center gap-1.5 flex-wrap">
                        <span class="px-2 py-0.5 rounded-full ${hasFull ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"} text-[10px] font-black">
                            ${hasFull ? `✅ Full Q-Bank (${t.saved_questions_count || t.questions} Qs)` : "📋 Title Only (Not Opened Yet)"}
                        </span>
                        ${t.vault_shard ? `<span class="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[9px] font-black">${esc(t.vault_shard)}</span>` : ""}
                    </div>
                    <h4 class="font-black text-sm leading-snug">${esc(t.title)}</h4>
                    <div class="text-[11px] font-bold opacity-70">Test #${esc(t.test_id)} • ${esc(t.questions)} Qs • ${esc(t.time)} Mins • ${esc(t.marks)} Marks</div>
                </div>
                <div class="flex items-center gap-2 pt-2 border-t border-sky-200/40">
                    ${hasFull
                        ? `<button onclick="previewVaultTest('${esc(t.test_id)}')" class="admin-btn-primary flex-1 py-2 text-xs">👁️ Preview Q-Bank</button>`
                        : `<span class="flex-1 text-[11px] font-bold opacity-60">Auto-saves on 1st test load</span>`}
                    <button onclick="deleteVaultTest('${esc(t.test_id)}')" class="px-3 py-2 rounded-xl bg-rose-100 text-rose-700 font-black text-xs border-0 cursor-pointer" title="Delete Test">🗑</button>
                </div>
            </div>`;
    }).join("");
}

window.vaultMirrorGoBack = function() {
    if (adminState.vaultView === "tests" && adminState.vaultFolderId !== "-1" && adminState.vaultFoldersCache.length > 0) {
        openVaultMirrorSeries(adminState.vaultSeriesId, adminState.vaultSeriesTitle);
    } else {
        loadVaultMirrorSeries();
    }
};

window.filterVaultMirrorGrid = function() {
    const q = (document.getElementById("vaultSearchInput")?.value || "").toLowerCase().trim();
    document.querySelectorAll("#vaultMirrorGrid .vault-card-item").forEach(el => {
        el.style.display = el.innerText.toLowerCase().includes(q) ? "" : "none";
    });
};

window.previewVaultTest = async function(testId) {
    const modal = document.getElementById("vaultPreviewModal");
    modal.classList.remove("hidden");
    document.getElementById("vaultPreviewTitle").textContent = `Loading Test #${testId}...`;
    document.getElementById("vaultPreviewMeta").textContent = "Fetching full terms & questions from Content Vault...";
    document.getElementById("vaultPreviewBody").innerHTML = `<div class="py-10 text-center font-bold opacity-70">🔄 Loading...</div>`;

    const res = await adminApi(`/api/admin/vault/test/${encodeURIComponent(testId)}`);
    if (!res.ok || !res.data.test_data) {
        document.getElementById("vaultPreviewBody").innerHTML = `<div class="py-8 text-center text-rose-600 font-black">${esc((res.data && res.data.message) || "Not found")}</div>`;
        return;
    }

    const doc = res.data.test_data;
    adminState.vaultPreviewDoc = doc;
    document.getElementById("vaultPreviewTitle").textContent = doc.title || `Test #${testId}`;
    document.getElementById("vaultPreviewMeta").textContent = `Test #${doc.test_id} • Series #${doc.series_id} • ${doc.questions_count} Questions • ${doc.sections_count} Sections • Shard: ${doc.vault_shard} • Updated: ${doc.updated_at}`;

    document.getElementById("vaultDownloadJsonBtn").onclick = () => {
        const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `vault_test_${doc.test_id}.json`;
        a.click();
    };

    const secsHtml = (doc.sections || []).map(s => `<span class="px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">${esc(s.name)} (${s.numberOfQuestions || "?"} Qs)</span>`).join(" ");
    const qsHtml = (doc.questions || []).slice(0, 120).map((q, i) => `
        <div class="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700 space-y-1.5">
            <div class="flex justify-between font-black text-[11px] text-indigo-700 dark:text-sky-400">
                <span>Q.${i + 1} • ${esc(q.section_name || q.subject || "Section")}</span>
                <span class="text-emerald-600">Ans: Option #${esc(q.answer || q.correct_option || "1")}</span>
            </div>
            <div class="font-bold text-xs leading-relaxed">${q.question || q.question_text || ""}</div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] opacity-85 pt-1">
                <div>A) ${q.option_1 || q.opt1 || ""}</div>
                <div>B) ${q.option_2 || q.opt2 || ""}</div>
                <div>C) ${q.option_3 || q.opt3 || ""}</div>
                <div>D) ${q.option_4 || q.opt4 || ""}</div>
            </div>
        </div>`).join("");

    document.getElementById("vaultPreviewBody").innerHTML = `
        <div class="flex gap-2 flex-wrap">${secsHtml || `<span class="opacity-65 font-bold">Default Single Section</span>`}</div>
        <div class="space-y-2.5">${qsHtml}</div>`;
};

window.closeVaultPreview = function() {
    document.getElementById("vaultPreviewModal")?.classList.add("hidden");
};

window.deleteVaultTest = async function(testId) {
    if (!confirm(`Test #${testId} ko Cloud Vault se delete karein?`)) return;
    const res = await adminApi(`/api/admin/vault/test/${encodeURIComponent(testId)}`, "DELETE");
    if (res.ok) {
        adminToast("🗑 Test deleted from Cloud Vault!", "success");
        loadContentVaultTab(false);
    }
};

window.deleteVaultSeries = async function(seriesId) {
    if (!confirm(`Poori Series #${seriesId} (folders + saved tests) ko Cloud Vault se delete karein?`)) return;
    const res = await adminApi(`/api/admin/vault/series/${encodeURIComponent(seriesId)}`, "DELETE");
    if (res.ok) {
        adminToast("🗑 Series deleted from Cloud Vault!", "success");
        loadContentVaultTab(true);
    }
};

// =========================================================
// COMMON ACTIONS & REMAINING TABS
// =========================================================
window.toggleQuickSwitch = async function(key, val) {
    const res = await adminApi("/api/admin/settings", "POST", { [key]: val });
    if (res.ok) { adminToast(`✅ ${key} updated!`, "success"); loadOverview(); }
};

window.cleanOldClusterLogs = async function() {
    if (!confirm("30 din se purane activity aur error logs delete karein? (Users aur Scorecards 100% safe rahenge)")) return;
    const res = await adminApi("/api/admin/clean_old_logs", "POST", { days: 30 });
    if (res.ok) {
        adminToast(`🧹 Cleaned ${res.data.activity_deleted} activities & ${res.data.errors_deleted} errors!`, "success");
        loadOverview();
    }
};

function renderActivityRowHtml(a) {
    return `
        <div onclick="openUserDossier('${esc(a.user_id)}')" class="p-2.5 rounded-xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700 flex justify-between items-start gap-2 cursor-pointer hover:border-blue-500">
            <div class="min-w-0">
                <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[9px] font-black">${esc(a.action)}</span>
                <span class="font-black ml-1">${esc(a.user_name)}</span>
                <div class="opacity-75 mt-0.5 break-words">${esc(a.detail)}</div>
            </div>
            <span class="text-[10px] font-bold opacity-60 shrink-0">${esc(a.time_str)}</span>
        </div>`;
}

async function loadRadarAndActivities() {
    const [radRes, actRes] = await Promise.all([
        adminApi("/api/admin/radar"),
        adminApi("/api/admin/activities?limit=60")
    ]);
    const live = (radRes.data && radRes.data.live_users) || [];
    document.getElementById("radarLiveCountPill").textContent = `${live.length} LIVE NOW`;
    document.getElementById("liveRadarGrid").innerHTML = live.length ? live.map(u => `
        <div onclick="openUserDossier('${esc(u.user_id)}')" class="p-3.5 rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border-2 border-emerald-300 dark:border-emerald-700 cursor-pointer space-y-1">
            <div class="flex justify-between items-center gap-2">
                <span class="font-black text-sm truncate">🟢 ${esc(u.name)} ${u.vip_badge ? `<span class="text-xs">${esc(u.vip_badge)}</span>` : ""}</span>
                <span class="text-[10px] font-black text-emerald-700">${u.seconds_ago}s ago</span>
            </div>
            <div class="text-xs font-extrabold text-indigo-700 dark:text-sky-400 truncate">📍 ${esc(u.current_page)}</div>
            <div class="text-[10px] font-bold opacity-70">UID: ${esc(u.user_id)} • ${esc(u.last_device)} • IP: ${esc(u.last_ip || "N/A")}</div>
        </div>`).join("") : `<div class="col-span-full py-6 text-center text-xs font-bold opacity-65">Abhi koi student active radar window mein nahi hai.</div>`;

    const acts = (actRes.data && actRes.data.activities) || [];
    document.getElementById("globalActivityList").innerHTML = acts.length
        ? acts.map(renderActivityRowHtml).join("")
        : `<div class="py-6 text-center opacity-65 font-bold">No activity logs found.</div>`;
}

window.setUserFilter = function(mode, btn) {
    adminState.userFilter = mode;
    document.querySelectorAll("#userFilterPills .ufilter-pill").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    loadUsers(1);
};

window.loadUsers = async function(page = 1) {
    adminState.userPage = page;
    const q = (document.getElementById("userSearchInput")?.value || "").trim();
    const res = await adminApi(`/api/admin/users?page=${page}&per_page=16&q=${encodeURIComponent(q)}&filter=${encodeURIComponent(adminState.userFilter)}`);
    if (!res.ok) return;

    const users = res.data.users || [], total = res.data.total || 0;
    const grid = document.getElementById("usersListGrid");

    grid.innerHTML = users.length ? users.map(u => {
        const statusBadge = u.is_blocked
            ? `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">🚫 BLOCKED</span>`
            : (u.is_logged_in === false
                ? `<span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black">⚪ LOGGED OUT</span>`
                : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">🟢 ONLINE</span>`);
        const vipPill = u.vip_badge ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 text-[10px] font-black">${esc(u.vip_badge)}</span>` : "";

        return `
            <div onclick="openUserDossier('${esc(u.user_id)}')" class="admin-glass p-4 rounded-2xl cursor-pointer hover:border-blue-500 transition space-y-2">
                <div class="flex justify-between items-start gap-2">
                    <div class="min-w-0">
                        <div class="flex items-center gap-1.5 flex-wrap">
                            <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-black">${esc(u.db_shard || "DB-1")}</span>
                            ${vipPill} ${statusBadge}
                        </div>
                        <h4 class="font-black text-base mt-1 truncate">${esc(u.name || "RWA Student")}</h4>
                        <div class="text-[11px] font-bold opacity-70">UID: ${esc(u.user_id)} • 📱 ${esc(u.phone || "N/A")}</div>
                    </div>
                    <span class="px-2.5 py-1 rounded-xl bg-blue-600 text-white text-[10px] font-black shrink-0">Open A-Z →</span>
                </div>
                <div class="text-[11px] font-bold opacity-75 truncate">📍 ${esc(u.current_activity || "Active")} • 🕒 ${esc(u.last_seen || "")}</div>
                <div class="flex gap-2 flex-wrap text-[10px] font-extrabold opacity-75 pt-1 border-t border-sky-200/40">
                    <span>🔥 ${u.study_streak || 1}d</span>
                    <span>⚡ ${u.weekly_xp || 0} XP</span>
                    <span>🔖 ${u.bookmarks_count || 0} Saved</span>
                    <span>❌ ${u.mistakes_count || 0} Mistakes</span>
                    <span>🌐 ${esc(u.last_ip || "N/A")}</span>
                </div>
            </div>`;
    }).join("") : `<div class="col-span-full admin-glass p-8 text-center text-xs font-bold opacity-70">Koi student match nahi hua.</div>`;

    const totalPages = Math.max(1, Math.ceil(total / 16));
    document.getElementById("usersPagination").innerHTML = `
        <button ${page <= 1 ? "disabled" : ""} onclick="loadUsers(${page - 1})" class="ufilter-pill">← Prev</button>
        <span class="text-xs font-black">Page ${page} / ${totalPages} (${total} Users)</span>
        <button ${page >= totalPages ? "disabled" : ""} onclick="loadUsers(${page + 1})" class="ufilter-pill">Next →</button>`;
};

window.openUserDossier = async function(uid) {
    const modal = document.getElementById("userDossierModal");
    modal.classList.remove("hidden");
    document.getElementById("dossierTitle").textContent = `Loading User #${uid}...`;
    document.getElementById("dossierBody").innerHTML = `<div class="py-10 text-center font-black opacity-70">🔄 Fetching Full Encrypted Dossier...</div>`;

    const res = await adminApi(`/api/admin/user/${encodeURIComponent(uid)}`);
    if (!res.ok || !res.data.dossier) {
        document.getElementById("dossierBody").innerHTML = `<div class="py-8 text-center text-rose-600 font-black">User not found.</div>`;
        return;
    }

    adminState.currentDossier = res.data.dossier;
    const u = adminState.currentDossier.user || {};
    document.getElementById("dossierTitle").textContent = `${u.name || "Student"} ${u.vip_badge || ""} (${adminState.currentDossier.shard})`;
    document.getElementById("dossierSubtitle").textContent = `UID: ${u.user_id} • 📱 ${u.phone || "N/A"} • IP: ${u.last_ip || "N/A"} • ${u.is_blocked ? "🚫 BLOCKED" : (u.is_logged_in === false ? "⚪ LOGGED OUT" : "🟢 ONLINE")}`;
    switchDossierTab("info");
};
window.closeUserDossier = function() { document.getElementById("userDossierModal")?.classList.add("hidden"); };

window.switchDossierTab = function(tab) {
    adminState.activeDossierTab = tab;
    document.querySelectorAll("#dossierSubTabs .ufilter-pill").forEach(b => b.classList.toggle("active", b.dataset.dtab === tab));
    const d = adminState.currentDossier; if (!d) return;
    const u = d.user || {}, sync = d.sync || {}, tests = d.tests || [], logs = d.logs || [], inbox = d.messages || [];
    const box = document.getElementById("dossierBody");

    if (tab === "info") {
        const devicesHtml = (u.devices || []).map(dev => `
            <div class="p-2 rounded-lg bg-sky-50/70 dark:bg-slate-800 flex justify-between text-[11px] font-bold">
                <span>💻 ${esc(dev.device_type)} (${esc(dev.device_id)})</span>
                <span>🌐 ${esc(dev.ip)} • ${esc(dev.last_seen)}</span>
            </div>`).join("") || `<div class="opacity-60">No device records yet.</div>`;

        box.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700">
                <div><span class="opacity-65">Name:</span> <strong>${esc(u.name)}</strong></div>
                <div><span class="opacity-65">User ID:</span> <strong class="font-mono">${esc(u.user_id)}</strong></div>
                <div><span class="opacity-65">Phone:</span> <strong class="font-mono">${esc(u.phone)}</strong></div>
                <div><span class="opacity-65">Email:</span> <strong class="break-all">${esc(u.email)}</strong></div>
                <div><span class="opacity-65">Password / OTP:</span> <strong class="font-mono">${esc(u.password)}</strong></div>
                <div><span class="opacity-65">State / District:</span> <strong>${esc(u.state_district)}</strong></div>
                <div><span class="opacity-65">Category / Gender:</span> <strong>${esc(u.category_gender)}</strong></div>
                <div><span class="opacity-65">Streak / Weekly XP:</span> <strong>🔥 ${u.study_streak || 1}d • ⚡ ${u.weekly_xp || 0} XP</strong></div>
                <div><span class="opacity-65">Last Login:</span> <strong>${esc(u.last_login)}</strong></div>
                <div><span class="opacity-65">Last Logout:</span> <strong>${esc(u.last_logout || "N/A")}</strong></div>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div class="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700 space-y-2.5">
                    <div class="font-black text-sm">🛡️ Account & Security Controls</div>
                    <div class="flex flex-wrap gap-2">
                        <button onclick="adminToggleBlockUser('${esc(u.user_id)}', ${!u.is_blocked})" class="px-3.5 py-2 rounded-xl ${u.is_blocked ? "bg-emerald-600" : "bg-rose-600"} text-white font-extrabold border-0 cursor-pointer">${u.is_blocked ? "✅ Unblock Account" : "🚫 Block Account"}</button>
                        <button onclick="adminForceLogoutUser('${esc(u.user_id)}')" class="px-3.5 py-2 rounded-xl bg-amber-500 text-white font-extrabold border-0 cursor-pointer">🚪 Force Logout</button>
                        ${u.last_ip ? `<button onclick="adminBanUserIp('${esc(u.last_ip)}', '${esc(u.user_id)}')" class="px-3.5 py-2 rounded-xl bg-slate-900 text-white font-extrabold border-0 cursor-pointer">🌐 Ban IP (${esc(u.last_ip)})</button>` : ""}
                    </div>
                    <div class="pt-2 border-t border-sky-200/40">
                        <div class="font-extrabold mb-1.5">⭐ Assign VIP / Topper Badge:</div>
                        <div class="flex gap-1.5 flex-wrap">
                            <button onclick="adminSetVip('${esc(u.user_id)}', '🏆 Topper')" class="ufilter-pill">🏆 Topper</button>
                            <button onclick="adminSetVip('${esc(u.user_id)}', '⭐ VIP')" class="ufilter-pill">⭐ VIP</button>
                            <button onclick="adminSetVip('${esc(u.user_id)}', '🔥 Regular')" class="ufilter-pill">🔥 Regular</button>
                            <button onclick="adminSetVip('${esc(u.user_id)}', '')" class="ufilter-pill">✕ Clear</button>
                        </div>
                    </div>
                </div>
                <div class="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700 space-y-2">
                    <div class="font-black text-sm">🔔 Send Direct Message (Student Bell Inbox)</div>
                    <input id="pmTitleInp" type="text" placeholder="Message Title" class="admin-input">
                    <textarea id="pmBodyInp" rows="2" placeholder="Write personal message..." class="admin-input"></textarea>
                    <button onclick="adminSendPersonalMsg('${esc(u.user_id)}')" class="admin-btn-primary w-full py-2 text-xs">🚀 Send to Student Inbox</button>
                </div>
            </div>
            <div class="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700 space-y-2">
                <div class="flex justify-between items-center">
                    <span class="font-black">🔑 Student JWT Token</span>
                    <button onclick="navigator.clipboard.writeText('${esc(u.jwt_token || "")}'); adminToast('Token Copied!','success');" class="px-2.5 py-1 rounded-lg bg-blue-600 text-white text-[10px] font-black border-0 cursor-pointer">📋 Copy</button>
                </div>
                <div class="p-2 rounded-xl bg-white dark:bg-slate-900 font-mono text-[10px] break-all max-h-20 overflow-y-auto">${esc(u.jwt_token || "N/A")}</div>
                <div class="font-black pt-2">📱 Tracked Devices (${(u.devices || []).length})</div>
                <div class="space-y-1.5">${devicesHtml}</div>
            </div>`;
    } else if (tab === "tests") {
        box.innerHTML = tests.length ? tests.map(t => `
            <div class="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/80 border border-sky-200/50 dark:border-slate-700 space-y-2">
                <div class="flex justify-between items-start gap-2 flex-wrap">
                    <div><h4 class="font-black text-sm">${esc(t.test_title)}</h4><div class="text-[11px] opacity-70 font-bold">Test #${esc(t.test_id)} • ${esc(t.submitted_at)}</div></div>
                    <div class="flex items-center gap-2">
                        <span class="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 font-black text-xs">${t.score}/${t.max_marks} (${t.accuracy}%)</span>
                        <button onclick="deleteLeaderboardScore('${esc(t.attempt_id)}', true)" class="px-2.5 py-1 rounded-lg bg-rose-600 text-white text-[10px] font-black border-0 cursor-pointer">🗑 Remove</button>
                    </div>
                </div>
                <div class="flex gap-3 flex-wrap font-bold text-[11px]">
                    <span class="text-emerald-600">✓ ${t.correct}</span>
                    <span class="text-rose-600">✕ ${t.incorrect}</span>
                    <span class="opacity-70">− ${t.unattempted}</span>
                    <span class="text-rose-700">⏳ Traps: ${t.time_traps_count || 0}</span>
                    <span class="text-amber-700">🎲 Guesses: ${t.fast_guesses_count || 0}</span>
                </div>
            </div>`).join("") : `<div class="py-10 text-center opacity-65 font-bold">No tests submitted yet.</div>`;
    } else if (tab === "mistakes") {
        const mistakes = sync.mistake_bank || [];
        box.innerHTML = mistakes.length ? mistakes.map((m, i) => `
            <div class="p-4 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200 dark:border-rose-800 space-y-1.5">
                <div class="flex justify-between font-black text-[11px]"><span class="text-rose-700">#${i + 1} • ${esc(m.subject)} • ${esc(m.testTitle)}</span><span class="opacity-65">${esc(m.savedAt || "")}</span></div>
                <div class="font-bold text-sm">${(m.questionObj && m.questionObj.question) || ""}</div>
            </div>`).join("") : `<div class="py-10 text-center opacity-65 font-bold">Mistake Bank is empty.</div>`;
    } else if (tab === "bookmarks") {
        const bms = sync.bookmarks || [];
        box.innerHTML = bms.length ? bms.map((b, i) => `
            <div class="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 space-y-1.5">
                <div class="flex justify-between font-black text-[11px]"><span class="text-amber-800">🔖 #${i + 1} • ${esc(b.subject)} • ${esc(b.testTitle)}</span><span class="opacity-65">${esc(b.savedAt || "")}</span></div>
                <div class="font-bold text-sm">${(b.questionObj && b.questionObj.question) || ""}</div>
                ${b.note ? `<div class="p-2 rounded-lg bg-white/80 text-indigo-800 font-bold">📝 Note: ${esc(b.note)}</div>` : ""}
            </div>`).join("") : `<div class="py-10 text-center opacity-65 font-bold">No bookmarked questions synced yet.</div>`;
    } else if (tab === "logs") {
        box.innerHTML = `
            <div class="space-y-2"><div class="font-black text-sm">🔔 Sent Inbox Messages (${inbox.length})</div>
                ${inbox.length ? inbox.map(m => `<div class="p-3 rounded-xl bg-indigo-50/70 dark:bg-slate-800 border border-indigo-200/50"><div class="flex justify-between font-black"><span>${esc(m.title)}</span><span class="opacity-60">${m.read ? "✓ Read" : "● Unread"} • ${esc(m.created_at)}</span></div><div class="mt-1 opacity-85">${esc(m.message)}</div></div>`).join("") : `<div class="opacity-60 font-bold">No messages yet.</div>`}
            </div>
            <div class="space-y-2 pt-3"><div class="font-black text-sm">🔴 Recent Activity Timeline (${logs.length})</div>
                ${logs.length ? logs.map(renderActivityRowHtml).join("") : `<div class="opacity-60 font-bold">No logs yet.</div>`}
            </div>`;
    }
};

window.adminToggleBlockUser = async function(uid, blocked) {
    const reason = blocked ? (prompt("Block reason likhein:", "Policy violation") || "Blocked by Admin") : "";
    const res = await adminApi("/api/admin/user/block", "POST", { user_id: uid, blocked, reason });
    if (res.ok) { adminToast(blocked ? "🚫 User Blocked!" : "✅ User Unblocked!", "success"); openUserDossier(uid); loadUsers(adminState.userPage); }
};
window.adminForceLogoutUser = async function(uid) {
    if (!confirm(`User #${uid} ko force logout karein?`)) return;
    const res = await adminApi("/api/admin/user/force_logout", "POST", { user_id: uid });
    if (res.ok) { adminToast("🚪 User Force Logged Out!", "success"); openUserDossier(uid); }
};
window.adminSetVip = async function(uid, badge) {
    const res = await adminApi("/api/admin/user/vip", "POST", { user_id: uid, badge });
    if (res.ok) { adminToast(`⭐ Badge updated!`, "success"); openUserDossier(uid); }
};
window.adminBanUserIp = async function(ip, uid) {
    if (!confirm(`Direct IP ${ip} ko ban karein?`)) return;
    const res = await adminApi("/api/admin/banned_ips", "POST", { ip, user_id: uid, reason: `Banned from User #${uid}` });
    if (res.ok) adminToast(`🌐 IP ${ip} Banned!`, "success");
};
window.adminSendPersonalMsg = async function(uid) {
    const title = document.getElementById("pmTitleInp").value.trim() || "Message from Admin";
    const message = document.getElementById("pmBodyInp").value.trim();
    if (!message) return adminToast("Message likhein pehle.", "warning");
    const res = await adminApi("/api/admin/user/message", "POST", { user_id: uid, title, message });
    if (res.ok) { adminToast("🔔 Message sent!", "success"); openUserDossier(uid); }
};

async function loadAnalytics() {
    const [topRes, testRes] = await Promise.all([
        adminApi("/api/admin/top_performers"),
        adminApi("/api/admin/test_analytics")
    ]);
    const tops = (topRes.data && topRes.data.performers) || [];
    document.getElementById("topPerformersList").innerHTML = tops.length ? tops.map((p, idx) => `
        <div onclick="openUserDossier('${esc(p.user_id)}')" class="p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 border border-sky-200/50 dark:border-slate-700 flex justify-between items-center gap-2 cursor-pointer">
            <div class="flex items-center gap-2.5 min-w-0">
                <span class="font-black text-indigo-700 w-7">${idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}</span>
                <div class="min-w-0">
                    <div class="font-black truncate">${esc(p.name)} ${esc(p.vip_badge)}</div>
                    <div class="text-[10px] opacity-65 font-bold">UID: ${esc(p.user_id)} • 🔥 ${p.streak}d • ⚡ ${p.weekly_xp || 0} XP</div>
                </div>
            </div>
            <div class="text-right shrink-0 font-black">
                <div class="text-blue-600">${p.tests_given} Tests</div>
                <div class="text-[10px] text-emerald-600">${p.avg_accuracy}% Acc</div>
            </div>
        </div>`).join("") : `<div class="py-6 text-center opacity-65 font-bold">No test attempts yet.</div>`;

    const tests = (testRes.data && testRes.data.tests) || [];
    document.getElementById("testAnalyticsList").innerHTML = tests.length ? tests.map(t => {
        const diffCls = t.difficulty === "Hard" ? "bg-rose-100 text-rose-800" : (t.difficulty === "Moderate" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800");
        return `
            <details class="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800 border border-sky-200/50 dark:border-slate-700">
                <summary class="cursor-pointer flex justify-between items-center gap-2 flex-wrap font-black">
                    <span>📝 ${esc(t.test_title)} (#${esc(t.test_id)})</span>
                    <div class="flex items-center gap-2"><span class="px-2 py-0.5 rounded-full ${diffCls} text-[10px]">${t.difficulty}</span><span class="text-blue-600">${t.attempts} Attempts • Avg ${t.avg_score}/${t.max_marks}</span></div>
                </summary>
                <div class="mt-3 space-y-1.5 pt-2 border-t border-sky-200/40">
                    ${(t.top_attempts || []).map((a, idx) => `<div class="p-2 rounded-lg bg-white dark:bg-slate-900 flex justify-between items-center gap-2"><span><strong>#${idx + 1}</strong> ${esc(a.user_name)} (UID: ${esc(a.user_id)}) — <strong>${a.score}</strong> (${a.accuracy}%)</span><button onclick="deleteLeaderboardScore('${esc(a.attempt_id)}', false)" class="px-2 py-1 rounded bg-rose-600 text-white text-[10px] font-black border-0 cursor-pointer">🗑 Delete</button></div>`).join("")}
                </div>
            </details>`;
    }).join("") : `<div class="py-6 text-center opacity-65 font-bold">No test analytics yet.</div>`;
}

window.deleteLeaderboardScore = async function(attemptId, fromDossier = false) {
    if (!confirm("Is score ko Leaderboard se permanently delete karein?")) return;
    const res = await adminApi(`/api/admin/test_attempt/${encodeURIComponent(attemptId)}`, "DELETE");
    if (res.ok) {
        adminToast("🗑 Score removed!", "success");
        if (fromDossier && adminState.currentDossier) openUserDossier(adminState.currentDossier.user.user_id);
        else loadAnalytics();
    }
};

async function loadCloudTokens() {
    const res = await adminApi("/api/admin/tokens");
    const list = (res.data && res.data.tokens) || [];
    document.getElementById("cloudTokensGrid").innerHTML = list.length ? list.map((t, i) => `
        <div class="admin-glass p-4 rounded-2xl flex flex-wrap justify-between items-center gap-3 text-xs">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">POOL #${i + 1}</span>
                    <span class="px-2 py-0.5 rounded-full ${t.is_expired ? "bg-rose-100 text-rose-800" : "bg-emerald-100 text-emerald-800"} text-[10px] font-black">${t.is_expired ? "⚠️ EXPIRED" : "✅ LIVE"}</span>
                    <span class="font-black">${esc(t.owner_name)} (UID: ${esc(t.userId)})</span>
                </div>
                <div class="font-mono text-[10px] opacity-70 truncate mt-1">${esc(t.token)}</div>
            </div>
            <button onclick="deletePoolToken('${esc(t.token)}', '${esc(t.userId)}')" class="px-3.5 py-2 rounded-xl bg-rose-600 text-white font-extrabold text-xs border-0 cursor-pointer shrink-0">🗑 Remove</button>
        </div>`).join("") : `<div class="admin-glass p-8 text-center text-xs font-bold opacity-70">Cloud Token Pool khaali hai.</div>`;
}

window.addManualPoolToken = async function() {
    const user_id = document.getElementById("newPoolUid").value.trim();
    const label = document.getElementById("newPoolLabel").value.trim() || "Manual Cloud";
    const token = document.getElementById("newPoolToken").value.trim();
    if (!token) return adminToast("JWT token paste karein.", "warning");
    const res = await adminApi("/api/admin/tokens", "POST", { user_id, label, token });
    if (res.ok) {
        document.getElementById("newPoolUid").value = ""; document.getElementById("newPoolLabel").value = ""; document.getElementById("newPoolToken").value = "";
        adminToast("✅ Token added!", "success"); loadCloudTokens();
    }
};
window.deletePoolToken = async function(token, uid) {
    if (!confirm(`UID #${uid} ka token Cloud Pool se hatayein?`)) return;
    const res = await adminApi("/api/admin/tokens", "DELETE", { token, user_id: uid });
    if (res.ok) { adminToast("🗑 Token removed!", "success"); loadCloudTokens(); }
};
window.cleanDeadCloudTokens = async function() {
    const res = await adminApi("/api/admin/tokens/clean_dead", "POST", {});
    if (res.ok) { adminToast(`🧹 Removed ${res.data.removed} dead tokens! (${res.data.kept} live)`, "success"); loadCloudTokens(); }
};

async function loadContentHub() {
    const [notRes, caRes, dqRes, schRes] = await Promise.all([
        adminApi("/api/admin/notices"), adminApi("/api/admin/ca_capsules"),
        adminApi("/api/admin/daily_quiz"), adminApi("/api/admin/scheduled_mocks")
    ]);
    const notices = (notRes.data && notRes.data.notices) || [];
    document.getElementById("noticesListBox").innerHTML = notices.map(n => `<div class="p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 flex justify-between items-start gap-2"><div><div class="font-black">${esc(n.title)} <span class="text-[10px] opacity-60">(${esc(n.level)})</span></div><div class="opacity-80">${esc(n.message)}</div></div><button onclick="deleteNotice('${esc(n.notice_id)}')" class="text-rose-600 font-black bg-transparent border-0 cursor-pointer">✕</button></div>`).join("") || `<div class="opacity-60 font-bold">No active notices.</div>`;
    const cas = (caRes.data && caRes.data.capsules) || [];
    document.getElementById("caCapsulesAdminList").innerHTML = cas.map(c => `<div class="p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 flex justify-between items-start gap-2"><div><div class="font-black">📰 ${esc(c.title)} <span class="text-[10px] text-blue-600">[${esc(c.category)} • ${esc(c.date)}]</span></div><div class="opacity-75 mt-1">${(c.points || []).length} points</div></div><button onclick="deleteCaCapsule('${esc(c.capsule_id)}')" class="text-rose-600 font-black bg-transparent border-0 cursor-pointer">✕</button></div>`).join("") || `<div class="opacity-60 font-bold">No CA capsules published yet.</div>`;
    const dq = dqRes.data && dqRes.data.quiz;
    if (dq && dq.questions) { document.getElementById("dqTitle").value = dq.title || "Daily 5-Min Rapid Quiz"; document.getElementById("dqJson").value = JSON.stringify(dq.questions, null, 2); }
    const schs = (schRes.data && schRes.data.mocks) || [];
    document.getElementById("scheduledMocksList").innerHTML = schs.map(s => `<div class="p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 flex justify-between items-center gap-2"><div><div class="font-black">🗓️ ${esc(s.title)}</div><div class="opacity-70 text-[10px]">Series #${esc(s.series_id)} • Test #${esc(s.test_id)} • Start: ${esc(s.start_time)}</div></div><button onclick="deleteScheduledMock('${esc(s.sched_id)}')" class="text-rose-600 font-black bg-transparent border-0 cursor-pointer">✕</button></div>`).join("") || `<div class="opacity-60 font-bold">No scheduled mocks.</div>`;
}

window.publishNotice = async function() {
    const title = document.getElementById("notTitle").value.trim(), message = document.getElementById("notMsg").value.trim(), level = document.getElementById("notLevel").value;
    if (!title || !message) return adminToast("Title & message required.", "warning");
    const res = await adminApi("/api/admin/notices", "POST", { title, message, level });
    if (res.ok) { document.getElementById("notTitle").value = ""; document.getElementById("notMsg").value = ""; adminToast("📢 Notice Published!", "success"); loadContentHub(); }
};
window.deleteNotice = async function(nid) { const res = await adminApi(`/api/admin/notices/${encodeURIComponent(nid)}`, "DELETE"); if (res.ok) { adminToast("🗑 Notice deleted.", "info"); loadContentHub(); } };
window.sendTargetedBroadcast = async function() {
    const target_group = document.getElementById("bcGroup").value, state_filter = document.getElementById("bcStateInp").value.trim(), title = document.getElementById("bcTitle").value.trim(), message = document.getElementById("bcMsg").value.trim();
    if (!title || !message) return adminToast("Title & message required.", "warning");
    const res = await adminApi("/api/admin/broadcast", "POST", { target_group, state_filter, title, message });
    if (res.ok) { document.getElementById("bcTitle").value = ""; document.getElementById("bcMsg").value = ""; adminToast(`🚀 Broadcast sent to ${res.data.sent_count} students!`, "success"); }
};
window.publishCaCapsule = async function() {
    const title = document.getElementById("caTitle").value.trim(), category = document.getElementById("caCat").value.trim() || "Current Affairs", points = document.getElementById("caPoints").value.split("\n").map(x => x.trim()).filter(Boolean);
    if (!title || !points.length) return adminToast("Title & points required.", "warning");
    const res = await adminApi("/api/admin/ca_capsules", "POST", { title, category, points });
    if (res.ok) { document.getElementById("caTitle").value = ""; document.getElementById("caPoints").value = ""; adminToast("📰 CA Capsule Published!", "success"); loadContentHub(); }
};
window.deleteCaCapsule = async function(cid) { const res = await adminApi(`/api/admin/ca_capsules/${encodeURIComponent(cid)}`, "DELETE"); if (res.ok) { adminToast("🗑 Capsule removed.", "info"); loadContentHub(); } };
window.publishDailyQuiz = async function() {
    const title = document.getElementById("dqTitle").value.trim() || "Daily 5-Min Rapid Quiz";
    try {
        const questions = JSON.parse(document.getElementById("dqJson").value);
        if (!Array.isArray(questions) || !questions.length) throw new Error();
        const res = await adminApi("/api/admin/daily_quiz", "POST", { title, questions });
        if (res.ok) adminToast(`⚡ Published ${questions.length} Daily Quiz Qs!`, "success");
    } catch { adminToast("Invalid JSON format!", "error"); }
};
window.publishScheduledMock = async function() {
    const payload = { title: document.getElementById("schTitle").value.trim(), series_id: document.getElementById("schSeriesId").value.trim(), test_id: document.getElementById("schTestId").value.trim(), start_time: document.getElementById("schStart").value, result_time: document.getElementById("schResult").value };
    if (!payload.title || !payload.test_id) return adminToast("Title & Test ID required.", "warning");
    const res = await adminApi("/api/admin/scheduled_mocks", "POST", payload);
    if (res.ok) { adminToast("🗓️ Scheduled Mock Published!", "success"); loadContentHub(); }
};
window.deleteScheduledMock = async function(sid) { const res = await adminApi(`/api/admin/scheduled_mocks/${encodeURIComponent(sid)}`, "DELETE"); if (res.ok) { adminToast("🗑 Schedule deleted.", "info"); loadContentHub(); } };

async function loadControls() {
    const res = await adminApi("/api/admin/settings");
    if (!res.ok || !res.data.settings) return;
    const s = res.data.settings, ks = s.kill_switches || {}, pp = s.promo_popup || {};
    document.getElementById("fullControlsBox").innerHTML = `
        <div><label class="font-extrabold">🔄 App Cache Version</label><input id="ctrlAppVersion" type="text" value="${esc(s.app_version || "v4.0")}" class="admin-input mt-1"></div>
        <div><label class="font-extrabold">🚧 Maintenance Message</label><input id="ctrlMaintMsg" type="text" value="${esc(s.maintenance_message || "")}" class="admin-input mt-1"></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer"><span class="font-black">🚧 Maintenance Mode</span><input id="ctrlMaintMode" type="checkbox" ${s.maintenance_mode ? "checked" : ""} class="w-4 h-4 accent-rose-600"></label>
            <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer"><span class="font-black">📱 Single-Device Guard</span><input id="ctrlSingleDev" type="checkbox" ${s.single_device_guard ? "checked" : ""} class="w-4 h-4 accent-blue-600"></label>
            <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer"><span class="font-black">📲 Allow New Logins</span><input id="ksNewLogin" type="checkbox" ${ks.new_login !== false ? "checked" : ""} class="w-4 h-4 accent-emerald-600"></label>
            <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer"><span class="font-black">🏆 Paid Test Series</span><input id="ksPaidTs" type="checkbox" ${ks.paid_test_series !== false ? "checked" : ""} class="w-4 h-4 accent-emerald-600"></label>
            <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer"><span class="font-black">📄 PDF Viewer</span><input id="ksPdf" type="checkbox" ${ks.pdf_viewer !== false ? "checked" : ""} class="w-4 h-4 accent-emerald-600"></label>
            <label class="flex items-center justify-between p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800 cursor-pointer"><span class="font-black">🧠 Pro Vault</span><input id="ksVault" type="checkbox" ${ks.pro_vault !== false ? "checked" : ""} class="w-4 h-4 accent-emerald-600"></label>
        </div>
        <button onclick="saveFullControls()" class="admin-btn-primary w-full py-2.5 text-xs">💾 Save All Switches & Version</button>`;
    document.getElementById("promoEnabled").checked = Boolean(pp.enabled);
    document.getElementById("promoTitle").value = pp.title || "";
    document.getElementById("promoMsg").value = pp.message || "";
    document.getElementById("promoImg").value = pp.image_url || "";
    document.getElementById("promoBtnTxt").value = pp.btn_text || "Open Now";
    document.getElementById("promoBtnUrl").value = pp.btn_url || "";
}

window.saveFullControls = async function() {
    const payload = {
        app_version: document.getElementById("ctrlAppVersion").value.trim() || "v4.0",
        maintenance_message: document.getElementById("ctrlMaintMsg").value.trim(),
        maintenance_mode: document.getElementById("ctrlMaintMode").checked,
        single_device_guard: document.getElementById("ctrlSingleDev").checked,
        kill_switches: {
            new_login: document.getElementById("ksNewLogin").checked,
            paid_test_series: document.getElementById("ksPaidTs").checked,
            pdf_viewer: document.getElementById("ksPdf").checked,
            pro_vault: document.getElementById("ksVault").checked
        }
    };
    const res = await adminApi("/api/admin/settings", "POST", payload);
    if (res.ok) adminToast("✅ Controls Saved!", "success");
};
window.savePromoPopupSettings = async function() {
    const promo_popup = {
        enabled: document.getElementById("promoEnabled").checked,
        title: document.getElementById("promoTitle").value.trim(),
        message: document.getElementById("promoMsg").value.trim(),
        image_url: document.getElementById("promoImg").value.trim(),
        btn_text: document.getElementById("promoBtnTxt").value.trim() || "Open Now",
        btn_url: document.getElementById("promoBtnUrl").value.trim()
    };
    const res = await adminApi("/api/admin/settings", "POST", { promo_popup });
    if (res.ok) adminToast("🎁 Promo Popup Updated!", "success");
};

async function loadReports() {
    const res = await adminApi("/api/admin/reports");
    const reps = (res.data && res.data.reports) || [];
    document.getElementById("reportsListBox").innerHTML = reps.length ? reps.map(r => `
        <div class="p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800 border border-sky-200/50 dark:border-slate-700 space-y-2">
            <div class="flex justify-between items-start gap-2 flex-wrap">
                <div><span class="px-2 py-0.5 rounded-full ${r.status === "RESOLVED" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"} text-[10px] font-black">${esc(r.status)}</span> <span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black">${esc(r.type)}</span> <strong class="ml-1 text-sm">${esc(r.subject)}</strong></div>
                <span class="opacity-60 font-bold text-[10px]">${esc(r.created_at)}</span>
            </div>
            <div class="font-bold opacity-85">${esc(r.message)}</div>
            <div class="text-[11px] opacity-70 font-bold">Student: <span class="underline cursor-pointer text-blue-600" onclick="openUserDossier('${esc(r.user_id)}')">${esc(r.user_name)} (UID: ${esc(r.user_id)})</span></div>
            ${r.status === "RESOLVED" ? `<div class="p-2 rounded-xl bg-emerald-50 text-emerald-800 font-bold">✅ Reply: ${esc(r.admin_reply)}</div>` : `<div class="flex gap-2 pt-1"><input id="repReply_${esc(r.report_id)}" type="text" placeholder="Reply likhein..." class="admin-input flex-1"><button onclick="replyResolveReport('${esc(r.report_id)}')" class="px-4 py-2 rounded-xl bg-emerald-600 text-white font-extrabold border-0 cursor-pointer shrink-0">📨 Reply & Resolve</button></div>`}
        </div>`).join("") : `<div class="py-8 text-center opacity-65 font-bold">No reports found.</div>`;
}
window.replyResolveReport = async function(rid) {
    const reply = (document.getElementById(`repReply_${rid}`)?.value || "").trim() || "Resolved by Admin!";
    const res = await adminApi(`/api/admin/reports/${encodeURIComponent(rid)}/resolve`, "POST", { reply });
    if (res.ok) { adminToast("📨 Reply sent & resolved!", "success"); loadReports(); }
};

async function loadSecurityTab() {
    const [ipRes, errRes, audRes] = await Promise.all([
        adminApi("/api/admin/banned_ips"), adminApi("/api/admin/errors"), adminApi("/api/admin/audit_logs")
    ]);
    const ips = (ipRes.data && ipRes.data.ips) || [];
    document.getElementById("bannedIpsList").innerHTML = ips.length ? ips.map(x => `<div class="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex justify-between items-center"><div><strong class="font-mono">${esc(x.ip)}</strong> — ${esc(x.reason)}</div><button onclick="unbanIp('${esc(x.ip)}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black border-0 cursor-pointer">Unban</button></div>`).join("") : `<div class="opacity-60 font-bold">No banned IPs.</div>`;
    const errs = (errRes.data && errRes.data.errors) || [];
    document.getElementById("errorLogsBox").innerHTML = errs.length ? errs.map(e => `<div class="p-2.5 rounded-xl bg-rose-50/70 dark:bg-slate-800 border border-rose-200/50"><div class="flex justify-between font-black text-rose-700"><span>${esc(e.source)} (${esc(e.user_id)})</span><span class="opacity-60">${esc(e.time_str)}</span></div><div class="mt-0.5 break-all opacity-85">${esc(e.message)}</div></div>`).join("") : `<div class="opacity-60 font-bold">Zero errors logged! 🎉</div>`;
    const auds = (audRes.data && audRes.data.logs) || [];
    document.getElementById("auditLogsBox").innerHTML = auds.length ? auds.map(a => `<div class="p-2.5 rounded-xl bg-sky-50/70 dark:bg-slate-800 border border-sky-200/40"><div class="flex justify-between font-black"><span>${esc(a.action)}</span><span class="opacity-60">${esc(a.time_str)}</span></div><div class="opacity-80 mt-0.5">${esc(a.detail)}</div></div>`).join("") : `<div class="opacity-60 font-bold">No audit records yet.</div>`;
}

window.runDiagnostics = async function() {
    const box = document.getElementById("diagnosticsBox");
    box.innerHTML = `🔄 Pinging all User DB Shards, Content Vault DBs, Cloudflare Worker & RWA API...`;
    const res = await adminApi("/api/admin/diagnostics");
    if (!res.ok || !res.data.diag) { box.textContent = "Diagnostics failed."; return; }
    const d = res.data.diag, rows = [...(d.shards || []), ...(d.externals || [])];
    const rc = d.ram_cache || {};
    box.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            ${rows.map(r => `<div class="p-3 rounded-xl border ${r.ok ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-rose-50 border-rose-300 text-rose-900"}"><div class="font-black">${r.ok ? "🟢" : "🔴"} ${esc(r.name)}</div><div class="text-[11px] font-bold mt-0.5">${r.ok ? `Latency: ${r.latency_ms} ms ${r.size_mb !== undefined ? `• ${r.size_mb} MB` : ""}` : esc(r.error || "Offline")}</div></div>`).join("")}
        </div>
        <div class="text-[10px] opacity-70 mt-2 font-bold">Checked: ${esc(d.checked_at)} • RAM Cache: ${rc.cached_keys || 0} keys (${rc.hits || 0} hits / ${rc.misses || 0} misses) • Shield: ${d.strict_security ? "ON" : "OFF"}</div>`;
};

window.banIpManual = async function() {
    const ip = document.getElementById("banIpInput").value.trim(), reason = document.getElementById("banIpReason").value.trim() || "Manual IP Ban";
    if (!ip) return adminToast("IP address dalein.", "warning");
    const res = await adminApi("/api/admin/banned_ips", "POST", { ip, reason });
    if (res.ok) { document.getElementById("banIpInput").value = ""; adminToast(`🚫 IP ${ip} Banned!`, "success"); loadSecurityTab(); }
};
window.unbanIp = async function(ip) { const res = await adminApi("/api/admin/banned_ips", "DELETE", { ip }); if (res.ok) { adminToast(`✅ IP ${ip} Unbanned!`, "success"); loadSecurityTab(); } };
window.clearErrorLogs = async function() { if (!confirm("Clear all error logs?")) return; const res = await adminApi("/api/admin/errors", "DELETE"); if (res.ok) { adminToast("🗑 Error logs cleared.", "info"); loadSecurityTab(); } };

window.exportUsersCsvFile = async function() {
    const res = await adminApi("/api/admin/export_csv");
    if (!res.ok || !res.data.csv) return adminToast("Export failed.", "error");
    const blob = new Blob([res.data.csv], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `rwa_users_${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    adminToast("📊 Users CSV Downloaded!", "success");
};

window.downloadClusterBackup = async function() {
    const res = await adminApi("/api/admin/backup");
    if (!res.ok) return adminToast("Backup failed.", "error");
    const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `rwa_cluster_encrypted_backup_${new Date().toISOString().slice(0, 10)}.json`; a.click();
    adminToast("💾 Encrypted Backup Downloaded!", "success");
};

if (adminState.token) {
    showAdminWorkspace();
}
