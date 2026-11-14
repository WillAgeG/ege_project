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
    sakhaButtonsHTML,
    marqueePillsHTML,
    rateBenchCardHTML,
    trustStripHTML,
    aiErrorBoxesHTML,
    reviewCardHTML,
    faqListHTML,
    blueBannerHTML
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
    hhSelectHTML
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
    "bb-sliders": "motion",
    "bb-motion": "motion",
    "bb-bounds": "motion",
    "bb-responsive": "motion",
    "bb-landing-kit": "sections",
    "bb-dodont": "sections",
    "bb-compare": "brand"
  };

  const BB_SUBJECTS = [
    { id: "bio", label: "Биология · ЕГЭ 2027", meta: "Естественные" },
    { id: "chem", label: "Химия · ЕГЭ 2027", meta: "Олимпиады и ЕГЭ" },
    { id: "rus", label: "Русский язык · ЕГЭ", meta: "Сочинение и база" },
    { id: "design", label: "UX/UI и Моушен", meta: "Проектный трек" }
  ];

  function ensureBrandbookState(ui) {
    return ui.brandbook || (ui.brandbook = {
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
      cat: "all",
      catQ: "",
      faqOpen: 0
    });
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
        ${hits.map((it) => `<article class="bb-catalog-card">
          <div class="stack" style="gap:4px">
            <div class="row between" style="gap:6px;align-items:flex-start">
              <b style="font-size:13.5px;line-height:1.25">${esc(it.title)}</b>
              <span class="bb-spec-pill">#${esc(it.targetId)}</span>
            </div>
            <p class="small muted" style="margin:0;line-height:1.35">${esc(it.desc)}</p>
          </div>
          <div class="stack" style="gap:6px">
            <code class="bb-catalog-code">${esc(it.api)}</code>
            <div class="row between" style="gap:6px">
              <button type="button" class="btn soft sm" data-a="bb-copy-token" data-copy="${esc(it.api)}">Копировать API</button>
              <button type="button" class="btn ghost sm" data-a="land-scroll" data-target="${esc(it.targetId)}">К разделу ↓</button>
            </div>
          </div>
        </article>`).join("")}
      </div>` : `<div class="empty"><b>По запросу «${esc(curQ)}» компоненты не найдены</b><span>Попробуй: Hero, Оһуор, WCAG, /market, slider или Do/Don't.</span><button type="button" class="btn soft sm" data-a="bb-cat-clear">Показать все разделы</button></div>`}
    </section>`;
  }

  function brandbookPaneHTML(isDark, bb) {
    const cls = isDark ? "is-dark" : "is-light";
    const title = isDark ? "Чёрный вид (Dark · OLED hh.ru)" : "Белый вид (Light · hh.ru)";
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
          <button type="button" class="bb-filter-active" data-a="bb-chip">${bb.chipOn ? "UX/UI и Моушен ×" : "+ Направление"}</button>
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
              <h3 class="h3" style="font-size:17px">Репетитор · UX/UI и Моушен</h3>
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
        </div>
        <div class="card pad stack" style="gap:12px">
          <div class="stack" style="gap:10px">
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
              <span class="label">Вход и выбор роли по умолчанию (.hh-seg · authCard)</span>
              <div class="hh-seg" role="group" aria-label="Демо выбора роли при входе">
                <button type="button" data-a="bb-app-role" data-role="student" aria-pressed="${(bb.appRole || "student") !== "tutor"}">${icon("users")} Как ученик</button>
                <button type="button" data-a="bb-app-role" data-role="tutor" aria-pressed="${bb.appRole === "tutor"}">${icon("award")} Как преподаватель</button>
              </div>
              <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:4px">
                <button type="button" class="btn ghost sm" data-a="auth-modal-open">Продолжить через Google</button>
                <button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>
              </div>
              <span class="hint">По умолчанию выбрано «Как ученик». Обе кнопки входа сохраняют выбранную роль перед рендером кабинета.</span>
            </div>
            <div class="field">
              <span class="label">Сегмент-переключатель (.switch)</span>
              <div class="switch" role="group" aria-label="Формат в брендбуке">
                <button type="button" data-a="bb-switch" data-v="online" aria-pressed="${sw === "online"}">Онлайн</button>
                <button type="button" data-a="bb-switch" data-v="offline" aria-pressed="${sw === "offline"}">Очно</button>
                <button type="button" data-a="bb-switch" data-v="all" aria-pressed="${sw === "all"}">Любой</button>
              </div>
            </div>
          </div>
          <div class="field">
            <label for="bb-demo-notes">Комментарий ученика (.textarea)</label>
            <textarea class="textarea" id="bb-demo-notes" rows="2" placeholder="Разобрать задание №28 (генетика) и пробник…"></textarea>
          </div>
          <div class="notice info"><b>Информационное плашко-уведомление (.notice.info)</b><span class="small">Используется для нейтральных подсказок без давления и красных алертов.</span></div>
        </div>
      </div>
    </section>`;
  }

  function cardsAndOverlaysSectionHTML(bb) {
    const picked = bb.pickedPlan || "month10k";
    const plans = [
      ["free", "0 ₽", "Бесплатная", "Базовый доступ", ["База анкет и поиск", "Прямые отклики по ставке"], ""],
      ["trial5k", "5 000 ₽", "Пробник", "Рекомендуемый", ["Пакет часов на балансе", "Защита оплаты до подтверждения"], "featured"],
      ["month10k", "10 000 ₽", "Месяц под ключ", "Супер-подписка", ["Особый оттенок .super", "Максимум приоритетных откликов"], "featured super"]
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
      <div class="grid-3">
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
    const tabItems = tutorSide
      ? [
          { ico: "award", label: "Заявки", active: true, badge: "2" },
          { ico: "users", label: "Репетиторы" },
          { ico: "book", label: "Справочник" },
          { ico: "list", label: "Тесты" },
          { ico: "cal", label: "Учёба" }
        ]
      : [
          { ico: "list", label: "Тесты", active: true },
          { ico: "users", label: "Репетиторы" },
          { ico: "book", label: "Справочник" },
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
            <button type="button" class="btn gold sm" data-a="bb-demo-toast">${icon("spark")} Сөп · Актуален сегодня</button>
            <button type="button" class="btn ${accepted ? "confirm" : ""} sm" data-a="bb-market-req-toggle">${accepted ? "✓ Подтверждено" : "✓ Подтвердить"}</button>
          </div>
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
            ${accepted ? `<button type="button" class="btn confirm sm" data-a="bb-demo-toast">${icon("msg")}<span>Написать</span></button>` : `<button type="button" class="btn soft sm" data-a="bb-market-req-toggle">Тест: подтвердить</button>`}
            <button type="button" class="btn ${accepted ? "ghost" : "danger bb-btn-adaptive"} sm" data-a="bb-market-req-toggle">${accepted ? "Сменить репетитора" : "Отменить"}</button>
          </div>
        </div>
      </div>

      <div class="bb-nav-arch">
        <div class="stack" style="gap:10px">
          <aside class="bb-side-mock" aria-label="Архитектура боковой панели кабинета (.side)">
            ${brandLockupHTML({ tag: tutorSide ? "Препод · ЕГЭ" : "ЕГЭ 2027", sub: "Десктопный .side · 256 px" })}
            ${tabItems.map((it) => `<div class="bb-side-item${it.active ? " on" : ""}"><span>${icon(it.ico)} ${it.label}</span>${it.badge ? `<span class="chip notif">${it.badge}</span>` : `<span class="chip ${it.label === "Справочник" ? "gold" : ""}">${it.label === "Справочник" ? "5-tab" : "·"}</span>`}</div>`).join("")}
            <div class="small muted" style="padding-top:6px;border-top:1px solid var(--line)">На ≤ 960 px сайдбар сворачивается в 5-вкладочный <code>.tabbar</code> со «Справочником» — без дубля кнопки в шапке.</div>
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
                  ${priceDiffTagsHTML({ tutorPrice: 1200, marketPrice: 2000, offerPrice: bb.price, qualBadge: "Мед. олимпиады · 94+" })}
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
        <button type="button" class="btn confirm sm" data-a="bb-demo-toast">${icon("msg")}<span>Написать (единая .btn.confirm)</span></button>
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
            <h2 class="h2">Якутские кнопки в форме узоров Күн Оһуор, Сулус и Харысхал</h2>
          </div>
          <button type="button" class="bb-spec-pill" data-a="bb-copy-token" data-copy="EGE.kit.sakhaButtonsHTML()">Копировать EGE.kit.sakhaButtonsHTML()</button>
        </div>
        <div class="${mode === "both" ? "bb-cols" : "stack"}">${sakhaCards}</div>
      </section>`;
    }
    return out;
  }

  function landingKitSectionHTML(bb) {
    const faqOpen = Number.isInteger(bb.faqOpen) ? bb.faqOpen : 0;
    const faqs = [
      { q: "Чем отличается от обычных анкет?", a: "Показываем честную рыночную цену рядом с твоей ставкой и сразу выводим подтверждённую запись через единую .btn.confirm." },
      { q: "Как устроены кнопки на /landing и /brandbook?", a: "Ни одного дубля: все секции берут разметку из единого каталога EGE.kit и единых токенов ux-ui/styles/base.css." }
    ];
    const demoPills = marqueePillsHTML({
      universe: [
        { subject: "design", label: "UX/UI и Моушен", meta: "от 1 200 ₽" },
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
          <div class="row between"><b>04 · Карточка защиты баланса и верификации</b><span class="bb-spec-pill">.verified-badge / .tutor-perk-card</span></div>
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
          <div class="row between"><b>06 · Золотой акцент Саха (#C59B5F) · «Вектор ЕГЭ · твоя ставка» и «Бета-тест»</b><span class="bb-spec-pill">.btn.gold / .savings-bar-fill.gold-fill</span></div>
          <div class="stack" style="gap:6px">
            <div class="row between small"><span class="savings-gold-label">${icon("spark")} <span>Вектор ЕГЭ · твоя ставка</span></span><b class="num savings-gold-txt">27 000 ₽/мес</b></div>
            <div class="savings-bar-track"><div class="savings-bar-fill gold-fill" style="width:78%"></div></div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            <button type="button" class="btn gold sm" data-a="go" data-v="landing">${icon("spark")}<span>Попробовать бета-тест</span></button>
            <span class="chip gold">Саха золото #C59B5F · 7.33:1 AAA</span>
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

    const iconCatalog = getIconCatalog(dark);
    const activeIconItem = bb.activeIcon ? iconCatalog.find((it) => it[0] === bb.activeIcon) : null;
    const catHits = filterCatalogItems(bb);
    const hasFilter = (bb.cat && bb.cat !== "all") || String(bb.catQ || "").trim().length > 0;
    const matchTargetIds = new Set(catHits.map((it) => it.targetId));
    const showSec = (id) => {
      if (!hasFilter) return true;
      if (matchTargetIds.has(id)) return true;
      if (!String(bb.catQ || "").trim() && bb.cat && bb.cat !== "all") {
        return BB_SECTION_CATS[id] === bb.cat;
      }
      return false;
    };

    const specRules = [
      ["Контейнер страниц / лендинга", "max-width: 1260 px (≥1360 px: 1340 px) · 0 px переполнения", ""],
      ["Hero-баннер hh.kz × Ленские столбы", "465–495 px (моб. 430 px) · 2 CTA · светлый ским", ""],
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
      ["Золотой CTA (--gold)", "#141517", "#C59B5F", "7.33:1", "AAA · Попробовать бета-тест", "aaa"],
      ["Золотой текст ставок", "#8C6327", "#FFFFFF", "4.92:1", "AA · Вектор ЕГЭ ставка", "aa"],
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
      ["bb-sliders", "Ползунки"],
      ["bb-motion", "Моушен и Z-index"],
      ["bb-bounds", "Границы 390 px"],
      ["bb-responsive", "Адаптив"],
      ["bb-landing-kit", "Витрина"],
      ["bb-dodont", "Do/Don't и тексты"],
      ["bb-compare", "Light vs Dark"]
    ];

    return `<div class="land-page${bb.reducedMotion ? " is-reduced" : ""}" id="brandbook-page">
      <header class="land-top">
        ${brandLockupHTML({ tag: "Брендбук", sub: "UX/UI дизайн-система в стиле hh.ru" })}
        <nav class="land-links" aria-label="Разделы брендбука">
          <a href="#bb-catalog" data-a="land-scroll" data-target="bb-catalog">Каталог</a>
          <a href="#bb-logo" data-a="land-scroll" data-target="bb-logo">Лого</a>
          <a href="#bb-surfaces" data-a="land-scroll" data-target="bb-surfaces">Цвета</a>
          <a href="#bb-hero-banner" data-a="land-scroll" data-target="bb-hero-banner">Hero Ленские</a>
          <a href="#bb-yakutia" data-a="land-scroll" data-target="bb-yakutia">Узоры Саха</a>
          <a href="#bb-market-app" data-a="land-scroll" data-target="bb-market-app">/market</a>
          <a href="#bb-sliders" data-a="land-scroll" data-target="bb-sliders">Ползунки</a>
          <a href="#bb-dodont" data-a="land-scroll" data-target="bb-dodont">Правила</a>
        </nav>
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="landing">На /landing</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="${ctx.ui && ctx.ui.role === "tutor" ? "cabinet" : "tests"}">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <section class="card pad-lg stack" style="gap:14px">
        <div class="row between" style="gap:12px;flex-wrap:wrap">
          <div class="stack" style="gap:6px">
            <div class="eyebrow">UI Kit &amp; Brandbook · hh.ru</div>
            <h1 class="h1">Дизайн-система: Белый, Чёрный, Синий + переходы и границы</h1>
            <p class="lead">Единые правила пространства, видимых границ и живых переходов: Синий #0070FF переходит в Зелёный «Подтверждено», «Подробнее» углубляется без сливания с фоном, выше рынка отмечено фиолетовым (высокая квалификация), а уведомления строго оранжевые.</p>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button type="button" class="chip-btn${mode === "both" ? " on" : ""}" data-a="bb-mode" data-v="both">Белый + Чёрный рядом</button>
            <button type="button" class="chip-btn${mode === "light" ? " on" : ""}" data-a="bb-mode" data-v="light">Только белый вид</button>
            <button type="button" class="chip-btn${mode === "dark" ? " on" : ""}" data-a="bb-mode" data-v="dark">Только чёрный вид</button>
          </div>
        </div>
      </section>

      ${catalogNavigatorHTML(bb)}

      <nav class="bb-toc" id="bb-toc" aria-label="Быстрый переход по разделам брендбука">
        ${tocLinks.map(([id, lbl]) => `<a class="bb-toc-link" href="#${id}" data-a="land-scroll" data-target="${id}">${lbl}</a>`).join("")}
      </nav>

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
            <div class="hh-price-stepper compact" style="min-width:240px">
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

      ${showSec("bb-motion") ? `<section class="land-sec" id="bb-motion">
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
              <button type="button" class="btn sakha-pattern${bb.sent ? " is-confirmed" : ""}" id="bb-motion-bid-btn" data-a="bb-bid">${sakhaBidInnerHTML(bb.sent, bb.price)}</button>
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
                <span class="num">09:41 · Вектор ЕГЭ · <span data-bb="day-label">${curDay.full}</span></span>
                <span class="row" style="gap:6px;align-items:center">
                  <span class="chip notif" style="font-size:11px;padding:2px 7px"><span class="bb-pulse-dot"></span>3 ответа</span>
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
                      <b style="font-size:15px">Репетитор · UX/UI и Моушен</b>
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
              <p class="small muted">Тарифы, анкеты, моушен и справочник перестраиваются в 2 равные колонки без пустых дыр.</p>
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
    return `<div class="land-page" id="fees-page">
      <header class="land-top">
        ${brandLockupHTML({ tag: "Оплата", sub: "Условия оплаты и сервисный сбор" })}
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "← К репетиторам" : "← На главную"}</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="${ctx.ui && ctx.ui.role === "tutor" ? "cabinet" : "tests"}">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <section class="card pad-lg stack" style="gap:16px">
        <div class="stack" style="gap:6px">
          <div class="eyebrow">Оплата занятий · Сервисный сбор системы</div>
          <h1 class="h1">Условия оплаты и комиссия за систему</h1>
          <p class="lead">При выборе репетитора ученик ориентируется только на удобное время и свою цену за урок. Комиссия системы 5% учитывается на этапе расчёта оплаты — никаких скрытых доплат сверх ставки ученика нет.</p>
        </div>

        <div class="grid-3">
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip accent" style="justify-self:start">01 · Баланс 5 000 / 10 000 ₽</span>
            <b>Пополнение без сгорания</b>
            <p class="small ink2">Вы пополняете баланс на 5 000 или 10 000 ₽ и расходуете средства по мере подтверждённых занятий.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip confirm" style="justify-self:start">02 · Защита оплаты</span>
            <b>Заморозка после ответа</b>
            <p class="small ink2">Пока преподаватель не подтвердил время и предложенную ставку, деньги не списываются с вашего баланса.</p>
          </div>
          <div class="card pad stack" style="gap:6px;box-shadow:none">
            <span class="chip pro" style="justify-self:start">03 · Фиксированно 5%</span>
            <b>Сервисный сбор системы</b>
            <p class="small ink2">С проведённого занятия 95% получает преподаватель, а 5% составляет сервисный сбор системы.</p>
          </div>
        </div>

        <div class="card pad-lg stack" style="gap:12px;background:var(--surface-2);box-shadow:none">
          <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
            <div class="stack" style="gap:2px">
              <b>Калькулятор при оплате урока</b>
              <span class="small muted">Выбери стоимость часа для точного расчёта:</span>
            </div>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${presets.map((p) => `<button type="button" class="chip-btn${rate === p ? " on" : ""}" data-a="fees-rate" data-rate="${p}">${p.toLocaleString("ru-RU")} ₽</button>`).join("")}
            </div>
          </div>
          <div class="bid-fee-row">${feeSplitHTML(rate, ctx.TDATA)}</div>
          <p class="small muted">С каждой подтверждённой ставки <b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b> расчёт происходит автоматически при оплате урока.</p>
        </div>

        <div class="row" style="gap:10px;flex-wrap:wrap">
          <button type="button" class="btn" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "Выбрать репетитора" : "Перейти к подбору репетиторов"}</button>
          <button type="button" class="btn soft" data-a="go" data-v="brandbook">Открыть Брендбук</button>
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

  EGE.views = EGE.views || {};
  EGE.views.brandbook = {
    brandbookPaneHTML,
    viewBrandbook,
    viewFees,
    applyBrandbookViewport
  };
})();
