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
    { id: "cabinet", targetId: "bb-cabinet", cat: "app", title: "Кабинет преподавателя, расписание, 6 видов графиков с палочками и баланс", api: "EGE.views.tutorCabinet / EGE.kit.stickChartHTML() / balanceModalHTML()", css: ".sakha-divider.is-gold-logo .tc-cal-hours .tc-bar-chart .is-sticks .is-lollipop .is-capsule .is-dual .is-range .is-combo .tc-hh-meter .wallet-bar", desc: "Модалка пополнения (.wallet-bar, старт 5 000 ₽ / от 100 ₽), сетка слотов 10:00–20:00, лиды учеников, выплаты 95%, витрина графиков с палочками (тонкие, леденцы, капсулы, парные, диапазон, комбо-тренд), профиль .tc-hh-meter и трекер баллов." },
    { id: "dataViz", targetId: "bb-data-viz", cat: "app", title: "Линейные графики, Круговая диаграмма и Таблица (3/5/7 колонок + фильтры)", api: "EGE.kit.lineChartHTML() / donutChartHTML() / dataTableHTML() / messengerLinksHTML()", css: ".bb-line-chart .bb-donut-chart .bb-data-table .msg-channel-bar .btn-msg", desc: "SVG-график с линией и областью, интерактивная кольцевая диаграмма с легендой, таблица с переключением 3/5/7 колонок и кнопки мессенджеров WhatsApp · Telegram · MAX." },
    { id: "sliders", targetId: "bb-sliders", cat: "layout", title: "Слайдер часов 10:00–20:00 и калькулятор в 1 строку", api: "EGE.hh.sliderTicksHTML(cur, style) / .hh-step-readout.is-inline", css: ".hh-time-range .hh-slider-ticks .hh-step-readout.is-inline", desc: "3 варианта шкалы слотов, палка 10×24 px и строчный ввод «1 100 ₽/ч» без переноса." },
    { id: "layers", targetId: "bb-layers", cat: "layout", title: "Слои Z-index, статус отклика и Reduced Motion", api: "EGE.kit.sentNoticeHTML({ slot, offer })", css: ".hh-motion-status.sent .bb-pulse-dot .is-reduced", desc: "Статус под кнопкой, подъём −2 px, таблица слоёв (10→100) и отключение анимаций." },
    { id: "bounds", targetId: "bb-bounds", cat: "layout", title: "Границы 390 px, воздух 6 px и зазор 8 px", api: ".cal-days / .hh-price-stepper", css: ".bb-bp-stage .bb-phone-frame .bb-days-rail", desc: "Защита от обрезания рамок при hover, угол 84 px и мобильный фрейм." },
    { id: "responsive", targetId: "bb-responsive", cat: "layout", title: "Стенд адаптивности (320 px — 1340 px)", api: "applyBrandbookViewport(width)", css: "@container (max-width: 560px) / @media (max-width: 680px)", desc: "Живой ползунок ширины экрана от Mini SE 320 px до Desktop." },
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
        <div class="hh-price-row">
          ${r.pro
            ? `<b class="num" style="font-size:15px">Ставка от ${newPrice.toLocaleString("ru-RU")} ₽/ч</b><span class="diff-tag pro">Профи</span>`
            : `<s class="hh-price-old num">${oldPrice.toLocaleString("ru-RU")} ₽</s><b class="num" style="font-size:15px;color:var(--accent)">${newPrice.toLocaleString("ru-RU")} ₽/ч</b>${savePct > 0 ? `<span class="diff-tag confirm num">−${savePct}%</span>` : ""}`}
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

  function resolveMessengerUrls(entity, message) {
    if (root.EGE && root.EGE.tutors && typeof root.EGE.tutors.messengerUrls === "function") {
      return root.EGE.tutors.messengerUrls(entity, message);
    }
    const phone = normalizePhoneDigits((entity && entity.whatsapp) || "79142100100") || "79142100100";
    const rawTg = entity && (entity.telegram || entity.tg || entity.handle || entity.username);
    const tgStr = String(rawTg == null ? "" : rawTg).trim();
    const tgDigits = normalizePhoneDigits(tgStr);
    const slug = (tgStr && /[a-zA-Z]/.test(tgStr) ? tgStr.replace(/^@/, "").replace(/[^a-zA-Z0-9_]/g, "") : "")
      || ((entity && entity.id) ? ("vektor_ege_" + String(entity.id).replace(/[^a-zA-Z0-9_]/g, "")) : "vektor_ege_support");
    const msg = message || ("Здравствуйте" + (entity && entity.name ? (", " + entity.name) : "") + "! Пишу с платформы Вектор ЕГЭ.");
    const q = encodeURIComponent(msg);
    const tgHref = (tgStr && !/[a-zA-Z]/.test(tgStr) && tgDigits.length >= 10)
      ? ("https://t.me/+" + tgDigits + "?text=" + q)
      : ("https://t.me/" + encodeURIComponent(slug) + "?text=" + q);
    return {
      whatsapp: "https://wa.me/" + phone + "?text=" + q,
      telegram: tgHref,
      max: "https://max.ru/" + encodeURIComponent(slug) + "?text=" + q
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

  const CHART_STYLE_META = [
    ["sticks", "Палочки", "01 · Тонкие палочки с осью (.is-sticks)", "Тонкие 6 px палочки на вертикальной оси 1 px — максимум воздуха и точная линейка для дашборда."],
    ["lollipop", "Леденцы", "02 · Палочки-леденцы с точкой (.is-lollipop)", "Стержень 4 px с круглой вершиной 10 px для акцента на дневных откликах и пиковых значениях."],
    ["capsule", "Капсулы", "03 · Капсульные палочки в колбе (.is-capsule)", "Градусники-колбы 14 px в обводке для прогресса недели, загрузки часов и квот преподавателя."],
    ["dual", "Парные", "04 · Парные палочки «Рынок vs Ставка» (.is-dual)", "Две палочки рядом на одном делении: фиолетовый ориентир рынка против синей/золотой ставки."],
    ["range", "Диапазон", "05 · Диапазонные палочки «Мин–Макс» (.is-range)", "Плавающий отрезок между минимумом и максимумом дня — разброс цен и коридор баллов ЕГЭ."],
    ["combo", "Тренд", "06 · Палочки + линия тренда (.is-combo)", "Сочетание 5 px палочек с плавной линией тренда и опорными узлами динамики."]
  ];

  function chartDatasetBars(dsId) {
    if (dsId === "scores") {
      return [
        { wd: "Сен", val: "48", num: 48, detail: "Сентябрь · диагностика 48 / 100 б.", pct: 48, benchPct: 55, low: 22, span: 28, gold: false },
        { wd: "Окт", val: "56", num: 56, detail: "Октябрь · +8 б. по блоку клетки", pct: 56, benchPct: 58, low: 28, span: 32, gold: false },
        { wd: "Ноя", val: "64", num: 64, detail: "Ноябрь · 64 / 100 б. (вторая часть)", pct: 64, benchPct: 62, low: 34, span: 34, gold: false },
        { wd: "Дек", val: "71", num: 71, detail: "Декабрь · пробник ФИПИ 71 / 100 б.", pct: 71, benchPct: 66, low: 40, span: 36, gold: false },
        { wd: "Янв", val: "78", num: 78, detail: "Январь · уверенный рост 78 / 100 б.", pct: 78, benchPct: 70, low: 44, span: 38, gold: false },
        { wd: "Фев", val: "86", num: 86, detail: "Февраль · порог медуниверситета 86 / 100 б.", pct: 86, benchPct: 74, low: 50, span: 40, gold: true },
        { wd: "Мар", val: "94", num: 94, detail: "Март · 94 / 100 б. (итоговый темп ЕГЭ)", pct: 94, benchPct: 78, low: 56, span: 42, gold: true }
      ];
    }
    if (dsId === "slots") {
      return [
        { wd: "10ч", val: "12", num: 12, detail: "10:00 · 12 откликов (утреннее окно)", pct: 54, benchPct: 42, low: 18, span: 38, gold: false },
        { wd: "12ч", val: "15", num: 15, detail: "12:00 · 15 откликов (дневной слот)", pct: 68, benchPct: 52, low: 24, span: 44, gold: false },
        { wd: "14ч", val: "19", num: 19, detail: "14:00 · 19 откликов (после школы)", pct: 84, benchPct: 64, low: 30, span: 54, gold: true },
        { wd: "16ч", val: "22", num: 22, detail: "16:00 · 22 отклика (главный пик дня)", pct: 100, benchPct: 72, low: 36, span: 60, gold: true },
        { wd: "18ч", val: "18", num: 18, detail: "18:00 · 18 откликов (вечер Якутска)", pct: 80, benchPct: 66, low: 28, span: 52, gold: true },
        { wd: "19ч", val: "14", num: 14, detail: "19:00 · 14 откликов", pct: 62, benchPct: 50, low: 22, span: 42, gold: false },
        { wd: "20ч", val: "9", num: 9, detail: "20:00 · 9 откликов (вечернее окно)", pct: 42, benchPct: 38, low: 14, span: 32, gold: false }
      ];
    }
    return [
      { wd: "Пн", val: "4.2к", num: 4200, detail: "Пн · 4 200 ₽ · 4 урока · на руки 95% · 3 990 ₽", pct: 52, benchPct: 48, low: 18, span: 44, gold: false },
      { wd: "Вт", val: "5.6к", num: 5600, detail: "Вт · 5 600 ₽ · 5 уроков · на руки 95% · 5 320 ₽", pct: 70, benchPct: 60, low: 24, span: 52, gold: false },
      { wd: "Ср", val: "3.4к", num: 3400, detail: "Ср · 3 400 ₽ · 3 урока · на руки 95% · 3 230 ₽", pct: 44, benchPct: 50, low: 14, span: 36, gold: false },
      { wd: "Чт", val: "7.9к", num: 7900, detail: "Чт · 7 900 ₽ · 7 уроков · на руки 95% · 7 505 ₽ · Пик авто-24ч", pct: 100, benchPct: 68, low: 34, span: 62, gold: true },
      { wd: "Пт", val: "5.1к", num: 5100, detail: "Пт · 5 100 ₽ · 5 уроков · на руки 95% · 4 845 ₽", pct: 64, benchPct: 58, low: 22, span: 48, gold: false },
      { wd: "Сб", val: "6.8к", num: 6800, detail: "Сб · 6 800 ₽ · 6 уроков · на руки 95% · 6 460 ₽ · Пик авто-24ч", pct: 86, benchPct: 66, low: 28, span: 58, gold: true },
      { wd: "Вс", val: "4.5к", num: 4500, detail: "Вс · 4 500 ₽ · 4 урока · на руки 95% · 4 275 ₽", pct: 56, benchPct: 52, low: 20, span: 42, gold: false }
    ];
  }

  let _comboGradSeq = 0;

  function smoothTrendPath(pts) {
    if (!pts || !pts.length) return "";
    let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i];
      const p1 = pts[i + 1];
      const cx = ((p0.x + p1.x) / 2).toFixed(1);
      d += ` C ${cx} ${p0.y.toFixed(1)}, ${cx} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    }
    return d;
  }

  function stickChartHTML(styleId, bars, activeIdx, interactive, ariaLabel, opts) {
    opts = opts || {};
    const action = opts.action || "bb-chart-bar";
    const modCls = styleId && styleId !== "classic" ? ` is-${styleId}` : "";
    const isCombo = styleId === "combo";
    const clampPct = (v) => Math.max(10, Math.min(96, Math.round(Number(v) || 0)));
    let comboSvg = "";
    if (isCombo && bars && bars.length) {
      const n = bars.length;
      const pts = bars.map((b, i) => {
        const pct = clampPct(b.pct);
        return {
          x: ((i + 0.5) / n) * 280,
          y: 92 * (1 - pct / 100)
        };
      });
      const lineD = smoothTrendPath(pts);
      const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(1)} 92 L ${pts[0].x.toFixed(1)} 92 Z`;
      const gradId = `tc-combo-grad-${++_comboGradSeq}`;
      comboSvg = `<svg class="tc-combo-svg" viewBox="0 0 280 92" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.24"/>
            <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        <path class="tc-combo-area" d="${areaD}" fill="url(#${gradId})"/>
        <path class="tc-combo-line" d="${lineD}" fill="none" stroke="var(--gold)" stroke-width="2.2" vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>`;
    }
    return `<div class="tc-bar-chart${modCls}" role="img" aria-label="${esc(ariaLabel || "Диаграмма с палочками")}">
      ${comboSvg}
      ${bars.map((b, idx) => {
        const isAct = interactive && activeIdx === idx;
        const pct = clampPct(b.pct);
        const benchPct = clampPct(b.benchPct);
        const inner = styleId === "dual"
          ? `<div class="tc-bar-fill is-bench" style="height:${benchPct}%"></div><div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="height:${pct}%"></div>`
          : (styleId === "range"
            ? `<div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="--low:${b.low}%;height:${b.span}%"></div>`
            : `<div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="height:${pct}%"></div>`);
        const body = `<span class="tc-bar-val num">${esc(b.val)}</span><div class="tc-bar-track">${inner}</div><span class="tc-bar-lbl">${esc(b.wd)}</span>`;
        if (interactive) {
          return `<button type="button" class="tc-bar-col${isAct ? " is-active" : ""}" data-a="${esc(action)}" data-idx="${idx}" aria-pressed="${isAct}">${body}</button>`;
        }
        return `<div class="tc-bar-col">${body}</div>`;
      }).join("")}
    </div>`;
  }

  function lineChartHTML(opts) {
    opts = opts || {};
    const ds = opts.dataset || "income";
    const bars = opts.bars || chartDatasetBars(ds);
    const activeIdx = Number.isInteger(opts.activeIdx) ? Math.max(0, Math.min(bars.length - 1, opts.activeIdx)) : 3;
    const action = opts.action || "bb-line-pt";
    const gradId = esc(opts.gradId || "bbLineGrad");
    const w = 520;
    const h = 175;
    const padL = 34;
    const padR = 16;
    const padT = 18;
    const padB = 22;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const coords = bars.map((b, i) => {
      const x = padL + (i * plotW) / Math.max(1, bars.length - 1);
      const y = padT + plotH - (Math.max(8, Math.min(100, b.pct)) / 100) * plotH;
      return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)), b };
    });
    const lineD = coords.map((c, i) => (i === 0 ? `M${c.x} ${c.y}` : `L${c.x} ${c.y}`)).join(" ");
    const areaD = `${lineD} L${coords[coords.length - 1].x} ${(padT + plotH).toFixed(1)} L${coords[0].x} ${(padT + plotH).toFixed(1)} Z`;
    const goalPct = ds === "scores" ? 80 : (ds === "slots" ? 72 : 68);
    const goalY = (padT + plotH - (goalPct / 100) * plotH).toFixed(1);
    const goalLabel = ds === "scores" ? "Цель 80 б." : (ds === "slots" ? "Норма спроса" : "Ориентир 5.4к ₽");
    const yTicks = ds === "scores" ? ["100", "75", "50", "25"] : (ds === "slots" ? ["24", "18", "12", "6"] : ["8к", "6к", "4к", "2к"]);
    const act = coords[activeIdx] || coords[0];

    return `<div class="bb-line-chart" role="group" aria-label="${esc(opts.ariaLabel || "Линейный график с областью")}">
      <svg class="bb-line-svg" viewBox="0 0 ${w} ${h}">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--accent)" stop-opacity="0.28"/>
            <stop offset="100%" stop-color="var(--accent)" stop-opacity="0.01"/>
          </linearGradient>
        </defs>
        ${[0, 0.25, 0.5, 0.75].map((f, yi) => {
          const gy = (padT + f * plotH).toFixed(1);
          return `<line class="bb-line-grid" x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}"/>
            <text x="${padL - 6}" y="${Number(gy) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--font-mono)">${esc(yTicks[yi] || "")}</text>`;
        }).join("")}
        <line class="bb-line-goal" x1="${padL}" y1="${goalY}" x2="${w - padR}" y2="${goalY}"/>
        <text x="${w - padR}" y="${Number(goalY) - 5}" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--gold-ink)">${esc(goalLabel)}</text>
        <path d="${areaD}" fill="url(#${gradId})"/>
        <path class="bb-line-path" d="${lineD}"/>
        ${coords.map((c, idx) => {
          const isAct = idx === activeIdx;
          const fill = c.b.gold ? "#c59b5f" : "var(--accent)";
          return `<g class="bb-line-node" data-a="${esc(action)}" data-idx="${idx}" tabindex="0" role="button" aria-label="${esc(c.b.detail)}">
            ${isAct ? `<circle cx="${c.x}" cy="${c.y}" r="11" fill="${fill}" opacity="0.22"/>` : ""}
            <circle class="is-core" cx="${c.x}" cy="${c.y}" r="${isAct ? 6 : 4.2}" fill="${isAct ? fill : "var(--surface)"}" stroke="${fill}" stroke-width="2.4"/>
            ${isAct ? `<g transform="translate(${Math.max(padL + 22, Math.min(w - padR - 22, c.x))}, ${Math.max(18, c.y - 14)})">
              <rect x="-24" y="-12" width="48" height="20" rx="10" fill="var(--ink)"/>
              <text x="0" y="2" text-anchor="middle" font-size="11" font-weight="700" fill="var(--bg)" font-family="var(--font-mono)">${esc(c.b.val)}</text>
            </g>` : ""}
          </g>`;
        }).join("")}
      </svg>
      <div class="bb-line-axis">
        ${bars.map((b, idx) => `<button type="button" class="bb-line-tick${idx === activeIdx ? " is-active" : ""}" data-a="${esc(action)}" data-idx="${idx}" aria-pressed="${idx === activeIdx}">${esc(b.wd)} · ${esc(b.val)}</button>`).join("")}
      </div>
      <div class="row between small" style="padding-top:2px">
        <span class="muted">Выбранный узел:</span>
        <b class="num">${esc(act.b.detail)}</b>
      </div>
    </div>`;
  }

  const DONUT_DATASETS = {
    channels: {
      title: "Откуда приходят ученики",
      totalVal: "312",
      totalSub: "заявок / мес",
      slices: [
        { label: "Telegram · чаты и бот", share: 38, count: "118 заявок", color: "var(--accent)" },
        { label: "MAX мессенджер", share: 27, count: "84 заявки", color: "var(--pro)" },
        { label: "Доска Ykt и каталог", share: 21, count: "66 заявок", color: "#c59b5f" },
        { label: "WhatsApp и рекомендации", share: 14, count: "44 заявки", color: "var(--confirm)" }
      ]
    },
    subjects: {
      title: "Доля выручки по предметам",
      totalVal: "84.5к ₽",
      totalSub: "чистыми (95%)",
      slices: [
        { label: "Биология · ЕГЭ", share: 36, count: "30 420 ₽", color: "var(--confirm)" },
        { label: "Химия · Медвуз", share: 29, count: "24 505 ₽", color: "var(--accent)" },
        { label: "Профильная математика", share: 21, count: "17 745 ₽", color: "#c59b5f" },
        { label: "Информатика и КЕГЭ", share: 14, count: "11 830 ₽", color: "var(--pro)" }
      ]
    },
    sources: {
      title: "Форматы уроков в месяц",
      totalVal: "76",
      totalSub: "занятий",
      slices: [
        { label: "Индивидуально 60 мин", share: 48, count: "36 уроков", color: "var(--accent)" },
        { label: "Мини-группы 2–4 чел.", share: 24, count: "18 уроков", color: "#c59b5f" },
        { label: "Разбор пробников ФИПИ", share: 18, count: "14 уроков", color: "var(--pro)" },
        { label: "Пробные 0 ₽ (старт 5к)", share: 10, count: "8 уроков", color: "var(--confirm)" }
      ]
    }
  };

  function donutChartHTML(opts) {
    opts = opts || {};
    const dsKey = DONUT_DATASETS[opts.dataset] ? opts.dataset : "channels";
    const ds = DONUT_DATASETS[dsKey];
    const slices = ds.slices;
    const activeIdx = Number.isInteger(opts.activeIdx) ? Math.max(0, Math.min(slices.length - 1, opts.activeIdx)) : 0;
    const action = opts.action || "bb-donut-slice";
    const r = 52;
    const C = 2 * Math.PI * r;
    const rOut = 65;
    const outC = 2 * Math.PI * rOut;
    const gap = 2.6;
    let offset = 0;
    let activeStartShare = 0;
    const segs = slices.map((s, idx) => {
      const share = Math.max(1, Number(s.share) || 0);
      const sliceArc = (share / 100) * C;
      const segLen = Math.max(2, sliceArc - gap);
      const isAct = idx === activeIdx;
      if (isAct) activeStartShare = offset;
      const svg = `<circle class="bb-donut-seg" cx="75" cy="75" r="${r}" fill="none" stroke="${s.color}" stroke-width="18" stroke-dasharray="${segLen.toFixed(2)} ${(C - segLen).toFixed(2)}" stroke-dashoffset="${(-((offset / 100) * C)).toFixed(2)}" stroke-linecap="butt" opacity="${isAct ? "1" : "0.72"}" data-a="${esc(action)}" data-idx="${idx}"/>`;
      offset += share;
      return svg;
    }).join("");
    const picked = slices[activeIdx] || slices[0];
    const pickedShare = Math.max(1, Number(picked.share) || 0);
    const outSegLen = Math.max(2, (pickedShare / 100) * outC - 3.2);
    const outOffset = -((activeStartShare / 100) * outC);
    const activeRing = `<circle class="bb-donut-outer-ring" cx="75" cy="75" r="${rOut}" fill="none" stroke="${picked.color}" stroke-width="3" stroke-dasharray="${outSegLen.toFixed(2)} ${(outC - outSegLen).toFixed(2)}" stroke-dashoffset="${outOffset.toFixed(2)}" stroke-linecap="butt"/>`;

    return `<div class="bb-donut-chart" role="group" aria-label="${esc(ds.title)}">
      <div class="bb-donut-wrap">
        <div class="bb-donut-box">
          <svg class="bb-donut-svg" viewBox="0 0 150 150">
            <circle cx="75" cy="75" r="${r}" fill="none" stroke="var(--line)" stroke-width="18" opacity="0.35"/>
            ${segs}
            ${activeRing}
          </svg>
          <div class="bb-donut-center">
            <b class="num">${picked.share}%</b>
            <span>${esc(picked.count)}</span>
          </div>
        </div>
        <div class="bb-donut-legend">
          ${slices.map((s, idx) => {
            const isAct = idx === activeIdx;
            return `<button type="button" class="bb-donut-item${isAct ? " is-active" : ""}" data-a="${esc(action)}" data-idx="${idx}" aria-pressed="${isAct}">
              <span class="bb-donut-dot" style="background:${s.color}"></span>
              <span style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600">${esc(s.label)}</span>
              <span class="small num muted">${s.share}% · ${esc(s.count)}</span>
            </button>`;
          }).join("")}
        </div>
      </div>
      <div class="row between small" style="padding-top:2px">
        <span class="muted">Всего в выборке (${esc(ds.totalSub)}): <b class="num">${esc(ds.totalVal)}</b></span>
        <b style="color:var(--accent)">${esc(picked.label)}</b>
      </div>
    </div>`;
  }

  const TABLE_ROWS = [
    { id: "tbl-1", student: "Алёна Егорова", subjectId: "bio", subject: "Биология · ЕГЭ", city: "Якутск (UTC+9)", slot: "Сб · 14:00", rate: 1100, net: 1045, status: "accepted", statusLabel: "Подтверждено ✓", whatsapp: "79142100102", telegram: "alena_bio_ykt", maxHandle: "alena_ykt" },
    { id: "tbl-2", student: "Дамир Осипов", subjectId: "chem", subject: "Химия · ЕГЭ", city: "Якутск (UTC+9)", slot: "Вс · 10:00", rate: 1200, net: 1140, status: "accepted", statusLabel: "Подтверждено ✓", whatsapp: "79142100104", telegram: "damir_chem", maxHandle: "damir_osipov" },
    { id: "tbl-3", student: "Саяна Кычкина", subjectId: "bio", subject: "Биология · Пробный 0 ₽", city: "Москва (UTC+3)", slot: "Пн · 18:00", rate: 950, net: 903, status: "trial", statusLabel: "Пробный · старт 5к", whatsapp: "79142100106", telegram: "sayana_msk", maxHandle: "sayana_k" },
    { id: "tbl-4", student: "Тимур Платонов", subjectId: "chem", subject: "Химия · Медвуз", city: "Якутск (UTC+9)", slot: "Вт · 16:00", rate: 1400, net: 1330, status: "pending", statusLabel: "Ждёт ответа", whatsapp: "79142100108", telegram: "timur_med", maxHandle: "timur_p" },
    { id: "tbl-5", student: "Мария Фёдорова", subjectId: "bio", subject: "Биология · ОГЭ 9 кл.", city: "Якутск (UTC+9)", slot: "Чт · 17:00", rate: 1000, net: 950, status: "accepted", statusLabel: "Подтверждено ✓", whatsapp: "79142100110", telegram: "maria_oge", maxHandle: "maria_f" },
    { id: "tbl-6", student: "Ньургун Иванов", subjectId: "chem", subject: "Химия · Олимпиада", city: "Москва (UTC+3)", slot: "Пт · 19:00", rate: 1500, net: 1425, status: "pending", statusLabel: "Ждёт ответа", whatsapp: "79142100112", telegram: "nyurgun_chem", maxHandle: "nyurgun_i" }
  ];

  function dataTableHTML(opts) {
    opts = opts || {};
    const cols = [3, 5, 7].includes(Number(opts.cols)) ? Number(opts.cols) : 5;
    const filter = opts.filter || "all";
    const query = String(opts.query || "").trim().toLowerCase();
    const filtered = TABLE_ROWS.filter((r) => {
      if (filter === "accepted" && r.status !== "accepted") return false;
      if (filter === "pending" && r.status !== "pending") return false;
      if (filter === "bio" && r.subjectId !== "bio") return false;
      if (filter === "chem" && r.subjectId !== "chem") return false;
      if (query) {
        const hay = `${r.student} ${r.subject} ${r.city} ${r.slot} ${r.statusLabel}`.toLowerCase();
        if (!hay.includes(query)) return false;
      }
      return true;
    });

    const headers = cols === 3
      ? ["Ученик и предмет", "Ставка", "Связь (WA · TG · MAX)"]
      : (cols === 5
        ? ["Ученик", "Предмет", "Слот (UTC)", "Ставка", "Статус и связь"]
        : ["Ученик", "Предмет", "Город", "Слот", "Ставка", "На руки (95%)", "Статус и связь"]);

    const stCls = (st) => st === "accepted" ? "is-confirmed" : (st === "trial" ? "is-trial" : "is-pending");

    const rowsHtml = filtered.length
      ? filtered.map((r) => {
        const msgBar = messengerLinksHTML({
          entity: { id: r.id, name: r.student, whatsapp: r.whatsapp, telegram: r.telegram, maxHandle: r.maxHandle },
          message: `Здравствуйте, ${r.student}! Напоминаю о занятии (${r.subject}, ${r.slot}) через Вектор ЕГЭ.`,
          primaryLabel: "WA",
          compact: true
        });
        const badge = `<span class="bb-tbl-st ${stCls(r.status)}">${esc(r.statusLabel)}</span>`;
        if (cols === 3) {
          return `<tr>
            <td><div class="stack" style="gap:2px"><b>${esc(r.student)}</b><span class="small muted">${esc(r.subject)} · ${esc(r.slot)}</span></div></td>
            <td><b class="num">${r.rate.toLocaleString("ru-RU")} ₽/ч</b></td>
            <td>${msgBar}</td>
          </tr>`;
        }
        if (cols === 5) {
          return `<tr>
            <td><b>${esc(r.student)}</b></td>
            <td><div class="stack" style="gap:2px"><span>${esc(r.subject)}</span><span class="small muted">${esc(r.city)}</span></div></td>
            <td><span class="num">${esc(r.slot)}</span></td>
            <td><b class="num">${r.rate.toLocaleString("ru-RU")} ₽/ч</b></td>
            <td><div class="stack" style="gap:6px">${badge}${msgBar}</div></td>
          </tr>`;
        }
        return `<tr>
          <td><b>${esc(r.student)}</b></td>
          <td>${esc(r.subject)}</td>
          <td><span class="small">${esc(r.city)}</span></td>
          <td><span class="num">${esc(r.slot)}</span></td>
          <td><b class="num">${r.rate.toLocaleString("ru-RU")} ₽/ч</b></td>
          <td><b class="num" style="color:var(--confirm)">${r.net.toLocaleString("ru-RU")} ₽</b></td>
          <td><div class="stack" style="gap:6px">${badge}${msgBar}</div></td>
        </tr>`;
      }).join("")
      : `<tr><td colspan="${cols}" class="small muted" style="text-align:center;padding:18px 10px">По фильтру «${esc(query || filter)}» заявок не найдено — сбросьте фильтр.</td></tr>`;

    return `<div class="card pad bb-data-table-card" id="bb-table-demo">
      <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
        <div>
          <div class="eyebrow">Таблица с колонками 3 / 5 / 7 · .table-wrap + фильтры</div>
          <h3 class="h3">Расписание и заявки учеников с мгновенной отправкой в WA · Telegram · MAX</h3>
        </div>
        <div class="hh-seg" role="group" aria-label="Количество колонок таблицы">
          ${[3, 5, 7].map((c) => `<button type="button" data-a="bb-tbl-cols" data-cols="${c}" aria-pressed="${cols === c}">${c} колонки</button>`).join("")}
        </div>
      </div>
      <div class="bb-tbl-toolbar">
        <div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Фильтр строк таблицы">
          ${[
            ["all", "Все (" + TABLE_ROWS.length + ")"],
            ["accepted", "Подтверждены ✓"],
            ["pending", "Ждут ответа"],
            ["bio", "Биология"],
            ["chem", "Химия"]
          ].map(([fid, flbl]) => `<button type="button" class="chip-btn${filter === fid ? " on" : ""}" data-a="bb-tbl-filter" data-v="${fid}">${esc(flbl)}</button>`).join("")}
        </div>
        <input class="input" id="bb-tbl-q" type="search" value="${esc(opts.query || "")}" placeholder="Поиск по имени, предмету, городу…" style="max-width:260px" aria-label="Поиск по таблице">
      </div>
      <div class="table-wrap">
        <table class="tbl bb-data-table cols-${cols}">
          <thead>
            <tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
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
    formatPhoneMask,
    formatTelegramContact,
    messengerLinksHTML,
    CHART_STYLE_META,
    chartDatasetBars,
    stickChartHTML,
    lineChartHTML,
    donutChartHTML,
    dataTableHTML
  };
})();
