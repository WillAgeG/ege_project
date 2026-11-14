/* Страницы /brandbook (дизайн-система, иконки, границы и адаптив) и /fees (условия оплаты 5%). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { icon, BRAND_MARK_HTML, getIconCatalog } = EGE.ui;
  const {
    feeSplitHTML,
    bidBtnLabelHTML,
    priceHeadlineHTML,
    priceDiffTagsHTML,
    sliderTicksHTML,
    BB_DAYS,
    bbDayObj,
    hhSelectHTML
  } = EGE.hh;

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
      previewToastDismissed: false
    });
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
          <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
          <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
          <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
          <button type="button" class="btn" disabled>Неактивна</button>
          <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное">${icon(favOn ? "heartFill" : "heart")}</button>
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
              <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="В избранное">${icon(favOn ? "heartFill" : "heart")}</button>
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
          <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
        </div>
      </article>
    </div>`;
  }

  function logoSectionHTML() {
    return `<section class="land-sec" id="bb-logo">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Знак бренда · Охранное поле · Размеры</div>
          <h2 class="h2">Логотип, безопасная зона и предметные акценты</h2>
        </div>
        <span class="bb-spec-pill">min 32×32 px · safe pad 8 px</span>
      </div>
      <div class="bb-logo-grid">
        <div class="card pad stack" style="gap:8px">
          <span class="small muted">На светлом фоне (#FFFFFF / #F4F5F7)</span>
          <div class="bb-logo-stage" style="background:#ffffff;color:#141517">
            <div class="bb-logo-safe"><div class="brand-lockup">${BRAND_MARK_HTML}<div class="brand-text"><div class="brand-name" style="color:#141517">Вектор ЕГЭ</div><div class="brand-sub" style="color:#7c828e">Подготовка и репетиторы</div></div></div></div>
          </div>
          <span class="small muted">Топбар: 36×36 px · авторизация: 52×52 px · favicon: 32×32 px.</span>
        </div>
        <div class="card pad stack" style="gap:8px">
          <span class="small muted">На чёрном OLED (#000000 / #16181D)</span>
          <div class="bb-logo-stage" style="background:#000000;color:#ffffff">
            <div class="bb-logo-safe"><div class="brand-lockup">${BRAND_MARK_HTML}<div class="brand-text"><div class="brand-name" style="color:#ffffff">Вектор ЕГЭ</div><div class="brand-sub" style="color:#8b909d">Dark OLED hh.ru</div></div></div></div>
          </div>
          <span class="small muted">Градиент #1652C8 → #2F7CFF всегда читается без рамки.</span>
        </div>
        <div class="card pad stack" style="gap:8px">
          <span class="small muted">Предметы + копируемые токены из <code>tokens.json</code></span>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button type="button" class="chip" style="border:1px solid var(--line);cursor:pointer;background:rgba(124,58,237,.12);color:#7c3aed" data-a="bb-copy-token" data-copy="#7C3AED · --c-bio">Биология · #7C3AED</button>
            <button type="button" class="chip" style="border:1px solid var(--line);cursor:pointer;background:rgba(2,132,199,.12);color:#0284c7" data-a="bb-copy-token" data-copy="#0284C7 · --c-chem">Химия · #0284C7</button>
            <button type="button" class="chip" style="border:1px solid var(--line);cursor:pointer;background:rgba(234,88,12,.12);color:#ea580c" data-a="bb-copy-token" data-copy="#EA580C · --c-rus">Русский · #EA580C</button>
          </div>
          <p class="small muted">Нажми на любой цвет или токен в палитре ниже — HEX и CSS-переменная сразу скопируются.</p>
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
            <button type="button" class="btn sm${isPick ? " is-confirmed" : " soft"}" data-a="bb-plan-pick" data-v="${id}" style="margin-top:12px;width:100%">${isPick ? "✓ Выбран в макете (.picked)" : "Примерить .picked"}</button>
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
                <span class="toast-side-row">
                  <span class="bb-pulse-dot" style="margin-top:5px;flex:0 0 auto"></span>
                  <span class="toast-side-copy">
                    <b>Предложение передано преподавателю</b>
                    <span>Ставка ${bb.price.toLocaleString("ru-RU")} ₽/ч на ${String(bb.hour).padStart(2, "0")}:00 отправлена — уведомим об ответе</span>
                  </span>
                  <button type="button" class="toast-close" data-a="bb-preview-toast-close" aria-label="Убрать уведомление">×</button>
                </span>
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
          <div class="eyebrow">Контроль качества UI · Do / Don&#39;t</div>
          <h2 class="h2">Как правильно ✓ и как делать нельзя ✕</h2>
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

    const specRules = [
      ["Контейнер страниц / лендинга", "max-width: 1140 px · 0 px переполнения", ""],
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

    return `<div class="land-page" id="brandbook-page">
      <header class="land-top">
        <div class="brand-lockup">
          ${BRAND_MARK_HTML}
          <div class="brand-text">
            <div class="brand-name">Вектор ЕГЭ · Брендбук</div>
            <div class="brand-sub">UX/UI дизайн-система в стиле hh.ru</div>
          </div>
        </div>
        <nav class="land-links" aria-label="Разделы брендбука">
          <a href="#bb-logo" data-a="land-scroll" data-target="bb-logo">Лого</a>
          <a href="#bb-sliders" data-a="land-scroll" data-target="bb-sliders">Ползунки</a>
          <a href="#bb-forms" data-a="land-scroll" data-target="bb-forms">Формы</a>
          <a href="#bb-cards-sys" data-a="land-scroll" data-target="bb-cards-sys">Тарифы</a>
          <a href="#bb-buttons" data-a="land-scroll" data-target="bb-buttons">Иконки</a>
          <a href="#bb-study-states" data-a="land-scroll" data-target="bb-study-states">Состояния</a>
          <a href="#bb-responsive" data-a="land-scroll" data-target="bb-responsive">Адаптив</a>
        </nav>
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="landing">На /landing</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="tests">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
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

      ${logoSectionHTML()}

      <section class="land-sec" id="bb-surfaces">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Поверхности · Ниже и выше рынка</div>
            <h2 class="h2">Белый, Чёрный и Синий фон + прочерк / экспертная ставка</h2>
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
        <div class="bb-cols cols-3">
          <div class="bb-pane is-light">
            <span class="small muted">Белый фон · #FFFFFF / #F4F5F7</span>
            <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
            <div class="hh-diff-strip">
              ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
            </div>
            <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
          </div>
          <div class="bb-pane is-dark">
            <span class="small muted">Чёрный фон · #000000 / #16181D</span>
            <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
            <div class="hh-diff-strip">
              ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: market, offerPrice: bb.price, qualBadge: "К.т.н. · эксперт ВсОШ" })}
            </div>
            <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
          </div>
          <div class="bb-pane is-blue">
            <span class="small">Синий фон · #0070FF → #0055D4</span>
            <div class="hh-price-row">${priceHeadlineHTML(market, bb.price, true)}</div>
            <span class="small" style="opacity:.9">${bb.price > market ? "Выше рынка · к.т.н., победители олимпиад и ЕГЭ 95+" : (bb.price < market ? `Экономия ${(market - bb.price).toLocaleString("ru-RU")} ₽ от средней по рынку` : "Равно средней ставке по рынку")}</span>
            <div class="row" style="gap:8px;flex-wrap:wrap;margin-top:auto">
              <button type="button" class="btn white${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
              <button type="button" class="btn blue-ghost" data-a="go" data-v="landing">К сайту /landing</button>
            </div>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-sliders">
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
      </section>

      <section class="land-sec" id="bb-motion">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Переходы и микровзаимодействия</div>
            <h2 class="h2">Анимации отклика, подъёма кнопок, лайка и смены статуса</h2>
          </div>
        </div>
        <div class="bb-motion-grid">
          <div class="bb-motion-card">
            <div class="row between"><b>01 · Синий → Зелёный «Подтверждено»</b><span class="bb-spec-pill confirm">380 ms</span></div>
            <p class="small muted">Нажатие переводит CTA из #0070FF в изумрудный --confirm и сразу показывает сбоку уведомление об отправке.</p>
            <div class="stack" style="gap:6px">
              <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" id="bb-motion-bid-btn" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
              <p class="small${bb.sent ? "" : " muted"}" data-bb="bid-status" style="margin:0;line-height:1.35;${bb.sent ? "color:var(--confirm);font-weight:600" : ""}">${bb.sent ? "✓ Подтверждено · уведомление показано сбоку" : "Обычное состояние CTA · #0070FF"}</p>
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
              <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Пружина избранного">${icon(favOn ? "heartFill" : "heart")}</button>
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
      </section>

      <section class="land-sec" id="bb-buttons">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Все элементы интерфейса</div>
            <h2 class="h2">Как выглядит каждая кнопка, сердечко и оранжевые уведомления</h2>
          </div>
        </div>
        <div class="bb-btn-matrix">
          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Основные кнопки CTA</b><span class="bb-spec-pill">h 42–46 px · r 12</span></div>
            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
              <button type="button" class="btn soft" data-a="bb-chip">Подробнее</button>
              <button type="button" class="btn ghost" data-a="bb-chip">Фильтры</button>
              <button type="button" class="btn" disabled>Неактивна</button>
            </div>
            <span class="small muted">Минимум 8 px между кнопками; при наведении кнопки приподнимаются на 2 px и не сливаются с белой карточкой.</span>
          </div>

          <div class="card pad stack" style="gap:10px">
            <div class="row between"><b class="h3">Компактные 32 px и пиллы</b><span class="bb-spec-pill">h 32 px · gap 6 px</span></div>
            <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn sm${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid" data-bb-short="1">${bb.sent ? "✓ Подтверждено" : "Предложить"}</button>
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
              <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное">${icon(favOn ? "heartFill" : "heart")}</button>
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
              <b>Полный набор иконок (36 шт. · 38×38 px и 32×32 px)</b>
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
      </section>

      <section class="land-sec" id="bb-bounds">
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
                  <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Проверка угла">${icon(favOn ? "heartFill" : "heart")}</button>
                </div>
              </div>
              <div class="row" style="gap:0;align-items:center">
                <button type="button" class="btn sm${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid" data-bb-short="1">${bb.sent ? "✓ Подтверждено" : "Предложить"}</button>
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
                    <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное на мобилке">${icon(favOn ? "heartFill" : "heart")}</button>
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
                  <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" style="width:100%" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
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
      </section>

      ${formsSectionHTML(bb)}

      ${cardsAndOverlaysSectionHTML(bb)}

      <section class="land-sec" id="bb-fonts">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Шрифты · Inter + IBM Plex Mono · Отступы и радиусы</div>
            <h2 class="h2">Типографика как на сайте hh.ru + шкала ритма</h2>
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
      </section>

      ${studyAndStatesSectionHTML(bb)}

      ${doDontSectionHTML()}

      <section class="land-sec" id="bb-responsive">
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
                    <button type="button" class="fav-btn bb-heart-pop" data-a="bb-fav" aria-pressed="${favOn}" aria-label="Избранное в стенде">${icon(favOn ? "heartFill" : "heart")}</button>
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
                    <button type="button" class="btn${bb.sent ? " is-confirmed" : ""}" data-a="bb-bid">${bidBtnLabelHTML(bb.sent, bb.price)}</button>
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
              <p class="small muted">Контейнер 1 200 px, боковое уведомление справа, а @container держит ритм внутри любых сеток.</p>
            </div>
          </div>
        </div>
      </section>

      <section class="land-sec" id="bb-compare">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">UI Kit в действии</div>
            <h2 class="h2">Полный набор компонентов в Белом и Чёрном виде</h2>
          </div>
        </div>
        <div class="${mode === "both" ? "bb-cols" : "stack"}">${panes}</div>
      </section>

      <div class="hh-blue-banner">
        <div class="stack" style="gap:4px;max-width:60ch">
          <b style="font-size:20px">Готово по брендбуку — посмотри собранный сайт /landing</b>
          <span class="small">На странице /landing применены именно эти шрифты, палитра (Серый + Синий + Оранжевый), ползунок-палка, степпер ±100 ₽ и границы.</span>
        </div>
        <button type="button" class="btn white" data-a="go" data-v="landing">Открыть сайт /landing →</button>
      </div>
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
        <div class="brand-lockup">
          ${BRAND_MARK_HTML}
          <div class="brand-text">
            <div class="brand-name">Вектор ЕГЭ · Оплата</div>
            <div class="brand-sub">Условия оплаты и сервисный сбор</div>
          </div>
        </div>
        <div class="land-top-actions">
          <button type="button" class="btn ghost sm" data-a="go" data-v="${inside ? "market" : "landing"}">${inside ? "← К репетиторам" : "← На главную"}</button>
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside ? `<button type="button" class="btn sm" data-a="go" data-v="tests">В кабинет</button>` : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
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
