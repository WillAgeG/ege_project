/* Единый каталог UI-блоков EGE.kit: источник правды для /brandbook и /landing (Hero, поиск, Саха-кнопки, карточки, FAQ, синий баннер). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc } = EGE.utils || { esc: (s) => String(s || "") };
  const initials =
    (EGE.utils && typeof EGE.utils.initials === "function" && EGE.utils.initials) ||
    ((name) => String(name || "").trim().split(/\s+/).slice(0, 2).map((w) => w[0] || "").join("").toUpperCase() || "ВЕ");
  const { icon, sakhaPatternSVG } = EGE.ui || {
    icon: () => "",
    sakhaPatternSVG: () => ""
  };

  const CH = EGE.charts || {};
  const CHART_STYLE_META = CH.CHART_STYLE_META || [];
  const chartDatasetBars = CH.chartDatasetBars || (() => []);
  const stickChartHTML = CH.stickChartHTML || (() => "");
  const lineChartHTML = CH.lineChartHTML || (() => "");
  const DONUT_DATASETS = CH.DONUT_DATASETS || {};
  const donutChartHTML = CH.donutChartHTML || (() => "");
  const TABLE_ROWS = CH.TABLE_ROWS || [];
  const TABLE_PRESETS = CH.TABLE_PRESETS || {};
  const dataTableHTML = CH.dataTableHTML || (() => "");

  /* Реестр компонентов дизайн-системы для быстрого поиска, фильтрации и копирования в /brandbook. */
  const CATALOG_CATEGORIES = [
    { id: "all", label: "Все разделы" },
    { id: "brand", label: "Лого и цвета" },
    { id: "hero", label: "Hero и фото" },
    { id: "sakha", label: "Саха · Оһуор" },
    { id: "controls", label: "Кнопки и формы" },
    { id: "app", label: "Кабинет и /market" },
    { id: "layout", label: "Слайдеры и границы" },
    { id: "sections", label: "Витрина и правила" }
  ];

  const CATALOG_ITEMS = [
    { id: "logo", targetId: "bb-logo", cat: "brand", title: "Адаптивный логотип + SVG Pack", api: "EGE.ui.brandLockupHTML() / brandLogoSVG()", css: ".brand-lockup .brand-mark .brand-wordmark", desc: "6-лучевая цветная звезда в стиле Gemini (#4285F4 · #EA4335 · #FBBC04 · #34A853) в светлой и тёмной темах + плавное вращение на :hover." },
    { id: "surfaces", targetId: "bb-surfaces", cat: "brand", title: "Поверхности, WCAG-контраст и токены", api: "EGE.hh.priceHeadlineHTML(market, offer, true)", css: ".hh-price-old .hh-price-now .diff-tag", desc: "Белый, Чёрный OLED, Синий hh, Золото Саха #C59B5F (--gold), пары контраста AA/AAA и экспорт :root CSS / tokens.json." },
    { id: "fonts", targetId: "bb-fonts", cat: "brand", title: "Типографика Inter + IBM Plex Mono", api: "--font-display / --font-mono / --shadow", css: ".h1 .h2 .small .eyebrow .num", desc: "Иерархия шрифтов, табличные цифры, шкала отступов 4 px, радиусы и 3 уровня теней." },
    { id: "hero", targetId: "bb-hero-banner", cat: "hero", title: "Hero-экран в стиле Gemini · 4 живые фотографии", api: "EGE.kit.heroBannerHTML({ ... })", css: ".land-hero-banner .is-gemini-hero .hero-float-card .hero-float-drift .hero-cta-primary", desc: "Чёрный #000 Hero-экран с 4 плавающими фотографиями (учёба, книга, конспект, онлайн-урок) без плашек и плавным переходом в белый #FFF." },
    { id: "sakha", targetId: "bb-yakutia", cat: "sakha", title: "Якутские кнопки-узоры Оһуор", api: "EGE.kit.sakhaButtonsHTML({ ... })", css: ".sakha-medallion-btn .sakha-diamond-btn .btn.sakha-pattern", desc: "Күн Оһуор, Сулус и узорная кнопка .btn.sakha-pattern без обрезанных углов." },
    { id: "buttons", targetId: "bb-buttons", cat: "controls", title: "Кнопки отклика, 40 иконок и золотой CTA", api: "EGE.hh.sakhaBidInnerHTML(sent, price) / .btn.gold", css: ".btn.sakha-pattern .btn.gold .is-confirmed .bb-icon-tile", desc: "Плавный .is-confirmed, золотая .btn.gold (#C59B5F), 40 SVG-иконок 1.8 px и оранжевые бейджи." },
    { id: "forms", targetId: "bb-forms", cat: "controls", title: "Формы, Мультивыбор (.hh-multi) и выбор роли", api: "EGE.hh.hhSelectHTML() / hhMultiSelectHTML() / authCard()", css: ".hh-select .hh-multi .hh-seg .switch", desc: "Одиночный и множественный выбор, роль «Как ученик / Как преподаватель» и поля с ошибкой." },
    { id: "overlays", targetId: "bb-cards-sys", cat: "controls", title: "Тарифы, баланс топ-бара, оранжевый тост и модалки", api: "EGE.kit.sentNoticeHTML() / notifySide() / .top-bal-wrap", css: ".plan-card.super .top-bal-pill .toast.is-side .modal-card", desc: "Иерархия 0 / 5 000 / 10 000 ₽ / любая сумма, баланс в шапке, свайп-тост и диалоги." },
    { id: "study", targetId: "bb-study-states", cat: "app", title: "Тренажёр ЕГЭ, Skeleton, Empty и Danger", api: "EGE.views.study / .opt / .meter", css: ".opt.ok .meter .bb-skel-bar .empty .confirm", desc: "Варианты ответов, конспект .theory, шиммер 1.6 s и адаптивная отмена." },
    { id: "marketApp", targetId: "bb-market-app", cat: "app", title: "Каталог /market, Кабинет преподавателя и 5-tab .tabbar", api: "EGE.views.tutorCabinet / EGE.views.market", css: ".tutor-card .tc-req-card .diff-tag.pro .side .tabbar", desc: "Кабинет ученика и личный кабинет преподавателя, до 2 плашек квалификации и «Преподаватель» без сокращений." },
    { id: "cabinet", targetId: "bb-cabinet", cat: "app", title: "Кабинет преподавателя, расписание, 6 видов графиков с палочками и баланс", api: "EGE.views.tutorCabinet / EGE.charts.stickChartHTML() / balanceModalHTML()", css: ".sakha-divider.is-gold-logo .tc-cal-hours .tc-bar-chart .is-sticks .is-lollipop .is-capsule .is-dual .is-range .is-combo .tc-hh-meter .wallet-bar", desc: "Модалка пополнения (.wallet-bar, старт 5 000 ₽ / от 100 ₽), сетка слотов 10:00–20:00, лиды учеников, выплаты 95%, витрина графиков с палочками (тонкие, леденцы, капсулы, парные, диапазон, комбо-тренд), профиль .tc-hh-meter и трекер баллов." },
    { id: "dataViz", targetId: "bb-data-viz", cat: "app", title: "Линейные графики, Круговая диаграмма и Таблица (3/5/7 колонок + пресеты)", api: "EGE.charts.{lineChartHTML, donutChartHTML, dataTableHTML}({ preset, confirmedIds, cardWrap })", css: ".bb-line-chart .bb-donut-chart .bb-table-shell .bb-data-table.is-adaptive", desc: "SVG-график с линией и областью, кольцевая диаграмма, супер-адаптивная таблица (Заявки / Выплаты / Пробники, 3/5/7 колонок, кнопка Подтвердить и карточки @container) + WA · Telegram · MAX." },
    { id: "maskTrainer", targetId: "bb-mask-trainer", cat: "app", title: "Живой тренажёр масок контактов (WA · Telegram · MAX)", api: "EGE.kit.{formatPhoneMask, formatTelegramContact, resolveMessengerUrls, messengerLinksHTML}()", css: ".tc-contact-grid .bb-mask-urls .btn-msg.is-wa.is-tg.is-max", desc: "Редактируемые поля +7 (XXX) XXX-XX-XX, @login и MAX с быстрыми примерами и живым расчётом ссылок wa.me / t.me / max.ru." },
    { id: "payments", targetId: "bb-payments", cat: "app", title: "Эквайринг, эскроу-статусы и выплаты (EGE.payments)", api: "EGE.payments.{createTopupIntent, createPayoutIntent}()", css: ".bb-pay-grid .bb-pay-split .bb-pay-dock-preview .bb-tbl-st.is-refund", desc: "Пополнение от 5 000 ₽ / 100 ₽, эскроу frozen -> captured (95% / 5%) -> refunded (100%), вывод (кнопка «Вывести») на СБП / Мир и чек НПД." },
    { id: "uiKitShells", targetId: "bb-ui-kit-shells", cat: "app", title: "Единые Shell-виджеты сайта из EGE.kit", api: "EGE.kit.{topBalanceWidgetHTML, tutorBalanceDockHTML, walletSummaryBarHTML, sideToastInnerHTML, emptyStateHTML, skeletonCardHTML}()", css: ".top-bal-wrap .tutor-bal-dock.is-inline-preview .wallet-bar .toast-side-row .empty .bb-skel-bar", desc: "Единые виджеты баланса ученика и преподавателя, панель кошелька (.wallet-bar), боковой тост, empty-state и skeleton-загрузка." },
    { id: "telemetryEtl", targetId: "bb-telemetry-etl", cat: "app", title: "Data & Observability UI Kit: Пайплайны ETL/ELT и Поток логов", api: "EGE.kit.{pipelineStageCardHTML, eventLogFeedHTML}()", css: ".bb-pipe-card .bb-pipe-metrics .bb-log-feed .bb-log-row", desc: "Карточки стадий ETL/ELT (PostgreSQL 17, Polars M4 Pro, Airflow DAG, Kafka Clickstream, Grafana BI) и лента событий кликстрима." },
    { id: "egeTimers", targetId: "bb-ege-timers", cat: "app", title: "Таймеры ЕГЭ-2027 и ИИ-проверка сочинения (Задание 27)", api: "EGE.exams / EGE.essay", css: ".bb-timer-grid .bb-timer-card .bb-essay-box .bb-essay-criteria", desc: "Обратный отсчёт до экзаменов 2027 (Химия, Русский, Биология), чекпоинт 1 февраля и разбор критериев К1–К10 (21 / 22 б.)." },
    { id: "a11y", targetId: "bb-a11y", cat: "controls", title: "Фокус-кольца, горячие клавиши и Reduced Motion (A11y)", api: ":focus-visible / html.reduced-motion", css: ".bb-focus-map .bb-focus-demo kbd.bb-kbd", desc: "Карта колец фокуса (Primary, Золото Саха, Поле, Ошибка), шпаргалка клавиш Esc / Tab / ← → и отключение анимаций." },
    { id: "sliders", targetId: "bb-sliders", cat: "layout", title: "Слайдер часов 10:00–20:00 и калькулятор в 1 строку", api: "EGE.hh.sliderTicksHTML(cur, style) / .hh-step-readout.is-inline", css: ".hh-time-range .hh-slider-ticks .hh-step-readout.is-inline", desc: "3 варианта шкалы слотов, палка 10×24 px и строчный ввод «1 100 ₽/ч» без переноса." },
    { id: "layers", targetId: "bb-layers", cat: "layout", title: "Слои Z-index, статус отклика и Reduced Motion", api: "EGE.kit.sentNoticeHTML({ slot, offer })", css: ".hh-motion-status.sent .bb-pulse-dot .is-reduced", desc: "Статус под кнопкой, подъём −2 px, таблица слоёв (10→100) и отключение анимаций." },
    { id: "bounds", targetId: "bb-bounds", cat: "layout", title: "Границы 390 px, воздух 6 px и зазор 8 px", api: ".cal-days / .hh-price-stepper", css: ".bb-bp-stage .bb-phone-frame .bb-days-rail", desc: "Защита от обрезания рамок при hover, угол 84 px и мобильный фрейм." },
    { id: "responsive", targetId: "bb-responsive", cat: "layout", title: "Стенд адаптивности (320 px — 1340 px)", api: "applyBrandbookViewport(width)", css: "@container (max-width: 880px) / @container (max-width: 640px)", desc: "Живой ползунок ширины экрана от Mini SE 320 px до Desktop." },
    { id: "kit", targetId: "bb-landing-kit", cat: "sections", title: "Блоки витрины (Лента, Золотая ставка, Ставки, Отзывы)", api: "EGE.kit.rateBenchCardHTML / reviewCardHTML / .savings-bar-fill.gold-fill", css: ".marquee-pill .savings-gold-txt .rate-bench-card .review-card", desc: "Общие компоненты EGE.kit и золотой акцент «Вектор ЕГЭ · твоя ставка»." },
    { id: "dodont", targetId: "bb-dodont", cat: "sections", title: "Do / Don't и Tone of Voice (формат текстов)", api: "tokens.json -> editorial", css: ".bb-do-card .bb-dont-card", desc: "Оранжевые уведомления, правило 5% (/fees и кабинет), формат ₽/ч и якутская орфография." },
    { id: "compare", targetId: "bb-compare", cat: "brand", title: "Сквозная проверка Light vs Dark OLED", api: "EGE.views.brandbook.brandbookPaneHTML()", css: ".bb-pane.is-light .bb-pane.is-dark", desc: "Одновременное сравнение свотчей, слайдера, степпера и карточки в двух темах." },
    { id: "admin-kit", section: "Паттерны", category: "cabinet", num: "26", targetId: "bb-admin-kit", cat: "app", title: "Админ-панель и модерация (Admin UI Kit)", api: "EGE.kit.{adminKpiGridHTML, adminModerationBadgeHTML, roleSwitchBannerHTML}()", css: ".adm-kpi-grid .adm-kpi-card .adm-mod-badge .role-switch-banner", desc: "KPI-карточки, бейджи верификации, роль Администратор и адаптивные таблицы управления", tag: "Admin" },
    { id: "arch-split", section: "Данные и наблюдаемость", category: "telemetry", num: "27", targetId: "bb-arch-split", cat: "app", title: "Разделение UI Kit и API + Таблицы обеих ролей", api: "EGE.kit.serviceBoundaryCardHTML() / EGE.charts.dataTableHTML()", css: ".arch-boundary-card .arch-endpoints .role-switch-banner", desc: "Чистая граница stateless UI-Kit, EGE\u002eapi клиент и табличные заявки ученика/преподавателя", tag: "Architecture" }
  ];

  const HERO_COPY_VARIANTS = [
    {
      h1: "Назначай цену сам — репетиторы дешевле рынка",
      sub: "Проверенные преподаватели, слоты в любое время и безопасная оплата через СБП"
    },
    {
      h1: "Предложи свою ставку за урок — репетиторы откликнутся сами",
      sub: "Сам назначаешь цену от 0 ₽/ч, выбираешь преподавателя по анкете и платишь безопасно через СБП"
    },
    {
      h1: "Твоя цена за занятие — сильные репетиторы на 30% выгоднее",
      sub: "Самая большая база проверенных преподавателей: меняй ставку шагом ±50 ₽ в один клик"
    },
    {
      h1: "Не переплачивай за подготовку — назови свою цену репетитору",
      sub: "Преподаватели по ЕГЭ, ОГЭ и вузовским предметам готовы заниматься в любое время по твоей ставке"
    },
    {
      h1: "Репетиторы по твоей цене — экономия до 30% на каждом уроке",
      sub: "Сравнивай реальные ставки, пробуй первый урок за 490 ₽ или бесплатно и плати через СБП после подтверждения"
    }
  ];

  function heroBannerHTML(opts) {
    opts = opts || {};
    const isDemo = !!opts.brandbookDemo;
    const catalogTotal = opts.catalogTotal || "2 480";
    const catalogTotalNum = Math.max(1, Math.round(Number(String(catalogTotal).replace(/\D+/g, "")) || 2480));
    const variantIdx = ((Number(opts.variantIdx) || 0) % HERO_COPY_VARIANTS.length + HERO_COPY_VARIANTS.length) % HERO_COPY_VARIANTS.length;
    const copy = HERO_COPY_VARIANTS[variantIdx];
    const primaryActive = !!opts.primaryActive;
    const primaryAction = opts.primaryAction || (isDemo ? "bb-hero-primary" : "land-scroll");
    const primaryTarget = opts.primaryTarget || "land-market";
    const feesAction = opts.feesAction || "go";
    const assetBase = opts.assetBase || ((typeof root.EGE_HOST === "object" && root.EGE_HOST && root.EGE_HOST.uikitStandalone) ? "assets/" : "/assets/");
    const floaters = [
      { cls: "is-c1", src: assetBase + "hero-tutor-student.jpg", dur: "9s", delay: "0s", fx: "1", depth: "0.08", enter: "80ms" },
      { cls: "is-c2", src: assetBase + "hero-book-pages.jpg", dur: "12s", delay: "-1.8s", fx: "-1", depth: "0.14", enter: "180ms" },
      { cls: "is-c3", src: assetBase + "hero-study-notes.jpg", dur: "10.5s", delay: "-3.4s", fx: "1", depth: "0.11", enter: "280ms" },
      { cls: "is-c4", src: assetBase + "hero-laptop-call.jpg", dur: "13s", delay: "-5.1s", fx: "-1", depth: "0.16", enter: "380ms" }
    ];

    return `<section class="land-hero-banner is-gemini-hero" aria-label="Главный экран Вектор">
      ${floaters.map((f) => `<div class="hero-float-card ${f.cls}" style="--float-dur:${f.dur};--float-delay:${f.delay};--fx:${f.fx};--depth:${f.depth};--enter-delay:${f.enter}" data-float-depth="${f.depth}" aria-hidden="true">
        <div class="hero-float-drift">
          <img class="hero-float-photo" src="${esc(f.src)}" alt="" loading="eager" decoding="async">
        </div>
      </div>`).join("\n      ")}
      <div class="hero-banner-top">
        <h1 class="${isDemo ? "h2" : "hero-banner-h1"}">${esc(copy.h1)}</h1>
        <p class="hero-banner-sub">${esc(copy.sub)}</p>
        <div class="hero-banner-ctas" role="group" aria-label="Главное действие">
          <button type="button" class="btn hero-cta-primary${primaryActive ? " is-confirmed" : ""}" data-a="${esc(primaryAction)}" data-target="${esc(primaryTarget)}">${primaryActive ? "✓ Открыт каталог анкет" : "Найти ниже рынка"}</button>
        </div>
      </div>
      <div class="hero-banner-foot">
        <div class="hero-banner-kpis" aria-label="Ключевые показатели платформы">
          <div class="hero-banner-kpi"><b class="num" data-countup="${catalogTotalNum}" data-suffix="+">${esc(catalogTotal)}+</b><span>анкет в базе</span></div>
          <div class="hero-banner-kpi"><b class="num" data-countup="30" data-suffix="%">30%</b><span>дешевле рынка</span></div>
          <div class="hero-banner-kpi"><b class="num" data-countup="24" data-suffix="/7">24/7</b><span>слоты в любое время</span></div>
        </div>
        <p class="hero-banner-note">Самая большая база проверенных репетиторов — назначай свою цену за урок · <a href="/fees" data-a="${esc(feesAction)}" data-v="fees">безопасная оплата СБП</a>.</p>
      </div>
    </section>`;
  }

  let _floatersBound = false;
  let _floatPointerX = 0;

  function updateHeroFloatersFrame() {
    try {
      if (typeof document === "undefined" || typeof window === "undefined") return;
      const reduced = (document.documentElement && document.documentElement.classList && document.documentElement.classList.contains("reduced-motion")) ||
        (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
      const sy = typeof window.scrollY === "number" ? window.scrollY : 0;
      const cards = typeof document.querySelectorAll === "function" ? document.querySelectorAll(".land-page:not(#brandbook-page) [data-float-depth]") : [];
      cards.forEach((el) => {
        if (!el || !el.style || typeof el.style.setProperty !== "function") return;
        if (reduced) {
          el.style.setProperty("--px", "0px");
          el.style.setProperty("--py", "0px");
          return;
        }
        const depth = Math.max(0.04, Math.min(0.24, Number(el.getAttribute && el.getAttribute("data-float-depth")) || 0.1));
        const fx = el.classList && (el.classList.contains("is-c2") || el.classList.contains("is-c4")) ? -1 : 1;
        const py = Math.max(-46, Math.min(20, Math.round(-sy * depth * 0.45 * 10) / 10));
        const px = Math.round(_floatPointerX * fx * depth * 72 * 10) / 10;
        el.style.setProperty("--px", px + "px");
        el.style.setProperty("--py", py + "px");
      });
      const landPage = typeof document.querySelector === "function" ? document.querySelector(".land-page:not(#brandbook-page)") : null;
      if (landPage && typeof landPage.querySelector === "function") {
        const topbar = landPage.querySelector(".land-top");
        const heroEl = landPage.querySelector(":scope > .land-hero-banner") || landPage.querySelector(".land-hero-banner");
        if (heroEl && typeof heroEl.getBoundingClientRect === "function") {
          const rect = heroEl.getBoundingClientRect();
          const vh = (typeof window !== "undefined" && Number(window.innerHeight)) || 800;
          const lockUntil = landPage.dataset ? Number(landPage.dataset.whiteLockUntil || 0) : 0;
          const lockedWhite = lockUntil > Date.now();
          const scrolledPastHero = sy > 110 || rect.bottom <= Math.round(vh * 0.72);
          const whiteStage = lockedWhite || scrolledPastHero;
          const pastHero = rect.bottom <= 74 || whiteStage;
          if (topbar && topbar.classList) topbar.classList.toggle("is-scrolled-light", pastHero);
          if (landPage.classList) landPage.classList.toggle("is-white-stage", whiteStage);
          if (typeof document !== "undefined" && document.body && document.body.classList) {
            document.body.classList.toggle("is-land-white", whiteStage);
          }
        }
      }
    } catch (e) { /* игнор без DOM */ }
  }

  function initHeroFloaters() {
    try {
      if (typeof window === "undefined" || typeof document === "undefined") return;
      updateHeroFloatersFrame();
      if (_floatersBound || typeof window.addEventListener !== "function") return;
      _floatersBound = true;
      let rafPending = false;
      const scheduleFrame = () => {
        if (rafPending) return;
        rafPending = true;
        const run = () => { rafPending = false; updateHeroFloatersFrame(); };
        if (typeof requestAnimationFrame === "function") requestAnimationFrame(run);
        else run();
      };
      window.addEventListener("scroll", scheduleFrame, { passive: true });
      window.addEventListener("resize", scheduleFrame, { passive: true });
      window.addEventListener("pointermove", (ev) => {
        if (!ev || typeof window.innerWidth !== "number" || window.innerWidth < 760) return;
        _floatPointerX = ((ev.clientX / Math.max(1, window.innerWidth)) - 0.5) * 2;
        scheduleFrame();
      }, { passive: true });
    } catch (e) { /* игнор без DOM */ }
  }

  function animateHeroCounters(scope) {
    try {
      if (typeof window === "undefined" || typeof document === "undefined" || typeof requestAnimationFrame !== "function") return;
      if (document.documentElement && document.documentElement.classList && document.documentElement.classList.contains("reduced-motion")) return;
      if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const rootEl = scope && typeof scope.querySelectorAll === "function" ? scope : document;
      const nodes = Array.from(rootEl.querySelectorAll('[data-countup]:not([data-counted="1"])'));
      if (!nodes.length) return;
      const items = nodes.map((el) => {
        el.setAttribute("data-counted", "1");
        const target = Math.max(0, Number(el.getAttribute("data-countup")) || 0);
        const suffix = el.getAttribute("data-suffix") || "";
        el.textContent = "0" + suffix;
        return { el, target, suffix };
      });
      const t0 = typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
      const duration = 950;
      const tick = (nowRaw) => {
        const now = typeof nowRaw === "number" ? nowRaw : Date.now();
        const p = Math.min(1, Math.max(0, (now - t0) / duration));
        const eased = 1 - Math.pow(1 - p, 3);
        items.forEach((it) => {
          const val = p >= 1 ? it.target : Math.round(it.target * eased);
          const numTxt = val >= 1000 ? val.toLocaleString("ru-RU") : String(val);
          it.el.textContent = numTxt + it.suffix;
        });
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (e) { /* игнор в окружении без DOM */ }
  }

  function searchStripHTML(opts) {
    opts = opts || {};
    const formName = opts.formName || "landing-search";
    const inputId = opts.inputId || "landing-q";
    const placeholder = opts.placeholder || "Предмет, тема, навык или репетитор (UX/UI, Python, ОГЭ)…";
    const val = esc(opts.query || "");
    const submitted = !!opts.submitted;
    const chips = Array.isArray(opts.chips) ? opts.chips : [];
    const chipAction = opts.chipAction || "hero-cat";
    const activeChip = opts.activeChip || "";
    const filterAction = opts.filterAction || "";

    return `<div class="land-search-strip" aria-label="${esc(opts.ariaLabel || "Быстрый поиск по каталогу репетиторов")}">
      <form class="land-search-bar" data-f="${esc(formName)}">
        ${icon("search")}
        <input type="text" id="${esc(inputId)}" name="q" placeholder="${esc(placeholder)}" autocomplete="off" value="${val}">
        ${filterAction ? `<button type="button" class="btn soft sm" data-a="${esc(filterAction)}">Фильтры</button>` : ""}
        <button type="submit" class="btn${submitted ? " is-confirmed" : ""}">${submitted ? "✓ Найдено" : "Найти"}</button>
      </form>
      ${chips.length ? `<div class="chip-rail swipe" role="group" aria-label="Быстрый выбор направления">${chips.map((c) => {
        const id = Array.isArray(c) ? c[0] : c.id;
        const label = Array.isArray(c) ? c[1] : c.label;
        const on = activeChip && activeChip === id;
        return `<button type="button" class="chip-btn${on ? " on" : ""}" data-a="${esc(chipAction)}" data-subj="${esc(id)}">${esc(label)}</button>`;
      }).join("")}</div>` : ""}
    </div>`;
  }

  function sakhaButtonsHTML(opts) {
    opts = opts || {};
    const kunActive = !!opts.kunActive;
    const starActive = !!opts.starActive;
    const patternSent = !!opts.patternSent;
    const medallionAction = opts.medallionAction || "land-sakha-medallion";
    const diamondAction = opts.diamondAction || "land-sakha-diamond";
    const patternAction = opts.patternAction || "land-sakha-pattern";
    const compact = !!opts.compact;

    return `<div class="sakha-ornament-row">
      <div class="sakha-ornament-unit">
        <button type="button" class="sakha-medallion-btn${kunActive ? " is-confirmed" : ""}" data-a="${esc(medallionAction)}" aria-pressed="${kunActive}" aria-label="Күн Оһуор — круглая орнаментная кнопка Саха" title="Нажми на солнечный медальон Күн Оһуор">
          ${sakhaPatternSVG("kun", 52)}
        </button>
        <div class="stack" style="gap:2px;min-width:0">
          <b>${compact ? "Күн Оһуор" : "Кнопка-медальон «Күн Оһуор»"}</b>
          <span class="small muted">${kunActive ? (compact ? "Активен" : "✓ Фильтр анкет Ykt / Саха активен") : (compact ? "Солнечный медальон" : "Нажми на круглый узор — откроются анкеты")}</span>
        </div>
      </div>

      <div class="sakha-ornament-unit">
        <button type="button" class="sakha-diamond-btn${starActive ? " is-confirmed" : ""}" data-a="${esc(diamondAction)}" aria-pressed="${starActive}" aria-label="Сулус — ромб-орнамент Саха" title="Нажми на ромб-орнамент Сулус">
          <span class="sakha-diamond-frame">${sakhaPatternSVG("star", 34)}</span>
        </button>
        <div class="stack" style="gap:2px;min-width:0">
          <b>${compact ? "Сулус · Звезда" : "Ромб-кнопка «Сулус»"}</b>
          <span class="small muted">${starActive ? (compact ? "Выбран" : "✓ Выбран режим Сулус") : (compact ? "Геометрический ромб" : "8-лучевой алмазный орнамент Саха")}</span>
        </div>
      </div>

      <button type="button" class="btn sakha-pattern${patternSent ? " is-confirmed" : ""}" data-a="${esc(patternAction)}">
        ${sakhaPatternSVG("rhombus", 20)}
        <span>${patternSent ? (compact ? "✓ Сөп · Ставка отправлена" : "✓ Сөп · Заявка отправлена") : "Сөп · Предложить ставку"}</span>
        ${sakhaPatternSVG("lattice", 20)}
      </button>
    </div>`;
  }

  function marqueePillsHTML(opts) {
    opts = opts || {};
    const universe = Array.isArray(opts.universe) ? opts.universe : [];
    const deals = Array.isArray(opts.deals) ? opts.deals : [];
    const row1 = universe.map((it) => {
      const goal = it.label.indexOf("ЕГЭ") >= 0 ? "ЕГЭ" : (it.label.indexOf("ОГЭ") >= 0 ? "ОГЭ" : "all");
      return `<button type="button" class="marquee-pill" data-a="hero-cat" data-subj="${esc(it.subject)}" data-exam="${goal}"><b>${esc(it.label)}</b><span>${esc(it.meta)}</span></button>`;
    }).join("");
    const row2 = deals.map((d) => {
      return `<button type="button" class="marquee-pill" data-a="land-scroll" data-target="land-market"><b>${esc(d.topic)} · ${Number(d.paid || 0).toLocaleString("ru-RU")} ₽/ч</b><span>${esc(d.tag)}</span></button>`;
    }).join("");
    return { row1, row2 };
  }

  function rateBenchCardHTML(spec) {
    spec = spec || {};
    const sid = esc(spec.sid || "bio");
    const title = esc(spec.title || "Предмет");
    const minRate = Number(spec.minRate) || 1100;
    const maxRate = Number(spec.maxRate) || 1800;
    const avgMarket = Number(spec.avgMarket) || 1800;
    const savePct = spec.savePct != null ? Number(spec.savePct) : Math.max(10, Math.round(((avgMarket - minRate) / Math.max(1, avgMarket)) * 100));
    const barPct = spec.barPct != null ? Number(spec.barPct) : Math.max(32, Math.min(88, Math.round((minRate / Math.max(1, avgMarket)) * 100)));
    const hasPro = !!spec.hasPro;
    const tag = spec.action || "hero-cat";
    const isInteractive = spec.clickable !== false;
    const tagOpen = isInteractive
      ? `<button type="button" class="rate-bench-card" data-a="${esc(tag)}" data-subj="${sid}" data-exam="all">`
      : `<div class="rate-bench-card" style="cursor:default">`;
    const tagClose = isInteractive ? "</button>" : "</div>";
    const pillHTML = spec.pillText
      ? `<span class="chip confirm num">${esc(spec.pillText)}</span>`
      : (hasPro
        ? `<span class="diff-tag pro">Профи до ${maxRate.toLocaleString("ru-RU")} ₽</span>`
        : `<span class="diff-tag save-cyan num">−${savePct}%</span>`);

    return `${tagOpen}
      <div class="row between" style="gap:6px;flex-wrap:wrap">
        <b style="font-size:15px">${title}</b>
        ${pillHTML}
      </div>
      ${spec.hideHeadline ? "" : `<div class="hh-price-row">
        <s class="hh-price-old num">${avgMarket.toLocaleString("ru-RU")} ₽</s>
        <b class="hh-price-now num">от ${minRate.toLocaleString("ru-RU")} ₽/ч</b>
      </div>`}
      <div class="rate-bars">
        <div class="rate-bar-row">
          <span class="muted">Рынок</span>
          <div class="rate-bar-track"><div class="rate-bar-fill" style="width:100%"></div></div>
          <span class="muted num">${avgMarket.toLocaleString("ru-RU")} ₽</span>
        </div>
        <div class="rate-bar-row">
          <span>У нас</span>
          <div class="rate-bar-track"><div class="rate-bar-fill ours" style="width:${barPct}%"></div></div>
          <b class="num" style="color:var(--accent)">${minRate.toLocaleString("ru-RU")} ₽</b>
        </div>
      </div>
      ${spec.footNote === "" ? "" : `<span class="small muted">${esc(spec.footNote || "Нажми, чтобы открыть анкеты →")}</span>`}
    ${tagClose}`;
  }

  function trustStripHTML(opts) {
    opts = opts || {};
    const title = opts.title || "Защита баланса · 0 ₽ лишних списаний до подтверждения";
    const desc = opts.desc || "Деньги бронируются только на время ожидания ответа. Если репетитор не подошёл — бесплатная замена за 15 мин с сохранением остатка.";
    const hideLink = !!opts.hideLink;
    return `<div class="land-trust-strip" aria-label="Гарантии оплаты и баланса">
      <div class="row" style="gap:12px;align-items:center;flex:1 1 280px;min-width:0">
        <span class="land-trust-ico" aria-hidden="true">${icon("shield")}</span>
        <div class="stack" style="gap:2px;min-width:0">
          <b>${esc(title)}</b>
          <span class="small ink2">${esc(desc)}</span>
        </div>
      </div>
      ${hideLink ? "" : `<a href="/fees" class="btn ghost sm" data-a="go" data-v="fees">Правила оплаты и защиты →</a>`}
    </div>`;
  }

  function reviewCardHTML(r) {
    r = r || {};
    const newPrice = Number(r.newPrice) || 950;
    const oldPrice = Number(r.oldPrice) || 1250;
    const rating = r.rating || "5.0";
    const savePct = oldPrice > newPrice ? Math.round((1 - newPrice / oldPrice) * 100) : 0;
    return `<article class="review-card">
      <div class="review-top">
        <span class="diff-tag ${r.pro ? "pro" : "confirm"}">${esc(r.badge || "Занятие состоялось")}</span>
        <span class="chip good num review-rating" title="Оценка ученика">${icon("star")}<span>${esc(rating)}</span></span>
      </div>
      <p class="review-quote">«${esc(r.text || "")}»</p>
      <div class="review-foot">
        <div class="review-author">
          <span class="tutor-avatar review-av" aria-hidden="true">${esc(initials(r.name || "ВЕ"))}</span>
          <div class="stack" style="gap:1px;min-width:0">
            <span class="row" style="gap:5px"><b style="font-size:14px">${esc(r.name || "")}</b><span class="verified-badge sm" title="Подтверждённый отзыв">${icon("check")}</span></span>
            <span class="small muted">${esc(r.role || "")}</span>
          </div>
        </div>
        <div class="hh-price-row review-price-row">
          ${r.pro
            ? `<b class="review-price-now num">Ставка от ${newPrice.toLocaleString("ru-RU")} ₽/ч</b><span class="diff-tag pro">Профи</span>`
            : `<s class="hh-price-old num">${oldPrice.toLocaleString("ru-RU")} ₽</s><b class="review-price-now num">${newPrice.toLocaleString("ru-RU")} ₽/ч</b>${savePct > 0 ? `<span class="diff-tag confirm num">−${savePct}%</span>` : ""}`}
        </div>
      </div>
    </article>`;
  }

  function faqListHTML(items, openIdx, actionName) {
    const act = esc(actionName || "land-faq");
    const open = Number.isFinite(Number(openIdx)) ? Number(openIdx) : 0;
    return `<div class="land-faq-list">
      ${(items || []).map((item, idx) => {
        const isOpen = open === idx;
        return `<div class="faq-item${isOpen ? " open" : ""}">
          <button type="button" class="faq-btn" data-a="${act}" data-i="${idx}" aria-expanded="${isOpen}">
            <span>${esc(item.q)}</span>
            <span class="faq-chev">${icon("chevDown")}</span>
          </button>
          ${isOpen ? `<div class="faq-ans">${esc(item.a)}${item.hasFeesLink ? ` <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent);font-weight:600">Подробнее об оплате и правилах расчётов →</a>` : ""}</div>` : ""}
        </div>`;
      }).join("")}
    </div>`;
  }

  function blueBannerHTML(opts) {
    opts = opts || {};
    const title = opts.title || "Дизайн-система и брендбук (Белый + Чёрный OLED + Синий)";
    const subtitle = opts.subtitle || "";
    const pLabel = opts.primaryLabel || "Открыть брендбук";
    const pAction = opts.primaryAction || "go";
    const pVal = opts.primaryVal || "brandbook";
    const pTarget = opts.primaryTarget || "";
    const sLabel = opts.secondaryLabel || "";
    const sAction = opts.secondaryAction || "land-scroll";
    const sTarget = opts.secondaryTarget || "land-market";

    return `<div class="hh-blue-banner">
      <div class="stack" style="gap:4px;max-width:60ch">
        <b style="font-size:20px">${esc(title)}</b>
        ${subtitle ? `<span class="small">${esc(subtitle)}</span>` : ""}
      </div>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn white" data-a="${esc(pAction)}"${pVal ? ` data-v="${esc(pVal)}"` : ""}${pTarget ? ` data-target="${esc(pTarget)}"` : ""}>${esc(pLabel)}</button>
        ${sLabel ? `<button type="button" class="btn blue-ghost" data-a="${esc(sAction)}"${sTarget ? ` data-target="${esc(sTarget)}"` : ""}>${esc(sLabel)}</button>` : ""}
      </div>
    </div>`;
  }

  /* Единое оранжевое уведомление брендбука (--notif #F97316) для бокового тоста и статуса отправки. */
  function sideToastInnerHTML(opts) {
    opts = opts || {};
    const title = opts.title || "Уведомление";
    const body = opts.message != null
      ? opts.message
      : (opts.msg != null ? opts.msg : (opts.subtitle != null ? opts.subtitle : ""));
    const closeAction = opts.closeAction !== undefined ? opts.closeAction : "toast-close";
    const showClose = opts.showClose !== false && !!closeAction;
    const badgeText = opts.badgeText || "";
    const badgeClass = opts.badgeClass || "chip notif";
    const rightEl = showClose
      ? `<button type="button" class="toast-close" data-a="${esc(closeAction)}" aria-label="${esc(opts.closeLabel || "Убрать уведомление")}">×</button>`
      : (badgeText ? `<span class="${esc(badgeClass)}" style="flex:none">${esc(badgeText)}</span>` : "");

    return `<span class="toast-side-row">
      <span class="bb-pulse-dot" style="margin-top:5px;flex:0 0 auto" aria-hidden="true"></span>
      <span class="toast-side-copy">
        <b>${esc(title)}</b>
        <span>${esc(body)}</span>
      </span>
      ${rightEl}
    </span>`;
  }

  function sentNoticeHTML(opts) {
    opts = opts || {};
    const slot = opts.slot || "13:00";
    const offerNum = Number(opts.offer) || 1100;
    const title = opts.title || "Предложение передано преподавателю";
    const subtitle = opts.subtitle || `Ставка ${offerNum.toLocaleString("ru-RU")} ₽/ч на ${slot} отправлена — уведомим об ответе`;
    return sideToastInnerHTML({
      title,
      message: subtitle,
      closeAction: opts.closeAction || "",
      showClose: !!opts.closeAction,
      badgeText: opts.badgeText || "",
      badgeClass: opts.badgeClass || "chip notif"
    });
  }

  function topBalanceWidgetHTML(opts) {
    opts = opts || {};
    const isTutor = opts.role === "tutor";
    const amount = Math.max(0, Math.round(Number(opts.amountRub != null ? opts.amountRub : opts.amount) || 0));
    const funded = isTutor ? true : (opts.funded !== undefined ? !!opts.funded : amount >= 5000);
    const pillAction = opts.pillAction || (isTutor ? "tc-payout-open" : "bal-open");
    const btnAction = opts.btnAction || pillAction;
    const ariaLabel = opts.ariaLabel || (isTutor ? "Баланс преподавателя" : "Баланс ученика");
    const pillTitle = opts.pillTitle || (isTutor ? "Баланс и вывод средств" : "Баланс и тарифы");
    const btnLabel = opts.btnLabel || (isTutor ? "Вывести" : "Пополнить");
    const btnAria = opts.btnAriaLabel || (isTutor ? "Вывести средства" : "Пополнить баланс");
    const pillCls = "top-bal-pill" + (funded ? " is-funded" : "") + (isTutor ? " is-tutor" : "");
    const btnCls = "top-bal-btn" + (isTutor ? " is-payout" : "");
    const lblHTML = (!isTutor && !opts.compact) ? `<span class="top-bal-lbl muted">Баланс:</span>` : "";

    return `<div class="top-bal-wrap" aria-label="${esc(ariaLabel)}">
      <button type="button" class="${pillCls}" data-a="${esc(pillAction)}" title="${esc(pillTitle)}">
        ${icon("wallet")}
        ${lblHTML}
        <b class="num">${amount.toLocaleString("ru-RU")} ₽</b>
      </button>
      <button type="button" class="${btnCls}" data-a="${esc(btnAction)}" aria-label="${esc(btnAria)}" title="${esc(btnAria)}">${icon(isTutor ? "upload" : "plus")}<span>${esc(btnLabel)}</span></button>
    </div>`;
  }

  function tutorBalanceDockHTML(opts) {
    opts = opts || {};
    const available = Math.max(0, Math.round(Number(opts.availableRub != null ? opts.availableRub : opts.available) || 0));
    const escrow = Math.max(0, Math.round(Number(opts.escrowRub != null ? opts.escrowRub : opts.escrow) || 0));
    const action = opts.action || "tc-payout-open";
    const label = opts.label || "Баланс преподавателя";
    const btnLabel = opts.btnLabel || "Вывести";
    const cls = "tutor-bal-dock" + (opts.inlinePreview ? " is-inline-preview" : "");
    return `<div class="${cls}" role="region" aria-label="${esc(label)}">
      <span class="tutor-bal-ico" aria-hidden="true">${icon("wallet")}</span>
      <div class="tutor-bal-meta">
        <span class="tutor-bal-lbl">${esc(label)}</span>
        <div class="tutor-bal-val">
          <b class="num">${available.toLocaleString("ru-RU")} ₽</b>
          <span class="tutor-bal-escrow num">в резерве ${escrow.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>
      <button type="button" class="btn sm confirm" data-a="${esc(action)}">${esc(btnLabel)}</button>
    </div>`;
  }

  function sideTutorBalanceHTML(opts) {
    opts = opts || {};
    const available = Math.max(0, Math.round(Number(opts.availableRub != null ? opts.availableRub : opts.available) || 0));
    const escrow = Math.max(0, Math.round(Number(opts.escrowRub != null ? opts.escrowRub : opts.escrow) || 0));
    const action = opts.action || "tc-payout-open";
    const widget = topBalanceWidgetHTML({
      role: "tutor",
      amountRub: available,
      compact: true,
      pillAction: action,
      btnAction: action,
      btnLabel: "Вывести",
      ariaLabel: opts.ariaLabel || "Баланс преподавателя"
    });
    return `<div class="side-tutor-bal">${widget}<div class="small muted num" style="padding:2px 4px 0">В резерве: ${escrow.toLocaleString("ru-RU")} ₽</div></div>`;
  }

  function walletSummaryBarHTML(opts) {
    opts = opts || {};
    const amount = Math.max(0, Math.round(Number(opts.amountRub != null ? opts.amountRub : opts.amount) || 0));
    const amountText = opts.amountLabel || (amount.toLocaleString("ru-RU") + " ₽");
    const extraClass = opts.extraClass ? (" " + esc(opts.extraClass)) : "";
    const labelBlock = opts.labelHTML
      ? `<span class="small muted">${opts.labelHTML}</span>`
      : (opts.label ? `<span class="small muted">${esc(opts.label)}</span>` : "");
    const numStyle = opts.amountStyle ? ` style="${esc(opts.amountStyle)}"` : "";
    const numEl = `<span class="${esc(opts.amountClass || "wallet-num num")}"${numStyle}>${esc(amountText)}</span>`;
    const amountBlock = opts.inlineNote
      ? `<div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap">${numEl}<span class="small muted">${esc(opts.inlineNote)}</span></div>`
      : numEl;
    const subBlock = opts.subNote ? `<span class="small muted">${esc(opts.subNote)}</span>` : "";

    let rightBlock = "";
    if (opts.rightHTML) {
      rightBlock = opts.rightHTML;
    } else if (Array.isArray(opts.actions) && opts.actions.length) {
      rightBlock = `<div class="row" style="gap:8px;flex-wrap:wrap">${opts.actions.map((a) => {
        const ico = a.icon ? icon(a.icon) : "";
        const valAttr = a.dataVal !== undefined ? ` data-v="${esc(a.dataVal)}"` : "";
        return `<button type="button" class="${esc(a.cls || "btn soft sm")}" data-a="${esc(a.action || "bb-demo-toast")}"${valAttr}>${ico}<span>${esc(a.label || "")}</span></button>`;
      }).join("")}</div>`;
    } else if (opts.badge && opts.badge.text) {
      rightBlock = `<span class="chip ${esc(opts.badge.cls || "confirm")}">${esc(opts.badge.text)}</span>`;
    }

    return `<div class="wallet-bar${extraClass}">
      <div class="stack" style="gap:2px;min-width:0">
        ${labelBlock}
        ${amountBlock}
        ${subBlock}
      </div>
      ${rightBlock}
    </div>`;
  }

  function emptyStateHTML(opts) {
    opts = opts || {};
    const title = opts.title || "Пока ничего не найдено";
    const subtitle = opts.subtitle || opts.desc || "Попробуйте ослабить фильтры или сбросить поиск.";
    const actionLabel = opts.actionLabel || "";
    const action = opts.action || "bb-demo-toast";
    const valAttr = opts.actionVal !== undefined ? ` data-v="${esc(opts.actionVal)}"` : "";
    const ico = opts.iconName ? `<span class="muted" aria-hidden="true">${icon(opts.iconName)}</span>` : "";
    return `<div class="empty${opts.cls ? " " + esc(opts.cls) : ""}">
      ${ico}
      <b>${esc(title)}</b>
      <span class="small muted">${esc(subtitle)}</span>
      ${actionLabel ? `<button type="button" class="btn soft sm" data-a="${esc(action)}"${valAttr}>${esc(actionLabel)}</button>` : ""}
    </div>`;
  }

  function skeletonCardHTML(opts) {
    opts = opts || {};
    const widths = Array.isArray(opts.widths) && opts.widths.length ? opts.widths : ["62%", "94%", "45%"];
    const header = (opts.title || opts.badge)
      ? `<div class="row between" style="gap:8px;flex-wrap:wrap">${opts.title ? `<b>${esc(opts.title)}</b>` : "<span></span>"}${opts.badge ? `<span class="bb-spec-pill">${esc(opts.badge)}</span>` : ""}</div>`
      : "";
    const bars = widths.map((w, idx) => {
      const h = idx === 1 ? ";height:18px" : "";
      return `<div class="bb-skel-bar" style="width:${esc(w)}${h}"></div>`;
    }).join("");
    const foot = opts.footer ? `<span class="small muted">${esc(opts.footer)}</span>` : "";
    return `<div class="card pad stack" style="gap:10px">
      ${header}
      ${bars}
      ${foot}
    </div>`;
  }

  function pipelineStageCardHTML(opts) {
    opts = opts || {};
    const engine = opts.engine || "postgres";
    const statusMap = {
      ok: "is-confirmed",
      pending: "is-pending",
      info: "is-info",
      warn: "is-pending"
    };
    const stCls = statusMap[opts.status || "ok"] || "is-info";
    return `<article class="card pad bb-pipe-card" data-engine="${esc(engine)}">
      <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
        <b style="font-size:15px">${esc(opts.title || "Pipeline Stage")}</b>
        <span class="bb-tbl-st ${stCls}">${esc(opts.statusLabel || "Active")}</span>
      </div>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        ${opts.stage ? `<span class="chip accent">${esc(opts.stage)}</span>` : ""}
        <span class="chip">${esc(engine)}</span>
      </div>
      <div class="bb-pipe-metrics">
        <div class="bb-pipe-metric"><span>Latency</span><b class="num">${esc(opts.latencyMs || "—")}</b></div>
        <div class="bb-pipe-metric"><span>Throughput</span><b class="num">${esc(opts.throughput || "—")}</b></div>
        <div class="bb-pipe-metric"><span>Freshness</span><b class="num">${esc(opts.freshness || "—")}</b></div>
      </div>
      ${opts.target ? `<code class="bb-pipe-target">${esc(opts.target)}</code>` : ""}
      ${opts.notes ? `<span class="small muted">${esc(opts.notes)}</span>` : ""}
    </article>`;
  }

  const DEFAULT_TELEMETRY_EVENTS = [
    { event_id: "evt-901", occurred_at: "14:48:02", event_type: "bid_offer", role: "student", view: "market", engine: "postgres", payloadSummary: "tutor=t-aytal · offer=1 100 ₽/ч · slot=14:00" },
    { event_id: "evt-902", occurred_at: "14:48:09", event_type: "outbox_enqueued", role: "system", view: "api", engine: "kafka", payloadSummary: "topic=vektor.market.bids.v1 · partition=2 · offset=41820" },
    { event_id: "evt-903", occurred_at: "14:48:15", event_type: "silver_dedup_batch", role: "etl", view: "polars", engine: "polars", payloadSummary: "rows_in=2 480 · dedup=2 412 · write=gold/subject_price_mart.parquet" },
    { event_id: "evt-904", occurred_at: "14:48:24", event_type: "dag_task_success", role: "scheduler", view: "airflow", engine: "airflow", payloadSummary: "dag=vektor_medallion_hourly · task=refresh_gold_pg · dur=1.4s" },
    { event_id: "evt-905", occurred_at: "14:48:31", event_type: "payout_intent", role: "tutor", view: "cabinet", engine: "postgres", payloadSummary: "channel=sbp · amount=5 000 ₽ · npd_receipt=pending" },
    { event_id: "evt-906", occurred_at: "14:48:39", event_type: "clickstream_batch", role: "student", view: "study", engine: "kafka", payloadSummary: "topic=vektor.user.clickstream.v1 · batch=18 · sendBeacon=ok" }
  ];

  function eventLogFeedHTML(opts) {
    opts = opts || {};
    const filter = opts.filterEngine && opts.filterEngine !== "all" ? opts.filterEngine : "";
    const src = Array.isArray(opts.events) && opts.events.length ? opts.events : DEFAULT_TELEMETRY_EVENTS;
    const rows = (filter ? src.filter((ev) => ev.engine === filter) : src).slice(0, Number(opts.maxItems) || 6);
    const title = opts.title || "Поток пользовательских логов и событий (telemetry.user_events)";

    return `<div class="bb-log-feed" role="region" aria-label="${esc(title)}">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${esc(title)}</b>
        <span class="bb-spec-pill num">${rows.length} событий</span>
      </div>
      ${rows.length
        ? `<div class="bb-log-list">${rows.map((ev) => `<div class="bb-log-row" data-engine="${esc(ev.engine || "postgres")}">
            <span class="bb-log-ts num">${esc(ev.occurred_at || "00:00:00")}</span>
            <span class="bb-log-type">${esc(ev.event_type || "event")}</span>
            <span class="chip" style="font-size:11px">${esc((ev.role || "user") + " · " + (ev.view || "app"))}</span>
            <span class="bb-log-payload">${esc(ev.payloadSummary || "")}</span>
          </div>`).join("")}</div>`
        : emptyStateHTML({ title: "Нет событий для выбранного движка", subtitle: "Сбросьте фильтр на «Все», чтобы увидеть полный поток.", actionLabel: "Показать все", action: "bb-pipe-filter", actionVal: "all" })}
    </div>`;
  }

  const MSG_SVGS = {
    wa: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L4 20l1.2-4.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M9.5 9.2c.3 2 2 3.8 4 4.3l1.2-.9c.3-.2.7-.2 1 0l1 .6"/></svg>`,
    tg: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4L3.6 10.9c-.8.3-.8 1.5.1 1.7l4.5 1.4 1.7 5.2c.2.7 1.1.9 1.6.3l2.6-2.8 4.4 3.2c.6.4 1.4.1 1.6-.6L22 5.2c.2-.8-.4-1.4-1-1.2z"/><path d="M8.2 14l9.6-6.2"/></svg>`,
    max: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="14" rx="5"/><path d="M8 14.5v-5l4 3.5 4-3.5v5"/></svg>`
  };

  function normalizePhoneDigits(raw) {
    let d = String(raw == null ? "" : raw).replace(/\D+/g, "");
    if (!d) return "";
    if (d.charAt(0) === "8") d = "7" + d.slice(1);
    else if (d.charAt(0) === "9") d = "7" + d;
    else if (d.charAt(0) !== "7") d = "7" + d;
    return d.slice(0, 11);
  }

  function formatPhoneMask(raw) {
    const d = normalizePhoneDigits(raw);
    if (!d) return "";
    if (d.length <= 1) return "+7";
    if (d.length <= 4) return "+7 (" + d.slice(1);
    if (d.length <= 7) return "+7 (" + d.slice(1, 4) + ") " + d.slice(4);
    if (d.length <= 9) return "+7 (" + d.slice(1, 4) + ") " + d.slice(4, 7) + "-" + d.slice(7);
    return "+7 (" + d.slice(1, 4) + ") " + d.slice(4, 7) + "-" + d.slice(7, 9) + "-" + d.slice(9, 11);
  }

  function formatTelegramContact(raw) {
    const str = String(raw == null ? "" : raw).trim();
    if (!str) return "";
    if (str.charAt(0) === "@" || /[a-zA-Z]/.test(str)) {
      const clean = str.replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "").slice(0, 32);
      return "@" + clean;
    }
    return formatPhoneMask(str);
  }

  function entitySlug(entity) {
    const explicit = entity && (entity.telegram || entity.tg || entity.handle || entity.username);
    if (explicit && /[a-zA-Z]/.test(String(explicit))) {
      const clean = String(explicit).replace(/^@+/, "").replace(/[^a-zA-Z0-9_]/g, "");
      if (clean) return clean;
    }
    const idPart = String((entity && entity.id) || "").replace(/[^a-zA-Z0-9_]/g, "");
    return idPart ? ("vektor_ege_" + idPart) : "vektor_ege_support";
  }

  function whatsappUrl(entity, message) {
    const phone = normalizePhoneDigits((entity && (entity.whatsapp || entity.phone)) || "79142100100") || "79142100100";
    const text = message || ("Здравствуйте" + (entity && entity.name ? (", " + entity.name) : "") + "! Пишу с платформы Вектор ЕГЭ по поводу занятий (" + ((entity && entity.subjectName) || "подготовка") + ").");
    return "https://wa.me/" + phone + "?text=" + encodeURIComponent(text);
  }

  function telegramUrl(entity, message) {
    const rawTg = entity && (entity.telegram || entity.tg || entity.handle || entity.username);
    const tgStr = String(rawTg == null ? "" : rawTg).trim();
    const text = message || ("Здравствуйте" + (entity && entity.name ? (", " + entity.name) : "") + "! Пишу с платформы Вектор ЕГЭ по поводу занятий.");
    const tgDigits = normalizePhoneDigits(tgStr);
    if (tgStr && !/[a-zA-Z]/.test(tgStr) && tgDigits.length >= 10) {
      return "https://t.me/+" + tgDigits + "?text=" + encodeURIComponent(text);
    }
    return "https://t.me/" + encodeURIComponent(entitySlug(entity)) + "?text=" + encodeURIComponent(text);
  }

  function maxUrl(entity, message) {
    const slug = String((entity && entity.maxHandle) || entitySlug(entity)).replace(/^@/, "");
    const text = message || ("Здравствуйте" + (entity && entity.name ? (", " + entity.name) : "") + "! Пишу с платформы Вектор ЕГЭ.");
    return "https://max.ru/" + encodeURIComponent(slug) + "?text=" + encodeURIComponent(text);
  }

  function resolveMessengerUrls(entity, message) {
    return {
      whatsapp: whatsappUrl(entity, message),
      telegram: telegramUrl(entity, message),
      max: maxUrl(entity, message)
    };
  }

  function messengerLinksHTML(opts) {
    opts = opts || {};
    const urls = resolveMessengerUrls(opts.entity || {}, opts.message || "");
    const compact = !!opts.compact;
    const waLbl = opts.primaryLabel || "WhatsApp";
    const tgLbl = opts.tgLabel || "Telegram";
    const maxLbl = opts.maxLabel || "MAX";
    const extraAttr = opts.dataAction
      ? (` data-a="${esc(opts.dataAction)}"` + (opts.dataId ? ` data-id="${esc(opts.dataId)}"` : ""))
      : "";
    return `<div class="msg-channel-bar${compact ? " is-compact" : ""}" role="group" aria-label="Написать через мессенджер">
      <a class="btn-msg is-wa" href="${esc(urls.whatsapp)}" target="_blank" rel="noopener"${extraAttr} title="Написать в WhatsApp">${MSG_SVGS.wa}<span>${esc(waLbl)}</span></a>
      <a class="btn-msg is-tg" href="${esc(urls.telegram)}" target="_blank" rel="noopener"${extraAttr} title="Написать в Telegram">${MSG_SVGS.tg}<span>${esc(tgLbl)}</span></a>
      <a class="btn-msg is-max" href="${esc(urls.max)}" target="_blank" rel="noopener"${extraAttr} title="Написать в MAX">${MSG_SVGS.max}<span>${esc(maxLbl)}</span></a>
    </div>`;
  }

  function realtimeStatusPillHTML(opts) {
    opts = opts || {};
    const rawMode = String(opts.mode || "local").toLowerCase();
    const mode = (rawMode === "sse" || rawMode === "ws" || rawMode === "connecting") ? rawMode : "local";
    const labels = {
      sse: "Live · SSE",
      ws: "Live · WS",
      connecting: "Подключение…",
      local: "Табы · Офлайн"
    };
    const text = opts.label || labels[mode];
    const channelLabel = opts.channelLabel ? String(opts.channelLabel) : "";
    const unread = Number(opts.unreadCount || 0) || 0;
    const actAttr = opts.actAttr || "data-a";
    const action = opts.action ? ` ${actAttr}="${esc(opts.action)}"` : "";
    const tag = opts.action ? "button" : "span";
    const typeAttr = opts.action ? ' type="button"' : "";
    const titleAttr = opts.title ? ` title="${esc(opts.title)}"` : "";
    return `<${tag}${typeAttr} class="rt-status-pill is-${esc(mode)}"${action}${titleAttr} aria-live="polite">
      <span class="rt-status-dot" aria-hidden="true"></span>
      <span>${esc(text)}</span>
      ${channelLabel ? `<span class="rt-status-chan">· ${esc(channelLabel)}</span>` : ""}
      ${unread > 0 ? `<span class="badge accent num">+${unread}</span>` : ""}
    </${tag}>`;
  }

  function calendarSyncCardHTML(opts) {
    opts = opts || {};
    const tz = opts.timezone === "UTC+3" ? "UTC+3" : "UTC+9";
    const city = opts.city || (tz === "UTC+3" ? "Москва" : "Якутск");
    const tzShort = tz === "UTC+3" ? "Мск" : "Якт";
    const sampleLocal = tz === "UTC+3" ? "10:00 Мск" : "16:00 Якт";
    const ianaTz = tz === "UTC+3" ? "Europe/Moscow" : "Asia/Yakutsk";
    const gcalConnected = !!opts.gcalConnected;
    const icsUrl = opts.icsUrl || "/api/calendar/tutor-demo.ics";
    const gcalSubUrl = opts.googleSubscribeUrl || ("https://calendar.google.com/calendar/u/0/r?cid=" + encodeURIComponent(icsUrl));
    const gcalTplUrl = opts.googleTemplateUrl || ("https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Урок ЕГЭ · Вектор ЕГЭ") + "&ctz=" + encodeURIComponent(ianaTz));
    const eventCount = Number(opts.eventCount || 0) || 0;
    const busySlots = Array.isArray(opts.busySlots) ? opts.busySlots : [];
    const conflictsCount = Number(opts.conflictsCount || 0) || 0;
    const actAttr = opts.actAttr || "data-a";
    const syncAction = opts.syncAction || "tc-cal-sync";
    const copyAction = opts.copyAction || "tc-cal-copy-ics";
    const importSampleAction = opts.importSampleAction || "tc-cal-import-sample";
    const importOpenAction = opts.importOpenAction || "tc-cal-import-modal";
    const tzAction = opts.tzAction || "";

    const DOW_SHORT_RU = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
    const busyPills = busySlots.slice(0, 6).map(slot => {
      const dowFallback = (slot && slot.dow !== undefined && slot.dow !== null && slot.dow !== "")
        ? (DOW_SHORT_RU[Number(slot.dow)] || "")
        : "";
      const dayLbl = (slot && (slot.dayLabel || slot.day || dowFallback)) || "";
      const hourLbl = (slot && slot.hour) || "";
      const sum = (slot && slot.summary) || "Занято в GCal";
      const label = [dayLbl, hourLbl, sum].filter(Boolean).join(" · ");
      return `<span class="badge">${esc(label)}</span>`;
    }).join("");

    const tzButtons = tzAction
      ? `<div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn sm ${tz === "UTC+9" ? "primary" : "ghost"}" ${actAttr}="${esc(tzAction)}" data-v="UTC+9">Якутск (UTC+9)</button>
          <button type="button" class="btn sm ${tz === "UTC+3" ? "primary" : "ghost"}" ${actAttr}="${esc(tzAction)}" data-v="UTC+3">Москва (UTC+3)</button>
        </div>`
      : "";

    return `<div class="cal-sync-card">
      <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:flex-start">
        <div style="min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b>Двусторонняя синхронизация .ics / Google Calendar</b>
            <span class="badge ${gcalConnected ? "ok" : "accent"}">${gcalConnected ? "GCal подключён" : "Готово к подписке"}</span>
          </div>
          <div class="small muted" style="margin-top:4px">${esc(city)} (${esc(tz)} · ${esc(ianaTz)}) · 07:00 UTC → <b>${esc(sampleLocal)}</b> <span class="muted">(справка: 16:00 Якт / 10:00 Мск)</span></div>
        </div>
        ${tzButtons}
      </div>

      <div class="cal-sync-metrics">
        <div class="cal-sync-metric"><span>Событий в .ics-ленте</span><b class="num">${eventCount}</b></div>
        <div class="cal-sync-metric"><span>Занято из GCal (${esc(tzShort)})</span><b class="num">${busySlots.length}</b></div>
        <div class="cal-sync-metric${conflictsCount > 0 ? " is-warn" : ""}"><span>Конфликты слотов</span><b class="num">${conflictsCount}</b></div>
      </div>

      <div class="cal-sync-url-row">
        <code>${esc(icsUrl)}</code>
        <button type="button" class="btn sm ghost" ${actAttr}="${esc(copyAction)}" data-url="${esc(icsUrl)}">Скопировать .ics URL</button>
      </div>

      <div class="cal-sync-actions">
        <button type="button" class="btn sm primary" ${actAttr}="${esc(syncAction)}">${icon("repeat")}<span>Синхронизировать .ics</span></button>
        <a class="btn sm ghost" href="${esc(gcalSubUrl)}" target="_blank" rel="noopener">Подписаться в Google Calendar</a>
        <a class="btn sm ghost" href="${esc(gcalTplUrl)}" target="_blank" rel="noopener">Создать событие в GCal</a>
        <button type="button" class="btn sm ghost" ${actAttr}="${esc(importSampleAction)}">Импорт теста GCal (.ics)</button>
        ${importOpenAction ? `<button type="button" class="btn sm ghost" ${actAttr}="${esc(importOpenAction)}">Вставить .ics</button>` : ""}
      </div>

      ${busySlots.length
        ? `<div class="cal-sync-busy-list">${busyPills}${busySlots.length > 6 ? `<span class="badge">+${busySlots.length - 6}</span>` : ""}</div>`
        : `<div class="small muted">Импортируйте внешний <code>.ics</code> из Google/Яндекс/Apple Calendar — занятые часы (UTC <code>Z</code>) автоматически пересчитаются в ${esc(tz)} и заблокируют пересечения.</div>`}
    </div>`;
  }

  function adminKpiGridHTML(items) {
    const list = Array.isArray(items) ? items : [];
    return `<div class="adm-kpi-grid">${list.map((it) => {
      it = it || {};
      const tone = String(it.tone || "accent").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-") || "accent";
      const actAttr = it.actAttr || "data-a";
      const hasAction = !!it.action;
      const actStr = hasAction
        ? ` ${actAttr}="${esc(it.action)}"${it.actionVal !== undefined ? ` data-v="${esc(it.actionVal)}"` : ""} role="button" tabindex="0"`
        : "";
      return `<article class="adm-kpi-card is-${esc(tone)}${hasAction ? " is-clickable" : ""}"${actStr}>
        <div class="adm-kpi-top">
          <span class="adm-kpi-lbl">${esc(it.label || "")}</span>
          ${it.delta ? `<span class="adm-kpi-delta num">${esc(it.delta)}</span>` : ""}
        </div>
        <b class="adm-kpi-val num">${esc(it.value != null ? String(it.value) : "0")}</b>
        ${it.note ? `<span class="adm-kpi-note">${esc(it.note)}</span>` : ""}
      </article>`;
    }).join("")}</div>`;
  }

  const ADMIN_MOD_LABELS = {
    verified: "Проверен ✓",
    pending: "На проверке",
    flagged: "Требует внимания",
    paid: "Выплачено ✓",
    frozen: "В резерве",
    published: "Отправлено в Kafka",
    declined: "Отклонено"
  };

  function adminModerationBadgeHTML(status, labelOverride) {
    const raw = String(status || "pending").trim().toLowerCase();
    const st = ADMIN_MOD_LABELS[raw] ? raw : "pending";
    const label = labelOverride != null && labelOverride !== "" ? String(labelOverride) : ADMIN_MOD_LABELS[st];
    return `<span class="adm-mod-badge is-${esc(st)}">${esc(label)}</span>`;
  }

  const ARCH_LAYER_LABELS = {
    "ui-kit": "UI-Kit",
    "headless-api": "Headless API",
    "spa-shell": "SPA Shell",
    postgresql: "PostgreSQL",
    polars: "Polars",
    airflow: "Airflow",
    grafana: "Grafana"
  };

  function serviceBoundaryCardHTML(opts) {
    opts = opts || {};
    const rawLayer = String(opts.layer || "ui-kit").trim();
    const layerSlug = rawLayer.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "ui-kit";
    const layerLabel = opts.layerLabel || ARCH_LAYER_LABELS[layerSlug] || rawLayer;
    const endpoints = Array.isArray(opts.endpoints) ? opts.endpoints : [];
    const statusRaw = String(opts.status || "live").trim();
    const statusOk = /^(live|ok|healthy|active|stateless|200)/i.test(statusRaw);
    return `<article class="arch-boundary-card is-${esc(layerSlug)}">
      <div class="arch-boundary-head">
        <div class="stack" style="gap:3px;min-width:0">
          <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
            <b>${esc(opts.name || layerLabel)}</b>
            <span class="chip">${esc(layerLabel)}</span>
            ${opts.port ? `<span class="bb-spec-pill num">:${esc(opts.port)}</span>` : ""}
          </div>
          ${opts.repo ? `<code class="arch-boundary-repo">${esc(opts.repo)}</code>` : ""}
        </div>
        <span class="bb-tbl-st ${statusOk ? "is-confirmed" : "is-info"}">${esc(statusRaw)}</span>
      </div>
      ${opts.summary ? `<p class="small muted" style="margin:0;line-height:1.45">${esc(opts.summary)}</p>` : ""}
      ${endpoints.length ? `<ul class="arch-endpoints">${endpoints.map((ep) => `<li><code>${esc(ep)}</code></li>`).join("")}</ul>` : ""}
      ${opts.note ? `<span class="small muted">${esc(opts.note)}</span>` : ""}
    </article>`;
  }

  function roleSwitchBannerHTML(opts) {
    opts = opts || {};
    const activeRole = ["student", "tutor", "admin"].includes(opts.activeRole) ? opts.activeRole : "student";
    const action = opts.action || "bb-role-switch";
    const actAttr = opts.actAttr || "data-a";
    const counts = opts.counts && typeof opts.counts === "object" ? opts.counts : {};
    const roles = [
      { id: "student", label: "Ученик", hint: "Поиск, тесты и заявки" },
      { id: "tutor", label: "Преподаватель", hint: "Кабинет, слоты 10–20 ч" },
      { id: "admin", label: "Админ", hint: "Модерация, НПД и Outbox" }
    ];
    return `<div class="role-switch-banner" role="group" aria-label="Переключение роли">
      <div class="role-switch-meta">
        <span class="eyebrow">Ролевой контур платформы</span>
        <span class="small muted">${esc((roles.find((r) => r.id === activeRole) || roles[0]).hint)}</span>
      </div>
      <div class="role-switch-pills">
        ${roles.map((r) => {
          const isAct = activeRole === r.id;
          const cnt = counts[r.id];
          return `<button type="button" class="role-switch-pill${isAct ? " is-active" : ""}" ${actAttr}="${esc(action)}" data-role="${r.id}" data-v="${r.id}" aria-pressed="${isAct}">
            <span>${esc(r.label)}</span>
            ${cnt != null ? `<span class="badge${isAct ? " accent" : ""} num">${esc(cnt)}</span>` : ""}
          </button>`;
        }).join("")}
      </div>
    </div>`;
  }

  EGE.kit = {
    CATALOG_CATEGORIES,
    CATALOG_ITEMS,
    HERO_COPY_VARIANTS,
    animateHeroCounters,
    initHeroFloaters,
    heroBannerHTML,
    searchStripHTML,
    sentNoticeHTML,
    sideToastInnerHTML,
    topBalanceWidgetHTML,
    tutorBalanceDockHTML,
    sideTutorBalanceHTML,
    walletSummaryBarHTML,
    emptyStateHTML,
    skeletonCardHTML,
    pipelineStageCardHTML,
    eventLogFeedHTML,
    realtimeStatusPillHTML,
    calendarSyncCardHTML,
    adminKpiGridHTML,
    adminModerationBadgeHTML,
    serviceBoundaryCardHTML,
    roleSwitchBannerHTML,
    sakhaButtonsHTML,
    marqueePillsHTML,
    rateBenchCardHTML,
    trustStripHTML,
    reviewCardHTML,
    faqListHTML,
    blueBannerHTML,
    normalizePhoneDigits,
    formatPhoneMask,
    formatTelegramContact,
    entitySlug,
    whatsappUrl,
    telegramUrl,
    maxUrl,
    resolveMessengerUrls,
    messengerLinksHTML,
    CHART_STYLE_META,
    chartDatasetBars,
    stickChartHTML,
    lineChartHTML,
    donutChartHTML,
    TABLE_PRESETS,
    dataTableHTML
  };
})();
