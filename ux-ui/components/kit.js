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
    { id: "logo", targetId: "bb-logo", cat: "brand", title: "Адаптивный логотип + SVG Pack", api: "EGE.ui.brandLockupHTML() / brandLogoSVG()", css: ".brand-lockup .brand-mark .brand-wordmark", desc: "Круг 8-лучевой звезды на белом, чёрном OLED и синем + скачивание SVG и запреты." },
    { id: "surfaces", targetId: "bb-surfaces", cat: "brand", title: "Поверхности, WCAG-контраст и токены", api: "EGE.hh.priceHeadlineHTML(market, offer, true)", css: ".hh-price-old .hh-price-now .diff-tag", desc: "Белый, Чёрный OLED, Синий hh, Золото Саха #C59B5F (--gold), пары контраста AA/AAA и экспорт :root CSS / tokens.json." },
    { id: "fonts", targetId: "bb-fonts", cat: "brand", title: "Типографика Inter + IBM Plex Mono", api: "--font-display / --font-mono / --shadow", css: ".h1 .h2 .small .eyebrow .num", desc: "Иерархия шрифтов, табличные цифры, шкала отступов 4 px, радиусы и 3 уровня теней." },
    { id: "hero", targetId: "bb-hero-banner", cat: "hero", title: "Hero-баннер hh.kz × Ленские столбы", api: "EGE.kit.heroBannerHTML({ ... })", css: ".land-hero-banner .hero-cta-primary .hero-cta-secondary", desc: "Светлое фото без верхнего поисковика, 2 CTA («Найти ниже рынка» синий + «Попробовать бета-тест» золото #C59B5F) и 3 KPI." },
    { id: "sakha", targetId: "bb-yakutia", cat: "sakha", title: "Якутские кнопки-узоры Оһуор", api: "EGE.kit.sakhaButtonsHTML({ ... })", css: ".sakha-medallion-btn .sakha-diamond-btn .btn.sakha-pattern", desc: "Күн Оһуор, Сулус и узорная кнопка .btn.sakha-pattern без обрезанных углов." },
    { id: "buttons", targetId: "bb-buttons", cat: "controls", title: "Кнопки отклика, 40 иконок и золотой CTA", api: "EGE.hh.sakhaBidInnerHTML(sent, price) / .btn.gold", css: ".btn.sakha-pattern .btn.gold .is-confirmed .bb-icon-tile", desc: "Плавный .is-confirmed, золотая .btn.gold (#C59B5F), 40 SVG-иконок 1.8 px и оранжевые бейджи." },
    { id: "forms", targetId: "bb-forms", cat: "controls", title: "Формы, Мультивыбор (.hh-multi) и выбор роли", api: "EGE.hh.hhSelectHTML() / hhMultiSelectHTML() / authCard()", css: ".hh-select .hh-multi .hh-seg .switch", desc: "Одиночный и множественный выбор, роль «Как ученик / Как преподаватель» и поля с ошибкой." },
    { id: "overlays", targetId: "bb-cards-sys", cat: "controls", title: "Тарифы, баланс топ-бара, оранжевый тост и модалки", api: "EGE.kit.sentNoticeHTML() / notifySide() / .top-bal-wrap", css: ".plan-card.super .top-bal-pill .toast.is-side .modal-card", desc: "Иерархия 0 / 5 000 / 10 000 ₽ / любая сумма, баланс в шапке, свайп-тост и диалоги." },
    { id: "study", targetId: "bb-study-states", cat: "app", title: "Тренажёр ЕГЭ, Skeleton, Empty и Danger", api: "EGE.views.study / .opt / .meter", css: ".opt.ok .meter .bb-skel-bar .empty .confirm", desc: "Варианты ответов, конспект .theory, шиммер 1.6 s и адаптивная отмена." },
    { id: "marketApp", targetId: "bb-market-app", cat: "app", title: "Каталог /market, Кабинет преподавателя и 5-tab .tabbar", api: "EGE.views.tutorCabinet / EGE.views.market", css: ".tutor-card .tc-req-card .diff-tag.pro .side .tabbar", desc: "Кабинет ученика и личный кабинет преподавателя, до 2 плашек квалификации и «Преподаватель» без сокращений." },
    { id: "cabinet", targetId: "bb-cabinet", cat: "app", title: "Кабинет преподавателя, расписание, 6 видов графиков с палочками и баланс", api: "EGE.views.tutorCabinet / EGE.charts.stickChartHTML() / balanceModalHTML()", css: ".sakha-divider.is-gold-logo .tc-cal-hours .tc-bar-chart .is-sticks .is-lollipop .is-capsule .is-dual .is-range .is-combo .tc-hh-meter .wallet-bar", desc: "Модалка пополнения (.wallet-bar, старт 5 000 ₽ / от 100 ₽), сетка слотов 10:00–20:00, лиды учеников, выплаты 95%, витрина графиков с палочками (тонкие, леденцы, капсулы, парные, диапазон, комбо-тренд), профиль .tc-hh-meter и трекер баллов." },
    { id: "dataViz", targetId: "bb-data-viz", cat: "app", title: "Линейные графики, Круговая диаграмма и Таблица (3/5/7 колонок + пресеты)", api: "EGE.charts.{lineChartHTML, donutChartHTML, dataTableHTML}({ preset, confirmedIds, cardWrap })", css: ".bb-line-chart .bb-donut-chart .bb-table-shell .bb-data-table.is-adaptive", desc: "SVG-график с линией и областью, кольцевая диаграмма, супер-адаптивная таблица (Заявки / Выплаты / Пробники, 3/5/7 колонок, кнопка Подтвердить и карточки @container) + WA · Telegram · MAX." },
    { id: "maskTrainer", targetId: "bb-mask-trainer", cat: "app", title: "Живой тренажёр масок контактов (WA · Telegram · MAX)", api: "EGE.kit.{formatPhoneMask, formatTelegramContact, resolveMessengerUrls, messengerLinksHTML}()", css: ".tc-contact-grid .bb-mask-urls .btn-msg.is-wa.is-tg.is-max", desc: "Редактируемые поля +7 (XXX) XXX-XX-XX, @login и MAX с быстрыми примерами и живым расчётом ссылок wa.me / t.me / max.ru." },
    { id: "payments", targetId: "bb-payments", cat: "app", title: "Эквайринг, эскроу-статусы и выплаты (EGE.payments)", api: "EGE.payments.{createTopupIntent, createPayoutIntent}()", css: ".bb-pay-grid .bb-pay-split .bb-pay-dock-preview .bb-tbl-st.is-refund", desc: "Пополнение от 5 000 ₽ / 100 ₽, эскроу frozen -> captured (95% / 5%) -> refunded (100%), вывод 95% на СБП / Мир и чек НПД." },
    { id: "egeTimers", targetId: "bb-ege-timers", cat: "app", title: "Таймеры ЕГЭ-2027 и ИИ-проверка сочинения (Задание 27)", api: "EGE.exams / EGE.essay", css: ".bb-timer-grid .bb-timer-card .bb-essay-box .bb-essay-criteria", desc: "Обратный отсчёт до экзаменов 2027 (Химия, Русский, Биология), чекпоинт 1 февраля и разбор критериев К1–К10 (21 / 22 б.)." },
    { id: "a11y", targetId: "bb-a11y", cat: "controls", title: "Фокус-кольца, горячие клавиши и Reduced Motion (A11y)", api: ":focus-visible / html.reduced-motion", css: ".bb-focus-map .bb-focus-demo kbd.bb-kbd", desc: "Карта колец фокуса (Primary, Золото Саха, Поле, Ошибка), шпаргалка клавиш Esc / Tab / ← → и отключение анимаций." },
    { id: "sliders", targetId: "bb-sliders", cat: "layout", title: "Слайдер часов 10:00–20:00 и калькулятор в 1 строку", api: "EGE.hh.sliderTicksHTML(cur, style) / .hh-step-readout.is-inline", css: ".hh-time-range .hh-slider-ticks .hh-step-readout.is-inline", desc: "3 варианта шкалы слотов, палка 10×24 px и строчный ввод «1 100 ₽/ч» без переноса." },
    { id: "layers", targetId: "bb-layers", cat: "layout", title: "Слои Z-index, статус отклика и Reduced Motion", api: "EGE.kit.sentNoticeHTML({ slot, offer })", css: ".hh-motion-status.sent .bb-pulse-dot .is-reduced", desc: "Статус под кнопкой, подъём −2 px, таблица слоёв (10→100) и отключение анимаций." },
    { id: "bounds", targetId: "bb-bounds", cat: "layout", title: "Границы 390 px, воздух 6 px и зазор 8 px", api: ".cal-days / .hh-price-stepper", css: ".bb-bp-stage .bb-phone-frame .bb-days-rail", desc: "Защита от обрезания рамок при hover, угол 84 px и мобильный фрейм." },
    { id: "responsive", targetId: "bb-responsive", cat: "layout", title: "Стенд адаптивности (320 px — 1340 px)", api: "applyBrandbookViewport(width)", css: "@container (max-width: 880px) / @container (max-width: 640px)", desc: "Живой ползунок ширины экрана от Mini SE 320 px до Desktop." },
    { id: "kit", targetId: "bb-landing-kit", cat: "sections", title: "Блоки витрины (Лента, Золотая ставка, Ставки, Отзывы)", api: "EGE.kit.rateBenchCardHTML / reviewCardHTML / .savings-bar-fill.gold-fill", css: ".marquee-pill .savings-gold-txt .rate-bench-card .review-card", desc: "Общие компоненты EGE.kit и золотой акцент «Вектор ЕГЭ · твоя ставка»." },
    { id: "dodont", targetId: "bb-dodont", cat: "sections", title: "Do / Don't и Tone of Voice (формат текстов)", api: "tokens.json -> editorial", css: ".bb-do-card .bb-dont-card", desc: "Оранжевые уведомления, правило 5% (/fees и кабинет), формат ₽/ч и якутская орфография." },
    { id: "compare", targetId: "bb-compare", cat: "brand", title: "Сквозная проверка Light vs Dark OLED", api: "EGE.views.brandbook.brandbookPaneHTML()", css: ".bb-pane.is-light .bb-pane.is-dark", desc: "Одновременное сравнение свотчей, слайдера, степпера и карточки в двух темах." }
  ];

  function heroBannerHTML(opts) {
    opts = opts || {};
    const isDemo = !!opts.brandbookDemo;
    const catalogTotal = opts.catalogTotal || "2 480";
    const primaryActive = !!opts.primaryActive;
    const betaActive = !!opts.betaActive;
    const primaryAction = opts.primaryAction || (isDemo ? "bb-hero-primary" : "land-scroll");
    const betaAction = opts.betaAction || (isDemo ? "bb-hero-beta" : "land-scroll");
    const primaryTarget = opts.primaryTarget || "land-market";
    const betaTarget = opts.betaTarget || "land-demo";

    return `<section class="land-hero-banner" aria-label="Главный баннер поиска репетиторов на фоне Ленских столбов">
      <img class="hero-banner-bg" src="/assets/lena-pillars.jpg" alt="Природа Якутии — Ленские столбы на рассвете над рекой Леной" decoding="sync">
      <div class="hero-banner-scrim" aria-hidden="true"></div>
      <div class="hero-banner-top">
        <h1 class="${isDemo ? "h2" : "hero-banner-h1"}">Ищи репетиторов ниже рынка для подготовки к чему угодно</h1>
        <p class="hero-banner-sub">Единая база анкет с Доски Ykt, Telegram, WhatsApp и MAX: выбирай час 10:00–20:00 и предлагай свою ставку шагом ±100 ₽.</p>
        <div class="hero-banner-ctas" role="group" aria-label="Главные действия">
          <button type="button" class="btn hero-cta-primary${primaryActive ? " is-confirmed" : ""}" data-a="${esc(primaryAction)}" data-target="${esc(primaryTarget)}">${primaryActive ? "✓ Открыт каталог анкет" : "Найти ниже рынка"}</button>
          <button type="button" class="btn hero-cta-secondary${betaActive ? " is-confirmed" : ""}" data-a="${esc(betaAction)}" data-target="${esc(betaTarget)}">${icon("spark")}<span>${betaActive ? "✓ Бета-тест запущен" : "Попробовать бета-тест"}</span></button>
        </div>
        <p class="hero-banner-note">Выбирай репетитора без комиссии на витрине · <a href="/fees" data-a="go" data-v="fees">условия оплаты и защиты баланса</a>.</p>
      </div>
      <div class="hero-banner-foot">
        <div class="hero-banner-kpis">
          <div class="hero-banner-kpi"><b>${esc(catalogTotal)}+</b><span>анкет в базе</span></div>
          <div class="hero-banner-kpi"><b>15–30%</b><span>ниже рынка</span></div>
          <div class="hero-banner-kpi"><b>10:00–20:00</b><span>слоты по часу</span></div>
        </div>
      </div>
    </section>`;
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
  function sentNoticeHTML(opts) {
    opts = opts || {};
    const slot = opts.slot || "13:00";
    const offerNum = Number(opts.offer) || 1100;
    const title = opts.title || "Предложение передано преподавателю";
    const subtitle = opts.subtitle || `Ставка ${offerNum.toLocaleString("ru-RU")} ₽/ч на ${slot} отправлена — уведомим об ответе`;
    const badgeText = opts.badgeText || "";
    const closeAction = opts.closeAction || "";
    const badgeClass = opts.badgeClass || "chip notif";
    const rightEl = closeAction
      ? `<button type="button" class="toast-close" data-a="${esc(closeAction)}" aria-label="Убрать уведомление">×</button>`
      : (badgeText ? `<span class="${esc(badgeClass)}" style="flex:none">${esc(badgeText)}</span>` : "");

    return `<span class="toast-side-row">
      <span class="bb-pulse-dot" style="margin-top:5px;flex:0 0 auto" aria-hidden="true"></span>
      <span class="toast-side-copy">
        <b>${esc(title)}</b>
        <span>${esc(subtitle)}</span>
      </span>
      ${rightEl}
    </span>`;
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

  EGE.kit = {
    CATALOG_CATEGORIES,
    CATALOG_ITEMS,
    heroBannerHTML,
    searchStripHTML,
    sentNoticeHTML,
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
