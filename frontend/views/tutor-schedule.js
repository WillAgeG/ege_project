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
    getCtx, configure, getTDATA, getTutorSlug, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    ensureCountdownTimer, ensureRealtimeConnected, clampStep, profileCompleteness,
    buildMarketTutorPayload, syncPublishedTutor, dayDowFromLabel, syncedRequests,
    findReq, updateReq, pendingCount, renderDataTable, getTab, setTab, toggleArrayVal
  } = TC;

  function renderCalendarTab(st, TDATA, allReqs) {
    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    const weekOffset = st.calWeek ? 1 : 0;
    const weekDays = (TDATA && typeof TDATA.buildWeekDays === "function")
      ? TDATA.buildWeekDays(weekOffset)
      : DAY_LIST.map((d, i) => ({ dow: Number(d.dow), wd: d.wd, wdLong: d.full.toLowerCase(), num: 14 + i, month: "нояб.", shortLabel: `${d.wd}, ${14 + i} нояб.`, fullLabel: `${d.full.toLowerCase()}, ${14 + i} нояб.`, iso: "" }));
    const activeDay = weekDays.find((d) => String(d.dow) === String(st.activeDow)) || weekDays[5] || weekDays[0];
    const dowStr = String(activeDay.dow);
    const dayKeyByDow = { "1": "mon", "2": "tue", "3": "wed", "4": "thu", "5": "fri", "6": "sat", "0": "sun" };
    const activeDayKey = dayKeyByDow[dowStr] || "sat";
    const dayOpenSlots = Array.isArray(st.slots[dowStr]) ? st.slots[dowStr] : [];
    const activeLessons = allReqs.filter((r) => r.status === "accepted" && (String(r.dow || dayDowFromLabel(r.dayLabel)) === dowStr));
    const weekCount = allReqs.filter((r) => r.status === "accepted").length;

    const rtCal = (EGE.realtime && typeof EGE.realtime.getState === "function") ? EGE.realtime.getState().calendar : null;
    const cs = st.calendarSync || {};
    const busySlots = (Array.isArray(cs.busySlots) && cs.busySlots.length)
      ? cs.busySlots
      : ((rtCal && Array.isArray(rtCal.busySlots)) ? rtCal.busySlots : []);
    const busyForActiveDay = busySlots.filter((b) => String(b.day || "") === activeDayKey || (b.dow !== undefined && b.dow !== null && b.dow !== "" && String(b.dow) === dowStr));
    const gcalConnected = !!(cs.gcalConnected || busySlots.length > 0);

    return `<div class="stack" style="gap:14px">
      <div class="card stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">Живое расписание · 10:00–20:00</div>
            <h2 class="h2">Календарь записанных учеников (${weekCount})</h2>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            ${gcalConnected ? `<span class="chip confirm">✓ GCal подключён</span>` : ""}
            <button type="button" class="btn soft sm" data-a="tc-cal-open-add" data-hour="${hours[0]}">+ Записать ученика</button>
            <button type="button" class="btn ghost sm" data-a="tc-copy-day">Скопировать день</button>
            <button type="button" class="btn ghost sm" data-a="tc-cal-import-modal">Календарь Google / Apple</button>
          </div>
        </div>

        ${st.calImportOpen ? `<form class="card stack" style="gap:10px;border-color:var(--accent)" data-f="tc-cal-import">
          <div class="row between" style="gap:8px">
            <b>Подключить календарь Google / Apple / Яндекс</b>
            <button type="button" class="icon-btn sm" data-a="tc-cal-import-close" aria-label="Закрыть">${icon("x")}</button>
          </div>
          <div class="field">
            <label for="tc-ics-text">Вставьте экспортированный файл расписания (.ics) из вашего календаря — занятые часы автоматически скроются из записи</label>
            <textarea class="textarea" id="tc-ics-text" name="icsText" rows="5" placeholder="Скопируйте содержимое файла .ics из Google, Apple или Яндекс Календаря">${esc(st.calImportDraft || SAMPLE_GCAL_ICS)}</textarea>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="submit" class="btn sm">${icon("check")}<span>Перенести занятые слоты (${esc(st.profile.timezone || "UTC+9")})</span></button>
            <button type="button" class="btn soft sm" data-a="tc-cal-import-sample">Тестовое расписание GCal</button>
            <button type="button" class="btn ghost sm" data-a="tc-cal-import-close">Отмена</button>
          </div>
        </form>` : ""}

        <div class="hh-seg equal" role="group" aria-label="Неделя календаря">
          <button type="button" data-a="tc-cal-week" data-w="0" aria-pressed="${weekOffset === 0}"><span>Эта неделя</span></button>
          <button type="button" data-a="tc-cal-week" data-w="1" aria-pressed="${weekOffset === 1}"><span>Следующая неделя</span></button>
        </div>

        <div class="cal-days" aria-label="Выбор дня недели">
          ${weekDays.map((d) => {
            const k = String(d.dow);
            const openCnt = Array.isArray(st.slots[k]) ? st.slots[k].length : 0;
            const bookedCnt = allReqs.filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === k).length;
            const sel = k === dowStr;
            return `<button type="button" class="day-cir${sel ? " on" : ""}" data-a="tc-day" data-dow="${k}">
              <span class="day-wd">${esc(d.wd)} · ${esc(d.num)}</span>
              <span class="day-dot">${bookedCnt}</span>
              <span class="day-cnt">${bookedCnt ? plural(bookedCnt, "ученик", "ученика", "учеников") : (openCnt + " ок.")}</span>
            </button>`;
          }).join("")}
        </div>
      </div>

      ${st.calAddOpen ? `<form class="card stack" style="gap:10px;border-color:var(--accent)" data-f="tc-cal-add">
        <div class="row between" style="gap:8px">
          <b>Добавить ученика в расписание (${esc(activeDay.shortLabel)})</b>
          <button type="button" class="icon-btn sm" data-a="tc-cal-close-add" aria-label="Закрыть">${icon("x")}</button>
        </div>
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
        <div class="tc-two-col">
          <div class="field">
            <label for="tc-add-price">Ставка за урок (₽/ч)</label>
            <input class="input num" id="tc-add-price" name="offerPrice" type="number" min="500" max="5000" step="50" value="${st.profile.price}">
          </div>
          <div class="field">
            <label for="tc-add-note">Тема / ДЗ</label>
            <input class="input" id="tc-add-note" name="note" maxlength="100" placeholder="Пробник КИМ или разбор ошибок">
          </div>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="submit" class="btn sm">${icon("check")}<span>Записать в календарь</span></button>
          <button type="button" class="btn ghost sm" data-a="tc-cal-close-add">Отмена</button>
        </div>
      </form>` : ""}

      <div class="card stack" style="gap:10px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <b>Почасовая сетка: ${esc(activeDay.fullLabel)}</b>
          <span class="small muted">${activeLessons.length} ${plural(activeLessons.length, "занятие", "занятия", "занятий")} · ${dayOpenSlots.length} открытых окон</span>
        </div>
        <div class="tc-cal-hours">
          ${hours.map((h) => {
            const lesson = activeLessons.find((r) => r.hour === h);
            const gcalBusy = busyForActiveDay.find((b) => b.hour === h);
            const isOpen = dayOpenSlots.includes(h);
            if (lesson) {
              const rate = Number(lesson.counterPrice || lesson.offerPrice) || st.profile.price;
              const isAcc = lesson.status === "accepted";
              return `<div class="tc-cal-slot ${isAcc ? "is-booked" : "is-pending"}">
                <div class="row" style="gap:12px;min-width:0;flex:1 1 240px">
                  <span class="tc-cal-time">${h}</span>
                  <div class="stack" style="gap:2px;min-width:0">
                    <div class="row" style="gap:6px;flex-wrap:wrap">
                      <b>${esc(lesson.studentName)}</b>
                      <span class="chip ${isAcc ? "confirm" : "notif"}">${isAcc ? "✓ Подтверждён" : "Ждёт ответа"}</span>
                      <span class="chip num">${rate.toLocaleString("ru-RU")} ₽/ч</span>
                      ${gcalBusy ? `<span class="chip bad">Конфликт GCal</span>` : ""}
                    </div>
                    <span class="small muted">${esc(lesson.exam)} · ${esc(lesson.subjectName)}${lesson.note ? " — " + esc(lesson.note) : ""}</span>
                  </div>
                </div>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  ${!isAcc ? `<button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(lesson.id)}">Подтвердить</button>` : ""}
                  ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                    ? EGE.kit.messengerLinksHTML({
                        entity: { id: lesson.id, name: lesson.studentName, whatsapp: lesson.whatsapp || "79142100511" },
                        message: `Здравствуйте, ${lesson.studentName}! По занятию (${lesson.subjectName}, ${h}) на платформе Вектор ЕГЭ.`,
                        primaryLabel: "WA",
                        compact: true
                      })
                    : `<button type="button" class="btn soft sm" data-a="tc-req-msg" data-id="${esc(lesson.id)}">${icon("msg")}<span>Чат</span></button>`}
                  <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(lesson.id)}">Снять</button>
                </div>
              </div>`;
            }
            if (gcalBusy) {
              return `<div class="tc-cal-slot is-gcal-busy">
                <div class="row" style="gap:10px;min-width:0;flex:1 1 220px;flex-wrap:wrap;align-items:center">
                  <span class="tc-cal-time">${h}</span>
                  <span class="badge">Занято в GCal</span>
                  <span class="small">${esc(gcalBusy.summary || "Событие Google Calendar")}</span>
                </div>
                <div class="row" style="gap:6px;flex-wrap:wrap">
                  <span class="small muted">Пересчитано в ${esc(st.profile.timezone || "UTC+9")}</span>
                </div>
              </div>`;
            }
            return `<div class="tc-cal-slot${isOpen ? " is-open" : ""}">
              <div class="row" style="gap:12px;min-width:0">
                <span class="tc-cal-time">${h}</span>
                <span class="small ${isOpen ? "ink2" : "muted"}">${isOpen ? "Окно открыто — доступно ученикам в /market" : "Час закрыт для записи"}</span>
              </div>
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <button type="button" class="btn soft sm" data-a="tc-cal-open-add" data-hour="${h}">+ Записать</button>
                <button type="button" class="btn ghost sm" data-a="tc-slot-toggle" data-hour="${h}" aria-pressed="${isOpen}">${isOpen ? "Закрыть час" : "Открыть час"}</button>
              </div>
            </div>`;
          }).join("")}
        </div>
      </div>
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
    const phone = String((student && student.whatsapp) || "79142100511").replace(/\D+/g, "") || "79142100511";
    return `https://wa.me/${phone}?text=${encodeURIComponent(formatWaReminderText(st, student))}`;
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
    const students = Array.isArray(st.students) ? st.students : [];
    const waCfg = st.waSettings || { enabled: true, lead: "2h", channels: ["wa", "tg", "max"], template: "Здравствуйте, {имя}! Скоро будет урок ({предмет}) — {день} в {время}." };
    const cfgChannels = normalizeChannelList(waCfg.channels);
    const sampleStudent = students[0] || { id: "st-alina", name: "Алина С.", exam: "ЕГЭ · Биология", lessonDay: "Воскресенье", lessonTime: "10:00", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio" };
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
            <input class="input num" id="st-wa-${esc(s.id)}" data-tc-student="whatsapp" data-id="${esc(s.id)}" value="${esc(formatPhone(s.whatsapp || "79142100511"))}" maxlength="22" placeholder="+7 (914) 000-00-00" style="min-height:32px;padding:5px 9px;font-size:13px">
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
                  message: `Здравствуйте, ${s.name}! Напоминаю про занятие (${s.exam || "ЕГЭ"}, ${day} в ${time}) через Вектор ЕГЭ.`,
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
      emptyText: "По выбранному фильтру учеников нет."
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
              ${EGE.kit && typeof EGE.kit.messengerLinksHTML === "function"
                ? EGE.kit.messengerLinksHTML({
                    entity: sampleStudent,
                    message: samplePreview,
                    primaryLabel: "Тест в WhatsApp",
                    compact: true
                  })
                : `<a class="btn confirm sm" href="${esc(sampleWaHref)}" target="_blank" rel="noopener">${icon("send")}<span>Тест в WhatsApp</span></a>`}
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
          const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(counterRate) : { payout: Math.round(counterRate * 0.95) };
          return `<div style="display:grid;gap:6px;justify-items:start;min-width:210px">
            <div class="hh-price-stepper compact">
              <button type="button" class="hh-step-btn" data-a="tc-lead-step" data-id="${esc(lead.id)}" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout" style="gap:3px">
                <input class="num" type="number" step="50" min="500" max="5000" data-a="tc-lead-rate" data-id="${esc(lead.id)}" value="${counterRate}" aria-label="Ваша контр-цена для ${esc(lead.studentName)}" style="width:52px;border:0;background:transparent;text-align:right;font:inherit;font-weight:700;color:var(--ink);padding:0;outline:none">
                <span class="small muted">₽/ч</span>
              </div>
              <button type="button" class="hh-step-btn" data-a="tc-lead-step" data-id="${esc(lead.id)}" data-step="50">+50 ₽</button>
            </div>
            <span class="small muted num" style="white-space:nowrap"><span data-tc-lead-delta="${esc(lead.id)}">${deltaLabel}</span> · На руки 95%: <b class="savings-gold-txt" data-tc-lead-payout="${esc(lead.id)}">${sp.payout.toLocaleString("ru-RU")} ₽</b></span>
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
                  entity: { id: lead.id, name: lead.studentName, whatsapp: lead.whatsapp || "79142100511" },
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
    renderCalendarTab,
    formatWaReminderText,
    studentWaHref,
    studentReminderUrl,
    renderStudentsTab,
    renderLeadsTab
  });
})();
