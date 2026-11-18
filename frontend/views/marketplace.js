/* Маркетплейс репетиторов: каталог, фильтры (вкл. Якутск/Москва), минимальная подписка от 5к, модалка записи и вкладка «Учёба». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural, initials } = EGE.utils;
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
            <div class="hh-diff-strip" style="margin-top:6px" data-card-diff="${esc(t.id)}">
              ${cardDiffTagsHTML(t, cardPrice)}
            </div>
          </div>
          <button type="button" class="fav-btn" data-a="mkt-fav" data-id="${esc(t.id)}" aria-pressed="${isFav}" aria-label="В избранное">${icon(isFav ? "heartFill" : "heart")}</button>
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
        <button type="button" class="btn sakha-pattern tutor-bid-btn${alreadyBooked ? " is-confirmed" : ""}" data-a="book-open" data-id="${esc(t.id)}" data-offer="${cardPrice}">${sakhaBidInnerHTML(alreadyBooked, cardPrice)}</button>
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
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <b>${esc(bk.tutorName)}</b>
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
          return isTrial
            ? `<b class="num">${trialRub === 0 ? "Пробный · Бесплатно" : `Пробный ${trialRub.toLocaleString("ru-RU")} ₽`}</b>`
            : `<div class="stack" style="gap:2px"><b class="num">${Number(bk.offerPrice).toLocaleString("ru-RU")} ₽/ч</b><span class="small muted num">вместо ${Number(bk.tutorPrice).toLocaleString("ru-RU")} ₽</span></div>`;
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
          return `<div class="stack" style="gap:6px">
            ${h.cols === 3 ? `<span class="bb-tbl-st ${accepted ? "is-confirmed" : "is-pending"}">${accepted ? "Преподаватель подтвердил" : "На рассмотрении · уведомим"}</span>` : ""}
            <div class="row" style="gap:6px;flex-wrap:wrap">
              ${accepted ? (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                ? EGE.kit.messengerLinksHTML({
                    entity: tutor || { id: bk.tutorId, name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101" },
                    message: msgTxt,
                    primaryLabel: "Написать · WA",
                    compact: true
                  })
                : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать</span></a>`) : ""}
              ${!accepted ? `<button type="button" class="btn soft sm" data-a="mkt-sim-accept" data-id="${esc(bk.id)}">Тест: подтвердить</button>` : ""}
              <button type="button" class="btn ${accepted ? "ghost" : "danger bb-btn-adaptive"} sm" data-a="mkt-cancel-book" data-id="${esc(bk.id)}">${accepted ? "Сменить репетитора" : "Отменить"}</button>
            </div>
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
        { id: "pending", label: `На рассмотрении (${pendingCnt})`, match: (r) => r.status !== "accepted" },
        { id: "accepted", label: `Подтверждены (${acceptedCnt})`, match: (r) => r.status === "accepted" }
      ],
      columns: bkColumns,
      rows: st.bookings,
      searchFields: (bk) => [bk.tutorName, bk.exam, bk.subjectName, bk.dayLabel, bk.hour, bk.format, bk.note, String(bk.offerPrice || "")].join(" "),
      emptyText: "По выбранному фильтру откликов нет."
    });

    return `<section class="card pad-lg stack reqs-strip" style="gap:10px" aria-label="Мои заявки">${tableHtml}</section>`;
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
    const gInfo = resolveTutorGuarantee(tutor);
    const offerPrice = Math.max(0, Math.min(99999, b.offerPrice != null ? Math.round(Number(b.offerPrice)) : (Number(tutor.price) || 1200)));
    const sig = TDATA.offerSignal(tutor.price, offerPrice);

    return `<div class="modal-back" role="dialog" aria-modal="true" aria-labelledby="book-modal-title">
      <div class="modal-card">
        <div class="modal-head">
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
          <button type="button" class="icon-btn sm" data-a="book-close" aria-label="Закрыть">${icon("x")}</button>
        </div>

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
              <input class="input bid-input num" id="bid-price" type="number" min="0" max="99999" step="50" inputmode="numeric" value="${offerPrice}">
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

        <div class="row between" style="flex-wrap:wrap;gap:8px;align-items:center">
          <div class="row" style="flex-wrap:wrap;gap:8px">
            <button type="button" class="btn sakha-pattern" id="bid-submit-btn" data-a="book-submit">${sakhaBidInnerHTML(false, offerPrice, { attr: 'data-bid-lbl="1"' })}</button>
            <button type="button" class="btn ghost" data-a="book-close">Отмена</button>
          </div>
          <button type="button" class="link-btn small muted" data-a="go-fees">Защита оплаты СБП →</button>
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
      if (subLbl) subLbl.textContent = bidBtnLabelHTML(false, offerPrice);
      else subBtn.innerHTML = sakhaBidInnerHTML(false, offerPrice, { attr: 'data-bid-lbl="1"' });
    }
    const sigEl = document.getElementById("bid-signal");
    if (sigEl) {
      const sig = TDATA.offerSignal(tutor.price, offerPrice);
      sigEl.innerHTML = `<span class="chip ${sig.tone}">${esc(sig.label)}</span>`;
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

  function marketSectionHTML(opts) {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const isLanding = !!(opts && opts.landing);
    const ui = getUi();
    const st = getMkt();
    const days = TDATA.buildCalendarDays(7);
    const list = TDATA.filterTutors(st, days);
    const fCount = activeFilterCount(st);
    const pageSize = 8;
    const visibleLimit = isLanding ? Math.max(pageSize, Number(ui.mktVisibleCount) || pageSize) : list.length;
    const visibleList = isLanding ? list.slice(0, visibleLimit) : list;
    const hasMore = isLanding && visibleList.length < list.length;
    const totalCatalog = Number(TDATA.CATALOG_TOTAL) || 2480;

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
    const feedTailHTML = (list.length && isLanding)
      ? (hasMore
          ? `<div class="mkt-scroll-sentinel" id="mkt-scroll-sentinel" data-has-more="1">
              <button type="button" class="btn ghost sm" data-a="mkt-load-more">Показать ещё (${visibleList.length} из ${list.length})</button>
            </div>`
          : `<div class="mkt-feed-end" id="mkt-feed-end">Конец списка</div>`)
      : "";
    const cardsHTML = list.length
      ? `<div class="tutor-grid" id="mkt-tutor-grid">${visibleList.map((t) => tutorCardHTML(t)).join("")}</div>${feedTailHTML}`
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
        <button type="button" class="chip-btn" data-a="mkt-preset">+ Английский ЕГЭ</button>
        ${TDATA.SUBJECTS.filter((sb) => sb.id !== st.subject).map((sb) => `<button type="button" class="chip-btn" data-a="mkt-subj" data-v="${sb.id}">+ ${esc(sb.short)}</button>`).join("")}
      </div>

      <div class="hh-sort-row">
        <span class="small muted">${list.length} ${plural(list.length, "репетитор", "репетитора", "репетиторов")}</span>
        <button type="button" class="hh-sort-btn" data-a="mkt-sort-cycle">${esc(sortLabels[st.sort] || "По соответствию")} ${icon("sort")}</button>
      </div>

      ${cardsHTML}
      ${bookingsStripHTML(st)}
      ${bottomBalanceBar}
    </section>`;
  }

  function viewMarket() {
    return `<div class="head"><div class="row between" style="flex-wrap:wrap;gap:10px"><div><div class="eyebrow">Маркетплейс</div><h1 class="h1">Подбор репетитора</h1></div><button type="button" class="btn ghost sm" data-a="go" data-v="landing">Витрина</button></div></div>
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
              const waHref = TDATA.whatsappUrl(row.tutor, row.msgTxt);
              return (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
                ? EGE.kit.messengerLinksHTML({ entity: row.tutor, message: row.msgTxt, primaryLabel: "WhatsApp", compact: true })
                : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`;
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
          <span class="small ink2">Здесь собраны преподаватели, к которым вы записались. Нажмите для перехода в WhatsApp, Telegram или MAX с готовым текстом.</span>
        </div>
        <div class="hh-chat-list" style="padding:14px">${chatsTableHtml}</div>`;
    }

    const weekRange = `${weekDays[0].num} ${weekDays[0].month} — ${weekDays[6].num} ${weekDays[6].month}`;
    const noticeCard = `<div class="hh-notice-card">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <b>${st.bookings.length ? `Ваших записей к преподавателям: ${st.bookings.length}` : "В разделе «Учёба» только ваши преподаватели"}</b>
        <span class="chip accent num">Баланс: ${st.balance.toLocaleString("ru-RU")} ₽</span>
      </div>
      <span class="small ink2">${st.bookings.length ? "Здесь показаны только преподаватели, к которым у вас есть заявка или подтверждённый урок." : "После записи в «Репетиторах» здесь появятся ваше расписание, статус подтверждения и прямые контакты WhatsApp, Telegram и MAX."}</span>
      <div class="row" style="gap:8px;flex-wrap:wrap">
        <button type="button" class="btn sm" data-a="go" data-v="market">Подобрать репетитора</button>
        ${!hasMinBalance(st) ? `<button type="button" class="btn soft sm" data-a="bal-open">${icon("wallet")}<span>Пополнить по СБП от 490 ₽</span></button>` : ""}
      </div>
    </div>`;

    const enrolledSection = !st.bookings.length
      ? `<div class="empty">
          <b>Вы пока не записаны ни к одному преподавателю</b>
          <span>Откройте «Репетиторы», выберите пробный (490 ₽ или бесплатно) либо предложите свою ставку за урок.</span>
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
          const weekRows = [];
          weekDays.forEach((d) => {
            const dayBookings = filteredBookings.filter((bk) => bk.dayIso === d.iso || (bk.dow != null && Number(bk.dow) === d.dow));
            dayBookings.forEach((bk) => {
              const tutor = TDATA.LIST.find((x) => x.id === bk.tutorId) || { id: bk.tutorId, name: bk.tutorName, subjectName: bk.subjectName, whatsapp: "79142100101", verified: true };
              const isTrial = !!bk.isTrial;
              weekRows.push({
                id: `${bk.id}-${d.iso}`,
                dayLabel: d.fullLabel,
                hour: bk.hour,
                format: bk.format || "Онлайн",
                tutorName: bk.tutorName,
                subjectName: bk.subjectName,
                offerPrice: bk.offerPrice != null && Number.isFinite(Number(bk.offerPrice)) ? Number(bk.offerPrice) : (isTrial ? 490 : 0),
                isTrial,
                status: bk.status || "pending",
                tutor,
                booking: bk
              });
            });
          });
          const schedCols = [3, 5, 7].includes(Number(ui.studySchedCols)) ? Number(ui.studySchedCols) : 5;
          const scheduleTableHtml = weekRows.length
            ? `<div class="card pad-lg stack" style="gap:10px">${renderDataTable({
                id: "study-schedule-table",
                cardWrap: false,
                showPresetSwitch: false,
                eyebrow: "Недельный график",
                title: "Запланированные уроки",
                cols: schedCols,
                query: ui.studySchedQuery || "",
                colsAction: "study-sched-cols",
                filterAction: "study-sched-filter",
                searchAction: "study-sched-q",
                searchId: "study-sched-q",
                searchPlaceholder: "Поиск: преподаватель, предмет, день…",
                filters: [],
                columns: [
                  {
                    key: "day",
                    label: "День и час",
                    render: (row) => `<div class="stack" style="gap:2px">
                      <b>${esc(row.dayLabel)}</b>
                      <span class="small muted num">${esc(row.hour)} · ${esc(row.format)}</span>
                    </div>`
                  },
                  {
                    key: "tutor",
                    label: "Преподаватель и предмет",
                    render: (row, h) => `<div class="stack" style="gap:3px">
                      <div class="row" style="gap:6px;flex-wrap:wrap">
                        <b>${esc(row.tutorName)}</b>
                        ${row.tutor.verified !== false ? `<span class="verified-badge">${icon("check")}</span>` : ""}
                        ${h.cols < 7 ? `<span class="chip">${esc(row.subjectName)}</span>` : ""}
                      </div>
                    </div>`
                  },
                  {
                    key: "price",
                    label: "Ставка",
                    minCols: 5,
                    num: true,
                    render: (row) => `<b class="num">${row.isTrial ? `Пробный ${row.offerPrice.toLocaleString("ru-RU")} ₽` : `${row.offerPrice.toLocaleString("ru-RU")} ₽/ч`}</b>`
                  },
                  {
                    key: "status",
                    label: "Статус",
                    minCols: 5,
                    render: (row) => `<span class="bb-tbl-st ${row.status === "accepted" ? "is-confirmed" : "is-pending"}">${row.status === "accepted" ? "Подтверждён" : "На рассмотрении"}</span>`
                  },
                  {
                    key: "subject",
                    label: "Предмет",
                    minCols: 7,
                    render: (row) => `<span class="chip">${esc(row.subjectName)}</span>`
                  },
                  {
                    key: "format",
                    label: "Формат",
                    minCols: 7,
                    render: (row) => `<span class="small">${esc(row.format)}</span>`
                  },
                  {
                    key: "contact",
                    label: "Связь",
                    isActions: true,
                    render: (row) => {
                      const msgTxt = `Здравствуйте, ${row.tutorName}! Пишу по уроку на ${row.dayLabel} (${row.hour}), предмет — ${row.subjectName}.`;
                      const waHref = TDATA.whatsappUrl(row.tutor, msgTxt);
                      return (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
                        ? EGE.kit.messengerLinksHTML({
                            entity: row.tutor,
                            message: msgTxt,
                            primaryLabel: "WhatsApp",
                            compact: true
                          })
                        : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>WhatsApp</span></a>`;
                    }
                  }
                ],
                rows: weekRows,
                searchFields: (row) => [row.dayLabel, row.hour, row.format, row.tutorName, row.subjectName, row.status].join(" "),
                emptyText: "По поисковому запросу уроков не найдено."
              })}</div>`
            : `<div class="empty"><b>По выбранному предмету записей пока нет</b><span>Переключите фильтр на «Все предметы» или добавьте занятие.</span></div>`;
          return `<div class="stack" style="gap:10px">
            <div class="row between"><h2 class="h2">Календарь ваших уроков: ${esc(weekRange)}</h2></div>
            ${weekPicker}
          </div>
          ${scheduleTableHtml}`;
        })();

    return `${header}
      ${noticeCard}
      ${bookingsStripHTML(st)}
      ${enrolledSection}
      ${studentLeadCardHTML(TDATA, ui)}`;
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
    if (act === "study-sched-cols") {
      const c = Number(d.cols);
      ui.studySchedCols = [3, 5, 7].includes(c) ? c : 5;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }
    if (act === "study-sched-filter") {
      if (d.clearQ === "1") ui.studySchedQuery = "";
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
    if (act === "study-sched-q") {
      ui.studySchedQuery = String(el.value || "");
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
      if (act === "mkt-bk-filter" || act === "mkt-bk-cols" || act === "study-sched-cols" || act === "study-sched-filter" || act === "study-chats-cols" || act === "study-chats-filter") {
        if (handleAction(act, el) && typeof e.preventDefault === "function") e.preventDefault();
      }
    });
    document.addEventListener("input", (e) => {
      const el = e && e.target;
      const d = el && el.dataset;
      const act = (d && d.a) || (el && el.id) || "";
      if (act === "mkt-bk-q" || act === "study-sched-q" || act === "study-chats-q") {
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
    cardDiffTagsHTML,
    bookingModalHTML,
    activeFilterCount,
    filterModalHTML,
    plansSectionHTML,
    tutorCardHTML,
    bookingsStripHTML,
    marketSectionHTML,
    viewMarket,
    viewStudy,
    updateBookingModalLive,
    publishStudentBid,
    handleAction,
    handleInput
  };
})();
