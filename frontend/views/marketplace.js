/* Маркетплейс репетиторов: каталог, фильтры (вкл. Якутск/Москва), минимальная подписка от 5к, модалка записи и вкладка «Учёба». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural, initials } = EGE.utils;
  const { icon } = EGE.ui;
  const { isValidHHMM, bidBtnLabelHTML, sakhaBidInnerHTML, priceHeadlineHTML, priceDiffTagsHTML, sliderTicksHTML, hhSelectHTML, hhMultiSelectHTML, tutorAvatarHTML } = EGE.hh;
  const MIN_ACTION_BALANCE = 5000;

  function hasMinBalance(st) {
    return (Number(st && st.balance) || 0) >= MIN_ACTION_BALANCE;
  }

  let _ctx = {};

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
  }

  function getMkt() {
    return typeof _ctx.mkt === "function" ? _ctx.mkt() : { bookings: [], favs: [], balance: 0, initialPaid: false, planId: "trial5k", maxPrice: 2000, day: "all", hour: "all", exam: "all", format: "all", subject: "all", city: "all", sort: "actual" };
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
          <button type="button" class="btn${picked && hasMinBalance(st) ? " is-confirmed" : (p.featured || p.super ? "" : " soft")}" data-a="mkt-plan" data-id="${p.id}"${picked && hasMinBalance(st) ? ' aria-current="true"' : ""}>${picked && hasMinBalance(st) ? "✓ Баланс активен · " + st.balance.toLocaleString("ru-RU") + " ₽" : esc(p.cta)}</button>
          ${p.balance > 0 ? `<button type="button" class="link-btn small muted" data-a="go" data-v="fees" style="justify-self:start">Условия оплаты и сервисный сбор →</button>` : ""}
        </div>
      </article>`;
    }).join("");
    return `<section class="land-sec" id="land-plans" aria-label="Тарифы и баланс">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Минимальная подписка 5 000 ₽ · баланс на занятия</div>
          <h2 class="h2">Баланс 5 000 или 10 000 ₽ на репетиторов</h2>
          <p class="small muted">Первый платёж — от 5 000 ₽, далее можно пополнять на любую сумму от 100 ₽. Средства списываются только после согласия преподавателя. <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent)">Подробнее об оплате и правилах сервиса →</a></p>
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
    const customBadges = Array.isArray(t.customBadges)
      ? t.customBadges.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 2)
      : [];
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
              ${aboveRub > 0 ? `<span class="diff-tag pro num">на +${aboveRub.toLocaleString("ru-RU")} ₽ выше рынка</span>` : ""}
              ${customBadges.length
                ? customBadges.map((b) => `<span class="diff-tag pro">${esc(b)}</span>`).join("")
                : (aboveRub > 0 ? `<span class="diff-tag pro">${esc(qualLine)}</span>` : "")}
            </div>
          </div>
          <button type="button" class="fav-btn" data-a="mkt-fav" data-id="${esc(t.id)}" aria-pressed="${isFav}" aria-label="В избранное">${icon(isFav ? "heartFill" : "heart")}</button>
        </div>
        <div class="tutor-name-line">
          ${tutorAvatarHTML(t)}
          <b style="color:var(--ink)">${esc(t.name)}</b>
          ${t.verified ? `<span class="verified-badge" title="Проверенная анкета">${icon("check")}</span>` : ""}
          <span class="small muted">· ${esc(t.city)}${t.tzLabel ? " (" + esc(t.tzLabel) + ")" : ""} · ★ ${t.rating.toFixed(1)} (${t.reviews})</span>
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
      <div class="tutor-actions">
        <button type="button" class="btn sakha-pattern" data-a="book-open" data-id="${esc(t.id)}" data-hour="${esc(pickHour)}">${sakhaBidInnerHTML(false, t.price)}</button>
        <button type="button" class="btn soft" data-a="trial-open" data-id="${esc(t.id)}" data-hour="${esc(pickHour)}">${icon("spark")}<span>Пробный · 0 ₽</span></button>
      </div>
    </article>`;
  }

  function bookingsStripHTML(st) {
    const TDATA = getTDATA();
    if (!TDATA || !st.bookings.length) return "";
    return `<div class="reqs-strip">${st.bookings.map((bk) => {
      const accepted = bk.status === "accepted";
      const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId);
      const isTrial = !!bk.isTrial || Number(bk.offerPrice) === 0;
      const waHref = accepted
        ? TDATA.whatsappUrl(tutor || { name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" }, `Здравствуйте, ${bk.tutorName}! Напоминаю про занятие (${bk.subjectName}, ${bk.dayLabel} в ${bk.hour}, ${isTrial ? "пробный урок 0 ₽" : "ставка " + bk.offerPrice + " ₽/ч"}).`)
        : "";
      return `<div class="req-item">
        <div class="stack" style="gap:3px;min-width:0">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <b>${esc(bk.tutorName)}</b>
            <span class="chip">${esc(bk.exam)} · ${esc(bk.subjectName)}</span>
            ${isTrial ? '<span class="chip gold">Пробный · 0 ₽</span>' : ""}
            <span class="chip ${accepted ? "accent" : "notif"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>
          </div>
          <div class="small ink2">${esc(bk.dayLabel)} в ${esc(bk.hour)} (${esc(bk.format)}) · ${isTrial ? '<b class="num">Пробный урок (0 ₽)</b>' : `твоя ставка <b class="num">${bk.offerPrice} ₽/ч</b> <span class="muted">(вместо ${bk.tutorPrice} ₽)</span>`}</div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${accepted ? (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
            ? EGE.kit.messengerLinksHTML({
                entity: tutor || { id: bk.tutorId, name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" },
                message: `Здравствуйте, ${bk.tutorName}! Напоминаю про занятие (${bk.subjectName}, ${bk.dayLabel} в ${bk.hour}, ${isTrial ? "пробный урок 0 ₽" : "ставка " + bk.offerPrice + " ₽/ч"}).`,
                primaryLabel: "Написать · WA",
                compact: true
              })
            : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать</span></a>`) : ""}
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
    if (st.city && st.city !== "all") n++;
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
    const st = getMkt();
    const isTrial = !!b.isTrial;
    const minOk = hasMinBalance(st);
    const n5 = b.offerPrice > 0 ? Math.floor(5000 / b.offerPrice) : 0;
    const n10 = b.offerPrice > 0 ? Math.floor(10000 / b.offerPrice) : 0;
    const winTxt = tutor.windowLabel || ("с " + tutor.availableFrom + " до " + tutor.availableTo);
    const inWin = typeof TDATA.tutorInWindow === "function" ? TDATA.tutorInWindow(tutor, curHour) : true;
    const preview = isTrial
      ? `Запрос на бесплатный пробный урок (0 ₽) · ${b.exam}, ${tutor.subjectName}, ${b.format.toLowerCase()}, ${dayObj.fullLabel} в ${curHour}. Баланс подтверждён.`
      : TDATA.botPreviewText({
          exam: b.exam,
          subjectName: tutor.subjectName,
          format: b.format,
          dayLabel: dayObj.fullLabel,
          hour: curHour,
          offerPrice: b.offerPrice,
          tutorPrice: tutor.price
        });
    const timeOptions = [];
    for (let h = 10; h <= 20; h++) {
      timeOptions.push({ id: `${String(h).padStart(2, "0")}:00`, label: `${String(h).padStart(2, "0")}:00` });
      if (h < 20) timeOptions.push({ id: `${String(h).padStart(2, "0")}:30`, label: `${String(h).padStart(2, "0")}:30` });
    }
    if (isValidHHMM(curHour) && !timeOptions.some((o) => o.id === curHour)) {
      timeOptions.push({ id: curHour, label: curHour });
      timeOptions.sort((a, z) => a.id.localeCompare(z.id));
    }
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
        <div class="hh-seg equal" role="group" aria-label="Формат первого урока">
          <button type="button" data-a="book-mode" data-v="paid" aria-pressed="${!isTrial}"><span>Обычный урок (своя ставка)</span></button>
          <button type="button" data-a="book-mode" data-v="trial" aria-pressed="${isTrial}">${icon("spark")}<span>Пробный урок · 0 ₽</span></button>
        </div>
        ${isTrial && !minOk ? `<div class="notice warn">
          <b>Нужно пополнение от 5 000 ₽</b>
          <span class="small">Чтобы запросить бесплатный пробный урок (0 ₽), на балансе должно быть минимум 5 000 ₽ — деньги не спишутся.</span>
          <div><button type="button" class="btn sm" data-a="bal-open" data-reason="trial">${icon("wallet")}<span>Пополнить баланс от 5 000 ₽</span></button></div>
        </div>` : ""}
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
            <input class="hh-time-range is-ruler" id="bid-hour-range" type="range" min="10" max="20" step="1" value="${curHourNum}" style="--pct:${curHourPct}%" aria-label="Час занятия с 10:00 до 20:00">
            ${sliderTicksHTML(curHourNum, "ruler", { id: "bid-hour-ticks" })}
            <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
          </div>
          ${daySlots.length ? `<div class="hour-circles compact" id="bid-day-slots" style="margin-top:8px">${daySlots.map((h) => `<button type="button" class="hr-cir${h === curHour ? " on" : ""}" data-a="book-hour" data-v="${esc(h)}">${esc(h)}</button>`).join("")}</div>` : ""}
          <div class="bid-time-row" style="margin-top:8px">
            <span class="small muted" id="bid-win-status">${inWin ? `Входит в свободное окно (${esc(winTxt)})` : `Вне типового окна (${esc(winTxt)}) — уточним и уведомим`}</span>
            ${hhSelectHTML({
              id: "bid-custom-time",
              pill: true,
              leadIcon: "clock",
              options: timeOptions,
              value: curHour,
              open: !!b.timeMenuOpen,
              toggleAction: "book-time-toggle",
              pickAction: "book-time-pick",
              ariaLabel: "Выбрать точное время урока"
            })}
          </div>
        </div>
        <div class="field">
          <label for="bid-price">${isTrial ? "Стоимость пробного урока" : "Твоя цена за занятие (₽/ч)"}</label>
          ${isTrial
            ? `<div class="hh-notice-card" style="padding:12px 14px"><b class="num">0 ₽ — бесплатный пробный урок</b><span class="small ink2">При подтверждении преподавателем с баланса <b>${st.balance.toLocaleString("ru-RU")} ₽</b> средства не списываются.</span></div>`
            : `<div class="hh-price-row" id="bid-price-row" style="margin-bottom:4px">
                ${priceHeadlineHTML(tutor.marketPrice, b.offerPrice, false)}
              </div>
              <div class="hh-diff-strip" id="bid-diff-strip" style="margin-bottom:4px">
                ${priceDiffTagsHTML({ tutorPrice: tutor.price, marketPrice: tutor.marketPrice || tutor.price, offerPrice: b.offerPrice, qualBadge: tutor.qualBadge, customBadges: tutor.customBadges })}
              </div>
              <div class="hh-price-stepper">
                <button type="button" class="hh-step-btn" data-a="bid-step" data-step="-100">−100 ₽</button>
                <input class="input bid-input num" id="bid-price" type="number" min="500" max="5000" step="50" inputmode="numeric" value="${b.offerPrice}">
                <button type="button" class="hh-step-btn" data-a="bid-step" data-step="100">+100 ₽</button>
              </div>
              <div id="bid-signal" class="small"><span class="chip ${sig.tone}">${esc(sig.label)}</span></div>`}
        </div>
        <div class="field">
          <label for="bid-note">Пожелания по подготовке (необязательно)</label>
          <input class="input" id="bid-note" maxlength="140" placeholder="Например: цель 80+ баллов, разбор устной части и эссе" value="${esc(b.note || "")}">
        </div>
        <div class="bot-preview">
          <b class="small">Детали заявки (уведомим о подтверждении):</b>
          <span id="bot-preview-txt">${esc(preview)}</span>
          ${isTrial ? "" : `<span class="small muted" id="bid-plan-counts">На «Пробник» (5 000 ₽) хватит на <b>${n5} ур.</b> · на «Месяц» (10 000 ₽) на <b>${n10} ур.</b></span>`}
        </div>
        <div class="row between" style="flex-wrap:wrap;gap:8px;align-items:center">
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn sakha-pattern" id="bid-submit-btn" data-a="book-submit">${isTrial ? `<span>Сөп · Попросить пробный 0 ₽</span>` : sakhaBidInnerHTML(false, b.offerPrice, { attr: 'data-bid-lbl="1"' })}</button>
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
    const hNum = Math.max(10, Math.min(20, parseInt(String(b.hour || "10").slice(0, 2), 10) || 10));
    if (hourRange) {
      hourRange.value = String(hNum);
      if (hourRange.style && typeof hourRange.style.setProperty === "function") {
        hourRange.style.setProperty("--pct", ((hNum - 10) * 10) + "%");
      }
    }
    const ticksEl = document.getElementById("bid-hour-ticks");
    if (ticksEl && typeof ticksEl.querySelectorAll === "function") {
      ticksEl.querySelectorAll("i").forEach((it) => {
        const tv = Number(it.getAttribute && it.getAttribute("data-tick")) || 0;
        if (it.classList) it.classList.toggle("on", tv === hNum);
      });
    }
    const slotsEl = document.getElementById("bid-day-slots");
    if (slotsEl && typeof slotsEl.querySelectorAll === "function") {
      slotsEl.querySelectorAll('[data-a="book-hour"]').forEach((btn) => {
        const match = btn.getAttribute && btn.getAttribute("data-v") === b.hour;
        if (btn.classList) btn.classList.toggle("on", !!match);
      });
    }
    const customEl = document.getElementById("bid-custom-time");
    if (customEl) {
      const lblEl = customEl.querySelector && customEl.querySelector(".hh-select-val > span.num");
      if (lblEl) lblEl.textContent = b.hour;
      if (typeof customEl.querySelectorAll === "function") {
        customEl.querySelectorAll(".hh-select-item").forEach((it) => {
          const match = it.getAttribute && it.getAttribute("data-v") === b.hour;
          if (it.classList) it.classList.toggle("on", !!match);
          if (it.setAttribute) it.setAttribute("aria-selected", match ? "true" : "false");
        });
      }
    }
    const priceEl = document.getElementById("bid-price");
    if (priceEl) {
      if (document.activeElement !== priceEl) priceEl.value = String(b.offerPrice);
      if (typeof priceEl.setAttribute === "function") priceEl.setAttribute("value", String(b.offerPrice));
    }
    const planEl = document.getElementById("bid-plan-counts");
    if (planEl && b.offerPrice > 0) {
      const n5 = Math.floor(5000 / b.offerPrice);
      const n10 = Math.floor(10000 / b.offerPrice);
      planEl.innerHTML = `На «Пробник» (5 000 ₽) хватит на <b>${n5} ур.</b> · на «Месяц» (10 000 ₽) на <b>${n10} ур.</b>`;
    }
    const priceRowEl = document.getElementById("bid-price-row");
    if (priceRowEl) {
      priceRowEl.innerHTML = priceHeadlineHTML(tutor.marketPrice, b.offerPrice, false);
    }
    const diffEl = document.getElementById("bid-diff-strip");
    if (diffEl) {
      diffEl.innerHTML = priceDiffTagsHTML({ tutorPrice: tutor.price, marketPrice: tutor.marketPrice || tutor.price, offerPrice: b.offerPrice, qualBadge: tutor.qualBadge, customBadges: tutor.customBadges });
    }
    const subBtn = document.getElementById("bid-submit-btn");
    if (subBtn) {
      if (b.isTrial) {
        subBtn.innerHTML = `<span>Сөп · Попросить пробный 0 ₽</span>`;
      } else {
        const subLbl = subBtn.querySelector && (subBtn.querySelector("[data-bid-lbl]") || subBtn.querySelector("span"));
        if (subLbl) subLbl.textContent = bidBtnLabelHTML(false, b.offerPrice);
        else subBtn.innerHTML = sakhaBidInnerHTML(false, b.offerPrice, { attr: 'data-bid-lbl="1"' });
      }
    }
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
      prevEl.textContent = b.isTrial
        ? `Запрос на бесплатный пробный урок (0 ₽) · ${b.exam}, ${tutor.subjectName}, ${b.format.toLowerCase()}, ${dayObj.fullLabel} в ${b.hour}. Баланс подтверждён.`
        : TDATA.botPreviewText({
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
            <div class="small muted">Город</div>
            <div class="chip-rail">
              ${[["all", "Все"]].concat(((TDATA && TDATA.CITIES) || ["Якутск", "Москва"]).map((c) => [c, c])).map(([v, l]) => `<button type="button" class="chip-btn${(st.city || "all") === v ? " on" : ""}" data-a="mkt-city" data-v="${esc(v)}">${esc(l)}</button>`).join("")}
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
    if (st.city && st.city !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="city">${esc(st.city)} ×</button>`);
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
        ${(!st.city || st.city === "all") ? (((TDATA && TDATA.CITIES) || ["Якутск", "Москва"]).map((c) => `<button type="button" class="chip-btn" data-a="mkt-city" data-v="${esc(c)}">+ ${esc(c)}</button>`).join("")) : ""}
        ${!st.onlyBumped ? `<button type="button" class="chip-btn" data-a="mkt-bumped">+ Актуальные сегодня</button>` : ""}
        ${st.maxPrice >= 2000 ? `<button type="button" class="chip-btn" data-a="mkt-price" data-v="1300">+ До 1 300 ₽</button>` : ""}
        <button type="button" class="chip-btn" data-a="mkt-preset">+ Английский · Сб 10:00</button>
        ${TDATA.SUBJECTS.filter((sb) => sb.id !== st.subject).map((sb) => `<button type="button" class="chip-btn" data-a="mkt-subj" data-v="${sb.id}">+ ${esc(sb.short)}</button>`).join("")}
      </div>

      <div class="wallet-bar">
        <div class="stack" style="gap:2px">
          <span class="small muted">Тариф: <b style="color:var(--ink)">${esc(activePlan.name)}</b></span>
          <div class="row" style="gap:10px;align-items:baseline;flex-wrap:wrap">
            <span class="wallet-num num">${st.balance.toLocaleString("ru-RU")} ₽</span>
            <span class="small muted">${hasMinBalance(st) ? "доступны пробный урок 0 ₽ и отклики" : "минимум 5 000 ₽ на балансе для пробного урока и записи"}</span>
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn ${hasMinBalance(st) ? "soft" : ""} sm" data-a="bal-open">${icon("wallet")}<span>Пополнить баланс</span></button>
          <button type="button" class="btn soft sm" data-a="go-student-lead">${icon("plus")}<span>Ищу преподавателя</span></button>
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
          <input class="hh-time-range is-ruler" id="mkt-hour-range" type="range" min="10" max="20" step="1" value="${mktHourNum}" style="--pct:${mktHourPct}%" aria-label="Выбрать час с 10:00 до 20:00">
          ${sliderTicksHTML(mktHourNum, "ruler", { id: "mkt-hour-ticks" })}
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

  function studentLeadCardHTML(TDATA, ui) {
    const ld = ui.leadDraft || (ui.leadDraft = {
      subjects: ["chem"],
      subjMenuOpen: false,
      exam: "ЕГЭ",
      format: "Онлайн",
      targetPrice: 1000,
      scheduleNote: "",
      whatsapp: "",
      comment: ""
    });
    const leads = typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
    const myLeads = leads.filter((l) => l.mine);
    const subjOptions = (TDATA.SUBJECTS || []).map((sb) => ({ id: sb.id, label: sb.name, short: sb.short }));
    const subjValues = Array.isArray(ld.subjects) && ld.subjects.length ? ld.subjects : ["chem"];

    const myLeadsHTML = myLeads.length
      ? `<div class="stack" style="gap:8px;margin-top:4px">
          <div class="small muted">Ваши открытые запросы в каталоге преподавателей (${myLeads.length}):</div>
          ${myLeads.map((item) => {
            const subjLabels = typeof TDATA.subjectNamesForIds === "function"
              ? TDATA.subjectNamesForIds(item.subjects)
              : item.subjects;
            return `<div class="req-item">
              <div class="stack" style="gap:4px;min-width:0;flex:1 1 220px">
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <b>${esc(item.exam)} · ${esc(item.format)}</b>
                  ${subjLabels.map((lbl) => `<span class="chip accent">${esc(lbl)}</span>`).join("")}
                  <span class="chip ${item.responded ? "confirm" : "gold"}">${item.responded ? "Преподаватель откликнулся" : "Опубликовано для преподавателей"}</span>
                </div>
                <div class="small ink2">${esc(item.comment)} · бюджет до <b class="num">${Number(item.targetPrice).toLocaleString("ru-RU")} ₽/ч</b></div>
              </div>
              <button type="button" class="btn ghost sm" data-a="lead-remove" data-id="${esc(item.id)}">Снять</button>
            </div>`;
          }).join("")}
        </div>`
      : "";

    return `<section class="card pad-lg stack" id="study-lead-card" style="gap:14px">
      <div class="row between" style="gap:10px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Обратный отклик преподавателей</div>
          <h2 class="h2">Ищу преподавателя по предметам</h2>
          <p class="small muted">Опубликуйте запрос с мультивыбором предметов (например, Химия и Биология) — она сразу появится в каталоге преподавателей, чтобы репетиторы написали вам сами.</p>
        </div>
        <span class="chip accent">Попасть в каталог для преподавателей</span>
      </div>
      <form class="stack" style="gap:12px" data-f="student-lead">
        <div class="field">
          <span class="label">Предметы (можно выбрать несколько)</span>
          ${typeof hhMultiSelectHTML === "function"
            ? hhMultiSelectHTML({
                id: "lead-subjects",
                options: subjOptions,
                values: subjValues,
                placeholder: "Выберите нужные предметы",
                open: !!ld.subjMenuOpen,
                toggleAction: "lead-subj-toggle",
                pickAction: "lead-subj-pick",
                ariaLabel: "Предметы поиска преподавателя"
              })
            : ""}
        </div>
        <div class="fields">
          <div class="field">
            <span class="label">Экзамен</span>
            <div class="switch" role="group" aria-label="Экзамен заявки">
              ${["ЕГЭ", "ОГЭ", "ДВИ / Олимпиады"].map((ex) => `<button type="button" data-a="lead-exam" data-v="${esc(ex)}" aria-pressed="${(ld.exam || "ЕГЭ") === ex}">${esc(ex)}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <span class="label">Формат</span>
            <div class="switch" role="group" aria-label="Формат заявки">
              ${["Онлайн", "Очно"].map((fm) => `<button type="button" data-a="lead-format" data-v="${esc(fm)}" aria-pressed="${(ld.format || "Онлайн") === fm}">${esc(fm)}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="fields">
          <div class="field">
            <label for="lead-price">Желаемая ставка (₽/ч)</label>
            <input class="input num" id="lead-price" name="targetPrice" type="number" min="500" max="5000" step="50" value="${Number(ld.targetPrice) || 1000}">
          </div>
          <div class="field">
            <label for="lead-wa">Телефон (WhatsApp / MAX)</label>
            <input class="input num" id="lead-wa" name="whatsapp" type="text" maxlength="22" placeholder="+7 (914) 000-00-00" value="${esc(ld.whatsapp && typeof TDATA.formatPhoneMask === "function" ? TDATA.formatPhoneMask(ld.whatsapp) : (ld.whatsapp || ""))}">
          </div>
        </div>
        <div class="field">
          <label for="lead-comment">Что важно в подготовке (время, цель баллов, тема)</label>
          <input class="input" id="lead-comment" name="comment" maxlength="160" placeholder="Например: ищу преподавателя по химии и биологии, цель 85+, удобно Пн/Ср в 17:00" value="${esc(ld.comment || "")}">
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn">${icon("spark")}<span>Опубликовать заявку для преподавателей</span></button>
        </div>
      </form>
      ${myLeadsHTML}
    </section>`;
  }

  /** Вкладка «Учёба»: только записанные репетиторы, переписка WhatsApp, поиск преподавателя и план ЕГЭ. */
  function viewStudy() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const ui = getUi();
    const st = getMkt();
    const tab = ui.studyTab || "week";
    const weekOffset = ui.studyWeekOffset ? 1 : 0;
    const weekDays = TDATA.buildWeekDays(weekOffset);
    const subjFilter = ui.studySubj || "all";

    const bookedList = [];
    const seenTutors = new Set();
    st.bookings.forEach((bk) => {
      if (seenTutors.has(bk.tutorId)) return;
      seenTutors.add(bk.tutorId);
      const t = TDATA.LIST.find((x) => x.id === bk.tutorId) || {
        id: bk.tutorId,
        name: bk.tutorName,
        subject: "bio",
        subjects: ["bio"],
        subjectName: bk.subjectName || "Подготовка",
        price: bk.tutorPrice || bk.offerPrice || 1000,
        verified: true,
        whatsapp: "79142100101"
      };
      bookedList.push({ tutor: t, booking: bk });
    });

    const header = `<div class="head">
        <div class="row between" style="flex-wrap:wrap;gap:10px">
          <div><div class="eyebrow">Учёба</div><h1 class="h1">Мои преподаватели и расписание</h1></div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn soft sm" data-a="go" data-v="market">Подобрать ещё</button>
            <button type="button" class="btn ghost sm" data-a="bal-open">${icon("wallet")}<span>${st.balance.toLocaleString("ru-RU")} ₽</span></button>
          </div>
        </div>
      </div>
      <div class="chip-rail">
        <button type="button" class="chip-btn${tab === "week" ? " on" : ""}" data-a="study-tab" data-tab="week">График (${st.bookings.length})</button>
        <button type="button" class="chip-btn${tab === "chats" ? " on" : ""}" data-a="study-tab" data-tab="chats">Чаты · WA · TG · MAX (${bookedList.length})</button>
        <button type="button" class="chip-btn${tab === "plan" ? " on" : ""}" data-a="study-tab" data-tab="plan">План ЕГЭ</button>
      </div>`;

    if (tab === "plan") {
      return `${header}${typeof _ctx.viewPlan === "function" ? _ctx.viewPlan() : ""}`;
    }

    if (tab === "chats") {
      if (!bookedList.length) {
        return `${header}
          <div class="empty">
            <b>Пока нет преподавателей, к которым вы записаны</b>
            <span>Выберите преподавателя во вкладке «Репетиторы» — после записи здесь появятся прямые чаты WhatsApp, Telegram и MAX.</span>
            <button type="button" class="btn sm" data-a="go" data-v="market">Перейти в «Репетиторы»</button>
          </div>
          ${studentLeadCardHTML(TDATA, ui)}`;
      }
      const sorted = bookedList.slice().sort((a, b) => (b.booking.status === "accepted" ? 1 : 0) - (a.booking.status === "accepted" ? 1 : 0));
      const rows = sorted.map(({ tutor: t, booking: bk }) => {
        const isTrial = !!bk.isTrial || Number(bk.offerPrice) === 0;
        const slot = `${bk.dayLabel}, ${bk.hour}`;
        const msgTxt = `Здравствуйте, ${t.name}! Пишу по поводу занятия ${bk.dayLabel} в ${bk.hour} (${bk.subjectName}, ${isTrial ? "пробный урок 0 ₽" : "ставка " + bk.offerPrice + " ₽/ч"}).`;
        const waHref = TDATA.whatsappUrl(t, msgTxt);
        const statusTxt = bk.status === "accepted"
          ? "Подтверждён · выберите мессенджер"
          : (isTrial ? "Запрос на пробный 0 ₽" : `Отклик ${bk.offerPrice} ₽/ч`);
        const msgBar = (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
          ? EGE.kit.messengerLinksHTML({ entity: t, message: msgTxt, primaryLabel: "WhatsApp", compact: true })
          : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`;
        return `<div class="hh-chat-row">
          ${tutorAvatarHTML(t)}
          <div style="min-width:0">
            <div class="row" style="gap:6px;flex-wrap:nowrap">
              <b style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(t.name)}</b>
              ${t.verified ? `<span class="verified-badge">${icon("check")}</span>` : ""}
            </div>
            <div class="small muted" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(bk.subjectName || t.subjectName)} · ${isTrial ? "пробный 0 ₽" : `от ${t.price} ₽/ч`}</div>
            <div class="small" style="color:${bk.status === "accepted" ? "var(--leaf)" : "var(--accent)"}">${esc(statusTxt)}</div>
          </div>
          <div class="stack" style="gap:6px;justify-items:end">
            <span class="small muted num">${esc(slot)}</span>
            ${msgBar}
          </div>
        </div>`;
      }).join("");
      return `${header}
        <div class="hh-notice-card">
          <b>Чаты только с вашими преподавателями</b>
          <span class="small ink2">Здесь собраны преподаватели, к которым вы записались. Нажмите для перехода в WhatsApp, Telegram или MAX с готовым текстом.</span>
        </div>
        <div class="hh-chat-list">${rows}</div>`;
    }

    const weekRange = `${weekDays[0].num} ${weekDays[0].month} — ${weekDays[6].num} ${weekDays[6].month}`;
    const noticeCard = `<div class="hh-notice-card">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${st.bookings.length ? `Ваших записей к преподавателям: ${st.bookings.length}` : "В разделе «Учёба» только ваши преподаватели"}</b>
        <span class="chip accent num">Баланс: ${st.balance.toLocaleString("ru-RU")} ₽</span>
      </div>
      <span class="small ink2">${st.bookings.length ? "Здесь показаны только преподаватели, к которым у вас есть заявка или подтверждённый урок." : "После записи в «Репетиторах» здесь появятся ваше расписание, статус подтверждения и быстрый чат в WhatsApp."}</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-a="go" data-v="market">Подобрать репетитора</button>
        ${!hasMinBalance(st) ? `<button type="button" class="btn soft sm" data-a="bal-open">${icon("wallet")}<span>Пополнить от 5 000 ₽</span></button>` : ""}
      </div>
    </div>`;

    const enrolledSection = !st.bookings.length
      ? `<div class="empty">
          <b>Вы пока не записаны ни к одному преподавателю</b>
          <span>Откройте «Репетиторы», пополните счёт от 5 000 ₽ и отправьте заявку или запрос на бесплатный пробный урок.</span>
          <button type="button" class="btn sm" data-a="go" data-v="market">Выбрать преподавателя</button>
        </div>`
      : (() => {
          const filteredBookings = st.bookings.filter((bk) => {
            if (subjFilter === "all") return true;
            const tutor = TDATA.LIST.find((t) => t.id === bk.tutorId);
            if (!tutor) return true;
            return tutor.subject === subjFilter || (Array.isArray(tutor.subjects) && tutor.subjects.includes(subjFilter));
          });
          const weekPicker = `<div class="hh-seg" role="group" aria-label="Выбор недели">
            <button type="button" data-a="study-week" data-w="0" aria-pressed="${weekOffset === 0}">Эта неделя</button>
            <button type="button" data-a="study-week" data-w="1" aria-pressed="${weekOffset === 1}">Следующая неделя</button>
          </div>
          <div class="chip-rail swipe" role="group" aria-label="Фильтр по предмету">
            <button type="button" class="chip-btn${subjFilter === "all" ? " on" : ""}" data-a="study-subj" data-v="all">Все предметы</button>
            ${TDATA.SUBJECTS.map((sb) => `<button type="button" class="chip-btn${subjFilter === sb.id ? " on" : ""}" data-a="study-subj" data-v="${sb.id}">${esc(sb.short)}</button>`).join("")}
          </div>`;
          const weekCards = weekDays.map((d) => {
            const dayBookings = filteredBookings.filter((bk) => bk.dayIso === d.iso || (bk.dow != null && Number(bk.dow) === d.dow));
            if (!dayBookings.length) return "";
            const rows = dayBookings.map((bk) => {
              const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId) || { name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101", verified: true };
              const isTrial = !!bk.isTrial || Number(bk.offerPrice) === 0;
              const waHref = TDATA.whatsappUrl(tutor, `Здравствуйте, ${bk.tutorName}! Пишу по уроку на ${d.fullLabel} (${bk.hour}), предмет — ${bk.subjectName}.`);
              return `<div class="week-slot-row">
                <div class="stack" style="gap:2px;min-width:0;flex:1 1 200px">
                  <div class="row" style="gap:6px;flex-wrap:wrap">
                    <b>${esc(bk.tutorName)}</b>
                    ${tutor.verified !== false ? `<span class="verified-badge">${icon("check")}</span>` : ""}
                    <span class="chip">${esc(bk.subjectName)}</span>
                    <span class="chip ${bk.status === "accepted" ? "confirm" : "notif"}">${bk.status === "accepted" ? "Подтверждён" : "На рассмотрении"}</span>
                  </div>
                  <div class="small muted num">${esc(bk.hour)} · ${esc(bk.format)} · ${isTrial ? "Пробный 0 ₽" : `${Number(bk.offerPrice).toLocaleString("ru-RU")} ₽/ч`}</div>
                </div>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  ${(EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
                    ? EGE.kit.messengerLinksHTML({
                        entity: tutor,
                        message: `Здравствуйте, ${bk.tutorName}! Пишу по уроку на ${d.fullLabel} (${bk.hour}), предмет — ${bk.subjectName}.`,
                        primaryLabel: "WhatsApp",
                        compact: true
                      })
                    : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`}
                </div>
              </div>`;
            }).join("");
            return `<article class="week-day-card active-day">
              <div class="row between" style="gap:8px;flex-wrap:wrap">
                <b>${esc(d.fullLabel)}</b>
                <span class="chip accent">${dayBookings.length} ${plural(dayBookings.length, "занятие", "занятия", "занятий")}</span>
              </div>
              ${rows}
            </article>`;
          }).filter(Boolean).join("");
          return `<div class="stack" style="gap:10px">
            <div class="row between"><h2 class="h2">Календарь ваших уроков: ${esc(weekRange)}</h2></div>
            ${weekPicker}
          </div>
          ${weekCards ? `<div class="week-days-grid">${weekCards}</div>` : `<div class="empty"><b>По выбранному предмету записей пока нет</b><span>Переключите фильтр на «Все предметы» или добавьте занятие.</span></div>`}`;
        })();

    return `${header}
      ${noticeCard}
      ${bookingsStripHTML(st)}
      ${enrolledSection}
      ${studentLeadCardHTML(TDATA, ui)}`;
  }

  EGE.views = EGE.views || {};
  EGE.views.marketplace = {
    configure,
    hasMinBalance,
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
