/* Тренажёр ЕГЭ: главная, вкладка «Тесты», предметы, темы, квиз и ИИ-репетитор. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const {
    $, addDays, byDue, capitalize, dateDay, dateLong, days, daysUntil, esc,
    fmtWeekday, minutesText, newId, norm, normTight, pad, parseNum, plural,
    range, rich, shuffle, todayISO, validISO
  } = EGE.utils;
  const { icon } = EGE.ui;

  let CONTENT, DEFAULT_TARGETS, DIAG_PLAN_ID, INTERVALS, LETTERS, MAX_Q_MS, QUIZ_SIZE;
  let SUBJ, SUBJECTS, SUBJECT_META, SUBJECT_NAME, TOPIC_QUIZ, TOPICS, QS;
  let ai, cloud, mkt, store, ui;
  let clearActiveQuiz, codeLabel, completePlanFromQuiz, defaultName, draft, dueQs;
  let firstSubject, go, localNotice, markPlanPrep, mistakeQs, mocks, nextExam;
  let patchDoc, planDoc, planItems, profile, prog, saveActiveQuiz, scheduleRender;
  let staleNotice, stepBtn, subjectStats, tile, toast, todoItem, topicRef, topicStats, totals;

  function configure(ctx) {
    ({
      CONTENT, DEFAULT_TARGETS, DIAG_PLAN_ID, INTERVALS, LETTERS, MAX_Q_MS, QUIZ_SIZE,
      SUBJ, SUBJECTS, SUBJECT_META, SUBJECT_NAME, TOPIC_QUIZ, TOPICS, QS,
      ai, cloud, mkt, store, ui,
      clearActiveQuiz, codeLabel, completePlanFromQuiz, defaultName, draft, dueQs,
      firstSubject, go, localNotice, markPlanPrep, mistakeQs, mocks, nextExam,
      patchDoc, planDoc, planItems, profile, prog, saveActiveQuiz, scheduleRender,
      staleNotice, stepBtn, subjectStats, tile, toast, todoItem, topicRef, topicStats, totals
    } = ctx || {});
  }

  function viewTests(opts) {
    const embedded = !!(opts && opts.embedded);
    const prof = profile();
    const name = prof.name || (store.ready ? defaultName() : "");
    const parts = [];
    if (embedded) {
      parts.push(`<div class="row between" style="gap:8px;flex-wrap:wrap"><h2 class="h2">Тесты ЕГЭ</h2><span class="small muted">3 предмета · ФИПИ и КИМ</span></div>`);
    } else {
      parts.push(`<div class="head"><div><div class="eyebrow">${name ? `Привет, ${esc(name)}! · ` : ""}ЕГЭ 2027 · Тренажёр</div><h1 class="h1">Тесты ЕГЭ</h1></div><p class="lead">Отработка заданий ФИПИ по трём предметам, полные варианты КИМ и быстрый поиск по правилам без нейросети.</p></div>`);
      if (store.backend && store.ready && !store.user && !ui.demoAuthed) parts.push(`<div class="notice"><b>Гостевой режим.</b><span>Прогресс хранится в этом браузере. <button type="button" class="link-btn" data-a="auth-modal-open">Войти или создать аккаунт</button>, чтобы синхронизировать.</span></div>`);
      if (store.mode === "local" && !store.backend) parts.push(localNotice());
      parts.push(staleNotice());
    }

    const subjCards = CONTENT.map((s) => {
      const st = subjectStats(s.id);
      const mis = store.ready ? mistakeQs(s.id).length : 0;
      const due = store.ready ? dueQs(s.id).length : 0;
      const target = (prof.targets && prof.targets[s.id]) || 80;
      return `<article class="card stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div class="row" style="gap:8px"><i class="dot" style="background:var(--c-${s.id})"></i><h2 class="h2">${esc(s.name)}</h2></div>
          <span class="chip num">готовность ${store.ready ? st.pct + "%" : "—"} · цель ${target}</span>
        </div>
        <div class="meter"><i style="width:${st.pct}%"></i></div>
        <div class="row between small muted" style="flex-wrap:wrap;gap:6px">
          <span>освоено ${st.mastered} из ${st.total} · тем ${st.started}/${st.topics}</span>
          <span>${mis ? `ошибок: ${mis}` : due ? `повторить: ${due}` : "без долгов"}</span>
        </div>
        <div class="tutor-actions">
          <button type="button" class="btn" data-a="go" data-v="subject" data-sid="${s.id}">Открыть темы</button>
          <button type="button" class="btn soft" data-a="quiz-mixed" data-sid="${s.id}">Смешанный тест</button>
        </div>
        ${mis ? `<div><button type="button" class="link-btn small" data-a="quiz-mistakes" data-sid="${s.id}">Разобрать ошибки (${mis})</button></div>` : ""}
      </article>`;
    }).join("");
    parts.push(`<div class="grid-3">${subjCards}</div>`);

    parts.push(`<section class="card stack" style="gap:10px">
      <div class="row between" style="gap:8px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Офлайн без нейросети</div>
          <h2 class="h2">Справочник, формулы и сочинение</h2>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          ${EGE.essay ? `<button type="button" class="btn soft sm" data-a="go" data-v="essay">Сочинение №27</button>` : ""}
          <button type="button" class="btn sm" data-a="go" data-v="tutor">Открыть справочник</button>
        </div>
      </div>
      <div class="chip-rail">
        ${["митоз", "гидролиз", "задание 8", "клише"].map((q) => `<button type="button" class="chip-btn" data-a="tests-guide-chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}
      </div>
    </section>`);

    parts.push(`<section class="section"><div class="section-head"><h2 class="h2">Рекомендуем сейчас</h2><button type="button" class="link-btn small" data-a="go" data-v="market">Нужен репетитор?</button></div><div class="steps">${nextSteps().map(stepBtn).join("")}</div></section>`);
    parts.push(`<div class="grid-hero">${heroCard(prof)}${examsCard(prof)}</div>`);
    return parts.join("");
  }

  // ---------- главная ----------
  function viewHome() {
    const prof = profile();
    const name = prof.name || (store.ready ? defaultName() : "");
    const parts = [];
    parts.push(`<div class="head"><div class="eyebrow">Главная · ${esc(capitalize(fmtWeekday.format(new Date())))}</div><h1 class="h1">${name ? "Привет, " + esc(name) + "!" : "Главная"}</h1><p class="lead">Отклики преподавателям, статусы ответов (СМС и мессенджер) и быстрый переход к занятиям.</p></div>`);
    if (store.backend && store.ready && !store.user && !ui.demoAuthed) parts.push(`<div class="notice"><b>Гостевой режим.</b><span>Прогресс сохраняется только в этом браузере. <button type="button" class="link-btn" data-a="auth-modal-open">Войти или создать аккаунт</button>, чтобы синхронизировать с сервером.</span></div>`);
    if (store.mode === "local" && !store.backend) parts.push(localNotice());
    parts.push(staleNotice());
    if (EGE.views.marketplace && typeof EGE.views.marketplace.studentHomeBidsHTML === "function") {
      parts.push(EGE.views.marketplace.studentHomeBidsHTML());
    }
    const stMkt = mkt();
    const balRub = Number(stMkt.balance) || 0;
    parts.push(`<section class="section"><div class="card" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap"><div class="stack" style="gap:3px"><b>Баланс СБП: <span class="num">${balRub.toLocaleString("ru-RU")} ₽</span></b><span class="small muted">${balRub >= 490 ? "Средства готовы к бронированию урока с защитой СБП" : "Пополните баланс от 490 ₽ по СБП без комиссии или предложите цену преподавателю"}</span></div><div class="row" style="gap:8px;flex-wrap:wrap"><button type="button" class="btn soft sm" data-a="bal-open">${icon("wallet")}<span>Пополнить</span></button><button type="button" class="btn sm" data-a="go" data-v="market">Поиск репетитора</button></div></div></section>`);
    const quickNavCard = `<section class="card stack" style="gap:12px" aria-label="Быстрые разделы">
      <div>
        <div class="eyebrow">Подготовка к ЕГЭ</div>
        <h2 class="h2">Быстрый переход</h2>
      </div>
      <div class="steps" style="grid-template-columns:1fr">
        ${stepBtn({ a: "go", v: "tutor", ico: "book", title: "Справочник без ИИ", sub: "Конспекты, таблицы и сочинение №27" })}
        ${stepBtn({ a: "go", v: "tests", ico: "list", title: "Тесты ЕГЭ", sub: "Задания ФИПИ и полные варианты КИМ" })}
        ${stepBtn({ a: "go", v: "stats", ico: "chart", title: "Показатели", sub: "Точность, время и повторяемость тем" })}
        ${stepBtn({ a: "go", v: "profile", ico: "gear", title: "Профиль", sub: "Целевые баллы, телефон и настройки" })}
      </div>
    </section>`;
    parts.push(`<div class="grid-hero">${heroCard(prof)}${quickNavCard}</div>`);
    return parts.join("");
  }
  function onboardingCard() {
    const cloudText = store.mode === "cloud"
      ? (store.backend
          ? "Прогресс сохраняется на сервере и привязан к твоему аккаунту: открой сайт с любого устройства под своим логином, и всё будет на месте."
          : "Прогресс сохраняется в облаке claude.ai: открой эту страницу на любом компьютере под своим аккаунтом, и всё будет на месте.")
      : "Сейчас данные сохраняются только в этом браузере.";
    return `<form class="card pad-lg form" data-f="onboard" style="border-color:var(--accent)">
      <div class="eyebrow">Первый вход</div>
      <h2 class="h2">Давай настроим подготовку</h2>
      <p class="ink2">${cloudText}</p>
      ${store.user ? "" : `<div class="field"><label for="ob-name">Как к тебе обращаться</label><input class="input" id="ob-name" data-d="ob.name" value="${esc(draft("ob.name", defaultName()))}" maxlength="40"></div>`}
      <div class="label">Целевые баллы ЕГЭ</div>
      <div class="fields">${SUBJECT_META.map((s) => `<div class="field"><label for="ob-${s.id}">${esc(s.name)}</label><input class="input num" type="number" min="0" max="100" inputmode="numeric" id="ob-${s.id}" data-d="ob.${s.id}" value="${esc(draft("ob." + s.id, DEFAULT_TARGETS[s.id]))}"></div>`).join("")}</div>
      <p class="hint">Ориентир: сумма по трём предметам — до 300 баллов (обычно цель ставят от 220+). Целевые баллы можно поменять позже в настройках.</p>
      <div><button class="btn" type="submit">Начать подготовку</button></div>
    </form>`;
  }
  function heroMetaRow() {
    const tot = totals();
    if (!tot.streak && !tot.today) return "";
    return `<div class="row" style="gap:6px">${tot.streak ? `<span class="chip good">Серия: ${days(tot.streak)}</span>` : ""}${tot.today ? `<span class="chip accent">Сегодня: ${minutesText(tot.today)}</span>` : ""}</div>`;
  }
  function heroCard(prof) {
    const apply = planItems().find((i) => i.id === "ege-apply");
    const meta = heroMetaRow();
    const goSubjBtn = CONTENT.length ? `<button type="button" class="btn ghost" data-a="go" data-v="subject" data-sid="${ui.sid}">К тренировкам</button>` : "";
    if (apply && !apply.done && validISO(apply.due) && daysUntil(apply.due) >= 0) {
      const n = daysUntil(apply.due);
      return `<section class="hero" aria-label="Главный срок">
        <div class="row between"><span class="eyebrow">Главный срок</span>${meta}</div>
        <div class="hero-figure">${n === 0 ? '<span class="hero-num">Сегодня</span>' : `<span class="hero-num num">${n}</span><span class="hero-unit">${plural(n, "день", "дня", "дней")}</span>`}</div>
        <p class="hero-text">${n === 0 ? "последний день" : "до " + dateDay(apply.due) + ", последнего дня"} подачи заявления на ЕГЭ по химии, биологии и русскому языку. Возьми паспорт и аттестат.</p>
        <div class="row"><button type="button" class="btn" data-a="go" data-v="plan">Открыть план</button>${goSubjBtn}</div>
      </section>`;
    }
    const ex = nextExam(prof);
    if (ex) {
      const n = daysUntil(ex.date);
      return `<section class="hero" aria-label="Ближайший экзамен">
        <div class="row between"><span class="eyebrow">Ближайший экзамен</span>${meta}</div>
        <div class="hero-figure">${n === 0 ? '<span class="hero-num">Сегодня</span>' : `<span class="hero-num num">${n}</span><span class="hero-unit">${plural(n, "день", "дня", "дней")}</span>`}</div>
        <p class="hero-text">${n === 0 ? "экзамен" : "до экзамена"} по предмету «${esc(ex.name)}», ${dateLong(ex.date)}. Цель — ${prof.targets[ex.subject]} баллов.</p>
        <div class="row"><button type="button" class="btn" data-a="go" data-v="plan">Открыть план</button>${goSubjBtn}</div>
      </section>`;
    }
    return `<section class="hero"><div class="row between"><span class="eyebrow">Экзамены позади</span>${meta}</div><p class="hero-text">Теперь главное — заявление в вуз, конкурсные списки и согласие на зачисление.</p><div class="row"><button type="button" class="btn" data-a="go" data-v="plan">Открыть план</button></div></section>`;
  }
  function readinessCard(prof) {
    if (!CONTENT.length) return "";
    const rows = CONTENT.map((s) => {
      const st = subjectStats(s.id);
      const mis = store.ready ? mistakeQs(s.id).length : 0;
      const due = store.ready ? dueQs(s.id).length : 0;
      return `<div class="stack" style="gap:6px">
        <div class="row between"><button type="button" class="link-btn row" style="gap:8px" data-a="go" data-v="subject" data-sid="${s.id}"><i class="dot" style="background:var(--c-${s.id})"></i>${esc(s.name)}</button><span class="row" style="gap:8px"><b class="num">${store.ready ? st.pct + "%" : "—"}</b><span class="chip">цель ${prof.targets[s.id]}</span></span></div>
        <div class="meter"><i style="width:${st.pct}%"></i></div>
        <div class="row between small muted"><span>освоено ${st.mastered} из ${st.total} · начато ${st.started} из ${st.topics} тем</span>${mis ? `<span class="chip warn">ошибок: ${mis}</span>` : due ? `<span class="chip leaf">повторить: ${due}</span>` : ""}</div>
      </div>`;
    }).join("");
    return `<section class="card pad-lg stack" aria-label="Готовность по предметам">
      <div class="eyebrow">Готовность по предметам</div>
      ${rows}
      <div class="hint">Вопрос считается освоенным после двух верных ответов подряд.</div>
    </section>`;
  }
  function nextSteps() {
    const steps = [];
    if (ui.quiz && !ui.quiz.done) steps.push({ a: "go", v: "quiz", ico: "arrow", tone: "leaf", title: "Вернуться к тесту", sub: `${ui.quiz.title} · вопрос ${ui.quiz.i + 1} из ${ui.quiz.items.length}` });
    if (store.ready) {
      const pd = planDoc();
      CONTENT.forEach((s) => {
        if (subjectStats(s.id).seen === 0 && !pd.done[DIAG_PLAN_ID[s.id]]) steps.push({ a: "quiz-mixed", sid: s.id, ico: "spark", tone: "leaf", title: "Пройди диагностический тест " + SUBJ[s.id].po, sub: QUIZ_SIZE + " вопросов по всем разделам — результат сразу отметится в плане" });
      });
    }
    CONTENT.forEach((s) => {
      const due = dueQs(s.id).length;
      if (due) steps.push({ a: "quiz-review", sid: s.id, ico: "repeat", title: `Повтори ${due} ${plural(due, "вопрос", "вопроса", "вопросов")} · ${s.name}`, sub: "Интервальное повторение: пора закрепить пройденное" });
    });
    CONTENT.forEach((s) => {
      const mis = mistakeQs(s.id).length;
      if (mis) steps.push({ a: "quiz-mistakes", sid: s.id, ico: "alert", tone: "warn", title: `Работа над ошибками · ${s.name} · ${mis}`, sub: "Вопросы, где ответ был неверным" });
    });
    // Следующая тема — в предмете, где готовность ниже.
    const order = CONTENT.slice().sort((a, b) => subjectStats(a.id).pct - subjectStats(b.id).pct);
    for (const s of order) {
      const nt = SUBJ[s.id].topicList.find((t) => topicStats(t).pct < 90);
      if (!nt) continue;
      const ts = topicStats(nt);
      steps.push({ a: "open-topic", id: nt.id, ico: "book", tone: "good", title: (ts.pct ? "Продолжи: " : "Начни: ") + nt.title, sub: `${s.name} · ${codeLabel(nt).toLowerCase()} · освоено ${ts.mastered} из ${ts.total}` });
      break;
    }
    const todo = planItems().filter((i) => !i.done && validISO(i.due)).sort(byDue)[0];
    if (todo) {
      const n = daysUntil(todo.due);
      steps.push({ a: "go", v: "plan", ico: "list", title: todo.title, sub: n < 0 ? "срок прошёл " + dateLong(todo.due) : n === 0 ? "срок сегодня" : "срок — " + dateLong(todo.due) + ", через " + days(n) });
    }
    return steps.slice(0, 6);
  }
  function upcomingCard() {
    const all = planItems();
    const list = all.filter((i) => !i.done && validISO(i.due)).sort(byDue).slice(0, 4);
    const done = all.filter((i) => i.done).length;
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Ближайшие дела</h2><button type="button" class="link-btn" data-a="go" data-v="plan">Весь план</button></div>
      <div class="small muted">Сделано ${done} из ${all.length}</div>
      <div class="stack">${list.map((it) => todoItem(it, true)).join("") || '<div class="empty">Все дела выполнены.</div>'}</div>
    </section>`;
  }
  function examsCard(prof) {
    const rows = (EGE.exams || []).map((e) => ({ subject: e.subject, name: e.name, date: prof.exams[e.subject] || e.date }))
      .filter((r) => validISO(r.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
    const sum = SUBJECT_META.reduce((n, s) => n + (Number(prof.targets[s.id]) || 0), 0);
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Экзамены</h2><button type="button" class="link-btn" data-a="go" data-v="profile">Изменить даты</button></div>
      <div>${rows.map((r) => {
        const n = daysUntil(r.date);
        const chip = n < 0 ? '<span class="chip">прошёл</span>' : n === 0 ? '<span class="chip bad">сегодня</span>' : `<span class="chip${n <= 30 ? " warn" : ""}">через ${days(n)}</span>`;
        return `<div class="exam-row"><i class="dot" style="background:var(--c-${r.subject})"></i><div><div class="entry-title">${esc(r.name)}</div><div class="small muted">${dateLong(r.date)} · цель ${prof.targets[r.subject]}</div></div>${chip}</div>`;
      }).join("")}</div>
      <div class="hint">Даты по проекту расписания ЕГЭ-2027. Сумма целей — ${sum} из 300.</div>
    </section>`;
  }
  function activityCard() {
    const tot = totals();
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Занятия за 4 недели</h2><span class="small muted">минуты в день</span></div>
      <div class="chart" data-chart="activity" style="height:170px"></div>
      <div class="row between small"><span class="muted">Всего за 28 дней — ${minutesText(tot.d28)}</span><button type="button" class="link-btn" data-a="go" data-v="stats">Все показатели</button></div>
    </section>`;
  }

  // ---------- предмет и темы ----------
  function viewSubject() {
    const sid = SUBJ[ui.sid] ? ui.sid : firstSubject.id;
    const s = SUBJ[sid];
    if (!s) return `<div class="empty">Предмет пока не добавлен.</div>`;
    const st = subjectStats(sid), prof = profile();
    const ex = prof.exams[sid], n = validISO(ex) ? daysUntil(ex) : null;
    const due = dueQs(sid).length, mis = mistakeQs(sid).length;
    const soon = SUBJECTS.filter((x) => !x.content);
    const switcher = CONTENT.length > 1
      ? `<div class="switch" role="group" aria-label="Предмет">${SUBJECTS.map((x) => x.content
        ? `<button type="button" data-a="go" data-v="subject" data-sid="${x.id}" aria-pressed="${x.id === sid}"><i class="dot" style="background:var(--c-${x.id})"></i><span>${esc(x.name)}</span><span class="small num" style="opacity:.75">${subjectStats(x.id).pct}%</span></button>`
        : `<button type="button" disabled>${esc(x.name)} · скоро</button>`).join("")}</div>`
      : "";
    const qNorm = norm(ui.subjQ);
    const totalTopics = s.topicList.length;
    const filteredSecs = s.sections.map((sec) => {
      const secMatch = qNorm && norm(sec.title).includes(qNorm);
      const topics = sec.topics.filter((t) => {
        if (qNorm && !secMatch && !norm(t.title).includes(qNorm) && !norm(t.code).includes(qNorm)) return false;
        if (ui.subjFilter === "todo") return topicStats(t).pct < 90;
        if (ui.subjFilter === "mistakes") return mistakeQs(sid, t.id).length > 0;
        return true;
      });
      return { sec, topics };
    }).filter((x) => x.topics.length);
    const shownTopics = filteredSecs.reduce((n, x) => n + x.topics.length, 0);
    return `${switcher}<div class="head">
        <div class="eyebrow">Предмет · ЕГЭ 2027</div>
        <div class="head-row"><h1 class="h1">${esc(s.name)}</h1><span class="chip leaf">готовность ${st.pct}%</span></div>
        <p class="lead">${validISO(ex) ? `Экзамен по проекту расписания — ${dateLong(ex)}${n > 0 ? ", через " + days(n) : ""}. ` : ""}${esc(s.about || "")} Вопрос считается освоенным после двух верных ответов подряд.</p>
      </div>
      <div class="facts">${s.exam.facts.map((f) => `<div class="fact"><b>${esc(f[0])}</b><span>${esc(f[1])}</span></div>`).join("")}</div>
      <p class="hint">${esc(s.exam.note)}</p>
      ${s.fullVariant ? `<section class="card stack"><h2 class="h2">Пробные варианты ЕГЭ</h2><p class="small muted">${esc(s.fullVariant.sub)}</p>
        <div class="row" style="flex-wrap:wrap">${range(s.fullVariant.count).map((i) => `<button type="button" class="btn ghost sm" data-a="quiz-fullvariant" data-sid="${sid}" data-k="${i + 1}">Вариант ${i + 1}</button>`).join("")}<button type="button" class="btn sm" data-a="quiz-fullvariant" data-sid="${sid}" data-k="0">Случайный</button></div></section>` : ""}
      <section class="card stack"><h2 class="h2">Тренировка</h2><div class="steps">
        ${stepBtn({ a: "quiz-mixed", sid, ico: "spark", tone: "leaf", title: "Смешанный тест", sub: QUIZ_SIZE + " вопросов из разных тем: сначала новые и трудные" })}
        ${stepBtn({ a: "quiz-review", sid, ico: "repeat", title: "Повторение" + (due ? " · " + due : ""), sub: due ? "Вопросы, которые пора закрепить" : "Сейчас повторять нечего: вопросы появятся здесь по расписанию" })}
        ${stepBtn({ a: "quiz-mistakes", sid, ico: "alert", tone: "warn", title: "Работа над ошибками" + (mis ? " · " + mis : ""), sub: mis ? "Вопросы с неверным ответом" : "Ошибок пока нет" })}
        ${s.variant ? stepBtn({ a: "quiz-variant", sid, ico: "list", title: s.variant.label || "Пробный вариант ЕГЭ · часть 1", sub: s.variant.sub || "Задания 1–26 подряд, баллы как на экзамене, ответы — в конце" }) : ""}
        ${s.part2 ? stepBtn({ a: "quiz-part2", sid, ico: "book", title: s.part2.label, sub: s.part2.sub }) : ""}
        ${sid === "rus" && EGE.essay ? stepBtn({ a: "go", v: "essay", ico: "book", title: "Тренажёр сочинения", sub: "Задание 27: тексты, план, клише, аргументы и проверка по критериям" }) : ""}
      </div></section>
      <section class="section">
        <div class="section-head"><h2 class="h2">Темы предмета</h2><span class="small muted">${qNorm || ui.subjFilter !== "all" ? `показано ${shownTopics} из ${totalTopics}` : `всего тем: ${totalTopics}`}</span></div>
        <div class="toolbar">
          <div class="search-wrap">
            <input class="input" id="subj-q" type="text" autocomplete="off" spellcheck="false" value="${esc(ui.subjQ)}" placeholder="Поиск по теме или номеру задания…">
            ${ui.subjQ ? `<button type="button" class="search-clear" data-a="subj-clear" aria-label="Очистить поиск">${icon("x")}</button>` : ""}
          </div>
          <div class="switch" role="group" aria-label="Фильтр тем">
            <button type="button" data-a="subj-filter" data-filter="all" aria-pressed="${ui.subjFilter === "all"}">Все</button>
            <button type="button" data-a="subj-filter" data-filter="todo" aria-pressed="${ui.subjFilter === "todo"}">Не освоенные</button>
            <button type="button" data-a="subj-filter" data-filter="mistakes" aria-pressed="${ui.subjFilter === "mistakes"}">С ошибками</button>
          </div>
        </div>
      </section>
      ${filteredSecs.length ? filteredSecs.map((x) => `<section class="section-block"><div class="section-title"><span class="section-num">Раздел ${x.sec.n}</span><h2 class="h2">${esc(x.sec.title)}</h2></div><div class="slides">${x.topics.map(slide).join("")}</div></section>`).join("") : `<div class="empty"><b>Темы не найдены</b><span>В этом фильтре тем нет — попробуй другой запрос.</span><button type="button" class="btn ghost sm" data-a="subj-clear">Сбросить фильтр</button></div>`}
      <section class="card stack"><h2 class="h2">Где ещё тренироваться</h2><div class="stack">${s.links.map((l) => `<a href="${esc(l.href)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("")}</div></section>
      ${soon.length ? `<div class="empty"><b>${esc(soon.map((x) => x.name).join(", "))}</b><span>Появится здесь позже — с такими же темами, тестами и прогрессом. Пока записывай занятия в «Показатели».</span></div>` : ""}`;
  }
  function sectionBlock(sec) {
    return `<section class="section-block"><div class="section-title"><span class="section-num">Раздел ${sec.n}</span><h2 class="h2">${esc(sec.title)}</h2></div><div class="slides">${sec.topics.map(slide).join("")}</div></section>`;
  }
  function slide(t) {
    const ts = topicStats(t), p = prog(t.sid);
    const dots = t.qids.map((id) => { const st = p.q[id]; return `<i class="qdot" data-s="${st && st.n ? st.last : -1}"></i>`; }).join("");
    const chipCls = ts.pct >= 90 ? "good" : ts.pct > 0 ? "leaf" : "";
    return `<button type="button" class="slide" data-a="open-topic" data-id="${t.id}">
      <span class="slide-label">${esc(t.code)}<small>${esc((SUBJ[t.sid].codeName || "Тема").toUpperCase())}</small></span>
      <span class="slide-body">
        <span class="slide-top"><span class="slide-title">${esc(t.title)}</span><span class="chip ${chipCls} num">${ts.pct}%</span></span>
        <span class="meter thin"><i style="width:${ts.pct}%"></i></span>
        <span class="slide-meta"><span>освоено ${ts.mastered} из ${ts.total}</span>${ts.read ? "<span>теория прочитана</span>" : ""}<span class="qdots" aria-hidden="true">${dots}</span></span>
      </span>
    </button>`;
  }
  function viewTopic() {
    const t = TOPICS[ui.topicId];
    if (!t) { ui.view = "subject"; return viewSubject(); }
    const ts = topicStats(t), p = prog(t.sid);
    const mis = mistakeQs(t.sid, t.id).length;
    const gen = ui.gen && ui.gen.topicId === t.id ? ui.gen : null;
    const aiBtn = ai.state !== "ready" || t.noGen ? "" : gen && gen.status === "busy"
      ? `<button type="button" class="btn soft" data-a="gen-stop">${icon("stop")}Остановить</button>`
      : `<button type="button" class="btn soft" data-a="gen-ai" data-id="${t.id}">${icon("spark")}Ещё 5 вопросов от ИИ</button>`;
    return `<div><button type="button" class="link-btn" data-a="go" data-v="subject" data-sid="${t.sid}">← ${esc(SUBJ[t.sid].name)}</button></div>
      <div class="head"><div class="eyebrow">${esc(codeLabel(t))} · ${esc(t.sec.title)}</div><h1 class="h1">${esc(t.title)}</h1></div>
      <section class="card stack">
        <div class="row between"><span class="tile-label">Прогресс темы</span><span class="chip ${ts.pct >= 90 ? "good" : "leaf"} num">${ts.pct}%</span></div>
        <div class="meter"><i style="width:${ts.pct}%"></i></div>
        <div class="row small ink2"><span>Освоено ${ts.mastered} из ${ts.total}</span><span>·</span><span>${ts.read ? "теория прочитана" : "теория не отмечена"}</span>${mis ? `<span>·</span><span>ошибок: ${mis}</span>` : ""}</div>
        <div class="row">
          ${ts.total > TOPIC_QUIZ + 5
            ? `<button type="button" class="btn" data-a="quiz-topic" data-id="${t.id}">Тест · ${TOPIC_QUIZ} вопросов</button><button type="button" class="btn ghost" data-a="quiz-topic" data-all="1" data-id="${t.id}">Все вопросы · ${ts.total}</button>`
            : `<button type="button" class="btn" data-a="quiz-topic" data-all="1" data-id="${t.id}">Пройти тест · ${ts.total}</button>`}
          ${mis ? `<button type="button" class="btn ghost" data-a="quiz-topic-mistakes" data-id="${t.id}">Только ошибки · ${mis}</button>` : ""}
          ${aiBtn}
        </div>
        ${gen && gen.status === "busy" ? '<div class="hint">ИИ составляет новые задания по теме, это занимает до минуты.</div>' : ""}
        ${gen && gen.status === "error" ? `<div class="notice">${esc(gen.error)}</div>` : ""}
      </section>
      <section class="card pad-lg stack">
        <h2 class="h2">Конспект</h2>
        ${t.tablesFirst ? tablesHTML(t) : ""}
        <ul class="theory">${t.theory.map((x) => x.startsWith("## ") ? `<li class="th-h">${rich(x.slice(3))}</li>` : `<li>${rich(x)}</li>`).join("")}</ul>
        ${t.tablesFirst ? "" : tablesHTML(t)}
        <div class="row">
          <button type="button" class="btn ${ts.read ? "ghost" : "soft"} sm" data-a="theory" data-id="${t.id}">${ts.read ? "Снять отметку «прочитано»" : icon("check") + "Отметить как прочитанное"}</button>
          ${ai.state === "ready" ? `<button type="button" class="btn ghost sm" data-a="ask-tutor" data-id="${t.id}">${icon("chat")}Спросить репетитора</button>` : ""}
        </div>
      </section>
      <section class="section">
        <div class="section-head"><h2 class="h2">Вопросы темы</h2><span class="small muted">нажми на вопрос, чтобы ответить только на него</span></div>
        ${(() => {
          const unseenCount = t.qids.filter((id) => !p.q[id] || !p.q[id].n).length;
          const qFilter = t.qids.length > 6 ? `<div class="switch" role="group" aria-label="Фильтр вопросов">
            <button type="button" data-a="topic-filter" data-filter="all" aria-pressed="${ui.topicFilter === "all"}">Все (${t.qids.length})</button>
            <button type="button" data-a="topic-filter" data-filter="mistakes" aria-pressed="${ui.topicFilter === "mistakes"}">С ошибками (${mis})</button>
            <button type="button" data-a="topic-filter" data-filter="unseen" aria-pressed="${ui.topicFilter === "unseen"}">Новые (${unseenCount})</button>
          </div>` : "";
          const listIds = t.qids.filter((id) => {
            if (ui.topicFilter === "mistakes") { const st = p.q[id]; return st && st.n && st.last !== 2; }
            if (ui.topicFilter === "unseen") return !p.q[id] || !p.q[id].n;
            return true;
          });
          return qFilter + (listIds.length ? `<div class="stack">${listIds.map((id) => qRow(QS[id], p.q[id])).join("")}</div>` : `<div class="empty">В этом фильтре вопросов нет.</div>`);
        })()}
        <div class="qlegend"><span><i class="qdot" data-s="2"></i>верно</span><span><i class="qdot" data-s="1"></i>одна ошибка</span><span><i class="qdot" data-s="0"></i>неверно</span><span><i class="qdot" data-s="-1"></i>ещё не было</span></div>
      </section>`;
  }
  // Справочные таблицы темы (t.tables): первая строка — заголовок, head1 — первый столбец тоже заголовок.
  function tablesHTML(t) {
    return (t.tables || []).map((tb) => `<div class="small muted">${rich(tb.title)}</div><div class="qtbl-wrap"><table class="qtbl">${tb.rows.map((r, i) => `<tr>${r.map((c, j) => (i === 0 || (tb.head1 && j === 0) ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></div>${tb.note ? `<div class="small muted">${rich(tb.note)}</div>` : ""}`).join("");
  }
  function qRow(q, st) {
    const s = st && st.n ? st.last : -1;
    const txt = q.q.length > 130 ? q.q.slice(0, 128) + "…" : q.q;
    return `<button type="button" class="step-btn" data-a="quiz-one" data-id="${esc(q.id)}" style="grid-template-columns:20px minmax(0,1fr) auto"><i class="qdot big" data-s="${s}"></i><span style="min-width:0"><span style="display:block">${esc(txt)}</span><span class="step-sub" style="display:block">${esc(typeLabel(q))}${st && st.n ? ` · ответов ${st.n}, верных ${st.k}` : ""}</span></span><span class="arrow">${icon("arrow")}</span></button>`;
  }

  // ---------- тесты ----------
  function typeLabel(q) {
    if (q.t === "multi") return q.open ? "Несколько верных ответов" : "Выбери " + q.a.length + " " + plural(q.a.length, "ответ", "ответа", "ответов");
    if (q.t === "input" && q.d) return "Ответ — цифры";
    if (q.t === "input" && q.num) return "Ответ — число";
    return { single: "Один верный ответ", match: "Соответствие", order: "Последовательность", input: "Краткий ответ", self: "Развёрнутый ответ · самопроверка" }[q.t] || "";
  }
  function makeItem(q) {
    const it = { q, key: !q.ai, resp: null, res: null, view: null, hinted: false, hintOpen: false };
    if (q.t === "single" || q.t === "multi") it.view = shuffle(range(q.o.length));
    if (q.t === "match") it.view = q.fixed ? range(q.l.length) : shuffle(range(q.l.length)); // fixed — буквы А–Г как в рецензии
    if (q.t === "order") {
      let v = shuffle(range(q.o.length));
      for (let k = 0; k < 6 && v.every((x, i) => x === i); k++) v = shuffle(range(q.o.length));
      it.view = v;
    }
    it.resp = q.t === "single" ? -1 : q.t === "multi" || q.t === "order" ? [] : q.t === "match" ? q.l.map(() => -1) : "";
    if (q.t === "self") it.resp = { text: "", sel: [] }; // развёрнутый ответ: текст и отмеченные элементы эталона
    return it;
  }
  function startQuiz(opts) {
    const qs = (opts.qs || []).filter(Boolean);
    if (!qs.length) { toast("Здесь пока нет вопросов."); return; }
    abortAI();
    ui.quiz = {
      title: opts.title, sid: opts.sid, mode: opts.mode, topicId: opts.topicId || null,
      items: qs.map((q, i) => Object.assign(makeItem(q), opts.ns ? { n: opts.ns[i] } : {})), i: 0, checked: false, done: false,
      sessionId: newId(), startDay: todayISO(), started: Date.now(), qStart: Date.now(), pausedAt: null,
      spent: 0, answered: 0, correct: 0, hints: 0, back: opts.back || { v: "subject", sid: opts.sid }, ai: null, cfg: opts.cfg || null,
      planId: opts.planId || null, retry: !!opts.retry
    };
    saveActiveQuiz();
    ui.focusNext = qs[0].t === "input" ? "ans" : null;
    go("quiz");
  }
  function weight(st, today) {
    if (!st || !st.n) return 3 + Math.random();
    if (st.last !== 2) return 4 + Math.random();
    if ((st.due || "") <= today) return 2 + Math.random();
    return Math.random();
  }
  // По одному вопросу из каждой темы по кругу — так тест покрывает весь курс.
  function pickMixed(sid, n) {
    const s = SUBJ[sid], p = prog(sid), today = todayISO();
    const w = {};
    const lists = shuffle(s.topicList).map((t) => {
      t.qids.forEach((id) => { w[id] = weight(p.q[id], today); });
      return t.qids.slice().sort((a, b) => w[b] - w[a]);
    });
    lists.sort((a, b) => (w[b[0]] || 0) - (w[a[0]] || 0));
    const out = [];
    for (let round = 0; out.length < n; round++) {
      let added = false;
      for (const l of lists) { if (l[round] && out.length < n) { out.push(l[round]); added = true; } }
      if (!added) break;
    }
    return shuffle(out);
  }
  // Тест по теме: сначала новые и трудные вопросы; вопросы к одному тексту идут подряд.
  function pickTopic(t, n) {
    const p = prog(t.sid), today = todayISO(), groups = {};
    for (const id of shuffle(t.qids)) {
      const k = QS[id].ctx ? "ctx:" + QS[id].ctx : id;
      const g = (groups[k] = groups[k] || { w: 0, ids: [] });
      g.ids.push(id); g.w = Math.max(g.w, weight(p.q[id], today));
    }
    const out = [];
    for (const g of Object.values(groups).sort((a, b) => b.w - a.w)) {
      if (out.length >= n) break;
      out.push(...g.ids);
    }
    return t.texts ? out : shuffle(out);
  }
  // Пробный вариант: по одному заданию на каждый номер ЕГЭ; задания к тексту — из одного текста.
  function pickVariant(sid, cfg, seed) {
    const p = prog(sid), today = todayISO(), out = [];
    for (const sl of (cfg || SUBJ[sid].variant).slots) {
      // slot.kim — задания с меткой kim (номер КИМ) из любых тем; slot.topic — все задания одной темы
      const t = sl.topic ? TOPICS[sl.topic] : { qids: SUBJ[sid].topicList.reduce((a, x) => a.concat(x.qids), []).filter((id) => [].concat(QS[id].kim || []).includes(sl.kim)) };
      if (!t || !t.qids || !t.qids.length) continue;
      const W = {};
      const w = (id) => (id in W ? W[id] : (W[id] = weight(p.q[id], today) + (sl.prefer && sl.prefer(QS[id]) ? 10 : 0)));
      const ns = [].concat(sl.n);
      if (sl.byText) {
        const best = Object.keys(t.texts || {}).map((k) => {
          const ids = t.qids.filter((id) => QS[id].ctx === k);
          const pick = sl.byText.map((re) => ids.filter((id) => re.test(QS[id].q)).sort((a, b) => w(b) - w(a))[0]);
          return { pick, w: pick.every(Boolean) ? pick.reduce((s, id) => s + w(id), 0) : -1 };
        }).filter((x) => x.w >= 0).sort((a, b) => b.w - a.w)[0];
        if (best) best.pick.forEach((id, i) => out.push({ id, n: ns[i] }));
      } else {
        const pool = t.qids.filter((id) => !sl.like || sl.like.test(QS[id].q));
        // с номером варианта (seed) берём задание по порядку в банке, иначе — новые и слабые вперёд
        // slot.prefer (например, задания с рисунком) идут в порядке банка первыми
        const ordered = seed && sl.prefer ? pool.filter((id) => sl.prefer(QS[id])).concat(pool.filter((id) => !sl.prefer(QS[id]))) : pool;
        const pick = seed ? ns.map((_, i) => ordered[(seed - 1 + i) % ordered.length]) : pool.sort((a, b) => w(b) - w(a)).slice(0, ns.length);
        pick.forEach((id, i) => out.push({ id, n: ns[i] }));
      }
    }
    return out;
  }
  // Баллы как в ЕГЭ: двухбалльные задания — 2 или 1 за одну ошибку, остальные — 1 только за полностью верный ответ.
  function variantScore(qz) {
    const two = (qz.cfg || SUBJ[qz.sid].variant || {}).two || [];
    let pts = 0, max = 0;
    const cells = qz.items.map((it) => {
      const self = it.q.t === "self"; // развёрнутый ответ: баллы по отмеченным элементам эталона
      const m = self ? it.q.els.length : two.includes(it.n) ? 2 : 1;
      const p = !it.res ? 0 : self ? it.res.pts : m === 2 ? it.res.r : it.res.r === 2 ? 1 : 0;
      pts += p; max += m;
      return { it, n: it.n, p, m };
    });
    return { pts, max, cells };
  }
  function curItem() { return ui.quiz && !ui.quiz.done ? ui.quiz.items[ui.quiz.i] : null; }
  // Текст, к которому относится задание (задания 1–3 и 22 по русскому языку).
  function passageOf(q) { const t = TOPICS[q.topic]; return (q.ctx && t && t.texts && t.texts[q.ctx]) || ""; }
  // Таблица к заданию (q.tbl — строки, первая — заголовок): задания 1, 20 и 21 по биологии.
  function tableHTML(q) {
    const fig = q.svg ? `<div class="qfig">${q.svg}</div>` : ""; // рисунок к заданию (свой SVG из файлов сайта)
    if (!q.tbl) return fig;
    return fig + `<div class="qtbl-wrap"><table class="qtbl">${q.tbl.map((r, i) => `<tr>${r.map((c) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></div>`;
  }
  function canCheck(it) {
    const q = it.q, r = it.resp;
    if (q.t === "single") return r >= 0;
    if (q.t === "multi") return r.length > 0;
    if (q.t === "match") return r.every((x) => x >= 0);
    if (q.t === "order") return r.length === q.o.length;
    if (q.t === "self") return true;
    return String(r || "").trim() !== "";
  }
  // Оценка как в ЕГЭ: 2 балла без ошибок, 1 — за одну ошибку в сложных заданиях.
  function grade(it) {
    const q = it.q, r = it.resp;
    // развёрнутый ответ: 1 балл за каждый отмеченный элемент эталона
    if (q.t === "self") { const pts = r.sel.length, max = q.els.length; return { r: pts === max ? 2 : pts >= Math.ceil(max / 2) ? 1 : 0, pts, max }; }
    if (q.t === "single") { const ok = r === q.a; return { r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 }; }
    if (q.t === "input") {
      if (q.num) {
        const v = parseNum(r);
        const ok = v !== null && q.a.some((x) => Math.abs(parseNum(x) - v) <= (q.tol || 0.001));
        return { r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
      }
      // d — цифры в любом порядке, x — пробелы и дефисы важны, иначе сравниваем без них.
      const f =q.d ? (s) => String(s || "").replace(/\D/g, "").split("").sort().join("") : q.x ? norm : normTight;
      const v = f(r);
      const ok = !!v && q.a.some((x) => f(x) === v);
      return { r: ok ? 2 : 0, pts: ok ? 1 : 0, max: 1 };
    }
    let err = 0;
    if (q.t === "multi") {
      const sel = new Set(r), cor = new Set(q.a);
      let extra = 0, miss = 0;
      sel.forEach((x) => { if (!cor.has(x)) extra++; });
      cor.forEach((x) => { if (!sel.has(x)) miss++; });
      err = Math.max(extra, miss);
    } else if (q.t === "match") {
      err = q.a.reduce((n, a, i) => n + (r[i] === a ? 0 : 1), 0);
    } else if (q.t === "order") {
      const wrong = range(q.o.length).reduce((n, i) => n + (r[i] === i ? 0 : 1), 0);
      err = wrong === 0 ? 0 : wrong === 2 ? 1 : 2; // одна перестановка двух элементов — одна ошибка
    }
    const res = err === 0 ? 2 : err === 1 ? 1 : 0;
    return { r: res, pts: res, max: 2 };
  }
  function correctText(q) {
    if (q.t === "self") return q.ref;
    if (q.t === "single") return q.o[q.a];
    if (q.t === "multi") return q.a.map((i) => q.o[i]).join("; ");
    if (q.t === "match") return q.l.map((l, i) => l + " — " + q.r[q.a[i]]).join("; ");
    if (q.t === "order") return q.o.join(" → ");
    return q.num ? String(q.a[0]).replace(".", ",") : q.a[0];
  }
  function userText(it) {
    const q = it.q, r = it.resp;
    if (q.t === "self") return r.text.trim() || "ответ не записан";
    if (q.t === "single") return r >= 0 ? q.o[r] : "нет ответа";
    if (q.t === "multi") return r.length ? r.map((i) => q.o[i]).join("; ") : "нет ответа";
    if (q.t === "match") return q.l.map((l, i) => l + " — " + (r[i] >= 0 ? q.r[r[i]] : "?")).join("; ");
    if (q.t === "order") return r.map((i) => q.o[i]).join(" → ") || "нет ответа";
    return r || "нет ответа";
  }
  function optionsText(q) {
    if (q.t === "single" || q.t === "multi") return "Варианты: " + q.o.map((o, i) => i + 1 + ") " + o).join("; ");
    if (q.t === "match") return "Левый столбец: " + q.l.join("; ") + ". Правый столбец: " + q.r.join("; ");
    if (q.t === "order") return "Элементы: " + q.o.join("; ");
    return "";
  }
  function doCheck() {
    const qz = ui.quiz, it = curItem();
    if (!it || qz.checked || !canCheck(it)) return;
    const g = grade(it);
    it.res = g; qz.checked = true;
    qz.spent += Math.min(Date.now() - qz.qStart, MAX_Q_MS);
    qz.answered++;
    if (it.q.t !== "self") { if (g.r === 2) qz.correct++; if (it.key) recordAnswer(it.q, g.r); } // у развёрнутого ответа итог известен после отметок — см. doNext
    logQuizSession(qz);
    saveActiveQuiz();
    if (qz.mode === "variant") { doNext(); return; } // в пробном варианте ответы показываем в конце
    ui.focusNext = "next-btn";
    scheduleRender();
  }
  function recordAnswer(q, r) {
    const prev = prog(q.sid).q[q.id] || {};
    const b = r === 2 ? Math.min((prev.b || 0) + 1, INTERVALS.length - 1) : r === 1 ? Math.max(0, (prev.b || 0) - 1) : 0;
    const st = { n: (prev.n || 0) + 1, k: (prev.k || 0) + (r === 2 ? 1 : 0), b, last: r, at: Date.now(), due: addDays(todayISO(), INTERVALS[b]) };
    patchDoc("prog-" + q.sid, { q: { [q.id]: st } });
  }
  function logQuizSession(qz) {
    patchDoc("log-" + qz.startDay.slice(0, 7), { s: { [qz.sessionId]: {
      d: qz.startDay, sub: qz.sid, m: qz.answered ? Math.max(1, Math.round(qz.spent / 60000)) : 0, q: qz.answered, c: qz.correct,
      h: qz.hints || 0, k: "quiz", t: qz.topicId || qz.mode, at: qz.started
    } } });
  }
  function saveVariantMock(qz, silent) {
    if (!qz || !qz.done || qz.mode !== "variant") return;
    const cfg = qz.cfg || (SUBJ[qz.sid] && SUBJ[qz.sid].variant);
    if (!cfg || !cfg.goal || !cfg.goal.scale) return;
    const sc = variantScore(qz), scale = cfg.goal.scale;
    if (!qz.mockId) qz.mockId = newId();
    qz.items.forEach((it) => { if (it.q.t === "self" && it.res && !it.fin) { it.fin = true; if (it.key) recordAnswer(it.q, it.res.r); } });
    const testScore = scale[Math.min(sc.pts, scale.length - 1)] || 0;
    patchDoc("mocks", { m: { [qz.mockId]: { d: qz.startDay || todayISO(), sub: qz.sid, sc: testScore, p: sc.pts, n: qz.title, at: qz.started || Date.now(), auto: 1 } } });
    qz.saved = true;
    if (!silent) toast("Результат записан в «Показатели»");
  }
  function doNext() {
    const qz = ui.quiz;
    if (!qz || !qz.checked) return;
    const cur = qz.items[qz.i];
    if (cur.q.t === "self" && cur.res && !cur.fin && qz.mode !== "variant") { // развёрнутый ответ засчитываем, когда отметки расставлены (в варианте — после итогов)
      cur.fin = true;
      if (cur.res.r === 2) qz.correct++;
      if (cur.key) recordAnswer(cur.q, cur.res.r);
      logQuizSession(qz);
    }
    abortAI(); qz.ai = null;
    if (qz.i + 1 >= qz.items.length) {
      qz.done = true;
      completePlanFromQuiz(qz);
      if (qz.mode === "variant" && qz.answered > 0) saveVariantMock(qz, true);
      clearActiveQuiz();
    }
    else {
      qz.i++; qz.checked = false; qz.qStart = Date.now();
      saveActiveQuiz();
      ui.focusNext = qz.items[qz.i].q.t === "input" ? "ans" : null;
    }
    scheduleRender(true);
  }
  function exitQuiz() {
    const qz = ui.quiz;
    abortAI();
    const back = qz ? qz.back : { v: "home" };
    ui.quiz = null;
    clearActiveQuiz();
    go(back.v || "home", { id: back.id, sid: back.sid });
  }
  function renderQuestion(it, checked) {
    const q = it.q;
    if (q.t === "single" || q.t === "multi") {
      return `<div class="opts" role="group" aria-label="Варианты ответа">${it.view.map((oi, pos) => {
        const sel = q.t === "single" ? it.resp === oi : it.resp.includes(oi);
        let cls = "", mark = "";
        if (checked) {
          const cor = q.t === "single" ? q.a === oi : q.a.includes(oi);
          if (cor && sel) { cls = "ok"; mark = "верно"; }
          else if (sel) { cls = "bad"; mark = "ошибка"; }
          else if (cor) { cls = "miss"; mark = q.t === "single" ? "верный ответ" : "пропущено"; }
        }
        return `<button type="button" class="opt ${cls}" data-a="pick" data-i="${oi}" aria-pressed="${sel}"${checked ? " disabled" : ""}><span class="opt-key">${pos + 1}</span><span>${esc(q.o[oi])}</span><span class="opt-mark">${mark}</span></button>`;
      }).join("")}</div>`;
    }
    if (q.t === "match") {
      const legend = `<div class="legend-r${q.r.some((r) => r.length > 40) ? " long" : ""}">${q.r.map((r, i) => `<span><b>${i + 1}</b>${esc(r)}</span>`).join("")}</div>`;
      const rows = it.view.map((li, pos) => {
        const v = it.resp[li];
        let cls = "", fix = "";
        if (checked) {
          const ok = v === q.a[li];
          cls = ok ? "ok" : "bad";
          if (!ok) fix = `<div class="mrow-fix">Верно: ${q.a[li] + 1} — ${esc(q.r[q.a[li]])}</div>`;
        }
        const btns = q.r.map((r, ri) => `<button type="button" data-a="match" data-l="${li}" data-r="${ri}" aria-pressed="${v === ri}" aria-label="${esc(r)}" title="${esc(r)}"${checked ? " disabled" : ""}>${ri + 1}</button>`).join("");
        return `<div class="mrow ${cls}"><div><span class="mono muted">${LETTERS[pos]}</span> ${esc(q.l[li])}</div><div class="seg" role="group">${btns}</div>${fix}</div>`;
      }).join("");
      return legend + `<div class="mrows">${rows}</div>`;
    }
    if (q.t === "order") {
      const items = it.view.map((oi) => {
        const pos = it.resp.indexOf(oi);
        let cls = "", extra = "";
        if (checked) { cls = pos === oi ? "ok" : "bad"; if (pos !== oi) extra = ` <span class="small muted">— должно быть на месте ${oi + 1}</span>`; }
        return `<button type="button" class="ord ${cls}" data-a="ord" data-i="${oi}"${pos >= 0 ? ` data-n="${pos + 1}"` : ""}${checked ? " disabled" : ""}><span class="opt-key">${pos >= 0 ? pos + 1 : ""}</span><span>${esc(q.o[oi])}${extra}</span></button>`;
      }).join("");
      return `${checked ? "" : '<div class="hint">Нажимай на элементы по порядку. Повторное нажатие убирает элемент из последовательности.</div>'}<div class="order-pool">${items}</div>${!checked && it.resp.length ? '<div><button type="button" class="link-btn" data-a="ord-reset">Сбросить порядок</button></div>' : ""}`;
    }
    if (q.t === "self") {
      if (!checked) return `<div class="field"><label for="self-text">Твой ответ</label><textarea id="self-text" class="essay-area" rows="8" spellcheck="false" placeholder="Напиши ответ так, как на экзамене. Потом откроешь эталон и отметишь, что совпало.">${esc(it.resp.text)}</textarea></div>`;
      return `<div class="field"><label>Твой ответ</label><div class="passage"><p>${esc(it.resp.text.trim() || "(ответ не записан)")}</p></div></div>
        <div class="stack"><div class="eyebrow">Эталон</div><div class="passage"><p>${esc(q.ref)}</p></div>
        <div class="eyebrow">Отметь элементы, которые есть в твоём ответе: 1 балл за каждый</div>
        <div class="checklist">${q.els.map((x, i) => `<label><input type="checkbox" class="check" data-c="self-el" data-i="${i}"${it.resp.sel.includes(i) ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div></div>`;
    }
    return `<div class="field"><label for="ans">Твой ответ</label><input id="ans" class="answer-input" autocomplete="off" spellcheck="false" value="${esc(it.resp)}"${checked ? " disabled" : ""} placeholder="Введи ответ и нажми Enter"></div>`;
  }
  function feedbackBlock(it, qz) {
    const g = it.res, q = it.q;
    const self = q.t === "self";
    const title = self ? "Баллов за это задание: " + g.pts + " из " + g.max : g.r === 2 ? "Верно" : g.r === 1 ? "Почти: одна ошибка" : "Неверно";
    let aiPart = "";
    if (ai.state === "ready" && !self) {
      const st = qz.ai && qz.ai.forIdx === qz.i ? qz.ai : null;
      if (!st) aiPart = `<div><button type="button" class="btn soft sm" data-a="explain">${icon("spark")}Объясни подробнее</button></div>`;
      else {
        const busy = st.status === "thinking" || st.status === "streaming";
        aiPart = `<div class="ai-box"><div class="row between"><span class="eyebrow">Объяснение ИИ</span>${busy ? '<button type="button" class="link-btn" data-a="explain-stop">Остановить</button>' : ""}</div><div class="ai-text" id="ai-explain">${st.text ? fmtAI(st.text) : '<span class="muted">Думаю…</span>'}</div>${st.status === "error" ? `<div class="small" style="color:var(--bad)">${esc(st.error)}</div>` : ""}</div>`;
      }
    }
    const showCorrect = g.r !== 2 && (q.t === "single" || q.t === "multi" || q.t === "input");
    return `<div class="feedback" data-r="${g.r}">
      <div class="fb-title">${icon(g.r === 2 ? "check" : g.r === 1 ? "alert" : "x")}${title}${g.max === 2 && !self ? ` · ${g.pts} из 2 баллов` : ""}</div>
      ${showCorrect ? `<div class="small"><b>Правильный ответ:</b> ${esc(correctText(q))}</div>` : ""}
      ${q.e ? `<div class="small ink2">${esc(q.e)}</div>` : ""}
      ${aiPart}
    </div>`;
  }
  const HINT_STOP = new Set(["что", "как", "какой", "какая", "какие", "какое", "каких", "каком", "какую", "выбери", "выберите", "установи", "установите", "соответствие", "между", "расположи", "расположите", "порядке", "ответ", "запиши", "запишите", "слово", "одно", "цифр", "число", "три", "два", "всех", "этом", "или", "для", "при", "над", "под", "без", "про", "из", "по", "от", "до", "на", "во", "со", "не", "ни", "если", "признак", "признака", "признаки", "пример", "примером", "правило", "задания"]);
  function questionGuideHint(q) {
    const t = TOPICS[q.topic] || null;
    const rawText = norm(q.q + " " + (q.t === "match" && Array.isArray(q.l) ? q.l.join(" ") : ""));
    const stems = rawText.split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 4 && !HINT_STOP.has(w)).map((w) => w.slice(0, Math.min(w.length, 5))).slice(0, 8);
    const ansNorm = norm(correctText(q));
    const ansWords = new Set(ansNorm.split(/[^a-zа-я0-9]+/i).filter((w) => w.length >= 4));
    let subheading = "", bestScore = 0;
    const anchors = [];
    if (t && Array.isArray(t.theory)) {
      let curSub = "";
      for (const line of t.theory) {
        if (line.startsWith("## ")) { curSub = line.slice(3).trim(); continue; }
        const ln = norm(line);
        let sc = 0;
        for (const st of stems) if (ln.includes(st)) sc++;
        const m = line.match(/^\*\*(.+?)\*\*/);
        const label = m ? m[1].replace(/[:.;—–-]+$/, "").trim() : "";
        const labelNorm = norm(label);
        const safeLabel = label && labelNorm.length >= 3 && labelNorm !== "пример" && labelNorm !== "правило" && !ansWords.has(labelNorm) && !ansNorm.includes(labelNorm);
        if (sc > bestScore) { bestScore = sc; subheading = curSub; }
        if (sc > 0 && safeLabel && !anchors.includes(label) && anchors.length < 3) anchors.push(label);
      }
      if (!subheading && bestScore === 0) {
        const firstH = t.theory.find((x) => x.startsWith("## "));
        if (firstH) subheading = firstH.slice(3).trim();
      }
    }
    let tableTitle = "", bestTblScore = 0;
    if (t && Array.isArray(t.tables) && t.tables.length) {
      for (const tb of t.tables) {
        const tn = norm((tb.title || "") + " " + (tb.rows || []).map((r) => r.join(" ")).join(" "));
        let sc = 0;
        for (const st of stems) if (tn.includes(st)) sc++;
        if (sc > bestTblScore) { bestTblScore = sc; tableTitle = tb.title || ""; }
      }
      if (!tableTitle) tableTitle = t.tables[0].title || "";
    }
    const rawQuery = anchors[0] || subheading || (t ? t.title.split(/[:.,]/)[0].trim() : "");
    const guideQuery = rawQuery.split(/\s+/).slice(0, 2).join(" ");
    return {
      subjName: SUBJECT_NAME[q.sid] || "",
      secTitle: t && t.sec ? t.sec.title : "",
      topic: t,
      subheading,
      tableTitle,
      anchors,
      guideQuery
    };
  }
  function quizHintHTML(it) {
    const h = questionGuideHint(it.q);
    return `<div class="hint-box" role="region" aria-label="Подсказка по справочнику">
      <div class="hint-box-head">
        <span class="row" style="gap:6px">${icon("hint")}Где искать информацию в справочнике</span>
        <button type="button" class="link-btn small" data-a="quiz-hint">Скрыть</button>
      </div>
      <div class="small ink2">${esc(h.subjName)}${h.secTitle ? " · " + esc(h.secTitle) : ""}${h.topic ? ` · <b>${esc(codeLabel(h.topic) + " · " + h.topic.title)}</b>` : ""}</div>
      ${h.subheading ? `<div class="small">Раздел конспекта: <b>«${esc(h.subheading)}»</b></div>` : ""}
      ${h.tableTitle ? `<div class="small">Таблица в теме: <b>«${esc(h.tableTitle)}»</b></div>` : ""}
      ${h.anchors.length ? `<div class="small">Ориентиры в тексте: ${h.anchors.map((a) => `<b>«${esc(a)}»</b>`).join(", ")}</div>` : ""}
      <div class="row" style="gap:8px">
        <button type="button" class="btn soft sm" data-a="quiz-guide">${icon("book")}Открыть в справочнике</button>
        ${h.topic ? `<button type="button" class="btn ghost sm" data-a="open-topic" data-id="${h.topic.id}">Открыть конспект темы</button>` : ""}
      </div>
    </div>`;
  }
  function viewQuiz() {
    const qz = ui.quiz;
    if (!qz) { ui.view = "home"; return viewHome(); }
    if (qz.done) return qz.mode === "variant" ? variantSummary(qz) : quizSummary(qz);
    const it = qz.items[qz.i], q = it.q, t = TOPICS[q.topic];
    const exam = qz.mode === "variant";
    const pct = Math.round(((qz.i + (qz.checked ? 1 : 0)) / qz.items.length) * 100);
    const keys = q.t === "single" || q.t === "multi" ? "1–" + q.o.length + " — выбор, " : "";
    const mins = Math.floor((Date.now() - qz.started) / 60000);
    const strip = qz.items.length <= 40
      ? `<div class="quiz-strip" aria-hidden="true">${qz.items.map((x, idx) => {
          const cls = idx === qz.i ? "cur" : x.res ? (exam ? "done" : x.res.r === 2 ? "ok" : x.res.r === 1 ? "part" : "bad") : "";
          return `<i class="quiz-seg ${cls}"></i>`;
        }).join("")}</div>`
      : `<div class="meter accent thin"><i style="width:${pct}%"></i></div>`;
    const hintStat = qz.hints ? ` · подсказок: ${qz.hints}` : "";
    const qNum = exam ? String(it.n) : (q.kim ? String(q.kim) : (t && /^\d+$/.test(t.code || "") ? t.code : String(qz.i + 1)));
    return `<div class="quiz-top">
        <div class="row between">
          <div class="eyebrow">${esc(qz.title)}</div>
          <div class="row" style="gap:6px">
            <button type="button" class="btn ghost sm" data-a="quiz-guide">${icon("book")}Справочник</button>
            <button type="button" class="btn ghost sm" data-a="quiz-exit">${exam ? "Прервать" : "Завершить"}</button>
          </div>
        </div>
        <div class="row between small"><span class="ink2">${exam ? "Задание " + it.n + " · " + (qz.i + 1) + " из " + qz.items.length : "Вопрос " + (qz.i + 1) + " из " + qz.items.length}</span><span class="muted num">${(exam ? "идёт " + (mins < 1 ? "меньше минуты" : minutesText(mins)) : "верно " + qz.correct + " из " + qz.answered) + hintStat}</span></div>
        ${strip}
      </div>
      <article class="qcard">
        <div class="row between"><span class="eyebrow">${esc(typeLabel(q))}</span>${exam ? `<span class="small muted">Задание ${it.n}${q.t === "self" ? " · до " + q.els.length + " баллов" : ((qz.cfg || SUBJ[qz.sid].variant).two || []).includes(it.n) ? " · до 2 баллов" : ""}</span>` : t ? `<span class="small muted">${esc(codeLabel(t))} · ${esc(t.title)}</span>` : ""}</div>
        ${q.ai ? '<div class="hint">Вопрос составил ИИ. Если ответ вызывает сомнения, сверься с конспектом темы.</div>' : ""}
        ${passageOf(q) ? `<div class="passage"><div class="eyebrow">Текст</div><p>${esc(passageOf(q))}</p></div>` : ""}
        <div class="qtext">${esc(q.q)}</div>
        ${tableHTML(q)}
        ${renderQuestion(it, qz.checked)}
        ${it.hintOpen ? quizHintHTML(it) : ""}
        ${qz.checked ? feedbackBlock(it, qz) : ""}
        <div class="qfoot">
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn ghost sm" data-a="quiz-hint" aria-expanded="${!!it.hintOpen}">${icon("hint")}${it.hintOpen ? "Скрыть подсказку" : "Подсказка"}</button>
            <button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(q.id)}" data-qnum="${esc(qNum)}" aria-label="Сообщить о баге в задании" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button>
            <span class="kbd">${keys}Enter — ${qz.checked ? "дальше" : exam ? "ответить" : "проверить"}</span>
          </div>
          ${qz.checked
            ? `<button type="button" class="btn" id="next-btn" data-a="quiz-next">${qz.i + 1 >= qz.items.length ? "Итоги" : "Дальше"}${icon("arrow")}</button>`
            : `<span class="row">${exam ? '<button type="button" class="btn ghost" data-a="quiz-skip">Пропустить</button>' : ""}<button type="button" class="btn" data-a="quiz-check"${canCheck(it) ? "" : " disabled"}>${exam ? "Ответить" : "Проверить"}</button></span>`}
        </div>
      </article>`;
  }
  function quizSummary(qz) {
    const answered = qz.items.filter((it) => it.res);
    const right = answered.filter((it) => it.res.r === 2).length;
    const wrong = answered.filter((it) => it.res.r !== 2);
    const pts = answered.reduce((s, it) => s + it.res.pts, 0);
    const max = answered.reduce((s, it) => s + it.res.max, 0);
    const pct = answered.length ? Math.round((100 * right) / answered.length) : 0;
    const head = pct >= 85 ? "Отличный результат" : pct >= 60 ? "Хороший результат" : "Есть над чем поработать";
    const timeNote = qz.hints ? `подсказок: ${qz.hints}` : "записано в показатели";
    return `<div class="head"><div class="eyebrow">Итоги · ${esc(qz.title)}</div><h1 class="h1">${head}</h1></div>
      <div class="tiles">
        ${tile("Верно", right + " из " + answered.length, "")}
        ${tile("Баллы как в ЕГЭ", pts + " из " + max, "за одну ошибку в сложном задании — 1 балл")}
        ${tile("Точность", pct + "%", "")}
        ${tile("Время", qz.spent < 30000 ? "меньше минуты" : minutesText(Math.round(qz.spent / 60000)), timeNote)}
      </div>
      ${wrong.length ? `<section class="section"><h2 class="h2">Разбор ошибок</h2><div class="review-list">${wrong.map((it) => { const tp = TOPICS[it.q.topic]; const qn = it.q.kim ? String(it.q.kim) : (tp && /^\d+$/.test(tp.code || "") ? tp.code : String(qz.items.indexOf(it) + 1)); return `<div class="review-item">
          <div class="row between"><span class="small muted">${esc(typeLabel(it.q))}</span><button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(it.q.id)}" data-qnum="${esc(qn)}" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button></div>
          <div class="entry-title">${esc(it.q.q)}</div>
          ${tableHTML(it.q)}
          <div class="small"><b>Правильно:</b> ${esc(correctText(it.q))}</div>
          <div class="small muted">Твой ответ: ${esc(userText(it))}</div>
          ${it.q.e ? `<div class="small ink2">${esc(it.q.e)}</div>` : ""}
        </div>`; }).join("")}</div></section>` : ""}
      <div class="row">
        ${wrong.length ? `<button type="button" class="btn" data-a="quiz-retry">Повторить ошибки · ${wrong.length}</button>` : ""}
        <button type="button" class="btn ghost" data-a="quiz-exit">${qz.back.v === "plan" ? "Вернуться к плану" : qz.back.v === "stats" ? "Вернуться к показателям" : qz.back.v === "topic" ? "Вернуться к теме" : "Вернуться к предмету"}</button>
        <button type="button" class="btn ghost" data-a="go" data-v="home">На главную</button>
      </div>`;
  }

  function variantSummary(qz) {
    const sc = variantScore(qz), lost = sc.max - sc.pts;
    const full = sc.cells.filter((c) => c.p === c.m).length;
    const bad = sc.cells.filter((c) => c.p < c.m && c.it.q.t !== "self"), shown = new Set();
    const selfs = sc.cells.filter((c) => c.it.q.t === "self");
    // Цель 90+ задаёт предмет (variant.goal): русский — 47 из 50, биология — 51 из 57 по шкале 2026 года.
    const vcfg = qz.cfg || SUBJ[qz.sid].variant;
    const g = vcfg.goal, need = g.need - sc.pts, half = Math.round(g.rest / 2), goalLabel = g.label || "90+";
    const guess = g.scale && g.scale[sc.pts + half] ? ` Для ориентира: с такой первой частью и второй на ${half} из ${g.rest} получится примерно ${g.scale[sc.pts + half]} тестовых баллов.` : "";
    const verdict = g.verdict ? g.verdict(sc.pts) : need <= g.rest
      ? `Для ${goalLabel} нужно набрать ${g.need} ${plural(g.need, "первичный балл", "первичных балла", "первичных баллов")} из ${g.total} (по шкале 2026 года это ${g.test} тестовых). ${g.ok(need)}${guess}${g.extra ? " " + g.extra(sc.pts) : ""}`
      : `Для ${goalLabel} нужно набрать ${g.need} ${plural(g.need, "первичный балл", "первичных балла", "первичных баллов")} из ${g.total}. ${g.fail(sc.pts + g.rest)}`;
    const cell = (c) => `<span class="vcell" data-s="${!c.it.res ? "skip" : c.p === c.m ? "ok" : c.p ? "part" : "bad"}" title="Задание ${c.n}: ${c.p} из ${c.m}">${c.n}</span>`;
    return `<div class="head"><div class="eyebrow">Итоги · ${esc(qz.title)}</div><h1 class="h1">${sc.pts} из ${sc.max} первичных баллов</h1><p class="lead">${verdict}</p></div>
      <div class="tiles">
        ${tile(g.partName || "Тестовая часть", sc.pts + " из " + sc.max, lost ? "потеряно " + lost + " " + plural(lost, "балл", "балла", "баллов") : "без потерь")}
        ${tile("Заданий без ошибок", full + " из " + sc.cells.length, "")}
        ${tile("Время", qz.spent < 30000 ? "меньше минуты" : minutesText(Math.round(qz.spent / 60000)), "на экзамене на всё — " + g.time)}
        ${tile("Цель для " + goalLabel, g.need + " из " + g.total, g.split)}
      </div>
      <section class="card stack"><h2 class="h2">Задания</h2><div class="vgrid">${sc.cells.map(cell).join("")}</div>
        <div class="qlegend"><span><i class="qdot" data-s="2"></i>верно</span><span><i class="qdot" data-s="1"></i>1 балл из 2</span><span><i class="qdot" data-s="0"></i>неверно</span><span><i class="qdot" data-s="-1"></i>пропущено</span></div></section>
      ${bad.length ? `<section class="section"><h2 class="h2">Разбор ошибок</h2><div class="review-list">${bad.map((c) => `<div class="review-item">
          <div class="row between"><span class="small muted">Задание ${c.n} · ${c.p} из ${c.m}</span><button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(c.it.q.id)}" data-qnum="${esc(c.n)}" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button></div>
          ${passageOf(c.it.q) && !shown.has(passageOf(c.it.q)) && shown.add(passageOf(c.it.q)) ? `<div class="passage"><div class="eyebrow">Текст</div><p>${esc(passageOf(c.it.q))}</p></div>` : ""}
          <div class="entry-title">${esc(c.it.q.q)}</div>
          ${tableHTML(c.it.q)}
          <div class="small"><b>Правильно:</b> ${esc(correctText(c.it.q))}</div>
          <div class="small muted">Твой ответ: ${c.it.res ? esc(userText(c.it)) : "пропущено"}</div>
          ${c.it.q.e ? `<div class="small ink2">${esc(c.it.q.e)}</div>` : ""}
        </div>`).join("")}</div></section>` : ""}
      ${selfs.length ? `<section class="section"><h2 class="h2">Часть 2: проверь себя по эталону</h2><p class="small muted">Сравни свой ответ с эталоном и отметь элементы, которые в нём есть: 1 балл за каждый. Итог вверху пересчитается сам.</p><div class="review-list">${selfs.map((c) => { const k = qz.items.indexOf(c.it); return `<div class="review-item">
          <div class="row between"><span class="small muted">Задание ${c.n} · ${c.p} из ${c.m}</span><button type="button" class="btn ghost sm" data-a="bug-q" data-qid="${esc(c.it.q.id)}" data-qnum="${esc(c.n)}" title="Сообщить о баге на willagegg@gmail.com">${icon("bug")}<span>Баг</span></button></div>
          <div class="entry-title">${esc(c.it.q.q)}</div>
          ${tableHTML(c.it.q)}
          <div class="small"><b>Твой ответ:</b> ${esc(userText(c.it))}</div>
          <div class="eyebrow">Эталон</div><div class="passage"><p>${esc(c.it.q.ref)}</p></div>
          <div class="checklist">${c.it.q.els.map((x, i) => `<label><input type="checkbox" class="check" data-c="self-sum" data-k="${k}" data-i="${i}"${c.it.resp.sel.includes(i) ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
        </div>`; }).join("")}</div></section>` : ""}
      <div class="row" style="flex-wrap:wrap">
        ${vcfg.goal.scale && (qz.saved || selfs.length)
          ? (qz.saved
              ? `<button type="button" class="btn soft" data-a="go" data-v="stats">${icon("chart")}Сохранено в «Показателях»</button>`
              : `<button type="button" class="btn" data-a="variant-save">Записать результат в «Показатели»</button>`)
          : ""}
        ${bad.length ? `<button type="button" class="btn ghost" data-a="quiz-retry">Прорешать ошибки · ${bad.length}</button>` : ""}
        <button type="button" class="btn ghost" data-a="${vcfg.full ? "quiz-fullvariant" : "quiz-variant"}" data-sid="${qz.sid}" data-k="0">Новый вариант</button>
        <button type="button" class="btn ghost" data-a="quiz-exit">Вернуться к предмету</button>
      </div>`;
  }

  // ---------- ИИ ----------
  function subjectAI(sid) { return (SUBJ[sid] && SUBJ[sid].ai) || { role: "репетитор", focus: "", suggest: [] }; }
  function tutorRules(sid) {
    const a = subjectAI(sid);
    return `Ты — внимательный ${a.role}. С тобой говорит человек, который готовится к ЕГЭ 2027 года по биологии, русскому языку и химии. ${a.focus} Отвечай по-русски, понятно и точно, по школьной программе и материалам ФИПИ. Пиши коротко: 3–8 предложений или короткий список, если не просят подробнее; если помогает, добавь пример задания ЕГЭ или способ запомнить. Если не уверен в факте, так и скажи. Не используй таблицы и заголовки. Обращайся на «ты» и не угадывай пол собеседника: избегай форм вроде «ты сделал» или «ты сделала».`;
  }
  function aiErrorText(e) {
    const code = e && e.code;
    if (["ai_disabled", "not_granted", "sampling_disabled", "not_declared", "capability_disabled", "capability_removed"].includes(code)) {
      ai.state = "off";
      return store.backend ? "ИИ на сервере сейчас не настроен." : "ИИ недоступен на этой странице.";
    }
    if (code === "rate_limited") return "Слишком много запросов подряд. Попробуй через минуту.";
    if (code === "session_expired" || code === "unauthorized") return store.backend ? "Сессия истекла. Войди в аккаунт снова." : "Сессия claude.ai истекла. Войди в аккаунт снова.";
    if (code === "refused") return "ИИ не стал отвечать на этот запрос. Попробуй сформулировать иначе.";
    if (code === "invalid_json") return "ИИ прислал ответ в неверном формате. Попробуй ещё раз.";
    if (code === "timeout" || code === "upstream_timeout") return "ИИ отвечает слишком долго. Попробуй ещё раз.";
    return "Не получилось получить ответ. Попробуй ещё раз.";
  }
  function fmtAI(text) {
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    const lines = esc(text).split(/\n/);
    let html = "", list = null;
    const flushList = () => { if (list) { html += `<${list.t}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.t}>`; list = null; } };
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) { flushList(); continue; }
      let m = line.match(/^[-•*]\s+(.*)$/);
      if (m) { if (!list || list.t !== "ul") { flushList(); list = { t: "ul", items: [] }; } list.items.push(inline(m[1])); continue; }
      m = line.match(/^\d+[.)]\s+(.*)$/);
      if (m) { if (!list || list.t !== "ol") { flushList(); list = { t: "ol", items: [] }; } list.items.push(inline(m[1])); continue; }
      flushList();
      html += `<p>${inline(line.replace(/^#+\s*/, ""))}</p>`;
    }
    flushList();
    return html;
  }
  function abortAI() {
    const st = ui.quiz && ui.quiz.ai;
    if (st && st.ctl && (st.status === "thinking" || st.status === "streaming")) st.ctl.abort();
  }
  async function explainCurrent() {
    const qz = ui.quiz, it = curItem();
    if (!ai.fn || !it || !it.res) return;
    abortAI();
    const st = (qz.ai = { status: "thinking", text: "", error: "", ctl: new AbortController(), forIdx: qz.i });
    scheduleRender();
    const t = TOPICS[it.q.topic];
    const prompt = [
      "Ты — " + subjectAI(it.q.sid).role + ", готовишь к ЕГЭ (Россия, 2027). Человек ответил на тренировочный вопрос. Объясни по-русски, точно и просто, в 4–8 предложениях, почему верный ответ именно такой" + (it.res.r === 2 ? "." : ", и в чём ошибка в ответе.") + " В конце дай короткую подсказку, как это запомнить. Без заголовков и таблиц. Не угадывай пол собеседника.",
      "",
      "Тема: " + (t ? codeLabel(t) + ", " + t.title : SUBJECT_NAME[it.q.sid] || ""),
      passageOf(it.q) ? "Текст задания: " + passageOf(it.q) : "",
      "Вопрос: " + it.q.q,
      optionsText(it.q),
      "Верный ответ: " + correctText(it.q),
      "Ответ ученика: " + userText(it),
      it.q.e ? "Пояснение из конспекта: " + it.q.e : ""
    ].filter(Boolean).join("\n");
    try {
      const res = await ai.fn(prompt, { signal: st.ctl.signal, onText: (u) => { st.text = u.text; if (st.status === "thinking") { st.status = "streaming"; scheduleRender(); } else paintAI(); } });
      st.text = res.text; st.status = "done";
    } catch (e) {
      if (e && e.code === "cancelled") { st.status = "done"; if (!st.text && qz.ai === st) qz.ai = null; }
      else { st.status = "error"; st.text = (e && e.text) || st.text; st.error = aiErrorText(e); }
    }
    if (ui.quiz === qz) scheduleRender();
  }
  function paintAI() {
    const el = document.getElementById("ai-explain");
    if (el && ui.quiz && ui.quiz.ai) el.innerHTML = fmtAI(ui.quiz.ai.text);
  }
  function validateGen(data, t) {
    const arr = Array.isArray(data) ? data : data && Array.isArray(data.questions) ? data.questions : [];
    const out = [];
    for (const x of arr) {
      if (!x || typeof x.q !== "string" || !Array.isArray(x.o)) continue;
      const o = x.o.map((s) => String(s).trim()).filter(Boolean);
      if (o.length !== x.o.length) continue;
      if (x.t === "single") {
        const a = Number(x.a);
        if (o.length < 3 || o.length > 6 || !Number.isInteger(a) || a < 0 || a >= o.length) continue;
        out.push({ t: "single", q: x.q.trim(), o, a, e: String(x.e || "") });
      } else if (x.t === "multi") {
        const a = Array.isArray(x.a) ? Array.from(new Set(x.a.map(Number))) : [];
        if (o.length < 4 || o.length > 8 || a.length < 2 || a.length >= o.length || a.some((v) => !Number.isInteger(v) || v < 0 || v >= o.length)) continue;
        out.push({ t: "multi", q: x.q.trim(), o, a: a.sort((m, n) => m - n), e: String(x.e || "") });
      }
    }
    // ИИ иногда повторяет вопросы темы или сам себя — такие отбрасываем.
    const norm = (s) => s.toLowerCase().replace(/ё/g, "е").replace(/[^a-zа-я0-9]+/g, " ").trim();
    const known = new Set(t.q.map((q) => norm(q.q) + "|" + norm((q.o || []).join(" "))));
    const fresh = out.filter((q) => { const k = norm(q.q) + "|" + norm(q.o.join(" ")); return !known.has(k) && known.add(k); });
    fresh.forEach((q) => { q.ai = true; q.id = "ai." + newId(); q.topic = t.id; q.sid = t.sid; });
    return fresh;
  }
  async function generateQuestions(topicId) {
    const t = TOPICS[topicId];
    if (!ai.fn || !t) return;
    const gen = (ui.gen = { topicId, status: "busy", error: "", ctl: new AbortController() });
    scheduleRender();
    const prompt = [
      `Составь 5 новых тренировочных заданий ${SUBJ[t.sid].po} в стиле ЕГЭ (Россия, материалы ФИПИ) по теме «${t.title}» (${codeLabel(t).toLowerCase()}). Используй только надёжные факты и правила школьного курса; если в задании есть слово с пропуском или ударением, проверь его по словарю.`,
      "",
      "Ключевые правила и факты темы:",
      t.theory.map((x) => (x.startsWith("## ") ? x.slice(3) + ":" : "- " + x.replace(/\*\*/g, ""))).join("\n"),
      "",
      "Не повторяй эти вопросы:",
      t.q.map((q) => "- " + q.q).join("\n"),
      "",
      "Сделай 3 задания типа \"single\" (4 варианта, один верный) и 2 задания типа \"multi\" (6 вариантов, ровно три верных, формулировка «Выберите три верных ответа...»).",
      "Ответь только JSON-массивом из 5 объектов, без текста вокруг. Формат:",
      '[{"t":"single","q":"Текст вопроса","o":["вариант","вариант","вариант","вариант"],"a":0,"e":"Пояснение в 1–2 предложениях"},{"t":"multi","q":"Выберите три верных утверждения о ...","o":["...","...","...","...","...","..."],"a":[0,2,5],"e":"Пояснение"}]',
      "Индексы в \"a\" считаются с нуля."
    ].join("\n");
    try {
      const data = await ai.fn.json(prompt, { signal: gen.ctl.signal, cache: false });
      const qs = validateGen(data, t);
      if (!qs.length) throw { code: "invalid_json" };
      if (ui.gen !== gen) return;
      ui.gen = null;
      startQuiz({ title: "Вопросы ИИ · " + t.title, sid: t.sid, qs, mode: "ai", topicId: t.id, back: { v: "topic", id: t.id } });
    } catch (e) {
      if (ui.gen !== gen) return;
      if (e && e.code === "cancelled") { ui.gen = null; scheduleRender(); return; }
      ui.gen = { topicId, status: "error", error: aiErrorText(e) };
      scheduleRender();
    }
  }
  async function sendChat(text) {
    const c = ui.chat;
    text = String(text || "").trim();
    if (!text || c.busy || !ai.fn) return;
    c.turns.push({ role: "user", content: text });
    c.draft = ""; c.busy = true; c.error = ""; c.ctl = new AbortController();
    const pending = { role: "assistant", content: "", streaming: true };
    const history = c.turns.slice(-12).map((x) => ({ role: x.role, content: x.content }));
    c.turns.push(pending);
    ui.focusNext = "chat-input";
    scheduleRender();
    try {
      const res = await ai.fn([{ role: "user", content: tutorRules(c.sid) }].concat(history), {
        cache: false, signal: c.ctl.signal,
        onText: (u) => { pending.content = u.text; const el = document.getElementById("chat-stream"); if (el) el.innerHTML = fmtAI(u.text); }
      });
      pending.content = res.text;
    } catch (e) {
      if (e && e.text) pending.content = e.text;
      if (!pending.content) c.turns.splice(c.turns.indexOf(pending), 1);
      if (!(e && e.code === "cancelled")) c.error = aiErrorText(e);
    }
    pending.streaming = false;
    c.busy = false; c.ctl = null;
    scheduleRender();
  }

  // ---------- действия ----------
  function subjectOf(el) { return SUBJ[el.dataset.sid] ? el.dataset.sid : ui.sid; }

  function registerActions(ACTIONS) {
    Object.assign(ACTIONS, {
    "subj-filter": (el) => { ui.subjFilter = el.dataset.filter || "all"; scheduleRender(); },
    "subj-clear": () => { ui.subjQ = ""; ui.subjFilter = "all"; ui.focusNext = "subj-q"; scheduleRender(); },
    "topic-filter": (el) => { ui.topicFilter = el.dataset.filter || "all"; scheduleRender(); },
    "open-topic": (el) => go("topic", { id: el.dataset.id }),
    "quiz-mixed": (el) => { const sid = subjectOf(el); startQuiz({ title: "Смешанный тест · " + SUBJ[sid].name, sid, qs: pickMixed(sid, QUIZ_SIZE).map((id) => QS[id]), mode: "mixed", back: { v: "subject", sid } }); },
    "quiz-review": (el) => {
      const sid = subjectOf(el), ids = shuffle(dueQs(sid)).slice(0, QUIZ_SIZE);
      if (!ids.length) { toast("Повторять пока нечего, загляни завтра."); return; }
      startQuiz({ title: "Повторение · " + SUBJ[sid].name, sid, qs: ids.map((id) => QS[id]), mode: "review", back: { v: "subject", sid } });
    },
    "quiz-mistakes": (el) => {
      const sid = subjectOf(el), ids = shuffle(mistakeQs(sid)).slice(0, QUIZ_SIZE);
      if (!ids.length) { toast("Ошибок нет, так держать."); return; }
      startQuiz({ title: "Работа над ошибками · " + SUBJ[sid].name, sid, qs: ids.map((id) => QS[id]), mode: "mistakes", back: { v: "subject", sid } });
    },
    "quiz-topic": (el) => { const t = TOPICS[el.dataset.id]; startQuiz({ title: topicRef(t), sid: t.sid, qs: pickTopic(t, el.dataset.all ? Infinity : TOPIC_QUIZ).map((id) => QS[id]), mode: "topic", topicId: t.id, back: { v: "topic", id: t.id } }); },
    "quiz-topic-mistakes": (el) => { const t = TOPICS[el.dataset.id]; startQuiz({ title: "Ошибки · " + t.title, sid: t.sid, qs: shuffle(mistakeQs(t.sid, t.id)).map((id) => QS[id]), mode: "topic", topicId: t.id, back: { v: "topic", id: t.id } }); },
    "quiz-one": (el) => { const q = QS[el.dataset.id]; if (!q) return; const t = TOPICS[q.topic]; const back = el.dataset.back === "stats" ? { v: "stats" } : { v: "topic", id: t.id }; startQuiz({ title: topicRef(t), sid: q.sid, qs: [q], mode: "topic", topicId: t.id, back }); },
    "quiz-retry": () => {
      const qz = ui.quiz; if (!qz) return;
      const exam = qz.mode === "variant";
      startQuiz({ title: "Ошибки · " + qz.title, sid: qz.sid, qs: qz.items.filter((it) => (exam && !it.res) || (it.res && it.res.r !== 2)).map((it) => it.q), mode: exam || qz.mode === "mixed" ? "mistakes" : qz.mode, topicId: qz.topicId, back: qz.back, retry: true });
    },
    "quiz-variant": (el) => {
      const sid = subjectOf(el); if (!SUBJ[sid].variant) return;
      const v = pickVariant(sid);
      startQuiz({ title: SUBJ[sid].variant.title || "Пробный вариант · часть 1", sid, qs: v.map((x) => QS[x.id]), ns: v.map((x) => x.n), mode: "variant", back: { v: "subject", sid } });
    },
    "quiz-fullvariant": (el) => {
      const sid = subjectOf(el), cfg = SUBJ[sid].fullVariant; if (!cfg) return;
      const k = Number(el.dataset.k) || 0, v = pickVariant(sid, cfg, k);
      startQuiz({ title: cfg.title + (k ? " · вариант " + k : ""), sid, qs: v.map((x) => QS[x.id]), ns: v.map((x) => x.n), mode: "variant", cfg, back: { v: "subject", sid } });
    },
    "variant-save": () => {
      const qz = ui.quiz; if (!qz || !qz.done || qz.saved) return;
      saveVariantMock(qz, false);
      scheduleRender();
    },
    "quiz-part2": (el) => {
      const sid = subjectOf(el), p = SUBJ[sid].part2; if (!p) return;
      const v = pickVariant(sid, p); if (!v.length) return;
      startQuiz({ title: p.title, sid, qs: v.map((x) => QS[x.id]), mode: "part2", back: { v: "subject", sid } });
    },
    "quiz-skip": () => { const qz = ui.quiz; if (!qz || qz.checked) return; qz.spent += Math.min(Date.now() - qz.qStart, MAX_Q_MS); qz.checked = true; doNext(); },
    pick: (el) => {
      const it = curItem(); if (!it || ui.quiz.checked) return;
      const i = Number(el.dataset.i);
      if (it.q.t === "single") it.resp = i;
      else { const k = it.resp.indexOf(i); if (k >= 0) it.resp.splice(k, 1); else it.resp.push(i); }
      saveActiveQuiz();
      ui.focusNext = null; scheduleRender();
    },
    match: (el) => { const it = curItem(); if (!it || ui.quiz.checked) return; const l = Number(el.dataset.l), r = Number(el.dataset.r); it.resp[l] = it.resp[l] === r ? -1 : r; saveActiveQuiz(); scheduleRender(); },
    ord: (el) => { const it = curItem(); if (!it || ui.quiz.checked) return; const i = Number(el.dataset.i), k = it.resp.indexOf(i); if (k >= 0) it.resp.splice(k, 1); else it.resp.push(i); saveActiveQuiz(); scheduleRender(); },
    "ord-reset": () => { const it = curItem(); if (it) { it.resp = []; saveActiveQuiz(); scheduleRender(); } },
    "quiz-hint": () => {
      const qz = ui.quiz, it = curItem(); if (!qz || !it) return;
      it.hintOpen = !it.hintOpen;
      if (it.hintOpen && !it.hinted) {
        it.hinted = true;
        qz.hints = (qz.hints || 0) + 1;
        if (qz.answered > 0) logQuizSession(qz);
      }
      saveActiveQuiz();
      scheduleRender();
    },
    "quiz-guide": () => {
      const it = curItem();
      if (ui.quiz && !ui.quiz.done && it && it.q) {
        ui.guideSid = it.q.sid || "all";
        ui.guideQ = questionGuideHint(it.q).guideQuery || "";
      }
      go("tutor");
    },
    "quiz-check": () => doCheck(),
    "quiz-next": () => doNext(),
    "quiz-exit": () => exitQuiz(),
    explain: () => explainCurrent(),
    "explain-stop": () => abortAI(),
    theory: (el) => {
      const t = TOPICS[el.dataset.id], read = !!prog(t.sid).th[t.id];
      patchDoc("prog-" + t.sid, { th: { [t.id]: read ? null : Date.now() } });
      if (!read) markPlanPrep(t.sid, "Прочитана теория: " + t.title);
      toast(read ? "Отметка снята" : "Теория отмечена как прочитанная");
    },
    "gen-ai": (el) => generateQuestions(el.dataset.id),
    "gen-stop": () => { if (ui.gen && ui.gen.ctl) ui.gen.ctl.abort(); ui.gen = null; scheduleRender(); },
    "ask-tutor": (el) => { const t = TOPICS[el.dataset.id]; ui.chat.sid = t.sid; ui.chat.draft = `Объясни простыми словами главное по теме «${t.title}» и приведи пример задания ЕГЭ.`; ui.focusNext = "chat-input"; go("tutor"); },
    "chat-subject": (el) => { if (SUBJ[el.dataset.sid]) { ui.chat.sid = el.dataset.sid; scheduleRender(); } },
    "chat-suggest": (el) => sendChat(el.dataset.text),
    "chat-stop": () => { if (ui.chat.ctl) ui.chat.ctl.abort(); },
    "chat-clear": () => { if (ui.chat.ctl) ui.chat.ctl.abort(); ui.chat = { sid: ui.chat.sid, turns: [], busy: false, ctl: null, draft: "", error: "" }; scheduleRender(); },
    });
  }

  EGE.views = EGE.views || {};
  EGE.views.trainer = {
    configure,
    registerActions,
    abortAI,
    aiErrorText,
    canCheck,
    correctText,
    curItem,
    doCheck,
    doNext,
    exitQuiz,
    explainCurrent,
    fmtAI,
    generateQuestions,
    grade,
    logQuizSession,
    onboardingCard,
    pickMixed,
    pickTopic,
    pickVariant,
    questionGuideHint,
    saveVariantMock,
    sendChat,
    startQuiz,
    subjectAI,
    tablesHTML,
    viewHome,
    viewQuiz,
    viewSubject,
    viewTests,
    viewTopic,
    weight
  };
})();
