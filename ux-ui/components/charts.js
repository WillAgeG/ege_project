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
        const isRange = styleId === "range";
        const topVal = isRange ? (b.maxVal || b.val) : b.val;
        const inner = styleId === "dual"
          ? `<div class="tc-bar-fill is-bench" style="height:${benchPct}%"></div><div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="height:${pct}%"></div>`
          : (isRange
            ? `<div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="--low:${b.low}%;height:${b.span}%"></div>`
            : `<div class="tc-bar-fill${b.gold ? " is-gold" : ""}" style="height:${pct}%"></div>`);
        const minRow = isRange && b.minVal ? `<span class="tc-bar-min num">${esc(b.minVal)}</span>` : "";
        const body = `<span class="tc-bar-val num">${esc(topVal)}</span><div class="tc-bar-track">${inner}</div>${minRow}<span class="tc-bar-lbl">${esc(b.wd)}</span>`;
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

  const PAYOUT_ROWS = [
    { id: "pay-1", date: "14.05.2026", channel: "sbp", method: "СБП · Т-Банк", requisites: "+7 (914) 210-••-11", gross: 12000, fee: 600, amount: 11400, receipt: "Чек № 88412-НПД", status: "accepted", statusLabel: "Выплачено ✓" },
    { id: "pay-2", date: "10.05.2026", channel: "card", method: "Карта Мир · Сбер", requisites: "2200 70•• •••• 4812", gross: 8000, fee: 400, amount: 7600, receipt: "Чек № 88305-НПД", status: "accepted", statusLabel: "Выплачено ✓" },
    { id: "pay-3", date: "15.05.2026", channel: "sbp", method: "СБП · АЭБ (Якутск)", requisites: "+7 (914) 210-••-11", gross: 5000, fee: 250, amount: 4750, receipt: "Ожидает чек НПД", status: "pending", statusLabel: "На проверке" },
    { id: "pay-4", date: "03.05.2026", channel: "sbp", method: "СБП · ВТБ", requisites: "+7 (914) 210-••-11", gross: 2400, fee: 0, amount: 2400, receipt: "Сторно отмены 100%", status: "refund", statusLabel: "Возврат ученику" },
    { id: "pay-5", date: "12.05.2026", channel: "sbp", method: "СБП · Озон Банк", requisites: "+7 (924) 550-••-90", gross: 3600, fee: 180, amount: 3420, receipt: "Сформирован НПД", status: "info", statusLabel: "Готов к выводу" }
  ];

  const EXAM_ROWS = [
    { id: "ex-1", date: "14.05", subjectId: "bio", subject: "Биология · ЕГЭ-2027", variant: "Вариант № 12 · Генетика", score: 86, maxScore: 100, essayNote: "Линия 28 без ошибок", examDate: "15 июн 2027", status: "accepted", statusLabel: "Зачтено ✓" },
    { id: "ex-2", date: "12.05", subjectId: "rus", subject: "Русский язык · Зад. 27", variant: "Сочинение · Текст Лихачёва", score: 21, maxScore: 22, essayNote: "21 / 22 б. (К1–К10)", examDate: "4 июн 2027", status: "accepted", statusLabel: "ИИ проверено ✓" },
    { id: "ex-3", date: "11.05", subjectId: "chem", subject: "Химия · ЕГЭ-2027", variant: "Задача 34 + ОВР блок", score: 78, maxScore: 100, essayNote: "Повторить расчёт примесей", examDate: "1 июн 2027", status: "trial", statusLabel: "Доработка" },
    { id: "ex-4", date: "15.05", subjectId: "rus", subject: "Русский язык · Зад. 27", variant: "Сочинение · Текст Паустовского", score: 19, maxScore: 22, essayNote: "19 / 22 б. · доработать К3", examDate: "4 июн 2027", status: "pending", statusLabel: "Ждёт проверки" },
    { id: "ex-5", date: "08.05", subjectId: "bio", subject: "Биология · Линия 28", variant: "Синтез белка и митоз", score: 91, maxScore: 100, essayNote: "Рекомендация ИИ: тайминг", examDate: "15 июн 2027", status: "info", statusLabel: "Рекомендация ИИ" }
  ];

  function tableStatusClass(st) {
    if (st === "accepted" || st === "paid" || st === "done") return "is-confirmed";
    if (st === "trial") return "is-trial";
    if (st === "refund" || st === "refunded" || st === "canceled") return "is-refund";
    if (st === "info" || st === "ready") return "is-info";
    return "is-pending";
  }

  function isRowConfirmed(id, confirmedIds) {
    if (!id || !confirmedIds) return false;
    if (Array.isArray(confirmedIds)) return confirmedIds.indexOf(id) >= 0;
    return !!confirmedIds[id];
  }

  function buildRequestColumns(cols) {
    return [
      {
        key: "studentCompact",
        label: "Ученик и предмет",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.student)}</b><span class="small muted">${esc(r.subject)} · ${esc(r.slot)}</span></div>`
      },
      {
        key: "student",
        label: "Ученик",
        minCols: 5,
        render: (r) => `<b>${esc(r.student)}</b>`
      },
      {
        key: "subject",
        label: "Предмет",
        minCols: 5,
        render: (r) => cols === 5
          ? `<div class="stack" style="gap:2px"><span>${esc(r.subject)}</span><span class="small muted">${esc(r.city)}</span></div>`
          : esc(r.subject)
      },
      {
        key: "city",
        label: "Город",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.city)}</span>`
      },
      {
        key: "slot",
        label: cols === 5 ? "Слот (UTC)" : "Слот",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.slot)}</span>`
      },
      {
        key: "rate",
        label: "Ставка",
        num: true,
        render: (r) => `<b class="num">${Number(r.rate || 0).toLocaleString("ru-RU")} ₽/ч</b>`
      },
      {
        key: "net",
        label: "На руки (95%)",
        minCols: 7,
        num: true,
        render: (r) => `<b class="num" style="color:var(--confirm)">${Number(r.net || 0).toLocaleString("ru-RU")} ₽</b>`
      },
      {
        key: "contactOnly",
        label: "Связь (WA · TG · MAX)",
        maxCols: 3,
        isActions: true,
        render: (r, h) => h.messengerHTML(r)
      },
      {
        key: "statusAndContact",
        label: "Статус и связь",
        minCols: 5,
        isActions: true,
        render: (r, h) => `<div class="stack" style="gap:6px">${h.statusHTML(r)}${h.messengerHTML(r)}</div>`
      }
    ];
  }

  function buildPayoutColumns() {
    return [
      {
        key: "dateCompact",
        label: "Дата и способ",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b class="num">${esc(r.date)}</b><span class="small muted">${esc(r.method)}</span></div>`
      },
      {
        key: "date",
        label: "Дата",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.date)}</span>`
      },
      {
        key: "method",
        label: "Способ / Банк",
        minCols: 5,
        render: (r) => `<b>${esc(r.method)}</b>`
      },
      {
        key: "requisites",
        label: "Реквизиты",
        minCols: 5,
        num: true,
        render: (r) => `<span class="small num">${esc(r.requisites)}</span>`
      },
      {
        key: "gross",
        label: "Списано (100%)",
        minCols: 7,
        num: true,
        render: (r) => `<span class="num">${Number(r.gross || 0).toLocaleString("ru-RU")} ₽</span>`
      },
      {
        key: "fee",
        label: "Сбор (5%)",
        minCols: 7,
        num: true,
        render: (r) => `<span class="num muted">${Number(r.fee || 0).toLocaleString("ru-RU")} ₽</span>`
      },
      {
        key: "amount",
        label: "Сумма / Чек НПД",
        num: true,
        render: (r) => `<div class="stack" style="gap:2px"><b class="num">${Number(r.amount || 0).toLocaleString("ru-RU")} ₽</b><span class="small muted">${esc(r.receipt)}</span></div>`
      },
      {
        key: "status",
        label: "Статус",
        isActions: true,
        render: (r, h) => h.statusHTML(r)
      }
    ];
  }

  function buildExamColumns() {
    return [
      {
        key: "subjectCompact",
        label: "Предмет и вариант",
        maxCols: 3,
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.subject)}</b><span class="small muted">${esc(r.date)} · ${esc(r.variant)}</span></div>`
      },
      {
        key: "date",
        label: "Дата",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.date)}</span>`
      },
      {
        key: "subject",
        label: "Предмет",
        minCols: 5,
        render: (r) => `<b>${esc(r.subject)}</b>`
      },
      {
        key: "variant",
        label: "Вариант / Задание",
        minCols: 5,
        render: (r) => `<div class="stack" style="gap:2px"><span>${esc(r.variant)}</span><span class="small muted">${esc(r.essayNote)}</span></div>`
      },
      {
        key: "score",
        label: "Балл / Итог",
        num: true,
        render: (r) => `<b class="num">${r.score} / ${r.maxScore}</b>`
      },
      {
        key: "essayNote",
        label: "Разбор ИИ",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.essayNote)}</span>`
      },
      {
        key: "examDate",
        label: "Экзамен ЕГЭ",
        minCols: 7,
        num: true,
        render: (r) => `<span class="small num">${esc(r.examDate)}</span>`
      },
      {
        key: "status",
        label: "Статус",
        isActions: true,
        render: (r, h) => h.statusHTML(r)
      }
    ];
  }

  const TABLE_PRESETS = {
    requests: {
      id: "requests",
      label: "Заявки",
      eyebrow: "Таблица с колонками 3 / 5 / 7 · .table-wrap + фильтры",
      title: "Расписание и заявки учеников с мгновенной отправкой в WA · Telegram · MAX",
      emptyLabel: "заявок",
      rows: TABLE_ROWS,
      filters: [
        { id: "all", label: "Все (" + TABLE_ROWS.length + ")", match: () => true },
        { id: "accepted", label: "Подтверждены ✓", match: (r, h) => h.effectiveStatus(r) === "accepted" },
        { id: "pending", label: "Ждут ответа", match: (r, h) => h.effectiveStatus(r) === "pending" },
        { id: "bio", label: "Биология", match: (r) => r.subjectId === "bio" },
        { id: "chem", label: "Химия", match: (r) => r.subjectId === "chem" }
      ],
      getColumns: buildRequestColumns
    },
    payouts: {
      id: "payouts",
      label: "Выплаты",
      eyebrow: "Выплаты и чеки НПД · Адаптивная схема колонок",
      title: "История выводов средств преподавателя (СБП и Карта Мир)",
      emptyLabel: "выплат",
      rows: PAYOUT_ROWS,
      filters: [
        { id: "all", label: "Все (" + PAYOUT_ROWS.length + ")", match: () => true },
        { id: "accepted", label: "Выплачено ✓", match: (r, h) => h.effectiveStatus(r) === "accepted" },
        { id: "pending", label: "На проверке", match: (r, h) => h.effectiveStatus(r) === "pending" },
        { id: "sbp", label: "СБП", match: (r) => r.channel === "sbp" },
        { id: "refund", label: "Возвраты", match: (r, h) => h.effectiveStatus(r) === "refund" }
      ],
      getColumns: buildPayoutColumns
    },
    exams: {
      id: "exams",
      label: "Пробники",
      eyebrow: "Трекер ЕГЭ-2027 · Пробники и ИИ-сочинения",
      title: "Прогресс пробников и разбора задания 27 по русскому языку",
      emptyLabel: "результатов",
      rows: EXAM_ROWS,
      filters: [
        { id: "all", label: "Все (" + EXAM_ROWS.length + ")", match: () => true },
        { id: "bio", label: "Биология", match: (r) => r.subjectId === "bio" },
        { id: "chem", label: "Химия", match: (r) => r.subjectId === "chem" },
        { id: "rus", label: "Русский язык", match: (r) => r.subjectId === "rus" },
        { id: "pending", label: "Ждёт проверки", match: (r, h) => h.effectiveStatus(r) === "pending" }
      ],
      getColumns: buildExamColumns
    }
  };

  /* Универсальная schema-driven таблица: 3/5/7 колонок, пресеты, подтверждение строк и @container карточки. */
  function dataTableHTML(opts) {
    opts = opts || {};
    const hasCustomSchema = Array.isArray(opts.columns) || Array.isArray(opts.rows);
    const presetId = TABLE_PRESETS[opts.preset] ? opts.preset : "requests";
    const preset = TABLE_PRESETS[presetId];
    const cols = [3, 5, 7].includes(Number(opts.cols)) ? Number(opts.cols) : 5;
    const filter = opts.filter || "all";
    const query = String(opts.query || "").trim().toLowerCase();
    const confirmAction = opts.confirmAction || "bb-tbl-confirm";
    const confirmedIds = opts.confirmedIds || {};
    const cardWrap = opts.cardWrap !== false;
    const showPresetSwitch = opts.showPresetSwitch !== false && !hasCustomSchema;
    const showColsSwitch = opts.showColsSwitch !== false;
    const searchId = opts.searchId || "bb-tbl-q";

    const renderMessengerLinks =
      (typeof opts.renderMessengerLinks === "function" && opts.renderMessengerLinks) ||
      (root.EGE && root.EGE.kit && typeof root.EGE.kit.messengerLinksHTML === "function" && root.EGE.kit.messengerLinksHTML) ||
      null;

    const allRows = Array.isArray(opts.rows) ? opts.rows : preset.rows;
    const allFilters = Array.isArray(opts.filters) ? opts.filters : (hasCustomSchema ? [] : preset.filters);
    const rawColumns = Array.isArray(opts.columns) ? opts.columns : preset.getColumns(cols);

    const visibleColumns = rawColumns.filter((c) => {
      if (!c) return false;
      if (typeof c.when === "function" && !c.when(cols)) return false;
      if (c.minCols != null && cols < Number(c.minCols)) return false;
      if (c.maxCols != null && cols > Number(c.maxCols)) return false;
      return true;
    });

    const effectiveStatus = (r) => {
      if (isRowConfirmed(r && r.id, confirmedIds)) return "accepted";
      return r && r.status ? r.status : "pending";
    };

    const effectiveStatusLabel = (r) => {
      if (isRowConfirmed(r && r.id, confirmedIds)) return "Подтверждено ✓";
      return (r && r.statusLabel) || "Ждёт ответа";
    };

    const statusHTML = (r) => {
      const confirmed = isRowConfirmed(r && r.id, confirmedIds);
      const st = effectiveStatus(r);
      const lbl = effectiveStatusLabel(r);
      const badge = `<span class="bb-tbl-st ${tableStatusClass(st)}">${esc(lbl)}</span>`;
      const canConfirm = r && r.id && (r.status === "pending" || r.status === "trial");
      if (!canConfirm) return badge;
      const btn = confirmed
        ? `<button type="button" class="btn ghost sm bb-tbl-act-btn" data-a="${esc(confirmAction)}" data-id="${esc(r.id)}">Сбросить</button>`
        : `<button type="button" class="btn confirm sm bb-tbl-act-btn" data-a="${esc(confirmAction)}" data-id="${esc(r.id)}">✓ Подтвердить</button>`;
      return `<div class="bb-tbl-st-cell">${badge}${btn}</div>`;
    };

    const messengerHTML = (r) => renderMessengerLinks && r
      ? renderMessengerLinks({
          entity: { id: r.id, name: r.student, whatsapp: r.whatsapp, telegram: r.telegram, maxHandle: r.maxHandle },
          message: `Здравствуйте, ${r.student || "коллега"}! Напоминаю о занятии (${r.subject || ""}, ${r.slot || ""}) через Вектор ЕГЭ.`,
          primaryLabel: "WA",
          compact: true
        })
      : "";

    const helpers = {
      cols,
      esc,
      confirmAction,
      confirmedIds,
      isConfirmed: (r) => isRowConfirmed(r && r.id, confirmedIds),
      effectiveStatus,
      effectiveStatusLabel,
      statusBadgeHTML: statusHTML,
      statusHTML,
      messengerHTML
    };

    const activeFilterObj = allFilters.find((f) => f.id === filter);
    const searchOf = (r) => {
      if (typeof opts.searchFields === "function") return String(opts.searchFields(r) || "").toLowerCase();
      if (Array.isArray(opts.searchFields)) {
        return opts.searchFields.map((k) => (r && r[k] != null ? String(r[k]) : "")).join(" ").toLowerCase();
      }
      if (!r || typeof r !== "object") return "";
      return Object.keys(r).map((k) => {
        const v = r[k];
        return (typeof v === "string" || typeof v === "number") ? String(v) : "";
      }).join(" ").toLowerCase();
    };

    const filtered = allRows.filter((r) => {
      if (activeFilterObj && typeof activeFilterObj.match === "function") {
        if (!activeFilterObj.match(r, helpers)) return false;
      } else if (filter === "accepted" && effectiveStatus(r) !== "accepted") {
        return false;
      } else if (filter === "pending" && effectiveStatus(r) !== "pending") {
        return false;
      }
      if (query && !searchOf(r).includes(query)) return false;
      return true;
    });

    const rowsHtml = filtered.length
      ? filtered.map((r) => `<tr>${visibleColumns.map((col) => {
          const valHtml = typeof col.render === "function"
            ? col.render(r, helpers)
            : esc(r && r[col.key] != null ? String(r[col.key]) : "");
          const tdCls = [col.num ? "num" : "", col.isActions ? "bb-tbl-actions-cell" : ""].filter(Boolean).join(" ");
          const alignStyle = col.align ? ` style="text-align:${esc(col.align)}"` : "";
          return `<td data-label="${esc(col.label)}"${tdCls ? ` class="${tdCls}"` : ""}${alignStyle}>${valHtml}</td>`;
        }).join("")}</tr>`).join("")
      : `<tr><td colspan="${Math.max(1, visibleColumns.length)}" data-label="Результат" class="small muted" style="text-align:center;padding:18px 10px">${esc(opts.emptyText || `По фильтру «${query || filter}» ${preset.emptyLabel || "записей"} не найдено — сбросьте фильтр.`)}</td></tr>`;

    const eyebrowText = opts.eyebrow != null ? opts.eyebrow : preset.eyebrow;
    const titleText = opts.title != null ? opts.title : preset.title;
    const searchPlaceholder = opts.searchPlaceholder || (presetId === "payouts" ? "Поиск: банк, чек НПД, сумма…" : (presetId === "exams" ? "Поиск: предмет, вариант, балл…" : "Поиск: имя, предмет, город…"));

    const presetSwitchHtml = showPresetSwitch
      ? `<div class="hh-seg" role="group" aria-label="Пресет таблицы">
          ${Object.keys(TABLE_PRESETS).map((pid) => `<button type="button" data-a="bb-tbl-preset" data-preset="${pid}" data-v="${pid}" aria-pressed="${presetId === pid}">${esc(TABLE_PRESETS[pid].label)}</button>`).join("")}
        </div>`
      : "";

    const colsSwitchHtml = showColsSwitch
      ? `<div class="hh-seg" role="group" aria-label="Количество колонок таблицы">
          ${[3, 5, 7].map((c) => `<button type="button" data-a="bb-tbl-cols" data-cols="${c}" aria-pressed="${cols === c}">${c === 3 ? "3 колонки" : `${c} колонок`}</button>`).join("")}
        </div>`
      : "";

    const headerHtml = (eyebrowText || titleText || presetSwitchHtml || colsSwitchHtml)
      ? `<div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          ${(eyebrowText || titleText) ? `<div>
            ${eyebrowText ? `<div class="eyebrow">${esc(eyebrowText)}</div>` : ""}
            ${titleText ? `<h3 class="h3">${esc(titleText)}</h3>` : ""}
          </div>` : ""}
          ${(presetSwitchHtml || colsSwitchHtml) ? `<div class="bb-tbl-switches">${presetSwitchHtml}${colsSwitchHtml}</div>` : ""}
        </div>`
      : "";

    const toolbarHtml = (allFilters.length || opts.showSearch !== false)
      ? `<div class="bb-tbl-toolbar">
          ${allFilters.length ? `<div class="row" style="gap:6px;flex-wrap:wrap" role="group" aria-label="Фильтр строк таблицы">
            ${allFilters.map((f) => `<button type="button" class="chip-btn${filter === f.id ? " on" : ""}" data-a="bb-tbl-filter" data-v="${esc(f.id)}">${esc(f.label)}</button>`).join("")}
          </div>` : ""}
          ${opts.showSearch !== false ? `<label class="bb-tbl-search" for="${esc(searchId)}">
            ${EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("search") : ""}
            <input id="${esc(searchId)}" data-a="bb-tbl-q" type="search" value="${esc(opts.query || "")}" placeholder="${esc(searchPlaceholder)}" autocomplete="off" aria-label="Поиск по таблице">
            ${query ? `<button type="button" class="btn ghost sm" data-a="bb-tbl-filter" data-v="all" data-clear-q="1" aria-label="Сбросить поиск">×</button>` : ""}
          </label>` : ""}
        </div>`
      : "";

    const shellHtml = `<div class="bb-table-shell">
      <div class="table-wrap">
        <table class="tbl bb-data-table cols-${cols} is-adaptive">
          <thead>
            <tr>${visibleColumns.map((col) => {
              const thAlign = col.align ? ` style="text-align:${esc(col.align)}"` : "";
              return `<th${thAlign}>${esc(col.label)}</th>`;
            }).join("")}</tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`;

    if (!cardWrap) {
      return `<div class="bb-tbl-inline"${opts.id ? ` id="${esc(opts.id)}"` : ""}>${headerHtml}${toolbarHtml}${shellHtml}</div>`;
    }

    return `<div class="card pad bb-data-table-card" id="${esc(opts.id || "bb-table-demo")}">
      ${headerHtml}
      ${toolbarHtml}
      ${shellHtml}
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
    TABLE_PRESETS,
    dataTableHTML
  };
})();
