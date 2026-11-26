/* Данные и логика маркетплейса репетиторов «Вектор»:
   анкеты, свободные окна по дням и часам, тарифы подписок и предпросмотр торга (inDrive-формат). */
(function () {
  var EGE = (window.EGE = window.EGE || {});

  var LS_DIRECTIONS_KEY = "vektor-ege:directions:v1";

  var DIRECTION_CATEGORIES = [
    "Школа и экзамены",
    "Спорт и движение",
    "IT и диджитал",
    "Творчество и музыка",
    "Языки",
    "Дети и навыки",
    "Добавлено оркестратором"
  ];

  var PREVIEW_SUBJECT_IDS = [
    "rus", "math", "soc", "eng", "inf", "bio", "chem",
    "prog", "design", "music", "judo", "chess"
  ];

  var SUBJECTS = [
    { id: "rus", name: "Русский язык", short: "Русский", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["сочинение", "орфография", "пунктуация", "грамотность"] },
    { id: "math", name: "Математика", short: "Математика", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["профиль", "алгебра", "геометрия", "высшая математика"] },
    { id: "soc", name: "Обществознание", short: "Обществознание", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["право", "экономика", "социология", "политика"] },
    { id: "eng", name: "Английский язык", short: "Английский", isExam: true, category: "Языки", source: "base", keywords: ["ielts", "toefl", "разговорный", "grammar", "speaking"] },
    { id: "inf", name: "Информатика", short: "Информатика", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["кегэ", "python", "алгоритмы", "егэ информатика"] },
    { id: "bio", name: "Биология", short: "Биология", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["генетика", "анатомия", "медвуз", "ботаника"] },
    { id: "chem", name: "Химия", short: "Химия", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["органика", "неорганика", "медвуз", "задача 34"] },
    { id: "phys", name: "Физика", short: "Физика", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["механика", "оптика", "электричество", "физтех"] },
    { id: "hist", name: "История", short: "История", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["история россии", "всеобщая", "даты", "карты"] },
    { id: "lit", name: "Литература", short: "Литература", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["анализ текста", "сочинение", "поэзия", "классика"] },
    { id: "geo", name: "География", short: "География", isExam: true, category: "Школа и экзамены", source: "base", keywords: ["топография", "карты", "климат", "природопользование"] },
    { id: "prog", name: "Программирование и Python", short: "Программирование", isExam: false, category: "IT и диджитал", source: "base", keywords: ["python", "javascript", "frontend", "backend", "разработка", "код"] },
    { id: "design", name: "UX/UI и Figma", short: "Дизайн UX/UI", isExam: false, category: "IT и диджитал", source: "base", keywords: ["figma", "веб-дизайн", "интерфейсы", "графический дизайн", "tilda"] },
    { id: "robotics", name: "Робототехника и Arduino", short: "Робототехника", isExam: false, category: "IT и диджитал", source: "base", keywords: ["arduino", "лего", "lego", "роботы", "электроника", "инженерия"] },
    { id: "video", name: "Видеомонтаж и 3D", short: "Видеомонтаж и 3D", isExam: false, category: "IT и диджитал", source: "base", keywords: ["blender", "монтаж", "premiere", "after effects", "3d", "анимация"] },
    { id: "music", name: "Вокал, гитара и музыка", short: "Вокал / Гитара", isExam: false, category: "Творчество и музыка", source: "base", keywords: ["пение", "акустика", "электрогитара", "укулеле", "сольфеджио"] },
    { id: "piano", name: "Фортепиано и сольфеджио", short: "Фортепиано", isExam: false, category: "Творчество и музыка", source: "base", keywords: ["пианино", "синтезатор", "клавиши", "ноты", "музыкальная школа"] },
    { id: "art", name: "Рисование и скетчинг", short: "Рисование", isExam: false, category: "Творчество и музыка", source: "base", keywords: ["живопись", "графика", "акварель", "академический рисунок", "иллюстрация"] },
    { id: "photo", name: "Фотография и ретушь", short: "Фотография", isExam: false, category: "Творчество и музыка", source: "base", keywords: ["фото", "съемка", "lightroom", "photoshop", "обработка"] },
    { id: "judo", name: "Дзюдо и ОФП", short: "Дзюдо", isExam: false, category: "Спорт и движение", source: "base", keywords: ["единоборства", "борьба", "броски", "офп", "татами"] },
    { id: "boxing", name: "Бокс, самбо и единоборства", short: "Бокс / Самбо", isExam: false, category: "Спорт и движение", source: "base", keywords: ["бокс", "самбо", "мма", "кикбоксинг", "борьба", "спарринг"] },
    { id: "swim", name: "Плавание и техника кроля", short: "Плавание", isExam: false, category: "Спорт и движение", source: "base", keywords: ["бассейн", "кроль", "брасс", "тренер по плаванию", "вода"] },
    { id: "fitness", name: "Фитнес, йога и растяжка", short: "Фитнес и йога", isExam: false, category: "Спорт и движение", source: "base", keywords: ["йога", "растяжка", "пилатес", "стретчинг", "лфк", "спина"] },
    { id: "dance", name: "Танцы и хореография", short: "Танцы", isExam: false, category: "Спорт и движение", source: "base", keywords: ["хореография", "хип-хоп", "бальные", "брейк", "современные"] },
    { id: "tennis", name: "Теннис и бадминтон", short: "Теннис / Бадминтон", isExam: false, category: "Спорт и движение", source: "base", keywords: ["большой теннис", "настольный теннис", "пинг-понг", "бадминтон", "корт"] },
    { id: "chess", name: "Шахматы и логика", short: "Шахматы", isExam: false, category: "Творчество и музыка", source: "base", keywords: ["дебюты", "тактика", "эндшпиль", "турнир", "шашки"] },
    { id: "chinese", name: "Китайский язык и HSK", short: "Китайский язык", isExam: false, category: "Языки", source: "base", keywords: ["hsk", "иероглифы", "китай", "пиньинь", "мандарин"] },
    { id: "korean", name: "Корейский и японский языки", short: "Корейский / Японский", isExam: false, category: "Языки", source: "base", keywords: ["topik", "jlpt", "корейский", "японский", "каллиграфия"] },
    { id: "yakut", name: "Якутский язык (Саха тыла)", short: "Якутский язык", isExam: false, category: "Языки", source: "base", keywords: ["саха", "саха тыла", "якутия", "разговорный"] },
    { id: "speech", name: "Логопед и постановка речи", short: "Логопед", isExam: false, category: "Дети и навыки", source: "base", keywords: ["логопед", "дикция", "дефектолог", "звуки", "речь"] },
    { id: "primary", name: "Начальная школа (1–4 класс)", short: "Начальная школа", isExam: false, category: "Дети и навыки", source: "base", keywords: ["чтение", "скорочтение", "подготовка к школе", "впр", "каллиграфия"] },
    { id: "oratory", name: "Ораторское искусство и риторика", short: "Ораторское искусство", isExam: false, category: "Дети и навыки", source: "base", keywords: ["риторика", "презентации", "дебаты", "публичные выступления", "актерское"] }
  ];

  var _TRANSLIT_RU = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya"
  };

  function slugifyDirection(label) {
    var src = String(label || "").trim().toLowerCase();
    var out = "";
    for (var i = 0; i < src.length; i++) {
      var ch = src.charAt(i);
      if (_TRANSLIT_RU[ch] !== undefined) out += _TRANSLIT_RU[ch];
      else if (/[a-z0-9]/.test(ch)) out += ch;
      else out += "-";
    }
    out = out.replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 36);
    if (!out || /^\d+$/.test(out)) out = "dir-" + (out || "custom");
    return out;
  }

  function cleanDirectionLabel(raw) {
    return String(raw || "").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
  }

  function findDirectionMatch(queryOrId) {
    var clean = cleanDirectionLabel(queryOrId).toLowerCase();
    if (!clean) return null;
    for (var i = 0; i < SUBJECTS.length; i++) {
      var sb = SUBJECTS[i];
      if (String(sb.id || "").toLowerCase() === clean ||
          String(sb.short || "").toLowerCase() === clean ||
          String(sb.name || "").toLowerCase() === clean) {
        return sb;
      }
    }
    return null;
  }

  function persistAutoDirections() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      var autoOnly = SUBJECTS.filter(function (s) { return !!(s && s.autoAdded); }).map(function (s) {
        return {
          id: s.id,
          name: s.name,
          short: s.short,
          isExam: false,
          category: s.category || "Добавлено оркестратором",
          source: s.source || "orchestrator",
          keywords: Array.isArray(s.keywords) ? s.keywords : [],
          demandCount: Number(s.demandCount) || 1,
          tutorCount: Number(s.tutorCount) || 0,
          autoAdded: true,
          addedAt: s.addedAt || ""
        };
      });
      window.localStorage.setItem(LS_DIRECTIONS_KEY, JSON.stringify(autoOnly));
    } catch (e) { /* игнор недоступного localStorage */ }
  }

  function registerDirection(raw, opts) {
    var obj = (raw && typeof raw === "object") ? raw : { name: String(raw || ""), short: String(raw || "") };
    var label = cleanDirectionLabel(obj.short || obj.name || obj.id || "");
    if (label.length < 2) return null;
    var fullName = cleanDirectionLabel(obj.name || label);
    if (fullName.length < 2) fullName = label;
    var shortLabel = label.length > 34 ? (label.slice(0, 33).trim() + "…") : label;
    var incomingSource = String(obj.source || "orchestrator").trim() || "orchestrator";
    var incomingKw = Array.isArray(obj.keywords)
      ? obj.keywords.map(function (k) { return cleanDirectionLabel(k).toLowerCase(); }).filter(Boolean)
      : [];

    var existing = findDirectionMatch(obj.id) || findDirectionMatch(shortLabel) || findDirectionMatch(fullName);
    if (existing) {
      if (existing.autoAdded) {
        existing.demandCount = Math.max(Number(existing.demandCount) || 1, Number(obj.demandCount) || 1);
        if (!(opts && opts.fromSync)) existing.demandCount += 1;
        existing.tutorCount = Math.max(Number(existing.tutorCount) || 0, Number(obj.tutorCount) || 0);
        if (incomingSource === "orchestrator") existing.source = "orchestrator";
        if (incomingKw.length) {
          var kwSet = {};
          (existing.keywords || []).concat(incomingKw).forEach(function (k) { kwSet[k] = 1; });
          existing.keywords = Object.keys(kwSet).slice(0, 12);
        }
        if (!(opts && opts.skipPersist)) persistAutoDirections();
      }
      return { direction: existing, created: false };
    }

    var baseId = cleanDirectionLabel(obj.id || "").toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!baseId || baseId.length < 2) baseId = slugifyDirection(shortLabel);
    var id = baseId;
    var suffix = 2;
    while (SUBJECTS.some(function (s) { return s.id === id; })) {
      id = baseId.slice(0, 32) + "-" + suffix;
      suffix++;
    }

    var entry = {
      id: id,
      name: fullName,
      short: shortLabel,
      isExam: false,
      category: cleanDirectionLabel(obj.category || "") || "Добавлено оркестратором",
      source: incomingSource,
      keywords: incomingKw,
      autoAdded: true,
      demandCount: Math.max(1, Number(obj.demandCount) || 1),
      tutorCount: Math.max(0, Number(obj.tutorCount) || 0),
      addedAt: String(obj.addedAt || new Date().toISOString())
    };
    SUBJECTS.push(entry);
    if (!(opts && opts.skipPersist)) persistAutoDirections();
    return { direction: entry, created: true };
  }

  function syncDirections(items) {
    if (!Array.isArray(items) || !items.length) return 0;
    var added = 0;
    items.forEach(function (it) {
      if (!it || typeof it !== "object") return;
      var res = registerDirection(it, { fromSync: true, skipPersist: true });
      if (res && res.created) added++;
    });
    if (added > 0) persistAutoDirections();
    return added;
  }

  function loadPersistedDirections() {
    try {
      if (typeof window === "undefined" || !window.localStorage) return;
      var raw = window.localStorage.getItem(LS_DIRECTIONS_KEY);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) syncDirections(parsed);
    } catch (e) { /* игнор битого JSON */ }
  }

  loadPersistedDirections();

  function subjectsForExam(exam) {
    if (exam === "ЕГЭ" || exam === "ОГЭ") {
      return SUBJECTS.filter(function (s) { return !!s.isExam; });
    }
    return SUBJECTS.slice();
  }

  function searchDirections(query, exam) {
    var list = subjectsForExam(exam);
    var rawQ = cleanDirectionLabel(query);
    var q = rawQ.toLowerCase();
    if (!q) {
      return { items: list, exactMatch: null, normalizedQuery: "", rawQuery: "" };
    }
    var tokens = q.split(/\s+/).filter(Boolean);
    var exact = null;
    var scored = [];
    list.forEach(function (sb) {
      var shortL = String(sb.short || "").toLowerCase();
      var nameL = String(sb.name || "").toLowerCase();
      var catL = String(sb.category || "").toLowerCase();
      var kwL = Array.isArray(sb.keywords) ? sb.keywords.join(" ").toLowerCase() : "";
      if (shortL === q || nameL === q || String(sb.id || "").toLowerCase() === q) {
        exact = sb;
      }
      var hay = [shortL, nameL, catL, kwL].join(" ");
      var allMatch = tokens.every(function (t) { return hay.indexOf(t) >= 0; });
      if (allMatch) {
        var score = shortL.indexOf(q) === 0 ? 3 : (nameL.indexOf(q) === 0 ? 2 : 1);
        scored.push({ sb: sb, score: score });
      }
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return {
      items: scored.map(function (x) { return x.sb; }),
      exactMatch: exact,
      normalizedQuery: q,
      rawQuery: rawQ
    };
  }

  var PREP_UNIVERSE = [
    { label: "ЕГЭ на 85+", subject: "all", meta: "от 950 ₽/ч · −24% ниже рынка" },
    { label: "ОГЭ без стресса", subject: "all", meta: "от 850 ₽/ч · −22% ниже рынка" },
    { label: "Python и алгоритмы", subject: "inf", meta: "от 1 100 ₽/ч · вместо 1 500 ₽" },
    { label: "UX/UI в Figma", subject: "design", meta: "от 1 050 ₽/ч · портфолио с нуля" },
    { label: "Продуктовый дизайн", subject: "design", meta: "от 1 100 ₽/ч · реальные кейсы" },
    { label: "Разговорный английский", subject: "eng", meta: "от 950 ₽/ч · IELTS и работа" },
    { label: "Медвуз: биология + химия", subject: "bio", meta: "от 1 000 ₽/ч · задачи 28 и 34" },
    { label: "Высшая математика", subject: "math", meta: "от 1 000 ₽/ч · сессия и ЕГЭ" },
    { label: "Физика и Физтех", subject: "phys", meta: "от 1 050 ₽/ч · олимпиады и ВУЗ" },
    { label: "Вокал и гитара", subject: "music", meta: "от 850 ₽/ч · онлайн и студия" },
    { label: "История и право", subject: "hist", meta: "от 900 ₽/ч · карты и эссе" },
    { label: "Собеседование в IT", subject: "inf", meta: "от 1 200 ₽/ч · −25% ниже рынка" }
  ];

  var LIVE_DEALS = [
    { topic: "ЕГЭ Биология", paid: 1050, market: 1400, tag: "вместо 1 400 ₽ · −25%" },
    { topic: "UX/UI и Figma", paid: 1100, market: 1500, tag: "вместо 1 500 ₽ · −27%" },
    { topic: "Английский B2 / ЕГЭ", paid: 1000, market: 1350, tag: "вместо 1 350 ₽ · −26%" },
    { topic: "Python и КЕГЭ", paid: 1150, market: 1550, tag: "вместо 1 550 ₽ · −26%" },
    { topic: "Вокал и слух", paid: 850, market: 1150, tag: "вместо 1 150 ₽ · −26%" },
    { topic: "Химия №34 (медвуз)", paid: 1100, market: 1450, tag: "вместо 1 450 ₽ · −24%" },
    { topic: "Математика профиль", paid: 1000, market: 1350, tag: "вместо 1 350 ₽ · −26%" }
  ];

  var CATALOG_TOTAL = 2480;
  var SOURCE_CHANNELS = ["Доска Ykt", "Telegram", "WhatsApp", "MAX", "Доска Ykt · TG", "WA · MAX"];

  var HOURS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
  var WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var WEEKDAYS_LONG = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  var MONTHS_GEN = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
  var COMMISSION_PCT = 5;
  var SBP_PCT = 1;
  var MINIGROUP_PCT = 8;
  var TRIAL_PRICE = 490;
  var MIN_INITIAL_TOPUP = 490;

  function commissionSplit(price) {
    var total = Math.max(0, Math.round(Number(price) || 0));
    var fee = Math.round(total * COMMISSION_PCT / 100);
    var sbpFee = Math.round(total * SBP_PCT / 100);
    var net = Math.max(0, total - fee - sbpFee);
    var miniGroupFee = Math.round(total * MINIGROUP_PCT / 100);
    return {
      total: total,
      fee: fee,
      sbpFee: sbpFee,
      totalFee: fee + sbpFee,
      payout: net,
      pct: COMMISSION_PCT,
      sbpPct: SBP_PCT,
      netPct: 100 - COMMISSION_PCT - SBP_PCT,
      tutorSbpNet: net,
      miniGroupPct: MINIGROUP_PCT,
      miniGroupFee: miniGroupFee
    };
  }

  var CITIES = ["Якутск", "Москва"];
  var TIMEZONES = [
    { id: "UTC+9", label: "Якутск (UTC+9)", short: "UTC+9" },
    { id: "UTC+3", label: "Москва (UTC+3)", short: "UTC+3" }
  ];

  var PLANS = [
    {
      id: "ai390",
      name: "ИИ-Старт ЕГЭ",
      badge: "Массовый ИИ-тариф",
      kind: "ai",
      featured: false,
      price: 390,
      balance: 390,
      priceLabel: "390 ₽/мес",
      period: "подписка на тренажёр · СБП",
      tagline: "Безлимит адаптивного банка ЕГЭ-2027 и ИИ-проверка сочинений К1–К12 без репетитора",
      cta: "Подключить по СБП · 390 ₽",
      features: [
        "Безлимитный тренажёр ЕГЭ-2027 и проверка сочинения Задания 27 по К1–К12",
        "Прогноз тестовых и вторичных баллов + разбор ловушек ФИПИ",
        "Мгновенная оплата через СБП (АЭБ, Сбер, Т-Банк, ВТБ) без привязки карты",
        "Входит бесплатно во все абонементы от 2 190 ₽"
      ]
    },
    {
      id: "trial990",
      name: "Пробный урок · 60 мин",
      badge: "Лёгкий вход · 490 ₽",
      featured: true,
      price: 490,
      balance: 490,
      priceLabel: "490 ₽",
      period: "полноценный урок 60 мин · СБП-эскроу",
      tagline: "Полноценный час диагностики и план подготовки всего за 490 ₽ на СБП-эскроу (или бесплатно у части преподавателей)",
      cta: "Забронировать по СБП · 490 ₽",
      features: [
        "60 минут живой диагностики ЕГЭ/ОГЭ и персональный план подготовки",
        "100% гарантия: не совпал темп — бесплатно заменим репетитора в 1 клик",
        "Сразу после бронирования открывает WhatsApp, Telegram и MAX в «Учёбе»",
        "Открывает любые последующие пополнения баланса по СБП от 100 ₽"
      ]
    },
    {
      id: "minigroup",
      name: "Мини-группа Саха",
      badge: "Хит экономии · 548 ₽/ч",
      featured: true,
      price: 2190,
      balance: 2190,
      priceLabel: "2 190 ₽",
      period: "4 урока в группе 3–5 чел. · эскроу",
      tagline: "Живые занятия в мини-группе одного уровня (15:00–20:00 YKT) в 2 раза доступнее индивидуальных",
      cta: "Подключить по СБП · 2 190 ₽",
      features: [
        "4 полноценных урока в мини-группе 3–5 учеников (~548 ₽ за занятие)",
        "Поурочная заморозка на эскроу — списание только после проведённого урока",
        "Тариф «ИИ-Старт ЕГЭ» (390 ₽/мес) включён бесплатно на весь месяц",
        "Сильные педагоги Якутска и Москвы с проверенным рейтингом"
      ]
    },
    {
      id: "trial5k",
      name: "Стандарт · 4 урока",
      badge: "Абонемент 1-на-1",
      featured: true,
      price: 4590,
      balance: 4590,
      priceLabel: "4 590 ₽",
      period: "4 индивидуальных урока · СБП-эскроу",
      tagline: "Базовый абонемент 1-на-1 (~1 148 ₽/ч выгоднее разовых 1 200 ₽) с поурочной защитой депозита",
      cta: "Подключить по СБП · 4 590 ₽",
      features: [
        "4 590 ₽ на защищённый баланс — далее доплаты любой суммой от 100 ₽",
        "Деньги списываются поурочно после подтверждения занятия, отмена ≥ 4 ч — возврат 100%",
        "«ИИ-Старт ЕГЭ» бесплатно + автоотчёт родителю в Telegram / WhatsApp",
        "Замена преподавателя в 1 клик без доплат с сохранением всего остатка"
      ]
    },
    {
      id: "month10k",
      name: "Интенсив · Месяц под ключ",
      badge: "Супер-подписка",
      super: true,
      featured: true,
      price: 8900,
      balance: 8900,
      priceLabel: "8 900 ₽",
      period: "8 уроков · приоритет 24/7 и кэшбэк 2%",
      tagline: "Максимальный темп подготовки на 85+ баллов с фиксацией ставки репетитора до самого ЕГЭ",
      cta: "Подключить по СБП · 8 900 ₽",
      features: [
        "8 900 ₽ на баланс (~8 уроков по ~1 112 ₽/ч) с защитой на СБП-эскроу",
        "Приоритетный подбор: найдём замену за 15 мин, если преподаватель занят",
        "Кэшбэк 2% бонусными рублями на следующий месяц и фиксация ставки до ЕГЭ",
        "Безлимит ИИ-проверки сочинений К1–К12 и конспектов по всем предметам"
      ]
    }
  ];

  var TUTOR_PLANS = [
    {
      id: "tutor-free",
      name: "Свободный старт",
      badge: "Единый бесплатный тариф",
      pro: false,
      price: 0,
      priceLabel: "0 ₽/мес",
      subLabel: "без платных подписок и скрытых доплат",
      features: [
        "Равные условия выдачи в каталоге и выбор формата пробного: 0 ₽, 490 ₽ или без пробного",
        "94% с учеников площадки (5% сервис + 1% СБП) и 98% со своих учеников (1% + 1% СБП)",
        "Автоматический чек НПД («Мой налог») и вывод на СБП от 500 ₽"
      ]
    }
  ];

  // Анкеты преподавателей: расписание по дням недели (0=Вс .. 6=Сб) и доступным часам.
  var LIST = [
    {
      id: "tut-sokolova",
      name: "Анна Соколова",
      subject: "eng",
      subjectName: "Английский язык",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1200,
      minFair: 1000,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 34,
      exp: "6 лет · средний балл ЕГЭ 87",
      tag: "Эксперт устной части и эссе",
      bumpedToday: true,
      bumpText: "Обновлена сегодня",
      bio: "Готовлю к ЕГЭ и ОГЭ по английскому с любого уровня до 85+ баллов. На уроках снимаем языковой барьер в устной части, разбираем аудирование и все ловушки грамматики 19–36. После каждого занятия даю понятный разбор ошибок и трекер прогресса до самого экзамена.",
      slots: {
        1: ["16:00", "18:00", "20:00"],
        2: ["10:00", "16:00", "19:00"],
        3: ["18:00", "20:00"],
        4: ["10:00", "14:00", "19:00"],
        5: ["16:00", "18:00"],
        6: ["10:00", "11:00", "14:00", "16:00", "18:00"],
        0: ["10:00", "12:00", "18:00"]
      }
    },
    {
      id: "tut-kim",
      name: "Даниил Ким",
      subject: "eng",
      subjectName: "Английский язык",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 950,
      minFair: 800,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 19,
      exp: "3 года · ЕГЭ на 96 баллов",
      tag: "Интенсив к ОГЭ и базе ЕГЭ",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Простым и живым языком закрываю пробелы во временах, словообразовании и лексике без скучной зубрёжки. Много практики речи и реальных экзаменационных вариантов с первого занятия. Гибко подстраиваю темп и домашние задания под вашу цель.",
      slots: {
        1: ["10:00", "12:00", "19:00"],
        2: ["10:00", "18:00"],
        3: ["10:00", "14:00", "20:00"],
        4: ["16:00", "19:00"],
        5: ["10:00", "12:00", "18:00"],
        6: ["10:00", "12:00", "18:00", "20:00"],
        0: ["11:00", "16:00"]
      }
    },
    {
      id: "tut-morozova",
      name: "Елена Морозова",
      subject: "eng",
      subjectName: "Английский язык",
      exams: ["ЕГЭ"],
      price: 1600,
      minFair: 1300,
      verified: true,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 5.0,
      reviews: 52,
      exp: "11 лет · 90+ у каждого 2-го ученика",
      tag: "Профиль 90+ баллов",
      bumpedToday: false,
      bumpText: "Была в сети вчера",
      bio: "Системная подготовка к ЕГЭ строго по актуальному кодификатору и критериям проверки. Каждую неделю пишем пробные письма и разбираем устную часть с детальным аудиоразбором. Помогаю уверенно выйти на 90+ и поступить в ведущие вузы.",
      slots: {
        1: ["18:00", "20:00"],
        3: ["16:00", "18:00"],
        5: ["14:00", "19:00"],
        6: ["10:00", "11:00", "16:00"],
        0: ["12:00", "14:00"]
      }
    },
    {
      id: "tut-gromova",
      name: "Мария Громова",
      subject: "rus",
      subjectName: "Русский язык",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1100,
      minFair: 900,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.9,
      reviews: 41,
      exp: "7 лет · 18 стобалльников",
      tag: "Сочинение без шаблонов",
      bumpedToday: true,
      bumpText: "Подняла анкету 2 ч назад",
      bio: "Учим орфографию и пунктуацию через понятные алгоритмы вместо бесполезной зубрёжки сотен исключений. Разбираем каждое сочинение построчно по свежим критериям оценки, чтобы забирать максимум баллов даже на сложных текстах.",
      slots: {
        1: ["14:00", "18:00", "20:00"],
        2: ["10:00", "16:00", "19:00"],
        4: ["12:00", "18:00"],
        5: ["16:00", "19:00"],
        6: ["10:00", "12:00", "14:00", "18:00"],
        0: ["10:00", "14:00"]
      }
    },
    {
      id: "tut-nikolaev",
      name: "Илья Николаев",
      subject: "rus",
      subjectName: "Русский язык",
      exams: ["ОГЭ", "ЕГЭ"],
      price: 900,
      minFair: 800,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 23,
      exp: "4 года · ОГЭ и тестовая часть ЕГЭ",
      tag: "Быстрый рост баллов",
      bumpedToday: false,
      bumpText: "Поднял анкету вчера",
      bio: "Тренируем изложение ОГЭ и самые коварные номера тестовой части ЕГЭ с упором на практику. Программа выстроена так, чтобы закрыть базовые ошибки уже за 2–3 месяца и перестать терять лёгкие баллы на невнимательности.",
      slots: {
        2: ["14:00", "18:00"],
        3: ["10:00", "16:00", "19:00"],
        5: ["12:00", "18:00"],
        6: ["11:00", "16:00", "19:00"],
        0: ["12:00", "18:00"]
      }
    },
    {
      id: "tut-petrova",
      name: "Ольга Петрова",
      subject: "bio",
      subjectName: "Биология",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1300,
      minFair: 1050,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.9,
      reviews: 37,
      exp: "8 лет · подготовка в медвузы",
      tag: "Генетика и вторая часть",
      bumpedToday: true,
      bumpText: "Подняла анкету 1 ч назад",
      bio: "Специализируюсь на поступлении в медицинские и биологические вузы. Пошагово осваиваем цитологию, молекулярную биологию, генетику и эвристические вопросы с развёрнутым ответом — вы будете знать логику составителей экзамена.",
      slots: {
        1: ["16:00", "19:00"],
        2: ["12:00", "18:00"],
        3: ["10:00", "16:00", "20:00"],
        4: ["18:00", "20:00"],
        5: ["10:00", "16:00"],
        6: ["10:00", "12:00", "16:00"],
        0: ["11:00", "14:00"]
      }
    },
    {
      id: "tut-efimov",
      name: "Артём Ефимов",
      subject: "bio",
      subjectName: "Биология",
      exams: ["ОГЭ", "ЕГЭ"],
      price: 1000,
      minFair: 850,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.7,
      reviews: 15,
      exp: "3 года · без воды и сложных терминов",
      tag: "Схемы и практикумы",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Объясняю биологию через наглядные схемы, ассоциации и живые примеры вместо сухих учебников. Проходим анатомию, ботанику, зоологию и эксперимент так, чтобы ученик понимал процессы, а не зазубривал определения перед сном.",
      slots: {
        1: ["18:00", "20:00"],
        4: ["10:00", "17:00", "19:00"],
        5: ["14:00", "18:00"],
        6: ["10:00", "14:00", "18:00"],
        0: ["16:00", "20:00"]
      }
    },
    {
      id: "tut-orlova",
      name: "Наталья Орлова",
      subject: "chem",
      subjectName: "Химия",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1400,
      minFair: 1150,
      verified: true,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 5.0,
      reviews: 46,
      exp: "9 лет · средний балл 88",
      tag: "Органика, неорганика и расчёты",
      bumpedToday: true,
      bumpText: "Подняла анкету 3 ч назад",
      bio: "Учу понимать логику химических реакций и механизмов, а не заучивать сотни уравнений наизусть. На каждом занятии отрабатываем окислительно-восстановительные процессы, органические цепочки и сложные расчётные задачи с проверкой оформления.",
      slots: {
        1: ["10:00", "16:00", "19:00"],
        3: ["12:00", "18:00"],
        4: ["16:00", "20:00"],
        5: ["10:00", "16:00", "19:00"],
        6: ["10:00", "14:00", "18:00"],
        0: ["10:00", "16:00"]
      }
    },
    {
      id: "tut-popov",
      name: "Артём Попов",
      subject: "math",
      subjectName: "Математика",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1200,
      minFair: 950,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 29,
      exp: "5 лет · профиль 80+ и ОГЭ на «5»",
      tag: "Первая часть + вторая часть",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Ставлю уверенную первую часть без арифметических промахов, а затем спокойно переходим к уравнениям, неравенствам, экономическим задачам и параметрам. Показываю короткие приёмы самопроверки, чтобы не терять время на экзамене.",
      slots: {
        1: ["14:00", "18:00", "20:00"],
        2: ["10:00", "14:00", "19:00"],
        3: ["16:00", "19:00"],
        4: ["10:00", "18:00"],
        5: ["12:00", "18:00"],
        6: ["10:00", "12:00", "16:00", "19:00"],
        0: ["11:00", "18:00"]
      }
    },
    {
      id: "tut-voronov",
      name: "Сергей Воронов",
      subject: "math",
      subjectName: "Математика",
      exams: ["ОГЭ", "ЕГЭ"],
      price: 900,
      minFair: 800,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 21,
      exp: "3 года · база ЕГЭ и ОГЭ геометрия",
      tag: "От «двойки» до твёрдой 4–5",
      bumpedToday: false,
      bumpedWeek: false,
      bumpText: "Обновил расписание вчера",
      bio: "Терпеливо разбираем дроби, графики, алгебру и геометрию с самого фундамента. Ученики перестают бояться длинных условий и уже через пару недель решают базовый уровень и задания второй части на уверенную четвёрку и пятёрку.",
      slots: {
        2: ["16:00", "20:00"],
        4: ["14:00", "18:00"],
        5: ["16:00", "20:00"],
        6: ["11:00", "14:00", "18:00"],
        0: ["10:00", "16:00"]
      }
    },
    {
      id: "tut-lebedev",
      name: "Роман Лебедев",
      subject: "inf",
      subjectName: "Информатика",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1350,
      minFair: 1100,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.9,
      reviews: 31,
      exp: "5 лет · Python и Excel для КЕГЭ",
      tag: "Программирование на Python с нуля",
      bumpedToday: true,
      bumpText: "Поднял анкету 3 ч назад",
      bio: "Учимся переводить практически весь экзамен по информатике в быстрый и чистый код на Python и формулы в таблицах. На занятиях тренируем реальные компьютерные форматы, чтобы уверенно забирать 85+ баллов даже с нуля.",
      slots: {
        1: ["17:00", "20:00"],
        3: ["18:00", "20:00"],
        5: ["16:00", "19:00"],
        6: ["10:00", "12:00", "18:00", "20:00"],
        0: ["12:00", "16:00", "19:00"]
      }
    },
    {
      id: "tut-belova",
      name: "Светлана Белова",
      subject: "chem",
      subjectName: "Химия",
      exams: ["ОГЭ", "ЕГЭ"],
      price: 1050,
      minFair: 850,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 18,
      exp: "4 года · ОГЭ 38/38 и базовые темы ЕГЭ",
      tag: "Эксперимент и мысленные задачи",
      bumpedToday: false,
      bumpedWeek: false,
      bumpText: "Обновила слоты 2 дня назад",
      bio: "Спокойно и последовательно отрабатываем номенклатуру, качественные реакции, расстановку коэффициентов и задачи на растворы с массовой долей. Беру учеников сразу на регулярную программу подготовки без отдельного пробного созвона.",
      slots: {
        2: ["16:00", "19:00"],
        4: ["10:00", "16:00"],
        6: ["10:00", "12:00", "16:00"],
        0: ["14:00", "18:00"]
      }
    },
    {
      id: "tut-kovalev",
      name: "Денис Ковалёв",
      subject: "design",
      subjectName: "UX/UI и Figma",
      exams: ["Навыки", "Портфолио"],
      price: 1200,
      marketPrice: 1650,
      minFair: 1000,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.9,
      reviews: 27,
      exp: "6 лет · Senior Product & UX/UI Designer",
      tag: "Figma, дизайн-системы и портфолио",
      bumpedToday: true,
      bumpText: "Поднял анкету 2 ч назад",
      bio: "Учу интерфейсному дизайну в Figma, компонентным дизайн-системам и интерактивным прототипам с нуля до первых коммерческих проектов. На разборах улучшаем ваши реальные макеты и собираем сильное портфолио.",
      slots: {
        1: ["14:00", "18:00", "20:00"],
        3: ["11:00", "16:00", "19:00"],
        5: ["12:00", "18:00"],
        6: ["10:00", "12:00", "15:00", "18:00"],
        0: ["11:00", "16:00"]
      }
    },
    {
      id: "tut-zaytsev",
      name: "Егор Зайцев",
      subject: "phys",
      subjectName: "Физика и олимпиады",
      exams: ["ЕГЭ", "ОГЭ", "ВУЗ"],
      price: 1150,
      marketPrice: 1550,
      minFair: 950,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 33,
      exp: "6 лет · МФТИ, готовлю к ЕГЭ 90+ и Физтеху",
      tag: "Механика, электродинамика и часть 2",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Убираем бессмысленную зубрёжку формул: выводим физические законы с нуля и учимся видеть физику процесса. Решаем расчётные задачи повышенной сложности и разбираем вузовский курс общей физики.",
      slots: {
        1: ["16:00", "19:00"],
        2: ["10:00", "18:00"],
        4: ["15:00", "19:00"],
        6: ["10:00", "14:00", "18:00"],
        0: ["11:00", "16:00"]
      }
    },
    {
      id: "tut-melnikova",
      name: "Алина Мельникова",
      subject: "music",
      subjectName: "Вокал, гитара и музыка",
      exams: ["Навыки", "Творческий экзамен"],
      price: 950,
      marketPrice: 1250,
      minFair: 800,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 22,
      exp: "5 лет · современное пение и акустика",
      tag: "Постановка голоса и аккомпанемент",
      bumpedToday: false,
      bumpText: "Обновила слоты сегодня",
      bio: "Помогаю зазвучать уверенно и свободно уже с первого месяца занятий: ставим дыхание, интонирование и раскрепощаем голос. Разбираем любимые песни на гитаре или фортепиано и готовим программу в творческие вузы.",
      slots: {
        2: ["14:00", "19:00"],
        3: ["12:00", "18:00"],
        5: ["15:00", "19:00"],
        6: ["11:00", "15:00", "18:00"],
        0: ["12:00", "16:00"]
      }
    },
    {
      id: "tut-sorokina",
      name: "Виктория Сорокина",
      subject: "hist",
      subjectName: "История и общество",
      exams: ["ЕГЭ", "ОГЭ", "ДВИ"],
      price: 1000,
      marketPrice: 1350,
      minFair: 850,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 28,
      exp: "5 лет · средний балл 86, поступят на бюджет",
      tag: "Карты, культура и аргументация",
      bumpedToday: true,
      bumpText: "Подняла анкету 1 ч назад",
      bio: "Связываем исторические события и даты в живые понятные сюжеты без сухой зубрёжки. Регулярно отрабатываем работу с картами, памятниками культуры, причинно-следственными связями и аргументацией для второй части.",
      slots: {
        1: ["15:00", "19:00"],
        3: ["10:00", "16:00", "20:00"],
        4: ["18:00", "20:00"],
        6: ["10:00", "14:00", "18:00"],
        0: ["10:00", "15:00"]
      }
    },
    {
      id: "tut-prof",
      name: "Дмитрий Волков",
      subject: "phys",
      subjectName: "Физика и олимпиады",
      exams: ["ЕГЭ", "ДВИ", "Навыки"],
      tier: "pro",
      qualBadge: "К.т.н. · эксперт жюри ВсОШ",
      price: 2300,
      marketPrice: 1700,
      minFair: 2100,
      verified: true,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 5.0,
      reviews: 64,
      exp: "14 лет · 31 стобалльник и призёры олимпиад",
      tag: "Выше рынка · углублённая квалификация",
      bumpedToday: true,
      bumpText: "Высокий спрос · топ-рейтинг",
      bio: "Преподаватель ведущего технического вуза и член жюри профильных олимпиад. Готовлю сильных абитуриентов к ДВИ МГУ, олимпиадам Физтех и высоким баллам ЕГЭ 95+ через разбор нестандартных задач.",
      slots: {
        1: ["16:00", "19:00"],
        2: ["18:00", "20:00"],
        3: ["16:00", "18:00"],
        5: ["17:00", "19:00"],
        6: ["11:00", "14:00", "17:00"],
        0: ["12:00", "15:00"]
      }
    },
    {
      id: "tut-afanasyeva",
      name: "Марина Афанасьева",
      subject: "math",
      subjectName: "Математика",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1050,
      marketPrice: 1400,
      minFair: 850,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 31,
      exp: "6 лет · профиль 82+ без зубрёжки",
      tag: "Геометрия, параметры и часть 1",
      bumpedToday: true,
      bumpText: "Обновила анкету сегодня",
      bio: "Объясняю планиметрию, стереометрию и экономические задачи на простых чертежах. Учимся видеть короткие пути решения и не терять баллы на вычислительных ошибках.",
      slots: {
        1: ["16:00", "19:00"],
        3: ["14:00", "18:00"],
        5: ["15:00", "19:00"],
        6: ["10:00", "14:00"]
      }
    },
    {
      id: "tut-borisov",
      name: "Кирилл Борисов",
      subject: "inf",
      subjectName: "Информатика и Python",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1250,
      marketPrice: 1650,
      minFair: 1000,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.8,
      reviews: 24,
      exp: "5 лет · Python, Excel и №24–27",
      tag: "Задания КЕГЭ на Python",
      bumpedToday: false,
      bumpedWeek: false,
      bumpText: "Обновил расписание вчера",
      bio: "Тренируем решение задач №1–27 в Python и электронных таблицах. Готовим чистые шаблоны перебора, динамического программирования и теории игр без заучивания.",
      slots: {
        2: ["18:00", "20:00"],
        4: ["16:00", "20:00"],
        6: ["12:00", "16:00"],
        0: ["12:00", "18:00"]
      }
    },
    {
      id: "tut-egorova",
      name: "Туяра Егорова",
      subject: "eng",
      subjectName: "Английский язык",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 950,
      marketPrice: 1300,
      minFair: 800,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 26,
      exp: "5 лет · говорение и эссе на 85+",
      tag: "Живая речь и критерии ФИПИ",
      bumpedToday: true,
      bumpText: "В сети сегодня",
      bio: "Помогаю перестать бояться устной части и выстроить чёткую структуру письма и эссе по актуальным критериям. Тренируем аудирование и лексику без сухих учебников.",
      slots: {
        1: ["14:00", "18:00"],
        2: ["16:00", "19:00"],
        4: ["14:00", "18:00"],
        6: ["10:00", "14:00"]
      }
    },
    {
      id: "tut-stepanov",
      name: "Максим Степанов",
      subject: "hist",
      subjectName: "История и общество",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1150,
      marketPrice: 1500,
      minFair: 950,
      verified: false,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.8,
      reviews: 19,
      exp: "4 года · исторические карты и эссе",
      tag: "Причины, следствия и часть 2",
      bumpedToday: false,
      bumpText: "Обновил слоты 2 дня назад",
      bio: "Выстраиваем хронологию от Рюрика до XXI века как связный рассказ. Отрабатываем задания на аргументацию, всемирную историю и атрибуцию исторических карт.",
      slots: {
        1: ["18:00", "20:00"],
        3: ["16:00", "20:00"],
        5: ["18:00", "20:00"],
        0: ["11:00", "15:00"]
      }
    },
    {
      id: "tut-tarasova",
      name: "Дарья Тарасова",
      subject: "rus",
      subjectName: "Русский язык",
      exams: ["ОГЭ", "ЕГЭ"],
      price: 850,
      marketPrice: 1150,
      minFair: 750,
      verified: true,
      firstLessonGuarantee: false,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 22,
      exp: "4 года · ОГЭ 33/33 и тест ЕГЭ",
      tag: "Орфография и сочинение-рассуждение",
      bumpedToday: true,
      bumpText: "Обновила анкету 3 ч назад",
      bio: "Разбираем пунктуацию, орфографию и структуру итогового сочинения и экзаменационного развёрнутого ответа. Закрываем типичные ловушки формулировок за 2–3 месяца.",
      slots: {
        2: ["14:00", "18:00"],
        4: ["10:00", "16:00"],
        5: ["14:00", "18:00"],
        6: ["10:00", "14:00"]
      }
    },
    {
      id: "tut-kuznetsov",
      name: "Алексей Кузнецов",
      subject: "bio",
      subjectName: "Биология",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1200,
      marketPrice: 1550,
      minFair: 950,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.8,
      reviews: 25,
      exp: "6 лет · анатомия, экология и генетика",
      tag: "Эвристика и задачи №27–28",
      bumpedToday: false,
      bumpText: "В сети вчера",
      bio: "Готовлю к биологии через понимание физиологии, эволюции и биохимических циклов. Решаем задания повышенного уровня и тренируем точное попадание в ключи ФИПИ.",
      slots: {
        1: ["17:00", "20:00"],
        3: ["18:00", "20:00"],
        6: ["11:00", "15:00"],
        0: ["12:00", "16:00"]
      }
    },
    {
      id: "tut-fomina",
      name: "Вера Фомина",
      subject: "design",
      subjectName: "UX/UI и Figma",
      exams: ["Навыки", "Портфолио"],
      price: 1100,
      marketPrice: 1450,
      minFair: 900,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 17,
      exp: "5 лет · Product Designer, дизайн-системы",
      tag: "Auto Layout, компоненты и кейсы",
      bumpedToday: true,
      bumpText: "Обновила слоты сегодня",
      bio: "Разбираем прототипирование, адаптивные сетки, дизайн-токены в Figma и сборку первых кейсов для откликов на стажировки и коммерческие заказы.",
      slots: {
        2: ["12:00", "18:00"],
        4: ["15:00", "19:00"],
        6: ["11:00", "16:00"],
        0: ["13:00", "17:00"]
      }
    },
    {
      id: "tut-ivanova",
      name: "Анна Иванова",
      subject: "soc",
      subjectName: "Обществознание",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1000,
      marketPrice: 1350,
      minFair: 850,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 28,
      exp: "6 лет · право, экономика и план №24",
      tag: "Эссе, планы и 2-я часть ФИПИ",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "Обновила анкету 2 дня назад",
      bio: "Разбираем конституционное право, экономические графики и сложные планы задания №24 без воды и заучивания.",
      slots: { 1: ["15:00", "19:00"], 3: ["16:00", "19:00"], 6: ["11:00", "15:00"] }
    },
    {
      id: "tut-savin",
      name: "Павел Савин",
      subject: "lit",
      subjectName: "Литература",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 1100,
      marketPrice: 1450,
      minFair: 900,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.8,
      reviews: 19,
      exp: "5 лет · сопоставления и сочинения на максимум",
      tag: "Анализ лирики и аргументация",
      bumpedToday: false,
      bumpedWeek: true,
      bumpText: "Поднял анкету 4 дня назад",
      bio: "Учимся точно попадать в критерии К1–К3 и выстраивать сильные сопоставления в мини-сочинениях и задании №11.",
      slots: { 2: ["16:00", "19:00"], 4: ["17:00", "20:00"], 0: ["12:00", "16:00"] }
    },
    {
      id: "tut-ammosov",
      name: "Ньургун Аммосов",
      subject: "geo",
      subjectName: "География",
      exams: ["ЕГЭ", "ОГЭ"],
      price: 900,
      marketPrice: 1200,
      minFair: 750,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 16,
      exp: "5 лет · топография, климат и 2-я часть",
      tag: "Карты, расчётные задачи и часовые пояса",
      bumpedToday: false,
      bumpedWeek: false,
      bumpText: "Обновил анкету 10 дней назад",
      bio: "Простым языком отрабатываем профили рельефа, демографические расчёты и задания на объяснение природных процессов.",
      slots: { 1: ["14:00", "18:00"], 5: ["15:00", "19:00"], 6: ["10:00", "14:00"] }
    },
    {
      id: "tut-makarov",
      name: "Егор Макаров",
      subject: "prog",
      subjectName: "Программирование и Python",
      exams: ["Навыки", "Портфолио"],
      price: 1400,
      marketPrice: 1850,
      minFair: 1150,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 5.0,
      reviews: 34,
      exp: "7 лет · Backend, алгоритмы и олимпиадный Python",
      tag: "Python, FastAPI, Git и собеседования",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "В сети 3 дня назад",
      bio: "Ставим прочную базу алгоритмов, структур данных и коммерческой разработки на Python от первых скриптов до pet-проектов.",
      slots: { 2: ["18:00", "20:00"], 4: ["18:00", "20:00"], 6: ["12:00", "16:00"] }
    },
    {
      id: "tut-sleptsov",
      name: "Айсен Слепцов",
      subject: "judo",
      subjectName: "Дзюдо и ОФП",
      exams: ["Навыки", "Спорт"],
      price: 950,
      marketPrice: 1300,
      minFair: 800,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Очно", "Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 21,
      exp: "8 лет · КМС по дзюдо, детский и взрослый ОФП",
      tag: "Техника бросков, страховка и координация",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "Обновил расписание на этой неделе",
      bio: "Персональные тренировки по дзюдо, безопасной страховке при падении, гибкости и общей физической подготовке для любого возраста.",
      slots: { 1: ["17:00", "19:00"], 3: ["17:00", "19:00"], 5: ["17:00", "19:00"] }
    },
    {
      id: "tut-romanov",
      name: "Виктор Романов",
      subject: "chess",
      subjectName: "Шахматы и логика",
      exams: ["Навыки"],
      price: 850,
      marketPrice: 1150,
      minFair: 700,
      verified: false,
      firstLessonGuarantee: false,
      formats: ["Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 14,
      exp: "6 лет · 1-й разряд, тактика и эндшпиль",
      tag: "Дебюты, счёт вариантов и турниры",
      bumpedToday: false,
      bumpedWeek: false,
      bumpText: "В сети 2 недели назад",
      bio: "Учимся видеть тактические удары, планировать миттельшпиль и спокойно доводить перевес до победы без зевков.",
      slots: { 2: ["15:00", "19:00"], 6: ["11:00", "15:00"], 0: ["13:00", "17:00"] }
    },
    {
      id: "tut-tarasov-box",
      name: "Тимур Тарасов",
      subject: "boxing",
      subjectName: "Бокс, самбо и единоборства",
      exams: ["Навыки", "Спорт"],
      price: 1000,
      marketPrice: 1350,
      minFair: 850,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Очно", "Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 19,
      exp: "9 лет · МС по боевому самбо и боксу",
      tag: "Техника ударов, самооборона и постановка дыхания",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "Обновил окна вчера",
      bio: "Индивидуальные тренировки по боксу и самбо с нуля или к соревнованиям: стойка, передвижения, защита и ОФП.",
      slots: { 1: ["18:00", "20:00"], 3: ["18:00", "20:00"], 5: ["18:00", "20:00"] }
    },
    {
      id: "tut-kovaleva-swim",
      name: "Мария Ковалёва",
      subject: "swim",
      subjectName: "Плавание и техника кроля",
      exams: ["Навыки", "Спорт"],
      price: 1100,
      marketPrice: 1500,
      minFair: 900,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Очно"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.9,
      reviews: 27,
      exp: "7 лет · КМС по плаванию, дети и взрослые",
      tag: "Кроль, брасс, снятие страха воды и ГТО",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "Есть окна на этой неделе",
      bio: "Учимся плавать красиво и без одышки: ставим дыхание, скольжение и все 4 спортивных стиля в удобном бассейне.",
      slots: { 2: ["10:00", "19:00"], 4: ["10:00", "19:00"], 6: ["11:00", "15:00"] }
    },
    {
      id: "tut-li-chinese",
      name: "Анна Ли",
      subject: "chinese",
      subjectName: "Китайский язык и HSK",
      exams: ["Навыки", "ВУЗ"],
      price: 1050,
      marketPrice: 1400,
      minFair: 850,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 5.0,
      reviews: 31,
      exp: "6 лет · стажировка в Пекине, HSK 1–5",
      tag: "Тоны с нуля, иероглифы и живой китайский",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "В сети сегодня",
      bio: "Ставим чистое произношение и 4 тона с первого урока, разбираем логику ключей и уверенно готовимся к HSK и переезду.",
      slots: { 1: ["14:00", "18:00"], 3: ["14:00", "18:00"], 6: ["12:00", "16:00"] }
    },
    {
      id: "tut-safonova-speech",
      name: "Наталья Сафонова",
      subject: "speech",
      subjectName: "Логопед и постановка речи",
      exams: ["Навыки"],
      price: 950,
      marketPrice: 1300,
      minFair: 800,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.9,
      reviews: 23,
      exp: "10 лет · логопед-дефектолог высшей категории",
      tag: "Звуки Р/Л/шипящие, запуск речи и чтение",
      bumpedToday: false,
      bumpedWeek: true,
      bumpText: "Обновила анкету 2 дня назад",
      bio: "Игровые логопедические занятия для детей и коррекция дикции для взрослых: артикуляционная гимнастика и чёткая речь.",
      slots: { 1: ["11:00", "15:00"], 2: ["11:00", "15:00"], 4: ["11:00", "15:00"] }
    },
    {
      id: "tut-nefedova-art",
      name: "Олеся Нефёдова",
      subject: "art",
      subjectName: "Рисование и скетчинг",
      exams: ["Навыки", "Портфолио"],
      price: 900,
      marketPrice: 1250,
      minFair: 750,
      verified: true,
      firstLessonGuarantee: false,
      formats: ["Онлайн", "Очно"],
      city: "Якутск",
      timezone: "UTC+9",
      rating: 4.8,
      reviews: 18,
      exp: "5 лет · СХУ, иллюстрация и композиция",
      tag: "Академический рисунок, акварель и Procreate",
      bumpedToday: true,
      bumpedWeek: true,
      bumpText: "Окна на выходные",
      bio: "Осваиваем перспективу, светотень и цвет с нуля, собираем творческое портфолио для поступления или рисования для души.",
      slots: { 3: ["16:00", "19:00"], 6: ["12:00", "16:00"], 0: ["12:00", "16:00"] }
    },
    {
      id: "tut-zaitsev-piano",
      name: "Павел Зайцев",
      subject: "piano",
      subjectName: "Фортепиано и сольфеджио",
      exams: ["Навыки"],
      price: 1000,
      marketPrice: 1350,
      minFair: 800,
      verified: true,
      firstLessonGuarantee: true,
      formats: ["Онлайн", "Очно"],
      city: "Москва",
      timezone: "UTC+3",
      rating: 4.9,
      reviews: 20,
      exp: "8 лет · выпускник РАМ им. Гнесиных",
      tag: "Чтение с листа, аккомпанемент и слух",
      bumpedToday: false,
      bumpedWeek: true,
      bumpText: "Свободно вечером в будни",
      bio: "Учим любимые мелодии с первых занятий, без скучной зубрёжки — постановка рук, гармония и разбор по аккордам и нотам.",
      slots: { 2: ["17:00", "20:00"], 4: ["17:00", "20:00"], 5: ["16:00", "19:00"] }
    }
  ];

  var WA_PHONES = {
    "tut-sokolova": "79142100101",
    "tut-kim": "79142100102",
    "tut-morozova": "79142100103",
    "tut-gromova": "79142100104",
    "tut-nikolaev": "79142100105",
    "tut-petrova": "79142100106",
    "tut-efimov": "79142100107",
    "tut-orlova": "79142100108",
    "tut-popov": "79142100109",
    "tut-voronov": "79142100110",
    "tut-lebedev": "79142100111",
    "tut-belova": "79142100112"
  };
  function timeToMinutes(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return -1;
    var hh = Number(m[1]), mm = Number(m[2]);
    if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return -1;
    return hh * 60 + mm;
  }

  function normalizeTutor(t, idx) {
    t.whatsapp = t.whatsapp || (t.fromServer ? "" : (WA_PHONES[t.id] || ("791421001" + String(10 + (idx || 0)))));
    t.verified = t.fromServer ? !!t.verified : (t.verified !== false);
    t.bumpedWeek = t.bumpedWeek != null ? !!t.bumpedWeek : true;
    t.firstLessonGuarantee = t.firstLessonGuarantee != null
      ? !!t.firstLessonGuarantee
      : (t.trialMode === "free" || t.trialFree === true);
    t.trialFree = t.firstLessonGuarantee;
    t.trialMode = t.firstLessonGuarantee ? "free" : "none";
    t.trialPrice = t.firstLessonGuarantee ? 0 : null;
    t.subjects = Array.isArray(t.subjects) && t.subjects.length ? t.subjects.slice() : [t.subject || "bio"];
    t.subject = t.subjects[0] || t.subject || "bio";
    t.photo = t.photo ? String(t.photo).trim() : "";
    t.city = CITIES.find(function (c) { return String(t.city || "").indexOf(c) >= 0; }) || "Якутск";
    t.timezone = TIMEZONES.some(function (tz) { return tz.id === t.timezone; })
      ? t.timezone
      : (t.city === "Москва" ? "UTC+3" : "UTC+9");
    t.tzLabel = (TIMEZONES.find(function (tz) { return tz.id === t.timezone; }) || TIMEZONES[0]).label;
    t.customBadges = Array.isArray(t.customBadges)
      ? t.customBadges.map(function (b) { return String(b || "").trim().slice(0, 36); }).filter(Boolean).slice(0, 2)
      : [];
    t.source = t.source || SOURCE_CHANNELS[(idx || 0) % SOURCE_CHANNELS.length];
    t.isParsed = t.isParsed != null ? !!t.isParsed : !t.fromCabinet;
    t.availableChannels = (t.availableChannels && typeof t.availableChannels === "object")
      ? {
          wa: !!t.availableChannels.wa,
          tg: !!t.availableChannels.tg,
          max: !!t.availableChannels.max
        }
      : {
          wa: Boolean(t.whatsapp),
          tg: Boolean(t.telegram && String(t.telegram).trim()),
          max: Boolean(t.maxHandle && String(t.maxHandle).trim())
        };
    t.marketPrice = t.marketPrice || Math.round((t.price * 1.28) / 50) * 50;
    t.belowRub = Math.max(0, t.marketPrice - t.price);
    t.aboveRub = Math.max(0, t.price - t.marketPrice);
    t.belowPct = t.belowRub > 0 ? Math.max(10, Math.round((t.belowRub / t.marketPrice) * 100)) : 0;
    t.abovePct = t.aboveRub > 0 ? Math.max(5, Math.round((t.aboveRub / t.marketPrice) * 100)) : 0;
    t.responseMin = t.bumpedToday ? 10 : 25;
    t.tier = t.tier || (t.aboveRub > 0 ? "pro" : "budget");
    if (!t.availableFrom || !t.availableTo) {
      var allH = [];
      Object.keys(t.slots || {}).forEach(function (k) {
        (t.slots[k] || []).forEach(function (h) { allH.push(h); });
      });
      allH.sort(function (a, b) { return timeToMinutes(a) - timeToMinutes(b); });
      t.availableFrom = t.availableFrom || allH[0] || "10:00";
      t.availableTo = t.availableTo || allH[allH.length - 1] || "20:00";
    }
    t.windowLabel = "с " + t.availableFrom + " до " + t.availableTo;
    return t;
  }

  function upsertCustomTutor(raw) {
    if (!raw || !raw.id) return null;
    var subjList = Array.isArray(raw.subjects) && raw.subjects.length ? raw.subjects.slice() : [raw.subject || "bio"];
    var subjNames = subjList.map(function (id, sIdx) {
      var found = SUBJECTS.find(function (s) { return s.id === id; });
      if (!found && sIdx === 0 && (raw.subjectName || raw.subjectShort || raw.subject)) {
        var reg = registerDirection({
          id: id,
          name: raw.subjectName || raw.subjectShort || id,
          short: raw.subjectShort || raw.subjectName || id,
          source: raw.isParsed ? "orchestrator" : "user",
          tutorCount: 1
        });
        if (reg && reg.direction) {
          subjList[0] = reg.direction.id;
          found = reg.direction;
        }
      }
      return found ? found.name : "";
    }).filter(Boolean);
    var clean = Object.assign({
      subject: subjList[0],
      subjects: subjList,
      subjectName: subjNames.length ? subjNames.join(" · ") : "Подготовка",
      exams: ["ЕГЭ"],
      formats: ["Онлайн"],
      city: "Якутск",
      timezone: "UTC+9",
      photo: "",
      rating: 4.9,
      reviews: 12,
      exp: "5 лет · преподаватель",
      tag: "Ваша анкета · Профи",
      verified: true,
      bumpedToday: true,
      bumpText: "Опубликовано из кабинета",
      slots: { 1: ["14:00", "16:00"], 6: ["10:00", "12:00"] }
    }, raw);
    clean.availableFrom = "";
    clean.availableTo = "";
    clean.marketPrice = Number(raw.marketPrice) || Math.round((Number(clean.price || 1200) * 1.28) / 50) * 50;
    normalizeTutor(clean, LIST.length);
    var idx = LIST.findIndex(function (x) { return x.id === clean.id; });
    if (idx >= 0) LIST[idx] = clean;
    else LIST.unshift(clean);
    CATALOG_TOTAL = _demoMode ? Math.max(DEMO_CATALOG_TOTAL, LIST.length) : LIST.length;
    if (EGE.tutors) EGE.tutors.CATALOG_TOTAL = CATALOG_TOTAL;
    return clean;
  }

  function removeCustomTutor(tutorId) {
    var tid = String(tutorId || "").trim();
    if (!tid) return false;
    var removed = false;
    for (var i = LIST.length - 1; i >= 0; i--) {
      if (LIST[i] && LIST[i].id === tid) {
        LIST.splice(i, 1);
        removed = true;
      }
    }
    if (removed) {
      CATALOG_TOTAL = _demoMode ? Math.max(DEMO_CATALOG_TOTAL, LIST.length) : LIST.length;
      if (EGE.tutors) EGE.tutors.CATALOG_TOTAL = CATALOG_TOTAL;
    }
    return removed;
  }

  LIST.forEach(function (t, idx) {
    normalizeTutor(t, idx);
  });

  var DEMO_LIST = LIST.slice();
  var DEMO_CATALOG_TOTAL = CATALOG_TOTAL;
  var _demoMode = !(typeof window !== "undefined" && window.EGE_HOST && window.EGE_HOST.demoMode === false);
  var _serverTutorsLoaded = false;
  var _serverTutorsLoading = !_demoMode;
  var _serverLeads = null;

  if (!_demoMode) {
    LIST.splice(0, LIST.length);
    CATALOG_TOTAL = 0;
  }

  var SOURCE_CHANNEL_MAP = {
    platform: "Вектор",
    doska_ykt: "Доска Ykt",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    max: "MAX",
    landing: "Заявка с сайта"
  };

  function resolveServerSubjectIds(raw) {
    var out = [];
    function pushMatch(val) {
      var txt = String(val || "").trim();
      if (!txt) return;
      var low = txt.toLowerCase();
      var exact = SUBJECTS.find(function (s) {
        return String(s.id || "").toLowerCase() === low ||
          String(s.name || "").toLowerCase() === low ||
          String(s.short || "").toLowerCase() === low;
      });
      if (exact) {
        if (out.indexOf(exact.id) < 0) out.push(exact.id);
        return;
      }
      if (typeof findDirectionMatch === "function") {
        var hit = findDirectionMatch(txt);
        if (hit && hit.id) {
          if (out.indexOf(hit.id) < 0) out.push(hit.id);
          return;
        }
      }
      var reg = registerDirection({
        name: txt,
        short: txt.slice(0, 28),
        source: "platform",
        tutorCount: 1
      });
      if (reg && reg.direction && reg.direction.id && out.indexOf(reg.direction.id) < 0) {
        out.push(reg.direction.id);
      }
    }
    if (Array.isArray(raw && raw.subjects)) {
      raw.subjects.forEach(pushMatch);
    }
    if (!out.length && raw && raw.subject) {
      pushMatch(raw.subject);
    }
    if (!out.length) out.push("bio");
    return out;
  }

  function serverTutorToCard(raw) {
    raw = raw || {};
    var subjIds = resolveServerSubjectIds(raw);
    var subjNames = subjIds.map(function (id) {
      var found = SUBJECTS.find(function (s) { return s.id === id; });
      return found ? found.name : "";
    }).filter(Boolean);
    var price = Math.max(100, Number(raw.price != null ? raw.price : raw.baseRateRub) || 1200);
    var marketPrice = Math.max(
      price,
      Number(raw.marketPrice != null ? raw.marketPrice : raw.marketRateRub) || Math.round((price * 1.28) / 50) * 50
    );
    var minFair = Number(raw.minFair) > 0
      ? Math.max(400, Number(raw.minFair))
      : Math.max(400, Math.round((price * 0.85) / 50) * 50);
    var rawSlots = raw.slots && typeof raw.slots === "object" ? raw.slots : null;
    var cleanSlots = {};
    if (rawSlots) {
      Object.keys(rawSlots).forEach(function (k) {
        var d = parseInt(k, 10);
        if (!Number.isFinite(d) || d < 0 || d > 6) return;
        if (Array.isArray(rawSlots[k]) && rawSlots[k].length) {
          var hrs = rawSlots[k].map(function (h) { return String(h || "").trim(); }).filter(Boolean);
          if (hrs.length) cleanSlots[d] = hrs;
        }
      });
    }
    if (!Object.keys(cleanSlots).length) {
      cleanSlots = { 1: ["16:00", "18:00"], 3: ["16:00", "18:00"], 6: ["10:00", "14:00"] };
    }
    var srcKey = String(raw.sourceChannel || "platform").trim().toLowerCase();
    var expYears = Math.max(1, Number(raw.expYears) || 3);
    var revCnt = Math.max(0, Number(raw.reviewsCount != null ? raw.reviewsCount : raw.reviews) || 0);
    var customSkillsText = String(raw.customSkills || "").trim();
    return {
      id: String(raw.id),
      userId: raw.userId != null ? raw.userId : null,
      name: String(raw.name || raw.fullName || "Преподаватель Вектор"),
      photo: String(raw.photoUrl || raw.photo || "").trim(),
      subject: subjIds[0] || "bio",
      subjects: subjIds,
      subjectName: subjNames.length ? subjNames.join(" · ") : String(raw.subject || "Подготовка"),
      customSkillsText: customSkillsText,
      exams: Array.isArray(raw.exams) && raw.exams.length ? raw.exams.slice() : ["ЕГЭ"],
      formats: Array.isArray(raw.formats) && raw.formats.length ? raw.formats.slice() : ["Онлайн"],
      city: String(raw.city || "Якутск"),
      timezone: String(raw.timezone || "UTC+9"),
      price: price,
      marketPrice: marketPrice,
      minFair: minFair,
      firstLessonGuarantee: raw.firstLessonGuarantee !== false,
      rating: Math.max(1, Math.min(5, Number(raw.rating) || 4.9)),
      reviews: revCnt,
      exp: "Стаж " + expYears + " " + (expYears === 1 ? "год" : (expYears < 5 ? "года" : "лет")),
      tag: String(raw.headline || customSkillsText || "Подготовка ЕГЭ и ОГЭ").trim(),
      source: SOURCE_CHANNEL_MAP[srcKey] || "Вектор",
      fromServer: true,
      fromCabinet: srcKey === "platform",
      whatsapp: String(raw.whatsappPhone || raw.whatsapp || "").trim(),
      telegram: String(raw.telegramHandle || raw.telegram || "").trim(),
      maxHandle: String(raw.maxHandle || "").trim(),
      verified: !!raw.verified,
      published: raw.published !== false,
      lastBumpedAt: String(raw.lastBumpedAt || ""),
      customBadges: Array.isArray(raw.customBadges) ? raw.customBadges.slice(0, 2) : [],
      bumpedToday: !!raw.bumpedToday,
      bumpedWeek: true,
      bumpText: raw.bumpedToday ? "Поднята сегодня" : "Активная анкета",
      bio: String(raw.bio || raw.education || "Индивидуальная программа и проверка пробников.").trim(),
      slots: cleanSlots
    };
  }

  function setDemoMode(enabled) {
    var next = !!enabled;
    var prev = _demoMode;
    _demoMode = next;
    if (EGE.tutors) EGE.tutors.DEMO_MODE = next;
    if (!next) {
      for (var i = LIST.length - 1; i >= 0; i--) {
        if (!LIST[i] || !LIST[i].fromServer) LIST.splice(i, 1);
      }
      CATALOG_TOTAL = LIST.length;
      _serverTutorsLoading = !_serverTutorsLoaded;
      if (EGE.tutors) {
        EGE.tutors.CATALOG_TOTAL = CATALOG_TOTAL;
        EGE.tutors.serverLoading = _serverTutorsLoading;
        EGE.tutors.serverLoaded = _serverTutorsLoaded;
      }
    } else if (next && !prev && !_serverTutorsLoaded && !LIST.length) {
      DEMO_LIST.forEach(function (item) { LIST.push(item); });
      CATALOG_TOTAL = DEMO_CATALOG_TOTAL;
      if (EGE.tutors) EGE.tutors.CATALOG_TOTAL = CATALOG_TOTAL;
    }
    return _demoMode;
  }

  function syncServerTutors(rawList, opts) {
    opts = opts || {};
    var replace = opts.replace != null ? !!opts.replace : !_demoMode;
    var incoming = Array.isArray(rawList) ? rawList.filter(function (x) { return x && x.id; }) : [];
    var mapped = incoming.map(function (item, idx) {
      return normalizeTutor(serverTutorToCard(item), idx);
    });
    if (replace) {
      LIST.splice(0, LIST.length);
      mapped.forEach(function (card) { LIST.push(card); });
      CATALOG_TOTAL = LIST.length;
    } else {
      for (var i = mapped.length - 1; i >= 0; i--) {
        var card = mapped[i];
        var existIdx = LIST.findIndex(function (x) { return x && x.id === card.id; });
        if (existIdx >= 0) LIST[existIdx] = card;
        else LIST.unshift(card);
      }
      CATALOG_TOTAL = Math.max(DEMO_CATALOG_TOTAL, LIST.length);
    }
    _serverTutorsLoaded = true;
    _serverTutorsLoading = false;
    if (EGE.tutors) {
      EGE.tutors.CATALOG_TOTAL = CATALOG_TOTAL;
      EGE.tutors.serverLoaded = true;
      EGE.tutors.serverLoading = false;
    }
    if (typeof applyAllLocalReviews === "function") applyAllLocalReviews();
    return LIST.length;
  }

  function toISODate(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function buildCalendarDays(count, startDate) {
    var base = startDate ? new Date(startDate) : new Date();
    base.setHours(12, 0, 0, 0);
    var out = [];
    for (var i = 0; i < (count || 7); i++) {
      var d = new Date(base.getTime() + i * 86400000);
      var dow = d.getDay();
      out.push({
        iso: toISODate(d),
        dow: dow,
        wd: WEEKDAYS_SHORT[dow],
        wdLong: WEEKDAYS_LONG[dow],
        num: d.getDate(),
        month: MONTHS_GEN[d.getMonth()],
        isWeekend: dow === 0 || dow === 6,
        shortLabel: WEEKDAYS_SHORT[dow] + ", " + d.getDate() + " " + MONTHS_GEN[d.getMonth()],
        fullLabel: WEEKDAYS_LONG[dow] + ", " + d.getDate() + " " + MONTHS_GEN[d.getMonth()]
      });
    }
    return out;
  }

  function tutorSlotsForDay(tutor, dow) {
    if (!tutor || !tutor.slots) return [];
    if (dow === null || dow === undefined || dow === "all") {
      var seen = {}, all = [];
      Object.keys(tutor.slots).forEach(function (k) {
        tutor.slots[k].forEach(function (h) {
          if (!seen[h]) { seen[h] = 1; all.push(h); }
        });
      });
      return all.sort();
    }
    return (tutor.slots[dow] || []).slice();
  }

  function tutorMatchesBase(tutor, filters) {
    if (filters.exam && filters.exam !== "all" && tutor.exams.indexOf(filters.exam) < 0) return false;
    if (filters.subject && filters.subject !== "all") {
      var matchesSubj = tutor.subject === filters.subject || (Array.isArray(tutor.subjects) && tutor.subjects.indexOf(filters.subject) >= 0);
      if (!matchesSubj) {
        var dirMeta = SUBJECTS.find(function (s) { return s.id === filters.subject; });
        if (dirMeta && (dirMeta.autoAdded || (Array.isArray(dirMeta.keywords) && dirMeta.keywords.length))) {
          var subHay = [tutor.subjectName, tutor.tag, tutor.bio, tutor.customSkillsText || ""].join(" ").toLowerCase();
          var terms = [dirMeta.short, dirMeta.name].concat(Array.isArray(dirMeta.keywords) ? dirMeta.keywords : [])
            .map(function (t) { return String(t || "").trim().toLowerCase(); })
            .filter(function (t) { return t.length >= 3; });
          matchesSubj = terms.some(function (t) { return subHay.indexOf(t) >= 0; });
        }
      }
      if (!matchesSubj) return false;
    }
    if (filters.format && filters.format !== "all" && tutor.formats.indexOf(filters.format) < 0) return false;
    if (filters.city && filters.city !== "all" && String(tutor.city || "").indexOf(filters.city) < 0) return false;
    var minP = Number(filters.minPrice) || 0;
    var maxP = Number(filters.maxPrice) || 0;
    if (minP > 0 && tutor.price < minP) return false;
    if (maxP > 0 && tutor.price > maxP) return false;
    if (filters.onlyBumped && !(tutor.bumpedWeek || tutor.bumpedToday)) return false;
    if (filters.q) {
      var q = String(filters.q).trim().toLowerCase();
      if (q) {
        var hay = [tutor.name, tutor.subjectName, tutor.tag, tutor.bio, tutor.city, tutor.tzLabel || "", tutor.customSkillsText || "", (tutor.exams || []).join(" "), (tutor.customBadges || []).join(" ")].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
    }
    return true;
  }

  function tutorInWindow(tutor, hhmm) {
    if (!hhmm || hhmm === "all") return true;
    var mins = timeToMinutes(hhmm);
    var from = timeToMinutes(tutor && tutor.availableFrom);
    var to = timeToMinutes(tutor && tutor.availableTo);
    if (mins < 0 || from < 0 || to < 0) return false;
    return mins >= from && mins <= to;
  }

  function tutorMatchesTime(tutor, dow, hour) {
    var daySlots = tutorSlotsForDay(tutor, dow);
    if (!daySlots.length) return false;
    if (!hour || hour === "all") return true;
    return daySlots.indexOf(hour) >= 0 || tutorInWindow(tutor, hour);
  }

  function filterTutors(filters, days) {
    filters = filters || {};
    var dayObj = filters.day && filters.day !== "all"
      ? (days || []).find(function (d) { return d.iso === filters.day; })
      : null;
    var dow = dayObj ? dayObj.dow : "all";
    var hour = filters.hour || "all";
    var out = LIST.filter(function (t) {
      return tutorMatchesBase(t, filters) && tutorMatchesTime(t, dow, hour);
    });
    var sort = filters.sort || "actual";
    out.sort(function (a, b) {
      if (sort === "price_asc") return a.price - b.price || b.rating - a.rating;
      if (sort === "rating_desc") return b.rating - a.rating || b.reviews - a.reviews;
      if (a.bumpedToday !== b.bumpedToday) return a.bumpedToday ? -1 : 1;
      return b.rating - a.rating || a.price - b.price;
    });
    return out;
  }

  function countForDay(filters, dow) {
    return LIST.filter(function (t) {
      return tutorMatchesBase(t, filters) && tutorMatchesTime(t, dow, filters.hour || "all");
    }).length;
  }

  function countForHour(filters, dow, hour) {
    return LIST.filter(function (t) {
      return tutorMatchesBase(t, filters) && tutorMatchesTime(t, dow, hour);
    }).length;
  }

  function offerSignal(tutorPrice, offerPrice) {
    var offer = Math.max(0, Number(offerPrice) || 0);
    if (offer === 0) {
      return { tone: "notif", label: "Ставка 0 ₽ — договорная заявка на усмотрение преподавателя" };
    }
    var ratio = offer / Math.max(1, tutorPrice);
    var diff = Math.round(tutorPrice - offer);
    if (offer > tutorPrice) {
      var extra = Math.round(offer - tutorPrice);
      return { tone: "pro", label: "Выше анкеты на +" + extra + " ₽ — приоритетная запись и разбор у эксперта" };
    }
    if (ratio >= 1) return { tone: "confirm", label: "Ставка анкеты — преподаватель почти сразу подтвердит время" };
    if (ratio >= 0.85) return { tone: "good", label: "Ниже анкеты на " + diff + " ₽ (−" + Math.round((1 - ratio) * 100) + "%) — высокий шанс отклика за 10–15 мин" };
    if (ratio >= 0.72) return { tone: "notif", label: "Смелая ставка (−" + diff + " ₽) — отправим запрос и уведомим об ответе" };
    return { tone: "bad", label: "Сильно ниже ставки — преподаватель может предложить свою цену" };
  }

  function botPreviewText(params) {
    var exam = params.exam || "ЕГЭ";
    var subj = params.subjectName || "предмету";
    var fmt = (params.format || "онлайн").toLowerCase();
    var dayText = params.dayLabel || "ближайший свободный день";
    var hour = params.hour || "10:00";
    var total = Math.max(0, Math.round(Number(params.offerPrice) || 0));
    var priceLine = total < params.tutorPrice
      ? "Предложена ставка " + total + " ₽/ч вместо " + params.tutorPrice + " ₽ (на " + (params.tutorPrice - total) + " ₽ выгоднее)."
      : "Ставка " + total + " ₽/ч.";
    return "Заявка на " + exam + " (" + subj + "), " + fmt + ", " + dayText + " в " + hour + ". " + priceLine + " Как только преподаватель ответит — пришлём уведомление.";
  }

  function buildWeekDays(weekOffset) {
    var now = new Date();
    now.setHours(12, 0, 0, 0);
    var dow = now.getDay();
    var mondayDelta = dow === 0 ? -6 : 1 - dow;
    var monday = new Date(now.getTime() + (mondayDelta + (Number(weekOffset) || 0) * 7) * 86400000);
    return buildCalendarDays(7, monday);
  }

  function kitRef() {
    return EGE.kit || null;
  }

  function normalizePhoneDigits(raw) {
    var k = kitRef();
    if (k && typeof k.normalizePhoneDigits === "function") return k.normalizePhoneDigits(raw);
    return String(raw == null ? "" : raw).replace(/\D+/g, "").slice(0, 11);
  }

  function formatPhoneMask(raw) {
    var k = kitRef();
    return k && typeof k.formatPhoneMask === "function" ? k.formatPhoneMask(raw) : String(raw || "");
  }

  function formatTelegramContact(raw) {
    var k = kitRef();
    return k && typeof k.formatTelegramContact === "function" ? k.formatTelegramContact(raw) : String(raw || "");
  }

  function entitySlug(entity) {
    var k = kitRef();
    if (k && typeof k.entitySlug === "function") return k.entitySlug(entity);
    var idPart = String((entity && entity.id) || "").replace(/[^a-zA-Z0-9_]/g, "");
    return idPart ? ("vektor_ege_" + idPart) : "vektor_ege_support";
  }

  function whatsappUrl(tutor, message) {
    var k = kitRef();
    if (k && typeof k.whatsappUrl === "function") return k.whatsappUrl(tutor, message);
    var phone = normalizePhoneDigits((tutor && (tutor.whatsapp || tutor.phone)) || "79142100100") || "79142100100";
    var text = message || ("Здравствуйте, " + ((tutor && tutor.name) || "") + "! Пишу с платформы Вектор по поводу занятий (" + ((tutor && tutor.subjectName) || "подготовка") + ").");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function telegramUrl(entity, message) {
    var k = kitRef();
    if (k && typeof k.telegramUrl === "function") return k.telegramUrl(entity, message);
    var text = message || ("Здравствуйте" + (entity && entity.name ? (", " + entity.name) : "") + "! Пишу с платформы Вектор по поводу занятий.");
    return "https://t.me/" + encodeURIComponent(entitySlug(entity)) + "?text=" + encodeURIComponent(text);
  }

  function maxUrl(entity, message) {
    var k = kitRef();
    if (k && typeof k.maxUrl === "function") return k.maxUrl(entity, message);
    var slug = String((entity && entity.maxHandle) || entitySlug(entity)).replace(/^@/, "");
    var text = message || ("Здравствуйте" + (entity && entity.name ? (", " + entity.name) : "") + "! Пишу с платформы Вектор.");
    return "https://max.ru/" + encodeURIComponent(slug) + "?text=" + encodeURIComponent(text);
  }

  function messengerUrls(entity, message) {
    var k = kitRef();
    if (k && typeof k.resolveMessengerUrls === "function") return k.resolveMessengerUrls(entity, message);
    return {
      whatsapp: whatsappUrl(entity, message),
      telegram: telegramUrl(entity, message),
      max: maxUrl(entity, message)
    };
  }

  var LEADS_LS_KEY = "vektor-ege:student-leads";
  var DEFAULT_STUDENT_LEADS = [
    {
      id: "lead-damir",
      studentName: "Дамир Т.",
      subjects: ["chem", "bio"],
      exam: "ЕГЭ",
      format: "Онлайн",
      targetPrice: 1000,
      scheduleNote: "Пн / Ср · 17:00–19:00",
      comment: "Ищу преподавателя по химии (№34 и органика) и биологии для поступления в медвуз.",
      whatsapp: "79142100501",
      createdAt: "2 часа назад",
      responded: false
    },
    {
      id: "lead-saiyyna",
      studentName: "Сайыына М.",
      subjects: ["rus", "eng"],
      exam: "ЕГЭ",
      format: "Онлайн",
      targetPrice: 950,
      scheduleNote: "Вт / Пт · 16:00–18:00",
      comment: "Нужна сильная подготовка к сочинению ЕГЭ и устной части английского.",
      whatsapp: "79142100502",
      createdAt: "4 часа назад",
      responded: false
    },
    {
      id: "lead-artem",
      studentName: "Артём Л.",
      subjects: ["math", "phys"],
      exam: "ЕГЭ",
      format: "Очно",
      targetPrice: 1100,
      scheduleNote: "Сб / Вс · 12:00–16:00",
      comment: "Вторая часть профильной математики и физика, желательно Якутск или онлайн.",
      whatsapp: "79142100503",
      createdAt: "Вчера",
      responded: false
    },
    {
      id: "lead-ksenia",
      studentName: "Ксения П.",
      subjects: ["chem"],
      exam: "ОГЭ",
      format: "Онлайн",
      targetPrice: 850,
      scheduleNote: "Чт / Сб · 15:00",
      comment: "Ищу преподавателя по химии на ОГЭ — закрыть пробелы с нуля до пятёрки.",
      whatsapp: "79142100504",
      createdAt: "Вчера",
      responded: false
    }
  ];
  var _leadsCache = null;

  function saveLeadsList(list) {
    _leadsCache = list;
    try { localStorage.setItem(LEADS_LS_KEY, JSON.stringify(list)); } catch (e) { /* игнор */ }
  }

  function getStudentLeads() {
    if (Array.isArray(_serverLeads)) {
      var localMine = [];
      try {
        var rawLocal = _leadsCache || JSON.parse(localStorage.getItem(LEADS_LS_KEY) || "[]");
        if (Array.isArray(rawLocal)) {
          localMine = rawLocal.filter(function (x) {
            return x && x.mine && !_serverLeads.some(function (s) { return s && s.id === x.id; });
          });
        }
      } catch (e) { /* игнор */ }
      return localMine.concat(_serverLeads);
    }
    if (_leadsCache) {
      return _demoMode ? _leadsCache : _leadsCache.filter(function (x) { return x && x.mine; });
    }
    try {
      var raw = localStorage.getItem(LEADS_LS_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          _leadsCache = parsed;
          return _demoMode ? _leadsCache : _leadsCache.filter(function (x) { return x && x.mine; });
        }
      }
    } catch (e) { /* игнор */ }
    if (!_demoMode) return [];
    _leadsCache = DEFAULT_STUDENT_LEADS.map(function (item) {
      return Object.assign({}, item, { subjects: item.subjects.slice() });
    });
    return _leadsCache;
  }

  function syncStudentLeads(rawList, opts) {
    opts = opts || {};
    var list = Array.isArray(rawList) ? rawList : [];
    var mapped = list.filter(function (x) { return x && x.id; }).map(function (item) {
      var subjs = Array.isArray(item.subjects) ? item.subjects.slice() : ["bio"];
      return {
        id: String(item.id),
        studentName: String(item.studentName || "Ученик"),
        subjects: subjs.length ? subjs : ["bio"],
        exam: String(item.exam || "ЕГЭ"),
        format: String(item.format || "Онлайн"),
        targetPrice: Math.max(0, Number(item.targetPrice != null ? item.targetPrice : item.targetPriceRub) || 1000),
        scheduleNote: String(item.scheduleNote || ""),
        comment: String(item.comment || ""),
        whatsapp: String(item.whatsapp || ""),
        createdAt: String(item.createdAt || "Недавно"),
        responded: item.status === "matched" || !!item.responded,
        mine: !!item.mine,
        fromServer: true
      };
    });
    _serverLeads = opts.replace ? mapped : mapped;
    return getStudentLeads();
  }

  function subjectNamesForIds(ids) {
    var arr = Array.isArray(ids) ? ids : [];
    return arr.map(function (id) {
      var found = SUBJECTS.find(function (s) { return s.id === id; });
      return found ? found.name : "";
    }).filter(Boolean);
  }

  function addStudentLead(raw) {
    raw = raw || {};
    var subjs = Array.isArray(raw.subjects) ? raw.subjects.filter(Boolean) : [];
    if (!subjs.length) subjs = ["chem"];
    var list = getStudentLeads().slice();
    var lead = {
      id: "lead-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5),
      studentName: String(raw.studentName || "Ученик (профиль)").trim().slice(0, 40) || "Ученик",
      subjects: subjs,
      exam: String(raw.exam || "ЕГЭ").trim(),
      format: String(raw.format || "Онлайн").trim(),
      targetPrice: Math.max(500, Math.min(5000, Math.round(Number(raw.targetPrice) || 1000))),
      scheduleNote: String(raw.scheduleNote || "10:00–20:00 по согласованию").trim().slice(0, 80),
      comment: String(raw.comment || "").trim().slice(0, 180) || ("Ищу преподавателя: " + subjectNamesForIds(subjs).join(", ")),
      whatsapp: String(raw.whatsapp || "79142100500").trim().slice(0, 48) || "79142100500",
      createdAt: "Только что",
      mine: true,
      responded: false
    };
    list.unshift(lead);
    saveLeadsList(list);
    return lead;
  }

  function removeStudentLead(id) {
    var list = getStudentLeads().filter(function (x) { return x.id !== id; });
    saveLeadsList(list);
    return list;
  }

  function markStudentLeadResponded(id) {
    var list = getStudentLeads().slice();
    var hit = list.find(function (x) { return x.id === id; });
    if (hit) hit.responded = true;
    saveLeadsList(list);
    return hit || null;
  }

  function resetStudentLeads() {
    _leadsCache = DEFAULT_STUDENT_LEADS.map(function (item) {
      return Object.assign({}, item, { subjects: item.subjects.slice() });
    });
    saveLeadsList(_leadsCache);
    return _leadsCache;
  }

  function studentLeadWhatsappUrl(lead, message) {
    var rawPhone = lead && lead.whatsapp;
    if (rawPhone && !normalizePhoneDigits(rawPhone)) return "";
    var subjs = subjectNamesForIds(lead && lead.subjects).join(", ") || "подготовке";
    var text = message || ("Здравствуйте, " + ((lead && lead.studentName) || "") + "! Вижу вашу заявку («" + subjs + "») на Вектор — готов(а) провести занятие.");
    return whatsappUrl({ whatsapp: rawPhone || "79142100500", name: lead && lead.studentName }, text);
  }

  var LS_REVIEWS_KEY = "vektor-ege:reviews:v1";

  var REVIEW_TAGS = [
    "Понятно объясняет",
    "Много практики",
    "Дал план до экзамена",
    "Проверка ДЗ",
    "Спокойная атмосфера",
    "Пунктуально и по делу"
  ];

  var DISPUTE_REASONS = [
    { id: "first_lesson_guarantee", label: "Не подошёл 1-й урок (гарантия 100%)" },
    { id: "no_show", label: "Репетитор не вышел на связь" },
    { id: "quality", label: "Низкое качество / урок не по запросу" },
    { id: "tech_issue", label: "Технический сбой / урок сорвался" },
    { id: "other", label: "Другая причина" }
  ];

  var SEED_REVIEWS = {
    "tut-sokolova": [
      {
        id: "rev-seed-sok-1",
        tutorId: "tut-sokolova",
        studentName: "Алина С. · 11 класс",
        rating: 5,
        tags: ["Понятно объясняет", "Много практики", "Дал план до экзамена"],
        comment: "За два месяца ушёл страх перед устной частью и аудированием. Письма и эссе теперь укладываются в максимум баллов.",
        createdAt: "4 дня назад"
      },
      {
        id: "rev-seed-sok-2",
        tutorId: "tut-sokolova",
        studentName: "Михаил В. · ОГЭ",
        rating: 5,
        tags: ["Проверка ДЗ", "Спокойная атмосфера"],
        comment: "Очень структурная подача грамматики 19–36, после каждого урока остаётся понятный конспект.",
        createdAt: "2 недели назад"
      },
      {
        id: "rev-seed-sok-3",
        tutorId: "tut-sokolova",
        studentName: "Екатерина П. · ЕГЭ 89",
        rating: 4,
        tags: ["Пунктуально и по делу"],
        comment: "Много разговорной практики в формате реального экзамена, домашние задания проверяет подробно.",
        createdAt: "месяц назад"
      }
    ],
    "tut-kim": [
      {
        id: "rev-seed-kim-1",
        tutorId: "tut-kim",
        studentName: "Дмитрий Л. · 10 класс",
        rating: 5,
        tags: ["Понятно объясняет", "Пунктуально и по делу"],
        comment: "Сразу подобрали комфортную ставку, урок прошёл живо и без воды — составили расписание до мая.",
        createdAt: "5 дней назад"
      },
      {
        id: "rev-seed-kim-2",
        tutorId: "tut-kim",
        studentName: "София Т. · Разговорный",
        rating: 5,
        tags: ["Спокойная атмосфера", "Много практики"],
        comment: "Отличный контакт с первой минуты, помогает разговориться и не бояться ошибок.",
        createdAt: "3 недели назад"
      }
    ],
    "tut-ykt-bio-2": [
      {
        id: "rev-seed-bio-1",
        tutorId: "tut-ykt-bio-2",
        studentName: "Тимур К. · Медвуз",
        rating: 5,
        tags: ["Дал план до экзамена", "Много практики"],
        comment: "Разобрали всю генетику и 27–28 задания на реальных бланках, пробники выросли с 61 до 84.",
        createdAt: "неделю назад"
      }
    ],
    "tut-msk-rus-1": [
      {
        id: "rev-seed-rus-1",
        tutorId: "tut-msk-rus-1",
        studentName: "Дарья В. · ЕГЭ 94",
        rating: 5,
        tags: ["Проверка ДЗ", "Понятно объясняет"],
        comment: "Проверка сочинения по всем критериям К1–К12 экономит уйму времени. Лучший преподаватель по русскому!",
        createdAt: "6 дней назад"
      }
    ]
  };

  var _reviewsCache = null;

  function loadReviewsStore() {
    if (_reviewsCache) return _reviewsCache;
    var empty = { userByTutor: {}, remoteByTutor: {} };
    try {
      if (typeof localStorage !== "undefined") {
        var raw = localStorage.getItem(LS_REVIEWS_KEY);
        if (raw) {
          var parsed = JSON.parse(raw);
          if (parsed && typeof parsed === "object") {
            _reviewsCache = {
              userByTutor: parsed.userByTutor && typeof parsed.userByTutor === "object" ? parsed.userByTutor : {},
              remoteByTutor: parsed.remoteByTutor && typeof parsed.remoteByTutor === "object" ? parsed.remoteByTutor : {}
            };
            return _reviewsCache;
          }
        }
      }
    } catch (e) { /* игнор */ }
    _reviewsCache = empty;
    return _reviewsCache;
  }

  function saveReviewsStore(st) {
    _reviewsCache = st || { userByTutor: {}, remoteByTutor: {} };
    try {
      if (typeof localStorage !== "undefined") {
        localStorage.setItem(LS_REVIEWS_KEY, JSON.stringify({ userByTutor: _reviewsCache.userByTutor }));
      }
    } catch (e) { /* игнор */ }
  }

  function formatReviewDate(rawDate) {
    if (!rawDate) return "Недавно";
    var s = String(rawDate).trim();
    if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return s;
    try {
      var dt = new Date(s);
      if (!Number.isFinite(dt.getTime())) return s;
      return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    } catch (e) {
      return s;
    }
  }

  function fallbackSeedReviewsForTutor(tutor) {
    if (!tutor) return [];
    var subj = tutor.subjectName || "предмету";
    return [
      {
        id: "rev-gen-1-" + tutor.id,
        tutorId: tutor.id,
        studentName: "Артём Г. · 11 класс",
        rating: 5,
        tags: ["Понятно объясняет", "Дал план до экзамена"],
        comment: "Пробное занятие по «" + subj + "» прошло максимально продуктивно: сразу выявили пробелы и согласовали график.",
        createdAt: "неделю назад"
      },
      {
        id: "rev-gen-2-" + tutor.id,
        tutorId: tutor.id,
        studentName: "Мария Н.",
        rating: (Number(tutor.rating) || 4.9) >= 4.9 ? 5 : 4,
        tags: ["Проверка ДЗ", "Пунктуально и по делу"],
        comment: "Хороший темп урока и понятные разборы задач без лишней теории.",
        createdAt: "3 недели назад"
      }
    ];
  }

  function snapshotTutorBase(tutor) {
    if (!tutor) return;
    if (tutor._baseRating == null) tutor._baseRating = Number(tutor.rating) || 4.9;
    if (tutor._baseReviews == null) tutor._baseReviews = Math.max(0, Number(tutor.reviews) || 0);
  }

  function recomputeTutorRatingLocal(tutorId) {
    var tutor = LIST.find(function (t) { return t.id === tutorId; });
    if (!tutor) return null;
    snapshotTutorBase(tutor);
    var st = loadReviewsStore();
    var userList = Array.isArray(st.userByTutor[tutorId]) ? st.userByTutor[tutorId] : [];
    var baseCount = Number(tutor._baseReviews) || 0;
    var baseRating = Number(tutor._baseRating) || 5.0;
    if (!userList.length && !tutor._serverSummary) {
      tutor.rating = baseRating;
      tutor.reviews = baseCount;
      return tutor;
    }
    if (tutor._serverSummary && !userList.some(function (r) { return r && !r.synced; })) {
      tutor.rating = Number(tutor._serverSummary.rating) || baseRating;
      tutor.reviews = Math.max(0, Number(tutor._serverSummary.reviewsCount) || 0);
      return tutor;
    }
    var sum = baseRating * baseCount;
    var totalCount = baseCount + userList.length;
    userList.forEach(function (r) { sum += Math.max(1, Math.min(5, Number(r.rating) || 5)); });
    tutor.reviews = totalCount;
    tutor.rating = totalCount > 0 ? Math.round((sum / totalCount) * 10) / 10 : baseRating;
    return tutor;
  }

  function applyAllLocalReviews() {
    var st = loadReviewsStore();
    Object.keys(st.userByTutor || {}).forEach(function (tid) {
      recomputeTutorRatingLocal(tid);
    });
  }

  function getTutorReviews(tutorId) {
    var tid = String(tutorId || "").trim();
    if (!tid) return [];
    var tutor = LIST.find(function (t) { return t.id === tid; }) || null;
    var st = loadReviewsStore();
    var userRows = Array.isArray(st.userByTutor[tid]) ? st.userByTutor[tid] : [];
    var remoteRows = Array.isArray(st.remoteByTutor[tid]) ? st.remoteByTutor[tid] : [];
    var seeds = _demoMode
      ? (Array.isArray(SEED_REVIEWS[tid]) ? SEED_REVIEWS[tid] : fallbackSeedReviewsForTutor(tutor))
      : [];

    var out = [];
    var seen = {};
    var seenBookings = {};

    function pushRow(r, isMine) {
      if (!r) return;
      var rid = String(r.id || "");
      var bkId = r.bookingId ? String(r.bookingId) : "";
      if (rid && seen[rid]) return;
      if (bkId && seenBookings[bkId]) return;
      if (rid) seen[rid] = true;
      if (bkId) seenBookings[bkId] = true;
      out.push({
        id: rid || ("rev-" + out.length),
        tutorId: tid,
        bookingId: bkId || null,
        studentName: String(r.studentName || "Ученик"),
        rating: Math.max(1, Math.min(5, Math.round(Number(r.rating) || 5))),
        tags: Array.isArray(r.tags) ? r.tags.slice(0, 4) : [],
        comment: String(r.comment || ""),
        createdAt: formatReviewDate(r.createdAt),
        mine: !!(r.mine || isMine)
      });
    }

    userRows.forEach(function (r) { pushRow(r, true); });
    remoteRows.forEach(function (r) { pushRow(r, false); });
    seeds.forEach(function (r) { pushRow(r, false); });
    return out;
  }

  function addTutorReview(raw) {
    raw = raw || {};
    var tid = String(raw.tutorId || "").trim();
    if (!tid) return null;
    var st = loadReviewsStore();
    var list = Array.isArray(st.userByTutor[tid]) ? st.userByTutor[tid].slice() : [];
    var bkId = raw.bookingId ? String(raw.bookingId) : null;
    var item = {
      id: String(raw.id || ("rev-" + Date.now() + "-" + Math.random().toString(36).slice(2, 5))),
      tutorId: tid,
      bookingId: bkId,
      studentName: String(raw.studentName || "Вы (ученик)").trim().slice(0, 48) || "Ученик",
      rating: Math.max(1, Math.min(5, Math.round(Number(raw.rating) || 5))),
      tags: Array.isArray(raw.tags) ? raw.tags.slice(0, 4) : [],
      comment: String(raw.comment || "").trim().slice(0, 600),
      createdAt: raw.createdAt || "Только что",
      mine: true,
      synced: !!raw.synced
    };
    if (bkId) {
      list = list.filter(function (x) { return String(x.bookingId || "") !== bkId; });
    }
    list.unshift(item);
    st.userByTutor[tid] = list;
    saveReviewsStore(st);
    var tutor = recomputeTutorRatingLocal(tid);
    if (raw.serverRating != null && tutor) {
      tutor._serverSummary = {
        rating: Number(raw.serverRating),
        reviewsCount: Math.max(0, Number(raw.serverReviewsCount) || 0)
      };
      tutor.rating = tutor._serverSummary.rating;
      tutor.reviews = tutor._serverSummary.reviewsCount;
    }
    return {
      review: item,
      tutor: tutor,
      rating: tutor ? tutor.rating : item.rating,
      reviewsCount: tutor ? tutor.reviews : 1
    };
  }

  function syncTutorReviews(tutorId, list, summary) {
    var tid = String(tutorId || "").trim();
    if (!tid) return [];
    var st = loadReviewsStore();
    var remote = Array.isArray(list) ? list : [];
    st.remoteByTutor[tid] = remote;
    var remoteIds = {};
    var remoteBookings = {};
    remote.forEach(function (r) {
      if (r && r.id) remoteIds[String(r.id)] = true;
      if (r && r.bookingId) remoteBookings[String(r.bookingId)] = true;
    });
    if (Array.isArray(st.userByTutor[tid])) {
      st.userByTutor[tid] = st.userByTutor[tid].filter(function (u) {
        if (u && u.id && remoteIds[String(u.id)]) return false;
        if (u && u.bookingId && remoteBookings[String(u.bookingId)]) return false;
        return true;
      });
    }
    saveReviewsStore(st);
    if (summary && Number(summary.reviewsCount) > 0) {
      var tutor = LIST.find(function (t) { return t.id === tid; });
      if (tutor) {
        snapshotTutorBase(tutor);
        tutor._serverSummary = {
          rating: Number(summary.rating) || tutor._baseRating,
          reviewsCount: Math.max(0, Number(summary.reviewsCount) || 0)
        };
        recomputeTutorRatingLocal(tid);
      }
    }
    return getTutorReviews(tid);
  }

  function applyReviewSummaries(summaryMap) {
    if (!summaryMap || typeof summaryMap !== "object") return;
    LIST.forEach(function (tutor) {
      var row = summaryMap[tutor.id];
      if (!row || typeof row !== "object") return;
      var cnt = Number(row.reviewsCount != null ? row.reviewsCount : row.reviews_count);
      var rt = Number(row.rating);
      if (Number.isFinite(cnt) && cnt > 0 && Number.isFinite(rt) && rt > 0) {
        snapshotTutorBase(tutor);
        tutor._serverSummary = { rating: Math.round(rt * 10) / 10, reviewsCount: Math.round(cnt) };
        recomputeTutorRatingLocal(tutor.id);
      }
    });
  }

  applyAllLocalReviews();

  EGE.tutors = {
    SUBJECTS: SUBJECTS,
    DIRECTION_CATEGORIES: DIRECTION_CATEGORIES,
    PREVIEW_SUBJECT_IDS: PREVIEW_SUBJECT_IDS,
    REVIEW_TAGS: REVIEW_TAGS,
    DISPUTE_REASONS: DISPUTE_REASONS,
    subjectsForExam: subjectsForExam,
    slugifyDirection: slugifyDirection,
    findDirectionMatch: findDirectionMatch,
    registerDirection: registerDirection,
    syncDirections: syncDirections,
    searchDirections: searchDirections,
    PREP_UNIVERSE: PREP_UNIVERSE,
    LIVE_DEALS: LIVE_DEALS,
    CATALOG_TOTAL: CATALOG_TOTAL,
    DEMO_MODE: _demoMode,
    serverLoaded: _serverTutorsLoaded,
    serverLoading: _serverTutorsLoading,
    isDemoMode: function () { return _demoMode; },
    setDemoMode: setDemoMode,
    syncServerTutors: syncServerTutors,
    syncStudentLeads: syncStudentLeads,
    serverTutorToCard: serverTutorToCard,
    CITIES: CITIES,
    TIMEZONES: TIMEZONES,
    HOURS: HOURS,
    PLANS: PLANS,
    TUTOR_PLANS: TUTOR_PLANS,
    TRIAL_PRICE: TRIAL_PRICE,
    MIN_INITIAL_TOPUP: MIN_INITIAL_TOPUP,
    SBP_PCT: SBP_PCT,
    MINIGROUP_PCT: MINIGROUP_PCT,
    LIST: LIST,
    COMMISSION_PCT: COMMISSION_PCT,
    upsertCustomTutor: upsertCustomTutor,
    removeCustomTutor: removeCustomTutor,
    commissionSplit: commissionSplit,
    tutorInWindow: tutorInWindow,
    buildCalendarDays: buildCalendarDays,
    buildWeekDays: buildWeekDays,
    tutorSlotsForDay: tutorSlotsForDay,
    filterTutors: filterTutors,
    countForDay: countForDay,
    countForHour: countForHour,
    offerSignal: offerSignal,
    botPreviewText: botPreviewText,
    normalizePhoneDigits: normalizePhoneDigits,
    formatPhoneMask: formatPhoneMask,
    formatTelegramContact: formatTelegramContact,
    whatsappUrl: whatsappUrl,
    telegramUrl: telegramUrl,
    maxUrl: maxUrl,
    messengerUrls: messengerUrls,
    subjectNamesForIds: subjectNamesForIds,
    getStudentLeads: getStudentLeads,
    addStudentLead: addStudentLead,
    removeStudentLead: removeStudentLead,
    markStudentLeadResponded: markStudentLeadResponded,
    resetStudentLeads: resetStudentLeads,
    studentLeadWhatsappUrl: studentLeadWhatsappUrl,
    getTutorReviews: getTutorReviews,
    addTutorReview: addTutorReview,
    syncTutorReviews: syncTutorReviews,
    applyReviewSummaries: applyReviewSummaries
  };
})();
