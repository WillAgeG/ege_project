/* Базовые утилиты интерфейса, дат, строк и чистых преобразований данных. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});

  const $ = (sel) => document.querySelector(sel);

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => (
      { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
    ));
  }

  function rich(s) {
    return esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }

  function clone(o) {
    return o == null ? o : JSON.parse(JSON.stringify(o));
  }

  function isObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  // Семантика слияния объектов, совместимая с patch-обновлениями хранилища.
  function deepMerge(target, patch) {
    const out = isObj(target) ? Object.assign({}, target) : {};
    for (const k of Object.keys(patch || {})) {
      const v = patch[k];
      out[k] = isObj(v) ? deepMerge(isObj(out[k]) ? out[k] : {}, v) : v;
    }
    return out;
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function isoDate(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  function todayISO() {
    return isoDate(new Date());
  }

  function parseISO(s) {
    const p = String(s).split("-").map(Number);
    return new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }

  function addDays(iso, n) {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return isoDate(d);
  }

  function daysUntil(iso) {
    return Math.round((parseISO(iso) - parseISO(todayISO())) / 86400000);
  }

  function validISO(s) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
  }

  const fmtLong = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  const fmtDay = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });
  const fmtShort = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
  const fmtWeekday = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" });

  function dateLong(iso) {
    return fmtLong.format(parseISO(iso)).replace(/\s?г\.$/, "");
  }

  function dateDay(iso) {
    return parseISO(iso).getFullYear() === new Date().getFullYear()
      ? fmtDay.format(parseISO(iso))
      : dateLong(iso);
  }

  function dateShort(iso) {
    return fmtShort.format(parseISO(iso)).replace(".", "");
  }

  function plural(n, one, few, many) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return many;
    if (b > 1 && b < 5) return few;
    if (b === 1) return one;
    return many;
  }

  function days(n) {
    return n + " " + plural(n, "день", "дня", "дней");
  }

  function minutesText(m) {
    m = Math.round(m || 0);
    if (m < 60) return m + " мин";
    const h = Math.floor(m / 60), r = m % 60;
    return h + " ч" + (r ? " " + r + " мин" : "");
  }

  function capitalize(s) {
    return s ? s[0].toUpperCase() + s.slice(1) : s;
  }

  function newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function range(n) {
    return Array.from({ length: n }, (_, i) => i);
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i];
      a[i] = a[j];
      a[j] = t;
    }
    return a;
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function clampInt(v, lo, hi, def) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def;
  }

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[«»"]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/[.!]+$/, "");
  }

  function normTight(s) {
    return norm(s).replace(/,/g, ".").replace(/[\s\-–—]/g, "").replace(/%$/, "");
  }

  function parseNum(s) {
    const m = String(s == null ? "" : s).replace(/,/g, ".").replace(/−/g, "-").match(/[-+]?\d+(?:\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }

  function byDue(a, b) {
    return (a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0;
  }

  function initials(name) {
    const s = String(name || "").trim();
    if (!s) return "В";
    const parts = s.split(/\s+/).filter(Boolean);
    return (parts.length > 1 ? parts[0][0] + parts[1][0] : s.slice(0, 2)).toUpperCase();
  }

  function scrollToEl(targetId) {
    if (!targetId || typeof document.getElementById !== "function") return;
    const node = document.getElementById(targetId);
    if (node && typeof node.scrollIntoView === "function") {
      node.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  EGE.utils = {
    $,
    esc,
    rich,
    clone,
    isObj,
    deepMerge,
    pad,
    isoDate,
    todayISO,
    parseISO,
    addDays,
    daysUntil,
    validISO,
    fmtLong,
    fmtDay,
    fmtShort,
    fmtWeekday,
    dateLong,
    dateDay,
    dateShort,
    plural,
    days,
    minutesText,
    capitalize,
    newId,
    range,
    shuffle,
    sleep,
    clampInt,
    norm,
    normTight,
    parseNum,
    byDue,
    initials,
    scrollToEl
  };
})();
