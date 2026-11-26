/* Календарь учеников, трекер баллов «Мои ученики» и встречные заявки «Ученики ищут». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural, initials } = EGE.utils || { esc: (s) => String(s || ""), plural: (n, a) => a, initials: () => "П" };
  const { icon } = EGE.ui || { icon: () => "" };

  const TC = EGE._tutorCab;
  const {
    TC_LS_KEY, DAY_MS, FOUR_HOURS_MS, DAY_LIST, EXAM_OPTIONS, FORMAT_OPTIONS,
    CITY_OPTIONS, TZ_OPTIONS, WA_LEAD_OPTIONS, AUTO_CHANNELS, AUTO_BUMP_HOURS,
    GOAL_PRESETS, QUICK_TEMPLATES, DEFAULT_REQUESTS, DEFAULT_STUDENTS,
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS,
    isDevDemoMode,
    getCtx, configure, getTDATA, getTutorSlug, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList, normalizeLeadList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    consumeSwitchAnimClass,
    ensureTelemostUrl, resolveLessonContacts, getLessonPaymentState, calcLessonSplit, renderLessonNotifyHTML, renderLessonPaymentHTML,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    ensureCountdownTimer, ensureRealtimeConnected, clampStep, profileCompleteness,
    buildMarketTutorPayload, syncPublishedTutor, dayDowFromLabel, syncedRequests,
    findReq, updateReq, pendingCount, renderDataTable, getTab, setTab, toggleArrayVal
  } = TC;

  function lessonMatchesDow(r, dowStr) {
    if (!r) return false;
    const sp = r.schedulePlan;
    if (sp && (sp.status === "confirmed" || sp.status === "sent_to_tutor") && Array.isArray(sp.dows) && sp.dows.length) {
      return sp.dows.map((x) => String(x)).includes(dowStr);
    }
    const rDow = r.dow != null ? String(r.dow) : String(dayDowFromLabel(r.dayLabel));
    return rDow === dowStr;
  }

  function lessonMatchesDay(r, dayObj) {
    if (!r || !dayObj) return false;
    const dowStr = String(dayObj.dow);
    const sp = r.schedulePlan;
    if (sp && (sp.status === "confirmed" || sp.status === "sent_to_tutor") && Array.isArray(sp.dows) && sp.dows.length) {
      return sp.dows.map((x) => String(x)).includes(dowStr);
    }
    if (r.dayIso && dayObj.iso) {
      return String(r.dayIso) === String(dayObj.iso);
    }
    return lessonMatchesDow(r, dowStr);
  }

  function findStudentForLesson(st, lesson) {
    const list = (st && Array.isArray(st.students)) ? st.students : [];
    if (!lesson || !list.length) return null;
    if (lesson.studentId) {
      const byId = list.find((s) => s && s.id === lesson.studentId);
      if (byId) return byId;
    }
    const targetName = String(lesson.studentName || "").trim().toLowerCase();
    if (!targetName) return null;
    return list.find((s) => s && String(s.name || "").trim().toLowerCase() === targetName) || null;
  }

  function collectTutorStudents(st, allReqs) {
    const TDATA = getTDATA();
    const reqs = Array.isArray(allReqs) ? allReqs : [];
    const reqStatsByKey = new Map();
    const recordReqStat = (key, r) => {
      if (!key) return;
      if (!reqStatsByKey.has(key)) {
        reqStatsByKey.set(key, { activeCnt: 0, completedCnt: 0, pastCnt: 0, earnedRub: 0, latest: r, activeReqId: "" });
      }
      const stat = reqStatsByKey.get(key);
      if (r.status === "accepted") {
        stat.activeCnt += 1;
        if (!stat.activeReqId) stat.activeReqId = r.id;
      } else if (r.status === "completed") {
        stat.completedCnt += 1;
        stat.pastCnt += 1;
      } else if (r.status === "cancelled") {
        stat.pastCnt += 1;
      }
      const pay = typeof getLessonPaymentState === "function" ? getLessonPaymentState(st, r) : { paid: r.paid === true };
      if (r.status === "completed" || pay.paid) {
        const bRate = Number(r.counterPrice || r.offerPrice || r.tutorPrice || 0);
        const bSplit = typeof calcLessonSplit === "function" ? calcLessonSplit(bRate, r, TDATA) : { payout: bRate };
        stat.earnedRub += Number(r.payout > 0 ? r.payout : (bSplit.payout || 0));
      }
      if (String(r.updatedAt || "") >= String((stat.latest && stat.latest.updatedAt) || "")) stat.latest = r;
    };

    reqs.forEach((r) => {
      if (!r || !["accepted", "completed", "cancelled"].includes(r.status)) return;
      const nmKey = String(r.studentName || "").trim().toLowerCase();
      if (r.studentId) recordReqStat("id:" + String(r.studentId), r);
      if (nmKey) recordReqStat("nm:" + nmKey, r);
      if (!r.studentId && !nmKey && r.id) recordReqStat("id:" + String(r.id), r);
    });

    const out = [];
    const seenIds = new Set();
    const seenNames = new Set();

    const pushStudent = (src, fromReq) => {
      const id = String((src && src.id) || "");
      const name = String((src && (src.name || src.studentName)) || "Ученик").trim() || "Ученик";
      const nmLower = name.toLowerCase();
      if (id && seenIds.has(id)) return;
      if (nmLower && seenNames.has(nmLower)) return;
      if (id) seenIds.add(id);
      if (nmLower) seenNames.add(nmLower);

      const stat = (id && reqStatsByKey.get("id:" + id)) || (nmLower && reqStatsByKey.get("nm:" + nmLower)) || null;
      const latestReq = (stat && stat.latest) || fromReq || null;
      const manualStatus = String((src && src.manualStatus) || "");
      const hasAccepted = Boolean(stat && stat.activeCnt > 0);
      const hasPastBookings = Boolean(stat && stat.pastCnt > 0);

      let isPast = false;
      if (manualStatus === "past") isPast = true;
      else if (manualStatus === "active") isPast = false;
      else if (hasAccepted) isPast = false;
      else if (src && src.status === "past") isPast = true;
      else if (hasPastBookings && !(src && src.lessonsDone && src.status !== "past")) isPast = true;
      else if (fromReq && !hasAccepted) isPast = true;

      const sp = latestReq && latestReq.schedulePlan;
      const dowObj = latestReq ? DAY_LIST.find((d) => d.dow === String(latestReq.dow || "")) : null;
      const dayLabel = (src && src.lessonDay) || (dowObj && dowObj.full) || (latestReq && latestReq.dayLabel) || "По расписанию";
      const timeLabel = (src && src.lessonTime) || (sp && sp.hour) || (latestReq && latestReq.hour) || "";
      const scheduleText = timeLabel ? `${dayLabel}, ${timeLabel}` : dayLabel;
      const examText = (src && src.exam) || (latestReq ? `${latestReq.exam || "ЕГЭ"} · ${latestReq.subjectName || "Подготовка"}` : "Подготовка");
      const rate = Number((src && src.rate) || (latestReq && (latestReq.counterPrice || latestReq.offerPrice)) || 0);
      const effRate = rate > 0 ? rate : Number((st && st.profile && st.profile.price) || 0);
      const lessonsDone = Math.max(
        Number((src && src.lessonsDone) || 0),
        stat ? stat.completedCnt || 0 : 0
      );
      const netPerLesson = effRate > 0
        ? (typeof calcLessonSplit === "function" ? calcLessonSplit(effRate, latestReq, TDATA).payout : Math.round(effRate * 0.94))
        : 0;
      const earnedRub = Math.max(
        Number((src && src.earnedRub) || 0),
        stat ? Number(stat.earnedRub || 0) : 0,
        lessonsDone > 0 && netPerLesson > 0 ? lessonsDone * netPerLesson : 0
      );

      out.push({
        id: id || ("stu-" + nmLower),
        name,
        exam: examText,
        isPast,
        scheduleText,
        endedLabel: (src && src.endedLabel) || (latestReq && latestReq.dayLabel ? `Последний слот: ${latestReq.dayLabel}` : "Занятия завершены"),
        lessonsDone,
        rate,
        earnedRub,
        note: String((src && src.hw) || (latestReq && latestReq.note) || "").trim(),
        activeReqId: (stat && stat.activeReqId) || (fromReq && fromReq.id) || "",
        lastReqId: String((src && src.lastReqId) || (latestReq && latestReq.id) || (stat && stat.activeReqId) || ""),
        whatsapp: (src && src.whatsapp) || (latestReq && latestReq.whatsapp) || "",
        telegram: (src && src.telegram) || (latestReq && latestReq.telegram) || "",
        maxHandle: (src && src.maxHandle) || (latestReq && latestReq.maxHandle) || ""
      });
    };

    (Array.isArray(st && st.students) ? st.students : []).forEach((s) => {
      if (s) pushStudent(s, null);
    });
    reqs.forEach((r) => {
      if (!r || !["accepted", "completed", "cancelled"].includes(r.status)) return;
      pushStudent({
        id: String(r.studentId || r.id || ""),
        name: r.studentName || "Ученик",
        exam: `${r.exam || "ЕГЭ"} · ${r.subjectName || "Подготовка"}`,
        status: r.status === "accepted" ? "active" : "past",
        rate: Number(r.counterPrice || r.offerPrice || 0),
        hw: r.note || ""
      }, r);
    });

    return out;
  }

  function renderStudentsDirectory(st, TDATA, allReqs, allStudents) {
    const list = Array.isArray(allStudents) ? allStudents : collectTutorStudents(st, allReqs);
    const currentStudents = list.filter((s) => !s.isPast);
    const pastStudents = list.filter((s) => s.isPast);
    const scope = st.studentsScope === "past" ? "past" : "current";
    const visible = scope === "past" ? pastStudents : currentStudents;
    const expandedId = String(st.expandedStudentId || "");

    const itemsHTML = visible.length
      ? `<div class="tc-stu-list">
          ${visible.map((stu) => {
            const isExpanded = expandedId === stu.id;
            const isConfirmDrop = st.confirmDropStudentKey === stu.id;
            const contacts = typeof resolveLessonContacts === "function"
              ? resolveLessonContacts(st, null, stu)
              : { entity: stu, available: null };
            const msgBar = (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function" && (contacts.entity.whatsapp || contacts.entity.telegram || contacts.entity.maxHandle))
              ? EGE.kit.messengerLinksHTML({
                  entity: contacts.entity,
                  available: contacts.available,
                  message: `Здравствуйте, ${stu.name}! Пишу по занятиям на платформе Вектор.`,
                  primaryTitle: "Написать ученику",
                  iconOnly: true,
                  compact: true
                })
              : "";
            const detailHTML = isExpanded ? `<div class="tc-stu-detail" data-stu-detail="${esc(stu.id)}">
              <div class="tc-stu-meta-grid">
                <div class="tc-stu-meta-kv">
                  <span>Статус</span>
                  <b>${stu.isPast ? "Бывший ученик" : "Текущий ученик"}</b>
                </div>
                <div class="tc-stu-meta-kv">
                  <span>${stu.isPast ? "Период" : "Расписание"}</span>
                  <b>${esc(stu.isPast ? stu.endedLabel : stu.scheduleText)}</b>
                </div>
                <div class="tc-stu-meta-kv">
                  <span>Занятий</span>
                  <b class="num">${stu.lessonsDone} ${plural(stu.lessonsDone, "урок", "урока", "уроков")}</b>
                </div>
                ${stu.rate > 0 ? `<div class="tc-stu-meta-kv">
                  <span>Ставка</span>
                  <b class="num">${stu.rate.toLocaleString("ru-RU")} ₽/ч</b>
                </div>` : ""}
                ${(stu.earnedRub > 0 || stu.isPast) ? `<div class="tc-stu-meta-kv">
                  <span>Заработано</span>
                  <b class="num savings-gold-txt">${(Number(stu.earnedRub) || 0).toLocaleString("ru-RU")} ₽</b>
                </div>` : ""}
              </div>
              ${stu.note ? `<div class="tc-stu-hw">${esc(stu.note)}</div>` : ""}
              ${msgBar}
              <div class="tc-stu-detail-acts">
                <button type="button" class="btn soft sm" data-a="tc-stu-chat" data-id="${esc(stu.id)}" data-req-id="${esc(stu.lastReqId || stu.activeReqId || "")}" data-name="${esc(stu.name)}" data-exam="${esc(stu.exam)}" data-rate="${stu.rate || 0}">${icon("chat")}<span>Написать</span></button>
                ${stu.isPast
                  ? `<button type="button" class="btn ghost sm" data-a="tc-stu-restore" data-id="${esc(stu.id)}" data-name="${esc(stu.name)}">Вернуть в текущие</button>`
                  : (isConfirmDrop
                    ? `<div class="tc-sp-confirm tc-stu-drop-confirm" style="flex:1 1 100%">
                        <span class="tc-sp-confirm-label">Убрать ученика?</span>
                        <div class="tc-sp-confirm-btns">
                          <button type="button" class="btn ghost sm" data-a="tc-student-drop-cancel">Отмена</button>
                          <button type="button" class="btn bad sm" data-a="tc-student-drop-confirm" data-id="${esc(stu.id)}" data-req-id="${esc(stu.activeReqId)}" data-name="${esc(stu.name)}">Убрать</button>
                        </div>
                      </div>`
                    : `<button type="button" class="btn ghost sm tc-stu-drop-btn" data-a="tc-student-drop-ask" data-id="${esc(stu.id)}">Убрать ученика</button>`)}
              </div>
            </div>` : "";
            return `<article class="tc-stu-item${isExpanded ? " is-expanded" : ""}" data-stu-id="${esc(stu.id)}">
              <div class="tc-stu-row">
                <div class="tc-stu-ident">
                  <span class="avatar sm${stu.isPast ? " is-past" : ""}" aria-hidden="true">${esc(initials(stu.name))}</span>
                  <div class="tc-stu-head-txt">
                    <b>${esc(stu.name)}</b>
                    <span class="small muted">${esc(stu.exam)}</span>
                  </div>
                </div>
                <button type="button" class="btn ${isExpanded ? "ghost" : "soft"} sm tc-stu-more-btn" data-a="tc-stu-detail" data-id="${esc(stu.id)}" aria-expanded="${isExpanded}">${isExpanded ? "Свернуть" : "Подробнее"}</button>
              </div>
              ${detailHTML}
            </article>`;
          }).join("")}
        </div>`
      : `<div class="empty">
          <b>${scope === "past" ? "Бывших учеников пока нет" : "Текущих учеников пока нет"}</b>
          <span>${scope === "past" ? "Сюда попадают ученики, которые завершили обучение или были убраны из активного расписания." : "Подтвердите заявку во вкладке «Заявки» или запишите ученика в разделе «Календарь»."}</span>
        </div>`;

    return `<section class="stack tc-stu-dir" id="tc-students-list" aria-label="Список учеников">
      <div class="hh-seg equal tc-stu-scope-seg" role="group" aria-label="Категория учеников">
        <button type="button" data-a="tc-stu-scope" data-v="current" aria-pressed="${scope === "current"}">Текущие (${currentStudents.length})</button>
        <button type="button" data-a="tc-stu-scope" data-v="past" aria-pressed="${scope === "past"}">Бывшие (${pastStudents.length})</button>
      </div>
      ${itemsHTML}
    </section>`;
  }

  function renderCalendarTab(st, TDATA, allReqs) {
    const subView = st.studentsSubView === "list" ? "list" : "calendar";
    const allStudents = collectTutorStudents(st, allReqs);
    const modeSwitchHTML = `<div class="hh-seg equal tc-stu-mode-seg" id="tc-students-mode-seg" role="group" aria-label="Выбор режима раздела Ученики">
      <button type="button" data-a="tc-stu-view" data-v="calendar" aria-pressed="${subView === "calendar"}">${icon("cal")}<span>Календарь</span></button>
      <button type="button" data-a="tc-stu-view" data-v="list" aria-pressed="${subView === "list"}">${icon("users")}<span>Ученики (${allStudents.length})</span></button>
    </div>`;

    if (subView === "list") {
      return `<div class="stack tc-students-tab-wrap">
        ${modeSwitchHTML}
        ${renderStudentsDirectory(st, TDATA, allReqs, allStudents)}
      </div>`;
    }

    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    const rawWeek = Number(st.calWeek);
    const weekOffset = Number.isFinite(rawWeek) ? Math.max(-12, Math.min(12, Math.trunc(rawWeek))) : 0;
    const isPastWeek = weekOffset < 0;
    const weekDays = (TDATA && typeof TDATA.buildWeekDays === "function")
      ? TDATA.buildWeekDays(weekOffset)
      : DAY_LIST.map((d, i) => ({ dow: Number(d.dow), wd: d.wd, wdLong: d.full.toLowerCase(), num: 14 + i, month: "нояб.", shortLabel: `${d.wd}, ${14 + i} нояб.`, fullLabel: `${d.full.toLowerCase()}, ${14 + i} нояб.`, iso: "" }));
    const firstDay = weekDays[0] || {};
    const lastDay = weekDays[weekDays.length - 1] || firstDay;
    const nowLocal = new Date();
    const todayIso = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
    const weekRangeLabel = `${firstDay.num || ""} ${firstDay.month || ""} – ${lastDay.num || ""} ${lastDay.month || ""}`.trim();
    const weekTitle = weekOffset === 0
      ? "Эта неделя"
      : (weekOffset === 1
        ? "Следующая неделя"
        : (weekOffset === -1
          ? "Прошлая неделя"
          : (weekOffset < -1 ? `${Math.abs(weekOffset)} нед. назад` : `Через ${weekOffset} нед.`)));
    const activeDay = weekDays.find((d) => String(d.dow) === String(st.activeDow)) || weekDays[5] || weekDays[0];
    const isActivePast = isPastWeek || Boolean(activeDay && activeDay.iso && activeDay.iso < todayIso);
    const dowStr = String(activeDay.dow);
    const dayKeyByDow = { "1": "mon", "2": "tue", "3": "wed", "4": "thu", "5": "fri", "6": "sat", "0": "sun" };
    const activeDayKey = dayKeyByDow[dowStr] || "sat";
    const scheduledReqs = allReqs.filter((r) => r.status === "accepted" || r.status === "completed");
    const activeLessons = scheduledReqs
      .filter((r) => lessonMatchesDay(r, activeDay))
      .sort((a, b) => {
        const ha = String((a.schedulePlan && a.schedulePlan.hour) || a.hour || "");
        const hb = String((b.schedulePlan && b.schedulePlan.hour) || b.hour || "");
        return ha.localeCompare(hb);
      });
    const weekCount = weekDays.reduce((sum, d) => {
      return sum + scheduledReqs.filter((r) => lessonMatchesDay(r, d)).length;
    }, 0);

    const rtCal = (EGE.realtime && typeof EGE.realtime.getState === "function") ? EGE.realtime.getState().calendar : null;
    const cs = st.calendarSync || {};
    const busySlots = (Array.isArray(cs.busySlots) && cs.busySlots.length)
      ? cs.busySlots
      : ((rtCal && Array.isArray(rtCal.busySlots)) ? rtCal.busySlots : []);
    const busyForActiveDay = busySlots.filter((b) => String(b.day || "") === activeDayKey || (b.dow !== undefined && b.dow !== null && b.dow !== "" && String(b.dow) === dowStr));
    const gcalConnected = !!(cs.gcalConnected || busySlots.length > 0);
    const unbookedGcal = busyForActiveDay.filter((b) => !activeLessons.some((l) => String((l.schedulePlan && l.schedulePlan.hour) || l.hour || "") === String(b.hour || "")));

    const isDemo = isDevDemoMode();
    const ctxStore = getCtx().store;
    const isAuthed = !!(ctxStore && ctxStore.user);
    const students = Array.isArray(st.students) ? st.students : [];
    const waCfg = st.waSettings || { enabled: true, lead: "1h", leads: ["24h", "1h"], channels: ["wa", "tg", "max"], template: "Здравствуйте, {имя}! Скоро будет урок ({предмет}) — {день} в {время}." };
    const cfgChannels = normalizeChannelList(waCfg.channels);
    const cfgLeads = normalizeLeadList(waCfg.leads);
    const sampleStudent = students.find((s) => s && s.whatsapp) || students[0] || (isDemo
      ? { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio" }
      : { id: "", name: "Имя ученика", exam: "ЕГЭ", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "", telegram: "" });
    const samplePreview = formatWaReminderText(st, sampleStudent);
    const sampleWaHref = studentWaHref(st, sampleStudent);

    const daysStripHTML = `<div class="study-week-days${isPastWeek ? " is-past-week" : ""}" data-week-swipe="tc" role="group" aria-label="Дни недели и записанные ученики">
      ${weekDays.map((d) => {
        const k = String(d.dow);
        const bookedCnt = scheduledReqs.filter((r) => lessonMatchesDay(r, d)).length;
        const isOn = k === dowStr;
        const isPastDay = isPastWeek || Boolean(d.iso && d.iso < todayIso);
        return `<button type="button" class="study-week-day-btn${isOn ? " on" : ""}${bookedCnt > 0 ? " has-lessons" : ""}${isPastDay ? " is-past" : ""}" data-a="tc-day" data-dow="${k}" aria-pressed="${isOn}">
          <span class="swd-wd">${esc(d.wd)}</span>
          <span class="swd-num num">${esc(d.num)}</span>
          ${bookedCnt > 0 ? `<span class="swd-cnt num">${bookedCnt}</span>` : `<span class="swd-dot" aria-hidden="true"></span>`}
        </button>`;
      }).join("")}
    </div>`;

    const unbookedGcalHTML = !isPastWeek ? unbookedGcal.map((gcalBusy) => `<div class="tc-cal-slot is-gcal-busy">
      <div class="row" style="gap:10px;min-width:0;flex:1 1 220px;flex-wrap:wrap;align-items:center">
        <span class="tc-cal-time">${esc(gcalBusy.hour)}</span>
        <span class="badge">Занято в GCal</span>
        <span class="small">${esc(gcalBusy.summary || "Событие Google Calendar")}</span>
      </div>
      <span class="small muted">Пересчитано в ${esc(st.profile.timezone || "UTC+9")}</span>
    </div>`).join("") : "";

    const dayLessonsHTML = isActivePast
      ? ((activeLessons.length || unbookedGcalHTML)
        ? `<div class="study-day-cards">
            ${activeLessons.map((lesson) => {
              const sp = lesson.schedulePlan;
              const lessonHour = String((sp && sp.hour) || lesson.hour || "14:00");
              const isWeekly = !!(sp && sp.weekly !== false);
              const rate = Number(lesson.counterPrice || lesson.offerPrice) || st.profile.price;
              const lSplit = typeof calcLessonSplit === "function"
                ? calcLessonSplit(rate, lesson, TDATA)
                : { total: rate, fee: Math.round(rate * 0.05), sbpFee: Math.round(rate * 0.01), payout: Math.max(0, rate - Math.round(rate * 0.05) - Math.round(rate * 0.01)), pct: 5, sbpPct: 1, isManual: false };
              const pay = typeof getLessonPaymentState === "function" ? getLessonPaymentState(st, lesson) : { paid: false };
              return `<article class="study-lesson-card is-past" data-req-id="${esc(lesson.id)}">
                <div class="study-lesson-time-row">
                  <b class="num" style="font-size:15px">Урок в ${esc(lessonHour)}</b>
                  <span class="small muted">${esc(activeDay.shortLabel)} · ${esc(lesson.format || "Онлайн")}</span>
                </div>
                <div class="study-lesson-pills">
                  <span class="chip tc-past-chip">✓ Проведён</span>
                  ${lSplit.isManual ? `<span class="chip tc-past-chip">Свой ученик · 1%</span>` : ""}
                  ${isWeekly ? `<span class="chip tc-past-chip">Каждую неделю</span>` : ""}
                </div>
                <div class="tutor-name-line">
                  <span class="tutor-avatar" aria-hidden="true">${esc(initials(lesson.studentName))}</span>
                  <div class="tutor-person-meta">
                    <div class="tutor-title-inline">
                      <b class="tutor-person-name">${esc(lesson.studentName)}</b>
                    </div>
                    <span class="small muted">${esc(lesson.exam || "ЕГЭ")} · ${esc(lesson.subjectName || "")} · ${rate.toLocaleString("ru-RU")} ₽/ч</span>
                  </div>
                </div>
                ${lesson.note ? `<div class="tc-req-quote">${esc(lesson.note)}</div>` : ""}
                <div class="tc-past-pay-line">${pay.paid ? `✓ Оплачено · ${rate.toLocaleString("ru-RU")} ₽` : `Не оплачено · ${rate.toLocaleString("ru-RU")} ₽`}</div>
              </article>`;
            }).join("")}
            ${unbookedGcalHTML}
          </div>`
        : `<div class="empty is-past">
            <b>На ${esc(activeDay.fullLabel)} проведённых уроков не было</b>
            <span>Листайте дни или недели влево и вправо, чтобы посмотреть историю.</span>
          </div>`)
      : ((activeLessons.length || unbookedGcal.length)
      ? `<div class="study-day-cards">
          ${activeLessons.map((lesson) => {
            const sp = lesson.schedulePlan;
            const lessonHour = String((sp && sp.hour) || lesson.hour || "14:00");
            const isWeekly = !!(sp && sp.weekly !== false);
            const rate = Number(lesson.counterPrice || lesson.offerPrice) || st.profile.price;
            const lSplit = typeof calcLessonSplit === "function"
              ? calcLessonSplit(rate, lesson, TDATA)
              : { total: rate, fee: Math.round(rate * 0.05), sbpFee: Math.round(rate * 0.01), payout: Math.max(0, rate - Math.round(rate * 0.05) - Math.round(rate * 0.01)), pct: 5, sbpPct: 1, isManual: false };
            const gcalBusy = busyForActiveDay.find((b) => b.hour === lessonHour);
            const tmUrl = typeof ensureTelemostUrl === "function" ? ensureTelemostUrl(st, lesson) : String(lesson.telemostUrl || "").trim();
            const stu = findStudentForLesson(st, lesson);
            const stuChannels = stu ? normalizeChannelList(stu.autoChannels) : [];
            const stuChBadge = stuChannels.map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).short || cid.toUpperCase()).join(" · ");
            const contacts = typeof resolveLessonContacts === "function"
              ? resolveLessonContacts(st, lesson, stu)
              : { entity: stu || { id: lesson.id, name: lesson.studentName, whatsapp: lesson.whatsapp || "", telegram: lesson.telegram || "", maxHandle: lesson.maxHandle || "" }, available: null };
            const msgBar = (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function")
              ? EGE.kit.messengerLinksHTML({
                  entity: contacts.entity,
                  available: contacts.available,
                  message: `Здравствуйте, ${lesson.studentName}! Напоминаю про занятие (${lesson.subjectName}, ${activeDay.shortLabel} в ${lessonHour}) на платформе Вектор.`,
                  primaryTitle: "Написать ученику · WhatsApp",
                  iconOnly: true,
                  allowHoldAdd: true,
                  compact: true
                })
              : `<button type="button" class="btn soft sm" data-a="tc-req-msg" data-id="${esc(lesson.id)}">${icon("msg")}<span>Написать ученику</span></button>`;

            const dropKey = String((stu && stu.id) || lesson.id);
            const isConfirmDrop = st.confirmDropStudentKey === dropKey;
            const dropStudentHTML = lesson.status === "accepted"
              ? (isConfirmDrop
                ? `<div class="tc-sp-confirm tc-stu-drop-confirm">
                    <span class="tc-sp-confirm-label">Убрать ученика? Занятия будут отменены.</span>
                    <div class="tc-sp-confirm-btns">
                      <button type="button" class="btn ghost sm" data-a="tc-student-drop-cancel">Отмена</button>
                      <button type="button" class="btn bad sm" data-a="tc-student-drop-confirm" data-id="${esc(dropKey)}" data-req-id="${esc(lesson.id)}" data-name="${esc(lesson.studentName)}">Убрать</button>
                    </div>
                  </div>`
                : `<button type="button" class="btn ghost sm study-cancel-btn tc-stu-drop-btn" data-a="tc-student-drop-ask" data-id="${esc(dropKey)}">Убрать ученика</button>`)
              : "";

            const stuFoldHTML = stu ? `<details class="tc-stu-fold">
              <summary>Контакты и автоуведомления</summary>
              <div class="tc-stu-fold-body">
                <div class="row between" style="gap:6px;flex-wrap:wrap;align-items:center">
                  <button type="button" class="btn ${stu.autoNotify ? "gold" : "soft"} sm" data-a="tc-student-autonotify" data-id="${esc(stu.id)}" aria-pressed="${!!stu.autoNotify}">
                    ${icon("bell")}<span>${stu.autoNotify ? `Авто: ${esc(stuChBadge)}` : "Вкл. авто"}</span>
                  </button>
                  <div class="auto-ch-bar" role="group" aria-label="Каналы автоуведомления ученика">
                    ${AUTO_CHANNELS.map((ch) => {
                      const on = stuChannels.includes(ch.id);
                      return `<button type="button" class="auto-ch-pill${on ? " is-on" : ""}" data-a="tc-student-autochannel" data-id="${esc(stu.id)}" data-ch="${ch.id}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(ch.short || ch.name)}</button>`;
                    }).join("")}
                  </div>
                </div>
                <div class="tc-two-col">
                  <div class="field" style="gap:3px">
                    <label class="small muted" for="st-wa-${esc(stu.id)}">Телефон (WA / MAX)</label>
                    <input class="input num" id="st-wa-${esc(stu.id)}" data-tc-student="whatsapp" data-id="${esc(stu.id)}" value="${esc(formatPhone(stu.whatsapp || (isDemo ? "79142100511" : "")))}" maxlength="22" placeholder="+7 (914) 000-00-00">
                  </div>
                  <div class="field" style="gap:3px">
                    <label class="small muted" for="st-tg-${esc(stu.id)}">Telegram (@ или +7)</label>
                    <input class="input" id="st-tg-${esc(stu.id)}" data-tc-student="telegram" data-id="${esc(stu.id)}" value="${esc(formatTelegram(stu.telegram || ""))}" maxlength="36" placeholder="@login или +7...">
                  </div>
                </div>
                <div class="tc-two-col">
                  <div class="field" style="gap:3px">
                    <label class="small muted" for="st-day-${esc(stu.id)}">День напоминания</label>
                    <input class="input" id="st-day-${esc(stu.id)}" data-tc-student="lessonDay" data-id="${esc(stu.id)}" value="${esc(stu.lessonDay || "Воскресенье")}" maxlength="24" placeholder="Воскресенье">
                  </div>
                  <div class="field" style="gap:3px">
                    <label class="small muted" for="st-time-${esc(stu.id)}">Время</label>
                    <input class="input num" id="st-time-${esc(stu.id)}" data-tc-student="lessonTime" data-id="${esc(stu.id)}" value="${esc(stu.lessonTime || lessonHour)}" maxlength="12" placeholder="10:00">
                  </div>
                </div>
                <button type="button" class="btn confirm sm tc-stu-remind-btn" data-a="tc-student-remind" data-id="${esc(stu.id)}">${icon("msg")}<span>Напомнить (${esc(stu.lessonDay || activeDay.wd)}, ${esc(stu.lessonTime || lessonHour)})</span></button>
              </div>
            </details>` : "";

            return `<article class="study-lesson-card" data-req-id="${esc(lesson.id)}">
              <div class="study-lesson-time-row">
                <b class="num" style="font-size:15px">Урок в ${esc(lessonHour)}</b>
                <span class="small muted">${esc(activeDay.shortLabel)} · ${esc(lesson.format || "Онлайн")}</span>
              </div>
              <div class="study-lesson-pills">
                ${lSplit.isManual ? `<span class="chip confirm">Свой ученик · 1% + 1% СБП</span>` : ""}
                ${isWeekly ? `<span class="chip accent">Каждую неделю</span>` : ""}
                <span class="bb-tbl-st is-confirmed">${lesson.status === "completed" ? "✓ Проведён" : "✓ Подтверждён"}</span>
                ${gcalBusy ? `<span class="chip bad">Конфликт GCal</span>` : ""}
              </div>
              <div class="tutor-name-line">
                <span class="tutor-avatar" aria-hidden="true">${esc(initials(lesson.studentName))}</span>
                <div class="tutor-person-meta">
                  <div class="tutor-title-inline">
                    <b class="tutor-person-name">${esc(lesson.studentName)}</b>
                  </div>
                  <span class="small muted">${esc(lesson.exam || "ЕГЭ")} · ${esc(lesson.subjectName || "")} · ${rate.toLocaleString("ru-RU")} ₽/ч${lSplit.isManual ? ` · На руки ${lSplit.payout.toLocaleString("ru-RU")} ₽ (сбор 1% + 1% СБП)` : ""}</span>
                </div>
              </div>
              ${lesson.note ? `<div class="tc-req-quote">${esc(lesson.note)}</div>` : ""}
              ${typeof renderLessonPaymentHTML === "function" ? renderLessonPaymentHTML(st, lesson, stu) : ""}
              ${tmUrl ? `<a class="btn soft sm bid-telemost-join" href="${esc(tmUrl)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>Подключиться к Яндекс Телемосту</span></a>` : ""}
              ${msgBar}
              <div class="small muted tc-hold-hint">Удерживайте иконку, чтобы изменить контакт</div>
              ${typeof renderLessonNotifyHTML === "function" ? renderLessonNotifyHTML(st, lesson, stu) : ""}
              ${stuFoldHTML}
              ${dropStudentHTML}
            </article>`;
          }).join("")}
          ${unbookedGcalHTML}
        </div>`
      : (!isDemo && !isAuthed
        ? `<div class="empty" id="tc-cal-auth-empty">
            <b>Войдите в аккаунт преподавателя</b>
            <span>После авторизации в календаре появятся подтверждённые и проведённые занятия с учениками.</span>
            <button type="button" class="btn sm" data-a="auth-modal-open">Войти или зарегистрироваться</button>
          </div>`
        : `<div class="empty">
            <b>На ${esc(activeDay.fullLabel)} записанных учеников нет</b>
            <span>${isDemo ? "Выберите день с цифрой выше или запишите ученика вручную." : "Подтвердите заявки во вкладке «Заявки» или запишите своего ученика вручную."}</span>
            <div class="row" style="gap:8px;flex-wrap:wrap;justify-content:center">
              <button type="button" class="btn soft sm" data-a="tc-cal-open-add" data-hour="${hours[0]}">+ Записать ученика</button>
              ${!isDemo ? `<button type="button" class="btn ghost sm" data-a="tc-tab" data-tab="requests">Перейти к заявкам</button>` : ""}
            </div>
          </div>`));

    const waDrawerHTML = st.waPanelOpen ? `<div class="tc-wa-inline-panel stack" aria-label="Настройка автоуведомлений">
      <div class="tc-drawer-head">
        <div class="stack" style="gap:2px;min-width:0">
          <div class="eyebrow">WhatsApp · Telegram · MAX</div>
          <h3 class="h2">Настройка автоуведомлений</h3>
        </div>
        <button type="button" class="icon-btn sm" data-a="tc-wa-panel-toggle" aria-label="Скрыть автоуведомления">${icon("x")}</button>
      </div>
      <div class="tc-wa-master-row">
        <div class="stack" style="gap:1px;min-width:0">
          <b class="small">Автоотправка ученикам</b>
          <span class="small muted">${waCfg.enabled ? "Активна для выбранных каналов" : "Приостановлена"}</span>
        </div>
        <button type="button" class="tc-switch-pill is-master${waCfg.enabled ? " is-on" : ""}${consumeSwitchAnimClass("wa-global")}" data-a="tc-wa-global-toggle" aria-pressed="${!!waCfg.enabled}"><i class="tc-switch-track" aria-hidden="true"></i><span>${waCfg.enabled ? "Вкл" : "Выкл"}</span></button>
      </div>
      <div class="stack" style="gap:6px">
        <span class="small muted">Каналы автоматической отправки:</span>
        <div class="tc-ch-3grid" role="group" aria-label="Каналы автоуведомлений">
          ${AUTO_CHANNELS.map((ch) => {
            const on = cfgChannels.includes(ch.id);
            return `<button type="button" class="auto-ch-pill${on ? " is-on" : ""}" data-a="tc-wa-channel" data-ch="${ch.id}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(ch.name)}</button>`;
          }).join("")}
        </div>
      </div>
      <div class="stack" style="gap:6px">
        <span class="small muted">Когда автоматически писать ученику:</span>
        <div class="tc-lead-pills" role="group" aria-label="Когда автоматически писать">
          ${WA_LEAD_OPTIONS.map((o) => {
            const on = cfgLeads.includes(o.id);
            return `<button type="button" class="tc-lead-pill${on ? " is-on" : ""}" data-a="tc-wa-lead" data-v="${esc(o.id)}" aria-pressed="${on}">${esc(o.label)}</button>`;
          }).join("")}
        </div>
      </div>
      <div class="field">
        <label for="tc-wa-tpl">Текст напоминания (переменные: <code>{имя}</code>, <code>{предмет}</code>, <code>{день}</code>, <code>{время}</code>)</label>
        <textarea class="textarea" id="tc-wa-tpl" data-tc="waTemplate" rows="3" maxlength="260">${esc(waCfg.template || "")}</textarea>
      </div>
      <div class="tc-template-card">
        <div class="stack" style="gap:8px">
          <b class="small">Пример (${esc(sampleStudent.name)} · ${esc(sampleStudent.lessonDay || "Воскресенье")}, ${esc(sampleStudent.lessonTime || "10:00")})</b>
          <div class="tc-template-body">${esc(samplePreview)}</div>
          ${sampleWaHref
            ? `<a class="btn confirm sm" href="${esc(sampleWaHref)}" target="_blank" rel="noopener" style="width:100%;justify-content:center">${icon("send")}<span>Тест в WhatsApp</span></a>`
            : `<span class="small muted">Добавьте ученика с номером телефона, чтобы протестировать отправку в WhatsApp.</span>`}
        </div>
      </div>
      <details class="tc-stu-fold">
        <summary>Быстрые шаблоны ответов</summary>
        <div class="tc-stu-fold-body">
          ${QUICK_TEMPLATES.map((tpl) => {
            const text = tpl.build(st.profile);
            return `<div class="tc-template-card">
              <div class="row between" style="gap:8px;flex-wrap:wrap">
                <b class="small">${esc(tpl.title)}</b>
                <button type="button" class="btn soft sm" data-a="tc-copy-tpl" data-id="${esc(tpl.id)}">Копировать</button>
              </div>
              <div class="tc-template-body">${esc(text)}</div>
            </div>`;
          }).join("")}
        </div>
      </details>
    </div>` : "";

    return `<div class="stack tc-students-tab-wrap">
      ${modeSwitchHTML}
      <section class="stack study-cal-card" id="tc-week-strip">
      <div class="tc-cal-toolbar">
        <button type="button" class="btn soft sm" data-a="tc-cal-open-add" data-hour="${hours[0]}">+ Записать ученика</button>
        <button type="button" class="btn ${st.waPanelOpen ? "confirm" : "ghost"} sm" data-a="tc-wa-panel-toggle" aria-pressed="${!!st.waPanelOpen}">${icon("bell")}<span>Уведомления</span><i class="tc-status-dot${waCfg.enabled ? " is-on" : ""}" aria-hidden="true"></i></button>
        <button type="button" class="btn ghost sm" data-a="tc-cal-import-modal">${gcalConnected ? "✓ Google / Apple" : "Google / Apple"}</button>
      </div>

      ${waDrawerHTML}

      ${st.calImportOpen ? `<form class="card stack" style="gap:10px;border-color:var(--accent)" data-f="tc-cal-import">
        <div class="tc-drawer-head">
          <div class="stack" style="gap:2px;min-width:0">
            <b>Синхронизация календаря</b>
            <span class="small muted">Google · Apple · Яндекс — занятые часы скроются сами</span>
          </div>
          <button type="button" class="icon-btn sm" data-a="tc-cal-import-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="tc-ics-quick-row">
          <label class="btn soft sm" for="tc-ics-file" style="cursor:pointer;justify-content:center">${icon("upload")}<span>Файл .ics</span></label>
          <input type="file" id="tc-ics-file" accept=".ics,text/calendar" data-tc-ics-file="1" class="sr">
          ${isDemo ? `<button type="button" class="btn soft sm" data-a="tc-cal-import-sample" style="justify-content:center">Тестовое GCal</button>` : ""}
        </div>
        <div class="field">
          <label for="tc-ics-text">Или вставьте текст расписания (.ics)</label>
          <textarea class="textarea mono tc-ics-area" id="tc-ics-text" name="icsText" rows="3" placeholder="BEGIN:VCALENDAR...">${esc(st.calImportDraft || (isDemo ? SAMPLE_GCAL_ICS : ""))}</textarea>
        </div>
        <div class="tc-cal-import-actions">
          <button type="submit" class="btn sm" style="width:100%;justify-content:center">${icon("check")}<span>Перенести занятые слоты (${esc(st.profile.timezone || "UTC+9")})</span></button>
          <button type="button" class="btn ghost sm" data-a="tc-cal-import-close" style="width:100%;justify-content:center">Отмена</button>
        </div>
      </form>` : ""}

      <div class="tc-week-nav${isPastWeek ? " is-past-week" : ""}" role="group" aria-label="Неделя календаря">
        <button type="button" class="tc-week-arrow" data-a="tc-cal-week-step" data-delta="-1" aria-label="Предыдущая неделя" title="Прошлая неделя">‹</button>
        <button type="button" class="tc-week-title-btn" data-a="tc-cal-week" data-w="0" title="Вернуться на эту неделю"><b>${esc(weekTitle)}</b><span class="small muted">${esc(weekRangeLabel)}</span></button>
        <button type="button" class="tc-week-arrow" data-a="tc-cal-week-step" data-delta="1" aria-label="Следующая неделя" title="Следующая неделя">›</button>
      </div>

      ${daysStripHTML}

      ${st.calAddOpen ? `<form class="card stack" style="gap:10px;border-color:var(--accent)" data-f="tc-cal-add">
        <div class="tc-drawer-head">
          <b>Записать своего ученика (${esc(activeDay.shortLabel)})</b>
          <button type="button" class="icon-btn sm" data-a="tc-cal-close-add" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="tc-fee1-banner">Комиссия за своего ученика — <b>всего 1% + 1% СБП</b> (на руки 98%)</div>
        <div class="tc-two-col">
          <div class="field">
            <label for="tc-add-name">Имя ученика</label>
            <input class="input" id="tc-add-name" name="studentName" required maxlength="40" placeholder="Например, Максим Р.">
          </div>
          <div class="field">
            <label for="tc-add-hour">Время (10:00–20:00)</label>
            <select class="select" id="tc-add-hour" name="hour">
              ${hours.map((h) => `<option value="${h}"${h === st.calAddHour ? " selected" : ""}>${h}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="field">
          <label for="tc-add-price">Цена урока (₽/ч)</label>
          <input class="input num" id="tc-add-price" name="offerPrice" data-a="tc-add-price" type="number" min="500" max="15000" step="50" value="${st.profile.price}">
          <span class="small muted" id="tc-add-fee-note">На руки 98%: <b class="num" style="color:var(--confirm)">${Math.max(0, st.profile.price - Math.round(st.profile.price * 0.01) * 2).toLocaleString("ru-RU")} ₽</b> · сбор 1% + 1% СБП (${(Math.round(st.profile.price * 0.01) * 2).toLocaleString("ru-RU")} ₽)</span>
        </div>
        <div class="field">
          <label for="tc-add-note">Тема / ДЗ</label>
          <input class="input" id="tc-add-note" name="note" maxlength="100" placeholder="Пробник КИМ или разбор ошибок">
        </div>
        <div class="tc-cal-import-actions">
          <button type="submit" class="btn confirm sm" style="width:100%;justify-content:center">${icon("check")}<span>Записать в календарь</span></button>
          <button type="button" class="btn ghost sm" data-a="tc-cal-close-add" style="width:100%;justify-content:center">Отмена</button>
        </div>
      </form>` : ""}

      <div class="study-day-panel${isActivePast ? " is-past-week" : ""}">
        <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
          <b>${esc(activeDay.fullLabel)}</b>
          <div class="row" style="gap:6px;align-items:center">
            ${isActivePast ? `<span class="chip tc-past-chip">${isPastWeek ? "Прошедшая неделя" : "Прошедший день"}</span>` : ""}
            <span class="chip num">${activeLessons.length} ${plural(activeLessons.length, "урок", "урока", "уроков")}</span>
          </div>
        </div>
        ${dayLessonsHTML}
      </div>
    </section>
    </div>`;
  }

  function formatWaReminderText(st, student) {
    const tpl = (st && st.waSettings && st.waSettings.template) ||
      "Здравствуйте, {имя}! Напоминаю, что скоро будет урок ({предмет}) — {день} в {время}. Ссылку отправлю перед началом.";
    return String(tpl)
      .replace(/\{имя\}/gi, student.name || "ученик")
      .replace(/\{предмет\}/gi, student.exam || "ЕГЭ")
      .replace(/\{день\}/gi, student.lessonDay || "Воскресенье")
      .replace(/\{время\}/gi, student.lessonTime || "10:00");
  }

  function studentWaHref(st, student) {
    const raw = String((student && student.whatsapp) || (isDevDemoMode() ? "79142100511" : "")).replace(/\D+/g, "");
    if (!raw) return "";
    return `https://wa.me/${raw}?text=${encodeURIComponent(formatWaReminderText(st, student))}`;
  }

  function studentReminderUrl(st, student, chId) {
    const TDATA = getTDATA();
    const msg = formatWaReminderText(st, student);
    if (TDATA && typeof TDATA.messengerUrls === "function") {
      const urls = TDATA.messengerUrls(student, msg);
      if (chId === "tg") return urls.telegram;
      if (chId === "max") return urls.max;
      return urls.whatsapp;
    }
    return studentWaHref(st, student);
  }


  function renderStudentsTab(st) {
    const p = st.profile;
    const isDemo = isDevDemoMode();
    const students = Array.isArray(st.students) ? st.students : [];
    const waCfg = st.waSettings || { enabled: true, lead: "1h", leads: ["24h", "1h"], channels: ["wa", "tg", "max"], template: "Здравствуйте, {имя}! Скоро будет урок ({предмет}) — {день} в {время}." };
    const cfgChannels = normalizeChannelList(waCfg.channels);
    const cfgLeads = normalizeLeadList(waCfg.leads);
    const sampleStudent = students.find((s) => s && s.whatsapp) || students[0] || (isDemo
      ? { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio" }
      : { id: "", name: "Имя ученика", exam: "ЕГЭ", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "", telegram: "" });
    const samplePreview = formatWaReminderText(st, sampleStudent);
    const sampleWaHref = studentWaHref(st, sampleStudent);
    const stFilter = ["all", "auto", "off"].includes(st.stTblFilter) ? st.stTblFilter : "all";

    const studentColumns = [
      {
        key: "student",
        label: "Ученик и ЕГЭ",
        render: (s) => {
          const gain = (Number(s.curScore) || 0) - (Number(s.startScore) || 0);
          return `<div style="display:grid;gap:5px;min-width:155px">
            <div class="row" style="gap:8px;align-items:center;flex-wrap:nowrap">
              <span class="tutor-avatar" aria-hidden="true">${esc(initials(s.name))}</span>
              <b>${esc(s.name)}</b>
              <span class="chip confirm num">+${gain} б.</span>
            </div>
            <span class="small muted">${esc(s.exam)} · ${s.lessonsDone} ${plural(s.lessonsDone, "урок", "урока", "уроков")} проведено</span>
          </div>`;
        }
      },
      {
        key: "progress",
        label: "Прогресс баллов",
        render: (s) => {
          const pct = Math.max(8, Math.min(100, Math.round((s.curScore / Math.max(1, s.targetScore)) * 100)));
          return `<div style="display:grid;gap:6px;min-width:165px;max-width:225px">
            <div class="row between small">
              <span class="muted">Старт: <b class="num">${s.startScore}</b> → <b class="num savings-gold-txt">${s.curScore}</b></span>
              <span class="muted">Цель: <b class="num">${s.targetScore}</b></span>
            </div>
            <div class="tc-score-track"><div class="tc-score-fill" style="width:${pct}%"></div></div>
            ${s.hw ? `<div class="small muted" style="line-height:1.4">${esc(s.hw)}</div>` : ""}
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <button type="button" class="btn soft sm" data-a="tc-student-score" data-id="${esc(s.id)}" data-delta="2">+2 б.</button>
              <button type="button" class="btn ghost sm" data-a="tc-student-lesson" data-id="${esc(s.id)}">+1 урок</button>
            </div>
          </div>`;
        }
      },
      {
        key: "slot",
        label: "Урок",
        render: (s) => {
          const day = s.lessonDay || "Воскресенье";
          const time = s.lessonTime || "10:00";
          return `<div style="display:grid;gap:6px;width:128px">
            <div class="field" style="gap:3px;min-width:0">
              <label class="small muted" for="st-day-${esc(s.id)}">День</label>
              <input class="input" id="st-day-${esc(s.id)}" data-tc-student="lessonDay" data-id="${esc(s.id)}" value="${esc(day)}" maxlength="24" placeholder="Воскресенье" style="min-height:32px;padding:5px 9px;font-size:13px">
            </div>
            <div class="field" style="gap:3px;min-width:0">
              <label class="small muted" for="st-time-${esc(s.id)}">Время</label>
              <input class="input num" id="st-time-${esc(s.id)}" data-tc-student="lessonTime" data-id="${esc(s.id)}" value="${esc(time)}" maxlength="12" placeholder="10:00" style="min-height:32px;padding:5px 9px;font-size:13px">
            </div>
          </div>`;
        }
      },
      {
        key: "contacts",
        label: "Контакты",
        render: (s) => `<div style="display:grid;gap:6px;width:170px">
          <div class="field" style="gap:3px">
            <label class="small muted" for="st-wa-${esc(s.id)}">Телефон (WA / MAX)</label>
            <input class="input num" id="st-wa-${esc(s.id)}" data-tc-student="whatsapp" data-id="${esc(s.id)}" value="${esc(formatPhone(s.whatsapp || (isDemo ? "79142100511" : "")))}" maxlength="22" placeholder="+7 (914) 000-00-00" style="min-height:32px;padding:5px 9px;font-size:13px">
          </div>
          <div class="field" style="gap:3px">
            <label class="small muted" for="st-tg-${esc(s.id)}">Telegram (@ или +7)</label>
            <input class="input" id="st-tg-${esc(s.id)}" data-tc-student="telegram" data-id="${esc(s.id)}" value="${esc(formatTelegram(s.telegram || ""))}" maxlength="36" placeholder="@login или +7..." style="min-height:32px;padding:5px 9px;font-size:13px">
          </div>
        </div>`
      },
      {
        key: "notifyActions",
        label: "Автоуведомления и связь",
        isActions: true,
        render: (s) => {
          const day = s.lessonDay || "Воскресенье";
          const time = s.lessonTime || "10:00";
          const stChannels = normalizeChannelList(s.autoChannels);
          const chBadgeTxt = stChannels.map((cid) => (AUTO_CHANNELS.find((c) => c.id === cid) || {}).short || cid.toUpperCase()).join(" · ");
          const waHref = studentWaHref(st, s);
          return `<div style="display:grid;gap:7px;justify-items:start;min-width:225px">
            <div class="row" style="gap:5px;flex-wrap:wrap;align-items:center">
              <button type="button" class="btn ${s.autoNotify ? "gold" : "soft"} sm" data-a="tc-student-autonotify" data-id="${esc(s.id)}" aria-pressed="${!!s.autoNotify}" style="min-height:26px;padding:0 9px;font-size:11.5px">
                ${icon("bell")}<span>${s.autoNotify ? `Авто: ${esc(chBadgeTxt)}` : "Вкл. авто"}</span>
              </button>
              <div class="auto-ch-bar" role="group" aria-label="Каналы автоуведомления ученика">
                ${AUTO_CHANNELS.map((ch) => {
                  const on = stChannels.includes(ch.id);
                  return `<button type="button" class="auto-ch-pill${on ? " is-on" : ""}" data-a="tc-student-autochannel" data-id="${esc(s.id)}" data-ch="${ch.id}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(ch.short || ch.name)}</button>`;
                }).join("")}
              </div>
            </div>
            <button type="button" class="btn confirm sm" data-a="tc-student-remind" data-id="${esc(s.id)}" style="white-space:nowrap">${icon("msg")}<span>Напомнить (${esc(day)}, ${esc(time)})</span></button>
            ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
              ? EGE.kit.messengerLinksHTML({
                  entity: s,
                  message: `Здравствуйте, ${s.name}! Напоминаю про занятие (${s.exam || "ЕГЭ"}, ${day} в ${time}) через Вектор.`,
                  primaryLabel: "WhatsApp",
                  compact: true
                })
              : `<a class="btn ghost sm" href="${esc(waHref)}" target="_blank" rel="noopener">Открыть WhatsApp →</a>`}
          </div>`;
        }
      }
    ];

    const studentsTableHtml = renderDataTable({
      id: "tc-students-table",
      cardWrap: false,
      showPresetSwitch: false,
      showColsSwitch: false,
      eyebrow: "Трекер баллов и связь (WhatsApp · Telegram · MAX)",
      title: "Мои ученики и автоуведомления",
      filter: stFilter,
      query: st.stTblQuery || "",
      filterAction: "tc-st-tbl-filter",
      searchAction: "tc-st-tbl-q",
      searchId: "tc-st-tbl-q",
      searchPlaceholder: "Поиск: ученик, экзамен, +7, @telegram…",
      filters: [
        { id: "all", label: `Все (${students.length})`, match: () => true },
        { id: "auto", label: `Авто-уведомления (${students.filter((s) => !!s.autoNotify).length})`, match: (s) => !!s.autoNotify },
        { id: "off", label: `Без авто (${students.filter((s) => !s.autoNotify).length})`, match: (s) => !s.autoNotify }
      ],
      columns: studentColumns,
      rows: students,
      searchFields: (s) => [s.name, s.exam, s.hw, s.lessonDay, s.lessonTime, s.whatsapp, s.telegram, String(s.curScore || "")].join(" "),
      emptyText: isDemo ? "По выбранному фильтру учеников нет." : "Учеников пока нет. Они появятся после подтверждения заявок."
    });

    return `<div class="stack" style="gap:16px">
      <section class="card stack" style="gap:12px" aria-label="Мои ученики и автонапоминания">
        ${studentsTableHtml}
      </section>

      <div class="tc-two-col" aria-label="Автоуведомления WhatsApp, Telegram и MAX">
        <div class="card stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div>
              <div class="eyebrow">WhatsApp · Telegram · MAX</div>
              <h2 class="h2">Настройка автоуведомлений</h2>
            </div>
            <button type="button" class="btn ${waCfg.enabled ? "confirm" : "soft"} sm" data-a="tc-wa-global-toggle" aria-pressed="${!!waCfg.enabled}">
              ${waCfg.enabled ? "✓ Система включена" : "Включить систему"}
            </button>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Каналы автоматической отправки:</span>
            <div class="auto-ch-bar" role="group" aria-label="Каналы автоуведомлений">
              ${AUTO_CHANNELS.map((ch) => {
                const on = cfgChannels.includes(ch.id);
                return `<button type="button" class="auto-ch-pill${on ? " is-on" : ""}" data-a="tc-wa-channel" data-ch="${ch.id}" aria-pressed="${on}">${on ? "✓ " : ""}${esc(ch.name)}</button>`;
              }).join("")}
            </div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Когда автоматически писать ученику:</span>
            <div class="chip-rail">
              ${WA_LEAD_OPTIONS.map((o) => `<button type="button" class="chip-btn${waCfg.lead === o.id ? " on" : ""}" data-a="tc-wa-lead" data-v="${esc(o.id)}">${esc(o.label)}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <label for="tc-wa-tpl">Текст напоминания (переменные: <code>{имя}</code>, <code>{предмет}</code>, <code>{день}</code>, <code>{время}</code>)</label>
            <textarea class="textarea" id="tc-wa-tpl" data-tc="waTemplate" rows="3" maxlength="260">${esc(waCfg.template || "")}</textarea>
          </div>
          <div class="tc-template-card">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <b class="small">Пример сообщения (${esc(sampleStudent.name)} · ${esc(sampleStudent.lessonDay || "Воскресенье")}, ${esc(sampleStudent.lessonTime || "10:00")})</b>
              ${sampleWaHref
                ? (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                  ? EGE.kit.messengerLinksHTML({
                      entity: sampleStudent,
                      message: samplePreview,
                      primaryLabel: "Тест в WhatsApp",
                      compact: true
                    })
                  : `<a class="btn confirm sm" href="${esc(sampleWaHref)}" target="_blank" rel="noopener">${icon("send")}<span>Тест в WhatsApp</span></a>`)
                : `<span class="small muted">Нет номера телефона</span>`}
            </div>
            <div class="tc-template-body">${esc(samplePreview)}</div>
          </div>
        </div>

        <div class="card stack" style="gap:10px">
          <div>
            <div class="eyebrow">Экономия времени</div>
            <h2 class="h2">Быстрые шаблоны ответов</h2>
          </div>
          ${QUICK_TEMPLATES.map((tpl) => {
            const text = tpl.build(p);
            return `<div class="tc-template-card">
              <div class="row between" style="gap:8px;flex-wrap:wrap">
                <b class="small">${esc(tpl.title)}</b>
                <button type="button" class="btn soft sm" data-a="tc-copy-tpl" data-id="${esc(tpl.id)}">Копировать</button>
              </div>
              <div class="tc-template-body">${esc(text)}</div>
            </div>`;
          }).join("")}
        </div>
      </div>
    </div>`;
  }

  function renderLeadsTab(st, TDATA) {
    const leadsAll = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];
    const tutorSubjs = Array.isArray(st.profile.subjects) && st.profile.subjects.length ? st.profile.subjects : [st.profile.subject || "bio"];
    const tutorSubjSet = new Set(tutorSubjs);
    const mineOnly = !!st.leadsMineOnly;
    const filtered = mineOnly
      ? leadsAll.filter((lead) => {
          const sArr = Array.isArray(lead.subjects) ? lead.subjects : [];
          return sArr.some((id) => tutorSubjSet.has(id));
        })
      : leadsAll;
    const tutorSubjLabels = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(tutorSubjs).join(", ") : "вашим предметам";
    const leadCounterMap = (st.leadCounterPrices && typeof st.leadCounterPrices === "object") ? st.leadCounterPrices : {};
    const getLeadCounterRate = (lead) => {
      const budget = Number(lead.targetPrice) || st.profile.price;
      const raw = leadCounterMap[lead.id] || lead.counterPrice || budget;
      return Math.max(500, Math.min(5000, Math.round(Number(raw) || budget)));
    };

    const leadColumns = [
      {
        key: "studentSubjects",
        label: "Ученик и предметы",
        render: (lead) => {
          const subjIds = Array.isArray(lead.subjects) ? lead.subjects : [];
          const subjNames = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(subjIds) : subjIds;
          return `<div style="display:grid;gap:6px;min-width:165px">
            <div class="row" style="gap:8px;align-items:center;flex-wrap:nowrap">
              <span class="tutor-avatar" aria-hidden="true">${esc(initials(lead.studentName))}</span>
              <div style="display:grid;gap:2px;min-width:0">
                <b>${esc(lead.studentName)}</b>
                <span class="small muted">${esc(lead.exam)} · ${esc(lead.format)}</span>
              </div>
            </div>
            <div class="row" style="gap:4px;flex-wrap:wrap">
              ${subjNames.map((nm, idx) => `<span class="chip ${tutorSubjSet.has(subjIds[idx]) ? "accent" : ""}">${esc(nm)}</span>`).join("")}
              ${lead.mine ? '<span class="chip gold">Свежая из кабинета ученика</span>' : ""}
            </div>
          </div>`;
        }
      },
      {
        key: "comment",
        label: "Запрос ученика",
        render: (lead) => `<div class="small ink2" style="min-width:170px;max-width:260px;line-height:1.45">${esc(lead.comment || "—")}</div>`
      },
      {
        key: "scheduleAndBudget",
        label: "График и бюджет",
        render: (lead) => {
          const budget = Number(lead.targetPrice) || st.profile.price;
          return `<div style="display:grid;gap:4px;min-width:125px">
            <b class="small" style="white-space:nowrap">${esc(lead.scheduleNote || "Гибкий график")}</b>
            <span class="small muted">${esc(lead.createdAt || "Сегодня")}</span>
            <span class="small muted num" style="white-space:nowrap">Бюджет: <b style="color:var(--ink)">${budget.toLocaleString("ru-RU")} ₽/ч</b></span>
          </div>`;
        }
      },
      {
        key: "counterPrice",
        label: "Ваша контр-цена ±50 ₽",
        num: true,
        align: "left",
        render: (lead) => {
          const budget = Number(lead.targetPrice) || st.profile.price;
          const counterRate = getLeadCounterRate(lead);
          const delta = counterRate - budget;
          const deltaLabel = delta === 0
            ? "= бюджету"
            : (delta > 0 ? `+${delta.toLocaleString("ru-RU")} ₽ к бюджету` : `−${Math.abs(delta).toLocaleString("ru-RU")} ₽`);
          const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(counterRate) : { payout: Math.max(0, counterRate - Math.round(counterRate * 0.05) - Math.round(counterRate * 0.01)) };
          return `<div style="display:grid;gap:6px;justify-items:start;min-width:210px">
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-lead-step" data-id="${esc(lead.id)}" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout" style="gap:3px">
                <input class="num" type="number" step="50" min="500" max="5000" data-a="tc-lead-rate" data-id="${esc(lead.id)}" value="${counterRate}" aria-label="Ваша контр-цена для ${esc(lead.studentName)}" style="width:52px;border:0;background:transparent;text-align:right;font:inherit;font-weight:700;color:var(--ink);padding:0;outline:none">
                <span class="small muted">₽/ч</span>
              </div>
              <button type="button" class="hh-step-btn" data-a="tc-lead-step" data-id="${esc(lead.id)}" data-step="50">+50 ₽</button>
            </div>
            <span class="small muted num" style="white-space:nowrap"><span data-tc-lead-delta="${esc(lead.id)}">${deltaLabel}</span> · На руки 94%: <b class="savings-gold-txt" data-tc-lead-payout="${esc(lead.id)}">${sp.payout.toLocaleString("ru-RU")} ₽</b></span>
          </div>`;
        }
      },
      {
        key: "actions",
        label: "Отклик и связь",
        isActions: true,
        render: (lead) => {
          const counterRate = getLeadCounterRate(lead);
          const waHref = TDATA && typeof TDATA.studentLeadWhatsappUrl === "function"
            ? TDATA.studentLeadWhatsappUrl(lead, `Здравствуйте, ${lead.studentName}! Я преподаватель ${st.profile.name} (${tutorSubjLabels}). Готов(а) провести урок по вашей заявке (${counterRate} ₽/ч).`)
            : "";
          return `<div style="display:grid;gap:7px;justify-items:start;min-width:205px">
            ${lead.responded ? '<span class="bb-tbl-st is-confirmed">✓ Вы написали ученику</span>' : '<span class="bb-tbl-st is-pending">Ищет преподавателя</span>'}
            <button type="button" class="btn ${lead.responded ? "soft" : ""} sm" data-a="tc-lead-offer" data-id="${esc(lead.id)}">${lead.responded ? `✓ Отклик ${counterRate} ₽` : `Предложить ${counterRate.toLocaleString("ru-RU")} ₽/ч`}</button>
            ${waHref ? (EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
              ? EGE.kit.messengerLinksHTML({
                  entity: { id: lead.id, name: lead.studentName, whatsapp: lead.whatsapp || (isDevDemoMode() ? "79142100511" : "") },
                  message: `Здравствуйте, ${lead.studentName}! Вижу ваш запрос по предмету ${lead.subjectName || "ЕГЭ"}. Готов(а) провести урок по ставке ${counterRate} ₽/ч.`,
                  primaryLabel: "Написать ученику · WA",
                  compact: true
                })
              : `<a class="btn confirm sm" href="${esc(waHref)}" target="_blank" rel="noopener">${icon("msg")}<span>Написать ученику</span></a>`) : ""}
          </div>`;
        }
      }
    ];

    const leadsModeSwitchHtml = `<div class="hh-seg" role="group" aria-label="Фильтр заявок учеников">
      <button type="button" data-a="tc-leads-mode" data-v="all" aria-pressed="${!mineOnly}">Все заявки (${leadsAll.length})</button>
      <button type="button" data-a="tc-leads-mode" data-v="mine" aria-pressed="${mineOnly}">По моим предметам</button>
    </div>`;

    const leadsTableHtml = filtered.length
      ? renderDataTable({
          id: "tc-leads-table",
          cardWrap: false,
          showPresetSwitch: false,
          showColsSwitch: false,
          eyebrow: "Встречный поток из кабинета ученика",
          title: `Заявки учеников, которые ищут преподавателя (${filtered.length})`,
          toolbarExtraHTML: leadsModeSwitchHtml,
          query: st.leadsTblQuery || "",
          filterAction: "tc-leads-tbl-filter",
          searchAction: "tc-leads-tbl-q",
          searchId: "tc-leads-tbl-q",
          searchPlaceholder: "Поиск: имя, предмет, запрос, бюджет…",
          filters: [],
          columns: leadColumns,
          rows: filtered,
          searchFields: (lead) => {
            const subjIds = Array.isArray(lead.subjects) ? lead.subjects : [];
            const subjNames = TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(subjIds) : subjIds;
            return [lead.studentName, lead.exam, lead.format, lead.comment, lead.scheduleNote, String(lead.targetPrice || ""), subjNames.join(" ")].join(" ");
          },
          emptyText: "По поисковому запросу заявок учеников не найдено."
        })
      : `<div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">Встречный поток из кабинета ученика</div>
            <h2 class="h2">Заявки учеников, которые ищут преподавателя (0)</h2>
          </div>
          ${leadsModeSwitchHtml}
        </div>
        <div class="empty"><b>По выбранному предмету заявок учеников пока нет</b><span>Отключите фильтр или дождитесь новых запросов из кабинета ученика.</span></div>`;

    return `<section class="card stack" style="gap:12px" aria-label="Таблица заявок учеников">
      ${leadsTableHtml}
      <div class="small muted">Ваши предметы из «Профиля»: <b>${esc(tutorSubjLabels)}</b>.</div>
    </section>`;
  }


  Object.assign(TC, {
    collectTutorStudents,
    renderCalendarTab,
    formatWaReminderText,
    studentWaHref,
    studentReminderUrl,
    renderStudentsTab,
    renderLeadsTab
  });
})();
