/* Визуализация данных UI Kit (EGE.charts): палочные графики (6 стилей + единый SVG тренд), multi-line до 20×30+ и кольцевая диаграмма. */
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
    ["combo", "Тренд", "06 · Палочки + линия тренда (.is-combo)", "Единый SVG: палочки, монотонная кривая Фрича–Карлсона с градиентом и точные узлы без рассинхрона."]
  ];

  /* Палитра из 20 контрастных различимых цветов брендбука Вектор ЕГЭ. */
  const CHART_PALETTE_20 = [
    "#0070ff", "#c59b5f", "#7c3aed", "#16a34a", "#f97316",
    "#0284c7", "#e11d48", "#0d9488", "#d97706", "#6366f1",
    "#db2777", "#65a30d", "#2563eb", "#9333ea", "#dc2626",
    "#0891b2", "#ca8a04", "#4f46e5", "#ea580c", "#059669"
  ];

  function chartDatasetBars(dsId) {
    if (dsId === "scores") {
      return [
        { wd: "Сен", val: "48", minVal: "38", maxVal: "52", num: 48, detail: "Сентябрь · диагностика 48 / 100 б. (коридор 38–52)", pct: 48, benchPct: 55, low: 20, span: 30, gold: false },
        { wd: "Окт", val: "56", minVal: "46", maxVal: "62", num: 56, detail: "Октябрь · +8 б. по блоку клетки (коридор 46–62)", pct: 56, benchPct: 58, low: 26, span: 32, gold: false },
        { wd: "Ноя", val: "64", minVal: "54", maxVal: "70", num: 64, detail: "Ноябрь · 64 / 100 б. (коридор 54–70)", pct: 64, benchPct: 62, low: 32, span: 34, gold: false },
        { wd: "Дек", val: "71", minVal: "62", maxVal: "78", num: 71, detail: "Декабрь · пробник ФИПИ 71 / 100 б. (62–78)", pct: 71, benchPct: 66, low: 38, span: 36, gold: false },
        { wd: "Янв", val: "78", minVal: "68", maxVal: "84", num: 78, detail: "Январь · уверенный рост 78 / 100 б. (68–84)", pct: 78, benchPct: 70, low: 42, span: 38, gold: false },
        { wd: "Фев", val: "86", minVal: "76", maxVal: "92", num: 86, detail: "Февраль · порог медуниверситета 86 / 100 б. (76–92)", pct: 86, benchPct: 74, low: 46, span: 40, gold: true },
        { wd: "Мар", val: "94", minVal: "82", maxVal: "98", num: 94, detail: "Март · 94 / 100 б. (коридор 82–98 б.)", pct: 94, benchPct: 78, low: 50, span: 42, gold: true }
      ];
    }
    if (dsId === "slots") {
      return [
        { wd: "10ч", val: "12", minVal: "6", maxVal: "12", num: 12, detail: "10:00 · 6–12 откликов (утреннее окно)", pct: 54, benchPct: 42, low: 16, span: 36, gold: false },
        { wd: "12ч", val: "15", minVal: "8", maxVal: "15", num: 15, detail: "12:00 · 8–15 откликов (дневной слот)", pct: 68, benchPct: 52, low: 22, span: 42, gold: false },
        { wd: "14ч", val: "19", minVal: "11", maxVal: "19", num: 19, detail: "14:00 · 11–19 откликов (после школы)", pct: 84, benchPct: 64, low: 28, span: 52, gold: true },
        { wd: "16ч", val: "22", minVal: "14", maxVal: "22", num: 22, detail: "16:00 · 14–22 отклика (главный пик дня)", pct: 100, benchPct: 72, low: 34, span: 58, gold: true },
        { wd: "18ч", val: "18", minVal: "10", maxVal: "18", num: 18, detail: "18:00 · 10–18 откликов (вечер Якутска)", pct: 80, benchPct: 66, low: 26, span: 50, gold: true },
        { wd: "19ч", val: "14", minVal: "8", maxVal: "14", num: 14, detail: "19:00 · 8–14 откликов", pct: 62, benchPct: 50, low: 20, span: 40, gold: false },
        { wd: "20ч", val: "9", minVal: "4", maxVal: "9", num: 9, detail: "20:00 · 4–9 откликов (вечернее окно)", pct: 42, benchPct: 38, low: 14, span: 30, gold: false }
      ];
    }
    return [
      { wd: "Пн", val: "4.2к", minVal: "2.4к", maxVal: "4.2к", num: 4200, detail: "Пн · 2.4к–4.2к ₽ · 4 урока · на руки 95% · 3 990 ₽", pct: 52, benchPct: 48, low: 16, span: 42, gold: false },
      { wd: "Вт", val: "5.6к", minVal: "3.1к", maxVal: "5.6к", num: 5600, detail: "Вт · 3.1к–5.6к ₽ · 5 уроков · на руки 95% · 5 320 ₽", pct: 70, benchPct: 60, low: 22, span: 50, gold: false },
      { wd: "Ср", val: "3.4к", minVal: "1.9к", maxVal: "3.4к", num: 3400, detail: "Ср · 1.9к–3.4к ₽ · 3 урока · на руки 95% · 3 230 ₽", pct: 44, benchPct: 50, low: 14, span: 34, gold: false },
      { wd: "Чт", val: "7.9к", minVal: "4.8к", maxVal: "7.9к", num: 7900, detail: "Чт · 4.8к–7.9к ₽ · 7 уроков · на руки 95% · 7 505 ₽ · Пик авто-24ч", pct: 100, benchPct: 68, low: 32, span: 60, gold: true },
      { wd: "Пт", val: "5.1к", minVal: "2.9к", maxVal: "5.1к", num: 5100, detail: "Пт · 2.9к–5.1к ₽ · 5 уроков · на руки 95% · 4 845 ₽", pct: 64, benchPct: 58, low: 20, span: 46, gold: false },
      { wd: "Сб", val: "6.8к", minVal: "3.9к", maxVal: "6.8к", num: 6800, detail: "Сб · 3.9к–6.8к ₽ · 6 уроков · на руки 95% · 6 460 ₽ · Пик авто-24ч", pct: 86, benchPct: 66, low: 26, span: 56, gold: true },
      { wd: "Вс", val: "4.5к", minVal: "2.5к", maxVal: "4.5к", num: 4500, detail: "Вс · 2.5к–4.5к ₽ · 4 урока · на руки 95% · 4 275 ₽", pct: 56, benchPct: 52, low: 18, span: 40, gold: false }
    ];
  }

  let _gradSeq = 0;

  /* Монотонная кубическая интерполяция Фрича–Карлсона: проходит через каждый (x, y) без вылетов. */
  function monotoneCubicPath(pts) {
    if (!pts || !pts.length) return "";
    const n = pts.length;
    if (n === 1) return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    if (n === 2) {
      return `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)} L ${pts[1].x.toFixed(2)} ${pts[1].y.toFixed(2)}`;
    }
    const dx = new Array(n - 1);
    const d = new Array(n - 1);
    for (let i = 0; i < n - 1; i++) {
      dx[i] = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      d[i] = dx[i] > 1e-6 ? dy / dx[i] : 0;
    }
    const m = new Array(n);
    m[0] = d[0];
    m[n - 1] = d[n - 2];
    for (let i = 1; i < n - 1; i++) {
      m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    }
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(d[i]) < 1e-9) {
        m[i] = 0;
        m[i + 1] = 0;
      } else {
        const alpha = m[i] / d[i];
        const beta = m[i + 1] / d[i];
        const hypot2 = alpha * alpha + beta * beta;
        if (hypot2 > 9) {
          const tau = 3 / Math.sqrt(hypot2);
          m[i] = tau * alpha * d[i];
          m[i + 1] = tau * beta * d[i];
        }
      }
    }
    let path = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 0; i < n - 1; i++) {
      const h = dx[i] / 3;
      const c1x = pts[i].x + h;
      const c1y = pts[i].y + m[i] * h;
      const c2x = pts[i + 1].x - h;
      const c2y = pts[i + 1].y - m[i + 1] * h;
      path += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${pts[i + 1].x.toFixed(2)} ${pts[i + 1].y.toFixed(2)}`;
    }
    return path;
  }

  function smoothTrendPath(pts) {
    return monotoneCubicPath(pts);
  }

  /* Равномерное прореживание индексов оси X с гарантированным показом первого и последнего. */
  function buildTickIndices(n, maxTicks) {
    if (n <= 0) return [];
    const cap = Math.max(2, Number(maxTicks) || 8);
    if (n <= cap) return Array.from({ length: n }, (_, i) => i);
    const step = Math.ceil((n - 1) / (cap - 1));
    const list = [0];
    for (let i = step; i < n - 1; i += step) {
      if (n - 1 - i >= Math.max(1, Math.ceil(step * 0.5))) {
        list.push(i);
      }
    }
    list.push(n - 1);
    return list;
  }

  /* Единая SVG-отрисовка combo-графика (сетка, подписи, палочки, узлы и монотонная кривая без рассинхрона). */
  function comboSvgHTML(bars, activeIdx, interactive, action) {
    const n = bars.length;
    if (!n) return "";
    const W = 640;
    const H = 206;
    const padL = 22;
    const padR = 22;
    const padT = 28;
    const padB = 28;
    const plotW = W - padL - padR;
    const plotH = H - padT - padB;
    const plotBottom = padT + plotH;
    const slotW = plotW / n;
    const clampPct = (v) => Math.max(10, Math.min(96, Number(v) || 0));

    const coords = bars.map((b, idx) => {
      const pct = clampPct(b.pct);
      const cx = padL + (idx + 0.5) * slotW;
      const cy = plotBottom - (pct / 100) * plotH;
      return { cx, cy, pct, b, idx };
    });

    const pts = coords.map((c) => ({ x: c.cx, y: c.cy }));
    const lineD = monotoneCubicPath(pts);
    const areaD = `${lineD} L ${pts[pts.length - 1].x.toFixed(2)} ${plotBottom.toFixed(2)} L ${pts[0].x.toFixed(2)} ${plotBottom.toFixed(2)} Z`;
    const gradId = `tc-combo-grad-${++_gradSeq}`;

    const tickStep = n > 10 ? Math.ceil(n / 8) : 1;
    const showTick = (idx) =>
      n <= 10 ||
      idx === 0 ||
      idx === n - 1 ||
      (idx % tickStep === 0 && n - 1 - idx >= Math.max(1, Math.ceil(tickStep * 0.5)));

    const stickW = n > 20 ? 3.5 : n > 12 ? 4.5 : 5;
    const dotR = n > 18 ? 3.5 : 4.6;

    const gridSvg = [0.25, 0.5, 0.75, 1]
      .map((f) => {
        const gy = (plotBottom - f * plotH).toFixed(1);
        return `<line class="tc-combo-grid" x1="${padL}" y1="${gy}" x2="${W - padR}" y2="${gy}"/>`;
      })
      .join("");

    const sticksSvg = coords
      .map((c) => {
        const fill = c.b.gold ? "#c59b5f" : "var(--accent)";
        const h = Math.max(2, plotBottom - c.cy);
        return `<rect class="tc-combo-stick" x="${(c.cx - stickW / 2).toFixed(2)}" y="${c.cy.toFixed(2)}" width="${stickW}" height="${h.toFixed(2)}" rx="${(stickW / 2).toFixed(2)}" fill="${fill}" opacity="0.86"/>`;
      })
      .join("");

    const colsSvg = coords
      .map((c) => {
        const isAct = interactive && activeIdx === c.idx;
        const fill = c.b.gold ? "#c59b5f" : "var(--accent)";
        const showX = showTick(c.idx);
        const showVal = showX || isAct;
        const interactAttr = interactive
          ? ` data-a="${esc(action)}" data-idx="${c.idx}" tabindex="0" role="button" aria-pressed="${isAct}" aria-label="${esc(c.b.detail || `${c.b.wd}: ${c.b.val}`)}"`
          : "";
        return `<g class="tc-combo-col${isAct ? " is-active" : ""}"${interactAttr}>
          <rect x="${(c.cx - slotW / 2).toFixed(2)}" y="0" width="${slotW.toFixed(2)}" height="${H}" fill="transparent"/>
          ${isAct ? `<circle cx="${c.cx.toFixed(2)}" cy="${c.cy.toFixed(2)}" r="10.5" fill="${fill}" opacity="0.22"/>` : ""}
          <circle class="tc-combo-dot" cx="${c.cx.toFixed(2)}" cy="${c.cy.toFixed(2)}" r="${isAct ? 5.6 : dotR}" fill="${fill}" stroke="var(--surface)" stroke-width="${n > 18 ? 1.5 : 2}"/>
          ${showVal ? `<text class="tc-combo-val" x="${c.cx.toFixed(2)}" y="${Math.max(12, c.cy - 10).toFixed(2)}" text-anchor="middle">${esc(c.b.val)}</text>` : ""}
          ${showX ? `<text class="tc-combo-lbl" x="${c.cx.toFixed(2)}" y="${H - 7}" text-anchor="middle">${esc(c.b.wd)}</text>` : ""}
        </g>`;
      })
      .join("");

    return `<div class="tc-combo-svg-wrap">
      <svg class="tc-combo-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="presentation">
        <defs>
          <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--gold)" stop-opacity="0.26"/>
            <stop offset="100%" stop-color="var(--gold)" stop-opacity="0"/>
          </linearGradient>
        </defs>
        ${gridSvg}
        <line class="tc-combo-baseline" x1="${padL}" y1="${plotBottom}" x2="${W - padR}" y2="${plotBottom}"/>
        <path class="tc-combo-area" d="${areaD}" fill="url(#${gradId})"/>
        ${sticksSvg}
        <path class="tc-combo-line" d="${lineD}" fill="none" stroke="var(--gold)" stroke-width="${n > 20 ? 2 : 2.4}" stroke-linecap="round" stroke-linejoin="round"/>
        ${colsSvg}
      </svg>
    </div>`;
  }

  /* Универсальный график с палочками (sticks, lollipop, capsule, dual, range, combo, classic). */
  function stickChartHTML(styleId, bars, activeIdx, interactive, ariaLabel, opts) {
    opts = opts || {};
    bars = Array.isArray(bars) ? bars : [];
    const action = opts.action || "bb-chart-bar";
    const modCls = styleId && styleId !== "classic" ? ` is-${styleId}` : "";
    const denseCls = bars.length > 10 ? " is-dense" : "";
    const label = esc(ariaLabel || "Диаграмма с палочками");

    if (styleId === "combo") {
      return `<div class="tc-bar-chart is-combo${denseCls}" style="--bar-count:${bars.length}" role="img" aria-label="${label}">
        ${comboSvgHTML(bars, activeIdx, interactive, action)}
      </div>`;
    }

    const n = bars.length;
    const clampPct = (v) => Math.max(10, Math.min(96, Math.round(Number(v) || 0)));
    const tickStep = n > 10 ? Math.ceil(n / 8) : 1;
    const showTick = (idx) =>
      n <= 10 ||
      idx === 0 ||
      idx === n - 1 ||
      (idx % tickStep === 0 && n - 1 - idx >= Math.max(1, Math.ceil(tickStep * 0.5)));

    return `<div class="tc-bar-chart${modCls}${denseCls}" style="--bar-count:${n}" role="img" aria-label="${label}">
      ${bars.map((b, idx) => {
        const isAct = interactive && activeIdx === idx;
        const pct = clampPct(b.pct);
        const benchPct = clampPct(b.benchPct);
        const isRange = styleId === "range";
        const topVal = isRange ? (b.maxVal || b.val) : b.val;
        const inner = styleId === "dual"
          ? `<div class="tc-bar-fill is-bench" style="height:${benchPct}%"></div><div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="height:${pct}%"></div>`
          : (isRange
            ? `<div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="--low:${b.low}%;height:${b.span}%"></div>`
            : `<div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="height:${pct}%"></div>`);
        const showLbl = showTick(idx);
        const valText = (showLbl || isAct) ? esc(topVal) : "";
        const lblText = showLbl ? esc(b.wd) : "";
        const minRow = isRange && b.minVal ? `<span class="tc-bar-min num">${showLbl || isAct ? esc(b.minVal) : ""}</span>` : "";
        const body = `<span class="tc-bar-val num">${valText}</span><div class="tc-bar-track">${inner}</div>${minRow}<span class="tc-bar-lbl">${lblText}</span>`;
        if (interactive) {
          return `<button type="button" class="tc-bar-col${isAct ? " is-active" : ""}" data-a="${esc(action)}" data-idx="${idx}" aria-pressed="${isAct}">${body}</button>`;
        }
        return `<div class="tc-bar-col">${body}</div>`;
      }).join("")}
    </div>`;
  }

  const DEMO_SERIES_NAMES = {
    income: [
      "Биология ЕГЭ · 95%", "Химия Медвуз · 95%", "Русский Зад. 27", "Математика Профиль",
      "Информатика КЕГЭ", "Мини-группы 2–4", "Интенсив ФИПИ", "Автоподнятие 24ч",
      "СБП Т-Банк", "Якутск (UTC+9)", "Москва (UTC+3)", "Олимпиадная подг.",
      "Пробник с разбором", "ОГЭ 9 класс", "Физика ЕГЭ", "Обществознание",
      "Английский ЕГЭ", "Абонемент 8 ур.", "Срочный слот ±100", "Вечерний слот 19ч"
    ],
    scores: [
      "Биология · Медвуз", "Химия · Органика", "Русский · Зад. 27", "Математика профиль",
      "Информатика КЕГЭ", "Физика · Механика", "Обществознание", "История · Вторая ч.",
      "Английский язык", "Литература", "География", "Биология · Линия 28",
      "Химия · Задача 34", "Русский · Орфография", "Математика · Параметры", "КЕГЭ · Python 27",
      "Физика · Оптика", "Право и экономика", "Олимпиадная химия", "Пробник ФИПИ ср."
    ],
    slots: [
      "Якутск · Биология", "Якутск · Химия", "Якутск · Русский", "Москва · Профиль",
      "Telegram-бот", "MAX мессенджер", "Доска Ykt", "WhatsApp",
      "Слот 16:00", "Слот 18:00", "Слот 14:00", "Слот 20:00",
      "Слот 10:00", "Мини-группы 2–4", "Пробные 0 ₽", "Автоподнятие 24 ч",
      "Повторные ученики", "Казань · КЕГЭ", "Новосибирск · Физ", "Питер · Медвуз"
    ]
  };

  function formatPointLabel(ds, idx, total) {
    if (total <= 7) {
      const base = chartDatasetBars(ds);
      if (base[idx]) return base[idx].wd;
    }
    if (ds === "scores") return `Т${idx + 1}`;
    if (ds === "slots") return `${10 + (idx % 11)}ч`;
    const day = (idx % 30) + 1;
    const month = 5 + Math.floor(idx / 30);
    return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
  }

  /* Генератор детерминированных стресс-данных: 1..20 серий × 5..36+ точек со спусками и заходами. */
  function buildMultiSeriesDemo(linesCount, pointsCount, datasetId) {
    const lines = Math.max(1, Math.min(20, Math.round(Number(linesCount) || 1)));
    const pts = Math.max(2, Math.min(48, Math.round(Number(pointsCount) || 7)));
    const ds = datasetId === "scores" || datasetId === "slots" ? datasetId : "income";
    const names = DEMO_SERIES_NAMES[ds];
    const series = [];

    for (let li = 0; li < lines; li++) {
      const name = names[li % names.length];
      const color = CHART_PALETTE_20[li % CHART_PALETTE_20.length];
      const phase = li * 0.63;
      const dipCenter = 0.28 + ((li * 7) % 10) * 0.02;
      const surgeCenter = 0.72 + ((li * 5) % 8) * 0.018;
      const points = [];

      for (let pi = 0; pi < pts; pi++) {
        const t = pts > 1 ? pi / (pts - 1) : 0;
        const base = 44 + ((li * 11) % 24);
        const wave1 = 18 * Math.sin(t * Math.PI * (2.4 + (li % 3) * 0.45) + phase);
        const wave2 = 9 * Math.cos(t * Math.PI * (5.2 + (li % 4) * 0.5) - phase * 0.7);
        const dip = -18 * Math.exp(-Math.pow((t - dipCenter) / 0.11, 2));
        const surge = 22 * Math.exp(-Math.pow((t - surgeCenter) / 0.12, 2));
        const pct = Math.max(10, Math.min(97, Math.round(base + wave1 + wave2 + dip + surge)));
        const wd = formatPointLabel(ds, pi, pts);

        let num = pct;
        let val = String(pct);
        if (ds === "slots") {
          num = Math.max(2, Math.round((pct / 100) * 28));
          val = String(num);
        } else if (ds === "income") {
          num = Math.round(((pct / 100) * 9600) / 100) * 100;
          val = `${(num / 1000).toFixed(1)}к`;
        }
        points.push({
          wd,
          val,
          num,
          pct,
          gold: pct >= 82,
          detail: `${name} · ${wd}: ${val}${ds === "income" ? " ₽" : ds === "scores" ? " б." : " откл."}`
        });
      }
      series.push({ name, color, points });
    }
    return series;
  }

  /* Линейный график до 20 серий и 40+ точек с адаптивной толщиной, прореживанием оси X и легендой. */
  function multiLineChartHTML(opts) {
    opts = opts || {};
    const ds = opts.dataset || "income";
    let rawSeries = Array.isArray(opts.series) && opts.series.length ? opts.series : null;
    if (!rawSeries) {
      if (Array.isArray(opts.bars) && opts.bars.length && !(Number(opts.linesCount) > 1)) {
        rawSeries = [{ name: opts.seriesName || "Динамика", color: CHART_PALETTE_20[0], points: opts.bars }];
      } else {
        const lCount = opts.linesCount || 1;
        const pCount = opts.pointsCount || (Array.isArray(opts.bars) && opts.bars.length ? opts.bars.length : 7);
        rawSeries = buildMultiSeriesDemo(lCount, pCount, ds);
      }
    }

    const lines = rawSeries.slice(0, 20).map((s, idx) => ({
      name: s.name || `Серия ${idx + 1}`,
      color: s.color || CHART_PALETTE_20[idx % CHART_PALETTE_20.length],
      points: Array.isArray(s.points) ? s.points : []
    })).filter((s) => s.points.length > 0);

    if (!lines.length) return "";

    const n = Math.max(...lines.map((s) => s.points.length));
    const activeIdx = Number.isInteger(opts.activeIdx)
      ? Math.max(0, Math.min(n - 1, opts.activeIdx))
      : Math.min(n - 1, Math.floor(n / 2));
    const action = opts.action || "bb-line-pt";
    const gradId = esc(opts.gradId || `bbMultiGrad-${++_gradSeq}`);

    const w = 640;
    const h = lines.length > 1 ? 216 : 194;
    const padL = 38;
    const padR = 18;
    const padT = 20;
    const padB = 26;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const plotBottom = padT + plotH;

    const strokeWidth = lines.length > 8 ? 1.7 : 2.4;
    const nodeRadius = lines.length > 6 ? 2.4 : n > 18 ? 3 : 4.2;
    const isDensePoints = n > 12 || lines.length > 3;

    const seriesCoords = lines.map((s) => {
      const coords = s.points.map((pt, i) => {
        const x = padL + (i * plotW) / Math.max(1, n - 1);
        const pct = Math.max(6, Math.min(100, Number(pt.pct) || 0));
        const y = plotBottom - (pct / 100) * plotH;
        return { x: Number(x.toFixed(2)), y: Number(y.toFixed(2)), pt, idx: i };
      });
      return {
        name: s.name,
        color: s.color,
        coords,
        pathD: monotoneCubicPath(coords)
      };
    });

    const goalPct = ds === "scores" ? 80 : ds === "slots" ? 72 : 68;
    const goalY = (plotBottom - (goalPct / 100) * plotH).toFixed(1);
    const goalLabel = ds === "scores" ? "Цель 80 б." : ds === "slots" ? "Норма спроса" : "Ориентир 5.4к ₽";
    const yTicks = ds === "scores" ? ["100", "75", "50", "25"] : ds === "slots" ? ["24", "18", "12", "6"] : ["8к", "6к", "4к", "2к"];

    const tickIndices = buildTickIndices(n, 8);
    const refPoints = lines[0].points;
    const actRefPt = refPoints[activeIdx] || refPoints[0];
    const actX = padL + (activeIdx * plotW) / Math.max(1, n - 1);

    const gridSvg = [0, 0.25, 0.5, 0.75]
      .map((f, yi) => {
        const gy = (padT + f * plotH).toFixed(1);
        return `<line class="bb-line-grid" x1="${padL}" y1="${gy}" x2="${w - padR}" y2="${gy}"/>
          <text x="${padL - 6}" y="${Number(gy) + 4}" text-anchor="end" font-size="10.5" fill="var(--muted)" font-family="var(--font-mono)">${esc(yTicks[yi] || "")}</text>`;
      })
      .join("");

    const xTicksSvg = tickIndices
      .map((idx) => {
        const pt = refPoints[idx];
        if (!pt) return "";
        const tx = (padL + (idx * plotW) / Math.max(1, n - 1)).toFixed(2);
        const anchor = idx === 0 ? "start" : idx === n - 1 ? "end" : "middle";
        return `<text class="bb-line-svg-xtick${idx === activeIdx ? " is-active" : ""}" x="${tx}" y="${h - 6}" text-anchor="${anchor}">${esc(pt.wd)}</text>`;
      })
      .join("");

    let singleAreaSvg = "";
    if (lines.length === 1 && seriesCoords[0].coords.length) {
      const sc0 = seriesCoords[0].coords;
      const areaD = `${seriesCoords[0].pathD} L ${sc0[sc0.length - 1].x} ${plotBottom.toFixed(2)} L ${sc0[0].x} ${plotBottom.toFixed(2)} Z`;
      singleAreaSvg = `<defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${esc(lines[0].color)}" stop-opacity="0.26"/>
          <stop offset="100%" stop-color="${esc(lines[0].color)}" stop-opacity="0.01"/>
        </linearGradient>
      </defs>
      <path d="${areaD}" fill="url(#${gradId})"/>`;
    }

    const pathsSvg = seriesCoords
      .map((sc) => `<path class="bb-line-path" d="${sc.pathD}" style="stroke:${esc(sc.color)};stroke-width:${strokeWidth}"/>`)
      .join("");

    let nodesSvg = "";
    if (lines.length === 1) {
      const sc = seriesCoords[0];
      nodesSvg = sc.coords
        .map((c) => {
          const isAct = c.idx === activeIdx;
          const fill = c.pt.gold ? "#c59b5f" : sc.color;
          const showBaseCircle = !isDensePoints || isAct;
          return `<g class="bb-line-node" data-a="${esc(action)}" data-idx="${c.idx}" tabindex="0" role="button" aria-label="${esc(c.pt.detail || `${c.pt.wd}: ${c.pt.val}`)}">
            <circle cx="${c.x}" cy="${c.y}" r="${isDensePoints ? 9 : 11}" fill="transparent"/>
            ${isAct ? `<circle cx="${c.x}" cy="${c.y}" r="11" fill="${esc(fill)}" opacity="0.22"/>` : ""}
            ${showBaseCircle ? `<circle class="is-core" cx="${c.x}" cy="${c.y}" r="${isAct ? Math.max(5, nodeRadius + 1.6) : nodeRadius}" fill="${isAct ? esc(fill) : "var(--surface)"}" stroke="${esc(fill)}" stroke-width="2.2"/>` : ""}
            ${isAct ? `<g transform="translate(${Math.max(padL + 24, Math.min(w - padR - 24, c.x))}, ${Math.max(18, c.y - 14)})">
              <rect x="-24" y="-12" width="48" height="20" rx="10" fill="var(--ink)"/>
              <text x="0" y="2" text-anchor="middle" font-size="11" font-weight="700" fill="var(--bg)" font-family="var(--font-mono)">${esc(c.pt.val)}</text>
            </g>` : ""}
          </g>`;
        })
        .join("");
    } else {
      const colW = plotW / Math.max(1, n);
      const hitCols = Array.from({ length: n }, (_, idx) => {
        const cx = padL + (idx * plotW) / Math.max(1, n - 1);
        return `<rect class="bb-line-col-hit" x="${(cx - colW / 2).toFixed(2)}" y="${padT}" width="${colW.toFixed(2)}" height="${plotH}" fill="transparent" data-a="${esc(action)}" data-idx="${idx}"/>`;
      }).join("");
      const dotsSvg = seriesCoords
        .map((sc) =>
          sc.coords
            .map((c) => {
              const isAct = c.idx === activeIdx;
              if (isDensePoints && !isAct) return "";
              return `<circle cx="${c.x}" cy="${c.y}" r="${isAct ? Math.max(3.6, nodeRadius + 1.2) : nodeRadius}" fill="${isAct ? esc(sc.color) : "var(--surface)"}" stroke="${esc(sc.color)}" stroke-width="${isAct ? 2 : 1.5}" pointer-events="none"/>`;
            })
            .join("")
        )
        .join("");
      nodesSvg = `${hitCols}<line class="bb-line-guide" x1="${actX.toFixed(2)}" y1="${padT}" x2="${actX.toFixed(2)}" y2="${plotBottom}"/>${dotsSvg}`;
    }

    const legendHtml = lines.length > 1
      ? `<div class="bb-line-legend" role="list" aria-label="Легенда линий">
          ${lines.map((s) => {
            const pt = s.points[activeIdx] || s.points[s.points.length - 1];
            return `<span class="bb-line-legend-item" role="listitem">
              <i class="bb-line-legend-dot" style="background:${esc(s.color)}"></i>
              <span class="bb-line-legend-name">${esc(s.name)}</span>
              <b class="bb-line-legend-val num">${esc(pt ? pt.val : "")}</b>
            </span>`;
          }).join("")}
        </div>`
      : "";

    const axisHtml = `<div class="bb-line-axis" style="--tick-count:${tickIndices.length}">
      ${tickIndices.map((idx) => {
        const pt = refPoints[idx];
        if (!pt) return "";
        const label = lines.length > 1 ? esc(pt.wd) : `${esc(pt.wd)} · ${esc(pt.val)}`;
        return `<button type="button" class="bb-line-tick${idx === activeIdx ? " is-active" : ""}" data-a="${esc(action)}" data-idx="${idx}" aria-pressed="${idx === activeIdx}">${label}</button>`;
      }).join("")}
    </div>`;

    const footerHtml = lines.length === 1
      ? `<div class="row between small" style="padding-top:2px">
          <span class="muted">Выбранный узел:</span>
          <b class="num">${esc((actRefPt && actRefPt.detail) || "")}</b>
        </div>`
      : `<div class="row between small" style="padding-top:2px">
          <span class="muted">Серий: <b class="num">${lines.length}</b> · Точек: <b class="num">${n}</b></span>
          <b class="num">Срез: ${esc((actRefPt && actRefPt.wd) || "")}</b>
        </div>`;

    return `<div class="bb-line-chart${lines.length > 1 ? " is-multi" : ""}" role="group" aria-label="${esc(opts.ariaLabel || "Линейный график")}">
      <svg class="bb-line-svg${lines.length > 1 ? " is-multi" : ""}" viewBox="0 0 ${w} ${h}">
        ${singleAreaSvg}
        ${gridSvg}
        <line class="bb-line-goal" x1="${padL}" y1="${goalY}" x2="${w - padR}" y2="${goalY}"/>
        <text x="${w - padR}" y="${Number(goalY) - 5}" text-anchor="end" font-size="10.5" font-weight="600" fill="var(--gold-ink)">${esc(goalLabel)}</text>
        ${pathsSvg}
        ${nodesSvg}
        ${xTicksSvg}
      </svg>
      ${axisHtml}
      ${legendHtml}
      ${footerHtml}
    </div>`;
  }

  /* Линейный график с областью и интерактивными узлами (.bb-line-chart), поддерживает multiLineChartHTML. */
  function lineChartHTML(opts) {
    opts = opts || {};
    if (
      Array.isArray(opts.series) ||
      Number(opts.linesCount) > 1 ||
      Number(opts.pointsCount) > 12 ||
      (Array.isArray(opts.bars) && opts.bars.length > 12)
    ) {
      return multiLineChartHTML(opts);
    }

    const ds = opts.dataset || "income";
    const bars = opts.bars || chartDatasetBars(ds);
    const activeIdx = Number.isInteger(opts.activeIdx) ? Math.max(0, Math.min(bars.length - 1, opts.activeIdx)) : Math.min(3, Math.max(0, bars.length - 1));
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
    const lineD = monotoneCubicPath(coords);
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
      <div class="bb-line-axis" style="--tick-count:${bars.length}">
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

  root.EGE.charts = Object.assign(root.EGE.charts || {}, {
    CHART_STYLE_META,
    CHART_PALETTE_20,
    chartDatasetBars,
    buildMultiSeriesDemo,
    smoothTrendPath,
    monotoneCubicPath,
    stickChartHTML,
    lineChartHTML,
    multiLineChartHTML,
    DONUT_DATASETS,
    donutChartHTML
  });
})();
