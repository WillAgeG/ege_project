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

    for (const id of ["main", "side-nav", "side-subjects", "side-foot", "tabbar", "toast", "tip"]) {
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

    // 1. Проверка банка и режима локального браузера
    const env1 = installGlobals({});
    loadScripts(dataScripts);
    const bank = globalThis.EGE.loadBank();
    assert(Object.keys(bank.SUBJ).length === 3, "expected 3 subjects (bio, rus, chem)");
    assert(Object.keys(bank.TOPICS).length > 30, "expected many topics");
    assert(Object.keys(bank.QS).length > 100, "expected loaded question bank");
    vmRun(readFileText("app.js"), "app.js");
    await flushMicrotasks(12);
    const main1 = env1.elements.get("main").innerHTML;
    assert(main1.includes("Привет"), "local home greeting missing");
    assert(main1.includes("Данные сохраняются только в этом браузере"), "local notice missing");

    // 2. Проверка бэкенд-режима: неавторизованный старт -> регистрация с миграцией -> ИИ стрим -> выход
    const serverDocs = {};
    const requests = [];
    const enc = new (installGlobals({}).TextEncoder || globalThis.TextEncoder)();
    let authedUser = null;

    const env2 = installGlobals({
      host: { backend: true },
      localStorage: {
        "put-v-medicinu:v1": JSON.stringify({
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
    assert(homePreLogin.includes("Продолжить через Google"), "expected Google OAuth button on auth screen");
    assert(homePreLogin.includes("Продолжить без аккаунта"), "expected guest fallback button on auth screen");
    assert(!homePreLogin.includes("Давай настроим подготовку"), "should not show onboarding before login on backend");

    // Гостевой режим без входа -> затем возврат на экран входа
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-guest" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(10);
    assert(!env2.body.dataset.auth, "expected auth flag cleared in guest mode");
    assert(env2.elements.get("main").innerHTML.includes("Гостевой режим"), "expected guest notice on home");

    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-screen" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    assert(env2.body.dataset.auth === "1", "expected return to auth gate");

    // Переключаемся на регистрацию
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-tab", tab: "register" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const regHtml = env2.elements.get("main").innerHTML;
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
    assert(env2.elements.get("main").innerHTML.includes("Пароли не совпадают"), "expected password mismatch error");

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
    assert(env2.elements.get("main").innerHTML.includes("Неверный код приглашения"), "expected invite error rendered");

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
    assert(!env2.lsMap["put-v-medicinu:v1"], "expected localStorage cleared after migration");
    const homeAuthed = env2.elements.get("main").innerHTML;
    assert(homeAuthed.includes("Привет, Оля!"), "expected personalized greeting after login");
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

    out("APP_SMOKE_TESTS_OK");
  }

  main().catch((err) => {
    out(String(err) + (err && err.stack ? "\n" + err.stack : ""));
    if (isNode) process.exit(1);
    if (typeof quit === "function") quit(1);
    throw err;
  });
})();
