/* Плеер курсов в формате Stepik: каталог с выбором предметов и избранным, витрина 9 шаблонов ЕГЭ, компактная программа и плеер урока. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, norm, plural, rich } = EGE.utils;
  const { icon } = EGE.ui;

  let SUBJ, STUDY_SUBJ_MAP;
  let store, ui;
  let patchDoc, replaceDoc, scheduleRender, toast;

  function tplEngine() {
    return EGE.courseTemplates || null;
  }

  function configure(ctx) {
    ({
      SUBJ, STUDY_SUBJ_MAP,
      store, ui,
      patchDoc, replaceDoc, scheduleRender, toast
    } = ctx || {});
  }

  function courseState() {
    if (!ui.course || typeof ui.course !== "object") {
      ui.course = {};
    }
    if (typeof ui.course.subjFilter !== "string" || !ui.course.subjFilter) ui.course.subjFilter = "all";
    if (typeof ui.course.courseId !== "string") ui.course.courseId = "";
    if (typeof ui.course.lessonId !== "string") ui.course.lessonId = "";
    if (!Number.isInteger(ui.course.stepIdx) || ui.course.stepIdx < 0) ui.course.stepIdx = 0;
    if (ui.course.filter !== "todo" && ui.course.filter !== "done") ui.course.filter = "all";
    if (typeof ui.course.topicQ !== "string") ui.course.topicQ = "";
    if (!ui.course.collapsedMods || typeof ui.course.collapsedMods !== "object") ui.course.collapsedMods = {};
    ui.course.drawerOpen = !!ui.course.drawerOpen;
    ui.course.templatesOpen = !!ui.course.templatesOpen;
    if (!Number.isInteger(ui.course.tplIdx) || ui.course.tplIdx < 0) ui.course.tplIdx = 0;
    if (!ui.course.tplAttempts || typeof ui.course.tplAttempts !== "object") ui.course.tplAttempts = {};
    if (!ui.course.attempts || typeof ui.course.attempts !== "object") ui.course.attempts = {};
    return ui.course;
  }

  function coursesList() {
    return Array.isArray(EGE.courses) ? EGE.courses : [];
  }

  function subjectColor(sid) {
    return (STUDY_SUBJ_MAP && STUDY_SUBJ_MAP[sid] && STUDY_SUBJ_MAP[sid].color) || "var(--accent)";
  }

  function subjectLabel(course) {
    if (course && course.subjectName) return course.subjectName;
    if (STUDY_SUBJ_MAP && course && STUDY_SUBJ_MAP[course.sid] && STUDY_SUBJ_MAP[course.sid].name) {
      return STUDY_SUBJ_MAP[course.sid].name;
    }
    return "Курс";
  }

  function findCourseLesson(courseId, lessonId) {
    const list = coursesList();
    const course = (courseId && list.find((c) => c.id === courseId))
      || (lessonId && list.find((c) => (c.lessons || []).some((l) => l.id === lessonId)))
      || null;
    if (!course) return { course: null, lesson: null };
    const lesson = lessonId ? ((course.lessons || []).find((l) => l.id === lessonId) || null) : null;
    return { course, lesson };
  }

  function courseDoc() {
    return (store && store.docs && store.docs.courses && typeof store.docs.courses === "object") ? store.docs.courses : {};
  }

  function favoritesMap() {
    const fav = courseDoc().favorites;
    return (fav && typeof fav === "object") ? fav : {};
  }

  function isFav(courseId) {
    return !!favoritesMap()[courseId];
  }

  function lessonProgress(lessonId) {
    const lessons = (courseDoc().lessons && typeof courseDoc().lessons === "object") ? courseDoc().lessons : {};
    const entry = lessons[lessonId];
    if (!entry || typeof entry !== "object") return { done: {}, lastStep: 0 };
    return {
      done: (entry.done && typeof entry.done === "object") ? entry.done : {},
      lastStep: Number.isFinite(Number(entry.lastStep)) ? Number(entry.lastStep) : 0
    };
  }

  function lessonStats(lesson) {
    const prog = lessonProgress(lesson.id);
    const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
    const total = steps.length;
    const doneCount = steps.filter((s) => !!prog.done[s.id]).length;
    const firstPending = steps.findIndex((s) => !prog.done[s.id]);
    let theoryCount = 0;
    let practiceCount = 0;
    let testCount = 0;
    for (const s of steps) {
      if (s.kind === "theory") theoryCount++;
      else if (s.kind === "practice") practiceCount++;
      else if (s.kind === "test") testCount++;
    }
    return {
      total,
      doneCount,
      completed: total > 0 && doneCount >= total,
      pct: total ? Math.round((doneCount / total) * 100) : 0,
      doneMap: prog.done,
      lastStep: prog.lastStep,
      resumeIdx: firstPending >= 0 ? firstPending : 0,
      theoryCount,
      practiceCount,
      testCount
    };
  }

  function courseSummary(course) {
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const statsById = new Map();
    let totalSteps = 0;
    let totalDone = 0;
    let doneLessonsCount = 0;
    let resumeLesson = null;
    for (const l of lessons) {
      const s = lessonStats(l);
      statsById.set(l.id, s);
      totalSteps += s.total;
      totalDone += s.doneCount;
      if (s.completed) doneLessonsCount++;
      else if (!resumeLesson) resumeLesson = l;
    }
    return {
      lessons,
      statsById,
      totalSteps,
      totalDone,
      doneLessonsCount,
      pct: totalSteps ? Math.round((totalDone / totalSteps) * 100) : 0,
      resumeLesson: resumeLesson || lessons[0] || null
    };
  }

  function findResumeTarget() {
    const doc = courseDoc();
    const list = coursesList();
    if (doc.lastCourseId && doc.lastLessonId) {
      const { course, lesson } = findCourseLesson(doc.lastCourseId, doc.lastLessonId);
      if (course && !course.comingSoon && lesson) {
        const st = lessonStats(lesson);
        if (st.doneCount > 0 && !st.completed) {
          return { course, lesson, stepIdx: st.resumeIdx, doneCount: st.doneCount, total: st.total };
        }
      }
    }
    for (const c of list) {
      if (c.comingSoon) continue;
      const sum = courseSummary(c);
      if (sum.totalDone > 0 && sum.resumeLesson) {
        const st = sum.statsById.get(sum.resumeLesson.id);
        return { course: c, lesson: sum.resumeLesson, stepIdx: st.resumeIdx, doneCount: st.doneCount, total: st.total };
      }
    }
    return null;
  }

  function markStepDone(courseId, lesson, stepId, stepIdx) {
    const nextLast = Math.max(lessonProgress(lesson.id).lastStep || 0, Number(stepIdx) || 0);
    patchDoc("courses", {
      lastCourseId: courseId,
      lastLessonId: lesson.id,
      lessons: {
        [lesson.id]: {
          done: { [stepId]: true },
          lastStep: nextLast
        }
      }
    });
  }

  function attemptKey(lessonId, stepId) {
    return lessonId + ":" + stepId;
  }

  function getAttempt(lessonId, step) {
    const st = courseState();
    const key = attemptKey(lessonId, step.id);
    if (!st.attempts[key]) {
      const eng = tplEngine();
      st.attempts[key] = eng ? eng.initAttempt(step) : { pick: step.qtype === "multi" ? [] : null, input: "", checked: false, ok: false };
    }
    return st.attempts[key];
  }

  function getTplAttempt(sample) {
    const st = courseState();
    if (!st.tplAttempts[sample.id]) {
      const eng = tplEngine();
      st.tplAttempts[sample.id] = eng ? eng.initAttempt(sample) : { pick: null, input: "", checked: false, ok: false };
    }
    return st.tplAttempts[sample.id];
  }

  function stepIconName(kind, isDone) {
    if (isDone) return "check";
    if (kind === "theory") return "book";
    if (kind === "practice") return "spark";
    return "list";
  }

  function stepKindClass(kind) {
    if (kind === "theory") return "is-theory";
    if (kind === "practice") return "is-practice";
    return "is-test";
  }

  function stepKindLabel(kind) {
    if (kind === "theory") return "Теория";
    if (kind === "practice") return "Мини-практика";
    return "Тест";
  }

  function topicShortCode(lesson) {
    const m = /\d+/.exec(String(lesson.code || ""));
    return m ? "№" + m[0] : String(lesson.number || "•");
  }

  function renderTheoryBlock(b) {
    if (!b || typeof b !== "object") return "";
    if (b.type === "p") {
      return `<p class="crs-p">${rich(b.text || "")}</p>`;
    }
    if (b.type === "list" && Array.isArray(b.items)) {
      return `<ul class="theory">${b.items.map((it) => `<li>${rich(it)}</li>`).join("")}</ul>`;
    }
    if (b.type === "callout") {
      const tone = b.tone === "warn" ? " is-warn" : "";
      const body = String(b.text || "").split("\n").map((line) => `<p>${rich(line)}</p>`).join("");
      return `<div class="crs-callout${tone}">${b.title ? `<div class="crs-callout-title">${icon(b.tone === "warn" ? "alert" : "hint")}<span>${esc(b.title)}</span></div>` : ""}<div class="crs-callout-body">${body}</div></div>`;
    }
    if (b.type === "table" && Array.isArray(b.headers) && Array.isArray(b.rows)) {
      return `<div class="qtbl-wrap"><table class="qtbl"><thead><tr>${b.headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${b.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    }
    return "";
  }

  function groupCourseModules(course) {
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const lessonById = new Map(lessons.map((l) => [l.id, l]));
    const rawMods = Array.isArray(course.modules) && course.modules.length
      ? course.modules
      : [{ id: "all", number: 1, title: "Темы курса", subtitle: "", lessonIds: lessons.map((l) => l.id) }];

    const used = new Set();
    const out = [];
    for (const m of rawMods) {
      const mLessons = [];
      for (const lid of (m.lessonIds || [])) {
        const found = lessonById.get(lid);
        if (found) {
          mLessons.push(found);
          used.add(lid);
        }
      }
      if (mLessons.length) out.push(Object.assign({}, m, { lessons: mLessons }));
    }
    const leftovers = lessons.filter((l) => !used.has(l.id));
    if (leftovers.length) {
      out.push({ id: "extra", number: out.length + 1, title: "Дополнительные темы", subtitle: "", lessons: leftovers });
    }
    return out;
  }

  /* ---------- Витрина всех 9 шаблонов заданий ЕГЭ ---------- */
  function viewTemplatesShowcase() {
    const eng = tplEngine();
    const st = courseState();
    const catalog = eng ? eng.CATALOG : [];
    const samples = eng ? eng.SAMPLES : [];
    if (!samples.length) {
      return `<section class="card pad-lg empty" id="courses-root"><b>Шаблоны ЕГЭ</b><span>Библиотека шаблонов загружается.</span></section>`;
    }
    if (st.tplIdx < 0 || st.tplIdx >= samples.length) st.tplIdx = 0;
    const sample = samples[st.tplIdx];
    const meta = catalog[st.tplIdx] || {};
    const att = getTplAttempt(sample);

    const strip = catalog.map((item, idx) => {
      const cur = idx === st.tplIdx;
      return `<button type="button" class="crs-step-pill is-test${cur ? " is-cur" : ""}${att && att.checked && idx === st.tplIdx ? " is-done" : ""}" data-a="course-tpl-pick" data-idx="${idx}" aria-selected="${cur ? "true" : "false"}"${cur ? ' aria-current="step"' : ""}>
        <span class="crs-step-num tabular-nums">${idx + 1}</span>
        <span>${esc(item.short || item.id)}</span>
      </button>`;
    }).join("");

    const bodyHtml = eng.renderBody(sample, att, {
      isDone: false,
      hasNext: st.tplIdx < samples.length - 1,
      hideNext: true,
      checkAction: "course-tpl-check",
      retryAction: "course-tpl-retry"
    });

    return `<section class="crs-root" id="courses-root" aria-label="Шаблоны заданий ОГЭ и ЕГЭ">
      <div class="crs-head">
        <div class="crs-head-actions">
          <button type="button" class="btn sm" data-a="course-templates-close">${icon("back")}<span>Все курсы</span></button>
        </div>
        <div class="crs-head-stat tabular-nums">${st.tplIdx + 1}/${samples.length} форматов</div>
        <div class="crs-head-title">
          <div class="small muted">Конструктор курсов Вектор</div>
          <h2 class="h2">Шаблоны ОГЭ и ЕГЭ (${samples.length})</h2>
        </div>
      </div>

      <div class="crs-step-strip" role="tablist" aria-label="Выбор шаблона">${strip}</div>

      <article class="card pad-lg crs-step-card" id="crs-tpl-showcase">
        <div class="crs-step-head">
          <span class="crs-badge is-theory">${esc(sample.badge || sample.qtype)}</span>
        </div>
        <h3 class="crs-step-title">${esc(meta.title || sample.title)}</h3>
        <div class="crs-tpl-meta">
          <div><b>Где на ЕГЭ:</b> ${esc(meta.ege || "")}</div>
          <div><b>Удобство:</b> ${esc(meta.uxNote || "")}</div>
        </div>
        ${bodyHtml}
      </article>
    </section>`;
  }

  /* ---------- Уровень 1: Каталог курсов + выбор предмета + избранное + продолжить ---------- */
  function viewCatalog() {
    const list = coursesList();
    if (!list.length) {
      return `<section class="card pad-lg empty learn-courses-empty" id="courses-root" aria-label="Курсы"><b>Курсы</b><span>Раздел курсов готовится.</span></section>`;
    }
    const cState = courseState();
    const subjFilter = cState.subjFilter || "all";
    const favCount = list.filter((c) => isFav(c.id)).length;
    const eng = tplEngine();
    const tplCount = eng ? eng.CATALOG.length : 0;

    const seenSids = new Set();
    const subjectItems = [];
    for (const c of list) {
      if (!c.sid || seenSids.has(c.sid)) continue;
      seenSids.add(c.sid);
      subjectItems.push({ sid: c.sid, name: subjectLabel(c), color: subjectColor(c.sid) });
    }

    const subjBar = `<div class="crs-catalog-head">
      <div class="learn-subj-bar">
        <div class="switch learn-subj-switch crs-subj-switch" role="group" aria-label="Предметы курсов">
          <button type="button" data-a="course-subj" data-sid="all" aria-pressed="${subjFilter === "all" ? "true" : "false"}">Все</button>
          <button type="button" data-a="course-subj" data-sid="fav" aria-pressed="${subjFilter === "fav" ? "true" : "false"}">${icon("star")}<span>Избранные (${favCount})</span></button>
          ${subjectItems.map((s) => `<button type="button" data-a="course-subj" data-sid="${esc(s.sid)}" aria-pressed="${subjFilter === s.sid ? "true" : "false"}"><span class="dot" style="--c:${esc(s.color)}" aria-hidden="true"></span>${esc(s.name)}</button>`).join("")}
        </div>
      </div>
      ${tplCount ? `<button type="button" class="btn sm crs-tpl-open-btn" data-a="course-templates-open">${icon("sliders")}<span>Шаблоны ОГЭ/ЕГЭ (${tplCount})</span></button>` : ""}
    </div>`;

    const resume = findResumeTarget();
    const resumeBanner = resume
      ? `<section class="card crs-resume-bar" id="crs-resume-bar" aria-label="Продолжить обучение">
          <div class="crs-resume-info">
            <div class="small muted">${esc(resume.course.title)} · ${esc(resume.lesson.code)}</div>
            <div class="crs-resume-title">${esc(resume.lesson.title)}</div>
            <div class="small muted tabular-nums">Шаг ${resume.stepIdx + 1} из ${resume.total} · Пройдено ${resume.doneCount}/${resume.total}</div>
          </div>
          <button type="button" class="btn primary sm" data-a="course-open" data-course="${esc(resume.course.id)}" data-lesson="${esc(resume.lesson.id)}">Продолжить${icon("arrow")}</button>
        </section>`
      : "";

    let visible = list.filter((c) => {
      if (subjFilter === "fav") return isFav(c.id);
      if (subjFilter !== "all") return c.sid === subjFilter;
      return true;
    });
    visible = visible.slice().sort((a, b) => {
      const fa = isFav(a.id) ? 0 : 1;
      const fb = isFav(b.id) ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const sa = a.comingSoon ? 1 : 0;
      const sb = b.comingSoon ? 1 : 0;
      return sa - sb;
    });

    let gridHtml = "";
    if (!visible.length) {
      gridHtml = `<div class="card pad-lg crs-filter-empty">
        <span class="small muted">${subjFilter === "fav" ? "Нажмите на звёздочку у нужного курса, чтобы закрепить его в избранном." : "По выбранному предмету курсов пока нет."}</span>
        <button type="button" class="btn sm" data-a="course-subj" data-sid="all">Показать все курсы</button>
      </div>`;
    } else {
      gridHtml = `<div class="crs-cat-grid">${visible.map((course) => {
        const fav = isFav(course.id);
        const color = subjectColor(course.sid);
        const subjName = subjectLabel(course);
        const soon = !!course.comingSoon;
        const favBtn = `<button type="button" class="crs-fav-btn" data-a="course-fav" data-course="${esc(course.id)}" aria-pressed="${fav ? "true" : "false"}" aria-label="${fav ? "Убрать из избранного" : "Добавить в избранное"}" title="${fav ? "Убрать из избранного" : "В избранное"}">${icon("star")}</button>`;

        if (soon) {
          return `<article class="card crs-cat-card is-soon" data-course-id="${esc(course.id)}">
            <div class="crs-cat-top">
              <span class="crs-cat-subj"><span class="dot" style="--c:${esc(color)}" aria-hidden="true"></span><span>${esc(subjName)}</span></span>
              ${favBtn}
            </div>
            <h2 class="crs-cat-title">${esc(course.title)}</h2>
            <p class="small muted crs-cat-desc">${esc(course.subtitle || "")}</p>
            <div class="crs-cat-foot">
              <span class="small muted tabular-nums">План: ~${esc(String(course.plannedCount || 20))} тем</span>
              <span class="badge">Скоро</span>
            </div>
          </article>`;
        }

        const sum = courseSummary(course);
        const openLabel = sum.totalDone > 0 ? "Продолжить" : "Начать";
        const topicsCount = sum.lessons.length;

        return `<article class="card crs-cat-card" data-course-id="${esc(course.id)}">
          <div class="crs-cat-top">
            <span class="crs-cat-subj"><span class="dot" style="--c:${esc(color)}" aria-hidden="true"></span><span>${esc(subjName)}</span></span>
            ${favBtn}
          </div>
          <h2 class="crs-cat-title">${esc(course.title)}</h2>
          <p class="small muted crs-cat-desc">${esc(course.subtitle || "")}</p>
          <div class="crs-cat-prog">
            <div class="crs-prog-txt tabular-nums">${sum.totalDone}/${sum.totalSteps} шагов · ${topicsCount} ${plural(topicsCount, "тема", "темы", "тем")} · ${sum.pct}%</div>
            <div class="crs-prog-bar" role="progressbar" aria-valuenow="${sum.pct}" aria-valuemin="0" aria-valuemax="100"><span class="crs-prog-fill" style="width:${sum.pct}%"></span></div>
          </div>
          <div class="crs-cat-foot">
            ${sum.resumeLesson ? `<button type="button" class="btn primary sm" data-a="course-open" data-course="${esc(course.id)}" data-lesson="${esc(sum.resumeLesson.id)}">${esc(openLabel)}${icon("arrow")}</button>` : ""}
            <button type="button" class="btn sm" data-a="course-select" data-course="${esc(course.id)}">Темы (${topicsCount})</button>
          </div>
        </article>`;
      }).join("")}</div>`;
    }

    return `<section class="crs-root" id="courses-root" aria-label="Каталог курсов">
      ${subjBar}
      ${resumeBanner}
      ${gridHtml}
    </section>`;
  }

  /* ---------- Уровень 2: Компактная программа курса на 20–25 тем ---------- */
  function renderSyllabusBody(course) {
    const cState = courseState();
    const filter = cState.filter || "all";
    const query = norm(cState.topicQ || "");
    const collapsedMods = cState.collapsedMods || {};
    const sum = courseSummary(course);
    const modules = groupCourseModules(course);

    const blocks = modules.map((mod) => {
      const modDone = mod.lessons.filter((l) => sum.statsById.get(l.id).completed).length;
      const visibleLessons = mod.lessons.filter((l) => {
        const st = sum.statsById.get(l.id);
        if (filter === "todo" && st.completed) return false;
        if (filter === "done" && !st.completed) return false;
        if (query) {
          const hay = norm([l.code, l.number, l.title, l.summary].join(" "));
          if (hay.indexOf(query) === -1) return false;
        }
        return true;
      });
      if (!visibleLessons.length) return "";

      const isCollapsed = !query && !!collapsedMods[mod.id];
      const rowsHtml = isCollapsed
        ? ""
        : `<div class="crs-mod-list">${visibleLessons.map((lesson) => {
          const st = sum.statsById.get(lesson.id);
          return `<button type="button" class="crs-trow${st.completed ? " is-done" : ""}" id="crs-lesson-${esc(lesson.id)}" data-a="course-open" data-course="${esc(course.id)}" data-lesson="${esc(lesson.id)}">
            <span class="crs-trow-code tabular-nums">${st.completed ? icon("check") : esc(topicShortCode(lesson))}</span>
            <span class="crs-trow-title">${esc(lesson.title)}</span>
            <span class="crs-trow-right">
              <span class="crs-trow-prog tabular-nums">${st.doneCount}/${st.total}</span>
              ${icon("arrow")}
            </span>
          </button>`;
        }).join("")}</div>`;

      return `<div class="crs-mod" id="crs-module-${esc(mod.id)}">
        <button type="button" class="crs-mod-head" data-a="course-mod-toggle" data-mod="${esc(mod.id)}" aria-expanded="${isCollapsed ? "false" : "true"}">
          <span class="crs-mod-left">
            <span class="crs-mod-title">Модуль ${esc(String(mod.number))} · ${esc(mod.title)}</span>
            ${mod.subtitle ? `<span class="small muted">${esc(mod.subtitle)}</span>` : ""}
          </span>
          <span class="crs-mod-right">
            <span class="crs-prog-txt tabular-nums">${modDone}/${mod.lessons.length}</span>
            ${icon("chevDown")}
          </span>
        </button>
        ${rowsHtml}
      </div>`;
    }).filter(Boolean).join("");

    const emptyBlock = blocks || `<div class="crs-filter-empty">
      <span class="small muted">${query ? "Темы по запросу не найдены." : (filter === "done" ? "Пока нет полностью пройденных тем." : "Все доступные темы уже пройдены!")}</span>
      <button type="button" class="btn sm" data-a="course-filter" data-filter="all">Сбросить фильтр</button>
    </div>`;

    const plannedHtml = (!query && filter !== "done" && Array.isArray(course.plannedModules) && course.plannedModules.length)
      ? `<div class="crs-planned-mods">
          <div class="small muted"><b>Дальнейшая программа курса (~${esc(String(course.plannedCount || 24))} тем):</b></div>
          ${course.plannedModules.map((pm) => `<div class="crs-mod-planned">
            <div class="crs-mod-planned-main">
              <span class="crs-mod-planned-title">Модуль ${esc(String(pm.number))} · ${esc(pm.title)}</span>
              ${pm.subtitle ? `<span class="small muted">${esc(pm.subtitle)}</span>` : ""}
            </div>
            <span class="badge">Скоро</span>
          </div>`).join("")}
        </div>`
      : "";

    return emptyBlock + plannedHtml;
  }

  function viewCourseSyllabus(course) {
    const cState = courseState();
    const filter = cState.filter || "all";
    const sum = courseSummary(course);
    const fav = isFav(course.id);
    const todoCount = sum.lessons.length - sum.doneLessonsCount;
    const primaryLabel = sum.totalDone === 0
      ? `Начать: ${sum.resumeLesson ? sum.resumeLesson.code : "Тема 1"}`
      : (sum.doneLessonsCount >= sum.lessons.length
        ? "Повторить с Темы 1"
        : `Продолжить: ${sum.resumeLesson.code}`);

    const filterPills = [
      { id: "all", label: `Все (${sum.lessons.length})` },
      { id: "todo", label: `Осталось (${todoCount})` },
      { id: "done", label: `Пройдены (${sum.doneLessonsCount})` }
    ].map((f) => `<button type="button" class="crs-filter-pill" data-a="course-filter" data-filter="${f.id}" aria-pressed="${filter === f.id ? "true" : "false"}">${esc(f.label)}</button>`).join("");

    return `<section class="crs-root" id="courses-root" aria-label="${esc(course.title)}">
      <div class="card pad-lg crs-course-hero" data-course-id="${esc(course.id)}">
        <div class="crs-hero-top">
          <button type="button" class="btn sm" data-a="course-back-catalog">${icon("back")}<span>Все курсы</span></button>
          <button type="button" class="btn sm crs-fav-pill" data-a="course-fav" data-course="${esc(course.id)}" aria-pressed="${fav ? "true" : "false"}">${icon("star")}<span>${fav ? "В избранном" : "В избранное"}</span></button>
        </div>

        <div class="crs-course-head">
          <div class="crs-course-title-wrap">
            <span class="dot" style="--c:${esc(subjectColor(course.sid))}" aria-hidden="true"></span>
            <div>
              <h2 class="h2">${esc(course.title)}</h2>
              <p class="small muted">${esc(course.subtitle || "")}</p>
            </div>
          </div>
          <div class="crs-course-prog">
            <span class="crs-prog-txt tabular-nums">${sum.totalDone}/${sum.totalSteps} шагов · ${sum.doneLessonsCount}/${sum.lessons.length} тем · ${sum.pct}%</span>
            <div class="crs-prog-bar" role="progressbar" aria-valuenow="${sum.pct}" aria-valuemin="0" aria-valuemax="100"><span class="crs-prog-fill" style="width:${sum.pct}%"></span></div>
            ${sum.resumeLesson ? `<div class="crs-course-actions"><button type="button" class="btn primary sm" data-a="course-open" data-course="${esc(course.id)}" data-lesson="${esc(sum.resumeLesson.id)}">${esc(primaryLabel)}${icon("arrow")}</button></div>` : ""}
          </div>
        </div>

        <div class="crs-syllabus-tools">
          <div class="crs-search-wrap">
            <span class="guide-search-ico" aria-hidden="true">${icon("search")}</span>
            <input id="crs-topic-q" class="input" type="search" autocomplete="off" placeholder="Поиск темы или номера (4, 5, паронимы)..." value="${esc(cState.topicQ || "")}" />
          </div>
          <div class="crs-filter-pills" role="group" aria-label="Фильтр тем">${filterPills}</div>
        </div>

        <div class="crs-syllabus-body" id="crs-syllabus-body">${renderSyllabusBody(course)}</div>
      </div>
    </section>`;
  }

  /* ---------- Уровень 3: Пошаговый плеер урока Stepik ---------- */
  function viewPlayer(course, lesson) {
    const cState = courseState();
    const lessons = Array.isArray(course.lessons) ? course.lessons : [];
    const lessonIdx = Math.max(0, lessons.findIndex((l) => l.id === lesson.id));
    const nextLesson = lessons[lessonIdx + 1] || null;

    const steps = lesson.steps || [];
    if (cState.stepIdx < 0 || cState.stepIdx >= steps.length) cState.stepIdx = 0;
    const step = steps[cState.stepIdx];
    const st = lessonStats(lesson);
    const isStepDone = !!st.doneMap[step.id];
    const hasPrev = cState.stepIdx > 0;
    const hasNext = cState.stepIdx < steps.length - 1;

    const drawerHtml = cState.drawerOpen
      ? `<div class="card crs-drawer" id="crs-topic-drawer" aria-label="Темы курса">
          <div class="crs-drawer-head small muted"><b>Темы курса «${esc(course.title)}»</b></div>
          <div class="crs-drawer-list">
            ${lessons.map((l) => {
              const ls = lessonStats(l);
              const isCur = l.id === lesson.id;
              return `<button type="button" class="crs-drawer-item${isCur ? " is-cur" : ""}${ls.completed ? " is-done" : ""}" data-a="course-open" data-course="${esc(course.id)}" data-lesson="${esc(l.id)}">
                <span class="crs-trow-code tabular-nums">${ls.completed ? icon("check") : esc(topicShortCode(l))}</span>
                <span class="crs-drawer-info">
                  <span class="crs-drawer-title">${esc(l.title)}</span>
                  <span class="small muted tabular-nums">${ls.doneCount}/${ls.total} шагов</span>
                </span>
                ${isCur ? `<span class="badge">Открыта</span>` : icon("arrow")}
              </button>`;
            }).join("")}
          </div>
        </div>`
      : "";

    const strip = steps.map((s, idx) => {
      const done = !!st.doneMap[s.id];
      const cur = idx === cState.stepIdx;
      const cls = `crs-step-pill ${stepKindClass(s.kind)}${cur ? " is-cur" : ""}${done ? " is-done" : ""}`;
      return `<button type="button" class="${cls}" role="tab" data-a="course-step" data-idx="${idx}" aria-selected="${cur ? "true" : "false"}"${cur ? ' aria-current="step"' : ""} title="${esc((idx + 1) + ". " + stepKindLabel(s.kind) + ": " + s.title)}">
        <span class="crs-step-num tabular-nums">${idx + 1}</span>
        ${icon(stepIconName(s.kind, done))}
      </button>`;
    }).join("");

    let cardBody = "";
    if (step.kind === "theory") {
      const blocksHtml = (step.blocks || []).map(renderTheoryBlock).join("");
      const btnText = isStepDone
        ? (hasNext ? "Дальше к практике" : "Завершить теорию")
        : (hasNext ? "Понятно, дальше к практике" : "Отметить изученным");
      cardBody = `<div class="crs-theory-body">${blocksHtml}</div>
        <div class="crs-step-actions">
          <button type="button" class="btn primary" data-a="course-theory-done">${esc(btnText)}${icon("arrow")}</button>
        </div>`;
    } else {
      const eng = tplEngine();
      const att = getAttempt(lesson.id, step);
      cardBody = eng ? eng.renderBody(step, att, { isDone: isStepDone, hasNext }) : "";
    }

    const completeBanner = st.doneCount >= st.total
      ? `<section class="card pad-lg crs-complete" aria-label="Тема пройдена">
          <div class="crs-complete-head">
            ${icon("award")}
            <div>
              <h3>Тема «${esc(lesson.code)}» пройдена!</h3>
              <p class="small muted tabular-nums">Выполнено ${st.doneCount} из ${st.total} шагов (теория, мини-практика и контрольные тесты ЕГЭ).</p>
            </div>
          </div>
          <div class="crs-step-actions">
            ${nextLesson ? `<button type="button" class="btn primary" data-a="course-open" data-course="${esc(course.id)}" data-lesson="${esc(nextLesson.id)}">Следующая тема: ${esc(nextLesson.code)}${icon("arrow")}</button>` : ""}
            <button type="button" class="btn" data-a="course-reset">${icon("repeat")}<span>Пройти заново</span></button>
            <button type="button" class="btn${nextLesson ? "" : " primary"}" data-a="course-to-trainer">К тренажёру ЕГЭ${icon("arrow")}</button>
          </div>
        </section>`
      : "";

    return `<section class="crs-root crs-player" id="courses-root" aria-label="${esc(lesson.title)}">
      <div class="crs-head">
        <div class="crs-head-actions">
          <button type="button" class="btn sm" data-a="course-back-course">${icon("back")}<span>К курсу</span></button>
          <button type="button" class="btn sm" data-a="course-drawer-toggle" aria-expanded="${cState.drawerOpen ? "true" : "false"}"><span class="tabular-nums">Темы (${lessonIdx + 1}/${lessons.length})</span>${icon("chevDown")}</button>
        </div>
        <div class="crs-head-stat tabular-nums">Шаг ${cState.stepIdx + 1}/${st.total} · Пройдено ${st.doneCount}/${st.total}</div>
        <div class="crs-head-title">
          <div class="small muted">${esc(course.title)} · ${esc(lesson.code)}</div>
          <h2 class="h2">${esc(lesson.title)}</h2>
        </div>
      </div>

      ${drawerHtml}

      <div class="crs-step-strip" role="tablist" aria-label="Шаги темы">${strip}</div>

      <article class="card pad-lg crs-step-card">
        <div class="crs-step-head">
          <span class="crs-badge ${stepKindClass(step.kind)}">${esc(step.badge || stepKindLabel(step.kind))}</span>
          ${isStepDone ? `<span class="crs-done-chip">${icon("check")}<span>Пройдено</span></span>` : ""}
        </div>
        <h3 class="crs-step-title">${esc(step.title)}</h3>
        ${cardBody}
      </article>

      ${completeBanner}

      <div class="crs-nav-foot">
        <button type="button" class="btn" data-a="course-prev"${hasPrev ? "" : " disabled"}>${icon("back")}<span>Предыдущий</span></button>
        <button type="button" class="btn" data-a="course-next"${hasNext ? "" : " disabled"}><span>Следующий</span>${icon("arrow")}</button>
      </div>
    </section>`;
  }

  function viewCourses() {
    const st = courseState();
    if (st.templatesOpen) return viewTemplatesShowcase();
    if (st.lessonId) {
      const { course, lesson } = findCourseLesson(st.courseId, st.lessonId);
      if (course && lesson) return viewPlayer(course, lesson);
      st.lessonId = "";
      st.stepIdx = 0;
      st.drawerOpen = false;
    }
    if (st.courseId) {
      const { course } = findCourseLesson(st.courseId, "");
      if (course && !course.comingSoon) return viewCourseSyllabus(course);
      st.courseId = "";
    }
    return viewCatalog();
  }

  function activeStepCtx() {
    const st = courseState();
    if (!st.lessonId) return null;
    const { course, lesson } = findCourseLesson(st.courseId, st.lessonId);
    if (!course || !lesson) return null;
    const step = lesson.steps[st.stepIdx] || lesson.steps[0];
    return { st, course, lesson, step };
  }

  function activeInteractiveTarget() {
    const st = courseState();
    const eng = tplEngine();
    if (!eng) return null;
    if (st.templatesOpen) {
      const sample = eng.SAMPLES[st.tplIdx] || eng.SAMPLES[0];
      if (!sample) return null;
      return { mode: "template", step: sample, att: getTplAttempt(sample) };
    }
    const ctx = activeStepCtx();
    if (!ctx || !ctx.step || ctx.step.kind === "theory") return null;
    return { mode: "lesson", course: ctx.course, lesson: ctx.lesson, st: ctx.st, step: ctx.step, att: getAttempt(ctx.lesson.id, ctx.step) };
  }

  function onInput(val, id, ds) {
    const tgt = activeInteractiveTarget();
    const eng = tplEngine();
    if (!tgt || !eng) return;
    const inputId = id || "crs-input";
    if (!eng.handleInput(inputId, val, tgt.step, tgt.att, ds)) return;
    const doc = typeof document !== "undefined" ? document : null;
    const btn = doc && typeof doc.getElementById === "function" ? doc.getElementById("crs-check-btn") : null;
    if (btn) btn.disabled = !eng.isReady(tgt.step, tgt.att);
  }

  function onTopicSearch(val) {
    const st = courseState();
    st.topicQ = String(val == null ? "" : val);
    const { course } = findCourseLesson(st.courseId, "");
    const doc = typeof document !== "undefined" ? document : null;
    const bodyEl = doc && typeof doc.getElementById === "function" ? doc.getElementById("crs-syllabus-body") : null;
    if (course && bodyEl) {
      bodyEl.innerHTML = renderSyllabusBody(course);
      return;
    }
    scheduleRender();
  }

  function registerActions(ACTIONS) {
    ACTIONS["course-templates-open"] = () => {
      const st = courseState();
      st.templatesOpen = true;
      scheduleRender();
    };

    ACTIONS["course-templates-close"] = () => {
      const st = courseState();
      st.templatesOpen = false;
      scheduleRender();
    };

    ACTIONS["course-tpl-pick"] = (el) => {
      const eng = tplEngine();
      if (!eng) return;
      const idx = Number(el.dataset.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= eng.SAMPLES.length) return;
      courseState().tplIdx = idx;
      scheduleRender();
    };

    ACTIONS["course-tpl-check"] = () => {
      const eng = tplEngine();
      const st = courseState();
      if (!eng || !st.templatesOpen) return;
      const sample = eng.SAMPLES[st.tplIdx];
      if (!sample) return;
      const att = getTplAttempt(sample);
      if (!eng.isReady(sample, att)) return;
      const res = eng.evaluate(sample, att);
      att.checked = true;
      att.ok = res.ok;
      att.r = res.r;
      scheduleRender();
    };

    ACTIONS["course-tpl-retry"] = () => {
      const eng = tplEngine();
      const st = courseState();
      if (!eng || !st.templatesOpen) return;
      const sample = eng.SAMPLES[st.tplIdx];
      if (!sample) return;
      st.tplAttempts[sample.id] = eng.initAttempt(sample);
      scheduleRender();
    };

    ACTIONS["course-tpl-act"] = (el) => {
      const eng = tplEngine();
      const tgt = activeInteractiveTarget();
      if (!eng || !tgt) return;
      const op = String((el && el.dataset && el.dataset.op) || "");
      if (!op) return;
      if (eng.handleAction(op, el, tgt.step, tgt.att)) scheduleRender();
    };

    ACTIONS["course-code-run"] = async () => {
      const eng = tplEngine();
      const tgt = activeInteractiveTarget();
      if (!eng || !tgt || tgt.step.qtype !== "code") return;
      const att = tgt.att;
      if (att.running || !eng.isReady(tgt.step, att)) return;
      att.running = true;
      att.runError = "";
      scheduleRender();
      try {
        const res = await fetch("/api/courses/run-python", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: att.code, tests: tgt.step.tests || [] })
        });
        let data = null;
        try { data = await res.json(); } catch (e) { data = null; }
        if (!res.ok) {
          const msg = (data && ((data.detail && data.detail.message) || data.message)) || ("HTTP " + res.status);
          att.runError = msg;
          att.running = false;
          scheduleRender();
          return;
        }
        att.running = false;
        att.results = Array.isArray(data && data.results) ? data.results : [];
        att.runError = (data && data.error) || "";
        att.checked = !(data && data.error);
        att.ok = !!(data && data.ok);
        att.r = att.ok ? 2 : 0;
        if (tgt.mode === "lesson" && att.ok) {
          markStepDone(tgt.course.id, tgt.lesson, tgt.step.id, tgt.st.stepIdx);
        }
      } catch (e) {
        att.running = false;
        att.runError = "Не удалось связаться с сервером проверки Python.";
      }
      scheduleRender();
    };

    ACTIONS["course-subj"] = (el) => {
      const sid = String(el.dataset.sid || "all");
      courseState().subjFilter = sid;
      scheduleRender();
    };

    ACTIONS["course-fav"] = (el) => {
      const courseId = String(el.dataset.course || "");
      if (!courseId) return;
      const nextVal = !isFav(courseId);
      patchDoc("courses", { favorites: { [courseId]: nextVal } });
      scheduleRender();
    };

    ACTIONS["course-select"] = (el) => {
      const courseId = String(el.dataset.course || "");
      const { course } = findCourseLesson(courseId, "");
      if (!course || course.comingSoon) return;
      const st = courseState();
      st.templatesOpen = false;
      st.courseId = course.id;
      st.lessonId = "";
      st.drawerOpen = false;
      scheduleRender();
    };

    ACTIONS["course-back-catalog"] = () => {
      const st = courseState();
      st.templatesOpen = false;
      st.courseId = "";
      st.lessonId = "";
      st.drawerOpen = false;
      scheduleRender();
    };

    ACTIONS["course-back-course"] = () => {
      const st = courseState();
      st.lessonId = "";
      st.drawerOpen = false;
      scheduleRender();
    };

    ACTIONS["course-mod-toggle"] = (el) => {
      const modId = String(el.dataset.mod || "");
      if (!modId) return;
      const st = courseState();
      st.collapsedMods[modId] = !st.collapsedMods[modId];
      scheduleRender();
    };

    ACTIONS["course-filter"] = (el) => {
      const val = String(el.dataset.filter || "all");
      const st = courseState();
      st.filter = (val === "todo" || val === "done") ? val : "all";
      if (val === "all") st.topicQ = "";
      scheduleRender();
    };

    ACTIONS["course-drawer-toggle"] = () => {
      const st = courseState();
      st.drawerOpen = !st.drawerOpen;
      scheduleRender();
    };

    ACTIONS["course-open"] = (el) => {
      const courseId = String(el.dataset.course || "");
      const lessonId = String(el.dataset.lesson || "");
      const { course, lesson } = findCourseLesson(courseId, lessonId);
      if (!course || !lesson) return;
      const cState = courseState();
      const stats = lessonStats(lesson);
      cState.templatesOpen = false;
      cState.courseId = course.id;
      cState.lessonId = lesson.id;
      cState.stepIdx = stats.resumeIdx;
      cState.drawerOpen = false;
      scheduleRender();
    };

    ACTIONS["course-close"] = ACTIONS["course-back-catalog"];

    ACTIONS["course-step"] = (el) => {
      const ctx = activeStepCtx();
      if (!ctx) return;
      const idx = Number(el.dataset.idx);
      if (!Number.isInteger(idx) || idx < 0 || idx >= ctx.lesson.steps.length) return;
      ctx.st.stepIdx = idx;
      scheduleRender();
    };

    ACTIONS["course-prev"] = () => {
      const ctx = activeStepCtx();
      if (!ctx || ctx.st.stepIdx <= 0) return;
      ctx.st.stepIdx -= 1;
      scheduleRender();
    };

    ACTIONS["course-next"] = () => {
      const ctx = activeStepCtx();
      if (!ctx || ctx.st.stepIdx >= ctx.lesson.steps.length - 1) return;
      ctx.st.stepIdx += 1;
      scheduleRender();
    };

    ACTIONS["course-theory-done"] = () => {
      const ctx = activeStepCtx();
      if (!ctx || ctx.step.kind !== "theory") return;
      const nextIdx = ctx.st.stepIdx < ctx.lesson.steps.length - 1 ? ctx.st.stepIdx + 1 : ctx.st.stepIdx;
      markStepDone(ctx.course.id, ctx.lesson, ctx.step.id, nextIdx);
      if (ctx.st.stepIdx < ctx.lesson.steps.length - 1) ctx.st.stepIdx += 1;
      scheduleRender();
    };

    ACTIONS["course-opt"] = (el) => {
      const eng = tplEngine();
      const tgt = activeInteractiveTarget();
      if (!eng || !tgt) return;
      if (eng.handleAction("opt", el, tgt.step, tgt.att)) scheduleRender();
    };

    ACTIONS["course-check"] = () => {
      const eng = tplEngine();
      const ctx = activeStepCtx();
      if (!eng || !ctx || ctx.step.kind === "theory") return;
      const att = getAttempt(ctx.lesson.id, ctx.step);
      if (!eng.isReady(ctx.step, att)) return;
      const res = eng.evaluate(ctx.step, att);
      att.checked = true;
      att.ok = res.ok;
      att.r = res.r;
      if (res.ok) {
        markStepDone(ctx.course.id, ctx.lesson, ctx.step.id, ctx.st.stepIdx);
      }
      scheduleRender();
    };

    ACTIONS["course-retry"] = () => {
      const eng = tplEngine();
      const ctx = activeStepCtx();
      if (!ctx || ctx.step.kind === "theory") return;
      const key = attemptKey(ctx.lesson.id, ctx.step.id);
      ctx.st.attempts[key] = eng ? eng.initAttempt(ctx.step) : { pick: null, input: "", checked: false, ok: false };
      scheduleRender();
    };

    ACTIONS["course-reset"] = () => {
      const ctx = activeStepCtx();
      if (!ctx) return;
      const doc = courseDoc();
      const nextLessons = Object.assign({}, (doc.lessons && typeof doc.lessons === "object") ? doc.lessons : {});
      delete nextLessons[ctx.lesson.id];
      const nextDoc = Object.assign({}, doc, { lessons: nextLessons });
      if (nextDoc.lastLessonId === ctx.lesson.id) {
        delete nextDoc.lastLessonId;
        delete nextDoc.lastCourseId;
      }
      replaceDoc("courses", nextDoc);
      const prefix = ctx.lesson.id + ":";
      for (const k of Object.keys(ctx.st.attempts)) {
        if (k.indexOf(prefix) === 0) delete ctx.st.attempts[k];
      }
      ctx.st.stepIdx = 0;
      if (typeof toast === "function") toast("Прогресс по теме сброшен");
      scheduleRender();
    };

    ACTIONS["course-to-trainer"] = () => {
      const st = courseState();
      st.lessonId = "";
      st.courseId = "";
      st.drawerOpen = false;
      st.templatesOpen = false;
      ui.learnTab = "subjects";
      ui.learnSid = "rus";
      if (SUBJ && SUBJ.rus) ui.sid = "rus";
      scheduleRender();
    };
  }

  EGE.views = EGE.views || {};
  EGE.views.courses = { configure, registerActions, viewCourses, onInput, onTopicSearch };
})();
