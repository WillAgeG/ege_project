/* Маркетплейс репетиторов: каталог, фильтры (вкл. Якутск/Москва), минимальная подписка от 5к, модалка записи и вкладка «Учёба». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const {
    esc, plural, initials,
    WEEK_DAYS_RU: WEEK_DAYS_UI, SCHED_HOURS_RU: SCHED_HOURS,
    sortDows, formatDaysShort, formatWeeklyBotPhrase
  } = EGE.utils;
  const { icon } = EGE.ui;
  const { isValidHHMM, bidBtnLabelHTML, sakhaBidInnerHTML, priceHeadlineHTML, priceDiffTagsHTML, hhSelectHTML, hhMultiSelectHTML, tutorAvatarHTML } = EGE.hh;
  const MIN_ACTION_BALANCE = 490;

  function hasMinBalance(st) {
    return (Number(st && st.balance) || 0) >= MIN_ACTION_BALANCE;
  }

  let _ctx = {};
  const _localUi = {};

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
    return (_ctx && _ctx.ui) ? _ctx.ui : _localUi;
  }

  function renderDataTable(opts) {
    if (EGE.charts && typeof EGE.charts.dataTableHTML === "function") {
      return EGE.charts.dataTableHTML(Object.assign({}, opts, { showColsSwitch: false, showPresetSwitch: false }));
    }
    return "";
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
      const note = p.kind === "ai"
        ? "Безлимит тренажёра ЕГЭ и ИИ-сочинений К1–К12"
        : (p.id === "trial990"
          ? "Полноценный урок 60 мин за 490 ₽ + 100% гарантия замены"
          : (p.id === "minigroup"
            ? "4 урока в группе 3–5 чел. (~548 ₽/урок) + ИИ"
            : (p.balance > 0
              ? `≈ ${lessons} ${plural(lessons, "урок", "урока", "уроков")} по ${rate} ₽/ч с баланса`
              : "Тесты, конспекты и огромная база репетиторов")));
      return `<article class="card pad-lg plan-card${p.featured ? " featured" : ""}${p.super ? " super" : ""}${picked ? " picked" : ""}">
        <div class="plan-card-head">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <span class="chip ${p.super || p.featured ? "accent" : (p.kind === "ai" ? "pro" : (p.balance ? "leaf" : ""))}">${esc(p.badge)}</span>
            ${picked ? '<span class="chip good">Выбран сейчас</span>' : ""}
          </div>
          <h3 class="h2 plan-title">${esc(p.name)}</h3>
          <p class="small ink2 plan-tagline">${esc(p.tagline)}</p>
        </div>
        <div class="plan-price-wrap">
          <div class="plan-price num">${esc(p.priceLabel)}</div>
          <div class="small muted">${esc(p.period)} · ${esc(note)}</div>
        </div>
        <div class="plan-cta-wrap">
          <button type="button" class="btn plan-cta-pill${p.super || p.featured ? " is-gemini-grad" : " soft"}${picked && hasMinBalance(st) ? " is-confirmed" : ""}" data-a="mkt-plan" data-id="${p.id}"${picked && hasMinBalance(st) ? ' aria-current="true"' : ""}>${picked && hasMinBalance(st) ? "✓ СБП-баланс активен · " + st.balance.toLocaleString("ru-RU") + " ₽" : esc(p.cta)}</button>
          ${p.balance > 0 ? `<button type="button" class="link-btn small muted" data-a="go" data-v="fees" style="justify-self:center">Как работает СБП-эскроу →</button>` : ""}
        </div>
        <div class="plan-sep" aria-hidden="true"></div>
        <div class="plan-feats-wrap">
          <div class="plan-feats-head">Что входит:</div>
          <ul class="plan-feats">${p.features.map((f) => `<li><span>${esc(f)}</span></li>`).join("")}</ul>
        </div>
      </article>`;
    }).join("");

    const sbpSteps = [
      ["01", "Оплата только через СБП", "QR-код или кнопка вашего банка (АЭБ, Сбер, Т-Банк, ВТБ) за 5 секунд — без привязки карт и карточных наценок."],
      ["02", "Поурочный эскроу-холд", "Деньги не уходят репетитору авансом за месяц: резервируется только сумма ближайшего урока до его завершения."],
      ["03", "Шлюз контактов (WA · TG · MAX)", "Сразу после бронирования урока (от 490 ₽ или на бесплатном пробном) в «Учёбе» открываются прямые чаты в мессенджерах."],
      ["04", "100% гарантия замены или возврат", "Если на пробном за 490 ₽ не совпал темп или занятие отменено за ≥ 4 ч — бесплатная замена репетитора либо возврат 100%."]
    ];

    return `<section class="land-sec" id="land-plans" aria-label="Тарифы и СБП-баланс">
      <div class="land-sec-head is-gemini-center">
        <div class="eyebrow">Только СБП · Поурочный эскроу · Прозрачные тарифы</div>
        <h2 class="h2 gemini-plans-h2">Больше возможностей с <span class="gemini-grad-word">Вектор</span></h2>
        <p class="small muted gemini-plans-sub">Гибкая линейка без карточных наценок по СБП: пробный урок <b>490 ₽</b> (или бесплатно у преподавателя), далее любые пополнения от <b>100 ₽</b>. <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent)">Подробнее о платёжке и правилах →</a></p>
        <div class="gemini-rate-tabs" role="group" aria-label="Ставка для расчёта уроков">
          <span class="small muted" style="padding:0 8px">Ставка:</span>
          ${rates.map((r) => `<button type="button" class="chip-btn${rate === r ? " on" : ""}" data-a="mkt-calc" data-rate="${r}">${r} ₽/ч</button>`).join("")}
        </div>
      </div>
      <div class="plan-grid">${cards}</div>
      <div class="card pad-lg stack sbp-explainer-box" id="sbp-escrow-explainer" aria-label="Как работает СБП-платёжка и эскроу">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          <div class="stack" style="gap:2px">
            <div class="eyebrow">Прозрачная платёжка · СБП-эскроу</div>
            <h3 class="h3">Как проходят оплата по СБП и защита депозита</h3>
          </div>
          <div class="sbp-bank-pills">
            <span class="chip confirm">Только СБП QR</span>
            <span class="chip">АЭБ · Сбер · Т-Банк · ВТБ</span>
            <button type="button" class="btn soft sm" data-a="go" data-v="fees">Полная схема расчётов →</button>
          </div>
        </div>
        <div class="sbp-step-grid">
          ${sbpSteps.map(([num, title, desc]) => `<div class="sbp-step-card">
            <span class="how-num">${num}</span>
            <b>${esc(title)}</b>
            <p class="small ink2">${esc(desc)}</p>
          </div>`).join("")}
        </div>
      </div>
    </section>`;
  }

  function resolveTutorGuarantee(t) {
    const enabled = !!(t && t.firstLessonGuarantee);
    return {
      enabled,
      free: enabled,
      price: enabled ? 0 : null,
      badgeLabel: enabled ? "Возврат за 1-й урок" : "Без бесплатного 1-го",
      label: enabled ? "✓ Возврат за 1-й урок" : "Без бесплатного 1-го",
      modalNote: enabled
        ? "Если первый урок не понравится — вернём 100% оплаты из резерва СБП на баланс сразу после обращения."
        : "Преподаватель не хочет проводить первый урок бесплатно — занятие бронируется по обычной часовой ставке."
    };
  }

  function resolveTutorTrial(t) {
    return resolveTutorGuarantee(t);
  }

  function plainBidLabel(alreadyBooked, price) {
    const p = Math.max(0, Math.round(Number(price) || 0)).toLocaleString("ru-RU");
    return alreadyBooked ? `✓ Предложено ${p} ₽` : `Предложить ${p} ₽`;
  }

  function priceFilterLabel(st) {
    const minP = Number(st && st.minPrice) || 0;
    const maxP = Number(st && st.maxPrice) || 0;
    if (minP > 0 && maxP > 0) return `от ${minP.toLocaleString("ru-RU")} до ${maxP.toLocaleString("ru-RU")} ₽/ч`;
    if (minP > 0) return `от ${minP.toLocaleString("ru-RU")} ₽/ч`;
    if (maxP > 0) return `до ${maxP.toLocaleString("ru-RU")} ₽/ч`;
    return "Любая";
  }

  function resolveTutorWithContacts(t) {
    if (!t) return t;
    const st = getMkt();
    const ov = st && st.tutorContacts && typeof st.tutorContacts === "object" ? st.tutorContacts[t.id] : null;
    if (!ov || typeof ov !== "object") return t;
    const hasWa = Boolean(ov.whatsapp && String(ov.whatsapp).trim());
    const hasTg = Boolean(ov.telegram && String(ov.telegram).trim());
    const hasMax = Boolean(ov.maxHandle && String(ov.maxHandle).trim());
    const baseAvail = (t.availableChannels && typeof t.availableChannels === "object")
      ? t.availableChannels
      : { wa: Boolean(t.whatsapp || !t.telegram), tg: Boolean(t.telegram), max: Boolean(t.maxHandle) };
    return Object.assign({}, t, {
      whatsapp: hasWa ? String(ov.whatsapp).trim() : (t.whatsapp || ""),
      telegram: hasTg ? String(ov.telegram).trim() : (t.telegram || ""),
      maxHandle: hasMax ? String(ov.maxHandle).trim() : (t.maxHandle || ""),
      availableChannels: {
        wa: !!baseAvail.wa || hasWa,
        tg: !!baseAvail.tg || hasTg,
        max: !!baseAvail.max || hasMax
      }
    });
  }

  function tutorChannels(t) {
    const resolved = resolveTutorWithContacts(t);
    if (resolved && resolved.availableChannels && typeof resolved.availableChannels === "object") {
      return {
        wa: !!resolved.availableChannels.wa,
        tg: !!resolved.availableChannels.tg,
        max: !!resolved.availableChannels.max
      };
    }
    return {
      wa: Boolean(!resolved || resolved.whatsapp || !resolved.telegram),
      tg: Boolean(resolved && resolved.telegram && String(resolved.telegram).trim()),
      max: Boolean(resolved && resolved.maxHandle && String(resolved.maxHandle).trim())
    };
  }

  function tutorChannelNote(t) {
    const ch = tutorChannels(t);
    const active = [];
    if (ch.wa) active.push("WhatsApp");
    if (ch.tg) active.push("Telegram");
    if (ch.max) active.push("MAX");
    if (!active.length || (active.length === 1 && active[0] === "WhatsApp")) {
      return "Отправим преподавателю в WhatsApp";
    }
    if (active.length === 2) return `Отправим преподавателю в ${active[0]} и ${active[1]}`;
    return `Отправим преподавателю в ${active.slice(0, -1).join(", ")} и ${active[active.length - 1]}`;
  }

  function suggestTwoDows(bk, tutor) {
    const base = bk && bk.dow != null && Number.isInteger(Number(bk.dow)) ? Number(bk.dow) : 3;
    const openDows = tutor && tutor.slots
      ? sortDows(Object.keys(tutor.slots).map((k) => Number(k)).filter((k) => (tutor.slots[k] || []).length))
      : [];
    const secondCandidate = openDows.find((d) => d !== base) ?? (base === 3 ? 4 : (base === 4 ? 3 : 4));
    const pair = sortDows([base, secondCandidate]);
    return pair.length >= 2 ? pair.slice(0, 2) : [3, 4];
  }

  function suggestAltSchedule(dows, hour, tutor) {
    const cur = sortDows(dows);
    const openDows = tutor && tutor.slots
      ? sortDows(Object.keys(tutor.slots).map((k) => Number(k)).filter((k) => (tutor.slots[k] || []).length))
      : [];
    const pool = openDows.length >= 2 ? openDows : [1, 2, 3, 4, 5, 6];
    const diffDays = pool.filter((d) => !cur.includes(d));
    const picked = diffDays.length >= 2
      ? diffDays.slice(0, 2)
      : sortDows([diffDays[0] ?? (cur[0] === 2 ? 5 : 2), diffDays[1] ?? (cur[1] === 5 ? 6 : 5)]).slice(0, 2);
    const finalDays = picked.length === 2 ? picked : (cur[0] === 1 && cur[1] === 5 ? [2, 4] : [1, 5]);
    const altHour = String(hour || "16:00") === "18:00" ? "17:00" : "18:00";
    return { dows: sortDows(finalDays), hour: altHour };
  }

  function getSchedDraft(bk, tutor) {
    const ui = getUi();
    const map = ui.schedDrafts || (ui.schedDrafts = {});
    if (!map[bk.id]) {
      const plan = bk.schedulePlan || {};
      const dows = Array.isArray(plan.dows) && plan.dows.length
        ? sortDows(plan.dows)
        : suggestTwoDows(bk, tutor);
      map[bk.id] = {
        dows,
        hour: String(plan.hour || bk.hour || "16:00"),
        weekly: plan.weekly !== false
      };
    }
    return map[bk.id];
  }

  function renderHomeScheduleBoxHTML(bk, tutor) {
    const ui = getUi();
    const plan = bk.schedulePlan || { status: "needs_pick", dows: suggestTwoDows(bk, tutor), hour: bk.hour || "16:00", weekly: true };
    const status = plan.status || "needs_pick";
    const isEditing = ui.schedEditId === bk.id || status === "needs_pick";

    if (isEditing) {
      const draft = getSchedDraft(bk, tutor);
      const dows = sortDows(draft.dows);
      const hour = String(draft.hour || "16:00");
      const weekly = draft.weekly !== false;
      const phrase = formatWeeklyBotPhrase(dows, hour, weekly);
      const ready = dows.length >= 1;
      const countBadge = dows.length === 7
        ? "Все 7 дней"
        : (dows.length ? `${dows.length} ${plural(dows.length, "день", "дня", "дней")}` : "0 дней");
      return `<div class="bid-sched-card" data-sched-box="${esc(bk.id)}">
        <div class="bid-sched-head">
          <div>
            <b>Выберите дни и время</b>
            <span class="small muted">От 1 до 7 дней · 10:00–23:00</span>
          </div>
          <span class="chip ${ready ? "accent" : ""} num">${esc(countBadge)}</span>
        </div>
        <div class="bid-sched-days" role="group" aria-label="Дни занятий (от 1 до 7)">
          ${WEEK_DAYS_UI.map((d) => {
            const on = dows.includes(d.dow);
            return `<button type="button" class="bid-sched-day-btn${on ? " on" : ""}" data-a="bid-sched-day" data-id="${esc(bk.id)}" data-dow="${d.dow}" aria-pressed="${on}">${d.short}</button>`;
          }).join("")}
        </div>
        <div class="bid-sched-hours" role="group" aria-label="Время начала урока с 10:00 до 23:00">
          ${SCHED_HOURS.map((h) => `<button type="button" class="bid-sched-hour-btn${hour === h ? " on" : ""}" data-a="bid-sched-hour" data-id="${esc(bk.id)}" data-hour="${h}" aria-pressed="${hour === h}">${h}</button>`).join("")}
        </div>
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="chip-btn${weekly ? " on" : ""}" data-a="bid-sched-weekly" data-id="${esc(bk.id)}" aria-pressed="${weekly}">${icon("cal")}<span>Каждую неделю</span></button>
          <span class="small muted num">${esc(formatDaysShort(dows))} · ${esc(hour)}</span>
        </div>
        <div class="bid-sched-bot">
          <b>Бот напишет преподавателю на платформе:</b>
          <span>«Ученик хочет заниматься ${esc(phrase)}. График сразу закрепится в «Учёбе» — при необходимости можно выбрать другие даты, и мы сразу предложим их ученику.»</span>
        </div>
        <button type="button" class="btn sm bid-sched-submit" data-a="bid-sched-send" data-id="${esc(bk.id)}"${ready ? "" : " disabled"}>
          ${ready ? "Закрепить график" : "Выберите хотя бы 1 день"}
        </button>
      </div>`;
    }

    if (status === "sent_to_tutor") {
      return `<div class="bid-sched-card is-sent" data-sched-box="${esc(bk.id)}">
        <div class="bid-sched-head">
          <div>
            <b>Бот отправил график преподавателю</b>
            <span class="small muted">${esc(formatDaysShort(plan.dows))} · ${esc(plan.hour || bk.hour)}${plan.weekly !== false ? " · каждую неделю" : ""}</span>
          </div>
          <span class="chip accent">Ждём ответ</span>
        </div>
        <div class="bid-sched-bot">
          <span>«Ученик хочет заниматься ${esc(plan.botText || formatWeeklyBotPhrase(plan.dows, plan.hour, plan.weekly))}. Преподаватель может подтвердить или предложить другие даты.»</span>
        </div>
        <button type="button" class="btn ghost sm bid-sched-full-btn" data-a="bid-sched-edit" data-id="${esc(bk.id)}">Изменить даты и время</button>
        <div class="bid-sched-actions">
          <button type="button" class="btn confirm sm" data-a="bid-sched-confirm" data-id="${esc(bk.id)}">Принять график</button>
          <button type="button" class="btn soft sm" data-a="bid-sched-alt-sim" data-id="${esc(bk.id)}">Другие даты</button>
        </div>
      </div>`;
    }

    if (status === "tutor_proposed") {
      return `<div class="bid-sched-card is-proposed" data-sched-box="${esc(bk.id)}">
        <div class="bid-sched-head">
          <div>
            <b>Преподаватель предложил другие даты</b>
            <span class="small muted">Вместо ${esc(formatDaysShort(plan.dows))} · ${esc(plan.hour || bk.hour)}</span>
          </div>
          <span class="chip notif">Новое время</span>
        </div>
        <div class="bid-sched-bot">
          <b>Предложение преподавателя:</b>
          <span>${esc(formatDaysShort(plan.altDows))} · ${esc(plan.altHour || "17:00")}${plan.weekly !== false ? " · каждую неделю" : ""} (${esc(plan.altBotText || formatWeeklyBotPhrase(plan.altDows, plan.altHour, plan.weekly))})</span>
        </div>
        <div class="bid-sched-actions">
          <button type="button" class="btn confirm sm" data-a="bid-sched-accept-alt" data-id="${esc(bk.id)}">Подходит, закрепить</button>
          <button type="button" class="btn ghost sm" data-a="bid-sched-edit" data-id="${esc(bk.id)}">Выбрать другие дни</button>
        </div>
      </div>`;
    }

    return `<div class="bid-sched-confirmed" data-sched-box="${esc(bk.id)}">
      <div style="min-width:0">
        <b>График закреплён${plan.weekly !== false ? " · каждую неделю" : ""}</b>
        <span class="small muted num">${esc(formatDaysShort(plan.dows))} · ${esc(plan.hour || bk.hour)}</span>
        <span class="small muted">Бот уведомил преподавателя — при необходимости он предложит другие даты</span>
      </div>
      <button type="button" class="btn ghost sm" data-a="bid-sched-edit" data-id="${esc(bk.id)}">Изменить</button>
    </div>`;
  }

  function cardDiffTagsHTML(t, offerPrice) {
    const marketP = Number(t.marketPrice) || Number(t.price) || 1200;
    const customBadges = Array.isArray(t.customBadges)
      ? t.customBadges.map((b) => String(b || "").trim()).filter(Boolean).slice(0, 2)
      : [];
    const tags = [];
    const diffBelow = Math.max(0, marketP - offerPrice);
    const diffAbove = Math.max(0, offerPrice - marketP);
    if (diffBelow > 0) {
      const pct = Math.max(1, Math.round((diffBelow / Math.max(1, marketP)) * 100));
      tags.push(`<span class="diff-tag save-cool num">на ${diffBelow.toLocaleString("ru-RU")} ₽ ниже рынка</span>`);
      tags.push(`<span class="diff-tag save-cyan num">−${pct}%</span>`);
    } else if (diffAbove > 0) {
      const pct = Math.max(1, Math.round((diffAbove / Math.max(1, marketP)) * 100));
      const qual = customBadges[0] || t.qualBadge || "Высокая квалификация";
      tags.push(`<span class="diff-tag pro">${esc(qual)}</span>`);
      tags.push(`<span class="diff-tag pro num">выше рынка +${pct}%</span>`);
    } else if (customBadges.length) {
      customBadges.slice(0, 2).forEach((b) => tags.push(`<span class="diff-tag pro">${esc(b)}</span>`));
    } else {
      tags.push(`<span class="diff-tag rate">${esc(t.qualBadge || "Ставка по рынку")}</span>`);
    }
    return tags.slice(0, 2).join("");
  }

  /** Лаконичная карточка преподавателя одинакового размера без лишнего шума. */
  function tutorCardHTML(t) {
    const TDATA = getTDATA();
    const ui = getUi();
    const st = getMkt();
    const isFav = Array.isArray(st.favs) && st.favs.includes(t.id);
    const cardOffers = ui.cardOffers || (ui.cardOffers = {});
    const hasDraft = cardOffers[t.id] != null && Number.isFinite(Number(cardOffers[t.id]));
    const cardPrice = hasDraft ? Math.max(0, Math.min(99999, Math.round(Number(cardOffers[t.id])))) : Math.max(0, Number(t.price) || 1200);
    const aboveRub = Math.max(0, cardPrice - (Number(t.marketPrice) || cardPrice));
    const isProCard = !!(t.tier === "pro" || Number(t.price) > (Number(t.marketPrice) || Number(t.price)) || (t.bumpedToday && Number(t.rating) >= 4.9));
    const expandedMap = ui.expandedBios || {};
    const isBioOpen = !!expandedMap[t.id];
    const guaranteeInfo = resolveTutorGuarantee(t);
    const alreadyBooked = Array.isArray(st.bookings) && st.bookings.some((bk) => bk.tutorId === t.id);

    return `<article class="card tutor-card${isProCard ? " is-pro" : ""}" data-tutor-id="${esc(t.id)}">
      <div class="tutor-card-top">
        <div class="tutor-head">
          <div style="min-width:0">
            <h3 class="h3" style="font-size:17px">${esc(t.subjectName)}</h3>
            <div class="hh-price-row" style="margin-top:4px" data-card-price-row="${esc(t.id)}">
              ${aboveRub > 0
                ? `<b class="hh-price-now num">${cardPrice.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted num">рынок ${(t.marketPrice || cardPrice).toLocaleString("ru-RU")} ₽</span>`
                : `${t.marketPrice && cardPrice < t.marketPrice ? `<s class="hh-price-old num">${t.marketPrice.toLocaleString("ru-RU")} ₽</s>` : ""}<div class="tutor-rate num">${cardPrice.toLocaleString("ru-RU")} ₽/ч</div>`}
            </div>
          </div>
          <button type="button" class="fav-btn" data-a="mkt-fav" data-id="${esc(t.id)}" aria-pressed="${isFav}" aria-label="В избранное">${icon(isFav ? "heartFill" : "heart")}</button>
        </div>
        <div class="hh-diff-strip" data-card-diff="${esc(t.id)}">
          ${cardDiffTagsHTML(t, cardPrice)}
        </div>

        <div class="tutor-name-line">
          ${tutorAvatarHTML(t)}
          <div class="tutor-person-meta">
            <div class="tutor-title-inline">
              <b class="tutor-person-name">${esc(t.name)}</b>
              ${t.verified ? `<span class="verified-badge" title="Преподаватель лично ведёт кабинет на платформе">${icon("check")}</span>` : ""}
            </div>
            <span class="small muted">${esc(t.city)} · ${esc(t.exp)} · ★ ${t.rating.toFixed(1)} (${t.reviews})</span>
          </div>
        </div>

        <div class="tutor-bio-wrap${isBioOpen ? " is-open" : ""}">
          <p class="tutor-bio">${esc(t.bio)}</p>
          <button type="button" class="tutor-bio-more" data-a="tutor-bio-toggle" data-id="${esc(t.id)}" aria-expanded="${isBioOpen ? "true" : "false"}" title="${isBioOpen ? "Свернуть описание" : "Развернуть описание"}">
            <span>${isBioOpen ? "Свернуть" : "Развернуть"}</span>
            ${icon("chevDown")}
          </button>
        </div>
      </div>

      <div class="tutor-card-foot">
        <div class="hh-price-stepper compact tutor-card-stepper">
          <button type="button" class="hh-step-btn" data-a="card-offer-step" data-id="${esc(t.id)}" data-step="-50" aria-label="Снизить цену на 50 рублей">−50 ₽</button>
          <div class="hh-step-readout"><b class="num" data-card-val="${esc(t.id)}">${cardPrice.toLocaleString("ru-RU")} ₽/ч</b></div>
          <button type="button" class="hh-step-btn" data-a="card-offer-step" data-id="${esc(t.id)}" data-step="50" aria-label="Повысить цену на 50 рублей">+50 ₽</button>
        </div>
        <button type="button" class="btn tutor-bid-btn${alreadyBooked ? " is-confirmed" : ""}" data-a="card-bid" data-id="${esc(t.id)}" data-offer="${cardPrice}"><span>${esc(plainBidLabel(alreadyBooked, cardPrice))}</span></button>
        <span class="small muted card-messenger-note">${esc(tutorChannelNote(t))}</span>
        <div class="tutor-sub-actions">
          ${guaranteeInfo.enabled
            ? `<button type="button" class="btn soft sm trial-guar-btn is-active" data-a="trial-open" data-id="${esc(t.id)}">${icon("check")}<span>Возврат за 1-й урок</span></button>`
            : `<button type="button" class="btn ghost sm trial-guar-btn is-grey" data-a="book-open" data-id="${esc(t.id)}" data-offer="${cardPrice}"><span>Без бесплатного 1-го</span></button>`}
          <button type="button" class="btn ghost sm" data-a="book-open" data-id="${esc(t.id)}" data-offer="${cardPrice}">Подробнее</button>
        </div>
      </div>
    </article>`;
  }

  function bookingsStripHTML(st) {
    const TDATA = getTDATA();
    if (!TDATA || !st.bookings.length) return "";
    const ui = getUi();
    const bkCols = [3, 5, 7].includes(Number(ui.mktBkCols)) ? Number(ui.mktBkCols) : 5;
    const bkFilter = ["all", "pending", "accepted"].includes(ui.mktBkFilter) ? ui.mktBkFilter : "all";
    const pendingCnt = st.bookings.filter((b) => b.status !== "accepted").length;
    const acceptedCnt = st.bookings.filter((b) => b.status === "accepted").length;
    const trialDefault = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;

    const bkColumns = [
      {
        key: "tutor",
        label: "Преподаватель и предмет",
        render: (bk, h) => {
          const isTrial = !!bk.isTrial;
          const trialRub = bk.offerPrice != null && Number.isFinite(Number(bk.offerPrice)) ? Number(bk.offerPrice) : trialDefault;
          return `<div class="stack" style="gap:4px;min-width:0">
            <b>${esc(bk.tutorName)}</b>
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <span class="chip">${esc(bk.exam)} · ${esc(bk.subjectName)}</span>
              ${isTrial ? `<span class="chip gold">${trialRub === 0 ? "Пробный · Бесплатно" : `Пробный · ${trialRub.toLocaleString("ru-RU")} ₽`}</span>` : ""}
            </div>
            ${h.cols === 3 ? `<span class="small muted">${esc(bk.dayLabel)} · ${esc(bk.hour)}</span>` : ""}
          </div>`;
        }
      },
      {
        key: "slot",
        label: "Детали",
        minCols: 5,
        render: (bk) => `<div class="stack" style="gap:2px">
          <b class="num">${esc(bk.dayLabel)} · ${esc(bk.hour)}</b>
          <span class="small muted">${esc(bk.subjectName)}</span>
        </div>`
      },
      {
        key: "offerPrice",
        label: "Ваша ставка",
        num: true,
        render: (bk) => {
          const isTrial = !!bk.isTrial;
          const trialRub = bk.offerPrice != null && Number.isFinite(Number(bk.offerPrice)) ? Number(bk.offerPrice) : trialDefault;
          const offerNum = Number(bk.offerPrice);
          const tutorNum = Number(bk.tutorPrice);
          const showOldPrice = Number.isFinite(tutorNum) && tutorNum > 0 && Number.isFinite(offerNum) && offerNum !== tutorNum;
          return isTrial
            ? `<b class="num">${trialRub === 0 ? "Пробный · Бесплатно" : `Пробный ${trialRub.toLocaleString("ru-RU")} ₽`}</b>`
            : `<div class="stack" style="gap:2px"><b class="num">${offerNum.toLocaleString("ru-RU")} ₽/ч</b>${showOldPrice ? `<span class="small muted num">вместо ${tutorNum.toLocaleString("ru-RU")} ₽</span>` : ""}</div>`;
        }
      },
      {
        key: "status",
        label: "Статус",
        minCols: 5,
        render: (bk) => {
          const accepted = bk.status === "accepted";
          return `<span class="bb-tbl-st ${accepted ? "is-confirmed" : "is-pending"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>`;
        }
      },
      {
        key: "note",
        label: "Пожелание",
        minCols: 5,
        render: (bk) => `<span class="small ink2">${esc(bk.note || "Без комментария")}</span>`
      },
      {
        key: "format",
        label: "Формат",
        minCols: 7,
        render: (bk) => `<span class="small">${esc(bk.format || "Онлайн")}</span>`
      },
      {
        key: "actions",
        label: "Действия",
        isActions: true,
        render: (bk, h) => {
          const accepted = bk.status === "accepted";
          const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId);
          const isTrial = !!bk.isTrial || Number(bk.offerPrice) === 0;
          const msgTxt = `Здравствуйте, ${bk.tutorName}! Напоминаю про занятие (${bk.subjectName}, ${bk.dayLabel} в ${bk.hour}, ${isTrial ? "пробный урок 0 ₽" : "ставка " + bk.offerPrice + " ₽/ч"}).`;
          const waHref = accepted
            ? TDATA.whatsappUrl(tutor || { name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" }, msgTxt)
            : "";
          const resolvedTutor = resolveTutorWithContacts(tutor || { id: bk.tutorId, name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" });
          const msgHtml = accepted
            ? (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                ? EGE.kit.messengerLinksHTML({
                    entity: resolvedTutor,
                    available: tutorChannels(resolvedTutor),
                    allowHoldAdd: true,
                    message: msgTxt,
                    primaryLabel: "WhatsApp",
                    compact: true
                  })
                : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`)
            : "";
          return `<div class="stack bk-tbl-actions-stack" style="gap:8px">
            ${h.cols === 3 ? `<span class="bb-tbl-st ${accepted ? "is-confirmed" : "is-pending"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>` : ""}
            ${accepted
              ? `${msgHtml}<button type="button" class="btn ghost sm bk-tbl-secondary-btn" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">Сменить репетитора</button>`
              : `<div class="bk-tbl-pending-btns"><button type="button" class="btn confirm sm" data-a="mkt-sim-accept" data-id="${esc(bk.id)}">${icon("check")}<span>Подтвердить</span></button><button type="button" class="btn ghost sm" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">Отменить</button></div>`}
          </div>`;
        }
      }
    ];

    const tableHtml = renderDataTable({
      id: "student-bookings-table",
      cardWrap: false,
      showPresetSwitch: false,
      eyebrow: `Мои заявки · доступно ${Number(st.balance || 0).toLocaleString("ru-RU")} ₽`,
      title: "Отправленные отклики и ставки ±50 ₽",
      cols: bkCols,
      filter: bkFilter,
      query: ui.mktBkQuery || "",
      filterAction: "mkt-bk-filter",
      colsAction: "mkt-bk-cols",
      searchAction: "mkt-bk-q",
      searchId: "mkt-bk-q",
      searchPlaceholder: "Поиск: преподаватель, предмет, слот…",
      confirmAction: "mkt-sim-accept",
      filters: [
        { id: "all", label: `Все (${st.bookings.length})`, match: () => true },
        { id: "pending", label: `Ждут ответа (${pendingCnt})`, match: (r) => r.status !== "accepted" },
        { id: "accepted", label: `Подтверждены (${acceptedCnt})`, match: (r) => r.status === "accepted" }
      ],
      columns: bkColumns,
      rows: st.bookings,
      searchFields: (bk) => [bk.tutorName, bk.exam, bk.subjectName, bk.dayLabel, bk.hour, bk.format, bk.note, String(bk.offerPrice || "")].join(" "),
      emptyText: "По выбранному фильтру откликов нет."
    });

    return `<section class="card pad-lg stack reqs-strip" style="gap:10px" aria-label="Мои заявки">${tableHtml}</section>`;
  }

  function generateTelemostUrl() {
    const code = String(Date.now()).slice(-8) + String(Math.floor(100000 + Math.random() * 900000));
    return `https://telemost.yandex.ru/j/${code}`;
  }

  function normalizeTelemostUrl(raw) {
    let val = String(raw == null ? "" : raw).trim();
    if (!val) return { ok: true, url: "" };
    if (/^(javascript|data|vbscript):/i.test(val)) {
      return { ok: false, error: "Укажите корректную https-ссылку, например https://telemost.yandex.ru/j/..." };
    }
    if (/^telemost\.yandex\.[a-z]{2,}/i.test(val)) val = "https://" + val;
    if (!/^https:\/\/telemost\.yandex\.(ru|com)\/[A-Za-z0-9_/?=&.\-%#]+$/i.test(val) || /\s/.test(val) || val.length > 512) {
      return { ok: false, error: "Укажите корректную ссылку Яндекс Телемост, например https://telemost.yandex.ru/j/..." };
    }
    return { ok: true, url: val };
  }

  /** Возвращает единую постоянную ссылку Телемост ученика, автоматически создавая и синхронизируя её при необходимости. */
  function ensureUnifiedTelemostUrl(st) {
    if (!st) return "";
    let changed = false;
    let url = "";
    const topParsed = st.telemostUrl ? normalizeTelemostUrl(st.telemostUrl) : { ok: false, url: "" };
    if (topParsed.ok && topParsed.url) {
      url = topParsed.url;
    } else if (Array.isArray(st.bookings)) {
      for (let i = 0; i < st.bookings.length; i++) {
        const b = st.bookings[i];
        const parsed = b && b.telemostUrl ? normalizeTelemostUrl(b.telemostUrl) : { ok: false, url: "" };
        if (parsed.ok && parsed.url) {
          url = parsed.url;
          break;
        }
      }
    }
    if (!url) {
      url = generateTelemostUrl();
      changed = true;
    }
    if (st.telemostUrl !== url) {
      st.telemostUrl = url;
      changed = true;
    }
    if (Array.isArray(st.bookings)) {
      st.bookings.forEach((b) => {
        if (b && !String(b.telemostUrl || "").trim()) {
          b.telemostUrl = url;
          changed = true;
        }
      });
    }
    if (changed && typeof _ctx.saveMkt === "function") _ctx.saveMkt();
    return url;
  }

  function telemostBlockHTML(bk, telemostUrl, isEditingTm, ui, joinLabel) {
    if (isEditingTm) {
      return `<form class="bid-telemost-form" data-f="bid-telemost" data-id="${esc(bk.id)}">
        <label class="small muted" for="tm-inp-${esc(bk.id)}">Единая ссылка Яндекс Телемост (для всех уроков)</label>
        <input class="input bid-telemost-inp" id="tm-inp-${esc(bk.id)}" name="url" type="url" placeholder="https://telemost.yandex.ru/j/..." value="${esc(telemostUrl)}">
        <span class="small muted">Передаётся преподавателю сама через WhatsApp или Telegram-бот.</span>
        ${ui.telemostError ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(ui.telemostError)}</div>` : ""}
        <div class="bid-telemost-form-actions">
          <button type="submit" class="btn sm">Сохранить</button>
          <button type="button" class="btn soft sm" data-a="bid-telemost-gen" data-id="${esc(bk.id)}">Создать новую</button>
          <button type="button" class="btn ghost sm" data-a="bid-telemost-cancel">Отмена</button>
        </div>
      </form>`;
    }
    return `<div class="bid-telemost-saved">
      <a class="btn soft sm bid-telemost-join" href="${esc(telemostUrl)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>${esc(joinLabel || "Яндекс Телемост · Подключиться")}</span></a>
      <div class="bid-telemost-auto-note">Единая постоянная ссылка · будет передана преподавателю сама (WhatsApp или Telegram-бот)</div>
      <button type="button" class="btn ghost sm bid-telemost-edit" data-a="bid-telemost-edit" data-id="${esc(bk.id)}">Изменить ссылку</button>
    </div>`;
  }

  function saveTelemostForBooking(bookingId, rawUrl) {
    const ui = getUi();
    const st = getMkt();
    const bk = (st.bookings || []).find((x) => x.id === bookingId);
    if (!bk) return { ok: false, error: "Заявка не найдена." };
    const parsed = normalizeTelemostUrl(rawUrl);
    if (!parsed.ok || !parsed.url) {
      ui.telemostError = parsed.error || "Укажите ссылку Яндекс Телемост (https://telemost.yandex.ru/j/...) или нажмите «Создать новую».";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return { ok: false, error: ui.telemostError };
    }
    st.telemostUrl = parsed.url;
    (st.bookings || []).forEach((b) => { if (b) b.telemostUrl = parsed.url; });
    ui.telemostEditId = "";
    ui.telemostError = "";
    if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
    if (_ctx.store && _ctx.store.backend && _ctx.store.user && EGE.api && EGE.api.bookings && bk.serverSynced) {
      EGE.api.bookings.updateTelemost(bk.id, parsed.url).catch(() => {});
    }
    if (typeof _ctx.notifySide === "function") {
      _ctx.notifySide(
        "Яндекс Телемост",
        "Единая ссылка обновлена — будет передана преподавателю сама (WhatsApp или Telegram-бот)"
      );
    }
    if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
    return { ok: true, url: parsed.url };
  }

  function studentHomeBidsHTML() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const st = getMkt();
    const ui = getUi();
    const all = Array.isArray(st.bookings) ? st.bookings : [];
    const vc = st.verifiedContact && st.verifiedContact.value ? String(st.verifiedContact.value) : "";
    if (!all.length) {
      return `<section class="stack home-bids-wrap" id="home-bids-section" style="gap:12px" aria-label="Мои отклики преподавателям">
        <div class="home-bids-head">
          <div>
            <div class="eyebrow">Отклики и ответы</div>
            <h2 class="h2">Мои отклики преподавателям</h2>
          </div>
          <button type="button" class="btn soft sm" data-a="go" data-v="market">Поиск</button>
        </div>
        <div class="card pad-lg stack" style="gap:12px">
          <p class="small ink2" style="margin:0">Откликов пока нет. Найдите преподавателя в разделе «Поиск» и предложите свою цену — здесь появится карточка преподавателя, единая постоянная ссылка на Яндекс Телемост (передаётся сама по WhatsApp или через Telegram-бот) и статус ответа.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn sm" data-a="go" data-v="market">Найти преподавателя</button>
            <button type="button" class="btn soft sm" data-a="go-student-lead">Оставить заявку</button>
          </div>
        </div>
      </section>`;
    }
    const unifiedTelemost = ensureUnifiedTelemostUrl(st);
    const pendingCnt = all.filter((b) => b.status !== "accepted").length;
    const acceptedCnt = all.length - pendingCnt;
    const flt = ["all", "pending", "accepted"].includes(ui.homeBidFilter) ? ui.homeBidFilter : "all";
    const rows = flt === "pending"
      ? all.filter((b) => b.status !== "accepted")
      : (flt === "accepted" ? all.filter((b) => b.status === "accepted") : all);
    const expandedMap = ui.expandedBios || {};
    const cardsHTML = rows.length
      ? `<div class="tutor-grid home-bid-grid">${rows.map((bk) => {
          const accepted = bk.status === "accepted";
          const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId) || {
            id: bk.tutorId,
            name: bk.tutorName,
            subjectName: bk.subjectName,
            city: "Онлайн",
            exp: "Опытный преподаватель",
            rating: 5.0,
            reviews: 12,
            bio: "Индивидуальные занятия по вашим целям и уровню подготовки.",
            price: bk.tutorPrice || bk.offerPrice || 1200,
            marketPrice: Math.round(((bk.tutorPrice || bk.offerPrice || 1200) * 1.25) / 50) * 50,
            verified: true,
            whatsapp: "79142100101"
          };
          const isFav = Array.isArray(st.favs) && st.favs.includes(tutor.id);
          const isBioOpen = !!expandedMap["bid:" + bk.id];
          const trialDefault = TDATA.TRIAL_PRICE != null ? Number(TDATA.TRIAL_PRICE) : 490;
          const isTrial = !!bk.isTrial;
          const trialRub = bk.offerPrice != null && Number.isFinite(Number(bk.offerPrice)) ? Number(bk.offerPrice) : trialDefault;
          const offerNum = isTrial ? trialRub : Math.max(0, Number(bk.offerPrice || tutor.price || 1200));
          const isProCard = !!(tutor.tier === "pro" || Number(tutor.price) > (Number(tutor.marketPrice) || Number(tutor.price)) || (tutor.bumpedToday && Number(tutor.rating) >= 4.9));
          const priceBlockHTML = isTrial
            ? `<div class="tutor-rate num">${trialRub === 0 ? "Пробный · 0 ₽" : `Пробный · ${trialRub.toLocaleString("ru-RU")} ₽`}</div>`
            : `${tutor.marketPrice && offerNum < tutor.marketPrice ? `<s class="hh-price-old num">${tutor.marketPrice.toLocaleString("ru-RU")} ₽</s>` : ""}<div class="tutor-rate num">${offerNum.toLocaleString("ru-RU")} ₽/ч</div>`;
          const telemostUrl = String(bk.telemostUrl || unifiedTelemost || "").trim();
          const isEditingTm = ui.telemostEditId === bk.id;
          const tmHTML = telemostBlockHTML(bk, telemostUrl, isEditingTm, ui, "Яндекс Телемост · Подключиться");
          const resolvedTutor = resolveTutorWithContacts(tutor);
          const msgTxt = `Здравствуйте, ${bk.tutorName}! Напоминаю про занятие (${bk.subjectName}, ${bk.dayLabel} в ${bk.hour}, ${isTrial ? "пробный урок" : "ставка " + bk.offerPrice + " ₽/ч"}).${telemostUrl ? " Ссылка на Яндекс Телемост: " + telemostUrl : ""}`;
          const waHref = TDATA.whatsappUrl(resolvedTutor, msgTxt);
          const chAvail = tutorChannels(resolvedTutor);
          return `<article class="card tutor-card${isProCard ? " is-pro" : ""} is-home-bid" data-tutor-id="${esc(tutor.id)}" data-booking-id="${esc(bk.id)}">
            <div class="tutor-card-top">
              <div class="tutor-head">
                <div style="min-width:0">
                  <h3 class="h3" style="font-size:17px">${esc(bk.subjectName || tutor.subjectName)}</h3>
                  <div class="hh-price-row" style="margin-top:4px">${priceBlockHTML}</div>
                </div>
                <button type="button" class="fav-btn" data-a="mkt-fav" data-id="${esc(tutor.id)}" aria-pressed="${isFav}" aria-label="В избранное">${icon(isFav ? "heartFill" : "heart")}</button>
              </div>
              <div class="hh-diff-strip">${cardDiffTagsHTML(tutor, offerNum)}</div>
              <div class="tutor-name-line">
                ${tutorAvatarHTML(tutor)}
                <div class="tutor-person-meta">
                  <div class="tutor-title-inline">
                    <b class="tutor-person-name">${esc(tutor.name || bk.tutorName)}</b>
                    ${tutor.verified !== false ? `<span class="verified-badge" title="Преподаватель лично ведёт кабинет на платформе">${icon("check")}</span>` : ""}
                  </div>
                  <span class="small muted">${esc(tutor.city || "Онлайн")} · ${esc(tutor.exp || "Репетитор")} · ★ ${Number(tutor.rating || 5).toFixed(1)} (${Number(tutor.reviews || 0)})</span>
                </div>
              </div>
              ${tutor.bio ? `<div class="tutor-bio-wrap${isBioOpen ? " is-open" : ""}">
                <p class="tutor-bio">${esc(tutor.bio)}</p>
                <button type="button" class="tutor-bio-more" data-a="tutor-bio-toggle" data-id="bid:${esc(bk.id)}" aria-expanded="${isBioOpen ? "true" : "false"}" title="${isBioOpen ? "Свернуть описание" : "Развернуть описание"}">
                  <span>${isBioOpen ? "Свернуть" : "Развернуть"}</span>
                  ${icon("chevDown")}
                </button>
              </div>` : ""}
              <div class="home-bid-slot">
                ${icon("cal")}
                <span>${esc(bk.exam || "ЕГЭ")} · ${esc(bk.dayLabel)} · ${esc(bk.hour)} · ${esc(bk.format || "Онлайн")}${bk.note ? ` · «${esc(bk.note)}»` : ""}</span>
              </div>
            </div>
            <div class="tutor-card-foot">
              ${(() => {
                const schedStatus = bk.schedulePlan && bk.schedulePlan.status;
                const acceptedHint = schedStatus === "confirmed"
                  ? `Написали вам в СМС${vc ? ` (${esc(vc)})` : ""} · график закреплён в «Учёбе»`
                  : schedStatus === "tutor_proposed"
                    ? "Преподаватель предложил другие даты · посмотрите ниже"
                    : `Написали вам в СМС${vc ? ` (${esc(vc)})` : ""} · выберите дни ниже`;
                return `<div class="home-bid-status ${accepted ? "is-accepted" : "is-pending"}">
                  <b>${accepted ? "Преподаватель ответил · подтверждено" : "Ожидаем ответ преподавателя"}</b>
                  <span>${accepted
                    ? acceptedHint
                    : `Придёт СМС${vc ? ` на ${esc(vc)}` : ""} · затем выберите дни`}</span>
                </div>`;
              })()}
              ${accepted ? renderHomeScheduleBoxHTML(bk, tutor) : ""}
              <div class="bid-telemost-box">${tmHTML}</div>
              ${accepted ? ((EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
                ? `${EGE.kit.messengerLinksHTML({ entity: resolvedTutor, available: chAvail, allowHoldAdd: true, message: msgTxt, primaryLabel: "WhatsApp", compact: true })}<span class="study-hold-hint">Удерживайте WhatsApp, Telegram или MAX, чтобы указать или изменить контакт</span>`
                : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`) : ""}
              <div class="home-bid-actions">
                ${accepted
                  ? `<button type="button" class="btn soft sm" data-a="go" data-v="study">Открыть «Учёбу»</button><button type="button" class="btn ghost sm" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">Отменить</button>`
                  : `<button type="button" class="btn confirm sm" data-a="mkt-sim-accept" data-id="${esc(bk.id)}">${icon("check")}<span>Подтвердить</span></button><button type="button" class="btn ghost sm" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">Отменить</button>`}
              </div>
            </div>
          </article>`;
        }).join("")}</div>`
      : `<div class="empty home-bid-empty"><b>В этом фильтре откликов пока нет</b><span>Переключите вкладку выше или отправьте новый отклик преподавателю в «Поиске».</span></div>`;
    return `<section class="stack home-bids-wrap" id="home-bids-section" style="gap:12px" aria-label="Мои отклики преподавателям">
      <div class="home-bids-head">
        <div>
          <div class="eyebrow">Отклики и ответы</div>
          <h2 class="h2">Мои отклики преподавателям</h2>
        </div>
        <button type="button" class="btn soft sm" data-a="go" data-v="market">Найти ещё</button>
      </div>
      <div class="hh-seg home-bid-seg" role="group" aria-label="Фильтр откликов">
        <button type="button" data-a="home-bid-filter" data-v="all" aria-pressed="${flt === "all"}">Все (${all.length})</button>
        <button type="button" data-a="home-bid-filter" data-v="pending" aria-pressed="${flt === "pending"}">Ожидаем ответ (${pendingCnt})</button>
        <button type="button" data-a="home-bid-filter" data-v="accepted" aria-pressed="${flt === "accepted"}">Ответили (${acceptedCnt})</button>
      </div>
      ${cardsHTML}
    </section>`;
  }

  function activeFilterCount(st) {
    st = st || getMkt();
    let n = 0;
    if (st.exam && st.exam !== "all") n++;
    if (st.format && st.format !== "all") n++;
    if (st.city && st.city !== "all") n++;
    if (st.subject && st.subject !== "all") n++;
    if (Number(st.minPrice) > 0 || Number(st.maxPrice) > 0) n++;
    if (st.onlyBumped) n++;
    if (st.q && String(st.q).trim()) n++;
    return n;
  }

  function bookingModalHTML() {
    const ui = getUi();
    const TDATA = getTDATA();
    if (!ui.booking || !TDATA) return "";
    const b = ui.booking, tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
    if (!tutor) return "";
    const gInfo = resolveTutorGuarantee(tutor);
    const offerPrice = Math.max(0, Math.min(99999, b.offerPrice != null ? Math.round(Number(b.offerPrice)) : (Number(tutor.price) || 1200)));
    const sig = TDATA.offerSignal(tutor.price, offerPrice);

    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="book-modal-title">
      <div class="modal-card sheet-modal is-booking-sheet" data-sheet-kind="booking">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="book-close" aria-label="Свернуть окно">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="tutor-modal-head">
            ${tutorAvatarHTML(tutor)}
            <div class="stack" style="gap:2px;min-width:0">
              <div class="tutor-title-inline">
                <b id="book-modal-title">${esc(tutor.name)}</b>
                ${tutor.verified ? `<span class="verified-badge" title="Преподаватель лично ведёт кабинет на платформе">${icon("check")}</span>` : ""}
              </div>
              <span class="small muted">${esc(tutor.subjectName)} · ${esc(tutor.city)} · ★ ${tutor.rating.toFixed(1)} (${tutor.reviews})</span>
            </div>
          </div>
        </div>

        <div class="sheet-body">
          <p class="small ink2" style="margin:0;line-height:1.5">${esc(tutor.bio)}</p>

          <div class="trial-guar-box ${gInfo.enabled ? "is-active" : "is-grey"}" id="bid-guarantee-box">
            ${gInfo.enabled ? icon("check") : ""}
            <div class="stack" style="gap:2px;min-width:0">
              <b>${esc(gInfo.badgeLabel)}</b>
              <span class="small">${esc(gInfo.modalNote)}</span>
            </div>
          </div>

          <div class="field">
            <label for="bid-price">Твоя цена за урок (0 – 99 999 ₽/ч)</label>
            <div class="hh-price-row" id="bid-price-row" style="margin-bottom:4px">
              ${priceHeadlineHTML(tutor.marketPrice, offerPrice, false)}
            </div>
            <div class="hh-diff-strip" id="bid-diff-strip" style="margin-bottom:4px">
              ${cardDiffTagsHTML(tutor, offerPrice)}
            </div>
            <div class="hh-price-stepper">
              <button type="button" class="hh-step-btn" data-a="bid-step" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout is-inline">
                <input class="input bid-input num" id="bid-price" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" value="${offerPrice}">
                <span class="hh-step-unit">₽/ч</span>
              </div>
              <button type="button" class="hh-step-btn" data-a="bid-step" data-step="50">+50 ₽</button>
            </div>
            <div id="bid-signal" class="small"><span class="chip ${sig.tone}">${esc(sig.label)}</span></div>
          </div>

          <div class="field">
            <label for="bid-note">Твоя цель и почему хочешь заниматься у этого преподавателя</label>
            <textarea class="input" id="bid-note" rows="3" maxlength="240" placeholder="Например: цель 85+ баллов, нужно подтянуть сложные темы и разбирать варианты раз в неделю">${esc(b.note || "")}</textarea>
          </div>
        </div>

        <div class="sheet-foot is-centered is-stacked">
          <button type="button" class="btn bid-submit-main" id="bid-submit-btn" data-a="book-submit"><span data-bid-lbl="1">${esc(plainBidLabel(false, offerPrice))}</span></button>
          <span class="small muted bid-messenger-note">Отправим заявку преподавателю и напишем вам уведомление в WhatsApp, Telegram или MAX</span>
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
    const offerPrice = Math.max(0, Math.min(99999, b.offerPrice != null ? Math.round(Number(b.offerPrice)) : (Number(tutor.price) || 1200)));

    const priceEl = document.getElementById("bid-price");
    if (priceEl) {
      if (document.activeElement !== priceEl) priceEl.value = String(offerPrice);
      if (typeof priceEl.setAttribute === "function") priceEl.setAttribute("value", String(offerPrice));
    }
    const priceRowEl = document.getElementById("bid-price-row");
    if (priceRowEl) {
      priceRowEl.innerHTML = priceHeadlineHTML(tutor.marketPrice, offerPrice, false);
    }
    const diffEl = document.getElementById("bid-diff-strip");
    if (diffEl) {
      diffEl.innerHTML = cardDiffTagsHTML(tutor, offerPrice);
    }
    const subBtn = document.getElementById("bid-submit-btn");
    if (subBtn) {
      const subLbl = subBtn.querySelector && (subBtn.querySelector("[data-bid-lbl]") || subBtn.querySelector("span"));
      const txt = plainBidLabel(false, offerPrice);
      if (subLbl) subLbl.textContent = txt;
      else subBtn.innerHTML = `<span data-bid-lbl="1">${esc(txt)}</span>`;
    }
    const sigEl = document.getElementById("bid-signal");
    if (sigEl) {
      const sig = TDATA.offerSignal(tutor.price, offerPrice);
      sigEl.innerHTML = `<span class="chip ${sig.tone}">${esc(sig.label)}</span>`;
    }
  }

  function activeBookedTutorIds(st) {
    const ids = new Set();
    ((st && st.bookings) || []).forEach((bk) => {
      if (!bk || !bk.tutorId) return;
      const s = String(bk.status || "").toLowerCase();
      if (s === "cancelled" || s === "declined" || s === "refunded") return;
      ids.add(String(bk.tutorId));
    });
    return ids;
  }

  function filterAvailableTutors(st, days, TDATA) {
    if (!TDATA || typeof TDATA.filterTutors !== "function") return [];
    const raw = TDATA.filterTutors(st, days);
    const bookedIds = activeBookedTutorIds(st);
    if (!bookedIds.size) return raw;
    return raw.filter((t) => t && !bookedIds.has(String(t.id)));
  }

  function filterModalHTML() {
    const ui = getUi();
    const TDATA = getTDATA();
    if (!ui.filterModal || !TDATA) return "";
    const st = getMkt();
    const days = TDATA.buildCalendarDays(7);
    const list = filterAvailableTutors(st, days, TDATA);
    const totalWord = plural(list.length, "репетитора", "репетиторов", "репетиторов");
    const visibleSubjects = typeof TDATA.subjectsForExam === "function" ? TDATA.subjectsForExam(st.exam) : TDATA.SUBJECTS;
    const pricePresets = [
      [0, "Любая"],
      [800, "до 800 ₽"],
      [1000, "до 1 000 ₽"],
      [1200, "до 1 200 ₽"],
      [1500, "до 1 500 ₽"],
      [2000, "до 2 000 ₽"],
      [3000, "до 3 000 ₽"]
    ];
    const minP = Number(st.minPrice) || 0;
    const maxP = Number(st.maxPrice) || 0;
    const isPresetMax = minP === 0 && pricePresets.some(([v]) => v === maxP);
    const isCustomPrice = !!(st.priceCustom || !isPresetMax);
    const priceReadout = priceFilterLabel(st);

    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="filter-modal-title">
      <div class="modal-card sheet-modal is-fullscreen-sheet" data-sheet-kind="filter">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="filter-close" aria-label="Свернуть фильтры">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-filter-head">
          <span aria-hidden="true"></span>
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
              <button type="button" class="chip-btn${st.onlyBumped ? " on" : ""}" data-a="mkt-bumped-set" data-v="1">Подняты за последнюю неделю</button>
            </div>
          </div>
          <div class="stack" style="gap:8px">
            <div class="small muted">${(st.exam === "ЕГЭ" || st.exam === "ОГЭ") ? `Предметы (${esc(st.exam)})` : "Предмет и направление"}</div>
            <div class="chip-rail">
              <button type="button" class="chip-btn${st.subject === "all" ? " on" : ""}" data-a="mkt-subj" data-v="all">Все</button>
              ${visibleSubjects.map((sb) => `<button type="button" class="chip-btn${st.subject === sb.id ? " on" : ""}" data-a="mkt-subj" data-v="${sb.id}">${esc(sb.short)}</button>`).join("")}
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
            <div class="row between"><span class="small muted">Ставка за урок (₽/ч)</span><b class="num" id="filter-price-readout">${esc(priceReadout)}</b></div>
            <div class="chip-rail">
              ${pricePresets.map(([pr, lbl]) => `<button type="button" class="chip-btn${(!isCustomPrice && maxP === pr && minP === 0) ? " on" : ""}" data-a="mkt-price" data-v="${pr}">${lbl}</button>`).join("")}
              <button type="button" class="chip-btn${isCustomPrice ? " on" : ""}" data-a="mkt-price-custom">Своя</button>
            </div>
            ${isCustomPrice ? `<div class="filter-price-inputs">
              <label class="filter-num-box" for="mkt-price-min">
                <span class="small muted">От</span>
                <input class="input filter-num-inp num" id="mkt-price-min" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" placeholder="0" value="${minP > 0 ? minP : ""}">
                <span class="small muted">₽</span>
              </label>
              <label class="filter-num-box" for="mkt-price-max">
                <span class="small muted">До</span>
                <input class="input filter-num-inp num" id="mkt-price-max" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" placeholder="99999" value="${maxP > 0 ? maxP : ""}">
                <span class="small muted">₽</span>
              </label>
            </div>` : ""}
          </div>
        </div>
        <div class="sheet-foot">
          <button type="button" class="btn" id="filter-submit-btn" style="width:100%" data-a="filter-close">Показать ${list.length} ${totalWord}</button>
        </div>
      </div>
    </div>`;
  }

  function marketSectionHTML(opts) {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const isLanding = !!(opts && opts.landing);
    const ui = getUi();
    const st = getMkt();
    const days = TDATA.buildCalendarDays(7);
    const rawList = TDATA.filterTutors(st, days);
    const bookedIds = activeBookedTutorIds(st);
    const list = bookedIds.size ? rawList.filter((t) => t && !bookedIds.has(String(t.id))) : rawList;
    const allMatchedBooked = !list.length && rawList.length > 0;
    const fCount = activeFilterCount(st);
    const pageSize = 8;
    const visibleLimit = isLanding ? Math.max(pageSize, Number(ui.mktVisibleCount) || pageSize) : list.length;
    const visibleList = isLanding ? list.slice(0, visibleLimit) : list;
    const hasMore = isLanding && visibleList.length < list.length;
    const totalCatalog = Number(TDATA.CATALOG_TOTAL) || 2480;
    const visibleSubjects = typeof TDATA.subjectsForExam === "function" ? TDATA.subjectsForExam(st.exam) : TDATA.SUBJECTS;

    const activeChips = [];
    if (st.subject !== "all") {
      const sb = TDATA.SUBJECTS.find((x) => x.id === st.subject);
      if (sb) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="subject">${esc(sb.short)} ×</button>`);
    }
    if (st.format !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="format">${esc(st.format)} ×</button>`);
    if (st.city && st.city !== "all") activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="city">${esc(st.city)} ×</button>`);
    if (Number(st.minPrice) > 0 || Number(st.maxPrice) > 0) {
      activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="price">${esc(priceFilterLabel(st))} ×</button>`);
    }
    if (st.onlyBumped) activeChips.push(`<button type="button" class="chip-btn on" data-a="mkt-reset-chip" data-k="onlyBumped">Подняты за неделю ×</button>`);

    const feedTailHTML = (list.length && isLanding && hasMore)
      ? `<div class="mkt-scroll-sentinel" id="mkt-scroll-sentinel" data-has-more="1">
          <button type="button" class="btn ghost sm" data-a="mkt-load-more">Показать ещё (${visibleList.length} из ${list.length})</button>
        </div>`
      : "";
    const cardsHTML = list.length
      ? `<div class="tutor-grid" id="mkt-tutor-grid">${visibleList.map((t) => tutorCardHTML(t)).join("")}</div>${feedTailHTML}`
      : allMatchedBooked
        ? `<div class="empty">
            <b>Всем подходящим преподавателям вы уже отправили предложение</b>
            <span>Следите за статусами откликов на «Главной» или расширьте параметры поиска.</span>
            <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
              <button type="button" class="btn sm" data-a="go" data-v="home">Открыть «Главную»</button>
              <button type="button" class="btn soft sm" data-a="mkt-reset">Сбросить фильтры</button>
            </div>
          </div>`
        : `<div class="empty">
            <b>По выбранным фильтрам пока никого нет.</b>
            <span>Попробуй расширить бюджет или сбросить фильтры.</span>
            <button type="button" class="btn soft sm" data-a="mkt-reset">Сбросить фильтры</button>
          </div>`;
    const bottomBalanceBar = (!st.bookings.length && Number(st.balance) > 0)
      ? `<div class="row between small muted mkt-foot-bal" style="padding:10px 14px;border-radius:12px;border:1px solid var(--line);background:var(--surface)">
          <span>Доступно на балансе СБП: <b class="num" style="color:var(--ink)">${Number(st.balance).toLocaleString("ru-RU")} ₽</b></span>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button type="button" class="btn soft sm" data-a="bal-open">${icon("wallet")}<span>Пополнить</span></button>
            <button type="button" class="btn ghost sm" data-a="go-student-lead">${icon("plus")}<span>Ищу преподавателя</span></button>
          </div>
        </div>`
      : "";

    return `<section class="land-sec" id="land-market" aria-label="Маркетплейс репетиторов">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Огромная база · <span class="num" data-countup="${totalCatalog}">${totalCatalog.toLocaleString("ru-RU")}</span>+ анкет</div>
          <h2 class="h2">Ищи репетиторов ниже рынка для любой задачи</h2>
        </div>
      </div>
      <div class="hh-seg" role="group" aria-label="Цель подготовки">
        ${[["all", "Все"], ["ЕГЭ", "ЕГЭ"], ["ОГЭ", "ОГЭ"]].map(([v, l]) => `<button type="button" data-a="mkt-exam" data-v="${v}" aria-pressed="${st.exam === v}">${l}</button>`).join("")}
      </div>

      <div class="hh-search-box">
        <span class="hh-search-ico">${icon("search")}</span>
        <input class="hh-search-input" id="mkt-q" type="search" autocomplete="off" spellcheck="false" value="${esc(st.q || "")}" placeholder="ЕГЭ, Python, UX/UI, вокал, дзюдо, физика или имя репетитора">
        ${st.q ? `<button type="button" class="search-clear" data-a="mkt-clear-q" aria-label="Очистить">${icon("x")}</button>` : ""}
      </div>

      <div class="chip-rail swipe" role="group" aria-label="Быстрые фильтры">
        <button type="button" class="chip-btn${fCount ? " on" : ""}" data-a="filter-open">${icon("sliders")}<span>${fCount ? fCount : "Фильтры"}</span></button>
        ${activeChips.join("")}
        ${(!st.city || st.city === "all") ? (((TDATA && TDATA.CITIES) || ["Якутск", "Москва"]).map((c) => `<button type="button" class="chip-btn" data-a="mkt-city" data-v="${esc(c)}">+ ${esc(c)}</button>`).join("")) : ""}
        ${!st.onlyBumped ? `<button type="button" class="chip-btn" data-a="mkt-bumped">+ Подняты за неделю</button>` : ""}
        ${!(Number(st.maxPrice) > 0 || Number(st.minPrice) > 0) ? `<button type="button" class="chip-btn" data-a="mkt-price" data-v="1200">+ До 1 200 ₽</button>` : ""}
        <button type="button" class="chip-btn" data-a="mkt-preset">+ Английский ЕГЭ</button>
        ${visibleSubjects.filter((sb) => sb.id !== st.subject).map((sb) => `<button type="button" class="chip-btn" data-a="mkt-subj" data-v="${sb.id}">+ ${esc(sb.short)}</button>`).join("")}
      </div>

      <div class="hh-sort-row">
        <span class="small muted">${list.length} ${plural(list.length, "репетитор", "репетитора", "репетиторов")}</span>
        <div class="hh-seg hh-sort-seg" role="group" aria-label="Сортировка анкет">
          <button type="button" data-a="mkt-sort" data-v="actual" aria-pressed="${(st.sort || "actual") === "actual"}">По соответствию</button>
          <button type="button" data-a="mkt-sort" data-v="price_asc" aria-pressed="${st.sort === "price_asc"}">Дешевле</button>
          <button type="button" data-a="mkt-sort" data-v="rating_desc" aria-pressed="${st.sort === "rating_desc"}">По рейтингу</button>
        </div>
      </div>

      ${cardsHTML}
      ${bookingsStripHTML(st)}
      ${bottomBalanceBar}
    </section>`;
  }

  function viewMarket() {
    return `<div class="head"><div class="row between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Поиск</div><h1 class="h1">Поиск репетитора</h1></div><button type="button" class="btn ghost sm" data-a="go" data-v="landing">Витрина</button></div></div>
      ${marketSectionHTML()}`;
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
          ${renderDataTable({
            id: "student-leads-table",
            cardWrap: false,
            showPresetSwitch: false,
            showSearch: false,
            showColsSwitch: false,
            eyebrow: "",
            title: "",
            filters: [],
            columns: [
              {
                key: "request",
                label: "Запрос и предметы",
                render: (item) => {
                  const subjLabels = typeof TDATA.subjectNamesForIds === "function"
                    ? TDATA.subjectNamesForIds(item.subjects)
                    : item.subjects;
                  return `<div class="stack" style="gap:4px">
                    <b>${esc(item.exam)} · ${esc(item.format)}</b>
                    <div class="row" style="gap:4px;flex-wrap:wrap">
                      ${subjLabels.map((lbl) => `<span class="chip accent">${esc(lbl)}</span>`).join("")}
                    </div>
                  </div>`;
                }
              },
              {
                key: "comment",
                label: "Комментарий",
                render: (item) => `<span class="small ink2">${esc(item.comment || "—")}</span>`
              },
              {
                key: "budget",
                label: "Бюджет",
                num: true,
                render: (item) => `<b class="num">${Number(item.targetPrice).toLocaleString("ru-RU")} ₽/ч</b>`
              },
              {
                key: "status",
                label: "Статус",
                render: (item) => `<span class="bb-tbl-st ${item.responded ? "is-confirmed" : "is-trial"}">${item.responded ? "Преподаватель откликнулся" : "Опубликовано для преподавателей"}</span>`
              },
              {
                key: "actions",
                label: "Действие",
                isActions: true,
                render: (item) => `<button type="button" class="btn ghost sm" data-a="lead-remove" data-id="${esc(item.id)}">Снять</button>`
              }
            ],
            rows: myLeads
          })}
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
            <input class="input num" id="lead-price" name="targetPrice" type="number" min="0" max="99999" step="50" value="${Number(ld.targetPrice) || 1000}">
          </div>
          ${(EGE.phoneField && typeof EGE.phoneField.phoneFieldHTML === "function")
            ? EGE.phoneField.phoneFieldHTML({ scope: "lead-wa", id: "lead-wa", name: "whatsapp", label: "Телефон (WhatsApp / MAX)", value: ld.whatsapp || "", country: ld.whatsappCountry || "RU", compact: true })
            : `<div class="field">
                <label for="lead-wa">Телефон (WhatsApp / MAX)</label>
                <input class="input num" id="lead-wa" name="whatsapp" type="text" maxlength="22" placeholder="+7 (914) 000-00-00" value="${esc(ld.whatsapp && typeof TDATA.formatPhoneMask === "function" ? TDATA.formatPhoneMask(ld.whatsapp) : (ld.whatsapp || "+7 "))}">
              </div>`}
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

  /**
   * Считает стоимость уроков выбранной недели, учёт замороженного резерва (escrow)
   * и сумму пополнения баланса, чтобы хватило на все занятия недели.
   */
  function computeStudyWeekBilling(st, weekRows, weekOffset) {
    const rows = Array.isArray(weekRows) ? weekRows : [];
    const balance = Math.max(0, Math.round(Number(st && st.balance) || 0));
    const reserveLeftByBooking = {};
    const seenBk = new Set();
    rows.forEach((row) => {
      const bk = row && row.booking;
      if (!bk || !bk.id || seenBk.has(bk.id)) return;
      seenBk.add(bk.id);
      const sp = bk.schedulePlan;
      const hasPlanDows = !!(sp && (sp.status === "confirmed" || sp.status === "sent_to_tutor") && Array.isArray(sp.dows) && sp.dows.length);
      const recursEveryWeek = hasPlanDows || bk.dow != null;
      // Резерв по заявке покрывает первый урок текущей недели (или единственную разовую дату, если она на следующей неделе).
      const reserveAppliesHere = weekOffset === 0 || !recursEveryWeek;
      reserveLeftByBooking[bk.id] = reserveAppliesHere ? Math.max(0, Math.round(Number(bk.reserved) || 0)) : 0;
    });

    let totalCost = 0;
    let coveredByReserve = 0;
    let neededFromBalance = 0;
    const items = rows.map((row) => {
      const price = Math.max(0, Math.round(Number(row.offerPrice) || 0));
      const bkId = row.booking && row.booking.id ? String(row.booking.id) : "";
      const availReserve = bkId ? (reserveLeftByBooking[bkId] || 0) : 0;
      const fromReserve = Math.min(price, availReserve);
      if (bkId) reserveLeftByBooking[bkId] = Math.max(0, availReserve - fromReserve);
      const fromBalance = Math.max(0, price - fromReserve);
      totalCost += price;
      coveredByReserve += fromReserve;
      neededFromBalance += fromBalance;
      return {
        id: row.id,
        dayShort: row.dayShort,
        hour: row.hour,
        tutorName: row.tutorName,
        subjectName: row.subjectName,
        price,
        fromReserve,
        fromBalance,
        isTrial: !!row.isTrial
      };
    });

    const deficit = Math.max(0, neededFromBalance - balance);
    return {
      lessonCount: items.length,
      totalCost,
      coveredByReserve,
      neededFromBalance,
      balance,
      deficit,
      items
    };
  }

  /** Верхний баннер уведомления о балансе на выбранную неделю во вкладке «Учёба». */
  function studyBillingNoticeHTML(b, ui, weekOffset) {
    if (!b || !b.lessonCount) return "";
    const fmt = (n) => Math.max(0, Math.round(Number(n) || 0)).toLocaleString("ru-RU");
    const weekWord = weekOffset === 0 ? "На этой неделе" : "На следующей неделе";
    const lessonsTxt = `${b.lessonCount} ${plural(b.lessonCount, "урок", "урока", "уроков")}`;
    const isDue = b.deficit > 0;
    const isOpen = !!(ui && ui.studyBillingOpen);
    const reasonTxt = `${weekWord} у вас ${lessonsTxt} на ${fmt(b.totalCost)} ₽. Не хватает ${fmt(b.deficit)} ₽.`;
    const plannedVerb = plural(b.lessonCount, "запланирован", "запланировано", "запланировано");
    const title = isDue ? `Нужно пополнить счёт на ${fmt(b.deficit)} ₽` : "Баланса хватает на все уроки";
    const sub = isDue
      ? `${weekWord} у вас ${lessonsTxt} на ${fmt(b.totalCost)} ₽${b.coveredByReserve > 0 ? ` (${fmt(b.coveredByReserve)} ₽ уже в резерве)` : ""}`
      : `${weekWord} ${plannedVerb} ${lessonsTxt} на ${fmt(b.totalCost)} ₽`;

    const noteTxt = b.coveredByReserve > 0
      ? `Почему такая сумма: за ${lessonsTxt} (${fmt(b.totalCost)} ₽) первый урок (${fmt(b.coveredByReserve)} ₽) уже заморожен в резерве при записи, а для оставшихся уроков (${fmt(b.neededFromBalance)} ₽) используются средства с баланса (${fmt(b.balance)} ₽).`
      : `Почему такая сумма: за ${lessonsTxt} нужно ${fmt(b.totalCost)} ₽, сейчас на балансе ${fmt(b.balance)} ₽.`;

    const rowsHtml = b.items.map((it) => {
      const tag = it.price === 0
        ? `<span class="study-bill-tag is-ok">Бесплатно</span>`
        : it.fromBalance === 0
          ? `<span class="study-bill-tag is-ok">В резерве</span>`
          : it.fromReserve > 0
            ? `<span class="study-bill-tag is-warn">Частично с баланса</span>`
            : `<span class="study-bill-tag is-warn">С баланса</span>`;
      const meta = [it.tutorName, it.subjectName].filter(Boolean).join(" · ");
      return `<div class="study-bill-row">
        <div class="study-bill-row-info">
          <b>${esc(it.dayShort)} · ${esc(it.hour)}</b>
          <span class="small muted">${esc(meta)}</span>
        </div>
        <div class="study-bill-row-right">
          ${tag}
          <b class="num">${it.price > 0 ? `${fmt(it.price)} ₽` : "0 ₽"}</b>
        </div>
      </div>`;
    }).join("");

    const summaryHtml = `<div class="study-bill-summary">
      <div class="study-bill-sum-line"><span>Всего за ${esc(lessonsTxt)}</span><b class="num">${fmt(b.totalCost)} ₽</b></div>
      ${b.coveredByReserve > 0 ? `<div class="study-bill-sum-line"><span>Уже в резерве по заявке</span><b class="num">−${fmt(b.coveredByReserve)} ₽</b></div>` : ""}
      <div class="study-bill-sum-line"><span>На балансе сейчас</span><b class="num">${fmt(b.balance)} ₽</b></div>
      <div class="study-bill-sum-line is-total">
        <span>${isDue ? "Нужно пополнить" : "Останется после уроков"}</span>
        <b class="num">${fmt(isDue ? b.deficit : Math.max(0, b.balance - b.neededFromBalance))} ₽</b>
      </div>
    </div>`;

    return `<section class="card study-bill-banner ${isDue ? "is-due" : "is-ok"}" id="study-billing-notice" aria-live="polite">
      <div class="study-bill-head">
        <div class="study-bill-copy">
          <div class="study-bill-title-row">
            <span class="study-bill-ico" aria-hidden="true">${icon(isDue ? "wallet" : "check")}</span>
            <b class="study-bill-title">${esc(title)}</b>
          </div>
          <span class="small ink2">${esc(sub)}</span>
        </div>
        <div class="study-bill-actions">
          ${isDue ? `<button type="button" class="btn sm" data-a="bal-open" data-amount="${b.deficit}" data-reason="${esc(reasonTxt)}">${icon("wallet")}<span>Пополнить ${fmt(b.deficit)} ₽</span></button>` : ""}
          <button type="button" class="btn ${isDue ? "ghost" : "soft"} sm" data-a="study-billing-toggle" aria-expanded="${isOpen ? "true" : "false"}">${isOpen ? "Скрыть" : "Подробнее"}</button>
        </div>
      </div>
      ${isOpen ? `<div class="study-bill-details" id="study-billing-details">
        <div class="study-bill-note small">${esc(noteTxt)}</div>
        <div class="study-bill-list">${rowsHtml}</div>
        ${summaryHtml}
      </div>` : ""}
    </section>`;
  }

  /** Вкладка «Учёба»: только записанные репетиторы, переписка WhatsApp, поиск преподавателя и план ЕГЭ. */
  function viewStudy() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const ui = getUi();
    const st = getMkt();
    const tab = ui.studyTab || "week";
    const rawWeek = Number(ui.studyWeekOffset);
    const weekOffset = Number.isFinite(rawWeek) ? Math.max(-12, Math.min(12, Math.trunc(rawWeek))) : 0;
    const isPastWeek = weekOffset < 0;
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
        <div><div class="eyebrow">Учёба</div><h1 class="h1">Мои преподаватели и расписание</h1></div>
      </div>`;

    if (tab === "tests") {
      return `${header}<div class="row" style="margin-bottom:8px"><button type="button" class="btn ghost sm" data-a="study-tab" data-tab="week">← Расписание</button></div>${typeof _ctx.viewTests === "function" ? _ctx.viewTests({ embedded: true }) : ""}`;
    }

    if (tab === "plan") {
      return `${header}<div class="row" style="margin-bottom:8px"><button type="button" class="btn ghost sm" data-a="study-tab" data-tab="week">← Расписание</button></div>${typeof _ctx.viewPlan === "function" ? _ctx.viewPlan() : ""}`;
    }

    if (tab === "stats") {
      return `${header}<div class="row" style="margin-bottom:8px"><button type="button" class="btn ghost sm" data-a="study-tab" data-tab="week">← Расписание</button></div>${typeof _ctx.viewStats === "function" ? _ctx.viewStats({ embedded: true }) : ""}`;
    }

    if (tab === "chats") {
      if (!bookedList.length) {
        return `${header}
          <div class="empty">
            <b>Пока нет преподавателей, к которым вы записаны</b>
            <span>Выберите преподавателя во вкладке «Поиск» — после записи здесь появятся прямые чаты WhatsApp, Telegram и MAX.</span>
            <button type="button" class="btn sm" data-a="go" data-v="market">Перейти в «Поиск»</button>
          </div>
          ${studentLeadCardHTML(TDATA, ui)}`;
      }
      const sorted = bookedList.slice().sort((a, b) => (b.booking.status === "accepted" ? 1 : 0) - (a.booking.status === "accepted" ? 1 : 0));
      const chatRows = sorted.map(({ tutor: t, booking: bk }) => {
        const trialDefault = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
        const isTrial = !!bk.isTrial;
        const trialRub = bk.offerPrice != null && Number.isFinite(Number(bk.offerPrice)) ? Number(bk.offerPrice) : trialDefault;
        const slot = `${bk.dayLabel}, ${bk.hour}`;
        const msgTxt = `Здравствуйте, ${t.name}! Пишу по поводу занятия ${bk.dayLabel} в ${bk.hour} (${bk.subjectName}, ${isTrial ? (trialRub === 0 ? "бесплатный пробный урок" : `пробный урок 60 мин (${trialRub} ₽)`) : "ставка " + bk.offerPrice + " ₽/ч"}).`;
        const statusTxt = bk.status === "accepted"
          ? "Подтверждён · выберите мессенджер"
          : (isTrial ? (trialRub === 0 ? "Запрос на пробный · Бесплатно" : `Запрос на пробный · ${trialRub} ₽`) : `Отклик ${bk.offerPrice} ₽/ч`);
        return {
          id: "chat-" + String(t.id || bk.id),
          tutor: t,
          booking: bk,
          isTrial,
          slot,
          msgTxt,
          statusTxt,
          tutorName: t.name,
          subjectName: bk.subjectName || t.subjectName
        };
      });
      const chatsCols = [3, 5, 7].includes(Number(ui.studyChatsCols)) ? Number(ui.studyChatsCols) : 5;
      const chatsTableHtml = renderDataTable({
        id: "study-chats-table",
        cardWrap: false,
        showPresetSwitch: false,
        eyebrow: "",
        title: "",
        cols: chatsCols,
        query: ui.studyChatsQuery || "",
        colsAction: "study-chats-cols",
        filterAction: "study-chats-filter",
        searchAction: "study-chats-q",
        searchId: "study-chats-q",
        searchPlaceholder: "Поиск: преподаватель, предмет, слот…",
        filters: [],
        columns: [
          {
            key: "tutor",
            label: "Преподаватель",
            render: (row, h) => `<div class="row" style="gap:10px;align-items:center;min-width:0">
              ${tutorAvatarHTML(row.tutor)}
              <div class="stack" style="gap:2px;min-width:0">
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <b>${esc(row.tutor.name)}</b>
                  ${row.tutor.verified ? `<span class="verified-badge">${icon("check")}</span>` : ""}
                </div>
                ${h.cols === 3 ? `<span class="small muted">${esc(row.subjectName)} · ${esc(row.slot)}</span>` : ""}
              </div>
            </div>`
          },
          {
            key: "subjectRate",
            label: "Предмет и ставка",
            minCols: 5,
            render: (row) => `<div class="stack" style="gap:2px">
              <span>${esc(row.subjectName)}</span>
              <span class="small muted num">${row.isTrial ? ((row.booking && row.booking.offerPrice != null && Number(row.booking.offerPrice) === 0) ? "пробный · Бесплатно" : `пробный · ${(row.booking && row.booking.offerPrice != null ? Number(row.booking.offerPrice) : 490).toLocaleString("ru-RU")} ₽`) : `от ${row.tutor.price} ₽/ч`}</span>
            </div>`
          },
          {
            key: "status",
            label: "Статус",
            minCols: 5,
            render: (row) => `<span class="bb-tbl-st ${row.booking.status === "accepted" ? "is-confirmed" : "is-info"}">${esc(row.statusTxt)}</span>`
          },
          {
            key: "slot",
            label: "Ближайший слот",
            num: true,
            render: (row) => `<span class="small num">${esc(row.slot)}</span>`
          },
          {
            key: "format",
            label: "Формат",
            minCols: 7,
            render: (row) => `<span class="small">${esc(row.booking.format || "Онлайн")}</span>`
          },
          {
            key: "messengers",
            label: "Мессенджеры",
            isActions: true,
            render: (row) => {
              const tm = String((row.booking && row.booking.telemostUrl) || ensureUnifiedTelemostUrl(st) || "");
              const resolvedTutor = resolveTutorWithContacts(row.tutor);
              const waHref = TDATA.whatsappUrl(resolvedTutor, row.msgTxt);
              const linksHtml = (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
                ? EGE.kit.messengerLinksHTML({ entity: resolvedTutor, available: tutorChannels(resolvedTutor), allowHoldAdd: true, message: row.msgTxt, primaryLabel: "WhatsApp", compact: true })
                : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`;
              return tm
                ? `<div class="row" style="gap:6px;flex-wrap:wrap"><a class="btn soft sm" href="${esc(tm)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>Телемост</span></a>${linksHtml}</div>`
                : linksHtml;
            }
          }
        ],
        rows: chatRows,
        searchFields: (row) => [row.tutorName, row.subjectName, row.slot, row.statusTxt, row.booking.format].join(" "),
        emptyText: "По поисковому запросу чатов не найдено."
      });
      return `${header}
        <div class="hh-notice-card">
          <b>Чаты только с вашими преподавателями</b>
          <span class="small ink2">Здесь собраны преподаватели, к которым вы записались. Нажмите на активный канал или удерживайте серый Telegram / MAX, чтобы указать контакт.</span>
        </div>
        <div class="hh-chat-list" style="padding:14px">${chatsTableHtml}</div>`;
    }

    const weekRange = `${weekDays[0].num} ${weekDays[0].month} — ${weekDays[6].num} ${weekDays[6].month}`;
    const todayIso = (() => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    })();

    const activeStudyBookings = (st.bookings || []).filter((bk) => {
      if (!bk) return false;
      const stLower = String(bk.status || "").toLowerCase();
      return stLower !== "cancelled" && stLower !== "declined" && stLower !== "refunded";
    });
    const enrolledSection = !activeStudyBookings.length
      ? `<div class="empty">
          <b>Вы пока не записаны ни к одному преподавателю</b>
          <span>Откройте «Поиск», выберите пробный (490 ₽ или бесплатно) либо предложите свою ставку за урок.</span>
          <button type="button" class="btn sm" data-a="go" data-v="market">Выбрать преподавателя</button>
        </div>`
      : (() => {
          const allBookings = activeStudyBookings;
          const weekTitle = weekOffset === 0
            ? "Эта неделя"
            : (weekOffset === 1
              ? "Следующая неделя"
              : (weekOffset === -1
                ? "Прошлая неделя"
                : (weekOffset < -1 ? `${Math.abs(weekOffset)} нед. назад` : `Через ${weekOffset} нед.`)));
          const weekPicker = `<div class="tc-week-nav${isPastWeek ? " is-past-week" : ""}" role="group" aria-label="Выбор недели">
            <button type="button" class="tc-week-arrow" data-a="study-week-step" data-delta="-1" aria-label="Предыдущая неделя" title="Прошлая неделя">‹</button>
            <button type="button" class="tc-week-title-btn" data-a="study-week" data-w="0" title="Вернуться на эту неделю"><b>${esc(weekTitle)}</b><span class="small muted">${esc(weekRange)}</span></button>
            <button type="button" class="tc-week-arrow" data-a="study-week-step" data-delta="1" aria-label="Следующая неделя" title="Следующая неделя">›</button>
          </div>`;
          const dayGroups = [];
          const weekRows = [];
          weekDays.forEach((d) => {
            const dayBookings = allBookings.filter((bk) => {
              const sp = bk.schedulePlan;
              if (sp && (sp.status === "confirmed" || sp.status === "sent_to_tutor") && Array.isArray(sp.dows) && sp.dows.length) {
                return sp.dows.map(Number).includes(Number(d.dow));
              }
              return bk.dayIso === d.iso || (bk.dow != null && Number(bk.dow) === d.dow);
            });
            const dayLessons = dayBookings.map((bk) => {
              const rawTutor = TDATA.LIST.find((x) => x.id === bk.tutorId) || { id: bk.tutorId, name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101", verified: true };
              const tutor = resolveTutorWithContacts(rawTutor);
              const isTrial = !!bk.isTrial;
              const sp = bk.schedulePlan;
              const usePlanHour = sp && (sp.status === "confirmed" || sp.status === "sent_to_tutor") && sp.hour;
              const lessonHour = usePlanHour ? sp.hour : (bk.hour || "14:00");
              return {
                id: `${bk.id}-${d.iso}`,
                dayLabel: d.fullLabel,
                dayShort: d.shortLabel,
                hour: lessonHour,
                format: bk.format || "Онлайн",
                tutorName: bk.tutorName,
                subjectName: bk.subjectName,
                offerPrice: bk.offerPrice != null && Number.isFinite(Number(bk.offerPrice)) ? Number(bk.offerPrice) : (isTrial ? 490 : 0),
                isTrial,
                status: bk.status || "pending",
                tutor,
                booking: bk
              };
            }).sort((a, b) => String(a.hour || "").localeCompare(String(b.hour || "")));
            weekRows.push(...dayLessons);
            dayGroups.push({ day: d, lessons: dayLessons });
          });

          const selectedGroup =
            (ui.studySelectedIso && dayGroups.find((g) => g.day.iso === ui.studySelectedIso)) ||
            dayGroups.find((g) => g.day.iso === todayIso && g.lessons.length > 0) ||
            dayGroups.find((g) => g.lessons.length > 0) ||
            dayGroups.find((g) => g.day.iso === todayIso) ||
            dayGroups[0];
          const selectedIso = selectedGroup ? selectedGroup.day.iso : (weekDays[0] && weekDays[0].iso) || "";
          const activeLessons = selectedGroup ? selectedGroup.lessons : [];

          const daysStripHTML = `<div class="study-week-days${isPastWeek ? " is-past-week" : ""}" data-week-swipe="study" role="group" aria-label="Дни недели и количество уроков">
            ${dayGroups.map((g) => {
              const cnt = g.lessons.length;
              const isOn = g.day.iso === selectedIso;
              return `<button type="button" class="study-week-day-btn${isOn ? " on" : ""}${cnt > 0 ? " has-lessons" : ""}${isPastWeek ? " is-past" : ""}" data-a="study-day-pick" data-iso="${esc(g.day.iso)}" aria-pressed="${isOn}">
                <span class="swd-wd">${esc(g.day.wd)}</span>
                <span class="swd-num num">${g.day.num}</span>
                ${cnt > 0 ? `<span class="swd-cnt num">${cnt}</span>` : `<span class="swd-dot" aria-hidden="true"></span>`}
              </button>`;
            }).join("")}
          </div>`;

          const dayLessonsHTML = isPastWeek
            ? (activeLessons.length
              ? `<div class="study-day-cards">${activeLessons.map((row) => {
                  const bk = row.booking;
                  const isWeekly = bk.schedulePlan && bk.schedulePlan.weekly !== false;
                  return `<article class="study-lesson-card is-past" data-booking-id="${esc(bk.id)}">
                    <div class="study-lesson-time-row">
                      <b class="num" style="font-size:15px">Урок в ${esc(row.hour)}</b>
                      <span class="small muted">${esc(row.dayShort)} · ${esc(row.format)}</span>
                    </div>
                    <div class="study-lesson-pills">
                      <span class="chip tc-past-chip">✓ Проведён</span>
                      ${isWeekly ? `<span class="chip tc-past-chip">Каждую неделю</span>` : ""}
                    </div>
                    <div class="tutor-name-line">
                      ${tutorAvatarHTML(row.tutor)}
                      <div class="tutor-person-meta">
                        <div class="tutor-title-inline">
                          <b class="tutor-person-name">${esc(row.tutorName)}</b>
                        </div>
                        <span class="small muted">${esc(bk.exam || "ЕГЭ")} · ${esc(row.subjectName)} · ${row.isTrial ? `Пробный ${row.offerPrice.toLocaleString("ru-RU")} ₽` : `${row.offerPrice.toLocaleString("ru-RU")} ₽/ч`}</span>
                      </div>
                    </div>
                  </article>`;
                }).join("")}</div>`
              : `<div class="empty is-past"><b>На ${esc(selectedGroup ? selectedGroup.day.fullLabel : "этот день")} прошедших занятий нет</b><span>Листайте дни или недели влево и вправо, чтобы посмотреть историю.</span></div>`)
            : (activeLessons.length
            ? `<div class="study-day-cards">${activeLessons.map((row) => {
                const bk = row.booking;
                const accepted = bk.status === "accepted";
                const ch = tutorChannels(row.tutor);
                const telemostUrl = String(bk.telemostUrl || ensureUnifiedTelemostUrl(st) || "").trim();
                const isEditingTm = ui.telemostEditId === bk.id;
                const tmBlock = telemostBlockHTML(bk, telemostUrl, isEditingTm, ui, "Зайти в Яндекс Телемост");
                const msgTxt = `Здравствуйте, ${row.tutorName}! Пишу по уроку ${row.dayShort} в ${row.hour} (${row.subjectName}).${telemostUrl ? " Ссылка на Яндекс Телемост: " + telemostUrl : ""}`;
                const waHref = TDATA.whatsappUrl(row.tutor, msgTxt);
                const msgBar = (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
                  ? EGE.kit.messengerLinksHTML({ entity: row.tutor, available: ch, allowHoldAdd: true, message: msgTxt, primaryLabel: "WhatsApp", compact: true })
                  : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`;
                const isWeekly = bk.schedulePlan && bk.schedulePlan.weekly !== false;
                return `<article class="study-lesson-card" data-booking-id="${esc(bk.id)}">
                  <div class="study-lesson-time-row">
                    <b class="num" style="font-size:15px">Урок в ${esc(row.hour)}</b>
                    <span class="small muted">${esc(row.dayShort)} · ${esc(row.format)}</span>
                  </div>
                  <div class="study-lesson-pills">
                    ${isWeekly ? `<span class="chip accent">Каждую неделю</span>` : ""}
                    <span class="bb-tbl-st ${accepted ? "is-confirmed" : "is-pending"}">${accepted ? "Подтверждён" : "На рассмотрении"}</span>
                  </div>
                  <div class="tutor-name-line">
                    ${tutorAvatarHTML(row.tutor)}
                    <div class="tutor-person-meta">
                      <div class="tutor-title-inline">
                        <b class="tutor-person-name">${esc(row.tutorName)}</b>
                        ${row.tutor.verified !== false ? `<span class="verified-badge">${icon("check")}</span>` : ""}
                      </div>
                      <span class="small muted">${esc(bk.exam || "ЕГЭ")} · ${esc(row.subjectName)} · ${row.isTrial ? `Пробный ${row.offerPrice.toLocaleString("ru-RU")} ₽` : `${row.offerPrice.toLocaleString("ru-RU")} ₽/ч`}</span>
                    </div>
                  </div>
                  <div class="bid-telemost-box">${tmBlock}</div>
                  ${msgBar}
                  <span class="study-hold-hint">Удерживайте WhatsApp, Telegram или MAX, чтобы указать или изменить контакт</span>
                  <button type="button" class="btn ghost sm study-cancel-btn" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">Отменить занятие</button>
                </article>`;
              }).join("")}</div>`
            : `<div class="empty"><b>На ${esc(selectedGroup ? selectedGroup.day.fullLabel : "этот день")} занятий нет</b><span>Выберите другой день с цифрой выше или подберите преподавателя в «Поиске».</span></div>`);

          const billing = computeStudyWeekBilling(st, weekRows, weekOffset);
          const billingBannerHTML = isPastWeek ? "" : studyBillingNoticeHTML(billing, ui, weekOffset);

          return `${billingBannerHTML}
          <section class="card pad stack study-cal-card" id="study-week-strip">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <h2 class="h2">Календарь ваших уроков: ${esc(weekRange)}</h2>
            </div>
            ${weekPicker}
            ${daysStripHTML}
            <div class="study-day-panel${isPastWeek ? " is-past-week" : ""}">
              <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
                <b>${esc(selectedGroup ? selectedGroup.day.fullLabel : "")}</b>
                <div class="row" style="gap:6px;align-items:center">
                  ${isPastWeek ? `<span class="chip tc-past-chip">Прошедшая неделя</span>` : ""}
                  <span class="chip num">${activeLessons.length} ${plural(activeLessons.length, "урок", "урока", "уроков")}</span>
                </div>
              </div>
              ${dayLessonsHTML}
            </div>
          </section>`;
        })();

    return `${header}
      ${enrolledSection}
      ${bookingsStripHTML(st)}
      ${studentLeadCardHTML(TDATA, ui)}
      ${EGE.views && EGE.views.trainer && typeof EGE.views.trainer.studyOverviewCardsHTML === "function" ? EGE.views.trainer.studyOverviewCardsHTML() : ""}`;
  }

  function publishStudentBid(booking, tutor) {
    if (!booking || !EGE.realtime || typeof EGE.realtime.publish !== "function") return null;
    const isTrial = !!booking.isTrial || Number(booking.offerPrice) === 0;
    const rate = Number(booking.offerPrice || 0);
    const tName = (tutor && tutor.name) || booking.tutorName || "Репетитор";
    const tSlug = String((tutor && (tutor.slug || tutor.id)) || booking.tutorId || "tutor");
    return EGE.realtime.publish({
      channel: "tutor",
      eventType: "market.bid.created",
      title: isTrial ? "Новая заявка на пробный урок (0 ₽)" : "Новая ставка от ученика",
      message: `${tName} · ${booking.dayLabel || "Слот"}, ${booking.hour || "14:00"} · ${isTrial ? "Пробный 0 ₽" : (rate.toLocaleString("ru-RU") + " ₽/ч")}`,
      tutorSlug: tSlug,
      payload: Object.assign({
        bookingId: booking.id,
        tutorId: booking.tutorId || tSlug,
        tutorName: tName,
        studentName: booking.studentName || "Заявка ученика (из /market)"
      }, booking)
    });
  }

  function handleAction(act, el) {
    const ui = getUi();
    const d = (el && el.dataset) || {};
    const TDATA = getTDATA();
    if (act === "home-bid-filter") {
      ui.homeBidFilter = ["all", "pending", "accepted"].includes(d.v) ? d.v : "all";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-telemost-edit") {
      ui.telemostEditId = d.id || "";
      ui.telemostError = "";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-telemost-cancel") {
      ui.telemostEditId = "";
      ui.telemostError = "";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-telemost-gen") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const nextUrl = generateTelemostUrl();
      st.telemostUrl = nextUrl;
      (st.bookings || []).forEach((b) => { if (b) b.telemostUrl = nextUrl; });
      ui.telemostEditId = "";
      ui.telemostError = "";
      if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
      if (_ctx.store && _ctx.store.backend && _ctx.store.user && EGE.api && EGE.api.bookings && bk.serverSynced) {
        EGE.api.bookings.updateTelemost(bk.id, nextUrl).catch(() => {});
      }
      if (typeof _ctx.notifySide === "function") _ctx.notifySide("Яндекс Телемост", "Создана новая единая ссылка — будет передана преподавателю сама (WhatsApp или Telegram-бот)");
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-day") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
      const draft = getSchedDraft(bk, tutor);
      const dow = Number(d.dow);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) return false;
      const cur = Array.isArray(draft.dows) ? draft.dows.slice() : [];
      const idx = cur.indexOf(dow);
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(dow);
      draft.dows = sortDows(cur);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-hour") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
      const draft = getSchedDraft(bk, tutor);
      if (d.hour) draft.hour = String(d.hour);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-weekly") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
      const draft = getSchedDraft(bk, tutor);
      draft.weekly = draft.weekly === false;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-edit") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
      const sp = bk.schedulePlan || {};
      const map = ui.schedDrafts || (ui.schedDrafts = {});
      map[bk.id] = {
        dows: Array.isArray(sp.dows) && sp.dows.length ? sortDows(sp.dows) : suggestTwoDows(bk, tutor),
        hour: String(sp.hour || bk.hour || "16:00"),
        weekly: sp.weekly !== false
      };
      ui.schedEditId = bk.id;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-send") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
      const draft = getSchedDraft(bk, tutor);
      const dows = sortDows(draft.dows);
      if (dows.length < 1) {
        if (typeof _ctx.toast === "function") _ctx.toast("Выберите хотя бы 1 день недели");
        return true;
      }
      const hour = String(draft.hour || bk.hour || "16:00");
      const weekly = draft.weekly !== false;
      const botText = formatWeeklyBotPhrase(dows, hour, weekly);
      bk.schedulePlan = {
        status: "confirmed",
        autoConfirmed: true,
        dows,
        hour,
        weekly,
        botText,
        updatedAt: Date.now()
      };
      bk.dows = dows.slice();
      bk.hour = hour;
      bk.dayLabel = formatDaysShort(dows);
      if (ui.schedEditId === bk.id) ui.schedEditId = "";
      if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
      if (_ctx.store && _ctx.store.backend && _ctx.store.user && EGE.api && EGE.api.bookings && bk.serverSynced) {
        EGE.api.bookings.updateSchedule(bk.id, bk.schedulePlan).catch(() => {});
      }
      if (EGE.realtime && typeof EGE.realtime.publish === "function") {
        EGE.realtime.publish({
          channel: "tutor",
          eventType: "market.schedule.proposed",
          title: "Бот: график занятий закреплён",
          message: `Ученик занимается ${botText} (${bk.subjectName})`,
          tutorSlug: String((tutor && (tutor.slug || tutor.id)) || bk.tutorId || "tutor"),
          payload: { bookingId: bk.id, schedulePlan: bk.schedulePlan }
        });
      }
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide("График закреплён в «Учёбе»", `${bk.dayLabel} · ${hour} · бот уведомил преподавателя`);
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-confirm") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk || !bk.schedulePlan) return false;
      bk.schedulePlan.status = "confirmed";
      bk.schedulePlan.updatedAt = Date.now();
      bk.dows = sortDows(bk.schedulePlan.dows);
      bk.hour = String(bk.schedulePlan.hour || bk.hour || "16:00");
      bk.dayLabel = formatDaysShort(bk.dows);
      if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
      if (_ctx.store && _ctx.store.backend && _ctx.store.user && EGE.api && EGE.api.bookings && bk.serverSynced) {
        EGE.api.bookings.updateSchedule(bk.id, bk.schedulePlan).catch(() => {});
      }
      if (typeof _ctx.notifySide === "function") _ctx.notifySide("График закреплён в «Учёбе»", `${bk.dayLabel} · ${bk.hour}`);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-alt-sim") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk) return false;
      const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
      const plan = bk.schedulePlan || { dows: suggestTwoDows(bk, tutor), hour: bk.hour || "16:00", weekly: true };
      const alt = suggestAltSchedule(plan.dows, plan.hour, tutor);
      plan.status = "tutor_proposed";
      plan.altDows = alt.dows;
      plan.altHour = alt.hour;
      plan.altBotText = formatWeeklyBotPhrase(alt.dows, alt.hour, plan.weekly !== false);
      plan.updatedAt = Date.now();
      bk.schedulePlan = plan;
      if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide("Преподаватель предложил другие даты", `${formatDaysShort(alt.dows)} · ${alt.hour}`);
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "bid-sched-accept-alt") {
      const st = getMkt();
      const bk = (st.bookings || []).find((x) => x.id === d.id);
      if (!bk || !bk.schedulePlan || !Array.isArray(bk.schedulePlan.altDows)) return false;
      const sp = bk.schedulePlan;
      sp.dows = sortDows(sp.altDows);
      sp.hour = String(sp.altHour || sp.hour || "17:00");
      sp.botText = formatWeeklyBotPhrase(sp.dows, sp.hour, sp.weekly !== false);
      sp.status = "confirmed";
      sp.updatedAt = Date.now();
      bk.dows = sp.dows.slice();
      bk.hour = sp.hour;
      bk.dayLabel = formatDaysShort(sp.dows);
      if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
      if (_ctx.store && _ctx.store.backend && _ctx.store.user && EGE.api && EGE.api.bookings && bk.serverSynced) {
        EGE.api.bookings.updateSchedule(bk.id, bk.schedulePlan).catch(() => {});
      }
      if (typeof _ctx.notifySide === "function") _ctx.notifySide("Новые даты закреплены в «Учёбе»", `${bk.dayLabel} · ${bk.hour}`);
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "mkt-bk-filter") {
      if (d.clearQ === "1") ui.mktBkQuery = "";
      ui.mktBkFilter = ["pending", "accepted"].includes(d.v) ? d.v : "all";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "mkt-bk-cols") {
      const c = Number(d.cols);
      ui.mktBkCols = [3, 5, 7].includes(c) ? c : 5;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "study-billing-toggle") {
      ui.studyBillingOpen = !ui.studyBillingOpen;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "study-chats-cols") {
      const c = Number(d.cols);
      ui.studyChatsCols = [3, 5, 7].includes(c) ? c : 5;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "study-chats-filter") {
      if (d.clearQ === "1") ui.studyChatsQuery = "";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "study-day-pick") {
      ui.studySelectedIso = String(d.iso || "");
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    return false;
  }

  function handleInput(el) {
    if (!el || !el.dataset) return false;
    const ui = getUi();
    const act = el.dataset.a || el.id || "";
    if (act === "mkt-bk-q") {
      ui.mktBkQuery = String(el.value || "");
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "study-chats-q") {
      ui.studyChatsQuery = String(el.value || "");
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    return false;
  }

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("click", (e) => {
      const target = e && e.target;
      const el = target && typeof target.closest === "function" ? target.closest("[data-a]") : null;
      if (!el || el.disabled) return;
      const act = (el.dataset && el.dataset.a) || "";
      if (act === "home-bid-filter" || act === "study-day-pick" || act === "mkt-bk-filter" || act === "mkt-bk-cols" || act === "study-chats-cols" || act === "study-chats-filter") {
        if (handleAction(act, el) && typeof e.preventDefault === "function") e.preventDefault();
      }
    });
    document.addEventListener("input", (e) => {
      const el = e && e.target;
      const d = el && el.dataset;
      const act = (d && d.a) || (el && el.id) || "";
      if (act === "mkt-bk-q" || act === "study-chats-q") {
        handleInput(el);
      }
    });
  }

  EGE.views = EGE.views || {};
  EGE.views.marketplace = {
    configure,
    hasMinBalance,
    resolveTutorGuarantee,
    resolveTutorTrial,
    plainBidLabel,
    priceFilterLabel,
    resolveTutorWithContacts,
    tutorChannels,
    tutorChannelNote,
    suggestTwoDows,
    formatWeeklyBotPhrase,
    cardDiffTagsHTML,
    bookingModalHTML,
    activeFilterCount,
    filterAvailableTutors,
    filterModalHTML,
    plansSectionHTML,
    tutorCardHTML,
    bookingsStripHTML,
    studentHomeBidsHTML,
    computeStudyWeekBilling,
    studyBillingNoticeHTML,
    generateTelemostUrl,
    ensureUnifiedTelemostUrl,
    saveTelemostForBooking,
    marketSectionHTML,
    viewMarket,
    viewStudy,
    updateBookingModalLive,
    publishStudentBid,
    handleAction,
    handleInput
  };
})();
