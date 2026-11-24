// =========================================================
// RWA SKY PRO - ULTRA PRO TCS CBT ENGINE (tcs-engine.js)
// Features: Read-Only Cloud Vault Fallback (Zero Student Writes),
// Local IndexedDB Edge Cache, Multi-Worker Failover, Inline Math
// Normalizer, Strict Real-Exam Mode, Section Spline Waveform,
// 4-Colour Time-Heatmap, Cut-Off Predictor, 1-v-1 Challenge,
// Branded Scorecard PNG & Offline-Safe Submit Queue
// =========================================================

let NEXT_BUILD_ID = localStorage.getItem("rwa_next_build_id") || "TDvVxPHlB8LGPavKJeaEV";
const RWA_TERMS_WORKERS = [
    "https://test.src22420.workers.dev/?url=",
    "https://proplayer.allswbatch22.workers.dev/proxy?url="
];
const _workerDownUntil = {};

(function injectExactTcsStyles() {
    if (document.getElementById("tcs-exact-fix-styles")) return;
    const st = document.createElement("style");
    st.id = "tcs-exact-fix-styles";
    st.innerHTML = `
        #slideTestAttempt, #slideTestAttempt.active-slide {
            animation: none !important; transform: none !important; padding: 0 !important; margin: 0 !important;
        }
        .tcs-sec-heading {
            font-size: 15px; font-weight: 800; color: #1a237e; margin: 10px 0 12px 0;
            padding-bottom: 8px; border-bottom: 1px solid #e2e8f0; display: flex; align-items: center; gap: 6px;
        }
        #subjects-selection-container { display: flex !important; flex-direction: column !important; gap: 10px !important; margin-bottom: 14px !important; }
        .tcs-sub-row {
            width: 100% !important; display: flex !important; justify-content: space-between !important;
            align-items: center !important; padding: 12px 15px !important; border-radius: 11px !important; font-size: 14px !important;
        }
        .tcs-sub-row.fixed-sub { background: #f0f4f8 !important; border: 1px solid #d9e2ec !important; border-left: 4px solid #1a237e !important; }
        .tcs-sub-row.opt-sub { background: #ffffff !important; border: 1px solid #ffcc80 !important; border-left: 4px solid #ff9800 !important; cursor: pointer !important; }
        .tcs-sub-row.opt-sub.selected { background: #e8f5e9 !important; border: 1.5px solid #4caf50 !important; border-left: 4px solid #4caf50 !important; }
        .tcs-sub-left { display: flex !important; align-items: center !important; gap: 8px !important; font-weight: 700 !important; color: #102a43 !important; }
        .tcs-sub-pill { background: #d9e2ec !important; color: #334e68 !important; font-size: 12px !important; font-weight: 800 !important; padding: 4px 10px !important; border-radius: 14px !important; white-space: nowrap !important; }
        .tcs-sub-row.opt-sub.selected .tcs-sub-pill { background: #c8e6c9 !important; color: #2e7d32 !important; }
        .tcs-opt-heading { font-size: 13px !important; font-weight: 800 !important; color: #e65100 !important; margin: 8px 0 2px 0 !important; }

        .tcs-q-para { margin: 0 0 10px 0 !important; display: block !important; line-height: 1.7 !important; }
        .tcs-q-para:last-child { margin-bottom: 0 !important; }
        .tcs-q-text mjx-container, .sol-q-txt mjx-container, .fs-q-txt mjx-container, .fs-exp-text mjx-container,
        .tcs-option mjx-container, .fs-opt mjx-container, .MathJax, .math-tex, math, .katex {
            display: inline-block !important; vertical-align: middle !important; margin: 0 2px !important; line-height: 1.2 !important;
        }
    `;
    document.head.appendChild(st);
})();

let tcsState = {
    activeTestKey: null,
    testMeta: null,
    isCustomMode: false,
    strictMode: false,
    fiveMinWarned: false,
    rawAllQuestions: [],
    allParsedSections: [],
    selectedOptionalByGroup: {},
    activeSections: [],
    questions: [],
    currentQIdx: 0,
    responses: {},
    activeSectionIndex: 0,
    timerInterval: null,
    secondsLeft: 0,
    totalInitialSeconds: 3600,
    isSectionalTiming: false,
    isPartSwitchingRestricted: false,
    sectionTimeAllocated: [],
    sectionSecondsLeft: [],
    isSubmitted: false,
    lang: "en",
    fontSizePx: (window.PRO_STORE && PRO_STORE.preferences && PRO_STORE.preferences.fontSize) || 16,
    tabSwitchWarnings: 0,
    activeSolFilter: "all",
    activeFullSolIdx: 0,
    lastSubmittedScore: 0,
    lastMaxMarks: 0,
    lastAccuracy: 0,
    lastTotalSpentSec: 0,
    lastRankStr: "--",
    lastPercStr: "--",
    lastCounts: { correct: 0, incorrect: 0, unattempted: 0 },
    lastWrongQuestions: []
};
window.tcsState = tcsState;

const RWA_KNOWN_SECTION_IDS = {
    "206": "General Awareness",
    "207": "English",
    "208": "General Intelligence and Reasoning",
    "209": "Mathematics",
    "210": "English",
    "211": "Computer Knowledge",
    "212": "English",
    "213": "Hindi",
    "215": "Basic Law/Constitution/General Knowledge",
    "222": "Numerical & Mental Ability Test",
    "223": "Mental Aptitude/Intelligence/Reasoning",
    "234": "Chemistry"
};

function stripHtmlText(html) {
    if (!html) return "";
    return String(html).replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
}

function playSubtleBeep() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        const ctx = new Ctx(), osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = "sine"; osc.frequency.value = 880; gain.gain.value = 0.12;
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start();
        setTimeout(() => { try { osc.stop(); ctx.close(); } catch {} }, 280);
    } catch {}
}

// =========================================================
// EXACT INLINE MATHJAX / KATEX / KOKILA HTML NORMALIZER
// =========================================================
function cleanQuestionHtml(rawHtml, isOption = false) {
    if (!rawHtml) return "";
    let str = String(rawHtml).trim();
    if (!str) return "";

    str = str
        .replace(/font-size:\s*\d+(\.\d+)?(pt|px|em|rem)\s*;?/gi, "")
        .replace(/font-family:\s*['"]?KOKILA['"]?\s*;?/gi, "")
        .replace(/line-height:\s*[^;"]+;?/gi, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/\\\[([\s\S]*?)\\\]/g, "\\($1\\)")
        .replace(/\$\$([\s\S]*?)\$\$/g, "\\($1\\)")
        .replace(/\\\(\s*([+-]?\d+(?:[.,:/]\d+)*(?:\s*\\?%)?)\s*\\\)/g, (_, num) => num.replace(/\\%/g, "%"))
        .replace(/\$\s*([+-]?\d+(?:[.,:/]\d+)*(?:\s*\\?%)?)\s*\$/g, (_, num) => num.replace(/\\%/g, "%"));

    const temp = document.createElement("div");
    temp.innerHTML = str;
    temp.querySelectorAll("style, script, meta, link").forEach(el => el.remove());

    temp.querySelectorAll("math").forEach(mathEl => {
        mathEl.setAttribute("display", "inline");
        mathEl.style.display = "inline-block";
        mathEl.style.verticalAlign = "middle";
        if (!mathEl.querySelector("mfrac, msqrt, mroot, msup, msub, msubsup, munder, mover, mtable")) {
            const span = document.createElement("span");
            span.textContent = (mathEl.textContent || "").replace(/\s+/g, " ").trim();
            mathEl.replaceWith(span);
        }
    });
    temp.querySelectorAll(".katex").forEach(kEl => {
        const htmlPart = kEl.querySelector(".katex-html"), mmlPart = kEl.querySelector(".katex-mathml");
        if (htmlPart && mmlPart) htmlPart.remove();
    });
    temp.querySelectorAll("mjx-container").forEach(mjx => {
        mjx.removeAttribute("display");
        mjx.style.display = "inline-block";
        mjx.style.margin = "0 2px";
    });

    if (temp.querySelector("table")) return temp.innerHTML;

    const workingHtml = temp.innerHTML
        .replace(/<\s*br\s*\/?\s*>/gi, "___RWA_BR___")
        .replace(/<\/\s*(p|div|h[1-6]|li)\s*>/gi, "___RWA_BR___")
        .replace(/<\s*(p|div|h[1-6]|li)(\s[^>]*)?>/gi, "___RWA_BR___");

    const segs = workingHtml.split("___RWA_BR___").map(s => s.replace(/\s+/g, " ").trim()).filter(s => Boolean(s.replace(/<[^>]+>/g, "").trim()) || /<(img|svg|math|mjx-container)/i.test(s));
    if (!segs.length) return temp.innerHTML;
    if (isOption) return segs.join(" ").replace(/\s+([.,;?!।%])/g, "$1").trim();

    return segs.length === 1 ? segs[0] : segs.map(p => `<div class="tcs-q-para">${p}</div>`).join("");
}

function detectSmartSubjectName(secId, questionsList, rawLabel) {
    const cleanRaw = String(rawLabel || "").trim();
    if (cleanRaw && !/^section\s*\d+$/i.test(cleanRaw) && !/^part\s*[a-z0-9]+$/i.test(cleanRaw) && !/^\d+$/.test(cleanRaw) && !["general", "uncategorized"].includes(cleanRaw.toLowerCase())) {
        return cleanRaw;
    }
    const idStr = String(secId || "").trim();
    let combinedText = "";
    for (let i = 0; i < Math.min(questionsList.length, 20); i++) {
        const q = questionsList[i];
        combinedText += " " + stripHtmlText(q.question || q.question_text || "") + " " + stripHtmlText(q.option_1 || "");
    }
    const lower = combinedText.toLowerCase();
    const devCount = (combinedText.match(/[\u0900-\u097F]/g) || []).length;
    const latCount = (combinedText.match(/[a-zA-Z]/g) || []).length;

    const engHits = ["synonym", "antonym", "idiom", "misspelt", "grammatical error", "passive voice", "fill in the blank"].filter(k => lower.includes(k)).length * 2 + (devCount === 0 && latCount > 150 ? 6 : 0) + (["212", "207", "210"].includes(idStr) ? 3 : 0);
    const hindiHits = ["विलोम", "पर्यायवाची", "मुहावरा", "वर्तनी", "संधि", "समास", "गद्यांश"].filter(k => combinedText.includes(k)).length * 2 + (idStr === "213" ? 5 : 0);
    if (engHits >= 5 && engHits > hindiHits) return "English";
    if (hindiHits >= 4 && hindiHits >= engHits) return "Hindi";
    return RWA_KNOWN_SECTION_IDS[idStr] || `Section ${idStr}`;
}

// =========================================================
// MULTI-WORKER + READ-ONLY CLOUD VAULT + LOCAL IDB EDGE CACHE
// =========================================================
function getSkyAuthCookieStr() {
    const tokObj = (tcsState.testMeta && tcsState.testMeta.tokenObj) || (window.state && window.state.activeTokenObj) || (window.USER_TOKENS && window.USER_TOKENS[0]) || null;
    const token = (tokObj && tokObj.token) ? String(tokObj.token).trim() : "";
    const uid = String((tokObj && tokObj.userId) || (typeof getActiveUserId === "function" ? getActiveUserId() : "") || "4756316");
    const baseUrl = "https://rozgarapinew.teachx.in/";
    return { token, uid, baseUrl, cookieString: `base_url=${encodeURIComponent(baseUrl)}; Authorization=${token}; User-ID=${uid}` };
}

async function fetchTermsViaWorkers(targetUrl) {
    const u = getSkyAuthCookieStr();
    for (const workerBase of RWA_TERMS_WORKERS) {
        if (Date.now() < (_workerDownUntil[workerBase] || 0)) continue;
        try {
            const isPrimary = workerBase.includes("test.src22420");
            const wUrl = isPrimary
                ? `${workerBase}${encodeURIComponent(targetUrl)}&cookie=${encodeURIComponent(u.cookieString)}&token=${encodeURIComponent(u.token)}&uid=${encodeURIComponent(u.uid)}&base_url=${encodeURIComponent(u.baseUrl)}`
                : `${workerBase}${encodeURIComponent(targetUrl)}`;
            const res = await fetch(wUrl);
            if (res.status >= 500) { _workerDownUntil[workerBase] = Date.now() + 120000; continue; }
            if (!res.ok) continue;
            const json = await res.json();
            if (json && json.buildId && json.buildId !== NEXT_BUILD_ID) {
                NEXT_BUILD_ID = json.buildId;
                localStorage.setItem("rwa_next_build_id", NEXT_BUILD_ID);
            }
            if (json && json.pageProps) return json;
        } catch {
            _workerDownUntil[workerBase] = Date.now() + 120000;
        }
    }
    return null;
}

async function fetchTestFromCloudVaultReadOnly(testId) {
    if (!testId || typeof window.rwaSecureFetch !== "function") return null;
    const apiBase = window.PRO_API_BASE || "https://pdfsownlaoder.onrender.com";
    try {
        const res = await window.rwaSecureFetch(`${apiBase}/api/vault/test/${encodeURIComponent(testId)}`);
        if (res.ok && res.data && res.data.status === "success" && res.data.test_data) return res.data.test_data;
    } catch {}
    return null;
}

async function loadTestQuestionsAndTerms(t) {
    let loadedQuestions = [], externalSecMap = {}, exactMeta = null;

    // Fetch Read-Only Cloud Vault & Live Terms in parallel (Zero Student Writes)
    const uniqueSeries = [...new Set([t.seriesId, t.test_series_id, window.state && window.state.activeSeriesId].filter(Boolean).map(String))];
    const termsPromise = (async () => {
        for (const sid of uniqueSeries) {
            let d = await fetchTermsViaWorkers(`https://rojgarwithankit.co.in/_next/data/${NEXT_BUILD_ID}/test-series/${sid}/test-ssc/${t.id}/terms.json?id=${sid}&testId=${t.id}`);
            if (d && d.pageProps && (d.pageProps.test || d.pageProps.testSections)) return d;
            d = await fetchTermsViaWorkers(`https://rojgarwithankit.co.in/_next/data/${NEXT_BUILD_ID}/test-series/${sid}/test-ssc/${t.id}/attempt.json?id=${sid}&testId=${t.id}`);
            if (d && d.pageProps && (d.pageProps.test || d.pageProps.testSections)) return d;
        }
        return null;
    })();

    const [vaultDoc, rawTerms] = await Promise.all([
        fetchTestFromCloudVaultReadOnly(t.id),
        termsPromise
    ]);

    if (rawTerms && rawTerms.pageProps) {
        const pp = rawTerms.pageProps;
        exactMeta = pp.test || {};
        const secs = pp.testSections || pp.test_sections || exactMeta.testSections || exactMeta.test_sections || [];
        secs.forEach((s, idx) => {
            const sid = String(s.section_id || s.id || s.subjectid || (idx + 1)).trim();
            const nm = String(s.section_title || s.section_name || s.title || s.part_title || `Section ${sid}`).trim();
            externalSecMap[sid] = { name: nm, isOptional: String(s.is_optional || "0") === "1", optGroup: s.optional_group || "A", fixedTiming: parseFloat(s.fixed_timing || 0) || 0, orderIndex: idx };
            if (Array.isArray(s.questions) && s.questions.length) {
                s.questions.forEach(q => loadedQuestions.push({ ...q, section_id: sid, section_name: nm }));
            }
        });
    }

    if (Object.keys(externalSecMap).length === 0 && vaultDoc && Array.isArray(vaultDoc.sections)) {
        exactMeta = { ...(vaultDoc.terms_meta || {}), ...(exactMeta || {}) };
        vaultDoc.sections.forEach((s, idx) => {
            const sid = String(s.secId || s.section_id || (idx + 1));
            externalSecMap[sid] = { name: s.name, isOptional: Boolean(s.rawIsOptional || s.isOptional), optGroup: s.optGroup || "A", fixedTiming: parseFloat(s.fixedTiming || 0) || 0, orderIndex: idx };
        });
    }

    const rawQUrlField = (exactMeta && (exactMeta.test_questions_url || exactMeta.test_questions_url_2)) || t.test_questions_url || t.questions_url || "";
    const qUrl = (typeof window.decryptAppX === "function" && rawQUrlField && !String(rawQUrlField).startsWith("http"))
        ? (window.decryptAppX(rawQUrlField) || rawQUrlField)
        : String(rawQUrlField).replace(/\\\//g, "/").trim();

    if (!loadedQuestions.length && qUrl) {
        let qJson = null;
        try { const r = await fetch(qUrl); if (r.ok) qJson = await r.json(); } catch {}
        if (!qJson && window.WORKER_RAW_PROXY) { try { const r = await fetch(window.WORKER_RAW_PROXY + encodeURIComponent(qUrl)); if (r.ok) qJson = await r.json(); } catch {} }
        if (qJson) loadedQuestions = Array.isArray(qJson) ? qJson : (qJson.data || qJson.questions || []);
    }

    // Fallback 1: Read-Only Cloud Content Vault (rescues deleted tests / 502)
    if (!loadedQuestions.length && vaultDoc && Array.isArray(vaultDoc.questions) && vaultDoc.questions.length) {
        loadedQuestions = vaultDoc.questions;
        exactMeta = exactMeta || vaultDoc.terms_meta || {};
        if (typeof proToast === "function") proToast("☁️ Loaded smoothly from Cloud Vault!", "info");
    }

    // Fallback 2: Local Device IndexedDB Edge Cache
    if (!loadedQuestions.length && typeof window.skyIdbGet === "function") {
        const localDoc = await window.skyIdbGet(`sky_local_test_${t.id}`);
        if (localDoc && Array.isArray(localDoc.questions) && localDoc.questions.length) {
            loadedQuestions = localDoc.questions;
            exactMeta = exactMeta || localDoc.terms_meta || {};
            externalSecMap = localDoc.externalSecMap || externalSecMap;
            if (typeof proToast === "function") proToast("💾 Loaded from Device Offline Cache!", "info");
        }
    }

    // Save locally to Device IndexedDB for instant offline reload (zero server writes!)
    if (loadedQuestions.length && typeof window.skyIdbSet === "function") {
        window.skyIdbSet(`sky_local_test_${t.id}`, { test_id: String(t.id), terms_meta: exactMeta || t, externalSecMap, questions: loadedQuestions, cached_at: Date.now() });
    }

    return { loadedQuestions, externalSecMap, exactMeta };
}

// =========================================================
// LAUNCH REGULAR & CUSTOM MOCK TESTS
// =========================================================
window.launchCustomQuestionsTcs = function(title, questionsArr, mins = 15) {
    if (!Array.isArray(questionsArr) || !questionsArr.length) return;
    const customId = "custom_" + Date.now(), tKey = `test_${customId}`;
    const meta = { id: customId, title: title || "Custom Revision Mock", time: String(mins), questions: String(questionsArr.length), marks: String(questionsArr.length * 2), isCustom: true };
    if (window.state && window.state.testMap) window.state.testMap[tKey] = meta;

    tcsState.activeTestKey = tKey; tcsState.testMeta = meta; tcsState.isCustomMode = true;
    tcsState.isSubmitted = false; tcsState.responses = {}; tcsState.currentQIdx = 0; tcsState.activeSectionIndex = 0;
    tcsState.selectedOptionalByGroup = {}; tcsState.tabSwitchWarnings = 0; tcsState.rawAllQuestions = questionsArr;

    showSlide("slideTestAttempt");
    switchTcsStep("start-screen");
    document.getElementById("tcs-start-title").textContent = meta.title;
    document.getElementById("tcsResumeBanner")?.classList.add("hidden");
    prepareAllSectionsAndRenderStart({});
};

window.launchTcsCbtEngine = async function(tKey) {
    const t = (window.state && window.state.testMap) ? window.state.testMap[tKey] : null;
    if (!t) return;

    tcsState.activeTestKey = tKey; tcsState.testMeta = { ...t }; tcsState.isCustomMode = Boolean(t.isCustom);
    tcsState.isSubmitted = false; tcsState.responses = {}; tcsState.currentQIdx = 0; tcsState.activeSectionIndex = 0;
    tcsState.selectedOptionalByGroup = {}; tcsState.tabSwitchWarnings = 0;

    showSlide("slideTestAttempt");
    switchTcsStep("start-screen");
    document.getElementById("tcs-start-title").textContent = t.title || "(TCS Pattern) Mock Test";
    document.getElementById("subjects-selection-container").innerHTML = `<div style="text-align:center; padding:18px; font-weight:700; color:#475569;">🔄 Loading Test Subjects & Questions...</div>`;

    if (typeof logUserActivity === "function") logUserActivity("OPEN_TEST", t.title || `Test #${t.id}`);

    const paused = typeof getPausedTestState === "function" ? getPausedTestState(t.id) : null;
    document.getElementById("tcsResumeBanner")?.classList.toggle("hidden", !paused);

    const { loadedQuestions, externalSecMap, exactMeta } = await loadTestQuestionsAndTerms(t);
    if (exactMeta && typeof exactMeta === "object") {
        tcsState.testMeta = { ...tcsState.testMeta, ...exactMeta };
        document.getElementById("tcs-start-title").textContent = tcsState.testMeta.title || t.title;
    }

    tcsState.rawAllQuestions = (loadedQuestions && loadedQuestions.length) ? loadedQuestions : (DB.fallbackCbtQuestions || []);
    prepareAllSectionsAndRenderStart(externalSecMap);
};

function switchTcsStep(activeId) {
    ["start-screen", "live-test-screen", "submit-screen", "analysis-screen", "solutions-screen", "full-sol-screen"].forEach(id => {
        document.getElementById(id)?.classList.toggle("tcs-hidden", id !== activeId);
    });
}

function prepareAllSectionsAndRenderStart(externalSecMap) {
    const t = tcsState.testMeta || {}, groupMap = new Map();
    tcsState.rawAllQuestions.forEach((q, idx) => {
        const secId = String(q.section_id || q.part_id || q.subject_id || "1").trim();
        if (!groupMap.has(secId)) {
            groupMap.set(secId, {
                secId,
                rawLabel: q._sectionName || q.section_name || q.subject_name || q.part_title || q.subject || "",
                isExplicitOptional: String(q.is_optional || q.optional || "0") === "1",
                questions: []
            });
        }
        groupMap.get(secId).questions.push({ ...q, rawIndex: idx });
    });

    const parsedSections = [];
    let ord = 0;
    groupMap.forEach((secObj, secId) => {
        const ext = externalSecMap[secId] || {};
        const detectedName = detectSmartSubjectName(secId, secObj.questions, ext.name || secObj.rawLabel);
        const isLangSubject = ["English", "Hindi", "Marathi", "Bengali"].includes(detectedName);
        parsedSections.push({
            secId, name: detectedName, questions: secObj.questions,
            isExplicitOptional: Boolean(ext.isOptional || secObj.isExplicitOptional),
            isLangSubject, isOptional: false, fixedTiming: ext.fixedTiming || 0,
            optGroup: ext.optGroup || "A", orderIndex: typeof ext.orderIndex === "number" ? ext.orderIndex : ord++
        });
    });

    const langSections = parsedSections.filter(s => s.isLangSubject);
    const firstQPosMarks = parseFloat((tcsState.rawAllQuestions[0] && tcsState.rawAllQuestions[0].positive_marks) || 2) || 2;
    const expectedActiveQs = t.marks ? Math.round(parseFloat(t.marks) / firstQPosMarks) : 0;
    const shouldEnableLangOptional = !tcsState.isCustomMode && langSections.length >= 2 && (String(t.show_sectionselector) === "1" || parsedSections.length >= 5 || (expectedActiveQs > 0 && expectedActiveQs < tcsState.rawAllQuestions.length));

    parsedSections.forEach(sec => {
        if (sec.isExplicitOptional || (shouldEnableLangOptional && sec.isLangSubject)) { sec.isOptional = true; sec.optGroup = "A"; }
    });

    const fixedSecs = parsedSections.filter(s => !s.isOptional).sort((a, b) => a.orderIndex - b.orderIndex);
    const optionalSecs = parsedSections.filter(s => s.isOptional).sort((a, b) => a.orderIndex - b.orderIndex);
    tcsState.allParsedSections = [...fixedSecs, ...optionalSecs];
    if (optionalSecs.length > 0 && !tcsState.selectedOptionalByGroup["A"]) tcsState.selectedOptionalByGroup["A"] = optionalSecs[0].secId;
    renderStartScreenUI();
}

function renderStartScreenUI() {
    const t = tcsState.testMeta || {}, container = document.getElementById("subjects-selection-container");
    const fixedSecs = tcsState.allParsedSections.filter(s => !s.isOptional), optionalSecs = tcsState.allParsedSections.filter(s => s.isOptional);

    let html = `<div class="tcs-sec-heading">📚 Subjects in this Test:</div>`;
    fixedSecs.forEach(sec => { html += `<div class="tcs-sub-row fixed-sub"><div class="tcs-sub-left"><span>✅</span><span>${sec.name}</span></div><span class="tcs-sub-pill">${sec.questions.length} Qs</span></div>`; });
    if (optionalSecs.length > 0) {
        const chosenSecId = tcsState.selectedOptionalByGroup["A"];
        html += `<div class="tcs-opt-heading">📝 Select Any One Optional Subject (A):</div>`;
        optionalSecs.forEach(sec => {
            const isSel = String(sec.secId) === String(chosenSecId);
            html += `<div class="tcs-sub-row opt-sub ${isSel ? "selected" : ""}" onclick="selectOptionalSubject('A', '${sec.secId}')"><div class="tcs-sub-left">${isSel ? `<span style="color:#2e7d32;font-weight:900;">✓</span>` : ""}<span>${sec.name}</span></div><span class="tcs-sub-pill">${sec.questions.length} Qs</span></div>`;
        });
    }
    container.innerHTML = html;

    const activeSecs = getActiveChosenSections();
    let totalActiveQs = 0, totalActiveMarks = 0;
    activeSecs.forEach(sec => { totalActiveQs += sec.questions.length; sec.questions.forEach(q => { totalActiveMarks += parseFloat(q.positive_marks ?? 2.0); }); });
    if (t.marks && !isNaN(parseFloat(t.marks)) && optionalSecs.length > 0) totalActiveMarks = parseFloat(t.marks);

    const rawTimeStr = String(t.time || "60").trim();
    const hasSecTime = rawTimeStr.includes("+") || activeSecs.some(s => (s.fixedTiming || 0) > 0);
    const totalMins = rawTimeStr.includes("+") ? rawTimeStr.split("+").reduce((a, v) => a + (parseInt(v.trim()) || 0), 0) : (parseInt(rawTimeStr) || 60);

    const statsBox = document.querySelector("#start-screen .stats-box");
    if (statsBox) {
        statsBox.innerHTML = `
            <div class="start-info"><span>Total Questions:</span> <span id="stat-qs">${totalActiveQs}</span></div>
            <div class="start-info"><span>Total Time:</span> <span id="stat-time">${totalMins} mins</span></div>
            <div class="start-info"><span>Timing Mode:</span> <span id="stat-mode">${hasSecTime ? "Sectional Timing" : "Overall Timing"}</span></div>
            <div class="start-info"><span>Maximum Marks:</span> <span id="stat-marks">${Math.round(totalActiveMarks)}</span></div>`;
    }
}

window.selectOptionalSubject = function(g, s) { tcsState.selectedOptionalByGroup[g] = String(s); renderStartScreenUI(); };
function getActiveChosenSections() { const c = tcsState.selectedOptionalByGroup["A"]; return tcsState.allParsedSections.filter(s => !s.isOptional || String(s.secId) === String(c)); }

// =========================================================
// LIVE CBT TEST + STRICT REAL-EXAM MODE
// =========================================================
window.startTest = function(resumePayload = null) {
    const t = tcsState.testMeta || {};
    if (resumePayload && resumePayload.selectedOptionalByGroup) tcsState.selectedOptionalByGroup = resumePayload.selectedOptionalByGroup;

    const flatQuestions = [];
    tcsState.activeSections = getActiveChosenSections().map(sec => ({
        secId: sec.secId, name: sec.name, fixedTiming: sec.fixedTiming || 0,
        questions: sec.questions.map(q => { const copy = { ...q, originalIndex: flatQuestions.length, _sectionName: sec.name }; flatQuestions.push(copy); return copy; })
    }));

    tcsState.questions = flatQuestions;
    tcsState.responses = (resumePayload && resumePayload.responses) || {};
    tcsState.currentQIdx = (resumePayload && Number.isFinite(resumePayload.currentQIdx)) ? resumePayload.currentQIdx : 0;
    tcsState.activeSectionIndex = (resumePayload && Number.isFinite(resumePayload.activeSectionIndex)) ? resumePayload.activeSectionIndex : 0;
    tcsState.tabSwitchWarnings = 0;
    tcsState.strictMode = Boolean(document.getElementById("strictExamToggle")?.checked);
    tcsState.fiveMinWarned = false;
    document.getElementById("tcsTabSwitchBadge")?.classList.add("hidden");

    if (tcsState.strictMode) {
        document.documentElement.requestFullscreen?.().catch(() => {});
        if (typeof proToast === "function") proToast("🛡️ Strict Real-Exam Mode ON (3 tab switches = auto-submit)", "warning");
    }

    const tStr = String(t.time || "60").trim();
    if (tStr.includes("+")) {
        const parts = tStr.split("+").map(n => (parseInt(n.trim()) || 15) * 60);
        tcsState.isSectionalTiming = true;
        tcsState.sectionTimeAllocated = tcsState.activeSections.map((_, i) => parts[i] || parts[0] || 900);
        tcsState.sectionSecondsLeft = (resumePayload && Array.isArray(resumePayload.sectionSecondsLeft)) ? resumePayload.sectionSecondsLeft : [...tcsState.sectionTimeAllocated];
        tcsState.secondsLeft = tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] || tcsState.sectionTimeAllocated[0];
    } else {
        const totalMins = parseInt(tStr) || 60;
        tcsState.isSectionalTiming = false;
        tcsState.secondsLeft = (resumePayload && Number.isFinite(resumePayload.secondsLeft)) ? resumePayload.secondsLeft : totalMins * 60;
    }
    tcsState.isPartSwitchingRestricted = tcsState.isSectionalTiming || String(t.restrict_part_switching || "0") === "1";

    switchTcsStep("live-test-screen");
    renderTcsTabs();
    loadQuestion(tcsState.currentQIdx);
    startTcsTimer();
    applyTcsFontSize();
};

window.resumeSavedTcsTest = function() {
    const t = tcsState.testMeta;
    if (!t || typeof getPausedTestState !== "function") return;
    const saved = getPausedTestState(t.id);
    if (saved) { startTest(saved); if (typeof proToast === "function") proToast("▶ Paused test resumed!", "success"); }
};

function persistPausedTestProgress() {
    if (tcsState.isSubmitted || !tcsState.testMeta || tcsState.isCustomMode) return;
    if (typeof savePausedTestState === "function") {
        savePausedTestState(tcsState.testMeta.id, {
            title: tcsState.testMeta.title, testMeta: tcsState.testMeta,
            selectedOptionalByGroup: tcsState.selectedOptionalByGroup, responses: tcsState.responses,
            currentQIdx: tcsState.currentQIdx, activeSectionIndex: tcsState.activeSectionIndex,
            secondsLeft: tcsState.secondsLeft, sectionSecondsLeft: tcsState.sectionSecondsLeft
        });
    }
}

window.pauseAndExitTcsTest = function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    persistPausedTestProgress();
    if (typeof proToast === "function") proToast("⏸️ Test paused & saved!", "info");
    showSlide("slideExplorer");
};

window.flagCurrentLiveQuestion = function() {
    const q = tcsState.questions[tcsState.currentQIdx];
    if (q && typeof flagQuestionMistakeToAdmin === "function") flagQuestionMistakeToAdmin(q, tcsState.testMeta || {}, tcsState.currentQIdx + 1);
};
window.flagFullSolQuestion = function() {
    const q = tcsState.questions[tcsState.activeFullSolIdx];
    if (q && typeof flagQuestionMistakeToAdmin === "function") flagQuestionMistakeToAdmin(q, tcsState.testMeta || {}, tcsState.activeFullSolIdx + 1);
};

function formatMMSS(sec) { sec = Math.max(0, Math.floor(sec || 0)); return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }
function formatHHMMSS(sec) { sec = Math.max(0, Math.floor(sec || 0)); return `${String(Math.floor(sec / 3600)).padStart(2, "0")}:${String(Math.floor((sec % 3600) / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`; }

let _tcsAutoSaveTick = 0;
function startTcsTimer() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    tcsState.timerInterval = setInterval(() => {
        if (tcsState.isSubmitted) return;
        const curIdx = tcsState.currentQIdx;
        if (!tcsState.responses[curIdx]) tcsState.responses[curIdx] = { status: "unattempted", chosenOption: null, timeSpent: 0 };
        tcsState.responses[curIdx].timeSpent = (tcsState.responses[curIdx].timeSpent || 0) + 1;
        const qTimeEl = document.getElementById("tcs-q-time");
        if (qTimeEl) qTimeEl.textContent = formatMMSS(tcsState.responses[curIdx].timeSpent);
        if (++_tcsAutoSaveTick % 12 === 0) persistPausedTestProgress();

        if (tcsState.strictMode && !tcsState.fiveMinWarned && tcsState.secondsLeft === 300) {
            tcsState.fiveMinWarned = true;
            playSubtleBeep();
            if (typeof proToast === "function") proToast("⏰ Only 5 Minutes Remaining!", "warning");
        }

        if (tcsState.secondsLeft <= 0) {
            if (tcsState.isSectionalTiming && tcsState.activeSectionIndex < tcsState.activeSections.length - 1) {
                tcsState.activeSectionIndex++;
                tcsState.secondsLeft = tcsState.sectionSecondsLeft[tcsState.activeSectionIndex];
                tcsState.fiveMinWarned = false;
                renderTcsTabs();
                const fq = tcsState.activeSections[tcsState.activeSectionIndex].questions[0];
                if (fq) loadQuestion(fq.originalIndex);
                return;
            }
            clearInterval(tcsState.timerInterval);
            submitTest();
            return;
        }
        tcsState.secondsLeft--;
        if (tcsState.isSectionalTiming) tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] = tcsState.secondsLeft;
        const timerEl = document.getElementById("tcs-timer-display");
        if (timerEl) timerEl.textContent = formatHHMMSS(tcsState.secondsLeft);
    }, 1000);
}

document.addEventListener("visibilitychange", () => {
    const liveEl = document.getElementById("live-test-screen");
    if (document.hidden && liveEl && !liveEl.classList.contains("tcs-hidden") && !tcsState.isSubmitted) {
        tcsState.tabSwitchWarnings++; persistPausedTestProgress();
        const badge = document.getElementById("tcsTabSwitchBadge");
        if (badge) { badge.textContent = `⚠️ ${tcsState.tabSwitchWarnings}${tcsState.strictMode ? "/3" : ""}`; badge.classList.remove("hidden"); }
        if (tcsState.strictMode && tcsState.tabSwitchWarnings >= 3) {
            playSubtleBeep();
            submitTest();
            if (typeof proToast === "function") proToast("🛡️ Strict Mode: 3 tab switches — Test Auto-Submitted!", "error");
            return;
        }
        if (typeof proToast === "function") proToast(`⚠️ Tab switch #${tcsState.tabSwitchWarnings} detected!`, "warning");
    }
});

document.addEventListener("keydown", (e) => {
    const liveEl = document.getElementById("live-test-screen");
    if (!liveEl || liveEl.classList.contains("tcs-hidden") || tcsState.isSubmitted) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (["1", "2", "3", "4"].includes(e.key)) selectTcsOption(e.key);
    else if (e.key === "Enter") { e.preventDefault(); saveAndNext(); }
    else if (e.key.toLowerCase() === "m") markForReview();
    else if (e.key.toLowerCase() === "c") clearResponse();
    else if (e.key === "ArrowRight") nextQuestion();
    else if (e.key === "ArrowLeft") prevQuestion();
});

function applyTcsFontSize() {
    const qEl = document.getElementById("tcs-q-text"), optEl = document.getElementById("tcs-options-container");
    if (qEl) qEl.style.fontSize = `${tcsState.fontSizePx}px`;
    if (optEl) optEl.style.fontSize = `${Math.max(13, tcsState.fontSizePx - 1)}px`;
}
window.adjustTcsFont = function(d) { tcsState.fontSizePx = Math.min(24, Math.max(13, tcsState.fontSizePx + d)); if (window.PRO_STORE && PRO_STORE.preferences) PRO_STORE.preferences.fontSize = tcsState.fontSizePx; applyTcsFontSize(); };
window.toggleTcsNightMode = function() {
    const shell = document.getElementById("tcs-app-wrapper"); if (!shell) return;
    const isNight = shell.classList.toggle("tcs-night-exam");
    const btn = document.getElementById("tcsNightBtn"); if (btn) btn.textContent = isNight ? "☀️" : "🌙";
};

function renderTcsTabs() {
    const wrap = document.getElementById("tcs-tabs-container"); if (!wrap) return;
    wrap.innerHTML = tcsState.activeSections.map((sec, idx) => {
        const act = idx === tcsState.activeSectionIndex, lck = tcsState.isPartSwitchingRestricted && !act;
        return `<div class="${act ? "tcs-tab active" : (lck ? "tcs-tab locked" : "tcs-tab")}" onclick="switchTcsSection(${idx})">${lck ? (idx < tcsState.activeSectionIndex ? "✅ " : "🔒 ") : ""}${sec.name}</div>`;
    }).join("");
}

window.switchTcsSection = function(secIdx) {
    if (tcsState.isPartSwitchingRestricted && secIdx !== tcsState.activeSectionIndex) return;
    if (tcsState.isSectionalTiming) { tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] = tcsState.secondsLeft; tcsState.secondsLeft = tcsState.sectionSecondsLeft[secIdx]; }
    tcsState.activeSectionIndex = secIdx; renderTcsTabs();
    const fq = tcsState.activeSections[secIdx].questions[0]; if (fq) loadQuestion(fq.originalIndex);
};

function updateLiveBookmarkBtn(q) {
    const btn = document.getElementById("tcsBookmarkBtn"); if (!btn || !q) return;
    const qId = String(q.id || q.question_id || ("q_" + (q.question || "").slice(0, 28)));
    btn.textContent = (typeof isQuestionBookmarked === "function" && isQuestionBookmarked(qId)) ? "⭐ Saved" : "☆ Save";
}

window.toggleBookmarkCurrentQuestion = function() {
    const q = tcsState.questions[tcsState.currentQIdx];
    if (!q || typeof toggleQuestionBookmark !== "function") return;
    toggleQuestionBookmark(q, tcsState.testMeta || {});
    updateLiveBookmarkBtn(q);
};

function loadQuestion(globalIdx) {
    tcsState.currentQIdx = globalIdx;
    const q = tcsState.questions[globalIdx]; if (!q) return;
    if (!tcsState.responses[globalIdx]) tcsState.responses[globalIdx] = { status: "unattempted", chosenOption: null, timeSpent: 0 };

    let found = tcsState.activeSectionIndex;
    tcsState.activeSections.forEach((sec, i) => { if (sec.questions.some(sq => sq.originalIndex === globalIdx)) found = i; });
    if (found !== tcsState.activeSectionIndex) {
        if (tcsState.isPartSwitchingRestricted) return;
        if (tcsState.isSectionalTiming) { tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] = tcsState.secondsLeft; tcsState.secondsLeft = tcsState.sectionSecondsLeft[found]; }
        tcsState.activeSectionIndex = found;
    }
    renderTcsTabs();

    document.getElementById("tcs-q-num").textContent = globalIdx + 1;
    document.getElementById("tcs-q-time").textContent = formatMMSS(tcsState.responses[globalIdx].timeSpent || 0);
    const posNum = parseFloat(q.positive_marks ?? 2), negNum = parseFloat(q.negative_marks ?? 0.5);
    document.getElementById("tcs-live-pos").textContent = `+${Number.isInteger(posNum) ? posNum : posNum.toFixed(2)}`;
    document.getElementById("tcs-live-neg").textContent = `-${Number.isInteger(negNum) ? negNum : negNum}`;
    updateLiveBookmarkBtn(q);

    const qTxtBox = document.getElementById("tcs-q-text");
    qTxtBox.innerHTML = cleanQuestionHtml((tcsState.lang === "hi" && (q.question_hi || q.question_hindi)) ? (q.question_hi || q.question_hindi) : (q.question || q.question_text || ""), false);

    const optBox = document.getElementById("tcs-options-container"), chosen = (tcsState.responses[globalIdx] || {}).chosenOption;
    const opts = [{ id: "1", text: q.option_1 || q.opt1 }, { id: "2", text: q.option_2 || q.opt2 }, { id: "3", text: q.option_3 || q.opt3 }, { id: "4", text: q.option_4 || q.opt4 }, q.option_5 ? { id: "5", text: q.option_5 } : null].filter(o => o && o.text);
    optBox.innerHTML = opts.map((opt, oIdx) => `<div class="${String(chosen) === String(opt.id) ? "tcs-option selected" : "tcs-option"}" onclick="selectTcsOption('${opt.id}')"><span class="tcs-opt-letter">${["A", "B", "C", "D", "E"][oIdx] || opt.id}.</span><div style="flex:1;word-break:break-word;">${cleanQuestionHtml(opt.text, true)}</div></div>`).join("");
    applyTcsFontSize();
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([qTxtBox, optBox]).catch(() => {});
}

window.selectTcsOption = function(optId) {
    const idx = tcsState.currentQIdx;
    tcsState.responses[idx] = { status: "attempted", chosenOption: optId, timeSpent: (tcsState.responses[idx] && tcsState.responses[idx].timeSpent) || 0 };
    loadQuestion(idx);
};
window.saveAndNext = function() { const c = tcsState.responses[tcsState.currentQIdx] || { timeSpent: 0 }; c.status = c.chosenOption ? "attempted" : "unattempted"; tcsState.responses[tcsState.currentQIdx] = c; nextQuestion(); };
window.markForReview = function() { const c = tcsState.responses[tcsState.currentQIdx] || { timeSpent: 0 }; tcsState.responses[tcsState.currentQIdx] = { ...c, status: c.chosenOption ? "marked_attempted" : "marked" }; nextQuestion(); };
window.clearResponse = function() { tcsState.responses[tcsState.currentQIdx] = { status: "unattempted", chosenOption: null, timeSpent: (tcsState.responses[tcsState.currentQIdx] && tcsState.responses[tcsState.currentQIdx].timeSpent) || 0 }; loadQuestion(tcsState.currentQIdx); };
window.nextQuestion = function() { if (tcsState.currentQIdx < tcsState.questions.length - 1) loadQuestion(tcsState.currentQIdx + 1); };
window.prevQuestion = function() { if (tcsState.currentQIdx > 0) loadQuestion(tcsState.currentQIdx - 1); };
window.toggleTcsLangMode = function() {
    tcsState.lang = tcsState.lang === "en" ? "hi" : "en";
    if (!document.getElementById("live-test-screen").classList.contains("tcs-hidden")) loadQuestion(tcsState.currentQIdx);
    else if (!document.getElementById("solutions-screen").classList.contains("tcs-hidden")) renderSolutionsList(tcsState.activeSolFilter);
    else if (!document.getElementById("full-sol-screen").classList.contains("tcs-hidden")) renderFullSolutionContent(tcsState.activeFullSolIdx);
};
window.toggleTcsPalette = function() { const p = document.getElementById("tcs-palette"); p.classList.toggle("show"); if (p.classList.contains("show")) renderTcsAccordionGrid(); };

function renderTcsAccordionGrid() {
    const cont = document.getElementById("tcs-accordion-container"); cont.innerHTML = "";
    tcsState.activeSections.forEach((sec, sIdx) => {
        let att = 0, una = 0, mar = 0, gHtml = `<div class="tcs-q-grid open" id="grid_sec_${sIdx}">`;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex]; let cls = "tcs-q-box st-not-ans";
            if (r) { if (r.status === "attempted") { cls = "tcs-q-box st-ans"; att++; } else if (r.status === "marked") { cls = "tcs-q-box st-mark"; mar++; } else if (r.status === "marked_attempted") { cls = "tcs-q-box st-mark-ans"; att++; } else una++; } else una++;
            gHtml += `<div class="${cls}" onclick="jumpToQuestion(${sq.originalIndex})">${sq.originalIndex + 1}</div>`;
        });
        gHtml += `</div>`;
        cont.innerHTML += `<div class="tcs-accordion"><div class="tcs-acc-header" onclick="toggleGridSec(${sIdx})"><span>${sec.name}</span><span>▼</span></div><div class="tcs-acc-stats"><span>Att: ${att}</span><span>Marked: ${mar}</span><span>Un-Att: ${una}</span></div>${gHtml}</div>`;
    });
}
window.toggleGridSec = function(i) { document.getElementById(`grid_sec_${i}`)?.classList.toggle("open"); };
window.jumpToQuestion = function(gi) { toggleTcsPalette(); loadQuestion(gi); };

// =========================================================
// SUBMIT + WAVEFORM + 4-COLOUR HEATMAP + CUT-OFF + CHALLENGE + PNG
// =========================================================
window.handleDynamicSubmit = function() { prepareSubmit(); };
window.prepareSubmit = function() {
    document.getElementById("tcs-palette").classList.remove("show");
    switchTcsStep("submit-screen");
    document.getElementById("submit-summary-container").innerHTML = tcsState.activeSections.map(sec => {
        let att = 0, una = 0, mar = 0;
        sec.questions.forEach(sq => { const r = tcsState.responses[sq.originalIndex]; if (r && (r.status === "attempted" || r.status === "marked_attempted")) att++; else if (r && r.status === "marked") mar++; else una++; });
        return `<div class="section-summary-card"><h3 style="font-weight:800; color:#1a237e; margin-bottom:10px;">${sec.name}</h3><div class="stat-row"><span>Total Questions:</span> <strong>${sec.questions.length}</strong></div><div class="stat-row"><span>Attempted:</span> <strong style="color:#2563eb;">${att}</strong></div><div class="stat-row"><span>Marked:</span> <strong style="color:#d97706;">${mar}</strong></div><div class="stat-row"><span>Unattempted:</span> <strong style="color:#64748b;">${una}</strong></div></div>`;
    }).join("");
};
window.closeSubmit = function() { switchTcsStep("live-test-screen"); };

function renderCategoryCutoffPredictor(score, maxMarks) {
    const box = document.getElementById("tcsCutoffBody"); if (!box) return;
    const rawCat = String((window.USER_PROFILE && window.USER_PROFILE.info_1) || "UR").toUpperCase();
    let userCat = "UR";
    if (rawCat.includes("OBC")) userCat = "OBC"; else if (rawCat.includes("EWS")) userCat = "EWS"; else if (rawCat.includes("SC")) userCat = "SC"; else if (rawCat.includes("ST")) userCat = "ST";
    const cutoffs = { UR: Math.round(maxMarks * 0.78), OBC: Math.round(maxMarks * 0.74), EWS: Math.round(maxMarks * 0.73), SC: Math.round(maxMarks * 0.67), ST: Math.round(maxMarks * 0.62) };
    const myCut = cutoffs[userCat] || cutoffs.UR, diff = Number((score - myCut).toFixed(1)), safe = diff >= 0;
    box.innerHTML = `
        <div class="p-3 rounded-xl border ${safe ? "bg-emerald-50 border-emerald-300 text-emerald-900" : "bg-rose-50 border-rose-300 text-rose-900"} font-extrabold">
            ${safe ? `✅ Safe Zone (${userCat})` : `⚠️ Below Cut-Off (${userCat})`} — Expected ${userCat}: <strong>${myCut}/${maxMarks}</strong> • Yours: <strong>${score}</strong> (${diff >= 0 ? `+${diff}` : diff})
        </div>
        <div class="grid grid-cols-5 gap-1.5 text-center text-[10px] font-black">${Object.entries(cutoffs).map(([k, v]) => `<div class="p-1.5 rounded-lg ${k === userCat ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-700"}">${k}<br>${v}</div>`).join("")}</div>`;
}

function render4ColorTimeHeatmap() {
    const grid = document.getElementById("tcsHeatmapGrid"); if (!grid) return;
    grid.innerHTML = tcsState.questions.map((q, i) => {
        const r = tcsState.responses[i] || {}, spent = r.timeSpent || 0, ans = String(q.answer || q.correct_option || "1").trim();
        let cls = "hm-un", tip = `Q.${i + 1}: Skipped (${spent}s)`;
        if (r.chosenOption) {
            if (String(r.chosenOption) === ans) { cls = spent < 45 ? "hm-fc" : "hm-sc"; tip = `Q.${i + 1}: ${spent < 45 ? "Fast" : "Slow"} Correct (${spent}s)`; }
            else { cls = spent >= 60 ? "hm-sw" : "hm-fw"; tip = `Q.${i + 1}: ${spent >= 60 ? "Time-Trap" : (spent <= 5 ? "Fast Tukka" : "Wrong")} (${spent}s)`; }
        }
        return `<div onclick="openFullSolution(${i})" class="hm-cell ${cls}" title="${tip}">${i + 1}</div>`;
    }).join("");
}

window.createAndShareFriendChallenge = async function() {
    if (typeof window.rwaSecureFetch !== "function") return;
    const payload = {
        user_id: typeof getActiveUserId === "function" ? getActiveUserId() : "guest",
        user_name: typeof getActiveUserName === "function" ? getActiveUserName() : "RWA Student",
        test_id: String((tcsState.testMeta && tcsState.testMeta.id) || ""),
        series_id: String((tcsState.testMeta && (tcsState.testMeta.seriesId || tcsState.testMeta.test_series_id)) || ""),
        test_title: (tcsState.testMeta && tcsState.testMeta.title) || "RWA Mock Test",
        score: tcsState.lastSubmittedScore, max_marks: tcsState.lastMaxMarks,
        accuracy: tcsState.lastAccuracy, time_taken_sec: tcsState.lastTotalSpentSec
    };
    try {
        const res = await window.rwaSecureFetch(`${window.PRO_API_BASE}/api/challenge/create`, { method: "POST", body: payload });
        const ch = res.data && res.data.challenge;
        if (!ch || !ch.challenge_id) throw new Error();
        const link = `${window.location.origin}${window.location.pathname}?challenge=${encodeURIComponent(ch.challenge_id)}`;
        const msg = `⚔️ I scored ${payload.score}/${payload.max_marks} (${payload.accuracy}% Acc) in "${payload.test_title}"! Beat my score here: ${link}`;
        if (navigator.share) { try { await navigator.share({ title: "1-v-1 RWA Challenge", text: msg, url: link }); return; } catch {} }
        await navigator.clipboard.writeText(msg);
        if (typeof proToast === "function") proToast("⚔️ 1-v-1 Challenge Link Copied!", "success");
    } catch { if (typeof proToast === "function") proToast("Challenge link create nahi ho paya.", "error"); }
};

window.submitTest = async function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    tcsState.isSubmitted = true;
    switchTcsStep("analysis-screen");
    if (tcsState.testMeta && typeof clearPausedTestState === "function") clearPausedTestState(tcsState.testMeta.id);

    let correct = 0, incorrect = 0, unattempted = 0, score = 0, timeCorr = 0, timeInc = 0, timeUna = 0, maxMarks = 0;
    const wrongForMistakeBank = [], timeTraps = [], fastGuesses = [];

    tcsState.questions.forEach((q, i) => {
        const pos = parseFloat(q.positive_marks ?? 2.0), neg = parseFloat(q.negative_marks ?? 0.5);
        maxMarks += pos;
        const r = tcsState.responses[i] || {}, spent = r.timeSpent || 0, ans = String(q.answer || q.correct_option || "1").trim();
        if (!r.chosenOption) { unattempted++; timeUna += spent; }
        else if (String(r.chosenOption) === ans) { correct++; score += pos; timeCorr += spent; }
        else {
            incorrect++; score -= neg; timeInc += spent;
            wrongForMistakeBank.push({ qObj: q, chosenOption: r.chosenOption });
            if (spent >= 60) timeTraps.push({ idx: i, spent });
            if (spent > 0 && spent <= 5) fastGuesses.push({ idx: i, spent });
        }
    });

    score = parseFloat(score.toFixed(2)); maxMarks = Math.round(maxMarks);
    const accuracy = (correct + incorrect) > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0;
    const totalSpentSec = timeCorr + timeInc + timeUna;

    tcsState.lastSubmittedScore = score; tcsState.lastMaxMarks = maxMarks; tcsState.lastAccuracy = accuracy;
    tcsState.lastTotalSpentSec = totalSpentSec;
    tcsState.lastCounts = { correct, incorrect, unattempted }; tcsState.lastWrongQuestions = wrongForMistakeBank.map(x => x.qObj);

    if (wrongForMistakeBank.length && typeof addMistakeQuestions === "function") addMistakeQuestions(wrongForMistakeBank, tcsState.testMeta || {});
    if (totalSpentSec >= 20 && typeof addStudyMinutes === "function") addStudyMinutes(totalSpentSec / 60);

    document.getElementById("res-score").textContent = `${score}/${maxMarks}`;
    document.getElementById("res-correct").textContent = correct;
    document.getElementById("res-incorrect").textContent = incorrect;
    document.getElementById("res-unatt").textContent = unattempted;
    document.getElementById("res-acc").textContent = `${accuracy}%`;
    document.getElementById("res-rank").textContent = "Syncing...";
    document.getElementById("res-perc").textContent = "--";

    const sCont = document.getElementById("analysis-sections-container"), weakCard = document.getElementById("weak-areas-card"), weakList = document.getElementById("weak-areas-list");
    sCont.innerHTML = "";
    const weakSubjects = [], sectionStatsPayload = [];

    tcsState.activeSections.forEach(sec => {
        let sCorr = 0, sInc = 0, sUna = 0, sScore = 0, stCorr = 0, stInc = 0, stUna = 0;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex] || {}, ans = String(sq.answer || sq.correct_option || "1").trim();
            const pos = parseFloat(sq.positive_marks ?? 2.0), neg = parseFloat(sq.negative_marks ?? 0.5), sp = r.timeSpent || 0;
            if (!r.chosenOption) { sUna++; stUna += sp; }
            else if (String(r.chosenOption) === ans) { sCorr++; sScore += pos; stCorr += sp; }
            else { sInc++; sScore -= neg; stInc += sp; }
        });
        const sAcc = (sCorr + sInc) > 0 ? Math.round((sCorr / (sCorr + sInc)) * 100) : 0;
        if (sAcc < 50 || sCorr < sec.questions.length * 0.35) weakSubjects.push(`${sec.name} (Accuracy: ${sAcc}%, Correct: ${sCorr}/${sec.questions.length})`);
        sectionStatsPayload.push({ name: sec.name, score: Number(sScore.toFixed(1)), correct: sCorr, incorrect: sInc, unattempted: sUna, accuracy: sAcc });

        sCont.innerHTML += `<div class="a-card"><div class="subj-header"><div class="subj-name">${sec.name}</div><div class="black-circle"><span>Score</span><span>${sScore.toFixed(1)}</span></div></div><div class="subj-q-stats">Total Questions: ${sec.questions.length} • Accuracy: ${sAcc}%</div><div class="time-split"><div class="col"><div class="c-green">Correct</div><div class="val-num">${sCorr}</div><div class="val-time">${formatMMSS(stCorr)}</div></div><div class="col"><div class="c-red">Incorrect</div><div class="val-num">${sInc}</div><div class="val-time">${formatMMSS(stInc)}</div></div><div class="col"><div class="c-grey">Unattempted</div><div class="val-num">${sUna}</div><div class="val-time">${formatMMSS(stUna)}</div></div></div></div>`;
    });

    // Render Spline Waveform, 4-Colour Heatmap & Category Cut-Off Predictor
    if (typeof window.renderSplineWaveformSvg === "function") {
        window.renderSplineWaveformSvg("tcsAnalysisWaveContainer", "tcsAnalysisWaveReadout", sectionStatsPayload.map(s => ({
            label: s.name.split(" ")[0], value: s.accuracy,
            detail: `${s.name}: Score ${s.score} • Accuracy ${s.accuracy}% (✓${s.correct} / ✕${s.incorrect})`
        })));
    }
    render4ColorTimeHeatmap();
    renderCategoryCutoffPredictor(score, maxMarks);

    // 1-v-1 Friend Challenge Result Comparison
    const chBanner = document.getElementById("tcsChallengeResultBanner");
    if (chBanner) {
        const ch = window.ACTIVE_CHALLENGE;
        if (ch && String(ch.test_id) === String((tcsState.testMeta && tcsState.testMeta.id) || "")) {
            const won = score > ch.challenger_score, tie = score === ch.challenger_score;
            chBanner.innerHTML = `<div class="text-center space-y-1.5"><div class="text-xs font-black uppercase text-indigo-700">⚔️ 1-V-1 CHALLENGE RESULT</div><div class="text-lg font-black text-slate-900">${won ? "🏆 YOU WON!" : (tie ? "🤝 IT'S A TIE!" : "🔥 SO CLOSE!")}</div><div class="text-xs font-bold text-slate-700">You: <strong>${score}/${maxMarks}</strong> (${accuracy}%) vs ${escHtml(ch.challenger_name)}: <strong>${ch.challenger_score}/${ch.max_marks}</strong></div></div>`;
            chBanner.classList.remove("hidden");
            window.rwaSecureFetch?.(`${window.PRO_API_BASE}/api/challenge/${encodeURIComponent(ch.challenge_id)}/complete`, {
                method: "POST", body: { user_id: getActiveUserId(), user_name: getActiveUserName(), score, accuracy, time_taken_sec: totalSpentSec }
            }).catch(() => {});
        } else chBanner.classList.add("hidden");
    }

    document.getElementById("cmp-score").textContent = score;
    document.getElementById("cmp-top").textContent = (maxMarks * 0.88).toFixed(1);
    document.getElementById("cmp-avg").textContent = (maxMarks * 0.48).toFixed(1);
    document.getElementById("cmp-acc").textContent = `${accuracy}%`;
    document.getElementById("cmp-c").textContent = correct;
    document.getElementById("cmp-top-c").textContent = Math.round(tcsState.questions.length * 0.9);
    document.getElementById("cmp-avg-c").textContent = Math.round(tcsState.questions.length * 0.52);
    document.getElementById("cmp-w").textContent = incorrect;
    document.getElementById("cmp-top-w").textContent = Math.round(tcsState.questions.length * 0.04);
    document.getElementById("cmp-avg-w").textContent = Math.round(tcsState.questions.length * 0.18);

    const totalQ = tcsState.questions.length || 1, cDeg = (correct / totalQ) * 360, wDeg = cDeg + (incorrect / totalQ) * 360;
    const donut = document.getElementById("res-donut"); if (donut) donut.style.background = `conic-gradient(#4caf50 0deg ${cDeg}deg, #e53935 ${cDeg}deg ${wDeg}deg, #5c6bc0 ${wDeg}deg 360deg)`;
    document.getElementById("ts-box-corr").innerHTML = `Correct<br>${formatMMSS(timeCorr)}`;
    document.getElementById("ts-box-una").innerHTML = `Unattempted: ${formatMMSS(timeUna)}`;
    document.getElementById("ts-box-inc").innerHTML = `Incorrect<br>${formatMMSS(timeInc)}`;

    const trapBox = document.getElementById("tcsTimeTrapList");
    if (trapBox) {
        let tHtml = "";
        if (timeTraps.length) tHtml += `<div class="p-3 rounded-xl bg-rose-50 border border-rose-200"><div class="font-black text-rose-700 mb-1">⏳ Time Traps (${timeTraps.length} Wrong > 60s):</div><div class="flex flex-wrap gap-1.5">${timeTraps.map(x => `<button onclick="openFullSolution(${x.idx})" class="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] border-0 cursor-pointer">Q${x.idx + 1} (${x.spent}s)</button>`).join("")}</div></div>`;
        if (fastGuesses.length) tHtml += `<div class="p-3 rounded-xl bg-amber-50 border border-amber-200"><div class="font-black text-amber-800 mb-1">🎲 Fast Guesses (${fastGuesses.length} Wrong ≤ 5s):</div><div class="flex flex-wrap gap-1.5">${fastGuesses.map(x => `<button onclick="openFullSolution(${x.idx})" class="px-2 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px] border-0 cursor-pointer">Q${x.idx + 1} (${x.spent}s)</button>`).join("")}</div></div>`;
        trapBox.innerHTML = tHtml || `<div class="p-3 rounded-xl bg-emerald-50 text-emerald-800 font-bold">✅ Great Discipline! Koi major Time-Trap ya Fast Tukka detect nahi hua.</div>`;
    }

    const rem = document.getElementById("dynamic-remark");
    if (rem) {
        rem.style.display = "block";
        if (accuracy >= 80 && correct > 0) { rem.className = "remark-banner rem-excellent"; rem.textContent = "🎉 Excellent Performance! Keep it up!"; }
        else if (accuracy >= 50 && correct > 0) { rem.className = "remark-banner rem-great"; rem.textContent = "👍 Good Attempt! Practice more to reach the top."; }
        else { rem.className = "remark-banner rem-poor"; rem.textContent = "⚠️ Needs Improvement! Review Time-Traps & Mistake Notebook."; }
    }
    if (weakCard && weakList) { weakCard.style.display = weakSubjects.length ? "block" : "none"; weakList.innerHTML = weakSubjects.map(w => `<li>${w}</li>`).join(""); }

    const attemptPayload = {
        user_id: typeof getActiveUserId === "function" ? getActiveUserId() : "guest",
        user_name: typeof getActiveUserName === "function" ? getActiveUserName() : "RWA Student",
        test_id: String((tcsState.testMeta && tcsState.testMeta.id) || "custom"),
        test_title: (tcsState.testMeta && tcsState.testMeta.title) || "Mock Test",
        series_id: String((tcsState.testMeta && (tcsState.testMeta.seriesId || tcsState.testMeta.test_series_id)) || ""),
        score, max_marks: maxMarks, correct, incorrect, unattempted, accuracy,
        time_taken_sec: totalSpentSec, section_stats: sectionStatsPayload,
        time_traps_count: timeTraps.length, fast_guesses_count: fastGuesses.length
    };
    if (typeof saveTestAttemptToVault === "function") saveTestAttemptToVault({ ...attemptPayload, submitted_at: new Date().toLocaleString() });
    syncScoreAndRenderLeaderboard(attemptPayload, score, maxMarks);
};

async function syncScoreAndRenderLeaderboard(attemptPayload, score, maxMarks) {
    const lbBody = document.getElementById("tcsLeaderboardBody"), lbBadge = document.getElementById("lbParticipantsBadge");
    try {
        const res = await window.rwaSecureFetch(`${window.PRO_API_BASE}/api/test/submit`, { method: "POST", body: attemptPayload });
        const json = res && res.data;
        if (json && json.status === "success" && json.leaderboard) {
            if (json.xp_earned && typeof proToast === "function") proToast(`⚡ +${json.xp_earned} XP Earned!`, "success");
            const lb = json.leaderboard;
            tcsState.lastRankStr = lb.my_rank ? `#${lb.my_rank}/${lb.total_participants}` : "#1";
            tcsState.lastPercStr = `${lb.my_percentile ?? 100}%`;
            document.getElementById("res-rank").textContent = tcsState.lastRankStr;
            document.getElementById("res-perc").textContent = tcsState.lastPercStr;
            if (lb.topper) {
                document.getElementById("cmp-top").textContent = lb.topper.score;
                document.getElementById("cmp-top-a").textContent = `${lb.topper.accuracy}%`;
                document.getElementById("cmp-top-c").textContent = lb.topper.correct;
                document.getElementById("cmp-top-w").textContent = lb.topper.incorrect;
            }
            if (lb.total_participants > 0) { document.getElementById("cmp-avg").textContent = lb.avg_score; document.getElementById("cmp-avg-a").textContent = `${lb.avg_accuracy}%`; }
            if (lbBadge) lbBadge.textContent = `${lb.total_participants} Students`;
            if (lbBody) {
                const myUid = String(attemptPayload.user_id);
                lbBody.innerHTML = (lb.top_10 || []).map(row => {
                    const isMe = String(row.user_id) === myUid, medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`;
                    return `<div class="flex justify-between items-center p-2.5 rounded-xl ${isMe ? "bg-indigo-100 border border-indigo-400 font-black" : "bg-slate-50 border border-slate-200"}"><div class="flex items-center gap-2 min-w-0"><span class="font-black text-indigo-800 w-7">${medal}</span><span class="truncate font-bold">${escHtml(row.user_name)}${isMe ? " (You)" : ""}</span></div><div class="text-right shrink-0"><span class="font-black text-blue-700">${row.score}/${row.max_marks}</span><span class="text-[10px] text-emerald-700 ml-1">(${row.accuracy}%)</span></div></div>`;
                }).join("");
            }
            return;
        }
    } catch {}

    // Offline-Safe Queue Fallback
    if (typeof enqueueOfflineTestSubmit === "function") {
        enqueueOfflineTestSubmit(attemptPayload);
        if (typeof proToast === "function") proToast("💾 Offline Saved! Net aate hi Leaderboard par auto-sync ho jayega.", "info");
    }
    tcsState.lastRankStr = score >= maxMarks * 0.75 ? "#12" : "#148";
    tcsState.lastPercStr = `${Math.min(99.5, Math.max(15, (score / (maxMarks || 1)) * 100 + 10)).toFixed(1)}%`;
    document.getElementById("res-rank").textContent = tcsState.lastRankStr;
    document.getElementById("res-perc").textContent = tcsState.lastPercStr;
    if (lbBody) lbBody.innerHTML = `<div class="text-slate-500 font-bold text-center py-2">Offline-Safe Mode: Score safely queued — net aate hi live rank update hogi.</div>`;
}

window.shareScorecardPng = function() {
    const canvas = document.createElement("canvas");
    canvas.width = 900; canvas.height = 1050;
    const ctx = canvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 900, 1050);
    grad.addColorStop(0, "#0284c7"); grad.addColorStop(0.55, "#2563eb"); grad.addColorStop(1, "#1e1b4b");
    ctx.fillStyle = grad; ctx.fillRect(0, 0, 900, 1050);
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.roundRect(50, 150, 800, 820, 36); ctx.fill();
    ctx.fillStyle = "#ffffff"; ctx.textAlign = "center";
    ctx.font = "900 42px Segoe UI, Arial"; ctx.fillText("RWA SKY PRO PORTAL", 450, 80);
    ctx.font = "700 22px Segoe UI, Arial"; ctx.fillStyle = "#bae6fd"; ctx.fillText("OFFICIAL MOCK TEST SCORECARD", 450, 118);

    const name = typeof getActiveUserName === "function" ? getActiveUserName() : "RWA Student";
    const testTitle = ((tcsState.testMeta && tcsState.testMeta.title) || "Mock Test").slice(0, 42);
    ctx.fillStyle = "#0f172a"; ctx.font = "900 36px Segoe UI, Arial"; ctx.fillText(name, 450, 235);
    ctx.fillStyle = "#0284c7"; ctx.font = "700 24px Segoe UI, Arial"; ctx.fillText(testTitle, 450, 280);

    [
        { x: 95, y: 330, bg: "#ffedd5", lbl: "SCORE", val: `${tcsState.lastSubmittedScore}/${tcsState.lastMaxMarks}` },
        { x: 475, y: 330, bg: "#fef3c7", lbl: "ALL-INDIA RANK", val: tcsState.lastRankStr },
        { x: 95, y: 525, bg: "#dcfce7", lbl: "PERCENTILE", val: tcsState.lastPercStr },
        { x: 475, y: 525, bg: "#e0f2fe", lbl: "ACCURACY", val: `${tcsState.lastAccuracy}%` }
    ].forEach(b => {
        ctx.fillStyle = b.bg; ctx.beginPath(); ctx.roundRect(b.x, b.y, 330, 165, 24); ctx.fill();
        ctx.fillStyle = "#475569"; ctx.font = "800 20px Segoe UI, Arial"; ctx.fillText(b.lbl, b.x + 165, b.y + 52);
        ctx.fillStyle = "#0f172a"; ctx.font = "900 46px Segoe UI, Arial"; ctx.fillText(b.val, b.x + 165, b.y + 118);
    });

    const c = tcsState.lastCounts || { correct: 0, incorrect: 0, unattempted: 0 };
    [
        { x: 95, bg: "#dcfce7", col: "#15803d", txt: `✓ Correct: ${c.correct}` },
        { x: 345, bg: "#fee2e2", col: "#b91c1c", txt: `✕ Wrong: ${c.incorrect}` },
        { x: 595, bg: "#f1f5f9", col: "#475569", txt: `− Skip: ${c.unattempted}` }
    ].forEach(m => {
        ctx.fillStyle = m.bg; ctx.beginPath(); ctx.roundRect(m.x, 730, 210, 74, 18); ctx.fill();
        ctx.fillStyle = m.col; ctx.font = "800 22px Segoe UI, Arial"; ctx.fillText(m.txt, m.x + 105, 775);
    });
    ctx.fillStyle = "#64748b"; ctx.font = "700 20px Segoe UI, Arial";
    ctx.fillText(`Generated on ${new Date().toLocaleDateString("en-IN")} • Verified RWA Sky Pro Result`, 450, 910);

    canvas.toBlob(async blob => {
        if (!blob) return;
        const file = new File([blob], "RWA_Sky_Scorecard.png", { type: "image/png" });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try { await navigator.share({ title: "My RWA Scorecard", text: `Scored ${tcsState.lastSubmittedScore}/${tcsState.lastMaxMarks} (${tcsState.lastRankStr})!`, files: [file] }); return; } catch {}
        }
        const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `RWA_Sky_Scorecard_${Date.now()}.png`; a.click();
        if (typeof proToast === "function") proToast("📸 Branded Scorecard PNG Downloaded!", "success");
    }, "image/png");
};

window.reAttemptWrongOnlyFromCurrent = function() {
    if (!tcsState.lastWrongQuestions || !tcsState.lastWrongQuestions.length) return proToast("🎉 Koi wrong question nahi hai!", "success");
    window.launchCustomQuestionsTcs(`❌ Wrong Only: ${(tcsState.testMeta && tcsState.testMeta.title) || "Test"}`, tcsState.lastWrongQuestions, Math.max(5, Math.ceil(tcsState.lastWrongQuestions.length * 0.8)));
};

window.exportTestPdfSheet = function() {
    const title = (tcsState.testMeta && tcsState.testMeta.title) || "RWA Mock Test Scorecard";
    const rowsHtml = tcsState.questions.map((q, i) => {
        const r = tcsState.responses[i] || {}, ans = String(q.answer || q.correct_option || "1").trim();
        const status = !r.chosenOption ? "Unattempted" : (String(r.chosenOption) === ans ? "Correct ✓" : `Wrong ✕ (Your: ${r.chosenOption})`);
        return `<div style="margin-bottom:14px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;page-break-inside:avoid;"><div style="font-weight:bold;color:#1a237e;font-size:13px;">Q${i + 1}. [${q._sectionName || "General"}] — ${status}</div><div style="margin:6px 0;font-size:13px;">${cleanQuestionHtml(q.question || q.question_text || "", false)}</div><div style="font-size:12px;color:#334155;">A) ${cleanQuestionHtml(q.option_1 || "", true)} &nbsp;|&nbsp; B) ${cleanQuestionHtml(q.option_2 || "", true)} &nbsp;|&nbsp; C) ${cleanQuestionHtml(q.option_3 || "", true)} &nbsp;|&nbsp; D) ${cleanQuestionHtml(q.option_4 || "", true)}</div><div style="margin-top:6px;font-size:12px;color:#15803d;"><b>Correct Option: ${ans}</b> — ${cleanQuestionHtml(q.solution_text || q.explanation || "", false)}</div></div>`;
    }).join("");
    const win = window.open("", "_blank");
    if (!win) return proToast("Popup blocked! Browser popup allow karein.", "warning");
    win.document.write(`<html><head><title>${title}</title><style>body{font-family:Arial,sans-serif;padding:20px;color:#0f172a;} img{max-width:260px;height:auto;}</style></head><body><h2 style="color:#1a237e;margin-bottom:4px;">${title}</h2><p style="font-size:13px;font-weight:bold;">Score: ${tcsState.lastSubmittedScore}/${tcsState.lastMaxMarks} • Student: ${typeof getActiveUserName === "function" ? getActiveUserName() : "RWA Student"}</p><hr style="margin:14px 0;">${rowsHtml}<script>setTimeout(()=>window.print(), 400);</script></body></html>`);
    win.document.close();
};

window.reAttemptTcsTest = function() {
    if (tcsState.isCustomMode) window.launchCustomQuestionsTcs(tcsState.testMeta.title, tcsState.rawAllQuestions, parseInt(tcsState.testMeta.time || "15", 10));
    else window.launchTcsCbtEngine(tcsState.activeTestKey);
};
window.exitTcsTest = function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
    showSlide(tcsState.isCustomMode ? "slideVault" : "slideExplorer");
};

window.openSolutions = function() { switchTcsStep("solutions-screen"); tcsState.activeSolFilter = "all"; renderSolutionsList("all"); };
window.closeSolutions = function() { switchTcsStep("analysis-screen"); };
window.filterSol = function(f, btn) { document.querySelectorAll(".flt-btn").forEach(b => b.classList.remove("flt-active")); if (btn) btn.classList.add("flt-active"); tcsState.activeSolFilter = f; renderSolutionsList(f); };

function renderSolutionsList(filter) {
    const cont = document.getElementById("sol-list-container"); cont.innerHTML = "";
    tcsState.questions.forEach((q, idx) => {
        const r = tcsState.responses[idx], ans = String(q.answer || q.correct_option || "1").trim(), has = r && r.chosenOption;
        const isCorr = has && String(r.chosenOption) === ans, isInc = has && !isCorr, isUna = !has;
        if ((filter === "correct" && !isCorr) || (filter === "incorrect" && !isInc) || (filter === "unattempted" && !isUna)) return;
        const cls = isCorr ? "st-corr" : (isInc ? "st-wr" : "st-una"), ico = isCorr ? "✓" : (isInc ? "✕" : "−");
        const qTxt = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi)) ? (q.question_hi || q.question_hindi) : (q.question || q.question_text || "");
        cont.innerHTML += `<div class="sol-item" onclick="openFullSolution(${idx})" style="cursor:pointer;"><div class="sol-num-col"><div class="sol-num">${idx + 1}<div class="sol-status-icon ${cls}">${ico}</div></div><div class="sol-line"></div></div><div class="sol-card"><span class="sol-sec-badge">${q._sectionName || "General"}</span><div class="sol-q-txt">${cleanQuestionHtml(qTxt, false)}</div><div style="font-size:12px;font-weight:800;color:#1a237e;">View Full Solution ➔</div></div></div>`;
    });
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([cont]).catch(() => {});
}

window.openFullSolution = function(idx) { tcsState.activeFullSolIdx = idx; switchTcsStep("full-sol-screen"); renderFullSolutionContent(idx); };
function renderFullSolutionContent(idx) {
    const q = tcsState.questions[idx]; if (!q) return;
    const r = tcsState.responses[idx] || {}, ans = String(q.answer || q.correct_option || "1").trim();
    document.getElementById("fs-q-num").textContent = `Question ${idx + 1} (${q._sectionName || ""})`;
    const tcBox = document.getElementById("fs-q-time-compare"); if (tcBox) tcBox.innerHTML = `<span class="time-compare-badge">⏱️ You: ${formatMMSS(r.timeSpent || 0)}</span>`;
    const fsBtn = document.getElementById("fsBookmarkBtn");
    if (fsBtn) { const qId = String(q.id || q.question_id || ("q_" + (q.question || "").slice(0, 28))); fsBtn.textContent = (typeof isQuestionBookmarked === "function" && isQuestionBookmarked(qId)) ? "⭐ Saved" : "☆ Save"; }

    document.getElementById("fs-q-txt").innerHTML = cleanQuestionHtml((tcsState.lang === "hi" && (q.question_hi || q.question_hindi)) ? (q.question_hi || q.question_hindi) : (q.question || q.question_text || ""), false);
    const opts = [{ id: "1", text: q.option_1 || q.opt1 }, { id: "2", text: q.option_2 || q.opt2 }, { id: "3", text: q.option_3 || q.opt3 }, { id: "4", text: q.option_4 || q.opt4 }, q.option_5 ? { id: "5", text: q.option_5 } : null].filter(Boolean);
    document.getElementById("fs-options-container").innerHTML = opts.map((opt, oIdx) => {
        const isC = String(opt.id) === ans, isU = r.chosenOption && String(r.chosenOption) === String(opt.id);
        return `<div class="${isC ? "fs-opt correct" : (isU ? "fs-opt wrong" : "fs-opt")}"><div style="display:flex;align-items:flex-start;gap:10px;"><strong style="color:#1a237e;">${["A", "B", "C", "D", "E"][oIdx] || opt.id}.</strong><div>${cleanQuestionHtml(opt.text || "", true)}</div></div>${isC ? `<span class="fs-opt-perc">✓ Correct</span>` : ""}${isU && !isC ? `<span style="font-size:11px;font-weight:800;color:#c62828;">✗ Your Ans</span>` : ""}</div>`;
    }).join("");
    document.getElementById("fs-exp-text").innerHTML = cleanQuestionHtml((tcsState.lang === "hi" && (q.explanation_hi || q.solution_hi)) ? (q.explanation_hi || q.solution_hi) : (q.solution_text || q.explanation || q.solution || "Detailed solution above."), false);
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([document.getElementById("full-sol-screen")]).catch(() => {});
}

window.toggleBookmarkFullSol = function() { const q = tcsState.questions[tcsState.activeFullSolIdx]; if (!q || typeof toggleQuestionBookmark !== "function") return; toggleQuestionBookmark(q, tcsState.testMeta || {}); renderFullSolutionContent(tcsState.activeFullSolIdx); };
window.makeFlashcardFromFullSol = function() {
    const q = tcsState.questions[tcsState.activeFullSolIdx]; if (!q || typeof addFlashcardItem !== "function") return;
    const ansId = String(q.answer || q.correct_option || "1").trim();
    addFlashcardItem(stripHtmlText(q.question || q.question_text || "").slice(0, 260), `Ans: ${stripHtmlText(q[`option_${ansId}`] || "")}\n${stripHtmlText(q.solution_text || q.explanation || "").slice(0, 240)}`, q._sectionName || "Mock Revision");
};
window.copyCurrentQuestionDoubt = function() {
    const q = tcsState.questions[tcsState.activeFullSolIdx]; if (!q) return;
    const txt = [`❓ Question (${q._sectionName || "Mock"}):`, stripHtmlText(q.question || q.question_text || ""), `A) ${stripHtmlText(q.option_1 || "")}`, `B) ${stripHtmlText(q.option_2 || "")}`, `C) ${stripHtmlText(q.option_3 || "")}`, `D) ${stripHtmlText(q.option_4 || "")}`, `✅ Official Ans: Option ${q.answer || "1"}`].join("\n");
    navigator.clipboard.writeText(txt).then(() => { if (typeof proToast === "function") proToast("📋 Question copied!", "success"); });
};
window.closeFullSol = function() { switchTcsStep("solutions-screen"); };
window.nextFullSol = function() { if (tcsState.activeFullSolIdx < tcsState.questions.length - 1) renderFullSolutionContent(++tcsState.activeFullSolIdx); };
window.prevFullSol = function() { if (tcsState.activeFullSolIdx > 0) renderFullSolutionContent(--tcsState.activeFullSolIdx); };
