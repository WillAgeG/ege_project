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
  function hasNum(s, n) {
    return s.includes(n) || s.includes(n.replace(/(\d) (?=\d)/g, "$1\u00a0"));
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

    for (const id of ["main", "side-nav", "side-subjects-wrap", "side-subjects", "side-foot", "top-balance-slot", "tabbar", "toast", "tip", "modal-root", "bug-mailto"]) {
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

  function resolveAssetPath(p) {
    if (p.startsWith("ux-ui/") || p.startsWith("tools/") || p.startsWith("frontend/")) return p;
    return "frontend/" + p;
  }

  function loadScripts(paths) {
    const g = typeof globalThis !== "undefined" ? globalThis : this;
    g.EGE = { subjects: [], tableEdits: [], plan: null, essay: null };
    for (const p of paths) {
      const diskPath = resolveAssetPath(p);
      vmRun(readFileText(diskPath), diskPath);
    }
  }

  function parseHtmlScripts() {
    const html = readFileText("frontend/index.html");
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
    assert(readFileText("frontend/app.js").replace(/\r\n/g, "").indexOf("\n") === -1, "expected CRLF line endings in frontend/app.js");

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
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
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
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
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
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
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
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
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

    // Нижняя шестерёнка + «Выйти» в сайдбаре, баланс снизу слева (десктоп) и сверху справа (мобилка), 5 вкладок (Тесты, Справочник, Репетиторы, Учёба, Показатели)
    const sideNavHtml = env4.elements.get("side-nav").innerHTML;
    const sideFootHtml = env4.elements.get("side-foot").innerHTML;
    const topBalHtml = env4.elements.get("top-balance-slot").innerHTML;
    const tabHtml = env4.elements.get("tabbar").innerHTML;
    assert(!sideNavHtml.includes('data-v="profile"'), "expected Settings removed from top sidebar nav");
    assert(sideFootHtml.includes('data-v="profile"') && sideFootHtml.includes('data-a="auth-logout"') && sideFootHtml.includes("Выйти"), "expected Settings gear and Logout button in sidebar footer");
    assert(sideFootHtml.includes("Преподаватель") && !sideFootHtml.includes(">Препод<") && !sideFootHtml.includes("hh-seg equal side-role-seg"), "expected full label Преподаватель without Препод abbreviation or equal grid clipping");
    assert(sideFootHtml.includes('id="side-balance-slot"') && sideFootHtml.includes("top-bal-pill") && sideFootHtml.includes("Пополнить"), "expected persistent student bottom-left balance slot inside #side-foot");
    assert(topBalHtml.includes("top-bal-pill") && topBalHtml.includes("Пополнить") && !env4.elements.get("top-balance-slot").hidden, "expected persistent student top-right balance slot in mobile .topbar");
    assert(!env4.elements.get("main").innerHTML.includes("desktop-top-bar"), "expected duplicate desktop-top-bar removed");
    for (const label of ["Тесты", "Справочник", "Репетиторы", "Учёба", "Показатели"]) {
      assert(sideNavHtml.includes(label) && tabHtml.includes(label), `expected ${label} in sidebar and bottom tabbar`);
    }

    // Раздел «Учёба»: до записи показывается только форма «Ищу преподавателя» и пустое состояние без чужих преподавателей
    clickAction(env4, { a: "go", v: "study" });
    await flushMicrotasks(6);
    const studyEmptyHtml = env4.elements.get("main").innerHTML;
    assert(studyEmptyHtml.includes("Вы пока не записаны ни к одному преподавателю") && !studyEmptyHtml.includes("https://wa.me/"), "expected study view to list ONLY enrolled tutors and omit unbooked tutors");
    assert(studyEmptyHtml.includes("Ищу преподавателя по предметам") && studyEmptyHtml.includes("lead-subjects"), "expected student lead form with multi-select subjects inside study view");

    // Публикация студентом запроса «Ищу преподавателя» с мультивыбором Химия + Биология
    clickAction(env4, { a: "lead-subj-pick", v: "bio" });
    await flushMicrotasks(2);
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "student-lead" }, elements: { targetPrice: { value: "1150" }, whatsapp: { value: "79142100999" }, comment: { value: "Нужна химия и биология ЕГЭ на 85+" } } }) }, preventDefault() {} });
    await flushMicrotasks(3);
    const afterLeadHtml = env4.elements.get("main").innerHTML;
    assert(afterLeadHtml.includes("Опубликовано для преподавателей") && afterLeadHtml.includes("Химия") && afterLeadHtml.includes("Биология"), "expected submitted multi-subject student lead to render in open requests");

    // Пробный урок 0 ₽ блокируется при балансе < 5000 ₽ -> открытие модалки пополнения -> пополнение -> успешная запись за 0 ₽ -> появление преподавателя в «Учёбе»
    clickAction(env4, { a: "go", v: "market" });
    await flushMicrotasks(4);
    clickAction(env4, { a: "trial-open", id: "tut-sokolova", hour: "10:00" });
    await flushMicrotasks(2);
    const balModalHtml = env4.elements.get("modal-root").innerHTML;
    assert(balModalHtml.includes("Баланс и пополнение") && balModalHtml.includes("первый платёж от 5 000 ₽"), "expected trial action under 5000 ₽ balance to open Brandbook balance top-up modal requiring 5000 ₽ first payment");
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "1000" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("Первое пополнение — минимум 5 000 ₽"), "expected first top-up below 5000 ₽ to be rejected");
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "6500" } } }) }, preventDefault() {} });
    await flushMicrotasks(3);
    const afterTopupModal = env4.elements.get("modal-root").innerHTML;
    assert(afterTopupModal.includes("Пробный урок · 0 ₽") && hasNum(env4.elements.get("side-foot").innerHTML, "6 500") && hasNum(env4.elements.get("top-balance-slot").innerHTML, "6 500"), "expected custom top-up to reach 6500 ₽ and sync both bottom-left & top-right student balance");
    clickAction(env4, { a: "book-submit" });
    await flushMicrotasks(3);
    assert(hasNum(env4.elements.get("side-foot").innerHTML, "6 500") && hasNum(env4.elements.get("top-balance-slot").innerHTML, "6 500"), "expected free trial 0 ₽ booking not to deduct balance");
    clickAction(env4, { a: "bal-open" });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("от 100 ₽"), "expected subsequent top-ups from 100 ₽ once initial 5000 ₽ is paid");
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "100" } } }) }, preventDefault() {} });
    await flushMicrotasks(3);
    assert(hasNum(env4.elements.get("side-foot").innerHTML, "6 600") && hasNum(env4.elements.get("top-balance-slot").innerHTML, "6 600"), "expected subsequent 100 ₽ custom top-up to succeed cleanly in both balance slots");

    clickAction(env4, { a: "go", v: "study" });
    await flushMicrotasks(4);
    const studyBookedHtml = env4.elements.get("main").innerHTML;
    assert(studyBookedHtml.includes("Календарь ваших уроков") && studyBookedHtml.includes("https://wa.me/") && studyBookedHtml.includes("Соколова"), "expected enrolled tutor schedule and WhatsApp link in study view after booking");
    clickAction(env4, { a: "study-tab", tab: "chats" });
    await flushMicrotasks(4);
    assert(env4.elements.get("main").innerHTML.includes("hh-chat-list") && env4.elements.get("main").innerHTML.includes("https://wa.me/"), "expected WhatsApp chat list only for booked tutor in study chats tab");

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
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);

    const sp800 = globalThis.EGE.tutors.commissionSplit(800);
    assert(sp800.total === 800 && sp800.payout === 760 && sp800.fee === 40 && sp800.pct === 5, "expected 5% commission split (800 -> 760 + 40)");
    assert(globalThis.EGE.tutors.SUBJECTS.length >= 10 && Array.isArray(globalThis.EGE.tutors.PREP_UNIVERSE) && Array.isArray(globalThis.EGE.tutors.LIVE_DEALS), "expected broadened 10+ subjects, marquee universe and live deals");
    assert(globalThis.EGE.tutors.CATALOG_TOTAL === 2480 && globalThis.EGE.tutors.LIST.length >= 16, "expected 2480+ catalog positioning and 16+ tutors");
    assert(globalThis.EGE.tutors.HOURS[0] === "10:00" && globalThis.EGE.tutors.HOURS[globalThis.EGE.tutors.HOURS.length - 1] === "20:00", "expected 10:00..20:00 hourly slots");
    assert(new Set(globalThis.EGE.tutors.LIST.map((t) => t.source)).size >= 3 && globalThis.EGE.tutors.LIST.every((t) => Boolean(t.source) && t.availableFrom && t.availableTo && (t.tier === "pro" ? (t.price > t.marketPrice && t.abovePct > 0 && t.aboveRub > 0) : (t.marketPrice > t.price && t.belowPct > 0 && t.belowRub > 0))), "expected multi-channel sources, window and below/above-market metadata on all tutors");

    const landHtml = env5.elements.get("main").innerHTML;
    assert(!landHtml.includes("Бесплатная") && landHtml.includes("Пробник") && landHtml.includes("Месяц под ключ"), "expected minimum 5000 ₽ subscription plans without free tier on landing");
    assert(landHtml.includes("Супер-подписка") && landHtml.includes("plan-card featured super"), "expected distinct super class and badge on 10k tariff");
    assert(landHtml.includes("5 000 ₽") && landHtml.includes("10 000 ₽"), "expected 5k and 10k prices on landing");
    assert(landHtml.includes("Дмитрий Волков") && landHtml.includes("выше рынка") && landHtml.includes("diff-tag pro"), "expected above-market high-qualification expert tutor visible on default Любая filter");
    assert(landHtml.includes('data-a="mkt-day"') && landHtml.includes('id="mkt-hour-range"') && landHtml.includes('<span class="day-dot">7</span>') && !landHtml.includes(">7 дн<") && !landHtml.includes(">7д<"), "expected clean 7 number badge (without 7д/7 дн) and 10:00-20:00 hour range slider on landing");
    assert(landHtml.includes('id="land-demo"') && landHtml.includes("Доска Ykt") && landHtml.includes("Telegram") && landHtml.includes("MAX") && !landHtml.includes("Комиссия 5%") && !landHtml.includes("760 ₽") && landHtml.includes('data-v="fees"'), "expected interactive beta demo, multi-channel sources (Ykt/TG/WA/MAX), hidden 5% commission on landing and separate /fees link");
    assert(landHtml.includes('id="hero-motion-stage"') && landHtml.includes('id="hero-motion-bid-btn"') && landHtml.includes('id="hero-hour-range"') && landHtml.includes('id="hero-price-minus"') && !landHtml.includes("01 Выбор") && landHtml.includes("hh-price-old") && !landHtml.includes("hh-blue-banner") && landHtml.includes("btn sakha-pattern motion-bid-btn") && hasNum(landHtml, "Сөп · Предложить 1 200 ₽") && landHtml.includes("Денис Ковалёв") && landHtml.includes("marquee-band") && landHtml.includes('id="land-savings"') && !landHtml.includes('data-target="land-motion-showcase"') && !landHtml.includes(">Моушен<") && !landHtml.includes(">Брендбук<") && landHtml.includes("UX/UI и Figma"), "expected clean hh-style UX/UI stage with Sakha Предложить CTA, strikethrough price, no Моушен/Брендбук links in header, and Денис Ковалёв");

    clickAction(env5, { a: "motion-step-price", step: "-100" });
    await flushMicrotasks(2);
    const motionSteppedHtml = env5.elements.get("main").innerHTML;
    assert(hasNum(motionSteppedHtml, "Сөп · Предложить 1 100 ₽") && motionSteppedHtml.includes("на 100 ₽ ниже анкеты") && motionSteppedHtml.includes("ниже рынка"), "expected -100 ₽ stepper to update Sakha Предложить CTA and separate colored diff tags");
    clickAction(env5, { a: "motion-bid-press" });
    await flushMicrotasks(2);
    const motionBidHtml = env5.elements.get("main").innerHTML;
    const motionSideToast = env5.elements.get("toast");
    assert(motionBidHtml.includes("is-confirmed") && motionBidHtml.includes("Подтверждено") && motionBidHtml.includes("Предложение передано преподавателю") && motionBidHtml.includes("bb-pulse-dot") && motionBidHtml.includes("chip notif") && !motionBidHtml.includes("Заявка отправлена · уведомим"), "expected pressing Предложить to transition smoothly into green Подтверждено CTA with orange Brandbook notification below");
    assert(motionSideToast.className === "toast is-side" && motionSideToast.innerHTML.includes("Предложение передано преподавателю") && !motionSideToast.innerHTML.includes("WhatsApp"), "expected side notification without literal WhatsApp word on motion bid");
    for (let k = 0; k < 10; k += 1) clickAction(env5, { a: "motion-step-price", step: "100" });
    await flushMicrotasks(2);
    const motionProHtml = env5.elements.get("main").innerHTML;
    assert(hasNum(motionProHtml, "2 100 ₽") && motionProHtml.includes("выше рынка") && motionProHtml.includes("diff-tag pro"), "expected stepping above market on hero motion card to switch into purple above-market qualification state");
    clickAction(env5, { a: "motion-preset", v: "inf" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Роман Лебедев"), "expected motion preset switch to Python/IT tutor");
    clickAction(env5, { a: "save-step", which: "off", step: "-100" });
    clickAction(env5, { a: "save-freq", v: "3" });
    await flushMicrotasks(2);
    const saveHtml = env5.elements.get("main").innerHTML;
    assert(hasNum(saveHtml, "16 200 ₽/мес") && hasNum(saveHtml, "10 800 ₽/мес"), "expected savings comparator ±100 ₽ steppers and freq=3 to recalculate monthly savings");

    clickAction(env5, { a: "demo-pick", i: "0" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Следующий вопрос") && env5.elements.get("main").innerHTML.includes('data-r="'), "expected instant answer feedback in landing beta quiz");
    clickAction(env5, { a: "demo-tab", tab: "notes" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("конспект темы"), "expected notes tab in landing beta demo");
    clickAction(env5, { a: "demo-tab", tab: "calc" });
    await flushMicrotasks(2);
    const calcDemoHtml = env5.elements.get("main").innerHTML;
    assert(!calcDemoHtml.includes("760 ₽") && !calcDemoHtml.includes("40 ₽") && calcDemoHtml.includes('data-v="fees"') && calcDemoHtml.includes('id="demo-calc-box"') && calcDemoHtml.includes("hh-step-readout is-inline") && hasNum(calcDemoHtml, "1 000 ₽/ч"), "expected student calc demo tab with single-line rate stepper, hidden 5% split, and link to /fees");

    clickAction(env5, { a: "mkt-preset" });
    await flushMicrotasks(4);
    const presetHtml = env5.elements.get("main").innerHTML;
    assert(presetHtml.includes("Анна Соколова"), "expected English 10:00 Saturday tutor after preset");

    clickAction(env5, { a: "mkt-exam", v: "ОГЭ" });
    clickAction(env5, { a: "mkt-subj", v: "eng" });
    clickAction(env5, { a: "mkt-day", v: "all" });
    clickAction(env5, { a: "mkt-hour", v: "15:00" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Анна Соколова"), "expected tutor window matching for intermediate hour 15:00");

    clickAction(env5, { a: "mkt-reset" });
    clickAction(env5, { a: "mkt-plan", id: "trial5k" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("5\u00a0000 ₽") || env5.elements.get("main").innerHTML.includes("5 000 ₽"), "expected 5 000 ₽ wallet balance after trial5k");

    clickAction(env5, { a: "book-open", id: "tut-sokolova", hour: "10:00" });
    await flushMicrotasks(2);
    const modalBefore = env5.elements.get("modal-root").innerHTML;
    assert(
      modalBefore.includes("Запись · Анна Соколова") &&
      modalBefore.includes('id="bid-hour-range"') &&
      modalBefore.includes('id="bid-hour-ticks"') &&
      modalBefore.includes("hh-slider-ticks ruler") &&
      modalBefore.includes('id="bid-price"') &&
      modalBefore.includes('id="bid-custom-time"') &&
      modalBefore.includes("hh-select is-pill") &&
      !modalBefore.includes('type="time"') &&
      !modalBefore.includes('id="bid-fee-split"') &&
      modalBefore.includes('data-a="go-fees"'),
      "expected booking modal with ruler hour slider, pill time select, custom time, hidden commission split and separate /fees link"
    );
    clickAction(env5, { a: "book-time-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('data-a="book-time-pick"'), "expected pill time select dropdown to open");
    clickAction(env5, { a: "book-time-pick", v: "14:30" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes("14:30") && !env5.elements.get("modal-root").innerHTML.includes('data-a="book-time-pick"'), "expected picked time 14:30 to update pill and close dropdown");
    clickAction(env5, { a: "bid-step", step: "-100" });
    await flushMicrotasks(2);
    const modalStepped = env5.elements.get("modal-root").innerHTML;
    assert(modalStepped.includes('value="900"') && hasNum(modalStepped, "900 ₽/ч") && !modalStepped.includes("855 ₽") && !modalStepped.includes("45 ₽"), "expected -100 step to update offerPrice to 900 without showing commission split");

    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(4);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected booking modal closed after submit");
    const bookSideToast = env5.elements.get("toast");
    assert(bookSideToast.className === "toast is-side" && bookSideToast.innerHTML.includes("Предложение передано преподавателю"), "expected side notification after submitting booking bid");
    const afterBookHtml = env5.elements.get("main").innerHTML;
    assert(afterBookHtml.includes("На рассмотрении · уведомим") && (afterBookHtml.includes("4\u00a0100 ₽") || afterBookHtml.includes("4 100 ₽")), "expected 900 ₽ reserved from 5 000 ₽ balance");

    const acceptIdMatch = /data-a="mkt-sim-accept" data-id="([^"]+)"/.exec(afterBookHtml);
    assert(acceptIdMatch, "expected sim-accept button for pending booking");
    clickAction(env5, { a: "mkt-sim-accept", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Преподаватель подтвердил"), "expected tutor accepted state");

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

    clickAction(env5, { a: "go", v: "brandbook" });
    await flushMicrotasks(4);
    const bbHtml = env5.elements.get("main").innerHTML;
    assert(bbHtml.includes('id="brandbook-page"') && bbHtml.includes('data-bb-pane="light"') && bbHtml.includes('data-bb-pane="dark"') && bbHtml.includes("Синий фон") && bbHtml.includes("hh-price-old") && bbHtml.includes("Inter") && bbHtml.includes("#F97316") && bbHtml.includes('id="bb-buttons"') && bbHtml.includes('id="bb-bounds"') && bbHtml.includes("bb-phone-frame"), "expected brandbook with white/dark/blue surfaces, orange notifications #F97316, full button/heart/icon catalog, spacing boundaries and mobile 390px frame");
    assert(bbHtml.includes('id="bb-logo"') && bbHtml.includes('data-surface="light"') && bbHtml.includes('data-surface="dark"') && bbHtml.includes('data-surface="blue"') && bbHtml.includes('class="brand-wordmark"') && !bbHtml.includes("M5.5 15Q15") && bbHtml.includes('id="bb-forms"') && bbHtml.includes('id="bb-cards-sys"') && bbHtml.includes('id="bb-study-states"') && bbHtml.includes('id="bb-dodont"') && bbHtml.includes("bb-input-error") && bbHtml.includes("plan-card featured super") && bbHtml.includes("bb-skel-bar") && bbHtml.includes('data-a="bb-copy-token"'), "expected extended brandbook sections: 3-surface circular Sakha logo + custom vector wordmark, forms/errors, tariffs/modals/toasts, study/skeleton/empty/danger states, Do/Dont, and copyable tokens");
    assert(bbHtml.includes('id="bb-sliders"') && bbHtml.includes('id="bb-hour-range-clean"') && bbHtml.includes('id="bb-hour-range-ticks"') && bbHtml.includes('id="bb-hour-range-ruler"') && bbHtml.includes('id="bb-layers"') && bbHtml.includes('id="bb-cabinet"') && bbHtml.includes('id="bb-responsive"') && bbHtml.includes('id="bb-vp-slider"') && bbHtml.includes("bb-blueprint-grid") && bbHtml.includes('data-a="bb-day" data-v="sat"') && !bbHtml.includes('id="bb-motion"') && !bbHtml.includes("Нажми «Предложить» для перехода") && !bbHtml.includes("5%:") && bbHtml.includes("sakha-divider is-gold-logo") && bbHtml.includes("is-no-photo") && bbHtml.includes("hh-step-readout is-inline") && bbHtml.includes("tc-autobump-card") && bbHtml.includes("tc-wa-cfg"), "expected 3 brandbook sliders, cabinet/balance showcase, gold divider, inline stepper, layers without bb-motion, responsive lab, clean CTA card without clipped hint or commission string");
    clickAction(env5, { a: "bb-copy-token", copy: "#0070FF · --accent" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").textContent.includes("#0070FF"), "expected token copy toast in brandbook");
    clickAction(env5, { a: "bb-plan-pick", v: "trial5k" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('plan-card featured picked'), "expected picking tariff in brandbook preview");
    clickAction(env5, { a: "bb-modal-open" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="bb-modal-title"'), "expected sample brandbook modal to open");
    clickAction(env5, { a: "bb-modal-close" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected sample brandbook modal to close");
    const iconMatches = bbHtml.match(/data-a="bb-icon-play"/g) || [];
    assert(iconMatches.length === 40 && bbHtml.includes('data-icon="wallet"') && bbHtml.includes('data-icon="shield"') && bbHtml.includes('data-icon="send"') && bbHtml.includes('data-icon="ohyorCross"') && bbHtml.includes('data-icon="sakhaStar"') && bbHtml.includes('data-icon="sakhaLattice"') && bbHtml.includes('data-icon="sakhaKun"') && !bbHtml.includes('data-icon="sakha"') && !bbHtml.includes('data-icon="aurora"') && bbHtml.includes('data-a="bb-icons-wave"'), "expected 40-icon catalog with Photo 2/3 Yakut ornaments and Photo 4 icons removed");
    assert(bbHtml.includes('id="bb-catalog"') && bbHtml.includes('id="bb-catalog-q"') && bbHtml.includes('id="bb-hero-banner"') && bbHtml.includes('id="bb-yakutia"') && bbHtml.includes('id="bb-landing-kit"') && bbHtml.includes('/assets/lena-pillars.jpg') && !bbHtml.includes('/assets/iphone-motion.jpg') && !bbHtml.includes('hero-iphone-bezel') && !bbHtml.includes('hero-banner-form') && !bbHtml.includes('hero-banner-badges') && !bbHtml.includes('id="bb-hero-demo-q"') && !bbHtml.includes('land-search-strip') && bbHtml.includes('hero-banner-ctas') && bbHtml.includes('Найти ниже рынка') && bbHtml.includes('Попробовать бета-тест') && bbHtml.includes("sakha-medallion-btn") && bbHtml.includes("sakha-diamond-btn") && bbHtml.includes("btn sakha-pattern") && bbHtml.includes("sakha-divider"), "expected searchable brandbook catalog + Hero banner with Lena Pillars & 2 CTAs (no top search strip/input/3 pills) + Photo 2/3 Yakut ornament buttons + landing kit");
    clickAction(env5, { a: "bb-cat", v: "hero" });
    await flushMicrotasks(2);
    const bbFilteredHero = env5.elements.get("main").innerHTML;
    assert(bbFilteredHero.includes('id="bb-hero-banner"') && !bbFilteredHero.includes('id="bb-sliders"'), "expected bb-cat=hero filter to narrow brandbook down to hero components");
    clickAction(env5, { a: "bb-hero-primary" });
    clickAction(env5, { a: "bb-hero-beta" });
    await flushMicrotasks(2);
    const bbHeroClicked = env5.elements.get("main").innerHTML;
    assert(bbHeroClicked.includes("hero-cta-primary is-confirmed") && bbHeroClicked.includes("hero-cta-secondary is-confirmed"), "expected both hero CTA buttons in brandbook to toggle confirmed status");
    clickAction(env5, { a: "bb-cat-clear" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('id="bb-sliders"'), "expected bb-cat-clear to restore all brandbook sections");
    clickAction(env5, { a: "bb-icon-play", icon: "bell", label: "Уведомление (оранж.)", animDesc: "Звон" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('bb-icon-tile is-active is-anim') && env5.elements.get("main").innerHTML.includes("Уведомление (оранж.) · Звон"), "expected clicking an icon tile to activate its animation and update status readout");
    clickAction(env5, { a: "bb-icons-wave" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "bb-day", v: "sat" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="day-cir on" data-a="bb-day" data-v="sat"') && env5.elements.get("main").innerHTML.includes('data-bb="day-label">Сб 14'), "expected clicking Сб 14 in brandbook to activate Saturday and update mobile day readout");
    clickAction(env5, { a: "bb-vp", w: "320" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("max-width:320px") && env5.elements.get("main").innerHTML.includes("Mini · 1 кол. узкая"), "expected bb-vp=320 to resize responsive container sandbox and update mode badge");
    clickAction(env5, { a: "bb-vp", w: "768" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("max-width:768px") && env5.elements.get("main").innerHTML.includes("Tablet · 2 кол."), "expected bb-vp=768 to switch responsive container sandbox to Tablet mode");
    clickAction(env5, { a: "bb-slider-style", v: "ruler" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("hh-time-range is-ruler"), "expected selecting ruler slider variant to apply is-ruler style across previews");
    clickAction(env5, { a: "bb-preset", price: "2400" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "2 400 ₽") && env5.elements.get("main").innerHTML.includes("выше рынка") && env5.elements.get("main").innerHTML.includes("diff-tag pro"), "expected above-market preset 2 400 ₽ to display purple high-qualification tags");
    clickAction(env5, { a: "bb-bid" });
    await flushMicrotasks(2);
    const bbAfterBid = env5.elements.get("main").innerHTML;
    const bbSideToast = env5.elements.get("toast");
    assert(bbAfterBid.includes("is-confirmed") && bbAfterBid.includes("✓ Подтверждено") && bbAfterBid.includes("Предложение передано преподавателю") && bbAfterBid.includes("chip notif") && !bbAfterBid.includes("переход выполнен"), "expected brandbook Подтвердить CTA to transition into green Подтверждено with orange Brandbook notification below");
    assert(bbSideToast.className === "toast is-side" && bbSideToast.innerHTML.includes("Предложение передано преподавателю") && !bbSideToast.innerHTML.includes("WhatsApp"), "expected brandbook Подтвердить CTA to trigger side notification without literal WhatsApp text");
    clickAction(env5, { a: "bb-bounds-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("hide-guides"), "expected bounds toggle to switch blueprint guide visibility");
    clickAction(env5, { a: "bb-fav" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('aria-pressed="false"'), "expected brandbook heart favorite toggle");
    clickAction(env5, { a: "bb-step", step: "-100" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "2 300 ₽"), "expected brandbook price stepper from 2400 to 2300");
    clickAction(env5, { a: "bb-mode", v: "dark" });
    await flushMicrotasks(2);
    const bbDarkOnly = env5.elements.get("main").innerHTML;
    assert(!bbDarkOnly.includes('data-bb-pane="light"') && bbDarkOnly.includes('data-bb-pane="dark"'), "expected brandbook dark-only mode toggle");

    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(4);
    const feesHtml = env5.elements.get("main").innerHTML;
    assert(feesHtml.includes('id="fees-page"') && feesHtml.includes("5%") && hasNum(feesHtml, "760 ₽") && feesHtml.includes("40 ₽"), "expected dedicated /fees page showing 5% system fee and 760/40 split");
    clickAction(env5, { a: "fees-rate", rate: "2000" });
    await flushMicrotasks(2);
    const feesUpdated = env5.elements.get("main").innerHTML;
    assert(hasNum(feesUpdated, "1 900 ₽") && feesUpdated.includes("100 ₽"), "expected /fees calculator preset to recalculate 95%/5% split for 2000");

    clickAction(env5, { a: "go", v: "brandbook" });
    await flushMicrotasks(4);
    const bbHtmlCheck = env5.elements.get("main").innerHTML;
    assert(bbHtmlCheck.includes("bb-subj-toggle"), "expected custom hh-select dropdown trigger in brandbook");
    assert(bbHtmlCheck.includes("card plan-card"), "expected tariff cards to include .card base class");
    assert(bbHtmlCheck.includes("bb-preview-toast-close"), "expected close button on brandbook side toast preview");
    assert(bbHtmlCheck.includes("bb-cancel-demo"), "expected adaptive cancel demo button");

    clickAction(env5, { a: "bb-subj-toggle" });
    await flushMicrotasks(2);
    const openMenuHtml = env5.elements.get("main").innerHTML;
    assert(openMenuHtml.includes('role="listbox"') && openMenuHtml.includes("bb-subj-pick"), "expected custom subject dropdown menu to open");
    clickAction(env5, { a: "bb-subj-pick", v: "chem" });
    await flushMicrotasks(2);
    const pickedSubjHtml = env5.elements.get("main").innerHTML;
    assert(pickedSubjHtml.includes("Химия · ЕГЭ 2027") && !pickedSubjHtml.includes('role="listbox"'), "expected picked subject and closed menu");

    clickAction(env5, { a: "bb-cancel-demo" });
    await flushMicrotasks(2);
    const cancelHtml = env5.elements.get("main").innerHTML;
    assert(cancelHtml.includes("is-undone") && cancelHtml.includes("Запись отменена · вернуть"), "expected adaptive undone state on cancel button");
    const liveSideToast = env5.elements.get("toast");
    assert(liveSideToast && liveSideToast.className === "toast is-side" && liveSideToast.innerHTML.includes('data-a="toast-close"'), "expected live side toast with close button");
    clickAction(env5, { a: "toast-close" });
    assert(liveSideToast.hidden === true || (liveSideToast.className && liveSideToast.className.includes("is-dismissing")), "expected toast-close to hide or dismiss side toast");

    clickAction(env5, { a: "bb-preview-toast-close" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("bb-preview-toast-reset"), "expected dismissed preview toast restore button");
    clickAction(env5, { a: "bb-preview-toast-reset" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("bb-preview-toast-close"), "expected restored preview toast close button");

    clickAction(env5, { a: "bb-sakha-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("✓ Сөп · Ставка отправлена"), "expected Sakha Ohyor pattern button in brandbook to transition to confirmed state");
    const sakhaBbToast = env5.elements.get("toast");
    assert(sakhaBbToast && sakhaBbToast.className === "toast is-side" && sakhaBbToast.innerHTML.includes("Сөп · Ставка отправлена"), "expected Sakha toggle in brandbook to show side toast");
    clickAction(env5, { a: "bb-sakha-medallion" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="sakha-medallion-btn is-confirmed"'), "expected Kun Ohyor medallion in brandbook to transition to confirmed state");
    clickAction(env5, { a: "bb-sakha-diamond" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="sakha-diamond-btn is-confirmed"'), "expected Sulus diamond in brandbook to transition to confirmed state");
    clickAction(env5, { a: "bb-faq-toggle", i: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="bb-faq-toggle" data-i="1" aria-expanded="true"'), "expected FAQ item in brandbook landing catalog to expand on click");

    clickAction(env5, { a: "bb-mode", v: "both" });
    await flushMicrotasks(2);
    const bbV2Html = env5.elements.get("main").innerHTML;
    const catTargetIds = globalThis.EGE.kit.CATALOG_ITEMS.map((it) => it.targetId);
    assert(
      globalThis.EGE.kit.CATALOG_ITEMS.length === 18 &&
      ["bb-market-app", "bb-cabinet", "bb-layers", "bb-bounds", "bb-dodont", "bb-compare"].every((id) => catTargetIds.includes(id)),
      "expected 18 catalog items covering all brandbook sections including /market, cabinet/balance, layers, bounds, dodont, and compare"
    );
    assert(
      !bbV2Html.includes("Unbounded") &&
      bbV2Html.includes("Inter + IBM Plex Mono") &&
      bbV2Html.includes('id="bb-toc"') &&
      bbV2Html.includes("bb-logo-donts") &&
      bbV2Html.includes("bb-wcag-grid") &&
      bbV2Html.includes("#C59B5F") &&
      bbV2Html.includes("bb-tabbar-mock") &&
      bbV2Html.includes("Как ученик") &&
      bbV2Html.includes("Как преподаватель") &&
      bbV2Html.includes("savings-bar-fill gold-fill") &&
      bbV2Html.includes("bb-elev-grid") &&
      bbV2Html.includes('id="bb-market-app"') &&
      bbV2Html.includes("bb-tone-grid") &&
      bbV2Html.includes("Шкала слоёв интерфейса (z-index)"),
      "expected updated brandbook sections: Gold #C59B5F, 5-tab mobile bar, role selector, Inter + IBM Plex Mono, quick TOC, logo don'ts, WCAG contrast grid, elevation grid, /market anatomy, Tone of Voice, and z-index table"
    );

    const directSvg = globalThis.EGE.ui.brandLogoSVG("blue", "lockup");
    const directMarkSvg = globalThis.EGE.ui.brandLogoSVG("dark", "mark");
    assert(
      directSvg.startsWith("<svg ") && directSvg.includes('xmlns="http://www.w3.org/2000/svg"') && directSvg.includes('viewBox="0 0 260 72"') && directSvg.includes('fill="#0070ff"') && directSvg.includes("<path d=") &&
      directMarkSvg.startsWith("<svg ") && directMarkSvg.includes('viewBox="0 0 64 64"') && directMarkSvg.includes('fill="#0b0d12"'),
      "expected brandLogoSVG to emit valid standalone lockup and mark SVGs"
    );
    clickAction(env5, { a: "bb-logo-dl", surface: "blue", kind: "lockup" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Экспорт SVG"), "expected bb-logo-dl to trigger SVG export side toast");
    clickAction(env5, { a: "bb-logo-copy", surface: "dark", kind: "mark" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("SVG в буфере"), "expected bb-logo-copy to store dark mark SVG and notify");

    clickAction(env5, { a: "bb-export-tokens", fmt: "css" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Экспорт :root CSS"), "expected bb-export-tokens css notification");
    clickAction(env5, { a: "bb-export-tokens", fmt: "json" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Экспорт tokens.json"), "expected bb-export-tokens json notification");

    clickAction(env5, { a: "bb-market-req-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Преподаватель подтвердил") && env5.elements.get("main").innerHTML.includes("Написать"), "expected bb-market-req-toggle to switch demo request into confirmed state with chat action");
    clickAction(env5, { a: "bb-app-role", role: "tutor" });
    await flushMicrotasks(2);
    const bbTutorAppHtml = env5.elements.get("main").innerHTML;
    assert(bbTutorAppHtml.includes("tc-req-card") && bbTutorAppHtml.includes("Актуален сегодня") && bbTutorAppHtml.includes("на руки 95%") && bbTutorAppHtml.includes("Календарь учеников") && bbTutorAppHtml.includes("Ученики ищут") && bbTutorAppHtml.includes("side-badge-jump"), "expected bb-app-role=tutor in brandbook to display Tutor Cabinet card, 7-item teacher sidebar with jump badge, and 95% payout");
    clickAction(env5, { a: "bb-app-role", role: "student" });
    await flushMicrotasks(2);

    clickAction(env5, { a: "bb-reduced-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="land-page is-reduced"') && env5.elements.get("main").innerHTML.includes("Reduced Motion: ВКЛ ✓"), "expected bb-reduced-toggle to apply .is-reduced class to brandbook page");
    clickAction(env5, { a: "bb-reduced-toggle" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("main").innerHTML.includes("is-reduced"), "expected second bb-reduced-toggle click to restore normal motion");

    clickAction(env5, { a: "bb-mode", v: "dark" });
    await flushMicrotasks(2);
    const bbDarkSynced = env5.elements.get("main").innerHTML;
    const surfSlice = bbDarkSynced.slice(bbDarkSynced.indexOf('id="bb-surfaces"'), bbDarkSynced.indexOf('id="bb-fonts"'));
    const yakSlice = bbDarkSynced.slice(bbDarkSynced.indexOf('id="bb-yakutia"'), bbDarkSynced.indexOf('id="bb-buttons"'));
    assert(!surfSlice.includes("cols-3") && surfSlice.includes('class="bb-pane is-dark"') && !yakSlice.includes('class="bb-cols"'), "expected bb-mode=dark to sync #bb-surfaces and #bb-yakutia to dark-only panes");
    clickAction(env5, { a: "bb-mode", v: "both" });
    await flushMicrotasks(2);

    clickAction(env5, { a: "go", v: "landing" });
    await flushMicrotasks(2);
    const landFullHtml = env5.elements.get("main").innerHTML;
    assert(landFullHtml.includes('id="land-match"') && landFullHtml.includes('class="land-hero-banner"'), "expected hero banner and quick match on landing");
    assert(landFullHtml.includes("Найти ниже рынка") && landFullHtml.includes("Попробовать бета-тест") && landFullHtml.includes("hero-cta-secondary") && !landFullHtml.includes("hero-banner-form"), "expected hero banner gold and blue CTAs without top search form");
    assert(landFullHtml.includes("savings-bar-fill gold-fill") && landFullHtml.includes("savings-gold-txt") && landFullHtml.includes("Вектор ЕГЭ · твоя ставка"), "expected Sakha Gold Вектор ЕГЭ твоя ставка progress bar and text class");
    assert(!landFullHtml.includes("land-search-strip") && !landFullHtml.includes("hh-blue-banner") && !landFullHtml.includes("hero-iphone-bezel") && landFullHtml.includes("/assets/lena-pillars.jpg"), "expected Lena Pillars hero without iPhone or search strip or blue brandbook banner");
    assert(landFullHtml.includes("sakha-divider is-gold-logo") && landFullHtml.includes("sakha-gold-emblem") && !landFullHtml.includes("Оһуор · Саха сирэ · Вектор ЕГЭ"), "expected single gold circular logo bottom divider without text label");
    assert(landFullHtml.includes("hh-slider-ticks ruler") && landFullHtml.includes("btn sakha-pattern") && landFullHtml.includes("Сөп · Предложить"), "expected ruler ticks and rounded Sakha CTA");
    assert(landFullHtml.includes('id="land-rates"') && landFullHtml.includes('id="land-verify"') && !landFullHtml.includes('id="land-ai-study"') && !landFullHtml.includes("ИИ разбирает ошибки") && !landFullHtml.includes("35–53%") && !landFullHtml.includes("до 53%") && !landFullHtml.includes("−53%"), "expected rates and verify sections with AI showcase and 53% claims removed");
    assert(landFullHtml.includes("land-trust-strip") && landFullHtml.includes('id="land-reviews"') && landFullHtml.includes("review-rating") && landFullHtml.includes("tutor-perks-grid"), "expected trust strip, upgraded reviews with rating, and balanced tutor perks grid");
    assert(landFullHtml.includes('class="btn soft sm" data-a="go" data-v="fees"') && landFullHtml.includes('data-a="tutor-apply-open"') && landFullHtml.includes('class="land-footer small muted"') && landFullHtml.includes("is-sakha") && landFullHtml.includes("land-mobile-sticky"), "expected equal #land-tutors buttons, clean footer with icons, and sticky mobile CTA");
    assert(
      !landFullHtml.includes("Комиссия 5%") && !landFullHtml.includes("760 ₽"),
      "expected expanded landing sections to keep 5% commission split off /landing"
    );

    clickAction(env5, { a: "match-subj-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="match-subj-pick"'), "expected quick-match hh-select subject menu to open");
    clickAction(env5, { a: "match-subj-pick", v: "bio" });
    clickAction(env5, { a: "match-tier", v: "pro" });
    clickAction(env5, { a: "match-apply" });
    await flushMicrotasks(3);
    const matchAppliedToast = env5.elements.get("toast");
    assert(
      matchAppliedToast && matchAppliedToast.className === "toast is-side" && matchAppliedToast.innerHTML.includes("Подборка применена"),
      "expected quick-match apply to trigger side toast notification"
    );
    assert(env5.elements.get("main").innerHTML.includes('id="land-market"') && !env5.elements.get("main").innerHTML.includes('data-a="match-subj-pick"'), "expected quick-match apply to close dropdown and filter marketplace");

    clickAction(env5, { a: "demo-tab", tab: "calc" });
    await flushMicrotasks(2);
    const demoCalcHtml = env5.elements.get("main").innerHTML;
    assert(demoCalcHtml.includes('id="demo-calc-box"') && demoCalcHtml.includes("demo-rate-stepper") && demoCalcHtml.includes('data-a="demo-step"') && !demoCalcHtml.includes("09:00"), "expected structured rate calculator with brandbook stepper and 10:00-20:00 window");
    clickAction(env5, { a: "demo-step", step: "100" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "1 100 ₽/ч"), "expected demo-step action to increment calculator rate cleanly");

    clickAction(env5, { a: "land-faq", i: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="land-faq" data-i="1" aria-expanded="true"'), "expected FAQ item 1 to expand on click");

    clickAction(env5, { a: "tutor-apply-open" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="ta-modal-title"'), "expected tutor application modal to open");
    clickAction(env5, { a: "tutor-apply-step", step: "100" });
    clickAction(env5, { a: "tutor-apply-step", step: "100" });
    clickAction(env5, { a: "tutor-apply-step", step: "100" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("modal-root").innerHTML, "1 400 ₽/ч") && env5.elements.get("modal-root").innerHTML.includes("Выше рынка · Профи"), "expected tutor apply stepper to reach 1 400 ₽/ч with Pro qualification hint");
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tutor-apply" } }) }, preventDefault() {} });
    assert(env5.elements.get("modal-root").innerHTML.includes("Укажи имя и фамилию преподавателя."), "expected validation error when submitting empty tutor application");
    env5.elements.set("ta-name", { value: "Анна Соколова" });
    env5.elements.set("ta-subj", { value: "bio" });
    env5.elements.set("ta-contact", { value: "t.me/anna_bio" });
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tutor-apply" } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected tutor apply modal closed after valid submit");
    const tutorSideToast = env5.elements.get("toast");
    assert(tutorSideToast && tutorSideToast.className === "toast is-side" && tutorSideToast.innerHTML.includes("Анкета принята на проверку"), "expected side notification after submitting tutor application");
    assert(env5.elements.get("main").innerHTML.includes("✓ Анкета отправлена (Анна Соколова)"), "expected #land-tutors button to transition to green confirmed state");

    clickAction(env5, { a: "book-open", id: globalThis.EGE.tutors.LIST[0].id, hour: "14:00" });
    await flushMicrotasks(2);
    const modalBookHtml = env5.elements.get("modal-root").innerHTML;
    assert(modalBookHtml.includes('id="bid-submit-btn"') && modalBookHtml.includes("btn sakha-pattern") && modalBookHtml.includes("Сөп · Предложить"), "expected booking modal to use rounded Sakha pattern CTA button for Предложить");
    clickAction(env5, { a: "book-close" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("main").innerHTML.includes("wa-btn") && !env5.elements.get("main").innerHTML.includes("bid-stepper"), "expected zero legacy wa-btn or bid-stepper classes remaining in rendered landing HTML");

    clickAction(env5, { a: "mkt-reset" });
    await flushMicrotasks(2);

    // 8. Проверка выбора роли при входе (по умолчанию — ученик), 5-вкладочного .tabbar и личного кабинета преподавателя
    clickAction(env5, { a: "auth-modal-open" });
    await flushMicrotasks(3);
    const authModalDefault = env5.elements.get("modal-root").innerHTML;
    assert(
      authModalDefault.includes('class="auth-modal-shell"') &&
      authModalDefault.includes('class="hh-seg equal"') &&
      authModalDefault.includes('class="auth-actions-row"') &&
      authModalDefault.includes('class="auth-foot-row"') &&
      authModalDefault.includes('data-a="auth-role" data-role="student" aria-pressed="true"') &&
      authModalDefault.includes('data-a="auth-role" data-role="tutor" aria-pressed="false"'),
      "expected auth modal role selector to default to Как ученик with clean .hh-seg.equal and bounded shell"
    );
    clickAction(env5, { a: "auth-guest" });
    await flushMicrotasks(6);
    const studentSideHtml = env5.elements.get("side-nav").innerHTML;
    const studentTabHtml = env5.elements.get("tabbar").innerHTML;
    const studentMainHtml = env5.elements.get("main").innerHTML;
    assert(studentSideHtml.includes("Репетиторы") && studentSideHtml.includes("Справочник") && studentTabHtml.includes("Справочник"), "expected 5-tab nav with Справочник for student");
    assert(studentMainHtml.includes("Тесты ЕГЭ") && !studentMainHtml.slice(0, studentMainHtml.indexOf("grid-3")).includes('data-v="tutor"'), "expected Тесты ЕГЭ hub without duplicate top Справочник button in head");
    assert(!readFileText("frontend/index.html").includes('id="top-market"'), "expected top-market removed from mobile topbar");

    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Подбор репетитора"), "expected market view");

    clickAction(env5, { a: "go", v: "profile" });
    await flushMicrotasks(3);
    assert(env5.elements.get("main").innerHTML.includes("Режим кабинета"), "expected role switcher inside Profile");

    // Переключение в режим преподавателя через окно входа -> Личный кабинет преподавателя
    clickAction(env5, { a: "auth-modal-open" });
    await flushMicrotasks(3);
    clickAction(env5, { a: "auth-role", role: "tutor" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('data-role="tutor" aria-pressed="true"'), "expected auth modal to highlight Как преподаватель");
    clickAction(env5, { a: "auth-guest" });
    await flushMicrotasks(6);

    const tutorMain1 = env5.elements.get("main").innerHTML;
    const tutorSideHtml = env5.elements.get("side-nav").innerHTML;
    const tutorTabHtml = env5.elements.get("tabbar").innerHTML;
    assert(tutorMain1.includes("Личный кабинет преподавателя") && tutorMain1.includes("tc-req-card") && tutorMain1.includes('id="tc-first-pending"') && tutorMain1.includes("На руки 95%") && tutorMain1.includes("Поднять анкету (раз в 4 ч)"), "expected full Teacher Personal Cabinet view with 4h bump CTA and #tc-first-pending");
    assert(!tutorMain1.includes("tc-role-bar") && tutorMain1.includes("is-gold-logo") && !tutorMain1.includes('role="tablist"'), "expected tc-role-bar and desktop tablist removed, keeping only gold line with centered emblem");
    assert(env5.elements.get("top-balance-slot").hidden === true && env5.elements.get("side-foot").innerHTML.includes('id="side-balance-slot" class="side-bal-slot" hidden') && !env5.elements.get("side-foot").innerHTML.includes(">Препод<") && env5.elements.get("side-foot").innerHTML.includes("Преподаватель"), "expected student balance hidden in both slots and full Преподаватель label in tutor mode");
    assert(env5.elements.get("side-subjects-wrap").hidden === true && env5.elements.get("side-subjects").innerHTML === "", "expected student ПРЕДМЕТЫ list hidden in tutor mode sidebar");
    assert(!tutorSideHtml.includes("Каталог") && !tutorSideHtml.includes('data-v="market"'), "expected Каталог removed completely from teacher sidebar");
    for (const label of ["Заявки", "Календарь учеников", "Мои ученики", "Ученики ищут", "Профиль", "Выплаты", "Справочник"]) {
      assert(tutorSideHtml.includes(label), `expected teacher sidebar nav item: ${label}`);
    }
    assert(tutorSideHtml.includes('data-a="tc-jump-pending"') && tutorSideHtml.includes("side-badge-jump"), "expected clickable pending badge (2) next to Заявки in left sidebar");
    assert(tutorTabHtml.includes("Заявки") && tutorTabHtml.includes("Календарь") && tutorTabHtml.includes("Ученики") && tutorTabHtml.includes("Профиль") && tutorTabHtml.includes("Выплаты"), "expected tutor 5-tab bottom bar (Заявки, Календарь, Ученики, Профиль, Выплаты)");

    // Клик по цифре 2 (tc-jump-pending) с другой страницы автоматически возвращает на Заявки
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "tc-jump-pending" });
    await flushMicrotasks(3);
    assert(env5.elements.get("main").innerHTML.includes('id="tc-first-pending"') && env5.elements.get("side-nav").innerHTML.includes('data-v="tutor-requests" aria-current="page"'), "expected clicking pending count badge (2) to auto-jump straight to Заявки");

    clickAction(env5, { a: "tc-bump" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("✓ Поднята · через") && env5.elements.get("main").innerHTML.includes("data-tc-manual-countdown") && env5.elements.get("toast").innerHTML.includes("Анкета поднята в топ"), "expected tc-bump to enter 4h cooldown state with side toast");
    clickAction(env5, { a: "tc-bump" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Повторить можно через"), "expected immediate second manual bump within 4h to show cooldown message");

    clickAction(env5, { a: "tc-req-step", id: "tc-req-1", step: "100" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "1 200 ₽/ч") && env5.elements.get("main").innerHTML.includes("Отправить контр-ставку"), "expected tc-req-step to step incoming offer +100 and reveal counter CTA");

    clickAction(env5, { a: "tc-req-accept", id: "tc-req-1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Написать ученику") && env5.elements.get("toast").innerHTML.includes("Урок подтверждён"), "expected tc-req-accept to confirm lesson and show side toast");

    clickAction(env5, { a: "tc-slot-toggle", hour: "13:00" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="tc-slot-toggle" data-hour="13:00" aria-pressed="true"'), "expected tc-slot-toggle to toggle 13:00 availability slot");

    // Профиль: прямой вход из левого сайдбара, единый мультивыбор с × внутри, фото/Без фото, Якутск/Москва + UTC, ручные навыки, до 2 плашек и публикация в /market
    clickAction(env5, { a: "go", v: "tutor-profile" });
    await flushMicrotasks(2);
    const tcProfHtml = env5.elements.get("main").innerHTML;
    assert(
      !tcProfHtml.includes("Профиль hh") &&
      !tcProfHtml.includes("hh-multi-chips") &&
      !tcProfHtml.includes("tc-skill-toggle") &&
      tcProfHtml.includes("Заполненность профиля") &&
      tcProfHtml.includes("tc-hh-meter") &&
      tcProfHtml.includes("hh-multi-x") &&
      tcProfHtml.includes("Без фото") &&
      tcProfHtml.includes("Якутск") &&
      tcProfHtml.includes("Москва") &&
      tcProfHtml.includes("UTC+9"),
      "expected unified Profile builder with single pill multi-select + internal ×, photo/no-photo, Якутск/Москва + UTC, and manual customSkills without presets"
    );
    clickAction(env5, { a: "tc-subj-toggle" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-subj-pick", v: "chem" });
    clickAction(env5, { a: "tc-city-pick", v: "Москва" });
    clickAction(env5, { a: "tc-tz-pick", v: "UTC+3" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "tc-preview-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Живой вид вашей карточки для учеников") && env5.elements.get("main").innerHTML.includes("Без фото") && env5.elements.get("main").innerHTML.includes("Москва (UTC+3)"), "expected live tutor card preview with Без фото and Москва (UTC+3)");
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-profile" }, elements: { name: { value: "Анна Соколова" }, headline: { value: "Эксперт ЕГЭ · СФУ" }, subject: { value: "bio" }, badge0: { value: "Эксперт жюри ВсОШ" }, badge1: { value: "К.б.н. · автор задач" }, customSkills: { value: "ФИПИ 2027, №28 Генетика" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    const publishedTutor = globalThis.EGE.tutors.LIST.find((t) => t.id === "tc-my-profile");
    assert(env5.elements.get("main").innerHTML.includes("Опубликована для учеников") && publishedTutor && publishedTutor.name === "Анна Соколова" && publishedTutor.city === "Москва" && publishedTutor.timezone === "UTC+3" && publishedTutor.subjects.includes("chem") && Array.isArray(publishedTutor.customBadges) && publishedTutor.customBadges.length === 2, "expected submitted profile to publish city/UTC, multi-subject & up to 2 custom badges live into EGE.tutors.LIST");

    // Календарь записанных учеников (ТОЛЬКО подтверждённые ученики) + ручная запись ученика в слот
    clickAction(env5, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    const tcCalHtml = env5.elements.get("main").innerHTML;
    assert(tcCalHtml.includes("Календарь записанных учеников") && tcCalHtml.includes("Алина С.") && !tcCalHtml.includes("Тимур К."), "expected calendar to show ONLY confirmed/accepted students (Алина С.) and exclude pending (Тимур К.)");
    clickAction(env5, { a: "tc-cal-open-add", hour: "11:00" });
    await flushMicrotasks(2);
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-cal-add" }, elements: { studentName: { value: "Максим Р." }, hour: { value: "11:00" }, offerPrice: { value: "1300" }, note: { value: "Генетика №28" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Максим Р.") && env5.elements.get("main").innerHTML.includes("Генетика №28"), "expected manually booked student to appear in hourly calendar");

    // Вкладка преподавателя «Ученики ищут» (заявки учеников без дубля 11 предметных чипов + отклик)
    clickAction(env5, { a: "go", v: "tutor-leads" });
    await flushMicrotasks(2);
    const tcLeadsHtml = env5.elements.get("main").innerHTML;
    assert(tcLeadsHtml.includes("Заявки учеников, которые ищут преподавателя") && !tcLeadsHtml.includes('data-a="tc-leads-subj"') && tcLeadsHtml.includes('data-a="tc-leads-mode"') && tcLeadsHtml.includes("Химия"), "expected clean student requests tab in Ученики ищут without duplicate subject chip bar");
    const mLeadOffer = /data-a="tc-lead-offer" data-id="([^"]+)"/.exec(tcLeadsHtml);
    assert(Boolean(mLeadOffer), "expected tc-lead-offer response CTA button on student lead card");
    clickAction(env5, { a: "tc-lead-offer", id: mLeadOffer[1] });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("✓ Отклик отправлен"), "expected teacher response to mark student lead as responded");

    // Мои ученики (трекер баллов ЕГЭ + напоминание о скором уроке в WhatsApp + настройка автоуведомлений)
    clickAction(env5, { a: "go", v: "tutor-students" });
    await flushMicrotasks(2);
    const tcStudentsHtml = env5.elements.get("main").innerHTML;
    assert(
      tcStudentsHtml.includes("Мои ученики и автоуведомления") &&
      tcStudentsHtml.includes("Напомнить: скоро урок (Воскресенье, 10:00)") &&
      tcStudentsHtml.includes("tc-wa-global-toggle") &&
      tcStudentsHtml.includes("Тест в WhatsApp"),
      "expected lesson reminder CTA and configurable WhatsApp auto-notification panel in Мои ученики"
    );
    clickAction(env5, { a: "tc-student-remind", id: "st-alina" });
    clickAction(env5, { a: "tc-wa-lead", v: "1h" });
    clickAction(env5, { a: "tc-student-score", id: "st-alina", delta: "2" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("78") && env5.elements.get("main").innerHTML.includes('data-a="tc-wa-lead" data-v="1h"'), "expected +2 score increment and WhatsApp reminder lead toggle");

    // Выплаты и статистика: KPIs + Статистика преподавателя + Цель дохода + Автопродвижение 24ч + Последнее автопродвижение
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tcPayoutsHtml = env5.elements.get("main").innerHTML;
    assert(
      tcPayoutsHtml.includes("Чистый доход (95%)") &&
      tcPayoutsHtml.includes("Проведено уроков") &&
      tcPayoutsHtml.includes("Заработано за месяц") &&
      tcPayoutsHtml.includes("Ставка в анкете") &&
      tcPayoutsHtml.includes("Автопродвижение каждые 24 часа") &&
      tcPayoutsHtml.includes("Последнее автопродвижение") &&
      tcPayoutsHtml.includes("data-tc-countdown") &&
      tcPayoutsHtml.includes("Статистика преподавателя") &&
      tcPayoutsHtml.includes("Цель дохода на месяц"),
      "expected Выплаты dashboard to show net income KPIs, 24h auto-bump + timestamp, 4h manual bump, stats chart and monthly goal"
    );
    clickAction(env5, { a: "tc-stats-period", v: "30d" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("прогноз за месяц"), "expected 30d period switch in Выплаты stats");
    clickAction(env5, { a: "tc-autobump-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Автоподнятие на паузе"), "expected 24h auto-bump toggle to pause");
    clickAction(env5, { a: "tc-autobump-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Автоподнятие 24 ч активно"), "expected 24h auto-bump toggle to reactivate");

    // Каталог /market фильтр городов: строго Якутск и Москва + Без фото
    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(3);
    clickAction(env5, { a: "mkt-city", v: "Якутск" });
    await flushMicrotasks(2);
    const mktYakHtml = env5.elements.get("main").innerHTML;
    assert(mktYakHtml.includes("UTC+9") && mktYakHtml.includes("Без фото") && mktYakHtml.includes('data-k="city"'), "expected Якутск city filter chip, UTC+9 and Без фото tutor avatar on /market");
    clickAction(env5, { a: "mkt-city", v: "Москва" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Москва (UTC+3)"), "expected Москва (UTC+3) tutors when filtered to Москва");
    clickAction(env5, { a: "mkt-reset" });
    await flushMicrotasks(2);

    // Проверка /brandbook: наличие интерактивного мультивыбора (.hh-multi) и виджета баланса
    clickAction(env5, { a: "go", v: "brandbook" });
    await flushMicrotasks(3);
    const bbHtml1 = env5.elements.get("main").innerHTML;
    assert(bbHtml1.includes("bb-demo-multi") && bbHtml1.includes("top-bal-wrap") && !bbHtml1.includes("Препод · ЕГЭ"), "expected Brandbook to showcase interactive hh-multi and balance pill with full Преподаватель label");
    clickAction(env5, { a: "bb-multi-toggle" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes('class="hh-select hh-multi open"') && env5.elements.get("main").innerHTML.includes('aria-multiselectable="true"'), "expected bb-multi-toggle to open Brandbook multi-select dropdown");
    clickAction(env5, { a: "bb-multi-pick", v: "rus" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Русский язык"), "expected bb-multi-pick to select additional subject in Brandbook");

    clickAction(env5, { a: "role-set", role: "student" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Тесты ЕГЭ"), "expected role-set back to student to return cleanly to Тесты ЕГЭ");

    out("APP_SMOKE_TESTS_OK");
  }

  main().catch((err) => {
    out(String(err) + (err && err.stack ? "\n" + err.stack : ""));
    if (isNode) process.exit(1);
    if (typeof quit === "function") quit(1);
    throw err;
  });
})();
