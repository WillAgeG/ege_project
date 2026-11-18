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
    { id: "30m", label: "За 30 мин" },
    { id: "1h", label: "За 1 ч" },
    { id: "2h", label: "За 2 ч" },
    { id: "24h", label: "За 24 ч" }
  ];
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
      status: "accepted",
      createdLabel: "Вчера"
    }
  ];

  const DEFAULT_STUDENTS = [
    { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", startScore: 58, curScore: 76, targetScore: 88, lessonsDone: 6, hw: "Линия №28 (сцепление генов) — сдать до Сб", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio", autoNotify: true, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 },
    { id: "st-darya", name: "Дарья В.", exam: "ОГЭ · Русский", startScore: 22, curScore: 31, targetScore: 36, lessonsDone: 4, hw: "Синтаксис и сжатое изложение — вариант №4", lessonDay: "Понедельник", lessonTime: "18:00", whatsapp: "+7 (914) 210-05-12", telegram: "+7 (914) 210-05-12", autoNotify: false, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 },
    { id: "st-timur", name: "Тимур К.", exam: "ЕГЭ · Химия", startScore: 64, curScore: 81, targetScore: 92, lessonsDone: 8, hw: "№34 на олеум и массовую долю — 5 задач", lessonDay: "Суббота", lessonTime: "16:00", whatsapp: "+7 (914) 210-05-13", telegram: "@timur_chem", autoNotify: true, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 }
  ];

  let _ctx = {};
  let _cache = null;
  let _countdownTimer = null;
  let _rtUnsub = null;

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
    if (EGE.kit && typeof EGE.kit.entitySlug === "function") {
      return EGE.kit.entitySlug({ slug: p.slug, name: p.name || "tutor" });
    }
    return String(p.name || "tutor").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "") || "tutor-demo";
  }

  function applyRtEventToCabinet(evt) {
    if (!evt || evt.eventType !== "market.bid.created") return;
    const p = evt.payload || {};
    const st = tState();
    const rawId = String(p.bookingId || p.id || evt.id || Date.now());
    const mktState = typeof _ctx.mkt === "function" ? _ctx.mkt() : null;
    const mktBookings = (mktState && Array.isArray(mktState.bookings)) ? mktState.bookings : [];
    const inMarket = mktBookings.some((b) => String(b.id) === rawId);
    const reqId = "rt-" + rawId;
    if (!inMarket && !(st.requests || []).some((r) => r.id === reqId || String(r.mktId || "") === rawId)) {
      const rate = Number(p.offerPrice) || st.profile.price;
      st.requests = st.requests || [];
      st.requests.unshift({
        id: reqId,
        mktId: rawId,
        studentName: p.studentName || "Заявка ученика (Live)",
        exam: p.exam || "ЕГЭ",
        subjectName: p.subjectName || "Подготовка",
        format: p.format || "Онлайн",
        dow: p.dow != null ? String(p.dow) : dayDowFromLabel(p.dayLabel),
        dayIso: p.dayIso || "",
        dayLabel: p.dayLabel || "Ближайший слот",
        hour: p.hour || "14:00",
        offerPrice: rate,
        counterPrice: Number(p.counterPrice || rate) || rate,
        tutorPrice: Number(p.tutorPrice) || st.profile.price,
        marketPrice: Math.round((Number(p.tutorPrice) || st.profile.price) * 1.28),
        note: p.note || evt.message || "Новая ставка с витрины /market",
        status: "pending",
        createdLabel: "Live · только что"
      });
      saveState();
    }
    if (typeof _ctx.notifySide === "function") {
      _ctx.notifySide(evt.title || "Новая ставка от ученика", evt.message || "Проверьте вкладку «Заявки»");
    }
    if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
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
      openSlots: st.slots,
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
    ensureRealtimeConnected();
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
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

  function defaultState() {
    const profName =
      (typeof _ctx.profile === "function" && _ctx.profile().name) ||
      (_ctx.store && _ctx.store.user && (_ctx.store.user.displayName || _ctx.store.user.username)) ||
      "";
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
      calAddHour: "",
      calAddOpen: false,
      calImportOpen: false,
      calImportDraft: "",
      calendarSync: {
        gcalConnected: false,
        icsUrl: "/api/calendar/anna-sokolova.ics",
        googleSubscribeUrl: "",
        googleTemplateUrl: "",
        eventCount: 0,
        busySlots: [],
        conflicts: [],
        lastSyncAt: 0
      },
      statsPeriod: "7d",
      chartStyle: "sticks",
      monthlyGoal: 60000,
      bumpedToday: false,
      autoBump24h: true,
      autoBumpHour: "09:00",
      lastBumpAt: now - 18 * 3600000,
      lastAutoBumpAt: now - 18 * 3600000,
      lastManualBumpAt: 0,
      bumpCount: 7,
      profilePreview: false,
      published: false,
      subjMenuOpen: false,
      tzMenuOpen: false,
      leadsSubj: "all",
      leadsMineOnly: false,
      waSettings: {
        enabled: true,
        lead: "2h",
        channels: ["wa", "tg", "max"],
        template: "Здравствуйте, {имя}! Напоминаю, что скоро будет урок ({предмет}) — {день} в {время}. Материалы и ссылку пришлю перед занятием."
      },
      profile: {
        name: profName || "Анна Соколова",
        headline: "Эксперт ЕГЭ и ОГЭ · Подготовка к медвузу",
        photo: "",
        subject: "bio",
        subjects: ["bio"],
        customBadges: ["Эксперт жюри ВсОШ", ""],
        exams: ["ЕГЭ", "ОГЭ"],
        formats: ["Онлайн"],
        city: "Якутск",
        timezone: "UTC+9",
        whatsapp: "+7 (914) 210-01-99",
        telegram: "@anna_sokolova_ege",
        education: "СВФУ им. М.К. Аммосова · Педагог-исследователь",
        expYears: 6,
        avgScore: 86,
        highScorers: 14,
        trialMode: "paid",
        trialPrice: 490,
        trialFree: false,
        customSkills: "Задания ФИПИ 2027, №28 Генетика, разбор пробников, медвуз",
        price: 1200,
        minFair: 900,
        bio: "Экспертная подготовка без шаблонов: разбираем задания ФИПИ, ловушки второй части и пишем пробники на 85+."
      },
      slots: {
        "1": ["14:00", "16:00", "19:00"],
        "2": ["10:00", "18:00"],
        "3": ["12:00", "16:00", "20:00"],
        "4": ["15:00", "18:00"],
        "5": ["10:00", "14:00", "19:00"],
        "6": ["10:00", "12:00", "16:00", "18:00"],
        "0": ["11:00", "15:00"]
      },
      requests: DEFAULT_REQUESTS.map((r) => Object.assign({}, r)),
      students: DEFAULT_STUDENTS.map((s) => Object.assign({}, s)),
      payoutSettings: {
        method: "sbp",
        bank: "АЭБ (Алмазэргиэнбанк)",
        phone: "+7 (914) 210-01-99",
        card: "2200 7004 8210 4419",
        npdReceipt: true
      },
      payouts: [
        {
          id: "out-seed-1",
          createdAtLabel: "10 нояб., 18:20",
          amount: 4500,
          method: "sbp",
          methodLabel: "СБП · АЭБ (Алмазэргиэнбанк)",
          destination: "+7 (914) 210-01-99",
          npdReceipt: true,
          fee: 0,
          status: "succeeded",
          statusLabel: "Исполнено ✓"
        }
      ]
    };
  }

  function tState() {
    if (_cache) return _cache;
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
      _cache.profile.whatsapp = formatPhone(_cache.profile.whatsapp || def.profile.whatsapp);
      _cache.profile.telegram = formatTelegram(_cache.profile.telegram || def.profile.telegram);
      if (!["paid", "free", "none"].includes(_cache.profile.trialMode)) {
        _cache.profile.trialMode = saved.profile && saved.profile.trialFree === true ? "free" : "paid";
      }
      if (_cache.profile.trialMode === "none") {
        _cache.profile.trialPrice = null;
        _cache.profile.trialFree = false;
      } else if (_cache.profile.trialMode === "free") {
        _cache.profile.trialPrice = 0;
        _cache.profile.trialFree = true;
      } else {
        const tp = Number(_cache.profile.trialPrice);
        _cache.profile.trialPrice = Number.isFinite(tp) && tp > 0 ? Math.min(99999, Math.round(tp)) : 490;
        _cache.profile.trialFree = false;
      }
      _cache.lastAutoBumpAt = Number(_cache.lastAutoBumpAt || _cache.lastBumpAt) || def.lastAutoBumpAt;
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
      _cache.requests = Array.isArray(saved.requests) && saved.requests.length ? saved.requests : def.requests;
      _cache.students = Array.isArray(saved.students) && saved.students.length
        ? saved.students.map((s, idx) => {
            const merged = Object.assign({}, def.students[idx] || { lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio", autoNotify: true, autoChannels: ["wa", "tg", "max"], lastRemindedAt: 0 }, s);
            merged.whatsapp = formatPhone(merged.whatsapp || "+7 (914) 210-05-11");
            merged.telegram = formatTelegram(merged.telegram || "");
            merged.autoChannels = normalizeChannelList(merged.autoChannels);
            return merged;
          })
        : def.students;
      const rawPs = saved.payoutSettings && typeof saved.payoutSettings === "object" ? saved.payoutSettings : {};
      _cache.payoutSettings = {
        method: rawPs.method === "card" ? "card" : "sbp",
        bank: String(rawPs.bank || def.payoutSettings.bank),
        phone: formatPhone(rawPs.phone) || def.payoutSettings.phone,
        card: formatCardMask(rawPs.card) || def.payoutSettings.card,
        npdReceipt: rawPs.npdReceipt !== undefined ? !!rawPs.npdReceipt : def.payoutSettings.npdReceipt
      };
      _cache.payouts = Array.isArray(saved.payouts)
        ? saved.payouts.filter(Boolean).map((item, idx) => Object.assign({
            id: "out-" + (idx + 1),
            createdAtLabel: "Сегодня",
            amount: 0,
            method: "sbp",
            methodLabel: "СБП",
            destination: _cache.payoutSettings.phone,
            npdReceipt: true,
            fee: 0,
            status: "succeeded",
            statusLabel: "Исполнено ✓"
          }, item))
        : def.payouts.map((p) => Object.assign({}, p));
    } else {
      _cache = def;
    }
    if (!_cache.chartStyle) _cache.chartStyle = "sticks";
    if (!_cache.leadCounterPrices || typeof _cache.leadCounterPrices !== "object") _cache.leadCounterPrices = {};
    if (!_cache.calendarSync || typeof _cache.calendarSync !== "object") {
      _cache.calendarSync = Object.assign({}, defaultState().calendarSync);
    }
    if (!Array.isArray(_cache.calendarSync.busySlots)) _cache.calendarSync.busySlots = [];
    if (!Array.isArray(_cache.calendarSync.conflicts)) _cache.calendarSync.conflicts = [];
    checkAutoBumpDue(_cache, true);
    return _cache;
  }

  function saveState() {
    try {
      localStorage.setItem(TC_LS_KEY, JSON.stringify(tState()));
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
    }, 1000);
  }

  function clampStep(val, delta, lo, hi) {
    const raw = (val != null && Number.isFinite(Number(val))) ? Number(val) : lo;
    const cur = Math.round(raw / 50) * 50;
    return Math.max(lo, Math.min(hi, cur + delta));
  }

  function profileCompleteness(p, slots) {
    const totalSlots = Object.keys(slots || {}).reduce((s, k) => s + (Array.isArray(slots[k]) ? slots[k].length : 0), 0);
    const checks = [
      { ok: String(p.name || "").trim().length >= 3, tip: "укажите имя и фамилию" },
      { ok: String(p.headline || "").trim().length >= 8, tip: "добавьте заголовок специализации" },
      { ok: String(p.education || "").trim().length >= 6, tip: "укажите вуз или квалификацию" },
      { ok: Number(p.avgScore) >= 60, tip: "заполните средний балл учеников" },
      { ok: String(p.customSkills || "").trim().length >= 8, tip: "впишите ключевые навыки подготовки" },
      { ok: String(p.bio || "").trim().length >= 30, tip: "опишите подход к подготовке (30+ симв.)" },
      { ok: String(p.whatsapp || "").replace(/\D+/g, "").length >= 10, tip: "добавьте WhatsApp / контакт" },
      { ok: totalSlots >= 4, tip: "откройте минимум 4 окна 10:00–20:00" }
    ];
    const done = checks.filter((c) => c.ok).length;
    return {
      pct: Math.round((done / checks.length) * 100),
      missing: checks.filter((c) => !c.ok).map((c) => c.tip),
      totalSlots
    };
  }

  function buildMarketTutorPayload(st) {
    const TDATA = getTDATA();
    const p = st.profile;
    const subjIds = Array.isArray(p.subjects) && p.subjects.length ? p.subjects.slice() : [p.subject || "bio"];
    const subjNames = (TDATA && typeof TDATA.subjectNamesForIds === "function")
      ? TDATA.subjectNamesForIds(subjIds)
      : subjIds.map((id) => {
          const hit = (TDATA && TDATA.SUBJECTS || []).find((s) => s.id === id);
          return hit ? hit.name : "";
        }).filter(Boolean);
    const cleanSlots = {};
    Object.keys(st.slots || {}).forEach((k) => {
      if (Array.isArray(st.slots[k]) && st.slots[k].length) cleanSlots[Number(k)] = st.slots[k].slice();
    });
    const years = Math.max(1, Number(p.expYears) || 1);
    const avg = Math.max(50, Math.min(100, Number(p.avgScore) || 84));
    const isPro = p.price >= 1400;
    const customBadges = Array.isArray(p.customBadges)
      ? p.customBadges.map((b) => String(b || "").trim().slice(0, 36)).filter(Boolean).slice(0, 2)
      : [];
    const customSkillsText = String(p.customSkills || "").trim();
    return {
      id: "tc-my-profile",
      name: p.name || "Преподаватель",
      photo: p.photo || "",
      subject: subjIds[0] || "bio",
      subjects: subjIds,
      subjectName: subjNames.length ? subjNames.join(" · ") : "Биология",
      customBadges,
      customSkillsText,
      exams: Array.isArray(p.exams) && p.exams.length ? p.exams.slice() : ["ЕГЭ"],
      formats: Array.isArray(p.formats) && p.formats.length ? p.formats.slice() : ["Онлайн"],
      city: p.city || "Якутск",
      timezone: p.timezone || "UTC+9",
      whatsapp: String(p.whatsapp || "79142100199").replace(/\D+/g, "") || "79142100199",
      telegram: p.telegram || "",
      price: p.price != null ? Number(p.price) : 1200,
      minFair: Math.min(p.price != null ? Number(p.price) : 1200, p.minFair != null ? Number(p.minFair) : 900),
      trialMode: ["paid", "free", "none"].includes(p.trialMode) ? p.trialMode : "paid",
      trialPrice: p.trialMode === "none" ? null : (p.trialMode === "free" ? 0 : (Number(p.trialPrice) > 0 ? Math.min(99999, Math.round(Number(p.trialPrice))) : 490)),
      trialFree: p.trialMode === "free",
      marketPrice: isPro ? Math.max(1150, Math.round(((Number(p.price) || 1200) * 0.85) / 50) * 50) : Math.round(((Number(p.price) || 1200) * 1.28) / 50) * 50,
      tier: isPro ? "pro" : "budget",
      qualBadge: isPro ? "Профиль · Эксперт" : "Проверенная анкета",
      rating: 4.9,
      reviews: 18 + Math.min(20, Number(p.highScorers) || 0),
      exp: `${years} ${plural(years, "год", "года", "лет")} · ср. балл ${avg}`,
      tag: p.headline || customSkillsText || "Подготовка ФИПИ",
      source: "Кабинет",
      verified: true,
      bumpedToday: !!(st.bumpedToday || st.autoBump24h),
      bumpText: st.autoBump24h ? `Автоподнятие 24 ч (${st.autoBumpHour})` : (st.bumpedToday ? "Поднята сегодня" : "Ваша анкета"),
      bio: p.bio || "Подготовка к ЕГЭ и ОГЭ с проверкой пробников.",
      slots: Object.keys(cleanSlots).length ? cleanSlots : { 6: ["10:00", "14:00"] }
    };
  }

  function syncPublishedTutor(st) {
    const TDATA = getTDATA();
    if (!st.published || !TDATA || typeof TDATA.upsertCustomTutor !== "function") return null;
    return TDATA.upsertCustomTutor(buildMarketTutorPayload(st));
  }

  function dayDowFromLabel(lbl) {
    const s = String(lbl || "").trim().slice(0, 2).toLowerCase();
    const hit = DAY_LIST.find((d) => d.wd.toLowerCase() === s);
    return hit ? hit.dow : "6";
  }

  function syncedRequests() {
    const st = tState();
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
      status: bk.status || "pending",
      createdLabel: "С витрины /market"
    }));
    const marketIds = new Set(fromMarket.map((x) => x.id));
    const localOnly = (st.requests || []).filter((r) => !marketIds.has(r.id));
    return fromMarket.concat(localOnly);
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
    return ["requests", "leads", "profile", "calendar", "students"].includes(t) ? t : "requests";
  }

  function setTab(nextTab) {
    const st = tState();
    st.tab = ["requests", "leads", "profile", "calendar", "students"].includes(nextTab) ? nextTab : "requests";
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


  function getCtx() { return _ctx; }

  EGE._tutorCab = Object.assign(EGE._tutorCab || {}, {
    TC_LS_KEY, DAY_MS, FOUR_HOURS_MS, DAY_LIST, EXAM_OPTIONS, FORMAT_OPTIONS,
    CITY_OPTIONS, TZ_OPTIONS, WA_LEAD_OPTIONS, AUTO_CHANNELS, AUTO_BUMP_HOURS,
    GOAL_PRESETS, QUICK_TEMPLATES, DEFAULT_REQUESTS, DEFAULT_STUDENTS,
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS,
    getCtx, configure, getTDATA, getTutorSlug, applyRtEventToCabinet,
    ensureRealtimeConnected, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    ensureCountdownTimer, clampStep, profileCompleteness, buildMarketTutorPayload,
    syncPublishedTutor, dayDowFromLabel, syncedRequests, findReq, updateReq,
    pendingCount, renderDataTable, getTab, setTab, toggleArrayVal
  });
})();
