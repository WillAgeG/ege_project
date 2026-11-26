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
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS, validateInn12,
    isDevDemoMode, setDemoMode, hydrateFromBackend, ensureServerHydrated, resetSession,
    getCtx, configure, getTDATA, getTutorSlug, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList, normalizeLeadList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    markSwitchAnim, consumeSwitchAnimClass,
    ensureTelemostUrl, resolveLessonContacts, getLessonNotifyConfig, getLessonPaymentState, renderLessonNotifyHTML, renderLessonPaymentHTML,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    payRemindRemainingMs, markPayRemindAnim,
    ensureCountdownTimer, ensureRealtimeConnected, clampStep, profileCompleteness,
    buildMarketTutorPayload, normalizeSlotsMap, countSlots, mergeAllProfileSlots,
    createEmptySearchProfile, getEditingSearchProfile, syncProfileMirror, applyServerProfile, applyServerProfiles,
    syncPublishedTutor, dayDowFromLabel, syncedRequests,
    findReq, updateReq, pendingCount, calcLessonSplit, renderDataTable, getTab, setTab, toggleArrayVal
  } = TC;

  const { renderCalendarTab, renderLeadsTab, formatWaReminderText, studentWaHref, studentReminderUrl } = TC;
  const { renderPayoutStatsBlocks, renderPayoutWalletSection, renderPayoutHistorySection, getWalletSummary, sideBalanceWidgetHTML, desktopDockHTML, mobileTopWidgetHTML, payoutModalHTML, submitPayout, viewPayouts } = TC;
  let tcNameSaveTimer = null;

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
        : { total: bidRate, fee: Math.round(bidRate * 0.05), sbpFee: Math.round(bidRate * 0.01), payout: Math.max(0, bidRate - Math.round(bidRate * 0.05) - Math.round(bidRate * 0.01)), pct: 5, sbpPct: 1 });
    const isPending = req.status === "pending";
    const isAccepted = req.status === "accepted";
    const isCountered = req.status === "countered";
    const isCompleted = req.status === "completed";
    const isCancelled = req.status === "declined" || req.status === "cancelled";

    const statusBadge = isCompleted
      ? `<span class="chip confirm">✓ Проведён</span>`
      : isAccepted
        ? `<span class="chip confirm">✓ Подтверждено</span>`
        : isCountered
          ? `<span class="chip accent">Предложена ставка ${bidRate.toLocaleString("ru-RU")} ₽/ч</span>`
          : isCancelled
            ? `<span class="chip bad">${req.status === "cancelled" ? "Отменено" : "Отклонено"}</span>`
            : `<span class="chip notif">Ожидает ответа</span>`;

    return `<article class="tc-req-card${isPending ? " is-pending" : (isAccepted || isCompleted) ? " is-accepted" : ""}"${isFirstPending ? ' id="tc-first-pending"' : ""}>
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
        return `<div class="stack tc-req-price-block" style="gap:6px">
          <div class="hh-price-row">${reqPriceHTML}</div>
          <div class="hh-diff-strip is-1row">
            <div class="tc-diff-row">${diffTags.join("")}</div>
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
          : { entity: { id: req.id, name: req.studentName, whatsapp: req.whatsapp || (isDevDemoMode() ? "79142100511" : ""), telegram: req.telegram || "", maxHandle: req.maxHandle || "" }, available: null };
        return `<div class="stack" style="gap:8px;width:100%">
          ${renderTutorScheduleBotHTML(req, st)}
          ${typeof renderLessonPaymentHTML === "function" ? renderLessonPaymentHTML(st, req, stuMatch) : ""}
          ${tmUrl ? `<a class="btn soft sm bid-telemost-join" href="${esc(tmUrl)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>Подключиться к Яндекс Телемосту</span></a>` : ""}
          ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
            ? EGE.kit.messengerLinksHTML({
                entity: contacts.entity,
                available: contacts.available,
                message: `Здравствуйте, ${req.studentName}! Подтверждаю урок (${req.subjectName}, ${req.dayLabel} в ${req.hour}) через Вектор.`,
                primaryTitle: "Написать ученику · WhatsApp",
                iconOnly: true,
                allowHoldAdd: true,
                compact: true
              })
            : `<button type="button" class="btn confirm sm" data-a="tc-req-msg" data-id="${esc(req.id)}">${icon("msg")}<span>Написать ученику</span></button>`}
          <div class="small muted tc-hold-hint">Удерживайте иконку, чтобы изменить контакт</div>
          ${typeof renderLessonNotifyHTML === "function" ? renderLessonNotifyHTML(st, req, stuMatch) : ""}
        </div>`;
      })() : isCompleted ? `
        <div class="stack" style="gap:6px;width:100%">
          <div class="small" style="color:var(--confirm)"><b>Урок завершён</b> · выплата <b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b> зачислена на баланс</div>
        </div>` : (!req.fromServer ? `
        <div class="row" style="gap:8px">
          <button type="button" class="btn soft sm" data-a="tc-req-restore" data-id="${esc(req.id)}">Вернуть в рассмотрение</button>
        </div>` : "")}
    </article>`;
  }

  function renderSlotsPanelHTML(st, TDATA, sp) {
    const targetSp = sp || getEditingSearchProfile(st);
    const activeDayObj = DAY_LIST.find((d) => d.dow === st.activeDow) || DAY_LIST[5];
    const slotsMap = normalizeSlotsMap(targetSp && targetSp.slots);
    const daySlots = Array.isArray(slotsMap[activeDayObj.dow]) ? slotsMap[activeDayObj.dow] : [];
    const totalSlotsCount = countSlots(slotsMap);
    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    return `<div class="stack tc-sp-slots-box" id="tc-sp-slots-box" role="region" aria-label="Свободные окна профиля 10:00–20:00">
      <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
        <div>
          <div class="eyebrow">4. Свободные окна профиля · 10:00–20:00</div>
          <h3 class="h2">Свободные окна (${totalSlotsCount})</h3>
        </div>
        <span class="chip accent num">${esc(activeDayObj.wd)}: ${daySlots.length} ч</span>
      </div>
      <div class="cal-days is-7days" aria-label="День недели">
        ${DAY_LIST.map((d) => {
          const cnt = Array.isArray(slotsMap[d.dow]) ? slotsMap[d.dow].length : 0;
          return `<button type="button" class="day-cir${st.activeDow === d.dow ? " on" : ""}" data-a="tc-day" data-dow="${d.dow}" aria-pressed="${st.activeDow === d.dow}">
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
      <span class="small muted">Слоты относятся к этому профилю поиска. Нажмите на час, чтобы открыть или закрыть запись на ${esc(activeDayObj.full.toLowerCase())}.</span>
    </div>`;
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

    const isProd = !isDevDemoMode();
    const ctxStore = getCtx().store;
    const isAuthed = !!(ctxStore && ctxStore.user);

    let cardsHtml = "";
    if (isProd && !isAuthed) {
      cardsHtml = `<div class="empty" id="tc-prod-auth-empty">
        <b>Войдите в аккаунт преподавателя</b>
        <span>После авторизации здесь появятся реальные заявки учеников, расписание уроков и ваш баланс на вывод.</span>
        <button type="button" class="btn sm" data-a="auth-modal-open">Войти или зарегистрироваться</button>
      </div>`;
    } else if (isProd && st._serverLoading && !st._serverLoaded) {
      cardsHtml = `<div class="empty" id="tc-requests-loading">
        <b>Загружаем заявки и данные кабинета…</b>
        <span>Получаем актуальный список бронирований и баланс эскроу с сервера.</span>
      </div>`;
    } else if (filteredReqs.length) {
      cardsHtml = `<div class="tc-req-list">${filteredReqs.map((r) => renderRequestCard(r, st, r.id === firstPendingId)).join("")}</div>`;
    } else if (isProd && allReqs.length === 0) {
      cardsHtml = `<div class="empty" id="tc-requests-empty">
        <b>Входящих заявок пока нет</b>
        <span>${st.published
          ? "Ваша анкета опубликована в каталоге — новые ставки и отклики учеников появятся здесь автоматически."
          : "Создайте профиль для поиска и откройте свободные окна во вкладке «Профиль»."}</span>
        <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
          ${!st.published
            ? `<button type="button" class="btn sm" data-a="tc-tab" data-tab="profile">Заполнить анкету</button>`
            : `<button type="button" class="btn soft sm" data-a="tc-tab" data-tab="leads">Запросы учеников</button>`}
          <button type="button" class="btn ghost sm" data-a="tc-refresh-server">Обновить</button>
        </div>
      </div>`;
    } else {
      cardsHtml = `<div class="empty">
        <b>По выбранному фильтру заявок нет</b>
        <span>${isProd ? "Сбросьте фильтр или обновите список заявок." : "Сбросьте фильтр или обновите пример заявок."}</span>
        <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
          <button type="button" class="btn soft sm" data-a="tc-req-tbl-filter" data-v="all">Показать все заявки</button>
          ${isProd ? "" : `<button type="button" class="btn ghost sm" data-a="tc-reset-demo">Сбросить демо</button>`}
        </div>
      </div>`;
    }

    const reqHeading = reqFilter === "pending"
      ? "Ожидающие заявки учеников"
      : reqFilter === "accepted"
        ? "Принятые заявки учеников"
        : "Входящие заявки учеников";

    return `<div class="stack" style="gap:16px">
      <section class="stack tc-req-section" id="tc-requests-table" aria-label="${reqHeading}">
        <h2 class="h2">${reqHeading}</h2>

        <div class="hh-seg equal tc-req-filter-seg" role="group" aria-label="Фильтр заявок">
          <button type="button" data-a="tc-req-tbl-filter" data-v="all" aria-pressed="${reqFilter === "all"}">Все (${allReqs.length})</button>
          <button type="button" data-a="tc-req-tbl-filter" data-v="pending" aria-pressed="${reqFilter === "pending"}">Ждут (${pendingList.length})</button>
          <button type="button" data-a="tc-req-tbl-filter" data-v="accepted" aria-pressed="${reqFilter === "accepted"}">Принято (${acceptedList.length})</button>
        </div>

        ${cardsHtml}
      </section>
    </div>`;
  }

  function renderProfileTab(st, TDATA, baseSplit) {
    syncProfileMirror(st);
    const acc = st.account || {};
    const spList = Array.isArray(st.searchProfiles) ? st.searchProfiles : [];
    const isCreating = !!st.creatingSearchProfile;
    const p = getEditingSearchProfile(st);
    const isEditingExisting = !isCreating && !!st.spEditorOpen && spList.some((item) => item && item.id === String(p.id || ""));
    const showEditor = isCreating || isEditingExisting;
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "bio", name: "Биология" }];
    const subjectNameOf = (ids) => {
      const cleanIds = Array.isArray(ids) && ids.length ? ids : ["bio"];
      if (TDATA && typeof TDATA.subjectNamesForIds === "function") {
        const res = TDATA.subjectNamesForIds(cleanIds);
        if (Array.isArray(res) && res.length) return res.join(" · ");
      }
      return cleanIds.map((sid) => {
        const hit = subjects.find((item) => item.id === sid);
        return hit ? hit.name : sid;
      }).filter(Boolean).join(" · ");
    };
    const mergedForMeter = Object.assign({}, acc, p);
    const comp = profileCompleteness(mergedForMeter, p.slots);
    const effSplit = (TDATA && typeof TDATA.commissionSplit === "function") ? TDATA.commissionSplit(p.price) : baseSplit;
    const previewCard = (showEditor && st.profilePreview && EGE.views.marketplace && typeof EGE.views.marketplace.tutorCardHTML === "function")
      ? EGE.views.marketplace.tutorCardHTML(buildMarketTutorPayload(st, p))
      : "";
    const accPhoto = acc.hasPhoto === false ? "" : String(acc.photo || "");
    const avHTML = typeof tutorAvatarHTML === "function"
      ? tutorAvatarHTML({ photo: accPhoto, name: acc.name }, { cls: "lg" })
      : `<span class="tutor-avatar lg is-no-photo"><span>Без фото</span></span>`;
    const remMs = autoBumpRemainingMs(st);
    const mRem = manualBumpRemainingMs(st);
    const lastAutoLabel = formatTimestamp(st.lastAutoBumpAt || st.lastBumpAt);
    const lastManualLabel = formatTimestamp(st.lastManualBumpAt);
    const ctxStore = getCtx().store || {};
    const ctxUser = ctxStore.user || null;
    const ctxLp = (ctxUser && ctxUser.linkedProviders) || {};
    const tgBot = ctxStore.telegramBinding && ctxStore.telegramBinding.chatId ? ctxStore.telegramBinding : null;
    const tgServerHandle = (tgBot && tgBot.telegramUsername ? "@" + tgBot.telegramUsername : "")
      || (ctxLp.telegram && ctxLp.telegram.username ? "@" + ctxLp.telegram.username : "")
      || (ctxUser && ctxUser.authProvider === "telegram" && ctxUser.username ? "@" + ctxUser.username : "");
    const tgServerLinked = Boolean(tgBot || (ctxUser && ctxUser.authProvider === "telegram") || (ctxLp.telegram && ctxLp.telegram.connected));

    const hasManualTg = String(acc.telegram || "").trim().length >= 3;
    const tgLinked = hasManualTg || tgServerLinked;
    const waLinked = String(acc.whatsapp || "").replace(/\D+/g, "").length >= 10;
    const maxLinked = String(acc.maxHandle || "").trim().length >= 2;
    const vkLinked = String(acc.vk || "").trim().length >= 2;
    const linkedCount = [tgLinked, waLinked, maxLinked, vkLinked].filter(Boolean).length;
    const tgSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 4L3.6 10.9c-.8.3-.8 1.5.1 1.7l4.5 1.4 1.7 5.2c.2.7 1.1.9 1.6.3l2.6-2.8 4.4 3.2c.6.4 1.4.1 1.6-.6L22 5.2c.2-.8-.4-1.4-1-1.2z"/><path d="M8.2 14l9.6-6.2"/></svg>`;
    const waSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L4 20l1.2-4.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M9.5 9.2c.3 2 2 3.8 4 4.3l1.2-.9c.3-.2.7-.2 1 0l1 .6"/></svg>`;
    const maxSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="14" rx="5"/><path d="M8 14.5v-5l4 3.5 4-3.5v5"/></svg>`;
    const vkSvg = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12.78 17.5c-5.47 0-8.59-3.75-8.72-10h2.74c.09 4.58 2.11 6.52 3.71 6.92V7.5h2.58v3.95c1.58-.17 3.24-1.97 3.8-3.95h2.58c-.43 2.44-2.23 4.24-3.51 4.98 1.28.6 3.33 2.17 4.11 5.02h-2.84c-.61-1.9-2.13-3.37-4.14-3.57v3.57h-.31z"/></svg>`;
    const tgVal = formatTelegram(acc.telegram || tgServerHandle || "");
    const waVal = formatPhone(acc.whatsapp || "") || String(acc.whatsapp || "").trim();
    const maxVal = String(acc.maxHandle || "").trim();
    const vkVal = String(acc.vk || "").trim();
    const openCh = String(st.msgrLinkOpen || "");
    const linkDrafts = st.msgrLinkDraft && typeof st.msgrLinkDraft === "object" ? st.msgrLinkDraft : {};
    const waInp = (EGE.phoneField && typeof EGE.phoneField.phoneFieldHTML === "function")
      ? EGE.phoneField.phoneFieldHTML({ scope: "tc-hh-wa", id: "tc-hh-wa", name: "whatsapp", label: "", value: linkDrafts.whatsapp != null ? linkDrafts.whatsapp : (acc.whatsapp || ""), country: linkDrafts.whatsappCountry || acc.whatsappCountry || "RU", extraAttrs: 'data-tc="whatsapp" aria-label="Номер телефона WhatsApp"', compact: true })
      : `<div class="field"><input class="input num" id="tc-hh-wa" name="whatsapp" data-tc="whatsapp" aria-label="Номер телефона WhatsApp" value="${esc(formatPhone(linkDrafts.whatsapp != null ? linkDrafts.whatsapp : (acc.whatsapp || "")))}" maxlength="22" placeholder="+7 (914) 000-00-00"></div>`;
    const msgrRow = (ch, cls, svg, title, linked, displayVal, fieldHtml, canUnlink) => {
      const isEditing = !linked && openCh === ch;
      return `<div class="stu-link-row${linked ? " is-linked" : ""}${isEditing ? " is-editing" : ""} tc-link-row" data-ch="${ch}">
        <div class="stu-link-brand">
          <span class="stu-link-icon ${cls}" aria-hidden="true">${svg}</span>
          <div class="stu-link-copy">
            <div class="stu-link-title">
              <b>${title}</b>
              ${linked ? `<span class="chip good stu-link-badge">Привязан ✓</span>` : ""}
            </div>
            ${linked ? `<span class="small muted">${esc(displayVal || "Подключён")}</span>` : ""}
          </div>
        </div>
        <div class="stu-link-act">
          ${linked
            ? (canUnlink !== false ? `<button type="button" class="btn ghost sm tc-msgr-act is-unlink" data-a="tc-messenger-unlink" data-ch="${ch}">Отвязать</button>` : "")
            : isEditing
              ? `<div class="stu-link-inline">
                  ${fieldHtml}
                  <button type="button" class="btn sm" data-a="tc-messenger-link" data-ch="${ch}">Привязать</button>
                  <button type="button" class="btn ghost sm" data-a="tc-messenger-cancel">Отмена</button>
                </div>`
              : `<button type="button" class="btn soft sm" data-a="tc-messenger-open" data-ch="${ch}">Привязать ${title}</button>`}
        </div>
      </div>`;
    };

    const accountSectionHTML = `<section class="stack tc-account-section" id="tc-account-section">
      <div class="tc-photo-row">
        <div class="tc-photo-top">
          ${avHTML}
          <div class="stack" style="gap:4px;min-width:0">
            <b>${accPhoto ? "Фото загружено в аккаунт" : "Сейчас отображается «Без фото»"}</b>
            <span class="small muted">Загрузите своё фото — оно обновится во всех ваших анкетах в поиске, либо выберите «Без фото».</span>
          </div>
        </div>
        <div class="tc-photo-actions">
          <label class="btn soft sm" for="tc-photo-file" style="cursor:pointer">${icon("upload")}<span>Загрузить фото</span></label>
          <input type="file" id="tc-photo-file" accept="image/*" data-tc-photo="1" class="sr">
          <button type="button" class="btn ghost sm" data-a="tc-photo-clear"${accPhoto ? "" : " disabled"}>Без фото</button>
        </div>
      </div>

      <fieldset class="stu-notch-field">
        <legend><label for="tc-hh-name">Имя и фамилия</label></legend>
        <input class="stu-notch-input" id="tc-hh-name" name="name" data-tc="name" value="${esc(acc.name)}" maxlength="48" placeholder="${isDevDemoMode() ? "Анна Соколова" : "Имя и фамилия"}">
      </fieldset>

      <div class="tc-two-col">
        <div class="field">
          <span class="label">Город</span>
          <div class="hh-seg equal" role="group" aria-label="Выбор города">
            ${CITY_OPTIONS.map((c) => `<button type="button" data-a="tc-city-pick" data-v="${esc(c)}" aria-pressed="${(acc.city || "Якутск") === c}">${esc(c)}</button>`).join("")}
          </div>
        </div>
        <fieldset class="stu-notch-field is-select">
          <legend>Часовой пояс (UTC)</legend>
          ${typeof hhSelectHTML === "function"
            ? hhSelectHTML({
                id: "tc-timezone",
                options: TZ_OPTIONS,
                value: acc.timezone || "UTC+9",
                open: !!st.tzMenuOpen,
                toggleAction: "tc-tz-toggle",
                pickAction: "tc-tz-pick",
                ariaLabel: "Часовой пояс"
              })
            : `<select class="stu-notch-select" id="tc-timezone" data-tc="timezone">${TZ_OPTIONS.map((tz) => `<option value="${esc(tz.id)}"${(acc.timezone || "UTC+9") === tz.id ? " selected" : ""}>${esc(tz.label)}</option>`).join("")}</select>`}
        </fieldset>
      </div>

      <div class="tc-messengers-box" role="group" aria-label="Привязанные аккаунты">
        <div class="tc-messengers-head">
          <span class="tc-messengers-title">Привязанные аккаунты</span>
          <span class="tc-messengers-count num">${linkedCount} из 4</span>
        </div>
        <div class="stu-link-list tc-link-list">
          ${msgrRow("telegram", "is-tg", tgSvg, "Telegram", tgLinked, tgVal, `<input class="input" id="tc-hh-tg" name="telegram" data-tc="telegram" aria-label="Telegram логин или телефон" value="${esc(formatTelegram(linkDrafts.telegram != null ? linkDrafts.telegram : (acc.telegram || "")))}" maxlength="36" placeholder="@username или +7...">`, hasManualTg)}
          ${msgrRow("whatsapp", "is-wa", waSvg, "WhatsApp", waLinked, waVal, waInp)}
          ${msgrRow("maxHandle", "is-max", maxSvg, "MAX", maxLinked, maxVal, `<input class="input" id="tc-hh-max" name="maxHandle" data-tc="maxHandle" aria-label="MAX логин или ссылка" value="${esc(linkDrafts.maxHandle != null ? linkDrafts.maxHandle : (acc.maxHandle || ""))}" maxlength="48" placeholder="@username или max.ru/...">`)}
          ${msgrRow("vk", "is-vk", vkSvg, "ВКонтакте", vkLinked, vkVal, `<input class="input" id="tc-hh-vk" name="vk" data-tc="vk" aria-label="ВКонтакте ссылка или ID" value="${esc(linkDrafts.vk != null ? linkDrafts.vk : (acc.vk || ""))}" maxlength="64" placeholder="vk.com/username или @id">`)}
        </div>
      </div>
    </section>`;

    const activeSubjLabel = subjectNameOf(p.subjects && p.subjects.length ? p.subjects : [p.subject || "bio"]);
    const editorHTML = showEditor ? `<div class="stack tc-sp-editor" id="tc-sp-editor" style="gap:12px">
      <div class="tc-sp-editor-head">
        <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
          <b>${isCreating ? "Новый профиль для поиска" : `Настройка профиля: ${esc(activeSubjLabel)}`}</b>
          ${isCreating ? `<span class="chip accent">Черновик нового профиля</span>` : ""}
        </div>
        ${isCreating
          ? `<button type="button" class="btn ghost sm" data-a="tc-sp-cancel-new">Отмена</button>`
          : `<button type="button" class="btn ghost sm" data-a="tc-sp-close-edit">Свернуть</button>`}
      </div>

      <div class="card tc-prof-compact-card">
        <div class="tc-prof-compact-head">
          <b class="tc-compact-title">Заполненность профиля: <span class="num savings-gold-txt">${comp.pct}%</span></b>
          ${(p.published !== false && !isCreating) ? `<span class="chip confirm tc-compact-chip">✓ Опубликована для учеников</span>` : `<span class="chip notif tc-compact-chip">Черновик</span>`}
        </div>
        <div class="tc-hh-meter" aria-label="Прогресс заполнения профиля"><i style="width:${comp.pct}%"></i></div>
        <div class="tc-prof-compact-foot">
          <div class="tc-compact-note">${comp.missing.length ? "Осталось: " + esc(comp.missing.slice(0, 2).join(", ")) + "." : "Профиль на 100% — приоритет в поиске."}</div>
          <button type="button" class="btn soft sm tc-prof-preview-btn" data-a="tc-preview-toggle">${st.profilePreview ? "Скрыть превью" : "Как видит ученик"}</button>
        </div>
      </div>

      ${!isCreating ? `<div class="tc-autobump-card" aria-label="Продвижение анкеты в выдаче">
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
            <span>Всего поднятий: <b class="num" style="color:var(--ink)">${Number(st.bumpCount) || 0}</b></span>
          </div>
        </div>` : ""}
      </div>` : ""}

      ${previewCard ? `<div class="stack" style="gap:8px"><div class="eyebrow">Живой вид вашей карточки для учеников</div>${previewCard}</div>` : ""}

      <form class="stack tc-profile-form" style="gap:10px" data-f="tc-profile">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <h3 class="h2">1. Предметы и специализация профиля</h3>
          <span class="chip${p.price >= 1400 ? " pro" : " accent"}">${p.price >= 1400 ? "Эксперт выше рынка" : "Доступная ставка"}</span>
        </div>

        <fieldset class="stu-notch-field is-textarea">
          <legend><label for="tc-hh-headline">Заголовок специализации</label></legend>
          <textarea class="textarea tc-field-wrap" id="tc-hh-headline" name="headline" data-tc="headline" rows="2" maxlength="72" placeholder="Эксперт ЕГЭ по биологии · медвуз">${esc(p.headline || "")}</textarea>
        </fieldset>

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

        <div class="eyebrow" style="margin-top:4px">2. Опыт, квалификация и плашки</div>
        <div class="tc-exp-edu-grid">
          <fieldset class="stu-notch-field">
            <legend><label for="tc-hh-exp">Стаж, лет <span style="color:var(--bad)" aria-hidden="true">*</span></label></legend>
            <input class="stu-notch-input num" id="tc-hh-exp" name="expYears" data-tc="expYears" type="number" min="1" max="50" required value="${esc(p.expYears || 1)}">
          </fieldset>
          <fieldset class="stu-notch-field is-textarea">
            <legend><label for="tc-hh-edu">Образование и квалификация</label></legend>
            <textarea class="textarea tc-field-wrap" id="tc-hh-edu" name="education" data-tc="education" rows="2" maxlength="90" placeholder="ВУЗ, эксперт ЕГЭ, олимпиадная подготовка">${esc(p.education || "")}</textarea>
          </fieldset>
        </div>

        <div class="field">
          <fieldset class="stu-notch-field is-textarea">
            <legend><label for="tc-hh-skills">Ключевые навыки и акценты подготовки</label></legend>
            <textarea class="textarea tc-field-wrap" id="tc-hh-skills" name="customSkills" data-tc="customSkills" rows="2" maxlength="120" placeholder="Например: Генетика №28, разбор пробников ФИПИ, олимпиады">${esc(p.customSkills || "")}</textarea>
          </fieldset>
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
        <span class="small muted">Чистая выплата после 5% сбора: <b class="num savings-gold-txt">${effSplit.payout.toLocaleString("ru-RU")} ₽/ч</b>.</span>

        <fieldset class="stu-notch-field is-textarea">
          <legend><label for="tc-bio-full">О себе, программе и результатах учеников</label></legend>
          <textarea class="textarea" id="tc-bio-full" name="bio" data-tc="bio" rows="3" maxlength="320">${esc(p.bio || "")}</textarea>
        </fieldset>

        ${renderSlotsPanelHTML(st, TDATA, p)}

        <div class="row tc-profile-submit-row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn">${icon("check")}<span>${isCreating ? "Создать и опубликовать" : "Сохранить и опубликовать"}</span></button>
          <button type="button" class="btn soft" data-a="tc-sp-save-draft">${isCreating ? "Сохранить черновиком" : "Сохранить скрытым"}</button>
          ${isCreating ? `<button type="button" class="btn ghost" data-a="tc-sp-cancel-new">Отмена</button>` : ""}
        </div>
      </form>
    </div>` : "";

    const spCardsHTML = spList.length
      ? spList.map((item) => {
          const itemId = String(item.id || "");
          const isActive = isEditingExisting && itemId && itemId === String(p.id || "");
          const isPub = item.published !== false;
          const isConfirm = st.confirmDeleteProfileId === itemId;
          const subjLabel = subjectNameOf(item.subjects && item.subjects.length ? item.subjects : [item.subject || "bio"]);
          const exLabel = Array.isArray(item.exams) && item.exams.length ? item.exams.join(" · ") : "ЕГЭ";
          const fmLabel = Array.isArray(item.formats) && item.formats.length ? item.formats.join(" · ") : "Онлайн";
          const spSlotsCnt = countSlots(item.slots);
          return `<article class="card tc-sp-card${isActive ? " is-active is-editing" : ""}${isPub ? "" : " is-hidden"}">
            <div class="tc-sp-card-top">
              <div class="stack" style="gap:3px;min-width:0">
                <div class="tc-sp-title-row">
                  <b class="tc-sp-subj">${esc(subjLabel)}</b>
                  <span class="chip ${isPub ? "confirm" : "tc-sp-off-chip"} tc-sp-status">${isPub ? "✓ В поиске" : "Скрыт"}</span>
                </div>
                <div class="tc-sp-headline">${esc(item.headline || "Специализация не указана")}</div>
              </div>
              <div class="tc-sp-price num">${Number(item.price || 1200).toLocaleString("ru-RU")} ₽/ч</div>
            </div>
            <div class="tc-sp-card-meta small muted">
              <span>${esc(exLabel)}</span>
              <span aria-hidden="true">·</span>
              <span>${esc(fmLabel)}</span>
              <span aria-hidden="true">·</span>
              <span class="num">${spSlotsCnt > 0 ? `${spSlotsCnt} ${plural(spSlotsCnt, "окно", "окна", "окон")}` : "нет окон"}</span>
              ${item.minFair ? `<span aria-hidden="true">·</span><span class="num">торг от ${Number(item.minFair).toLocaleString("ru-RU")} ₽</span>` : ""}
            </div>
            <div class="tc-sp-card-actions${isConfirm ? " is-confirming" : ""}">
              ${isConfirm
                ? `<div class="tc-sp-confirm">
                    <span class="tc-sp-confirm-label">Удалить профиль?</span>
                    <div class="tc-sp-confirm-btns">
                      <button type="button" class="btn ghost sm" data-a="tc-sp-delete-cancel">Отмена</button>
                      <button type="button" class="btn bad sm" data-a="tc-sp-delete-confirm" data-id="${esc(itemId)}">Удалить</button>
                    </div>
                  </div>`
                : `<button type="button" class="btn ${isActive ? "" : "soft "}sm tc-sp-edit-btn" data-a="tc-sp-select" data-id="${esc(itemId)}" aria-expanded="${isActive}">${isActive ? "Свернуть" : "Редактировать"}</button>
                   <button type="button" class="btn ghost sm tc-sp-pub-btn" data-a="tc-sp-toggle-pub" data-id="${esc(itemId)}">${isPub ? "Скрыть" : "В поиск"}</button>
                   <button type="button" class="btn ghost sm tc-sp-del-btn" data-a="tc-sp-delete-ask" data-id="${esc(itemId)}">Удалить</button>`}
            </div>
            ${isActive ? editorHTML : ""}
          </article>`;
        }).join("")
      : `<div class="card pad stack tc-sp-empty">
          <b>Пока нет профилей для поиска</b>
          <span class="small muted">Создайте первый профиль с предметом, ставкой и форматом занятий, чтобы ученики находили вас в каталоге.</span>
          ${isCreating ? "" : `<div><button type="button" class="btn sm" data-a="tc-sp-new">+ Создать первый профиль</button></div>`}
        </div>`;

    return `<div class="stack" style="gap:16px">
      ${(!isDevDemoMode() && !ctxUser)
        ? `<div class="card pad stack" id="tc-profile-auth-note" style="gap:8px;background:var(--surface-2);box-shadow:none">
            <span class="small ink2">Войдите в аккаунт преподавателя, чтобы сохранить данные и опубликовать профили в живом каталоге.</span>
            <div><button type="button" class="btn sm" data-a="auth-modal-open">Войти или зарегистрироваться</button></div>
          </div>`
        : ""}
      ${accountSectionHTML}
      <section class="stack tc-sp-section" id="tc-search-profiles-section" style="gap:12px">
        <div class="tc-section-head">
          <div class="stack" style="gap:3px;min-width:0">
            <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
              <span class="eyebrow">ПОИСКОВЫЕ ПРОФИЛИ</span>
              <span class="chip num">${spList.length} из 10</span>
            </div>
            <h2 class="h2" style="margin:0">Профили для поиска</h2>
            <span class="small muted">Можно создать несколько карточек под разные предметы, экзамены и ставки — заявки по ним придут в единый кабинет.</span>
          </div>
          <button type="button" class="btn sm tc-sp-new-btn" data-a="tc-sp-new"${spList.length >= 10 || isCreating ? " disabled" : ""}>+ Новый профиль</button>
        </div>
        <div class="tc-sp-list">${spCardsHTML}</div>
        ${isCreating ? `<div class="card tc-sp-draft-wrap">${editorHTML}</div>` : ""}
      </section>
    </div>`;
  }

  const VERIF_DOC_TYPES = [
    ["diploma", "Диплом о высшем образовании"],
    ["ege_expert", "Сертификат эксперта ЕГЭ / ФИПИ"],
    ["certificate", "Диплом или сертификат курса"],
    ["other", "Другой документ"]
  ];

  function ensureVerificationsLoaded(st) {
    const ctxStore = getCtx().store;
    if (!ctxStore || !ctxStore.backend || !ctxStore.user || !EGE.api || !EGE.api.verifications) return;
    if (st._verifLoaded || st._verifLoading) return;
    st._verifLoading = true;
    EGE.api.verifications.list().then((res) => {
      st._verifLoading = false;
      st._verifLoaded = true;
      if (res && Array.isArray(res.verifications)) {
        st.verifications = res.verifications;
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
    }).catch(() => {
      st._verifLoading = false;
      st._verifLoaded = true;
    });
  }

  function renderVerificationBlockHTML(st) {
    ensureVerificationsLoaded(st);
    const ctxStore = getCtx().store;
    const isAuth = !!(ctxStore && ctxStore.backend && ctxStore.user);
    const draft = st.verifDraft || (st.verifDraft = { docType: "diploma", title: "" });
    const items = Array.isArray(st.verifications) ? st.verifications : [];
    const hasApproved = items.some((v) => v.status === "approved");
    const statusMap = {
      pending: { cls: "warn", label: "На проверке" },
      approved: { cls: "confirm", label: "Одобрен · синяя галочка" },
      rejected: { cls: "bad", label: "Отклонён" }
    };

    return `<div class="stack" id="tc-verification-sec" style="gap:12px;margin-top:8px;padding-top:16px;border-top:1px solid var(--line)">
      <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
        <div class="stack" style="gap:2px">
          <div class="eyebrow">4. Верификация документов и синяя галочка</div>
          <span class="small muted">Загрузите диплом или сертификат эксперта (PDF, JPG, PNG, WebP до 10 МБ) для проверки модератором.</span>
        </div>
        <span class="chip ${hasApproved ? "confirm" : "accent"}">${hasApproved ? "Проверенный преподаватель" : (items.length ? "На модерации" : "Не проверено")}</span>
      </div>

      ${isAuth ? `<div class="tc-photo-row">
        <div class="tc-two-col">
          <div class="field">
            <label for="tc-verif-type">Тип документа</label>
            <select class="select" id="tc-verif-type" data-tc="verifDocType">
              ${VERIF_DOC_TYPES.map(([k, lbl]) => `<option value="${esc(k)}"${draft.docType === k ? " selected" : ""}>${esc(lbl)}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="tc-verif-title">Название / номер</label>
            <input class="input" id="tc-verif-title" data-tc="verifTitle" maxlength="100" value="${esc(draft.title || "")}" placeholder="Например: Диплом МГУ · Биофак">
          </div>
        </div>
        <div class="tc-photo-actions">
          <label class="btn soft sm" for="tc-diploma-file" style="cursor:pointer">${icon("upload")}<span>Загрузить скан документа</span></label>
          <input type="file" id="tc-diploma-file" accept=".pdf,image/jpeg,image/png,image/webp" data-tc-diploma-file="1" class="sr">
          <button type="button" class="btn ghost sm" data-a="tc-verif-refresh">Обновить статус</button>
        </div>
      </div>` : `<div class="card pad stack" style="gap:8px;background:var(--surface-2);box-shadow:none">
        <span class="small ink2">Войдите в аккаунт преподавателя, чтобы загрузить диплом на серверную проверку и получить синюю галочку в каталоге.</span>
        <div><button type="button" class="btn soft sm" data-a="auth-modal-open">Войти для загрузки</button></div>
      </div>`}

      ${items.length ? `<div class="stack" style="gap:8px">
        ${items.map((v) => {
          const meta = statusMap[v.status] || statusMap.pending;
          return `<div class="row between" style="gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--line);background:var(--surface-2);flex-wrap:wrap;align-items:center">
            <div class="stack" style="gap:2px;min-width:0">
              <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
                <b style="font-size:13.5px">${esc(v.title || v.originalFilename || v.docType)}</b>
                <span class="chip ${meta.cls}">${esc(meta.label)}</span>
              </div>
              <span class="small muted">${esc(v.originalFilename || "")} · ${(Math.max(1, Math.round((Number(v.sizeBytes) || 0) / 1024))).toLocaleString("ru-RU")} КБ${v.reviewNote ? ` · Комментарий: ${esc(v.reviewNote)}` : ""}</span>
            </div>
            ${v.fileUrl ? `<a href="${esc(v.fileUrl)}" target="_blank" rel="noopener" class="btn ghost sm">Открыть</a>` : ""}
          </div>`;
        }).join("")}
      </div>` : ""}
    </div>`;
  }


  function isServerProfileId(rawId) {
    const id = String(rawId || "").trim();
    return Boolean(id && id !== "tc-my-profile" && id.indexOf("tc-sp-") !== 0);
  }

  function refreshPublicTutorsFromServer() {
    const TDATA = getTDATA();
    if (TDATA && typeof TDATA.syncServerTutors === "function" && EGE.api && EGE.api.tutors && typeof EGE.api.tutors.list === "function") {
      EGE.api.tutors.list({ limit: 200 }).then((lr) => {
        if (lr && Array.isArray(lr.tutors)) {
          TDATA.syncServerTutors(lr.tutors, { replace: !isDevDemoMode() });
        }
      }).catch(() => {});
    }
  }

  function buildUpsertProfilePayload(st, spOverride) {
    syncProfileMirror(st);
    const acc = st.account || {};
    const p = spOverride || getEditingSearchProfile(st);
    const tp = buildMarketTutorPayload(st, p);
    const badges = (Array.isArray(p.customBadges) ? p.customBadges : [])
      .map((b) => String(b || "").trim().slice(0, 36))
      .filter(Boolean)
      .slice(0, 2);
    const srvId = isServerProfileId(p.id) ? String(p.id) : null;
    const hasPhoto = acc.hasPhoto !== false && Boolean(acc.photo);
    return {
      id: srvId,
      name: String(acc.name || p.name || "").trim(),
      headline: p.headline || "",
      photo: hasPhoto ? String(acc.photo || "") : "",
      hasPhoto,
      subject: tp.subject,
      subjectName: tp.subjectName,
      subjects: tp.subjects,
      exams: tp.exams,
      formats: tp.formats,
      city: tp.city,
      timezone: tp.timezone,
      whatsapp: acc.whatsapp || "",
      telegram: acc.telegram || "",
      maxHandle: acc.maxHandle || "",
      vk: acc.vk || "",
      education: p.education || "",
      expYears: Number(p.expYears) || 1,
      avgScore: Number(p.avgScore) >= 40 ? Number(p.avgScore) : 85,
      price: Number(p.price) || 1200,
      minFair: Number(p.minFair) || 0,
      marketPrice: tp.marketPrice,
      customSkills: p.customSkills || "",
      customBadges: badges,
      bio: p.bio || "",
      firstLessonGuarantee: p.firstLessonGuarantee !== false,
      published: p.published !== false,
      slots: normalizeSlotsMap(p.slots)
    };
  }

  function persistTutorAccountToServer(st, opts) {
    opts = opts || {};
    const ctxStore = getCtx().store;
    if (!ctxStore || !ctxStore.backend || !ctxStore.user || !EGE.api || !EGE.api.tutor || typeof EGE.api.tutor.updateAccount !== "function") {
      return null;
    }
    const acc = (st && st.account) || {};
    const cleanName = String(acc.name || "").trim();
    if (cleanName.length < 2) {
      if (!opts.silent && typeof getCtx().toast === "function") {
        getCtx().toast("Укажите имя и фамилию преподавателя (минимум 2 символа)");
      }
      return null;
    }
    const hasPhoto = acc.hasPhoto !== false && Boolean(acc.photo);
    const payload = {
      name: cleanName,
      city: acc.city || "Якутск",
      timezone: acc.timezone || ((acc.city === "Москва") ? "UTC+3" : "UTC+9"),
      photo: hasPhoto ? String(acc.photo || "") : "",
      hasPhoto,
      whatsapp: acc.whatsapp || "",
      telegram: acc.telegram || "",
      maxHandle: acc.maxHandle || "",
      vk: acc.vk || ""
    };
    return EGE.api.tutor.updateAccount(payload).then((res) => {
      if (res && res.user && ctxStore.user) {
        Object.assign(ctxStore.user, res.user);
      }
      if (res && res.account) {
        if (!ctxStore.docs || typeof ctxStore.docs !== "object") ctxStore.docs = {};
        ctxStore.docs.profile = Object.assign({}, ctxStore.docs.profile || {}, res.account);
      }
      if (res && Array.isArray(res.profiles)) {
        applyServerProfiles(res.profiles, st, res.account || (ctxStore.docs && ctxStore.docs.profile));
      }
      saveState();
      refreshPublicTutorsFromServer();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (!opts.silent && typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Данные аккаунта сохранены", "Имя, контакты и город обновлены во всех профилях поиска.");
      }
      return res;
    }).catch((err) => {
      if (!opts.silent && typeof getCtx().toast === "function") {
        getCtx().toast((err && err.message) || "Не удалось сохранить данные аккаунта");
      }
      return null;
    });
  }

  const _profileSaveSeq = {};

  function persistTutorProfileToServer(st, spOverride, opts) {
    if (spOverride && !opts && (Object.prototype.hasOwnProperty.call(spOverride, "silent") || Object.prototype.hasOwnProperty.call(spOverride, "createNew"))) {
      opts = spOverride;
      spOverride = null;
    }
    opts = opts || {};
    const ctxStore = getCtx().store;
    if (!ctxStore || !ctxStore.backend || !ctxStore.user || !EGE.api || !EGE.api.tutor) return null;
    const acc = st && st.account;
    if (!acc || String(acc.name || "").trim().length < 2) {
      if (!opts.silent && typeof getCtx().toast === "function") {
        getCtx().toast("Сначала заполните имя в блоке «Мой аккаунт» (минимум 2 символа)");
      }
      return null;
    }
    const sp = spOverride || getEditingSearchProfile(st);
    const payload = buildUpsertProfilePayload(st, sp);
    const isNew = Boolean(opts.createNew || !payload.id);
    const seqKey = String(payload.id || opts.replaceLocalId || "__new__");
    const mySeq = (_profileSaveSeq[seqKey] = (_profileSaveSeq[seqKey] || 0) + 1);
    const callProm = (isNew && typeof EGE.api.tutor.createProfile === "function")
      ? EGE.api.tutor.createProfile(payload)
      : ((!isNew && typeof EGE.api.tutor.updateProfile === "function")
        ? EGE.api.tutor.updateProfile(payload.id, payload)
        : EGE.api.tutor.upsertProfile(payload));
    return callProm.then((res) => {
      if (opts.silent && _profileSaveSeq[seqKey] !== mySeq) return res;
      if (opts.replaceLocalId) {
        st.searchProfiles = (st.searchProfiles || []).filter((item) => item && item.id !== opts.replaceLocalId);
      }
      if (res && res.tutor && res.tutor.id) {
        if (opts.silent && (st.creatingSearchProfile || (st.activeSearchProfileId && st.activeSearchProfileId !== String(res.tutor.id)))) {
          const idx = (st.searchProfiles || []).findIndex((item) => item && item.id === res.tutor.id);
          if (idx >= 0 && res.tutor.slots) {
            st.searchProfiles[idx].slots = normalizeSlotsMap(res.tutor.slots);
          }
        } else {
          applyServerProfile(res.tutor, st, { syncAccount: false });
        }
        saveState();
      }
      refreshPublicTutorsFromServer();
      if (!opts.silent) hydrateFromBackend({ force: true });
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return res;
    }).catch((err) => {
      if (opts.replaceLocalId && !isDevDemoMode()) {
        st.searchProfiles = (st.searchProfiles || []).filter((item) => item && item.id !== opts.replaceLocalId);
        if (st.activeSearchProfileId === opts.replaceLocalId) {
          st.activeSearchProfileId = (st.searchProfiles[0] && st.searchProfiles[0].id) || "";
        }
        syncProfileMirror(st);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      if (!opts.silent && typeof getCtx().toast === "function") {
        getCtx().toast((err && err.message) || "Не удалось сохранить профиль для поиска на сервере");
      }
      return null;
    });
  }

  function renderCommTab() {
    const mApi = EGE.views && EGE.views.messenger;
    if (mApi && typeof mApi.hydrateFromBackend === "function") {
      mApi.hydrateFromBackend(false);
    }
    const wsHTML = mApi && typeof mApi.renderCommWorkspaceHTML === "function"
      ? mApi.renderCommWorkspaceHTML({ compact: false })
      : `<div class="empty"><b>Чаты временно недоступны</b></div>`;
    return wsHTML;
  }

  function viewCabinet() {
    ensureCountdownTimer();
    ensureRealtimeConnected();
    ensureServerHydrated();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const allReqs = syncedRequests();
    const pendingList = allReqs.filter((r) => r.status === "pending");
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(p.price) : { total: p.price, fee: Math.round(p.price * 0.05), sbpFee: Math.round(p.price * 0.01), payout: Math.max(0, p.price - Math.round(p.price * 0.05) - Math.round(p.price * 0.01)), pct: 5, sbpPct: 1 };
    const normalizedTab = st.tab === "calendar" ? "students" : st.tab;
    const activeTab = ["requests", "leads", "profile", "students", "comm"].includes(normalizedTab) ? normalizedTab : "requests";

    let bodyHTML = "";
    if (activeTab === "leads") bodyHTML = renderLeadsTab(st, TDATA);
    else if (activeTab === "profile") bodyHTML = renderProfileTab(st, TDATA, baseSplit);
    else if (activeTab === "students") bodyHTML = renderCalendarTab(st, TDATA, allReqs);
    else if (activeTab === "comm") bodyHTML = renderCommTab(st);
    else bodyHTML = renderRequestsTab(st, TDATA, allReqs, pendingList, acceptedList, baseSplit);

    return bodyHTML;
  }


  function handleAction(act, el) {
    const st = tState();
    const d = (el && el.dataset) || {};
    const id = d.id || "";

    if (act === "tc-tab") {
      const rawTab = d.tab === "calendar" ? "students" : d.tab;
      const nextTab = ["requests", "leads", "profile", "students", "comm"].includes(rawTab) ? rawTab : "requests";
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
      const sp = getEditingSearchProfile(st);
      sp.bumpedToday = true;
      st.bumpedToday = true;
      st.lastManualBumpAt = Date.now();
      st.bumpCount = (Number(st.bumpCount) || 0) + 1;
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      const ctxStore = getCtx().store;
      if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor) {
        EGE.api.tutor.bump(isServerProfileId(sp.id) ? sp.id : undefined).catch(() => {});
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Анкета поднята в топ (0 ₽)", "Следующее ручное поднятие будет доступно через 4 часа.");
      }
      return true;
    }

    if (act === "tc-account-save") {
      if (!st.account || typeof st.account !== "object") st.account = {};
      if (typeof document !== "undefined" && typeof document.getElementById === "function") {
        const nameEl = document.getElementById("tc-hh-name");
        if (nameEl && typeof nameEl.value === "string") st.account.name = nameEl.value.trim().slice(0, 48);
        const tgEl = document.getElementById("tc-hh-tg");
        if (tgEl && typeof tgEl.value === "string") st.account.telegram = tgEl.value.trim() ? formatTelegram(tgEl.value) : "";
        const waEl = document.getElementById("tc-hh-wa");
        if (waEl && typeof waEl.value === "string") {
          const digits = waEl.value.replace(/\D+/g, "");
          st.account.whatsapp = digits.length >= 10 ? formatPhone(waEl.value) : "";
        }
        const maxEl = document.getElementById("tc-hh-max");
        if (maxEl && typeof maxEl.value === "string") st.account.maxHandle = maxEl.value.trim().slice(0, 48);
        const vkEl = document.getElementById("tc-hh-vk");
        if (vkEl && typeof vkEl.value === "string") st.account.vk = vkEl.value.trim().slice(0, 64);
      }
      if (String(st.account.name || "").trim().length < 2) {
        if (typeof getCtx().toast === "function") getCtx().toast("Укажите имя и фамилию преподавателя (минимум 2 символа)");
        return true;
      }
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      const ctxStore = getCtx().store;
      if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor && typeof EGE.api.tutor.updateAccount === "function") {
        persistTutorAccountToServer(st, { silent: false });
      } else {
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().notifySide === "function") {
          getCtx().notifySide("Данные аккаунта сохранены", `${st.account.name} · настройки применены ко всем профилям поиска.`);
        }
      }
      return true;
    }

    if (act === "tc-sp-new") {
      const spList = Array.isArray(st.searchProfiles) ? st.searchProfiles : [];
      if (spList.length >= 10) {
        if (typeof getCtx().toast === "function") getCtx().toast("Можно создать не более 10 профилей для поиска");
        return true;
      }
      st.spEditorOpen = false;
      st.creatingSearchProfile = true;
      st.newProfileDraft = createEmptySearchProfile(st.account, { published: true });
      st.confirmDeleteProfileId = null;
      st.profilePreview = false;
      syncProfileMirror(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof document !== "undefined" && typeof setTimeout === "function") {
        setTimeout(() => {
          const ed = document.getElementById("tc-sp-editor");
          if (ed && typeof ed.scrollIntoView === "function") ed.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 30);
      }
      return true;
    }

    if (act === "tc-sp-cancel-new") {
      st.creatingSearchProfile = false;
      st.spEditorOpen = false;
      st.newProfileDraft = null;
      st.profilePreview = false;
      syncProfileMirror(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sp-close-edit") {
      st.spEditorOpen = false;
      st.profilePreview = false;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sp-select") {
      const tid = String(d.id || "");
      if (tid && (st.searchProfiles || []).some((item) => item && item.id === tid)) {
        if (st.spEditorOpen && !st.creatingSearchProfile && st.activeSearchProfileId === tid) {
          st.spEditorOpen = false;
          st.profilePreview = false;
        } else {
          st.creatingSearchProfile = false;
          st.newProfileDraft = null;
          st.activeSearchProfileId = tid;
          st.spEditorOpen = true;
          st.profilePreview = false;
        }
        st.confirmDeleteProfileId = null;
        syncProfileMirror(st);
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-sp-toggle-pub") {
      const tid = String(d.id || "");
      const target = (st.searchProfiles || []).find((item) => item && item.id === tid);
      if (!target) return true;
      const nextPub = target.published === false;
      target.published = nextPub;
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      const ctxStore = getCtx().store;
      if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor && typeof EGE.api.tutor.setProfilePublished === "function" && isServerProfileId(tid)) {
        EGE.api.tutor.setProfilePublished(tid, nextPub).then((res) => {
          if (res && res.tutor) {
            target.published = res.tutor.published !== false;
            syncProfileMirror(st);
            syncPublishedTutor(st);
            saveState();
          }
          refreshPublicTutorsFromServer();
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        }).catch((err) => {
          target.published = !nextPub;
          syncProfileMirror(st);
          syncPublishedTutor(st);
          saveState();
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
          if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось изменить статус профиля");
        });
      }
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast(nextPub ? "Профиль показан в поиске" : "Профиль скрыт из поиска");
      return true;
    }

    if (act === "tc-sp-delete-ask") {
      st.confirmDeleteProfileId = String(d.id || "") || null;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sp-delete-cancel") {
      st.confirmDeleteProfileId = null;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-sp-delete-confirm") {
      const tid = String(d.id || "");
      st.confirmDeleteProfileId = null;
      if (!tid) return true;
      const applyLocalRemove = () => {
        st.searchProfiles = (st.searchProfiles || []).filter((item) => item && item.id !== tid);
        if (st.activeSearchProfileId === tid) {
          st.activeSearchProfileId = (st.searchProfiles[0] && st.searchProfiles[0].id) || "";
          st.spEditorOpen = false;
          st.profilePreview = false;
        }
        const TDATA = getTDATA();
        if (TDATA && typeof TDATA.removeCustomTutor === "function") TDATA.removeCustomTutor(tid);
        syncProfileMirror(st);
        saveState();
      };
      const ctxStore = getCtx().store;
      if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor && typeof EGE.api.tutor.deleteProfile === "function" && isServerProfileId(tid)) {
        EGE.api.tutor.deleteProfile(tid).then((res) => {
          if (res && res.archived) {
            const target = (st.searchProfiles || []).find((item) => item && item.id === tid);
            if (target) target.published = false;
            syncProfileMirror(st);
            syncPublishedTutor(st);
            saveState();
            if (typeof getCtx().toast === "function") getCtx().toast("У профиля есть история заявок — он скрыт из поиска (архивирован)");
          } else {
            applyLocalRemove();
            if (typeof getCtx().toast === "function") getCtx().toast("Профиль для поиска удалён");
          }
          refreshPublicTutorsFromServer();
          hydrateFromBackend({ force: true });
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        }).catch((err) => {
          if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось удалить профиль");
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        });
        return true;
      }
      applyLocalRemove();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast("Профиль для поиска удалён");
      return true;
    }

    if (act === "tc-sp-save-draft") {
      const domForm = (typeof document !== "undefined" && typeof document.querySelector === "function")
        ? document.querySelector('[data-f="tc-profile"]')
        : null;
      return submitSearchProfileForm(st, domForm, { published: false });
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

    if (act === "tc-messenger-cancel") {
      st.msgrLinkOpen = "";
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-messenger-open" || act === "tc-messenger-link" || act === "tc-messenger-unlink") {
      const ch = String((el && el.dataset && el.dataset.ch) || "");
      const metaMap = {
        telegram: { label: "Telegram", inputId: "tc-hh-tg" },
        whatsapp: { label: "WhatsApp", inputId: "tc-hh-wa" },
        maxHandle: { label: "MAX", inputId: "tc-hh-max" },
        vk: { label: "ВКонтакте", inputId: "tc-hh-vk" }
      };
      const meta = metaMap[ch];
      if (!meta) return false;
      const acc = st.account || (st.account = {});
      if (act === "tc-messenger-open") {
        st.msgrLinkOpen = ch;
        if (!st.msgrLinkDraft || typeof st.msgrLinkDraft !== "object") st.msgrLinkDraft = {};
        if (st.msgrLinkDraft[ch] == null) st.msgrLinkDraft[ch] = String(acc[ch] || "");
        if (ch === "whatsapp" && !st.msgrLinkDraft.whatsappCountry) {
          st.msgrLinkDraft.whatsappCountry = acc.whatsappCountry || "RU";
        }
        const ctxUi = getCtx().ui;
        if (ctxUi) ctxUi.focusNext = meta.inputId;
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        return true;
      }
      if (act === "tc-messenger-unlink") {
        acc[ch] = "";
        if (st.msgrLinkDraft) {
          delete st.msgrLinkDraft[ch];
          if (ch === "whatsapp") delete st.msgrLinkDraft.whatsappCountry;
        }
        if (st.msgrLinkOpen === ch) st.msgrLinkOpen = "";
        syncProfileMirror(st);
        syncPublishedTutor(st);
        saveState();
        persistTutorAccountToServer(st, { silent: true });
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().notifySide === "function") {
          getCtx().notifySide(`Аккаунт ${meta.label} отвязан`, "Вы можете привязать его снова в профиле.");
        }
        return true;
      }
      const domInp = (typeof document !== "undefined" && typeof document.getElementById === "function")
        ? document.getElementById(meta.inputId)
        : null;
      const rawDraft = st.msgrLinkDraft && st.msgrLinkDraft[ch] != null ? String(st.msgrLinkDraft[ch]) : "";
      const rawVal = (domInp && typeof domInp.value === "string" && domInp.value.trim())
        ? domInp.value
        : (rawDraft.trim() ? rawDraft : String(acc[ch] || ""));
      let nextVal = "";
      let nextWaCountry = acc.whatsappCountry || "RU";
      if (rawVal.trim()) {
        if (ch === "telegram") nextVal = formatTelegram(rawVal);
        else if (ch === "whatsapp") {
          const pf = EGE.phoneField;
          if (pf && typeof pf.formatPhoneForCountry === "function") {
            const stPf = typeof pf.getPhoneFieldState === "function" ? pf.getPhoneFieldState("tc-hh-wa", (st.msgrLinkDraft && st.msgrLinkDraft.whatsappCountry) || acc.whatsappCountry || "RU") : null;
            const parsed = pf.formatPhoneForCountry(rawVal, (stPf && stPf.country) || (st.msgrLinkDraft && st.msgrLinkDraft.whatsappCountry) || acc.whatsappCountry || "RU");
            nextVal = parsed.formatted;
            nextWaCountry = parsed.country.code;
          } else {
            nextVal = formatPhone(rawVal);
          }
        } else if (ch === "maxHandle") {
          nextVal = rawVal.trim().slice(0, 48);
        } else if (ch === "vk") {
          nextVal = rawVal.trim().slice(0, 64);
        }
      }
      const curVal = String(nextVal || "").trim();
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
      acc[ch] = curVal;
      if (ch === "whatsapp") acc.whatsappCountry = nextWaCountry;
      st.msgrLinkOpen = "";
      if (st.msgrLinkDraft) {
        delete st.msgrLinkDraft[ch];
        if (ch === "whatsapp") delete st.msgrLinkDraft.whatsappCountry;
      }
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      persistTutorAccountToServer(st, { silent: true });
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(`Аккаунт ${meta.label} привязан`, `Мы сможем настроить уведомления для вас в ${meta.label}.`);
      }
      return true;
    }

    if (act === "tc-photo-clear") {
      if (!st.account || typeof st.account !== "object") st.account = {};
      st.account.photo = "";
      st.account.hasPhoto = false;
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      persistTutorAccountToServer(st, { silent: true });
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-verif-refresh") {
      st._verifLoaded = false;
      ensureVerificationsLoaded(st);
      if (typeof getCtx().toast === "function") getCtx().toast("Статус верификации обновлён");
      return true;
    }

    if (act === "tc-city-pick") {
      if (CITY_OPTIONS.includes(d.v)) {
        if (!st.account || typeof st.account !== "object") st.account = {};
        st.account.city = d.v;
        st.account.timezone = d.v === "Москва" ? "UTC+3" : "UTC+9";
        syncProfileMirror(st);
        syncPublishedTutor(st);
        saveState();
        persistTutorAccountToServer(st, { silent: true });
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
        if (!st.account || typeof st.account !== "object") st.account = {};
        st.account.timezone = d.v;
      }
      st.tzMenuOpen = false;
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      persistTutorAccountToServer(st, { silent: true });
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
          getCtx().notifySide(`Отправили напоминание (${chNames})`, `Написали ученику ${s.name} · ${s.lessonDay || "Воскресенье"} в ${s.lessonTime || "10:00"}`, { inbox: true });
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
      const sp = getEditingSearchProfile(st);
      if (d.v) sp.exams = toggleArrayVal(sp.exams, d.v, true);
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-format-toggle") {
      const sp = getEditingSearchProfile(st);
      if (d.v) sp.formats = toggleArrayVal(sp.formats, d.v, true);
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-skill-toggle") {
      const sp = getEditingSearchProfile(st);
      if (d.v) sp.skills = toggleArrayVal(sp.skills, d.v, false);
      syncProfileMirror(st);
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
      const sp = getEditingSearchProfile(st);
      sp.firstLessonGuarantee = enabled;
      sp.trialMode = enabled ? "free" : "none";
      sp.trialPrice = enabled ? 0 : null;
      sp.trialFree = enabled;
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-rate-step") {
      const which = d.which === "minFair" ? "minFair" : "price";
      const step = Number(d.step) || 0;
      const sp = getEditingSearchProfile(st);
      if (which === "price") {
        sp.price = clampStep(sp.price, step, 0, 99999);
        if (sp.minFair > sp.price) sp.minFair = Math.max(0, sp.price - 50);
      } else {
        sp.minFair = clampStep(sp.minFair, step, 0, sp.price);
      }
      syncProfileMirror(st);
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
      const bkServerId = who && (who.serverId || who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.accept(bkServerId, { counterPrice: who ? Number(who.offerPrice) : undefined }).then(() => {
          hydrateFromBackend({ force: true });
        }).catch((err) => {
          if (!isDevDemoMode()) {
            if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось подтвердить заявку");
            hydrateFromBackend({ force: true });
          }
        });
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
          who ? `${who.studentName} · ${who.dayLabel} в ${who.hour} за ${who.offerPrice.toLocaleString("ru-RU")} ₽/ч — уведомили ученика` : "Заявка переведена в подтверждённые",
          { inbox: false }
        );
      }
      return true;
    }

    if (act === "tc-req-counter") {
      const updated = updateReq(id, (req) => { req.status = "countered"; });
      if (updated && typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      const who = findReq(id);
      const bkServerId = who && (who.serverId || who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && who && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.counter(bkServerId, Number(who.counterPrice)).then(() => {
          hydrateFromBackend({ force: true });
        }).catch((err) => {
          if (!isDevDemoMode()) {
            if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось отправить контр-ставку");
            hydrateFromBackend({ force: true });
          }
        });
      }
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide(
          "Контр-ставка отправлена",
          who ? `Предложили ${who.counterPrice.toLocaleString("ru-RU")} ₽/ч — уведомили ученика` : "Новая ставка отправлена ученику",
          { inbox: true }
        );
      }
      return true;
    }

    if (act === "tc-req-decline") {
      const who = findReq(id);
      const bkServerId = who && (who.serverId || who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.cancel(bkServerId).then(() => {
          hydrateFromBackend({ force: true });
        }).catch((err) => {
          if (!isDevDemoMode()) {
            if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось отменить заявку");
            hydrateFromBackend({ force: true });
          }
        });
      }
      updateReq(id, (req) => { req.status = "declined"; });
      publishRtUpdate("request.declined", "Заявка снята", `Слот освобождён (${id})`, { requestId: id });
      syncTutorCalendar(st);
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
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
        getCtx().notifySide("Чат с учеником", who ? `Открыт диалог с ${who.studentName} (${who.dayLabel}, ${who.hour})` : "Сообщение ученику подготовлено", { inbox: true });
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
          who ? `${who.studentName} получит напоминание оплатить ${amount.toLocaleString("ru-RU")} ₽ (${who.dayLabel} в ${who.hour})` : "Напоминание отправлено ученику",
          { inbox: true }
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
      const bkServerId = who && (who.serverId || who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && sp && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.updateSchedule(bkServerId, sp).catch(() => {});
      }
      syncTutorCalendar(st);
      saveState();
      publishRtUpdate(
        "schedule.confirmed",
        "График подтверждён",
        sp ? `${who.studentName} · ${tcDaysShort(sp.dows)} в ${sp.hour}` : "График подтверждён",
        { requestId: id, schedulePlan: sp }
      );
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("График подтверждён", sp ? `${tcDaysShort(sp.dows)} · ${sp.hour} — уведомили ученика` : "Расписание закреплено", { inbox: false });
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
      const who = findReq(id);
      const bkServerId = who && (who.serverId || who.mktId || (String(id).startsWith("bk-") ? id : null));
      const ctxStore = getCtx().store;
      if (bkServerId && who && who.schedulePlan && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
        EGE.api.bookings.updateSchedule(bkServerId, who.schedulePlan).catch(() => {});
      }
      st.schedAltId = "";
      saveState();
      publishRtUpdate(
        "schedule.counter",
        "Предложены другие даты",
        `Преподаватель предложил: ${tcDaysShort(dows)} · ${hour}`,
        { requestId: id, altDows: dows, altHour: hour }
      );
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Другие даты отправлены ученику", `${tcDaysShort(dows)} · ${hour}`, { inbox: true });
      }
      if (EGE.fx && typeof EGE.fx.playBidSentFx === "function") {
        EGE.fx.playBidSentFx({
          title: "Даты предложены",
          subtitle: `${tcDaysShort(dows)} · ${hour}`
        });
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
      return true;
    }

    if (act === "tc-slot-toggle") {
      const hour = String(d.hour || "").trim();
      if (!hour) return true;
      const dow = st.activeDow || "6";
      const p = getEditingSearchProfile(st);
      p.slots = normalizeSlotsMap(p.slots);
      const list = Array.isArray(p.slots[dow]) ? p.slots[dow].slice() : [];
      const idx = list.indexOf(hour);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(hour);
      list.sort();
      p.slots[dow] = list;
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      if (!st.creatingSearchProfile && isServerProfileId(p.id)) {
        persistTutorProfileToServer(st, p, { silent: true });
      }
      publishRtUpdate("calendar.slot.updated", "Обновлено окно в расписании", `${dow}: ${hour}`, { dow, hour, tutorId: p.id || "" });
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
      return true;
    }

    if (act === "tc-cal-sync") {
      syncTutorCalendar(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-cal-copy-ics") {
      const cs = st.calendarSync || {};
      const url = d.url || cs.icsUrl || (`/api/calendar/${encodeURIComponent(getTutorSlug(st))}.ics`);
      copyStr(url);
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
          openSlots: mergeAllProfileSlots(st)
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
      return true;
    }

    if (act === "tc-subj-toggle") {
      st.subjMenuOpen = !st.subjMenuOpen;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-subj-pick") {
      const pickedId = String(d.v || "bio");
      const sp = getEditingSearchProfile(st);
      const curList = Array.isArray(sp.subjects) && sp.subjects.length ? sp.subjects : [sp.subject || "bio"];
      if (curList.includes(pickedId) && curList.length <= 1) {
        if (typeof getCtx().toast === "function") getCtx().toast("Должен остаться хотя бы один предмет");
        return true;
      }
      sp.subjects = toggleArrayVal(curList, pickedId, true);
      sp.subject = sp.subjects[0] || "bio";
      syncProfileMirror(st);
      syncPublishedTutor(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-badge-preset") {
      const txt = String(d.v || "").trim().slice(0, 36);
      const sp = getEditingSearchProfile(st);
      if (txt) {
        const arr = Array.isArray(sp.customBadges) ? sp.customBadges.slice(0, 2) : ["", ""];
        while (arr.length < 2) arr.push("");
        if (!arr.includes(txt)) {
          const emptyIdx = arr.findIndex((x) => !String(x || "").trim());
          arr[emptyIdx >= 0 ? emptyIdx : 1] = txt;
          sp.customBadges = arr;
          syncProfileMirror(st);
          syncPublishedTutor(st);
          saveState();
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        }
      }
      return true;
    }

    if (act === "tc-badge-clear") {
      const sp = getEditingSearchProfile(st);
      sp.customBadges = ["", ""];
      syncProfileMirror(st);
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
      if (EGE.fx && typeof EGE.fx.playBidSentFx === "function") {
        EGE.fx.playBidSentFx({
          title: "Отклик отправлен",
          subtitle: `${counterRate.toLocaleString("ru-RU")} ₽/ч · ${(hit && hit.studentName) || (lead && lead.studentName) || "ученику"}`
        });
      }
      if (typeof getCtx().notifySide === "function") {
        getCtx().notifySide("Отклик отправлен ученику", hit ? `${hit.studentName} получил(а) ваше предложение по ставке ${counterRate.toLocaleString("ru-RU")} ₽/ч` : `Предложена ставка ${counterRate.toLocaleString("ru-RU")} ₽/ч`, { inbox: true });
      }
      return true;
    }

    if (act === "tc-stu-view") {
      st.studentsSubView = d.v === "list" ? "list" : "calendar";
      st.confirmDropStudentKey = null;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-stu-scope") {
      st.studentsScope = d.v === "past" ? "past" : "current";
      st.expandedStudentId = "";
      st.confirmDropStudentKey = null;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-stu-detail") {
      st.expandedStudentId = st.expandedStudentId === id ? "" : id;
      st.confirmDropStudentKey = null;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-stu-restore") {
      const targetName = String(d.name || "").trim();
      const normName = targetName.toLowerCase();
      if (!Array.isArray(st.students)) st.students = [];
      let hit = st.students.find((s) => s && ((id && s.id === id) || (normName && String(s.name || "").trim().toLowerCase() === normName)));
      if (!hit) {
        hit = { id: id || ("st-" + Date.now()), name: targetName || "Ученик", exam: "Подготовка", lessonsDone: 0, hw: "", lessonDay: "По расписанию", lessonTime: "", whatsapp: "", telegram: "", autoNotify: false, autoChannels: ["wa", "tg"] };
        st.students.push(hit);
      }
      hit.status = "active";
      hit.manualStatus = "active";
      hit.endedLabel = "";
      st.expandedStudentId = "";
      st.confirmDropStudentKey = null;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast(targetName ? `${targetName} возвращён(а) в текущие` : "Ученик возвращён в текущие");
      return true;
    }

    if (act === "tc-stu-chat") {
      st.tab = "comm";
      saveState();
      if (typeof getCtx().go === "function") getCtx().go("tutor-comm");
      else if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (EGE.views && EGE.views.messenger && typeof EGE.views.messenger.openStudentChat === "function") {
        EGE.views.messenger.openStudentChat({
          studentId: id,
          studentName: String(d.name || "").trim(),
          reqId: String(d.reqId || "").trim(),
          subjectName: String(d.exam || "").trim(),
          rate: Number(d.rate || 0),
          inPageOnly: true
        });
      }
      return true;
    }

    if (act === "tc-student-drop-ask") {
      st.confirmDropStudentKey = id || null;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-student-drop-cancel") {
      st.confirmDropStudentKey = null;
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      return true;
    }

    if (act === "tc-student-drop-confirm") {
      st.confirmDropStudentKey = null;
      st.expandedStudentId = "";
      const dropId = id;
      const reqId = String(d.reqId || "");
      const studentName = String(d.name || "").trim();
      const normName = studentName.toLowerCase();
      const TDATA = getTDATA();
      if (!Array.isArray(st.students)) st.students = [];
      const allStudentReqs = syncedRequests().filter((r) => {
        if (!r || !["accepted", "completed", "cancelled"].includes(r.status)) return false;
        if (reqId && r.id === reqId) return true;
        if (dropId && r.studentId === dropId) return true;
        if (normName && String(r.studentName || "").trim().toLowerCase() === normName) return true;
        return false;
      });
      const matchingReqs = allStudentReqs.filter((r) => r.status === "accepted");
      const paidReqsSum = allStudentReqs.reduce((sum, r) => {
        const pay = typeof getLessonPaymentState === "function" ? getLessonPaymentState(st, r) : { paid: r.paid === true };
        if (r.status !== "completed" && !pay.paid) return sum;
        const rate = Number(r.counterPrice || r.offerPrice || r.tutorPrice || 0);
        const split = typeof calcLessonSplit === "function" ? calcLessonSplit(rate, r, TDATA) : { payout: rate };
        return sum + Number(r.payout > 0 ? r.payout : (split.payout || 0));
      }, 0);
      const sampleReq = matchingReqs[0] || allStudentReqs[0] || findReq(reqId);
      const sampleRate = sampleReq ? Number(sampleReq.counterPrice || sampleReq.offerPrice || sampleReq.tutorPrice || 0) : Number((st.profile && st.profile.price) || 0);
      const netPerLesson = sampleRate > 0 ? (typeof calcLessonSplit === "function" ? calcLessonSplit(sampleRate, sampleReq, TDATA).payout : Math.round(sampleRate * 0.94)) : 0;

      let matchedStudent = false;
      st.students.forEach((s) => {
        if (!s) return;
        const sNorm = String(s.name || "").trim().toLowerCase();
        if ((dropId && s.id === dropId) || (normName && sNorm === normName)) {
          matchedStudent = true;
          s.status = "past";
          s.manualStatus = "past";
          s.endedLabel = "Занятия завершены";
          if (!s.rate && sampleRate > 0) s.rate = sampleRate;
          if (!s.lastReqId && sampleReq && sampleReq.id) s.lastReqId = String(sampleReq.id);
          const curLessons = Number(s.lessonsDone) || 0;
          const prevEarned = Number(s.earnedRub) || 0;
          s.earnedRub = Math.max(prevEarned, paidReqsSum, curLessons > 0 && netPerLesson > 0 ? curLessons * netPerLesson : 0);
        }
      });
      const ctxStore = getCtx().store;
      if (!matchedStudent && studentName) {
        st.students.push({
          id: dropId || (sampleReq && sampleReq.studentId) || ("st-" + Date.now()),
          lastReqId: sampleReq && sampleReq.id ? String(sampleReq.id) : "",
          name: studentName,
          exam: sampleReq ? `${sampleReq.exam || "ЕГЭ"} · ${sampleReq.subjectName || "Подготовка"}` : "Подготовка",
          status: "past",
          manualStatus: "past",
          endedLabel: "Занятия завершены",
          lessonsDone: 0,
          rate: sampleRate,
          earnedRub: paidReqsSum,
          hw: (sampleReq && sampleReq.note) || "",
          manualStudent: true
        });
      }
      let canceledServerAny = false;
      matchingReqs.forEach((r) => {
        const bkServerId = r.serverId || r.mktId || (String(r.id || "").startsWith("bk-") ? r.id : null);
        if (bkServerId && ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.bookings) {
          canceledServerAny = true;
          EGE.api.bookings.cancel(bkServerId).then(() => {
            hydrateFromBackend({ force: true });
          }).catch((err) => {
            if (!isDevDemoMode()) {
              if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось убрать ученика");
              hydrateFromBackend({ force: true });
            }
          });
        }
        updateReq(r.id, (rec) => { rec.status = "cancelled"; });
      });
      if (!canceledServerAny) {
        publishRtUpdate("student.dropped", "Ученик убран", studentName ? `${studentName} убран(а) из расписания` : "Занятия с учеником отменены", { requestId: reqId || dropId });
      } else {
        publishRtUpdate("student.dropped", "Ученик убран", studentName ? `${studentName} убран(а) из расписания` : "Занятия с учеником отменены", { requestId: reqId || dropId });
      }
      syncTutorCalendar(st);
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      if (typeof getCtx().toast === "function") getCtx().toast(studentName ? `${studentName} убран(а) из расписания` : "Ученик убран из расписания");
      return true;
    }

    if (act === "tc-student-score") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.curScore = Math.min(s.targetScore, (Number(s.curScore) || 0) + (Number(d.delta) || 2));
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-student-lesson") {
      const s = (st.students || []).find((x) => x.id === id);
      if (s) {
        s.lessonsDone = (Number(s.lessonsDone) || 0) + 1;
        saveState();
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
      }
      return true;
    }

    if (act === "tc-copy-tpl") {
      const tpl = QUICK_TEMPLATES.find((t) => t.id === id);
      if (tpl) {
        copyStr(tpl.build(st.profile));
      }
      return true;
    }

    if (act === "tc-refresh-server") {
      hydrateFromBackend({ force: true });
      if (typeof getCtx().toast === "function") getCtx().toast("Данные кабинета обновлены");
      return true;
    }

    if (act === "tc-reset-demo") {
      if (!isDevDemoMode()) return true;
      const def = defaultState();
      st.filter = "all";
      st.requests = def.requests;
      saveState();
      if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
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
      const sbp1 = Math.round(num * 0.01);
      const net98 = Math.max(0, num - fee1 - sbp1);
      if (typeof document !== "undefined" && typeof document.getElementById === "function") {
        const noteEl = document.getElementById("tc-add-fee-note");
        if (noteEl) {
          noteEl.innerHTML = `На руки 98%: <b class="num" style="color:var(--confirm)">${net98.toLocaleString("ru-RU")} ₽</b> · сбор 1% + 1% СБП (${(fee1 + sbp1).toLocaleString("ru-RU")} ₽)`;
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
        const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.max(0, rate - Math.round(rate * 0.05) - Math.round(rate * 0.01)) };
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
    const acc = st.account || (st.account = {});
    const p = getEditingSearchProfile(st);
    const autoGrowWrapField = () => {
      if (el.classList && el.classList.contains("tc-field-wrap") && el.style && el.scrollHeight) {
        el.style.height = "auto";
        el.style.height = Math.max(48, el.scrollHeight) + "px";
      }
    };
    if (key === "name") {
      acc.name = String(el.value || "").slice(0, 48);
      const ctxStore = getCtx().store;
      if (ctxStore && ctxStore.backend && ctxStore.user && acc.name.trim().length >= 2 && typeof setTimeout === "function") {
        if (tcNameSaveTimer && typeof clearTimeout === "function") clearTimeout(tcNameSaveTimer);
        tcNameSaveTimer = setTimeout(() => {
          tcNameSaveTimer = null;
          persistTutorAccountToServer(st, { silent: true });
        }, 700);
      }
    }
    else if (key === "headline") {
      p.headline = String(el.value || "").replace(/[\r\n]+/g, " ").slice(0, 72);
      autoGrowWrapField();
    }
    else if (key === "city") acc.city = CITY_OPTIONS.includes(el.value) ? el.value : "Якутск";
    else if (key === "timezone") acc.timezone = TZ_OPTIONS.some((tz) => tz.id === el.value) ? el.value : "UTC+9";
    else if (key === "customSkills") {
      p.customSkills = String(el.value || "").replace(/[\r\n]+/g, " ").slice(0, 120);
      autoGrowWrapField();
    }
    else if (key === "waTemplate") {
      if (!st.waSettings) st.waSettings = { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "" };
      st.waSettings.template = String(el.value || "").slice(0, 260);
      saveState();
      return true;
    }
    else if (key === "education") {
      p.education = String(el.value || "").replace(/[\r\n]+/g, " ").slice(0, 90);
      autoGrowWrapField();
    }
    else if (key === "whatsapp") {
      const toDraft = st.msgrLinkOpen === "whatsapp";
      const target = toDraft ? (st.msgrLinkDraft || (st.msgrLinkDraft = {})) : acc;
      const curCountry = target.whatsappCountry || acc.whatsappCountry || "RU";
      const pf = EGE.phoneField;
      if (pf && typeof pf.formatPhoneForCountry === "function") {
        const stPf = typeof pf.getPhoneFieldState === "function" ? pf.getPhoneFieldState("tc-hh-wa", curCountry) : null;
        const parsed = pf.formatPhoneForCountry(el.value, (stPf && stPf.country) || curCountry);
        if (el.value !== parsed.formatted) el.value = parsed.formatted;
        target.whatsapp = parsed.formatted;
        target.whatsappCountry = parsed.country.code;
      } else {
        const masked = formatPhone(el.value);
        if (el.value !== masked) el.value = masked;
        target.whatsapp = masked;
      }
    } else if (key === "telegram") {
      const tgFormatted = formatTelegram(el.value);
      if (el.value !== tgFormatted) el.value = tgFormatted;
      if (st.msgrLinkOpen === "telegram") {
        (st.msgrLinkDraft || (st.msgrLinkDraft = {})).telegram = tgFormatted;
      } else {
        acc.telegram = tgFormatted;
      }
    } else if (key === "maxHandle") {
      const val = String(el.value || "").trim().slice(0, 48);
      if (st.msgrLinkOpen === "maxHandle") {
        (st.msgrLinkDraft || (st.msgrLinkDraft = {})).maxHandle = val;
      } else {
        acc.maxHandle = val;
      }
    } else if (key === "vk") {
      const val = String(el.value || "").trim().slice(0, 64);
      if (st.msgrLinkOpen === "vk") {
        (st.msgrLinkDraft || (st.msgrLinkDraft = {})).vk = val;
      } else {
        acc.vk = val;
      }
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
    } else if (key === "verifDocType") {
      if (!st.verifDraft) st.verifDraft = { docType: "diploma", title: "" };
      st.verifDraft.docType = String(el.value || "diploma");
      return true;
    } else if (key === "verifTitle") {
      if (!st.verifDraft) st.verifDraft = { docType: "diploma", title: "" };
      st.verifDraft.title = String(el.value || "").slice(0, 100);
      return true;
    }
    else if (key === "bio") p.bio = String(el.value || "").slice(0, 320);
    syncProfileMirror(st);
    syncPublishedTutor(st);
    saveState();
    return true;
  }

  function handleFileInput(el) {
    if (!el || !el.files || !el.files[0]) return false;
    const file = el.files[0];
    if (el.dataset && el.dataset.tcDiplomaFile) {
      const ctxStore = getCtx().store;
      if (!ctxStore || !ctxStore.backend || !ctxStore.user || !EGE.api || !EGE.api.verifications) {
        if (typeof getCtx().toast === "function") getCtx().toast("Войдите в аккаунт для отправки диплома");
        el.value = "";
        return true;
      }
      const st = tState();
      const draft = st.verifDraft || { docType: "diploma", title: "" };
      EGE.api.verifications.upload(file, {
        docType: draft.docType || "diploma",
        title: draft.title || file.name,
        tutorId: st.profile && st.profile.id ? String(st.profile.id) : ""
      }).then((res) => {
        if (res && res.verification) {
          st.verifications = [res.verification].concat((st.verifications || []).filter((x) => x.id !== res.verification.id));
          st._verifLoaded = true;
          if (st.verifDraft) st.verifDraft.title = "";
        }
        if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
        if (typeof getCtx().toast === "function") getCtx().toast("Документ отправлен на проверку модератору");
      }).catch((err) => {
        if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось загрузить документ");
      });
      el.value = "";
      return true;
    }
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
            openSlots: mergeAllProfileSlots(st)
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
    const ctxStore = getCtx().store;
    if (ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.media && typeof EGE.api.media.uploadAvatar === "function") {
      EGE.api.media.uploadAvatar(file, "tutor").then((res) => {
        if (res && res.url) {
          const st = tState();
          if (!st.account || typeof st.account !== "object") st.account = {};
          st.account.photo = res.url;
          st.account.hasPhoto = true;
          if (ctxStore.user) ctxStore.user.avatarUrl = res.url;
          syncProfileMirror(st);
          syncPublishedTutor(st);
          saveState();
          persistTutorAccountToServer(st, { silent: true });
          if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
          if (typeof getCtx().toast === "function") getCtx().toast("Фото загружено в хранилище и обновлено во всех анкетах");
        }
      }).catch((err) => {
        if (typeof getCtx().toast === "function") getCtx().toast((err && err.message) || "Не удалось загрузить фото");
      });
      el.value = "";
      return true;
    }
    if (typeof readResizedPhotoFile !== "function") return false;
    readResizedPhotoFile(
      file,
      { maxDim: 240, quality: 0.84, maxLen: 350000 },
      (url) => {
        const st = tState();
        if (!st.account || typeof st.account !== "object") st.account = {};
        st.account.photo = url;
        st.account.hasPhoto = true;
        syncProfileMirror(st);
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

  function submitSearchProfileForm(st, form, opts) {
    opts = opts || {};
    const els = (form && form.elements) ? form.elements : {};
    const acc = st.account || (st.account = {});
    const p = getEditingSearchProfile(st);
    if (els.name && String(els.name.value || "").trim()) acc.name = String(els.name.value).trim().slice(0, 48);
    if (els.city && String(els.city.value || "").trim()) acc.city = String(els.city.value || "").trim().slice(0, 48);
    if (els.whatsapp) {
      const ph = formatPhone(String(els.whatsapp.value || "").trim());
      acc.whatsapp = ph && ph.replace(/\D+/g, "").length >= 10 ? ph : "";
    }
    if (els.telegram) acc.telegram = formatTelegram(String(els.telegram.value || "").trim());
    if (els.maxHandle) acc.maxHandle = String(els.maxHandle.value || "").trim().slice(0, 48);
    if (els.vk) acc.vk = String(els.vk.value || "").trim().slice(0, 64);

    if (els.headline) p.headline = String(els.headline.value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 72);
    if (els.education) p.education = String(els.education.value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 90);
    if (els.customSkills) p.customSkills = String(els.customSkills.value || "").replace(/[\r\n]+/g, " ").trim().slice(0, 120);
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

    if (String(acc.name || "").trim().length < 2) {
      if (typeof getCtx().toast === "function") getCtx().toast("Укажите имя и фамилию в блоке «Мой аккаунт» (минимум 2 символа)");
      return true;
    }

    const spList = Array.isArray(st.searchProfiles) ? st.searchProfiles : (st.searchProfiles = []);
    const wasCreating = Boolean(st.creatingSearchProfile || !p.id || !spList.some((item) => item && item.id === p.id));
    if (wasCreating && spList.length >= 10) {
      if (typeof getCtx().toast === "function") getCtx().toast("Можно создать не более 10 профилей для поиска");
      return true;
    }

    p.published = opts.published !== false;
    const ctxStore = getCtx().store;
    const isLoggedBackend = !!(ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor);
    let tempLocalId = "";
    if (wasCreating) {
      if (!p.id) {
        p.id = (!isLoggedBackend && spList.length === 0) ? "tc-my-profile" : ("tc-sp-" + Date.now());
      }
      if (isLoggedBackend) tempLocalId = p.id;
      spList.unshift(p);
      st.activeSearchProfileId = p.id;
      st.creatingSearchProfile = false;
      st.spEditorOpen = false;
      st.newProfileDraft = null;
    } else {
      st.activeSearchProfileId = p.id;
      st.spEditorOpen = true;
    }
    st.confirmDeleteProfileId = null;

    syncProfileMirror(st);
    syncPublishedTutor(st);
    saveState();

    if (isLoggedBackend) {
      persistTutorProfileToServer(st, p, {
        createNew: wasCreating || !isServerProfileId(p.id),
        replaceLocalId: tempLocalId,
        silent: false
      });
    }
    if (typeof getCtx().scheduleRender === "function") getCtx().scheduleRender();
    if (typeof getCtx().notifySide === "function") {
      getCtx().notifySide(
        p.published ? "Профиль сохранён и опубликован" : "Профиль сохранён в скрытых",
        `${acc.name} · ${Number(p.price || 1200).toLocaleString("ru-RU")} ₽/ч (торг от ${Number(p.minFair || 900).toLocaleString("ru-RU")} ₽/ч)`
      );
    }
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
          openSlots: mergeAllProfileSlots(st)
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
    return submitSearchProfileForm(st, form, { published: true });
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
    setDemoMode,
    hydrateFromBackend,
    resetSession,
    validateInn12,
    tState,
    saveState,
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
