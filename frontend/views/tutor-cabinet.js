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
    { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", startScore: 58, curScore: 76, targetScore: 88, lessonsDone: 6, hw: "Линия №28 (сцепление генов) — сдать до Сб", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "79142100511", autoNotify: true, lastRemindedAt: 0 },
    { id: "st-darya", name: "Дарья В.", exam: "ОГЭ · Русский", startScore: 22, curScore: 31, targetScore: 36, lessonsDone: 4, hw: "Синтаксис и сжатое изложение — вариант №4", lessonDay: "Понедельник", lessonTime: "18:00", whatsapp: "79142100512", autoNotify: false, lastRemindedAt: 0 },
    { id: "st-timur", name: "Тимур К.", exam: "ЕГЭ · Химия", startScore: 64, curScore: 81, targetScore: 92, lessonsDone: 8, hw: "№34 на олеум и массовую долю — 5 задач", lessonDay: "Суббота", lessonTime: "16:00", whatsapp: "79142100513", autoNotify: true, lastRemindedAt: 0 }
  ];

  let _ctx = {};
  let _cache = null;
  let _countdownTimer = null;

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
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
      activeDow: "6",
      calWeek: 0,
      calAddHour: "",
      calAddOpen: false,
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
        whatsapp: "79142100199",
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
      students: DEFAULT_STUDENTS.map((s) => Object.assign({}, s))
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
      _cache.lastAutoBumpAt = Number(_cache.lastAutoBumpAt || _cache.lastBumpAt) || def.lastAutoBumpAt;
      _cache.lastBumpAt = _cache.lastAutoBumpAt;
      _cache.lastManualBumpAt = Number(_cache.lastManualBumpAt) || 0;
      _cache.slots = Object.assign({}, def.slots, saved.slots || {});
      _cache.requests = Array.isArray(saved.requests) && saved.requests.length ? saved.requests : def.requests;
      _cache.students = Array.isArray(saved.students) && saved.students.length
        ? saved.students.map((s, idx) => Object.assign({}, def.students[idx] || { lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "79142100511", autoNotify: true, lastRemindedAt: 0 }, s))
        : def.students;
    } else {
      _cache = def;
    }
    if (!_cache.chartStyle) _cache.chartStyle = "sticks";
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
            <button type="button" class="btn confirm sm" data-a="tc-req-msg" data-id="${esc(req.id)}">${icon("msg")}<span>Написать ученику</span></button>
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

  function renderRequestsTab(st, TDATA, allReqs, pendingList, acceptedList, baseSplit) {
    const p = st.profile;
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "bio", name: "Биология" }];
    const visibleReqs = st.filter === "pending" ? pendingList : st.filter === "accepted" ? acceptedList : allReqs;
    return `<div class="tc-grid">
      <section class="stack" style="gap:12px" aria-label="Входящие заявки учеников">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Торг в реальном времени</div>
            <h2 class="h2">Входящие заявки учеников</h2>
          </div>
          <div class="chip-rail" role="group" aria-label="Фильтр заявок">
            <button type="button" class="chip-btn${st.filter === "all" ? " on" : ""}" data-a="tc-filter" data-v="all">Все (${allReqs.length})</button>
            <button type="button" class="chip-btn${st.filter === "pending" ? " on" : ""}" data-a="tc-filter" data-v="pending">Ждут ответа (${pendingList.length})</button>
            <button type="button" class="chip-btn${st.filter === "accepted" ? " on" : ""}" data-a="tc-filter" data-v="accepted">Подтверждено (${acceptedList.length})</button>
          </div>
        </div>

        ${visibleReqs.length
          ? (() => {
              let markedFirstPending = false;
              return visibleReqs.map((req) => {
                const isFirstPending = req.status === "pending" && !markedFirstPending;
                if (isFirstPending) markedFirstPending = true;
                return renderRequestCard(req, st, isFirstPending);
              }).join("");
            })()
          : `<div class="empty"><b>По этому фильтру заявок нет</b><span class="small muted">Переключите фильтр или проверьте расписание открытых окон справа.</span><button type="button" class="btn soft sm" data-a="tc-reset-demo">Показать пример заявок</button></div>`}
      </section>

      <aside class="stack" style="gap:16px" aria-label="Быстрые настройки ставки и окон">
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
      </aside>
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
            <label for="tc-hh-wa">WhatsApp / контакт для учеников</label>
            <input class="input num" id="tc-hh-wa" name="whatsapp" data-tc="whatsapp" value="${esc(p.whatsapp || "")}" maxlength="32" placeholder="79142100199">
          </div>
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
    const dayOpenSlots = Array.isArray(st.slots[dowStr]) ? st.slots[dowStr] : [];
    const activeLessons = allReqs.filter((r) => r.status === "accepted" && (String(r.dow || dayDowFromLabel(r.dayLabel)) === dowStr));
    const weekCount = allReqs.filter((r) => r.status === "accepted").length;

    return `<div class="stack" style="gap:14px">
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
                    </div>
                    <span class="small muted">${esc(lesson.exam)} · ${esc(lesson.subjectName)}${lesson.note ? " — " + esc(lesson.note) : ""}</span>
                  </div>
                </div>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  ${!isAcc ? `<button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(lesson.id)}">Подтвердить</button>` : ""}
                  <button type="button" class="btn soft sm" data-a="tc-req-msg" data-id="${esc(lesson.id)}">${icon("msg")}<span>Чат</span></button>
                  <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(lesson.id)}">Снять</button>
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
                ["classic", "Столбики"]
              ].map(([cid, clbl]) => `<button type="button" data-a="tc-chart-style" data-v="${cid}" aria-pressed="${(st.chartStyle || "sticks") === cid}">${clbl}</button>`).join("")}
            </div>
          </div>
          <div class="tc-bar-chart${st.chartStyle === "classic" ? "" : ` is-${st.chartStyle || "sticks"}`}" role="img" aria-label="Диаграмма дохода по дням недели">
            ${dayBars.map((b) => {
              const hPct = Math.max(18, Math.round((b.rev / maxRev) * 100));
              return `<div class="tc-bar-col">
                <span class="tc-bar-val num">${Math.round(b.rev / 1000)}к ₽</span>
                <div class="tc-bar-track"><div class="tc-bar-fill${b.isGold ? " is-gold" : ""}" style="height:${hPct}%"></div></div>
                <span class="tc-bar-lbl">${b.wd}</span>
              </div>`;
            }).join("")}
          </div>
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
      </section>`;
  }

  function renderStudentsTab(st) {
    const p = st.profile;
    const students = Array.isArray(st.students) ? st.students : [];
    const waCfg = st.waSettings || { enabled: true, lead: "2h", template: "Здравствуйте, {имя}! Скоро будет урок ({предмет}) — {день} в {время}." };
    const sampleStudent = students[0] || { name: "Алина С.", exam: "ЕГЭ · Биология", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "79142100511" };
    const samplePreview = formatWaReminderText(st, sampleStudent);
    const sampleWaHref = studentWaHref(st, sampleStudent);

    return `<div class="tc-grid">
      <section class="stack" style="gap:12px" aria-label="Мои ученики и напоминания в WhatsApp">
        <div>
          <div class="eyebrow">Трекер баллов и связь в WhatsApp</div>
          <h2 class="h2">Мои ученики и автоуведомления</h2>
        </div>
        ${students.map((s) => {
          const pct = Math.max(8, Math.min(100, Math.round((s.curScore / Math.max(1, s.targetScore)) * 100)));
          const gain = s.curScore - s.startScore;
          const day = s.lessonDay || "Воскресенье";
          const time = s.lessonTime || "10:00";
          const waHref = studentWaHref(st, s);
          const lastRem = s.lastRemindedAt ? formatTimestamp(s.lastRemindedAt) : "";
          const leadLabel = (WA_LEAD_OPTIONS.find((o) => o.id === waCfg.lead) || WA_LEAD_OPTIONS[2]).label;
          return `<article class="tc-student-card">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <div class="row" style="gap:10px">
                <span class="tutor-avatar" aria-hidden="true">${esc(initials(s.name))}</span>
                <div class="stack" style="gap:2px">
                  <b>${esc(s.name)}</b>
                  <span class="small muted">${esc(s.exam)} · ${s.lessonsDone} ${plural(s.lessonsDone, "урок", "урока", "уроков")} проведено</span>
                </div>
              </div>
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <span class="chip confirm num">+${gain} б.</span>
                <span class="chip ${s.autoNotify ? "gold" : ""}">${s.autoNotify ? `Авто WhatsApp · ${esc(leadLabel)}` : "Авто-WA выкл"}</span>
              </div>
            </div>
            <div class="stack" style="gap:5px">
              <div class="row between small">
                <span class="muted">Старт: <b class="num">${s.startScore}</b> → Сейчас: <b class="num savings-gold-txt">${s.curScore}</b></span>
                <span class="muted">Цель: <b class="num">${s.targetScore}</b></span>
              </div>
              <div class="tc-score-track"><div class="tc-score-fill" style="width:${pct}%"></div></div>
            </div>
            <div class="tc-req-quote">Домашка / фокус: ${esc(s.hw)}</div>

            <div class="tc-wa-cfg">
              <div class="row between" style="gap:6px;flex-wrap:wrap">
                <b class="small">Ближайший урок и WhatsApp ученика</b>
                ${lastRem ? `<span class="small muted">Отправлено: ${esc(lastRem)}</span>` : `<span class="small muted">Готово к отправке</span>`}
              </div>
              <div class="fields" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
                <div class="field">
                  <label for="st-day-${esc(s.id)}">День</label>
                  <input class="input" id="st-day-${esc(s.id)}" data-tc-student="lessonDay" data-id="${esc(s.id)}" value="${esc(day)}" maxlength="24" placeholder="Воскресенье">
                </div>
                <div class="field">
                  <label for="st-time-${esc(s.id)}">Время</label>
                  <input class="input num" id="st-time-${esc(s.id)}" data-tc-student="lessonTime" data-id="${esc(s.id)}" value="${esc(time)}" maxlength="12" placeholder="10:00">
                </div>
                <div class="field">
                  <label for="st-wa-${esc(s.id)}">WhatsApp</label>
                  <input class="input num" id="st-wa-${esc(s.id)}" data-tc-student="whatsapp" data-id="${esc(s.id)}" value="${esc(s.whatsapp || "79142100511")}" maxlength="20" placeholder="7914...">
                </div>
              </div>
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <button type="button" class="btn confirm sm" data-a="tc-student-remind" data-id="${esc(s.id)}">${icon("msg")}<span>Напомнить: скоро урок (${esc(day)}, ${esc(time)})</span></button>
                <button type="button" class="btn ${s.autoNotify ? "gold" : "soft"} sm" data-a="tc-student-autonotify" data-id="${esc(s.id)}" aria-pressed="${!!s.autoNotify}">
                  ${icon("bell")}<span>${s.autoNotify ? "✓ Автоуведомление WhatsApp" : "Вкл. автоуведомление"}</span>
                </button>
                <a class="btn ghost sm" href="${esc(waHref)}" target="_blank" rel="noopener">Открыть WhatsApp →</a>
              </div>
            </div>

            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn soft sm" data-a="tc-student-score" data-id="${esc(s.id)}" data-delta="2">+2 балла за пробник</button>
              <button type="button" class="btn ghost sm" data-a="tc-student-lesson" data-id="${esc(s.id)}">+1 проведённый урок</button>
            </div>
          </article>`;
        }).join("")}
      </section>

      <aside class="stack" style="gap:12px" aria-label="Автоуведомления WhatsApp и шаблоны">
        <div class="card stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div>
              <div class="eyebrow">WhatsApp-напоминания</div>
              <h2 class="h2">Настройка автоуведомлений</h2>
            </div>
            <button type="button" class="btn ${waCfg.enabled ? "confirm" : "soft"} sm" data-a="tc-wa-global-toggle" aria-pressed="${!!waCfg.enabled}">
              ${waCfg.enabled ? "✓ Система включена" : "Включить систему"}
            </button>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Когда автоматически писать ученику в WhatsApp:</span>
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
              <a class="btn confirm sm" href="${esc(sampleWaHref)}" target="_blank" rel="noopener">${icon("send")}<span>Тест в WhatsApp</span></a>
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
      </aside>
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

      ${filtered.length ? `<div class="stack" style="gap:10px">${filtered.map((lead) => {
        const subjIds = Array.isArray(lead.subjects) ? lead.subjects : [];
        const subjNames = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(subjIds) : subjIds;
        const rate = Number(lead.targetPrice) || st.profile.price;
        const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.round(rate * 0.95) };
        const waHref = TDATA && typeof TDATA.studentLeadWhatsappUrl === "function"
          ? TDATA.studentLeadWhatsappUrl(lead, `Здравствуйте, ${lead.studentName}! Я преподаватель ${st.profile.name} (${tutorSubjLabels}). Готов(а) провести урок по вашей заявке (${rate} ₽/ч).`)
          : "";
        return `<article class="tc-req-card ${lead.responded ? "is-accepted" : "is-pending"}">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <b>${esc(lead.studentName)}</b>
              <span class="chip">${esc(lead.exam)} · ${esc(lead.format)}</span>
              ${subjNames.map((nm, idx) => `<span class="chip ${tutorSubjSet.has(subjIds[idx]) ? "accent" : ""}">${esc(nm)}</span>`).join("")}
              ${lead.mine ? '<span class="chip gold">Свежая из кабинета ученика</span>' : ""}
              ${lead.responded ? '<span class="chip confirm">✓ Вы написали ученику</span>' : ""}
            </div>
            <span class="small muted">${esc(lead.createdAt || "Сегодня")} · ${esc(lead.scheduleNote || "Гибкий график")}</span>
          </div>
          <div class="tc-req-quote">${esc(lead.comment)}</div>
          <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <span class="small muted">Бюджет ученика:</span>
              <b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b>
              <span class="small muted">(на руки 95%: <b class="num savings-gold-txt">${sp.payout.toLocaleString("ru-RU")} ₽</b>)</span>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              ${waHref ? `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать ученику</span></a>` : ""}
              <button type="button" class="btn ${lead.responded ? "soft" : ""} sm" data-a="tc-lead-offer" data-id="${esc(lead.id)}">${lead.responded ? "✓ Отклик отправлен" : "Откликнуться со ставкой"}</button>
            </div>
          </div>
        </article>`;
      }).join("")}</div>` : `<div class="empty"><b>По выбранному предмету заявок учеников пока нет</b><span>Отключите фильтр или дождитесь новых запросов из кабинета ученика.</span></div>`}
    </div>`;
  }

  function viewCabinet() {
    ensureCountdownTimer();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
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
          <div class="row" style="gap:8px;flex-wrap:wrap">
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
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", template: "" };
      st.waSettings.enabled = !st.waSettings.enabled;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast(st.waSettings.enabled ? "Автоуведомления WhatsApp включены" : "Автоуведомления WhatsApp на паузе");
      return true;
    }

    if (act === "tc-wa-lead") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", template: "" };
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
          _ctx.notifySide(
            s.autoNotify ? "Автоуведомление WhatsApp включено" : "Автоуведомление выключено",
            s.autoNotify ? `${s.name}: система напишет ${leadLabel} (${s.lessonDay || "Воскресенье"}, ${s.lessonTime || "10:00"})` : `${s.name}: только ручные напоминания`
          );
        }
      }
      return true;
    }

    if (act === "tc-student-remind") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.lastRemindedAt = Date.now();
        saveState();
        const url = studentWaHref(st, s);
        if (typeof window !== "undefined" && typeof window.open === "function") {
          try { window.open(url, "_blank", "noopener"); } catch (e) { /* игнор */ }
        }
        if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        if (typeof _ctx.notifySide === "function") {
          _ctx.notifySide("Напоминание подготовлено для WhatsApp", `${s.name} · ${s.lessonDay || "Воскресенье"} в ${s.lessonTime || "10:00"}`);
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
      if (updated && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      const who = findReq(id);
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
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
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
      st.chartStyle = ["sticks", "lollipop", "capsule", "classic"].includes(d.v) ? d.v : "sticks";
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
    if (el.dataset.tcStudent) {
      const s = (st.students || []).find((x) => x.id === el.dataset.id);
      if (!s) return false;
      const sk = el.dataset.tcStudent;
      if (sk === "lessonDay") s.lessonDay = String(el.value || "").slice(0, 24);
      else if (sk === "lessonTime") s.lessonTime = String(el.value || "").slice(0, 12);
      else if (sk === "whatsapp") s.whatsapp = String(el.value || "").slice(0, 20);
      saveState();
      return true;
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
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", template: "" };
      st.waSettings.template = String(el.value || "").slice(0, 260);
      saveState();
      return true;
    }
    else if (key === "education") p.education = String(el.value || "").slice(0, 90);
    else if (key === "whatsapp") p.whatsapp = String(el.value || "").slice(0, 32);
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
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") _ctx.notifySide("Ученик записан в календарь", `${sName} · ${dowObj.wd} в ${hour} (${rate.toLocaleString("ru-RU")} ₽/ч)`);
      return true;
    }

    if (form.dataset.f !== "tc-profile") return false;
    const p = st.profile;
    if (els.name && String(els.name.value || "").trim()) p.name = String(els.name.value).trim().slice(0, 48);
    if (els.headline) p.headline = String(els.headline.value || "").trim().slice(0, 72);
    if (els.city) p.city = String(els.city.value || "").trim().slice(0, 48);
    if (els.education) p.education = String(els.education.value || "").trim().slice(0, 90);
    if (els.whatsapp) p.whatsapp = String(els.whatsapp.value || "").trim().slice(0, 32);
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

  EGE.views = EGE.views || {};
  EGE.views.tutorCabinet = {
    configure,
    pendingCount,
    getTab,
    setTab,
    closeMenus,
    viewCabinet,
    viewPayouts,
    handleAction,
    handleInput,
    handleFileInput,
    handleSubmit
  };
})();
