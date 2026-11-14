/* SVG-иконки, логотип «Вектор ЕГЭ», каталог 36 иконок и триггер анимации. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l8-8"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 2 2 3-3"/><path d="M14 10h4"/><path d="m7 15 2 2 3-3"/><path d="M14 16h4"/>',
    chart: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-7"/><path d="M3 20h18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    repeat: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    hint: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0 0 12 2z"/>',
    bug: '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sliders: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.3l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.9z"/>',
    heartFill: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.3l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.9z" fill="currentColor"/>',
    sort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    msg: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
  };

  function icon(name) {
    return (
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  }

  const BRAND_MARK_HTML =
    '<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none"><rect x="5" y="20" width="4" height="7" rx="2" fill="#fff" opacity=".7"/><rect x="11" y="16.5" width="4" height="10.5" rx="2" fill="#fff" opacity=".85"/><rect x="17" y="12.5" width="4" height="14.5" rx="2" fill="#fff"/><path d="M5.5 15Q15 9.5 26.5 4.9" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><path d="M21.8 4.9h4.8v4.8" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

  const GOOGLE_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.2 14.2A7.2 7.2 0 0 1 4.8 12c0-.8.1-1.5.4-2.2V6.7H1.2A12 12 0 0 0 0 12c0 1.9.5 3.8 1.2 5.3l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.9 11.9 0 0 0 12 0 12 12 0 0 0 1.2 6.7l4 3.1c1-2.9 3.7-5 6.8-5z"/></svg>';

  function getIconCatalog(dark) {
    return [
      ["heartFill", "Избранное (актив.)", "var(--bad)", "", "heartbeat", "Пульс ♥"],
      ["heart", "Избранное (контур)", "var(--muted)", "", "heartbeat", "Пульс ♡"],
      ["eyeOff", "Скрыть анкету", "var(--ink-2)", "", "shake", "Встряска"],
      ["eye", "Просмотр анкеты", "var(--accent)", "", "pop", "Фокус"],
      ["bell", "Уведомление (оранж.)", "var(--notif)", "3", "ring", "Звон"],
      ["flame", "Горящая ставка", "var(--notif)", "", "jiggle", "Искра"],
      ["check", "Проверено ✓", "var(--confirm)", "", "pop-bounce", "Подтверждено"],
      ["shield", "Защита оплаты", "var(--confirm)", "", "pop-bounce", "Щит"],
      ["star", "Рейтинг 4.9", "var(--pro)", "", "spin-pop", "Звезда 360°"],
      ["award", "Эксперт / ВсОШ", "var(--pro)", "", "spin-pop", "Медаль"],
      ["search", "Поиск", "var(--ink-2)", "", "scan", "Поиск"],
      ["sliders", "Фильтры", "var(--ink-2)", "", "nudge", "Настройка"],
      ["cal", "Расписание", "var(--accent)", "", "tick", "Календарь"],
      ["clock", "Время 10–20 ч", "var(--accent)", "", "tick", "Тик-так"],
      ["msg", "Чат / Отклик", "var(--accent)", "", "fly", "Отклик"],
      ["send", "Отправить ставку", "var(--accent)", "", "fly", "Полёт ↗"],
      ["video", "Онлайн-урок", "var(--accent)", "", "pop", "Камера"],
      ["users", "Репетиторы", "var(--ink-2)", "", "pop", "Каталог"],
      ["wallet", "Баланс / Тариф", "var(--confirm)", "", "lift", "Баланс"],
      ["lock", "Заморозка цены", "var(--ink-2)", "", "shake", "Бронь"],
      ["pin", "Город / Очно", "var(--accent)", "", "bounce-down", "Локация"],
      ["spark", "Подбор / ИИ", "var(--pro)", "", "twinkle", "Искры"],
      ["book", "Конспекты", "var(--ink-2)", "", "flip", "Страница"],
      ["list", "Тесты ЕГЭ", "var(--ink-2)", "", "pop", "Тесты"],
      ["chart", "Показатели", "var(--accent)", "", "lift", "Рост"],
      ["home", "Главная", "var(--ink-2)", "", "pop", "Домой"],
      ["repeat", "Обновить базу", "var(--ink-2)", "", "spin-ccw", "Обновить"],
      ["sort", "Сортировка", "var(--ink-2)", "", "nudge", "Порядок"],
      ["copy", "Копировать", "var(--ink-2)", "", "pop", "Скопировано"],
      ["share", "Поделиться", "var(--accent)", "", "lift", "Ссылка"],
      ["download", "Скачать PDF", "var(--ink-2)", "", "bounce-down", "Загрузка"],
      ["upload", "Загрузить файл", "var(--ink-2)", "", "lift", "Выгрузка"],
      ["bug", "Баг-репорт", "var(--ink-2)", "", "jiggle", "Проверка"],
      ["gear", "Настройки", "var(--ink-2)", "", "spin-180", "Поворот 180°"],
      [dark ? "sun" : "moon", "Смена темы", "var(--ink-2)", "", "spin-pop", "Тема 360°"],
      ["logout", "Выход", "var(--bad)", "", "fly", "Выход"]
    ];
  }

  function triggerIconTileAnim(tile) {
    if (!tile || !tile.classList) return;
    tile.classList.remove("is-anim");
    if (typeof tile.offsetWidth === "number") void tile.offsetWidth;
    tile.classList.add("is-anim");
    clearTimeout(tile._animTimer);
    if (typeof setTimeout === "function") {
      tile._animTimer = setTimeout(() => {
        if (tile.classList) tile.classList.remove("is-anim");
      }, 720);
    }
  }

  EGE.ui = {
    ICONS,
    icon,
    BRAND_MARK_HTML,
    GOOGLE_SVG,
    getIconCatalog,
    triggerIconTileAnim
  };
})();
