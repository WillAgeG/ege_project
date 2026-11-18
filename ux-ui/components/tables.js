/* Универсальный авто-адаптивный табличный движок (1..15+ колонок) UI Kit (EGE.charts). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc } = EGE.utils || { esc: (s) => String(s == null ? "" : s) };

  const TABLE_ROWS = [
    { id: "tbl-1", student: "Алёна Егорова", subjectId: "bio", subject: "Биология · ЕГЭ", city: "Якутск (UTC+9)", slot: "Сб · 14:00", rate: 1100, net: 1045, status: "accepted", statusLabel: "Подтверждено ✓", whatsapp: "79142100102", telegram: "alena_bio_ykt", maxHandle: "alena_ykt" },
    { id: "tbl-2", student: "Дамир Осипов", subjectId: "chem", subject: "Химия · ЕГЭ", city: "Якутск (UTC+9)", slot: "Вс · 10:00", rate: 1200, net: 1140, status: "accepted", statusLabel: "Подтверждено ✓", whatsapp: "79142100104", telegram: "damir_chem", maxHandle: "damir_osipov" },
    { id: "tbl-3", student: "Саяна Кычкина", subjectId: "bio", subject: "Биология · Пробный 0 ₽", city: "Москва (UTC+3)", slot: "Пн · 18:00", rate: 950, net: 903, status: "trial", statusLabel: "Пробный · старт 5к", whatsapp: "79142100106", telegram: "sayana_msk", maxHandle: "sayana_k" },
    { id: "tbl-4", student: "Тимур Платонов", subjectId: "chem", subject: "Химия · Медвуз", city: "Якутск (UTC+9)", slot: "Вт · 16:00", rate: 1400, net: 1330, status: "pending", statusLabel: "Ждёт ответа", whatsapp: "79142100108", telegram: "timur_med", maxHandle: "timur_p" },
    { id: "tbl-5", student: "Мария Фёдорова", subjectId: "bio", subject: "Биология · ОГЭ 9 кл.", city: "Якутск (UTC+9)", slot: "Чт · 17:00", rate: 1000, net: 950, status: "accepted", statusLabel: "Подтверждено ✓", whatsapp: "79142100110", telegram: "maria_oge", maxHandle: "maria_f" },
    { id: "tbl-6", student: "Ньургун Иванов", subjectId: "chem", subject: "Химия · Олимпиада", city: "Москва (UTC+3)", slot: "Пт · 19:00", rate: 1500, net: 1425, status: "pending", statusLabel: "Ждёт ответа", whatsapp: "79142100112", telegram: "nyurgun_chem", maxHandle: "nyurgun_i" }
  ];

  const PAYOUT_ROWS = [
    { id: "pay-1", date: "14.05.2026", channel: "sbp", method: "СБП · Т-Банк", requisites: "+7 (914) 210-••-11", gross: 12000, fee: 600, amount: 11400, receipt: "Чек № 88412-НПД", status: "accepted", statusLabel: "Выплачено ✓" },
    { id: "pay-2", date: "10.05.2026", channel: "card", method: "Карта Мир · Сбер", requisites: "2200 70•• •••• 4812", gross: 8000, fee: 400, amount: 7600, receipt: "Чек № 88305-НПД", status: "accepted", statusLabel: "Выплачено ✓" },
    { id: "pay-3", date: "15.05.2026", channel: "sbp", method: "СБП · АЭБ (Якутск)", requisites: "+7 (914) 210-••-11", gross: 5000, fee: 250, amount: 4750, receipt: "Ожидает чек НПД", status: "pending", statusLabel: "На проверке" },
    { id: "pay-4", date: "03.05.2026", channel: "sbp", method: "СБП · ВТБ", requisites: "+7 (914) 210-••-11", gross: 2400, fee: 0, amount: 2400, receipt: "Сторно отмены 100%", status: "refund", statusLabel: "Возврат ученику" },
    { id: "pay-5", date: "12.05.2026", channel: "sbp", method: "СБП · Озон Банк", requisites: "+7 (924) 550-••-90", gross: 3600, fee: 180, amount: 3420, receipt: "Сформирован НПД", status: "info", statusLabel: "Готов к выводу" }
  ];

  const EXAM_ROWS = [
    { id: "ex-1", date: "14.05", subjectId: "bio", subject: "Биология · ЕГЭ-2027", variant: "Вариант № 12 · Генетика", score: 86, maxScore: 100, essayNote: "Линия 28 без ошибок", examDate: "15 июн 2027", status: "accepted", statusLabel: "Зачтено ✓" },
    { id: "ex-2", date: "12.05", subjectId: "rus", subject: "Русский язык · Зад. 27", variant: "Сочинение · Текст Лихачёва", score: 21, maxScore: 22, essayNote: "21 / 22 б. (К1–К10)", examDate: "4 июн 2027", status: "accepted", statusLabel: "ИИ проверено ✓" },
    { id: "ex-3", date: "11.05", subjectId: "chem", subject: "Химия · ЕГЭ-2027", variant: "Задача 34 + ОВР блок", score: 78, maxScore: 100, essayNote: "Повторить расчёт примесей", examDate: "1 июн 2027", status: "trial", statusLabel: "Доработка" },
    { id: "ex-4", date: "15.05", subjectId: "rus", subject: "Русский язык · Зад. 27", variant: "Сочинение · Текст Паустовского", score: 19, maxScore: 22, essayNote: "19 / 22 б. · доработать К3", examDate: "4 июн 2027", status: "pending", statusLabel: "Ждёт проверки" },
    { id: "ex-5", date: "08.05", subjectId: "bio", subject: "Биология · Линия 28", variant: "Синтез белка и митоз", score: 91, maxScore: 100, essayNote: "Рекомендация ИИ: тайминг", examDate: "15 июн 2027", status: "info", statusLabel: "Рекомендация ИИ" }
  ];

  const STUDENT_ROWS = [
    { id: "st-1", student: "Алёна Егорова", subjectId: "bio", subject: "Биология · ЕГЭ", city: "Якутск (UTC+9)", nextSlot: "Вс · 10:00", scoreStart: 58, scoreCur: 84, scoreTarget: 90, autoNotify: "Авто: WA · TG · MAX · за 24 ч", status: "accepted", statusLabel: "Активен ✓", whatsapp: "79142100511", telegram: "@alina_bio", maxHandle: "alena_ege" },
    { id: "st-2", student: "Дамир Осипов", subjectId: "chem", subject: "Химия · ЕГЭ", city: "Якутск (UTC+9)", nextSlot: "Ср · 16:00", scoreStart: 52, scoreCur: 76, scoreTarget: 85, autoNotify: "Авто: TG · за 2 ч", status: "accepted", statusLabel: "Активен ✓", whatsapp: "79142100104", telegram: "@damir_chem", maxHandle: "damir_osipov" },
    { id: "st-3", student: "Саяна Кычкина", subjectId: "bio", subject: "Биология · Линия 28", city: "Москва (UTC+3)", nextSlot: "Пн · 18:00", scoreStart: 46, scoreCur: 68, scoreTarget: 82, autoNotify: "Авто: WA · MAX · за 24 ч", status: "pending", statusLabel: "Ждёт урока", whatsapp: "79142100106", telegram: "@sayana_msk", maxHandle: "sayana_k" },
    { id: "st-4", student: "Тимур Платонов", subjectId: "chem", subject: "Химия · Медвуз", city: "Якутск (UTC+9)", nextSlot: "Чт · 14:00", scoreStart: 64, scoreCur: 88, scoreTarget: 95, autoNotify: "Авто: WA · TG · за 1 ч", status: "accepted", statusLabel: "Активен ✓", whatsapp: "79142100108", telegram: "@timur_med", maxHandle: "timur_p" },
    { id: "st-5", student: "Мария Фёдорова", subjectId: "rus", subject: "Русский · Зад. 27", city: "Москва (UTC+3)", nextSlot: "Пт · 19:00", scoreStart: 61, scoreCur: 81, scoreTarget: 91, autoNotify: "Без авто · ручное напоминание", status: "trial", statusLabel: "Пробный этап", whatsapp: "79142100110", telegram: "@maria_rus", maxHandle: "maria_f" }
  ];

  const ADMIN_ROWS = [
    { id: "adm-1", category: "moderation", entity: "Айтал Борисов · Биология", kind: "Анкета репетитора", subject: "Биология · ЕГЭ", city: "Якутск (UTC+9)", updatedAt: "14:42", amount: "1 200 ₽/ч", outbox: "vektor.market.bids.v1", modStatus: "pending", status: "pending", statusLabel: "На проверке" },
    { id: "adm-2", category: "moderation", entity: "Анна Соколова · Химия", kind: "Верификация диплома", subject: "Химия · Медвуз", city: "Москва (UTC+3)", updatedAt: "14:28", amount: "1 600 ₽/ч", outbox: "vektor.market.bids.v1", modStatus: "verified", status: "accepted", statusLabel: "Проверен ✓" },
    { id: "adm-3", category: "payouts", entity: "Выплата #4812 · СБП Т-Банк", kind: "Вывод НПД", subject: "Комиссия 5% · на руки 95%", city: "Якутск (UTC+9)", updatedAt: "14:15", amount: "11 400 ₽", outbox: "vektor.payments.ledger.v1", modStatus: "paid", status: "accepted", statusLabel: "Выплачено ✓" },
    { id: "adm-4", category: "payouts", entity: "Эскроу #9031 · Артём И.", kind: "Резерв эскроу", subject: "Удержание до 16:00", city: "Якутск (UTC+9)", updatedAt: "13:55", amount: "1 140 ₽", outbox: "vektor.payments.ledger.v1", modStatus: "frozen", status: "info", statusLabel: "В резерве" },
    { id: "adm-5", category: "system", entity: "Outbox #41820 · Clickstream", kind: "Событие Kafka", subject: "batch=18 · PG17 → Kafka", city: "Cluster · PG17", updatedAt: "13:40", amount: "0.8 ms", outbox: "vektor.user.clickstream.v1", modStatus: "published", status: "accepted", statusLabel: "Отправлено в Kafka" },
    { id: "adm-6", category: "moderation", entity: "Иван К. · Дубликат Ykt/TG", kind: "Проверка жалобы", subject: "Физика · 800 ₽/ч", city: "Якутск (UTC+9)", updatedAt: "13:12", amount: "800 ₽/ч", outbox: "vektor.market.bids.v1", modStatus: "flagged", status: "pending", statusLabel: "Требует внимания" }
  ];

  function tableStatusClass(st) {
    if (st === "accepted" || st === "paid" || st === "done") return "is-confirmed";
    if (st === "trial") return "is-trial";
    if (st === "refund" || st === "refunded" || st === "canceled") return "is-refund";
    if (st === "info" || st === "ready") return "is-info";
    return "is-pending";
  }

  function isRowConfirmed(id, confirmedIds) {
    if (!id || !confirmedIds) return false;
    if (Array.isArray(confirmedIds)) return confirmedIds.indexOf(id) >= 0;
    return !!confirmedIds[id];
  }

  function buildRequestColumns(cols) {
    return [
      {
        key: "studentCompact",
        label: "Ученик и предмет",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.student)}</b><span class="small muted">${esc(r.subject)} · ${esc(r.slot)}</span></div>`
      },
      {
        key: "student",
        label: "Ученик",
        minCols: 5,
        render: (r) => `<b>${esc(r.student)}</b>`
      },
      {
        key: "subject",
        label: "Предмет",
        minCols: 5,
        render: (r) => cols === 5
          ? `<div class="stack" style="gap:2px"><span>${esc(r.subject)}</span><span class="small muted">${esc(r.city)}</span></div>`
          : esc(r.subject)
      },
      {
        key: "city",
        label: "Город",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.city)}</span>`
      },
      {
        key: "slot",
        label: cols === 5 ? "Слот (UTC)" : "Слот",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.slot)}</span>`
      },
      {
        key: "rate",
        label: "Ставка",
        num: true,
        render: (r) => `<b class="num">${Number(r.rate || 0).toLocaleString("ru-RU")} ₽/ч</b>`
      },
      {
        key: "net",
        label: "На руки (95%)",
        minCols: 7,
        num: true,
        render: (r) => `<b class="num" style="color:var(--confirm)">${Number(r.net || 0).toLocaleString("ru-RU")} ₽</b>`
      },
      {
        key: "contactOnly",
        label: "Связь (WA · TG · MAX)",
        maxCols: 3,
        isActions: true,
        render: (r, h) => h.messengerHTML(r)
      },
      {
        key: "statusAndContact",
        label: "Статус и связь",
        minCols: 5,
        isActions: true,
        render: (r, h) => `<div class="stack" style="gap:6px">${h.statusHTML(r)}${h.messengerHTML(r)}</div>`
      }
    ];
  }

  function buildPayoutColumns() {
    return [
      {
        key: "dateCompact",
        label: "Дата и способ",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b class="num">${esc(r.date)}</b><span class="small muted">${esc(r.method)}</span></div>`
      },
      {
        key: "date",
        label: "Дата",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.date)}</span>`
      },
      {
        key: "method",
        label: "Способ / Банк",
        minCols: 5,
        render: (r) => `<b>${esc(r.method)}</b>`
      },
      {
        key: "requisites",
        label: "Реквизиты",
        minCols: 5,
        num: true,
        render: (r) => `<span class="small num">${esc(r.requisites)}</span>`
      },
      {
        key: "gross",
        label: "Списано (100%)",
        minCols: 7,
        num: true,
        render: (r) => `<span class="num">${Number(r.gross || 0).toLocaleString("ru-RU")} ₽</span>`
      },
      {
        key: "fee",
        label: "Сбор (5%)",
        minCols: 7,
        num: true,
        render: (r) => `<span class="num muted">${Number(r.fee || 0).toLocaleString("ru-RU")} ₽</span>`
      },
      {
        key: "amount",
        label: "Сумма / Чек НПД",
        num: true,
        render: (r) => `<div class="stack" style="gap:2px"><b class="num">${Number(r.amount || 0).toLocaleString("ru-RU")} ₽</b><span class="small muted">${esc(r.receipt)}</span></div>`
      },
      {
        key: "status",
        label: "Статус",
        isActions: true,
        render: (r, h) => h.statusHTML(r)
      }
    ];
  }

  function buildExamColumns() {
    return [
      {
        key: "subjectCompact",
        label: "Предмет и вариант",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.subject)}</b><span class="small muted">${esc(r.date)} · ${esc(r.variant)}</span></div>`
      },
      {
        key: "date",
        label: "Дата",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.date)}</span>`
      },
      {
        key: "subject",
        label: "Предмет",
        minCols: 5,
        render: (r) => `<b>${esc(r.subject)}</b>`
      },
      {
        key: "variant",
        label: "Вариант / Задание",
        minCols: 5,
        render: (r) => `<div class="stack" style="gap:2px"><span>${esc(r.variant)}</span><span class="small muted">${esc(r.essayNote)}</span></div>`
      },
      {
        key: "score",
        label: "Балл / Итог",
        num: true,
        render: (r) => `<b class="num">${r.score} / ${r.maxScore}</b>`
      },
      {
        key: "essayNote",
        label: "Разбор ИИ",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.essayNote)}</span>`
      },
      {
        key: "examDate",
        label: "Экзамен ЕГЭ",
        minCols: 7,
        num: true,
        render: (r) => `<span class="small num">${esc(r.examDate)}</span>`
      },
      {
        key: "status",
        label: "Статус",
        isActions: true,
        render: (r, h) => h.statusHTML(r)
      }
    ];
  }

  function buildStudentColumns() {
    return [
      {
        key: "studentCompact",
        label: "Ученик и предмет",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.student)}</b><span class="small muted">${esc(r.subject)} · ${esc(r.nextSlot)}</span></div>`
      },
      {
        key: "student",
        label: "Ученик",
        minCols: 5,
        render: (r) => `<b>${esc(r.student)}</b>`
      },
      {
        key: "subject",
        label: "Предмет",
        minCols: 5,
        render: (r) => esc(r.subject)
      },
      {
        key: "city",
        label: "Город",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.city)}</span>`
      },
      {
        key: "nextSlot",
        label: "Ближайший слот",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.nextSlot)}</span>`
      },
      {
        key: "progress",
        label: "Прогресс ЕГЭ",
        num: true,
        render: (r) => {
          const gain = Math.max(0, Number(r.scoreCur || 0) - Number(r.scoreStart || 0));
          return `<div class="stack" style="gap:2px"><b class="num">${r.scoreStart} → ${r.scoreCur} / ${r.scoreTarget}</b><span class="small muted num">+${gain} б.</span></div>`;
        }
      },
      {
        key: "autoNotify",
        label: "Автоуведомления",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.autoNotify)}</span>`
      },
      {
        key: "contactOnly",
        label: "Связь (WA · TG · MAX)",
        maxCols: 3,
        isActions: true,
        render: (r, h) => h.messengerHTML(r)
      },
      {
        key: "statusAndContact",
        label: "Статус и связь",
        minCols: 5,
        isActions: true,
        render: (r, h) => `<div class="stack" style="gap:6px">${h.statusHTML(r)}${h.messengerHTML(r)}</div>`
      }
    ];
  }

  function buildAdminColumns() {
    const renderModBadge = (r, h) => {
      const kit = root.EGE && root.EGE.kit;
      const confirmed = h.isConfirmed(r);
      if (kit && typeof kit.adminModerationBadgeHTML === "function") {
        const modSt = confirmed ? "verified" : (r.modStatus || "pending");
        const modLbl = confirmed ? "Проверен ✓" : r.statusLabel;
        const badge = kit.adminModerationBadgeHTML(modSt, modLbl);
        const canConfirm = r && r.id && (r.status === "pending" || r.status === "trial");
        if (!canConfirm) return badge;
        const btn = confirmed
          ? `<button type="button" class="btn ghost sm bb-tbl-act-btn" data-a="${esc(h.confirmAction)}" data-id="${esc(r.id)}">Сбросить</button>`
          : `<button type="button" class="btn confirm sm bb-tbl-act-btn" data-a="${esc(h.confirmAction)}" data-id="${esc(r.id)}">✓ Подтвердить</button>`;
        return `<div class="bb-tbl-st-cell">${badge}${btn}</div>`;
      }
      return h.statusHTML(r);
    };
    return [
      {
        key: "entityCompact",
        label: "Объект и раздел",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.entity)}</b><span class="small muted">${esc(r.kind)} · ${esc(r.updatedAt)}</span></div>`
      },
      {
        key: "entity",
        label: "Объект / Событие",
        minCols: 5,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.entity)}</b><span class="small muted">${esc(r.subject)}</span></div>`
      },
      {
        key: "kind",
        label: "Категория",
        minCols: 5,
        render: (r) => esc(r.kind)
      },
      {
        key: "city",
        label: "Контур / Город",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.city)}</span>`
      },
      {
        key: "updatedAt",
        label: "Время",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.updatedAt)}</span>`
      },
      {
        key: "amount",
        label: "Сумма / Значение",
        num: true,
        render: (r) => `<b class="num">${esc(r.amount)}</b>`
      },
      {
        key: "outbox",
        label: "Топик аутбокса",
        minCols: 7,
        render: (r) => `<code class="small">${esc(r.outbox)}</code>`
      },
      {
        key: "statusCompact",
        label: "Статус",
        maxCols: 3,
        isActions: true,
        render: renderModBadge
      },
      {
        key: "statusFull",
        label: "Модерация",
        minCols: 5,
        isActions: true,
        render: renderModBadge
      }
    ];
  }

  const TABLE_PRESETS = {
    requests: {
      id: "requests",
      label: "Заявки",
      eyebrow: "Таблица 1..15 колонок · .bb-table-scroll + фильтры",
      title: "Расписание и заявки учеников с мгновенной отправкой в WA · Telegram · MAX",
      emptyLabel: "заявок",
      rows: TABLE_ROWS,
      filters: [
        { id: "all", label: "Все (" + TABLE_ROWS.length + ")", match: () => true },
        { id: "accepted", label: "Подтверждены ✓", match: (r, h) => h.effectiveStatus(r) === "accepted" },
        { id: "pending", label: "Ждут ответа", match: (r, h) => h.effectiveStatus(r) === "pending" },
        { id: "bio", label: "Биология", match: (r) => r.subjectId === "bio" },
        { id: "chem", label: "Химия", match: (r) => r.subjectId === "chem" }
      ],
      getColumns: buildRequestColumns
    },
    students: {
      id: "students",
      label: "Ученики",
      eyebrow: "Трекер учеников · Табличный реестр",
      title: "Активные ученики и автоуведомления WA / TG / MAX",
      emptyLabel: "учеников",
      rows: STUDENT_ROWS,
      filters: [
        { id: "all", label: "Все (" + STUDENT_ROWS.length + ")", match: () => true },
        { id: "accepted", label: "Активные ✓", match: (r, h) => h.effectiveStatus(r) === "accepted" },
        { id: "pending", label: "Ждут урока", match: (r, h) => h.effectiveStatus(r) === "pending" },
        { id: "bio", label: "Биология", match: (r) => r.subjectId === "bio" },
        { id: "chem", label: "Химия", match: (r) => r.subjectId === "chem" }
      ],
      getColumns: buildStudentColumns
    },
    payouts: {
      id: "payouts",
      label: "Выплаты",
      eyebrow: "Выплаты и чеки НПД · Адаптивная схема колонок",
      title: "История выводов средств преподавателя (СБП и Карта Мир)",
      emptyLabel: "выплат",
      rows: PAYOUT_ROWS,
      filters: [
        { id: "all", label: "Все (" + PAYOUT_ROWS.length + ")", match: () => true },
        { id: "accepted", label: "Выплачено ✓", match: (r, h) => h.effectiveStatus(r) === "accepted" },
        { id: "pending", label: "На проверке", match: (r, h) => h.effectiveStatus(r) === "pending" },
        { id: "sbp", label: "СБП", match: (r) => r.channel === "sbp" },
        { id: "refund", label: "Возвраты", match: (r, h) => h.effectiveStatus(r) === "refund" }
      ],
      getColumns: buildPayoutColumns
    },
    exams: {
      id: "exams",
      label: "Пробники",
      eyebrow: "Трекер ЕГЭ-2027 · Пробники и ИИ-сочинения",
      title: "Прогресс пробников и разбора задания 27 по русскому языку",
      emptyLabel: "результатов",
      rows: EXAM_ROWS,
      filters: [
        { id: "all", label: "Все (" + EXAM_ROWS.length + ")", match: () => true },
        { id: "bio", label: "Биология", match: (r) => r.subjectId === "bio" },
        { id: "chem", label: "Химия", match: (r) => r.subjectId === "chem" },
        { id: "rus", label: "Русский язык", match: (r) => r.subjectId === "rus" },
        { id: "pending", label: "Ждёт проверки", match: (r, h) => h.effectiveStatus(r) === "pending" }
      ],
      getColumns: buildExamColumns
    },
    admin: {
      id: "admin",
      label: "Админ · Модерация",
      eyebrow: "Админ-панель · Модерация и эскроу",
      title: "Реестр анкет, выплат НПД и событий аутбокса",
      emptyLabel: "записей",
      rows: ADMIN_ROWS,
      filters: [
        { id: "all", label: "Все (" + ADMIN_ROWS.length + ")", match: () => true },
        { id: "pending", label: "На проверке", match: (r, h) => h.effectiveStatus(r) === "pending" },
        { id: "verified", label: "Проверены ✓", match: (r, h) => h.isConfirmed(r) || r.modStatus === "verified" || r.modStatus === "paid" },
        { id: "flagged", label: "Требуют внимания", match: (r, h) => !h.isConfirmed(r) && r.modStatus === "flagged" },
        { id: "payouts", label: "Выплаты и эскроу", match: (r) => r.category === "payouts" }
      ],
      getColumns: buildAdminColumns
    }
  };

  function rowRateValue(r) {
    if (r && Number(r.rate) > 0) return Math.round(Number(r.rate));
    if (r && Number(r.gross) > 0) return Math.round(Number(r.gross));
    if (r && r.amount) {
      const parsed = parseInt(String(r.amount).replace(/[^\d]/g, ""), 10);
      if (parsed >= 400 && parsed <= 100000) return parsed;
    }
    return 1200;
  }

  function rowSeedNum(r) {
    const digits = String((r && r.id) || "").replace(/\D+/g, "");
    return parseInt(digits, 10) || 2;
  }

  function filterPresetCols(columns, colsCount) {
    return columns.filter((c) => {
      if (!c) return false;
      if (typeof c.when === "function" && !c.when(colsCount)) return false;
      if (c.minCols != null && colsCount < Number(c.minCols)) return false;
      if (c.maxCols != null && colsCount > Number(c.maxCols)) return false;
      return true;
    });
  }

  /* Строит схему колонок для стресс-теста и адаптивности от 1 до 15+ колонок. */
  function buildStressColumns(colsCount, presetId) {
    const n = Math.max(1, Math.min(15, Math.round(Number(colsCount) || 5)));
    const pid = TABLE_PRESETS[presetId] ? presetId : "requests";
    const preset = TABLE_PRESETS[pid];

    if (n === 1) {
      return [
        {
          key: "singleCard",
          label: "Карточка записи",
          render: (r, h) => {
            const title = r.student || r.entity || r.method || r.variant || "Запись";
            const sub = r.subject || r.kind || r.requisites || "ЕГЭ-2027";
            const slotTxt = r.slot || r.nextSlot || r.date || r.updatedAt || "Сб · 14:00";
            const priceVal = Number(r.rate || r.amount);
            const priceTxt = Number.isFinite(priceVal) && priceVal > 0
              ? `${priceVal.toLocaleString("ru-RU")} ₽`
              : (r.amount ? String(r.amount) : (r.score != null ? `${r.score} / ${r.maxScore || 100} б.` : `${rowRateValue(r).toLocaleString("ru-RU")} ₽/ч`));
            const actHtml = h.statusHTML(r);
            const msgHtml = (r.whatsapp || r.telegram || r.maxHandle) ? h.messengerHTML(r) : "";
            return `<div class="bb-tbl-single-card">
              <div class="bb-tbl-single-main">
                <b>${esc(title)}</b>
                <span class="small muted">${esc(sub)} · <span class="num">${esc(slotTxt)}</span></span>
              </div>
              <div class="bb-tbl-single-meta">
                <b class="num">${esc(priceTxt)}</b>
                <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">${actHtml}${msgHtml}</div>
              </div>
            </div>`;
          }
        }
      ];
    }

    if (n === 3 || n === 5 || n === 7) {
      return filterPresetCols(preset.getColumns(n), n);
    }

    const stressPool = [
      {
        key: "student",
        label: "Ученик",
        render: (r) => `<b>${esc(r.student || r.entity || r.method || r.variant || "Запись")}</b>`
      },
      {
        key: "subject",
        label: "Предмет и ЕГЭ",
        render: (r) => esc(r.subject || r.kind || "Биология · ЕГЭ-2027")
      },
      {
        key: "slot",
        label: "Дата и время слота",
        num: true,
        render: (r) => `<span class="num">${esc(r.slot || r.nextSlot || r.date || r.updatedAt || "Сб · 14:00")}</span>`
      },
      {
        key: "rateStepper",
        label: "Ставка ±50 ₽",
        num: true,
        render: (r) => {
          const rate = rowRateValue(r);
          return `<div class="hh-price-stepper compact">
            <button type="button" class="hh-step-btn" data-a="bb-tbl-step" data-id="${esc(r.id || "")}" data-step="-50">−50 ₽</button>
            <div class="hh-step-readout"><b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b></div>
            <button type="button" class="hh-step-btn" data-a="bb-tbl-step" data-id="${esc(r.id || "")}" data-step="50">+50 ₽</button>
          </div>`;
        }
      },
      {
        key: "net95",
        label: "На руки 95%",
        num: true,
        render: (r) => {
          const rate = rowRateValue(r);
          const net = Number(r.net) || Math.round(rate * 0.95);
          return `<b class="num" style="color:var(--confirm)">${net.toLocaleString("ru-RU")} ₽</b>`;
        }
      },
      {
        key: "fee5",
        label: "Сбор 5%",
        num: true,
        render: (r) => {
          const rate = rowRateValue(r);
          const net = Number(r.net) || Math.round(rate * 0.95);
          const fee = r.fee != null ? Number(r.fee) : Math.max(0, rate - net);
          return `<span class="num muted">${fee.toLocaleString("ru-RU")} ₽</span>`;
        }
      },
      {
        key: "channel",
        label: "Канал / источник",
        render: (r) => {
          const ch = r.channel === "sbp" ? "СБП" : (r.channel === "card" ? "Карта Мир" : (r.autoNotify || r.outbox || "Витрина /market"));
          return `<span class="small">${esc(ch)}</span>`;
        }
      },
      {
        key: "city",
        label: "Город / пояс",
        render: (r) => `<span class="small">${esc(r.city || "Якутск (UTC+9)")}</span>`
      },
      {
        key: "scoreStart",
        label: "Старт балл",
        num: true,
        render: (r) => {
          const s = r.scoreStart != null ? Number(r.scoreStart) : (r.score != null ? Math.max(35, Number(r.score) - 18) : (48 + (rowSeedNum(r) * 5) % 20));
          return `<span class="num">${s} б.</span>`;
        }
      },
      {
        key: "scoreCur",
        label: "Текущий балл",
        num: true,
        render: (r) => {
          const s = r.scoreCur != null ? Number(r.scoreCur) : (r.score != null ? Number(r.score) : (72 + (rowSeedNum(r) * 4) % 18));
          return `<b class="num">${s} б.</b>`;
        }
      },
      {
        key: "scoreTarget",
        label: "Цель балл",
        num: true,
        render: (r) => {
          const s = r.scoreTarget != null ? Number(r.scoreTarget) : (r.maxScore || 90);
          return `<span class="num">${s} б.</span>`;
        }
      },
      {
        key: "lessonsDone",
        label: "Проведено уроков",
        num: true,
        render: (r) => {
          const cnt = r.lessonsDone != null ? Number(r.lessonsDone) : (4 + (rowSeedNum(r) * 3) % 14);
          return `<span class="num">${cnt} ур.</span>`;
        }
      },
      {
        key: "contacts",
        label: "Контакты WA / TG",
        render: (r, h) => h.messengerHTML(r) || `<span class="small muted">${esc(r.telegram || r.requisites || "WA · TG · MAX")}</span>`
      },
      {
        key: "sbpReceipt",
        label: "Статус СБП-чека",
        render: (r) => {
          const txt = r.receipt || (r.status === "accepted" ? "Чек НПД сформирован" : (r.status === "refund" ? "Сторно 100%" : "Ожидает СБП"));
          return `<span class="small">${esc(txt)}</span>`;
        }
      },
      {
        key: "actionStatus",
        label: "Действие / статус",
        isActions: true,
        render: (r, h) => h.statusHTML(r)
      }
    ];

    if (n < 8) {
      return stressPool.slice(0, n - 1).concat([stressPool[stressPool.length - 1]]);
    }
    return stressPool.slice(0, n);
  }

  function bindWideScrollDelegation() {
    if (typeof document === "undefined" || !document || typeof document.addEventListener !== "function") return;
    if (root.__egeTblScrollBound) return;
    root.__egeTblScrollBound = true;
    document.addEventListener("click", (ev) => {
      const target = ev && ev.target;
      const btn = target && typeof target.closest === "function" ? target.closest("[data-bb-tbl-scroll]") : null;
      if (!btn) return;
      const dir = btn.getAttribute("data-bb-tbl-scroll");
      const shell = typeof btn.closest === "function" ? btn.closest(".bb-table-shell") : null;
      const scroller = shell && typeof shell.querySelector === "function" ? shell.querySelector(".bb-table-scroll") : null;
      if (!scroller) return;
      const delta = dir === "prev" ? -260 : 260;
      if (typeof scroller.scrollBy === "function") {
        scroller.scrollBy({ left: delta, behavior: "smooth" });
      } else {
        scroller.scrollLeft = Math.max(0, (Number(scroller.scrollLeft) || 0) + delta);
      }
    });
  }

  /* Универсальная schema-driven таблица: 1..15+ колонок, пресеты, подтверждение строк и @container карточки. */
  function dataTableHTML(opts) {
    opts = opts || {};
    bindWideScrollDelegation();

    const hasCustomColumns = Array.isArray(opts.columns);
    const hasCustomSchema = hasCustomColumns || Array.isArray(opts.rows);
    const hasExplicitCols = opts.cols != null;
    const presetId = TABLE_PRESETS[opts.preset] ? opts.preset : "requests";
    const preset = TABLE_PRESETS[presetId];

    const cols = hasCustomColumns
      ? (hasExplicitCols
          ? Math.max(1, Math.min(20, Math.round(Number(opts.cols) || opts.columns.length || 5)))
          : Math.max(1, opts.columns.length || 1))
      : Math.max(1, Math.min(15, Math.round(Number(opts.cols) || 5)));

    const filter = opts.filter || "all";
    const query = String(opts.query || "").trim().toLowerCase();
    const confirmAction = opts.confirmAction || "bb-tbl-confirm";
    const filterAction = opts.filterAction || "bb-tbl-filter";
    const colsAction = opts.colsAction || "bb-tbl-cols";
    const presetAction = opts.presetAction || "bb-tbl-preset";
    const searchAction = opts.searchAction || "bb-tbl-q";
    const confirmedIds = opts.confirmedIds || {};
    const cardWrap = opts.cardWrap !== false;
    const showPresetSwitch = opts.showPresetSwitch === true && !hasCustomSchema;
    const showColsSwitch = opts.showColsSwitch === true;
    const searchId = opts.searchId || "bb-tbl-q";
    const rootId = opts.tableId || opts.id || "";
    const toolbarExtraHTML = opts.toolbarExtraHTML || "";

    const renderMessengerLinks =
      (typeof opts.renderMessengerLinks === "function" && opts.renderMessengerLinks) ||
      (root.EGE && root.EGE.kit && typeof root.EGE.kit.messengerLinksHTML === "function" && root.EGE.kit.messengerLinksHTML) ||
      null;

    const rawRows = Array.isArray(opts.rows) ? opts.rows : preset.rows;
    const rateOverrides = (opts.rateOverrides && typeof opts.rateOverrides === "object") ? opts.rateOverrides : null;
    const allRows = rateOverrides
      ? rawRows.map((r) => {
          const ov = r && r.id ? rateOverrides[r.id] : null;
          if (!(Number(ov) > 0)) return r;
          const rate = Math.round(Number(ov));
          const net = Math.round(rate * 0.95);
          return Object.assign({}, r, { rate, net, fee: rate - net });
        })
      : rawRows;
    const allFilters = Array.isArray(opts.filters) ? opts.filters : (hasCustomSchema ? [] : preset.filters);
    const rawColumns = hasCustomColumns
      ? opts.columns
      : (cols === 3 || cols === 5 || cols === 7 ? preset.getColumns(cols) : buildStressColumns(cols, presetId));

    const visibleColumns = (hasCustomColumns && !hasExplicitCols)
      ? rawColumns.filter(Boolean)
      : filterPresetCols(rawColumns, cols);

    const safeColumns = visibleColumns.length ? visibleColumns : rawColumns.filter(Boolean);
    const colCount = Math.max(1, safeColumns.length);

    const effectiveStatus = (r) => {
      if (isRowConfirmed(r && r.id, confirmedIds)) return "accepted";
      return r && r.status ? r.status : "pending";
    };

    const effectiveStatusLabel = (r) => {
      if (isRowConfirmed(r && r.id, confirmedIds)) return "Подтверждено ✓";
      return (r && r.statusLabel) || "Ждёт ответа";
    };

    const statusHTML = (r) => {
      const confirmed = isRowConfirmed(r && r.id, confirmedIds);
      const st = effectiveStatus(r);
      const lbl = effectiveStatusLabel(r);
      const badge = `<span class="bb-tbl-st ${tableStatusClass(st)}">${esc(lbl)}</span>`;
      const canConfirm = r && r.id && (r.status === "pending" || r.status === "trial");
      if (!canConfirm) return badge;
      const btn = confirmed
        ? `<button type="button" class="btn ghost sm bb-tbl-act-btn" data-a="${esc(confirmAction)}" data-id="${esc(r.id)}">Сбросить</button>`
        : `<button type="button" class="btn confirm sm bb-tbl-act-btn" data-a="${esc(confirmAction)}" data-id="${esc(r.id)}">✓ Подтвердить</button>`;
      return `<div class="bb-tbl-st-cell">${badge}${btn}</div>`;
    };

    const messengerHTML = (r) => renderMessengerLinks && r
      ? renderMessengerLinks({
          entity: { id: r.id, name: r.student || r.entity, whatsapp: r.whatsapp, telegram: r.telegram, maxHandle: r.maxHandle },
          message: `Здравствуйте, ${r.student || r.entity || "коллега"}! Напоминаю о занятии (${r.subject || ""}, ${r.slot || r.nextSlot || ""}) через Вектор ЕГЭ.`,
          primaryLabel: "WA",
          compact: true
        })
      : "";

    const helpers = {
      cols,
      colCount,
      esc,
      confirmAction,
      confirmedIds,
      isConfirmed: (r) => isRowConfirmed(r && r.id, confirmedIds),
      effectiveStatus,
      effectiveStatusLabel,
      statusBadgeHTML: statusHTML,
      statusHTML,
      messengerHTML
    };

    const activeFilterObj = allFilters.find((f) => f.id === filter);
    const searchOf = (r) => {
      if (typeof opts.searchFields === "function") return String(opts.searchFields(r) || "").toLowerCase();
      if (Array.isArray(opts.searchFields)) {
        return opts.searchFields.map((k) => (r && r[k] != null ? String(r[k]) : "")).join(" ").toLowerCase();
      }
      if (!r || typeof r !== "object") return "";
      return Object.keys(r).map((k) => {
        const v = r[k];
        return (typeof v === "string" || typeof v === "number") ? String(v) : "";
      }).join(" ").toLowerCase();
    };

    const filtered = allRows.filter((r) => {
      if (activeFilterObj && typeof activeFilterObj.match === "function") {
        if (!activeFilterObj.match(r, helpers)) return false;
      } else if (filter === "accepted" && effectiveStatus(r) !== "accepted") {
        return false;
      } else if (filter === "pending" && effectiveStatus(r) !== "pending") {
        return false;
      }
      if (query && !searchOf(r).includes(query)) return false;
      return true;
    });

    const rowsHtml = filtered.length
      ? filtered.map((r, rowIdx) => {
          const extraAttr = typeof opts.rowAttrs === "function" ? String(opts.rowAttrs(r, rowIdx, helpers) || "").trim() : "";
          return `<tr${extraAttr ? " " + extraAttr : ""}>${safeColumns.map((col) => {
            const valHtml = typeof col.render === "function"
              ? col.render(r, helpers)
              : esc(r && r[col.key] != null ? String(r[col.key]) : "");
            const tdCls = [col.num ? "num" : "", col.isActions ? "bb-tbl-actions-cell" : ""].filter(Boolean).join(" ");
            const alignStyle = col.align ? ` style="text-align:${esc(col.align)}"` : "";
            return `<td data-label="${esc(col.label)}"${tdCls ? ` class="${tdCls}"` : ""}${alignStyle}>${valHtml}</td>`;
          }).join("")}</tr>`;
        }).join("")
      : `<tr><td colspan="${colCount}" data-label="Результат" class="small muted" style="text-align:center;padding:18px 10px">${esc(opts.emptyText || `По фильтру «${query || filter}» ${preset.emptyLabel || "записей"} не найдено — сбросьте фильтр.`)}</td></tr>`;

    const eyebrowText = opts.eyebrow != null ? opts.eyebrow : preset.eyebrow;
    const titleText = opts.title != null ? opts.title : preset.title;
    const searchPlaceholder = opts.searchPlaceholder || (
      presetId === "payouts" ? "Поиск: банк, чек НПД, сумма…" :
      (presetId === "exams" ? "Поиск: предмет, вариант, балл…" :
      (presetId === "students" ? "Поиск: ученик, предмет, канал…" :
      (presetId === "admin" ? "Поиск: анкета, чек НПД, топик…" : "Поиск: имя, предмет, город…")))
    );

    const presetSwitchHtml = showPresetSwitch
      ? `<div class="hh-seg" role="group" aria-label="Пресет таблицы">
          ${Object.keys(TABLE_PRESETS).map((pid) => `<button type="button" data-a="${esc(presetAction)}" data-preset="${pid}" data-v="${pid}" aria-pressed="${presetId === pid}">${esc(TABLE_PRESETS[pid].label)}</button>`).join("")}
        </div>`
      : "";

    const colsOptions = Array.isArray(opts.colsOptions) && opts.colsOptions.length
      ? opts.colsOptions
      : [1, 3, 5, 7, 10, 12, 15];

    const colsSwitchHtml = showColsSwitch
      ? `<div class="hh-seg" role="group" aria-label="Количество колонок таблицы">
          ${colsOptions.map((c) => {
            const n = Math.max(1, Math.min(20, Math.round(Number(c) || 1)));
            const lbl = n === 1 ? "1 колонка" : (n >= 2 && n <= 4 ? `${n} колонки` : `${n} колонок`);
            return `<button type="button" data-a="${esc(colsAction)}" data-cols="${n}" aria-pressed="${cols === n}">${lbl}</button>`;
          }).join("")}
        </div>`
      : "";

    const headerHtml = (eyebrowText || titleText || presetSwitchHtml || colsSwitchHtml)
      ? `<div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          ${(eyebrowText || titleText) ? `<div>
            ${eyebrowText ? `<div class="eyebrow">${esc(eyebrowText)}</div>` : ""}
            ${titleText ? `<h3 class="h3">${esc(titleText)}</h3>` : ""}
          </div>` : ""}
          ${(presetSwitchHtml || colsSwitchHtml) ? `<div class="bb-tbl-switches">${presetSwitchHtml}${colsSwitchHtml}</div>` : ""}
        </div>`
      : "";

    const toolbarHtml = (allFilters.length || opts.showSearch !== false || toolbarExtraHTML)
      ? `<div class="bb-tbl-toolbar">
          ${allFilters.length ? `<div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Фильтр строк таблицы">
            ${allFilters.map((f) => `<button type="button" class="chip-btn${filter === f.id ? " on" : ""}" data-a="${esc(filterAction)}" data-v="${esc(f.id)}">${esc(f.label)}</button>`).join("")}
          </div>` : ""}
          ${opts.showSearch !== false ? `<label class="bb-tbl-search" for="${esc(searchId)}">
            ${EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("search") : ""}
            <input id="${esc(searchId)}" data-a="${esc(searchAction)}" type="search" value="${esc(opts.query || "")}" placeholder="${esc(searchPlaceholder)}" autocomplete="off" aria-label="Поиск по таблице">
            ${query ? `<button type="button" class="btn ghost sm" data-a="${esc(filterAction)}" data-v="all" data-clear-q="1" aria-label="Сбросить поиск">×</button>` : ""}
          </label>` : ""}
          ${toolbarExtraHTML ? `<div class="bb-tbl-toolbar-extra">${toolbarExtraHTML}</div>` : ""}
        </div>`
      : "";

    const wideNavHtml = colCount >= 7
      ? `<div class="bb-tbl-wide-bar">
          <span class="small muted num">Колонок: ${colCount} · авто-прокрутка</span>
          <div class="row" style="gap:6px">
            <button type="button" class="btn ghost sm" data-bb-tbl-scroll="prev" aria-label="Прокрутить таблицу влево">←</button>
            <button type="button" class="btn ghost sm" data-bb-tbl-scroll="next" aria-label="Прокрутить таблицу вправо">→</button>
          </div>
        </div>`
      : "";

    const tableCls = [
      "tbl",
      "bb-data-table",
      `cols-${colCount}`,
      "is-adaptive",
      colCount === 1 ? "is-single-col" : "",
      colCount <= 3 ? "is-compact-cols" : "",
      colCount >= 7 ? "is-wide-cols" : ""
    ].filter(Boolean).join(" ");

    const shellHtml = `<div class="bb-table-shell">
      ${wideNavHtml}
      <div class="table-wrap bb-table-scroll">
        <table class="${tableCls}" style="--bb-col-count:${colCount}">
          <thead>
            <tr>${safeColumns.map((col) => {
              const thAlign = col.align ? ` style="text-align:${esc(col.align)}"` : "";
              return `<th${thAlign}>${esc(col.label)}</th>`;
            }).join("")}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;

    if (!cardWrap) {
      return `<div class="bb-tbl-inline"${rootId ? ` id="${esc(rootId)}"` : ""}>${headerHtml}${toolbarHtml}${shellHtml}</div>`;
    }

    return `<div class="card pad bb-data-table-card" id="${esc(rootId || "bb-table-demo")}">
      ${headerHtml}
      ${toolbarHtml}
      ${shellHtml}
    </div>`;
  }

  root.EGE.charts = Object.assign(root.EGE.charts || {}, {
    TABLE_ROWS,
    STUDENT_ROWS,
    ADMIN_ROWS,
    TABLE_PRESETS,
    buildStressColumns,
    dataTableHTML
  });
})();
