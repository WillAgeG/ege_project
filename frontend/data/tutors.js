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
    { id: "inf", name: "Информатика и Python", short: "Информатика" },
    { id: "phys", name: "Физика и олимпиады", short: "Физика" },
    { id: "hist", name: "История и общество", short: "История" },
    { id: "design", name: "UX/UI и Моушен-дизайн", short: "Дизайн UX/UI" },
    { id: "music", name: "Вокал, гитара и музыка", short: "Вокал / Гитара" }
  ];

  var PREP_UNIVERSE = [
    { label: "ЕГЭ на 85+", subject: "all", meta: "от 750 ₽/ч · −40% ниже рынка" },
    { label: "ОГЭ без стресса", subject: "all", meta: "от 700 ₽/ч · −38% ниже рынка" },
    { label: "Python и алгоритмы", subject: "inf", meta: "от 950 ₽/ч · вместо 1 700 ₽" },
    { label: "UX/UI в Figma", subject: "design", meta: "от 900 ₽/ч · портфолио с нуля" },
    { label: "Моушен-дизайн (AE)", subject: "design", meta: "от 950 ₽/ч · реальные кейсы" },
    { label: "Разговорный английский", subject: "eng", meta: "от 800 ₽/ч · IELTS и работа" },
    { label: "Медвуз: биология + химия", subject: "bio", meta: "от 850 ₽/ч · задачи 28 и 34" },
    { label: "Высшая математика", subject: "math", meta: "от 850 ₽/ч · сессия и ЕГЭ" },
    { label: "Физика и Физтех", subject: "phys", meta: "от 900 ₽/ч · олимпиады и ВУЗ" },
    { label: "Вокал и гитара", subject: "music", meta: "от 750 ₽/ч · онлайн и студия" },
    { label: "История и право", subject: "hist", meta: "от 750 ₽/ч · карты и эссе" },
    { label: "Собеседование в IT", subject: "inf", meta: "от 1 100 ₽/ч · −45% ниже рынка" }
  ];

  var LIVE_DEALS = [
    { topic: "ЕГЭ Биология", paid: 850, market: 1450, tag: "вместо 1 450 ₽ · −41%" },
    { topic: "UX/UI и Figma", paid: 950, market: 1800, tag: "вместо 1 800 ₽ · −47%" },
    { topic: "Английский B2 / ЕГЭ", paid: 900, market: 1600, tag: "вместо 1 600 ₽ · −44%" },
    { topic: "Python и КЕГЭ", paid: 1000, market: 1750, tag: "вместо 1 750 ₽ · −43%" },
    { topic: "Вокал и слух", paid: 750, market: 1300, tag: "вместо 1 300 ₽ · −42%" },
    { topic: "Химия №34 (медвуз)", paid: 950, market: 1650, tag: "вместо 1 650 ₽ · −42%" },
    { topic: "Математика профиль", paid: 900, market: 1550, tag: "вместо 1 550 ₽ · −42%" }
  ];

  var CATALOG_TOTAL = 2480;
  var SOURCE_CHANNELS = ["Доска Ykt", "Telegram", "WhatsApp", "MAX", "Доска Ykt · TG", "WA · MAX"];

  var HOURS = ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
  var WEEKDAYS_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  var WEEKDAYS_LONG = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
  var MONTHS_GEN = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
  var COMMISSION_PCT = 5;

  function commissionSplit(price) {
    var total = Math.max(0, Math.round(Number(price) || 0));
    var fee = Math.round(total * COMMISSION_PCT / 100);
    return { total: total, fee: fee, payout: total - fee, pct: COMMISSION_PCT };
  }

  var PLANS = [
    {
      id: "free",
      name: "Бесплатная",
      badge: "Тесты и база",
      price: 0,
      balance: 0,
      priceLabel: "0 ₽",
      period: "навсегда",
      tagline: "Тренажёр ЕГЭ, конспекты и огромная база репетиторов",
      cta: "Готовиться бесплатно",
      features: [
        "Полный тренажёр ЕГЭ: задания ФИПИ, конспекты и разбор ошибок",
        "План подготовки к поступлению и отслеживание прогресса",
        "Анкеты с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов",
        "Плата за занятия списывается только при бронировании уроков с баланса"
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
        "Выбор времени с 10:00 до 20:00 и шаг цены −100 / +100 ₽",
        "Безопасная оплата: средства удерживаются только после согласия репетитора",
        "Замена репетитора в 1 клик — неиспользованный остаток не сгорает"
      ]
    },
    {
      id: "month10k",
      name: "Месяц под ключ",
      badge: "Супер-подписка",
      super: true,
      featured: true,
      price: 10000,
      balance: 10000,
      priceLabel: "10 000 ₽",
      period: "супер-подписка · баланс на месяц",
      tagline: "Полноценная подготовка с приоритетным подбором и защитой баланса",
      cta: "Подключить за 10 000 ₽",
      features: [
        "10 000 ₽ на внутренний баланс — хватает примерно на 10–12 уроков по 800–1000 ₽",
        "Приоритетный подбор: найдём замену за 15 мин, если преподаватель занят",
        "Простая ставка без скрытых доплат сверх предложенной цены за час",
        "Безлимитные тесты ЕГЭ, конспекты и заморозка остатка баланса"
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
    },
    {
      id: "tut-kovalev",
      name: "Денис Ковалёв",
      subject: "design",
      subjectName: "UX/UI и Моушен-дизайн",
      exams: ["Навыки", "Портфолио"],
      price: 1200,
      marketPrice: 2000,
      minFair: 950,
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.9,
      reviews: 27,
      exp: "6 лет · Senior Product & Motion Designer",
      tag: "Figma, After Effects, анимация интерфейсов",
      bumpedToday: true,
      bumpText: "Поднял анкету 2 ч назад",
      bio: "Учу UX/UI в Figma, прототипированию и моушен-дизайну с нуля до первых коммерческих заказов и сильного портфолио.",
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
      marketPrice: 1750,
      minFair: 900,
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.9,
      reviews: 33,
      exp: "6 лет · МФТИ, готовлю к ЕГЭ 90+ и Физтеху",
      tag: "Механика, электродинамика и часть 2",
      bumpedToday: true,
      bumpText: "Поднял анкету сегодня",
      bio: "Убираем зубрёжку формул: выводим законы с нуля, решаем расчётные задачи №21–26 ЕГЭ и вузовский курс общей физики.",
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
      marketPrice: 1500,
      minFair: 750,
      formats: ["Онлайн", "Очно"],
      city: "Онлайн / Очно",
      rating: 4.8,
      reviews: 22,
      exp: "5 лет · современное пение и акустика",
      tag: "Постановка голоса, дыхание и аккомпанемент",
      bumpedToday: false,
      bumpText: "Обновила слоты сегодня",
      bio: "Помогаю зазвучать уверенно с первого месяца: дыхание, интонирование, разбор любимых песен на гитаре или фортепиано и подготовка в творческие вузы.",
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
      marketPrice: 1550,
      minFair: 780,
      formats: ["Онлайн"],
      city: "Онлайн по РФ",
      rating: 4.9,
      reviews: 28,
      exp: "5 лет · средний балл 86, поступят на бюджет",
      tag: "Карты, культура, №18–21 и аргументация",
      bumpedToday: true,
      bumpText: "Подняла анкету 1 ч назад",
      bio: "Связываем даты в живые сюжеты без зубрёжки. Отрабатываем карты, культуру, причинно-следственные связи и вторую часть ЕГЭ/ДВИ.",
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
      formats: ["Онлайн"],
      city: "Москва · Онлайн",
      rating: 5.0,
      reviews: 64,
      exp: "14 лет · 31 стобалльник и призёры олимпиад",
      tag: "Выше рынка · углублённая квалификация",
      bumpedToday: true,
      bumpText: "Высокий спрос · топ-рейтинг",
      bio: "Преподаватель вуза и член жюри профильных олимпиад. Дороже средней ставки, но закрываем сложные задачи ДВИ, Физтеха и ЕГЭ 95+ без лишней воды.",
      slots: {
        1: ["16:00", "19:00"],
        2: ["18:00", "20:00"],
        3: ["16:00", "18:00"],
        5: ["17:00", "19:00"],
        6: ["11:00", "14:00", "17:00"],
        0: ["12:00", "15:00"]
      }
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

  LIST.forEach(function (t, idx) {
    t.whatsapp = t.whatsapp || WA_PHONES[t.id] || ("791421001" + String(10 + idx));
    t.verified = t.verified !== false;
    t.source = t.source || SOURCE_CHANNELS[idx % SOURCE_CHANNELS.length];
    t.marketPrice = t.marketPrice || Math.round((t.price * 1.38) / 50) * 50;
    t.belowRub = Math.max(0, t.marketPrice - t.price);
    t.aboveRub = Math.max(0, t.price - t.marketPrice);
    t.belowPct = t.belowRub > 0 ? Math.max(10, Math.round((1 - (t.minFair || t.price) / t.marketPrice) * 100)) : 0;
    t.abovePct = t.aboveRub > 0 ? Math.max(5, Math.round((t.aboveRub / t.marketPrice) * 100)) : 0;
    t.responseMin = t.bumpedToday ? 10 : 25;
    if (!t.availableFrom || !t.availableTo) {
      var allH = [];
      Object.keys(t.slots || {}).forEach(function (k) {
        (t.slots[k] || []).forEach(function (h) { allH.push(h); });
      });
      allH.sort(function (a, b) { return timeToMinutes(a) - timeToMinutes(b); });
      t.availableFrom = t.availableFrom || allH[0] || "09:00";
      t.availableTo = t.availableTo || allH[allH.length - 1] || "21:00";
    }
    t.windowLabel = "с " + t.availableFrom + " до " + t.availableTo;
  });

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
    if (filters.maxPrice && filters.maxPrice < 2000 && tutor.price > filters.maxPrice) return false;
    if (filters.onlyBumped && !tutor.bumpedToday) return false;
    if (filters.q) {
      var q = String(filters.q).trim().toLowerCase();
      if (q) {
        var hay = [tutor.name, tutor.subjectName, tutor.tag, tutor.bio, tutor.city, (tutor.exams || []).join(" ")].join(" ").toLowerCase();
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
    var ratio = offerPrice / tutorPrice;
    var diff = Math.round(tutorPrice - offerPrice);
    if (offerPrice > tutorPrice) {
      var extra = Math.round(offerPrice - tutorPrice);
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

  function whatsappUrl(tutor, message) {
    var phone = String((tutor && tutor.whatsapp) || "79142100100").replace(/\D+/g, "");
    var text = message || ("Здравствуйте, " + ((tutor && tutor.name) || "") + "! Пишу с платформы Вектор ЕГЭ по поводу занятий (" + ((tutor && tutor.subjectName) || "подготовка") + ").");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  EGE.tutors = {
    SUBJECTS: SUBJECTS,
    PREP_UNIVERSE: PREP_UNIVERSE,
    LIVE_DEALS: LIVE_DEALS,
    CATALOG_TOTAL: CATALOG_TOTAL,
    HOURS: HOURS,
    PLANS: PLANS,
    LIST: LIST,
    COMMISSION_PCT: COMMISSION_PCT,
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
    whatsappUrl: whatsappUrl
  };
})();
