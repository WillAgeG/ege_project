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
      const classes = new Set();
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
        classList: {
          add(c) { classes.add(c); },
          remove(c) { classes.delete(c); },
          contains(c) { return classes.has(c); },
          toggle(c, force) {
            if (force === undefined) {
              if (classes.has(c)) { classes.delete(c); return false; }
              classes.add(c); return true;
            }
            if (force) classes.add(c);
            else classes.delete(c);
            return !!force;
          }
        },
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

    for (const id of ["main", "side-nav", "side-subjects-wrap", "side-subjects", "side-foot", "top-balance-slot", "tutor-balance-dock", "tabbar", "toast", "tip", "modal-root", "bug-mailto"]) {
      elements.set(id, makeEl(id));
    }

    function defGlobal(k, v) {
      Object.defineProperty(g, k, { value: v, configurable: true, writable: true, enumerable: true });
    }

    defGlobal("AbortController", function AbortController() {
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
    });

    defGlobal("TextDecoder", function TextDecoder() {
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
    });

    defGlobal("TextEncoder", function TextEncoder() {
      this.encode = function (str) {
        const s = unescape(encodeURIComponent(String(str)));
        const arr = new Uint8Array(s.length);
        for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
        return arr;
      };
    });

    defGlobal("localStorage", {
      getItem(k) { return Object.prototype.hasOwnProperty.call(lsMap, k) ? lsMap[k] : null; },
      setItem(k, v) { lsMap[k] = String(v); },
      removeItem(k) { delete lsMap[k]; },
      _dump() { return lsMap; }
    });

    defGlobal("location", { hash: opts.hash || "", search: opts.search || "", pathname: "/" });
    defGlobal("history", {
      replaceState(_s, _t, u) {
        if (typeof u === "string") {
          if (u.startsWith("#")) g.location.hash = u;
          else if (!u.includes("?")) g.location.search = "";
        }
      }
    });
    defGlobal("matchMedia", () => ({ matches: false, addEventListener() {} }));
    if (typeof g.clearTimeout === "undefined") defGlobal("clearTimeout", () => {});
    if (typeof g.console === "undefined") defGlobal("console", { log: out, warn() {}, error: out });

    const rootClasses = new Set();
    defGlobal("document", {
      visibilityState: "visible",
      activeElement: null,
      body: makeEl("body"),
      documentElement: {
        dataset: {},
        style: {},
        classList: {
          add(c) { rootClasses.add(c); },
          remove(c) { rootClasses.delete(c); },
          contains(c) { return rootClasses.has(c); },
          toggle(c, force) {
            if (force === undefined) {
              if (rootClasses.has(c)) { rootClasses.delete(c); return false; }
              rootClasses.add(c); return true;
            }
            if (force) rootClasses.add(c);
            else rootClasses.delete(c);
            return !!force;
          }
        }
      },
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
    });

    defGlobal("window", g);
    g.window.scrollTo = () => {};
    g.window.addEventListener = (ev, fn) => { (winListeners[ev] || (winListeners[ev] = [])).push(fn); };
    defGlobal("devicePixelRatio", 1);
    defGlobal("EGE_HOST", opts.host);
    defGlobal("claude", opts.claude);
    defGlobal("fetch", opts.fetch);
    defGlobal("BroadcastChannel", undefined);
    defGlobal("WebSocket", undefined);
    defGlobal("EventSource", undefined);

    return {
      elements,
      lsMap,
      body: g.document.body,
      documentElement: g.document.documentElement,
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
    Object.defineProperty(g, "EGE", { value: { subjects: [], tableEdits: [], plan: null, essay: null }, configurable: true, writable: true, enumerable: true });
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
    assert(scripts.length >= 30 && scripts.includes("core/api.js") && scripts.includes("views/admin.js") && scripts[scripts.length - 1] === "app.js", "expected index.html scripts including core/api.js and views/admin.js");
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
    assert(homePreLogin.includes("Вектор") && homePreLogin.includes("brand-wordmark") && homePreLogin.includes("brand-mark"), "expected new brand name and SVG logo on auth screen");
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
    assert(afterLeadHtml.includes("Опубликовано для преподавателей") && afterLeadHtml.includes('id="student-leads-table"') && afterLeadHtml.includes("bb-data-table") && afterLeadHtml.includes("data-label=") && afterLeadHtml.includes("Химия") && afterLeadHtml.includes("Биология"), "expected submitted multi-subject student lead to render in Brandbook #student-leads-table");

    // Модель гарантии возврата 1-го урока (активная кнопка на Анне Соколовой, серая на Илье Николаеве), условная галочка verified и СБП-пополнение от 490 ₽
    clickAction(env4, { a: "go", v: "market" });
    await flushMicrotasks(4);
    const marketViewHtml = env4.elements.get("main").innerHTML;
    const nikCard = marketViewHtml.split("</article>").find((c) => c.includes("Илья Николаев")) || "";
    assert(
      marketViewHtml.includes('class="btn soft sm trial-guar-btn is-active"') &&
      marketViewHtml.includes("Возврат за 1-й урок") &&
      marketViewHtml.includes('class="btn ghost sm trial-guar-btn is-grey"') &&
      marketViewHtml.includes("Без бесплатного 1-го") &&
      marketViewHtml.includes("verified-badge") &&
      nikCard.includes("Илья Николаев") &&
      !nikCard.includes("verified-badge"),
      "expected per-tutor 1st-lesson guarantee status (green vs grey) and conditional verified checkmark (absent on unverified Илья Николаев)"
    );
    clickAction(env4, { a: "book-open", id: "tut-nikolaev" });
    await flushMicrotasks(2);
    const nikModalHtml = env4.elements.get("modal-root").innerHTML;
    assert(
      nikModalHtml.includes('class="trial-guar-box is-grey"') &&
      nikModalHtml.includes("Преподаватель не хочет проводить первый урок бесплатно") &&
      nikModalHtml.includes("tutor-modal-head") &&
      !nikModalHtml.includes('data-a="book-mode"'),
      "expected non-guarantee tutor modal to display grey explanation box without horizontal mode tabs"
    );
    clickAction(env4, { a: "book-close" });
    await flushMicrotasks(2);
    clickAction(env4, { a: "bal-open" });
    await flushMicrotasks(2);
    const balModalHtml = env4.elements.get("modal-root").innerHTML;
    assert(
      balModalHtml.includes("Баланс и пополнение") &&
      balModalHtml.includes("первый платёж от 490 ₽") &&
      balModalHtml.includes('data-a="bal-method" data-v="sbp"') &&
      balModalHtml.includes('data-a="bal-method" data-v="card"') &&
      balModalHtml.includes("+3%") &&
      balModalHtml.indexOf('data-v="card"') < balModalHtml.indexOf('id="bal-custom-amount"') &&
      balModalHtml.includes("bal-flat-sec") &&
      !balModalHtml.includes("bal-plan-grid") &&
      !balModalHtml.includes("wallet-bar") &&
      !balModalHtml.includes("hh-notice-card") &&
      !balModalHtml.includes("notice warn"),
      "expected tariffless flat top-up sheet with method selector (SBP 0% vs Card +3%) above amount input and no rounded wrapper boxes"
    );
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "300" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("Первое пополнение на занятия — минимум 490 ₽"), "expected first top-up below 490 ₽ to be rejected");
    clickAction(env4, { a: "bal-method", v: "card" });
    await flushMicrotasks(2);
    const balCardHtml = env4.elements.get("modal-root").innerHTML;
    assert(
      balCardHtml.includes('id="bal-card-num"') &&
      balCardHtml.includes('id="bal-card-exp"') &&
      balCardHtml.includes('id="bal-card-cvc"') &&
      balCardHtml.includes("Комиссия карты 3%"),
      "expected selecting Add Card to reveal card inputs and +3% fee calculation"
    );
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "1000" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("Укажите 16 цифр карты"), "expected incomplete card fields to be rejected when card method is active");
    clickAction(env4, { a: "bal-method", v: "sbp" });
    await flushMicrotasks(2);
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "6500" } } }) }, preventDefault() {} });
    await flushMicrotasks(3);
    assert(hasNum(env4.elements.get("side-foot").innerHTML, "6 500") && hasNum(env4.elements.get("top-balance-slot").innerHTML, "6 500"), "expected custom top-up to reach 6500 ₽ and sync both bottom-left & top-right student balance");
    if (env4.elements.get("modal-root").innerHTML.trim()) clickAction(env4, { a: "bal-close" });
    clickAction(env4, { a: "trial-open", id: "tut-sokolova" });
    await flushMicrotasks(2);
    const sokModalHtml = env4.elements.get("modal-root").innerHTML;
    assert(sokModalHtml.includes('class="trial-guar-box is-active"') && sokModalHtml.includes('value="1200"'), "expected active 1st-lesson guarantee modal for tut-sokolova at hourly rate 1200 ₽");
    clickAction(env4, { a: "book-submit" });
    await flushMicrotasks(3);
    assert(hasNum(env4.elements.get("side-foot").innerHTML, "5 300") && hasNum(env4.elements.get("top-balance-slot").innerHTML, "5 300"), "expected 1 200 ₽ escrow reservation to reduce available balance from 6500 to 5300");
    assert(env4.elements.get("main").innerHTML.includes('id="student-bookings-table"') && env4.elements.get("main").innerHTML.includes("bb-data-table") && env4.elements.get("main").innerHTML.includes("data-label="), "expected #student-bookings-table Brandbook table on /market after booking");
    clickAction(env4, { a: "mkt-bk-cols", cols: "3" });
    await flushMicrotasks(3);
    assert(env4.elements.get("main").innerHTML.includes("bb-data-table cols-3"), "expected mkt-bk-cols=3 to re-render #student-bookings-table with 3 columns");
    clickAction(env4, { a: "mkt-bk-cols", cols: "5" });
    await flushMicrotasks(2);
    env4.emitDoc("input", { target: { id: "mkt-bk-q", value: "НесуществующийЗапрос", dataset: { a: "mkt-bk-q" } } });
    await flushMicrotasks(3);
    assert(env4.elements.get("main").innerHTML.includes("По выбранному фильтру откликов нет."), "expected mkt-bk-q input to filter and re-render #student-bookings-table");
    clickAction(env4, { a: "mkt-bk-filter", v: "all", clearQ: "1" });
    await flushMicrotasks(2);
    assert(env4.elements.get("main").innerHTML.includes("Соколова"), "expected mkt-bk-filter clearQ=1 to restore booking row");
    clickAction(env4, { a: "bal-open" });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("от 100 ₽"), "expected subsequent top-ups from 100 ₽ once initial 490 ₽ is paid");
    clickAction(env4, { a: "bal-method", v: "card" });
    await flushMicrotasks(2);
    env4.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "bal-custom" },
          elements: {
            amount: { value: "100" },
            cardNum: { value: "4276 1234 5678 9012" },
            cardExp: { value: "12/28" },
            cardCvc: { value: "789" }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(3);
    assert(
      hasNum(env4.elements.get("side-foot").innerHTML, "5 400") &&
      hasNum(env4.elements.get("top-balance-slot").innerHTML, "5 400") &&
      env4.elements.get("toast").innerHTML.includes("+3%"),
      "expected subsequent 100 ₽ card top-up (+3% gateway fee) to credit 100 ₽ cleanly to reach 5400 ₽ in both balance slots"
    );

    clickAction(env4, { a: "go", v: "study" });
    await flushMicrotasks(4);
    const studyBookedHtml = env4.elements.get("main").innerHTML;
    assert(studyBookedHtml.includes("Календарь ваших уроков") && studyBookedHtml.includes('id="study-schedule-table"') && studyBookedHtml.includes("bb-data-table") && studyBookedHtml.includes("data-label=") && studyBookedHtml.includes("https://wa.me/") && studyBookedHtml.includes("Соколова"), "expected enrolled tutor schedule in Brandbook #study-schedule-table and WhatsApp link in study view after booking");
    clickAction(env4, { a: "study-sched-cols", cols: "7" });
    await flushMicrotasks(3);
    assert(env4.elements.get("main").innerHTML.includes("bb-data-table cols-7"), "expected study-sched-cols=7 to re-render #study-schedule-table with 7 columns");
    env4.emitDoc("input", { target: { id: "study-sched-q", value: "НесуществующийСлот", dataset: { a: "study-sched-q" } } });
    await flushMicrotasks(3);
    assert(env4.elements.get("main").innerHTML.includes('data-label="Результат"'), "expected study-sched-q input to filter and re-render #study-schedule-table");
    clickAction(env4, { a: "study-sched-filter", v: "all", clearQ: "1" });
    clickAction(env4, { a: "study-sched-cols", cols: "5" });
    await flushMicrotasks(2);
    clickAction(env4, { a: "study-tab", tab: "chats" });
    await flushMicrotasks(4);
    assert(env4.elements.get("main").innerHTML.includes("hh-chat-list") && env4.elements.get("main").innerHTML.includes('id="study-chats-table"') && env4.elements.get("main").innerHTML.includes("bb-data-table") && env4.elements.get("main").innerHTML.includes("https://wa.me/"), "expected WhatsApp chat list in Brandbook #study-chats-table only for booked tutor in study chats tab");
    clickAction(env4, { a: "study-chats-cols", cols: "3" });
    await flushMicrotasks(3);
    assert(env4.elements.get("main").innerHTML.includes("bb-data-table cols-3"), "expected study-chats-cols=3 to re-render #study-chats-table with 3 columns");
    env4.emitDoc("input", { target: { id: "study-chats-q", value: "НетПреподавателя", dataset: { a: "study-chats-q" } } });
    await flushMicrotasks(3);
    assert(env4.elements.get("main").innerHTML.includes('data-label="Результат"'), "expected study-chats-q input to filter and re-render #study-chats-table");
    clickAction(env4, { a: "study-chats-filter", v: "all", clearQ: "1" });
    clickAction(env4, { a: "study-chats-cols", cols: "5" });
    await flushMicrotasks(2);

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
    assert(globalThis.EGE.tutors.SUBJECTS.length >= 16 && Array.isArray(globalThis.EGE.tutors.PREP_UNIVERSE) && Array.isArray(globalThis.EGE.tutors.LIVE_DEALS), "expected broadened 16 subjects (exam + skill), marquee universe and live deals");
    assert(globalThis.EGE.tutors.CATALOG_TOTAL === 2480 && globalThis.EGE.tutors.LIST.length >= 30, "expected 2480+ catalog positioning and 30+ tutors");
    const egeSubjs = globalThis.EGE.tutors.subjectsForExam("ЕГЭ").map((s) => s.short);
    const allSubjs = globalThis.EGE.tutors.subjectsForExam("all").map((s) => s.short);
    assert(
      egeSubjs.length === 11 && egeSubjs.includes("Обществознание") && egeSubjs.includes("Литература") && egeSubjs.includes("География") &&
      !egeSubjs.includes("Программирование") && !egeSubjs.includes("Дзюдо") && !egeSubjs.includes("Вокал / Гитара") &&
      allSubjs.includes("Программирование") && allSubjs.includes("Дзюдо") && allSubjs.includes("Шахматы") && allSubjs.includes("Вокал / Гитара"),
      "expected ЕГЭ/ОГЭ to show all 11 school exam subjects and Все to add programming, judo, chess, vocals"
    );
    assert(globalThis.EGE.tutors.HOURS[0] === "10:00" && globalThis.EGE.tutors.HOURS[globalThis.EGE.tutors.HOURS.length - 1] === "20:00", "expected 10:00..20:00 hourly slots");
    assert(new Set(globalThis.EGE.tutors.LIST.map((t) => t.source)).size >= 3 && globalThis.EGE.tutors.LIST.every((t) => Boolean(t.source) && t.availableFrom && t.availableTo && (t.tier === "pro" ? (t.price > t.marketPrice && t.abovePct > 0 && t.aboveRub > 0) : (t.marketPrice > t.price && t.belowPct > 0 && t.belowRub > 0))), "expected multi-channel sources, window and below/above-market metadata on all tutors");

    const landHtml = env5.elements.get("main").innerHTML;
    assert(
      landHtml.includes("Назначай цену сам — репетиторы дешевле рынка") &&
      landHtml.includes("Проверенные преподаватели, слоты в любое время и безопасная оплата через СБП") &&
      landHtml.includes("hero-cta-primary") &&
      landHtml.includes("hero-float-card") &&
      !landHtml.includes("hero-cta-secondary") &&
      !landHtml.includes("Попробовать бета-тест") &&
      !landHtml.includes("15–30%") &&
      landHtml.includes('data-countup="2480"') &&
      landHtml.includes('data-countup="30"') &&
      landHtml.includes('data-countup="24"') &&
      landHtml.includes("Самая большая база проверенных репетиторов"),
      "expected updated Gemini Hero CTA + cards, countup KPIs, single 30% figure, and big-base subtitle"
    );
    const heroSeen = new Set();
    for (let v = 0; v < 5; v++) {
      const curH = env5.elements.get("main").innerHTML;
      const mH1 = /class="hero-banner-h1">([^<]+)</.exec(curH);
      if (mH1) heroSeen.add(mH1[1]);
      clickAction(env5, { a: "hero-copy-next" });
      await flushMicrotasks(1);
    }
    assert(heroSeen.size === 5, "expected 5 distinct rotating Hero copy variants");
    // Упрощённый лендинг: Hero (чёрный фон) -> бесконечная лента анкет (8 -> 16 -> 24 -> 30, без «Конец списка») -> простая линия и 4-ссылочный футер
    const landTopHtml = landHtml.slice(0, landHtml.indexOf("</header>"));
    assert(
      !landTopHtml.includes('data-a="theme-toggle"') &&
      landTopHtml.includes('class="brand-home-link"') &&
      landTopHtml.includes('data-a="land-scroll" data-target="land-market"') &&
      readFileText("frontend/index.html").includes('data-a="brand-go-tutors"') &&
      landHtml.includes('class="land-hero-banner is-gemini-hero"') &&
      landHtml.includes('id="land-market"') &&
      landHtml.includes('class="hh-seg hh-sort-seg"') &&
      landHtml.includes("По соответствию") &&
      landHtml.includes("Дешевле") &&
      landHtml.includes("По рейтингу") &&
      !landHtml.includes("sakha-pattern") &&
      !landHtml.includes("Сөп · Предложить") &&
      landHtml.includes('class="land-plain-line"') &&
      landHtml.includes('class="land-footer is-minimal small muted"') &&
      landHtml.includes("Сообщить о баге") &&
      landHtml.includes("Сотрудничество") &&
      landHtml.includes("Условия оплаты") &&
      landHtml.includes("Политика конфиденциальности") &&
      landHtml.includes('data-countup="2480"') &&
      landHtml.includes('data-countup="30"') &&
      !landHtml.includes("marquee-band") &&
      !landHtml.includes('id="hero-stage-wrap"') &&
      !landHtml.includes('id="land-match"') &&
      !landHtml.includes('id="land-rates"') &&
      !landHtml.includes('id="land-savings"') &&
      !landHtml.includes('id="land-how"') &&
      !landHtml.includes('id="land-demo"') &&
      !landHtml.includes('id="land-plans"') &&
      !landHtml.includes('id="land-tutors"') &&
      !landHtml.includes('id="land-faq"') &&
      !landHtml.includes("sakha-gold-emblem"),
      "expected streamlined landing with Hero, #land-market sort bar, plain Предложить CTAs, plain divider + 4-link footer, countup attributes, and zero marketing sections below feed"
    );
    clickAction(env5, { a: "mkt-sort", v: "price_asc" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="mkt-sort" data-v="price_asc" aria-pressed="true"'), "expected sort bar click to activate Дешевле");
    clickAction(env5, { a: "mkt-sort", v: "actual" });
    await flushMicrotasks(2);
    const initialCards = landHtml.match(/<article class="card tutor-card[\s\S]*?<\/article>/g) || [];
    assert(initialCards.length === 8 && landHtml.includes('id="mkt-scroll-sentinel"'), "expected initial infinite scroll page size of 8 tutor cards + sentinel");
    clickAction(env5, { a: "mkt-load-more" });
    await flushMicrotasks(2);
    assert((env5.elements.get("main").innerHTML.match(/<article class="card tutor-card[\s\S]*?<\/article>/g) || []).length === 16, "expected 16 cards after 1st mkt-load-more");
    clickAction(env5, { a: "mkt-load-more" });
    await flushMicrotasks(2);
    assert((env5.elements.get("main").innerHTML.match(/<article class="card tutor-card[\s\S]*?<\/article>/g) || []).length === 24, "expected 24 cards after 2nd mkt-load-more");
    clickAction(env5, { a: "mkt-load-more" });
    await flushMicrotasks(2);
    const page4Html = env5.elements.get("main").innerHTML;
    const allFeedCards = page4Html.match(/<article class="card tutor-card[\s\S]*?<\/article>/g) || [];
    assert(
      allFeedCards.length === 30 &&
      !page4Html.includes('id="mkt-feed-end"') &&
      !page4Html.includes("Конец списка") &&
      !page4Html.includes('data-a="mkt-load-more"') &&
      page4Html.includes("Дмитрий Волков") &&
      page4Html.includes('class="card tutor-card is-pro"') &&
      allFeedCards.every((c) => (c.match(/class="diff-tag/g) || []).length <= 2 && !c.includes(">Онлайн<") && !c.includes("Слоты:")),
      "expected 30 tutor cards total, no Конец списка banner at end of feed, Дмитрий Волков is-pro glow, and <= 2 diff-tag pills without Онлайн/Слоты noise"
    );
    clickAction(env5, { a: "land-scroll", target: "land-market" });
    await flushMicrotasks(2);
    assert(
      env5.body.classList.contains("is-land-white"),
      "expected Подобрать click (land-scroll -> land-market) to activate gradual black-to-white class on body"
    );
    clickAction(env5, { a: "coop-open" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="coop-modal-title"'), "expected coop-open to open Cooperation modal");
    clickAction(env5, { a: "coop-close" });
    await flushMicrotasks(2);
    const plansHelperHtml = globalThis.EGE.views.marketplace.plansSectionHTML({ landing: true });
    assert(
      plansHelperHtml.includes("390 ₽/мес") &&
      plansHelperHtml.includes("2 190 ₽") &&
      plansHelperHtml.includes("4 590 ₽") &&
      plansHelperHtml.includes("8 900 ₽") &&
      plansHelperHtml.includes('id="sbp-escrow-explainer"'),
      "expected plansSectionHTML helper to retain Gemini plan cards for brandbook & tests"
    );

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

    clickAction(env5, { a: "card-offer-step", id: "tut-sokolova", step: "-50" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "Предложить 1 150 ₽") && !env5.elements.get("main").innerHTML.includes("Сөп · Предложить"), "expected card inline -50 step to update plain Предложить button immediately without Yakut emblem");
    clickAction(env5, { a: "card-offer-step", id: "tut-sokolova", step: "50" });
    clickAction(env5, { a: "tutor-bio-toggle", id: "tut-sokolova" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="tutor-bio-wrap is-open"'), "expected tutor-bio-toggle to expand tutor bio");

    clickAction(env5, { a: "mkt-reset" });

    // Клик «Предложить X ₽» без входа открывает окно входа/регистрации (с grabber и без крестика)
    clickAction(env5, { a: "card-bid", id: "tut-sokolova", offer: "1200" });
    await flushMicrotasks(2);
    const authPreBid = env5.elements.get("modal-root").innerHTML;
    assert(
      authPreBid.includes("is-auth-sheet") &&
      authPreBid.includes("sheet-grabber") &&
      !authPreBid.includes('aria-label="Закрыть"') &&
      authPreBid.includes('data-f="auth"') &&
      authPreBid.includes("Войдите или зарегистрируйтесь"),
      "expected card-bid while logged out to open grabber Login/Register sheet without close cross"
    );
    clickAction(env5, { a: "auth-modal-close" });
    await flushMicrotasks(2);

    clickAction(env5, { a: "book-open", id: "tut-sokolova" });
    await flushMicrotasks(2);
    const modalBefore = env5.elements.get("modal-root").innerHTML;
    assert(
      modalBefore.includes('id="book-modal-title">Анна Соколова</b>') &&
      modalBefore.includes("is-booking-sheet") &&
      modalBefore.includes("sheet-grabber") &&
      !modalBefore.includes('aria-label="Закрыть"') &&
      modalBefore.includes("tutor-modal-head") &&
      !modalBefore.includes('data-a="book-mode"') &&
      modalBefore.includes('id="bid-price"') &&
      modalBefore.includes('inputmode="numeric"') &&
      modalBefore.includes('id="bid-note"') &&
      !modalBefore.includes('id="bid-hour-range"') &&
      !modalBefore.includes('id="bid-custom-time"') &&
      !modalBefore.includes('data-a="book-exam"') &&
      !modalBefore.includes('data-a="book-format"') &&
      !modalBefore.includes("Отмена") &&
      !modalBefore.includes('data-a="go-fees"') &&
      modalBefore.includes("Отправим вашу заявку преподавателю в мессенджер (WhatsApp, Telegram, MAX)"),
      "expected bottom-sheet booking modal with grabber, no close cross, digits-only 0-99999 price input, centered Предложить CTA, and messenger note"
    );
    env5.emitDoc("input", { target: { id: "bid-price", value: "25a000", dataset: {} } });
    clickAction(env5, { a: "bid-step", step: "50" });
    clickAction(env5, { a: "bid-step", step: "-50" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("modal-root").innerHTML, "Предложить 25 000 ₽") && env5.elements.get("modal-root").innerHTML.includes('value="25000"'), "expected digits-only 5-digit price input (25000) to work without 5000 cap");
    env5.emitDoc("input", { target: { id: "bid-price", value: "1200", dataset: {} } });
    await flushMicrotasks(1);
    clickAction(env5, { a: "bid-step", step: "-50" });
    await flushMicrotasks(2);
    const modalStepped = env5.elements.get("modal-root").innerHTML;
    assert(modalStepped.includes('value="1150"') && hasNum(modalStepped, "Предложить 1 150 ₽") && !modalStepped.includes("1 092 ₽"), "expected -50 step to update centered Предложить CTA to 1150 without Yakut logo");

    // Воронка «Предложить 1 150 ₽»: без входа -> Вход/Регистрация -> с 0 ₽ -> Пополнение баланса СБП -> возврат в заявку 1150 ₽ -> отправка
    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(3);
    assert(env5.elements.get("modal-root").innerHTML.includes('data-f="auth"') && env5.elements.get("modal-root").innerHTML.includes("sheet-grabber"), "expected book-submit while logged out to open grabber auth sheet");
    clickAction(env5, { a: "auth-guest" });
    await flushMicrotasks(3);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="bid-submit-btn"') && env5.elements.get("modal-root").innerHTML.includes('value="1150"'), "expected login to resume booking sheet with preserved 1150 ₽ offer");

    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(3);
    const balRedirectHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      balRedirectHtml.includes("is-balance-sheet") &&
      balRedirectHtml.includes("sheet-grabber") &&
      !balRedirectHtml.includes('aria-label="Закрыть"') &&
      balRedirectHtml.includes('id="bal-modal-title"') &&
      balRedirectHtml.includes('value="1150"'),
      "expected book-submit with 0 ₽ balance to redirect to grabber SBP top-up sheet with 1150 ₽ amount"
    );
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "4590" } } }) }, preventDefault() {} });
    await flushMicrotasks(4);
    assert(
      env5.elements.get("modal-root").innerHTML.includes('id="bid-submit-btn"') &&
      env5.elements.get("modal-root").innerHTML.includes('value="1150"'),
      "expected topping up 4 590 ₽ by SBP to restore booking sheet with preserved 1150 ₽ offer"
    );

    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(4);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected booking modal closed after funded submit");
    const bookSideToast = env5.elements.get("toast");
    assert(
      bookSideToast.className === "toast is-side" &&
      bookSideToast.innerHTML.includes("Предложение передано преподавателю") &&
      bookSideToast.innerHTML.includes("Написали ему в мессенджер (WhatsApp, Telegram, MAX)"),
      "expected side notification saying Написали ему в мессенджер (WhatsApp, Telegram, MAX)"
    );
    const afterBookHtml = env5.elements.get("main").innerHTML;
    assert(afterBookHtml.includes("На рассмотрении · уведомим") && hasNum(afterBookHtml, "3 440 ₽"), "expected 1150 ₽ reserved from 4 590 ₽ balance leaving 3 440 ₽");

    const acceptIdMatch = /data-a="mkt-sim-accept" data-id="([^"]+)"/.exec(afterBookHtml);
    assert(acceptIdMatch, "expected sim-accept button for pending booking");
    clickAction(env5, { a: "mkt-sim-accept", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Преподаватель подтвердил"), "expected tutor accepted state");

    clickAction(env5, { a: "mkt-cancel-book", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    const afterCancelHtml = env5.elements.get("main").innerHTML;
    assert(hasNum(afterCancelHtml, "4 590 ₽"), "expected balance restored to 4 590 ₽ on tutor cancel/switch");

    clickAction(env5, { a: "filter-open" });
    await flushMicrotasks(2);
    const filterSheet = env5.elements.get("modal-root").innerHTML;
    assert(
      filterSheet.includes("is-fullscreen-sheet") &&
      filterSheet.includes("sheet-grabber") &&
      !filterSheet.includes('aria-label="Закрыть"') &&
      !filterSheet.includes(">Закрыть<") &&
      filterSheet.includes("Подняты за последнюю неделю") &&
      filterSheet.includes('data-a="mkt-price-custom"') &&
      !filterSheet.includes("Время занятия") &&
      !filterSheet.includes("День недели") &&
      filterSheet.includes("Показать"),
      "expected fullscreen filter bottom-sheet with grabber, no close button/cross, weekly freshness, expanded price presets + Своя, and without time/day sections"
    );
    clickAction(env5, { a: "mkt-exam", v: "ЕГЭ" });
    await flushMicrotasks(2);
    const filterEge = env5.elements.get("modal-root").innerHTML;
    assert(filterEge.includes("Обществознание") && filterEge.includes("География") && !filterEge.includes("Дзюдо") && !filterEge.includes("Программирование"), "expected ЕГЭ filter sheet to display exam subjects only");
    clickAction(env5, { a: "mkt-exam", v: "all" });
    clickAction(env5, { a: "mkt-price-custom" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="mkt-price-min"') && env5.elements.get("modal-root").innerHTML.includes('id="mkt-price-max"'), "expected Своя price toggle to reveal numeric От/До inputs");
    env5.emitDoc("input", { target: { id: "mkt-price-min", value: "9a00", dataset: {} } });
    env5.emitDoc("input", { target: { id: "mkt-price-max", value: "1200", dataset: {} } });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("modal-root").innerHTML, "от 900 до 1 200 ₽/ч") && hasNum(env5.elements.get("main").innerHTML, "от 900 до 1 200 ₽/ч"), "expected digits-only custom price range 900-1200 to filter catalog live");
    clickAction(env5, { a: "mkt-reset" });
    clickAction(env5, { a: "filter-close" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected filter sheet closed");

    clickAction(env5, { a: "go", v: "brandbook" });
    await flushMicrotasks(4);
    const bbHtml = env5.elements.get("main").innerHTML;
    assert(bbHtml.includes('id="brandbook-page"') && bbHtml.includes('data-bb-pane="light"') && bbHtml.includes('data-bb-pane="dark"') && bbHtml.includes("Синий фон") && bbHtml.includes("hh-price-old") && bbHtml.includes("Inter") && bbHtml.includes("#F97316") && bbHtml.includes('id="bb-buttons"') && bbHtml.includes('id="bb-bounds"') && bbHtml.includes("bb-phone-frame"), "expected brandbook with white/dark/blue surfaces, orange notifications #F97316, full button/heart/icon catalog, spacing boundaries and mobile 390px frame");
    assert(bbHtml.includes('id="bb-logo"') && bbHtml.includes('data-surface="light"') && bbHtml.includes('data-surface="dark"') && bbHtml.includes('data-surface="blue"') && bbHtml.includes('class="brand-wordmark"') && !bbHtml.includes("M5.5 15Q15") && bbHtml.includes('id="bb-forms"') && bbHtml.includes('id="bb-cards-sys"') && bbHtml.includes('id="bb-study-states"') && bbHtml.includes('id="bb-dodont"') && bbHtml.includes("bb-input-error") && bbHtml.includes("plan-card featured super") && bbHtml.includes("bb-skel-bar") && bbHtml.includes('data-a="bb-copy-token"'), "expected extended brandbook sections: 3-surface circular Sakha logo + custom vector wordmark, forms/errors, tariffs/modals/toasts, study/skeleton/empty/danger states, Do/Dont, and copyable tokens");
    assert(bbHtml.includes('id="bb-sliders"') && bbHtml.includes('id="bb-hour-range-clean"') && bbHtml.includes('id="bb-hour-range-ticks"') && bbHtml.includes('id="bb-hour-range-ruler"') && bbHtml.includes('id="bb-layers"') && bbHtml.includes('id="bb-cabinet"') && bbHtml.includes('data-target="bb-cabinet"') && bbHtml.includes('id="bb-responsive"') && bbHtml.includes('id="bb-vp-slider"') && bbHtml.includes("bb-blueprint-grid") && bbHtml.includes('data-a="bb-day" data-v="sat"') && !bbHtml.includes('id="bb-motion"') && !bbHtml.includes("Нажми «Предложить» для перехода") && !bbHtml.includes("5%:") && bbHtml.includes("sakha-divider is-gold-logo") && bbHtml.includes("is-no-photo") && bbHtml.includes("hh-step-readout is-inline") && bbHtml.includes("tc-autobump-card") && bbHtml.includes("tc-wa-cfg") && bbHtml.includes("bb-bal-toggle") && bbHtml.includes("wallet-bar") && bbHtml.includes("tc-cal-hours") && bbHtml.includes("tc-bar-chart") && bbHtml.includes("tc-hh-meter") && bbHtml.includes("tc-score-track") && bbHtml.includes("Справочник") && !globalThis.EGE.kit.aiErrorBoxesHTML, "expected 3 brandbook sliders, interactive cabinet/balance/schedule/chart/score showcase, 5-tab phone nav, nav link to bb-cabinet, and removed aiErrorBoxesHTML");
    clickAction(env5, { a: "bb-bal-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("0 ₽ · до старта") && env5.elements.get("main").innerHTML.includes("Нужен старт 5 000 ₽"), "expected bb-bal-toggle to switch brandbook balance preview to 0 ₽ blocked state");
    clickAction(env5, { a: "bb-bal-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("5 000 ₽ · активен") && env5.elements.get("main").innerHTML.includes("Пробный урок 0 ₽"), "expected second bb-bal-toggle to restore funded 5 000 ₽ active state");
    const bbChartsHtml = env5.elements.get("main").innerHTML;
    assert(
      bbChartsHtml.includes('id="bb-charts"') &&
      bbChartsHtml.includes("tc-bar-chart is-sticks") &&
      bbChartsHtml.includes("tc-bar-chart is-lollipop") &&
      bbChartsHtml.includes("tc-bar-chart is-capsule") &&
      bbChartsHtml.includes("tc-bar-chart is-dual") &&
      bbChartsHtml.includes("tc-bar-chart is-range") &&
      bbChartsHtml.includes("tc-bar-chart is-combo") &&
      !bbChartsHtml.includes("tc-bar-chart is-segmented") &&
      !bbChartsHtml.includes("bb-spark-sticks") &&
      bbChartsHtml.includes('id="bb-data-viz"') &&
      bbChartsHtml.includes("bb-line-chart") &&
      bbChartsHtml.includes("bb-donut-chart") &&
      bbChartsHtml.includes("bb-data-table") &&
      bbChartsHtml.includes("bb-tbl-search") &&
      bbChartsHtml.includes("3 колонки") &&
      bbChartsHtml.includes("5 колонок") &&
      bbChartsHtml.includes("7 колонок") &&
      !bbChartsHtml.includes("5 колонки") &&
      !bbChartsHtml.includes("7 колонки") &&
      bbChartsHtml.includes("tc-bar-min") &&
      bbChartsHtml.includes("review-price-row") &&
      bbChartsHtml.includes("08 · Мои ученики") &&
      bbChartsHtml.includes("09 · Шкала ИИ-проверки") &&
      bbChartsHtml.includes("https://wa.me/") &&
      bbChartsHtml.includes("https://t.me/") &&
      bbChartsHtml.includes("https://max.ru/"),
      "expected 6 stick-chart variants with combo trend, line+donut+table data-viz section, and WhatsApp/Telegram/MAX links"
    );
    clickAction(env5, { a: "bb-line-pt", idx: "5" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="bb-line-tick is-active" data-a="bb-line-pt" data-idx="5"'), "expected bb-line-pt=5 to activate line chart node");
    clickAction(env5, { a: "bb-donut-ds", v: "subjects" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("84.5к ₽"), "expected bb-donut-ds=subjects to switch donut dataset");
    clickAction(env5, { a: "bb-donut-slice", idx: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('<b class="num">29%</b>'), "expected bb-donut-slice=1 to update donut center readout");
    clickAction(env5, { a: "bb-tbl-cols", cols: "3" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("bb-data-table cols-3") && env5.elements.get("main").innerHTML.includes("<th>Ученик и предмет</th>"), "expected bb-tbl-cols=3 to render 3-column table");
    clickAction(env5, { a: "bb-tbl-cols", cols: "7" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("bb-data-table cols-7") && env5.elements.get("main").innerHTML.includes("<th>На руки (95%)</th>"), "expected bb-tbl-cols=7 to render 7-column table");
    clickAction(env5, { a: "bb-tbl-filter", v: "chem" });
    await flushMicrotasks(2);
    const bbTblChemFull = env5.elements.get("main").innerHTML;
    const bbTblChemStart = bbTblChemFull.indexOf('id="bb-data-viz"');
    const bbTblChemEnd = bbTblChemFull.indexOf('id="bb-arch-split"');
    const bbTblChem = bbTblChemStart >= 0 ? bbTblChemFull.slice(bbTblChemStart, bbTblChemEnd > bbTblChemStart ? bbTblChemEnd : undefined) : bbTblChemFull;
    assert(bbTblChem.includes("Дамир Осипов") && !bbTblChem.includes("Мария Фёдорова"), "expected bb-tbl-filter=chem to filter table rows");
    clickAction(env5, { a: "bb-tbl-filter", v: "all" });
    clickAction(env5, { a: "bb-tbl-cols", cols: "5" });
    clickAction(env5, { a: "bb-donut-ds", v: "channels" });
    clickAction(env5, { a: "bb-line-pt", idx: "3" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "bb-chart-style", v: "lollipop" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('class="chip-btn on" data-a="bb-chart-style" data-v="lollipop"') && env5.elements.get("main").innerHTML.includes('class="bb-chart-card is-picked"'), "expected bb-chart-style=lollipop to highlight lollipop chip and card");
    clickAction(env5, { a: "bb-chart-data", v: "scores" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("диагностика 48") || env5.elements.get("main").innerHTML.includes("пробник ФИПИ 71"), "expected bb-chart-data=scores to switch chart dataset to exam scores");
    clickAction(env5, { a: "bb-chart-bar", idx: "0" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Сентябрь · диагностика 48"), "expected bb-chart-bar=0 to update active bar readout");
    clickAction(env5, { a: "bb-chart-data", v: "income" });
    clickAction(env5, { a: "bb-chart-bar", idx: "3" });
    clickAction(env5, { a: "bb-chart-style", v: "sticks" });
    await flushMicrotasks(2);
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
    assert(bbHtml.includes('id="bb-catalog"') && bbHtml.includes('id="bb-catalog-q"') && bbHtml.includes('id="bb-hero-banner"') && bbHtml.includes('id="bb-yakutia"') && bbHtml.includes('id="bb-landing-kit"') && bbHtml.includes('hero-tutor-student.jpg') && bbHtml.includes('hero-book-pages.jpg') && bbHtml.includes('hero-float-drift') && !bbHtml.includes('−30% к рынку') && !bbHtml.includes('/assets/iphone-motion.jpg') && !bbHtml.includes('hero-iphone-bezel') && !bbHtml.includes('hero-banner-form') && !bbHtml.includes('hero-banner-badges') && !bbHtml.includes('id="bb-hero-demo-q"') && !bbHtml.includes('land-search-strip') && bbHtml.includes('hero-banner-ctas') && bbHtml.includes('Найти ниже рынка') && !bbHtml.includes('hero-cta-secondary') && bbHtml.includes("sakha-medallion-btn") && bbHtml.includes("sakha-diamond-btn") && bbHtml.includes("btn sakha-pattern") && bbHtml.includes("sakha-divider"), "expected searchable brandbook catalog + Gemini Hero with 4 pure moving photos + Yakut ornament buttons + landing kit");
    clickAction(env5, { a: "bb-cat", v: "hero" });
    await flushMicrotasks(2);
    const bbFilteredHero = env5.elements.get("main").innerHTML;
    assert(bbFilteredHero.includes('id="bb-hero-banner"') && !bbFilteredHero.includes('id="bb-sliders"'), "expected bb-cat=hero filter to narrow brandbook down to hero components");
    clickAction(env5, { a: "bb-hero-primary" });
    await flushMicrotasks(2);
    const bbHeroClicked = env5.elements.get("main").innerHTML;
    assert(bbHeroClicked.includes("hero-cta-primary is-confirmed"), "expected gold hero CTA button in brandbook to toggle confirmed status");
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
    clickAction(env5, { a: "bb-step", step: "-50" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "2 350 ₽"), "expected brandbook price stepper from 2400 to 2350");
    clickAction(env5, { a: "bb-mode", v: "dark" });
    await flushMicrotasks(2);
    const bbDarkOnly = env5.elements.get("main").innerHTML;
    assert(!bbDarkOnly.includes('data-bb-pane="light"') && bbDarkOnly.includes('data-bb-pane="dark"'), "expected brandbook dark-only mode toggle");

    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(4);
    const feesHtml = env5.elements.get("main").innerHTML;
    assert(feesHtml.includes('id="fees-page"') && feesHtml.includes("5%") && feesHtml.includes("Только СБП") && feesHtml.includes("490 ₽") && feesHtml.includes("шлюз СБП") && feesHtml.includes("1 490 ₽/мес") && hasNum(feesHtml, "760 ₽") && feesHtml.includes("40 ₽") && !feesHtml.includes("Открыть Брендбук"), "expected dedicated /fees page showing SBP-only mechanics, 490 ₽ trial, 5% + 1% SBP split, PRO 1490 ₽/mo and 760/40 calculator without internal brandbook button");
    clickAction(env5, { a: "fees-rate", rate: "2000" });
    await flushMicrotasks(2);
    const feesUpdated = env5.elements.get("main").innerHTML;
    assert(hasNum(feesUpdated, "1 900 ₽") && feesUpdated.includes("100 ₽") && feesUpdated.includes("20 ₽"), "expected /fees calculator preset to recalculate 95%/5% + 1% SBP split for 2000");

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
      globalThis.EGE.kit.CATALOG_ITEMS.length === 27 &&
      ["bb-market-app", "bb-cabinet", "bb-data-viz", "bb-mask-trainer", "bb-payments", "bb-ui-kit-shells", "bb-telemetry-etl", "bb-admin-kit", "bb-arch-split", "bb-ege-timers", "bb-a11y", "bb-layers", "bb-bounds", "bb-dodont", "bb-compare"].every((id) => catTargetIds.includes(id)),
      "expected 27 catalog items covering all brandbook sections including admin-kit, arch-split, mask-trainer, payments, ui-kit-shells, telemetry-etl, ege-timers, a11y, /market, cabinet/balance, data-viz, layers, bounds, dodont, and compare"
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
    const directLightMarkSvg = globalThis.EGE.ui.brandLogoSVG("light", "mark");
    const starPath = globalThis.EGE.ui.VEKTOR_STAR_D || "";
    assert(
      directSvg.startsWith("<svg ") && directSvg.includes('xmlns="http://www.w3.org/2000/svg"') && directSvg.includes('viewBox="0 0 260 72"') && directSvg.includes('fill="#0070ff"') && directSvg.includes("<path d=") &&
      directMarkSvg.startsWith("<svg ") && directMarkSvg.includes('viewBox="0 0 64 64"') && directMarkSvg.includes('fill="#0b0d12"') &&
      directMarkSvg.includes("#4285f4") && directMarkSvg.includes("#ea4335") && directMarkSvg.includes("#fbbc04") && directMarkSvg.includes("#34a853") &&
      directLightMarkSvg.includes("#4285f4") && directLightMarkSvg.includes("#ea4335") &&
      starPath.startsWith("M32.00 4.40") && starPath.endsWith("Z") &&
      bbV2Html.includes("logo-photo1-dark.svg") &&
      bbV2Html.includes("logo-photo2-light.svg") &&
      bbV2Html.includes("logo-animated.svg"),
      "expected brandLogoSVG & #bb-logo to emit 6-point Gemini multi-color star logo on dark/light, white on blue, and showcase SVG files"
    );
    const p1200 = (1200).toLocaleString("ru-RU");
    const homeSubHtml = globalThis.EGE.views.brandbook.viewBrandbook(
      { inside: false },
      { dark: false, ui: { role: "student", brandbook: { subsite: "home" } } }
    );
    assert(
      homeSubHtml.includes("−50 ₽") &&
      homeSubHtml.includes("+50 ₽") &&
      homeSubHtml.includes(p1200 + " ₽/ч") &&
      homeSubHtml.includes("Сөп · Предложить " + p1200 + " ₽") &&
      !homeSubHtml.includes(">−50<") &&
      !homeSubHtml.includes(">+50<"),
      "expected canonical −50 ₽ / +50 ₽ / 1 200 ₽/ч / Сөп · Предложить 1 200 ₽ in home subsite"
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
    assert(bbTutorAppHtml.includes("tc-req-card") && bbTutorAppHtml.includes("Поднять анкету (раз в 4 ч)") && bbTutorAppHtml.includes("на руки 95%") && bbTutorAppHtml.includes("Календарь учеников") && bbTutorAppHtml.includes("Ученики ищут") && bbTutorAppHtml.includes("side-badge-jump"), "expected bb-app-role=tutor in brandbook to display Tutor Cabinet card with 4h bump button, 7-item teacher sidebar with jump badge, and 95% payout");
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
    assert(landFullHtml.includes('class="land-hero-banner is-gemini-hero"') && landFullHtml.includes("Найти ниже рынка") && landFullHtml.includes("hero-cta-primary") && landFullHtml.includes("hero-float-card") && !landFullHtml.includes("hero-cta-secondary") && !landFullHtml.includes("hero-banner-form"), "expected hero banner Gemini CTA + float cards without top search form or secondary CTA");
    assert(!landFullHtml.includes("land-search-strip") && !landFullHtml.includes("hh-blue-banner") && !landFullHtml.includes("hero-iphone-bezel") && landFullHtml.includes("/assets/hero-tutor-student.jpg") && landFullHtml.includes("/assets/hero-book-pages.jpg") && landFullHtml.includes("hero-float-drift") && !landFullHtml.includes("−30% к рынку"), "expected Gemini Hero 4 pure moving photos without overlays or search strip");
    assert(landFullHtml.includes('class="land-plain-line"') && !landFullHtml.includes("sakha-gold-emblem") && landFullHtml.includes('class="land-footer is-minimal small muted"') && landFullHtml.includes("land-mobile-sticky"), "expected plain bottom line, no gold emblem, minimal 4-link footer, and sticky mobile CTA");
    assert(
      !landFullHtml.includes("Комиссия 5%") && !landFullHtml.includes("760 ₽"),
      "expected landing to keep 5% commission split off /landing"
    );

    clickAction(env5, { a: "coop-open" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("modal-root").innerHTML.includes('id="coop-modal-title"') &&
      env5.elements.get("modal-root").innerHTML.includes("sheet-grabber") &&
      !env5.elements.get("modal-root").innerHTML.includes('aria-label="Закрыть"'),
      "expected coop-open to render grabber cooperation modal without close cross"
    );
    clickAction(env5, { a: "coop-to-apply" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="ta-modal-title"'), "expected coop-to-apply to transition into tutor application modal");
    clickAction(env5, { a: "tutor-apply-step", step: "50" });
    clickAction(env5, { a: "tutor-apply-step", step: "50" });
    clickAction(env5, { a: "tutor-apply-step", step: "50" });
    clickAction(env5, { a: "tutor-apply-step", step: "50" });
    clickAction(env5, { a: "tutor-apply-step", step: "50" });
    clickAction(env5, { a: "tutor-apply-step", step: "50" });
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

    clickAction(env5, { a: "book-open", id: globalThis.EGE.tutors.LIST[0].id, hour: "14:00" });
    await flushMicrotasks(2);
    const modalBookHtml = env5.elements.get("modal-root").innerHTML;
    assert(modalBookHtml.includes('id="bid-submit-btn"') && modalBookHtml.includes("bid-submit-main") && modalBookHtml.includes("Предложить ") && !modalBookHtml.includes("sakha-pattern") && !modalBookHtml.includes("Сөп · Предложить"), "expected booking modal to use clean plain Предложить CTA button centered in footer");
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
      authModalDefault.includes("auth-modal-shell") &&
      authModalDefault.includes("is-auth-sheet") &&
      authModalDefault.includes("sheet-grabber") &&
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
    assert(env5.elements.get("tutor-balance-dock").hidden === true && env5.elements.get("tutor-balance-dock").innerHTML === "", "expected teacher floating balance dock hidden in student mode");
    assert(studentMainHtml.includes("Тесты ЕГЭ") && !studentMainHtml.slice(0, studentMainHtml.indexOf("grid-3")).includes('data-v="tutor"'), "expected Тесты ЕГЭ hub without duplicate top Справочник button in head");
    assert(!readFileText("frontend/index.html").includes('id="top-market"'), "expected top-market removed from mobile topbar");

    clickAction(env5, { a: "brand-go-tutors" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Подбор репетитора"), "expected clicking logo (brand-go-tutors) to navigate to tutors catalog");

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
    assert(
      tutorMain1.includes("Личный кабинет преподавателя") &&
      tutorMain1.includes('id="tc-requests-table"') &&
      tutorMain1.includes("bb-data-table") &&
      tutorMain1.includes('id="tc-first-pending"') &&
      tutorMain1.includes("На руки 95%") &&
      !tutorMain1.includes('data-a="tc-bump"') &&
      !tutorMain1.includes("3 колонки") &&
      !tutorMain1.includes("7 колонок") &&
      (tutorMain1.match(/<th\b/g) || []).length === 5,
      "expected clean 5-col Teacher Requests table without bump CTA or 3/7 cols switch"
    );
    assert(!tutorMain1.includes("tc-role-bar") && tutorMain1.includes("is-gold-logo") && !tutorMain1.includes('role="tablist"'), "expected tc-role-bar and desktop tablist removed, keeping only gold line with centered emblem");
    assert(
      env5.elements.get("top-balance-slot").hidden === false &&
      env5.elements.get("top-balance-slot").innerHTML.includes("is-tutor") &&
      env5.elements.get("top-balance-slot").innerHTML.includes('data-a="tc-payout-open"') &&
      env5.elements.get("tutor-balance-dock").hidden === true &&
      env5.elements.get("tutor-balance-dock").innerHTML === "" &&
      env5.elements.get("side-foot").innerHTML.includes('id="side-balance-slot" class="side-bal-slot">') &&
      env5.elements.get("side-foot").innerHTML.includes("side-tutor-bal") &&
      env5.elements.get("side-foot").innerHTML.includes('data-a="tc-payout-open"') &&
      !env5.elements.get("side-foot").innerHTML.includes("Вывести 95%") &&
      !env5.elements.get("side-foot").innerHTML.includes(">Препод<") &&
      env5.elements.get("side-foot").innerHTML.includes("Преподаватель"),
      "expected teacher balance in #side-balance-slot bottom-left and mobile topbar, #tutor-balance-dock hidden, and full Преподаватель label"
    );
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

    clickAction(env5, { a: "tc-req-step", id: "tc-req-1", step: "50" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "1 150 ₽/ч") && env5.elements.get("main").innerHTML.includes("Отправить контр-ставку"), "expected tc-req-step to step incoming offer +50 and reveal counter CTA");

    clickAction(env5, { a: "tc-req-accept", id: "tc-req-1" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes("Написать ученику") &&
      env5.elements.get("main").innerHTML.includes("https://wa.me/") &&
      env5.elements.get("main").innerHTML.includes("https://t.me/") &&
      env5.elements.get("main").innerHTML.includes("https://max.ru/") &&
      env5.elements.get("toast").innerHTML.includes("Урок подтверждён"),
      "expected tc-req-accept to confirm lesson with WhatsApp/Telegram/MAX links and side toast"
    );

    clickAction(env5, { a: "tc-slot-toggle", hour: "13:00" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="tc-slot-toggle" data-hour="13:00" aria-pressed="true"'), "expected tc-slot-toggle to toggle 13:00 availability slot");

    // Профиль: единственное место с «Поднять анкету» (tc-bump + авто-24ч), единый мультивыбор с × внутри, фото/Без фото, Якутск/Москва + UTC и публикация в /market
    clickAction(env5, { a: "go", v: "tutor-profile" });
    await flushMicrotasks(2);
    const tcProfHtml = env5.elements.get("main").innerHTML;
    assert(
      !tcProfHtml.includes("Профиль hh") &&
      !tcProfHtml.includes("hh-multi-chips") &&
      !tcProfHtml.includes("tc-skill-toggle") &&
      tcProfHtml.includes('data-a="tc-bump"') &&
      tcProfHtml.includes("Поднять анкету (раз в 4 ч)") &&
      tcProfHtml.includes("Автоподнятие 24 ч активно") &&
      tcProfHtml.includes("Заполненность профиля") &&
      tcProfHtml.includes("tc-hh-meter") &&
      tcProfHtml.includes("hh-multi-x") &&
      tcProfHtml.includes("Без фото") &&
      tcProfHtml.includes("Якутск") &&
      tcProfHtml.includes("Москва") &&
      tcProfHtml.includes("UTC+9"),
      "expected unified Profile builder with single tc-bump card, multi-select + internal ×, photo/no-photo, Якутск/Москва + UTC, and manual customSkills"
    );
    clickAction(env5, { a: "tc-bump" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("✓ Поднята · через") && env5.elements.get("main").innerHTML.includes("data-tc-manual-countdown") && env5.elements.get("toast").innerHTML.includes("Анкета поднята в топ"), "expected tc-bump on profile tab to enter 4h cooldown state with side toast");
    clickAction(env5, { a: "tc-bump" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Повторить можно через"), "expected immediate second manual bump within 4h to show cooldown message");
    clickAction(env5, { a: "tc-autobump-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Автоподнятие на паузе"), "expected 24h auto-bump toggle on profile tab to pause");
    clickAction(env5, { a: "tc-autobump-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Автоподнятие 24 ч активно"), "expected 24h auto-bump toggle on profile tab to reactivate");
    clickAction(env5, { a: "tc-subj-toggle" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-subj-pick", v: "chem" });
    clickAction(env5, { a: "tc-city-pick", v: "Москва" });
    clickAction(env5, { a: "tc-tz-pick", v: "UTC+3" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "tc-guarantee-set", v: "0" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("На анкете будет серый статус «Без бесплатного 1-го»"), "expected tc-guarantee-set=0 to show grey non-free 1st lesson status");
    clickAction(env5, { a: "tc-guarantee-set", v: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("вернёт 100% оплаты из резерва СБП"), "expected tc-guarantee-set=1 to restore 1st lesson refund guarantee");
    clickAction(env5, { a: "tc-preview-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Живой вид вашей карточки для учеников") && env5.elements.get("main").innerHTML.includes("Без фото") && env5.elements.get("main").innerHTML.includes("Москва (UTC+3)"), "expected live tutor card preview with Без фото and Москва (UTC+3)");
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-profile" }, elements: { name: { value: "Анна Соколова" }, headline: { value: "Эксперт ЕГЭ · СФУ" }, subject: { value: "bio" }, badge0: { value: "Эксперт жюри ВсОШ" }, badge1: { value: "К.б.н. · автор задач" }, customSkills: { value: "ФИПИ 2027, №28 Генетика" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    const publishedTutor = globalThis.EGE.tutors.LIST.find((t) => t.id === "tc-my-profile");
    assert(env5.elements.get("main").innerHTML.includes("Опубликована для учеников") && publishedTutor && publishedTutor.name === "Анна Соколова" && publishedTutor.city === "Москва" && publishedTutor.timezone === "UTC+3" && publishedTutor.subjects.includes("chem") && Array.isArray(publishedTutor.customBadges) && publishedTutor.customBadges.length === 2, "expected submitted profile to publish city/UTC, multi-subject & up to 2 custom badges live into EGE.tutors.LIST");
    // Возвращаем часовой пояс Якутск UTC+9 для дальнейших календарных проверок UTC+9
    clickAction(env5, { a: "tc-city-pick", v: "Якутск" });
    clickAction(env5, { a: "tc-tz-pick", v: "UTC+9" });
    await flushMicrotasks(2);

    // Календарь записанных учеников (чистый вид без .cal-sync-card по умолчанию, без tc-bump, с кнопкой tc-cal-import-modal)
    clickAction(env5, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    const tcCalHtml = env5.elements.get("main").innerHTML;
    assert(
      tcCalHtml.includes("Календарь записанных учеников") &&
      tcCalHtml.includes("Алина С.") &&
      !tcCalHtml.includes("Тимур К.") &&
      !tcCalHtml.includes("cal-sync-card") &&
      tcCalHtml.includes('data-a="tc-cal-import-modal"') &&
      !tcCalHtml.includes('data-a="tc-bump"'),
      "expected clean calendar without .cal-sync-card or tc-bump, showing ONLY confirmed students and tc-cal-import-modal CTA"
    );
    clickAction(env5, { a: "tc-cal-open-add", hour: "11:00" });
    await flushMicrotasks(2);
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-cal-add" }, elements: { studentName: { value: "Максим Р." }, hour: { value: "11:00" }, offerPrice: { value: "1300" }, note: { value: "Генетика №28" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Максим Р.") && env5.elements.get("main").innerHTML.includes("Генетика №28"), "expected manually booked student to appear in hourly calendar");

    // Вкладка преподавателя «Ученики ищут» (контр-цена ±50 ₽ tc-lead-step + tc-lead-offer, без tc-bump и без 3/7 колонок)
    clickAction(env5, { a: "go", v: "tutor-leads" });
    await flushMicrotasks(2);
    const tcLeadsHtml = env5.elements.get("main").innerHTML;
    assert(
      tcLeadsHtml.includes("Заявки учеников, которые ищут преподавателя") &&
      tcLeadsHtml.includes('id="tc-leads-table"') &&
      tcLeadsHtml.includes("bb-data-table") &&
      !tcLeadsHtml.includes('data-a="tc-leads-subj"') &&
      !tcLeadsHtml.includes('data-a="tc-bump"') &&
      !tcLeadsHtml.includes("3 колонки") &&
      !tcLeadsHtml.includes("7 колонок") &&
      tcLeadsHtml.includes('data-a="tc-leads-mode"') &&
      tcLeadsHtml.includes('data-a="tc-lead-step"') &&
      tcLeadsHtml.includes("Химия"),
      "expected clean student requests tab in Ученики ищут with tc-lead-step ±50 ₽ stepper and no bump/cols switch"
    );
    const mLeadOffer = /data-a="tc-lead-offer" data-id="([^"]+)"/.exec(tcLeadsHtml);
    assert(Boolean(mLeadOffer), "expected tc-lead-offer response CTA button on student lead row");
    clickAction(env5, { a: "tc-lead-step", id: mLeadOffer[1], step: "50" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "tc-lead-offer", id: mLeadOffer[1] });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("✓ Отклик "), "expected teacher counter-price response to mark student lead as responded");

    // Мои ученики (ровно 5 колонок, трекер баллов ЕГЭ + автоформат +7 (914) + Telegram @логин/телефон + автоуведомления WA/TG/MAX, без tc-bump)
    clickAction(env5, { a: "go", v: "tutor-students" });
    await flushMicrotasks(2);
    const tcStudentsHtml = env5.elements.get("main").innerHTML;
    assert(
      tcStudentsHtml.includes("Мои ученики и автоуведомления") &&
      tcStudentsHtml.includes('id="tc-students-table"') &&
      tcStudentsHtml.includes("bb-data-table") &&
      (tcStudentsHtml.match(/<th\b/g) || []).length === 5 &&
      !tcStudentsHtml.includes('data-a="tc-bump"') &&
      !tcStudentsHtml.includes("3 колонки") &&
      !tcStudentsHtml.includes("7 колонок") &&
      tcStudentsHtml.includes("+7 (914) 210-05-11") &&
      tcStudentsHtml.includes("@alina_bio") &&
      tcStudentsHtml.includes('data-tc-student="telegram"') &&
      tcStudentsHtml.includes('data-a="tc-student-autochannel"') &&
      tcStudentsHtml.includes('data-a="tc-wa-channel"') &&
      tcStudentsHtml.includes("Напомнить (Воскресенье, 10:00)") &&
      tcStudentsHtml.includes("tc-wa-global-toggle") &&
      tcStudentsHtml.includes("Тест в WhatsApp"),
      "expected 5-column Мои ученики table with formatted contacts, WA/TG/MAX channels, reminder CTA, and no bump/cols switch"
    );
    assert(
      globalThis.EGE.tutors.formatPhoneMask("79142100511") === "+7 (914) 210-05-11" &&
      globalThis.EGE.tutors.formatPhoneMask("89142100511") === "+7 (914) 210-05-11" &&
      globalThis.EGE.tutors.formatTelegramContact("alina_bio") === "@alina_bio" &&
      globalThis.EGE.tutors.formatTelegramContact("79142100511") === "+7 (914) 210-05-11" &&
      globalThis.EGE.tutors.telegramUrl({ telegram: "+7 (914) 210-05-12", name: "Дарья" }, "Hi").includes("https://t.me/+79142100512") &&
      globalThis.EGE.tutors.telegramUrl({ telegram: "@alina_bio", name: "Алина" }, "Hi").includes("https://t.me/alina_bio"),
      "expected formatPhoneMask, formatTelegramContact, and telegramUrl phone/login support"
    );
    const fakePhoneEl = { value: "89142100999", dataset: { tcStudent: "whatsapp", id: "st-alina" } };
    const fakeTgEl = { value: "timur_ege", dataset: { tcStudent: "telegram", id: "st-alina" } };
    env5.emitDoc("input", { target: fakePhoneEl });
    env5.emitDoc("input", { target: fakeTgEl });
    assert(fakePhoneEl.value === "+7 (914) 210-09-99" && fakeTgEl.value === "@timur_ege", "expected live input formatting for student phone and Telegram handle");
    clickAction(env5, { a: "tc-student-autochannel", id: "st-alina", ch: "max" });
    clickAction(env5, { a: "tc-wa-channel", ch: "tg" });
    clickAction(env5, { a: "tc-student-remind", id: "st-alina" });
    clickAction(env5, { a: "tc-wa-lead", v: "1h" });
    clickAction(env5, { a: "tc-student-score", id: "st-alina", delta: "2" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("78") && env5.elements.get("main").innerHTML.includes('data-a="tc-wa-lead" data-v="1h"'), "expected +2 score increment and WhatsApp reminder lead toggle");

    // Проверка CSS правил: скругление .btn-msg, отсутствие обводки-чёрточки ::after и капсульная обводка .tc-bar-col
    const baseCss = readFileText("ux-ui/styles/base.css");
    const mktCss = readFileText("frontend/styles/marketplace.css");
    assert(
      baseCss.includes("--r-pill: 999px;") &&
      /\.btn-msg\s*\{[^}]*border-radius:\s*999px;/.test(baseCss) &&
      !mktCss.includes(".tc-bar-col.is-active .tc-bar-track::after") &&
      /\.tc-bar-col\.is-active\s*\{[^}]*border-color:\s*var\(--accent\)/.test(mktCss),
      "expected 999px pill radius on .btn-msg and capsule outline on .tc-bar-col.is-active without crooked track::after dash"
    );

    // Выплаты и статистика: KPIs + Статистика преподавателя + Цель дохода (без дубля tc-bump и без переключателя 3/7 колонок)
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tcPayoutsHtml = env5.elements.get("main").innerHTML;
    assert(
      tcPayoutsHtml.includes("Чистый доход (95%)") &&
      tcPayoutsHtml.includes("Проведено уроков") &&
      tcPayoutsHtml.includes("Заработано за месяц") &&
      tcPayoutsHtml.includes("Ставка в анкете") &&
      tcPayoutsHtml.includes("Статистика преподавателя") &&
      tcPayoutsHtml.includes("Цель дохода на месяц") &&
      !tcPayoutsHtml.includes('data-a="tc-bump"') &&
      !tcPayoutsHtml.includes("3 колонки") &&
      !tcPayoutsHtml.includes("7 колонок"),
      "expected Выплаты dashboard to show net income KPIs, stats chart and monthly goal without duplicate tc-bump or 3/7 cols switch"
    );
    clickAction(env5, { a: "tc-stats-period", v: "30d" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("прогноз за месяц") && env5.elements.get("main").innerHTML.includes("tc-bar-chart is-sticks"), "expected 30d period switch and default stick chart in Выплаты stats");
    clickAction(env5, { a: "tc-chart-style", v: "lollipop" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("tc-bar-chart is-lollipop"), "expected tc-chart-style=lollipop in Выплаты stats");
    clickAction(env5, { a: "tc-chart-style", v: "sticks" });
    await flushMicrotasks(1);

    // Каталог /market фильтр городов: строго Якутск и Москва + Без фото (без дубля UTC+...)
    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(3);
    clickAction(env5, { a: "mkt-city", v: "Якутск" });
    await flushMicrotasks(2);
    const mktYakHtml = env5.elements.get("main").innerHTML;
    assert(mktYakHtml.includes("Якутск") && !mktYakHtml.includes("(UTC+9)") && mktYakHtml.includes("Без фото") && mktYakHtml.includes('data-k="city"'), "expected Якутск city filter chip and Без фото tutor avatar on /market without UTC suffix");
    clickAction(env5, { a: "mkt-city", v: "Москва" });
    await flushMicrotasks(2);
    const mktMskHtml = env5.elements.get("main").innerHTML;
    assert(mktMskHtml.includes("Москва") && !mktMskHtml.includes("Москва (UTC+3)"), "expected clean Москва tutors without (UTC+3) dupe when filtered to Москва");
    clickAction(env5, { a: "mkt-reset" });
    await flushMicrotasks(2);

    // Проверка /brandbook: наличие интерактивного мультивыбора (.hh-multi), виджета баланса, Тренд-кривой и Круговой диаграммы + 4 новых раздела + универсальная таблица + вывод средств преподавателя
    clickAction(env5, { a: "go", v: "brandbook" });
    await flushMicrotasks(3);
    const bbHtml1 = env5.elements.get("main").innerHTML;
    assert(bbHtml1.includes("bb-demo-multi") && bbHtml1.includes("top-bal-wrap") && !bbHtml1.includes("Препод · ЕГЭ"), "expected Brandbook to showcase interactive hh-multi and balance pill with full Преподаватель label");
    assert(bbHtml1.includes('class="tc-combo-line"') && bbHtml1.includes('stroke-linecap="butt"') && bbHtml1.includes("bb-donut-outer-ring") && !bbHtml1.includes("5%:"), "expected smooth .tc-combo-line path, crisp stroke-linecap=butt donut slices with outer indicator ring, and no 5%: substring");
    assert(
      bbHtml1.includes('id="bb-mask-trainer"') &&
      bbHtml1.includes('id="bb-payments"') &&
      bbHtml1.includes('id="bb-ege-timers"') &&
      bbHtml1.includes('id="bb-a11y"') &&
      bbHtml1.includes("bb-table-shell") &&
      bbHtml1.includes('data-label=') &&
      bbHtml1.includes('data-a="bb-tbl-confirm"'),
      "expected 4 new brandbook sections (#bb-mask-trainer, #bb-payments, #bb-ege-timers, #bb-a11y) and adaptive schema-driven table"
    );
    assert(globalThis.EGE && globalThis.EGE.charts && Array.isArray(globalThis.EGE.charts.CHART_STYLE_META) && globalThis.EGE.charts.CHART_STYLE_META.length === 6, "expected EGE.charts module with 6 DataViz variants");
    assert(typeof globalThis.EGE.charts.stickChartHTML === "function" && typeof globalThis.EGE.charts.lineChartHTML === "function" && typeof globalThis.EGE.charts.donutChartHTML === "function" && typeof globalThis.EGE.charts.dataTableHTML === "function" && globalThis.EGE.charts.TABLE_PRESETS && globalThis.EGE.charts.TABLE_PRESETS.payouts && globalThis.EGE.charts.TABLE_PRESETS.exams, "expected EGE.charts DataViz + TABLE_PRESETS + DataTable builders");
    assert(globalThis.EGE.kit && globalThis.EGE.kit.stickChartHTML === globalThis.EGE.charts.stickChartHTML && globalThis.EGE.kit.TABLE_PRESETS === globalThis.EGE.charts.TABLE_PRESETS, "expected EGE.kit to re-export canonical EGE.charts helpers and TABLE_PRESETS without duplication");

    // Универсальная schema-driven таблица: кастомная схема + cardWrap:false + подтверждение строки
    const customTblHtml = globalThis.EGE.charts.dataTableHTML({
      id: "custom-smoke-tbl",
      cols: 3,
      cardWrap: false,
      showPresetSwitch: false,
      showColsSwitch: false,
      columns: [
        { key: "item", label: "Параметр" },
        { key: "val", label: "Значение", num: true },
        { key: "status", label: "Статус", render: (r, h) => h.statusHTML(r) }
      ],
      rows: [
        { id: "c-1", item: "Биология · Линия 28", val: "1 200 ₽", status: "pending", statusLabel: "Ждёт проверки" }
      ],
      confirmedIds: { "c-1": true },
      confirmAction: "custom-confirm"
    });
    assert(
      customTblHtml.includes("bb-table-shell") &&
      customTblHtml.includes("bb-data-table cols-3 is-adaptive") &&
      customTblHtml.includes('data-label="Параметр"') &&
      customTblHtml.includes("Подтверждено ✓") &&
      customTblHtml.includes('data-a="custom-confirm"') &&
      !customTblHtml.includes("bb-data-table-card"),
      "expected custom schema dataTableHTML with cardWrap=false, data-label attributes, custom confirmAction, and confirmed row state"
    );

    // Переключение пресетов таблицы и подтверждение строки в /brandbook
    clickAction(env5, { a: "bb-tbl-preset", preset: "students", v: "students" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Трекер учеников · Табличный реестр"), "expected bb-tbl-preset=students to switch table preset to students");
    clickAction(env5, { a: "bb-tbl-preset", preset: "admin", v: "admin" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Реестр анкет, выплат НПД и событий аутбокса"), "expected bb-tbl-preset=admin to switch table preset to admin");
    clickAction(env5, { a: "bb-tbl-preset", preset: "payouts", v: "payouts" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("88412-НПД") && env5.elements.get("main").innerHTML.includes("СБП · Т-Банк"), "expected bb-tbl-preset=payouts to switch table preset to payouts");
    clickAction(env5, { a: "bb-tbl-preset", preset: "exams", v: "exams" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Вариант № 12 · Генетика"), "expected bb-tbl-preset=exams to switch table preset to exams");
    clickAction(env5, { a: "bb-tbl-preset", preset: "requests", v: "requests" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "bb-tbl-confirm", id: "tbl-4" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="bb-tbl-confirm" data-id="tbl-4">Сбросить</button>'), "expected bb-tbl-confirm on tbl-4 to confirm row and flip button to Сбросить");

    // Стресс-тест колонок таблицы (1 и 15 колонок) и multiLineChartHTML (20 линий × 30 точек) в /brandbook
    clickAction(env5, { a: "bb-tbl-cols", cols: "1", v: "1" });
    await flushMicrotasks(2);
    const bbCols1Html = env5.elements.get("main").innerHTML;
    assert(bbCols1Html.includes("cols-1") && bbCols1Html.includes("is-single-col"), "expected bb-tbl-cols=1 in /brandbook to render cols-1 single-column card layout");
    clickAction(env5, { a: "bb-tbl-cols", cols: "15", v: "15" });
    await flushMicrotasks(2);
    const bbCols15Html = env5.elements.get("main").innerHTML;
    assert(bbCols15Html.includes("cols-15") && bbCols15Html.includes("is-wide-cols") && bbCols15Html.includes("bb-tbl-wide-bar"), "expected bb-tbl-cols=15 in /brandbook to render cols-15 wide table with scroll helper bar");
    clickAction(env5, { a: "bb-tbl-cols", cols: "5", v: "5" });
    await flushMicrotasks(1);

    assert(typeof globalThis.EGE.charts.multiLineChartHTML === "function" && typeof globalThis.EGE.charts.buildMultiSeriesDemo === "function", "expected multiLineChartHTML and buildMultiSeriesDemo in EGE.charts");
    const direct20x30 = globalThis.EGE.charts.multiLineChartHTML({
      linesCount: 20,
      pointsCount: 30,
      dataset: "gmv",
      series: globalThis.EGE.charts.buildMultiSeriesDemo(20, 30, "gmv")
    });
    assert((direct20x30.match(/class="bb-line-path"/g) || []).length === 20 && !direct20x30.includes("NaN"), "expected EGE.charts.multiLineChartHTML(20x30) to render 20 crisp line paths without NaN");
    clickAction(env5, { a: "bb-chart-lines", lines: "20", v: "20" });
    clickAction(env5, { a: "bb-chart-pts", pts: "30", v: "30" });
    await flushMicrotasks(2);
    const bb20x30Html = env5.elements.get("main").innerHTML;
    assert((bb20x30Html.match(/class="bb-line-path"/g) || []).length === 20 && !bb20x30Html.includes("NaN"), "expected /brandbook interactive 20-line x 30-point stress test to render 20 paths");
    clickAction(env5, { a: "bb-chart-lines", lines: "1", v: "1" });
    clickAction(env5, { a: "bb-chart-pts", pts: "7", v: "7" });
    await flushMicrotasks(1);

    // Секции #bb-admin-kit и #bb-arch-split в /brandbook: вкладки админ-стенда и dual-role таблицы
    assert(env5.elements.get("main").innerHTML.includes('id="bb-admin-kit"') && env5.elements.get("main").innerHTML.includes('id="bb-arch-split"'), "expected #bb-admin-kit and #bb-arch-split in /brandbook");
    clickAction(env5, { a: "bb-admin-tab", v: "payouts" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="bb-admin-tab" data-v="payouts" aria-pressed="true"'), "expected bb-admin-tab=payouts to activate payouts tab in #bb-admin-kit");
    clickAction(env5, { a: "bb-admin-tab", v: "moderation" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "bb-dual-role", v: "tutor" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Перспектива преподавателя · Мои ученики"), "expected bb-dual-role=tutor to switch #bb-arch-split perspective to tutor");
    clickAction(env5, { a: "bb-dual-role", v: "student" });
    await flushMicrotasks(1);

    // Подсайты брендбука (/brandbook/*), чистые превью Desktop/Mobile и контракты API
    clickAction(env5, { a: "bb-subsite", v: "hub" });
    await flushMicrotasks(2);
    const bbHubHtml = env5.elements.get("main").innerHTML;
    assert(bbHubHtml.includes('id="bb-device-showcase"') && bbHubHtml.includes('id="bb-hub-directory"') && !bbHubHtml.includes('id="bb-data-viz"'), "expected bb-subsite=hub to render device showcase and hub directory");

    clickAction(env5, { a: "bb-subsite", v: "home" });
    await flushMicrotasks(2);
    const bbHomeHtml = env5.elements.get("main").innerHTML;
    assert(bbHomeHtml.includes('id="bb-device-showcase"') && bbHomeHtml.includes('id="bb-hero-banner"') && bbHomeHtml.includes("Назначай цену сам — репетиторы дешевле рынка"), "expected bb-subsite=home to render device showcase, updated hero headline and hero showcase");
    clickAction(env5, { a: "bb-dev-view", v: "desktop" });
    await flushMicrotasks(2);
    const bbDesktopOnly = env5.elements.get("main").innerHTML;
    assert(bbDesktopOnly.includes('data-device="desktop"') && !bbDesktopOnly.includes('data-device="mobile"'), "expected bb-dev-view=desktop to show isolated desktop preview");
    clickAction(env5, { a: "bb-dev-view", v: "mobile" });
    await flushMicrotasks(2);
    const bbMobileOnly = env5.elements.get("main").innerHTML;
    assert(bbMobileOnly.includes('data-device="mobile"') && !bbMobileOnly.includes('data-device="desktop"'), "expected bb-dev-view=mobile to show isolated mobile preview");

    clickAction(env5, { a: "bb-subsite", v: "api" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('id="bb-api-contracts"') && env5.elements.get("main").innerHTML.includes("/api/admin/overview") && !env5.elements.get("main").innerHTML.includes('id="bb-data-viz"'), "expected bb-subsite=api to show API contracts portal");
    clickAction(env5, { a: "bb-api-group", v: "calendar" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("/api/calendar/{token}.ics") && !env5.elements.get("main").innerHTML.includes("/api/auth/login"), "expected bb-api-group=calendar to filter API endpoints");

    for (const sid of ["ui-kit", "dataviz", "admin", "data", "all"]) {
      clickAction(env5, { a: "bb-subsite", v: sid });
      await flushMicrotasks(2);
      assert(env5.elements.get("main").innerHTML.includes('data-bb-subsite="' + sid + '"'), "expected bb-subsite=" + sid + " active");
    }

    // Живой тренажёр масок контактов (#bb-mask-trainer)
    clickAction(env5, { a: "bb-mask-sample", phone: "89245553311", tg: "@sakha_tutor", max: "sakha_max" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("https://wa.me/79245553311") && env5.elements.get("main").innerHTML.includes("https://t.me/sakha_tutor") && env5.elements.get("main").innerHTML.includes("https://max.ru/sakha_max"), "expected bb-mask-sample to update wa.me, t.me and max.ru links");
    env5.emitDoc("input", { target: { id: "bb-mask-phone", value: "89140001122", dataset: {} } });
    env5.emitDoc("input", { target: { id: "bb-mask-tg", value: "@chem_ykt", dataset: {} } });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("https://wa.me/79140001122") && env5.elements.get("main").innerHTML.includes("https://t.me/chem_ykt"), "expected live input on #bb-mask-phone and #bb-mask-tg to reformat links immediately");

    // Эквайринг (#bb-payments), Shell-виджеты (#bb-ui-kit-shells), Data & Observability (#bb-telemetry-etl), ЕГЭ-2027 (#bb-ege-timers) и A11y (#bb-a11y)
    clickAction(env5, { a: "bb-pay-threshold", v: "repeat" });
    clickAction(env5, { a: "bb-pay-method", v: "tpay" });
    clickAction(env5, { a: "bb-pay-state", v: "captured" });
    await flushMicrotasks(2);
    const bbPayHtml = env5.elements.get("main").innerHTML;
    assert(
      bbPayHtml.includes("Повторное от 100 ₽") &&
      bbPayHtml.includes("Проведено · 95% / 5%") &&
      bbPayHtml.includes('id="bb-ui-kit-shells"') &&
      bbPayHtml.includes('id="bb-telemetry-etl"') &&
      bbPayHtml.includes("tutor-bal-dock is-inline-preview") &&
      !bbPayHtml.includes("Вывести 95%") &&
      !bbPayHtml.includes("5%:") &&
      !bbPayHtml.toLowerCase().includes("#13794b"),
      "expected #bb-payments, #bb-ui-kit-shells, #bb-telemetry-etl without Вывести 95%, 5%:, or #13794b"
    );
    assert(
      ["topBalanceWidgetHTML", "tutorBalanceDockHTML", "walletSummaryBarHTML", "sideToastInnerHTML", "emptyStateHTML", "skeletonCardHTML", "pipelineStageCardHTML", "eventLogFeedHTML"].every((fn) => typeof globalThis.EGE.kit[fn] === "function"),
      "expected all 8 new EGE.kit widget/observability builders to be exported"
    );
    clickAction(env5, { a: "bb-shell-role", role: "student", v: "student" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Режим: Ученик") && env5.elements.get("main").innerHTML.includes("Текущий баланс ученика"), "expected bb-shell-role=student to switch shell widget previews to student mode");
    clickAction(env5, { a: "bb-shell-role", role: "tutor", v: "tutor" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Режим: Преподаватель") && env5.elements.get("main").innerHTML.includes("Доступно к выводу"), "expected bb-shell-role=tutor to switch shell widget previews back to tutor mode");
    clickAction(env5, { a: "bb-pipe-filter", v: "polars" });
    await flushMicrotasks(2);
    const bbPolarsHtml = env5.elements.get("main").innerHTML;
    assert(bbPolarsHtml.includes("Polars M4 Pro · Medallion ETL") && !bbPolarsHtml.includes("Airflow DAG · Orchestration"), "expected bb-pipe-filter=polars to filter pipeline cards and event log");
    clickAction(env5, { a: "bb-pipe-filter", v: "all" });
    await flushMicrotasks(2);
    const bbAllPipeHtml = env5.elements.get("main").innerHTML;
    assert(bbAllPipeHtml.includes("PostgreSQL 17 · OLTP + Outbox") && bbAllPipeHtml.includes("Grafana BI · Observability") && bbAllPipeHtml.includes("Kafka Clickstream"), "expected bb-pipe-filter=all to show all 5 Data & Observability stages");
    assert(
      !readFileText("ux-ui/brandbook/brandbook.js").includes("Вывести 95%") &&
      !readFileText("ux-ui/components/kit.js").includes("Вывести 95%") &&
      !readFileText("frontend/index.html").toLowerCase().includes("#13794b"),
      "expected zero occurrences of Вывести 95% in ux-ui and zero #13794b in index.html"
    );

    // UI Kit + Brandbook: realtimeStatusPillHTML & calendarSyncCardHTML (UTC+9 / UTC+3)
    assert(
      typeof globalThis.EGE.kit.realtimeStatusPillHTML === "function" &&
      typeof globalThis.EGE.kit.calendarSyncCardHTML === "function",
      "expected EGE.kit.realtimeStatusPillHTML and calendarSyncCardHTML to be exported"
    );
    const rtPillSse = globalThis.EGE.kit.realtimeStatusPillHTML({ mode: "sse", channelLabel: "tutor", unreadCount: 3, action: "demo-rt", actAttr: "data-act" });
    const rtPillWs = globalThis.EGE.kit.realtimeStatusPillHTML({ mode: "ws", channelLabel: "ws" });
    const rtPillLocal = globalThis.EGE.kit.realtimeStatusPillHTML({ mode: "local" });
    assert(
      rtPillSse.includes("rt-status-pill is-sse") && rtPillSse.includes("Live · SSE") && rtPillSse.includes("+3") && rtPillSse.includes('data-act="demo-rt"') &&
      rtPillWs.includes("rt-status-pill is-ws") && rtPillWs.includes("Live · WS") &&
      rtPillLocal.includes("rt-status-pill is-local") && rtPillLocal.includes("Табы · Офлайн"),
      "expected realtimeStatusPillHTML to support sse/ws/local modes, unread badge, and custom actAttr"
    );
    const calCardYkt = globalThis.EGE.kit.calendarSyncCardHTML({ timezone: "UTC+9", gcalConnected: true, eventCount: 3, busySlots: [{ dayLabel: "Сб", hour: "16:00", summary: "GCal" }], conflictsCount: 1 });
    const calCardMsk = globalThis.EGE.kit.calendarSyncCardHTML({ timezone: "UTC+3", gcalConnected: false, eventCount: 2, busySlots: [], conflictsCount: 0 });
    assert(
      calCardYkt.includes("cal-sync-card") && calCardYkt.includes("16:00 Якт") && calCardYkt.includes("calendar.google.com") && calCardYkt.includes(".ics") &&
      calCardMsk.includes("10:00 Мск"),
      "expected calendarSyncCardHTML to display timezone-aware 07:00 UTC conversion, .ics URL and Google Calendar links"
    );
    assert(
      env5.elements.get("main").innerHTML.includes("rt-status-pill is-sse") &&
      env5.elements.get("main").innerHTML.includes("cal-sync-card") &&
      env5.elements.get("main").innerHTML.includes("16:00 Якт"),
      "expected Brandbook #bb-ui-kit-shells and #bb-ege-timers to render realtimeStatusPillHTML and calendarSyncCardHTML"
    );
    clickAction(env5, { a: "bb-cal-tz", v: "UTC+3" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("10:00 Мск") && env5.elements.get("main").innerHTML.includes('data-act="bb-cal-tz"'), "expected bb-cal-tz=UTC+3 in Brandbook to switch sample preview to 10:00 Мск");
    clickAction(env5, { a: "bb-cal-tz", v: "UTC+9" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("16:00 Якт"), "expected bb-cal-tz=UTC+9 to restore 16:00 Якт preview");
    clickAction(env5, { a: "bb-essay-tab", idx: "1", v: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="bb-essay-tab" data-idx="1" data-v="1" aria-pressed="true"'), "expected bb-essay-tab to switch AI essay breakdown tab");
    clickAction(env5, { a: "bb-reduced-motion" });
    await flushMicrotasks(2);
    assert(env5.documentElement.classList.contains("reduced-motion") && env5.elements.get("main").innerHTML.includes("Reduced Motion: ВКЛ ✓"), "expected bb-reduced-motion to add html.reduced-motion class");
    clickAction(env5, { a: "bb-reduced-motion" });
    await flushMicrotasks(2);
    assert(!env5.documentElement.classList.contains("reduced-motion"), "expected second bb-reduced-motion click to disable html.reduced-motion");

    clickAction(env5, { a: "bb-multi-toggle" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes('class="hh-select hh-multi open"') && env5.elements.get("main").innerHTML.includes('aria-multiselectable="true"'), "expected bb-multi-toggle to open Brandbook multi-select dropdown");
    clickAction(env5, { a: "bb-multi-pick", v: "rus" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Русский язык"), "expected bb-multi-pick to select additional subject in Brandbook");

    // Преподаватель: баланс слева снизу в #side-balance-slot + справа сверху в мобильном слоте (#tutor-balance-dock всегда скрыт) + EGE.payments.createPayoutIntent + история выводов в /fees
    clickAction(env5, { a: "role-set", role: "tutor" });
    await flushMicrotasks(3);
    const wBefore = globalThis.EGE.views.tutorCabinet.getWalletSummary();
    const wBeforeLabel = wBefore.availableRub.toLocaleString("ru-RU") + " ₽";
    assert(
      globalThis.EGE.views.tutorCabinet.sideBalanceWidgetHTML() === globalThis.EGE.kit.sideTutorBalanceHTML({ availableRub: wBefore.availableRub, escrowRub: wBefore.escrowRub, action: "tc-payout-open" }) &&
      globalThis.EGE.views.tutorCabinet.desktopDockHTML() === globalThis.EGE.kit.tutorBalanceDockHTML({ availableRub: wBefore.availableRub, escrowRub: wBefore.escrowRub, action: "tc-payout-open" }) &&
      globalThis.EGE.views.tutorCabinet.mobileTopWidgetHTML() === globalThis.EGE.kit.topBalanceWidgetHTML({ role: "tutor", amountRub: wBefore.availableRub, pillAction: "tc-payout-open", btnAction: "tc-payout-open" }),
      "expected tutorCabinet sideBalanceWidgetHTML(), desktopDockHTML() and mobileTopWidgetHTML() to delegate cleanly to EGE.kit"
    );
    assert(
      wBefore.availableRub >= 5000 &&
      env5.elements.get("tutor-balance-dock").hidden === true &&
      hasNum(env5.elements.get("side-foot").innerHTML, wBeforeLabel) &&
      hasNum(env5.elements.get("top-balance-slot").innerHTML, wBeforeLabel),
      `expected teacher available balance (${wBeforeLabel}) in #side-balance-slot and topbar widget with #tutor-balance-dock hidden`
    );
    let payoutIntentPayload = null;
    globalThis.EGE.payments.setGatewayHandler((intent) => {
      if (intent && intent.type === "payout") payoutIntentPayload = intent;
      return intent;
    });
    clickAction(env5, { a: "tc-payout-open" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="tc-payout-title"') && env5.elements.get("modal-root").innerHTML.includes('data-f="tc-payout"'), "expected tc-payout-open to open teacher withdrawal modal");
    clickAction(env5, { a: "tc-payout-method", v: "card" });
    await flushMicrotasks(1);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="tc-payout-card"'), "expected switching payout method to card to show Мир/РФ card input");
    clickAction(env5, { a: "tc-payout-method", v: "sbp" });
    clickAction(env5, { a: "tc-payout-npd" });
    clickAction(env5, { a: "tc-payout-chip", v: "5000" });
    await flushMicrotasks(1);
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-payout" } }) }, preventDefault() {} });
    await flushMicrotasks(3);
    globalThis.EGE.payments.setGatewayHandler(null);
    assert(payoutIntentPayload && payoutIntentPayload.amount === 5000 && payoutIntentPayload.method === "sbp", "expected EGE.payments.createPayoutIntent gateway hook to receive 5000 RUB SBP payout payload");
    const wAfter = globalThis.EGE.views.tutorCabinet.getWalletSummary();
    const wAfterLabel = (wBefore.availableRub - 5000).toLocaleString("ru-RU") + " ₽";
    assert(!env5.elements.get("modal-root").innerHTML.trim() && env5.elements.get("toast").innerHTML.includes("Заявка на вывод оформлена"), "expected payout modal to close and show confirmation notification");
    assert(
      wAfter.availableRub === wBefore.availableRub - 5000 &&
      env5.elements.get("tutor-balance-dock").hidden === true &&
      hasNum(env5.elements.get("side-foot").innerHTML, wAfterLabel) &&
      hasNum(env5.elements.get("top-balance-slot").innerHTML, wAfterLabel),
      `expected teacher balance to deduct 5 000 ₽ immediately in sidebar and topbar (${wBeforeLabel} -> ${wAfterLabel})`
    );
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tutorFeesHtml = env5.elements.get("main").innerHTML;
    assert(tutorFeesHtml.includes("История выводов средств") && tutorFeesHtml.includes('id="tc-payout-history"') && hasNum(tutorFeesHtml, "5 000 ₽"), "expected new 5 000 ₽ withdrawal row rendered inside История выводов средств on /fees");

    clickAction(env5, { a: "role-set", role: "student" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("Тесты ЕГЭ") && env5.elements.get("tutor-balance-dock").hidden === true, "expected role-set back to student to return cleanly to Тесты ЕГЭ and hide teacher balance dock");

    // Realtime SSE/WS/BroadcastChannel клиент + Two-Way .ics / GCal UTC+9 / UTC+3 + live заявка /market -> кабинет репетитора
    assert(globalThis.EGE.realtime && typeof globalThis.EGE.realtime.publish === "function" && typeof globalThis.EGE.realtime.importIcs === "function", "expected window.EGE.realtime module to be loaded");
    const sampleIcs0700Z = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:test-0700z",
      "DTSTART:20261121T070000Z",
      "DTEND:20261121T080000Z",
      "SUMMARY:GCal 07:00 UTC Test",
      "END:VEVENT",
      "END:VCALENDAR"
    ].join("\r\n");
    const parsedYkt = globalThis.EGE.realtime.parseIcsBusySlots(sampleIcs0700Z, "UTC+9", { "6": ["16:00"] });
    const parsedMsk = globalThis.EGE.realtime.parseIcsBusySlots(sampleIcs0700Z, "UTC+3", {});
    assert(
      parsedYkt.busySlots.length === 1 && parsedYkt.busySlots[0].hour === "16:00" && parsedYkt.busySlots[0].day === "sat" &&
      parsedYkt.conflicts.length === 1 && parsedYkt.conflicts[0].key === "sat|16:00" &&
      parsedMsk.busySlots.length === 1 && parsedMsk.busySlots[0].hour === "10:00" && parsedMsk.busySlots[0].day === "sat",
      "expected parseIcsBusySlots to map 07:00Z to 16:00 in UTC+9 (Yakutsk), 10:00 in UTC+3 (Moscow), and detect { \"6\": [\"16:00\"] } open-slot conflict"
    );
    const calCardDowZero = globalThis.EGE.kit.calendarSyncCardHTML({
      timezone: "UTC+9",
      gcalConnected: true,
      eventCount: 1,
      busySlots: [{ uid: "u-sun", dow: 0, hour: "16:00", summary: "GCal Воскресенье" }],
      conflictsCount: 0
    });
    assert(calCardDowZero.includes("Вс · 16:00 · GCal Воскресенье"), "expected calendarSyncCardHTML to resolve dow:0 Sunday pill fallback without dayLabel");

    const pendingBeforeBid = globalThis.EGE.views.tutorCabinet.pendingCount();
    let seenBidEvent = null;
    const unsubRt = globalThis.EGE.realtime.onEvent((ev) => {
      if (ev && ev.eventType === "market.bid.created") seenBidEvent = ev;
    });
    const firstTutorId = (globalThis.EGE.tutors && globalThis.EGE.tutors.LIST && globalThis.EGE.tutors.LIST[0] && globalThis.EGE.tutors.LIST[0].id) || "tut-sokolova";
    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(3);
    clickAction(env5, { a: "book-open", id: firstTutorId, hour: "14:00" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(3);
    unsubRt();
    assert(
      seenBidEvent && seenBidEvent.channel === "tutor" &&
      globalThis.EGE.views.tutorCabinet.pendingCount() === pendingBeforeBid + 1,
      "expected student book-submit to publish market.bid.created via EGE.realtime and increment tutorCabinet pendingCount live"
    );

    // Переключаемся в кабинет преподавателя и проверяем live-пилюлю + чистый календарь + импорт .ics / Занято в GCal
    clickAction(env5, { a: "role-set", role: "tutor" });
    await flushMicrotasks(3);
    const tutorCabHtml = env5.elements.get("main").innerHTML;
    assert(tutorCabHtml.includes("rt-status-pill"), "expected realtimeStatusPillHTML in tutor cabinet header");
    assert(env5.elements.get("side-nav").innerHTML.includes(`>${pendingBeforeBid + 1}<`), "expected updated Заявки badge count in tutor sidebar navigation");
    clickAction(env5, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    const calDefaultHtml = env5.elements.get("main").innerHTML;
    assert(!calDefaultHtml.includes("cal-sync-card") && calDefaultHtml.includes('data-a="tc-cal-import-modal"'), "expected clean default calendar without .cal-sync-card and with tc-cal-import-modal CTA");
    clickAction(env5, { a: "tc-cal-import-modal" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-f="tc-cal-import"') && env5.elements.get("main").innerHTML.includes('data-a="tc-cal-import-sample"'), "expected tc-cal-import-modal to reveal tc-cal-import form and sample CTA");
    clickAction(env5, { a: "tc-cal-import-sample" });
    await flushMicrotasks(3);
    const calSatConflict = env5.elements.get("main").innerHTML;
    assert(calSatConflict.includes("Конфликт GCal"), "expected tc-cal-import-sample on Saturday 16:00 (booked lesson) to flag Конфликт GCal");
    clickAction(env5, { a: "tc-day", dow: "3" });
    await flushMicrotasks(2);
    const calAfterSample = env5.elements.get("main").innerHTML;
    assert(
      calAfterSample.includes("is-gcal-busy") && calAfterSample.includes("Занято в GCal") && calAfterSample.includes("16:00"),
      "expected tc-cal-import-sample on Wednesday (dow: 3) to render 07:00 UTC event as 16:00 Занято в GCal slot in Yakutsk UTC+9"
    );

    // Проверка воскресного (dow === 0) слота из .ics (07:00Z в Вс 22 нояб. 2026) без потери 0 || ""
    clickAction(env5, { a: "tc-day", dow: "0" });
    await flushMicrotasks(2);
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "tc-cal-import" },
          elements: {
            icsText: {
              value: [
                "BEGIN:VCALENDAR",
                "VERSION:2.0",
                "BEGIN:VEVENT",
                "UID:sun-dow-0",
                "DTSTART:20261122T070000Z",
                "DTEND:20261122T080000Z",
                "SUMMARY:Sunday GCal 07:00 UTC",
                "END:VEVENT",
                "END:VCALENDAR"
              ].join("\r\n")
            }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(3);
    const calAfterSunday = env5.elements.get("main").innerHTML;
    assert(
      calAfterSunday.includes("is-gcal-busy") && calAfterSunday.includes("Sunday GCal 07:00 UTC") && calAfterSunday.includes("16:00"),
      "expected Sunday (dow: 0) GCal busy slot to render properly without falsy 0 || \"\" bug"
    );

    clickAction(env5, { a: "role-set", role: "student" });
    await flushMicrotasks(3);

    // 9. Проверка EGE.api, изоляции ux-ui/* (Zero API / Zero Business Data) и Админ-панели (/admin)
    assert(
      globalThis.EGE && globalThis.EGE.api &&
      typeof globalThis.EGE.api.request === "function" &&
      typeof globalThis.EGE.api.configure === "function" &&
      typeof globalThis.EGE.api.getBaseUrl === "function" &&
      typeof globalThis.EGE.api.health === "function" &&
      typeof globalThis.EGE.api.storageHealth === "function" &&
      globalThis.EGE.api.auth && typeof globalThis.EGE.api.auth.login === "function" &&
      globalThis.EGE.api.docs && typeof globalThis.EGE.api.docs.list === "function" &&
      globalThis.EGE.api.calendar && typeof globalThis.EGE.api.calendar.state === "function" &&
      globalThis.EGE.api.realtime && typeof globalThis.EGE.api.realtime.recent === "function" &&
      globalThis.EGE.api.admin && typeof globalThis.EGE.api.admin.overview === "function" &&
      typeof globalThis.EGE.api.admin.setUserRole === "function" &&
      typeof globalThis.EGE.api.admin.moderateTutor === "function" &&
      typeof globalThis.EGE.api.admin.setRequestStatus === "function" &&
      typeof globalThis.EGE.api.admin.setPayoutStatus === "function",
      "expected centralized window.EGE.api module with all resource groups"
    );

    const uiKitFiles = [
      "ux-ui/components/icons.js",
      "ux-ui/components/hh-components.js",
      "ux-ui/components/charts.js",
      "ux-ui/components/tables.js",
      "ux-ui/components/kit.js",
      "ux-ui/brandbook/subsites.js",
      "ux-ui/brandbook/brandbook.js"
    ];
    for (const uif of uiKitFiles) {
      const txt = readFileText(uif);
      assert(
        !/\bfetch\s*\(/.test(txt) &&
        !txt.includes("EventSource") &&
        !txt.includes("WebSocket") &&
        !txt.includes("EGE.api") &&
        !txt.includes("EGE.tutors"),
        `expected zero API/network/business-data dependencies inside ${uif}`
      );
    }

    // Вход в Админ-панель (/admin) через role-set
    clickAction(env5, { a: "role-set", role: "admin" });
    await flushMicrotasks(4);
    const admSideNav = env5.elements.get("side-nav").innerHTML;
    const admTabBar = env5.elements.get("tabbar").innerHTML;
    const admOverviewHtml = env5.elements.get("main").innerHTML;
    assert(
      env5.elements.get("side-subjects-wrap").hidden === true &&
      env5.elements.get("tutor-balance-dock").hidden === true &&
      env5.elements.get("top-balance-slot").hidden === false &&
      env5.elements.get("top-balance-slot").innerHTML.includes("Админ · Dual PG17") &&
      env5.elements.get("side-foot").innerHTML.includes("side-admin-pill is-on"),
      "expected admin chrome: hidden student subjects & tutor dock, concise Админ · Dual PG17 top badge, active side-admin-pill"
    );
    for (const label of ["Обзор", "Заявки и ученики", "Репетиторы", "Выплаты НПД", "Система и API"]) {
      assert(admSideNav.includes(label), `expected admin sidebar item: ${label}`);
    }
    for (const mLabel of ["Обзор", "Заявки", "Репетиторы", "Выплаты", "API"]) {
      assert(admTabBar.includes(mLabel), `expected admin mobile tabbar item: ${mLabel}`);
    }
    const admUsersSlice = admOverviewHtml.slice(Math.max(0, admOverviewHtml.indexOf('id="adm-overview-users"')));
    assert(
      admOverviewHtml.includes("adm-kpi-grid") &&
      admOverviewHtml.includes("tc-combo-svg-wrap") &&
      (admOverviewHtml.match(/class="tc-combo-dot"/g) || []).length === 7 &&
      admOverviewHtml.includes('id="adm-overview-users"') &&
      (admUsersSlice.match(/<th\b/g) || []).length === 5 &&
      admUsersSlice.includes(">Ученик<") &&
      admUsersSlice.includes(">Преподаватель<") &&
      admUsersSlice.includes(">Админ<") &&
      !admOverviewHtml.includes("3 колонки") &&
      !admOverviewHtml.includes("7 колонок") &&
      admOverviewHtml.includes("GMV ₽") &&
      admOverviewHtml.includes("Выплаты 95% ₽") &&
      admOverviewHtml.includes("Сбор 5% ₽"),
      "expected admin overview tab with KPI grid, 7-day unified SVG combo chart, 5-col Russian-labeled users table, and zero cols switches"
    );
    clickAction(env5, { a: "adm-user-role", id: "3", role: "tutor" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Роль обновлена"), "expected adm-user-role to update user role and notify");

    // Вкладка Заявки и ученики
    clickAction(env5, { a: "go", v: "admin-requests" });
    await flushMicrotasks(3);
    const admReqsHtml = env5.elements.get("main").innerHTML;
    assert(admReqsHtml.includes('id="adm-requests-table"') && admReqsHtml.includes("bb-data-table"), "expected adm-requests-table in admin requests tab");
    clickAction(env5, { a: "adm-req-status", id: "req-1002", status: "accepted" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Статус заявки обновлён"), "expected adm-req-status to update request status");

    // Вкладка Репетиторы
    clickAction(env5, { a: "go", v: "admin-tutors" });
    await flushMicrotasks(3);
    const admTutorsHtml = env5.elements.get("main").innerHTML;
    assert(admTutorsHtml.includes('id="adm-tutors-table"') && admTutorsHtml.includes("adm-mod-badge"), "expected adm-tutors-table with adminModerationBadgeHTML");
    const mTutorVerify = /data-a="adm-verify-tutor" data-id="([^"]+)"/.exec(admTutorsHtml);
    assert(Boolean(mTutorVerify), "expected adm-verify-tutor button in tutors table");
    clickAction(env5, { a: "adm-verify-tutor", id: mTutorVerify[1] });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("верифи") || env5.elements.get("toast").innerHTML.includes("Верификация"), "expected adm-verify-tutor to toggle verification state");

    // Вкладка Выплаты
    clickAction(env5, { a: "go", v: "admin-payouts" });
    await flushMicrotasks(3);
    const admPayoutsHtml = env5.elements.get("main").innerHTML;
    assert(admPayoutsHtml.includes('id="adm-payouts-table"') && admPayoutsHtml.includes("88412-НПД"), "expected adm-payouts-table with NPD payout rows");
    clickAction(env5, { a: "adm-payout-approve", id: "pay-3002" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Выплата проведена"), "expected adm-payout-approve to mark payout succeeded");

    // Вкладка Система и API
    clickAction(env5, { a: "go", v: "admin-system" });
    await flushMicrotasks(3);
    const admSysHtml = env5.elements.get("main").innerHTML;
    assert(
      admSysHtml.includes("arch-boundary-card") &&
      admSysHtml.includes("vektor-ui-kit") &&
      admSysHtml.includes("vektor-api") &&
      admSysHtml.includes("vektor-grafana") &&
      admSysHtml.includes("bb-log-feed"),
      "expected admin system tab to render 7 serviceBoundaryCardHTML layers and outbox eventLogFeedHTML"
    );

    // Возврат обратно к роли Ученик
    clickAction(env5, { a: "role-set", role: "student" });
    await flushMicrotasks(3);
    assert(env5.elements.get("main").innerHTML.includes("Тесты ЕГЭ") && env5.elements.get("side-subjects-wrap").hidden === false, "expected role-set back to student from admin to restore Тесты ЕГЭ and student sidebar");

    // Проверка отсутствия переключателя 3/7 колонок в таблицах ученика (/study и /market)
    clickAction(env5, { a: "go", v: "study" });
    await flushMicrotasks(3);
    assert(!env5.elements.get("main").innerHTML.includes("3 колонки") && !env5.elements.get("main").innerHTML.includes("7 колонок"), "expected student /study tables to hide 3/7 cols switch");

    // 10. Проверка разделения на 3 отдельных сайта (HOST_SITE: student / tutor / admin)
    const mkAuthedFetch = () => async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => {
        if (url === "/api/me") return { user: { id: 1, username: "demo", displayName: "Демо", authProvider: "local" }, ai: { enabled: false }, inviteRequired: false, providers: { local: true, google: false } };
        if (url === "/api/docs") return { docs: {} };
        return { ok: true };
      }
    });

    const envSiteStu = installGlobals({ host: { backend: true, site: "student" }, fetch: mkAuthedFetch() });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    assert(
      envSiteStu.elements.get("main").innerHTML.includes("Тесты ЕГЭ") &&
      envSiteStu.elements.get("side-foot").innerHTML.includes("side-site-links") &&
      envSiteStu.elements.get("tutor-balance-dock").hidden === true,
      "expected site=student to render Тесты ЕГЭ, .side-site-links, and hidden #tutor-balance-dock"
    );

    const envSiteTut = installGlobals({ host: { backend: true, site: "tutor" }, fetch: mkAuthedFetch() });
    loadScripts(dataScripts.filter((s) => s !== "views/admin.js"));
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    assert(
      envSiteTut.elements.get("main").innerHTML.includes("Личный кабинет преподавателя") &&
      envSiteTut.elements.get("side-foot").innerHTML.includes("side-site-links") &&
      envSiteTut.elements.get("side-foot").innerHTML.includes("side-tutor-bal") &&
      envSiteTut.elements.get("tutor-balance-dock").hidden === true,
      "expected site=tutor (even without views/admin.js) to render cabinet, .side-site-links, #side-balance-slot tutor balance, and hidden #tutor-balance-dock"
    );

    const envSiteAdmGuest = installGlobals({
      host: { backend: true, site: "admin" },
      fetch: async (url) => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => (url === "/api/me" ? { user: null, ai: { enabled: false }, inviteRequired: false, providers: { local: true, google: false } } : { ok: true })
      })
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    clickAction(envSiteAdmGuest, { a: "auth-modal-open" });
    await flushMicrotasks(2);
    const admModalHtml = envSiteAdmGuest.elements.get("modal-root").innerHTML;
    assert(admModalHtml.includes("Админ-панель (демо)") && !admModalHtml.includes('data-a="auth-role"'), "expected unauthenticated /admin auth modal to hide auth-role switcher and show Админ-панель (демо)");
    clickAction(envSiteAdmGuest, { a: "auth-guest" });
    await flushMicrotasks(6);
    assert(
      envSiteAdmGuest.elements.get("main").innerHTML.includes("adm-kpi-grid") &&
      envSiteAdmGuest.elements.get("side-foot").innerHTML.includes("side-site-links") &&
      envSiteAdmGuest.elements.get("tutor-balance-dock").hidden === true,
      "expected auth-guest on site=admin to enter Админ-панель with .side-site-links"
    );

    out("APP_SMOKE_TESTS_OK");
    if (isNode) process.exit(0);
  }

  main().catch((err) => {
    out(String(err) + (err && err.stack ? "\n" + err.stack : ""));
    if (isNode) process.exit(1);
    if (typeof quit === "function") quit(1);
    throw err;
  });
})();
