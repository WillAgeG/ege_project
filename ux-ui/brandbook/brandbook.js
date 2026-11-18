/* Страницы /brandbook (дизайн-система, иконки, границы и адаптив) и /fees (условия оплаты 5%). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { icon, sakhaOhyorHTML, sakhaPatternSVG, BRAND_MARK_HTML, BRAND_WORDMARK_HTML, brandLockupHTML, brandLogoSVG, getIconCatalog } = EGE.ui;
  const { esc } = EGE.utils || { esc: (s) => String(s || "") };
  const {
    CATALOG_CATEGORIES = [],
    CATALOG_ITEMS = [],
    heroBannerHTML,
    sentNoticeHTML,
    sideToastInnerHTML,
    topBalanceWidgetHTML,
    tutorBalanceDockHTML,
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
    messengerLinksHTML,
    resolveMessengerUrls,
    formatPhoneMask,
    formatTelegramContact,
    CHART_STYLE_META,
    chartDatasetBars: kitChartDatasetBars,
    stickChartHTML: kitStickChartHTML,
    lineChartHTML,
    donutChartHTML,
    dataTableHTML
  } = EGE.kit || {};
  const {
    feeSplitHTML,
    bidBtnLabelHTML,
    sakhaBidInnerHTML,
    priceHeadlineHTML,
    priceDiffTagsHTML,
    sliderTicksHTML,
    BB_DAYS,
    bbDayObj,
    hhSelectHTML,
    hhMultiSelectHTML
  } = EGE.hh;

  const BB_SECTION_CATS = {
    "bb-logo": "brand",
    "bb-surfaces": "brand",
    "bb-fonts": "brand",
    "bb-hero-banner": "hero",
    "bb-yakutia": "sakha",
    "bb-buttons": "controls",
    "bb-forms": "controls",
    "bb-cards-sys": "controls",
    "bb-study-states": "app",
    "bb-market-app": "app",
    "bb-cabinet": "app",
    "bb-mask-trainer": "app",
    "bb-data-viz": "app",
    "bb-payments": "app",
    "bb-ui-kit-shells": "app",
    "bb-telemetry-etl": "app",
    "bb-admin-kit": "app",
    "bb-arch-split": "app",
    "bb-ege-timers": "app",
    "bb-a11y": "controls",
    "bb-sliders": "layout",
    "bb-layers": "layout",
    "bb-bounds": "layout",
    "bb-responsive": "layout",
    "bb-landing-kit": "sections",
    "bb-dodont": "sections",
    "bb-compare": "brand"
  };

  const BB_SUBJECTS = [
    { id: "bio", label: "Биология · ЕГЭ 2027", meta: "Естественные" },
    { id: "chem", label: "Химия · ЕГЭ 2027", meta: "Олимпиады и ЕГЭ" },
    { id: "rus", label: "Русский язык · ЕГЭ", meta: "Сочинение и база" },
    { id: "design", label: "UX/UI и Figma", meta: "Проектный трек" }
  ];

  const BB_DEFAULTS = {
    subsite: "",
    deviceView: "split",
    deviceScreen: "landing",
    deviceTheme: "light",
    apiGroup: "all",
    mode: "both",
    hour: 14,
    price: 1200,
    day: "all",
    sliderStyle: "ticks",
    showBounds: true,
    chipOn: true,
    sent: false,
    fav: true,
    vpWidth: 390,
    switchVal: "online",
    subj: "bio",
    subjMenuOpen: false,
    multiSubjs: ["bio", "chem"],
    multiMenuOpen: false,
    pickedPlan: "month10k",
    quizOpt: 1,
    cancelDemoUndone: false,
    previewToastDismissed: false,
    sakhaSent: false,
    sakhaKunOn: false,
    sakhaStarOn: false,
    heroSubmitted: false,
    heroBetaOn: false,
    heroSearchSubmitted: false,
    heroQ: "",
    marketDemoAccepted: false,
    reducedMotion: false,
    balFunded: true,
    chartStyle: "sticks",
    chartDataset: "income",
    chartActiveIdx: 3,
    linePtIdx: 3,
    chartLines: 1,
    chartPoints: 7,
    donutDataset: "channels",
    donutSliceIdx: 0,
    tableCols: 5,
    tableFilter: "all",
    tableSearch: "",
    cat: "all",
    catQ: "",
    faqOpen: 0,
    maskPhone: "+7 (914) 210-05-11",
    calTz: "UTC+9",
    maskTg: "@aytal_bio",
    maskMax: "aytal_ege",
    payMethod: "sbp",
    payState: "frozen",
    payInitialDone: false,
    tablePreset: "requests",
    confirmedRows: {},
    essayOpenIdx: 0,
    shellRole: "tutor",
    pipeFilter: "all",
    adminTab: "moderation",
    adminRole: "admin",
    dualRole: "student"
  };

  function subSitesAPI() {
    return (root.EGE && root.EGE.brandbookSubsites) || null;
  }

  function ensureBrandbookState(ui) {
    const bb = ui.brandbook || (ui.brandbook = {});
    for (const k in BB_DEFAULTS) {
      if (bb[k] === undefined) {
        const defVal = BB_DEFAULTS[k];
        bb[k] = Array.isArray(defVal) ? defVal.slice() : (defVal && typeof defVal === "object" ? {} : defVal);
      }
    }
    if (!bb.subsite) {
      const subApi = subSitesAPI();
      const resolved = subApi && typeof subApi.resolveInitialRoute === "function"
        ? subApi.resolveInitialRoute()
        : { subsite: "all", deviceView: null };
      bb.subsite = resolved.subsite || "all";
      if (resolved.deviceView) bb.deviceView = resolved.deviceView;
    }
    if (!bb.confirmedRows || typeof bb.confirmedRows !== "object") bb.confirmedRows = {};
    bb.chartLines = Math.max(1, Math.min(20, Math.round(Number(bb.chartLines) || 1)));
    bb.chartPoints = Math.max(5, Math.min(36, Math.round(Number(bb.chartPoints) || 7)));
    bb.tableCols = Math.max(1, Math.min(15, Math.round(Number(bb.tableCols) || 5)));
    return bb;
  }

  function colsWordRu(n) {
    const v = Math.abs(Math.round(Number(n) || 0));
    const m100 = v % 100;
    const m10 = v % 10;
    if (m100 >= 11 && m100 <= 14) return `${v} колонок`;
    if (m10 === 1) return `${v} колонка`;
    if (m10 >= 2 && m10 <= 4) return `${v} колонки`;
    return `${v} колонок`;
  }

  function chartsAPI() {
    return (root.EGE && root.EGE.charts) || (root.EGE && root.EGE.kit) || {};
  }

  function filterCatalogItems(bb) {
    const cat = bb.cat || "all";
    const q = String(bb.catQ || "").trim().toLowerCase();
    return CATALOG_ITEMS.filter((it) => {
      if (cat !== "all" && it.cat !== cat) return false;
      if (!q) return true;
      return `${it.title} ${it.desc} ${it.api} ${it.css} ${it.targetId}`.toLowerCase().includes(q);
    });
  }

  function catalogNavigatorHTML(bb) {
    const curCat = bb.cat || "all";
    const curQ = String(bb.catQ || "").trim();
    const hits = filterCatalogItems(bb);
    const hitCount = hits.length;
    return `<section class="bb-catalog-bar" id="bb-catalog" aria-label="Единый каталог компонентов EGE.kit">
      <div class="bb-catalog-head">
        <div class="stack" style="gap:2px">
          <div class="eyebrow">Single Source of Truth · EGE.kit &amp; EGE.ui</div>
          <h2 class="h2" style="margin:0">Каталог компонентов — всё берётся на /landing и /market отсюда</h2>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
          <button type="button" class="btn soft sm" data-a="bb-export-tokens" data-fmt="css">${icon("copy")}<span>Копировать :root CSS</span></button>
          <button type="button" class="btn ghost sm" data-a="bb-export-tokens" data-fmt="json">Копировать tokens.json</button>
          <span class="chip accent num">Компонентов: ${hitCount} из ${CATALOG_ITEMS.length}</span>
        </div>
      </div>
      <div class="bb-catalog-controls">
        <div class="chip-rail swipe" role="group" aria-label="Категории дизайн-системы">
          ${CATALOG_CATEGORIES.map((c) => `<button type="button" class="chip-btn${curCat === c.id ? " on" : ""}" data-a="bb-cat" data-v="${esc(c.id)}">${esc(c.label)}</button>`).join("")}
        </div>
        <label class="bb-catalog-search">
          ${icon("search")}
          <input type="search" id="bb-catalog-q" value="${esc(bb.catQ || "")}" placeholder="Поиск: Hero, Оһуор, WCAG, /market, Do/Don't…" autocomplete="off">
          ${(curCat !== "all" || curQ) ? `<button type="button" class="btn ghost sm" data-a="bb-cat-clear">Сброс</button>` : ""}
        </label>
      </div>
      ${hits.length ? `<div class="bb-catalog-grid">
        ${hits.map((it) => {
          const subApi = subSitesAPI();
          const secSub = subApi && typeof subApi.subsiteForSection === "function" ? subApi.subsiteForSection(it.targetId) : "";
          const routeTag = secSub && subApi && typeof subApi.subsiteHref === "function" ? subApi.subsiteHref(secSub) : "";
          return `<article class="bb-catalog-card">
          <div class="stack" style="gap:4px">
            <div class="row between" style="gap:6px;align-items:flex-start">
              <b style="font-size:13.5px;line-height:1.25">${esc(it.title)}</b>
              <span class="bb-spec-pill">#${esc(it.targetId)}</span>
            </div>
            <p class="small muted" style="margin:0;line-height:1.35">${esc(it.desc)}</p>
          </div>
          <div class="stack" style="gap:6px">
            <div class="row between" style="gap:6px;align-items:center">
              <code class="bb-catalog-code">${esc(it.api)}</code>
              ${routeTag ? `<span class="small muted num" style="font-family:var(--font-mono);font-size:10.5px">${esc(routeTag)}</span>` : ""}
            </div>
            <div class="row between" style="gap:6px">
              <button type="button" class="btn soft sm" data-a="bb-copy-token" data-copy="${esc(it.api)}">Копировать API</button>
              <button type="button" class="btn ghost sm" data-a="land-scroll" data-target="${esc(it.targetId)}">Открыть ↓</button>
            </div>
          </div>
        </article>`;
        }).join("")}
      </div>` : `<div class="empty"><b>По запросу «${esc(curQ)}» компоненты не найдены</b><span>Попробуй: Hero, Оһуор, WCAG, /market, slider или Do/Don't.</span><button type="button" class="btn soft sm" data-a="bb-cat-clear">Показать все разделы</button></div>`}
    </section>`;
  }

  function brandbookPaneHTML(isDark, bb) {
    const cls = isDark ? "is-dark" : "is-light";
    const title = isDark ? "Чёрный вид (Dark · OLED)" : "Белый вид (Light)";
    const hourStr = String(bb.hour).padStart(2, "0") + ":00";
    const hourPct = Math.round(((bb.hour - 10) / 10) * 100);
    const favOn = bb.fav !== false;
    const dayObj = bbDayObj(bb.day || "all");
    const dayPrefix = dayObj.id === "all" ? "Сб" : dayObj.wd;
    const sStyle = bb.sliderStyle || "ticks";
    const swatches = isDark
      ? [
          ["#000000", "Фон страницы", "--bg"],
          ["#16181D", "Карточка", "--surface"],
          ["#22252E", "Серый тег / чип", "--surface-2"],
          ["#282B36", "Граница 1 px", "--line"],
          ["#1D7BFF", "Синий hh (CTA)", "--accent"],
          ["#102548", "Мягкий синий", "--accent-soft"],
          ["#C59B5F", "Золото Саха (Бета / Ставка)", "--gold"],
          ["#E5C185", "Золотой текст ставки", "--gold-ink"],
          ["#22C55E", "Подтверждено ✓", "--confirm"],
          ["#A78BFA", "Выше рынка (профи)", "--pro"],
          ["#FB923C", "Уведомление", "--notif"],
          ["#FF4D5E", "Ошибка / Опасность", "--bad"],
          ["#F59E0B", "Предупреждение", "--warn"],
          ["#38BDF8", "Предмет · Химия", "--c-chem"]
        ]
      : [
          ["#F4F5F7", "Фон страницы", "--bg"],
          ["#FFFFFF", "Белая карточка", "--surface"],
          ["#F2F3F6", "Серый тег / чип", "--surface-2"],
          ["#E4E6EC", "Граница 1 px", "--line"],
          ["#0070FF", "Синий hh (CTA)", "--accent"],
          ["#EBF3FF", "Мягкий синий", "--accent-soft"],
          ["#C59B5F", "Золото Саха (Бета / Ставка)", "--gold"],
          ["#8C6327", "Золотой текст ставки", "--gold-ink"],
          ["#16A34A", "Подтверждено ✓", "--confirm"],
          ["#7C3AED", "Выше рынка (профи)", "--pro"],
          ["#F97316", "Уведомление", "--notif"],
          ["#FF2B4D", "Ошибка / Опасность", "--bad"],
          ["#B45309", "Предупреждение", "--warn"],
          ["#0284C7", "Предмет · Химия", "--c-chem"]
        ];
    return `<div class="bb-pane ${cls}" data-bb-pane="${isDark ? "dark" : "light"}">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${title}</b>
        <span class="chip">${isDark ? "Ночная тема" : "Дневная тема · клик копирует HEX"}</span>
      </div>
      <div class="bb-swatches">
        ${swatches.map(([hex, label, tok]) => `<button type="button" class="bb-swatch" data-a="bb-copy-token" data-copy="${hex} · ${tok}" title="Скопировать ${hex} (${tok})">
          <div class="bb-swatch-chip" style="background:${hex}"><span class="bb-swatch-copy">Копировать</span></div>
          <div class="bb-swatch-info"><b>${label}</b><span>${hex} · ${tok}</span></div>
        </button>`).join("")}
      </div>
      <div class="card" style="padding:14px">
        <div class="row between" style="gap:8px;margin-bottom:8px;flex-wrap:wrap">
          <span class="small muted">Кнопки, иконки и оранжевые уведомления</span>
          <span class="chip notif"><span class="bb-pulse-dot"></span>3 новых</span>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
          <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
          <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
          <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
          <button type="button" class="btn" disabled>Неактивна</button>
          <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное">${icon(favOn ? "heartFill" : "heart")}</button>
          <span class="icon-btn sm" aria-hidden="true">${icon("eyeOff")}</span>
          <span class="bb-bell-wrap" aria-hidden="true"><span class="icon-btn sm">${icon("bell")}</span><span class="bb-notif-badge">3</span></span>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:10px">
          <button type="button" class="bb-filter-active" data-a="bb-chip">${bb.chipOn ? "UX/UI и Figma ×" : "+ Направление"}</button>
          <span class="tutor-tag-pill">+ Время 10:00–20:00</span>
          <span class="tutor-tag-pill">Можно удалённо</span>
          <span class="chip notif">Уведомление · ответ бота</span>
        </div>
      </div>
      <div class="hh-time-picker">
        <div class="row between">
          <span class="small muted">Ползунок-палка 10:00–20:00</span>
          <span class="hh-time-val num" data-bb="hour">${dayPrefix} · ${hourStr}</span>
        </div>
        <input class="hh-time-range${sStyle === "ruler" ? " is-ruler" : ""}" id="${isDark ? "bb-hour-range-dark" : "bb-hour-range"}" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Ползунок времени в брендбуке">
        ${sliderTicksHTML(bb.hour, sStyle)}
        <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
      </div>
      <div class="hh-price-stepper">
        <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
        <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted">твоя ставка за час</span></div>
        <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
      </div>
      <article class="card tutor-card" style="box-shadow:none">
        <div class="stack" style="gap:8px">
          <div class="tutor-head">
            <div style="min-width:0">
              <h3 class="h3" style="font-size:17px">Репетитор · UX/UI и Figma</h3>
              <div class="hh-price-row" style="margin-top:4px">${priceHeadlineHTML(2000, bb.price, false)}</div>
              <div class="hh-diff-strip" style="margin-top:6px">
                ${priceDiffTagsHTML({ tutorPrice: 1200, marketPrice: 2000, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
              </div>
            </div>
            <div class="row" style="gap:2px;flex:none">
              <span class="fav-btn" aria-hidden="true">${icon("eyeOff")}</span>
              <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="В избранное">${icon(favOn ? "heartFill" : "heart")}</button>
            </div>
          </div>
          <div class="tutor-name-line">
            <b style="color:var(--ink)">Денис Ковалёв</b>
            <span class="verified-badge" aria-hidden="true">${icon("check")}</span>
            <span class="small muted">· Онлайн по РФ · ★ 4.9 (27)</span>
          </div>
          <div class="tutor-tags">
            <span class="tutor-tag-pill">Доска Ykt · TG · MAX</span>
            <span class="tutor-tag-pill">Figma &amp; After Effects</span>
          </div>
        </div>
        <div class="tutor-actions single">
          <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
        </div>
      </article>

      ${sakhaOhyorHTML("Вектор ЕГЭ · Саха", { goldLogo: true })}

      <div class="stack" style="gap:8px;padding-top:4px">
        <div class="hh-price-stepper compact">
          <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
          <label class="hh-step-readout is-inline">
            <input class="demo-rate-input num" type="number" min="500" max="3000" step="100" value="${Number(bb.price) || 1200}" readonly aria-label="Ставка">
            <span class="hh-step-unit">₽/ч</span>
          </label>
          <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
        </div>
        <div class="tc-autobump-card" style="padding:10px 12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="chip gold">${icon("spark")}<span>Авто-24 ч</span></span>
            <b class="num savings-gold-txt">23:59:18</b>
            <button type="button" class="btn soft sm" data-a="bb-demo-toast">Поднята · 4 ч</button>
          </div>
        </div>
      </div>
    </div>`;
  }

  function logoSectionHTML() {
    const surfaces = [
      ["light", "01 · На белом фоне (#FFFFFF)", "background:#ffffff;color:#0e1116", "Подготовка и репетиторы", "Чёткие чёрные линии орнамента в белом круге без розового оттенка + векторная надпись «Вектор ЕГЭ» сразу после лого."],
      ["dark", "02 · На чёрном OLED (#000000)", "background:#000000;color:#ffffff", "Dark OLED · Инверсия", "Линии и кольцо круга автоматически становятся чисто-белыми, а «ЕГЭ» подсвечивается в OLED-синий #3B8FFF."],
      ["blue", "03 · На синем фоне (#0070FF)", "", "Фирменный синий фон", "На синем фоне круг превращается в белый медальон с синим орнаментом #0057D9, а надпись «Вектор ЕГЭ» — в белый вектор."]
    ];
    return `<section class="land-sec" id="bb-logo">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Круглый знак Саха · Кастомный вектор «Вектор ЕГЭ» · SVG Pack</div>
          <h2 class="h2">Адаптивный логотип: белый, чёрный и синий фоны + скачивание SVG</h2>
        </div>
        <span class="bb-spec-pill">circle · #0E1116 / #FFF / #0070FF · vector wordmark</span>
      </div>
      <div class="bb-logo-grid">
        ${surfaces.map(([surf, cap, st, sub, desc]) => `<div class="card pad stack" style="gap:8px">
          <span class="small muted">${cap}</span>
          <div class="bb-logo-stage" data-surface="${surf}"${st ? ` style="${st}"` : ""}>
            <div class="bb-logo-safe">${brandLockupHTML({ surface: surf, sub })}</div>
          </div>
          <span class="small muted">${desc}</span>
          <div class="bb-logo-actions">
            <button type="button" class="btn soft sm" data-a="bb-logo-dl" data-surface="${surf}" data-kind="lockup">${icon("download")}<span>Lockup .svg</span></button>
            <button type="button" class="btn ghost sm" data-a="bb-logo-dl" data-surface="${surf}" data-kind="mark">Знак .svg</button>
            <button type="button" class="btn ghost sm" data-a="bb-logo-copy" data-surface="${surf}" data-kind="lockup">${icon("copy")}<span>SVG</span></button>
          </div>
        </div>`).join("")}
      </div>

      <div class="card pad stack" style="gap:10px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>Как нельзя использовать логотип (Logo Don&#39;ts)</b>
          <span class="chip bad">Охранное поле ≥ 8 px · мин. круг 24×24 px</span>
        </div>
        <div class="bb-logo-donts">
          <div class="bb-logo-dont-card">
            <div class="bb-logo-bad-box pink">${BRAND_MARK_HTML}</div>
            <b class="small">✕ Розовая или грязная подложка</b>
            <span class="small muted">Круг знака всегда чисто-белый (#FFFFFF) или OLED-чёрный (#0B0D12), без розовых оттенков.</span>
          </div>
          <div class="bb-logo-dont-card">
            <div class="bb-logo-bad-box skew">${BRAND_MARK_HTML}</div>
            <b class="small">✕ Искажение и поворот звезды</b>
            <span class="small muted">Нельзя растягивать пропорции и сбивать строгую симметрию D4 (45° лучи + 4 кардинала).</span>
          </div>
          <div class="bb-logo-dont-card">
            <div class="bb-logo-bad-box tiny">${BRAND_MARK_HTML}</div>
            <b class="small">✕ Мельче 24×24 px</b>
            <span class="small muted">При уменьшении ниже 24 px центр 8-лучевой звезды сливается; минимум favicon — 32×32 px.</span>
          </div>
        </div>
      </div>

      <div class="card pad row between" style="gap:10px;flex-wrap:wrap;align-items:center">
        <div class="stack" style="gap:2px">
          <b>Предметные акценты и копируемые токены <code>tokens.json</code></b>
          <span class="small muted">Топбар: 34–40 px круг · авторизация: 56 px круг · адаптация под Светлую / Тёмную тему</span>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="chip" style="border:1px solid color-mix(in srgb, var(--c-bio) 35%, var(--line));cursor:pointer;background:color-mix(in srgb, var(--c-bio) 14%, var(--surface));color:var(--c-bio)" data-a="bb-copy-token" data-copy="var(--c-bio) · #7C3AED / #A855F7">Биология · --c-bio</button>
          <button type="button" class="chip" style="border:1px solid color-mix(in srgb, var(--c-chem) 35%, var(--line));cursor:pointer;background:color-mix(in srgb, var(--c-chem) 14%, var(--surface));color:var(--c-chem)" data-a="bb-copy-token" data-copy="var(--c-chem) · #0284C7 / #38BDF8">Химия · --c-chem</button>
          <button type="button" class="chip" style="border:1px solid color-mix(in srgb, var(--c-rus) 35%, var(--line));cursor:pointer;background:color-mix(in srgb, var(--c-rus) 14%, var(--surface));color:var(--c-rus)" data-a="bb-copy-token" data-copy="var(--c-rus) · #EA580C / #FB923C">Русский · --c-rus</button>
        </div>
      </div>
    </section>`;
  }

  function formsSectionHTML(bb) {
    const sw = bb.switchVal || "online";
    return `<section class="land-sec" id="bb-forms">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Формы · Валидация · :focus-visible</div>
          <h2 class="h2">Инпуты, селекты, фокусы с клавиатуры и переключатели</h2>
        </div>
        <span class="bb-spec-pill">h 40 px · r 12 px · focus 3 px</span>
      </div>
      <div class="bb-forms-grid">
        <div class="card pad stack" style="gap:10px">
          <div class="field">
            <label for="bb-demo-search">Поиск анкет (обычный .input)</label>
            <input class="input" id="bb-demo-search" type="search" placeholder="Предмет, КИМ 22 или имя преподавателя…">
            <span class="hint">Стандартная рамка --line-strong 1 px, фон --surface.</span>
          </div>
          <div class="field">
            <label for="bb-demo-focus">Состояние :focus и клавиатурный :focus-visible</label>
            <input class="input bb-input-focus" id="bb-demo-focus" type="text" value="Английский · 1 200 ₽/ч" readonly>
            <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:2px">
              <button type="button" class="btn sm bb-focus-ring-btn">Фокус Tab на CTA</button>
              <span class="small muted">Внешнее кольцо 2 px + тень 3 px --accent-soft.</span>
            </div>
          </div>
          <div class="field">
            <label for="bb-demo-err">Ошибка валидации (--bad)</label>
            <input class="input bb-input-error" id="bb-demo-err" type="text" value="08:30" aria-invalid="true">
            <span class="bb-hint-err">Укажите час в окне 10:00–20:00 (например, 14:00).</span>
          </div>
          <div class="field">
            <span class="label">Сегмент-переключатель (.switch)</span>
            <div class="switch" role="group" aria-label="Формат в брендбуке">
              <button type="button" data-a="bb-switch" data-v="online" aria-pressed="${sw === "online"}">Онлайн</button>
              <button type="button" data-a="bb-switch" data-v="offline" aria-pressed="${sw === "offline"}">Очно</button>
              <button type="button" data-a="bb-switch" data-v="all" aria-pressed="${sw === "all"}">Любой</button>
            </div>
          </div>
          <div class="field">
            <label for="bb-demo-notes">Комментарий ученика (.textarea)</label>
            <textarea class="textarea" id="bb-demo-notes" rows="2" placeholder="Разобрать задание №28 (генетика) и пробник…"></textarea>
          </div>
        </div>
        <div class="card pad stack" style="gap:10px">
          <div class="field">
            <span class="label">Выбор предмета (.hh-select)</span>
            ${hhSelectHTML({
              id: "bb-demo-select",
              options: BB_SUBJECTS,
              value: bb.subj || "bio",
              open: !!bb.subjMenuOpen,
              toggleAction: "bb-subj-toggle",
              pickAction: "bb-subj-pick",
              ariaLabel: "Предмет подготовки"
            })}
            <span class="hint">Тематический список в цветах Светлой/Тёмной темы без системного тёмного меню браузера.</span>
          </div>
          <div class="field">
            <span class="label">Мультивыбор предметов (.hh-multi)</span>
            ${typeof hhMultiSelectHTML === "function"
              ? hhMultiSelectHTML({
                  id: "bb-demo-multi",
                  options: BB_SUBJECTS,
                  values: Array.isArray(bb.multiSubjs) ? bb.multiSubjs : ["bio", "chem"],
                  placeholder: "Выберите предметы",
                  open: !!bb.multiMenuOpen,
                  toggleAction: "bb-multi-toggle",
                  pickAction: "bb-multi-pick",
                  ariaLabel: "Мультивыбор предметов"
                })
              : ""}
            <span class="hint">Синхронный checklist-выпадающий список с отметками и крестиком «×» прямо внутри выбранных тегов поля (без дублирования чипов снизу).</span>
          </div>
          <div class="field">
            <span class="label">Город и часовой пояс (Профиль преподавателя)</span>
            <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
              <div class="hh-seg equal" style="flex:1 1 155px" role="group" aria-label="Демо города преподавателя">
                <button type="button" class="on" data-a="bb-demo-toast">Якутск</button>
                <button type="button" data-a="bb-demo-toast">Москва</button>
              </div>
              <select class="select" style="flex:1 1 170px" aria-label="Демо часового пояса">
                <option selected>Якутск (UTC+9)</option>
                <option>Москва (UTC+3)</option>
              </select>
            </div>
            <span class="hint">По умолчанию для анкеты и расписания — <b>Якутск (UTC+9)</b>; в фильтре городов доступны только Якутск и Москва.</span>
          </div>
          <div class="field">
            <span class="label">Вход и выбор роли по умолчанию (.hh-seg.equal · authCard)</span>
            <div class="hh-seg equal" role="group" aria-label="Демо выбора роли при входе">
              <button type="button" data-a="bb-app-role" data-role="student" aria-pressed="${(bb.appRole || "student") !== "tutor"}">${icon("book")}<span>Как ученик</span></button>
              <button type="button" data-a="bb-app-role" data-role="tutor" aria-pressed="${bb.appRole === "tutor"}">${icon("users")}<span>Как преподаватель</span></button>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:4px">
              <button type="button" class="btn ghost sm" data-a="auth-modal-open">Продолжить через Google</button>
              <button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>
            </div>
          </div>
          <div class="notice info"><b>Информационное плашко-уведомление (.notice.info)</b><span class="small">Используется для нейтральных подсказок без давления и красных алертов.</span></div>
        </div>
      </div>
    </section>`;
  }

  function cardsAndOverlaysSectionHTML(bb) {
    const picked = bb.pickedPlan || "month10k";
    const plans = [
      ["trial5k", "4 590 ₽", "Стандарт · 4 урока (СБП)", "Абонемент 1-на-1", ["Поурочный СБП-эскроу без карточных наценок", "ИИ-Старт ЕГЭ бесплатно + доплаты от 100 ₽"], "featured"],
      ["month10k", "8 900 ₽", "Интенсив · Месяц под ключ", "Супер-подписка", ["Особый оттенок .super + кэшбэк 2%", "8 уроков, замена за 15 мин и фиксация ставки"], "featured super"]
    ];
    return `<section class="land-sec" id="bb-cards-sys">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Тарифы · Модалки · Боковые уведомления · Таблицы</div>
          <h2 class="h2">Иерархия тарифов (.plan-card / .super), шторки и тосты</h2>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn soft sm" data-a="bb-demo-toast">Запустить живой тост</button>
          <button type="button" class="btn sm" data-a="bb-modal-open">Открыть пример модалки</button>
        </div>
      </div>
      <div class="grid-2">
        ${plans.map(([id, price, name, badge, perks, extraCls]) => {
          const isPick = picked === id;
          const btnCls = isPick ? "btn sm is-confirmed" : (extraCls ? "btn sm" : "btn soft sm");
          return `<div class="card plan-card${extraCls ? " " + extraCls : ""}${isPick ? " picked" : ""}">
            <div class="stack" style="gap:8px">
              <div class="row between" style="gap:6px">
                <b>${name}</b>
                <span class="chip${id === "month10k" ? " pro" : (id === "trial5k" ? " accent" : "")}">${badge}</span>
              </div>
              <div style="font-size:24px;font-weight:800" class="num">${price}</div>
              <div class="stack" style="gap:4px">
                ${perks.map((p) => `<span class="small ink2">✓ ${p}</span>`).join("")}
              </div>
            </div>
            <button type="button" class="${btnCls}" data-a="bb-plan-pick" data-v="${id}" style="margin-top:12px;width:100%">${isPick ? "✓ Выбран в макете (.picked)" : "Примерить .picked"}</button>
          </div>`;
        }).join("")}
      </div>
      <div class="bb-overlays-grid" style="margin-top:14px">
        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>Боковое уведомление (.toast.is-side)</b><span class="bb-spec-pill notif">× или свайп влево</span></div>
          ${bb.previewToastDismissed
            ? `<div class="bb-toast-dismissed">
                <span class="small muted">Уведомление скрыто свайпом или по ×</span>
                <button type="button" class="btn soft sm" data-a="bb-preview-toast-reset">Показать снова</button>
              </div>`
            : `<div class="bb-toast-preview" data-swipe-toast="preview">
                ${sentNoticeHTML({
                  slot: `${String(bb.hour).padStart(2, "0")}:00`,
                  offer: bb.price,
                  closeAction: "bb-preview-toast-close"
                })}
                <div class="bb-toast-swipe-hint">
                  <span>← смахни влево или нажми ×</span>
                  <span>right 20 px</span>
                </div>
              </div>`}
          <span class="small muted">Закрывается кнопкой × или свайпом влево (включая живой тост сверху справа). На телефонах (&le; 720 px) без перекрытия таб-бара.</span>
        </div>
        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>Анатомия модального окна (.modal-card)</b><span class="bb-spec-pill">backdrop blur · max-w 520 px</span></div>
          <div class="bb-modal-preview">
            <div class="modal-head">
              <div class="row" style="gap:8px">${icon("cal")}<b>Заголовок окна · Закрытие по Esc / клику вне</b></div>
              <button type="button" class="icon-btn sm" data-a="bb-modal-open" aria-label="Открыть модалку">${icon("eye")}</button>
            </div>
            <div class="table-wrap">
              <table class="tbl">
                <thead><tr><th>Параметр</th><th>Значение</th><th>Правило</th></tr></thead>
                <tbody>
                  <tr><td>Отступ экрана</td><td class="num">16 px</td><td class="small muted">Безопасный зазор на 390 px</td></tr>
                  <tr><td>Скругление</td><td class="num">20 px</td><td class="small muted">--r + 4 px для диалога</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>`;
  }

  function studyAndStatesSectionHTML(bb) {
    const qPicked = Number(bb.quizOpt);
    const quizOpts = [
      ["А", "Митохондрия — синтез АТФ", qPicked === 0 ? "ok" : ""],
      ["Б", "Рибосома — фотолиз воды", qPicked === 1 ? "bad" : ""],
      ["В", "Комплекс Гольджи — упаковка секрета", qPicked === 2 ? "miss" : ""]
    ];
    return `<section class="land-sec" id="bb-study-states">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Тренажёр ЕГЭ · Системные состояния</div>
          <h2 class="h2">Учебные компоненты (.opt / .meter / .theory) и Loading / Empty / Error</h2>
        </div>
        <span class="bb-spec-pill">полный жизненный цикл UI</span>
      </div>
      <div class="bb-study-grid">
        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>Варианты ответа в тесте (.opt)</b><span class="small muted">нажми для переключения</span></div>
          <div class="opts">
            ${quizOpts.map(([k, txt, st], idx) => `<button type="button" class="opt${st ? " " + st : ""}" data-a="bb-quiz-opt" data-i="${idx}" aria-pressed="${qPicked === idx}">
              <span class="opt-key">${k}</span>
              <span style="flex:1;text-align:left">${txt}</span>
              ${st === "ok" ? `<span class="opt-mark" style="color:var(--good)">Верно</span>` : st === "bad" ? `<span class="opt-mark" style="color:var(--bad)">Ошибка</span>` : st === "miss" ? `<span class="opt-mark" style="color:var(--good)">Пропущено</span>` : ""}
            </button>`).join("")}
          </div>
        </div>
        <div class="card pad stack" style="gap:12px">
          <div class="row between"><b>Прогресс (.meter), плитка (.tile) и конспект (.theory)</b><span class="chip accent">Учёба</span></div>
          <div class="tile" style="padding:12px 14px">
            <span class="tile-label">Готовность к экзамену</span>
            <b class="tile-value num">84 / 100</b>
            <span class="tile-note">Использован градиентный метр --accent → --leaf</span>
          </div>
          <div class="meter"><i style="width:74%"></i></div>
          <ul class="theory">
            <li class="th-h">Правило оформления конспекта</li>
            <li><b>Жирный акцент</b> выделяет ключевой термин без визуального шума.</li>
          </ul>
        </div>
      </div>
      <div class="bb-states-grid" style="margin-top:12px">
        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>Загрузка · Skeleton</b><span class="bb-spec-pill">1.6 s shimmer</span></div>
          <div class="bb-skel-bar" style="width:62%"></div>
          <div class="bb-skel-bar" style="width:94%;height:18px"></div>
          <div class="bb-skel-bar" style="width:45%"></div>
          <span class="small muted">Показывается вместо пустого экрана при загрузке анкет и ответа ИИ.</span>
        </div>
        <div class="empty">
          <b>Пусто · По фильтрам нет анкет</b>
          <span class="small muted">Пунктирный контейнер .empty 1 px --line-strong</span>
          <button type="button" class="btn soft sm" data-a="bb-chip">Сбросить фильтры</button>
        </div>
        <div class="confirm">
          <b>Опасное действие / Адаптивный фокус (.confirm + .btn.danger)</b>
          <span class="small">Красная кнопка меняет оттенок при hover/нажатии, имеет собственный красный :focus-visible (без синей рамки) и мягкий переход в отменённое состояние.</span>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${(() => {
              const undone = !!bb.cancelDemoUndone;
              return `<button type="button" class="btn ${undone ? "bb-btn-adaptive is-undone" : "danger bb-btn-adaptive"} sm" data-a="bb-cancel-demo" aria-pressed="${undone}">${undone ? "Запись отменена · вернуть" : "Отменить запись"}</button>`;
            })()}
            <button type="button" class="btn ghost sm" data-a="bb-chip">${bb.cancelDemoUndone ? "Закрыть" : "Оставить"}</button>
          </div>
        </div>
      </div>
    </section>`;
  }

  function doDontSectionHTML() {
    return `<section class="land-sec" id="bb-dodont">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Контроль качества UI · Do / Don&#39;t · Tone of Voice</div>
          <h2 class="h2">Как правильно ✓, как делать нельзя ✕ и стандарты текстов</h2>
        </div>
      </div>
      <div class="bb-dodont-grid">
        <div class="bb-do-card">
          <span class="chip confirm" style="justify-self:start">✓ Можно · Строго оранжевые уведомления</span>
          <div class="row" style="gap:10px;align-items:center">
            <span class="bb-bell-wrap"><span class="icon-btn sm">${icon("bell")}</span><span class="bb-notif-badge">3</span></span>
            <span class="chip notif"><span class="bb-pulse-dot"></span>На рассмотрении · уведомим</span>
          </div>
          <span class="small muted">Новые ответы и ожидание преподавателя всегда оранжевые (#F97316), а не аварийно-красные.</span>
        </div>
        <div class="bb-dont-card">
          <span class="chip bad" style="justify-self:start">✕ Нельзя · Красные счётчики и комиссия в подборе</span>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <span class="chip bad">3 ответа (ошибка цвета)</span>
            <span class="chip">Раскрытие 5% сбора на карточке выбора</span>
          </div>
          <span class="small muted">Красный цвет (--bad) зарезервирован под ошибки форм; сервисный сбор 5% виден только при оплате на /fees.</span>
        </div>
      </div>

      <div class="bb-tone-grid">
        <div class="bb-tone-card">
          <span class="bb-spec-pill">Числа, ставки и время</span>
          <b>«1 200 ₽/ч» и «10:00–20:00»</b>
          <span class="small muted">Тысячи через пробел, единица всегда <code>₽/ч</code>, интервал — короткое тире без пробелов; цифры строго в <code>.num</code> (tabular-nums).</span>
        </div>
        <div class="bb-tone-card">
          <span class="bb-spec-pill confirm">Тон уведомлений · без стресса</span>
          <b>Спокойные формулировки</b>
          <span class="small muted">Вместо «Срочно / Неудача» используем нейтрально-позитивное «На рассмотрении · уведомим об ответе».</span>
        </div>
        <div class="bb-tone-card">
          <span class="bb-spec-pill pro">Якутская орфография Саха</span>
          <b>Күн Оһуор · Сулус · Харысхал · Сөп</b>
          <span class="small muted">Пишем с точными буквами <code>ҕ / ҥ / ө / һ / ү</code>, не заменяя их на похожие латинские или русские символы.</span>
        </div>
      </div>
    </section>`;
  }

  function marketAndAppSectionHTML(bb) {
    const accepted = !!bb.marketDemoAccepted;
    const pickedHour = String(bb.hour || 14).padStart(2, "0") + ":00";
    const appRole = bb.appRole === "tutor" ? "tutor" : "student";
    const tutorSide = appRole === "tutor";
    const sideItems = tutorSide
      ? [
          { ico: "chat", label: "Заявки", active: true, badge: "2" },
          { ico: "cal", label: "Календарь учеников" },
          { ico: "users", label: "Мои ученики" },
          { ico: "search", label: "Ученики ищут" },
          { ico: "sliders", label: "Профиль" },
          { ico: "wallet", label: "Выплаты" },
          { ico: "book", label: "Справочник" }
        ]
      : [
          { ico: "list", label: "Тесты", active: true },
          { ico: "book", label: "Справочник" },
          { ico: "search", label: "Репетиторы" },
          { ico: "cal", label: "Учёба" },
          { ico: "chart", label: "Показатели" }
        ];
    const tabItems = tutorSide
      ? [
          { ico: "chat", label: "Заявки", active: true, badge: "2" },
          { ico: "cal", label: "Календарь" },
          { ico: "users", label: "Ученики" },
          { ico: "sliders", label: "Профиль" },
          { ico: "wallet", label: "Выплаты" }
        ]
      : [
          { ico: "list", label: "Тесты", active: true },
          { ico: "book", label: "Справочник" },
          { ico: "search", label: "Репетиторы" },
          { ico: "cal", label: "Учёба" },
          { ico: "chart", label: "Показатели" }
        ];
    return `<section class="land-sec" id="bb-market-app">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Реальное приложение · /market + кабинет ${tutorSide ? "преподавателя" : "ученика"}</div>
          <h2 class="h2">Каталог репетиторов, кабинет преподавателя и нижний .tabbar (5 вкладок)</h2>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <div class="hh-seg" role="group" aria-label="Режим кабинета в брендбуке">
            <button type="button" data-a="bb-app-role" data-role="student" aria-pressed="${!tutorSide}">Ученик</button>
            <button type="button" data-a="bb-app-role" data-role="tutor" aria-pressed="${tutorSide}">Преподаватель</button>
          </div>
          <button type="button" class="btn soft sm" data-a="bb-market-req-toggle">${accepted ? "Вернуть «На рассмотрении»" : "Симулировать ответ ✓"}</button>
          <button type="button" class="btn ghost sm" data-a="go" data-v="${tutorSide ? "cabinet" : "market"}">${tutorSide ? "Открыть кабинет →" : "Открыть /market →"}</button>
        </div>
      </div>

      ${tutorSide ? `<div class="tc-req-card ${accepted ? "is-accepted" : "is-pending"}">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <b>Айтал Никифоров · 11 класс</b>
            <span class="chip">Биология · ЕГЭ 2027</span>
            <span class="chip ${accepted ? "confirm" : "gold"}">${accepted ? "✓ Вы подтвердили" : "Новая заявка · 95% на руки"}</span>
          </div>
          <span class="small muted num">Суббота · ${pickedHour} · Онлайн</span>
        </div>
        <div class="tc-req-quote">«Нужен разбор №28 на кроссинговер и два пробника в неделю.»</div>
        <div class="row between" style="gap:10px;flex-wrap:wrap">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <b class="num" style="font-size:17px">${bb.price.toLocaleString("ru-RU")} ₽/ч</b>
            <span class="small muted">(на руки 95%: <b class="num">${Math.round(bb.price * 0.95).toLocaleString("ru-RU")} ₽</b>)</span>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn gold sm" data-a="bb-demo-toast">${icon("spark")} Поднять анкету (раз в 4 ч)</button>
            <button type="button" class="btn ${accepted ? "confirm" : ""} sm" data-a="bb-market-req-toggle">${accepted ? "✓ Подтверждено" : "✓ Подтвердить"}</button>
          </div>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <span class="chip gold">${icon("spark")} Автоподнятие 24 ч</span>
          <span class="chip">Профиль: 100%</span>
          <span class="chip accent">Календарь учеников 10:00–20:00</span>
          <span class="chip">Выплаты + Трекер баллов</span>
        </div>
      </div>` : ""}

      <div class="reqs-strip" aria-label="Полоса откликов ученика">
        <div class="req-item">
          <div class="stack" style="gap:3px;min-width:0">
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <b>Сардана Егорова</b>
              <span class="chip">ЕГЭ · Биология</span>
              <span class="chip ${accepted ? "accent" : "notif"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>
            </div>
            <div class="small ink2">Суббота в ${pickedHour} (Онлайн) · твоя ставка <b class="num">${bb.price.toLocaleString("ru-RU")} ₽/ч</b> <span class="muted">(вместо 1 800 ₽)</span></div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            ${accepted
              ? (messengerLinksHTML
                  ? messengerLinksHTML({
                      entity: { id: "t-sardana", name: "Сардана Егорова", whatsapp: "79142100102", telegram: "sardana_bio", maxHandle: "sardana_ege" },
                      message: `Здравствуйте, Сардана! Пишу по поводу подтверждённого урока (${pickedHour}, ставка ${bb.price} ₽/ч).`,
                      primaryLabel: "Написать · WA",
                      compact: true
                    })
                  : `<button type="button" class="btn confirm sm" data-a="bb-demo-toast">${icon("msg")}<span>Написать</span></button>`)
              : `<button type="button" class="btn soft sm" data-a="bb-market-req-toggle">Тест: подтвердить</button>`}
            <button type="button" class="btn ${accepted ? "ghost" : "danger bb-btn-adaptive"} sm" data-a="bb-market-req-toggle">${accepted ? "Сменить репетитора" : "Отменить"}</button>
          </div>
        </div>
      </div>

      <div class="bb-nav-arch">
        <div class="stack" style="gap:10px">
          <aside class="bb-side-mock" aria-label="Архитектура боковой панели кабинета (.side)">
            ${brandLockupHTML({ sub: tutorSide ? "Кабинет преподавателя" : "ЕГЭ 2027 · 3 предмета" })}
            ${sideItems.map((it) => `<div class="bb-side-item${it.active ? " on" : ""}"><span>${icon(it.ico)} ${it.label}</span>${it.badge ? `<button type="button" class="chip notif num side-badge-jump" data-a="bb-demo-toast" style="position:static;transform:none" title="Клик ведёт к ожидающим заявкам">${it.badge}</button>` : `<span class="chip">${tutorSide ? "7-item" : "·"}</span>`}</div>`).join("")}
            <div class="small muted" style="padding-top:6px;border-top:1px solid var(--line)">${tutorSide ? "У преподавателя скрыты «Предметы» и нет «Каталога»; клик по «2» сразу открывает ожидающие заявки." : "На ≤ 899 px сайдбар сворачивается в 5-вкладочный <code>.tabbar</code> — баланс перемещается в верхний правый угол."}</div>
          </aside>
          <div class="bb-tabbar-mock" role="navigation" aria-label="Мобильный нижний .tabbar (5 вкладок)">
            ${tabItems.map((it) => `<div class="bb-tabbar-mock-item${it.active ? " on" : ""}">${it.badge ? `<span class="bb-tabbar-mock-badge">${it.badge}</span>` : ""}${icon(it.ico)}<span>${it.label}</span></div>`).join("")}
          </div>
        </div>

        <article class="card tutor-card" style="box-shadow:none">
          <div class="stack" style="gap:10px">
            <div class="tutor-head">
              <div style="min-width:0">
                <h3 class="h3" style="font-size:17px">Репетитор · Биология и химия</h3>
                <div class="hh-price-row" style="margin-top:4px">${priceHeadlineHTML(2000, bb.price, false)}</div>
                <div class="hh-diff-strip" style="margin-top:6px">
                  ${priceDiffTagsHTML({ tutorPrice: 1200, marketPrice: 2000, offerPrice: bb.price, customBadges: ["К.т.н. · эксперт жюри ВсОШ", "Медвуз · 94+ б."] })}
                </div>
              </div>
              <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${bb.fav !== false}" aria-label="В избранное">${icon(bb.fav !== false ? "heartFill" : "heart")}</button>
            </div>
            <div class="tutor-name-line">
              <b style="color:var(--ink)">Айтал Николаев</b>
              <span class="verified-badge" aria-hidden="true">${icon("check")}</span>
              <span class="small muted">· Якутск / Онлайн · ★ 4.9 (41)</span>
            </div>
            <div class="tutor-tags">
              <span class="tutor-tag-pill">Доска Ykt · MAX · с 10:00 до 20:00</span>
              <span class="tutor-tag-pill">ЕГЭ и ОГЭ</span>
              <span class="tutor-tag-pill">Стаж 7 лет</span>
            </div>
            <div class="row between small muted" style="gap:6px;flex-wrap:wrap">
              <span>Готов уступить при записи на месяц</span>
              <span class="num">Можно −100 ₽ от 900 ₽/ч</span>
            </div>
            <div class="slot-mini-row">
              <span class="small muted">Слоты:</span>
              <button type="button" class="slot-mini${bb.hour === 12 ? " picked" : ""}" data-a="bb-demo-toast">12:00</button>
              <button type="button" class="slot-mini${bb.hour === 14 ? " picked" : ""}" data-a="bb-demo-toast">14:00</button>
              <button type="button" class="slot-mini${bb.hour === 17 ? " picked" : ""}" data-a="bb-demo-toast">17:00</button>
              <button type="button" class="slot-mini${bb.hour === 19 ? " picked" : ""}" data-a="bb-demo-toast">19:00</button>
            </div>
          </div>
          <div class="tutor-actions single">
            <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
          </div>
        </article>
      </div>
    </section>`;
  }

  function heroBannerAndYakutiaSectionHTML(bb, showSec) {
    const vis = typeof showSec === "function" ? showSec : () => true;
    const mode = bb.mode || "both";
    const renderSakhaCard = (isDark) => `<div class="bb-pane ${isDark ? "is-dark" : "is-light"}">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${isDark ? "Саха UI · Чёрный OLED" : "Саха UI · Белый день"}</b>
        <span class="chip sakha">${icon("sakhaKun")}<span>Узоры Күн Оһуор × Сулус</span></span>
      </div>
      ${sakhaOhyorHTML("Харысхал · Тоҕус харах · Күн Оһуор")}
      ${sakhaButtonsHTML({
        kunActive: !!bb.sakhaKunOn,
        starActive: !!bb.sakhaStarOn,
        patternSent: !!bb.sakhaSent,
        medallionAction: "bb-sakha-medallion",
        diamondAction: "bb-sakha-diamond",
        patternAction: "bb-sakha-toggle",
        compact: true
      })}
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <span class="chip sakha">${icon("ohyorCross")}<span>Тоҕус харах</span></span>
        <span class="chip sakha">${icon("sakhaLattice")}<span>Орто Дойду · Ленские столбы</span></span>
        ${messengerLinksHTML
          ? messengerLinksHTML({
              entity: { id: "sakha-demo", name: "Айтал Николаев", whatsapp: "79142100100", telegram: "aytal_ege", maxHandle: "aytal_sakha" },
              message: "Здравствуйте! Пишу с платформы Вектор ЕГЭ.",
              primaryLabel: "Написать · WA",
              compact: true
            })
          : `<button type="button" class="btn confirm sm" data-a="bb-demo-toast">${icon("msg")}<span>Написать (единая .btn.confirm)</span></button>`}
      </div>
      <span class="small muted">Официальные якутские кнопки EGE.kit.sakhaButtonsHTML() в /brandbook: медальон Күн Оһуор, ромб Сулус и главная узорная кнопка .btn.sakha-pattern (используется для «Сөп · Предложить» без обрезанных краёв).</span>
    </div>`;

    let out = "";
    if (vis("bb-hero-banner")) {
      out += `<section class="land-sec" id="bb-hero-banner" aria-label="Эталон Hero-баннера">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Первый экран /landing · Фото-баннер hh.kz × Ленские столбы</div>
            <h2 class="h2">Hero-баннер /assets/lena-pillars.jpg и 2 кнопки CTA без поисковика</h2>
          </div>
          <button type="button" class="bb-spec-pill" data-a="bb-copy-token" data-copy="EGE.kit.heroBannerHTML()">Копировать EGE.kit.heroBannerHTML()</button>
        </div>
        ${heroBannerHTML({
          brandbookDemo: true,
          catalogTotal: "2 480",
          primaryActive: !!bb.heroSubmitted,
          betaActive: !!bb.heroBetaOn
        })}
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
          <span class="bb-spec-pill">.hero-banner-scrim · светлый градиент справа (0% над скалами)</span>
          <span class="bb-spec-pill confirm">2 CTA: Синий «Найти ниже рынка» + Золото Саха «Попробовать бета-тест» (.btn.gold)</span>
          <span class="bb-spec-pill">Сразу под Hero начинается бегущая лента тем</span>
        </div>
      </section>`;
    }
    if (vis("bb-yakutia")) {
      const sakhaCards = (mode === "light" || mode === "both" ? renderSakhaCard(false) : "") +
        (mode === "dark" || mode === "both" ? renderSakhaCard(true) : "");
      out += `<section class="land-sec" id="bb-yakutia" aria-label="Кнопки в форме якутских узоров">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Саха сирэ · Культурный код · Орнаменты</div>
            <h2 class="h2">Якутские кнопки (Күн Оһуор, Сулус, Харысхал) и золотая линия-лого</h2>
          </div>
          <button type="button" class="bb-spec-pill" data-a="bb-copy-token" data-copy="EGE.kit.sakhaButtonsHTML()">Копировать EGE.kit.sakhaButtonsHTML()</button>
        </div>
        <div class="${mode === "both" ? "bb-cols" : "stack"}">${sakhaCards}</div>
        <div class="card pad stack" style="gap:8px;box-shadow:none">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>Единый золотой разделитель с лого по центру (.sakha-divider.is-gold-logo)</b>
            <span class="bb-spec-pill">1 золотая линия · без двойных полос</span>
          </div>
          ${sakhaOhyorHTML("Вектор ЕГЭ · Саха", { goldLogo: true })}
          <span class="small muted">Используется в подвале лендинга, под фильтрами и для отделения блоков — строго одна линия градиента Саха (#C59B5F) и золотой круглый знак по центру.</span>
        </div>
      </section>`;
    }
    return out;
  }

  const BB_CHART_STYLES = CHART_STYLE_META || [];

  function chartDatasetBars(dsId) {
    return kitChartDatasetBars ? kitChartDatasetBars(dsId) : [];
  }

  function cabinetAndBalanceSectionHTML(bb) {
    const pRate = Number(bb.price) || 1200;
    const cStyle = bb.chartStyle || "sticks";
    const cDataset = bb.chartDataset || "income";
    const bars = chartDatasetBars(cDataset);
    const ch = chartsAPI();
    const comboPts = Math.max(5, Math.min(36, Math.round(Number(bb.chartPoints) || 7)));
    const comboSeries = (cStyle === "combo" && comboPts > 7 && typeof ch.buildMultiSeriesDemo === "function")
      ? (ch.buildMultiSeriesDemo(1, comboPts, cDataset) || [])[0]
      : null;
    const stickBars = (comboSeries && Array.isArray(comboSeries.points) && comboSeries.points.length)
      ? comboSeries.points.map((pt) => ({ wd: pt.wd, val: pt.val, num: pt.num, detail: pt.detail }))
      : bars;
    const cIdx = Number.isInteger(bb.chartActiveIdx)
      ? Math.max(0, Math.min(Math.max(0, stickBars.length - 1), bb.chartActiveIdx))
      : Math.min(3, Math.max(0, stickBars.length - 1));
    const activeBar = stickBars[cIdx] || stickBars[0] || { detail: "" };
    const renderStick = ch.stickChartHTML || kitStickChartHTML || (() => "");
    return `<section class="land-sec" id="bb-cabinet">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Боевые паттерны приложения · Кабинет и баланс</div>
          <h2 class="h2">Кабинет преподавателя, баланс (Desktop + Mobile 28 px «+») и строчный калькулятор</h2>
        </div>
        <span class="bb-spec-pill confirm">Live Parity · v2.1</span>
      </div>

      <div class="bb-forms-grid">
        <div class="card pad stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b>01 · Баланс ученика + Модалка пополнения (.wallet-bar)</b>
            <button type="button" class="btn sm ${bb.balFunded !== false ? "confirm" : "gold"}" data-a="bb-bal-toggle" aria-pressed="${bb.balFunded !== false}">
              ${bb.balFunded !== false ? "5 000 ₽ · активен" : "0 ₽ · до старта"}
            </button>
          </div>
          <div class="stack" style="gap:8px">
            <span class="small muted">На десктопе: внизу слева в <code>#side-balance-slot</code>; на мобилке (≤ 600 px) — вверху справа с кнопкой 28×28 px «+».</span>
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <div class="side-bal-slot" style="flex:1 1 220px;max-width:260px">
                <div class="top-bal-wrap" aria-label="Баланс в сайдбаре десктопа">
                  <button type="button" class="top-bal-pill${bb.balFunded !== false ? " is-funded" : ""}" data-a="bb-bal-toggle">
                    ${icon("wallet")}
                    <b class="num">${bb.balFunded !== false ? "5 000 ₽" : "0 ₽"}</b>
                  </button>
                  <button type="button" class="top-bal-btn" data-a="bb-bal-toggle">${icon("plus")}<span>Пополнить</span></button>
                </div>
              </div>
              <div class="bb-mob-topbal-demo" style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex:1 1 190px;background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:7px 10px">
                <span class="brand-name-txt" style="font-size:13px">Вектор ЕГЭ</span>
                <div class="top-bal-slot">
                  <div class="top-bal-wrap" style="gap:4px">
                    <button type="button" class="top-bal-pill${bb.balFunded !== false ? " is-funded" : ""}" style="min-height:28px;padding:0 8px;font-size:11.5px;gap:4px" data-a="bb-bal-toggle">
                      ${icon("wallet")}
                      <b class="num">${bb.balFunded !== false ? "5 000 ₽" : "0 ₽"}</b>
                    </button>
                    <button type="button" class="top-bal-btn" style="width:28px;min-height:28px;padding:0;justify-content:center" aria-label="Пополнить баланс" data-a="bb-bal-toggle">${icon("plus")}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="card soft pad stack" style="gap:10px;box-shadow:none">
            <div class="wallet-bar">
              <div class="stack" style="gap:2px">
                <span class="small muted">Баланс ученика в модалке</span>
                <span class="wallet-num num">${bb.balFunded !== false ? "5 000 ₽" : "0 ₽"}</span>
              </div>
              <span class="chip ${bb.balFunded !== false ? "confirm" : "gold"}">${bb.balFunded !== false ? "✓ Порог 5 000 ₽ открыт" : "Минимум 5 000 ₽"}</span>
            </div>
            <div class="chip-rail">
              ${(bb.balFunded !== false ? ["100 ₽", "500 ₽", "1 000 ₽", "5 000 ₽"] : ["5 000 ₽ · Старт", "10 000 ₽", "15 000 ₽"]).map((amt, i) =>
                `<button type="button" class="chip-btn${i === 0 ? " on" : ""}" data-a="bb-demo-toast">${amt}</button>`
              ).join("")}
            </div>
            <span class="small muted">${bb.balFunded !== false
              ? "Подписка <b>5 000 ₽</b> активна: следующие пополнения от <b>100 ₽</b> (любая сумма), бесплатный пробный урок <b>0 ₽</b> открыт."
              : "Без старта от <b>5 000 ₽</b> запись на бесплатный пробный урок (0 ₽) и отклики закрыты. Нажмите «0 ₽ · до старта» выше для проверки."
            }</span>
          </div>
        </div>

        <div class="card pad stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>02 · Степпер (.is-inline), Аватар «Без фото» и Авто-24ч</b>
            <span class="bb-spec-pill confirm">Анкеты и Профиль</span>
          </div>
          <div class="stack" style="gap:6px">
            <div class="hh-price-stepper compact demo-rate-stepper">
              <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
              <label class="hh-step-readout is-inline" for="bb-inline-rate">
                <input class="demo-rate-input num" id="bb-inline-rate" type="number" min="500" max="3000" step="100" value="${pRate}" readonly aria-label="Ставка в одну строку">
                <span class="hh-step-unit">₽/ч</span>
              </label>
              <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
            </div>
            <span class="small muted">Число и «₽/ч» всегда в одну строку через <code>inline-flex</code>.</span>
          </div>

          <div class="tc-photo-row">
            <span class="tutor-avatar lg is-no-photo"><span>Без фото</span></span>
            <div class="stack" style="gap:5px;min-width:0;flex:1">
              <div class="tutor-name-line"><b>Мария Петрова</b><span class="verified-badge" aria-hidden="true">${icon("check")}</span></div>
              <div class="tutor-badges">
                <span class="diff-tag pro">Эксперт жюри</span>
                <span class="diff-tag pro">СВФУ · олимпиады</span>
              </div>
              <span class="small muted">Якутск (UTC+9) · до 2 квалификационных плашек</span>
            </div>
          </div>

          <div class="tc-autobump-card" style="padding:12px">
            <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
              <span class="chip gold">${icon("spark")}<span>Авто-24 ч · Ручное поднятие 4 ч</span></span>
              <span class="small muted">Пик: <b>18:00 Якт</b></span>
            </div>
            <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
              <div class="stack" style="gap:1px">
                <span class="small muted">Следующее автоподнятие через</span>
                <b class="num savings-gold-txt" style="font-size:18px">23:59:18</b>
              </div>
              <button type="button" class="btn soft sm" disabled>✓ Поднята · через 03:59:42</button>
            </div>
          </div>
        </div>
      </div>

      <div class="bb-forms-grid" style="margin-top:14px">
        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>03 · Расписание преподавателя 10:00–20:00 (.tc-cal-hours)</b>
            <span class="bb-spec-pill">4 состояния слота</span>
          </div>
          <div class="tc-cal-hours">
            <div class="tc-cal-slot is-open">
              <div class="row" style="gap:10px;min-width:0">
                <span class="tc-cal-time">10:00</span>
                <span class="small ink2">Окно открыто — видно ученикам в <code>/market</code></span>
              </div>
              <button type="button" class="btn ghost sm" data-a="bb-demo-toast">Закрыть час</button>
            </div>
            <div class="tc-cal-slot is-booked">
              <div class="row" style="gap:10px;min-width:0;flex:1 1 200px">
                <span class="tc-cal-time">12:00</span>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <b>Артём Иванов</b>
                  <span class="chip confirm">✓ Подтверждён</span>
                  <span class="chip num">1 100 ₽/ч</span>
                </div>
              </div>
              <button type="button" class="btn soft sm" data-a="bb-demo-toast">${icon("msg")}<span>Чат</span></button>
            </div>
            <div class="tc-cal-slot is-pending">
              <div class="row" style="gap:10px;min-width:0;flex:1 1 200px">
                <span class="tc-cal-time">15:00</span>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <b>Лида Никитина</b>
                  <span class="chip notif">Ждёт ответа</span>
                  <span class="chip num">1 200 ₽/ч</span>
                </div>
              </div>
              <button type="button" class="btn confirm sm" data-a="bb-demo-toast">Подтвердить</button>
            </div>
            <div class="tc-cal-slot">
              <div class="row" style="gap:10px;min-width:0">
                <span class="tc-cal-time">20:00</span>
                <span class="small muted">Час закрыт для записи</span>
              </div>
              <button type="button" class="btn ghost sm" data-a="bb-demo-toast">Открыть час</button>
            </div>
          </div>
        </div>

        <div class="card pad stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>04 · «Ученики ищут» &amp; Карточка «Учёба» (Пробный 0 ₽)</b>
            <span class="bb-spec-pill confirm">Двусторонний поток</span>
          </div>
          <article class="tc-req-card is-pending" style="padding:12px">
            <div class="row between" style="gap:6px;flex-wrap:wrap">
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <b>Милена Прокопьева</b>
                <span class="chip">ЕГЭ · Онлайн</span>
                <span class="chip accent">Биология</span>
                <span class="chip accent">Химия</span>
              </div>
              <span class="chip gold">Лид ученика</span>
            </div>
            <div class="tc-req-quote">Нужна системная подготовка к медуниверситету по биологии и органической химии, старт с мая.</div>
            <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
              <span class="small muted">Бюджет: <b class="num" style="color:var(--ink)">1 100 ₽/ч</b> (на руки 95% · <b class="num savings-gold-txt">1 045 ₽</b>)</span>
              <button type="button" class="btn sm" data-a="bb-demo-toast">Предложить урок</button>
            </div>
          </article>

          <div class="card soft pad stack" style="gap:8px;box-shadow:none">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <div>
                <div class="small muted">Вкладка «Учёба» · записанный репетитор</div>
                <b>Анна Соколова · Сб 10:00 · Биология</b>
              </div>
              <span class="chip confirm">✓ Подтверждён</span>
            </div>
            <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
              <span class="small muted">Доступ к пробному 0 ₽ привязан к старту 5 000 ₽</span>
              <button type="button" class="btn ${bb.balFunded !== false ? "gold" : "soft"} sm" data-a="${bb.balFunded !== false ? "bb-demo-toast" : "bb-bal-toggle"}">
                ${bb.balFunded !== false ? "Пробный урок 0 ₽" : "Нужен старт 5 000 ₽ →"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="bb-forms-grid" style="margin-top:14px">
        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>05 · Выплаты 95%, график с палочками (.tc-bar-chart) и Профиль</b>
            <span class="bb-spec-pill num">34 200 ₽/мес</span>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            ${[
              ["sticks", "Палочки"],
              ["lollipop", "Леденцы"],
              ["capsule", "Капсулы"],
              ["dual", "Парные"],
              ["range", "Диапазон"],
              ["combo", "Тренд"]
            ].map(([vid, lbl]) => `<button type="button" class="chip-btn${cStyle === vid ? " on" : ""}" data-a="bb-chart-style" data-v="${vid}">${lbl}</button>`).join("")}
          </div>
          ${renderStick(cStyle, stickBars, cIdx, true, "Интерактивный график выплат по дням недели")}
          <div class="row between small muted" style="gap:8px;flex-wrap:wrap;padding:6px 10px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line)">
            <span>${activeBar.detail}</span>
            <span class="num" style="color:var(--ink)">кликни столбик</span>
          </div>
          <div class="stack" style="gap:4px">
            <div class="row between small"><span>Заполненность профиля (<code>.tc-hh-meter</code>)</span><b class="num savings-gold-txt">100%</b></div>
            <div class="tc-hh-meter"><i style="width:100%"></i></div>
          </div>
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>06 · Карточка ученика (.tc-student-card) и Авто (WA · TG · MAX)</b>
            <span class="bb-spec-pill confirm">.tc-score-track</span>
          </div>
          <article class="tc-student-card">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <div class="row" style="gap:10px">
                <span class="tutor-avatar" aria-hidden="true">АЕ</span>
                <div class="stack" style="gap:2px">
                  <b>Алёна Егорова</b>
                  <span class="small muted">ЕГЭ Биология · 8 уроков · <span class="num">+7 (914) 210-05-11</span> · @alina_bio</span>
                </div>
              </div>
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <span class="chip confirm num">+26 б.</span>
                <span class="chip gold">Авто: WA · TG · MAX · За 24 ч</span>
              </div>
            </div>
            <div class="stack" style="gap:4px">
              <div class="row between small"><span>Прогноз ЕГЭ по пробникам</span><b class="num">58 → 84 / 100</b></div>
              <div class="tc-score-track"><div class="tc-score-fill" style="width:84%"></div></div>
            </div>
          </article>
          <div class="tc-wa-cfg">
            <div class="row between" style="gap:6px;flex-wrap:wrap">
              <b class="small">Автоуведомление в WA, Telegram и MAX (.tc-wa-cfg)</b>
              <span class="small muted">Воскресенье · 10:00</span>
            </div>
            <div class="auto-ch-bar" role="group" aria-label="Каналы автоуведомления">
              <button type="button" class="auto-ch-pill is-on" data-ch="wa" data-a="bb-demo-toast">✓ WhatsApp</button>
              <button type="button" class="auto-ch-pill is-on" data-ch="tg" data-a="bb-demo-toast">✓ Telegram</button>
              <button type="button" class="auto-ch-pill is-on" data-ch="max" data-a="bb-demo-toast">✓ MAX</button>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn confirm sm" data-a="bb-demo-toast">${icon("msg")}<span>Напомнить: скоро урок</span></button>
              <button type="button" class="btn gold sm" data-a="bb-demo-toast">${icon("bell")}<span>✓ Авто: WA · TG · MAX</span></button>
              ${messengerLinksHTML
                ? messengerLinksHTML({
                    entity: { id: "st-alena", name: "Алёна Егорова", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio", maxHandle: "alena_ege" },
                    message: "Здравствуйте, Алёна! Напоминаю об уроке биологии в воскресенье в 10:00.",
                    primaryLabel: "WhatsApp",
                    compact: true
                  })
                : ""}
            </div>
          </div>
        </div>
      </div>

      <div class="card pad stack" id="bb-charts" style="margin-top:14px;gap:14px">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">07 · Витрина графиков с палочками · 6 видов</div>
            <h3 class="h2">Варианты палочных графиков для выплат, спроса и динамики ЕГЭ</h3>
          </div>
          <div class="hh-seg" role="group" aria-label="Набор данных графиков">
            ${[
              ["income", "Доход 7 дн (₽)"],
              ["scores", "Пробники ЕГЭ"],
              ["slots", "Спрос 10–20 ч"]
            ].map(([did, dlbl]) => `<button type="button" data-a="bb-chart-data" data-v="${did}" aria-pressed="${cDataset === did}">${dlbl}</button>`).join("")}
          </div>
        </div>
        <div class="bb-charts-grid">
          ${BB_CHART_STYLES.map(([vid, shortLbl, title, desc]) => {
            const picked = cStyle === vid;
            return `<article class="bb-chart-card${picked ? " is-picked" : ""}">
              <div class="stack" style="gap:4px">
                <div class="row between" style="gap:6px">
                  <b class="small">${title}</b>
                  <span class="chip">${shortLbl}</span>
                </div>
                <p class="small muted">${desc}</p>
              </div>
              ${renderStick(vid, bars, Math.min(cIdx, Math.max(0, bars.length - 1)), false, title)}
              <button type="button" class="chip-btn${picked ? " on" : ""}" data-a="bb-chart-style" data-v="${vid}" style="justify-content:center">${picked ? "Применён в кабинете ✓" : "Выбрать этот вид"}</button>
            </article>`;
          }).join("")}
        </div>
      </div>

      <div class="bb-forms-grid" style="margin-top:14px">
        ${(() => {
          const phoneVal = String(bb.maskPhone != null ? bb.maskPhone : "+7 (914) 210-05-11");
          const tgRaw = String(bb.maskTg != null ? bb.maskTg : "@aytal_bio");
          const maxRaw = String(bb.maskMax != null ? bb.maskMax : "aytal_ege");
          const formattedPhone = typeof formatPhoneMask === "function" && phoneVal ? (formatPhoneMask(phoneVal) || phoneVal) : phoneVal;
          const formattedTg = typeof formatTelegramContact === "function" && tgRaw ? (formatTelegramContact(tgRaw) || tgRaw) : tgRaw;
          const entity = {
            id: "mask-demo",
            name: "Айтал Б.",
            whatsapp: formattedPhone || "+7 (914) 210-05-11",
            telegram: formattedTg || tgRaw || "@aytal_bio",
            maxHandle: maxRaw || "aytal_ege"
          };
          const msgText = "Здравствуйте! Проверяю живую маску контактов в Вектор ЕГЭ.";
          const urlsFn = resolveMessengerUrls || (EGE.kit && EGE.kit.resolveMessengerUrls);
          const urls = typeof urlsFn === "function"
            ? urlsFn(entity, msgText)
            : { whatsapp: "https://wa.me/79142100511", telegram: "https://t.me/aytal_bio", max: "https://max.ru/aytal_ege" };
          const maskSamples = [
            { label: "Якутск @login", phone: "+7 (914) 210-05-11", tg: "@aytal_bio", max: "aytal_ege" },
            { label: "Телефон в Telegram", phone: "+7 (914) 800-12-34", tg: "+7 (914) 800-12-34", max: "+7 (914) 800-12-34" },
            { label: "Москва +7 (926)...", phone: "+7 (926) 345-67-89", tg: "@alena_chem_msk", max: "alena_msk" }
          ];
          const linksFn = messengerLinksHTML || (EGE.kit && EGE.kit.messengerLinksHTML);
          return `<div class="card pad stack" id="bb-mask-trainer" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>08 · Мои ученики: живой тренажёр масок +7 / @login</b>
            <span class="bb-spec-pill confirm">WA · TG · MAX</span>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Быстрые примеры контактов">
            ${maskSamples.map((s) => {
              const activeSample = phoneVal === s.phone && tgRaw === s.tg && maxRaw === s.max;
              return `<button type="button" class="chip-btn${activeSample ? " on" : ""}" data-a="bb-mask-sample" data-phone="${esc(s.phone)}" data-tg="${esc(s.tg)}" data-max="${esc(s.max)}">${esc(s.label)}</button>`;
            }).join("")}
          </div>
          <div class="tc-contact-grid">
            <div class="field">
              <label for="bb-mask-phone">WhatsApp / телефон (+7)</label>
              <input class="input num" id="bb-mask-phone" data-a="bb-mask-input" type="tel" value="${esc(phoneVal)}" placeholder="+7 (914) 210-05-11" autocomplete="off">
            </div>
            <div class="field">
              <label for="bb-mask-lead">За 1 ч до урока</label>
              <input class="input num" id="bb-mask-lead" type="text" value="Вс · 10:00" readonly>
            </div>
            <div class="field">
              <label for="bb-mask-tg">Telegram (@login или телефон)</label>
              <input class="input" id="bb-mask-tg" data-a="bb-mask-input" type="text" value="${esc(tgRaw)}" placeholder="@aytal_bio или +7..." autocomplete="off">
            </div>
            <div class="field">
              <label for="bb-mask-max">MAX контакт (@handle / тел.)</label>
              <input class="input" id="bb-mask-max" data-a="bb-mask-input" type="text" value="${esc(maxRaw)}" placeholder="aytal_ege" autocomplete="off">
            </div>
          </div>
          <div class="bb-mask-urls" id="bb-mask-urls">
            <div class="bb-mask-url-row"><span class="small muted">WhatsApp</span><code>${esc(urls.whatsapp.split("?")[0])}</code></div>
            <div class="bb-mask-url-row"><span class="small muted">Telegram</span><code>${esc(urls.telegram.split("?")[0])}</code></div>
            <div class="bb-mask-url-row"><span class="small muted">MAX</span><code>${esc(urls.max.split("?")[0])}</code></div>
          </div>
          <div id="bb-mask-links">
            ${typeof linksFn === "function" ? linksFn({ entity, message: msgText, compact: true }) : ""}
          </div>
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="small muted">Живой расчёт через <code>EGE.kit.resolveMessengerUrls()</code> и <code>messengerLinksHTML()</code>.</span>
            <button type="button" class="btn confirm sm" data-a="bb-demo-toast">${icon("bell")}<span>Автонапоминание в 09:00</span></button>
          </div>
        </div>`;
        })()}

        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>09 · Шкала ИИ-проверки сочинения ЕГЭ (К1–К10 · 21/22 б.)</b>
            <span class="bb-spec-pill pro">.diff-tag.pro</span>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <span class="chip confirm num">К1 Формулировка · 1/1</span>
            <span class="chip confirm num">К2 Комментарий · 3/3</span>
            <span class="chip confirm num">К3 Позиция · 1/1</span>
            <span class="chip accent num">К4 Аргумент · 1/1</span>
            <span class="chip notif num">К5 Логика · 1/2</span>
            <span class="chip pro num">К6–К10 Грамотность · 14/14</span>
          </div>
          <div class="stack" style="gap:4px">
            <div class="row between small"><span>Итоговый первичный балл за сочинение (ИИ-разбор)</span><b class="num" style="color:var(--confirm)">21 / 22 б.</b></div>
            <div class="meter"><i style="width:95%"></i></div>
          </div>
          <span class="small muted">Цветовое кодирование: зелёный <code>--confirm</code> (максимум), оранжевый <code>--notif</code> (есть помарка), фиолетовый <code>--pro</code> (высший блок).</span>
        </div>
      </div>
    </section>`;
  }

  function dataVizSectionHTML(bb) {
    const ch = chartsAPI();
    const renderTable = ch.dataTableHTML || dataTableHTML;
    const buildStressCols = typeof ch.buildStressColumns === "function" ? ch.buildStressColumns : null;
    const renderMultiLine = typeof ch.multiLineChartHTML === "function" ? ch.multiLineChartHTML : null;
    const buildMultiSeries = typeof ch.buildMultiSeriesDemo === "function" ? ch.buildMultiSeriesDemo : null;
    const renderLine = ch.lineChartHTML || lineChartHTML;
    const renderDonut = ch.donutChartHTML || donutChartHTML;

    const cDataset = bb.chartDataset || "income";
    const dDataset = bb.donutDataset || "channels";
    const chartLines = Math.max(1, Math.min(20, Math.round(Number(bb.chartLines) || 1)));
    const chartPoints = Math.max(5, Math.min(36, Math.round(Number(bb.chartPoints) || 7)));
    const lineIdx = Number.isInteger(bb.linePtIdx)
      ? Math.max(0, Math.min(Math.max(6, chartPoints - 1), bb.linePtIdx))
      : Math.min(3, chartPoints - 1);
    const donutIdx = Number.isInteger(bb.donutSliceIdx) ? Math.max(0, Math.min(3, bb.donutSliceIdx)) : 0;
    const tblCols = Math.max(1, Math.min(15, Math.round(Number(bb.tableCols) || 5)));
    const tblPreset = bb.tablePreset || "requests";
    const tblFilter = bb.tableFilter || "all";
    const tblQuery = bb.tableSearch || "";
    const bars = chartDatasetBars(cDataset);
    const stressColumns = (tblCols > 7 || tblCols === 1) && buildStressCols
      ? buildStressCols(tblCols, tblPreset)
      : undefined;
    const lineChartMarkup = (renderMultiLine && (chartLines > 1 || chartPoints > 7))
      ? renderMultiLine({
          linesCount: chartLines,
          pointsCount: chartPoints,
          dataset: cDataset,
          activeIdx: lineIdx,
          action: "bb-line-pt",
          gradId: "bbLineGradMain",
          series: buildMultiSeries ? buildMultiSeries(chartLines, chartPoints, cDataset) : undefined
        })
      : (renderLine ? renderLine({ dataset: cDataset, bars, activeIdx: lineIdx, gradId: "bbLineGradMain" }) : "");

    return `<section class="land-sec" id="bb-data-viz" aria-label="Линейные графики, круговая диаграмма и таблица данных">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">08 · Линейные графики (до 20 линий × 30+ точек), Круговая диаграмма и Таблица 1–15 колонок</div>
          <h2 class="h2">Аналитика динамики (до 20 линий), распределения и интерактивная таблица (1–15 колонок)</h2>
        </div>
        <button type="button" class="bb-spec-pill" data-a="bb-copy-token" data-copy="EGE.charts.multiLineChartHTML() / donutChartHTML() / dataTableHTML()">Копировать EGE.charts DataViz</button>
      </div>

      <div class="bb-viz-grid">
        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b>01 · График с линией и областью (.bb-line-chart)</b>
            <div class="hh-seg" role="group" aria-label="Данные линейного графика">
              ${[
                ["income", "Доход ₽"],
                ["scores", "Баллы ЕГЭ"],
                ["slots", "Спрос"]
              ].map(([did, dlbl]) => `<button type="button" data-a="bb-chart-data" data-v="${did}" aria-pressed="${cDataset === did}">${dlbl}</button>`).join("")}
            </div>
          </div>
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <div class="row" style="gap:4px;flex-wrap:wrap;align-items:center" role="group" aria-label="Число линий на графике">
              <span class="small muted">Линии:</span>
              ${[
                [1, "1 линия"],
                [3, "3 линии"],
                [8, "8 линий"],
                [12, "12 линий"],
                [20, "20 линий"]
              ].map(([cnt, lbl]) => `<button type="button" class="chip-btn${chartLines === cnt ? " on" : ""}" data-a="bb-chart-lines" data-v="${cnt}" data-lines="${cnt}" aria-pressed="${chartLines === cnt}">${lbl}</button>`).join("")}
            </div>
            <div class="row" style="gap:4px;flex-wrap:wrap;align-items:center" role="group" aria-label="Число точек (спусков и заходов)">
              <span class="small muted">Точки:</span>
              ${[
                [7, "7 точек"],
                [18, "18 точек"],
                [30, "30 точек"]
              ].map(([pts, lbl]) => `<button type="button" class="chip-btn${chartPoints === pts ? " on" : ""}" data-a="bb-chart-pts" data-v="${pts}" data-pts="${pts}" aria-pressed="${chartPoints === pts}">${lbl}</button>`).join("")}
            </div>
          </div>
          ${lineChartMarkup}
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b>02 · Кольцевая / Круговая диаграмма (.bb-donut-chart)</b>
            <div class="hh-seg" role="group" aria-label="Срез круговой диаграммы">
              ${[
                ["channels", "Каналы"],
                ["subjects", "Предметы"],
                ["sources", "Форматы"]
              ].map(([did, dlbl]) => `<button type="button" data-a="bb-donut-ds" data-v="${did}" aria-pressed="${dDataset === did}">${dlbl}</button>`).join("")}
            </div>
          </div>
          ${renderDonut ? renderDonut({ dataset: dDataset, activeIdx: donutIdx }) : ""}
        </div>
      </div>

      <div class="stack" style="margin-top:14px;gap:8px">
        <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
          <span class="small muted">Стресс-тест адаптивности таблиц (<code>1..15</code> колонок, авто-скролл и липкая 1-я колонка):</span>
          <div class="hh-seg" role="group" aria-label="Переключатель числа колонок от 1 до 15">
            ${[1, 3, 5, 7, 10, 12, 15].map((cnt) => `<button type="button" data-a="bb-tbl-cols" data-cols="${cnt}" aria-pressed="${tblCols === cnt}">${colsWordRu(cnt)}</button>`).join("")}
          </div>
        </div>
        ${renderTable ? renderTable({
          preset: tblPreset,
          cols: tblCols,
          columns: stressColumns,
          colsOptions: [1, 3, 5, 7, 10, 12, 15],
          showColsSwitch: true,
          showPresetSwitch: true,
          filter: tblFilter,
          query: tblQuery,
          confirmedIds: bb.confirmedRows || {}
        }) : ""}
      </div>
    </section>`;
  }

  /* 3 новых раздела брендбука: Эквайринг/выплаты, Таймеры ЕГЭ-2027 + ИИ-сочинение, Фокус/A11y. */
  function paymentsSectionHTML(bb) {
    const payMethod = bb.payMethod || "sbp";
    const payState = bb.payState || "frozen";
    const initialDone = !!bb.payInitialDone;
    const minTopup = initialDone ? 100 : 990;
    const topupSample = initialDone ? 1200 : 4590;
    const lessonAmount = 1200;
    const tutorNet = Math.round(lessonAmount * 0.95);
    const serviceFee = lessonAmount - tutorNet;

    const stateMeta = {
      frozen: {
        cls: "is-pending",
        badge: "Удержано на эскроу · 1 200 ₽",
        desc: "Оплата по СБП заморожена на балансе ученика до завершения часового окна (шлюз WA/TG/MAX открыт после брони). При переносе или отмене ≥ 4 ч — возврат 100%."
      },
      captured: {
        cls: "is-confirmed",
        badge: "Проведено · 95% / 5%",
        desc: "Урок подтверждён: базовый расчёт 95% / 5% (1 140 ₽ база выплаты и 60 ₽ сервис платформы) + 1% шлюз СБП-сплита при выводе с авточеком НПД без карточных 3,42%."
      },
      refunded: {
        cls: "is-refund",
        badge: "Отмена ≥ 4 ч · Возврат 100%",
        desc: "Ученик отменил занятие заранее или воспользовался гарантией замены пробного 990 ₽ — сумма мгновенно возвращается на баланс без комиссий."
      }
    }[payState] || {
      cls: "is-pending",
      badge: "Удержано на эскроу · 1 200 ₽",
      desc: "Средства заблокированы на СБП-эскроу до завершения занятия."
    };

    const methodLabels = [
      ["sbp", "СБП QR / АЭБ · Сбер · Т-Банк (основной)"],
      ["tpay", "СБП-кнопка SberPay / T-Pay"],
      ["card", "Выплаты СБП / Мир (НПД)"]
    ];

    return `<section class="land-sec" id="bb-payments" aria-label="Экраны эквайринга, статусов оплаты и выплат преподавателям">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">09 · Эквайринг СБП-only · Эскроу · Выплаты (EGE.payments)</div>
          <h2 class="h2">СБП-пополнение от 990 ₽, статусы удержания 95% / 5% и вывод с авточеком НПД</h2>
        </div>
        <button type="button" class="bb-spec-pill" data-a="bb-copy-token" data-copy="EGE.payments.createTopupIntent">Копировать EGE.payments</button>
      </div>

      <div class="bb-pay-grid">
        <div class="card pad stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>01 · Пополнение баланса по СБП и статусы эскроу</b>
            <span class="bb-spec-pill">${initialDone ? "Повторное от 100 ₽" : "Старт СБП от 990 ₽"}</span>
          </div>

          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="small muted">Порог пополнения:</span>
            <div class="hh-seg" role="group" aria-label="Режим порога пополнения">
              <button type="button" data-a="bb-pay-threshold" data-v="initial" aria-pressed="${!initialDone}">Первый платёж СБП ≥ 990 ₽</button>
              <button type="button" data-a="bb-pay-threshold" data-v="repeat" aria-pressed="${initialDone}">Повторный ≥ 100 ₽</button>
            </div>
          </div>

          <div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Способ оплаты">
            ${methodLabels.map(([mid, mlbl]) => `<button type="button" class="chip-btn${payMethod === mid ? " on" : ""}" data-a="bb-pay-method" data-v="${mid}">${esc(mlbl)}</button>`).join("")}
          </div>

          <div class="bb-pay-state-box">
            <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
              <span class="bb-tbl-st ${stateMeta.cls}">${esc(stateMeta.badge)}</span>
              <div class="row" style="gap:5px;flex-wrap:wrap" role="group" aria-label="Состояние эскроу">
                <button type="button" class="chip-btn${payState === "frozen" ? " on" : ""}" data-a="bb-pay-state" data-v="frozen">Frozen</button>
                <button type="button" class="chip-btn${payState === "captured" ? " on" : ""}" data-a="bb-pay-state" data-v="captured">Captured (95% / 5%)</button>
                <button type="button" class="chip-btn${payState === "refunded" ? " on" : ""}" data-a="bb-pay-state" data-v="refunded">Refunded (100%)</button>
              </div>
            </div>
            <p class="small muted">${esc(stateMeta.desc)}</p>
          </div>

          <div class="bb-pay-split">
            <div class="bb-pay-split-cell">
              <span class="small muted">Ставка урока</span>
              <b class="num">${lessonAmount.toLocaleString("ru-RU")} ₽</b>
            </div>
            <div class="bb-pay-split-cell">
              <span class="small muted">На руки репетитору (95%)</span>
              <b class="num" style="color:var(--confirm)">${tutorNet.toLocaleString("ru-RU")} ₽</b>
            </div>
            <div class="bb-pay-split-cell">
              <span class="small muted">Сервис 5% + СБП 1%</span>
              <b class="num">${serviceFee.toLocaleString("ru-RU")} ₽ + ${Math.round(lessonAmount * 0.01)} ₽</b>
            </div>
          </div>

          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <code class="small">EGE.payments.createTopupIntent({ amount: ${topupSample}, min: ${minTopup}, method: "${esc(payMethod)}" })</code>
            <span class="bb-spec-pill confirm">5% сервис + 1% СБП · 8% группы</span>
          </div>
        </div>

        <div class="card pad stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>02 · Выплаты преподавателю, чек НПД и закрепление баланса</b>
            <span class="bb-spec-pill confirm">Мин. вывод 500 ₽</span>
          </div>
          <p class="small muted">Вывод средств на ${payMethod === "card" ? "Карту Мир" : "СБП"} от 500 ₽ без дополнительной комиссии — сервисный сбор 5% учитывается на этапе расчёта урока, а чек НПД формируется автоматически.</p>

          <div class="bb-pay-dock-preview">
            <div class="bb-pay-dock-card">
              <span class="small muted">Desktop · Справа снизу (#tutor-balance-dock)</span>
              ${tutorBalanceDockHTML
                ? tutorBalanceDockHTML({ availableRub: 11400, escrowRub: 1140, action: "bb-demo-toast", inlinePreview: true })
                : ""}
              <span class="small muted">Чек НПД · ${payMethod === "card" ? "Карта Мир ••4812" : "СБП +7 (914) 210-05-11"}</span>
            </div>

            <div class="bb-pay-dock-card">
              <span class="small muted">Mobile · Справа в топбаре (#top-balance-slot)</span>
              ${topBalanceWidgetHTML
                ? topBalanceWidgetHTML({ role: "tutor", amountRub: 11400, pillAction: "bb-demo-toast", btnAction: "bb-demo-toast" })
                : ""}
              <span class="small muted">Единый компонент <code>EGE.kit.topBalanceWidgetHTML</code> · кнопка «Вывести»</span>
            </div>
          </div>

          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <code class="small">EGE.payments.createPayoutIntent({ channel: "${payMethod === "card" ? "card" : "sbp"}", min: 500, receipt: "npd" })</code>
            <span class="bb-spec-pill pro">95% / 5% · НПД</span>
          </div>
        </div>
      </div>
    </section>`;
  }

  function uiKitShellsSectionHTML(bb) {
    const role = bb.shellRole === "student" ? "student" : "tutor";
    const isTutor = role === "tutor";
    const topBalHtml = topBalanceWidgetHTML
      ? topBalanceWidgetHTML({
          role,
          amountRub: isTutor ? 11400 : 5000,
          pillAction: "bb-demo-toast",
          btnAction: "bb-demo-toast"
        })
      : "";
    const dockHtml = tutorBalanceDockHTML
      ? tutorBalanceDockHTML({
          availableRub: 11400,
          escrowRub: 1140,
          action: "bb-demo-toast",
          inlinePreview: true
        })
      : "";
    const walletHtml = walletSummaryBarHTML
      ? walletSummaryBarHTML(
          isTutor
            ? {
                extraClass: "tc-payout-wallet",
                label: "Доступно к выводу",
                amountRub: 11400,
                amountClass: "num",
                amountStyle: "font-size:22px;line-height:1.15;font-weight:700;color:var(--ink)",
                subNote: "95% после 5% комиссии сервиса · СБП / Мир",
                badge: { text: "В резерве: 1 140 ₽", cls: "confirm num" }
              }
            : {
                label: "Текущий баланс ученика",
                amountRub: 5000,
                inlineNote: "доступны пробный урок 0 ₽ и отклики",
                subNote: "Демо-режим · готово к подключению СБП / ЮKassa",
                actions: [
                  { label: "Пополнить баланс", action: "bb-demo-toast", icon: "wallet", cls: "btn soft sm" }
                ]
              }
        )
      : "";
    const toastHtml = sideToastInnerHTML
      ? sideToastInnerHTML({
          title: isTutor ? "Новая заявка · 1 100 ₽/ч" : "Предложение отправлено",
          message: isTutor ? "Айтал Н. выбрал субботу 14:00 (Биология · Онлайн)" : "Ожидаем подтверждения от репетитора — уведомим сразу",
          closeAction: "bb-demo-toast"
        })
      : "";
    const emptyHtml = emptyStateHTML
      ? emptyStateHTML({
          title: isTutor ? "Новых заявок пока нет" : "По фильтрам нет анкет",
          subtitle: isTutor ? "Откройте слоты 10:00–20:00 или поднимите анкету (раз в 4 ч)." : "Ослабьте ограничение ставки или сбросьте выбранный час.",
          actionLabel: isTutor ? "Открыть календарь" : "Сбросить фильтры",
          action: "bb-demo-toast",
          iconName: isTutor ? "cal" : "search"
        })
      : "";
    const skelHtml = skeletonCardHTML
      ? skeletonCardHTML({
          title: isTutor ? "Загрузка ленты заявок…" : "Подбор анкет по ставке…",
          badge: "1.6 s shimmer",
          footer: "Единый компонент EGE.kit.skeletonCardHTML() для всех вьюх."
        })
      : "";

    return `<section class="land-sec" id="bb-ui-kit-shells" aria-label="Единые Shell-виджеты сайта из EGE.kit">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Раздел 12 · Унификация Shell-виджетов · Single Source of Truth</div>
          <h2 class="h2">12 · Единые Shell-виджеты сайта из EGE.kit</h2>
        </div>
        <div class="hh-seg" role="group" aria-label="Роль для предпросмотра Shell-виджетов">
          <button type="button" data-a="bb-shell-role" data-role="student" aria-pressed="${!isTutor}">Ученик</button>
          <button type="button" data-a="bb-shell-role" data-role="tutor" aria-pressed="${isTutor}">Преподаватель</button>
        </div>
      </div>

      <div class="bb-shells-grid">
        <div class="card pad bb-shell-card">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>topBalanceWidgetHTML &amp; tutorBalanceDockHTML</b>
            <span class="bb-spec-pill">${isTutor ? "Режим: Преподаватель" : "Режим: Ученик"}</span>
          </div>
          <div class="bb-shell-stage">
            <span class="small muted">Топбар / Сайдбар (<code>EGE.kit.topBalanceWidgetHTML</code>)</span>
            ${topBalHtml}
          </div>
          <div class="bb-shell-stage">
            <span class="small muted">Desktop-док справа снизу (<code>EGE.kit.tutorBalanceDockHTML</code>)</span>
            ${dockHtml}
          </div>
        </div>

        <div class="card pad bb-shell-card">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>walletSummaryBarHTML &amp; sideToastInnerHTML</b>
            <span class="bb-spec-pill confirm">Shared across app.js / market / cabinet</span>
          </div>
          ${walletHtml}
          <div class="bb-shell-toast-box">
            ${toastHtml}
          </div>
        </div>

        ${emptyHtml}
        ${skelHtml}
      </div>

      <div class="card pad" style="margin-top:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <div>
            <b>realtimeStatusPillHTML · Индикатор Live-транспорта</b>
            <div class="small muted">Единый компонент для кабинета преподавателя и мониторинга SSE / WS / BroadcastChannel</div>
          </div>
          <span class="bb-spec-pill">EGE.kit.realtimeStatusPillHTML</span>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${realtimeStatusPillHTML ? realtimeStatusPillHTML({ mode: "sse", channelLabel: isTutor ? "tutor" : "student", unreadCount: 2, action: "bb-demo-toast" }) : ""}
          ${realtimeStatusPillHTML ? realtimeStatusPillHTML({ mode: "ws", channelLabel: "ws", action: "bb-demo-toast" }) : ""}
          ${realtimeStatusPillHTML ? realtimeStatusPillHTML({ mode: "connecting", channelLabel: "reconnect" }) : ""}
          ${realtimeStatusPillHTML ? realtimeStatusPillHTML({ mode: "local", channelLabel: "tabs", action: "bb-demo-toast" }) : ""}
        </div>
      </div>
    </section>`;
  }

  function telemetryEtlSectionHTML(bb) {
    const activeFilter = bb.pipeFilter || "all";
    const filterChips = [
      ["all", "Все стадии"],
      ["postgres", "PostgreSQL 17"],
      ["polars", "Polars M4 Pro"],
      ["airflow", "Airflow DAG"],
      ["kafka", "Kafka Clickstream"]
    ];
    const stages = [
      {
        engine: "postgres",
        title: "PostgreSQL 17 · OLTP + Outbox",
        stage: "OLTP / CDC",
        status: "ok",
        statusLabel: "Healthy",
        latencyMs: "4.2 ms",
        throughput: "1 850 rows/s",
        freshness: "< 1 s",
        target: "oltp.lesson_requests · outbox.kafka_outbox",
        notes: "Транзакционное ядро анкет, торгов ±100 ₽, эскроу 95%/5% и outbox-таблица."
      },
      {
        engine: "polars",
        title: "Polars M4 Pro · Medallion ETL",
        stage: "Bronze → Silver → Gold",
        status: "ok",
        statusLabel: "Batch OK",
        latencyMs: "38 ms",
        throughput: "120k rows/s",
        freshness: "5 min",
        target: "gold/subject_price_mart.parquet · silver.tutors_dedup",
        notes: "LazyFrame-дедупликация анкет Ykt/TG/WA/MAX и расчёт витрин GMV."
      },
      {
        engine: "airflow",
        title: "Airflow DAG · Orchestration",
        stage: "Hourly + Daily",
        status: "ok",
        statusLabel: "SLA 100%",
        latencyMs: "1.4 s",
        throughput: "6 tasks/dag",
        freshness: "15 min",
        target: "dag: vektor_medallion_hourly",
        notes: "Оркестрация проверок качества данных, пересчёта воронки и выгрузки витрин."
      },
      {
        engine: "kafka",
        title: "Kafka Clickstream · Event Bus",
        stage: "Streaming",
        status: "pending",
        statusLabel: "Backlog #7",
        latencyMs: "11 ms",
        throughput: "4.6k msg/s",
        freshness: "Realtime",
        target: "vektor.user.clickstream.v1 · vektor.market.bids.v1",
        notes: "Стриминг пользовательских действий (/api/events/batch, sendBeacon) и ставок."
      },
      {
        engine: "grafana",
        title: "Grafana BI · Observability",
        stage: "Dashboards",
        status: "info",
        statusLabel: "Live Metrics",
        latencyMs: "28 ms",
        throughput: "24 panels",
        freshness: "10 s",
        target: "gold.daily_gmv_metrics · gold.clickstream_funnel",
        notes: "Мониторинг конверсии тарифов, времени отклика, SLA эскроу и бенчмарков движков."
      }
    ];
    const visibleStages = activeFilter === "all"
      ? stages
      : stages.filter((s) => s.engine === activeFilter);

    return `<section class="land-sec" id="bb-telemetry-etl" aria-label="Data & Observability UI Kit: Пайплайны ETL/ELT и Поток логов">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Раздел 13 · Data &amp; Observability UI Kit</div>
          <h2 class="h2">13 · Data &amp; Observability UI Kit: Пайплайны ETL/ELT и Поток логов</h2>
        </div>
        <div class="chip-rail" role="group" aria-label="Фильтр стадий ETL/ELT">
          ${filterChips.map(([fid, flbl]) => `<button type="button" class="chip-btn${activeFilter === fid ? " on" : ""}" data-a="bb-pipe-filter" data-v="${fid}">${esc(flbl)}</button>`).join("")}
        </div>
      </div>

      <div class="bb-pipe-grid">
        ${pipelineStageCardHTML ? visibleStages.map((st) => pipelineStageCardHTML(st)).join("") : ""}
      </div>

      ${eventLogFeedHTML ? eventLogFeedHTML({ filterEngine: activeFilter, maxItems: 6 }) : ""}
    </section>`;
  }

  function adminKitSectionHTML(bb) {
    const ch = chartsAPI();
    const renderTable = ch.dataTableHTML || dataTableHTML;
    const buildStressCols = typeof ch.buildStressColumns === "function" ? ch.buildStressColumns : null;
    const adminTab = ["moderation", "payouts", "system"].includes(bb.adminTab) ? bb.adminTab : "moderation";
    const adminRole = ["student", "tutor", "admin"].includes(bb.adminRole) ? bb.adminRole : "admin";
    const tblCols = Math.max(1, Math.min(15, Math.round(Number(bb.tableCols) || 5)));
    const tblQuery = bb.tableSearch || "";
    const presets = ch.TABLE_PRESETS || {};
    const adminPreset = presets.admin || {};
    const allAdminRows = Array.isArray(adminPreset.rows) ? adminPreset.rows : [];
    const tabRows = allAdminRows.filter((r) => !r.category || r.category === adminTab);
    const adminCols = (tblCols > 7 || tblCols === 1) && buildStressCols
      ? buildStressCols(tblCols, "admin")
      : (typeof adminPreset.getColumns === "function" ? adminPreset.getColumns(tblCols) : null);

    const kpiItems = [
      { label: "Оборот (GMV 30 дн)", value: "184 500 ₽", delta: "+18%", tone: "accent", note: "Подтверждённые уроки 95% / 5%", action: "bb-admin-tab", actionVal: "payouts" },
      { label: "На проверке анкет", value: "4", delta: "SLA 15 мин", tone: "notif", note: "Ожидают модерации и диплома", action: "bb-admin-tab", actionVal: "moderation" },
      { label: "Выплаты НПД (95%)", value: "175 275 ₽", delta: "СБП / Мир", tone: "confirm", note: "Авточеки НПД сформированы", action: "bb-admin-tab", actionVal: "payouts" },
      { label: "Outbox → Kafka", value: "0", delta: "100% synced", tone: "pro", note: "outbox.kafka_outbox · 0.8 ms", action: "bb-admin-tab", actionVal: "system" }
    ];

    const badgeList = ["verified", "pending", "flagged", "paid", "frozen", "published", "declined"];
    const tabMeta = {
      moderation: { label: "Модерация анкет", sub: "Верификация дипломов, жалобы и ручное подтверждение" },
      payouts: { label: "Выплаты НПД и эскроу", sub: "Замороженные резервы и выводы на СБП / Карту Мир" },
      system: { label: "Система и Outbox", sub: "События транзакционного аутбокса в Kafka" }
    };

    return `<section class="land-sec" id="bb-admin-kit" aria-label="Админ-панель и модерация (Admin UI Kit)">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Раздел 14 · Admin UI Kit · Модерация, НПД и Outbox</div>
          <h2 class="h2">14 · Админ-панель и модерация (Admin UI Kit)</h2>
        </div>
        <div class="hh-seg" role="group" aria-label="Раздел админ-панели">
          ${[
            ["moderation", "Модерация"],
            ["payouts", "Выплаты НПД"],
            ["system", "Outbox / Система"]
          ].map(([tid, tlbl]) => `<button type="button" data-a="bb-admin-tab" data-v="${tid}" aria-pressed="${adminTab === tid}">${esc(tlbl)}</button>`).join("")}
        </div>
      </div>

      <div class="stack" style="gap:12px">
        ${roleSwitchBannerHTML ? roleSwitchBannerHTML({
          activeRole: adminRole,
          action: "bb-role-switch",
          counts: { student: 3, tutor: 12, admin: 6 }
        }) : ""}

        ${adminKpiGridHTML ? adminKpiGridHTML(kpiItems) : ""}

        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b>Статусы верификации и платежей (EGE.kit.adminModerationBadgeHTML)</b>
            <span class="bb-spec-pill">7 токенизированных состояний</span>
          </div>
          <div class="bb-adm-badges-row">
            ${adminModerationBadgeHTML ? badgeList.map((st) => adminModerationBadgeHTML(st)).join("") : ""}
          </div>
        </div>

        <div class="card pad stack" style="gap:12px">
          ${renderTable ? renderTable({
            preset: "admin",
            eyebrow: "Реестр · " + (tabMeta[adminTab] ? tabMeta[adminTab].label : "Админ"),
            title: tabMeta[adminTab] ? tabMeta[adminTab].sub : "Управление платформой",
            rows: tabRows,
            columns: adminCols || undefined,
            cols: tblCols,
            colsOptions: [1, 3, 5, 7, 10, 12, 15],
            showColsSwitch: true,
            query: tblQuery,
            confirmedIds: bb.confirmedRows || {},
            cardWrap: false,
            showPresetSwitch: false,
            searchId: "bb-admin-tbl-q",
            toolbarExtraHTML: `<span class="bb-spec-pill num">${tabRows.length} записей</span>`
          }) : ""}
        </div>
      </div>
    </section>`;
  }

  function archSplitSectionHTML(bb) {
    const ch = chartsAPI();
    const renderTable = ch.dataTableHTML || dataTableHTML;
    const buildStressCols = typeof ch.buildStressColumns === "function" ? ch.buildStressColumns : null;
    const dualRole = bb.dualRole === "tutor" ? "tutor" : "student";
    const dualPreset = dualRole === "tutor" ? "students" : "requests";
    const tblCols = Math.max(1, Math.min(15, Math.round(Number(bb.tableCols) || 5)));
    const dualCols = (tblCols > 7 || tblCols === 1) && buildStressCols
      ? buildStressCols(tblCols, dualPreset)
      : undefined;
    const tblQuery = bb.tableSearch || "";

    const layers = [
      {
        name: "@vektor-ege/ui-kit",
        layer: "UI-Kit",
        port: "8772",
        status: "stateless",
        repo: "vektor-ui-kit",
        summary: "Независимая дизайн-система и Brandbook: ноль запросов к API, ноль бизнес-данных, чистые HTML/CSS компоненты.",
        endpoints: ["EGE.ui / EGE.hh / EGE.charts", "EGE.kit / EGE.views.brandbook", "GET / (127.0.0.1:8772)"],
        note: "Публикуется как отдельный пакет и стенд."
      },
      {
        name: "EGE\u002eapi + vektor-api",
        layer: "Headless API",
        port: "8771",
        status: "live",
        repo: "vektor-api",
        summary: "Чистый JSON / SSE / WS сервер без HTML и статики: авторизация, календарь, админ-модерация и аутбокс.",
        endpoints: ["GET /api/admin/overview", "GET /api/health/storage", "SSE /api/realtime/stream"],
        note: "CORS открыт для :8770 и :8772."
      },
      {
        name: "Preparation · SPA Shell",
        layer: "SPA Shell",
        port: "8770",
        status: "live",
        repo: "Preparation",
        summary: "Собирает UI-Kit + клиентский слой EGE\u002eapi для Ученика, Преподавателя и Администратора.",
        endpoints: ["/landing · /market · /study", "/cabinet · /fees · /admin", "/brandbook"],
        note: "Единый табличный движок dataTableHTML."
      },
      {
        name: "Data & Analytics Mesh",
        layer: "PostgreSQL",
        port: "5432",
        status: "healthy",
        repo: "vektor-postgres · polars · airflow · grafana",
        summary: "Dual-Write PostgreSQL 17 + outbox.kafka_outbox → Polars Medallion ETL → Airflow DAG → Grafana BI.",
        endpoints: ["oltp.* + outbox.kafka_outbox", "Polars gold/*.parquet", "Airflow :8085 · Grafana :3000"],
        note: "Сквозная наблюдаемость и расчёты 95% / 5%."
      }
    ];

    return `<section class="land-sec" id="bb-arch-split" aria-label="Разделение UI Kit и API + Таблицы обеих ролей">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Раздел 15 · Clean Architecture · Decoupled UI-Kit &amp; Headless API</div>
          <h2 class="h2">15 · Разделение UI Kit и API + Таблицы обеих ролей</h2>
        </div>
        <div class="hh-seg" role="group" aria-label="Вид таблиц со стороны роли">
          <button type="button" data-a="bb-dual-role" data-v="student" aria-pressed="${dualRole === "student"}">Со стороны ученика</button>
          <button type="button" data-a="bb-dual-role" data-v="tutor" aria-pressed="${dualRole === "tutor"}">Со стороны преподавателя</button>
        </div>
      </div>

      <div class="bb-arch-grid">
        ${serviceBoundaryCardHTML ? layers.map((l) => serviceBoundaryCardHTML(l)).join("") : ""}
      </div>

      <div class="card pad stack" style="margin-top:12px;gap:12px">
        <div class="bb-dual-role-head">
          <div class="stack" style="gap:2px">
            <b>${dualRole === "tutor" ? "Перспектива преподавателя · Мои ученики и автоуведомления" : "Перспектива ученика · Отправленные заявки и ставки ±100 ₽"}</b>
            <span class="small muted">${dualRole === "tutor" ? "Тот же schema-driven компонент EGE.charts.dataTableHTML в кабинете преподавателя" : "Единая таблица EGE.charts.dataTableHTML в кабинете ученика (/market и /study)"}</span>
          </div>
          <span class="bb-spec-pill">${dualRole === "tutor" ? "preset: students" : "preset: requests"}</span>
        </div>
        ${renderTable ? renderTable({
          preset: dualPreset,
          cols: tblCols,
          columns: dualCols,
          colsOptions: [1, 3, 5, 7, 10, 12, 15],
          showColsSwitch: true,
          filter: "all",
          query: tblQuery,
          confirmedIds: bb.confirmedRows || {},
          cardWrap: false,
          showPresetSwitch: false,
          searchId: "bb-dual-tbl-q"
        }) : ""}
      </div>
    </section>`;
  }

  function egeTimersSectionHTML(bb) {
    const fallbackExams = [
      { subject: "chem", name: "Химия", date: "2027-06-01" },
      { subject: "rus", name: "Русский язык", date: "2027-06-04" },
      { subject: "bio", name: "Биология", date: "2027-06-15" }
    ];
    const examsSource = (root.EGE && Array.isArray(root.EGE.exams) && root.EGE.exams.length)
      ? root.EGE.exams
      : fallbackExams;

    const dateRu = {
      "2027-06-01": "1 июня 2027",
      "2027-06-04": "4 июня 2027",
      "2027-06-15": "15 июня 2027"
    };
    const colorMap = { chem: "var(--c-chem)", rus: "var(--c-rus)", bio: "var(--c-bio)" };
    const focusNote = {
      chem: "Расчётные задачи 34 и ОВР блок",
      rus: "Сочинение Задание 27 + орфоэпия",
      bio: "Линии 27–28 · генетика и биосинтез"
    };

    const daysUntil = (iso) => {
      const ts = Date.parse(String(iso || "") + "T09:00:00+09:00");
      if (!Number.isFinite(ts)) return 198;
      return Math.max(0, Math.ceil((ts - Date.now()) / 86400000));
    };

    const essayIdx = Number.isInteger(bb.essayOpenIdx) ? Math.max(0, Math.min(2, bb.essayOpenIdx)) : 0;
    const essayTabs = [
      {
        label: "Фрагмент текста и позиция",
        title: "Разбор сочинения ЕГЭ (Задание 27 · 21 / 22 б.)",
        text: "«Истинное уважение к языку и природе Якутии начинается с ответственности перед памятью поколений: потеряв родное слово или хрупкую реку, человек теряет опору собственной культуры».",
        note: "ИИ-рецензия: проблема сформулирована точно в первом абзаце, два примера-иллюстрации из текста связаны смысловой причинно-следственной связкой."
      },
      {
        label: "Критерии К1–К10",
        title: "Матрица баллов по критериям ФИПИ (21 / 22 б.)",
        text: "Сильные стороны: речевая точность и чистая пунктуация (К6–К10 без потерь). Единственная точка роста до максимума 22/22 — уточнение логического перехода в 4-м абзаце.",
        note: "Подсказка для ученика: добавь вводный мостик «Однако только знания фактов недостаточно...» перед выводом."
      },
      {
        label: "Сравнение и шаг +1 балл",
        title: "Доработка К5 и план на следующий пробник",
        text: "Сдвиг по времени написания: 38 мин на чистовик. Для 22 / 22 б. рекомендуется перечитать связку между позицией автора и собственным аргументом.",
        note: "Следующая проверка ИИ сохранит историю правок в /study и /stats."
      }
    ];
    const activeEssay = essayTabs[essayIdx] || essayTabs[0];

    const criteria = [
      ["К1 Формулировка", "1 / 1", "confirm"],
      ["К2 Комментарий", "3 / 3", "confirm"],
      ["К3 Позиция автора", "1 / 1", "confirm"],
      ["К4 Своя позиция", "1 / 1", "confirm"],
      ["К5 Логика и связность", "1 / 2", "notif"],
      ["К6–К10 Грамотность и речь", "14 / 14", "pro"]
    ];

    return `<section class="land-sec" id="bb-ege-timers" aria-label="Таймеры ЕГЭ-2027 и ИИ-проверка сочинения">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">10 · ЕГЭ-2027 · Контрольные даты и Задание 27</div>
          <h2 class="h2">Обратный отсчёт до экзаменов 2027, чекпоинт 1 февраля и разбор ИИ-сочинения</h2>
        </div>
        <span class="bb-spec-pill pro">21 / 22 б. · К1–К10</span>
      </div>

      <div class="bb-timer-grid">
        ${examsSource.slice(0, 3).map((ex) => {
          const sid = ex.subject || ex.id || "bio";
          const dLeft = daysUntil(ex.date);
          return `<div class="bb-timer-card" style="--subj-color:${colorMap[sid] || "var(--accent)"}">
            <div class="row between" style="gap:8px">
              <b>${esc(ex.name || sid)}</b>
              <span class="bb-spec-pill num">${esc(dateRu[ex.date] || ex.date)}</span>
            </div>
            <div class="bb-timer-days num">${dLeft} дн.</div>
            <span class="small muted">${esc(focusNote[sid] || "План подготовки и пробники ФИПИ")}</span>
          </div>`;
        }).join("")}
      </div>

      <div class="card pad row between" style="margin-top:12px;gap:10px;flex-wrap:wrap;align-items:center">
        <div class="row" style="gap:10px;align-items:center;min-width:0">
          <span class="bb-tbl-st is-info">Контрольная точка</span>
          <b>Подача заявления на ЕГЭ до 1 февраля 2027</b>
          <span class="small muted">Проверьте паспорт, СНИЛС и учётную запись Госуслуг заранее.</span>
        </div>
        <span class="bb-spec-pill num">Дедлайн: 01.02.2027</span>
      </div>

      <div class="bb-essay-box" style="margin-top:12px">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">Задание 27 · Русский язык · ИИ-проверка</div>
            <h3 class="h3">${esc(activeEssay.title)}</h3>
          </div>
          <div class="hh-seg" role="group" aria-label="Вкладки разбора сочинения">
            ${essayTabs.map((t, idx) => `<button type="button" data-a="bb-essay-tab" data-idx="${idx}" data-v="${idx}" aria-pressed="${essayIdx === idx}">${esc(t.label)}</button>`).join("")}
          </div>
        </div>
        <div class="bb-essay-excerpt">${esc(activeEssay.text)}</div>
        <p class="small muted">${esc(activeEssay.note)}</p>
        <div class="bb-essay-criteria">
          ${criteria.map(([kName, kScore, kTone]) => `<div class="bb-essay-crit">
            <span class="small muted">${esc(kName)}</span>
            <b class="num" style="color:var(--${kTone})">${esc(kScore)}</b>
          </div>`).join("")}
        </div>
      </div>

      <div class="card pad" style="margin-top:12px">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
          <div>
            <div class="eyebrow">Backlog #12 · .ics &amp; Google Calendar</div>
            <h3 class="h3">Пересчёт UTC <code>Z</code> в Якутск (UTC+9) и Москву (UTC+3)</h3>
          </div>
          <div class="hh-seg" role="group" aria-label="Часовой пояс календаря">
            <button type="button" data-a="bb-cal-tz" data-act="bb-cal-tz" data-v="UTC+9" aria-pressed="${(bb.calTz || "UTC+9") === "UTC+9"}">Якутск · UTC+9</button>
            <button type="button" data-a="bb-cal-tz" data-act="bb-cal-tz" data-v="UTC+3" aria-pressed="${bb.calTz === "UTC+3"}">Москва · UTC+3</button>
          </div>
        </div>
        ${calendarSyncCardHTML ? calendarSyncCardHTML({
          timezone: bb.calTz === "UTC+3" ? "UTC+3" : "UTC+9",
          gcalConnected: true,
          icsUrl: "/api/calendar/brandbook-demo.ics",
          eventCount: 4,
          busySlots: [
            { dayLabel: "Ср", hour: bb.calTz === "UTC+3" ? "10:00" : "16:00", summary: "07:00 UTC · Созвон GCal" },
            { dayLabel: "Пт", hour: bb.calTz === "UTC+3" ? "11:00" : "17:00", summary: "08:00 UTC · Биология мини-группа" }
          ],
          conflictsCount: bb.calTz === "UTC+3" ? 0 : 1,
          syncAction: "bb-demo-toast",
          copyAction: "bb-demo-toast",
          importSampleAction: "bb-demo-toast",
          importOpenAction: ""
        }) : ""}
      </div>
    </section>`;
  }

  function a11ySectionHTML(bb) {
    const reduced = !!bb.reducedMotion;
    const focusCases = [
      { cls: "is-primary", title: "Primary CTA", token: "2px solid var(--accent)", body: `<button type="button" class="btn sm bb-focus-target" tabindex="-1">Выбрать репетитора</button>` },
      { cls: "is-sakha", title: "Sakha Gold", token: "2px solid var(--gold)", body: `<button type="button" class="btn sm sakha-pattern bb-focus-target" tabindex="-1">${icon("sakhaKun")}<span>Сөп · 1 200 ₽</span></button>` },
      { cls: "is-input", title: "Input Focus", token: "3px var(--accent-soft)", body: `<input class="input bb-focus-target" type="text" value="Биология · Якутск" readonly aria-label="Демо фокуса инпута">` },
      { cls: "is-error", title: "Error State", token: "3px var(--bad-soft)", body: `<input class="input bb-focus-target" type="text" value="Ниже минимума 5 000 ₽" aria-invalid="true" readonly aria-label="Демо ошибки инпута">` }
    ];
    const hotkeys = [
      ["Esc", "Закрыть модальное окно, селект или сбросить поиск"],
      ["← / →", "Шаг слайдера времени (10:00–20:00) и переключение графика"],
      ["Tab / Shift+Tab", "Последовательный переход по элементам с :focus-visible"],
      ["Enter / Space", "Активировать кнопку, подтвердить строку таблицы или свитч"]
    ];

    return `<section class="land-sec" id="bb-a11y" aria-label="Доступность: фокус-кольца, горячие клавиши и Reduced Motion">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">11 · Accessibility (A11y) · :focus-visible · Клавиатура</div>
          <h2 class="h2">Карта фокус-колец, горячие клавиши &lt;kbd&gt; и режим Reduced Motion</h2>
        </div>
        <button type="button" class="chip-btn${reduced ? " on" : ""}" data-a="bb-reduced-motion" aria-pressed="${reduced}">${reduced ? "Reduced Motion: ВКЛ ✓" : "Reduced Motion: ВЫКЛ"}</button>
      </div>

      <div class="card pad stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>01 · Карта фокус-состояний (:focus-visible)</b>
          <span class="bb-spec-pill confirm">WCAG AA · outline-offset 2 px</span>
        </div>
        <div class="bb-focus-map">
          ${focusCases.map((fc) => `<div class="bb-focus-demo ${fc.cls}">
            <div class="row between" style="gap:6px">
              <b>${esc(fc.title)}</b>
              <code class="small">${esc(fc.token)}</code>
            </div>
            <div>${fc.body}</div>
          </div>`).join("")}
        </div>
      </div>

      <div class="card pad stack" style="gap:10px;margin-top:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>02 · Шпаргалка горячих клавиш и управление анимациями</b>
          <span class="small muted">Поддержка <code>prefers-reduced-motion: reduce</code> и <code>html.reduced-motion</code></span>
        </div>
        <div class="bb-kbd-grid">
          ${hotkeys.map(([keys, desc]) => `<div class="bb-kbd-row">
            <span class="small">${esc(desc)}</span>
            <kbd class="bb-kbd">${esc(keys)}</kbd>
          </div>`).join("")}
        </div>
      </div>
    </section>`;
  }

  function landingKitSectionHTML(bb) {
    const faqOpen = Number.isInteger(bb.faqOpen) ? bb.faqOpen : 0;
    const faqs = [
      { q: "Чем отличается от обычных анкет?", a: "Показываем честную рыночную цену рядом с твоей ставкой и сразу выводим подтверждённую запись через единую .btn.confirm." },
      { q: "Как устроены кнопки на /landing и /brandbook?", a: "Ни одного дубля: все секции берут разметку из единого каталога EGE.kit и единых токенов ux-ui/styles/base.css." }
    ];
    const demoPills = marqueePillsHTML({
      universe: [
        { subject: "design", label: "UX/UI и Figma", meta: "от 1 200 ₽" },
        { subject: "inf", label: "Python / КЕГЭ", meta: "от 1 300 ₽" },
        { subject: "bio", label: "Биология · 90+", meta: "от 1 000 ₽" }
      ],
      deals: [
        { topic: "Саха сирэ · Ykt / MAX", paid: 950, tag: "60 мин" }
      ]
    });
    return `<section class="land-sec" id="bb-landing-kit">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Все паттерны /landing в одном месте · EGE.kit</div>
          <h2 class="h2">Полный каталог секций витрины: лента, ставки, защита и FAQ</h2>
        </div>
        <button type="button" class="btn soft sm" data-a="go" data-v="landing">Открыть живой /landing →</button>
      </div>

      <div class="card pad stack" style="gap:10px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>01 · Бегущая лента предметов и тегов (EGE.kit.marqueePillsHTML)</b>
          <button type="button" class="bb-spec-pill" data-a="bb-copy-token" data-copy="EGE.kit.marqueePillsHTML()">16:9 / 999 px pill · copy API</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">${demoPills.row1}${demoPills.row2}</div>
      </div>

      <div class="bb-kit-grid">
        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>02 · Быстрый подбор и полоса доверия</b><span class="bb-spec-pill">EGE.kit.trustStripHTML()</span></div>
          <div class="land-match-result">
            <div class="stack" style="gap:2px">
              <b>Найдено 14 преподавателей от 900 ₽/ч</b>
              <span class="small muted">После применения — фильтр каталога и боковое уведомление.</span>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn sm" data-a="go" data-v="landing">Показать на /landing</button>
              <span class="chip-btn on">+ Онлайн</span>
            </div>
          </div>
          ${trustStripHTML({ hideLink: true, title: "Полоса доверия (.land-trust-strip)", desc: "Оплата после ответа и бесплатная замена за 15 мин" })}
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>03 · Аналитика ставок и шаги проверки</b><span class="bb-spec-pill">EGE.kit.rateBenchCardHTML()</span></div>
          ${rateBenchCardHTML({ sid: "bio", title: "Биология · ЕГЭ 2027", minRate: 1100, avgMarket: 1800, savePct: 39, barPct: 58, clickable: false, pillText: "−39% к рынку", footNote: "", hideHeadline: true })}
          <div class="row" style="gap:10px;align-items:center;padding-top:4px">
            <span class="how-num">01</span>
            <div class="stack" style="gap:1px"><b>Проверка актуальности (.how-num)</b><span class="small muted">Ежедневный обход Доски Ykt · TG · MAX</span></div>
            <span class="verified-badge" aria-hidden="true">${icon("check")}</span>
          </div>
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>04 · Карточка защиты баланса и связи</b><span class="bb-spec-pill">.verified-badge / .tutor-perk-card</span></div>
          <div class="tutor-perk-card">
            <span class="tutor-perk-ico" aria-hidden="true">${icon("shield")}</span>
            <div class="stack" style="gap:3px">
              <b>Безопасное резервирование оплаты</b>
              <span class="small muted">Деньги списываются только после согласия репетитора на вашу ставку. При отказе — мгновенный возврат на баланс.</span>
            </div>
          </div>
          <div class="row between small muted" style="padding:8px 12px;border-radius:10px;background:var(--surface-2);border:1px solid var(--line)">
            <span class="row" style="gap:6px"><span class="verified-badge sm" aria-hidden="true">${icon("check")}</span><span>Проверенный преподаватель Саха</span></span>
            <b class="num" style="color:var(--confirm)">Слот 10:00–20:00</b>
          </div>
          <div class="row between" style="gap:8px;flex-wrap:wrap;padding-top:2px">
            <span class="small muted">Каналы связи:</span>
            ${messengerLinksHTML
              ? messengerLinksHTML({
                  entity: { id: "kit-demo", name: "Анна Соколова", whatsapp: "79142100101", telegram: "anna_bio_ege", maxHandle: "anna_bio" },
                  message: "Здравствуйте! Забронировал(а) занятие через Вектор ЕГЭ.",
                  primaryLabel: "WhatsApp",
                  compact: true
                })
              : ""}
          </div>
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>05 · Карточка отзыва, FAQ и мобильная панель</b><span class="bb-spec-pill">reviewCardHTML / faqListHTML</span></div>
          ${reviewCardHTML({
            badge: "64 → 91 балл",
            oldPrice: 1800,
            newPrice: 1100,
            text: "Нашли преподавателя на 700 ₽/ч дешевле, занимались 2 раза в неделю без срывов.",
            name: "Айтал Н., Якутск",
            role: "ЕГЭ · Биология"
          })}
          ${faqListHTML(faqs, faqOpen, "bb-faq-toggle")}
          <div class="bb-sticky-mock">
            <div class="stack" style="gap:1px"><b class="small">Мобильная липкая панель (.land-mobile-sticky)</b><span class="small muted">Показывается на ≤ 680 px</span></div>
            <button type="button" class="btn sm" data-a="go" data-v="landing">Выбрать репетитора</button>
          </div>
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between"><b>06 · Полупрозрачный градиент Саха (#C59B5F) · «Вектор ЕГЭ · твоя ставка» и «Бета-тест»</b><span class="bb-spec-pill">.btn.gold / --gold-glass / --gold-grad</span></div>
          <div class="stack" style="gap:6px">
            <div class="row between small"><span class="savings-gold-label">${icon("spark")} <span>Вектор ЕГЭ · твоя ставка</span></span><b class="num savings-gold-txt">27 000 ₽/мес</b></div>
            <div class="savings-bar-track"><div class="savings-bar-fill gold-fill" style="width:78%"></div></div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <button type="button" class="btn gold sm" data-a="go" data-v="landing">${icon("spark")}<span>Попробовать бета-тест</span></button>
            <span class="chip gold">Полупрозрачное золото · blur 12 px + градиент</span>
          </div>
        </div>
      </div>
    </section>`;
  }

  function viewBrandbook(opts, ctx) {
    opts = opts || {};
    ctx = ctx || {};
    const inside = !!opts.inside;
    const dark = !!ctx.dark;
    const bb = ensureBrandbookState(ctx.ui || {});
    const favOn = bb.fav !== false;
    const vpW = Math.max(320, Math.min(1100, Number(bb.vpWidth) || 390));
    const vpModeLabel = vpW <= 359 ? "Mini · 1 кол. узкая" : vpW <= 480 ? "Mobile · 1 кол." : vpW <= 760 ? "Compact · 1–2 кол." : vpW <= 1040 ? "Tablet · 2 кол." : "Desktop · сетка";
    const market = 2000;
    const tutorRate = 1200;
    const mode = bb.mode || "both";
    const sStyle = bb.sliderStyle || "ticks";
    const showBounds = bb.showBounds !== false;
    const curDay = bbDayObj(bb.day || "all");
    const dayPrefix = curDay.id === "all" ? "Сб" : curDay.wd;
    const hourStr = String(bb.hour).padStart(2, "0") + ":00";
    const hourPct = Math.round(((bb.hour - 10) / 10) * 100);
    const panes = (mode === "light" || mode === "both" ? brandbookPaneHTML(false, bb) : "") +
      (mode === "dark" || mode === "both" ? brandbookPaneHTML(true, bb) : "");

    const subApi = subSitesAPI();
    const subsite = bb.subsite || "all";
    const subMeta = subApi && typeof subApi.getSubsiteMeta === "function" ? subApi.getSubsiteMeta(subsite) : null;
    const allowedSecs = (subMeta && Array.isArray(subMeta.sections) && subMeta.sections[0] !== "*")
      ? new Set(subMeta.sections)
      : null;
    const iconCatalog = getIconCatalog(dark);
    const activeIconItem = bb.activeIcon ? iconCatalog.find((it) => it[0] === bb.activeIcon) : null;
    const catHits = filterCatalogItems(bb);
    const hasFilter = (bb.cat && bb.cat !== "all") || String(bb.catQ || "").trim().length > 0;
    const matchTargetIds = new Set(catHits.map((it) => it.targetId));
    const showSec = (id) => {
      if (subsite === "hub") {
        if (!hasFilter) return false;
        if (matchTargetIds.has(id)) return true;
        return !String(bb.catQ || "").trim() && bb.cat && bb.cat !== "all" && BB_SECTION_CATS[id] === bb.cat;
      }
      if (allowedSecs && !allowedSecs.has(id)) return false;
      if (!hasFilter) return true;
      if (matchTargetIds.has(id)) return true;
      if (!String(bb.catQ || "").trim() && bb.cat && bb.cat !== "all") {
        return BB_SECTION_CATS[id] === bb.cat;
      }
      return false;
    };

    const specRules = [
      ["Контейнер страниц / лендинга", "max-width: 1260 px (≥1360 px: 1340 px) · 0 px переполнения", ""],
      ["Hero-баннер · Ленские столбы", "465–495 px (моб. 430 px) · 2 CTA · светлый ским", ""],
      ["Поля экрана (Desktop / Планшет / Моб.)", "28 px / 16 px / 12 px", ""],
      ["Главная кнопка CTA (.btn / Подтверждено)", "h ≥ 42 px · Синий → Зелёный 380 ms", "confirm"],
      ["Вторичная «Подробнее» (.btn.soft)", "Тинт темнеет при hover + подъём −2 px", ""],
      ["Воздух рельсы дней (.cal-days)", "pad-top 6 px · z-index 2 при hover", ""],
      ["Кружок дня календаря (.day-dot)", "38×38 px · число без слов: 7, 14, 15", ""],
      ["Сегментный степпер ±100 ₽", "88 / 1fr / 88 px (моб. 72 px) · pad 3 px", ""],
      ["Выше рынка (высокая квалификация)", "Фиолетовый профи #7C3AED / #A78BFA", "pro"],
      ["Уведомления и ожидание ответа", "Строго оранжевый #F97316 / #FB923C", "notif"]
    ];

    const sliderVariants = [
      ["clean", "01 · Без чёрточек", "Чистая палка 10×24 px на треке без засечек — максимум воздуха в компактной карточке.", "bb-hour-range-clean", false],
      ["ticks", "02 · С редкими чёрточками", "6 деликатных рисок (10:00, 12:00, 14:00, 16:00, 18:00, 20:00) — баланс точности и чистоты.", "bb-hour-range-ticks", false],
      ["ruler", "03 · Линейка + центральная риска", "11 часовых делений (чётные длиннее) + риска внутри палки для точного прицела по часу.", "bb-hour-range-ruler", true]
    ];

    const wcagPairs = [
      ["Синий CTA", "#FFFFFF", "#0070FF", "4.68:1", "AA · UI", "aa"],
      ["Золотой стекло-CTA (Hero / Card)", "#4A310A", "#E9CFA2", "8.65:1", "AAA · Полупрозрачный градиент", "aaa"],
      ["Золотой градиент ставок", "#8C6327", "#FFFFFF", "4.92:1", "AA · Вектор ЕГЭ ставка", "aa"],
      ["Основной текст", "#141517", "#FFFFFF", "18.1:1", "AAA", "aaa"],
      ["Ночной OLED", "#FFFFFF", "#16181D", "17.7:1", "AAA", "aaa"],
      ["Подтверждено", "#FFFFFF", "#16A34A", "3.30:1", "AA Large · CTA bold", "aa"],
      ["Выше рынка", "#7C3AED", "#F3E8FF", "5.37:1", "AA+", "aa"],
      ["Уведомление --notif", "#9A3412", "#FFF3EB", "5.42:1", "Только плашка / точка", "ui"]
    ];

    const surfacePanes = [
      mode === "light" || mode === "both" ? `<div class="bb-pane is-light">
        <span class="small muted">Белый фон · #FFFFFF / #F4F5F7</span>
        <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
        <div class="hh-diff-strip">
          ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
        </div>
        <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
      </div>` : "",
      mode === "dark" || mode === "both" ? `<div class="bb-pane is-dark">
        <span class="small muted">Чёрный фон · #000000 / #16181D</span>
        <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
        <div class="hh-diff-strip">
          ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
        </div>
        <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
      </div>` : "",
      `<div class="bb-pane is-blue">
        <span class="small">Синий фон · #0070FF → #0055D4</span>
        <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
        <span class="small" style="opacity:.9">${bb.price > market ? "Выше рынка · к.т.н., победители олимпиад и ЕГЭ 95+" : (bb.price < market ? `Экономия ${(market - bb.price).toLocaleString("ru-RU")} ₽ от средней по рынку` : "Равно средней ставке по рынку")}</span>
        <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto">
          <button type="button" class="btn sakha-pattern white${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
          <button type="button" class="btn blue-ghost" data-a="go" data-v="landing">К сайту /landing</button>
        </div>
      </div>`
    ].filter(Boolean);

    const zLayers = [
      ["stickyTop", "10", "Закреплённое оглавление и шапка разделов"],
      ["selectMenu", "25", "Выпадающее меню .hh-select и подсказки форм"],
      ["mobileTabbar", "40", "Мобильная нижняя панель .tabbar"],
      ["sideToast", "60", "Боковое уведомление .toast.is-side (верх право)"],
      ["modal", "100", "Модальные окна (.modal-back / авторизация / бронь)"]
    ];

    const tocLinks = [
      ["bb-catalog", "Каталог"],
      ["bb-logo", "Лого + SVG"],
      ["bb-surfaces", "Цвета и WCAG"],
      ["bb-fonts", "Шрифты и тени"],
      ["bb-hero-banner", "Hero Ленские"],
      ["bb-yakutia", "Узоры Саха"],
      ["bb-buttons", "Кнопки и 40 иконок"],
      ["bb-forms", "Формы"],
      ["bb-cards-sys", "Тарифы и тосты"],
      ["bb-study-states", "Учёба и состояния"],
      ["bb-market-app", "/market и сайдбар"],
      ["bb-cabinet", "Кабинет и баланс"],
      ["bb-mask-trainer", "Маски контактов"],
      ["bb-data-viz", "Линия, Круг, Таблица"],
      ["bb-payments", "Эквайринг и выплаты"],
      ["bb-ui-kit-shells", "Shell-виджеты"],
      ["bb-telemetry-etl", "ETL и Логи"],
      ["bb-admin-kit", "Админ UI Kit"],
      ["bb-arch-split", "UI Kit ↔ API"],
      ["bb-ege-timers", "Таймеры ЕГЭ и ИИ"],
      ["bb-a11y", "Фокус и A11y"],
      ["bb-sliders", "Ползунки"],
      ["bb-layers", "Слои Z-index и статус"],
      ["bb-bounds", "Границы 390 px"],
      ["bb-responsive", "Адаптив"],
      ["bb-landing-kit", "Витрина"],
      ["bb-dodont", "Do/Don't и тексты"],
      ["bb-compare", "Light vs Dark"]
    ];

    const anchorLinks = subsite === "all"
      ? tocLinks
      : (allowedSecs ? tocLinks.filter(([id]) => allowedSecs.has(id)) : []);
    const showCatalogNav = ["hub", "ui-kit", "all"].includes(subsite);
    const showDeviceStage = ["hub", "home"].includes(subsite) && !hasFilter;
    const showHubCards = subsite === "hub" && !hasFilter;
    const showApiPortal = subsite === "api";

    return `<div class="land-page${bb.reducedMotion ? " is-reduced" : ""}" id="brandbook-page" data-bb-subsite="${esc(subsite)}">
      ${subApi && typeof subApi.portalHeaderHTML === "function"
        ? subApi.portalHeaderHTML(bb, { dark, inside, ui: ctx.ui || {} })
        : `<header class="land-top">
            ${brandLockupHTML({ tag: "Брендбук", sub: "UX/UI дизайн-система Вектор ЕГЭ" })}
            <div class="land-top-actions">
              <button type="button" class="btn ghost sm" data-a="go" data-v="landing">На /landing</button>
              <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
              ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="${ctx.ui && ctx.ui.role === "tutor" ? "cabinet" : "tests"}">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
            </div>
          </header>`}

      ${subApi && typeof subApi.subsiteHeroHTML === "function"
        ? subApi.subsiteHeroHTML(bb, anchorLinks)
        : `<section class="card pad-lg stack" style="gap:14px"><h1 class="h1">Дизайн-система Вектор ЕГЭ</h1></section>`}

      ${showDeviceStage && subApi && typeof subApi.deviceShowcaseSectionHTML === "function"
        ? subApi.deviceShowcaseSectionHTML(bb)
        : ""}

      ${showHubCards && subApi && typeof subApi.hubDirectoryHTML === "function"
        ? subApi.hubDirectoryHTML(bb)
        : ""}

      ${showApiPortal && subApi && typeof subApi.apiPortalSectionHTML === "function"
        ? subApi.apiPortalSectionHTML(bb)
        : ""}

      ${showCatalogNav ? catalogNavigatorHTML(bb) : ""}

      ${showSec("bb-logo") ? logoSectionHTML() : ""}

      ${showSec("bb-surfaces") ? `<section class="land-sec" id="bb-surfaces">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Поверхности · Ниже и выше рынка · WCAG Контраст</div>
            <h2 class="h2">Белый, Чёрный и Синий фон + проверка контрастности AA / AAA</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="chip-btn${bb.price === 900 ? " on" : ""}" data-a="bb-preset" data-price="900">900 ₽ · Ниже рынка</button>
              <button type="button" class="chip-btn${bb.price === 1200 ? " on" : ""}" data-a="bb-preset" data-price="1200">1 200 ₽ · Анкета</button>
              <button type="button" class="chip-btn${bb.price === 2400 ? " on" : ""}" data-a="bb-preset" data-price="2400">2 400 ₽ · Выше рынка</button>
            </div>
            <div class="hh-price-stepper compact" style="min-width:min(240px,100%)">
              <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽</b></div>
              <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
            </div>
          </div>
        </div>
        <div class="${surfacePanes.length === 3 ? "bb-cols cols-3" : "bb-cols"}">
          ${surfacePanes.join("")}
        </div>
        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>Таблица доступности цветов (WCAG 2.1 AA / AAA)</b>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="btn soft sm" data-a="bb-export-tokens" data-fmt="css">Копировать :root CSS</button>
              <button type="button" class="btn ghost sm" data-a="bb-export-tokens" data-fmt="json">Копировать tokens.json</button>
            </div>
          </div>
          <div class="bb-wcag-grid">
            ${wcagPairs.map(([label, fg, bg, ratio, rule, lvl]) => `<div class="bb-wcag-card">
              <div class="bb-wcag-sample" style="color:${fg};background:${bg}">
                <span>${label}</span>
                <span class="num">${ratio}</span>
              </div>
              <div class="row between" style="gap:6px">
                <span class="small muted num">${fg} на ${bg}</span>
                <span class="bb-wcag-badge ${lvl}">${rule}</span>
              </div>
            </div>`).join("")}
          </div>
        </div>
      </section>` : ""}

      ${showSec("bb-fonts") ? `<section class="land-sec" id="bb-fonts">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Шрифты · Inter + IBM Plex Mono · Отступы, радиусы и тени</div>
            <h2 class="h2">Типографика как на сайте hh.ru + шкала ритма и Elevation</h2>
          </div>
        </div>
        <div class="card pad-lg stack" style="gap:4px">
          <div class="bb-type-row"><b style="font-size:28px;font-weight:700;letter-spacing:-.025em">H1 · Ищи репетиторов ниже рынка</b><span class="small muted num">Inter Bold 700 · −0.02em · clamp(25–39px) / 1.15</span></div>
          <div class="bb-type-row"><b style="font-size:20px;font-weight:700;letter-spacing:-.015em">H2 · Найдено 2 480 подходящих анкет</b><span class="small muted num">Inter Bold 700 · −0.015em · 20px / 1.25</span></div>
          <div class="bb-type-row"><span style="font-size:14.5px;line-height:1.5">Body · Подробный разбор задания №28 и прямая ставка без наценок онлайн-школ.</span><span class="small muted num">Inter Regular 400 · 14.5px / 1.5</span></div>
          <div class="bb-type-row"><span class="small">Small / Caption · Заморозка средств только после ответа преподавателя</span><span class="small muted num">Inter 12.5px / 1.4 · --ink-2</span></div>
          <div class="bb-type-row"><span class="eyebrow">EYEBROW · IBM PLEX MONO 12 PX · TRACKING +0.08EM</span><span class="small muted num">IBM Plex Mono 600 · uppercase</span></div>
          <div class="bb-type-row"><span><s class="hh-price-old lg num">2 000 ₽</s> <b class="hh-price-now lg num" style="margin-left:6px">1 200 ₽/ч</b></span><span class="small muted num">Tabular-nums · Прочерк #7C828E + Ставка 700</span></div>
          <div class="bb-type-row"><span style="font-size:13.5px;font-weight:500">Опыт 6 лет · Можно удалённо · Доска Ykt · Telegram · MAX</span><span class="small muted num">Inter Medium 500 · Теги карточек 13px</span></div>
        </div>
        <div class="bb-scale-grid">
          <div class="card pad stack" style="gap:10px">
            <b>Шкала отступов (шаг 4 px · tokens.json)</b>
            <div class="bb-scale-items">
              <div class="bb-space-item"><div class="bb-space-bar" style="width:16px"></div><span class="small muted num">4</span></div>
              <div class="bb-space-item"><div class="bb-space-bar" style="width:32px"></div><span class="small muted num">8</span></div>
              <div class="bb-space-item"><div class="bb-space-bar" style="width:48px"></div><span class="small muted num">12</span></div>
              <div class="bb-space-item"><div class="bb-space-bar" style="width:64px"></div><span class="small muted num">16</span></div>
              <div class="bb-space-item"><div class="bb-space-bar" style="width:96px"></div><span class="small muted num">24</span></div>
            </div>
            <span class="small muted">Зазор кнопок: ≥ 8 px · Карточка pad: 16–20 px · Поля экрана: 28 / 16 / 12 px.</span>
          </div>
          <div class="card pad stack" style="gap:10px">
            <b>Радиусы скругления (--r / --r-sm / pill)</b>
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <div class="bb-radius-box" style="border-radius:12px">12 px</div>
              <div class="bb-radius-box" style="border-radius:16px">16 px</div>
              <div class="bb-radius-box" style="border-radius:999px;width:72px">999 px</div>
            </div>
            <span class="small muted">Кнопки и инпуты: --r-sm (12 px) · Карточки: --r (16 px) · Чипы и бейджи: 999 px.</span>
          </div>
        </div>
        <div class="bb-elev-grid">
          <div class="bb-elev-card">
            <span class="bb-spec-pill">Level 0 · Flat</span>
            <b>Карточка в потоке (.card)</b>
            <span class="small muted">Рамка 1 px --line + лёгкая тень <code>0 1px 2px rgba(0,0,0,.06)</code> без нависания.</span>
          </div>
          <div class="bb-elev-card is-lift">
            <span class="bb-spec-pill confirm">Level 1 · Hover −2 px</span>
            <b>Подъём кнопки / карточки</b>
            <span class="small muted">Смещение <code>translateY(-2px)</code> и подкрашенный контур цвета акции.</span>
          </div>
          <div class="bb-elev-card is-float">
            <span class="bb-spec-pill pro">Level 2 · Overlay --shadow</span>
            <b>Тост / выпадающий список / модалка</b>
            <span class="small muted">Контрастная тень <code>--shadow</code> + фон <code>--surface</code>.</span>
          </div>
        </div>
      </section>` : ""}

      ${heroBannerAndYakutiaSectionHTML(bb, showSec)}

      ${showSec("bb-buttons") ? `<section class="land-sec" id="bb-buttons">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Все элементы интерфейса</div>
            <h2 class="h2">Как выглядит каждая кнопка, сердечко и оранжевые уведомления</h2>
          </div>
        </div>
        <div class="bb-btn-matrix">
          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Основные кнопки CTA</b><span class="bb-spec-pill">h 42–46 px · r 12</span></div>
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
              <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
              <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
              <button type="button" class="btn confirm" data-a="bb-demo-toast">${icon("msg")}<span>Написать</span></button>
              ${messengerLinksHTML
                ? messengerLinksHTML({
                    entity: { id: "btn-demo", name: "Анна Соколова", whatsapp: "79142100101", telegram: "anna_bio_ege", maxHandle: "anna_bio" },
                    message: "Здравствуйте! Пишу через Вектор ЕГЭ.",
                    primaryLabel: "WhatsApp",
                    compact: false
                  })
                : ""}
              <button type="button" class="btn sakha-pattern${bb.sakhaSent ? " is-confirmed" : ""}" data-a="bb-sakha-toggle">${sakhaPatternSVG("rhombus", 18)}<span>${bb.sakhaSent ? "✓ Сөп" : "Оһуор · Саха"}</span></button>
              <button type="button" class="sakha-medallion-btn sm${bb.sakhaKunOn ? " is-confirmed" : ""}" data-a="bb-sakha-medallion" aria-pressed="${!!bb.sakhaKunOn}" aria-label="Күн Оһуор" title="Күн Оһуор">${sakhaPatternSVG("kun", 36)}</button>
              <button type="button" class="sakha-diamond-btn sm${bb.sakhaStarOn ? " is-confirmed" : ""}" data-a="bb-sakha-diamond" aria-pressed="${!!bb.sakhaStarOn}" aria-label="Сулус" title="Сулус"><span class="sakha-diamond-frame">${sakhaPatternSVG("star", 22)}</span></button>
              <button type="button" class="btn" disabled>Неактивна</button>
            </div>
            <span class="small muted">Минимум 8 px между кнопками; при наведении кнопки приподнимаются на 2 px и не сливаются с белой карточкой.</span>
          </div>

          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Компактные 32 px и пиллы</b><span class="bb-spec-pill">h 32 px · gap 6 px</span></div>
            <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn sm sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid" data-bb-short="1">${sakhaBidInnerHTML(bb.sent, bb.price, { short: true, size: 15 })}</button>
              <button type="button" class="btn soft sm" data-a="bb-chip">Сбросить</button>
              <button type="button" class="bb-filter-active" data-a="bb-chip">ЕГЭ 2027 ×</button>
              <button type="button" class="chip-btn" data-a="bb-chip">+ Онлайн</button>
              <span class="diff-tag pro">К.т.н. · эксперт</span>
            </div>
            <span class="small muted">Чипы фильтров не переносятся по буквам (<code>white-space: nowrap</code>) и свайпаются на мобилке.</span>
          </div>

          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Сердечко ♥ и оранжевые уведомления</b><span class="bb-spec-pill notif">#F97316 · 36 px</span></div>
            <div class="row" style="gap:10px;flex-wrap:wrap;align-items:center">
              <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное">${icon(favOn ? "heartFill" : "heart")}</button>
              <button type="button" class="btn ghost sm" data-a="bb-fav">${favOn ? "В избранном ♥" : "Добавить ♡"}</button>
              <span class="bb-bell-wrap" title="Оранжевый бейдж уведомлений">
                <span class="icon-btn">${icon("bell")}</span>
                <span class="bb-notif-badge">3</span>
              </span>
              <span class="chip notif"><span class="bb-pulse-dot"></span>На рассмотрении · уведомим</span>
            </div>
            <span class="small muted">Все счётчики уведомлений и ожидания ответа строго оранжевые (#F97316 / #FB923C), никогда красные.</span>
          </div>
        </div>

        <div class="card pad stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <div class="stack" style="gap:2px">
              <b>Полный набор иконок (${iconCatalog.length} шт. · 38×38 px и 32×32 px)</b>
              <span class="small muted">Единая толщина штриха 1.8 px · скругления round · нажми на любую иконку</span>
            </div>
            <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
              <span class="bb-spec-pill" data-bb="icon-status">${activeIconItem ? `${activeIconItem[1]} · ${activeIconItem[5]}` : "Нажми любую иконку"}</span>
              <button type="button" class="btn soft sm" data-a="bb-icons-wave">Анимировать все</button>
            </div>
          </div>
          <div class="bb-icon-grid">
            ${iconCatalog.map(([ic, label, col, badge, anim, animDesc]) => {
              const isAct = bb.activeIcon === ic;
              return `<button type="button" class="bb-icon-tile${isAct ? " is-active is-anim" : ""}" data-a="bb-icon-play" data-icon="${ic}" data-anim="${anim}" data-label="${label}" data-anim-desc="${animDesc}" aria-pressed="${isAct}">
                <span class="bb-bell-wrap">
                  <span class="icon-btn sm" style="color:${col}">${icon(ic)}</span>
                  ${badge ? `<span class="bb-notif-badge">${badge}</span>` : ""}
                </span>
                <b>${label}</b>
                <span class="bb-icon-anim-tag">${animDesc}</span>
              </button>`;
            }).join("")}
          </div>
        </div>
      </section>` : ""}

      ${showSec("bb-forms") ? formsSectionHTML(bb) : ""}

      ${showSec("bb-cards-sys") ? cardsAndOverlaysSectionHTML(bb) : ""}

      ${showSec("bb-study-states") ? studyAndStatesSectionHTML(bb) : ""}

      ${showSec("bb-market-app") ? marketAndAppSectionHTML(bb) : ""}

      ${(showSec("bb-cabinet") || showSec("bb-mask-trainer")) ? cabinetAndBalanceSectionHTML(bb) : ""}

      ${showSec("bb-data-viz") ? dataVizSectionHTML(bb) : ""}

      ${showSec("bb-payments") ? paymentsSectionHTML(bb) : ""}

      ${showSec("bb-ui-kit-shells") ? uiKitShellsSectionHTML(bb) : ""}

      ${showSec("bb-telemetry-etl") ? telemetryEtlSectionHTML(bb) : ""}

      ${showSec("bb-admin-kit") ? adminKitSectionHTML(bb) : ""}

      ${showSec("bb-arch-split") ? archSplitSectionHTML(bb) : ""}

      ${showSec("bb-ege-timers") ? egeTimersSectionHTML(bb) : ""}

      ${showSec("bb-a11y") ? a11ySectionHTML(bb) : ""}

      ${showSec("bb-sliders") ? `<section class="land-sec" id="bb-sliders">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Выбор времени · 3 вида ползунка</div>
            <h2 class="h2">Ползунок-палка 10:00–20:00: без чёрточек и с чёрточками</h2>
          </div>
          <span class="hh-time-val num" data-bb="hour">${dayPrefix} · ${hourStr}</span>
        </div>
        <div class="bb-sliders-grid">
          ${sliderVariants.map(([vid, vtitle, vdesc, rid, isRuler]) => {
            const picked = sStyle === vid;
            return `<div class="bb-slider-card${picked ? " is-picked" : ""}">
              <div class="stack" style="gap:6px">
                <div class="row between" style="gap:8px">
                  <b>${vtitle}</b>
                  <span class="hh-time-val num" data-bb="hour-short">${hourStr}</span>
                </div>
                <p class="small muted">${vdesc}</p>
              </div>
              <div class="hh-time-picker">
                <input class="hh-time-range${isRuler ? " is-ruler" : ""}" id="${rid}" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="${vtitle}">
                ${sliderTicksHTML(bb.hour, vid)}
                <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
              </div>
              <button type="button" class="chip-btn${picked ? " on" : ""}" data-a="bb-slider-style" data-v="${vid}" style="justify-content:center">${picked ? "Применён в макетах ✓" : "Выбрать этот вид"}</button>
            </div>`;
          }).join("")}
        </div>
      </section>` : ""}

      ${showSec("bb-layers") ? `<section class="land-sec" id="bb-layers">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Переходы · Z-index слои · Reduced Motion</div>
            <h2 class="h2">Анимации отклика, подъёма кнопок, лайка и таблица слоёв</h2>
          </div>
          <button type="button" class="chip-btn${bb.reducedMotion ? " on" : ""}" data-a="bb-reduced-toggle">${bb.reducedMotion ? "Reduced Motion: ВКЛ ✓" : "Тест prefers-reduced-motion"}</button>
        </div>
        <div class="bb-motion-grid">
          <div class="bb-motion-card">
            <div class="row between"><b>01 · Сөп Саха → Зелёный CTA + Оранжевое уведомление</b><span class="bb-spec-pill notif">CTA + --notif</span></div>
            <p class="small muted">Нажатие переводит узорную кнопку Сөп (без обрезанных углов) в зелёный --confirm и сразу показывает оранжевое уведомление --notif (#F97316).</p>
            <div class="stack" style="gap:8px">
              <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" id="bb-layers-bid-btn" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
              <div class="hh-motion-status${bb.sent ? " sent" : ""}" data-bb="bid-status">
                ${bb.sent
                  ? sentNoticeHTML({ slot: `${String(bb.hour || 14).padStart(2, "0")}:00`, offer: bb.price, badgeText: "Уведомим" })
                  : `<span class="small muted">Обычное состояние CTA · Узор Саха</span><span class="chip notif">Уведомим оранжевым</span>`}
              </div>
            </div>
          </div>

          <div class="bb-motion-card">
            <div class="row between"><b>02 · Подъём «Подробнее» без сливания</b><span class="bb-spec-pill">−2 px</span></div>
            <p class="small muted">При наведении светло-синяя кнопка НЕ высветляется в белый — тинт углубляется (#DCEAFF / #16325E), а кнопка приподнимается.</p>
            <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:4px">
              <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
              <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
            </div>
          </div>

          <div class="bb-motion-card">
            <div class="row between"><b>03 · Пружина ♥ и пульс уведомления</b><span class="bb-spec-pill notif">1.8 s</span></div>
            <p class="small muted">Избранное пружинит (scale 1.26 → 1), а новые ответы бота дышат спокойным оранжевым импульсом.</p>
            <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
              <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Пружина избранного">${icon(favOn ? "heartFill" : "heart")}</button>
              <span class="chip notif"><span class="bb-pulse-dot"></span>Уведомление · 3 ответа</span>
            </div>
          </div>

          <div class="bb-motion-card">
            <div class="row between"><b>04 · Ниже ↔ Выше рынка (квалификация)</b><span class="bb-spec-pill pro">Фиолет</span></div>
            <p class="small muted">Ставка выше рынка не ошибка: фиолетовый тег означает высокую квалификацию преподавателя (к.т.н., эксперт ЕГЭ/ВсОШ).</p>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="chip-btn${bb.price < market ? " on" : ""}" data-a="bb-preset" data-price="1100">1 100 ₽ (ниже)</button>
              <button type="button" class="chip-btn${bb.price > market ? " on" : ""}" data-a="bb-preset" data-price="2400">2 400 ₽ (выше · профи)</button>
            </div>
          </div>
        </div>
        <div class="card pad stack" style="gap:8px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>Шкала слоёв интерфейса (z-index) · tokens.json</b>
            <span class="small muted">Тосты и модалки никогда не застревают под шапкой или таб-баром</span>
          </div>
          <div class="table-wrap">
            <table class="tbl">
              <thead><tr><th>Токен</th><th>z-index</th><th>Назначение слоя</th></tr></thead>
              <tbody>
                ${zLayers.map(([tok, zv, desc]) => `<tr><td class="mono small">${tok}</td><td class="num"><b>${zv}</b></td><td class="small muted">${desc}</td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </div>
      </section>` : ""}

      ${showSec("bb-bounds") ? `<section class="land-sec" id="bb-bounds">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Ограничения · Визуальные границы · Mobile 390 px</div>
            <h2 class="h2">Как показываются границы, почему не режет рамки и как на мобилке</h2>
          </div>
          <button type="button" class="chip-btn${showBounds ? " on" : ""}" data-a="bb-bounds-toggle">${showBounds ? "Границы показаны ✓" : "Показать границы"}</button>
        </div>

        <div class="bb-blueprint-grid">
          <div class="bb-bp-card${showBounds ? "" : " hide-guides"}">
            <div class="row between"><b>1. Воздух сверху рельсы (Сб / Вс / Пн)</b><span class="bb-spec-pill">pad-top 6 px</span></div>
            <div class="bb-bp-stage">
              <span class="bb-bp-tag notif">overflow-x · air 6 px top / 8 px bottom</span>
              <div class="bb-bp-zone">
                <div class="bb-days-rail" role="group" aria-label="Проверка границ кнопок дней">
                  ${BB_DAYS.map((d) => `<button type="button" class="day-cir${curDay.id === d.id ? " on" : ""}" data-a="bb-day" data-v="${d.id}" style="flex:0 0 60px;padding:6px 4px">
                    <span class="day-wd">${d.wd}</span>
                    <span class="day-dot">${d.num}</span>
                  </button>`).join("")}
                </div>
              </div>
            </div>
            <p class="small muted">У горизонтальной ленты нельзя ставить <code>padding-top: 0</code>: при наведении карточка дня всплывает вверх на 1 px и без 6 px воздуха сверху срезáлась бы синяя рамка.</p>
          </div>

          <div class="bb-bp-card${showBounds ? "" : " hide-guides"}">
            <div class="row between"><b>2. Зазор 8 px и угол 84 px для иконок</b><span class="bb-spec-pill confirm">gap ≥ 8 px</span></div>
            <div class="bb-bp-stage">
              <span class="bb-bp-tag confirm">safe corner 84×40 px · btn gap 8 px</span>
              <div class="row between" style="align-items:center">
                <span class="small"><b>Заголовок + ставка</b></span>
                <div class="bb-bp-zone row" style="gap:4px">
                  <span class="fav-btn" aria-hidden="true">${icon("eyeOff")}</span>
                  <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Проверка угла">${icon(favOn ? "heartFill" : "heart")}</button>
                </div>
              </div>
              <div class="row" style="gap:0;align-items:center">
                <button type="button" class="btn sm sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid" data-bb-short="1">${sakhaBidInnerHTML(bb.sent, bb.price, { short: true, size: 15 })}</button>
                <span class="bb-bp-gap" title="Минимальный зазор 8 px" aria-hidden="true"></span>
                <button type="button" class="btn soft sm" data-a="bb-chip">Подробнее</button>
              </div>
            </div>
            <p class="small muted">Зазор 8 px отделяет кнопки, чтобы они не сливались при hover-подъёме; справа в шапке всегда остаётся 84 px под глаз и сердечко.</p>
          </div>

          <div class="bb-bp-card${showBounds ? "" : " hide-guides"}">
            <div class="row between"><b>3. Коридор ползунка и степпер ±100 ₽</b><span class="bb-spec-pill">88 / 1fr / 88 px</span></div>
            <div class="bb-bp-stage">
              <span class="bb-bp-tag">track area 29 px · thumb 10×24 px</span>
              <div class="bb-bp-zone">
                <input class="hh-time-range" id="bb-hour-range-bounds" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Проверка границ ползунка">
              </div>
              <div class="bb-bp-zone">
                <div class="hh-price-stepper compact">
                  <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
                  <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽</b></div>
                  <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
                </div>
              </div>
            </div>
            <p class="small muted">На десктопе кнопки степпера 88 px, на 390 px — 72 px; вертикальная палка 10×24 px имеет сенсорный запас по краям ±6 px.</p>
          </div>
        </div>

        <div class="bb-specs-layout">
          <div class="card pad-lg stack" style="gap:6px">
            <div class="row between" style="margin-bottom:4px">
              <b>Правила границ, цветов и отступов</b>
              <span class="small muted">Desktop 1280 px · Mobile 390 px</span>
            </div>
            ${specRules.map(([name, val, kind]) => `<div class="bb-spec-row">
              <span class="small ink2">${name}</span>
              <span class="bb-spec-pill${kind ? " " + kind : ""}">${val}</span>
            </div>`).join("")}
          </div>

          <div class="stack" style="gap:8px;align-items:center">
            <div class="row" style="gap:6px;flex-wrap:wrap;justify-content:center">
              <button type="button" class="chip-btn${vpW <= 340 ? " on" : ""}" data-a="bb-vp" data-w="320" style="min-height:28px;padding:3px 10px;font-size:12px">320 px</button>
              <button type="button" class="chip-btn${vpW > 340 && vpW <= 420 ? " on" : ""}" data-a="bb-vp" data-w="390" style="min-height:28px;padding:3px 10px;font-size:12px">390 px</button>
              <button type="button" class="chip-btn${vpW > 420 && vpW <= 820 ? " on" : ""}" data-a="bb-vp" data-w="768" style="min-height:28px;padding:3px 10px;font-size:12px">768 px</button>
            </div>
            <span class="small muted">Живой макет «Как на мобилке · <span data-bb="phone-w">${Math.min(410, vpW)}</span> px» · нажимай дни Сб / Вс / Пн</span>
            <div class="bb-phone-frame" style="max-width:${Math.min(410, vpW)}px" aria-label="Предпросмотр мобильной версии ${Math.min(410, vpW)} px">
              <div class="bb-phone-status">
                <span class="num" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">09:41 · Вектор ЕГЭ · <span data-bb="day-label">${curDay.full}</span></span>
                <span class="top-bal-wrap" style="gap:4px">
                  <span class="top-bal-pill${bb.balFunded !== false ? " is-funded" : ""}" style="min-height:26px;padding:0 7px;font-size:11px;gap:4px">${icon("wallet")}<span class="num">${bb.balFunded !== false ? "5 000 ₽" : "0 ₽"}</span></span>
                  <span class="top-bal-btn" style="width:28px;min-height:28px;padding:0;justify-content:center" aria-hidden="true">${icon("plus")}</span>
                </span>
              </div>
              <div class="bb-phone-body">
                <div class="chip-rail swipe" style="padding-bottom:2px">
                  <span class="chip-btn on" style="min-height:30px;padding:4px 10px;font-size:12px">Фильтры</span>
                  <span class="chip-btn" style="min-height:30px;padding:4px 10px;font-size:12px">+ ЕГЭ</span>
                  <span class="chip-btn" style="min-height:30px;padding:4px 10px;font-size:12px">+ ${curDay.wd}</span>
                  <span class="chip-btn" style="min-height:30px;padding:4px 10px;font-size:12px">+ ${hourStr}</span>
                </div>
                <div class="bb-days-rail" role="group" aria-label="Выбор дня на мобилке">
                  ${BB_DAYS.map((d) => `<button type="button" class="day-cir${curDay.id === d.id ? " on" : ""}" data-a="bb-day" data-v="${d.id}" style="flex:0 0 58px;padding:6px 4px">
                    <span class="day-wd">${d.wd}</span>
                    <span class="day-dot">${d.num}</span>
                  </button>`).join("")}
                </div>
                <div class="card" style="padding:14px;display:grid;gap:10px;box-shadow:none">
                  <div class="tutor-head">
                    <div style="min-width:0">
                      <b style="font-size:15px">Репетитор · UX/UI и Figma</b>
                      <div class="hh-price-row" style="margin-top:3px">${priceHeadlineHTML(market, bb.price, false)}</div>
                      <div class="hh-diff-strip" style="margin-top:5px">
                        ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · профи" })}
                      </div>
                    </div>
                    <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное на мобилке">${icon(favOn ? "heartFill" : "heart")}</button>
                  </div>
                  <div class="hh-time-picker" style="padding:9px 10px">
                    <div class="row between">
                      <span class="small muted">${curDay.full}</span>
                      <span class="hh-time-val num" data-bb="hour-short">${hourStr}</span>
                    </div>
                    <input class="hh-time-range${sStyle === "ruler" ? " is-ruler" : ""}" id="bb-hour-range-mobile" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Мобильный ползунок времени">
                    ${sliderTicksHTML(bb.hour, sStyle)}
                  </div>
                  <div class="hh-price-stepper" style="grid-template-columns:72px minmax(0,1fr) 72px">
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
                    <div class="hh-step-readout"><b class="num" style="font-size:15px">${bb.price.toLocaleString("ru-RU")} ₽/ч</b></div>
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
                  </div>
                  <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" style="width:100%" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
                </div>
              </div>
              <div class="bb-phone-tabs" aria-hidden="true">
                <div class="bb-phone-tab">${icon("list")}<span>Тесты</span></div>
                <div class="bb-phone-tab">${icon("book")}<span>Справочник</span></div>
                <div class="bb-phone-tab on">${icon("users")}<span>Репетиторы</span></div>
                <div class="bb-phone-tab">${icon("cal")}<span>Учёба</span><span class="bb-notif-badge">3</span></div>
                <div class="bb-phone-tab">${icon("chart")}<span>Показатели</span></div>
              </div>
            </div>
          </div>
        </div>
      </section>` : ""}

      ${showSec("bb-responsive") ? `<section class="land-sec" id="bb-responsive">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Адаптивность · Container Queries + Breakpoints</div>
            <h2 class="h2">Живой стенд адаптивности: 320 → 1100 px</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="chip accent" id="bb-vp-mode">${vpModeLabel}</span>
            <b class="num" id="bb-vp-readout">${vpW} px</b>
          </div>
        </div>

        <div class="card pad stack" style="gap:12px">
          <div class="bb-resp-toolbar">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="chip-btn${vpW <= 340 ? " on" : ""}" data-a="bb-vp" data-w="320">Mini 320 px</button>
              <button type="button" class="chip-btn${vpW > 340 && vpW <= 420 ? " on" : ""}" data-a="bb-vp" data-w="390">Mobile 390 px</button>
              <button type="button" class="chip-btn${vpW > 420 && vpW <= 820 ? " on" : ""}" data-a="bb-vp" data-w="768">Tablet 768 px</button>
              <button type="button" class="chip-btn${vpW > 820 ? " on" : ""}" data-a="bb-vp" data-w="1100">Desktop 1100 px</button>
            </div>
            <div class="bb-resp-width-ctl" style="flex:1;min-width:220px">
              <span class="small muted num">320</span>
              <input class="hh-time-range" id="bb-vp-slider" type="range" min="320" max="1100" step="10" value="${vpW}" style="--pct:${Math.round(((vpW - 320) / 780) * 100)}%;flex:1" aria-label="Ширина адаптивного стенда">
              <span class="small muted num">1100</span>
            </div>
          </div>

          <div class="bb-resp-stage">
            <div class="bb-resp-viewport" id="bb-resp-viewport" style="max-width:${vpW}px">
              <div class="bb-resp-metrics">
                <b>@container · живая перестройка карточки</b>
                <span class="num">Ширина контейнера: <b id="bb-resp-cur">${vpW} px</b></span>
              </div>
              <div class="bb-resp-grid">
                <div class="card" style="padding:14px;display:grid;gap:10px;box-shadow:none">
                  <div class="row between" style="gap:8px;align-items:flex-start">
                    <div style="min-width:0">
                      <b style="font-size:15px">Математика ЕГЭ · Анна С.</b>
                      <div class="hh-price-row" style="margin-top:3px">${priceHeadlineHTML(market, bb.price, false)}</div>
                    </div>
                    <button type="button" class="fav-btn" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное в стенде">${icon(favOn ? "heartFill" : "heart")}</button>
                  </div>
                  <div class="hh-diff-strip">
                    ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "Эксперт ЕГЭ 95+" })}
                  </div>
                  <div class="hh-price-stepper compact">
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="-100">−100 ₽</button>
                    <div class="hh-step-readout"><b class="num">${bb.price.toLocaleString("ru-RU")} ₽/ч</b></div>
                    <button type="button" class="hh-step-btn" data-a="bb-step" data-step="100">+100 ₽</button>
                  </div>
                </div>

                <div class="card" style="padding:14px;display:grid;gap:10px;box-shadow:none">
                  <div class="row between" style="gap:8px">
                    <span class="small muted">${curDay.full}</span>
                    <span class="hh-time-val num" data-bb="hour-short">${hourStr}</span>
                  </div>
                  <input class="hh-time-range${sStyle === "ruler" ? " is-ruler" : ""}" id="bb-hour-range-resp" type="range" min="10" max="20" step="1" value="${bb.hour}" style="--pct:${hourPct}%" aria-label="Время в стенде адаптивности">
                  <div class="bb-days-rail" role="group" aria-label="Дни в стенде">
                    ${BB_DAYS.map((d) => `<button type="button" class="day-cir${curDay.id === d.id ? " on" : ""}" data-a="bb-day" data-v="${d.id}" style="flex:0 0 56px;padding:6px 4px">
                      <span class="day-wd">${d.wd}</span>
                      <span class="day-dot">${d.num}</span>
                    </button>`).join("")}
                  </div>
                  <div class="bb-resp-actions">
                    <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
                    <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="bb-bp-rules-cards">
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill">Mini &lt; 360 px</span>
              <b>Узкие экраны SE</b>
              <p class="small muted">Степпер сжимается до 60 px, кнопки CTA встают одна под другой на всю ширину без переполнения.</p>
            </div>
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill">Mobile 360–680 px</span>
              <b>Мобильный стек</b>
              <p class="small muted">1 колонка карточек, нижний таб-бар, свайп дней 6 px сверху, боковое уведомление — сверху по ширине.</p>
            </div>
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill confirm">Tablet 681–1080 px</span>
              <b>2-колоночный планшет</b>
              <p class="small muted">Тарифы, анкеты, карточки и справочник перестраиваются в 2 равные колонки без пустых дыр.</p>
            </div>
            <div class="card pad stack" style="gap:4px;box-shadow:none">
              <span class="bb-spec-pill pro">Desktop ≥ 1360 px</span>
              <b>Широкий экран</b>
              <p class="small muted">Контейнер 1 260–1 340 px, боковое уведомление справа, а @container держит ритм внутри любых сеток.</p>
            </div>
          </div>
        </div>
      </section>` : ""}

      ${showSec("bb-landing-kit") ? landingKitSectionHTML(bb) : ""}

      ${showSec("bb-dodont") ? doDontSectionHTML() : ""}

      ${showSec("bb-compare") ? `<section class="land-sec" id="bb-compare">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Сквозной регрессионный стенд · UI Kit в действии</div>
            <h2 class="h2">Полный набор компонентов в Белом и Чёрном OLED виде рядом</h2>
          </div>
        </div>
        <div class="${mode === "both" ? "bb-cols" : "stack"}">${panes}</div>
      </section>` : ""}

      ${subApi && typeof subApi.subsitePagerHTML === "function" ? subApi.subsitePagerHTML(subsite) : ""}

      ${blueBannerHTML({
        title: "Готово по брендбуку — посмотри собранный сайт /landing",
        subtitle: "Все секции /landing теперь собираются напрямую из единого каталога EGE.kit (/brandbook) без дублирующей разметки.",
        primaryLabel: "Открыть сайт /landing →",
        primaryAction: "go",
        primaryVal: "landing"
      })}
    </div>`;
  }

  function viewFees(opts, ctx) {
    opts = opts || {};
    ctx = ctx || {};
    const inside = !!opts.inside;
    const dark = !!ctx.dark;
    const ui = ctx.ui || {};
    const rate = Math.max(600, Math.min(3500, Number(ui.feesRate) || 800));
    const presets = [800, 1000, 1200, 1500, 2000];
    const sbpGatewayRub = Math.round(rate * 0.01);
    return `<div class="land-page" id="fees-page">
      <header class="land-top">
        ${brandLockupHTML({ tag: "Оплата · СБП", sub: "Только СБП · эскроу-защита и сервисный сбор" })}
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "← К репетиторам" : "← На главную"}</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="${ctx.ui && ctx.ui.role === "tutor" ? "cabinet" : "tests"}">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <section class="card pad-lg stack" style="gap:18px">
        <div class="stack" style="gap:8px">
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="chip confirm">Только СБП · 0% за карты</span>
            <span class="chip">АЭБ · СберБанк · Т-Банк · ВТБ</span>
            <span class="chip pro">Авточек НПД · Вывод от 500 ₽</span>
          </div>
          <div class="eyebrow">Оплата занятий · СБП-сплит и эскроу</div>
          <h1 class="h1">Как устроена СБП-платёжка, эскроу-защита и сервисный сбор</h1>
          <p class="lead">Мы отказались от дорогого карточного эквайринга (3,42%) и работаем <b>только через СБП</b> — по QR-коду или кнопке вашего банка за 5 секунд. Базовый расчёт индивидуального урока фиксированный (5% сервис системы + 1% шлюз СБП-сплита с авточеком «Мой налог»), без скрытых доплат сверх ставки ученика.</p>
        </div>

        <div class="grid-2" style="gap:12px">
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip confirm" style="justify-self:start">01 · Только СБП без наценок</span>
            <b>Прямая оплата по СБП вместо карт (3,42%)</b>
            <p class="small ink2">Принимаем оплату напрямую через Систему быстрых платежей (АЭБ, СберБанк, Т-Банк, ВТБ). Ученик и родитель платят ровно по тарифу или выбранной ставке — никаких скрытых комиссий сверху.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip accent" style="justify-self:start">02 · Старт от 990 ₽ или 390 ₽ ИИ</span>
            <b>Пробный 60 мин с 100% гарантией замены</b>
            <p class="small ink2">Старт занятий с репетитором — от <b>990 ₽</b> за полный 60-минутный урок-диагностику (вместо «пустых» 15 минут; видео-визитку можно посмотреть заранее). После первого платежа любые доплаты открыты от <b>100 ₽</b>, а самостоятельный тренажёр «ИИ-Старт ЕГЭ» стоит <b>390 ₽/мес</b>.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip gold" style="justify-self:start">03 · Эскроу и шлюз контактов</span>
            <b>Поурочный холд + открытие WA / TG / MAX</b>
            <p class="small ink2">Деньги замораживаются на счёте и списываются только после подтверждённого урока. Сразу после бронирования слота в «Учёбе» открываются прямые чаты WhatsApp, Telegram и MAX. Отмена за ≥ 4 ч или замена преподавателя возвращают 100% на баланс.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip pro" style="justify-self:start">04 · Прозрачный сбор 5% + 1% СБП</span>
            <b>Низкий сбор 5% сервис + 1% шлюз СБП (8% группы)</b>
            <p class="small ink2">С каждого индивидуального урока 95% составляет базовая выплата (5% — сервис платформы и +1% — банковский шлюз СБП-сплита с авточеком НПД «Мой налог»). Для «Мини-групп 3–5 чел.» действует единый мягкий сбор 8%.</p>
          </div>
        </div>

        <div class="grid-2" style="gap:12px">
          <div class="card pad stack" style="gap:8px;box-shadow:none;background:var(--surface-2)">
            <div class="row between" style="gap:6px;flex-wrap:wrap">
              <b>Тарифы для учеников и родителей (СБП)</b>
              <span class="chip accent">От 390 до 8 900 ₽</span>
            </div>
            <ul class="plan-feats">
              <li><span><b>ИИ-Старт ЕГЭ — 390 ₽/мес</b> · безлимитный тренажёр ЕГЭ-2027 и ИИ-сочинения К1–К12</span></li>
              <li><span><b>Пробный урок 60 мин — 990 ₽</b> · диагностика + 100% гарантия бесплатной замены и открытие WA/TG/MAX</span></li>
              <li><span><b>Мини-группа Саха (3–5 чел.) — 2 190 ₽</b> · 4 живых урока (~548 ₽/урок) + ИИ-Старт бесплатно</span></li>
              <li><span><b>Стандарт 1-на-1 (4 урока) — 4 590 ₽</b> · эскроу по урокам + автоотчёт родителю + доплаты от 100 ₽</span></li>
              <li><span><b>Интенсив (8 уроков под ключ) — 8 900 ₽</b> · замена за 15 мин, фиксация ставки и кэшбэк 2%</span></li>
            </ul>
          </div>
          <div class="card pad stack" style="gap:8px;box-shadow:none;background:var(--surface-2)">
            <div class="row between" style="gap:6px;flex-wrap:wrap">
              <b>Тарифы и выплаты для преподавателей</b>
              <span class="chip pro">PRO 1 490 ₽/мес</span>
            </div>
            <ul class="plan-feats">
              <li><span><b>Свободный старт — 0 ₽/мес</b> · видео-визитка 60 сек, ежедневный топ и готовые ученики с оплаченным пробным 990 ₽</span></li>
              <li><span><b>Верхняя полоса PRO — 1 490 ₽/мес (3 900 ₽ / 3 мес.)</b> · закрепление в верхней карусели предмета в часы пик и скидка 50% на сбор подбора</span></li>
              <li><span><b>Мини-группы 3–5 чел.</b> · доступно на PRO: 4–5 учеников в одном слоте дают до ~2 015 ₽/ч чистыми под сбор 8%</span></li>
              <li><span><b>Быстрый вывод на СБП</b> · мгновенно от 500 ₽ с автоматической фискализацией чека НПД</span></li>
            </ul>
          </div>
        </div>

        <div class="card pad-lg stack" style="gap:12px;background:var(--surface-2);box-shadow:none">
          <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
            <div class="stack" style="gap:2px">
              <b>Калькулятор расчёта урока (индивидуальный формат · 5% сервис + 1% шлюз СБП)</b>
              <span class="small muted">Выбери стоимость часа для точного расчёта:</span>
            </div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${presets.map((p) => `<button type="button" class="chip-btn${rate === p ? " on" : ""}" data-a="fees-rate" data-rate="${p}">${p.toLocaleString("ru-RU")} ₽</button>`).join("")}
            </div>
          </div>
          <div class="bid-fee-row">${feeSplitHTML(rate, ctx.TDATA)}</div>
          <p class="small muted">При ставке <b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b> расчёт 95%/5% (сервис 5%) формируется автоматически, а банковский шлюз СБП-сплита с авточеком НПД добавляет лишь 1% (<b class="num">${sbpGatewayRub.toLocaleString("ru-RU")} ₽</b>) вместо 3,42% у обычных карт.</p>
        </div>

        <div class="row" style="gap:10px;flex-wrap:wrap">
          <button type="button" class="btn" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "Выбрать репетитора" : "Перейти к подбору репетиторов"}</button>
        </div>
      </section>
    </div>`;
  }

  function applyBrandbookViewport(ui, rawW) {
    const bb = ensureBrandbookState(ui || {});
    const vpW = Math.max(320, Math.min(1100, Math.round(Number(rawW) || 390)));
    bb.vpWidth = vpW;
    const vpModeLabel = vpW <= 359 ? "Mini · 1 кол. узкая" : vpW <= 480 ? "Mobile · 1 кол." : vpW <= 760 ? "Compact · 1–2 кол." : vpW <= 1040 ? "Tablet · 2 кол." : "Desktop · сетка";
    const vpEl = typeof document.getElementById === "function" ? document.getElementById("bb-resp-viewport") : null;
    if (vpEl && vpEl.style) vpEl.style.maxWidth = vpW + "px";
    const roEl = typeof document.getElementById === "function" ? document.getElementById("bb-vp-readout") : null;
    if (roEl) roEl.textContent = vpW + " px";
    const curEl = typeof document.getElementById === "function" ? document.getElementById("bb-resp-cur") : null;
    if (curEl) curEl.textContent = vpW + " px";
    const modeEl = typeof document.getElementById === "function" ? document.getElementById("bb-vp-mode") : null;
    if (modeEl) modeEl.textContent = vpModeLabel;
    const slEl = typeof document.getElementById === "function" ? document.getElementById("bb-vp-slider") : null;
    if (slEl) {
      slEl.value = String(vpW);
      if (slEl.style && typeof slEl.style.setProperty === "function") {
        slEl.style.setProperty("--pct", Math.round(((vpW - 320) / 780) * 100) + "%");
      }
    }
    if (typeof document.querySelectorAll === "function") {
      const phoneW = Math.min(410, vpW);
      document.querySelectorAll(".bb-phone-frame").forEach((pf) => {
        if (pf.style) pf.style.maxWidth = phoneW + "px";
      });
      document.querySelectorAll('[data-bb="phone-w"]').forEach((pw) => { pw.textContent = String(phoneW); });
      document.querySelectorAll('[data-a="bb-vp"]').forEach((btn) => {
        const bw = Number(btn.dataset && btn.dataset.w) || 390;
        const active = (bw === 320 && vpW <= 340) ||
          (bw === 390 && vpW > 340 && vpW <= 420) ||
          (bw === 768 && vpW > 420 && vpW <= 820) ||
          (bw === 1100 && vpW > 820);
        if (btn.classList) btn.classList.toggle("on", active);
      });
    }
  }

  function handleAction(act, el, ui, hooks) {
    hooks = hooks || {};
    const bb = ensureBrandbookState(ui || {});
    const ds = (el && el.dataset) || {};
    const render = typeof hooks.render === "function" ? hooks.render : (() => {});
    const notify = typeof hooks.notifySide === "function" ? hooks.notifySide : (() => {});
    const toast = typeof hooks.toast === "function" ? hooks.toast : (() => {});
    const copy = typeof hooks.copy === "function" ? hooks.copy : (() => {});

    if (act === "bb-subsite") {
      const subApi = subSitesAPI();
      const raw = ds.v || (el && el.getAttribute && el.getAttribute("href")) || "hub";
      const cleanRaw = String(raw).replace(/^\/brandbook\/?/, "");
      const parsed = subApi && typeof subApi.parseSubsiteInput === "function"
        ? subApi.parseSubsiteInput(cleanRaw || "hub")
        : { subsite: cleanRaw || "hub", deviceView: null };
      bb.subsite = parsed.subsite;
      if (parsed.deviceView) bb.deviceView = parsed.deviceView;
      bb.cat = "all";
      bb.catQ = "";
      if (subApi && typeof subApi.syncSubsiteUrl === "function") {
        const urlSlug = parsed.deviceView || parsed.subsite;
        subApi.syncSubsiteUrl(urlSlug, false);
      }
      try {
        if (typeof window !== "undefined" && typeof window.scrollTo === "function") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch (e) { /* игнор */ }
      render();
      return true;
    }
    if (act === "bb-dev-view") {
      bb.deviceView = ["split", "desktop", "mobile"].includes(ds.v) ? ds.v : "split";
      render();
      return true;
    }
    if (act === "bb-dev-screen") {
      bb.deviceScreen = ["landing", "student", "tutor"].includes(ds.v) ? ds.v : "landing";
      render();
      return true;
    }
    if (act === "bb-dev-theme") {
      bb.deviceTheme = ds.v === "dark" ? "dark" : "light";
      render();
      return true;
    }
    if (act === "bb-api-group") {
      const v = ds.v || "all";
      bb.apiGroup = ["all", "auth", "realtime", "calendar", "admin"].includes(v) ? v : "all";
      render();
      return true;
    }
    if (act === "bb-mode") {
      bb.mode = ["both", "light", "dark"].includes(ds.v) ? ds.v : "both";
      render();
      return true;
    }
    if (act === "bb-step") {
      const step = Number(ds.step) || 0;
      bb.price = Math.max(600, Math.min(3500, (Number(bb.price) || 1200) + step));
      render();
      return true;
    }
    if (act === "bb-preset") {
      const p = Number(ds.price);
      if (Number.isFinite(p)) bb.price = Math.max(600, Math.min(3500, p));
      render();
      return true;
    }
    if (act === "bb-day") {
      bb.day = ds.v || "all";
      render();
      return true;
    }
    if (act === "bb-slider-style") {
      bb.sliderStyle = ["clean", "ticks", "ruler"].includes(ds.v) ? ds.v : "ticks";
      render();
      return true;
    }
    if (act === "bb-bounds-toggle") {
      bb.showBounds = bb.showBounds === false;
      render();
      return true;
    }
    if (act === "bb-vp") {
      applyBrandbookViewport(ui, ds.w || 390);
      render();
      return true;
    }
    if (act === "bb-chip") {
      bb.chipOn = !bb.chipOn;
      render();
      return true;
    }
    if (act === "bb-bid") {
      bb.sent = !bb.sent;
      render();
      notify(bb.sent ? "Ставка передана" : "Ставка сброшена", `${Number(bb.price || 1200).toLocaleString("ru-RU")} ₽/ч · ${String(bb.hour || 14).padStart(2, "0")}:00`);
      return true;
    }
    if (act === "bb-fav") {
      bb.fav = !bb.fav;
      render();
      return true;
    }
    if (act === "bb-switch") {
      bb.switchVal = ds.v || (bb.switchVal === "online" ? "offline" : "online");
      render();
      return true;
    }
    if (act === "bb-select-toggle") {
      bb.subjMenuOpen = !bb.subjMenuOpen;
      render();
      return true;
    }
    if (act === "bb-select-pick") {
      bb.subj = ds.v || "bio";
      bb.subjMenuOpen = false;
      render();
      return true;
    }
    if (act === "bb-multi-toggle") {
      bb.multiMenuOpen = !bb.multiMenuOpen;
      render();
      return true;
    }
    if (act === "bb-multi-pick" || act === "bb-multi-remove") {
      const id = ds.v;
      if (id) {
        const list = Array.isArray(bb.multiSubjs) ? bb.multiSubjs.slice() : [];
        const idx = list.indexOf(id);
        if (act === "bb-multi-remove" || idx >= 0) {
          if (idx >= 0) list.splice(idx, 1);
        } else {
          list.push(id);
        }
        bb.multiSubjs = list;
      }
      render();
      return true;
    }
    if (act === "bb-plan-pick") {
      bb.pickedPlan = ds.v || "month10k";
      render();
      return true;
    }
    if (act === "bb-quiz-pick") {
      bb.quizOpt = Number(ds.i != null ? ds.i : ds.v) || 0;
      render();
      return true;
    }
    if (act === "bb-cancel-demo") {
      bb.cancelDemoUndone = !bb.cancelDemoUndone;
      render();
      return true;
    }
    if (act === "bb-toast-dismiss") {
      bb.previewToastDismissed = !bb.previewToastDismissed;
      render();
      return true;
    }
    if (act === "bb-demo-toast") {
      toast("Событие UI-Kit (без API)");
      notify("UI-Kit · Превью", "Действие сработало локально в stateless-режиме");
      return true;
    }
    if (act === "bb-icon-play") {
      bb.activeIcon = ds.icon || "";
      render();
      return true;
    }
    if (act === "bb-icons-wave") {
      toast("Анимация 40 иконок");
      return true;
    }
    if (act === "bb-sakha-toggle") {
      bb.sakhaSent = !bb.sakhaSent;
      render();
      return true;
    }
    if (act === "bb-sakha-medallion") {
      bb.sakhaKunOn = !bb.sakhaKunOn;
      render();
      return true;
    }
    if (act === "bb-sakha-diamond") {
      bb.sakhaStarOn = !bb.sakhaStarOn;
      render();
      return true;
    }
    if (act === "bb-faq-toggle") {
      const idx = Number(ds.i);
      bb.faqOpen = bb.faqOpen === idx ? -1 : idx;
      render();
      return true;
    }
    if (act === "bb-cat") {
      bb.cat = ds.v || "all";
      render();
      return true;
    }
    if (act === "bb-cat-clear") {
      bb.cat = "all";
      bb.catQ = "";
      render();
      return true;
    }
    if (act === "bb-hero-primary") {
      bb.heroSubmitted = !bb.heroSubmitted;
      render();
      return true;
    }
    if (act === "bb-hero-beta") {
      bb.heroBetaOn = !bb.heroBetaOn;
      render();
      return true;
    }
    if (act === "bb-copy-token") {
      const txt = ds.copy || "";
      if (txt) copy(txt);
      toast("Скопировано: " + txt.slice(0, 32));
      return true;
    }
    if (act === "bb-logo-copy" || act === "bb-logo-dl") {
      const svg = typeof brandLogoSVG === "function" ? brandLogoSVG(ds.surface || "light", ds.kind || "lockup") : "";
      if (svg) copy(svg);
      toast(act === "bb-logo-dl" ? "SVG сформирован" : "SVG скопирован");
      return true;
    }
    if (act === "bb-app-role") {
      bb.appRole = ds.role === "tutor" ? "tutor" : "student";
      render();
      return true;
    }
    if (act === "bb-market-req-toggle") {
      bb.marketDemoAccepted = !bb.marketDemoAccepted;
      render();
      return true;
    }
    if (act === "bb-reduced-toggle" || act === "bb-reduced-motion") {
      bb.reducedMotion = !bb.reducedMotion;
      try {
        if (typeof document !== "undefined" && document.documentElement && document.documentElement.classList) {
          document.documentElement.classList.toggle("reduced-motion", !!bb.reducedMotion);
        }
      } catch (e) { /* ignore */ }
      render();
      return true;
    }
    if (act === "bb-mask-sample") {
      const rawP = ds.phone || "+7 (914) 210-05-11";
      const rawTg = ds.tg || "@aytal_bio";
      bb.maskPhone = typeof formatPhoneMask === "function" ? (formatPhoneMask(rawP) || rawP) : rawP;
      bb.maskTg = typeof formatTelegramContact === "function" ? (formatTelegramContact(rawTg) || rawTg) : rawTg;
      bb.maskMax = ds.max || "aytal_ege";
      render();
      return true;
    }
    if (act === "bb-pay-threshold") {
      bb.payInitialDone = ds.v === "repeat";
      render();
      return true;
    }
    if (act === "bb-pay-method") {
      bb.payMethod = ["sbp", "card", "tpay"].includes(ds.v) ? ds.v : "sbp";
      render();
      return true;
    }
    if (act === "bb-pay-state") {
      bb.payState = ["frozen", "captured", "refunded"].includes(ds.v) ? ds.v : "frozen";
      render();
      return true;
    }
    if (act === "bb-essay-tab") {
      const idx = Number(ds.idx !== undefined ? ds.idx : ds.v);
      bb.essayOpenIdx = Number.isInteger(idx) ? Math.max(0, Math.min(2, idx)) : 0;
      render();
      return true;
    }
    if (act === "bb-bal-toggle") {
      bb.balFunded = bb.balFunded === false;
      render();
      return true;
    }
    if (act === "bb-chart-style") {
      bb.chartStyle = ds.v || "sticks";
      render();
      return true;
    }
    if (act === "bb-chart-data") {
      bb.chartDataset = ds.v || "income";
      render();
      return true;
    }
    if (act === "bb-chart-bar") {
      bb.chartActiveIdx = Math.max(0, Math.min(59, Math.round(Number(ds.idx) || 0)));
      render();
      return true;
    }
    if (act === "bb-line-pt") {
      bb.linePtIdx = Math.max(0, Math.min(59, Math.round(Number(ds.idx) || 0)));
      render();
      return true;
    }
    if (act === "bb-chart-lines") {
      const n = Math.round(Number(ds.lines != null ? ds.lines : ds.v) || 1);
      bb.chartLines = Math.max(1, Math.min(20, n));
      render();
      return true;
    }
    if (act === "bb-chart-pts") {
      const n = Math.round(Number(ds.pts != null ? ds.pts : ds.v) || 7);
      bb.chartPoints = Math.max(5, Math.min(36, n));
      if ((Number(bb.linePtIdx) || 0) >= bb.chartPoints) bb.linePtIdx = bb.chartPoints - 1;
      if ((Number(bb.chartActiveIdx) || 0) >= bb.chartPoints) bb.chartActiveIdx = bb.chartPoints - 1;
      render();
      return true;
    }
    if (act === "bb-donut-ds") {
      bb.donutDataset = ds.v || "channels";
      bb.donutSliceIdx = 0;
      render();
      return true;
    }
    if (act === "bb-donut-slice") {
      bb.donutSliceIdx = Math.max(0, Math.min(3, Number(ds.idx) || 0));
      render();
      return true;
    }
    if (act === "bb-tbl-cols") {
      const c = Math.round(Number(ds.cols != null ? ds.cols : ds.v));
      bb.tableCols = Number.isFinite(c) ? Math.max(1, Math.min(15, c)) : 5;
      render();
      return true;
    }
    if (act === "bb-tbl-preset") {
      const p = ds.preset || ds.v || "requests";
      bb.tablePreset = ["requests", "students", "payouts", "exams", "admin"].includes(p) ? p : "requests";
      bb.tableFilter = "all";
      bb.tableSearch = "";
      render();
      return true;
    }
    if (act === "bb-tbl-confirm") {
      const rowId = ds.id;
      if (!rowId) return false;
      if (!bb.confirmedRows || typeof bb.confirmedRows !== "object") bb.confirmedRows = {};
      if (bb.confirmedRows[rowId]) delete bb.confirmedRows[rowId];
      else bb.confirmedRows[rowId] = true;
      render();
      return true;
    }
    if (act === "bb-tbl-filter") {
      bb.tableFilter = ds.v || "all";
      if (ds.clearQ) bb.tableSearch = "";
      render();
      return true;
    }
    if (act === "bb-shell-role") {
      bb.shellRole = (ds.role === "student" || ds.v === "student") ? "student" : "tutor";
      render();
      return true;
    }
    if (act === "bb-pipe-filter") {
      const v = ds.v || "all";
      bb.pipeFilter = ["all", "postgres", "polars", "airflow", "kafka"].includes(v) ? v : "all";
      render();
      return true;
    }
    if (act === "bb-cal-tz") {
      bb.calTz = ds.v === "UTC+3" ? "UTC+3" : "UTC+9";
      render();
      return true;
    }
    if (act === "bb-admin-tab") {
      const v = ds.v || "moderation";
      bb.adminTab = ["moderation", "payouts", "system"].includes(v) ? v : "moderation";
      render();
      return true;
    }
    if (act === "bb-role-switch") {
      const r = ds.role || ds.v || "admin";
      bb.adminRole = ["student", "tutor", "admin"].includes(r) ? r : "admin";
      if (r === "student" || r === "tutor") bb.dualRole = r;
      render();
      return true;
    }
    if (act === "bb-dual-role") {
      bb.dualRole = ds.v === "tutor" ? "tutor" : "student";
      render();
      return true;
    }
    return false;
  }

  function handleInput(el, ui, hooks) {
    if (!el) return false;
    hooks = hooks || {};
    const bb = ensureBrandbookState(ui || {});
    const render = typeof hooks.render === "function" ? hooks.render : (() => {});
    const id = el.id || "";
    const act = el.dataset && el.dataset.a;

    if (id === "bb-catalog-q") {
      bb.catQ = String(el.value || "");
      render();
      return true;
    }
    if (act === "bb-tbl-q" || id === "bb-tbl-q" || id === "bb-admin-tbl-q" || id === "bb-dual-tbl-q") {
      bb.tableSearch = String(el.value || "");
      render();
      return true;
    }
    if (id === "bb-mask-phone") {
      const raw = String(el.value || "");
      const digits = raw.replace(/\D+/g, "");
      bb.maskPhone = (typeof formatPhoneMask === "function" && digits.length >= 10) ? (formatPhoneMask(raw) || raw) : raw;
      render();
      return true;
    }
    if (id === "bb-mask-tg") {
      bb.maskTg = String(el.value || "");
      render();
      return true;
    }
    if (id === "bb-mask-max") {
      bb.maskMax = String(el.value || "");
      render();
      return true;
    }
    if (id === "bb-vp-slider") {
      applyBrandbookViewport(ui, el.value);
      return true;
    }
    if (id.indexOf("bb-hour-range") === 0) {
      bb.hour = Math.max(10, Math.min(20, Math.round(Number(el.value) || 14)));
      render();
      return true;
    }
    return false;
  }

  EGE.views = EGE.views || {};
  EGE.views.brandbook = {
    brandbookPaneHTML,
    viewBrandbook,
    viewFees,
    applyBrandbookViewport,
    handleAction,
    handleInput
  };
})();
