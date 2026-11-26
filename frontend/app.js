/* Вектор — логика сайта.
   Прогресс хранится на сервере (или в облачной базе claude.ai), а в оффлайн-режиме —
   в localStorage браузера. */
(function () {
  "use strict";

  const EGE = window.EGE || {};
  const SUBJECT_META = [
    { id: "bio", name: "Биология" },
    { id: "rus", name: "Русский язык" },
    { id: "chem", name: "Химия" }
  ];
  const SUBJECT_NAME = { bio: "Биология", chem: "Химия", rus: "Русский язык", other: "Другое" };
  const DEFAULT_TARGETS = { bio: 80, chem: 75, rus: 80 };
  const EXTRA_STUDY_SUBJECTS = [
    { id: "math", name: "Математика", color: "#2563eb", target: 80, examDate: "2027-06-08" },
    { id: "phys", name: "Физика", color: "#0891b2", target: 80, examDate: "2027-06-11" },
    { id: "inf", name: "Информатика", color: "#4f46e5", target: 85, examDate: "2027-06-18" },
    { id: "soc", name: "Обществознание", color: "#d97706", target: 80, examDate: "2027-06-11" },
    { id: "eng", name: "Английский язык", color: "#059669", target: 85, examDate: "2027-06-15" },
    { id: "hist", name: "История", color: "#b45309", target: 80, examDate: "2027-06-01" },
    { id: "lit", name: "Литература", color: "#db2777", target: 80, examDate: "2027-06-01" },
    { id: "geo", name: "География", color: "#16a34a", target: 75, examDate: "2027-06-01" }
  ];
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // дни до повторения по «коробкам»
  const LS_KEY = "vektor-ege:v1";
  const LEGACY_LS_KEY = "put-v-medicinu:v1";
  const ACTIVE_QUIZ_LS = "vektor-ege:active-quiz";
  const COOKIE_CONSENT_LS = "vektor-ege:cookie-consent:v1";
  const QUIZ_SIZE = 20;
  const TOPIC_QUIZ = 15;
  const MAX_Q_MS = 180000; // больше трёх минут на вопрос в учёт времени не идёт
  const LETTERS = "АБВГДЕЖЗИК";

  // ---------- модули (подключены в index.html до app.js) ----------
  const {
    $, esc, rich, clone, isObj, deepMerge, pad, isoDate, todayISO, parseISO,
    addDays, daysUntil, validISO, fmtLong, fmtDay, fmtShort, fmtWeekday,
    dateLong, dateDay, dateShort, plural, days, minutesText, capitalize,
    newId, range, shuffle, sleep, clampInt, norm, normTight, parseNum, byDue,
    initials, scrollToEl
  } = EGE.utils;
  const { ICONS, icon, BRAND_MARK_HTML, BRAND_WORDMARK_HTML, brandLockupHTML, GOOGLE_SVG, TELEGRAM_SVG, WHATSAPP_SVG, triggerIconTileAnim } = EGE.ui;
  const { isValidHHMM, feeSplitHTML, bidBtnLabelHTML, priceHeadlineHTML, priceDiffTagsHTML, sliderTicksHTML, BB_DAYS, bbDayObj } = EGE.hh;
  const hash = EGE.hash;
  // ---------- содержание ----------
  // Сборка банка (id заданий, повторы, правки из таблицы) — в bank-core.js, чтобы страница tools/bank.html собирала его так же.
  const BANK = EGE.loadBank();
  const SUBJ = BANK.SUBJ, TOPICS = BANK.TOPICS, QS = BANK.QS, SKIPPED = BANK.SKIPPED;
  if (SKIPPED.length) console.warn("Пропущены повторы вопросов (" + SKIPPED.length + "):\n" + SKIPPED.join("\n"));
  if (BANK.NOTES.length) console.warn("Таблица заданий:\n" + BANK.NOTES.join("\n"));
  const SUBJECTS = SUBJECT_META.map((m) => Object.assign({}, m, { content: SUBJ[m.id] || null }));
  const firstSubject = SUBJECTS.find((s) => s.content) || SUBJECTS[0];
  const CONTENT = SUBJECTS.filter((s) => s.content);
  const ALL_STUDY_SUBJECTS = [
    ...SUBJECTS.map((s) => Object.assign({}, s, {
      color: `var(--c-${s.id})`,
      target: DEFAULT_TARGETS[s.id] || 80
    })),
    ...EXTRA_STUDY_SUBJECTS.map((m) => Object.assign({}, m, { content: SUBJ[m.id] || null }))
  ];
  const STUDY_SUBJ_MAP = Object.fromEntries(ALL_STUDY_SUBJECTS.map((s) => [s.id, s]));
  function topicRef(t) { return (SUBJ[t.sid].ref || "") + t.code + " " + t.title; }
  function codeLabel(t) { return (SUBJ[t.sid].codeName || "Тема") + " " + t.code; }

  // ---------- хранилище ----------
  const DOC_NAME_RE = /^(profile|plan|mocks|essays|market|tutor-cabinet|calendar-sync|prog-[a-z]+|log-\d{4}-\d{2})$/;
  const store = {
    mode: "loading", // loading | cloud | local
    backend: !!(window.EGE_HOST && window.EGE_HOST.backend),
    demoMode: !(typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.demoMode === false),
    tutorsLoaded: false,
    user: null,
    authProviders: { local: true, phone: true, google: false, telegram: false },
    telegramBotUsername: null,
    telegramBotId: null,
    telegramBinding: null,
    payments: { provider: "demo", yookassaEnabled: false, receiptEnabled: true },
    backendAi: { enabled: false, provider: null },
    inviteRequired: false,
    ready: false,
    confirmed: false,
    stale: false,
    saving: 0,
    error: null, // null | offline | readonly | quota | auth
    docs: {},
    uid: null,
    me: null,
    isOwner: false
  };
  function isDevDemoMode() {
    if (store && store.demoMode === false) return false;
    if (typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.demoMode === false) return false;
    return true;
  }
  const cloud = { db: null, user: null };
  const caps = { downloads: null };
  const ai = { fn: null, state: "unknown" }; // unknown | ready | off
  const queues = {};
  let loadTimer = null;
  let lastRefresh = 0;

  function docPath(name) { return store.backend ? name : "u/" + store.uid + "/d/" + name; }
  function queue(name) { return queues[name] || (queues[name] = { pending: null, replace: null, inflight: null, running: false }); }

  function patchDoc(name, patch) {
    store.docs[name] = deepMerge(store.docs[name] || {}, patch);
    if (store.mode === "local") saveLocal();
    else if (store.error !== "readonly") {
      const q = queue(name);
      q.pending = deepMerge(q.pending || {}, patch);
      if (store.mode === "cloud") flush(name);
    }
    scheduleRender();
  }
  function replaceDoc(name, data) {
    store.docs[name] = clone(data);
    if (store.mode === "local") saveLocal();
    else if (store.error !== "readonly") {
      const q = queue(name);
      q.replace = clone(data); q.pending = null;
      if (store.mode === "cloud") flush(name);
    }
    scheduleRender();
  }
  async function withRetry(fn) {
    try { return await fn(); }
    catch (e) {
      if (e && e.code === "unavailable") { await sleep(600 + Math.random() * 1000); return fn(); }
      throw e;
    }
  }
  function readLocalDocs() {
    try {
      const raw = localStorage.getItem(LS_KEY) || localStorage.getItem(LEGACY_LS_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return isObj(parsed) ? parsed : {};
    }
    catch (e) { return {}; }
  }
  function hasLocalProgress() {
    const saved = readLocalDocs();
    return Object.keys(saved).some((k) => DOC_NAME_RE.test(k) && isObj(saved[k]));
  }
  function clearQueues() { for (const k in queues) delete queues[k]; }
  function hasPendingQueues() {
    for (const k in queues) {
      const q = queues[k];
      if (q && (q.running || q.pending || q.replace || q.inflight)) return true;
    }
    return false;
  }
  function overlayQueues(baseDocs) {
    const next = {};
    for (const k of Object.keys(baseDocs || {})) {
      if (isObj(baseDocs[k])) next[k] = clone(baseDocs[k]);
    }
    for (const name in queues) {
      const q = queues[name];
      if (q.inflight && q.inflight.replace) next[name] = clone(q.inflight.replace);
      if (q.inflight && q.inflight.patch) next[name] = deepMerge(next[name] || {}, q.inflight.patch);
      if (q.replace) next[name] = clone(q.replace);
      if (q.pending) next[name] = deepMerge(next[name] || {}, q.pending);
    }
    return next;
  }
  // Одна запись за раз на документ; накопившиеся правки уходят одним update().
  async function flush(name) {
    const q = queues[name];
    if (!q || q.running || store.mode !== "cloud" || store.error === "readonly" || (store.backend && !store.user)) return;
    q.running = true; store.saving++; renderSync();
    let failed = null;
    while (!failed && (q.replace || q.pending)) {
      const ref = cloud.db.doc(docPath(name));
      if (q.replace) {
        const body = q.replace; q.replace = null; q.inflight = { replace: body };
        try { await withRetry(() => ref.set(body)); }
        catch (e) { failed = e; if (!q.replace) q.replace = body; }
        q.inflight = null;
        continue;
      }
      const patch = q.pending; q.pending = null; q.inflight = { patch };
      try {
        try { await withRetry(() => ref.update(patch)); }
        catch (e) {
          if (e && e.code === "invalid_argument") await withRetry(() => ref.set(deepMerge(store.docs[name] || {}, patch)));
          else throw e;
        }
      } catch (e) {
        failed = e;
        q.pending = deepMerge(patch, q.pending || {});
      }
      q.inflight = null;
    }
    q.running = false; store.saving--;
    if (failed) onWriteFail(failed, name);
    else if (store.error === "offline") store.error = null;
    renderSync();
  }
  function onWriteFail(e, name) {
    const code = e && e.code;
    if (code === "session_expired") {
      store.error = "auth";
      store.user = null; store.uid = null; store.me = null;
      ai.fn = null; ai.state = "off";
      for (const k in queues) { queues[k].pending = null; queues[k].replace = null; }
      toast("Сессия истекла. Войди в аккаунт снова.");
    } else if (code === "invalid_argument" || code === "revoked" || code === "not_granted") {
      store.error = "readonly";
      for (const k in queues) { queues[k].pending = null; queues[k].replace = null; }
      toast("Изменения не сохраняются: у этого аккаунта нет прав на запись.");
    } else if (code === "quota_exceeded") {
      store.error = "quota";
      const q = queues[name]; if (q) { q.pending = null; q.replace = null; }
      toast("Хранилище заполнено. Удали старые записи или скачай резервную копию.");
    } else {
      store.error = "offline";
      setTimeout(() => flush(name), code === "resource_exhausted" ? 8000 : 15000);
    }
    scheduleRender();
  }
  function onSnap(snap) {
    if (!snap.metadata.fromCache) { store.confirmed = true; store.stale = false; clearTimeout(loadTimer); }
    const base = {};
    for (const d of snap.docs) { const data = d.data(); if (data) base[d.id] = clone(data); }
    store.docs = overlayQueues(base);
    store.ready = true;
    scheduleRender();
  }
  function saveLocal() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(store.docs));
      localStorage.removeItem(LEGACY_LS_KEY);
    } catch (e) { /* хранилище браузера недоступно */ }
  }
  function quizOwnerKey() {
    if (store.backend) return store.user ? "b:" + store.user.id : "b:guest";
    return store.uid ? "c:" + store.uid : "local";
  }
  function clearActiveQuiz() {
    try { localStorage.removeItem(ACTIVE_QUIZ_LS); } catch (e) { /* игнор */ }
  }
  function saveActiveQuiz() {
    const qz = ui.quiz;
    if (!qz || qz.done || !Array.isArray(qz.items) || !qz.items.length) { clearActiveQuiz(); return; }
    try {
      const payload = {
        owner: quizOwnerKey(),
        title: qz.title, sid: qz.sid, mode: qz.mode, topicId: qz.topicId || null,
        i: qz.i, checked: !!qz.checked,
        sessionId: qz.sessionId, startDay: qz.startDay, started: qz.started,
        spent: qz.spent || 0, answered: qz.answered || 0, correct: qz.correct || 0,
        back: qz.back || { v: "home" }, planId: qz.planId || null, retry: !!qz.retry,
        cfgKey: qz.cfg && SUBJ[qz.sid] && qz.cfg === SUBJ[qz.sid].fullVariant ? "fullVariant" : null,
        hints: qz.hints || 0, mockId: qz.mockId || null,
        items: qz.items.map((it) => ({
          qid: it.q && it.q.id ? it.q.id : null,
          qObj: it.q && it.q.ai ? it.q : null,
          n: it.n, key: !!it.key, resp: it.resp, res: it.res || null,
          view: it.view || null, fin: !!it.fin, hinted: !!it.hinted
        }))
      };
      localStorage.setItem(ACTIVE_QUIZ_LS, JSON.stringify(payload));
    } catch (e) { /* игнор */ }
  }
  function restoreActiveQuiz() {
    if (ui.quiz) return;
    try {
      const raw = localStorage.getItem(ACTIVE_QUIZ_LS);
      if (!raw) return;
      const d = JSON.parse(raw);
      if (!d || d.owner !== quizOwnerKey() || !Array.isArray(d.items) || !d.items.length || !SUBJ[d.sid]) return;
      const items = [];
      for (const s of d.items) {
        const q = (s.qid && QS[s.qid]) || s.qObj;
        if (!q) return;
        items.push({
          q, n: s.n, key: !!s.key, resp: s.resp, res: s.res || null,
          view: s.view || null, fin: !!s.fin, hinted: !!s.hinted, hintOpen: false
        });
      }
      ui.quiz = {
        title: d.title || "Тест", sid: d.sid, mode: d.mode || "mixed", topicId: d.topicId || null,
        items, i: Math.min(Math.max(0, Number(d.i) || 0), items.length - 1),
        checked: !!d.checked, done: false,
        sessionId: d.sessionId || newId(), startDay: d.startDay || todayISO(),
        started: d.started || Date.now(), qStart: Date.now(), pausedAt: Date.now(),
        spent: d.spent || 0, answered: d.answered || 0, correct: d.correct || 0,
        back: d.back || { v: "subject", sid: d.sid }, ai: null,
        cfg: d.cfgKey && SUBJ[d.sid] ? SUBJ[d.sid][d.cfgKey] : null,
        planId: d.planId || null, retry: !!d.retry, hints: d.hints || 0, mockId: d.mockId || null
      };
    } catch (e) { /* игнор */ }
  }
  let pendingAutoAuth = null;
  function consumePendingAutoAuth() {
    if (!pendingAutoAuth) return;
    const req = pendingAutoAuth;
    pendingAutoAuth = null;
    if (store.user || ui.demoAuthed || ui.guest) return;
    if (req.role && HOST_SITE !== "student" && HOST_SITE !== "tutor") setRolePref(req.role);
    ui.auth.tab = req.tab === "register" ? "register" : "login";
    if (!req.keepError) ui.auth.error = "";
    ui.authPrompt = "";
    ui.authModal = true;
  }
  function startLocal(opts) {
    store.mode = "local";
    const saved = readLocalDocs();
    for (const name in queues) {
      const q = queues[name];
      if (q.replace) saved[name] = q.replace;
      if (q.pending) saved[name] = deepMerge(saved[name] || {}, q.pending);
      delete queues[name];
    }
    store.docs = saved;
    store.ready = true;
    restoreActiveQuiz();
    if (!(opts && opts.skipSave)) saveLocal();
    consumePendingAutoAuth();
    scheduleRender();
  }
  async function backendReq(path, opts) {
    if (EGE.api && typeof EGE.api.request === "function") {
      return await EGE.api.request(path, opts);
    }
    opts = opts || {};
    const headers = Object.assign({}, opts.headers || {});
    if (opts.body != null && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
    let res;
    try {
      res = await fetch(path, Object.assign({ credentials: "same-origin" }, opts, { headers }));
    } catch (e) {
      if (e && e.name === "AbortError") throw Object.assign(new Error("cancelled"), { code: "cancelled" });
      throw Object.assign(new Error("Нет связи с сервером."), { code: "unavailable" });
    }
    let data = null;
    const ct = (res.headers && res.headers.get && res.headers.get("content-type")) || "";
    if (ct.includes("json")) {
      try { data = await res.json(); } catch (e) { data = null; }
    }
    if (!res.ok) {
      const payload = (data && isObj(data.detail)) ? data.detail : (isObj(data) ? data : {});
      const rawDetail = data && typeof data.detail === "string" ? data.detail : "";
      const code = payload.code || (res.status === 401 ? "unauthorized" : res.status === 413 ? "quota_exceeded" : res.status >= 500 ? "unavailable" : "http_" + res.status);
      const err = new Error(payload.message || rawDetail || ("Ошибка сервера (" + res.status + ")"));
      err.code = code;
      err.status = res.status;
      throw err;
    }
    return data;
  }
  const backendDb = {
    doc(name) {
      const send = async (method, body) => {
        try {
          return await backendReq("/api/docs/" + encodeURIComponent(name), { method, body: JSON.stringify(body) });
        } catch (e) {
          if (e && e.status === 401) throw Object.assign(new Error(e.message), { code: "session_expired" });
          if (e && (e.status === 413 || e.code === "doc_too_large" || e.code === "quota_exceeded")) throw Object.assign(new Error(e.message), { code: "quota_exceeded" });
          if (!e || !e.status || e.status >= 500 || e.code === "unavailable") throw Object.assign(new Error((e && e.message) || "network"), { code: "unavailable" });
          throw Object.assign(new Error(e.message), { code: "bad_request" });
        }
      };
      return {
        set(body) { return send("PUT", body); },
        update(patch) { return send("PATCH", patch); }
      };
    }
  };
  async function backendSample(input, opts) {
    opts = opts || {};
    let acc = "";
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort();
    if (opts.signal) {
      if (opts.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled", text: "" });
      opts.signal.addEventListener("abort", onAbort, { once: true });
    }
    let reader = null;
    try {
      let res;
      try {
        res = await fetch("/api/ai", {
          method: "POST",
          credentials: "same-origin",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "text", messages: input, modelTier: opts.modelTier || undefined })
        });
      } catch (e) {
        if (opts.signal && opts.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled", text: acc });
        throw Object.assign(new Error("network"), { code: "unavailable", text: acc });
      }
      if (!res.ok) {
        let data = null;
        try { data = await res.json(); } catch (e) { /* не json */ }
        const payload = (data && isObj(data.detail)) ? data.detail : (isObj(data) ? data : {});
        const code = res.status === 401 ? "session_expired" : (payload.code || ("http_" + res.status));
        if (res.status === 401) { store.user = null; ai.fn = null; ai.state = "off"; scheduleRender(); }
        throw Object.assign(new Error(payload.message || ("HTTP " + res.status)), { code, text: acc });
      }
      if (!res.body || typeof res.body.getReader !== "function") {
        throw Object.assign(new Error("no_stream"), { code: "ai_error", text: acc });
      }
      reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      const handleLine = (rawLine) => {
        const line = rawLine.replace(/\r$/, "");
        if (!line.startsWith("data:")) return false;
        const rawJson = line.slice(5).trim();
        if (!rawJson) return false;
        let evt;
        try { evt = JSON.parse(rawJson); } catch (e) { return false; }
        if (evt.error) throw Object.assign(new Error(evt.message || evt.error), { code: evt.error, text: acc });
        if (typeof evt.delta === "string" && evt.delta) {
          acc += evt.delta;
          if (typeof opts.onText === "function") opts.onText({ text: acc });
        }
        return !!evt.done;
      };
      while (true) {
        let chunk;
        try { chunk = await reader.read(); }
        catch (e) {
          if (opts.signal && opts.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled", text: acc });
          throw Object.assign(new Error("stream_interrupted"), { code: "ai_error", text: acc });
        }
        const { value, done } = chunk;
        if (value) buf += dec.decode(value, { stream: true });
        let idx;
        let finished = false;
        while ((idx = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 1);
          if (handleLine(line)) { finished = true; break; }
        }
        if (finished) {
          try { reader.cancel(); } catch (e) { /* игнор */ }
          break;
        }
        if (done) {
          buf += dec.decode();
          if (buf) handleLine(buf);
          break;
        }
      }
      return { text: acc };
    } finally {
      if (opts.signal) opts.signal.removeEventListener("abort", onAbort);
    }
  }
  backendSample.json = async function (input, opts) {
    opts = opts || {};
    if (opts.signal && opts.signal.aborted) throw Object.assign(new Error("cancelled"), { code: "cancelled" });
    try {
      const res = await backendReq("/api/ai", {
        method: "POST",
        signal: opts.signal,
        body: JSON.stringify({ mode: "json", messages: input, modelTier: opts.modelTier || undefined })
      });
      return res.data;
    } catch (e) {
      if ((e && e.code === "cancelled") || (e && e.name === "AbortError") || (opts.signal && opts.signal.aborted)) {
        throw Object.assign(new Error("cancelled"), { code: "cancelled" });
      }
      if (e && e.status === 401) {
        store.user = null; ai.fn = null; ai.state = "off"; scheduleRender();
        throw Object.assign(new Error(e.message), { code: "session_expired" });
      }
      throw e;
    }
  };
  async function hydrateMarketDirections() {
    if (!store.backend || !EGE.api || !EGE.api.market || typeof EGE.api.market.directions !== "function") return;
    try {
      const res = await EGE.api.market.directions();
      if (res && Array.isArray(res.directions) && TDATA && typeof TDATA.syncDirections === "function") {
        if (TDATA.syncDirections(res.directions) > 0) {
          if (ui.filterModal) renderModal();
          scheduleRender();
        }
      }
    } catch (e) { /* офлайн или мок-окружение */ }
  }
  async function hydrateMarketTutors() {
    if (!store.backend || !EGE.api || !EGE.api.tutors || typeof EGE.api.tutors.list !== "function") return;
    try {
      const res = await EGE.api.tutors.list({ limit: 200 });
      if (res && Array.isArray(res.tutors) && TDATA && typeof TDATA.syncServerTutors === "function") {
        TDATA.syncServerTutors(res.tutors, { replace: !isDevDemoMode() });
        store.tutorsLoaded = true;
        if (ui.filterModal) renderModal();
        scheduleRender();
        return;
      }
    } catch (e) { /* офлайн или мок-окружение */ }
    if (!isDevDemoMode() && TDATA) {
      TDATA.serverLoaded = true;
      TDATA.serverLoading = false;
      scheduleRender();
    }
  }
  async function hydrateMarketFromBackend() {
    if (!store.backend || !EGE.api || !EGE.api.market) return;
    try {
      const data = await EGE.api.market.state();
      if (!data || !data.ok) return;
      if (Array.isArray(data.directions) && TDATA && typeof TDATA.syncDirections === "function") {
        TDATA.syncDirections(data.directions);
      }
      if (!store.tutorsLoaded && Array.isArray(data.tutors) && TDATA && typeof TDATA.syncServerTutors === "function") {
        TDATA.syncServerTutors(data.tutors, { replace: !isDevDemoMode() });
        store.tutorsLoaded = true;
      }
      if (Array.isArray(data.leads) && TDATA && typeof TDATA.syncStudentLeads === "function") {
        TDATA.syncStudentLeads(data.leads, { replace: !isDevDemoMode() });
      }
      if (data.reviewsSummary && TDATA && typeof TDATA.applyReviewSummaries === "function") {
        TDATA.applyReviewSummaries(data.reviewsSummary);
      }
      if (!data.authenticated || !store.user) {
        scheduleRender();
        return;
      }
      const st = mkt();
      if (data.wallet && typeof data.wallet === "object") {
        if (Number.isFinite(Number(data.wallet.balanceRub))) st.balance = Number(data.wallet.balanceRub);
        if (data.wallet.initialPaid != null) st.initialPaid = !!data.wallet.initialPaid;
        if (data.wallet.planId) st.planId = String(data.wallet.planId);
        if (Array.isArray(data.wallet.savedCards) && data.wallet.savedCards.length) st.savedCards = data.wallet.savedCards;
      }
      if (Array.isArray(data.bookings) && data.bookings.length) {
        const merged = new Map();
        data.bookings.forEach((bk) => { if (bk && bk.id) merged.set(String(bk.id), Object.assign({}, bk, { serverSynced: true })); });
        (st.bookings || []).forEach((bk) => { if (bk && bk.id && !merged.has(String(bk.id)) && !bk.serverSynced) merged.set(String(bk.id), bk); });
        st.bookings = Array.from(merged.values());
      }
      if (data.telemostUrl) {
        st.telemostUrl = String(data.telemostUrl);
      } else if (!st.telemostUrl && Array.isArray(st.bookings)) {
        const firstTm = st.bookings.find((bk) => bk && bk.telemostUrl);
        if (firstTm) st.telemostUrl = String(firstTm.telemostUrl);
      }
      if (st.telemostUrl && Array.isArray(st.bookings)) {
        st.bookings.forEach((bk) => {
          if (bk && !String(bk.telemostUrl || "").trim()) bk.telemostUrl = st.telemostUrl;
        });
      }
      if (data.contacts && typeof data.contacts === "object") {
        st.tutorContacts = Object.assign({}, st.tutorContacts || {}, data.contacts);
      }
      if (Array.isArray(data.disputes)) {
        const mergedD = new Map();
        data.disputes.forEach((d) => { if (d && d.id) mergedD.set(String(d.id), d); });
        (st.disputes || []).forEach((d) => {
          if (d && d.id && !mergedD.has(String(d.id)) && !Array.from(mergedD.values()).some((x) => String(x.bookingId || "") === String(d.bookingId || ""))) {
            mergedD.set(String(d.id), d);
          }
        });
        st.disputes = Array.from(mergedD.values());
        if (Array.isArray(st.bookings)) {
          st.bookings.forEach((bk) => {
            if (!bk) return;
            const match = st.disputes.find((d) => d && String(d.bookingId || "") === String(bk.id));
            if (match) bk.dispute = match;
          });
        }
      }
      saveMkt();
      scheduleRender();
    } catch (e) { /* офлайн или мок-окружение */ }
  }
  async function loadBackendSession(user) {
    if (!HOST_SITE && user && (user.role === "tutor" || user.role === "student")) {
      setRolePref(user.role);
      if (user.role === "tutor" && (ui.view === "home" || ui.view === "landing")) {
        ui.view = "cabinet";
      }
    }
    const res = await backendReq("/api/docs");
    store.user = user;
    store.uid = String(user.id);
    store.me = { name: user.displayName || user.username, avatarUrl: user.avatarUrl || "" };
    cloud.db = backendDb;
    store.mode = "cloud";
    store.confirmed = true;
    store.stale = false;
    store.error = null;
    store.docs = overlayQueues((res && res.docs) || {});
    store.ready = true;
    lastRefresh = Date.now();
    if (store.backendAi && store.backendAi.enabled) { ai.fn = backendSample; ai.state = "ready"; }
    else { ai.fn = null; ai.state = "off"; }
    restoreActiveQuiz();
    for (const name in queues) flush(name);
    hydrateMarketTutors();
    hydrateMarketFromBackend();
    hydrateTelegramStatus();
    if (EGE.views.messenger && typeof EGE.views.messenger.hydrateFromBackend === "function") {
      EGE.views.messenger.hydrateFromBackend(true);
    }
    if (user.role !== "tutor" && ui.role !== "tutor" && HOST_SITE !== "tutor" && EGE.realtime && typeof EGE.realtime.connect === "function") {
      EGE.realtime.connect({ channel: "student" });
    }
    if ((user.role === "tutor" || ui.role === "tutor" || HOST_SITE === "tutor") && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.hydrateFromBackend === "function") {
      EGE.views.tutorCabinet.hydrateFromBackend({ force: true });
    }
    scheduleRender();
  }
  function hydrateTelegramStatus() {
    if (!store.backend || !store.user || !EGE.api || !EGE.api.telegram) return;
    EGE.api.telegram.status().then((res) => {
      if (res && typeof res === "object" && store.user) {
        if (res.botUsername) store.telegramBotUsername = String(res.botUsername);
        store.telegramBinding = res.linked && res.binding ? res.binding : null;
        scheduleRender();
      }
    }).catch(() => {});
  }
  async function refreshBackendDocs(force) {
    if (!store.backend || !store.user || store.saving > 0 || hasPendingQueues()) return;
    if (!force && Date.now() - lastRefresh < 5000) return;
    lastRefresh = Date.now();
    try {
      const res = await backendReq("/api/docs");
      if (!store.user || hasPendingQueues()) return;
      store.docs = overlayQueues((res && res.docs) || {});
      store.confirmed = true;
      store.stale = false;
      if (store.error === "offline") store.error = null;
      scheduleRender();
    } catch (e) {
      if (e && e.status === 401) {
        store.user = null; store.uid = null; store.me = null;
        store.error = "auth"; ai.fn = null; ai.state = "off";
        clearQueues();
        scheduleRender();
      }
    }
  }
  async function migrateLocalDocsToServer() {
    const saved = readLocalDocs();
    const names = Object.keys(saved).filter((k) => DOC_NAME_RE.test(k) && isObj(saved[k]));
    if (!names.length) return 0;
    for (const name of names) {
      await backendReq("/api/docs/" + encodeURIComponent(name), {
        method: "PUT",
        body: JSON.stringify(saved[name])
      });
    }
    try { localStorage.removeItem(LS_KEY); localStorage.removeItem(LEGACY_LS_KEY); } catch (e) { /* игнор */ }
    return names.length;
  }
  const PENDING_BOOKING_SS = "vektor:pending-booking";
  function savePendingBookingReturn(pending) {
    try {
      if (typeof sessionStorage === "undefined") return;
      if (pending) sessionStorage.setItem(PENDING_BOOKING_SS, JSON.stringify(pending));
      else sessionStorage.removeItem(PENDING_BOOKING_SS);
    } catch (e) { /* игнор */ }
  }
  function popPendingBookingReturn() {
    try {
      if (typeof sessionStorage === "undefined") return null;
      const raw = sessionStorage.getItem(PENDING_BOOKING_SS);
      sessionStorage.removeItem(PENDING_BOOKING_SS);
      if (!raw) return null;
      const obj = JSON.parse(raw);
      return isObj(obj) ? obj : null;
    } catch (e) {
      return null;
    }
  }
  function isYookassaActive() {
    return Boolean(store.backend && store.user && store.payments && store.payments.yookassaEnabled && EGE.api && EGE.api.payments);
  }
  function startServerTopup(opts) {
    opts = opts || {};
    if (!isYookassaActive()) return false;
    const pathNow = (typeof location !== "undefined" && location.pathname) || "/";
    const retPath = pathNow + (ui.view === "market" && pathNow !== "/market" ? "#market" : "");
    if (ui.balanceModal) {
      ui.balanceModal.busy = true;
      ui.balanceModal.error = "";
      renderModal();
    }
    EGE.api.payments.topup({
      amount: Number(opts.amount) || 490,
      method: opts.method === "card" ? "card" : "sbp",
      cardId: opts.cardId || null,
      planId: opts.planId || (mkt().planId || "trial5k"),
      receiptEmail: opts.receiptEmail || "",
      returnPath: retPath
    }).then((res) => {
      if (res && res.mode === "redirect" && res.confirmationUrl) {
        savePendingBookingReturn(opts.pendingBooking || null);
        ui.balanceModal = null;
        if (typeof location !== "undefined") location.href = res.confirmationUrl;
        return;
      }
      if (res && res.wallet && Number.isFinite(Number(res.wallet.balanceRub))) {
        const st = mkt();
        st.balance = Number(res.wallet.balanceRub);
        st.initialPaid = !!res.wallet.initialPaid;
        if (res.wallet.planId) st.planId = String(res.wallet.planId);
        saveMkt();
      }
      if (ui.balanceModal) {
        ui.balanceModal.busy = false;
        ui.balanceModal = null;
        renderModal();
      }
      scheduleRender();
    }).catch((err) => {
      const msg = (err && err.message) || "Не удалось создать платёж в ЮKassa.";
      if (ui.balanceModal) {
        ui.balanceModal.busy = false;
        ui.balanceModal.error = msg;
        renderModal();
      } else {
        toast(msg);
      }
    });
    return true;
  }
  async function checkPaymentReturn(retryCount) {
    if (!store.backend || !store.user || !EGE.api || !EGE.api.payments) return;
    try {
      let intentId = "";
      if (typeof URLSearchParams === "function" && typeof location !== "undefined" && location.search) {
        const sp = new URLSearchParams(location.search);
        intentId = String(sp.get("payment_intent") || "").trim();
        if (!intentId) return;
        sp.delete("payment_intent");
        const q = sp.toString();
        try {
          history.replaceState(null, "", (location.pathname || "/") + (q ? "?" + q : "") + (location.hash || ""));
        } catch (e) { /* игнор */ }
      } else if (typeof retryCount === "string") {
        intentId = retryCount;
        retryCount = 1;
      } else if (typeof location !== "undefined" && location.search) {
        const pm = /(?:^\?|&)payment_intent=([^&#]+)/.exec(String(location.search));
        if (!pm) return;
        intentId = decodeURIComponent(pm[1]);
        try {
          history.replaceState(null, "", (location.pathname || "/") + (location.hash || ""));
        } catch (e) { /* игнор */ }
      } else {
        return;
      }
      if (!intentId) return;
      const attempt = Number(retryCount) || 0;
      const res = await EGE.api.payments.getIntent(intentId);
      const intent = res && res.intent;
      if (intent && intent.status === "succeeded") {
        const st = mkt();
        if (res.wallet && Number.isFinite(Number(res.wallet.balanceRub))) {
          st.balance = Number(res.wallet.balanceRub);
          st.initialPaid = !!res.wallet.initialPaid;
          if (res.wallet.planId) st.planId = String(res.wallet.planId);
          saveMkt();
        }
        const pending = popPendingBookingReturn();
        if (pending && st.balance >= (Number(pending.offerPrice) || 490)) {
          ui.booking = Object.assign({}, pending);
          if (ui.role !== "tutor") { ui.view = "market"; writeHash(); }
          renderModal();
        }
        notifySide(
          "Оплата через ЮKassa прошла",
          `+${Number(intent.amountRub || 0).toLocaleString("ru-RU")} ₽ зачислено · баланс ${Number(st.balance || 0).toLocaleString("ru-RU")} ₽`,
          { inbox: true }
        );
        scheduleRender();
        return;
      }
      if (intent && intent.status === "canceled") {
        popPendingBookingReturn();
        notifySide("Платёж отменён", "Списание не выполнено. Вы можете повторить попытку пополнения.", { inbox: true });
        return;
      }
      if (intent && (intent.status === "pending" || intent.status === "waiting_for_capture") && attempt < 3 && typeof setTimeout === "function") {
        setTimeout(() => {
          if (!store.backend || !store.user || !EGE.api || !EGE.api.payments) return;
          EGE.api.payments.getIntent(intentId).then((r2) => {
            const i2 = r2 && r2.intent;
            if (i2 && i2.status === "succeeded" && r2.wallet) {
              const st2 = mkt();
              st2.balance = Number(r2.wallet.balanceRub);
              st2.initialPaid = !!r2.wallet.initialPaid;
              if (r2.wallet.planId) st2.planId = String(r2.wallet.planId);
              saveMkt();
              notifySide("Оплата через ЮKassa прошла", `+${Number(i2.amountRub || 0).toLocaleString("ru-RU")} ₽ зачислено`, { inbox: true });
              scheduleRender();
            }
          }).catch(() => {});
        }, 1500);
      }
    } catch (e) { /* игнор */ }
  }
  async function initBackend() {
    try {
      const me = await backendReq("/api/me");
      store.backendAi = (me && me.ai) || { enabled: false, provider: null };
      store.authProviders = (me && me.providers) || { local: true, phone: true, google: false, telegram: false };
      store.telegramBotUsername = (me && me.telegramBotUsername) || null;
      store.telegramBotId = (me && me.telegramBotId) ? String(me.telegramBotId) : null;
      store.payments = (me && me.payments && typeof me.payments === "object")
        ? Object.assign({ provider: "demo", yookassaEnabled: false, receiptEnabled: true }, me.payments)
        : { provider: "demo", yookassaEnabled: false, receiptEnabled: true };
      store.inviteRequired = !!(me && me.inviteRequired);
      if (me && typeof me.demoMode === "boolean") store.demoMode = me.demoMode;
      if (TDATA && typeof TDATA.setDemoMode === "function") TDATA.setDemoMode(isDevDemoMode());
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setDemoMode === "function") {
        EGE.views.tutorCabinet.setDemoMode(isDevDemoMode());
      }
      if (me && me.user) {
        pendingAutoAuth = null;
        try {
          await loadBackendSession(me.user);
          await checkPaymentReturn(0);
          const hasVerifiedContact = Boolean(
            (store.docs && store.docs.profile && store.docs.profile.contactVerified) ||
            (mkt() && mkt().verifiedContact && mkt().verifiedContact.value)
          );
          if (me.user.authProvider === "google" && !hasVerifiedContact) {
            openContactVerifyModal({ required: true });
          }
        } catch (e) {
          store.user = me.user; store.uid = String(me.user.id);
          store.me = { name: me.user.displayName || me.user.username, avatarUrl: me.user.avatarUrl || "" };
          cloud.db = backendDb; store.mode = "cloud"; store.stale = true; store.error = "offline";
          if (store.backendAi && store.backendAi.enabled) { ai.fn = backendSample; ai.state = "ready"; }
          else { ai.fn = null; ai.state = "off"; }
          store.ready = true;
          scheduleRender();
        }
        return;
      }
      store.user = null; store.uid = null; store.me = null;
      ai.fn = null; ai.state = "off";
      startLocal();
      hydrateMarketDirections();
      hydrateMarketTutors();
    } catch (e) {
      store.user = null; store.uid = null; store.me = null;
      ai.fn = null; ai.state = "off";
      startLocal();
    }
  }
  async function initData() {
    if (store.backend) return initBackend();
    const c = window.claude;
    if (!c || typeof c.use !== "function") return startLocal();
    let db = null, user = null;
    try { [db, user] = await Promise.all([c.use("db"), c.use("user")]); } catch (e) { /* нет облака */ }
    if (!db || !user) return startLocal();
    let uid = null;
    try { uid = await user.id(); } catch (e) { uid = null; }
    if (!uid) return startLocal();
    cloud.db = db; cloud.user = user;
    store.mode = "cloud"; store.uid = uid;
    user.me().then((me) => { store.me = me; store.isOwner = !!(me && me.isOwner); scheduleRender(); });
    // Корневой документ пользователя — чтобы данные были видны в списке «u».
    const root = db.doc("u/" + uid);
    root.get().then((s) => { if (!s.exists) return root.set({ v: 1, created: Date.now() }); }).catch(() => {});
    loadTimer = setTimeout(() => { if (!store.confirmed) { store.stale = true; store.ready = true; scheduleRender(); } }, 10000);
    db.collection("u/" + uid + "/d").onSnapshot(onSnap, (err) => {
      clearTimeout(loadTimer);
      store.error = err && err.code === "revoked" ? "readonly" : "offline";
      store.ready = true;
      scheduleRender();
    });
    for (const name in queues) flush(name);
    scheduleRender();
  }
  function initCaps() {
    if (store.backend) return;
    const c = window.claude;
    if (!c || typeof c.use !== "function") { ai.state = "off"; return; }
    c.use("sample").then((fn) => { ai.fn = fn || null; ai.state = fn ? "ready" : "off"; scheduleRender(); }).catch(() => { ai.state = "off"; scheduleRender(); });
    c.use("downloads").then((d) => { caps.downloads = d || null; }).catch(() => {});
  }

  // ---------- выборки ----------
  function examDefaults() {
    const o = {};
    EXTRA_STUDY_SUBJECTS.forEach((m) => { if (m.examDate) o[m.subject || m.id] = m.examDate; });
    (EGE.exams || []).forEach((e) => { o[e.subject] = e.date; });
    return o;
  }
  function profile() {
    const p = store.docs.profile || {};
    const cityVal = String(p.city || "").trim();
    const resolveTz = (EGE.views && EGE.views.progress && typeof EGE.views.progress.resolveCityTimezone === "function")
      ? EGE.views.progress.resolveCityTimezone
      : () => "UTC+9";
    const allDefaultTargets = {};
    ALL_STUDY_SUBJECTS.forEach((s) => { allDefaultTargets[s.id] = Number(s.target) || 80; });
    const rawSubjs = Array.isArray(p.subjects) ? p.subjects : null;
    const cleanSubjs = rawSubjs
      ? rawSubjs.map((id) => String(id || "").trim()).filter((id, i, a) => id && STUDY_SUBJ_MAP[id] && a.indexOf(id) === i)
      : [];
    const subjects = cleanSubjs.length ? cleanSubjs : SUBJECT_META.map((s) => s.id);
    return {
      exists: !!store.docs.profile,
      name: p.name || "",
      photo: p.photo || "",
      grade: p.grade || "",
      city: cityVal || "Якутск",
      timezone: p.timezone || resolveTz(cityVal || "Якутск"),
      phone: p.phone || "",
      phoneCountry: p.phoneCountry || "RU",
      goal: p.goal || "",
      prepSetupPending: !!p.prepSetupPending,
      linkedGoogle: isObj(p.linkedGoogle) ? p.linkedGoogle : { connected: false, email: "" },
      linkedTelegram: isObj(p.linkedTelegram) ? p.linkedTelegram : { connected: false, handle: "" },
      subjects,
      targets: Object.assign({}, allDefaultTargets, p.targets || {}),
      exams: Object.assign({}, examDefaults(), p.exams || {})
    };
  }
  function selectedStudySubjects(prof) {
    const p = prof || profile();
    const ids = Array.isArray(p.subjects) && p.subjects.length ? p.subjects : SUBJECT_META.map((s) => s.id);
    const list = ids.map((id) => STUDY_SUBJ_MAP[id]).filter(Boolean);
    return list.length ? list : SUBJECTS.slice();
  }
  function selectedContentSubjects(prof) {
    return selectedStudySubjects(prof).filter((s) => !!s.content);
  }
  function defaultName() {
    if (store.user) return store.user.displayName || store.user.username || "";
    if (store.me && store.me.name && !store.isOwner) return store.me.name.split(" ")[0];
    return "";
  }
  function prog(sid) { const p = store.docs["prog-" + sid] || {}; return { q: p.q || {}, th: p.th || {} }; }
  function topicStats(t) {
    const p = prog(t.sid);
    let m = 0, seen = 0, mastered = 0, wrong = 0;
    for (const id of t.qids) {
      const st = p.q[id];
      if (st && st.n) {
        seen++;
        m += Math.min(st.b || 0, 2) / 2;
        if ((st.b || 0) >= 2) mastered++;
        if (st.last !== 2) wrong++;
      }
    }
    const read = !!p.th[t.id];
    const total = t.qids.length;
    const pct = Math.round(100 * (0.1 * (read ? 1 : 0) + 0.9 * (total ? m / total : 0)));
    return { pct, seen, mastered, wrong, total, read };
  }
  function subjectStats(sid) {
    const s = SUBJ[sid];
    if (!s) return { pct: 0, mastered: 0, total: 0, seen: 0, started: 0, topics: 0 };
    let sum = 0, mastered = 0, total = 0, seen = 0, started = 0;
    for (const t of s.topicList) {
      const ts = topicStats(t);
      sum += ts.pct; mastered += ts.mastered; total += ts.total; seen += ts.seen;
      if (ts.pct > 0) started++;
    }
    return { pct: Math.round(sum / s.topicList.length), mastered, total, seen, started, topics: s.topicList.length };
  }
  function subjectAccuracy(sid) {
    const q = prog(sid).q;
    let n = 0, k = 0;
    for (const id of Object.keys(q)) {
      const st = q[id];
      if (QS[id] && st && st.n) { n += st.n; k += st.k || 0; }
    }
    return { n, k, acc: n ? Math.round((100 * k) / n) : null };
  }
  function subjectReadCount(sid) {
    const s = SUBJ[sid];
    if (!s) return 0;
    const th = prog(sid).th;
    return s.topicList.filter((t) => !!th[t.id]).length;
  }
  function dueQs(sid) {
    const p = prog(sid), t = todayISO();
    return Object.keys(p.q).filter((id) => QS[id] && p.q[id] && p.q[id].n && p.q[id].last === 2 && (p.q[id].due || "") <= t);
  }
  function mistakeQs(sid, topicId) {
    const p = prog(sid);
    return Object.keys(p.q).filter((id) => QS[id] && p.q[id] && p.q[id].n && p.q[id].last !== 2 && (!topicId || QS[id].topic === topicId));
  }
  function sessions() {
    const out = [];
    for (const name in store.docs) {
      if (name.indexOf("log-") !== 0) continue;
      const s = (store.docs[name] && store.docs[name].s) || {};
      for (const id in s) { const e = s[id]; if (e && e.d) out.push(Object.assign({ id, doc: name }, e)); }
    }
    return out.sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (b.at || 0) - (a.at || 0)));
  }
  function minutesByDay() {
    const m = {};
    for (const s of sessions()) m[s.d] = (m[s.d] || 0) + (s.m || 0);
    return m;
  }
  function formatAvg(v) {
    if (v == null) return "—";
    return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, "").replace(".", ",");
  }
  function totals() {
    const ss = sessions(), today = todayISO();
    const d7 = addDays(today, -6), d14 = addDays(today, -13), d28 = addDays(today, -27);
    let t = 0, w = 0, pw = 0, m28 = 0, all = 0, q7 = 0, c7 = 0, qAll = 0, cAll = 0;
    let quizCount = 0, hintTotal = 0;
    const active = new Set();
    for (const s of ss) {
      const m = s.m || 0;
      all += m;
      if (s.k === "quiz") {
        qAll += s.q || 0; cAll += s.c || 0;
        if ((s.q || 0) > 0) { quizCount++; hintTotal += s.h || 0; }
      }
      if (s.d === today) t += m;
      if (s.d >= d7 && s.d <= today) { w += m; if (s.k === "quiz") { q7 += s.q || 0; c7 += s.c || 0; } }
      else if (s.d >= d14 && s.d < d7) pw += m;
      if (s.d >= d28 && s.d <= today) m28 += m;
      if (m > 0 || (s.q || 0) > 0) active.add(s.d);
    }
    if (!qAll) {
      for (const s of CONTENT) { const sa = subjectAccuracy(s.id); qAll += sa.n; cAll += sa.k; }
    }
    let streak = 0, d = active.has(today) ? today : addDays(today, -1);
    while (active.has(d)) { streak++; d = addDays(d, -1); }
    return {
      today: t, d7: w, prev7: pw, d28: m28, all, streak,
      acc7: q7 ? Math.round((100 * c7) / q7) : null,
      accAll: qAll ? Math.round((100 * cAll) / qAll) : null,
      quizCount, hintTotal,
      hintAvg: quizCount ? hintTotal / quizCount : null
    };
  }
  function questionAttemptBreakdown(sidFilter) {
    const pool = !sidFilter || sidFilter === "all" ? CONTENT : CONTENT.filter((s) => s.id === sidFilter);
    const b = { total: 0, n0: 0, n1: [], n2: [], n3: [], n4: [] };
    for (const s of pool) {
      const pq = prog(s.id).q;
      for (const t of (SUBJ[s.id] && SUBJ[s.id].topicList) || []) {
        for (const id of t.qids) {
          const q = QS[id];
          if (!q) continue;
          b.total++;
          const st = pq[id];
          const n = st && st.n ? st.n : 0;
          if (!n) b.n0++;
          else if (n === 1) b.n1.push({ q, t, st });
          else if (n === 2) b.n2.push({ q, t, st });
          else if (n === 3) b.n3.push({ q, t, st });
          else b.n4.push({ q, t, st });
        }
      }
    }
    const byAt = (x, y) => (y.st.at || 0) - (x.st.at || 0);
    b.n1.sort(byAt); b.n2.sort(byAt); b.n3.sort(byAt); b.n4.sort(byAt);
    return b;
  }
  function mocks() {
    const m = (store.docs.mocks && store.docs.mocks.m) || {};
    return Object.keys(m).filter((k) => m[k] && m[k].d).map((k) => Object.assign({ id: k }, m[k]))
      .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : (a.at || 0) - (b.at || 0)));
  }
  const DIAG_PLAN_ID = { bio: "diag", rus: "diag-rus", chem: "diag-chem" };
  const PREP_PLAN_ID = { rus: "rus-start", chem: "chem-start" };
  function planDoc() { const p = store.docs.plan || {}; return { done: p.done || {}, custom: p.custom || {}, results: p.results || {} }; }
  function findPlanItem(id) {
    for (const ph of (EGE.plan && EGE.plan.phases) || []) {
      const it = (ph.items || []).find((x) => x.id === id);
      if (it) return it;
    }
    return null;
  }
  function planItems() {
    const pd = planDoc(), prof = profile(), out = [];
    for (const ph of (EGE.plan && EGE.plan.phases) || []) {
      for (const it of ph.items) {
        out.push(Object.assign({}, it, { due: it.exam ? prof.exams[it.exam] : it.due, phase: ph.id, done: !!pd.done[it.id], result: pd.results[it.id] || null, custom: false }));
      }
    }
    for (const id in pd.custom) {
      const c = pd.custom[id];
      if (c && c.t) out.push({ id, title: c.t, due: c.d || "", note: c.n || "", done: !!c.done, custom: true, phase: "mine" });
    }
    return out;
  }
  function quizOutcome(qz) {
    const answered = qz.items.filter((it) => it.res);
    const right = answered.filter((it) => it.res.r === 2).length;
    const total = qz.items.length;
    const pts = answered.reduce((s, it) => s + it.res.pts, 0);
    const max = answered.reduce((s, it) => s + it.res.max, 0);
    const pct = total ? Math.round((100 * right) / total) : 0;
    return { answeredCount: answered.length, c: right, q: total, pct, pts, max };
  }
  function markPlanPrep(sid, note) {
    const planId = PREP_PLAN_ID[sid];
    if (!planId) return;
    const pd = planDoc(), patch = {};
    if (!pd.done[planId]) patch.done = { [planId]: Date.now() };
    if (note && !pd.results[planId]) patch.results = { [planId]: { kind: "prep", note, at: Date.now() } };
    if (patch.done || patch.results) patchDoc("plan", patch);
  }
  function completePlanFromQuiz(qz) {
    if (!qz || qz.retry) return;
    const o = quizOutcome(qz);
    if (!o.answeredCount) return;
    const now = Date.now();
    if (qz.mode === "mixed") {
      const planId = qz.planId || DIAG_PLAN_ID[qz.sid];
      if (!planId) return;
      patchDoc("plan", {
        done: { [planId]: now },
        results: { [planId]: { kind: "diag", c: o.c, q: o.q, pct: o.pct, pts: o.pts, max: o.max, at: now } }
      });
      if (qz.back && qz.back.v === "plan") toast(`Диагностика выполнена: ${o.c} из ${o.q} (${o.pct}%)`);
      return;
    }
    if (qz.mode === "topic" || qz.mode === "variant" || qz.mode === "part2") {
      const planId = qz.planId || PREP_PLAN_ID[qz.sid];
      if (!planId) return;
      const t = qz.topicId && TOPICS[qz.topicId];
      const pd = planDoc();
      patchDoc("plan", {
        done: { [planId]: pd.done[planId] || now },
        results: { [planId]: { kind: "prep", c: o.c, q: o.q, pct: o.pct, pts: o.pts, max: o.max, topic: t ? t.title : qz.title, at: now } }
      });
      if (qz.back && qz.back.v === "plan") toast(`Подготовка начата: ${o.c} из ${o.q} (${o.pct}%)`);
    }
  }
  function nextExam(prof) {
    const picked = selectedStudySubjects(prof);
    const examDateMap = examDefaults();
    return picked.map((s) => ({
      subject: s.id,
      name: s.name,
      date: (prof && prof.exams && prof.exams[s.id]) || examDateMap[s.id] || s.examDate || ""
    }))
      .filter((e) => validISO(e.date) && daysUntil(e.date) >= 0)
      .sort((a, b) => (a.date < b.date ? -1 : 1))[0] || null;
  }

  // ---------- тема оформления ----------
  const THEME_LS = "vektor-ege:theme";
  let themeMode = "auto";
  function readThemePref() {
    try { const v = localStorage.getItem(THEME_LS); if (v === "light" || v === "dark" || v === "auto") return v; } catch (e) { /* недоступно */ }
    return "auto";
  }
  function effectiveDark() {
    return themeMode !== "light";
  }
  function applyTheme() {
    try {
      const ds = document.documentElement && document.documentElement.dataset;
      if (ds) { if (themeMode === "auto") delete ds.theme; else ds.theme = themeMode; }
    } catch (e) { /* игнор */ }
  }
  function setTheme(mode, silent) {
    themeMode = mode === "light" || mode === "dark" ? mode : "auto";
    try { localStorage.setItem(THEME_LS, themeMode); } catch (e) { /* недоступно */ }
    if (!silent && typeof document !== "undefined" && document.body && document.body.dataset) {
      document.body.dataset.userDark = themeMode === "dark" ? "1" : "0";
    }
    applyTheme();
    scheduleRender();
  }
  themeMode = readThemePref();
  applyTheme();
  try {
    const mq = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");
    if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (themeMode === "auto") scheduleRender(); });
  } catch (e) { /* игнор */ }

  // ---------- роль на платформе (по умолчанию ученик) ----------
  function resolveHostSite() {
    const hostSite = typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.site;
    if (hostSite === "student" || hostSite === "tutor" || hostSite === "brandbook") return hostSite;
    try {
      const p = typeof location !== "undefined" && location.pathname ? location.pathname : "/";
      if (p === "/student") return "student";
      if (p === "/tutor" || p === "/teacher" || p === "/cabinet") return "tutor";
      if (p === "/brandbook" || p.indexOf("/brandbook/") === 0) return "brandbook";
    } catch (e) { /* игнор */ }
    return "";
  }
  const HOST_SITE = resolveHostSite();
  const ROLE_LS = "vektor-ege:role";
  function readRolePref() {
    try { const v = localStorage.getItem(ROLE_LS); if (v === "tutor" || v === "student") return v; } catch (e) { /* недоступно */ }
    return "student";
  }
  function setRolePref(role) {
    const next = role === "tutor" ? "tutor" : "student";
    ui.role = next;
    try { localStorage.setItem(ROLE_LS, next); } catch (e) { /* недоступно */ }
  }

  // ---------- состояние интерфейса ----------
  const INITIAL_ROLE = (HOST_SITE === "student" || HOST_SITE === "tutor")
    ? HOST_SITE
    : readRolePref();
  const IS_FEES_ENTRY = (typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.view === "fees")
    || (typeof location !== "undefined" && location.pathname === "/fees");
  const IS_MARKET_ENTRY = (typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.view === "market")
    || (typeof location !== "undefined" && location.pathname === "/market");
  const INITIAL_VIEW = IS_FEES_ENTRY
    ? "fees"
    : (IS_MARKET_ENTRY
      ? "market"
      : (HOST_SITE === "tutor" ? "cabinet" : (HOST_SITE === "brandbook" ? "brandbook" : "home")));
  const ui = {
    view: INITIAL_VIEW,
    role: INITIAL_ROLE,
    sid: firstSubject.id,
    topicId: null,
    quiz: null,
    gen: null,
    confirm: null,
    confirmDel: null,
    drafts: {},
    exportText: "",
    focusNext: null,
    chat: { sid: firstSubject.id, turns: [], busy: false, ctl: null, draft: "", error: "" },
    auth: { tab: "login", channel: "wa", busy: false, error: "" },
    authModal: false,
    filterModal: false,
    filterSubjExpanded: false,
    filterSubjQ: "",
    reviewsModal: null,
    reviewModal: null,
    disputeModal: null,
    cookieModal: null,
    cookieConsent: null,
    guest: !!(typeof window !== "undefined" && ((window.EGE_HOST && window.EGE_HOST.guest) || (typeof location !== "undefined" && /(?:^\?|&)guest=1(?:&|$)/.test(location.search || "")))),
    essay: null,
    subjQ: "",
    subjFilter: "all",
    topicFilter: "all",
    planFilter: "all",
    guideSid: "all",
    guideQ: "",
    statsSubj: "all",
    statsRepBucket: 1,
    statsRepAll: false,
    studyTab: "week",
    studyWeekOffset: 0,
    studySubj: "all",
    learnTab: "subjects",
    commTab: "chats",
    messenger: { open: false, activeThreadId: "", query: "", draft: "", busy: false, loading: false, error: "", serverThreads: [], messagesByThread: {}, loadedOnce: false },
    bug: null,
    notifModal: false,
    notifications: [],
    booking: null,
    balanceModal: null,
    payoutModal: null,
    leadDraft: { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, scheduleNote: "", whatsapp: "", comment: "" },
    market: null,
    demo: { tab: "quiz", sid: firstSubject.id, qIdx: 0, pick: null, revealed: false, topicIdx: 0, bidRate: 1000, bidHour: "10:00" },
    motion: { playing: true, preset: "design", step: 0, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" },
    savings: { freq: 2, marketRate: 1350, offerRate: 1000 },
    bbModal: false,
    coopModal: false,
    demoAuthed: false,
    authPrompt: "",
    pendingBookingAfterAuth: null,
    prepSetupOpen: false,
    homeBidFilter: "all",
    highlightBidId: "",
    highlightBidTutorId: "",
    highlightBidSeq: 0,
    justAcceptedBookingId: "",
    justAcceptedSeq: 0,
    justConfirmedSchedId: "",
    justConfirmedSchedSeq: 0,
    telemostEditId: "",
    telemostError: "",
    mktVisibleCount: 8,
    landWhiteStage: false,
    brandbook: { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, vpWidth: 390, chipOn: true, sent: false, fav: true, switchVal: "online", multiSubjs: ["bio", "chem"], multiMenuOpen: false, pickedPlan: "month10k", quizOpt: 1, marketDemoAccepted: false, reducedMotion: false, balFunded: true, chartStyle: "sticks", chartDataset: "income", chartActiveIdx: 3, chartLines: 1, chartPoints: 7, linePtIdx: 3, donutDataset: "channels", donutSliceIdx: 0, tableCols: 5, tableFilter: "all", tableSearch: "", maskPhone: "+7 (914) 210-05-11", maskTg: "@aytal_bio", maskMax: "aytal_ege", payMethod: "sbp", payState: "frozen", payInitialDone: false, tablePreset: "requests", confirmedRows: {}, essayOpenIdx: 0 }
  };
  const MARKET_LS_KEY = "vektor-ege:market";
  const TDATA = EGE.tutors || null;
  function defaultMarketState() {
    return {
      planId: "trial5k",
      balance: 0,
      initialPaid: false,
      calcRate: 800,
      q: "",
      exam: "all",
      subject: "all",
      format: "all",
      city: "all",
      minPrice: 0,
      maxPrice: 0,
      priceCustom: false,
      priceExplicit: false,
      onlyBumped: false,
      sort: "actual",
      day: "all",
      hour: "all",
      favs: [],
      bookings: [],
      telemostUrl: ""
    };
  }
  function mkt() {
    if (ui.market) return ui.market;
    let saved = null;
    try {
      const raw = localStorage.getItem(MARKET_LS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { /* игнор */ }
    ui.market = Object.assign(defaultMarketState(), saved && typeof saved === "object" ? saved : {});
    ui.market.initialPaid = !!(ui.market.initialPaid || Number(ui.market.balance) >= 490);
    if (!ui.market.planId || ui.market.planId === "free") ui.market.planId = "trial5k";
    if (!ui.market.city) ui.market.city = "all";
    ui.market.minPrice = Math.max(0, Number(ui.market.minPrice) || 0);
    if (saved && Number(saved.maxPrice) === 2000 && !saved.priceExplicit) ui.market.maxPrice = 0;
    else ui.market.maxPrice = Math.max(0, Number(ui.market.maxPrice) || 0);
    ui.market.priceCustom = !!ui.market.priceCustom;
    if (!Array.isArray(ui.market.bookings)) ui.market.bookings = [];
    if (!Array.isArray(ui.market.favs)) ui.market.favs = [];
    return ui.market;
  }
  function saveMkt() {
    try { localStorage.setItem(MARKET_LS_KEY, JSON.stringify(mkt())); } catch (e) { /* игнор */ }
  }
  function draft(key, fallback) { return Object.prototype.hasOwnProperty.call(ui.drafts, key) ? ui.drafts[key] : fallback; }
  function clearDrafts(prefix, keep) { for (const k of Object.keys(ui.drafts)) if (k.indexOf(prefix) === 0 && !(keep || []).includes(k)) delete ui.drafts[k]; }

  const TUTOR_TAB_VIEWS = {
    "tutor-requests": "requests",
    "tutor-calendar": "students",
    "tutor-students": "students",
    "tutor-comm": "comm",
    "tutor-chat": "comm",
    "tutor-leads": "leads",
    "tutor-profile": "profile"
  };

  function go(v, opts) {
    opts = opts || {};
    if (TUTOR_TAB_VIEWS[v]) {
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab(TUTOR_TAB_VIEWS[v]);
      v = "cabinet";
    } else if (v === "cabinet" && opts.fromNav) {
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab("requests");
    }
    if (ui.view === "quiz" && v !== "quiz") {
      abortAI();
      if (ui.quiz && !ui.quiz.done) {
        if (!ui.quiz.checked && !ui.quiz.pausedAt) {
          ui.quiz.spent += Math.min(Date.now() - ui.quiz.qStart, MAX_Q_MS);
          ui.quiz.pausedAt = Date.now();
        }
        saveActiveQuiz();
      }
    }
    if (v === "quiz" && ui.quiz && !ui.quiz.done) {
      ui.quiz.qStart = Date.now();
      ui.quiz.pausedAt = null;
    }
    if (ui.quiz && ui.quiz.done && v !== "quiz") { ui.quiz = null; clearActiveQuiz(); }
    if (v === "subject" && opts.sid && SUBJ[opts.sid]) {
      if (opts.sid !== ui.sid) { ui.subjQ = ""; ui.subjFilter = "all"; }
      ui.sid = opts.sid;
    }
    if (v === "topic" && opts.id && TOPICS[opts.id]) {
      if (opts.id !== ui.topicId) ui.topicFilter = "all";
      ui.topicId = opts.id; ui.sid = TOPICS[opts.id].sid;
    }
    if (v === "profile") clearDrafts("pf.");
    if (v !== "profile") ui.pfAccountEditOpen = false;
    if (v === "tests" && !opts.keepLearnTab) ui.learnTab = "subjects";
    if (v === "essay") ui.sid = "rus";
    ui.view = v;
    ui.confirm = null; ui.confirmDel = null; ui.exportText = ""; ui.auth.error = "";
    writeHash();
    if (EGE.analytics && typeof EGE.analytics.trackPageView === "function") EGE.analytics.trackPageView("/#" + v);
    scheduleRender(true);
  }
  function readHash() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (HOST_SITE === "student" || HOST_SITE === "tutor") {
      ui.role = HOST_SITE;
    }
    if (h) {
      if (TOPICS[h]) { ui.view = "topic"; ui.topicId = h; ui.sid = TOPICS[h].sid; return; }
      if (SUBJ[h]) { ui.view = "subject"; ui.sid = h; return; }
      if (h === "essay" && EGE.essay && SUBJ.rus) { ui.view = "essay"; ui.sid = "rus"; return; }
      if (TUTOR_TAB_VIEWS[h]) {
        if (HOST_SITE !== "student") ui.role = "tutor";
        if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab(TUTOR_TAB_VIEWS[h]);
        ui.view = "cabinet";
        return;
      }
      if (h === "chats" || h === "comm") { ui.view = "home"; ui.commTab = "chats"; return; }
      if (h === "bids" || h === "responses") { ui.view = "home"; ui.commTab = "bids"; return; }
      if (h === "learn") { ui.view = "tests"; return; }
      if (h === "calendar") { ui.view = "study"; return; }
      if (["home", "tests", "study", "plan", "stats", "tutor", "cabinet", "market", "landing", "brandbook", "fees", "profile"].includes(h)) { ui.view = h; return; }
    }
    try {
      if (!h && typeof location !== "undefined") {
        if (location.pathname === "/brandbook" || (location.pathname && location.pathname.indexOf("/brandbook/") === 0) || HOST_SITE === "brandbook") { ui.view = "brandbook"; return; }
        if (location.pathname === "/fees" || (typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.view === "fees")) {
          if (HOST_SITE === "tutor") ui.role = "tutor";
          ui.view = "fees";
          return;
        }
        if (location.pathname === "/market" || (typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.view === "market")) {
          ui.view = "market";
          return;
        }
        if (location.pathname === "/landing") { ui.view = "landing"; return; }
        if (HOST_SITE === "tutor") { ui.role = "tutor"; ui.view = "cabinet"; return; }
        if (HOST_SITE === "student") { ui.role = "student"; ui.view = "home"; return; }
      }
    } catch (e) { /* игнор */ }
    if (!h && typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.landing) ui.view = "landing";
  }
  function applyPostAuthView(forceDefault) {
    if (HOST_SITE === "student" || HOST_SITE === "tutor") {
      ui.role = HOST_SITE;
    }
    if (ui.role === "tutor") {
      if (forceDefault || !["cabinet", "fees", "tutor"].includes(ui.view)) ui.view = "cabinet";
      writeHash();
      return;
    }
    if (forceDefault || ui.view !== "market") ui.view = "home";
    writeHash();
  }
  function writeHash() {
    if (HOST_SITE === "brandbook" && ui.view === "brandbook") return;
    const tcTab = ui.view === "cabinet" && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.getTab === "function" ? EGE.views.tutorCabinet.getTab() : "";
    const tok = ui.view === "cabinet"
      ? ("tutor-" + (tcTab || "requests"))
      : (ui.view === "topic" ? ui.topicId : ui.view === "subject" ? ui.sid : ui.view === "quiz" ? null : ui.view);
    if (!tok) return;
    try { history.replaceState(null, "", "#" + tok); } catch (e) { /* адрес не меняется в просмотрщике */ }
  }

  // ---------- рендер ----------
  let renderQueued = false, scrollTopPending = false, lastRenderedView = "";
  function scheduleRender(scrollTop) {
    if (scrollTop) scrollTopPending = true;
    if (renderQueued) return;
    renderQueued = true;
    Promise.resolve().then(() => { renderQueued = false; render(); });
  }
  const VIEWS = { home: viewHome, tests: viewTests, study: viewStudy, subject: viewSubject, topic: viewTopic, quiz: viewQuiz, essay: viewEssay, plan: viewPlan, stats: viewStats, tutor: viewTutor, cabinet: viewCabinet, market: () => viewMarket({ inside: true }), landing: viewLanding, brandbook: () => viewBrandbook({ inside: true }), fees: () => viewFees({ inside: true }), profile: viewProfile };
  function setAuthLayout(on) {
    try {
      if (document.body && document.body.dataset) {
        if (on) document.body.dataset.auth = "1";
        else delete document.body.dataset.auth;
      }
    } catch (e) { /* игнор */ }
  }
  function siteLoaderHTML() {
    return `<div class="site-boot-loader is-inline" role="status" aria-live="polite" aria-label="Загрузка">
      <svg class="site-loader-logo" viewBox="0 0 64 64" width="56" height="56" fill="none" aria-hidden="true">
        <path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vektor-bm-grad-base)"/>
        <path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vektor-bm-grad-red)"/>
        <path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vektor-bm-grad-amber)"/>
        <path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vektor-bm-grad-green)"/>
      </svg>
      <div class="site-loader-text">Загрузка...</div>
    </div>`;
  }
  function dismissSiteBootLoader() {
    if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
    const loader = document.getElementById("site-boot-loader");
    if (!loader || loader.hidden) return;
    if (loader.classList) loader.classList.add("is-hidden");
    if (typeof setTimeout === "function") setTimeout(() => { loader.hidden = true; }, 240);
    else loader.hidden = true;
  }
  function render() {
    try {
      if (document.documentElement && document.documentElement.classList) {
        document.documentElement.classList.toggle("reduced-motion", !!(ui.brandbook && ui.brandbook.reducedMotion));
      }
    } catch (e) { /* игнор */ }
    const sameView = lastRenderedView === ui.view;
    const savedScrollY = (!scrollTopPending && sameView && typeof window !== "undefined" && typeof window.scrollY === "number") ? window.scrollY : null;
    const authGate = store.backend && !store.user && !ui.guest;
    try {
      if (document.body && document.body.dataset) {
        if (ui.view === "brandbook" && HOST_SITE === "brandbook") document.body.dataset.brandbook = "1";
        else delete document.body.dataset.brandbook;
        if (ui.view === "landing" || (ui.view === "fees" && !(HOST_SITE === "tutor" || ui.role === "tutor"))) {
          document.body.dataset.fullbleed = "1";
        } else {
          delete document.body.dataset.fullbleed;
        }
      }
    } catch (e) { /* игнор */ }
    setAuthLayout(authGate);
    if (!authGate) renderChrome();
    const main = $("#main");
    const savedScrollLefts = [];
    if (main && typeof main.querySelectorAll === "function") {
      [".cal-days", ".bb-days-rail", ".chip-rail.swipe"].forEach((sel) => {
        main.querySelectorAll(sel).forEach((rail, idx) => {
          if (rail && rail.scrollLeft) savedScrollLefts.push([sel, idx, rail.scrollLeft]);
        });
      });
    }
    const active = document.activeElement;
    const aid = active && active !== document.body && active.id;
    let selS = null, selE = null;
    const scrollIn = aid ? active.scrollTop : 0; // прокрутка внутри длинного поля (сочинение)
    try { if (aid && typeof active.selectionStart === "number") { selS = active.selectionStart; selE = active.selectionEnd; } } catch (e) { /* не текстовое поле */ }
    let html;
    if (authGate) {
      const topBalSlot = $("#top-balance-slot");
      if (topBalSlot) { topBalSlot.hidden = true; topBalSlot.innerHTML = ""; }
      const tutorDock = $("#tutor-balance-dock");
      if (tutorDock) { tutorDock.hidden = true; tutorDock.innerHTML = ""; }
      html = store.ready
        ? (ui.view === "brandbook"
          ? viewBrandbook({ inside: false })
          : ui.view === "fees"
            ? viewFees({ inside: false })
            : ui.view === "market"
              ? viewMarket({ inside: false, dark: effectiveDark() })
              : authScreen())
        : siteLoaderHTML();
      main.innerHTML = html;
    } else {
      try { html = (VIEWS[ui.view] || viewTests)(); }
      catch (e) { console.error(e); html = `<div class="notice"><b>Что-то пошло не так при показе раздела.</b><span>Открой тесты и попробуй снова.</span></div>`; }
      const resumeBar = (ui.quiz && !ui.quiz.done && ui.view !== "quiz")
        ? `<div class="quiz-resume" role="region" aria-label="Активный тест">
            <div class="quiz-resume-info"><span class="eyebrow">Тест на паузе</span><b>${esc(ui.quiz.title)} · вопрос ${ui.quiz.i + 1} из ${ui.quiz.items.length}</b></div>
            <div class="row" style="gap:8px">
              <button type="button" class="btn sm" data-a="go" data-v="quiz">Вернуться к тесту</button>
              <button type="button" class="btn ghost sm" data-a="quiz-exit">Завершить</button>
            </div>
          </div>`
        : "";
      main.innerHTML = `<div class="page">${resumeBar}${html}</div>`;
    }
    $("#tip").hidden = true;
    if (!authGate) drawCharts();
    renderModal();
    mountTelegramLoginWidget();
    renderCookieBanner();
    renderMiniChatDock();
    if (aid) {
      const el = document.getElementById(aid);
      if (el && !el.disabled) {
        el.focus({ preventScroll: true });
        try { if (selS != null) el.setSelectionRange(selS, selE); } catch (e) { /* не текстовое поле */ }
        if (scrollIn) el.scrollTop = scrollIn;
      }
    }
    if (ui.focusNext) {
      const el = document.getElementById(ui.focusNext);
      ui.focusNext = null;
      if (el) el.focus({ preventScroll: true });
    }
    if (savedScrollLefts.length && main && typeof main.querySelectorAll === "function") {
      savedScrollLefts.forEach(([sel, idx, val]) => {
        const rails = main.querySelectorAll(sel);
        if (rails && rails[idx]) rails[idx].scrollLeft = val;
      });
    }
    if (scrollTopPending) { scrollTopPending = false; window.scrollTo(0, 0); }
    else if (savedScrollY !== null && typeof window !== "undefined" && typeof window.scrollTo === "function" && window.scrollY !== savedScrollY) {
      window.scrollTo(0, savedScrollY);
    }
    lastRenderedView = ui.view;
    syncHeroMotion();
    if (store.ready || !store.backend) dismissSiteBootLoader();
  }
  const BUG_EMAIL = "willagegg@gmail.com";
  const FEEDBACK_MAX_BYTES = 20 * 1024 * 1024;
  const FEEDBACK_MAX_FILES = 5;
  const FEEDBACK_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"]);
  const VIEW_LABELS = { home: "Общение", tests: "Учёба", study: "Календарь", subject: "Предмет", topic: "Тема", quiz: "Тест", plan: "План поступления", stats: "Показатели", tutor: "Справочник", cabinet: "Кабинет преподавателя", essay: "Сочинение", market: "Поиск", landing: "О сервисе и тарифы", brandbook: "Брендбук и UI Kit", fees: "Оплата и сервисный сбор", profile: "Профиль" };
  function bugMailtoHref(bug) {
    return `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(bug.subject)}&body=${encodeURIComponent(bug.body)}`;
  }
  function defaultFeedbackContact() {
    const p = profile();
    const u = store && store.user;
    return String((p && (p.phone || p.email)) || (u && u.email) || "").trim().slice(0, 160);
  }
  function defaultFeedbackName() {
    const p = profile();
    const u = store && store.user;
    return String((p && p.name) || (u && (u.displayName || u.username)) || "").trim().slice(0, 120);
  }
  function formatFeedbackSize(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n >= 1024 * 1024) return (n / (1024 * 1024)).toFixed(1).replace(/\.0$/, "") + " МБ";
    if (n >= 1024) return Math.max(1, Math.round(n / 1024)) + " КБ";
    return n + " Б";
  }
  function isAllowedFeedbackFile(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase().trim();
    if (type && FEEDBACK_ALLOWED_MIME.has(type)) return true;
    const name = String(file.name || "").toLowerCase();
    return /\.(jpe?g|png|webp|gif|pdf)$/.test(name);
  }
  function isPdfFeedbackFile(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    const name = String(file.name || "").toLowerCase();
    return type === "application/pdf" || /\.pdf$/.test(name);
  }
  function mergeFeedbackFiles(targetObj, fileList) {
    if (!targetObj || !fileList || !fileList.length) return;
    const list = Array.isArray(targetObj.files) ? targetObj.files.slice() : (targetObj.files = []);
    targetObj.error = "";
    let totalBytes = list.reduce((sum, f) => sum + (Number(f && f.size) || 0), 0);
    for (let i = 0; i < fileList.length; i++) {
      const f = fileList[i];
      if (!f) continue;
      if (list.length >= FEEDBACK_MAX_FILES) {
        targetObj.error = `Можно прикрепить не более ${FEEDBACK_MAX_FILES} файлов.`;
        break;
      }
      if (!isAllowedFeedbackFile(f)) {
        targetObj.error = "Допустимы только фото (JPG, PNG, WebP, GIF) и PDF.";
        continue;
      }
      const fSize = Math.max(0, Number(f.size) || 0);
      if (fSize > FEEDBACK_MAX_BYTES || (totalBytes + fSize) > FEEDBACK_MAX_BYTES) {
        targetObj.error = "Суммарный размер вложений превышает 20 МБ.";
        continue;
      }
      const dup = list.some((x) => x && x.name === f.name && Number(x.size) === fSize);
      if (!dup) {
        list.push(f);
        totalBytes += fSize;
      }
    }
    targetObj.files = list;
  }
  function feedbackAttachHTML(kind, files) {
    const list = Array.isArray(files) ? files : [];
    const totalBytes = list.reduce((sum, f) => sum + (Number(f && f.size) || 0), 0);
    const chipsHTML = list.length
      ? `<div class="fb-file-chips">${list.map((f, idx) => {
          const isPdf = isPdfFeedbackFile(f);
          const name = String((f && f.name) || ("file-" + (idx + 1)));
          return `<span class="fb-file-chip">
            <span class="fb-file-kind${isPdf ? " is-pdf" : ""}">${isPdf ? "PDF" : "ФОТО"}</span>
            <span class="fb-file-name" title="${esc(name)}">${esc(name)}</span>
            <span class="fb-file-size num">${esc(formatFeedbackSize(f && f.size))}</span>
            <button type="button" class="fb-file-rm" data-a="${esc(kind)}-file-remove" data-i="${idx}" aria-label="Удалить файл ${esc(name)}">×</button>
          </span>`;
        }).join("")}</div>`
      : "";
    return `<div class="fb-attach-box">
      <div class="fb-attach-head">
        <label class="fb-add-btn" for="${esc(kind)}-files" title="Прикрепить фото или PDF (до 20 МБ)">
          <span class="fb-add-plus" aria-hidden="true">${icon("plus")}</span>
          <span>Добавить файлы</span>
        </label>
        <input class="fb-file-input" id="${esc(kind)}-files" data-${esc(kind)}-files="1" type="file" multiple accept="image/jpeg,image/png,image/webp,image/gif,.pdf,application/pdf">
        <span class="fb-attach-hint">Фото или PDF · до 20 МБ${list.length ? ` (${list.length}/${FEEDBACK_MAX_FILES} · ${formatFeedbackSize(totalBytes)})` : ""}</span>
      </div>
      ${chipsHTML}
    </div>`;
  }
  function buildBugReport(opts) {
    opts = opts || {};
    const urlStr = typeof location !== "undefined" && location.href ? location.href : "";
    const q = opts.qid ? QS[opts.qid] : null;
    if (q) {
      const t = TOPICS[q.topic];
      const subjName = SUBJECT_NAME[q.sid] || "Предмет";
      const qNum = opts.qnum || (q.kim ? String(q.kim) : (t && /^\d+$/.test(t.code || "") ? t.code : ""));
      const numLabel = qNum ? "№" + qNum : "этом задании";
      const rawQ = String(q.q || "").replace(/\s+/g, " ").trim();
      const clipQ = rawQ.length > 220 ? rawQ.slice(0, 218) + "…" : rawQ;
      const ans = correctText(q);
      const ansClip = ans && ans.length > 160 ? ans.slice(0, 158) + "…" : ans;
      return {
        title: `Ошибка в задании ${qNum ? "№" + qNum : ""}`.trim(),
        subject: `Баг в задании ${qNum ? "№" + qNum : q.id} (${subjName}) — Вектор`,
        qid: String(q.id || ""),
        qnum: String(qNum || ""),
        contact: defaultFeedbackContact(),
        files: [],
        busy: false,
        error: "",
        body: [
          "Здравствуйте! Нашёл(ла) ошибку в «Вектор».",
          "",
          `На задании ${numLabel} неправильно сделано / указано: (уточните что не так или отправьте как есть)`,
          "",
          "Детали задания:",
          `• Предмет: ${subjName}`,
          `• Тема: ${t ? topicRef(t) : "—"}`,
          `• Задание: ${qNum ? "№" + qNum : "—"}${q.kim ? ` (КИМ №${q.kim})` : ""}`,
          `• ID: ${q.id}`,
          `• Текст: ${clipQ}`,
          `• Ответ в системе: ${ansClip || "—"}`,
          urlStr ? `• Страница: ${urlStr}` : ""
        ].filter((x, i, a) => x || (a[i - 1] !== "")).join("\n")
      };
    }
    const viewName = VIEW_LABELS[ui.view] || ui.view || "Сайт";
    const subjNote = ui.sid && SUBJECT_NAME[ui.sid] && ["subject", "topic", "quiz", "essay"].includes(ui.view) ? ` (${SUBJECT_NAME[ui.sid]})` : "";
    const screen = typeof window !== "undefined" && window.innerWidth ? `${window.innerWidth}×${window.innerHeight}` : "—";
    return {
      title: "Сообщить об ошибке на сайте",
      subject: `Баг на сайте (${viewName}) — Вектор`,
      qid: "",
      qnum: "",
      contact: defaultFeedbackContact(),
      files: [],
      busy: false,
      error: "",
      body: [
        "Здравствуйте! Нашёл(ла) ошибку на сайте «Вектор».",
        "",
        "Что работает не так / что нужно исправить:",
        "(опишите проблему в 1–2 предложениях)",
        "",
        "Контекст:",
        `• Раздел: ${viewName}${subjNote}`,
        `• Экран: ${screen}`,
        urlStr ? `• Страница: ${urlStr}` : ""
      ].filter((x, i, a) => x || (a[i - 1] !== "")).join("\n")
    };
  }
  function activeFilterCount(st) { return EGE.views.marketplace.activeFilterCount(st); }
  function bookingModalHTML() { return EGE.views.marketplace.bookingModalHTML(); }
  function filterModalHTML() { return EGE.views.marketplace.filterModalHTML(); }
  // ---------- телефоны, СМС-подтверждение и баланс/карты (core/phone-pay.js) ----------
  const _pp = () => EGE.phonePay;
  function balanceTopWidgetHTML(compact) { return _pp().balanceTopWidgetHTML(compact); }
  function detectCardMeta(rawNum) { return _pp().detectCardMeta(rawNum); }
  function cardNetHTML(brand, opts) { return _pp().cardNetHTML(brand, opts); }
  function savedCardsForMarket(st) { return _pp().savedCardsForMarket(st); }
  function calcBalanceTopupMeta(rawAmount, method) { return _pp().calcBalanceTopupMeta(rawAmount, method); }
  function updateBalanceModalLive() { return _pp().updateBalanceModalLive(); }
  function phoneCountryByCode(code) { return _pp().phoneCountryByCode(code); }
  function formatPhoneForCountry(raw, countryCode) { return _pp().formatPhoneForCountry(raw, countryCode); }
  function detectPhoneCountry(raw, fallbackCode) { return _pp().detectPhoneCountry(raw, fallbackCode); }
  function stripEmptyDialPhone(raw, countryCode) { return _pp().stripEmptyDialPhone(raw, countryCode); }
  function phoneFieldHTML(opts) { return _pp().phoneFieldHTML(opts); }
  function openContactVerifyModal(opts) { return _pp().openContactVerifyModal(opts); }
  function balanceModalHTML() { return _pp().balanceModalHTML(); }
  function cardBindModalHTML() { return _pp().cardBindModalHTML(); }
  function contactVerifyModalHTML() { return _pp().contactVerifyModalHTML(); }
  function openTutorContactModal(tutorId, tutorName, ch) { return _pp().openTutorContactModal(tutorId, tutorName, ch); }
  function tutorContactModalHTML() { return _pp().tutorContactModalHTML(); }
  function authModalHTML() {
    if (!ui.authModal) return "";
    const reg = ui.auth && ui.auth.tab === "register";
    const modalLabel = reg
      ? (ui.role === "tutor" ? "Регистрация преподавателя" : "Регистрация ученика")
      : "Вход в аккаунт";
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-label="${modalLabel}">
      <div class="modal-card sheet-modal is-auth-sheet" data-sheet-kind="auth">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="auth-modal-close" aria-label="Свернуть окно входа">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-body auth-modal-shell">${authCard({ modal: true })}</div>
      </div>
    </div>`;
  }
  function tutorApplyModalHTML() {
    const ta = ui.tutorApply || (ui.tutorApply = { name: "", subject: "eng", rate: 1100, contact: "", error: "" });
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "eng", name: "Английский язык" }];
    const rate = Math.max(0, Math.min(99999, ta.rate != null ? Number(ta.rate) : 1100));
    const isPro = rate >= 1400;
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="ta-modal-title">
      <div class="modal-card sheet-modal" data-sheet-kind="tutor-apply">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="tutor-apply-close" aria-label="Свернуть анкету">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row" style="gap:8px">${icon("users")}<b id="ta-modal-title">Разместить анкету преподавателя</b></div>
          <button type="button" class="icon-btn sm sheet-close-btn" data-a="tutor-apply-close" aria-label="Закрыть анкету">${icon("x")}</button>
        </div>
        <div class="sheet-body">
          <form class="stack" style="gap:12px" data-f="tutor-apply">
            <div class="field">
              <label for="ta-name">Имя и фамилия</label>
              <input class="input" id="ta-name" type="text" placeholder="Например, Анна Соколова" value="${esc(ta.name || "")}">
            </div>
            <div class="field">
              <label for="ta-subj">Предмет или направление</label>
              <select class="select" id="ta-subj">
                ${subjects.map((s) => `<option value="${esc(s.id)}"${s.id === ta.subject ? " selected" : ""}>${esc(s.name)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <span class="label">Желаемая ставка за урок (₽/ч)</span>
              <div class="hh-price-stepper compact">
                <button type="button" class="hh-step-btn" data-a="tutor-apply-step" data-step="-50">−50 ₽</button>
                <div class="hh-step-readout"><b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b></div>
                <button type="button" class="hh-step-btn" data-a="tutor-apply-step" data-step="50">+50 ₽</button>
              </div>
              <span class="hint">${isPro ? `<span class="diff-tag pro">Выше рынка · Профи</span> Анкета получит фиолетовый бейдж высокой квалификации.` : "Базовая ставка каталога · шаг для торга можно ограничить позже."}</span>
            </div>
            <div class="field">
              <label for="ta-contact">Ссылка на анкету (Ykt / Telegram / MAX) или телефон</label>
              <input class="input" id="ta-contact" type="text" placeholder="t.me/username или +7 9..." value="${esc(ta.contact || "")}">
            </div>
            ${ta.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(ta.error)}</div>` : ""}
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="submit" class="btn"${ta.busy ? " disabled" : ""}>${ta.busy ? "Отправляем..." : "Отправить анкету"}</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  }
  function coopModalHTML() {
    const co = ui.coop || (ui.coop = {
      name: defaultFeedbackName(),
      contact: defaultFeedbackContact(),
      body: "",
      files: [],
      busy: false,
      error: ""
    });
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="coop-modal-title">
      <div class="modal-card sheet-modal" data-sheet-kind="coop">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="coop-close" aria-label="Свернуть сотрудничество">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row" style="gap:8px">${icon("users")}<b id="coop-modal-title">Сотрудничество с Вектор</b></div>
          <button type="button" class="icon-btn sm sheet-close-btn" data-a="coop-close" aria-label="Закрыть сотрудничество">${icon("x")}</button>
        </div>
        <div class="sheet-body">
          <p class="small ink2" style="margin:0;line-height:1.5">Работаем со школами, методическими центрами и преподавателями ЕГЭ/ОГЭ. Оставьте предложение — оно сразу попадёт команде в админку и Telegram.</p>
          <form class="stack" style="gap:12px" data-f="coop-submit">
            <div class="field">
              <label for="coop-name">Имя или организация</label>
              <input class="input" id="coop-name" type="text" placeholder="Например, Онлайн-школа «Меридиан»" value="${esc(co.name || "")}">
            </div>
            <div class="field">
              <label for="coop-contact">Контакт для связи (Telegram, телефон или email)</label>
              <input class="input" id="coop-contact" type="text" placeholder="@username, +7 9... или email" value="${esc(co.contact || "")}">
            </div>
            <div class="field">
              <label for="coop-body">Предложение или комментарий</label>
              <textarea class="input" id="coop-body" rows="4" placeholder="Расскажите о формате сотрудничества, материалах или предложении...">${esc(co.body || "")}</textarea>
            </div>
            ${feedbackAttachHTML("coop", co.files)}
            ${co.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(co.error)}</div>` : ""}
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="submit" class="btn"${co.busy ? " disabled" : ""}>${icon("send")}<span>${co.busy ? "Отправляем..." : "Отправить предложение"}</span></button>
              <button type="button" class="btn soft" data-a="coop-to-apply">Разместить анкету преподавателя</button>
            </div>
            <div class="fb-mailto-row">Резервная почта: <a href="mailto:${BUG_EMAIL}?subject=${encodeURIComponent("Сотрудничество с Вектор")}" target="_blank" rel="noopener">${BUG_EMAIL}</a></div>
          </form>
        </div>
      </div>
    </div>`;
  }
  function notifModalHTML() {
    const list = Array.isArray(ui.notifications) ? ui.notifications : [];
    const itemsHTML = list.length
      ? `<div class="notif-inbox-list">${list.map((n) => {
          const hasTid = Boolean(n && n.threadId);
          const rawActionUrl = n && typeof n.actionUrl === "string" ? n.actionUrl.trim() : "";
          const actionUrl = /^https?:\/\//i.test(rawActionUrl) ? rawActionUrl : "";
          const copyHTML = `<div class="notif-item-head">
              <b>${esc(n.title)}</b>
              <span class="notif-item-time num">${esc(n.timeLabel || "")}</span>
            </div>
            ${n.message ? `<div class="notif-item-msg">${esc(n.message)}</div>` : ""}
            ${hasTid ? `<span class="notif-item-link">Открыть чат →</span>` : ""}`;
          const joinHTML = actionUrl
            ? `<a class="btn soft sm notif-join-btn" href="${esc(actionUrl)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>${esc(n.actionLabel || "Войти на встречу")}</span></a>`
            : "";
          return `<div class="notif-inbox-item${hasTid ? " is-clickable" : ""}" data-notif-id="${esc(n.id)}">
            <span class="notif-item-dot" aria-hidden="true"></span>
            <div class="notif-item-body">
              ${hasTid
                ? `<button type="button" class="notif-item-copy notif-item-open" data-a="notif-open-thread" data-id="${esc(n.id)}" data-thread-id="${esc(n.threadId)}"${n.bookingId ? ` data-booking-id="${esc(n.bookingId)}"` : ""}>${copyHTML}</button>`
                : `<div class="notif-item-copy">${copyHTML}</div>`}
              ${joinHTML}
            </div>
            <button type="button" class="icon-btn sm notif-item-close" data-a="notif-remove" data-id="${esc(n.id)}" aria-label="Удалить уведомление">${icon("x")}</button>
          </div>`;
        }).join("")}</div>`
      : `<div class="empty"><b>Уведомлений пока нет</b><span>Новые события появятся здесь, а колокольчик сверху покажет их количество.</span></div>`;
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="notif-modal-title">
      <div class="modal-card sheet-modal" data-sheet-kind="notif">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="notif-close" aria-label="Свернуть уведомления">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head notif-sheet-head">
          <div class="row" style="gap:8px;min-width:0">${icon("bell")}<b id="notif-modal-title">Уведомления${list.length ? ` (${list.length})` : ""}</b></div>
          <div class="notif-sheet-actions">
            ${list.length ? `<button type="button" class="btn ghost sm" data-a="notif-clear">Очистить все</button>` : ""}
            <button type="button" class="icon-btn sm" data-a="notif-close" aria-label="Закрыть уведомления">${icon("x")}</button>
          </div>
        </div>
        <div class="sheet-body">
          ${itemsHTML}
        </div>
      </div>
    </div>`;
  }
  function applyCookieDataset(consent) {
    try {
      if (typeof document !== "undefined" && document.documentElement && document.documentElement.dataset) {
        if (!consent) {
          delete document.documentElement.dataset.cookieAnalytics;
          delete document.documentElement.dataset.cookieMarketing;
        } else {
          document.documentElement.dataset.cookieAnalytics = consent.analytics ? "1" : "0";
          document.documentElement.dataset.cookieMarketing = consent.marketing ? "1" : "0";
        }
      }
      if (EGE.analytics && typeof EGE.analytics.syncConsent === "function") {
        EGE.analytics.syncConsent(consent);
      }
    } catch (e) { /* игнор */ }
  }
  function readCookieConsent() {
    if (ui.cookieConsent) {
      applyCookieDataset(ui.cookieConsent);
      return ui.cookieConsent;
    }
    try {
      if (typeof localStorage !== "undefined") {
        const raw = localStorage.getItem(COOKIE_CONSENT_LS);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            const normConsent = {
              version: 1,
              necessary: true,
              analytics: !!parsed.analytics,
              marketing: !!parsed.marketing,
              mode: parsed.mode === "all" || parsed.mode === "necessary" ? parsed.mode : "custom",
              updatedAt: parsed.updatedAt || ""
            };
            ui.cookieConsent = normConsent;
            applyCookieDataset(normConsent);
            return normConsent;
          }
        }
      }
    } catch (e) { /* игнор */ }
    return null;
  }
  function saveCookieConsent(next) {
    next = next || {};
    const consent = {
      version: 1,
      necessary: true,
      analytics: !!next.analytics,
      marketing: !!next.marketing,
      mode: next.mode === "all" || next.mode === "necessary" ? next.mode : "custom",
      updatedAt: new Date().toISOString()
    };
    ui.cookieConsent = consent;
    applyCookieDataset(consent);
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(COOKIE_CONSENT_LS, JSON.stringify(consent));
      }
    } catch (e) { /* игнор */ }
    return consent;
  }
  EGE.legal = Object.assign(EGE.legal || {}, {
    getConsent: readCookieConsent,
    setConsent: saveCookieConsent
  });
  function renderCookieBanner() {
    const el = $("#cookie-banner");
    if (!el) return;
    const saved = readCookieConsent();
    const suppress = !!(
      saved ||
      ui.cookieModal ||
      HOST_SITE === "brandbook" ||
      ui.view === "brandbook" ||
      (store.backend && !store.ready)
    );
    if (suppress) {
      el.hidden = true;
      el.innerHTML = "";
      return;
    }
    el.hidden = false;
    el.innerHTML = `<div class="cookie-banner-card">
      <div class="cookie-banner-copy">
        <b>Файлы cookie и защита данных (152-ФЗ)</b>
        <p class="small muted">Используем необходимые cookies для входа и эскроу-расчётов, а также аналитические — для улучшения подбора репетиторов и тренажёра. Подробнее в <a href="/privacy" target="_blank" rel="noopener">Политике 152-ФЗ</a> и <a href="/terms" target="_blank" rel="noopener">Оферте</a>.</p>
      </div>
      <div class="cookie-banner-actions">
        <button type="button" class="btn sm" data-a="cookie-accept-all">Принять всё</button>
        <button type="button" class="btn soft sm" data-a="cookie-settings">Подробнее</button>
      </div>
    </div>`;
  }
  function renderMiniChatDock() {
    const dock = $("#mini-chat-dock");
    if (!dock) return;
    const authGate = store.backend && !store.user && !ui.guest;
    const allowedGuestView = authGate && store.ready && ui.view === "market";
    const showDock = Boolean(
      EGE.views.messenger &&
      typeof EGE.views.messenger.renderFloatingDockHTML === "function" &&
      ui.view !== "brandbook" &&
      ui.view !== "landing" &&
      ui.view !== "fees" &&
      ((!authGate && (store.ready || !store.backend)) || allowedGuestView)
    );
    if (!showDock) {
      dock.hidden = true;
      dock.innerHTML = "";
      return;
    }
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const aid = active && active !== document.body && active.id;
    let selS = null, selE = null;
    try {
      if (aid && typeof active.selectionStart === "number") {
        selS = active.selectionStart;
        selE = active.selectionEnd;
      }
    } catch (e) { /* игнор */ }
    dock.hidden = false;
    dock.innerHTML = EGE.views.messenger.renderFloatingDockHTML();
    if (aid && (aid === "mc-search" || aid === "mc-input") && typeof document.getElementById === "function") {
      const nextEl = document.getElementById(aid);
      if (nextEl && !nextEl.disabled) {
        nextEl.focus({ preventScroll: true });
        try { if (selS != null) nextEl.setSelectionRange(selS, selE); } catch (e) { /* игнор */ }
      }
    }
  }
  function cookieModalHTML() {
    const cm = ui.cookieModal;
    if (!cm) return "";
    const cur = readCookieConsent();
    const analyticsOn = cm.analytics != null ? !!cm.analytics : (cur ? !!cur.analytics : true);
    const marketingOn = cm.marketing != null ? !!cm.marketing : (cur ? !!cur.marketing : false);
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="cookie-modal-title">
      <div class="modal-card sheet-modal" data-sheet-kind="cookie">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="cookie-close" aria-label="Свернуть настройки cookies">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row between" style="gap:10px;width:100%;align-items:center">
            <b id="cookie-modal-title">Настройки cookies и аналитики</b>
            <button type="button" class="icon-btn sm" data-a="cookie-close" aria-label="Закрыть">${icon("x")}</button>
          </div>
        </div>
        <div class="sheet-body">
          <p class="small ink2" style="margin:0;line-height:1.5">Мы обрабатываем данные в соответствии с 152-ФЗ. Выберите категории файлов cookie, которые разрешены в этом браузере.</p>
          <div class="cookie-opt-list">
            <div class="cookie-opt-row">
              <div class="cookie-opt-copy">
                <b>Необходимые cookies</b>
                <span class="small muted">Авторизация <code>pvm_session</code>, защита форм, эскроу-кошелёк и сохранение вашего выбора.</span>
              </div>
              <span class="chip confirm">Всегда включены</span>
            </div>
            <div class="cookie-opt-row">
              <div class="cookie-opt-copy">
                <b>Аналитика и качество сервиса</b>
                <span class="small muted">Помогает улучшать точность тренажёра, стабильность звонков и скорость сайта.</span>
              </div>
              <button type="button" role="switch" aria-checked="${analyticsOn ? "true" : "false"}" aria-label="Аналитика и качество сервиса" class="cookie-toggle-btn cookie-switch${analyticsOn ? " on" : ""}" data-a="cookie-toggle-analytics">
                <span class="cookie-switch-lbl">${analyticsOn ? "Включено" : "Выключено"}</span>
                <span class="cookie-switch-track" aria-hidden="true"><span class="cookie-switch-thumb"></span></span>
              </button>
            </div>
            <div class="cookie-opt-row">
              <div class="cookie-opt-copy">
                <b>Персонализация подбора</b>
                <span class="small muted">Подсказки по предметам и преподавателям под ваш город и цель.</span>
              </div>
              <button type="button" role="switch" aria-checked="${marketingOn ? "true" : "false"}" aria-label="Персонализация подбора" class="cookie-toggle-btn cookie-switch${marketingOn ? " on" : ""}" data-a="cookie-toggle-marketing">
                <span class="cookie-switch-lbl">${marketingOn ? "Включено" : "Выключено"}</span>
                <span class="cookie-switch-track" aria-hidden="true"><span class="cookie-switch-thumb"></span></span>
              </button>
            </div>
          </div>
          <div class="stu-legal-links small muted">
            <a href="/privacy" target="_blank" rel="noopener">Политика конфиденциальности (152-ФЗ)</a>
            <span>·</span>
            <a href="/terms" target="_blank" rel="noopener">Публичная оферта</a>
            <span>·</span>
            <a href="/refunds" target="_blank" rel="noopener">Возврат и эскроу</a>
          </div>
        </div>
        <div class="sheet-foot cookie-modal-foot">
          <button type="button" class="btn ghost sm" data-a="cookie-accept-necessary">Только необходимые</button>
          <button type="button" class="btn sm" data-a="cookie-save-custom">Сохранить выбор</button>
        </div>
      </div>
    </div>`;
  }
  function renderModal() {
    const root = $("#modal-root");
    if (!root) return;
    const prevBack = typeof root.querySelector === "function" ? root.querySelector(".modal-back") : null;
    const prevCard = typeof root.querySelector === "function" ? root.querySelector(".modal-card") : null;
    const prevBody = typeof root.querySelector === "function" ? root.querySelector(".sheet-body") : null;
    const prevKind = (prevCard && prevCard.dataset && prevCard.dataset.sheetKind) || "";
    const savedBackTop = prevBack ? prevBack.scrollTop : 0;
    const savedCardTop = prevCard ? prevCard.scrollTop : 0;
    const savedBodyTop = prevBody ? prevBody.scrollTop : 0;
    const restoreModalScroll = () => {
      const nb = typeof root.querySelector === "function" ? root.querySelector(".modal-back") : null;
      const nc = typeof root.querySelector === "function" ? root.querySelector(".modal-card") : null;
      const nextKind = (nc && nc.dataset && nc.dataset.sheetKind) || "";
      const sameSheet = !prevKind || !nextKind || prevKind === nextKind;
      if (sameSheet && (savedBackTop || savedCardTop || savedBodyTop)) {
        const nbody = typeof root.querySelector === "function" ? root.querySelector(".sheet-body") : null;
        if (nb && savedBackTop) nb.scrollTop = savedBackTop;
        if (nc && savedCardTop) nc.scrollTop = savedCardTop;
        if (nbody && savedBodyTop) nbody.scrollTop = savedBodyTop;
      }
      if (nc && nc.classList && typeof nc.classList.add === "function") {
        const reduced = typeof isReducedMotion === "function" && isReducedMotion();
        if (!reduced) {
          if (!prevKind && nextKind) {
            nc.classList.add("is-sheet-entering");
            if (nb && nb.classList && typeof nb.classList.add === "function") nb.classList.add("is-back-entering");
            if (typeof setTimeout === "function") {
              setTimeout(() => {
                try {
                  if (nc.classList) nc.classList.remove("is-sheet-entering");
                  if (nb && nb.classList) nb.classList.remove("is-back-entering");
                } catch (e) { /* игнор */ }
              }, 360);
            }
          } else if (prevKind && nextKind && prevKind !== nextKind) {
            nc.classList.add("is-sheet-swap");
            if (typeof setTimeout === "function") {
              setTimeout(() => {
                try { if (nc.classList) nc.classList.remove("is-sheet-swap"); } catch (e) { /* игнор */ }
              }, 320);
            }
          }
        }
      }
      if (ui.focusNext && typeof root.querySelector === "function") {
        const focusEl = root.querySelector("#" + ui.focusNext)
          || (typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById(ui.focusNext) : null);
        if (focusEl && (typeof root.contains !== "function" || root.contains(focusEl))) {
          ui.focusNext = null;
          if (!focusEl.disabled && typeof focusEl.focus === "function") {
            focusEl.focus({ preventScroll: true });
          }
        }
      }
    };
    if (ui.notifModal) { root.innerHTML = notifModalHTML(); restoreModalScroll(); return; }
    if (ui.cookieModal) { root.innerHTML = cookieModalHTML(); restoreModalScroll(); return; }
    if (ui.tutorContactModal) { root.innerHTML = tutorContactModalHTML(); restoreModalScroll(); return; }
    if (ui.contactVerifyModal) { root.innerHTML = contactVerifyModalHTML(); restoreModalScroll(); return; }
    if (ui.cardBindModal) { root.innerHTML = cardBindModalHTML(); restoreModalScroll(); return; }
    if (ui.authModal) { root.innerHTML = authModalHTML(); restoreModalScroll(); mountTelegramLoginWidget(); return; }
    if (ui.payoutModal && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.payoutModalHTML === "function") {
      root.innerHTML = EGE.views.tutorCabinet.payoutModalHTML(ui.payoutModal);
      restoreModalScroll();
      return;
    }
    if (ui.balanceModal) { root.innerHTML = balanceModalHTML(); restoreModalScroll(); return; }
    if (ui.filterModal) { root.innerHTML = filterModalHTML(); restoreModalScroll(); return; }
    if (ui.reviewModal && EGE.views.marketplace && typeof EGE.views.marketplace.reviewModalHTML === "function") {
      root.innerHTML = EGE.views.marketplace.reviewModalHTML();
      restoreModalScroll();
      return;
    }
    if (ui.disputeModal && EGE.views.marketplace && typeof EGE.views.marketplace.disputeModalHTML === "function") {
      root.innerHTML = EGE.views.marketplace.disputeModalHTML();
      restoreModalScroll();
      return;
    }
    if (ui.reviewsModal && EGE.views.marketplace && typeof EGE.views.marketplace.reviewsModalHTML === "function") {
      root.innerHTML = EGE.views.marketplace.reviewsModalHTML();
      restoreModalScroll();
      return;
    }
    if (ui.booking) { root.innerHTML = bookingModalHTML(); restoreModalScroll(); return; }
    if (ui.tutorApplyModal) { root.innerHTML = tutorApplyModalHTML(); restoreModalScroll(); return; }
    if (ui.coopModal) { root.innerHTML = coopModalHTML(); restoreModalScroll(); return; }
    if (ui.bbModal) {
      root.innerHTML = `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="bb-modal-title">
        <div class="modal-card sheet-modal" data-sheet-kind="bb">
          <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="bb-modal-close" aria-label="Свернуть окно">
            <span class="sheet-grabber"></span>
          </div>
          <div class="sheet-head is-booking-head">
            <div class="row" style="gap:8px">${icon("cal")}<b id="bb-modal-title">Пример модального окна · Вектор</b></div>
            <button type="button" class="icon-btn sm sheet-close-btn" data-a="bb-modal-close" aria-label="Закрыть окно">${icon("x")}</button>
          </div>
          <div class="sheet-body">
            <p class="small ink2">Единый каркас шторки (<code>.modal-back.is-sheet-back</code> + <code>.sheet-modal</code> + <code>.sheet-grabber</code>): свайп вниз за ручку или клик по подложке.</p>
            <div class="field">
              <label for="bb-modal-inp">Пример поля ввода внутри модалки</label>
              <input class="input" id="bb-modal-inp" type="text" value="Биология · Суббота 14:00">
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn" data-a="bb-modal-close">Подтвердить</button>
            </div>
          </div>
        </div>
      </div>`;
      return;
    }
    if (!ui.bug) { root.innerHTML = ""; return; }
    root.innerHTML = `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="bug-modal-title">
      <div class="modal-card sheet-modal" data-sheet-kind="bug">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="bug-close" aria-label="Свернуть сообщение о баге">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row" style="gap:8px">${icon("bug")}<b id="bug-modal-title">${esc(ui.bug.title)}</b></div>
          <button type="button" class="icon-btn sm sheet-close-btn" data-a="bug-close" aria-label="Закрыть сообщение о баге">${icon("x")}</button>
        </div>
        <div class="sheet-body">
          <div class="small muted">Обращение сразу попадёт команде Вектор · Тема: ${esc(ui.bug.subject)}</div>
          <form class="stack" style="gap:12px" data-f="bug-submit">
            <div class="field">
              <label for="bug-body">Описание ошибки или шаблон отчёта</label>
              <textarea class="input" id="bug-body" rows="7">${esc(ui.bug.body)}</textarea>
            </div>
            <div class="field">
              <label for="bug-contact">Контакт для ответа (Telegram, телефон или email, необязательно)</label>
              <input class="input" id="bug-contact" type="text" placeholder="@username, +7 9... или email" value="${esc(ui.bug.contact || "")}">
            </div>
            ${feedbackAttachHTML("bug", ui.bug.files)}
            ${ui.bug.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(ui.bug.error)}</div>` : ""}
            <div class="bug-modal-actions">
              <button type="submit" class="btn"${ui.bug.busy ? " disabled" : ""}>${icon("bug")}<span>${ui.bug.busy ? "Отправляем..." : "Отправить обращение"}</span></button>
              <button type="button" class="btn soft" data-a="bug-copy">Скопировать шаблон</button>
            </div>
            <div class="fb-mailto-row">Если удобнее по почте: <a id="bug-mailto" href="${esc(bugMailtoHref(ui.bug))}" target="_blank" rel="noopener">${BUG_EMAIL}</a></div>
          </form>
        </div>
      </div>
    </div>`;
  }
  function syncState() {
    if (store.error === "auth") return ["error", "Войди заново"];
    if (store.error === "readonly") return ["readonly", "Только просмотр"];
    if (store.error === "quota") return ["error", "Хранилище заполнено"];
    if (store.error === "offline") return ["error", "Нет связи, повторю позже"];
    if (store.stale && !store.confirmed) return ["stale", store.backend ? "Сервер не отвечает" : "Облако не отвечает"];
    return ["ok", ""];
  }
  function renderSync() {
    const st = syncState();
    document.querySelectorAll(".sync").forEach((el) => {
      el.dataset.s = st[0];
      el.hidden = !st[1];
      const sp = el.querySelector("span");
      if (sp) sp.textContent = st[1];
    });
  }
  function avatarHTML(url, name, lg) {
    if (url) return `<img class="avatar-img${lg ? " lg" : ""}" src="${esc(url)}" alt="">`;
    return `<span class="avatar${lg ? " lg" : ""}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  function needsPrepSetup() {
    if (ui.role === "tutor") return false;
    const prof = profile();
    return Boolean(store.ready && (!prof.exists || prof.prepSetupPending) && store.error !== "readonly" && (!store.backend || store.user || ui.guest));
  }
  function renderChrome() {
    const isTutor = ui.role === "tutor";
    const inLearn = ["tests", "tutor", "subject", "topic", "quiz", "essay", "plan", "stats"].includes(ui.view);
    const inComm = ui.view === "home";
    const inMarket = ui.view === "market" || ui.view === "landing";
    const inCalendar = ui.view === "study";
    const inProfile = ui.view === "profile";
    const commCounts = EGE.views.messenger && typeof EGE.views.messenger.commBadgeCounts === "function"
      ? EGE.views.messenger.commBadgeCounts()
      : {
          chats: EGE.views.messenger && typeof EGE.views.messenger.totalUnreadCount === "function"
            ? Math.max(0, Number(EGE.views.messenger.totalUnreadCount()) || 0)
            : 0,
          bids: (mkt().bookings || []).filter((b) => b && !["cancelled", "declined"].includes(String(b.status || "").toLowerCase())).length
        };
    const commTotal = Math.max(0, Number(commCounts.chats || 0)) + Math.max(0, Number(commCounts.bids || 0));
    const commBadge = commTotal > 0 ? (commTotal > 99 ? "99+" : commTotal) : 0;
    const acceptedBadge = mkt().bookings.filter((b) => b.status === "accepted").length;
    const prepBadge = needsPrepSetup() ? "+1" : 0;
    const tcPending = EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.pendingCount === "function"
      ? EGE.views.tutorCabinet.pendingCount()
      : 0;
    const tcTab = EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.getTab === "function"
      ? EGE.views.tutorCabinet.getTab()
      : "requests";
    const tutorUnreadChats = isTutor && EGE.views.messenger && typeof EGE.views.messenger.totalUnreadCount === "function"
      ? Math.max(0, Number(EGE.views.messenger.totalUnreadCount()) || 0)
      : 0;
    const tutorChatBadge = tutorUnreadChats > 0 ? (tutorUnreadChats > 99 ? "99+" : tutorUnreadChats) : 0;
    const sideNav = isTutor
      ? [
          ["tutor-requests", "Заявки", "list", ui.view === "cabinet" && tcTab === "requests", tcPending, "tc-jump-pending"],
          ["tutor-students", "Ученики", "users", ui.view === "cabinet" && (tcTab === "students" || tcTab === "calendar"), 0, ""],
          ["tutor-comm", "Общение", "chat", ui.view === "cabinet" && tcTab === "comm", tutorChatBadge, ""],
          ["fees", "Выплаты", "wallet", ui.view === "fees", 0, ""],
          ["tutor-profile", "Профиль", "sliders", ui.view === "cabinet" && tcTab === "profile", 0, ""]
        ]
      : [
          ["tests", "Учёба", "book", inLearn, 0, ""],
          ["home", "Общение", "chat", inComm, commBadge, ""],
          ["market", "Поиск", "search", inMarket, 0, ""],
          ["study", "Календарь", "cal", inCalendar, acceptedBadge, ""],
          ["profile", "Профиль", "user", inProfile, prepBadge, ""]
        ];
    $("#side-nav").innerHTML = sideNav.map(([v, l, ic, cur, badge, badgeAct]) => {
      const chipTone = (isTutor || v === "profile" || v === "home") ? "notif" : "accent";
      const btn = `<button type="button" class="nav-btn" data-a="go" data-v="${v}"${cur ? ' aria-current="page"' : ""}>${icon(ic)}<span style="flex:1">${l}</span>${badge && !badgeAct ? `<span class="chip ${chipTone} num">${badge}</span>` : ""}</button>`;
      if (badge && badgeAct) {
        return `<div class="nav-row${cur ? " is-cur" : ""}">${btn}<button type="button" class="chip ${isTutor ? "notif" : "accent"} num side-badge-jump" data-a="${badgeAct}" title="Перейти к ожидающим заявкам (${badge})" aria-label="Открыть ожидающие заявки (${badge})">${badge}</button></div>`;
      }
      return btn;
    }).join("");
    const me = store.me, prof = profile();
    const pickedSide = selectedStudySubjects(prof);
    const subjWrap = $("#side-subjects-wrap");
    if (subjWrap) subjWrap.hidden = isTutor;
    $("#side-subjects").innerHTML = isTutor ? "" : pickedSide.map((s) => {
      const cur = ["subject", "topic", "quiz", "essay"].includes(ui.view) && ui.sid === s.id && s.content;
      const right = s.content ? (store.ready ? subjectStats(s.id).pct + "%" : "") : "скоро";
      const dotColor = s.color || `var(--c-${s.id})`;
      return s.content
        ? `<button type="button" class="subj-btn" data-a="go" data-v="subject" data-sid="${s.id}"${cur ? ' aria-current="page"' : ""}><i class="dot" style="background:${dotColor}"></i><span>${esc(s.name)}</span><span class="small muted num">${right}</span></button>`
        : `<button type="button" class="subj-btn" data-a="learn-find-tutor" data-sid="${s.id}"><i class="dot" style="background:${dotColor}"></i><span>${esc(s.name)}</span><span class="small muted num">${right}</span></button>`;
    }).join("");
    const nm = (store.user ? (prof.name || store.user.displayName || store.user.username) : "") || prof.name || (me && me.name) || (store.mode === "local" ? (store.backend ? "Гость" : "Этот браузер") : "");
    const avUrl = prof.photo || (store.user && store.user.avatarUrl) || (me && me.avatarUrl) || "";
    const dark = effectiveDark();
    const themeLabel = dark ? "Светлая тема" : "Тёмная тема";
    const tcMod = EGE.views.tutorCabinet;
    const hasHostSite = !!(HOST_SITE && ["student", "tutor", "brandbook"].includes(HOST_SITE));
    const sideBalHTML = isTutor
      ? ((tcMod && typeof tcMod.sideBalanceWidgetHTML === "function")
          ? tcMod.sideBalanceWidgetHTML()
          : (EGE.kit && typeof EGE.kit.sideTutorBalanceHTML === "function"
              ? EGE.kit.sideTutorBalanceHTML({ availableRub: 0, escrowRub: 0, action: "tc-payout-open" })
              : ""))
      : balanceTopWidgetHTML(true);
    const roleSwitcherHTML = hasHostSite
      ? `<div class="side-site-links small muted" style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 2px"><a href="/student" class="link-btn small"${!isTutor ? ' aria-current="page" style="font-weight:700;color:var(--ink)"' : ""}>Ученик</a><span>·</span><a href="/tutor" class="link-btn small"${isTutor ? ' aria-current="page" style="font-weight:700;color:var(--ink)"' : ""}>Преподаватель</a></div>`
      : `<div class="hh-seg side-role-seg" role="group" aria-label="Роль на платформе" style="margin-bottom:2px">
        <button type="button" data-a="role-set" data-role="student" aria-pressed="${!isTutor}">Ученик</button>
        <button type="button" data-a="role-set" data-role="tutor" aria-pressed="${isTutor}">Преподаватель</button>
      </div>`;
    const notifCnt = Array.isArray(ui.notifications) ? ui.notifications.length : 0;
    $("#side-foot").innerHTML = `<div id="side-balance-slot" class="side-bal-slot">${sideBalHTML}</div>
      ${roleSwitcherHTML}
      <div class="side-user">
        <div class="me">${avatarHTML(avUrl, nm, false)}<div style="min-width:0"><div class="me-name">${esc(nm)}</div><span class="sync" hidden><i></i><span></span></span></div></div>
        <div class="row" style="gap:6px">
          <button type="button" class="icon-btn sm top-notif-btn${notifCnt > 0 ? " has-unread" : ""}" data-a="notif-open" id="side-notifs" aria-label="Уведомления" title="Уведомления">${icon("bell")}<span class="top-notif-badge num" id="side-notifs-cnt"${notifCnt > 0 ? "" : " hidden"}>${notifCnt > 99 ? "99+" : notifCnt}</span></button>
          <button type="button" class="icon-btn sm" data-a="bug-site" aria-label="Сообщить о баге" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}</button>
          <button type="button" class="icon-btn sm" data-a="go" data-v="profile"${ui.view === "profile" ? ' aria-current="page"' : ""} aria-label="Настройки" title="Настройки">${icon("gear")}</button>
        </div>
      </div>
      <div class="side-tools">
        <button type="button" class="theme-pill" data-a="theme-toggle">${icon(dark ? "sun" : "moon")}<span>${dark ? "Светлая" : "Тёмная"}</span></button>
        ${store.backend && isUserAuthenticated()
          ? `<button type="button" class="side-logout danger" data-a="auth-logout">${icon("logout")}<span>Выйти</span></button>`
          : store.backend && !isUserAuthenticated()
            ? `<button type="button" class="side-logout" data-a="auth-modal-open"><span>Войти</span></button>`
            : ""}
      </div>`;
    const topTheme = $("#top-theme");
    if (topTheme) {
      topTheme.innerHTML = icon(dark ? "sun" : "moon");
      topTheme.setAttribute("aria-label", themeLabel);
      if (typeof topTheme.removeAttribute === "function") topTheme.removeAttribute("title");
    }
    const sideBrand = $("#side-brand");
    const roleLogoTag = isTutor ? "tutor" : ("student:" + pickedSide.length);
    if (sideBrand && sideBrand.dataset && sideBrand.dataset.logoReady !== roleLogoTag) {
      sideBrand.innerHTML = brandLockupHTML({ sub: isTutor ? "Кабинет преподавателя" : ("ЕГЭ 2027 · " + pickedSide.length + " " + plural(pickedSide.length, "предмет", "предмета", "предметов")) });
      sideBrand.dataset.logoReady = roleLogoTag;
    }
    const topLockup = $("#top-brand-lockup");
    if (topLockup && topLockup.dataset && !topLockup.dataset.logoReady && typeof topLockup.querySelector === "function") {
      const topMark = topLockup.querySelector(".brand-mark");
      const topName = topLockup.querySelector(".brand-name");
      if (topMark) topMark.outerHTML = typeof EGE.ui.brandMarkHTML === "function" ? EGE.ui.brandMarkHTML() : BRAND_MARK_HTML;
      if (topName) topName.innerHTML = BRAND_WORDMARK_HTML;
      topLockup.dataset.logoReady = "1";
    }
    const topLogout = $("#top-logout");
    if (topLogout) topLogout.hidden = !(store.backend && store.user);
    syncNotifBell(false);
    const topBalSlot = $("#top-balance-slot");
    if (topBalSlot) {
      if (isTutor && tcMod && typeof tcMod.mobileTopWidgetHTML === "function") {
        topBalSlot.hidden = false;
        topBalSlot.innerHTML = tcMod.mobileTopWidgetHTML();
      } else if (isTutor) {
        topBalSlot.hidden = true;
        topBalSlot.innerHTML = "";
      } else {
        topBalSlot.hidden = false;
        topBalSlot.innerHTML = balanceTopWidgetHTML(true);
      }
    }
    const tutorDock = $("#tutor-balance-dock");
    if (tutorDock) {
      tutorDock.hidden = true;
      tutorDock.innerHTML = "";
    }
    const mobileNav = isTutor
      ? [
          ["tutor-requests", "Заявки", "list", ui.view === "cabinet" && tcTab === "requests", tcPending],
          ["tutor-students", "Ученики", "users", ui.view === "cabinet" && (tcTab === "students" || tcTab === "calendar"), 0],
          ["tutor-comm", "Общение", "chat", ui.view === "cabinet" && tcTab === "comm", tutorChatBadge],
          ["fees", "Выплаты", "wallet", ui.view === "fees", 0],
          ["tutor-profile", "Профиль", "sliders", ui.view === "cabinet" && tcTab === "profile", 0]
        ]
      : sideNav;
    $("#tabbar").innerHTML = mobileNav.map(([v, l, ic, cur, badge]) =>
      `<button type="button" class="tab-btn" data-a="go" data-v="${v}"${cur ? ' aria-current="page"' : ""}>${icon(ic)}<span>${esc(l)}</span>${badge ? `<i class="tab-badge">${badge}</i>` : ""}</button>`
    ).join("");
    renderSync();
  }

  // ---------- общие блоки ----------
  function tile(label, value, note) {
    return `<div class="tile"><span class="tile-label">${label}</span><span class="tile-value">${value}</span>${note ? `<span class="tile-note">${note}</span>` : ""}</div>`;
  }
  function stepBtn(s) {
    const attrs = [`data-a="${s.a}"`];
    if (s.v) attrs.push(`data-v="${s.v}"`);
    if (s.id) attrs.push(`data-id="${esc(s.id)}"`);
    if (s.sid) attrs.push(`data-sid="${s.sid}"`);
    return `<button type="button" class="step-btn" ${attrs.join(" ")}><span class="step-ico ${s.tone || ""}">${icon(s.ico)}</span><span style="min-width:0"><span class="step-title" style="display:block">${esc(s.title)}</span><span class="step-sub" style="display:block">${esc(s.sub)}</span></span><span class="arrow">${icon("arrow")}</span></button>`;
  }
  function dueChip(iso, done) {
    if (!iso) return done ? `<span class="chip good">${icon("check")}готово</span>` : "";
    if (done) return `<span class="chip good">${icon("check")}готово</span>`;
    const n = daysUntil(iso);
    let cls = "", txt;
    if (n < 0) { cls = "bad"; txt = "просрочено на " + days(-n); }
    else if (n === 0) { cls = "bad"; txt = "сегодня"; }
    else { cls = n <= 14 ? "warn" : ""; txt = "через " + days(n); }
    return `<span class="chip ${cls}"><span class="mono">${dateShort(iso)}</span> · ${txt}</span>`;
  }
  function todoResultHTML(it) {
    const r = it.result;
    const chunks = [];
    if (r && r.c !== undefined) {
      let s = `Результат: <b>${r.c} из ${r.q}</b> (${r.pct}%)`;
      if (r.max) s += ` · ${r.pts} из ${r.max} баллов`;
      if (r.topic) s += ` · ${esc(r.topic)}`;
      chunks.push(s);
    } else if (r && r.note) {
      chunks.push(esc(r.note));
    }
    if (it.action && it.action.kind === "prep" && SUBJ[it.action.sid]) {
      const st = subjectStats(it.action.sid);
      if (st.total > 0 && st.seen > 0) chunks.push(`Освоено: ${st.mastered} из ${st.total} вопросов`);
    }
    if (!chunks.length) return "";
    return `<div class="todo-result">${it.done ? icon("check") : ""}<span>${chunks.join(" · ")}</span></div>`;
  }
  function todoItem(it, compact) {
    const cid = "todo-" + it.id;
    const delKey = "todo:" + it.id;
    let actions = "";
    if (!compact && (it.action || it.cta || it.link || it.custom)) {
      const actBtn = it.action
        ? `<button type="button" class="btn ${it.done ? "ghost" : "soft"} sm" data-a="plan-act" data-id="${esc(it.id)}">${esc(it.done ? (it.action.kind === "diag" ? "Пройти ещё раз" : "Продолжить") : it.action.label)}</button>`
        : "";
      const ctaBtn = it.cta
        ? `<a class="btn ${it.done ? "ghost" : "soft"} sm" href="${esc(it.cta.href)}" target="_blank" rel="noopener noreferrer">${esc(it.cta.label)}</a>`
        : "";
      const del = it.custom
        ? (ui.confirmDel === delKey
          ? `<button type="button" class="link-btn" style="color:var(--bad)" data-a="del-todo" data-id="${esc(it.id)}">Удалить</button><button type="button" class="link-btn" data-a="cancel-del">Отмена</button>`
          : `<button type="button" class="link-btn" data-a="ask-del" data-k="${esc(delKey)}">Удалить</button>`)
        : "";
      actions = `<div class="todo-actions">${actBtn}${ctaBtn}${it.link ? `<a href="${esc(it.link.href)}" target="_blank" rel="noopener noreferrer">${esc(it.link.label)}</a>` : ""}${del}</div>`;
    }
    return `<div class="todo${it.done ? " done" : ""}${it.key && !it.done ? " key" : ""}">
      <input type="checkbox" class="check" id="${esc(cid)}" data-c="todo" data-id="${esc(it.id)}" data-custom="${it.custom ? 1 : 0}"${it.done ? " checked" : ""}>
      <div class="todo-main">
        <div class="todo-top"><label class="todo-title" for="${esc(cid)}">${esc(it.title)}</label><span class="row" style="gap:6px">${it.key && !it.done ? '<span class="chip leaf">главный срок</span>' : ""}${dueChip(it.due, it.done)}</span></div>
        ${!compact && it.note ? `<div class="todo-note">${esc(it.note)}</div>` : ""}
        ${!compact ? todoResultHTML(it) : ""}
        ${actions}
      </div>
    </div>`;
  }
  function subjSelect(id, key, value, withOther) {
    const opts = SUBJECT_META.map((s) => [s.id, s.name]);
    if (withOther) opts.push(["other", "Другое"]);
    return `<select class="select" id="${id}" data-d="${key}">${opts.map(([v, l]) => `<option value="${v}"${v === value ? " selected" : ""}>${esc(l)}</option>`).join("")}</select>`;
  }
  function localNotice() {
    if (store.backend) return `<div class="notice"><b>Данные сохраняются только в этом браузере.</b><span>Войди или создай аккаунт, чтобы прогресс хранился на сервере и открывался на любом устройстве.</span></div>`;
    return `<div class="notice"><b>Данные сохраняются только в этом браузере.</b><span>Открой сайт по ссылке на claude.ai под своим аккаунтом: тогда прогресс будет храниться в облаке и откроется на любом компьютере.</span></div>`;
  }
  function staleNotice() {
    if (store.backend && !store.user && store.error === "auth") return `<div class="notice"><b>Сессия истекла.</b><span>Войди в аккаунт снова, чтобы изменения продолжали сохраняться на сервере.</span></div>`;
    if (store.mode !== "cloud") return "";
    if (store.error === "readonly") return `<div class="notice"><b>Режим просмотра.</b><span>У этого аккаунта нет прав на запись, поэтому изменения не сохраняются.</span></div>`;
    if (store.stale && !store.confirmed) return `<div class="notice"><b>${store.backend ? "Сервер" : "Облако"} пока не отвечает.</b><span>Показаны данные, которые удалось загрузить; они могут быть неполными. Изменения сохранятся, когда связь появится.</span></div>`;
    return "";
  }
  function currentAuthReturnUrl(roleOverride) {
    const role = (roleOverride || (ui.role === "tutor" ? "tutor" : "student")) === "tutor" ? "tutor" : "student";
    const h = typeof location !== "undefined" ? String(location.hash || "") : "";
    if (HOST_SITE === "tutor") return "/tutor" + (h && h.indexOf("#tutor-") === 0 ? h : "");
    if (HOST_SITE === "student") return "/student" + (h && h.indexOf("#") === 0 ? h : "");
    if (role === "tutor") return "/tutor";
    if (ui.view === "market") return "/market";
    if (ui.view === "fees") return "/fees";
    return "/";
  }
  function buildGoogleStartUrl(roleOverride, nextOverride) {
    const role = (roleOverride || (ui.role === "tutor" ? "tutor" : "student")) === "tutor" ? "tutor" : "student";
    const next = nextOverride || currentAuthReturnUrl(role);
    return "/api/auth/google/start?role=" + encodeURIComponent(role) + "&next=" + encodeURIComponent(next);
  }
  function hasTelegramLoginWidget() {
    return Boolean(store.backend && store.authProviders && store.authProviders.telegram && store.telegramBotUsername);
  }
  async function handleTelegramWidgetAuth(tgUser) {
    if (!tgUser || !tgUser.id || !tgUser.hash || !tgUser.auth_date) return;
    const role = ui.role === "tutor" ? "tutor" : "student";
    const reg = ui.auth && ui.auth.tab === "register";
    const migEl = reg ? $("#auth-migrate") : null;
    const doMigrate = Boolean(reg && hasLocalProgress() && (!migEl || migEl.checked));
    ui.auth.busy = true;
    ui.auth.error = "";
    if (ui.authModal) renderModal();
    else scheduleRender();
    try {
      const body = Object.assign({}, tgUser, { role });
      const res = (EGE.api && EGE.api.auth && typeof EGE.api.auth.telegramLogin === "function")
        ? await EGE.api.auth.telegramLogin(body)
        : await backendReq("/api/auth/telegram/login", { method: "POST", body: JSON.stringify(body) });
      if (doMigrate) {
        try { await migrateLocalDocsToServer(); } catch (e) { /* загрузим аккаунт в любом случае */ }
      }
      clearQueues();
      ui.guest = false;
      if (res && res.binding) store.telegramBinding = res.binding;
      await loadBackendSession(res.user);
      clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
      ui.auth.busy = false;
      ui.auth.error = "";
      ui.authModal = false;
      toast("Вход через Telegram выполнен ✓");
      if (!resumePendingAfterAuth()) {
        applyPostAuthView(true);
        renderModal();
        scheduleRender(true);
      }
    } catch (e) {
      ui.auth.busy = false;
      ui.auth.error = authErrorText(e);
      if (ui.authModal) renderModal();
      else scheduleRender();
    }
  }
  function mountTelegramLoginWidget() {
    if (!hasTelegramLoginWidget() || typeof document === "undefined") return;
    const slot = typeof document.getElementById === "function"
      ? document.getElementById("auth-tg-widget-slot")
      : (typeof document.querySelector === "function" ? document.querySelector("#auth-tg-widget-slot") : null);
    if (!slot) return;
    if (slot.dataset && slot.dataset.mounted === "1") return;
    const wrap = typeof document.getElementById === "function"
      ? document.getElementById("auth-tg-widget-wrap")
      : (typeof document.querySelector === "function" ? document.querySelector("#auth-tg-widget-wrap") : null);
    const markReady = () => {
      try {
        if (!wrap || !slot) return;
        const hasIframe = (typeof slot.querySelector === "function" && slot.querySelector("iframe"))
          || (slot.children && slot.children.length > 1)
          || (slot.innerHTML && slot.innerHTML.includes("<iframe"));
        if (hasIframe && wrap.classList && typeof wrap.classList.add === "function") {
          wrap.classList.add("is-widget-ready");
        }
      } catch (e) { /* игнор */ }
    };
    if (slot.dataset) slot.dataset.mounted = "1";
    if (typeof MutationObserver === "function" && wrap) {
      try {
        const obs = new MutationObserver(() => markReady());
        obs.observe(slot, { childList: true, subtree: true });
      } catch (e) { /* игнор */ }
    }
    if (typeof document.createElement !== "function" || typeof slot.appendChild !== "function") return;
    const sc = document.createElement("script");
    const setAttr = (k, v) => {
      if (typeof sc.setAttribute === "function") sc.setAttribute(k, v);
      if (sc.dataset && k.indexOf("data-") === 0) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
        sc.dataset[camel] = v;
      }
    };
    sc.async = true;
    sc.src = "https://telegram.org/js/telegram-widget.js?22";
    setAttr("data-telegram-login", String(store.telegramBotUsername).replace(/^@+/, ""));
    setAttr("data-size", "large");
    setAttr("data-radius", "12");
    setAttr("data-request-access", "write");
    setAttr("data-onauth", "onTelegramAuth(user)");
    sc.onload = markReady;
    slot.appendChild(sc);
    markReady();
  }
  try {
    const gTarget = typeof window !== "undefined" ? window : globalThis;
    if (gTarget) gTarget.onTelegramAuth = handleTelegramWidgetAuth;
    if (typeof globalThis !== "undefined") globalThis.onTelegramAuth = handleTelegramWidgetAuth;
  } catch (e) { /* игнор */ }
  EGE.auth = Object.assign(EGE.auth || {}, { onTelegramAuth: handleTelegramWidgetAuth });
  function normalizeOtpCh(raw) {
    const ch = String(raw || "wa").trim().toLowerCase();
    if (ch === "tg" || ch === "telegram") return "tg";
    if (ch === "sms" || ch === "phone") return "sms";
    return "wa";
  }
  function otpChName(ch) {
    if (ch === "tg") return "Telegram";
    if (ch === "sms") return "SMS";
    return "WhatsApp";
  }
  function authCard(opts) {
    opts = opts || {};
    const a = ui.auth, reg = a.tab === "register";
    const ch = normalizeOtpCh(a.channel);
    const chName = otpChName(ch);
    const isTutor = ui.role === "tutor";
    const hasGoogle = !!(store.authProviders && store.authProviders.google);
    const hasTgWidget = hasTelegramLoginWidget();
    const tgWidgetRole = isTutor ? "tutor" : "student";
    const tgSvg = TELEGRAM_SVG || "";
    const waSvg = WHATSAPP_SVG || "";
    const roleLabel = reg
      ? "Роль на платформе"
      : 'Кем войти <span class="muted">(по умолчанию — ученик)</span>';
    const leadCopy = reg
      ? (isTutor
        ? "Создайте аккаунт преподавателя: разместите анкету бесплатно и получайте 94% на руки с площадки (98% со своих учеников). Подтверждение по телефону (WhatsApp / Telegram / SMS), Google или Telegram."
        : "Создайте аккаунт ученика: предлагайте свою ставку преподавателям, бронируйте слоты с защитой эскроу и занимайтесь на тренажёре ЕГЭ. Подтверждение по телефону (WhatsApp / Telegram / SMS), Google или Telegram.")
      : "Войди через Google, Telegram или по номеру телефона — код подтверждения придёт в WhatsApp, Telegram или по SMS.";
    return `<form class="card pad-lg form${opts.standalone ? " auth-card" : ""}${opts.modal ? " is-modal" : ""}" data-f="auth">
      <div class="row between auth-modal-head" style="flex-wrap:nowrap;align-items:flex-start;gap:12px">
        <div style="min-width:0">
          <div class="eyebrow">${reg ? (isTutor ? "Регистрация · Преподаватель" : "Регистрация · Ученик") : "Аккаунт · Вектор"}</div>
          <h2 class="h2">${reg ? (isTutor ? "Регистрация преподавателя" : "Регистрация ученика") : "Вход в аккаунт"}</h2>
        </div>
        ${opts.modal ? `<button type="button" class="icon-btn sm auth-close-btn" data-a="auth-modal-close" aria-label="Закрыть окно">${icon("x")}</button>` : ""}
      </div>
      <div class="hh-seg equal" role="group" aria-label="Режим входа">
        <button type="button" data-a="auth-tab" data-tab="login" aria-pressed="${!reg}"><span>Вход</span></button>
        <button type="button" data-a="auth-tab" data-tab="register" aria-pressed="${reg}"><span>Регистрация</span></button>
      </div>
      <div class="field">
        <span class="label">${roleLabel}</span>
        <div class="hh-seg equal" role="group" aria-label="Роль входа">
          <button type="button" data-a="auth-role" data-role="student" aria-pressed="${!isTutor}">${icon("book")}<span>Как ученик</span></button>
          <button type="button" data-a="auth-role" data-role="tutor" aria-pressed="${isTutor}">${icon("users")}<span>Как преподаватель</span></button>
        </div>
      </div>
      ${opts.modal && ui.authPrompt ? `<div class="notice" style="margin:0">${esc(ui.authPrompt)}</div>` : ""}
      <p class="ink2 small">${leadCopy}</p>
      <div class="auth-social-stack">
        ${hasGoogle
          ? `<a class="btn ghost google-btn" href="${esc(buildGoogleStartUrl())}">${GOOGLE_SVG}<span>Продолжить через Google</span></a>`
          : `<button type="button" class="btn ghost google-btn" data-a="auth-google-start">${GOOGLE_SVG}<span>Продолжить через Google</span></button>`}
        ${hasTgWidget
          ? `<div class="auth-tg-widget-wrap" id="auth-tg-widget-wrap">
              <div class="auth-tg-widget-slot" id="auth-tg-widget-slot" data-tg-bot="${esc(store.telegramBotUsername)}" data-tg-role="${tgWidgetRole}"></div>
              <button type="button" class="btn ghost telegram-btn auth-tg-fallback-btn" data-a="auth-telegram-start">${tgSvg}<span>Продолжить через Telegram</span></button>
            </div>`
          : `<button type="button" class="btn ghost telegram-btn" data-a="auth-telegram-start">${tgSvg}<span>Продолжить через Telegram</span></button>`}
      </div>
      <div class="auth-sep"><span>или по номеру телефона</span></div>
      ${phoneFieldHTML({ scope: "auth-phone", id: "auth-phone", name: "phone", label: "Номер телефона", value: draft("auth.phone", ""), country: draft("auth.phoneCountry", "RU"), compact: false, dataD: "auth.phone" })}
      <div class="field">
        <span class="label">Куда отправить код</span>
        <div class="hh-seg equal auth-channel-seg" role="group" aria-label="Куда отправить код">
          <button type="button" data-a="auth-channel" data-v="wa" aria-pressed="${ch === "wa"}">${waSvg}<span>WhatsApp</span></button>
          <button type="button" data-a="auth-channel" data-v="tg" aria-pressed="${ch === "tg"}">${tgSvg}<span>Telegram</span></button>
          <button type="button" data-a="auth-channel" data-v="sms" aria-pressed="${ch === "sms"}">${icon("msg")}<span>SMS</span></button>
        </div>
      </div>
      <p class="hint" style="text-align:center">${ch === "tg"
        ? "Код (4 цифры) придёт в официальный чат Telegram «Verification Codes» или в бота. Если Telegram не привязан, включится резервное SMS."
        : (ch === "sms"
          ? "Код подтверждения (4 цифры) придёт в обычном SMS на этот номер — работает без мессенджеров."
          : "Код подтверждения (4 цифры) придёт в ваш WhatsApp (или по SMS, если WhatsApp недоступен) — без логина и пароля.")}</p>
      ${reg && store.inviteRequired ? `<div class="field"><label for="auth-invite">Код приглашения</label><input class="input" id="auth-invite" name="invite" type="text" autocomplete="off" maxlength="64" required data-d="auth.invite" value="${esc(draft("auth.invite", ""))}"></div>` : ""}
      ${reg && hasLocalProgress() ? `<label class="auth-migrate-row"><input type="checkbox" class="check" id="auth-migrate" name="migrate" checked><span class="small">Перенести текущий прогресс из этого браузера в новый аккаунт</span></label>` : ""}
      ${a.error ? `<div class="notice">${esc(a.error)}</div>` : ""}
      <div class="auth-actions-row">
        <button class="btn" type="submit"${a.busy ? " disabled" : ""}>${a.busy ? "Отправляем…" : (ch === "sms" ? "Получить код по SMS" : `Получить код в ${chName}`)}</button>
        ${!reg ? `<button type="button" class="btn soft" data-a="auth-guest">${isTutor ? "Кабинет преподавателя (демо)" : "Демо-вход ученика"}</button>` : ""}
      </div>
      <p class="auth-legal-note small muted">Продолжая, вы принимаете <a href="/terms" target="_blank" rel="noopener">Оферту</a>, <a href="/refunds" target="_blank" rel="noopener">Правила возврата</a> и <a href="/privacy" target="_blank" rel="noopener">Политику конфиденциальности (152-ФЗ)</a>.</p>
      <div class="auth-foot-row">
        <span class="small muted">${reg ? "Уже есть аккаунт?" : "Впервые на платформе?"}</span>
        <button type="button" class="link-btn" data-a="auth-tab" data-tab="${reg ? "login" : "register"}">${reg ? "Войти по телефону" : "Зарегистрироваться"}</button>
      </div>
    </form>`;
  }
  // ---------- модульные экраны (src/views/*) ----------
  EGE.views.marketplace.configure({ ui, mkt, saveMkt, notifySide, TDATA, viewPlan, viewTests, viewStats, scheduleRender, store, toast, isDevDemoMode, effectiveDark });
  EGE.views.landing.configure({
    ui, effectiveDark, SUBJ, TOPICS, QS, CONTENT, firstSubject,
    BUG_EMAIL, TDATA, tablesHTML, scheduleRender
  });
  if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.configure === "function") {
    EGE.views.tutorCabinet.configure({
      ui, mkt, saveMkt, TDATA, store, profile, toast, notifySide, scheduleRender, go, copyText: copyTextSafe, isDevDemoMode
    });
  }

  function heroMotionMeta() { return EGE.views.landing.heroMotionMeta(); }
  function patchHeroMotionDOM(opts) { return EGE.views.landing.patchHeroMotionDOM(opts); }
  function syncHeroMotion() { return EGE.views.landing.syncHeroMotion(); }
  function stopMotionTimers() { return EGE.views.landing.stopMotionTimers(); }
  function patchSavingsDOM() { return EGE.views.landing.patchSavingsDOM(); }
  function landingPageHTML(opts) { return EGE.views.landing.landingPageHTML(opts); }
  const MOTION_PRESETS = EGE.views.landing.MOTION_PRESETS;
  function viewMarket(opts) { return EGE.views.marketplace.viewMarket(opts); }
  function viewCabinet() { return EGE.views.tutorCabinet ? EGE.views.tutorCabinet.viewCabinet() : viewTests(); }
  function viewStudy() { return EGE.views.marketplace.viewStudy(); }
  function viewBrandbook(opts) { return EGE.views.brandbook.viewBrandbook(opts, { ui, dark: effectiveDark(), TDATA }); }
  function viewFees(opts) {
    if (opts && opts.inside && ui.role === "tutor" && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.viewPayouts === "function") {
      return EGE.views.tutorCabinet.viewPayouts();
    }
    return EGE.views.brandbook.viewFees(opts, { ui, dark: effectiveDark(), TDATA });
  }
  /** Вкладка «Тесты»: 3 предмета ЕГЭ, тренажёр, варианты КИМ и встроенный Справочник. */

  function isUserAuthenticated() {
    return Boolean(store.user || ui.demoAuthed);
  }
  function requireAuthForBid(draftBooking) {
    if (isUserAuthenticated()) return false;
    ui.pendingBookingAfterAuth = draftBooking || null;
    ui.booking = null;
    ui.auth.error = "";
    ui.authPrompt = "Войдите или зарегистрируйтесь, чтобы предложить свою цену преподавателю.";
    ui.authModal = true;
    renderModal();
    return true;
  }
  function resumePendingAfterAuth() {
    ui.authPrompt = "";
    if (!ui.pendingBookingAfterAuth) return false;
    if (ui.role !== "tutor") {
      ui.view = "market";
      writeHash();
    }
    ui.booking = ui.pendingBookingAfterAuth;
    ui.pendingBookingAfterAuth = null;
    renderModal();
    scheduleRender();
    return true;
  }
  function viewLanding() {
    return landingPageHTML({ inside: isUserAuthenticated() });
  }

  function authScreen() {
    return landingPageHTML({ inside: false });
  }
  function accountCard() {
    if (!store.user) return (ui.demoAuthed || ui.guest) ? "" : authCard();
    const cf = ui.confirm, u = store.user, prof = profile(), title = u.displayName || u.username;
    return `<section class="card pad-lg stack">
      <div class="row between" style="flex-wrap:wrap">
        <div class="me">
          ${avatarHTML(prof.photo || u.avatarUrl, title, true)}
          <div>
            <div class="eyebrow">Аккаунт · ${u.authProvider === "google" ? "Google" : u.authProvider === "telegram" ? "Telegram" : u.authProvider === "phone" ? "Телефон" : "Аккаунт"}</div>
            <h2 class="h2">${esc(title)}</h2>
            <div class="small muted">@${esc(u.username)}${u.email ? " · " + esc(u.email) : ""}</div>
          </div>
        </div>
        <button type="button" class="btn ghost sm" data-a="auth-logout">Выйти</button>
      </div>
      <p class="small ink2">Прогресс синхронизируется с сервером${store.backendAi && store.backendAi.enabled ? " · ИИ-репетитор подключён" : ""}.</p>
      ${hasLocalProgress() ? `<div class="row" style="flex-wrap:wrap"><button type="button" class="btn soft sm" data-a="auth-migrate">Перенести локальный прогресс из браузера</button></div>` : ""}
      ${cf && cf.kind === "migrate" ? `<div class="confirm"><b>Перенести локальные данные в аккаунт «${esc(title)}»?</b><span class="small">Документы из памяти этого браузера перезапишут одноимённые разделы на сервере.</span><div class="row"><button type="button" class="btn sm" data-a="auth-migrate-do">Перенести</button><button type="button" class="btn ghost sm" data-a="confirm-cancel">Отмена</button></div></div>` : ""}
    </section>`;
  }
  // ---------- модульные делегаты (views/trainer, essay-guide, progress, market-bb-actions) ----------
  function viewHome() { return EGE.views.trainer.viewHome(); }
  function viewTests(opts) { return EGE.views.trainer.viewTests(opts); }
  function viewSubject(sid) { return EGE.views.trainer.viewSubject(sid); }
  function viewTopic(id) { return EGE.views.trainer.viewTopic(id); }
  function viewQuiz() { return EGE.views.trainer.viewQuiz(); }
  function tablesHTML(q) { return EGE.views.trainer.tablesHTML(q); }
  function curItem() { return EGE.views.trainer.curItem(); }
  function canCheck(it) { return EGE.views.trainer.canCheck(it); }
  function grade(it) { return EGE.views.trainer.grade(it); }
  function correctText(q) { return EGE.views.trainer.correctText(q); }
  function doCheck() { return EGE.views.trainer.doCheck(); }
  function doNext() { return EGE.views.trainer.doNext(); }
  function saveVariantMock(qz, silent) { return EGE.views.trainer.saveVariantMock(qz, silent); }
  function abortAI() { return EGE.views.trainer.abortAI(); }
  function sendChat(text) { return EGE.views.trainer.sendChat(text); }
  function weight(st, today) { return EGE.views.trainer.weight(st, today); }

  function viewPlan() { return EGE.views.progress.viewPlan(); }
  function viewStats(opts) { return EGE.views.progress.viewStats(opts); }
  function viewProfile() { return EGE.views.progress.viewProfile(); }
  function toggleTodo(id, custom, checked) { return EGE.views.progress.toggleTodo(id, custom, checked); }
  function drawCharts() { return EGE.views.progress.drawCharts(); }
  function readImport(file) { return EGE.views.progress.readImport(file); }
  function copyText(text, sel) { return EGE.views.progress.copyText(text, sel); }

  function viewGuide() { return EGE.views.essayGuide.viewGuide(); }
  function viewTutor() { return EGE.views.essayGuide.viewTutor(); }
  function viewEssay() { return EGE.views.essayGuide.viewEssay(); }
  function essayState() { return EGE.views.essayGuide.essayState(); }
  function essayDraftLater() { return EGE.views.essayGuide.essayDraftLater(); }
  function essays() { return EGE.views.essayGuide.essays(); }
  function paintEssayCount() { return EGE.views.essayGuide.paintEssayCount(); }

  function bbState() { return EGE.marketBb.bbState(); }
  function copyTextSafe(txt) { return EGE.marketBb.copyTextSafe(txt); }
  function patchMaskTrainerDOM() { return EGE.marketBb.patchMaskTrainerDOM(); }
  function applyBrandbookViewport(rawW) { return EGE.marketBb.applyBrandbookViewport(rawW); }
  // ---------- тосты, уведомления и подсказки ----------
  let toastTimer = null;
  let notifAnimPhase = 0;
  let notifAnimTimer = null;
  let notifSeq = 0;
  function formatNotifTime(ts) {
    const d = new Date(Number(ts) || Date.now());
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function syncNotifBell(animate, popOnly) {
    const count = Array.isArray(ui.notifications) ? ui.notifications.length : 0;
    const text = count > 99 ? "99+" : String(count);
    const label = count ? `Уведомления (${count})` : "Уведомления";
    const shouldAnim = !!(animate || popOnly);
    if (shouldAnim) {
      notifAnimPhase = notifAnimPhase ? 0 : 1;
      clearTimeout(notifAnimTimer);
    }
    const ringCls = notifAnimPhase ? "is-ring-a" : "is-ring-b";
    const popCls = notifAnimPhase ? "is-pop-a" : "is-pop-b";
    [["top-notifs", "top-notifs-cnt"], ["side-notifs", "side-notifs-cnt"]].forEach(([btnId, cntId]) => {
      const btn = $("#" + btnId);
      const cnt = $("#" + cntId);
      if (cnt) {
        cnt.textContent = text;
        cnt.hidden = count === 0;
        if (cnt.classList && shouldAnim) {
          cnt.classList.remove("is-pop-a", "is-pop-b");
          cnt.classList.add(popCls);
        }
      }
      if (btn) {
        if (btn.classList) {
          btn.classList.toggle("has-unread", count > 0);
          if (animate && !popOnly) {
            btn.classList.remove("is-ring-a", "is-ring-b");
            btn.classList.add(ringCls);
          }
        }
        if (typeof btn.setAttribute === "function") btn.setAttribute("aria-label", label);
      }
    });
    if (shouldAnim) {
      notifAnimTimer = setTimeout(() => {
        ["top-notifs", "side-notifs"].forEach((id) => {
          const btn = $("#" + id);
          if (btn && btn.classList) btn.classList.remove("is-ring-a", "is-ring-b");
        });
        ["top-notifs-cnt", "side-notifs-cnt"].forEach((id) => {
          const cnt = $("#" + id);
          if (cnt && cnt.classList) cnt.classList.remove("is-pop-a", "is-pop-b");
        });
      }, 750);
    }
  }
  function pushNotification(title, msg, meta) {
    const t = String(title || "Уведомление").trim();
    const m = String(msg || "").trim();
    if (!t && !m) return;
    meta = (meta && typeof meta === "object") ? meta : {};
    const cleanTid = String(meta.threadId || "").trim();
    const cleanBid = String(meta.bookingId || "").trim();
    const kind = String(meta.kind || "").trim();
    const rawActionUrl = typeof meta.actionUrl === "string" ? meta.actionUrl.trim() : "";
    const actionUrl = /^https?:\/\//i.test(rawActionUrl) ? rawActionUrl : "";
    const actionLabel = String(meta.actionLabel || (actionUrl ? "Войти на встречу" : "")).trim();
    if (!Array.isArray(ui.notifications)) ui.notifications = [];
    const now = Date.now();
    const first = ui.notifications[0];
    if (first && first.title === t && first.message === m && String(first.threadId || "") === cleanTid && String(first.actionUrl || "") === actionUrl && (now - first.createdAt) < 400) {
      return;
    }
    if (kind === "telemost" && (cleanBid || cleanTid)) {
      ui.notifications = ui.notifications.filter((n) => !(n && n.kind === "telemost" && (
        (cleanBid && String(n.bookingId || "") === cleanBid) ||
        (!cleanBid && cleanTid && String(n.threadId || "") === cleanTid)
      )));
    } else if (kind !== "telemost" && cleanTid) {
      ui.notifications = ui.notifications.filter((n) => !n || n.kind === "telemost" || String(n.threadId || "") !== cleanTid);
    }
    ui.notifications.unshift({
      id: "n-" + (++notifSeq),
      title: t,
      message: m,
      threadId: cleanTid,
      bookingId: cleanBid,
      kind,
      actionUrl,
      actionLabel,
      createdAt: now,
      timeLabel: formatNotifTime(now)
    });
    if (ui.notifications.length > 50) ui.notifications.length = 50;
    syncNotifBell(!meta.silent, false);
    if (ui.notifModal) renderModal();
  }
  function clearNotificationsForThread(threadId) {
    const cleanTid = String(threadId || "").trim();
    if (!cleanTid || !Array.isArray(ui.notifications) || !ui.notifications.length) return;
    const next = ui.notifications.filter((n) => !n || String(n.threadId || "") !== cleanTid);
    if (next.length === ui.notifications.length) return;
    ui.notifications = next;
    syncNotifBell(false, ui.notifications.length > 0);
    if (ui.notifModal) renderModal();
  }
  let notifClearing = false;
  let notifSwipe = null;
  let notifSuppressClickUntil = 0;
  function finishRemoveNotif(nid) {
    const list = Array.isArray(ui.notifications) ? ui.notifications : [];
    if (!list.some((n) => n.id === nid)) return;
    ui.notifications = list.filter((n) => n.id !== nid);
    syncNotifBell(false, ui.notifications.length > 0);
    if (ui.notifModal) renderModal();
  }
  function dismissNotifById(nid, dir, itemEl) {
    const targetId = String(nid || "");
    if (!targetId || notifClearing) return;
    const cardEl = itemEl || (typeof document !== "undefined" && typeof document.querySelector === "function"
      ? document.querySelector(`.notif-inbox-item[data-notif-id="${targetId}"]`)
      : null);
    if (!cardEl || !cardEl.classList) {
      finishRemoveNotif(targetId);
      return;
    }
    if (cardEl.classList.contains("is-dismiss-left") || cardEl.classList.contains("is-dismiss-right")) return;
    const sideClass = dir === "right" ? "is-dismiss-right" : "is-dismiss-left";
    cardEl.classList.remove("is-swiping");
    cardEl.classList.add(sideClass);
    if (cardEl.style) {
      cardEl.style.transform = "";
      cardEl.style.opacity = "";
    }
    setTimeout(() => finishRemoveNotif(targetId), 230);
  }
  function clearAllNotifsAnimated() {
    const list = Array.isArray(ui.notifications) ? ui.notifications : [];
    if (!list.length) {
      ui.notifications = [];
      notifClearing = false;
      syncNotifBell(false, false);
      if (ui.notifModal) renderModal();
      return;
    }
    if (notifClearing) return;
    const items = (typeof document !== "undefined" && typeof document.querySelectorAll === "function")
      ? Array.from(document.querySelectorAll('[data-sheet-kind="notif"] .notif-inbox-item') || [])
      : [];
    if (!items.length) {
      ui.notifications = [];
      notifClearing = false;
      syncNotifBell(false, false);
      if (ui.notifModal) renderModal();
      return;
    }
    notifClearing = true;
    const clearingIds = new Set(list.map((n) => n.id));
    let maxDelay = 0;
    items.forEach((el, idx) => {
      const delay = Math.min(idx * 45, 270);
      if (delay > maxDelay) maxDelay = delay;
      if (el.style) {
        el.style.transitionDelay = `${delay}ms`;
        el.style.transform = "";
        el.style.opacity = "";
      }
      if (el.classList) {
        el.classList.remove("is-swiping", "is-dismiss-right");
        el.classList.add("is-dismiss-left");
      }
    });
    setTimeout(() => {
      ui.notifications = (Array.isArray(ui.notifications) ? ui.notifications : []).filter((n) => !clearingIds.has(n.id));
      notifClearing = false;
      syncNotifBell(false, ui.notifications.length > 0);
      if (ui.notifModal) renderModal();
    }, 240 + maxDelay);
  }
  function dismissSideToast(targetEl) {
    const el = targetEl || $("#toast");
    if (!el) return;
    clearTimeout(toastTimer);
    if (el.style) { el.style.transform = ""; el.style.opacity = ""; }
    if (el.classList && el.classList.contains("is-side")) {
      el.classList.remove("is-dragging");
      el.classList.add("is-dismissing");
      toastTimer = setTimeout(() => {
        el.hidden = true;
        el.className = "toast";
      }, 210);
    } else {
      el.hidden = true;
      el.className = "toast";
    }
  }
  function triggerButtonTap(target) {
    if (!target) return;
    const btn = (typeof target.closest === "function")
      ? target.closest("button, a.btn, a.btn-msg, .chip-btn, .icon-btn, .theme-pill, .hh-step-btn, .tutor-rating-btn, .cookie-toggle-btn, .day-cir")
      : (target.classList ? target : null);
    if (!btn || btn.disabled || !btn.classList) return;
    try {
      btn.classList.remove("is-tap-pulse");
      if (typeof btn.offsetWidth === "number") void btn.offsetWidth;
      btn.classList.add("is-tap-pulse");
      if (typeof setTimeout === "function") {
        clearTimeout(btn._tapTimer);
        btn._tapTimer = setTimeout(() => {
          try { if (btn.classList) btn.classList.remove("is-tap-pulse"); } catch (e) { /* игнор */ }
        }, 320);
      }
    } catch (e) { /* игнор */ }
  }
  function flashButtonFeedback(btn, label) {
    if (!btn || !btn.classList) return;
    try {
      btn.classList.add("is-btn-ok");
      if (label && btn.tagName === "BUTTON") {
        if (btn._okOrig == null) btn._okOrig = btn.textContent || "";
        btn.textContent = label;
      }
      if (typeof setTimeout === "function") {
        clearTimeout(btn._okTimer);
        btn._okTimer = setTimeout(() => {
          try {
            if (btn.classList) btn.classList.remove("is-btn-ok");
            if (btn._okOrig != null && btn.tagName === "BUTTON") {
              btn.textContent = btn._okOrig;
              btn._okOrig = null;
            }
          } catch (e) { /* игнор */ }
        }, 1300);
      }
    } catch (e) { /* игнор */ }
  }
  function isReducedMotion() {
    try {
      if (typeof document !== "undefined" && document.documentElement && document.documentElement.classList && document.documentElement.classList.contains("reduced-motion")) return true;
      if (typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    } catch (e) { /* игнор */ }
    return false;
  }
  function spawnBidLaunchFx(btn, customText) {
    try {
      if (btn && btn.classList && typeof btn.classList.add === "function") {
        btn.classList.remove("is-bid-launch");
        if (typeof btn.offsetWidth === "number") void btn.offsetWidth;
        btn.classList.add("is-bid-launch");
        if (typeof setTimeout === "function") {
          clearTimeout(btn._bidLaunchTimer);
          btn._bidLaunchTimer = setTimeout(() => {
            try { if (btn.classList) btn.classList.remove("is-bid-launch"); } catch (e) { /* игнор */ }
          }, 560);
        }
      }
      if (isReducedMotion()) return;
      if (typeof document === "undefined" || !document.body || typeof document.createElement !== "function" || typeof document.body.appendChild !== "function") return;
      let cx = typeof window !== "undefined" && Number.isFinite(window.innerWidth) ? window.innerWidth / 2 : 720;
      let cy = typeof window !== "undefined" && Number.isFinite(window.innerHeight) ? window.innerHeight * 0.72 : 540;
      if (btn && typeof btn.getBoundingClientRect === "function") {
        const r = btn.getBoundingClientRect();
        if (r && (r.width > 0 || r.height > 0)) {
          cx = r.left + r.width / 2;
          cy = r.top + r.height / 2;
        }
      }
      const rawTxt = String(customText || (btn && btn.textContent) || "").replace(/\s+/g, " ").trim();
      const priceM = rawTxt.match(/\d[\d\s\u00a0]*₽/);
      const pillText = priceM ? `${priceM[0].trim()} →` : "Отправляем →";
      const burst = document.createElement("div");
      burst.className = "bid-launch-burst";
      burst.setAttribute("aria-hidden", "true");
      burst.style.left = `${Math.round(cx)}px`;
      burst.style.top = `${Math.round(cy)}px`;
      burst.innerHTML = `<span class="bid-launch-ring"></span>`
        + `<span class="bid-spark" style="--a:0deg"></span>`
        + `<span class="bid-spark" style="--a:60deg"></span>`
        + `<span class="bid-spark" style="--a:120deg"></span>`
        + `<span class="bid-spark" style="--a:180deg"></span>`
        + `<span class="bid-spark" style="--a:240deg"></span>`
        + `<span class="bid-spark" style="--a:300deg"></span>`
        + `<span class="bid-launch-pill">${esc(pillText)}</span>`;
      document.body.appendChild(burst);
      if (typeof setTimeout === "function") {
        setTimeout(() => {
          try { if (burst.parentNode) burst.parentNode.removeChild(burst); } catch (e) { /* игнор */ }
        }, 700);
      }
    } catch (e) { /* игнор */ }
  }
  function playBidSentFx(opts) {
    try {
      if (typeof document === "undefined" || !document.body || typeof document.createElement !== "function" || typeof document.body.appendChild !== "function") return;
      const oldEl = typeof document.getElementById === "function" ? document.getElementById("bid-sent-fx") : null;
      if (oldEl && oldEl.parentNode) oldEl.parentNode.removeChild(oldEl);
      const reduced = isReducedMotion();
      const title = String((opts && opts.title) || "Предложение отправлено");
      const subtitle = String((opts && opts.subtitle) || "");
      const wrap = document.createElement("div");
      wrap.id = "bid-sent-fx";
      wrap.className = "bid-sent-fx" + (reduced ? " is-reduced" : "");
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      wrap.innerHTML = `<div class="bid-sent-card">`
        + `<div class="bid-sent-ico" aria-hidden="true">`
        + `<span class="bid-sent-ring"></span>`
        + `<span class="bid-spark" style="--a:0deg"></span>`
        + `<span class="bid-spark" style="--a:60deg"></span>`
        + `<span class="bid-spark" style="--a:120deg"></span>`
        + `<span class="bid-spark" style="--a:180deg"></span>`
        + `<span class="bid-spark" style="--a:240deg"></span>`
        + `<span class="bid-spark" style="--a:300deg"></span>`
        + `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path class="bid-check-path" d="M5 13l4.5 4.5L19 7.5"/></svg>`
        + `</div>`
        + `<div class="bid-sent-copy"><b>${esc(title)}</b>${subtitle ? `<span>${esc(subtitle)}</span>` : ""}</div>`
        + `</div>`;
      document.body.appendChild(wrap);
      if (typeof setTimeout === "function") {
        setTimeout(() => {
          try { if (wrap.classList) wrap.classList.add("is-leaving"); } catch (e) { /* игнор */ }
        }, reduced ? 720 : 1080);
        setTimeout(() => {
          try { if (wrap.parentNode) wrap.parentNode.removeChild(wrap); } catch (e) { /* игнор */ }
        }, reduced ? 900 : 1400);
      }
    } catch (e) { /* игнор */ }
  }
  EGE.fx = Object.assign(EGE.fx || {}, { spawnBidLaunchFx, playBidSentFx });
  function toast(msg, opts) {
    const el = $("#toast");
    if (!el) return;
    opts = opts || {};
    const rawActUrl = typeof opts.actionUrl === "string" ? opts.actionUrl.trim() : "";
    const actUrl = /^https?:\/\//i.test(rawActUrl) ? rawActUrl : "";
    const actLabel = String(opts.actionLabel || (actUrl ? "Войти на встречу" : "")).trim();
    if (el.style) { el.style.transform = ""; el.style.opacity = ""; }
    if (opts.side) {
      el.className = "toast is-side";
      const actLinkHTML = actUrl
        ? `<a class="toast-action-link" href="${esc(actUrl)}" target="_blank" rel="noopener noreferrer">${esc(actLabel)} ↗</a>`
        : "";
      el.innerHTML = (EGE.kit && typeof EGE.kit.sideToastInnerHTML === "function")
        ? EGE.kit.sideToastInnerHTML({ title: opts.title || "Уведомление", message: msg, closeAction: "toast-close", actionUrl: actUrl, actionLabel: actLabel })
        : `<span class="toast-side-row"><span class="bb-pulse-dot" style="margin-top:5px;flex:0 0 auto"></span><span class="toast-side-copy"><b>${esc(opts.title || "Уведомление")}</b><span>${esc(msg)}</span>${actLinkHTML}</span><button type="button" class="toast-close" data-a="toast-close" aria-label="Убрать уведомление">×</button></span>`;
    } else {
      el.className = "toast";
      el.textContent = msg;
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
      el.className = "toast";
    }, opts.duration || (actUrl ? 5600 : 2600));
    if (opts.inbox === true) {
      pushNotification(opts.title || "Уведомление", msg, {
        threadId: opts.threadId,
        bookingId: opts.bookingId,
        kind: opts.kind,
        actionUrl: actUrl,
        actionLabel: actLabel
      });
    }
  }
  function notifySide(title, msg, opts) {
    const hasAct = !!(opts && typeof opts.actionUrl === "string" && /^https?:\/\//i.test(opts.actionUrl.trim()));
    const o = Object.assign({ side: true, title: title || "Предложение передано", duration: hasAct ? 6000 : 3600 }, opts || {});
    o.inbox = !!(opts && opts.inbox === true);
    toast(msg, o);
  }
  const tipEl = $("#tip");
  function moveTip(e) {
    const r = tipEl.getBoundingClientRect();
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + r.width > window.innerWidth - 8) x = e.clientX - r.width - 14;
    if (y + r.height > window.innerHeight - 8) y = e.clientY - r.height - 14;
    tipEl.style.left = Math.max(8, x) + "px"; tipEl.style.top = Math.max(8, y) + "px";
  }
  document.addEventListener("pointerover", (e) => {
    const el = e.target.closest && e.target.closest("[data-tip]");
    if (!el) return;
    tipEl.textContent = el.getAttribute("data-tip"); tipEl.hidden = false; moveTip(e);
  });
  document.addEventListener("pointermove", (e) => { if (!tipEl.hidden) moveTip(e); });
  document.addEventListener("pointerout", (e) => { if (e.target.closest && e.target.closest("[data-tip]")) tipEl.hidden = true; });
  window.addEventListener("scroll", () => { tipEl.hidden = true; }, { passive: true });

  const EGEPayments = (EGE.payments = EGE.payments || {
    provider: "demo",
    gatewayHandler: null,
    setGatewayHandler(fn) { this.gatewayHandler = typeof fn === "function" ? fn : null; },
    createTopupIntent(params) {
      const amount = Math.round(Number(params && params.amount) || 0);
      const method = (params && params.method) === "card" ? "card" : "sbp";
      const fee = Math.round(Number(params && params.fee) || 0);
      const totalCharged = Math.round(Number(params && params.totalCharged) || (amount + fee));
      const intent = {
        id: "pay-" + Date.now(),
        provider: this.provider,
        method,
        amount,
        fee,
        totalCharged,
        planId: (params && params.planId) || "",
        currency: "RUB",
        status: "succeeded",
        createdAt: new Date().toISOString()
      };
      if (typeof this.gatewayHandler === "function") return this.gatewayHandler(intent);
      return intent;
    },
    createPayoutIntent(params) {
      const amount = Math.round(Number(params && params.amount) || 0);
      const intent = {
        id: "out-" + Date.now(),
        type: "payout",
        provider: this.provider,
        method: (params && params.method) === "card" ? "card" : "sbp",
        bank: (params && params.bank) || "",
        sbpBankId: (params && params.sbpBankId) || "",
        tutorInn: (params && params.tutorInn) || "",
        destination: (params && params.destination) || (params && (params.phone || params.card)) || "",
        npdReceipt: !!(params && params.npdReceipt),
        amount,
        fee: 0,
        currency: "RUB",
        status: "succeeded",
        createdAt: new Date().toISOString()
      };
      if (typeof this.gatewayHandler === "function") return this.gatewayHandler(intent);
      return intent;
    }
  });

  const ACTIONS = {
    "theme-toggle": () => setTheme(effectiveDark() ? "light" : "dark"),
    "theme-set": (el) => setTheme(el.dataset.theme),
    "bug-site": () => { ui.bug = buildBugReport({}); ui.focusNext = "bug-body"; renderModal(); },
    "bug-q": (el) => { ui.bug = buildBugReport({ qid: el.dataset.qid, qnum: el.dataset.qnum }); ui.focusNext = "bug-body"; renderModal(); },
    "bug-copy": () => { if (ui.bug) copyText(ui.bug.body, "#bug-body"); },
    "bug-close": () => { ui.bug = null; renderModal(); },
    "bug-file-remove": (el) => {
      if (ui.bug && Array.isArray(ui.bug.files)) {
        const idx = Number(el && el.dataset ? el.dataset.i : -1);
        if (idx >= 0 && idx < ui.bug.files.length) {
          ui.bug.files.splice(idx, 1);
          ui.bug.error = "";
          renderModal();
        }
      }
    },
    "coop-file-remove": (el) => {
      if (ui.coop && Array.isArray(ui.coop.files)) {
        const idx = Number(el && el.dataset ? el.dataset.i : -1);
        if (idx >= 0 && idx < ui.coop.files.length) {
          ui.coop.files.splice(idx, 1);
          ui.coop.error = "";
          renderModal();
        }
      }
    },
    go: (el) => go(el.dataset.v, { sid: el.dataset.sid, id: el.dataset.id, fromNav: !!(el.closest && el.closest("#side-nav, #tabbar")) }),
    "ob-subj-toggle": (el) => {
      const sid = String((el && el.dataset && el.dataset.sid) || "").trim();
      if (!sid || !STUDY_SUBJ_MAP[sid]) return;
      const base = (Array.isArray(ui.drafts["ob.subjects"]) && ui.drafts["ob.subjects"].length ? ui.drafts["ob.subjects"] : profile().subjects).slice();
      const idx = base.indexOf(sid);
      if (idx !== -1) {
        if (base.length <= 1) { toast("Нужен хотя бы один предмет"); return; }
        base.splice(idx, 1);
      } else {
        base.push(sid);
      }
      ui.drafts["ob.subjects"] = base;
      scheduleRender(false);
    },
    "pf-subj-toggle": (el) => {
      const sid = String((el && el.dataset && el.dataset.sid) || "").trim();
      if (!sid || !STUDY_SUBJ_MAP[sid]) return;
      const base = (Array.isArray(ui.drafts["pf.subjects"]) && ui.drafts["pf.subjects"].length ? ui.drafts["pf.subjects"] : profile().subjects).slice();
      const idx = base.indexOf(sid);
      if (idx !== -1) {
        if (base.length <= 1) { toast("Нужен хотя бы один предмет"); return; }
        base.splice(idx, 1);
      } else {
        base.push(sid);
      }
      ui.drafts["pf.subjects"] = base;
      scheduleRender(false);
    },
    "pf-account-edit": () => {
      ui.pfAccountEditOpen = !ui.pfAccountEditOpen;
      scheduleRender(false);
    },
    "pf-account-edit-cancel": () => {
      ui.pfAccountEditOpen = false;
      ui.pfGradeMenuOpen = false;
      ui.pfCityMenuOpen = false;
      scheduleRender(false);
    },
    "learn-find-tutor": (el) => {
      const sid = String((el && el.dataset && el.dataset.sid) || "all").trim() || "all";
      mkt().subject = sid;
      saveMkt();
      go("market");
    },
    "brand-go-tutors": () => {
      if (HOST_SITE === "tutor" || ui.role === "tutor") {
        go("cabinet");
        return;
      }
      go("market");
    },
    "toast-close": () => { dismissSideToast(); },
    "notif-open": () => { ui.notifModal = true; renderModal(); },
    "notif-close": () => { ui.notifModal = false; renderModal(); },
    "notif-remove": (el) => {
      const nid = String((el && el.dataset && el.dataset.id) || "");
      const itemEl = el && typeof el.closest === "function" ? el.closest(".notif-inbox-item") : null;
      dismissNotifById(nid, "left", itemEl);
    },
    "notif-open-thread": (el) => {
      const d = (el && el.dataset) || {};
      const nid = String(d.id || "");
      const tid = String(d.threadId || "").trim();
      const bid = String(d.bookingId || "").trim();
      if (nid) finishRemoveNotif(nid);
      ui.notifModal = false;
      renderModal();
      if (EGE.views.messenger && typeof EGE.views.messenger.openThread === "function") {
        if (tid) EGE.views.messenger.openThread(tid, { openDock: false, inPageOnly: true });
        else if (bid && typeof EGE.views.messenger.openBookingChat === "function") EGE.views.messenger.openBookingChat(bid, "", { openDock: false, inPageOnly: true });
      }
      if (ui.role === "tutor") {
        go("tutor-comm");
      } else {
        ui.commTab = "chats";
        go("home");
      }
    },
    "notif-clear": () => {
      clearAllNotifsAnimated();
    },
    "cookie-accept-all": () => {
      saveCookieConsent({ analytics: true, marketing: true, mode: "all" });
      ui.cookieModal = null;
      renderModal();
      renderCookieBanner();
      scheduleRender();
    },
    "cookie-accept-necessary": () => {
      saveCookieConsent({ analytics: false, marketing: false, mode: "necessary" });
      ui.cookieModal = null;
      renderModal();
      renderCookieBanner();
      scheduleRender();
    },
    "cookie-settings": () => {
      const cur = readCookieConsent();
      ui.cookieModal = {
        analytics: cur ? !!cur.analytics : true,
        marketing: cur ? !!cur.marketing : false
      };
      renderCookieBanner();
      renderModal();
    },
    "cookie-close": () => {
      ui.cookieModal = null;
      renderModal();
      renderCookieBanner();
    },
    "cookie-toggle-analytics": () => {
      if (!ui.cookieModal) return;
      ui.cookieModal.analytics = !ui.cookieModal.analytics;
      renderModal();
    },
    "cookie-toggle-marketing": () => {
      if (!ui.cookieModal) return;
      ui.cookieModal.marketing = !ui.cookieModal.marketing;
      renderModal();
    },
    "cookie-save-custom": () => {
      if (!ui.cookieModal) return;
      saveCookieConsent({
        analytics: !!ui.cookieModal.analytics,
        marketing: !!ui.cookieModal.marketing,
        mode: "custom"
      });
      ui.cookieModal = null;
      renderModal();
      renderCookieBanner();
      scheduleRender();
    },
    "auth-tab": (el) => {
      ui.auth.tab = el.dataset.tab === "register" ? "register" : "login";
      ui.auth.error = "";
      if (ui.authModal) renderModal();
      else scheduleRender();
    },
    "auth-modal-open": () => {
      ui.auth.tab = "login";
      ui.auth.error = "";
      ui.authPrompt = "";
      ui.authModal = true;
      renderModal();
    },
    "auth-register-open": (el) => {
      const role = el && el.dataset && el.dataset.role === "tutor" ? "tutor" : "student";
      if (isUserAuthenticated()) {
        if (HOST_SITE && HOST_SITE !== "brandbook" && HOST_SITE !== role && typeof location !== "undefined") {
          location.href = role === "tutor" ? "/tutor" : "/student";
          return;
        }
        setRolePref(role);
        if (role === "tutor" && EGE.views.tutorCabinet) {
          if (typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab("requests");
          if (store.backend && store.user && typeof EGE.views.tutorCabinet.hydrateFromBackend === "function") {
            EGE.views.tutorCabinet.hydrateFromBackend();
          }
        }
        ui.view = role === "tutor" ? "cabinet" : "home";
        writeHash();
        scheduleRender(true);
        return;
      }
      if (HOST_SITE && HOST_SITE !== "brandbook" && HOST_SITE !== role && typeof location !== "undefined") {
        location.href = (role === "tutor" ? "/tutor" : "/student") + "?auth=register";
        return;
      }
      if (!HOST_SITE || HOST_SITE === "brandbook") setRolePref(role);
      else ui.role = HOST_SITE;
      ui.auth.tab = "register";
      ui.auth.error = "";
      ui.authPrompt = "";
      ui.authModal = true;
      renderModal();
    },
    "auth-modal-close": () => {
      ui.authModal = false;
      ui.auth.error = "";
      ui.authPrompt = "";
      ui.pendingBookingAfterAuth = null;
      renderModal();
    },
    "auth-role": (el) => {
      const nextRole = el && el.dataset && el.dataset.role === "tutor" ? "tutor" : "student";
      if (HOST_SITE === "student" || HOST_SITE === "tutor") {
        if (HOST_SITE !== nextRole && typeof location !== "undefined") {
          const authTab = (ui.auth && ui.auth.tab === "register") ? "register" : "login";
          location.href = (nextRole === "tutor" ? "/tutor" : "/student") + "?auth=" + authTab;
        }
        return;
      }
      setRolePref(nextRole, true);
      if (ui.authModal) renderModal();
      else scheduleRender();
    },
    "role-set": (el) => {
      const raw = el.dataset && (el.dataset.role || el.dataset.v);
      const next = raw === "tutor" ? "tutor" : "student";
      setRolePref(next);
      if (ui.messenger && typeof ui.messenger === "object") {
        ui.messenger.activeThreadId = "";
        ui.messenger.serverThreads = [];
        ui.messenger.loadedRole = "";
        ui.messenger.loadedOnce = false;
      }
      if (next === "tutor" && EGE.views.tutorCabinet) {
        if (typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab("requests");
        if (store.backend && store.user && typeof EGE.views.tutorCabinet.hydrateFromBackend === "function") {
          EGE.views.tutorCabinet.hydrateFromBackend();
        }
      }
      if (store.backend && store.user && EGE.views.messenger && typeof EGE.views.messenger.hydrateFromBackend === "function") {
        EGE.views.messenger.hydrateFromBackend(true);
      }
      ui.view = next === "tutor" ? "cabinet" : "home";
      writeHash();
      scheduleRender(true);
    },
    "auth-channel": (el) => {
      ui.auth.channel = normalizeOtpCh(el && el.dataset && el.dataset.v);
      ui.auth.error = "";
      if (ui.authModal) renderModal();
      else scheduleRender();
    },
    "auth-google-start": () => {
      ui.authModal = false;
      ui.auth.error = "";
      openContactVerifyModal({
        fromGoogleDemo: true,
        fromSocialDemo: true,
        authProvider: "google",
        channel: normalizeOtpCh(ui.auth.channel),
        required: true
      });
    },
    "auth-telegram-start": () => {
      const role = ui.role === "tutor" ? "tutor" : "student";
      if (hasTelegramLoginWidget()) {
        const tgLoginApi = typeof window !== "undefined" && window.Telegram && window.Telegram.Login;
        if (tgLoginApi && typeof tgLoginApi.auth === "function" && store.telegramBotId) {
          tgLoginApi.auth({ bot_id: store.telegramBotId, request_access: "write" }, (u) => {
            if (u) handleTelegramWidgetAuth(u);
          });
          return;
        }
        if (store.telegramBotId && typeof location !== "undefined" && location.origin && location.origin !== "null") {
          const cbUrl = location.origin + "/api/auth/telegram/callback?role=" + encodeURIComponent(role) + "&next=" + encodeURIComponent(currentAuthReturnUrl(role));
          location.href = "https://oauth.telegram.org/auth?bot_id=" + encodeURIComponent(store.telegramBotId)
            + "&origin=" + encodeURIComponent(location.origin)
            + "&embed=0&request_access=write&return_to=" + encodeURIComponent(cbUrl);
          return;
        }
        mountTelegramLoginWidget();
        ui.auth.error = "Нажмите кнопку Telegram Login выше для входа через Telegram.";
        if (ui.authModal) renderModal();
        else scheduleRender();
        return;
      }
      if (store.backend) {
        ui.auth.error = "Вход через Telegram Login Widget не настроен на сервере (нужны TELEGRAM_BOT_USERNAME и TELEGRAM_BOT_TOKEN). Вы можете войти по номеру телефона ниже.";
        if (ui.authModal) renderModal();
        else scheduleRender();
        return;
      }
      ui.authModal = false;
      ui.auth.error = "";
      openContactVerifyModal({
        fromTelegramDemo: true,
        fromSocialDemo: true,
        authProvider: "telegram",
        channel: "tg",
        required: true
      });
    },
    "auth-guest": () => {
      ui.demoAuthed = true;
      ui.guest = true;
      ui.authModal = false;
      ui.auth.error = "";
      if (resumePendingAfterAuth()) return;
      applyPostAuthView(true);
      scheduleRender(true);
    },
    "auth-screen": () => {
      ui.guest = false;
      ui.auth.error = "";
      scheduleRender(true);
    },
    "auth-logout": async () => {
      try { await backendReq("/api/auth/logout", { method: "POST" }); } catch (e) { /* выходим локально в любом случае */ }
      store.user = null; store.uid = null; store.me = null; store.telegramBinding = null;
      store.error = null; store.confirmed = false; store.stale = false;
      ui.demoAuthed = false; ui.pendingBookingAfterAuth = null; ui.authPrompt = ""; ui.tgLinkDeepUrl = "";
      cloud.db = null; ai.fn = null; ai.state = "off";
      if (_pp().stopCvResendTimer) _pp().stopCvResendTimer();
      ui.guest = false; ui.authModal = false; ui.contactVerifyModal = null; ui.cardBindModal = null; ui.filterModal = false; ui.quiz = null;
      clearActiveQuiz();
      clearQueues();
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.resetSession === "function") {
        EGE.views.tutorCabinet.resetSession();
      }
      ui.confirm = null; ui.auth.error = "";
      clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
      startLocal();
    },
    "account-export": async () => {
      let exportPayload;
      try {
        if (store.backend && store.user) {
          exportPayload = await backendReq("/api/me/export", { method: "GET" });
        } else {
          exportPayload = {
            schema: "vektor-ege-personal-data-v1",
            exportedAt: new Date().toISOString(),
            legalBasis: "152-FZ",
            account: store.user ? clone(store.user) : null,
            docs: clone(store.docs || {}),
            market: clone(mkt())
          };
        }
      } catch (e) {
        toast((e && e.message) || "Не удалось выгрузить персональные данные");
        return;
      }
      const data = JSON.stringify(exportPayload, null, 2);
      const filename = "vektor-personal-data-" + todayISO() + ".json";
      if (caps.downloads) {
        try { await caps.downloads.save({ filename, data }); toast("Персональные данные выгружены (JSON)"); return; }
        catch (e) { if (e && e.code === "declined") return; }
      }
      try {
        if (typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof document.createElement === "function") {
          const blob = new Blob([data], { type: "application/json" });
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href; a.download = filename;
          document.body.appendChild(a); a.click(); document.body.removeChild(a);
          setTimeout(() => { try { URL.revokeObjectURL(href); } catch (e) {} }, 1000);
          toast("Персональные данные выгружены (JSON)");
          return;
        }
      } catch (e) { /* запасной вариант ниже */ }
      ui.exportText = data;
      scheduleRender();
      toast("Персональные данные выгружены (JSON)");
    },
    "account-delete-ask": () => {
      ui.confirm = { kind: "delete-account" };
      scheduleRender();
    },
    "account-delete-do": async () => {
      if (ui.accountDeleteBusy) return;
      if (store.backend && store.user) {
        ui.accountDeleteBusy = true;
        scheduleRender();
        try {
          await backendReq("/api/me", { method: "DELETE" });
        } catch (e) {
          ui.accountDeleteBusy = false;
          toast((e && e.message) || "Не удалось удалить аккаунт");
          scheduleRender();
          return;
        }
      }
      ui.accountDeleteBusy = false;
      try {
        [
          LS_KEY, LEGACY_LS_KEY, MARKET_LS_KEY, ACTIVE_QUIZ_LS,
          "vektor-ege:tutor-v1", "vektor-ege:tutor-cabinet",
          COOKIE_CONSENT_LS, "vektor-ege:cookie-consent",
          "vektor-ege:notif-inbox", "vektor-ege:legal-consent:v1"
        ].forEach((k) => {
          try { if (k && typeof localStorage !== "undefined" && localStorage.removeItem) localStorage.removeItem(k); } catch (err) { /* игнор */ }
        });
      } catch (e) { /* игнор */ }
      store.user = null; store.uid = null; store.me = null; store.docs = {}; store.telegramBinding = null;
      store.error = null; store.confirmed = false; store.stale = false;
      ui.demoAuthed = false; ui.pendingBookingAfterAuth = null; ui.authPrompt = ""; ui.tgLinkDeepUrl = "";
      ui.market = null; ui.notifications = [];
      cloud.db = null; ai.fn = null; ai.state = "off";
      if (_pp().stopCvResendTimer) _pp().stopCvResendTimer();
      ui.guest = false; ui.authModal = false; ui.contactVerifyModal = null; ui.cardBindModal = null; ui.filterModal = false; ui.quiz = null;
      clearActiveQuiz();
      clearQueues();
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.resetSession === "function") {
        EGE.views.tutorCabinet.resetSession();
      }
      ui.confirm = null; ui.exportText = ""; ui.auth.error = "";
      clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
      startLocal({ skipSave: true });
      toast("Аккаунт и персональные данные удалены");
    },
    "auth-migrate": () => {
      if (!store.backend || !store.user || !hasLocalProgress()) return;
      ui.confirm = { kind: "migrate" };
      scheduleRender();
    },
    "auth-migrate-do": async () => {
      if (!store.backend || !store.user) return;
      ui.confirm = null;
      try {
        const n = await migrateLocalDocsToServer();
        await refreshBackendDocs(true);
        toast(n ? "Локальный прогресс перенесён в аккаунт" : "Нет данных для переноса");
      } catch (e) {
        toast((e && e.message) || "Не удалось перенести данные");
      }
      scheduleRender();
    }
  };
  function authErrorText(e) {
    const code = e && e.code;
    if (code === "unavailable") return "Нет связи с сервером. Попробуй через несколько секунд.";
    if (code === "invalid_credentials") return "Неверный логин или пароль.";
    if (code === "username_taken") return "Этот логин уже занят.";
    if (code === "email_taken") return "Этот email уже зарегистрирован.";
    if (code === "invalid_invite") return "Неверный код приглашения.";
    if (code === "invalid_phone") return "Введи корректный номер телефона для получения кода.";
    if (code === "invalid_code") return "Неверный код подтверждения. Проверьте сообщение в WhatsApp или Telegram.";
    if (code === "otp_expired") return "Срок действия кода истёк. Запроси код повторно.";
    if (code === "otp_attempts") return "Слишком много неверных попыток. Запроси новый код.";
    return (e && e.message) || "Не получилось войти. Попробуй ещё раз.";
  }
  async function submitFeedbackForm(kind) {
    const isCoop = kind === "cooperation";
    const stObj = isCoop
      ? (ui.coop || (ui.coop = { name: defaultFeedbackName(), contact: defaultFeedbackContact(), body: "", files: [], busy: false, error: "" }))
      : ui.bug;
    if (!stObj || stObj.busy) return;
    if (isCoop) {
      const nameEl = $("#coop-name");
      const contEl = $("#coop-contact");
      const bodyEl = $("#coop-body");
      if (nameEl && nameEl.value != null) stObj.name = String(nameEl.value);
      if (contEl && contEl.value != null) stObj.contact = String(contEl.value);
      if (bodyEl && bodyEl.value != null) stObj.body = String(bodyEl.value);
    } else {
      const bodyEl = $("#bug-body");
      const contEl = $("#bug-contact");
      if (bodyEl && bodyEl.value != null) stObj.body = String(bodyEl.value);
      if (contEl && contEl.value != null) stObj.contact = String(contEl.value);
    }
    const cleanBody = String(stObj.body || "").trim();
    const cleanContact = String(stObj.contact || "").trim();
    const cleanName = String(stObj.name || (isCoop ? "" : defaultFeedbackName()) || "").trim();
    if (cleanBody.length < 3) {
      stObj.error = isCoop ? "Опишите предложение подробнее (минимум 3 символа)." : "Опишите проблему подробнее (минимум 3 символа).";
      renderModal();
      return;
    }
    if (isCoop && cleanContact.length < 3) {
      stObj.error = "Укажите Telegram, телефон или email для обратной связи.";
      renderModal();
      return;
    }
    stObj.error = "";
    const subject = isCoop ? "Сотрудничество с Вектор" : (stObj.subject || "Баг на сайте Вектор");
    const files = Array.isArray(stObj.files) ? stObj.files.slice() : [];
    const pageUrl = typeof location !== "undefined" && location.href ? String(location.href) : "";
    const context = isCoop
      ? { view: ui.view || "landing", source: "coop-modal" }
      : {
          view: ui.view || "site",
          sid: ui.sid || "",
          qid: stObj.qid || "",
          qnum: stObj.qnum || "",
          screen: typeof window !== "undefined" && window.innerWidth ? `${window.innerWidth}×${window.innerHeight}` : ""
        };

    if (store && store.backend && EGE.api && EGE.api.feedback && typeof EGE.api.feedback.submit === "function") {
      stObj.busy = true;
      renderModal();
      try {
        const res = await EGE.api.feedback.submit({
          kind: isCoop ? "cooperation" : "bug",
          subject,
          message: cleanBody,
          contact: cleanContact,
          authorName: cleanName,
          pageUrl,
          context,
          files
        });
        const tid = (res && res.ticket && res.ticket.id) || "";
        ui.lastFeedbackDone = {
          id: tid,
          kind: isCoop ? "cooperation" : "bug",
          attachmentsCount: files.length
        };
        if (isCoop) {
          ui.coop = null;
          ui.coopModal = false;
        } else {
          ui.bug = null;
        }
        renderModal();
        scheduleRender();
        notifySide(
          isCoop ? "Предложение отправлено" : "Обращение отправлено",
          (tid ? `#${tid} · ` : "") + (files.length ? `Файлов: ${files.length} · ` : "") + "Передано команде Вектор",
          { inbox: true }
        );
      } catch (err) {
        stObj.busy = false;
        stObj.error = (err && err.message) || "Не удалось отправить обращение. Попробуйте ещё раз.";
        renderModal();
      }
      return;
    }

    ui.lastFeedbackDone = {
      id: "local-" + Date.now().toString(36),
      kind: isCoop ? "cooperation" : "bug",
      attachmentsCount: files.length
    };
    if (isCoop) {
      ui.coop = null;
      ui.coopModal = false;
    } else {
      ui.bug = null;
    }
    renderModal();
    scheduleRender();
    notifySide(
      isCoop ? "Предложение сохранено" : "Обращение сохранено",
      (files.length ? `Файлов: ${files.length} · ` : "") + "Сохранено в текущей сессии",
      { inbox: true }
    );
  }
  const FORMS = {
    onboard: () => {
      const prof = profile();
      const name = (store.user ? defaultName() : String(draft("ob.name", defaultName()))).trim().slice(0, 40);
      const rawSel = Array.isArray(ui.drafts["ob.subjects"]) && ui.drafts["ob.subjects"].length ? ui.drafts["ob.subjects"] : prof.subjects;
      const cleanSel = rawSel.map((id) => String(id || "").trim()).filter((id, i, a) => id && STUDY_SUBJ_MAP[id] && a.indexOf(id) === i);
      const subjects = cleanSel.length ? cleanSel : SUBJECT_META.map((s) => s.id);
      const targets = {};
      ALL_STUDY_SUBJECTS.forEach((s) => {
        const fb = prof.targets[s.id] != null ? prof.targets[s.id] : (s.target || 80);
        targets[s.id] = clampInt(draft("ob." + s.id, fb), 0, 100, fb);
      });
      const payload = { name, subjects, targets, prepSetupPending: false, created: Date.now() };
      const vc = mkt() && mkt().verifiedContact;
      if (vc && vc.value) {
        payload.contactVerified = true;
        payload.messengerContact = vc.value;
        payload.messengerApp = vc.app || "";
      }
      patchDoc("profile", payload);
      ui.prepSetupOpen = false;
      clearDrafts("ob.");
    },
    profile: (form) => {
      const prof = profile();
      const fe = form && form.elements;
      const pickVal = (dKey, fKey, fb) => {
        if (ui.drafts && ui.drafts[dKey] != null) return ui.drafts[dKey];
        if (fe && fe[fKey] && fe[fKey].value != null) return fe[fKey].value;
        return fb;
      };
      const rawSel = Array.isArray(ui.drafts["pf.subjects"]) && ui.drafts["pf.subjects"].length ? ui.drafts["pf.subjects"] : prof.subjects;
      const cleanSel = rawSel.map((id) => String(id || "").trim()).filter((id, i, a) => id && STUDY_SUBJ_MAP[id] && a.indexOf(id) === i);
      const subjects = cleanSel.length ? cleanSel : SUBJECT_META.map((s) => s.id);
      const targets = {}, exams = {};
      ALL_STUDY_SUBJECTS.forEach((s) => {
        const fbT = prof.targets[s.id] != null ? prof.targets[s.id] : (s.target || 80);
        targets[s.id] = clampInt(draft("pf.t." + s.id, fbT), 0, 100, fbT);
        const fbE = prof.exams[s.id] || s.examDate || "";
        const d = draft("pf.e." + s.id, fbE);
        exams[s.id] = validISO(d) ? d : fbE;
      });
      const vc = mkt() && mkt().verifiedContact;
      const pfState = ui.phoneFields && ui.phoneFields["pf-phone"];
      const phoneCountry = String(pickVal("pf.phoneCountry", "phoneCountry", (pfState && pfState.country) || prof.phoneCountry || "RU") || "RU").slice(0, 8);
      const rawPhone = String(pickVal("pf.phone", "phone", prof.phone || (vc && vc.value) || "")).trim();
      const cleanPhone = stripEmptyDialPhone(rawPhone, phoneCountry).slice(0, 28);
      const nextCity = String(pickVal("pf.city", "city", prof.city || "Якутск")).trim().slice(0, 40) || "Якутск";
      const nextTz = (EGE.views && EGE.views.progress && typeof EGE.views.progress.resolveCityTimezone === "function")
        ? EGE.views.progress.resolveCityTimezone(nextCity)
        : "UTC+9";
      patchDoc("profile", {
        name: String(pickVal("pf.name", "name", prof.name || defaultName())).trim().slice(0, 40),
        grade: String(pickVal("pf.grade", "grade", prof.grade || "")).trim().slice(0, 48),
        city: nextCity,
        timezone: nextTz,
        phone: cleanPhone,
        phoneCountry: detectPhoneCountry(cleanPhone, phoneCountry),
        goal: String(pickVal("pf.goal", "goal", prof.goal || "")).trim().slice(0, 200),
        prepSetupPending: false,
        subjects,
        targets,
        exams
      });
      ui.prepSetupOpen = false;
      clearDrafts("pf.");
      const saveBtn = form && typeof form.querySelector === "function" ? form.querySelector('button[type="submit"]') : null;
      if (saveBtn) flashButtonFeedback(saveBtn, "✓ Сохранено");
    },
    "pf-account-edit": (form) => {
      const fe = (form && form.elements) || {};
      const curProf = profile();
      const pickAccVal = (dKey, fKey, fb) => {
        if (ui.drafts && ui.drafts[dKey] != null) return ui.drafts[dKey];
        if (fe[fKey] && fe[fKey].value != null) return fe[fKey].value;
        return fb;
      };
      const name = String((fe.name && fe.name.value != null) ? fe.name.value : pickAccVal("pf.name", "name", curProf.name || defaultName())).trim().slice(0, 48);
      if (name.length < 2) {
        toast("Укажите имя и фамилию (минимум 2 символа)");
        return;
      }
      const nextCity = String(pickAccVal("pf.city", "city", curProf.city || "Якутск")).trim().slice(0, 40) || "Якутск";
      const nextTz = (EGE.views && EGE.views.progress && typeof EGE.views.progress.resolveCityTimezone === "function")
        ? EGE.views.progress.resolveCityTimezone(nextCity)
        : "UTC+9";
      const pfState = ui.phoneFields && ui.phoneFields["pf-phone"];
      const phoneCountry = String(pickAccVal("pf.phoneCountry", "phoneCountry", (pfState && pfState.country) || curProf.phoneCountry || "RU") || "RU").slice(0, 8);
      const rawPhone = String(pickAccVal("pf.phone", "phone", "")).trim().slice(0, 28);
      const tcMod = EGE._tutorCab;
      const fmtPhone = (tcMod && typeof tcMod.formatPhone === "function") ? tcMod.formatPhone : (s) => s;
      const fmtTg = (tcMod && typeof tcMod.formatTelegram === "function")
        ? tcMod.formatTelegram
        : ((EGE.kit && typeof EGE.kit.formatTelegramContact === "function") ? EGE.kit.formatTelegramContact : (s) => s);
      const cleanStudentPhone = stripEmptyDialPhone(rawPhone, phoneCountry).slice(0, 28);
      const cleanPhone = rawPhone ? (fmtPhone(rawPhone) || rawPhone) : "";
      const cleanTg = fmtTg(String((fe.telegram && fe.telegram.value) || "").trim()).slice(0, 36);
      const cleanMax = String((fe.maxHandle && fe.maxHandle.value) || "").trim().slice(0, 48);
      const cleanVk = String((fe.vk && fe.vk.value) || "").trim().slice(0, 64);

      const pfPatch = { name, city: nextCity, timezone: nextTz };
      if (ui.role === "tutor") {
        if (fe.phone) pfPatch.phone = cleanPhone;
        pfPatch.whatsapp = cleanPhone;
        pfPatch.telegram = cleanTg;
        pfPatch.maxHandle = cleanMax;
        pfPatch.vk = cleanVk;
      } else {
        if (fe.phone || (ui.drafts && ui.drafts["pf.phone"] != null)) {
          pfPatch.phone = cleanStudentPhone;
          pfPatch.phoneCountry = detectPhoneCountry(cleanStudentPhone, phoneCountry);
        }
        pfPatch.grade = String(pickAccVal("pf.grade", "grade", curProf.grade || "")).trim().slice(0, 48);
        pfPatch.goal = String(pickAccVal("pf.goal", "goal", curProf.goal || "")).trim().slice(0, 200);
        if (fe.telegram) pfPatch.telegram = cleanTg;
      }
      patchDoc("profile", pfPatch);
      if (store.user) store.user.displayName = name;

      if (ui.role === "tutor" && tcMod && typeof tcMod.tState === "function") {
        const st = tcMod.tState();
        const acc = st.account || (st.account = {});
        acc.name = name;
        acc.city = nextCity;
        acc.timezone = nextTz;
        acc.whatsapp = cleanPhone;
        acc.telegram = cleanTg;
        acc.maxHandle = cleanMax;
        acc.vk = cleanVk;
        if (typeof tcMod.syncProfileMirror === "function") tcMod.syncProfileMirror(st);
        if (typeof tcMod.syncPublishedTutor === "function") tcMod.syncPublishedTutor(st);
        if (typeof tcMod.saveState === "function") tcMod.saveState();
        if (store.backend && store.user && EGE.api && EGE.api.tutor && typeof EGE.api.tutor.updateAccount === "function") {
          const hasPhoto = acc.hasPhoto !== false && Boolean(acc.photo);
          EGE.api.tutor.updateAccount({
            name,
            city: nextCity,
            timezone: nextTz,
            photo: hasPhoto ? String(acc.photo || "") : "",
            hasPhoto,
            whatsapp: cleanPhone,
            telegram: cleanTg,
            maxHandle: cleanMax,
            vk: cleanVk
          }).then((res) => {
            if (res && res.user && store.user) Object.assign(store.user, res.user);
            if (res && Array.isArray(res.profiles) && typeof tcMod.applyServerProfiles === "function") {
              tcMod.applyServerProfiles(res.profiles, st, res.account || (store.docs && store.docs.profile));
            }
            if (typeof tcMod.saveState === "function") tcMod.saveState();
            scheduleRender(false);
          }).catch(() => {});
        }
      }
      ui.pfAccountEditOpen = false;
      ui.pfGradeMenuOpen = false;
      ui.pfCityMenuOpen = false;
      clearDrafts("pf.");
      scheduleRender(false);
      toast("Данные аккаунта сохранены");
    },
    log: () => {
      const d = draft("log.d", todayISO()), m = clampInt(draft("log.m", ""), 1, 720, 0);
      if (!validISO(d)) { toast("Укажи дату занятия"); return; }
      if (!m) { toast("Укажи, сколько минут длилось занятие"); return; }
      patchDoc("log-" + d.slice(0, 7), { s: { [newId()]: { d, sub: draft("log.sub", "bio"), m, n: String(draft("log.n", "")).trim().slice(0, 200), k: "manual", at: Date.now() } } });
      clearDrafts("log.", ["log.d", "log.sub"]);
    },
    mock: () => {
      const d = draft("mk.d", todayISO()), raw = draft("mk.sc", "");
      const sc = clampInt(raw, 0, 100, -1);
      if (!validISO(d)) { toast("Укажи дату пробника"); return; }
      if (raw === "" || sc < 0) { toast("Укажи тестовый балл от 0 до 100"); return; }
      const pRaw = draft("mk.p", "");
      const p = pRaw === "" ? null : clampInt(pRaw, 0, 100, null);
      patchDoc("mocks", { m: { [newId()]: { d, sub: draft("mk.sub", "bio"), sc, p, n: String(draft("mk.n", "")).trim().slice(0, 120), at: Date.now() } } });
      clearDrafts("mk.", ["mk.d", "mk.sub"]);
    },
    todo: () => {
      const t = String(draft("td.t", "")).trim().slice(0, 140);
      if (!t) { toast("Напиши, что нужно сделать"); return; }
      const d = draft("td.d", "");
      patchDoc("plan", { custom: { [newId()]: { t, d: validISO(d) ? d : "", n: String(draft("td.n", "")).trim().slice(0, 300), done: null, at: Date.now() } } });
      clearDrafts("td.");
    },
    chat: () => sendChat(ui.chat.draft),
    auth: async (form) => {
      const a = ui.auth;
      if (a.busy) return;
      const reg = a.tab === "register";
      const val = (name, key) => String(form && form.elements && form.elements[name] ? form.elements[name].value : draft(key, ""));
      const ch = normalizeOtpCh(a.channel);
      const chName = otpChName(ch);
      const pfSt = ui.phoneFields && ui.phoneFields["auth-phone"];
      const curCountry = (pfSt && pfSt.country) || draft("auth.phoneCountry", "RU") || "RU";
      const phoneDom = typeof document !== "undefined" && document.getElementById ? document.getElementById("auth-phone") : null;
      const rawPhone = String((form && form.elements && form.elements.phone && form.elements.phone.value) || (phoneDom && phoneDom.value) || draft("auth.phone", "") || "").trim();
      const parsed = formatPhoneForCountry(rawPhone, curCountry);
      if (!ui.drafts) ui.drafts = {};
      ui.drafts["auth.phone"] = parsed.formatted || rawPhone;
      ui.drafts["auth.phoneCountry"] = parsed.country.code;
      const inviteCode = reg ? val("invite", "auth.invite").trim() : "";
      const migEl = reg && form && form.elements ? form.elements.migrate : null;
      const doMigrate = !!(migEl && migEl.checked);
      if (!parsed.valid) {
        a.error = `Введи корректный номер телефона (${parsed.country.name}) для получения кода в ${chName}.`;
        if (ui.authModal) renderModal();
        else scheduleRender();
        return;
      }
      if (!store.backend) {
        const localCode = isDevDemoMode() ? "4829" : "";
        ui.authModal = false;
        a.error = "";
        openContactVerifyModal({
          step: "otp",
          contact: parsed.formatted,
          country: parsed.country.code,
          channel: ch,
          expectedCode: localCode,
          authMode: reg ? "register" : "login",
          authProvider: "phone",
          inviteCode,
          doMigrate,
          required: true,
          fromPhoneAuth: true
        });
        notifySide(
          `Код в ${chName} · Вектор`,
          localCode ? `Отправили код ${localCode} в ваш ${chName} на ${parsed.formatted}` : `Отправили 4-значный код в ваш ${chName} на ${parsed.formatted}`,
          { inbox: true }
        );
        if (typeof document !== "undefined" && typeof document.getElementById === "function") {
          const d0 = document.getElementById("cv-d0");
          if (d0 && typeof d0.focus === "function") d0.focus();
        }
        return;
      }
      a.busy = true; a.error = "";
      if (ui.authModal) renderModal(); else scheduleRender();
      try {
        const res = await backendReq("/api/auth/phone/send", {
          method: "POST",
          body: JSON.stringify({
            phone: parsed.formatted,
            country: parsed.country.code,
            channel: ch,
            mode: reg ? "register" : "login",
            inviteCode
          })
        });
        if (res && typeof res.demoMode === "boolean") store.demoMode = res.demoMode;
        const code = (res && typeof res.demoCode === "string" && res.demoCode) ? res.demoCode : "";
        const phoneOut = (res && res.phone) || parsed.formatted;
        const deliveredCh = (res && res.deliveredChannel) ? normalizeOtpCh(res.deliveredChannel) : ch;
        const deliveredName = otpChName(deliveredCh);
        const fallbackUsed = !!(res && res.fallbackUsed);
        a.busy = false;
        a.error = "";
        ui.authModal = false;
        openContactVerifyModal({
          step: "otp",
          contact: phoneOut,
          country: parsed.country.code,
          channel: deliveredCh,
          deliveredChannel: deliveredCh,
          fallbackUsed,
          deliveryProvider: (res && res.deliveryProvider) || null,
          expectedCode: code,
          authMode: reg ? "register" : "login",
          authProvider: "phone",
          inviteCode,
          doMigrate,
          required: true,
          fromPhoneAuth: true
        });
        notifySide(
          `Код (${deliveredName}) · Вектор`,
          code ? `Отправили код ${code} (${deliveredName}) на ${phoneOut}` : `Отправили 4-значный код (${deliveredName}) на ${phoneOut}`,
          { inbox: true }
        );
        if (typeof document !== "undefined" && typeof document.getElementById === "function") {
          const d0 = document.getElementById("cv-d0");
          if (d0 && typeof d0.focus === "function") d0.focus();
        }
        return;
      } catch (e) {
        a.error = authErrorText(e);
      }
      a.busy = false;
      if (ui.authModal) renderModal(); else scheduleRender();
    },
    "tutor-apply": async () => {
      const ta = ui.tutorApply || (ui.tutorApply = { name: "", subject: "eng", rate: 1100, contact: "", error: "" });
      const name = String(($("#ta-name") && $("#ta-name").value) || ta.name || "").trim();
      const subjId = String(($("#ta-subj") && $("#ta-subj").value) || ta.subject || "eng");
      const contact = String(($("#ta-contact") && $("#ta-contact").value) || ta.contact || "").trim();
      ta.name = name; ta.subject = subjId; ta.contact = contact;
      if (!name || name.length < 2) { ta.error = "Укажи имя и фамилию преподавателя."; renderModal(); return; }
      if (!contact || contact.length < 3) { ta.error = "Оставь ссылку (Ykt / Telegram / MAX) или номер телефона."; renderModal(); return; }
      ta.error = "";
      const subjObj = (TDATA && TDATA.SUBJECTS || []).find((s) => s.id === subjId);
      const subjName = subjObj ? subjObj.name : "Подготовка к ЕГЭ";
      const rate = Math.max(0, Math.min(99999, ta.rate != null ? Number(ta.rate) : 1100));

      if (store && store.backend && EGE.api && EGE.api.tutorApplications && typeof EGE.api.tutorApplications.create === "function") {
        if (ta.busy) return;
        ta.busy = true;
        renderModal();
        try {
          const res = await EGE.api.tutorApplications.create({
            name,
            subject: subjId,
            subjectName: subjName,
            rate,
            contact,
            source: "landing"
          });
          ta.busy = false;
          ta.name = "";
          ta.contact = "";
          ui.tutorApplyDone = {
            id: (res && res.application && res.application.id) || "",
            name,
            subjectName: subjName,
            rate,
            contact
          };
          ui.tutorApplyModal = false;
          renderModal();
          scheduleRender();
          notifySide("Анкета принята на проверку", `${name} · ${subjName} · ${rate.toLocaleString("ru-RU")} ₽/ч — появится в каталоге сегодня`, { inbox: true });
        } catch (err) {
          ta.busy = false;
          ta.error = (err && err.message) || "Не удалось отправить анкету. Попробуйте ещё раз.";
          renderModal();
        }
        return;
      }

      ui.tutorApplyDone = { name, subjectName: subjName, rate, contact };
      ui.tutorApplyModal = false;
      renderModal();
      scheduleRender();
      notifySide("Анкета принята на проверку", `${name} · ${subjName} · ${rate.toLocaleString("ru-RU")} ₽/ч — появится в каталоге сегодня`, { inbox: true });
    },
    "bug-submit": () => submitFeedbackForm("bug"),
    "coop-submit": () => submitFeedbackForm("cooperation"),
    "bal-refund": async (form) => {
      const bm = ui.balanceModal;
      if (!bm || bm.refundBusy) return;
      const st = mkt();
      const bal = Math.max(0, Number(st.balance) || 0);
      const amtEl = (form && form.elements && form.elements.refundAmount) || $("#bal-refund-amount");
      const reasonEl = (form && form.elements && form.elements.refundReason) || $("#bal-refund-reason");
      const rawAmtStr = String((amtEl && amtEl.value != null) ? amtEl.value : (bm.refundAmount || "")).replace(/\D+/g, "");
      const amt = rawAmtStr === "" ? bal : Number(rawAmtStr);
      const reason = String((reasonEl && reasonEl.value != null) ? reasonEl.value : (bm.refundReason || "")).trim().slice(0, 250);
      bm.refundAmount = rawAmtStr || String(amt);
      bm.refundReason = reason;
      if (!Number.isFinite(amt) || amt < 1) {
        bm.refundError = "Укажите сумму возврата от 1 ₽.";
        renderModal();
        return;
      }
      if (amt > bal) {
        bm.refundError = `На доступном балансе ${bal.toLocaleString("ru-RU")} ₽ — нельзя запросить больше остатка.`;
        renderModal();
        return;
      }
      if (!store.backend || !store.user || !EGE.api || !EGE.api.payments || typeof EGE.api.payments.requestRefund !== "function") {
        bm.refundError = "Войдите в аккаунт для оформления банковского возврата.";
        renderModal();
        return;
      }
      bm.refundBusy = true;
      bm.refundError = "";
      bm.refundSuccess = "";
      renderModal();
      try {
        const res = await EGE.api.payments.requestRefund({ amount: amt, reason });
        bm.refundBusy = false;
        if (res && res.wallet && res.wallet.balanceRub != null) {
          st.balance = Number(res.wallet.balanceRub) || 0;
          saveMkt();
        }
        const created = (res && Array.isArray(res.refunds) && res.refunds) || (res && res.refund ? [res.refund] : []);
        const prev = Array.isArray(bm.refunds) ? bm.refunds : [];
        bm.refunds = created.concat(prev).slice(0, 15);
        if (bm.refundableRub != null) bm.refundableRub = Math.max(0, Number(bm.refundableRub) - amt);
        bm.refundAmount = st.balance > 0 ? String(st.balance) : "0";
        bm.refundReason = "";
        bm.refundSuccess = `Заявка на возврат ${amt.toLocaleString("ru-RU")} ₽ создана (${(created[0] && created[0].id) || "ЮKassa"}). Средства зарезервированы и переданы в обработку.`;
        renderModal();
        scheduleRender();
        notifySide("Запрос на возврат отправлен", `${amt.toLocaleString("ru-RU")} ₽ на карту / СБП переданы в обработку`, { inbox: true });
      } catch (err) {
        bm.refundBusy = false;
        bm.refundError = (err && err.message) || "Не удалось оформить заявку на возврат.";
        renderModal();
      }
    },
    "bal-card-bind": (form) => {
      const st = mkt();
      const cb = ui.cardBindModal || (ui.cardBindModal = { cardNum: "", cardExp: "", cardCvc: "", saveCard: true, error: "" });
      const numEl = (form && form.elements && form.elements.cardNum) || $("#bal-card-num");
      const expEl = (form && form.elements && form.elements.cardExp) || $("#bal-card-exp");
      const cvcEl = (form && form.elements && form.elements.cardCvc) || $("#bal-card-cvc");
      const saveEl = $("#bal-save-card");
      const cardDigits = String((numEl && numEl.value) || cb.cardNum || "").replace(/\D+/g, "");
      const expRawDigits = String((expEl && expEl.value) || cb.cardExp || "").replace(/\D+/g, "").slice(0, 4);
      const expNorm = expRawDigits.length >= 3
        ? (expRawDigits.slice(0, 2) + "/" + expRawDigits.slice(2, 4))
        : String((expEl && expEl.value) || cb.cardExp || "").trim();
      const cvcDigits = String((cvcEl && cvcEl.value) || cb.cardCvc || "").replace(/\D+/g, "");
      const saveCard = saveEl != null ? !!saveEl.checked : (cb.saveCard !== false);
      cb.cardNum = cardDigits.slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
      cb.cardExp = expNorm;
      cb.cardCvc = cvcDigits.slice(0, 3);
      cb.saveCard = saveCard;
      if (cardDigits.length !== 16 || !/^(0[1-9]|1[0-2])\/\d{2}$/.test(expNorm) || cvcDigits.length !== 3) {
        cb.error = "Укажите 16 цифр карты, срок ММ/ГГ и 3 цифры CVC.";
        renderModal();
        return;
      }
      const meta = detectCardMeta(cardDigits);
      const brand = meta.brand;
      const last4 = cardDigits.slice(-4);
      const cards = savedCardsForMarket(st).slice();
      const existing = cards.find((c) => c.last4 === last4 && c.exp === expNorm);
      const cardObj = existing || {
        id: "card-" + last4 + "-" + Date.now().toString(36),
        brand,
        bankName: meta.bankName,
        bankTheme: meta.bankTheme,
        bin: cardDigits.slice(0, 6),
        last4,
        exp: expNorm
      };
      if (!existing) cards.unshift(cardObj);
      st.savedCards = cards;
      st.savedCard = cardObj;
      saveMkt();
      if (store.backend && store.user && EGE.api && EGE.api.wallet) {
        EGE.api.wallet.addCard({
          id: cardObj.id,
          brand: cardObj.brand,
          bankName: cardObj.bankName || "",
          bankTheme: cardObj.bankTheme || "default",
          bin: cardObj.bin || "",
          last4: cardObj.last4,
          exp: cardObj.exp
        }).catch(() => {});
      }
      ui.cardBindModal = null;
      if (!ui.balanceModal) {
        const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
        ui.balanceModal = { method: "card", selectedCardId: cardObj.id, customAmount: st.initialPaid ? 500 : trialRub, error: "", reason: "", pendingBooking: null };
      } else {
        ui.balanceModal.method = "card";
        ui.balanceModal.selectedCardId = cardObj.id;
        ui.balanceModal.error = "";
      }
      renderModal();
      const cardTitle = meta.bankName ? `${meta.bankName} · ${brand}` : brand;
      notifySide("Карта привязана", `${cardTitle} •• ${last4} добавлена к способам оплаты (+3% комиссия)`);
    },
    "contact-verify-send": async (form) => {
      const cv = ui.contactVerifyModal;
      if (!cv || cv.busy) return;
      const inpEl = (form && form.elements && form.elements.contact) || $("#cv-contact-inp");
      const raw = String((inpEl && inpEl.value) || cv.contact || "").trim();
      const parsed = formatPhoneForCountry(raw, cv.country || "RU");
      cv.country = parsed.country.code;
      cv.contact = parsed.formatted || raw;
      cv.countryMenuOpen = false;
      let ch = normalizeOtpCh(cv.channel);
      let chName = otpChName(ch);
      if (!parsed.valid) {
        cv.error = `Введите корректный номер телефона (${parsed.country.name}) для получения кода (${chName}).`;
        renderModal();
        return;
      }
      if (store.backend && !store.user) {
        cv.busy = true;
        cv.error = "";
        renderModal();
        try {
          const res = await backendReq("/api/auth/phone/send", {
            method: "POST",
            body: JSON.stringify({
              phone: cv.contact,
              country: cv.country || "RU",
              channel: ch,
              mode: cv.authMode || "login",
              inviteCode: cv.inviteCode || ""
            })
          });
          if (res && typeof res.demoMode === "boolean") store.demoMode = res.demoMode;
          cv.expectedCode = (res && typeof res.demoCode === "string" && res.demoCode) ? res.demoCode : "";
          if (res && res.deliveredChannel) ch = normalizeOtpCh(res.deliveredChannel);
          cv.channel = ch;
          cv.deliveredChannel = ch;
          cv.fallbackUsed = !!(res && res.fallbackUsed);
          cv.deliveryProvider = (res && res.deliveryProvider) || null;
          chName = otpChName(ch);
          cv.busy = false;
        } catch (e) {
          cv.busy = false;
          cv.error = authErrorText(e);
          renderModal();
          return;
        }
      } else if (!cv.expectedCode) {
        cv.expectedCode = isDevDemoMode() ? "4829" : "";
      }
      cv.step = "otp";
      cv.digits = ["", "", "", ""];
      cv.error = "";
      renderModal();
      notifySide(
        `Код (${chName}) · Вектор`,
        cv.expectedCode ? `Отправили код ${cv.expectedCode} (${chName}) на ${cv.contact}` : `Отправили 4-значный код (${chName}) на ${cv.contact}`,
        { inbox: true }
      );
      if (typeof document !== "undefined" && typeof document.getElementById === "function") {
        const d0 = document.getElementById("cv-d0");
        if (d0 && typeof d0.focus === "function") d0.focus();
      }
    },
    "contact-verify-check": async (form) => {
      const cv = ui.contactVerifyModal;
      if (!cv || cv.busy) return;
      const readDigit = (idx) => {
        const domEl = (typeof document !== "undefined" && document.getElementById) ? document.getElementById("cv-d" + idx) : null;
        const formEl = form && form.elements ? form.elements["d" + idx] : null;
        const v = (domEl && domEl.value != null ? domEl.value : (formEl && formEl.value != null ? formEl.value : ((cv.digits && cv.digits[idx]) || "")));
        return String(v || "").replace(/\D+/g, "").slice(0, 1);
      };
      const ch = normalizeOtpCh(cv.deliveredChannel || cv.channel);
      const chName = otpChName(ch);
      const prov = cv.authProvider || (cv.fromTelegramDemo ? "telegram" : (cv.fromGoogleDemo ? "google" : "phone"));
      const code = [0, 1, 2, 3].map(readDigit).join("");
      if (code.length < 4) {
        cv.error = `Введите 4 цифры кода из ${chName}.`;
        renderModal();
        return;
      }
      if (store.backend && !store.user) {
        cv.busy = true;
        cv.error = "";
        renderModal();
        try {
          const verifyRes = await backendReq("/api/auth/phone/verify", {
            method: "POST",
            body: JSON.stringify({
              phone: cv.contact,
              country: cv.country || "RU",
              channel: ch,
              code,
              role: ui.role === "tutor" ? "tutor" : "student",
              inviteCode: cv.inviteCode || "",
              authProvider: prov
            })
          });
          let migrated = 0;
          if (cv.doMigrate) {
            try { migrated = await migrateLocalDocsToServer(); } catch (e) { /* загрузим аккаунт в любом случае */ }
          }
          clearQueues();
          ui.guest = false;
          const hadPending = !!ui.pendingBookingAfterAuth;
          if (!hadPending && ui.view !== "market") applyPostAuthView();
          await loadBackendSession(verifyRes.user);
          clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
          mkt().verifiedContact = {
            channel: ch,
            app: chName,
            country: cv.country || "RU",
            value: cv.contact,
            verifiedAt: Date.now()
          };
          saveMkt();
          const hadDoc = Boolean(store.docs && store.docs.profile);
          const pendingFlag = hadDoc ? Boolean(store.docs.profile.prepSetupPending) : true;
          patchDoc("profile", {
            contactVerified: true,
            phone: cv.contact,
            phoneCountry: cv.country || "RU",
            messengerContact: cv.contact,
            messengerApp: chName,
            prepSetupPending: pendingFlag
          });
          cv.busy = false;
          if (_pp().stopCvResendTimer) _pp().stopCvResendTimer();
          ui.contactVerifyModal = null;
          ui.authModal = false;
          ui.auth.error = "";
          notifySide(migrated ? "Вход выполнен, прогресс перенесён" : "Номер подтверждён", `Телефон ${cv.contact} (${chName}) привязан к аккаунту`);
          if (!resumePendingAfterAuth()) {
            if (ui.view !== "market") applyPostAuthView();
            renderModal();
            scheduleRender(true);
          }
          return;
        } catch (e) {
          cv.busy = false;
          cv.error = authErrorText(e);
          renderModal();
          return;
        }
      }
      if (!cv.expectedCode && !isDevDemoMode()) {
        cv.error = "Не удалось проверить код без соединения с сервером.";
        renderModal();
        return;
      }
      if (code !== String(cv.expectedCode || "4829")) {
        cv.error = `Неверный код подтверждения. Проверьте сообщение в ${chName} и попробуйте снова.`;
        renderModal();
        return;
      }
      if ((cv.fromSocialDemo || cv.fromPhoneAuth || cv.fromGoogleDemo) && !store.user) {
        const cleanDigits = String(cv.contact || "").replace(/\D+/g, "");
        const suf = cleanDigits.slice(-4) || "user";
        store.user = {
          id: `${prov}-local-${cleanDigits || suf}`,
          username: prov === "google" ? "google_user" : prov === "telegram" ? "tg_user" : ("u_" + suf),
          displayName: prov === "google" ? "Аккаунт Google" : prov === "telegram" ? "Аккаунт Telegram" : cv.contact,
          authProvider: prov
        };
        ui.demoAuthed = true;
        ui.guest = false;
      }
      mkt().verifiedContact = {
        channel: ch,
        app: chName,
        country: cv.country || "RU",
        value: cv.contact,
        verifiedAt: Date.now()
      };
      saveMkt();
      if (store.backend && store.user) {
        const hadDoc = Boolean(store.docs && store.docs.profile);
        const pendingFlag = hadDoc ? Boolean(store.docs.profile.prepSetupPending) : true;
        patchDoc("profile", {
          contactVerified: true,
          phone: cv.contact,
          phoneCountry: cv.country || "RU",
          messengerContact: cv.contact,
          messengerApp: chName,
          prepSetupPending: pendingFlag
        });
      }
      if (_pp().stopCvResendTimer) _pp().stopCvResendTimer();
      ui.contactVerifyModal = null;
      ui.authModal = false;
      ui.auth.error = "";
      clearDrafts("auth.");
      notifySide("Номер подтверждён", `Телефон ${cv.contact} (${chName}) привязан к аккаунту`);
      if (!resumePendingAfterAuth()) {
        if (ui.view !== "market") applyPostAuthView();
        renderModal();
        scheduleRender(true);
      }
    },
    "bal-custom": (form) => {
      const st = mkt();
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      const minAmt = st.initialPaid ? 100 : trialRub;
      const cards = savedCardsForMarket(st);
      const bm = ui.balanceModal || (ui.balanceModal = {
        method: "sbp",
        selectedCardId: (cards[0] && cards[0].id) || "",
        customAmount: minAmt,
        error: "",
        reason: "",
        pendingBooking: null
      });
      const rawEl = (form && form.elements && form.elements.amount) || $("#bal-custom-amount");
      const rawStr = rawEl ? String(rawEl.value || "").replace(/\D+/g, "") : String(bm.customAmount == null ? "" : bm.customAmount).replace(/\D+/g, "");
      const raw = rawStr === "" ? NaN : Number(rawStr);
      if (rawStr !== "") bm.customAmount = rawStr;
      const emailEl = (form && form.elements && form.elements.receiptEmail) || $("#bal-receipt-email");
      if (emailEl && emailEl.value != null) bm.receiptEmail = String(emailEl.value).trim();
      if (!Number.isFinite(raw) || raw < minAmt) {
        bm.error = !st.initialPaid
          ? `Первое пополнение на занятия — минимум ${trialRub} ₽. Далее можно от 100 ₽.`
          : "Введите сумму пополнения от 100 ₽.";
        renderModal();
        return;
      }
      const method = bm.method === "card" ? "card" : "sbp";
      const amt = Math.min(200000, Math.round(raw));
      if (isYookassaActive()) {
        startServerTopup({
          amount: amt,
          method,
          cardId: null,
          planId: st.planId || "trial5k",
          receiptEmail: bm.receiptEmail || "",
          pendingBooking: bm.pendingBooking || null
        });
        return;
      }
      if (method === "card" && !cards.length) {
        ui.cardBindModal = { cardNum: "", cardExp: "", cardCvc: "", saveCard: true, error: "" };
        renderModal();
        return;
      }
      const activeCard = method === "card"
        ? (cards.find((c) => c.id === bm.selectedCardId) || cards[0] || null)
        : null;
      const fee = method === "card" ? Math.round(amt * 0.03) : 0;
      const totalCharged = amt + fee;
      EGEPayments.createTopupIntent({ amount: amt, fee, totalCharged, method, planId: st.planId || "trial5k" });
      st.balance = (Number(st.balance) || 0) + amt;
      if (st.balance >= trialRub) st.initialPaid = true;
      if (st.balance >= 8900) st.planId = "month10k";
      else if (!st.planId) st.planId = "trial5k";
      saveMkt();
      if (store.backend && store.user && EGE.api && EGE.api.wallet) {
        EGE.api.wallet.topup({
          amount: amt,
          method,
          cardId: activeCard ? activeCard.id : null,
          planId: st.planId || "trial5k"
        }).then((res) => {
          if (res && res.wallet && Number.isFinite(Number(res.wallet.balanceRub))) {
            st.balance = Number(res.wallet.balanceRub);
            st.initialPaid = !!res.wallet.initialPaid;
            saveMkt();
            scheduleRender();
          }
        }).catch(() => {});
      }
      const pending = bm.pendingBooking;
      ui.balanceModal = null;
      if (pending && st.balance >= (pending.offerPrice != null ? Number(pending.offerPrice) : trialRub)) {
        const pOffer = pending.mode === "trial"
          ? (pending.offerPrice != null ? Number(pending.offerPrice) : trialRub)
          : (pending.offerPrice != null ? Number(pending.offerPrice) : 1000);
        ui.booking = Object.assign({}, pending, { offerPrice: pOffer });
      }
      renderModal();
      if (method === "card") {
        const cardDesc = activeCard ? ` · ${activeCard.brand || "Карта"} •• ${activeCard.last4}` : "";
        notifySide("Баланс пополнен картой", `+${amt.toLocaleString("ru-RU")} ₽ (списано ${totalCharged.toLocaleString("ru-RU")} ₽, +3%${cardDesc}) · на счёте ${st.balance.toLocaleString("ru-RU")} ₽`, { inbox: true });
      } else {
        notifySide("Баланс пополнен по СБП", `+${amt.toLocaleString("ru-RU")} ₽ · на счёте ${st.balance.toLocaleString("ru-RU")} ₽`, { inbox: true });
      }
      scheduleRender();
    },
    "student-lead": (form) => {
      if (!TDATA || typeof TDATA.addStudentLead !== "function") return;
      const ld = ui.leadDraft || (ui.leadDraft = { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, whatsapp: "", comment: "" });
      const priceEl = (form && form.elements && form.elements.targetPrice) || $("#lead-price");
      const waEl = (form && form.elements && form.elements.whatsapp) || $("#lead-wa");
      const cEl = (form && form.elements && form.elements.comment) || $("#lead-comment");
      const rawLeadPrice = Number(priceEl ? priceEl.value : ld.targetPrice);
      const targetPrice = Math.max(0, Math.min(99999, Number.isFinite(rawLeadPrice) ? Math.round(rawLeadPrice) : 1000));
      const rawWa = String((waEl ? waEl.value : ld.whatsapp) || "").trim();
      const waState = ui.phoneFields && ui.phoneFields["lead-wa"];
      const waCountry = ld.whatsappCountry || (waState && waState.country) || "RU";
      const whatsapp = stripEmptyDialPhone(rawWa, waCountry);
      const comment = String((cEl ? cEl.value : ld.comment) || "").trim();
      const subjects = Array.isArray(ld.subjects) && ld.subjects.length ? ld.subjects.slice() : ["chem"];
      const studentName = profile().name || (store.user && (store.user.displayName || store.user.username)) || "Ученик (мой профиль)";
      const lead = TDATA.addStudentLead({
        subjects,
        exam: ld.exam || "ЕГЭ",
        format: ld.format || "Онлайн",
        targetPrice,
        whatsapp: whatsapp || "79142100500",
        comment: comment || `Ищу преподавателя: ${(typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(subjects).join(", ") : subjects.join(", "))}`,
        studentName,
        mine: true
      });
      if (store.backend && EGE.api && EGE.api.leads) {
        EGE.api.leads.create({
          subjects,
          exam: ld.exam || "ЕГЭ",
          format: ld.format || "Онлайн",
          targetPrice,
          whatsapp: whatsapp || "79142100500",
          whatsappCountry: waCountry,
          comment: lead.comment,
          studentName
        }).then((res) => {
          if (res && res.lead && res.lead.id) lead.id = res.lead.id;
        }).catch(() => {});
      }
      ld.targetPrice = targetPrice;
      ld.whatsapp = whatsapp;
      ld.comment = "";
      ld.subjMenuOpen = false;
      const subjLbl = typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(lead.subjects).join(" · ") : lead.subjects.join(", ");
      notifySide("Запрос отправлен преподавателям", `${subjLbl} · до ${targetPrice.toLocaleString("ru-RU")} ₽/ч — преподаватели уже видят вас во вкладке «Ученики ищут»`, { inbox: true });
      scheduleRender();
    },
    "hero-quick-go": (form) => {
      const qEl = (form && form.elements && form.elements.q) || $("#hero-banner-q");
      const val = String((qEl && qEl.value) || ui.heroQuickQ || "").trim();
      ui.heroQuickQ = val;
      ui.heroBannerSubmitted = true;
      const st = mkt();
      st.q = val;
      saveMkt();
      scheduleRender();
      if (typeof setTimeout === "function") setTimeout(() => scrollToEl("land-market"), 40);
    },
    "landing-search": (form) => {
      const qEl = (form && form.elements && form.elements.q) || $("#landing-q");
      const val = String((qEl && qEl.value) || "").trim();
      const st = mkt();
      st.q = val;
      saveMkt();
      scheduleRender();
      if (typeof setTimeout === "function") setTimeout(() => scrollToEl("land-market"), 40);
    },
    "bb-hero-demo": (form) => {
      const qEl = (form && form.elements && form.elements.q) || $("#bb-hero-demo-q");
      const bb = bbState();
      bb.heroQ = String((qEl && qEl.value) || bb.heroQ || "").trim();
      bb.heroSearchSubmitted = !bb.heroSearchSubmitted;
      scheduleRender();
    },
    "tc-payout": (form) => {
      const tcMod = EGE.views.tutorCabinet;
      if (!tcMod || typeof tcMod.submitPayout !== "function") return;
      const pm = ui.payoutModal || (ui.payoutModal = {});
      const els = (form && form.elements) || {};
      const payload = {
        method: pm.method || "sbp",
        bank: els.bank ? els.bank.value : pm.bank,
        phone: els.phone ? els.phone.value : pm.phone,
        card: els.card ? els.card.value : pm.card,
        amount: els.amount ? els.amount.value : pm.amount,
        tutorInn: els.tutorInn ? els.tutorInn.value : (pm.inn || ""),
        npdReceipt: els.npdReceipt ? !!els.npdReceipt.checked : pm.npdReceipt
      };
      const res = tcMod.submitPayout(pm, payload);
      if (!res || !res.ok) {
        pm.error = (res && res.error) || "Не удалось оформить вывод средств.";
        renderModal();
        return;
      }
      ui.payoutModal = null;
      renderModal();
      renderChrome();
      const amtTxt = Number((res.payoutRow && res.payoutRow.amount) || 0).toLocaleString("ru-RU");
      const destTxt = (res.payoutRow && res.payoutRow.methodLabel) || "СБП";
      notifySide("Заявка на вывод оформлена", `${amtTxt} ₽ · ${destTxt}${res.payoutRow && res.payoutRow.npdReceipt ? " · чек НПД" : ""}`, { inbox: true });
      scheduleRender();
    },
    "bid-telemost": (form) => {
      const id = (form && form.dataset && form.dataset.id) || ui.telemostEditId || "";
      const urlEl = (form && form.elements && form.elements.url) || $("#tm-inp-" + id);
      const rawUrl = urlEl ? urlEl.value : "";
      if (EGE.views.marketplace && typeof EGE.views.marketplace.saveTelemostForBooking === "function") {
        EGE.views.marketplace.saveTelemostForBooking(id, rawUrl);
      }
    }
  };

  function updateBookingModalLive() { return EGE.views.marketplace.updateBookingModalLive(); }

  function closeSelectMenus(target) {
    let changed = false;
    if (ui.brandbook && ui.brandbook.subjMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#bb-demo-select"))) {
      ui.brandbook.subjMenuOpen = false;
      changed = true;
    }
    if (ui.brandbook && ui.brandbook.multiMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#bb-demo-multi"))) {
      ui.brandbook.multiMenuOpen = false;
      changed = true;
    }
    if (ui.leadDraft && ui.leadDraft.subjMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#lead-subjects"))) {
      ui.leadDraft.subjMenuOpen = false;
      changed = true;
    }
    if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.closeMenus === "function") {
      if (EGE.views.tutorCabinet.closeMenus(target)) changed = true;
    }
    if (ui.landMatch && ui.landMatch.menuOpen && (!target || typeof target.closest !== "function" || !target.closest("#land-match-select"))) {
      ui.landMatch.menuOpen = false;
      changed = true;
    }
    if (ui.pfGradeMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#pf-grade"))) {
      ui.pfGradeMenuOpen = false;
      changed = true;
    }
    if (ui.pfCityMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#pf-city"))) {
      ui.pfCityMenuOpen = false;
      changed = true;
    }
    if (ui.booking && ui.booking.timeMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#bid-custom-time"))) {
      ui.booking.timeMenuOpen = false;
      renderModal();
    }
    if (_pp().closePhoneMenus(target)) changed = true;
    return changed;
  }

  function dismissActiveModal() {
    if (ui.contactVerifyModal) {
      if (ui.contactVerifyModal.fromSocialDemo || ui.contactVerifyModal.fromPhoneAuth || ui.contactVerifyModal.fromGoogleDemo || !ui.contactVerifyModal.required) {
        if (_pp().stopCvResendTimer) _pp().stopCvResendTimer();
        const backToAuth = Boolean(ui.contactVerifyModal.fromSocialDemo || ui.contactVerifyModal.fromPhoneAuth || ui.contactVerifyModal.fromGoogleDemo);
        ui.contactVerifyModal = null;
        if (backToAuth) ui.authModal = true;
        renderModal();
        return true;
      }
      ui.contactVerifyModal.error = "Обязательный шаг: подтвердите номер телефона кодом из WhatsApp или Telegram.";
      renderModal();
      return false;
    }
    if (ui.cardBindModal) {
      ui.cardBindModal = null;
      renderModal();
      return true;
    }
    ui.bug = null; ui.notifModal = false; ui.cookieModal = null; ui.booking = null; ui.reviewsModal = null; ui.reviewModal = null; ui.disputeModal = null; ui.authModal = false; ui.authPrompt = ""; ui.pendingBookingAfterAuth = null; ui.filterModal = false; ui.filterSubjExpanded = false; ui.filterSubjQ = ""; ui.bbModal = false; ui.tutorApplyModal = false; ui.coopModal = false; ui.coop = null; ui.balanceModal = null; ui.payoutModal = null; ui.tutorContactModal = null;
    renderModal();
    renderCookieBanner();
    return true;
  }

  document.addEventListener("click", (e) => {
    if (Date.now() < notifSuppressClickUntil) {
      notifSuppressClickUntil = 0;
      const t = e && e.target;
      const actEl = t && typeof t.closest === "function" ? t.closest("[data-a]") : (t && t.dataset && t.dataset.a ? t : null);
      const actName = (actEl && actEl.dataset && actEl.dataset.a) || "";
      if (actName !== "notif-remove" && actName !== "notif-clear" && actName !== "notif-close") {
        if (e && typeof e.preventDefault === "function") e.preventDefault();
        return;
      }
    }
    if (EGE.gestures && typeof EGE.gestures.consumeSuppressedClick === "function" && EGE.gestures.consumeSuppressedClick()) {
      if (typeof e.preventDefault === "function") e.preventDefault();
      return;
    }
    if (closeSelectMenus(e.target)) scheduleRender();
    if (e.target && e.target.classList && e.target.classList.contains("modal-back")) {
      dismissActiveModal();
      return;
    }
    triggerButtonTap(e && e.target);
    const msgCand = (e && e.target && typeof e.target.closest === "function" ? e.target.closest("a.btn-msg, .btn-msg[href]") : null)
      || (e && e.target && e.target.classList && e.target.classList.contains("btn-msg") && !e.target.disabled && !e.target.classList.contains("is-disabled") ? e.target : null);
    const msgEl = (msgCand && (!msgCand.classList || (msgCand.classList.contains("btn-msg") && !msgCand.classList.contains("is-disabled")))) ? msgCand : null;
    if (msgEl) {
      const dCh = msgEl.dataset && msgEl.dataset.holdCh;
      const href = String((typeof msgEl.getAttribute === "function" ? msgEl.getAttribute("href") : msgEl.href) || "");
      const chName = (dCh === "wa" || (msgEl.classList && msgEl.classList.contains("is-wa")) || href.indexOf("wa.me") >= 0) ? "WhatsApp"
        : (dCh === "tg" || (msgEl.classList && msgEl.classList.contains("is-tg")) || href.indexOf("t.me") >= 0) ? "Telegram"
        : (dCh === "max" || (msgEl.classList && msgEl.classList.contains("is-max")) || href.indexOf("max.ru") >= 0) ? "MAX"
        : "мессенджер";
      let who = String((msgEl.dataset && (msgEl.dataset.tutorName || msgEl.dataset.studentName)) || "").trim();
      if (!who && typeof msgEl.closest === "function") {
        const card = msgEl.closest("article, .tutor-card, .tc-req-card, .study-lesson-card, .modal-card");
        const nameEl = card && typeof card.querySelector === "function" ? card.querySelector(".tutor-person-name, .tc-req-who b, b") : null;
        if (nameEl && nameEl.textContent) who = String(nameEl.textContent).trim();
      }
      notifySide(
        `Написали в ${chName}`,
        who ? `Открыт чат с ${who} в ${chName}` : `Открыт чат в ${chName}`,
        { inbox: true }
      );
    }
    const el = e.target.closest("[data-a]") || e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const hrefAttr = el.tagName === "A" ? el.getAttribute("href") : "";
    const act = (el.dataset && (el.dataset.a || el.dataset.act)) || "";
    const isModifiedClick = !!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === "number" && e.button !== 0));
    const isAuthRegSpa = !!(act === "auth-register-open" && !isModifiedClick && !(HOST_SITE && HOST_SITE !== "brandbook" && el.dataset && el.dataset.role && HOST_SITE !== el.dataset.role));
    const isExtLink = !!(hrefAttr && !hrefAttr.startsWith("#") && !isAuthRegSpa && !(act === "bb-subsite" && hrefAttr.indexOf("/brandbook") === 0 && !isModifiedClick));
    if (act === "card-bid" || act === "book-submit" || act === "tc-lead-offer" || act === "tc-sched-alt-send") {
      spawnBidLaunchFx(el);
    }
    if (act && act.indexOf("tc-") === 0 && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleAction === "function") {
      if (EGE.views.tutorCabinet.handleAction(act, el)) { if (!isExtLink) e.preventDefault(); return; }
    }
    if (act && (act === "home-bid-filter" || act === "study-day-pick" || act === "study-billing-toggle" || act.indexOf("bid-telemost-") === 0 || act.indexOf("bid-sched-") === 0 || act.indexOf("mkt-bk-") === 0 || act.indexOf("study-chats-") === 0) && EGE.views.marketplace && typeof EGE.views.marketplace.handleAction === "function") {
      if (e.defaultPrevented) return;
      if (EGE.views.marketplace.handleAction(act, el)) { if (!isExtLink) e.preventDefault(); return; }
    }
    const h = ACTIONS[act];
    if (h) { if (!isExtLink) e.preventDefault(); h(el, e); return; }
    if (act && act.indexOf("bb-") === 0 && EGE.views.brandbook && typeof EGE.views.brandbook.handleAction === "function") {
      if (EGE.views.brandbook.handleAction(act, el, ui, { render: () => scheduleRender(), toast, notifySide, copy: copyTextSafe, copyText: copyTextSafe })) {
        if (!isExtLink) e.preventDefault();
      }
    }
  });
  let _weekSwipeStart = null;
  function finishWeekSwipe(endX, endY) {
    const start = _weekSwipeStart;
    _weekSwipeStart = null;
    if (!start) return;
    const dx = Number(endX) - start.x;
    const dy = Number(endY) - start.y;
    if (Math.abs(dx) < 45 || Math.abs(dx) <= Math.abs(dy) * 1.4 || Date.now() - start.ts > 900) return;
    const delta = dx > 0 ? -1 : 1;
    if (start.mode === "tc" && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleAction === "function") {
      EGE.views.tutorCabinet.handleAction("tc-cal-week-step", { dataset: { delta: String(delta) } });
    } else if (start.mode === "study") {
      const cur = Number.isFinite(Number(ui.studyWeekOffset)) ? Math.trunc(Number(ui.studyWeekOffset)) : 0;
      ui.studyWeekOffset = Math.max(-12, Math.min(12, cur + delta));
      ui.studySelectedIso = "";
      scheduleRender();
    }
  }
  document.addEventListener("touchstart", (e) => {
    const t = e && e.touches && e.touches[0];
    const strip = e && e.target && e.target.closest ? e.target.closest("[data-week-swipe]") : null;
    _weekSwipeStart = (t && strip) ? { mode: strip.dataset.weekSwipe, x: t.clientX, y: t.clientY, ts: Date.now(), kind: "touch" } : null;
  }, { passive: true });
  document.addEventListener("touchend", (e) => {
    if (!_weekSwipeStart || _weekSwipeStart.kind !== "touch") return;
    const t = e && e.changedTouches && e.changedTouches[0];
    if (t) finishWeekSwipe(t.clientX, t.clientY);
    else _weekSwipeStart = null;
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (!e || e.pointerType === "touch") return;
    const strip = e.target && e.target.closest ? e.target.closest("[data-week-swipe]") : null;
    if (strip) _weekSwipeStart = { mode: strip.dataset.weekSwipe, x: e.clientX, y: e.clientY, ts: Date.now(), kind: "pointer" };
  });
  document.addEventListener("pointerup", (e) => {
    if (!e || e.pointerType === "touch" || !_weekSwipeStart || _weekSwipeStart.kind !== "pointer") return;
    finishWeekSwipe(e.clientX, e.clientY);
  });
  function startNotifSwipe(target, x, y, kind, pointerId) {
    if (notifClearing || !target || typeof target.closest !== "function") return null;
    if (target.closest('[data-a="notif-remove"], button, a, input, textarea, select')) return null;
    const item = target.closest('.notif-inbox-item[data-notif-id]');
    if (!item || (item.classList && (item.classList.contains("is-dismiss-left") || item.classList.contains("is-dismiss-right")))) return null;
    return {
      el: item,
      id: String((item.dataset && item.dataset.notifId) || ""),
      x0: Number(x) || 0,
      y0: Number(y) || 0,
      dx: 0,
      locked: null,
      kind,
      pointerId
    };
  }
  function moveNotifSwipe(x, y, e) {
    if (!notifSwipe) return;
    const dx = Number(x) - notifSwipe.x0;
    const dy = Number(y) - notifSwipe.y0;
    if (!notifSwipe.locked) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      if (Math.abs(dx) > Math.abs(dy) * 1.15) {
        notifSwipe.locked = "h";
        if (notifSwipe.el.classList) notifSwipe.el.classList.add("is-swiping");
      } else {
        notifSwipe = null;
        return;
      }
    }
    if (notifSwipe.locked === "h") {
      if (e && e.cancelable && typeof e.preventDefault === "function") e.preventDefault();
      notifSwipe.dx = dx;
      if (notifSwipe.el.style) {
        notifSwipe.el.style.transform = `translateX(${dx}px)`;
        notifSwipe.el.style.opacity = String(Math.max(0.18, 1 - Math.abs(dx) / 180));
      }
    }
  }
  function endNotifSwipe(cancelled) {
    const cur = notifSwipe;
    notifSwipe = null;
    if (!cur || !cur.el) return;
    const el = cur.el;
    if (el.classList) el.classList.remove("is-swiping");
    if (cur.locked === "h") notifSuppressClickUntil = Date.now() + 260;
    const width = el.offsetWidth || 280;
    const threshold = Math.max(72, Math.min(115, width * 0.28));
    if (!cancelled && cur.locked === "h" && Math.abs(cur.dx) >= threshold) {
      dismissNotifById(cur.id, cur.dx > 0 ? "right" : "left", el);
      return;
    }
    if (el.style) {
      el.style.transform = "";
      el.style.opacity = "";
    }
  }
  document.addEventListener("touchstart", (e) => {
    const t = e && e.touches && e.touches[0];
    notifSwipe = t ? startNotifSwipe(e.target, t.clientX, t.clientY, "touch", 0) : null;
  }, { passive: true });
  document.addEventListener("touchmove", (e) => {
    if (!notifSwipe || notifSwipe.kind !== "touch") return;
    const t = e && e.touches && e.touches[0];
    if (t) moveNotifSwipe(t.clientX, t.clientY, e);
  }, { passive: false });
  document.addEventListener("touchend", () => {
    if (notifSwipe && notifSwipe.kind === "touch") endNotifSwipe(false);
  }, { passive: true });
  document.addEventListener("touchcancel", () => {
    if (notifSwipe && notifSwipe.kind === "touch") endNotifSwipe(true);
  }, { passive: true });
  document.addEventListener("pointerdown", (e) => {
    if (!e || e.pointerType === "touch") return;
    if (typeof e.button === "number" && e.button !== 0) return;
    notifSwipe = startNotifSwipe(e.target, e.clientX, e.clientY, "pointer", e.pointerId);
  });
  document.addEventListener("pointermove", (e) => {
    if (!notifSwipe || notifSwipe.kind !== "pointer" || !e || e.pointerType === "touch") return;
    if (notifSwipe.pointerId && e.pointerId && e.pointerId !== notifSwipe.pointerId) return;
    moveNotifSwipe(e.clientX, e.clientY, e);
  });
  document.addEventListener("pointerup", (e) => {
    if (!notifSwipe || notifSwipe.kind !== "pointer" || !e || e.pointerType === "touch") return;
    endNotifSwipe(false);
  });
  document.addEventListener("pointercancel", (e) => {
    if (!notifSwipe || notifSwipe.kind !== "pointer" || !e || e.pointerType === "touch") return;
    endNotifSwipe(true);
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("form[data-f]");
    if (!f) return;
    e.preventDefault();
    if (f.dataset.f && f.dataset.f.indexOf("tc-") === 0 && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleSubmit === "function") {
      if (EGE.views.tutorCabinet.handleSubmit(f)) return;
    }
    const h = FORMS[f.dataset.f];
    if (h) h(f);
  });
  document.addEventListener("focusin", (e) => {
    _pp().handlePhoneScopeFocus(e && e.target);
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (EGE.views.messenger && typeof EGE.views.messenger.handleInput === "function") {
      if (EGE.views.messenger.handleInput(el)) return;
    }
    if (_pp().handlePhoneScopeInput(el)) return;
    const inpAct = (el && el.dataset && el.dataset.a) || "";
    if (inpAct && inpAct.indexOf("tc-") === 0 && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleInput === "function") {
      if (EGE.views.tutorCabinet.handleInput(el)) return;
    }
    if ((inpAct === "mkt-bk-q" || inpAct === "study-sched-q" || inpAct === "study-chats-q") && EGE.views.marketplace && typeof EGE.views.marketplace.handleInput === "function") {
      if (EGE.views.marketplace.handleInput(el)) return;
    }
    if ((inpAct === "bb-admin-tbl-q" || inpAct === "bb-dual-tbl-q" || el.id === "bb-admin-tbl-q" || el.id === "bb-dual-tbl-q") && EGE.views.brandbook && typeof EGE.views.brandbook.handleInput === "function") {
      if (EGE.views.brandbook.handleInput(el, ui, { render: () => scheduleRender() })) return;
    }
    if (el && el.dataset && (el.dataset.tc || el.dataset.tcStudent) && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleInput === "function") {
      if (EGE.views.tutorCabinet.handleInput(el)) return;
    }
    if (el && el.dataset && el.dataset.tcPayout && ui.payoutModal) {
      const k = el.dataset.tcPayout;
      if (k === "phone" || k === "card") {
        if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleInput === "function") {
          EGE.views.tutorCabinet.handleInput(el);
        }
      }
      if (k === "npdReceipt") ui.payoutModal.npdReceipt = !!el.checked;
      else if (k === "inn") {
        el.value = String(el.value || "").replace(/\D+/g, "").slice(0, 12);
        ui.payoutModal.inn = el.value;
        ui.payoutModal.innCheck = null;
      }
      else ui.payoutModal[k] = el.value;
      ui.payoutModal.error = "";
      if (k === "card") {
        const meta = detectCardMeta(el.value);
        if (typeof document.getElementById === "function") {
          const brandEl = document.getElementById("tc-payout-card-brand");
          if (brandEl) brandEl.innerHTML = cardNetHTML(meta.brand, { height: 18, tone: "dark" });
          const bankEl = document.getElementById("tc-payout-card-bank");
          if (bankEl) bankEl.textContent = meta.bankName || "";
          const boxEl = document.getElementById("tc-payout-card-box");
          if (boxEl && typeof boxEl.setAttribute === "function") boxEl.setAttribute("data-bank", meta.bankTheme || "default");
          const tileNet = document.getElementById("tc-payout-tile-net");
          if (tileNet) tileNet.innerHTML = cardNetHTML(meta.brand === "Карта РФ" ? "МИР" : meta.brand, { height: 15, tone: "light", defaultMir: true });
          const tileTitle = document.getElementById("tc-payout-tile-title");
          if (tileTitle) tileTitle.textContent = meta.bankName || "Карта РФ";
        }
      }
      if (k === "amount") {
        const subBtn = typeof document.querySelector === "function" ? document.querySelector('[data-f="tc-payout"] button[type="submit"]') : null;
        const amt = Math.max(0, Math.round(Number(el.value) || 0));
        if (subBtn) subBtn.textContent = "Вывести " + amt.toLocaleString("ru-RU") + " ₽";
      }
      return;
    }
    if (el.id === "bb-mask-phone" || el.id === "bb-mask-tg" || el.id === "bb-mask-max") {
      const bb = bbState();
      if (el.id === "bb-mask-phone") {
        const raw = String(el.value || "");
        const digits = raw.replace(/\D+/g, "");
        const fmtP = EGE.kit && EGE.kit.formatPhoneMask;
        const nextVal = (typeof fmtP === "function" && digits.length >= 10) ? (fmtP(raw) || raw) : raw;
        if (el.value !== nextVal) el.value = nextVal;
        bb.maskPhone = nextVal;
      } else if (el.id === "bb-mask-tg") {
        bb.maskTg = String(el.value || "");
      } else {
        bb.maskMax = String(el.value || "");
      }
      if (!patchMaskTrainerDOM()) scheduleRender();
      return;
    }
    if (el.id === "subj-q") { ui.subjQ = el.value; scheduleRender(); return; }
    if (el.id === "guide-q") { ui.guideQ = el.value; scheduleRender(); return; }
    if (el.id === "mkt-q" || el.id === "mkt-q-modal") {
      if (typeof document !== "undefined" && document.body && document.body.classList && document.body.classList.contains("is-land-white")) {
        ui.landWhiteStage = true;
        ui.landWhiteLockUntil = Math.max(Number(ui.landWhiteLockUntil) || 0, Date.now() + 700);
      }
      mkt().q = el.value;
      ui.mktVisibleCount = 8;
      saveMkt();
      scheduleRender();
      return;
    }
    if (el.id === "mkt-subj-q") {
      ui.filterSubjQ = String(el.value || "");
      const listEl = typeof document !== "undefined" && document.getElementById ? document.getElementById("mkt-subj-picker-list") : null;
      const clearEl = typeof document !== "undefined" && document.getElementById ? document.getElementById("mkt-subj-q-clear") : null;
      if (listEl && EGE.views && EGE.views.marketplace && typeof EGE.views.marketplace.filterSubjListHTML === "function") {
        listEl.innerHTML = EGE.views.marketplace.filterSubjListHTML();
        if (clearEl) {
          const hasQ = ui.filterSubjQ.length > 0;
          clearEl.hidden = !hasQ;
          if (hasQ) clearEl.removeAttribute("aria-hidden");
          else clearEl.setAttribute("aria-hidden", "true");
        }
      } else {
        renderModal();
      }
      return;
    }
    if (el.id === "hero-banner-q") { ui.heroQuickQ = el.value; return; }
    if (el.id === "bb-hero-demo-q") { bbState().heroQ = el.value; return; }
    if (el.id === "bb-catalog-q") { bbState().catQ = el.value; scheduleRender(); return; }
    if (el.id === "bb-tbl-q") { bbState().tableSearch = el.value; scheduleRender(); return; }
    if (el.id === "landing-q") { mkt().q = el.value; saveMkt(); return; }
    if (el.id === "bug-body") {
      if (ui.bug) {
        ui.bug.body = el.value;
        if (ui.bug.error) ui.bug.error = "";
        const a = document.getElementById("bug-mailto");
        if (a) a.href = bugMailtoHref(ui.bug);
      }
      return;
    }
    if (el.id === "bug-contact") {
      if (ui.bug) {
        ui.bug.contact = el.value;
        if (ui.bug.error) ui.bug.error = "";
      }
      return;
    }
    if (el.id === "coop-name" || el.id === "coop-contact" || el.id === "coop-body") {
      if (ui.coop) {
        if (el.id === "coop-name") ui.coop.name = el.value;
        else if (el.id === "coop-contact") ui.coop.contact = el.value;
        else ui.coop.body = el.value;
        if (ui.coop.error) ui.coop.error = "";
      }
      return;
    }
    if (el.id === "review-comment") {
      if (ui.reviewModal) ui.reviewModal.comment = el.value;
      return;
    }
    if (el.id === "dispute-comment") {
      if (ui.disputeModal) {
        ui.disputeModal.comment = el.value;
        if (ui.disputeModal.error) ui.disputeModal.error = "";
      }
      return;
    }
    if (el.id === "pf-city") { updateProfileCityField(el); return; }
    if (el.dataset && el.dataset.d) { ui.drafts[el.dataset.d] = el.value; return; }
    if (el.id === "ans") {
      const it = curItem(); if (!it) return;
      it.resp = el.value;
      saveActiveQuiz();
      const b = document.querySelector('[data-a="quiz-check"]'); if (b) b.disabled = !canCheck(it);
      return;
    }
    if (el.id === "self-text") { const it = curItem(); if (it && it.q.t === "self") { it.resp.text = el.value; saveActiveQuiz(); } return; }
    if (el.id === "chat-input") ui.chat.draft = el.value;
    if (el.id === "essay-body") { essayState().body = el.value; paintEssayCount(); essayDraftLater(); }
    if (el.id === "essay-src") { essayState().own.text = el.value; essayDraftLater(); }
    if (el.id === "essay-problem") { essayState().own.problem = el.value; essayDraftLater(); }
    if (el.id === "mkt-price-min" || el.id === "mkt-price-max") {
      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 5);
      if (el.value !== digits) el.value = digits;
      const st = mkt();
      const valNum = digits === "" ? 0 : Math.max(0, Math.min(99999, Number(digits)));
      if (el.id === "mkt-price-min") st.minPrice = valNum;
      else st.maxPrice = valNum;
      st.priceCustom = true;
      st.priceExplicit = true;
      ui.mktVisibleCount = 8;
      saveMkt();
      const mktMod = EGE.views && EGE.views.marketplace;
      const ro = typeof document.getElementById === "function" ? document.getElementById("filter-price-readout") : null;
      if (ro && mktMod && typeof mktMod.priceFilterLabel === "function") ro.textContent = mktMod.priceFilterLabel(st);
      const subBtn = typeof document.getElementById === "function" ? document.getElementById("filter-submit-btn") : null;
      if (subBtn && TDATA) {
        const list = (mktMod && typeof mktMod.filterAvailableTutors === "function")
          ? mktMod.filterAvailableTutors(st, TDATA.buildCalendarDays(7), TDATA)
          : TDATA.filterTutors(st, TDATA.buildCalendarDays(7));
        subBtn.textContent = `Показать ${list.length} ${plural(list.length, "репетитора", "репетиторов", "репетиторов")}`;
      }
      scheduleRender();
      return;
    }
    if (_pp().handleBalanceFieldInput(el)) return;
    if (el.id === "lead-price") { if (ui.leadDraft) ui.leadDraft.targetPrice = Number(el.value) || 1000; return; }
    if (el.id === "lead-comment") { if (ui.leadDraft) ui.leadDraft.comment = el.value; return; }
    if (el.id === "bid-price") {
      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 5);
      if (el.value !== digits) el.value = digits;
      if (ui.booking) {
        const next = digits === "" ? 0 : Math.max(0, Math.min(99999, Number(digits)));
        ui.booking.offerPrice = next;
        if (ui.booking.tutorId) {
          const cardOffers = ui.cardOffers || (ui.cardOffers = {});
          cardOffers[ui.booking.tutorId] = next;
        }
        updateBookingModalLive();
      }
      return;
    }
    if (el.id === "bid-custom-time") {
      if (ui.booking && isValidHHMM(el.value)) {
        ui.booking.hour = el.value;
        updateBookingModalLive();
      }
      return;
    }
    if (el.id === "demo-rate-inp") {
      const raw = parseInt(el.value, 10);
      if (Number.isFinite(raw)) {
        ui.demo.bidRate = Math.max(0, Math.min(99999, raw));
        if (!EGE.views.landing || typeof EGE.views.landing.patchDemoCalcDOM !== "function" || !EGE.views.landing.patchDemoCalcDOM()) {
          scheduleRender();
        }
      }
      return;
    }
    if (el.id === "hero-hour-range") {
      const hNum = Math.max(10, Math.min(20, parseInt(el.value, 10) || 10));
      if (!ui.motion) ui.motion = { playing: false, preset: "design", step: 0, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" };
      ui.motion.playing = false;
      stopMotionTimers();
      ui.motion.slot = (hNum < 10 ? "0" : "") + hNum + ":00";
      ui.motion.sent = false;
      ui.motion.step = 0;
      patchHeroMotionDOM({ liveOnly: true });
      return;
    }
    if (el.id === "mkt-hour-range") {
      const hNum = Math.max(10, Math.min(20, parseInt(el.value, 10) || 10));
      const hh = (hNum < 10 ? "0" : "") + hNum + ":00";
      if (el.style && typeof el.style.setProperty === "function") el.style.setProperty("--pct", ((hNum - 10) * 10) + "%");
      const pill = typeof document.getElementById === "function" ? document.getElementById("mkt-hour-pill") : null;
      if (pill) pill.textContent = hh;
      const mTicks = typeof document.getElementById === "function" ? document.getElementById("mkt-hour-ticks") : null;
      if (mTicks && typeof mTicks.querySelectorAll === "function") {
        mTicks.querySelectorAll("i").forEach((it) => {
          const tv = Number(it.getAttribute && it.getAttribute("data-tick")) || 0;
          if (it.classList) it.classList.toggle("on", tv === hNum);
        });
      }
      return;
    }
    if (el.id === "bid-hour-range") {
      if (ui.booking) {
        const hNum = Math.max(10, Math.min(20, parseInt(el.value, 10) || 10));
        ui.booking.hour = (hNum < 10 ? "0" : "") + hNum + ":00";
        updateBookingModalLive();
      }
      return;
    }
    if (el.id === "bb-vp-slider") {
      applyBrandbookViewport(el.value);
      return;
    }
    const BB_SLIDER_IDS = ["bb-hour-range", "bb-hour-range-dark", "bb-hour-range-mobile", "bb-hour-range-clean", "bb-hour-range-ticks", "bb-hour-range-ruler", "bb-hour-range-bounds", "bb-hour-range-resp"];
    if (BB_SLIDER_IDS.includes(el.id)) {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const hNum = Math.max(10, Math.min(20, parseInt(el.value, 10) || 14));
      bb.hour = hNum;
      const pct = ((hNum - 10) * 10) + "%";
      BB_SLIDER_IDS.forEach((rid) => {
        const node = typeof document.getElementById === "function" ? document.getElementById(rid) : null;
        if (node) {
          node.value = String(hNum);
          if (node.style && typeof node.style.setProperty === "function") node.style.setProperty("--pct", pct);
        }
      });
      const hhStr = String(hNum).padStart(2, "0") + ":00";
      const dObj = bbDayObj(bb.day || "all");
      const dPrefix = dObj.id === "all" ? "Сб" : dObj.wd;
      if (typeof document.querySelectorAll === "function") {
        document.querySelectorAll('[data-bb="hour"]').forEach((node) => { node.textContent = dPrefix + " · " + hhStr; });
        document.querySelectorAll('[data-bb="hour-short"]').forEach((node) => { node.textContent = hhStr; });
        document.querySelectorAll(".hh-slider-ticks").forEach((wrap) => {
          const isRuler = wrap.classList && wrap.classList.contains("ruler");
          wrap.querySelectorAll("i").forEach((it) => {
            const tv = Number(it.getAttribute && it.getAttribute("data-tick")) || 0;
            if (it.classList) it.classList.toggle("on", isRuler ? tv === hNum : Math.abs(tv - hNum) <= 1);
          });
        });
      }
      return;
    }
    if (el.id === "bid-note") { if (ui.booking) ui.booking.note = el.value; return; }
  });
  function updateProfileCityField(el) {
    if (!el) return;
    if (el.dataset && el.dataset.d) ui.drafts[el.dataset.d] = el.value;
    const tz = (EGE.views && EGE.views.progress && typeof EGE.views.progress.resolveCityTimezone === "function")
      ? EGE.views.progress.resolveCityTimezone(el.value)
      : "UTC+9";
    const noteEl = typeof document !== "undefined" && typeof document.getElementById === "function" ? document.getElementById("pf-city-tz-note") : null;
    if (noteEl) noteEl.innerHTML = `Автоматически меняем ваш часовой пояс к этому городу · <span class="num">${esc(tz)}</span>`;
  }
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el && el.dataset && (el.dataset.tcPhoto || el.dataset.tcIcsFile || el.dataset.tcDiplomaFile) && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleFileInput === "function") {
      if (EGE.views.tutorCabinet.handleFileInput(el)) return;
    }
    if (el && el.dataset && (el.dataset.tc || el.dataset.tcStudent) && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleInput === "function") {
      if (EGE.views.tutorCabinet.handleInput(el)) return;
    }
    if (el && el.dataset && el.dataset.tcPayout && ui.payoutModal) {
      const k = el.dataset.tcPayout;
      ui.payoutModal.error = "";
      if (k === "npdReceipt") {
        ui.payoutModal.npdReceipt = !!el.checked;
        renderModal();
        return;
      }
      if (k === "inn") {
        el.value = String(el.value || "").replace(/\D+/g, "").slice(0, 12);
        ui.payoutModal.inn = el.value;
        ui.payoutModal.innCheck = null;
      } else {
        ui.payoutModal[k] = el.value;
      }
      return;
    }
    if (el.id === "bb-mask-phone" || el.id === "bb-mask-tg" || el.id === "bb-mask-max") {
      const bb = bbState();
      const fmtP = EGE.kit && EGE.kit.formatPhoneMask;
      const fmtTg = EGE.kit && EGE.kit.formatTelegramContact;
      if (el.id === "bb-mask-phone") {
        const nextVal = typeof fmtP === "function" && el.value ? (fmtP(el.value) || el.value) : el.value;
        el.value = nextVal;
        bb.maskPhone = nextVal;
      } else if (el.id === "bb-mask-tg") {
        const nextVal = typeof fmtTg === "function" && el.value ? (fmtTg(el.value) || el.value) : el.value;
        el.value = nextVal;
        bb.maskTg = nextVal;
      } else {
        bb.maskMax = String(el.value || "").trim();
      }
      if (!patchMaskTrainerDOM()) scheduleRender();
      return;
    }
    if (el.id === "bb-vp-slider") { applyBrandbookViewport(el.value); return; }
    if (el.id === "mkt-max-price") { mkt().maxPrice = Number(el.value) || 2000; saveMkt(); scheduleRender(); return; }
    if (el.id === "mkt-hour-range") {
      const hNum = Math.max(10, Math.min(20, parseInt(el.value, 10) || 10));
      mkt().hour = (hNum < 10 ? "0" : "") + hNum + ":00";
      saveMkt();
      scheduleRender();
      return;
    }
    if (el.id === "bid-hour-range") {
      if (ui.booking) {
        const hNum = Math.max(10, Math.min(20, parseInt(el.value, 10) || 10));
        ui.booking.hour = (hNum < 10 ? "0" : "") + hNum + ":00";
        updateBookingModalLive();
      }
      return;
    }
    if (_pp().handleBalanceFieldInput(el)) return;
    if (el.id === "lead-price") { if (ui.leadDraft) ui.leadDraft.targetPrice = Number(el.value) || 1000; return; }
    if (el.id === "lead-comment") { if (ui.leadDraft) ui.leadDraft.comment = el.value; return; }
    if (el.id === "bid-price") {
      if (ui.booking) {
        const raw = parseInt(el.value, 10);
        const next = Number.isFinite(raw) ? Math.max(0, Math.min(99999, raw)) : (ui.booking.offerPrice != null ? Number(ui.booking.offerPrice) : 1000);
        ui.booking.offerPrice = next;
        if (ui.booking.tutorId && ui.booking.mode !== "trial") {
          const cardOffers = ui.cardOffers || (ui.cardOffers = {});
          cardOffers[ui.booking.tutorId] = next;
        }
        el.value = String(next);
        updateBookingModalLive();
      }
      return;
    }
    if (el.id === "bid-custom-time") {
      if (ui.booking && isValidHHMM(el.value)) {
        ui.booking.hour = el.value;
        updateBookingModalLive();
      }
      return;
    }
    if (el.id === "pf-city") { updateProfileCityField(el); return; }
    if (el.dataset && el.dataset.d) { ui.drafts[el.dataset.d] = el.value; return; }
    if (el.dataset && el.dataset.c === "todo") { toggleTodo(el.dataset.id, el.dataset.custom === "1", el.checked); return; }
    if (el.dataset && el.dataset.c === "self-sum") { // отметки в итогах полного варианта
      const it = ui.quiz && ui.quiz.items[Number(el.dataset.k)]; if (!it || it.q.t !== "self") return;
      const i = Number(el.dataset.i), k = it.resp.sel.indexOf(i);
      if (el.checked && k < 0) it.resp.sel.push(i); else if (!el.checked && k >= 0) it.resp.sel.splice(k, 1);
      it.res = grade(it);
      if (ui.quiz.mockId) saveVariantMock(ui.quiz, true);
      else ui.quiz.saved = false;
      scheduleRender(); return;
    }
    if (el.dataset && el.dataset.c === "self-el") {
      const it = curItem(); if (!it || it.q.t !== "self") return;
      const i = Number(el.dataset.i), k = it.resp.sel.indexOf(i);
      if (el.checked && k < 0) it.resp.sel.push(i); else if (!el.checked && k >= 0) it.resp.sel.splice(k, 1);
      it.res = grade(it); saveActiveQuiz(); scheduleRender(); return;
    }
    if (el.dataset && el.dataset.c === "essay-check") { essayState().checks[el.dataset.i] = el.checked; scheduleRender(); return; }
    if (el.id === "pf-photo-file" && el.files && el.files[0]) {
      if (EGE.views.progress && typeof EGE.views.progress.handleProfilePhotoFile === "function") {
        EGE.views.progress.handleProfilePhotoFile(el);
      }
      el.value = "";
      return;
    }
    if (el.id === "bug-files" && el.files && el.files.length) {
      if (ui.bug) {
        mergeFeedbackFiles(ui.bug, el.files);
        el.value = "";
        renderModal();
      }
      return;
    }
    if (el.id === "coop-files" && el.files && el.files.length) {
      if (ui.coop) {
        mergeFeedbackFiles(ui.coop, el.files);
        el.value = "";
        renderModal();
      }
      return;
    }
    if ((el.id === "mc-files" || el.id === "comm-chat-files") && el.files && el.files.length) {
      if (EGE.views.messenger && typeof EGE.views.messenger.handleFileChange === "function") {
        EGE.views.messenger.handleFileChange(el);
      }
      el.value = "";
      return;
    }
    if (el.id === "import-file" && el.files && el.files[0]) { readImport(el.files[0]); el.value = ""; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.target && e.target.dataset && e.target.dataset.otpIdx != null && e.key === "Backspace") {
      const idx = Number(e.target.dataset.otpIdx);
      if (!e.target.value && idx > 0 && typeof document !== "undefined" && document.getElementById) {
        const prev = document.getElementById("cv-d" + (idx - 1));
        if (prev) {
          prev.value = "";
          if (ui.contactVerifyModal && Array.isArray(ui.contactVerifyModal.digits)) ui.contactVerifyModal.digits[idx - 1] = "";
          if (typeof prev.focus === "function") prev.focus();
        }
      }
      return;
    }
    if (e.key === "Escape" && closeSelectMenus(null)) {
      scheduleRender();
    }
    if (e.key === "Escape" && EGE.views.messenger && typeof EGE.views.messenger.closeLightbox === "function" && EGE.views.messenger.closeLightbox()) {
      e.preventDefault();
      return;
    }
    if (e.key === "Escape" && (ui.bug || ui.notifModal || ui.cookieModal || ui.booking || ui.reviewsModal || ui.reviewModal || ui.disputeModal || ui.authModal || ui.contactVerifyModal || ui.cardBindModal || ui.filterModal || ui.bbModal || ui.tutorApplyModal || ui.coopModal || ui.balanceModal || ui.payoutModal)) {
      e.preventDefault();
      dismissActiveModal();
      return;
    }
    if (e.target && e.target.id === "mkt-subj-q" && e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (TDATA && typeof TDATA.searchDirections === "function") {
        const res = TDATA.searchDirections(ui.filterSubjQ, mkt().exam);
        if (res.exactMatch && mkt().exam === "all") {
          mkt().subject = res.exactMatch.id;
          ui.filterSubjQ = "";
          ui.mktVisibleCount = 8;
          saveMkt();
          renderModal();
          scheduleRender();
          return;
        }
        if (res.normalizedQuery.length >= 2 && mkt().exam === "all" && ACTIONS["mkt-subj-add"]) {
          ACTIONS["mkt-subj-add"]({ dataset: { v: res.rawQuery } });
          return;
        }
      }
      return;
    }
    if (ui.bug || ui.notifModal || ui.booking || ui.authModal || ui.contactVerifyModal || ui.cardBindModal || ui.filterModal || ui.bbModal || ui.tutorApplyModal || ui.coopModal || ui.balanceModal || ui.payoutModal || ui.tutorContactModal) return;
    if (e.target && e.target.id === "chat-input" && e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(ui.chat.draft); return; }
    if (ui.view !== "quiz" || !ui.quiz || ui.quiz.done || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && e.target.id === "self-text") return; // в поле развёрнутого ответа Enter — перенос строки
    const qz = ui.quiz, it = curItem();
    const tag = (e.target.tagName || "").toLowerCase();
    if (e.key === "Enter" && !e.shiftKey) {
      const a = e.target.dataset ? e.target.dataset.a : null;
      if (tag === "button" && a && !["pick", "match", "ord", "quiz-check", "quiz-next"].includes(a)) return;
      e.preventDefault();
      if (qz.checked) doNext(); else doCheck();
      return;
    }
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (!qz.checked && it && (it.q.t === "single" || it.q.t === "multi") && /^[1-9]$/.test(e.key)) {
      const pos = Number(e.key) - 1;
      if (pos < it.view.length) { e.preventDefault(); ACTIONS.pick({ dataset: { i: String(it.view[pos]) } }); }
    }
  });

  window.addEventListener("hashchange", () => { readHash(); scheduleRender(true); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") { refreshBackendDocs(); syncHeroMotion(); }
    else stopMotionTimers();
  });

  function readQueryError() {
    try {
      if (typeof URLSearchParams !== "function" || !location.search) return;
      const sp = new URLSearchParams(location.search);
      const code = sp.get("auth_error");
      if (!code) return;
      const map = {
        google_denied: "Вход через Google отменён.",
        oauth_state: "Сессия входа через Google устарела. Попробуй ещё раз.",
        oauth_exchange: "Не удалось завершить вход через Google. Попробуй ещё раз.",
        oauth_profile: "Google не передал данные профиля.",
        user_limit: "Достигнут лимит аккаунтов на этом сервере.",
        invalid_email: "У аккаунта Google указан некорректный email.",
        oauth_failed: "Ошибка при входе через Google. Попробуй ещё раз.",
        telegram_not_configured: "Вход через Telegram Login Widget не настроен на сервере.",
        telegram_expired: "Срок авторизации через Telegram истёк. Попробуй ещё раз.",
        telegram_invalid: "Не удалось проверить подпись Telegram Login. Попробуй ещё раз."
      };
      ui.auth.error = map[code] || "Не удалось выполнить вход.";
      if (!pendingAutoAuth) {
        pendingAutoAuth = {
          tab: "login",
          role: HOST_SITE === "tutor" ? "tutor" : (HOST_SITE === "student" ? "student" : ""),
          keepError: true
        };
      } else {
        pendingAutoAuth.keepError = true;
      }
      sp.delete("auth_error");
      const q = sp.toString();
      history.replaceState(null, "", (location.pathname || "/") + (q ? "?" + q : "") + (location.hash || ""));
    } catch (e) { /* игнор */ }
  }
  function readAuthQuery() {
    try {
      if (!location || !location.search) return;
      let authMode = "";
      let reqRole = "";
      if (typeof URLSearchParams === "function") {
        const sp = new URLSearchParams(location.search);
        authMode = String(sp.get("auth") || "").trim().toLowerCase();
        reqRole = String(sp.get("role") || "").trim().toLowerCase();
        if (authMode !== "register" && authMode !== "login") return;
        const targetRole = (reqRole === "tutor" || reqRole === "student")
          ? reqRole
          : (HOST_SITE === "tutor" || HOST_SITE === "student" ? HOST_SITE : "");
        pendingAutoAuth = { tab: authMode, role: targetRole };
        sp.delete("auth");
        sp.delete("role");
        const q = sp.toString();
        history.replaceState(null, "", (location.pathname || "/") + (q ? "?" + q : "") + (location.hash || ""));
      } else {
        const am = /(?:^\?|&)auth=(register|login)(?:&|$)/i.exec(location.search);
        if (!am) return;
        authMode = am[1].toLowerCase();
        const rm = /(?:^\?|&)role=(tutor|student)(?:&|$)/i.exec(location.search);
        reqRole = rm ? rm[1].toLowerCase() : "";
        const targetRole = (reqRole === "tutor" || reqRole === "student")
          ? reqRole
          : (HOST_SITE === "tutor" || HOST_SITE === "student" ? HOST_SITE : "");
        pendingAutoAuth = { tab: authMode, role: targetRole };
      }
    } catch (e) { /* игнор */ }
  }

  const appCtx = {
    CONTENT, DEFAULT_TARGETS, DIAG_PLAN_ID, EGE, EGEPayments, INTERVALS, LETTERS, MAX_Q_MS,
    MOTION_PRESETS, QUIZ_SIZE, SUBJ, SUBJECTS, SUBJECT_META, SUBJECT_NAME, ALL_STUDY_SUBJECTS, STUDY_SUBJ_MAP, TDATA, TOPIC_QUIZ, TOPICS, QS,
    accountCard, ai, avatarHTML, caps, clearActiveQuiz, cloud, codeLabel, completePlanFromQuiz,
    defaultMarketState, defaultName, draft, dueQs, findPlanItem, firstSubject, formatAvg,
    getThemeMode: () => themeMode, go, hash, heroMotionMeta, localNotice, markPlanPrep,
    minutesByDay, mistakeQs, mkt, mocks, needsPrepSetup, nextExam, notifySide, patchDoc, patchHeroMotionDOM,
    patchSavingsDOM, phoneFieldHTML, planDoc, planItems, profile, prog, pushNotification, clearNotificationsForThread, questionAttemptBreakdown, renderModal,
    isUserAuthenticated, requireAuthForBid, isDevDemoMode, selectedStudySubjects, selectedContentSubjects,
    replaceDoc, saveActiveQuiz, saveMkt, scheduleRender, sessions, staleNotice, startServerTopup, stepBtn,
    stopMotionTimers, store, subjSelect, subjectAccuracy, subjectReadCount, subjectStats,
    tile, toast, todoItem, topicRef, topicStats, totals, ui, updateBookingModalLive, writeHash, renderMiniChatDock
  };
  if (EGE.phonePay) {
    EGE.phonePay.configure({
      TDATA,
      store,
      isDevDemoMode,
      backendReq,
      ui,
      mkt,
      saveMkt,
      profile,
      draft,
      renderModal,
      scheduleRender,
      notifySide,
      toast
    });
    EGE.phonePay.registerActions(ACTIONS);
    EGE.phonePay.registerForms(FORMS);
  }
  if (EGE.gestures && typeof EGE.gestures.bind === "function") {
    EGE.gestures.bind({
      ui,
      openTutorContactModal,
      dismissActiveModal,
      dismissSideToast,
      resetToastTimer: (node) => { clearTimeout(toastTimer); toastTimer = setTimeout(() => dismissSideToast(node), 2600); },
      clearToastTimer: () => clearTimeout(toastTimer),
      bbState,
      scheduleRender
    });
  }
  EGE.views.trainer.configure(appCtx);
  EGE.views.trainer.registerActions(ACTIONS);
  EGE.views.essayGuide.configure(appCtx);
  EGE.views.essayGuide.registerActions(ACTIONS);
  EGE.views.progress.configure(appCtx);
  EGE.views.progress.registerActions(ACTIONS);
  if (EGE.views.messenger) {
    EGE.views.messenger.configure(appCtx);
    EGE.views.messenger.registerActions(ACTIONS);
    EGE.views.messenger.registerForms(FORMS);
  }
  if (EGE.realtime && typeof EGE.realtime.onEvent === "function") {
    EGE.realtime.onEvent((evt) => {
      if (evt && (evt.eventType === "chat.message" || evt.eventType === "chat.read" || evt.eventType === "market.telemost.updated") && EGE.views.messenger && typeof EGE.views.messenger.onRealtimeEvent === "function") {
        EGE.views.messenger.onRealtimeEvent(evt);
      }
    });
  }
  EGE.registerMarketBbActions(appCtx, ACTIONS);
  try {
    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("message", (ev) => {
        if (ev && ev.data && ev.data.type === "vektor:set-theme") {
          setTheme(ev.data.theme === "light" ? "light" : "dark", true);
        }
      });
      window.addEventListener("popstate", () => {
        if (typeof location !== "undefined" && location.pathname && (location.pathname === "/brandbook" || location.pathname.indexOf("/brandbook/") === 0)) {
          const subApi = EGE.brandbookSubsites;
          const slug = location.pathname === "/brandbook" ? "hub" : location.pathname.slice("/brandbook/".length);
          const parsed = subApi && typeof subApi.parseSubsiteInput === "function"
            ? subApi.parseSubsiteInput(slug)
            : { subsite: slug || "hub", deviceView: null };
          if (!ui.brandbook) ui.brandbook = {};
          ui.brandbook.subsite = parsed.subsite;
          if (parsed.deviceView) ui.brandbook.deviceView = parsed.deviceView;
          ui.view = "brandbook";
          scheduleRender(true);
        }
      });
    }
  } catch (e) { /* игнор */ }
  // ---------- запуск ----------
  readHash();
  readQueryError();
  readAuthQuery();
  readCookieConsent();
  render();
  initData();
  initCaps();
})();
