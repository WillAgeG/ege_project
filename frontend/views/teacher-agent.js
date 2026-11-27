/* Представление ИИ-помощника преподавателя вуза (/teacher-agent и вкладка в /tutor). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc } = EGE.utils || { esc: (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])) };

  let _ctx = {};
  let _loadPromise = null;

  const DEFAULT_DATA = {
    standState: {
      stand_now_iso: "2026-12-02T08:00:00+09:00",
      schedule_outage: "0",
      pdf_conflict_enabled: "0",
      prompt_injection_enabled: "0"
    },
    config: {
      model: "ai-sage/GigaChat3-10B-A1.8B",
      baseUrl: "https://contest.ctai.dev/v1",
      gigachatEnabled: false,
      tzName: "Asia/Yakutsk"
    },
    courses: [
      {
        id: "db",
        code: "DB-2026",
        title: "Базы данных",
        description: "Реляционные базы данных, SQL JOIN и агрегация.",
        groups: ["ИС-21"],
        templateSteps: [
          { id: "db-join-theory", kind: "theory", badge: "Практика 4", title: "SQL JOIN: INNER и LEFT JOIN" },
          { id: "db-join-check", kind: "practice", qtype: "single", badge: "Мини-проверка", title: "Различие INNER JOIN и LEFT JOIN" }
        ]
      },
      {
        id: "da",
        code: "DA-2026",
        title: "Анализ данных",
        description: "Аналитические витрины, SQL JOIN и экспорт CSV.",
        groups: ["ПИ-22"],
        templateSteps: [
          { id: "da-join-theory", kind: "theory", badge: "Тема 4", title: "SQL JOIN и выгрузка CSV" }
        ]
      }
    ],
    schedule: [
      { id: "les-db-join", courseId: "db", courseTitle: "Базы данных", groupName: "ИС-21", dateIso: "2026-12-02", startTime: "09:00", endTime: "10:30", durationMin: 90, kind: "практика", topic: "SQL JOIN", room: "аудитория А-305", status: "scheduled", statusNote: "" },
      { id: "les-da-join", courseId: "da", courseTitle: "Анализ данных", groupName: "ПИ-22", dateIso: "2026-12-02", startTime: "11:00", endTime: "12:30", durationMin: 90, kind: "практика", topic: "SQL JOIN", room: "аудитория Б-204", status: "scheduled", statusNote: "" },
      { id: "les-db-agg", courseId: "db", courseTitle: "Базы данных", groupName: "ИС-21", dateIso: "2026-12-04", startTime: "14:00", endTime: "15:30", durationMin: 90, kind: "практика", topic: "Агрегация", room: "аудитория А-305", status: "scheduled", statusNote: "" }
    ],
    materials: [
      { id: "db-prac-4", courseId: "db", docTitle: "Методические указания по курсу «Базы данных»", section: "Практика 4", title: "SQL JOIN (INNER и LEFT JOIN)", deliverableFormat: "SQL-файл (.sql) и пояснение", deadline: null },
      { id: "da-topic-4", courseId: "da", docTitle: "Рабочая тетрадь по курсу «Анализ данных»", section: "Тема 4", title: "SQL JOIN и витрина CSV", deliverableFormat: "CSV-файл и вывод", deadline: null }
    ],
    drafts: [],
    publications: [],
    presentations: [],
    groupMessages: [
      { id: "m1", courseId: "db", groupName: "ИС-21", senderRole: "student", senderName: "Староста ИС-21 (демо)", body: "Здравствуйте! Подскажите требования и срок сдачи Практики 4 по SQL JOIN.", createdAt: "2026-12-02T07:50:00Z" },
      { id: "m2", courseId: "da", groupName: "ПИ-22", senderRole: "student", senderName: "Староста ПИ-22 (демо)", body: "Добрый день! По Теме 4 сдаём таблицу в CSV?", createdAt: "2026-12-02T07:55:00Z" }
    ],
    traces: []
  };

  const state = {
    loaded: false,
    busy: false,
    standOpen: false,
    rightTab: "draft",
    usage: null,
    chatInput: "",
    selectedCourse: "",
    pendingFile: null,
    messages: [],
    activeDraftId: "",
    draftEdits: {},
    activePreview: null,
    activeCourseId: "db",
    courseFormOpen: false,
    stepFormOpen: false,
    matFormOpen: false,
    lessonFormOpen: false,
    rescheduleLessonId: "",
    cancelLessonId: "",
    chatGroupKey: "db::ИС-21",
    groupMsgText: "",
    newCourse: { code: "", title: "", groups: "ИС-21", description: "" },
    newStep: { kind: "theory", qtype: "single", title: "", body: "" },
    newMat: { docTitle: "Методические указания", section: "Практика", title: "", contentMd: "", deliverableFormat: "" },
    newLesson: { courseId: "db", groupName: "ИС-21", dateIso: "2026-12-03", startTime: "10:00", endTime: "11:30", topic: "", kind: "практика", room: "А-305" },
    reschedForm: { dateIso: "2026-12-03", startTime: "12:00", endTime: "13:30", room: "", note: "", createAnnouncementDraft: true },
    cancelForm: { note: "Занятие отменено", createAnnouncementDraft: true },
    data: JSON.parse(JSON.stringify(DEFAULT_DATA))
  };

  const QUICK_PROMPTS = [
    { label: "Что сегодня?", text: "Что у меня сегодня?" },
    { label: "Что сдавать по JOIN?", text: "Что сдавать по JOIN?" },
    { label: "План и ДЗ по JOIN (ИС-21)", text: "Подготовь план и задание по JOIN для ИС-21" },
    { label: "Срок Практики 4?", text: "Какой дедлайн практики по JOIN для ИС-21?" },
    { label: "Задать срок и предпросмотр", text: "Задай срок 06.12.2026 в 18:00 и опубликуй" },
    { label: "Слайды PPTX", text: "Сделай слайды по JOIN для ИС-21" }
  ];

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function renderApp() {
    if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender(false);
  }

  function notify(msg) {
    if (typeof _ctx.toast === "function") _ctx.toast(msg);
  }

  function syncActiveDraftEdits(draft) {
    if (!draft) return;
    state.activeDraftId = draft.id;
    state.draftEdits = {
      title: draft.title || "",
      groupName: draft.groupName || "",
      deadline: draft.deadline || "",
      contentMd: draft.contentMd || ""
    };
  }

  function applyServerState(payload) {
    if (!payload || typeof payload !== "object") return;
    state.loaded = true;
    state.data = {
      standState: payload.standState || DEFAULT_DATA.standState,
      config: payload.config || DEFAULT_DATA.config,
      courses: Array.isArray(payload.courses) ? payload.courses : DEFAULT_DATA.courses,
      schedule: Array.isArray(payload.schedule) ? payload.schedule : DEFAULT_DATA.schedule,
      materials: Array.isArray(payload.materials) ? payload.materials : DEFAULT_DATA.materials,
      drafts: Array.isArray(payload.drafts) ? payload.drafts : [],
      publications: Array.isArray(payload.publications) ? payload.publications : [],
      presentations: Array.isArray(payload.presentations) ? payload.presentations : [],
      groupMessages: Array.isArray(payload.groupMessages) ? payload.groupMessages : [],
      traces: Array.isArray(payload.traces) ? payload.traces : []
    };
    if (!state.activeDraftId && state.data.drafts.length) {
      syncActiveDraftEdits(state.data.drafts[0]);
    } else if (state.activeDraftId) {
      const found = state.data.drafts.find((d) => d.id === state.activeDraftId);
      if (found) syncActiveDraftEdits(found);
      else if (state.data.drafts.length) syncActiveDraftEdits(state.data.drafts[0]);
      else { state.activeDraftId = ""; state.draftEdits = {}; }
    }
    if (state.data.courses.length && !state.data.courses.some((c) => c.id === state.activeCourseId)) {
      state.activeCourseId = state.data.courses[0].id;
    }
  }

  async function apiCall(path, opts) {
    if (typeof fetch !== "function") return null;
    const reqOpts = Object.assign({ headers: {} }, opts || {});
    if (!(reqOpts.body instanceof FormData) && reqOpts.body && !reqOpts.headers["Content-Type"]) {
      reqOpts.headers["Content-Type"] = "application/json";
    }
    const resp = await fetch(path, reqOpts);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const detail = data && data.detail;
      const msg = (detail && typeof detail === "object" ? detail.message : detail) || data.error || ("HTTP " + resp.status);
      const err = new Error(msg);
      err.status = resp.status;
      err.detail = detail;
      throw err;
    }
    return data;
  }

  function ensureLoaded(force) {
    if ((state.loaded && !force) || _loadPromise) return _loadPromise;
    if (typeof fetch !== "function") return null;
    _loadPromise = apiCall("/api/teacher-agent/state")
      .then((res) => { applyServerState(res); renderApp(); return res; })
      .catch(() => null)
      .finally(() => { _loadPromise = null; });
    return _loadPromise;
  }

  async function refreshState() {
    try {
      const res = await apiCall("/api/teacher-agent/state");
      applyServerState(res);
    } catch (e) { /* игнор при офлайн-смоке */ }
    renderApp();
  }

  function currentDraft() {
    return (state.data.drafts || []).find((d) => d.id === state.activeDraftId) || null;
  }

  function lessonStatusLabel(st) {
    if (st === "cancelled") return `<span class="ta-pill is-bad">Отменена</span>`;
    if (st === "rescheduled") return `<span class="ta-pill is-warn">Перенесена</span>`;
    return `<span class="ta-pill is-ok">По расписанию</span>`;
  }

  function renderDraftTabHTML() {
    const drafts = state.data.drafts || [];
    const cur = currentDraft();
    const presList = state.data.presentations || [];
    const latestPres = presList[0] || null;
    const prev = state.activePreview;

    const presCard = latestPres
      ? `<div class="ta-card">
          <div class="ta-row-between">
            <b>Презентация PPTX: ${esc(latestPres.topic)} (${esc(latestPres.groupName)})</b>
            <span class="ta-pill is-accent">${esc(String((latestPres.slides || []).length || 5))} слайдов</span>
          </div>
          <div class="small muted">Редактируемый файл со ссылками на источники курса.</div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <a class="btn sm" href="/api/teacher-agent/presentations/${esc(latestPres.id)}/download" download>Скачать ${esc(latestPres.filename)}</a>
          </div>
        </div>`
      : "";

    if (!cur) {
      return `${presCard}<div class="ta-card">
        <b>Черновиков пока нет</b>
        <span class="small muted">Попросите агента подготовить план занятия, домашнее задание, объявление или загрузите .sql работу студента.</span>
      </div>`;
    }

    const switcher = drafts.length > 1
      ? `<div class="row" style="gap:6px;flex-wrap:wrap">${drafts.map((d) => `<button type="button" class="chip-btn${d.id === cur.id ? " on" : ""}" data-a="ta-select-draft" data-id="${esc(d.id)}">${esc(d.title.slice(0, 34))} · v${d.version}</button>`).join("")}</div>`
      : "";

    const previewBox = prev && prev.draftId === cur.id
      ? `<div class="ta-card is-preview" id="ta-preview-box">
          <div class="ta-row-between">
            <b>Предпросмотр публикации (версия v${prev.version})</b>
            <span class="ta-pill is-warn">Ожидает подтверждения</span>
          </div>
          <div class="small"><b>Курс:</b> ${esc(prev.courseTitle)} · <b>Группа:</b> ${esc(prev.groupName)} · <b>Срок:</b> ${esc(prev.deadline || "без срока")}</div>
          <div class="small" style="white-space:pre-wrap">${esc(prev.contentMd)}</div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn confirm sm" data-a="ta-draft-publish" data-id="${esc(cur.id)}">Подтвердить и опубликовать</button>
            <button type="button" class="btn ghost sm" data-a="ta-draft-cancel" data-id="${esc(cur.id)}">Отмена</button>
          </div>
        </div>`
      : "";

    const planHTML = (cur.plan && cur.plan.length)
      ? `<div><b class="small">Этапы занятия (${cur.plan.reduce((s, x) => s + Number(x.minutes || 0), 0)} мин):</b>
          <ul class="ta-plan-list">${cur.plan.map((p) => `<li class="ta-step-item"><span>${esc(p.stage)} · ${esc(p.activity || "")}</span><span class="ta-pill ta-num">${esc(String(p.minutes))} мин</span></li>`).join("")}</ul>
        </div>`
      : "";

    return `${switcher}
      ${previewBox}
      <div class="ta-card">
        <div class="ta-row-between">
          <b>Черновик · ${esc(cur.kind)} · v${cur.version}</b>
          <span class="ta-pill">${esc(cur.status === "published" ? "Опубликован" : (cur.status === "previewed" ? "Предпросмотр" : "Черновик"))}</span>
        </div>
        <div class="ta-form-grid">
          <input class="ta-input" id="ta-draft-title" data-ta-input="draftTitle" value="${esc(state.draftEdits.title || "")}" placeholder="Заголовок">
          <div class="ta-two-cols">
            <input class="ta-input" id="ta-draft-group" data-ta-input="draftGroup" value="${esc(state.draftEdits.groupName || "")}" placeholder="Группа (ИС-21)">
            <input class="ta-input" id="ta-draft-deadline" data-ta-input="draftDeadline" value="${esc(state.draftEdits.deadline || "")}" placeholder="Срок сдачи (06.12.2026 18:00)">
          </div>
          <textarea class="ta-textarea" id="ta-draft-content" data-ta-input="draftContent" rows="8">${esc(state.draftEdits.contentMd || "")}</textarea>
        </div>
        ${planHTML}
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn soft sm" data-a="ta-draft-save" data-id="${esc(cur.id)}">Сохранить правки</button>
          <button type="button" class="btn sm" data-a="ta-draft-preview" data-id="${esc(cur.id)}">Предпросмотр публикации</button>
        </div>
      </div>
      ${presCard}`;
  }

  function renderScheduleTabHTML() {
    const lessons = state.data.schedule || [];
    const courses = state.data.courses || [];
    const nl = state.newLesson;
    const addForm = state.lessonFormOpen
      ? `<form class="ta-card ta-form-grid" data-f="ta-lesson-form">
          <b>Новое занятие в расписании</b>
          <div class="ta-two-cols">
            <select class="ta-select" data-ta-input="nlCourse">${courses.map((c) => `<option value="${esc(c.id)}"${c.id === nl.courseId ? " selected" : ""}>${esc(c.title)}</option>`).join("")}</select>
            <input class="ta-input" data-ta-input="nlGroup" value="${esc(nl.groupName)}" placeholder="Группа (ИС-21)">
          </div>
          <div class="ta-two-cols">
            <input class="ta-input" data-ta-input="nlDate" value="${esc(nl.dateIso)}" placeholder="YYYY-MM-DD">
            <input class="ta-input" data-ta-input="nlRoom" value="${esc(nl.room)}" placeholder="Аудитория">
          </div>
          <div class="ta-two-cols">
            <input class="ta-input" data-ta-input="nlStart" value="${esc(nl.startTime)}" placeholder="10:00">
            <input class="ta-input" data-ta-input="nlEnd" value="${esc(nl.endTime)}" placeholder="11:30">
          </div>
          <input class="ta-input" data-ta-input="nlTopic" value="${esc(nl.topic)}" placeholder="Тема занятия">
          <div class="row" style="gap:8px">
            <button type="submit" class="btn sm">Добавить пару</button>
            <button type="button" class="btn ghost sm" data-a="ta-lesson-form-toggle">Отмена</button>
          </div>
        </form>`
      : "";

    const listHTML = lessons.map((l) => {
      const isResched = state.rescheduleLessonId === l.id;
      const isCancel = state.cancelLessonId === l.id;
      const reschedBox = isResched
        ? `<form class="ta-form-grid" data-f="ta-reschedule-form" data-id="${esc(l.id)}">
            <div class="ta-two-cols">
              <input class="ta-input" data-ta-input="rsDate" value="${esc(state.reschedForm.dateIso)}" placeholder="YYYY-MM-DD">
              <input class="ta-input" data-ta-input="rsRoom" value="${esc(state.reschedForm.room || l.room)}" placeholder="Аудитория">
            </div>
            <div class="ta-two-cols">
              <input class="ta-input" data-ta-input="rsStart" value="${esc(state.reschedForm.startTime)}" placeholder="12:00">
              <input class="ta-input" data-ta-input="rsEnd" value="${esc(state.reschedForm.endTime)}" placeholder="13:30">
            </div>
            <input class="ta-input" data-ta-input="rsNote" value="${esc(state.reschedForm.note)}" placeholder="Комментарий + черновик объявления">
            <div class="row" style="gap:6px"><button type="submit" class="btn sm">Сохранить перенос</button><button type="button" class="btn ghost sm" data-a="ta-lesson-reschedule-open" data-id="">Закрыть</button></div>
          </form>`
        : "";
      const cancelBox = isCancel
        ? `<form class="ta-form-grid" data-f="ta-cancel-form" data-id="${esc(l.id)}">
            <input class="ta-input" data-ta-input="cnNote" value="${esc(state.cancelForm.note)}" placeholder="Причина отмены">
            <div class="row" style="gap:6px"><button type="submit" class="btn danger sm">Подтвердить отмену</button><button type="button" class="btn ghost sm" data-a="ta-lesson-cancel-open" data-id="">Назад</button></div>
          </form>`
        : "";
      return `<div class="ta-card${l.status === "cancelled" ? " is-cancelled" : ""}">
        <div class="ta-row-between">
          <b class="ta-num">${esc(l.dateIso)} · ${esc(l.startTime)}–${esc(l.endTime)} · ${esc(l.groupName)}</b>
          ${lessonStatusLabel(l.status)}
        </div>
        <div class="small">${esc(l.courseTitle)} · ${esc(l.kind)} «${esc(l.topic)}» · ${esc(l.room)}</div>
        ${l.statusNote ? `<div class="small muted">Примечание: ${esc(l.statusNote)}</div>` : ""}
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn soft sm" data-a="ta-open-lesson" data-id="${esc(l.id)}">Подготовить с ИИ</button>
          <button type="button" class="btn ghost sm" data-a="ta-lesson-reschedule-open" data-id="${esc(l.id)}">Перенести</button>
          ${l.status !== "cancelled" ? `<button type="button" class="btn ghost sm" data-a="ta-lesson-cancel-open" data-id="${esc(l.id)}">Отменить</button>` : ""}
        </div>
        ${reschedBox}${cancelBox}
      </div>`;
    }).join("");

    return `<div class="ta-row-between">
        <b class="small">Пары преподавателя (${lessons.length})</b>
        <div class="row" style="gap:6px">
          <a class="btn ghost sm" href="/api/teacher-agent/schedule.ics" download="teacher-schedule.ics">Скачать .ics</a>
          <button type="button" class="btn sm" data-a="ta-lesson-form-toggle">+ Добавить пару</button>
        </div>
      </div>
      ${addForm}${listHTML}`;
  }

  function renderCoursesTabHTML() {
    const courses = state.data.courses || [];
    const cur = courses.find((c) => c.id === state.activeCourseId) || courses[0] || null;
    const pubs = (state.data.publications || []).filter((p) => cur && p.courseId === cur.id);

    const newCourseBox = state.courseFormOpen
      ? `<form class="ta-card ta-form-grid" data-f="ta-course-form">
          <b>Создать новый курс на платформе</b>
          <div class="ta-two-cols">
            <input class="ta-input" data-ta-input="ncCode" value="${esc(state.newCourse.code)}" placeholder="Код (PY-301)">
            <input class="ta-input" data-ta-input="ncGroups" value="${esc(state.newCourse.groups)}" placeholder="Группы через запятую (ИС-21)">
          </div>
          <input class="ta-input" data-ta-input="ncTitle" value="${esc(state.newCourse.title)}" placeholder="Название курса">
          <textarea class="ta-textarea" data-ta-input="ncDesc" rows="2" placeholder="Описание курса">${esc(state.newCourse.description)}</textarea>
          <div class="row" style="gap:6px"><button type="submit" class="btn sm">Создать курс</button><button type="button" class="btn ghost sm" data-a="ta-course-form-toggle">Отмена</button></div>
        </form>`
      : "";

    const stepBox = (cur && state.stepFormOpen)
      ? `<form class="ta-card ta-form-grid" data-f="ta-step-form" data-id="${esc(cur.id)}">
          <b>Добавить шаг Stepik-шаблона в курс «${esc(cur.title)}»</b>
          <div class="ta-two-cols">
            <select class="ta-select" data-ta-input="nsKind">
              <option value="theory"${state.newStep.kind === "theory" ? " selected" : ""}>Теория (theory)</option>
              <option value="practice"${state.newStep.kind === "practice" ? " selected" : ""}>Практика / тест (Stepik)</option>
              <option value="homework"${state.newStep.kind === "homework" ? " selected" : ""}>Домашнее задание</option>
            </select>
            <select class="ta-select" data-ta-input="nsQtype">
              <option value="single">single (1 ответ)</option>
              <option value="multi">multi (несколько)</option>
              <option value="input">input (текст/число)</option>
              <option value="code">code (Python)</option>
              <option value="punct">punct (запятые)</option>
            </select>
          </div>
          <input class="ta-input" data-ta-input="nsTitle" value="${esc(state.newStep.title)}" placeholder="Заголовок шага">
          <textarea class="ta-textarea" data-ta-input="nsBody" rows="2" placeholder="Текст теории или условие задания">${esc(state.newStep.body)}</textarea>
          <div class="row" style="gap:6px"><button type="submit" class="btn sm">Добавить шаг</button><button type="button" class="btn ghost sm" data-a="ta-step-form-toggle">Отмена</button></div>
        </form>`
      : "";

    const matBox = (cur && state.matFormOpen)
      ? `<form class="ta-card ta-form-grid" data-f="ta-mat-form" data-id="${esc(cur.id)}">
          <b>Добавить материал / методичку в курс «${esc(cur.title)}»</b>
          <div class="ta-two-cols">
            <input class="ta-input" data-ta-input="nmDocTitle" value="${esc(state.newMat.docTitle)}" placeholder="Документ">
            <input class="ta-input" data-ta-input="nmSection" value="${esc(state.newMat.section)}" placeholder="Раздел">
          </div>
          <input class="ta-input" data-ta-input="nmTitle" value="${esc(state.newMat.title)}" placeholder="Название темы">
          <input class="ta-input" data-ta-input="nmFormat" value="${esc(state.newMat.deliverableFormat)}" placeholder="Формат сдачи (.sql, CSV и т.п.)">
          <textarea class="ta-textarea" data-ta-input="nmContent" rows="3" placeholder="Требования и критерии">${esc(state.newMat.contentMd)}</textarea>
          <div class="row" style="gap:6px"><button type="submit" class="btn sm">Сохранить материал</button><button type="button" class="btn ghost sm" data-a="ta-mat-form-toggle">Отмена</button></div>
        </form>`
      : "";

    const courseDetails = cur
      ? `<div class="ta-card">
          <div class="ta-row-between">
            <b>${esc(cur.title)} (${esc(cur.code)})</b>
            <span class="ta-pill">Группы: ${esc((cur.groups || []).join(", "))}</span>
          </div>
          <div class="small muted">${esc(cur.description || "Курс преподавателя с шагами и заданиями.")}</div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            <button type="button" class="btn soft sm" data-a="ta-step-form-toggle">+ Шаг шаблона</button>
            <button type="button" class="btn ghost sm" data-a="ta-mat-form-toggle">+ Методичка</button>
          </div>
          <b class="small">Шаги и опубликованные ДЗ в курсе (${(cur.templateSteps || []).length}):</b>
          <ul class="ta-steps-list">
            ${(cur.templateSteps || []).map((s, idx) => `<li class="ta-step-item">
              <span><b>${esc(s.badge || s.kind)}</b> · ${esc(s.title)}${s.deadline ? ` <span class="ta-pill is-warn">${esc(s.deadline)}</span>` : ""}</span>
              <button type="button" class="btn ghost sm" data-a="ta-step-delete" data-course="${esc(cur.id)}" data-idx="${idx}">Удалить</button>
            </li>`).join("") || `<li class="small muted">Пока нет шагов</li>`}
          </ul>
          <b class="small">Опубликованные записи курса: ${pubs.length}</b>
        </div>`
      : "";

    return `<div class="ta-row-between">
        <div class="row" style="gap:6px;flex-wrap:wrap">${courses.map((c) => `<button type="button" class="chip-btn${cur && c.id === cur.id ? " on" : ""}" data-a="ta-course-select" data-id="${esc(c.id)}">${esc(c.title)}</button>`).join("")}</div>
        <button type="button" class="btn sm" data-a="ta-course-form-toggle">+ Новый курс</button>
      </div>
      ${newCourseBox}${stepBox}${matBox}${courseDetails}`;
  }

  function renderGroupChatTabHTML() {
    const groups = [];
    for (const c of (state.data.courses || [])) {
      for (const g of (c.groups || [])) {
        groups.push({ key: `${c.id}::${g}`, courseId: c.id, courseTitle: c.title, groupName: g });
      }
    }
    const active = groups.find((x) => x.key === state.chatGroupKey) || groups[0] || { key: "db::ИС-21", courseId: "db", courseTitle: "Базы данных", groupName: "ИС-21" };
    const msgs = (state.data.groupMessages || []).filter((m) => m.courseId === active.courseId && m.groupName === active.groupName);

    return `<div class="row" style="gap:6px;flex-wrap:wrap">
        ${groups.map((g) => `<button type="button" class="chip-btn${g.key === active.key ? " on" : ""}" data-a="ta-chat-group-select" data-key="${esc(g.key)}">${esc(g.groupName)} · ${esc(g.courseTitle)}</button>`).join("")}
      </div>
      <div class="ta-chat-log">
        ${msgs.map((m) => `<div class="ta-msg${m.senderRole === "teacher" ? " is-user" : ""}">
          <div class="ta-msg-role"><span>${esc(m.senderName)}</span>${m.publicationId ? `<span class="ta-pill is-ok">Публикация ${esc(m.publicationId)}</span>` : ""}</div>
          <div class="ta-msg-body">${esc(m.body)}</div>
        </div>`).join("") || `<div class="small muted">В чате группы пока нет сообщений.</div>`}
      </div>
      <form class="ta-form-grid" data-f="ta-group-msg-form" data-course="${esc(active.courseId)}" data-group="${esc(active.groupName)}">
        <textarea class="ta-textarea" data-ta-input="groupMsg" rows="2" placeholder="Написать студентам группы ${esc(active.groupName)}...">${esc(state.groupMsgText)}</textarea>
        <div class="row"><button type="submit" class="btn sm">Отправить в группу ${esc(active.groupName)}</button></div>
      </form>`;
  }

  function renderJournalTabHTML() {
    const pubs = state.data.publications || [];
    const traces = state.data.traces || [];
    const mats = state.data.materials || [];
    return `<div class="ta-card">
        <div class="ta-row-between"><b>Журнал публикаций</b><span class="ta-pill is-accent ta-num">${pubs.length}</span></div>
        ${pubs.length
          ? pubs.map((p) => `<div class="ta-step-item">
              <span><b>${esc(p.title)}</b> · ${esc(p.groupName)} · срок: ${esc(p.deadline || "нет")}</span>
              <span class="ta-pill is-ok">${esc(p.id)} (v${p.draftVersion})</span>
            </div>`).join("")
          : `<div class="small muted">Опубликованных записей пока 0. Публикация возможна только после подтверждения.</div>`}
      </div>
      <div class="ta-card">
        <b>Источники курса (${mats.length})</b>
        ${mats.map((m) => `<div class="ta-step-item">
          <span><b>${esc(m.docTitle)}</b> · ${esc(m.section)}${m.isConflictDoc ? ' <span class="ta-pill is-warn">Конфликт PDF</span>' : ""}${m.isInjectionDoc ? ' <span class="ta-pill is-bad">Инъекция в методичке</span>' : ""}</span>
          <span class="small muted">${esc(m.deliverableFormat || "—")}</span>
        </div>`).join("")}
      </div>
      <div class="ta-card">
        <div class="ta-row-between"><b>Трассировка вызовов (без текстов и ПДн)</b><span class="ta-pill ta-num">${traces.length}</span></div>
        ${traces.slice(0, 12).map((t) => `<div class="ta-step-item">
          <span><b>${esc(t.toolName)}</b> · trace: <code>${esc(t.traceId)}</code></span>
          <span class="ta-pill ta-num">${esc(t.status)} · ${esc(String(t.durationMs))} мс</span>
        </div>`).join("") || `<div class="small muted">Вызовов инструментов пока нет.</div>`}
      </div>`;
  }

  function viewTeacherAgent(opts) {
    ensureLoaded(false);
    const st = state.data.standState || {};
    const cfg = state.data.config || {};
    const standalone = opts && opts.inside === false;
    const pubsCount = (state.data.publications || []).length;

    const standBar = state.standOpen
      ? `<div class="ta-stand-bar" id="ta-stand-panel">
          <div class="ta-row-between">
            <b>Управление демонстрационным стендом (п. 4.1 и п. 5 ТЗ)</b>
            <button type="button" class="btn ghost sm" data-a="ta-check-usage">Проверить квоту /usage</button>
          </div>
          <div class="ta-stand-row">
            <button type="button" class="chip-btn${st.pdf_conflict_enabled === "1" ? " on" : ""}" data-a="ta-toggle-flag" data-flag="pdfConflict">Конфликт SQL vs PDF: ${st.pdf_conflict_enabled === "1" ? "ВКЛ" : "ВЫКЛ"}</button>
            <button type="button" class="chip-btn${st.prompt_injection_enabled === "1" ? " on" : ""}" data-a="ta-toggle-flag" data-flag="promptInjection">Вставка «Опубликуй сразу»: ${st.prompt_injection_enabled === "1" ? "ВКЛ" : "ВЫКЛ"}</button>
            <button type="button" class="chip-btn${st.schedule_outage === "1" ? " on" : ""}" data-a="ta-toggle-flag" data-flag="scheduleOutage">Сбой расписания: ${st.schedule_outage === "1" ? "ВКЛ" : "ВЫКЛ"}</button>
          </div>
          ${state.usage ? `<div class="small muted">GigaChat /usage (${esc(state.usage.model || "")}): ${state.usage.ok ? `осталось токенов ${esc(String(state.usage.remainingTokens))}, запросов ${esc(String(state.usage.remaining))}` : esc(state.usage.error || "ключ не задан — активен локальный фоллбэк")}</div>` : ""}
        </div>`
      : "";

    const chatHTML = state.messages.length
      ? state.messages.map((m) => {
          const toolsHTML = (m.toolsCalled && m.toolsCalled.length)
            ? `<div class="row" style="gap:4px;flex-wrap:wrap">${m.toolsCalled.map((t) => `<span class="ta-pill is-accent">${esc(t)}</span>`).join("")}</div>`
            : "";
          const srcHTML = (m.sources && m.sources.length)
            ? `<div class="row" style="gap:4px;flex-wrap:wrap">${m.sources.map((s) => `<span class="ta-pill">${esc(s.docTitle || "")} · ${esc(s.section || "")}</span>`).join("")}</div>`
            : "";
          const choicesHTML = (m.courseChoices && m.courseChoices.length)
            ? `<div class="row" style="gap:6px;flex-wrap:wrap">${m.courseChoices.map((c) => `<button type="button" class="btn soft sm" data-a="ta-pick-course" data-course="${esc(c.courseTitle)}" data-q="${esc(m.origQuery || "Что сдавать по JOIN?")}">Выбрать: ${esc(c.courseTitle)}</button>`).join("")}</div>`
            : "";
          const presLink = m.presentation
            ? `<div><a class="btn sm" href="${esc(m.presentation.downloadUrl)}" download>Скачать ${esc(m.presentation.filename)}</a></div>`
            : "";
          return `<div class="ta-msg${m.role === "user" ? " is-user" : ""}">
            <div class="ta-msg-role"><span>${m.role === "user" ? "Преподаватель" : "ИИ-агент Вектора"}</span>${m.traceId ? `<code>${esc(m.traceId)}</code>` : ""}</div>
            <div class="ta-msg-body">${esc(m.content)}</div>
            ${toolsHTML}${srcHTML}${choicesHTML}${presLink}
          </div>`;
        }).join("")
      : `<div class="ta-card">
          <b>Готов к работе с расписанием, материалами, PPTX и проверкой .sql</b>
          <span class="small muted">Выберите быстрый запрос ниже или напишите задачу на русском языке. Например: «Что у меня сегодня?» или «Подготовь план и задание по JOIN для ИС-21».</span>
        </div>`;

    const tabContent = state.rightTab === "schedule"
      ? renderScheduleTabHTML()
      : (state.rightTab === "courses"
        ? renderCoursesTabHTML()
        : (state.rightTab === "chat"
          ? renderGroupChatTabHTML()
          : (state.rightTab === "journal" ? renderJournalTabHTML() : renderDraftTabHTML())));

    return `<section class="ta-shell" id="ta-workspace">
      <header class="ta-head">
        <div class="ta-head-title">
          <h1>Помощник преподавателя вуза</h1>
          <div class="ta-meta-row">
            <span class="ta-pill">Демо-роль: Преподаватель (db, da)</span>
            <span class="ta-pill ta-num">Стенд: 02.12.2026 08:00 Asia/Yakutsk</span>
            <span class="ta-pill ${cfg.gigachatEnabled ? "is-ok" : "is-accent"}">${cfg.gigachatEnabled ? `GigaChat: ${esc(cfg.model)}` : "Режим: локальный + GigaChat ready"}</span>
            <span class="ta-pill ta-num">Публикаций: ${pubsCount}</span>
          </div>
        </div>
        <div class="ta-head-acts">
          <button type="button" class="btn ghost sm" data-a="ta-stand-toggle">Панель стенда</button>
          <button type="button" class="btn soft sm" data-a="ta-demo-reset">Сбросить стенд</button>
          ${standalone ? `<a class="btn sm" href="/tutor">Кабинет /tutor</a>` : ""}
        </div>
      </header>
      ${standBar}
      <div class="ta-grid">
        <section class="ta-panel" aria-label="Чат с ИИ-агентом">
          <div class="ta-panel-head">
            <b>Веб-чат на русском</b>
            ${state.selectedCourse ? `<span class="ta-pill is-accent">Курс: ${esc(state.selectedCourse)}</span>` : ""}
          </div>
          <div class="ta-prompts">
            ${QUICK_PROMPTS.map((q) => `<button type="button" class="ta-prompt-chip" data-a="ta-quick-prompt" data-text="${esc(q.text)}">${esc(q.label)}</button>`).join("")}
          </div>
          <div class="ta-chat-log" id="ta-chat-log">${chatHTML}</div>
          <form class="ta-chat-form" data-f="ta-chat-form">
            <textarea class="ta-textarea" id="ta-chat-input" data-ta-input="chatInput" rows="3" placeholder="Запрос преподавателя или комментарий к .sql работе..."${state.busy ? " disabled" : ""}>${esc(state.chatInput)}</textarea>
            <div class="ta-chat-foot">
              <div class="row" style="gap:8px;flex-wrap:wrap">
                <label class="btn ghost sm" style="cursor:pointer">Прикрепить .sql/.txt<input type="file" id="ta-sql-file" accept=".sql,.txt,.md,.csv" hidden></label>
                ${state.pendingFile ? `<span class="ta-pill is-accent">${esc(state.pendingFile.name)} <button type="button" class="btn ghost sm" style="padding:0 4px" data-a="ta-clear-file">×</button></span>` : ""}
              </div>
              <button type="submit" class="btn sm"${state.busy ? " disabled" : ""}>${state.busy ? "Выполняю..." : "Отправить"}</button>
            </div>
          </form>
        </section>

        <section class="ta-panel" aria-label="Рабочая панель преподавателя">
          <div class="ta-tabs" role="tablist">
            <button type="button" class="ta-tab-btn" role="tab" data-a="ta-tab" data-tab="draft" aria-selected="${state.rightTab === "draft"}">Черновик и PPTX</button>
            <button type="button" class="ta-tab-btn" role="tab" data-a="ta-tab" data-tab="schedule" aria-selected="${state.rightTab === "schedule"}">Расписание</button>
            <button type="button" class="ta-tab-btn" role="tab" data-a="ta-tab" data-tab="courses" aria-selected="${state.rightTab === "courses"}">Курсы и ДЗ</button>
            <button type="button" class="ta-tab-btn" role="tab" data-a="ta-tab" data-tab="chat" aria-selected="${state.rightTab === "chat"}">Чат группы</button>
            <button type="button" class="ta-tab-btn" role="tab" data-a="ta-tab" data-tab="journal" aria-selected="${state.rightTab === "journal"}">Журнал и трасса</button>
          </div>
          ${tabContent}
        </section>
      </div>
    </section>`;
  }

  function renderCalendarWidgetHTML() {
    ensureLoaded(false);
    const lessons = state.data.schedule || [];
    return `<section class="ta-cal-widget" id="ta-cal-widget" aria-label="Расписание пар вуза и ИИ-помощник">
      <div class="ta-row-between">
        <div>
          <b>Пары вуза и ИИ-помощник (02.12–04.12.2026)</b>
          <div class="small muted">Занятия, перенос/отмена и быстрая подготовка практики с GigaChat.</div>
        </div>
        <div class="row" style="gap:6px;flex-wrap:wrap">
          <a class="btn ghost sm" href="/api/teacher-agent/schedule.ics" download="teacher-schedule.ics">Календарь .ics</a>
          <button type="button" class="btn sm" data-a="go" data-v="teacher-agent">Открыть ИИ-помощника</button>
        </div>
      </div>
      ${lessons.map((l) => `<div class="ta-step-item">
        <span><b class="ta-num">${esc(l.dateIso)} ${esc(l.startTime)}–${esc(l.endTime)}</b> · ${esc(l.courseTitle)} · ${esc(l.groupName)} · ${esc(l.topic)} (${esc(l.room)})</span>
        <div class="row" style="gap:6px">${lessonStatusLabel(l.status)}<button type="button" class="btn soft sm" data-a="ta-open-lesson" data-id="${esc(l.id)}">Подготовить с ИИ</button></div>
      </div>`).join("")}
    </section>`;
  }

  async function sendChat(text, extra) {
    const clean = String(text || "").trim();
    if (!clean && !state.pendingFile) return;
    const shown = clean || `Проверь работу ${state.pendingFile.name}`;
    state.messages.push({ role: "user", content: shown });
    state.chatInput = "";
    state.busy = true;
    renderApp();
    try {
      let res;
      if (state.pendingFile) {
        if (state.pendingFile.rawFile && typeof FormData !== "undefined") {
          const fd = new FormData();
          fd.append("message", shown);
          if (state.selectedCourse) fd.append("selected_course", state.selectedCourse);
          if (state.activeDraftId) fd.append("active_draft_id", state.activeDraftId);
          fd.append("file", state.pendingFile.rawFile, state.pendingFile.name);
          res = await apiCall("/api/teacher-agent/chat/upload", { method: "POST", body: fd });
        } else {
          res = await apiCall("/api/teacher-agent/chat", {
            method: "POST",
            body: JSON.stringify({
              message: shown,
              activeDraftId: state.activeDraftId || null,
              selectedCourse: state.selectedCourse || null,
              attachmentText: state.pendingFile.text || "",
              attachmentFilename: state.pendingFile.name
            })
          });
        }
        state.pendingFile = null;
      } else {
        res = await apiCall("/api/teacher-agent/chat", {
          method: "POST",
          body: JSON.stringify({
            message: shown,
            activeDraftId: state.activeDraftId || null,
            selectedCourse: (extra && extra.selectedCourse) || state.selectedCourse || null
          })
        });
      }
      state.messages.push({
        role: "assistant",
        content: (res && (res.reply || res.error)) || "Готово.",
        toolsCalled: (res && res.toolsCalled) || [],
        sources: (res && res.sources) || [],
        courseChoices: (res && res.courseChoices) || [],
        presentation: (res && res.presentation) || null,
        traceId: res && res.traceId,
        origQuery: shown
      });
      if (res && res.draft) {
        syncActiveDraftEdits(res.draft);
        state.rightTab = "draft";
      }
      if (res && res.preview) {
        state.activePreview = res.preview;
        state.rightTab = "draft";
      }
      await refreshState();
    } catch (err) {
      state.messages.push({ role: "assistant", content: "Ошибка запроса: " + err.message });
    } finally {
      state.busy = false;
      renderApp();
    }
  }

  function onInput(val, id, ds) {
    const key = (ds && ds.taInput) || "";
    if (key === "chatInput" || id === "ta-chat-input") state.chatInput = val;
    else if (key === "draftTitle") state.draftEdits.title = val;
    else if (key === "draftGroup") state.draftEdits.groupName = val;
    else if (key === "draftDeadline") state.draftEdits.deadline = val;
    else if (key === "draftContent") state.draftEdits.contentMd = val;
    else if (key === "groupMsg") state.groupMsgText = val;
    else if (key === "ncCode") state.newCourse.code = val;
    else if (key === "ncTitle") state.newCourse.title = val;
    else if (key === "ncGroups") state.newCourse.groups = val;
    else if (key === "ncDesc") state.newCourse.description = val;
    else if (key === "nsKind") state.newStep.kind = val;
    else if (key === "nsQtype") state.newStep.qtype = val;
    else if (key === "nsTitle") state.newStep.title = val;
    else if (key === "nsBody") state.newStep.body = val;
    else if (key === "nmDocTitle") state.newMat.docTitle = val;
    else if (key === "nmSection") state.newMat.section = val;
    else if (key === "nmTitle") state.newMat.title = val;
    else if (key === "nmFormat") state.newMat.deliverableFormat = val;
    else if (key === "nmContent") state.newMat.contentMd = val;
    else if (key === "nlCourse") state.newLesson.courseId = val;
    else if (key === "nlGroup") state.newLesson.groupName = val;
    else if (key === "nlDate") state.newLesson.dateIso = val;
    else if (key === "nlStart") state.newLesson.startTime = val;
    else if (key === "nlEnd") state.newLesson.endTime = val;
    else if (key === "nlTopic") state.newLesson.topic = val;
    else if (key === "nlRoom") state.newLesson.room = val;
    else if (key === "rsDate") state.reschedForm.dateIso = val;
    else if (key === "rsStart") state.reschedForm.startTime = val;
    else if (key === "rsEnd") state.reschedForm.endTime = val;
    else if (key === "rsRoom") state.reschedForm.room = val;
    else if (key === "rsNote") state.reschedForm.note = val;
    else if (key === "cnNote") state.cancelForm.note = val;
  }

  function onFileChange(file) {
    if (!file) return;
    state.pendingFile = { name: file.name || "submission.sql", rawFile: file, text: "" };
    if (typeof FileReader !== "undefined") {
      try {
        const reader = new FileReader();
        reader.onload = () => { if (state.pendingFile) state.pendingFile.text = String(reader.result || ""); renderApp(); };
        reader.readAsText(file);
        return;
      } catch (e) { /* игнор */ }
    }
    renderApp();
  }

  function registerActions(ACTIONS) {
    ACTIONS["ta-tab"] = (el) => { state.rightTab = el.dataset.tab || "draft"; renderApp(); };
    ACTIONS["ta-stand-toggle"] = () => { state.standOpen = !state.standOpen; renderApp(); };
    ACTIONS["ta-clear-file"] = () => { state.pendingFile = null; renderApp(); };
    ACTIONS["ta-quick-prompt"] = (el) => sendChat(el.dataset.text || "");
    ACTIONS["ta-pick-course"] = (el) => {
      state.selectedCourse = el.dataset.course || "";
      sendChat(el.dataset.q || "Что сдавать по JOIN?", { selectedCourse: state.selectedCourse });
    };
    ACTIONS["ta-select-draft"] = (el) => {
      const found = (state.data.drafts || []).find((d) => d.id === el.dataset.id);
      if (found) syncActiveDraftEdits(found);
      renderApp();
    };
    ACTIONS["ta-course-select"] = (el) => { state.activeCourseId = el.dataset.id || "db"; renderApp(); };
    ACTIONS["ta-course-form-toggle"] = () => { state.courseFormOpen = !state.courseFormOpen; renderApp(); };
    ACTIONS["ta-step-form-toggle"] = () => { state.stepFormOpen = !state.stepFormOpen; renderApp(); };
    ACTIONS["ta-mat-form-toggle"] = () => { state.matFormOpen = !state.matFormOpen; renderApp(); };
    ACTIONS["ta-lesson-form-toggle"] = () => { state.lessonFormOpen = !state.lessonFormOpen; renderApp(); };
    ACTIONS["ta-lesson-reschedule-open"] = (el) => {
      const id = el.dataset.id || "";
      state.rescheduleLessonId = state.rescheduleLessonId === id ? "" : id;
      state.cancelLessonId = "";
      renderApp();
    };
    ACTIONS["ta-lesson-cancel-open"] = (el) => {
      const id = el.dataset.id || "";
      state.cancelLessonId = state.cancelLessonId === id ? "" : id;
      state.rescheduleLessonId = "";
      renderApp();
    };
    ACTIONS["ta-chat-group-select"] = (el) => { state.chatGroupKey = el.dataset.key || "db::ИС-21"; renderApp(); };

    ACTIONS["ta-demo-reset"] = async () => {
      const res = await apiCall("/api/teacher-agent/demo/reset", { method: "POST" }).catch(() => null);
      state.messages = [];
      state.activeDraftId = "";
      state.activePreview = null;
      state.selectedCourse = "";
      if (res) applyServerState(res);
      notify("Стенд сброшен к 02.12.2026 08:00 ✓");
      renderApp();
    };
    ACTIONS["ta-check-usage"] = async () => {
      state.usage = await apiCall("/api/teacher-agent/usage").catch((e) => ({ ok: false, error: e.message }));
      renderApp();
    };
    ACTIONS["ta-toggle-flag"] = async (el) => {
      const fl = el.dataset.flag;
      const st = state.data.standState || {};
      const body = {};
      if (fl === "pdfConflict") body.pdfConflict = st.pdf_conflict_enabled !== "1";
      if (fl === "promptInjection") body.promptInjection = st.prompt_injection_enabled !== "1";
      if (fl === "scheduleOutage") body.scheduleOutage = st.schedule_outage !== "1";
      await apiCall("/api/teacher-agent/demo/toggles", { method: "POST", body: JSON.stringify(body) }).catch(() => null);
      await refreshState();
    };
    ACTIONS["ta-draft-save"] = async (el) => {
      const id = el.dataset.id;
      const res = await apiCall(`/api/teacher-agent/drafts/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: state.draftEdits.title,
          groupName: state.draftEdits.groupName,
          deadline: state.draftEdits.deadline || null,
          clearDeadline: !state.draftEdits.deadline,
          contentMd: state.draftEdits.contentMd
        })
      }).catch((e) => { notify(e.message); return null; });
      if (res && res.draft) {
        state.activePreview = null;
        await refreshState();
        notify(`Черновик обновлён (v${res.draft.version}), подтверждение сброшено`);
      }
    };
    ACTIONS["ta-draft-preview"] = async (el) => {
      const id = el.dataset.id;
      try {
        const res = await apiCall(`/api/teacher-agent/drafts/${encodeURIComponent(id)}/preview`, { method: "POST" });
        state.activePreview = res.preview;
        await refreshState();
      } catch (e) { notify(e.message); }
    };
    ACTIONS["ta-draft-cancel"] = async (el) => {
      await apiCall(`/api/teacher-agent/drafts/${encodeURIComponent(el.dataset.id)}/cancel`, { method: "POST" }).catch(() => null);
      state.activePreview = null;
      await refreshState();
      notify("Предпросмотр отменён");
    };
    ACTIONS["ta-draft-publish"] = async (el) => {
      if (!state.activePreview) { notify("Сначала откройте предпросмотр"); return; }
      try {
        const res = await apiCall(`/api/teacher-agent/drafts/${encodeURIComponent(el.dataset.id)}/publish`, {
          method: "POST",
          body: JSON.stringify({
            previewToken: state.activePreview.previewToken,
            expectedVersion: state.activePreview.version
          })
        });
        await refreshState();
        notify(res.wasDuplicate ? "Дубликат не создан (уже опубликовано) ✓" : "Опубликовано в курс и чат группы ✓");
      } catch (e) { notify(e.message); }
    };
    ACTIONS["ta-step-delete"] = async (el) => {
      const cid = el.dataset.course;
      const idx = Number(el.dataset.idx);
      const course = (state.data.courses || []).find((c) => c.id === cid);
      if (!course) return;
      const next = (course.templateSteps || []).filter((_, i) => i !== idx);
      await apiCall(`/api/teacher-agent/courses/${encodeURIComponent(cid)}/steps`, { method: "PUT", body: JSON.stringify({ steps: next }) }).catch(() => null);
      await refreshState();
    };
    ACTIONS["ta-open-lesson"] = (el) => {
      const l = (state.data.schedule || []).find((x) => x.id === el.dataset.id);
      if (typeof _ctx.go === "function") _ctx.go("teacher-agent");
      if (l) {
        state.selectedCourse = l.courseTitle;
        state.chatInput = `Подготовь план и задание по ${l.topic} для ${l.groupName}`;
      }
      renderApp();
    };
  }

  function registerForms(FORMS) {
    FORMS["ta-chat-form"] = () => sendChat(state.chatInput);
    FORMS["ta-course-form"] = async () => {
      if (!state.newCourse.title.trim() || !state.newCourse.code.trim()) { notify("Укажите код и название курса"); return; }
      await apiCall("/api/teacher-agent/courses", {
        method: "POST",
        body: JSON.stringify({
          code: state.newCourse.code,
          title: state.newCourse.title,
          description: state.newCourse.description,
          groups: state.newCourse.groups.split(",").map((x) => x.trim()).filter(Boolean)
        })
      }).catch((e) => notify(e.message));
      state.courseFormOpen = false;
      state.newCourse = { code: "", title: "", groups: "ИС-21", description: "" };
      await refreshState();
      notify("Курс создан ✓");
    };
    FORMS["ta-step-form"] = async (form) => {
      const cid = form && form.dataset ? form.dataset.id : state.activeCourseId;
      const course = (state.data.courses || []).find((c) => c.id === cid);
      if (!course || !state.newStep.title.trim()) return;
      const next = (course.templateSteps || []).concat([{
        id: "step-" + Date.now(),
        kind: state.newStep.kind,
        qtype: state.newStep.kind === "practice" ? state.newStep.qtype : undefined,
        badge: state.newStep.kind === "homework" ? "ДЗ" : "Шаг курса",
        title: state.newStep.title.trim(),
        contentMd: state.newStep.body.trim()
      }]);
      await apiCall(`/api/teacher-agent/courses/${encodeURIComponent(cid)}/steps`, { method: "PUT", body: JSON.stringify({ steps: next }) }).catch((e) => notify(e.message));
      state.stepFormOpen = false;
      state.newStep = { kind: "theory", qtype: "single", title: "", body: "" };
      await refreshState();
    };
    FORMS["ta-mat-form"] = async (form) => {
      const cid = form && form.dataset ? form.dataset.id : state.activeCourseId;
      if (!state.newMat.title.trim()) return;
      await apiCall(`/api/teacher-agent/courses/${encodeURIComponent(cid)}/materials`, {
        method: "POST",
        body: JSON.stringify(state.newMat)
      }).catch((e) => notify(e.message));
      state.matFormOpen = false;
      await refreshState();
    };
    FORMS["ta-lesson-form"] = async () => {
      if (!state.newLesson.topic.trim()) return;
      await apiCall("/api/teacher-agent/schedule", { method: "POST", body: JSON.stringify(state.newLesson) }).catch((e) => notify(e.message));
      state.lessonFormOpen = false;
      await refreshState();
    };
    FORMS["ta-reschedule-form"] = async (form) => {
      const lid = form && form.dataset ? form.dataset.id : state.rescheduleLessonId;
      const res = await apiCall(`/api/teacher-agent/schedule/${encodeURIComponent(lid)}/reschedule`, {
        method: "POST",
        body: JSON.stringify(state.reschedForm)
      }).catch((e) => { notify(e.message); return null; });
      state.rescheduleLessonId = "";
      await refreshState();
      if (res && res.announcementDraft) {
        syncActiveDraftEdits(res.announcementDraft);
        state.rightTab = "draft";
        notify("Пара перенесена, создан черновик объявления для группы ✓");
        renderApp();
      }
    };
    FORMS["ta-cancel-form"] = async (form) => {
      const lid = form && form.dataset ? form.dataset.id : state.cancelLessonId;
      const res = await apiCall(`/api/teacher-agent/schedule/${encodeURIComponent(lid)}/cancel`, {
        method: "POST",
        body: JSON.stringify(state.cancelForm)
      }).catch((e) => { notify(e.message); return null; });
      state.cancelLessonId = "";
      await refreshState();
      if (res && res.announcementDraft) {
        syncActiveDraftEdits(res.announcementDraft);
        state.rightTab = "draft";
        notify("Пара отменена, создан черновик объявления ✓");
        renderApp();
      }
    };
    FORMS["ta-group-msg-form"] = async (form) => {
      const cid = form && form.dataset ? form.dataset.course : "db";
      const grp = form && form.dataset ? form.dataset.group : "ИС-21";
      if (!state.groupMsgText.trim()) return;
      await apiCall(`/api/teacher-agent/groups/${encodeURIComponent(cid)}/${encodeURIComponent(grp)}/messages`, {
        method: "POST",
        body: JSON.stringify({ body: state.groupMsgText.trim() })
      }).catch((e) => notify(e.message));
      state.groupMsgText = "";
      await refreshState();
    };
  }

  EGE.views = EGE.views || {};
  EGE.views.teacherAgent = {
    configure,
    ensureLoaded,
    viewTeacherAgent,
    renderCalendarWidgetHTML,
    onInput,
    onFileChange,
    registerActions,
    registerForms,
    _state: state
  };
})();
