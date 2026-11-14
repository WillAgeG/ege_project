/* Маркетплейс репетиторов: каталог, фильтры, тарифы 0/5k/10k, модалка записи и вкладка «Учёба». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural, initials } = EGE.utils;
  const { icon } = EGE.ui;
  const { isValidHHMM, priceHeadlineHTML, priceDiffTagsHTML } = EGE.hh;

  let _ctx = {};

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
  }

  function getMkt() {
    return typeof _ctx.mkt === "function" ? _ctx.mkt() : { bookings: [], favs: [], balance: 0, planId: "free", maxPrice: 2000, day: "all", hour: "all", exam: "all", format: "all", subject: "all", sort: "actual" };
  }

  function getUi() {
    return _ctx.ui || {};
  }

  function plansSectionHTML() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const st = getMkt();
    const rate = st.calcRate || 800;
    const rates = [800, 1000, 1250, 1500];
    const cards = TDATA.PLANS.map((p) => {
      const picked = st.planId === p.id;
      const lessons = p.balance > 0 ? Math.max(1, Math.floor(p.balance / rate)) : 0;
      const note = p.balance > 0
        ? `≈ ${lessons} ${plural(lessons, "урок", "урока", "уроков")} по ${rate} ₽/ч с баланса`
        : "Тесты, конспекты и огромная база репетиторов";
      return `<article class="card pad-lg plan-card${p.featured ? " featured" : ""}${p.super ? " super" : ""}${picked ? " picked" : ""}">
        <div class="stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <span class="chip ${p.super || p.featured ? "accent" : p.balance ? "leaf" : ""}">${esc(p.badge)}</span>
            ${picked ? '<span class="chip good">Выбран сейчас</span>' : ""}
          </div>
          <div>
            <h3 class="h2">${esc(p.name)}</h3>
            <div class="plan-price num" style="margin-top:6px">${esc(p.priceLabel)}</div>
            <div class="small muted">${esc(p.period)}</div>
          </div>
          <p class="small ink2">${esc(p.tagline)}</p>
          <div class="chip">${esc(note)}</div>
          <ul class="plan-feats">${p.features.map((f) => `<li><span>${esc(f)}</span></li>`).join("")}</ul>
        </div>
        <div class="stack" style="gap:8px">
          <button type="button" class="btn${picked && p.id !== "free" ? " is-confirmed" : (p.featured || p.super ? "" : " soft")}" data-a="mkt-plan" data-id="${p.id}"${picked && p.id !== "free" ? ' aria-current="true"' : ""}>${picked && p.id !== "free" ? "✓ Баланс активен · " + st.balance.toLocaleString("ru-RU") + " ₽" : esc(p.cta)}</button>
          ${p.balance > 0 ? `<button type="button" class="link-btn small muted" data-a="go" data-v="fees" style="justify-self:start">Условия оплаты и сервисный сбор →</button>` : ""}
        </div>
      </article>`;
    }).join("");
    return `<section class="land-sec" id="land-plans" aria-label="Тарифы и баланс">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">3 вида подписки · баланс на занятия</div>
          <h2 class="h2">Баланс 5 000 / 10 000 ₽ на репетиторов или базовый доступ</h2>
          <p class="small muted">Средства хранятся на балансе и списываются только после согласия преподавателя. <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent)">Подробнее об оплате и правилах сервиса →</a></p>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <span class="small muted">Ставка для расчёта:</span>
          ${rates.map((r) => `<button type="button" class="chip-btn${rate === r ? " on" : ""}" data-a="mkt-calc" data-rate="${r}">${r} ₽/ч</button>`).join("")}
        </div>
      </div>
      <div class="plan-grid">${cards}</div>
    </section>`;
  }

  /** Карточка преподавателя в стиле hh.ru без зелёных оттенков. */
  function tutorCardHTML(t, opts) {
    opts = opts || {};
    const TDATA = getTDATA();
    const st = getMkt();
    const isFav = Array.isArray(st.favs) && st.favs.includes(t.id);
    const activeDow = opts.activeDow !== undefined ? opts.activeDow : "all";
    const daySlots = TDATA.tutorSlotsForDay(t, activeDow).slice(0, 5);
    const pickHour = opts.pickHour || (st.hour !== "all" ? st.hour : (daySlots[0] || t.availableFrom || "10:00"));
    const winTxt = t.windowLabel || ("с " + t.availableFrom + " до " + t.availableTo);
    const belowRub = t.belowRub != null ? t.belowRub : Math.max(0, (t.marketPrice || t.price) - t.price);
    const aboveRub = t.aboveRub != null ? t.aboveRub : Math.max(0, t.price - (t.marketPrice || t.price));
    const qualLine = t.qualBadge || "Высокая квалификация";
    return `<article class="card tutor-card">
      <div class="stack" style="gap:10px">
        <div class="tutor-head">
          <div style="min-width:0">
            <h3 class="h3" style="font-size:17px">Репетитор · ${esc(t.subjectName)}</h3>
            <div class="hh-price-row" style="margin-top:4px">
              ${aboveRub > 0
                ? `<div class="tutor-rate num">${t.price.toLocaleString("ru-RU")} ₽/ч</div><span class="small muted num">рынок ${t.marketPrice.toLocaleString("ru-RU")} ₽</span>`
                : `${t.marketPrice ? `<s class="hh-price-old num">${t.marketPrice.toLocaleString("ru-RU")} ₽</s>` : ""}<div class="tutor-rate num">${t.price.toLocaleString("ru-RU")} ₽/ч</div>`}
            </div>
            <div class="hh-diff-strip" style="margin-top:6px">
              ${belowRub > 0 ? `<span class="diff-tag save-cool num">на ${belowRub.toLocaleString("ru-RU")} ₽ ниже рынка</span>` : ""}
              ${t.belowPct ? `<span class="diff-tag save-cyan num">−${t.belowPct}%</span>` : ""}
              ${aboveRub > 0 ? `<span class="diff-tag pro num">на +${aboveRub.toLocaleString("ru-RU")} ₽ выше рынка</span><span class="diff-tag pro">${esc(qualLine)}</span>` : ""}
            </div>
          </div>
          <button type="button" class="fav-btn" data-a="mkt-fav" data-id="${esc(t.id)}" aria-pressed="${isFav}" aria-label="В избранное">${icon(isFav ? "heartFill" : "heart")}</button>
        </div>
        <div class="tutor-name-line">
          <b style="color:var(--ink)">${esc(t.name)}</b>
          ${t.verified ? `<span class="verified-badge" title="Проверенная анкета">${icon("check")}</span>` : ""}
          <span class="small muted">· ${esc(t.city)} · ★ ${t.rating.toFixed(1)} (${t.reviews})</span>
        </div>
        <div class="tutor-tags">
          <span class="tutor-tag-pill">${esc(t.source || "Доска Ykt")} · ${esc(winTxt)}</span>
          <span class="tutor-tag-pill">${esc(t.exams.join(" и "))}</span>
          <span class="tutor-tag-pill">${esc(t.exp)}</span>
          <span class="tutor-tag-pill">${esc(t.formats.join(" / "))}</span>
          <span class="tutor-tag-pill">${esc(t.tag)}</span>
        </div>
        <p class="tutor-bio">${esc(t.bio)}</p>
        <div class="row between small muted" style="gap:6px;flex-wrap:wrap">
          <span>${esc(t.bumpText)}</span>
          <span class="num">Можно −100 ₽ от ${t.minFair} ₽/ч</span>
        </div>
        ${daySlots.length ? `<div class="slot-mini-row">
          <span class="small muted">${opts.dayLabel ? esc(opts.dayLabel) + ":" : "Слоты:"}</span>
          ${daySlots.map((h) => `<button type="button" class="slot-mini${st.hour === h ? " picked" : ""}" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(h)}">${esc(h)}</button>`).join("")}
        </div>` : ""}
      </div>
      <div class="tutor-actions single">
        <button type="button" class="btn" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(pickHour)}">Предложить ${t.price.toLocaleString("ru-RU")} ₽</button>
      </div>
    </article>`;
  }

  function bookingsStripHTML(st) {
    const TDATA = getTDATA();
    if (!TDATA || !st.bookings.length) return "";
    return `<div class="reqs-strip">${st.bookings.map((bk) => {
      const accepted = bk.status === "accepted";
      const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId);
      const waHref = accepted
        ? TDATA.whatsappUrl(tutor || { name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" }, `Здравствуйте, ${bk.tutorName}! Напоминаю про занятие (${bk.subjectName}, ${bk.dayLabel} в ${bk.hour}, ставка ${bk.offerPrice} ₽/ч).`)
        : "";
      return `<div class="req-item">
        <div class="stack" style="gap:3px;min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <b>${esc(bk.tutorName)}</b>
            <span class="chip">${esc(bk.exam)} · ${esc(bk.subjectName)}</span>
            <span class="chip ${accepted ? "accent" : "notif"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>
          </div>
          <div class="small ink2">${esc(bk.dayLabel)} в ${esc(bk.hour)} (${esc(bk.format)}) · твоя ставка <b class="num">${bk.offerPrice} ₽/ч</b> <span class="muted">(вместо ${bk.tutorPrice} ₽)</span></div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${accepted ? `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать</span></a>` : ""}
          ${!accepted ? `<button type="button" class="btn soft sm" data-a="mkt-sim-accept" data-id="${esc(bk.id)}">Тест: подтвердить</button>` : ""}
          <button type="button" class="btn ${accepted ? "ghost" : "danger bb-btn-adaptive"} sm" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">${accepted ? "Сменить репетитора" : "Отменить"}</button>
        </div>
      </div>`;
    }).join("")}</div>`;
  }

  function activeFilterCount(st) {
    st = st || getMkt();
    let n = 0;
    if (st.exam && st.exam !== "all") n++;
    if (st.format && st.format !== "all") n++;
    if (st.subject && st.subject !== "all") n++;
    if (st.maxPrice && st.maxPrice < 2000) n++;
    if (st.onlyBumped) n++;
    if (st.day && st.day !== "all") n++;
    if (st.hour && st.hour !== "all") n++;
    if (st.q && String(st.q).trim()) n++;
    return n;
  }

  function bookingModalHTML() {
    const ui = getUi();
    const TDATA = getTDATA();
    if (!ui.booking || !TDATA) return "";
    const b = ui.booking, tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
    if (!tutor) return "";
    const days = TDATA.buildCalendarDays(7);
    const dayObj = days.find((d) => d.iso === b.dayIso) || days[0];
    const daySlots = TDATA.tutorSlotsForDay(tutor, dayObj.dow);
    const curHour = isValidHHMM(b.hour) ? b.hour : (daySlots[0] || "10:00");
    const curHourNum = Math.max(10, Math.min(20, parseInt(String(curHour).split(":")[0], 10) || 10));
    const curHourPct = Math.round(((curHourNum - 10) / 10) * 100);
    const sig = TDATA.offerSignal(tutor.price, b.offerPrice);
    const preview = TDATA.botPreviewText({
      exam: b.exam,
      subjectName: tutor.subjectName,
      format: b.format,
      dayLabel: dayObj.fullLabel,
      hour: curHour,
      offerPrice: b.offerPrice,
      tutorPrice: tutor.price
    });
    const st = getMkt();
    const n5 = b.offerPrice > 0 ? Math.floor(5000 / b.offerPrice) : 0;
    const n10 = b.offerPrice > 0 ? Math.floor(10000 / b.offerPrice) : 0;
    const winTxt = tutor.windowLabel || ("с " + tutor.availableFrom + " до " + tutor.availableTo);
    const inWin = typeof TDATA.tutorInWindow === "function" ? TDATA.tutorInWindow(tutor, curHour) : true;
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="book-modal-title">
      <div class="modal-card">
        <div class="modal-head">
          <div class="row" style="gap:8px">${icon("cal")}<b id="book-modal-title">Запись · ${esc(tutor.name)}</b></div>
          <button type="button" class="icon-btn sm" data-a="book-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="row between small muted" style="flex-wrap:wrap;gap:6px">
          <span>${esc(tutor.subjectName)} · ${esc(tutor.source)} · окно <b>${esc(winTxt)}</b></span>
          <span>Баланс: <b class="num">${st.balance.toLocaleString("ru-RU")} ₽</b></span>
        </div>
        <div class="fields">
          <div class="field">
            <label>Экзамен</label>
            <div class="switch">${tutor.exams.map((ex) => `<button type="button" data-a="book-exam" data-v="${esc(ex)}" aria-pressed="${b.exam === ex}">${esc(ex)}</button>`).join("")}</div>
          </div>
          <div class="field">
            <label>Формат</label>
            <div class="switch">${tutor.formats.map((fm) => `<button type="button" data-a="book-format" data-v="${esc(fm)}" aria-pressed="${b.format === fm}">${esc(fm)}</button>`).join("")}</div>
          </div>
        </div>
        <div class="field">
          <label>Выбери день</label>
          <div class="cal-days">${days.map((d) => {
            const cnt = TDATA.tutorSlotsForDay(tutor, d.dow).length;
            if (!cnt) return "";
            const on = d.iso === dayObj.iso;
            return `<button type="button" class="day-cir${on ? " on" : ""}" data-a="book-day" data-v="${d.iso}"><span class="day-wd">${esc(d.wd)}</span><span class="day-dot">${d.num}</span><span class="day-cnt">${cnt} слот.</span></button>`;
          }).join("")}</div>
        </div>
        <div class="field">
          <label>Выбери час с 10:00 до 20:00 (${esc(winTxt)})</label>
          <div class="hh-time-picker">
            <div class="row between">
              <span class="small muted">Время занятия</span>
              <span class="hh-time-val num" id="bid-hour-pill">${esc(curHour)}</span>
            </div>
            <input class="hh-time-range" id="bid-hour-range" type="range" min="10" max="20" step="1" value="${curHourNum}" style="--pct:${curHourPct}%" aria-label="Час занятия с 10:00 до 20:00">
            <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
          </div>
          <div class="bid-time-row" style="margin-top:8px">
            <span class="small muted" id="bid-win-status">${inWin ? `Входит в свободное окно (${esc(winTxt)})` : `Вне типового окна (${esc(winTxt)}) — уточним и уведомим`}</span>
            <input class="input num" id="bid-custom-time" type="time" value="${esc(curHour)}" aria-label="Выбрать точное время урока" style="width:120px">
          </div>
        </div>
        <div class="field">
          <label for="bid-price">Твоя цена за занятие (₽/ч)</label>
          <div class="hh-price-row" id="bid-price-row" style="margin-bottom:4px">
            ${priceHeadlineHTML(tutor.marketPrice, b.offerPrice, false)}
          </div>
          <div class="hh-diff-strip" id="bid-diff-strip" style="margin-bottom:4px">
            ${priceDiffTagsHTML({ tutorPrice: tutor.price, marketPrice: tutor.marketPrice || tutor.price, offerPrice: b.offerPrice, qualBadge: tutor.qualBadge })}
          </div>
          <div class="hh-price-stepper">
            <button type="button" class="hh-step-btn" data-a="bid-step" data-step="-100">−100 ₽</button>
            <input class="input bid-input num" id="bid-price" type="number" min="500" max="5000" step="50" inputmode="numeric" value="${b.offerPrice}">
            <button type="button" class="hh-step-btn" data-a="bid-step" data-step="100">+100 ₽</button>
          </div>
          <div id="bid-signal" class="small"><span class="chip ${sig.tone}">${esc(sig.label)}</span></div>
        </div>
        <div class="field">
          <label for="bid-note">Пожелания по подготовке (необязательно)</label>
          <input class="input" id="bid-note" maxlength="140" placeholder="Например: цель 80+ баллов, разбор устной части и эссе" value="${esc(b.note || "")}">
        </div>
        <div class="bot-preview">
          <b class="small">Детали заявки (уведомим о подтверждении):</b>
          <span id="bot-preview-txt">${esc(preview)}</span>
          <span class="small muted">На «Пробник» (5 000 ₽) хватит на <b>${n5} ур.</b> · на «Месяц» (10 000 ₽) на <b>${n10} ур.</b></span>
        </div>
        <div class="row between" style="flex-wrap:wrap;gap:8px;align-items:center">
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn" id="bid-submit-btn" data-a="book-submit">Предложить ${b.offerPrice.toLocaleString("ru-RU")} ₽</button>
            <button type="button" class="btn ghost" data-a="book-close">Отмена</button>
          </div>
          <button type="button" class="link-btn small muted" data-a="go-fees">Условия оплаты и сбор системы →</button>
        </div>
      </div>
    </div>`;
  }

  function updateBookingModalLive() {
    const ui = getUi();
    const TDATA = getTDATA();
    if (!ui.booking || !TDATA) return;
    const b = ui.booking, tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
    if (!tutor) return;
    const days = TDATA.buildCalendarDays(7);
    const dayObj = days.find((d) => d.iso === b.dayIso) || days[0];
    const hourPill = document.getElementById("bid-hour-pill");
    if (hourPill) hourPill.textContent = b.hour;
    const hourRange = document.getElementById("bid-hour-range");
    if (hourRange) {
      const hNum = Math.max(10, Math.min(20, parseInt(String(b.hour || "10").slice(0, 2), 10) || 10));
      hourRange.value = String(hNum);
      if (hourRange.style && typeof hourRange.style.setProperty === "function") {
        hourRange.style.setProperty("--pct", ((hNum - 10) * 10) + "%");
      }
    }
    const customEl = document.getElementById("bid-custom-time");
    if (customEl && customEl.value !== b.hour && document.activeElement !== customEl) {
      customEl.value = b.hour;
    }
    const priceRowEl = document.getElementById("bid-price-row");
    if (priceRowEl) {
      priceRowEl.innerHTML = priceHeadlineHTML(tutor.marketPrice, b.offerPrice, false);
    }
    const diffEl = document.getElementById("bid-diff-strip");
    if (diffEl) {
      diffEl.innerHTML = priceDiffTagsHTML({ tutorPrice: tutor.price, marketPrice: tutor.marketPrice || tutor.price, offerPrice: b.offerPrice, qualBadge: tutor.qualBadge });
    }
    const subBtn = document.getElementById("bid-submit-btn");
    if (subBtn) subBtn.textContent = `Предложить ${b.offerPrice.toLocaleString("ru-RU")} ₽`;
    const sigEl = document.getElementById("bid-signal");
    if (sigEl) {
      const sig = TDATA.offerSignal(tutor.price, b.offerPrice);
      sigEl.innerHTML = `<span class="chip ${sig.tone}">${esc(sig.label)}</span>`;
    }
    const winEl = document.getElementById("bid-win-status");
    if (winEl && typeof TDATA.tutorInWindow === "function") {
      const winTxt = tutor.windowLabel || ("с " + tutor.availableFrom + " до " + tutor.availableTo);
      const inWin = TDATA.tutorInWindow(tutor, b.hour);
      winEl.textContent = inWin
        ? `Входит в свободное окно (${winTxt})`
        : `Вне типового окна (${winTxt}) — уточним и уведомим`;
    }
    const prevEl = document.getElementById("bot-preview-txt");
    if (prevEl) {
      prevEl.textContent = TDATA.botPreviewText({
        exam: b.exam,
        subjectName: tutor.subjectName,
        format: b.format,
        dayLabel: dayObj.fullLabel,
        hour: b.hour,
        offerPrice: b.offerPrice,
        tutorPrice: tutor.price
      });
    }
  }

  function filterModalHTML() {
    const ui = getUi();
    const TDATA = getTDATA();
    if (!ui.filterModal || !TDATA) return "";
    const st = getMkt();
    const days = TDATA.buildCalendarDays(7);
    const activeDayObj = st.day !== "all" ? (days.find((d) => d.iso === st.day) || null) : null;
    const list = TDATA.filterTutors(st, days);
    const totalWord = plural(list.length, "репетитора", "репетиторов", "репетиторов");
    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="filter-modal-title">
      <div class="modal-card sheet-modal">
        <div class="sheet-head">
          <button type="button" class="icon-btn sm" data-a="filter-close" aria-label="Назад">${icon("back")}</button>
          <b id="filter-modal-title" style="text-align:center;font-size:17px">Фильтры</b>
          <button type="button" class="link-btn small" data-a="mkt-reset">Сбросить</button>
        </div>
        <div class="sheet-body">
          <div class="hh-search-box">
            <span class="hh-search-ico">${icon("search")}</span>
            <input class="hh-search-input" id="mkt-q-modal" type="search" autocomplete="off" spellcheck="false" value="${esc(st.q || "")}" placeholder="Предмет, тема или имя репетитора">
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Экзамен</div>
            <div class="chip-rail">
              ${[["all", "Все"], ["ЕГЭ", "ЕГЭ"], ["ОГЭ", "ОГЭ"]].map(([v, l]) => `<button type="button" class="chip-btn${st.exam === v ? " on" : ""}" data-a="mkt-exam" data-v="${v}">${l}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Актуальность анкеты</div>
            <div class="chip-rail">
              <button type="button" class="chip-btn${!st.onlyBumped ? " on" : ""}" data-a="mkt-bumped-set" data-v="0">За всё время</button>
              <button type="button" class="chip-btn${st.onlyBumped ? " on" : ""}" data-a="mkt-bumped-set" data-v="1">Подняты сегодня</button>
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Предмет</div>
            <div class="chip-rail">
              <button type="button" class="chip-btn${st.subject === "all" ? " on" : ""}" data-a="mkt-subj" data-v="all">Все</button>
              ${TDATA.SUBJECTS.map((sb) => `<button type="button" class="chip-btn${st.subject === sb.id ? " on" : ""}" data-a="mkt-subj" data-v="${sb.id}">${esc(sb.short)}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Формат</div>
            <div class="chip-rail">
              ${[["all", "Любой"], ["Онлайн", "Онлайн"], ["Очно", "Очно"]].map(([v, l]) => `<button type="button" class="chip-btn${st.format === v ? " on" : ""}" data-a="mkt-format" data-v="${v}">${l}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="row between"><span class="small muted">Ставка до</span><b class="num">${st.maxPrice >= 2000 ? "до 2 000+ ₽/ч" : "до " + st.maxPrice + " ₽/ч"}</b></div>
            <div class="chip-rail">
              ${[1000, 1300, 1600, 2000].map((pr) => `<button type="button" class="chip-btn${st.maxPrice === pr ? " on" : ""}" data-a="mkt-price" data-v="${pr}">${pr >= 2000 ? "Любая" : "до " + pr + " ₽"}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">Время занятия</div>
            <div class="hour-circles">
              <button type="button" class="hr-cir${st.hour === "all" ? " on" : ""}" data-a="mkt-hour" data-v="all">Любое</button>
              ${TDATA.HOURS.map((h) => `<button type="button" class="hr-cir${st.hour === h ? " on" : ""}" data-a="mkt-hour" data-v="${esc(h)}">${esc(h)}</button>`).join("")}
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">День недели (${activeDayObj ? esc(activeDayObj.shortLabel) : "все 7 дней"})</div>
            <div class="cal-days">
              <button type="button" class="day-cir${st.day === "all" ? " on" : ""}" data-a="mkt-day" data-v="all"><span class="day-wd">Все</span><span class="day-dot">7</span></button>
              ${days.map((d) => `<button type="button" class="day-cir${st.day === d.iso ? " on" : ""}" data-a="mkt-day" data-v="${d.iso}"><span class="day-wd">${esc(d.wd)}</span><span class="day-dot">${d.num}</span></button>`).join("")}
            </div>
          </div>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn" style="width:100%" data-a="filter-close">Показать ${list.length} ${totalWord}</button>
        </div>
      </div>
    </div>`;
  }

  function marketSectionHTML() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const st = getMkt();
    const days = TDATA.buildCalendarDays(7);
    const activeDayObj = st.day !== "all" ? (days.find((d) => d.iso === st.day) || null) : null;
    const activeDow = activeDayObj ? activeDayObj.dow : "all";
    const list = TDATA.filterTutors(st, days);
    const activePlan = TDATA.PLANS.find((p) => p.id === st.planId) || TDATA.PLANS[0];
    const fCount = activeFilterCount(st);

    const dayPills = `<button type="button" class="day-cir${st.day === "all" ? " on" : ""}" data-a="mkt-day" data-v="all">
        <span class="day-wd">Все</span>
        <span class="day-dot">7</span>
        <span class="day-cnt">${days[0].num}–${days[days.length - 1].num} ${days[0].month}</span>
      </button>` + days.map((d) => {
        const cnt = TDATA.countForDay(st, d.dow);
        return `<button type="button" class="day-cir${st.day === d.iso ? " on" : ""}" data-a="mkt-day" data-v="${d.iso}">
          <span class="day-wd">${esc(d.wd)}</span>
          <span class="day-dot">${d.num}</span>
          <span class="day-cnt">${cnt ? cnt + " преп." : "нет"}</span>
        </button>`;
      }).join("");

    const hourPills = `<button type="button" class="hr-cir${st.hour === "all" ? " on" : ""}" data-a="mkt-hour" data-v="all">Любое</button>` +
      TDATA.HOURS.map((h) => {
        const cnt = TDATA.countForHour(st, activeDow, h);
        return `<button type="button" class="hr-cir${st.hour === h ? " on" : ""}${cnt === 0 ? " empty-slot" : ""}" data-a="mkt-hour" data-v="${esc(h)}"><span>${esc(h)}</span><span class="hr-cnt">${cnt}</span></button>`;
      }).join("");

    const activeChips = [];
    if (st.subject !== "all") {
      const sb = TDATA.SUBJECTS.find((x) => x.id === st.subject);
      if (sb) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="subject">${esc(sb.short)} ×</button>`);
    }
    if (st.format !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="format">${esc(st.format)} ×</button>`);
    if (st.maxPrice < 2000) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="maxPrice">до ${st.maxPrice} ₽ ×</button>`);
    if (st.onlyBumped) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="onlyBumped">Подняты сегодня ×</button>`);
    if (st.hour !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="hour">${esc(st.hour)} ×</button>`);

    const sortLabels = { actual: "По соответствию", price_asc: "Сначала дешевле", rating_desc: "По рейтингу" };
    const cardsHTML = list.length
      ? `<div class="tutor-grid">${list.map((t) => tutorCardHTML(t, { activeDow, dayLabel: activeDayObj ? activeDayObj.wd : "" })).join("")}</div>`
      : `<div class="empty">
          <b>По выбранным фильтрам и времени пока никого нет.</b>
          <span>Попробуй расширить бюджет, выбрать «Все» дни или сбросить час.</span>
          <button type="button" class="btn soft sm" data-a="mkt-reset">Сбросить фильтры</button>
        </div>`;

    const selTimeDesc = (activeDayObj ? activeDayObj.shortLabel : "Все 7 дней") + " · " + (st.hour === "all" ? "любое время" : st.hour);
    const mktHourNum = st.hour !== "all" ? Math.max(10, Math.min(20, parseInt(String(st.hour).split(":")[0], 10) || 10)) : 10;
    const mktHourPct = Math.round(((mktHourNum - 10) / 10) * 100);

    return `<section class="land-sec" id="land-market" aria-label="Маркетплейс репетиторов">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Огромная база · ${TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL.toLocaleString("ru-RU") + "+ анкет" : "Ykt, Telegram, WhatsApp, MAX и др."}</div>
          <h2 class="h2">Ищи репетиторов ниже рынка для любой задачи</h2>
        </div>
      </div>
      <div class="hh-seg" role="group" aria-label="Цель подготовки">
        ${[["all", "Любая цель"], ["ЕГЭ", "ЕГЭ"], ["ОГЭ", "ОГЭ"], ["Навыки", "Навыки и ВУЗ"]].map(([v, l]) => `<button type="button" data-a="mkt-exam" data-v="${v}" aria-pressed="${st.exam === v}">${l}</button>`).join("")}
      </div>

      <div class="hh-search-box">
        <span class="hh-search-ico">${icon("search")}</span>
        <input class="hh-search-input" id="mkt-q" type="search" autocomplete="off" spellcheck="false" value="${esc(st.q || "")}" placeholder="ЕГЭ, Python, UX/UI, моушен-дизайн, вокал, физика или имя репетитора">
        ${st.q ? `<button type="button" class="search-clear" data-a="mkt-clear-q" aria-label="Очистить">${icon("x")}</button>` : ""}
      </div>

      <div class="chip-rail swipe" role="group" aria-label="Быстрые фильтры">
        <button type="button" class="chip-btn${fCount ? " on" : ""}" data-a="filter-open">${icon("sliders")}<span>${fCount ? fCount : "Фильтры"}</span></button>
        ${activeChips.join("")}
        ${!st.onlyBumped ? `<button type="button" class="chip-btn" data-a="mkt-bumped">+ Актуальные сегодня</button>` : ""}
        ${st.maxPrice >= 2000 ? `<button type="button" class="chip-btn" data-a="mkt-price" data-v="1300">+ До 1 300 ₽</button>` : ""}
        <button type="button" class="chip-btn" data-a="mkt-preset">+ Английский · Сб 10:00</button>
        ${TDATA.SUBJECTS.filter((sb) => sb.id !== st.subject).map((sb) => `<button type="button" class="chip-btn" data-a="mkt-subj" data-v="${sb.id}">+ ${esc(sb.short)}</button>`).join("")}
      </div>

      <div class="wallet-bar">
        <div class="stack" style="gap:2px">
          <span class="small muted">Тариф: <b style="color:var(--ink)">${esc(activePlan.name)}</b></span>
          <div class="row" style="gap:10px;align-items:baseline">
            <span class="wallet-num num">${st.balance.toLocaleString("ru-RU")} ₽</span>
            <span class="small muted">${st.balance ? "доступно на уроки с любым репетитором" : "пополни баланс 5 000 или 10 000 ₽ для записи с гарантией"}</span>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn ${st.planId === "trial5k" ? "" : "soft"} sm" data-a="mkt-plan" data-id="trial5k">Баланс 5 000 ₽</button>
          <button type="button" class="btn ${st.planId === "month10k" ? "" : "soft"} sm" data-a="mkt-plan" data-id="month10k">Баланс 10 000 ₽</button>
        </div>
      </div>

      ${bookingsStripHTML(st)}

      <div class="card mkt-controls">
        <div class="cal-label">
          <b>Когда удобно заниматься (10:00 – 20:00)</b>
          <span class="chip accent">${esc(selTimeDesc)}</span>
        </div>
        <div class="cal-days" aria-label="Дни недели">${dayPills}</div>
        <div class="hh-time-picker">
          <div class="row between">
            <span class="small muted">Ползунок часа с 10:00 до 20:00</span>
            <div class="row" style="gap:6px">
              <button type="button" class="chip-btn${st.hour === "all" ? " on" : ""}" data-a="mkt-hour" data-v="all">Любое время</button>
              <span class="hh-time-val num" id="mkt-hour-pill">${st.hour === "all" ? "Все часы" : esc(st.hour)}</span>
            </div>
          </div>
          <input class="hh-time-range" id="mkt-hour-range" type="range" min="10" max="20" step="1" value="${mktHourNum}" style="--pct:${mktHourPct}%" aria-label="Выбрать час с 10:00 до 20:00">
          <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
        </div>
        <div class="hour-circles" aria-label="Часы занятий">${hourPills}</div>
        <div class="small muted">Анкеты объединены с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов — выбирай удобный час или предлагай свою ставку.</div>
      </div>

      <div class="hh-sort-row">
        <span class="small muted">${list.length} ${plural(list.length, "репетитор", "репетитора", "репетиторов")}</span>
        <button type="button" class="hh-sort-btn" data-a="mkt-sort-cycle">${esc(sortLabels[st.sort] || "По соответствию")} ${icon("sort")}</button>
      </div>

      ${cardsHTML}
    </section>`;
  }

  function viewMarket() {
    return `<div class="head"><div class="row between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Маркетплейс</div><h1 class="h1">Подбор репетитора</h1></div><button type="button" class="btn ghost sm" data-a="go" data-v="landing">Витрина</button></div></div>
      ${marketSectionHTML()}
      ${plansSectionHTML()}`;
  }

  /** Вкладка «Учёба»: график по неделям, переписка с репетиторами в WhatsApp и план ЕГЭ. */
  function viewStudy() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const ui = getUi();
    const st = getMkt();
    const tab = ui.studyTab || "week";
    const totalTutors = TDATA.LIST.length;
    const weekOffset = ui.studyWeekOffset ? 1 : 0;
    const weekDays = TDATA.buildWeekDays(weekOffset);
    const subjFilter = ui.studySubj || "all";

    const header = `<div class="head">
        <div class="row between" style="flex-wrap:wrap;gap:10px">
          <div><div class="eyebrow">Учёба</div><h1 class="h1">График и репетиторы</h1></div>
          <button type="button" class="btn soft sm" data-a="go" data-v="market">Подобрать ещё</button>
        </div>
      </div>
      <div class="chip-rail">
        <button type="button" class="chip-btn${tab === "week" ? " on" : ""}" data-a="study-tab" data-tab="week">График недели</button>
        <button type="button" class="chip-btn${tab === "chats" ? " on" : ""}" data-a="study-tab" data-tab="chats">Чаты WhatsApp (${totalTutors})</button>
        <button type="button" class="chip-btn${tab === "plan" ? " on" : ""}" data-a="study-tab" data-tab="plan">План ЕГЭ</button>
      </div>`;

    if (tab === "plan") {
      return `${header}${typeof _ctx.viewPlan === "function" ? _ctx.viewPlan() : ""}`;
    }

    if (tab === "chats") {
      const bookedIds = new Set(st.bookings.map((b) => b.tutorId));
      const sorted = TDATA.LIST.slice().sort((a, b) => (bookedIds.has(b.id) ? 1 : 0) - (bookedIds.has(a.id) ? 1 : 0));
      const rows = sorted.map((t) => {
        const bk = st.bookings.find((x) => x.tutorId === t.id);
        const slot = bk ? `${bk.dayLabel}, ${bk.hour}` : (TDATA.tutorSlotsForDay(t, "all")[0] || "10:00");
        const waHref = TDATA.whatsappUrl(t, bk
          ? `Здравствуйте, ${t.name}! Пишу по поводу занятия ${bk.dayLabel} в ${bk.hour} (${bk.subjectName}, ставка ${bk.offerPrice} ₽/ч).`
          : `Здравствуйте, ${t.name}! Хочу уточнить свободное время на этой неделе (${t.subjectName}).`);
        const statusTxt = bk
          ? (bk.status === "accepted" ? "Подтверждён · WhatsApp" : `Отклик ${bk.offerPrice} ₽/ч`)
          : `Ответ ~${t.responseMin} мин`;
        return `<a class="hh-chat-row" href="${esc(waHref)}" target="_blank" rel="noopener">
          <span class="tutor-avatar" aria-hidden="true">${esc(initials(t.name))}</span>
          <div style="min-width:0">
            <div class="row" style="gap:6px;flex-wrap:nowrap">
              <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</b>
              ${t.verified ? `<span class="verified-badge">${icon("check")}</span>` : ""}
            </div>
            <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.subjectName)} · от ${t.price} ₽/ч</div>
            <div class="small" style="color:${bk ? "var(--leaf)" : "var(--muted)"}">${esc(statusTxt)}</div>
          </div>
          <div class="stack" style="gap:4px;justify-items:end">
            <span class="small muted num">${esc(slot)}</span>
            <span class="btn confirm sm">${icon("msg")}<span>Чат</span></span>
          </div>
        </a>`;
      }).join("");
      return `${header}
        <div class="hh-notice-card">
          <b>Быстрая связь с преподавателями в WhatsApp</b>
          <span class="small ink2">Нажмите на любого преподавателя, чтобы открыть готовое сообщение с вашим предметом, временем и ставкой.</span>
          <div><button type="button" class="btn sm" data-a="go" data-v="market">Выбрать время и предложить цену</button></div>
        </div>
        <div class="hh-chat-list">${rows}</div>`;
    }

    const weekRange = `${weekDays[0].num} ${weekDays[0].month} — ${weekDays[6].num} ${weekDays[6].month}`;
    const noticeCard = `<div class="hh-notice-card">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${st.bookings.length ? `У вас ${st.bookings.length} ${plural(st.bookings.length, "занятие", "занятия", "занятий")} в работе` : "График открытых окон на неделю"}</b>
        <span class="chip accent num">Баланс: ${st.balance.toLocaleString("ru-RU")} ₽</span>
      </div>
      <span class="small ink2">Видно, какие учителя ждут вас в каждый день недели. С каждым можно сразу записаться по своей цене или написать в WhatsApp.</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-a="go" data-v="market">Найти репетитора</button>
        <button type="button" class="btn soft sm" data-a="study-tab" data-tab="chats">${icon("msg")}<span>Все чаты WhatsApp</span></button>
      </div>
    </div>`;

    const weekPicker = `<div class="hh-seg" role="group" aria-label="Выбор недели">
      <button type="button" data-a="study-week" data-w="0" aria-pressed="${weekOffset === 0}">Эта неделя</button>
      <button type="button" data-a="study-week" data-w="1" aria-pressed="${weekOffset === 1}">Следующая неделя</button>
    </div>
    <div class="chip-rail swipe" role="group" aria-label="Фильтр по предмету">
      <button type="button" class="chip-btn${subjFilter === "all" ? " on" : ""}" data-a="study-subj" data-v="all">Все предметы</button>
      ${TDATA.SUBJECTS.map((sb) => `<button type="button" class="chip-btn${subjFilter === sb.id ? " on" : ""}" data-a="study-subj" data-v="${sb.id}">${esc(sb.short)}</button>`).join("")}
    </div>`;

    const weekCards = weekDays.map((d) => {
      const avail = TDATA.LIST.filter((t) => (subjFilter === "all" || t.subject === subjFilter) && TDATA.tutorSlotsForDay(t, d.dow).length > 0);
      const dayBookings = st.bookings.filter((bk) => bk.dayIso === d.iso);
      const rows = avail.slice(0, 4).map((t) => {
        const slots = TDATA.tutorSlotsForDay(t, d.dow);
        const booked = dayBookings.find((b) => b.tutorId === t.id) || st.bookings.find((b) => b.tutorId === t.id);
        const waHref = TDATA.whatsappUrl(t, `Здравствуйте, ${t.name}! Пишу по графику на ${d.fullLabel} (${slots[0] || "10:00"}), предмет — ${t.subjectName}.`);
        return `<div class="week-slot-row">
          <div class="stack" style="gap:2px;min-width:0;flex:1 1 200px">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <b>${esc(t.name)}</b>
              ${t.verified ? `<span class="verified-badge">${icon("check")}</span>` : ""}
              <span class="chip">${esc(t.subjectName)}</span>
              ${booked ? `<span class="chip accent">${booked.status === "accepted" ? "Подтверждён" : "Ваша заявка"}</span>` : ""}
            </div>
            <div class="small muted">Окна: ${slots.join(", ")} · от ${t.price} ₽/ч</div>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>
            <button type="button" class="btn sm" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(slots[0] || "10:00")}">Записаться</button>
          </div>
        </div>`;
      }).join("");
      return `<article class="week-day-card${dayBookings.length ? " active-day" : ""}">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>${esc(d.fullLabel)}</b>
          <span class="chip">${avail.length} ${plural(avail.length, "учитель ждёт", "учителя ждут", "учителей ждут")}</span>
        </div>
        ${rows || '<div class="small muted">По выбранному предмету на этот день свободных окон нет.</div>'}
      </article>`;
    }).join("");

    return `${header}
      ${noticeCard}
      ${bookingsStripHTML(st)}
      <div class="stack" style="gap:10px">
        <div class="row between"><h2 class="h2">Календарь: ${esc(weekRange)}</h2></div>
        ${weekPicker}
      </div>
      <div class="week-days-grid">${weekCards}</div>`;
  }

  EGE.views = EGE.views || {};
  EGE.views.marketplace = {
    configure,
    bookingModalHTML,
    activeFilterCount,
    filterModalHTML,
    plansSectionHTML,
    tutorCardHTML,
    bookingsStripHTML,
    marketSectionHTML,
    viewMarket,
    viewStudy,
    updateBookingModalLive
  };
})();
