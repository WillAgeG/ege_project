/* Прогресс и профиль ученика: «План поступления», «Показатели» (графики и журналы) и «Настройки». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const {
    $, addDays, byDue, dateDay, dateLong, dateShort, days, daysUntil, esc, initials, isObj,
    isoDate, minutesText, pad, parseISO, plural, range, readResizedPhotoFile, todayISO, validISO
  } = EGE.utils;
  const { icon } = EGE.ui;

  let CONTENT, DIAG_PLAN_ID, QUIZ_SIZE, SUBJ, SUBJECT_META, SUBJECT_NAME, TOPIC_QUIZ, TOPICS, QS;
  let ai, caps, cloud, mkt, store, ui;
  let accountCard, avatarHTML, defaultName, draft, dueQs, findPlanItem, formatAvg, getThemeMode, go;
  let isUserAuthenticated, localNotice, minutesByDay, mistakeQs, mocks, needsPrepSetup, patchDoc, phoneFieldHTML, planDoc, planItems, profile;
  let prog, questionAttemptBreakdown, replaceDoc, scheduleRender, sessions, staleNotice;
  let subjSelect, subjectAccuracy, subjectReadCount, subjectStats, tile, toast, todoItem;
  let topicRef, topicStats, totals;

  const essays = () => EGE.views.essayGuide.essays();
  const startQuiz = (opts) => EGE.views.trainer.startQuiz(opts);
  const pickMixed = (sid, n) => EGE.views.trainer.pickMixed(sid, n);
  const pickTopic = (t, n) => EGE.views.trainer.pickTopic(t, n);

  function configure(ctx) {
    ({
      CONTENT, DIAG_PLAN_ID, QUIZ_SIZE, SUBJ, SUBJECT_META, SUBJECT_NAME, TOPIC_QUIZ, TOPICS, QS,
      ai, caps, cloud, mkt, store, ui,
      accountCard, avatarHTML, defaultName, draft, dueQs, findPlanItem, formatAvg, getThemeMode, go,
      isUserAuthenticated, localNotice, minutesByDay, mistakeQs, mocks, needsPrepSetup, patchDoc, phoneFieldHTML, planDoc, planItems, profile,
      prog, questionAttemptBreakdown, replaceDoc, scheduleRender, sessions, staleNotice,
      subjSelect, subjectAccuracy, subjectReadCount, subjectStats, tile, toast, todoItem,
      topicRef, topicStats, totals
    } = ctx || {});
  }

  // ---------- план ----------
  function planMatches(it, filter) {
    if (filter === "todo") return !it.done;
    if (filter === "done") return !!it.done;
    if (filter === "overdue") return !it.done && validISO(it.due) && daysUntil(it.due) < 0;
    return true;
  }
  function viewPlan() {
    const all = planItems();
    const done = all.filter((i) => i.done).length;
    const todo = all.length - done;
    const overdue = all.filter((i) => planMatches(i, "overdue")).length;
    const pct = all.length ? Math.round((done / all.length) * 100) : 0;
    const f = ui.planFilter === "overdue" && !overdue ? "all" : ui.planFilter;
    const apply = all.find((i) => i.id === "ege-apply");
    const customAll = all.filter((i) => i.custom).sort(byDue);
    const custom = customAll.filter((i) => planMatches(i, f));
    const phaseBlocks = ((EGE.plan && EGE.plan.phases) || []).map((ph) => {
      const items = all.filter((i) => i.phase === ph.id);
      const shown = items.filter((i) => planMatches(i, f));
      if (f !== "all" && !shown.length) return "";
      const d = items.filter((i) => i.done).length;
      return `<section class="phase"><div class="phase-head"><h2 class="h2">${esc(ph.title)}</h2><span class="mono small muted">${esc(ph.period)}</span><span class="chip ${d === items.length && items.length ? "good" : ""}">${d} из ${items.length}</span></div>${shown.map((it) => todoItem(it)).join("")}</section>`;
    }).join("");
    const anyShown = !!phaseBlocks || custom.length > 0;
    return `<div class="head"><div class="eyebrow">План подготовки</div><h1 class="h1">ЕГЭ 2027 и поступление</h1><p class="lead">Что сделать и к какому сроку — от первых тестов и регистрации на экзамен до подачи документов. Завершённые тесты и шаги отмечаются сами.</p></div>
      ${staleNotice()}
      <section class="card stack">
        <div class="row between"><span class="tile-label">Сделано ${done} из ${all.length}</span><span class="small muted num">осталось ${todo} · ${pct}%</span></div>
        <div class="meter accent"><i style="width:${pct}%"></i></div>
        <div class="switch" role="group" aria-label="Фильтр задач">
          <button type="button" data-a="plan-filter" data-filter="all" aria-pressed="${f === "all"}">Все (${all.length})</button>
          <button type="button" data-a="plan-filter" data-filter="todo" aria-pressed="${f === "todo"}">Осталось (${todo})</button>
          ${overdue ? `<button type="button" data-a="plan-filter" data-filter="overdue" aria-pressed="${f === "overdue"}">Просрочено (${overdue})</button>` : ""}
          <button type="button" data-a="plan-filter" data-filter="done" aria-pressed="${f === "done"}">Выполнено (${done})</button>
        </div>
      </section>
      ${apply && !apply.done && f !== "done" ? `<div class="notice info"><b>Главный срок — ${dateLong(apply.due)}.</b><span>До этого дня нужно подать заявление на ЕГЭ. Позже — только по уважительной причине.</span></div>` : ""}
      ${anyShown ? phaseBlocks : `<div class="empty"><b>Задач в этом фильтре нет</b><button type="button" class="btn ghost sm" data-a="plan-filter" data-filter="all">Показать все</button></div>`}
      ${f === "done" && !custom.length ? "" : `<section class="phase"><div class="phase-head"><h2 class="h2">Мои дела</h2><span class="small muted">свои задачи и напоминания</span></div>
        ${custom.map((it) => todoItem(it)).join("")}
        ${f !== "done" ? `<form class="card form" data-f="todo">
          <div class="h3">Добавить дело</div>
          <div class="field"><label for="td-t">Что сделать</label><input class="input" id="td-t" data-d="td.t" value="${esc(draft("td.t", ""))}" maxlength="140" placeholder="Например: записаться на пробный ЕГЭ" required></div>
          <div class="fields">
            <div class="field"><label for="td-d">Срок</label><input class="input" type="date" id="td-d" data-d="td.d" value="${esc(draft("td.d", ""))}"></div>
            <div class="field"><label for="td-n">Заметка</label><input class="input" id="td-n" data-d="td.n" value="${esc(draft("td.n", ""))}" maxlength="300"></div>
          </div>
          <div><button class="btn" type="submit">Добавить</button></div>
        </form>` : ""}
      </section>`}
      <p class="hint">${esc((EGE.plan && EGE.plan.note) || "")} Сроки проверены ${EGE.plan ? dateLong(EGE.plan.checked) : ""}.</p>`;
  }
  function toggleTodo(id, custom, checked) {
    if (custom) patchDoc("plan", { custom: { [id]: { done: checked ? Date.now() : null } } });
    else patchDoc("plan", { done: { [id]: checked ? Date.now() : null } });
    if (checked) toast("Отмечено");
  }

  // ---------- показатели ----------
  function subjectAutoCard(s, prof, allSess, allMocks, pd) {
    const st = subjectStats(s.id), acc = subjectAccuracy(s.id), thRead = subjectReadCount(s.id);
    const mis = mistakeQs(s.id).length, due = dueQs(s.id).length;
    const subSess = allSess.filter((x) => x.sub === s.id);
    const subMin = subSess.reduce((n, x) => n + (x.m || 0), 0);
    const subQuizzes = subSess.filter((x) => x.k === "quiz");
    const subHintAvg = subQuizzes.length ? subQuizzes.reduce((n, x) => n + (x.h || 0), 0) / subQuizzes.length : null;
    const rep = questionAttemptBreakdown(s.id);
    const diag = pd.results[DIAG_PLAN_ID[s.id]] || null;
    const lastMock = allMocks.filter((m) => m.sub === s.id).slice(-1)[0] || null;
    const rows = [
      ["Освоено вопросов", `${st.mastered} из ${st.total}`],
      ["Повтор вопросов", `1×: ${rep.n1.length} · 2×: ${rep.n2.length} · 3+×: ${rep.n3.length + rep.n4.length}`],
      ["Точность", acc.acc == null ? "—" : `${acc.acc}% (${acc.n} отв.)`],
      ["Подсказок за тест", subHintAvg == null ? "—" : `${formatAvg(subHintAvg)} в среднем`],
      ["Конспекты", `${thRead} из ${st.topics}`],
      ["Время", minutesText(subMin)]
    ];
    if (diag && diag.q) rows.push(["Диагностика", `${diag.c} из ${diag.q} (${diag.pct}%)`]);
    if (lastMock) rows.push(["Последний пробник", `${lastMock.sc} б. (цель ${prof.targets[s.id]})`]);
    return `<section class="card stack">
      <div class="row between"><span class="row" style="gap:8px"><i class="dot" style="background:var(--c-${s.id})"></i><b>${esc(s.name)}</b></span><b class="num">${st.pct}%</b></div>
      <div class="meter"><i style="width:${st.pct}%"></i></div>
      <div class="stat-kv">${rows.map(([k, v]) => `<div class="stat-kv-row"><span class="muted">${k}</span><b class="num">${esc(v)}</b></div>`).join("")}</div>
      <div class="row">
        <button type="button" class="btn soft sm" data-a="quiz-mixed" data-sid="${s.id}">Тест</button>
        ${mis ? `<button type="button" class="btn ghost sm" data-a="quiz-mistakes" data-sid="${s.id}">Ошибки · ${mis}</button>`
          : due ? `<button type="button" class="btn ghost sm" data-a="quiz-review" data-sid="${s.id}">Повтор · ${due}</button>`
          : `<button type="button" class="btn ghost sm" data-a="go" data-v="subject" data-sid="${s.id}">Темы · ${st.topics}</button>`}
      </div>
    </section>`;
  }
  function repeatabilityCard() {
    const sid = ui.statsSubj && (ui.statsSubj === "all" || SUBJ[ui.statsSubj]) ? ui.statsSubj : "all";
    const rep = questionAttemptBreakdown(sid);
    const buckets = [
      { k: 1, label: "1 раз", list: rep.n1 },
      { k: 2, label: "2 раза", list: rep.n2 },
      { k: 3, label: "3 раза", list: rep.n3 },
      { k: 4, label: "4+ раз", list: rep.n4 }
    ];
    const activeK = [1, 2, 3, 4].includes(ui.statsRepBucket) ? ui.statsRepBucket : 1;
    const activeBucket = buckets.find((b) => b.k === activeK) || buckets[0];
    const visible = ui.statsRepAll ? activeBucket.list : activeBucket.list.slice(0, 25);
    const subjSwitch = `<div class="switch" role="group" aria-label="Предмет">
      <button type="button" data-a="stats-subj" data-sid="all" aria-pressed="${sid === "all"}">Все предметы</button>
      ${CONTENT.map((s) => `<button type="button" data-a="stats-subj" data-sid="${s.id}" aria-pressed="${sid === s.id}"><i class="dot" style="background:var(--c-${s.id})"></i><span>${esc(s.name)}</span></button>`).join("")}
    </div>`;
    const bucketTabs = `<div class="switch" role="group" aria-label="Сколько раз пройден вопрос">
      ${buckets.map((b) => `<button type="button" data-a="stats-rep" data-k="${b.k}" aria-pressed="${activeK === b.k}">${b.label} (${b.list.length})</button>`).join("")}
    </div>`;
    const listHtml = visible.length
      ? `<div class="rep-list">${visible.map((it) => {
          const rawQ = String(it.q.q || "").replace(/\s+/g, " ").trim();
          const txt = rawQ.length > 110 ? rawQ.slice(0, 108) + "…" : rawQ;
          const meta = `${esc(SUBJECT_NAME[it.q.sid] || "")}${it.t ? " · " + esc(topicRef(it.t)) : ""} · ответов ${it.st.n}, верных ${it.st.k}`;
          return `<button type="button" class="step-btn" data-a="quiz-one" data-id="${esc(it.q.id)}" data-back="stats" style="grid-template-columns:14px minmax(0,1fr) auto"><i class="dot" style="background:var(--c-${it.q.sid})"></i><span style="min-width:0"><span style="display:block">${esc(txt)}</span><span class="step-sub" style="display:block">${meta}</span></span><span class="arrow">${icon("arrow")}</span></button>`;
        }).join("")}</div>`
      : `<div class="empty"><span>Вопросов в группе «${activeBucket.label}» пока нет.</span></div>`;
    const moreBtn = !ui.statsRepAll && activeBucket.list.length > 25
      ? `<div><button type="button" class="btn ghost sm" data-a="stats-rep-all">Показать все (${activeBucket.list.length})</button></div>` : "";
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Повторяемость вопросов</h2><span class="small muted">не пройдено: ${rep.n0} из ${rep.total}</span></div>
      ${subjSwitch}
      ${bucketTabs}
      ${listHtml}
      ${moreBtn}
    </section>`;
  }
  function viewStats(opts) {
    const embedded = !!(opts && opts.embedded);
    const tot = totals(), prof = profile(), pd = planDoc();
    const allSess = sessions(), allMocks = mocks();
    const recent = allSess.slice(0, 15);
    const diff = tot.d7 - tot.prev7;
    const weekNote = tot.prev7 || tot.d7 ? (diff >= 0 ? "+" : "−") + minutesText(Math.abs(diff)) + " к прошлой неделе" : "";
    const accVal = tot.acc7 != null ? tot.acc7 + "%" : (tot.accAll != null ? tot.accAll + "%" : "—");
    const accNote = tot.acc7 != null ? "ответы за 7 дней" : (tot.accAll != null ? "за всё время" : "появится после первого теста");
    const repAll = questionAttemptBreakdown("all");
    const rep2Plus = repAll.n2.length + repAll.n3.length + repAll.n4.length;
    const seenCount = repAll.n1.length + rep2Plus;
    const subjCards = CONTENT.map((s) => subjectAutoCard(s, prof, allSess, allMocks, pd)).join("");
    const headHTML = embedded
      ? `<div class="row between" style="gap:8px;flex-wrap:wrap"><h2 class="h2">Подготовка в цифрах</h2><span class="small muted">Тесты, конспекты и пробники</span></div>`
      : `<div class="head"><div class="eyebrow">Показатели</div><h1 class="h1">Подготовка в цифрах</h1><p class="lead">Считается автоматически по тестам, конспектам, повторениям и полным вариантам. Занятия с учебником или бумажные пробники можно добавить внизу.</p></div>`;
    return `${headHTML}
      ${!embedded && store.mode === "local" ? localNotice() : !embedded ? staleNotice() : ""}
      <div class="tiles">
        ${tile("Сегодня", minutesText(tot.today), "")}
        ${tile("За 7 дней", minutesText(tot.d7), weekNote)}
        ${tile("Серия", days(tot.streak), "подряд с занятиями")}
        ${tile("Точность", accVal, accNote)}
      </div>
      <div class="tiles tiles-3">
        ${tile("Тестов завершено", String(tot.quizCount), tot.quizCount ? "всего записано" : "появится после теста")}
        ${tile("Подсказок за тест", formatAvg(tot.hintAvg), tot.quizCount ? `всего нажатий: ${tot.hintTotal}` : "среднее за завершённые тесты")}
        ${tile("Пройдено 2+ раза", String(rep2Plus), `из ${seenCount} начатых вопросов`)}
      </div>
      ${CONTENT.length ? `<section class="section"><div class="section-head"><h2 class="h2">По предметам (автоматически)</h2><span class="small muted">обновляется после каждого задания</span></div><div class="grid-3">${subjCards}</div></section>` : ""}
      ${repeatabilityCard()}
      <section class="card stack">
        <div class="row between"><h2 class="h2">Занятия за 4 недели</h2><span class="small muted">всего записано ${minutesText(tot.all)}</span></div>
        <div class="chart" data-chart="activity" style="height:170px"></div>
        <h3 class="h3">Последние записи</h3>
        ${recent.length ? `<div class="entries">${recent.map(entryRow).join("")}</div>` : '<div class="empty">Записей пока нет. Реши любой тест — время и результат появятся здесь автоматически.</div>'}
      </section>
      ${mocksCard()}
      <details class="card manual-box">
        <summary><span><b>Добавить вручную</b> <span class="small muted">занятие с учебником, репетитором или бумажный пробник</span></span></summary>
        <div class="manual-body"><div class="grid-2">${logForm()}${mockForm()}</div></div>
      </details>`;
  }
  function logForm() {
    return `<form class="card form" data-f="log">
      <h2 class="h2">Записать занятие</h2>
      <div class="fields">
        <div class="field"><label for="lg-d">Дата</label><input class="input" type="date" id="lg-d" data-d="log.d" value="${esc(draft("log.d", todayISO()))}" max="${todayISO()}" required></div>
        <div class="field"><label for="lg-s">Предмет</label>${subjSelect("lg-s", "log.sub", draft("log.sub", "bio"), true)}</div>
        <div class="field"><label for="lg-m">Минут</label><input class="input num" type="number" inputmode="numeric" id="lg-m" data-d="log.m" value="${esc(draft("log.m", ""))}" min="1" max="720" placeholder="45" required></div>
      </div>
      <div class="field"><label for="lg-n">Что было на занятии</label><input class="input" id="lg-n" data-d="log.n" value="${esc(draft("log.n", ""))}" maxlength="200" placeholder="Например: учебник, параграф про митоз"></div>
      <div><button class="btn" type="submit">Сохранить</button></div>
    </form>`;
  }
  function mockForm() {
    return `<form class="card form" data-f="mock">
      <h2 class="h2">Добавить пробник</h2>
      <div class="fields">
        <div class="field"><label for="mk-d">Дата</label><input class="input" type="date" id="mk-d" data-d="mk.d" value="${esc(draft("mk.d", todayISO()))}" max="${todayISO()}" required></div>
        <div class="field"><label for="mk-s">Предмет</label>${subjSelect("mk-s", "mk.sub", draft("mk.sub", "bio"), false)}</div>
        <div class="field"><label for="mk-sc">Тестовый балл</label><input class="input num" type="number" inputmode="numeric" id="mk-sc" data-d="mk.sc" value="${esc(draft("mk.sc", ""))}" min="0" max="100" placeholder="0–100" required></div>
        <div class="field"><label for="mk-p">Первичный балл</label><input class="input num" type="number" inputmode="numeric" id="mk-p" data-d="mk.p" value="${esc(draft("mk.p", ""))}" min="0" max="100" placeholder="необязательно"></div>
      </div>
      <div class="field"><label for="mk-n">Источник</label><input class="input" id="mk-n" data-d="mk.n" value="${esc(draft("mk.n", ""))}" maxlength="120" placeholder="Например: демоверсия ФИПИ"></div>
      <div><button class="btn" type="submit">Добавить</button></div>
    </form>`;
  }
  function delControl(key, action, attrs) {
    if (ui.confirmDel === key) return `<span class="row" style="gap:12px"><button type="button" class="link-btn" style="color:var(--bad)" data-a="${action}" ${attrs}>Удалить</button><button type="button" class="link-btn" data-a="cancel-del">Отмена</button></span>`;
    return `<button type="button" class="x-btn" data-a="ask-del" data-k="${esc(key)}" aria-label="Удалить запись">${icon("trash")}</button>`;
  }
  function quizLabel(e) {
    const t = TOPICS[e.t];
    if (t) return topicRef(t);
    return { mixed: "смешанный", review: "повторение", mistakes: "работа над ошибками", ai: "вопросы ИИ", variant: "пробный вариант", part2: "часть 2" }[e.t] || "тренировка";
  }
  function entryRow(e) {
    const title = e.k === "quiz" ? "Тест: " + quizLabel(e) : e.n || "Занятие";
    const extra = e.k === "quiz" ? ["верно " + (e.c || 0) + " из " + (e.q || 0)].concat(e.h ? ["подсказок: " + e.h] : []) : [];
    const sub = [SUBJECT_NAME[e.sub] || "Другое", e.m ? minutesText(e.m) : "меньше минуты"].concat(extra).join(" · ");
    return `<div class="entry"><span class="entry-date">${dateShort(e.d)}</span><div class="entry-main"><span class="entry-title">${esc(title)}</span><span class="entry-sub">${esc(sub)}</span></div>${delControl("log:" + e.doc + ":" + e.id, "del-log", `data-doc="${esc(e.doc)}" data-id="${esc(e.id)}"`)}</div>`;
  }
  function mocksCard() {
    const list = mocks(), prof = profile();
    const subs = SUBJECT_META.filter((s) => list.some((m) => m.sub === s.id));
    if (!list.length) {
      return `<section class="card stack"><div class="row between"><h2 class="h2">Пробные экзамены</h2><span class="small muted">тестовый балл из 100</span></div>
        <div class="empty"><b>Пробников пока нет</b><span>Реши полный вариант на странице предмета — тестовый балл и график появятся здесь автоматически. Бумажный пробник можно добавить вручную ниже.</span></div></section>`;
    }
    const rows = list.slice().reverse().map((m) => {
      const target = prof.targets[m.sub];
      const chip = m.sc >= target ? `<span class="chip good">цель достигнута</span>` : `<span class="chip">до цели ${target - m.sc}</span>`;
      return `<tr><td class="mono small" style="white-space:nowrap">${dateShort(m.d)}</td><td><span class="row" style="gap:6px;flex-wrap:nowrap"><i class="dot" style="background:var(--c-${m.sub})"></i>${esc(SUBJECT_NAME[m.sub] || "")}</span></td><td class="num"><b>${m.sc}</b> ${chip}</td><td class="num">${m.p != null && m.p !== "" ? esc(m.p) : "—"}</td><td class="small">${esc(m.n || "")}</td><td>${delControl("mock:" + m.id, "del-mock", `data-id="${esc(m.id)}"`)}</td></tr>`;
    }).join("");
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Пробные экзамены</h2><span class="small muted">тестовый балл из 100</span></div>
      ${subs.length > 1 ? `<div class="legend">${subs.map((s) => `<span><i style="background:var(--c-${s.id})"></i>${esc(s.name)}</span>`).join("")}</div>` : ""}
      <div class="chart" data-chart="mocks" style="height:230px"></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Дата</th><th>Предмет</th><th>Балл</th><th>Первичный</th><th>Источник</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>`;
  }

  // ---------- графики ----------
  function niceStep(x) { const steps = [5, 10, 15, 20, 30, 60, 90, 120, 180, 240, 360]; return steps.find((s) => s >= x) || 480; }
  function barPath(x, yTop, w, h, r) {
    r = Math.min(r, w / 2, h);
    const yb = yTop + h;
    return `M${x},${yb}V${yTop + r}Q${x},${yTop} ${x + r},${yTop}H${x + w - r}Q${x + w},${yTop} ${x + w},${yTop + r}V${yb}Z`;
  }
  function drawActivity(el) {
    const W = Math.max(260, el.clientWidth), H = 170, padL = 36, padR = 8, padT = 10, padB = 24;
    const N = 28, today = todayISO(), byDay = minutesByDay();
    const daysArr = range(N).map((i) => addDays(today, i - N + 1));
    const vals = daysArr.map((d) => byDay[d] || 0);
    const step = niceStep(Math.max(30, ...vals) / 3);
    const top = Math.max(step * 3, Math.ceil(Math.max(...vals) / step) * step);
    const ih = H - padT - padB, iw = W - padL - padR, band = iw / N, bw = Math.min(24, Math.max(3, band * 0.62));
    const y = (v) => padT + ih - (v / top) * ih;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Минуты занятий за последние 28 дней">`;
    for (let v = 0; v <= top; v += step) {
      s += `<line class="${v === 0 ? "axis-l" : "grid-l"}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    }
    daysArr.forEach((d, i) => {
      const v = vals[i], x = padL + band * i + (band - bw) / 2;
      if (v > 0) s += `<path d="${barPath(x, y(v), bw, Math.max(2, (v / top) * ih), 4)}" fill="var(--accent)"/>`;
      if (i % 7 === 6) s += `<text x="${padL + band * i + band / 2}" y="${H - 6}" text-anchor="middle">${esc(dateShort(d))}</text>`;
      s += `<rect x="${padL + band * i}" y="${padT}" width="${band}" height="${ih}" fill="transparent" data-tip="${esc(dateDay(d) + ": " + (v ? minutesText(v) : "занятий нет"))}"/>`;
    });
    if (!vals.some(Boolean)) s += `<text x="${padL + iw / 2}" y="${padT + ih / 2 + 4}" text-anchor="middle">Пока нет записей — пройди тест или добавь занятие</text>`;
    el.innerHTML = s + "</svg>";
  }
  function drawMocks(el) {
    const list = mocks(), prof = profile();
    if (!list.length) { el.innerHTML = ""; return; }
    const W = Math.max(260, el.clientWidth), H = 230, padL = 32, padR = 64, padT = 14, padB = 26;
    const ih = H - padT - padB, iw = W - padL - padR;
    const t0 = parseISO(list[0].d).getTime();
    const t1 = Math.max(parseISO(list[list.length - 1].d).getTime(), t0 + 30 * 86400000);
    const x = (iso) => padL + ((parseISO(iso).getTime() - t0) / (t1 - t0)) * iw;
    const y = (v) => padT + ih - (v / 100) * ih;
    let s = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Баллы пробных экзаменов">`;
    for (let v = 0; v <= 100; v += 20) s += `<line class="${v === 0 ? "axis-l" : "grid-l"}" x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}"/><text x="${padL - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`;
    s += `<text x="${padL}" y="${H - 6}" text-anchor="start">${esc(dateShort(list[0].d))}</text><text x="${W - padR}" y="${H - 6}" text-anchor="end">${esc(dateShort(isoDate(new Date(t1))))}</text>`;
    const seenTargets = new Set(), ends = [];
    for (const sm of SUBJECT_META) {
      const pts = list.filter((m) => m.sub === sm.id);
      if (!pts.length) continue;
      const color = `var(--c-${sm.id})`, target = prof.targets[sm.id];
      s += `<line x1="${padL}" x2="${W - padR}" y1="${y(target)}" y2="${y(target)}" stroke="${color}" stroke-width="1.5" stroke-opacity=".45"/>`;
      if (!seenTargets.has(target)) { seenTargets.add(target); s += `<text x="${W - padR + 6}" y="${y(target) + 4}">цель ${target}</text>`; }
      if (pts.length > 1) s += `<path d="${pts.map((m, i) => (i ? "L" : "M") + x(m.d) + "," + y(m.sc)).join("")}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
      pts.forEach((m) => {
        s += `<circle cx="${x(m.d)}" cy="${y(m.sc)}" r="4.5" fill="${color}" stroke="var(--surface)" stroke-width="2"/>`;
        s += `<circle cx="${x(m.d)}" cy="${y(m.sc)}" r="13" fill="transparent" data-tip="${esc(sm.name + " · " + dateDay(m.d) + ": " + m.sc + " " + plural(m.sc, "балл", "балла", "баллов"))}"/>`;
      });
      const last = pts[pts.length - 1];
      ends.push({ x: x(last.d) + 9, y: y(last.sc) - 8, v: last.sc });
    }
    // Подписи концов линий не наезжают друг на друга: лишние значения остаются в подсказке и таблице.
    let prevY = -Infinity;
    ends.sort((a, b) => a.y - b.y).forEach((e) => {
      if (e.y - prevY < 14) return;
      prevY = e.y;
      s += `<text class="lbl" x="${e.x}" y="${e.y}">${e.v}</text>`;
    });
    el.innerHTML = s + "</svg>";
  }
  function drawCharts() {
    document.querySelectorAll("[data-chart]").forEach((el) => {
      if (el.dataset.chart === "activity") drawActivity(el);
      if (el.dataset.chart === "mocks") drawMocks(el);
    });
  }
  let resizeTimer = null;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(drawCharts, 150); });


  // ---------- профиль и настройки ----------
  const GRADE_OPTIONS = [
    "",
    "11 класс · ЕГЭ",
    "10 класс · ЕГЭ",
    "9 класс · ОГЭ",
    "8 класс и младше",
    "Студент / навыки"
  ];
  function viewProfile() {
    const prof = profile();
    const isTutor = ui.role === "tutor";
    const isAdmin = ui.role === "admin";
    const authed = typeof isUserAuthenticated === "function" ? isUserAuthenticated() : Boolean(store.user || ui.demoAuthed);
    const isDemo = Boolean(!store.user && (ui.demoAuthed || ui.guest));
    const showSetupNotif = typeof needsPrepSetup === "function"
      ? needsPrepSetup()
      : Boolean(!isTutor && !isAdmin && store.ready && (!prof.exists || prof.prepSetupPending) && store.error !== "readonly" && (!store.backend || store.user || ui.guest));
    const setupNotifHTML = showSetupNotif
      ? `<section class="card profile-setup-notif${ui.prepSetupOpen ? " is-open" : ""}" id="profile-setup-notif" aria-label="Настройка подготовки">
          <div class="profile-setup-bar">
            <div class="row" style="gap:10px;align-items:center;min-width:0">
              <span class="chip notif num">+1</span>
              <div class="stack" style="gap:2px;min-width:0">
                <b>Давай настроим подготовку</b>
                <span class="small muted">Укажите целевые баллы — план и отсчёты подстроятся под вас</span>
              </div>
            </div>
            <button type="button" class="btn soft sm" data-a="prep-setup-toggle" aria-expanded="${ui.prepSetupOpen ? "true" : "false"}">${ui.prepSetupOpen ? "Свернуть" : "Настроить"}</button>
          </div>
          ${ui.prepSetupOpen && EGE.views.trainer && typeof EGE.views.trainer.onboardingCard === "function"
            ? `<div class="profile-setup-body">${EGE.views.trainer.onboardingCard()}</div>`
            : ""}
        </section>`
      : "";
    const vc = typeof mkt === "function" && mkt() && mkt().verifiedContact;
    const displayName = String(draft("pf.name", prof.name || defaultName()) || "Ученик");
    const curPhoto = prof.photo || (store.user && store.user.avatarUrl) || "";
    const curGrade = String(draft("pf.grade", prof.grade || ""));
    const curCity = String(draft("pf.city", prof.city || ""));
    const curPhone = String(draft("pf.phone", prof.phone || (vc && vc.value) || ""));
    const curPhoneCountry = String(draft("pf.phoneCountry", prof.phoneCountry || (vc && vc.country) || "RU"));
    const curGoal = String(draft("pf.goal", prof.goal || ""));
    const avatarEl = curPhoto
      ? `<img class="stu-profile-avatar" src="${esc(curPhoto)}" alt="Фото профиля">`
      : `<span class="stu-profile-avatar is-fallback" aria-hidden="true">${esc(initials(displayName || "У"))}</span>`;
    const roleChip = isAdmin
      ? `<span class="chip pro">Администратор</span>`
      : isTutor
        ? `<span class="chip gold">Преподаватель</span>`
        : `<span class="chip accent">${isDemo ? "Демо-ученик" : "Ученик"}</span>`;
    const topActionBtn = authed
      ? `<button type="button" class="btn ghost sm" data-a="auth-logout">${icon("logout")}<span>Выйти</span></button>`
      : (store.backend ? `<button type="button" class="btn soft sm" data-a="auth-modal-open">Войти в аккаунт</button>` : "");
    return `<div class="head row between" style="align-items:flex-end;gap:10px;flex-wrap:wrap">
        <div><div class="eyebrow">Профиль</div><h1 class="h1">Личный профиль</h1></div>
        ${topActionBtn}
      </div>
      ${setupNotifHTML}
      ${store.backend && store.user ? accountCard() : ""}
      <form class="card pad-lg form stu-profile-form" data-f="profile">
        <div class="stu-photo-row">
          ${avatarEl}
          <div class="stu-profile-ident">
            <div class="stu-profile-head-chips">
              <b style="font-size:16px">${esc(displayName)}</b>
              ${roleChip}
              ${vc && vc.value ? `<span class="chip good">Телефон подтверждён ✓</span>` : ""}
            </div>
            <span class="small muted">${prof.photo ? "Фото сохранено в профиле и отображается в кабинете" : "Добавьте своё фото — оно появится в вашем профиле"}</span>
            <div class="stu-profile-actions">
              <label class="btn soft sm" for="pf-photo-file" style="cursor:pointer">${icon("upload")}<span>${prof.photo ? "Изменить фото" : "Добавить фото"}</span></label>
              <input type="file" id="pf-photo-file" accept="image/*" hidden>
              ${prof.photo ? `<button type="button" class="btn ghost sm" data-a="pf-photo-clear">Удалить фото</button>` : ""}
            </div>
          </div>
        </div>
        <h2 class="h2">Личные данные</h2>
        <div class="field">
          <label for="pf-name">Имя и фамилия</label>
          <input class="input" id="pf-name" name="name" data-d="pf.name" value="${esc(draft("pf.name", prof.name || defaultName()))}" maxlength="40" placeholder="Как к тебе обращаться">
        </div>
        <div class="fields">
          <div class="field">
            <label for="pf-grade">Класс или цель</label>
            <select class="input" id="pf-grade" name="grade" data-d="pf.grade">
              ${GRADE_OPTIONS.map((opt) => `<option value="${esc(opt)}"${curGrade === opt ? " selected" : ""}>${esc(opt || "Не указано")}</option>`).join("")}
            </select>
          </div>
          <div class="field">
            <label for="pf-city">Город</label>
            <input class="input" id="pf-city" name="city" data-d="pf.city" value="${esc(curCity)}" maxlength="40" placeholder="Якутск, Москва…">
          </div>
        </div>
        ${typeof phoneFieldHTML === "function"
          ? phoneFieldHTML({ scope: "pf-phone", id: "pf-phone", name: "phone", label: "Телефон для СМС и мессенджеров", value: curPhone, country: curPhoneCountry, dataD: "pf.phone", compact: true })
          : `<div class="field">
              <label for="pf-phone">Телефон для СМС и мессенджеров</label>
              <input class="input num" id="pf-phone" name="phone" type="tel" data-d="pf.phone" value="${esc(curPhone || "+7 ")}" maxlength="28" placeholder="+7 (914) 000-00-00">
            </div>`}
        <div class="field">
          <label for="pf-goal">О себе и цели подготовки</label>
          <textarea class="textarea" id="pf-goal" name="goal" rows="2" maxlength="200" data-d="pf.goal" placeholder="Например: ЕГЭ по профилю и физике на 85+, удобны занятия вечером">${esc(curGoal)}</textarea>
        </div>
        <div class="label">Целевые баллы</div>
        <div class="fields">${SUBJECT_META.map((s) => `<div class="field"><label for="pf-t-${s.id}">${esc(s.name)}</label><input class="input num" type="number" min="0" max="100" inputmode="numeric" id="pf-t-${s.id}" data-d="pf.t.${s.id}" value="${esc(draft("pf.t." + s.id, prof.targets[s.id]))}"></div>`).join("")}</div>
        <div class="label">Даты экзаменов</div>
        <div class="fields">${SUBJECT_META.map((s) => `<div class="field"><label for="pf-e-${s.id}">${esc(s.name)}</label><input class="input" type="date" id="pf-e-${s.id}" data-d="pf.e.${s.id}" value="${esc(draft("pf.e." + s.id, prof.exams[s.id]))}"></div>`).join("")}</div>
        <p class="hint">Сейчас стоят даты из проекта расписания ЕГЭ-2027. Когда расписание утвердят, поправь их здесь — план и отсчёты обновятся.</p>
        <div><button class="btn" type="submit">Сохранить профиль</button></div>
      </form>
      <section class="card pad-lg row between" style="gap:10px;flex-wrap:wrap">
        <div class="stack" style="gap:2px">
          <b>Статистика и показатели</b>
          <span class="small muted">Графики активности, точность и повторяемость тем</span>
        </div>
        <button type="button" class="btn soft sm" data-a="go" data-v="stats">${icon("chart")}<span>Открыть показатели</span></button>
      </section>
      ${dataCard()}`;
  }
  function dataCard() {
    const isDemo = Boolean(!store.user && (ui.demoAuthed || ui.guest));
    const where = store.mode === "cloud"
      ? (store.backend
          ? "Прогресс хранится на сервере в базе данных и привязан к твоему аккаунту. Войди под тем же логином на любом устройстве — ответы, отметки и записи будут на месте."
          : "Прогресс хранится в облаке claude.ai и привязан к твоему аккаунту. Открой эту страницу на любом компьютере под тем же аккаунтом — ответы, отметки и записи будут на месте.")
      : store.mode === "local"
        ? (isDemo
            ? "Вы в демо-режиме — фото, данные профиля и учебный прогресс сохраняются локально в этом браузере."
            : (store.backend
                ? "Сервер базы данных подключён — для облачной синхронизации войдите в аккаунт в правом верхнем углу."
                : "Данные профиля и учебный прогресс хранятся локально в этом браузере."))
        : "Подключаюсь к хранилищу…";
    const cf = ui.confirm;
    return `<section class="card pad-lg stack">
      <h2 class="h2">Данные</h2>
      <p class="ink2">${where}</p>
      <div class="row">
        <button type="button" class="btn ghost" data-a="export">${icon("download")}Скачать резервную копию</button>
        <button type="button" class="btn ghost" data-a="import">${icon("upload")}Восстановить из копии</button>
        <input type="file" id="import-file" accept=".json,application/json" hidden>
      </div>
      ${ui.exportText ? `<div class="field"><label for="export-text">Скопируй текст и сохрани его в файл с расширением .json</label><textarea class="textarea" id="export-text" rows="6" readonly>${esc(ui.exportText)}</textarea><div><button type="button" class="btn soft sm" data-a="copy-export">Скопировать</button></div></div>` : ""}
      ${cf && cf.kind === "import" ? `<div class="confirm"><b>Заменить данные копией от ${esc(cf.date)}?</b><span class="small">Прогресс, план и записи заменятся данными из файла.</span><div class="row"><button type="button" class="btn danger sm" data-a="import-do">Заменить</button><button type="button" class="btn ghost sm" data-a="confirm-cancel">Отмена</button></div></div>` : ""}
      <div class="row">${CONTENT.map((s) => `<button type="button" class="btn ghost" data-a="reset-ask" data-sid="${s.id}">${icon("trash")}Сбросить прогресс ${esc(SUBJ[s.id].po)}</button>`).join("")}</div>
      ${cf && cf.kind === "reset" ? `<div class="confirm"><b>Сбросить все ответы и отметки ${esc(SUBJ[cf.sid].po)}?</b><span class="small">План, пробники и журнал занятий останутся. Отменить сброс нельзя, поэтому сначала можно скачать резервную копию.</span><div class="row"><button type="button" class="btn danger sm" data-a="reset-do">Сбросить</button><button type="button" class="btn ghost sm" data-a="confirm-cancel">Отмена</button></div></div>` : ""}
    </section>
    <section class="card stack"><h2 class="h2">Откуда сроки</h2><p class="ink2 small">Даты собраны ${EGE.plan ? dateLong(EGE.plan.checked) : ""}: проект расписания ЕГЭ-2027 (Минпросвещения и Рособрнадзор, обсуждение до 10 ноября 2026 года) и сроки приёмной кампании 2026 года. Официальные документы смотри на сайтах ниже.</p>
      <div class="stack small"><a href="https://obrnadzor.gov.ru/" target="_blank" rel="noopener">Рособрнадзор</a><a href="https://fipi.ru/" target="_blank" rel="noopener">ФИПИ</a><a href="https://www.gosuslugi.ru/vuzonline" target="_blank" rel="noopener">Поступление в вуз онлайн (Госуслуги)</a></div>
    </section>`;
  }
  async function doExport() {
    const data = JSON.stringify({ app: "vektor-ege", v: 1, exported: new Date().toISOString(), docs: store.docs }, null, 2);
    const filename = "vektor-ege-" + todayISO() + ".json";
    if (caps.downloads) {
      try { await caps.downloads.save({ filename, data }); toast("Резервная копия сохранена"); return; }
      catch (e) { if (e && e.code === "declined") return; }
    }
    try {
      if (typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function" && typeof document.createElement === "function") {
        const blob = new Blob([data], { type: "application/json" });
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href; a.download = filename;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => { try { URL.revokeObjectURL(href); } catch (e) {} }, 1000);
        toast("Файл резервной копии скачан");
        return;
      }
    } catch (e) { /* запасной вариант ниже */ }
    ui.exportText = data;
    scheduleRender();
  }
  function readImport(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const obj = JSON.parse(String(r.result));
        if (!obj || (obj.app !== "vektor-ege" && obj.app !== "put-v-medicinu") || !isObj(obj.docs)) throw new Error("format");
        ui.confirm = { kind: "import", data: obj.docs, date: obj.exported ? dateLong(String(obj.exported).slice(0, 10)) : "неизвестной даты" };
      } catch (e) {
        ui.confirm = null;
        toast("Это не резервная копия «Вектора ЕГЭ».");
      }
      scheduleRender();
    };
    r.readAsText(file);
  }
  function doImport() {
    const cf = ui.confirm;
    if (!cf || cf.kind !== "import") return;
    const ok = /^(profile|plan|mocks|essays|prog-[a-z]+|log-\d{4}-\d{2})$/;
    for (const name of Object.keys(cf.data)) if (ok.test(name) && isObj(cf.data[name])) replaceDoc(name, cf.data[name]);
    ui.confirm = null;
    toast("Данные восстановлены из копии");
  }
  function copyText(text, sel) {
    const fallback = () => { const el = document.querySelector(sel); if (el) { el.focus(); el.select(); toast("Текст выделен — нажми Ctrl+C"); } };
    try { navigator.clipboard.writeText(text).then(() => toast("Скопировано"), fallback); } catch (e) { fallback(); }
  }
  function handleProfilePhotoFile(el) {
    if (!el || !el.files || !el.files[0]) return false;
    if (typeof readResizedPhotoFile !== "function") return false;
    readResizedPhotoFile(
      el.files[0],
      { maxDim: 240, quality: 0.84, maxLen: 350000 },
      (url) => {
        const hadDoc = Boolean(store.docs && store.docs.profile);
        const pendingFlag = hadDoc ? Boolean(store.docs.profile.prepSetupPending) : true;
        patchDoc("profile", { photo: url, prepSetupPending: pendingFlag });
        scheduleRender();
        toast("Фото профиля обновлено");
      },
      () => { toast("Выберите изображение (JPG, PNG, WebP)"); }
    );
    return true;
  }

  function registerActions(ACTIONS) {
    Object.assign(ACTIONS, {
    "plan-filter": (el) => { ui.planFilter = el.dataset.filter || "all"; scheduleRender(); },
    "stats-subj": (el) => { ui.statsSubj = el.dataset.sid || "all"; ui.statsRepAll = false; scheduleRender(); },
    "stats-rep": (el) => { const k = Number(el.dataset.k); if ([1, 2, 3, 4].includes(k)) { ui.statsRepBucket = k; ui.statsRepAll = false; scheduleRender(); } },
    "stats-rep-all": () => { ui.statsRepAll = true; scheduleRender(); },
    "plan-act": (el) => {
      const it = findPlanItem(el.dataset.id), act = it && it.action;
      if (!act || !SUBJ[act.sid]) return;
      if (act.kind === "diag") {
        startQuiz({ title: "Диагностика · " + SUBJ[act.sid].name, sid: act.sid, qs: pickMixed(act.sid, QUIZ_SIZE).map((id) => QS[id]), mode: "mixed", back: { v: "plan" }, planId: it.id });
        return;
      }
      if (act.kind === "prep") {
        const list = (SUBJ[act.sid].topicList || []).filter((x) => x.qids.length);
        const t = list.find((x) => topicStats(x).mastered < x.qids.length) || list[0];
        if (!t) { toast("Здесь пока нет вопросов."); return; }
        startQuiz({ title: topicRef(t), sid: t.sid, qs: pickTopic(t, TOPIC_QUIZ).map((id) => QS[id]), mode: "topic", topicId: t.id, back: { v: "plan" }, planId: it.id });
      }
    },
    "ask-del": (el) => { ui.confirmDel = el.dataset.k; scheduleRender(); },
    "cancel-del": () => { ui.confirmDel = null; scheduleRender(); },
    "del-log": (el) => { patchDoc(el.dataset.doc, { s: { [el.dataset.id]: null } }); ui.confirmDel = null; toast("Запись удалена"); },
    "del-mock": (el) => { patchDoc("mocks", { m: { [el.dataset.id]: null } }); ui.confirmDel = null; toast("Пробник удалён"); },
    "del-todo": (el) => { patchDoc("plan", { custom: { [el.dataset.id]: null } }); ui.confirmDel = null; toast("Дело удалено"); },
    export: () => doExport(),
    "copy-export": () => copyText(ui.exportText, "#export-text"),
    import: () => { const f = document.getElementById("import-file"); if (f) f.click(); },
    "import-do": () => doImport(),
    "reset-ask": (el) => { if (!SUBJ[el.dataset.sid]) return; ui.confirm = { kind: "reset", sid: el.dataset.sid }; scheduleRender(); },
    "reset-do": () => {
      const cf = ui.confirm;
      if (!cf || cf.kind !== "reset" || !SUBJ[cf.sid]) return;
      replaceDoc("prog-" + cf.sid, { q: {}, th: {} });
      ui.confirm = null;
      toast("Прогресс " + SUBJ[cf.sid].po + " сброшен");
    },
    "confirm-cancel": () => { ui.confirm = null; scheduleRender(); },
    "prep-setup-toggle": () => { ui.prepSetupOpen = !ui.prepSetupOpen; scheduleRender(); },
    "pf-photo-clear": () => {
      patchDoc("profile", { photo: "" });
      scheduleRender();
      toast("Фото профиля удалено");
    },
    });
  }

  EGE.views = EGE.views || {};
  EGE.views.progress = {
    configure,
    registerActions,
    copyText,
    delControl,
    doExport,
    doImport,
    drawCharts,
    handleProfilePhotoFile,
    readImport,
    toggleTodo,
    viewPlan,
    viewProfile,
    viewStats
  };
})();
