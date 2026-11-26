/* Универсальный движок 13 шаблонов заданий ОГЭ и ЕГЭ: выбор, ввод, пары, порядок, пропуски, запятые, группы, поля, таблица, предложения, Python и 2-я часть. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, norm, normTight, parseNum, plural } = EGE.utils;
  const { icon } = EGE.ui;

  const LETTERS = "АБВГДЕЖЗИК";

  const CATALOG = [
    {
      id: "single",
      short: "Выбор",
      title: "1. Выбор одного ответа",
      ege: "Русский №4–6 (база), ОГЭ, История, Биология, Химия",
      uxNote: "Крупные кнопки на всю ширину с номерами 1–4, мгновенной проверкой и разбором."
    },
    {
      id: "multi",
      short: "Несколько",
      title: "2. Несколько верных ответов",
      ege: "Русский №4, №9–12, №16; Биология; Химия; ОГЭ",
      uxNote: "Точный («Выберите 3» со счётчиком) и открытый режим выбора нескольких ответов."
    },
    {
      id: "input",
      short: "Ввод",
      title: "3. Краткий ответ (слово, число, цифры)",
      ege: "ОГЭ/ЕГЭ Математика (1-я часть), Русский №5, №7, №22–26",
      uxNote: "Принимает запятую и точку (0,25 = 0.25), игнорирует лишние пробелы и регистр."
    },
    {
      id: "match",
      short: "Пары",
      title: "4. Соответствие (А–Г ↔ 1–5)",
      ege: "Русский №8, №21; Математика №11; Биология; Химия; ОГЭ",
      uxNote: "Строки А–Г с крупными кнопками-цифрами 1–5 и живым кодом ответа."
    },
    {
      id: "order",
      short: "Порядок",
      title: "5. Последовательность шагов",
      ege: "Биология №12, №14, №19; Химия №21; История №1",
      uxNote: "Без перетаскивания: кликаешь карточки по порядку 1→2→3→4, повторный клик снимает."
    },
    {
      id: "gaps",
      short: "Пропуски",
      title: "6. Пропуски в тексте (клик-подстановка)",
      ege: "Русский №9–12, №15 (Н/НН), ОГЭ №5–6",
      uxNote: "Слова и буквы вставляются прямо в предложение с автопереходом к следующему слоту."
    },
    {
      id: "punct",
      short: "Запятые",
      title: "7. Запятые в предложении (клик по цифрам)",
      ege: "Русский ЕГЭ №17–20, ОГЭ №3",
      uxNote: "Цифры (1)(2)(3)(4) нажимаются в тексте — ставится запятая и собирается код цифр."
    },
    {
      id: "classify",
      short: "Группы",
      title: "8. Сортировка по категориям / «Верно–Неверно»",
      ege: "Русский №13–14, Химия №18–20, Биология №1–2",
      uxNote: "Компактные тумблеры напротив каждого примера — удобно на экране телефона 375px."
    },
    {
      id: "self",
      short: "2-я часть",
      title: "9. Развёрнутый ответ + критерии ФИПИ",
      ege: "ОГЭ/ЕГЭ 2-я часть: Математика, Биология, Химия, Русский №27",
      uxNote: "Черновик решения → эталон ФИПИ → интерактивный чек-лист критериев и подсчёт баллов."
    },
    {
      id: "multi_input",
      short: "2 поля",
      title: "10. Несколько полей ответа",
      ege: "Информатика ЕГЭ №17, №25–27; Физика (значение ± погрешность); ОГЭ",
      uxNote: "Подписанные отдельные поля вместо угадывания разделителя («через пробел или запятую»)."
    },
    {
      id: "table",
      short: "Таблица",
      title: "11. Интерактивная таблица с пропусками",
      ege: "Информатика ЕГЭ №2 (истинность), Химия №23, ОГЭ Математика №1–5",
      uxNote: "Пустые ячейки заполняются кликом (0/1) или вводом прямо внутри готовой таблицы."
    },
    {
      id: "text_pick",
      short: "Текст",
      title: "12. Выбор предложений в пронумерованном тексте",
      ege: "Русский ЕГЭ №1–3, №23–26; ОГЭ №2–3, №6",
      uxNote: "Кликабельные пронумерованные предложения (1), (2), (3) вместо листания туда-сюда."
    },
    {
      id: "code",
      short: "Python",
      title: "13. Задача на Python с проверкой на тестах",
      ege: "Информатика ЕГЭ №5, 8, 12, 14–17, 23–27 и ОГЭ №15.2 / №16",
      uxNote: "Встроенный редактор кода + безопасный запуск на сервере по открытым и скрытым тестам."
    }
  ];

  const SAMPLES = [
    {
      id: "tpl-single",
      kind: "test",
      qtype: "single",
      badge: "Шаблон 1 · single",
      title: "Выбор одного верного варианта",
      prompt: "В каком из слов ударение поставлено ВЕРНО?",
      options: ["свеклА", "оптОвый", "кухОнный", "тортЫ"],
      answer: 1,
      explain: "Правильно — оптОвый. В остальных: свЁкла, кУхонный, тОрты."
    },
    {
      id: "tpl-multi",
      kind: "test",
      qtype: "multi",
      exactCount: 3,
      badge: "Шаблон 2 · multi",
      title: "Выбор нескольких вариантов (с точным счётчиком)",
      prompt: "Выберите 3 структуры эукариотической клетки, которые являются двумембранными:",
      options: [
        "Митохондрии",
        "Комплекс Гольджи",
        "Хлоропласты",
        "Ядро",
        "Рибосомы"
      ],
      answer: [0, 2, 3],
      explain: "Двумембранные структуры — митохондрии, хлоропласты и ядро. Комплекс Гольджи — одномембранный, рибосома — немембранный."
    },
    {
      id: "tpl-input",
      kind: "test",
      qtype: "input",
      subtype: "number",
      badge: "Шаблон 3 · input (число)",
      title: "Краткий ввод числа (запятая или точка)",
      prompt: "Математика · Задание 4. В случайном эксперименте симметричную монету бросают дважды. Найдите вероятность того, что оба раза выпадет орёл.",
      placeholder: "Например: 0,25",
      answer: ["0.25", "0,25"],
      explain: "Исходов 4 (ОО, ОР, РО, РР), благоприятный — 1 (ОО). Вероятность 1/4 = 0,25. Шаблон автоматически принимает и 0,25, и 0.25."
    },
    {
      id: "tpl-match",
      kind: "test",
      qtype: "match",
      badge: "Шаблон 4 · match",
      title: "Установление соответствия (как задание 8 ЕГЭ)",
      prompt: "Русский язык · Задание 8. Установите соответствие между грамматическими ошибками и предложениями:",
      l: [
        "А) Ошибка в построении предложения с деепричастным оборотом",
        "Б) Нарушение связи между подлежащим и сказуемым",
        "В) Нарушение видо-временной соотнесённости глаголов"
      ],
      r: [
        "Все, кто читал повесть, остался доволен финалом.",
        "Подъезжая к станции, у пассажира слетела шляпа.",
        "Когда художник пишет этюд, он выбрал холодные тона.",
        "Театр открыл новый сезон премьерой классической драмы."
      ],
      answer: [1, 0, 2],
      explain: "А → 2 (деепричастие «подъезжая» не относится к подлежащему «шляпа»). Б → 1 («Все» мн. ч. требует сказуемого «остались»). В → 3 (разные виды/времена: «пишет» и «выбрал»)."
    },
    {
      id: "tpl-order",
      kind: "test",
      qtype: "order",
      badge: "Шаблон 5 · order",
      title: "Установление правильной последовательности",
      prompt: "Биология · Установите последовательность систематических таксонов, начиная с НАИМЕНЬШЕГО (от вида к классу):",
      o: [
        "Род Волки",
        "Вид Волк обыкновенный",
        "Класс Млекопитающие",
        "Отряд Хищные"
      ],
      answer: [1, 0, 3, 2],
      explain: "От наименьшего к наибольшему: Вид (2) → Род (1) → Отряд (4) → Класс (3)."
    },
    {
      id: "tpl-gaps",
      kind: "practice",
      qtype: "gaps",
      badge: "Шаблон 6 · gaps",
      title: "Вставка букв/слов прямо в текст",
      prompt: "Русский язык · Задание 15. Нажимайте на пропуски и подставьте Н или НН:",
      text: "На столе стояла глиня{{0}}ая ваза, украше{{1}}ая лентами, а рядом лежали свежемороже{{2}}ые ягоды.",
      bank: ["н", "нн"],
      answer: ["н", "нн", "н"],
      explain: "глиняная (-ян-, исключений нет → Н); украшенная (причастие совершенного вида с зависимым словом → НН); свежемороженые (сложное слово с основой отглагольного прилагательного без приставки и зависимых слов → Н)."
    },
    {
      id: "tpl-punct",
      kind: "test",
      qtype: "punct",
      badge: "Шаблон 7 · punct",
      title: "Расстановка запятых прямо в предложении",
      prompt: "Русский язык · Задание 17. Нажмите на цифры, на месте которых должны стоять ЗАПЯТЫЕ:",
      text: "Туристы {{1}} уставшие от долгого подъёма {{2}} остановились у ручья {{3}} блестевшего в лучах {{4}} заходящего солнца.",
      answer: [1, 2, 3],
      explain: "1 и 2 — обособленное определение после определяемого слова «туристы»; 3 — причастный оборот после слова «у ручья»; 4 — одиночное причастие перед определяемым словом (запятая не нужна). Ответ: 123."
    },
    {
      id: "tpl-classify",
      kind: "practice",
      qtype: "classify",
      badge: "Шаблон 8 · classify",
      title: "Сортировка по категориям (слитно / раздельно)",
      prompt: "Русский язык · Распределите выделенные слова по способу написания:",
      cats: ["Слитно", "Раздельно"],
      rows: [
        { text: "Иметь (в)виду важное правило", answer: 1 },
        { text: "Перевести деньги (на)счёт в банке", answer: 1 },
        { text: "Узнать (на)счёт расписания занятий", answer: 0 },
        { text: "Отсутствовать (в)течение недели", answer: 1 }
      ],
      explain: "«В виду» (в значении ‘иметь в виду’) — раздельно; «на счёт в банке» (сущ. с предлогом) — раздельно; «насчёт расписания» (= о) — слитно; «в течение недели» (производный предлог времени) — раздельно."
    },
    {
      id: "tpl-self",
      kind: "test",
      qtype: "self",
      badge: "Шаблон 9 · self (2-я часть)",
      title: "Развёрнутый ответ и самопроверка по критериям ФИПИ",
      prompt: "Биология · Задание 22 (мини-образец). Почему при длительном приёме антибиотиков у человека может возникнуть гиповитаминоз витамина K?",
      placeholder: "Набросайте ключевые тезисы вашего ответа...",
      ref: "1) Антибиотики подавляют жизнедеятельность не только патогенных, но и симбиотических бактерий кишечника (кишечной палочки).\n2) Именно микрофлора толстого кишечника синтезирует витамин K (а также витамины группы B).\n3) Снижение числа бактерий приводит к уменьшению синтеза витамина K и ухудшению свёртываемости крови.",
      els: [
        "Указано уничтожение полезной микрофлоры кишечника антибиотиками",
        "Указано, что кишечные бактерии синтезирует витамин K",
        "Сделан вывод о снижении синтеза витамина K / развитии гиповитаминоза"
      ],
      explain: "Во 2-й части ЕГЭ важно прописывать всю причинно-следственную цепочку без пропуска звеньев. Отмеченные пункты показывают ваш реальный первичный балл."
    },
    {
      id: "tpl-multi-input",
      kind: "test",
      qtype: "multi_input",
      badge: "Шаблон 10 · multi_input",
      title: "Несколько отдельных полей ответа (Информатика / Физика)",
      prompt: "Информатика · Мини-образец №17. Дан набор чисел: [12, 7, 18, 5, 14]. Найдите количество чётных чисел и максимальное из них.",
      fields: [
        { label: "Количество чётных", placeholder: "Число", subtype: "number", answer: ["3"] },
        { label: "Максимальное чётное", placeholder: "Число", subtype: "number", answer: ["18"] }
      ],
      explain: "Чётные числа: 12, 18, 14 — всего 3 числа; максимальное из них равно 18."
    },
    {
      id: "tpl-table",
      kind: "practice",
      qtype: "table",
      badge: "Шаблон 11 · table",
      title: "Интерактивная таблица с пропусками (Информатика №2 / Химия №23)",
      prompt: "Информатика · Задание 2 (фрагмент). Заполните 3 пустые ячейки таблицы истинности логических операций:",
      headers: ["A", "B", "A and B", "A or B"],
      rows: [
        ["0", "1", { slot: 0, choices: ["0", "1"], answer: ["0"] }, { slot: 1, choices: ["0", "1"], answer: ["1"] }],
        ["1", "1", { slot: 2, choices: ["0", "1"], answer: ["1"] }, "1"]
      ],
      explain: "Конъюнкция (A and B) истинна только при A=1 и B=1; дизъюнкция (A or B) истинна, если хотя бы один операнд равен 1."
    },
    {
      id: "tpl-text-pick",
      kind: "test",
      qtype: "text_pick",
      badge: "Шаблон 12 · text_pick",
      title: "Выбор предложений в пронумерованном тексте (ЕГЭ №25 / ОГЭ)",
      prompt: "Русский язык · Задание 25. Нажмите на предложение, которое связано с предыдущим при помощи личного местоимения и лексического повтора:",
      multi: false,
      sentences: [
        "(1) Утром мы вышли к горному озеру.",
        "(2) Вода в озере казалась прозрачной до самого дна.",
        "(3) В ней отражались заснеженные вершины и лёгкие облака.",
        "(4) Тишина стояла такая, что был слышен каждый шаг."
      ],
      answer: [2],
      explain: "Предложение (3) связано со (2): формально — личным местоимением «ней» (= вода из (2)), лексически — описанием воды."
    },
    {
      id: "tpl-code",
      kind: "practice",
      qtype: "code",
      lang: "python",
      badge: "Шаблон 13 · Python",
      title: "Задача на Python с проверкой на тестах (ОГЭ №15.2 / ЕГЭ)",
      prompt: "Информатика · Напишите программу на Python: на вход подаётся число N, а в следующей строке — N целых чисел через пробел. Выведите сумму всех чётных чисел.",
      starterCode: "n = int(input())\nnums = list(map(int, input().split()))\nprint(sum(x for x in nums if x % 2 == 0))",
      tests: [
        { stdin: "5\n1 2 3 4 6\n", expected: "12", hidden: false },
        { stdin: "4\n1 3 5 7\n", expected: "0", hidden: false },
        { stdin: "6\n-2 5 8 10 1 -4\n", expected: "12", hidden: true }
      ],
      explain: "Код запускается на сервере в изолированной песочнице Python 3 (таймаут 2 сек на тест, стандартная библиотека math / itertools / collections доступна)."
    }
  ];

  // Поправляем формулировку второго критерия в self-примере («синтезирует»)
  SAMPLES[8].els[1] = "Указано, что кишечные бактерии синтезируют витамин K";

  function firstEmptyGap(gaps) {
    for (let i = 0; i < gaps.length; i++) {
      if (!gaps[i]) return i;
    }
    return 0;
  }

  function gapCount(step) {
    if (Array.isArray(step.answer)) return step.answer.length;
    const matches = String(step.text || "").match(/\{\{\d+\}\}/g);
    return matches ? matches.length : 0;
  }

  function tableSlots(step) {
    const out = [];
    const rows = Array.isArray(step && step.rows) ? step.rows : [];
    for (let r = 0; r < rows.length; r++) {
      const row = Array.isArray(rows[r]) ? rows[r] : [];
      for (let c = 0; c < row.length; c++) {
        const cell = row[c];
        if (cell && typeof cell === "object" && Number.isInteger(cell.slot)) {
          out.push(cell);
        }
      }
    }
    return out.sort((a, b) => a.slot - b.slot);
  }

  function initAttempt(step) {
    const qtype = (step && step.qtype) || "single";
    if (qtype === "multi" || qtype === "text_pick") return { pick: [], checked: false, ok: false, r: 0 };
    if (qtype === "input") return { input: "", checked: false, ok: false, r: 0 };
    if (qtype === "match") {
      const len = Array.isArray(step.l) ? step.l.length : 0;
      return { pairs: Array.from({ length: len }, () => -1), checked: false, ok: false, r: 0 };
    }
    if (qtype === "order") return { order: [], checked: false, ok: false, r: 0 };
    if (qtype === "gaps") {
      const len = gapCount(step);
      return { gaps: Array.from({ length: len }, () => ""), activeSlot: 0, checked: false, ok: false, r: 0 };
    }
    if (qtype === "punct") return { digits: [], checked: false, ok: false, r: 0 };
    if (qtype === "classify") {
      const len = Array.isArray(step.rows) ? step.rows.length : 0;
      return { cats: Array.from({ length: len }, () => -1), checked: false, ok: false, r: 0 };
    }
    if (qtype === "self") return { text: "", sel: [], revealed: false, checked: false, ok: false, r: 0 };
    if (qtype === "multi_input") {
      const len = Array.isArray(step.fields) ? step.fields.length : 0;
      return { fields: Array.from({ length: len }, () => ""), checked: false, ok: false, r: 0 };
    }
    if (qtype === "table") {
      const slots = tableSlots(step);
      return { cells: Array.from({ length: slots.length }, () => ""), checked: false, ok: false, r: 0 };
    }
    if (qtype === "code") {
      return {
        code: String((step && step.starterCode) || ""),
        running: false,
        runError: "",
        results: null,
        checked: false,
        ok: false,
        r: 0
      };
    }
    return { pick: null, checked: false, ok: false, r: 0 };
  }

  function normalizeAttempt(step, att) {
    if (!att || typeof att !== "object") return initAttempt(step);
    const qtype = (step && step.qtype) || "single";
    if (qtype === "match" && !Array.isArray(att.pairs)) return initAttempt(step);
    if (qtype === "order" && !Array.isArray(att.order)) return initAttempt(step);
    if (qtype === "gaps" && !Array.isArray(att.gaps)) return initAttempt(step);
    if (qtype === "punct" && !Array.isArray(att.digits)) return initAttempt(step);
    if (qtype === "classify" && !Array.isArray(att.cats)) return initAttempt(step);
    if (qtype === "self" && !Array.isArray(att.sel)) return initAttempt(step);
    if (qtype === "multi_input" && !Array.isArray(att.fields)) return initAttempt(step);
    if (qtype === "table" && !Array.isArray(att.cells)) return initAttempt(step);
    if (qtype === "text_pick" && !Array.isArray(att.pick)) return initAttempt(step);
    if (qtype === "code" && typeof att.code !== "string") return initAttempt(step);
    return att;
  }

  function isReady(step, rawAtt) {
    const att = normalizeAttempt(step, rawAtt);
    if (!step) return false;
    const qt = step.qtype || "single";
    if (qt === "code") return !att.running && String(att.code || "").trim().length > 0;
    if (att.checked) return false;
    if (qt === "single") return Number.isInteger(att.pick) && att.pick >= 0;
    if (qt === "multi" || qt === "text_pick") return Array.isArray(att.pick) && att.pick.length > 0;
    if (qt === "input") return String(att.input || "").trim().length > 0;
    if (qt === "match") return Array.isArray(att.pairs) && att.pairs.length > 0 && att.pairs.every((v) => Number.isInteger(v) && v >= 0);
    if (qt === "order") return Array.isArray(att.order) && Array.isArray(step.o) && att.order.length === step.o.length;
    if (qt === "gaps") return Array.isArray(att.gaps) && att.gaps.length > 0 && att.gaps.every((g) => String(g || "").trim().length > 0);
    if (qt === "punct") return !!step.allowEmpty || (Array.isArray(att.digits) && att.digits.length > 0);
    if (qt === "classify") return Array.isArray(att.cats) && att.cats.length > 0 && att.cats.every((v) => Number.isInteger(v) && v >= 0);
    if (qt === "self") return !!att.revealed;
    if (qt === "multi_input") return Array.isArray(att.fields) && att.fields.length > 0 && att.fields.every((v) => String(v || "").trim().length > 0);
    if (qt === "table") return Array.isArray(att.cells) && att.cells.length > 0 && att.cells.every((v) => String(v || "").trim().length > 0);
    return false;
  }

  function checkInputText(step, val) {
    const sub = step.subtype || (step.num ? "number" : (step.d ? "digits" : "word"));
    const ansList = Array.isArray(step.answer) ? step.answer : [step.answer];
    if (sub === "number") {
      const got = parseNum(val);
      if (got == null) return false;
      const tol = Number.isFinite(Number(step.tol)) ? Number(step.tol) : 0.001;
      return ansList.some((a) => {
        const exp = parseNum(a);
        return exp != null && Math.abs(got - exp) <= tol;
      });
    }
    if (sub === "digits") {
      const cleanGot = String(val || "").replace(/\D+/g, "");
      if (!cleanGot) return false;
      if (step.anyOrder) {
        const sortedGot = cleanGot.split("").sort().join("");
        return ansList.some((a) => String(a || "").replace(/\D+/g, "").split("").sort().join("") === sortedGot);
      }
      return ansList.some((a) => String(a || "").replace(/\D+/g, "") === cleanGot);
    }
    return ansList.some((a) => norm(val) === norm(a));
  }

  function evaluate(step, rawAtt) {
    const att = normalizeAttempt(step, rawAtt);
    const qt = step.qtype || "single";
    if (qt === "single") {
      const ok = att.pick === step.answer;
      return { ok, r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    if (qt === "multi" || qt === "text_pick") {
      const got = Array.from(new Set(Array.isArray(att.pick) ? att.pick : [])).sort((a, b) => a - b);
      const exp = Array.from(new Set(Array.isArray(step.answer) ? step.answer : [])).sort((a, b) => a - b);
      const ok = got.length === exp.length && got.every((v, i) => v === exp[i]);
      return { ok, r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    if (qt === "input") {
      const ok = checkInputText(step, att.input);
      return { ok, r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    if (qt === "match") {
      const exp = Array.isArray(step.answer) ? step.answer : [];
      let pts = 0;
      for (let i = 0; i < exp.length; i++) {
        if (att.pairs[i] === exp[i]) pts++;
      }
      const max = exp.length || 1;
      const ok = pts === max;
      const r = ok ? 2 : (pts >= Math.ceil(max / 2) ? 1 : 0);
      return { ok, r, pts, max };
    }
    if (qt === "order") {
      const exp = Array.isArray(step.answer) ? step.answer : [];
      const ok = att.order.length === exp.length && att.order.every((v, i) => v === exp[i]);
      return { ok, r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    if (qt === "gaps") {
      const exp = Array.isArray(step.answer) ? step.answer : [];
      let pts = 0;
      for (let i = 0; i < exp.length; i++) {
        if (normTight(att.gaps[i]) === normTight(exp[i])) pts++;
      }
      const max = exp.length || 1;
      const ok = pts === max;
      const r = ok ? 2 : (pts > 0 ? 1 : 0);
      return { ok, r, pts, max };
    }
    if (qt === "punct") {
      const got = Array.from(new Set((att.digits || []).map(Number))).sort((a, b) => a - b);
      const exp = Array.from(new Set((step.answer || []).map(Number))).sort((a, b) => a - b);
      const ok = got.length === exp.length && got.every((v, i) => v === exp[i]);
      return { ok, r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    if (qt === "classify") {
      const rows = Array.isArray(step.rows) ? step.rows : [];
      let pts = 0;
      for (let i = 0; i < rows.length; i++) {
        if (att.cats[i] === rows[i].answer) pts++;
      }
      const max = rows.length || 1;
      const ok = pts === max;
      const r = ok ? 2 : (pts >= Math.ceil(max / 2) ? 1 : 0);
      return { ok, r, pts, max };
    }
    if (qt === "self") {
      const els = Array.isArray(step.els) ? step.els : [];
      const pts = (att.sel || []).length;
      const max = els.length || 1;
      const r = pts === max ? 2 : (pts >= Math.ceil(max / 2) ? 1 : 0);
      return { ok: true, r, pts, max };
    }
    if (qt === "multi_input") {
      const fields = Array.isArray(step.fields) ? step.fields : [];
      let pts = 0;
      for (let i = 0; i < fields.length; i++) {
        if (checkInputText(fields[i], att.fields[i])) pts++;
      }
      const max = fields.length || 1;
      const ok = pts === max;
      return { ok, r: ok ? 2 : (pts > 0 ? 1 : 0), pts, max };
    }
    if (qt === "table") {
      const slots = tableSlots(step);
      let pts = 0;
      for (let i = 0; i < slots.length; i++) {
        if (checkInputText(slots[i], att.cells[slots[i].slot])) pts++;
      }
      const max = slots.length || 1;
      const ok = pts === max;
      return { ok, r: ok ? 2 : (pts > 0 ? 1 : 0), pts, max };
    }
    if (qt === "code") {
      const res = Array.isArray(att.results) ? att.results : [];
      const max = res.length || (Array.isArray(step.tests) ? step.tests.length : 1);
      const pts = res.filter((x) => x && x.passed).length;
      const ok = !!att.ok;
      return { ok, r: ok ? 2 : (pts > 0 ? 1 : 0), pts, max };
    }
    return { ok: false, r: 0, pts: 0, max: 1 };
  }

  function promptHint(step, att) {
    const qt = step.qtype || "single";
    if (qt === "single") return "Выберите один правильный вариант";
    if (qt === "multi") {
      if (Number.isInteger(step.exactCount) && step.exactCount > 0) {
        const picked = Array.isArray(att.pick) ? att.pick.length : 0;
        return `Выберите ровно ${step.exactCount} ${plural(step.exactCount, "вариант", "варианта", "вариантов")} · выбрано ${picked}/${step.exactCount}`;
      }
      return "Выберите все правильные варианты";
    }
    if (qt === "input") {
      const sub = step.subtype || (step.num ? "number" : (step.d ? "digits" : "word"));
      if (sub === "number") return "Введите число (подойдут и запятая, и точка)";
      if (sub === "digits") return step.anyOrder ? "Введите цифры (в любом порядке)" : "Введите последовательность цифр без пробелов";
      return "Введите слово в поле ниже (регистр не важен)";
    }
    if (qt === "match") return "Нажмите цифру правого столбца напротив каждой строки слева";
    if (qt === "order") return "Нажимайте пункты в нужном порядке 1 → 2 → 3 → … (повторный клик снимает номер)";
    if (qt === "gaps") return "Нажмите на пропуск в тексте и выберите подходящую вставку ниже";
    if (qt === "punct") return "Нажимайте прямо на цифры в предложении, где должна стоять запятая";
    if (qt === "classify") return "Выберите категорию для каждой строки";
    if (qt === "self") return "Запишите тезисы решения, затем сравните с эталоном ФИПИ";
    if (qt === "multi_input") return "Заполните все поля ответа";
    if (qt === "table") return "Заполните все пустые ячейки таблицы";
    if (qt === "text_pick") return step.multi === false ? "Нажмите на одно подходящее предложение в тексте" : "Выберите одно или несколько предложений в тексте";
    if (qt === "code") return "Напишите решение на Python 3 (чтение через input(), вывод через print()) и запустите тесты";
    return "";
  }

  function renderWidget(step, att) {
    const qt = step.qtype || "single";

    if (qt === "single" || qt === "multi") {
      const ansSet = new Set(Array.isArray(step.answer) ? step.answer : [step.answer]);
      const pickedSet = new Set(Array.isArray(att.pick) ? att.pick : (Number.isInteger(att.pick) ? [att.pick] : []));
      return `<div class="opts">${(step.options || []).map((optText, idx) => {
        const isPicked = pickedSet.has(idx);
        const isRight = ansSet.has(idx);
        let cls = "opt";
        let mark = "";
        if (att.checked) {
          if (isPicked && isRight) { cls += " ok"; mark = `<span class="opt-mark">Верно</span>`; }
          else if (isPicked && !isRight) { cls += " bad"; mark = `<span class="opt-mark">Ошибка</span>`; }
          else if (!isPicked && isRight) { cls += " miss"; mark = `<span class="opt-mark">Верный вариант</span>`; }
        }
        return `<button type="button" class="${cls}" data-a="course-opt" data-idx="${idx}" aria-pressed="${isPicked ? "true" : "false"}"${att.checked ? " disabled" : ""}>
          <span class="opt-key">${idx + 1}</span>
          <span>${esc(optText)}</span>
          ${mark}
        </button>`;
      }).join("")}</div>`;
    }

    if (qt === "input") {
      const sub = step.subtype || (step.num ? "number" : (step.d ? "digits" : "word"));
      const im = sub === "number" ? ' inputmode="decimal"' : (sub === "digits" ? ' inputmode="numeric"' : "");
      return `<div class="crs-input-wrap">
        <input id="crs-input" class="answer-input" type="text"${im} autocomplete="off" placeholder="${esc(step.placeholder || "Введите ответ...")}" value="${esc(att.input || "")}"${att.checked ? " disabled" : ""} />
      </div>`;
    }

    if (qt === "match") {
      const rList = Array.isArray(step.r) ? step.r : [];
      const lList = Array.isArray(step.l) ? step.l : [];
      const exp = Array.isArray(step.answer) ? step.answer : [];
      const legend = `<div class="legend-r long">${rList.map((txt, idx) => `<div><b>${idx + 1})</b>${esc(txt)}</div>`).join("")}</div>`;
      const rows = `<div class="mrows">${lList.map((leftTxt, rIdx) => {
        const cur = Number.isInteger(att.pairs[rIdx]) ? att.pairs[rIdx] : -1;
        const okRow = att.checked && cur === exp[rIdx];
        const cls = att.checked ? (okRow ? "mrow ok" : "mrow bad") : "mrow";
        const btns = rList.map((_, oIdx) => `<button type="button" data-a="course-tpl-act" data-op="match" data-row="${rIdx}" data-val="${oIdx}" aria-pressed="${cur === oIdx ? "true" : "false"}"${att.checked ? " disabled" : ""}>${oIdx + 1}</button>`).join("");
        const fix = att.checked && !okRow && Number.isInteger(exp[rIdx])
          ? `<div class="mrow-fix">Верно: <b>${exp[rIdx] + 1})</b> ${esc(rList[exp[rIdx]] || "")}</div>`
          : "";
        return `<div class="${cls}"><div>${esc(leftTxt)}</div><div class="seg" role="group">${btns}</div>${fix}</div>`;
      }).join("")}</div>`;
      const codeStr = lList.map((_, i) => `${LETTERS[i] || (i + 1)}:${att.pairs[i] >= 0 ? (att.pairs[i] + 1) : "—"}`).join(" · ");
      const preview = `<div class="crs-code-preview tabular-nums"><span>Ваш код:</span> <b>${esc(codeStr)}</b></div>`;
      return `${legend}${rows}${preview}`;
    }

    if (qt === "order") {
      const items = Array.isArray(step.o) ? step.o : [];
      const exp = Array.isArray(step.answer) ? step.answer : [];
      const pool = `<div class="order-pool">${items.map((txt, idx) => {
        const pos = att.order.indexOf(idx);
        let cls = "ord";
        if (att.checked) cls += exp[pos] === idx ? " ok" : " bad";
        return `<button type="button" class="${cls}" data-a="course-tpl-act" data-op="order" data-idx="${idx}"${pos >= 0 ? ` data-n="${pos + 1}"` : ""}${att.checked ? " disabled" : ""}>
          <span class="opt-key tabular-nums">${pos >= 0 ? (pos + 1) : "·"}</span>
          <span>${esc(txt)}</span>
        </button>`;
      }).join("")}</div>`;
      const codeNums = att.order.length ? att.order.map((i) => i + 1).join(" → ") : "пока не выбрано";
      const clearBtn = !att.checked && att.order.length
        ? `<button type="button" class="btn sm" data-a="course-tpl-act" data-op="order-clear">Сбросить</button>`
        : "";
      const expHint = att.checked && !att.ok
        ? `<div class="small muted">Верная последовательность: <b>${exp.map((i) => (i + 1) + ") " + esc(items[i])).join(" → ")}</b></div>`
        : "";
      return `${pool}<div class="crs-code-preview tabular-nums"><span>Порядок: <b>${esc(codeNums)}</b></span>${clearBtn}</div>${expHint}`;
    }

    if (qt === "gaps") {
      const parts = String(step.text || "").split(/(\{\{\d+\}\})/g);
      const exp = Array.isArray(step.answer) ? step.answer : [];
      const renderedText = parts.map((chunk) => {
        const m = /^\{\{(\d+)\}\}$/.exec(chunk);
        if (!m) return esc(chunk);
        const sIdx = Number(m[1]);
        const filled = String(att.gaps[sIdx] || "");
        const active = !att.checked && att.activeSlot === sIdx;
        let cls = "crs-gap-slot";
        if (active) cls += " is-active";
        if (filled) cls += " is-filled";
        if (att.checked) cls += normTight(filled) === normTight(exp[sIdx]) ? " ok" : " bad";
        return `<button type="button" class="${cls}" data-a="course-tpl-act" data-op="gap-slot" data-slot="${sIdx}"${att.checked ? " disabled" : ""}>${esc(filled ? filled : `${sIdx + 1}?`)}</button>`;
      }).join("");
      const bank = `<div class="crs-gap-bank" role="group" aria-label="Варианты для подстановки">${(step.bank || []).map((val) => {
        return `<button type="button" class="crs-gap-chip" data-a="course-tpl-act" data-op="gap-chip" data-val="${esc(val)}"${att.checked ? " disabled" : ""}>${esc(val)}</button>`;
      }).join("")}</div>`;
      const expLine = att.checked && !att.ok
        ? `<div class="small muted">Верные вставки: <b>${exp.map((v, i) => (i + 1) + ") " + esc(v)).join(" · ")}</b></div>`
        : "";
      return `<div class="crs-gaps-text">${renderedText}</div>${bank}${expLine}`;
    }

    if (qt === "punct") {
      const parts = String(step.text || "").split(/(\{\{\d+\}\})/g);
      const picked = new Set((att.digits || []).map(Number));
      const exp = new Set((step.answer || []).map(Number));
      const renderedText = parts.map((chunk) => {
        const m = /^\{\{(\d+)\}\}$/.exec(chunk);
        if (!m) return esc(chunk);
        const num = Number(m[1]);
        const isOn = picked.has(num);
        const isRight = exp.has(num);
        let cls = "crs-punct-pin";
        if (att.checked) {
          if (isOn && isRight) cls += " ok";
          else if (isOn && !isRight) cls += " bad";
          else if (!isOn && isRight) cls += " miss";
        }
        return `<button type="button" class="${cls}" data-a="course-tpl-act" data-op="punct" data-num="${num}" aria-pressed="${isOn ? "true" : "false"}"${att.checked ? " disabled" : ""}>(${num})${isOn ? "," : ""}</button>`;
      }).join("");
      const sortedDigits = Array.from(picked).sort((a, b) => a - b);
      const preview = `<div class="crs-code-preview tabular-nums"><span>Запятые на месте цифр:</span> <b>${sortedDigits.length ? sortedDigits.join(", ") : "не выбрано"}</b></div>`;
      return `<div class="crs-punct-text">${renderedText}</div>${preview}`;
    }

    if (qt === "classify") {
      const cats = Array.isArray(step.cats) ? step.cats : [];
      const rows = Array.isArray(step.rows) ? step.rows : [];
      return `<div class="crs-classify-list">${rows.map((row, rIdx) => {
        const cur = Number.isInteger(att.cats[rIdx]) ? att.cats[rIdx] : -1;
        const okRow = att.checked && cur === row.answer;
        const cls = att.checked ? (okRow ? "crs-classify-row ok" : "crs-classify-row bad") : "crs-classify-row";
        const btns = cats.map((catName, cIdx) => {
          return `<button type="button" class="crs-classify-btn" data-a="course-tpl-act" data-op="classify" data-row="${rIdx}" data-val="${cIdx}" aria-pressed="${cur === cIdx ? "true" : "false"}"${att.checked ? " disabled" : ""}>${esc(catName)}</button>`;
        }).join("");
        const fix = att.checked && !okRow ? `<div class="small muted crs-classify-fix">Верно: <b>${esc(cats[row.answer] || "")}</b></div>` : "";
        return `<div class="${cls}"><div class="crs-classify-text">${esc(row.text || "")}${fix}</div><div class="crs-classify-btns" role="group">${btns}</div></div>`;
      }).join("")}</div>`;
    }

    if (qt === "self") {
      const els = Array.isArray(step.els) ? step.els : [];
      const area = `<textarea id="crs-self-text" class="input crs-self-area" rows="4" placeholder="${esc(step.placeholder || "Запишите решение или ключевые тезисы...")}"${att.checked ? " disabled" : ""}>${esc(att.text || "")}</textarea>`;
      if (!att.revealed) {
        return `${area}<div class="crs-step-actions"><button type="button" class="btn primary" data-a="course-tpl-act" data-op="self-reveal">${icon("eye")}<span>Показать эталон и критерии</span></button></div>`;
      }
      const refLines = String(step.ref || "").split("\n").map((line) => `<p>${esc(line)}</p>`).join("");
      const selSet = new Set(att.sel || []);
      const critHtml = els.map((label, cIdx) => {
        const on = selSet.has(cIdx);
        return `<button type="button" class="opt${on ? " ok" : ""}" data-a="course-tpl-act" data-op="self-crit" data-idx="${cIdx}" aria-pressed="${on ? "true" : "false"}"${att.checked ? " disabled" : ""}>
          <span class="opt-key">${on ? "✓" : cIdx + 1}</span>
          <span>${esc(label)}</span>
        </button>`;
      }).join("");
      return `${area}
        <div class="crs-self-ref">
          <div class="crs-callout-title">${icon("book")}<span>Эталонный ответ ФИПИ</span></div>
          <div class="crs-self-ref-body">${refLines}</div>
        </div>
        <div class="crs-self-crit">
          <div class="crs-self-crit-head"><b>Критерии самопроверки: отметьте, что есть в вашем ответе</b><span class="crs-head-stat tabular-nums">${selSet.size}/${els.length}</span></div>
          <div class="opts">${critHtml}</div>
        </div>`;
    }

    if (qt === "multi_input") {
      const fields = Array.isArray(step.fields) ? step.fields : [];
      return `<div class="crs-mi-grid">${fields.map((f, idx) => {
        const val = String((att.fields && att.fields[idx]) || "");
        const okField = att.checked && checkInputText(f, val);
        const cls = att.checked ? (okField ? "crs-mi-field ok" : "crs-mi-field bad") : "crs-mi-field";
        const sub = f.subtype || "word";
        const im = sub === "number" ? ' inputmode="decimal"' : (sub === "digits" ? ' inputmode="numeric"' : "");
        const exp = Array.isArray(f.answer) ? f.answer[0] : f.answer;
        const fix = att.checked && !okField ? `<span class="small muted">Верно: <b>${esc(exp)}</b></span>` : "";
        return `<label class="${cls}">
          <span class="small muted"><b>${esc(f.label || ("Поле " + (idx + 1)))}</b></span>
          <input class="input" type="text"${im} autocomplete="off" data-crs-input="mi" data-idx="${idx}" placeholder="${esc(f.placeholder || "")}" value="${esc(val)}"${att.checked ? " disabled" : ""} />
          ${fix}
        </label>`;
      }).join("")}</div>`;
    }

    if (qt === "table") {
      const headers = Array.isArray(step.headers) ? step.headers : [];
      const rows = Array.isArray(step.rows) ? step.rows : [];
      const thead = headers.length ? `<thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead>` : "";
      const tbody = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => {
        if (!cell || typeof cell !== "object" || !Number.isInteger(cell.slot)) {
          return `<td>${esc(cell)}</td>`;
        }
        const sIdx = cell.slot;
        const val = String((att.cells && att.cells[sIdx]) || "");
        const okCell = att.checked && checkInputText(cell, val);
        if (Array.isArray(cell.choices) && cell.choices.length) {
          const cls = `crs-tbl-cell-btn${att.checked ? (okCell ? " ok" : " bad") : ""}`;
          return `<td><button type="button" class="${cls}" data-a="course-tpl-act" data-op="table-cycle" data-slot="${sIdx}"${att.checked ? " disabled" : ""}>${esc(val || "?")}</button></td>`;
        }
        const cls = `input crs-tbl-input${att.checked ? (okCell ? " ok" : " bad") : ""}`;
        return `<td><input class="${cls}" type="text" autocomplete="off" data-crs-input="tbl" data-slot="${sIdx}" value="${esc(val)}"${att.checked ? " disabled" : ""} /></td>`;
      }).join("")}</tr>`).join("")}</tbody>`;
      return `<div class="qtbl-wrap"><table class="qtbl">${thead}${tbody}</table></div>`;
    }

    if (qt === "text_pick") {
      const sents = Array.isArray(step.sentences) ? step.sentences : [];
      const pickedSet = new Set(Array.isArray(att.pick) ? att.pick : []);
      const expSet = new Set(Array.isArray(step.answer) ? step.answer : []);
      const listHtml = sents.map((txt, idx) => {
        const isOn = pickedSet.has(idx);
        const isRight = expSet.has(idx);
        let cls = "crs-sent-btn";
        if (att.checked) {
          if (isOn && isRight) cls += " ok";
          else if (isOn && !isRight) cls += " bad";
          else if (!isOn && isRight) cls += " miss";
        }
        return `<button type="button" class="${cls}" data-a="course-tpl-act" data-op="text-pick" data-idx="${idx}" aria-pressed="${isOn ? "true" : "false"}"${att.checked ? " disabled" : ""}>${esc(txt)}</button>`;
      }).join("");
      const nums = Array.from(pickedSet).sort((a, b) => a - b).map((i) => i + 1);
      return `<div class="crs-passage-pick">${listHtml}</div>
        <div class="crs-code-preview tabular-nums"><span>Выбрано:</span> <b>${nums.length ? nums.join(", ") : "ничего"}</b></div>`;
    }

    if (qt === "code") {
      const openTests = (step.tests || []).filter((t) => !t.hidden);
      const exHtml = openTests.length
        ? `<div class="qtbl-wrap crs-code-examples"><table class="qtbl"><thead><tr><th>Ввод (stdin)</th><th>Ожидаемый вывод</th></tr></thead><tbody>${openTests.map((t) => `<tr><td><pre class="crs-pre">${esc((t.stdin || "").trim() || "—")}</pre></td><td><pre class="crs-pre">${esc((t.expected || "").trim())}</pre></td></tr>`).join("")}</tbody></table></div>`
        : "";
      const editor = `<textarea id="crs-code-editor" class="input crs-code-editor" rows="6" spellcheck="false"${att.running ? " disabled" : ""}>${esc(att.code || "")}</textarea>`;
      const runLabel = att.running ? "Выполняется…" : "Запустить и проверить (Python)";
      const actions = `<div class="crs-step-actions">
        <button type="button" class="btn primary" id="crs-check-btn" data-a="course-code-run"${isReady(step, att) ? "" : " disabled"}>${icon("check")}<span>${runLabel}</span></button>
        <button type="button" class="btn sm" data-a="course-tpl-act" data-op="code-reset"${att.running ? " disabled" : ""}>${icon("repeat")}<span>Сбросить шаблон</span></button>
      </div>`;
      const errBox = att.runError ? `<div class="crs-code-err">${esc(att.runError)}</div>` : "";
      const resList = Array.isArray(att.results) ? att.results : [];
      const resHtml = resList.length
        ? `<div class="crs-code-results">${resList.map((r) => {
          const badge = r.passed ? "Пройден" : (r.error ? "Ошибка" : "Неверный ответ");
          const details = r.hidden
            ? `<span class="small muted">Скрытый тест</span>`
            : `<span class="small muted">${r.error ? esc(r.error) : `Ожидалось: <code>${esc(r.expected)}</code> · Получено: <code>${esc(r.actual || "пусто")}</code>`}</span>`;
          return `<div class="crs-code-res-row ${r.passed ? "ok" : "bad"}">
            <span class="tabular-nums"><b>Тест ${r.index}</b> · ${badge} (${r.timeMs} мс)</span>
            ${details}
          </div>`;
        }).join("")}</div>`
        : "";
      return `${exHtml}${editor}${actions}${errBox}${resHtml}`;
    }

    return "";
  }

  function renderBody(step, rawAtt, opts) {
    opts = opts || {};
    const att = normalizeAttempt(step, rawAtt);
    const isDone = !!opts.isDone;
    const hasNext = !!opts.hasNext;
    const checkAction = opts.checkAction || "course-check";
    const retryAction = opts.retryAction || "course-retry";
    const nextAction = opts.nextAction || "course-next";
    const hideNext = !!opts.hideNext;

    const hint = promptHint(step, att);
    const widget = renderWidget(step, att);
    const ready = isReady(step, att);
    const qt = step.qtype || "single";

    let actionHtml = "";
    if (qt === "code") {
      if (att.checked) {
        const res = evaluate(step, att);
        const rAttr = att.ok ? "2" : "0";
        const fbTitle = att.ok
          ? `Все тесты пройдены (${res.pts}/${res.max})`
          : `Пройдено тестов: ${res.pts} из ${res.max}`;
        const nextBtn = att.ok && !hideNext && hasNext
          ? `<div class="crs-step-actions"><button type="button" class="btn primary" data-a="${esc(nextAction)}">Следующий шаг${icon("arrow")}</button></div>`
          : "";
        actionHtml = `<div class="feedback" data-r="${rAttr}">
          <div class="fb-title">${icon(att.ok ? "check" : "alert")}<span>${fbTitle}</span></div>
          <p class="small">${esc(step.explain || "")}</p>
        </div>${nextBtn}`;
      }
    } else if (qt === "self" && !att.revealed && !att.checked) {
      actionHtml = "";
    } else if (!att.checked) {
      const checkLabel = qt === "self" ? "Засчитать самопроверку" : "Проверить ответ";
      actionHtml = `<div class="crs-step-actions">
        <button type="button" class="btn primary" id="crs-check-btn" data-a="${esc(checkAction)}"${ready ? "" : " disabled"}>${icon("check")}<span>${checkLabel}</span></button>
      </div>`;
    } else {
      const rAttr = String(att.r != null ? att.r : (att.ok ? 2 : 0));
      let fbTitle = att.ok ? "Верно! Шаг засчитан" : "Есть ошибка — разберём правило";
      if (qt === "self") {
        const res = evaluate(step, att);
        fbTitle = `Самопроверка завершена: ${res.pts} из ${res.max} ${plural(res.max, "балла", "баллов", "баллов")}`;
      } else if (!att.ok && rAttr === "1") {
        fbTitle = "Частично верно — посмотрите детали ниже";
      }
      const nextBtn = !hideNext && hasNext
        ? `<button type="button" class="btn primary" data-a="${esc(nextAction)}">Следующий шаг${icon("arrow")}</button>`
        : "";
      const retryBtn = `<button type="button" class="btn${att.ok ? "" : " primary"}" data-a="${esc(retryAction)}">${icon("repeat")}<span>${att.ok ? "Решить ещё раз" : "Попробовать снова"}</span></button>`;
      const btns = att.ok ? (nextBtn ? nextBtn : retryBtn) : retryBtn;

      actionHtml = `<div class="feedback" data-r="${rAttr}">
        <div class="fb-title">${icon(att.ok ? "check" : "alert")}<span>${fbTitle}</span></div>
        <p class="small">${esc(step.explain || "")}</p>
      </div>
      ${btns ? `<div class="crs-step-actions">${btns}</div>` : ""}`;
    }

    const doneNote = isDone && !att.checked
      ? `<div class="small muted crs-done-note">${icon("check")}<span>Этот шаг уже засчитан. Можете пройти его ещё раз или перейти дальше.</span></div>`
      : "";

    return `<p class="qtext">${esc(step.prompt || "")}</p>
      <div class="small muted">${esc(hint)}</div>
      ${widget}
      ${actionHtml}
      ${doneNote}`;
  }

  function handleAction(op, el, step, rawAtt) {
    if (!step) return false;
    const att = normalizeAttempt(step, rawAtt);
    const qt = step.qtype || "single";
    const ds = (el && el.dataset) || {};

    if (op === "code-reset" && qt === "code") {
      if (att.running) return false;
      att.code = String(step.starterCode || "");
      att.results = null;
      att.runError = "";
      att.checked = false;
      att.ok = false;
      att.r = 0;
      return true;
    }

    if (att.checked) return false;

    if (op === "opt") {
      const idx = Number(ds.idx);
      if (!Number.isInteger(idx) || idx < 0) return false;
      if (qt === "single") {
        att.pick = idx;
        return true;
      }
      if (qt === "multi") {
        const cur = Array.isArray(att.pick) ? att.pick.slice() : [];
        const pos = cur.indexOf(idx);
        if (pos >= 0) cur.splice(pos, 1);
        else cur.push(idx);
        cur.sort((a, b) => a - b);
        att.pick = cur;
        return true;
      }
      return false;
    }

    if (op === "match" && qt === "match") {
      const rIdx = Number(ds.row);
      const val = Number(ds.val);
      if (!Number.isInteger(rIdx) || rIdx < 0 || rIdx >= att.pairs.length || !Number.isInteger(val) || val < 0) return false;
      att.pairs[rIdx] = att.pairs[rIdx] === val ? -1 : val;
      return true;
    }

    if (op === "order" && qt === "order") {
      const idx = Number(ds.idx);
      if (!Number.isInteger(idx) || idx < 0) return false;
      const pos = att.order.indexOf(idx);
      if (pos >= 0) att.order.splice(pos, 1);
      else att.order.push(idx);
      return true;
    }

    if (op === "order-clear" && qt === "order") {
      att.order = [];
      return true;
    }

    if (op === "gap-slot" && qt === "gaps") {
      const sIdx = Number(ds.slot);
      if (!Number.isInteger(sIdx) || sIdx < 0 || sIdx >= att.gaps.length) return false;
      if (att.gaps[sIdx]) att.gaps[sIdx] = "";
      att.activeSlot = sIdx;
      return true;
    }

    if (op === "gap-chip" && qt === "gaps") {
      const val = String(ds.val || "");
      if (!val || !att.gaps.length) return false;
      const target = Number.isInteger(att.activeSlot) && att.activeSlot >= 0 && att.activeSlot < att.gaps.length
        ? att.activeSlot
        : firstEmptyGap(att.gaps);
      att.gaps[target] = val;
      att.activeSlot = firstEmptyGap(att.gaps);
      return true;
    }

    if (op === "punct" && qt === "punct") {
      const num = Number(ds.num);
      if (!Number.isInteger(num)) return false;
      const pos = att.digits.indexOf(num);
      if (pos >= 0) att.digits.splice(pos, 1);
      else att.digits.push(num);
      att.digits.sort((a, b) => a - b);
      return true;
    }

    if (op === "classify" && qt === "classify") {
      const rIdx = Number(ds.row);
      const val = Number(ds.val);
      if (!Number.isInteger(rIdx) || rIdx < 0 || rIdx >= att.cats.length || !Number.isInteger(val) || val < 0) return false;
      att.cats[rIdx] = att.cats[rIdx] === val ? -1 : val;
      return true;
    }

    if (op === "self-reveal" && qt === "self") {
      att.revealed = true;
      return true;
    }

    if (op === "self-crit" && qt === "self") {
      const idx = Number(ds.idx);
      if (!Number.isInteger(idx) || idx < 0) return false;
      const pos = att.sel.indexOf(idx);
      if (pos >= 0) att.sel.splice(pos, 1);
      else att.sel.push(idx);
      att.sel.sort((a, b) => a - b);
      return true;
    }

    if (op === "table-cycle" && qt === "table") {
      const sIdx = Number(ds.slot);
      const cell = tableSlots(step).find((x) => x.slot === sIdx);
      if (!cell || !Array.isArray(cell.choices) || !cell.choices.length) return false;
      const cur = String(att.cells[sIdx] || "");
      const pos = cell.choices.indexOf(cur);
      att.cells[sIdx] = cell.choices[(pos + 1) % cell.choices.length];
      return true;
    }

    if (op === "text-pick" && qt === "text_pick") {
      const idx = Number(ds.idx);
      if (!Number.isInteger(idx) || idx < 0) return false;
      if (step.multi === false) {
        att.pick = [idx];
      } else {
        const cur = Array.isArray(att.pick) ? att.pick.slice() : [];
        const pos = cur.indexOf(idx);
        if (pos >= 0) cur.splice(pos, 1);
        else cur.push(idx);
        cur.sort((a, b) => a - b);
        att.pick = cur;
      }
      return true;
    }

    return false;
  }

  function handleInput(id, val, step, rawAtt, ds) {
    if (!step) return false;
    const att = normalizeAttempt(step, rawAtt);
    if (att.checked && step.qtype !== "code") return false;
    if (id === "crs-input" && step.qtype === "input") {
      att.input = String(val == null ? "" : val);
      return true;
    }
    if (id === "crs-self-text" && step.qtype === "self") {
      att.text = String(val == null ? "" : val);
      return true;
    }
    if (id === "crs-code-editor" && step.qtype === "code") {
      att.code = String(val == null ? "" : val);
      return true;
    }
    const crsType = ds && ds.crsInput;
    if (crsType === "mi" && step.qtype === "multi_input") {
      const idx = Number(ds.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= att.fields.length) return false;
      att.fields[idx] = String(val == null ? "" : val);
      return true;
    }
    if (crsType === "tbl" && step.qtype === "table") {
      const sIdx = Number(ds.slot);
      if (!Number.isInteger(sIdx) || sIdx < 0 || sIdx >= att.cells.length) return false;
      att.cells[sIdx] = String(val == null ? "" : val);
      return true;
    }
    return false;
  }

  EGE.courseTemplates = {
    CATALOG,
    SAMPLES,
    initAttempt,
    isReady,
    evaluate,
    renderBody,
    handleAction,
    handleInput
  };
})();
