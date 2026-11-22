// =========================================================
// RWA SKY PRO - MASTER WEB ADMIN PANEL ENGINE (admin.js)
// =========================================================

let ADMIN_API_BASE = localStorage.getItem("rwa_admin_api_base") || "https://pdfsownlaoder.onrender.com";
let ADMIN_KEY = localStorage.getItem("rwa_admin_key") || sessionStorage.getItem("rwa_admin_key") || "";

let adminState = {
    activeTab: "dashboard",
    userPage: 1,
    userFilter: "all",
    activeDossier: null,
    activeModalTab: "profile",
    activityTimer: null
};

const TAB_TITLES = {
    dashboard: "📊 Overview & 4-MongoDB Cluster",
    users: "👥 All Users & A-to-Z Inspector",
    activity: "🔴 Global Live Activity Feed",
    tokens: "🔑 Cloud Token Pool Manager",
    controls: "🛠️ Maintenance & Alert Controls",
    notices: "📢 Live Notice Board Manager",
    reports: "🚩 User Reports & Batch Requests",
    errors: "🐞 System & Portal Error Logs Folder",
    backup: "💾 Full 4-DB JSON Cluster Backup"
};

function escHtml(str) {
    return String(str ?? "N/A")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function fmtDur(sec) {
    const s = parseInt(sec || 0, 10);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m ${s % 60}s`;
}

function showToast(msg, type = "info") {
    const stack = document.getElementById("toastStack");
    if (!stack) return;
    const colors = {
        success: "bg-emerald-600",
        error: "bg-rose-600",
        info: "bg-blue-600",
        warning: "bg-amber-600"
    };
    const el = document.createElement("div");
    el.className = `toast-item ${colors[type] || colors.info}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 3500);
}

async function adminFetch(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        "X-Admin-Key": ADMIN_KEY,
        ...(options.headers || {})
    };
    try {
        const res = await fetch(`${ADMIN_API_BASE}${path}`, { ...options, headers });
        if (res.status === 401) {
            logoutAdmin(false);
            showToast("Session expired ya invalid Admin Key!", "error");
            return null;
        }
        return await res.json();
    } catch {
        showToast("Backend server se connect nahi ho paya. Thodi der baad retry karein.", "error");
        return null;
    }
}

// =========================================================
// AUTH & INITIALIZATION
// =========================================================
async function verifyAdminLogin() {
    const keyVal = document.getElementById("adminKeyInput").value.trim();
    const srvVal = document.getElementById("adminServerInput").value.trim().replace(/\/+$/, "");
    const remember = document.getElementById("rememberAdminKey").checked;

    if (!keyVal) {
        showToast("Kripya Admin Secret Key enter karein.", "warning");
        return;
    }

    const btn = document.getElementById("adminLoginBtn");
    btn.disabled = true;
    btn.textContent = "🔄 Verifying Admin Key...";

    ADMIN_KEY = keyVal;
    if (srvVal) {
        ADMIN_API_BASE = srvVal;
        localStorage.setItem("rwa_admin_api_base", srvVal);
    }

    const res = await adminFetch("/api/admin/auth", { method: "POST" });
    btn.disabled = false;
    btn.textContent = "🔓 Unlock Admin Dashboard";

    if (res && res.status === "success") {
        if (remember) localStorage.setItem("rwa_admin_key", ADMIN_KEY);
        else sessionStorage.setItem("rwa_admin_key", ADMIN_KEY);

        document.getElementById("adminLoginOverlay").classList.add("hidden");
        document.getElementById("adminShell").classList.remove("hidden");
        showToast("✅ Welcome to RWA Master Admin Panel!", "success");
        switchAdminTab("dashboard");
    } else {
        ADMIN_KEY = "";
        showToast("❌ Galat Admin Secret Key!", "error");
    }
}

function logoutAdmin(showMsg = true) {
    localStorage.removeItem("rwa_admin_key");
    sessionStorage.removeItem("rwa_admin_key");
    ADMIN_KEY = "";
    if (adminState.activityTimer) clearInterval(adminState.activityTimer);
    document.getElementById("adminShell").classList.add("hidden");
    document.getElementById("adminLoginOverlay").classList.remove("hidden");
    if (showMsg) showToast("🔒 Admin Panel Locked.", "info");
}

function toggleMobileSidebar(open) {
    const sb = document.getElementById("adminSidebar");
    const bd = document.getElementById("sidebarBackdrop");
    if (open) {
        sb.classList.add("open");
        bd.classList.remove("hidden");
    } else {
        sb.classList.remove("open");
        bd.classList.add("hidden");
    }
}

function toggleAdminTheme() {
    const isDark = document.body.classList.toggle("dark-mode");
    localStorage.setItem("rwa_admin_dark", isDark ? "1" : "0");
    document.getElementById("themeToggleBtn").textContent = isDark ? "☀️ Asmani Sky Mode" : "🌙 Dark Mode";
}

function switchAdminTab(tab) {
    adminState.activeTab = tab;
    toggleMobileSidebar(false);

    document.querySelectorAll(".admin-tab-section").forEach(el => el.classList.add("hidden"));
    const target = document.getElementById(`tab_${tab}`);
    if (target) target.classList.remove("hidden");

    document.querySelectorAll(".side-nav-btn[data-tab]").forEach(b => {
        b.classList.toggle("active", b.dataset.tab === tab);
    });

    document.getElementById("activeTabTitle").textContent = TAB_TITLES[tab] || "Admin Panel";
    refreshCurrentTab();
}

function refreshCurrentTab() {
    const t = adminState.activeTab;
    if (t === "dashboard") loadDashboard();
    else if (t === "users") loadUsers(adminState.userPage);
    else if (t === "activity") loadGlobalActivity();
    else if (t === "tokens") loadTokenPool();
    else if (t === "controls") loadControlsTab();
    else if (t === "notices") loadNoticesTab();
    else if (t === "reports") loadReportsTab();
    else if (t === "errors") loadErrorsTab();
}

// =========================================================
// 1. OVERVIEW DASHBOARD & 4-MONGODB METERS
// =========================================================
async function loadDashboard() {
    const [statsRes, actRes] = await Promise.all([
        adminFetch("/api/admin/stats"),
        adminFetch("/api/admin/activities?limit=12")
    ]);
    if (!statsRes || statsRes.status !== "success") return;

    const s = statsRes.stats;
    const cfg = s.settings || {};

    document.getElementById("lastSyncTime").textContent = `Updated: ${s.updated_at || "Just now"}`;
    document.getElementById("connectedDbsBadge").textContent = `${s.connected_dbs} / 4 DBs Active`;
    document.getElementById("maintHeaderBadge").classList.toggle("hidden", !cfg.maintenance_mode);

    const kpis = [
        { icon: "👥", label: "Total Users", val: s.total_users, color: "text-blue-600" },
        { icon: "🟢", label: "Active Today", val: s.active_today, color: "text-emerald-600" },
        { icon: "🚫", label: "Blocked", val: s.blocked_users, color: "text-rose-600" },
        { icon: "📝", label: "Tests Given", val: s.total_tests, color: "text-indigo-600" },
        { icon: "🔑", label: "Cloud Tokens", val: s.total_admin_tokens, color: "text-amber-600" },
        { icon: "🚩", label: "Reports / Errs", val: `${s.open_reports} / ${s.error_logs_count}`, color: "text-purple-600" }
    ];

    document.getElementById("kpiGrid").innerHTML = kpis.map(k => `
        <div class="kpi-card">
            <div class="text-2xl">${k.icon}</div>
            <div class="text-2xl font-black mt-1 ${k.color}">${k.val}</div>
            <div class="text-[11px] font-bold opacity-70 uppercase mt-0.5">${k.label}</div>
        </div>`).join("");

    // 4-DB Shards Grid
    const shards = s.per_db || [];
    document.getElementById("shardsGrid").innerHTML = shards.length ? shards.map(d => {
        if (d.error) {
            return `<div class="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-300 font-bold text-xs text-rose-700">${d.label}: ❌ Connection Error</div>`;
        }
        const pct = Math.min(100, Math.round((d.size_mb / d.max_mb) * 100));
        const barColor = pct > 80 ? "#e11d48" : pct > 55 ? "#f59e0b" : "#10b981";
        return `
            <div class="p-4 rounded-2xl bg-sky-50/80 dark:bg-slate-800/70 border border-sky-200 dark:border-slate-700">
                <div class="flex justify-between items-center mb-2">
                    <span class="font-black text-sm">${d.label}</span>
                    <span class="text-xs font-extrabold">${d.size_mb} / 512 MB (${pct}%)</span>
                </div>
                <div class="shard-bar-track mb-2.5">
                    <div class="shard-bar-fill" style="width:${pct}%; background:${barColor};"></div>
                </div>
                <div class="flex justify-between text-[11px] font-bold opacity-80">
                    <span>👤 ${d.users} Users</span>
                    <span>📝 ${d.tests} Tests</span>
                </div>
            </div>`;
    }).join("") : `<div class="col-span-full text-xs font-bold text-rose-600">No MongoDB shards connected.</div>`;

    // Quick Switches
    document.getElementById("quickSwitchesBox").innerHTML = `
        <div class="flex items-center justify-between p-3.5 rounded-2xl bg-rose-50/80 dark:bg-slate-800/70 border border-rose-200/70">
            <div>
                <div class="font-extrabold text-xs">🚧 Maintenance Mode</div>
                <div class="text-[11px] opacity-70">${cfg.maintenance_mode ? "Portal is LOCKED for users" : "Portal is LIVE"}</div>
            </div>
            <input type="checkbox" class="toggle-switch" ${cfg.maintenance_mode ? "checked" : ""} onchange="quickToggleSetting('maintenance_mode', this.checked)">
        </div>
        <div class="flex items-center justify-between p-3.5 rounded-2xl bg-sky-50/80 dark:bg-slate-800/70 border border-sky-200/70">
            <div>
                <div class="font-extrabold text-xs">🔔 Telegram Login Alerts</div>
                <div class="text-[11px] opacity-70">Notify on every new login</div>
            </div>
            <input type="checkbox" class="toggle-switch" ${cfg.login_alerts ? "checked" : ""} onchange="quickToggleSetting('login_alerts', this.checked)">
        </div>
        <div class="flex items-center justify-between p-3.5 rounded-2xl bg-sky-50/80 dark:bg-slate-800/70 border border-sky-200/70">
            <div>
                <div class="font-extrabold text-xs">📝 Telegram Test Submit Alerts</div>
                <div class="text-[11px] opacity-70">Notify when a student submits a mock test</div>
            </div>
            <input type="checkbox" class="toggle-switch" ${cfg.test_submit_alerts ? "checked" : ""} onchange="quickToggleSetting('test_submit_alerts', this.checked)">
        </div>`;

    // Mini Activity Feed
    const acts = (actRes && actRes.activities) || [];
    document.getElementById("miniActivityBox").innerHTML = acts.length ? acts.map(a => `
        <div onclick="openUserDossier('${escHtml(a.user_id)}')" class="p-2.5 rounded-xl bg-sky-50/70 dark:bg-slate-800/60 border border-sky-200/60 cursor-pointer hover:border-blue-500">
            <div class="flex justify-between items-center text-xs">
                <span class="font-black truncate">${escHtml(a.user_name)} <span class="opacity-60 font-mono">#${escHtml(a.user_id)}</span></span>
                <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black">${escHtml(a.action)}</span>
            </div>
            <div class="text-[11px] opacity-80 truncate mt-0.5">${escHtml(a.detail)}</div>
            <div class="text-[10px] opacity-55 mt-0.5">🕒 ${escHtml(a.time_str)}</div>
        </div>`).join("") : `<div class="text-xs opacity-70 text-center py-6">No recent activity yet.</div>`;
}

async function quickToggleSetting(key, val) {
    const res = await adminFetch("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify({ [key]: val })
    });
    if (res && res.status === "success") {
        showToast("✅ Setting Updated!", "success");
        loadDashboard();
    }
}

// =========================================================
// 2. USERS LIST & A-TO-Z INSPECTOR MODAL
// =========================================================
function setUserFilter(mode, btn) {
    adminState.userFilter = mode;
    document.querySelectorAll(".u-filter-pill").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");
    loadUsers(1);
}

async function loadUsers(page = 1) {
    adminState.userPage = page;
    const q = encodeURIComponent(document.getElementById("userSearchInput").value.trim());
    const box = document.getElementById("usersListContainer");
    box.innerHTML = `<div class="col-span-full py-10 text-center font-bold opacity-70">🔄 Loading users across 4 MongoDB shards...</div>`;

    const res = await adminFetch(`/api/admin/users?page=${page}&per_page=12&q=${q}&filter=${adminState.userFilter}`);
    if (!res || res.status !== "success") return;

    const users = res.users || [];
    if (!users.length) {
        box.innerHTML = `<div class="col-span-full admin-glass-card p-8 rounded-3xl text-center font-bold opacity-70">Koi user nahi mila.</div>`;
        document.getElementById("usersPagination").innerHTML = "";
        return;
    }

    box.innerHTML = users.map(u => {
        const cCnt = (u.purchased_courses || []).length;
        const blkBadge = u.is_blocked
            ? `<span class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[10px] font-black">🚫 BLOCKED</span>`
            : `<span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-black">● ACTIVE</span>`;
        return `
            <div onclick="openUserDossier('${escHtml(u.user_id)}')" class="admin-glass-card p-4 rounded-2xl cursor-pointer hover:border-blue-500 transition flex flex-col justify-between gap-3">
                <div>
                    <div class="flex justify-between items-center gap-2">
                        <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-black">${escHtml(u.db_shard || "DB-1")}</span>
                        ${blkBadge}
                    </div>
                    <h4 class="font-black text-base mt-2 truncate">${escHtml(u.name)}</h4>
                    <div class="text-xs opacity-75 font-mono">UID: ${escHtml(u.user_id)} • 📱 ${escHtml(u.phone)}</div>
                    <div class="text-[11px] opacity-70 truncate mt-1">⚡ ${escHtml(u.current_activity || "Idle")}</div>
                </div>
                <div class="flex justify-between items-center pt-2.5 border-t border-sky-200/50 text-[11px] font-extrabold">
                    <span>🎓 ${cCnt} Courses • 🔥 ${u.study_streak || 1}d</span>
                    <span class="text-blue-600">Inspect A-Z ➔</span>
                </div>
            </div>`;
    }).join("");

    const totalPages = Math.max(1, Math.ceil((res.total || 0) / 12));
    document.getElementById("usersPagination").innerHTML = `
        <button ${page <= 1 ? "disabled" : ""} onclick="loadUsers(${page - 1})" class="admin-btn-soft text-xs disabled:opacity-40">⬅ Prev</button>
        <span class="text-xs font-extrabold">Page ${page} / ${totalPages} (${res.total} Users)</span>
        <button ${page >= totalPages ? "disabled" : ""} onclick="loadUsers(${page + 1})" class="admin-btn-soft text-xs disabled:opacity-40">Next ➡</button>`;
}

async function openUserDossier(uid) {
    document.getElementById("userDossierModal").classList.remove("hidden");
    document.getElementById("modalBodyContent").innerHTML = `<div class="py-12 text-center font-bold opacity-70">🔄 Fetching A-to-Z User Data...</div>`;

    const res = await adminFetch(`/api/admin/user/${encodeURIComponent(uid)}`);
    if (!res || res.status !== "success") {
        closeUserModal();
        return;
    }

    adminState.activeDossier = res.dossier;
    const u = res.dossier.user || {};
    document.getElementById("modalUserShard").textContent = `${res.dossier.shard} • UID ${u.user_id}`;
    document.getElementById("modalUserName").textContent = `${u.name || "User"} ${u.is_blocked ? "(🚫 BLOCKED)" : ""}`;
    document.getElementById("modalExportBtn").onclick = () => downloadJsonFile(res.dossier, `User_${u.user_id}_Dossier.json`);

    const firstTab = document.querySelector(".m-tab-btn");
    switchModalTab("profile", firstTab);
}

function closeUserModal() {
    document.getElementById("userDossierModal").classList.add("hidden");
}

function switchModalTab(tab, btn) {
    adminState.activeModalTab = tab;
    document.querySelectorAll(".m-tab-btn").forEach(b => b.classList.remove("active"));
    if (btn) btn.classList.add("active");

    const d = adminState.activeDossier;
    if (!d) return;
    const u = d.user || {};
    const sync = d.sync || {};
    const body = document.getElementById("modalBodyContent");

    if (tab === "profile") {
        const isBlk = Boolean(u.is_blocked);
        const notesCnt = Object.values(sync.video_notes || {}).reduce((a, b) => a + (Array.isArray(b) ? b.length : 0), 0);
        body.innerHTML = `
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                <div class="p-3 rounded-2xl bg-sky-50 dark:bg-slate-800"><div class="text-lg font-black">${(u.purchased_courses || []).length}</div><div class="text-[10px] font-bold opacity-70">Courses</div></div>
                <div class="p-3 rounded-2xl bg-sky-50 dark:bg-slate-800"><div class="text-lg font-black">${fmtDur(u.total_watch_seconds)}</div><div class="text-[10px] font-bold opacity-70">Watch Time</div></div>
                <div class="p-3 rounded-2xl bg-sky-50 dark:bg-slate-800"><div class="text-lg font-black">${(d.tests || []).length}</div><div class="text-[10px] font-bold opacity-70">Tests</div></div>
                <div class="p-3 rounded-2xl bg-sky-50 dark:bg-slate-800"><div class="text-lg font-black">🔥 ${u.study_streak || 1}d</div><div class="text-[10px] font-bold opacity-70">Streak</div></div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs p-4 rounded-2xl bg-sky-50/70 dark:bg-slate-800/60 border border-sky-200/60">
                <div><b>📱 Phone:</b> <span class="font-mono">${escHtml(u.phone)}</span></div>
                <div><b>📧 Email:</b> <span class="break-all">${escHtml(u.email)}</span></div>
                <div><b>🔐 Password:</b> <span class="font-mono text-rose-600 font-black">${escHtml(u.password)}</span></div>
                <div><b>🔑 Method:</b> ${escHtml(u.login_method)} (#${u.login_count || 1})</div>
                <div><b>🏛️ State/Dist:</b> ${escHtml(u.state_district)}</div>
                <div><b>👤 Cat/Gender:</b> ${escHtml(u.category_gender)}</div>
                <div><b>🕒 Last Seen:</b> ${escHtml(u.last_seen)}</div>
                <div><b>📚 Sync Stats:</b> ⭐ ${(sync.bookmarks || []).length} | ❌ ${(sync.mistake_bank || []).length} | 🗒️ ${notesCnt}</div>
            </div>

            <div class="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300/60 space-y-2">
                <div class="flex flex-wrap justify-between items-center gap-2">
                    <span class="text-xs font-black text-amber-800 dark:text-amber-300">🔑 User JWT Authorization Token</span>
                    <div class="flex gap-2">
                        <button onclick="navigator.clipboard.writeText('${escHtml(u.jwt_token || "")}'); showToast('Token Copied!', 'success');" class="px-2.5 py-1 rounded-lg bg-amber-500 text-white font-extrabold text-[11px] border-0 cursor-pointer">📋 Copy</button>
                        <button onclick="promoteUserToken('${escHtml(u.user_id)}', '${escHtml(u.name)}', '${escHtml(u.jwt_token || "")}')" class="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[11px] border-0 cursor-pointer">➕ Add to Cloud Pool</button>
                    </div>
                </div>
                <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 font-mono text-[10px] break-all max-h-24 overflow-y-auto">${escHtml(u.jwt_token || "N/A")}</div>
            </div>

            <div class="p-4 rounded-2xl ${isBlk ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300" : "bg-rose-50 dark:bg-rose-950/30 border-rose-300"} border flex flex-wrap justify-between items-center gap-3">
                <div class="text-xs">
                    <div class="font-black">${isBlk ? "🚫 User is Currently BLOCKED" : "🛡️ Account Access Control"}</div>
                    <div class="opacity-80">${isBlk ? "Reason: " + escHtml(u.block_reason) : "Block karne par student portal access nahi kar payega."}</div>
                </div>
                <button onclick="toggleBlockUser('${escHtml(u.user_id)}', ${!isBlk})" class="px-4 py-2 rounded-xl ${isBlk ? "bg-emerald-600" : "bg-rose-600"} text-white font-extrabold text-xs border-0 cursor-pointer">
                    ${isBlk ? "✅ Unblock User" : "🚫 Block User"}
                </button>
            </div>`;
    } else if (tab === "courses") {
        const courses = u.purchased_courses || [];
        body.innerHTML = courses.length ? courses.map((c, i) => `
            <div class="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-slate-800/70 border border-sky-200/60 flex justify-between items-center">
                <div>
                    <div class="font-black text-sm">${i + 1}. ${escHtml(c.course_name)}</div>
                    <div class="text-[11px] opacity-70 font-mono">Batch ID: ${escHtml(c.id)} • Test Series: ${escHtml(c.test_series_id || "N/A")}</div>
                </div>
                <span class="px-2.5 py-1 rounded-full bg-blue-100 text-blue-800 text-[10px] font-black uppercase">${escHtml(c.source || "own")}</span>
            </div>`).join("") : `<div class="py-8 text-center text-xs font-bold opacity-70">Abhi tak koi course sync nahi hua hai.</div>`;
    } else if (tab === "activity") {
        const logs = d.logs || [];
        body.innerHTML = logs.length ? logs.map(l => `
            <div class="p-3 rounded-xl bg-sky-50/70 dark:bg-slate-800/70 border border-sky-200/50 text-xs">
                <div class="flex justify-between items-center">
                    <span class="px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-black">${escHtml(l.action)}</span>
                    <span class="text-[10px] opacity-65">🕒 ${escHtml(l.time_str)}</span>
                </div>
                <div class="font-semibold mt-1">${escHtml(l.detail)}</div>
            </div>`).join("") : `<div class="py-8 text-center text-xs font-bold opacity-70">No activity logs yet.</div>`;
    } else if (tab === "tests") {
        const tests = d.tests || [];
        body.innerHTML = tests.length ? tests.map(t => `
            <div class="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-slate-800/70 border border-sky-200/60 flex flex-wrap justify-between items-center gap-2">
                <div>
                    <div class="font-black text-sm">${escHtml(t.test_title)}</div>
                    <div class="text-[11px] opacity-70">✓ ${t.correct} | ✕ ${t.incorrect} | − ${t.unattempted} | 🕒 ${escHtml(t.submitted_at)}</div>
                </div>
                <div class="text-right">
                    <div class="font-black text-base text-blue-600">${t.score} / ${t.max_marks}</div>
                    <div class="text-[11px] font-extrabold text-emerald-600">🎯 ${t.accuracy}% Acc</div>
                </div>
            </div>`).join("") : `<div class="py-8 text-center text-xs font-bold opacity-70">Is user ne abhi koi mock test submit nahi kiya.</div>`;
    }
}

async function toggleBlockUser(uid, shouldBlock) {
    let reason = "";
    if (shouldBlock) {
        reason = prompt("Block karne ka reason likhein (Optional):", "Policy Violation / Suspicious Activity");
        if (reason === null) return;
    }
    const res = await adminFetch("/api/admin/user/block", {
        method: "POST",
        body: JSON.stringify({ user_id: uid, blocked: shouldBlock, reason })
    });
    if (res && res.status === "success") {
        showToast(shouldBlock ? "🚫 User Blocked!" : "✅ User Unblocked!", shouldBlock ? "warning" : "success");
        openUserDossier(uid);
        if (adminState.activeTab === "users") loadUsers(adminState.userPage);
    }
}

async function promoteUserToken(uid, name, token) {
    if (!token) return showToast("User ka JWT token empty hai.", "error");
    const res = await adminFetch("/api/admin/tokens", {
        method: "POST",
        body: JSON.stringify({ user_id: uid, token, label: `Cloud #${uid} (${name})` })
    });
    if (res && res.status === "success") showToast("✅ Token Global Cloud Pool mein add ho gaya!", "success");
}

// =========================================================
// 3. LIVE GLOBAL ACTIVITY FEED
// =========================================================
async function loadGlobalActivity() {
    const res = await adminFetch("/api/admin/activities?limit=60");
    if (!res || res.status !== "success") return;
    const box = document.getElementById("globalActivityContainer");
    const acts = res.activities || [];
    box.innerHTML = acts.length ? acts.map(a => `
        <div onclick="openUserDossier('${escHtml(a.user_id)}')" class="admin-glass-card p-3.5 rounded-2xl cursor-pointer hover:border-blue-500 flex flex-wrap justify-between items-center gap-2">
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="px-2 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-black">${escHtml(a.action)}</span>
                    <span class="font-black text-sm">${escHtml(a.user_name)}</span>
                    <span class="text-xs opacity-65 font-mono">#${escHtml(a.user_id)} (${escHtml(a.db_shard)})</span>
                </div>
                <div class="text-xs opacity-85 mt-1">${escHtml(a.detail)}</div>
            </div>
            <div class="text-[11px] font-bold opacity-65 shrink-0">🕒 ${escHtml(a.time_str)}</div>
        </div>`).join("") : `<div class="admin-glass-card p-8 rounded-3xl text-center text-xs font-bold opacity-70">No activity yet.</div>`;
}

function toggleAutoRefreshActivity() {
    const on = document.getElementById("autoRefreshActToggle").checked;
    if (adminState.activityTimer) clearInterval(adminState.activityTimer);
    if (on) {
        adminState.activityTimer = setInterval(() => {
            if (adminState.activeTab === "activity") loadGlobalActivity();
        }, 15000);
        showToast("🔄 Auto-Refresh ON (15s)", "info");
    }
}

// =========================================================
// 4. CLOUD TOKEN POOL
// =========================================================
async function loadTokenPool() {
    const res = await adminFetch("/api/admin/tokens");
    if (!res || res.status !== "success") return;
    const toks = res.tokens || [];
    document.getElementById("poolCountSpan").textContent = toks.length;
    document.getElementById("tokenPoolList").innerHTML = toks.length ? toks.map((t, i) => `
        <div class="p-3.5 rounded-2xl bg-sky-50/70 dark:bg-slate-800/70 border border-sky-200/60 flex flex-wrap justify-between items-center gap-3">
            <div class="min-w-0 flex-1">
                <div class="font-black text-sm">#${i + 1} • ${escHtml(t.label)} <span class="text-xs font-mono opacity-70">(UID: ${escHtml(t.userId)})</span></div>
                <div class="font-mono text-[11px] opacity-70 truncate mt-0.5">${escHtml(t.token)}</div>
            </div>
            <div class="flex gap-2">
                <button onclick="navigator.clipboard.writeText('${escHtml(t.token)}'); showToast('Token Copied!', 'success');" class="admin-btn-soft text-xs">📋 Copy</button>
                <button onclick="deletePoolToken('${escHtml(t.userId)}', '${escHtml(t.token)}')" class="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-extrabold text-xs border-0 cursor-pointer">🗑 Delete</button>
            </div>
        </div>`).join("") : `<div class="text-xs opacity-70 py-4 text-center">Pool mein koi token nahi hai.</div>`;
}

async function addTokenToPool() {
    const uid = document.getElementById("poolUidInput").value.trim();
    const label = document.getElementById("poolLabelInput").value.trim();
    const token = document.getElementById("poolJwtInput").value.trim();
    if (!uid || !token) return showToast("User ID aur JWT Token dono dalein.", "warning");

    const res = await adminFetch("/api/admin/tokens", {
        method: "POST",
        body: JSON.stringify({ user_id: uid, label: label || `Cloud #${uid}`, token })
    });
    if (res && res.status === "success") {
        document.getElementById("poolUidInput").value = "";
        document.getElementById("poolLabelInput").value = "";
        document.getElementById("poolJwtInput").value = "";
        showToast("✅ Token Cloud Pool mein save ho gaya!", "success");
        loadTokenPool();
    }
}

async function deletePoolToken(uid, token) {
    if (!confirm(`Delete token for UID ${uid}?`)) return;
    const res = await adminFetch("/api/admin/tokens", {
        method: "DELETE",
        body: JSON.stringify({ user_id: uid, token })
    });
    if (res && res.status === "success") {
        showToast("🗑 Token Deleted!", "info");
        loadTokenPool();
    }
}

// =========================================================
// 5. PORTAL CONTROLS (MAINTENANCE + ALERTS)
// =========================================================
async function loadControlsTab() {
    const res = await adminFetch("/api/admin/settings");
    if (!res || res.status !== "success") return;
    const cfg = res.settings || {};
    document.getElementById("ctrlMaintToggle").checked = Boolean(cfg.maintenance_mode);
    document.getElementById("ctrlMaintMsg").value = cfg.maintenance_message || "";
    document.getElementById("ctrlLoginAlertToggle").checked = Boolean(cfg.login_alerts);
    document.getElementById("ctrlTestAlertToggle").checked = Boolean(cfg.test_submit_alerts);
    document.getElementById("maintHeaderBadge").classList.toggle("hidden", !cfg.maintenance_mode);
}

async function savePortalControls() {
    const payload = {
        maintenance_mode: document.getElementById("ctrlMaintToggle").checked,
        maintenance_message: document.getElementById("ctrlMaintMsg").value.trim(),
        login_alerts: document.getElementById("ctrlLoginAlertToggle").checked,
        test_submit_alerts: document.getElementById("ctrlTestAlertToggle").checked
    };
    const res = await adminFetch("/api/admin/settings", {
        method: "POST",
        body: JSON.stringify(payload)
    });
    if (res && res.status === "success") {
        document.getElementById("maintHeaderBadge").classList.toggle("hidden", !payload.maintenance_mode);
        showToast("✅ Portal Controls Saved Live!", "success");
    }
}

// =========================================================
// 6. NOTICE BOARD
// =========================================================
async function loadNoticesTab() {
    const res = await adminFetch("/api/admin/notices");
    if (!res || res.status !== "success") return;
    const list = res.notices || [];
    document.getElementById("noticesListContainer").innerHTML = list.length ? list.map(n => `
        <div class="admin-glass-card p-4 rounded-2xl flex flex-col justify-between gap-3">
            <div>
                <div class="flex justify-between items-center">
                    <span class="px-2 py-0.5 rounded bg-sky-100 text-sky-900 text-[10px] font-black uppercase">${escHtml(n.level)}</span>
                    <span class="text-[10px] opacity-65">🕒 ${escHtml(n.created_at)}</span>
                </div>
                <h4 class="font-black text-base mt-2">${escHtml(n.title)}</h4>
                <p class="text-xs opacity-80 mt-1">${escHtml(n.message)}</p>
            </div>
            <button onclick="deleteNoticeItem('${escHtml(n.notice_id)}')" class="self-end px-3 py-1.5 rounded-xl bg-rose-600 text-white font-extrabold text-xs border-0 cursor-pointer">🗑 Delete Notice</button>
        </div>`).join("") : `<div class="col-span-full admin-glass-card p-8 rounded-3xl text-center text-xs font-bold opacity-70">Koi active notice nahi hai.</div>`;
}

async function publishNotice() {
    const title = document.getElementById("noticeTitleInput").value.trim();
    const message = document.getElementById("noticeMsgInput").value.trim();
    const level = document.getElementById("noticeLevelInput").value;
    if (!title || !message) return showToast("Title aur Message dono dalein.", "warning");

    const res = await adminFetch("/api/admin/notices", {
        method: "POST",
        body: JSON.stringify({ title, message, level })
    });
    if (res && res.status === "success") {
        document.getElementById("noticeTitleInput").value = "";
        document.getElementById("noticeMsgInput").value = "";
        showToast("📢 Live Notice Published!", "success");
        loadNoticesTab();
    }
}

async function deleteNoticeItem(nid) {
    const res = await adminFetch(`/api/admin/notices/${encodeURIComponent(nid)}`, { method: "DELETE" });
    if (res && res.status === "success") {
        showToast("🗑 Notice Deleted.", "info");
        loadNoticesTab();
    }
}

// =========================================================
// 7. REPORTS & 8. ERROR LOGS & 9. BACKUP
// =========================================================
async function loadReportsTab() {
    const res = await adminFetch("/api/admin/reports");
    if (!res || res.status !== "success") return;
    const reps = res.reports || [];
    document.getElementById("reportsListContainer").innerHTML = reps.length ? reps.map(r => {
        const resolved = r.status === "RESOLVED";
        return `
            <div class="admin-glass-card p-4 rounded-2xl space-y-2">
                <div class="flex justify-between items-center">
                    <span class="px-2.5 py-0.5 rounded-full text-[10px] font-black ${resolved ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}">${escHtml(r.status)}</span>
                    <span class="text-[10px] opacity-65">🕒 ${escHtml(r.created_at)}</span>
                </div>
                <div class="font-black text-sm">[${escHtml(r.type)}] ${escHtml(r.subject)}</div>
                <div class="text-xs opacity-85">${escHtml(r.message)}</div>
                <div class="text-[11px] opacity-70 font-mono">👤 ${escHtml(r.user_name)} (#${escHtml(r.user_id)}) • 📱 ${escHtml(r.phone)}</div>
                ${!resolved ? `<button onclick="resolveReportItem('${escHtml(r.report_id)}')" class="admin-btn-primary px-4 py-1.5 text-xs">✅ Mark Resolved</button>` : ""}
            </div>`;
    }).join("") : `<div class="col-span-full admin-glass-card p-8 rounded-3xl text-center text-xs font-bold opacity-70">Koi report nahi hai.</div>`;
}

async function resolveReportItem(rid) {
    const res = await adminFetch(`/api/admin/reports/${encodeURIComponent(rid)}/resolve`, { method: "POST" });
    if (res && res.status === "success") {
        showToast("✅ Report Marked Resolved!", "success");
        loadReportsTab();
    }
}

async function loadErrorsTab() {
    const res = await adminFetch("/api/admin/errors");
    if (!res || res.status !== "success") return;
    const errs = res.errors || [];
    document.getElementById("errorLogsContainer").innerHTML = errs.length ? errs.map(e => `
        <div class="admin-glass-card p-4 rounded-2xl border-l-4 border-l-rose-500">
            <div class="flex justify-between items-center text-xs">
                <span class="font-black text-rose-600">[${escHtml(e.source)}] UID: ${escHtml(e.user_id)}</span>
                <span class="opacity-65">🕒 ${escHtml(e.time_str)}</span>
            </div>
            <div class="text-xs font-bold mt-1">${escHtml(e.message)}</div>
            ${e.stack ? `<pre class="mt-2 p-2 rounded-xl bg-slate-900 text-rose-300 text-[10px] overflow-x-auto">${escHtml(e.stack)}</pre>` : ""}
        </div>`).join("") : `<div class="admin-glass-card p-8 rounded-3xl text-center text-xs font-bold text-emerald-600">🟢 Koi error log nahi hai — Sab smooth chal raha hai!</div>`;
}

async function clearAllErrorLogs() {
    if (!confirm("Saare error logs delete kar dein?")) return;
    const res = await adminFetch("/api/admin/errors", { method: "DELETE" });
    if (res && res.status === "success") {
        showToast("🗑 Error Logs Cleared!", "info");
        loadErrorsTab();
    }
}

async function downloadFullBackup() {
    showToast("⏳ Chaaron DBs ka full backup taiyaar ho raha hai...", "info");
    const data = await adminFetch("/api/admin/backup");
    if (data && data.shards) {
        downloadJsonFile(data, `RWA_4DB_Cluster_Backup_${Date.now()}.json`);
        showToast("✅ Backup Download Started!", "success");
    }
}

function downloadJsonFile(obj, filename) {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// =========================================================
// AUTO-START ON PAGE LOAD
// =========================================================
(async function initAdminPanel() {
    if (localStorage.getItem("rwa_admin_dark") === "1") {
        document.body.classList.add("dark-mode");
        const tb = document.getElementById("themeToggleBtn");
        if (tb) tb.textContent = "☀️ Asmani Sky Mode";
    }
    document.getElementById("adminServerInput").value = ADMIN_API_BASE;

    if (ADMIN_KEY) {
        const res = await adminFetch("/api/admin/auth", { method: "POST" });
        if (res && res.status === "success") {
            document.getElementById("adminLoginOverlay").classList.add("hidden");
            document.getElementById("adminShell").classList.remove("hidden");
            switchAdminTab("dashboard");
        }
    }
})();
