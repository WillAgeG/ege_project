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
    const td = TDATA || EGE.tutors;
    if (!td || typeof td.commissionSplit !== "function") return "";
    const sp = td.commissionSplit(price);
    return `<div class="fee-pill"><span>Ученик платит</span><b class="num">${sp.total.toLocaleString("ru-RU")} ₽/ч</b></div>
      <div class="fee-pill"><span>Преподавателю (95%)</span><b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b></div>
      <div class="fee-pill"><span>Комиссия сервиса (${sp.pct}%)</span><b class="num">${sp.fee.toLocaleString("ru-RU")} ₽</b></div>`;
  }

  function bidBtnLabelHTML(sent, price) {
    const pStr = Number(price || 0).toLocaleString("ru-RU");
    return sent ? ("✓ Подтверждено · " + pStr + " ₽") : ("Предложить " + pStr + " ₽");
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
    const tags = [];
    if (showAsk) tags.push(`<span class="diff-tag rate num">Анкета ${tutorPrice.toLocaleString("ru-RU")} ₽</span>`);
    if (diffTutor > 0) tags.push(`<span class="diff-tag save-hot num">на ${diffTutor.toLocaleString("ru-RU")} ₽ ниже анкеты</span>`);
    else if (aboveTutor > 0) tags.push(`<span class="diff-tag confirm num">+${aboveTutor.toLocaleString("ru-RU")} ₽ к анкете</span>`);
    if (diffMarket > 0) {
      tags.push(`<span class="diff-tag save-cool num">на ${diffMarket.toLocaleString("ru-RU")} ₽ ниже рынка</span>`);
      if (pctOff > 0) tags.push(`<span class="diff-tag save-cyan num">−${pctOff}%</span>`);
    } else if (aboveMarket > 0) {
      tags.push(`<span class="diff-tag pro num">на +${aboveMarket.toLocaleString("ru-RU")} ₽ выше рынка (+${pctAbove}%)</span>`);
      tags.push(`<span class="diff-tag pro">${esc(opts.qualBadge || "Высокая квалификация")}</span>`);
    } else {
      tags.push(`<span class="diff-tag rate">По средней цене рынка</span>`);
    }
    return tags.join("");
  }

  function sliderTicksHTML(hourNum, style) {
    const h = Math.max(10, Math.min(20, Number(hourNum) || 10));
    if (style === "clean") return "";
    if (style === "ruler") {
      return `<div class="hh-slider-ticks ruler" aria-hidden="true">${[10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map((tick) => {
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
    const okIcon = EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("ok") : "";
    const chevIcon = EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon("chevDown") : "";
    return `<div class="hh-select${open ? " open" : ""}"${opts.id ? ` id="${esc(opts.id)}"` : ""}>
      <button type="button" class="hh-select-btn" data-a="${esc(opts.toggleAction || "")}" aria-haspopup="listbox" aria-expanded="${open}">
        <span class="hh-select-val">
          <span>${esc(cur.label)}</span>
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

  EGE.hh = {
    isValidHHMM,
    feeSplitHTML,
    bidBtnLabelHTML,
    priceHeadlineHTML,
    priceDiffTagsHTML,
    sliderTicksHTML,
    BB_DAYS,
    bbDayObj,
    hhSelectHTML
  };
})();
