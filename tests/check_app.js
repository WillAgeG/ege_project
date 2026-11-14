/* Behavioral & bank-integrity smoke test for both `jsc` and `node`. */
(function () {
  "use strict";

  const isNode = typeof require === "function" && typeof process !== "undefined" && !!(process.versions && process.versions.node);
  const readFileText = (p) => (isNode ? require("fs").readFileSync(p, "utf8") : read(p));
  const out = (msg) => (isNode ? console.log(msg) : print(msg));
  const vmRun = isNode ? require("vm").runInThisContext : (code, file) => eval(code);

  function assert(cond, msg) {
    if (!cond) throw new Error("ASSERTION FAILED: " + msg);
  }

  function installGlobals(opts) {
    opts = opts || {};
    const g = typeof globalThis !== "undefined" ? globalThis : this;
    const elements = new Map();
    const docListeners = {};
    const winListeners = {};
    const lsMap = Object.assign({}, opts.localStorage || {});

    function makeEl(id) {
      return {
        id: id || "",
        innerHTML: "",
        textContent: "",
        value: "",
        hidden: false,
        disabled: false,
        dataset: {},
        style: {},
        scrollTop: 0,
        focus() {},
        setSelectionRange() {},
        getContext() {
          const ctx = {
            save() {}, restore() {}, clearRect() {}, beginPath() {}, moveTo() {}, lineTo() {},
            stroke() {}, fill() {}, arc() {}, fillRect() {}, fillText() {}, strokeRect() {},
            setLineDash() {}, scale() {}, measureText(s) { return { width: String(s || "").length * 6 }; }
          };
          return ctx;
        },
        getBoundingClientRect() { return { width: 600, height: 200 }; },
        querySelector(sel) {
          if (sel === "span") return this._span || (this._span = { textContent: "" });
          return null;
        },
        querySelectorAll() { return []; },
        closest() { return null; }
      };
    }

    for (const id of ["main", "side-nav", "side-subjects", "side-foot", "tabbar", "toast", "tip", "modal-root", "bug-mailto"]) {
      elements.set(id, makeEl(id));
    }

    g.AbortController = function AbortController() {
      const listeners = [];
      this.signal = {
        aborted: false,
        addEventListener(ev, fn) { if (ev === "abort") listeners.push(fn); },
        removeEventListener(ev, fn) {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        }
      };
      this.abort = () => {
        if (this.signal.aborted) return;
        this.signal.aborted = true;
        listeners.slice().forEach((fn) => fn());
      };
    };

    g.TextDecoder = function TextDecoder() {
      this.decode = function (bytes) {
        if (!bytes) return "";
        if (typeof bytes === "string") return bytes;
        let outStr = "";
        let i = 0;
        while (i < bytes.length) {
          const c = bytes[i++];
          if (c < 128) outStr += String.fromCharCode(c);
          else if (c < 224) outStr += String.fromCharCode(((c & 31) << 6) | (bytes[i++] & 63));
          else if (c < 240) outStr += String.fromCharCode(((c & 15) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63));
          else {
            const cp = ((c & 7) << 18) | ((bytes[i++] & 63) << 12) | ((bytes[i++] & 63) << 6) | (bytes[i++] & 63);
            outStr += String.fromCodePoint(cp);
          }
        }
        return outStr;
      };
    };

    g.TextEncoder = function TextEncoder() {
      this.encode = function (str) {
        const s = unescape(encodeURIComponent(String(str)));
        const arr = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
        return arr;
      };
    };

    g.localStorage = {
      getItem(k) { return Object.prototype.hasOwnProperty.call(lsMap, k) ? lsMap[k] : null; },
      setItem(k, v) { lsMap[k] = String(v); },
      removeItem(k) { delete lsMap[k]; },
      _dump() { return lsMap; }
    };

    g.location = { hash: opts.hash || "", search: opts.search || "", pathname: "/" };
    g.history = {
      replaceState(_s, _t, u) {
        if (typeof u === "string") {
          if (u.startsWith("#")) g.location.hash = u;
          else if (!u.includes("?")) g.location.search = "";
        }
      }
    };
    g.matchMedia = () => ({ matches: false, addEventListener() {} });
    if (typeof g.clearTimeout === "undefined") g.clearTimeout = () => {};
    if (typeof g.console === "undefined") g.console = { log: out, warn() {}, error: out };

    g.document = {
      visibilityState: "visible",
      activeElement: null,
      body: makeEl("body"),
      documentElement: { dataset: {}, style: {} },
      querySelector(sel) {
        if (sel && sel[0] === "#") return elements.get(sel.slice(1)) || null;
        return null;
      },
      querySelectorAll(sel) {
        if (sel === ".sync") return [elements.get("side-foot").querySelector("span") ? { dataset: {}, querySelector: () => elements.get("side-foot").querySelector("span") } : null].filter(Boolean);
        return [];
      },
      getElementById(id) { return elements.get(id) || null; },
      addEventListener(ev, fn) { (docListeners[ev] || (docListeners[ev] = [])).push(fn); }
    };

    g.window = g;
    g.window.scrollTo = () => {};
    g.window.addEventListener = (ev, fn) => { (winListeners[ev] || (winListeners[ev] = [])).push(fn); };
    g.devicePixelRatio = 1;
    g.EGE_HOST = opts.host;
    g.claude = opts.claude;
    g.fetch = opts.fetch;

    return {
      elements,
      lsMap,
      body: g.document.body,
      location: g.location,
      emitDoc(ev, payload) { (docListeners[ev] || []).forEach((fn) => fn(payload)); }
    };
  }

  function loadScripts(paths) {
    const g = typeof globalThis !== "undefined" ? globalThis : this;
    g.EGE = { subjects: [], tableEdits: [], plan: null, essay: null };
    for (const p of paths) vmRun(readFileText(p), p);
  }

  function parseHtmlScripts() {
    const html = readFileText("index.html");
    const matches = [];
    const re = /<script\s+src="([^"]+)">/g;
    let m;
    while ((m = re.exec(html)) !== null) matches.push(m[1]);
    return matches;
  }

  async function flushMicrotasks(rounds) {
    for (let i = 0; i < (rounds || 8); i++) await Promise.resolve();
  }

  async function main() {
    const scripts = parseHtmlScripts();
    assert(scripts.length >= 30 && scripts[scripts.length - 1] === "app.js", "expected index.html scripts");
    const dataScripts = scripts.filter((s) => s !== "app.js");

    // 1. Проверка банка и режима локального браузера (включая чтение legacy-ключа)
    const env1 = installGlobals({
      localStorage: {
        "put-v-medicinu:v1": JSON.stringify({
          profile: { name: "Саша", exists: true, targets: { bio: 80, chem: 75, rus: 85 } }
        })
      }
    });
    loadScripts(dataScripts);
    const bank = globalThis.EGE.loadBank();
    assert(Object.keys(bank.SUBJ).length === 3, "expected 3 subjects (bio, rus, chem)");
    assert(Object.keys(bank.TOPICS).length > 30, "expected many topics");
    assert(Object.keys(bank.QS).length > 100, "expected loaded question bank");

    vmRun(readFileText("tools/bank-tools.js"), "tools/bank-tools.js");
    const report = globalThis.EGE.bankTools.checkBank(bank);
    const badSelfTest = globalThis.EGE.bankTools.selfTest(bank);
    const bankErrors = report.issues.filter((x) => x.lv === "error");
    const bankWarns = report.issues.filter((x) => x.lv === "warn");
    assert(bankErrors.length === 0, "expected 0 checkBank errors: " + JSON.stringify(bankErrors));
    assert(bankWarns.length === 0, "expected 0 checkBank warnings: " + JSON.stringify(bankWarns));
    assert(badSelfTest.length === 0, "expected 0 bankTools selfTest issues: " + JSON.stringify(badSelfTest));
    assert(readFileText("app.js").replace(/\r\n/g, "").indexOf("\n") === -1, "expected CRLF line endings in app.js");

    for (const sid of Object.keys(bank.SUBJ)) {
      for (const t of bank.SUBJ[sid].topicList) {
        for (const q of t.q) {
          if (q.t !== "match") continue;
          assert(new Set(q.l.map((x) => String(x).trim().toLowerCase())).size === q.l.length, "duplicate left match labels in " + sid + "/" + t.id);
          assert(new Set(q.r.map((x) => String(x).trim().toLowerCase())).size === q.r.length, "duplicate right match labels in " + sid + "/" + t.id);
        }
      }
    }
    for (const q of bank.TOPICS["c5-1"].q) {
      if (String(q.q).includes("упарили")) {
        const w = parseFloat(String(q.a[0]).replace(",", "."));
        assert(w > 0 && w <= 55, "expected realistic c5-1 evaporation concentration <= 55%, got " + q.a[0]);
      }
    }
    const rusSlot22 = bank.SUBJ.rus.variant.slots.find((sl) => sl.n === 22);
    const rusSlots23_26 = bank.SUBJ.rus.variant.slots.find((sl) => Array.isArray(sl.n) && sl.n.join(",") === "23,24,25,26");
    assert(rusSlot22 && rusSlot22.topic === "r5-1", "expected Russian variant slot 22 mapped to r5-1");
    assert(rusSlots23_26 && rusSlots23_26.topic === "r0-2", "expected Russian variant slots 23-26 mapped to r0-2");
    assert(bank.SUBJ.rus.variant.two.includes(22), "expected Russian #22 worth 2 primary points");
    const r51Ege = bank.TOPICS["r5-1"].q.filter((q) => q.ege);
    assert(r51Ege.length >= 6 && r51Ege.every((q) => q.t === "match" && q.l.length === 5 && q.r.length === 9), "expected authentic 5-row ege #22 questions in r5-1");
    vmRun(readFileText("app.js"), "app.js");
    await flushMicrotasks(12);
    const main1 = env1.elements.get("main").innerHTML;
    assert(main1.includes("Привет, Саша!"), "local legacy migration home greeting missing");
    assert(main1.includes("Данные сохраняются только в этом браузере"), "local notice missing");
    assert(!!env1.lsMap["vektor-ege:v1"], "expected new localStorage key written");
    assert(!env1.lsMap["put-v-medicinu:v1"], "expected legacy localStorage key cleaned up");

    // 2. Проверка бэкенд-режима: неавторизованный старт -> регистрация с миграцией -> ИИ стрим -> выход
    const serverDocs = {};
    const requests = [];
    const enc = new (installGlobals({}).TextEncoder || globalThis.TextEncoder)();
    let authedUser = null;

    const env2 = installGlobals({
      host: { backend: true },
      localStorage: {
        "vektor-ege:v1": JSON.stringify({
          profile: { name: "Оля", exists: true, targets: { bio: 88, chem: 82, rus: 90 } }
        })
      },
      fetch: async (url, init) => {
        init = init || {};
        requests.push({ url, method: init.method || "GET", body: init.body || null });
        const mkRes = (status, jsonObj) => ({
          ok: status >= 200 && status < 300,
          status,
          headers: { get: () => "application/json" },
          json: async () => jsonObj
        });
        if (url === "/api/me") {
          return mkRes(200, {
            user: authedUser,
            ai: { enabled: true, provider: "gemini" },
            inviteRequired: true,
            providers: { local: true, google: true }
          });
        }
        if (url === "/api/auth/register") {
          const body = JSON.parse(init.body);
          if (body.inviteCode !== "MED") return mkRes(403, { detail: { code: "invalid_invite", message: "Неверный код приглашения." } });
          authedUser = {
            id: 7,
            username: body.username,
            displayName: body.displayName || body.username,
            email: body.email || null,
            authProvider: "local"
          };
          return mkRes(200, { user: authedUser });
        }
        if (url === "/api/auth/logout") {
          authedUser = null;
          return mkRes(200, { ok: true });
        }
        if (url.startsWith("/api/docs/")) {
          if (!authedUser) return mkRes(401, { detail: { code: "session_expired", message: "Нужно войти" } });
          const docName = decodeURIComponent(url.slice("/api/docs/".length));
          const method = init.method || "GET";
          if (method === "PUT") serverDocs[docName] = JSON.parse(init.body);
          else if (method === "PATCH") serverDocs[docName] = Object.assign({}, serverDocs[docName] || {}, JSON.parse(init.body));
          return mkRes(200, { ok: true });
        }
        if (url === "/api/docs") {
          if (!authedUser) return mkRes(401, { detail: { code: "session_expired", message: "Нужно войти" } });
          return mkRes(200, { docs: serverDocs });
        }
        if (url === "/api/ai") {
          const payload = JSON.parse(init.body);
          if (payload.mode === "json") {
            return mkRes(200, { data: [{ t: "single", q: "Вопрос?", o: ["А", "Б", "В", "Г"], a: 0, e: "Пояснение" }] });
          }
          const sseBytes = [
            enc.encode('data: {"delta":"Осмос — "}\n\n'),
            enc.encode('data: {"delta":"это диффузия воды."}\n\n'),
            enc.encode('data: {"done":true}\n\n')
          ];
          let idx = 0;
          return {
            ok: true,
            status: 200,
            headers: { get: () => "text/event-stream" },
            body: {
              getReader() {
                return {
                  cancel() {},
                  async read() {
                    if (idx < sseBytes.length) return { value: sseBytes[idx++], done: false };
                    return { value: undefined, done: true };
                  }
                };
              }
            }
          };
        }
        return mkRes(404, { detail: "not found" });
      }
    });

    loadScripts(dataScripts);
    vmRun(readFileText("app.js"), "app.js");
    await flushMicrotasks(20);
    const homePreLogin = env2.elements.get("main").innerHTML;
    assert(env2.body.dataset.auth === "1", "expected auth gate body flag before login");
    assert(homePreLogin.includes("Вектор ЕГЭ") && homePreLogin.includes("brand-mark"), "expected new brand name and SVG logo on auth screen");
    assert(!homePreLogin.includes("Тесты бесплатно") && !homePreLogin.includes("Начать тесты ЕГЭ бесплатно") && !homePreLogin.includes("Открыть тренажёр ЕГЭ без оплаты"), "should not show free tests CTAs on landing");
    assert(!homePreLogin.includes('data-f="auth"') && !homePreLogin.includes("Продолжить без аккаунта"), "should not embed inline login card or guest link on landing");
    assert(homePreLogin.includes('data-a="auth-modal-open"') && homePreLogin.includes("Войти"), "expected single Войти modal trigger on landing");
    assert(!homePreLogin.includes("Путь в медицину") && !homePreLogin.includes("СВФУ"), "should not show old medical branding");
    assert(!homePreLogin.includes("Давай настроим подготовку"), "should not show onboarding before login on backend");

    // Кнопка «Войти» открывает модалку авторизации
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-modal-open" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const modalPre = env2.elements.get("modal-root").innerHTML;
    assert(modalPre.includes("Продолжить через Google") && modalPre.includes("Вход в аккаунт"), "expected Google OAuth button and login form in auth modal");

    // Переключаемся на регистрацию
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-tab", tab: "register" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const regHtml = env2.elements.get("modal-root").innerHTML;
    assert(regHtml.includes("Код приглашения"), "expected invite code field on register tab");
    assert(regHtml.includes("Перенести текущий прогресс"), "expected local migration checkbox");

    // Несовпадающие пароли отклоняются на клиенте без запроса
    env2.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: {
            displayName: { value: "Оля" },
            username: { value: "olya" },
            email: { value: "olya@example.com" },
            password: { value: "secret123" },
            password2: { value: "wrong" },
            invite: { value: "MED" },
            migrate: { checked: true }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    assert(env2.elements.get("modal-root").innerHTML.includes("Пароли не совпадают"), "expected password mismatch error");

    // Ошибочный код инвайта не падает и показывает ошибку
    env2.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: {
            displayName: { value: "Оля" },
            username: { value: "olya" },
            email: { value: "olya@example.com" },
            password: { value: "secret123" },
            password2: { value: "secret123" },
            invite: { value: "BAD" },
            migrate: { checked: true }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(15);
    assert(env2.elements.get("modal-root").innerHTML.includes("Неверный код приглашения"), "expected invite error rendered");

    // Верная регистрация -> миграция + вход + загрузка профиля Оли
    env2.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: {
            displayName: { value: "Оля" },
            username: { value: "olya" },
            email: { value: "olya@example.com" },
            password: { value: "secret123" },
            password2: { value: "secret123" },
            invite: { value: "MED" },
            migrate: { checked: true }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(30);
    assert(authedUser && authedUser.username === "olya", "expected authenticated user");
    assert(!env2.body.dataset.auth, "expected auth gate flag cleared after registration");
    assert(serverDocs.profile && serverDocs.profile.name === "Оля", "expected migrated profile on server");
    assert(!env2.lsMap["vektor-ege:v1"], "expected localStorage cleared after migration");
    const homeAuthed = env2.elements.get("main").innerHTML;
    assert(homeAuthed.includes("Привет, Оля!"), "expected personalized greeting after login");
    assert(!homeAuthed.includes("Лечебное дело") && !homeAuthed.includes("СВФУ"), "expected universal 3-subject copy without medical uni");
    assert(env2.elements.get("side-foot").innerHTML.includes("Оля"), "expected sidebar user name");

    // Репетитор доступен и отвечает стримом
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "go", v: "tutor" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const tutorHtml = env2.elements.get("main").innerHTML;
    assert(!tutorHtml.includes("Репетитор сейчас недоступен"), "expected tutor enabled after login");
    assert(!tutorHtml.includes("Репетитор доступен после входа"), "expected tutor prompt active");

    env2.emitDoc("input", { target: { id: "chat-input", value: "Объясни осмос", dataset: {} } });
    env2.emitDoc("submit", {
      target: { closest: () => ({ dataset: { f: "chat" } }) },
      preventDefault() {}
    });
    await flushMicrotasks(30);
    assert(env2.elements.get("main").innerHTML.includes("диффузия воды"), "expected streamed AI reply rendered");

    // Выход
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-logout" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(15);
    assert(authedUser === null, "expected user logged out");
    assert(env2.body.dataset.auth === "1", "expected auth gate restored after logout");
    assert(requests.some((r) => r.url === "/api/auth/logout"), "expected logout API call");

    // 3. Проверка сохранённого режима claude.ai
    let claudeSnapCb = null;
    const env3 = installGlobals({
      claude: {
        use: async (cap) => {
          if (cap === "user") return { id: async () => "u-123", me: async () => ({ name: "Анна Тест", isOwner: false }) };
          if (cap === "db") return {
            doc: () => ({ get: async () => ({ exists: true }), set: async () => {}, update: async () => {} }),
            collection: () => ({ onSnapshot: (cb) => { claudeSnapCb = cb; } })
          };
          if (cap === "sample") return async () => ({ text: "ok" });
          return null;
        }
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("app.js"), "app.js");
    await flushMicrotasks(20);
    assert(typeof claudeSnapCb === "function", "expected claude onSnapshot subscription");
    claudeSnapCb({ metadata: { fromCache: false }, docs: [{ id: "profile", data: () => ({ name: "Анна", exists: true }) }] });
    await flushMicrotasks(10);
    assert(env3.elements.get("main").innerHTML.includes("Привет, Анна!"), "expected claude mode working");

    // 4. Проверка онбординга без повторного вопроса имени + адаптивного плана
    const planServerDocs = {};
    let planUser = null;
    const deepMerge = (dst, src) => {
      const out = Object.assign({}, dst || {});
      for (const k of Object.keys(src || {})) {
        const v = src[k];
        if (v === null) delete out[k];
        else if (v && typeof v === "object" && !Array.isArray(v)) out[k] = deepMerge(out[k], v);
        else out[k] = v;
      }
      return out;
    };
    const env4 = installGlobals({
      host: { backend: true },
      localStorage: {},
      fetch: async (url, init) => {
        init = init || {};
        const mkRes = (status, jsonObj) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, json: async () => jsonObj });
        if (url === "/api/me") return mkRes(200, { user: planUser, ai: { enabled: false }, inviteRequired: false, providers: { local: true, google: false } });
        if (url === "/api/auth/register") {
          const b = JSON.parse(init.body);
          planUser = { id: 9, username: b.username, displayName: b.displayName || b.username, email: b.email || null, authProvider: "local" };
          return mkRes(200, { user: planUser });
        }
        if (url === "/api/docs") return mkRes(200, { docs: planServerDocs });
        if (url.startsWith("/api/docs/")) {
          const docName = decodeURIComponent(url.slice("/api/docs/".length));
          const method = init.method || "GET";
          if (method === "PUT") planServerDocs[docName] = JSON.parse(init.body);
          else if (method === "PATCH") planServerDocs[docName] = deepMerge(planServerDocs[docName], JSON.parse(init.body));
          return mkRes(200, { ok: true });
        }
        return mkRes(404, { detail: "not found" });
      }
    });
    const clickAction = (env, dataset) => env.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset, disabled: false } : null },
      preventDefault() {}
    });
    const completeActiveQuiz = async (env) => {
      for (let guard = 0; guard < 30; guard++) {
        const html = env.elements.get("main").innerHTML;
        if (html.includes('<div class="eyebrow">Итоги · ')) return html;
        if (guard === 0) {
          if (html.includes('id="ans"')) env.emitDoc("input", { target: { id: "ans", value: "тест", dataset: {} } });
          else if (html.includes('id="self-text"')) env.emitDoc("input", { target: { id: "self-text", value: "ответ", dataset: {} } });
          else if (html.includes('data-a="pick"')) {
            const m = /data-a="pick"\s+data-i="(\d+)"/.exec(html);
            if (m) clickAction(env, { a: "pick", i: m[1] });
          } else if (html.includes('data-a="match"')) {
            const seenL = new Set();
            const re = /data-a="match"\s+data-l="(\d+)"\s+data-r="0"/g;
            let m;
            while ((m = re.exec(html)) !== null) {
              if (!seenL.has(m[1])) { seenL.add(m[1]); clickAction(env, { a: "match", l: m[1], r: "0" }); }
            }
          } else if (html.includes('data-a="ord"')) {
            const re = /data-a="ord"\s+data-i="(\d+)"/g;
            let m;
            while ((m = re.exec(html)) !== null) clickAction(env, { a: "ord", i: m[1] });
          }
          clickAction(env, { a: "quiz-check" });
          clickAction(env, { a: "quiz-next" });
        } else {
          clickAction(env, { a: "quiz-skip" });
        }
        await flushMicrotasks(6);
      }
      throw new Error("quiz did not finish");
    };

    loadScripts(dataScripts);
    vmRun(readFileText("app.js"), "app.js");
    await flushMicrotasks(15);
    clickAction(env4, { a: "auth-tab", tab: "register" });
    await flushMicrotasks(6);
    env4.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: {
            displayName: { value: "Игорь" },
            username: { value: "igor" },
            email: { value: "igor@example.com" },
            password: { value: "secret123" },
            password2: { value: "secret123" },
            invite: { value: "" },
            migrate: { checked: false }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(25);
    const obHtml = env4.elements.get("main").innerHTML;
    assert(obHtml.includes("Давай настроим подготовку"), "expected onboarding form for fresh backend user");
    assert(!obHtml.includes("Как к тебе обращаться") && !obHtml.includes('id="ob-name"'), "should not ask display name again during onboarding");

    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "onboard" } }) }, preventDefault() {} });
    await flushMicrotasks(12);
    assert(env4.elements.get("main").innerHTML.includes("Привет, Игорь!"), "expected registration name in greeting after onboarding");

    clickAction(env4, { a: "go", v: "plan" });
    await flushMicrotasks(8);
    const planBefore = env4.elements.get("main").innerHTML;
    assert(planBefore.includes('data-a="plan-act" data-id="diag-rus"') && planBefore.includes("Пройти"), "expected interactive diagnostic button in plan");
    assert(planBefore.includes('data-a="plan-act" data-id="rus-start"'), "expected interactive prep start button in plan");
    assert(planBefore.includes("https://www.gosuslugi.ru/") && planBefore.includes("Перейти на Госуслуги"), "expected Gosuslugi button");
    assert(planBefore.includes("https://www.gosuslugi.ru/vuzonline") && planBefore.includes("Изучить"), "expected uni-rules study CTA button");

    // Проходим диагностику по русскому -> автогалочка + результат
    clickAction(env4, { a: "plan-act", id: "diag-rus" });
    await flushMicrotasks(8);
    assert(env4.elements.get("main").innerHTML.includes("quiz-strip"), "expected segmented quiz progress strip");
    const diagSummary = await completeActiveQuiz(env4);
    assert(diagSummary.includes("Вернуться к плану"), "expected return-to-plan button after plan quiz");
    assert(planServerDocs.plan && planServerDocs.plan.done && planServerDocs.plan.done["diag-rus"], "expected auto checkmark for diag-rus");
    assert(planServerDocs.plan.results && planServerDocs.plan.results["diag-rus"] && planServerDocs.plan.results["diag-rus"].q === 20, "expected saved diagnostic result");

    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(8);
    const planAfterDiag = env4.elements.get("main").innerHTML;
    assert(planAfterDiag.includes("Результат:") && planAfterDiag.includes("из 20") && planAfterDiag.includes("Пройти ещё раз"), "expected rendered score and retake button in plan");

    // Фильтр в плане: Выполнено / Осталось / Все
    clickAction(env4, { a: "plan-filter", filter: "done" });
    await flushMicrotasks(6);
    const planDoneOnly = env4.elements.get("main").innerHTML;
    assert(planDoneOnly.includes("diag-rus") && !planDoneOnly.includes('data-id="uni-rules"'), "expected done filter to show only completed plan items");
    clickAction(env4, { a: "plan-filter", filter: "all" });
    await flushMicrotasks(6);

    // Проходим стартовый шаг регулярной подготовки по русскому языку -> автогалочка
    clickAction(env4, { a: "plan-act", id: "rus-start" });
    await flushMicrotasks(8);
    await completeActiveQuiz(env4);
    assert(planServerDocs.plan.done && planServerDocs.plan.done["rus-start"], "expected auto checkmark for rus-start");
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(8);
    const planAfterPrep = env4.elements.get("main").innerHTML;
    assert(planAfterPrep.includes("Продолжить") && planAfterPrep.includes("Освоено:"), "expected prep progress and continue button in plan");

    // Поиск тем на странице предмета + переключение темы оформления
    clickAction(env4, { a: "go", v: "subject", sid: "rus" });
    await flushMicrotasks(6);
    env4.emitDoc("input", { target: { id: "subj-q", value: "ударени", dataset: {} } });
    await flushMicrotasks(6);
    const subjFiltered = env4.elements.get("main").innerHTML;
    assert(subjFiltered.includes("показано") && subjFiltered.includes("subj-clear"), "expected filtered subject topics count and clear button");
    clickAction(env4, { a: "subj-clear" });
    await flushMicrotasks(6);

    clickAction(env4, { a: "theme-toggle" });
    await flushMicrotasks(6);
    assert(globalThis.document.documentElement.dataset.theme === "light", "expected first theme toggle from dark default to activate light theme");
    assert(env4.lsMap["vektor-ege:theme"] === "light", "expected persisted light theme preference");
    clickAction(env4, { a: "theme-toggle" });
    await flushMicrotasks(6);
    assert(globalThis.document.documentElement.dataset.theme === "dark", "expected second toggle to activate dark theme");
    clickAction(env4, { a: "theme-set", theme: "auto" });
    await flushMicrotasks(6);
    assert(!globalThis.document.documentElement.dataset.theme, "expected auto theme to clear data-theme");

    // Нижняя шестерёнка + «Выйти» в сайдбаре, 4 вкладки (Тесты, Репетиторы, Учёба, Показатели)
    const sideNavHtml = env4.elements.get("side-nav").innerHTML;
    const sideFootHtml = env4.elements.get("side-foot").innerHTML;
    const tabHtml = env4.elements.get("tabbar").innerHTML;
    assert(!sideNavHtml.includes('data-v="profile"'), "expected Settings removed from top sidebar nav");
    assert(sideFootHtml.includes('data-v="profile"') && sideFootHtml.includes('data-a="auth-logout"') && sideFootHtml.includes("Выйти"), "expected Settings gear and Logout button in sidebar footer");
    for (const label of ["Тесты", "Репетиторы", "Учёба", "Показатели"]) {
      assert(sideNavHtml.includes(label) && tabHtml.includes(label), `expected ${label} in sidebar and bottom tabbar`);
    }

    // Раздел «Учёба»: график недели с учителями и WhatsApp-ссылками
    clickAction(env4, { a: "go", v: "study" });
    await flushMicrotasks(6);
    const studyWeekHtml = env4.elements.get("main").innerHTML;
    assert(studyWeekHtml.includes("График недели") && studyWeekHtml.includes("https://wa.me/"), "expected weekly tutor schedule and WhatsApp links in study view");
    clickAction(env4, { a: "study-tab", tab: "chats" });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("hh-chat-list") && env4.elements.get("main").innerHTML.includes("https://wa.me/"), "expected WhatsApp chat list in study chats tab");

    // Справочник без нейросети: мгновенный поиск по темам и сочинению
    clickAction(env4, { a: "go", v: "tutor" });
    await flushMicrotasks(6);
    const guideHome = env4.elements.get("main").innerHTML;
    assert(guideHome.includes("Справочник") && !guideHome.includes("недоступен"), "expected offline guide view without unavailable notice");
    env4.emitDoc("input", { target: { id: "guide-q", value: "митоз", dataset: {} } });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("guide-card") && env4.elements.get("main").innerHTML.includes("Митоз"), "expected guide search results for митоз");
    clickAction(env4, { a: "guide-chip", q: "клише" });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("Сочинение: клише и аргументы"), "expected essay reference card on клише chip");

    // Автоматические «Показатели» + ненулевое время завершённых тестов + свернутый ручной ввод
    clickAction(env4, { a: "go", v: "stats" });
    await flushMicrotasks(8);
    const statsHtml = env4.elements.get("main").innerHTML;
    assert(statsHtml.includes("По предметам (автоматически)") && statsHtml.includes("Освоено вопросов"), "expected automatic per-subject analytics cards");
    assert(statsHtml.includes('<details class="card manual-box">'), "expected manual forms collapsed inside details.manual-box");
    assert(!statsHtml.includes('<span class="tile-label">Сегодня</span><span class="tile-value">0 мин</span>'), "expected non-zero auto time after completed quizzes");

    // Завершённый вариант с известной шкалой (биология) автоматически сохраняется в «Показатели»
    clickAction(env4, { a: "quiz-variant", sid: "bio" });
    await flushMicrotasks(8);
    for (let guard = 0; guard < 45; guard++) {
      const qHtml = env4.elements.get("main").innerHTML;
      if (qHtml.includes("Итоги ·")) break;
      if (guard === 0) {
        if (qHtml.includes('id="ans"')) env4.emitDoc("input", { target: { id: "ans", value: "тест", dataset: {} } });
        else if (qHtml.includes('id="self-text"')) env4.emitDoc("input", { target: { id: "self-text", value: "ответ", dataset: {} } });
        else if (qHtml.includes('data-a="pick"')) {
          const m = /data-a="pick"\s+data-i="(\d+)"/.exec(qHtml);
          if (m) clickAction(env4, { a: "pick", i: m[1] });
        } else if (qHtml.includes('data-a="match"')) {
          const re = /data-a="match"\s+data-l="(\d+)"\s+data-r="0"/g;
          let m;
          while ((m = re.exec(qHtml)) !== null) clickAction(env4, { a: "match", l: m[1], r: "0" });
        } else if (qHtml.includes('data-a="ord"')) {
          const re = /data-a="ord"\s+data-i="(\d+)"/g;
          let m;
          while ((m = re.exec(qHtml)) !== null) clickAction(env4, { a: "ord", i: m[1] });
        }
        clickAction(env4, { a: "quiz-check" });
        clickAction(env4, { a: "quiz-next" });
      } else {
        clickAction(env4, { a: "quiz-skip" });
      }
      await flushMicrotasks(6);
    }
    const varSummary = env4.elements.get("main").innerHTML;
    assert(varSummary.includes("Итоги ·") && varSummary.includes("Сохранено в «Показателях»"), "expected variant summary to auto-save to mocks");
    assert(planServerDocs.mocks && planServerDocs.mocks.m && Object.keys(planServerDocs.mocks.m).length >= 1, "expected auto-saved mock record in server docs");
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(6);

    // Подсказка без спойлера + пауза теста при переходе в Справочник и другие разделы + сохранение активного теста
    clickAction(env4, { a: "quiz-mixed", sid: "bio" });
    await flushMicrotasks(8);
    const quizStartHtml = env4.elements.get("main").innerHTML;
    assert(quizStartHtml.includes('data-a="quiz-hint"') && quizStartHtml.includes('data-a="quiz-guide"'), "expected quiz hint and guide buttons");
    clickAction(env4, { a: "quiz-hint" });
    await flushMicrotasks(6);
    const quizHintedHtml = env4.elements.get("main").innerHTML;
    assert(quizHintedHtml.includes("Где искать информацию в справочнике") && quizHintedHtml.includes("Открыть в справочнике"), "expected spoiler-safe guide hint box");
    clickAction(env4, { a: "quiz-hint" });
    clickAction(env4, { a: "quiz-hint" });
    await flushMicrotasks(4);

    clickAction(env4, { a: "quiz-guide" });
    await flushMicrotasks(8);
    const pausedInGuide = env4.elements.get("main").innerHTML;
    assert(pausedInGuide.includes("Справочник") && pausedInGuide.includes("quiz-resume") && pausedInGuide.includes("Вернуться к тесту"), "expected paused quiz banner in guide view");
    assert(!!env4.lsMap["vektor-ege:active-quiz"], "expected unfinished quiz snapshot persisted in localStorage");

    clickAction(env4, { a: "go", v: "stats" });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("quiz-resume"), "expected paused quiz banner in stats view too");

    clickAction(env4, { a: "go", v: "quiz" });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("Где искать информацию в справочнике"), "expected quiz state and hint box preserved after returning");

    const hintedSummary = await completeActiveQuiz(env4);
    assert(hintedSummary.includes("подсказ"), "expected hint count displayed in quiz summary");
    assert(!env4.lsMap["vektor-ege:active-quiz"], "expected active quiz snapshot cleared upon completion");
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(6);

    // Показатели: среднее число подсказок за тест + повторяемость вопросов (1 раз / 2 раза)
    clickAction(env4, { a: "go", v: "stats" });
    await flushMicrotasks(8);
    const statsBeforeRepeat = env4.elements.get("main").innerHTML;
    assert(statsBeforeRepeat.includes("Подсказок за тест") && statsBeforeRepeat.includes("Повторяемость вопросов"), "expected average hints and question repeatability section in stats");
    const firstQMatch = /data-a="quiz-one"\s+data-id="([^"]+)"/.exec(statsBeforeRepeat);
    assert(firstQMatch, "expected at least one solved question listed in repeatability card");
    const repeatQid = firstQMatch[1];

    clickAction(env4, { a: "quiz-one", id: repeatQid, back: "stats" });
    await flushMicrotasks(6);
    await completeActiveQuiz(env4);
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(8);

    clickAction(env4, { a: "stats-rep", k: "2" });
    await flushMicrotasks(6);
    const statsRep2 = env4.elements.get("main").innerHTML;
    assert(statsRep2.includes(`data-id="${repeatQid}"`), "expected re-solved question to move into 2-times bucket");
    assert(statsRep2.includes("ответов 2"), "expected updated attempt count of 2 for re-solved question");

    // 5. Убран статус «Сохранено на сервере», кнопка бага на сайте и на заданиях + шаблон №11 и формат ЕГЭ (Русский №11, Биология №2)
    const cleanSideFoot = env4.elements.get("side-foot").innerHTML;
    assert(!cleanSideFoot.includes("Сохранено на сервере"), "expected normal server-saved sync status to stay hidden");
    assert(cleanSideFoot.includes('data-a="bug-site"'), "expected site bug button in sidebar footer");
    const syncSpan = env4.elements.get("side-foot").querySelector("span");
    assert(syncSpan && syncSpan.textContent === "", "expected empty sync text in normal synced state");

    clickAction(env4, { a: "bug-site" });
    await flushMicrotasks(4);
    const siteBugModal = env4.elements.get("modal-root").innerHTML;
    assert(siteBugModal.includes("mailto:willagegg@gmail.com"), "expected site bug modal mailto link to willagegg@gmail.com");
    assert(siteBugModal.includes("Баг на сайте"), "expected pre-filled site bug subject");
    clickAction(env4, { a: "bug-close" });
    await flushMicrotasks(4);
    assert(env4.elements.get("modal-root").innerHTML === "", "expected bug-close to dismiss modal");

    clickAction(env4, { a: "quiz-variant", sid: "rus" });
    await flushMicrotasks(8);
    let rus11Html = env4.elements.get("main").innerHTML;
    for (let step = 0; step < 15 && !rus11Html.includes('data-qnum="11"'); step++) {
      clickAction(env4, { a: "quiz-skip" });
      await flushMicrotasks(4);
      rus11Html = env4.elements.get("main").innerHTML;
    }
    assert(rus11Html.includes('data-qnum="11"'), "expected to reach Russian variant question #11");
    assert(rus11Html.includes("Укажите варианты ответов"), "expected full 5-row multi EGE format for Russian question #11");
    const rus11BugMatch = /data-a="bug-q"\s+data-qid="([^"]+)"\s+data-qnum="11"/.exec(rus11Html);
    assert(rus11BugMatch, "expected bug-q button with qnum=11 on Russian question #11");

    clickAction(env4, { a: "bug-q", qid: rus11BugMatch[1], qnum: "11" });
    await flushMicrotasks(4);
    const q11BugModal = env4.elements.get("modal-root").innerHTML;
    assert(q11BugModal.includes("Баг в задании №11"), "expected pre-filled subject for question #11");
    assert(q11BugModal.includes("На задании №11 неправильно сделано"), "expected template referencing question #11");
    assert(q11BugModal.includes("mailto:willagegg@gmail.com?subject="), "expected mailto link in question #11 bug modal");

    env4.emitDoc("input", { target: { id: "bug-body", value: "На задании №11 неправильно указан ответ в ключе", dataset: {} } });
    await flushMicrotasks(2);
    const liveMailHref = env4.elements.get("bug-mailto").href || "";
    assert(liveMailHref.startsWith("mailto:willagegg@gmail.com?subject=") && liveMailHref.includes(encodeURIComponent("неправильно указан ответ в ключе")), "expected #bug-mailto href to track edits to #bug-body");
    clickAction(env4, { a: "bug-close" });
    await flushMicrotasks(2);
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(6);

    clickAction(env4, { a: "quiz-variant", sid: "bio" });
    await flushMicrotasks(8);
    let bio2Html = env4.elements.get("main").innerHTML;
    for (let step = 0; step < 5 && !bio2Html.includes('data-qnum="2"'); step++) {
      clickAction(env4, { a: "quiz-skip" });
      await flushMicrotasks(4);
      bio2Html = env4.elements.get("main").innerHTML;
    }
    assert(bio2Html.includes('data-qnum="2"'), "expected to reach Biology variant question #2");
    assert(
      (/увеличил[ао]сь/.test(bio2Html) && /уменьшил[ао]сь/.test(bio2Html) && /не изменил[ао]сь/.test(bio2Html)),
      "expected experiment match format for Biology question #2"
    );
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(6);

    // Русский вариант №22 -> 5-строчное соответствие (средства выразительности), №23 -> анализ текста
    clickAction(env4, { a: "quiz-variant", sid: "rus" });
    await flushMicrotasks(8);
    let rus22Html = env4.elements.get("main").innerHTML;
    for (let step = 0; step < 30 && !rus22Html.includes('data-qnum="22"'); step++) {
      clickAction(env4, { a: "quiz-skip" });
      await flushMicrotasks(4);
      rus22Html = env4.elements.get("main").innerHTML;
    }
    assert(rus22Html.includes('data-qnum="22"'), "expected to reach Russian variant question #22");
    assert(rus22Html.includes("data-l=\"4\""), "expected 5-row match (A-D) for Russian variant question #22");
    clickAction(env4, { a: "quiz-skip" });
    await flushMicrotasks(4);
    const rus23Html = env4.elements.get("main").innerHTML;
    assert(rus23Html.includes('data-qnum="23"'), "expected to reach Russian variant question #23 after #22");
    clickAction(env4, { a: "quiz-exit" });
    await flushMicrotasks(6);

    await flushMicrotasks(6);

    // 7. Проверка лендинга, тарифов 0/5к/10к, кружочков календаря и inDrive-заявки
    const env5 = installGlobals({
      host: { backend: true },
      localStorage: {},
      fetch: async (url) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: null, ai: { enabled: false }, inviteRequired: false, providers: { local: true, google: false } }) };
        return { ok: false, status: 404, headers: { get: () => "application/json" }, json: async () => ({ detail: "not found" }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("app.js"), "app.js");
    await flushMicrotasks(12);

    const landHtml = env5.elements.get("main").innerHTML;
    assert(landHtml.includes("Бесплатная") && landHtml.includes("Пробник") && landHtml.includes("Месяц под ключ"), "expected 3 tariff names on landing");
    assert(landHtml.includes("5 000 ₽") && landHtml.includes("10 000 ₽"), "expected 5k and 10k prices on landing");
    assert(landHtml.includes('data-a="mkt-day"') && landHtml.includes('data-a="mkt-hour"'), "expected day and hour circles on landing");

    clickAction(env5, { a: "mkt-preset" });
    await flushMicrotasks(4);
    const presetHtml = env5.elements.get("main").innerHTML;
    assert(presetHtml.includes("Анна Соколова"), "expected English 10:00 Saturday tutor after preset");

    clickAction(env5, { a: "mkt-exam", v: "ОГЭ" });
    clickAction(env5, { a: "mkt-subj", v: "eng" });
    clickAction(env5, { a: "mkt-day", v: "all" });
    clickAction(env5, { a: "mkt-hour", v: "10:00" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Анна Соколова"), "expected circle/exam/subject filtering to work");

    clickAction(env5, { a: "mkt-reset" });
    clickAction(env5, { a: "mkt-plan", id: "trial5k" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("5\u00a0000 ₽") || env5.elements.get("main").innerHTML.includes("5 000 ₽"), "expected 5 000 ₽ wallet balance after trial5k");

    clickAction(env5, { a: "book-open", id: "tut-sokolova", hour: "10:00" });
    await flushMicrotasks(2);
    const modalBefore = env5.elements.get("modal-root").innerHTML;
    assert(modalBefore.includes("Запись · Анна Соколова") && modalBefore.includes('id="bid-price"'), "expected booking modal open");
    clickAction(env5, { a: "bid-step", step: "-100" });
    await flushMicrotasks(2);
    const modalStepped = env5.elements.get("modal-root").innerHTML;
    assert(modalStepped.includes('value="900"') && modalStepped.includes("900 ₽/ч"), "expected -100 step to update offerPrice to 900");

    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(4);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected booking modal closed after submit");
    const afterBookHtml = env5.elements.get("main").innerHTML;
    assert(afterBookHtml.includes("Ожидает ответа бота") && (afterBookHtml.includes("4\u00a0100 ₽") || afterBookHtml.includes("4 100 ₽")), "expected 900 ₽ reserved from 5 000 ₽ balance");

    const acceptIdMatch = /data-a="mkt-sim-accept" data-id="([^"]+)"/.exec(afterBookHtml);
    assert(acceptIdMatch, "expected sim-accept button for pending booking");
    clickAction(env5, { a: "mkt-sim-accept", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Преподаватель ответил «Да»"), "expected tutor accepted state");

    clickAction(env5, { a: "mkt-cancel-book", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    const afterCancelHtml = env5.elements.get("main").innerHTML;
    assert(afterCancelHtml.includes("5\u00a0000 ₽") || afterCancelHtml.includes("5 000 ₽"), "expected balance restored to 5 000 ₽ on tutor cancel/switch");

    clickAction(env5, { a: "filter-open" });
    await flushMicrotasks(2);
    const filterSheet = env5.elements.get("modal-root").innerHTML;
    assert(filterSheet.includes("Фильтры") && filterSheet.includes("Показать"), "expected filter sheet drawer open");
    clickAction(env5, { a: "filter-close" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected filter sheet closed");

    clickAction(env5, { a: "auth-guest" });
    await flushMicrotasks(6);
    assert(env5.elements.get("side-nav").innerHTML.includes("Репетиторы"), "expected side-nav Репетиторы link");
    assert(env5.elements.get("main").innerHTML.includes("Тесты и справочник"), "expected default Tests hub after login/guest");
    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Подбор репетитора"), "expected market view");

    out("APP_SMOKE_TESTS_OK");
  }

  main().catch((err) => {
    out(String(err) + (err && err.stack ? "\n" + err.stack : ""));
    if (isNode) process.exit(1);
    if (typeof quit === "function") quit(1);
    throw err;
  });
})();
