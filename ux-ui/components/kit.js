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
    { id: "motion", label: "Слайдеры и границы" },
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
    { id: "sliders", targetId: "bb-sliders", cat: "motion", title: "Слайдер часов 10:00–20:00 (Clean / Ticks / Ruler)", api: "EGE.hh.sliderTicksHTML(cur, style)", css: ".hh-time-range .hh-slider-ticks", desc: "3 варианта шкалы слотов, палка 10×24 px и сенсорный запас ±6 px." },
    { id: "motion", targetId: "bb-motion", cat: "motion", title: "Моушен, слои Z-index и Reduced Motion", api: "EGE.kit.sentNoticeHTML({ slot, offer })", css: ".hh-motion-status.sent .bb-pulse-dot .is-reduced", desc: "Статус под кнопкой, подъём −2 px, таблица слоёв (10→100) и отключение анимаций." },
    { id: "bounds", targetId: "bb-bounds", cat: "motion", title: "Границы 390 px, воздух 6 px и зазор 8 px", api: ".cal-days / .hh-price-stepper", css: ".bb-bp-stage .bb-phone-frame .bb-days-rail", desc: "Защита от обрезания рамок при hover, угол 84 px и мобильный фрейм." },
    { id: "responsive", targetId: "bb-responsive", cat: "motion", title: "Стенд адаптивности (320 px — 1340 px)", api: "applyBrandbookViewport(width)", css: "@container (max-width: 560px) / @media (max-width: 680px)", desc: "Живой ползунок ширины экрана от Mini SE 320 px до Desktop." },
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
    const placeholder = opts.placeholder || "Предмет, тема, навык или репетитор (Моушен, Python, ОГЭ)…";
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
          <span class="small muted">${starActive ? (compact ? "Выбран" : "✓ Выбран моушен-режим Сулус") : (compact ? "Геометрический ромб" : "8-лучевой алмазный орнамент Саха")}</span>
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

  function aiErrorBoxesHTML(item, opts) {
    item = item || {};
    opts = opts || {};
    const inside = !!opts.inside;
    const hideCta = !!opts.hideCta;
    const before = item.before != null ? item.before : 62;
    const after = item.after != null ? item.after : 86;
    return `<div class="land-ai-grid">
      <div class="ai-err-box">
        <div class="row between" style="gap:6px;flex-wrap:wrap">
          <span class="chip">${esc(item.topic || "Задание №28 · Генетика")}</span>
          <span class="small muted">Задание КИМ</span>
        </div>
        <b>${esc(item.question || "Частая ошибка ученика")}</b>
        <span class="small muted" style="padding:8px 10px;border-radius:10px;background:var(--surface);border:1px solid var(--line)">${esc(item.mistake || "")}</span>
      </div>
      <div class="ai-fix-box">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <span class="row" style="gap:6px"><span class="ai-spark-ico" aria-hidden="true">${icon("spark")}</span><b>Разбор ИИ-помощника</b></span>
          <span class="diff-tag pro num">${esc(item.delta || "+12 баллов к прогнозу")}</span>
        </div>
        <p class="small ink2" style="line-height:1.55;margin:0">${esc(item.aiFix || "")}</p>
        <div class="stack" style="gap:5px">
          <div class="row between small"><span>Прогноз готовности к ЕГЭ</span><b class="num">${before} → ${after} / 100</b></div>
          <div class="meter"><i style="width:${after}%"></i></div>
        </div>
        ${hideCta ? "" : `<div class="row" style="gap:8px;flex-wrap:wrap">
          ${inside
            ? `<button type="button" class="btn sm" data-a="go" data-v="tests">${esc(item.cta || "Открыть задания")} →</button>`
            : `<button type="button" class="btn sm" data-a="auth-modal-open">Попробовать бесплатно (0 ₽) →</button>`}
        </div>`}
      </div>
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
    const title = opts.title || "Дизайн-система и брендбук hh-стиля (Белый + Чёрный + Синий)";
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
    aiErrorBoxesHTML,
    reviewCardHTML,
    faqListHTML,
    blueBannerHTML
  };
})();
