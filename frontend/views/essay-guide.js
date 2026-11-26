/* Справочник без ИИ, подбор аргументов и тренажёр «Сочинение 27». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { $, dateShort, esc, newId, norm, pad, plural, rich, todayISO } = EGE.utils;
  const { icon } = EGE.ui;

  let CONTENT, SUBJ, ai, hash, store, ui, profile, selectedContentSubjects;
  let go, markPlanPrep, patchDoc, scheduleRender, toast;

  const aiErrorText = (e) => EGE.views.trainer.aiErrorText(e);
  const fmtAI = (text) => EGE.views.trainer.fmtAI(text);
  const subjectAI = (sid) => EGE.views.trainer.subjectAI(sid);
  const viewSubject = (sid) => EGE.views.trainer.viewSubject(sid);
  const delControl = (key, action, attrs) => EGE.views.progress.delControl(key, action, attrs);

  function configure(ctx) {
    ({
      CONTENT, SUBJ, ai, hash, store, ui, profile, selectedContentSubjects,
      go, markPlanPrep, patchDoc, scheduleRender, toast
    } = ctx || {});
  }

  // ---------- справочник без ИИ и репетитор ----------
  function tableBlockHTML(tb) {
    return `<div class="small muted">${rich(tb.title)}</div><div class="qtbl-wrap"><table class="qtbl">${tb.rows.map((r, i) => `<tr>${r.map((c, j) => (i === 0 || (tb.head1 && j === 0) ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join("")}</tr>`).join("")}</table></div>${tb.note ? `<div class="small muted">${rich(tb.note)}</div>` : ""}`;
  }
  function guideQuickChips(sid, pool) {
    const bySub = {
      bio: ["митоз", "фотосинтез", "мейоз", "генетический код", "кровообращение"],
      rus: ["ударения", "н и нн", "запятые", "причастный оборот", "клише", "аргументы"],
      chem: ["овр", "гидролиз", "электролиз", "изомерия", "степень окисления"],
      all: ["митоз", "фотосинтез", "ударения", "запятые", "гидролиз", "овр", "клише"]
    };
    if (sid !== "all" || !Array.isArray(pool) || !pool.length) return (bySub[sid] || bySub.all);
    const out = [];
    pool.forEach((s) => {
      (bySub[s.id] || []).slice(0, 3).forEach((w) => {
        if (!out.includes(w)) out.push(w);
      });
    });
    return out.length ? out : bySub.all;
  }
  function guideMatchEssay(terms) {
    const E = EGE.essay;
    if (!E) return "";
    const clicheHits = (E.cliches || []).filter((c) => terms.every((w) => norm(c.part + " " + c.items.join(" ")).includes(w)));
    const argHits = (E.args || []).filter((g) => terms.every((w) => norm(g.theme + " " + g.items.map((x) => x.src + " " + x.text).join(" ")).includes(w)));
    if (!clicheHits.length && !argHits.length && !terms.every((w) => norm("сочинение задание 27 план клише аргументы").includes(w))) return "";
    return `<article class="card guide-card">
      <div class="guide-meta"><span class="eyebrow">Русский язык · Задание 27</span><button type="button" class="btn soft sm" data-a="go" data-v="essay">Тренажёр сочинения</button></div>
      <h2 class="h2">Сочинение: клише и аргументы</h2>
      ${clicheHits.slice(0, 2).map((c) => `<div class="stack" style="gap:4px"><div class="label">${esc(c.part)}</div><ul class="theory">${c.items.slice(0, 3).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      ${argHits.slice(0, 2).map((g) => `<div class="stack" style="gap:4px"><div class="label">${esc(g.theme)}</div><ul class="theory">${g.items.slice(0, 2).map((x) => `<li><b>${esc(x.src)}:</b> ${esc(x.text)}</li>`).join("")}</ul></div>`).join("")}
    </article>`;
  }
  function guideOverview(sid, pool) {
    const src = Array.isArray(pool) ? pool : CONTENT;
    const list = sid === "all" ? src : src.filter((s) => s.id === sid);
    const cards = list.map((s) => {
      const topics = (s.content && s.content.topicList) || [];
      const withTables = topics.filter((t) => t.tables && t.tables.length);
      const sample = (withTables.length ? withTables : topics).slice(0, 8);
      return `<section class="card stack">
        <div class="row between"><span class="row" style="gap:8px"><i class="dot" style="background:var(--c-${s.id})"></i><h2 class="h2">${esc(s.name)}</h2></span><button type="button" class="link-btn" data-a="go" data-v="subject" data-sid="${s.id}">Все темы · ${topics.length}</button></div>
        <div class="suggest">${sample.map((t) => `<button type="button" data-a="open-topic" data-id="${t.id}">${esc(t.title)}</button>`).join("")}</div>
      </section>`;
    }).join("");
    const hasRus = src.some((s) => s.id === "rus");
    const essayCard = (sid === "all" || sid === "rus") && hasRus && EGE.essay
      ? `<section class="card stack">
          <div class="row between"><h2 class="h2">Сочинение ЕГЭ · памятка</h2><button type="button" class="btn soft sm" data-a="go" data-v="essay">Открыть тренажёр</button></div>
          <p class="small ink2">План на 200–250 слов, готовые клише по критериям К1–К3, образец сочинения и банк литературных аргументов.</p>
        </section>`
      : "";
    return cards + essayCard;
  }
  function viewGuide(opts) {
    opts = opts || {};
    const embedded = !!opts.embedded;
    const selectedPool = typeof selectedContentSubjects === "function" ? selectedContentSubjects() : CONTENT;
    const searchPool = selectedPool.length ? selectedPool : CONTENT;
    const headHtml = embedded
      ? ""
      : `<div class="hh-seg learn-head-seg" role="group" aria-label="Раздел учёбы">
        <button type="button" data-a="go" data-v="tests" aria-pressed="false">Предметы и тесты</button>
        <button type="button" data-a="learn-tab" data-tab="guide" aria-pressed="true">Справочник</button>
      </div>`;
    const qNorm = norm(ui.guideQ);
    const terms = qNorm ? qNorm.split(/\s+/).filter(Boolean) : [];
    const searchBox = `<div class="search-wrap guide-search-only">
      <span class="guide-search-ico" aria-hidden="true">${icon("search")}</span>
      <label class="sr" for="guide-q">Поиск по справочнику</label>
      <input class="input" type="search" id="guide-q" value="${esc(ui.guideQ)}" placeholder="Поиск по правилам, терминам, формулам и исключениям…">
      ${ui.guideQ ? `<button type="button" class="search-clear" data-a="guide-clear" aria-label="Очистить поиск">${icon("x")}</button>` : ""}
    </div>`;
    let body = "";
    if (terms.length) {
      const hits = [];
      for (const s of searchPool) {
        const secs = (s.content && s.content.sections) || [];
        for (const sec of secs) {
          for (const t of sec.topics) {
            const titleText = norm(t.title + " " + t.code + " " + sec.title);
            const matchTables = (t.tables || []).filter((tb) => terms.every((w) => norm(tb.title + " " + tb.rows.map((r) => r.join(" ")).join(" ") + " " + (tb.note || "")).includes(w)));
            const matchBullets = (t.theory || []).filter((line) => !line.startsWith("## ") && terms.every((w) => norm(line).includes(w)));
            const fullText = titleText + " " + norm((t.theory || []).join(" ")) + " " + norm((t.tables || []).map((tb) => tb.title + " " + tb.rows.map((r) => r.join(" ")).join(" ")).join(" "));
            if (!terms.every((w) => fullText.includes(w))) continue;
            const score = (terms.every((w) => titleText.includes(w)) ? 4 : 0) + (matchTables.length ? 2 : 0) + (matchBullets.length ? 1 : 0);
            hits.push({ s, sec, t, matchTables, matchBullets, score });
          }
        }
      }
      hits.sort((a, b) => b.score - a.score);
      const essayHit = searchPool.some((s) => s.id === "rus") ? guideMatchEssay(terms) : "";
      const cards = hits.slice(0, 12).map(({ s, sec, t, matchTables, matchBullets }) => {
        const bullets = (matchBullets.length ? matchBullets : (t.theory || []).filter((x) => !x.startsWith("## "))).slice(0, 4);
        const tb = matchTables[0] || (t.tables && t.tables[0]) || null;
        return `<article class="card guide-card">
          <div class="guide-meta">
            <span class="row small muted" style="gap:6px"><i class="dot" style="background:var(--c-${s.id})"></i>${esc(s.name)} · ${esc(sec.title)}</span>
            <span class="row" style="gap:6px">
              <button type="button" class="btn soft sm" data-a="open-topic" data-id="${t.id}">Конспект</button>
              ${t.qids.length ? `<button type="button" class="btn ghost sm" data-a="quiz-topic" data-id="${t.id}">Тест</button>` : ""}
            </span>
          </div>
          <h2 class="h2">${esc(t.title)}</h2>
          ${bullets.length ? `<ul class="theory">${bullets.map((x) => `<li>${rich(x)}</li>`).join("")}</ul>` : ""}
          ${tb ? tableBlockHTML(tb) : ""}
        </article>`;
      }).join("");
      body = (essayHit + cards) || `<div class="empty"><b>По запросу «${esc(ui.guideQ)}» ничего не найдено</b><span>Попробуй более короткое слово: например, «митоз», «гидролиз» или «запятые».</span><button type="button" class="btn ghost sm" data-a="guide-clear">Очистить поиск</button></div>`;
    }
    return `${headHtml}
      ${searchBox}
      ${body}`;
  }

  function viewTutor(opts) {
    opts = opts || {};
    const embedded = !!opts.embedded;
    if (ai.state !== "ready") return viewGuide(opts);
    const c = ui.chat;
    const head = embedded
      ? ""
      : `<div class="hh-seg learn-head-seg" role="group" aria-label="Раздел учёбы">
        <button type="button" data-a="go" data-v="tests" aria-pressed="false">Предметы и тесты</button>
        <button type="button" data-a="learn-tab" data-tab="guide" aria-pressed="true">Справочник</button>
      </div>`;
    const sugg = subjectAI(c.sid).suggest || [];
    const switcher = CONTENT.length > 1
      ? `<div class="switch" role="group" aria-label="Предмет">${CONTENT.map((s) => `<button type="button" data-a="chat-subject" data-sid="${s.id}" aria-pressed="${s.id === c.sid}">${esc(s.name)}</button>`).join("")}</div>`
      : "";
    const bubbles = c.turns.map((t) => `<div class="bubble ${t.role === "user" ? "me" : "ai"}"${t.streaming ? ' id="chat-stream"' : ""}>${t.role === "user" ? esc(t.content) : t.content ? fmtAI(t.content) : '<span class="muted">Думаю…</span>'}</div>`).join("");
    return head + switcher + `${c.turns.length ? `<section class="chat" aria-live="polite">${bubbles}</section>` : `<div class="suggest">${sugg.map((s) => `<button type="button" data-a="chat-suggest" data-text="${esc(s)}">${esc(s)}</button>`).join("")}</div>`}
      ${c.error ? `<div class="notice">${esc(c.error)}</div>` : ""}
      <form class="composer" data-f="chat">
        <label class="sr" for="chat-input">Вопрос репетитору</label>
        <textarea class="textarea" id="chat-input" rows="2" maxlength="6000" placeholder="Напиши вопрос ${esc(SUBJ[c.sid] ? SUBJ[c.sid].po : "")} или вставь сочинение…">${esc(c.draft)}</textarea>
        ${c.busy ? `<button class="btn ghost" type="button" data-a="chat-stop">${icon("stop")}Стоп</button>` : `<button class="btn" type="submit">Отправить</button>`}
      </form>
      ${c.turns.length && !c.busy ? '<div><button type="button" class="link-btn" data-a="chat-clear">Начать новый разговор</button></div>' : ""}`;
  }

  // ---------- сочинение ----------
  const ESSAY_LS = "vektor-ege:essay";
  const LEGACY_ESSAY_LS = "put-v-medicinu:essay";
  const ESSAY_K = [["К1", 1, "Позиция автора"], ["К2", 3, "Комментарий"], ["К3", 2, "Своё отношение и аргумент"], ["К4", 1, "Фактическая точность"], ["К5", 2, "Логичность"], ["К6", 1, "Этика"], ["К7", 3, "Орфография"], ["К8", 3, "Пунктуация"], ["К9", 3, "Грамматика"], ["К10", 3, "Речевые нормы"]];
  let essayTimer = null;
  function essayState() {
    if (!ui.essay) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem(ESSAY_LS) || localStorage.getItem(LEGACY_ESSAY_LS) || "null"); } catch (e) { /* хранилище браузера недоступно */ }
      ui.essay = Object.assign({ tid: EGE.essay.texts[0].id, own: { text: "", problem: "" }, body: "", editId: null }, saved || {},
        { tab: "write", checks: {}, ai: null, showPos: false, confirmClear: false });
    }
    return ui.essay;
  }
  function essayDraftLater() {
    clearTimeout(essayTimer);
    essayTimer = setTimeout(() => {
      const e = ui.essay;
      try {
        localStorage.setItem(ESSAY_LS, JSON.stringify({ tid: e.tid, own: e.own, body: e.body, editId: e.editId }));
        localStorage.removeItem(LEGACY_ESSAY_LS);
      } catch (err) { /* хранилище браузера недоступно */ }
    }, 600);
  }
  // Слова считаются как в ЕГЭ: служебные тоже, слово через дефис — одно.
  function wordCount(s) { return (String(s || "").match(/[A-Za-zА-Яа-яЁё0-9]+(?:-[A-Za-zА-Яа-яЁё0-9]+)*/g) || []).length; }
  function essayText(e) {
    if (e.tid === "own") return { id: "own", own: true, title: "Свой текст", problem: e.own.problem || "", body: e.own.text || "" };
    return EGE.essay.texts.find((t) => t.id === e.tid) || EGE.essay.texts[0];
  }
  function essays() {
    const m = (store.docs.essays && store.docs.essays.e) || {};
    return Object.keys(m).filter((k) => m[k] && m[k].body).map((k) => Object.assign({ id: k }, m[k])).sort((a, b) => (b.at || 0) - (a.at || 0));
  }
  function paras(text) { return String(text || "").split(/\n+/).filter((x) => x.trim()).map((x) => `<p>${esc(x)}</p>`).join(""); }
  function countChip(w) {
    const cls = w < 150 ? "bad" : w < 200 ? "warn" : "good";
    return `<span id="essay-count" class="chip ${cls} num">${w} ${plural(w, "слово", "слова", "слов")}</span>`;
  }
  function paintEssayCount() {
    const el = document.getElementById("essay-count");
    if (el) el.outerHTML = countChip(wordCount(ui.essay.body));
  }
  function saveEssay(extra) {
    const e = essayState(), T = essayText(e);
    if (!e.body.trim()) { toast("Сочинение пока пустое"); return null; }
    const id = e.editId || newId();
    const scored = e.ai && e.ai.status === "done" && e.ai.forHash === hash(e.body) ? e.ai.res : null;
    const rec = { d: todayISO(), tid: e.tid, title: T.title, problem: T.problem || "", body: e.body.slice(0, 12000), w: wordCount(e.body), at: Date.now(),
      sc: scored ? scored.total : null, k: scored ? Object.fromEntries(scored.k.map((c) => [c.id, c.p])) : null, adv: scored ? scored.advice : null,
      src: e.tid === "own" ? String(e.own.text || "").slice(0, 12000) : null };
    patchDoc("essays", { e: { [id]: Object.assign(rec, extra || {}) } });
    markPlanPrep("rus", "Написано сочинение");
    e.editId = id; essayDraftLater();
    return id;
  }
  function validateEssayCheck(data, words) {
    const arr = data && Array.isArray(data.k) ? data.k : null;
    if (!arr) return null;
    const k = ESSAY_K.map(([id, max, name]) => {
      const x = arr.find((y) => y && String(y.id).replace(/K/g, "К").replace(/\s/g, "") === id) || {};
      const p = Math.round(Number(x.p));
      return { id, name, max, p: Number.isFinite(p) ? Math.max(0, Math.min(max, p)) : 0, note: String(x.note || "").slice(0, 400) };
    });
    if (k[0].p === 0) { k[1].p = 0; k[2].p = 0; } // без позиции автора комментарий и своё отношение не засчитываются
    if (words < 150) k.forEach((c) => { c.p = 0; });
    const errors = (Array.isArray(data.errors) ? data.errors : []).filter((x) => x && x.quote).slice(0, 30)
      .map((x) => ({ type: String(x.type || ""), quote: String(x.quote).slice(0, 200), fix: String(x.fix || "").slice(0, 300) }));
    return { k, errors, advice: String(data.advice || "").slice(0, 1200), total: k.reduce((s, c) => s + c.p, 0) };
  }
  async function checkEssay() {
    const e = essayState();
    if (!ai.fn) return;
    const T = essayText(e), w = wordCount(e.body);
    if (w < 30) { toast("Сначала напиши сочинение"); return; }
    if (T.own && (!T.body.trim() || !T.problem.trim())) { toast("Вставь исходный текст и проблему из задания"); return; }
    if (e.ai && e.ai.ctl) e.ai.ctl.abort();
    const st = (e.ai = { status: "busy", ctl: new AbortController(), forHash: hash(e.body), res: null, error: "" });
    scheduleRender();
    const prompt = [
      "Ты — эксперт ЕГЭ по русскому языку. Проверь сочинение (задание 27) по критериям ФИПИ 2026 года строго, как на экзамене.",
      "",
      "Задание: Напишите сочинение-рассуждение по проблеме, поставленной в исходном тексте: «" + T.problem + "». Сформулируйте позицию автора (рассказчика) по указанной проблеме. Прокомментируйте, как в тексте раскрывается эта позиция: включите в комментарий два примера-иллюстрации из прочитанного текста, важные для понимания позиции автора, поясните их, укажите и поясните смысловую связь между ними. Сформулируйте и обоснуйте своё отношение к позиции автора, включите в обоснование пример-аргумент из читательского, историко-культурного или жизненного опыта (примеры из комиксов, аниме, манги, фанфиков, графических романов, компьютерных игр не учитываются). Объём — не менее 150 слов.",
      "",
      "Критерии и максимальные баллы:",
      "К1 (1) — позиция автора по указанной проблеме сформулирована верно.",
      "К2 (3) — комментарий: 3 — два примера-иллюстрации с пояснениями, смысловая связь указана и пояснена; 2 — два примера с пояснениями, но связь не указана или не пояснена; 1 — один пример с пояснением; 0 — примеров нет, они без пояснений, не относятся к позиции автора или текст пересказан.",
      "К3 (2) — своё отношение к позиции автора: 2 — сформулировано и обосновано подходящим примером-аргументом; 1 — сформулировано, но пример-аргумент отсутствует или не подходит; 0 — отношения нет.",
      "Если по К1 стоит 0, то по К2 и К3 тоже 0.",
      "К4 (1) — нет фактических ошибок (имена, названия, даты, события, содержание произведений).",
      "К5 (2) — логичность: 2 — нет логических ошибок и нарушений абзацного членения; 1 — одна-две логические ошибки; 0 — три и больше.",
      "К6 (1) — соблюдены этические нормы.",
      "К7 орфография, К8 пунктуация, К9 грамматика, К10 речевые нормы — по 3 балла: 3 — ошибок нет; 2 — одна-две; 1 — три-четыре; 0 — пять и больше.",
      "",
      "Исходный текст:",
      T.body,
      "",
      "Сочинение (слов: " + w + "):",
      e.body,
      "",
      'Ответь только JSON без текста вокруг: {"k":[{"id":"К1","p":0,"note":"кратко, за что поставлен балл"}, … все десять критериев К1–К10 …],"errors":[{"type":"орфография|пунктуация|грамматика|речь|логика|факт","quote":"фрагмент из сочинения с ошибкой","fix":"как исправить"}],"advice":"два-три главных совета, что улучшить"}',
      "Пиши по-русски, обращайся на «ты», не угадывай пол автора сочинения. Перечисли все найденные ошибки."
    ].join("\n");
    try {
      const data = await ai.fn.json(prompt, { signal: st.ctl.signal, cache: false, modelTier: "complex" });
      const res = validateEssayCheck(data, w);
      if (!res) throw { code: "invalid_json" };
      if (e.ai !== st) return;
      st.status = "done"; st.res = res; st.ctl = null;
      saveEssay();
      toast("Проверено и сохранено в «Мои сочинения»");
    } catch (err) {
      if (e.ai !== st) return;
      if (err && err.code === "cancelled") ui.essay.ai = null;
      else { st.status = "error"; st.error = aiErrorText(err); st.ctl = null; }
    }
    scheduleRender();
  }
  function essayAIBlock(e) {
    const st = e.ai;
    if (!st) return "";
    if (st.status === "busy") return `<section class="card stack"><div class="row between"><h2 class="h2">Проверка по критериям</h2><button type="button" class="link-btn" data-a="essay-stop">Остановить</button></div><div class="hint">ИИ читает текст и сочинение и выставляет баллы по К1–К10. Это занимает до минуты.</div></section>`;
    if (st.status === "error") return `<div class="notice">${esc(st.error)}</div>`;
    const r = st.res, stale = st.forHash !== hash(e.body);
    return `<section class="card stack">
      <div class="row between"><h2 class="h2">Проверка по критериям</h2><span class="chip ${r.total >= 19 ? "good" : r.total >= 14 ? "warn" : "bad"} num">${r.total} из 22</span></div>
      ${stale ? '<div class="hint">После проверки сочинение изменилось — нажми «Проверить» ещё раз, чтобы получить новую оценку.</div>' : ""}
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Критерий</th><th>Баллы</th><th>Комментарий</th></tr></thead><tbody>
        ${r.k.map((c) => `<tr><td><b>${c.id}</b> ${esc(c.name)}</td><td class="num">${c.p} из ${c.max}</td><td class="small ink2">${esc(c.note)}</td></tr>`).join("")}
      </tbody></table></div>
      ${r.errors.length ? `<div class="label">Ошибки</div><div class="review-list">${r.errors.map((x) => `<div class="review-item"><div class="small muted">${esc(x.type)}</div><div>«${esc(x.quote)}»</div>${x.fix ? `<div class="small"><b>Как исправить:</b> ${esc(x.fix)}</div>` : ""}</div>`).join("")}</div>` : ""}
      ${r.advice ? `<div class="ai-box"><span class="eyebrow">Что улучшить</span><div class="ai-text">${fmtAI(r.advice)}</div></div>` : ""}
      <p class="hint">Оценка ИИ примерная: на экзамене сочинение проверяют два эксперта по критериям ФИПИ. Ошибки, которые нашёл ИИ, перепроверяй по правилам.</p>
    </section>`;
  }
  function viewEssay() {
    const E = EGE.essay;
    if (!E) { ui.view = "subject"; return viewSubject(); }
    const e = essayState(), T = essayText(e), mine = essays();
    const tabs = [["write", "Писать"], ["plan", "План, клише, образец"], ["args", "Аргументы"], ["mine", "Мои сочинения" + (mine.length ? " · " + mine.length : "")]];
    const head = `<div><button type="button" class="link-btn" data-a="go" data-v="subject" data-sid="rus">← Русский язык</button></div>
      <div class="head"><div class="eyebrow">Задание 27 · до 22 баллов</div><h1 class="h1">Тренажёр сочинения</h1><p class="lead">Формат 2026 года: проблема дана в задании. Сформулируй позицию автора, прокомментируй её двумя примерами из текста со смысловой связью и обоснуй своё отношение примером-аргументом. Не меньше 150 слов.</p></div>
      <div class="switch" role="group" aria-label="Раздел">${tabs.map(([k, l]) => `<button type="button" data-a="essay-tab" data-tab="${k}" aria-pressed="${e.tab === k}">${esc(l)}</button>`).join("")}</div>`;
    if (e.tab === "plan") return head + essayPlanTab(E);
    if (e.tab === "args") return head + essayArgsTab(E);
    if (e.tab === "mine") return head + essayMineTab(mine);
    const w = wordCount(e.body), checked = E.checklist.filter((x, i) => e.checks[i]).length;
    const src = T.own
      ? `<div class="field"><label for="essay-problem">Проблема из задания</label><input class="input" id="essay-problem" maxlength="300" placeholder="Например: «Что даёт человеку чтение?»" value="${esc(e.own.problem)}"></div>
         <div class="field"><label for="essay-src">Исходный текст</label><textarea class="textarea" id="essay-src" rows="8" maxlength="12000" placeholder="Вставь текст из открытого банка ФИПИ или из варианта">${esc(e.own.text)}</textarea></div>`
      : `<div class="well"><span class="eyebrow">Проблема из задания</span><div class="h3">${esc(T.problem)}</div></div>
         <div class="passage"><div class="eyebrow">Текст · «${esc(T.title)}»</div>${paras(T.body)}</div>
         <div>${e.showPos ? `<div class="ai-box"><span class="eyebrow">Позиция автора</span><div>${esc(T.position)}</div></div>` : `<button type="button" class="link-btn" data-a="essay-pos">Сверить позицию автора (после того как сформулируешь свою)</button>`}</div>`;
    return head + `
      <section class="card stack">
        <h2 class="h2">Исходный текст</h2>
        <div class="switch" role="group" aria-label="Текст">${E.texts.map((t) => `<button type="button" data-a="essay-text" data-id="${t.id}" aria-pressed="${e.tid === t.id}">${esc(t.title)}</button>`).join("")}<button type="button" data-a="essay-text" data-id="own" aria-pressed="${e.tid === "own"}">Свой текст</button></div>
        ${src}
      </section>
      <section class="card stack">
        <div class="row between"><h2 class="h2">Сочинение</h2>${countChip(w)}</div>
        <label class="sr" for="essay-body">Текст сочинения</label>
        <textarea class="textarea essay-area" id="essay-body" maxlength="12000" placeholder="Начни со вступления, которое подводит к проблеме…">${esc(e.body)}</textarea>
        <p class="hint">Минимум 150 слов, оптимально 200–300. Черновик сохраняется в этом браузере; кнопка «Сохранить» переносит сочинение в «Мои сочинения» — оно будет доступно на любом компьютере.</p>
        <div class="row">
          <button type="button" class="btn" data-a="essay-save">Сохранить</button>
          ${ai.state === "ready" ? `<button type="button" class="btn soft" data-a="essay-check"${e.ai && e.ai.status === "busy" ? " disabled" : ""}>${icon("spark")}Проверить по критериям</button>` : ""}
          ${e.confirmClear
            ? `<span class="row" style="gap:12px"><button type="button" class="link-btn" style="color:var(--bad)" data-a="essay-clear">Очистить поле</button><button type="button" class="link-btn" data-a="essay-clear-cancel">Отмена</button></span>`
            : `<button type="button" class="btn ghost" data-a="essay-clear-ask">Новое сочинение</button>`}
        </div>
        ${ai.state === "off" ? `<div class="hint">${store.backend ? (!store.user ? "Проверка ИИ доступна после входа в аккаунт." : "Проверка ИИ заработает, когда на сервере будет настроен ключ ИИ.") : "Проверка ИИ работает, когда сайт открыт на claude.ai и разрешено обращение к Claude."}</div>` : ""}
      </section>
      ${essayAIBlock(e)}
      <section class="card stack">
        <div class="row between"><h2 class="h2">Самопроверка</h2><span class="small muted num">${checked} из ${E.checklist.length}</span></div>
        <div class="checklist">${E.checklist.map((x, i) => `<label><input type="checkbox" class="check" data-c="essay-check" data-i="${i}"${e.checks[i] ? " checked" : ""}><span>${esc(x)}</span></label>`).join("")}</div>
      </section>`;
  }
  function essayPlanTab(E) {
    const s = E.sample, st = E.texts.find((t) => t.id === s.textId);
    return `<section class="card pad-lg stack"><h2 class="h2">План на 200–250 слов</h2>
        <ol class="plan-list">
          <li><b>Вступление</b> — 1–2 предложения, подводящие к проблеме.</li>
          <li><b>Позиция автора</b> по проблеме из задания — своими словами (К1).</li>
          <li><b>Пример 1</b> из текста с номером предложения или цитатой и пояснение: «Этот пример показывает…» (К2).</li>
          <li><b>Пример 2</b> и пояснение (К2).</li>
          <li><b>Смысловая связь</b> между примерами — назови и объясни (К2).</li>
          <li><b>Своё отношение</b> к позиции автора и пример-аргумент из книги, истории или жизни (К3).</li>
          <li><b>Вывод</b> — 1–2 предложения.</li>
        </ol></section>
      <section class="card stack"><h2 class="h2">Клише</h2>
        ${E.cliches.map((c) => `<div class="stack" style="gap:6px"><div class="label">${esc(c.part)}</div><ul class="theory">${c.items.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("")}
      </section>
      <section class="card stack"><div class="row between"><h2 class="h2">Образец по тексту «${esc(st ? st.title : "")}»</h2><span class="chip num">${wordCount(s.body)} слов</span></div>
        <div class="well"><span class="eyebrow">Проблема</span><div>${esc(st ? st.problem : "")}</div></div>
        <div class="essay-sample">${paras(s.body)}</div>
        <div class="label">Почему это сочинение получает высокие баллы</div>
        <ul class="theory">${s.notes.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </section>`;
  }
  function essayArgsTab(E) {
    return `<p class="hint">Для К3 нужен пример-аргумент из читательского, историко-культурного или жизненного опыта. Выбери заранее 5–6 произведений и перечитай их краткое содержание: за ошибку в имени, названии или сюжете снимают балл по К4.</p>
      ${E.args.map((g) => `<section class="card stack"><h2 class="h2">${esc(g.theme)}</h2><div class="stack">${g.items.map((x) => `<div><div class="entry-title">${esc(x.src)}</div><div class="small ink2">${esc(x.text)}</div></div>`).join("")}</div></section>`).join("")}`;
  }
  function essayMineTab(list) {
    if (!list.length) return `<div class="empty"><b>Пока нет сохранённых сочинений</b><span>Напиши первое на вкладке «Писать» и нажми «Сохранить» или «Проверить по критериям».</span></div>`;
    return `<section class="card stack"><div class="entries">${list.map((x) => `<div class="entry">
        <span class="entry-date">${esc(dateShort(x.d))}</span>
        <div class="entry-main"><span class="entry-title">${esc(x.title || "Сочинение")}</span><span class="entry-sub">${esc(x.problem || "")} · ${x.w || 0} ${plural(x.w || 0, "слово", "слова", "слов")}${x.sc != null ? " · ИИ: " + x.sc + " из 22" : ""}</span></div>
        <span class="row" style="gap:10px"><button type="button" class="link-btn" data-a="essay-open" data-id="${esc(x.id)}">Открыть</button>${delControl("essay:" + x.id, "del-essay", `data-id="${esc(x.id)}"`)}</span>
      </div>`).join("")}</div></section>`;
  }

  function registerActions(ACTIONS) {
    Object.assign(ACTIONS, {
    "guide-sid": (el) => { ui.guideSid = el.dataset.sid || "all"; scheduleRender(); },
    "guide-clear": () => { ui.guideQ = ""; ui.focusNext = "guide-q"; scheduleRender(); },
    "guide-chip": (el) => { ui.guideQ = el.dataset.q || ""; scheduleRender(); },
    "essay-tab": (el) => { essayState().tab = el.dataset.tab; scheduleRender(true); },
    "essay-text": (el) => { const e = essayState(); if (e.tid === el.dataset.id) return; e.tid = el.dataset.id; e.editId = null; e.showPos = false; e.ai = null; essayDraftLater(); scheduleRender(); },
    "essay-pos": () => { essayState().showPos = true; scheduleRender(); },
    "essay-save": () => { if (saveEssay()) toast("Сохранено в «Мои сочинения»"); },
    "essay-check": () => checkEssay(),
    "essay-stop": () => { const e = essayState(); if (e.ai && e.ai.ctl) e.ai.ctl.abort(); },
    "essay-clear-ask": () => { essayState().confirmClear = true; scheduleRender(); },
    "essay-clear-cancel": () => { essayState().confirmClear = false; scheduleRender(); },
    "essay-clear": () => {
      const e = essayState();
      Object.assign(e, { body: "", editId: null, ai: null, checks: {}, showPos: false, confirmClear: false });
      essayDraftLater(); ui.focusNext = "essay-body"; scheduleRender();
    },
    "essay-open": (el) => {
      const x = essays().find((r) => r.id === el.dataset.id), e = essayState();
      if (!x) return;
      const own = !EGE.essay.texts.some((t) => t.id === x.tid);
      Object.assign(e, { tid: own ? "own" : x.tid, body: x.body, editId: x.id, ai: null, checks: {}, showPos: false, tab: "write" });
      if (own) e.own = { text: x.src || "", problem: x.problem || "" };
      essayDraftLater(); scheduleRender(true);
    },
    "del-essay": (el) => {
      patchDoc("essays", { e: { [el.dataset.id]: null } });
      if (ui.essay && ui.essay.editId === el.dataset.id) ui.essay.editId = null;
      ui.confirmDel = null;
    },
    });
  }

  EGE.views = EGE.views || {};
  EGE.views.essayGuide = {
    configure,
    registerActions,
    checkEssay,
    essayDraftLater,
    essayState,
    essays,
    paintEssayCount,
    saveEssay,
    viewEssay,
    viewGuide,
    viewTutor
  };
})();
