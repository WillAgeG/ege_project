/* Личный кабинет преподавателя (Вектор ЕГЭ + Саха Gold):
   - входящие заявки с торгом ±100 ₽ и расчётом «На руки 95%»;
   - конструктор профиля с загрузкой фото / «Без фото» и публикацией в каталог /market;
   - календарь записанных учеников по неделям и часам 10:00–20:00;
   - выплаты, статистика доходов, цель на месяц и автопродвижение 24 ч / 4 ч;
   - трекер баллов ЕГЭ учеников и автоуведомления в WhatsApp. */
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
      title: "Вежливый встречный торг ±100 ₽",
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
        trialFree: true,
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
    const cur = Math.round((Number(val) || lo) / 100) * 100;
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
      price: Number(p.price) || 1200,
      minFair: Math.min(Number(p.price) || 1200, Number(p.minFair) || 900),
      marketPrice: isPro ? Math.max(1150, Math.round((p.price * 0.85) / 50) * 50) : Math.round((p.price * 1.28) / 50) * 50,
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

  function renderRequestCard(req, st, isFirstPending) {
    const TDATA = getTDATA();
    const bidRate = Number(req.counterPrice || req.offerPrice) || st.profile.price;
    const tutorRate = Number(req.tutorPrice) || st.profile.price;
    const mktRate = Number(req.marketPrice) || Math.round(tutorRate * 1.25);
    const sp = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(bidRate)
      : { total: bidRate, fee: Math.round(bidRate * 0.05), payout: Math.round(bidRate * 0.95), pct: 5 };
    const isPending = req.status === "pending";
    const isAccepted = req.status === "accepted";
    const isCountered = req.status === "countered";

    const statusBadge = isAccepted
      ? `<span class="chip confirm">✓ Подтверждено</span>`
      : isCountered
        ? `<span class="chip accent">Предложена ставка ${bidRate.toLocaleString("ru-RU")} ₽/ч</span>`
        : req.status === "declined"
          ? `<span class="chip bad">Отклонено</span>`
          : `<span class="chip notif">Ожидает ответа · ${esc(req.createdLabel || "новое")}</span>`;

    return `<article class="tc-req-card${isPending ? " is-pending" : isAccepted ? " is-accepted" : ""}"${isFirstPending ? ' id="tc-first-pending"' : ""}>
      <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:flex-start">
        <div class="row" style="gap:10px;min-width:0">
          <span class="tutor-avatar" aria-hidden="true">${esc(initials(req.studentName))}</span>
          <div class="stack" style="gap:2px;min-width:0">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <b>${esc(req.studentName)}</b>
              <span class="chip">${esc(req.exam)} · ${esc(req.subjectName)}</span>
            </div>
            <div class="small muted">${esc(req.dayLabel)} в <b class="num" style="color:var(--ink)">${esc(req.hour)}</b> · ${esc(req.format)}</div>
          </div>
        </div>
        ${statusBadge}
      </div>

      <div class="stack" style="gap:6px">
        <div class="hh-price-row">${priceHeadlineHTML(mktRate, bidRate, false)}</div>
        <div class="hh-diff-strip">
          ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: mktRate, offerPrice: bidRate, qualBadge: "Повышенная ставка · Профи" })}
          <span class="diff-tag rate num">На руки 95%: ${sp.payout.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>

      ${req.note ? `<div class="tc-req-quote">${esc(req.note)}</div>` : ""}

      ${(isPending || isCountered) ? `
        <div class="hh-price-stepper compact">
          <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="-100">−100 ₽</button>
          <div class="hh-step-readout"><b class="num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted">ваша цена</span></div>
          <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="100">+100 ₽</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(req.id)}">${icon("check")}<span>Подтвердить ${bidRate.toLocaleString("ru-RU")} ₽</span></button>
          ${bidRate !== req.offerPrice ? `<button type="button" class="btn soft sm" data-a="tc-req-counter" data-id="${esc(req.id)}">Отправить контр-ставку</button>` : ""}
          <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(req.id)}">Отклонить</button>
        </div>` : isAccepted ? `
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <span class="small ink2">Выплата после урока: <b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b> <span class="muted">(сбор ${sp.fee} ₽)</span></span>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
              ? EGE.kit.messengerLinksHTML({
                  entity: { id: req.id, name: req.studentName, whatsapp: req.whatsapp || "79142100511" },
                  message: `Здравствуйте, ${req.studentName}! Подтверждаю урок (${req.subjectName}, ${req.dayLabel} в ${req.hour}) через Вектор ЕГЭ.`,
                  primaryLabel: "Написать ученику · WA",
                  compact: true
                })
              : `<button type="button" class="btn confirm sm" data-a="tc-req-msg" data-id="${esc(req.id)}">${icon("msg")}<span>Написать ученику</span></button>`}
          </div>
        </div>` : `
        <div class="row" style="gap:8px">
          <button type="button" class="btn soft sm" data-a="tc-req-restore" data-id="${esc(req.id)}">Вернуть в рассмотрение</button>
        </div>`}
    </article>`;
  }

  function renderSlotsPanelHTML(st, TDATA) {
    const activeDayObj = DAY_LIST.find((d) => d.dow === st.activeDow) || DAY_LIST[5];
    const daySlots = Array.isArray(st.slots[activeDayObj.dow]) ? st.slots[activeDayObj.dow] : [];
    const totalSlotsCount = Object.keys(st.slots).reduce((s, k) => s + (Array.isArray(st.slots[k]) ? st.slots[k].length : 0), 0);
    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    return `<section class="card stack" style="gap:12px" aria-label="Окна времени 10:00–20:00">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Слоты 10:00–20:00</div>
          <h2 class="h2">Свободные окна (${totalSlotsCount})</h2>
        </div>
        <span class="chip accent num">${esc(activeDayObj.wd)}: ${daySlots.length} ч</span>
      </div>
      <div class="cal-days" aria-label="День недели">
        ${DAY_LIST.map((d) => {
          const cnt = Array.isArray(st.slots[d.dow]) ? st.slots[d.dow].length : 0;
          return `<button type="button" class="day-cir${st.activeDow === d.dow ? " on" : ""}" data-a="tc-day" data-dow="${d.dow}">
            <span class="day-wd">${d.wd}</span>
            <span class="day-dot">${cnt}</span>
            <span class="day-cnt">${cnt ? "откр." : "выкл."}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="hour-circles" aria-label="Часы на день">
        ${hours.map((h) => {
          const on = daySlots.includes(h);
          return `<button type="button" class="hr-cir${on ? " on" : ""}" data-a="tc-slot-toggle" data-hour="${h}" aria-pressed="${on}">
            <span>${h}</span>
            <span class="hr-cnt">${on ? "✓" : "—"}</span>
          </button>`;
        }).join("")}
      </div>
      <span class="small muted">Нажмите на час, чтобы открыть или закрыть запись на ${esc(activeDayObj.full.toLowerCase())}.</span>
    </section>`;
  }

  function renderDataTable(opts) {
    if (EGE.charts && typeof EGE.charts.dataTableHTML === "function") {
      return EGE.charts.dataTableHTML(opts);
    }
    return "";
  }

  function renderRequestsTab(st, TDATA, allReqs, pendingList, acceptedList, baseSplit) {
    const p = st.profile;
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "bio", name: "Биология" }];
    const reqCols = [3, 5, 7].includes(Number(st.reqTblCols)) ? Number(st.reqTblCols) : 5;
    const reqFilter = ["pending", "accepted"].includes(st.filter) ? st.filter : "all";
    const firstPending = allReqs.find((r) => r.status === "pending");
    const firstPendingId = firstPending ? firstPending.id : "";

    const reqMetrics = (req) => {
      const bidRate = Number(req.counterPrice || req.offerPrice) || p.price;
      const tutorRate = Number(req.tutorPrice) || p.price;
      const mktRate = Number(req.marketPrice) || Math.round(tutorRate * 1.25);
      const sp = TDATA && typeof TDATA.commissionSplit === "function"
        ? TDATA.commissionSplit(bidRate)
        : { total: bidRate, fee: Math.round(bidRate * 0.05), payout: Math.round(bidRate * 0.95), pct: 5 };
      return { bidRate, tutorRate, mktRate, sp };
    };

    const reqColumns = [
      {
        key: "student",
        label: "Ученик и предмет",
        render: (req, h) => `<div class="row" style="gap:10px;align-items:flex-start;min-width:0">
          <span class="tutor-avatar" aria-hidden="true">${esc(initials(req.studentName))}</span>
          <div class="stack" style="gap:3px;min-width:0">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <b>${esc(req.studentName)}</b>
              <span class="chip">${esc(req.exam)} · ${esc(req.subjectName)}</span>
            </div>
            <span class="small muted">${h.cols === 3 ? `${esc(req.dayLabel)} в ${esc(req.hour)} · ${esc(req.format)} · ` : ""}${esc(req.createdLabel || "новое")}</span>
          </div>
        </div>`
      },
      {
        key: "slot",
        label: "Слот",
        minCols: 5,
        render: (req) => `<div class="stack" style="gap:2px">
          <b class="num">${esc(req.dayLabel)} · ${esc(req.hour)}</b>
          <span class="small muted">${esc(req.format || "Онлайн")}</span>
        </div>`
      },
      {
        key: "rate",
        label: "Ставка ±100 ₽",
        num: true,
        render: (req) => {
          const { bidRate, sp } = reqMetrics(req);
          const canStep = req.status === "pending" || req.status === "countered";
          return `<div class="stack" style="gap:6px">
            <div class="row" style="gap:6px;flex-wrap:wrap;align-items:baseline">
              <b class="num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b>
              <span class="small muted num">На руки 95%: <b style="color:var(--confirm)">${sp.payout.toLocaleString("ru-RU")} ₽</b></span>
            </div>
            ${canStep ? `<div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="100">+100 ₽</button>
            </div>` : ""}
          </div>`;
        }
      },
      {
        key: "marketAndNote",
        label: "Рынок и заметка",
        minCols: 5,
        render: (req) => {
          const { bidRate, tutorRate, mktRate } = reqMetrics(req);
          return `<div class="stack" style="gap:5px;min-width:0">
            <div class="hh-diff-strip">
              ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: mktRate, offerPrice: bidRate, qualBadge: "Повышенная ставка · Профи" })}
            </div>
            ${req.note ? `<div class="small ink2">${esc(req.note)}</div>` : `<span class="small muted">Без комментария</span>`}
          </div>`;
        }
      },
      {
        key: "channel",
        label: "Канал / Источник",
        minCols: 7,
        render: (req) => `<div class="stack" style="gap:4px">
          <span class="small"><b>${esc(req.createdLabel || "С витрины /market")}</b></span>
          <div class="row" style="gap:4px;flex-wrap:wrap">
            <span class="chip">WA</span>
            <span class="chip">TG</span>
            <span class="chip">MAX</span>
          </div>
        </div>`
      },
      {
        key: "payoutSplit",
        label: "Выплата 95%",
        minCols: 7,
        num: true,
        render: (req) => {
          const { mktRate, sp } = reqMetrics(req);
          return `<div class="stack" style="gap:2px">
            <b class="num" style="color:var(--confirm)">${sp.payout.toLocaleString("ru-RU")} ₽</b>
            <span class="small muted num">рынок ${mktRate.toLocaleString("ru-RU")} ₽ · сбор ${sp.fee} ₽</span>
          </div>`;
        }
      },
      {
        key: "actions",
        label: "Действия и статус",
        isActions: true,
        render: (req) => {
          const { bidRate, sp } = reqMetrics(req);
          const isPending = req.status === "pending";
          const isAccepted = req.status === "accepted";
          const isCountered = req.status === "countered";
          const statusChip = isAccepted
            ? `<span class="bb-tbl-st is-confirmed">✓ Подтверждено</span>`
            : isCountered
              ? `<span class="bb-tbl-st is-info">Предложена ставка ${bidRate.toLocaleString("ru-RU")} ₽/ч</span>`
              : req.status === "declined"
                ? `<span class="bb-tbl-st is-refund">Отклонено</span>`
                : `<span class="bb-tbl-st is-pending">Ожидает ответа</span>`;

          if (isPending || isCountered) {
            return `<div class="stack" style="gap:6px">
              ${statusChip}
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(req.id)}">${icon("check")}<span>Подтвердить ${bidRate.toLocaleString("ru-RU")} ₽</span></button>
                ${bidRate !== req.offerPrice ? `<button type="button" class="btn soft sm" data-a="tc-req-counter" data-id="${esc(req.id)}">Отправить контр-ставку</button>` : ""}
                <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(req.id)}">Отклонить</button>
              </div>
            </div>`;
          }
          if (isAccepted) {
            return `<div class="stack" style="gap:6px">
              ${statusChip}
              <span class="small muted num">К выплате: <b>${sp.payout.toLocaleString("ru-RU")} ₽</b></span>
              ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                ? EGE.kit.messengerLinksHTML({
                    entity: { id: req.id, name: req.studentName, whatsapp: req.whatsapp || "79142100511", telegram: req.telegram || "", maxHandle: req.maxHandle || "" },
                    message: `Здравствуйте, ${req.studentName}! Подтверждаю урок (${req.subjectName}, ${req.dayLabel} в ${req.hour}) через Вектор ЕГЭ.`,
                    primaryLabel: "Написать ученику · WA",
                    compact: true
                  })
                : `<button type="button" class="btn confirm sm" data-a="tc-req-msg" data-id="${esc(req.id)}">${icon("msg")}<span>Написать ученику</span></button>`}
            </div>`;
          }
          return `<div class="stack" style="gap:6px">
            ${statusChip}
            <button type="button" class="btn soft sm" data-a="tc-req-restore" data-id="${esc(req.id)}">Вернуть в рассмотрение</button>
          </div>`;
        }
      }
    ];

    const requestsTableHtml = renderDataTable({
      id: "tc-requests-table",
      cardWrap: false,
      showPresetSwitch: false,
      eyebrow: "Торг в реальном времени",
      title: "Входящие заявки учеников",
      cols: reqCols,
      filter: reqFilter,
      query: st.reqTblQuery || "",
      confirmAction: "tc-req-accept",
      filterAction: "tc-req-tbl-filter",
      colsAction: "tc-req-tbl-cols",
      searchAction: "tc-req-tbl-q",
      searchId: "tc-req-tbl-q",
      searchPlaceholder: "Поиск: ученик, предмет, слот, ставка…",
      filters: [
        { id: "all", label: `Все (${allReqs.length})`, match: () => true },
        { id: "pending", label: `Ждут ответа (${pendingList.length})`, match: (r) => r.status === "pending" },
        { id: "accepted", label: `Подтверждено (${acceptedList.length})`, match: (r) => r.status === "accepted" }
      ],
      columns: reqColumns,
      rows: allReqs,
      searchFields: (r) => [r.studentName, r.exam, r.subjectName, r.dayLabel, r.hour, r.format, r.note, String(r.offerPrice || ""), String(r.counterPrice || "")].join(" "),
      rowAttrs: (r) => (r && r.id === firstPendingId ? 'id="tc-first-pending" class="is-pending-row"' : ""),
      toolbarExtraHTML: `<div class="row" style="gap:6px;flex-wrap:wrap">
        <button type="button" class="chip-btn${reqFilter === "all" ? " on" : ""}" data-a="tc-filter" data-v="all">Все</button>
        <button type="button" class="btn soft sm" data-a="tc-reset-demo">Пример заявок</button>
      </div>`,
      emptyText: "По выбранному фильтру заявок нет — сбросьте фильтр или обновите пример заявок."
    });

    return `<div class="stack" style="gap:16px">
      <section class="card stack" style="gap:12px" aria-label="Входящие заявки учеников">
        ${requestsTableHtml}
      </section>

      <div class="tc-two-col" aria-label="Быстрые настройки ставки и окон">
        <form class="card stack" style="gap:12px" data-f="tc-profile">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div>
              <div class="eyebrow">Быстрая правка</div>
              <h2 class="h2">Ставка и профиль</h2>
            </div>
            <span class="chip${p.price >= 1400 ? " pro" : " accent"}">${p.price >= 1400 ? "Профи выше рынка" : "В рынке"}</span>
          </div>
          <div class="field">
            <label for="tc-name">Имя в каталоге</label>
            <input class="input" id="tc-name" name="name" data-tc="name" value="${esc(p.name)}" maxlength="48">
          </div>
          <div class="field">
            <span class="label">Предметы (мультивыбор)</span>
            <input type="hidden" name="subject" value="${esc(p.subject)}">
            ${typeof hhMultiSelectHTML === "function"
              ? hhMultiSelectHTML({
                  id: "tc-subject",
                  options: subjects.map((sb) => ({ id: sb.id, label: sb.name })),
                  values: Array.isArray(p.subjects) && p.subjects.length ? p.subjects : [p.subject || "bio"],
                  placeholder: "Выберите предметы",
                  open: !!st.subjMenuOpen,
                  toggleAction: "tc-subj-toggle",
                  pickAction: "tc-subj-pick",
                  ariaLabel: "Предметы преподавания"
                })
              : (typeof hhSelectHTML === "function"
                ? hhSelectHTML({
                    id: "tc-subject",
                    options: subjects.map((sb) => ({ id: sb.id, label: sb.name })),
                    value: p.subject,
                    open: !!st.subjMenuOpen,
                    toggleAction: "tc-subj-toggle",
                    pickAction: "tc-subj-pick",
                    ariaLabel: "Предметы преподавания"
                  })
                : `<select class="select" id="tc-subject" data-tc="subject">${subjects.map((sb) => `<option value="${esc(sb.id)}"${sb.id === p.subject ? " selected" : ""}>${esc(sb.name)}</option>`).join("")}</select>`)}
          </div>
          <div class="field">
            <span class="label">Стандартная ставка (₽/ч)</span>
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${p.price.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="field">
            <span class="label">Минимальный порог торга от учеников</span>
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${p.minFair.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
          <span class="small muted">На руки <b class="num">${baseSplit.payout.toLocaleString("ru-RU")} ₽</b> за урок. <button type="button" class="link-btn small" data-a="tc-tab" data-tab="profile">Открыть профиль →</button></span>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="submit" class="btn sm">Сохранить анкету</button>
            <button type="button" class="btn ghost sm" data-a="tc-reset-demo">Сбросить демо</button>
          </div>
        </form>
        ${renderSlotsPanelHTML(st, TDATA)}
      </div>
    </div>`;
  }

  function renderProfileTab(st, TDATA, baseSplit) {
    const p = st.profile;
    const comp = profileCompleteness(p, st.slots);
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "bio", name: "Биология" }];
    const previewCard = st.profilePreview && EGE.views.marketplace && typeof EGE.views.marketplace.tutorCardHTML === "function"
      ? EGE.views.marketplace.tutorCardHTML(buildMarketTutorPayload(st))
      : "";
    const avHTML = typeof tutorAvatarHTML === "function"
      ? tutorAvatarHTML({ photo: p.photo, name: p.name }, { cls: "lg" })
      : `<span class="tutor-avatar lg is-no-photo"><span>Без фото</span></span>`;

    return `<div class="stack" style="gap:16px">
      <div class="card stack" style="gap:10px">
        <div class="row between" style="gap:10px;flex-wrap:wrap">
          <div class="stack" style="gap:2px">
            <div class="eyebrow">Профиль преподавателя</div>
            <h2 class="h2">Заполненность профиля: <span class="num savings-gold-txt">${comp.pct}%</span></h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${st.published ? `<span class="chip confirm">✓ Опубликована для учеников</span>` : `<span class="chip notif">Черновик кабинета</span>`}
            <button type="button" class="btn soft sm" data-a="tc-preview-toggle">${st.profilePreview ? "Скрыть предпросмотр" : "Как видит ученик"}</button>
          </div>
        </div>
        <div class="tc-hh-meter" aria-label="Прогресс заполнения профиля"><i style="width:${comp.pct}%"></i></div>
        <div class="small muted">${comp.missing.length ? "До 100% рейтинга: " + esc(comp.missing.slice(0, 2).join(", ")) + "." : "Отлично! Профиль заполнен на 100% и получает приоритет в поиске."}</div>
      </div>

      ${previewCard ? `<div class="stack" style="gap:8px"><div class="eyebrow">Живой вид вашей карточки для учеников</div>${previewCard}</div>` : ""}

      <form class="card stack" style="gap:14px" data-f="tc-profile">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <h3 class="h2">1. Основная визитка и фото</h3>
          <span class="chip${p.price >= 1400 ? " pro" : " accent"}">${p.price >= 1400 ? "Эксперт выше рынка" : "Доступная ставка"}</span>
        </div>

        <div class="tc-photo-row">
          ${avHTML}
          <div class="stack" style="gap:6px;flex:1 1 200px;min-width:0">
            <b>${p.photo ? "Фото загружено в анкету" : "Сейчас отображается «Без фото»"}</b>
            <span class="small muted">Загрузите своё фото — оно обновится в анкете и предпросмотре, либо выберите «Без фото».</span>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <label class="btn soft sm" for="tc-photo-file" style="cursor:pointer">${icon("upload")}<span>Загрузить фото</span></label>
              <input type="file" id="tc-photo-file" accept="image/*" data-tc-photo="1" class="sr">
              <button type="button" class="btn ghost sm" data-a="tc-photo-clear"${p.photo ? "" : " disabled"}>Без фото</button>
            </div>
          </div>
        </div>

        <div class="tc-two-col">
          <div class="field">
            <label for="tc-hh-name">Имя и фамилия</label>
            <input class="input" id="tc-hh-name" name="name" data-tc="name" value="${esc(p.name)}" maxlength="48" placeholder="Анна Соколова">
          </div>
          <div class="field">
            <label for="tc-hh-headline">Заголовок специализации</label>
            <input class="input" id="tc-hh-headline" name="headline" data-tc="headline" value="${esc(p.headline || "")}" maxlength="72" placeholder="Эксперт ЕГЭ по биологии · медвуз">
          </div>
        </div>

        <div class="tc-two-col">
          <div class="field">
            <span class="label">Предметы преподавания (мультивыбор)</span>
            <input type="hidden" name="subject" value="${esc(p.subject)}">
            ${typeof hhMultiSelectHTML === "function"
              ? hhMultiSelectHTML({
                  id: "tc-subjects",
                  options: subjects.map((sb) => ({ id: sb.id, label: sb.name, short: sb.short })),
                  values: Array.isArray(p.subjects) && p.subjects.length ? p.subjects : [p.subject || "bio"],
                  placeholder: "Выберите предметы",
                  open: !!st.subjMenuOpen,
                  toggleAction: "tc-subj-toggle",
                  pickAction: "tc-subj-pick",
                  ariaLabel: "Предметы преподавания"
                })
              : (typeof hhSelectHTML === "function"
                ? hhSelectHTML({
                    id: "tc-subjects",
                    options: subjects.map((sb) => ({ id: sb.id, label: sb.name })),
                    value: p.subject,
                    open: !!st.subjMenuOpen,
                    toggleAction: "tc-subj-toggle",
                    pickAction: "tc-subj-pick",
                    ariaLabel: "Предметы преподавания"
                  })
                : `<select class="select" id="tc-subjects" data-tc="subject">${subjects.map((sb) => `<option value="${esc(sb.id)}"${sb.id === p.subject ? " selected" : ""}>${esc(sb.name)}</option>`).join("")}</select>`)}
          </div>
          <div class="tc-two-col">
            <div class="field">
              <span class="label">Город</span>
              <div class="hh-seg equal" role="group" aria-label="Выбор города">
                ${CITY_OPTIONS.map((c) => `<button type="button" data-a="tc-city-pick" data-v="${esc(c)}" aria-pressed="${(p.city || "Якутск") === c}">${esc(c)}</button>`).join("")}
              </div>
            </div>
            <div class="field">
              <span class="label">Часовой пояс (UTC)</span>
              ${typeof hhSelectHTML === "function"
                ? hhSelectHTML({
                    id: "tc-timezone",
                    options: TZ_OPTIONS,
                    value: p.timezone || "UTC+9",
                    open: !!st.tzMenuOpen,
                    toggleAction: "tc-tz-toggle",
                    pickAction: "tc-tz-pick",
                    ariaLabel: "Часовой пояс"
                  })
                : `<select class="select" id="tc-timezone" data-tc="timezone">${TZ_OPTIONS.map((tz) => `<option value="${esc(tz.id)}"${(p.timezone || "UTC+9") === tz.id ? " selected" : ""}>${esc(tz.label)}</option>`).join("")}</select>`}
            </div>
          </div>
        </div>

        <div class="tc-two-col">
          <div class="field">
            <span class="label">Экзамены и направления</span>
            <div class="tc-tag-grid">
              ${EXAM_OPTIONS.map((ex) => {
                const on = Array.isArray(p.exams) && p.exams.includes(ex);
                return `<button type="button" class="tc-tag" data-a="tc-exam-toggle" data-v="${esc(ex)}" aria-pressed="${on}">${esc(ex)}</button>`;
              }).join("")}
            </div>
          </div>
          <div class="field">
            <span class="label">Формат занятий</span>
            <div class="tc-tag-grid">
              ${FORMAT_OPTIONS.map((fm) => {
                const on = Array.isArray(p.formats) && p.formats.includes(fm);
                return `<button type="button" class="tc-tag" data-a="tc-format-toggle" data-v="${esc(fm)}" aria-pressed="${on}">${esc(fm)}</button>`;
              }).join("")}
            </div>
          </div>
        </div>

        <div class="eyebrow" style="margin-top:4px">2. Опыт, результаты и образование</div>
        <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(140px,1fr))">
          <div class="field">
            <label for="tc-hh-exp">Стаж (лет)</label>
            <input class="input num" id="tc-hh-exp" name="expYears" data-tc="expYears" type="number" min="1" max="50" value="${esc(p.expYears || 6)}">
          </div>
          <div class="field">
            <label for="tc-hh-avg">Средний балл ЕГЭ</label>
            <input class="input num" id="tc-hh-avg" name="avgScore" data-tc="avgScore" type="number" min="40" max="100" value="${esc(p.avgScore || 86)}">
          </div>
          <div class="field">
            <label for="tc-hh-high">Учеников на 85+ / 100</label>
            <input class="input num" id="tc-hh-high" name="highScorers" data-tc="highScorers" type="number" min="0" max="500" value="${esc(p.highScorers || 14)}">
          </div>
        </div>

        <div class="tc-two-col">
          <div class="field">
            <label for="tc-hh-edu">Образование и квалификация</label>
            <input class="input" id="tc-hh-edu" name="education" data-tc="education" value="${esc(p.education || "")}" maxlength="90" placeholder="ВУЗ, эксперт ЕГЭ, олимпиадная подготовка">
          </div>
          <div class="field">
            <label for="tc-hh-wa">Телефон (WhatsApp / MAX)</label>
            <input class="input num" id="tc-hh-wa" name="whatsapp" data-tc="whatsapp" value="${esc(formatPhone(p.whatsapp || ""))}" maxlength="22" placeholder="+7 (914) 000-00-00">
          </div>
        </div>
        <div class="field">
          <label for="tc-hh-tg">Telegram (@логин или номер телефона)</label>
          <input class="input" id="tc-hh-tg" name="telegram" data-tc="telegram" value="${esc(formatTelegram(p.telegram || ""))}" maxlength="36" placeholder="@username или +7 (914) 000-00-00">
        </div>

        <div class="field">
          <label for="tc-hh-skills">Ключевые навыки и акценты подготовки (заполните сами)</label>
          <input class="input" id="tc-hh-skills" name="customSkills" data-tc="customSkills" value="${esc(p.customSkills || "")}" maxlength="120" placeholder="Например: Генетика №28, разбор пробников ФИПИ, олимпиады">
          <span class="hint">Укажите сильные темы и специализацию своими словами — они помогают ученикам находить вашу анкету в поиске.</span>
        </div>

        <div class="field">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <span class="label">Плашки квалификации на карточке (до 2 текстов)</span>
            <span class="small muted">Показываются фиолетовыми бейджами <code>.diff-tag.pro</code> в вашей анкете</span>
          </div>
          <div class="tc-two-col">
            <input class="input" id="tc-badge-1" name="badge0" data-tc="badge0" maxlength="36" placeholder="Например: К.т.н. · эксперт жюри ВсОШ" value="${esc((p.customBadges && p.customBadges[0]) || "")}">
            <input class="input" id="tc-badge-2" name="badge1" data-tc="badge1" maxlength="36" placeholder="Например: Эксперт ЕГЭ · 90+ баллов" value="${esc((p.customBadges && p.customBadges[1]) || "")}">
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">
            ${["Эксперт жюри ВсОШ", "100-балльник ЕГЭ", "Подготовка в медвуз", "Победитель олимпиад"].map((preset) => `<button type="button" class="tc-tag" data-a="tc-badge-preset" data-v="${esc(preset)}">+ ${esc(preset)}</button>`).join("")}
            <button type="button" class="btn ghost sm" data-a="tc-badge-clear">Очистить плашки</button>
          </div>
        </div>

        <div class="eyebrow" style="margin-top:4px">3. Ставка, торг ±100 ₽ и описание методики</div>
        <div class="tc-two-col">
          <div class="field">
            <span class="label">Базовая ставка (₽/ч)</span>
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${p.price.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="field">
            <span class="label">Минимальный порог торга</span>
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${p.minFair.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="100">+100 ₽</button>
            </div>
          </div>
        </div>

        <label class="row" style="gap:8px;align-items:center;cursor:pointer">
          <input type="checkbox" class="check" name="trialFree" data-tc="trialFree"${p.trialFree ? " checked" : ""}>
          <span class="small"><b>Бесплатное знакомство 15 минут (0 ₽)</b> — повышает доверие и отклик учеников</span>
        </label>

        <div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
        <span class="small muted">Чистая выплата после 5% сбора: <b class="num savings-gold-txt">${baseSplit.payout.toLocaleString("ru-RU")} ₽/ч</b>.</span>

        <div class="field">
          <label for="tc-bio-full">О себе, программе и результатах учеников</label>
          <textarea class="textarea" id="tc-bio-full" name="bio" data-tc="bio" rows="3" maxlength="320">${esc(p.bio || "")}</textarea>
        </div>

        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn">${icon("check")}<span>Сохранить и опубликовать</span></button>
        </div>
      </form>
    </div>`;
  }

  function renderCalendarTab(st, TDATA, allReqs) {
    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    const weekOffset = st.calWeek ? 1 : 0;
    const weekDays = (TDATA && typeof TDATA.buildWeekDays === "function")
      ? TDATA.buildWeekDays(weekOffset)
      : DAY_LIST.map((d, i) => ({ dow: Number(d.dow), wd: d.wd, wdLong: d.full.toLowerCase(), num: 14 + i, month: "нояб.", shortLabel: `${d.wd}, ${14 + i} нояб.`, fullLabel: `${d.full.toLowerCase()}, ${14 + i} нояб.`, iso: "" }));
    const activeDay = weekDays.find((d) => String(d.dow) === String(st.activeDow)) || weekDays[5] || weekDays[0];
    const dowStr = String(activeDay.dow);
    const dayKeyByDow = { "1": "mon", "2": "tue", "3": "wed", "4": "thu", "5": "fri", "6": "sat", "0": "sun" };
    const activeDayKey = dayKeyByDow[dowStr] || "sat";
    const dayOpenSlots = Array.isArray(st.slots[dowStr]) ? st.slots[dowStr] : [];
    const activeLessons = allReqs.filter((r) => r.status === "accepted" && (String(r.dow || dayDowFromLabel(r.dayLabel)) === dowStr));
    const weekCount = allReqs.filter((r) => r.status === "accepted").length;

    const rtCal = (EGE.realtime && typeof EGE.realtime.getState === "function") ? EGE.realtime.getState().calendar : null;
    const cs = st.calendarSync || {};
    const busySlots = (Array.isArray(cs.busySlots) && cs.busySlots.length)
      ? cs.busySlots
      : ((rtCal && Array.isArray(rtCal.busySlots)) ? rtCal.busySlots : []);
    const conflictsList = (Array.isArray(cs.conflicts) && cs.conflicts.length)
      ? cs.conflicts
      : ((rtCal && Array.isArray(rtCal.conflicts)) ? rtCal.conflicts : []);
    const busyForActiveDay = busySlots.filter((b) => String(b.day || "") === activeDayKey || (b.dow !== undefined && b.dow !== null && b.dow !== "" && String(b.dow) === dowStr));
    const openTotal = Object.keys(st.slots || {}).reduce((acc, k) => acc + (Array.isArray(st.slots[k]) ? st.slots[k].length : 0), 0);
    const slug = getTutorSlug(st);
    const icsUrl = cs.icsUrl || (rtCal && rtCal.icsUrl) || (`/api/calendar/${encodeURIComponent(slug)}.ics`);
    const calCardHtml = (EGE.kit && typeof EGE.kit.calendarSyncCardHTML === "function")
      ? EGE.kit.calendarSyncCardHTML({
          timezone: st.profile.timezone,
          city: st.profile.city,
          gcalConnected: !!(cs.gcalConnected || busySlots.length > 0),
          icsUrl,
          googleSubscribeUrl: cs.googleSubscribeUrl || (rtCal && rtCal.googleSubscribeUrl),
          googleTemplateUrl: cs.googleTemplateUrl || (rtCal && rtCal.googleTemplateUrl),
          eventCount: Math.max(Number(cs.eventCount || (rtCal && rtCal.eventCount) || 0), weekCount + openTotal),
          busySlots,
          conflictsCount: conflictsList.length,
          syncAction: "tc-cal-sync",
          copyAction: "tc-cal-copy-ics",
          importSampleAction: "tc-cal-import-sample",
          importOpenAction: "tc-cal-import-modal"
        })
      : "";

    return `<div class="stack" style="gap:14px">
      ${calCardHtml}

      ${st.calImportOpen ? `<form class="card stack" style="gap:10px;border-color:var(--accent)" data-f="tc-cal-import">
        <div class="row between" style="gap:8px">
          <b>Импорт внешнего .ics (Google / Яндекс / Apple Calendar)</b>
          <button type="button" class="icon-btn sm" data-a="tc-cal-import-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="field">
          <label for="tc-ics-text">Вставьте содержимое .ics файла (поддерживаются UTC <code>Z</code> и VEVENT)</label>
          <textarea class="textarea" id="tc-ics-text" name="icsText" rows="5" placeholder="BEGIN:VCALENDAR&#10;BEGIN:VEVENT&#10;DTSTART:20261121T070000Z&#10;SUMMARY:Урок&#10;END:VEVENT&#10;END:VCALENDAR">${esc(st.calImportDraft || SAMPLE_GCAL_ICS)}</textarea>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn sm">${icon("check")}<span>Импортировать и пересчитать в ${esc(st.profile.timezone || "UTC+9")}</span></button>
          <button type="button" class="btn ghost sm" data-a="tc-cal-import-close">Отмена</button>
        </div>
      </form>` : ""}
      <div class="card stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Живое расписание · 10:00–20:00</div>
            <h2 class="h2">Календарь записанных учеников (${weekCount})</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn soft sm" data-a="tc-cal-open-add" data-hour="${hours[0]}">+ Записать ученика</button>
            <button type="button" class="btn ghost sm" data-a="tc-copy-day">Скопировать день</button>
          </div>
        </div>
        <div class="notice info"><span class="small">В календаре отображаются <b>только подтверждённые и записанные</b> ученики. Неподтверждённые отклики находятся во вкладке <button type="button" class="link-btn small" data-a="tc-tab" data-tab="requests">Заявки</button>.</span></div>

        <div class="hh-seg equal" role="group" aria-label="Неделя календаря">
          <button type="button" data-a="tc-cal-week" data-w="0" aria-pressed="${weekOffset === 0}"><span>Эта неделя</span></button>
          <button type="button" data-a="tc-cal-week" data-w="1" aria-pressed="${weekOffset === 1}"><span>Следующая неделя</span></button>
        </div>

        <div class="cal-days" aria-label="Выбор дня недели">
          ${weekDays.map((d) => {
            const k = String(d.dow);
            const openCnt = Array.isArray(st.slots[k]) ? st.slots[k].length : 0;
            const bookedCnt = allReqs.filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === k).length;
            const sel = k === dowStr;
            return `<button type="button" class="day-cir${sel ? " on" : ""}" data-a="tc-day" data-dow="${k}">
              <span class="day-wd">${esc(d.wd)} · ${esc(d.num)}</span>
              <span class="day-dot">${bookedCnt}</span>
              <span class="day-cnt">${bookedCnt ? plural(bookedCnt, "ученик", "ученика", "учеников") : (openCnt + " ок.")}</span>
            </button>`;
          }).join("")}
        </div>
      </div>

      ${st.calAddOpen ? `<form class="card stack" style="gap:10px;border-color:var(--accent)" data-f="tc-cal-add">
        <div class="row between" style="gap:8px">
          <b>Добавить ученика в расписание (${esc(activeDay.shortLabel)})</b>
          <button type="button" class="icon-btn sm" data-a="tc-cal-close-add" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="tc-two-col">
          <div class="field">
            <label for="tc-add-name">Имя ученика</label>
            <input class="input" id="tc-add-name" name="studentName" required maxlength="40" placeholder="Например, Максим Р.">
          </div>
          <div class="field">
            <label for="tc-add-hour">Время (10:00–20:00)</label>
            <select class="select" id="tc-add-hour" name="hour">
              ${hours.map((h) => `<option value="${h}"${h === st.calAddHour ? " selected" : ""}>${h}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="tc-two-col">
          <div class="field">
            <label for="tc-add-price">Ставка за урок (₽/ч)</label>
            <input class="input num" id="tc-add-price" name="offerPrice" type="number" min="500" max="5000" step="100" value="${st.profile.price}">
          </div>
          <div class="field">
            <label for="tc-add-note">Тема / ДЗ</label>
            <input class="input" id="tc-add-note" name="note" maxlength="100" placeholder="Пробник КИМ или разбор ошибок">
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn sm">${icon("check")}<span>Записать в календарь</span></button>
          <button type="button" class="btn ghost sm" data-a="tc-cal-close-add">Отмена</button>
        </div>
      </form>` : ""}

      <div class="card stack" style="gap:10px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>Почасовая сетка: ${esc(activeDay.fullLabel)}</b>
          <span class="small muted">${activeLessons.length} ${plural(activeLessons.length, "занятие", "занятия", "занятий")} · ${dayOpenSlots.length} открытых окон</span>
        </div>
        <div class="tc-cal-hours">
          ${hours.map((h) => {
            const lesson = activeLessons.find((r) => r.hour === h);
            const gcalBusy = busyForActiveDay.find((b) => b.hour === h);
            const isOpen = dayOpenSlots.includes(h);
            if (lesson) {
              const rate = Number(lesson.counterPrice || lesson.offerPrice) || st.profile.price;
              const isAcc = lesson.status === "accepted";
              return `<div class="tc-cal-slot ${isAcc ? "is-booked" : "is-pending"}">
                <div class="row" style="gap:12px;min-width:0;flex:1 1 240px">
                  <span class="tc-cal-time">${h}</span>
                  <div class="stack" style="gap:2px;min-width:0">
                    <div class="row" style="gap:6px;flex-wrap:wrap">
                      <b>${esc(lesson.studentName)}</b>
                      <span class="chip ${isAcc ? "confirm" : "notif"}">${isAcc ? "✓ Подтверждён" : "Ждёт ответа"}</span>
                      <span class="chip num">${rate.toLocaleString("ru-RU")} ₽/ч</span>
                      ${gcalBusy ? `<span class="chip bad">Конфликт GCal</span>` : ""}
                    </div>
                    <span class="small muted">${esc(lesson.exam)} · ${esc(lesson.subjectName)}${lesson.note ? " — " + esc(lesson.note) : ""}</span>
                  </div>
                </div>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  ${!isAcc ? `<button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(lesson.id)}">Подтвердить</button>` : ""}
                  ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                    ? EGE.kit.messengerLinksHTML({
                        entity: { id: lesson.id, name: lesson.studentName, whatsapp: lesson.whatsapp || "79142100511" },
                        message: `Здравствуйте, ${lesson.studentName}! По занятию (${lesson.subjectName}, ${h}) на платформе Вектор ЕГЭ.`,
                        primaryLabel: "WA",
                        compact: true
                      })
                    : `<button type="button" class="btn soft sm" data-a="tc-req-msg" data-id="${esc(lesson.id)}">${icon("msg")}<span>Чат</span></button>`}
                  <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(lesson.id)}">Снять</button>
                </div>
              </div>`;
            }
            if (gcalBusy) {
              return `<div class="tc-cal-slot is-gcal-busy">
                <div class="row" style="gap:10px;min-width:0;flex:1 1 220px;flex-wrap:wrap;align-items:center">
                  <span class="tc-cal-time">${h}</span>
                  <span class="badge">Занято в GCal</span>
                  <span class="small">${esc(gcalBusy.summary || "Событие Google Calendar")}</span>
                </div>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <span class="small muted">Пересчитано в ${esc(st.profile.timezone || "UTC+9")}</span>
                </div>
              </div>`;
            }
            return `<div class="tc-cal-slot${isOpen ? " is-open" : ""}">
              <div class="row" style="gap:12px;min-width:0">
                <span class="tc-cal-time">${h}</span>
                <span class="small ${isOpen ? "ink2" : "muted"}">${isOpen ? "Окно открыто — доступно ученикам в /market" : "Час закрыт для записи"}</span>
              </div>
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <button type="button" class="btn soft sm" data-a="tc-cal-open-add" data-hour="${h}">+ Записать</button>
                <button type="button" class="btn ghost sm" data-a="tc-slot-toggle" data-hour="${h}" aria-pressed="${isOpen}">${isOpen ? "Закрыть час" : "Открыть час"}</button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;
  }

  function formatWaReminderText(st, student) {
    const tpl = (st && st.waSettings && st.waSettings.template) ||
      "Здравствуйте, {имя}! Напоминаю, что скоро будет урок ({предмет}) — {день} в {время}. Ссылку отправлю перед началом.";
    return String(tpl)
      .replace(/\{имя\}/gi, student.name || "ученик")
      .replace(/\{предмет\}/gi, student.exam || "ЕГЭ")
      .replace(/\{день\}/gi, student.lessonDay || "Воскресенье")
      .replace(/\{время\}/gi, student.lessonTime || "10:00");
  }

  function studentWaHref(st, student) {
    const phone = String((student && student.whatsapp) || "79142100511").replace(/\D+/g, "") || "79142100511";
    return `https://wa.me/${phone}?text=${encodeURIComponent(formatWaReminderText(st, student))}`;
  }

  function studentReminderUrl(st, student, chId) {
    const TDATA = getTDATA();
    const msg = formatWaReminderText(st, student);
    if (TDATA && typeof TDATA.messengerUrls === "function") {
      const urls = TDATA.messengerUrls(student, msg);
      if (chId === "tg") return urls.telegram;
      if (chId === "max") return urls.max;
      return urls.whatsapp;
    }
    return studentWaHref(st, student);
  }

  function renderPayoutStatsBlocks(st, TDATA, allReqs, acceptedList, totalPayout) {
    const p = st.profile;
    const sp = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { payout: Math.round(p.price * 0.95), fee: Math.round(p.price * 0.05) };
    const is30 = st.statsPeriod === "30d";
    const mult = is30 ? 4 : 1;
    const views = (312 + st.bumpCount * 28) * mult;
    const clicks = Math.round(views * 0.24);
    const reqCnt = (allReqs.length + 5) * mult;
    const conv = Math.min(89, Math.round(((acceptedList.length + 3) * mult / Math.max(1, reqCnt)) * 100));
    const dayBars = DAY_LIST.map((d, i) => {
      const slotCnt = Array.isArray(st.slots[d.dow]) ? st.slots[d.dow].length : 0;
      const dayReqs = allReqs.filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === d.dow).length;
      const lessons = Math.max(1, dayReqs + (i >= 4 ? 2 : 1));
      const rev = lessons * sp.payout * (is30 ? 4 : 1);
      return { wd: d.wd, rev, lessons, isGold: st.bumpedToday || slotCnt >= 3 || d.dow === "6" };
    });
    const maxRev = Math.max(1, ...dayBars.map((b) => b.rev));
    const goal = Math.max(20000, Number(st.monthlyGoal) || 60000);
    const lessonsNeededMonth = Math.ceil(goal / Math.max(500, sp.payout));
    const lessonsPerWeek = (lessonsNeededMonth / 4.3).toFixed(1);
    const curMonthlyProj = Math.max(totalPayout, (acceptedList.length + 3) * 4 * sp.payout);
    const goalPct = Math.min(100, Math.round((curMonthlyProj / goal) * 100));
    const remMs = autoBumpRemainingMs(st);
    const mRem = manualBumpRemainingMs(st);
    const lastAutoLabel = formatTimestamp(st.lastAutoBumpAt || st.lastBumpAt);
    const lastManualLabel = formatTimestamp(st.lastManualBumpAt);

    return `<div class="stack" style="gap:16px">
      <div class="tc-autobump-card">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:flex-start">
          <div class="stack" style="gap:3px">
            <span class="chip gold">${icon("spark")}<span>Автопродвижение каждые 24 часа · ручное поднятие раз в 4 часа (0 ₽)</span></span>
            <h2 class="h2">${st.autoBump24h ? "Автоподнятие 24 ч активно" : "Автоподнятие на паузе"}</h2>
            <p class="small ink2">Анкета автоматически поднимается в топ выдачи /market каждые 24 часа. Дополнительно можно поднять вручную раз в 4 часа.</p>
          </div>
          <button type="button" class="btn ${st.autoBump24h ? "confirm" : "gold"} sm" data-a="tc-autobump-toggle" aria-pressed="${!!st.autoBump24h}">
            ${st.autoBump24h ? "✓ Авто-24ч включено" : "Включить авто-24ч"}
          </button>
        </div>

        <div class="tc-two-col">
          <div class="card stack" style="gap:5px">
            <span class="small muted">До следующего автоподнятия (24 ч)</span>
            <b class="num savings-gold-txt" style="font-size:24px" data-tc-countdown>${st.autoBump24h ? formatCountdown(remMs) : "Пауза"}</b>
            <span class="small muted">Последнее автопродвижение: <b style="color:var(--ink)">${esc(lastAutoLabel)}</b></span>
            <span class="small muted">Всего поднятий: <b class="num">${st.bumpCount || 1}</b></span>
          </div>
          <div class="card stack" style="gap:8px">
            <span class="small muted">Пиковое время суточного автоподнятия</span>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${AUTO_BUMP_HOURS.map((hr) => `<button type="button" class="chip-btn${st.autoBumpHour === hr ? " on" : ""}" data-a="tc-autobump-hour" data-hour="${hr}">${hr} Якт</button>`).join("")}
            </div>
            <div class="small muted">Последнее ручное поднятие: <b style="color:var(--ink)">${esc(lastManualLabel)}</b> · интервал 4 ч</div>
            <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn soft sm" data-a="tc-bump"${mRem > 0 ? " disabled" : ""}>
                ${mRem > 0 ? `✓ Анкета поднята · через <span class="num" data-tc-manual-countdown>${formatCountdown(mRem)}</span>` : "Поднять анкету сейчас (раз в 4 ч)"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="card stack" style="gap:14px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Аналитика анкеты и откликов</div>
            <h2 class="h2">Статистика преподавателя</h2>
          </div>
          <div class="hh-seg" role="group" aria-label="Период статистики">
            <button type="button" data-a="tc-stats-period" data-v="7d" aria-pressed="${!is30}">7 дней</button>
            <button type="button" data-a="tc-stats-period" data-v="30d" aria-pressed="${is30}">30 дней</button>
          </div>
        </div>

        <div class="tiles">
          <div class="tile"><span class="tile-label">Просмотры анкеты</span><span class="tile-value num">${views.toLocaleString("ru-RU")}</span><span class="tile-note">${st.autoBump24h ? "+38% от авто-24ч" : "включи авто-24ч для буста"}</span></div>
          <div class="tile"><span class="tile-label">Открыли контакты</span><span class="tile-value num">${clicks.toLocaleString("ru-RU")}</span><span class="tile-note">CTR ${Math.round((clicks / Math.max(1, views)) * 100)}%</span></div>
          <div class="tile"><span class="tile-label">Конверсия в урок</span><span class="tile-value num" style="color:var(--confirm)">${conv}%</span><span class="tile-note">${reqCnt} откликов за период</span></div>
          <div class="tile"><span class="tile-label">На руки (95%)</span><span class="tile-value num savings-gold-txt">${curMonthlyProj.toLocaleString("ru-RU")} ₽</span><span class="tile-note">прогноз за ${is30 ? "месяц" : "текущий темп"}</span></div>
        </div>

        <div class="stack" style="gap:6px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b class="small">Доход по дням недели (золотым — пики после поднятия)</b>
            <div class="hh-seg" role="group" aria-label="Вид графика с палочками">
              ${[
                ["sticks", "Палочки"],
                ["lollipop", "Леденцы"],
                ["capsule", "Капсулы"],
                ["combo", "Тренд"],
                ["classic", "Столбики"]
              ].map(([cid, clbl]) => `<button type="button" data-a="tc-chart-style" data-v="${cid}" aria-pressed="${(st.chartStyle || "sticks") === cid}">${clbl}</button>`).join("")}
            </div>
          </div>
          ${(EGE.kit && typeof EGE.kit.stickChartHTML === "function")
            ? EGE.kit.stickChartHTML(
                st.chartStyle || "sticks",
                dayBars.map((b) => ({
                  wd: b.wd,
                  val: Math.round(b.rev / 1000) + "к ₽",
                  pct: Math.max(18, Math.round((b.rev / maxRev) * 100)),
                  gold: !!b.isGold
                })),
                -1,
                false,
                "Диаграмма дохода по дням недели"
              )
            : ""}
        </div>
      </div>

      <div class="card stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Финансовый планировщик</div>
            <h3 class="h2">Цель дохода на месяц: <span class="num savings-gold-txt">${goal.toLocaleString("ru-RU")} ₽</span></h3>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            ${GOAL_PRESETS.map((g) => `<button type="button" class="chip-btn${goal === g ? " on" : ""}" data-a="tc-goal" data-v="${g}">${Math.round(g / 1000)} тыс ₽</button>`).join("")}
          </div>
        </div>
        <div class="tc-hh-meter"><i style="width:${goalPct}%"></i></div>
        <div class="row between small muted" style="gap:8px;flex-wrap:wrap">
          <span>Сейчас подтверждённый темп покрывает <b class="num" style="color:var(--ink)">${goalPct}%</b> цели.</span>
          <span>Нужно примерно <b class="num" style="color:var(--ink)">${lessonsPerWeek} уроков/нед</b> (на руки ${sp.payout.toLocaleString("ru-RU")} ₽/урок).</span>
        </div>
      </div>
    </div>`;
  }

  function getWalletSummary() {
    const st = tState();
    const TDATA = getTDATA();
    const p = st.profile || {};
    const rate = Number(p.price) || 1200;
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(rate)
      : { total: rate, fee: Math.round(rate * 0.05), payout: rate - Math.round(rate * 0.05), pct: 5 };
    const allReqs = syncedRequests(st);
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const studentsDoneLessons = (st.students || []).reduce((sum, s) => sum + (Number(s.lessonsDone) || 0), 0);
    const earnedTotal = studentsDoneLessons * (Number(baseSplit && baseSplit.payout) || 0);
    const escrowRub = acceptedList.reduce((sum, r) => {
      const reqRate = Number(r.counterPrice || r.offerPrice) || rate;
      const sp = TDATA && typeof TDATA.commissionSplit === "function"
        ? TDATA.commissionSplit(reqRate)
        : { payout: reqRate - Math.round(reqRate * 0.05) };
      return sum + (Number(sp && sp.payout) || 0);
    }, 0);
    const payouts = Array.isArray(st.payouts) ? st.payouts : [];
    const withdrawnTotal = payouts.reduce((sum, item) => {
      if (!item) return sum;
      const status = String(item.status || "succeeded");
      if (status !== "succeeded" && status !== "processing") return sum;
      return sum + Math.max(0, Number(item.amount) || 0);
    }, 0);
    const availableRub = Math.max(0, earnedTotal - withdrawnTotal);
    return {
      availableRub,
      escrowRub,
      earnedTotal,
      withdrawnTotal,
      minPayout: MIN_PAYOUT_RUB,
      settings: st.payoutSettings || defaultState().payoutSettings,
      payouts
    };
  }

  function desktopDockHTML() {
    const summary = getWalletSummary();
    if (EGE.kit && typeof EGE.kit.tutorBalanceDockHTML === "function") {
      return EGE.kit.tutorBalanceDockHTML({
        availableRub: summary.availableRub,
        escrowRub: summary.escrowRub,
        action: "tc-payout-open"
      });
    }
    return `<div class="tutor-bal-dock" role="region" aria-label="Баланс преподавателя">
      <span class="tutor-bal-ico" aria-hidden="true">${icon("wallet")}</span>
      <div class="tutor-bal-meta">
        <span class="tutor-bal-lbl">Баланс преподавателя</span>
        <div class="tutor-bal-val">
          <b class="num">${summary.availableRub.toLocaleString("ru-RU")} ₽</b>
          <span class="tutor-bal-escrow num">в резерве ${summary.escrowRub.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>
      <button type="button" class="btn sm confirm" data-a="tc-payout-open">Вывести</button>
    </div>`;
  }

  function mobileTopWidgetHTML() {
    const summary = getWalletSummary();
    if (EGE.kit && typeof EGE.kit.topBalanceWidgetHTML === "function") {
      return EGE.kit.topBalanceWidgetHTML({
        role: "tutor",
        amountRub: summary.availableRub,
        pillAction: "tc-payout-open",
        btnAction: "tc-payout-open"
      });
    }
    return `<div class="top-bal-wrap">
      <button type="button" class="top-bal-pill is-funded is-tutor" data-a="tc-payout-open" title="Баланс и вывод средств">${icon("wallet")}<b class="num">${summary.availableRub.toLocaleString("ru-RU")} ₽</b></button>
      <button type="button" class="top-bal-btn is-payout" data-a="tc-payout-open" aria-label="Вывести средства" title="Вывести средства">${icon("upload")}<span>Вывести</span></button>
    </div>`;
  }

  function payoutModalHTML(modalUi) {
    if (modalUi === null || modalUi === false) return "";
    const summary = getWalletSummary();
    const s = summary.settings || defaultState().payoutSettings;
    const raw = modalUi && typeof modalUi === "object" ? modalUi : {};
    const defaultAmount = summary.availableRub >= summary.minPayout
      ? Math.min(summary.availableRub, 3000)
      : summary.availableRub;
    const hasCustomAmount = raw.amount !== undefined && raw.amount !== null && raw.amount !== "";
    const amountNum = hasCustomAmount
      ? Math.max(0, Math.round(Number(raw.amount) || 0))
      : (raw.amount === "" ? 0 : defaultAmount);
    const inputVal = raw.amount === "" ? "" : String(amountNum);
    const method = (raw.method === "card" || (!raw.method && s.method === "card")) ? "card" : "sbp";
    const bank = String(raw.bank || s.bank || PAYOUT_BANKS[4]);
    const phone = formatPhone(raw.phone !== undefined ? raw.phone : s.phone) || String(raw.phone !== undefined ? raw.phone : (s.phone || ""));
    const card = formatCardMask(raw.card !== undefined ? raw.card : s.card) || String(raw.card !== undefined ? raw.card : (s.card || ""));
    const npdReceipt = raw.npdReceipt !== undefined ? !!raw.npdReceipt : !!s.npdReceipt;
    const errorMsg = raw.error ? String(raw.error) : "";
    const canSubmit = summary.availableRub >= summary.minPayout;
    const bankList = PAYOUT_BANKS.includes(bank) ? PAYOUT_BANKS : [bank].concat(PAYOUT_BANKS);
    const chips = [
      { val: 1000, label: "1 000 ₽" },
      { val: 3000, label: "3 000 ₽" },
      { val: 5000, label: "5 000 ₽" },
      { val: summary.availableRub, label: `Вся сумма (${summary.availableRub.toLocaleString("ru-RU")} ₽)` }
    ];

    return `<div class="modal-back">
      <div class="modal-card stack" role="dialog" aria-modal="true" aria-labelledby="tc-payout-title" style="gap:14px;max-width:540px">
        <div class="row between" style="gap:10px;align-items:flex-start">
          <div>
            <div class="eyebrow">Выплаты преподавателям</div>
            <h2 class="h2" id="tc-payout-title">Вывод средств преподавателя</h2>
          </div>
          <button type="button" class="icon-btn" data-a="tc-payout-close" aria-label="Закрыть">${icon("x")}</button>
        </div>

        ${(EGE.kit && typeof EGE.kit.walletSummaryBarHTML === "function")
          ? EGE.kit.walletSummaryBarHTML({
              extraClass: "tc-payout-wallet",
              label: "Доступно к выводу",
              amountRub: summary.availableRub,
              amountClass: "num",
              amountStyle: "font-size:22px;line-height:1.15;font-weight:700;color:var(--ink)",
              subNote: "95% после 5% комиссии сервиса",
              badge: { text: `В резерве: ${summary.escrowRub.toLocaleString("ru-RU")} ₽`, cls: "confirm num" }
            })
          : `<div class="wallet-bar tc-payout-wallet">
          <div class="stack" style="gap:3px;min-width:0">
            <span class="small muted">Доступно к выводу</span>
            <b class="num" style="font-size:22px;line-height:1.15">${summary.availableRub.toLocaleString("ru-RU")} ₽</b>
            <span class="small muted">95% после 5% комиссии сервиса</span>
          </div>
          <span class="chip confirm num">В резерве: ${summary.escrowRub.toLocaleString("ru-RU")} ₽</span>
        </div>`}

        <div class="hh-seg" role="group" aria-label="Способ получения средств">
          <button type="button" data-a="tc-payout-method" data-v="sbp" aria-pressed="${method === "sbp"}">СБП · 0 ₽ (мгновенно)</button>
          <button type="button" data-a="tc-payout-method" data-v="card" aria-pressed="${method === "card"}">Карта РФ / Мир</button>
        </div>

        <form data-f="tc-payout" class="stack" style="gap:12px" novalidate>
          ${method === "sbp"
            ? `<div class="tc-payout-grid">
                <div class="field">
                  <label class="small muted" for="tc-payout-bank">Банк СБП</label>
                  <select class="input" id="tc-payout-bank" name="bank" data-tc-payout="bank">
                    ${bankList.map((b) => `<option value="${esc(b)}"${bank === b ? " selected" : ""}>${esc(b)}</option>`).join("")}
                  </select>
                </div>
                <div class="field">
                  <label class="small muted" for="tc-payout-phone">Телефон для СБП</label>
                  <input class="input" id="tc-payout-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (914) 210-01-99" value="${esc(phone)}" data-tc-payout="phone">
                </div>
              </div>`
            : `<div class="field">
                <label class="small muted" for="tc-payout-card">Номер карты РФ / Мир</label>
                <input class="input num" id="tc-payout-card" name="card" type="text" inputmode="numeric" maxlength="19" placeholder="2200 7004 8210 4419" value="${esc(card)}" data-tc-payout="card">
              </div>`}

          <div class="stack" style="gap:8px">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <label class="small muted" for="tc-payout-amount">Сумма вывода, ₽</label>
              <span class="small muted num">Минимум ${summary.minPayout.toLocaleString("ru-RU")} ₽</span>
            </div>
            <div class="chip-rail swipe" role="group" aria-label="Быстрый выбор суммы">
              ${chips.map((c) => `<button type="button" class="chip-btn${Number(amountNum) === c.val ? " on" : ""}" data-a="tc-payout-chip" data-v="${c.val}">${esc(c.label)}</button>`).join("")}
            </div>
            <input class="input num" id="tc-payout-amount" name="amount" type="number" min="${summary.minPayout}" max="${Math.max(summary.minPayout, summary.availableRub)}" step="100" value="${esc(inputVal)}" data-tc-payout="amount">
          </div>

          <label class="tc-payout-npd">
            <div class="stack" style="gap:2px;min-width:0">
              <b>Сформировать чек самозанятого (НПД · 4–6%)</b>
              <span class="small muted">Автоматическая передача чека в «Мой налог» после зачисления</span>
            </div>
            <input type="checkbox" name="npdReceipt" data-a="tc-payout-npd" data-tc-payout="npdReceipt"${npdReceipt ? " checked" : ""}>
          </label>

          ${errorMsg ? `<div class="tc-payout-err" role="alert">${esc(errorMsg)}</div>` : ""}
          ${!canSubmit && !errorMsg ? `<div class="small muted">Минимальный доступный остаток для вывода — ${summary.minPayout.toLocaleString("ru-RU")} ₽.</div>` : ""}

          <div class="row between" style="gap:10px;flex-wrap:wrap">
            <button type="button" class="btn ghost" data-a="tc-payout-close">Отмена</button>
            <button type="submit" class="btn confirm"${canSubmit ? "" : " disabled"}>Вывести ${amountNum.toLocaleString("ru-RU")} ₽</button>
          </div>
        </form>
      </div>
    </div>`;
  }

  function submitPayout(modalUi, payload) {
    const st = tState();
    const summary = getWalletSummary();
    const src = Object.assign({}, summary.settings || {}, modalUi || {}, payload || {});
    const method = src.method === "card" ? "card" : "sbp";
    const bank = String(src.bank || (summary.settings && summary.settings.bank) || PAYOUT_BANKS[4]).trim() || PAYOUT_BANKS[4];
    const phoneFormatted = formatPhone(src.phone || "");
    const cardFormatted = formatCardMask(src.card || "");
    const npdReceipt = src.npdReceipt !== undefined ? !!src.npdReceipt : true;

    const fallbackAmount = summary.availableRub >= summary.minPayout
      ? Math.min(summary.availableRub, 3000)
      : summary.availableRub;
    const rawAmount = src.amount === undefined
      ? fallbackAmount
      : (src.amount === "" || src.amount === null ? 0 : Number(src.amount));
    const amount = Math.round(Number.isFinite(rawAmount) ? rawAmount : 0);

    if (!Number.isFinite(amount) || amount < summary.minPayout) {
      return { ok: false, error: `Минимальная сумма вывода — ${summary.minPayout.toLocaleString("ru-RU")} ₽.` };
    }
    if (amount > summary.availableRub) {
      return {
        ok: false,
        error: summary.availableRub < summary.minPayout
          ? `Доступно к выводу ${summary.availableRub.toLocaleString("ru-RU")} ₽ (минимум ${summary.minPayout.toLocaleString("ru-RU")} ₽).`
          : `Доступно к выводу не более ${summary.availableRub.toLocaleString("ru-RU")} ₽.`
      };
    }

    let destination = "";
    let methodLabel = "";
    if (method === "sbp") {
      const phoneRaw = phoneFormatted || src.phone || "";
      const phoneDigits = (EGE.kit && typeof EGE.kit.normalizePhoneDigits === "function")
        ? EGE.kit.normalizePhoneDigits(phoneRaw)
        : String(phoneRaw).replace(/\D+/g, "");
      if (phoneDigits.length < 11) {
        return { ok: false, error: "Укажите корректный телефон для СБП (+7 (XXX) XXX-XX-XX)." };
      }
      destination = phoneFormatted || formatPhone(phoneDigits);
      methodLabel = `СБП · ${bank}`;
    } else {
      const cardDigits = String(cardFormatted || src.card || "").replace(/\D+/g, "");
      if (cardDigits.length < 16) {
        return { ok: false, error: "Введите 16-значный номер банковской карты РФ / Мир." };
      }
      destination = cardFormatted || formatCardMask(cardDigits);
      methodLabel = `Карта ···· ${cardDigits.slice(-4)}`;
    }

    let intent = null;
    if (EGE.payments && typeof EGE.payments.createPayoutIntent === "function") {
      intent = EGE.payments.createPayoutIntent({
        amount,
        method,
        bank,
        phone: destination,
        card: method === "card" ? destination : cardFormatted,
        destination,
        npdReceipt
      });
    } else {
      intent = {
        id: "pout-" + Date.now(),
        amount,
        fee: 0,
        method,
        destination,
        status: "succeeded"
      };
    }

    const now = new Date();
    const months = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const createdAtLabel = `${now.getDate()} ${months[now.getMonth()]}, ${hh}:${mm}`;
    const payoutStatus = (intent && intent.status) || "succeeded";

    const payoutRow = {
      id: (intent && intent.id) || ("out-" + Date.now()),
      createdAtLabel,
      amount,
      method,
      methodLabel,
      destination,
      npdReceipt,
      fee: Number(intent && intent.fee) || 0,
      status: payoutStatus,
      statusLabel: payoutStatus === "processing" ? "В обработке" : "Исполнено ✓"
    };

    const prevSettings = st.payoutSettings || defaultState().payoutSettings;
    st.payoutSettings = {
      method,
      bank,
      phone: method === "sbp" ? destination : (formatPhone(src.phone) || prevSettings.phone),
      card: method === "card" ? destination : (formatCardMask(src.card) || prevSettings.card),
      npdReceipt
    };
    if (!Array.isArray(st.payouts)) st.payouts = [];
    st.payouts.unshift(payoutRow);
    saveState();

    return {
      ok: true,
      intent,
      payoutRow,
      wallet: getWalletSummary()
    };
  }

  function renderPayoutWalletSection(wallet) {
    const s = wallet.settings || defaultState().payoutSettings;
    const reqLabel = s.method === "card"
      ? `Карта ···· ${String(s.card || "").replace(/\D+/g, "").slice(-4) || "4419"}`
      : `СБП · ${s.bank || "АЭБ (Алмазэргиэнбанк)"} (${s.phone || "+7 (914) 210-01-99"})`;
    return `<section class="card stack" style="gap:12px" aria-label="Баланс и вывод средств">
      <div class="tc-payout-wallet">
        <div class="stack" style="gap:4px;min-width:0;flex:1 1 260px">
          <div class="eyebrow">Кошелёк преподавателя</div>
          <h2 class="h2">Баланс и вывод средств</h2>
          <p class="small muted">Реквизиты по умолчанию: <b class="ink2">${esc(reqLabel)}</b> · ${s.npdReceipt ? "чек НПД (4–6%) вкл." : "без чека НПД"}</p>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn confirm" data-a="tc-payout-open"${wallet.availableRub < wallet.minPayout ? " disabled" : ""}>${icon("wallet")}<span>Вывести средства</span></button>
        </div>
      </div>
      <div class="tc-payout-kpis">
        <div class="tc-payout-kpi">
          <span class="small muted">Доступно к выводу</span>
          <b class="num" style="color:var(--confirm)">${wallet.availableRub.toLocaleString("ru-RU")} ₽</b>
        </div>
        <div class="tc-payout-kpi">
          <span class="small muted">В резерве до урока</span>
          <b class="num">${wallet.escrowRub.toLocaleString("ru-RU")} ₽</b>
        </div>
        <div class="tc-payout-kpi">
          <span class="small muted">Уже выведено</span>
          <b class="num">${wallet.withdrawnTotal.toLocaleString("ru-RU")} ₽</b>
        </div>
      </div>
    </section>`;
  }

  function renderPayoutHistorySection(wallet) {
    const list = Array.isArray(wallet.payouts) ? wallet.payouts : [];
    const dataTableFn = EGE.charts && typeof EGE.charts.dataTableHTML === "function" ? EGE.charts.dataTableHTML : null;
    let bodyHtml = "";
    if (!list.length) {
      bodyHtml = `<div class="empty"><b>Выводов пока не было</b><span>Нажмите «Вывести средства», чтобы перевести доступный остаток на СБП или карту РФ.</span></div>`;
    } else if (dataTableFn) {
      bodyHtml = dataTableFn({
        id: "tc-payout-history",
        cardWrap: false,
        showPresetSwitch: false,
        showColsSwitch: false,
        showSearch: false,
        eyebrow: "",
        title: "",
        rows: list,
        columns: [
          { key: "createdAtLabel", label: "Дата", num: true, render: (row) => `<span class="num">${esc(row.createdAtLabel || "—")}</span>` },
          { key: "methodLabel", label: "Способ", render: (row) => `<b>${esc(row.methodLabel || "СБП")}</b>` },
          {
            key: "destination",
            label: "Реквизиты и чек",
            render: (row) => `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="num">${esc(row.destination || "—")}</span>${row.npdReceipt ? '<span class="chip good">Чек НПД</span>' : '<span class="chip">Без НПД</span>'}</div>`
          },
          { key: "amount", label: "Сумма", num: true, render: (row) => `<b class="num">${Number(row.amount || 0).toLocaleString("ru-RU")} ₽</b>` },
          {
            key: "status",
            label: "Статус",
            render: (row) => `<span class="bb-tbl-st ${row.status === "processing" ? "is-pending" : "is-confirmed"}">${esc(row.statusLabel || "Исполнено ✓")}</span>`
          }
        ]
      });
    } else {
      bodyHtml = `<div class="bb-table-shell">
        <div class="table-wrap">
          <table class="tbl bb-data-table is-adaptive tc-payout-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Способ</th>
                <th>Реквизиты и чек</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((row) => `<tr>
                <td data-label="Дата" class="num">${esc(row.createdAtLabel || "—")}</td>
                <td data-label="Способ"><b>${esc(row.methodLabel || "СБП")}</b></td>
                <td data-label="Реквизиты и чек">
                  <div class="row" style="gap:6px;flex-wrap:wrap">
                    <span class="num">${esc(row.destination || "—")}</span>
                    ${row.npdReceipt ? '<span class="chip good">Чек НПД</span>' : '<span class="chip">Без НПД</span>'}
                  </div>
                </td>
                <td data-label="Сумма"><b class="num">${Number(row.amount || 0).toLocaleString("ru-RU")} ₽</b></td>
                <td data-label="Статус"><span class="bb-tbl-st is-confirmed">${esc(row.statusLabel || "Исполнено ✓")}</span></td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    }
    return `<section class="card stack" style="gap:12px" aria-label="История выводов средств">
      <div class="row between" style="gap:10px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Операции по счёту</div>
          <h2 class="h2">История выводов средств</h2>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="chip num">${list.length} ${plural(list.length, "выплата", "выплаты", "выплат")}</span>
          <button type="button" class="btn soft sm" data-a="tc-payout-open">${icon("upload")}<span>Новый вывод</span></button>
        </div>
      </div>
      ${bodyHtml}
    </section>`;
  }

  function viewPayouts() {
    ensureCountdownTimer();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const allReqs = syncedRequests();
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { total: p.price, fee: Math.round(p.price * 0.05), payout: Math.round(p.price * 0.95), pct: 5 };
    const totalReqPayout = acceptedList.reduce((acc, r) => {
      const rate = Number(r.counterPrice || r.offerPrice) || p.price;
      const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.round(rate * 0.95) };
      return acc + sp.payout;
    }, 0);
    const studentsDoneLessons = (st.students || []).reduce((sum, s) => sum + (Number(s.lessonsDone) || 0), 0);
    const totalLessonsCount = studentsDoneLessons + acceptedList.length;
    const netIncomeTotal = (studentsDoneLessons * baseSplit.payout) + totalReqPayout;
    const monthEarned = Math.max(netIncomeTotal, (acceptedList.length + 4) * 4 * baseSplit.payout);
    const mRem = manualBumpRemainingMs(st);
    const wallet = getWalletSummary();

    return `
      <div class="head">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div class="eyebrow">Финансы преподавателя · 95% на руки</div>
            <h1 class="h1">Выплаты и статистика</h1>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn ghost sm" data-a="go" data-v="cabinet">← В кабинет</button>
            <button type="button" class="btn sakha-pattern${mRem > 0 ? " is-confirmed" : ""}" data-a="tc-bump"${mRem > 0 ? " disabled" : ""}>
              ${sakhaPatternSVG("rhombus", 18)}
              <span>${mRem > 0 ? `✓ Поднята · <span class="num" data-tc-manual-countdown>${formatCountdown(mRem)}</span>` : "Поднять анкету (раз в 4 ч)"}</span>
              ${sakhaPatternSVG("lattice", 18)}
            </button>
          </div>
        </div>
        <p class="lead">Чистый доход после 5% комиссии, количество проведённых уроков, заработок за месяц, цель дохода и управление автопродвижением 24 ч / 4 ч.</p>
      </div>

      <div class="tiles">
        <div class="tile">
          <span class="tile-label">Чистый доход (95%)</span>
          <span class="tile-value num savings-gold-txt">${netIncomeTotal.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">после 5% сбора системы</span>
        </div>
        <div class="tile">
          <span class="tile-label">Проведено уроков</span>
          <span class="tile-value num">${totalLessonsCount}</span>
          <span class="tile-note">активных учеников: ${(st.students || []).length}</span>
        </div>
        <div class="tile">
          <span class="tile-label">Заработано за месяц</span>
          <span class="tile-value num" style="color:var(--confirm)">${monthEarned.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">прогноз на текущий цикл</span>
        </div>
        <div class="tile">
          <span class="tile-label">Ставка в анкете</span>
          <span class="tile-value num">${p.price.toLocaleString("ru-RU")} ₽/ч</span>
          <span class="tile-note">на руки ${baseSplit.payout.toLocaleString("ru-RU")} ₽ · сбор ${baseSplit.fee.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>

      ${renderPayoutWalletSection(wallet)}

      ${renderPayoutStatsBlocks(st, TDATA, allReqs, acceptedList, netIncomeTotal)}

      <section class="card stack" style="gap:12px" aria-label="Условия выплат и сервисный сбор 5%">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Прозрачная комиссия</div>
            <h2 class="h2">Расчёт с урока по ставке анкеты</h2>
          </div>
          <span class="chip accent">Комиссия системы: 5%</span>
        </div>
        <div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
        <p class="small muted">Средства ученика замораживаются до урока и переводятся преподавателю сразу после проведения занятия (95% на руки, 5% — сервис и поддержка расписания).</p>
      </section>

      ${renderPayoutHistorySection(wallet)}`;
  }

  function renderStudentsTab(st) {
    const p = st.profile;
    const students = Array.isArray(st.students) ? st.students : [];
    const waCfg = st.waSettings || { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "Здравствуйте, {имя}! Скоро будет урок ({предмет}) — {день} в {время}." };
    const cfgChannels = normalizeChannelList(waCfg.channels);
    const sampleStudent = students[0] || { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio" };
    const samplePreview = formatWaReminderText(st, sampleStudent);
    const sampleWaHref = studentWaHref(st, sampleStudent);
    const stCols = [3, 5, 7].includes(Number(st.stTblCols)) ? Number(st.stTblCols) : 5;
    const stFilter = ["all", "auto", "off"].includes(st.stTblFilter) ? st.stTblFilter : "all";
    const leadLabel = (WA_LEAD_OPTIONS.find((o) => o.id === waCfg.lead) || WA_LEAD_OPTIONS[2]).label;

    const studentColumns = [
      {
        key: "student",
        label: "Ученик и ЕГЭ",
        render: (s, h) => {
          const gain = (Number(s.curScore) || 0) - (Number(s.startScore) || 0);
          const day = s.lessonDay || "Воскресенье";
          const time = s.lessonTime || "10:00";
          return `<div class="row" style="gap:10px;align-items:flex-start;min-width:0">
            <span class="tutor-avatar" aria-hidden="true">${esc(initials(s.name))}</span>
            <div class="stack" style="gap:3px;min-width:0">
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <b>${esc(s.name)}</b>
                <span class="chip confirm num">+${gain} б.</span>
              </div>
              <span class="small muted">${esc(s.exam)} · ${s.lessonsDone} ${plural(s.lessonsDone, "урок", "урока", "уроков")} проведено</span>
              ${h.cols === 3 ? `<span class="small muted num">${esc(day)}, ${esc(time)} · ${esc(formatPhone(s.whatsapp || "79142100511"))}</span>` : ""}
            </div>
          </div>`;
        }
      },
      {
        key: "progress",
        label: "Прогресс баллов",
        render: (s, h) => {
          const pct = Math.max(8, Math.min(100, Math.round((s.curScore / Math.max(1, s.targetScore)) * 100)));
          return `<div class="stack" style="gap:6px;min-width:160px">
            <div class="row between small">
              <span class="muted">Старт: <b class="num">${s.startScore}</b> → <b class="num savings-gold-txt">${s.curScore}</b></span>
              <span class="muted">Цель: <b class="num">${s.targetScore}</b></span>
            </div>
            <div class="tc-score-track"><div class="tc-score-fill" style="width:${pct}%"></div></div>
            ${h.cols < 7 && s.hw ? `<div class="small muted">${esc(s.hw)}</div>` : ""}
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="btn soft sm" data-a="tc-student-score" data-id="${esc(s.id)}" data-delta="2">+2 б.</button>
              <button type="button" class="btn ghost sm" data-a="tc-student-lesson" data-id="${esc(s.id)}">+1 урок</button>
            </div>
          </div>`;
        }
      },
      {
        key: "slot",
        label: "Урок",
        minCols: 5,
        render: (s) => {
          const day = s.lessonDay || "Воскресенье";
          const time = s.lessonTime || "10:00";
          return `<div class="stack" style="gap:6px;min-width:130px">
            <div class="field" style="gap:3px">
              <label class="small muted" for="st-day-${esc(s.id)}">День</label>
              <input class="input" id="st-day-${esc(s.id)}" data-tc-student="lessonDay" data-id="${esc(s.id)}" value="${esc(day)}" maxlength="24" placeholder="Воскресенье" style="min-height:34px;padding:6px 9px;font-size:13px">
            </div>
            <div class="field" style="gap:3px">
              <label class="small muted" for="st-time-${esc(s.id)}">Время</label>
              <input class="input num" id="st-time-${esc(s.id)}" data-tc-student="lessonTime" data-id="${esc(s.id)}" value="${esc(time)}" maxlength="12" placeholder="10:00" style="min-height:34px;padding:6px 9px;font-size:13px">
            </div>
          </div>`;
        }
      },
      {
        key: "contacts",
        label: "Контакты (+7 / @login)",
        minCols: 5,
        render: (s) => `<div class="stack" style="gap:6px;min-width:168px">
          <div class="field" style="gap:3px">
            <label class="small muted" for="st-wa-${esc(s.id)}">Телефон (WA / MAX)</label>
            <input class="input num" id="st-wa-${esc(s.id)}" data-tc-student="whatsapp" data-id="${esc(s.id)}" value="${esc(formatPhone(s.whatsapp || "79142100511"))}" maxlength="22" placeholder="+7 (914) 000-00-00" style="min-height:34px;padding:6px 9px;font-size:13px">
          </div>
          <div class="field" style="gap:3px">
            <label class="small muted" for="st-tg-${esc(s.id)}">Telegram (@ или +7)</label>
            <input class="input" id="st-tg-${esc(s.id)}" data-tc-student="telegram" data-id="${esc(s.id)}" value="${esc(formatTelegram(s.telegram || ""))}" maxlength="36" placeholder="@username или +7 (914) 000-00-00" style="min-height:34px;padding:6px 9px;font-size:13px">
          </div>
        </div>`
      },
      {
        key: "hw",
        label: "Домашка и фокус",
        minCols: 7,
        render: (s) => `<div class="tc-req-quote">${esc(s.hw || "Индивидуальный план")}</div>`
      },
      {
        key: "remindMeta",
        label: "Статус авто",
        minCols: 7,
        render: (s) => {
          const stChannels = normalizeChannelList(s.autoChannels);
          const chBadgeTxt = stChannels.map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).short || cid.toUpperCase()).join(" · ");
          const lastRem = s.lastRemindedAt ? formatTimestamp(s.lastRemindedAt) : "";
          return `<div class="stack" style="gap:4px">
            <span class="chip ${s.autoNotify ? "gold" : ""}">${s.autoNotify ? `Авто: ${esc(chBadgeTxt)} · ${esc(leadLabel)}` : "Автоуведомление выкл"}</span>
            <span class="small muted">${lastRem ? `Отправлено: ${esc(lastRem)}` : "Готово к отправке"}</span>
          </div>`;
        }
      },
      {
        key: "notifyActions",
        label: "Автоуведомления WA/TG/MAX",
        isActions: true,
        render: (s) => {
          const day = s.lessonDay || "Воскресенье";
          const time = s.lessonTime || "10:00";
          const stChannels = normalizeChannelList(s.autoChannels);
          const chBadgeTxt = stChannels.map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).short || cid.toUpperCase()).join(" · ");
          const waHref = studentWaHref(st, s);
          return `<div class="stack" style="gap:6px">
            <div class="auto-ch-bar" role="group" aria-label="Каналы автоуведомления ученика">
              ${AUTO_CHANNELS.map((ch) => {
                const on = stChannels.includes(ch.id);
                return `<button type="button" class="auto-ch-pill${on ? " is-on" : ""}" data-a="tc-student-autochannel" data-id="${esc(s.id)}" data-ch="${ch.id}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(ch.name)}</button>`;
              }).join("")}
            </div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="btn ${s.autoNotify ? "gold" : "soft"} sm" data-a="tc-student-autonotify" data-id="${esc(s.id)}" aria-pressed="${!!s.autoNotify}">
                ${icon("bell")}<span>${s.autoNotify ? `✓ Авто: ${esc(chBadgeTxt)}` : "Вкл. автоуведомление"}</span>
              </button>
              <button type="button" class="btn confirm sm" data-a="tc-student-remind" data-id="${esc(s.id)}">${icon("msg")}<span>Напомнить: скоро урок (${esc(day)}, ${esc(time)})</span></button>
            </div>
            ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
              ? EGE.kit.messengerLinksHTML({
                  entity: s,
                  message: `Здравствуйте, ${s.name}! Напоминаю про занятие (${s.exam || "ЕГЭ"}, ${day} в ${time}) через Вектор ЕГЭ.`,
                  primaryLabel: "WhatsApp",
                  compact: true
                })
              : `<a class="btn ghost sm" href="${esc(waHref)}" target="_blank" rel="noopener">Открыть WhatsApp →</a>`}
          </div>`;
        }
      }
    ];

    const studentsTableHtml = renderDataTable({
      id: "tc-students-table",
      cardWrap: false,
      showPresetSwitch: false,
      eyebrow: "Трекер баллов и связь (WhatsApp · Telegram · MAX)",
      title: "Мои ученики и автоуведомления",
      cols: stCols,
      filter: stFilter,
      query: st.stTblQuery || "",
      colsAction: "tc-st-tbl-cols",
      filterAction: "tc-st-tbl-filter",
      searchAction: "tc-st-tbl-q",
      searchId: "tc-st-tbl-q",
      searchPlaceholder: "Поиск: ученик, экзамен, +7, @telegram…",
      filters: [
        { id: "all", label: `Все (${students.length})`, match: () => true },
        { id: "auto", label: `Авто-уведомления (${students.filter((s) => !!s.autoNotify).length})`, match: (s) => !!s.autoNotify },
        { id: "off", label: `Без авто (${students.filter((s) => !s.autoNotify).length})`, match: (s) => !s.autoNotify }
      ],
      columns: studentColumns,
      rows: students,
      searchFields: (s) => [s.name, s.exam, s.hw, s.lessonDay, s.lessonTime, s.whatsapp, s.telegram, String(s.curScore || "")].join(" "),
      emptyText: "По выбранному фильтру учеников нет."
    });

    return `<div class="stack" style="gap:16px">
      <section class="card stack" style="gap:12px" aria-label="Мои ученики и автонапоминания">
        ${studentsTableHtml}
      </section>

      <div class="tc-two-col" aria-label="Автоуведомления WhatsApp, Telegram и MAX">
        <div class="card stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div>
              <div class="eyebrow">WhatsApp · Telegram · MAX</div>
              <h2 class="h2">Настройка автоуведомлений</h2>
            </div>
            <button type="button" class="btn ${waCfg.enabled ? "confirm" : "soft"} sm" data-a="tc-wa-global-toggle" aria-pressed="${!!waCfg.enabled}">
              ${waCfg.enabled ? "✓ Система включена" : "Включить систему"}
            </button>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Каналы автоматической отправки:</span>
            <div class="auto-ch-bar" role="group" aria-label="Каналы автоуведомлений">
              ${AUTO_CHANNELS.map((ch) => {
                const on = cfgChannels.includes(ch.id);
                return `<button type="button" class="auto-ch-pill${on ? " is-on" : ""}" data-a="tc-wa-channel" data-ch="${ch.id}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(ch.name)}</button>`;
              }).join("")}
            </div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Когда автоматически писать ученику:</span>
            <div class="chip-rail">
              ${WA_LEAD_OPTIONS.map((o) => `<button type="button" class="chip-btn${waCfg.lead === o.id ? " on" : ""}" data-a="tc-wa-lead" data-v="${esc(o.id)}">${esc(o.label)}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <label for="tc-wa-tpl">Текст напоминания (переменные: <code>{имя}</code>, <code>{предмет}</code>, <code>{день}</code>, <code>{время}</code>)</label>
            <textarea class="textarea" id="tc-wa-tpl" data-tc="waTemplate" rows="3" maxlength="260">${esc(waCfg.template || "")}</textarea>
          </div>
          <div class="tc-template-card">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <b class="small">Пример сообщения (${esc(sampleStudent.name)} · ${esc(sampleStudent.lessonDay || "Воскресенье")}, ${esc(sampleStudent.lessonTime || "10:00")})</b>
              ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                ? EGE.kit.messengerLinksHTML({
                    entity: sampleStudent,
                    message: samplePreview,
                    primaryLabel: "Тест в WhatsApp",
                    compact: true
                  })
                : `<a class="btn confirm sm" href="${esc(sampleWaHref)}" target="_blank" rel="noopener">${icon("send")}<span>Тест в WhatsApp</span></a>`}
            </div>
            <div class="tc-template-body">${esc(samplePreview)}</div>
          </div>
        </div>

        <div class="card stack" style="gap:10px">
          <div>
            <div class="eyebrow">Экономия времени</div>
            <h2 class="h2">Быстрые шаблоны ответов</h2>
          </div>
          ${QUICK_TEMPLATES.map((tpl) => {
            const text = tpl.build(p);
            return `<div class="tc-template-card">
              <div class="row between" style="gap:8px;flex-wrap:wrap">
                <b class="small">${esc(tpl.title)}</b>
                <button type="button" class="btn soft sm" data-a="tc-copy-tpl" data-id="${esc(tpl.id)}">Копировать</button>
              </div>
              <div class="tc-template-body">${esc(text)}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;
  }

  function renderLeadsTab(st, TDATA) {
    const leadsAll = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
    const tutorSubjs = Array.isArray(st.profile.subjects) && st.profile.subjects.length ? st.profile.subjects : [st.profile.subject || "bio"];
    const tutorSubjSet = new Set(tutorSubjs);
    const mineOnly = !!st.leadsMineOnly;
    const filtered = mineOnly
      ? leadsAll.filter((lead) => {
          const sArr = Array.isArray(lead.subjects) ? lead.subjects : [];
          return sArr.some((id) => tutorSubjSet.has(id));
        })
      : leadsAll;
    const tutorSubjLabels = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(tutorSubjs).join(", ") : "вашим предметам";
    const leadsCols = [3, 5, 7].includes(Number(st.leadsTblCols)) ? Number(st.leadsTblCols) : 5;

    const leadColumns = [
      {
        key: "student",
        label: "Ученик и экзамен",
        render: (lead) => `<div class="stack" style="gap:4px">
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <b>${esc(lead.studentName)}</b>
            <span class="chip">${esc(lead.exam)} · ${esc(lead.format)}</span>
            ${lead.mine ? '<span class="chip gold">Свежая из кабинета ученика</span>' : ""}
          </div>
        </div>`
      },
      {
        key: "subjects",
        label: "Предметы",
        render: (lead) => {
          const subjIds = Array.isArray(lead.subjects) ? lead.subjects : [];
          const subjNames = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(subjIds) : subjIds;
          return `<div class="row" style="gap:4px;flex-wrap:wrap">${subjNames.map((nm, idx) => `<span class="chip ${tutorSubjSet.has(subjIds[idx]) ? "accent" : ""}">${esc(nm)}</span>`).join("")}</div>`;
        }
      },
      {
        key: "comment",
        label: "Запрос ученика",
        minCols: 5,
        render: (lead) => `<div class="small ink2">${esc(lead.comment || "—")}</div>`
      },
      {
        key: "budget",
        label: "Бюджет ученика",
        minCols: 5,
        num: true,
        render: (lead) => {
          const rate = Number(lead.targetPrice) || st.profile.price;
          const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.round(rate * 0.95) };
          return `<div class="stack" style="gap:2px">
            <b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b>
            <span class="small muted num">на руки 95%: <b class="savings-gold-txt">${sp.payout.toLocaleString("ru-RU")} ₽</b></span>
          </div>`;
        }
      },
      {
        key: "createdAt",
        label: "Создана",
        minCols: 7,
        render: (lead) => `<span class="small muted">${esc(lead.createdAt || "Сегодня")}</span>`
      },
      {
        key: "scheduleNote",
        label: "График",
        minCols: 7,
        render: (lead) => `<span class="small">${esc(lead.scheduleNote || "Гибкий график")}</span>`
      },
      {
        key: "actions",
        label: "Отклик и связь",
        isActions: true,
        render: (lead) => {
          const rate = Number(lead.targetPrice) || st.profile.price;
          const waHref = TDATA && typeof TDATA.studentLeadWhatsappUrl === "function"
            ? TDATA.studentLeadWhatsappUrl(lead, `Здравствуйте, ${lead.studentName}! Я преподаватель ${st.profile.name} (${tutorSubjLabels}). Готов(а) провести урок по вашей заявке (${rate} ₽/ч).`)
            : "";
          return `<div class="stack" style="gap:6px">
            ${lead.responded ? '<span class="bb-tbl-st is-confirmed">✓ Вы написали ученику</span>' : '<span class="bb-tbl-st is-pending">Ищет преподавателя</span>'}
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${waHref ? (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                ? EGE.kit.messengerLinksHTML({
                    entity: { id: lead.id, name: lead.studentName, whatsapp: lead.whatsapp || "79142100511" },
                    message: `Здравствуйте, ${lead.studentName}! Вижу ваш запрос по предмету ${lead.subjectName || "ЕГЭ"}. Готов(а) провести урок по ставке ${rate} ₽/ч.`,
                    primaryLabel: "Написать ученику · WA",
                    compact: true
                  })
                : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать ученику</span></a>`) : ""}
              <button type="button" class="btn ${lead.responded ? "soft" : ""} sm" data-a="tc-lead-offer" data-id="${esc(lead.id)}">${lead.responded ? "✓ Отклик отправлен" : "Откликнуться со ставкой"}</button>
            </div>
          </div>`;
        }
      }
    ];

    const leadsTableHtml = filtered.length
      ? renderDataTable({
          id: "tc-leads-table",
          cardWrap: false,
          showPresetSwitch: false,
          eyebrow: "",
          title: "",
          cols: leadsCols,
          query: st.leadsTblQuery || "",
          colsAction: "tc-leads-tbl-cols",
          filterAction: "tc-leads-tbl-filter",
          searchAction: "tc-leads-tbl-q",
          searchId: "tc-leads-tbl-q",
          searchPlaceholder: "Поиск: имя, предмет, запрос, бюджет…",
          filters: [],
          columns: leadColumns,
          rows: filtered,
          searchFields: (lead) => {
            const subjIds = Array.isArray(lead.subjects) ? lead.subjects : [];
            const subjNames = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(subjIds) : subjIds;
            return [lead.studentName, lead.exam, lead.format, lead.comment, lead.scheduleNote, String(lead.targetPrice || ""), subjNames.join(" ")].join(" ");
          },
          emptyText: "По поисковому запросу заявок учеников не найдено."
        })
      : `<div class="empty"><b>По выбранному предмету заявок учеников пока нет</b><span>Отключите фильтр или дождитесь новых запросов из кабинета ученика.</span></div>`;

    return `<div class="stack" style="gap:14px">
      <div class="card stack" style="gap:10px">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">Встречный поток из кабинета ученика</div>
            <h2 class="h2">Заявки учеников, которые ищут преподавателя (${filtered.length})</h2>
          </div>
          <div class="hh-seg" role="group" aria-label="Фильтр заявок учеников">
            <button type="button" data-a="tc-leads-mode" data-v="all" aria-pressed="${!mineOnly}">Все заявки (${leadsAll.length})</button>
            <button type="button" data-a="tc-leads-mode" data-v="mine" aria-pressed="${mineOnly}">По моим предметам</button>
          </div>
        </div>
        <div class="small muted">Ваши предметы из «Профиля»: <b>${esc(tutorSubjLabels)}</b>. Фильтр по предметам находится в левом меню вашей анкеты, без дублирования на экране.</div>
      </div>

      <section class="card stack" style="gap:12px" aria-label="Таблица заявок учеников">
        ${leadsTableHtml}
      </section>
    </div>`;
  }

  function viewCabinet() {
    ensureCountdownTimer();
    ensureRealtimeConnected();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const rtState = (EGE.realtime && typeof EGE.realtime.getState === "function") ? EGE.realtime.getState() : { mode: "local", unreadCount: 0 };
    const rtPillHtml = (EGE.kit && typeof EGE.kit.realtimeStatusPillHTML === "function")
      ? EGE.kit.realtimeStatusPillHTML({
          mode: rtState.mode,
          channelLabel: "tutor",
          unreadCount: rtState.unreadCount,
          action: "tc-rt-reconnect",
          title: "Переподключить Live-поток заявок и расписания"
        })
      : "";
    const allReqs = syncedRequests();
    const pendingList = allReqs.filter((r) => r.status === "pending");
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const leadsList = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
    const totalPayout = acceptedList.reduce((acc, r) => {
      const rate = Number(r.counterPrice || r.offerPrice) || p.price;
      const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.round(rate * 0.95) };
      return acc + sp.payout;
    }, 0);
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(p.price) : { total: p.price, fee: Math.round(p.price * 0.05), payout: Math.round(p.price * 0.95), pct: 5 };
    const comp = profileCompleteness(p, st.slots);
    const activeTab = ["requests", "leads", "profile", "calendar", "students"].includes(st.tab) ? st.tab : "requests";
    const bookedCalendarCount = acceptedList.length;
    const mRem = manualBumpRemainingMs(st);
    const lastAutoLabel = formatTimestamp(st.lastAutoBumpAt || st.lastBumpAt);

    let bodyHTML = "";
    if (activeTab === "leads") bodyHTML = renderLeadsTab(st, TDATA);
    else if (activeTab === "profile") bodyHTML = renderProfileTab(st, TDATA, baseSplit);
    else if (activeTab === "calendar") bodyHTML = renderCalendarTab(st, TDATA, allReqs);
    else if (activeTab === "students") bodyHTML = renderStudentsTab(st);
    else bodyHTML = renderRequestsTab(st, TDATA, allReqs, pendingList, acceptedList, baseSplit);

    return `
      <div class="head">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div class="eyebrow">Саха сирэ · Личный кабинет преподавателя</div>
            <h1 class="h1">${esc(p.name)}</h1>
            <div class="small muted">${esc(p.headline || "Репетитор ЕГЭ / ОГЭ")} · Профиль заполнен на ${comp.pct}% · Авто-24ч: ${esc(lastAutoLabel)}</div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            ${rtPillHtml}
            <button type="button" class="btn ${st.autoBump24h ? "gold" : "soft"} sm" data-a="tc-autobump-toggle" aria-pressed="${!!st.autoBump24h}">
              ${icon("spark")}<span>${st.autoBump24h ? "Авто-24ч: " : "Вкл. авто-24ч"}</span>${st.autoBump24h ? `<b class="num" data-tc-countdown>${formatCountdown(autoBumpRemainingMs(st))}</b>` : ""}
            </button>
            <button type="button" class="btn sakha-pattern${mRem > 0 ? " is-confirmed" : ""}" data-a="tc-bump"${mRem > 0 ? " disabled" : ""}>
              ${sakhaPatternSVG("rhombus", 18)}
              <span>${mRem > 0 ? `✓ Поднята · через <b class="num" data-tc-manual-countdown>${formatCountdown(mRem)}</b>` : "Сөп · Поднять анкету (раз в 4 ч)"}</span>
              ${sakhaPatternSVG("lattice", 18)}
            </button>
          </div>
        </div>
        <p class="lead">Управляйте заявками ±100 ₽, собирайте профиль и фото, ведите календарь записанных учеников и отправляйте автоуведомления в WhatsApp.</p>
      </div>

      ${sakhaOhyorHTML("Вектор ЕГЭ · Саха", { goldLogo: true })}

      <div class="tiles">
        <div class="tile">
          <span class="tile-label">Новые заявки</span>
          <span class="tile-value num">
            <button type="button" class="tc-kpi-jump num" data-a="tc-jump-pending" style="color:${pendingList.length ? "var(--notif)" : "var(--ink)"}" title="Нажмите, чтобы перейти к ожидающим заявкам">${pendingList.length}</button>
          </span>
          <span class="tile-note">${pendingList.length ? `<button type="button" class="link-btn small" data-a="tc-jump-pending">ждут вашего ответа →</button>` : "все разобраны"}</span>
        </div>
        <div class="tile">
          <span class="tile-label">Подтверждено</span>
          <span class="tile-value num" style="color:var(--confirm)">${acceptedList.length}</span>
          <span class="tile-note">${plural(acceptedList.length, "урок на неделе", "урока на неделе", "уроков на неделе")}</span>
        </div>
        <div class="tile">
          <span class="tile-label">Ставка в анкете</span>
          <span class="tile-value num">${p.price.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">торг от ${p.minFair.toLocaleString("ru-RU")} ₽/ч</span>
        </div>
        <div class="tile">
          <span class="tile-label">Чистый доход (95%)</span>
          <span class="tile-value num savings-gold-txt">${totalPayout.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note"><button type="button" class="link-btn small" data-a="go" data-v="fees">Выплаты и статистика →</button></span>
        </div>
      </div>

      <div class="chip-rail swipe tc-mobile-tabs" role="navigation" aria-label="Дополнительные разделы преподавателя">
        <button type="button" class="chip-btn${activeTab === "leads" ? " on" : ""}" data-a="tc-tab" data-tab="leads">Ученики ищут (${leadsList.length})</button>
        <button type="button" class="chip-btn" data-a="go" data-v="tutor">Справочник</button>
      </div>

      ${bodyHTML}`;
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

  function handleAction(act, el) {
    const st = tState();
    const d = (el && el.dataset) || {};
    const id = d.id || "";

    if (act === "tc-tab") {
      const nextTab = ["requests", "leads", "profile", "calendar", "students"].includes(d.tab) ? d.tab : "requests";
      st.tab = nextTab;
      saveState();
      if (typeof _ctx.go === "function") _ctx.go("tutor-" + nextTab);
      else if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-jump-pending") {
      st.tab = "requests";
      if (st.filter === "accepted") st.filter = "all";
      saveState();
      if (typeof _ctx.go === "function") _ctx.go("tutor-requests");
      else if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender(true);
      if (typeof setTimeout === "function" && typeof document !== "undefined" && typeof document.getElementById === "function") {
        setTimeout(() => {
          const elFirst = document.getElementById("tc-first-pending");
          if (elFirst && typeof elFirst.scrollIntoView === "function") {
            elFirst.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 40);
      }
      return true;
    }

    if (act === "tc-bump") {
      const rem = manualBumpRemainingMs(st);
      if (rem > 0) {
        if (typeof _ctx.notifySide === "function") {
          _ctx.notifySide("Ручное поднятие раз в 4 ч", `Повторить можно через ${formatCountdown(rem)} (последнее — ${formatTimestamp(st.lastManualBumpAt)}).`);
        }
        return true;
      }
      st.bumpedToday = true;
      st.lastManualBumpAt = Date.now();
      st.bumpCount = (Number(st.bumpCount) || 0) + 1;
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide("Анкета поднята в топ (0 ₽)", "Следующее ручное поднятие будет доступно через 4 часа.");
      }
      return true;
    }

    if (act === "tc-autobump-toggle") {
      st.autoBump24h = !st.autoBump24h;
      if (st.autoBump24h) {
        const now = Date.now();
        st.lastAutoBumpAt = now;
        st.lastBumpAt = now;
      }
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          st.autoBump24h ? "Автопродвижение 24 ч включено" : "Автопродвижение на паузе",
          st.autoBump24h ? `Анкета будет автоматически подниматься каждые 24 часа (к ${st.autoBumpHour} Якт).` : "Поднятие доступно вручную кнопкой раз в 4 ч."
        );
      }
      return true;
    }

    if (act === "tc-photo-clear") {
      st.profile.photo = "";
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast("Фото убрано — показывается «Без фото»");
      return true;
    }

    if (act === "tc-city-pick") {
      if (CITY_OPTIONS.includes(d.v)) {
        st.profile.city = d.v;
        syncPublishedTutor(st);
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      }
      return true;
    }

    if (act === "tc-tz-toggle") {
      st.tzMenuOpen = !st.tzMenuOpen;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-tz-pick") {
      if (TZ_OPTIONS.some((tz) => tz.id === d.v)) {
        st.profile.timezone = d.v;
      }
      st.tzMenuOpen = false;
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-wa-global-toggle") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      st.waSettings.enabled = !st.waSettings.enabled;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast(st.waSettings.enabled ? "Автоуведомления (WA · TG · MAX) включены" : "Автоуведомления на паузе");
      return true;
    }

    if (act === "tc-wa-channel") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      const ch = String(d.ch || "");
      if (AUTO_CHANNELS.some((c) => c.id === ch)) {
        st.waSettings.channels = toggleArrayVal(normalizeChannelList(st.waSettings.channels), ch, true);
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      }
      return true;
    }

    if (act === "tc-wa-lead") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      if (WA_LEAD_OPTIONS.some((o) => o.id === d.v)) st.waSettings.lead = d.v;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-student-autonotify") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.autoNotify = !s.autoNotify;
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.notifySide === "function") {
          const leadLabel = (WA_LEAD_OPTIONS.find((o) => o.id === ((st.waSettings && st.waSettings.lead) || "2h")) || WA_LEAD_OPTIONS[2]).label;
          const chNames = normalizeChannelList(s.autoChannels).map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).name || cid).join(", ");
          _ctx.notifySide(
            s.autoNotify ? "Автоуведомление включено" : "Автоуведомление выключено",
            s.autoNotify ? `${s.name}: ${chNames} · ${leadLabel} (${s.lessonDay || "Воскресенье"}, ${s.lessonTime || "10:00"})` : `${s.name}: только ручные напоминания`
          );
        }
      }
      return true;
    }

    if (act === "tc-student-autochannel") {
      const s = (st.students || []).find((x) => x.id === id);
      const ch = String(d.ch || "");
      if (s && AUTO_CHANNELS.some((c) => c.id === ch)) {
        s.autoChannels = toggleArrayVal(normalizeChannelList(s.autoChannels), ch, true);
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      }
      return true;
    }

    if (act === "tc-student-remind") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.lastRemindedAt = Date.now();
        saveState();
        const chs = normalizeChannelList(s.autoChannels);
        const primaryCh = chs[0] || "wa";
        const url = studentReminderUrl(st, s, primaryCh);
        if (typeof window !== "undefined" && typeof window.open === "function") {
          try { window.open(url, "_blank", "noopener"); } catch (e) { /* игнор */ }
        }
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.notifySide === "function") {
          const chNames = chs.map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).name || cid).join(" · ");
          _ctx.notifySide(`Напоминание подготовлено (${chNames})`, `${s.name} · ${s.lessonDay || "Воскресенье"} в ${s.lessonTime || "10:00"}`);
        }
      }
      return true;
    }

    if (act === "tc-autobump-hour") {
      if (AUTO_BUMP_HOURS.includes(d.hour)) {
        st.autoBumpHour = d.hour;
        syncPublishedTutor(st);
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      }
      return true;
    }

    if (act === "tc-stats-period") {
      st.statsPeriod = d.v === "30d" ? "30d" : "7d";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-goal") {
      st.monthlyGoal = Math.max(20000, Math.min(300000, Number(d.v) || 60000));
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-preview-toggle") {
      st.profilePreview = !st.profilePreview;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-exam-toggle") {
      if (d.v) st.profile.exams = toggleArrayVal(st.profile.exams, d.v, true);
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-format-toggle") {
      if (d.v) st.profile.formats = toggleArrayVal(st.profile.formats, d.v, true);
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-skill-toggle") {
      if (d.v) st.profile.skills = toggleArrayVal(st.profile.skills, d.v, false);
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-filter") {
      st.filter = ["pending", "accepted"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-tbl-filter") {
      if (d.clearQ === "1") st.reqTblQuery = "";
      st.filter = ["pending", "accepted"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-tbl-cols") {
      const c = Number(d.cols);
      st.reqTblCols = [3, 5, 7].includes(c) ? c : 5;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-st-tbl-filter") {
      if (d.clearQ === "1") st.stTblQuery = "";
      st.stTblFilter = ["auto", "off"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-st-tbl-cols") {
      const c = Number(d.cols);
      st.stTblCols = [3, 5, 7].includes(c) ? c : 5;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-leads-tbl-filter") {
      if (d.clearQ === "1") st.leadsTblQuery = "";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-leads-tbl-cols") {
      const c = Number(d.cols);
      st.leadsTblCols = [3, 5, 7].includes(c) ? c : 5;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-rate-step") {
      const which = d.which === "minFair" ? "minFair" : "price";
      const step = Number(d.step) || 0;
      if (which === "price") {
        st.profile.price = clampStep(st.profile.price, step, 600, 3500);
        if (st.profile.minFair > st.profile.price) st.profile.minFair = Math.max(500, st.profile.price - 100);
      } else {
        st.profile.minFair = clampStep(st.profile.minFair, step, 500, st.profile.price);
      }
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-step") {
      const step = Number(d.step) || 0;
      updateReq(id, (req) => {
        const cur = Number(req.counterPrice || req.offerPrice) || st.profile.price;
        req.counterPrice = clampStep(cur, step, 500, 4000);
      });
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-accept") {
      const updated = updateReq(id, (req) => {
        const finalPrice = Number(req.counterPrice || req.offerPrice) || st.profile.price;
        req.counterPrice = finalPrice;
        req.offerPrice = finalPrice;
        req.status = "accepted";
      });
      const who = findReq(id);
      publishRtUpdate(
        "request.accepted",
        "Урок подтверждён",
        who ? `${who.studentName} · ${who.dayLabel} в ${who.hour}` : "Урок подтверждён",
        { requestId: id }
      );
      syncTutorCalendar(st);
      if (updated && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          "Урок подтверждён",
          who ? `${who.studentName} · ${who.dayLabel} в ${who.hour} за ${who.offerPrice.toLocaleString("ru-RU")} ₽/ч` : "Заявка переведена в подтверждённые"
        );
      }
      return true;
    }

    if (act === "tc-req-counter") {
      const updated = updateReq(id, (req) => { req.status = "countered"; });
      if (updated && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      const who = findReq(id);
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          "Контр-ставка отправлена",
          who ? `Предложили ${who.counterPrice.toLocaleString("ru-RU")} ₽/ч — уведомим ученика` : "Новая ставка отправлена ученику"
        );
      }
      return true;
    }

    if (act === "tc-req-decline") {
      updateReq(id, (req) => { req.status = "declined"; });
      publishRtUpdate("request.declined", "Заявка снята", `Слот освобождён (${id})`, { requestId: id });
      syncTutorCalendar(st);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast("Заявка отклонена");
      return true;
    }

    if (act === "tc-req-restore") {
      updateReq(id, (req) => { req.status = "pending"; });
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-msg") {
      const who = findReq(id);
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide("Чат с учеником", who ? `Открыт диалог с ${who.studentName} (${who.dayLabel}, ${who.hour})` : "Сообщение ученику подготовлено");
      }
      return true;
    }

    if (act === "tc-day") {
      st.activeDow = DAY_LIST.some((x) => x.dow === d.dow) ? d.dow : "6";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-cal-week") {
      st.calWeek = d.w === "1" ? 1 : 0;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-cal-open-add") {
      st.calAddHour = d.hour || "14:00";
      st.calAddOpen = true;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-cal-close-add") {
      st.calAddOpen = false;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-copy-day") {
      const activeDayObj = DAY_LIST.find((x) => x.dow === st.activeDow) || DAY_LIST[5];
      const lessons = syncedRequests().filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === activeDayObj.dow);
      const summary = lessons.length
        ? lessons.map((r) => `${r.hour} — ${r.studentName} (${r.offerPrice} ₽/ч)`).join("\n")
        : "На выбранный день уроки ещё не назначены.";
      copyStr(`${activeDayObj.full}:\n${summary}`);
      if (typeof _ctx.toast === "function") _ctx.toast("Расписание дня скопировано");
      return true;
    }

    if (act === "tc-slot-toggle") {
      const hour = String(d.hour || "").trim();
      if (!hour) return true;
      const dow = st.activeDow || "6";
      const list = Array.isArray(st.slots[dow]) ? st.slots[dow].slice() : [];
      const idx = list.indexOf(hour);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(hour);
      list.sort();
      st.slots[dow] = list;
      syncPublishedTutor(st);
      saveState();
      publishRtUpdate("calendar.slot.updated", "Обновлено окно в расписании", `${dow}: ${hour}`, { dow, hour });
      syncTutorCalendar(st);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-rt-reconnect") {
      if (EGE.realtime) {
        if (typeof EGE.realtime.clearUnread === "function") EGE.realtime.clearUnread();
        if (typeof EGE.realtime.connect === "function") {
          EGE.realtime.connect({ channel: "tutor", tutorSlug: getTutorSlug(st) });
        }
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast("Live-поток обновлён");
      return true;
    }

    if (act === "tc-cal-sync") {
      syncTutorCalendar(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(".ics-лента синхронизирована", `Часовой пояс ${st.profile.timezone || "UTC+9"} · ссылка готова для Google Calendar`);
      }
      return true;
    }

    if (act === "tc-cal-copy-ics") {
      const cs = st.calendarSync || {};
      const url = d.url || cs.icsUrl || (`/api/calendar/${encodeURIComponent(getTutorSlug(st))}.ics`);
      copyStr(url);
      if (typeof _ctx.toast === "function") _ctx.toast("Ссылка .ics скопирована");
      return true;
    }

    if (act === "tc-cal-import-modal") {
      st.calImportOpen = true;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-cal-import-close") {
      st.calImportOpen = false;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-cal-import-sample") {
      if (EGE.realtime && typeof EGE.realtime.importIcs === "function") {
        const resProm = EGE.realtime.importIcs({
          tutorSlug: getTutorSlug(st),
          tutorName: st.profile.name,
          city: st.profile.city,
          timezone: st.profile.timezone,
          icsText: SAMPLE_GCAL_ICS,
          openSlots: st.slots
        });
        const rtCal = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState().calendar : null;
        if (rtCal) {
          st.calendarSync = Object.assign({}, st.calendarSync || {}, {
            gcalConnected: true,
            icsUrl: rtCal.icsUrl,
            googleSubscribeUrl: rtCal.googleSubscribeUrl,
            googleTemplateUrl: rtCal.googleTemplateUrl,
            busySlots: Array.isArray(rtCal.busySlots) ? rtCal.busySlots : [],
            conflicts: Array.isArray(rtCal.conflicts) ? rtCal.conflicts : [],
            lastSyncAt: Date.now()
          });
        }
        saveState();
        if (resProm && typeof resProm.then === "function") {
          resProm.then((res) => {
            if (res && res.ok) {
              st.calendarSync = Object.assign({}, st.calendarSync || {}, {
                gcalConnected: true,
                busySlots: Array.isArray(res.busySlots) ? res.busySlots : st.calendarSync.busySlots,
                conflicts: Array.isArray(res.conflicts) ? res.conflicts : st.calendarSync.conflicts,
                lastSyncAt: Date.now()
              });
              saveState();
              if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
            }
          }).catch(() => {});
        }
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide("Импорт GCal (.ics) выполнен", `События 07:00 UTC пересчитаны в ${st.profile.timezone || "UTC+9"}`);
      }
      return true;
    }

    if (act === "tc-subj-toggle") {
      st.subjMenuOpen = !st.subjMenuOpen;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-subj-pick") {
      const pickedId = String(d.v || "bio");
      const curList = Array.isArray(st.profile.subjects) && st.profile.subjects.length ? st.profile.subjects : [st.profile.subject || "bio"];
      if (curList.includes(pickedId) && curList.length <= 1) {
        if (typeof _ctx.toast === "function") _ctx.toast("Должен остаться хотя бы один предмет");
        return true;
      }
      st.profile.subjects = toggleArrayVal(curList, pickedId, true);
      st.profile.subject = st.profile.subjects[0] || "bio";
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-badge-preset") {
      const txt = String(d.v || "").trim().slice(0, 36);
      if (txt) {
        const arr = Array.isArray(st.profile.customBadges) ? st.profile.customBadges.slice(0, 2) : ["", ""];
        while (arr.length < 2) arr.push("");
        if (!arr.includes(txt)) {
          const emptyIdx = arr.findIndex((x) => !String(x || "").trim());
          arr[emptyIdx >= 0 ? emptyIdx : 1] = txt;
          st.profile.customBadges = arr;
          syncPublishedTutor(st);
          saveState();
          if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        }
      }
      return true;
    }

    if (act === "tc-badge-clear") {
      st.profile.customBadges = ["", ""];
      syncPublishedTutor(st);
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-leads-mine") {
      st.leadsMineOnly = !st.leadsMineOnly;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-leads-mode") {
      st.leadsMineOnly = d.v === "mine";
      st.leadsSubj = "all";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-leads-subj") {
      st.leadsSubj = String(d.v || "all");
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-chart-style") {
      st.chartStyle = ["sticks", "lollipop", "capsule", "combo", "classic"].includes(d.v) ? d.v : "sticks";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-lead-offer") {
      const TDATA = getTDATA();
      const hit = TDATA && typeof TDATA.markStudentLeadResponded === "function" ? TDATA.markStudentLeadResponded(id) : null;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide("Отклик отправлен ученику", hit ? `${hit.studentName} получил(а) ваше предложение по ставке ${st.profile.price.toLocaleString("ru-RU")} ₽/ч` : "Запрос ученика отмечен как отвеченный");
      }
      return true;
    }

    if (act === "tc-student-score") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.curScore = Math.min(s.targetScore, (Number(s.curScore) || 0) + (Number(d.delta) || 2));
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.notifySide === "function") _ctx.notifySide("Пробник обновлён", `${s.name}: текущий балл ${s.curScore} / ${s.targetScore}`);
      }
      return true;
    }

    if (act === "tc-student-lesson") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.lessonsDone = (Number(s.lessonsDone) || 0) + 1;
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.toast === "function") _ctx.toast(`${s.name}: учтён урок №${s.lessonsDone}`);
      }
      return true;
    }

    if (act === "tc-copy-tpl") {
      const tpl = QUICK_TEMPLATES.find((t) => t.id === id);
      if (tpl) {
        copyStr(tpl.build(st.profile));
        if (typeof _ctx.notifySide === "function") _ctx.notifySide("Шаблон скопирован", tpl.title);
      }
      return true;
    }

    if (act === "tc-reset-demo") {
      const def = defaultState();
      st.filter = "all";
      st.requests = def.requests;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast("Демо-заявки обновлены");
      return true;
    }

    return false;
  }

  function handleInput(el) {
    if (!el || !el.dataset) return false;
    const st = tState();
    const act = el.dataset.a || el.id || "";
    if (act === "tc-req-tbl-q") {
      st.reqTblQuery = String(el.value || "");
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "tc-st-tbl-q") {
      st.stTblQuery = String(el.value || "");
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "tc-leads-tbl-q") {
      st.leadsTblQuery = String(el.value || "");
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (el.dataset.tcStudent) {
      const s = (st.students || []).find((x) => x.id === el.dataset.id);
      if (!s) return false;
      const sk = el.dataset.tcStudent;
      if (sk === "lessonDay") s.lessonDay = String(el.value || "").slice(0, 24);
      else if (sk === "lessonTime") s.lessonTime = String(el.value || "").slice(0, 12);
      else if (sk === "whatsapp") {
        const masked = formatPhone(el.value);
        if (el.value !== masked) el.value = masked;
        s.whatsapp = masked;
      } else if (sk === "telegram") {
        const tgFormatted = formatTelegram(el.value);
        if (el.value !== tgFormatted) el.value = tgFormatted;
        s.telegram = tgFormatted;
      }
      saveState();
      return true;
    }
    if (el.dataset.tcPayout === "card" || el.id === "tc-payout-card") {
      const masked = formatCardMask(el.value);
      if (el.value !== masked) el.value = masked;
      return false;
    }
    if (el.dataset.tcPayout === "phone" || el.id === "tc-payout-phone") {
      const digits = String(el.value || "").replace(/\D+/g, "");
      if (digits.length >= 10) {
        const maskedPhone = formatPhone(el.value);
        if (maskedPhone && el.value !== maskedPhone) el.value = maskedPhone;
      }
      return false;
    }
    if (!el.dataset.tc) return false;
    const key = el.dataset.tc;
    const p = st.profile;
    if (key === "name") p.name = String(el.value || "").slice(0, 48);
    else if (key === "headline") p.headline = String(el.value || "").slice(0, 72);
    else if (key === "city") p.city = CITY_OPTIONS.includes(el.value) ? el.value : "Якутск";
    else if (key === "timezone") p.timezone = TZ_OPTIONS.some((tz) => tz.id === el.value) ? el.value : "UTC+9";
    else if (key === "customSkills") p.customSkills = String(el.value || "").slice(0, 120);
    else if (key === "waTemplate") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      st.waSettings.template = String(el.value || "").slice(0, 260);
      saveState();
      return true;
    }
    else if (key === "education") p.education = String(el.value || "").slice(0, 90);
    else if (key === "whatsapp") {
      const masked = formatPhone(el.value);
      if (el.value !== masked) el.value = masked;
      p.whatsapp = masked;
    } else if (key === "telegram") {
      const tgFormatted = formatTelegram(el.value);
      if (el.value !== tgFormatted) el.value = tgFormatted;
      p.telegram = tgFormatted;
    }
    else if (key === "expYears") p.expYears = Math.max(1, Math.min(50, Number(el.value) || 1));
    else if (key === "avgScore") p.avgScore = Math.max(40, Math.min(100, Number(el.value) || 80));
    else if (key === "highScorers") p.highScorers = Math.max(0, Math.min(500, Number(el.value) || 0));
    else if (key === "trialFree") p.trialFree = !!el.checked;
    else if (key === "badge0" || key === "badge1") {
      if (!Array.isArray(p.customBadges)) p.customBadges = ["", ""];
      p.customBadges[key === "badge0" ? 0 : 1] = String(el.value || "").slice(0, 36);
    } else if (key === "subject") {
      p.subject = String(el.value || "bio");
      if (!Array.isArray(p.subjects) || !p.subjects.includes(p.subject)) p.subjects = [p.subject];
    }
    else if (key === "bio") p.bio = String(el.value || "").slice(0, 320);
    syncPublishedTutor(st);
    saveState();
    return true;
  }

  function handleFileInput(el) {
    if (!el || !el.files || !el.files[0]) return false;
    const file = el.files[0];
    if (!file.type || file.type.indexOf("image/") !== 0) {
      if (typeof _ctx.toast === "function") _ctx.toast("Выберите файл изображения (JPG, PNG, WebP)");
      return true;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const rawData = typeof reader.result === "string" ? reader.result : "";
      if (!rawData) return;
      const applyPhoto = (url) => {
        const st = tState();
        st.profile.photo = url;
        syncPublishedTutor(st);
        saveState();
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.toast === "function") _ctx.toast("Фото загружено и обновлено в каталоге");
      };
      if (typeof Image === "function" && typeof document !== "undefined") {
        const img = new Image();
        img.onload = () => {
          try {
            const maxDim = 240;
            const scale = Math.min(1, maxDim / Math.max(img.width || maxDim, img.height || maxDim));
            const w = Math.max(1, Math.round((img.width || maxDim) * scale));
            const h = Math.max(1, Math.round((img.height || maxDim) * scale));
            const cvs = document.createElement("canvas");
            cvs.width = w;
            cvs.height = h;
            const ctx2d = cvs.getContext("2d");
            if (ctx2d) {
              ctx2d.drawImage(img, 0, 0, w, h);
              applyPhoto(cvs.toDataURL("image/jpeg", 0.84));
              return;
            }
          } catch (e) { /* используем исходный dataURL */ }
          applyPhoto(rawData.slice(0, 350000));
        };
        img.onerror = () => applyPhoto(rawData.slice(0, 350000));
        img.src = rawData;
      } else {
        applyPhoto(rawData.slice(0, 350000));
      }
    };
    reader.readAsDataURL(file);
    el.value = "";
    return true;
  }

  function handleSubmit(form) {
    if (!form || !form.dataset) return false;
    const st = tState();
    const els = form.elements || {};

    if (form.dataset.f === "tc-cal-add") {
      const sName = els.studentName ? String(els.studentName.value || "").trim().slice(0, 40) : "";
      if (!sName) return true;
      const dowObj = DAY_LIST.find((x) => x.dow === st.activeDow) || DAY_LIST[5];
      const hour = els.hour ? String(els.hour.value || "14:00") : "14:00";
      const rate = Math.max(500, Math.min(5000, Number(els.offerPrice && els.offerPrice.value) || st.profile.price));
      const note = els.note ? String(els.note.value || "").trim().slice(0, 100) : "";
      const subjObj = (getTDATA() && getTDATA().SUBJECTS) ? getTDATA().SUBJECTS.find((s) => s.id === st.profile.subject) : null;
      const item = {
        id: "tc-man-" + Date.now(),
        studentName: sName,
        exam: (st.profile.exams && st.profile.exams[0]) || "ЕГЭ",
        subjectName: subjObj ? subjObj.name : "Подготовка",
        format: (st.profile.formats && st.profile.formats[0]) || "Онлайн",
        dow: dowObj.dow,
        dayLabel: `${dowObj.wd}, своё окно`,
        hour,
        offerPrice: rate,
        counterPrice: rate,
        tutorPrice: st.profile.price,
        marketPrice: Math.round(rate * 1.25),
        note: note || "Запись добавлена преподавателем вручную",
        status: "accepted",
        createdLabel: "Календарь"
      };
      st.requests.unshift(item);
      if (!st.students.some((s) => s.name === sName)) {
        st.students.unshift({
          id: "st-" + Date.now(),
          name: sName,
          exam: `${item.exam} · ${item.subjectName}`,
          startScore: 60,
          curScore: 60,
          targetScore: 85,
          lessonsDone: 1,
          hw: note || "Стартовая диагностика по варианту КИМ"
        });
      }
      st.calAddOpen = false;
      saveState();
      publishRtUpdate("calendar.lesson.created", "Ученик записан в календарь", `${sName} · ${dowObj.wd} в ${hour}`, { studentName: sName, dow: dowObj.dow, hour });
      syncTutorCalendar(st);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") _ctx.notifySide("Ученик записан в календарь", `${sName} · ${dowObj.wd} в ${hour} (${rate.toLocaleString("ru-RU")} ₽/ч)`);
      return true;
    }

    if (form.dataset.f === "tc-cal-import") {
      const rawIcs = els.icsText ? String(els.icsText.value || "").trim() : "";
      if (!rawIcs) {
        if (typeof _ctx.toast === "function") _ctx.toast("Вставьте содержимое .ics файла");
        return true;
      }
      st.calImportDraft = rawIcs;
      if (EGE.realtime && typeof EGE.realtime.importIcs === "function") {
        const resProm = EGE.realtime.importIcs({
          tutorSlug: getTutorSlug(st),
          tutorName: st.profile.name,
          city: st.profile.city,
          timezone: st.profile.timezone,
          icsText: rawIcs,
          openSlots: st.slots
        });
        const rtCal = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState().calendar : null;
        if (rtCal) {
          st.calendarSync = Object.assign({}, st.calendarSync || {}, {
            gcalConnected: true,
            icsUrl: rtCal.icsUrl,
            googleSubscribeUrl: rtCal.googleSubscribeUrl,
            googleTemplateUrl: rtCal.googleTemplateUrl,
            busySlots: Array.isArray(rtCal.busySlots) ? rtCal.busySlots : [],
            conflicts: Array.isArray(rtCal.conflicts) ? rtCal.conflicts : [],
            lastSyncAt: Date.now()
          });
        }
        if (resProm && typeof resProm.then === "function") {
          resProm.then((res) => {
            if (res && res.ok) {
              st.calendarSync = Object.assign({}, st.calendarSync || {}, {
                gcalConnected: true,
                busySlots: Array.isArray(res.busySlots) ? res.busySlots : st.calendarSync.busySlots,
                conflicts: Array.isArray(res.conflicts) ? res.conflicts : st.calendarSync.conflicts,
                lastSyncAt: Date.now()
              });
              saveState();
              if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
            }
          }).catch(() => {});
        }
      }
      st.calImportOpen = false;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") _ctx.notifySide("Внешний .ics импортирован", `События пересчитаны в ${st.profile.timezone || "UTC+9"}`);
      return true;
    }

    if (form.dataset.f !== "tc-profile") return false;
    const p = st.profile;
    if (els.name && String(els.name.value || "").trim()) p.name = String(els.name.value).trim().slice(0, 48);
    if (els.headline) p.headline = String(els.headline.value || "").trim().slice(0, 72);
    if (els.city) p.city = String(els.city.value || "").trim().slice(0, 48);
    if (els.education) p.education = String(els.education.value || "").trim().slice(0, 90);
    if (els.whatsapp) p.whatsapp = formatPhone(String(els.whatsapp.value || "").trim()) || p.whatsapp;
    if (els.telegram) p.telegram = formatTelegram(String(els.telegram.value || "").trim());
    if (els.expYears) p.expYears = Math.max(1, Math.min(50, Number(els.expYears.value) || p.expYears));
    if (els.avgScore) p.avgScore = Math.max(40, Math.min(100, Number(els.avgScore.value) || p.avgScore));
    if (els.highScorers) p.highScorers = Math.max(0, Math.min(500, Number(els.highScorers.value) || 0));
    if (els.trialFree) p.trialFree = !!els.trialFree.checked;
    if (els.badge0 || els.badge1) {
      if (!Array.isArray(p.customBadges)) p.customBadges = ["", ""];
      if (els.badge0) p.customBadges[0] = String(els.badge0.value || "").trim().slice(0, 36);
      if (els.badge1) p.customBadges[1] = String(els.badge1.value || "").trim().slice(0, 36);
    }
    if (els.subject) {
      const subVal = String(els.subject.value || "bio");
      p.subject = subVal;
      if (!Array.isArray(p.subjects) || !p.subjects.length) p.subjects = [subVal];
    }
    if (els.bio) p.bio = String(els.bio.value || "").trim().slice(0, 320);
    st.published = true;
    syncPublishedTutor(st);
    saveState();
    if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
    if (typeof _ctx.notifySide === "function") {
      _ctx.notifySide("Анкета сохранена и опубликована", `${p.name} · ${p.price.toLocaleString("ru-RU")} ₽/ч (торг от ${p.minFair.toLocaleString("ru-RU")} ₽/ч)`);
    }
    return true;
  }

  function closeMenus(target) {
    const st = tState();
    let changed = false;
    if (st.subjMenuOpen && (!target || typeof target.closest !== "function" || (!target.closest("#tc-subjects") && !target.closest("#tc-subject")))) {
      st.subjMenuOpen = false;
      changed = true;
    }
    if (st.tzMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#tc-timezone"))) {
      st.tzMenuOpen = false;
      changed = true;
    }
    return changed;
  }

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("input", (e) => {
      const el = e && e.target;
      const d = el && el.dataset;
      const act = (d && d.a) || (el && el.id) || "";
      if (act === "tc-req-tbl-q" || act === "tc-st-tbl-q" || act === "tc-leads-tbl-q") {
        handleInput(el);
      }
    });
  }

  EGE.views = EGE.views || {};
  EGE.views.tutorCabinet = {
    configure,
    pendingCount,
    getTab,
    setTab,
    closeMenus,
    viewCabinet,
    viewPayouts,
    getWalletSummary,
    desktopDockHTML,
    mobileTopWidgetHTML,
    payoutModalHTML,
    submitPayout,
    formatCardMask,
    handleAction,
    handleInput,
    handleFileInput,
    handleSubmit
  };
})();
