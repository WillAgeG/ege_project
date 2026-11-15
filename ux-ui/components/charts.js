/* Визуализация данных UI Kit (EGE.charts): палочные графики (6 стилей + тренд), линейный график, кольцевая диаграмма и таблица. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc } = EGE.utils || { esc: (s) => String(s == null ? "" : s) };

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

  /* Монотонная гладкая кривая Безье по контрольным узлам графика. */
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

  /* Универсальный график с палочками (sticks, lollipop, capsule, dual, range, combo, classic). */
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

  /* Линейный график с областью и интерактивными узлами (.bb-line-chart). */
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

  /* Кольцевая диаграмма (.bb-donut-chart) с ровными butt-стыками и внешним кольцом. */
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

  /* Интерактивная таблица на 3 / 5 / 7 колонок с фильтрами и кнопками WA / Telegram / MAX. */
  function dataTableHTML(opts) {
    opts = opts || {};
    const cols = [3, 5, 7].includes(Number(opts.cols)) ? Number(opts.cols) : 5;
    const filter = opts.filter || "all";
    const query = String(opts.query || "").trim().toLowerCase();
    const renderMessengerLinks =
      (typeof opts.renderMessengerLinks === "function" && opts.renderMessengerLinks) ||
      (root.EGE && root.EGE.kit && typeof root.EGE.kit.messengerLinksHTML === "function" && root.EGE.kit.messengerLinksHTML) ||
      null;

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
        const msgBar = renderMessengerLinks
          ? renderMessengerLinks({
              entity: { id: r.id, name: r.student, whatsapp: r.whatsapp, telegram: r.telegram, maxHandle: r.maxHandle },
              message: `Здравствуйте, ${r.student}! Напоминаю о занятии (${r.subject}, ${r.slot}) через Вектор ЕГЭ.`,
              primaryLabel: "WA",
              compact: true
            })
          : "";
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

  EGE.charts = {
    CHART_STYLE_META,
    chartDatasetBars,
    smoothTrendPath,
    stickChartHTML,
    lineChartHTML,
    DONUT_DATASETS,
    donutChartHTML,
    TABLE_ROWS,
    dataTableHTML
  };
})();
