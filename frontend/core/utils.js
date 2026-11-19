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

  const WEEK_DAYS_RU = [
    { dow: 1, short: "Пн", acc: "в понедельник" },
    { dow: 2, short: "Вт", acc: "во вторник" },
    { dow: 3, short: "Ср", acc: "в среду" },
    { dow: 4, short: "Чт", acc: "в четверг" },
    { dow: 5, short: "Пт", acc: "в пятницу" },
    { dow: 6, short: "Сб", acc: "в субботу" },
    { dow: 0, short: "Вс", acc: "в воскресенье" }
  ];
  const SCHED_HOURS_RU = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00", "21:00", "22:00", "23:00"];

  function sortDows(dows) {
    const order = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 };
    const uniq = [];
    (Array.isArray(dows) ? dows : []).forEach((x) => {
      const n = Number(x);
      if (Number.isInteger(n) && n >= 0 && n <= 6 && !uniq.includes(n)) uniq.push(n);
    });
    return uniq.sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9));
  }

  function formatDaysShort(dows) {
    const sorted = sortDows(dows);
    if (!sorted.length) return "не выбрано";
    if (sorted.length === 7) return "Ежедневно (Пн–Вс)";
    return sorted.map((d) => {
      const hit = WEEK_DAYS_RU.find((x) => x.dow === d);
      return hit ? hit.short : "";
    }).filter(Boolean).join(", ");
  }

  function formatWeeklyBotPhrase(dows, hour, weekly) {
    const sorted = sortDows(dows);
    const h = String(hour || "16:00");
    if (!sorted.length) return `в ${h}${weekly !== false ? " каждую неделю" : ""}`;
    if (sorted.length === 7) return `в ${h} каждый день`;
    const first = WEEK_DAYS_RU.find((x) => x.dow === sorted[0]);
    const dayPart = sorted.length === 1
      ? (first ? first.acc : "")
      : (() => {
          const rest = sorted.slice(1).map((dow) => {
            const hit = WEEK_DAYS_RU.find((x) => x.dow === dow);
            return hit ? hit.acc.replace(/^во?\s+/i, "") : "";
          }).filter(Boolean);
          const tail = rest.pop();
          return `${first ? first.acc : ""}${rest.length ? ", " + rest.join(", ") : ""} и ${tail}`;
        })();
    return `в ${h} ${dayPart}${weekly !== false ? " каждую неделю" : ""}`.trim();
  }

  function readResizedPhotoFile(file, opts, onDone, onInvalid) {
    if (!file) return false;
    if (!file.type || file.type.indexOf("image/") !== 0) {
      if (typeof onInvalid === "function") onInvalid();
      return false;
    }
    const maxDim = (opts && opts.maxDim) || 240;
    const quality = (opts && opts.quality) || 0.84;
    const maxLen = (opts && opts.maxLen) || 350000;
    const reader = new FileReader();
    reader.onload = () => {
      const rawData = typeof reader.result === "string" ? reader.result : "";
      if (!rawData || typeof onDone !== "function") return;
      if (typeof Image === "function" && typeof document !== "undefined" && typeof document.createElement === "function") {
        const img = new Image();
        img.onload = () => {
          try {
            const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
            const w = Math.max(1, Math.round((img.width || maxDim) * scale));
            const h = Math.max(1, Math.round((img.height || maxDim) * scale));
            const cvs = document.createElement("canvas");
            cvs.width = w;
            cvs.height = h;
            const ctx2d = cvs.getContext("2d");
            if (ctx2d) {
              ctx2d.drawImage(img, 0, 0, w, h);
              onDone(cvs.toDataURL("image/jpeg", quality));
              return;
            }
          } catch (e) { /* используем исходный dataURL */ }
          onDone(rawData.slice(0, maxLen));
        };
        img.onerror = () => onDone(rawData.slice(0, maxLen));
        img.src = rawData;
      } else {
        onDone(rawData.slice(0, maxLen));
      }
    };
    reader.readAsDataURL(file);
    return true;
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
    scrollToEl,
    WEEK_DAYS_RU,
    SCHED_HOURS_RU,
    sortDows,
    formatDaysShort,
    formatWeeklyBotPhrase,
    readResizedPhotoFile
  };
})();
