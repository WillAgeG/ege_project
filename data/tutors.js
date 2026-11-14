/* Данные и логика маркетплейса репетиторов «Вектор ЕГЭ»:
   анкеты, свободные окна по дням и часам, тарифы подписок и предпросмотр торга (inDrive-формат). */
(function () {
  var EGE = (window.EGE = window.EGE || {});

  var SUBJECTS = [
    { id: "eng", name: "Английский язык", short: "Английский" },
    { id: "rus", name: "Русский язык", short: "Русский" },
    { id: "bio", name: "Биология", short: "Биология" },
    { id: "chem", name: "Химия", short: "Химия" },
    { id: "math", name: "Математика", short: "Математика" },
    { id: "inf", name: "Информатика", short: "Информатика" }
  ];

  var HOURS = ["09:00", "10:00", "11:00", "12:00", "14:00", "16:00", "18:00", "19:00", "20:00", "21:00"];
  var WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var WEEKDAYS_LONG = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  var MONTHS_GEN = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];

  var PLANS = [
    {
      id: "free",
      name: "Бесплатная",
      badge: "База и тесты",
      price: 0,
      balance: 0,
      priceLabel: "0 ₽",
      period: "навсегда",
      tagline: "Для самостоятельной подготовки и знакомства с репетиторами",
      cta: "Готовиться бесплатно",
      features: [
        "Полный тренажёр ЕГЭ: задания ФИПИ, справочник и разбор ошибок",
        "План подготовки к поступлению и отслеживание прогресса",
        "Просмотр каталога репетиторов, свободных кружочков времени и ставок",
        "Без баланса на оплату индивидуальных занятий"
      ]
    },
    {
      id: "trial5k",
      name: "Пробник",
      badge: "Старт с балансом",
      price: 5000,
      balance: 5000,
      priceLabel: "5 000 ₽",
      period: "баланс на репетиторов",
      tagline: "Вся сумма 5 000 ₽ сразу падает на баланс — тратьте на уроки сразу",
      cta: "Выбрать за 5 000 ₽",
      features: [
        "Баланс 5 000 ₽ на любые занятия с репетиторами из каталога",
        "Быстрая запись по кружочкам календаря + торг ценой как в inDrive",
        "Контакты ученика скрыты до подтверждения и оплаты",
        "Замена репетитора в 1 клик — неиспользованный остаток не сгорает"
      ]
    },
    {
      id: "month10k",
      name: "Месяц под ключ",
      badge: "Хит · выгоднее",
      featured: true,
      price: 10000,
      balance: 10000,
      priceLabel: "10 000 ₽",
      period: "единый баланс на месяц",
      tagline: "Полноценная подготовка сразу по 1–3 предметам с защитой баланса",
      cta: "Подключить за 10 000 ₽",
      features: [
        "10 000 ₽ на внутренний баланс — хватает примерно на 8–12 занятий",
        "Можно распределять баланс между разными предметами и преподавателями",
        "Приоритетный автоподбор ботом: если препод занят, ищем замену за 15 мин",
        "Безлимитный тренажёр ЕГЭ + личный баланс и история всех уроков"
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.9,
      reviews: 34,
      exp: "6 лет · средний балл ЕГЭ 87",
      tag: "Эксперт устной части и эссе",
      bumpedToday: true,
      bumpText: "Подняла анкету 40 мин назад",
      bio: "Готовлю к ЕГЭ и ОГЭ с нуля до 85+. Снимаю страх перед говорением, разбираем ловушки аудирования и грамматики 19–36.",
      slots: {
        1: ["16:00", "18:00", "20:00"],
        2: ["10:00", "16:00", "19:00"],
        3: ["18:00", "20:00"],
        4: ["10:00", "14:00", "19:00"],
        5: ["16:00", "18:00"],
        6: ["09:00", "10:00", "11:00", "14:00", "16:00"],
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
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.8,
      reviews: 19,
      exp: "3 года · ЕГЭ на 96 баллов",
      tag: "Интенсив к ОГЭ и базе ЕГЭ",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Простым языком закрываю пробелы в временах и словообразовании. Беру заявки с торгом по утренним окнам.",
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 5.0,
      reviews: 52,
      exp: "11 лет · 90+ у каждого 2-го ученика",
      tag: "Профиль 90+ баллов",
      bumpedToday: false,
      bumpText: "Была в сети вчера",
      bio: "Системная подготовка к ЕГЭ по кодификатору ФИПИ, еженедельные пробники с проверкой писем и устной части по критериям.",
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.9,
      reviews: 41,
      exp: "7 лет · 18 стобалльников и 90+",
      tag: "Сочинение №27 без шаблонов",
      bumpedToday: true,
      bumpText: "Подняла анкету 2 ч назад",
      bio: "Учим орфографию и пунктуацию через алгоритмы, а не зубрёжку. Разбираем каждое сочинение по свежим критериям ФИПИ.",
      slots: {
        1: ["14:00", "18:00", "20:00"],
        2: ["10:00", "16:00", "19:00"],
        4: ["12:00", "18:00"],
        5: ["16:00", "19:00"],
        6: ["09:00", "10:00", "14:00", "18:00"],
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
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.8,
      reviews: 23,
      exp: "4 года · специализация на ОГЭ и тестовой части",
      tag: "Быстрый разбор ловушек 1–26",
      bumpedToday: false,
      bumpText: "Поднял анкету вчера",
      bio: "Тренируем изложение ОГЭ и задания 8, 12, 21, 22 ЕГЭ. Подходит, если нужно быстро подтянуть баллы за 2–3 месяца.",
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.9,
      reviews: 37,
      exp: "8 лет · готовлю в медицинские вузы",
      tag: "Генетика №28 и эвристика №25–26",
      bumpedToday: true,
      bumpText: "Подняла анкету 1 ч назад",
      bio: "Закрываем сложную часть 2: задачи по цитологии (палиндромы тРНК), Харди–Вайнбергу и сцепленному наследованию.",
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
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.7,
      reviews: 15,
      exp: "3 года · студент-старшекурсник меда",
      tag: "Понятно и без воды",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Работаем по схемам, рисункам КИМ и тестам: анатомия, ботаника, зоология и задания на эксперимент №2, №22–23.",
      slots: {
        1: ["18:00", "21:00"],
        4: ["10:00", "19:00", "21:00"],
        5: ["14:00", "18:00"],
        6: ["09:00", "14:00", "18:00"],
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 5.0,
      reviews: 46,
      exp: "9 лет · средний балл 88",
      tag: "Задача №34 (атомистика, олеум, электролиз)",
      bumpedToday: true,
      bumpText: "Подняла анкету 3 ч назад",
      bio: "Учим не зубрить, а понимать логику реакций и механизмов. На каждом уроке разбираем ОВР №29 и расчёты 26–28, 33–34.",
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
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.9,
      reviews: 29,
      exp: "5 лет · профиль 80+ и ОГЭ на «5»",
      tag: "Первая часть за 25 минут + №13, 15, 16",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Ставлю уверенную первую часть без арифметических промахов, потом переходим к тригонометрии, неравенствам и экономическим задачам.",
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.8,
      reviews: 21,
      exp: "3 года · база ЕГЭ и ОГЭ геометрия",
      tag: "Спасаю от «двойки» до твёрдой 4–5",
      bumpedToday: false,
      bumpText: "Обновил расписание вчера",
      bio: "Спокойно разбираем дроби, графики, геометрию с первой по 25-ю задачу ОГЭ и базовый ЕГЭ без лишней теории.",
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
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.9,
      reviews: 31,
      exp: "5 лет · Python и Excel для КЕГЭ",
      tag: "Задачи 24–27 на Python с нуля",
      bumpedToday: true,
      bumpText: "Поднял анкету 3 ч назад",
      bio: "Переводим всю тестовую часть и сложные номера КЕГЭ в быстрый код на Python. Работаем на реальных станциях КЕГЭ.",
      slots: {
        1: ["19:00", "21:00"],
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
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.8,
      reviews: 18,
      exp: "4 года · ОГЭ 38/38 и базовые темы ЕГЭ",
      tag: "Эксперимент и мысленные задачи",
      bumpedToday: false,
      bumpText: "Обновила слоты 2 дня назад",
      bio: "Отрабатываем номенклатуру, качественные реакции, расстановку коэффициентов и задачи на растворы с массовой долей.",
      slots: {
        2: ["16:00", "19:00"],
        4: ["10:00", "16:00"],
        6: ["09:00", "11:00", "16:00"],
        0: ["14:00", "18:00"]
      }
    }
  ];

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
    if (filters.subject && filters.subject !== "all" && tutor.subject !== filters.subject) return false;
    if (filters.format && filters.format !== "all" && tutor.formats.indexOf(filters.format) < 0) return false;
    if (filters.maxPrice && tutor.price > filters.maxPrice) return false;
    if (filters.onlyBumped && !tutor.bumpedToday) return false;
    return true;
  }

  function tutorMatchesTime(tutor, dow, hour) {
    var daySlots = tutorSlotsForDay(tutor, dow);
    if (!daySlots.length) return false;
    if (hour && hour !== "all" && daySlots.indexOf(hour) < 0) return false;
    return true;
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
    var ratio = offerPrice / tutorPrice;
    if (ratio >= 1) return { tone: "good", label: "По полной ставке — репетитор почти наверняка сразу скажет «Да»" };
    if (ratio >= 0.85) return { tone: "good", label: "Хорошее предложение (−" + Math.round((1 - ratio) * 100) + "%) — высокий шанс отклика за 10–15 мин" };
    if (ratio >= 0.72) return { tone: "warn", label: "Смелый торг (−" + Math.round((1 - ratio) * 100) + "%) — бот передаст ставку репетитору" };
    return { tone: "bad", label: "Слишком низкая ставка — преподаватель может предложить свою цену" };
  }

  function botPreviewText(params) {
    var exam = params.exam || "ЕГЭ";
    var subj = params.subjectName || "предмету";
    var fmt = (params.format || "онлайн").toLowerCase();
    var dayText = params.dayLabel || "ближайший свободный день";
    var hour = params.hour || "10:00";
    var priceLine = params.offerPrice < params.tutorPrice
      ? "Предлагает ставку " + params.offerPrice + " ₽/ч вместо " + params.tutorPrice + " ₽."
      : "Готов заниматься по вашей ставке " + params.offerPrice + " ₽/ч.";
    return "«Здравствуйте! Новая заявка с Вектор ЕГЭ. Хочу подготовиться к " + exam +
      " (" + subj + "), " + fmt + ", " + dayText + " в " + hour + ". " + priceLine +
      " Ответьте: Да / Нет / Перенести время.»";
  }

  EGE.tutors = {
    SUBJECTS: SUBJECTS,
    HOURS: HOURS,
    PLANS: PLANS,
    LIST: LIST,
    buildCalendarDays: buildCalendarDays,
    tutorSlotsForDay: tutorSlotsForDay,
    filterTutors: filterTutors,
    countForDay: countForDay,
    countForHour: countForHour,
    offerSignal: offerSignal,
    botPreviewText: botPreviewText
  };
})();
