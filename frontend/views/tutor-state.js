/* Общее состояние, синхронизация и утилиты кабинета преподавателя (EGE._tutorCab). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural, initials } = EGE.utils || { esc: (s) => String(s || ""), plural: (n, a) => a, initials: () => "П" };
  const { icon, sakhaPatternSVG, sakhaOhyorHTML } = EGE.ui || { icon: () => "", sakhaPatternSVG: () => "", sakhaOhyorHTML: () => "" };
  const { priceHeadlineHTML, priceDiffTagsHTML, feeSplitHTML, hhSelectHTML, hhMultiSelectHTML, tutorAvatarHTML } = EGE.hh || { priceHeadlineHTML: () => "", priceDiffTagsHTML: () => "", feeSplitHTML: () => "", hhSelectHTML: null, hhMultiSelectHTML: null, tutorAvatarHTML: null };

  const TC_LS_KEY = "vektor-ege:tutor-cabinet";
  const DAY_MS = 24 * 60 * 60 * 1000;
  const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
  const PAY_REMIND_COOLDOWN_MS = 10 * 60 * 1000;
  const PAY_REMIND_ANIM_MS = 2200;
  const DAY_LIST = [
    { dow: "1", wd: "Пн", full: "Понедельник" },
    { dow: "2", wd: "Вт", full: "Вторник" },
    { dow: "3", wd: "Ср", full: "Среда" },
    { dow: "4", wd: "Чт", full: "Четверг" },
    { dow: "5", wd: "Пт", full: "Пятница" },
    { dow: "6", wd: "Сб", full: "Суббота" },
    { dow: "0", wd: "Вс", full: "Воскресенье" }
  ];
  const EXAM_OPTIONS = ["ЕГЭ", "ОГЭ", "ДВИ / Олимпиады"];
  const FORMAT_OPTIONS = ["Онлайн", "Очно"];
  const CITY_OPTIONS = ["Якутск", "Москва"];
  const TZ_OPTIONS = [
    { id: "UTC+9", label: "Якутск (UTC+9)" },
    { id: "UTC+3", label: "Москва (UTC+3)" }
  ];
  const WA_LEAD_OPTIONS = [
    { id: "24h", label: "За 24 часа" },
    { id: "1h", label: "За 1 час" },
    { id: "15m", label: "За 15 мин" }
  ];
  const DEFAULT_WA_LEADS = ["24h", "1h"];
  const AUTO_CHANNELS = [
    { id: "wa", short: "WA", name: "WhatsApp" },
    { id: "tg", short: "TG", name: "Telegram" },
    { id: "max", short: "MAX", name: "MAX" }
  ];
  const AUTO_BUMP_HOURS = ["09:00", "14:00", "19:00"];
  const GOAL_PRESETS = [40000, 60000, 90000, 120000];
  const QUICK_TEMPLATES = [
    {
      id: "tpl-accept",
      title: "Принять ставку и скинуть ссылку",
      build: (p) => `Здравствуйте! Подтверждаю занятие по ставке ${p.price.toLocaleString("ru-RU")} ₽/ч. За 10 минут до старта пришлю ссылку и разбор первой темы.`
    },
    {
      id: "tpl-counter",
      title: "Вежливый встречный торг ±50 ₽",
      build: (p) => `Добрый день! На это время у меня высокий спрос, готов(а) провести урок за ${Math.max(p.minFair, p.price - 100).toLocaleString("ru-RU")} ₽/ч — в стоимость уже входят проверка ДЗ и конспекты ФИПИ.`
    },
    {
      id: "tpl-parent",
      title: "Краткий отчёт после урока",
      build: (p) => `Итоги занятия (${p.headline || "подготовка"}): разобрали типовые ошибки второй части, закрепили ключевой блок и выдали домашку к следующему слоту.`
    }
  ];

  const DEFAULT_REQUESTS = [
    {
      id: "tc-req-1",
      studentName: "Алина С.",
      exam: "ЕГЭ",
      subjectName: "Биология",
      format: "Онлайн",
      dow: "6",
      dayLabel: "Сб, 14 нояб.",
      hour: "16:00",
      offerPrice: 1100,
      counterPrice: 1100,
      tutorPrice: 1200,
      marketPrice: 1550,
      note: "Нужен разбор второй части ФИПИ: митоз, мейоз и задачи по генетике №28.",
      status: "pending",
      createdLabel: "12 мин назад"
    },
    {
      id: "tc-req-2",
      studentName: "Тимур К.",
      exam: "ЕГЭ",
      subjectName: "Химия",
      format: "Онлайн",
      dow: "0",
      dayLabel: "Вс, 15 нояб.",
      hour: "14:00",
      offerPrice: 1500,
      counterPrice: 1500,
      tutorPrice: 1200,
      marketPrice: 1400,
      note: "Готов доплатить за быстрый интенсив по сложной задаче №34 на смеси и олеум.",
      status: "pending",
      createdLabel: "28 мин назад"
    },
    {
      id: "tc-req-3",
      studentName: "Дарья В.",
      exam: "ОГЭ",
      subjectName: "Русский язык",
      format: "Онлайн",
      dow: "1",
      dayLabel: "Пн, 16 нояб.",
      hour: "18:00",
      offerPrice: 1200,
      counterPrice: 1200,
      tutorPrice: 1200,
      marketPrice: 1450,
      note: "Регулярные занятия раз в неделю по тестовой части и изложению.",
      schedulePlan: {
        status: "sent_to_tutor",
        dows: [3, 4],
        hour: "16:00",
        weekly: true,
        botText: "в 16:00 в среду и четверг каждую неделю"
      },
      status: "accepted",
      createdLabel: "Вчера"
    }
  ];

  const DEFAULT_STUDENTS = [
    { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", startScore: 58, curScore: 76, targetScore: 88, lessonsDone: 6, hw: "Линия №28 (сцепление генов) — сдать до Сб", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio", maxHandle: "alina_bio", autoNotify: true, autoChannels: ["wa", "tg", "max"], autoLeads: ["24h", "1h"], lastRemindedAt: 0 },
    { id: "st-darya", name: "Дарья В.", exam: "ОГЭ · Русский", startScore: 22, curScore: 31, targetScore: 36, lessonsDone: 4, hw: "Синтаксис и сжатое изложение — вариант №4", lessonDay: "Понедельник", lessonTime: "18:00", whatsapp: "+7 (914) 210-05-12", telegram: "+7 (914) 210-05-12", autoNotify: false, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 },
    { id: "st-timur", name: "Тимур К.", exam: "ЕГЭ · Химия", startScore: 64, curScore: 81, targetScore: 92, lessonsDone: 8, hw: "№34 на олеум и массовую долю — 5 задач", lessonDay: "Суббота", lessonTime: "16:00", whatsapp: "+7 (914) 210-05-13", telegram: "@timur_chem", autoNotify: true, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 },
    { id: "st-elena", name: "Елена М.", exam: "ЕГЭ · Биология", status: "past", endedLabel: "Октябрь 2026 · курс завершён", rate: 1200, earnedRub: 20304, startScore: 54, curScore: 89, targetScore: 85, lessonsDone: 18, hw: "Курс ЕГЭ по биологии успешно завершён", lessonDay: "Среда", lessonTime: "15:00", whatsapp: "+7 (914) 210-05-14", telegram: "@elena_med", autoNotify: false, autoChannels: ["wa", "tg"], lastRemindedAt: 0 }
  ];

  const DEMO_REQ_IDS = new Set(["tc-req-1", "tc-req-2", "tc-req-3"]);
  const DEMO_STUDENT_IDS = new Set(["st-alina", "st-darya", "st-timur", "st-elena"]);
  const DEMO_PAYOUT_IDS = new Set(["out-seed-1"]);
  const DEMO_PROFILE_DEFAULTS = {
    name: "Анна Соколова",
    headline: "Эксперт ЕГЭ и ОГЭ · Подготовка к медвузу",
    whatsapp: "+7 (914) 210-01-99",
    whatsappAlt: "79142100199",
    studentPhoneAlt: "79142100511",
    telegram: "@anna_sokolova_ege",
    education: "СВФУ им. М.К. Аммосова · Педагог-исследователь",
    customSkills: "Задания ФИПИ 2027, №28 Генетика, разбор пробников, медвуз",
    bio: "Экспертная подготовка без шаблонов: разбираем задания ФИПИ, ловушки второй части и пишем пробники на 85+.",
    card: "2200 7004 8210 4419",
    bank: "АЭБ (Алмазэргиэнбанк)",
    icsUrl: "/api/calendar/anna-sokolova.ics"
  };
  const DEMO_SLOTS = {
    "1": ["14:00", "16:00", "19:00"],
    "2": ["10:00", "18:00"],
    "3": ["12:00", "16:00", "20:00"],
    "4": ["15:00", "18:00"],
    "5": ["10:00", "14:00", "19:00"],
    "6": ["10:00", "12:00", "16:00", "18:00"],
    "0": ["11:00", "15:00"]
  };
  const RU_MONTHS_SHORT = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];

  let _ctx = {};
  let _cache = null;
  let _demoMode = !(root.EGE_HOST && root.EGE_HOST.demoMode === false);
  let _inFlightHydrate = null;
  let _countdownTimer = null;
  let _rtUnsub = null;
  const _payRemindAnim = Object.create(null);

  const SAMPLE_GCAL_ICS = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Google Inc//Google Calendar 70.9054//EN",
    "BEGIN:VEVENT",
    "UID:gcal-sample-wed@google.com",
    "DTSTAMP:20261115T070000Z",
    "DTSTART:20261118T070000Z",
    "DTEND:20261118T080000Z",
    "SUMMARY:Google Calendar · Методический созвон (07:00 UTC)",
    "END:VEVENT",
    "BEGIN:VEVENT",
    "UID:gcal-sample-sat@google.com",
    "DTSTAMP:20261115T070000Z",
    "DTSTART:20261121T070000Z",
    "DTEND:20261121T080000Z",
    "SUMMARY:Google Calendar · Внешнее занятие (07:00 UTC)",
    "END:VEVENT",
    "END:VCALENDAR"
  ].join("\r\n");

  function getTutorSlug(st) {
    const p = (st && st.profile) || {};
    const directId = String(p.id || p.slug || "").trim();
    if (directId) return directId;
    if (EGE.kit && typeof EGE.kit.entitySlug === "function") {
      return EGE.kit.entitySlug({ slug: p.slug, name: p.name || "tutor" });
    }
    return String(p.name || "tutor").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "tutor-demo";
  }

  function applyRtEventToCabinet(evt) {
    if (!evt) return;
    if (evt.eventType === "market.bid.created") {
      const p = evt.payload || {};
      const st = tState();
      const rawId = String(p.bookingId || p.id || evt.id || Date.now());
      const mktState = typeof _ctx.mkt === "function" ? _ctx.mkt() : null;
      const mktBookings = (mktState && Array.isArray(mktState.bookings)) ? mktState.bookings : [];
      const inMarket = isDevDemoMode() && mktBookings.some((b) => String(b.id) === rawId);
      const mapped = p.booking
        ? mapServerBookingToRequest(p.booking, st)
        : {
            id: isDevDemoMode() ? ("rt-" + rawId) : rawId,
            serverId: p.bookingId ? String(p.bookingId) : "",
            mktId: rawId,
            studentName: p.studentName || "Заявка ученика (Live)",
            exam: p.exam || "ЕГЭ",
            subjectName: p.subjectName || "Подготовка",
            format: p.format || "Онлайн",
            dow: p.dow != null ? String(p.dow) : dayDowFromLabel(p.dayLabel),
            dayIso: p.dayIso || "",
            dayLabel: p.dayLabel || "Ближайший слот",
            hour: p.hour || "14:00",
            offerPrice: p.offerPrice != null ? Number(p.offerPrice) : st.profile.price,
            counterPrice: p.counterPrice != null ? Number(p.counterPrice) : (p.offerPrice != null ? Number(p.offerPrice) : st.profile.price),
            tutorPrice: Number(p.tutorPrice) || st.profile.price,
            marketPrice: Math.round((Number(p.tutorPrice) || st.profile.price) * 1.28),
            note: p.note || evt.message || "Новая ставка с витрины /market",
            status: "pending",
            createdLabel: "Live · только что"
          };
      const reqId = String(mapped.id);
      const exists = (st.requests || []).some((r) => r && (r.id === reqId || String(r.serverId || "") === rawId || String(r.mktId || "") === rawId));
      if (!inMarket && !exists) {
        st.requests = st.requests || [];
        st.requests.unshift(mapped);
        saveState();
      }
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(evt.title || "Новая ставка от ученика", evt.message || "Проверьте вкладку «Заявки»", { inbox: true });
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
    }
    if (evt.eventType === "market.telemost.updated") {
      const p = evt.payload || {};
      const bkId = String(p.bookingId || "").trim();
      const nextUrl = String(p.telemostUrl || "").trim();
      const st = _cache || tState();
      if (st && Array.isArray(st.requests) && bkId) {
        let changed = false;
        st.requests.forEach((r) => {
          if (r && (String(r.id) === bkId || String(r.serverId || "") === bkId || String(r.mktId || "") === bkId)) {
            if (r.telemostUrl !== nextUrl) {
              r.telemostUrl = nextUrl;
              changed = true;
            }
          }
        });
        if (changed) {
          saveState();
          if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        }
      }
    }
    if (!isDevDemoMode() && /^(market\.bid\.|market\.lesson\.completed|payments\.payout\.|payments\.npd\.)/.test(String(evt.eventType || ""))) {
      hydrateFromBackend({ force: true });
    }
  }

  function ensureRealtimeConnected() {
    if (!EGE.realtime) return;
    if (!_rtUnsub && typeof EGE.realtime.onEvent === "function") {
      _rtUnsub = EGE.realtime.onEvent(applyRtEventToCabinet);
    }
    if (typeof EGE.realtime.connect === "function") {
      const st = _cache;
      const slug = st ? getTutorSlug(st) : "";
      const cur = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState() : null;
      if (!cur || cur.channel !== "tutor" || (slug && cur.tutorSlug !== slug)) {
        EGE.realtime.connect({ channel: "tutor", tutorSlug: slug });
      }
    }
  }

  function syncTutorCalendar(st) {
    if (!EGE.realtime || typeof EGE.realtime.syncCalendar !== "function") return null;
    st = st || tState();
    const lessons = syncedRequests().filter((r) => r.status === "accepted");
    const prom = EGE.realtime.syncCalendar({
      tutorSlug: getTutorSlug(st),
      tutorName: st.profile.name,
      city: st.profile.city,
      timezone: st.profile.timezone,
      openSlots: mergeAllProfileSlots(st),
      lessons
    });
    const rtCal = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState().calendar : null;
    if (rtCal) {
      st.calendarSync = Object.assign({}, st.calendarSync || {}, {
        icsUrl: rtCal.icsUrl,
        googleSubscribeUrl: rtCal.googleSubscribeUrl,
        googleTemplateUrl: rtCal.googleTemplateUrl,
        eventCount: rtCal.eventCount,
        lastSyncAt: Date.now()
      });
    }
    if (prom && typeof prom.then === "function") {
      prom.then((res) => {
        if (res && res.ok) {
          const curSt = tState();
          curSt.calendarSync = Object.assign({}, curSt.calendarSync || {}, {
            icsUrl: res.icsUrl || curSt.calendarSync.icsUrl,
            googleSubscribeUrl: res.googleSubscribeUrl || curSt.calendarSync.googleSubscribeUrl,
            googleTemplateUrl: res.googleTemplateUrl || curSt.calendarSync.googleTemplateUrl,
            eventCount: res.eventCount != null ? Number(res.eventCount) : curSt.calendarSync.eventCount,
            busySlots: Array.isArray(res.busySlots) ? res.busySlots : curSt.calendarSync.busySlots,
            conflicts: Array.isArray(res.conflicts) ? res.conflicts : curSt.calendarSync.conflicts,
            lastSyncAt: Date.now()
          });
          saveState();
        }
      }).catch(() => {});
    }
    return prom;
  }

  function publishRtUpdate(eventType, title, message, payload) {
    if (!EGE.realtime || typeof EGE.realtime.publish !== "function") return null;
    const st = tState();
    return EGE.realtime.publish({
      channel: "tutor",
      eventType,
      title,
      message,
      tutorSlug: getTutorSlug(st),
      payload: payload || {},
      silent: true
    });
  }

  function configure(ctx) {
    _ctx = ctx || {};
    if (!isDevDemoMode() && _cache) {
      sanitizeProdState(_cache);
    }
    ensureRealtimeConnected();
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
  }

  function isDevDemoMode() {
    if (_demoMode === false) return false;
    if (typeof _ctx.isDevDemoMode === "function" && !_ctx.isDevDemoMode()) return false;
    const st = _ctx && _ctx.store;
    if (st && st.demoMode === false) return false;
    if (root.EGE_HOST && root.EGE_HOST.demoMode === false) return false;
    return true;
  }

  function setDemoMode(enabled) {
    _demoMode = !!enabled;
    if (!_demoMode && _cache) {
      sanitizeProdState(_cache);
      saveState();
    }
    return _demoMode;
  }

  function formatPhone(raw) {
    const TDATA = getTDATA();
    const fn = (TDATA && TDATA.formatPhoneMask) || (EGE.kit && EGE.kit.formatPhoneMask);
    return typeof fn === "function" ? fn(raw) : String(raw || "");
  }

  function formatTelegram(raw) {
    const TDATA = getTDATA();
    const fn = (TDATA && TDATA.formatTelegramContact) || (EGE.kit && EGE.kit.formatTelegramContact);
    return typeof fn === "function" ? fn(raw) : String(raw || "");
  }

  const MIN_PAYOUT_RUB = 500;
  const PAYOUT_BANKS = ["Сбербанк", "Т-Банк", "Альфа-Банк", "ВТБ", "АЭБ (Алмазэргиэнбанк)"];
  const SBP_BANK_IDS = {
    "Сбербанк": "100000000111",
    "Т-Банк": "100000000004",
    "Альфа-Банк": "100000000008",
    "ВТБ": "100000000005",
    "АЭБ (Алмазэргиэнбанк)": "100000000078"
  };

  function validateInn12(raw) {
    const clean = String(raw || "").replace(/\D+/g, "");
    if (clean.length !== 12) return { valid: false, inn: clean };
    const d = clean.split("").map((ch) => Number(ch));
    const w11 = [7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    const w12 = [3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8];
    let s11 = 0;
    for (let i = 0; i < 10; i++) s11 += d[i] * w11[i];
    const c11 = (s11 % 11) % 10;
    let s12 = 0;
    for (let i = 0; i < 11; i++) s12 += d[i] * w12[i];
    const c12 = (s12 % 11) % 10;
    return { valid: d[10] === c11 && d[11] === c12, inn: clean };
  }

  function formatCardMask(raw) {
    const digits = String(raw || "").replace(/\D+/g, "").slice(0, 16);
    if (!digits) return "";
    return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
  }

  function normalizeChannelList(arr) {
    const allowed = new Set(["wa", "tg", "max"]);
    const list = Array.isArray(arr) ? arr.filter((x) => allowed.has(x)) : [];
    return list.length ? Array.from(new Set(list)) : ["wa", "tg", "max"];
  }

  function copyStr(txt) {
    if (!txt) return;
    if (typeof _ctx.copyText === "function") {
      _ctx.copyText(txt);
      return;
    }
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(txt);
      }
    } catch (e) { /* игнор */ }
  }

  function formatTimestamp(ts) {
    const n = Number(ts) || 0;
    if (!n) return "ещё не запускалось";
    const d = new Date(n);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const now = new Date();
    const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (sameDay) return `сегодня в ${hh}:${mm}`;
    const months = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
    return `${d.getDate()} ${months[d.getMonth()]} в ${hh}:${mm}`;
  }

  function emptySlotsMap() {
    return { "1": [], "2": [], "3": [], "4": [], "5": [], "6": [], "0": [] };
  }

  function cloneDemoSlots() {
    const out = {};
    Object.keys(DEMO_SLOTS).forEach((k) => { out[k] = DEMO_SLOTS[k].slice(); });
    return out;
  }

  function slotsEqual(a, b) {
    if (!a || !b) return false;
    for (let i = 0; i < DAY_LIST.length; i++) {
      const k = DAY_LIST[i].dow;
      const arrA = Array.isArray(a[k]) ? a[k] : [];
      const arrB = Array.isArray(b[k]) ? b[k] : [];
      if (arrA.length !== arrB.length) return false;
      for (let j = 0; j < arrA.length; j++) {
        if (arrA[j] !== arrB[j]) return false;
      }
    }
    return true;
  }

  function normalizeSlotsMap(raw) {
    const out = emptySlotsMap();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
    Object.keys(out).forEach((k) => {
      const src = Array.isArray(raw[k]) ? raw[k] : (Array.isArray(raw[Number(k)]) ? raw[Number(k)] : []);
      const uniq = new Set();
      src.forEach((h) => {
        const clean = String(h == null ? "" : h).trim();
        if (clean) uniq.add(clean);
      });
      out[k] = Array.from(uniq).sort();
    });
    return out;
  }

  function countSlots(slots) {
    if (!slots || typeof slots !== "object") return 0;
    return Object.keys(slots).reduce((sum, k) => sum + (Array.isArray(slots[k]) ? slots[k].length : 0), 0);
  }

  function mergeAllProfileSlots(st) {
    const out = emptySlotsMap();
    const spList = st && Array.isArray(st.searchProfiles) ? st.searchProfiles : [];
    const sources = spList.length
      ? spList.map((sp) => sp && sp.slots)
      : [st && st.newProfileDraft && st.newProfileDraft.slots, st && st.slots];
    Object.keys(out).forEach((k) => {
      const merged = new Set();
      sources.forEach((srcMap) => {
        if (!srcMap || typeof srcMap !== "object") return;
        const arr = Array.isArray(srcMap[k]) ? srcMap[k] : (Array.isArray(srcMap[Number(k)]) ? srcMap[Number(k)] : []);
        arr.forEach((h) => {
          const clean = String(h == null ? "" : h).trim();
          if (clean) merged.add(clean);
        });
      });
      out[k] = Array.from(merged).sort();
    });
    return out;
  }

  function formatIsoShort(iso) {
    const raw = String(iso || "").trim();
    if (!raw) return "";
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime())) return "";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${RU_MONTHS_SHORT[d.getMonth()]}, ${hh}:${mm}`;
  }

  function sanitizeAccount(acc, realDisplayName, realAvatarUrl, allowDemo) {
    const a = (acc && typeof acc === "object") ? acc : {};
    if (!allowDemo) {
      if (a.name === DEMO_PROFILE_DEFAULTS.name && realDisplayName !== DEMO_PROFILE_DEFAULTS.name) {
        a.name = realDisplayName || "";
      }
      const waDigits = String(a.whatsapp || "").replace(/\D+/g, "");
      if (a.whatsapp === DEMO_PROFILE_DEFAULTS.whatsapp || waDigits === DEMO_PROFILE_DEFAULTS.whatsappAlt || waDigits === DEMO_PROFILE_DEFAULTS.studentPhoneAlt) {
        a.whatsapp = "";
      }
      if (a.telegram === DEMO_PROFILE_DEFAULTS.telegram) a.telegram = "";
      if (!a.photo && a.hasPhoto !== false && realAvatarUrl) a.photo = realAvatarUrl;
    }
    a.city = CITY_OPTIONS.find((c) => String(a.city || "").indexOf(c) >= 0) || "Якутск";
    a.timezone = a.city === "Москва" ? "UTC+3" : "UTC+9";
    if (a.hasPhoto === false) a.photo = "";
    a.hasPhoto = a.hasPhoto != null ? !!a.hasPhoto : Boolean(String(a.photo || "").trim());
    a.whatsapp = a.whatsapp ? formatPhone(a.whatsapp) : "";
    a.telegram = a.telegram ? formatTelegram(a.telegram) : "";
    a.maxHandle = typeof a.maxHandle === "string" ? a.maxHandle : "";
    a.vk = typeof a.vk === "string" ? a.vk : "";
    return a;
  }

  function sanitizeSearchProfileObj(p, isServerProf) {
    if (!p || typeof p !== "object") return p;
    if (!isServerProf) {
      if (p.headline === DEMO_PROFILE_DEFAULTS.headline) p.headline = "";
      if (p.education === DEMO_PROFILE_DEFAULTS.education) p.education = "";
      if (p.customSkills === DEMO_PROFILE_DEFAULTS.customSkills) p.customSkills = "";
      if (p.bio === DEMO_PROFILE_DEFAULTS.bio) p.bio = "";
      if (Array.isArray(p.customBadges) && p.customBadges[0] === "Эксперт жюри ВсОШ" && !p.customBadges[1]) {
        p.customBadges = ["", ""];
      }
      if (p.avgScore === 86) p.avgScore = 0;
      if (p.highScorers === 14) p.highScorers = 0;
      if (p.expYears === 6) p.expYears = 1;
    }
    p.slots = normalizeSlotsMap(p.slots);
    if (!isServerProf && slotsEqual(p.slots, DEMO_SLOTS)) {
      p.slots = emptySlotsMap();
    }
    return p;
  }

  function createEmptySearchProfile(acc, seed) {
    acc = (acc && typeof acc === "object") ? acc : {};
    seed = (seed && typeof seed === "object") ? seed : {};
    const subjIds = Array.isArray(seed.subjects) && seed.subjects.length
      ? seed.subjects.filter(Boolean).slice(0, 8)
      : (seed.subject ? [String(seed.subject)] : ["bio"]);
    const basePrice = Math.max(100, Number(seed.price != null ? seed.price : seed.baseRateRub) || 1200);
    const rawMinFair = Number(seed.minFair);
    const minFair = Number.isFinite(rawMinFair) && rawMinFair > 0
      ? Math.max(400, Math.min(basePrice, rawMinFair))
      : Math.max(400, Math.round((basePrice * 0.85) / 50) * 50);
    const rawBadges = Array.isArray(seed.customBadges) ? seed.customBadges.slice(0, 2) : ["", ""];
    while (rawBadges.length < 2) rawBadges.push("");
    const guarantee = seed.firstLessonGuarantee !== undefined
      ? (seed.firstLessonGuarantee !== false)
      : (seed.trialMode ? seed.trialMode === "free" : true);
    const hasAccPhoto = acc.hasPhoto != null ? !!acc.hasPhoto : Boolean(acc.photo);
    const city = CITY_OPTIONS.find((c) => String(seed.city || acc.city || "").indexOf(c) >= 0) || "Якутск";
    const timezone = city === "Москва" ? "UTC+3" : "UTC+9";
    return {
      id: String(seed.id || ""),
      name: String(acc.name || seed.name || ""),
      photo: hasAccPhoto ? String(acc.photo || seed.photo || "") : "",
      hasPhoto: hasAccPhoto,
      city,
      timezone,
      whatsapp: acc.whatsapp != null ? String(acc.whatsapp) : String(seed.whatsapp || ""),
      telegram: acc.telegram != null ? String(acc.telegram) : String(seed.telegram || ""),
      maxHandle: acc.maxHandle != null ? String(acc.maxHandle) : String(seed.maxHandle || ""),
      vk: acc.vk != null ? String(acc.vk) : String(seed.vk || ""),
      headline: String(seed.headline || ""),
      subject: subjIds[0] || "bio",
      subjects: subjIds,
      customBadges: [String(rawBadges[0] || ""), String(rawBadges[1] || "")],
      exams: Array.isArray(seed.exams) && seed.exams.length ? seed.exams.slice() : ["ЕГЭ"],
      formats: Array.isArray(seed.formats) && seed.formats.length ? seed.formats.slice() : ["Онлайн"],
      education: String(seed.education || ""),
      expYears: Math.max(1, Number(seed.expYears) || 1),
      avgScore: Number(seed.avgScore) || 0,
      highScorers: Number(seed.highScorers) || 0,
      firstLessonGuarantee: guarantee,
      trialMode: guarantee ? "free" : "none",
      trialPrice: guarantee ? 0 : null,
      trialFree: guarantee,
      customSkills: String(seed.customSkills || ""),
      price: basePrice,
      minFair,
      bio: String(seed.bio || ""),
      slots: seed.slots && typeof seed.slots === "object" ? normalizeSlotsMap(seed.slots) : emptySlotsMap(),
      published: seed.published !== false,
      verified: !!seed.verified,
      bumpedToday: !!seed.bumpedToday,
      lastBumpedAt: String(seed.lastBumpedAt || ""),
      updatedAt: String(seed.updatedAt || ""),
      rating: seed.rating != null ? Number(seed.rating) : 4.9,
      reviewsCount: seed.reviewsCount != null ? Number(seed.reviewsCount) : 0
    };
  }

  function getEditingSearchProfile(st) {
    if (!st) return createEmptySearchProfile({}, {});
    if (st.creatingSearchProfile) {
      if (!st.newProfileDraft || typeof st.newProfileDraft !== "object") {
        st.newProfileDraft = createEmptySearchProfile(st.account, { published: true });
      }
      return st.newProfileDraft;
    }
    const list = Array.isArray(st.searchProfiles) ? st.searchProfiles : [];
    const hit = list.find((item) => item && item.id && item.id === st.activeSearchProfileId) || list[0] || null;
    if (hit) {
      st.activeSearchProfileId = String(hit.id || "");
      return hit;
    }
    if (!st.newProfileDraft || typeof st.newProfileDraft !== "object") {
      st.newProfileDraft = createEmptySearchProfile(st.account, { published: true });
    }
    return st.newProfileDraft;
  }

  function syncProfileMirror(st) {
    if (!st || typeof st !== "object") return st;
    if (!st.account || typeof st.account !== "object") {
      st.account = sanitizeAccount(st.profile || {}, "", "", isDevDemoMode());
    }
    const acc = st.account;
    const accHasPhoto = acc.hasPhoto != null ? !!acc.hasPhoto : Boolean(acc.photo);
    const applyAccFields = (sp) => {
      if (!sp || typeof sp !== "object") return;
      sp.name = String(acc.name || "");
      sp.hasPhoto = accHasPhoto;
      sp.photo = accHasPhoto ? String(acc.photo || "") : "";
      sp.city = CITY_OPTIONS.find((c) => String(acc.city || "").indexOf(c) >= 0) || "Якутск";
      sp.timezone = TZ_OPTIONS.some((t) => t.id === acc.timezone)
        ? acc.timezone
        : (sp.city === "Москва" ? "UTC+3" : "UTC+9");
      sp.whatsapp = String(acc.whatsapp || "");
      sp.telegram = String(acc.telegram || "");
      sp.maxHandle = String(acc.maxHandle || "");
      sp.vk = String(acc.vk || "");
      sp.slots = normalizeSlotsMap(sp.slots);
    };
    if (!Array.isArray(st.searchProfiles)) st.searchProfiles = [];
    st.searchProfiles.forEach(applyAccFields);
    if (st.newProfileDraft) applyAccFields(st.newProfileDraft);
    const active = getEditingSearchProfile(st);
    applyAccFields(active);
    active.slots = normalizeSlotsMap(active.slots);
    st.profile = Object.assign({}, active, { slots: normalizeSlotsMap(active.slots) });
    st.slots = normalizeSlotsMap(active.slots);
    st.published = st.searchProfiles.some((sp) => sp && sp.published !== false);
    return st;
  }

  function sanitizeProdState(st) {
    if (!st || typeof st !== "object") return st;
    const ctxUser = (_ctx && _ctx.store && _ctx.store.user) || null;
    const realDisplayName = ctxUser ? String(ctxUser.displayName || ctxUser.username || "").trim() : "";
    const realAvatarUrl = ctxUser ? String(ctxUser.avatarUrl || "").trim() : "";

    st.requests = Array.isArray(st.requests)
      ? st.requests.filter((r) => r && !DEMO_REQ_IDS.has(String(r.id || "")) && (String(r.id || "").indexOf("mkt-") !== 0 || r.fromServer))
      : [];

    st.students = Array.isArray(st.students)
      ? st.students.filter((s) => s && !DEMO_STUDENT_IDS.has(String(s.id || ""))).map((s) => {
          const copy = Object.assign({}, s);
          const waDigits = String(copy.whatsapp || "").replace(/\D+/g, "");
          if (copy.whatsapp === DEMO_PROFILE_DEFAULTS.whatsapp || waDigits === DEMO_PROFILE_DEFAULTS.studentPhoneAlt || waDigits === DEMO_PROFILE_DEFAULTS.whatsappAlt) {
            copy.whatsapp = "";
          } else if (copy.whatsapp) {
            copy.whatsapp = formatPhone(copy.whatsapp);
          }
          if (copy.telegram === "@alina_bio" || copy.telegram === "@timur_chem") copy.telegram = "";
          copy.autoChannels = normalizeChannelList(copy.autoChannels);
          return copy;
        })
      : [];

    st.payouts = Array.isArray(st.payouts)
      ? st.payouts.filter((p) => p && !DEMO_PAYOUT_IDS.has(String(p.id || "")))
      : [];

    const hasServerRows = Array.isArray(st.searchProfiles) && st.searchProfiles.some((sp) => sp && sp.id && sp.id !== "tc-my-profile");
    if (!hasServerRows) {
      st.searchProfiles = Array.isArray(st.searchProfiles)
        ? st.searchProfiles.filter((sp) => sp && sp.id !== "tc-my-profile")
        : [];
    }
    const p = (st.profile && typeof st.profile === "object") ? st.profile : (st.profile = {});
    const isServerProf = hasServerRows || !!(st.published && p.id && p.id !== "tc-my-profile");
    st.account = sanitizeAccount(st.account || p, realDisplayName, realAvatarUrl, false);
    st.searchProfiles.forEach((sp) => sanitizeSearchProfileObj(sp, isServerProf));
    if (st.newProfileDraft) sanitizeSearchProfileObj(st.newProfileDraft, false);
    sanitizeSearchProfileObj(p, isServerProf);
    syncProfileMirror(st);

    const ps = (st.payoutSettings && typeof st.payoutSettings === "object") ? st.payoutSettings : (st.payoutSettings = {});
    const psPhoneDigits = String(ps.phone || "").replace(/\D+/g, "");
    if (ps.phone === DEMO_PROFILE_DEFAULTS.whatsapp || psPhoneDigits === DEMO_PROFILE_DEFAULTS.whatsappAlt) {
      ps.phone = "";
    }
    if (ps.card === DEMO_PROFILE_DEFAULTS.card || String(ps.card || "").replace(/\s+/g, "") === "2200700482104419") {
      ps.card = "";
    }
    if (ps.bank === DEMO_PROFILE_DEFAULTS.bank && !ps.phone && !ps.inn) {
      ps.bank = "Сбербанк";
    }

    if (!isServerProf && slotsEqual(st.slots, DEMO_SLOTS)) {
      st.slots = emptySlotsMap();
    }
    if (st.calendarSync && st.calendarSync.icsUrl === DEMO_PROFILE_DEFAULTS.icsUrl) {
      st.calendarSync.icsUrl = "";
    }
    if (!isServerProf && st.bumpCount === 7 && !st.lastManualBumpAt) {
      st.bumpCount = 0;
      st.autoBump24h = false;
      st.lastAutoBumpAt = 0;
      st.lastBumpAt = 0;
    }
    return st;
  }

  function defaultState() {
    const demo = isDevDemoMode();
    const profName =
      (typeof _ctx.profile === "function" && _ctx.profile().name) ||
      (_ctx.store && _ctx.store.user && (_ctx.store.user.displayName || _ctx.store.user.username)) ||
      "";
    const ctxAvatar = (_ctx.store && _ctx.store.user && _ctx.store.user.avatarUrl) || "";
    const now = Date.now();
    return {
      tab: "requests",
      filter: "all",
      reqTblCols: 5,
      reqTblQuery: "",
      stTblFilter: "all",
      stTblQuery: "",
      stTblCols: 5,
      leadsTblQuery: "",
      leadsTblCols: 5,
      leadCounterPrices: {},
      activeDow: "6",
      calWeek: 0,
      studentsSubView: "calendar",
      studentsScope: "current",
      expandedStudentId: "",
      calAddHour: "",
      calAddOpen: false,
      calImportOpen: false,
      calImportDraft: "",
      calendarSync: {
        gcalConnected: false,
        icsUrl: demo ? DEMO_PROFILE_DEFAULTS.icsUrl : "",
        googleSubscribeUrl: "",
        googleTemplateUrl: "",
        eventCount: 0,
        busySlots: [],
        conflicts: [],
        lastSyncAt: 0
      },
      statsPeriod: "7d",
      chartStyle: "lollipop",
      monthlyGoal: 60000,
      payoutScope: "all",
      payoutRateOpen: false,
      goalCustomOpen: false,
      feeDetailsOpen: false,
      historyDetailsOpen: false,
      bumpDetailsOpen: false,
      bumpedToday: false,
      autoBump24h: demo,
      autoBumpHour: "09:00",
      lastBumpAt: demo ? (now - 18 * 3600000) : 0,
      lastAutoBumpAt: demo ? (now - 18 * 3600000) : 0,
      lastManualBumpAt: 0,
      bumpCount: demo ? 7 : 0,
      profilePreview: false,
      published: demo,
      subjMenuOpen: false,
      tzMenuOpen: false,
      leadsSubj: "all",
      leadsMineOnly: false,
      telemostUrl: "",
      lessonAutoNotify: {},
      lessonPayments: {},
      waSettings: {
        enabled: true,
        lead: "1h",
        leads: ["24h", "1h"],
        channels: ["wa", "tg", "max"],
        template: "Здравствуйте, {имя}! Напоминаю, что скоро будет урок ({предмет}) — {день} в {время}. Материалы и ссылку пришлю перед занятием."
      },
      account: {
        name: demo ? (profName || DEMO_PROFILE_DEFAULTS.name) : profName,
        photo: demo ? "" : ctxAvatar,
        hasPhoto: demo ? false : Boolean(ctxAvatar),
        city: "Якутск",
        timezone: "UTC+9",
        whatsapp: demo ? DEMO_PROFILE_DEFAULTS.whatsapp : "",
        telegram: demo ? DEMO_PROFILE_DEFAULTS.telegram : "",
        maxHandle: "",
        vk: ""
      },
      searchProfiles: demo ? [
        createEmptySearchProfile({
          name: profName || DEMO_PROFILE_DEFAULTS.name,
          photo: "",
          hasPhoto: false,
          city: "Якутск",
          timezone: "UTC+9",
          whatsapp: DEMO_PROFILE_DEFAULTS.whatsapp,
          telegram: DEMO_PROFILE_DEFAULTS.telegram,
          maxHandle: "",
          vk: ""
        }, {
          id: "tc-my-profile",
          headline: DEMO_PROFILE_DEFAULTS.headline,
          subject: "bio",
          subjects: ["bio"],
          customBadges: ["Эксперт жюри ВсОШ", ""],
          exams: ["ЕГЭ", "ОГЭ"],
          formats: ["Онлайн"],
          education: DEMO_PROFILE_DEFAULTS.education,
          expYears: 6,
          avgScore: 86,
          highScorers: 14,
          firstLessonGuarantee: true,
          customSkills: DEMO_PROFILE_DEFAULTS.customSkills,
          price: 1200,
          minFair: 900,
          bio: DEMO_PROFILE_DEFAULTS.bio,
          slots: cloneDemoSlots(),
          published: true,
          verified: true
        })
      ] : [],
      activeSearchProfileId: demo ? "tc-my-profile" : "",
      spEditorOpen: false,
      creatingSearchProfile: false,
      newProfileDraft: null,
      confirmDeleteProfileId: null,
      confirmDropStudentKey: null,
      profile: {
        id: demo ? "tc-my-profile" : "",
        name: demo ? (profName || DEMO_PROFILE_DEFAULTS.name) : profName,
        headline: demo ? DEMO_PROFILE_DEFAULTS.headline : "",
        photo: demo ? "" : ctxAvatar,
        hasPhoto: demo ? false : Boolean(ctxAvatar),
        subject: "bio",
        subjects: ["bio"],
        customBadges: demo ? ["Эксперт жюри ВсОШ", ""] : ["", ""],
        exams: demo ? ["ЕГЭ", "ОГЭ"] : ["ЕГЭ"],
        formats: ["Онлайн"],
        city: "Якутск",
        timezone: "UTC+9",
        whatsapp: demo ? DEMO_PROFILE_DEFAULTS.whatsapp : "",
        telegram: demo ? DEMO_PROFILE_DEFAULTS.telegram : "",
        maxHandle: "",
        vk: "",
        education: demo ? DEMO_PROFILE_DEFAULTS.education : "",
        expYears: demo ? 6 : 1,
        avgScore: demo ? 86 : 0,
        highScorers: demo ? 14 : 0,
        firstLessonGuarantee: true,
        trialMode: "free",
        trialPrice: 0,
        trialFree: true,
        customSkills: demo ? DEMO_PROFILE_DEFAULTS.customSkills : "",
        price: 1200,
        minFair: 900,
        bio: demo ? DEMO_PROFILE_DEFAULTS.bio : "",
        published: demo
      },
      slots: demo ? cloneDemoSlots() : emptySlotsMap(),
      requests: demo ? DEFAULT_REQUESTS.map((r) => Object.assign({}, r)) : [],
      students: demo ? DEFAULT_STUDENTS.map((s) => Object.assign({}, s)) : [],
      payoutSettings: {
        method: "sbp",
        bank: demo ? DEMO_PROFILE_DEFAULTS.bank : "Сбербанк",
        phone: demo ? DEMO_PROFILE_DEFAULTS.whatsapp : "",
        card: demo ? DEMO_PROFILE_DEFAULTS.card : "",
        npdReceipt: true,
        inn: ""
      },
      payouts: demo ? [
        {
          id: "out-seed-1",
          createdAtLabel: "10 нояб., 18:20",
          amount: 4500,
          method: "sbp",
          methodLabel: "СБП · АЭБ (Алмазэргиэнбанк)",
          destination: DEMO_PROFILE_DEFAULTS.whatsapp,
          npdReceipt: true,
          fee: 0,
          status: "succeeded",
          statusLabel: "Исполнено ✓"
        }
      ] : [],
      serverSummary: null,
      _serverLoaded: false,
      _serverLoading: false,
      _serverError: "",
      _ownerUserId: (_ctx && _ctx.store && _ctx.store.user && _ctx.store.user.id != null) ? String(_ctx.store.user.id) : ""
    };
  }

  function tState() {
    if (_cache) return _cache;
    const demo = isDevDemoMode();
    let saved = null;
    try {
      const raw = localStorage.getItem(TC_LS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { /* игнор */ }
    const def = defaultState();
    if (saved && typeof saved === "object") {
      _cache = Object.assign({}, def, saved);
      _cache.profile = Object.assign({}, def.profile, saved.profile || {});
      if (!Array.isArray(_cache.profile.subjects) || !_cache.profile.subjects.length) {
        _cache.profile.subjects = [_cache.profile.subject || "bio"];
      }
      _cache.profile.subject = _cache.profile.subjects[0] || "bio";
      if (!Array.isArray(_cache.profile.customBadges)) {
        _cache.profile.customBadges = def.profile.customBadges.slice();
      }
      while (_cache.profile.customBadges.length < 2) _cache.profile.customBadges.push("");
      _cache.profile.customBadges = _cache.profile.customBadges.slice(0, 2);
      if (!Array.isArray(_cache.profile.exams) || !_cache.profile.exams.length) _cache.profile.exams = def.profile.exams.slice();
      if (!Array.isArray(_cache.profile.formats) || !_cache.profile.formats.length) _cache.profile.formats = def.profile.formats.slice();
      _cache.profile.city = CITY_OPTIONS.find((c) => String(_cache.profile.city || "").indexOf(c) >= 0) || "Якутск";
      _cache.profile.timezone = TZ_OPTIONS.some((tz) => tz.id === _cache.profile.timezone) ? _cache.profile.timezone : "UTC+9";
      if (typeof _cache.profile.photo !== "string") _cache.profile.photo = "";
      if (typeof _cache.profile.customSkills !== "string") {
        _cache.profile.customSkills = Array.isArray(saved.profile && saved.profile.skills) && saved.profile.skills.length
          ? saved.profile.skills.join(", ")
          : def.profile.customSkills;
      }
      _cache.waSettings = Object.assign({}, def.waSettings, saved.waSettings || {});
      _cache.waSettings.channels = normalizeChannelList(_cache.waSettings.channels);
      _cache.waSettings.leads = normalizeLeadList(saved.waSettings && saved.waSettings.leads);
      if (!_cache.lessonAutoNotify || typeof _cache.lessonAutoNotify !== "object") _cache.lessonAutoNotify = {};
      if (typeof _cache.telemostUrl !== "string") _cache.telemostUrl = "";
      const savedProf = saved.profile && typeof saved.profile === "object" ? saved.profile : null;
      _cache.profile.whatsapp = savedProf && Object.prototype.hasOwnProperty.call(savedProf, "whatsapp")
        ? (savedProf.whatsapp ? formatPhone(savedProf.whatsapp) : "")
        : (def.profile.whatsapp ? formatPhone(def.profile.whatsapp) : "");
      _cache.profile.telegram = savedProf && Object.prototype.hasOwnProperty.call(savedProf, "telegram")
        ? (savedProf.telegram ? formatTelegram(savedProf.telegram) : "")
        : (def.profile.telegram ? formatTelegram(def.profile.telegram) : "");
      if (typeof _cache.profile.maxHandle !== "string") _cache.profile.maxHandle = "";
      if (typeof _cache.profile.vk !== "string") _cache.profile.vk = "";
      if (typeof _cache.profile.firstLessonGuarantee !== "boolean") {
        _cache.profile.firstLessonGuarantee = !!(
          (saved.profile && (saved.profile.trialMode === "free" || saved.profile.trialFree === true)) ||
          def.profile.firstLessonGuarantee
        );
      }
      _cache.profile.trialFree = _cache.profile.firstLessonGuarantee;
      _cache.profile.trialMode = _cache.profile.firstLessonGuarantee ? "free" : "none";
      _cache.profile.trialPrice = _cache.profile.firstLessonGuarantee ? 0 : null;
      _cache.lastAutoBumpAt = demo ? (Number(_cache.lastAutoBumpAt || _cache.lastBumpAt) || def.lastAutoBumpAt) : (Number(_cache.lastAutoBumpAt || _cache.lastBumpAt) || 0);
      _cache.lastBumpAt = _cache.lastAutoBumpAt;
      _cache.lastManualBumpAt = Number(_cache.lastManualBumpAt) || 0;
      _cache.reqTblCols = [3, 5, 7].includes(Number(_cache.reqTblCols)) ? Number(_cache.reqTblCols) : 5;
      _cache.reqTblQuery = typeof _cache.reqTblQuery === "string" ? _cache.reqTblQuery : "";
      _cache.stTblFilter = ["all", "auto", "off"].includes(_cache.stTblFilter) ? _cache.stTblFilter : "all";
      _cache.stTblQuery = typeof _cache.stTblQuery === "string" ? _cache.stTblQuery : "";
      _cache.stTblCols = [3, 5, 7].includes(Number(_cache.stTblCols)) ? Number(_cache.stTblCols) : 5;
      _cache.leadsTblQuery = typeof _cache.leadsTblQuery === "string" ? _cache.leadsTblQuery : "";
      _cache.leadsTblCols = [3, 5, 7].includes(Number(_cache.leadsTblCols)) ? Number(_cache.leadsTblCols) : 5;
      _cache.leadCounterPrices = (_cache.leadCounterPrices && typeof _cache.leadCounterPrices === "object") ? _cache.leadCounterPrices : {};
      _cache.slots = Object.assign({}, def.slots, saved.slots || {});
      _cache.requests = Array.isArray(saved.requests)
        ? (demo ? (saved.requests.length ? saved.requests : def.requests) : saved.requests.filter(Boolean))
        : def.requests;
      _cache.students = Array.isArray(saved.students)
        ? (demo
          ? (saved.students.length
            ? saved.students.map((s, idx) => {
                const merged = Object.assign({}, def.students[idx] || { lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio", autoNotify: true, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 }, s);
                merged.whatsapp = formatPhone(merged.whatsapp || "+7 (914) 210-05-11");
                merged.telegram = formatTelegram(merged.telegram || "");
                merged.autoChannels = normalizeChannelList(merged.autoChannels);
                return merged;
              })
            : def.students)
          : saved.students.filter(Boolean).map((s) => {
              const merged = Object.assign({ lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "", telegram: "", autoNotify: true, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 }, s);
              merged.whatsapp = merged.whatsapp ? formatPhone(merged.whatsapp) : "";
              merged.telegram = formatTelegram(merged.telegram || "");
              merged.autoChannels = normalizeChannelList(merged.autoChannels);
              return merged;
            }))
        : def.students;
      const rawPs = saved.payoutSettings && typeof saved.payoutSettings === "object" ? saved.payoutSettings : {};
      _cache.payoutSettings = {
        method: rawPs.method === "card" ? "card" : "sbp",
        bank: String(rawPs.bank || def.payoutSettings.bank),
        phone: (rawPs.phone ? formatPhone(rawPs.phone) : "") || def.payoutSettings.phone,
        card: (rawPs.card ? formatCardMask(rawPs.card) : "") || def.payoutSettings.card,
        npdReceipt: rawPs.npdReceipt !== undefined ? !!rawPs.npdReceipt : def.payoutSettings.npdReceipt,
        inn: String(rawPs.inn || "").replace(/\D+/g, "").slice(0, 12)
      };
      _cache.payouts = Array.isArray(saved.payouts)
        ? saved.payouts.filter(Boolean).map((item, idx) => Object.assign({
            id: "out-" + (idx + 1),
            createdAtLabel: "Сегодня",
            amount: 0,
            method: "sbp",
            methodLabel: "СБП",
            destination: _cache.payoutSettings.phone || "",
            npdReceipt: true,
            fee: 0,
            status: "succeeded",
            statusLabel: "Исполнено ✓"
          }, item))
        : def.payouts.map((p) => Object.assign({}, p));
    } else {
      _cache = def;
    }
    _cache._serverLoaded = false;
    _cache._serverLoading = false;
    _cache._verifLoaded = false;
    _cache._verifLoading = false;
    _cache._serverError = "";
    _cache.confirmDropStudentKey = null;
    _cache.spEditorOpen = !!_cache.spEditorOpen;
    _cache.studentsSubView = _cache.studentsSubView === "list" ? "list" : "calendar";
    _cache.studentsScope = _cache.studentsScope === "past" ? "past" : "current";
    _cache.expandedStudentId = typeof _cache.expandedStudentId === "string" ? _cache.expandedStudentId : "";
    if (!_cache.chartStyle) _cache.chartStyle = "sticks";
    if (!_cache.leadCounterPrices || typeof _cache.leadCounterPrices !== "object") _cache.leadCounterPrices = {};
    if (!_cache.calendarSync || typeof _cache.calendarSync !== "object") {
      _cache.calendarSync = Object.assign({}, def.calendarSync);
    }
    if (!Array.isArray(_cache.calendarSync.busySlots)) _cache.calendarSync.busySlots = [];
    if (!Array.isArray(_cache.calendarSync.conflicts)) _cache.calendarSync.conflicts = [];
    if (!demo) sanitizeProdState(_cache);
    else {
      if (!_cache.account || typeof _cache.account !== "object") {
        _cache.account = sanitizeAccount(_cache.profile || def.account, "", "", true);
      }
      if (!Array.isArray(_cache.searchProfiles) || !_cache.searchProfiles.length) {
        const legacySp = Object.assign({}, def.searchProfiles[0], _cache.profile || {}, {
          id: (_cache.profile && _cache.profile.id) ? _cache.profile.id : "tc-my-profile",
          slots: _cache.slots || def.slots
        });
        _cache.searchProfiles = [createEmptySearchProfile(_cache.account, legacySp)];
      } else {
        _cache.searchProfiles = _cache.searchProfiles.filter(Boolean).map((sp, idx) => {
          const hasOwnSlots = sp && sp.slots && typeof sp.slots === "object" && !Array.isArray(sp.slots);
          const inheritLegacy = !hasOwnSlots && _cache.slots && (sp.id === _cache.activeSearchProfileId || idx === 0);
          return createEmptySearchProfile(_cache.account, inheritLegacy ? Object.assign({}, sp, { slots: _cache.slots }) : sp);
        });
      }
      if (!_cache.activeSearchProfileId) {
        _cache.activeSearchProfileId = _cache.searchProfiles[0].id || "tc-my-profile";
      }
      syncProfileMirror(_cache);
    }
    _cache.confirmDeleteProfileId = null;
    checkAutoBumpDue(_cache, true);
    return _cache;
  }

  function saveState() {
    try {
      const st = Object.assign({}, syncProfileMirror(tState()));
      delete st._serverLoaded;
      delete st._serverLoading;
      delete st._serverError;
      delete st._verifLoaded;
      delete st._verifLoading;
      delete st.confirmDeleteProfileId;
      localStorage.setItem(TC_LS_KEY, JSON.stringify(st));
    } catch (e) { /* игнор */ }
  }

  function checkAutoBumpDue(st, silent) {
    if (!st || !st.autoBump24h) return false;
    const last = Number(st.lastAutoBumpAt || st.lastBumpAt) || 0;
    const now = Date.now();
    if (now - last >= DAY_MS) {
      st.lastAutoBumpAt = now;
      st.lastBumpAt = now;
      st.bumpedToday = true;
      st.bumpCount = (Number(st.bumpCount) || 0) + 1;
      syncPublishedTutor(st);
      if (!silent) saveState();
      return true;
    }
    return false;
  }

  function formatCountdown(msLeft) {
    const clamped = Math.max(0, Math.floor(msLeft / 1000));
    const hh = String(Math.floor(clamped / 3600)).padStart(2, "0");
    const mm = String(Math.floor((clamped % 3600) / 60)).padStart(2, "0");
    const ss = String(clamped % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }

  function autoBumpRemainingMs(st) {
    const last = Number(st.lastAutoBumpAt || st.lastBumpAt) || Date.now();
    return Math.max(0, (last + DAY_MS) - Date.now());
  }

  function manualBumpRemainingMs(st) {
    const last = Number(st && st.lastManualBumpAt) || 0;
    if (!last) return 0;
    return Math.max(0, (last + FOUR_HOURS_MS) - Date.now());
  }

  function formatShortCountdown(ms) {
    if (!(ms > 0)) return "00:00";
    const sec = Math.max(1, Math.ceil(Number(ms) / 1000));
    const mm = String(Math.floor(sec / 60)).padStart(2, "0");
    const ss = String(sec % 60).padStart(2, "0");
    return `${mm}:${ss}`;
  }

  function payRemindRemainingMs(pay) {
    const last = Number(pay && pay.remindedAt) || 0;
    if (!last) return 0;
    return Math.max(0, (last + PAY_REMIND_COOLDOWN_MS) - Date.now());
  }

  function markPayRemindAnim(reqId) {
    const id = String(reqId || "");
    if (!id) return;
    _payRemindAnim[id] = Date.now();
  }

  function isPayRemindAnimActive(reqId) {
    const id = String(reqId || "");
    if (!id || !_payRemindAnim[id]) return false;
    if ((Date.now() - _payRemindAnim[id]) < PAY_REMIND_ANIM_MS) return true;
    delete _payRemindAnim[id];
    return false;
  }

  function ensureCountdownTimer() {
    if (typeof document === "undefined" || typeof setInterval !== "function" || _countdownTimer) return;
    _countdownTimer = setInterval(() => {
      if (!_ctx.ui || (_ctx.ui.view !== "cabinet" && _ctx.ui.view !== "fees")) return;
      const st = tState();
      if (checkAutoBumpDue(st, false)) {
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.notifySide === "function") {
          _ctx.notifySide("Автоподнятие 24 ч сработало", "Анкета снова поднята в топ каталога (0 ₽).");
        }
        return;
      }
      const txt = st.autoBump24h ? formatCountdown(autoBumpRemainingMs(st)) : "Пауза";
      document.querySelectorAll("[data-tc-countdown]").forEach((node) => {
        node.textContent = txt;
      });
      const mRem = manualBumpRemainingMs(st);
      document.querySelectorAll("[data-tc-manual-countdown]").forEach((node) => {
        node.textContent = mRem > 0 ? formatCountdown(mRem) : "00:00:00";
      });
      const nowMs = Date.now();
      let needsRender = false;
      Object.keys(_payRemindAnim).forEach((k) => {
        if ((nowMs - _payRemindAnim[k]) >= PAY_REMIND_ANIM_MS) {
          delete _payRemindAnim[k];
          needsRender = true;
        }
      });
      document.querySelectorAll("[data-tc-pay-remind-id]").forEach((node) => {
        const rid = (node.dataset && node.dataset.tcPayRemindId) || (typeof node.getAttribute === "function" ? node.getAttribute("data-tc-pay-remind-id") : "") || "";
        if (!rid) return;
        const pay = getLessonPaymentState(st, findReq(rid) || { id: rid });
        const remMs = payRemindRemainingMs(pay);
        if (remMs <= 0) {
          if (node.disabled || (node.classList && node.classList.contains("is-cooldown"))) needsRender = true;
          return;
        }
        const cdNode = typeof node.querySelector === "function" ? node.querySelector("[data-tc-pay-remind-cd]") : null;
        if (cdNode) cdNode.textContent = formatShortCountdown(remMs);
      });
      if (needsRender && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
    }, 1000);
  }

  function clampStep(val, delta, lo, hi) {
    const raw = (val != null && Number.isFinite(Number(val))) ? Number(val) : lo;
    const cur = Math.round(raw / 50) * 50;
    return Math.max(lo, Math.min(hi, cur + delta));
  }

  function profileCompleteness(p, slots) {
    const totalSlots = Object.keys(slots || {}).reduce((s, k) => s + (Array.isArray(slots[k]) ? slots[k].length : 0), 0);
    const hasMessenger =
      String(p.whatsapp || "").replace(/\D+/g, "").length >= 10 ||
      String(p.telegram || "").trim().length >= 3 ||
      String(p.maxHandle || "").trim().length >= 2 ||
      String(p.vk || "").trim().length >= 2;
    const checks = [
      { ok: String(p.name || "").trim().length >= 3, tip: "укажите имя и фамилию" },
      { ok: String(p.headline || "").trim().length >= 8, tip: "добавьте заголовок специализации" },
      { ok: String(p.education || "").trim().length >= 6, tip: "укажите вуз или квалификацию" },
      { ok: Number(p.expYears) >= 1, tip: "укажите стаж преподавания (лет)" },
      { ok: String(p.customSkills || "").trim().length >= 8, tip: "впишите ключевые навыки подготовки" },
      { ok: String(p.bio || "").trim().length >= 30, tip: "опишите подход к подготовке (30+ симв.)" },
      { ok: hasMessenger, tip: "привяжите мессенджер (Telegram, WhatsApp, MAX или ВК) для уведомлений" },
      { ok: totalSlots >= 4, tip: "откройте минимум 4 окна 10:00–20:00" }
    ];
    const done = checks.filter((c) => c.ok).length;
    return {
      pct: Math.round((done / checks.length) * 100),
      missing: checks.filter((c) => !c.ok).map((c) => c.tip),
      totalSlots
    };
  }

  function buildMarketTutorPayload(st, spOverride) {
    const TDATA = getTDATA();
    const acc = (st && st.account && typeof st.account === "object") ? st.account : (st.profile || {});
    const p = spOverride || getEditingSearchProfile(st);
    const subjIds = Array.isArray(p.subjects) && p.subjects.length ? p.subjects.slice() : [p.subject || "bio"];
    const subjNames = (TDATA && typeof TDATA.subjectNamesForIds === "function")
      ? TDATA.subjectNamesForIds(subjIds)
      : subjIds.map((id) => {
          const hit = (TDATA && TDATA.SUBJECTS || []).find((s) => s.id === id);
          return hit ? hit.name : "";
        }).filter(Boolean);
    const srcSlots = normalizeSlotsMap(p && p.slots);
    const cleanSlots = {};
    Object.keys(srcSlots).forEach((k) => {
      if (Array.isArray(srcSlots[k]) && srcSlots[k].length) cleanSlots[Number(k)] = srcSlots[k].slice();
    });
    const years = Math.max(1, Number(p.expYears) || 1);
    const basePrice = Number(p.price) || 1200;
    const isPro = basePrice >= 1400;
    const customBadges = Array.isArray(p.customBadges)
      ? p.customBadges.map((b) => String(b || "").trim().slice(0, 36)).filter(Boolean).slice(0, 2)
      : [];
    const customSkillsText = String(p.customSkills || "").trim();
    const hasPhoto = acc.hasPhoto != null ? !!acc.hasPhoto : Boolean(acc.photo);
    const accCity = CITY_OPTIONS.find((c) => String(acc.city || p.city || "").indexOf(c) >= 0) || "Якутск";
    const accTz = TZ_OPTIONS.some((t) => t.id === acc.timezone)
      ? acc.timezone
      : (accCity === "Москва" ? "UTC+3" : "UTC+9");
    return {
      id: String(p.id || "tc-my-profile"),
      name: String(acc.name || p.name || "Преподаватель"),
      photo: hasPhoto ? String(acc.photo || "") : "",
      subject: subjIds[0] || "bio",
      subjects: subjIds,
      subjectName: subjNames.length ? subjNames.join(" · ") : "Биология",
      customBadges,
      customSkillsText,
      exams: Array.isArray(p.exams) && p.exams.length ? p.exams.slice() : ["ЕГЭ"],
      formats: Array.isArray(p.formats) && p.formats.length ? p.formats.slice() : ["Онлайн"],
      city: accCity,
      timezone: accTz,
      price: p.price != null ? Number(p.price) : 1200,
      minFair: Math.min(p.price != null ? Number(p.price) : 1200, p.minFair != null ? Number(p.minFair) : 900),
      firstLessonGuarantee: p.firstLessonGuarantee !== false,
      trialMode: p.firstLessonGuarantee !== false ? "free" : "none",
      trialPrice: p.firstLessonGuarantee !== false ? 0 : null,
      trialFree: p.firstLessonGuarantee !== false,
      marketPrice: isPro ? Math.max(1150, Math.round((basePrice * 0.85) / 50) * 50) : Math.round((basePrice * 1.28) / 50) * 50,
      tier: isPro ? "pro" : "budget",
      qualBadge: isPro ? "Профиль · Эксперт" : "Проверенная анкета",
      rating: 4.9,
      reviews: 18 + Math.min(20, Number(p.highScorers) || 0),
      exp: `Стаж ${years} ${plural(years, "год", "года", "лет")}`,
      tag: p.headline || customSkillsText || "Подготовка ФИПИ",
      source: "Кабинет",
      fromCabinet: true,
      whatsapp: acc.whatsapp || "",
      telegram: acc.telegram || "",
      maxHandle: acc.maxHandle || "",
      vk: acc.vk || "",
      verified: p.verified !== false,
      published: p.published !== false,
      bumpedToday: !!(p.bumpedToday || st.bumpedToday || st.autoBump24h),
      bumpText: st.autoBump24h ? `Автоподнятие 24 ч (${st.autoBumpHour})` : ((p.bumpedToday || st.bumpedToday) ? "Поднята сегодня" : "Ваша анкета"),
      bio: p.bio || "Подготовка к ЕГЭ и ОГЭ с проверкой пробников.",
      slots: Object.keys(cleanSlots).length ? cleanSlots : { 6: ["10:00", "14:00"] }
    };
  }

  function syncPublishedTutor(st) {
    if (!isDevDemoMode()) return null;
    const TDATA = getTDATA();
    if (!TDATA || typeof TDATA.upsertCustomTutor !== "function") return null;
    const list = Array.isArray(st.searchProfiles) ? st.searchProfiles : [];
    let lastCard = null;
    list.forEach((sp) => {
      if (!sp) return;
      const cardId = String(sp.id || "tc-my-profile");
      if (sp.published === false) {
        if (typeof TDATA.removeCustomTutor === "function") TDATA.removeCustomTutor(cardId);
      } else {
        lastCard = TDATA.upsertCustomTutor(buildMarketTutorPayload(st, sp));
      }
    });
    return lastCard;
  }

  function dayDowFromLabel(lbl) {
    const s = String(lbl || "").trim().slice(0, 2).toLowerCase();
    const hit = DAY_LIST.find((d) => d.wd.toLowerCase() === s);
    return hit ? hit.dow : "6";
  }

  function syncedRequests() {
    const st = tState();
    if (!isDevDemoMode()) {
      return Array.isArray(st.requests) ? st.requests : [];
    }
    const mktState = typeof _ctx.mkt === "function" ? _ctx.mkt() : null;
    const mktBookings = (mktState && Array.isArray(mktState.bookings)) ? mktState.bookings : [];
    const fromMarket = mktBookings.map((bk) => ({
      id: "mkt-" + bk.id,
      mktId: bk.id,
      studentName: "Заявка ученика (из каталога)",
      exam: bk.exam || "ЕГЭ",
      subjectName: bk.subjectName || "Подготовка",
      format: bk.format || "Онлайн",
      dow: bk.dow != null ? String(bk.dow) : dayDowFromLabel(bk.dayLabel),
      dayIso: bk.dayIso || "",
      dayLabel: bk.dayLabel || "Ближайший слот",
      hour: bk.hour || "14:00",
      offerPrice: Number(bk.offerPrice) || st.profile.price,
      counterPrice: Number(bk.counterPrice || bk.offerPrice) || st.profile.price,
      tutorPrice: Number(bk.tutorPrice) || st.profile.price,
      marketPrice: Math.round((Number(bk.tutorPrice) || st.profile.price) * 1.28),
      note: bk.note || `Отклик со слотом ${bk.hour || "14:00"} — выберите ставку и подтвердите.`,
      telemostUrl: bk.telemostUrl || (mktState && mktState.telemostUrl) || "",
      whatsapp: bk.whatsapp || "",
      telegram: bk.telegram || "",
      maxHandle: bk.maxHandle || "",
      schedulePlan: bk.schedulePlan || null,
      paid: Boolean(bk.paid),
      paidAt: Number(bk.paidAt) || 0,
      payRemindedAt: Number(bk.payRemindedAt) || 0,
      payRemindCount: Number(bk.payRemindCount) || 0,
      status: bk.status || "pending",
      createdLabel: "С витрины /market"
    }));
    const marketIds = new Set(fromMarket.map((x) => x.id));
    const localOnly = (st.requests || []).filter((r) => !marketIds.has(r.id));
    return fromMarket.concat(localOnly);
  }

  function mapServerBookingToRequest(bk, st) {
    bk = bk || {};
    st = st || _cache || {};
    const profPrice = (st && st.profile && Number(st.profile.price)) || 1200;
    const rawOffer = bk.offerPrice != null ? Number(bk.offerPrice) : profPrice;
    const rawCounter = bk.counterPrice != null
      ? Number(bk.counterPrice)
      : (bk.finalPrice != null ? Number(bk.finalPrice) : rawOffer);
    const rawTutorPrice = bk.tutorPrice != null ? Number(bk.tutorPrice) : profPrice;
    const rawDow = bk.dow != null
      ? String(bk.dow)
      : (Array.isArray(bk.dows) && bk.dows.length ? String(bk.dows[0]) : dayDowFromLabel(bk.dayLabel));
    const dayIso = String(bk.dayIso || bk.slotDate || "");
    const stuUid = bk.studentUserId != null ? Number(bk.studentUserId) : null;
    const stuName = String(bk.studentName || "Ученик");
    const studentId = stuUid != null && Number.isFinite(stuUid)
      ? ("srv-stu-" + stuUid)
      : ("srv-stu-name-" + stuName.trim().toLowerCase());
    const escStatus = String(bk.escrowStatus || "none");
    return {
      id: String(bk.id),
      serverId: String(bk.id),
      mktId: String(bk.id),
      tutorId: String(bk.tutorId || ""),
      tutorName: String(bk.tutorName || ""),
      fromServer: true,
      studentUserId: stuUid,
      studentId,
      studentName: stuName,
      exam: String(bk.exam || "ЕГЭ"),
      subject: String(bk.subject || ""),
      subjectName: String(bk.subjectName || bk.subject || "Подготовка"),
      format: String(bk.format || "Онлайн"),
      city: String(bk.city || ""),
      timezone: String(bk.timezone || ""),
      dow: rawDow,
      dows: Array.isArray(bk.dows) ? bk.dows.slice() : [],
      dayIso,
      dayLabel: String(bk.dayLabel || dayIso || "Ближайший слот"),
      hour: String(bk.hour || "14:00"),
      offerPrice: rawOffer,
      counterPrice: rawCounter,
      finalPrice: bk.finalPrice != null ? Number(bk.finalPrice) : null,
      tutorPrice: rawTutorPrice,
      marketPrice: Number(bk.marketPrice) || Math.round((rawTutorPrice || rawOffer || profPrice) * 1.28),
      fee: bk.fee != null ? Number(bk.fee) : 0,
      sbpFee: bk.sbpFee != null ? Number(bk.sbpFee) : 0,
      payout: bk.payout != null ? Number(bk.payout) : 0,
      reserved: Number(bk.reserved) || 0,
      escrowStatus: escStatus,
      paid: escStatus === "frozen" || escStatus === "captured" || Number(bk.reserved) > 0 || Boolean(bk.paid),
      paidAt: 0,
      payRemindedAt: 0,
      payRemindCount: 0,
      note: String(bk.note || ""),
      telemostUrl: String(bk.telemostUrl || ""),
      whatsapp: String(bk.whatsapp || ""),
      telegram: String(bk.telegram || ""),
      maxHandle: String(bk.maxHandle || ""),
      schedulePlan: bk.schedulePlan || null,
      status: String(bk.status || "pending"),
      rawStatus: String(bk.rawStatus || bk.status || "pending"),
      createdAt: String(bk.createdAt || ""),
      updatedAt: String(bk.updatedAt || ""),
      createdLabel: formatIsoShort(bk.createdAt) || "С сервера"
    };
  }

  function mapServerPayoutToRow(p) {
    p = p || {};
    const method = p.method === "card" ? "card" : "sbp";
    const status = String(p.status || "pending");
    const statusLabel = status === "succeeded"
      ? "Исполнено ✓"
      : (status === "rejected"
        ? "Отклонено"
        : (p.providerPayoutId ? "Отправлено в ЮKassa" : (p.antifraudHold ? "Проверка" : "В обработке")));
    return {
      id: String(p.id || ""),
      fromServer: true,
      createdAt: String(p.createdAt || ""),
      createdAtLabel: formatIsoShort(p.createdAt) || "Сегодня",
      amount: Number(p.amountRub != null ? p.amountRub : p.amount) || 0,
      method,
      methodLabel: p.bank ? `${method === "sbp" ? "СБП" : "Карта"} · ${p.bank}` : (method === "sbp" ? "СБП" : "Карта РФ"),
      destination: String(p.destinationMasked || p.destination || "—"),
      npdReceipt: p.npdReceipt != null ? p.npdReceipt : p.npdRequested !== false,
      npdReceiptCode: p.npdReceipt || "",
      npdReceiptUrl: String(p.npdReceiptUrl || ""),
      npdStatus: String(p.npdStatus || (p.npdRequested === false ? "none" : "pending")),
      tutorInn: String(p.tutorInn || ""),
      providerPayoutId: String(p.providerPayoutId || ""),
      antifraudHold: !!p.antifraudHold,
      antifraudReason: String(p.antifraudReason || ""),
      errorMessage: String(p.errorMessage || ""),
      fee: 0,
      status,
      statusLabel
    };
  }

  function deriveStudentsFromBookings(serverReqs, existingStudents) {
    const existingList = Array.isArray(existingStudents) ? existingStudents : [];
    const byId = new Map();
    const byName = new Map();
    const manualList = [];
    existingList.forEach((s) => {
      if (!s) return;
      if (!isDevDemoMode() && DEMO_STUDENT_IDS.has(String(s.id || ""))) return;
      if (s.id) byId.set(String(s.id), s);
      const nm = String(s.name || "").trim().toLowerCase();
      if (nm) byName.set(nm, s);
      if (s.manualStudent) manualList.push(s);
    });

    const grouped = new Map();
    const TDATA = getTDATA();
    (Array.isArray(serverReqs) ? serverReqs : []).forEach((r) => {
      if (!r || (r.status !== "accepted" && r.status !== "completed" && r.status !== "cancelled")) return;
      const nmKey = String(r.studentName || "Ученик").trim().toLowerCase();
      const sid = String(r.studentId || ("srv-stu-" + (r.studentUserId != null ? r.studentUserId : nmKey)));
      const rate = Number(r.counterPrice || r.offerPrice || r.tutorPrice || 0);
      const isPaid = r.status === "completed" || r.paid === true || String(r.escrowStatus || "") === "released" || String(r.escrowStatus || "") === "paid";
      const net = (r.payout != null && Number(r.payout) > 0)
        ? Number(r.payout)
        : (rate > 0 ? calcLessonSplit(rate, r, TDATA).payout : 0);
      const addEarned = isPaid ? net : 0;
      if (!grouped.has(sid)) {
        grouped.set(sid, {
          id: sid,
          latest: r,
          activeCnt: r.status === "accepted" ? 1 : 0,
          completedCnt: r.status === "completed" ? 1 : 0,
          cancelledCnt: r.status === "cancelled" ? 1 : 0,
          earnedRub: addEarned
        });
      } else {
        const entry = grouped.get(sid);
        if (r.status === "accepted") entry.activeCnt += 1;
        if (r.status === "completed") entry.completedCnt += 1;
        if (r.status === "cancelled") entry.cancelledCnt += 1;
        entry.earnedRub += addEarned;
        if (String(r.updatedAt || "") > String(entry.latest.updatedAt || "")) entry.latest = r;
      }
    });

    const derived = [];
    grouped.forEach((entry) => {
      const r = entry.latest;
      const nmLower = String(r.studentName || "").trim().toLowerCase();
      const prev = byId.get(entry.id) || (nmLower ? byName.get(nmLower) : null) || {};
      const dowObj = DAY_LIST.find((d) => d.dow === String(r.dow || ""));
      const sp = r.schedulePlan;
      const effHour = (sp && sp.hour) || r.hour || prev.lessonTime || "16:00";
      const effDay = (dowObj && dowObj.full) || r.dayLabel || prev.lessonDay || "По расписанию";
      const effStatus = entry.activeCnt > 0
        ? "active"
        : (prev.manualStatus === "active" ? "active" : "past");
      derived.push({
        id: entry.id,
        fromServer: true,
        studentUserId: r.studentUserId != null ? r.studentUserId : null,
        lastReqId: String(r.id || prev.lastReqId || ""),
        name: r.studentName || prev.name || "Ученик",
        exam: `${r.exam || "ЕГЭ"} · ${r.subjectName || "Подготовка"}`,
        status: effStatus,
        manualStatus: prev.manualStatus || "",
        endedLabel: effStatus === "past" ? (prev.endedLabel || (r.dayLabel ? `Последний урок: ${r.dayLabel}` : "Занятия завершены")) : "",
        rate: Number(r.counterPrice || r.offerPrice || r.tutorPrice || prev.rate || 0),
        earnedRub: Math.max(entry.earnedRub, Number(prev.earnedRub) || 0),
        startScore: prev.startScore != null ? Number(prev.startScore) : 0,
        curScore: prev.curScore != null ? Number(prev.curScore) : 0,
        targetScore: prev.targetScore != null ? Number(prev.targetScore) : 85,
        lessonsDone: Math.max(entry.completedCnt, Number(prev.lessonsDone) || 0),
        hw: prev.hw || r.note || "",
        lessonDay: effDay,
        lessonTime: effHour,
        whatsapp: prev.whatsapp ? formatPhone(prev.whatsapp) : (r.whatsapp ? formatPhone(r.whatsapp) : ""),
        telegram: prev.telegram ? formatTelegram(prev.telegram) : (r.telegram ? formatTelegram(r.telegram) : ""),
        maxHandle: prev.maxHandle || r.maxHandle || "",
        autoNotify: prev.autoNotify !== undefined ? !!prev.autoNotify : true,
        autoChannels: normalizeChannelList(prev.autoChannels),
        autoLeads: normalizeLeadList(prev.autoLeads),
        lastRemindedAt: Number(prev.lastRemindedAt) || 0
      });
    });

    const seenIds = new Set(derived.map((s) => s.id));
    manualList.forEach((m) => {
      if (!seenIds.has(String(m.id))) derived.push(m);
    });
    return derived;
  }

  function serverTutorToSearchProfile(tutorObj, acc) {
    const TDATA = getTDATA();
    const rawSubjs = Array.isArray(tutorObj.subjects) && tutorObj.subjects.length
      ? tutorObj.subjects.filter(Boolean)
      : (tutorObj.subject ? [String(tutorObj.subject)] : ["bio"]);
    const resolvedSubjs = rawSubjs.map((val) => {
      const s = String(val || "").trim();
      if (!s) return "";
      if (TDATA && Array.isArray(TDATA.SUBJECTS)) {
        const low = s.toLowerCase();
        const hit = TDATA.SUBJECTS.find((item) =>
          String(item.id || "").toLowerCase() === low ||
          String(item.name || "").toLowerCase() === low ||
          String(item.short || "").toLowerCase() === low
        );
        if (hit && hit.id) return hit.id;
      }
      return s;
    }).filter(Boolean);
    const srvPrice = Number(tutorObj.price != null ? tutorObj.price : tutorObj.baseRateRub) || 1200;
    const rawMinFair = Number(tutorObj.minFair);
    const minFair = Number.isFinite(rawMinFair) && rawMinFair > 0
      ? Math.max(400, Math.min(srvPrice, rawMinFair))
      : Math.max(400, Math.round((srvPrice * 0.85) / 50) * 50);
    return createEmptySearchProfile(acc, {
      id: String(tutorObj.id || ""),
      headline: String(tutorObj.headline || ""),
      subject: resolvedSubjs[0] || "bio",
      subjects: resolvedSubjs.length ? resolvedSubjs : ["bio"],
      exams: Array.isArray(tutorObj.exams) && tutorObj.exams.length ? tutorObj.exams.slice() : ["ЕГЭ"],
      formats: Array.isArray(tutorObj.formats) && tutorObj.formats.length ? tutorObj.formats.slice() : ["Онлайн"],
      education: String(tutorObj.education || ""),
      expYears: Math.max(1, Number(tutorObj.expYears) || 1),
      avgScore: Number(tutorObj.avgScore) || 0,
      customSkills: String(tutorObj.customSkills || ""),
      bio: String(tutorObj.bio || ""),
      price: srvPrice,
      minFair,
      firstLessonGuarantee: tutorObj.firstLessonGuarantee !== false,
      customBadges: Array.isArray(tutorObj.customBadges) ? tutorObj.customBadges.slice(0, 2) : ["", ""],
      slots: normalizeSlotsMap(tutorObj.slots),
      verified: !!tutorObj.verified,
      published: tutorObj.published !== false,
      bumpedToday: !!tutorObj.bumpedToday,
      lastBumpedAt: String(tutorObj.lastBumpedAt || ""),
      updatedAt: String(tutorObj.updatedAt || ""),
      rating: tutorObj.rating != null ? Number(tutorObj.rating) : 4.9,
      reviewsCount: tutorObj.reviewsCount != null ? Number(tutorObj.reviewsCount) : 0
    });
  }

  function applyServerProfile(tutorObj, st, opts) {
    if (!st) return;
    opts = opts || {};
    const ctxUser = (_ctx && _ctx.store && _ctx.store.user) || null;
    if (!st.account || typeof st.account !== "object") {
      st.account = sanitizeAccount({}, "", "", isDevDemoMode());
    }
    if (!Array.isArray(st.searchProfiles)) st.searchProfiles = [];
    if (tutorObj && typeof tutorObj === "object" && tutorObj.id) {
      if (opts.syncAccount !== false) {
        if (!st.account.name && (tutorObj.name || tutorObj.fullName)) {
          st.account.name = String(tutorObj.name || tutorObj.fullName || "");
        }
        if (tutorObj.city) st.account.city = String(tutorObj.city);
        if (tutorObj.timezone) st.account.timezone = String(tutorObj.timezone);
        if (typeof tutorObj.photoUrl === "string" && tutorObj.photoUrl) {
          st.account.photo = tutorObj.photoUrl;
          st.account.hasPhoto = tutorObj.hasPhoto !== false;
        }
        if (tutorObj.whatsappPhone && !st.account.whatsapp) st.account.whatsapp = formatPhone(tutorObj.whatsappPhone);
        if (tutorObj.telegramHandle && !st.account.telegram) st.account.telegram = formatTelegram(tutorObj.telegramHandle);
        if (tutorObj.maxHandle && !st.account.maxHandle) st.account.maxHandle = String(tutorObj.maxHandle);
      }
      const sp = serverTutorToSearchProfile(tutorObj, st.account);
      const idx = st.searchProfiles.findIndex((item) => item && item.id === sp.id);
      if (idx >= 0) st.searchProfiles[idx] = sp;
      else st.searchProfiles.unshift(sp);
      st.activeSearchProfileId = sp.id;
      st.creatingSearchProfile = false;
      st.newProfileDraft = null;
      st.bumpedToday = !!tutorObj.bumpedToday;
      syncProfileMirror(st);
      syncPublishedTutor(st);
    } else {
      if (!st.account.name && ctxUser) st.account.name = String(ctxUser.displayName || ctxUser.username || "");
      if (!st.account.photo && st.account.hasPhoto !== false && ctxUser && ctxUser.avatarUrl) {
        st.account.photo = String(ctxUser.avatarUrl);
        st.account.hasPhoto = true;
      }
      syncProfileMirror(st);
    }
  }

  function applyServerProfiles(profilesList, st, docProfile) {
    if (!st) return;
    const ctxUser = (_ctx && _ctx.store && _ctx.store.user) || null;
    const list = Array.isArray(profilesList) ? profilesList.filter((x) => x && x.id) : [];
    const doc = (docProfile && typeof docProfile === "object") ? docProfile : {};
    const first = list[0] || null;
    const nextAcc = Object.assign({}, st.account || {});
    if (doc.name) nextAcc.name = String(doc.name);
    else if (first && (first.name || first.fullName)) nextAcc.name = String(first.name || first.fullName);
    else if (!nextAcc.name && ctxUser) nextAcc.name = String(ctxUser.displayName || ctxUser.username || "");
    if (doc.city) nextAcc.city = String(doc.city);
    else if (first && first.city) nextAcc.city = String(first.city);
    if (doc.timezone) nextAcc.timezone = String(doc.timezone);
    else if (first && first.timezone) nextAcc.timezone = String(first.timezone);
    if (doc.hasPhoto === false) {
      nextAcc.hasPhoto = false;
      nextAcc.photo = "";
    } else if (doc.photo) {
      nextAcc.photo = String(doc.photo);
      nextAcc.hasPhoto = true;
    } else if (first && first.hasPhoto === false) {
      nextAcc.hasPhoto = false;
      nextAcc.photo = "";
    } else if (first && first.photoUrl) {
      nextAcc.photo = String(first.photoUrl);
      nextAcc.hasPhoto = true;
    } else if (!nextAcc.photo && nextAcc.hasPhoto !== false && ctxUser && ctxUser.avatarUrl) {
      nextAcc.photo = String(ctxUser.avatarUrl);
      nextAcc.hasPhoto = true;
    }
    if (doc.whatsapp != null) nextAcc.whatsapp = doc.whatsapp ? formatPhone(doc.whatsapp) : "";
    else if (first && first.whatsappPhone != null) nextAcc.whatsapp = first.whatsappPhone ? formatPhone(first.whatsappPhone) : "";
    if (doc.telegram != null) nextAcc.telegram = doc.telegram ? formatTelegram(doc.telegram) : "";
    else if (first && first.telegramHandle != null) nextAcc.telegram = first.telegramHandle ? formatTelegram(first.telegramHandle) : "";
    if (doc.maxHandle != null) nextAcc.maxHandle = String(doc.maxHandle || "");
    else if (first && first.maxHandle != null) nextAcc.maxHandle = String(first.maxHandle || "");
    if (doc.vk != null) nextAcc.vk = String(doc.vk || "");

    st.account = sanitizeAccount(nextAcc, nextAcc.name || "", nextAcc.photo || "", isDevDemoMode());
    st.searchProfiles = list.map((item) => serverTutorToSearchProfile(item, st.account));
    if (st.searchProfiles.length) {
      const stillValid = st.searchProfiles.some((sp) => sp.id === st.activeSearchProfileId);
      if (!stillValid) st.activeSearchProfileId = st.searchProfiles[0].id;
    } else {
      st.activeSearchProfileId = "";
    }
    const activeSrv = list.find((item) => String(item.id) === st.activeSearchProfileId) || first;
    st.bumpedToday = !!(activeSrv && activeSrv.bumpedToday);
    syncProfileMirror(st);
    syncPublishedTutor(st);
  }

  function resetSession() {
    _inFlightHydrate = null;
    if (!isDevDemoMode()) {
      try { localStorage.removeItem(TC_LS_KEY); } catch (e) { /* игнор */ }
      _cache = null;
      return;
    }
    if (_cache) {
      _cache.serverSummary = null;
      _cache._serverLoaded = false;
      _cache._serverLoading = false;
      _cache._serverError = "";
      _cache._verifLoaded = false;
      _cache._verifLoading = false;
      _cache._ownerUserId = "";
    }
  }

  function hydrateFromBackend(opts) {
    opts = opts || {};
    const ctxStore = _ctx && _ctx.store;
    if (!ctxStore || !ctxStore.backend || !ctxStore.user || !EGE.api) {
      return Promise.resolve(null);
    }
    const ownerUid = String(ctxStore.user.id || "");
    let st = tState();
    if (st._ownerUserId && String(st._ownerUserId) !== ownerUid) {
      resetSession();
      st = tState();
    }
    if (!opts.force && _inFlightHydrate) {
      return _inFlightHydrate;
    }
    st._serverLoading = true;
    st._ownerUserId = ownerUid;

    const pSummary = EGE.api.tutor && typeof EGE.api.tutor.summary === "function"
      ? EGE.api.tutor.summary().catch((err) => ({ _err: err }))
      : Promise.resolve(null);
    const pProfiles = EGE.api.tutor && typeof EGE.api.tutor.listProfiles === "function"
      ? EGE.api.tutor.listProfiles().catch((err) => ({ _err: err }))
      : Promise.resolve(null);
    const pBookings = EGE.api.bookings && typeof EGE.api.bookings.list === "function"
      ? EGE.api.bookings.list({ scope: "tutor", limit: 100 }).catch((err) => ({ _err: err }))
      : Promise.resolve(null);
    const pLeads = !isDevDemoMode() && EGE.api.leads && typeof EGE.api.leads.list === "function"
      ? EGE.api.leads.list({ limit: 100 }).catch(() => null)
      : Promise.resolve(null);

    const prom = Promise.all([pSummary, pProfiles, pBookings, pLeads]).then(([sumRes, profRes, bkRes, leadsRes]) => {
      const curStore = _ctx && _ctx.store;
      if (!curStore || !curStore.user || String(curStore.user.id || "") !== ownerUid) {
        return null;
      }
      const curSt = tState();
      const docProfile = (curStore.docs && curStore.docs.profile && typeof curStore.docs.profile === "object")
        ? curStore.docs.profile
        : ((typeof _ctx.profile === "function") ? _ctx.profile() : {});
      if (sumRes && !sumRes._err && sumRes.ok) {
        curSt.serverSummary = {
          tutorId: sumRes.tutorId || null,
          tutorInn: String(sumRes.tutorInn || ""),
          npdVerified: !!sumRes.npdVerified,
          earnedNetRub: Number(sumRes.earnedNetRub) || 0,
          earned30dNetRub: Number(sumRes.earned30dNetRub) || 0,
          frozenNetRub: Number(sumRes.frozenNetRub) || 0,
          withdrawnRub: Number(sumRes.withdrawnRub) || 0,
          availableRub: Number(sumRes.availableRub) || 0,
          completedLessonsCount: Number(sumRes.completedLessonsCount) || 0,
          completedLessons30dCount: Number(sumRes.completedLessons30dCount) || 0,
          minPayoutRub: Number(sumRes.minPayoutRub) || MIN_PAYOUT_RUB
        };
        if (sumRes.tutorInn && curSt.payoutSettings) {
          curSt.payoutSettings.inn = String(sumRes.tutorInn).replace(/\D+/g, "").slice(0, 12);
        }
        const srvPayouts = Array.isArray(sumRes.payouts) ? sumRes.payouts.map(mapServerPayoutToRow) : [];
        if (!isDevDemoMode() || srvPayouts.length > 0) {
          curSt.payouts = srvPayouts;
        }
      }
      const srvProfilesList = (profRes && !profRes._err && profRes.ok && Array.isArray(profRes.profiles))
        ? profRes.profiles
        : (sumRes && Array.isArray(sumRes.profiles) ? sumRes.profiles : (sumRes && sumRes.tutor ? [sumRes.tutor] : []));
      if ((profRes && profRes.ok) || (sumRes && sumRes.ok)) {
        applyServerProfiles(srvProfilesList, curSt, docProfile);
      }

      if (bkRes && !bkRes._err && bkRes.ok && Array.isArray(bkRes.bookings)) {
        const mapped = bkRes.bookings.map((b) => mapServerBookingToRequest(b, curSt));
        const mappedIds = new Set(mapped.map((m) => String(m.id)));
        const localKeep = (curSt.requests || []).filter((r) => {
          if (!r) return false;
          if (mappedIds.has(String(r.id))) return false;
          if (r.manualStudent) return true;
          return isDevDemoMode() && !r.fromServer;
        });
        if (!isDevDemoMode() || mapped.length > 0) {
          curSt.requests = mapped.concat(localKeep);
          const nextStudents = deriveStudentsFromBookings(mapped, curSt.students);
          if (!isDevDemoMode()) {
            curSt.students = nextStudents;
          } else if (nextStudents.length) {
            const seenSt = new Set(nextStudents.map((s) => s.id));
            curSt.students = nextStudents.concat((curSt.students || []).filter((s) => s && !seenSt.has(s.id)));
          }
        }
      }

      if (leadsRes && leadsRes.ok && Array.isArray(leadsRes.leads)) {
        const TDATA = getTDATA();
        if (TDATA && typeof TDATA.syncStudentLeads === "function") {
          TDATA.syncStudentLeads(leadsRes.leads, { replace: !isDevDemoMode() });
        }
      }

      curSt._serverLoaded = true;
      curSt._serverLoading = false;
      curSt._serverError = (sumRes && sumRes._err && sumRes._err.message) || (bkRes && bkRes._err && bkRes._err.message) || "";
      if (!isDevDemoMode()) sanitizeProdState(curSt);
      saveState();
      ensureRealtimeConnected();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return curSt;
    }).catch((err) => {
      const curSt = _cache;
      if (curSt) {
        curSt._serverLoading = false;
        curSt._serverLoaded = true;
        curSt._serverError = (err && err.message) || "Не удалось загрузить данные кабинета.";
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return null;
    }).finally(() => {
      if (_inFlightHydrate === prom) _inFlightHydrate = null;
    });

    _inFlightHydrate = prom;
    return prom;
  }

  function ensureServerHydrated() {
    const ctxStore = _ctx && _ctx.store;
    if (!ctxStore || !ctxStore.backend || !ctxStore.user) return null;
    const st = tState();
    const uid = String(ctxStore.user.id || "");
    if (st._ownerUserId && String(st._ownerUserId) !== uid) {
      return hydrateFromBackend({ force: true });
    }
    if (st._serverLoaded || st._serverLoading) return null;
    return hydrateFromBackend();
  }

  function findReq(id) {
    return syncedRequests().find((r) => r.id === id) || null;
  }

  function updateReq(id, mutator) {
    const st = tState();
    if (String(id).indexOf("mkt-") === 0 && typeof _ctx.mkt === "function") {
      const mktId = String(id).slice(4);
      const mktState = _ctx.mkt();
      const bk = (mktState.bookings || []).find((b) => String(b.id) === mktId);
      if (bk) {
        mutator(bk, true);
        if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
        return bk;
      }
    }
    const target = (st.requests || []).find((r) => r.id === id);
    if (!target) return null;
    mutator(target, false);
    saveState();
    return target;
  }

  function pendingCount() {
    return syncedRequests().filter((r) => r.status === "pending").length;
  }


  function renderDataTable(opts) {
    if (EGE.charts && typeof EGE.charts.dataTableHTML === "function") {
      return EGE.charts.dataTableHTML(opts);
    }
    return "";
  }


  function getTab() {
    const t = tState().tab;
    return ["requests", "leads", "profile", "calendar", "students", "comm"].includes(t) ? t : "requests";
  }

  function setTab(nextTab) {
    const st = tState();
    const mapped = nextTab === "calendar" ? "students" : nextTab;
    st.tab = ["requests", "leads", "profile", "students", "comm"].includes(mapped) ? mapped : "requests";
    saveState();
  }

  function toggleArrayVal(arr, val, minOne) {
    const list = Array.isArray(arr) ? arr.slice() : [];
    const idx = list.indexOf(val);
    if (idx >= 0) {
      if (minOne && list.length <= 1) return list;
      list.splice(idx, 1);
    } else {
      list.push(val);
    }
    return list;
  }


  function normalizeLeadList(arr) {
    if (!Array.isArray(arr)) return DEFAULT_WA_LEADS.slice();
    const valid = WA_LEAD_OPTIONS.map((o) => o.id);
    const out = [];
    valid.forEach((id) => {
      if (arr.includes(id) && !out.includes(id)) out.push(id);
    });
    return out;
  }

  function ensureTelemostUrl(st, req) {
    const mktState = typeof _ctx.mkt === "function" ? _ctx.mkt() : null;
    const isTm = (u) => /^https:\/\/telemost\.yandex\.(ru|com)\//i.test(String(u || "").trim());
    const reqUrl = String((req && req.telemostUrl) || "").trim();
    if (isTm(reqUrl)) return reqUrl;
    const mktUrl = String((mktState && mktState.telemostUrl) || "").trim();
    if (isTm(mktUrl)) return mktUrl;
    const stUrl = String((st && st.telemostUrl) || "").trim();
    if (isTm(stUrl)) return stUrl;
    const code = String(Math.floor(10000000000000 + Math.random() * 89999999999999)).slice(0, 14);
    const gen = `https://telemost.yandex.ru/j/${code}`;
    if (st) {
      st.telemostUrl = gen;
      saveState();
    }
    if (mktState) {
      mktState.telemostUrl = gen;
      if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
    }
    return gen;
  }

  function resolveLessonContacts(st, req, stu) {
    const mktState = typeof _ctx.mkt === "function" ? _ctx.mkt() : null;
    const map = (mktState && mktState.tutorContacts && typeof mktState.tutorContacts === "object") ? mktState.tutorContacts : {};
    const ovReq = (req && req.id && map[req.id]) || {};
    const ovStu = (stu && stu.id && map[stu.id]) || {};
    const fallbackWa = isDevDemoMode() ? "79142100511" : "";
    const wa = String(ovReq.whatsapp || ovStu.whatsapp || (stu && stu.whatsapp) || (req && req.whatsapp) || fallbackWa).trim();
    const tg = String(ovReq.telegram || ovStu.telegram || (stu && stu.telegram) || (req && req.telegram) || "").trim();
    const maxH = String(ovReq.maxHandle || ovStu.maxHandle || (stu && stu.maxHandle) || (req && req.maxHandle) || "").trim();
    return {
      entity: {
        id: (stu && stu.id) || (req && req.id) || "",
        name: (req && req.studentName) || (stu && stu.name) || "Ученик",
        whatsapp: wa,
        telegram: tg,
        maxHandle: maxH
      },
      available: {
        wa: Boolean(wa),
        tg: Boolean(tg),
        max: Boolean(maxH)
      }
    };
  }

  function getLessonNotifyConfig(st, reqId, stu) {
    const map = (st && st.lessonAutoNotify && typeof st.lessonAutoNotify === "object")
      ? st.lessonAutoNotify
      : {};
    const cur = map[reqId];
    if (cur && typeof cur === "object") {
      const leads = normalizeLeadList(cur.leads);
      const lastLeads = Array.isArray(cur.lastLeads) && cur.lastLeads.length
        ? normalizeLeadList(cur.lastLeads)
        : (leads.length ? leads.slice() : DEFAULT_WA_LEADS.slice());
      return {
        enabled: leads.length > 0,
        leads,
        lastLeads
      };
    }
    const defLeads = stu ? normalizeLeadList(stu.autoLeads) : DEFAULT_WA_LEADS.slice();
    const stuEnabled = stu ? (stu.autoNotify !== false) : true;
    const leads = stuEnabled ? defLeads : [];
    return {
      enabled: leads.length > 0,
      leads,
      lastLeads: defLeads.length ? defLeads.slice() : DEFAULT_WA_LEADS.slice()
    };
  }

  function calcLessonSplit(rate, req, TDATA) {
    const cleanRate = Math.max(0, Math.round(Number(rate) || 0));
    const isManual = Boolean(req && (req.manualStudent || Number(req.feePct) === 1 || String(req.id || "").indexOf("tc-man-") === 0));
    if (isManual) {
      const fee = Math.round(cleanRate * 0.01);
      const sbpFee = Math.round(cleanRate * 0.01);
      return { total: cleanRate, fee, sbpFee, payout: Math.max(0, cleanRate - fee - sbpFee), pct: 1, sbpPct: 1, netPct: 98, isManual: true };
    }
    if (TDATA && typeof TDATA.commissionSplit === "function") {
      return Object.assign({ isManual: false }, TDATA.commissionSplit(cleanRate));
    }
    const fee = Math.round(cleanRate * 0.05);
    const sbpFee = Math.round(cleanRate * 0.01);
    return { total: cleanRate, fee, sbpFee, payout: Math.max(0, cleanRate - fee - sbpFee), pct: 5, sbpPct: 1, netPct: 94, isManual: false };
  }

  let _animSwitch = null;

  function markSwitchAnim(key, isOn) {
    _animSwitch = { key: String(key || ""), dir: isOn ? "on" : "off", ts: Date.now() };
  }

  function consumeSwitchAnimClass(key) {
    if (!_animSwitch || _animSwitch.key !== String(key || "")) return "";
    if (Date.now() - _animSwitch.ts > 1500) {
      _animSwitch = null;
      return "";
    }
    const cls = _animSwitch.dir === "on" ? " is-anim-on" : " is-anim-off";
    _animSwitch = null;
    return cls;
  }

  function renderLessonNotifyHTML(st, req, stu) {
    const reqId = (req && req.id) || "";
    const stuId = (stu && stu.id) || "";
    const cfg = getLessonNotifyConfig(st, reqId, stu);
    const animCls = consumeSwitchAnimClass("lesson:" + reqId);
    return `<div class="tc-notify-box" role="group" aria-label="Автоуведомление перед уроком">
      <div class="tc-notify-top">
        <span class="tc-notify-title">${icon("bell")}<span>Автоуведомление</span></span>
        <button type="button" class="tc-switch-pill${cfg.enabled ? " is-on" : ""}${animCls}" data-a="tc-lesson-notify-toggle" data-id="${esc(reqId)}" data-stu-id="${esc(stuId)}" aria-pressed="${cfg.enabled}"><i class="tc-switch-track" aria-hidden="true"></i><span>${cfg.enabled ? "Вкл" : "Выкл"}</span></button>
      </div>
      <div class="tc-lead-pills" role="group" aria-label="Когда напомнить">
        ${WA_LEAD_OPTIONS.map((o) => {
          const on = cfg.leads.includes(o.id);
          return `<button type="button" class="tc-lead-pill${on ? " is-on" : ""}" data-a="tc-lesson-lead-toggle" data-id="${esc(reqId)}" data-stu-id="${esc(stuId)}" data-v="${esc(o.id)}" aria-pressed="${on}">${esc(o.label)}</button>`;
        }).join("")}
      </div>
    </div>`;
  }

  function getLessonPaymentState(st, req) {
    const id = (req && req.id) || "";
    const map = (st && st.lessonPayments && typeof st.lessonPayments === "object") ? st.lessonPayments : {};
    const rec = id && map[id] && typeof map[id] === "object" ? map[id] : null;
    const paid = rec ? Boolean(rec.paid) : Boolean(req && req.paid);
    const paidAt = rec ? (Number(rec.paidAt) || 0) : (Number(req && req.paidAt) || 0);
    const remindedAt = rec ? (Number(rec.remindedAt) || 0) : (Number(req && req.payRemindedAt) || 0);
    const remindCount = rec ? (Number(rec.remindCount) || 0) : (Number(req && req.payRemindCount) || 0);
    return { paid, paidAt, remindedAt, remindCount };
  }

  function renderLessonPaymentHTML(st, req, stu) {
    const reqId = (req && req.id) || "";
    const stuId = (stu && stu.id) || "";
    const rate = Number(req && (req.counterPrice || req.offerPrice)) || (st && st.profile ? st.profile.price : 1200) || 1200;
    const pay = getLessonPaymentState(st, req);
    const remMs = payRemindRemainingMs(pay);
    const isCooldown = !pay.paid && remMs > 0;
    const isJustSent = isCooldown && isPayRemindAnimActive(reqId);
    const checkIconHTML = `<span class="tc-pay-check" aria-hidden="true"><svg viewBox="0 0 20 20" fill="none"><circle class="tc-pay-check-ring" cx="10" cy="10" r="8.2" stroke="currentColor" stroke-width="1.6"/><path class="tc-pay-check-mark" d="M6.1 10.3l2.6 2.6 5.2-5.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
    const subText = pay.paid
      ? (pay.paidAt ? `Подтверждено · ${esc(formatTimestamp(pay.paidAt))}` : "Оплата подтверждена автоматически")
      : (pay.remindedAt ? `Напоминание отправлено · ${esc(formatTimestamp(pay.remindedAt))}` : "Ожидается оплата перед уроком");
    const btnHTML = pay.paid
      ? ""
      : (isCooldown
        ? `<button type="button" class="btn soft sm tc-pay-notify-btn is-sent is-cooldown${isJustSent ? " is-just-sent" : ""}" data-a="tc-pay-remind" data-id="${esc(reqId)}" data-stu-id="${esc(stuId)}" data-tc-pay-remind-id="${esc(reqId)}" disabled aria-disabled="true" title="Повторно можно отправить через 10 мин">${checkIconHTML}${isJustSent ? `<span class="tc-pay-btn-label">Напоминание отправлено</span>` : `<span class="tc-pay-btn-label">Повторно через <b class="num" data-tc-pay-remind-cd="${esc(reqId)}">${esc(formatShortCountdown(remMs))}</b></span>`}</button>`
        : `<button type="button" class="btn soft sm tc-pay-notify-btn${pay.remindedAt ? " is-sent" : ""}" data-a="tc-pay-remind" data-id="${esc(reqId)}" data-stu-id="${esc(stuId)}">${icon("bell")}<span>${pay.remindedAt ? "Напомнить об оплате ещё раз" : "Уведомить об оплате"}</span></button>`);
    return `<div class="tc-pay-box${pay.paid ? " is-paid" : " is-unpaid"}" role="group" aria-label="Статус оплаты урока">
      <div class="tc-pay-top">
        <div class="tc-pay-info">
          <span class="tc-pay-title"><i class="tc-pay-dot" aria-hidden="true"></i><b>${pay.paid ? `Оплачено · ${rate.toLocaleString("ru-RU")} ₽` : `Не оплачено · ${rate.toLocaleString("ru-RU")} ₽`}</b></span>
          <span class="tc-pay-sub">${subText}</span>
        </div>
      </div>
      ${btnHTML}
    </div>`;
  }

  function getCtx() { return _ctx; }

  EGE._tutorCab = Object.assign(EGE._tutorCab || {}, {
    TC_LS_KEY, DAY_MS, FOUR_HOURS_MS, PAY_REMIND_COOLDOWN_MS, DAY_LIST, EXAM_OPTIONS, FORMAT_OPTIONS,
    CITY_OPTIONS, TZ_OPTIONS, WA_LEAD_OPTIONS, DEFAULT_WA_LEADS, AUTO_CHANNELS, AUTO_BUMP_HOURS,
    GOAL_PRESETS, QUICK_TEMPLATES, DEFAULT_REQUESTS, DEFAULT_STUDENTS,
    DEMO_REQ_IDS, DEMO_STUDENT_IDS, DEMO_PAYOUT_IDS,
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS, SBP_BANK_IDS, validateInn12,
    isDevDemoMode, setDemoMode, hydrateFromBackend, ensureServerHydrated, resetSession,
    mapServerBookingToRequest, mapServerPayoutToRow, deriveStudentsFromBookings, formatIsoShort,
    getCtx, configure, getTDATA, getTutorSlug, applyRtEventToCabinet,
    ensureRealtimeConnected, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList, normalizeLeadList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    markSwitchAnim, consumeSwitchAnimClass,
    ensureTelemostUrl, resolveLessonContacts, getLessonNotifyConfig, getLessonPaymentState, calcLessonSplit, renderLessonNotifyHTML, renderLessonPaymentHTML,
    checkAutoBumpDue, formatCountdown, formatShortCountdown, autoBumpRemainingMs, manualBumpRemainingMs, payRemindRemainingMs, markPayRemindAnim,
    ensureCountdownTimer, clampStep, profileCompleteness, buildMarketTutorPayload,
    emptySlotsMap, normalizeSlotsMap, countSlots, mergeAllProfileSlots,
    createEmptySearchProfile, getEditingSearchProfile, syncProfileMirror, applyServerProfile, applyServerProfiles,
    syncPublishedTutor, dayDowFromLabel, syncedRequests, findReq, updateReq,
    pendingCount, renderDataTable, getTab, setTab, toggleArrayVal
  });
})();
