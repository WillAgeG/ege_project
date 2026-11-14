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

  // ---------- утилиты ----------
  const $ = (sel) => document.querySelector(sel);
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function rich(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>"); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function isObj(v) { return !!v && typeof v === "object" && !Array.isArray(v); }
  // Та же семантика, что у update() в базе: объекты сливаются, остальное заменяется.
  function deepMerge(target, patch) {
    const out = isObj(target) ? Object.assign({}, target) : {};
    for (const k of Object.keys(patch || {})) {
      const v = patch[k];
      out[k] = isObj(v) ? deepMerge(isObj(out[k]) ? out[k] : {}, v) : v;
    }
    return out;
  }
  function pad(n) { return String(n).padStart(2, "0"); }
  function isoDate(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
  function todayISO() { return isoDate(new Date()); }
  function parseISO(s) { const p = String(s).split("-").map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); }
  function addDays(iso, n) { const d = parseISO(iso); d.setDate(d.getDate() + n); return isoDate(d); }
  function daysUntil(iso) { return Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000); }
  function validISO(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }
  const fmtLong = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  const fmtWeekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });
  function dateLong(iso) { return fmtLong.format(parseISO(iso)).replace(/\s?г\.$/, ""); }
  function dateDay(iso) { return parseISO(iso).getFullYear() === new Date().getFullYear() ? fmtDay.format(parseISO(iso)) : dateLong(iso); }
  function dateShort(iso) { return fmtShort.format(parseISO(iso)).replace(".", ""); }
  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }
  function days(n) { return n + " " + plural(n, "день", "дня", "дней"); }
  function minutesText(m) {
    m = Math.round(m || 0);
    if (m < 60) return m + " мин";
    const h = Math.floor(m / 60), r = m % 60;
    return h + " ч" + (r ? " " + r + " мин" : "");
  }
  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  const hash = EGE.hash;
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function range(n) { return Array.from({ length: n }, (_, i) => i); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  function clampInt(v, lo, hi, def) { const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; }
  function norm(s) { return String(s || "").toLowerCase().replace(/ё/g, "е").replace(/[«»"]/g, "").replace(/\s+/g, " ").trim().replace(/[.!]+$/, ""); }
  function normTight(s) { return norm(s).replace(/,/g, ".").replace(/[\s\-–—]/g, "").replace(/%$/, ""); }
  function parseNum(s) {
    const m = String(s == null ? "" : s).replace(/,/g, ".").replace(/−/g, "-").match(/[-+]?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  function byDue(a, b) { return (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0; }

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l8-8"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 2 2 3-3"/><path d="M14 10h4"/><path d="m7 15 2 2 3-3"/><path d="M14 16h4"/>',
    chart: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-7"/><path d="M3 20h18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    repeat: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    hint: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0 0 12 2z"/>',
    bug: '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sliders: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.3l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.9z"/>',
    heartFill: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.3l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.9z" fill="currentColor"/>',
    sort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    msg: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
  };
  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || "") + "</svg>";
  }

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

  // ---------- состояние интерфейса ----------
  const ui = {
    view: "tests",
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
    guest: false,
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
    market: null,
    demo: { tab: "quiz", sid: firstSubject.id, qIdx: 0, pick: null, revealed: false, topicIdx: 0, bidRate: 800, bidHour: "10:00" },
    motion: { playing: true, preset: "design", step: 0, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" },
    savings: { freq: 2, marketRate: 1600, offerRate: 950 },
    brandbook: { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, vpWidth: 390, chipOn: true, sent: false, fav: true }
  };
  const MARKET_LS_KEY = "vektor-ege:market";
  const TDATA = EGE.tutors || null;
  function defaultMarketState() {
    return {
      planId: "free",
      balance: 0,
      calcRate: 800,
      q: "",
      exam: "all",
      subject: "all",
      format: "all",
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
    if (!Array.isArray(ui.market.bookings)) ui.market.bookings = [];
    if (!Array.isArray(ui.market.favs)) ui.market.favs = [];
    return ui.market;
  }
  function saveMkt() {
    try { localStorage.setItem(MARKET_LS_KEY, JSON.stringify(mkt())); } catch (e) { /* игнор */ }
  }
  function draft(key, fallback) { return Object.prototype.hasOwnProperty.call(ui.drafts, key) ? ui.drafts[key] : fallback; }
  function clearDrafts(prefix, keep) { for (const k of Object.keys(ui.drafts)) if (k.indexOf(prefix) === 0 && !(keep || []).includes(k)) delete ui.drafts[k]; }

  function go(v, opts) {
    opts = opts || {};
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
    scheduleRender(true);
  }
  function readHash() {
    const h = decodeURIComponent((location.hash || "").slice(1));
    if (h) {
      if (TOPICS[h]) { ui.view = "topic"; ui.topicId = h; ui.sid = TOPICS[h].sid; return; }
      if (SUBJ[h]) { ui.view = "subject"; ui.sid = h; return; }
      if (h === "essay" && EGE.essay && SUBJ.rus) { ui.view = "essay"; ui.sid = "rus"; return; }
      if (["home", "tests", "study", "plan", "stats", "tutor", "market", "landing", "brandbook", "fees", "profile"].includes(h)) { ui.view = h; return; }
    }
    try {
      if (!h && typeof location !== "undefined") {
        if (location.pathname === "/brandbook") { ui.view = "brandbook"; return; }
        if (location.pathname === "/fees") { ui.view = "fees"; return; }
        if (location.pathname === "/landing") { ui.view = "landing"; return; }
      }
    } catch (e) { /* игнор */ }
    if (!h && typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.landing) ui.view = "landing";
  }
  function writeHash() {
    const tok = ui.view === "topic" ? ui.topicId : ui.view === "subject" ? ui.sid : ui.view === "quiz" ? null : ui.view;
    if (!tok) return;
    try { history.replaceState(null, "", "#" + tok); } catch (e) { /* адрес не меняется в просмотрщике */ }
  }

  // ---------- рендер ----------
  let renderQueued = false, scrollTopPending = false;
  function scheduleRender(scrollTop) {
    if (scrollTop) scrollTopPending = true;
    if (renderQueued) return;
    renderQueued = true;
    Promise.resolve().then(() => { renderQueued = false; render(); });
  }
  const VIEWS = { home: viewHome, tests: viewTests, study: viewStudy, subject: viewSubject, topic: viewTopic, quiz: viewQuiz, essay: viewEssay, plan: viewPlan, stats: viewStats, tutor: viewTutor, market: viewMarket, landing: viewLanding, brandbook: () => viewBrandbook({ inside: true }), fees: () => viewFees({ inside: true }), profile: viewProfile };
  function setAuthLayout(on) {
    try {
      if (document.body && document.body.dataset) {
        if (on) document.body.dataset.auth = "1";
        else delete document.body.dataset.auth;
      }
    } catch (e) { /* игнор */ }
  }
  function render() {
    const authGate = store.backend && !store.user && !ui.guest;
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
      html = store.ready
        ? (ui.view === "brandbook" ? viewBrandbook({ inside: false }) : ui.view === "fees" ? viewFees({ inside: false }) : authScreen())
        : `<div class="auth-wrap"><div class="auth-brand">${BRAND_MARK_HTML}<div class="brand-name">Вектор ЕГЭ</div><p class="muted">Подключаюсь к серверу…</p></div></div>`;
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
    syncHeroMotion();
  }
  const BUG_EMAIL = "willagegg@gmail.com";
  const VIEW_LABELS = { home: "Тесты", tests: "Тесты", study: "Учёба", subject: "Предмет", topic: "Тема", quiz: "Тест", plan: "План поступления", stats: "Показатели", tutor: "Справочник", essay: "Сочинение", market: "Репетиторы", landing: "О сервисе и тарифы", brandbook: "Брендбук и UI Kit", fees: "Оплата и сервисный сбор", profile: "Настройки" };
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
  function isValidHHMM(s) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(s || "").trim());
  }
  function feeSplitHTML(price) {
    if (!TDATA || typeof TDATA.commissionSplit !== "function") return "";
    const sp = TDATA.commissionSplit(price);
    return `<div class="fee-pill"><span>Ученик платит</span><b class="num">${sp.total.toLocaleString("ru-RU")} ₽/ч</b></div>
      <div class="fee-pill"><span>Преподавателю (95%)</span><b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b></div>
      <div class="fee-pill"><span>Комиссия сервиса (${sp.pct}%)</span><b class="num">${sp.fee.toLocaleString("ru-RU")} ₽</b></div>`;
  }
  function bookingModalHTML() {
    if (!ui.booking || !TDATA) return "";
    const b = ui.booking, tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
    if (!tutor) return "";
    const days = TDATA.buildCalendarDays(7);
    const dayObj = days.find((d) => d.iso === b.dayIso) || days[0];
    const daySlots = TDATA.tutorSlotsForDay(tutor, dayObj.dow);
    const curHour = isValidHHMM(b.hour) ? b.hour : (daySlots[0] || "10:00");
    const curHourNum = Math.max(10, Math.min(20, parseInt(String(curHour).split(":")[0], 10) || 10));
    const curHourPct = Math.round(((curHourNum - 10) / 10) * 100);
    const sig = TDATA.offerSignal(tutor.price, b.offerPrice);
    const preview = TDATA.botPreviewText({
      exam: b.exam,
      subjectName: tutor.subjectName,
      format: b.format,
      dayLabel: dayObj.fullLabel,
      hour: curHour,
      offerPrice: b.offerPrice,
      tutorPrice: tutor.price
    });
    const st = mkt();
    const n5 = b.offerPrice > 0 ? Math.floor(5000 / b.offerPrice) : 0;
    const n10 = b.offerPrice > 0 ? Math.floor(10000 / b.offerPrice) : 0;
    const winTxt = tutor.windowLabel || ("с " + tutor.availableFrom + " до " + tutor.availableTo);
    const inWin = typeof TDATA.tutorInWindow === "function" ? TDATA.tutorInWindow(tutor, curHour) : true;
    const diffTutor = tutor.price - b.offerPrice;
    const diffMarket = (tutor.marketPrice || tutor.price) - b.offerPrice;
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="book-modal-title">
      <div class="modal-card">
        <div class="modal-head">
          <div class="row" style="gap:8px">${icon("cal")}<b id="book-modal-title">Запись · ${esc(tutor.name)}</b></div>
          <button type="button" class="icon-btn sm" data-a="book-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="row between small muted" style="flex-wrap:wrap;gap:6px">
          <span>${esc(tutor.subjectName)} · ${esc(tutor.source)} · окно <b>${esc(winTxt)}</b></span>
          <span>Баланс: <b class="num">${st.balance.toLocaleString("ru-RU")} ₽</b></span>
        </div>
        <div class="fields">
          <div class="field">
            <label>Экзамен</label>
            <div class="switch">${tutor.exams.map((ex) => `<button type="button" data-a="book-exam" data-v="${esc(ex)}" aria-pressed="${b.exam === ex}">${esc(ex)}</button>`).join("")}</div>
          </div>
          <div class="field">
            <label>Формат</label>
            <div class="switch">${tutor.formats.map((fm) => `<button type="button" data-a="book-format" data-v="${esc(fm)}" aria-pressed="${b.format === fm}">${esc(fm)}</button>`).join("")}</div>
          </div>
        </div>
        <div class="field">
          <label>Выбери день</label>
          <div class="cal-days">${days.map((d) => {
            const cnt = TDATA.tutorSlotsForDay(tutor, d.dow).length;
            if (!cnt) return "";
            const on = d.iso === dayObj.iso;
            return `<button type="button" class="day-cir${on ? " on" : ""}" data-a="book-day" data-v="${d.iso}"><span class="day-wd">${esc(d.wd)}</span><span class="day-dot">${d.num}</span><span class="day-cnt">${cnt} слот.</span></button>`;
          }).join("")}</div>
        </div>
        <div class="field">
          <label>Выбери час с 10:00 до 20:00 (${esc(winTxt)})</label>
          <div class="hh-time-picker">
            <div class="row between">
              <span class="small muted">Время занятия</span>
              <span class="hh-time-val num" id="bid-hour-pill">${esc(curHour)}</span>
            </div>
            <input class="hh-time-range" id="bid-hour-range" type="range" min="10" max="20" step="1" value="${curHourNum}" style="--pct:${curHourPct}%" aria-label="Час занятия с 10:00 до 20:00">
            <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
          </div>
          <div class="bid-time-row" style="margin-top:8px">
            <span class="small muted" id="bid-win-status">${inWin ? `Входит в свободное окно (${esc(winTxt)})` : `Вне типового окна (${esc(winTxt)}) — уточним и уведомим`}</span>
            <input class="input num" id="bid-custom-time" type="time" value="${esc(curHour)}" aria-label="Выбрать точное время урока" style="width:120px">
          </div>
        </div>
        <div class="field">
          <label for="bid-price">Твоя цена за занятие (₽/ч)</label>
          <div class="hh-price-row" id="bid-price-row" style="margin-bottom:4px">
            ${priceHeadlineHTML(tutor.marketPrice, b.offerPrice, false)}
          </div>
          <div class="hh-diff-strip" id="bid-diff-strip" style="margin-bottom:4px">
            ${priceDiffTagsHTML({ tutorPrice: tutor.price, marketPrice: tutor.marketPrice || tutor.price, offerPrice: b.offerPrice, qualBadge: tutor.qualBadge })}
          </div>
          <div class="bid-stepper">
            <button type="button" class="btn ghost sm" data-a="bid-step" data-step="-100">−100 ₽</button>
            <input class="input bid-input num" id="bid-price" type="number" min="500" max="5000" step="50" inputmode="numeric" value="${b.offerPrice}">
            <button type="button" class="btn ghost sm" data-a="bid-step" data-step="100">+100 ₽</button>
          </div>
          <div id="bid-signal" class="small"><span class="chip ${sig.tone}">${esc(sig.label)}</span></div>
        </div>
        <div class="field">
          <label for="bid-note">Пожелания по подготовке (необязательно)</label>
          <input class="input" id="bid-note" maxlength="140" placeholder="Например: цель 80+ баллов, разбор устной части и эссе" value="${esc(b.note || "")}">
        </div>
        <div class="bot-preview">
          <b class="small">Детали заявки (уведомим о подтверждении):</b>
          <span id="bot-preview-txt">${esc(preview)}</span>
          <span class="small muted">На «Пробник» (5 000 ₽) хватит на <b>${n5} ур.</b> · на «Месяц» (10 000 ₽) на <b>${n10} ур.</b></span>
        </div>
        <div class="row between" style="flex-wrap:wrap;gap:8px;align-items:center">
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn" id="bid-submit-btn" data-a="book-submit">Предложить ${b.offerPrice.toLocaleString("ru-RU")} ₽</button>
            <button type="button" class="btn ghost" data-a="book-close">Отмена</button>
          </div>
          <button type="button" class="link-btn small muted" data-a="go-fees">Условия оплаты и сбор системы →</button>
        </div>
      </div>
    </div>`;
  }
  function activeFilterCount(st) {
    st = st || mkt();
    let n = 0;
    if (st.exam && st.exam !== "all") n++;
    if (st.format && st.format !== "all") n++;
    if (st.subject && st.subject !== "all") n++;
    if (st.maxPrice && st.maxPrice < 2000) n++;
    if (st.onlyBumped) n++;
    if (st.day && st.day !== "all") n++;
    if (st.hour && st.hour !== "all") n++;
    if (st.q && String(st.q).trim()) n++;
    return n;
  }
  function filterModalHTML() {
    if (!ui.filterModal || !TDATA) return "";
    const st = mkt();
    const days = TDATA.buildCalendarDays(7);
    const activeDayObj = st.day !== "all" ? (days.find((d) => d.iso === st.day) || null) : null;
    const activeDow = activeDayObj ? activeDayObj.dow : "all";
    const list = TDATA.filterTutors(st, days);
    const totalWord = plural(list.length, "репетитора", "репетиторов", "репетиторов");
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="filter-modal-title">
      <div class="modal-card sheet-modal">
        <div class="sheet-head">
          <button type="button" class="icon-btn sm" data-a="filter-close" aria-label="Назад">${icon("back")}</button>
          <b id="filter-modal-title" style="text-align:center;font-size:17px">Фильтры</b>
          <button type="button" class="link-btn small" data-a="mkt-reset">Сбросить</button>
        </div>
        <div class="sheet-body">
          <div class="hh-search-box">
            <span class="hh-search-ico">${icon("search")}</span>
            <input class="hh-search-input" id="mkt-q-modal" type="search" autocomplete="off" spellcheck="false" value="${esc(st.q || "")}" placeholder="Предмет, тема или имя репетитора">
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Экзамен</div>
            <div class="chip-rail">
              ${[["all", "Все"], ["ЕГЭ", "ЕГЭ"], ["ОГЭ", "ОГЭ"]].map(([v, l]) => `<button type="button" class="chip-btn${st.exam === v ? " on" : ""}" data-a="mkt-exam" data-v="${v}">${l}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Актуальность анкеты</div>
            <div class="chip-rail">
              <button type="button" class="chip-btn${!st.onlyBumped ? " on" : ""}" data-a="mkt-bumped-set" data-v="0">За всё время</button>
              <button type="button" class="chip-btn${st.onlyBumped ? " on" : ""}" data-a="mkt-bumped-set" data-v="1">Подняты сегодня</button>
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Предмет</div>
            <div class="chip-rail">
              <button type="button" class="chip-btn${st.subject === "all" ? " on" : ""}" data-a="mkt-subj" data-v="all">Все</button>
              ${TDATA.SUBJECTS.map((sb) => `<button type="button" class="chip-btn${st.subject === sb.id ? " on" : ""}" data-a="mkt-subj" data-v="${sb.id}">${esc(sb.short)}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Формат</div>
            <div class="chip-rail">
              ${[["all", "Любой"], ["Онлайн", "Онлайн"], ["Очно", "Очно"]].map(([v, l]) => `<button type="button" class="chip-btn${st.format === v ? " on" : ""}" data-a="mkt-format" data-v="${v}">${l}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="row between"><span class="small muted">Ставка до</span><b class="num">${st.maxPrice >= 2000 ? "до 2 000+ ₽/ч" : "до " + st.maxPrice + " ₽/ч"}</b></div>
            <div class="chip-rail">
              ${[1000, 1300, 1600, 2000].map((pr) => `<button type="button" class="chip-btn${st.maxPrice === pr ? " on" : ""}" data-a="mkt-price" data-v="${pr}">${pr >= 2000 ? "Любая" : "до " + pr + " ₽"}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Время занятия</div>
            <div class="hour-circles">
              <button type="button" class="hr-cir${st.hour === "all" ? " on" : ""}" data-a="mkt-hour" data-v="all">Любое</button>
              ${TDATA.HOURS.map((h) => `<button type="button" class="hr-cir${st.hour === h ? " on" : ""}" data-a="mkt-hour" data-v="${esc(h)}">${esc(h)}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">День недели (${activeDayObj ? esc(activeDayObj.shortLabel) : "все 7 дней"})</div>
            <div class="cal-days">
              <button type="button" class="day-cir${st.day === "all" ? " on" : ""}" data-a="mkt-day" data-v="all"><span class="day-wd">Все</span><span class="day-dot">7</span></button>
              ${days.map((d) => `<button type="button" class="day-cir${st.day === d.iso ? " on" : ""}" data-a="mkt-day" data-v="${d.iso}"><span class="day-wd">${esc(d.wd)}</span><span class="day-dot">${d.num}</span></button>`).join("")}
            </div>
          </div>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn" style="width:100%" data-a="filter-close">Показать ${list.length} ${totalWord}</button>
        </div>
      </div>
    </div>`;
  }
  function authModalHTML() {
    if (!ui.authModal) return "";
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-label="Вход в аккаунт">
      <div style="width:min(480px,100%);min-width:0">${authCard({ modal: true })}</div>
    </div>`;
  }
  function renderModal() {
    const root = $("#modal-root");
    if (!root) return;
    if (ui.authModal) { root.innerHTML = authModalHTML(); return; }
    if (ui.filterModal) { root.innerHTML = filterModalHTML(); return; }
    if (ui.booking) { root.innerHTML = bookingModalHTML(); return; }
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
  function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "В";
    const parts = s.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
  }
  function avatarHTML(url, name, lg) {
    if (url) return `<img src="${esc(url)}" alt="">`;
    return `<span class="avatar${lg ? " lg" : ""}" aria-hidden="true">${esc(initials(name))}</span>`;
  }
  function renderChrome() {
    const inTests = ["tests", "subject", "topic", "quiz", "tutor", "essay", "home"].includes(ui.view);
    const inMarket = ui.view === "market" || ui.view === "landing";
    const inStudy = ui.view === "study" || ui.view === "plan";
    const bkCount = mkt().bookings.length;
    const nav = [
      ["tests", "Тесты", "book", inTests, 0],
      ["market", "Репетиторы", "search", inMarket, 0],
      ["study", "Учёба", "cal", inStudy, bkCount],
      ["stats", "Показатели", "chart", ui.view === "stats", 0]
    ];
    $("#side-nav").innerHTML = nav.map(([v, l, ic, cur, badge]) =>
      `<button type="button" class="nav-btn" data-a="go" data-v="${v}"${cur ? ' aria-current="page"' : ""}>${icon(ic)}<span style="flex:1">${l}</span>${badge ? `<span class="chip accent num">${badge}</span>` : ""}</button>`
    ).join("");
    $("#side-subjects").innerHTML = SUBJECTS.map((s) => {
      const cur = ["subject", "topic", "quiz", "essay"].includes(ui.view) && ui.sid === s.id && s.content;
      const right = s.content ? (store.ready ? subjectStats(s.id).pct + "%" : "") : "скоро";
      return `<button type="button" class="subj-btn" ${s.content ? `data-a="go" data-v="subject" data-sid="${s.id}"` : "disabled"}${cur ? ' aria-current="page"' : ""}><i class="dot" style="background:var(--c-${s.id})"></i><span>${esc(s.name)}</span><span class="small muted num">${right}</span></button>`;
    }).join("");
    const me = store.me, prof = profile();
    const nm = (store.user ? (prof.name || store.user.displayName || store.user.username) : "") || prof.name || (me && me.name) || (store.mode === "local" ? (store.backend ? "Гость" : "Этот браузер") : "");
    const dark = effectiveDark();
    const themeLabel = dark ? "Светлая тема" : "Тёмная тема";
    $("#side-foot").innerHTML = `<div class="side-user">
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
    const topMkt = $("#top-market");
    if (topMkt) {
      if (inMarket) topMkt.setAttribute("aria-current", "page");
      else topMkt.removeAttribute("aria-current");
    }
    const topProf = $("#top-profile");
    if (topProf) {
      if (ui.view === "profile") topProf.setAttribute("aria-current", "page");
      else topProf.removeAttribute("aria-current");
    }
    const topLogout = $("#top-logout");
    if (topLogout) topLogout.hidden = !(store.backend && store.user);
    $("#tabbar").innerHTML = nav.map(([v, l, ic, cur, badge]) =>
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
  const BRAND_MARK_HTML = '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="5" y="20" width="4" height="7" rx="2" fill="#fff" opacity=".7"/><rect x="11" y="16.5" width="4" height="10.5" rx="2" fill="#fff" opacity=".85"/><rect x="17" y="12.5" width="4" height="14.5" rx="2" fill="#fff"/><path d="M5.5 15Q15 9.5 26.5 4.9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M21.8 4.9h4.8v4.8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';
  const GOOGLE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.2 14.2A7.2 7.2 0 0 1 4.8 12c0-.8.1-1.5.4-2.2V6.7H1.2A12 12 0 0 0 0 12c0 1.9.5 3.8 1.2 5.3l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.9 11.9 0 0 0 12 0 12 12 0 0 0 1.2 6.7l4 3.1c1-2.9 3.7-5 6.8-5z"/></svg>';
  function authCard(opts) {
    opts = opts || {};
    const a = ui.auth, reg = a.tab === "register";
    const hasGoogle = !!(store.authProviders && store.authProviders.google);
    return `<form class="card pad-lg form${opts.standalone ? " auth-card" : ""}" data-f="auth">
      <div class="row between" style="flex-wrap:wrap">
        <div>
          <div class="eyebrow">Аккаунт</div>
          <h2 class="h2">${reg ? "Регистрация" : "Вход в аккаунт"}</h2>
        </div>
        ${opts.modal ? `<button type="button" class="icon-btn sm" data-a="auth-modal-close" aria-label="Закрыть">${icon("x")}</button>` : ""}
      </div>
      <div class="hh-seg" role="group" aria-label="Режим входа">
        <button type="button" data-a="auth-tab" data-tab="login" aria-pressed="${!reg}">Вход</button>
        <button type="button" data-a="auth-tab" data-tab="register" aria-pressed="${reg}">Регистрация</button>
      </div>
      <p class="ink2 small">${reg ? "Создай личный аккаунт — прогресс, расписание и баланс сохранятся на сервере." : "Войди в свой аккаунт, чтобы загрузить прогресс, расписание и баланс с сервера."}${store.backendAi && store.backendAi.enabled ? " Также заработает ИИ-разбор." : ""}</p>
      ${hasGoogle
        ? `<a class="btn ghost google-btn" href="/api/auth/google/start">${GOOGLE_SVG}<span>Продолжить через Google</span></a>`
        : `<button type="button" class="btn ghost google-btn" disabled title="Подключается через GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET на сервере">${GOOGLE_SVG}<span>Продолжить через Google</span></button>`}
      ${!hasGoogle ? '<p class="hint" style="text-align:center">Вход через Google активируется после настройки ключей на сервере.</p>' : ""}
      <div class="auth-sep"><span>или</span></div>
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
      ${a.error ? `<div class="notice">${esc(a.error)}</div>` : ""}
      <div class="row" style="flex-wrap:wrap;gap:14px">
        <button class="btn" type="submit"${a.busy ? " disabled" : ""}>${a.busy ? "Подожди…" : reg ? "Создать аккаунт" : "Войти"}</button>
        <button type="button" class="link-btn" data-a="auth-tab" data-tab="${reg ? "login" : "register"}">${reg ? "Уже есть аккаунт? Войти" : "Нет аккаунта? Создать"}</button>
      </div>
    </form>`;
  }
  function plansSectionHTML(opts) {
    opts = opts || {};
    if (!TDATA) return "";
    const st = mkt();
    const rate = st.calcRate || 800;
    const rates = [800, 1000, 1250, 1500];
    const cards = TDATA.PLANS.map((p) => {
      const picked = st.planId === p.id;
      const lessons = p.balance > 0 ? Math.max(1, Math.floor(p.balance / rate)) : 0;
      const note = p.balance > 0
        ? `≈ ${lessons} ${plural(lessons, "урок", "урока", "уроков")} по ${rate} ₽/ч с баланса`
        : "Тесты, конспекты и огромная база репетиторов";
      return `<article class="card pad-lg plan-card${p.featured ? " featured" : ""}${p.super ? " super" : ""}${picked ? " picked" : ""}">
        <div class="stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <span class="chip ${p.super || p.featured ? "accent" : p.balance ? "leaf" : ""}">${esc(p.badge)}</span>
            ${picked ? '<span class="chip good">Выбран сейчас</span>' : ""}
          </div>
          <div>
            <h3 class="h2">${esc(p.name)}</h3>
            <div class="plan-price num" style="margin-top:6px">${esc(p.priceLabel)}</div>
            <div class="small muted">${esc(p.period)}</div>
          </div>
          <p class="small ink2">${esc(p.tagline)}</p>
          <div class="chip">${esc(note)}</div>
          <ul class="plan-feats">${p.features.map((f) => `<li><span>${esc(f)}</span></li>`).join("")}</ul>
        </div>
        <div class="stack" style="gap:8px">
          <button type="button" class="btn${p.featured || p.super || picked ? "" : " soft"}" data-a="mkt-plan" data-id="${p.id}"${picked && p.id !== "free" ? ' aria-current="true"' : ""}>${picked && p.id !== "free" ? "Баланс активен · " + st.balance.toLocaleString("ru-RU") + " ₽" : esc(p.cta)}</button>
          ${p.balance > 0 ? `<button type="button" class="link-btn small muted" data-a="go" data-v="fees" style="justify-self:start">Условия оплаты и сервисный сбор →</button>` : ""}
        </div>
      </article>`;
    }).join("");
    return `<section class="land-sec" id="land-plans" aria-label="Тарифы и баланс">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">3 вида подписки · баланс на занятия</div>
          <h2 class="h2">Баланс 5 000 / 10 000 ₽ на репетиторов или базовый доступ</h2>
          <p class="small muted">Средства хранятся на балансе и списываются только после согласия преподавателя. <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent)">Подробнее об оплате и правилах сервиса →</a></p>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <span class="small muted">Ставка для расчёта:</span>
          ${rates.map((r) => `<button type="button" class="chip-btn${rate === r ? " on" : ""}" data-a="mkt-calc" data-rate="${r}">${r} ₽/ч</button>`).join("")}
        </div>
      </div>
      <div class="plan-grid">${cards}</div>
    </section>`;
  }

  /** Карточка преподавателя в стиле hh.ru без зелёных оттенков. */
  function tutorCardHTML(t, opts) {
    opts = opts || {};
    const st = mkt();
    const isFav = Array.isArray(st.favs) && st.favs.includes(t.id);
    const activeDow = opts.activeDow !== undefined ? opts.activeDow : "all";
    const daySlots = TDATA.tutorSlotsForDay(t, activeDow).slice(0, 5);
    const pickHour = opts.pickHour || (st.hour !== "all" ? st.hour : (daySlots[0] || t.availableFrom || "10:00"));
    const winTxt = t.windowLabel || ("с " + t.availableFrom + " до " + t.availableTo);
    const belowRub = t.belowRub != null ? t.belowRub : Math.max(0, (t.marketPrice || t.price) - t.price);
    const aboveRub = t.aboveRub != null ? t.aboveRub : Math.max(0, t.price - (t.marketPrice || t.price));
    const qualLine = t.qualBadge || "Высокая квалификация";
    return `<article class="card tutor-card">
      <div class="stack" style="gap:10px">
        <div class="tutor-head">
          <div style="min-width:0">
            <h3 class="h3" style="font-size:17px">Репетитор · ${esc(t.subjectName)}</h3>
            <div class="hh-price-row" style="margin-top:4px">
              ${aboveRub > 0
                ? `<div class="tutor-rate num">${t.price.toLocaleString("ru-RU")} ₽/ч</div><span class="small muted num">рынок ${t.marketPrice.toLocaleString("ru-RU")} ₽</span>`
                : `${t.marketPrice ? `<s class="hh-price-old num">${t.marketPrice.toLocaleString("ru-RU")} ₽</s>` : ""}<div class="tutor-rate num">${t.price.toLocaleString("ru-RU")} ₽/ч</div>`}
            </div>
            <div class="hh-diff-strip" style="margin-top:6px">
              ${belowRub > 0 ? `<span class="diff-tag save-cool num">на ${belowRub.toLocaleString("ru-RU")} ₽ ниже рынка</span>` : ""}
              ${t.belowPct ? `<span class="diff-tag save-cyan num">−${t.belowPct}%</span>` : ""}
              ${aboveRub > 0 ? `<span class="diff-tag pro num">на +${aboveRub.toLocaleString("ru-RU")} ₽ выше рынка</span><span class="diff-tag pro">${esc(qualLine)}</span>` : ""}
            </div>
          </div>
          <button type="button" class="fav-btn" data-a="mkt-fav" data-id="${esc(t.id)}" aria-pressed="${isFav}" aria-label="В избранное">${icon(isFav ? "heartFill" : "heart")}</button>
        </div>
        <div class="tutor-name-line">
          <b style="color:var(--ink)">${esc(t.name)}</b>
          ${t.verified ? `<span class="verified-badge" title="Проверенная анкета">${icon("check")}</span>` : ""}
          <span class="small muted">· ${esc(t.city)} · ★ ${t.rating.toFixed(1)} (${t.reviews})</span>
        </div>
        <div class="tutor-tags">
          <span class="tutor-tag-pill">${esc(t.source || "Доска Ykt")} · ${esc(winTxt)}</span>
          <span class="tutor-tag-pill">${esc(t.exams.join(" и "))}</span>
          <span class="tutor-tag-pill">${esc(t.exp)}</span>
          <span class="tutor-tag-pill">${esc(t.formats.join(" / "))}</span>
          <span class="tutor-tag-pill">${esc(t.tag)}</span>
        </div>
        <p class="tutor-bio">${esc(t.bio)}</p>
        <div class="row between small muted" style="gap:6px;flex-wrap:wrap">
          <span>${esc(t.bumpText)}</span>
          <span class="num">Можно −100 ₽ от ${t.minFair} ₽/ч</span>
        </div>
        ${daySlots.length ? `<div class="slot-mini-row">
          <span class="small muted">${opts.dayLabel ? esc(opts.dayLabel) + ":" : "Слоты:"}</span>
          ${daySlots.map((h) => `<button type="button" class="slot-mini${st.hour === h ? " picked" : ""}" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(h)}">${esc(h)}</button>`).join("")}
        </div>` : ""}
      </div>
      <div class="tutor-actions single">
        <button type="button" class="btn" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(pickHour)}">Предложить ${t.price.toLocaleString("ru-RU")} ₽</button>
      </div>
    </article>`;
  }

  function bookingsStripHTML(st) {
    if (!st.bookings.length) return "";
    return `<div class="reqs-strip">${st.bookings.map((bk) => {
      const accepted = bk.status === "accepted";
      const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId);
      const waHref = accepted
        ? TDATA.whatsappUrl(tutor || { name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" }, `Здравствуйте, ${bk.tutorName}! Напоминаю про занятие (${bk.subjectName}, ${bk.dayLabel} в ${bk.hour}, ставка ${bk.offerPrice} ₽/ч).`)
        : "";
      return `<div class="req-item">
        <div class="stack" style="gap:3px;min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <b>${esc(bk.tutorName)}</b>
            <span class="chip">${esc(bk.exam)} · ${esc(bk.subjectName)}</span>
            <span class="chip ${accepted ? "accent" : "notif"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>
          </div>
          <div class="small ink2">${esc(bk.dayLabel)} в ${esc(bk.hour)} (${esc(bk.format)}) · твоя ставка <b class="num">${bk.offerPrice} ₽/ч</b> <span class="muted">(вместо ${bk.tutorPrice} ₽)</span></div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${accepted ? `<a class="wa-btn" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать</span></a>` : ""}
          ${!accepted ? `<button type="button" class="btn soft sm" data-a="mkt-sim-accept" data-id="${esc(bk.id)}">Тест: подтвердить</button>` : ""}
          <button type="button" class="btn ghost sm" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">${accepted ? "Сменить репетитора" : "Отменить"}</button>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function marketSectionHTML(opts) {
    opts = opts || {};
    if (!TDATA) return "";
    const st = mkt();
    const days = TDATA.buildCalendarDays(7);
    const activeDayObj = st.day !== "all" ? (days.find((d) => d.iso === st.day) || null) : null;
    const activeDow = activeDayObj ? activeDayObj.dow : "all";
    const list = TDATA.filterTutors(st, days);
    const activePlan = TDATA.PLANS.find((p) => p.id === st.planId) || TDATA.PLANS[0];
    const fCount = activeFilterCount(st);

    const dayPills = `<button type="button" class="day-cir${st.day === "all" ? " on" : ""}" data-a="mkt-day" data-v="all">
        <span class="day-wd">Все</span>
        <span class="day-dot">7</span>
        <span class="day-cnt">${days[0].num}–${days[days.length - 1].num} ${days[0].month}</span>
      </button>` + days.map((d) => {
        const cnt = TDATA.countForDay(st, d.dow);
        return `<button type="button" class="day-cir${st.day === d.iso ? " on" : ""}" data-a="mkt-day" data-v="${d.iso}">
          <span class="day-wd">${esc(d.wd)}</span>
          <span class="day-dot">${d.num}</span>
          <span class="day-cnt">${cnt ? cnt + " преп." : "нет"}</span>
        </button>`;
      }).join("");

    const hourPills = `<button type="button" class="hr-cir${st.hour === "all" ? " on" : ""}" data-a="mkt-hour" data-v="all">Любое</button>` +
      TDATA.HOURS.map((h) => {
        const cnt = TDATA.countForHour(st, activeDow, h);
        return `<button type="button" class="hr-cir${st.hour === h ? " on" : ""}${cnt === 0 ? " empty-slot" : ""}" data-a="mkt-hour" data-v="${esc(h)}"><span>${esc(h)}</span><span class="hr-cnt">${cnt}</span></button>`;
      }).join("");

    const activeChips = [];
    if (st.subject !== "all") {
      const sb = TDATA.SUBJECTS.find((x) => x.id === st.subject);
      if (sb) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="subject">${esc(sb.short)} ×</button>`);
    }
    if (st.format !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="format">${esc(st.format)} ×</button>`);
    if (st.maxPrice < 2000) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="maxPrice">до ${st.maxPrice} ₽ ×</button>`);
    if (st.onlyBumped) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="onlyBumped">Подняты сегодня ×</button>`);
    if (st.hour !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="hour">${esc(st.hour)} ×</button>`);

    const sortLabels = { actual: "По соответствию", price_asc: "Сначала дешевле", rating_desc: "По рейтингу" };
    const cardsHTML = list.length
      ? `<div class="tutor-grid">${list.map((t) => tutorCardHTML(t, { activeDow, dayLabel: activeDayObj ? activeDayObj.wd : "" })).join("")}</div>`
      : `<div class="empty">
          <b>По выбранным фильтрам и времени пока никого нет.</b>
          <span>Попробуй расширить бюджет, выбрать «Все» дни или сбросить час.</span>
          <button type="button" class="btn soft sm" data-a="mkt-reset">Сбросить фильтры</button>
        </div>`;

    const selTimeDesc = (activeDayObj ? activeDayObj.shortLabel : "Все 7 дней") + " · " + (st.hour === "all" ? "любое время" : st.hour);
    const mktHourNum = st.hour !== "all" ? Math.max(10, Math.min(20, parseInt(String(st.hour).split(":")[0], 10) || 10)) : 10;
    const mktHourPct = Math.round(((mktHourNum - 10) / 10) * 100);

    return `<section class="land-sec" id="land-market" aria-label="Маркетплейс репетиторов">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Огромная база · ${TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL.toLocaleString("ru-RU") + "+ анкет" : "Ykt, Telegram, WhatsApp, MAX и др."}</div>
          <h2 class="h2">Ищи репетиторов ниже рынка для любой задачи</h2>
        </div>
      </div>
      <div class="hh-seg" role="group" aria-label="Цель подготовки">
        ${[["all", "Любая цель"], ["ЕГЭ", "ЕГЭ"], ["ОГЭ", "ОГЭ"], ["Навыки", "Навыки и ВУЗ"]].map(([v, l]) => `<button type="button" data-a="mkt-exam" data-v="${v}" aria-pressed="${st.exam === v}">${l}</button>`).join("")}
      </div>

      <div class="hh-search-box">
        <span class="hh-search-ico">${icon("search")}</span>
        <input class="hh-search-input" id="mkt-q" type="search" autocomplete="off" spellcheck="false" value="${esc(st.q || "")}" placeholder="ЕГЭ, Python, UX/UI, моушен-дизайн, вокал, физика или имя репетитора">
        ${st.q ? `<button type="button" class="search-clear" data-a="mkt-clear-q" aria-label="Очистить">${icon("x")}</button>` : ""}
      </div>

      <div class="chip-rail swipe" role="group" aria-label="Быстрые фильтры">
        <button type="button" class="chip-btn${fCount ? " on" : ""}" data-a="filter-open">${icon("sliders")}<span>${fCount ? fCount : "Фильтры"}</span></button>
        ${activeChips.join("")}
        ${!st.onlyBumped ? `<button type="button" class="chip-btn" data-a="mkt-bumped">+ Актуальные сегодня</button>` : ""}
        ${st.maxPrice >= 2000 ? `<button type="button" class="chip-btn" data-a="mkt-price" data-v="1300">+ До 1 300 ₽</button>` : ""}
        <button type="button" class="chip-btn" data-a="mkt-preset">+ Английский · Сб 10:00</button>
        ${TDATA.SUBJECTS.filter((sb) => sb.id !== st.subject).map((sb) => `<button type="button" class="chip-btn" data-a="mkt-subj" data-v="${sb.id}">+ ${esc(sb.short)}</button>`).join("")}
      </div>

      <div class="wallet-bar">
        <div class="stack" style="gap:2px">
          <span class="small muted">Тариф: <b style="color:var(--ink)">${esc(activePlan.name)}</b></span>
          <div class="row" style="gap:10px;align-items:baseline">
            <span class="wallet-num num">${st.balance.toLocaleString("ru-RU")} ₽</span>
            <span class="small muted">${st.balance ? "доступно на уроки с любым репетитором" : "пополни баланс 5 000 или 10 000 ₽ для записи с гарантией"}</span>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn ${st.planId === "trial5k" ? "" : "soft"} sm" data-a="mkt-plan" data-id="trial5k">Баланс 5 000 ₽</button>
          <button type="button" class="btn ${st.planId === "month10k" ? "" : "soft"} sm" data-a="mkt-plan" data-id="month10k">Баланс 10 000 ₽</button>
        </div>
      </div>

      ${bookingsStripHTML(st)}

      <div class="card mkt-controls">
        <div class="cal-label">
          <b>Когда удобно заниматься (10:00 – 20:00)</b>
          <span class="chip accent">${esc(selTimeDesc)}</span>
        </div>
        <div class="cal-days" aria-label="Дни недели">${dayPills}</div>
        <div class="hh-time-picker">
          <div class="row between">
            <span class="small muted">Ползунок часа с 10:00 до 20:00</span>
            <div class="row" style="gap:6px">
              <button type="button" class="chip-btn${st.hour === "all" ? " on" : ""}" data-a="mkt-hour" data-v="all">Любое время</button>
              <span class="hh-time-val num" id="mkt-hour-pill">${st.hour === "all" ? "Все часы" : esc(st.hour)}</span>
            </div>
          </div>
          <input class="hh-time-range" id="mkt-hour-range" type="range" min="10" max="20" step="1" value="${mktHourNum}" style="--pct:${mktHourPct}%" aria-label="Выбрать час с 10:00 до 20:00">
          <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
        </div>
        <div class="hour-circles" aria-label="Часы занятий">${hourPills}</div>
        <div class="small muted">Анкеты объединены с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов — выбирай удобный час или предлагай свою ставку.</div>
      </div>

      <div class="hh-sort-row">
        <span class="small muted">${list.length} ${plural(list.length, "репетитор", "репетитора", "репетиторов")}</span>
        <button type="button" class="hh-sort-btn" data-a="mkt-sort-cycle">${esc(sortLabels[st.sort] || "По соответствию")} ${icon("sort")}</button>
      </div>

      ${cardsHTML}
    </section>`;
  }

  function demoPool(sid) {
    const subj = SUBJ[sid] || (CONTENT[0] && CONTENT[0].content);
    if (!subj) return [];
    const list = [];
    for (const t of (subj.topicList || [])) {
      for (const q of (t.q || [])) {
        if (q && q.t === "single" && !q.ctx && !q.svg && Array.isArray(q.o) && Number.isInteger(q.a) && q.q && q.q.length <= 260) {
          list.push(q);
          if (list.length >= 6) return list;
        }
      }
    }
    return list;
  }

  function demoSectionHTML(inside) {
    const dm = ui.demo || (ui.demo = { tab: "quiz", sid: firstSubject.id, qIdx: 0, pick: null, revealed: false, topicIdx: 0, bidRate: 800, bidHour: "10:00" });
    const subjObj = CONTENT.find((s) => s.id === dm.sid) || CONTENT[0];
    const sid = subjObj ? subjObj.id : firstSubject.id;
    const totalQ = CONTENT.reduce((acc, s) => acc + (s.content && s.content.topics ? Object.keys(s.content.topics).reduce((n, k) => n + ((s.content.topics[k].q || []).length), 0) : 0), 0) || Object.keys(QS).length;
    const totalTopics = CONTENT.reduce((acc, s) => acc + ((s.content && s.content.topicList) ? s.content.topicList.length : 0), 0);

    let body = "";
    if (dm.tab === "notes") {
      const tList = (subjObj && subjObj.content && subjObj.content.topicList) ? subjObj.content.topicList : [];
      const curIdx = tList.length ? (dm.topicIdx % tList.length) : 0;
      const t = tList[curIdx] || null;
      const chips = CONTENT.map((s) => `<button type="button" class="chip-btn${s.id === sid ? " on" : ""}" data-a="demo-subj" data-sid="${esc(s.id)}">${esc(s.name)}</button>`).join("");
      const tBtns = tList.slice(0, 4).map((tp, idx) => `<button type="button" class="chip-btn${idx === curIdx ? " on" : ""}" data-a="demo-topic" data-i="${idx}">${esc(tp.title.length > 28 ? tp.title.slice(0, 26) + "…" : tp.title)}</button>`).join("");
      const bullets = t ? (t.theory || []).slice(0, 6).map((x) => x.startsWith("## ") ? `<li class="th-h">${rich(x.slice(3))}</li>` : `<li>${rich(x)}</li>`).join("") : "";
      const tbl = t && t.tables && t.tables.length ? tablesHTML({ tables: [t.tables[0]] }) : "";
      body = `<div class="chip-rail">${chips}</div>
        ${tBtns ? `<div class="chip-rail">${tBtns}</div>` : ""}
        ${t ? `<div class="card pad-lg stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div><div class="eyebrow">${esc(subjObj.name)} · конспект темы</div><h3 class="h3">${esc(t.title)}</h3></div>
            <span class="chip accent">${(t.q || []).length} заданий</span>
          </div>
          <ul class="theory">${bullets}</ul>
          ${tbl}
        </div>` : `<div class="empty">Выбери предмет для просмотра конспекта.</div>`}`;
    } else if (dm.tab === "calc") {
      const rate = Math.max(500, Math.min(3000, Number(dm.bidRate) || 800));
      const rates = [700, 800, 1000, 1200];
      const n5 = Math.max(1, Math.floor(5000 / rate));
      const n10 = Math.max(1, Math.floor(10000 / rate));
      const marketEx = 1650;
      const saveRub = Math.max(0, marketEx - rate);
      const sampleTut = TDATA && TDATA.LIST[0];
      const winLabel = sampleTut ? sampleTut.windowLabel : "с 09:00 до 19:00";
      const previewTxt = TDATA ? TDATA.botPreviewText({
        exam: "ЕГЭ",
        subjectName: sampleTut ? sampleTut.subjectName : "Английский язык",
        format: "онлайн",
        dayLabel: "ближайшая суббота",
        hour: dm.bidHour || "10:00",
        offerPrice: rate,
        tutorPrice: sampleTut ? sampleTut.price : 1200
      }) : "";
      body = `<div class="demo-grid">
        <div class="card stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>Выбери свою ставку за урок</b>
            <span class="chip">${esc(winLabel)} · Ykt, TG, WA, MAX</span>
          </div>
          <div class="chip-rail">
            ${rates.map((r) => `<button type="button" class="chip-btn${rate === r ? " on" : ""}" data-a="demo-rate" data-rate="${r}">${r} ₽/ч</button>`).join("")}
            <input class="input num" id="demo-rate-inp" type="number" min="500" max="3000" step="50" value="${rate}" aria-label="Своя ставка в рублях" style="width:110px">
          </div>
          <div class="fee-split-box">
            <div class="fee-pill"><span>Цена часа</span><b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b></div>
            <div class="fee-pill"><span>Выгода от рынка</span><b class="num">${saveRub > 0 ? "−" + saveRub.toLocaleString("ru-RU") + " ₽" : "По рынку"}</b></div>
            <div class="fee-pill"><span>На «Пробнике» 5 000 ₽</span><b class="num">${n5} ${plural(n5, "урок", "урока", "уроков")}</b></div>
          </div>
          <p class="small muted">На тарифе 10 000 ₽ выйдет примерно <b>${n10} ${plural(n10, "урок", "урока", "уроков")}</b>. Оплата замораживается только после согласия преподавателя. <button type="button" class="link-btn small" data-a="go" data-v="fees">Правила оплаты →</button></p>
        </div>
        <div class="card stack" style="gap:10px">
          <b class="small">Карточка заявки (пришлём уведомление при ответе)</b>
          <div class="bot-preview"><span>${esc(previewTxt)}</span></div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn sm" data-a="land-scroll" data-target="land-market">Выбрать время и преподавателя</button>
          </div>
        </div>
      </div>`;
    } else {
      const pool = demoPool(sid);
      const q = pool.length ? pool[dm.qIdx % pool.length] : null;
      const tp = q && TOPICS[q.topic];
      const chips = CONTENT.map((s) => `<button type="button" class="chip-btn${s.id === sid ? " on" : ""}" data-a="demo-subj" data-sid="${esc(s.id)}">${esc(s.name)}</button>`).join("");
      const optsHTML = q ? q.o.map((opt, idx) => {
        const picked = dm.pick === idx;
        const ok = dm.revealed && idx === q.a;
        const bad = dm.revealed && picked && idx !== q.a;
        return `<button type="button" class="demo-opt${ok ? " ok" : bad ? " bad" : picked ? " picked" : ""}" data-a="demo-pick" data-i="${idx}"${dm.revealed ? " disabled" : ""}><span><b>${idx + 1}.</b> ${esc(opt)}</span><span class="small muted">${ok ? "Верно" : bad ? "Ошибка" : ""}</span></button>`;
      }).join("") : "";
      const fb = q && dm.revealed
        ? `<div class="feedback" data-r="${dm.pick === q.a ? "2" : "0"}"><div class="fb-title">${icon(dm.pick === q.a ? "check" : "x")}${dm.pick === q.a ? "Верно!" : `Ошибка · правильный ответ: ${esc(q.o[q.a])}`}</div>${q.e ? `<div class="small ink2">${esc(q.e)}</div>` : ""}</div>`
        : "";
      body = `<div class="demo-grid">
        <div class="card stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div class="chip-rail">${chips}</div>
            ${q ? `<span class="chip accent">Вопрос ${(dm.qIdx % pool.length) + 1} / ${pool.length}</span>` : ""}
          </div>
          ${q ? `<div class="stack" style="gap:8px">
            ${tp ? `<div class="small muted">Тема: ${esc(tp.title)}</div>` : ""}
            <div style="font-size:16px;font-weight:600;line-height:1.45">${esc(q.q)}</div>
            <div class="stack" style="gap:8px">${optsHTML}</div>
            ${fb}
            <div class="row between" style="gap:8px;flex-wrap:wrap;padding-top:4px">
              <button type="button" class="btn soft sm" data-a="demo-next">Следующий вопрос</button>
              <button type="button" class="btn ghost sm" data-a="demo-tab" data-tab="notes">Открыть конспект</button>
            </div>
          </div>` : `<div class="empty">Вопросы загружаются…</div>`}
        </div>
        <div class="card stack" style="gap:10px">
          <div class="eyebrow">Что внутри тренажёра</div>
          <h3 class="h3">${totalQ}+ заданий ЕГЭ и ${totalTopics} конспекта</h3>
          <p class="small ink2">Каждый вопрос связан со справочником: если ошибся — сразу видишь разбор и ссылку на нужный конспект, а сложные номера попадают в повторение.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:4px">
            ${inside
              ? `<button type="button" class="btn sm" data-a="go" data-v="tests">Перейти к тренажёру</button>`
              : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти и сохранять прогресс</button>`}
          </div>
        </div>
      </div>`;
    }

    return `<section class="land-sec" id="land-demo" aria-label="Пример работы бета">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Пример работы · Бета</div>
          <h2 class="h2">Потыкай прямо сейчас: тест ЕГЭ, конспект и калькулятор ставки</h2>
          <p class="small muted">Без регистрации можно проверить задания по биологии, русскому и химии, полистать шпаргалку и прикинуть стоимость урока.</p>
        </div>
      </div>
      <div class="demo-box">
        <div class="hh-seg" role="group" aria-label="Режим бета-примера">
          <button type="button" data-a="demo-tab" data-tab="quiz" aria-pressed="${dm.tab === "quiz"}">Мини-тест ЕГЭ</button>
          <button type="button" data-a="demo-tab" data-tab="notes" aria-pressed="${dm.tab === "notes"}">Конспекты</button>
          <button type="button" data-a="demo-tab" data-tab="calc" aria-pressed="${dm.tab === "calc"}">Калькулятор ставки</button>
        </div>
        ${body}
      </div>
    </section>`;
  }

  const MOTION_PRESETS = {
    design: { id: "design", label: "UX/UI и Моушен", short: "Моушен-дизайн", tutorId: "tut-kovalev", fallbackName: "Денис Ковалёв", role: "Figma · After Effects · портфолио", defaultHour: 10, defaultOffer: 1200 },
    eng: { id: "eng", label: "Английский", short: "Английский", tutorId: "tut-sokolova", fallbackName: "Анна Соколова", role: "ЕГЭ 90+ · ОГЭ · разговорный", defaultHour: 12, defaultOffer: 1200 },
    inf: { id: "inf", label: "Python и IT", short: "Python / КЕГЭ", tutorId: "tut-lebedev", fallbackName: "Роман Лебедев", role: "Python · алгоритмы · №24–27", defaultHour: 16, defaultOffer: 1300 },
    music: { id: "music", label: "Вокал и гитара", short: "Вокал и гитара", tutorId: "tut-melnikova", fallbackName: "Алина Мельникова", role: "Постановка голоса · акустика", defaultHour: 18, defaultOffer: 900 }
  };
  const MOTION_ORDER = ["design", "eng", "inf", "music"];
  let motionTimer = null;
  let motionPulseTimer = null;

  function parseHourInt(slot) {
    const n = parseInt(String(slot || "10").split(":")[0], 10);
    return Number.isFinite(n) ? Math.max(10, Math.min(20, n)) : 10;
  }

  function heroMotionMeta() {
    const m = ui.motion || (ui.motion = { playing: true, preset: "design", step: 0, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" });
    const preset = MOTION_PRESETS[m.preset] || MOTION_PRESETS.design;
    const list = TDATA && TDATA.LIST ? TDATA.LIST : [];
    const tutor = list.find((t) => t.id === preset.tutorId) || list[0] || {
      id: preset.tutorId,
      name: preset.fallbackName,
      subject: preset.id,
      subjectName: preset.label,
      source: "Доска Ykt · Telegram · MAX",
      price: 1200,
      marketPrice: 2000,
      minFair: 900,
      belowPct: 40,
      whatsapp: "79142100100"
    };
    const market = tutor.marketPrice || Math.round(((tutor.price || 1200) * 1.45) / 50) * 50;
    const tutorPrice = tutor.price || 1200;
    const minOffer = Math.max(500, Math.round(((tutor.minFair || tutorPrice * 0.72) - 100) / 100) * 100);
    const maxOffer = Math.max(market + 600, tutorPrice + 600);
    const offer = Math.max(minOffer, Math.min(maxOffer, Number(m.offer) || preset.defaultOffer || tutorPrice));
    const belowMarketRub = Math.max(0, market - offer);
    const aboveMarketRub = Math.max(0, offer - market);
    const belowTutorRub = Math.max(0, tutorPrice - offer);
    const aboveTutorRub = Math.max(0, offer - tutorPrice);
    const offerBelowPct = market > offer ? Math.round(((market - offer) / market) * 100) : 0;
    const hourNum = parseHourInt(m.slot);
    const slot = String(hourNum).padStart(2, "0") + ":00";
    const hourPct = Math.round(((hourNum - 10) / 10) * 100);
    const split = TDATA && TDATA.commissionSplit
      ? TDATA.commissionSplit(offer)
      : { total: offer, fee: Math.round(offer * 0.05), payout: offer - Math.round(offer * 0.05), pct: 5 };
    return { m, preset, tutor, market, tutorPrice, minOffer, maxOffer, offer, belowMarketRub, aboveMarketRub, belowTutorRub, aboveTutorRub, offerBelowPct, hourNum, slot, hourPct, split };
  }

  function bidBtnLabelHTML(sent, price) {
    const pStr = Number(price || 0).toLocaleString("ru-RU");
    return sent ? ("✓ Подтверждено · " + pStr + " ₽") : ("Предложить " + pStr + " ₽");
  }

  function priceHeadlineHTML(marketPrice, offerPrice, isLg) {
    const mktP = Number(marketPrice) || 0;
    const offP = Number(offerPrice) || 0;
    const lgCls = isLg ? " lg" : "";
    if (mktP && offP < mktP) {
      return `<s class="hh-price-old${lgCls} num">${mktP.toLocaleString("ru-RU")} ₽</s><b class="hh-price-now${lgCls} num">${offP.toLocaleString("ru-RU")} ₽/ч</b>`;
    }
    if (mktP && offP > mktP) {
      return `<b class="hh-price-now${lgCls} num">${offP.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted num">рынок ${mktP.toLocaleString("ru-RU")} ₽</span>`;
    }
    return `<b class="hh-price-now${lgCls} num">${offP.toLocaleString("ru-RU")} ₽/ч</b>`;
  }

  function priceDiffTagsHTML(opts) {
    opts = opts || {};
    const tutorPrice = Number(opts.tutorPrice) || 1200;
    const marketPrice = Number(opts.marketPrice) || tutorPrice;
    const offerPrice = Number(opts.offerPrice) || tutorPrice;
    const showAsk = opts.showAsk !== false;
    const diffTutor = Math.max(0, tutorPrice - offerPrice);
    const aboveTutor = Math.max(0, offerPrice - tutorPrice);
    const diffMarket = Math.max(0, marketPrice - offerPrice);
    const aboveMarket = Math.max(0, offerPrice - marketPrice);
    const pctOff = marketPrice > offerPrice ? Math.round(((marketPrice - offerPrice) / marketPrice) * 100) : 0;
    const pctAbove = marketPrice > 0 && aboveMarket > 0 ? Math.round((aboveMarket / marketPrice) * 100) : 0;
    const tags = [];
    if (showAsk) tags.push(`<span class="diff-tag rate num">Анкета ${tutorPrice.toLocaleString("ru-RU")} ₽</span>`);
    if (diffTutor > 0) tags.push(`<span class="diff-tag save-hot num">на ${diffTutor.toLocaleString("ru-RU")} ₽ ниже анкеты</span>`);
    else if (aboveTutor > 0) tags.push(`<span class="diff-tag confirm num">+${aboveTutor.toLocaleString("ru-RU")} ₽ к анкете</span>`);
    if (diffMarket > 0) {
      tags.push(`<span class="diff-tag save-cool num">на ${diffMarket.toLocaleString("ru-RU")} ₽ ниже рынка</span>`);
      if (pctOff > 0) tags.push(`<span class="diff-tag save-cyan num">−${pctOff}%</span>`);
    } else if (aboveMarket > 0) {
      tags.push(`<span class="diff-tag pro num">на +${aboveMarket.toLocaleString("ru-RU")} ₽ выше рынка (+${pctAbove}%)</span>`);
      tags.push(`<span class="diff-tag pro">${esc(opts.qualBadge || "Высокая квалификация")}</span>`);
    } else {
      tags.push(`<span class="diff-tag rate">По средней цене рынка</span>`);
    }
    return tags.join("");
  }

  function sliderTicksHTML(hourNum, style) {
    const h = Math.max(10, Math.min(20, Number(hourNum) || 10));
    if (style === "clean") return "";
    if (style === "ruler") {
      return `<div class="hh-slider-ticks ruler" aria-hidden="true">${[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((tick) => {
        const cls = (tick % 2 === 0 ? "major" : "") + (tick === h ? " on" : "");
        return `<i${cls ? ` class="${cls.trim()}"` : ""} data-tick="${tick}"></i>`;
      }).join("")}</div>`;
    }
    return `<div class="hh-slider-ticks" aria-hidden="true">${[10, 12, 14, 16, 18, 20].map((tick) => {
      return `<i${Math.abs(tick - h) <= 1 ? ' class="on"' : ""} data-tick="${tick}"></i>`;
    }).join("")}</div>`;
  }

  const BB_DAYS = [
    { id: "all", wd: "Все", num: "7", full: "Все 7 дней" },
    { id: "sat", wd: "Сб", num: "14", full: "Сб 14" },
    { id: "sun", wd: "Вс", num: "15", full: "Вс 15" },
    { id: "mon", wd: "Пн", num: "16", full: "Пн 16" }
  ];

  function bbDayObj(dayId) {
    return BB_DAYS.find((d) => d.id === dayId) || BB_DAYS[0];
  }

  function motionDiffHTML(meta) {
    return priceDiffTagsHTML({
      tutorPrice: meta.tutorPrice,
      marketPrice: meta.market,
      offerPrice: meta.offer,
      qualBadge: (meta.tutor && meta.tutor.qualBadge) || "Высокая квалификация"
    });
  }

  function motionStatusHTML(meta) {
    if (meta.m.sent) {
      return `<span class="row" style="gap:7px;align-items:center"><span class="live-dot" style="background:var(--confirm)" aria-hidden="true"></span><b style="color:var(--confirm)">Подтверждено · ${esc(meta.slot)} · ${meta.offer.toLocaleString("ru-RU")} ₽</b></span>
        <span class="chip confirm">Заявка отправлена · уведомим</span>`;
    }
    return `<span class="small muted">Заявка уйдёт с ценой <b class="num">${meta.offer.toLocaleString("ru-RU")} ₽/ч</b> на ${esc(meta.slot)}</span>
      <button type="button" class="link-btn small" data-a="motion-book-now">Выбрать день →</button>`;
  }

  function heroMotionInnerHTML() {
    const meta = heroMotionMeta();
    const { m, preset, tutor, offer, hourNum, slot, hourPct } = meta;

    const presetPills = MOTION_ORDER.map((id) => {
      const p = MOTION_PRESETS[id];
      const on = preset.id === id;
      return `<button type="button" class="chip-btn${on ? " on" : ""}" data-a="motion-preset" data-v="${id}" style="flex:none">${esc(p.label)}</button>`;
    }).join("");

    return `<div class="motion-cursor${m.clicking ? " clicking" : ""}" id="hero-motion-cursor" aria-hidden="true" style="left:36%;top:220px">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M4.5 3.5L19.5 11.2L12.6 13.5L9.8 20.5L4.5 3.5Z" fill="#ffffff" stroke="#2f7cff" stroke-width="1.8" stroke-linejoin="round"/></svg>
        <span class="cursor-ring"></span>
      </div>
      <div class="motion-head-rail">
        <div class="motion-preset-rail" role="group" aria-label="Направления подготовки">${presetPills}</div>
        <button type="button" class="chip-btn" data-a="motion-toggle" style="padding:5px 10px;font-size:11.5px;flex:none;gap:5px"><span class="live-dot" style="${m.playing ? "" : "opacity:.35;animation:none"}"></span><span>${m.playing ? "Пауза" : "Авто"}</span></button>
      </div>
      <div class="motion-card-body">
        <div class="row between" style="align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div class="row" style="gap:10px;min-width:0">
            <span class="tutor-avatar" aria-hidden="true">${esc(initials(tutor.name))}</span>
            <div class="stack" style="gap:2px;min-width:0">
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <b>${esc(tutor.name)}</b>
                <span class="badge accent">${esc(preset.short)}</span>
              </div>
              <span class="small muted">${esc(tutor.source || "Доска Ykt · Telegram · MAX")} · ${esc(preset.role)}</span>
            </div>
          </div>
        </div>
        <div class="stack" style="gap:6px">
          <div class="hh-price-row" data-m="price-row">
            ${priceHeadlineHTML(meta.market, offer, true)}
          </div>
          <div class="hh-diff-strip" data-m="diff-strip">${motionDiffHTML(meta)}</div>
        </div>
        <div class="hh-time-picker">
          <div class="row between">
            <span class="small muted">Удобный час с 10:00 до 20:00</span>
            <span class="hh-time-val num" data-m="hour-pill">Сб · ${esc(slot)}</span>
          </div>
          <input class="hh-time-range" id="hero-hour-range" type="range" min="10" max="20" step="1" value="${hourNum}" style="--pct:${hourPct}%" data-mstep-target="0" aria-label="Удобный час с 10:00 до 20:00">
          ${sliderTicksHTML(hourNum, "ticks")}
          <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
        </div>
        <div class="hh-price-stepper">
          <button type="button" class="hh-step-btn${m.hitTarget === "minus" ? " is-hit" : ""}" id="hero-price-minus" data-a="motion-step-price" data-step="-100" data-mstep-target="1" aria-label="Снизить цену на 100 рублей">−100 ₽</button>
          <div class="hh-step-readout">
            <b class="num" data-m="offer-val">${offer.toLocaleString("ru-RU")} ₽/ч</b>
            <span class="small muted">твоя ставка</span>
          </div>
          <button type="button" class="hh-step-btn${m.hitTarget === "plus" ? " is-hit" : ""}" id="hero-price-plus" data-a="motion-step-price" data-step="100" aria-label="Повысить цену на 100 рублей">+100 ₽</button>
        </div>
        <button type="button" class="btn motion-bid-btn${(m.clicking && m.hitTarget === "bid") ? " is-pressed" : ""}${m.sent ? " is-confirmed" : ""}" id="hero-motion-bid-btn" data-a="motion-bid-press" data-mstep-target="2">
          <span data-m="offer-btn-lbl">${bidBtnLabelHTML(m.sent, offer)}</span>
        </button>
        <div class="hh-motion-status${m.sent ? " sent" : ""}" id="hero-motion-status" data-mstep-target="3" data-m="status-strip">
          ${motionStatusHTML(meta)}
        </div>
      </div>`;
  }

  function heroMotionStageHTML() {
    const m = ui.motion || { playing: true };
    return `<div class="motion-stage${m.playing ? "" : " paused"}" id="hero-motion-stage" aria-label="Быстрый выбор времени и цены">
      ${heroMotionInnerHTML()}
    </div>`;
  }

  function positionMotionCursor(stage, step) {
    if (!stage || typeof stage.querySelector !== "function" || typeof stage.getBoundingClientRect !== "function") return;
    const cursor = stage.querySelector("#hero-motion-cursor");
    if (!cursor || !cursor.style) return;
    const fallbacks = [
      ["42%", "215px"],
      ["18%", "286px"],
      ["50%", "346px"],
      ["54%", "398px"]
    ];
    const target = stage.querySelector('[data-mstep-target="' + step + '"]');
    const sr = stage.getBoundingClientRect();
    if (target && typeof target.getBoundingClientRect === "function" && sr && sr.width > 0 && sr.height > 0) {
      const tr = target.getBoundingClientRect();
      let x = tr.left - sr.left + tr.width * 0.52;
      let y = tr.top - sr.top + tr.height * 0.54;
      if (step === 0 && target.type === "range") {
        const mn = Number(target.min) || 10;
        const mx = Number(target.max) || 20;
        const val = Number(target.value) || 10;
        const pct = Math.max(0.06, Math.min(0.94, (val - mn) / Math.max(1, mx - mn)));
        x = tr.left - sr.left + tr.width * pct;
      }
      x = Math.max(12, Math.min(sr.width - 26, x));
      y = Math.max(14, Math.min(sr.height - 26, y));
      cursor.style.left = Math.round(x) + "px";
      cursor.style.top = Math.round(y) + "px";
    } else {
      const fb = fallbacks[step] || fallbacks[0];
      cursor.style.left = fb[0];
      cursor.style.top = fb[1];
    }
  }

  function patchHeroMotionDOM(opts) {
    opts = opts || {};
    const stage = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
    if (!stage || typeof stage.querySelector !== "function") {
      if (!opts.noRender) scheduleRender();
      return;
    }
    const meta = heroMotionMeta();
    const step = Math.max(0, Math.min(3, Number(meta.m.step) || 0));
    if (opts.liveOnly) {
      const q = (s) => stage.querySelector(s);
      if (stage.classList) stage.classList.toggle("paused", !meta.m.playing);
      const togBtn = q('[data-a="motion-toggle"]');
      if (togBtn) togBtn.innerHTML = `<span class="live-dot" style="${meta.m.playing ? "" : "opacity:.35;animation:none"}"></span><span>${meta.m.playing ? "Пауза" : "Авто"}</span>`;
      const hp = q('[data-m="hour-pill"]');
      if (hp) hp.textContent = "Сб · " + meta.slot;
      const rng = q("#hero-hour-range");
      if (rng) {
        if (String(rng.value) !== String(meta.hourNum)) rng.value = String(meta.hourNum);
        if (rng.style && rng.style.setProperty) rng.style.setProperty("--pct", meta.hourPct + "%");
      }
      if (typeof stage.querySelectorAll === "function") {
        stage.querySelectorAll(".hh-slider-ticks i").forEach((it) => {
          const tv = Number(it.getAttribute && it.getAttribute("data-tick")) || 0;
          if (it.classList) it.classList.toggle("on", Math.abs(tv - meta.hourNum) <= 1);
        });
      }
      const pRow = q('[data-m="price-row"]');
      if (pRow) pRow.innerHTML = priceHeadlineHTML(meta.market, meta.offer, true);
      const ds = q('[data-m="diff-strip"]');
      if (ds) ds.innerHTML = motionDiffHTML(meta);
      const oval = q('[data-m="offer-val"]');
      if (oval) oval.textContent = meta.offer.toLocaleString("ru-RU") + " ₽/ч";
      const curBtn = q("#hero-motion-bid-btn");
      if (curBtn && curBtn.classList) {
        curBtn.classList.toggle("is-confirmed", !!meta.m.sent);
        curBtn.classList.toggle("is-pressed", !!(meta.m.clicking && meta.m.hitTarget === "bid"));
      }
      const lbl = q('[data-m="offer-btn-lbl"]');
      if (lbl) lbl.textContent = bidBtnLabelHTML(meta.m.sent, meta.offer);
      const hm = q("#hero-price-minus");
      if (hm && hm.classList) hm.classList.toggle("is-hit", meta.m.hitTarget === "minus");
      const hpl = q("#hero-price-plus");
      if (hpl && hpl.classList) hpl.classList.toggle("is-hit", meta.m.hitTarget === "plus");
      const curEl = q("#hero-motion-cursor");
      if (curEl && curEl.classList) curEl.classList.toggle("clicking", !!meta.m.clicking);
      const st = q("#hero-motion-status");
      if (st) {
        if (st.classList) st.classList.toggle("sent", !!meta.m.sent);
        st.innerHTML = motionStatusHTML(meta);
      }
      positionMotionCursor(stage, step);
      syncHeroMotion();
      return;
    }
    if (stage.classList) stage.classList.toggle("paused", !meta.m.playing);
    stage.innerHTML = heroMotionInnerHTML();
    syncHeroMotion();
  }

  function stopMotionTimers() {
    if (motionTimer && typeof clearTimeout === "function") { clearTimeout(motionTimer); motionTimer = null; }
    if (motionPulseTimer && typeof clearTimeout === "function") { clearTimeout(motionPulseTimer); motionPulseTimer = null; }
  }

  function syncHeroMotion() {
    const stage = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
    if (!stage || typeof stage.querySelector !== "function") {
      stopMotionTimers();
      return;
    }
    const m = ui.motion || { playing: true, step: 0 };
    const place = () => positionMotionCursor(stage, Math.max(0, Math.min(3, Number(m.step) || 0)));
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(place);
    else place();

    const visible = typeof document.visibilityState === "undefined" || document.visibilityState !== "hidden";
    if (!m.playing || !visible) {
      stopMotionTimers();
      return;
    }
    if (motionTimer || typeof setTimeout !== "function") return;
    const delay = m.step === 3 ? 2500 : 1850;
    motionTimer = setTimeout(() => {
      motionTimer = null;
      const curStage = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
      if (!curStage || !ui.motion || !ui.motion.playing) return;
      const nextStep = (Number(ui.motion.step || 0) + 1) % 4;
      const meta = heroMotionMeta();
      ui.motion.step = nextStep;
      ui.motion.clicking = false;
      ui.motion.hitTarget = "";

      if (nextStep === 0) {
        const curIdx = MOTION_ORDER.indexOf(ui.motion.preset || "design");
        const nextPresetId = MOTION_ORDER[(curIdx + 1) % MOTION_ORDER.length];
        const np = MOTION_PRESETS[nextPresetId] || MOTION_PRESETS.design;
        const nt = (TDATA && TDATA.LIST || []).find((t) => t.id === np.tutorId);
        ui.motion.preset = nextPresetId;
        ui.motion.slot = String(np.defaultHour).padStart(2, "0") + ":00";
        ui.motion.offer = nt ? nt.price : np.defaultOffer;
        ui.motion.sent = false;
        patchHeroMotionDOM();
        if (typeof setTimeout === "function") {
          setTimeout(() => {
            if (!ui.motion || !ui.motion.playing || ui.motion.step !== 0) return;
            const bumpedH = np.defaultHour < 18 ? np.defaultHour + 3 : 14;
            ui.motion.slot = String(bumpedH).padStart(2, "0") + ":00";
            patchHeroMotionDOM({ liveOnly: true });
          }, 550);
        }
        return;
      }

      if (nextStep === 1) {
        ui.motion.offer = Math.max(meta.minOffer, meta.tutorPrice - 100);
        ui.motion.clicking = true;
        ui.motion.hitTarget = "minus";
      } else if (nextStep === 2) {
        ui.motion.clicking = true;
        ui.motion.hitTarget = "bid";
        ui.motion.sent = true;
      }

      patchHeroMotionDOM({ liveOnly: true });
      if ((nextStep === 1 || nextStep === 2) && typeof setTimeout === "function") {
        if (motionPulseTimer && typeof clearTimeout === "function") clearTimeout(motionPulseTimer);
        motionPulseTimer = setTimeout(() => {
          motionPulseTimer = null;
          if (!ui.motion) return;
          ui.motion.clicking = false;
          ui.motion.hitTarget = "";
          const s2 = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
          if (s2 && typeof s2.querySelector === "function") {
            const c = s2.querySelector("#hero-motion-cursor");
            if (c && c.classList) c.classList.remove("clicking");
            const b = s2.querySelector("#hero-motion-bid-btn");
            if (b && b.classList) b.classList.remove("is-pressed");
            const hm = s2.querySelector("#hero-price-minus");
            if (hm && hm.classList) hm.classList.remove("is-hit");
          }
        }, 460);
      }
    }, delay);
  }

  function marqueeSectionHTML() {
    if (!TDATA || !TDATA.PREP_UNIVERSE || !TDATA.LIVE_DEALS) return "";
    const uItems = TDATA.PREP_UNIVERSE.concat(TDATA.PREP_UNIVERSE);
    const dItems = TDATA.LIVE_DEALS.concat(TDATA.LIVE_DEALS);
    const row1 = uItems.map((it) => {
      const goal = it.label.indexOf("ЕГЭ") >= 0 ? "ЕГЭ" : (it.label.indexOf("ОГЭ") >= 0 ? "ОГЭ" : "all");
      return `<button type="button" class="marquee-pill" data-a="hero-cat" data-subj="${esc(it.subject)}" data-exam="${goal}"><b>${esc(it.label)}</b><span>${esc(it.meta)}</span></button>`;
    }).join("");
    const row2 = dItems.map((d) => {
      return `<button type="button" class="marquee-pill" data-a="land-scroll" data-target="land-market"><b>${esc(d.topic)} · ${d.paid.toLocaleString("ru-RU")} ₽/ч</b><span>${esc(d.tag)}</span></button>`;
    }).join("");
    return `<section class="stack" style="gap:8px" aria-label="Направления подготовки и недавние ставки ниже рынка">
      <div class="marquee-band">
        <div class="marquee-row left">${row1}</div>
        <div class="marquee-row right">${row2}</div>
      </div>
    </section>`;
  }

  function savingsStats() {
    const s = ui.savings || (ui.savings = { freq: 2, marketRate: 1600, offerRate: 950 });
    const freq = Math.max(1, Math.min(4, Number(s.freq) || 2));
    const mktRate = Math.max(1000, Math.min(3500, Number(s.marketRate) || 1600));
    const offRate = Math.max(600, Math.min(mktRate - 100, Number(s.offerRate) || 950));
    const monthMkt = freq * 4 * mktRate;
    const monthOff = freq * 4 * offRate;
    const monthSave = Math.max(0, monthMkt - monthOff);
    const yearSave = monthSave * 9;
    const pct = Math.round((monthSave / Math.max(1, monthMkt)) * 100);
    const barPct = Math.max(18, Math.min(96, Math.round((monthOff / Math.max(1, monthMkt)) * 100)));
    const split = TDATA && TDATA.commissionSplit
      ? TDATA.commissionSplit(offRate)
      : { payout: Math.round(offRate * 0.95), fee: Math.round(offRate * 0.05), total: offRate, pct: 5 };
    return { freq, mktRate, offRate, monthMkt, monthOff, monthSave, yearSave, pct, barPct, split };
  }

  function savingsSectionHTML() {
    const st = savingsStats();
    const freqBtns = [1, 2, 3, 4].map((n) => `<button type="button" class="chip-btn${st.freq === n ? " on" : ""}" data-a="save-freq" data-v="${n}">${n} ${plural(n, "урок", "урока", "уроков")}/нед</button>`).join("");
    return `<section class="land-sec" id="land-savings" aria-label="Сравнение стоимости ниже рынка">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Ниже рынка · честная экономика</div>
          <h2 class="h2">Почему занятия здесь обходятся дешевле на 35–53%</h2>
          <p class="small muted">Онлайн-школы закладывают до 50% наценки. Мы собираем анкеты с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов — предлагай свою ставку напрямую без лишних переплат.</p>
        </div>
      </div>
      <div class="savings-grid">
        <div class="card pad stack" style="gap:14px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <span class="small muted">Занятий в неделю</span>
            <div class="row" style="gap:6px;flex-wrap:wrap">${freqBtns}</div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Средняя ставка на рынке</span>
            <div class="hh-price-stepper">
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="mkt" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num" data-s="mkt-val">${st.mktRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="mkt" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Твоя цена на платформе</span>
            <div class="hh-price-stepper">
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="off" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num" style="color:var(--accent)" data-s="off-val">${st.offRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="off" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="badge" style="justify-content:space-between;width:100%" data-s="split-txt">При ${st.offRate} ₽/ч экономия с каждого урока: ${Math.max(0, st.mktRate - st.offRate)} ₽</div>
        </div>
        <div class="card pad stack" style="gap:14px;justify-content:space-between">
          <div class="stack" style="gap:10px">
            <div class="stack" style="gap:4px">
              <div class="row between small"><span class="muted">Рынок (${st.freq * 4} ур/мес)</span><b class="num" data-s="month-mkt">${st.monthMkt.toLocaleString("ru-RU")} ₽/мес</b></div>
              <div class="savings-bar-track"><div class="savings-bar-fill muted-fill" style="width:100%"></div></div>
            </div>
            <div class="stack" style="gap:4px">
              <div class="row between small"><span>Вектор ЕГЭ · твоя ставка</span><b class="num" style="color:var(--accent)" data-s="month-off">${st.monthOff.toLocaleString("ru-RU")} ₽/мес</b></div>
              <div class="savings-bar-track"><div class="savings-bar-fill" data-s="off-bar" style="width:${st.barPct}%"></div></div>
            </div>
          </div>
          <div class="card" style="padding:12px 14px;background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 42%,var(--line))">
            <div class="small muted">Чистая выгода с твоей ставкой</div>
            <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;color:var(--accent)" data-s="month-save">−${st.monthSave.toLocaleString("ru-RU")} ₽/мес (−${st.pct}%)</div>
            <div class="small ink2" data-s="year-save">За 9 месяцев экономишь ${st.yearSave.toLocaleString("ru-RU")} ₽</div>
          </div>
          <button type="button" class="btn soft" data-a="land-scroll" data-target="land-market">Найти репетитора ниже рынка →</button>
        </div>
      </div>
    </section>`;
  }

  function patchSavingsDOM() {
    const box = typeof document.getElementById === "function" ? document.getElementById("land-savings") : null;
    if (!box || typeof box.querySelector !== "function") {
      scheduleRender();
      return;
    }
    const st = savingsStats();
    const setT = (sel, val) => { const el = box.querySelector(sel); if (el) el.textContent = val; };
    setT('[data-s="mkt-val"]', st.mktRate.toLocaleString("ru-RU") + " ₽/ч");
    setT('[data-s="off-val"]', st.offRate.toLocaleString("ru-RU") + " ₽/ч");
    setT('[data-s="split-txt"]', `При ${st.offRate} ₽/ч экономия с каждого урока: ${Math.max(0, st.mktRate - st.offRate)} ₽`);
    setT('[data-s="month-mkt"]', st.monthMkt.toLocaleString("ru-RU") + " ₽/мес");
    setT('[data-s="month-off"]', st.monthOff.toLocaleString("ru-RU") + " ₽/мес");
    setT('[data-s="month-save"]', `−${st.monthSave.toLocaleString("ru-RU")} ₽/мес (−${st.pct}%)`);
    setT('[data-s="year-save"]', `За 9 месяцев экономишь ${st.yearSave.toLocaleString("ru-RU")} ₽`);
    const bar = box.querySelector('[data-s="off-bar"]');
    if (bar && bar.style) bar.style.width = st.barPct + "%";
    if (typeof box.querySelectorAll === "function") {
      box.querySelectorAll('[data-a="save-freq"]').forEach((b) => {
        if (b.classList) b.classList.toggle("on", Number(b.dataset.v) === st.freq);
      });
    }
  }

  function scrollToEl(targetId) {
    if (!targetId || typeof document.getElementById !== "function") return;
    const node = document.getElementById(targetId);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  function brandbookPaneHTML(isDark, bb) {
    const cls = isDark ? "is-dark" : "is-light";
    const title = isDark ? "Чёрный вид (Dark · OLED hh.ru)" : "Белый вид (Light · hh.ru)";
    const hourStr = String(bb.hour).padStart(2, "0") + ":00";
    const hourPct = Math.round(((bb.hour - 10) / 10) * 100);
    const favOn = bb.fav !== false;
    const dayObj = bbDayObj(bb.day || "all");
    const dayPrefix = dayObj.id === "all" ? "Сб" : dayObj.wd;
    const sStyle = bb.sliderStyle || "ticks";
    const swatches = isDark
      ? [
          ["#000000", "Фон страницы", "--bg"],
          ["#16181D", "Карточка", "--surface"],
          ["#22252E", "Серый тег / чип", "--surface-2"],
          ["#1D7BFF", "Синий hh (CTA)", "--accent"],
          ["#102548", "Мягкий синий", "--accent-soft"],
          ["#22C55E", "Подтверждено ✓", "--confirm"],
          ["#A78BFA", "Выше рынка (профи)", "--pro"],
          ["#FB923C", "Уведомление", "--notif"]
        ]
      : [
          ["#F4F5F7", "Фон страницы", "--bg"],
          ["#FFFFFF", "Белая карточка", "--surface"],
          ["#F2F3F6", "Серый тег / чип", "--surface-2"],
          ["#0070FF", "Синий hh (CTA)", "--accent"],
          ["#EBF3FF", "Мягкий синий", "--accent-soft"],
          ["#16A34A", "Подтверждено ✓", "--confirm"],
          ["#7C3AED", "Выше рынка (профи)", "--pro"],
          ["#F97316", "Уведомление", "--notif"]
        ];
    return `<div class="bb-pane ${cls}" data-bb-pane="${isDark ? "dark" : "light"}">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${title}</b>
        <span class="chip">${isDark ? "Ночная тема" : "Дневная тема"}</span>
      </div>
      <div class="bb-swatches">
        ${swatches.map(([hex, label, tok]) => `<div class="bb-swatch">
          <div class="bb-swatch-chip" style="background:${hex}"></div>
          <div class="bb-swatch-info"><b>${label}</b><span>${hex} · ${tok}</span></div>
        </div>`).join("")}
      </div>
      <div class="card" style="padding:14px">
        <div class="row between" style="gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <span class="small muted">Кнопки, иконки и оранжевые уведомления</span>
          <span class="chip notif"><span class="bb-pulse-dot"></span>3 новых</span>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
          <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
          <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
          <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
          <button type="button" class="btn" disabled>Неактивна</button>
          <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное">${icon(favOn ? "heartFill" : "heart")}</button>
          <span class="icon-btn sm" aria-hidden="true">${icon("eyeOff")}</span>
          <span class="bb-bell-wrap" aria-hidden="true"><span class="icon-btn sm">${icon("bell")}</span><span class="bb-notif-badge">3</span></span>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="bb-filter-active" data-a="bb-chip">${bb.chipOn ? "UX/UI и Моушен ×" : "+ Направление"}</button>
          <span class="tutor-tag-pill">+ Время 10:00–20:00</span>
          <span class="tutor-tag-pill">Можно удалённо</span>
          <span class="chip notif">Уведомление · ответ бота</span>
        </div>
      </div>
      <div class="hh-time-picker">
        <div class="row between">
          <span class="small muted">Ползунок-палка 10:00–20:00</span>
          <span class="hh-time-val num" data-bb="hour">${dayPrefix} · ${hourStr}</span>
        </div>
        <input class="hh-time-range${sStyle === "ruler" ? " is-ruler" : ""}" id="${isDark ? "bb-hour-range-dark" : "bb-hour-range"}" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Ползунок времени в брендбуке">
        ${sliderTicksHTML(bb.hour, sStyle)}
        <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
      </div>
      <div class="hh-price-stepper">
        <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
        <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted">твоя ставка за час</span></div>
        <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
      </div>
      <article class="card tutor-card" style="box-shadow:none">
        <div class="stack" style="gap:8px">
          <div class="tutor-head">
            <div style="min-width:0">
              <h3 class="h3" style="font-size:17px">Репетитор · UX/UI и Моушен</h3>
              <div class="hh-price-row" style="margin-top:4px">${priceHeadlineHTML(2000, bb.price, false)}</div>
              <div class="hh-diff-strip" style="margin-top:6px">
                ${priceDiffTagsHTML({ tutorPrice: 1200, marketPrice: 2000, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
              </div>
            </div>
            <div class="row" style="gap:2px;flex:none">
              <span class="fav-btn" aria-hidden="true">${icon("eyeOff")}</span>
              <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="В избранное">${icon(favOn ? "heartFill" : "heart")}</button>
            </div>
          </div>
          <div class="tutor-name-line">
            <b style="color:var(--ink)">Денис Ковалёв</b>
            <span class="verified-badge" aria-hidden="true">${icon("check")}</span>
            <span class="small muted">· Онлайн по РФ · ★ 4.9 (27)</span>
          </div>
          <div class="tutor-tags">
            <span class="tutor-tag-pill">Доска Ykt · TG · MAX</span>
            <span class="tutor-tag-pill">Figma &amp; After Effects</span>
          </div>
        </div>
        <div class="tutor-actions single">
          <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
        </div>
      </article>
    </div>`;
  }

  function viewBrandbook(opts) {
    opts = opts || {};
    const inside = !!opts.inside;
    const dark = effectiveDark();
    const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
    const favOn = bb.fav !== false;
    const vpW = Math.max(320, Math.min(1100, Number(bb.vpWidth) || 390));
    const vpModeLabel = vpW <= 359 ? "Mini · 1 кол. узкая" : vpW <= 480 ? "Mobile · 1 кол." : vpW <= 760 ? "Compact · 1–2 кол." : vpW <= 1040 ? "Tablet · 2 кол." : "Desktop · сетка";
    const market = 2000;
    const tutorRate = 1200;
    const mode = bb.mode || "both";
    const sStyle = bb.sliderStyle || "ticks";
    const showBounds = bb.showBounds !== false;
    const curDay = bbDayObj(bb.day || "all");
    const dayPrefix = curDay.id === "all" ? "Сб" : curDay.wd;
    const hourStr = String(bb.hour).padStart(2, "0") + ":00";
    const hourPct = Math.round(((bb.hour - 10) / 10) * 100);
    const panes = (mode === "light" || mode === "both" ? brandbookPaneHTML(false, bb) : "") +
      (mode === "dark" || mode === "both" ? brandbookPaneHTML(true, bb) : "");

    const iconCatalog = [
      ["heartFill", "Избранное (актив.)", "var(--bad)", "", "heartbeat", "Пульс ♥"],
      ["heart", "Избранное (контур)", "var(--muted)", "", "heartbeat", "Пульс ♡"],
      ["eyeOff", "Скрыть анкету", "var(--ink-2)", "", "shake", "Встряска"],
      ["eye", "Просмотр анкеты", "var(--accent)", "", "pop", "Фокус"],
      ["bell", "Уведомление (оранж.)", "var(--notif)", "3", "ring", "Звон"],
      ["flame", "Горящая ставка", "var(--notif)", "", "jiggle", "Искра"],
      ["check", "Проверено ✓", "var(--confirm)", "", "pop-bounce", "Подтверждено"],
      ["shield", "Защита оплаты", "var(--confirm)", "", "pop-bounce", "Щит"],
      ["star", "Рейтинг 4.9", "var(--pro)", "", "spin-pop", "Звезда 360°"],
      ["award", "Эксперт / ВсОШ", "var(--pro)", "", "spin-pop", "Медаль"],
      ["search", "Поиск", "var(--ink-2)", "", "scan", "Поиск"],
      ["sliders", "Фильтры", "var(--ink-2)", "", "nudge", "Настройка"],
      ["cal", "Расписание", "var(--accent)", "", "tick", "Календарь"],
      ["clock", "Время 10–20 ч", "var(--accent)", "", "tick", "Тик-так"],
      ["msg", "Чат / Отклик", "var(--accent)", "", "fly", "Отклик"],
      ["send", "Отправить ставку", "var(--accent)", "", "fly", "Полёт ↗"],
      ["video", "Онлайн-урок", "var(--accent)", "", "pop", "Камера"],
      ["users", "Репетиторы", "var(--ink-2)", "", "pop", "Каталог"],
      ["wallet", "Баланс / Тариф", "var(--confirm)", "", "lift", "Баланс"],
      ["lock", "Заморозка цены", "var(--ink-2)", "", "shake", "Бронь"],
      ["pin", "Город / Очно", "var(--accent)", "", "bounce-down", "Локация"],
      ["spark", "Подбор / ИИ", "var(--pro)", "", "twinkle", "Искры"],
      ["book", "Конспекты", "var(--ink-2)", "", "flip", "Страница"],
      ["list", "Тесты ЕГЭ", "var(--ink-2)", "", "pop", "Тесты"],
      ["chart", "Показатели", "var(--accent)", "", "lift", "Рост"],
      ["home", "Главная", "var(--ink-2)", "", "pop", "Домой"],
      ["repeat", "Обновить базу", "var(--ink-2)", "", "spin-ccw", "Обновить"],
      ["sort", "Сортировка", "var(--ink-2)", "", "nudge", "Порядок"],
      ["copy", "Копировать", "var(--ink-2)", "", "pop", "Скопировано"],
      ["share", "Поделиться", "var(--accent)", "", "lift", "Ссылка"],
      ["download", "Скачать PDF", "var(--ink-2)", "", "bounce-down", "Загрузка"],
      ["upload", "Загрузить файл", "var(--ink-2)", "", "lift", "Выгрузка"],
      ["bug", "Баг-репорт", "var(--ink-2)", "", "jiggle", "Проверка"],
      ["gear", "Настройки", "var(--ink-2)", "", "spin-180", "Поворот 180°"],
      [dark ? "sun" : "moon", "Смена темы", "var(--ink-2)", "", "spin-pop", "Тема 360°"],
      ["logout", "Выход", "var(--bad)", "", "fly", "Выход"]
    ];
    const activeIconItem = bb.activeIcon ? iconCatalog.find((it) => it[0] === bb.activeIcon) : null;

    const specRules = [
      ["Контейнер страниц / лендинга", "max-width: 1140 px · 0 px переполнения", ""],
      ["Поля экрана (Desktop / Планшет / Моб.)", "28 px / 16 px / 12 px", ""],
      ["Главная кнопка CTA (.btn / Подтверждено)", "h ≥ 42 px · Синий → Зелёный 380 ms", "confirm"],
      ["Вторичная «Подробнее» (.btn.soft)", "Тинт темнеет при hover + подъём −2 px", ""],
      ["Воздух рельсы дней (.cal-days)", "pad-top 6 px · z-index 2 при hover", ""],
      ["Кружок дня календаря (.day-dot)", "38×38 px · число без слов: 7, 14, 15", ""],
      ["Сегментный степпер ±100 ₽", "88 / 1fr / 88 px (моб. 72 px) · pad 3 px", ""],
      ["Выше рынка (высокая квалификация)", "Фиолетовый профи #7C3AED / #A78BFA", "pro"],
      ["Уведомления и ожидание ответа", "Строго оранжевый #F97316 / #FB923C", "notif"]
    ];

    const sliderVariants = [
      ["clean", "01 · Без чёрточек", "Чистая палка 10×24 px на треке без засечек — максимум воздуха в компактной карточке.", "bb-hour-range-clean", false],
      ["ticks", "02 · С редкими чёрточками", "6 деликатных рисок (10:00, 12:00, 14:00, 16:00, 18:00, 20:00) — баланс точности и чистоты.", "bb-hour-range-ticks", false],
      ["ruler", "03 · Линейка + центральная риска", "11 часовых делений (чётные длиннее) + риска внутри палки для точного прицела по часу.", "bb-hour-range-ruler", true]
    ];

    return `<div class="land-page" id="brandbook-page">
      <header class="land-top">
        <div class="brand-lockup">
          ${BRAND_MARK_HTML}
          <div class="brand-text">
            <div class="brand-name">Вектор ЕГЭ · Брендбук</div>
            <div class="brand-sub">UX/UI дизайн-система в стиле hh.ru</div>
          </div>
        </div>
        <nav class="land-links" aria-label="Разделы брендбука">
          <a href="#bb-surfaces" data-a="land-scroll" data-target="bb-surfaces">Белый / Синий</a>
          <a href="#bb-sliders" data-a="land-scroll" data-target="bb-sliders">3 ползунка</a>
          <a href="#bb-motion" data-a="land-scroll" data-target="bb-motion">Переходы</a>
          <a href="#bb-buttons" data-a="land-scroll" data-target="bb-buttons">Кнопки</a>
          <a href="#bb-bounds" data-a="land-scroll" data-target="bb-bounds">Границы</a>
          <a href="#bb-responsive" data-a="land-scroll" data-target="bb-responsive">Адаптив</a>
          <a href="#bb-compare" data-a="land-scroll" data-target="bb-compare">Темы</a>
        </nav>
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="landing">На /landing</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="tests">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <section class="card pad-lg stack" style="gap:14px">
        <div class="row between" style="gap:12px;flex-wrap:wrap">
          <div class="stack" style="gap:6px">
            <div class="eyebrow">UI Kit &amp; Brandbook · hh.ru</div>
            <h1 class="h1">Дизайн-система: Белый, Чёрный, Синий + переходы и границы</h1>
            <p class="lead">Единые правила пространства, видимых границ и живых переходов: Синий #0070FF переходит в Зелёный «Подтверждено», «Подробнее» углубляется без сливания с фоном, выше рынка отмечено фиолетовым (высокая квалификация), а уведомления строго оранжевые.</p>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button type="button" class="chip-btn${mode === "both" ? " on" : ""}" data-a="bb-mode" data-v="both">Белый + Чёрный рядом</button>
            <button type="button" class="chip-btn${mode === "light" ? " on" : ""}" data-a="bb-mode" data-v="light">Только белый вид</button>
            <button type="button" class="chip-btn${mode === "dark" ? " on" : ""}" data-a="bb-mode" data-v="dark">Только чёрный вид</button>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-surfaces">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Поверхности · Ниже и выше рынка</div>
            <h2 class="h2">Белый, Чёрный и Синий фон + прочерк / экспертная ставка</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="chip-btn${bb.price === 900 ? " on" : ""}" data-a="bb-preset" data-price="900">900 ₽ · Ниже рынка</button>
              <button type="button" class="chip-btn${bb.price === 1200 ? " on" : ""}" data-a="bb-preset" data-price="1200">1 200 ₽ · Анкета</button>
              <button type="button" class="chip-btn${bb.price === 2400 ? " on" : ""}" data-a="bb-preset" data-price="2400">2 400 ₽ · Выше рынка</button>
            </div>
            <div class="hh-price-stepper compact" style="min-width:240px">
              <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽</b></div>
              <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
            </div>
          </div>
        </div>
        <div class="bb-cols cols-3">
          <div class="bb-pane is-light">
            <span class="small muted">Белый фон · #FFFFFF / #F4F5F7</span>
            <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
            <div class="hh-diff-strip">
              ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
            </div>
            <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
          </div>
          <div class="bb-pane is-dark">
            <span class="small muted">Чёрный фон · #000000 / #16181D</span>
            <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
            <div class="hh-diff-strip">
              ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
            </div>
            <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
          </div>
          <div class="bb-pane is-blue">
            <span class="small">Синий фон · #0070FF → #0055D4</span>
            <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
            <span class="small" style="opacity:.9">${bb.price > market ? "Выше рынка · к.т.н., победители олимпиад и ЕГЭ 95+" : (bb.price < market ? `Экономия ${(market - bb.price).toLocaleString("ru-RU")} ₽ от средней по рынку` : "Равно средней ставке по рынку")}</span>
            <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto">
              <button type="button" class="btn white${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
              <button type="button" class="btn blue-ghost" data-a="go" data-v="landing">К сайту /landing</button>
            </div>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-sliders">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Выбор времени · 3 вида ползунка</div>
            <h2 class="h2">Ползунок-палка 10:00–20:00: без чёрточек и с чёрточками</h2>
          </div>
          <span class="hh-time-val num" data-bb="hour">${dayPrefix} · ${hourStr}</span>
        </div>
        <div class="bb-sliders-grid">
          ${sliderVariants.map(([vid, vtitle, vdesc, rid, isRuler]) => {
            const picked = sStyle === vid;
            return `<div class="bb-slider-card${picked ? " is-picked" : ""}">
              <div class="stack" style="gap:6px">
                <div class="row between" style="gap:8px">
                  <b>${vtitle}</b>
                  <span class="hh-time-val num" data-bb="hour-short">${hourStr}</span>
                </div>
                <p class="small muted">${vdesc}</p>
              </div>
              <div class="hh-time-picker">
                <input class="hh-time-range${isRuler ? " is-ruler" : ""}" id="${rid}" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="${vtitle}">
                ${sliderTicksHTML(bb.hour, vid)}
                <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
              </div>
              <button type="button" class="chip-btn${picked ? " on" : ""}" data-a="bb-slider-style" data-v="${vid}" style="justify-content:center">${picked ? "Применён в макетах ✓" : "Выбрать этот вид"}</button>
            </div>`;
          }).join("")}
        </div>
      </section>

      <section class="land-sec" id="bb-motion">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Переходы и микровзаимодействия</div>
            <h2 class="h2">Анимации отклика, подъёма кнопок, лайка и смены статуса</h2>
          </div>
        </div>
        <div class="bb-motion-grid">
          <div class="bb-motion-card">
            <div class="row between"><b>01 · Синий → Зелёный «Подтверждено»</b><span class="bb-spec-pill confirm">380 ms</span></div>
            <p class="small muted">Нажатие переводит CTA из #0070FF в изумрудный --confirm и сразу показывает сбоку уведомление об отправке.</p>
            <div class="stack" style="gap:6px">
              <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" id="bb-motion-bid-btn" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
              <p class="small${bb.sent ? "" : " muted"}" data-bb="bid-status" style="margin:0;line-height:1.35;${bb.sent ? "color:var(--confirm);font-weight:600" : ""}">${bb.sent ? "✓ Подтверждено · уведомление показано сбоку" : "Обычное состояние CTA · #0070FF"}</p>
            </div>
          </div>

          <div class="bb-motion-card">
            <div class="row between"><b>02 · Подъём «Подробнее» без сливания</b><span class="bb-spec-pill">−2 px</span></div>
            <p class="small muted">При наведении светло-синяя кнопка НЕ высветляется в белый — тинт углубляется (#DCEAFF / #16325E), а кнопка приподнимается.</p>
            <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:4px">
              <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
              <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
            </div>
          </div>

          <div class="bb-motion-card">
            <div class="row between"><b>03 · Пружина ♥ и пульс уведомления</b><span class="bb-spec-pill notif">1.8 s</span></div>
            <p class="small muted">Избранное пружинит (scale 1.26 → 1), а новые ответы бота дышат спокойным оранжевым импульсом.</p>
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
              <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Пружина избранного">${icon(favOn ? "heartFill" : "heart")}</button>
              <span class="chip notif"><span class="bb-pulse-dot"></span>Уведомление · 3 ответа</span>
            </div>
          </div>

          <div class="bb-motion-card">
            <div class="row between"><b>04 · Ниже ↔ Выше рынка (квалификация)</b><span class="bb-spec-pill pro">Фиолет</span></div>
            <p class="small muted">Ставка выше рынка не ошибка: фиолетовый тег означает высокую квалификацию преподавателя (к.т.н., эксперт ЕГЭ/ВсОШ).</p>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="chip-btn${bb.price < market ? " on" : ""}" data-a="bb-preset" data-price="1100">1 100 ₽ (ниже)</button>
              <button type="button" class="chip-btn${bb.price > market ? " on" : ""}" data-a="bb-preset" data-price="2400">2 400 ₽ (выше · профи)</button>
            </div>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-buttons">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Все элементы интерфейса</div>
            <h2 class="h2">Как выглядит каждая кнопка, сердечко и оранжевые уведомления</h2>
          </div>
        </div>
        <div class="bb-btn-matrix">
          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Основные кнопки CTA</b><span class="bb-spec-pill">h 42–46 px · r 12</span></div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
              <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
              <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
              <button type="button" class="btn" disabled>Неактивна</button>
            </div>
            <span class="small muted">Минимум 8 px между кнопками; при наведении кнопки приподнимаются на 2 px и не сливаются с белой карточкой.</span>
          </div>

          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Компактные 32 px и пиллы</b><span class="bb-spec-pill">h 32 px · gap 6 px</span></div>
            <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn sm${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid" data-bb-short="1">${bb.sent ? "✓ Подтверждено" : "Предложить"}</button>
              <button type="button" class="btn soft sm" data-a="bb-chip">Сбросить</button>
              <button type="button" class="bb-filter-active" data-a="bb-chip">ЕГЭ 2027 ×</button>
              <button type="button" class="chip-btn" data-a="bb-chip">+ Онлайн</button>
              <span class="diff-tag pro">К.т.н. · эксперт</span>
            </div>
            <span class="small muted">Чипы фильтров не переносятся по буквам (<code>white-space: nowrap</code>) и свайпаются на мобилке.</span>
          </div>

          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Сердечко ♥ и оранжевые уведомления</b><span class="bb-spec-pill notif">#F97316 · 36 px</span></div>
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное">${icon(favOn ? "heartFill" : "heart")}</button>
              <button type="button" class="btn ghost sm" data-a="bb-fav">${favOn ? "В избранном ♥" : "Добавить ♡"}</button>
              <span class="bb-bell-wrap" title="Оранжевый бейдж уведомлений">
                <span class="icon-btn">${icon("bell")}</span>
                <span class="bb-notif-badge">3</span>
              </span>
              <span class="chip notif"><span class="bb-pulse-dot"></span>На рассмотрении · уведомим</span>
            </div>
            <span class="small muted">Все счётчики уведомлений и ожидания ответа строго оранжевые (#F97316 / #FB923C), никогда красные.</span>
          </div>
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <div class="stack" style="gap:2px">
              <b>Полный набор иконок (36 шт. · 38×38 px и 32×32 px)</b>
              <span class="small muted">Единая толщина штриха 1.8 px · скругления round · нажми на любую иконку</span>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
              <span class="bb-spec-pill" data-bb="icon-status">${activeIconItem ? `${activeIconItem[1]} · ${activeIconItem[5]}` : "Нажми любую иконку"}</span>
              <button type="button" class="btn soft sm" data-a="bb-icons-wave">Анимировать все</button>
            </div>
          </div>
          <div class="bb-icon-grid">
            ${iconCatalog.map(([ic, label, col, badge, anim, animDesc]) => {
              const isAct = bb.activeIcon === ic;
              return `<button type="button" class="bb-icon-tile${isAct ? " is-active is-anim" : ""}" data-a="bb-icon-play" data-icon="${ic}" data-anim="${anim}" data-label="${label}" data-anim-desc="${animDesc}" aria-pressed="${isAct}">
                <span class="bb-bell-wrap">
                  <span class="icon-btn sm" style="color:${col}">${icon(ic)}</span>
                  ${badge ? `<span class="bb-notif-badge">${badge}</span>` : ""}
                </span>
                <b>${label}</b>
                <span class="bb-icon-anim-tag">${animDesc}</span>
              </button>`;
            }).join("")}
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-bounds">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Ограничения · Визуальные границы · Mobile 390 px</div>
            <h2 class="h2">Как показываются границы, почему не режет рамки и как на мобилке</h2>
          </div>
          <button type="button" class="chip-btn${showBounds ? " on" : ""}" data-a="bb-bounds-toggle">${showBounds ? "Границы показаны ✓" : "Показать границы"}</button>
        </div>

        <div class="bb-blueprint-grid">
          <div class="bb-bp-card${showBounds ? "" : " hide-guides"}">
            <div class="row between"><b>1. Воздух сверху рельсы (Сб / Вс / Пн)</b><span class="bb-spec-pill">pad-top 6 px</span></div>
            <div class="bb-bp-stage">
              <span class="bb-bp-tag notif">overflow-x · air 6 px top / 8 px bottom</span>
              <div class="bb-bp-zone">
                <div class="bb-days-rail" role="group" aria-label="Проверка границ кнопок дней">
                  ${BB_DAYS.map((d) => `<button type="button" class="day-cir${curDay.id === d.id ? " on" : ""}" data-a="bb-day" data-v="${d.id}" style="flex:0 0 60px;padding:6px 4px">
                    <span class="day-wd">${d.wd}</span>
                    <span class="day-dot">${d.num}</span>
                  </button>`).join("")}
                </div>
              </div>
            </div>
            <p class="small muted">У горизонтальной ленты нельзя ставить <code>padding-top: 0</code>: при наведении карточка дня всплывает вверх на 1 px и без 6 px воздуха сверху срезáлась бы синяя рамка.</p>
          </div>

          <div class="bb-bp-card${showBounds ? "" : " hide-guides"}">
            <div class="row between"><b>2. Зазор 8 px и угол 84 px для иконок</b><span class="bb-spec-pill confirm">gap ≥ 8 px</span></div>
            <div class="bb-bp-stage">
              <span class="bb-bp-tag confirm">safe corner 84×40 px · btn gap 8 px</span>
              <div class="row between" style="align-items:center">
                <span class="small"><b>Заголовок + ставка</b></span>
                <div class="bb-bp-zone row" style="gap:4px">
                  <span class="fav-btn" aria-hidden="true">${icon("eyeOff")}</span>
                  <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Проверка угла">${icon(favOn ? "heartFill" : "heart")}</button>
                </div>
              </div>
              <div class="row" style="gap:0;align-items:center">
                <button type="button" class="btn sm${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid" data-bb-short="1">${bb.sent ? "✓ Подтверждено" : "Предложить"}</button>
                <span class="bb-bp-gap" title="Минимальный зазор 8 px" aria-hidden="true"></span>
                <button type="button" class="btn soft sm" data-a="bb-chip">Подробнее</button>
              </div>
            </div>
            <p class="small muted">Зазор 8 px отделяет кнопки, чтобы они не сливались при hover-подъёме; справа в шапке всегда остаётся 84 px под глаз и сердечко.</p>
          </div>

          <div class="bb-bp-card${showBounds ? "" : " hide-guides"}">
            <div class="row between"><b>3. Коридор ползунка и степпер ±100 ₽</b><span class="bb-spec-pill">88 / 1fr / 88 px</span></div>
            <div class="bb-bp-stage">
              <span class="bb-bp-tag">track area 29 px · thumb 10×24 px</span>
              <div class="bb-bp-zone">
                <input class="hh-time-range" id="bb-hour-range-bounds" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Проверка границ ползунка">
              </div>
              <div class="bb-bp-zone">
                <div class="hh-price-stepper compact">
                  <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
                  <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽</b></div>
                  <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
                </div>
              </div>
            </div>
            <p class="small muted">На десктопе кнопки степпера 88 px, на 390 px — 72 px; вертикальная палка 10×24 px имеет сенсорный запас по краям ±6 px.</p>
          </div>
        </div>

        <div class="bb-specs-layout">
          <div class="card pad-lg stack" style="gap:6px">
            <div class="row between" style="margin-bottom:4px">
              <b>Правила границ, цветов и отступов</b>
              <span class="small muted">Desktop 1280 px · Mobile 390 px</span>
            </div>
            ${specRules.map(([name, val, kind]) => `<div class="bb-spec-row">
              <span class="small ink2">${name}</span>
              <span class="bb-spec-pill${kind ? " " + kind : ""}">${val}</span>
            </div>`).join("")}
          </div>

          <div class="stack" style="gap:8px;align-items:center">
            <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:center">
              <button type="button" class="chip-btn${vpW <= 340 ? " on" : ""}" data-a="bb-vp" data-w="320" style="min-height:28px;padding:3px 10px;font-size:12px">320 px</button>
              <button type="button" class="chip-btn${vpW > 340 && vpW <= 420 ? " on" : ""}" data-a="bb-vp" data-w="390" style="min-height:28px;padding:3px 10px;font-size:12px">390 px</button>
              <button type="button" class="chip-btn${vpW > 420 && vpW <= 820 ? " on" : ""}" data-a="bb-vp" data-w="768" style="min-height:28px;padding:3px 10px;font-size:12px">768 px</button>
            </div>
            <span class="small muted">Живой макет «Как на мобилке · <span data-bb="phone-w">${Math.min(410, vpW)}</span> px» · нажимай дни Сб / Вс / Пн</span>
            <div class="bb-phone-frame" style="max-width:${Math.min(410, vpW)}px" aria-label="Предпросмотр мобильной версии ${Math.min(410, vpW)} px">
              <div class="bb-phone-status">
                <span class="num">09:41 · Вектор ЕГЭ · <span data-bb="day-label">${curDay.full}</span></span>
                <span class="row" style="gap:6px;align-items:center">
                  <span class="chip notif" style="font-size:11px;padding:2px 7px"><span class="bb-pulse-dot"></span>3 ответа</span>
                </span>
              </div>
              <div class="bb-phone-body">
                <div class="chip-rail swipe" style="padding-bottom:2px">
                  <span class="chip-btn on" style="min-height:30px;padding:4px 10px;font-size:12px">Фильтры</span>
                  <span class="chip-btn" style="min-height:30px;padding:4px 10px;font-size:12px">+ ЕГЭ</span>
                  <span class="chip-btn" style="min-height:30px;padding:4px 10px;font-size:12px">+ ${curDay.wd}</span>
                  <span class="chip-btn" style="min-height:30px;padding:4px 10px;font-size:12px">+ ${hourStr}</span>
                </div>
                <div class="bb-days-rail" role="group" aria-label="Выбор дня на мобилке">
                  ${BB_DAYS.map((d) => `<button type="button" class="day-cir${curDay.id === d.id ? " on" : ""}" data-a="bb-day" data-v="${d.id}" style="flex:0 0 58px;padding:6px 4px">
                    <span class="day-wd">${d.wd}</span>
                    <span class="day-dot">${d.num}</span>
                  </button>`).join("")}
                </div>
                <div class="card" style="padding:14px;display:grid;gap:10px;box-shadow:none">
                  <div class="tutor-head">
                    <div style="min-width:0">
                      <b style="font-size:15px">Репетитор · UX/UI и Моушен</b>
                      <div class="hh-price-row" style="margin-top:3px">${priceHeadlineHTML(market, bb.price, false)}</div>
                      <div class="hh-diff-strip" style="margin-top:5px">
                        ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · профи" })}
                      </div>
                    </div>
                    <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное на мобилке">${icon(favOn ? "heartFill" : "heart")}</button>
                  </div>
                  <div class="hh-time-picker" style="padding:9px 10px">
                    <div class="row between">
                      <span class="small muted">${curDay.full}</span>
                      <span class="hh-time-val num" data-bb="hour-short">${hourStr}</span>
                    </div>
                    <input class="hh-time-range${sStyle === "ruler" ? " is-ruler" : ""}" id="bb-hour-range-mobile" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Мобильный ползунок времени">
                    ${sliderTicksHTML(bb.hour, sStyle)}
                  </div>
                  <div class="hh-price-stepper" style="grid-template-columns:72px minmax(0,1fr) 72px">
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
                    <div class="hh-step-readout"><b class="num" style="font-size:15px">${bb.price.toLocaleString("ru-RU")} ₽/ч</b></div>
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
                  </div>
                  <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" style="width:100%" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
                </div>
              </div>
              <div class="bb-phone-tabs" aria-hidden="true">
                <div class="bb-phone-tab">${icon("list")}<span>Тесты</span></div>
                <div class="bb-phone-tab on">${icon("users")}<span>Репетиторы</span></div>
                <div class="bb-phone-tab">${icon("cal")}<span>Учёба</span><span class="bb-notif-badge">3</span></div>
                <div class="bb-phone-tab">${icon("chart")}<span>Показатели</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-fonts">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Шрифты · Inter + IBM Plex Mono</div>
            <h2 class="h2">Типографика как на сайте hh.ru</h2>
          </div>
        </div>
        <div class="card pad-lg stack" style="gap:4px">
          <div class="bb-type-row"><b style="font-size:28px;font-weight:700;letter-spacing:-.025em">H1 · Ищи репетиторов ниже рынка</b><span class="small muted num">Inter Bold 700 · −0.02em · clamp(25–39px)</span></div>
          <div class="bb-type-row"><b style="font-size:20px;font-weight:700;letter-spacing:-.015em">H2 · Найдено 2 480 подходящих анкет</b><span class="small muted num">Inter Bold 700 · −0.015em · 20px</span></div>
          <div class="bb-type-row"><span><s class="hh-price-old lg num">2 000 ₽</s> <b class="hh-price-now lg num" style="margin-left:6px">1 200 ₽/ч</b></span><span class="small muted num">Tabular-nums · Прочерк #7C828E + Ставка 700</span></div>
          <div class="bb-type-row"><span style="font-size:13.5px;font-weight:500">Опыт 6 лет · Можно удалённо · Доска Ykt · Telegram · MAX</span><span class="small muted num">Inter Medium 500 · Теги карточек 13px</span></div>
        </div>
      </section>

      <section class="land-sec" id="bb-responsive">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Адаптивность · Container Queries + Breakpoints</div>
            <h2 class="h2">Живой стенд адаптивности: 320 → 1100 px</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="chip accent" id="bb-vp-mode">${vpModeLabel}</span>
            <b class="num" id="bb-vp-readout">${vpW} px</b>
          </div>
        </div>

        <div class="card pad stack" style="gap:12px">
          <div class="bb-resp-toolbar">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="chip-btn${vpW <= 340 ? " on" : ""}" data-a="bb-vp" data-w="320">Mini 320 px</button>
              <button type="button" class="chip-btn${vpW > 340 && vpW <= 420 ? " on" : ""}" data-a="bb-vp" data-w="390">Mobile 390 px</button>
              <button type="button" class="chip-btn${vpW > 420 && vpW <= 820 ? " on" : ""}" data-a="bb-vp" data-w="768">Tablet 768 px</button>
              <button type="button" class="chip-btn${vpW > 820 ? " on" : ""}" data-a="bb-vp" data-w="1100">Desktop 1100 px</button>
            </div>
            <div class="bb-resp-width-ctl" style="flex:1;min-width:220px">
              <span class="small muted num">320</span>
              <input class="hh-time-range" id="bb-vp-slider" type="range" min="320" max="1100" step="10" value="${vpW}" style="--pct:${Math.round(((vpW - 320) / 780) * 100)}%;flex:1" aria-label="Ширина адаптивного стенда">
              <span class="small muted num">1100</span>
            </div>
          </div>

          <div class="bb-resp-stage">
            <div class="bb-resp-viewport" id="bb-resp-viewport" style="max-width:${vpW}px">
              <div class="bb-resp-metrics">
                <b>@container · живая перестройка карточки</b>
                <span class="num">Ширина контейнера: <b id="bb-resp-cur">${vpW} px</b></span>
              </div>
              <div class="bb-resp-grid">
                <div class="card" style="padding:14px;display:grid;gap:10px;box-shadow:none">
                  <div class="row between" style="gap:8px;align-items:flex-start">
                    <div style="min-width:0">
                      <b style="font-size:15px">Математика ЕГЭ · Анна С.</b>
                      <div class="hh-price-row" style="margin-top:3px">${priceHeadlineHTML(market, bb.price, false)}</div>
                    </div>
                    <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное в стенде">${icon(favOn ? "heartFill" : "heart")}</button>
                  </div>
                  <div class="hh-diff-strip">
                    ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "Эксперт ЕГЭ 95+" })}
                  </div>
                  <div class="hh-price-stepper compact">
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
                    <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽/ч</b></div>
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
                  </div>
                </div>

                <div class="card" style="padding:14px;display:grid;gap:10px;box-shadow:none">
                  <div class="row between" style="gap:8px">
                    <span class="small muted">${curDay.full}</span>
                    <span class="hh-time-val num" data-bb="hour-short">${hourStr}</span>
                  </div>
                  <input class="hh-time-range${sStyle === "ruler" ? " is-ruler" : ""}" id="bb-hour-range-resp" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Время в стенде адаптивности">
                  <div class="bb-days-rail" role="group" aria-label="Дни в стенде">
                    ${BB_DAYS.map((d) => `<button type="button" class="day-cir${curDay.id === d.id ? " on" : ""}" data-a="bb-day" data-v="${d.id}" style="flex:0 0 56px;padding:6px 4px">
                      <span class="day-wd">${d.wd}</span>
                      <span class="day-dot">${d.num}</span>
                    </button>`).join("")}
                  </div>
                  <div class="bb-resp-actions">
                    <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
                    <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="bb-bp-rules-cards">
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill">Mini &lt; 360 px</span>
              <b>Узкие экраны SE</b>
              <p class="small muted">Степпер сжимается до 60 px, кнопки CTA встают одна под другой на всю ширину без переполнения.</p>
            </div>
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill">Mobile 360–680 px</span>
              <b>Мобильный стек</b>
              <p class="small muted">1 колонка карточек, нижний таб-бар, свайп дней 6 px сверху, боковое уведомление — сверху по ширине.</p>
            </div>
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill confirm">Tablet 681–1080 px</span>
              <b>2-колоночный планшет</b>
              <p class="small muted">Тарифы, анкеты, моушен и справочник перестраиваются в 2 равные колонки без пустых дыр.</p>
            </div>
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill pro">Desktop ≥ 1360 px</span>
              <b>Широкий экран</b>
              <p class="small muted">Контейнер 1 200 px, боковое уведомление справа, а @container держит ритм внутри любых сеток.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-compare">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">UI Kit в действии</div>
            <h2 class="h2">Полный набор компонентов в Белом и Чёрном виде</h2>
          </div>
        </div>
        <div class="${mode === "both" ? "bb-cols" : "stack"}">${panes}</div>
      </section>

      <div class="hh-blue-banner">
        <div class="stack" style="gap:4px;max-width:60ch">
          <b style="font-size:20px">Готово по брендбуку — посмотри собранный сайт /landing</b>
          <span class="small">На странице /landing применены именно эти шрифты, палитра (Серый + Синий + Оранжевый), ползунок-палка, степпер ±100 ₽ и границы.</span>
        </div>
        <button type="button" class="btn white" data-a="go" data-v="landing">Открыть сайт /landing →</button>
      </div>
    </div>`;
  }

  function viewFees(opts) {
    opts = opts || {};
    const inside = !!opts.inside;
    const dark = effectiveDark();
    const rate = Math.max(600, Math.min(3500, Number(ui.feesRate) || 800));
    const presets = [800, 1000, 1200, 1500, 2000];
    return `<div class="land-page" id="fees-page">
      <header class="land-top">
        <div class="brand-lockup">
          ${BRAND_MARK_HTML}
          <div class="brand-text">
            <div class="brand-name">Вектор ЕГЭ · Оплата</div>
            <div class="brand-sub">Условия оплаты и сервисный сбор</div>
          </div>
        </div>
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "← К репетиторам" : "← На главную"}</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="tests">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <section class="card pad-lg stack" style="gap:16px">
        <div class="stack" style="gap:6px">
          <div class="eyebrow">Оплата занятий · Сервисный сбор системы</div>
          <h1 class="h1">Условия оплаты и комиссия за систему</h1>
          <p class="lead">При выборе репетитора ученик ориентируется только на удобное время и свою цену за урок. Комиссия системы 5% учитывается на этапе расчёта оплаты — никаких скрытых доплат сверх ставки ученика нет.</p>
        </div>

        <div class="grid-3">
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip accent" style="justify-self:start">01 · Баланс 5 000 / 10 000 ₽</span>
            <b>Пополнение без сгорания</b>
            <p class="small ink2">Вы пополняете баланс на 5 000 или 10 000 ₽ и расходуете средства по мере подтверждённых занятий.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip confirm" style="justify-self:start">02 · Защита оплаты</span>
            <b>Заморозка после ответа</b>
            <p class="small ink2">Пока преподаватель не подтвердил время и предложенную ставку, деньги не списываются с вашего баланса.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip pro" style="justify-self:start">03 · Фиксированно 5%</span>
            <b>Сервисный сбор системы</b>
            <p class="small ink2">С проведённого занятия 95% получает преподаватель, а 5% составляет сервисный сбор системы.</p>
          </div>
        </div>

        <div class="card pad-lg stack" style="gap:12px;background:var(--surface-2);box-shadow:none">
          <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
            <div class="stack" style="gap:2px">
              <b>Калькулятор при оплате урока</b>
              <span class="small muted">Выбери стоимость часа для точного расчёта:</span>
            </div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${presets.map((p) => `<button type="button" class="chip-btn${rate === p ? " on" : ""}" data-a="fees-rate" data-rate="${p}">${p.toLocaleString("ru-RU")} ₽</button>`).join("")}
            </div>
          </div>
          <div class="bid-fee-row">${feeSplitHTML(rate)}</div>
          <p class="small muted">С каждой подтверждённой ставки <b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b> расчёт происходит автоматически при оплате урока.</p>
        </div>

        <div class="row" style="gap:10px;flex-wrap:wrap">
          <button type="button" class="btn" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "Выбрать репетитора" : "Перейти к подбору репетиторов"}</button>
          <button type="button" class="btn soft" data-a="go" data-v="brandbook">Открыть Брендбук</button>
        </div>
      </section>
    </div>`;
  }

  function landingPageHTML(opts) {
    opts = opts || {};
    const inside = !!opts.inside;
    const dark = effectiveDark();
    const catalogTotal = TDATA && TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL.toLocaleString("ru-RU") : "2 480";
    const quickCats = [
      ["design", "UX/UI и Моушен"],
      ["inf", "Python и IT"],
      ["eng", "Английский"],
      ["bio", "Биология / Мед"],
      ["math", "Математика"],
      ["music", "Вокал и гитара"]
    ];

    return `<div class="land-page">
      <header class="land-top">
        <div class="brand-lockup">
          ${BRAND_MARK_HTML}
          <div class="brand-text">
            <div class="brand-name">Вектор ЕГЭ</div>
            <div class="brand-sub">Огромная база · ниже рынка</div>
          </div>
        </div>
        <nav class="land-links" aria-label="Разделы лендинга">
          <a href="/brandbook" data-a="go" data-v="brandbook">Брендбук</a>
          <a href="#hero-motion-stage" data-a="land-scroll" data-target="hero-motion-stage">Подбор</a>
          <a href="#land-savings" data-a="land-scroll" data-target="land-savings">Выгода</a>
          <a href="#land-demo" data-a="land-scroll" data-target="land-demo">Бета-тест</a>
          <a href="#land-market" data-a="land-scroll" data-target="land-market">Репетиторы</a>
          <a href="#land-plans" data-a="land-scroll" data-target="land-plans">Тарифы</a>
        </nav>
        <div class="land-top-actions">
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside
            ? `<button type="button" class="btn sm" data-a="go" data-v="tests">В кабинет</button>`
            : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <div class="hero-stage-wrap" id="hero-stage-wrap">
        <span class="hero-orb a" aria-hidden="true"></span>
        <span class="hero-orb b" aria-hidden="true"></span>
        <section class="land-hero">
          <div class="land-hero-copy">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <span class="chip accent">${catalogTotal}+ анкет · Ykt, TG, WA, MAX и др.</span>
              <span class="chip">Ниже рынка на 35–53%</span>
              <span class="chip pro">Ставка ±100 ₽ в 1 клик</span>
            </div>
            <h1 class="land-h1">Ищи репетиторов <span class="land-h1-grad">ниже рынка</span> для подготовки к чему угодно</h1>
            <p class="land-lead">Единая база анкет с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов: ЕГЭ и ОГЭ, Python, UX/UI и моушен-дизайн, физика, вокал и ВУЗ. Выбирай час с 10:00 до 20:00, нажимай −100 ₽ и отправляй свою ставку.</p>
            <div class="land-hero-ctas">
              <button type="button" class="btn" data-a="land-scroll" data-target="land-market">Найти ниже рынка</button>
              <button type="button" class="btn soft" data-a="land-scroll" data-target="land-demo">Попробовать бета-тест</button>
              ${inside ? `<button type="button" class="btn ghost" data-a="go" data-v="tests">Перейти к тестам</button>` : ""}
            </div>
            <div class="chip-rail" role="group" aria-label="Быстрый выбор направления">${quickCats.map(([sid, label]) => `<button type="button" class="chip-btn" data-a="hero-cat" data-subj="${sid}">${esc(label)}</button>`).join("")}</div>
            <div class="land-stats">
              <div class="land-stat"><b>${catalogTotal}+ анкет</b><span>Ykt, Telegram, WhatsApp, MAX и др.</span></div>
              <div class="land-stat"><b>Шаг ±100 ₽</b><span>Простая ставка ниже рынка</span></div>
              <div class="land-stat"><b>10:00 – 20:00</b><span>Быстрый выбор окна и ответа</span></div>
            </div>
          </div>
          ${heroMotionStageHTML()}
        </section>
      </div>

      ${marqueeSectionHTML()}

      <div class="hh-blue-banner">
        <div class="stack" style="gap:4px;max-width:58ch">
          <b style="font-size:20px">Дизайн-система и брендбук hh-стиля (Белый + Чёрный + Синий)</b>
          <span class="small">Посмотри кнопки, ползунок 10:00–20:00, прочерк цены и палитру в обеих темах отдельно на /brandbook.</span>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn white" data-a="go" data-v="brandbook">Открыть брендбук</button>
          <button type="button" class="btn blue-ghost" data-a="land-scroll" data-target="land-market">К каталогу</button>
        </div>
      </div>

      ${savingsSectionHTML()}

      <section class="land-sec" id="land-how">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Как это устроено</div>
            <h2 class="h2">От выбора часа до подтверждения преподавателя — в пару кликов</h2>
          </div>
        </div>
        <div class="how-grid">
          <div class="card how-card"><span class="how-num">01</span><b>Единая база из 5+ источников</b><p class="small ink2">Собираем анкеты с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов по всем предметам и навыкам.</p></div>
          <div class="card how-card"><span class="how-num">02</span><b>Ползунок времени 10:00–20:00</b><p class="small ink2">Двигай удобный час с 10:00 до 20:00 и сразу видишь свободных репетиторов в нужный интервал.</p></div>
          <div class="card how-card"><span class="how-num">03</span><b>Ставка кнопками ±100 ₽</b><p class="small ink2">Выбирай удобную цену без лишних форм и нажимай «Предложить» — запрос сразу уходит преподавателю.</p></div>
          <div class="card how-card"><span class="how-num">04</span><b>Уведомление и расписание</b><p class="small ink2">Когда преподаватель подтвердит время и ставку, придёт уведомление — всё расписание в «Учёбе».</p></div>
        </div>
      </section>

      ${demoSectionHTML(inside)}
      ${marketSectionHTML({ landing: true })}
      ${plansSectionHTML({ landing: true })}

      <section class="land-sec" id="land-tutors">
        <div class="card pad-lg stack" style="gap:14px">
          <div class="row between" style="flex-wrap:wrap;gap:10px">
            <div>
              <div class="eyebrow">Для преподавателей</div>
              <h2 class="h2">Анкеты с Доски Ykt, Telegram, WhatsApp, MAX без наценок школ</h2>
            </div>
            <a href="/fees" class="chip accent" data-a="go" data-v="fees">Условия оплаты и расчётов →</a>
          </div>
          <div class="grid-3">
            <div class="stack" style="gap:4px"><b>Готовые заявки по времени и цене</b><p class="small ink2">Ученик выбирает час и ставку — сервис аккуратно передаёт предложение и уведомляет при ответе.</p></div>
            <div class="stack" style="gap:4px"><b>Бесплатный топ каждый день</b><p class="small ink2">Раз в сутки нажимаете «Актуален сегодня» — ваша анкета сразу поднимается вверх каталога.</p></div>
            <div class="stack" style="gap:4px"><b>Безопасный баланс и расчёты</b><p class="small ink2">Ученик пополняет баланс 5 000 или 10 000 ₽ — средства бронируются только после вашего подтверждения. <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent)">Подробнее об оплате →</a></p></div>
          </div>
        </div>
      </section>

      <footer class="row between small muted" style="flex-wrap:wrap;gap:10px;padding:8px 0 18px;border-top:1px solid var(--line)">
        <span>Вектор ЕГЭ · тесты, конспекты и маркетплейс репетиторов</span>
        <div class="row" style="gap:14px;flex-wrap:wrap">
          <a href="/fees" data-a="go" data-v="fees">Условия оплаты и сбор системы</a>
          <a href="/privacy">Политика конфиденциальности</a>
          <button type="button" class="link-btn small" data-a="bug-site">Сообщить о баге (${BUG_EMAIL})</button>
        </div>
      </footer>
    </div>`;
  }

  function viewMarket() {
    return `<div class="head"><div class="row between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Маркетплейс</div><h1 class="h1">Подбор репетитора</h1></div><button type="button" class="btn ghost sm" data-a="go" data-v="landing">Витрина</button></div></div>
      ${marketSectionHTML({ landing: false })}
      ${plansSectionHTML({ landing: false })}`;
  }

  /** Вкладка «Учёба»: график по неделям, переписка с репетиторами в WhatsApp и план ЕГЭ. */
  function viewStudy() {
    if (!TDATA) return "";
    const st = mkt();
    const tab = ui.studyTab || "week";
    const totalTutors = TDATA.LIST.length;
    const weekOffset = ui.studyWeekOffset ? 1 : 0;
    const weekDays = TDATA.buildWeekDays(weekOffset);
    const subjFilter = ui.studySubj || "all";

    const header = `<div class="head">
        <div class="row between" style="flex-wrap:wrap;gap:10px">
          <div><div class="eyebrow">Учёба</div><h1 class="h1">График и репетиторы</h1></div>
          <button type="button" class="btn soft sm" data-a="go" data-v="market">Подобрать ещё</button>
        </div>
      </div>
      <div class="chip-rail">
        <button type="button" class="chip-btn${tab === "week" ? " on" : ""}" data-a="study-tab" data-tab="week">График недели</button>
        <button type="button" class="chip-btn${tab === "chats" ? " on" : ""}" data-a="study-tab" data-tab="chats">Чаты WhatsApp (${totalTutors})</button>
        <button type="button" class="chip-btn${tab === "plan" ? " on" : ""}" data-a="study-tab" data-tab="plan">План ЕГЭ</button>
      </div>`;

    if (tab === "plan") {
      return `${header}${viewPlan()}`;
    }

    if (tab === "chats") {
      const bookedIds = new Set(st.bookings.map((b) => b.tutorId));
      const sorted = TDATA.LIST.slice().sort((a, b) => (bookedIds.has(b.id) ? 1 : 0) - (bookedIds.has(a.id) ? 1 : 0));
      const rows = sorted.map((t) => {
        const bk = st.bookings.find((x) => x.tutorId === t.id);
        const slot = bk ? `${bk.dayLabel}, ${bk.hour}` : (TDATA.tutorSlotsForDay(t, "all")[0] || "10:00");
        const waHref = TDATA.whatsappUrl(t, bk
          ? `Здравствуйте, ${t.name}! Пишу по поводу занятия ${bk.dayLabel} в ${bk.hour} (${bk.subjectName}, ставка ${bk.offerPrice} ₽/ч).`
          : `Здравствуйте, ${t.name}! Хочу уточнить свободное время на этой неделе (${t.subjectName}).`);
        const statusTxt = bk
          ? (bk.status === "accepted" ? "Подтверждён · WhatsApp" : `Отклик ${bk.offerPrice} ₽/ч`)
          : `Ответ ~${t.responseMin} мин`;
        return `<a class="hh-chat-row" href="${esc(waHref)}" target="_blank" rel="noopener">
          <span class="tutor-avatar" aria-hidden="true">${esc(initials(t.name))}</span>
          <div style="min-width:0">
            <div class="row" style="gap:6px;flex-wrap:nowrap">
              <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</b>
              ${t.verified ? `<span class="verified-badge">${icon("check")}</span>` : ""}
            </div>
            <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.subjectName)} · от ${t.price} ₽/ч</div>
            <div class="small" style="color:${bk ? "var(--leaf)" : "var(--muted)"}">${esc(statusTxt)}</div>
          </div>
          <div class="stack" style="gap:4px;justify-items:end">
            <span class="small muted num">${esc(slot)}</span>
            <span class="wa-btn">${icon("msg")}<span>Чат</span></span>
          </div>
        </a>`;
      }).join("");
      return `${header}
        <div class="hh-notice-card">
          <b>Быстрая связь с преподавателями в WhatsApp</b>
          <span class="small ink2">Нажмите на любого преподавателя, чтобы открыть готовое сообщение с вашим предметом, временем и ставкой.</span>
          <div><button type="button" class="btn sm" data-a="go" data-v="market">Выбрать время и предложить цену</button></div>
        </div>
        <div class="hh-chat-list">${rows}</div>`;
    }

    const weekRange = `${weekDays[0].num} ${weekDays[0].month} — ${weekDays[6].num} ${weekDays[6].month}`;
    const noticeCard = `<div class="hh-notice-card">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${st.bookings.length ? `У вас ${st.bookings.length} ${plural(st.bookings.length, "занятие", "занятия", "занятий")} в работе` : "График открытых окон на неделю"}</b>
        <span class="chip accent num">Баланс: ${st.balance.toLocaleString("ru-RU")} ₽</span>
      </div>
      <span class="small ink2">Видно, какие учителя ждут вас в каждый день недели. С каждым можно сразу записаться по своей цене или написать в WhatsApp.</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-a="go" data-v="market">Найти репетитора</button>
        <button type="button" class="btn soft sm" data-a="study-tab" data-tab="chats">${icon("msg")}<span>Все чаты WhatsApp</span></button>
      </div>
    </div>`;

    const weekPicker = `<div class="hh-seg" role="group" aria-label="Выбор недели">
      <button type="button" data-a="study-week" data-w="0" aria-pressed="${weekOffset === 0}">Эта неделя</button>
      <button type="button" data-a="study-week" data-w="1" aria-pressed="${weekOffset === 1}">Следующая неделя</button>
    </div>
    <div class="chip-rail swipe" role="group" aria-label="Фильтр по предмету">
      <button type="button" class="chip-btn${subjFilter === "all" ? " on" : ""}" data-a="study-subj" data-v="all">Все предметы</button>
      ${TDATA.SUBJECTS.map((sb) => `<button type="button" class="chip-btn${subjFilter === sb.id ? " on" : ""}" data-a="study-subj" data-v="${sb.id}">${esc(sb.short)}</button>`).join("")}
    </div>`;

    const weekCards = weekDays.map((d) => {
      const avail = TDATA.LIST.filter((t) => (subjFilter === "all" || t.subject === subjFilter) && TDATA.tutorSlotsForDay(t, d.dow).length > 0);
      const dayBookings = st.bookings.filter((bk) => bk.dayIso === d.iso);
      const rows = avail.slice(0, 4).map((t) => {
        const slots = TDATA.tutorSlotsForDay(t, d.dow);
        const booked = dayBookings.find((b) => b.tutorId === t.id) || st.bookings.find((b) => b.tutorId === t.id);
        const waHref = TDATA.whatsappUrl(t, `Здравствуйте, ${t.name}! Пишу по графику на ${d.fullLabel} (${slots[0] || "10:00"}), предмет — ${t.subjectName}.`);
        return `<div class="week-slot-row">
          <div class="stack" style="gap:2px;min-width:0;flex:1 1 200px">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <b>${esc(t.name)}</b>
              ${t.verified ? `<span class="verified-badge">${icon("check")}</span>` : ""}
              <span class="chip">${esc(t.subjectName)}</span>
              ${booked ? `<span class="chip accent">${booked.status === "accepted" ? "Подтверждён" : "Ваша заявка"}</span>` : ""}
            </div>
            <div class="small muted">Окна: ${slots.join(", ")} · от ${t.price} ₽/ч</div>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <a class="wa-btn" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>
            <button type="button" class="btn sm" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(slots[0] || "10:00")}">Записаться</button>
          </div>
        </div>`;
      }).join("");
      return `<article class="week-day-card${dayBookings.length ? " active-day" : ""}">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>${esc(d.fullLabel)}</b>
          <span class="chip">${avail.length} ${plural(avail.length, "учитель ждёт", "учителя ждут", "учителей ждут")}</span>
        </div>
        ${rows || '<div class="small muted">По выбранному предмету на этот день свободных окон нет.</div>'}
      </article>`;
    }).join("");

    return `${header}
      ${noticeCard}
      ${bookingsStripHTML(st)}
      <div class="stack" style="gap:10px">
        <div class="row between"><h2 class="h2">Календарь: ${esc(weekRange)}</h2></div>
        ${weekPicker}
      </div>
      <div class="week-days-grid">${weekCards}</div>`;
  }

  /** Вкладка «Тесты»: 3 предмета ЕГЭ, тренажёр, варианты КИМ и встроенный Справочник. */
  function viewTests() {
    const prof = profile();
    const name = prof.name || (store.ready ? defaultName() : "");
    const parts = [];
    parts.push(`<div class="head"><div class="row between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">${name ? `Привет, ${esc(name)}! · ` : ""}ЕГЭ 2027 · Тренажёр</div><h1 class="h1">Тесты и справочник</h1></div><button type="button" class="btn soft sm" data-a="go" data-v="tutor">${icon("book")}<span>Справочник</span></button></div><p class="lead">Отработка заданий ФИПИ по трём предметам, полные варианты КИМ и быстрый поиск по правилам без нейросети.</p></div>`);
    if (store.backend && store.ready && !store.user) parts.push(`<div class="notice"><b>Гостевой режим.</b><span>Прогресс хранится в этом браузере. <button type="button" class="link-btn" data-a="auth-modal-open">Войти или создать аккаунт</button>, чтобы синхронизировать.</span></div>`);
    if (store.ready && !prof.exists && store.error !== "readonly" && (!store.backend || store.user || ui.guest)) parts.push(onboardingCard());
    if (store.mode === "local" && !store.backend) parts.push(localNotice());
    parts.push(staleNotice());

    const subjCards = CONTENT.map((s) => {
      const st = subjectStats(s.id);
      const mis = store.ready ? mistakeQs(s.id).length : 0;
      const due = store.ready ? dueQs(s.id).length : 0;
      const target = (prof.targets && prof.targets[s.id]) || 80;
      return `<article class="card stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div class="row" style="gap:8px"><i class="dot" style="background:var(--c-${s.id})"></i><h2 class="h2">${esc(s.name)}</h2></div>
          <span class="chip num">готовность ${store.ready ? st.pct + "%" : "—"} · цель ${target}</span>
        </div>
        <div class="meter"><i style="width:${st.pct}%"></i></div>
        <div class="row between small muted" style="flex-wrap:wrap;gap:6px">
          <span>освоено ${st.mastered} из ${st.total} · тем ${st.started}/${st.topics}</span>
          <span>${mis ? `ошибок: ${mis}` : due ? `повторить: ${due}` : "без долгов"}</span>
        </div>
        <div class="tutor-actions">
          <button type="button" class="btn" data-a="go" data-v="subject" data-sid="${s.id}">Открыть темы</button>
          <button type="button" class="btn soft" data-a="quiz-mixed" data-sid="${s.id}">Смешанный тест</button>
        </div>
        ${mis ? `<div><button type="button" class="link-btn small" data-a="quiz-mistakes" data-sid="${s.id}">Разобрать ошибки (${mis})</button></div>` : ""}
      </article>`;
    }).join("");
    parts.push(`<div class="grid-3">${subjCards}</div>`);

    parts.push(`<section class="card stack" style="gap:10px">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Офлайн без нейросети</div>
          <h2 class="h2">Справочник, формулы и сочинение</h2>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${EGE.essay ? `<button type="button" class="btn soft sm" data-a="go" data-v="essay">Сочинение №27</button>` : ""}
          <button type="button" class="btn sm" data-a="go" data-v="tutor">Открыть справочник</button>
        </div>
      </div>
      <div class="chip-rail">
        ${["митоз", "гидролиз", "задание 8", "клише"].map((q) => `<button type="button" class="chip-btn" data-a="tests-guide-chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>
    </section>`);

    parts.push(`<section class="section"><div class="section-head"><h2 class="h2">Рекомендуем сейчас</h2><button type="button" class="link-btn small" data-a="go" data-v="market">Нужен репетитор?</button></div><div class="steps">${nextSteps().map(stepBtn).join("")}</div></section>`);
    parts.push(`<div class="grid-hero">${heroCard(prof)}${examsCard(prof)}</div>`);
    return parts.join("");
  }

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

  // ---------- главная ----------
  function viewHome() {
    const prof = profile();
    const name = prof.name || (store.ready ? defaultName() : "");
    const parts = [];
    parts.push(`<div class="head"><div class="eyebrow">${esc(capitalize(fmtWeekday.format(new Date())))}</div><h1 class="h1">${name ? "Привет, " + esc(name) + "!" : "Привет!"}</h1><p class="lead">Подготовка к ЕГЭ по трём предметам: ${esc(CONTENT.map((s) => s.name.toLowerCase()).join(", "))}. Здесь темы и тесты, план подготовки и твои показатели.</p></div>`);
    if (store.backend && store.ready && !store.user) parts.push(`<div class="notice"><b>Гостевой режим.</b><span>Прогресс сохраняется только в этом браузере. <button type="button" class="link-btn" data-a="auth-screen">Войти или создать аккаунт</button>, чтобы синхронизировать с сервером.</span></div>`);
    if (store.ready && !prof.exists && store.error !== "readonly" && (!store.backend || store.user || ui.guest)) parts.push(onboardingCard());
    if (store.mode === "local" && !store.backend) parts.push(localNotice());
    parts.push(staleNotice());
    parts.push(`<div class="grid-hero">${heroCard(prof)}${readinessCard(prof)}</div>`);
    const stMkt = mkt();
    const balTxt = stMkt.balance
      ? "Активный баланс: " + stMkt.balance.toLocaleString("ru-RU") + " ₽ · выбери кружочек времени и предложи ставку"
      : "Задания и справочник бесплатны всегда · или открой баланс 5 000 / 10 000 ₽ на уроки с выбором времени в кружочках";
    parts.push(`<section class="section"><div class="card" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="stack" style="gap:3px"><b>Маркетплейс репетиторов (ЕГЭ / ОГЭ)</b><span class="small muted">${esc(balTxt)}</span></div><div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn soft sm" data-a="go" data-v="landing">Тарифы 0 / 5к / 10к</button><button type="button" class="btn sm" data-a="go" data-v="market">Подобрать репетитора</button></div></div></section>`);
    parts.push(`<section class="section"><div class="section-head"><h2 class="h2">Что дальше</h2><span class="small muted">по твоему прогрессу</span></div><div class="steps">${nextSteps().map(stepBtn).join("")}</div></section>`);
    parts.push(`<div class="grid-2">${upcomingCard()}${examsCard(prof)}</div>`);
    parts.push(activityCard());
    return parts.join("");
  }
  function onboardingCard() {
    const cloudText = store.mode === "cloud"
      ? (store.backend
          ? "Прогресс сохраняется на сервере и привязан к твоему аккаунту: открой сайт с любого устройства под своим логином, и всё будет на месте."
          : "Прогресс сохраняется в облаке claude.ai: открой эту страницу на любом компьютере под своим аккаунтом, и всё будет на месте.")
      : "Сейчас данные сохраняются только в этом браузере.";
    return `<form class="card pad-lg form" data-f="onboard" style="border-color:var(--accent)">
      <div class="eyebrow">Первый вход</div>
      <h2 class="h2">Давай настроим подготовку</h2>
      <p class="ink2">${cloudText}</p>
      ${store.user ? "" : `<div class="field"><label for="ob-name">Как к тебе обращаться</label><input class="input" id="ob-name" data-d="ob.name" value="${esc(draft("ob.name", defaultName()))}" maxlength="40"></div>`}
      <div class="label">Целевые баллы ЕГЭ</div>
      <div class="fields">${SUBJECT_META.map((s) => `<div class="field"><label for="ob-${s.id}">${esc(s.name)}</label><input class="input num" type="number" min="0" max="100" inputmode="numeric" id="ob-${s.id}" data-d="ob.${s.id}" value="${esc(draft("ob." + s.id, DEFAULT_TARGETS[s.id]))}"></div>`).join("")}</div>
      <p class="hint">Ориентир: сумма по трём предметам — до 300 баллов (обычно цель ставят от 220+). Целевые баллы можно поменять позже в настройках.</p>
      <div><button class="btn" type="submit">Начать подготовку</button></div>
    </form>`;
  }
  function heroMetaRow() {
    const tot = totals();
    if (!tot.streak && !tot.today) return "";
    return `<div class="row" style="gap:6px">${tot.streak ? `<span class="chip good">Серия: ${days(tot.streak)}</span>` : ""}${tot.today ? `<span class="chip accent">Сегодня: ${minutesText(tot.today)}</span>` : ""}</div>`;
  }
  function heroCard(prof) {
    const apply = planItems().find((i) => i.id === "ege-apply");
    const meta = heroMetaRow();
    const goSubjBtn = CONTENT.length ? `<button type="button" class="btn ghost" data-a="go" data-v="subject" data-sid="${ui.sid}">К тренировкам</button>` : "";
    if (apply && !apply.done && validISO(apply.due) && daysUntil(apply.due) >= 0) {
      const n = daysUntil(apply.due);
      return `<section class="hero" aria-label="Главный срок">
        <div class="row between"><span class="eyebrow">Главный срок</span>${meta}</div>
        <div class="hero-figure">${n === 0 ? '<span class="hero-num">Сегодня</span>' : `<span class="hero-num num">${n}</span><span class="hero-unit">${plural(n, "день", "дня", "дней")}</span>`}</div>
        <p class="hero-text">${n === 0 ? "последний день" : "до " + dateDay(apply.due) + ", последнего дня"} подачи заявления на ЕГЭ по химии, биологии и русскому языку. Возьми паспорт и аттестат.</p>
        <div class="row"><button type="button" class="btn" data-a="go" data-v="plan">Открыть план</button>${goSubjBtn}</div>
      </section>`;
    }
    const ex = nextExam(prof);
    if (ex) {
      const n = daysUntil(ex.date);
      return `<section class="hero" aria-label="Ближайший экзамен">
        <div class="row between"><span class="eyebrow">Ближайший экзамен</span>${meta}</div>
        <div class="hero-figure">${n === 0 ? '<span class="hero-num">Сегодня</span>' : `<span class="hero-num num">${n}</span><span class="hero-unit">${plural(n, "день", "дня", "дней")}</span>`}</div>
        <p class="hero-text">${n === 0 ? "экзамен" : "до экзамена"} по предмету «${esc(ex.name)}», ${dateLong(ex.date)}. Цель — ${prof.targets[ex.subject]} баллов.</p>
        <div class="row"><button type="button" class="btn" data-a="go" data-v="plan">Открыть план</button>${goSubjBtn}</div>
      </section>`;
    }
    return `<section class="hero"><div class="row between"><span class="eyebrow">Экзамены позади</span>${meta}</div><p class="hero-text">Теперь главное — заявление в вуз, конкурсные списки и согласие на зачисление.</p><div class="row"><button type="button" class="btn" data-a="go" data-v="plan">Открыть план</button></div></section>`;
  }
  function readinessCard(prof) {
    if (!CONTENT.length) return "";
    const rows = CONTENT.map((s) => {
      const st = subjectStats(s.id);
      const mis = store.ready ? mistakeQs(s.id).length : 0;
      const due = store.ready ? dueQs(s.id).length : 0;
      return `<div class="stack" style="gap:6px">
        <div class="row between"><button type="button" class="link-btn row" style="gap:8px" data-a="go" data-v="subject" data-sid="${s.id}"><i class="dot" style="background:var(--c-${s.id})"></i>${esc(s.name)}</button><span class="row" style="gap:8px"><b class="num">${store.ready ? st.pct + "%" : "—"}</b><span class="chip">цель ${prof.targets[s.id]}</span></span></div>
        <div class="meter"><i style="width:${st.pct}%"></i></div>
        <div class="row between small muted"><span>освоено ${st.mastered} из ${st.total} · начато ${st.started} из ${st.topics} тем</span>${mis ? `<span class="chip warn">ошибок: ${mis}</span>` : due ? `<span class="chip leaf">повторить: ${due}</span>` : ""}</div>
      </div>`;
    }).join("");
    return `<section class="card pad-lg stack" aria-label="Готовность по предметам">
      <div class="eyebrow">Готовность по предметам</div>
      ${rows}
      <div class="hint">Вопрос считается освоенным после двух верных ответов подряд.</div>
    </section>`;
  }
  function nextSteps() {
    const steps = [];
    if (ui.quiz && !ui.quiz.done) steps.push({ a: "go", v: "quiz", ico: "arrow", tone: "leaf", title: "Вернуться к тесту", sub: `${ui.quiz.title} · вопрос ${ui.quiz.i + 1} из ${ui.quiz.items.length}` });
    if (store.ready) {
      const pd = planDoc();
      CONTENT.forEach((s) => {
        if (subjectStats(s.id).seen === 0 && !pd.done[DIAG_PLAN_ID[s.id]]) steps.push({ a: "quiz-mixed", sid: s.id, ico: "spark", tone: "leaf", title: "Пройди диагностический тест " + SUBJ[s.id].po, sub: QUIZ_SIZE + " вопросов по всем разделам — результат сразу отметится в плане" });
      });
    }
    CONTENT.forEach((s) => {
      const due = dueQs(s.id).length;
      if (due) steps.push({ a: "quiz-review", sid: s.id, ico: "repeat", title: `Повтори ${due} ${plural(due, "вопрос", "вопроса", "вопросов")} · ${s.name}`, sub: "Интервальное повторение: пора закрепить пройденное" });
    });
    CONTENT.forEach((s) => {
      const mis = mistakeQs(s.id).length;
      if (mis) steps.push({ a: "quiz-mistakes", sid: s.id, ico: "alert", tone: "warn", title: `Работа над ошибками · ${s.name} · ${mis}`, sub: "Вопросы, где ответ был неверным" });
    });
    // Следующая тема — в предмете, где готовность ниже.
    const order = CONTENT.slice().sort((a, b) => subjectStats(a.id).pct - subjectStats(b.id).pct);
    for (const s of order) {
      const nt = SUBJ[s.id].topicList.find((t) => topicStats(t).pct < 90);
      if (!nt) continue;
      const ts = topicStats(nt);
      steps.push({ a: "open-topic", id: nt.id, ico: "book", tone: "good", title: (ts.pct ? "Продолжи: " : "Начни: ") + nt.title, sub: `${s.name} · ${codeLabel(nt).toLowerCase()} · освоено ${ts.mastered} из ${ts.total}` });
      break;
    }
    const todo = planItems().filter((i) => !i.done && validISO(i.due)).sort(byDue)[0];
    if (todo) {
      const n = daysUntil(todo.due);
      steps.push({ a: "go", v: "plan", ico: "list", title: todo.title, sub: n < 0 ? "срок прошёл " + dateLong(todo.due) : n === 0 ? "срок сегодня" : "срок — " + dateLong(todo.due) + ", через " + days(n) });
    }
    return steps.slice(0, 6);
  }
  function upcomingCard() {
    const all = planItems();
    const list = all.filter((i) => !i.done && validISO(i.due)).sort(byDue).slice(0, 4);
    const done = all.filter((i) => i.done).length;
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Ближайшие дела</h2><button type="button" class="link-btn" data-a="go" data-v="plan">Весь план</button></div>
      <div class="small muted">Сделано ${done} из ${all.length}</div>
      <div class="stack">${list.map((it) => todoItem(it, true)).join("") || '<div class="empty">Все дела выполнены.</div>'}</div>
    </section>`;
  }
  function examsCard(prof) {
    const rows = (EGE.exams || []).map((e) => ({ subject: e.subject, name: e.name, date: prof.exams[e.subject] || e.date }))
      .filter((r) => validISO(r.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const sum = SUBJECT_META.reduce((n, s) => n + (Number(prof.targets[s.id]) || 0), 0);
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Экзамены</h2><button type="button" class="link-btn" data-a="go" data-v="profile">Изменить даты</button></div>
      <div>${rows.map((r) => {
        const n = daysUntil(r.date);
        const chip = n < 0 ? '<span class="chip">прошёл</span>' : n === 0 ? '<span class="chip bad">сегодня</span>' : `<span class="chip${n <= 30 ? " warn" : ""}">через ${days(n)}</span>`;
        return `<div class="exam-row"><i class="dot" style="background:var(--c-${r.subject})"></i><div><div class="entry-title">${esc(r.name)}</div><div class="small muted">${dateLong(r.date)} · цель ${prof.targets[r.subject]}</div></div>${chip}</div>`;
      }).join("")}</div>
      <div class="hint">Даты по проекту расписания ЕГЭ-2027. Сумма целей — ${sum} из 300.</div>
    </section>`;
  }
  function activityCard() {
    const tot = totals();
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Занятия за 4 недели</h2><span class="small muted">минуты в день</span></div>
      <div class="chart" data-chart="activity" style="height:170px"></div>
      <div class="row between small"><span class="muted">Всего за 28 дней — ${minutesText(tot.d28)}</span><button type="button" class="link-btn" data-a="go" data-v="stats">Все показатели</button></div>
    </section>`;
  }

  // ---------- предмет и темы ----------
  function viewSubject() {
    const sid = SUBJ[ui.sid] ? ui.sid : firstSubject.id;
    const s = SUBJ[sid];
    if (!s) return `<div class="empty">Предмет пока не добавлен.</div>`;
    const st = subjectStats(sid), prof = profile();
    const ex = prof.exams[sid], n = validISO(ex) ? daysUntil(ex) : null;
    const due = dueQs(sid).length, mis = mistakeQs(sid).length;
    const soon = SUBJECTS.filter((x) => !x.content);
    const switcher = CONTENT.length > 1
      ? `<div class="switch" role="group" aria-label="Предмет">${SUBJECTS.map((x) => x.content
        ? `<button type="button" data-a="go" data-v="subject" data-sid="${x.id}" aria-pressed="${x.id === sid}"><i class="dot" style="background:var(--c-${x.id})"></i><span>${esc(x.name)}</span><span class="small num" style="opacity:.75">${subjectStats(x.id).pct}%</span></button>`
        : `<button type="button" disabled>${esc(x.name)} · скоро</button>`).join("")}</div>`
      : "";
    const qNorm = norm(ui.subjQ);
    const totalTopics = s.topicList.length;
    const filteredSecs = s.sections.map((sec) => {
      const secMatch = qNorm && norm(sec.title).includes(qNorm);
      const topics = sec.topics.filter((t) => {
        if (qNorm && !secMatch && !norm(t.title).includes(qNorm) && !norm(t.code).includes(qNorm)) return false;
        if (ui.subjFilter === "todo") return topicStats(t).pct < 90;
        if (ui.subjFilter === "mistakes") return mistakeQs(sid, t.id).length > 0;
        return true;
      });
      return { sec, topics };
    }).filter((x) => x.topics.length);
    const shownTopics = filteredSecs.reduce((n, x) => n + x.topics.length, 0);
    return `${switcher}<div class="head">
        <div class="eyebrow">Предмет · ЕГЭ 2027</div>
        <div class="head-row"><h1 class="h1">${esc(s.name)}</h1><span class="chip leaf">готовность ${st.pct}%</span></div>
        <p class="lead">${validISO(ex) ? `Экзамен по проекту расписания — ${dateLong(ex)}${n > 0 ? ", через " + days(n) : ""}. ` : ""}${esc(s.about || "")} Вопрос считается освоенным после двух верных ответов подряд.</p>
      </div>
      <div class="facts">${s.exam.facts.map((f) => `<div class="fact"><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join("")}</div>
      <p class="hint">${esc(s.exam.note)}</p>
      ${s.fullVariant ? `<section class="card stack"><h2 class="h2">Пробные варианты ЕГЭ</h2><p class="small muted">${esc(s.fullVariant.sub)}</p>
        <div class="row" style="flex-wrap:wrap">${range(s.fullVariant.count).map((i) => `<button type="button" class="btn ghost sm" data-a="quiz-fullvariant" data-sid="${sid}" data-k="${i + 1}">Вариант ${i + 1}</button>`).join("")}<button type="button" class="btn sm" data-a="quiz-fullvariant" data-sid="${sid}" data-k="0">Случайный</button></div></section>` : ""}
      <section class="card stack"><h2 class="h2">Тренировка</h2><div class="steps">
        ${stepBtn({ a: "quiz-mixed", sid, ico: "spark", tone: "leaf", title: "Смешанный тест", sub: QUIZ_SIZE + " вопросов из разных тем: сначала новые и трудные" })}
        ${stepBtn({ a: "quiz-review", sid, ico: "repeat", title: "Повторение" + (due ? " · " + due : ""), sub: due ? "Вопросы, которые пора закрепить" : "Сейчас повторять нечего: вопросы появятся здесь по расписанию" })}
        ${stepBtn({ a: "quiz-mistakes", sid, ico: "alert", tone: "warn", title: "Работа над ошибками" + (mis ? " · " + mis : ""), sub: mis ? "Вопросы с неверным ответом" : "Ошибок пока нет" })}
        ${s.variant ? stepBtn({ a: "quiz-variant", sid, ico: "list", title: s.variant.label || "Пробный вариант ЕГЭ · часть 1", sub: s.variant.sub || "Задания 1–26 подряд, баллы как на экзамене, ответы — в конце" }) : ""}
        ${s.part2 ? stepBtn({ a: "quiz-part2", sid, ico: "book", title: s.part2.label, sub: s.part2.sub }) : ""}
        ${sid === "rus" && EGE.essay ? stepBtn({ a: "go", v: "essay", ico: "book", title: "Тренажёр сочинения", sub: "Задание 27: тексты, план, клише, аргументы и проверка по критериям" }) : ""}
      </div></section>
      <section class="section">
        <div class="section-head"><h2 class="h2">Темы предмета</h2><span class="small muted">${qNorm || ui.subjFilter !== "all" ? `показано ${shownTopics} из ${totalTopics}` : `всего тем: ${totalTopics}`}</span></div>
        <div class="toolbar">
          <div class="search-wrap">
            <input class="input" id="subj-q" type="text" autocomplete="off" spellcheck="false" value="${esc(ui.subjQ)}" placeholder="Поиск по теме или номеру задания…">
            ${ui.subjQ ? `<button type="button" class="search-clear" data-a="subj-clear" aria-label="Очистить поиск">${icon("x")}</button>` : ""}
          </div>
          <div class="switch" role="group" aria-label="Фильтр тем">
            <button type="button" data-a="subj-filter" data-filter="all" aria-pressed="${ui.subjFilter === "all"}">Все</button>
            <button type="button" data-a="subj-filter" data-filter="todo" aria-pressed="${ui.subjFilter === "todo"}">Не освоенные</button>
            <button type="button" data-a="subj-filter" data-filter="mistakes" aria-pressed="${ui.subjFilter === "mistakes"}">С ошибками</button>
          </div>
        </div>
      </section>
      ${filteredSecs.length ? filteredSecs.map((x) => `<section class="section-block"><div class="section-title"><span class="section-num">Раздел ${x.sec.n}</span><h2 class="h2">${esc(x.sec.title)}</h2></div><div class="slides">${x.topics.map(slide).join("")}</div></section>`).join("") : `<div class="empty"><b>Темы не найдены</b><span>В этом фильтре тем нет — попробуй другой запрос.</span><button type="button" class="btn ghost sm" data-a="subj-clear">Сбросить фильтр</button></div>`}
      <section class="card stack"><h2 class="h2">Где ещё тренироваться</h2><div class="stack">${s.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div></section>
      ${soon.length ? `<div class="empty"><b>${esc(soon.map((x) => x.name).join(", "))}</b><span>Появится здесь позже — с такими же темами, тестами и прогрессом. Пока записывай занятия в «Показатели».</span></div>` : ""}`;
  }
  function sectionBlock(sec) {
    return `<section class="section-block"><div class="section-title"><span class="section-num">Раздел ${sec.n}</span><h2 class="h2">${esc(sec.title)}</h2></div><div class="slides">${sec.topics.map(slide).join("")}</div></section>`;
  }
  function slide(t) {
    const ts = topicStats(t), p = prog(t.sid);
    const dots = t.qids.map((id) => { const st = p.q[id]; return `<i class="qdot" data-s="${st && st.n ? st.last : -1}"></i>`; }).join("");
    const chipCls = ts.pct >= 90 ? "good" : ts.pct > 0 ? "leaf" : "";
    return `<button type="button" class="slide" data-a="open-topic" data-id="${t.id}">
      <span class="slide-label">${esc(t.code)}<small>${esc((SUBJ[t.sid].codeName || "Тема").toUpperCase())}</small></span>
      <span class="slide-body">
        <span class="slide-top"><span class="slide-title">${esc(t.title)}</span><span class="chip ${chipCls} num">${ts.pct}%</span></span>
        <span class="meter thin"><i style="width:${ts.pct}%"></i></span>
        <span class="slide-meta"><span>освоено ${ts.mastered} из ${ts.total}</span>${ts.read ? "<span>теория прочитана</span>" : ""}<span class="qdots" aria-hidden="true">${dots}</span></span>
      </span>
    </button>`;
  }
  function viewTopic() {
    const t = TOPICS[ui.topicId];
    if (!t) { ui.view = "subject"; return viewSubject(); }
    const ts = topicStats(t), p = prog(t.sid);
    const mis = mistakeQs(t.sid, t.id).length;
    const gen = ui.gen && ui.gen.topicId === t.id ? ui.gen : null;
    const aiBtn = ai.state !== "ready" || t.noGen ? "" : gen && gen.status === "busy"
      ? `<button type="button" class="btn soft" data-a="gen-stop">${icon("stop")}Остановить</button>`
      : `<button type="button" class="btn soft" data-a="gen-ai" data-id="${t.id}">${icon("spark")}Ещё 5 вопросов от ИИ</button>`;
    return `<div><button type="button" class="link-btn" data-a="go" data-v="subject" data-sid="${t.sid}">← ${esc(SUBJ[t.sid].name)}</button></div>
      <div class="head"><div class="eyebrow">${esc(codeLabel(t))} · ${esc(t.sec.title)}</div><h1 class="h1">${esc(t.title)}</h1></div>
      <section class="card stack">
        <div class="row between"><span class="tile-label">Прогресс темы</span><span class="chip ${ts.pct >= 90 ? "good" : "leaf"} num">${ts.pct}%</span></div>
        <div class="meter"><i style="width:${ts.pct}%"></i></div>
        <div class="row small ink2"><span>Освоено ${ts.mastered} из ${ts.total}</span><span>·</span><span>${ts.read ? "теория прочитана" : "теория не отмечена"}</span>${mis ? `<span>·</span><span>ошибок: ${mis}</span>` : ""}</div>
        <div class="row">
          ${ts.total > TOPIC_QUIZ + 5
            ? `<button type="button" class="btn" data-a="quiz-topic" data-id="${t.id}">Тест · ${TOPIC_QUIZ} вопросов</button><button type="button" class="btn ghost" data-a="quiz-topic" data-all="1" data-id="${t.id}">Все вопросы · ${ts.total}</button>`
            : `<button type="button" class="btn" data-a="quiz-topic" data-all="1" data-id="${t.id}">Пройти тест · ${ts.total}</button>`}
          ${mis ? `<button type="button" class="btn ghost" data-a="quiz-topic-mistakes" data-id="${t.id}">Только ошибки · ${mis}</button>` : ""}
          ${aiBtn}
        </div>
        ${gen && gen.status === "busy" ? '<div class="hint">ИИ составляет новые задания по теме, это занимает до минуты.</div>' : ""}
        ${gen && gen.status === "error" ? `<div class="notice">${esc(gen.error)}</div>` : ""}
      </section>
      <section class="card pad-lg stack">
        <h2 class="h2">Конспект</h2>
        ${t.tablesFirst ? tablesHTML(t) : ""}
        <ul class="theory">${t.theory.map((x) => x.startsWith("## ") ? `<li class="th-h">${rich(x.slice(3))}</li>` : `<li>${rich(x)}</li>`).join("")}</ul>
        ${t.tablesFirst ? "" : tablesHTML(t)}
        <div class="row">
          <button type="button" class="btn ${ts.read ? "ghost" : "soft"} sm" data-a="theory" data-id="${t.id}">${ts.read ? "Снять отметку «прочитано»" : icon("check") + "Отметить как прочитанное"}</button>
          ${ai.state === "ready" ? `<button type="button" class="btn ghost sm" data-a="ask-tutor" data-id="${t.id}">${icon("chat")}Спросить репетитора</button>` : ""}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2 class="h2">Вопросы темы</h2><span class="small muted">нажми на вопрос, чтобы ответить только на него</span></div>
        ${(() => {
          const unseenCount = t.qids.filter((id) => !p.q[id] || !p.q[id].n).length;
          const qFilter = t.qids.length > 6 ? `<div class="switch" role="group" aria-label="Фильтр вопросов">
            <button type="button" data-a="topic-filter" data-filter="all" aria-pressed="${ui.topicFilter === "all"}">Все (${t.qids.length})</button>
            <button type="button" data-a="topic-filter" data-filter="mistakes" aria-pressed="${ui.topicFilter === "mistakes"}">С ошибками (${mis})</button>
            <button type="button" data-a="topic-filter" data-filter="unseen" aria-pressed="${ui.topicFilter === "unseen"}">Новые (${unseenCount})</button>
          </div>` : "";
          const listIds = t.qids.filter((id) => {
            if (ui.topicFilter === "mistakes") { const st = p.q[id]; return st && st.n && st.last !== 2; }
            if (ui.topicFilter === "unseen") return !p.q[id] || !p.q[id].n;
            return true;
          });
          return qFilter + (listIds.length ? `<div class="stack">${listIds.map((id) => qRow(QS[id], p.q[id])).join("")}</div>` : `<div class="empty">В этом фильтре вопросов нет.</div>`);
        })()}
        <div class="qlegend"><span><i class="qdot" data-s="2"></i>верно</span><span><i class="qdot" data-s="1"></i>одна ошибка</span><span><i class="qdot" data-s="0"></i>неверно</span><span><i class="qdot" data-s="-1"></i>ещё не было</span></div>
      </section>`;
  }
  // Справочные таблицы темы (t.tables): первая строка — заголовок, head1 — первый столбец тоже заголовок.
  function tablesHTML(t) {
    return (t.tables || []).map((tb) => `<div class="small muted">${rich(tb.title)}</div><div class="qtbl-wrap"><table class="qtbl">${tb.rows.map((r, i) => `<tr>${r.map((c, j) => (i === 0 || (tb.head1 && j === 0) ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></div>${tb.note ? `<div class="small muted">${rich(tb.note)}</div>` : ""}`).join("");
  }
  function qRow(q, st) {
    const s = st && st.n ? st.last : -1;
    const txt = q.q.length > 130 ? q.q.slice(0, 128) + "…" : q.q;
    return `<button type="button" class="step-btn" data-a="quiz-one" data-id="${esc(q.id)}" style="grid-template-columns:20px minmax(0,1fr) auto"><i class="qdot big" data-s="${s}"></i><span style="min-width:0"><span style="display:block">${esc(txt)}</span><span class="step-sub" style="display:block">${esc(typeLabel(q))}${st && st.n ? ` · ответов ${st.n}, верных ${st.k}` : ""}</span></span><span class="arrow">${icon("arrow")}</span></button>`;
  }

  // ---------- тесты ----------
  function typeLabel(q) {
    if (q.t === "multi") return q.open ? "Несколько верных ответов" : "Выбери " + q.a.length + " " + plural(q.a.length, "ответ", "ответа", "ответов");
    if (q.t === "input" && q.d) return "Ответ — цифры";
    if (q.t === "input" && q.num) return "Ответ — число";
    return { single: "Один верный ответ", match: "Соответствие", order: "Последовательность", input: "Краткий ответ", self: "Развёрнутый ответ · самопроверка" }[q.t] || "";
  }
  function makeItem(q) {
    const it = { q, key: !q.ai, resp: null, res: null, view: null, hinted: false, hintOpen: false };
    if (q.t === "single" || q.t === "multi") it.view = shuffle(range(q.o.length));
    if (q.t === "match") it.view = q.fixed ? range(q.l.length) : shuffle(range(q.l.length)); // fixed — буквы А–Г как в рецензии
    if (q.t === "order") {
      let v = shuffle(range(q.o.length));
      for (let k = 0; k < 6 && v.every((x, i) => x === i); k++) v = shuffle(range(q.o.length));
      it.view = v;
    }
    it.resp = q.t === "single" ? -1 : q.t === "multi" || q.t === "order" ? [] : q.t === "match" ? q.l.map(() => -1) : "";
    if (q.t === "self") it.resp = { text: "", sel: [] }; // развёрнутый ответ: текст и отмеченные элементы эталона
    return it;
  }
  function startQuiz(opts) {
    const qs = (opts.qs || []).filter(Boolean);
    if (!qs.length) { toast("Здесь пока нет вопросов."); return; }
    abortAI();
    ui.quiz = {
      title: opts.title, sid: opts.sid, mode: opts.mode, topicId: opts.topicId || null,
      items: qs.map((q, i) => Object.assign(makeItem(q), opts.ns ? { n: opts.ns[i] } : {})), i: 0, checked: false, done: false,
      sessionId: newId(), startDay: todayISO(), started: Date.now(), qStart: Date.now(), pausedAt: null,
      spent: 0, answered: 0, correct: 0, hints: 0, back: opts.back || { v: "subject", sid: opts.sid }, ai: null, cfg: opts.cfg || null,
      planId: opts.planId || null, retry: !!opts.retry
    };
    saveActiveQuiz();
    ui.focusNext = qs[0].t === "input" ? "ans" : null;
    go("quiz");
  }
  function weight(st, today) {
    if (!st || !st.n) return 3 + Math.random();
    if (st.last !== 2) return 4 + Math.random();
    if ((st.due || "") <= today) return 2 + Math.random();
    return Math.random();
  }
  // По одному вопросу из каждой темы по кругу — так тест покрывает весь курс.
  function pickMixed(sid, n) {
    const s = SUBJ[sid], p = prog(sid), today = todayISO();
    const w = {};
    const lists = shuffle(s.topicList).map((t) => {
      t.qids.forEach((id) => { w[id] = weight(p.q[id], today); });
      return t.qids.slice().sort((a, b) => w[b] - w[a]);
    });
    lists.sort((a, b) => (w[b[0]] || 0) - (w[a[0]] || 0));
    const out = [];
    for (let round = 0; out.length < n; round++) {
      let added = false;
      for (const l of lists) { if (l[round] && out.length < n) { out.push(l[round]); added = true; } }
      if (!added) break;
    }
    return shuffle(out);
  }
  // Тест по теме: сначала новые и трудные вопросы; вопросы к одному тексту идут подряд.
  function pickTopic(t, n) {
    const p = prog(t.sid), today = todayISO(), groups = {};
    for (const id of shuffle(t.qids)) {
      const k = QS[id].ctx ? "ctx:" + QS[id].ctx : id;
      const g = (groups[k] = groups[k] || { w: 0, ids: [] });
      g.ids.push(id); g.w = Math.max(g.w, weight(p.q[id], today));
    }
    const out = [];
    for (const g of Object.values(groups).sort((a, b) => b.w - a.w)) {
      if (out.length >= n) break;
      out.push(...g.ids);
    }
    return t.texts ? out : shuffle(out);
  }
  // Пробный вариант: по одному заданию на каждый номер ЕГЭ; задания к тексту — из одного текста.
  function pickVariant(sid, cfg, seed) {
    const p = prog(sid), today = todayISO(), out = [];
    for (const sl of (cfg || SUBJ[sid].variant).slots) {
      // slot.kim — задания с меткой kim (номер КИМ) из любых тем; slot.topic — все задания одной темы
      const t = sl.topic ? TOPICS[sl.topic] : { qids: SUBJ[sid].topicList.reduce((a, x) => a.concat(x.qids), []).filter((id) => [].concat(QS[id].kim || []).includes(sl.kim)) };
      if (!t || !t.qids || !t.qids.length) continue;
      const W = {};
      const w = (id) => (id in W ? W[id] : (W[id] = weight(p.q[id], today) + (sl.prefer && sl.prefer(QS[id]) ? 10 : 0)));
      const ns = [].concat(sl.n);
      if (sl.byText) {
        const best = Object.keys(t.texts || {}).map((k) => {
          const ids = t.qids.filter((id) => QS[id].ctx === k);
          const pick = sl.byText.map((re) => ids.filter((id) => re.test(QS[id].q)).sort((a, b) => w(b) - w(a))[0]);
          return { pick, w: pick.every(Boolean) ? pick.reduce((s, id) => s + w(id), 0) : -1 };
        }).filter((x) => x.w >= 0).sort((a, b) => b.w - a.w)[0];
        if (best) best.pick.forEach((id, i) => out.push({ id, n: ns[i] }));
      } else {
        const pool = t.qids.filter((id) => !sl.like || sl.like.test(QS[id].q));
        // с номером варианта (seed) берём задание по порядку в банке, иначе — новые и слабые вперёд
        // slot.prefer (например, задания с рисунком) идут в порядке банка первыми
        const ordered = seed && sl.prefer ? pool.filter((id) => sl.prefer(QS[id])).concat(pool.filter((id) => !sl.prefer(QS[id]))) : pool;
        const pick = seed ? ns.map((_, i) => ordered[(seed - 1 + i) % ordered.length]) : pool.sort((a, b) => w(b) - w(a)).slice(0, ns.length);
        pick.forEach((id, i) => out.push({ id, n: ns[i] }));
      }
    }
    return out;
  }
  // Баллы как в ЕГЭ: двухбалльные задания — 2 или 1 за одну ошибку, остальные — 1 только за полностью верный ответ.
  function variantScore(qz) {
    const two = (qz.cfg || SUBJ[qz.sid].variant || {}).two || [];
    let pts = 0, max = 0;
    const cells = qz.items.map((it) => {
      const self = it.q.t === "self"; // развёрнутый ответ: баллы по отмеченным элементам эталона
      const m = self ? it.q.els.length : two.includes(it.n) ? 2 : 1;
      const p = !it.res ? 0 : self ? it.res.pts : m === 2 ? it.res.r : it.res.r === 2 ? 1 : 0;
      pts += p; max += m;
      return { it, n: it.n, p, m };
    });
    return { pts, max, cells };
  }
  function curItem() { return ui.quiz && !ui.quiz.done ? ui.quiz.items[ui.quiz.i] : null; }
  // Текст, к которому относится задание (задания 1–3 и 22 по русскому языку).
  function passageOf(q) { const t = TOPICS[q.topic]; return (q.ctx && t && t.texts && t.texts[q.ctx]) || ""; }
  // Таблица к заданию (q.tbl — строки, первая — заголовок): задания 1, 20 и 21 по биологии.
  function tableHTML(q) {
    const fig = q.svg ? `<div class="qfig">${q.svg}</div>` : ""; // рисунок к заданию (свой SVG из файлов сайта)
    if (!q.tbl) return fig;
    return fig + `<div class="qtbl-wrap"><table class="qtbl">${q.tbl.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></div>`;
  }
  function canCheck(it) {
    const q = it.q, r = it.resp;
    if (q.t === "single") return r >= 0;
    if (q.t === "multi") return r.length > 0;
    if (q.t === "match") return r.every((x) => x >= 0);
    if (q.t === "order") return r.length === q.o.length;
    if (q.t === "self") return true;
    return String(r || "").trim() !== "";
  }
  // Оценка как в ЕГЭ: 2 балла без ошибок, 1 — за одну ошибку в сложных заданиях.
  function grade(it) {
    const q = it.q, r = it.resp;
    // развёрнутый ответ: 1 балл за каждый отмеченный элемент эталона
    if (q.t === "self") { const pts = r.sel.length, max = q.els.length; return { r: pts === max ? 2 : pts >= Math.ceil(max / 2) ? 1 : 0, pts, max }; }
    if (q.t === "single") { const ok = r === q.a; return { r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 }; }
    if (q.t === "input") {
      if (q.num) {
        const v = parseNum(r);
        const ok = v !== null && q.a.some((x) => Math.abs(parseNum(x) - v) <= (q.tol || 0.001));
        return { r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
      }
      // d — цифры в любом порядке, x — пробелы и дефисы важны, иначе сравниваем без них.
      const f =q.d ? (s) => String(s || "").replace(/\D/g, "").split("").sort().join("") : q.x ? norm : normTight;
      const v = f(r);
      const ok = !!v && q.a.some((x) => f(x) === v);
      return { r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    let err = 0;
    if (q.t === "multi") {
      const sel = new Set(r), cor = new Set(q.a);
      let extra = 0, miss = 0;
      sel.forEach((x) => { if (!cor.has(x)) extra++; });
      cor.forEach((x) => { if (!sel.has(x)) miss++; });
      err = Math.max(extra, miss);
    } else if (q.t === "match") {
      err = q.a.reduce((n, a, i) => n + (r[i] === a ? 0 : 1), 0);
    } else if (q.t === "order") {
      const wrong = range(q.o.length).reduce((n, i) => n + (r[i] === i ? 0 : 1), 0);
      err = wrong === 0 ? 0 : wrong === 2 ? 1 : 2; // одна перестановка двух элементов — одна ошибка
    }
    const res = err === 0 ? 2 : err === 1 ? 1 : 0;
    return { r: res, pts: res, max: 2 };
  }
  function correctText(q) {
    if (q.t === "self") return q.ref;
    if (q.t === "single") return q.o[q.a];
    if (q.t === "multi") return q.a.map((i) => q.o[i]).join("; ");
    if (q.t === "match") return q.l.map((l, i) => l + " — " + q.r[q.a[i]]).join("; ");
    if (q.t === "order") return q.o.join(" → ");
    return q.num ? String(q.a[0]).replace(".", ",") : q.a[0];
  }
  function userText(it) {
    const q = it.q, r = it.resp;
    if (q.t === "self") return r.text.trim() || "ответ не записан";
    if (q.t === "single") return r >= 0 ? q.o[r] : "нет ответа";
    if (q.t === "multi") return r.length ? r.map((i) => q.o[i]).join("; ") : "нет ответа";
    if (q.t === "match") return q.l.map((l, i) => l + " — " + (r[i] >= 0 ? q.r[r[i]] : "?")).join("; ");
    if (q.t === "order") return r.map((i) => q.o[i]).join(" → ") || "нет ответа";
    return r || "нет ответа";
  }
  function optionsText(q) {
    if (q.t === "single" || q.t === "multi") return "Варианты: " + q.o.map((o, i) => i + 1 + ") " + o).join("; ");
    if (q.t === "match") return "Левый столбец: " + q.l.join("; ") + ". Правый столбец: " + q.r.join("; ");
    if (q.t === "order") return "Элементы: " + q.o.join("; ");
    return "";
  }
  function doCheck() {
    const qz = ui.quiz, it = curItem();
    if (!it || qz.checked || !canCheck(it)) return;
    const g = grade(it);
    it.res = g; qz.checked = true;
    qz.spent += Math.min(Date.now() - qz.qStart, MAX_Q_MS);
    qz.answered++;
    if (it.q.t !== "self") { if (g.r === 2) qz.correct++; if (it.key) recordAnswer(it.q, g.r); } // у развёрнутого ответа итог известен после отметок — см. doNext
    logQuizSession(qz);
    saveActiveQuiz();
    if (qz.mode === "variant") { doNext(); return; } // в пробном варианте ответы показываем в конце
    ui.focusNext = "next-btn";
    scheduleRender();
  }
  function recordAnswer(q, r) {
    const prev = prog(q.sid).q[q.id] || {};
    const b = r === 2 ? Math.min((prev.b || 0) + 1, INTERVALS.length - 1) : r === 1 ? Math.max(0, (prev.b || 0) - 1) : 0;
    const st = { n: (prev.n || 0) + 1, k: (prev.k || 0) + (r === 2 ? 1 : 0), b, last: r, at: Date.now(), due: addDays(todayISO(), INTERVALS[b]) };
    patchDoc("prog-" + q.sid, { q: { [q.id]: st } });
  }
  function logQuizSession(qz) {
    patchDoc("log-" + qz.startDay.slice(0, 7), { s: { [qz.sessionId]: {
      d: qz.startDay, sub: qz.sid, m: qz.answered ? Math.max(1, Math.round(qz.spent / 60000)) : 0, q: qz.answered, c: qz.correct,
      h: qz.hints || 0, k: "quiz", t: qz.topicId || qz.mode, at: qz.started
    } } });
  }
  function saveVariantMock(qz, silent) {
    if (!qz || !qz.done || qz.mode !== "variant") return;
    const cfg = qz.cfg || (SUBJ[qz.sid] && SUBJ[qz.sid].variant);
    if (!cfg || !cfg.goal || !cfg.goal.scale) return;
    const sc = variantScore(qz), scale = cfg.goal.scale;
    if (!qz.mockId) qz.mockId = newId();
    qz.items.forEach((it) => { if (it.q.t === "self" && it.res && !it.fin) { it.fin = true; if (it.key) recordAnswer(it.q, it.res.r); } });
    const testScore = scale[Math.min(sc.pts, scale.length - 1)] || 0;
    patchDoc("mocks", { m: { [qz.mockId]: { d: qz.startDay || todayISO(), sub: qz.sid, sc: testScore, p: sc.pts, n: qz.title, at: qz.started || Date.now(), auto: 1 } } });
    qz.saved = true;
    if (!silent) toast("Результат записан в «Показатели»");
  }
  function doNext() {
    const qz = ui.quiz;
    if (!qz || !qz.checked) return;
    const cur = qz.items[qz.i];
    if (cur.q.t === "self" && cur.res && !cur.fin && qz.mode !== "variant") { // развёрнутый ответ засчитываем, когда отметки расставлены (в варианте — после итогов)
      cur.fin = true;
      if (cur.res.r === 2) qz.correct++;
      if (cur.key) recordAnswer(cur.q, cur.res.r);
      logQuizSession(qz);
    }
    abortAI(); qz.ai = null;
    if (qz.i + 1 >= qz.items.length) {
      qz.done = true;
      completePlanFromQuiz(qz);
      if (qz.mode === "variant" && qz.answered > 0) saveVariantMock(qz, true);
      clearActiveQuiz();
    }
    else {
      qz.i++; qz.checked = false; qz.qStart = Date.now();
      saveActiveQuiz();
      ui.focusNext = qz.items[qz.i].q.t === "input" ? "ans" : null;
    }
    scheduleRender(true);
  }
  function exitQuiz() {
    const qz = ui.quiz;
    abortAI();
    const back = qz ? qz.back : { v: "home" };
    ui.quiz = null;
    clearActiveQuiz();
    go(back.v || "home", { id: back.id, sid: back.sid });
  }
  function renderQuestion(it, checked) {
    const q = it.q;
    if (q.t === "single" || q.t === "multi") {
      return `<div class="opts" role="group" aria-label="Варианты ответа">${it.view.map((oi, pos) => {
        const sel = q.t === "single" ? it.resp === oi : it.resp.includes(oi);
        let cls = "", mark = "";
        if (checked) {
          const cor = q.t === "single" ? q.a === oi : q.a.includes(oi);
          if (cor && sel) { cls = "ok"; mark = "верно"; }
          else if (sel) { cls = "bad"; mark = "ошибка"; }
          else if (cor) { cls = "miss"; mark = q.t === "single" ? "верный ответ" : "пропущено"; }
        }
        return `<button type="button" class="opt ${cls}" data-a="pick" data-i="${oi}" aria-pressed="${sel}"${checked ? " disabled" : ""}><span class="opt-key">${pos + 1}</span><span>${esc(q.o[oi])}</span><span class="opt-mark">${mark}</span></button>`;
      }).join("")}</div>`;
    }
    if (q.t === "match") {
      const legend = `<div class="legend-r${q.r.some((r) => r.length > 40) ? " long" : ""}">${q.r.map((r, i) => `<span><b>${i + 1}</b>${esc(r)}</span>`).join("")}</div>`;
      const rows = it.view.map((li, pos) => {
        const v = it.resp[li];
        let cls = "", fix = "";
        if (checked) {
          const ok = v === q.a[li];
          cls = ok ? "ok" : "bad";
          if (!ok) fix = `<div class="mrow-fix">Верно: ${q.a[li] + 1} — ${esc(q.r[q.a[li]])}</div>`;
        }
        const btns = q.r.map((r, ri) => `<button type="button" data-a="match" data-l="${li}" data-r="${ri}" aria-pressed="${v === ri}" aria-label="${esc(r)}" title="${esc(r)}"${checked ? " disabled" : ""}>${ri + 1}</button>`).join("");
        return `<div class="mrow ${cls}"><div><span class="mono muted">${LETTERS[pos]}</span> ${esc(q.l[li])}</div><div class="seg" role="group">${btns}</div>${fix}</div>`;
      }).join("");
      return legend + `<div class="mrows">${rows}</div>`;
    }
    if (q.t === "order") {
      const items = it.view.map((oi) => {
        const pos = it.resp.indexOf(oi);
        let cls = "", extra = "";
        if (checked) { cls = pos === oi ? "ok" : "bad"; if (pos !== oi) extra = ` <span class="small muted">— должно быть на месте ${oi + 1}</span>`; }
        return `<button type="button" class="ord ${cls}" data-a="ord" data-i="${oi}"${pos >= 0 ? ` data-n="${pos + 1}"` : ""}${checked ? " disabled" : ""}><span class="opt-key">${pos >= 0 ? pos + 1 : ""}</span><span>${esc(q.o[oi])}${extra}</span></button>`;
      }).join("");
      return `${checked ? "" : '<div class="hint">Нажимай на элементы по порядку. Повторное нажатие убирает элемент из последовательности.</div>'}<div class="order-pool">${items}</div>${!checked && it.resp.length ? '<div><button type="button" class="link-btn" data-a="ord-reset">Сбросить порядок</button></div>' : ""}`;
    }
    if (q.t === "self") {
      if (!checked) return `<div class="field"><label for="self-text">Твой ответ</label><textarea id="self-text" class="essay-area" rows="8" spellcheck="false" placeholder="Напиши ответ так, как на экзамене. Потом откроешь эталон и отметишь, что совпало.">${esc(it.resp.text)}</textarea></div>`;
      return `<div class="field"><label>Твой ответ</label><div class="passage"><p>${esc(it.resp.text.trim() || "(ответ не записан)")}</p></div></div>
        <div class="stack"><div class="eyebrow">Эталон</div><div class="passage"><p>${esc(q.ref)}</p></div>
        <div class="eyebrow">Отметь элементы, которые есть в твоём ответе: 1 балл за каждый</div>
        <div class="checklist">${q.els.map((x, i) => `<label><input type="checkbox" class="check" data-c="self-el" data-i="${i}"${it.resp.sel.includes(i) ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div></div>`;
    }
    return `<div class="field"><label for="ans">Твой ответ</label><input id="ans" class="answer-input" autocomplete="off" spellcheck="false" value="${esc(it.resp)}"${checked ? " disabled" : ""} placeholder="Введи ответ и нажми Enter"></div>`;
  }
  function feedbackBlock(it, qz) {
    const g = it.res, q = it.q;
    const self = q.t === "self";
    const title = self ? "Баллов за это задание: " + g.pts + " из " + g.max : g.r === 2 ? "Верно" : g.r === 1 ? "Почти: одна ошибка" : "Неверно";
    let aiPart = "";
    if (ai.state === "ready" && !self) {
      const st = qz.ai && qz.ai.forIdx === qz.i ? qz.ai : null;
      if (!st) aiPart = `<div><button type="button" class="btn soft sm" data-a="explain">${icon("spark")}Объясни подробнее</button></div>`;
      else {
        const busy = st.status === "thinking" || st.status === "streaming";
        aiPart = `<div class="ai-box"><div class="row between"><span class="eyebrow">Объяснение ИИ</span>${busy ? '<button type="button" class="link-btn" data-a="explain-stop">Остановить</button>' : ""}</div><div class="ai-text" id="ai-explain">${st.text ? fmtAI(st.text) : '<span class="muted">Думаю…</span>'}</div>${st.status === "error" ? `<div class="small" style="color:var(--bad)">${esc(st.error)}</div>` : ""}</div>`;
      }
    }
    const showCorrect = g.r !== 2 && (q.t === "single" || q.t === "multi" || q.t === "input");
    return `<div class="feedback" data-r="${g.r}">
      <div class="fb-title">${icon(g.r === 2 ? "check" : g.r === 1 ? "alert" : "x")}${title}${g.max === 2 && !self ? ` · ${g.pts} из 2 баллов` : ""}</div>
      ${showCorrect ? `<div class="small"><b>Правильный ответ:</b> ${esc(correctText(q))}</div>` : ""}
      ${q.e ? `<div class="small ink2">${esc(q.e)}</div>` : ""}
      ${aiPart}
    </div>`;
  }
  const HINT_STOP = new Set(["что", "как", "какой", "какая", "какие", "какое", "каких", "каком", "какую", "выбери", "выберите", "установи", "установите", "соответствие", "между", "расположи", "расположите", "порядке", "ответ", "запиши", "запишите", "слово", "одно", "цифр", "число", "три", "два", "всех", "этом", "или", "для", "при", "над", "под", "без", "про", "из", "по", "от", "до", "на", "во", "со", "не", "ни", "если", "признак", "признака", "признаки", "пример", "примером", "правило", "задания"]);
  function questionGuideHint(q) {
    const t = TOPICS[q.topic] || null;
    const rawText = norm(q.q + " " + (q.t === "match" && Array.isArray(q.l) ? q.l.join(" ") : ""));
    const stems = rawText.split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 4 && !HINT_STOP.has(w)).map((w) => w.slice(0, Math.min(w.length, 5))).slice(0, 8);
    const ansNorm = norm(correctText(q));
    const ansWords = new Set(ansNorm.split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 4));
    let subheading = "", bestScore = 0;
    const anchors = [];
    if (t && Array.isArray(t.theory)) {
      let curSub = "";
      for (const line of t.theory) {
        if (line.startsWith("## ")) { curSub = line.slice(3).trim(); continue; }
        const ln = norm(line);
        let sc = 0;
        for (const st of stems) if (ln.includes(st)) sc++;
        const m = line.match(/^\*\*(.+?)\*\*/);
        const label = m ? m[1].replace(/[:.;—–-]+$/, "").trim() : "";
        const labelNorm = norm(label);
        const safeLabel = label && labelNorm.length >= 3 && labelNorm !== "пример" && labelNorm !== "правило" && !ansWords.has(labelNorm) && !ansNorm.includes(labelNorm);
        if (sc > bestScore) { bestScore = sc; subheading = curSub; }
        if (sc > 0 && safeLabel && !anchors.includes(label) && anchors.length < 3) anchors.push(label);
      }
      if (!subheading && bestScore === 0) {
        const firstH = t.theory.find((x) => x.startsWith("## "));
        if (firstH) subheading = firstH.slice(3).trim();
      }
    }
    let tableTitle = "", bestTblScore = 0;
    if (t && Array.isArray(t.tables) && t.tables.length) {
      for (const tb of t.tables) {
        const tn = norm((tb.title || "") + " " + (tb.rows || []).map((r) => r.join(" ")).join(" "));
        let sc = 0;
        for (const st of stems) if (tn.includes(st)) sc++;
        if (sc > bestTblScore) { bestTblScore = sc; tableTitle = tb.title || ""; }
      }
      if (!tableTitle) tableTitle = t.tables[0].title || "";
    }
    const rawQuery = anchors[0] || subheading || (t ? t.title.split(/[:.,]/)[0].trim() : "");
    const guideQuery = rawQuery.split(/\s+/).slice(0, 2).join(" ");
    return {
      subjName: SUBJECT_NAME[q.sid] || "",
      secTitle: t && t.sec ? t.sec.title : "",
      topic: t,
      subheading,
      tableTitle,
      anchors,
      guideQuery
    };
  }
  function quizHintHTML(it) {
    const h = questionGuideHint(it.q);
    return `<div class="hint-box" role="region" aria-label="Подсказка по справочнику">
      <div class="hint-box-head">
        <span class="row" style="gap:6px">${icon("hint")}Где искать информацию в справочнике</span>
        <button type="button" class="link-btn small" data-a="quiz-hint">Скрыть</button>
      </div>
      <div class="small ink2">${esc(h.subjName)}${h.secTitle ? " · " + esc(h.secTitle) : ""}${h.topic ? ` · <b>${esc(codeLabel(h.topic) + " · " + h.topic.title)}</b>` : ""}</div>
      ${h.subheading ? `<div class="small">Раздел конспекта: <b>«${esc(h.subheading)}»</b></div>` : ""}
      ${h.tableTitle ? `<div class="small">Таблица в теме: <b>«${esc(h.tableTitle)}»</b></div>` : ""}
      ${h.anchors.length ? `<div class="small">Ориентиры в тексте: ${h.anchors.map((a) => `<b>«${esc(a)}»</b>`).join(", ")}</div>` : ""}
      <div class="row" style="gap:8px">
        <button type="button" class="btn soft sm" data-a="quiz-guide">${icon("book")}Открыть в справочнике</button>
        ${h.topic ? `<button type="button" class="btn ghost sm" data-a="open-topic" data-id="${h.topic.id}">Открыть конспект темы</button>` : ""}
      </div>
    </div>`;
  }
  function viewQuiz() {
    const qz = ui.quiz;
    if (!qz) { ui.view = "home"; return viewHome(); }
    if (qz.done) return qz.mode === "variant" ? variantSummary(qz) : quizSummary(qz);
    const it = qz.items[qz.i], q = it.q, t = TOPICS[q.topic];
    const exam = qz.mode === "variant";
    const pct = Math.round(((qz.i + (qz.checked ? 1 : 0)) / qz.items.length) * 100);
    const keys = q.t === "single" || q.t === "multi" ? "1–" + q.o.length + " — выбор, " : "";
    const mins = Math.floor((Date.now() - qz.started) / 60000);
    const strip = qz.items.length <= 40
      ? `<div class="quiz-strip" aria-hidden="true">${qz.items.map((x, idx) => {
          const cls = idx === qz.i ? "cur" : x.res ? (exam ? "done" : x.res.r === 2 ? "ok" : x.res.r === 1 ? "part" : "bad") : "";
          return `<i class="quiz-seg ${cls}"></i>`;
        }).join("")}</div>`
      : `<div class="meter accent thin"><i style="width:${pct}%"></i></div>`;
    const hintStat = qz.hints ? ` · подсказок: ${qz.hints}` : "";
    const qNum = exam ? String(it.n) : (q.kim ? String(q.kim) : (t && /^\d+$/.test(t.code || "") ? t.code : String(qz.i + 1)));
    return `<div class="quiz-top">
        <div class="row between">
          <div class="eyebrow">${esc(qz.title)}</div>
          <div class="row" style="gap:6px">
            <button type="button" class="btn ghost sm" data-a="quiz-guide">${icon("book")}Справочник</button>
            <button type="button" class="btn ghost sm" data-a="quiz-exit">${exam ? "Прервать" : "Завершить"}</button>
          </div>
        </div>
        <div class="row between small"><span class="ink2">${exam ? "Задание " + it.n + " · " + (qz.i + 1) + " из " + qz.items.length : "Вопрос " + (qz.i + 1) + " из " + qz.items.length}</span><span class="muted num">${(exam ? "идёт " + (mins < 1 ? "меньше минуты" : minutesText(mins)) : "верно " + qz.correct + " из " + qz.answered) + hintStat}</span></div>
        ${strip}
      </div>
      <article class="qcard">
        <div class="row between"><span class="eyebrow">${esc(typeLabel(q))}</span>${exam ? `<span class="small muted">Задание ${it.n}${q.t === "self" ? " · до " + q.els.length + " баллов" : ((qz.cfg || SUBJ[qz.sid].variant).two || []).includes(it.n) ? " · до 2 баллов" : ""}</span>` : t ? `<span class="small muted">${esc(codeLabel(t))} · ${esc(t.title)}</span>` : ""}</div>
        ${q.ai ? '<div class="hint">Вопрос составил ИИ. Если ответ вызывает сомнения, сверься с конспектом темы.</div>' : ""}
        ${passageOf(q) ? `<div class="passage"><div class="eyebrow">Текст</div><p>${esc(passageOf(q))}</p></div>` : ""}
        <div class="qtext">${esc(q.q)}</div>
        ${tableHTML(q)}
        ${renderQuestion(it, qz.checked)}
        ${it.hintOpen ? quizHintHTML(it) : ""}
        ${qz.checked ? feedbackBlock(it, qz) : ""}
        <div class="qfoot">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn ghost sm" data-a="quiz-hint" aria-expanded="${!!it.hintOpen}">${icon("hint")}${it.hintOpen ? "Скрыть подсказку" : "Подсказка"}</button>
            <button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(q.id)}" data-qnum="${esc(qNum)}" aria-label="Сообщить о баге в задании" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button>
            <span class="kbd">${keys}Enter — ${qz.checked ? "дальше" : exam ? "ответить" : "проверить"}</span>
          </div>
          ${qz.checked
            ? `<button type="button" class="btn" id="next-btn" data-a="quiz-next">${qz.i + 1 >= qz.items.length ? "Итоги" : "Дальше"}${icon("arrow")}</button>`
            : `<span class="row">${exam ? '<button type="button" class="btn ghost" data-a="quiz-skip">Пропустить</button>' : ""}<button type="button" class="btn" data-a="quiz-check"${canCheck(it) ? "" : " disabled"}>${exam ? "Ответить" : "Проверить"}</button></span>`}
        </div>
      </article>`;
  }
  function quizSummary(qz) {
    const answered = qz.items.filter((it) => it.res);
    const right = answered.filter((it) => it.res.r === 2).length;
    const wrong = answered.filter((it) => it.res.r !== 2);
    const pts = answered.reduce((s, it) => s + it.res.pts, 0);
    const max = answered.reduce((s, it) => s + it.res.max, 0);
    const pct = answered.length ? Math.round((100 * right) / answered.length) : 0;
    const head = pct >= 85 ? "Отличный результат" : pct >= 60 ? "Хороший результат" : "Есть над чем поработать";
    const timeNote = qz.hints ? `подсказок: ${qz.hints}` : "записано в показатели";
    return `<div class="head"><div class="eyebrow">Итоги · ${esc(qz.title)}</div><h1 class="h1">${head}</h1></div>
      <div class="tiles">
        ${tile("Верно", right + " из " + answered.length, "")}
        ${tile("Баллы как в ЕГЭ", pts + " из " + max, "за одну ошибку в сложном задании — 1 балл")}
        ${tile("Точность", pct + "%", "")}
        ${tile("Время", qz.spent < 30000 ? "меньше минуты" : minutesText(Math.round(qz.spent / 60000)), timeNote)}
      </div>
      ${wrong.length ? `<section class="section"><h2 class="h2">Разбор ошибок</h2><div class="review-list">${wrong.map((it) => { const tp = TOPICS[it.q.topic]; const qn = it.q.kim ? String(it.q.kim) : (tp && /^\d+$/.test(tp.code || "") ? tp.code : String(qz.items.indexOf(it) + 1)); return `<div class="review-item">
          <div class="row between"><span class="small muted">${esc(typeLabel(it.q))}</span><button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(it.q.id)}" data-qnum="${esc(qn)}" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button></div>
          <div class="entry-title">${esc(it.q.q)}</div>
          ${tableHTML(it.q)}
          <div class="small"><b>Правильно:</b> ${esc(correctText(it.q))}</div>
          <div class="small muted">Твой ответ: ${esc(userText(it))}</div>
          ${it.q.e ? `<div class="small ink2">${esc(it.q.e)}</div>` : ""}
        </div>`; }).join("")}</div></section>` : ""}
      <div class="row">
        ${wrong.length ? `<button type="button" class="btn" data-a="quiz-retry">Повторить ошибки · ${wrong.length}</button>` : ""}
        <button type="button" class="btn ghost" data-a="quiz-exit">${qz.back.v === "plan" ? "Вернуться к плану" : qz.back.v === "stats" ? "Вернуться к показателям" : qz.back.v === "topic" ? "Вернуться к теме" : "Вернуться к предмету"}</button>
        <button type="button" class="btn ghost" data-a="go" data-v="home">На главную</button>
      </div>`;
  }

  function variantSummary(qz) {
    const sc = variantScore(qz), lost = sc.max - sc.pts;
    const full = sc.cells.filter((c) => c.p === c.m).length;
    const bad = sc.cells.filter((c) => c.p < c.m && c.it.q.t !== "self"), shown = new Set();
    const selfs = sc.cells.filter((c) => c.it.q.t === "self");
    // Цель 90+ задаёт предмет (variant.goal): русский — 47 из 50, биология — 51 из 57 по шкале 2026 года.
    const vcfg = qz.cfg || SUBJ[qz.sid].variant;
    const g = vcfg.goal, need = g.need - sc.pts, half = Math.round(g.rest / 2), goalLabel = g.label || "90+";
    const guess = g.scale && g.scale[sc.pts + half] ? ` Для ориентира: с такой первой частью и второй на ${half} из ${g.rest} получится примерно ${g.scale[sc.pts + half]} тестовых баллов.` : "";
    const verdict = g.verdict ? g.verdict(sc.pts) : need <= g.rest
      ? `Для ${goalLabel} нужно набрать ${g.need} ${plural(g.need, "первичный балл", "первичных балла", "первичных баллов")} из ${g.total} (по шкале 2026 года это ${g.test} тестовых). ${g.ok(need)}${guess}${g.extra ? " " + g.extra(sc.pts) : ""}`
      : `Для ${goalLabel} нужно набрать ${g.need} ${plural(g.need, "первичный балл", "первичных балла", "первичных баллов")} из ${g.total}. ${g.fail(sc.pts + g.rest)}`;
    const cell = (c) => `<span class="vcell" data-s="${!c.it.res ? "skip" : c.p === c.m ? "ok" : c.p ? "part" : "bad"}" title="Задание ${c.n}: ${c.p} из ${c.m}">${c.n}</span>`;
    return `<div class="head"><div class="eyebrow">Итоги · ${esc(qz.title)}</div><h1 class="h1">${sc.pts} из ${sc.max} первичных баллов</h1><p class="lead">${verdict}</p></div>
      <div class="tiles">
        ${tile(g.partName || "Тестовая часть", sc.pts + " из " + sc.max, lost ? "потеряно " + lost + " " + plural(lost, "балл", "балла", "баллов") : "без потерь")}
        ${tile("Заданий без ошибок", full + " из " + sc.cells.length, "")}
        ${tile("Время", qz.spent < 30000 ? "меньше минуты" : minutesText(Math.round(qz.spent / 60000)), "на экзамене на всё — " + g.time)}
        ${tile("Цель для " + goalLabel, g.need + " из " + g.total, g.split)}
      </div>
      <section class="card stack"><h2 class="h2">Задания</h2><div class="vgrid">${sc.cells.map(cell).join("")}</div>
        <div class="qlegend"><span><i class="qdot" data-s="2"></i>верно</span><span><i class="qdot" data-s="1"></i>1 балл из 2</span><span><i class="qdot" data-s="0"></i>неверно</span><span><i class="qdot" data-s="-1"></i>пропущено</span></div></section>
      ${bad.length ? `<section class="section"><h2 class="h2">Разбор ошибок</h2><div class="review-list">${bad.map((c) => `<div class="review-item">
          <div class="row between"><span class="small muted">Задание ${c.n} · ${c.p} из ${c.m}</span><button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(c.it.q.id)}" data-qnum="${esc(c.n)}" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button></div>
          ${passageOf(c.it.q) && !shown.has(passageOf(c.it.q)) && shown.add(passageOf(c.it.q)) ? `<div class="passage"><div class="eyebrow">Текст</div><p>${esc(passageOf(c.it.q))}</p></div>` : ""}
          <div class="entry-title">${esc(c.it.q.q)}</div>
          ${tableHTML(c.it.q)}
          <div class="small"><b>Правильно:</b> ${esc(correctText(c.it.q))}</div>
          <div class="small muted">Твой ответ: ${c.it.res ? esc(userText(c.it)) : "пропущено"}</div>
          ${c.it.q.e ? `<div class="small ink2">${esc(c.it.q.e)}</div>` : ""}
        </div>`).join("")}</div></section>` : ""}
      ${selfs.length ? `<section class="section"><h2 class="h2">Часть 2: проверь себя по эталону</h2><p class="small muted">Сравни свой ответ с эталоном и отметь элементы, которые в нём есть: 1 балл за каждый. Итог вверху пересчитается сам.</p><div class="review-list">${selfs.map((c) => { const k = qz.items.indexOf(c.it); return `<div class="review-item">
          <div class="row between"><span class="small muted">Задание ${c.n} · ${c.p} из ${c.m}</span><button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(c.it.q.id)}" data-qnum="${esc(c.n)}" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button></div>
          <div class="entry-title">${esc(c.it.q.q)}</div>
          ${tableHTML(c.it.q)}
          <div class="small"><b>Твой ответ:</b> ${esc(userText(c.it))}</div>
          <div class="eyebrow">Эталон</div><div class="passage"><p>${esc(c.it.q.ref)}</p></div>
          <div class="checklist">${c.it.q.els.map((x, i) => `<label><input type="checkbox" class="check" data-c="self-sum" data-k="${k}" data-i="${i}"${c.it.resp.sel.includes(i) ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
        </div>`; }).join("")}</div></section>` : ""}
      <div class="row" style="flex-wrap:wrap">
        ${vcfg.goal.scale && (qz.saved || selfs.length)
          ? (qz.saved
              ? `<button type="button" class="btn soft" data-a="go" data-v="stats">${icon("chart")}Сохранено в «Показателях»</button>`
              : `<button type="button" class="btn" data-a="variant-save">Записать результат в «Показатели»</button>`)
          : ""}
        ${bad.length ? `<button type="button" class="btn ghost" data-a="quiz-retry">Прорешать ошибки · ${bad.length}</button>` : ""}
        <button type="button" class="btn ghost" data-a="${vcfg.full ? "quiz-fullvariant" : "quiz-variant"}" data-sid="${qz.sid}" data-k="0">Новый вариант</button>
        <button type="button" class="btn ghost" data-a="quiz-exit">Вернуться к предмету</button>
      </div>`;
  }

  // ---------- ИИ ----------
  function subjectAI(sid) { return (SUBJ[sid] && SUBJ[sid].ai) || { role: "репетитор", focus: "", suggest: [] }; }
  function tutorRules(sid) {
    const a = subjectAI(sid);
    return `Ты — внимательный ${a.role}. С тобой говорит человек, который готовится к ЕГЭ 2027 года по биологии, русскому языку и химии. ${a.focus} Отвечай по-русски, понятно и точно, по школьной программе и материалам ФИПИ. Пиши коротко: 3–8 предложений или короткий список, если не просят подробнее; если помогает, добавь пример задания ЕГЭ или способ запомнить. Если не уверен в факте, так и скажи. Не используй таблицы и заголовки. Обращайся на «ты» и не угадывай пол собеседника: избегай форм вроде «ты сделал» или «ты сделала».`;
  }
  function aiErrorText(e) {
    const code = e && e.code;
    if (["ai_disabled", "not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) {
      ai.state = "off";
      return store.backend ? "ИИ на сервере сейчас не настроен." : "ИИ недоступен на этой странице.";
    }
    if (code === "rate_limited") return "Слишком много запросов подряд. Попробуй через минуту.";
    if (code === "session_expired" || code === "unauthorized") return store.backend ? "Сессия истекла. Войди в аккаунт снова." : "Сессия claude.ai истекла. Войди в аккаунт снова.";
    if (code === "refused") return "ИИ не стал отвечать на этот запрос. Попробуй сформулировать иначе.";
    if (code === "invalid_json") return "ИИ прислал ответ в неверном формате. Попробуй ещё раз.";
    if (code === "timeout" || code === "upstream_timeout") return "ИИ отвечает слишком долго. Попробуй ещё раз.";
    return "Не получилось получить ответ. Попробуй ещё раз.";
  }
  function fmtAI(text) {
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const lines = esc(text).split(/\n/);
    let html = "", list = null;
    const flushList = () => { if (list) { html += `<${list.t}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.t}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flushList(); continue; }
      let m = line.match(/^[-•*]\s+(.*)$/);
      if (m) { if (!list || list.t !== "ul") { flushList(); list = { t: "ul", items: [] }; } list.items.push(inline(m[1])); continue; }
      m = line.match(/^\d+[.)]\s+(.*)$/);
      if (m) { if (!list || list.t !== "ol") { flushList(); list = { t: "ol", items: [] }; } list.items.push(inline(m[1])); continue; }
      flushList();
      html += `<p>${inline(line.replace(/^#+\s*/, ""))}</p>`;
    }
    flushList();
    return html;
  }
  function abortAI() {
    const st = ui.quiz && ui.quiz.ai;
    if (st && st.ctl && (st.status === "thinking" || st.status === "streaming")) st.ctl.abort();
  }
  async function explainCurrent() {
    const qz = ui.quiz, it = curItem();
    if (!ai.fn || !it || !it.res) return;
    abortAI();
    const st = (qz.ai = { status: "thinking", text: "", error: "", ctl: new AbortController(), forIdx: qz.i });
    scheduleRender();
    const t = TOPICS[it.q.topic];
    const prompt = [
      "Ты — " + subjectAI(it.q.sid).role + ", готовишь к ЕГЭ (Россия, 2027). Человек ответил на тренировочный вопрос. Объясни по-русски, точно и просто, в 4–8 предложениях, почему верный ответ именно такой" + (it.res.r === 2 ? "." : ", и в чём ошибка в ответе.") + " В конце дай короткую подсказку, как это запомнить. Без заголовков и таблиц. Не угадывай пол собеседника.",
      "",
      "Тема: " + (t ? codeLabel(t) + ", " + t.title : SUBJECT_NAME[it.q.sid] || ""),
      passageOf(it.q) ? "Текст задания: " + passageOf(it.q) : "",
      "Вопрос: " + it.q.q,
      optionsText(it.q),
      "Верный ответ: " + correctText(it.q),
      "Ответ ученика: " + userText(it),
      it.q.e ? "Пояснение из конспекта: " + it.q.e : ""
    ].filter(Boolean).join("\n");
    try {
      const res = await ai.fn(prompt, { signal: st.ctl.signal, onText: (u) => { st.text = u.text; if (st.status === "thinking") { st.status = "streaming"; scheduleRender(); } else paintAI(); } });
      st.text = res.text; st.status = "done";
    } catch (e) {
      if (e && e.code === "cancelled") { st.status = "done"; if (!st.text && qz.ai === st) qz.ai = null; }
      else { st.status = "error"; st.text = (e && e.text) || st.text; st.error = aiErrorText(e); }
    }
    if (ui.quiz === qz) scheduleRender();
  }
  function paintAI() {
    const el = document.getElementById("ai-explain");
    if (el && ui.quiz && ui.quiz.ai) el.innerHTML = fmtAI(ui.quiz.ai.text);
  }
  function validateGen(data, t) {
    const arr = Array.isArray(data) ? data : data && Array.isArray(data.questions) ? data.questions : [];
    const out = [];
    for (const x of arr) {
      if (!x || typeof x.q !== "string" || !Array.isArray(x.o)) continue;
      const o = x.o.map((s) => String(s).trim()).filter(Boolean);
      if (o.length !== x.o.length) continue;
      if (x.t === "single") {
        const a = Number(x.a);
        if (o.length < 3 || o.length > 6 || !Number.isInteger(a) || a < 0 || a >= o.length) continue;
        out.push({ t: "single", q: x.q.trim(), o, a, e: String(x.e || "") });
      } else if (x.t === "multi") {
        const a = Array.isArray(x.a) ? Array.from(new Set(x.a.map(Number))) : [];
        if (o.length < 4 || o.length > 8 || a.length < 2 || a.length >= o.length || a.some((v) => !Number.isInteger(v) || v < 0 || v >= o.length)) continue;
        out.push({ t: "multi", q: x.q.trim(), o, a: a.sort((m, n) => m - n), e: String(x.e || "") });
      }
    }
    // ИИ иногда повторяет вопросы темы или сам себя — такие отбрасываем.
    const norm = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
    const known = new Set(t.q.map((q) => norm(q.q) + "|" + norm((q.o || []).join(" "))));
    const fresh = out.filter((q) => { const k = norm(q.q) + "|" + norm(q.o.join(" ")); return !known.has(k) && known.add(k); });
    fresh.forEach((q) => { q.ai = true; q.id = "ai." + newId(); q.topic = t.id; q.sid = t.sid; });
    return fresh;
  }
  async function generateQuestions(topicId) {
    const t = TOPICS[topicId];
    if (!ai.fn || !t) return;
    const gen = (ui.gen = { topicId, status: "busy", error: "", ctl: new AbortController() });
    scheduleRender();
    const prompt = [
      `Составь 5 новых тренировочных заданий ${SUBJ[t.sid].po} в стиле ЕГЭ (Россия, материалы ФИПИ) по теме «${t.title}» (${codeLabel(t).toLowerCase()}). Используй только надёжные факты и правила школьного курса; если в задании есть слово с пропуском или ударением, проверь его по словарю.`,
      "",
      "Ключевые правила и факты темы:",
      t.theory.map((x) => (x.startsWith("## ") ? x.slice(3) + ":" : "- " + x.replace(/\*\*/g, ""))).join("\n"),
      "",
      "Не повторяй эти вопросы:",
      t.q.map((q) => "- " + q.q).join("\n"),
      "",
      "Сделай 3 задания типа \"single\" (4 варианта, один верный) и 2 задания типа \"multi\" (6 вариантов, ровно три верных, формулировка «Выберите три верных ответа...»).",
      "Ответь только JSON-массивом из 5 объектов, без текста вокруг. Формат:",
      '[{"t":"single","q":"Текст вопроса","o":["вариант","вариант","вариант","вариант"],"a":0,"e":"Пояснение в 1–2 предложениях"},{"t":"multi","q":"Выберите три верных утверждения о ...","o":["...","...","...","...","...","..."],"a":[0,2,5],"e":"Пояснение"}]',
      "Индексы в \"a\" считаются с нуля."
    ].join("\n");
    try {
      const data = await ai.fn.json(prompt, { signal: gen.ctl.signal, cache: false });
      const qs = validateGen(data, t);
      if (!qs.length) throw { code: "invalid_json" };
      if (ui.gen !== gen) return;
      ui.gen = null;
      startQuiz({ title: "Вопросы ИИ · " + t.title, sid: t.sid, qs, mode: "ai", topicId: t.id, back: { v: "topic", id: t.id } });
    } catch (e) {
      if (ui.gen !== gen) return;
      if (e && e.code === "cancelled") { ui.gen = null; scheduleRender(); return; }
      ui.gen = { topicId, status: "error", error: aiErrorText(e) };
      scheduleRender();
    }
  }
  async function sendChat(text) {
    const c = ui.chat;
    text = String(text || "").trim();
    if (!text || c.busy || !ai.fn) return;
    c.turns.push({ role: "user", content: text });
    c.draft = ""; c.busy = true; c.error = ""; c.ctl = new AbortController();
    const pending = { role: "assistant", content: "", streaming: true };
    const history = c.turns.slice(-12).map((x) => ({ role: x.role, content: x.content }));
    c.turns.push(pending);
    ui.focusNext = "chat-input";
    scheduleRender();
    try {
      const res = await ai.fn([{ role: "user", content: tutorRules(c.sid) }].concat(history), {
        cache: false, signal: c.ctl.signal,
        onText: (u) => { pending.content = u.text; const el = document.getElementById("chat-stream"); if (el) el.innerHTML = fmtAI(u.text); }
      });
      pending.content = res.text;
    } catch (e) {
      if (e && e.text) pending.content = e.text;
      if (!pending.content) c.turns.splice(c.turns.indexOf(pending), 1);
      if (!(e && e.code === "cancelled")) c.error = aiErrorText(e);
    }
    pending.streaming = false;
    c.busy = false; c.ctl = null;
    scheduleRender();
  }

  // ---------- план ----------
  function planMatches(it, filter) {
    if (filter === "todo") return !it.done;
    if (filter === "done") return !!it.done;
    if (filter === "overdue") return !it.done && validISO(it.due) && daysUntil(it.due) < 0;
    return true;
  }
  function viewPlan() {
    const all = planItems();
    const done = all.filter((i) => i.done).length;
    const todo = all.length - done;
    const overdue = all.filter((i) => planMatches(i, "overdue")).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    const f = ui.planFilter === "overdue" && !overdue ? "all" : ui.planFilter;
    const apply = all.find((i) => i.id === "ege-apply");
    const customAll = all.filter((i) => i.custom).sort(byDue);
    const custom = customAll.filter((i) => planMatches(i, f));
    const phaseBlocks = ((EGE.plan && EGE.plan.phases) || []).map((ph) => {
      const items = all.filter((i) => i.phase === ph.id);
      const shown = items.filter((i) => planMatches(i, f));
      if (f !== "all" && !shown.length) return "";
      const d = items.filter((i) => i.done).length;
      return `<section class="phase"><div class="phase-head"><h2 class="h2">${esc(ph.title)}</h2><span class="mono small muted">${esc(ph.period)}</span><span class="chip ${d === items.length && items.length ? "good" : ""}">${d} из ${items.length}</span></div>${shown.map((it) => todoItem(it)).join("")}</section>`;
    }).join("");
    const anyShown = !!phaseBlocks || custom.length > 0;
    return `<div class="head"><div class="eyebrow">План подготовки</div><h1 class="h1">ЕГЭ 2027 и поступление</h1><p class="lead">Что сделать и к какому сроку — от первых тестов и регистрации на экзамен до подачи документов. Завершённые тесты и шаги отмечаются сами.</p></div>
      ${staleNotice()}
      <section class="card stack">
        <div class="row between"><span class="tile-label">Сделано ${done} из ${all.length}</span><span class="small muted num">осталось ${todo} · ${pct}%</span></div>
        <div class="meter accent"><i style="width:${pct}%"></i></div>
        <div class="switch" role="group" aria-label="Фильтр задач">
          <button type="button" data-a="plan-filter" data-filter="all" aria-pressed="${f === "all"}">Все (${all.length})</button>
          <button type="button" data-a="plan-filter" data-filter="todo" aria-pressed="${f === "todo"}">Осталось (${todo})</button>
          ${overdue ? `<button type="button" data-a="plan-filter" data-filter="overdue" aria-pressed="${f === "overdue"}">Просрочено (${overdue})</button>` : ""}
          <button type="button" data-a="plan-filter" data-filter="done" aria-pressed="${f === "done"}">Выполнено (${done})</button>
        </div>
      </section>
      ${apply && !apply.done && f !== "done" ? `<div class="notice info"><b>Главный срок — ${dateLong(apply.due)}.</b><span>До этого дня нужно подать заявление на ЕГЭ. Позже — только по уважительной причине.</span></div>` : ""}
      ${anyShown ? phaseBlocks : `<div class="empty"><b>Задач в этом фильтре нет</b><button type="button" class="btn ghost sm" data-a="plan-filter" data-filter="all">Показать все</button></div>`}
      ${f === "done" && !custom.length ? "" : `<section class="phase"><div class="phase-head"><h2 class="h2">Мои дела</h2><span class="small muted">свои задачи и напоминания</span></div>
        ${custom.map((it) => todoItem(it)).join("")}
        ${f !== "done" ? `<form class="card form" data-f="todo">
          <div class="h3">Добавить дело</div>
          <div class="field"><label for="td-t">Что сделать</label><input class="input" id="td-t" data-d="td.t" value="${esc(draft("td.t", ""))}" maxlength="140" placeholder="Например: записаться на пробный ЕГЭ" required></div>
          <div class="fields">
            <div class="field"><label for="td-d">Срок</label><input class="input" type="date" id="td-d" data-d="td.d" value="${esc(draft("td.d", ""))}"></div>
            <div class="field"><label for="td-n">Заметка</label><input class="input" id="td-n" data-d="td.n" value="${esc(draft("td.n", ""))}" maxlength="300"></div>
          </div>
          <div><button class="btn" type="submit">Добавить</button></div>
        </form>` : ""}
      </section>`}
      <p class="hint">${esc((EGE.plan && EGE.plan.note) || "")} Сроки проверены ${EGE.plan ? dateLong(EGE.plan.checked) : ""}.</p>`;
  }
  function toggleTodo(id, custom, checked) {
    if (custom) patchDoc("plan", { custom: { [id]: { done: checked ? Date.now() : null } } });
    else patchDoc("plan", { done: { [id]: checked ? Date.now() : null } });
    if (checked) toast("Отмечено");
  }

  // ---------- показатели ----------
  function subjectAutoCard(s, prof, allSess, allMocks, pd) {
    const st = subjectStats(s.id), acc = subjectAccuracy(s.id), thRead = subjectReadCount(s.id);
    const mis = mistakeQs(s.id).length, due = dueQs(s.id).length;
    const subSess = allSess.filter((x) => x.sub === s.id);
    const subMin = subSess.reduce((n, x) => n + (x.m || 0), 0);
    const subQuizzes = subSess.filter((x) => x.k === "quiz");
    const subHintAvg = subQuizzes.length ? subQuizzes.reduce((n, x) => n + (x.h || 0), 0) / subQuizzes.length : null;
    const rep = questionAttemptBreakdown(s.id);
    const diag = pd.results[DIAG_PLAN_ID[s.id]] || null;
    const lastMock = allMocks.filter((m) => m.sub === s.id).slice(-1)[0] || null;
    const rows = [
      ["Освоено вопросов", `${st.mastered} из ${st.total}`],
      ["Повтор вопросов", `1×: ${rep.n1.length} · 2×: ${rep.n2.length} · 3+×: ${rep.n3.length + rep.n4.length}`],
      ["Точность", acc.acc == null ? "—" : `${acc.acc}% (${acc.n} отв.)`],
      ["Подсказок за тест", subHintAvg == null ? "—" : `${formatAvg(subHintAvg)} в среднем`],
      ["Конспекты", `${thRead} из ${st.topics}`],
      ["Время", minutesText(subMin)]
    ];
    if (diag && diag.q) rows.push(["Диагностика", `${diag.c} из ${diag.q} (${diag.pct}%)`]);
    if (lastMock) rows.push(["Последний пробник", `${lastMock.sc} б. (цель ${prof.targets[s.id]})`]);
    return `<section class="card stack">
      <div class="row between"><span class="row" style="gap:8px"><i class="dot" style="background:var(--c-${s.id})"></i><b>${esc(s.name)}</b></span><b class="num">${st.pct}%</b></div>
      <div class="meter"><i style="width:${st.pct}%"></i></div>
      <div class="stat-kv">${rows.map(([k, v]) => `<div class="stat-kv-row"><span class="muted">${k}</span><b class="num">${esc(v)}</b></div>`).join("")}</div>
      <div class="row">
        <button type="button" class="btn soft sm" data-a="quiz-mixed" data-sid="${s.id}">Тест</button>
        ${mis ? `<button type="button" class="btn ghost sm" data-a="quiz-mistakes" data-sid="${s.id}">Ошибки · ${mis}</button>`
          : due ? `<button type="button" class="btn ghost sm" data-a="quiz-review" data-sid="${s.id}">Повтор · ${due}</button>`
          : `<button type="button" class="btn ghost sm" data-a="go" data-v="subject" data-sid="${s.id}">Темы · ${st.topics}</button>`}
      </div>
    </section>`;
  }
  function repeatabilityCard() {
    const sid = ui.statsSubj && (ui.statsSubj === "all" || SUBJ[ui.statsSubj]) ? ui.statsSubj : "all";
    const rep = questionAttemptBreakdown(sid);
    const buckets = [
      { k: 1, label: "1 раз", list: rep.n1 },
      { k: 2, label: "2 раза", list: rep.n2 },
      { k: 3, label: "3 раза", list: rep.n3 },
      { k: 4, label: "4+ раз", list: rep.n4 }
    ];
    const activeK = [1, 2, 3, 4].includes(ui.statsRepBucket) ? ui.statsRepBucket : 1;
    const activeBucket = buckets.find((b) => b.k === activeK) || buckets[0];
    const visible = ui.statsRepAll ? activeBucket.list : activeBucket.list.slice(0, 25);
    const subjSwitch = `<div class="switch" role="group" aria-label="Предмет">
      <button type="button" data-a="stats-subj" data-sid="all" aria-pressed="${sid === "all"}">Все предметы</button>
      ${CONTENT.map((s) => `<button type="button" data-a="stats-subj" data-sid="${s.id}" aria-pressed="${sid === s.id}"><i class="dot" style="background:var(--c-${s.id})"></i><span>${esc(s.name)}</span></button>`).join("")}
    </div>`;
    const bucketTabs = `<div class="switch" role="group" aria-label="Сколько раз пройден вопрос">
      ${buckets.map((b) => `<button type="button" data-a="stats-rep" data-k="${b.k}" aria-pressed="${activeK === b.k}">${b.label} (${b.list.length})</button>`).join("")}
    </div>`;
    const listHtml = visible.length
      ? `<div class="rep-list">${visible.map((it) => {
          const rawQ = String(it.q.q || "").replace(/\s+/g, " ").trim();
          const txt = rawQ.length > 110 ? rawQ.slice(0, 108) + "…" : rawQ;
          const meta = `${esc(SUBJECT_NAME[it.q.sid] || "")}${it.t ? " · " + esc(topicRef(it.t)) : ""} · ответов ${it.st.n}, верных ${it.st.k}`;
          return `<button type="button" class="step-btn" data-a="quiz-one" data-id="${esc(it.q.id)}" data-back="stats" style="grid-template-columns:14px minmax(0,1fr) auto"><i class="dot" style="background:var(--c-${it.q.sid})"></i><span style="min-width:0"><span style="display:block">${esc(txt)}</span><span class="step-sub" style="display:block">${meta}</span></span><span class="arrow">${icon("arrow")}</span></button>`;
        }).join("")}</div>`
      : `<div class="empty"><span>Вопросов в группе «${activeBucket.label}» пока нет.</span></div>`;
    const moreBtn = !ui.statsRepAll && activeBucket.list.length > 25
      ? `<div><button type="button" class="btn ghost sm" data-a="stats-rep-all">Показать все (${activeBucket.list.length})</button></div>` : "";
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Повторяемость вопросов</h2><span class="small muted">не пройдено: ${rep.n0} из ${rep.total}</span></div>
      ${subjSwitch}
      ${bucketTabs}
      ${listHtml}
      ${moreBtn}
    </section>`;
  }
  function viewStats() {
    const tot = totals(), prof = profile(), pd = planDoc();
    const allSess = sessions(), allMocks = mocks();
    const recent = allSess.slice(0, 15);
    const diff = tot.d7 - tot.prev7;
    const weekNote = tot.prev7 || tot.d7 ? (diff >= 0 ? "+" : "−") + minutesText(Math.abs(diff)) + " к прошлой неделе" : "";
    const accVal = tot.acc7 != null ? tot.acc7 + "%" : (tot.accAll != null ? tot.accAll + "%" : "—");
    const accNote = tot.acc7 != null ? "ответы за 7 дней" : (tot.accAll != null ? "за всё время" : "появится после первого теста");
    const repAll = questionAttemptBreakdown("all");
    const rep2Plus = repAll.n2.length + repAll.n3.length + repAll.n4.length;
    const seenCount = repAll.n1.length + rep2Plus;
    const subjCards = CONTENT.map((s) => subjectAutoCard(s, prof, allSess, allMocks, pd)).join("");
    return `<div class="head"><div class="eyebrow">Показатели</div><h1 class="h1">Подготовка в цифрах</h1><p class="lead">Считается автоматически по тестам, конспектам, повторениям и полным вариантам. Занятия с учебником или бумажные пробники можно добавить внизу.</p></div>
      ${store.mode === "local" ? localNotice() : staleNotice()}
      <div class="tiles">
        ${tile("Сегодня", minutesText(tot.today), "")}
        ${tile("За 7 дней", minutesText(tot.d7), weekNote)}
        ${tile("Серия", days(tot.streak), "подряд с занятиями")}
        ${tile("Точность", accVal, accNote)}
      </div>
      <div class="tiles tiles-3">
        ${tile("Тестов завершено", String(tot.quizCount), tot.quizCount ? "всего записано" : "появится после теста")}
        ${tile("Подсказок за тест", formatAvg(tot.hintAvg), tot.quizCount ? `всего нажатий: ${tot.hintTotal}` : "среднее за завершённые тесты")}
        ${tile("Пройдено 2+ раза", String(rep2Plus), `из ${seenCount} начатых вопросов`)}
      </div>
      ${CONTENT.length ? `<section class="section"><div class="section-head"><h2 class="h2">По предметам (автоматически)</h2><span class="small muted">обновляется после каждого задания</span></div><div class="grid-3">${subjCards}</div></section>` : ""}
      ${repeatabilityCard()}
      <section class="card stack">
        <div class="row between"><h2 class="h2">Занятия за 4 недели</h2><span class="small muted">всего записано ${minutesText(tot.all)}</span></div>
        <div class="chart" data-chart="activity" style="height:170px"></div>
        <h3 class="h3">Последние записи</h3>
        ${recent.length ? `<div class="entries">${recent.map(entryRow).join("")}</div>` : '<div class="empty">Записей пока нет. Реши любой тест — время и результат появятся здесь автоматически.</div>'}
      </section>
      ${mocksCard()}
      <details class="card manual-box">
        <summary><span><b>Добавить вручную</b> <span class="small muted">занятие с учебником, репетитором или бумажный пробник</span></span></summary>
        <div class="manual-body"><div class="grid-2">${logForm()}${mockForm()}</div></div>
      </details>`;
  }
  function logForm() {
    return `<form class="card form" data-f="log">
      <h2 class="h2">Записать занятие</h2>
      <div class="fields">
        <div class="field"><label for="lg-d">Дата</label><input class="input" type="date" id="lg-d" data-d="log.d" value="${esc(draft("log.d", todayISO()))}" max="${todayISO()}" required></div>
        <div class="field"><label for="lg-s">Предмет</label>${subjSelect("lg-s", "log.sub", draft("log.sub", "bio"), true)}</div>
        <div class="field"><label for="lg-m">Минут</label><input class="input num" type="number" inputmode="numeric" id="lg-m" data-d="log.m" value="${esc(draft("log.m", ""))}" min="1" max="720" placeholder="45" required></div>
      </div>
      <div class="field"><label for="lg-n">Что было на занятии</label><input class="input" id="lg-n" data-d="log.n" value="${esc(draft("log.n", ""))}" maxlength="200" placeholder="Например: учебник, параграф про митоз"></div>
      <div><button class="btn" type="submit">Сохранить</button></div>
    </form>`;
  }
  function mockForm() {
    return `<form class="card form" data-f="mock">
      <h2 class="h2">Добавить пробник</h2>
      <div class="fields">
        <div class="field"><label for="mk-d">Дата</label><input class="input" type="date" id="mk-d" data-d="mk.d" value="${esc(draft("mk.d", todayISO()))}" max="${todayISO()}" required></div>
        <div class="field"><label for="mk-s">Предмет</label>${subjSelect("mk-s", "mk.sub", draft("mk.sub", "bio"), false)}</div>
        <div class="field"><label for="mk-sc">Тестовый балл</label><input class="input num" type="number" inputmode="numeric" id="mk-sc" data-d="mk.sc" value="${esc(draft("mk.sc", ""))}" min="0" max="100" placeholder="0–100" required></div>
        <div class="field"><label for="mk-p">Первичный балл</label><input class="input num" type="number" inputmode="numeric" id="mk-p" data-d="mk.p" value="${esc(draft("mk.p", ""))}" min="0" max="100" placeholder="необязательно"></div>
      </div>
      <div class="field"><label for="mk-n">Источник</label><input class="input" id="mk-n" data-d="mk.n" value="${esc(draft("mk.n", ""))}" maxlength="120" placeholder="Например: демоверсия ФИПИ"></div>
      <div><button class="btn" type="submit">Добавить</button></div>
    </form>`;
  }
  function delControl(key, action, attrs) {
    if (ui.confirmDel === key) return `<span class="row" style="gap:12px"><button type="button" class="link-btn" style="color:var(--bad)" data-a="${action}" ${attrs}>Удалить</button><button type="button" class="link-btn" data-a="cancel-del">Отмена</button></span>`;
    return `<button type="button" class="x-btn" data-a="ask-del" data-k="${esc(key)}" aria-label="Удалить запись">${icon("trash")}</button>`;
  }
  function quizLabel(e) {
    const t = TOPICS[e.t];
    if (t) return topicRef(t);
    return { mixed: "смешанный", review: "повторение", mistakes: "работа над ошибками", ai: "вопросы ИИ", variant: "пробный вариант", part2: "часть 2" }[e.t] || "тренировка";
  }
  function entryRow(e) {
    const title = e.k === "quiz" ? "Тест: " + quizLabel(e) : e.n || "Занятие";
    const extra = e.k === "quiz" ? ["верно " + (e.c || 0) + " из " + (e.q || 0)].concat(e.h ? ["подсказок: " + e.h] : []) : [];
    const sub = [SUBJECT_NAME[e.sub] || "Другое", e.m ? minutesText(e.m) : "меньше минуты"].concat(extra).join(" · ");
    return `<div class="entry"><span class="entry-date">${dateShort(e.d)}</span><div class="entry-main"><span class="entry-title">${esc(title)}</span><span class="entry-sub">${esc(sub)}</span></div>${delControl("log:" + e.doc + ":" + e.id, "del-log", `data-doc="${esc(e.doc)}" data-id="${esc(e.id)}"`)}</div>`;
  }
  function mocksCard() {
    const list = mocks(), prof = profile();
    const subs = SUBJECT_META.filter((s) => list.some((m) => m.sub === s.id));
    if (!list.length) {
      return `<section class="card stack"><div class="row between"><h2 class="h2">Пробные экзамены</h2><span class="small muted">тестовый балл из 100</span></div>
        <div class="empty"><b>Пробников пока нет</b><span>Реши полный вариант на странице предмета — тестовый балл и график появятся здесь автоматически. Бумажный пробник можно добавить вручную ниже.</span></div></section>`;
    }
    const rows = list.slice().reverse().map((m) => {
      const target = prof.targets[m.sub];
      const chip = m.sc >= target ? `<span class="chip good">цель достигнута</span>` : `<span class="chip">до цели ${target - m.sc}</span>`;
      return `<tr><td class="mono small" style="white-space:nowrap">${dateShort(m.d)}</td><td><span class="row" style="gap:6px;flex-wrap:nowrap"><i class="dot" style="background:var(--c-${m.sub})"></i>${esc(SUBJECT_NAME[m.sub] || "")}</span></td><td class="num"><b>${m.sc}</b> ${chip}</td><td class="num">${m.p != null && m.p !== "" ? esc(m.p) : "—"}</td><td class="small">${esc(m.n || "")}</td><td>${delControl("mock:" + m.id, "del-mock", `data-id="${esc(m.id)}"`)}</td></tr>`;
    }).join("");
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Пробные экзамены</h2><span class="small muted">тестовый балл из 100</span></div>
      ${subs.length > 1 ? `<div class="legend">${subs.map((s) => `<span><i style="background:var(--c-${s.id})"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}
      <div class="chart" data-chart="mocks" style="height:230px"></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Дата</th><th>Предмет</th><th>Балл</th><th>Первичный</th><th>Источник</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }

  // ---------- графики ----------
  function niceStep(x) { const steps = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 360]; return steps.find((s) => s >= x) || 480; }
  function barPath(x, yTop, w, h, r) {
    r = Math.min(r, w / 2, h);
    const yb = yTop + h;
    return `M${x},${yb}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yb}Z`;
  }
  function drawActivity(el) {
    const W = Math.max(260, el.clientWidth), H = 170, padL = 36, padR = 8, padT = 10, padB = 24;
    const N = 28, today = todayISO(), byDay = minutesByDay();
    const daysArr = range(N).map((i) => addDays(today, i - N + 1));
    const vals = daysArr.map((d) => byDay[d] || 0);
    const step = niceStep(Math.max(30, ...vals) / 3);
    const top = Math.max(step * 3, Math.ceil(Math.max(...vals) / step) * step);
    const ih = H - padT - padB, iw = W - padL - padR, band = iw / N, bw = Math.min(24, Math.max(3, band * 0.62));
    const y = (v) => padT + ih - (v / top) * ih;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Минуты занятий за последние 28 дней">`;
    for (let v = 0; v <= top; v += step) {
      s += `<line class="${v === 0 ? "axis-l" : "grid-l"}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    daysArr.forEach((d, i) => {
      const v = vals[i], x = padL + band * i + (band - bw) / 2;
      if (v > 0) s += `<path d="${barPath(x, y(v), bw, Math.max(2, (v / top) * ih), 4)}" fill="var(--accent)"/>`;
      if (i % 7 === 6) s += `<text x="${padL + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${esc(dateShort(d))}</text>`;
      s += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${ih}" fill="transparent" data-tip="${esc(dateDay(d) + ": " + (v ? minutesText(v) : "занятий нет"))}"/>`;
    });
    if (!vals.some(Boolean)) s += `<text x="${padL + iw / 2}" y="${padT + ih / 2 + 4}" text-anchor="middle">Пока нет записей — пройди тест или добавь занятие</text>`;
    el.innerHTML = s + "</svg>";
  }
  function drawMocks(el) {
    const list = mocks(), prof = profile();
    if (!list.length) { el.innerHTML = ""; return; }
    const W = Math.max(260, el.clientWidth), H = 230, padL = 32, padR = 64, padT = 14, padB = 26;
    const ih = H - padT - padB, iw = W - padL - padR;
    const t0 = parseISO(list[0].d).getTime();
    const t1 = Math.max(parseISO(list[list.length - 1].d).getTime(), t0 + 30 * 86400000);
    const x = (iso) => padL + ((parseISO(iso).getTime() - t0) / (t1 - t0)) * iw;
    const y = (v) => padT + ih - (v / 100) * ih;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Баллы пробных экзаменов">`;
    for (let v = 0; v <= 100; v += 20) s += `<line class="${v === 0 ? "axis-l" : "grid-l"}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    s += `<text x="${padL}" y="${H - 6}" text-anchor="start">${esc(dateShort(list[0].d))}</text><text x="${W - padR}" y="${H - 6}" text-anchor="end">${esc(dateShort(isoDate(new Date(t1))))}</text>`;
    const seenTargets = new Set(), ends = [];
    for (const sm of SUBJECT_META) {
      const pts = list.filter((m) => m.sub === sm.id);
      if (!pts.length) continue;
      const color = `var(--c-${sm.id})`, target = prof.targets[sm.id];
      s += `<line x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}" stroke="${color}" stroke-width="1.5" stroke-opacity=".45"/>`;
      if (!seenTargets.has(target)) { seenTargets.add(target); s += `<text x="${W - padR + 6}" y="${y(target) + 4}">цель ${target}</text>`; }
      if (pts.length > 1) s += `<path d="${pts.map((m, i) => (i ? "L" : "M") + x(m.d) + "," + y(m.sc)).join("")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((m) => {
        s += `<circle cx="${x(m.d)}" cy="${y(m.sc)}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
        s += `<circle cx="${x(m.d)}" cy="${y(m.sc)}" r="13" fill="transparent" data-tip="${esc(sm.name + " · " + dateDay(m.d) + ": " + m.sc + " " + plural(m.sc, "балл", "балла", "баллов"))}"/>`;
      });
      const last = pts[pts.length - 1];
      ends.push({ x: x(last.d) + 9, y: y(last.sc) - 8, v: last.sc });
    }
    // Подписи концов линий не наезжают друг на друга: лишние значения остаются в подсказке и таблице.
    let prevY = -Infinity;
    ends.sort((a, b) => a.y - b.y).forEach((e) => {
      if (e.y - prevY < 14) return;
      prevY = e.y;
      s += `<text class="lbl" x="${e.x}" y="${e.y}">${e.v}</text>`;
    });
    el.innerHTML = s + "</svg>";
  }
  function drawCharts() {
    document.querySelectorAll("[data-chart]").forEach((el) => {
      if (el.dataset.chart === "activity") drawActivity(el);
      if (el.dataset.chart === "mocks") drawMocks(el);
    });
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawCharts, 150); });

  // ---------- справочник без ИИ и репетитор ----------
  function tableBlockHTML(tb) {
    return `<div class="small muted">${rich(tb.title)}</div><div class="qtbl-wrap"><table class="qtbl">${tb.rows.map((r, i) => `<tr>${r.map((c, j) => (i === 0 || (tb.head1 && j === 0) ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></div>${tb.note ? `<div class="small muted">${rich(tb.note)}</div>` : ""}`;
  }
  function guideQuickChips(sid) {
    const bySub = {
      bio: ["митоз", "фотосинтез", "мейоз", "генетический код", "кровообращение"],
      rus: ["ударения", "н и нн", "запятые", "причастный оборот", "клише", "аргументы"],
      chem: ["овр", "гидролиз", "электролиз", "изомерия", "степень окисления"],
      all: ["митоз", "фотосинтез", "ударения", "запятые", "гидролиз", "овр", "клише"]
    };
    return (bySub[sid] || bySub.all);
  }
  function guideMatchEssay(terms) {
    const E = EGE.essay;
    if (!E) return "";
    const clicheHits = (E.cliches || []).filter((c) => terms.every((w) => norm(c.part + " " + c.items.join(" ")).includes(w)));
    const argHits = (E.args || []).filter((g) => terms.every((w) => norm(g.theme + " " + g.items.map((x) => x.src + " " + x.text).join(" ")).includes(w)));
    if (!clicheHits.length && !argHits.length && !terms.every((w) => norm("сочинение задание 27 план клише аргументы").includes(w))) return "";
    return `<article class="card guide-card">
      <div class="guide-meta"><span class="eyebrow">Русский язык · Задание 27</span><button type="button" class="btn soft sm" data-a="go" data-v="essay">Тренажёр сочинения</button></div>
      <h2 class="h2">Сочинение: клише и аргументы</h2>
      ${clicheHits.slice(0, 2).map((c) => `<div class="stack" style="gap:4px"><div class="label">${esc(c.part)}</div><ul class="theory">${c.items.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      ${argHits.slice(0, 2).map((g) => `<div class="stack" style="gap:4px"><div class="label">${esc(g.theme)}</div><ul class="theory">${g.items.slice(0, 2).map((x) => `<li><b>${esc(x.src)}:</b> ${esc(x.text)}</li>`).join("")}</ul></div>`).join("")}
    </article>`;
  }
  function guideOverview(sid) {
    const list = sid === "all" ? CONTENT : CONTENT.filter((s) => s.id === sid);
    const cards = list.map((s) => {
      const topics = (s.content && s.content.topicList) || [];
      const withTables = topics.filter((t) => t.tables && t.tables.length);
      const sample = (withTables.length ? withTables : topics).slice(0, 8);
      return `<section class="card stack">
        <div class="row between"><span class="row" style="gap:8px"><i class="dot" style="background:var(--c-${s.id})"></i><h2 class="h2">${esc(s.name)}</h2></span><button type="button" class="link-btn" data-a="go" data-v="subject" data-sid="${s.id}">Все темы · ${topics.length}</button></div>
        <div class="suggest">${sample.map((t) => `<button type="button" data-a="open-topic" data-id="${t.id}">${esc(t.title)}</button>`).join("")}</div>
      </section>`;
    }).join("");
    const essayCard = (sid === "all" || sid === "rus") && EGE.essay
      ? `<section class="card stack">
          <div class="row between"><h2 class="h2">Сочинение ЕГЭ · памятка</h2><button type="button" class="btn soft sm" data-a="go" data-v="essay">Открыть тренажёр</button></div>
          <p class="small ink2">План на 200–250 слов, готовые клише по критериям К1–К3, образец сочинения и банк литературных аргументов.</p>
        </section>`
      : "";
    return cards + essayCard;
  }
  function viewGuide() {
    const sid = ui.guideSid && (ui.guideSid === "all" || SUBJ[ui.guideSid]) ? ui.guideSid : "all";
    const qNorm = norm(ui.guideQ);
    const terms = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];
    const switcher = `<div class="switch" role="group" aria-label="Предмет">
      <button type="button" data-a="guide-sid" data-sid="all" aria-pressed="${sid === "all"}">Все предметы</button>
      ${CONTENT.map((s) => `<button type="button" data-a="guide-sid" data-sid="${s.id}" aria-pressed="${sid === s.id}"><i class="dot" style="background:var(--c-${s.id})"></i><span>${esc(s.name)}</span></button>`).join("")}
    </div>`;
    const searchBox = `<div class="search-wrap">
      <label class="sr" for="guide-q">Поиск по конспектам и таблицам</label>
      <input class="input" type="search" id="guide-q" value="${esc(ui.guideQ)}" placeholder="Поиск по правилам, терминам, формулам и исключениям…">
      ${ui.guideQ ? `<button type="button" class="search-clear" data-a="guide-clear" aria-label="Очистить поиск">${icon("x")}</button>` : ""}
    </div>`;
    const chips = `<div class="suggest">${guideQuickChips(sid).map((w) => `<button type="button" data-a="guide-chip" data-q="${esc(w)}">${esc(w)}</button>`).join("")}</div>`;
    let body = "";
    if (!terms.length) {
      body = guideOverview(sid);
    } else {
      const pool = (sid === "all" ? CONTENT : CONTENT.filter((s) => s.id === sid));
      const hits = [];
      for (const s of pool) {
        const secs = (s.content && s.content.sections) || [];
        for (const sec of secs) {
          for (const t of sec.topics) {
            const titleText = norm(t.title + " " + t.code + " " + sec.title);
            const matchTables = (t.tables || []).filter((tb) => terms.every((w) => norm(tb.title + " " + tb.rows.map((r) => r.join(" ")).join(" ") + " " + (tb.note || "")).includes(w)));
            const matchBullets = (t.theory || []).filter((line) => !line.startsWith("## ") && terms.every((w) => norm(line).includes(w)));
            const fullText = titleText + " " + norm((t.theory || []).join(" ")) + " " + norm((t.tables || []).map((tb) => tb.title + " " + tb.rows.map((r) => r.join(" ")).join(" ")).join(" "));
            if (!terms.every((w) => fullText.includes(w))) continue;
            const score = (terms.every((w) => titleText.includes(w)) ? 4 : 0) + (matchTables.length ? 2 : 0) + (matchBullets.length ? 1 : 0);
            hits.push({ s, sec, t, matchTables, matchBullets, score });
          }
        }
      }
      hits.sort((a, b) => b.score - a.score);
      const essayHit = (sid === "all" || sid === "rus") ? guideMatchEssay(terms) : "";
      const cards = hits.slice(0, 12).map(({ s, sec, t, matchTables, matchBullets }) => {
        const bullets = (matchBullets.length ? matchBullets : (t.theory || []).filter((x) => !x.startsWith("## "))).slice(0, 4);
        const tb = matchTables[0] || (t.tables && t.tables[0]) || null;
        return `<article class="card guide-card">
          <div class="guide-meta">
            <span class="row small muted" style="gap:6px"><i class="dot" style="background:var(--c-${s.id})"></i>${esc(s.name)} · ${esc(sec.title)}</span>
            <span class="row" style="gap:6px">
              <button type="button" class="btn soft sm" data-a="open-topic" data-id="${t.id}">Конспект</button>
              ${t.qids.length ? `<button type="button" class="btn ghost sm" data-a="quiz-topic" data-id="${t.id}">Тест</button>` : ""}
            </span>
          </div>
          <h2 class="h2">${esc(t.title)}</h2>
          ${bullets.length ? `<ul class="theory">${bullets.map((x) => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}
          ${tb ? tableBlockHTML(tb) : ""}
        </article>`;
      }).join("");
      body = (essayHit + cards) || `<div class="empty"><b>По запросу «${esc(ui.guideQ)}» ничего не найдено</b><span>Попробуй более короткое слово: например, «митоз», «гидролиз» или «запятые».</span><button type="button" class="btn ghost sm" data-a="guide-clear">Показать все разделы</button></div>`;
    }
    return `<div class="head"><div class="eyebrow">Справочник</div><h1 class="h1">Быстрый поиск без нейросети</h1><p class="lead">Правила, термины, формулы, исключения и клише сочинения по всему банку ЕГЭ — работает мгновенно и без интернета к ИИ.</p></div>
      ${switcher}
      ${searchBox}
      ${chips}
      ${body}`;
  }

  function viewTutor() {
    if (ai.state !== "ready") return viewGuide();
    const c = ui.chat;
    const lead = store.backend
      ? "ИИ-репетитор объяснит правило или термин, разберёт задачу, проверит сочинение, подскажет, как запомнить. Важное сверяй с конспектом и материалами ФИПИ."
      : "Отвечает Claude: объяснит правило или термин, разберёт задачу, проверит сочинение, подскажет, как запомнить. Важное сверяй с конспектом и материалами ФИПИ.";
    const head = `<div class="head"><div class="eyebrow">Репетитор</div><h1 class="h1">Спроси о любой теме</h1><p class="lead">${lead}</p></div>`;
    const sugg = subjectAI(c.sid).suggest || [];
    const switcher = CONTENT.length > 1
      ? `<div class="switch" role="group" aria-label="Предмет">${CONTENT.map((s) => `<button type="button" data-a="chat-subject" data-sid="${s.id}" aria-pressed="${s.id === c.sid}">${esc(s.name)}</button>`).join("")}</div>`
      : "";
    const bubbles = c.turns.map((t) => `<div class="bubble ${t.role === "user" ? "me" : "ai"}"${t.streaming ? ' id="chat-stream"' : ""}>${t.role === "user" ? esc(t.content) : t.content ? fmtAI(t.content) : '<span class="muted">Думаю…</span>'}</div>`).join("");
    return head + switcher + `${c.turns.length ? `<section class="chat" aria-live="polite">${bubbles}</section>` : `<div class="suggest">${sugg.map((s) => `<button type="button" data-a="chat-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
      ${c.error ? `<div class="notice">${esc(c.error)}</div>` : ""}
      <form class="composer" data-f="chat">
        <label class="sr" for="chat-input">Вопрос репетитору</label>
        <textarea class="textarea" id="chat-input" rows="2" maxlength="6000" placeholder="Напиши вопрос ${esc(SUBJ[c.sid] ? SUBJ[c.sid].po : "")} или вставь сочинение…">${esc(c.draft)}</textarea>
        ${c.busy ? `<button class="btn ghost" type="button" data-a="chat-stop">${icon("stop")}Стоп</button>` : `<button class="btn" type="submit">Отправить</button>`}
      </form>
      ${c.turns.length && !c.busy ? '<div><button type="button" class="link-btn" data-a="chat-clear">Начать новый разговор</button></div>' : ""}`;
  }

  // ---------- сочинение ----------
  const ESSAY_LS = "vektor-ege:essay";
  const LEGACY_ESSAY_LS = "put-v-medicinu:essay";
  const ESSAY_K = [["К1", 1, "Позиция автора"], ["К2", 3, "Комментарий"], ["К3", 2, "Своё отношение и аргумент"], ["К4", 1, "Фактическая точность"], ["К5", 2, "Логичность"], ["К6", 1, "Этика"], ["К7", 3, "Орфография"], ["К8", 3, "Пунктуация"], ["К9", 3, "Грамматика"], ["К10", 3, "Речевые нормы"]];
  let essayTimer = null;
  function essayState() {
    if (!ui.essay) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(ESSAY_LS) || localStorage.getItem(LEGACY_ESSAY_LS) || "null"); } catch (e) { /* хранилище браузера недоступно */ }
      ui.essay = Object.assign({ tid: EGE.essay.texts[0].id, own: { text: "", problem: "" }, body: "", editId: null }, saved || {},
        { tab: "write", checks: {}, ai: null, showPos: false, confirmClear: false });
    }
    return ui.essay;
  }
  function essayDraftLater() {
    clearTimeout(essayTimer);
    essayTimer = setTimeout(() => {
      const e = ui.essay;
      try {
        localStorage.setItem(ESSAY_LS, JSON.stringify({ tid: e.tid, own: e.own, body: e.body, editId: e.editId }));
        localStorage.removeItem(LEGACY_ESSAY_LS);
      } catch (err) { /* хранилище браузера недоступно */ }
    }, 600);
  }
  // Слова считаются как в ЕГЭ: служебные тоже, слово через дефис — одно.
  function wordCount(s) { return (String(s || "").match(/[A-Za-zА-Яа-яЁё0-9]+(?:-[A-Za-zА-Яа-яЁё0-9]+)*/g) || []).length; }
  function essayText(e) {
    if (e.tid === "own") return { id: "own", own: true, title: "Свой текст", problem: e.own.problem || "", body: e.own.text || "" };
    return EGE.essay.texts.find((t) => t.id === e.tid) || EGE.essay.texts[0];
  }
  function essays() {
    const m = (store.docs.essays && store.docs.essays.e) || {};
    return Object.keys(m).filter((k) => m[k] && m[k].body).map((k) => Object.assign({ id: k }, m[k])).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  function paras(text) { return String(text || "").split(/\n+/).filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join(""); }
  function countChip(w) {
    const cls = w < 150 ? "bad" : w < 200 ? "warn" : "good";
    return `<span id="essay-count" class="chip ${cls} num">${w} ${plural(w, "слово", "слова", "слов")}</span>`;
  }
  function paintEssayCount() {
    const el = document.getElementById("essay-count");
    if (el) el.outerHTML = countChip(wordCount(ui.essay.body));
  }
  function saveEssay(extra) {
    const e = essayState(), T = essayText(e);
    if (!e.body.trim()) { toast("Сочинение пока пустое"); return null; }
    const id = e.editId || newId();
    const scored = e.ai && e.ai.status === "done" && e.ai.forHash === hash(e.body) ? e.ai.res : null;
    const rec = { d: todayISO(), tid: e.tid, title: T.title, problem: T.problem || "", body: e.body.slice(0, 12000), w: wordCount(e.body), at: Date.now(),
      sc: scored ? scored.total : null, k: scored ? Object.fromEntries(scored.k.map((c) => [c.id, c.p])) : null, adv: scored ? scored.advice : null,
      src: e.tid === "own" ? String(e.own.text || "").slice(0, 12000) : null };
    patchDoc("essays", { e: { [id]: Object.assign(rec, extra || {}) } });
    markPlanPrep("rus", "Написано сочинение");
    e.editId = id; essayDraftLater();
    return id;
  }
  function validateEssayCheck(data, words) {
    const arr = data && Array.isArray(data.k) ? data.k : null;
    if (!arr) return null;
    const k = ESSAY_K.map(([id, max, name]) => {
      const x = arr.find((y) => y && String(y.id).replace(/K/g, "К").replace(/\s/g, "") === id) || {};
      const p = Math.round(Number(x.p));
      return { id, name, max, p: Number.isFinite(p) ? Math.max(0, Math.min(max, p)) : 0, note: String(x.note || "").slice(0, 400) };
    });
    if (k[0].p === 0) { k[1].p = 0; k[2].p = 0; } // без позиции автора комментарий и своё отношение не засчитываются
    if (words < 150) k.forEach((c) => { c.p = 0; });
    const errors = (Array.isArray(data.errors) ? data.errors : []).filter((x) => x && x.quote).slice(0, 30)
      .map((x) => ({ type: String(x.type || ""), quote: String(x.quote).slice(0, 200), fix: String(x.fix || "").slice(0, 300) }));
    return { k, errors, advice: String(data.advice || "").slice(0, 1200), total: k.reduce((s, c) => s + c.p, 0) };
  }
  async function checkEssay() {
    const e = essayState();
    if (!ai.fn) return;
    const T = essayText(e), w = wordCount(e.body);
    if (w < 30) { toast("Сначала напиши сочинение"); return; }
    if (T.own && (!T.body.trim() || !T.problem.trim())) { toast("Вставь исходный текст и проблему из задания"); return; }
    if (e.ai && e.ai.ctl) e.ai.ctl.abort();
    const st = (e.ai = { status: "busy", ctl: new AbortController(), forHash: hash(e.body), res: null, error: "" });
    scheduleRender();
    const prompt = [
      "Ты — эксперт ЕГЭ по русскому языку. Проверь сочинение (задание 27) по критериям ФИПИ 2026 года строго, как на экзамене.",
      "",
      "Задание: Напишите сочинение-рассуждение по проблеме, поставленной в исходном тексте: «" + T.problem + "». Сформулируйте позицию автора (рассказчика) по указанной проблеме. Прокомментируйте, как в тексте раскрывается эта позиция: включите в комментарий два примера-иллюстрации из прочитанного текста, важные для понимания позиции автора, поясните их, укажите и поясните смысловую связь между ними. Сформулируйте и обоснуйте своё отношение к позиции автора, включите в обоснование пример-аргумент из читательского, историко-культурного или жизненного опыта (примеры из комиксов, аниме, манги, фанфиков, графических романов, компьютерных игр не учитываются). Объём — не менее 150 слов.",
      "",
      "Критерии и максимальные баллы:",
      "К1 (1) — позиция автора по указанной проблеме сформулирована верно.",
      "К2 (3) — комментарий: 3 — два примера-иллюстрации с пояснениями, смысловая связь указана и пояснена; 2 — два примера с пояснениями, но связь не указана или не пояснена; 1 — один пример с пояснением; 0 — примеров нет, они без пояснений, не относятся к позиции автора или текст пересказан.",
      "К3 (2) — своё отношение к позиции автора: 2 — сформулировано и обосновано подходящим примером-аргументом; 1 — сформулировано, но пример-аргумент отсутствует или не подходит; 0 — отношения нет.",
      "Если по К1 стоит 0, то по К2 и К3 тоже 0.",
      "К4 (1) — нет фактических ошибок (имена, названия, даты, события, содержание произведений).",
      "К5 (2) — логичность: 2 — нет логических ошибок и нарушений абзацного членения; 1 — одна-две логические ошибки; 0 — три и больше.",
      "К6 (1) — соблюдены этические нормы.",
      "К7 орфография, К8 пунктуация, К9 грамматика, К10 речевые нормы — по 3 балла: 3 — ошибок нет; 2 — одна-две; 1 — три-четыре; 0 — пять и больше.",
      "",
      "Исходный текст:",
      T.body,
      "",
      "Сочинение (слов: " + w + "):",
      e.body,
      "",
      'Ответь только JSON без текста вокруг: {"k":[{"id":"К1","p":0,"note":"кратко, за что поставлен балл"}, … все десять критериев К1–К10 …],"errors":[{"type":"орфография|пунктуация|грамматика|речь|логика|факт","quote":"фрагмент из сочинения с ошибкой","fix":"как исправить"}],"advice":"два-три главных совета, что улучшить"}',
      "Пиши по-русски, обращайся на «ты», не угадывай пол автора сочинения. Перечисли все найденные ошибки."
    ].join("\n");
    try {
      const data = await ai.fn.json(prompt, { signal: st.ctl.signal, cache: false, modelTier: "complex" });
      const res = validateEssayCheck(data, w);
      if (!res) throw { code: "invalid_json" };
      if (e.ai !== st) return;
      st.status = "done"; st.res = res; st.ctl = null;
      saveEssay();
      toast("Проверено и сохранено в «Мои сочинения»");
    } catch (err) {
      if (e.ai !== st) return;
      if (err && err.code === "cancelled") ui.essay.ai = null;
      else { st.status = "error"; st.error = aiErrorText(err); st.ctl = null; }
    }
    scheduleRender();
  }
  function essayAIBlock(e) {
    const st = e.ai;
    if (!st) return "";
    if (st.status === "busy") return `<section class="card stack"><div class="row between"><h2 class="h2">Проверка по критериям</h2><button type="button" class="link-btn" data-a="essay-stop">Остановить</button></div><div class="hint">ИИ читает текст и сочинение и выставляет баллы по К1–К10. Это занимает до минуты.</div></section>`;
    if (st.status === "error") return `<div class="notice">${esc(st.error)}</div>`;
    const r = st.res, stale = st.forHash !== hash(e.body);
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Проверка по критериям</h2><span class="chip ${r.total >= 19 ? "good" : r.total >= 14 ? "warn" : "bad"} num">${r.total} из 22</span></div>
      ${stale ? '<div class="hint">После проверки сочинение изменилось — нажми «Проверить» ещё раз, чтобы получить новую оценку.</div>' : ""}
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Критерий</th><th>Баллы</th><th>Комментарий</th></tr></thead><tbody>
        ${r.k.map((c) => `<tr><td><b>${c.id}</b> ${esc(c.name)}</td><td class="num">${c.p} из ${c.max}</td><td class="small ink2">${esc(c.note)}</td></tr>`).join("")}
      </tbody></table></div>
      ${r.errors.length ? `<div class="label">Ошибки</div><div class="review-list">${r.errors.map((x) => `<div class="review-item"><div class="small muted">${esc(x.type)}</div><div>«${esc(x.quote)}»</div>${x.fix ? `<div class="small"><b>Как исправить:</b> ${esc(x.fix)}</div>` : ""}</div>`).join("")}</div>` : ""}
      ${r.advice ? `<div class="ai-box"><span class="eyebrow">Что улучшить</span><div class="ai-text">${fmtAI(r.advice)}</div></div>` : ""}
      <p class="hint">Оценка ИИ примерная: на экзамене сочинение проверяют два эксперта по критериям ФИПИ. Ошибки, которые нашёл ИИ, перепроверяй по правилам.</p>
    </section>`;
  }
  function viewEssay() {
    const E = EGE.essay;
    if (!E) { ui.view = "subject"; return viewSubject(); }
    const e = essayState(), T = essayText(e), mine = essays();
    const tabs = [["write", "Писать"], ["plan", "План, клише, образец"], ["args", "Аргументы"], ["mine", "Мои сочинения" + (mine.length ? " · " + mine.length : "")]];
    const head = `<div><button type="button" class="link-btn" data-a="go" data-v="subject" data-sid="rus">← Русский язык</button></div>
      <div class="head"><div class="eyebrow">Задание 27 · до 22 баллов</div><h1 class="h1">Тренажёр сочинения</h1><p class="lead">Формат 2026 года: проблема дана в задании. Сформулируй позицию автора, прокомментируй её двумя примерами из текста со смысловой связью и обоснуй своё отношение примером-аргументом. Не меньше 150 слов.</p></div>
      <div class="switch" role="group" aria-label="Раздел">${tabs.map(([k, l]) => `<button type="button" data-a="essay-tab" data-tab="${k}" aria-pressed="${e.tab === k}">${esc(l)}</button>`).join("")}</div>`;
    if (e.tab === "plan") return head + essayPlanTab(E);
    if (e.tab === "args") return head + essayArgsTab(E);
    if (e.tab === "mine") return head + essayMineTab(mine);
    const w = wordCount(e.body), checked = E.checklist.filter((x, i) => e.checks[i]).length;
    const src = T.own
      ? `<div class="field"><label for="essay-problem">Проблема из задания</label><input class="input" id="essay-problem" maxlength="300" placeholder="Например: «Что даёт человеку чтение?»" value="${esc(e.own.problem)}"></div>
         <div class="field"><label for="essay-src">Исходный текст</label><textarea class="textarea" id="essay-src" rows="8" maxlength="12000" placeholder="Вставь текст из открытого банка ФИПИ или из варианта">${esc(e.own.text)}</textarea></div>`
      : `<div class="well"><span class="eyebrow">Проблема из задания</span><div class="h3">${esc(T.problem)}</div></div>
         <div class="passage"><div class="eyebrow">Текст · «${esc(T.title)}»</div>${paras(T.body)}</div>
         <div>${e.showPos ? `<div class="ai-box"><span class="eyebrow">Позиция автора</span><div>${esc(T.position)}</div></div>` : `<button type="button" class="link-btn" data-a="essay-pos">Сверить позицию автора (после того как сформулируешь свою)</button>`}</div>`;
    return head + `
      <section class="card stack">
        <h2 class="h2">Исходный текст</h2>
        <div class="switch" role="group" aria-label="Текст">${E.texts.map((t) => `<button type="button" data-a="essay-text" data-id="${t.id}" aria-pressed="${e.tid === t.id}">${esc(t.title)}</button>`).join("")}<button type="button" data-a="essay-text" data-id="own" aria-pressed="${e.tid === "own"}">Свой текст</button></div>
        ${src}
      </section>
      <section class="card stack">
        <div class="row between"><h2 class="h2">Сочинение</h2>${countChip(w)}</div>
        <label class="sr" for="essay-body">Текст сочинения</label>
        <textarea class="textarea essay-area" id="essay-body" maxlength="12000" placeholder="Начни со вступления, которое подводит к проблеме…">${esc(e.body)}</textarea>
        <p class="hint">Минимум 150 слов, оптимально 200–300. Черновик сохраняется в этом браузере; кнопка «Сохранить» переносит сочинение в «Мои сочинения» — оно будет доступно на любом компьютере.</p>
        <div class="row">
          <button type="button" class="btn" data-a="essay-save">Сохранить</button>
          ${ai.state === "ready" ? `<button type="button" class="btn soft" data-a="essay-check"${e.ai && e.ai.status === "busy" ? " disabled" : ""}>${icon("spark")}Проверить по критериям</button>` : ""}
          ${e.confirmClear
            ? `<span class="row" style="gap:12px"><button type="button" class="link-btn" style="color:var(--bad)" data-a="essay-clear">Очистить поле</button><button type="button" class="link-btn" data-a="essay-clear-cancel">Отмена</button></span>`
            : `<button type="button" class="btn ghost" data-a="essay-clear-ask">Новое сочинение</button>`}
        </div>
        ${ai.state === "off" ? `<div class="hint">${store.backend ? (!store.user ? "Проверка ИИ доступна после входа в аккаунт." : "Проверка ИИ заработает, когда на сервере будет настроен ключ ИИ.") : "Проверка ИИ работает, когда сайт открыт на claude.ai и разрешено обращение к Claude."}</div>` : ""}
      </section>
      ${essayAIBlock(e)}
      <section class="card stack">
        <div class="row between"><h2 class="h2">Самопроверка</h2><span class="small muted num">${checked} из ${E.checklist.length}</span></div>
        <div class="checklist">${E.checklist.map((x, i) => `<label><input type="checkbox" class="check" data-c="essay-check" data-i="${i}"${e.checks[i] ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
      </section>`;
  }
  function essayPlanTab(E) {
    const s = E.sample, st = E.texts.find((t) => t.id === s.textId);
    return `<section class="card pad-lg stack"><h2 class="h2">План на 200–250 слов</h2>
        <ol class="plan-list">
          <li><b>Вступление</b> — 1–2 предложения, подводящие к проблеме.</li>
          <li><b>Позиция автора</b> по проблеме из задания — своими словами (К1).</li>
          <li><b>Пример 1</b> из текста с номером предложения или цитатой и пояснение: «Этот пример показывает…» (К2).</li>
          <li><b>Пример 2</b> и пояснение (К2).</li>
          <li><b>Смысловая связь</b> между примерами — назови и объясни (К2).</li>
          <li><b>Своё отношение</b> к позиции автора и пример-аргумент из книги, истории или жизни (К3).</li>
          <li><b>Вывод</b> — 1–2 предложения.</li>
        </ol></section>
      <section class="card stack"><h2 class="h2">Клише</h2>
        ${E.cliches.map((c) => `<div class="stack" style="gap:6px"><div class="label">${esc(c.part)}</div><ul class="theory">${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      </section>
      <section class="card stack"><div class="row between"><h2 class="h2">Образец по тексту «${esc(st ? st.title : "")}»</h2><span class="chip num">${wordCount(s.body)} слов</span></div>
        <div class="well"><span class="eyebrow">Проблема</span><div>${esc(st ? st.problem : "")}</div></div>
        <div class="essay-sample">${paras(s.body)}</div>
        <div class="label">Почему это сочинение получает высокие баллы</div>
        <ul class="theory">${s.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </section>`;
  }
  function essayArgsTab(E) {
    return `<p class="hint">Для К3 нужен пример-аргумент из читательского, историко-культурного или жизненного опыта. Выбери заранее 5–6 произведений и перечитай их краткое содержание: за ошибку в имени, названии или сюжете снимают балл по К4.</p>
      ${E.args.map((g) => `<section class="card stack"><h2 class="h2">${esc(g.theme)}</h2><div class="stack">${g.items.map((x) => `<div><div class="entry-title">${esc(x.src)}</div><div class="small ink2">${esc(x.text)}</div></div>`).join("")}</div></section>`).join("")}`;
  }
  function essayMineTab(list) {
    if (!list.length) return `<div class="empty"><b>Пока нет сохранённых сочинений</b><span>Напиши первое на вкладке «Писать» и нажми «Сохранить» или «Проверить по критериям».</span></div>`;
    return `<section class="card stack"><div class="entries">${list.map((x) => `<div class="entry">
        <span class="entry-date">${esc(dateShort(x.d))}</span>
        <div class="entry-main"><span class="entry-title">${esc(x.title || "Сочинение")}</span><span class="entry-sub">${esc(x.problem || "")} · ${x.w || 0} ${plural(x.w || 0, "слово", "слова", "слов")}${x.sc != null ? " · ИИ: " + x.sc + " из 22" : ""}</span></div>
        <span class="row" style="gap:10px"><button type="button" class="link-btn" data-a="essay-open" data-id="${esc(x.id)}">Открыть</button>${delControl("essay:" + x.id, "del-essay", `data-id="${esc(x.id)}"`)}</span>
      </div>`).join("")}</div></section>`;
  }

  // ---------- настройки ----------
  function viewProfile() {
    const prof = profile();
    return `<div class="head"><div class="eyebrow">Настройки</div><h1 class="h1">Профиль и данные</h1></div>
      ${store.backend ? accountCard() : ""}
      <section class="card pad-lg stack">
        <div class="row between"><h2 class="h2">Оформление</h2><span class="small muted">${themeMode === "auto" ? "по настройкам устройства" : themeMode === "dark" ? "тёмная палитра" : "светлая палитра"}</span></div>
        <div class="switch" role="group" aria-label="Тема оформления">
          <button type="button" data-a="theme-set" data-theme="auto" aria-pressed="${themeMode === "auto"}">Авто</button>
          <button type="button" data-a="theme-set" data-theme="light" aria-pressed="${themeMode === "light"}">${icon("sun")}<span>Светлая</span></button>
          <button type="button" data-a="theme-set" data-theme="dark" aria-pressed="${themeMode === "dark"}">${icon("moon")}<span>Тёмная</span></button>
        </div>
      </section>
      <form class="card pad-lg form" data-f="profile">
        <h2 class="h2">Профиль</h2>
        <div class="field"><label for="pf-name">Как к тебе обращаться</label><input class="input" id="pf-name" data-d="pf.name" value="${esc(draft("pf.name", prof.name || defaultName()))}" maxlength="40"></div>
        <div class="label">Целевые баллы</div>
        <div class="fields">${SUBJECT_META.map((s) => `<div class="field"><label for="pf-t-${s.id}">${esc(s.name)}</label><input class="input num" type="number" min="0" max="100" inputmode="numeric" id="pf-t-${s.id}" data-d="pf.t.${s.id}" value="${esc(draft("pf.t." + s.id, prof.targets[s.id]))}"></div>`).join("")}</div>
        <div class="label">Даты экзаменов</div>
        <div class="fields">${SUBJECT_META.map((s) => `<div class="field"><label for="pf-e-${s.id}">${esc(s.name)}</label><input class="input" type="date" id="pf-e-${s.id}" data-d="pf.e.${s.id}" value="${esc(draft("pf.e." + s.id, prof.exams[s.id]))}"></div>`).join("")}</div>
        <p class="hint">Сейчас стоят даты из проекта расписания ЕГЭ-2027. Когда расписание утвердят, поправь их здесь — план и отсчёты обновятся.</p>
        <div><button class="btn" type="submit">Сохранить</button></div>
      </form>
      ${dataCard()}`;
  }
  function dataCard() {
    const where = store.mode === "cloud"
      ? (store.backend
          ? "Прогресс хранится на сервере в базе данных и привязан к твоему аккаунту. Войди под тем же логином на любом устройстве — ответы, отметки и записи будут на месте."
          : "Прогресс хранится в облаке claude.ai и привязан к твоему аккаунту. Открой эту страницу на любом компьютере под тем же аккаунтом — ответы, отметки и записи будут на месте.")
      : store.mode === "local"
        ? (store.backend
            ? "Сервер базы данных подключён, но вход в аккаунт ещё не выполнен — текущие данные пока хранятся только в этом браузере. Войди или зарегистрируйся выше, чтобы синхронизировать прогресс."
            : "Сейчас страница открыта не на claude.ai, поэтому данные хранятся только в этом браузере. Открой её по ссылке на claude.ai, чтобы прогресс сохранялся в облаке.")
        : "Подключаюсь к хранилищу…";
    const cf = ui.confirm;
    return `<section class="card pad-lg stack">
      <h2 class="h2">Данные</h2>
      <p class="ink2">${where}</p>
      <div class="row">
        <button type="button" class="btn ghost" data-a="export">${icon("download")}Скачать резервную копию</button>
        <button type="button" class="btn ghost" data-a="import">${icon("upload")}Восстановить из копии</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
      ${ui.exportText ? `<div class="field"><label for="export-text">Скопируй текст и сохрани его в файл с расширением .json</label><textarea class="textarea" id="export-text" rows="6" readonly>${esc(ui.exportText)}</textarea><div><button type="button" class="btn soft sm" data-a="copy-export">Скопировать</button></div></div>` : ""}
      ${cf && cf.kind === "import" ? `<div class="confirm"><b>Заменить данные копией от ${esc(cf.date)}?</b><span class="small">Прогресс, план и записи заменятся данными из файла.</span><div class="row"><button type="button" class="btn danger sm" data-a="import-do">Заменить</button><button type="button" class="btn ghost sm" data-a="confirm-cancel">Отмена</button></div></div>` : ""}
      <div class="row">${CONTENT.map((s) => `<button type="button" class="btn ghost" data-a="reset-ask" data-sid="${s.id}">${icon("trash")}Сбросить прогресс ${esc(SUBJ[s.id].po)}</button>`).join("")}</div>
      ${cf && cf.kind === "reset" ? `<div class="confirm"><b>Сбросить все ответы и отметки ${esc(SUBJ[cf.sid].po)}?</b><span class="small">План, пробники и журнал занятий останутся. Отменить сброс нельзя, поэтому сначала можно скачать резервную копию.</span><div class="row"><button type="button" class="btn danger sm" data-a="reset-do">Сбросить</button><button type="button" class="btn ghost sm" data-a="confirm-cancel">Отмена</button></div></div>` : ""}
    </section>
    <section class="card stack"><h2 class="h2">Откуда сроки</h2><p class="ink2 small">Даты собраны ${EGE.plan ? dateLong(EGE.plan.checked) : ""}: проект расписания ЕГЭ-2027 (Минпросвещения и Рособрнадзор, обсуждение до 10 ноября 2026 года) и сроки приёмной кампании 2026 года. Официальные документы смотри на сайтах ниже.</p>
      <div class="stack small"><a href="https://obrnadzor.gov.ru/" target="_blank" rel="noopener">Рособрнадзор</a><a href="https://fipi.ru/" target="_blank" rel="noopener">ФИПИ</a><a href="https://www.gosuslugi.ru/vuzonline" target="_blank" rel="noopener">Поступление в вуз онлайн (Госуслуги)</a></div>
    </section>`;
  }
  async function doExport() {
    const data = JSON.stringify({ app: "vektor-ege", v: 1, exported: new Date().toISOString(), docs: store.docs }, null, 2);
    const filename = "vektor-ege-" + todayISO() + ".json";
    if (caps.downloads) {
      try { await caps.downloads.save({ filename, data }); toast("Резервная копия сохранена"); return; }
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
        toast("Файл резервной копии скачан");
        return;
      }
    } catch (e) { /* запасной вариант ниже */ }
    ui.exportText = data;
    scheduleRender();
  }
  function readImport(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(String(r.result));
        if (!obj || (obj.app !== "vektor-ege" && obj.app !== "put-v-medicinu") || !isObj(obj.docs)) throw new Error("format");
        ui.confirm = { kind: "import", data: obj.docs, date: obj.exported ? dateLong(String(obj.exported).slice(0, 10)) : "неизвестной даты" };
      } catch (e) {
        ui.confirm = null;
        toast("Это не резервная копия «Вектора ЕГЭ».");
      }
      scheduleRender();
    };
    r.readAsText(file);
  }
  function doImport() {
    const cf = ui.confirm;
    if (!cf || cf.kind !== "import") return;
    const ok = /^(profile|plan|mocks|essays|prog-[a-z]+|log-\d{4}-\d{2})$/;
    for (const name of Object.keys(cf.data)) if (ok.test(name) && isObj(cf.data[name])) replaceDoc(name, cf.data[name]);
    ui.confirm = null;
    toast("Данные восстановлены из копии");
  }
  function copyText(text, sel) {
    const fallback = () => { const el = document.querySelector(sel); if (el) { el.focus(); el.select(); toast("Текст выделен — нажми Ctrl+C"); } };
    try { navigator.clipboard.writeText(text).then(() => toast("Скопировано"), fallback); } catch (e) { fallback(); }
  }

  // ---------- тосты и подсказки ----------
  let toastTimer = null;
  function toast(msg, opts) {
    const el = $("#toast");
    if (!el) return;
    opts = opts || {};
    if (opts.side) {
      el.className = "toast is-side";
      el.innerHTML = `<span class="toast-side-row"><span class="bb-pulse-dot" style="margin-top:5px;flex:0 0 auto"></span><span class="toast-side-copy"><b>${esc(opts.title || "Уведомление")}</b><span>${esc(msg)}</span></span></span>`;
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

  // ---------- действия ----------
  function subjectOf(el) { return SUBJ[el.dataset.sid] ? el.dataset.sid : ui.sid; }
  const ACTIONS = {
    "theme-toggle": () => setTheme(effectiveDark() ? "light" : "dark"),
    "theme-set": (el) => setTheme(el.dataset.theme),
    "subj-filter": (el) => { ui.subjFilter = el.dataset.filter || "all"; scheduleRender(); },
    "subj-clear": () => { ui.subjQ = ""; ui.subjFilter = "all"; ui.focusNext = "subj-q"; scheduleRender(); },
    "topic-filter": (el) => { ui.topicFilter = el.dataset.filter || "all"; scheduleRender(); },
    "plan-filter": (el) => { ui.planFilter = el.dataset.filter || "all"; scheduleRender(); },
    "guide-sid": (el) => { ui.guideSid = el.dataset.sid || "all"; scheduleRender(); },
    "guide-clear": () => { ui.guideQ = ""; ui.focusNext = "guide-q"; scheduleRender(); },
    "guide-chip": (el) => { ui.guideQ = el.dataset.q || ""; scheduleRender(); },
    "stats-subj": (el) => { ui.statsSubj = el.dataset.sid || "all"; ui.statsRepAll = false; scheduleRender(); },
    "stats-rep": (el) => { const k = Number(el.dataset.k); if ([1, 2, 3, 4].includes(k)) { ui.statsRepBucket = k; ui.statsRepAll = false; scheduleRender(); } },
    "stats-rep-all": () => { ui.statsRepAll = true; scheduleRender(); },
    "bug-site": () => { ui.bug = buildBugReport({}); ui.focusNext = "bug-body"; renderModal(); },
    "bug-q": (el) => { ui.bug = buildBugReport({ qid: el.dataset.qid, qnum: el.dataset.qnum }); ui.focusNext = "bug-body"; renderModal(); },
    "bug-copy": () => { if (ui.bug) copyText(ui.bug.body, "#bug-body"); },
    "bug-close": () => { ui.bug = null; renderModal(); },
    go: (el) => go(el.dataset.v, { sid: el.dataset.sid, id: el.dataset.id }),
    "open-topic": (el) => go("topic", { id: el.dataset.id }),
    "quiz-mixed": (el) => { const sid = subjectOf(el); startQuiz({ title: "Смешанный тест · " + SUBJ[sid].name, sid, qs: pickMixed(sid, QUIZ_SIZE).map((id) => QS[id]), mode: "mixed", back: { v: "subject", sid } }); },
    "quiz-review": (el) => {
      const sid = subjectOf(el), ids = shuffle(dueQs(sid)).slice(0, QUIZ_SIZE);
      if (!ids.length) { toast("Повторять пока нечего, загляни завтра."); return; }
      startQuiz({ title: "Повторение · " + SUBJ[sid].name, sid, qs: ids.map((id) => QS[id]), mode: "review", back: { v: "subject", sid } });
    },
    "quiz-mistakes": (el) => {
      const sid = subjectOf(el), ids = shuffle(mistakeQs(sid)).slice(0, QUIZ_SIZE);
      if (!ids.length) { toast("Ошибок нет, так держать."); return; }
      startQuiz({ title: "Работа над ошибками · " + SUBJ[sid].name, sid, qs: ids.map((id) => QS[id]), mode: "mistakes", back: { v: "subject", sid } });
    },
    "quiz-topic": (el) => { const t = TOPICS[el.dataset.id]; startQuiz({ title: topicRef(t), sid: t.sid, qs: pickTopic(t, el.dataset.all ? Infinity : TOPIC_QUIZ).map((id) => QS[id]), mode: "topic", topicId: t.id, back: { v: "topic", id: t.id } }); },
    "quiz-topic-mistakes": (el) => { const t = TOPICS[el.dataset.id]; startQuiz({ title: "Ошибки · " + t.title, sid: t.sid, qs: shuffle(mistakeQs(t.sid, t.id)).map((id) => QS[id]), mode: "topic", topicId: t.id, back: { v: "topic", id: t.id } }); },
    "quiz-one": (el) => { const q = QS[el.dataset.id]; if (!q) return; const t = TOPICS[q.topic]; const back = el.dataset.back === "stats" ? { v: "stats" } : { v: "topic", id: t.id }; startQuiz({ title: topicRef(t), sid: q.sid, qs: [q], mode: "topic", topicId: t.id, back }); },
    "quiz-retry": () => {
      const qz = ui.quiz; if (!qz) return;
      const exam = qz.mode === "variant";
      startQuiz({ title: "Ошибки · " + qz.title, sid: qz.sid, qs: qz.items.filter((it) => (exam && !it.res) || (it.res && it.res.r !== 2)).map((it) => it.q), mode: exam || qz.mode === "mixed" ? "mistakes" : qz.mode, topicId: qz.topicId, back: qz.back, retry: true });
    },
    "quiz-variant": (el) => {
      const sid = subjectOf(el); if (!SUBJ[sid].variant) return;
      const v = pickVariant(sid);
      startQuiz({ title: SUBJ[sid].variant.title || "Пробный вариант · часть 1", sid, qs: v.map((x) => QS[x.id]), ns: v.map((x) => x.n), mode: "variant", back: { v: "subject", sid } });
    },
    "quiz-fullvariant": (el) => {
      const sid = subjectOf(el), cfg = SUBJ[sid].fullVariant; if (!cfg) return;
      const k = Number(el.dataset.k) || 0, v = pickVariant(sid, cfg, k);
      startQuiz({ title: cfg.title + (k ? " · вариант " + k : ""), sid, qs: v.map((x) => QS[x.id]), ns: v.map((x) => x.n), mode: "variant", cfg, back: { v: "subject", sid } });
    },
    "variant-save": () => {
      const qz = ui.quiz; if (!qz || !qz.done || qz.saved) return;
      saveVariantMock(qz, false);
      scheduleRender();
    },
    "quiz-part2": (el) => {
      const sid = subjectOf(el), p = SUBJ[sid].part2; if (!p) return;
      const v = pickVariant(sid, p); if (!v.length) return;
      startQuiz({ title: p.title, sid, qs: v.map((x) => QS[x.id]), mode: "part2", back: { v: "subject", sid } });
    },
    "quiz-skip": () => { const qz = ui.quiz; if (!qz || qz.checked) return; qz.spent += Math.min(Date.now() - qz.qStart, MAX_Q_MS); qz.checked = true; doNext(); },
    pick: (el) => {
      const it = curItem(); if (!it || ui.quiz.checked) return;
      const i = Number(el.dataset.i);
      if (it.q.t === "single") it.resp = i;
      else { const k = it.resp.indexOf(i); if (k >= 0) it.resp.splice(k, 1); else it.resp.push(i); }
      saveActiveQuiz();
      ui.focusNext = null; scheduleRender();
    },
    match: (el) => { const it = curItem(); if (!it || ui.quiz.checked) return; const l = Number(el.dataset.l), r = Number(el.dataset.r); it.resp[l] = it.resp[l] === r ? -1 : r; saveActiveQuiz(); scheduleRender(); },
    ord: (el) => { const it = curItem(); if (!it || ui.quiz.checked) return; const i = Number(el.dataset.i), k = it.resp.indexOf(i); if (k >= 0) it.resp.splice(k, 1); else it.resp.push(i); saveActiveQuiz(); scheduleRender(); },
    "ord-reset": () => { const it = curItem(); if (it) { it.resp = []; saveActiveQuiz(); scheduleRender(); } },
    "quiz-hint": () => {
      const qz = ui.quiz, it = curItem(); if (!qz || !it) return;
      it.hintOpen = !it.hintOpen;
      if (it.hintOpen && !it.hinted) {
        it.hinted = true;
        qz.hints = (qz.hints || 0) + 1;
        if (qz.answered > 0) logQuizSession(qz);
      }
      saveActiveQuiz();
      scheduleRender();
    },
    "quiz-guide": () => {
      const it = curItem();
      if (ui.quiz && !ui.quiz.done && it && it.q) {
        ui.guideSid = it.q.sid || "all";
        ui.guideQ = questionGuideHint(it.q).guideQuery || "";
      }
      go("tutor");
    },
    "quiz-check": () => doCheck(),
    "quiz-next": () => doNext(),
    "quiz-exit": () => exitQuiz(),
    explain: () => explainCurrent(),
    "explain-stop": () => abortAI(),
    theory: (el) => {
      const t = TOPICS[el.dataset.id], read = !!prog(t.sid).th[t.id];
      patchDoc("prog-" + t.sid, { th: { [t.id]: read ? null : Date.now() } });
      if (!read) markPlanPrep(t.sid, "Прочитана теория: " + t.title);
      toast(read ? "Отметка снята" : "Теория отмечена как прочитанная");
    },
    "plan-act": (el) => {
      const it = findPlanItem(el.dataset.id), act = it && it.action;
      if (!act || !SUBJ[act.sid]) return;
      if (act.kind === "diag") {
        startQuiz({ title: "Диагностика · " + SUBJ[act.sid].name, sid: act.sid, qs: pickMixed(act.sid, QUIZ_SIZE).map((id) => QS[id]), mode: "mixed", back: { v: "plan" }, planId: it.id });
        return;
      }
      if (act.kind === "prep") {
        const list = (SUBJ[act.sid].topicList || []).filter((x) => x.qids.length);
        const t = list.find((x) => topicStats(x).mastered < x.qids.length) || list[0];
        if (!t) { toast("Здесь пока нет вопросов."); return; }
        startQuiz({ title: topicRef(t), sid: t.sid, qs: pickTopic(t, TOPIC_QUIZ).map((id) => QS[id]), mode: "topic", topicId: t.id, back: { v: "plan" }, planId: it.id });
      }
    },
    "gen-ai": (el) => generateQuestions(el.dataset.id),
    "gen-stop": () => { if (ui.gen && ui.gen.ctl) ui.gen.ctl.abort(); ui.gen = null; scheduleRender(); },
    "ask-tutor": (el) => { const t = TOPICS[el.dataset.id]; ui.chat.sid = t.sid; ui.chat.draft = `Объясни простыми словами главное по теме «${t.title}» и приведи пример задания ЕГЭ.`; ui.focusNext = "chat-input"; go("tutor"); },
    "chat-subject": (el) => { if (SUBJ[el.dataset.sid]) { ui.chat.sid = el.dataset.sid; scheduleRender(); } },
    "chat-suggest": (el) => sendChat(el.dataset.text),
    "chat-stop": () => { if (ui.chat.ctl) ui.chat.ctl.abort(); },
    "chat-clear": () => { if (ui.chat.ctl) ui.chat.ctl.abort(); ui.chat = { sid: ui.chat.sid, turns: [], busy: false, ctl: null, draft: "", error: "" }; scheduleRender(); },
    "ask-del": (el) => { ui.confirmDel = el.dataset.k; scheduleRender(); },
    "cancel-del": () => { ui.confirmDel = null; scheduleRender(); },
    "del-log": (el) => { patchDoc(el.dataset.doc, { s: { [el.dataset.id]: null } }); ui.confirmDel = null; toast("Запись удалена"); },
    "del-mock": (el) => { patchDoc("mocks", { m: { [el.dataset.id]: null } }); ui.confirmDel = null; toast("Пробник удалён"); },
    "del-todo": (el) => { patchDoc("plan", { custom: { [el.dataset.id]: null } }); ui.confirmDel = null; toast("Дело удалено"); },
    export: () => doExport(),
    "copy-export": () => copyText(ui.exportText, "#export-text"),
    import: () => { const f = document.getElementById("import-file"); if (f) f.click(); },
    "import-do": () => doImport(),
    "reset-ask": (el) => { if (!SUBJ[el.dataset.sid]) return; ui.confirm = { kind: "reset", sid: el.dataset.sid }; scheduleRender(); },
    "reset-do": () => {
      const cf = ui.confirm;
      if (!cf || cf.kind !== "reset" || !SUBJ[cf.sid]) return;
      replaceDoc("prog-" + cf.sid, { q: {}, th: {} });
      ui.confirm = null;
      toast("Прогресс " + SUBJ[cf.sid].po + " сброшен");
    },
    "confirm-cancel": () => { ui.confirm = null; scheduleRender(); },
    "essay-tab": (el) => { essayState().tab = el.dataset.tab; scheduleRender(true); },
    "essay-text": (el) => { const e = essayState(); if (e.tid === el.dataset.id) return; e.tid = el.dataset.id; e.editId = null; e.showPos = false; e.ai = null; essayDraftLater(); scheduleRender(); },
    "essay-pos": () => { essayState().showPos = true; scheduleRender(); },
    "essay-save": () => { if (saveEssay()) toast("Сохранено в «Мои сочинения»"); },
    "essay-check": () => checkEssay(),
    "essay-stop": () => { const e = essayState(); if (e.ai && e.ai.ctl) e.ai.ctl.abort(); },
    "essay-clear-ask": () => { essayState().confirmClear = true; scheduleRender(); },
    "essay-clear-cancel": () => { essayState().confirmClear = false; scheduleRender(); },
    "essay-clear": () => {
      const e = essayState();
      Object.assign(e, { body: "", editId: null, ai: null, checks: {}, showPos: false, confirmClear: false });
      essayDraftLater(); ui.focusNext = "essay-body"; scheduleRender();
    },
    "essay-open": (el) => {
      const x = essays().find((r) => r.id === el.dataset.id), e = essayState();
      if (!x) return;
      const own = !EGE.essay.texts.some((t) => t.id === x.tid);
      Object.assign(e, { tid: own ? "own" : x.tid, body: x.body, editId: x.id, ai: null, checks: {}, showPos: false, tab: "write" });
      if (own) e.own = { text: x.src || "", problem: x.problem || "" };
      essayDraftLater(); scheduleRender(true);
    },
    "del-essay": (el) => {
      patchDoc("essays", { e: { [el.dataset.id]: null } });
      if (ui.essay && ui.essay.editId === el.dataset.id) ui.essay.editId = null;
      ui.confirmDel = null; toast("Сочинение удалено");
    },
    "auth-tab": (el) => {
      ui.auth.tab = el.dataset.tab === "register" ? "register" : "login";
      ui.auth.error = "";
      scheduleRender();
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
    "auth-guest": () => {
      ui.guest = true;
      ui.authModal = false;
      ui.auth.error = "";
      if (ui.view === "landing" || ui.view === "brandbook") { ui.view = "tests"; writeHash(); }
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
    },
    "land-scroll": (el) => {
      const id = el.dataset.target;
      const node = id ? document.getElementById(id) : null;
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    "mkt-plan": (el) => {
      if (!TDATA) return;
      const plan = TDATA.PLANS.find((p) => p.id === el.dataset.id);
      if (!plan) return;
      const st = mkt();
      st.planId = plan.id;
      if (!plan.balance) {
        st.balance = 0;
        st.bookings.forEach((bk) => { bk.reserved = 0; });
      } else {
        const reserved = st.bookings.reduce((sum, bk) => sum + (bk.reserved || 0), 0);
        st.balance = Math.max(0, plan.balance - reserved);
      }
      saveMkt();
      if (plan.id === "free" && !store.user && !ui.guest) {
        ui.authModal = true;
        ui.auth.error = "";
        renderModal();
        return;
      }
      toast(plan.balance ? `Подключён тариф «${plan.name}»: баланс ${st.balance.toLocaleString("ru-RU")} ₽` : "Выбран бесплатный тариф");
      scheduleRender();
    },
    "filter-open": () => { ui.filterModal = true; renderModal(); },
    "filter-close": () => { ui.filterModal = false; renderModal(); },
    "study-tab": (el) => { ui.studyTab = el.dataset.tab || "week"; scheduleRender(true); },
    "study-week": (el) => { ui.studyWeekOffset = el.dataset.w === "1" ? 1 : 0; scheduleRender(); },
    "study-subj": (el) => { ui.studySubj = el.dataset.v || "all"; scheduleRender(); },
    "tests-guide-chip": (el) => { ui.guideSid = "all"; ui.guideQ = el.dataset.q || ""; go("tutor"); },
    "mkt-fav": (el) => {
      const st = mkt(), id = el.dataset.id;
      if (!id) return;
      const i = st.favs.indexOf(id);
      if (i < 0) st.favs.push(id);
      else st.favs.splice(i, 1);
      saveMkt();
      scheduleRender();
    },
    "mkt-clear-q": () => { mkt().q = ""; saveMkt(); ui.focusNext = "mkt-q"; scheduleRender(); },
    "mkt-bumped-set": (el) => { mkt().onlyBumped = el.dataset.v === "1"; saveMkt(); scheduleRender(); },
    "mkt-sort-cycle": () => {
      const order = ["actual", "price_asc", "rating_desc"];
      const st = mkt();
      st.sort = order[(order.indexOf(st.sort) + 1) % order.length];
      saveMkt();
      scheduleRender();
    },
    "mkt-reset-chip": (el) => {
      const st = mkt(), k = el.dataset.k;
      if (!k) return;
      const def = defaultMarketState();
      if (Object.prototype.hasOwnProperty.call(def, k)) st[k] = def[k];
      saveMkt();
      scheduleRender();
    },
    "mkt-calc": (el) => {
      const rate = Number(el.dataset.rate);
      if (!rate) return;
      mkt().calcRate = rate;
      saveMkt();
      scheduleRender();
    },
    "mkt-preset": () => {
      if (!TDATA) return;
      const st = mkt();
      const days = TDATA.buildCalendarDays(7);
      const sat = days.find((d) => d.dow === 6) || days[0];
      st.exam = "ЕГЭ";
      st.subject = "eng";
      st.format = "Онлайн";
      st.maxPrice = 2000;
      st.onlyBumped = false;
      st.day = sat ? sat.iso : "all";
      st.hour = "10:00";
      saveMkt();
      toast("Фильтр: Английский · ЕГЭ · Сб 10:00");
      scheduleRender();
    },
    "mkt-exam": (el) => { mkt().exam = el.dataset.v || "all"; saveMkt(); scheduleRender(); },
    "mkt-format": (el) => { mkt().format = el.dataset.v || "all"; saveMkt(); scheduleRender(); },
    "mkt-subj": (el) => { mkt().subject = el.dataset.v || "all"; saveMkt(); scheduleRender(); },
    "mkt-price": (el) => { mkt().maxPrice = Number(el.dataset.v) || 2000; saveMkt(); scheduleRender(); },
    "mkt-bumped": () => { const st = mkt(); st.onlyBumped = !st.onlyBumped; saveMkt(); scheduleRender(); },
    "mkt-sort": (el) => { mkt().sort = el.dataset.v || "actual"; saveMkt(); scheduleRender(); },
    "mkt-day": (el) => { mkt().day = el.dataset.v || "all"; saveMkt(); scheduleRender(); },
    "mkt-hour": (el) => { mkt().hour = el.dataset.v || "all"; saveMkt(); scheduleRender(); },
    "mkt-reset": () => {
      const cur = mkt(), fresh = defaultMarketState();
      fresh.planId = cur.planId;
      fresh.balance = cur.balance;
      fresh.calcRate = cur.calcRate;
      fresh.favs = cur.favs;
      fresh.bookings = cur.bookings;
      ui.market = fresh;
      saveMkt();
      scheduleRender();
    },
    "book-open": (el) => {
      if (!TDATA) return;
      const tutor = TDATA.LIST.find((x) => x.id === el.dataset.id);
      if (!tutor) return;
      const st = mkt();
      const days = TDATA.buildCalendarDays(7);
      const pickDay = (st.day !== "all" ? days.find((d) => d.iso === st.day) : null)
        || days.find((d) => TDATA.tutorSlotsForDay(tutor, d.dow).length > 0)
        || days[0];
      const daySlots = TDATA.tutorSlotsForDay(tutor, pickDay.dow);
      const wantedHour = el.dataset.hour || (st.hour !== "all" ? st.hour : "");
      const hour = isValidHHMM(wantedHour) ? wantedHour : (daySlots[0] || "10:00");
      const exam = st.exam !== "all" && tutor.exams.includes(st.exam) ? st.exam : tutor.exams[0];
      const format = st.format !== "all" && tutor.formats.includes(st.format) ? st.format : tutor.formats[0];
      const offerPrice = Math.max(500, tutor.minFair || (tutor.price - 200));
      ui.booking = { tutorId: tutor.id, exam, format, dayIso: pickDay.iso, hour, offerPrice, note: "" };
      renderModal();
    },
    "book-close": () => { ui.booking = null; renderModal(); },
    "book-exam": (el) => { if (ui.booking && el.dataset.v) { ui.booking.exam = el.dataset.v; renderModal(); } },
    "book-format": (el) => { if (ui.booking && el.dataset.v) { ui.booking.format = el.dataset.v; renderModal(); } },
    "book-day": (el) => {
      if (!ui.booking || !TDATA || !el.dataset.v) return;
      const tutor = TDATA.LIST.find((x) => x.id === ui.booking.tutorId);
      const days = TDATA.buildCalendarDays(7);
      const d = days.find((x) => x.iso === el.dataset.v);
      if (!d) return;
      ui.booking.dayIso = d.iso;
      const slots = tutor ? TDATA.tutorSlotsForDay(tutor, d.dow) : [];
      if (slots.length && !slots.includes(ui.booking.hour)) ui.booking.hour = slots[0];
      renderModal();
    },
    "book-hour": (el) => { if (ui.booking && el.dataset.v) { ui.booking.hour = el.dataset.v; renderModal(); } },
    "bid-step": (el) => {
      if (!ui.booking) return;
      const delta = Number(el.dataset.step) || 0;
      const cur = Number(ui.booking.offerPrice) || 1000;
      ui.booking.offerPrice = Math.max(500, Math.min(5000, cur + delta));
      renderModal();
    },
    "book-submit": () => {
      if (!ui.booking || !TDATA) return;
      const b = ui.booking;
      const tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
      if (!tutor) return;
      const days = TDATA.buildCalendarDays(7);
      const dayObj = days.find((d) => d.iso === b.dayIso) || days[0];
      const daySlots = TDATA.tutorSlotsForDay(tutor, dayObj.dow);
      const hour = isValidHHMM(b.hour) ? b.hour : (daySlots[0] || "10:00");
      const offerPrice = Math.max(500, Math.min(5000, Math.round(Number(b.offerPrice) || tutor.price)));
      const feeSplit = typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(offerPrice) : { total: offerPrice, fee: Math.round(offerPrice * 0.05), payout: offerPrice - Math.round(offerPrice * 0.05), pct: 5 };
      const st = mkt();
      let reserved = 0;
      if (st.balance >= offerPrice) {
        reserved = offerPrice;
        st.balance -= reserved;
      }
      st.bookings.unshift({
        id: "bk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        tutorId: tutor.id,
        tutorName: tutor.name,
        subjectName: tutor.subjectName,
        exam: b.exam || tutor.exams[0],
        format: b.format || tutor.formats[0],
        dayIso: dayObj.iso,
        dayLabel: dayObj.shortLabel,
        hour,
        offerPrice,
        fee: feeSplit.fee,
        payout: feeSplit.payout,
        tutorPrice: tutor.price,
        note: String(b.note || "").trim(),
        reserved,
        status: "pending",
        createdAt: Date.now()
      });
      ui.booking = null;
      saveMkt();
      renderModal();
      notifySide(
        "Предложение передано преподавателю",
        reserved
          ? `Ставка ${offerPrice.toLocaleString("ru-RU")} ₽/ч (${dayObj.shortLabel}, ${hour}) · зарезервировано ${reserved.toLocaleString("ru-RU")} ₽ · уведомим о подтверждении`
          : `Ставка ${offerPrice.toLocaleString("ru-RU")} ₽/ч (${dayObj.shortLabel}, ${hour}) отправлена — уведомим о подтверждении`
      );
      scheduleRender();
    },
    "demo-tab": (el) => {
      if (!el.dataset.tab) return;
      ui.demo.tab = el.dataset.tab;
      scheduleRender();
    },
    "demo-subj": (el) => {
      if (!el.dataset.sid) return;
      ui.demo.sid = el.dataset.sid;
      ui.demo.qIdx = 0;
      ui.demo.pick = null;
      ui.demo.revealed = false;
      ui.demo.topicIdx = 0;
      scheduleRender();
    },
    "demo-pick": (el) => {
      const idx = Number(el.dataset.i);
      if (!Number.isFinite(idx)) return;
      ui.demo.pick = idx;
      ui.demo.revealed = true;
      scheduleRender();
    },
    "demo-next": () => {
      ui.demo.qIdx = (ui.demo.qIdx || 0) + 1;
      ui.demo.pick = null;
      ui.demo.revealed = false;
      scheduleRender();
    },
    "demo-topic": (el) => {
      ui.demo.topicIdx = Math.max(0, Number(el.dataset.i) || 0);
      scheduleRender();
    },
    "demo-rate": (el) => {
      const r = Number(el.dataset.rate) || 800;
      ui.demo.bidRate = Math.max(500, Math.min(3000, r));
      scheduleRender();
    },
    "mkt-sim-accept": (el) => {
      const st = mkt();
      const bk = st.bookings.find((x) => x.id === el.dataset.id);
      if (!bk) return;
      bk.status = "accepted";
      if (!bk.reserved && st.balance >= bk.offerPrice) {
        bk.reserved = bk.offerPrice;
        st.balance -= bk.reserved;
      }
      saveMkt();
      toast(`${bk.tutorName} подтвердил(а) занятие ${bk.hour} по ставке ${bk.offerPrice} ₽/ч · уведомили в Учёбе`);
      scheduleRender();
    },
    "mkt-cancel-book": (el) => {
      const st = mkt();
      const idx = st.bookings.findIndex((x) => x.id === el.dataset.id);
      if (idx < 0) return;
      const bk = st.bookings[idx];
      if (bk.reserved) st.balance += bk.reserved;
      st.bookings.splice(idx, 1);
      saveMkt();
      toast(bk.reserved
        ? `Заявка отменена · ${bk.reserved.toLocaleString("ru-RU")} ₽ возвращены на баланс`
        : "Заявка отменена — можно выбрать другого репетитора");
      scheduleRender();
    },
    "motion-preset": (el) => {
      const id = el.dataset.v;
      const preset = MOTION_PRESETS[id];
      if (!preset) return;
      const dh = preset.defaultHour || 10;
      const slot = String(dh).padStart(2, "0") + ":00";
      if (!ui.motion) ui.motion = { playing: true, preset: id, step: 0, slot, offer: preset.defaultOffer, sent: false, clicking: false, hitTarget: "" };
      ui.motion.preset = id;
      ui.motion.slot = slot;
      ui.motion.offer = preset.defaultOffer;
      ui.motion.sent = false;
      ui.motion.step = 0;
      ui.motion.playing = false;
      ui.motion.clicking = false;
      ui.motion.hitTarget = "";
      stopMotionTimers();
      patchHeroMotionDOM();
    },
    "motion-step-price": (el) => {
      if (!ui.motion) ui.motion = { playing: false, preset: "design", step: 1, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" };
      const meta = heroMotionMeta();
      const step = Number(el.dataset.step) || 0;
      ui.motion.offer = Math.max(meta.minOffer, Math.min(meta.maxOffer, meta.offer + step));
      ui.motion.sent = false;
      ui.motion.step = 1;
      ui.motion.playing = false;
      ui.motion.clicking = false;
      ui.motion.hitTarget = step < 0 ? "minus" : "plus";
      stopMotionTimers();
      patchHeroMotionDOM({ liveOnly: true });
      if (typeof setTimeout === "function") {
        if (motionPulseTimer && typeof clearTimeout === "function") clearTimeout(motionPulseTimer);
        motionPulseTimer = setTimeout(() => {
          motionPulseTimer = null;
          if (!ui.motion) return;
          ui.motion.hitTarget = "";
          const st = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
          if (st && typeof st.querySelector === "function") {
            const hm = st.querySelector("#hero-price-minus");
            const hp = st.querySelector("#hero-price-plus");
            if (hm && hm.classList) hm.classList.remove("is-hit");
            if (hp && hp.classList) hp.classList.remove("is-hit");
          }
        }, 280);
      }
    },
    "motion-toggle": () => {
      if (!ui.motion) return;
      ui.motion.playing = !ui.motion.playing;
      if (!ui.motion.playing) stopMotionTimers();
      else { ui.motion.sent = false; ui.motion.step = 0; }
      patchHeroMotionDOM();
    },
    "motion-bid-press": () => {
      if (!ui.motion) ui.motion = { playing: false, preset: "design", step: 2, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" };
      ui.motion.playing = false;
      stopMotionTimers();
      ui.motion.sent = true;
      ui.motion.step = 2;
      ui.motion.clicking = true;
      ui.motion.hitTarget = "bid";
      patchHeroMotionDOM({ liveOnly: true });
      const meta = heroMotionMeta();
      notifySide(
        "Предложение передано преподавателю",
        `${meta.tutor.subjectName}: ставка ${meta.offer.toLocaleString("ru-RU")} ₽/ч на ${meta.slot} отправлена — уведомим об ответе`
      );
      if (typeof setTimeout === "function") {
        if (motionPulseTimer && typeof clearTimeout === "function") clearTimeout(motionPulseTimer);
        motionPulseTimer = setTimeout(() => {
          motionPulseTimer = null;
          if (!ui.motion) return;
          ui.motion.clicking = false;
          ui.motion.hitTarget = "";
          const st = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
          if (st && typeof st.querySelector === "function") {
            const b = st.querySelector("#hero-motion-bid-btn");
            if (b && b.classList) b.classList.remove("is-pressed");
          }
        }, 420);
      }
    },
    "motion-book-now": () => {
      const meta = heroMotionMeta();
      if (typeof ACTIONS["book-open"] === "function") {
        ACTIONS["book-open"]({ dataset: { id: meta.tutor.id, hour: meta.slot } });
        if (ui.booking) {
          ui.booking.offerPrice = meta.offer;
          renderModal();
        }
      }
    },
    "hero-cat": (el) => {
      const st = mkt();
      st.subject = el.dataset.subj || "all";
      st.exam = el.dataset.exam || "all";
      st.q = "";
      st.onlyBumped = false;
      st.maxPrice = 2000;
      st.day = "all";
      st.hour = "all";
      saveMkt();
      scheduleRender();
      if (typeof setTimeout === "function") {
        setTimeout(() => scrollToEl("land-market"), 40);
      }
    },
    "save-freq": (el) => {
      if (!ui.savings) ui.savings = { freq: 2, marketRate: 1600, offerRate: 950 };
      ui.savings.freq = Math.max(1, Math.min(4, Number(el.dataset.v) || 2));
      patchSavingsDOM();
    },
    "save-step": (el) => {
      if (!ui.savings) ui.savings = { freq: 2, marketRate: 1600, offerRate: 950 };
      const which = el.dataset.which === "mkt" ? "marketRate" : "offerRate";
      const step = Number(el.dataset.step) || 0;
      if (which === "marketRate") {
        ui.savings.marketRate = Math.max(1000, Math.min(3500, (Number(ui.savings.marketRate) || 1600) + step));
        if ((Number(ui.savings.offerRate) || 950) > ui.savings.marketRate - 100) {
          ui.savings.offerRate = Math.max(600, ui.savings.marketRate - 100);
        }
      } else {
        const cap = Math.max(600, (Number(ui.savings.marketRate) || 1600) - 100);
        ui.savings.offerRate = Math.max(600, Math.min(cap, (Number(ui.savings.offerRate) || 950) + step));
      }
      patchSavingsDOM();
    },
    "bb-mode": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.mode = ["both", "light", "dark"].includes(el.dataset.v) ? el.dataset.v : "both";
      scheduleRender();
    },
    "bb-step": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const step = Number(el.dataset.step) || 0;
      bb.price = Math.max(600, Math.min(2800, (Number(bb.price) || 1200) + step));
      bb.sent = false;
      scheduleRender();
    },
    "bb-preset": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const p = Number(el.dataset.price) || 1200;
      bb.price = Math.max(600, Math.min(2800, p));
      bb.sent = false;
      scheduleRender();
    },
    "bb-day": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const d = el.dataset.v;
      if (["all", "sat", "sun", "mon"].includes(d)) bb.day = d;
      scheduleRender();
    },
    "bb-slider-style": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const s = el.dataset.v;
      if (["clean", "ticks", "ruler"].includes(s)) bb.sliderStyle = s;
      scheduleRender();
    },
    "bb-bounds-toggle": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.showBounds = bb.showBounds === false;
      scheduleRender();
    },
    "bb-chip": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.chipOn = !bb.chipOn;
      scheduleRender();
    },
    "bb-fav": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.fav = bb.fav === false;
      scheduleRender();
    },
    "bb-bid": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
      bb.sent = !bb.sent;
      if (bb.sent) {
        const hhStr = String(bb.hour || 14).padStart(2, "0") + ":00";
        notifySide(
          "Предложение передано преподавателю",
          `Ставка ${bb.price.toLocaleString("ru-RU")} ₽/ч на ${hhStr} отправлена — уведомим об ответе`
        );
      }
      const btns = typeof document.querySelectorAll === "function" ? document.querySelectorAll('[data-a="bb-bid"]') : null;
      if (btns && btns.length) {
        btns.forEach((btn) => {
          if (btn.classList) btn.classList.toggle("is-confirmed", !!bb.sent);
          btn.textContent = (btn.dataset && btn.dataset.bbShort)
            ? (bb.sent ? "✓ Подтверждено" : "Предложить")
            : bidBtnLabelHTML(bb.sent, bb.price);
        });
        document.querySelectorAll('[data-bb="bid-status"]').forEach((st) => {
          st.textContent = bb.sent ? "✓ Подтверждено · уведомление показано сбоку" : "Обычное состояние CTA · #0070FF";
          if (st.classList) st.classList.toggle("muted", !bb.sent);
          if (st.style) {
            st.style.color = bb.sent ? "var(--confirm)" : "";
            st.style.fontWeight = bb.sent ? "600" : "";
          }
        });
      } else {
        scheduleRender();
      }
    },
    "bb-vp": (el) => {
      const w = Number(el.dataset.w) || 390;
      const vpEl = typeof document.getElementById === "function" ? document.getElementById("bb-resp-viewport") : null;
      applyBrandbookViewport(w);
      if (!vpEl) scheduleRender();
    },
    "bb-icon-play": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
      const ic = (el.dataset && el.dataset.icon) || "bell";
      const label = (el.dataset && el.dataset.label) || ic;
      const animDesc = (el.dataset && el.dataset.animDesc) || "Анимация";
      bb.activeIcon = ic;
      const tiles = typeof document.querySelectorAll === "function" ? document.querySelectorAll(".bb-icon-tile") : null;
      if (tiles && tiles.length) {
        tiles.forEach((tile) => {
          const isMe = tile === el || (tile.dataset && tile.dataset.icon === ic);
          if (tile.classList) {
            tile.classList.toggle("is-active", isMe);
            if (!isMe) tile.classList.remove("is-anim");
          }
          if (typeof tile.setAttribute === "function") tile.setAttribute("aria-pressed", isMe ? "true" : "false");
        });
        triggerIconTileAnim(el);
        document.querySelectorAll('[data-bb="icon-status"]').forEach((st) => {
          st.textContent = label + " · " + animDesc;
        });
      } else {
        scheduleRender();
      }
    },
    "bb-icons-wave": () => {
      const tiles = typeof document.querySelectorAll === "function" ? document.querySelectorAll(".bb-icon-tile") : null;
      if (tiles && tiles.length) {
        document.querySelectorAll('[data-bb="icon-status"]').forEach((st) => {
          st.textContent = "Каскад · 36 анимаций";
        });
        tiles.forEach((tile, idx) => {
          const run = () => triggerIconTileAnim(tile);
          if (typeof setTimeout === "function") setTimeout(run, idx * 24);
          else run();
        });
      } else {
        const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
        bb.activeIcon = "spark";
        scheduleRender();
      }
    },
    "go-fees": () => {
      ui.booking = null;
      renderModal();
      go("fees");
    },
    "fees-rate": (el) => {
      ui.feesRate = Math.max(600, Math.min(3500, Number(el.dataset.rate) || 800));
      scheduleRender();
    }
  };
  function triggerIconTileAnim(tile) {
    if (!tile || !tile.classList) return;
    tile.classList.remove("is-anim");
    if (typeof tile.offsetWidth === "number") void tile.offsetWidth;
    tile.classList.add("is-anim");
    clearTimeout(tile._animTimer);
    if (typeof setTimeout === "function") {
      tile._animTimer = setTimeout(() => {
        if (tile.classList) tile.classList.remove("is-anim");
      }, 720);
    }
  }
  function applyBrandbookViewport(rawW) {
    const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
    const vpW = Math.max(320, Math.min(1100, Math.round(Number(rawW) || 390)));
    bb.vpWidth = vpW;
    const vpModeLabel = vpW <= 359 ? "Mini · 1 кол. узкая" : vpW <= 480 ? "Mobile · 1 кол." : vpW <= 760 ? "Compact · 1–2 кол." : vpW <= 1040 ? "Tablet · 2 кол." : "Desktop · сетка";
    const vpEl = typeof document.getElementById === "function" ? document.getElementById("bb-resp-viewport") : null;
    if (vpEl && vpEl.style) vpEl.style.maxWidth = vpW + "px";
    const roEl = typeof document.getElementById === "function" ? document.getElementById("bb-vp-readout") : null;
    if (roEl) roEl.textContent = vpW + " px";
    const curEl = typeof document.getElementById === "function" ? document.getElementById("bb-resp-cur") : null;
    if (curEl) curEl.textContent = vpW + " px";
    const modeEl = typeof document.getElementById === "function" ? document.getElementById("bb-vp-mode") : null;
    if (modeEl) modeEl.textContent = vpModeLabel;
    const slEl = typeof document.getElementById === "function" ? document.getElementById("bb-vp-slider") : null;
    if (slEl) {
      slEl.value = String(vpW);
      if (slEl.style && typeof slEl.style.setProperty === "function") {
        slEl.style.setProperty("--pct", Math.round(((vpW - 320) / 780) * 100) + "%");
      }
    }
    if (typeof document.querySelectorAll === "function") {
      const phoneW = Math.min(410, vpW);
      document.querySelectorAll(".bb-phone-frame").forEach((pf) => {
        if (pf.style) pf.style.maxWidth = phoneW + "px";
      });
      document.querySelectorAll('[data-bb="phone-w"]').forEach((pw) => { pw.textContent = String(phoneW); });
      document.querySelectorAll('[data-a="bb-vp"]').forEach((btn) => {
        const bw = Number(btn.dataset && btn.dataset.w) || 390;
        const active = (bw === 320 && vpW <= 340) ||
          (bw === 390 && vpW > 340 && vpW <= 420) ||
          (bw === 768 && vpW > 420 && vpW <= 820) ||
          (bw === 1100 && vpW > 820);
        if (btn.classList) btn.classList.toggle("on", active);
      });
    }
  }
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
        if (ui.view === "landing" || ui.view === "brandbook") ui.view = "tests";
        await loadBackendSession(res.user);
        clearDrafts("auth."); clearDrafts("pf."); clearDrafts("ob.");
        a.error = "";
        toast(reg ? (migrated ? "Аккаунт создан, прогресс перенесён" : "Аккаунт создан") : "Вход выполнен");
      } catch (e) {
        a.error = authErrorText(e);
      }
      a.busy = false;
      scheduleRender();
    }
  };

  function updateBookingModalLive() {
    if (!ui.booking || !TDATA) return;
    const b = ui.booking, tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
    if (!tutor) return;
    const days = TDATA.buildCalendarDays(7);
    const dayObj = days.find((d) => d.iso === b.dayIso) || days[0];
    const hourPill = document.getElementById("bid-hour-pill");
    if (hourPill) hourPill.textContent = b.hour;
    const hourRange = document.getElementById("bid-hour-range");
    if (hourRange) {
      const hNum = Math.max(10, Math.min(20, parseInt(String(b.hour || "10").slice(0, 2), 10) || 10));
      hourRange.value = String(hNum);
      if (hourRange.style && typeof hourRange.style.setProperty === "function") {
        hourRange.style.setProperty("--pct", ((hNum - 10) * 10) + "%");
      }
    }
    const customEl = document.getElementById("bid-custom-time");
    if (customEl && customEl.value !== b.hour && document.activeElement !== customEl) {
      customEl.value = b.hour;
    }
    const priceRowEl = document.getElementById("bid-price-row");
    if (priceRowEl) {
      priceRowEl.innerHTML = priceHeadlineHTML(tutor.marketPrice, b.offerPrice, false);
    }
    const diffEl = document.getElementById("bid-diff-strip");
    if (diffEl) {
      diffEl.innerHTML = priceDiffTagsHTML({ tutorPrice: tutor.price, marketPrice: tutor.marketPrice || tutor.price, offerPrice: b.offerPrice, qualBadge: tutor.qualBadge });
    }
    const subBtn = document.getElementById("bid-submit-btn");
    if (subBtn) subBtn.textContent = `Предложить ${b.offerPrice.toLocaleString("ru-RU")} ₽`;
    const sigEl = document.getElementById("bid-signal");
    if (sigEl) {
      const sig = TDATA.offerSignal(tutor.price, b.offerPrice);
      sigEl.innerHTML = `<span class="chip ${sig.tone}">${esc(sig.label)}</span>`;
    }
    const winEl = document.getElementById("bid-win-status");
    if (winEl && typeof TDATA.tutorInWindow === "function") {
      const winTxt = tutor.windowLabel || ("с " + tutor.availableFrom + " до " + tutor.availableTo);
      const inWin = TDATA.tutorInWindow(tutor, b.hour);
      winEl.textContent = inWin
        ? `Входит в свободное окно (${winTxt})`
        : `Вне типового окна (${winTxt}) — уточним и уведомим`;
    }
    const prevEl = document.getElementById("bot-preview-txt");
    if (prevEl) {
      prevEl.textContent = TDATA.botPreviewText({
        exam: b.exam,
        subjectName: tutor.subjectName,
        format: b.format,
        dayLabel: dayObj.fullLabel,
        hour: b.hour,
        offerPrice: b.offerPrice,
        tutorPrice: tutor.price
      });
    }
  }

  document.addEventListener("click", (e) => {
    if (e.target && e.target.classList && e.target.classList.contains("modal-back")) {
      ui.bug = null; ui.booking = null; ui.authModal = false; ui.filterModal = false;
      renderModal();
      return;
    }
    const el = e.target.closest("[data-a]");
    if (!el || el.disabled) return;
    const h = ACTIONS[el.dataset.a];
    if (h) { e.preventDefault(); h(el, e); }
  });
  document.addEventListener("submit", (e) => {
    const f = e.target.closest("form[data-f]");
    if (!f) return;
    e.preventDefault();
    const h = FORMS[f.dataset.f];
    if (h) h(f);
  });
  document.addEventListener("input", (e) => {
    const el = e.target;
    if (el.id === "subj-q") { ui.subjQ = el.value; scheduleRender(); return; }
    if (el.id === "guide-q") { ui.guideQ = el.value; scheduleRender(); return; }
    if (el.id === "mkt-q" || el.id === "mkt-q-modal") { mkt().q = el.value; saveMkt(); scheduleRender(); return; }
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
    if (el.id === "bid-price") {
      if (ui.booking) {
        const raw = parseInt(el.value, 10);
        if (Number.isFinite(raw)) {
          ui.booking.offerPrice = Math.max(500, Math.min(5000, raw));
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
        ui.demo.bidRate = Math.max(500, Math.min(3000, raw));
        scheduleRender();
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
    if (el.id === "bid-price") {
      if (ui.booking) {
        const raw = parseInt(el.value, 10);
        ui.booking.offerPrice = Number.isFinite(raw) ? Math.max(500, Math.min(5000, raw)) : (ui.booking.offerPrice || 1000);
        el.value = String(ui.booking.offerPrice);
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
    if (e.key === "Escape" && (ui.bug || ui.booking || ui.authModal || ui.filterModal)) {
      e.preventDefault();
      ui.bug = null; ui.booking = null; ui.authModal = false; ui.filterModal = false;
      renderModal();
      return;
    }
    if (ui.bug || ui.booking || ui.authModal || ui.filterModal) return;
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
  document.addEventListener("pointermove", (e) => {
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

  // ---------- запуск ----------
  readHash();
  readQueryError();
  render();
  initData();
  initCaps();
})();
