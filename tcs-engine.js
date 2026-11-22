// =========================================================
// RWA SKY PRO - ADVANCED TCS CBT MOCK TEST ENGINE (tcs-engine.js)
// Features: Optional Subject Selector, Overall/Sectional Timing,
// Pause & Auto-Resume, Question Bookmarks, Mistake Notebook,
// Custom Mock Launcher, Real 4-DB All-India Leaderboard,
// Time-Trap & Guesswork Detector, Night Exam, Font Zoom,
// Tab-Switch Guard, PC Shortcuts, Copy Doubt, Flashcard & PDF Export
// =========================================================

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
    `;
    document.head.appendChild(st);
})();

let tcsState = {
    activeTestKey: null,
    testMeta: null,
    isCustomMode: false,
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
    lastWrongQuestions: []
};

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
    return String(html)
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function cleanQuestionHtml(rawHtml) {
    if (!rawHtml) return "";
    return String(rawHtml)
        .replace(/font-size:\s*\d+(\.\d+)?(pt|px)/gi, "")
        .replace(/<p>\s*(&nbsp;|\s)*\s*<\/p>/gi, "");
}

function detectSmartSubjectName(secId, questionsList, rawLabel) {
    const cleanRaw = String(rawLabel || "").trim();
    if (
        cleanRaw &&
        !/^section\s*\d+$/i.test(cleanRaw) &&
        !/^part\s*[a-z0-9]+$/i.test(cleanRaw) &&
        !/^\d+$/.test(cleanRaw) &&
        cleanRaw.toLowerCase() !== "general" &&
        cleanRaw.toLowerCase() !== "uncategorized"
    ) {
        return cleanRaw;
    }

    const idStr = String(secId || "").trim();
    let combinedText = "";
    const sampleCount = Math.min(questionsList.length, 25);
    for (let i = 0; i < sampleCount; i++) {
        const q = questionsList[i];
        combinedText += " " + stripHtmlText(q.question || q.question_text || "") +
                        " " + stripHtmlText(q.option_1 || "") + " " + stripHtmlText(q.option_2 || "");
    }
    const lower = combinedText.toLowerCase();
    const devCount = (combinedText.match(/[\u0900-\u097F]/g) || []).length;
    const latCount = (combinedText.match(/[a-zA-Z]/g) || []).length;

    const engKeywords = ["synonym", "antonym", "idiom", "misspelt", "grammatical error", "passive voice", "one word substitution", "fill in the blank"];
    let engHits = engKeywords.filter(kw => lower.includes(kw)).length * 2;
    if (devCount === 0 && latCount > 150) engHits += 6;
    if (idStr === "212" || idStr === "207" || idStr === "210") engHits += 3;

    const hindiKeywords = ["विलोम", "पर्यायवाची", "मुहावरा", "वर्तनी", "वाक्यांश", "संधि", "समास", "तत्सम", "तद्भव", "गद्यांश", "शुद्ध वाक्य"];
    let hindiHits = hindiKeywords.filter(kw => combinedText.includes(kw)).length * 2 + (idStr === "213" ? 5 : 0);

    if (engHits >= 5 && engHits > hindiHits) return "English";
    if (hindiHits >= 4 && hindiHits >= engHits) return "Hindi";

    const reasoningKeywords = ["जिस प्रकार", "श्रृंखला", "कूट भाषा", "दर्पण", "पासा", "कथन", "निष्कर्ष", "दिशा", "रक्त संबंध", "coding", "syllogism"];
    const mathKeywords = ["प्रतिशत", "अनुपात", "समानुपाती", "औसत", "लाभ", "हानि", "ब्याज", "क्षेत्रफल", "त्रिभुज", "वृत्त", "समीकरण", "\\frac", "₹"];
    const gaKeywords = ["संविधान", "अनुच्छेद", "राष्ट्रपति", "प्रधानमंत्री", "संसद", "जनगणना", "नदी", "इतिहास", "मुगल", "अर्थव्यवस्था", "rbi"];
    const compKeywords = ["ms word", "ms excel", "ctrl +", "shortcut key", "कंप्यूटर", "मेमोरी", "सॉफ्टवेयर", "cpu"];

    let rScore = (idStr === "208" ? 5 : 0) + reasoningKeywords.filter(k => lower.includes(k)).length * 2;
    let mScore = (idStr === "209" ? 5 : 0) + mathKeywords.filter(k => lower.includes(k)).length * 2;
    let gScore = (idStr === "206" ? 5 : 0) + gaKeywords.filter(k => lower.includes(k)).length * 2;
    let cScore = (idStr === "211" ? 5 : 0) + compKeywords.filter(k => lower.includes(k)).length * 2;

    if (RWA_KNOWN_SECTION_IDS[idStr] && Math.max(rScore, mScore, gScore, cScore) <= 5) return RWA_KNOWN_SECTION_IDS[idStr];
    const maxScore = Math.max(rScore, mScore, gScore, cScore);
    if (maxScore > 0) {
        if (cScore === maxScore && cScore >= 6) return "Computer Knowledge";
        if (rScore === maxScore) return "General Intelligence and Reasoning";
        if (mScore === maxScore) return "Mathematics";
        if (gScore === maxScore) return "General Awareness";
    }
    return RWA_KNOWN_SECTION_IDS[idStr] || `Section ${idStr}`;
}

// =========================================================
// LAUNCH TEST (REGULAR & CUSTOM VAULT MOCK)
// =========================================================
window.launchCustomQuestionsTcs = function(title, questionsArr, mins = 15) {
    const customId = "custom_" + Date.now();
    const tKey = `test_${customId}`;
    const meta = {
        id: customId,
        title: title || "Custom Revision Mock",
        time: String(mins),
        questions: String(questionsArr.length),
        marks: String(questionsArr.length * 2),
        isCustom: true
    };
    if (window.state && window.state.testMap) {
        window.state.testMap[tKey] = meta;
    }

    tcsState.activeTestKey = tKey;
    tcsState.testMeta = meta;
    tcsState.isCustomMode = true;
    tcsState.isSubmitted = false;
    tcsState.responses = {};
    tcsState.currentQIdx = 0;
    tcsState.activeSectionIndex = 0;
    tcsState.selectedOptionalByGroup = {};
    tcsState.tabSwitchWarnings = 0;
    tcsState.rawAllQuestions = questionsArr;

    showSlide("slideTestAttempt");
    switchTcsStep("start-screen");
    document.getElementById("tcs-start-title").textContent = meta.title;
    document.getElementById("tcsResumeBanner")?.classList.add("hidden");
    prepareAllSectionsAndRenderStart({});
};

window.launchTcsCbtEngine = async function(tKey) {
    const t = (window.state && window.state.testMap) ? window.state.testMap[tKey] : null;
    if (!t) return;

    tcsState.activeTestKey = tKey;
    tcsState.testMeta = t;
    tcsState.isCustomMode = Boolean(t.isCustom);
    tcsState.isSubmitted = false;
    tcsState.responses = {};
    tcsState.currentQIdx = 0;
    tcsState.activeSectionIndex = 0;
    tcsState.selectedOptionalByGroup = {};
    tcsState.tabSwitchWarnings = 0;

    showSlide("slideTestAttempt");
    switchTcsStep("start-screen");

    document.getElementById("tcs-start-title").textContent = t.title || "(TCS Pattern) Mock Test";
    const subContainer = document.getElementById("subjects-selection-container");
    subContainer.innerHTML = `<div style="text-align:center; padding:18px; font-weight:700; color:#475569;">🔄 Loading Test Subjects & Questions...</div>`;

    if (typeof logUserActivity === "function") logUserActivity("OPEN_TEST", t.title || `Test #${t.id}`);

    // Check Paused Test Banner
    const paused = typeof getPausedTestState === "function" ? getPausedTestState(t.id) : null;
    const resBanner = document.getElementById("tcsResumeBanner");
    if (resBanner) resBanner.classList.toggle("hidden", !paused);

    let rawQUrl = (t.test_questions_url || t.questions_url || "").replace(/\\\//g, "/");
    let loadedQuestions = [];

    if (rawQUrl) {
        try {
            const res = await fetch(rawQUrl);
            const json = await res.json();
            loadedQuestions = Array.isArray(json) ? json : (json.data || json.questions || []);
        } catch {
            try {
                const proxyRes = await fetch(WORKER_RAW_PROXY + encodeURIComponent(rawQUrl));
                const proxyJson = await proxyRes.json();
                loadedQuestions = Array.isArray(proxyJson) ? proxyJson : (proxyJson.data || proxyJson.questions || []);
            } catch {}
        }
    }

    let externalSecMap = {};
    let rawSecUrl = (t.test_sections_url || t.test_section_url || t.section_url || "").replace(/\\\//g, "/");
    if (rawSecUrl) {
        try {
            const sRes = await fetch(rawSecUrl);
            const sJson = await sRes.json();
            const sArr = Array.isArray(sJson) ? sJson : (sJson.data || []);
            sArr.forEach(s => {
                const sid = String(s.id || s.section_id || s.part_id || "");
                if (sid) {
                    externalSecMap[sid] = {
                        name: s.title || s.section_title || s.name || s.part_title || "",
                        isOptional: String(s.is_optional || s.optional || "0") === "1",
                        optGroup: s.optional_group || "A"
                    };
                }
            });
        } catch {}
    }

    if (!loadedQuestions || loadedQuestions.length === 0) {
        loadedQuestions = DB.fallbackCbtQuestions;
    }

    tcsState.rawAllQuestions = loadedQuestions;
    prepareAllSectionsAndRenderStart(externalSecMap);
};

function switchTcsStep(activeId) {
    ["start-screen", "live-test-screen", "submit-screen", "analysis-screen", "solutions-screen", "full-sol-screen"].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.toggle("tcs-hidden", id !== activeId);
    });
}

function prepareAllSectionsAndRenderStart(externalSecMap) {
    const t = tcsState.testMeta || {};
    const groupMap = new Map();

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
    groupMap.forEach((secObj, secId) => {
        const ext = externalSecMap[secId] || {};
        const detectedName = detectSmartSubjectName(secId, secObj.questions, ext.name || secObj.rawLabel);
        const isLangSubject = ["English", "Hindi", "Marathi", "Bengali"].includes(detectedName);
        parsedSections.push({
            secId,
            name: detectedName,
            questions: secObj.questions,
            isExplicitOptional: Boolean(ext.isOptional || secObj.isExplicitOptional),
            isLangSubject,
            isOptional: false,
            optGroup: ext.optGroup || "A"
        });
    });

    const langSections = parsedSections.filter(s => s.isLangSubject);
    const firstQPosMarks = parseFloat((tcsState.rawAllQuestions[0] && tcsState.rawAllQuestions[0].positive_marks) || 2) || 2;
    const expectedActiveQs = t.marks ? Math.round(parseFloat(t.marks) / firstQPosMarks) : 0;

    const shouldEnableLangOptional = (
        !tcsState.isCustomMode &&
        langSections.length >= 2 &&
        (String(t.show_sectionselector) === "1" || parsedSections.length >= 5 || (expectedActiveQs > 0 && expectedActiveQs < tcsState.rawAllQuestions.length))
    );

    parsedSections.forEach(sec => {
        if (sec.isExplicitOptional || (shouldEnableLangOptional && sec.isLangSubject)) {
            sec.isOptional = true;
            sec.optGroup = "A";
        }
    });

    const fixedOrderPriority = { "General Awareness": 1, "General Intelligence and Reasoning": 2, "Mathematics": 3 };
    const optionalOrderPriority = { "English": 1, "Hindi": 2 };

    const fixedSecs = parsedSections.filter(s => !s.isOptional).sort((a, b) => (fixedOrderPriority[a.name] || 99) - (fixedOrderPriority[b.name] || 99));
    const optionalSecs = parsedSections.filter(s => s.isOptional).sort((a, b) => (optionalOrderPriority[a.name] || 99) - (optionalOrderPriority[b.name] || 99));

    tcsState.allParsedSections = [...fixedSecs, ...optionalSecs];
    if (optionalSecs.length > 0 && !tcsState.selectedOptionalByGroup["A"]) {
        tcsState.selectedOptionalByGroup["A"] = optionalSecs[0].secId;
    }
    renderStartScreenUI();
}

function renderStartScreenUI() {
    const t = tcsState.testMeta || {};
    const container = document.getElementById("subjects-selection-container");
    const fixedSecs = tcsState.allParsedSections.filter(s => !s.isOptional);
    const optionalSecs = tcsState.allParsedSections.filter(s => s.isOptional);

    let html = `<div class="tcs-sec-heading">📚 Subjects in this Test:</div>`;
    fixedSecs.forEach(sec => {
        html += `<div class="tcs-sub-row fixed-sub"><div class="tcs-sub-left"><span>✅</span><span>${sec.name}</span></div><span class="tcs-sub-pill">${sec.questions.length} Qs</span></div>`;
    });

    if (optionalSecs.length > 0) {
        const chosenSecId = tcsState.selectedOptionalByGroup["A"];
        html += `<div class="tcs-opt-heading">📝 Select Any One Optional Subject (A):</div>`;
        optionalSecs.forEach(sec => {
            const isSel = String(sec.secId) === String(chosenSecId);
            html += `
                <div class="tcs-sub-row opt-sub ${isSel ? "selected" : ""}" onclick="selectOptionalSubject('A', '${sec.secId}')">
                    <div class="tcs-sub-left">${isSel ? `<span style="color:#2e7d32;font-weight:900;">✓</span>` : ""}<span>${sec.name}</span></div>
                    <span class="tcs-sub-pill">${sec.questions.length} Qs</span>
                </div>`;
        });
    }
    container.innerHTML = html;

    const activeSecs = getActiveChosenSections();
    let totalActiveQs = 0, totalActiveMarks = 0;
    activeSecs.forEach(sec => {
        totalActiveQs += sec.questions.length;
        sec.questions.forEach(q => { totalActiveMarks += parseFloat(q.positive_marks || 2.0); });
    });
    if (t.marks && !isNaN(parseFloat(t.marks)) && optionalSecs.length > 0) totalActiveMarks = parseFloat(t.marks);

    const rawTimeStr = String(t.time || "60").trim();
    const totalMins = rawTimeStr.includes("+")
        ? rawTimeStr.split("+").reduce((acc, v) => acc + (parseInt(v.trim()) || 0), 0)
        : (parseInt(rawTimeStr) || 60);

    const statsBox = document.querySelector("#start-screen .stats-box");
    if (statsBox) {
        statsBox.innerHTML = `
            <div class="start-info"><span>Total Questions:</span> <span id="stat-qs">${totalActiveQs}</span></div>
            <div class="start-info"><span>Total Time:</span> <span id="stat-time">${totalMins} mins</span></div>
            <div class="start-info"><span>Maximum Marks:</span> <span id="stat-marks">${Math.round(totalActiveMarks)}</span></div>
        `;
    }
}

window.selectOptionalSubject = function(groupKey, secId) {
    tcsState.selectedOptionalByGroup[groupKey] = String(secId);
    renderStartScreenUI();
};

function getActiveChosenSections() {
    const chosenOptId = tcsState.selectedOptionalByGroup["A"];
    return tcsState.allParsedSections.filter(sec => !sec.isOptional || String(sec.secId) === String(chosenOptId));
}

// =========================================================
// STEP 2: LIVE CBT TEST + AUTO-SAVE / RESUME + SHORTCUTS
// =========================================================
window.startTest = function(resumePayload = null) {
    const t = tcsState.testMeta || {};
    if (resumePayload && resumePayload.selectedOptionalByGroup) {
        tcsState.selectedOptionalByGroup = resumePayload.selectedOptionalByGroup;
    }

    const chosenSecs = getActiveChosenSections();
    const flatQuestions = [];
    tcsState.activeSections = chosenSecs.map(sec => {
        const mappedQs = sec.questions.map(q => {
            const newGlobalIdx = flatQuestions.length;
            const qCopy = { ...q, originalIndex: newGlobalIdx, _sectionName: sec.name };
            flatQuestions.push(qCopy);
            return qCopy;
        });
        return { secId: sec.secId, name: sec.name, questions: mappedQs };
    });

    tcsState.questions = flatQuestions;
    tcsState.responses = (resumePayload && resumePayload.responses) ? resumePayload.responses : {};
    tcsState.currentQIdx = (resumePayload && Number.isFinite(resumePayload.currentQIdx)) ? resumePayload.currentQIdx : 0;
    tcsState.activeSectionIndex = (resumePayload && Number.isFinite(resumePayload.activeSectionIndex)) ? resumePayload.activeSectionIndex : 0;
    tcsState.tabSwitchWarnings = 0;

    const badge = document.getElementById("tcsTabSwitchBadge");
    if (badge) badge.classList.add("hidden");

    const tStr = String(t.time || "60").trim();
    if (tStr.includes("+")) {
        const parts = tStr.split("+").map(n => (parseInt(n.trim()) || 15) * 60);
        tcsState.isSectionalTiming = true;
        tcsState.sectionTimeAllocated = tcsState.activeSections.map((_, i) => parts[i] || parts[0] || 900);
        tcsState.sectionSecondsLeft = (resumePayload && Array.isArray(resumePayload.sectionSecondsLeft))
            ? resumePayload.sectionSecondsLeft
            : [...tcsState.sectionTimeAllocated];
        tcsState.secondsLeft = tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] || tcsState.sectionTimeAllocated[0];
        tcsState.totalInitialSeconds = tcsState.sectionTimeAllocated.reduce((a, b) => a + b, 0);
    } else {
        const totalMins = parseInt(tStr) || 60;
        tcsState.isSectionalTiming = false;
        tcsState.totalInitialSeconds = totalMins * 60;
        tcsState.secondsLeft = (resumePayload && Number.isFinite(resumePayload.secondsLeft))
            ? resumePayload.secondsLeft
            : totalMins * 60;
    }

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
    if (saved) {
        startTest(saved);
        if (typeof proToast === "function") proToast("▶ Paused test resumed!", "success");
    }
};

function persistPausedTestProgress() {
    if (tcsState.isSubmitted || !tcsState.testMeta || tcsState.isCustomMode) return;
    if (typeof savePausedTestState === "function") {
        savePausedTestState(tcsState.testMeta.id, {
            title: tcsState.testMeta.title,
            testMeta: tcsState.testMeta,
            selectedOptionalByGroup: tcsState.selectedOptionalByGroup,
            responses: tcsState.responses,
            currentQIdx: tcsState.currentQIdx,
            activeSectionIndex: tcsState.activeSectionIndex,
            secondsLeft: tcsState.secondsLeft,
            sectionSecondsLeft: tcsState.sectionSecondsLeft
        });
    }
}

window.pauseAndExitTcsTest = function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    persistPausedTestProgress();
    if (typeof proToast === "function") proToast("⏸️ Test paused & auto-saved! Kabhi bhi resume karein.", "info");
    showSlide("slideExplorer");
};

function formatMMSS(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}

function formatHHMMSS(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    const hrs = String(Math.floor(sec / 3600)).padStart(2, "0");
    const mins = String(Math.floor((sec % 3600) / 60)).padStart(2, "0");
    const secs = String(sec % 60).padStart(2, "0");
    return `${hrs}:${mins}:${secs}`;
}

let _tcsAutoSaveTick = 0;
function startTcsTimer() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    tcsState.timerInterval = setInterval(() => {
        if (tcsState.isSubmitted) return;

        const curIdx = tcsState.currentQIdx;
        if (!tcsState.responses[curIdx]) {
            tcsState.responses[curIdx] = { status: "unattempted", chosenOption: null, timeSpent: 0 };
        }
        tcsState.responses[curIdx].timeSpent = (tcsState.responses[curIdx].timeSpent || 0) + 1;

        const qTimeEl = document.getElementById("tcs-q-time");
        if (qTimeEl) qTimeEl.textContent = formatMMSS(tcsState.responses[curIdx].timeSpent);

        _tcsAutoSaveTick++;
        if (_tcsAutoSaveTick % 12 === 0) persistPausedTestProgress();

        if (tcsState.secondsLeft <= 0) {
            if (tcsState.isSectionalTiming && tcsState.activeSectionIndex < tcsState.activeSections.length - 1) {
                tcsState.activeSectionIndex++;
                tcsState.secondsLeft = tcsState.sectionSecondsLeft[tcsState.activeSectionIndex];
                renderTcsTabs();
                const firstQ = tcsState.activeSections[tcsState.activeSectionIndex].questions[0];
                if (firstQ) loadQuestion(firstQ.originalIndex);
                return;
            }
            clearInterval(tcsState.timerInterval);
            submitTest();
            return;
        }

        tcsState.secondsLeft--;
        if (tcsState.isSectionalTiming) {
            tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] = tcsState.secondsLeft;
        }
        const timerEl = document.getElementById("tcs-timer-display");
        if (timerEl) timerEl.textContent = formatHHMMSS(tcsState.secondsLeft);
    }, 1000);
}

// Strict Exam Simulation: Tab Switch Counter
document.addEventListener("visibilitychange", () => {
    const liveEl = document.getElementById("live-test-screen");
    if (document.hidden && liveEl && !liveEl.classList.contains("tcs-hidden") && !tcsState.isSubmitted) {
        tcsState.tabSwitchWarnings++;
        persistPausedTestProgress();
        const badge = document.getElementById("tcsTabSwitchBadge");
        if (badge) {
            badge.textContent = `⚠️ ${tcsState.tabSwitchWarnings}`;
            badge.classList.remove("hidden");
        }
        if (typeof proToast === "function") {
            proToast(`⚠️ Exam Discipline Alert: Tab switch #${tcsState.tabSwitchWarnings} detected!`, "warning");
        }
    }
});

// PC Keyboard Shortcuts during Live Test
document.addEventListener("keydown", (e) => {
    const liveEl = document.getElementById("live-test-screen");
    if (!liveEl || liveEl.classList.contains("tcs-hidden") || tcsState.isSubmitted) return;
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    if (["1", "2", "3", "4"].includes(e.key)) { selectTcsOption(e.key); }
    else if (e.key === "Enter") { e.preventDefault(); saveAndNext(); }
    else if (e.key.toLowerCase() === "m") { markForReview(); }
    else if (e.key.toLowerCase() === "c") { clearResponse(); }
    else if (e.key === "ArrowRight") { nextQuestion(); }
    else if (e.key === "ArrowLeft") { prevQuestion(); }
});

// Font Zoom & Night Exam Mode
function applyTcsFontSize() {
    const qEl = document.getElementById("tcs-q-text");
    const optEl = document.getElementById("tcs-options-container");
    if (qEl) qEl.style.fontSize = `${tcsState.fontSizePx}px`;
    if (optEl) optEl.style.fontSize = `${Math.max(13, tcsState.fontSizePx - 1)}px`;
}

window.adjustTcsFont = function(delta) {
    tcsState.fontSizePx = Math.min(24, Math.max(13, tcsState.fontSizePx + delta));
    if (window.PRO_STORE && PRO_STORE.preferences) {
        PRO_STORE.preferences.fontSize = tcsState.fontSizePx;
    }
    applyTcsFontSize();
};

window.toggleTcsNightMode = function() {
    const shell = document.getElementById("tcs-app-wrapper");
    if (!shell) return;
    const isNight = shell.classList.toggle("tcs-night-exam");
    const btn = document.getElementById("tcsNightBtn");
    if (btn) btn.textContent = isNight ? "☀️" : "🌙";
};

function renderTcsTabs() {
    const wrap = document.getElementById("tcs-tabs-container");
    if (!wrap) return;
    wrap.innerHTML = "";
    tcsState.activeSections.forEach((sec, idx) => {
        const cls = idx === tcsState.activeSectionIndex ? "tcs-tab active" : "tcs-tab";
        wrap.innerHTML += `<div class="${cls}" onclick="switchTcsSection(${idx})">${sec.name}</div>`;
    });
}

window.switchTcsSection = function(secIdx) {
    if (tcsState.isSectionalTiming) {
        tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] = tcsState.secondsLeft;
        tcsState.secondsLeft = tcsState.sectionSecondsLeft[secIdx];
    }
    tcsState.activeSectionIndex = secIdx;
    renderTcsTabs();
    const firstQInSec = tcsState.activeSections[secIdx].questions[0];
    if (firstQInSec) loadQuestion(firstQInSec.originalIndex);
};

function updateLiveBookmarkBtn(q) {
    const btn = document.getElementById("tcsBookmarkBtn");
    if (!btn || !q) return;
    const qId = String(q.id || q.question_id || ("q_" + (q.question || "").slice(0, 28)));
    const saved = typeof isQuestionBookmarked === "function" && isQuestionBookmarked(qId);
    btn.textContent = saved ? "⭐ Saved" : "☆ Save";
}

window.toggleBookmarkCurrentQuestion = function() {
    const q = tcsState.questions[tcsState.currentQIdx];
    if (!q || typeof toggleQuestionBookmark !== "function") return;
    toggleQuestionBookmark(q, tcsState.testMeta || {});
    updateLiveBookmarkBtn(q);
};

function loadQuestion(globalIdx) {
    tcsState.currentQIdx = globalIdx;
    const q = tcsState.questions[globalIdx];
    if (!q) return;

    if (!tcsState.responses[globalIdx]) {
        tcsState.responses[globalIdx] = { status: "unattempted", chosenOption: null, timeSpent: 0 };
    }

    let foundSecIdx = tcsState.activeSectionIndex;
    tcsState.activeSections.forEach((sec, sIdx) => {
        if (sec.questions.some(sq => sq.originalIndex === globalIdx)) foundSecIdx = sIdx;
    });
    if (foundSecIdx !== tcsState.activeSectionIndex) {
        if (tcsState.isSectionalTiming) {
            tcsState.sectionSecondsLeft[tcsState.activeSectionIndex] = tcsState.secondsLeft;
            tcsState.secondsLeft = tcsState.sectionSecondsLeft[foundSecIdx];
        }
        tcsState.activeSectionIndex = foundSecIdx;
    }
    renderTcsTabs();

    document.getElementById("tcs-q-num").textContent = globalIdx + 1;
    const qTimeEl = document.getElementById("tcs-q-time");
    if (qTimeEl) qTimeEl.textContent = formatMMSS(tcsState.responses[globalIdx].timeSpent || 0);

    const posNum = parseFloat(q.positive_marks || 2);
    const negNum = parseFloat(q.negative_marks || 0.25);
    document.getElementById("tcs-live-pos").textContent = `+${Number.isInteger(posNum) ? posNum : posNum.toFixed(2)}`;
    document.getElementById("tcs-live-neg").textContent = `-${Number.isInteger(negNum) ? negNum : negNum}`;
    updateLiveBookmarkBtn(q);

    const qTxtBox = document.getElementById("tcs-q-text");
    const rawQHtml = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi))
        ? (q.question_hi || q.question_hindi)
        : (q.question || q.question_text || "");
    qTxtBox.innerHTML = cleanQuestionHtml(rawQHtml);

    const optBox = document.getElementById("tcs-options-container");
    optBox.innerHTML = "";
    const chosen = (tcsState.responses[globalIdx] || {}).chosenOption;
    const letters = ["A", "B", "C", "D", "E"];

    const opts = [
        { id: "1", text: q.option_1 || q.opt1 },
        { id: "2", text: q.option_2 || q.opt2 },
        { id: "3", text: q.option_3 || q.opt3 },
        { id: "4", text: q.option_4 || q.opt4 },
        q.option_5 ? { id: "5", text: q.option_5 } : null
    ].filter(Boolean);

    opts.forEach((opt, oIdx) => {
        const isSel = String(chosen) === String(opt.id);
        optBox.innerHTML += `
            <div class="${isSel ? "tcs-option selected" : "tcs-option"}" onclick="selectTcsOption('${opt.id}')">
                <span class="tcs-opt-letter">${letters[oIdx] || opt.id}.</span>
                <div style="flex: 1; word-break: break-word;">${cleanQuestionHtml(opt.text || "")}</div>
            </div>`;
    });

    applyTcsFontSize();
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([qTxtBox, optBox]).catch(() => {});
}

window.selectTcsOption = function(optId) {
    const idx = tcsState.currentQIdx;
    const prevTime = (tcsState.responses[idx] && tcsState.responses[idx].timeSpent) || 0;
    tcsState.responses[idx] = { status: "attempted", chosenOption: optId, timeSpent: prevTime };
    loadQuestion(idx);
};

window.saveAndNext = function() {
    const idx = tcsState.currentQIdx;
    const cur = tcsState.responses[idx] || { timeSpent: 0 };
    cur.status = cur.chosenOption ? "attempted" : "unattempted";
    tcsState.responses[idx] = cur;
    nextQuestion();
};

window.markForReview = function() {
    const idx = tcsState.currentQIdx;
    const cur = tcsState.responses[idx] || { timeSpent: 0 };
    tcsState.responses[idx] = { ...cur, status: cur.chosenOption ? "marked_attempted" : "marked" };
    nextQuestion();
};

window.clearResponse = function() {
    const idx = tcsState.currentQIdx;
    const prevTime = (tcsState.responses[idx] && tcsState.responses[idx].timeSpent) || 0;
    tcsState.responses[idx] = { status: "unattempted", chosenOption: null, timeSpent: prevTime };
    loadQuestion(idx);
};

window.nextQuestion = function() {
    if (tcsState.currentQIdx < tcsState.questions.length - 1) loadQuestion(tcsState.currentQIdx + 1);
};
window.prevQuestion = function() {
    if (tcsState.currentQIdx > 0) loadQuestion(tcsState.currentQIdx - 1);
};

window.toggleTcsLangMode = function() {
    tcsState.lang = tcsState.lang === "en" ? "hi" : "en";
    if (!document.getElementById("live-test-screen").classList.contains("tcs-hidden")) loadQuestion(tcsState.currentQIdx);
    else if (!document.getElementById("solutions-screen").classList.contains("tcs-hidden")) renderSolutionsList(tcsState.activeSolFilter);
    else if (!document.getElementById("full-sol-screen").classList.contains("tcs-hidden")) renderFullSolutionContent(tcsState.activeFullSolIdx);
};

window.toggleTcsPalette = function() {
    const palette = document.getElementById("tcs-palette");
    palette.classList.toggle("show");
    if (palette.classList.contains("show")) renderTcsAccordionGrid();
};

function renderTcsAccordionGrid() {
    const cont = document.getElementById("tcs-accordion-container");
    cont.innerHTML = "";
    tcsState.activeSections.forEach((sec, sIdx) => {
        let att = 0, una = 0, mar = 0;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex];
            if (r && (r.status === "attempted" || r.status === "marked_attempted")) att++;
            else if (r && r.status === "marked") mar++;
            else una++;
        });
        let gridHtml = `<div class="tcs-q-grid open" id="grid_sec_${sIdx}">`;
        sec.questions.forEach(sq => {
            const gIdx = sq.originalIndex;
            const r = tcsState.responses[gIdx];
            let boxCls = "tcs-q-box st-not-ans";
            if (r) {
                if (r.status === "attempted") boxCls = "tcs-q-box st-ans";
                else if (r.status === "marked") boxCls = "tcs-q-box st-mark";
                else if (r.status === "marked_attempted") boxCls = "tcs-q-box st-mark-ans";
            }
            gridHtml += `<div class="${boxCls}" onclick="jumpToQuestion(${gIdx})">${gIdx + 1}</div>`;
        });
        gridHtml += `</div>`;
        cont.innerHTML += `
            <div class="tcs-accordion">
                <div class="tcs-acc-header" onclick="toggleGridSec(${sIdx})"><span>${sec.name}</span><span>▼</span></div>
                <div class="tcs-acc-stats"><span>Attempted: ${att}</span><span>Marked: ${mar}</span><span>Unattempted: ${una}</span></div>
                ${gridHtml}
            </div>`;
    });
}
window.toggleGridSec = function(sIdx) { document.getElementById(`grid_sec_${sIdx}`)?.classList.toggle("open"); };
window.jumpToQuestion = function(gIdx) { toggleTcsPalette(); loadQuestion(gIdx); };

// =========================================================
// STEP 3: SUBMIT SUMMARY
// =========================================================
window.handleDynamicSubmit = function() { prepareSubmit(); };

window.prepareSubmit = function() {
    document.getElementById("tcs-palette").classList.remove("show");
    switchTcsStep("submit-screen");

    const cont = document.getElementById("submit-summary-container");
    cont.innerHTML = tcsState.activeSections.map(sec => {
        let att = 0, una = 0, mar = 0;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex];
            if (r && (r.status === "attempted" || r.status === "marked_attempted")) att++;
            else if (r && r.status === "marked") mar++;
            else una++;
        });
        return `
            <div class="section-summary-card">
                <h3 style="font-weight:800; color:#1a237e; margin-bottom:10px;">${sec.name}</h3>
                <div class="stat-row"><span>Total Questions:</span> <strong>${sec.questions.length}</strong></div>
                <div class="stat-row"><span>Attempted:</span> <strong style="color:#2563eb;">${att}</strong></div>
                <div class="stat-row"><span>Marked for Review:</span> <strong style="color:#d97706;">${mar}</strong></div>
                <div class="stat-row"><span>Unattempted:</span> <strong style="color:#64748b;">${una}</strong></div>
            </div>`;
    }).join("");
};

window.closeSubmit = function() { switchTcsStep("live-test-screen"); };

// =========================================================
// STEP 4: RESULT, TIME-TRAP, MISTAKE BANK & REAL ALL-INDIA LEADERBOARD
// =========================================================
window.submitTest = async function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    tcsState.isSubmitted = true;
    switchTcsStep("analysis-screen");

    if (tcsState.testMeta && typeof clearPausedTestState === "function") {
        clearPausedTestState(tcsState.testMeta.id);
    }

    let correct = 0, incorrect = 0, unattempted = 0, score = 0;
    let timeCorr = 0, timeInc = 0, timeUna = 0;
    let maxMarks = 0;
    const wrongForMistakeBank = [];
    const timeTraps = [];
    const fastGuesses = [];

    tcsState.questions.forEach((q, i) => {
        const pos = parseFloat(q.positive_marks || 2.0);
        const neg = parseFloat(q.negative_marks || 0.25);
        maxMarks += pos;

        const r = tcsState.responses[i] || {};
        const spent = r.timeSpent || 0;
        const correctAns = String(q.answer || q.correct_option || "1").trim();

        if (!r.chosenOption) {
            unattempted++;
            timeUna += spent;
        } else if (String(r.chosenOption) === correctAns) {
            correct++;
            score += pos;
            timeCorr += spent;
        } else {
            incorrect++;
            score -= neg;
            timeInc += spent;
            wrongForMistakeBank.push({ qObj: q, chosenOption: r.chosenOption });
            if (spent >= 60) timeTraps.push({ idx: i, q, spent });
            if (spent > 0 && spent <= 5) fastGuesses.push({ idx: i, q, spent });
        }
    });

    score = parseFloat(score.toFixed(2));
    maxMarks = Math.round(maxMarks);
    const accuracy = (correct + incorrect) > 0 ? Math.round((correct / (correct + incorrect)) * 100) : 0;
    const totalSpentSec = timeCorr + timeInc + timeUna;

    tcsState.lastSubmittedScore = score;
    tcsState.lastMaxMarks = maxMarks;
    tcsState.lastWrongQuestions = wrongForMistakeBank.map(x => x.qObj);

    // Save Wrong Answers to Mistake Notebook + Study Minutes
    if (wrongForMistakeBank.length && typeof addMistakeQuestions === "function") {
        addMistakeQuestions(wrongForMistakeBank, tcsState.testMeta || {});
    }
    if (totalSpentSec >= 30 && typeof addStudyMinutes === "function") {
        addStudyMinutes(totalSpentSec / 60);
    }

    document.getElementById("res-score").textContent = `${score}/${maxMarks}`;
    document.getElementById("res-correct").textContent = correct;
    document.getElementById("res-incorrect").textContent = incorrect;
    document.getElementById("res-unatt").textContent = unattempted;
    document.getElementById("res-acc").textContent = `${accuracy}%`;
    document.getElementById("res-rank").textContent = "Syncing...";
    document.getElementById("res-perc").textContent = "--";

    // Comparison initial values
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

    // Donut & Time Stats
    const totalQ = tcsState.questions.length || 1;
    const cDeg = (correct / totalQ) * 360;
    const wDeg = cDeg + (incorrect / totalQ) * 360;
    const donut = document.getElementById("res-donut");
    if (donut) donut.style.background = `conic-gradient(#4caf50 0deg ${cDeg}deg, #e53935 ${cDeg}deg ${wDeg}deg, #5c6bc0 ${wDeg}deg 360deg)`;

    document.getElementById("ts-box-corr").innerHTML = `Correct<br>${formatMMSS(timeCorr)}`;
    document.getElementById("ts-box-una").innerHTML = `Unattempted: ${formatMMSS(timeUna)}`;
    document.getElementById("ts-box-inc").innerHTML = `Incorrect<br>${formatMMSS(timeInc)}`;

    // Time-Trap & Tukka Detector Card
    const trapBox = document.getElementById("tcsTimeTrapList");
    if (trapBox) {
        let tHtml = "";
        if (timeTraps.length) {
            tHtml += `<div class="p-3 rounded-xl bg-rose-50 border border-rose-200"><div class="font-black text-rose-700 mb-1">⏳ Time Traps (${timeTraps.length} Wrong Qs > 60s):</div><div class="flex flex-wrap gap-1.5">${timeTraps.map(x => `<button onclick="openFullSolution(${x.idx})" class="px-2 py-1 rounded-lg bg-rose-600 text-white font-bold text-[11px] border-0 cursor-pointer">Q${x.idx + 1} (${x.spent}s)</button>`).join("")}</div></div>`;
        }
        if (fastGuesses.length) {
            tHtml += `<div class="p-3 rounded-xl bg-amber-50 border border-amber-200"><div class="font-black text-amber-800 mb-1">🎲 Fast Guesses / Tukka (${fastGuesses.length} Wrong Qs ≤ 5s):</div><div class="flex flex-wrap gap-1.5">${fastGuesses.map(x => `<button onclick="openFullSolution(${x.idx})" class="px-2 py-1 rounded-lg bg-amber-600 text-white font-bold text-[11px] border-0 cursor-pointer">Q${x.idx + 1} (${x.spent}s)</button>`).join("")}</div></div>`;
        }
        if (!tHtml) {
            tHtml = `<div class="p-3 rounded-xl bg-emerald-50 text-emerald-800 font-bold">✅ Great Discipline! Koi major Time-Trap ya Fast Tukka detect nahi hua.</div>`;
        }
        trapBox.innerHTML = tHtml;
    }

    // Remark Banner
    const rem = document.getElementById("dynamic-remark");
    if (rem) {
        rem.style.display = "block";
        if (accuracy >= 80 && correct > 0) { rem.className = "remark-banner rem-excellent"; rem.textContent = "🎉 Excellent Performance! Keep it up!"; }
        else if (accuracy >= 50 && correct > 0) { rem.className = "remark-banner rem-great"; rem.textContent = "👍 Good Attempt! Practice more to reach the top."; }
        else { rem.className = "remark-banner rem-poor"; rem.textContent = "⚠️ Needs Improvement! Review Time-Traps & Mistake Notebook."; }
    }

    // Section-wise Analysis + Weak Areas
    const sCont = document.getElementById("analysis-sections-container");
    const weakCard = document.getElementById("weak-areas-card");
    const weakList = document.getElementById("weak-areas-list");
    sCont.innerHTML = "";
    const weakSubjects = [];
    const sectionStatsPayload = [];

    tcsState.activeSections.forEach(sec => {
        let sCorr = 0, sInc = 0, sUna = 0, sScore = 0, stCorr = 0, stInc = 0, stUna = 0;
        sec.questions.forEach(sq => {
            const r = tcsState.responses[sq.originalIndex] || {};
            const ans = String(sq.answer || sq.correct_option || "1").trim();
            const pos = parseFloat(sq.positive_marks || 2.0);
            const neg = parseFloat(sq.negative_marks || 0.25);
            const sp = r.timeSpent || 0;
            if (!r.chosenOption) { sUna++; stUna += sp; }
            else if (String(r.chosenOption) === ans) { sCorr++; sScore += pos; stCorr += sp; }
            else { sInc++; sScore -= neg; stInc += sp; }
        });

        const sAcc = (sCorr + sInc) > 0 ? Math.round((sCorr / (sCorr + sInc)) * 100) : 0;
        if (sAcc < 50 || sCorr < sec.questions.length * 0.35) {
            weakSubjects.push(`${sec.name} (Accuracy: ${sAcc}%, Correct: ${sCorr}/${sec.questions.length})`);
        }
        sectionStatsPayload.push({ name: sec.name, score: Number(sScore.toFixed(1)), correct: sCorr, incorrect: sInc, unattempted: sUna, accuracy: sAcc });

        sCont.innerHTML += `
            <div class="a-card">
                <div class="subj-header">
                    <div class="subj-name">${sec.name}</div>
                    <div class="black-circle"><span>Score</span><span>${sScore.toFixed(1)}</span></div>
                </div>
                <div class="subj-q-stats">Total Questions: ${sec.questions.length} • Accuracy: ${sAcc}%</div>
                <div class="time-split">
                    <div class="col"><div class="c-green">Correct</div><div class="val-num">${sCorr}</div><div class="val-time">${formatMMSS(stCorr)}</div></div>
                    <div class="col"><div class="c-red">Incorrect</div><div class="val-num">${sInc}</div><div class="val-time">${formatMMSS(stInc)}</div></div>
                    <div class="col"><div class="c-grey">Unattempted</div><div class="val-num">${sUna}</div><div class="val-time">${formatMMSS(stUna)}</div></div>
                </div>
            </div>`;
    });

    if (weakCard && weakList) {
        if (weakSubjects.length) {
            weakCard.style.display = "block";
            weakList.innerHTML = weakSubjects.map(w => `<li>${w}</li>`).join("");
        } else {
            weakCard.style.display = "none";
        }
    }

    // Submit to 4-MongoDB Backend & Render Real All-India Leaderboard
    const attemptPayload = {
        user_id: typeof getActiveUserId === "function" ? getActiveUserId() : "guest",
        user_name: typeof getActiveUserName === "function" ? getActiveUserName() : "RWA Student",
        test_id: String((tcsState.testMeta && tcsState.testMeta.id) || "custom"),
        test_title: (tcsState.testMeta && tcsState.testMeta.title) || "Mock Test",
        series_id: String((tcsState.testMeta && tcsState.testMeta.seriesId) || ""),
        score, max_marks: maxMarks, correct, incorrect, unattempted, accuracy,
        time_taken_sec: totalSpentSec,
        section_stats: sectionStatsPayload,
        time_traps_count: timeTraps.length,
        fast_guesses_count: fastGuesses.length
    };

    if (typeof saveTestAttemptToVault === "function") {
        saveTestAttemptToVault({ ...attemptPayload, submitted_at: new Date().toLocaleString() });
    }

    syncScoreAndRenderLeaderboard(attemptPayload, score, maxMarks);
};

async function syncScoreAndRenderLeaderboard(attemptPayload, score, maxMarks) {
    const lbBody = document.getElementById("tcsLeaderboardBody");
    const lbBadge = document.getElementById("lbParticipantsBadge");
    try {
        const res = await fetch(`${PRO_API_BASE}/api/test/submit`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(attemptPayload)
        });
        const json = await res.json();
        if (json && json.status === "success" && json.leaderboard) {
            const lb = json.leaderboard;
            document.getElementById("res-rank").textContent = lb.my_rank ? `#${lb.my_rank}/${lb.total_participants}` : "#1";
            document.getElementById("res-perc").textContent = `${lb.my_percentile ?? 100}%`;

            if (lb.topper) {
                document.getElementById("cmp-top").textContent = lb.topper.score;
                document.getElementById("cmp-top-a").textContent = `${lb.topper.accuracy}%`;
                document.getElementById("cmp-top-c").textContent = lb.topper.correct;
                document.getElementById("cmp-top-w").textContent = lb.topper.incorrect;
            }
            if (lb.total_participants > 0) {
                document.getElementById("cmp-avg").textContent = lb.avg_score;
                document.getElementById("cmp-avg-a").textContent = `${lb.avg_accuracy}%`;
            }

            if (lbBadge) lbBadge.textContent = `${lb.total_participants} Students`;
            if (lbBody) {
                const myUid = String(attemptPayload.user_id);
                lbBody.innerHTML = (lb.top_10 || []).map(row => {
                    const isMe = String(row.user_id) === myUid;
                    const medal = row.rank === 1 ? "🥇" : row.rank === 2 ? "🥈" : row.rank === 3 ? "🥉" : `#${row.rank}`;
                    return `
                        <div class="flex justify-between items-center p-2.5 rounded-xl ${isMe ? "bg-indigo-100 border border-indigo-400 font-black" : "bg-slate-50 border border-slate-200"}">
                            <div class="flex items-center gap-2 min-w-0">
                                <span class="font-black text-indigo-800 w-7">${medal}</span>
                                <span class="truncate font-bold">${escHtml(row.user_name)}${isMe ? " (You)" : ""}</span>
                            </div>
                            <div class="text-right shrink-0">
                                <span class="font-black text-blue-700">${row.score}/${row.max_marks}</span>
                                <span class="text-[10px] text-emerald-700 ml-1">(${row.accuracy}%)</span>
                            </div>
                        </div>`;
                }).join("");
            }
            return;
        }
    } catch {}

    // Offline fallback
    document.getElementById("res-rank").textContent = score >= maxMarks * 0.75 ? "#12" : "#148";
    document.getElementById("res-perc").textContent = `${Math.min(99.5, Math.max(15, (score / (maxMarks || 1)) * 100 + 10)).toFixed(1)}%`;
    if (lbBody) lbBody.innerHTML = `<div class="text-slate-500 font-bold text-center py-2">Offline mode: Live leaderboard next sync par update hoga.</div>`;
}

window.reAttemptWrongOnlyFromCurrent = function() {
    if (!tcsState.lastWrongQuestions || !tcsState.lastWrongQuestions.length) {
        if (typeof proToast === "function") proToast("🎉 Koi wrong question nahi hai — 100% clean!", "success");
        return;
    }
    window.launchCustomQuestionsTcs(
        `❌ Wrong Only: ${(tcsState.testMeta && tcsState.testMeta.title) || "Test"}`,
        tcsState.lastWrongQuestions,
        Math.max(5, Math.ceil(tcsState.lastWrongQuestions.length * 0.8))
    );
};

window.exportTestPdfSheet = function() {
    const title = (tcsState.testMeta && tcsState.testMeta.title) || "RWA Mock Test Scorecard";
    const rowsHtml = tcsState.questions.map((q, i) => {
        const r = tcsState.responses[i] || {};
        const ans = String(q.answer || q.correct_option || "1").trim();
        const status = !r.chosenOption ? "Unattempted" : (String(r.chosenOption) === ans ? "Correct ✓" : `Wrong ✕ (Your: ${r.chosenOption})`);
        return `
            <div style="margin-bottom:14px;padding:10px;border:1px solid #cbd5e1;border-radius:8px;page-break-inside:avoid;">
                <div style="font-weight:bold;color:#1a237e;font-size:13px;">Q${i + 1}. [${q._sectionName || "General"}] — ${status}</div>
                <div style="margin:6px 0;font-size:13px;">${q.question || q.question_text || ""}</div>
                <div style="font-size:12px;color:#334155;">
                    A) ${q.option_1 || ""} &nbsp;|&nbsp; B) ${q.option_2 || ""} &nbsp;|&nbsp; C) ${q.option_3 || ""} &nbsp;|&nbsp; D) ${q.option_4 || ""}
                </div>
                <div style="margin-top:6px;font-size:12px;color:#15803d;"><b>Correct Option: ${ans}</b> — ${q.solution_text || q.explanation || ""}</div>
            </div>`;
    }).join("");

    const win = window.open("", "_blank");
    if (!win) return proToast("Popup blocked! Browser popup allow karein PDF print ke liye.", "warning");
    win.document.write(`
        <html><head><title>${title}</title>
        <style>body{font-family:Arial,sans-serif;padding:20px;color:#0f172a;} img{max-width:260px;height:auto;}</style></head>
        <body>
            <h2 style="color:#1a237e;margin-bottom:4px;">${title}</h2>
            <p style="font-size:13px;font-weight:bold;">Score: ${tcsState.lastSubmittedScore}/${tcsState.lastMaxMarks} • Student: ${typeof getActiveUserName === "function" ? getActiveUserName() : "RWA Student"}</p>
            <hr style="margin:14px 0;">
            ${rowsHtml}
            <script>setTimeout(()=>window.print(), 400);</script>
        </body></html>`);
    win.document.close();
};

window.reAttemptTcsTest = function() {
    if (tcsState.isCustomMode) {
        window.launchCustomQuestionsTcs(tcsState.testMeta.title, tcsState.rawAllQuestions, parseInt(tcsState.testMeta.time || "15", 10));
    } else {
        window.launchTcsCbtEngine(tcsState.activeTestKey);
    }
};

window.exitTcsTest = function() {
    if (tcsState.timerInterval) clearInterval(tcsState.timerInterval);
    showSlide(tcsState.isCustomMode ? "slideVault" : "slideExplorer");
};

// =========================================================
// STEP 5 & 6: SOLUTIONS + BOOKMARK + FLASHCARD + COPY DOUBT
// =========================================================
window.openSolutions = function() {
    switchTcsStep("solutions-screen");
    tcsState.activeSolFilter = "all";
    renderSolutionsList("all");
};

window.closeSolutions = function() { switchTcsStep("analysis-screen"); };

window.filterSol = function(filterType, btnEl) {
    document.querySelectorAll(".flt-btn").forEach(b => b.classList.remove("flt-active"));
    if (btnEl) btnEl.classList.add("flt-active");
    tcsState.activeSolFilter = filterType;
    renderSolutionsList(filterType);
};

function renderSolutionsList(filter) {
    const cont = document.getElementById("sol-list-container");
    cont.innerHTML = "";
    tcsState.questions.forEach((q, idx) => {
        const r = tcsState.responses[idx];
        const correctAns = String(q.answer || q.correct_option || "1").trim();
        const hasChosen = r && r.chosenOption;
        const isCorr = hasChosen && String(r.chosenOption) === correctAns;
        const isInc = hasChosen && !isCorr;
        const isUna = !hasChosen;

        if (filter === "correct" && !isCorr) return;
        if (filter === "incorrect" && !isInc) return;
        if (filter === "unattempted" && !isUna) return;

        let badgeClass = "st-una", iconHtml = "−";
        if (isCorr) { badgeClass = "st-corr"; iconHtml = "✓"; }
        else if (isInc) { badgeClass = "st-wr"; iconHtml = "✕"; }

        const qText = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi))
            ? (q.question_hi || q.question_hindi)
            : (q.question || q.question_text || "");

        cont.innerHTML += `
            <div class="sol-item" onclick="openFullSolution(${idx})" style="cursor:pointer;">
                <div class="sol-num-col">
                    <div class="sol-num">${idx + 1}<div class="sol-status-icon ${badgeClass}">${iconHtml}</div></div>
                    <div class="sol-line"></div>
                </div>
                <div class="sol-card">
                    <span class="sol-sec-badge">${q._sectionName || "General"}</span>
                    <div class="sol-q-txt">${cleanQuestionHtml(qText)}</div>
                    <div style="font-size:12px; font-weight:800; color:#1a237e;">View Full Solution ➔</div>
                </div>
            </div>`;
    });
    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([cont]).catch(() => {});
}

window.openFullSolution = function(idx) {
    tcsState.activeFullSolIdx = idx;
    switchTcsStep("full-sol-screen");
    renderFullSolutionContent(idx);
};

function renderFullSolutionContent(idx) {
    const q = tcsState.questions[idx];
    if (!q) return;
    const r = tcsState.responses[idx] || {};
    const correctAns = String(q.answer || q.correct_option || "1").trim();

    document.getElementById("fs-q-num").textContent = `Question ${idx + 1} (${q._sectionName || ""})`;
    const tcBox = document.getElementById("fs-q-time-compare");
    if (tcBox) tcBox.innerHTML = `<span class="time-compare-badge"><span class="tc-you">⏱️ You: ${formatMMSS(r.timeSpent || 0)}</span></span>`;

    // Sync Bookmark button
    const fsBtn = document.getElementById("fsBookmarkBtn");
    if (fsBtn) {
        const qId = String(q.id || q.question_id || ("q_" + (q.question || "").slice(0, 28)));
        const saved = typeof isQuestionBookmarked === "function" && isQuestionBookmarked(qId);
        fsBtn.textContent = saved ? "⭐ Saved" : "☆ Save";
    }

    const qTxt = (tcsState.lang === "hi" && (q.question_hi || q.question_hindi))
        ? (q.question_hi || q.question_hindi)
        : (q.question || q.question_text || "");
    document.getElementById("fs-q-txt").innerHTML = cleanQuestionHtml(qTxt);

    const optBox = document.getElementById("fs-options-container");
    optBox.innerHTML = "";
    const letters = ["A", "B", "C", "D", "E"];
    const opts = [
        { id: "1", text: q.option_1 || q.opt1 },
        { id: "2", text: q.option_2 || q.opt2 },
        { id: "3", text: q.option_3 || q.opt3 },
        { id: "4", text: q.option_4 || q.opt4 },
        q.option_5 ? { id: "5", text: q.option_5 } : null
    ].filter(Boolean);

    opts.forEach((opt, oIdx) => {
        const isCorrectOpt = String(opt.id) === correctAns;
        const isUserChosen = r.chosenOption && String(r.chosenOption) === String(opt.id);
        let cls = "fs-opt";
        if (isCorrectOpt) cls = "fs-opt correct";
        else if (isUserChosen && !isCorrectOpt) cls = "fs-opt wrong";
        optBox.innerHTML += `
            <div class="${cls}">
                <div style="display:flex; align-items:flex-start; gap:10px;">
                    <strong style="color:#1a237e;">${letters[oIdx] || opt.id}.</strong>
                    <div>${cleanQuestionHtml(opt.text || "")}</div>
                </div>
                ${isCorrectOpt ? `<span class="fs-opt-perc">✓ Correct</span>` : ""}
                ${isUserChosen && !isCorrectOpt ? `<span style="font-size:11px;font-weight:800;color:#c62828;">✗ Your Ans</span>` : ""}
            </div>`;
    });

    const expText = (tcsState.lang === "hi" && (q.explanation_hi || q.solution_hi))
        ? (q.explanation_hi || q.solution_hi)
        : (q.solution_text || q.explanation || q.solution || "Detailed solution above.");
    document.getElementById("fs-exp-text").innerHTML = cleanQuestionHtml(expText);

    if (window.MathJax && MathJax.typesetPromise) MathJax.typesetPromise([document.getElementById("full-sol-screen")]).catch(() => {});
}

window.toggleBookmarkFullSol = function() {
    const q = tcsState.questions[tcsState.activeFullSolIdx];
    if (!q || typeof toggleQuestionBookmark !== "function") return;
    toggleQuestionBookmark(q, tcsState.testMeta || {});
    renderFullSolutionContent(tcsState.activeFullSolIdx);
};

window.makeFlashcardFromFullSol = function() {
    const q = tcsState.questions[tcsState.activeFullSolIdx];
    if (!q || typeof addFlashcardItem !== "function") return;
    const front = stripHtmlText(q.question || q.question_text || "").slice(0, 260);
    const ansId = String(q.answer || q.correct_option || "1").trim();
    const ansText = stripHtmlText(q[`option_${ansId}`] || "");
    const exp = stripHtmlText(q.solution_text || q.explanation || "").slice(0, 240);
    addFlashcardItem(front, `Ans: ${ansText}\n${exp}`, q._sectionName || "Mock Revision");
};

window.copyCurrentQuestionDoubt = function() {
    const q = tcsState.questions[tcsState.activeFullSolIdx];
    if (!q) return;
    const txt = [
        `❓ Question (${q._sectionName || "Mock"}):`,
        stripHtmlText(q.question || q.question_text || ""),
        `A) ${stripHtmlText(q.option_1 || "")}`,
        `B) ${stripHtmlText(q.option_2 || "")}`,
        `C) ${stripHtmlText(q.option_3 || "")}`,
        `D) ${stripHtmlText(q.option_4 || "")}`,
        `✅ Official Ans: Option ${q.answer || "1"}`
    ].join("\n");
    navigator.clipboard.writeText(txt).then(() => {
        if (typeof proToast === "function") proToast("📋 Question copied! Doubt Group mein paste karein.", "success");
    });
};

window.closeFullSol = function() { switchTcsStep("solutions-screen"); };
window.nextFullSol = function() {
    if (tcsState.activeFullSolIdx < tcsState.questions.length - 1) {
        tcsState.activeFullSolIdx++;
        renderFullSolutionContent(tcsState.activeFullSolIdx);
    }
};
window.prevFullSol = function() {
    if (tcsState.activeFullSolIdx > 0) {
        tcsState.activeFullSolIdx--;
        renderFullSolutionContent(tcsState.activeFullSolIdx);
    }
};
