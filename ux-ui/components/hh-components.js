/* Переиспользуемые hh.ru-компоненты: ценовые теги, прочерки, ползунок-палка и кнопки отклика. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const esc = EGE.utils.esc;

  function isValidHHMM(s) {
    return /^([01]\d|2[0-3]):([0-5]\d)$/.test(String(s || "").trim());
  }

  function feeSplitHTML(price, TDATA) {
    const total = Math.max(0, Math.round(Number(price) || 0));
    const sp = (TDATA && typeof TDATA.commissionSplit === "function")
      ? TDATA.commissionSplit(total)
      : { total, fee: Math.round(total * 0.05), sbpFee: Math.round(total * 0.01), payout: Math.max(0, total - Math.round(total * 0.05) - Math.round(total * 0.01)), pct: 5, sbpPct: 1 };
    const sbpFee = Number.isFinite(Number(sp.sbpFee)) ? Number(sp.sbpFee) : Math.round(total * 0.01);
    const sbpPct = Number.isFinite(Number(sp.sbpPct)) ? Number(sp.sbpPct) : 1;
    const netPct = Math.max(0, 100 - (Number(sp.pct) || 5) - sbpPct);
    return `<div class="fee-pill"><span>Ученик платит</span><b class="num">${sp.total.toLocaleString("ru-RU")} ₽/ч</b></div>
      <div class="fee-pill"><span>Преподавателю (${netPct}%)</span><b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b></div>
      <div class="fee-pill"><span>Комиссия сервиса (${sp.pct}%)</span><b class="num">${sp.fee.toLocaleString("ru-RU")} ₽</b></div>
      <div class="fee-pill"><span>Шлюз СБП (${sbpPct}%)</span><b class="num">${sbpFee.toLocaleString("ru-RU")} ₽</b></div>`;
  }

  function bidBtnLabelHTML(sent, price) {
    const pStr = Number(price || 0).toLocaleString("ru-RU");
    return sent ? ("✓ Подтверждено · " + pStr + " ₽") : ("Сөп · Предложить " + pStr + " ₽");
  }

  function sakhaBidInnerHTML(sent, price, opts) {
    opts = opts || {};
    const sz = Number(opts.size) || 18;
    const svgFn = (EGE.ui && typeof EGE.ui.sakhaPatternSVG === "function") ? EGE.ui.sakhaPatternSVG : (() => "");
    const label = opts.short
      ? (sent ? "✓ Подтверждено" : "Сөп · Предложить")
      : bidBtnLabelHTML(sent, price);
    const attr = opts.attr ? (" " + opts.attr) : ' data-bid-lbl="1"';
    return `${svgFn("rhombus", sz)}<span${attr}>${esc(label)}</span>${svgFn("lattice", sz)}`;
  }

  function priceHeadlineHTML(marketPrice, offerPrice, isLg) {
    const mktP = Number(marketPrice) || 0;
    const offP = Number(offerPrice) || 0;
    const lgCls = isLg ? " lg" : "";
    if (mktP && offP < mktP) {
      return `<s class="hh-price-old${lgCls} num">${mktP.toLocaleString("ru-RU")} ₽</s><b class="hh-price-now${lgCls} num">${offP.toLocaleString("ru-RU")} ₽/ч</b>`;
    }
    if (mktP && offP > mktP) {
      return `<b class="hh-price-now${lgCls} num">${offP.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted num">рынок ${mktP.toLocaleString("ru-RU")} ₽</span>`;
    }
    return `<b class="hh-price-now${lgCls} num">${offP.toLocaleString("ru-RU")} ₽/ч</b>`;
  }

  function priceDiffTagsHTML(opts) {
    opts = opts || {};
    const tutorPrice = Number(opts.tutorPrice) || 1200;
    const marketPrice = Number(opts.marketPrice) || tutorPrice;
    const offerPrice = Number(opts.offerPrice) || tutorPrice;
    const showAsk = opts.showAsk !== false;
    const diffTutor = Math.max(0, tutorPrice - offerPrice);
    const aboveTutor = Math.max(0, offerPrice - tutorPrice);
    const diffMarket = Math.max(0, marketPrice - offerPrice);
    const aboveMarket = Math.max(0, offerPrice - marketPrice);
    const pctOff = marketPrice > offerPrice ? Math.round(((marketPrice - offerPrice) / marketPrice) * 100) : 0;
    const pctAbove = marketPrice > 0 && aboveMarket > 0 ? Math.round((aboveMarket / marketPrice) * 100) : 0;
    const customBadges = Array.isArray(opts.customBadges)
      ? opts.customBadges.map((s) => String(s || "").trim()).filter(Boolean).slice(0, 2)
      : [];
    const tags = [];
    if (showAsk) tags.push(`<span class="diff-tag rate num">Анкета ${tutorPrice.toLocaleString("ru-RU")} ₽</span>`);
    if (diffTutor > 0) tags.push(`<span class="diff-tag save-hot num">на ${diffTutor.toLocaleString("ru-RU")} ₽ ниже анкеты</span>`);
    else if (aboveTutor > 0) tags.push(`<span class="diff-tag confirm num">+${aboveTutor.toLocaleString("ru-RU")} ₽ к анкете</span>`);
    if (diffMarket > 0) {
      tags.push(`<span class="diff-tag save-cool num">на ${diffMarket.toLocaleString("ru-RU")} ₽ ниже рынка</span>`);
      if (pctOff > 0) tags.push(`<span class="diff-tag save-cyan num">−${pctOff}%</span>`);
    } else if (aboveMarket > 0) {
      tags.push(`<span class="diff-tag pro num">на +${aboveMarket.toLocaleString("ru-RU")} ₽ выше рынка (+${pctAbove}%)</span>`);
      if (!customBadges.length) tags.push(`<span class="diff-tag pro">${esc(opts.qualBadge || "Высокая квалификация")}</span>`);
    } else if (!customBadges.length) {
      tags.push(`<span class="diff-tag rate">По средней цене рынка</span>`);
    }
    customBadges.forEach((badge) => {
      tags.push(`<span class="diff-tag pro">${esc(badge)}</span>`);
    });
    return tags.join("");
  }

  function sliderTicksHTML(hourNum, style, opts) {
    const h = Math.max(10, Math.min(20, Number(hourNum) || 10));
    const idAttr = opts && opts.id ? ` id="${esc(opts.id)}"` : "";
    if (style === "clean") return "";
    if (style === "ruler") {
      return `<div class="hh-slider-ticks ruler"${idAttr} aria-hidden="true">${[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((tick) => {
        const cls = (tick % 2 === 0 ? "major" : "") + (tick === h ? " on" : "");
        return `<i${cls ? ` class="${cls.trim()}"` : ""} data-tick="${tick}"></i>`;
      }).join("")}</div>`;
    }
    return `<div class="hh-slider-ticks" aria-hidden="true">${[10, 12, 14, 16, 18, 20].map((tick) => {
      return `<i${Math.abs(tick - h) <= 1 ? ' class="on"' : ""} data-tick="${tick}"></i>`;
    }).join("")}</div>`;
  }

  const BB_DAYS = [
    { id: "all", wd: "Все", num: "7", full: "Все 7 дней" },
    { id: "sat", wd: "Сб", num: "14", full: "Сб 14" },
    { id: "sun", wd: "Вс", num: "15", full: "Вс 15" },
    { id: "mon", wd: "Пн", num: "16", full: "Пн 16" }
  ];

  function bbDayObj(dayId) {
    return BB_DAYS.find((d) => d.id === dayId) || BB_DAYS[0];
  }

  function hhSelectHTML(opts) {
    opts = opts || {};
    const options = Array.isArray(opts.options) ? opts.options : [];
    const value = opts.value != null ? String(opts.value) : (options[0] ? String(options[0].id) : "");
    const cur = options.find((o) => String(o.id) === value) || options[0] || { id: "", label: "", meta: "" };
    const open = !!opts.open;
    const isPill = !!opts.pill;
    const leadIcon = opts.leadIcon && EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon(opts.leadIcon) : "";
    const okIcon = EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("ok") : "";
    const chevIcon = EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("chevDown") : "";
    return `<div class="hh-select${isPill ? " is-pill" : ""}${open ? " open" : ""}"${opts.id ? ` id="${esc(opts.id)}"` : ""}>
      <button type="button" class="hh-select-btn" data-a="${esc(opts.toggleAction || "")}" aria-haspopup="listbox" aria-expanded="${open}"${opts.ariaLabel ? ` aria-label="${esc(opts.ariaLabel)}"` : ""}>
        <span class="hh-select-val">
          ${leadIcon ? `<span class="hh-select-lead">${leadIcon}</span>` : ""}
          <span class="${isPill ? "num" : ""}">${esc(cur.label)}</span>
          ${cur.meta ? `<span class="hh-select-meta">${esc(cur.meta)}</span>` : ""}
        </span>
        <span class="hh-select-chev">${chevIcon}</span>
      </button>
      ${open ? `<div class="hh-select-menu" role="listbox"${opts.ariaLabel ? ` aria-label="${esc(opts.ariaLabel)}"` : ""}>
        ${options.map((o) => {
          const isOn = String(o.id) === String(cur.id);
          return `<button type="button" class="hh-select-item${isOn ? " on" : ""}" role="option" aria-selected="${isOn}" data-a="${esc(opts.pickAction || "")}" data-v="${esc(o.id)}">
            <span class="hh-select-item-main">
              <span>${esc(o.label)}</span>
              ${o.meta ? `<span class="hh-select-item-sub">${esc(o.meta)}</span>` : ""}
            </span>
            ${isOn ? okIcon : ""}
          </button>`;
        }).join("")}
      </div>` : ""}
    </div>`;
  }

  function hhMultiSelectHTML(opts) {
    opts = opts || {};
    const options = Array.isArray(opts.options) ? opts.options : [];
    const values = Array.isArray(opts.values) ? opts.values.map(String) : [];
    const selectedSet = new Set(values);
    const selectedOpts = options.filter((o) => selectedSet.has(String(o.id)));
    const open = !!opts.open;
    const placeholder = opts.placeholder || "Выберите варианты";
    const leadIcon = opts.leadIcon && EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon(opts.leadIcon) : "";
    const checkIcon = EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("check") : "";
    const chevIcon = EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("chevDown") : "";
    const valHTML = selectedOpts.length
      ? selectedOpts.map((o) => `<span class="hh-multi-pill"><span>${esc(o.short || o.label)}</span><button type="button" class="hh-multi-x" data-a="${esc(opts.pickAction || "")}" data-v="${esc(o.id)}" title="Убрать ${esc(o.label)}" aria-label="Убрать ${esc(o.label)}">×</button></span>`).join("")
      : `<span class="muted">${esc(placeholder)}</span>`;
    return `<div class="hh-select hh-multi${open ? " open" : ""}"${opts.id ? ` id="${esc(opts.id)}"` : ""}>
      <div class="hh-select-btn hh-multi-btn" role="combobox" tabindex="0" data-a="${esc(opts.toggleAction || "")}" aria-haspopup="listbox" aria-expanded="${open}"${opts.ariaLabel ? ` aria-label="${esc(opts.ariaLabel)}"` : ""}>
        <span class="hh-multi-val">
          ${leadIcon ? `<span class="hh-select-lead">${leadIcon}</span>` : ""}
          ${valHTML}
        </span>
        <span class="hh-multi-right">
          ${selectedOpts.length ? `<span class="hh-select-meta num">${selectedOpts.length}</span>` : ""}
          <span class="hh-select-chev">${chevIcon}</span>
        </span>
      </div>
      ${open ? `<div class="hh-select-menu" role="listbox" aria-multiselectable="true"${opts.ariaLabel ? ` aria-label="${esc(opts.ariaLabel)}"` : ""}>
        ${options.map((o) => {
          const isOn = selectedSet.has(String(o.id));
          return `<button type="button" class="hh-select-item${isOn ? " on" : ""}" role="option" aria-selected="${isOn}" data-a="${esc(opts.pickAction || "")}" data-v="${esc(o.id)}">
            <span class="hh-multi-item-left">
              <span class="hh-multi-check${isOn ? " on" : ""}" aria-hidden="true">${isOn ? checkIcon : ""}</span>
              <span class="hh-select-item-main">
                <span>${esc(o.label)}</span>
                ${o.meta ? `<span class="hh-select-item-sub">${esc(o.meta)}</span>` : ""}
              </span>
            </span>
          </button>`;
        }).join("")}
      </div>` : ""}
    </div>`;
  }

  function tutorAvatarHTML(tutor, opts) {
    opts = opts || {};
    const photo = tutor && tutor.photo ? String(tutor.photo).trim() : "";
    const extraCls = opts.cls ? " " + esc(opts.cls) : "";
    if (photo) {
      const alt = esc((tutor && tutor.name) || "Фото преподавателя");
      return `<span class="tutor-avatar has-photo${extraCls}"><img src="${esc(photo)}" alt="${alt}"></span>`;
    }
    return `<span class="tutor-avatar is-no-photo${extraCls}" aria-label="Без фото"><span>Без фото</span></span>`;
  }

  EGE.hh = {
    isValidHHMM,
    feeSplitHTML,
    bidBtnLabelHTML,
    sakhaBidInnerHTML,
    priceHeadlineHTML,
    priceDiffTagsHTML,
    sliderTicksHTML,
    BB_DAYS,
    bbDayObj,
    hhSelectHTML,
    hhMultiSelectHTML,
    tutorAvatarHTML
  };
})();
