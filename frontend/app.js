/* Вектор ЕГЭ — логика сайта.
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
  const INTERVALS = [0, 1, 3, 7, 14, 30, 60]; // дни до повторения по «коробкам»
  const LS_KEY = "vektor-ege:v1";
  const LEGACY_LS_KEY = "put-v-medicinu:v1";
  const ACTIVE_QUIZ_LS = "vektor-ege:active-quiz";
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
  const { ICONS, icon, BRAND_MARK_HTML, BRAND_WORDMARK_HTML, brandLockupHTML, GOOGLE_SVG, triggerIconTileAnim } = EGE.ui;
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
  function topicRef(t) { return (SUBJ[t.sid].ref || "") + t.code + " " + t.title; }
  function codeLabel(t) { return (SUBJ[t.sid].codeName || "Тема") + " " + t.code; }

  // ---------- хранилище ----------
  const DOC_NAME_RE = /^(profile|plan|mocks|essays|prog-[a-z]+|log-\d{4}-\d{2})$/;
  const store = {
    mode: "loading", // loading | cloud | local
    backend: !!(window.EGE_HOST && window.EGE_HOST.backend),
    user: null,
    authProviders: { local: true, google: false },
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
  function startLocal() {
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
    saveLocal();
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
  async function loadBackendSession(user) {
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
    scheduleRender();
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
  async function initBackend() {
    try {
      const me = await backendReq("/api/me");
      store.backendAi = (me && me.ai) || { enabled: false, provider: null };
      store.authProviders = (me && me.providers) || { local: true, google: false };
      store.inviteRequired = !!(me && me.inviteRequired);
      if (me && me.user) {
        try {
          await loadBackendSession(me.user);
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
  function examDefaults() { const o = {}; (EGE.exams || []).forEach((e) => { o[e.subject] = e.date; }); return o; }
  function profile() {
    const p = store.docs.profile || {};
    return {
      exists: !!store.docs.profile,
      name: p.name || "",
      targets: Object.assign({}, DEFAULT_TARGETS, p.targets || {}),
      exams: Object.assign({}, examDefaults(), p.exams || {})
    };
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
    return (EGE.exams || []).map((e) => ({ subject: e.subject, name: e.name, date: prof.exams[e.subject] || e.date }))
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
    applyTheme();
    scheduleRender();
    if (!silent) toast(themeMode === "dark" ? "Включена тёмная тема" : themeMode === "light" ? "Включена светлая тема" : "Тема как в системе");
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
    if (hostSite === "student" || hostSite === "tutor" || hostSite === "admin" || hostSite === "brandbook") return hostSite;
    try {
      const p = typeof location !== "undefined" && location.pathname ? location.pathname : "/";
      if (p === "/student") return "student";
      if (p === "/tutor" || p === "/teacher" || p === "/cabinet" || p === "/fees") return "tutor";
      if (p === "/admin") return "admin";
      if (p === "/brandbook" || p.indexOf("/brandbook/") === 0) return "brandbook";
    } catch (e) { /* игнор */ }
    return "";
  }
  const HOST_SITE = resolveHostSite();
  const ROLE_LS = "vektor-ege:role";
  function readRolePref() {
    try { const v = localStorage.getItem(ROLE_LS); if (v === "tutor" || v === "student" || v === "admin") return v; } catch (e) { /* недоступно */ }
    return "student";
  }
  function setRolePref(role, silent) {
    const next = role === "tutor" ? "tutor" : role === "admin" ? "admin" : "student";
    ui.role = next;
    try { localStorage.setItem(ROLE_LS, next); } catch (e) { /* недоступно */ }
    if (!silent) toast(next === "tutor" ? "Включён кабинет преподавателя" : next === "admin" ? "Включена админ-панель" : "Включён режим ученика");
  }

  // ---------- состояние интерфейса ----------
  const INITIAL_ROLE = (HOST_SITE === "student" || HOST_SITE === "tutor" || HOST_SITE === "admin")
    ? HOST_SITE
    : readRolePref();
  const INITIAL_VIEW = HOST_SITE === "tutor"
    ? (((typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.view === "fees") || (typeof location !== "undefined" && location.pathname === "/fees")) ? "fees" : "cabinet")
    : (HOST_SITE === "admin" ? "admin" : (HOST_SITE === "brandbook" ? "brandbook" : "tests"));
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
    auth: { tab: "login", busy: false, error: "" },
    authModal: false,
    filterModal: false,
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
    bug: null,
    booking: null,
    balanceModal: null,
    payoutModal: null,
    leadDraft: { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, scheduleNote: "", whatsapp: "", comment: "" },
    market: null,
    demo: { tab: "quiz", sid: firstSubject.id, qIdx: 0, pick: null, revealed: false, topicIdx: 0, bidRate: 1000, bidHour: "10:00" },
    motion: { playing: true, preset: "design", step: 0, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" },
    savings: { freq: 2, marketRate: 1350, offerRate: 1000 },
    bbModal: false,
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
      maxPrice: 2000,
      onlyBumped: false,
      sort: "actual",
      day: "all",
      hour: "all",
      favs: [],
      bookings: []
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
    "tutor-calendar": "calendar",
    "tutor-students": "students",
    "tutor-leads": "leads",
    "tutor-profile": "profile"
  };
  const ADMIN_TAB_VIEWS = {
    "admin-overview": "overview",
    "admin-requests": "requests",
    "admin-tutors": "tutors",
    "admin-payouts": "payouts",
    "admin-system": "system"
  };

  function go(v, opts) {
    opts = opts || {};
    if (TUTOR_TAB_VIEWS[v]) {
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab(TUTOR_TAB_VIEWS[v]);
      v = "cabinet";
    } else if (v === "cabinet" && opts.fromNav) {
      if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setTab === "function") EGE.views.tutorCabinet.setTab("requests");
    } else if (ADMIN_TAB_VIEWS[v]) {
      if (EGE.views.admin && typeof EGE.views.admin.setTab === "function") EGE.views.admin.setTab(ADMIN_TAB_VIEWS[v]);
      v = "admin";
    } else if (v === "admin" && opts.fromNav) {
      if (EGE.views.admin && typeof EGE.views.admin.setTab === "function") EGE.views.admin.setTab("overview");
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
    if (v === "essay") ui.sid = "rus";
    ui.view = v;
    ui.confirm = null; ui.confirmDel = null; ui.exportText = ""; ui.auth.error = "";
    writeHash();
    if (v === "admin" && store.backend && EGE.views.admin && typeof EGE.views.admin.loadData === "function") {
      EGE.views.admin.loadData(false);
    }
    scheduleRender(true);
  }
  function readHash() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (HOST_SITE === "student" || HOST_SITE === "tutor" || HOST_SITE === "admin") {
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
      if (ADMIN_TAB_VIEWS[h]) {
        ui.role = "admin";
        if (EGE.views.admin && typeof EGE.views.admin.setTab === "function") EGE.views.admin.setTab(ADMIN_TAB_VIEWS[h]);
        ui.view = "admin";
        return;
      }
      if (h === "admin") { ui.role = "admin"; ui.view = "admin"; return; }
      if (["home", "tests", "study", "plan", "stats", "tutor", "cabinet", "market", "landing", "brandbook", "fees", "admin", "profile"].includes(h)) { ui.view = h; return; }
    }
    try {
      if (!h && typeof location !== "undefined") {
        if (location.pathname === "/brandbook" || (location.pathname && location.pathname.indexOf("/brandbook/") === 0) || HOST_SITE === "brandbook") { ui.view = "brandbook"; return; }
        if (location.pathname === "/fees" || (typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.view === "fees")) {
          if (HOST_SITE === "tutor") ui.role = "tutor";
          ui.view = "fees";
          return;
        }
        if (location.pathname === "/landing") { ui.view = "landing"; return; }
        if (location.pathname === "/admin" || HOST_SITE === "admin") { ui.role = "admin"; ui.view = "admin"; return; }
        if (HOST_SITE === "tutor") { ui.role = "tutor"; ui.view = "cabinet"; return; }
        if (HOST_SITE === "student") { ui.role = "student"; ui.view = "tests"; return; }
      }
    } catch (e) { /* игнор */ }
    if (!h && typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.landing) ui.view = "landing";
  }
  function applyPostAuthView() {
    if (HOST_SITE === "student" || HOST_SITE === "tutor" || HOST_SITE === "admin") {
      ui.role = HOST_SITE;
    }
    if (ui.role === "admin") {
      ui.view = "admin";
      writeHash();
      if (store.backend && EGE.views.admin && typeof EGE.views.admin.loadData === "function") {
        EGE.views.admin.loadData(false);
      }
      return;
    }
    if (ui.role === "tutor") {
      if (!["cabinet", "fees", "tutor"].includes(ui.view)) ui.view = "cabinet";
      writeHash();
      return;
    }
    if (ui.view !== "market") ui.view = "tests";
    writeHash();
  }
  function writeHash() {
    if (HOST_SITE === "brandbook" && ui.view === "brandbook") return;
    const tcTab = ui.view === "cabinet" && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.getTab === "function" ? EGE.views.tutorCabinet.getTab() : "";
    const admTab = ui.view === "admin" && EGE.views.admin && typeof EGE.views.admin.getTab === "function" ? EGE.views.admin.getTab() : "";
    const tok = ui.view === "cabinet"
      ? ("tutor-" + (tcTab || "requests"))
      : (ui.view === "admin"
        ? ("admin-" + (admTab || "overview"))
        : (ui.view === "topic" ? ui.topicId : ui.view === "subject" ? ui.sid : ui.view === "quiz" ? null : ui.view));
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
  const VIEWS = { home: viewHome, tests: viewTests, study: viewStudy, subject: viewSubject, topic: viewTopic, quiz: viewQuiz, essay: viewEssay, plan: viewPlan, stats: viewStats, tutor: viewTutor, cabinet: viewCabinet, market: viewMarket, landing: viewLanding, brandbook: () => viewBrandbook({ inside: true }), fees: () => viewFees({ inside: true }), admin: viewAdmin, profile: viewProfile };
  function setAuthLayout(on) {
    try {
      if (document.body && document.body.dataset) {
        if (on) document.body.dataset.auth = "1";
        else delete document.body.dataset.auth;
      }
    } catch (e) { /* игнор */ }
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
      main.querySelectorAll(".cal-days, .bb-days-rail").forEach((rail, idx) => {
        if (rail.scrollLeft) savedScrollLefts.push([rail.classList.contains("bb-days-rail") ? ".bb-days-rail" : ".cal-days", idx, rail.scrollLeft]);
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
        ? (ui.view === "brandbook" ? viewBrandbook({ inside: false }) : ui.view === "fees" ? viewFees({ inside: false }) : authScreen())
        : `<div class="auth-wrap"><div class="auth-brand">${brandLockupHTML()}<p class="muted">Подключаюсь к серверу…</p></div></div>`;
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
      const rails = main.querySelectorAll(".cal-days, .bb-days-rail");
      savedScrollLefts.forEach(([, idx, val]) => {
        if (rails[idx]) rails[idx].scrollLeft = val;
      });
    }
    if (scrollTopPending) { scrollTopPending = false; window.scrollTo(0, 0); }
    else if (savedScrollY !== null && typeof window !== "undefined" && typeof window.scrollTo === "function" && window.scrollY !== savedScrollY) {
      window.scrollTo(0, savedScrollY);
    }
    lastRenderedView = ui.view;
    syncHeroMotion();
  }
  const BUG_EMAIL = "willagegg@gmail.com";
  const VIEW_LABELS = { home: "Тесты", tests: "Тесты", study: "Учёба", subject: "Предмет", topic: "Тема", quiz: "Тест", plan: "План поступления", stats: "Показатели", tutor: "Справочник", cabinet: "Кабинет преподавателя", essay: "Сочинение", market: "Репетиторы", landing: "О сервисе и тарифы", brandbook: "Брендбук и UI Kit", fees: "Оплата и сервисный сбор", profile: "Настройки" };
  function bugMailtoHref(bug) {
    return `mailto:${BUG_EMAIL}?subject=${encodeURIComponent(bug.subject)}&body=${encodeURIComponent(bug.body)}`;
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
        subject: `Баг в задании ${qNum ? "№" + qNum : q.id} (${subjName}) — Вектор ЕГЭ`,
        body: [
          "Здравствуйте! Нашёл(ла) ошибку в «Вектор ЕГЭ».",
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
      subject: `Баг на сайте (${viewName}) — Вектор ЕГЭ`,
      body: [
        "Здравствуйте! Нашёл(ла) ошибку на сайте «Вектор ЕГЭ».",
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
  function balanceTopWidgetHTML(compact) {
    const st = mkt();
    if (EGE.kit && typeof EGE.kit.topBalanceWidgetHTML === "function") {
      return EGE.kit.topBalanceWidgetHTML({
        role: "student",
        amountRub: st.balance,
        compact: !!compact,
        pillAction: "bal-open",
        btnAction: "bal-open"
      });
    }
    const funded = (Number(st.balance) || 0) >= 5000;
    return `<div class="top-bal-wrap" aria-label="Баланс ученика">
      <button type="button" class="top-bal-pill${funded ? " is-funded" : ""}" data-a="bal-open" title="Баланс и тарифы">
        ${icon("wallet")}
        ${compact ? "" : `<span class="top-bal-lbl muted">Баланс:</span>`}
        <b class="num">${st.balance.toLocaleString("ru-RU")} ₽</b>
      </button>
      <button type="button" class="top-bal-btn" data-a="bal-open" aria-label="Пополнить баланс" title="Пополнить баланс">${icon("plus")}<span>Пополнить</span></button>
    </div>`;
  }
  function balanceModalHTML() {
    const bm = ui.balanceModal;
    if (!bm) return "";
    const st = mkt();
    const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
    const minOk = (Number(st.balance) || 0) >= trialRub;
    const minTopup = st.initialPaid ? 100 : trialRub;
    const chipVals = st.initialPaid ? [100, 490, 1000, 4590] : [490, 2190, 4590, 8900];
    const plans = (TDATA && TDATA.PLANS) || [];
    const customVal = bm.customAmount != null ? String(bm.customAmount) : String(minTopup);
    const payProv = EGEPayments && EGEPayments.provider === "demo"
      ? "Только СБП (QR / банк без карт · 0% карточной наценки) · АЭБ, Сбер, Т-Банк, ВТБ"
      : `СБП-шлюз (${EGEPayments.provider}) · без карточных переплат`;
    const walletSummaryHTML = (EGE.kit && typeof EGE.kit.walletSummaryBarHTML === "function")
      ? EGE.kit.walletSummaryBarHTML({
          label: "Текущий баланс ученика (СБП-эскроу)",
          amountRub: st.balance,
          subNote: payProv,
          badge: { text: minOk ? "✓ СБП-баланс активен" : `Старт на уроки от ${trialRub} ₽`, cls: minOk ? "confirm" : "gold" }
        })
      : `<div class="wallet-bar">
          <div class="stack" style="gap:2px">
            <span class="small muted">Текущий баланс ученика (СБП-эскроу)</span>
            <span class="wallet-num num">${st.balance.toLocaleString("ru-RU")} ₽</span>
            <span class="small muted">${esc(payProv)}</span>
          </div>
          <span class="chip ${minOk ? "confirm" : "gold"}">${minOk ? "✓ СБП-баланс активен" : `Старт на уроки от ${trialRub} ₽`}</span>
        </div>`;
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="bal-modal-title">
      <div class="modal-card">
        <div class="modal-head">
          <div class="row" style="gap:8px">${icon("wallet")}<b id="bal-modal-title">Баланс и пополнение по СБП</b></div>
          <button type="button" class="icon-btn sm" data-a="bal-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        ${walletSummaryHTML}
        <div class="hh-notice-card" style="padding:12px 14px;gap:8px">
          <div class="row between" style="gap:6px;flex-wrap:wrap;align-items:center">
            <b class="small">Как работает СБП-оплата и защита баланса</b>
            <span class="chip confirm" style="font-size:11px">Только СБП · 0% за карты</span>
          </div>
          <span class="small ink2">Пополнение проходит напрямую по СБП (АЭБ, СберБанк, Т-Банк, ВТБ) и хранится на эскроу: преподаватель получает оплату только после занятия, контакты WA / TG / MAX открываются сразу после бронирования слота, а на пробном уроке 60 мин за ${trialRub.toLocaleString("ru-RU")} ₽ действует 100% гарантия бесплатной замены.</span>
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="small muted">Базовый расчёт: 5% сервис + 1% шлюз СБП</span>
            <button type="button" class="link-btn small" data-a="go-fees">Подробнее о СБП и сборе →</button>
          </div>
        </div>
        ${bm.reason ? `<div class="notice warn"><b>Требуется от ${trialRub} ₽ на балансе (СБП)</b><span class="small">${esc(bm.reason)}</span></div>` : `<p class="small ink2">${st.initialPaid ? "Баланс открыт: далее можно пополнять счёт по СБП на любую сумму от <b>100 ₽</b>. Средства бронируются поурочно." : `Для пробного урока 60 мин и откликов репетиторов старт от <b>${trialRub} ₽</b> по СБП (или «ИИ-Старт ЕГЭ» за <b>390 ₽/мес</b>). После старта доплаты от <b>100 ₽</b>.`}</p>`}
        <div class="stack" style="gap:8px">
          <span class="label">Тарифы запуска · оплата по СБП</span>
          <div class="bal-plan-grid">
            ${plans.map((p) => {
              const picked = st.planId === p.id;
              return `<div class="card pad stack" style="gap:8px;box-shadow:none${p.super ? ";border-color:var(--accent)" : ""}">
                <div class="row between" style="gap:4px">
                  <b class="small">${esc(p.name)}</b>
                  <span class="chip ${p.super ? "accent" : (p.kind === "ai" ? "pro" : (p.balance ? "gold" : ""))}" style="font-size:11px">${esc(p.badge)}</span>
                </div>
                <b class="num" style="font-size:19px">${esc(p.priceLabel)}</b>
                <span class="small muted">${esc(p.tagline)}</span>
                <button type="button" class="btn ${p.super || p.featured ? "" : "soft"} sm" data-a="bal-topup-preset" data-amount="${p.balance}" data-plan="${esc(p.id)}"${picked && st.initialPaid ? ' aria-current="true"' : ""}>Пополнить по СБП +${p.balance.toLocaleString("ru-RU")} ₽</button>
              </div>`;
            }).join("")}
          </div>
        </div>
        <form class="stack" style="gap:10px" data-f="bal-custom">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <label for="bal-custom-amount" class="label">Любая сумма по СБП (${st.initialPaid ? "от 100 ₽" : `первый платёж от ${trialRub} ₽`})</label>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${chipVals.map((v) => `<button type="button" class="chip-btn" data-a="bal-chip" data-v="${v}">${v.toLocaleString("ru-RU")} ₽</button>`).join("")}
            </div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <input class="input num" id="bal-custom-amount" name="amount" type="number" min="${minTopup}" max="200000" step="10" inputmode="numeric" value="${esc(customVal)}" placeholder="${st.initialPaid ? "От 100 ₽" : `От ${trialRub} ₽`}" style="flex:1 1 160px">
            <button type="submit" class="btn">${icon("wallet")}<span>Оплатить по СБП</span></button>
          </div>
          ${bm.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(bm.error)}</div>` : ""}
        </form>
      </div>
    </div>`;
  }
  function authModalHTML() {
    if (!ui.authModal) return "";
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-label="Вход в аккаунт">
      <div class="auth-modal-shell">${authCard({ modal: true })}</div>
    </div>`;
  }
  function tutorApplyModalHTML() {
    const ta = ui.tutorApply || (ui.tutorApply = { name: "", subject: "eng", rate: 1100, contact: "", error: "" });
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "eng", name: "Английский язык" }];
    const rate = Math.max(0, Math.min(99999, ta.rate != null ? Number(ta.rate) : 1100));
    const isPro = rate >= 1400;
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="ta-modal-title">
      <div class="modal-card">
        <div class="modal-head">
          <div class="row" style="gap:8px">${icon("users")}<b id="ta-modal-title">Разместить анкету преподавателя</b></div>
          <button type="button" class="icon-btn sm" data-a="tutor-apply-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
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
            <button type="submit" class="btn">Отправить анкету</button>
            <button type="button" class="btn ghost" data-a="tutor-apply-close">Отмена</button>
          </div>
        </form>
      </div>
    </div>`;
  }
  function renderModal() {
    const root = $("#modal-root");
    if (!root) return;
    const prevBack = typeof root.querySelector === "function" ? root.querySelector(".modal-back") : null;
    const prevCard = typeof root.querySelector === "function" ? root.querySelector(".modal-card") : null;
    const savedBackTop = prevBack ? prevBack.scrollTop : 0;
    const savedCardTop = prevCard ? prevCard.scrollTop : 0;
    const restoreModalScroll = () => {
      if (!savedBackTop && !savedCardTop) return;
      const nb = typeof root.querySelector === "function" ? root.querySelector(".modal-back") : null;
      const nc = typeof root.querySelector === "function" ? root.querySelector(".modal-card") : null;
      if (nb && savedBackTop) nb.scrollTop = savedBackTop;
      if (nc && savedCardTop) nc.scrollTop = savedCardTop;
    };
    if (ui.authModal) { root.innerHTML = authModalHTML(); restoreModalScroll(); return; }
    if (ui.payoutModal && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.payoutModalHTML === "function") {
      root.innerHTML = EGE.views.tutorCabinet.payoutModalHTML(ui.payoutModal);
      restoreModalScroll();
      return;
    }
    if (ui.balanceModal) { root.innerHTML = balanceModalHTML(); restoreModalScroll(); return; }
    if (ui.filterModal) { root.innerHTML = filterModalHTML(); restoreModalScroll(); return; }
    if (ui.booking) { root.innerHTML = bookingModalHTML(); restoreModalScroll(); return; }
    if (ui.tutorApplyModal) { root.innerHTML = tutorApplyModalHTML(); restoreModalScroll(); return; }
    if (ui.bbModal) {
      root.innerHTML = `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="bb-modal-title">
        <div class="modal-card">
          <div class="modal-head">
            <div class="row" style="gap:8px">${icon("cal")}<b id="bb-modal-title">Пример модального окна · Вектор ЕГЭ</b></div>
            <button type="button" class="icon-btn sm" data-a="bb-modal-close" aria-label="Закрыть">${icon("x")}</button>
          </div>
          <p class="small ink2">Единый каркас диалогов (<code>.modal-back</code> + <code>.modal-card</code>): ширина до 520 px, безопасный отступ 16 px по краям на телефоне, закрытие по кнопке <code>×</code> или клику по подложке.</p>
          <div class="field">
            <label for="bb-modal-inp">Пример поля ввода внутри модалки</label>
            <input class="input" id="bb-modal-inp" type="text" value="Биология · Суббота 14:00">
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn" data-a="bb-modal-close">Подтвердить</button>
            <button type="button" class="btn ghost" data-a="bb-modal-close">Закрыть</button>
          </div>
        </div>
      </div>`;
      return;
    }
    if (!ui.bug) { root.innerHTML = ""; return; }
    root.innerHTML = `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="bug-modal-title">
      <div class="modal-card">
        <div class="modal-head">
          <div class="row" style="gap:8px">${icon("bug")}<b id="bug-modal-title">${esc(ui.bug.title)}</b></div>
          <button type="button" class="icon-btn sm" data-a="bug-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="small muted">Получатель: <b>${BUG_EMAIL}</b> · Тема: ${esc(ui.bug.subject)}</div>
        <div class="field">
          <label for="bug-body">Готовый шаблон письма (можно дополнить перед отправкой)</label>
          <textarea class="input" id="bug-body" rows="9">${esc(ui.bug.body)}</textarea>
        </div>
        <div class="row" style="flex-wrap:wrap;gap:8px">
          <a class="btn" id="bug-mailto" href="${esc(bugMailtoHref(ui.bug))}" target="_blank" rel="noopener">${icon("bug")}<span>Написать на ${BUG_EMAIL}</span></a>
          <button type="button" class="btn soft" data-a="bug-copy">Скопировать шаблон</button>
          <button type="button" class="btn ghost" data-a="bug-close">Закрыть</button>
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
    if (url) return `<img src="${esc(url)}" alt="">`;
    return `<span class="avatar${lg ? " lg" : ""}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  function renderChrome() {
    const isTutor = ui.role === "tutor";
    const isAdmin = ui.role === "admin";
    const inTests = ["tests", "subject", "topic", "quiz", "essay", "home"].includes(ui.view);
    const inMarket = ui.view === "market" || ui.view === "landing";
    const inStudy = ui.view === "study" || ui.view === "plan";
    const bkCount = mkt().bookings.length;
    const tcPending = EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.pendingCount === "function"
      ? EGE.views.tutorCabinet.pendingCount()
      : 0;
    const tcTab = EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.getTab === "function"
      ? EGE.views.tutorCabinet.getTab()
      : "requests";
    const admTab = EGE.views.admin && typeof EGE.views.admin.getTab === "function"
      ? EGE.views.admin.getTab()
      : "overview";
    const sideNav = isAdmin
      ? [
          ["admin-overview", "Обзор", "chart", ui.view === "admin" && admTab === "overview", 0, ""],
          ["admin-requests", "Заявки и ученики", "list", ui.view === "admin" && admTab === "requests", 0, ""],
          ["admin-tutors", "Репетиторы", "users", ui.view === "admin" && admTab === "tutors", 0, ""],
          ["admin-payouts", "Выплаты НПД", "wallet", ui.view === "admin" && admTab === "payouts", 0, ""],
          ["admin-system", "Система и API", "shield", ui.view === "admin" && admTab === "system", 0, ""],
          ["brandbook", "Брендбук", "spark", ui.view === "brandbook", 0, ""]
        ]
      : isTutor
        ? [
            ["tutor-requests", "Заявки", "chat", ui.view === "cabinet" && tcTab === "requests", tcPending, "tc-jump-pending"],
            ["tutor-calendar", "Календарь учеников", "cal", ui.view === "cabinet" && tcTab === "calendar", 0, ""],
            ["tutor-students", "Мои ученики", "users", ui.view === "cabinet" && tcTab === "students", 0, ""],
            ["tutor-leads", "Ученики ищут", "search", ui.view === "cabinet" && tcTab === "leads", 0, ""],
            ["tutor-profile", "Профиль", "sliders", ui.view === "cabinet" && tcTab === "profile", 0, ""],
            ["fees", "Выплаты", "wallet", ui.view === "fees", 0, ""],
            ["tutor", "Справочник", "book", ui.view === "tutor", 0, ""]
          ]
        : [
            ["tests", "Тесты", "list", inTests, 0, ""],
            ["tutor", "Справочник", "book", ui.view === "tutor", 0, ""],
            ["market", "Репетиторы", "search", inMarket, 0, ""],
            ["study", "Учёба", "cal", inStudy, bkCount, ""],
            ["stats", "Показатели", "chart", ui.view === "stats", 0, ""]
          ];
    $("#side-nav").innerHTML = sideNav.map(([v, l, ic, cur, badge, badgeAct]) => {
      const btn = `<button type="button" class="nav-btn" data-a="go" data-v="${v}"${cur ? ' aria-current="page"' : ""}>${icon(ic)}<span style="flex:1">${l}</span>${badge && !badgeAct ? `<span class="chip ${isTutor ? "notif" : "accent"} num">${badge}</span>` : ""}</button>`;
      if (badge && badgeAct) {
        return `<div class="nav-row${cur ? " is-cur" : ""}">${btn}<button type="button" class="chip ${isTutor ? "notif" : "accent"} num side-badge-jump" data-a="${badgeAct}" title="Перейти к ожидающим заявкам (${badge})" aria-label="Открыть ожидающие заявки (${badge})">${badge}</button></div>`;
      }
      return btn;
    }).join("");
    const subjWrap = $("#side-subjects-wrap");
    if (subjWrap) subjWrap.hidden = isTutor || isAdmin;
    $("#side-subjects").innerHTML = (isTutor || isAdmin) ? "" : SUBJECTS.map((s) => {
      const cur = ["subject", "topic", "quiz", "essay"].includes(ui.view) && ui.sid === s.id && s.content;
      const right = s.content ? (store.ready ? subjectStats(s.id).pct + "%" : "") : "скоро";
      return `<button type="button" class="subj-btn" ${s.content ? `data-a="go" data-v="subject" data-sid="${s.id}"` : "disabled"}${cur ? ' aria-current="page"' : ""}><i class="dot" style="background:var(--c-${s.id})"></i><span>${esc(s.name)}</span><span class="small muted num">${right}</span></button>`;
    }).join("");
    const me = store.me, prof = profile();
    const nm = (store.user ? (prof.name || store.user.displayName || store.user.username) : "") || prof.name || (me && me.name) || (store.mode === "local" ? (store.backend ? "Гость" : "Этот браузер") : "");
    const dark = effectiveDark();
    const themeLabel = dark ? "Светлая тема" : "Тёмная тема";
    const tcMod = EGE.views.tutorCabinet;
    const hasHostSite = !!(HOST_SITE && ["student", "tutor", "admin", "brandbook"].includes(HOST_SITE));
    const sideBalHTML = isAdmin
      ? ""
      : isTutor
        ? ((tcMod && typeof tcMod.sideBalanceWidgetHTML === "function")
            ? tcMod.sideBalanceWidgetHTML()
            : (EGE.kit && typeof EGE.kit.sideTutorBalanceHTML === "function"
                ? EGE.kit.sideTutorBalanceHTML({ availableRub: 0, escrowRub: 0, action: "tc-payout-open" })
                : ""))
        : balanceTopWidgetHTML(true);
    const roleSwitcherHTML = hasHostSite
      ? `<div class="side-site-links small muted" style="display:flex;gap:8px;flex-wrap:wrap;padding:4px 2px"><a href="/student" class="link-btn small"${!isTutor && !isAdmin ? ' aria-current="page" style="font-weight:700;color:var(--ink)"' : ""}>Ученик</a><span>·</span><a href="/tutor" class="link-btn small"${isTutor ? ' aria-current="page" style="font-weight:700;color:var(--ink)"' : ""}>Преподаватель</a><span>·</span><a href="/admin" class="link-btn small"${isAdmin ? ' aria-current="page" style="font-weight:700;color:var(--ink)"' : ""}>Админка</a></div>`
      : `<div class="hh-seg side-role-seg" role="group" aria-label="Роль на платформе" style="margin-bottom:2px">
        <button type="button" data-a="role-set" data-role="student" aria-pressed="${!isTutor && !isAdmin}">Ученик</button>
        <button type="button" data-a="role-set" data-role="tutor" aria-pressed="${isTutor}">Преподаватель</button>
      </div>
      <button type="button" class="side-admin-pill${isAdmin ? " is-on" : ""}" data-a="role-set" data-role="${isAdmin ? "student" : "admin"}" aria-pressed="${isAdmin}">${icon("shield")}<span>Админ-панель</span></button>`;
    $("#side-foot").innerHTML = `<div id="side-balance-slot" class="side-bal-slot"${isAdmin ? " hidden" : ""}>${sideBalHTML}</div>
      ${roleSwitcherHTML}
      <div class="side-user">
        <div class="me">${avatarHTML(me && me.avatarUrl, nm, false)}<div style="min-width:0"><div class="me-name">${esc(nm)}</div><span class="sync" hidden><i></i><span></span></span></div></div>
        <div class="row" style="gap:6px">
          <button type="button" class="icon-btn sm" data-a="bug-site" aria-label="Сообщить о баге" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}</button>
          <button type="button" class="icon-btn sm" data-a="go" data-v="profile"${ui.view === "profile" ? ' aria-current="page"' : ""} aria-label="Настройки" title="Настройки">${icon("gear")}</button>
        </div>
      </div>
      <div class="side-tools">
        <button type="button" class="theme-pill" data-a="theme-toggle">${icon(dark ? "sun" : "moon")}<span>${dark ? "Светлая" : "Тёмная"}</span></button>
        ${store.backend && store.user
          ? `<button type="button" class="side-logout danger" data-a="auth-logout">${icon("logout")}<span>Выйти</span></button>`
          : store.backend && !store.user
            ? `<button type="button" class="side-logout" data-a="auth-modal-open"><span>Войти</span></button>`
            : ""}
      </div>`;
    const topTheme = $("#top-theme");
    if (topTheme) {
      topTheme.innerHTML = icon(dark ? "sun" : "moon");
      topTheme.setAttribute("aria-label", themeLabel);
      topTheme.setAttribute("title", themeLabel);
    }
    const topProf = $("#top-profile");
    if (topProf) {
      if (ui.view === "profile") topProf.setAttribute("aria-current", "page");
      else topProf.removeAttribute("aria-current");
    }
    const sideBrand = $("#side-brand");
    const roleLogoTag = isAdmin ? "admin" : isTutor ? "tutor" : "student";
    if (sideBrand && sideBrand.dataset && sideBrand.dataset.logoReady !== roleLogoTag) {
      sideBrand.innerHTML = brandLockupHTML({ sub: isAdmin ? "Админ-панель · Dual PG17" : isTutor ? "Кабинет преподавателя" : "ЕГЭ 2027 · 3 предмета" });
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
    const topBalSlot = $("#top-balance-slot");
    if (topBalSlot) {
      if (isAdmin) {
        topBalSlot.hidden = false;
        topBalSlot.innerHTML = (EGE.kit && typeof EGE.kit.realtimeStatusPillHTML === "function")
          ? EGE.kit.realtimeStatusPillHTML({ mode: store.backend ? "sse" : "local", label: "Админ · Dual PG17", action: "go", title: "Админ-панель · Система и API" }).replace('data-a="go"', 'data-a="go" data-v="admin-system"')
          : `<button type="button" class="top-bal-pill is-tutor" data-a="go" data-v="admin-system">Админ · Dual PG17</button>`;
      } else if (isTutor && tcMod && typeof tcMod.mobileTopWidgetHTML === "function") {
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
    const mobileNav = isAdmin
      ? [
          ["admin-overview", "Обзор", "chart", ui.view === "admin" && admTab === "overview", 0],
          ["admin-requests", "Заявки", "list", ui.view === "admin" && admTab === "requests", 0],
          ["admin-tutors", "Репетиторы", "users", ui.view === "admin" && admTab === "tutors", 0],
          ["admin-payouts", "Выплаты", "wallet", ui.view === "admin" && admTab === "payouts", 0],
          ["admin-system", "API", "shield", ui.view === "admin" && admTab === "system", 0]
        ]
      : isTutor
        ? [
            ["tutor-requests", "Заявки", "chat", ui.view === "cabinet" && (tcTab === "requests" || tcTab === "leads"), tcPending],
            ["tutor-calendar", "Календарь", "cal", ui.view === "cabinet" && tcTab === "calendar", 0],
            ["tutor-students", "Ученики", "users", ui.view === "cabinet" && tcTab === "students", 0],
            ["tutor-profile", "Профиль", "sliders", ui.view === "cabinet" && tcTab === "profile", 0],
            ["fees", "Выплаты", "wallet", ui.view === "fees", 0]
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
  function authCard(opts) {
    opts = opts || {};
    const a = ui.auth, reg = a.tab === "register";
    const isTutor = ui.role === "tutor";
    const hasSiteRole = HOST_SITE === "student" || HOST_SITE === "tutor" || HOST_SITE === "admin";
    const hasGoogle = !!(store.authProviders && store.authProviders.google);
    return `<form class="card pad-lg form${opts.standalone ? " auth-card" : ""}${opts.modal ? " is-modal" : ""}" data-f="auth">
      <div class="row between" style="flex-wrap:wrap">
        <div>
          <div class="eyebrow">Аккаунт · Вектор ЕГЭ</div>
          <h2 class="h2">${reg ? "Регистрация" : "Вход в аккаунт"}</h2>
        </div>
        ${opts.modal ? `<button type="button" class="icon-btn sm" data-a="auth-modal-close" aria-label="Закрыть">${icon("x")}</button>` : ""}
      </div>
      <div class="hh-seg equal" role="group" aria-label="Режим входа">
        <button type="button" data-a="auth-tab" data-tab="login" aria-pressed="${!reg}"><span>Вход</span></button>
        <button type="button" data-a="auth-tab" data-tab="register" aria-pressed="${reg}"><span>Регистрация</span></button>
      </div>
      <p class="ink2 small">${reg ? "Создай личный аккаунт — прогресс, расписание и баланс сохранятся на сервере." : "Выбери удобный способ входа и укажи, как открыть кабинет — учеником или преподавателем."}</p>
      ${hasGoogle
        ? `<a class="btn ghost google-btn" href="/api/auth/google/start">${GOOGLE_SVG}<span>Продолжить через Google</span></a>`
        : `<button type="button" class="btn ghost google-btn" disabled title="Подключается через GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET на сервере">${GOOGLE_SVG}<span>Продолжить через Google</span></button>`}
      ${!hasGoogle ? '<p class="hint" style="text-align:center">Вход через Google активируется после настройки ключей на сервере.</p>' : ""}
      <div class="auth-sep"><span>или по логину</span></div>
      ${reg ? `<div class="fields">
        <div class="field"><label for="auth-name">Как к тебе обращаться</label><input class="input" id="auth-name" name="displayName" type="text" autocomplete="name" maxlength="40" placeholder="Имя (необязательно)" data-d="auth.name" value="${esc(draft("auth.name", ""))}"></div>
        <div class="field"><label for="auth-user">Логин</label><input class="input" id="auth-user" name="username" type="text" autocomplete="username" minlength="2" maxlength="32" required placeholder="Например, alex2027" data-d="auth.user" value="${esc(draft("auth.user", ""))}"></div>
      </div>
      <div class="field"><label for="auth-email">Email</label><input class="input" id="auth-email" name="email" type="email" autocomplete="email" maxlength="254" placeholder="По желанию — для входа и связи с Google" data-d="auth.email" value="${esc(draft("auth.email", ""))}"></div>
      <div class="fields">
        <div class="field"><label for="auth-pass">Пароль</label><input class="input" id="auth-pass" name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required placeholder="Минимум 6 символов" data-d="auth.pass" value="${esc(draft("auth.pass", ""))}"></div>
        <div class="field"><label for="auth-pass2">Повторите пароль</label><input class="input" id="auth-pass2" name="password2" type="password" autocomplete="new-password" minlength="6" maxlength="128" required placeholder="Ещё раз" data-d="auth.pass2" value="${esc(draft("auth.pass2", ""))}"></div>
      </div>` : `<div class="fields">
        <div class="field"><label for="auth-user">Логин или email</label><input class="input" id="auth-user" name="username" type="text" autocomplete="username" minlength="2" maxlength="254" required placeholder="Логин или email" data-d="auth.user" value="${esc(draft("auth.user", ""))}"></div>
        <div class="field"><label for="auth-pass">Пароль</label><input class="input" id="auth-pass" name="password" type="password" autocomplete="current-password" minlength="6" maxlength="128" required placeholder="Пароль" data-d="auth.pass" value="${esc(draft("auth.pass", ""))}"></div>
      </div>`}
      ${reg && store.inviteRequired ? `<div class="field"><label for="auth-invite">Код приглашения</label><input class="input" id="auth-invite" name="invite" type="text" autocomplete="off" maxlength="64" required data-d="auth.invite" value="${esc(draft("auth.invite", ""))}"></div>` : ""}
      ${reg && hasLocalProgress() ? `<label class="row" style="gap:8px;align-items:center"><input type="checkbox" class="check" id="auth-migrate" name="migrate" checked><span class="small">Перенести текущий прогресс из этого браузера в новый аккаунт</span></label>` : ""}
      ${hasSiteRole ? "" : `<div class="field">
        <span class="label">Кем войти <span class="muted">(по умолчанию — ученик)</span></span>
        <div class="hh-seg equal" role="group" aria-label="Роль входа">
          <button type="button" data-a="auth-role" data-role="student" aria-pressed="${!isTutor}">${icon("book")}<span>Как ученик</span></button>
          <button type="button" data-a="auth-role" data-role="tutor" aria-pressed="${isTutor}">${icon("users")}<span>Как преподаватель</span></button>
        </div>
      </div>`}
      ${a.error ? `<div class="notice">${esc(a.error)}</div>` : ""}
      <div class="auth-actions-row">
        <button class="btn" type="submit"${a.busy ? " disabled" : ""}>${a.busy ? "Подожди…" : reg ? "Создать аккаунт" : "Войти"}</button>
        ${!reg ? `<button type="button" class="btn soft" data-a="auth-guest">${ui.role === "admin" ? "Админ-панель (демо)" : isTutor ? "Кабинет преподавателя (демо)" : "Демо-вход ученика"}</button>` : ""}
      </div>
      <div class="auth-foot-row">
        <span class="small muted">${reg ? "Уже есть аккаунт?" : "Впервые на платформе?"}</span>
        <button type="button" class="link-btn" data-a="auth-tab" data-tab="${reg ? "login" : "register"}">${reg ? "Войти по логину" : "Создать аккаунт"}</button>
      </div>
    </form>`;
  }
  // ---------- модульные экраны (src/views/*) ----------
  EGE.views.marketplace.configure({ ui, mkt, TDATA, viewPlan, scheduleRender });
  EGE.views.landing.configure({
    ui, effectiveDark, SUBJ, TOPICS, QS, CONTENT, firstSubject,
    BUG_EMAIL, TDATA, tablesHTML, scheduleRender
  });
  if (EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.configure === "function") {
    EGE.views.tutorCabinet.configure({
      ui, mkt, saveMkt, TDATA, store, profile, toast, notifySide, scheduleRender, go, copyText: copyTextSafe
    });
  }
  if (EGE.views.admin && typeof EGE.views.admin.configure === "function") {
    EGE.views.admin.configure({
      ui, mkt, TDATA, store, toast, notifySide, scheduleRender, go
    });
  }

  function heroMotionMeta() { return EGE.views.landing.heroMotionMeta(); }
  function patchHeroMotionDOM(opts) { return EGE.views.landing.patchHeroMotionDOM(opts); }
  function syncHeroMotion() { return EGE.views.landing.syncHeroMotion(); }
  function stopMotionTimers() { return EGE.views.landing.stopMotionTimers(); }
  function patchSavingsDOM() { return EGE.views.landing.patchSavingsDOM(); }
  function landingPageHTML(opts) { return EGE.views.landing.landingPageHTML(opts); }
  const MOTION_PRESETS = EGE.views.landing.MOTION_PRESETS;
  function viewMarket() { return EGE.views.marketplace.viewMarket(); }
  function viewCabinet() { return EGE.views.tutorCabinet ? EGE.views.tutorCabinet.viewCabinet() : viewTests(); }
  function viewAdmin() {
    if (store.backend && EGE.views.admin && typeof EGE.views.admin.loadData === "function") {
      EGE.views.admin.loadData(false);
    }
    return EGE.views.admin ? EGE.views.admin.viewAdmin() : viewTests();
  }
  function viewStudy() { return EGE.views.marketplace.viewStudy(); }
  function viewBrandbook(opts) { return EGE.views.brandbook.viewBrandbook(opts, { ui, dark: effectiveDark(), TDATA }); }
  function viewFees(opts) {
    if (opts && opts.inside && ui.role === "tutor" && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.viewPayouts === "function") {
      return EGE.views.tutorCabinet.viewPayouts();
    }
    return EGE.views.brandbook.viewFees(opts, { ui, dark: effectiveDark(), TDATA });
  }
  /** Вкладка «Тесты»: 3 предмета ЕГЭ, тренажёр, варианты КИМ и встроенный Справочник. */

  function viewLanding() {
    return landingPageHTML({ inside: true });
  }

  function authScreen() {
    return landingPageHTML({ inside: false });
  }
  function accountCard() {
    if (!store.user) return authCard();
    const cf = ui.confirm, u = store.user, title = u.displayName || u.username;
    return `<section class="card pad-lg stack">
      <div class="row between" style="flex-wrap:wrap">
        <div class="me">
          ${avatarHTML(u.avatarUrl, title, true)}
          <div>
            <div class="eyebrow">Аккаунт · ${u.authProvider === "google" ? "Google" : "Логин и пароль"}</div>
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
  function viewTests() { return EGE.views.trainer.viewTests(); }
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
  function viewStats() { return EGE.views.progress.viewStats(); }
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
  // ---------- тосты и подсказки ----------
  let toastTimer = null;
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
  function toast(msg, opts) {
    const el = $("#toast");
    if (!el) return;
    opts = opts || {};
    if (el.style) { el.style.transform = ""; el.style.opacity = ""; }
    if (opts.side) {
      el.className = "toast is-side";
      el.innerHTML = (EGE.kit && typeof EGE.kit.sideToastInnerHTML === "function")
        ? EGE.kit.sideToastInnerHTML({ title: opts.title || "Уведомление", message: msg, closeAction: "toast-close" })
        : `<span class="toast-side-row"><span class="bb-pulse-dot" style="margin-top:5px;flex:0 0 auto"></span><span class="toast-side-copy"><b>${esc(opts.title || "Уведомление")}</b><span>${esc(msg)}</span></span><button type="button" class="toast-close" data-a="toast-close" aria-label="Убрать уведомление">×</button></span>`;
    } else {
      el.className = "toast";
      el.textContent = msg;
    }
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.hidden = true;
      el.className = "toast";
    }, opts.duration || 2600);
  }
  function notifySide(title, msg) {
    toast(msg, { side: true, title: title || "Предложение передано", duration: 3600 });
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
      const intent = {
        id: "pay-" + Date.now(),
        provider: this.provider,
        amount,
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
    go: (el) => go(el.dataset.v, { sid: el.dataset.sid, id: el.dataset.id, fromNav: !!(el.closest && el.closest("#side-nav, #tabbar")) }),
    "toast-close": () => { dismissSideToast(); },
    "auth-tab": (el) => {
      ui.auth.tab = el.dataset.tab === "register" ? "register" : "login";
      ui.auth.error = "";
      if (ui.authModal) renderModal();
      else scheduleRender();
    },
    "auth-modal-open": () => {
      ui.auth.error = "";
      ui.authModal = true;
      renderModal();
    },
    "auth-modal-close": () => {
      ui.authModal = false;
      ui.auth.error = "";
      renderModal();
    },
    "auth-role": (el) => {
      if (HOST_SITE === "student" || HOST_SITE === "tutor" || HOST_SITE === "admin") return;
      setRolePref(el.dataset.role, true);
      if (ui.authModal) renderModal();
      else scheduleRender();
    },
    "role-set": (el) => {
      const raw = el.dataset && (el.dataset.role || el.dataset.v);
      const next = raw === "tutor" ? "tutor" : raw === "admin" ? "admin" : "student";
      setRolePref(next);
      if (next === "tutor" && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.setTab === "function") {
        EGE.views.tutorCabinet.setTab("requests");
      }
      if (next === "admin" && EGE.views.admin && typeof EGE.views.admin.setTab === "function") {
        EGE.views.admin.setTab("overview");
      }
      ui.view = next === "tutor" ? "cabinet" : next === "admin" ? "admin" : "tests";
      writeHash();
      if (next === "admin" && store.backend && EGE.views.admin && typeof EGE.views.admin.loadData === "function") {
        EGE.views.admin.loadData(false);
      }
      scheduleRender(true);
    },
    "auth-guest": () => {
      ui.guest = true;
      ui.authModal = false;
      ui.auth.error = "";
      applyPostAuthView();
      scheduleRender(true);
    },
    "auth-screen": () => {
      ui.guest = false;
      ui.auth.error = "";
      scheduleRender(true);
    },
    "auth-logout": async () => {
      try { await backendReq("/api/auth/logout", { method: "POST" }); } catch (e) { /* выходим локально в любом случае */ }
      store.user = null; store.uid = null; store.me = null;
      store.error = null; store.confirmed = false; store.stale = false;
      cloud.db = null; ai.fn = null; ai.state = "off";
      ui.guest = false; ui.authModal = false; ui.filterModal = false; ui.quiz = null;
      clearActiveQuiz();
      clearQueues();
      ui.confirm = null; ui.auth.error = "";
      clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
      startLocal();
      toast("Выход из аккаунта выполнен");
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
    return (e && e.message) || "Не получилось войти. Попробуй ещё раз.";
  }
  const FORMS = {
    onboard: () => {
      const name = (store.user ? defaultName() : String(draft("ob.name", defaultName()))).trim().slice(0, 40);
      const targets = {};
      SUBJECT_META.forEach((s) => { targets[s.id] = clampInt(draft("ob." + s.id, DEFAULT_TARGETS[s.id]), 0, 100, DEFAULT_TARGETS[s.id]); });
      patchDoc("profile", { name, targets, created: Date.now() });
      clearDrafts("ob.");
      toast("Готово! Подготовка началась");
    },
    profile: () => {
      const prof = profile();
      const targets = {}, exams = {};
      SUBJECT_META.forEach((s) => {
        targets[s.id] = clampInt(draft("pf.t." + s.id, prof.targets[s.id]), 0, 100, prof.targets[s.id]);
        const d = draft("pf.e." + s.id, prof.exams[s.id]);
        exams[s.id] = validISO(d) ? d : prof.exams[s.id];
      });
      patchDoc("profile", { name: String(draft("pf.name", prof.name || defaultName())).trim().slice(0, 40), targets, exams });
      clearDrafts("pf.");
      toast("Сохранено");
    },
    log: () => {
      const d = draft("log.d", todayISO()), m = clampInt(draft("log.m", ""), 1, 720, 0);
      if (!validISO(d)) { toast("Укажи дату занятия"); return; }
      if (!m) { toast("Укажи, сколько минут длилось занятие"); return; }
      patchDoc("log-" + d.slice(0, 7), { s: { [newId()]: { d, sub: draft("log.sub", "bio"), m, n: String(draft("log.n", "")).trim().slice(0, 200), k: "manual", at: Date.now() } } });
      clearDrafts("log.", ["log.d", "log.sub"]);
      toast("Занятие записано");
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
      toast("Пробник добавлен");
    },
    todo: () => {
      const t = String(draft("td.t", "")).trim().slice(0, 140);
      if (!t) { toast("Напиши, что нужно сделать"); return; }
      const d = draft("td.d", "");
      patchDoc("plan", { custom: { [newId()]: { t, d: validISO(d) ? d : "", n: String(draft("td.n", "")).trim().slice(0, 300), done: null, at: Date.now() } } });
      clearDrafts("td.");
      toast("Дело добавлено");
    },
    chat: () => sendChat(ui.chat.draft),
    auth: async (form) => {
      const a = ui.auth;
      if (a.busy || !store.backend) return;
      const reg = a.tab === "register";
      const val = (name, key) => String(form && form.elements && form.elements[name] ? form.elements[name].value : draft(key, ""));
      const username = val("username", "auth.user").trim();
      const password = val("password", "auth.pass");
      const password2 = reg ? val("password2", "auth.pass2") : "";
      const displayName = reg ? val("displayName", "auth.name").trim() : "";
      const email = reg ? val("email", "auth.email").trim() : "";
      const inviteCode = reg ? val("invite", "auth.invite").trim() : "";
      const migEl = reg && form && form.elements ? form.elements.migrate : null;
      const doMigrate = !!(migEl && migEl.checked);
      if (!username || !password) { a.error = "Введи логин и пароль."; scheduleRender(); return; }
      if (reg && password !== password2) { a.error = "Пароли не совпадают."; scheduleRender(); return; }
      a.busy = true; a.error = "";
      scheduleRender();
      try {
        const body = reg ? { username, password, email, displayName, inviteCode } : { username, password };
        const res = await backendReq("/api/auth/" + (reg ? "register" : "login"), { method: "POST", body: JSON.stringify(body) });
        let migrated = 0;
        if (reg && doMigrate) {
          try { migrated = await migrateLocalDocsToServer(); } catch (e) { /* загрузим аккаунт в любом случае */ }
        }
        clearQueues();
        ui.guest = false;
        ui.authModal = false;
        applyPostAuthView();
        await loadBackendSession(res.user);
        clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
        a.error = "";
        toast(reg ? (migrated ? "Аккаунт создан, прогресс перенесён" : "Аккаунт создан") : "Вход выполнен");
      } catch (e) {
        a.error = authErrorText(e);
      }
      a.busy = false;
      scheduleRender();
    },
    "tutor-apply": () => {
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
      ui.tutorApplyDone = { name, subjectName: subjName, rate, contact };
      ui.tutorApplyModal = false;
      renderModal();
      scheduleRender();
      notifySide("Анкета принята на проверку", `${name} · ${subjName} · ${rate.toLocaleString("ru-RU")} ₽/ч — появится в каталоге сегодня`);
    },
    "bal-custom": (form) => {
      const st = mkt();
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      const minAmt = st.initialPaid ? 100 : trialRub;
      const bm = ui.balanceModal || (ui.balanceModal = { customAmount: minAmt, error: "", reason: "", pendingBooking: null });
      const rawEl = (form && form.elements && form.elements.amount) || $("#bal-custom-amount");
      const raw = rawEl ? Number(rawEl.value) : Number(bm.customAmount);
      if (!Number.isFinite(raw) || raw < minAmt) {
        bm.error = !st.initialPaid
          ? `Первое пополнение на занятия — минимум ${trialRub} ₽ по СБП (пробный 60 мин). Далее можно от 100 ₽.`
          : "Введите сумму пополнения по СБП от 100 ₽.";
        renderModal();
        return;
      }
      const amt = Math.min(200000, Math.round(raw));
      EGEPayments.createTopupIntent({ amount: amt, planId: st.planId || "trial5k" });
      st.balance = (Number(st.balance) || 0) + amt;
      if (st.balance >= trialRub) st.initialPaid = true;
      if (st.balance >= 8900) st.planId = "month10k";
      else if (!st.planId) st.planId = "trial5k";
      saveMkt();
      const pending = bm.pendingBooking;
      ui.balanceModal = null;
      if (pending && st.balance >= (pending.offerPrice != null ? Number(pending.offerPrice) : trialRub)) {
        const pOffer = pending.mode === "trial"
          ? (pending.offerPrice != null ? Number(pending.offerPrice) : trialRub)
          : (pending.offerPrice != null ? Number(pending.offerPrice) : 1000);
        ui.booking = Object.assign({}, pending, { offerPrice: pOffer });
      }
      renderModal();
      notifySide("Баланс пополнен по СБП", `+${amt.toLocaleString("ru-RU")} ₽ · на счёте ${st.balance.toLocaleString("ru-RU")} ₽`);
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
      const whatsapp = String((waEl ? waEl.value : ld.whatsapp) || "").trim();
      const comment = String((cEl ? cEl.value : ld.comment) || "").trim();
      const subjects = Array.isArray(ld.subjects) && ld.subjects.length ? ld.subjects.slice() : ["chem"];
      const studentName = (store.user && store.user.name) || "Ученик (мой профиль)";
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
      ld.targetPrice = targetPrice;
      ld.whatsapp = whatsapp;
      ld.comment = "";
      ld.subjMenuOpen = false;
      const subjLbl = typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(lead.subjects).join(" · ") : lead.subjects.join(", ");
      notifySide("Запрос отправлен преподавателям", `${subjLbl} · до ${targetPrice.toLocaleString("ru-RU")} ₽/ч — преподаватели уже видят вас во вкладке «Ученики ищут»`);
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
      notifySide("Поиск по базе применён", val ? `Фильтр «${val}» — лучшие ставки ниже рынка` : "Показаны лучшие ставки ниже рынка");
    },
    "landing-search": (form) => {
      const qEl = (form && form.elements && form.elements.q) || $("#landing-q");
      const val = String((qEl && qEl.value) || "").trim();
      const st = mkt();
      st.q = val;
      saveMkt();
      scheduleRender();
      if (typeof setTimeout === "function") setTimeout(() => scrollToEl("land-market"), 40);
      notifySide("Поиск по каталогу", val ? `Запрос: «${val}»` : "Показана вся база репетиторов");
    },
    "bb-hero-demo": (form) => {
      const qEl = (form && form.elements && form.elements.q) || $("#bb-hero-demo-q");
      const bb = bbState();
      bb.heroQ = String((qEl && qEl.value) || bb.heroQ || "").trim();
      bb.heroSearchSubmitted = !bb.heroSearchSubmitted;
      scheduleRender();
      notifySide("Строка поиска под Hero", bb.heroSearchSubmitted ? "Строка поиска .land-search-bar -> статус .is-confirmed" : "Строка поиска сброшена");
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
      notifySide("Заявка на вывод оформлена", `${amtTxt} ₽ · ${destTxt}${res.payoutRow && res.payoutRow.npdReceipt ? " · чек НПД" : ""}`);
      toast(`Выведено ${amtTxt} ₽`);
      scheduleRender();
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
    if (ui.booking && ui.booking.timeMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#bid-custom-time"))) {
      ui.booking.timeMenuOpen = false;
      renderModal();
    }
    return changed;
  }

  document.addEventListener("click", (e) => {
    if (closeSelectMenus(e.target)) scheduleRender();
    if (e.target && e.target.classList && e.target.classList.contains("modal-back")) {
      ui.bug = null; ui.booking = null; ui.authModal = false; ui.filterModal = false; ui.bbModal = false; ui.tutorApplyModal = false; ui.balanceModal = null; ui.payoutModal = null;
      renderModal();
      return;
    }
    const el = e.target.closest("[data-a]") || e.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const hrefAttr = el.tagName === "A" ? el.getAttribute("href") : "";
    const act = (el.dataset && (el.dataset.a || el.dataset.act)) || "";
    const isModifiedClick = !!(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || (typeof e.button === "number" && e.button !== 0));
    const isExtLink = !!(hrefAttr && !hrefAttr.startsWith("#") && !(act === "bb-subsite" && hrefAttr.indexOf("/brandbook") === 0 && !isModifiedClick));
    if (act && act.indexOf("tc-") === 0 && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleAction === "function") {
      if (EGE.views.tutorCabinet.handleAction(act, el)) { if (!isExtLink) e.preventDefault(); return; }
    }
    if (act && act.indexOf("adm-") === 0 && EGE.views.admin && typeof EGE.views.admin.handleAction === "function") {
      if (EGE.views.admin.handleAction(act, el)) { if (!isExtLink) e.preventDefault(); return; }
    }
    if (act && (act.indexOf("mkt-bk-") === 0 || act.indexOf("study-sched-") === 0 || act.indexOf("study-chats-") === 0) && EGE.views.marketplace && typeof EGE.views.marketplace.handleAction === "function") {
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
  document.addEventListener("input", (e) => {
    const el = e.target;
    const inpAct = (el && el.dataset && el.dataset.a) || "";
    if (inpAct && inpAct.indexOf("adm-") === 0 && EGE.views.admin && typeof EGE.views.admin.handleInput === "function") {
      if (EGE.views.admin.handleInput(el)) return;
    }
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
      else ui.payoutModal[k] = el.value;
      ui.payoutModal.error = "";
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
    if (el.id === "mkt-q" || el.id === "mkt-q-modal") { mkt().q = el.value; saveMkt(); scheduleRender(); return; }
    if (el.id === "hero-banner-q") { ui.heroQuickQ = el.value; return; }
    if (el.id === "bb-hero-demo-q") { bbState().heroQ = el.value; return; }
    if (el.id === "bb-catalog-q") { bbState().catQ = el.value; scheduleRender(); return; }
    if (el.id === "bb-tbl-q") { bbState().tableSearch = el.value; scheduleRender(); return; }
    if (el.id === "landing-q") { mkt().q = el.value; saveMkt(); return; }
    if (el.id === "bug-body") {
      if (ui.bug) {
        ui.bug.body = el.value;
        const a = document.getElementById("bug-mailto");
        if (a) a.href = bugMailtoHref(ui.bug);
      }
      return;
    }
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
    if (el.id === "mkt-max-price") {
      const val = Number(el.value) || 2000;
      mkt().maxPrice = val;
      const lbl = el.parentElement && el.parentElement.querySelector("label b");
      if (lbl) lbl.textContent = val >= 2000 ? "до 2 000+ ₽/ч" : "до " + val + " ₽/ч";
      saveMkt();
      return;
    }
    if (el.id === "bal-custom-amount") { if (ui.balanceModal) { ui.balanceModal.customAmount = el.value; ui.balanceModal.error = ""; } return; }
    if (el.id === "lead-price") { if (ui.leadDraft) ui.leadDraft.targetPrice = Number(el.value) || 1000; return; }
    if (el.id === "lead-wa") {
      const fn = EGE.tutors && EGE.tutors.formatPhoneMask;
      const masked = typeof fn === "function" ? fn(el.value) : el.value;
      if (el.value !== masked) el.value = masked;
      if (ui.leadDraft) ui.leadDraft.whatsapp = masked;
      return;
    }
    if (el.id === "lead-comment") { if (ui.leadDraft) ui.leadDraft.comment = el.value; return; }
    if (el.id === "bid-price") {
      if (ui.booking) {
        const raw = parseInt(el.value, 10);
        if (Number.isFinite(raw)) {
          const next = Math.max(0, Math.min(99999, raw));
          ui.booking.offerPrice = next;
          if (ui.booking.tutorId && ui.booking.mode !== "trial") {
            const cardOffers = ui.cardOffers || (ui.cardOffers = {});
            cardOffers[ui.booking.tutorId] = next;
          }
          updateBookingModalLive();
        }
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
  document.addEventListener("change", (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.tcPhoto && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleFileInput === "function") {
      if (EGE.views.tutorCabinet.handleFileInput(el)) return;
    }
    if (el && el.dataset && (el.dataset.tc || el.dataset.tcStudent) && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleInput === "function") {
      if (EGE.views.tutorCabinet.handleInput(el)) return;
    }
    if (el && el.dataset && el.dataset.tcPayout && ui.payoutModal) {
      const k = el.dataset.tcPayout;
      if (k === "npdReceipt") ui.payoutModal.npdReceipt = !!el.checked;
      else ui.payoutModal[k] = el.value;
      ui.payoutModal.error = "";
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
    if (el.id === "bal-custom-amount") { if (ui.balanceModal) { ui.balanceModal.customAmount = el.value; ui.balanceModal.error = ""; } return; }
    if (el.id === "lead-price") { if (ui.leadDraft) ui.leadDraft.targetPrice = Number(el.value) || 1000; return; }
    if (el.id === "lead-wa") {
      const fn = EGE.tutors && EGE.tutors.formatPhoneMask;
      const masked = typeof fn === "function" ? fn(el.value) : el.value;
      if (el.value !== masked) el.value = masked;
      if (ui.leadDraft) ui.leadDraft.whatsapp = masked;
      return;
    }
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
    if (el.id === "import-file" && el.files && el.files[0]) { readImport(el.files[0]); el.value = ""; }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && closeSelectMenus(null)) {
      scheduleRender();
    }
    if (e.key === "Escape" && (ui.bug || ui.booking || ui.authModal || ui.filterModal || ui.bbModal || ui.tutorApplyModal || ui.balanceModal || ui.payoutModal)) {
      e.preventDefault();
      ui.bug = null; ui.booking = null; ui.authModal = false; ui.filterModal = false; ui.bbModal = false; ui.tutorApplyModal = false; ui.balanceModal = null; ui.payoutModal = null;
      renderModal();
      return;
    }
    if (ui.bug || ui.booking || ui.authModal || ui.filterModal || ui.bbModal || ui.tutorApplyModal || ui.balanceModal || ui.payoutModal) return;
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
  let swipeToast = null;
  function swipeClientPt(e, axis) {
    if (e.touches && e.touches[0]) return axis === "x" ? e.touches[0].clientX : e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches[0]) return axis === "x" ? e.changedTouches[0].clientX : e.changedTouches[0].clientY;
    return axis === "x" ? (typeof e.clientX === "number" ? e.clientX : 0) : (typeof e.clientY === "number" ? e.clientY : 0);
  }
  function startSwipeToast(e) {
    if (!e || !e.target || typeof e.target.closest !== "function") return;
    if (e.target.closest("button, [data-a]")) return;
    const node = e.target.closest("#toast.is-side, [data-swipe-toast]");
    if (!node) return;
    clearTimeout(toastTimer);
    swipeToast = { node, x0: swipeClientPt(e, "x"), y0: swipeClientPt(e, "y"), dx: 0, active: false };
  }
  function moveSwipeToast(e) {
    if (!swipeToast) return;
    const dx = swipeClientPt(e, "x") - swipeToast.x0;
    const dy = swipeClientPt(e, "y") - swipeToast.y0;
    if (!swipeToast.active) {
      if (dx < -8 && Math.abs(dx) > Math.abs(dy)) {
        swipeToast.active = true;
        if (swipeToast.node.classList) swipeToast.node.classList.add("is-dragging");
      } else if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
        swipeToast = null;
        return;
      } else {
        return;
      }
    }
    const clamped = Math.min(0, dx);
    swipeToast.dx = clamped;
    if (swipeToast.node.style) {
      swipeToast.node.style.transform = `translateX(${clamped}px)`;
      swipeToast.node.style.opacity = String(Math.max(0.18, 1 + clamped / 170));
    }
  }
  function endSwipeToast() {
    if (!swipeToast) return;
    const cur = swipeToast;
    swipeToast = null;
    const node = cur.node;
    if (node.classList) node.classList.remove("is-dragging");
    if (cur.active && cur.dx <= -48) {
      if (node.id === "toast") {
        dismissSideToast(node);
      } else {
        if (node.style) { node.style.transform = ""; node.style.opacity = ""; }
        if (node.classList) node.classList.add("is-dismissing");
        setTimeout(() => {
          bbState().previewToastDismissed = true;
          scheduleRender();
        }, 190);
      }
    } else {
      if (node.style) { node.style.transform = ""; node.style.opacity = ""; }
      if (node.id === "toast" && !node.hidden) {
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => dismissSideToast(node), 2600);
      }
    }
  }
  document.addEventListener("pointerdown", startSwipeToast);
  document.addEventListener("pointerup", endSwipeToast);
  document.addEventListener("pointercancel", endSwipeToast);
  document.addEventListener("pointermove", (e) => {
    moveSwipeToast(e);
    if (!e || typeof document.getElementById !== "function") return;
    const wrap = document.getElementById("hero-stage-wrap");
    if (!wrap || !wrap.getBoundingClientRect || !wrap.style || !wrap.style.setProperty) return;
    const r = wrap.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const mx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
    const my = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
    wrap.style.setProperty("--mx", mx.toFixed(1) + "%");
    wrap.style.setProperty("--my", my.toFixed(1) + "%");
  }, { passive: true });
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
        oauth_failed: "Ошибка при входе через Google. Попробуй ещё раз."
      };
      ui.auth.error = map[code] || "Не удалось войти через Google.";
      sp.delete("auth_error");
      const q = sp.toString();
      history.replaceState(null, "", (location.pathname || "/") + (q ? "?" + q : "") + (location.hash || ""));
    } catch (e) { /* игнор */ }
  }

  const appCtx = {
    CONTENT, DEFAULT_TARGETS, DIAG_PLAN_ID, EGE, EGEPayments, INTERVALS, LETTERS, MAX_Q_MS,
    MOTION_PRESETS, QUIZ_SIZE, SUBJ, SUBJECTS, SUBJECT_META, SUBJECT_NAME, TDATA, TOPIC_QUIZ, TOPICS, QS,
    accountCard, ai, caps, clearActiveQuiz, cloud, codeLabel, completePlanFromQuiz,
    defaultMarketState, defaultName, draft, dueQs, findPlanItem, firstSubject, formatAvg,
    getThemeMode: () => themeMode, go, hash, heroMotionMeta, localNotice, markPlanPrep,
    minutesByDay, mistakeQs, mkt, mocks, nextExam, notifySide, patchDoc, patchHeroMotionDOM,
    patchSavingsDOM, planDoc, planItems, profile, prog, questionAttemptBreakdown, renderModal,
    replaceDoc, saveActiveQuiz, saveMkt, scheduleRender, sessions, staleNotice, stepBtn,
    stopMotionTimers, store, subjSelect, subjectAccuracy, subjectReadCount, subjectStats,
    tile, toast, todoItem, topicRef, topicStats, totals, ui, updateBookingModalLive
  };
  EGE.views.trainer.configure(appCtx);
  EGE.views.trainer.registerActions(ACTIONS);
  EGE.views.essayGuide.configure(appCtx);
  EGE.views.essayGuide.registerActions(ACTIONS);
  EGE.views.progress.configure(appCtx);
  EGE.views.progress.registerActions(ACTIONS);
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
  render();
  initData();
  initCaps();
})();
