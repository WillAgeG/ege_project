/* Фасад кабинета преподавателя: вкладки «Заявки» и «Профиль», сборка кабинета и обработчики событий. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const {
    esc, plural, initials,
    WEEK_DAYS_RU: TC_DAYS_UI, SCHED_HOURS_RU: TC_HOURS_UI,
    sortDows: tcSortDows, formatDaysShort: tcDaysShort, formatWeeklyBotPhrase: tcBotPhrase,
    readResizedPhotoFile
  } = EGE.utils || { esc: (s) => String(s || ""), plural: (n, a) => a, initials: () => "П" };
  const { icon, sakhaPatternSVG, sakhaOhyorHTML } = EGE.ui || { icon: () => "", sakhaPatternSVG: () => "", sakhaOhyorHTML: () => "" };
  const { priceHeadlineHTML, priceDiffTagsHTML, feeSplitHTML, hhSelectHTML, hhMultiSelectHTML, tutorAvatarHTML } = EGE.hh || { priceHeadlineHTML: () => "", priceDiffTagsHTML: () => "", feeSplitHTML: () => "", hhSelectHTML: null, hhMultiSelectHTML: null, tutorAvatarHTML: null };

  const TC = EGE._tutorCab;
  const {
    TC_LS_KEY, DAY_MS, FOUR_HOURS_MS, DAY_LIST, EXAM_OPTIONS, FORMAT_OPTIONS,
    CITY_OPTIONS, TZ_OPTIONS, WA_LEAD_OPTIONS, DEFAULT_WA_LEADS, AUTO_CHANNELS, AUTO_BUMP_HOURS,
    GOAL_PRESETS, QUICK_TEMPLATES, DEFAULT_REQUESTS, DEFAULT_STUDENTS,
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS,
    getCtx, configure, getTDATA, getTutorSlug, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList, normalizeLeadList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    markSwitchAnim, consumeSwitchAnimClass,
    ensureTelemostUrl, resolveLessonContacts, getLessonNotifyConfig, getLessonPaymentState, renderLessonNotifyHTML, renderLessonPaymentHTML,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    payRemindRemainingMs, markPayRemindAnim,
    ensureCountdownTimer, ensureRealtimeConnected, clampStep, profileCompleteness,
    buildMarketTutorPayload, syncPublishedTutor, dayDowFromLabel, syncedRequests,
    findReq, updateReq, pendingCount, calcLessonSplit, renderDataTable, getTab, setTab, toggleArrayVal
  } = TC;

  const { renderCalendarTab, renderLeadsTab, formatWaReminderText, studentWaHref, studentReminderUrl } = TC;
  const { renderPayoutStatsBlocks, renderPayoutWalletSection, renderPayoutHistorySection, getWalletSummary, sideBalanceWidgetHTML, desktopDockHTML, mobileTopWidgetHTML, payoutModalHTML, submitPayout, viewPayouts } = TC;

  function renderTutorScheduleBotHTML(req, st) {
    const sp = req && req.schedulePlan;
    if (!sp || sp.status === "needs_pick") return "";
    const weekly = sp.weekly !== false;
    const isAltOpen = st.schedAltId === req.id;
    if (isAltOpen) {
      const drafts = st.schedAltDrafts || (st.schedAltDrafts = {});
      if (!drafts[req.id]) {
        drafts[req.id] = {
          dows: tcSortDows(sp.altDows && sp.altDows.length ? sp.altDows : [2, 5]),
          hour: String(sp.altHour || (sp.hour === "18:00" ? "17:00" : "18:00"))
        };
      }
      const dr = drafts[req.id];
      const dows = tcSortDows(dr.dows);
      const ready = dows.length >= 1;
      return `<div class="tc-sched-box is-editing" style="display:grid;gap:6px;padding:8px 10px;border-radius:10px;border:1px solid var(--line);background:var(--surface-2);width:100%">
        <b class="small">Предложить ученику другие дни (от 1 до 7):</b>
        <div class="row" style="gap:4px;flex-wrap:wrap">
          ${TC_DAYS_UI.map((d) => `<button type="button" class="chip-btn${dows.includes(d.dow) ? " on" : ""}" style="min-height:26px;padding:0 8px;font-size:11.5px" data-a="tc-sched-alt-day" data-id="${esc(req.id)}" data-dow="${d.dow}">${d.short}</button>`).join("")}
        </div>
        <div class="row" style="gap:4px;flex-wrap:wrap">
          ${TC_HOURS_UI.map((h) => `<button type="button" class="chip-btn${dr.hour === h ? " on" : ""}" style="min-height:26px;padding:0 8px;font-size:11.5px" data-a="tc-sched-alt-hour" data-id="${esc(req.id)}" data-hour="${h}">${h}</button>`).join("")}
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn sm" data-a="tc-sched-alt-send" data-id="${esc(req.id)}"${ready ? "" : " disabled"}>Предложить ученику</button>
          <button type="button" class="btn ghost sm" data-a="tc-sched-alt-cancel" data-id="${esc(req.id)}">Отмена</button>
        </div>
      </div>`;
    }
    if (sp.status === "sent_to_tutor") {
      return `<div class="tc-sched-box" style="display:grid;gap:6px;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--accent) 28%,transparent);background:var(--accent-soft);width:100%">
        <b class="small" style="color:var(--accent)">Бот Вектора: ученик хочет заниматься ${esc(sp.botText || tcBotPhrase(sp.dows, sp.hour, weekly))}</b>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn confirm sm" data-a="tc-sched-accept" data-id="${esc(req.id)}">Подтвердить график</button>
          <button type="button" class="btn soft sm" data-a="tc-sched-alt-open" data-id="${esc(req.id)}">Выбрать другие даты</button>
        </div>
      </div>`;
    }
    if (sp.status === "tutor_proposed") {
      return `<div class="tc-sched-box" style="display:grid;gap:4px;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--notif) 32%,transparent);background:var(--notif-soft);width:100%">
        <span class="small">Предложили ученику: <b>${esc(tcDaysShort(sp.altDows))} · ${esc(sp.altHour || "17:00")}</b> · ждём подтверждения</span>
      </div>`;
    }
    return `<div class="tc-sched-box" style="display:grid;gap:6px;padding:8px 10px;border-radius:10px;border:1px solid color-mix(in srgb,var(--confirm) 30%,transparent);background:var(--confirm-soft);width:100%">
      <span class="small" style="color:var(--confirm)"><b>✓ График закреплён:</b> ${esc(tcDaysShort(sp.dows))} · ${esc(sp.hour || req.hour)}${weekly ? " · каждую неделю" : ""}</span>
      <div class="row" style="gap:6px;flex-wrap:wrap">
        <button type="button" class="btn soft sm" data-a="tc-sched-alt-open" data-id="${esc(req.id)}">Выбрать другие даты</button>
      </div>
    </div>`;
  }

  function renderRequestCard(req, st, isFirstPending) {
    const TDATA = getTDATA();
    const bidRate = Number(req.counterPrice || req.offerPrice) || st.profile.price;
    const tutorRate = Number(req.tutorPrice) || st.profile.price;
    const mktRate = Number(req.marketPrice) || Math.round(tutorRate * 1.25);
    const sp = typeof calcLessonSplit === "function"
      ? calcLessonSplit(bidRate, req, TDATA)
      : (TDATA && typeof TDATA.commissionSplit === "function"
        ? TDATA.commissionSplit(bidRate)
        : { total: bidRate, fee: Math.round(bidRate * 0.05), payout: Math.round(bidRate * 0.95), pct: 5 });
    const isPending = req.status === "pending";
    const isAccepted = req.status === "accepted";
    const isCountered = req.status === "countered";

    const statusBadge = isAccepted
      ? `<span class="chip confirm">✓ Подтверждено</span>`
      : isCountered
        ? `<span class="chip accent">Предложена ставка ${bidRate.toLocaleString("ru-RU")} ₽/ч</span>`
        : req.status === "declined"
          ? `<span class="chip bad">Отклонено</span>`
          : `<span class="chip notif">Ожидает ответа</span>`;

    return `<article class="tc-req-card${isPending ? " is-pending" : isAccepted ? " is-accepted" : ""}"${isFirstPending ? ' id="tc-first-pending"' : ""}>
      <div class="tc-req-head">
        <div class="tc-req-who">
          <span class="tutor-avatar" aria-hidden="true">${esc(initials(req.studentName))}</span>
          <div class="stack" style="gap:2px;min-width:0;flex:1 1 0">
            <b style="font-size:15px">${esc(req.studentName)}</b>
            <div class="small muted">${esc(req.exam)} · ${esc(req.subjectName)}</div>
          </div>
        </div>
        ${statusBadge}
      </div>

      <div class="tc-req-slot-line">${icon("cal")}<span>${esc(req.dayLabel)} · <b class="num">${esc(req.hour)}</b> · ${esc(req.format || "Онлайн")}</span></div>

      ${(() => {
        const reqPriceHTML = bidRate !== tutorRate
          ? `<s class="hh-price-old num">${tutorRate.toLocaleString("ru-RU")} ₽</s><b class="hh-price-now num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b>`
          : `<b class="hh-price-now num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b>`;
        const rawDiffHtml = priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: mktRate, offerPrice: bidRate, qualBadge: "Повышенная ставка · Профи" });
        const diffTags = rawDiffHtml.match(/<span\b[^>]*>[\s\S]*?<\/span>/g) || [];
        const splitAt = diffTags.length > 2 ? Math.ceil(diffTags.length / 2) : diffTags.length;
        const diffRow1 = diffTags.slice(0, splitAt).join("");
        const diffRow2 = diffTags.slice(splitAt).join("");
        return `<div class="stack tc-req-price-block" style="gap:6px">
          <div class="hh-price-row">${reqPriceHTML}</div>
          <div class="hh-diff-strip is-2rows">
            <div class="tc-diff-row">${diffRow1}</div>
            ${diffRow2 ? `<div class="tc-diff-row">${diffRow2}</div>` : ""}
          </div>
          <div class="small ink2">Выплата после урока: <b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b> <span class="muted">(сбор ${sp.fee} ₽)</span></div>
        </div>`;
      })()}

      ${req.note ? `<div class="tc-req-quote">${esc(req.note)}</div>` : ""}

      ${(isPending || isCountered) ? `
        <div class="hh-price-stepper compact">
          <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="-50">−50 ₽</button>
          <div class="hh-step-readout"><b class="num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b></div>
          <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="50">+50 ₽</button>
        </div>
        <div class="tc-req-actions">
          <button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(req.id)}">${icon("check")}<span>Подтвердить ${bidRate.toLocaleString("ru-RU")} ₽</span></button>
          <div class="tc-req-actions-sub">
            ${bidRate !== req.offerPrice ? `<button type="button" class="btn soft sm" data-a="tc-req-counter" data-id="${esc(req.id)}">Отправить контр-ставку</button>` : ""}
            <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(req.id)}">Отклонить</button>
          </div>
        </div>` : isAccepted ? (() => {
        const tmUrl = typeof ensureTelemostUrl === "function" ? ensureTelemostUrl(st, req) : "";
        const reqNameLower = String(req.studentName || "").trim().toLowerCase();
        const stuMatch = (st.students || []).find((x) => x && ((req.studentId && x.id === req.studentId) || (reqNameLower && String(x.name || "").trim().toLowerCase() === reqNameLower))) || null;
        const contacts = typeof resolveLessonContacts === "function"
          ? resolveLessonContacts(st, req, stuMatch)
          : { entity: { id: req.id, name: req.studentName, whatsapp: req.whatsapp || "79142100511", telegram: req.telegram || "", maxHandle: req.maxHandle || "" }, available: null };
        return `<div class="stack" style="gap:8px;width:100%">
          ${renderTutorScheduleBotHTML(req, st)}
          ${typeof renderLessonPaymentHTML === "function" ? renderLessonPaymentHTML(st, req, stuMatch) : ""}
          ${tmUrl ? `<a class="btn soft sm bid-telemost-join" href="${esc(tmUrl)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>Подключиться к Яндекс Телемосту</span></a>` : ""}
          ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
            ? EGE.kit.messengerLinksHTML({
                entity: contacts.entity,
                available: contacts.available,
                message: `Здравствуйте, ${req.studentName}! Подтверждаю урок (${req.subjectName}, ${req.dayLabel} в ${req.hour}) через Вектор ЕГЭ.`,
                primaryTitle: "Написать ученику · WhatsApp",
                iconOnly: true,
                allowHoldAdd: true,
                compact: true
              })
            : `<button type="button" class="btn confirm sm" data-a="tc-req-msg" data-id="${esc(req.id)}">${icon("msg")}<span>Написать ученику</span></button>`}
          <div class="small muted tc-hold-hint">Удерживайте иконку, чтобы изменить контакт</div>
          ${typeof renderLessonNotifyHTML === "function" ? renderLessonNotifyHTML(st, req, stuMatch) : ""}
        </div>`;
      })() : `
        <div class="row" style="gap:8px">
          <button type="button" class="btn soft sm" data-a="tc-req-restore" data-id="${esc(req.id)}">Вернуть в рассмотрение</button>
        </div>`}
    </article>`;
  }

  function renderSlotsPanelHTML(st, TDATA) {
    const activeDayObj = DAY_LIST.find((d) => d.dow === st.activeDow) || DAY_LIST[5];
    const daySlots = Array.isArray(st.slots[activeDayObj.dow]) ? st.slots[activeDayObj.dow] : [];
    const totalSlotsCount = Object.keys(st.slots).reduce((s, k) => s + (Array.isArray(st.slots[k]) ? st.slots[k].length : 0), 0);
    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    return `<section class="card stack" style="gap:12px" aria-label="Окна времени 10:00–20:00">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Слоты 10:00–20:00</div>
          <h2 class="h2">Свободные окна (${totalSlotsCount})</h2>
        </div>
        <span class="chip accent num">${esc(activeDayObj.wd)}: ${daySlots.length} ч</span>
      </div>
      <div class="cal-days is-7days" aria-label="День недели">
        ${DAY_LIST.map((d) => {
          const cnt = Array.isArray(st.slots[d.dow]) ? st.slots[d.dow].length : 0;
          return `<button type="button" class="day-cir${st.activeDow === d.dow ? " on" : ""}" data-a="tc-day" data-dow="${d.dow}">
            <span class="day-wd">${d.wd}</span>
            <span class="day-dot">${cnt}</span>
            <span class="day-cnt">${cnt ? "откр." : "выкл."}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="hour-circles" aria-label="Часы на день">
        ${hours.map((h) => {
          const on = daySlots.includes(h);
          return `<button type="button" class="hr-cir${on ? " on" : ""}" data-a="tc-slot-toggle" data-hour="${h}" aria-pressed="${on}">
            <span>${h}</span>
            <span class="hr-cnt">${on ? "✓" : "—"}</span>
          </button>`;
        }).join("")}
      </div>
      <span class="small muted">Нажмите на час, чтобы открыть или закрыть запись на ${esc(activeDayObj.full.toLowerCase())}.</span>
    </section>`;
  }


  function renderRequestsTab(st, TDATA, allReqs, pendingList, acceptedList) {
    const reqFilter = ["pending", "accepted"].includes(st.filter) ? st.filter : "all";
    const firstPending = allReqs.find((r) => r.status === "pending");
    const firstPendingId = firstPending ? firstPending.id : "";
    const filteredReqs = allReqs.filter((r) => {
      if (reqFilter === "pending" && r.status !== "pending") return false;
      if (reqFilter === "accepted" && r.status !== "accepted") return false;
      return true;
    });

    const cardsHtml = filteredReqs.length
      ? `<div class="tc-req-list">${filteredReqs.map((r) => renderRequestCard(r, st, r.id === firstPendingId)).join("")}</div>`
      : `<div class="empty">
          <b>По выбранному фильтру заявок нет</b>
          <span>Сбросьте фильтр или обновите пример заявок.</span>
          <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
            <button type="button" class="btn soft sm" data-a="tc-req-tbl-filter" data-v="all">Показать все заявки</button>
            <button type="button" class="btn ghost sm" data-a="tc-reset-demo">Сбросить демо</button>
          </div>
        </div>`;

    return `<div class="stack" style="gap:16px">
      <section class="stack tc-req-section" id="tc-requests-table" aria-label="Входящие заявки учеников">
        <div class="stack" style="gap:2px">
          <div class="eyebrow">Торг в реальном времени</div>
          <h2 class="h2">Входящие заявки учеников</h2>
        </div>

        <div class="hh-seg equal tc-req-filter-seg" role="group" aria-label="Фильтр заявок">
          <button type="button" data-a="tc-req-tbl-filter" data-v="all" aria-pressed="${reqFilter === "all"}">Все (${allReqs.length})</button>
          <button type="button" data-a="tc-req-tbl-filter" data-v="pending" aria-pressed="${reqFilter === "pending"}">Ждут (${pendingList.length})</button>
          <button type="button" data-a="tc-req-tbl-filter" data-v="accepted" aria-pressed="${reqFilter === "accepted"}">Принято (${acceptedList.length})</button>
        </div>

        ${cardsHtml}
      </section>

      ${renderSlotsPanelHTML(st, TDATA)}
    </div>`;
  }

  function renderProfileTab(st, TDATA, baseSplit) {
    const p = st.profile;
    const comp = profileCompleteness(p, st.slots);
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "bio", name: "Биология" }];
    const previewCard = st.profilePreview && EGE.views.marketplace && typeof EGE.views.marketplace.tutorCardHTML === "function"
      ? EGE.views.marketplace.tutorCardHTML(buildMarketTutorPayload(st))
      : "";
    const avHTML = typeof tutorAvatarHTML === "function"
      ? tutorAvatarHTML({ photo: p.photo, name: p.name }, { cls: "lg" })
      : `<span class="tutor-avatar lg is-no-photo"><span>Без фото</span></span>`;
    const remMs = autoBumpRemainingMs(st);
    const mRem = manualBumpRemainingMs(st);
    const lastAutoLabel = formatTimestamp(st.lastAutoBumpAt || st.lastBumpAt);
    const lastManualLabel = formatTimestamp(st.lastManualBumpAt);

    return `<div class="stack" style="gap:12px">
      <div class="card tc-prof-compact-card">
        <div class="tc-prof-compact-head">
          <div class="tc-prof-compact-meta">
            <b class="tc-compact-title">Заполненность профиля: <span class="num savings-gold-txt">${comp.pct}%</span></b>
            ${st.published ? `<span class="chip confirm tc-compact-chip">✓ Опубликована для учеников</span>` : `<span class="chip notif tc-compact-chip">Черновик</span>`}
          </div>
          <button type="button" class="btn soft sm tc-prof-preview-btn" data-a="tc-preview-toggle">${st.profilePreview ? "Скрыть" : "Как видит ученик"}</button>
        </div>
        <div class="tc-hh-meter" aria-label="Прогресс заполнения профиля"><i style="width:${comp.pct}%"></i></div>
        <div class="tc-compact-note">${comp.missing.length ? "Осталось: " + esc(comp.missing.slice(0, 2).join(", ")) + "." : "Профиль на 100% — приоритет в поиске."}</div>
      </div>

      <div class="tc-autobump-card" aria-label="Продвижение анкеты в выдаче">
        <div class="tc-bump-head">
          <div class="tc-bump-title-wrap">
            <h2 class="tc-bump-title">${st.autoBump24h ? "Автоподнятие 24 ч активно" : "Автоподнятие на паузе"}</h2>
            <div class="tc-bump-sub">${st.autoBump24h ? `Через <b class="num savings-gold-txt" data-tc-countdown>${formatCountdown(remMs)}</b> · 0 ₽` : "Бесплатно каждые 24 ч · 0 ₽"}</div>
          </div>
          <button type="button" class="tc-switch-pill${st.autoBump24h ? " is-on" : ""}${consumeSwitchAnimClass("autobump")}" data-a="tc-autobump-toggle" aria-pressed="${!!st.autoBump24h}"><i class="tc-switch-track" aria-hidden="true"></i><span>${st.autoBump24h ? "Вкл" : "Выкл"}</span></button>
        </div>

        <div class="tc-bump-actions">
          <button type="button" class="btn ${mRem > 0 ? "" : "soft "}sm tc-bump-manual-btn${mRem > 0 ? " is-confirmed" : ""}" data-a="tc-bump"${mRem > 0 ? " disabled" : ""}>
            <span>${mRem > 0 ? `✓ Поднята · через <b class="num" data-tc-manual-countdown>${formatCountdown(mRem)}</b>` : "Поднять анкету (раз в 4 ч)"}</span>
          </button>
          <button type="button" class="btn ghost sm tc-bump-more-btn" data-a="tc-bump-details-toggle" aria-expanded="${!!st.bumpDetailsOpen}">${st.bumpDetailsOpen ? "Скрыть" : "Подробнее"}</button>
        </div>

        ${st.bumpDetailsOpen ? `<div class="tc-autobump-panel stack" style="gap:10px">
          <p class="small ink2" style="margin:0">Анкета автоматически поднимается в топ выдачи /market каждые 24 часа. Дополнительно можно поднять вручную раз в 4 часа.</p>
          <div class="stack" style="gap:6px">
            <span class="small muted">Пиковое время суточного автоподнятия</span>
            <div class="tc-bump-hours-grid">
              ${AUTO_BUMP_HOURS.map((hr) => `<button type="button" class="chip-btn${st.autoBumpHour === hr ? " on" : ""}" data-a="tc-autobump-hour" data-hour="${hr}">${hr} Якт</button>`).join("")}
            </div>
          </div>
          <div class="tc-bump-meta-list stack">
            <span>Последнее автопродвижение: <b style="color:var(--ink)">${esc(lastAutoLabel)}</b></span>
            <span>Последнее ручное поднятие: <b style="color:var(--ink)">${esc(lastManualLabel)}</b> · интервал 4 ч</span>
            <span>Всего поднятий: <b class="num" style="color:var(--ink)">${st.bumpCount || 1}</b></span>
          </div>
        </div>` : ""}
      </div>

      ${previewCard ? `<div class="stack" style="gap:8px"><div class="eyebrow">Живой вид вашей карточки для учеников</div>${previewCard}</div>` : ""}

      <form class="stack tc-profile-form" style="gap:14px" data-f="tc-profile">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <h3 class="h2">1. Основная визитка и фото</h3>
          <span class="chip${p.price >= 1400 ? " pro" : " accent"}">${p.price >= 1400 ? "Эксперт выше рынка" : "Доступная ставка"}</span>
        </div>

        <div class="tc-photo-row">
          <div class="tc-photo-top">
            ${avHTML}
            <div class="stack" style="gap:4px;min-width:0">
              <b>${p.photo ? "Фото загружено в анкету" : "Сейчас отображается «Без фото»"}</b>
              <span class="small muted">Загрузите своё фото — оно обновится в анкете и предпросмотре, либо выберите «Без фото».</span>
            </div>
          </div>
          <div class="tc-photo-actions">
            <label class="btn soft sm" for="tc-photo-file" style="cursor:pointer">${icon("upload")}<span>Загрузить фото</span></label>
            <input type="file" id="tc-photo-file" accept="image/*" data-tc-photo="1" class="sr">
            <button type="button" class="btn ghost sm" data-a="tc-photo-clear"${p.photo ? "" : " disabled"}>Без фото</button>
          </div>
        </div>

        <div class="tc-two-col">
          <div class="field">
            <label for="tc-hh-name">Имя и фамилия</label>
            <input class="input" id="tc-hh-name" name="name" data-tc="name" value="${esc(p.name)}" maxlength="48" placeholder="Анна Соколова">
          </div>
          <div class="field">
            <label for="tc-hh-headline">Заголовок специализации</label>
            <input class="input" id="tc-hh-headline" name="headline" data-tc="headline" value="${esc(p.headline || "")}" maxlength="72" placeholder="Эксперт ЕГЭ по биологии · медвуз">
          </div>
        </div>

        <div class="field">
          <span class="label">Предметы преподавания (мультивыбор)</span>
          <input type="hidden" name="subject" value="${esc(p.subject)}">
          ${typeof hhMultiSelectHTML === "function"
            ? hhMultiSelectHTML({
                id: "tc-subjects",
                options: subjects.map((sb) => ({ id: sb.id, label: sb.name, short: sb.short })),
                values: Array.isArray(p.subjects) && p.subjects.length ? p.subjects : [p.subject || "bio"],
                placeholder: "Выберите предметы",
                open: !!st.subjMenuOpen,
                toggleAction: "tc-subj-toggle",
                pickAction: "tc-subj-pick",
                ariaLabel: "Предметы преподавания"
              })
            : (typeof hhSelectHTML === "function"
              ? hhSelectHTML({
                  id: "tc-subjects",
                  options: subjects.map((sb) => ({ id: sb.id, label: sb.name })),
                  value: p.subject,
                  open: !!st.subjMenuOpen,
                  toggleAction: "tc-subj-toggle",
                  pickAction: "tc-subj-pick",
                  ariaLabel: "Предметы преподавания"
                })
              : `<select class="select" id="tc-subjects" data-tc="subject">${subjects.map((sb) => `<option value="${esc(sb.id)}"${sb.id === p.subject ? " selected" : ""}>${esc(sb.name)}</option>`).join("")}</select>`)}
        </div>

        <div class="tc-two-col">
          <div class="field">
            <span class="label">Город</span>
            <div class="hh-seg equal" role="group" aria-label="Выбор города">
              ${CITY_OPTIONS.map((c) => `<button type="button" data-a="tc-city-pick" data-v="${esc(c)}" aria-pressed="${(p.city || "Якутск") === c}">${esc(c)}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <span class="label">Часовой пояс (UTC)</span>
            ${typeof hhSelectHTML === "function"
              ? hhSelectHTML({
                  id: "tc-timezone",
                  options: TZ_OPTIONS,
                  value: p.timezone || "UTC+9",
                  open: !!st.tzMenuOpen,
                  toggleAction: "tc-tz-toggle",
                  pickAction: "tc-tz-pick",
                  ariaLabel: "Часовой пояс"
                })
              : `<select class="select" id="tc-timezone" data-tc="timezone">${TZ_OPTIONS.map((tz) => `<option value="${esc(tz.id)}"${(p.timezone || "UTC+9") === tz.id ? " selected" : ""}>${esc(tz.label)}</option>`).join("")}</select>`}
          </div>
        </div>

        <div class="tc-two-col">
          <div class="field">
            <span class="label">Экзамены и направления</span>
            <div class="tc-tag-grid">
              ${EXAM_OPTIONS.map((ex) => {
                const on = Array.isArray(p.exams) && p.exams.includes(ex);
                return `<button type="button" class="tc-tag" data-a="tc-exam-toggle" data-v="${esc(ex)}" aria-pressed="${on}">${esc(ex)}</button>`;
              }).join("")}
            </div>
          </div>
          <div class="field">
            <span class="label">Формат занятий</span>
            <div class="tc-tag-grid">
              ${FORMAT_OPTIONS.map((fm) => {
                const on = Array.isArray(p.formats) && p.formats.includes(fm);
                return `<button type="button" class="tc-tag" data-a="tc-format-toggle" data-v="${esc(fm)}" aria-pressed="${on}">${esc(fm)}</button>`;
              }).join("")}
            </div>
          </div>
        </div>

        <div class="eyebrow" style="margin-top:4px">2. Опыт, образование и мессенджеры</div>
        <div class="tc-exp-edu-grid">
          <div class="field">
            <label for="tc-hh-exp">Стаж, лет <span style="color:var(--bad)" aria-hidden="true">*</span></label>
            <input class="input num" id="tc-hh-exp" name="expYears" data-tc="expYears" type="number" min="1" max="50" required value="${esc(p.expYears || 6)}">
          </div>
          <div class="field">
            <label for="tc-hh-edu">Образование и квалификация</label>
            <input class="input" id="tc-hh-edu" name="education" data-tc="education" value="${esc(p.education || "")}" maxlength="90" placeholder="ВУЗ, эксперт ЕГЭ, олимпиадная подготовка">
          </div>
        </div>

        ${(() => {
          const tgLinked = String(p.telegram || "").trim().length >= 3;
          const waLinked = String(p.whatsapp || "").replace(/\D+/g, "").length >= 10;
          const maxLinked = String(p.maxHandle || "").trim().length >= 2;
          const vkLinked = String(p.vk || "").trim().length >= 2;
          const linkedCount = [tgLinked, waLinked, maxLinked, vkLinked].filter(Boolean).length;
          const tgSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4L3.6 10.9c-.8.3-.8 1.5.1 1.7l4.5 1.4 1.7 5.2c.2.7 1.1.9 1.6.3l2.6-2.8 4.4 3.2c.6.4 1.4.1 1.6-.6L22 5.2c.2-.8-.4-1.4-1-1.2z"/><path d="M8.2 14l9.6-6.2"/></svg>`;
          const waSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L4 20l1.2-4.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M9.5 9.2c.3 2 2 3.8 4 4.3l1.2-.9c.3-.2.7-.2 1 0l1 .6"/></svg>`;
          const maxSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="14" rx="5"/><path d="M8 14.5v-5l4 3.5 4-3.5v5"/></svg>`;
          const vkSvg = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.78 17.5c-5.47 0-8.59-3.75-8.72-10h2.74c.09 4.58 2.11 6.52 3.71 6.92V7.5h2.58v3.95c1.58-.17 3.24-1.97 3.8-3.95h2.58c-.43 2.44-2.23 4.24-3.51 4.98 1.28.6 3.33 2.17 4.11 5.02h-2.84c-.61-1.9-2.13-3.37-4.14-3.57v3.57h-.31z"/></svg>`;
          const waInp = (EGE.phoneField && typeof EGE.phoneField.phoneFieldHTML === "function")
            ? EGE.phoneField.phoneFieldHTML({ scope: "tc-hh-wa", id: "tc-hh-wa", name: "whatsapp", label: "", value: p.whatsapp || "", country: p.whatsappCountry || "RU", extraAttrs: 'data-tc="whatsapp" aria-label="Номер телефона WhatsApp"', compact: true })
            : `<div class="field"><input class="input num" id="tc-hh-wa" name="whatsapp" data-tc="whatsapp" aria-label="Номер телефона WhatsApp" value="${esc(formatPhone(p.whatsapp || ""))}" maxlength="22" placeholder="+7 (914) 000-00-00"></div>`;
          const msgrCard = (ch, cls, svg, title, linked, fieldHtml) => `<div class="tc-msgr-card${linked ? " is-linked" : ""}">
            <div class="tc-msgr-top">
              <span class="tc-msgr-brand"><span class="tc-msgr-ico ${cls}">${svg}</span><span>${title}</span></span>
              <span class="tc-msgr-status${linked ? " is-linked" : ""}">${linked ? "✓ Привязан" : "Не привязан"}</span>
            </div>
            <div class="tc-msgr-row">
              ${fieldHtml}
              ${linked
                ? `<button type="button" class="btn ghost sm tc-msgr-act" data-a="tc-messenger-unlink" data-ch="${ch}">Отвязать</button>`
                : `<button type="button" class="btn soft sm tc-msgr-act" data-a="tc-messenger-link" data-ch="${ch}">Привязать</button>`}
            </div>
          </div>`;
          return `<div class="tc-messengers-box" role="group" aria-label="Привязка мессенджеров и соцсетей для уведомлений">
            <div class="tc-messengers-head">
              <span class="tc-messengers-title">Привязать аккаунты</span>
              <span class="tc-messengers-count num">${linkedCount} из 4</span>
            </div>
            <p class="tc-messengers-note">Привяжите Telegram, WhatsApp, MAX или ВКонтакте — так мы сможем настроить уведомления для вас (новые заявки, напоминания об уроках и оплаты).</p>
            <div class="tc-messengers-grid">
              ${msgrCard("telegram", "is-tg", tgSvg, "Telegram", tgLinked, `<div class="field"><input class="input" id="tc-hh-tg" name="telegram" data-tc="telegram" aria-label="Telegram логин или телефон" value="${esc(formatTelegram(p.telegram || ""))}" maxlength="36" placeholder="@username или +7..."></div>`)}
              ${msgrCard("whatsapp", "is-wa", waSvg, "WhatsApp", waLinked, waInp)}
              ${msgrCard("maxHandle", "is-max", maxSvg, "MAX", maxLinked, `<div class="field"><input class="input" id="tc-hh-max" name="maxHandle" data-tc="maxHandle" aria-label="MAX логин или ссылка" value="${esc(p.maxHandle || "")}" maxlength="48" placeholder="@username или max.ru/..."></div>`)}
              ${msgrCard("vk", "is-vk", vkSvg, "ВКонтакте", vkLinked, `<div class="field"><input class="input" id="tc-hh-vk" name="vk" data-tc="vk" aria-label="ВКонтакте ссылка или ID" value="${esc(p.vk || "")}" maxlength="64" placeholder="vk.com/username или @id"></div>`)}
            </div>
          </div>`;
        })()}

        <div class="field">
          <label for="tc-hh-skills">Ключевые навыки и акценты подготовки (заполните сами)</label>
          <input class="input" id="tc-hh-skills" name="customSkills" data-tc="customSkills" value="${esc(p.customSkills || "")}" maxlength="120" placeholder="Например: Генетика №28, разбор пробников ФИПИ, олимпиады">
          <span class="hint">Укажите сильные темы и специализацию своими словами — они помогают ученикам находить вашу анкету в поиске.</span>
        </div>

        <div class="field">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <span class="label">Плашки квалификации на карточке (до 2 текстов)</span>
            <span class="small muted">Отображаются бейджами на вашей карточке</span>
          </div>
          <div class="tc-two-col">
            <input class="input" id="tc-badge-1" name="badge0" data-tc="badge0" maxlength="36" placeholder="Например: К.т.н. · эксперт жюри ВсОШ" value="${esc((p.customBadges && p.customBadges[0]) || "")}">
            <input class="input" id="tc-badge-2" name="badge1" data-tc="badge1" maxlength="36" placeholder="Например: Эксперт ЕГЭ · 90+ баллов" value="${esc((p.customBadges && p.customBadges[1]) || "")}">
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap;margin-top:4px">
            ${["Эксперт жюри ВсОШ", "100-балльник ЕГЭ", "Подготовка в медвуз", "Победитель олимпиад"].map((preset) => `<button type="button" class="tc-tag" data-a="tc-badge-preset" data-v="${esc(preset)}">+ ${esc(preset)}</button>`).join("")}
            <button type="button" class="btn ghost sm" data-a="tc-badge-clear">Очистить плашки</button>
          </div>
        </div>

        <div class="eyebrow" style="margin-top:4px">3. Ставка, торг ±50 ₽ и описание методики</div>
        <div class="tc-two-col">
          <div class="field">
            <span class="label">Базовая ставка (₽/ч)</span>
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout"><b class="num">${p.price.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="50">+50 ₽</button>
            </div>
          </div>
          <div class="field">
            <span class="label">Минимальный порог торга</span>
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout"><b class="num">${p.minFair.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="50">+50 ₽</button>
            </div>
          </div>
        </div>

        <div class="field">
          <span class="label">Первый урок с гарантией возврата</span>
          <div class="hh-seg equal" role="group" aria-label="Гарантия первого урока">
            <button type="button" data-a="tc-guarantee-set" data-v="1" aria-pressed="${p.firstLessonGuarantee !== false}">Готов вернуть за 1-й урок</button>
            <button type="button" data-a="tc-guarantee-set" data-v="0" aria-pressed="${p.firstLessonGuarantee === false}">Без бесплатного 1-го</button>
          </div>
          <span class="small muted" style="margin-top:4px">${p.firstLessonGuarantee !== false ? "Если первый урок не понравится ученику, платформа вернёт 100% оплаты из резерва СБП." : "На анкете будет серый статус «Без бесплатного 1-го» — все занятия оплачиваются по обычной ставке."}</span>
        </div>

        <div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
        <span class="small muted">Чистая выплата после 5% сбора: <b class="num savings-gold-txt">${baseSplit.payout.toLocaleString("ru-RU")} ₽/ч</b>.</span>

        <div class="field">
          <label for="tc-bio-full">О себе, программе и результатах учеников</label>
          <textarea class="textarea" id="tc-bio-full" name="bio" data-tc="bio" rows="3" maxlength="320">${esc(p.bio || "")}</textarea>
        </div>

        <div class="row tc-profile-submit-row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn">${icon("check")}<span>Сохранить и опубликовать</span></button>
        </div>
      </form>
    </div>`;
  }


  function viewCabinet() {
    ensureCountdownTimer();
    ensureRealtimeConnected();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const allReqs = syncedRequests();
    const pendingList = allReqs.filter((r) => r.status === "pending");
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(p.price) : { total: p.price, fee: Math.round(p.price * 0.05), payout: Math.round(p.price * 0.95), pct: 5 };
    const normalizedTab = st.tab === "calendar" ? "students" : st.tab;
    const activeTab = ["requests", "leads", "profile", "students"].includes(normalizedTab) ? normalizedTab : "requests";

    let bodyHTML = "";
    if (activeTab === "leads") bodyHTML = renderLeadsTab(st, TDATA);
    else if (activeTab === "profile") bodyHTML = renderProfileTab(st, TDATA, baseSplit);
    else if (activeTab === "students") bodyHTML = renderCalendarTab(st, TDATA, allReqs);
    else bodyHTML = renderRequestsTab(st, TDATA, allReqs, pendingList, acceptedList, baseSplit);

    return bodyHTML;
  }


  function handleAction(act, el) {
    const st = tState();
    const d = (el && el.dataset) || {};
    const id = d.id || "";

    if (act === "tc-tab") {
      const rawTab = d.tab === "calendar" ? "students" : d.tab;
      const nextTab = ["requests", "leads", "profile", "students"].includes(rawTab) ? rawTab : "requests";
      st.tab = nextTab;
      saveState();
      if (typeof getCtx().go === "function") getCtx().go("tutor-" + nextTab);
      else if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-jump-pending") {
      st.tab = "requests";
      if (st.filter === "accepted") st.filter = "all";
      saveState();
      if (typeof getCtx().go === "function") getCtx().go("tutor-requests");
      else if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender(true);
      if (typeof setTimeout === "function" && typeof document !== "undefined" && typeof document.getElementById === "function") {
        setTimeout(() => {
          const elFirst = document.getElementById("tc-first-pending");
          if (elFirst && typeof elFirst.scrollIntoView === "function") {
            elFirst.scrollIntoView({ behavior: "smooth", block: "center" });
          }
        }, 40);
      }
      return true;
    }

    if (act === "tc-bump") {
      const rem = manualBumpRemainingMs(st);
      if (rem > 0) {
        if (typeof getCtx().notifySide === "function") {
          getCtx().notifySide("Ручное поднятие раз в 4 ч", `Повторить можно через ${formatCountdown(rem)} (последнее — ${formatTimestamp(st.lastManualBumpAt)}).`);
        }
        return true;
      }
      st.bumpedToday = true;
      st.lastManualBumpAt = Date.now();
      st.bumpCount = (Number(st.bumpCount) || 0) + 1;
      syncPublishedTutor(st);
      saveState();
      const ctxStore = getCtx().store;
      if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor) {
        EGE.api.tutor.bump(st.profile && st.profile.id).catch(() => {});
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Анкета поднята в топ (0 ₽)", "Следующее ручное поднятие будет доступно через 4 часа.");
      }
      return true;
    }

    if (act === "tc-bump-details-toggle") {
      st.bumpDetailsOpen = !st.bumpDetailsOpen;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-autobump-toggle") {
      st.autoBump24h = !st.autoBump24h;
      markSwitchAnim("autobump", st.autoBump24h);
      if (st.autoBump24h) {
        const now = Date.now();
        st.lastAutoBumpAt = now;
        st.lastBumpAt = now;
      }
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(
          st.autoBump24h ? "Автопродвижение 24 ч включено" : "Автопродвижение на паузе",
          st.autoBump24h ? `Анкета будет автоматически подниматься каждые 24 часа (к ${st.autoBumpHour} Якт).` : "Поднятие доступно вручную кнопкой раз в 4 ч."
        );
      }
      return true;
    }

    if (act === "tc-messenger-link" || act === "tc-messenger-unlink") {
      const ch = String((el && el.dataset && el.dataset.ch) || "");
      const metaMap = {
        telegram: { label: "Telegram", inputId: "tc-hh-tg" },
        whatsapp: { label: "WhatsApp", inputId: "tc-hh-wa" },
        maxHandle: { label: "MAX", inputId: "tc-hh-max" },
        vk: { label: "ВКонтакте", inputId: "tc-hh-vk" }
      };
      const meta = metaMap[ch];
      if (!meta) return false;
      if (act === "tc-messenger-unlink") {
        st.profile[ch] = "";
        syncPublishedTutor(st);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().notifySide === "function") {
          getCtx().notifySide(`Аккаунт ${meta.label} отвязан`, "Вы можете привязать его снова в профиле.");
        }
        return true;
      }
      const domInp = (typeof document !== "undefined" && typeof document.getElementById === "function")
        ? document.getElementById(meta.inputId)
        : null;
      if (domInp && typeof domInp.value === "string" && domInp.value.trim()) {
        if (ch === "telegram") st.profile.telegram = formatTelegram(domInp.value);
        else if (ch === "whatsapp") {
          const pf = EGE.phoneField;
          if (pf && typeof pf.formatPhoneForCountry === "function") {
            const stPf = typeof pf.getPhoneFieldState === "function" ? pf.getPhoneFieldState("tc-hh-wa", st.profile.whatsappCountry || "RU") : null;
            const parsed = pf.formatPhoneForCountry(domInp.value, (stPf && stPf.country) || st.profile.whatsappCountry || "RU");
            st.profile.whatsapp = parsed.formatted;
            st.profile.whatsappCountry = parsed.country.code;
          } else {
            st.profile.whatsapp = formatPhone(domInp.value);
          }
        } else if (ch === "maxHandle") {
          st.profile.maxHandle = domInp.value.trim().slice(0, 48);
        } else if (ch === "vk") {
          st.profile.vk = domInp.value.trim().slice(0, 64);
        }
      }
      const curVal = String(st.profile[ch] || "").trim();
      const ok = ch === "whatsapp"
        ? curVal.replace(/\D+/g, "").length >= 10
        : (ch === "telegram" ? curVal.length >= 3 : curVal.length >= 2);
      if (!ok) {
        if (domInp && typeof domInp.focus === "function") domInp.focus();
        if (typeof getCtx().toast === "function") {
          getCtx().toast(`Укажите логин, ссылку или номер, чтобы привязать ${meta.label}`);
        }
        return true;
      }
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(`Аккаунт ${meta.label} привязан`, `Мы сможем настроить уведомления для вас в ${meta.label}.`);
      }
      return true;
    }

    if (act === "tc-photo-clear") {
      st.profile.photo = "";
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast("Фото убрано — показывается «Без фото»");
      return true;
    }

    if (act === "tc-city-pick") {
      if (CITY_OPTIONS.includes(d.v)) {
        st.profile.city = d.v;
        syncPublishedTutor(st);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-tz-toggle") {
      st.tzMenuOpen = !st.tzMenuOpen;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-tz-pick") {
      if (TZ_OPTIONS.some((tz) => tz.id === d.v)) {
        st.profile.timezone = d.v;
      }
      st.tzMenuOpen = false;
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-wa-panel-toggle") {
      st.waPanelOpen = !st.waPanelOpen;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-wa-global-toggle") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      st.waSettings.enabled = !st.waSettings.enabled;
      markSwitchAnim("wa-global", st.waSettings.enabled);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast(st.waSettings.enabled ? "Автоуведомления (WA · TG · MAX) включены" : "Автоуведомления на паузе");
      return true;
    }

    if (act === "tc-wa-channel") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      const ch = String(d.ch || "");
      if (AUTO_CHANNELS.some((c) => c.id === ch)) {
        st.waSettings.channels = toggleArrayVal(normalizeChannelList(st.waSettings.channels), ch, true);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-wa-lead") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "1h", leads: ["24h", "1h"], channels: ["wa", "tg", "max"], template: "" };
      if (WA_LEAD_OPTIONS.some((o) => o.id === d.v)) {
        const curLeads = normalizeLeadList(st.waSettings.leads);
        const idx = curLeads.indexOf(d.v);
        if (idx >= 0) curLeads.splice(idx, 1);
        else curLeads.push(d.v);
        st.waSettings.leads = normalizeLeadList(curLeads);
        st.waSettings.lead = d.v;
      }
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-lesson-notify-toggle") {
      if (!st.lessonAutoNotify || typeof st.lessonAutoNotify !== "object") st.lessonAutoNotify = {};
      const stu = d.stuId ? (st.students || []).find((x) => x.id === d.stuId) : null;
      const prev = getLessonNotifyConfig(st, id, stu);
      let nextEnabled = false;
      if (prev.leads.length > 0) {
        const savedLeads = prev.leads.slice();
        st.lessonAutoNotify[id] = { enabled: false, leads: [], lastLeads: savedLeads };
        if (stu) {
          stu.autoLeads = [];
          stu.autoNotify = false;
        }
      } else {
        const restored = (prev.lastLeads && prev.lastLeads.length) ? prev.lastLeads.slice() : DEFAULT_WA_LEADS.slice();
        nextEnabled = restored.length > 0;
        st.lessonAutoNotify[id] = { enabled: nextEnabled, leads: restored, lastLeads: restored.slice() };
        if (stu) {
          stu.autoLeads = restored.slice();
          stu.autoNotify = nextEnabled;
        }
      }
      markSwitchAnim("lesson:" + id, nextEnabled);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-lesson-lead-toggle") {
      if (!st.lessonAutoNotify || typeof st.lessonAutoNotify !== "object") st.lessonAutoNotify = {};
      if (!WA_LEAD_OPTIONS.some((o) => o.id === d.v)) return false;
      const stu = d.stuId ? (st.students || []).find((x) => x.id === d.stuId) : null;
      const prev = getLessonNotifyConfig(st, id, stu);
      const wasEnabled = prev.enabled;
      const nextLeads = prev.leads.slice();
      const idx = nextLeads.indexOf(d.v);
      if (idx >= 0) nextLeads.splice(idx, 1);
      else nextLeads.push(d.v);
      const normalized = normalizeLeadList(nextLeads);
      const nextEnabled = normalized.length > 0;
      const lastLeads = nextEnabled ? normalized.slice() : prev.lastLeads;
      st.lessonAutoNotify[id] = { enabled: nextEnabled, leads: normalized, lastLeads };
      if (stu) {
        stu.autoLeads = normalized.slice();
        stu.autoNotify = nextEnabled;
      }
      if (wasEnabled !== nextEnabled) markSwitchAnim("lesson:" + id, nextEnabled);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-student-autonotify") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.autoNotify = !s.autoNotify;
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().notifySide === "function") {
          const leadLabel = (WA_LEAD_OPTIONS.find((o) => o.id === ((st.waSettings && st.waSettings.lead) || "1h")) || WA_LEAD_OPTIONS[1]).label;
          const chNames = normalizeChannelList(s.autoChannels).map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).name || cid).join(", ");
          getCtx().notifySide(
            s.autoNotify ? "Автоуведомление включено" : "Автоуведомление выключено",
            s.autoNotify ? `${s.name}: ${chNames} · ${leadLabel} (${s.lessonDay || "Воскресенье"}, ${s.lessonTime || "10:00"})` : `${s.name}: только ручные напоминания`
          );
        }
      }
      return true;
    }

    if (act === "tc-student-autochannel") {
      const s = (st.students || []).find((x) => x.id === id);
      const ch = String(d.ch || "");
      if (s && AUTO_CHANNELS.some((c) => c.id === ch)) {
        s.autoChannels = toggleArrayVal(normalizeChannelList(s.autoChannels), ch, true);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-student-remind") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.lastRemindedAt = Date.now();
        saveState();
        const chs = normalizeChannelList(s.autoChannels);
        const primaryCh = chs[0] || "wa";
        const url = studentReminderUrl(st, s, primaryCh);
        if (typeof window !== "undefined" && typeof window.open === "function") {
          try { window.open(url, "_blank", "noopener"); } catch (e) { /* игнор */ }
        }
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().notifySide === "function") {
          const chNames = chs.map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).name || cid).join(" · ");
          getCtx().notifySide(`Напоминание подготовлено (${chNames})`, `${s.name} · ${s.lessonDay || "Воскресенье"} в ${s.lessonTime || "10:00"}`);
        }
      }
      return true;
    }

    if (act === "tc-autobump-hour") {
      if (AUTO_BUMP_HOURS.includes(d.hour)) {
        st.autoBumpHour = d.hour;
        syncPublishedTutor(st);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-stats-period") {
      st.statsPeriod = d.v === "30d" ? "30d" : "7d";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-payout-scope") {
      st.payoutScope = d.v === "month" ? "month" : "all";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-payout-rate-toggle") {
      st.payoutRateOpen = !st.payoutRateOpen;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-goal") {
      st.monthlyGoal = Math.max(10000, Math.min(500000, Number(d.v) || 60000));
      st.goalCustomOpen = false;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-goal-custom-toggle") {
      st.goalCustomOpen = !st.goalCustomOpen;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-fee-details-toggle") {
      st.feeDetailsOpen = !st.feeDetailsOpen;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-history-details-toggle") {
      st.historyDetailsOpen = !st.historyDetailsOpen;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-preview-toggle") {
      st.profilePreview = !st.profilePreview;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-exam-toggle") {
      if (d.v) st.profile.exams = toggleArrayVal(st.profile.exams, d.v, true);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-format-toggle") {
      if (d.v) st.profile.formats = toggleArrayVal(st.profile.formats, d.v, true);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-skill-toggle") {
      if (d.v) st.profile.skills = toggleArrayVal(st.profile.skills, d.v, false);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-filter") {
      st.filter = ["pending", "accepted"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-req-tbl-filter") {
      if (d.clearQ === "1") st.reqTblQuery = "";
      st.filter = ["pending", "accepted"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-req-tbl-cols") {
      const c = Number(d.cols);
      st.reqTblCols = [3, 5, 7].includes(c) ? c : 5;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-st-tbl-filter") {
      if (d.clearQ === "1") st.stTblQuery = "";
      st.stTblFilter = ["auto", "off"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-st-tbl-cols") {
      const c = Number(d.cols);
      st.stTblCols = [3, 5, 7].includes(c) ? c : 5;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-leads-tbl-filter") {
      if (d.clearQ === "1") st.leadsTblQuery = "";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-leads-tbl-cols") {
      const c = Number(d.cols);
      st.leadsTblCols = [3, 5, 7].includes(c) ? c : 5;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-guarantee-set" || act === "tc-trial-mode") {
      const enabled = act === "tc-guarantee-set"
        ? (d.v === "1" || d.v === "true")
        : d.v === "free";
      st.profile.firstLessonGuarantee = enabled;
      st.profile.trialMode = enabled ? "free" : "none";
      st.profile.trialPrice = enabled ? 0 : null;
      st.profile.trialFree = enabled;
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-rate-step") {
      const which = d.which === "minFair" ? "minFair" : "price";
      const step = Number(d.step) || 0;
      if (which === "price") {
        st.profile.price = clampStep(st.profile.price, step, 0, 99999);
        if (st.profile.minFair > st.profile.price) st.profile.minFair = Math.max(0, st.profile.price - 50);
      } else {
        st.profile.minFair = clampStep(st.profile.minFair, step, 0, st.profile.price);
      }
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-req-step") {
      const step = Number(d.step) || 0;
      updateReq(id, (req) => {
        const cur = req.counterPrice != null ? Number(req.counterPrice) : (req.offerPrice != null ? Number(req.offerPrice) : st.profile.price);
        req.counterPrice = clampStep(cur, step, 0, 99999);
      });
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-req-accept") {
      const updated = updateReq(id, (req) => {
        const finalPrice = Number(req.counterPrice || req.offerPrice) || st.profile.price;
        req.counterPrice = finalPrice;
        req.offerPrice = finalPrice;
        req.status = "accepted";
      });
      const who = findReq(id);
      const bkServerId = who && (who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.accept(bkServerId, { counterPrice: who ? Number(who.offerPrice) : undefined }).catch(() => {});
      }
      publishRtUpdate(
        "request.accepted",
        "Урок подтверждён",
        who ? `${who.studentName} · ${who.dayLabel} в ${who.hour}` : "Урок подтверждён",
        { requestId: id }
      );
      syncTutorCalendar(st);
      if (updated && typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(
          "Урок подтверждён",
          who ? `${who.studentName} · ${who.dayLabel} в ${who.hour} за ${who.offerPrice.toLocaleString("ru-RU")} ₽/ч` : "Заявка переведена в подтверждённые"
        );
      }
      return true;
    }

    if (act === "tc-req-counter") {
      const updated = updateReq(id, (req) => { req.status = "countered"; });
      if (updated && typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      const who = findReq(id);
      const bkServerId = who && (who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && who && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.counter(bkServerId, Number(who.counterPrice)).catch(() => {});
      }
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(
          "Контр-ставка отправлена",
          who ? `Предложили ${who.counterPrice.toLocaleString("ru-RU")} ₽/ч — уведомим ученика` : "Новая ставка отправлена ученику"
        );
      }
      return true;
    }

    if (act === "tc-req-decline") {
      const who = findReq(id);
      const bkServerId = who && (who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.cancel(bkServerId).catch(() => {});
      }
      updateReq(id, (req) => { req.status = "declined"; });
      publishRtUpdate("request.declined", "Заявка снята", `Слот освобождён (${id})`, { requestId: id });
      syncTutorCalendar(st);
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast("Заявка отклонена");
      return true;
    }

    if (act === "tc-req-restore") {
      updateReq(id, (req) => { req.status = "pending"; });
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-req-msg") {
      const who = findReq(id);
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Чат с учеником", who ? `Открыт диалог с ${who.studentName} (${who.dayLabel}, ${who.hour})` : "Сообщение ученику подготовлено");
      }
      return true;
    }

    if (act === "tc-pay-remind") {
      const who = findReq(id);
      if (!st.lessonPayments || typeof st.lessonPayments !== "object") st.lessonPayments = {};
      const prev = typeof getLessonPaymentState === "function" ? getLessonPaymentState(st, who || { id }) : { paid: false, paidAt: 0, remindedAt: 0, remindCount: 0 };
      if (prev.paid || (typeof payRemindRemainingMs === "function" && payRemindRemainingMs(prev) > 0)) {
        if (typeof ensureCountdownTimer === "function") ensureCountdownTimer();
        return true;
      }
      const now = Date.now();
      st.lessonPayments[id] = {
        paid: prev.paid,
        paidAt: prev.paidAt,
        remindedAt: now,
        remindCount: (prev.remindCount || 0) + 1
      };
      updateReq(id, (r) => {
        r.payRemindedAt = now;
        r.payRemindCount = (Number(r.payRemindCount) || 0) + 1;
      });
      saveState();
      if (typeof markPayRemindAnim === "function") markPayRemindAnim(id);
      if (typeof ensureCountdownTimer === "function") ensureCountdownTimer();
      const amount = Number(who && (who.counterPrice || who.offerPrice)) || st.profile.price || 1200;
      publishRtUpdate(
        "payment.reminder",
        "Уведомление об оплате",
        who ? `${who.studentName} · ${amount.toLocaleString("ru-RU")} ₽` : "Напоминание об оплате",
        { requestId: id, remindedAt: now }
      );
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(
          "Уведомление об оплате отправлено",
          who ? `${who.studentName} получит напоминание оплатить ${amount.toLocaleString("ru-RU")} ₽ (${who.dayLabel} в ${who.hour})` : "Напоминание отправлено ученику"
        );
      }
      return true;
    }

    if (act === "tc-sched-accept") {
      const updated = updateReq(id, (req) => {
        if (!req.schedulePlan) return;
        req.schedulePlan.status = "confirmed";
        req.schedulePlan.updatedAt = Date.now();
        req.dows = tcSortDows(req.schedulePlan.dows);
        req.hour = String(req.schedulePlan.hour || req.hour || "16:00");
        req.dayLabel = tcDaysShort(req.dows);
      });
      if (!updated) return false;
      const who = findReq(id);
      const sp = who && who.schedulePlan;
      st.schedAltId = "";
      syncTutorCalendar(st);
      saveState();
      publishRtUpdate(
        "schedule.confirmed",
        "График подтверждён",
        sp ? `${who.studentName} · ${tcDaysShort(sp.dows)} в ${sp.hour}` : "График подтверждён",
        { requestId: id, schedulePlan: sp }
      );
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("График подтверждён", sp ? `${tcDaysShort(sp.dows)} · ${sp.hour}` : "Расписание закреплено");
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sched-alt-open") {
      st.schedAltId = id;
      const who = findReq(id);
      const sp = who && who.schedulePlan;
      const drafts = st.schedAltDrafts || (st.schedAltDrafts = {});
      drafts[id] = {
        dows: tcSortDows(sp && sp.altDows && sp.altDows.length ? sp.altDows : [2, 5]),
        hour: String((sp && sp.altHour) || (sp && sp.hour === "18:00" ? "17:00" : "18:00"))
      };
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sched-alt-cancel") {
      st.schedAltId = "";
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sched-alt-day") {
      const drafts = st.schedAltDrafts || (st.schedAltDrafts = {});
      if (!drafts[id]) drafts[id] = { dows: [2, 5], hour: "18:00" };
      const dow = Number(d.dow);
      if (!Number.isInteger(dow) || dow < 0 || dow > 6) return false;
      const cur = Array.isArray(drafts[id].dows) ? drafts[id].dows.slice() : [];
      const idx = cur.indexOf(dow);
      if (idx >= 0) cur.splice(idx, 1);
      else cur.push(dow);
      drafts[id].dows = tcSortDows(cur);
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sched-alt-hour") {
      const drafts = st.schedAltDrafts || (st.schedAltDrafts = {});
      if (!drafts[id]) drafts[id] = { dows: [2, 5], hour: "18:00" };
      if (d.hour) drafts[id].hour = String(d.hour);
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sched-alt-send") {
      const drafts = st.schedAltDrafts || {};
      const dr = drafts[id];
      const dows = tcSortDows(dr && dr.dows);
      if (dows.length < 1) {
        if (typeof getCtx().toast === "function") getCtx().toast("Выберите хотя бы 1 день для предложения ученику");
        return true;
      }
      const hour = String((dr && dr.hour) || "18:00");
      const updated = updateReq(id, (req) => {
        if (!req.schedulePlan) req.schedulePlan = { dows: [3, 4], hour: req.hour || "16:00", weekly: true };
        req.schedulePlan.status = "tutor_proposed";
        req.schedulePlan.altDows = dows;
        req.schedulePlan.altHour = hour;
        req.schedulePlan.altBotText = tcBotPhrase(dows, hour, req.schedulePlan.weekly !== false);
        req.schedulePlan.updatedAt = Date.now();
      });
      if (!updated) return false;
      st.schedAltId = "";
      saveState();
      publishRtUpdate(
        "schedule.counter",
        "Предложены другие даты",
        `Преподаватель предложил: ${tcDaysShort(dows)} · ${hour}`,
        { requestId: id, altDows: dows, altHour: hour }
      );
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Другие даты отправлены ученику", `${tcDaysShort(dows)} · ${hour}`);
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-day") {
      st.activeDow = DAY_LIST.some((x) => x.dow === d.dow) ? d.dow : "6";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-week") {
      const w = Number(d.w);
      st.calWeek = Number.isFinite(w) ? Math.max(-12, Math.min(12, Math.trunc(w))) : 0;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-week-step") {
      const delta = Number(d.delta) < 0 ? -1 : 1;
      const cur = Number.isFinite(Number(st.calWeek)) ? Math.trunc(Number(st.calWeek)) : 0;
      st.calWeek = Math.max(-12, Math.min(12, cur + delta));
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-open-add") {
      st.calAddHour = d.hour || "14:00";
      st.calAddOpen = true;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-close-add") {
      st.calAddOpen = false;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-copy-day") {
      const activeDayObj = DAY_LIST.find((x) => x.dow === st.activeDow) || DAY_LIST[5];
      const lessons = syncedRequests().filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === activeDayObj.dow);
      const summary = lessons.length
        ? lessons.map((r) => `${r.hour} — ${r.studentName} (${r.offerPrice} ₽/ч)`).join("\n")
        : "На выбранный день уроки ещё не назначены.";
      copyStr(`${activeDayObj.full}:\n${summary}`);
      if (typeof getCtx().toast === "function") getCtx().toast("Расписание дня скопировано");
      return true;
    }

    if (act === "tc-slot-toggle") {
      const hour = String(d.hour || "").trim();
      if (!hour) return true;
      const dow = st.activeDow || "6";
      const list = Array.isArray(st.slots[dow]) ? st.slots[dow].slice() : [];
      const idx = list.indexOf(hour);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(hour);
      list.sort();
      st.slots[dow] = list;
      syncPublishedTutor(st);
      saveState();
      publishRtUpdate("calendar.slot.updated", "Обновлено окно в расписании", `${dow}: ${hour}`, { dow, hour });
      syncTutorCalendar(st);
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-rt-reconnect") {
      if (EGE.realtime) {
        if (typeof EGE.realtime.clearUnread === "function") EGE.realtime.clearUnread();
        if (typeof EGE.realtime.connect === "function") {
          EGE.realtime.connect({ channel: "tutor", tutorSlug: getTutorSlug(st) });
        }
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast("Live-поток обновлён");
      return true;
    }

    if (act === "tc-cal-sync") {
      syncTutorCalendar(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(".ics-лента синхронизирована", `Часовой пояс ${st.profile.timezone || "UTC+9"} · ссылка готова для Google Calendar`);
      }
      return true;
    }

    if (act === "tc-cal-copy-ics") {
      const cs = st.calendarSync || {};
      const url = d.url || cs.icsUrl || (`/api/calendar/${encodeURIComponent(getTutorSlug(st))}.ics`);
      copyStr(url);
      if (typeof getCtx().toast === "function") getCtx().toast("Ссылка .ics скопирована");
      return true;
    }

    if (act === "tc-cal-import-modal") {
      st.calImportOpen = !st.calImportOpen;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-import-close") {
      st.calImportOpen = false;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-import-sample") {
      if (EGE.realtime && typeof EGE.realtime.importIcs === "function") {
        const resProm = EGE.realtime.importIcs({
          tutorSlug: getTutorSlug(st),
          tutorName: st.profile.name,
          city: st.profile.city,
          timezone: st.profile.timezone,
          icsText: SAMPLE_GCAL_ICS,
          openSlots: st.slots
        });
        const rtCal = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState().calendar : null;
        if (rtCal) {
          st.calendarSync = Object.assign({}, st.calendarSync || {}, {
            gcalConnected: true,
            icsUrl: rtCal.icsUrl,
            googleSubscribeUrl: rtCal.googleSubscribeUrl,
            googleTemplateUrl: rtCal.googleTemplateUrl,
            busySlots: Array.isArray(rtCal.busySlots) ? rtCal.busySlots : [],
            conflicts: Array.isArray(rtCal.conflicts) ? rtCal.conflicts : [],
            lastSyncAt: Date.now()
          });
        }
        saveState();
        if (resProm && typeof resProm.then === "function") {
          resProm.then((res) => {
            if (res && res.ok) {
              st.calendarSync = Object.assign({}, st.calendarSync || {}, {
                gcalConnected: true,
                busySlots: Array.isArray(res.busySlots) ? res.busySlots : st.calendarSync.busySlots,
                conflicts: Array.isArray(res.conflicts) ? res.conflicts : st.calendarSync.conflicts,
                lastSyncAt: Date.now()
              });
              saveState();
              if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
            }
          }).catch(() => {});
        }
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Импорт GCal (.ics) выполнен", `События 07:00 UTC пересчитаны в ${st.profile.timezone || "UTC+9"}`);
      }
      return true;
    }

    if (act === "tc-subj-toggle") {
      st.subjMenuOpen = !st.subjMenuOpen;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-subj-pick") {
      const pickedId = String(d.v || "bio");
      const curList = Array.isArray(st.profile.subjects) && st.profile.subjects.length ? st.profile.subjects : [st.profile.subject || "bio"];
      if (curList.includes(pickedId) && curList.length <= 1) {
        if (typeof getCtx().toast === "function") getCtx().toast("Должен остаться хотя бы один предмет");
        return true;
      }
      st.profile.subjects = toggleArrayVal(curList, pickedId, true);
      st.profile.subject = st.profile.subjects[0] || "bio";
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-badge-preset") {
      const txt = String(d.v || "").trim().slice(0, 36);
      if (txt) {
        const arr = Array.isArray(st.profile.customBadges) ? st.profile.customBadges.slice(0, 2) : ["", ""];
        while (arr.length < 2) arr.push("");
        if (!arr.includes(txt)) {
          const emptyIdx = arr.findIndex((x) => !String(x || "").trim());
          arr[emptyIdx >= 0 ? emptyIdx : 1] = txt;
          st.profile.customBadges = arr;
          syncPublishedTutor(st);
          saveState();
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        }
      }
      return true;
    }

    if (act === "tc-badge-clear") {
      st.profile.customBadges = ["", ""];
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-leads-mine") {
      st.leadsMineOnly = !st.leadsMineOnly;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-leads-mode") {
      st.leadsMineOnly = d.v === "mine";
      st.leadsSubj = "all";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-leads-subj") {
      st.leadsSubj = String(d.v || "all");
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-chart-style") {
      st.chartStyle = ["sticks", "lollipop", "capsule", "combo", "classic"].includes(d.v) ? d.v : "sticks";
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-lead-step") {
      const step = Number(d.step) || 0;
      const TDATA = getTDATA();
      const leadsAll = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
      const lead = leadsAll.find((x) => x.id === id);
      const budget = Number(lead && lead.targetPrice) || st.profile.price;
      const cur = Number((st.leadCounterPrices && st.leadCounterPrices[id]) || (lead && lead.counterPrice) || budget) || budget;
      if (!st.leadCounterPrices || typeof st.leadCounterPrices !== "object") st.leadCounterPrices = {};
      st.leadCounterPrices[id] = clampStep(cur, step, 0, 99999);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-lead-offer") {
      const TDATA = getTDATA();
      const leadsAll = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
      const lead = leadsAll.find((x) => x.id === id);
      const budget = Number(lead && lead.targetPrice) || st.profile.price;
      const rawRate = (st.leadCounterPrices && st.leadCounterPrices[id] != null) ? st.leadCounterPrices[id] : ((lead && lead.counterPrice != null) ? lead.counterPrice : budget);
      const counterRate = Math.max(0, Math.min(99999, Math.round(Number(rawRate) || 0)));
      if (!st.leadCounterPrices || typeof st.leadCounterPrices !== "object") st.leadCounterPrices = {};
      st.leadCounterPrices[id] = counterRate;
      const hit = TDATA && typeof TDATA.markStudentLeadResponded === "function" ? TDATA.markStudentLeadResponded(id) : null;
      if (hit) {
        hit.counterPrice = counterRate;
        hit.responded = true;
      }
      if (lead) {
        lead.counterPrice = counterRate;
        lead.responded = true;
      }
      saveState();
      publishRtUpdate(
        "lead.offer.sent",
        "Отклик на заявку ученика",
        `${(hit && hit.studentName) || (lead && lead.studentName) || "Ученик"} · ${counterRate.toLocaleString("ru-RU")} ₽/ч`,
        { leadId: id, counterPrice: counterRate }
      );
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Отклик отправлен ученику", hit ? `${hit.studentName} получил(а) ваше предложение по ставке ${counterRate.toLocaleString("ru-RU")} ₽/ч` : `Предложена ставка ${counterRate.toLocaleString("ru-RU")} ₽/ч`);
      }
      if (typeof getCtx().toast === "function") {
        getCtx().toast(`Предложена ставка ${counterRate.toLocaleString("ru-RU")} ₽/ч`);
      }
      return true;
    }

    if (act === "tc-student-score") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.curScore = Math.min(s.targetScore, (Number(s.curScore) || 0) + (Number(d.delta) || 2));
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().notifySide === "function") getCtx().notifySide("Пробник обновлён", `${s.name}: текущий балл ${s.curScore} / ${s.targetScore}`);
      }
      return true;
    }

    if (act === "tc-student-lesson") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.lessonsDone = (Number(s.lessonsDone) || 0) + 1;
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().toast === "function") getCtx().toast(`${s.name}: учтён урок №${s.lessonsDone}`);
      }
      return true;
    }

    if (act === "tc-copy-tpl") {
      const tpl = QUICK_TEMPLATES.find((t) => t.id === id);
      if (tpl) {
        copyStr(tpl.build(st.profile));
        if (typeof getCtx().notifySide === "function") getCtx().notifySide("Шаблон скопирован", tpl.title);
      }
      return true;
    }

    if (act === "tc-reset-demo") {
      const def = defaultState();
      st.filter = "all";
      st.requests = def.requests;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast("Демо-заявки обновлены");
      return true;
    }

    return false;
  }

  function handleInput(el) {
    if (!el || !el.dataset) return false;
    const st = tState();
    const act = el.dataset.a || el.id || "";
    if (act === "tc-req-tbl-q") {
      st.reqTblQuery = String(el.value || "");
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }
    if (act === "tc-st-tbl-q") {
      st.stTblQuery = String(el.value || "");
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }
    if (act === "tc-leads-tbl-q") {
      st.leadsTblQuery = String(el.value || "");
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }
    if (act === "tc-add-price") {
      const num = Math.max(0, Math.min(99999, Math.round(Number(el.value) || 0)));
      const fee1 = Math.round(num * 0.01);
      const net99 = Math.max(0, num - fee1);
      if (typeof document !== "undefined" && typeof document.getElementById === "function") {
        const noteEl = document.getElementById("tc-add-fee-note");
        if (noteEl) {
          noteEl.innerHTML = `На руки 99%: <b class="num" style="color:var(--confirm)">${net99.toLocaleString("ru-RU")} ₽</b> · сбор 1% (${fee1.toLocaleString("ru-RU")} ₽)`;
        }
      }
      return true;
    }
    if (act === "tc-lead-rate") {
      const leadId = el.dataset.id || "";
      if (!leadId) return false;
      const num = Number(el.value);
      if (!Number.isFinite(num) || num < 0) return true;
      if (!st.leadCounterPrices || typeof st.leadCounterPrices !== "object") st.leadCounterPrices = {};
      const clamped = Math.max(0, Math.min(99999, Math.round(num)));
      if (num >= 0 && num <= 99999) {
        st.leadCounterPrices[leadId] = clamped;
        saveState();
      }
      const isFocused = typeof document !== "undefined" && document.activeElement === el;
      if (isFocused && typeof document.querySelector === "function") {
        const TDATA = getTDATA();
        const leadsAll = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
        const lead = leadsAll.find((x) => x.id === leadId);
        const budget = Number(lead && lead.targetPrice) || st.profile.price;
        const rate = clamped;
        const delta = rate - budget;
        const deltaLabel = delta === 0
          ? "= бюджету"
          : (delta > 0 ? `+${delta.toLocaleString("ru-RU")} ₽ к бюджету` : `−${Math.abs(delta).toLocaleString("ru-RU")} ₽`);
        const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.round(rate * 0.95) };
        const deltaEl = document.querySelector(`[data-tc-lead-delta="${leadId}"]`);
        const payEl = document.querySelector(`[data-tc-lead-payout="${leadId}"]`);
        const offerBtn = document.querySelector(`[data-a="tc-lead-offer"][data-id="${leadId}"]`);
        if (deltaEl) deltaEl.textContent = deltaLabel;
        if (payEl) payEl.textContent = `${sp.payout.toLocaleString("ru-RU")} ₽`;
        if (offerBtn) offerBtn.textContent = lead && lead.responded ? `✓ Отклик ${rate} ₽` : `Предложить ${rate.toLocaleString("ru-RU")} ₽/ч`;
      } else {
        st.leadCounterPrices[leadId] = clamped;
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }
    if (el.dataset.tcStudent) {
      const s = (st.students || []).find((x) => x.id === el.dataset.id);
      if (!s) return false;
      const sk = el.dataset.tcStudent;
      if (sk === "lessonDay") s.lessonDay = String(el.value || "").slice(0, 24);
      else if (sk === "lessonTime") s.lessonTime = String(el.value || "").slice(0, 12);
      else if (sk === "whatsapp") {
        const masked = formatPhone(el.value);
        if (el.value !== masked) el.value = masked;
        s.whatsapp = masked;
      } else if (sk === "telegram") {
        const tgFormatted = formatTelegram(el.value);
        if (el.value !== tgFormatted) el.value = tgFormatted;
        s.telegram = tgFormatted;
      }
      saveState();
      return true;
    }
    if (el.dataset.tcPayout === "card" || el.id === "tc-payout-card") {
      const masked = formatCardMask(el.value);
      if (el.value !== masked) el.value = masked;
      return false;
    }
    if (el.dataset.tcPayout === "phone" || el.id === "tc-payout-phone") {
      const digits = String(el.value || "").replace(/\D+/g, "");
      if (digits.length >= 10) {
        const maskedPhone = formatPhone(el.value);
        if (maskedPhone && el.value !== maskedPhone) el.value = maskedPhone;
      }
      return false;
    }
    if (!el.dataset.tc) return false;
    const key = el.dataset.tc;
    const p = st.profile;
    if (key === "name") p.name = String(el.value || "").slice(0, 48);
    else if (key === "headline") p.headline = String(el.value || "").slice(0, 72);
    else if (key === "city") p.city = CITY_OPTIONS.includes(el.value) ? el.value : "Якутск";
    else if (key === "timezone") p.timezone = TZ_OPTIONS.some((tz) => tz.id === el.value) ? el.value : "UTC+9";
    else if (key === "customSkills") p.customSkills = String(el.value || "").slice(0, 120);
    else if (key === "waTemplate") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      st.waSettings.template = String(el.value || "").slice(0, 260);
      saveState();
      return true;
    }
    else if (key === "education") p.education = String(el.value || "").slice(0, 90);
    else if (key === "whatsapp") {
      const pf = EGE.phoneField;
      if (pf && typeof pf.formatPhoneForCountry === "function") {
        const stPf = typeof pf.getPhoneFieldState === "function" ? pf.getPhoneFieldState("tc-hh-wa", p.whatsappCountry || "RU") : null;
        const parsed = pf.formatPhoneForCountry(el.value, (stPf && stPf.country) || p.whatsappCountry || "RU");
        if (el.value !== parsed.formatted) el.value = parsed.formatted;
        p.whatsapp = parsed.formatted;
        p.whatsappCountry = parsed.country.code;
      } else {
        const masked = formatPhone(el.value);
        if (el.value !== masked) el.value = masked;
        p.whatsapp = masked;
      }
    } else if (key === "telegram") {
      const tgFormatted = formatTelegram(el.value);
      if (el.value !== tgFormatted) el.value = tgFormatted;
      p.telegram = tgFormatted;
    } else if (key === "maxHandle") {
      p.maxHandle = String(el.value || "").trim().slice(0, 48);
    } else if (key === "vk") {
      p.vk = String(el.value || "").trim().slice(0, 64);
    }
    else if (key === "expYears") p.expYears = Math.max(1, Math.min(50, Number(el.value) || 1));
    else if (key === "firstLessonGuarantee" || key === "trialFree") {
      p.firstLessonGuarantee = !!el.checked;
      p.trialFree = p.firstLessonGuarantee;
      p.trialMode = p.firstLessonGuarantee ? "free" : "none";
      p.trialPrice = p.firstLessonGuarantee ? 0 : null;
    }
    else if (key === "badge0" || key === "badge1") {
      if (!Array.isArray(p.customBadges)) p.customBadges = ["", ""];
      p.customBadges[key === "badge0" ? 0 : 1] = String(el.value || "").slice(0, 36);
    } else if (key === "subject") {
      p.subject = String(el.value || "bio");
      if (!Array.isArray(p.subjects) || !p.subjects.includes(p.subject)) p.subjects = [p.subject];
    }
    else if (key === "bio") p.bio = String(el.value || "").slice(0, 320);
    syncPublishedTutor(st);
    saveState();
    return true;
  }

  function handleFileInput(el) {
    if (!el || !el.files || !el.files[0]) return false;
    const file = el.files[0];
    if (el.dataset && el.dataset.tcIcsFile) {
      if (typeof FileReader !== "function") return false;
      const reader = new FileReader();
      reader.onload = () => {
        const rawIcs = String(reader.result || "").trim();
        if (!rawIcs) {
          if (typeof getCtx().toast === "function") getCtx().toast("Файл .ics пуст");
          return;
        }
        const st = tState();
        st.calImportDraft = rawIcs;
        if (EGE.realtime && typeof EGE.realtime.importIcs === "function") {
          EGE.realtime.importIcs({
            tutorSlug: getTutorSlug(st),
            tutorName: st.profile.name,
            city: st.profile.city,
            timezone: st.profile.timezone,
            icsText: rawIcs,
            openSlots: st.slots
          });
          const rtCal = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState().calendar : null;
          if (rtCal) {
            st.calendarSync = Object.assign({}, st.calendarSync || {}, {
              gcalConnected: true,
              icsUrl: rtCal.icsUrl,
              googleSubscribeUrl: rtCal.googleSubscribeUrl,
              googleTemplateUrl: rtCal.googleTemplateUrl,
              busySlots: Array.isArray(rtCal.busySlots) ? rtCal.busySlots : [],
              conflicts: Array.isArray(rtCal.conflicts) ? rtCal.conflicts : [],
              lastSyncAt: Date.now()
            });
          }
        }
        st.calImportOpen = false;
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().toast === "function") getCtx().toast("Календарь .ics импортирован");
      };
      reader.onerror = () => {
        if (typeof getCtx().toast === "function") getCtx().toast("Не удалось прочитать .ics файл");
      };
      reader.readAsText(file);
      el.value = "";
      return true;
    }
    if (typeof readResizedPhotoFile !== "function") return false;
    readResizedPhotoFile(
      file,
      { maxDim: 240, quality: 0.84, maxLen: 350000 },
      (url) => {
        const st = tState();
        st.profile.photo = url;
        syncPublishedTutor(st);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().toast === "function") getCtx().toast("Фото загружено и обновлено в каталоге");
      },
      () => {
        if (typeof getCtx().toast === "function") getCtx().toast("Выберите файл изображения (JPG, PNG, WebP)");
      }
    );
    el.value = "";
    return true;
  }

  function handleSubmit(form) {
    if (!form || !form.dataset) return false;
    const st = tState();
    const els = form.elements || {};

    if (form.dataset.f === "tc-cal-add") {
      const sName = els.studentName ? String(els.studentName.value || "").trim().slice(0, 40) : "";
      if (!sName) return true;
      const dowObj = DAY_LIST.find((x) => x.dow === st.activeDow) || DAY_LIST[5];
      const hour = els.hour ? String(els.hour.value || "14:00") : "14:00";
      const rateRaw = els.offerPrice != null ? Number(els.offerPrice.value) : NaN;
      const rate = Number.isFinite(rateRaw) ? Math.max(0, Math.min(99999, Math.round(rateRaw))) : st.profile.price;
      const note = els.note ? String(els.note.value || "").trim().slice(0, 100) : "";
      const subjObj = (getTDATA() && getTDATA().SUBJECTS) ? getTDATA().SUBJECTS.find((s) => s.id === st.profile.subject) : null;
      const item = {
        id: "tc-man-" + Date.now(),
        studentName: sName,
        exam: (st.profile.exams && st.profile.exams[0]) || "ЕГЭ",
        subjectName: subjObj ? subjObj.name : "Подготовка",
        format: (st.profile.formats && st.profile.formats[0]) || "Онлайн",
        dow: dowObj.dow,
        dayLabel: `${dowObj.wd}, своё окно`,
        hour,
        offerPrice: rate,
        counterPrice: rate,
        tutorPrice: st.profile.price,
        marketPrice: Math.round(rate * 1.25),
        note: note || "Запись добавлена преподавателем вручную",
        manualStudent: true,
        feePct: 1,
        status: "accepted",
        createdLabel: "Календарь · 1%"
      };
      st.requests.unshift(item);
      if (!st.students.some((s) => s.name === sName)) {
        st.students.unshift({
          id: "st-" + Date.now(),
          name: sName,
          exam: `${item.exam} · ${item.subjectName}`,
          startScore: 60,
          curScore: 60,
          targetScore: 85,
          lessonsDone: 1,
          manualStudent: true,
          feePct: 1,
          offerPrice: rate,
          autoNotify: true,
          autoLeads: ["24h", "1h"],
          hw: note || "Стартовая диагностика по варианту КИМ"
        });
      }
      st.calAddOpen = false;
      saveState();
      publishRtUpdate("calendar.lesson.created", "Ученик записан в календарь", `${sName} · ${dowObj.wd} в ${hour}`, { studentName: sName, dow: dowObj.dow, hour });
      syncTutorCalendar(st);
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") getCtx().notifySide("Свой ученик записан (комиссия 1%)", `${sName} · ${dowObj.wd} в ${hour} (${rate.toLocaleString("ru-RU")} ₽/ч)`);
      return true;
    }

    if (form.dataset.f === "tc-goal-custom") {
      const rawGoal = els.goal ? Number(els.goal.value) : 0;
      const nextGoal = Math.max(10000, Math.min(500000, Math.round(rawGoal || st.monthlyGoal || 60000)));
      st.monthlyGoal = nextGoal;
      st.goalCustomOpen = false;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast(`Цель дохода: ${nextGoal.toLocaleString("ru-RU")} ₽`);
      return true;
    }

    if (form.dataset.f === "tc-cal-import") {
      const rawIcs = els.icsText ? String(els.icsText.value || "").trim() : "";
      if (!rawIcs) {
        if (typeof getCtx().toast === "function") getCtx().toast("Вставьте содержимое .ics файла");
        return true;
      }
      st.calImportDraft = rawIcs;
      if (EGE.realtime && typeof EGE.realtime.importIcs === "function") {
        const resProm = EGE.realtime.importIcs({
          tutorSlug: getTutorSlug(st),
          tutorName: st.profile.name,
          city: st.profile.city,
          timezone: st.profile.timezone,
          icsText: rawIcs,
          openSlots: st.slots
        });
        const rtCal = typeof EGE.realtime.getState === "function" ? EGE.realtime.getState().calendar : null;
        if (rtCal) {
          st.calendarSync = Object.assign({}, st.calendarSync || {}, {
            gcalConnected: true,
            icsUrl: rtCal.icsUrl,
            googleSubscribeUrl: rtCal.googleSubscribeUrl,
            googleTemplateUrl: rtCal.googleTemplateUrl,
            busySlots: Array.isArray(rtCal.busySlots) ? rtCal.busySlots : [],
            conflicts: Array.isArray(rtCal.conflicts) ? rtCal.conflicts : [],
            lastSyncAt: Date.now()
          });
        }
        if (resProm && typeof resProm.then === "function") {
          resProm.then((res) => {
            if (res && res.ok) {
              st.calendarSync = Object.assign({}, st.calendarSync || {}, {
                gcalConnected: true,
                busySlots: Array.isArray(res.busySlots) ? res.busySlots : st.calendarSync.busySlots,
                conflicts: Array.isArray(res.conflicts) ? res.conflicts : st.calendarSync.conflicts,
                lastSyncAt: Date.now()
              });
              saveState();
              if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
            }
          }).catch(() => {});
        }
      }
      st.calImportOpen = false;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") getCtx().notifySide("Внешний .ics импортирован", `События пересчитаны в ${st.profile.timezone || "UTC+9"}`);
      return true;
    }

    if (form.dataset.f !== "tc-profile") return false;
    const p = st.profile;
    if (els.name && String(els.name.value || "").trim()) p.name = String(els.name.value).trim().slice(0, 48);
    if (els.headline) p.headline = String(els.headline.value || "").trim().slice(0, 72);
    if (els.city) p.city = String(els.city.value || "").trim().slice(0, 48);
    if (els.education) p.education = String(els.education.value || "").trim().slice(0, 90);
    if (els.whatsapp) {
      const ph = formatPhone(String(els.whatsapp.value || "").trim());
      p.whatsapp = ph && ph.replace(/\D+/g, "").length >= 10 ? ph : "";
    }
    if (els.telegram) p.telegram = formatTelegram(String(els.telegram.value || "").trim());
    if (els.maxHandle) p.maxHandle = String(els.maxHandle.value || "").trim().slice(0, 48);
    if (els.vk) p.vk = String(els.vk.value || "").trim().slice(0, 64);
    if (els.expYears) p.expYears = Math.max(1, Math.min(50, Number(els.expYears.value) || p.expYears));
    if (els.firstLessonGuarantee || els.trialFree) {
      const g = !!(els.firstLessonGuarantee ? els.firstLessonGuarantee.checked : els.trialFree.checked);
      p.firstLessonGuarantee = g;
      p.trialFree = g;
      p.trialMode = g ? "free" : "none";
      p.trialPrice = g ? 0 : null;
    }
    if (els.badge0 || els.badge1) {
      if (!Array.isArray(p.customBadges)) p.customBadges = ["", ""];
      if (els.badge0) p.customBadges[0] = String(els.badge0.value || "").trim().slice(0, 36);
      if (els.badge1) p.customBadges[1] = String(els.badge1.value || "").trim().slice(0, 36);
    }
    if (els.subject) {
      const subVal = String(els.subject.value || "bio");
      p.subject = subVal;
      if (!Array.isArray(p.subjects) || !p.subjects.length) p.subjects = [subVal];
    }
    if (els.bio) p.bio = String(els.bio.value || "").trim().slice(0, 320);
    st.published = true;
    syncPublishedTutor(st);
    saveState();
    const ctxStore = getCtx().store;
    if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor) {
      const tp = buildMarketTutorPayload(st);
      EGE.api.tutor.upsertProfile({
        name: p.name,
        headline: p.headline,
        photo: p.photo || "",
        subject: tp.subject,
        subjectName: tp.subjectName,
        subjects: tp.subjects,
        exams: tp.exams,
        formats: tp.formats,
        city: tp.city,
        timezone: tp.timezone,
        whatsapp: p.whatsapp || "",
        telegram: p.telegram || "",
        maxHandle: p.maxHandle || "",
        vk: p.vk || "",
        education: p.education || "",
        expYears: Number(p.expYears) || 3,
        avgScore: Number(p.avgScore) || 85,
        price: Number(p.price) || 1200,
        marketPrice: tp.marketPrice,
        customSkills: p.customSkills || "",
        bio: p.bio || "",
        firstLessonGuarantee: p.firstLessonGuarantee !== false,
        slots: st.slots || {}
      }).then((res) => {
        if (res && res.tutor && res.tutor.id) {
          p.id = res.tutor.id;
          saveState();
        }
      }).catch(() => {});
    }
    if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
    if (typeof getCtx().notifySide === "function") {
      getCtx().notifySide("Анкета сохранена и опубликована", `${p.name} · ${p.price.toLocaleString("ru-RU")} ₽/ч (торг от ${p.minFair.toLocaleString("ru-RU")} ₽/ч)`);
    }
    return true;
  }

  function closeMenus(target) {
    const st = tState();
    let changed = false;
    if (st.subjMenuOpen && (!target || typeof target.closest !== "function" || (!target.closest("#tc-subjects") && !target.closest("#tc-subject")))) {
      st.subjMenuOpen = false;
      changed = true;
    }
    if (st.tzMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#tc-timezone"))) {
      st.tzMenuOpen = false;
      changed = true;
    }
    return changed;
  }

  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("input", (e) => {
      const el = e && e.target;
      const d = el && el.dataset;
      const act = (d && d.a) || (el && el.id) || "";
      if (act === "tc-req-tbl-q" || act === "tc-st-tbl-q" || act === "tc-leads-tbl-q") {
        handleInput(el);
      }
    });
  }

  EGE.views = EGE.views || {};
  EGE.views.tutorCabinet = {
    configure,
    pendingCount,
    getTab,
    setTab,
    closeMenus,
    viewCabinet,
    viewPayouts,
    getWalletSummary,
    sideBalanceWidgetHTML,
    desktopDockHTML,
    mobileTopWidgetHTML,
    payoutModalHTML,
    submitPayout,
    formatCardMask,
    handleAction,
    handleInput,
    handleFileInput,
    handleSubmit
  };
})();
