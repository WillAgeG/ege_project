/* Подсайты /brandbook/*: навигатор, превью Mobile/Desktop главной страницы и справочник API. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { icon, BRAND_MARK_HTML, brandMarkHTML, brandLockupHTML, sakhaPatternSVG } = EGE.ui || {
    icon: () => "",
    BRAND_MARK_HTML: "",
    brandMarkHTML: () => "",
    brandLockupHTML: () => "",
    sakhaPatternSVG: () => ""
  };
  const renderMark = () => (typeof brandMarkHTML === "function" ? brandMarkHTML() : BRAND_MARK_HTML);
  const { esc } = EGE.utils || { esc: (s) => String(s || "") };
  const { priceHeadlineHTML, priceDiffTagsHTML, sakhaBidInnerHTML } = EGE.hh || {
    priceHeadlineHTML: () => "",
    priceDiffTagsHTML: () => "",
    sakhaBidInnerHTML: () => ""
  };

  const BB_SUBSITES = [
    {
      id: "hub",
      path: "/brandbook",
      navLabel: "Обзор",
      badge: "Hub",
      eyebrow: "Design Portal · @vektor-ege/ui-kit",
      title: "Единая дизайн-система и портал Вектор ЕГЭ",
      desc: "Навигатор по специализированным подсайтам брендбука: чистое сравнение Desktop и Mobile главной страницы, UI Kit & Токены, Маркетплейс & СБП, DataViz, API-контракты, Admin UI Kit и Data Platform.",
      sections: ["bb-catalog"]
    },
    {
      id: "home",
      path: "/brandbook/home",
      navLabel: "Главная · Mobile & Desktop",
      badge: "390 / 1440",
      eyebrow: "Секция /brandbook/home · Responsive Parity",
      title: "Главная страница: чисто Desktop (1440 px) и Mobile (390 px)",
      desc: "Эталонное визуальное сравнение первого экрана /landing, навигации и карточки репетитора отдельно на широком мониторе и отдельно на смартфоне.",
      sections: ["bb-hero-banner", "bb-landing-kit", "bb-bounds", "bb-responsive"]
    },
    {
      id: "ui-kit",
      path: "/brandbook/ui-kit",
      navLabel: "UI Kit & Токены",
      badge: "11 секций",
      eyebrow: "Секция /brandbook/ui-kit · Атомы и Токены",
      title: "UI Kit: цвета, типографика, узоры Саха и контролы",
      desc: "Базовые строительные блоки интерфейса: логотип, палитры Light и OLED Dark (WCAG AA/AAA), Inter + IBM Plex Mono, 53 анимированные иконки, формы, 3 вида ползунков и Do/Don't.",
      sections: ["bb-logo", "bb-surfaces", "bb-fonts", "bb-yakutia", "bb-buttons", "bb-forms", "bb-sliders", "bb-layers", "bb-a11y", "bb-dodont", "bb-compare"]
    },
    {
      id: "marketplace",
      path: "/brandbook/marketplace",
      navLabel: "Маркетплейс & СБП",
      badge: "7 секций",
      eyebrow: "Секция /brandbook/marketplace · Продуктовые потоки",
      title: "Маркетплейс репетиторов, кабинеты и СБП-эскроу",
      desc: "Продуктовые модули: линейка тарифов от 390 ₽, торг ±50 ₽, кабинет преподавателя с балансом внизу слева, СБП-сплит, маски контактов WA/TG/MAX и таймеры ЕГЭ-2027.",
      sections: ["bb-cards-sys", "bb-market-app", "bb-cabinet", "bb-payments", "bb-mask-trainer", "bb-study-states", "bb-ege-timers"]
    },
    {
      id: "dataviz",
      path: "/brandbook/dataviz",
      navLabel: "DataViz & Таблицы",
      badge: "1..15 кол.",
      eyebrow: "Секция /brandbook/dataviz · Аналитика и Сетки",
      title: "Графики Фрича–Карлсона и адаптивные таблицы",
      desc: "Сплайны до 20 линий × 30 точек без выбросов кривой, кольцевые диаграммы и schema-driven таблицы от 1 до 15 колонок с липкой первой колонкой и @container карточками.",
      sections: ["bb-data-viz"]
    },
    {
      id: "api",
      path: "/brandbook/api",
      navLabel: "API & Контракты",
      badge: "18 роутов",
      eyebrow: "Секция /brandbook/api · Headless FastAPI :8771",
      title: "API-контракты, живые потоки и границы сервисов",
      desc: "Спецификация REST, потоков SSE/WS и календарей .ics сервера vektor-api (:8771), конверт событий Outbox v1 и чистая граница с Zero-API пакетом @vektor-ege/ui-kit (:8772).",
      sections: ["bb-arch-split", "bb-ui-kit-shells"]
    },
    {
      id: "admin",
      path: "/brandbook/admin",
      navLabel: "Admin Kit",
      badge: "Модерация",
      eyebrow: "Секция /brandbook/admin · Панель управления",
      title: "Admin UI Kit: KPI, модерация анкет и выплаты НПД",
      desc: "Компоненты панели администратора: переключатель перспектив ролей, карточная сетка KPI, 7 токенизированных статусов модерации и реестр выплат/аутбокса.",
      sections: ["bb-admin-kit"]
    },
    {
      id: "data",
      path: "/brandbook/data",
      navLabel: "Data & ETL",
      badge: "Medallion",
      eyebrow: "Секция /brandbook/data · Lakehouse M4 Pro",
      title: "Data Platform: PostgreSQL 17, Polars M4 Pro, Airflow и Grafana",
      desc: "Наблюдаемость конвейера Bronze → Silver → Gold ZSTD Parquet, SLA оркестрации DAG и лента событий транзакционного аутбокса.",
      sections: ["bb-telemetry-etl"]
    },
    {
      id: "all",
      path: "/brandbook/all",
      navLabel: "Все 27",
      badge: "Full",
      eyebrow: "Секция /brandbook/all · Сквозной индекс",
      title: "Полный индекс дизайн-системы (27 разделов на одном листе)",
      desc: "Все разделы брендбука на одной странице для быстрого поиска, экспорта токенов и сквозной регрессионной проверки.",
      sections: ["*"]
    }
  ];

  const BB_SUBSITE_MAP = {};
  BB_SUBSITES.forEach((s) => { BB_SUBSITE_MAP[s.id] = s; });

  const SUBSITE_ALIASES = {
    hub: { subsite: "hub", deviceView: null },
    home: { subsite: "home", deviceView: null },
    mobile: { subsite: "home", deviceView: "mobile" },
    desktop: { subsite: "home", deviceView: "desktop" },
    landing: { subsite: "home", deviceView: null },
    showcase: { subsite: "home", deviceView: null },
    "ui-kit": { subsite: "ui-kit", deviceView: null },
    tokens: { subsite: "ui-kit", deviceView: null },
    components: { subsite: "ui-kit", deviceView: null },
    marketplace: { subsite: "marketplace", deviceView: null },
    product: { subsite: "marketplace", deviceView: null },
    payments: { subsite: "marketplace", deviceView: null },
    dataviz: { subsite: "dataviz", deviceView: null },
    charts: { subsite: "dataviz", deviceView: null },
    tables: { subsite: "dataviz", deviceView: null },
    api: { subsite: "api", deviceView: null },
    architecture: { subsite: "api", deviceView: null },
    admin: { subsite: "admin", deviceView: null },
    data: { subsite: "data", deviceView: null },
    etl: { subsite: "data", deviceView: null },
    telemetry: { subsite: "data", deviceView: null },
    all: { subsite: "all", deviceView: null }
  };

  const SECTION_TO_SUBSITE = {};
  BB_SUBSITES.forEach((s) => {
    if (s.id === "all" || s.id === "hub") return;
    (s.sections || []).forEach((secId) => {
      SECTION_TO_SUBSITE[secId] = s.id;
    });
  });

  const API_ENDPOINTS = [
    { group: "auth", method: "GET", path: "/api/health", port: ":8770 / :8771", desc: "Статус FastAPI, доступность БД и конфигурация AI-провайдера." },
    { group: "auth", method: "GET", path: "/api/health/storage", port: ":8770 / :8771", desc: "Состояние Dual-Write: SQLite WAL, PostgreSQL 17 и очередь outbox." },
    { group: "auth", method: "POST", path: "/api/auth/login", port: ":8771", desc: "Логин по паролю (scrypt), выпуск сессионной HttpOnly cookie." },
    { group: "auth", method: "GET", path: "/api/auth/google/start", port: ":8771", desc: "Инициализация OAuth 2.0 + PKCE входа через Google." },
    { group: "auth", method: "GET", path: "/api/docs", port: ":8771", desc: "Загрузка JSONB-документов профиля, прогресса, плана и кабинета." },
    { group: "auth", method: "PATCH", path: "/api/docs/{doc_id}", port: ":8771", desc: "Атомарное deep-merge обновление документа с проверкой квоты." },
    { group: "realtime", method: "SSE", path: "/api/realtime/stream", port: ":8771", desc: "Серверный поток событий (Server-Sent Events) для ставок ±50 ₽." },
    { group: "realtime", method: "WS", path: "/api/realtime/ws", port: ":8771", desc: "Двунаправленный сокет-канал мгновенных откликов репетитора и чата." },
    { group: "realtime", method: "POST", path: "/api/realtime/publish", port: ":8771", desc: "Публикация доменного события и запись в outbox.kafka_outbox." },
    { group: "realtime", method: "GET", path: "/api/realtime/recent", port: ":8771", desc: "Последние доставленные уведомления для восстановления после офлайна." },
    { group: "calendar", method: "GET", path: "/api/calendar/state", port: ":8771", desc: "Слоты 10:00–20:00 и пересчёт поясов Asia/Yakutsk UTC+9 ↔ Мск UTC+3." },
    { group: "calendar", method: "POST", path: "/api/calendar/sync", port: ":8771", desc: "Синхронизация расписания учеников и обнаружение конфликтов слотов." },
    { group: "calendar", method: "GET", path: "/api/calendar/{token}.ics", port: ":8771", desc: "Подписная .ics-лента уроков для Apple Calendar и Google Calendar." },
    { group: "calendar", method: "POST", path: "/api/calendar/import-ics", port: ":8771", desc: "Импорт занятых интервалов (UTC Z) из внешнего календаря преподавателя." },
    { group: "admin", method: "GET", path: "/api/admin/overview", port: ":8771", desc: "Сводный реестр пользователей, анкет, заявок, выплат НПД и KPI." },
    { group: "admin", method: "POST", path: "/api/admin/tutors/{id}/moderate", port: ":8771", desc: "Верификация анкеты, активация «Верхней полосы PRO» (1 490 ₽/мес)." },
    { group: "admin", method: "POST", path: "/api/admin/payouts/{id}/status", port: ":8771", desc: "Перевод эскроу 95% / 5% в выплату по СБП или удержание в резерве." },
    { group: "admin", method: "GET", path: "/api/admin/outbox", port: ":8771", desc: "Мониторинг неотправленных и доставленных событий Envelope v1." }
  ];

  function parseSubsiteInput(raw) {
    const clean = String(raw || "").trim().toLowerCase().replace(/^\/+|\/+$/g, "");
    if (!clean) return { subsite: "hub", deviceView: null };
    return SUBSITE_ALIASES[clean] || { subsite: "hub", deviceView: null };
  }

  function resolveInitialRoute() {
    const host = root.EGE_HOST;
    if (host && host.bbSite) return parseSubsiteInput(host.bbSite);
    try {
      if (typeof location !== "undefined" && typeof location.pathname === "string") {
        const p = location.pathname;
        if (p.indexOf("/brandbook/") === 0) {
          return parseSubsiteInput(p.slice("/brandbook/".length));
        }
        if (p === "/brandbook") {
          return { subsite: "hub", deviceView: null };
        }
        if (host && host.uikitStandalone) {
          return { subsite: "hub", deviceView: null };
        }
      }
    } catch (e) { /* игнор */ }
    if (host && host.uikitStandalone && typeof location === "undefined") {
      return { subsite: "all", deviceView: null };
    }
    return { subsite: "all", deviceView: null };
  }

  function getSubsiteMeta(id) {
    return BB_SUBSITE_MAP[id] || BB_SUBSITE_MAP.hub;
  }

  function subsiteHref(id) {
    if (id === "mobile" || id === "desktop") return "/brandbook/" + id;
    const clean = BB_SUBSITE_MAP[id] ? id : "hub";
    return clean === "hub" ? "/brandbook" : ("/brandbook/" + clean);
  }

  function subsiteForSection(secId) {
    return SECTION_TO_SUBSITE[secId] || "all";
  }

  function syncSubsiteUrl(id, replace) {
    try {
      const target = subsiteHref(id);
      if (typeof history !== "undefined" && root.EGE_HOST && root.EGE_HOST.backend && typeof history.pushState === "function") {
        if (typeof location !== "undefined" && location.pathname !== target) {
          if (replace && typeof history.replaceState === "function") {
            history.replaceState({ bbSubsite: id }, "", target);
          } else {
            history.pushState({ bbSubsite: id }, "", target);
          }
        }
      }
    } catch (e) { /* игнор */ }
  }

  function portalHeaderHTML(bb, ctx) {
    ctx = ctx || {};
    const dark = !!ctx.dark;
    const inside = !!ctx.inside;
    const ui = ctx.ui || {};
    const cur = bb.subsite || "all";
    const meta = getSubsiteMeta(cur);
    const routePath = cur === "home" && bb.deviceView === "mobile"
      ? "/brandbook/mobile"
      : (cur === "home" && bb.deviceView === "desktop" ? "/brandbook/desktop" : meta.path);

    return `<header class="bb-portal-bar" aria-label="Навигация по подсайтам брендбука">
      <div class="bb-portal-toprow">
        <div class="row" style="gap:10px;align-items:center;min-width:0;flex-wrap:wrap">
          ${brandLockupHTML({ tag: "Brandbook 2.4", sub: "Единая дизайн-система Вектор ЕГЭ" })}
          <span class="bb-route-badge">${esc(routePath)}</span>
        </div>
        <div class="bb-portal-actions">
          <button type="button" class="btn soft sm" data-a="bb-export-tokens" data-fmt="css">${icon("copy")}<span>CSS токены</span></button>
          <button type="button" class="btn ghost sm" data-a="bb-export-tokens" data-fmt="json">tokens.json</button>
          <button type="button" class="btn ghost sm" data-a="go" data-v="landing">На /landing</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="${ui.role === "tutor" ? "cabinet" : "tests"}">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </div>
      <nav class="bb-subsite-nav" aria-label="Сайты брендбука">
        ${BB_SUBSITES.map((s) => `<a href="${esc(s.path)}" class="bb-subsite-pill${cur === s.id ? " is-on" : ""}" data-a="bb-subsite" data-v="${esc(s.id)}">
          <span>${esc(s.navLabel)}</span>
          <span class="bb-subsite-count">${esc(s.badge)}</span>
        </a>`).join("")}
      </nav>
    </header>`;
  }

  function subsiteHeroHTML(bb, anchorLinks) {
    const cur = bb.subsite || "all";
    const meta = getSubsiteMeta(cur);
    const mode = bb.mode || "both";
    const links = Array.isArray(anchorLinks) ? anchorLinks : [];
    const showModeSwitch = ["ui-kit", "marketplace", "all"].includes(cur);

    return `<section class="bb-hero-masthead" aria-label="${esc(meta.title)}">
      <div class="bb-masthead-top">
        <div class="stack" style="gap:8px;min-width:0;flex:1">
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="eyebrow" style="margin:0">${esc(meta.eyebrow)}</span>
            <span class="bb-spec-pill">Light #F4F5F7 · OLED Dark #000000</span>
            <span class="bb-spec-pill pro">Inter · IBM Plex Mono · tabular-nums</span>
          </div>
          <h1 class="h1" style="margin:0">${esc(meta.title)}</h1>
          <p class="lead" style="margin:0;max-width:74ch">${esc(meta.desc)}</p>
        </div>
        <div class="bb-masthead-controls">
          ${showModeSwitch ? `<div class="hh-seg" role="group" aria-label="Режим поверхностей брендбука">
            <button type="button" data-a="bb-mode" data-v="both" aria-pressed="${mode === "both"}">Белый + OLED</button>
            <button type="button" data-a="bb-mode" data-v="light" aria-pressed="${mode === "light"}">Светлый</button>
            <button type="button" data-a="bb-mode" data-v="dark" aria-pressed="${mode === "dark"}">Чёрный OLED</button>
          </div>` : `<div class="row" style="gap:6px;flex-wrap:wrap">
            <a href="/brandbook/mobile" class="btn soft sm${cur === "home" && bb.deviceView === "mobile" ? " is-confirmed" : ""}" data-a="bb-subsite" data-v="mobile">Mobile 390 px</a>
            <a href="/brandbook/desktop" class="btn soft sm${cur === "home" && bb.deviceView === "desktop" ? " is-confirmed" : ""}" data-a="bb-subsite" data-v="desktop">Desktop 1440 px</a>
            <a href="/brandbook/api" class="btn ghost sm" data-a="bb-subsite" data-v="api">API · 18 роутов →</a>
          </div>`}
        </div>
      </div>
      ${links.length ? `<nav class="bb-sec-jumps" id="bb-toc" aria-label="Разделы текущего подсайта">
        ${links.map(([id, lbl]) => `<a class="bb-toc-link" href="#${esc(id)}" data-a="land-scroll" data-target="${esc(id)}">${esc(lbl)}</a>`).join("")}
      </nav>` : ""}
    </section>`;
  }

  function desktopLandingScreenHTML(bb) {
    const price = Number(bb.price) || 1200;
    const market = 1800;
    const tutorRate = 1200;
    const sent = !!bb.sent;
    const heroImg = (typeof root.EGE_HOST === "object" && root.EGE_HOST && root.EGE_HOST.uikitStandalone)
      ? "assets/lena-pillars.jpg"
      : "/assets/lena-pillars.jpg";

    return `<div class="bb-mock-landing-desktop">
      <div class="bb-mock-nav">
        <div class="row" style="gap:8px;align-items:center">
          ${renderMark()}
          <b style="font-size:14px">Вектор ЕГЭ</b>
          <span class="bb-spec-pill">Якутск · 2027</span>
        </div>
        <div class="bb-mock-nav-links small muted">
          <span>Предметы</span>
          <span>СБП 0,8%</span>
          <span>PRO-акцент</span>
        </div>
        <div class="row" style="gap:6px">
          <button type="button" class="btn ghost sm" data-a="bb-demo-toast">Войти</button>
          <button type="button" class="btn sm" data-a="go" data-v="landing">Начать с 390 ₽</button>
        </div>
      </div>

      <div class="bb-mock-hero">
        <img src="${esc(heroImg)}" alt="Ленские столбы · Якутия" class="bb-mock-hero-img">
        <div class="bb-mock-hero-scrim"></div>
        <div class="bb-mock-hero-copy">
          <span class="bb-mock-hero-pill">Самая большая база · 2 480+ анкет</span>
          <h3>Назначай цену сам — репетиторы дешевле рынка</h3>
          <p class="small">Проверенные преподаватели, слоты в любое время и безопасная оплата через СБП.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn sm${bb.heroSubmitted ? " is-confirmed" : ""}" style="border-radius:999px" data-a="bb-hero-submit">${bb.heroSubmitted ? "✓ Анкеты открыты" : "Найти ниже рынка"}</button>
          </div>
        </div>
      </div>

      <div class="bb-mock-subjects">
        <span class="chip-btn on">Все предметы</span>
        <span class="chip-btn">Биология · от 1 000 ₽</span>
        <span class="chip-btn">Химия · от 1 100 ₽</span>
        <span class="chip-btn">Русский · от 900 ₽</span>
        <span class="chip-btn">Профмат · от 1 200 ₽</span>
      </div>

      <div class="bb-mock-cards-3">
        <article class="card pad stack" style="gap:10px;box-shadow:none">
          <div class="row between" style="gap:6px;align-items:flex-start">
            <div class="stack" style="gap:2px">
              <b style="font-size:14px">Анна Соколова</b>
              <span class="small muted">ЕГЭ Биология · Якутск</span>
            </div>
            <span class="verified-badge sm" title="Проверен">${icon("check")}</span>
          </div>
          <div class="hh-price-row">${priceHeadlineHTML(market, price, false)}</div>
          <div class="hh-diff-strip">${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: price, qualBadge: "Эксперт 95+" })}</div>
          <div class="hh-price-stepper compact">
            <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-50">−50 ₽</button>
            <div class="hh-step-readout"><b class="num">${price.toLocaleString("ru-RU")} ₽/ч</b></div>
            <button type="button" class="hh-step-btn" data-a="bb-step" data-step="50">+50 ₽</button>
          </div>
          <button type="button" class="btn sakha-pattern sm${sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(sent, price, { size: 15 })}</button>
        </article>

        <article class="card pad stack" style="gap:8px;box-shadow:none">
          <span class="eyebrow" style="margin:0">Оплата и защита</span>
          <b style="font-size:14px">СБП-сплит + холд первого урока</b>
          <p class="small muted" style="margin:0">Прямые мессенджеры WA/TG/MAX открываются после брони урока и пополнения баланса от 490 ₽.</p>
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:auto">
            <span class="bb-spec-pill confirm">СБП · 0,8%</span>
            <span class="bb-spec-pill">390 / 490 / 4 590 ₽</span>
          </div>
        </article>

        <article class="card pad stack" style="gap:8px;box-shadow:none">
          <span class="eyebrow" style="margin:0">Преподавателям · SaaS</span>
          <b style="font-size:14px">PRO-акцент · 1 490 ₽/мес</b>
          <p class="small muted" style="margin:0">Мягкое синее выделение анкеты в каталоге, значок «Проверен» и скидка 50% на сбор подбора.</p>
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:auto">
            <span class="bb-spec-pill pro">PRO карусель</span>
            <span class="bb-spec-pill">Учёт доходов и календарь</span>
          </div>
        </article>
      </div>
    </div>`;
  }

  function desktopRoleScreenHTML(role, bb) {
    const price = Number(bb.price) || 1200;
    const isTutor = role === "tutor";
    return `<div class="bb-mock-app-shell">
      <aside class="bb-mock-app-side">
        <div class="row" style="gap:8px;align-items:center">${renderMark()}<b style="font-size:13px">Вектор ЕГЭ</b></div>
        <div class="stack" style="gap:4px">
          ${(isTutor ? ["Заявки (3)", "Календарь", "Мои ученики", "Ученики ищут", "Профиль"] : ["Тесты ЕГЭ", "Справочник", "Репетиторы", "Учёба", "Показатели"]).map((lbl, idx) => `<div class="bb-mock-side-item${idx === (isTutor ? 0 : 2) ? " is-on" : ""}">${esc(lbl)}</div>`).join("")}
        </div>
        <div class="bb-mock-side-foot">
          <div class="small muted">${isTutor ? "Баланс преподавателя" : "Баланс ученика"}</div>
          <div class="row between" style="gap:6px;align-items:center">
            <b class="num" style="font-size:14px">${isTutor ? "16 020 ₽" : "4 590 ₽"}</b>
            <span class="chip confirm num" style="font-size:11px">${isTutor ? "Вывести" : "+ Пополнить"}</span>
          </div>
        </div>
      </aside>
      <div class="bb-mock-app-main">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div class="stack" style="gap:2px">
            <span class="eyebrow" style="margin:0">${isTutor ? "Кабинет преподавателя" : "Витрина ученика"}</span>
            <b style="font-size:15px">${isTutor ? "Входящие заявки и торг ±50 ₽ (5 колонок)" : "Подбор репетиторов и активные брони"}</b>
          </div>
          <span class="bb-spec-pill confirm">Синхронизировано · UTC+9</span>
        </div>
        <div class="card pad stack" style="gap:8px;box-shadow:none">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>${isTutor ? "Алина С. · ЕГЭ Биология" : "Анна Соколова · ЕГЭ Биология"}</b>
            <span class="num" style="font-weight:700;color:var(--confirm)">${price.toLocaleString("ru-RU")} ₽/ч</span>
          </div>
          <div class="row between small muted" style="gap:8px;flex-wrap:wrap">
            <span>Сб, 14 нояб. · 16:00 (Онлайн)</span>
            <span>На руки: ${Math.round(price * 0.95).toLocaleString("ru-RU")} ₽ (95%)</span>
          </div>
        </div>
      </div>
    </div>`;
  }

  function mobileLandingScreenHTML(bb) {
    const price = Number(bb.price) || 1200;
    const market = 1800;
    const tutorRate = 1200;
    const sent = !!bb.sent;
    const heroImg = (typeof root.EGE_HOST === "object" && root.EGE_HOST && root.EGE_HOST.uikitStandalone)
      ? "assets/lena-pillars.jpg"
      : "/assets/lena-pillars.jpg";

    return `<div class="bb-mock-landing-mobile">
      <div class="bb-mock-m-header">
        <div class="row" style="gap:6px;align-items:center">${renderMark()}<b style="font-size:13.5px">Вектор ЕГЭ</b></div>
        <div class="row" style="gap:6px">
          <span class="bb-spec-pill">Якутск</span>
          <button type="button" class="btn soft sm" data-a="bb-demo-toast">Войти</button>
        </div>
      </div>

      <div class="bb-mock-hero is-mobile">
        <img src="${esc(heroImg)}" alt="Ленские столбы · Якутия" class="bb-mock-hero-img">
        <div class="bb-mock-hero-scrim is-mobile"></div>
        <div class="bb-mock-hero-copy is-mobile">
          <span class="bb-mock-hero-pill">Самая большая база · 2 480+ анкет</span>
          <h4>Назначай цену сам — репетиторы дешевле рынка</h4>
          <p class="small">Проверенные преподаватели, слоты в любое время и безопасная оплата через СБП.</p>
          <div class="stack" style="gap:6px;align-items:center">
            <button type="button" class="btn sm${bb.heroSubmitted ? " is-confirmed" : ""}" style="border-radius:999px" data-a="bb-hero-submit">${bb.heroSubmitted ? "✓ Каталог открыт" : "Найти ниже рынка"}</button>
          </div>
        </div>
      </div>

      <div class="chip-rail swipe" aria-label="Предметы на мобильной главной">
        <span class="chip-btn on">Биология</span>
        <span class="chip-btn">Химия</span>
        <span class="chip-btn">Русский</span>
        <span class="chip-btn">Профмат</span>
      </div>

      <article class="card pad stack" style="gap:8px;box-shadow:none">
        <div class="row between" style="gap:6px;align-items:center">
          <div class="stack" style="gap:1px">
            <b style="font-size:14px">Анна Соколова</b>
            <span class="small muted">ЕГЭ Биология · Сб 14:00</span>
          </div>
          <span class="chip confirm num">−${Math.round(((market - price) / market) * 100)}%</span>
        </div>
        <div class="hh-price-row">${priceHeadlineHTML(market, price, false)}</div>
        <div class="hh-diff-strip">${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: price, qualBadge: "Эксперт 95+" })}</div>
        <div class="hh-price-stepper compact">
          <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-50">−50 ₽</button>
          <div class="hh-step-readout"><b class="num">${price.toLocaleString("ru-RU")} ₽/ч</b></div>
          <button type="button" class="hh-step-btn" data-a="bb-step" data-step="50">+50 ₽</button>
        </div>
        <button type="button" class="btn sakha-pattern sm${sent ? " is-confirmed" : ""}" style="width:100%" data-a="bb-bid">${sakhaBidInnerHTML(sent, price, { size: 15 })}</button>
      </article>

      <div class="bb-iphone-sticky-cta">
        <div class="stack" style="gap:1px"><b class="num" style="font-size:12.5px">От 390 ₽ · СБП</b><span class="small muted">Без скрытых сборов</span></div>
        <button type="button" class="btn sm" data-a="go" data-v="landing">Выбрать</button>
      </div>
    </div>`;
  }

  function mobileRoleScreenHTML(role, bb) {
    const price = Number(bb.price) || 1200;
    const isTutor = role === "tutor";
    return `<div class="bb-mock-role-mobile">
      <div class="bb-mock-m-header">
        <div class="row" style="gap:6px;align-items:center">${renderMark()}<b style="font-size:13px">${isTutor ? "Кабинет" : "Репетиторы"}</b></div>
        <span class="chip confirm num" style="font-size:11.5px">${isTutor ? "16 020 ₽ · Вывод" : "4 590 ₽"}</span>
      </div>
      <div class="card pad stack" style="gap:8px;box-shadow:none">
        <span class="eyebrow" style="margin:0">@container · 1 колонка</span>
        <b>${isTutor ? "Алина С. · ЕГЭ Биология" : "Анна Соколова · Онлайн"}</b>
        <div class="row between small muted"><span>Сб · 16:00</span><b class="num" style="color:var(--confirm)">${price.toLocaleString("ru-RU")} ₽/ч</b></div>
        <div class="row" style="gap:6px">
          <button type="button" class="btn confirm sm" style="flex:1" data-a="bb-bid">${isTutor ? "Подтвердить" : "Забронировать"}</button>
          <button type="button" class="btn soft sm" data-a="bb-demo-toast">Детали</button>
        </div>
      </div>
      <div class="bb-iphone-tabbar">
        ${(isTutor ? ["Заявки", "Календ.", "Ученики", "Биржа", "Выплаты"] : ["Тесты", "Справ.", "Поиск", "Учёба", "Баллы"]).map((t, i) => `<span class="bb-iphone-tab${i === (isTutor ? 0 : 2) ? " is-on" : ""}">${esc(t)}</span>`).join("")}
      </div>
    </div>`;
  }

  function deviceShowcaseSectionHTML(bb) {
    const view = ["split", "desktop", "mobile"].includes(bb.deviceView) ? bb.deviceView : "split";
    const screen = ["landing", "student", "tutor"].includes(bb.deviceScreen) ? bb.deviceScreen : "landing";
    const devTheme = bb.deviceTheme === "dark" ? "dark" : "light";
    const themeCls = devTheme === "dark" ? "is-dark" : "is-light";
    const screenUrl = screen === "landing" ? "vektor-ege.ru" : (screen === "student" ? "vektor-ege.ru/student" : "vektor-ege.ru/tutor");

    const desktopContent = screen === "landing"
      ? desktopLandingScreenHTML(bb)
      : desktopRoleScreenHTML(screen, bb);
    const mobileContent = screen === "landing"
      ? mobileLandingScreenHTML(bb)
      : mobileRoleScreenHTML(screen, bb);

    const desktopHTML = (view === "split" || view === "desktop")
      ? `<div class="bb-mac-window bb-pane ${themeCls}" data-device="desktop">
          <div class="bb-mac-bar">
            <div class="bb-mac-dots"><i></i><i></i><i></i></div>
            <div class="bb-mac-url">${esc(screenUrl)}</div>
            <span class="bb-spec-pill">Desktop · 1440 px</span>
          </div>
          <div class="bb-mac-canvas">${desktopContent}</div>
        </div>`
      : "";

    const mobileHTML = (view === "split" || view === "mobile")
      ? `<div class="bb-iphone-col">
          <div class="bb-iphone-bezel bb-pane ${themeCls}" data-device="mobile">
            <div class="bb-iphone-island"></div>
            <div class="bb-iphone-status"><span>14:00</span><span class="small muted">390 px · 5G · 100%</span></div>
            <div class="bb-iphone-canvas">${mobileContent}</div>
            <div class="bb-iphone-homebar"></div>
          </div>
        </div>`
      : "";

    const specsHTML = view !== "split"
      ? `<div class="bb-device-specs">
          <div class="card pad stack" style="gap:4px;box-shadow:none">
            <span class="bb-spec-pill">${view === "desktop" ? "1440 px · Широкий экран" : "390 px · iPhone 15"}</span>
            <b>${view === "desktop" ? "Контейнер 1 260–1 340 px" : "1 колонка + Touch ≥ 42 px"}</b>
            <p class="small muted" style="margin:0">${view === "desktop" ? "Сетка 3 карточек под Hero, верхнее меню или левый сайдбар с балансом внизу слева." : "Вертикальный Hero со ским-градиентом, горизонтальная рельса предметов и липкий CTA снизу."}</p>
          </div>
          <div class="card pad stack" style="gap:4px;box-shadow:none">
            <span class="bb-spec-pill confirm">Zero Overflow</span>
            <b>Переполнение страницы = 0 px</b>
            <p class="small muted" style="margin:0">Таблицы шире 7 колонок уходят во внутренний .bb-table-scroll с липкой 1-й колонкой или в карточки @container.</p>
          </div>
          <div class="card pad stack" style="gap:4px;box-shadow:none">
            <span class="bb-spec-pill pro">${devTheme === "dark" ? "OLED Dark #000000" : "Light #F4F5F7"}</span>
            <b>Токенизированная палитра</b>
            <p class="small muted" style="margin:0">Живой интерактивный степпер ±50 ₽ и кнопка Саха работают прямо внутри этого макета.</p>
          </div>
        </div>`
      : "";

    return `<section class="land-sec bb-device-stage" id="bb-device-showcase" aria-label="Как выглядит Mobile и Desktop главная страница">
      <div class="bb-device-toolbar">
        <div class="stack" style="gap:3px">
          <div class="eyebrow" style="margin:0">Чистый просмотр · Desktop vs Mobile</div>
          <h2 class="h2" style="margin:0">Как выглядит главная страница отдельно на Desktop и отдельно на Mobile</h2>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
          <div class="hh-seg" role="group" aria-label="Режим макетов устройств">
            <button type="button" data-a="bb-dev-view" data-v="split" aria-pressed="${view === "split"}">Рядом</button>
            <button type="button" data-a="bb-dev-view" data-v="desktop" aria-pressed="${view === "desktop"}">Чисто Desktop</button>
            <button type="button" data-a="bb-dev-view" data-v="mobile" aria-pressed="${view === "mobile"}">Чисто Mobile</button>
          </div>
          <div class="hh-seg" role="group" aria-label="Экран в макете">
            <button type="button" data-a="bb-dev-screen" data-v="landing" aria-pressed="${screen === "landing"}">Главная</button>
            <button type="button" data-a="bb-dev-screen" data-v="student" aria-pressed="${screen === "student"}">Ученик</button>
            <button type="button" data-a="bb-dev-screen" data-v="tutor" aria-pressed="${screen === "tutor"}">Преподаватель</button>
          </div>
          <div class="hh-seg" role="group" aria-label="Тема макета">
            <button type="button" data-a="bb-dev-theme" data-v="light" aria-pressed="${devTheme === "light"}">Светлая</button>
            <button type="button" data-a="bb-dev-theme" data-v="dark" aria-pressed="${devTheme === "dark"}">OLED Dark</button>
          </div>
        </div>
      </div>
      <div class="bb-device-pair is-${esc(view)}">
        ${desktopHTML}
        ${mobileHTML}
        ${specsHTML}
      </div>
    </section>`;
  }

  function hubDirectoryHTML(bb) {
    const cards = BB_SUBSITES.filter((s) => s.id !== "hub");
    return `<section class="land-sec" id="bb-hub-directory" aria-label="Карта отдельных сайтов брендбука">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Мультисайтовая структура · 8 отдельных разделов</div>
          <h2 class="h2">Откройте нужный сайт брендбука по прямому адресу</h2>
        </div>
        <span class="bb-spec-pill">Единый стиль · Чистые URL /brandbook/*</span>
      </div>
      <div class="bb-hub-grid">
        ${cards.map((s) => `<a href="${esc(s.path)}" class="bb-hub-card${bb.subsite === s.id ? " is-on" : ""}" data-a="bb-subsite" data-v="${esc(s.id)}">
          <div class="row between" style="gap:8px;align-items:center">
            <code class="bb-hub-url">${esc(s.path)}</code>
            <span class="bb-spec-pill">${esc(s.badge)}</span>
          </div>
          <b style="font-size:15px;line-height:1.3">${esc(s.navLabel)}</b>
          <p class="small muted" style="margin:0;line-height:1.45">${esc(s.desc)}</p>
          <span class="small" style="color:var(--accent);font-weight:600;margin-top:auto">Открыть сайт →</span>
        </a>`).join("")}
      </div>
    </section>`;
  }

  function apiPortalSectionHTML(bb) {
    const grp = ["all", "auth", "realtime", "calendar", "admin"].includes(bb.apiGroup) ? bb.apiGroup : "all";
    const items = grp === "all" ? API_ENDPOINTS : API_ENDPOINTS.filter((e) => e.group === grp);
    const groups = [
      ["all", `Все роуты (${API_ENDPOINTS.length})`],
      ["auth", "Auth & Docs"],
      ["realtime", "SSE & Сокеты"],
      ["calendar", "Календарь .ics"],
      ["admin", "Admin & Outbox"]
    ];
    const sampleEnvelope = JSON.stringify({
      event_id: "evt_01JFK79X",
      event_type: "market.bid.created",
      occurred_at: "2026-11-18T14:30:00+09:00",
      user_id: 42,
      role: "student",
      view: "market",
      payload: { tutor_slug: "anna-sokolova", price_rub: 1200, slot_hour: "16:00" },
      schema_version: 1
    }, null, 2);
    const sampleHealth = JSON.stringify({
      ok: true,
      mode: "dual",
      sqlite: "ok",
      postgres: "ok",
      outboxPending: 0
    }, null, 2);

    return `<section class="land-sec" id="bb-api-contracts" aria-label="Справочник роутов vektor-api">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Headless FastAPI · Порт :8771 · OpenAPI /docs</div>
          <h2 class="h2">Публичные и системные контракты API</h2>
        </div>
        <div class="chip-rail" role="group" aria-label="Фильтр контрактов API">
          ${groups.map(([gid, glbl]) => `<button type="button" class="chip-btn${grp === gid ? " on" : ""}" data-a="bb-api-group" data-v="${esc(gid)}">${esc(glbl)}</button>`).join("")}
        </div>
      </div>

      <div class="bb-api-grid">
        ${items.map((ep) => `<article class="bb-api-card">
          <div class="row between" style="gap:8px;align-items:center">
            <div class="row" style="gap:8px;align-items:center;min-width:0">
              <span class="bb-http-badge is-${esc(ep.method.toLowerCase())}">${esc(ep.method)}</span>
              <code class="bb-api-path">${esc(ep.path)}</code>
            </div>
            <button type="button" class="btn ghost sm" data-a="bb-copy-token" data-copy="${esc(ep.method + " " + ep.path)}" title="Копировать эндпоинт">${icon("copy")}</button>
          </div>
          <p class="small muted" style="margin:0;line-height:1.4">${esc(ep.desc)}</p>
          <span class="small muted num" style="font-family:var(--font-mono);font-size:11px">Сервер ${esc(ep.port)}</span>
        </article>`).join("")}
      </div>

      <div class="bb-json-grid">
        <div class="card pad stack" style="gap:8px;box-shadow:none">
          <div class="row between" style="gap:8px">
            <b>Canonical Event Envelope v1 (outbox.kafka_outbox)</b>
            <button type="button" class="btn soft sm" data-a="bb-copy-token" data-copy="${esc(sampleEnvelope)}">Копировать JSON</button>
          </div>
          <pre class="bb-json-pre"><code>${esc(sampleEnvelope)}</code></pre>
        </div>
        <div class="card pad stack" style="gap:8px;box-shadow:none">
          <div class="row between" style="gap:8px">
            <b>Dual-Write Health · GET /api/health/storage</b>
            <button type="button" class="btn soft sm" data-a="bb-copy-token" data-copy="${esc(sampleHealth)}">Копировать JSON</button>
          </div>
          <pre class="bb-json-pre"><code>${esc(sampleHealth)}</code></pre>
        </div>
      </div>
    </section>`;
  }

  function subsitePagerHTML(subsiteId) {
    const idx = BB_SUBSITES.findIndex((s) => s.id === subsiteId);
    if (idx < 0) return "";
    const prev = idx > 0 ? BB_SUBSITES[idx - 1] : null;
    const next = idx < BB_SUBSITES.length - 1 ? BB_SUBSITES[idx + 1] : null;
    return `<nav class="bb-subsite-pager" aria-label="Переход между сайтами брендбука">
      ${prev ? `<a href="${esc(prev.path)}" class="bb-pager-card" data-a="bb-subsite" data-v="${esc(prev.id)}"><span class="small muted">← Предыдущий сайт</span><b>${esc(prev.navLabel)}</b></a>` : `<span></span>`}
      ${next ? `<a href="${esc(next.path)}" class="bb-pager-card is-next" data-a="bb-subsite" data-v="${esc(next.id)}"><span class="small muted">Следующий сайт →</span><b>${esc(next.navLabel)}</b></a>` : `<span></span>`}
    </nav>`;
  }

  EGE.brandbookSubsites = {
    BB_SUBSITES,
    SECTION_TO_SUBSITE,
    parseSubsiteInput,
    resolveInitialRoute,
    getSubsiteMeta,
    subsiteHref,
    subsiteForSection,
    syncSubsiteUrl,
    portalHeaderHTML,
    subsiteHeroHTML,
    deviceShowcaseSectionHTML,
    hubDirectoryHTML,
    apiPortalSectionHTML,
    subsitePagerHTML
  };
})();
