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
      let _html = "";
      let _sheetBody = null;
      let _modalCard = null;
      const el = {
        id: id || "",
        get innerHTML() { return _html; },
        set innerHTML(v) {
          _html = String(v || "");
          _sheetBody = _html.includes("sheet-body") ? { scrollTop: 0 } : null;
          const kindM = /class="[^"]*\bmodal-card\b[^"]*"[^>]*data-sheet-kind="([^"]+)"/.exec(_html);
          _modalCard = _html.includes("modal-card") ? { scrollTop: 0, dataset: { sheetKind: kindM ? kindM[1] : "" } } : null;
        },
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
          if (sel === ".sheet-body") return _sheetBody;
          if (sel === ".modal-card") return _modalCard;
          return null;
        },
        querySelectorAll() { return []; },
        closest() { return null; }
      };
      return el;
    }

    for (const id of ["main", "side-nav", "side-subjects-wrap", "side-subjects", "side-foot", "top-balance-slot", "top-notifs", "top-notifs-cnt", "side-notifs", "side-notifs-cnt", "tutor-balance-dock", "tabbar", "toast", "tip", "modal-root", "cookie-banner", "bug-mailto", "mini-chat-dock"]) {
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

    defGlobal("location", { hash: opts.hash || "", search: opts.search || "", pathname: opts.pathname || "/" });
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
    assert(scripts.length >= 30 && scripts.includes("core/api.js") && !scripts.includes("views/admin.js") && scripts[scripts.length - 1] === "app.js", "expected index.html scripts including core/api.js and excluding removed views/admin.js");
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
    assert(env1.elements.get("side-foot").innerHTML.includes("Саша") && main1.includes("comm-head-seg") && !main1.includes("Общение ·"), "local legacy migration home check failed");
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
            providers: { local: true, phone: true, google: true, telegram: false }
          });
        }
        if (url === "/api/auth/phone/send") {
          const body = JSON.parse(init.body);
          if (body.mode === "register" && body.inviteCode !== "MED") {
            return mkRes(403, { detail: { code: "invalid_invite", message: "Неверный код приглашения." } });
          }
          return mkRes(200, {
            ok: true,
            phone: body.phone,
            channel: body.channel || "wa",
            channelName: body.channel === "tg" ? "Telegram" : "WhatsApp",
            demoCode: body.resend ? "7391" : "4829"
          });
        }
        if (url === "/api/auth/phone/verify") {
          const body = JSON.parse(init.body);
          if (body.code !== "4829" && body.code !== "7391") {
            return mkRes(400, { detail: { code: "invalid_code", message: "Неверный код подтверждения. Проверьте сообщение в WhatsApp или Telegram." } });
          }
          authedUser = {
            id: 7,
            username: "u_0511",
            displayName: body.phone || "+7 (914) 210-05-11",
            email: null,
            authProvider: body.authProvider || "phone",
            role: body.role || "student"
          };
          return mkRes(200, { user: authedUser, phone: body.phone, channel: body.channel || "wa" });
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
        if (url === "/api/tutor-applications" && (init.method || "GET") === "POST") {
          const b = JSON.parse(init.body || "{}");
          return mkRes(200, { ok: true, application: Object.assign({ id: "tapp-env5-1", status: "new" }, b) });
        }
        return mkRes(404, { detail: "not found" });
      }
    });

    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(20);
    const homePreLogin = env2.elements.get("main").innerHTML;
    assert(env2.body.dataset.auth === "1", "expected auth gate body flag before login");
    assert(readFileText("frontend/index.html").includes("family=Google+Sans:") && readFileText("ux-ui/styles/base.css").includes('"Google Sans", "Onest"'), "expected Google Sans Cyrillic font + Onest geometric fallback loaded for Вектор wordmark");
    assert(homePreLogin.includes("Вектор") && homePreLogin.includes("brand-wordmark") && homePreLogin.includes("brand-mark"), "expected new brand name and SVG logo on auth screen");
    assert(
      readFileText("ux-ui/styles/base.css").includes("@keyframes vektorLogoIdleSpin") &&
      readFileText("ux-ui/styles/base.css").includes("vektorLogoIdleSpin 11.85s"),
      "expected rare single idle spin animation on .brand-mark svg"
    );
    assert(!homePreLogin.includes("Тесты бесплатно") && !homePreLogin.includes("Начать тесты ЕГЭ бесплатно") && !homePreLogin.includes("Открыть тренажёр ЕГЭ без оплаты"), "should not show free tests CTAs on landing");
    assert(!homePreLogin.includes('data-f="auth"') && !homePreLogin.includes("Продолжить без аккаунта"), "should not embed inline login card or guest link on landing");
    assert(homePreLogin.includes('data-a="auth-modal-open"') && homePreLogin.includes("Войти"), "expected single Войти modal trigger on landing");
    assert(
      homePreLogin.includes('href="/student?auth=register" data-a="auth-register-open" data-role="student"') &&
      homePreLogin.includes("Для ученика") &&
      homePreLogin.includes('href="/tutor?auth=register" data-a="auth-register-open" data-role="tutor"') &&
      homePreLogin.includes("Для преподавателя"),
      "expected Для ученика and Для преподавателя header links to point to role registration"
    );
    assert(!homePreLogin.includes("Путь в медицину") && !homePreLogin.includes("СВФУ"), "should not show old medical branding");
    assert(!homePreLogin.includes("Давай настроим подготовку"), "should not show onboarding before login on backend");

    // Кнопка «Войти» открывает модалку авторизации без логина/пароля (Google, Telegram + телефон)
    const mktAuthCss = readFileText("frontend/styles/marketplace.css");
    assert(
      mktAuthCss.includes(".modal-card.sheet-modal.is-auth-sheet") &&
      !mktAuthCss.includes(".auth-modal-shell {\n  width: min(480px, 100%)") &&
      mktAuthCss.includes("box-shadow: none"),
      "expected centered .is-auth-sheet without 480px inner-shadow skew in marketplace.css"
    );
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-modal-open" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const modalPre = env2.elements.get("modal-root").innerHTML;
    assert(
      modalPre.includes("Продолжить через Google") &&
      modalPre.includes("Продолжить через Telegram") &&
      modalPre.includes("Вход в аккаунт") &&
      modalPre.includes('id="auth-phone"') &&
      modalPre.includes('data-a="auth-channel"') &&
      !modalPre.includes('name="username"') &&
      !modalPre.includes('name="password"') &&
      !modalPre.includes('name="password2"'),
      "expected Google + Telegram OAuth buttons and passwordless phone form in login modal"
    );

    // Переключаемся на регистрацию (только телефон + Google/Telegram, без логина/пароля)
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-tab", tab: "register" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const regHtml = env2.elements.get("modal-root").innerHTML;
    assert(
      regHtml.includes("Продолжить через Google") &&
      regHtml.includes("Продолжить через Telegram") &&
      regHtml.includes('id="auth-phone"') &&
      regHtml.includes("WhatsApp") &&
      regHtml.includes("Telegram") &&
      !regHtml.includes('name="username"') &&
      !regHtml.includes('name="password"') &&
      !regHtml.includes('name="password2"'),
      "expected passwordless phone registration with Google and Telegram options"
    );
    assert(regHtml.includes("Код приглашения"), "expected invite code field on register tab");
    assert(regHtml.includes("Перенести текущий прогресс"), "expected local migration checkbox");

    // Выбираем Telegram и проверяем маску телефона +7 (914) 210-05-11
    env2.emitDoc("click", {
      target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "auth-channel", v: "tg" }, disabled: false } : null },
      preventDefault() {}
    });
    await flushMicrotasks(4);
    assert(env2.elements.get("modal-root").innerHTML.includes("Получить код в Telegram"), "expected Telegram CTA label after selecting Telegram");
    const authPhoneInp = { id: "auth-phone", value: "9142100511", dataset: { phoneScope: "auth-phone", d: "auth.phone" } };
    env2.emitDoc("input", { target: authPhoneInp });
    assert(authPhoneInp.value === "+7 (914) 210-05-11", `expected RU auth phone mask, got ${authPhoneInp.value}`);

    // Ошибочный код инвайта не падает и показывает ошибку
    env2.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: {
            phone: { value: authPhoneInp.value },
            invite: { value: "BAD" },
            migrate: { checked: true }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(15);
    assert(env2.elements.get("modal-root").innerHTML.includes("Неверный код приглашения"), "expected invite error rendered");

    // Верная регистрация -> отправка кода в Telegram -> ввод неверного кода -> ввод 4829 -> миграция + профиль Оли
    env2.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: {
            phone: { value: authPhoneInp.value },
            invite: { value: "MED" },
            migrate: { checked: true }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(15);

    const regOtpHtml = env2.elements.get("modal-root").innerHTML;
    assert(
      regOtpHtml.includes("is-contact-verify-sheet") &&
      regOtpHtml.includes("otp-4-grid") &&
      regOtpHtml.includes("Код в Telegram") &&
      regOtpHtml.includes("Telegram · Вектор") &&
      regOtpHtml.includes('data-a="cv-switch-channel"') &&
      regOtpHtml.includes('id="cv-d0"') &&
      regOtpHtml.includes('id="cv-d3"') &&
      regOtpHtml.includes("+7 (914) 210-05-11") &&
      regOtpHtml.includes("4829"),
      "expected 4-digit Telegram OTP screen with switch-to-WhatsApp option after phone submission"
    );

    // Повторная отправка кода: 1-й раз 20 с -> 2-й раз 1:00 -> 3-й раз снова 1:00 (таймер на кнопке #cv-check-btn)
    const origDateNow = Date.now;
    let fakeNowOffset = 0;
    let activeExpectedCode = "4829";
    try {
      Date.now = () => origDateNow() + fakeNowOffset;
      env2.emitDoc("click", {
        target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "cv-resend" }, disabled: false } : null },
        preventDefault() {}
      });
      await flushMicrotasks(10);
      const r1Html = env2.elements.get("modal-root").innerHTML;
      assert(
        r1Html.includes('id="cv-btn-timer"') &&
        (r1Html.includes(">0:20<") || r1Html.includes(">0:19<")) &&
        r1Html.includes('id="cv-resend-wait"') &&
        r1Html.includes("disabled>Повтор через") &&
        r1Html.includes("7391"),
        "expected 1st cv-resend click to show 0:20 countdown timer inside #cv-check-btn and lock resend link"
      );

      // Повторный клик во время кулдауна игнорируется
      env2.emitDoc("click", {
        target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "cv-resend" }, disabled: false } : null },
        preventDefault() {}
      });
      await flushMicrotasks(6);
      assert(
        env2.elements.get("modal-root").innerHTML.includes("7391") &&
        (env2.elements.get("modal-root").innerHTML.includes(">0:20<") || env2.elements.get("modal-root").innerHTML.includes(">0:19<")),
        "expected cv-resend click during active 20s cooldown to be ignored"
      );

      // Проматываем >20 с -> 2-й клик ставит 1:00 (1 минуту)
      fakeNowOffset += 21000;
      env2.emitDoc("click", {
        target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "cv-resend" }, disabled: false } : null },
        preventDefault() {}
      });
      await flushMicrotasks(10);
      const r2Html = env2.elements.get("modal-root").innerHTML;
      assert(
        r2Html.includes('id="cv-btn-timer"') &&
        (r2Html.includes(">1:00<") || r2Html.includes(">0:59<")),
        "expected 2nd cv-resend click to set 1:00 countdown timer inside #cv-check-btn"
      );

      // Проматываем >60 с -> 3-й клик снова ставит 1:00 (1 минуту)
      fakeNowOffset += 61000;
      env2.emitDoc("click", {
        target: { closest: (sel) => sel === "[data-a]" ? { dataset: { a: "cv-resend" }, disabled: false } : null },
        preventDefault() {}
      });
      await flushMicrotasks(10);
      const r3Html = env2.elements.get("modal-root").innerHTML;
      assert(
        r3Html.includes('id="cv-btn-timer"') &&
        (r3Html.includes(">1:00<") || r3Html.includes(">0:59<")),
        "expected 3rd cv-resend click to keep 1:00 countdown timer inside #cv-check-btn"
      );
      activeExpectedCode = r3Html.includes("4829") ? "4829" : "7391";
    } finally {
      Date.now = origDateNow;
    }

    env2.emitDoc("submit", {
      target: { closest: () => ({ dataset: { f: "contact-verify-check" }, elements: { d0: { value: "0" }, d1: { value: "0" }, d2: { value: "0" }, d3: { value: "0" } } }) },
      preventDefault() {}
    });
    await flushMicrotasks(12);
    assert(env2.elements.get("modal-root").innerHTML.includes("Неверный код подтверждения"), "expected wrong 4-digit messenger code to be rejected");
    env2.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "contact-verify-check" },
          elements: {
            d0: { value: activeExpectedCode[0] },
            d1: { value: activeExpectedCode[1] },
            d2: { value: activeExpectedCode[2] },
            d3: { value: activeExpectedCode[3] }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(30);
    assert(authedUser && authedUser.username === "u_0511", "expected authenticated user via phone OTP");
    assert(!env2.body.dataset.auth, "expected auth gate flag cleared after phone verification");
    assert(serverDocs.profile && serverDocs.profile.name === "Оля", "expected migrated profile on server");
    assert(!env2.lsMap["vektor-ege:v1"], "expected localStorage cleared after migration");
    const homeAuthed = env2.elements.get("main").innerHTML;
    assert(homeAuthed.includes("comm-head-seg") && !homeAuthed.includes("Общение ·") && !homeAuthed.includes("Чаты с преподавателями, отклики"), "expected student home without header after login");
    assert(!homeAuthed.includes("Лечебное дело") && !homeAuthed.includes("СВФУ"), "expected universal 3-subject copy without medical uni");
    assert(env2.elements.get("side-foot").innerHTML.includes("Оля"), "expected sidebar user name");
    assert(!env2.elements.get("modal-root").innerHTML.trim(), "expected valid 4-digit code to complete verification and close sheet");

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
    assert(env3.elements.get("side-foot").innerHTML.includes("Анна") && env3.elements.get("main").innerHTML.includes("comm-head-seg"), "expected claude mode working");

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
        if (url === "/api/me") return mkRes(200, { user: planUser, ai: { enabled: false }, inviteRequired: false, providers: { local: true, phone: true, google: false, telegram: false } });
        if (url === "/api/auth/phone/send") {
          const b = JSON.parse(init.body);
          return mkRes(200, { ok: true, phone: b.phone, channel: b.channel || "wa", demoCode: b.resend ? "7391" : "4829" });
        }
        if (url === "/api/auth/phone/verify") {
          const b = JSON.parse(init.body);
          planUser = { id: 9, username: "u_0001", displayName: b.phone || "+7 (914) 210-00-01", authProvider: b.authProvider || "phone", role: b.role || "student" };
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
        if (url === "/api/tutor-applications" && (init.method || "GET") === "POST") {
          const b = JSON.parse(init.body || "{}");
          return mkRes(200, { ok: true, application: Object.assign({ id: "tapp-env5-1", status: "new" }, b) });
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
            phone: { value: "+7 (914) 210-00-01" },
            invite: { value: "" },
            migrate: { checked: false }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(15);
    assert(env4.elements.get("modal-root").innerHTML.includes("is-contact-verify-sheet"), "expected mandatory OTP step after phone submit");
    clickAction(env4, { a: "cv-autofill" });
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "contact-verify-check" } }) }, preventDefault() {} });
    await flushMicrotasks(25);
    const homeFreshHtml = env4.elements.get("main").innerHTML;
    assert(!homeFreshHtml.includes("Давай настроим подготовку"), "expected onboarding form NOT to block Главная");
    assert(homeFreshHtml.includes("comm-head-seg") && homeFreshHtml.includes('id="comm-chat-workspace"'), "expected fresh backend student to land on Общение (Чаты)");
    assert(env4.elements.get("side-nav").innerHTML.includes(">+1<") && env4.elements.get("tabbar").innerHTML.includes(">+1<"), "expected +1 badge on Профиль when prep setup is pending");

    clickAction(env4, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    const profSetupCollapsed = env4.elements.get("main").innerHTML;
    assert(profSetupCollapsed.includes('id="profile-setup-notif"') && profSetupCollapsed.includes("+1") && profSetupCollapsed.includes("Давай настроим подготовку") && !profSetupCollapsed.includes('data-f="onboard"'), "expected collapsed +1 prep setup notification inside Профиль");
    clickAction(env4, { a: "prep-setup-toggle" });
    await flushMicrotasks(2);
    const obHtml = env4.elements.get("main").innerHTML;
    const obBlock = obHtml.slice(obHtml.indexOf('id="profile-setup-notif"'), obHtml.indexOf('data-f="profile"'));
    assert(obBlock.includes('data-f="onboard"') && obBlock.includes("Давай настроим подготовку"), "expected expanding +1 notification to show onboarding form in Профиль");
    assert(obBlock.includes("ob-subj-toggle") && obBlock.includes("Выбери предметы для подготовки"), "expected onboarding form to include subject picker chips");
    assert(!obBlock.includes("Как к тебе обращаться") && !obBlock.includes('id="ob-name"'), "should not ask display name again during onboarding");

    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "onboard" } }) }, preventDefault() {} });
    await flushMicrotasks(12);
    assert(!env4.elements.get("side-nav").innerHTML.includes(">+1<") && !env4.elements.get("tabbar").innerHTML.includes(">+1<"), "expected +1 badge to clear once prep setup is submitted");
    clickAction(env4, { a: "go", v: "home" });
    await flushMicrotasks(4);
    assert(env4.elements.get("side-foot").innerHTML.includes("+7 (914) 210-00-01") && env4.elements.get("main").innerHTML.includes("comm-head-seg"), "expected phone display name in sidebar after onboarding");

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

    const env4Toast = env4.elements.get("toast");
    env4Toast.hidden = true;
    env4Toast.textContent = "";
    env4Toast.innerHTML = "";
    const prevTopNotifHidden = env4.elements.get("top-notifs-cnt").hidden;
    const prevTopNotifText = env4.elements.get("top-notifs-cnt").textContent;
    const prevSideNotifHidden = env4.elements.get("side-notifs-cnt").hidden;
    const prevSideNotifText = env4.elements.get("side-notifs-cnt").textContent;
    clickAction(env4, { a: "theme-toggle" });
    await flushMicrotasks(6);
    assert(globalThis.document.documentElement.dataset.theme === "light", "expected first theme toggle from dark default to activate light theme");
    assert(env4.lsMap["vektor-ege:theme"] === "light", "expected persisted light theme preference");
    assert(
      env4Toast.hidden === true &&
      !env4Toast.textContent &&
      !env4Toast.innerHTML &&
      env4.elements.get("top-notifs-cnt").hidden === prevTopNotifHidden &&
      env4.elements.get("top-notifs-cnt").textContent === prevTopNotifText &&
      env4.elements.get("side-notifs-cnt").hidden === prevSideNotifHidden &&
      env4.elements.get("side-notifs-cnt").textContent === prevSideNotifText,
      "expected toggling to light theme to emit zero toasts or bell notifications"
    );
    clickAction(env4, { a: "theme-toggle" });
    await flushMicrotasks(6);
    assert(globalThis.document.documentElement.dataset.theme === "dark", "expected second toggle to activate dark theme");
    assert(
      env4Toast.hidden === true &&
      !env4Toast.textContent &&
      !env4Toast.innerHTML &&
      env4.elements.get("top-notifs-cnt").hidden === prevTopNotifHidden &&
      env4.elements.get("top-notifs-cnt").textContent === prevTopNotifText &&
      env4.elements.get("side-notifs-cnt").hidden === prevSideNotifHidden &&
      env4.elements.get("side-notifs-cnt").textContent === prevSideNotifText,
      "expected toggling back to dark theme to emit zero toasts or bell notifications"
    );
    assert(
      !/<button[^>]*data-a="theme-toggle"[^>]*\btitle=/.test(readFileText("frontend/index.html")) &&
      !readFileText("frontend/app.js").includes('topTheme.setAttribute("title"'),
      "expected theme toggle buttons not to show browser title tooltip popups"
    );
    clickAction(env4, { a: "theme-set", theme: "auto" });
    await flushMicrotasks(6);
    assert(!globalThis.document.documentElement.dataset.theme, "expected auto theme to clear data-theme");

    // Нижняя шестерёнка + «Выйти» в сайдбаре, баланс снизу слева (десктоп) и сверху справа (мобилка), 5 вкладок (Главная, Справочник, Поиск, Учёба, Профиль)
    const sideNavHtml = env4.elements.get("side-nav").innerHTML;
    const sideFootHtml = env4.elements.get("side-foot").innerHTML;
    const topBalHtml = env4.elements.get("top-balance-slot").innerHTML;
    const tabHtml = env4.elements.get("tabbar").innerHTML;
    assert(sideNavHtml.includes('data-v="profile"'), "expected Профиль in 5-tab student navigation");
    assert(sideFootHtml.includes('data-v="profile"') && sideFootHtml.includes('data-a="auth-logout"') && sideFootHtml.includes("Выйти"), "expected Settings gear and Logout button in sidebar footer");
    assert(!sideFootHtml.includes("Админ-панель") && !sideFootHtml.includes("Система и API"), "expected Admin panel and System/API links hidden from student sidebar footer");
    assert(sideFootHtml.includes("Преподаватель") && !sideFootHtml.includes(">Препод<") && !sideFootHtml.includes("hh-seg equal side-role-seg"), "expected full label Преподаватель without Препод abbreviation or equal grid clipping");
    assert(sideFootHtml.includes('id="side-balance-slot"') && sideFootHtml.includes("top-bal-pill") && sideFootHtml.includes("Пополнить"), "expected persistent student bottom-left balance slot inside #side-foot");
    assert(topBalHtml.includes("top-bal-pill") && topBalHtml.includes("Пополнить") && !env4.elements.get("top-balance-slot").hidden, "expected persistent student top-right balance slot in mobile .topbar");
    assert(!env4.elements.get("main").innerHTML.includes("desktop-top-bar"), "expected duplicate desktop-top-bar removed");
    for (const label of ["Учёба", "Общение", "Поиск", "Календарь", "Профиль"]) {
      assert(sideNavHtml.includes(label), `expected ${label} in sidebar`);
    }
    for (const label of ["Учёба", "Курсы", "Справочник", "Вернуться"]) {
      assert(tabHtml.includes(label), `expected contextual Study tab ${label} in bottom tabbar`);
    }
    assert(tabHtml.includes('data-a="learn-back"'), "expected learn-back action inside Study tabbar");
    clickAction(env4, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    const profTabHtml = env4.elements.get("tabbar").innerHTML;
    for (const label of ["Учёба", "Общение", "Поиск", "Календарь", "Профиль"]) {
      assert(profTabHtml.includes(label), `expected ${label} restored in bottom tabbar outside Study`);
    }
    const stuProfileHtml = env4.elements.get("main").innerHTML;
    assert(!stuProfileHtml.includes("Как администратор") && !stuProfileHtml.includes("Система и API"), "expected student settings to hide administrator role button");

    // Раздел «Учёба»: до записи показывается только форма «Ищу преподавателя» и пустое состояние без чужих преподавателей
    clickAction(env4, { a: "go", v: "study" });
    await flushMicrotasks(6);
    const studyEmptyHtml = env4.elements.get("main").innerHTML;
    assert(
      studyEmptyHtml.includes("Вы пока не записаны ни к одному преподавателю") &&
      studyEmptyHtml.includes('data-a="phone-country-toggle" data-scope="lead-wa"') &&
      studyEmptyHtml.includes('id="lead-wa"') &&
      studyEmptyHtml.includes('value="+7 "') &&
      !studyEmptyHtml.includes("https://wa.me/"),
      "expected study view to list ONLY enrolled tutors, include region picker + auto '+7 ' on lead-wa, and omit unbooked tutors"
    );
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
      balModalHtml.includes("ygo-pay-rail") &&
      balModalHtml.includes("<b>СБП</b>") &&
      !balModalHtml.includes("СБП · Банк") &&
      balModalHtml.includes('viewBox="0 0 266 325"') &&
      balModalHtml.includes("#4286C5") &&
      balModalHtml.includes("#C72C54") &&
      balModalHtml.includes('data-a="bal-method" data-v="sbp"') &&
      balModalHtml.includes('data-a="bal-card-open"') &&
      balModalHtml.includes("+3%") &&
      balModalHtml.indexOf("ygo-pay-rail") < balModalHtml.indexOf('id="bal-custom-amount"') &&
      balModalHtml.includes("bal-flat-sec") &&
      !balModalHtml.includes("bal-plan-grid") &&
      !balModalHtml.includes("wallet-bar") &&
      !balModalHtml.includes("hh-notice-card") &&
      !balModalHtml.includes("notice warn"),
      "expected Yandex Go horizontal L->R payment rail above amount input without tariffs or rounded wrapper boxes"
    );
    const detectMetaFn = globalThis.EGE && globalThis.EGE.ui && globalThis.EGE.ui.detectCardMeta;
    assert(typeof detectMetaFn === "function", "expected EGE.ui.detectCardMeta helper to be exported");
    assert(
      detectMetaFn("2202 2012 3456 9012").brand === "МИР" && detectMetaFn("2202 2012 3456 9012").bankName === "СберБанк" &&
      detectMetaFn("2200 2412 3456 9012").brand === "МИР" && detectMetaFn("2200 2412 3456 9012").bankName === "ВТБ" &&
      detectMetaFn("2202 2412 3456 9012").brand === "МИР" && detectMetaFn("2202 2412 3456 9012").bankName === "ВТБ" &&
      detectMetaFn("2200 7012 3456 9012").brand === "МИР" && detectMetaFn("2200 7012 3456 9012").bankName === "Т-Банк" &&
      detectMetaFn("2200 1512 3456 9012").brand === "МИР" && detectMetaFn("2200 1512 3456 9012").bankName === "Альфа-Банк" &&
      detectMetaFn("2204 2412 3456 9012").brand === "МИР" && detectMetaFn("2204 2412 3456 9012").bankName === "Ozon Банк" &&
      detectMetaFn("2204 3112 3456 9012").brand === "МИР" && detectMetaFn("2204 3112 3456 9012").bankName === "Яндекс Банк" &&
      detectMetaFn("2203 4112 3456 9012").brand === "МИР" && detectMetaFn("2203 4112 3456 9012").bankName === "Райффайзенбанк" &&
      detectMetaFn("4276 0000 0000 1234").brand === "VISA" && detectMetaFn("4276 0000 0000 1234").bankName === "СберБанк" &&
      detectMetaFn("5536 9100 0000 1234").brand === "Mastercard" && detectMetaFn("5536 9100 0000 1234").bankName === "Т-Банк" &&
      detectMetaFn("4154 0000 0000 1234").brand === "VISA" && detectMetaFn("4154 0000 0000 1234").bankName === "Альфа-Банк" &&
      detectMetaFn("2221 0000 0000 1234").brand === "Mastercard" &&
      detectMetaFn("6200 0000 0000 1234").brand === "UnionPay",
      "expected accurate Russian BIN payment network and issuing bank detection"
    );
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-custom" }, elements: { amount: { value: "300" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("Первое пополнение на занятия — минимум 490 ₽"), "expected first top-up below 490 ₽ to be rejected");
    clickAction(env4, { a: "bal-card-open" });
    await flushMicrotasks(2);
    const balCardHtml = env4.elements.get("modal-root").innerHTML;
    assert(
      balCardHtml.includes("is-card-bind-sheet") &&
      balCardHtml.includes("ygo-bank-card") &&
      balCardHtml.includes("ygo-mir-svg") &&
      balCardHtml.includes("МИР") &&
      balCardHtml.includes('id="bal-card-num"') &&
      balCardHtml.includes('id="bal-card-exp"') &&
      balCardHtml.includes('id="bal-card-cvc"') &&
      balCardHtml.includes("Привязать карту"),
      "expected Yandex Go dark virtual card binding sheet with official MIR logo SVG when clicking Add Card"
    );
    env4.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-card-bind" }, elements: { cardNum: { value: "2202" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("Укажите 16 цифр карты"), "expected incomplete card fields to be rejected in Yandex Go bind sheet");
    env4.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "bal-card-bind" },
          elements: {
            cardNum: { value: "2202 2012 3456 9012" },
            cardExp: { value: "12/28" },
            cardCvc: { value: "789" }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(3);
    const afterBindHtml = env4.elements.get("modal-root").innerHTML;
    assert(
      afterBindHtml.includes("is-balance-sheet") &&
      afterBindHtml.includes("ygo-mir-svg") &&
      afterBindHtml.includes("МИР") &&
      afterBindHtml.includes("СберБанк") &&
      afterBindHtml.includes("•• 9012") &&
      afterBindHtml.includes("Комиссия карты 3%"),
      "expected bound MIR Sberbank card •• 9012 with MIR SVG logo to appear selected in horizontal rail with +3% fee calculation"
    );
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
    assert(env4.elements.get("main").innerHTML.includes('id="home-bids-section"'), "expected book-submit to navigate student straight to Главная (#home-bids-section)");
    clickAction(env4, { a: "go", v: "market" });
    await flushMicrotasks(2);
    const env4MarketHtml = env4.elements.get("main").innerHTML;
    assert(
      !env4MarketHtml.includes('id="student-bookings-table"') &&
      !env4MarketHtml.includes("Мои заявки") &&
      !env4MarketHtml.includes("Отправленные отклики и ставки"),
      "expected duplicate #student-bookings-table (Мои заявки) to be removed from /market"
    );
    const landingMarketHtml = globalThis.EGE.views.marketplace.marketSectionHTML({ landing: true });
    assert(
      !landingMarketHtml.includes('id="student-bookings-table"') &&
      !landingMarketHtml.includes("Отправленные отклики и ставки") &&
      !landingMarketHtml.includes("mkt-foot-bal"),
      "expected landing marketSectionHTML not to leak student bookings table or balance bar"
    );
    clickAction(env4, { a: "bal-open" });
    await flushMicrotasks(2);
    assert(env4.elements.get("modal-root").innerHTML.includes("от 100 ₽"), "expected subsequent top-ups from 100 ₽ once initial 490 ₽ is paid");
    clickAction(env4, { a: "bal-method", v: "card" });
    await flushMicrotasks(2);
    env4.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "bal-custom" },
          elements: { amount: { value: "100" } }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(3);
    assert(
      hasNum(env4.elements.get("side-foot").innerHTML, "5 400") &&
      hasNum(env4.elements.get("top-balance-slot").innerHTML, "5 400") &&
      env4.elements.get("toast").innerHTML.includes("+3%"),
      "expected subsequent 100 ₽ bound-card top-up (+3% fee) to credit 100 ₽ cleanly to reach 5400 ₽"
    );

    clickAction(env4, { a: "go", v: "study" });
    await flushMicrotasks(4);
    const studyBookedHtml = env4.elements.get("main").innerHTML;
    assert(
      studyBookedHtml.includes('id="study-week-strip"') &&
      !studyBookedHtml.includes('id="student-bookings-table"') &&
      !studyBookedHtml.includes("Мои заявки") &&
      !studyBookedHtml.includes("Календарь ваших уроков") &&
      !studyBookedHtml.includes('id="study-schedule-table"') &&
      !studyBookedHtml.includes("Запланированные уроки") &&
      studyBookedHtml.includes('id="study-billing-notice"') &&
      studyBookedHtml.includes("Баланса хватает на все уроки") &&
      studyBookedHtml.includes("https://wa.me/") &&
      studyBookedHtml.includes("Соколова"),
      "expected study view without #study-schedule-table, showing top billing notice and WhatsApp link for Соколова"
    );
    clickAction(env4, { a: "study-billing-toggle" });
    await flushMicrotasks(2);
    const studyDetailsHtml = env4.elements.get("main").innerHTML;
    assert(
      studyDetailsHtml.includes('id="study-billing-details"') &&
      studyDetailsHtml.includes("Почему такая сумма:") &&
      studyDetailsHtml.includes("Соколова"),
      "expected Подробнее button in study billing notice to expand lesson-by-lesson explanation"
    );
    clickAction(env4, { a: "study-billing-toggle" });
    await flushMicrotasks(2);
    assert(
      !env4.elements.get("main").innerHTML.includes('id="study-billing-details"'),
      "expected second click on study-billing-toggle to collapse explanation"
    );
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

    // Справочник без нейросети: строка поиска сверху + обзор тем и сочинения ниже
    clickAction(env4, { a: "go", v: "tutor" });
    await flushMicrotasks(6);
    const guideHome = env4.elements.get("main").innerHTML;
    const guideTabHtml = env4.elements.get("tabbar").innerHTML;
    assert(
      guideTabHtml.includes("Справочник") &&
      guideTabHtml.includes("Вернуться") &&
      guideHome.includes('id="guide-q"') &&
      guideHome.includes("Все темы ·") &&
      guideHome.includes("Сочинение ЕГЭ · памятка") &&
      !guideHome.includes("learn-head-seg") &&
      !guideHome.includes('data-a="guide-sid"') &&
      !guideHome.includes('data-a="guide-chip"') &&
      !guideHome.includes("недоступен"),
      "expected offline guide view with search box + overview topics without top switcher, subject filter chips, or quick-query pills"
    );
    env4.emitDoc("input", { target: { id: "guide-q", value: "митоз", dataset: {} } });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("guide-card") && env4.elements.get("main").innerHTML.includes("Митоз"), "expected guide search results for митоз");
    env4.emitDoc("input", { target: { id: "guide-q", value: "клише", dataset: {} } });
    await flushMicrotasks(6);
    assert(env4.elements.get("main").innerHTML.includes("Сочинение: клише и аргументы"), "expected essay reference card on клише search");
    clickAction(env4, { a: "guide-clear" });
    await flushMicrotasks(4);
    assert(!env4.elements.get("main").innerHTML.includes("guide-card") && env4.elements.get("main").innerHTML.includes("Все темы ·"), "expected guide-clear to restore overview state");

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
    assert(pausedInGuide.includes('id="guide-q"') && pausedInGuide.includes("quiz-resume") && pausedInGuide.includes("Вернуться к тесту") && env4.elements.get("tabbar").innerHTML.includes("Справочник"), "expected paused quiz banner in guide view");
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

    clickAction(env4, { a: "go", v: "profile" });
    await flushMicrotasks(3);
    assert(
      env4.elements.get("main").innerHTML.includes('id="stu-linked-accounts"') &&
      env4.elements.get("main").innerHTML.includes("Привязать Google") &&
      env4.elements.get("main").innerHTML.includes("Привязать Telegram"),
      "expected local student profile to offer both Привязать Google and Привязать Telegram"
    );
    clickAction(env4, { a: "pf-link-google" });
    await flushMicrotasks(2);
    assert(env4.elements.get("main").innerHTML.includes('id="pf-link-google-inp"'), "expected pf-link-google to open Google email input");
    env4.emitDoc("input", { target: { id: "pf-link-google-inp", value: "student@gmail.com", dataset: { d: "pf.linkGoogle" } } });
    clickAction(env4, { a: "pf-link-google-save" });
    await flushMicrotasks(2);
    assert(
      env4.elements.get("main").innerHTML.includes("student@gmail.com") &&
      env4.elements.get("main").innerHTML.includes("Привязан ✓"),
      "expected Google link to persist inside student profile"
    );

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
    const env5Docs = {};
    const env5ChatMsgs = {};
    let env5User = null;
    const env5 = installGlobals({
      host: { backend: true },
      localStorage: {},
      fetch: async (url, init) => {
        init = init || {};
        const mkRes = (status, jsonObj) => ({ ok: status >= 200 && status < 300, status, headers: { get: () => "application/json" }, json: async () => jsonObj });
        if (url === "/api/me") return mkRes(200, { user: env5User, ai: { enabled: false }, inviteRequired: false, providers: { local: true, phone: true, google: false, telegram: false } });
        if (url === "/api/auth/phone/send") {
          const b = JSON.parse(init.body);
          return mkRes(200, { ok: true, phone: b.phone, channel: b.channel || "wa", demoCode: b.resend ? "7391" : "4829" });
        }
        if (url === "/api/auth/phone/verify") {
          const b = JSON.parse(init.body);
          env5User = { id: 15, username: "u_4567", displayName: b.phone || "+7 (701) 123-45-67", authProvider: b.authProvider || "google", role: b.role || "student" };
          return mkRes(200, { user: env5User });
        }
        if (url === "/api/docs") return mkRes(200, { docs: env5Docs });
        if (url.startsWith("/api/docs/")) {
          const docName = decodeURIComponent(url.slice("/api/docs/".length));
          const method = init.method || "GET";
          if (method === "PUT") env5Docs[docName] = JSON.parse(init.body);
          else if (method === "PATCH") env5Docs[docName] = deepMerge(env5Docs[docName] || {}, JSON.parse(init.body));
          return mkRes(200, { ok: true });
        }
        if (url === "/api/tutor-applications" && (init.method || "GET") === "POST") {
          const b = JSON.parse(init.body || "{}");
          return mkRes(200, { ok: true, application: Object.assign({ id: "tapp-env5-1", status: "new" }, b) });
        }
        if (url.startsWith("/api/chats")) {
          const method = init.method || "GET";
          if (!url.slice("/api/chats".length) || url.startsWith("/api/chats?")) {
            return mkRes(200, { ok: true, threads: [] });
          }
          const rest = url.slice("/api/chats/".length);
          const tid = decodeURIComponent(rest.split("/")[0].split("?")[0]);
          const list = env5ChatMsgs[tid] || (env5ChatMsgs[tid] = []);
          if (rest.includes("/remind-payment") && method === "POST") {
            const b = JSON.parse(init.body || "{}");
            const remMsg = {
              id: "msg-env5-pay-" + (list.length + 1),
              threadId: tid,
              bookingId: b.bookingId || null,
              tutorId: b.tutorId || "",
              senderRole: "tutor",
              senderName: "Преподаватель",
              body: String(b.body || "💳 Напоминание об оплате"),
              attachments: [],
              createdAt: "2026-11-24T10:00:00Z"
            };
            list.push(remMsg);
            return mkRes(200, {
              ok: true,
              threadId: tid,
              message: remMsg,
              notified: {
                deliveredChannels: ["telegram"],
                queuedInPlatform: true,
                summary: "Напоминание об оплате отправлено ученику (Telegram)"
              }
            });
          }
          if (rest.includes("/read") && method === "POST") {
            return mkRes(200, { ok: true, threadId: tid, updated: 0 });
          }
          if (rest.includes("/messages") && method === "POST") {
            const b = JSON.parse(init.body || "{}");
            const msg = {
              id: "msg-env5-" + (list.length + 1),
              threadId: tid,
              bookingId: b.bookingId || null,
              tutorId: b.tutorId || "",
              senderRole: String(b.role || "tutor"),
              senderName: "Преподаватель",
              body: String(b.body || ""),
              attachments: [],
              readByStudent: false,
              readByTutor: true,
              createdAt: "2026-11-24T10:05:00Z"
            };
            list.push(msg);
            return mkRes(200, { ok: true, threadId: tid, message: msg });
          }
          if (rest.includes("/messages") && method === "GET") {
            return mkRes(200, { ok: true, threadId: tid, messages: list.slice() });
          }
          return mkRes(200, { ok: true });
        }
        return mkRes(404, { detail: "not found" });
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);

    const sp800 = globalThis.EGE.tutors.commissionSplit(800);
    assert(sp800.total === 800 && sp800.payout === 752 && sp800.fee === 40 && sp800.sbpFee === 8 && sp800.pct === 5, "expected 5% commission split (800 -> 760 + 40)");
    assert(globalThis.EGE.tutors.SUBJECTS.length >= 28 && Array.isArray(globalThis.EGE.tutors.PREP_UNIVERSE) && Array.isArray(globalThis.EGE.tutors.LIVE_DEALS), "expected broadened 28+ directions (exam + sport + IT + creative + languages), marquee universe and live deals");
    assert(globalThis.EGE.tutors.CATALOG_TOTAL === 2480 && globalThis.EGE.tutors.LIST.length >= 30, "expected 2480+ catalog positioning and 30+ tutors");
    const egeSubjs = globalThis.EGE.tutors.subjectsForExam("ЕГЭ").map((s) => s.short);
    const allSubjs = globalThis.EGE.tutors.subjectsForExam("all").map((s) => s.short);
    assert(
      egeSubjs.length === 11 && egeSubjs.includes("Обществознание") && egeSubjs.includes("Литература") && egeSubjs.includes("География") &&
      !egeSubjs.includes("Программирование") && !egeSubjs.includes("Дзюдо") && !egeSubjs.includes("Вокал / Гитара") &&
      allSubjs.includes("Программирование") && allSubjs.includes("Дзюдо") && allSubjs.includes("Шахматы") && allSubjs.includes("Вокал / Гитара") &&
      allSubjs.includes("Бокс / Самбо") && allSubjs.includes("Плавание") && allSubjs.includes("Китайский язык") && allSubjs.includes("Логопед") && allSubjs.includes("Фортепиано") && allSubjs.includes("Рисование") && allSubjs.includes("Робототехника"),
      "expected ЕГЭ/ОГЭ to show all 11 school exam subjects and Все to include programming, judo, chess, vocals, boxing, swimming, chinese, speech, piano, art, robotics"
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
      landHtml.includes("Публичная оферта") &&
      landHtml.includes("Возврат и эскроу") &&
      landHtml.includes("Политика конфиденциальности") &&
      landHtml.includes('href="/terms"') &&
      landHtml.includes('href="/refunds"') &&
      landHtml.includes('data-a="cookie-settings"') &&
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
    for (let guard = 0; guard < 10 && env5.elements.get("main").innerHTML.includes('data-a="mkt-load-more"'); guard++) {
      clickAction(env5, { a: "mkt-load-more" });
      await flushMicrotasks(2);
    }
    const page4Html = env5.elements.get("main").innerHTML;
    const allFeedCards = page4Html.match(/<article class="card tutor-card[\s\S]*?<\/article>/g) || [];
    assert(
      allFeedCards.length === globalThis.EGE.tutors.LIST.length &&
      allFeedCards.length >= 36 &&
      !page4Html.includes('id="mkt-feed-end"') &&
      !page4Html.includes("Конец списка") &&
      !page4Html.includes('data-a="mkt-load-more"') &&
      page4Html.includes("Дмитрий Волков") &&
      !page4Html.includes('class="card tutor-card is-pro"') &&
      allFeedCards.every((c) => (c.match(/class="diff-tag/g) || []).length <= 2 && !c.includes(">Онлайн<") && !c.includes("Слоты:")),
      "expected all tutor cards loaded (36+), no Конец списка banner at end of feed, uniform cards without is-pro glow, and <= 2 diff-tag pills without Онлайн/Слоты noise"
    );
    clickAction(env5, { a: "land-scroll", target: "land-market" });
    await flushMicrotasks(2);
    assert(
      env5.body.classList.contains("is-land-white"),
      "expected Подобрать click (land-scroll -> land-market) to activate gradual black-to-white class on body"
    );
    for (const sortKey of ["price_asc", "rating_desc", "actual"]) {
      clickAction(env5, { a: "mkt-sort", v: sortKey });
      await flushMicrotasks(2);
      const sortedLandHtml = env5.elements.get("main").innerHTML;
      assert(
        env5.body.classList.contains("is-land-white") &&
        sortedLandHtml.includes('class="land-page is-white-stage"') &&
        sortedLandHtml.includes('class="land-top is-scrolled-light"'),
        `expected mkt-sort=${sortKey} in white stage not to flash dark theme on landing`
      );
    }
    const loaderHtmlCheck = readFileText("frontend/index.html");
    assert(
      loaderHtmlCheck.includes('id="site-boot-loader"') &&
      loaderHtmlCheck.includes("site-loader-logo") &&
      loaderHtmlCheck.includes("siteLoaderSpin") &&
      loaderHtmlCheck.includes(">Загрузка...<") &&
      loaderHtmlCheck.includes("prefers-color-scheme: dark") &&
      loaderHtmlCheck.includes(':root:not([data-theme="light"]) .site-boot-loader') &&
      loaderHtmlCheck.includes('name="color-scheme" content="light dark"') &&
      !loaderHtmlCheck.includes("Загружаю подготовку"),
      "expected clean spinning Vektor logo loader with 'Загрузка...' and system theme background in index.html"
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
      modalBefore.includes("Отправим заявку преподавателю и напишем вам уведомление в WhatsApp, Telegram или MAX"),
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

    // Воронка «Предложить 1 150 ₽»: без входа -> Google / Telegram + подтверждение телефона в WhatsApp/Telegram (страна Казахстан +7 и 4 цифры) -> пополнение СБП -> заявка
    clickAction(env5, { a: "book-submit" });
    await flushMicrotasks(3);
    const authGateHtml = env5.elements.get("modal-root").innerHTML;
    assert(authGateHtml.includes('data-f="auth"') && authGateHtml.includes('data-a="auth-google-start"') && authGateHtml.includes('data-a="auth-telegram-start"') && authGateHtml.includes("sheet-grabber"), "expected book-submit while logged out to open grabber auth sheet with Google and Telegram buttons");
    clickAction(env5, { a: "auth-google-start" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('data-a="cv-channel"') && env5.elements.get("modal-root").innerHTML.includes("WhatsApp") && env5.elements.get("modal-root").innerHTML.includes("Telegram"), "expected WhatsApp/Telegram channel selector in contact verify modal");
    clickAction(env5, { a: "cv-country-toggle" });
    await flushMicrotasks(2);
    const countryDropHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      countryDropHtml.includes("Россия") &&
      countryDropHtml.includes("Казахстан") &&
      countryDropHtml.includes("Беларусь") &&
      countryDropHtml.includes("Другая страна"),
      "expected RU, KZ, CIS and Other country options in phone country dropdown"
    );
    clickAction(env5, { a: "cv-country-pick", v: "KZ" });
    await flushMicrotasks(2);
    const kzInp = { id: "cv-contact-inp", value: "+7 7011234567", dataset: {} };
    env5.emitDoc("input", { target: kzInp });
    assert(kzInp.value === "+7 (701) 123-45-67", `expected KZ +7 phone mask, got ${kzInp.value}`);
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "contact-verify-send" }, elements: { contact: { value: kzInp.value } } }) }, preventDefault() {} });
    await flushMicrotasks(12);
    assert(env5.elements.get("modal-root").innerHTML.includes("otp-4-grid") && env5.elements.get("modal-root").innerHTML.includes("+7 (701) 123-45-67") && env5.elements.get("modal-root").innerHTML.includes("Код в WhatsApp"), "expected 4-digit WhatsApp OTP sheet after KZ phone submission");
    clickAction(env5, { a: "cv-switch-channel" });
    await flushMicrotasks(12);
    assert(env5.elements.get("modal-root").innerHTML.includes("Код в Telegram") && env5.elements.get("modal-root").innerHTML.includes("7391"), "expected cv-switch-channel to switch OTP delivery to Telegram");
    clickAction(env5, { a: "cv-autofill" });
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "contact-verify-check" } }) }, preventDefault() {} });
    await flushMicrotasks(20);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="bid-submit-btn"') && env5.elements.get("modal-root").innerHTML.includes('value="1150"'), "expected confirmed phone OTP to resume booking sheet with preserved 1150 ₽ offer");
    assert(
      !globalThis.document.body.dataset.fullbleed &&
      env5.elements.get("main").innerHTML.includes('id="land-market"') &&
      env5.elements.get("main").innerHTML.includes('id="mkt-q"') &&
      !env5.elements.get("main").innerHTML.includes("Поиск репетитора") &&
      !env5.elements.get("main").innerHTML.includes("Ищи репетиторов ниже рынка") &&
      env5.elements.get("tabbar").innerHTML.includes("Общение"),
      "expected proposing a price from landing to enter the student cabinet (Поиск with 5-tab bar) instead of staying on fullbleed landing"
    );

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
      bookSideToast.innerHTML.includes("Написали ему в мессенджер (WhatsApp, Telegram, MAX)") &&
      bookSideToast.innerHTML.includes("мы напишем вам уведомление в WhatsApp, Telegram или MAX"),
      "expected side notification promising student notification in WhatsApp, Telegram, or MAX"
    );
    const homePendingHtml = env5.elements.get("main").innerHTML;
    assert(
      homePendingHtml.includes('id="home-bids-section"') &&
      homePendingHtml.includes("is-just-sent") &&
      globalThis.EGE.fx &&
      typeof globalThis.EGE.fx.spawnBidLaunchFx === "function" &&
      typeof globalThis.EGE.fx.playBidSentFx === "function" &&
      hasNum(env5.elements.get("top-balance-slot").innerHTML, "3 440") &&
      homePendingHtml.includes("home-bid-seg") &&
      homePendingHtml.includes("tutor-card") &&
      homePendingHtml.includes("tutor-name-line") &&
      homePendingHtml.includes("tutor-bio-wrap") &&
      homePendingHtml.includes("Ожидаем ответ преподавателя") &&
      homePendingHtml.includes(">Подтвердить<") &&
      homePendingHtml.includes(">Отменить<") &&
      homePendingHtml.includes("https://telemost.yandex.ru/j/") &&
      homePendingHtml.includes("Яндекс Телемост · Подключиться") &&
      homePendingHtml.includes("будет передана преподавателю сама (WhatsApp или Telegram-бот)") &&
      homePendingHtml.includes('data-a="bid-telemost-edit"') &&
      !homePendingHtml.includes("Добавить ссылку на Яндекс Телемост") &&
      !homePendingHtml.includes("Главный срок") &&
      !homePendingHtml.includes("Быстрый переход"),
      "expected book-submit to land straight on Главная with 3 440 ₽ balance, auto-generated unified Telemost link & auto-send note, 1-line filter seg, tutor card"
    );
    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(2);
    const marketAfterBidHtml = env5.elements.get("main").innerHTML;
    assert(
      !marketAfterBidHtml.includes('id="student-bookings-table"') &&
      !marketAfterBidHtml.includes("Мои заявки"),
      "expected /market not to render duplicate Мои заявки section"
    );
    const gridStart = marketAfterBidHtml.indexOf('id="mkt-tutor-grid"');
    const gridEnd = marketAfterBidHtml.indexOf('class="mkt-foot-bal"');
    const gridSlice = gridStart >= 0 ? marketAfterBidHtml.slice(gridStart, gridEnd > gridStart ? gridEnd : undefined) : "";
    assert(!gridSlice.includes("Предложено "), "expected tutors with existing active offers not to appear inside Поиск #mkt-tutor-grid");
    clickAction(env5, { a: "go", v: "home" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "home-bid-filter", v: "accepted" });
    await flushMicrotasks(2);
    const homeEmptyAcceptedHtml = env5.elements.get("main").innerHTML;
    assert(
      homeEmptyAcceptedHtml.includes("home-bid-empty") &&
      !homeEmptyAcceptedHtml.includes('<div class="card pad-lg"><div class="empty"'),
      "expected empty state on Главная -> Ответили without double-box card+empty wrapper"
    );
    clickAction(env5, { a: "home-bid-filter", v: "all" });
    await flushMicrotasks(2);

    const acceptIdMatch = /data-a="mkt-sim-accept" data-id="([^"]+)"/.exec(homePendingHtml);
    assert(acceptIdMatch, "expected Подтвердить button for pending booking on Главная");
    clickAction(env5, { a: "bid-telemost-edit", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-f="bid-telemost"'), "expected inline Yandex Telemost form to open");
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bid-telemost", id: acceptIdMatch[1] }, elements: { url: { value: "" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Укажите ссылку Яндекс Телемост"), "expected empty Telemost submit to show validation error without clearing unified room");
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bid-telemost", id: acceptIdMatch[1] }, elements: { url: { value: "https://telemost.yandex.ru/j/12345678901234" } } }) }, preventDefault() {} });
    await flushMicrotasks(3);
    assert(
      env5.elements.get("main").innerHTML.includes("Яндекс Телемост · Подключиться") &&
      env5.elements.get("main").innerHTML.includes("bid-telemost-edit") &&
      env5.elements.get("main").innerHTML.includes("Изменить ссылку") &&
      env5.elements.get("main").innerHTML.includes("https://telemost.yandex.ru/j/12345678901234"),
      "expected saved Yandex Telemost link and full-width Изменить ссылку button on Главная bid card"
    );
    clickAction(env5, { a: "bid-telemost-gen", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    const regeneratedHtml = env5.elements.get("main").innerHTML;
    const tmHrefMatch = /href="(https:\/\/telemost\.yandex\.ru\/j\/[^"]+)"/.exec(regeneratedHtml);
    assert(tmHrefMatch && tmHrefMatch[1] !== "https://telemost.yandex.ru/j/12345678901234", "expected 1-click Yandex Telemost link generator to update unified room URL");

    clickAction(env5, { a: "home-bid-filter", v: "pending" });
    await flushMicrotasks(2);
    const notifsBeforeAccept = Number(env5.elements.get("top-notifs-cnt").textContent) || 0;
    clickAction(env5, { a: "mkt-sim-accept", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    const homeAcceptedHtml = env5.elements.get("main").innerHTML;
    const notifsAfterAccept = Number(env5.elements.get("top-notifs-cnt").textContent) || 0;
    assert(
      notifsAfterAccept === notifsBeforeAccept &&
      !env5.elements.get("toast").innerHTML.includes("Преподаватель подтвердил занятие") &&
      homeAcceptedHtml.includes('data-a="home-bid-filter" data-v="all" aria-pressed="true"') &&
      homeAcceptedHtml.includes("is-just-accepted") &&
      homeAcceptedHtml.includes("home-bid-status-ico") &&
      homeAcceptedHtml.includes("is-just-revealed") &&
      homeAcceptedHtml.includes("Преподаватель ответил") &&
      homeAcceptedHtml.includes("Написали вам в СМС") &&
      homeAcceptedHtml.includes(`data-sched-box="${acceptIdMatch[1]}"`) &&
      homeAcceptedHtml.includes('data-hour="23:00"') &&
      homeAcceptedHtml.includes("Выберите дни и время") &&
      homeAcceptedHtml.includes("btn-msg is-wa") &&
      homeAcceptedHtml.includes("btn-msg is-tg is-disabled") &&
      homeAcceptedHtml.includes("btn-msg is-max is-disabled"),
      "expected Главная accepted card to give quiet inline feedback without pushing bell notification, keep card visible, open 1-7 day 10:00-23:00 schedule picker and show active WhatsApp + greyed Telegram/MAX"
    );

    const parsedCheck = globalThis.EGE.tutors.LIST.filter((t) => !t.fromCabinet);
    assert(
      parsedCheck.length > 0 &&
      parsedCheck.every((t) => t.availableChannels && t.availableChannels.wa && !t.availableChannels.tg && !t.availableChannels.max),
      "expected parsed catalog tutors to expose availableChannels={wa:true,tg:false,max:false}"
    );

    for (const dow of ["1", "2", "3", "4", "5", "6", "0"]) {
      const curHtml = env5.elements.get("main").innerHTML;
      const isAlreadyOn = new RegExp(`data-a="bid-sched-day" data-id="${acceptIdMatch[1]}" data-dow="${dow}" aria-pressed="true"`).test(curHtml);
      if (!isAlreadyOn) {
        clickAction(env5, { a: "bid-sched-day", id: acceptIdMatch[1], dow });
        await flushMicrotasks(2);
      }
    }
    assert(
      env5.elements.get("main").innerHTML.includes("Все 7 дней") &&
      env5.elements.get("main").innerHTML.includes("каждый день"),
      "expected selecting all 7 days to show 'Все 7 дней' and Bot phrase 'каждый день'"
    );
    for (const offDow of ["2", "5", "6", "0"]) {
      clickAction(env5, { a: "bid-sched-day", id: acceptIdMatch[1], dow: offDow });
      await flushMicrotasks(2);
    }
    clickAction(env5, { a: "bid-sched-hour", id: acceptIdMatch[1], hour: "23:00" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes("3 дня") &&
      env5.elements.get("main").innerHTML.includes("в 23:00 в понедельник, среду и четверг каждую неделю"),
      "expected 3-day selection with 23:00 to format 'в 23:00 в понедельник, среду и четверг каждую неделю'"
    );
    clickAction(env5, { a: "bid-sched-day", id: acceptIdMatch[1], dow: "1" });
    clickAction(env5, { a: "bid-sched-hour", id: acceptIdMatch[1], hour: "16:00" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes("в 16:00 в среду и четверг каждую неделю"),
      "expected weekly schedule picker to format Bot phrase 'в 16:00 в среду и четверг каждую неделю'"
    );
    const notifsBeforeSchedSend = Number(env5.elements.get("top-notifs-cnt").textContent) || 0;
    clickAction(env5, { a: "bid-sched-send", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    const afterSchedHtml = env5.elements.get("main").innerHTML;
    const notifsAfterSchedSend = Number(env5.elements.get("top-notifs-cnt").textContent) || 0;
    assert(
      notifsAfterSchedSend === notifsBeforeSchedSend &&
      afterSchedHtml.includes("is-just-confirmed") &&
      afterSchedHtml.includes("График закреплён") &&
      afterSchedHtml.includes("график закреплён в «Календаре»") &&
      env5.elements.get("toast").textContent.includes("«Календаре»") &&
      !afterSchedHtml.includes("выберите дни ниже"),
      "expected bid-sched-send to auto-confirm weekly schedule immediately without pushing bell notification and update status subtitle"
    );
    clickAction(env5, { a: "bid-sched-alt-sim", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes("Преподаватель предложил другие даты"),
      "expected bid-sched-alt-sim to show tutor counter-proposed dates"
    );
    clickAction(env5, { a: "bid-sched-accept-alt", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    const homeConfirmedHtml = env5.elements.get("main").innerHTML;
    assert(
      homeConfirmedHtml.includes("График закреплён") &&
      homeConfirmedHtml.includes('data-a="reviews-open"') &&
      homeConfirmedHtml.includes(`data-a="review-open" data-id="${acceptIdMatch[1]}"`) &&
      homeConfirmedHtml.includes(`data-a="dispute-open" data-id="${acceptIdMatch[1]}"`),
      "expected bid-sched-accept-alt to confirm weekly dates and render reviews/review/dispute buttons"
    );

    // Реальные отзывы, пересчёт рейтинга и спор по гарантии возврата
    const sokTutor = globalThis.EGE.tutors.LIST.find((t) => t.id === "tut-sokolova");
    assert(Boolean(sokTutor), "expected tut-sokolova in TDATA.LIST");
    clickAction(env5, { a: "reviews-open", id: "tut-sokolova" });
    await flushMicrotasks(2);
    const revsModalHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      revsModalHtml.includes('id="reviews-modal-title"') &&
      revsModalHtml.includes("rev-summary-head") &&
      revsModalHtml.includes("rev-bars"),
      "expected reviews-open to open tutor reviews sheet with rating breakdown bars"
    );
    clickAction(env5, { a: "reviews-close" });
    await flushMicrotasks(2);

    const revTutMatch = /data-a="reviews-open" data-id="([^"]+)"/.exec(homeConfirmedHtml);
    const revTutId = revTutMatch ? revTutMatch[1] : "tut-sokolova";
    const revTutObj = globalThis.EGE.tutors.LIST.find((t) => t.id === revTutId);
    const revCountBefore = Number(revTutObj ? revTutObj.reviews : 0);

    clickAction(env5, { a: "reviews-open", id: revTutId });
    await flushMicrotasks(2);
    const revsEligibleHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      revsEligibleHtml.includes('id="reviews-modal-title"') &&
      revsEligibleHtml.includes(`class="btn" data-a="review-open"`) &&
      revsEligibleHtml.includes("Оставить отзыв") &&
      !revsEligibleHtml.includes("Выбрать время"),
      "expected eligible reviews modal footer to show only single primary Оставить отзыв CTA without Выбрать время"
    );
    clickAction(env5, { a: "reviews-close" });
    await flushMicrotasks(2);

    clickAction(env5, { a: "review-open", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="review-modal-title"'), "expected review-open to render rating form modal");
    clickAction(env5, { a: "review-star", star: "4" });
    clickAction(env5, { a: "review-tag", tag: "Понятно объясняет" });
    env5.emitDoc("input", { target: { id: "review-comment", value: "Отличный разбор и структура урока", dataset: {} } });
    clickAction(env5, { a: "review-submit" });
    await flushMicrotasks(3);
    assert(
      !env5.elements.get("modal-root").innerHTML.includes('id="review-modal-title"') &&
      Number(revTutObj.reviews) === revCountBefore + 1 &&
      globalThis.EGE.tutors.getTutorReviews(revTutId).some((r) => r.comment.includes("Отличный разбор")) &&
      env5.elements.get("main").innerHTML.includes("Ваша оценка 4"),
      "expected review-submit to increment tutor reviews, persist review, and show Ваша оценка 4 on booking"
    );

    clickAction(env5, { a: "dispute-open", id: acceptIdMatch[1] });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes('id="dispute-modal-title"'), "expected dispute-open to render dispute guarantee modal");
    clickAction(env5, { a: "dispute-submit" });
    await flushMicrotasks(2);
    assert(env5.elements.get("modal-root").innerHTML.includes("минимум 4 символа"), "expected empty dispute-submit to require >= 4 chars comment");
    env5.emitDoc("input", { target: { id: "dispute-comment", value: "Первый урок не подошёл по формату", dataset: {} } });
    clickAction(env5, { a: "dispute-submit" });
    await flushMicrotasks(3);
    assert(
      !env5.elements.get("modal-root").innerHTML.includes('id="dispute-modal-title"') &&
      env5.elements.get("main").innerHTML.includes("Спор на проверке"),
      "expected valid dispute-submit to open dispute and display Спор на проверке status chip"
    );

    clickAction(env5, { a: "go", v: "study" });
    await flushMicrotasks(3);
    const studyWithCardsHtml = env5.elements.get("main").innerHTML;
    assert(
      !studyWithCardsHtml.includes('id="study-overview-cards"') &&
      studyWithCardsHtml.includes('id="study-week-strip"') &&
      !studyWithCardsHtml.includes('class="card pad stack study-cal-card" id="study-week-strip"') &&
      (studyWithCardsHtml.match(/class="study-week-day-btn/g) || []).length === 7 &&
      studyWithCardsHtml.includes('class="swd-cnt num"') &&
      studyWithCardsHtml.includes('class="study-lesson-card"') &&
      studyWithCardsHtml.includes('class="study-lesson-pills"') &&
      studyWithCardsHtml.includes("Яндекс Телемост") &&
      studyWithCardsHtml.includes(tmHrefMatch[1]) &&
      studyWithCardsHtml.includes("будет передана преподавателю сама (WhatsApp или Telegram-бот)") &&
      !studyWithCardsHtml.includes("Яндекс Телемост · добавить") &&
      studyWithCardsHtml.includes("Отменить занятие") &&
      studyWithCardsHtml.includes("is-hold-add") &&
      studyWithCardsHtml.includes('data-hold-ch="wa"') &&
      studyWithCardsHtml.includes('data-hold-ch="tg"') &&
      !studyWithCardsHtml.includes("Главный срок") &&
      !studyWithCardsHtml.includes("Быстрый переход") &&
      studyWithCardsHtml.includes("Телемост") &&
      !studyWithCardsHtml.includes("Ваших записей к преподавателям") &&
      !studyWithCardsHtml.includes("study-tabs-rail") &&
      !studyWithCardsHtml.includes("Подобрать ещё") &&
      !studyWithCardsHtml.includes('data-a="study-subj"') &&
      !studyWithCardsHtml.includes('id="study-schedule-table"') &&
      !studyWithCardsHtml.includes("Запланированные уроки") &&
      studyWithCardsHtml.includes('id="study-billing-notice"'),
      "expected 7-day strip without #study-schedule-table/filters/sub-tabs/Подобрать ещё, top billing notice, daily card with single-line swipe pills, hold on WA/TG/MAX, Telemost & cancel"
    );
    const computeBillingFn = globalThis.EGE.views.marketplace.computeStudyWeekBilling;
    assert(typeof computeBillingFn === "function", "expected computeStudyWeekBilling export on EGE.views.marketplace");
    const sampleBk = { id: "bk-test", reserved: 1500, schedulePlan: { status: "confirmed", dows: [3, 5] } };
    const sampleRows = [
      { id: "r1", dayShort: "Ср", hour: "16:00", tutorName: "Тест", subjectName: "Математика", offerPrice: 1500, booking: sampleBk },
      { id: "r2", dayShort: "Пт", hour: "16:00", tutorName: "Тест", subjectName: "Математика", offerPrice: 1500, booking: sampleBk }
    ];
    const billW0 = computeBillingFn({ balance: 500 }, sampleRows, 0);
    assert(
      billW0.lessonCount === 2 && billW0.totalCost === 3000 && billW0.coveredByReserve === 1500 && billW0.neededFromBalance === 1500 && billW0.deficit === 1000,
      "expected week 0 billing to deduct frozen escrow reserve once across 2 weekly lessons and compute deficit"
    );
    const billW1 = computeBillingFn({ balance: 500 }, sampleRows, 1);
    assert(
      billW1.coveredByReserve === 0 && billW1.neededFromBalance === 3000 && billW1.deficit === 2500,
      "expected week 1 recurring billing not to double-credit initial booking reserve"
    );
    clickAction(env5, { a: "study-billing-toggle" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes('id="study-billing-details"') &&
      env5.elements.get("main").innerHTML.includes("Почему такая сумма:"),
      "expected Подробнее button on multi-lesson week in study view to expand explanation"
    );
    clickAction(env5, { a: "bal-open", amount: "2180", reason: "На этой неделе у вас 2 урока на 4 360 ₽. Не хватает 2 180 ₽." });
    await flushMicrotasks(2);
    const prefillBalHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      prefillBalHtml.includes('id="bal-custom-amount"') &&
      prefillBalHtml.includes('value="2180"') &&
      prefillBalHtml.includes("На этой неделе у вас 2 урока на 4 360 ₽"),
      "expected bal-open with data-amount & data-reason from study billing notice to prefill amount and show reason"
    );
    clickAction(env5, { a: "bal-close" });
    await flushMicrotasks(2);

    const otherDayMatch = /data-a="study-day-pick" data-iso="([^"]+)" aria-pressed="false"/.exec(studyWithCardsHtml);
    assert(otherDayMatch, "expected unselected weekday button in #study-week-strip");
    clickAction(env5, { a: "study-day-pick", iso: otherDayMatch[1] });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes(`data-a="study-day-pick" data-iso="${otherDayMatch[1]}" aria-pressed="true"`),
      "expected study-day-pick to switch active day in 7-day calendar strip"
    );
    const lessonDayMatch = /data-a="study-day-pick" data-iso="([^"]+)"[^>]*>[\s\S]*?<span class="swd-cnt/.exec(studyWithCardsHtml);
    if (lessonDayMatch) {
      clickAction(env5, { a: "study-day-pick", iso: lessonDayMatch[1] });
      await flushMicrotasks(2);
    }

    clickAction(env5, { a: "study-week-step", delta: "-1" });
    await flushMicrotasks(2);
    const studyPastHtml = env5.elements.get("main").innerHTML;
    assert(
      studyPastHtml.includes("Прошлая неделя") &&
      studyPastHtml.includes("study-week-days is-past-week") &&
      studyPastHtml.includes("Прошедшая неделя") &&
      studyPastHtml.includes("✓ Проведён") &&
      !studyPastHtml.includes('id="study-billing-notice"'),
      "expected stepping study calendar backward to show greyed Прошлая неделя with past lessons and no billing notice"
    );
    clickAction(env5, { a: "study-week-step", delta: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Эта неделя") && env5.elements.get("main").innerHTML.includes('id="study-billing-notice"'), "expected stepping forward from past week to return to Эта неделя");

    const holdMatch = /data-hold-ch="tg" data-tutor-id="([^"]*)" data-tutor-name="([^"]*)"/.exec(studyWithCardsHtml);
    assert(holdMatch, "expected data-hold-ch='tg' button metadata on greyed Telegram pill");
    clickAction(env5, { a: "tutor-contact-open", tutorId: holdMatch[1], tutorName: holdMatch[2], holdCh: "tg" });
    await flushMicrotasks(2);
    const tcModalHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      tcModalHtml.includes('data-f="tutor-contact-save"') &&
      tcModalHtml.includes("is-sheet-back") &&
      tcModalHtml.includes("sheet-grabber"),
      "expected hold-to-add Telegram bottom-sheet grabber modal"
    );
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "tutor-contact-save" },
          elements: { contact: { value: "@sokolova_bio" } }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(3);
    const afterTgSaveHtml = env5.elements.get("main").innerHTML;
    assert(
      !env5.elements.get("modal-root").innerHTML.trim() &&
      afterTgSaveHtml.includes("https://t.me/sokolova_bio") &&
      afterTgSaveHtml.includes('class="btn-msg is-tg is-hold-add"') &&
      !afterTgSaveHtml.includes("btn-msg is-tg is-disabled"),
      "expected saving @sokolova_bio via hold modal to activate Telegram link (while keeping hold-to-edit) in Расписание"
    );

    // Hold-to-edit on already active WhatsApp pill updates wa.me link immediately
    const holdWaMatch = /class="btn-msg is-wa is-hold-add"[^>]*data-hold-ch="wa" data-tutor-id="([^"]*)" data-tutor-name="([^"]*)"/.exec(afterTgSaveHtml);
    assert(holdWaMatch, "expected active WhatsApp pill to carry is-hold-add and data-hold-ch='wa'");
    clickAction(env5, { a: "tutor-contact-open", tutorId: holdWaMatch[1], tutorName: holdWaMatch[2], holdCh: "wa" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("modal-root").innerHTML.includes("Изменить WhatsApp преподавателя") &&
      env5.elements.get("modal-root").innerHTML.includes('data-a="phone-country-toggle" data-scope="tc-contact"'),
      "expected hold modal on active WhatsApp pill to open Изменить WhatsApp преподавателя with region selector"
    );
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "tutor-contact-save" },
          elements: { contact: { value: "8 (914) 555-44-33" } }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(3);
    assert(
      env5.elements.get("main").innerHTML.includes("https://wa.me/79145554433"),
      "expected saving WhatsApp phone via hold modal to update active wa.me URL"
    );

    clickAction(env5, { a: "go", v: "market" });
    await flushMicrotasks(3);
    assert(
      env5.elements.get("main").innerHTML.includes("Отправим преподавателю в WhatsApp"),
      "expected /market search cards for parsed tutors to say 'Отправим преподавателю в WhatsApp'"
    );

    clickAction(env5, { a: "mkt-cancel-book", id: acceptIdMatch[1] });
    await flushMicrotasks(4);
    const afterCancelHtml = env5.elements.get("main").innerHTML;
    assert(hasNum(afterCancelHtml, "4 590 ₽"), "expected balance restored to 4 590 ₽ on tutor cancel/switch");

    clickAction(env5, { a: "filter-open" });
    await flushMicrotasks(2);
    const filterSheet = env5.elements.get("modal-root").innerHTML;
    assert(
      filterSheet.includes("is-fullscreen-sheet") &&
      filterSheet.includes("is-filter-drawer") &&
      filterSheet.includes("is-filter-back") &&
      filterSheet.includes("sheet-grabber") &&
      filterSheet.includes("filter-close-btn") &&
      filterSheet.includes('aria-label="Закрыть фильтры"') &&
      filterSheet.includes("filter-sheet-foot") &&
      filterSheet.includes('data-a="mkt-reset"') &&
      filterSheet.includes('id="filter-submit-btn"') &&
      filterSheet.indexOf("filter-reset-btn") < filterSheet.indexOf("filter-apply-btn") &&
      filterSheet.includes("Подняты за последнюю неделю") &&
      filterSheet.includes('data-a="mkt-price-custom"') &&
      !filterSheet.includes("Время занятия") &&
      !filterSheet.includes("День недели") &&
      filterSheet.includes("Показать"),
      "expected filter drawer with right-side drawer classes, close cross, footer Reset (left) + Apply (right), weekly freshness, expanded price presets + Своя, and without time/day sections"
    );
    clickAction(env5, { a: "mkt-exam", v: "ЕГЭ" });
    await flushMicrotasks(2);
    const filterEge = env5.elements.get("modal-root").innerHTML;
    assert(filterEge.includes("Обществознание") && filterEge.includes("География") && !filterEge.includes("Дзюдо") && !filterEge.includes("Программирование"), "expected ЕГЭ filter sheet to display exam subjects only");
    clickAction(env5, { a: "mkt-exam", v: "all" });
    await flushMicrotasks(2);
    const filterCollapsed = env5.elements.get("modal-root").innerHTML;
    assert(
      filterCollapsed.includes('data-a="mkt-subj-more"') &&
      filterCollapsed.includes("Подробнее (+") &&
      filterCollapsed.includes("Дзюдо") &&
      filterCollapsed.includes("Шахматы") &&
      !filterCollapsed.includes('id="mkt-subj-q"'),
      "expected collapsed filter sheet in Все mode to show preview chips + Подробнее (+N) button"
    );
    clickAction(env5, { a: "mkt-subj-more" });
    await flushMicrotasks(2);
    const filterExpanded = env5.elements.get("modal-root").innerHTML;
    assert(
      filterExpanded.includes('id="mkt-subj-q"') &&
      filterExpanded.includes("Свернуть") &&
      filterExpanded.includes("Спорт и движение") &&
      filterExpanded.includes("Плавание") &&
      filterExpanded.includes("Бокс / Самбо"),
      "expected clicking Подробнее to expand categorized direction list and search input"
    );
    env5.emitDoc("input", { target: { id: "mkt-subj-q", value: "китай", dataset: {} } });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("modal-root").innerHTML.includes("Китайский язык") &&
      !env5.elements.get("modal-root").innerHTML.includes("Плавание"),
      "expected live direction search to filter catalog to matching directions"
    );
    env5.emitDoc("input", { target: { id: "mkt-subj-q", value: "Скейтбординг", dataset: {} } });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("modal-root").innerHTML.includes('data-a="mkt-subj-add"') &&
      env5.elements.get("modal-root").innerHTML.includes("Выбрать и добавить"),
      "expected unknown query in direction search to offer adaptive orchestrator add action"
    );
    clickAction(env5, { a: "mkt-subj-add" });
    await flushMicrotasks(2);
    const addedDir = globalThis.EGE.tutors.SUBJECTS.find((s) => s.short === "Скейтбординг");
    assert(
      Boolean(addedDir && addedDir.autoAdded && addedDir.source === "orchestrator") &&
      globalThis.EGE.tutors.subjectsForExam("ЕГЭ").length === 11 &&
      env5.elements.get("modal-root").innerHTML.includes("Скейтбординг") &&
      env5.elements.get("main").innerHTML.includes("Скейтбординг ×"),
      "expected mkt-subj-add to register direction adaptively with orchestrator tag, select it, and keep 11 ЕГЭ subjects"
    );
    globalThis.EGE.tutors.syncDirections([{ id: "calligraphy", name: "Каллиграфия", short: "Каллиграфия", source: "orchestrator", tutorCount: 2 }]);
    assert(
      globalThis.EGE.tutors.SUBJECTS.filter((s) => s.short === "Каллиграфия").length === 1,
      "expected syncDirections to adaptively register orchestrator direction without duplicates"
    );
    clickAction(env5, { a: "mkt-subj-more" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("modal-root").innerHTML.includes('id="mkt-subj-q"'), "expected Свернуть to collapse direction finder");
    const sheetBodyMock = env5.elements.get("modal-root").querySelector(".sheet-body");
    assert(sheetBodyMock, "expected .sheet-body inside open filter modal");
    sheetBodyMock.scrollTop = 340;
    clickAction(env5, { a: "mkt-format", v: "Онлайн" });
    clickAction(env5, { a: "mkt-city", v: "Якутск" });
    clickAction(env5, { a: "mkt-price", v: "1200" });
    await flushMicrotasks(3);
    const preservedSheetBody = env5.elements.get("modal-root").querySelector(".sheet-body");
    assert(preservedSheetBody && preservedSheetBody.scrollTop === 340, "expected filter modal .sheet-body scrollTop to stay at 340 across filter button clicks and async re-renders");
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
    assert(env5.elements.get("main").innerHTML.includes("bb-data-table cols-7") && env5.elements.get("main").innerHTML.includes("<th>На руки (94%)</th>"), "expected bb-tbl-cols=7 to render 7-column table");
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
    assert(
      feesHtml.includes('id="fees-page"') &&
      feesHtml.includes("СБП") &&
      feesHtml.includes("Карта РФ") &&
      feesHtml.includes("5%") &&
      feesHtml.includes("1%") &&
      feesHtml.includes("490 ₽") &&
      !feesHtml.includes("1 490") &&
      !feesHtml.includes("PRO") &&
      feesHtml.includes("Без платных подписок и скрытых доплат") &&
      hasNum(feesHtml, "752 ₽") &&
      feesHtml.includes("40 ₽") &&
      feesHtml.includes("8 ₽") &&
      feesHtml.includes('href="/refunds"') &&
      feesHtml.includes('href="/terms"') &&
      feesHtml.includes("land-footer") &&
      !feesHtml.includes("Открыть Брендбук"),
      "expected updated /fees page with SBP 0% / Card +3%, 5% / 1% fees, 490 ₽ start, no PRO tariff wording, 752/40/8 default calc, legal links, and footer without internal brandbook button"
    );
    clickAction(env5, { a: "fees-rate", rate: "2000" });
    await flushMicrotasks(2);
    const feesUpdated = env5.elements.get("main").innerHTML;
    assert(hasNum(feesUpdated, "1 880 ₽") && feesUpdated.includes("100 ₽") && feesUpdated.includes("20 ₽"), "expected /fees calculator preset to recalculate 94%/5%+1% split for 2000");
    clickAction(env5, { a: "fees-source", v: "own" });
    await flushMicrotasks(2);
    const feesOwn = env5.elements.get("main").innerHTML;
    assert(hasNum(feesOwn, "1 960 ₽") && feesOwn.includes("20 ₽"), "expected /fees calculator source toggle to recalculate 98%/1%+1% split for own students");
    clickAction(env5, { a: "fees-method", v: "card" });
    await flushMicrotasks(2);
    const feesCard = env5.elements.get("main").innerHTML;
    assert(hasNum(feesCard, "2 060 ₽"), "expected /fees calculator method toggle to add +3% card fee for 2000 ₽");

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
    assert(bbTutorAppHtml.includes("tc-req-card") && bbTutorAppHtml.includes("Поднять анкету (раз в 4 ч)") && bbTutorAppHtml.includes("на руки 94%") && bbTutorAppHtml.includes("Календарь учеников") && bbTutorAppHtml.includes("Ученики ищут") && bbTutorAppHtml.includes("side-badge-jump"), "expected bb-app-role=tutor in brandbook to display Tutor Cabinet card with 4h bump button, 7-item teacher sidebar with jump badge, and 94% payout");
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
      !landFullHtml.includes("Комиссия 5%") && !landFullHtml.includes("752 ₽") &&
      !landFullHtml.includes("wa-btn") && !landFullHtml.includes("bid-stepper"),
      "expected landing to keep 5% commission split and legacy wa-btn/bid-stepper classes off /landing"
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
    await flushMicrotasks(8);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected tutor apply modal closed after valid submit");
    const tutorSideToast = env5.elements.get("toast");
    assert(tutorSideToast && tutorSideToast.className === "toast is-side" && tutorSideToast.innerHTML.includes("Анкета принята на проверку"), "expected side notification after submitting tutor application");

    clickAction(env5, { a: "book-open", id: globalThis.EGE.tutors.LIST[0].id, hour: "14:00" });
    await flushMicrotasks(2);
    const modalBookHtml = env5.elements.get("modal-root").innerHTML;
    assert(modalBookHtml.includes('id="bid-submit-btn"') && modalBookHtml.includes("bid-submit-main") && modalBookHtml.includes("Предложить ") && !modalBookHtml.includes("sakha-pattern") && !modalBookHtml.includes("Сөп · Предложить"), "expected booking modal to use clean plain Предложить CTA button centered in footer");
    assert(
      env5.elements.get("main").innerHTML.includes('id="land-market"') &&
      env5.elements.get("main").innerHTML.includes('data-a="mkt-exam"') &&
      !env5.elements.get("main").innerHTML.includes("Поиск репетитора"),
      "expected book-open while already authenticated on landing to transition into student Поиск cabinet"
    );
    clickAction(env5, { a: "book-close" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("main").innerHTML.includes("wa-btn") && !env5.elements.get("main").innerHTML.includes("bid-stepper"), "expected zero legacy wa-btn or bid-stepper classes remaining in rendered cabinet HTML");

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
    assert(
      studentSideHtml.includes("Учёба") && studentSideHtml.includes("Общение") && studentSideHtml.includes("Поиск") && studentSideHtml.includes("Календарь") && studentSideHtml.includes("Профиль") &&
      studentTabHtml.includes("Учёба") && studentTabHtml.includes("Общение") && studentTabHtml.includes("Поиск") && studentTabHtml.includes("Календарь") && studentTabHtml.includes("Профиль"),
      "expected 5-tab nav (Учёба, Общение, Поиск, Календарь, Профиль) for student"
    );
    assert(env5.elements.get("tutor-balance-dock").hidden === true && env5.elements.get("tutor-balance-dock").innerHTML === "", "expected teacher floating balance dock hidden in student mode");
    assert(studentMainHtml.includes("comm-head-seg") && studentMainHtml.includes('data-tab="chats"') && studentMainHtml.includes('data-tab="bids"'), "expected demo student login to land on Общение with Чаты and Отклики tabs");
    assert(!readFileText("frontend/index.html").includes('id="top-market"'), "expected top-market removed from mobile topbar");

    clickAction(env5, { a: "go", v: "study" });
    await flushMicrotasks(3);
    const studyDefaultHtml = env5.elements.get("main").innerHTML;
    assert(
      !studyDefaultHtml.includes('id="study-overview-cards"') &&
      !studyDefaultHtml.includes("Главный срок") &&
      !studyDefaultHtml.includes("Быстрый переход") &&
      (studyDefaultHtml.includes('id="study-week-strip"') || studyDefaultHtml.includes("Вы пока не записаны")),
      "expected study view default График tab to render calendar without Главный срок and Быстрый переход"
    );
    clickAction(env5, { a: "study-tab", tab: "tests" });
    await flushMicrotasks(3);
    assert(env5.elements.get("main").innerHTML.includes("Тесты ЕГЭ"), "expected Учёба -> Тесты ЕГЭ tab to render trainer hub");
    clickAction(env5, { a: "study-tab", tab: "stats" });
    await flushMicrotasks(3);
    assert(env5.elements.get("main").innerHTML.includes("Подготовка в цифрах"), "expected Учёба -> Показатели tab to render stats");

    clickAction(env5, { a: "brand-go-tutors" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes('id="land-market"') && env5.elements.get("main").innerHTML.includes('id="mkt-q"'), "expected clicking logo (brand-go-tutors) to navigate to student Поиск view");

    clickAction(env5, { a: "go", v: "profile" });
    await flushMicrotasks(3);
    const demoProfHtml = env5.elements.get("main").innerHTML;
    assert(
      !demoProfHtml.includes("Вход в аккаунт") &&
      !demoProfHtml.includes("Режим кабинета") &&
      !demoProfHtml.includes("Оформление") &&
      !demoProfHtml.includes("Личный профиль") &&
      !demoProfHtml.includes('<div class="eyebrow">Профиль</div>') &&
      !demoProfHtml.includes("Анкета ученика") &&
      !demoProfHtml.includes("Личные данные") &&
      !demoProfHtml.includes('id="pf-name"') &&
      !demoProfHtml.includes('id="pf-grade"') &&
      !demoProfHtml.includes('id="pf-city"') &&
      !demoProfHtml.includes('id="pf-phone"') &&
      !demoProfHtml.includes('id="pf-goal"') &&
      !demoProfHtml.includes('id="pf-account-edit-form"') &&
      demoProfHtml.includes("stu-hero-card") &&
      demoProfHtml.includes("stu-hero-top") &&
      demoProfHtml.includes("stu-hero-foot") &&
      demoProfHtml.includes("profile-setup-title-row") &&
      demoProfHtml.includes('id="pf-photo-file"') &&
      demoProfHtml.includes("Добавить фото") &&
      demoProfHtml.includes('data-a="pf-account-edit"') &&
      demoProfHtml.includes("Редактировать") &&
      demoProfHtml.includes("stu-hero-logout-btn") &&
      demoProfHtml.includes("Целевые баллы") &&
      demoProfHtml.includes('id="stu-linked-accounts"') &&
      !demoProfHtml.includes("Быстрый вход и уведомления") &&
      !demoProfHtml.includes("Привяжите Google или Telegram") &&
      !demoProfHtml.includes("Мгновенный вход, коды и уведомления") &&
      demoProfHtml.includes("Google") &&
      demoProfHtml.includes("stu-link-row is-linked") &&
      demoProfHtml.includes("stu-link-badge") &&
      demoProfHtml.includes("Привязан ✓") &&
      demoProfHtml.includes("Привязать Telegram") &&
      demoProfHtml.includes("Сохранить профиль") &&
      demoProfHtml.includes("stu-data-backup-row") &&
      demoProfHtml.includes('data-a="export"') &&
      demoProfHtml.includes('data-a="import"') &&
      demoProfHtml.includes("stu-data-reset-row") &&
      demoProfHtml.includes('data-a="reset-ask"') &&
      demoProfHtml.includes('data-a="auth-logout"'),
      "expected clean demo Student Profile hiding personal fields until Редактировать is clicked"
    );
    clickAction(env5, { a: "pf-account-edit" });
    await flushMicrotasks(2);
    const editProfHtml = env5.elements.get("main").innerHTML;
    assert(
      editProfHtml.includes('id="pf-account-edit-form"') &&
      editProfHtml.includes('id="pf-name"') &&
      editProfHtml.includes('<legend><label for="pf-name">Имя и фамилия</label></legend>') &&
      editProfHtml.includes('<fieldset class="stu-notch-field is-select">') &&
      editProfHtml.includes('id="pf-grade"') &&
      editProfHtml.includes('<legend>Класс или цель</legend>') &&
      editProfHtml.includes('id="pf-city"') &&
      editProfHtml.includes('data-a="pf-city-toggle"') &&
      editProfHtml.includes('<legend>Город</legend>') &&
      editProfHtml.includes('value="Якутск" selected') &&
      editProfHtml.includes("Автоматически меняем ваш часовой пояс к этому городу") &&
      editProfHtml.includes('<fieldset class="stu-notch-field is-phone">') &&
      editProfHtml.includes('id="pf-phone"') &&
      editProfHtml.includes('id="phone-field-pf-phone"') &&
      editProfHtml.includes('data-a="phone-country-toggle" data-scope="pf-phone"') &&
      editProfHtml.includes('<fieldset class="stu-notch-field is-textarea">') &&
      editProfHtml.includes('<legend><label for="pf-goal">') &&
      editProfHtml.includes('id="pf-goal"'),
      "expected clicking Редактировать on Student Profile to open #pf-account-edit-form with compact notched personal fields"
    );
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "pf-account-edit" },
          elements: {
            name: { value: "Анна Обновлённая" },
            city: { value: "Москва" },
            phone: { value: "+7 914 555 22 11" },
            telegram: { value: "@anna_upd" }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(2);
    const updatedAccHtml = env5.elements.get("main").innerHTML;
    assert(
      updatedAccHtml.includes("Анна Обновлённая") &&
      updatedAccHtml.includes("Москва") &&
      !updatedAccHtml.includes('id="pf-account-edit-form"'),
      "expected submitting #pf-account-edit-form to update Личный профиль hero and collapse form"
    );
    const baseCssText = readFileText("ux-ui/styles/base.css");
    const mktCssCheckText = readFileText("frontend/styles/marketplace.css");
    const indexHtmlText = readFileText("frontend/index.html");
    assert(
      baseCssText.includes("grid-template-rows: auto minmax(0, 1fr); align-content: start;") &&
      mktCssCheckText.includes(".mc-lesson-acts {") &&
      mktCssCheckText.includes("flex-wrap: nowrap;") &&
      !indexHtmlText.includes('id="top-profile"'),
      "expected mobile topbar grid row fix in base.css, single-row .mc-lesson-acts in marketplace.css, and no redundant #top-profile gear in index.html"
    );
    // Restore original demo city Якутск before region phone picker assertions
    clickAction(env5, { a: "pf-account-edit" });
    await flushMicrotasks(1);
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "pf-account-edit" },
          elements: {
            name: { value: "Алина" },
            city: { value: "Якутск" },
            phone: { value: "" },
            telegram: { value: "" }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(2);
    // Open #pf-account-edit-form to test region selector & auto '+7' formatting on #pf-phone
    clickAction(env5, { a: "pf-account-edit" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "phone-country-toggle", scope: "pf-phone" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes('class="cv-country-menu"') &&
      env5.elements.get("main").innerHTML.includes('data-a="phone-country-pick" data-scope="pf-phone"'),
      "expected phone-country-toggle to open region menu for #pf-phone"
    );
    clickAction(env5, { a: "phone-country-pick", scope: "pf-phone", inputId: "pf-phone", v: "BY" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes("Беларусь") &&
      env5.elements.get("main").innerHTML.includes("+375 ("),
      "expected picking BY region to switch label and format existing digits with +375"
    );
    const pfEmptyHtml = globalThis.EGE.phoneField.phoneFieldHTML({ scope: "pf-empty-chk", id: "pf-empty-chk", name: "phone", label: "Телефон", value: "", country: "RU" });
    assert(pfEmptyHtml.includes('value="+7 "') && pfEmptyHtml.includes("Россия"), "expected empty phone field to prefill '+7 ' automatically with Russia region");
    clickAction(env5, { a: "phone-country-pick", scope: "pf-phone", inputId: "pf-phone", v: "RU" });
    await flushMicrotasks(2);
    const pfPhoneInp = { id: "pf-phone", value: "9143210011", dataset: { phoneScope: "pf-phone", d: "pf.phone" } };
    env5.emitDoc("input", { target: pfPhoneInp });
    assert(pfPhoneInp.value === "+7 (914) 321-00-11", `expected #pf-phone live input to auto-prefix +7 mask, got ${pfPhoneInp.value}`);
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "pf-account-edit" },
          elements: {
            name: { value: "Кирилл Егоров" },
            grade: { value: "11 класс · ЕГЭ" },
            city: { value: "Якутск" },
            phone: { value: pfPhoneInp.value },
            goal: { value: "ЕГЭ по профилю на 90+" }
          }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(4);
    assert(
      env5.elements.get("main").innerHTML.includes("Кирилл Егоров") &&
      !env5.elements.get("main").innerHTML.includes('id="pf-account-edit-form"'),
      "expected submitting #pf-account-edit-form to save student fields and collapse form"
    );
    clickAction(env5, { a: "pf-account-edit" });
    await flushMicrotasks(2);
    const savedProfHtml = env5.elements.get("main").innerHTML;
    assert(
      savedProfHtml.includes("Кирилл Егоров") &&
      savedProfHtml.includes('value="11 класс · ЕГЭ" selected') &&
      savedProfHtml.includes('value="Якутск" selected') &&
      savedProfHtml.includes("UTC+9") &&
      savedProfHtml.includes("+7 (914) 321-00-11") &&
      savedProfHtml.includes("ЕГЭ по профилю на 90+"),
      "expected student profile fields (name, grade, city, phone, goal) to persist after #pf-account-edit-form submit"
    );

    clickAction(env5, { a: "pf-city-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="pf-city-pick" data-v="Москва"'), "expected pf-city-toggle to open custom city dropdown");
    clickAction(env5, { a: "pf-city-pick", v: "Москва" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("UTC+3"), "expected picking Москва to switch timezone note to UTC+3");
    clickAction(env5, { a: "pf-city-pick", v: "Якутск" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("UTC+9"), "expected switching back to Якутск to show UTC+9");
    clickAction(env5, { a: "pf-account-edit-cancel" });
    await flushMicrotasks(1);

    // Привязка Telegram внутри профиля ученика (и проверка отвязки)
    clickAction(env5, { a: "pf-link-tg" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('id="pf-link-tg-inp"'), "expected pf-link-tg to open Telegram input in profile");
    env5.emitDoc("input", { target: { id: "pf-link-tg-inp", value: "@student_ykt", dataset: { d: "pf.linkTg" } } });
    clickAction(env5, { a: "pf-link-tg-save" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes("@student_ykt") &&
      env5.elements.get("main").innerHTML.includes("Привязан ✓"),
      "expected Telegram link to persist in student profile"
    );
    clickAction(env5, { a: "pf-unlink-tg" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Привязать Telegram"), "expected pf-unlink-tg to restore link button");

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
      tutorMain1.includes("Входящие заявки учеников") &&
      !tutorMain1.includes("Торг в реальном времени") &&
      tutorMain1.includes('id="tc-requests-table"') &&
      !tutorMain1.includes('class="card stack tc-req-section" id="tc-requests-table"') &&
      tutorMain1.includes("tc-req-card") &&
      tutorMain1.includes('id="tc-first-pending"') &&
      tutorMain1.includes("Выплата после урока:") &&
      !tutorMain1.includes("На руки 94%") &&
      tutorMain1.includes("is-1row") &&
      !tutorMain1.includes("is-2rows") &&
      tutorMain1.includes("tc-diff-row") &&
      !tutorMain1.includes("Саха сирэ") &&
      !tutorMain1.includes("Личный кабинет преподавателя") &&
      !tutorMain1.includes("Live · SSE") &&
      !tutorMain1.includes("ваша цена") &&
      !tutorMain1.includes('id="tc-req-tbl-q"') &&
      !tutorMain1.includes("bb-data-table") &&
      !tutorMain1.includes("Быстрая правка") &&
      !tutorMain1.includes('data-a="tc-bump"') &&
      !tutorMain1.includes("3 колонки") &&
      !tutorMain1.includes("7 колонок"),
      "expected clean card-based Teacher Requests with Выплата после урока, 2-row diff tags, and without На руки 94% badge or header clutter"
    );
    assert(!tutorMain1.includes("tc-role-bar") && !tutorMain1.includes('role="tablist"') && !tutorMain1.includes("tc-mobile-tabs"), "expected tc-role-bar, desktop tablist, and extra tc-mobile-tabs removed on Заявки");
    clickAction(env5, { a: "tc-req-tbl-filter", v: "pending" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes("Ожидающие заявки учеников"), "expected pending filter to update requests heading");
    clickAction(env5, { a: "tc-req-tbl-filter", v: "accepted" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes("Принятые заявки учеников"), "expected accepted filter to update requests heading");
    clickAction(env5, { a: "tc-req-tbl-filter", v: "all" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes("Входящие заявки учеников"), "expected all filter to restore default requests heading");
    assert(
      env5.elements.get("top-balance-slot").hidden === false &&
      env5.elements.get("top-balance-slot").innerHTML.includes("is-tutor") &&
      env5.elements.get("top-balance-slot").innerHTML.includes('data-a="tc-payout-open"') &&
      env5.elements.get("tutor-balance-dock").hidden === true &&
      env5.elements.get("tutor-balance-dock").innerHTML === "" &&
      env5.elements.get("side-foot").innerHTML.includes('id="side-balance-slot" class="side-bal-slot">') &&
      env5.elements.get("side-foot").innerHTML.includes("side-tutor-bal") &&
      env5.elements.get("side-foot").innerHTML.includes('data-a="tc-payout-open"') &&
      !env5.elements.get("side-foot").innerHTML.includes("Вывести 94%") &&
      !env5.elements.get("side-foot").innerHTML.includes("Админ-панель") &&
      !env5.elements.get("side-foot").innerHTML.includes(">Препод<") &&
      env5.elements.get("side-foot").innerHTML.includes("Преподаватель"),
      "expected teacher balance in #side-balance-slot bottom-left and mobile topbar, #tutor-balance-dock hidden, and full Преподаватель label"
    );
    assert(env5.elements.get("side-subjects-wrap").hidden === true && env5.elements.get("side-subjects").innerHTML === "", "expected student ПРЕДМЕТЫ list hidden in tutor mode sidebar");
    assert(!tutorSideHtml.includes("Каталог") && !tutorSideHtml.includes('data-v="market"'), "expected Каталог removed completely from teacher sidebar");
    assert(
      !tutorSideHtml.includes("Календарь") &&
      !tutorSideHtml.includes("Ученики ищут") &&
      !tutorSideHtml.includes("Справочник") &&
      !tutorTabHtml.includes("Календарь"),
      "expected 5 tutor nav items (Заявки, Ученики, Общение, Выплаты, Профиль) without Календарь, Ученики ищут, or Справочник"
    );
    let prevSideIdx = -1;
    let prevTabIdx = -1;
    for (const label of ["Заявки", "Ученики", "Общение", "Выплаты", "Профиль"]) {
      const sideIdx = tutorSideHtml.indexOf(label);
      const tabIdx = tutorTabHtml.indexOf(label);
      assert(sideIdx > prevSideIdx, `expected teacher sidebar nav item in order: ${label}`);
      assert(tabIdx > prevTabIdx, `expected teacher tabbar nav item in order: ${label}`);
      prevSideIdx = sideIdx;
      prevTabIdx = tabIdx;
    }
    const tutorReqMainHtml = env5.elements.get("main").innerHTML;
    assert(
      !tutorReqMainHtml.includes("Новые заявки") &&
      !tutorReqMainHtml.includes("Ставка в анкете") &&
      !tutorReqMainHtml.includes("Чистый доход (94%)"),
      "expected Заявки view not to show KPI cards (moved to Выплаты)"
    );
    assert(tutorSideHtml.includes('data-a="tc-jump-pending"') && tutorSideHtml.includes("side-badge-jump"), "expected clickable pending badge (2) next to Заявки in left sidebar");

    // Клик по цифре 2 (tc-jump-pending) с другой страницы автоматически возвращает на Заявки
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "tc-jump-pending" });
    await flushMicrotasks(3);
    assert(env5.elements.get("main").innerHTML.includes('id="tc-first-pending"') && env5.elements.get("side-nav").innerHTML.includes('data-v="tutor-requests" aria-current="page"'), "expected clicking pending count badge (2) to auto-jump straight to Заявки");

    // Вкладка «Общение» в баре преподавателя и переход по mc-expand
    clickAction(env5, { a: "go", v: "tutor-comm" });
    await flushMicrotasks(3);
    const tutorCommMainHtml = env5.elements.get("main").innerHTML;
    assert(
      !tutorCommMainHtml.includes('<h1 class="h1">Общение</h1>') &&
      tutorCommMainHtml.includes('id="comm-chat-workspace"') &&
      tutorCommMainHtml.includes("Поиск ученика или предмета…") &&
      tutorCommMainHtml.includes('aria-label="Чаты с учениками"') &&
      env5.elements.get("side-nav").innerHTML.includes('data-v="tutor-comm" aria-current="page"') &&
      env5.elements.get("tabbar").innerHTML.includes('data-v="tutor-comm" aria-current="page"'),
      "expected tutor Общение nav tab to open tutor chat workspace and mark sidebar + mobile tabbar active"
    );
    clickAction(env5, { a: "mc-open-thread", mcMode: "page", threadId: "booking:tc-req-2", bookingId: "tc-req-2" });
    await flushMicrotasks(3);
    const tutorUnpaidChatHtml = env5.elements.get("main").innerHTML;
    assert(
      tutorUnpaidChatHtml.includes("Не оплачен") &&
      tutorUnpaidChatHtml.includes("mc-pay-remind-btn") &&
      tutorUnpaidChatHtml.includes('data-a="mc-remind-payment"') &&
      tutorUnpaidChatHtml.includes("Напомнить об оплате") &&
      tutorUnpaidChatHtml.includes('data-a="mc-quick-reply"') &&
      tutorUnpaidChatHtml.includes("Подойдёт ли время?"),
      "expected empty unpaid tutor thread to display orange Напомнить об оплате CTA and starter quick-reply pills"
    );
    clickAction(env5, { a: "mc-remind-payment", threadId: "booking:tc-req-2", bookingId: "tc-req-2" });
    await flushMicrotasks(4);
    const tutorAfterPayRemHtml = env5.elements.get("main").innerHTML;
    assert(
      tutorAfterPayRemHtml.includes("Напоминание об оплате") &&
      tutorAfterPayRemHtml.includes("mc-notice-bar") &&
      !tutorAfterPayRemHtml.includes('data-a="mc-quick-reply"') &&
      !tutorAfterPayRemHtml.includes("Подойдёт ли время?") &&
      !tutorAfterPayRemHtml.includes("mc-quick-row"),
      "expected mc-remind-payment to post payment reminder bubble, show notice bar, and hide starter quick-reply pills after first message"
    );
    assert(
      globalThis.EGE.views.messenger.listThreads()[0].threadId === "booking:tc-req-2" &&
      tutorAfterPayRemHtml.indexOf("Тимур К.") < tutorAfterPayRemHtml.indexOf("Алина С.") &&
      tutorAfterPayRemHtml.indexOf("Тимур К.") < tutorAfterPayRemHtml.indexOf("Дарья В."),
      "expected Тимур К. to move to top of listThreads and #comm-chat-workspace after sending payment reminder"
    );
    clickAction(env5, { a: "mc-open-thread", mcMode: "page", threadId: "booking:tc-req-3", bookingId: "tc-req-3" });
    await flushMicrotasks(3);
    env5.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "comm-chat-send", threadId: "booking:tc-req-3" },
          querySelector: () => ({ value: "Добрый день, Дарья!" })
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(4);
    assert(
      globalThis.EGE.views.messenger.listThreads()[0].threadId === "booking:tc-req-3" &&
      globalThis.EGE.views.messenger.listThreads()[1].threadId === "booking:tc-req-2",
      "expected Дарья В. to move to top ahead of Тимур К. after tutor sends a chat message"
    );
    const daryaSentHtml = env5.elements.get("main").innerHTML;
    assert(
      daryaSentHtml.includes('data-receipt="sent"') &&
      daryaSentHtml.includes('mc-receipt is-sent') &&
      daryaSentHtml.includes('title="Отправлено"') &&
      !daryaSentHtml.includes('data-receipt="read"'),
      "expected newly sent tutor message to show single checkmark (Отправлено)"
    );
    globalThis.EGE.views.messenger.onRealtimeEvent({
      eventType: "chat.read",
      payload: {
        threadId: "booking:tc-req-3",
        readerRole: "student",
        updated: 1
      }
    });
    await flushMicrotasks(2);
    const daryaReadHtml = env5.elements.get("main").innerHTML;
    const daryaPaneSlice = daryaReadHtml.slice(daryaReadHtml.indexOf('class="comm-chat-pane"'));
    assert(
      daryaReadHtml.includes('data-receipt="read"') &&
      daryaReadHtml.includes('mc-receipt is-read') &&
      daryaReadHtml.includes('title="Прочитано"') &&
      daryaPaneSlice.includes('data-receipt="read"') &&
      !daryaPaneSlice.includes('data-receipt="sent"'),
      "expected chat.read event to flip Дарья В. outgoing bubble and preview to double checkmark (Прочитано)"
    );
    globalThis.EGE.views.messenger.onRealtimeEvent({
      eventType: "chat.message",
      payload: {
        threadId: "booking:tc-req-1",
        message: {
          id: "rt-msg-alina-1",
          threadId: "booking:tc-req-1",
          senderRole: "student",
          senderName: "Алина С.",
          body: "Здравствуйте, когда урок?",
          createdAt: new Date(Math.max(Date.now(), Date.parse("2026-11-24T10:05:00Z")) + 2000).toISOString()
        }
      }
    });
    await flushMicrotasks(2);
    assert(
      globalThis.EGE.views.messenger.listThreads()[0].threadId === "booking:tc-req-1" &&
      globalThis.EGE.views.messenger.listThreads()[1].threadId === "booking:tc-req-3" &&
      globalThis.EGE.views.messenger.listThreads()[2].threadId === "booking:tc-req-2",
      "expected Алина С. to jump to #1 ahead of Дарья В. and Тимур К. when student message arrives"
    );
    const commHtmlOnRt = env5.elements.get("main").innerHTML;
    assert(
      env5.elements.get("side-nav").innerHTML.includes('data-v="tutor-comm"') &&
      env5.elements.get("side-nav").innerHTML.includes(">1<") &&
      env5.elements.get("tabbar").innerHTML.includes('data-v="tutor-comm"') &&
      env5.elements.get("tabbar").innerHTML.includes('<i class="tab-badge">1</i>') &&
      env5.elements.get("top-notifs-cnt").hidden === false &&
      Number(env5.elements.get("top-notifs-cnt").textContent) >= 1 &&
      env5.elements.get("side-notifs-cnt").hidden === false &&
      env5.elements.get("toast").innerHTML.includes("Сообщение от ученика: Алина С.") &&
      commHtmlOnRt.includes('class="comm-mobile-chip-dot num"') &&
      commHtmlOnRt.includes(">1<") &&
      commHtmlOnRt.includes('class="mc-thread-badge num">1<'),
      "expected incoming student message to show unread badges in sidebar, tabbar, bell, mobile chip rail, and side toast"
    );
    clickAction(env5, { a: "notif-open" });
    await flushMicrotasks(2);
    const tutorChatNotifModal = env5.elements.get("modal-root").innerHTML;
    const chatNotifMatch = /data-a="notif-open-thread" data-id="([^"]+)"/.exec(tutorChatNotifModal);
    assert(
      tutorChatNotifModal.includes("Сообщение от ученика: Алина С.") &&
      tutorChatNotifModal.includes("Здравствуйте, когда урок?") &&
      tutorChatNotifModal.includes("Открыть чат →") &&
      Boolean(chatNotifMatch),
      "expected bell notifications modal to show clickable student chat notification"
    );
    clickAction(env5, { a: "notif-open-thread", id: chatNotifMatch[1], threadId: "booking:tc-req-1", bookingId: "tc-req-1" });
    await flushMicrotasks(4);
    assert(
      !env5.elements.get("modal-root").innerHTML.trim() &&
      env5.elements.get("main").innerHTML.includes("Здравствуйте, когда урок?") &&
      globalThis.EGE.views.messenger.totalUnreadCount() === 0 &&
      !env5.elements.get("tabbar").innerHTML.includes('<i class="tab-badge">1</i>'),
      "expected clicking notif-open-thread to open student chat, clear bell notification, and clear unread badge"
    );
    const bellHiddenBeforeCatchup = env5.elements.get("top-notifs-cnt").hidden;
    const bellCntBeforeCatchup = Number(env5.elements.get("top-notifs-cnt").textContent) || 0;
    globalThis.EGE.views.messenger.onRealtimeEvent({
      eventType: "chat.message",
      _catchup: true,
      payload: {
        threadId: "booking:tc-req-1",
        message: {
          id: "rt-catchup-old",
          threadId: "booking:tc-req-1",
          senderRole: "student",
          senderName: "Алина С.",
          body: "Старое catchup-сообщение",
          createdAt: "2026-11-24T08:00:00Z"
        }
      }
    });
    await flushMicrotasks(2);
    assert(
      globalThis.EGE.views.messenger.totalUnreadCount() === 0 &&
      !env5.elements.get("tabbar").innerHTML.includes('<i class="tab-badge">1</i>') &&
      env5.elements.get("top-notifs-cnt").hidden === bellHiddenBeforeCatchup &&
      (Number(env5.elements.get("top-notifs-cnt").textContent) || 0) === bellCntBeforeCatchup,
      "expected SSE connected _catchup event not to re-increment unread count or bell notifications"
    );
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(2);
    clickAction(env5, { a: "mc-expand" });
    await flushMicrotasks(3);
    assert(
      env5.elements.get("main").innerHTML.includes('id="comm-chat-workspace"') &&
      env5.elements.get("side-nav").innerHTML.includes('data-v="tutor-comm" aria-current="page"'),
      "expected mc-expand in tutor mode to open Общение (tutor-comm)"
    );
    clickAction(env5, { a: "go", v: "tutor-requests" });
    await flushMicrotasks(3);

    clickAction(env5, { a: "tc-req-step", id: "tc-req-1", step: "50" });
    await flushMicrotasks(2);
    assert(hasNum(env5.elements.get("main").innerHTML, "1 150 ₽/ч") && env5.elements.get("main").innerHTML.includes("Отправить контр-ставку"), "expected tc-req-step to step incoming offer +50 and reveal counter CTA");

    clickAction(env5, { a: "tc-req-accept", id: "tc-req-1" });
    await flushMicrotasks(2);
    const afterAcceptHtml = env5.elements.get("main").innerHTML;
    assert(
      afterAcceptHtml.includes("is-icon-only") &&
      afterAcceptHtml.includes("is-hold-add") &&
      afterAcceptHtml.includes("Подключиться к Яндекс Телемосту") &&
      afterAcceptHtml.includes("https://telemost.yandex.ru/j/") &&
      afterAcceptHtml.includes("Автоуведомление") &&
      afterAcceptHtml.includes('data-a="tc-lesson-notify-toggle" data-id="tc-req-1" data-stu-id="st-alina" aria-pressed="true"') &&
      afterAcceptHtml.includes("tc-switch-pill is-on") &&
      afterAcceptHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="24h" aria-pressed="true"') &&
      afterAcceptHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="1h" aria-pressed="true"') &&
      afterAcceptHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="15m" aria-pressed="false"') &&
      afterAcceptHtml.includes("https://wa.me/") &&
      afterAcceptHtml.includes("https://t.me/") &&
      afterAcceptHtml.includes("https://max.ru/") &&
      env5.elements.get("toast").innerHTML.includes("Урок подтверждён") &&
      afterAcceptHtml.includes("tc-sched-box") &&
      afterAcceptHtml.includes("Бот Вектора: ученик хочет заниматься в 16:00 в среду и четверг каждую неделю") &&
      afterAcceptHtml.includes('data-a="tc-sched-accept" data-id="tc-req-3"'),
      "expected tc-req-accept to render icon-only hold-to-add logos, Telemost join CTA, synced Вкл + default 24h+1h blue pills, and Bot schedule card"
    );
    assert(
      afterAcceptHtml.includes("tc-pay-box is-unpaid") &&
      afterAcceptHtml.includes("Не оплачено") &&
      afterAcceptHtml.includes('data-a="tc-pay-remind" data-id="tc-req-1"') &&
      afterAcceptHtml.includes("Уведомить об оплате") &&
      !afterAcceptHtml.includes("Отметить оплату") &&
      !afterAcceptHtml.includes('data-a="tc-pay-toggle"'),
      "expected accepted card to display automatic unpaid status and Уведомить об оплате button without manual pay toggle"
    );
    clickAction(env5, { a: "tc-pay-remind", id: "tc-req-1", stuId: "st-alina" });
    await flushMicrotasks(1);
    const payRemindedHtml = env5.elements.get("main").innerHTML;
    assert(
      payRemindedHtml.includes("Напоминание отправлено") &&
      payRemindedHtml.includes("tc-pay-notify-btn is-sent is-cooldown is-just-sent") &&
      payRemindedHtml.includes("tc-pay-check") &&
      payRemindedHtml.includes("disabled") &&
      env5.elements.get("toast").innerHTML.includes("Уведомление об оплате отправлено"),
      "expected tc-pay-remind to show animated checkmark confirmation, disable repeat button, and trigger side notification"
    );
    clickAction(env5, { a: "tc-pay-remind", id: "tc-req-1", stuId: "st-alina" });
    await flushMicrotasks(1);
    const tcCabSt = globalThis.EGE._tutorCab.tState();
    assert(
      tcCabSt.lessonPayments &&
      tcCabSt.lessonPayments["tc-req-1"] &&
      tcCabSt.lessonPayments["tc-req-1"].remindCount === 1,
      "expected immediate repeat click on tc-pay-remind to be blocked during 10-minute cooldown"
    );
    const midCooldownHtml = globalThis.EGE._tutorCab.renderLessonPaymentHTML(
      tcCabSt,
      { id: "tc-req-1-cd", payRemindedAt: Date.now() - 3 * 60 * 1000, offerPrice: 1200 },
      null
    );
    assert(
      midCooldownHtml.includes("is-cooldown") &&
      midCooldownHtml.includes("disabled") &&
      midCooldownHtml.includes("Повторно через") &&
      midCooldownHtml.includes('data-tc-pay-remind-cd="tc-req-1-cd"') &&
      /0(?:6:59|7:00)/.test(midCooldownHtml),
      "expected active 10-minute cooldown after toast animation to display live MM:SS countdown"
    );
    const expiredCooldownHtml = globalThis.EGE._tutorCab.renderLessonPaymentHTML(
      tcCabSt,
      { id: "tc-req-1-expired", payRemindedAt: Date.now() - 11 * 60 * 1000, offerPrice: 1200 },
      null
    );
    assert(
      expiredCooldownHtml.includes("Напомнить об оплате ещё раз") &&
      !expiredCooldownHtml.includes("is-cooldown") &&
      !expiredCooldownHtml.includes("disabled"),
      "expected tc-pay-remind button to re-enable cleanly after 10 minutes"
    );
    tcCabSt.lessonPayments["tc-req-1"].remindedAt = Date.now() - 11 * 60 * 1000;
    const req1Pay = globalThis.EGE._tutorCab.findReq("tc-req-1");
    if (req1Pay) req1Pay.payRemindedAt = Date.now() - 11 * 60 * 1000;
    globalThis.EGE._tutorCab.saveState();
    clickAction(env5, { a: "tc-pay-remind", id: "tc-req-1", stuId: "st-alina" });
    await flushMicrotasks(1);
    assert(
      tcCabSt.lessonPayments["tc-req-1"].remindCount === 2,
      "expected tc-pay-remind after 10-minute cooldown to allow resending and increment remindCount"
    );
    const payRemindCssText = readFileText("frontend/styles/marketplace.css");
    assert(
      payRemindCssText.includes(".tc-pay-notify-btn.is-just-sent") &&
      payRemindCssText.includes(".tc-pay-notify-btn.is-cooldown") &&
      payRemindCssText.includes("@keyframes tc-pay-mark-draw"),
      "expected animated checkmark and cooldown CSS rules in marketplace.css"
    );
    clickAction(env5, { a: "tc-lesson-lead-toggle", id: "tc-req-1", stuId: "st-alina", v: "15m" });
    await flushMicrotasks(1);
    const all3LeadsHtml = env5.elements.get("main").innerHTML;
    assert(
      all3LeadsHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="24h" aria-pressed="true"') &&
      all3LeadsHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="1h" aria-pressed="true"') &&
      all3LeadsHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="15m" aria-pressed="true"'),
      "expected selecting 15m timing to allow all 3 timings (24h, 1h, 15m) enabled simultaneously"
    );
    clickAction(env5, { a: "tc-lesson-notify-toggle", id: "tc-req-1", stuId: "st-alina" });
    await flushMicrotasks(1);
    const notifyOffHtml = env5.elements.get("main").innerHTML;
    assert(
      notifyOffHtml.includes('data-a="tc-lesson-notify-toggle" data-id="tc-req-1" data-stu-id="st-alina" aria-pressed="false"') &&
      notifyOffHtml.includes("tc-switch-pill is-anim-off") &&
      notifyOffHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="24h" aria-pressed="false"') &&
      notifyOffHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="1h" aria-pressed="false"') &&
      notifyOffHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="15m" aria-pressed="false"'),
      "expected turning Выкл to clear all 3 lead pills and emit is-anim-off"
    );
    clickAction(env5, { a: "tc-lesson-lead-toggle", id: "tc-req-1", stuId: "st-alina", v: "15m" });
    await flushMicrotasks(1);
    const notifySyncOnHtml = env5.elements.get("main").innerHTML;
    assert(
      notifySyncOnHtml.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="15m" aria-pressed="true"') &&
      notifySyncOnHtml.includes('data-a="tc-lesson-notify-toggle" data-id="tc-req-1" data-stu-id="st-alina" aria-pressed="true"') &&
      notifySyncOnHtml.includes("tc-switch-pill is-on is-anim-on"),
      "expected picking a timing while Выкл to turn Вкл automatically with is-anim-on"
    );
    clickAction(env5, { a: "tc-lesson-notify-toggle", id: "tc-req-1", stuId: "st-alina" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-lesson-notify-toggle", id: "tc-req-1", stuId: "st-alina" });
    await flushMicrotasks(1);
    assert(
      env5.elements.get("main").innerHTML.includes('data-a="tc-lesson-notify-toggle" data-id="tc-req-1" data-stu-id="st-alina" aria-pressed="true"') &&
      env5.elements.get("main").innerHTML.includes("tc-switch-pill is-on is-anim-on") &&
      env5.elements.get("main").innerHTML.includes('data-a="tc-lesson-lead-toggle" data-id="tc-req-1" data-stu-id="st-alina" data-v="15m" aria-pressed="true"'),
      "expected toggling Выкл -> Вкл to restore last selected timings and emit is-anim-on"
    );
    clickAction(env5, { a: "tc-sched-alt-open", id: "tc-req-3" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Предложить ученику другие дни"), "expected tc-sched-alt-open to reveal tutor alternative 1-7 day picker");
    clickAction(env5, { a: "tc-sched-alt-send", id: "tc-req-3" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Предложили ученику"), "expected tc-sched-alt-send to notify student of tutor alternative dates");

    const reqTabHtml = env5.elements.get("main").innerHTML;
    assert(
      !reqTabHtml.includes("Свободные окна") &&
      !reqTabHtml.includes('data-a="tc-slot-toggle"'),
      "expected tutor-home (Заявки) NOT to render Свободные окна once moved into search profiles"
    );

    // Профиль: список профилей с раскрытием редактора и 7-дневных «Свободных окон» внутри карточки по кнопке «Редактировать»
    clickAction(env5, { a: "go", v: "tutor-profile" });
    await flushMicrotasks(2);
    const collapsedProfHtml = env5.elements.get("main").innerHTML;
    assert(
      collapsedProfHtml.includes('id="tc-account-section"') &&
      collapsedProfHtml.includes('id="tc-search-profiles-section"') &&
      collapsedProfHtml.includes('data-a="tc-sp-select" data-id="tc-my-profile"') &&
      collapsedProfHtml.includes("Редактировать") &&
      !collapsedProfHtml.includes('id="tc-sp-editor"') &&
      !collapsedProfHtml.includes('id="tc-sp-slots-box"') &&
      !collapsedProfHtml.includes('data-a="tc-slot-toggle"'),
      "expected search profile editor and Свободные окна to stay collapsed inside card until Редактировать is clicked"
    );
    clickAction(env5, { a: "tc-sp-select", id: "tc-my-profile" });
    await flushMicrotasks(2);
    const tcProfHtml = env5.elements.get("main").innerHTML;
    const activeCardIdx = tcProfHtml.indexOf("tc-sp-card is-active is-editing");
    const editorIdx = tcProfHtml.indexOf('id="tc-sp-editor"');
    const slotsCss = readFileText("frontend/styles/marketplace.css");
    assert(
      activeCardIdx >= 0 &&
      editorIdx > activeCardIdx &&
      !tcProfHtml.includes("Профиль hh") &&
      !tcProfHtml.includes("hh-multi-chips") &&
      !tcProfHtml.includes("tc-skill-toggle") &&
      !tcProfHtml.includes('data-a="tc-autobump-hour"') &&
      !tcProfHtml.includes("sakha-pattern") &&
      tcProfHtml.includes('data-a="tc-sp-close-edit"') &&
      tcProfHtml.includes("Свернуть") &&
      (tcProfHtml.match(/class="day-cir/g) || []).length === 7 &&
      slotsCss.includes(".tc-sp-slots-box .cal-days.is-7days") &&
      slotsCss.includes("grid-template-columns: repeat(7, minmax(0, 1fr))") &&
      tcProfHtml.includes('data-a="tc-bump"') &&
      tcProfHtml.includes("Поднять анкету (раз в 4 ч)") &&
      tcProfHtml.includes("tc-bump-title") &&
      tcProfHtml.includes("Автоподнятие 24 ч активно") &&
      tcProfHtml.includes('data-a="tc-bump-details-toggle"') &&
      tcProfHtml.includes("Подробнее") &&
      tcProfHtml.includes('data-a="tc-autobump-toggle"') &&
      tcProfHtml.includes("tc-switch-pill is-on") &&
      tcProfHtml.includes("tc-prof-compact-card") &&
      tcProfHtml.includes("tc-prof-compact-foot") &&
      tcProfHtml.indexOf("tc-hh-meter") < tcProfHtml.indexOf("tc-prof-preview-btn") &&
      !tcProfHtml.includes('class="card stack tc-profile-form"') &&
      tcProfHtml.includes('class="stack tc-profile-form"') &&
      tcProfHtml.includes("Заполненность профиля") &&
      tcProfHtml.includes("tc-hh-meter") &&
      tcProfHtml.includes("hh-multi-x") &&
      tcProfHtml.includes("Без фото") &&
      tcProfHtml.includes("Якутск") &&
      tcProfHtml.includes("Москва") &&
      tcProfHtml.includes("UTC+9") &&
      tcProfHtml.includes('id="tc-hh-exp"') &&
      tcProfHtml.includes("Стаж, лет") &&
      tcProfHtml.includes("required") &&
      !tcProfHtml.includes("Ср. балл ЕГЭ") &&
      !tcProfHtml.includes('id="tc-hh-avg"') &&
      !tcProfHtml.includes("На 85+ / 100") &&
      !tcProfHtml.includes('id="tc-hh-high"') &&
      tcProfHtml.includes("tc-messengers-box") &&
      tcProfHtml.includes("stu-link-list") &&
      tcProfHtml.includes("stu-link-row is-linked") &&
      tcProfHtml.includes("stu-link-badge") &&
      tcProfHtml.includes("Привязан ✓") &&
      !tcProfHtml.includes("сможем настроить уведомления для вас") &&
      !tcProfHtml.includes('id="tc-hh-vk"') &&
      tcProfHtml.includes('data-a="tc-messenger-open" data-ch="vk"') &&
      tcProfHtml.includes("ВКонтакте") &&
      tcProfHtml.includes("MAX") &&
      tcProfHtml.includes("WhatsApp") &&
      tcProfHtml.includes("Telegram") &&
      !tcProfHtml.includes('id="tc-verification-sec"') &&
      !tcProfHtml.includes('id="tc-diploma-file"') &&
      tcProfHtml.includes('id="tc-sp-slots-box"') &&
      tcProfHtml.includes("Свободные окна") &&
      tcProfHtml.includes('data-a="tc-slot-toggle"'),
      "expected unified Profile builder without document verification block, with required expYears, 4 messenger bindings, and per-profile Свободные окна"
    );
    clickAction(env5, { a: "tc-slot-toggle", hour: "13:00" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes('data-a="tc-slot-toggle" data-hour="13:00" aria-pressed="true"'),
      "expected tc-slot-toggle inside search profile editor to toggle 13:00 slot"
    );
    clickAction(env5, { a: "tc-messenger-open", ch: "vk" });
    await flushMicrotasks(1);
    const vkOpenHtml = env5.elements.get("main").innerHTML;
    assert(
      vkOpenHtml.includes('id="tc-hh-vk"') && vkOpenHtml.includes("stu-link-inline"),
      "expected tc-messenger-open to expand inline input for ВКонтакте"
    );
    EGE.views.tutorCabinet.handleInput({ dataset: { tc: "vk" }, value: "vk.com/anna_ege" });
    clickAction(env5, { a: "tc-messenger-link", ch: "vk" });
    await flushMicrotasks(1);
    const vkLinkedHtml = env5.elements.get("main").innerHTML;
    assert(
      globalThis.EGE._tutorCab.tState().profile.vk === "vk.com/anna_ege" &&
      vkLinkedHtml.includes("vk.com/anna_ege") &&
      !vkLinkedHtml.includes('id="tc-hh-vk"') &&
      env5.elements.get("toast").innerHTML.includes("ВКонтакте") &&
      env5.elements.get("toast").innerHTML.includes("сможем настроить уведомления"),
      "expected linking ВКонтакте in tutor profile to persist handle, render compact linked row, and confirm notifications setup"
    );
    clickAction(env5, { a: "tc-messenger-unlink", ch: "vk" });
    await flushMicrotasks(1);
    const vkUnlinkedHtml = env5.elements.get("main").innerHTML;
    assert(
      globalThis.EGE._tutorCab.tState().profile.vk === "" &&
      vkUnlinkedHtml.includes("Привязать ВКонтакте"),
      "expected unlinking ВКонтакте to clear handle in profile and restore Привязать button"
    );
    clickAction(env5, { a: "tc-bump-details-toggle" });
    await flushMicrotasks(2);
    const tcProfExpanded = env5.elements.get("main").innerHTML;
    assert(tcProfExpanded.includes('data-a="tc-autobump-hour"') && tcProfExpanded.includes("Скрыть"), "expected tc-bump-details-toggle to reveal peak bump hours and Скрыть");
    clickAction(env5, { a: "tc-bump-details-toggle" });
    await flushMicrotasks(2);
    assert(!env5.elements.get("main").innerHTML.includes('data-a="tc-autobump-hour"') && env5.elements.get("main").innerHTML.includes("Подробнее"), "expected second tc-bump-details-toggle click to collapse details");
    clickAction(env5, { a: "tc-bump" });
    await flushMicrotasks(2);
    const bumpedProfHtml = env5.elements.get("main").innerHTML;
    const bumpCssText = readFileText("frontend/styles/marketplace.css");
    assert(
      bumpedProfHtml.includes("✓ Поднята · через") &&
      bumpedProfHtml.includes("data-tc-manual-countdown") &&
      !bumpedProfHtml.includes("btn soft sm tc-bump-manual-btn is-confirmed") &&
      bumpCssText.includes(".btn.tc-bump-manual-btn.is-confirmed:disabled") &&
      bumpCssText.includes("-webkit-text-fill-color") &&
      bumpCssText.includes("opacity: 1") &&
      bumpCssText.includes(".tc-bump-actions { display: flex; align-items: center; gap: 8px; flex-wrap: nowrap; }") &&
      bumpCssText.includes("border-radius: 0; background: transparent; min-width: 0;") &&
      bumpCssText.includes(".tc-prof-compact-foot") &&
      bumpCssText.includes(".tc-msgr-act.is-unlink") &&
      !bumpCssText.includes(".tc-sp-card.is-hidden {\n  opacity: .84; border-style: dashed;") &&
      env5.elements.get("toast").innerHTML.includes("Анкета поднята в топ"),
      "expected tc-bump on profile tab to enter legible high-contrast 4h cooldown state without .btn.soft override and polished profile CSS"
    );
    clickAction(env5, { a: "tc-bump" });
    await flushMicrotasks(2);
    assert(env5.elements.get("toast").innerHTML.includes("Повторить можно через"), "expected immediate second manual bump within 4h to show cooldown message");
    clickAction(env5, { a: "tc-autobump-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Автоподнятие на паузе") && env5.elements.get("main").innerHTML.includes("tc-switch-pill is-anim-off"), "expected 24h auto-bump toggle on profile tab to pause with is-anim-off");
    clickAction(env5, { a: "tc-autobump-toggle" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Автоподнятие 24 ч активно") && env5.elements.get("main").innerHTML.includes("tc-switch-pill is-on is-anim-on"), "expected 24h auto-bump toggle on profile tab to reactivate with is-anim-on");
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

    // Разделение личного аккаунта и множественных поисковых профилей в #tutor-profile
    const splitProfHtml = env5.elements.get("main").innerHTML;
    assert(
      splitProfHtml.includes('id="tc-account-section"') &&
      !splitProfHtml.includes("АККАУНТ ПРЕПОДАВАТЕЛЯ") &&
      !splitProfHtml.includes("Мой аккаунт") &&
      !splitProfHtml.includes("Личные данные, фото, город и мессенджеры едины") &&
      !splitProfHtml.includes('class="card pad stack tc-account-section"') &&
      splitProfHtml.includes('class="stack tc-account-section"') &&
      splitProfHtml.includes('id="tc-search-profiles-section"') &&
      !splitProfHtml.includes('id="tc-students-history"') &&
      !splitProfHtml.includes("История учеников") &&
      !splitProfHtml.includes('data-a="tc-account-save"') &&
      splitProfHtml.includes('data-a="tc-sp-new"') &&
      splitProfHtml.includes('<textarea class="textarea tc-field-wrap" id="tc-hh-headline"') &&
      splitProfHtml.includes('<textarea class="textarea tc-field-wrap" id="tc-hh-edu"') &&
      splitProfHtml.includes('<textarea class="textarea tc-field-wrap" id="tc-hh-skills"'),
      "expected separated Account (#tc-account-section) and Search Profiles (#tc-search-profiles-section) UI with wrapping multiline fields for headline, education, and skills"
    );
    clickAction(env5, { a: "tc-sp-new" });
    await flushMicrotasks(2);
    const newDraftHtml = env5.elements.get("main").innerHTML;
    assert(
      newDraftHtml.includes("Новый профиль для поиска") &&
      newDraftHtml.includes('data-a="tc-sp-cancel-new"') &&
      !newDraftHtml.includes("tc-autobump-card") &&
      newDraftHtml.includes("Свободные окна (0)") &&
      newDraftHtml.includes('data-a="tc-slot-toggle" data-hour="13:00" aria-pressed="false"'),
      "expected tc-sp-new to open new search profile draft editor without autobump card and with isolated empty Свободные окна (0)"
    );
    clickAction(env5, { a: "tc-day", dow: "2" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-slot-toggle", hour: "17:00" });
    await flushMicrotasks(1);
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-profile" }, elements: { headline: { value: "Химия ЕГЭ · 90+ баллов" }, subject: { value: "chem" }, badge0: { value: "К.х.н." }, badge1: { value: "" }, customSkills: { value: "Органика, задача №34" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    const spListState = globalThis.EGE._tutorCab.tState().searchProfiles;
    const spSecondObj = spListState.find((sp) => sp.id !== "tc-my-profile");
    const mktTutor1 = globalThis.EGE.tutors.LIST.find((t) => t.id === "tc-my-profile");
    const mktTutor2 = spSecondObj ? globalThis.EGE.tutors.LIST.find((t) => t.id === spSecondObj.id) : null;
    assert(
      spListState.length === 2 &&
      spSecondObj &&
      spSecondObj.slots &&
      (spSecondObj.slots["2"] || []).includes("17:00") &&
      !(spSecondObj.slots["6"] || []).includes("13:00") &&
      env5.elements.get("main").innerHTML.includes("1 окно") &&
      mktTutor1 && mktTutor1.slots && (mktTutor1.slots[6] || []).includes("13:00") &&
      mktTutor2 && mktTutor2.slots && (mktTutor2.slots[2] || []).includes("17:00") &&
      !(mktTutor2.slots[6] || []).includes("13:00") &&
      spListState.every((sp) => globalThis.EGE.tutors.LIST.some((t) => t.id === sp.id)),
      "expected creating a 2nd search profile to keep independent slots per profile in cabinet state and EGE.tutors.LIST"
    );
    const spSecondId = spSecondObj.id;
    clickAction(env5, { a: "tc-sp-select", id: "tc-my-profile" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-day", dow: "6" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes('data-a="tc-slot-toggle" data-hour="13:00" aria-pressed="true"'),
      "expected switching back to first search profile to show its own 13:00 slot intact"
    );
    clickAction(env5, { a: "tc-sp-toggle-pub", id: spSecondId });
    await flushMicrotasks(2);
    assert(
      !globalThis.EGE.tutors.LIST.some((t) => t.id === spSecondId) &&
      env5.elements.get("main").innerHTML.includes("Скрыт"),
      "expected tc-sp-toggle-pub to hide 2nd profile from catalog while keeping it in tutor cabinet"
    );
    clickAction(env5, { a: "tc-sp-delete-ask", id: spSecondId });
    await flushMicrotasks(2);
    const spDelAskHtml = env5.elements.get("main").innerHTML;
    assert(
      spDelAskHtml.includes('data-a="tc-sp-delete-confirm"') &&
      spDelAskHtml.includes("Удалить профиль?") &&
      spDelAskHtml.includes('data-a="tc-sp-delete-cancel"'),
      "expected inline delete confirmation bar for search profile"
    );
    clickAction(env5, { a: "tc-sp-delete-confirm", id: spSecondId });
    await flushMicrotasks(2);
    assert(
      globalThis.EGE._tutorCab.tState().searchProfiles.length === 1 &&
      !globalThis.EGE.tutors.LIST.some((t) => t.id === spSecondId),
      "expected inline delete confirm to remove 2nd search profile cleanly"
    );
    clickAction(env5, { a: "tc-sp-close-edit" });
    await flushMicrotasks(1);
    assert(
      !env5.elements.get("main").innerHTML.includes('id="tc-sp-editor"') &&
      !env5.elements.get("main").innerHTML.includes('id="tc-sp-slots-box"'),
      "expected tc-sp-close-edit to collapse inline profile editor and slots cleanly"
    );

    // Переключатель «Календарь | Ученики» без лишних заголовков «Живое расписание» и «Календарь записанных учеников»
    const isSunday = new Date().getDay() === 0;
    clickAction(env5, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    if (isSunday) {
      const sunWeekHtml = env5.elements.get("main").innerHTML;
      assert(sunWeekHtml.includes("study-week-day-btn") && sunWeekHtml.includes("is-past"), "expected past weekdays before Sunday on current week to carry is-past grey class");
      clickAction(env5, { a: "tc-day", dow: "1" });
      await flushMicrotasks(2);
      assert(env5.elements.get("main").innerHTML.includes("Прошедший день") && env5.elements.get("main").innerHTML.includes("study-day-panel is-past-week"), "expected selecting Monday before today on current week to show Прошедший день grey view");
      clickAction(env5, { a: "tc-day", dow: "6" });
      await flushMicrotasks(2);
      clickAction(env5, { a: "tc-cal-week-step", delta: "1" });
      await flushMicrotasks(2);
    }
    const tcCalHtml = env5.elements.get("main").innerHTML;
    const calStripStart = tcCalHtml.indexOf('id="tc-week-strip"');
    const calOnlySlice = calStripStart >= 0 ? tcCalHtml.slice(calStripStart) : tcCalHtml;
    assert(
      tcCalHtml.includes('id="tc-students-mode-seg"') &&
      tcCalHtml.includes('data-a="tc-stu-view" data-v="calendar" aria-pressed="true"') &&
      tcCalHtml.includes('data-a="tc-stu-view" data-v="list" aria-pressed="false"') &&
      tcCalHtml.includes('id="tc-week-strip"') &&
      !tcCalHtml.includes('id="tc-students-table"') &&
      !tcCalHtml.includes("Мои ученики и автоуведомления") &&
      !tcCalHtml.includes("Живое расписание") &&
      !tcCalHtml.includes("Календарь записанных учеников") &&
      (calOnlySlice.match(/class="study-week-day-btn/g) || []).length === 7 &&
      calOnlySlice.includes('class="study-lesson-card"') &&
      calOnlySlice.includes("Алина С.") &&
      !calOnlySlice.includes("Тимур К.") &&
      !calOnlySlice.includes("Час закрыт для записи") &&
      !calOnlySlice.includes("cal-sync-card") &&
      calOnlySlice.includes('data-a="tc-cal-import-modal"') &&
      calOnlySlice.includes('data-a="tc-wa-panel-toggle"') &&
      calOnlySlice.includes("Подключиться к Яндекс Телемосту") &&
      calOnlySlice.includes("is-icon-only") &&
      calOnlySlice.includes("Автоуведомление") &&
      calOnlySlice.includes('data-a="tc-lesson-lead-toggle"') &&
      !calOnlySlice.includes("Баллы:") &&
      !calOnlySlice.includes('data-a="tc-student-score"') &&
      !calOnlySlice.includes("+2 б.") &&
      !calOnlySlice.includes("+1 урок") &&
      calOnlySlice.includes('data-a="tc-student-drop-ask"') &&
      calOnlySlice.includes("Убрать ученика") &&
      !calOnlySlice.includes("tc-pay-chip") &&
      calOnlySlice.includes("tc-pay-box is-unpaid") &&
      calOnlySlice.includes("Не оплачено") &&
      calOnlySlice.includes('data-a="tc-pay-remind"') &&
      !calOnlySlice.includes("Отметить оплату") &&
      !calOnlySlice.includes('data-a="tc-pay-toggle"') &&
      calOnlySlice.includes('data-a="tc-cal-week-step" data-delta="-1"') &&
      calOnlySlice.includes('data-a="tc-cal-week-step" data-delta="1"') &&
      calOnlySlice.includes('data-week-swipe="tc"') &&
      !tcCalHtml.includes('class="card pad stack study-cal-card" id="tc-week-strip"') &&
      !calOnlySlice.includes('data-a="tc-bump"'),
      "expected unified unboxed Ученики calendar strip matching student calendar with week step arrows, swipe attribute, confirmed student cards, Telemost button, icon-only logos, automatic payment badge + notify button, auto-notify pills, and 7 day buttons"
    );
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "-1" });
      await flushMicrotasks(2);
    } else if (new Date().getDay() !== 1) {
      assert(calOnlySlice.includes("study-week-day-btn") && calOnlySlice.includes("is-past"), "expected past weekdays before today on current week to carry is-past grey class");
      clickAction(env5, { a: "tc-day", dow: "1" });
      await flushMicrotasks(2);
      assert(env5.elements.get("main").innerHTML.includes("Прошедший день") && env5.elements.get("main").innerHTML.includes("study-day-panel is-past-week"), "expected selecting Monday before today on current week to show Прошедший день grey view");
      clickAction(env5, { a: "tc-day", dow: "6" });
      await flushMicrotasks(2);
    }
    clickAction(env5, { a: "tc-cal-week-step", delta: "-1" });
    await flushMicrotasks(2);
    const tcPastCalHtml = env5.elements.get("main").innerHTML;
    assert(
      tcPastCalHtml.includes("Прошлая неделя") &&
      tcPastCalHtml.includes("study-week-days is-past-week") &&
      tcPastCalHtml.includes("study-lesson-card is-past") &&
      tcPastCalHtml.includes("✓ Проведён") &&
      !tcPastCalHtml.includes("Подключиться к Яндекс Телемосту") &&
      !tcPastCalHtml.includes("Снять с расписания") &&
      !tcPastCalHtml.includes("Убрать ученика"),
      "expected stepping tutor calendar backward to render greyed Прошлая неделя with past lesson history and without live Telemost/cancel controls"
    );
    clickAction(env5, { a: "tc-cal-week-step", delta: "1" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("Эта неделя") && !env5.elements.get("main").innerHTML.includes("study-week-days is-past-week"), "expected stepping forward to restore current week");
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "1" });
      await flushMicrotasks(2);
    }
    clickAction(env5, { a: "tc-cal-open-add", hour: "11:00" });
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes("1% + 1% СБП") && env5.elements.get("main").innerHTML.includes('id="tc-add-fee-note"'), "expected manual booking form to advertise 1% + 1% SBP commission and live 98% payout note");
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-cal-add" }, elements: { studentName: { value: "Максим Р." }, hour: { value: "11:00" }, offerPrice: { value: "1300" }, note: { value: "Генетика №28" } } }) }, preventDefault() {} });
    await flushMicrotasks(2);
    const calAddedHtml = env5.elements.get("main").innerHTML;
    assert(
      calAddedHtml.includes("Максим Р.") &&
      calAddedHtml.includes("Генетика №28") &&
      calAddedHtml.includes("Свой ученик · 1% + 1% СБП") &&
      hasNum(calAddedHtml, "1 274 ₽") &&
      calAddedHtml.includes("tc-switch-track") &&
      calAddedHtml.includes('class="btn-msg is-wa is-hold-add"') &&
      calAddedHtml.includes('class="btn-msg is-tg is-disabled is-hold-add"') &&
      calAddedHtml.includes('class="btn-msg is-max is-disabled is-hold-add"'),
      "expected manually booked student with 1% + 1% SBP fee (98% = 1 274 ₽), sleek toggle switch, green WhatsApp and grey TG/MAX hold-to-add logos"
    );
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "-1" });
      await flushMicrotasks(2);
    }

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

    // Ученики: контакты + автоуведомления и «Убрать ученика» встроены в карточки календаря и выдвижную панель (без баллов и без #tc-students-table)
    clickAction(env5, { a: "go", v: "tutor-students" });
    await flushMicrotasks(2);
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "1" });
      await flushMicrotasks(2);
    }
    const tcStudentsHtml = env5.elements.get("main").innerHTML;
    assert(
      !tcStudentsHtml.includes('id="tc-students-table"') &&
      !tcStudentsHtml.includes("bb-data-table") &&
      !tcStudentsHtml.includes('data-a="tc-bump"') &&
      !tcStudentsHtml.includes("3 колонки") &&
      !tcStudentsHtml.includes("7 колонок") &&
      !tcStudentsHtml.includes("Баллы:") &&
      !tcStudentsHtml.includes("+2 б.") &&
      tcStudentsHtml.includes("+7 (914) 210-05-11") &&
      tcStudentsHtml.includes("@alina_bio") &&
      tcStudentsHtml.includes('data-tc-student="telegram"') &&
      tcStudentsHtml.includes('data-a="tc-student-autochannel"') &&
      tcStudentsHtml.includes('data-a="tc-student-drop-ask"') &&
      tcStudentsHtml.includes("Напомнить (Воскресенье, 10:00)"),
      "expected Мои ученики features embedded in calendar cards without student score box or #tc-students-table"
    );
    clickAction(env5, { a: "tc-wa-panel-toggle" });
    await flushMicrotasks(2);
    const tcStudentsWithWa = env5.elements.get("main").innerHTML;
    assert(
      tcStudentsWithWa.includes('data-a="tc-wa-channel"') &&
      tcStudentsWithWa.includes("tc-wa-global-toggle") &&
      tcStudentsWithWa.includes("Тест в WhatsApp"),
      "expected inline auto-notifications panel to open inside Ученики with channels, global toggle, and WA test link"
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
    await flushMicrotasks(2);
    assert(env5.elements.get("main").innerHTML.includes('data-a="tc-wa-lead" data-v="1h"'), "expected WhatsApp reminder lead toggle without student score widgets");
    clickAction(env5, { a: "tc-student-drop-ask", id: "st-alina" });
    await flushMicrotasks(1);
    const dropAskHtml = env5.elements.get("main").innerHTML;
    assert(
      dropAskHtml.includes('data-a="tc-student-drop-confirm"') &&
      dropAskHtml.includes('data-a="tc-student-drop-cancel"') &&
      dropAskHtml.includes("Убрать ученика? Занятия будут отменены."),
      "expected inline confirmation bar before dropping a student from schedule"
    );
    clickAction(env5, { a: "tc-student-drop-cancel" });
    await flushMicrotasks(1);
    assert(!env5.elements.get("main").innerHTML.includes('data-a="tc-student-drop-confirm"'), "expected cancel to dismiss drop-student confirm");
    const maxReq = globalThis.EGE._tutorCab.tState().requests.find((r) => r && r.studentName === "Максим Р.");
    assert(Boolean(maxReq), "expected manual booking for Максим Р. to exist before drop");
    clickAction(env5, { a: "tc-student-drop-confirm", id: maxReq.id, reqId: maxReq.id, name: "Максим Р." });
    await flushMicrotasks(2);
    assert(
      !env5.elements.get("main").innerHTML.includes("Максим Р.") &&
      env5.elements.get("toast").textContent.includes("Максим Р. убран"),
      "expected tc-student-drop-confirm to drop Максим Р. from schedule cleanly"
    );
    // Переключаемся во второй режим «Ученики»: Текущие / Бывшие, только ученик + кнопка «Подробнее»
    clickAction(env5, { a: "tc-stu-view", v: "list" });
    await flushMicrotasks(2);
    const stuListHtml = env5.elements.get("main").innerHTML;
    assert(
      stuListHtml.includes('id="tc-students-list"') &&
      !stuListHtml.includes('id="tc-week-strip"') &&
      !stuListHtml.includes('id="tc-students-table"') &&
      stuListHtml.includes('data-a="tc-stu-scope" data-v="current" aria-pressed="true"') &&
      stuListHtml.includes('data-a="tc-stu-scope" data-v="past" aria-pressed="false"') &&
      stuListHtml.includes("Алина С.") &&
      stuListHtml.includes("Подробнее") &&
      !stuListHtml.includes("data-stu-detail=") &&
      !stuListHtml.includes("Баллы:") &&
      !stuListHtml.includes("Елена М."),
      "expected compact Ученики list showing only current students with Подробнее until clicked"
    );
    clickAction(env5, { a: "tc-stu-detail", id: "st-alina" });
    await flushMicrotasks(1);
    const stuExpandedHtml = env5.elements.get("main").innerHTML;
    assert(
      stuExpandedHtml.includes('data-stu-detail="st-alina"') &&
      stuExpandedHtml.includes("Текущий ученик") &&
      stuExpandedHtml.includes("Свернуть") &&
      stuExpandedHtml.includes("Убрать ученика") &&
      !stuExpandedHtml.includes("Баллы:"),
      "expected clicking Подробнее to expand student details without score widgets"
    );
    clickAction(env5, { a: "tc-stu-scope", v: "past" });
    await flushMicrotasks(1);
    const stuPastHtml = env5.elements.get("main").innerHTML;
    assert(
      stuPastHtml.includes('data-a="tc-stu-scope" data-v="past" aria-pressed="true"') &&
      stuPastHtml.includes("Елена М.") &&
      stuPastHtml.includes("Максим Р.") &&
      !stuPastHtml.includes("Алина С."),
      "expected Бывшие filter to list former demo student Елена М. and dropped Максим Р."
    );
    clickAction(env5, { a: "tc-stu-detail", id: "st-elena" });
    await flushMicrotasks(1);
    const pastElenaHtml = env5.elements.get("main").innerHTML;
    assert(
      pastElenaHtml.includes("Бывший ученик") &&
      pastElenaHtml.includes('data-a="tc-stu-restore"') &&
      pastElenaHtml.includes('data-a="tc-stu-chat"') &&
      hasNum(pastElenaHtml, "20 304 ₽"),
      "expected expanding former student to show Бывший ученик status, earnings, chat button, and restore button"
    );
    clickAction(env5, { a: "tc-stu-scope", v: "current" });
    clickAction(env5, { a: "tc-stu-view", v: "calendar" });
    await flushMicrotasks(1);
    // Проверяем переход к переписке по клику на бывшего ученика и отсутствие «История учеников» в профиле
    clickAction(env5, { a: "tc-stu-chat", id: "st-elena", name: "Елена М.", exam: "ЕГЭ · Биология", rate: "1200" });
    await flushMicrotasks(2);
    const reopenedChatHtml = env5.elements.get("main").innerHTML;
    assert(
      reopenedChatHtml.includes('id="comm-chat-workspace"') &&
      reopenedChatHtml.includes("Елена М.") &&
      reopenedChatHtml.includes("has-active-thread"),
      "expected clicking former student in Ученики → Бывшие to open direct chat thread for messaging again"
    );
    clickAction(env5, { a: "go", v: "tutor-profile" });
    await flushMicrotasks(2);
    const profNoHistHtml = env5.elements.get("main").innerHTML;
    assert(
      !profNoHistHtml.includes('id="tc-students-history"') &&
      !profNoHistHtml.includes("История учеников"),
      "expected История учеников to be removed from tutor profile"
    );
    clickAction(env5, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(1);
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "-1" });
      await flushMicrotasks(2);
    }

    // Проверка CSS правил: 4-иконочная сетка .tabbar (grid-auto-flow: column), скругление .btn-msg и капсульная обводка .tc-bar-col
    const baseCss = readFileText("ux-ui/styles/base.css");
    const mktCss = readFileText("frontend/styles/marketplace.css");
    assert(
      baseCss.includes("--r-pill: 999px;") &&
      baseCss.includes("grid-auto-flow: column") &&
      !baseCss.includes("repeat(5, minmax(0, 1fr))") &&
      /\.btn-msg\s*\{[^}]*border-radius:\s*999px;/.test(baseCss) &&
      !mktCss.includes(".tc-bar-col.is-active .tc-bar-track::after") &&
      /\.tc-bar-col\.is-active\s*\{[^}]*border-color:\s*var\(--accent\)/.test(mktCss),
      "expected fluid tabbar columns, 999px pill radius on .btn-msg, and capsule outline on .tc-bar-col.is-active"
    );

    // Выплаты и статистика: За всё время / За последний месяц, только 3 KPI, финтех-кошелёк, 1-строчная цель и Подробнее для расчёта/истории
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tcPayoutsHtml = env5.elements.get("main").innerHTML;
    assert(
      !tcPayoutsHtml.includes("← В кабинет") &&
      !tcPayoutsHtml.includes("Финансы преподавателя") &&
      !tcPayoutsHtml.includes("Выплаты и статистика") &&
      tcPayoutsHtml.includes('data-a="tc-payout-scope" data-v="all" aria-pressed="true"') &&
      tcPayoutsHtml.includes('data-a="tc-payout-scope" data-v="month" aria-pressed="false"') &&
      tcPayoutsHtml.includes("tc-payout-summary") &&
      tcPayoutsHtml.includes("Ставка в анкете") &&
      tcPayoutsHtml.includes("Чистый доход (94%)") &&
      tcPayoutsHtml.includes("Проведено уроков") &&
      !tcPayoutsHtml.includes("Новые заявки") &&
      !tcPayoutsHtml.includes("Подтверждено") &&
      !tcPayoutsHtml.includes("Заработано за месяц") &&
      !tcPayoutsHtml.includes("Новый вывод") &&
      tcPayoutsHtml.includes("tc-wallet-card") &&
      tcPayoutsHtml.includes("tc-wallet-amount") &&
      tcPayoutsHtml.includes("tc-goal-row") &&
      tcPayoutsHtml.includes("40 тыс") &&
      tcPayoutsHtml.includes("90 тыс") &&
      tcPayoutsHtml.includes("Своя цель") &&
      !tcPayoutsHtml.includes("bid-fee-row") &&
      !tcPayoutsHtml.includes('id="tc-payout-history"') &&
      tcPayoutsHtml.includes("Статистика преподавателя") &&
      tcPayoutsHtml.includes("tc-bar-chart is-lollipop") &&
      tcPayoutsHtml.includes("--bar-count:7") &&
      !tcPayoutsHtml.includes('data-a="tc-chart-style"') &&
      tcPayoutsHtml.includes("Цель дохода на месяц") &&
      !tcPayoutsHtml.includes('data-a="tc-bump"') &&
      !tcPayoutsHtml.includes("3 колонки") &&
      !tcPayoutsHtml.includes("7 колонок"),
      "expected redesigned Выплаты with all-time default scope, 3 KPIs, fintech wallet, 1-row goals, and collapsed fee/history details"
    );
    clickAction(env5, { a: "tc-payout-scope", v: "month" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes("за последний месяц") && env5.elements.get("main").innerHTML.includes('data-a="tc-payout-scope" data-v="month" aria-pressed="true"'), "expected tc-payout-scope=month to switch tiles to last month");
    clickAction(env5, { a: "tc-payout-scope", v: "all" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-payout-rate-toggle" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes("tc-rate-edit-box") && env5.elements.get("main").innerHTML.includes('data-a="tc-rate-step"'), "expected clicking Ставка в анкете to expand inline rate editor");
    clickAction(env5, { a: "tc-payout-rate-toggle" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-goal-custom-toggle" });
    await flushMicrotasks(1);
    env5.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tc-goal-custom" }, elements: { goal: { value: "75000" } } }) }, preventDefault() {} });
    await flushMicrotasks(1);
    assert(hasNum(env5.elements.get("main").innerHTML, "75 000 ₽"), "expected custom goal form tc-goal-custom to update monthly goal");
    clickAction(env5, { a: "tc-fee-details-toggle" });
    await flushMicrotasks(1);
    clickAction(env5, { a: "tc-history-details-toggle" });
    await flushMicrotasks(1);
    assert(env5.elements.get("main").innerHTML.includes("bid-fee-row") && env5.elements.get("main").innerHTML.includes('id="tc-payout-history"'), "expected Подробнее toggles to expand fee breakdown and payout history");
    clickAction(env5, { a: "tc-stats-period", v: "30d" });
    await flushMicrotasks(2);
    const tcStats30Html = env5.elements.get("main").innerHTML;
    assert(
      tcStats30Html.includes("прогноз за месяц") &&
      tcStats30Html.includes("tc-bar-chart is-lollipop is-scroll") &&
      tcStats30Html.includes("--bar-count:30") &&
      tcStats30Html.includes("Листайте влево и вправо") &&
      (tcStats30Html.match(/class="tc-bar-col"/g) || []).length === 30,
      "expected 30d period switch to render 30-day horizontally scrollable lollipop chart with 30 bars"
    );

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
      bbPayHtml.includes("Проведено · 94% / 5% + 1%") &&
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
    const payoutSbpHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      payoutSbpHtml.includes('id="tc-payout-title"') &&
      payoutSbpHtml.includes('data-f="tc-payout"') &&
      payoutSbpHtml.includes("bal-flat-sec") &&
      payoutSbpHtml.includes("ygo-pay-rail") &&
      payoutSbpHtml.includes("<b>СБП</b>") &&
      payoutSbpHtml.includes('viewBox="0 0 266 325"') &&
      payoutSbpHtml.includes("#4286C5") &&
      payoutSbpHtml.includes("#C72C54") &&
      payoutSbpHtml.includes("ygo-mir-svg") &&
      payoutSbpHtml.includes("bal-amount-box") &&
      payoutSbpHtml.includes("bal-submit-btn") &&
      !payoutSbpHtml.includes('data-a="tc-payout-chip"') &&
      payoutSbpHtml.includes(`value="${wBefore.availableRub}"`) &&
      payoutSbpHtml.includes("Чек самозанятого") &&
      payoutSbpHtml.includes('id="tc-payout-npd-chk"') &&
      payoutSbpHtml.includes('name="npdReceipt"') &&
      !payoutSbpHtml.includes('disabled aria-disabled="true"') &&
      payoutSbpHtml.includes('id="tc-payout-inn"') &&
      payoutSbpHtml.includes('data-a="tc-payout-check-inn"') &&
      payoutSbpHtml.includes("ФНС «Мой налог»"),
      "expected redesigned flat Yandex Go + exact SBP & MIR SVG payout modal with enabled Чек самозанятого (ФНС Мой налог) and INN input"
    );
    clickAction(env5, { a: "tc-payout-method", v: "card" });
    await flushMicrotasks(1);
    const payoutCardHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      payoutCardHtml.includes('id="tc-payout-card"') &&
      payoutCardHtml.includes("ygo-bank-card") &&
      payoutCardHtml.includes("ygo-mir-svg") &&
      payoutCardHtml.includes("Т-Банк"),
      "expected switching payout method to card to render dark Yandex Go card box with MIR SVG and T-Bank detection"
    );
    clickAction(env5, { a: "tc-payout-method", v: "sbp" });
    env5.emitDoc("input", { target: { dataset: { tcPayout: "inn" }, value: "123" } });
    clickAction(env5, { a: "tc-payout-check-inn" });
    await flushMicrotasks(1);
    assert(env5.elements.get("modal-root").innerHTML.includes("tc-npd-status is-err"), "expected invalid 12-digit INN check to display inline error message");
    env5.emitDoc("input", { target: { dataset: { tcPayout: "inn" }, value: "500100732259" } });
    clickAction(env5, { a: "tc-payout-check-inn" });
    await flushMicrotasks(1);
    assert(env5.elements.get("modal-root").innerHTML.includes("tc-npd-status is-ok"), "expected valid 12-digit INN checksum check to show confirmation status");
    env5.emitDoc("input", { target: { dataset: { tcPayout: "amount" }, value: "5000" } });
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
    const topNotifsEl = env5.elements.get("top-notifs");
    const topNotifsCntEl = env5.elements.get("top-notifs-cnt");
    const countBeforeRemove = Number(topNotifsCntEl.textContent) || 0;
    assert(
      topNotifsCntEl.hidden === false &&
      countBeforeRemove >= 2 &&
      (topNotifsEl.classList.contains("is-ring-a") || topNotifsEl.classList.contains("is-ring-b")) &&
      (topNotifsCntEl.classList.contains("is-pop-a") || topNotifsCntEl.classList.contains("is-pop-b")),
      "expected simultaneous payout notifications to keep badge >= 2 and trigger ringing bell + popping counter animations"
    );
    clickAction(env5, { a: "notif-open" });
    await flushMicrotasks(1);
    const notifSheetHtml = env5.elements.get("modal-root").innerHTML;
    assert(
      notifSheetHtml.includes('id="notif-modal-title"') &&
      notifSheetHtml.includes("Заявка на вывод оформлена") &&
      notifSheetHtml.includes("Уведомление об оплате отправлено") &&
      notifSheetHtml.includes("notif-inbox-item") &&
      notifSheetHtml.includes('data-notif-id="') &&
      notifSheetHtml.includes('data-a="notif-remove"') &&
      notifSheetHtml.includes('data-a="notif-clear"') &&
      notifSheetHtml.includes('data-a="notif-close"'),
      "expected clicking top bell button to open notifications sheet with real inbox items and close/remove controls"
    );
    const makeSwipeCard = (nid) => {
      const cls = new Set(["notif-inbox-item"]);
      return {
        dataset: { notifId: nid },
        offsetWidth: 320,
        style: { transform: "", opacity: "", transitionDelay: "" },
        classList: {
          add(c) { cls.add(c); },
          remove(c) { cls.delete(c); },
          contains(c) { return cls.has(c); }
        },
        closest(sel) { return sel && sel.includes(".notif-inbox-item") ? this : null; }
      };
    };
    const snapCard = makeSwipeCard("swipe-snap-noop");
    env5.emitDoc("touchstart", { target: snapCard, touches: [{ clientX: 180, clientY: 100 }] });
    env5.emitDoc("touchmove", { touches: [{ clientX: 205, clientY: 102 }], cancelable: true, preventDefault() {} });
    env5.emitDoc("touchend", {});
    assert(
      !snapCard.classList.contains("is-dismiss-left") &&
      !snapCard.classList.contains("is-dismiss-right") &&
      !snapCard.classList.contains("is-swiping") &&
      snapCard.style.transform === "",
      "expected short horizontal drag on notification card to snap back without dismissing"
    );
    const leftCard = makeSwipeCard("swipe-left-noop");
    env5.emitDoc("touchstart", { target: leftCard, touches: [{ clientX: 200, clientY: 100 }] });
    env5.emitDoc("touchmove", { touches: [{ clientX: 80, clientY: 103 }], cancelable: true, preventDefault() {} });
    assert(leftCard.classList.contains("is-swiping") && leftCard.style.transform === "translateX(-120px)", "expected horizontal touch swipe drag to track notification card");
    env5.emitDoc("touchend", {});
    assert(leftCard.classList.contains("is-dismiss-left") && !leftCard.classList.contains("is-swiping"), "expected left swipe release past threshold to add is-dismiss-left");
    const rightCard = makeSwipeCard("swipe-right-noop");
    env5.emitDoc("pointerdown", { target: rightCard, pointerType: "mouse", button: 0, pointerId: 7, clientX: 120, clientY: 100 });
    env5.emitDoc("pointermove", { pointerType: "mouse", pointerId: 7, clientX: 245, clientY: 104, cancelable: true, preventDefault() {} });
    env5.emitDoc("pointerup", { pointerType: "mouse", pointerId: 7, clientX: 245, clientY: 104 });
    assert(rightCard.classList.contains("is-dismiss-right") && !rightCard.classList.contains("is-swiping"), "expected right pointer swipe release past threshold to add is-dismiss-right");
    const mktCssText = readFileText("frontend/styles/marketplace.css");
    const appJsText = readFileText("frontend/app.js");
    assert(
      mktCssText.includes(".notif-inbox-item.is-dismiss-left") &&
      mktCssText.includes(".notif-inbox-item.is-dismiss-right") &&
      mktCssText.includes("touch-action: pan-y") &&
      appJsText.includes("clearAllNotifsAnimated") &&
      appJsText.includes("transitionDelay"),
      "expected swipe-dismiss CSS classes and staggered cascade clear animation hooks"
    );
    const firstNotifMatch = /data-a="notif-remove" data-id="([^"]+)"/.exec(notifSheetHtml);
    assert(firstNotifMatch, "expected notif-remove button with notification id");
    clickAction(env5, { a: "notif-remove", id: firstNotifMatch[1] });
    await flushMicrotasks(1);
    assert(
      Number(env5.elements.get("top-notifs-cnt").textContent) === countBeforeRemove - 1 &&
      !env5.elements.get("modal-root").innerHTML.includes(`data-notif-id="${firstNotifMatch[1]}"`),
      "expected notif-remove to delete individual notification and decrement bell counter"
    );
    clickAction(env5, { a: "notif-clear" });
    await flushMicrotasks(1);
    assert(
      env5.elements.get("modal-root").innerHTML.includes("Уведомлений пока нет") &&
      env5.elements.get("top-notifs-cnt").hidden === true &&
      env5.elements.get("side-notifs-cnt").hidden === true,
      "expected notif-clear to empty notifications inbox and hide unread bell badges"
    );
    clickAction(env5, { a: "notif-close" });
    await flushMicrotasks(1);
    assert(!env5.elements.get("modal-root").innerHTML.trim(), "expected notif-close to dismiss notifications modal");
    clickAction(env5, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tutorFeesHtml = env5.elements.get("main").innerHTML;
    assert(tutorFeesHtml.includes("История выводов средств") && tutorFeesHtml.includes('id="tc-payout-history"') && hasNum(tutorFeesHtml, "5 000 ₽"), "expected new 5 000 ₽ withdrawal row rendered inside История выводов средств on /fees");

    clickAction(env5, { a: "role-set", role: "student" });
    await flushMicrotasks(4);
    assert(env5.elements.get("main").innerHTML.includes("comm-head-seg") && env5.elements.get("tutor-balance-dock").hidden === true, "expected role-set back to student to return cleanly to Общение and hide teacher balance dock");

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

    // Переключаемся в кабинет преподавателя и проверяем чистую шапку (без rt-status-pill) + чистый календарь + импорт .ics / Занято в GCal
    clickAction(env5, { a: "role-set", role: "tutor" });
    await flushMicrotasks(3);
    const tutorCabHtml = env5.elements.get("main").innerHTML;
    assert(tutorCabHtml.includes("Входящие заявки учеников") && !tutorCabHtml.includes("rt-status-pill"), "expected clean tutor requests view without rt-status-pill in header");
    assert(env5.elements.get("side-nav").innerHTML.includes(`>${pendingBeforeBid + 1}<`), "expected updated Заявки badge count in tutor sidebar navigation");
    clickAction(env5, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    const calDefaultHtml = env5.elements.get("main").innerHTML;
    assert(!calDefaultHtml.includes("cal-sync-card") && calDefaultHtml.includes('data-a="tc-cal-import-modal"'), "expected clean default calendar without .cal-sync-card and with tc-cal-import-modal CTA");
    clickAction(env5, { a: "tc-cal-import-modal" });
    await flushMicrotasks(2);
    assert(
      env5.elements.get("main").innerHTML.includes('data-f="tc-cal-import"') &&
      env5.elements.get("main").innerHTML.includes('id="tc-ics-file"') &&
      env5.elements.get("main").innerHTML.includes('data-a="tc-cal-import-sample"'),
      "expected tc-cal-import-modal to reveal tc-cal-import form, .ics file upload input, and sample CTA"
    );
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "1" });
      await flushMicrotasks(2);
    }
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
    if (isSunday) {
      clickAction(env5, { a: "tc-cal-week-step", delta: "-1" });
      await flushMicrotasks(2);
    }

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

    // 9. Проверка EGE.api, изоляции ux-ui/* (Zero API / Zero Business Data) и отсутствия клиентской админки
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
      globalThis.EGE.api.media && typeof globalThis.EGE.api.media.uploadAvatar === "function" &&
      globalThis.EGE.api.verifications &&
      typeof globalThis.EGE.api.verifications.list === "function" &&
      typeof globalThis.EGE.api.verifications.upload === "function" &&
      !globalThis.EGE.api.admin &&
      !(globalThis.EGE.views && globalThis.EGE.views.admin),
      "expected centralized window.EGE.api module without public admin client or EGE.views.admin"
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

    // Попытка переключиться на удалённую роль admin безопасно оставляет в роли student
    clickAction(env5, { a: "role-set", role: "admin" });
    await flushMicrotasks(3);
    assert(
      env5.elements.get("main").innerHTML.includes("comm-head-seg") &&
      env5.elements.get("side-subjects-wrap").hidden === false &&
      !env5.elements.get("side-foot").innerHTML.includes("side-admin-pill"),
      "expected role-set=admin to fall back safely to student view without side-admin-pill"
    );

    // Проверка отсутствия переключателя 3/7 колонок в таблицах ученика (/study и /market)
    clickAction(env5, { a: "go", v: "study" });
    await flushMicrotasks(3);
    assert(!env5.elements.get("main").innerHTML.includes("3 колонки") && !env5.elements.get("main").innerHTML.includes("7 колонок"), "expected student /study tables to hide 3/7 cols switch");

    // 10. Проверка разделения на 2 отдельных сайта (HOST_SITE: student / tutor)
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
      envSiteStu.elements.get("main").innerHTML.includes("comm-head-seg") && envSiteStu.elements.get("main").innerHTML.includes('id="comm-chat-workspace"') &&
      envSiteStu.elements.get("side-foot").innerHTML.includes("side-site-links") &&
      !envSiteStu.elements.get("side-foot").innerHTML.includes('href="/admin"') &&
      envSiteStu.elements.get("tutor-balance-dock").hidden === true,
      "expected site=student to render Главная, .side-site-links without /admin, and hidden #tutor-balance-dock"
    );

    const envSiteTut = installGlobals({ host: { backend: true, site: "tutor" }, fetch: mkAuthedFetch() });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    assert(
      envSiteTut.elements.get("main").innerHTML.includes("Входящие заявки учеников") &&
      envSiteTut.elements.get("side-foot").innerHTML.includes("side-site-links") &&
      !envSiteTut.elements.get("side-foot").innerHTML.includes('href="/admin"') &&
      envSiteTut.elements.get("side-foot").innerHTML.includes("side-tutor-bal") &&
      envSiteTut.elements.get("tutor-balance-dock").hidden === true,
      "expected site=tutor to render cabinet, .side-site-links without /admin, #side-balance-slot tutor balance, and hidden #tutor-balance-dock"
    );

    // 11. Проверка баннера cookies, модалки настроек, 152-ФЗ в профиле и согласия при оплате
    const envLegal = installGlobals({ host: { backend: true, site: "student" }, fetch: mkAuthedFetch() });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    const cookieBannerEl = envLegal.elements.get("cookie-banner");
    assert(
      cookieBannerEl.hidden === false &&
      cookieBannerEl.innerHTML.includes('data-a="cookie-accept-all"') &&
      cookieBannerEl.innerHTML.includes('Принять всё') &&
      cookieBannerEl.innerHTML.includes('data-a="cookie-settings"') &&
      cookieBannerEl.innerHTML.includes('Подробнее') &&
      !cookieBannerEl.innerHTML.includes('data-a="cookie-accept-necessary"'),
      "expected initial render without stored consent to display #cookie-banner with strictly 2 actions (Принять всё, Подробнее)"
    );
    clickAction(envLegal, { a: "cookie-settings" });
    await flushMicrotasks(2);
    const cookieModalHtml = envLegal.elements.get("modal-root").innerHTML;
    assert(
      cookieBannerEl.hidden === true &&
      cookieModalHtml.includes('id="cookie-modal-title"') &&
      cookieModalHtml.includes('class="sheet-foot cookie-modal-foot"') &&
      cookieModalHtml.includes('role="switch"') &&
      cookieModalHtml.includes('cookie-switch-track') &&
      cookieModalHtml.includes('Включено') &&
      cookieModalHtml.includes('Выключено') &&
      cookieModalHtml.includes('data-a="cookie-toggle-analytics"') &&
      cookieModalHtml.includes('data-a="cookie-accept-necessary"') &&
      cookieModalHtml.includes('data-a="cookie-save-custom"') &&
      !cookieModalHtml.includes('data-a="cookie-accept-all"'),
      "expected cookie-settings to open cookie preferences sheet with sliding switches and strictly 2 footer buttons"
    );
    clickAction(envLegal, { a: "cookie-toggle-analytics" });
    await flushMicrotasks(1);
    clickAction(envLegal, { a: "cookie-save-custom" });
    await flushMicrotasks(3);
    assert(
      !envLegal.elements.get("modal-root").innerHTML.includes('id="cookie-modal-title"') &&
      cookieBannerEl.hidden === true &&
      String(envLegal.lsMap["vektor-ege:cookie-consent:v1"] || "").includes('"analytics":false') &&
      globalThis.document.documentElement.dataset.cookieAnalytics === "0",
      "expected cookie-save-custom to close modal, persist consent to localStorage, keep banner hidden, and set dataset.cookieAnalytics=0"
    );

    clickAction(envLegal, { a: "go", v: "profile" });
    await flushMicrotasks(3);
    const profLegalHtml = envLegal.elements.get("main").innerHTML;
    assert(
      profLegalHtml.includes('id="stu-legal-card"') &&
      profLegalHtml.includes("Cookies: только необходимые") &&
      profLegalHtml.includes('href="/terms"') &&
      profLegalHtml.includes('href="/refunds"') &&
      profLegalHtml.includes('href="/privacy"'),
      "expected student profile to render #stu-legal-card with current cookie state and legal links"
    );
    clickAction(envLegal, { a: "cookie-accept-all" });
    await flushMicrotasks(3);
    assert(
      globalThis.document.documentElement.dataset.cookieAnalytics === "1" &&
      envLegal.elements.get("main").innerHTML.includes("Cookies: необходимые + аналитика включена"),
      "expected cookie-accept-all to enable analytics dataset flag and update profile status"
    );
    clickAction(envLegal, { a: "bal-open" });
    await flushMicrotasks(2);
    const balLegalHtml = envLegal.elements.get("modal-root").innerHTML;
    assert(
      balLegalHtml.includes("bal-legal-note") &&
      balLegalHtml.includes('href="/terms"') &&
      balLegalHtml.includes('href="/refunds"') &&
      balLegalHtml.includes('href="/privacy"'),
      "expected balance topup modal to display .bal-legal-note linking /terms, /refunds, and /privacy"
    );

    // 12. Тишина колокольчика при обычных кликах, анимация нажатия и уведомление по клику в WhatsApp
    clickAction(envLegal, { a: "bal-close" });
    await flushMicrotasks(1);
    const routineClasses = new Set(["btn", "soft"]);
    const makeRoutineTarget = (a, extra) => ({
      tagName: "BUTTON",
      dataset: Object.assign({ a }, extra || {}),
      classList: {
        add(c) { routineClasses.add(c); },
        remove(c) { routineClasses.delete(c); },
        contains(c) { return routineClasses.has(c); }
      },
      closest(sel) {
        if (!sel) return null;
        if (sel.includes("[data-a]") || sel.includes("button") || sel.includes(".btn")) return this;
        return null;
      }
    });
    const themeBtn = makeRoutineTarget("theme-toggle");
    envLegal.emitDoc("click", { target: themeBtn, preventDefault() {} });
    await flushMicrotasks(2);
    assert(routineClasses.has("is-tap-pulse"), "expected clicking button to apply .is-tap-pulse tactile feedback class");
    clickAction(envLegal, { a: "go", v: "market" });
    clickAction(envLegal, { a: "mkt-quick-eng" });
    clickAction(envLegal, { a: "mkt-reset" });
    await flushMicrotasks(3);
    assert(
      envLegal.elements.get("top-notifs-cnt").hidden === true &&
      envLegal.elements.get("side-notifs-cnt").hidden === true,
      "expected routine theme/navigation/filter button clicks NOT to spam notification bell"
    );

    const waClasses = new Set(["btn-msg", "is-wa", "is-hold-add"]);
    const waTarget = {
      tagName: "A",
      href: "https://wa.me/79142100500",
      dataset: { holdCh: "wa", tutorName: "Анна Соколова" },
      getAttribute(k) { return k === "href" ? this.href : null; },
      classList: {
        add(c) { waClasses.add(c); },
        remove(c) { waClasses.delete(c); },
        contains(c) { return waClasses.has(c); }
      },
      closest(sel) {
        if (!sel) return null;
        if (sel.includes("a.btn-msg") || sel.includes(".btn-msg") || sel.includes("button")) return this;
        return null;
      }
    };
    envLegal.emitDoc("click", { target: waTarget, preventDefault() {} });
    await flushMicrotasks(2);
    assert(
      envLegal.elements.get("toast").innerHTML.includes("Написали в WhatsApp") &&
      envLegal.elements.get("toast").innerHTML.includes("Анна Соколова") &&
      envLegal.elements.get("top-notifs-cnt").hidden === false &&
      envLegal.elements.get("top-notifs-cnt").textContent === "1",
      "expected clicking active WhatsApp button to show Написали в WhatsApp notification and increment bell count to 1"
    );
    clickAction(envLegal, { a: "notif-open" });
    await flushMicrotasks(1);
    assert(
      envLegal.elements.get("modal-root").innerHTML.includes("Написали в WhatsApp") &&
      envLegal.elements.get("modal-root").innerHTML.includes("Анна Соколова"),
      "expected WhatsApp outreach notification inside notification bell inbox"
    );

    // 13. Продакшн-режим (demoMode: false) и удаление / выгрузка ПДн (152-ФЗ)
    let prodDeleteCalled = false;
    let prodExportCalled = false;
    const prodFetch = async (url, opts) => {
      const method = (opts && opts.method) || "GET";
      if (url === "/api/me" && method === "GET") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            user: { id: 42, username: "prod_stu", displayName: "Продакшн Ученик", authProvider: "local" },
            ai: { enabled: false },
            inviteRequired: false,
            demoMode: false,
            providers: { local: true, phone: true, google: false }
          })
        };
      }
      if (url === "/api/me/export") {
        prodExportCalled = true;
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ schema: "vektor-ege-personal-data-v1", legalBasis: "152-FZ", account: { id: 42, username: "prod_stu" } })
        };
      }
      if (url === "/api/me" && method === "DELETE") {
        prodDeleteCalled = true;
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ ok: true, deleted: true, userId: 42 })
        };
      }
      if (url === "/api/docs") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({ docs: {} })
        };
      }
      if (url === "/api/market/state") {
        return {
          ok: true,
          status: 200,
          headers: { get: () => "application/json" },
          json: async () => ({
            ok: true,
            authenticated: true,
            wallet: { balanceRub: 5000, initialPaid: true, planId: "trial5k" },
            bookings: [{
              id: "bk-prod-1",
              tutorId: "tut-sokolova",
              tutorName: "Анна Соколова",
              subject: "eng",
              subjectName: "Английский язык",
              exam: "ЕГЭ",
              format: "Онлайн",
              city: "Якутск",
              dayIso: "2026-11-26",
              dayLabel: "Чт, 26 нояб.",
              hour: "16:00",
              offerPrice: 1200,
              tutorPrice: 1200,
              status: "pending"
            }]
          })
        };
      }
      return {
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => ({ ok: true })
      };
    };
    const envProd = installGlobals({ host: { backend: true, site: "student", demoMode: false }, fetch: prodFetch });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envProd, { a: "comm-tab", tab: "bids" });
    await flushMicrotasks(4);
    const prodHomeHtml = envProd.elements.get("main").innerHTML;
    assert(
      prodHomeHtml.includes("bk-prod-1") &&
      prodHomeHtml.includes("Ожидаем ответ преподавателя") &&
      !prodHomeHtml.includes('data-a="mkt-sim-accept"'),
      "expected production demoMode=false to hide mkt-sim-accept button on pending student bookings"
    );
    clickAction(envProd, { a: "mkt-sim-accept", id: "bk-prod-1" });
    await flushMicrotasks(3);
    assert(
      envProd.elements.get("main").innerHTML.includes("Ожидаем ответ преподавателя") &&
      envProd.elements.get("toast").textContent.includes("преподаватель"),
      "expected production mkt-sim-accept handler to reject student self-confirm"
    );

    clickAction(envProd, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    const prodProfHtml = envProd.elements.get("main").innerHTML;
    assert(
      prodProfHtml.includes('data-a="account-export"') &&
      prodProfHtml.includes('data-a="account-delete-ask"'),
      "expected #stu-legal-card to render 152-FZ personal data export and account delete buttons"
    );
    clickAction(envProd, { a: "account-export" });
    await flushMicrotasks(4);
    assert(
      prodExportCalled &&
      envProd.elements.get("main").innerHTML.includes("vektor-ege-personal-data-v1"),
      "expected account-export to call GET /api/me/export and populate JSON bundle"
    );
    clickAction(envProd, { a: "account-delete-ask" });
    await flushMicrotasks(2);
    assert(
      envProd.elements.get("main").innerHTML.includes('id="stu-delete-account-confirm"') &&
      envProd.elements.get("main").innerHTML.includes('data-a="account-delete-do"'),
      "expected account-delete-ask to show inline #stu-delete-account-confirm confirmation"
    );
    clickAction(envProd, { a: "account-delete-do" });
    await flushMicrotasks(6);
    assert(
      prodDeleteCalled &&
      !envProd.lsMap["vektor-ege:v1"] &&
      !envProd.lsMap["vektor-ege:market"] &&
      envProd.elements.get("toast").textContent.includes("удалены"),
      "expected account-delete-do to call DELETE /api/me, clear localStorage, and notify user"
    );

    // Production OTP modal must never render hardcoded 4829 demo push
    const envProdOtp = installGlobals({
      host: { backend: true, site: "student", demoMode: false },
      fetch: async (url) => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => {
          if (url === "/api/me") return { user: null, demoMode: false, providers: { local: true, phone: true } };
          if (url === "/api/auth/phone/send") return { ok: true, phone: "+7 (914) 210-05-11", digits: "79142100511", channel: "wa", channelName: "WhatsApp", demoMode: false };
          return { ok: true };
        }
      })
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    clickAction(envProdOtp, { a: "auth-open" });
    await flushMicrotasks(2);
    envProdOtp.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: { phone: { value: "+7 (914) 210-05-11" } }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(6);
    const prodOtpModalHtml = envProdOtp.elements.get("modal-root").innerHTML;
    assert(
      prodOtpModalHtml.includes('id="cv-d0"') &&
      !prodOtpModalHtml.includes("cv-demo-push") &&
      !prodOtpModalHtml.includes('data-a="cv-autofill"') &&
      !prodOtpModalHtml.includes("4829"),
      "expected production OTP verify modal to omit cv-demo-push, cv-autofill, and hardcoded 4829"
    );

    // 14. Профильная привязка Telegram-бота (deep link и тумблер уведомлений)
    let tgLinked = false;
    let tgNotifs = true;
    const envTgBot = installGlobals({
      host: { backend: true, site: "student" },
      fetch: async (url, opts) => {
        const method = (opts && opts.method) || "GET";
        if (url === "/api/me") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              user: { id: 77, username: "tg_bot_stu", displayName: "Тимур Б.", authProvider: "local" },
              telegramBotUsername: "vektor_ege_bot",
              ai: { enabled: false },
              providers: { local: true, phone: true, telegram: true }
            })
          };
        }
        if (url === "/api/docs") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ docs: {} }) };
        }
        if (url === "/api/telegram/link-token" && method === "POST") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, token: "demo123", botUsername: "vektor_ege_bot", deepLink: "https://t.me/vektor_ege_bot?start=link_demo123", expiresInSec: 900 })
          };
        }
        if (url === "/api/telegram/status") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              linked: tgLinked,
              botUsername: "vektor_ege_bot",
              binding: tgLinked ? { chatId: "7707", telegramUsername: "timur_tg", notificationsEnabled: tgNotifs } : null
            })
          };
        }
        if (url === "/api/telegram/notifications" && method === "PATCH") {
          tgNotifs = !tgNotifs;
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, binding: { chatId: "7707", telegramUsername: "timur_tg", notificationsEnabled: tgNotifs } })
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envTgBot, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    assert(
      envTgBot.elements.get("main").innerHTML.includes('data-a="pf-link-tg-bot"'),
      "expected student profile to show Подключить бота button when telegramBotUsername is configured"
    );
    clickAction(envTgBot, { a: "pf-link-tg-bot" });
    await flushMicrotasks(4);
    assert(
      envTgBot.elements.get("main").innerHTML.includes('id="pf-tg-bot-link-box"') &&
      envTgBot.elements.get("main").innerHTML.includes("https://t.me/vektor_ege_bot?start=link_demo123"),
      "expected clicking pf-link-tg-bot to display Telegram deep link card"
    );
    tgLinked = true;
    clickAction(envTgBot, { a: "pf-tg-check" });
    await flushMicrotasks(4);
    assert(
      envTgBot.elements.get("main").innerHTML.includes("Бот активен ✓") &&
      envTgBot.elements.get("main").innerHTML.includes('data-a="pf-tg-notify-toggle"'),
      "expected pf-tg-check after /start to show Бот активен and notification toggle button"
    );

    // 15. Кнопки «Для ученика» / «Для преподавателя» и ?auth=register открывают соответствующую регистрацию
    const anonFetch = async (url) => ({
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      json: async () => {
        if (url === "/api/me") return { user: null, providers: { local: true, phone: true, google: true, telegram: true } };
        if (url === "/api/market/directions") return { ok: true, directions: [] };
        return { ok: true };
      }
    });
    const envRegLinks = installGlobals({ host: { backend: true }, fetch: anonFetch });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);

    clickAction(envRegLinks, { a: "auth-register-open", role: "student" });
    await flushMicrotasks(3);
    const stuRegModal = envRegLinks.elements.get("modal-root").innerHTML;
    assert(
      stuRegModal.includes("Регистрация ученика") &&
      stuRegModal.includes('data-a="auth-tab" data-tab="register" aria-pressed="true"') &&
      stuRegModal.includes('data-a="auth-role" data-role="student" aria-pressed="true"') &&
      stuRegModal.includes('class="icon-btn sm auth-close-btn"') &&
      stuRegModal.includes('data-a="auth-modal-close"'),
      "expected auth-register-open[role=student] to open student registration modal with desktop close button"
    );

    clickAction(envRegLinks, { a: "auth-modal-close" });
    await flushMicrotasks(2);
    assert(envRegLinks.elements.get("modal-root").innerHTML === "", "expected desktop auth-close-btn click to close auth modal");

    const baseModalCss = readFileText("ux-ui/styles/base.css");
    const mktModalCss = readFileText("frontend/styles/marketplace.css");
    assert(
      baseModalCss.includes("background: var(--surface); color: var(--ink);") &&
      mktModalCss.includes(".sheet-body.auth-modal-shell .h2 { color: var(--ink); }") &&
      mktModalCss.includes(".auth-close-btn {"),
      "expected .modal-card and auth modal heading to explicitly lock ink contrast and desktop .auth-close-btn styles"
    );

    clickAction(envRegLinks, { a: "auth-register-open", role: "tutor" });
    await flushMicrotasks(3);
    const tutRegModal = envRegLinks.elements.get("modal-root").innerHTML;
    assert(
      tutRegModal.includes("Регистрация преподавателя") &&
      tutRegModal.includes('data-a="auth-tab" data-tab="register" aria-pressed="true"') &&
      tutRegModal.includes('data-a="auth-role" data-role="tutor" aria-pressed="true"'),
      "expected auth-register-open[role=tutor] to open tutor registration modal"
    );

    clickAction(envRegLinks, { a: "auth-modal-open" });
    await flushMicrotasks(3);
    const resetLoginModal = envRegLinks.elements.get("modal-root").innerHTML;
    assert(
      resetLoginModal.includes("Вход в аккаунт") &&
      resetLoginModal.includes('data-a="auth-tab" data-tab="login" aria-pressed="true"'),
      "expected auth-modal-open to reset modal back to Вход в аккаунт tab"
    );

    const envTutQueryReg = installGlobals({ host: { backend: true, site: "tutor" }, search: "?auth=register", fetch: anonFetch });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    const queryTutModal = envTutQueryReg.elements.get("modal-root").innerHTML;
    assert(
      queryTutModal.includes("Регистрация преподавателя") &&
      queryTutModal.includes('data-a="auth-tab" data-tab="register" aria-pressed="true"') &&
      queryTutModal.includes('data-a="auth-role" data-role="tutor" aria-pressed="true"'),
      "expected /tutor?auth=register to auto-open tutor registration modal cleanly"
    );

    // 14. Яндекс Метрика запускается строго после согласия в cookie-баннере и выключается при отзыве
    const envYm = installGlobals({ host: { backend: true, ymId: "98765432", ymWebvisor: false }, fetch: anonFetch });
    const injectedScripts = [];
    globalThis.document.head = {
      appendChild(node) { injectedScripts.push(node); }
    };
    globalThis.document.createElement = (tag) => ({ tagName: String(tag || "").toUpperCase(), dataset: {}, async: false, src: "" });
    globalThis.document.cookie = "";
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(8);
    assert(EGE.analytics && EGE.analytics.getCounterId() === "98765432", "expected numeric ymId in EGE.analytics");
    assert(EGE.analytics.getState().active === false && injectedScripts.length === 0, "expected Yandex Metrika inactive before consent");

    clickAction(envYm, { a: "cookie-accept-necessary" });
    await flushMicrotasks(2);
    assert(EGE.analytics.getState().active === false && injectedScripts.length === 0, "expected Yandex Metrika inactive on necessary-only cookies");

    clickAction(envYm, { a: "cookie-accept-all" });
    await flushMicrotasks(2);
    assert(
      EGE.analytics.getState().active === true &&
      EGE.analytics.getState().initialized === true &&
      injectedScripts.length === 1 &&
      injectedScripts[0].src === "https://mc.yandex.ru/metrika/tag.js" &&
      typeof globalThis.ym === "function",
      "expected Yandex Metrika tag.js and ym() init after analytics cookie consent"
    );

    clickAction(envYm, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    assert(EGE.analytics.getState().hitsCount >= 1 && EGE.analytics.getState().lastHitPath === "/#fees", "expected SPA navigation hit in Yandex Metrika");

    clickAction(envYm, { a: "cookie-settings" });
    await flushMicrotasks(2);
    clickAction(envYm, { a: "cookie-toggle-analytics" });
    await flushMicrotasks(2);
    clickAction(envYm, { a: "cookie-save-custom" });
    await flushMicrotasks(2);
    assert(EGE.analytics.getState().active === false && globalThis.disableYaCounter98765432 === true, "expected disabling analytics consent to turn off Yandex Metrika");

    // 18. Google OAuth ?role=&next= и настоящий Telegram Login Widget вместо перехода на ввод телефона
    const mountedTgScripts = [];
    const tgLoginPosts = [];
    let currentTgSessionUser = null;
    const envTgAuth = installGlobals({
      host: { backend: true },
      fetch: async (url, opts) => {
        const method = (opts && opts.method) || "GET";
        if (url === "/api/me") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              user: currentTgSessionUser,
              providers: { local: true, phone: true, google: true, telegram: true },
              telegramBotUsername: "vektor_ege_bot",
              telegramBotId: "123456"
            })
          };
        }
        if (url === "/api/auth/telegram/login" && method === "POST") {
          const parsed = JSON.parse((opts && opts.body) || "{}");
          tgLoginPosts.push(parsed);
          currentTgSessionUser = {
            id: 909,
            username: "tg_tut",
            displayName: "Тимур Учитель",
            role: parsed.role === "tutor" ? "tutor" : "student",
            authProvider: "telegram"
          };
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              user: currentTgSessionUser,
              binding: { chatId: "777", telegramUsername: "timur_t", notificationsEnabled: true }
            })
          };
        }
        if (url === "/api/docs") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ docs: {} }) };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    const fakeTgSlot = {
      id: "auth-tg-widget-slot",
      dataset: {},
      children: [],
      appendChild(node) { this.children.push(node); mountedTgScripts.push(node); }
    };
    const fakeTgWrap = {
      id: "auth-tg-widget-wrap",
      classList: { add() {}, remove() {}, contains() { return false; } }
    };
    const origGetById = globalThis.document.getElementById;
    globalThis.document.getElementById = (id) => {
      if (id === "auth-tg-widget-slot") {
        const mHtml = envTgAuth.elements.get("modal-root").innerHTML;
        return mHtml.includes('id="auth-tg-widget-slot"') ? fakeTgSlot : null;
      }
      if (id === "auth-tg-widget-wrap") return fakeTgWrap;
      return origGetById(id);
    };
    globalThis.document.createElement = (tag) => ({
      tagName: String(tag || "").toUpperCase(),
      dataset: {},
      attrs: {},
      setAttribute(k, v) { this.attrs[k] = v; },
      async: false,
      src: ""
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);

    clickAction(envTgAuth, { a: "auth-modal-open" });
    await flushMicrotasks(3);
    const stuAuthModal = envTgAuth.elements.get("modal-root").innerHTML;
    assert(
      stuAuthModal.includes('href="/api/auth/google/start?role=student&amp;next=%2F"'),
      "expected student auth modal Google button to include role=student and next=/"
    );
    fakeTgSlot.dataset = {};
    clickAction(envTgAuth, { a: "auth-role", role: "tutor" });
    await flushMicrotasks(3);
    const tutAuthModal = envTgAuth.elements.get("modal-root").innerHTML;
    assert(
      tutAuthModal.includes('href="/api/auth/google/start?role=tutor&amp;next=%2Ftutor"') &&
      mountedTgScripts.some((s) =>
        s.src === "https://telegram.org/js/telegram-widget.js?22" &&
        s.attrs["data-telegram-login"] === "vektor_ege_bot" &&
        s.attrs["data-onauth"] === "onTelegramAuth(user)"
      ),
      "expected tutor auth modal to pass role=tutor&next=/tutor to Google OAuth and mount Telegram Login Widget script"
    );

    assert(typeof globalThis.onTelegramAuth === "function", "expected global onTelegramAuth callback");
    await globalThis.onTelegramAuth({
      id: 777,
      first_name: "Тимур",
      auth_date: 1795420000,
      hash: "0123456789abcdef0123456789abcdef"
    });
    await flushMicrotasks(12);
    assert(
      tgLoginPosts.length === 1 &&
      tgLoginPosts[0].role === "tutor" &&
      envTgAuth.elements.get("modal-root").innerHTML === "" &&
      envTgAuth.elements.get("main").innerHTML.includes("Входящие заявки учеников"),
      "expected onTelegramAuth callback to POST role=tutor to /api/auth/telegram/login and enter tutor cabinet"
    );

    // Если на бэкенде Telegram не настроен, кнопка «Продолжить через Telegram» остаётся в auth-модалке с подсказкой вместо ввода телефона
    const envTgOff = installGlobals({
      host: { backend: true },
      fetch: async (url) => ({
        ok: true,
        status: 200,
        headers: { get: () => "application/json" },
        json: async () => url === "/api/me"
          ? { user: null, providers: { local: true, phone: true, google: false, telegram: false } }
          : { ok: true, directions: [] }
      })
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    clickAction(envTgOff, { a: "auth-modal-open" });
    await flushMicrotasks(2);
    clickAction(envTgOff, { a: "auth-telegram-start" });
    await flushMicrotasks(3);
    const tgOffModal = envTgOff.elements.get("modal-root").innerHTML;
    assert(
      tgOffModal.includes('data-f="auth"') &&
      !tgOffModal.includes('data-f="contact-verify-send"') &&
      tgOffModal.includes("TELEGRAM_BOT_USERNAME"),
      "expected auth-telegram-start when unconfigured on backend to stay in auth modal with widget notice instead of opening phone verification"
    );

    // 19. ЮKassa API v3: редирект-пополнение без преждевременного начисления и возврат по ?payment_intent=
    const ykPosted = [];
    const envYk = installGlobals({
      host: { backend: true },
      fetch: async (url, opts) => {
        const method = (opts && opts.method) || "GET";
        if (url === "/api/me") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              user: { id: 55, username: "yk_stu", displayName: "Оля ЮКасса", authProvider: "local" },
              providers: { local: true, phone: true },
              payments: { provider: "yookassa", yookassaEnabled: true, receiptEnabled: true }
            })
          };
        }
        if (url === "/api/payments/topup" && method === "POST") {
          const body = JSON.parse((opts && opts.body) || "{}");
          ykPosted.push(body);
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              mode: "redirect",
              provider: "yookassa",
              intent: { id: "pi-yk-1", amountRub: body.amount, feeRub: 0, totalRub: body.amount, status: "pending" },
              confirmationUrl: "https://yoomoney.ru/checkout/yk-smoke-1"
            })
          };
        }
        if (url === "/api/docs") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ docs: {} }) };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);

    clickAction(envYk, { a: "bal-open", amount: "1000" });
    await flushMicrotasks(3);
    const balYkHtml = envYk.elements.get("modal-root").innerHTML;
    assert(
      balYkHtml.includes('id="bal-receipt-email"') &&
      balYkHtml.includes("ЮKassa") &&
      balYkHtml.includes("54-ФЗ"),
      "expected balance modal in YooKassa mode to show 54-FZ email input when user lacks contact"
    );
    envYk.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "bal-custom" },
          elements: { amount: { value: "1000" }, receiptEmail: { value: "olya@ege.ru" } }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(10);
    assert(
      ykPosted.length === 1 &&
      ykPosted[0].amount === 1000 &&
      ykPosted[0].receiptEmail === "olya@ege.ru" &&
      globalThis.location.href === "https://yoomoney.ru/checkout/yk-smoke-1" &&
      !envYk.elements.get("top-balance-slot").innerHTML.includes("1 000"),
      "expected YooKassa topup submit to redirect without optimistically crediting local balance"
    );

    const envYkReturn = installGlobals({
      host: { backend: true },
      search: "?payment_intent=pi-yk-ret-1",
      fetch: async (url) => {
        if (url === "/api/me") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              user: { id: 55, username: "yk_stu", displayName: "Оля ЮКасса", authProvider: "local", email: "olya@ege.ru" },
              providers: { local: true, phone: true },
              payments: { provider: "yookassa", yookassaEnabled: true, receiptEnabled: true }
            })
          };
        }
        if (url === "/api/payments/intents/pi-yk-ret-1") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              intent: { id: "pi-yk-ret-1", status: "succeeded", amountRub: 1000 },
              wallet: { balanceRub: 1000, initialPaid: true, planId: "trial5k" },
              creditedNow: true
            })
          };
        }
        if (url === "/api/docs") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ docs: {} }) };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(14);
    assert(
      hasNum(envYkReturn.elements.get("top-balance-slot").innerHTML, "1 000") &&
      globalThis.location.search === "",
      "expected returning with ?payment_intent= to reconcile and update wallet balance"
    );

    const postedTutorApps = [];
    const envTutorApply = installGlobals({
      host: { backend: true },
      fetch: async (url, opts) => {
        if (url === "/api/me") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ user: null, providers: { local: true, phone: true } })
          };
        }
        if (url === "/api/tutor-applications" && opts && opts.method === "POST") {
          const body = JSON.parse(opts.body);
          postedTutorApps.push(body);
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              application: {
                id: "tapp-smoke-1",
                status: "new",
                name: body.name,
                subject: body.subject,
                subjectName: body.subjectName,
                rate: body.rate,
                contact: body.contact,
                source: body.source
              }
            })
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(8);
    clickAction(envTutorApply, { a: "tutor-apply-open" });
    await flushMicrotasks(2);
    clickAction(envTutorApply, { a: "tutor-apply-step", step: "50" });
    clickAction(envTutorApply, { a: "tutor-apply-step", step: "50" });
    envTutorApply.elements.set("ta-name", { value: "Светлана Иванова" });
    envTutorApply.elements.set("ta-subj", { value: "bio" });
    envTutorApply.elements.set("ta-contact", { value: "@sveta_bio_ege" });
    envTutorApply.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "tutor-apply" } }) }, preventDefault() {} });
    await flushMicrotasks(10);
    assert(
      postedTutorApps.length === 1 &&
      postedTutorApps[0].name === "Светлана Иванова" &&
      postedTutorApps[0].subject === "bio" &&
      postedTutorApps[0].subjectName === "Биология" &&
      postedTutorApps[0].rate === 1200 &&
      postedTutorApps[0].contact === "@sveta_bio_ege" &&
      postedTutorApps[0].source === "landing" &&
      !envTutorApply.elements.get("modal-root").innerHTML.trim() &&
      envTutorApply.elements.get("toast").innerHTML.includes("Анкета принята на проверку"),
      "expected backend landing tutor-apply form to POST /api/tutor-applications and display confirmation toast"
    );

    // 18. Продакшн-витрина без демо-данных (demoMode: false): пустой каталог и загрузка реальных анкет из GET /api/tutors
    const envNoDemoEmpty = installGlobals({
      host: { backend: true, site: "student", demoMode: false },
      fetch: async (url) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: null, demoMode: false, providers: { local: true, phone: true } }) };
        if (url.startsWith("/api/tutors")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, tutors: [] }) };
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    assert(
      globalThis.EGE.tutors.LIST.length === 0,
      "expected EGE.tutors.LIST to start empty when EGE_HOST.demoMode === false"
    );
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envNoDemoEmpty, { a: "go", v: "market" });
    await flushMicrotasks(4);
    const noDemoMktHtml = envNoDemoEmpty.elements.get("main").innerHTML;
    assert(
      globalThis.EGE.tutors.LIST.length === 0 &&
      noDemoMktHtml.includes('id="mkt-prod-empty"') &&
      noDemoMktHtml.includes("Анкет преподавателей пока нет") &&
      !noDemoMktHtml.includes("Анна Соколова") &&
      !noDemoMktHtml.includes("2 480"),
      "expected demoMode=false empty /api/tutors showcase to render #mkt-prod-empty without demo tutors or 2 480 counter"
    );
    clickAction(envNoDemoEmpty, { a: "go", v: "landing" });
    await flushMicrotasks(4);
    assert(
      !envNoDemoEmpty.elements.get("main").innerHTML.includes("2 480"),
      "expected demoMode=false landing view to avoid hardcoded 2 480 count"
    );

    const envNoDemoReal = installGlobals({
      host: { backend: true, site: "student", demoMode: false },
      fetch: async (url) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: null, demoMode: false, providers: { local: true, phone: true } }) };
        if (url.startsWith("/api/tutors")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              tutors: [{
                id: "tut-real-1",
                name: "Ирина Реальная",
                subject: "math",
                subjects: ["math"],
                city: "Москва",
                timezone: "UTC+3",
                price: 1500,
                marketPrice: 2000,
                verified: true,
                bumpedToday: true,
                rating: 4.95,
                reviewsCount: 7,
                slots: { "1": ["18:00"] }
              }]
            })
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envNoDemoReal, { a: "go", v: "market" });
    await flushMicrotasks(4);
    const noDemoRealHtml = envNoDemoReal.elements.get("main").innerHTML;
    assert(
      globalThis.EGE.tutors.LIST.length === 1 &&
      globalThis.EGE.tutors.LIST[0].id === "tut-real-1" &&
      noDemoRealHtml.includes("Ирина Реальная") &&
      noDemoRealHtml.includes("1 репетитор") &&
      !noDemoRealHtml.includes("Анна Соколова") &&
      !noDemoRealHtml.includes("Денис Ковалёв"),
      "expected demoMode=false showcase to render strictly real tutors from GET /api/tutors"
    );

    // 19. Канал SMS OTP и уведомление об авто-фоллбэке в SMS
    let sentSmsPayload = null;
    const envSmsOtp = installGlobals({
      host: { backend: true, site: "student", demoMode: false },
      fetch: async (url, opts) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: null, demoMode: false, providers: { local: true, phone: true } }) };
        if (url === "/api/auth/phone/send") {
          sentSmsPayload = JSON.parse(opts.body);
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              phone: "+7 (914) 210-05-77",
              digits: "79142100577",
              channel: sentSmsPayload.channel,
              channelName: "WhatsApp",
              delivered: true,
              deliveredChannel: "sms",
              deliveredChannelName: "SMS",
              deliveryProvider: "sms_ru",
              fallbackUsed: true,
              demoMode: false
            })
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);
    clickAction(envSmsOtp, { a: "auth-modal-open" });
    await flushMicrotasks(2);
    clickAction(envSmsOtp, { a: "auth-channel", v: "sms" });
    await flushMicrotasks(2);
    assert(
      envSmsOtp.elements.get("modal-root").innerHTML.includes("Получить код по SMS"),
      "expected SMS button copy after picking sms auth-channel"
    );
    envSmsOtp.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "auth" },
          elements: { phone: { value: "+7 (914) 210-05-77" } }
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const smsOtpHtml = envSmsOtp.elements.get("modal-root").innerHTML;
    assert(
      sentSmsPayload &&
      sentSmsPayload.channel === "sms" &&
      smsOtpHtml.includes("Код в SMS") &&
      smsOtpHtml.includes("SMS с кодом"),
      "expected SMS OTP channel and fallback message in modal"
    );

    // 20. Продакшн-кабинет преподавателя без демо-фикстур (demoMode: false): санитизация, пустые состояния, гидратация и выход
    // Сценарий A: гость /tutor с "грязным" localStorage (демо-заявки, демо-ученики, out-seed-1, Анна Соколова, телефон/карта)
    const dirtyTutorLs = JSON.stringify({
      published: false,
      bumpCount: 7,
      autoBump24h: true,
      calendarSync: { icsUrl: "/api/calendar/anna-sokolova.ics", busySlots: [], conflicts: [] },
      profile: {
        name: "Анна Соколова",
        headline: "Эксперт ЕГЭ и ОГЭ · Подготовка к медвузу",
        whatsapp: "+7 (914) 210-01-99",
        telegram: "@anna_sokolova_ege",
        education: "СВФУ им. М.К. Аммосова · Педагог-исследователь",
        expYears: 6,
        avgScore: 86,
        highScorers: 14,
        customSkills: "Задания ФИПИ 2027, №28 Генетика, разбор пробников, медвуз",
        bio: "Экспертная подготовка без шаблонов: разбираем задания ФИПИ, ловушки второй части и пишем пробники на 85+.",
        customBadges: ["Эксперт жюри ВсОШ", ""]
      },
      requests: [
        { id: "tc-req-1", studentName: "Алина С.", exam: "ЕГЭ", subjectName: "Биология", hour: "16:00", offerPrice: 1100, status: "pending" }
      ],
      students: [
        { id: "st-alina", name: "Алина С.", whatsapp: "+7 (914) 210-05-11", telegram: "@alina_bio", lessonsDone: 6 }
      ],
      payoutSettings: {
        method: "sbp",
        bank: "АЭБ (Алмазэргиэнбанк)",
        phone: "+7 (914) 210-01-99",
        card: "2200 7004 8210 4419",
        npdReceipt: true,
        inn: ""
      },
      payouts: [
        { id: "out-seed-1", amount: 4500, status: "succeeded", methodLabel: "СБП · АЭБ (Алмазэргиэнбанк)" }
      ]
    });
    const envTutorGuestProd = installGlobals({
      host: { backend: true, site: "tutor", demoMode: false },
      localStorage: { "vektor-ege:tutor-cabinet": dirtyTutorLs },
      fetch: async (url) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: null, demoMode: false, providers: { local: true, phone: true } }) };
        if (url.startsWith("/api/tutors")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, tutors: [] }) };
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, directions: [], leads: [], bookings: [], events: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envTutorGuestProd, { a: "auth-guest" });
    await flushMicrotasks(4);
    const tcGuestWallet = globalThis.EGE.views.tutorCabinet.getWalletSummary();
    const tcGuestReqHtml = envTutorGuestProd.elements.get("main").innerHTML;
    assert(
      globalThis.EGE.views.tutorCabinet.pendingCount() === 0 &&
      tcGuestWallet.availableRub === 0 &&
      tcGuestWallet.escrowRub === 0 &&
      tcGuestReqHtml.includes('id="tc-prod-auth-empty"') &&
      !tcGuestReqHtml.includes("Алина С.") &&
      !tcGuestReqHtml.includes("Анна Соколова") &&
      !tcGuestReqHtml.includes("Сбросить демо") &&
      !hasNum(tcGuestReqHtml, "4 500"),
      "expected Scenario A: guest /tutor in demoMode=false sanitizes dirty demo localStorage and renders #tc-prod-auth-empty"
    );
    clickAction(envTutorGuestProd, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    const tcGuestCalHtml = envTutorGuestProd.elements.get("main").innerHTML;
    assert(
      tcGuestCalHtml.includes('id="tc-cal-auth-empty"') &&
      !tcGuestCalHtml.includes("Алина С.") &&
      !tcGuestCalHtml.includes("79142100511") &&
      !tcGuestCalHtml.includes('data-a="tc-cal-import-sample"'),
      "expected Scenario A: guest calendar shows #tc-cal-auth-empty without demo students or sample import"
    );
    clickAction(envTutorGuestProd, { a: "go", v: "fees" });
    await flushMicrotasks(2);
    const tcGuestFeesHtml = envTutorGuestProd.elements.get("main").innerHTML;
    assert(
      tcGuestFeesHtml.includes('id="tc-payouts-auth-empty"') &&
      !hasNum(tcGuestFeesHtml, "4 500") &&
      !tcGuestFeesHtml.includes("312"),
      "expected Scenario A: guest /fees shows #tc-payouts-auth-empty without demo balance or stats"
    );

    // Сценарий B: авторизованный преподаватель с пустым бэкендом (tutor: null, bookings: [], payouts: [])
    const prodTutorUser = { id: 701, username: "real_tutor_empty", displayName: "Ольга Борисова", role: "tutor" };
    const envTutorEmptySrv = installGlobals({
      host: { backend: true, site: "tutor", demoMode: false },
      fetch: async (url) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: prodTutorUser, demoMode: false, providers: { local: true, phone: true } }) };
        if (url === "/api/docs") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, docs: {} }) };
        if (url.startsWith("/api/market/state")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, authenticated: true, wallet: { balanceRub: 0, savedCards: [] }, bookings: [], contacts: {}, disputes: [], tutors: [], leads: [], directions: [], reviewsSummary: {} }) };
        if (url.startsWith("/api/tutor/summary")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              tutorId: null,
              tutor: null,
              tutorInn: "",
              npdVerified: false,
              earnedNetRub: 0,
              earned30dNetRub: 0,
              frozenNetRub: 0,
              withdrawnRub: 0,
              availableRub: 0,
              completedLessonsCount: 0,
              completedLessons30dCount: 0,
              minPayoutRub: 500,
              payouts: []
            })
          };
        }
        if (url.startsWith("/api/bookings")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, bookings: [] }) };
        if (url.startsWith("/api/leads")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, leads: [] }) };
        if (url === "/api/telegram/status") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, linked: false }) };
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, tutors: [], directions: [], events: [], verifications: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(16);
    const tcEmptyReqHtml = envTutorEmptySrv.elements.get("main").innerHTML;
    assert(
      globalThis.EGE.views.tutorCabinet.pendingCount() === 0 &&
      tcEmptyReqHtml.includes('id="tc-requests-empty"') &&
      !tcEmptyReqHtml.includes("Сбросить демо") &&
      !tcEmptyReqHtml.includes("Алина С.") &&
      !tcEmptyReqHtml.includes("Анна Соколова"),
      "expected Scenario B: authenticated empty tutor renders #tc-requests-empty without demo fixtures"
    );
    clickAction(envTutorEmptySrv, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(3);
    const tcEmptyCalHtml = envTutorEmptySrv.elements.get("main").innerHTML;
    assert(
      !tcEmptyCalHtml.includes("Алина С.") &&
      !tcEmptyCalHtml.includes('data-a="tc-cal-import-sample"') &&
      tcEmptyCalHtml.includes("записанных учеников нет"),
      "expected Scenario B: empty server tutor calendar has no demo students and hides tc-cal-import-sample"
    );
    clickAction(envTutorEmptySrv, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tcEmptyFeesHtml = envTutorEmptySrv.elements.get("main").innerHTML;
    assert(
      hasNum(tcEmptyFeesHtml, "0 ₽") &&
      tcEmptyFeesHtml.includes('id="tc-stats-empty"') &&
      !tcEmptyFeesHtml.includes("312") &&
      !tcEmptyFeesHtml.includes("4 500") &&
      !tcEmptyFeesHtml.includes("Сбросить демо"),
      "expected Scenario B: empty server tutor /fees shows 0 RUB, 0 lessons, #tc-stats-empty and no 312 demo views"
    );

    // Сценарий C + D: реальные данные с сервера (summary + scope=tutor), фильтрация студенческих броней mkt(), реальная модалка выплат, accept POST и resetSession на auth-logout
    const nowReal = new Date();
    const pad2Real = (n) => String(n).padStart(2, "0");
    const todayIsoReal = `${nowReal.getFullYear()}-${pad2Real(nowReal.getMonth() + 1)}-${pad2Real(nowReal.getDate())}`;
    const todayDowReal = nowReal.getDay();
    let acceptedServerId = null;
    let logoutCalled = false;
    let srvTutorBks = [
      {
        id: "bk-srv-pend-1",
        tutorId: "tut-real-prof-9",
        tutorName: "Екатерина Соловьёва",
        studentUserId: 901,
        studentName: "Михаил С.",
        subject: "chem",
        subjectName: "Химия",
        exam: "ЕГЭ",
        format: "Онлайн",
        city: "Якутск",
        timezone: "UTC+9",
        dayIso: todayIsoReal,
        slotDate: todayIsoReal,
        dow: todayDowReal,
        dayLabel: "Сегодня",
        hour: "16:00",
        offerPrice: 1400,
        counterPrice: null,
        finalPrice: null,
        tutorPrice: 1400,
        fee: 70,
        sbpFee: 14,
        payout: 1316,
        reserved: 1400,
        escrowStatus: "frozen",
        note: "Задача 34 ФИПИ",
        status: "pending",
        createdAt: nowReal.toISOString(),
        updatedAt: nowReal.toISOString()
      },
      {
        id: "bk-srv-acc-2",
        tutorId: "tut-real-prof-9",
        tutorName: "Екатерина Соловьёва",
        studentUserId: 902,
        studentName: "Ксения Л.",
        subject: "bio",
        subjectName: "Биология",
        exam: "ЕГЭ",
        format: "Онлайн",
        city: "Якутск",
        timezone: "UTC+9",
        dayIso: todayIsoReal,
        slotDate: todayIsoReal,
        dow: todayDowReal,
        dayLabel: "Сегодня",
        hour: "18:00",
        offerPrice: 1200,
        counterPrice: 1200,
        finalPrice: 1200,
        tutorPrice: 1200,
        fee: 60,
        sbpFee: 12,
        payout: 1128,
        reserved: 1200,
        escrowStatus: "frozen",
        note: "Генетика вторая часть",
        status: "accepted",
        createdAt: nowReal.toISOString(),
        updatedAt: nowReal.toISOString()
      },
      {
        id: "bk-srv-comp-3",
        tutorId: "tut-real-prof-9",
        tutorName: "Екатерина Соловьёва",
        studentUserId: 903,
        studentName: "Артур Д.",
        subject: "bio",
        subjectName: "Биология",
        exam: "ЕГЭ",
        format: "Онлайн",
        city: "Якутск",
        timezone: "UTC+9",
        dayIso: todayIsoReal,
        slotDate: todayIsoReal,
        dow: todayDowReal,
        dayLabel: "Сегодня",
        hour: "12:00",
        offerPrice: 1000,
        counterPrice: 1000,
        finalPrice: 1000,
        tutorPrice: 1000,
        fee: 50,
        sbpFee: 10,
        payout: 940,
        reserved: 0,
        escrowStatus: "captured",
        note: "Митоз и мейоз",
        status: "completed",
        createdAt: nowReal.toISOString(),
        updatedAt: nowReal.toISOString()
      }
    ];
    const prodTutorRealUser = { id: 702, username: "solovyeva_chem", displayName: "Екатерина Соловьёва", role: "tutor" };
    const envTutorRealSrv = installGlobals({
      host: { backend: true, site: "tutor", demoMode: false },
      fetch: async (url) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: prodTutorRealUser, demoMode: false, providers: { local: true, phone: true } }) };
        if (url === "/api/docs") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, docs: {} }) };
        if (url.startsWith("/api/market/state")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              authenticated: true,
              wallet: { balanceRub: 5000, savedCards: [] },
              bookings: [{
                id: "stu-own-bk",
                tutorId: "tut-someone-else",
                tutorName: "Чужой Репетитор Для Себя",
                subjectName: "Английский",
                hour: "19:00",
                dayLabel: "Завтра",
                offerPrice: 1500,
                status: "pending"
              }],
              contacts: {},
              disputes: [],
              tutors: [],
              leads: [],
              directions: [],
              reviewsSummary: {}
            })
          };
        }
        if (url.startsWith("/api/tutor/summary")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({
              ok: true,
              tutorId: "tut-real-prof-9",
              tutor: {
                id: "tut-real-prof-9",
                userId: 702,
                name: "Екатерина Соловьёва",
                fullName: "Екатерина Соловьёва",
                subject: "chem",
                subjects: ["chem", "bio"],
                exams: ["ЕГЭ"],
                formats: ["Онлайн"],
                city: "Якутск",
                timezone: "UTC+9",
                price: 1400,
                baseRateRub: 1400,
                marketPrice: 1800,
                headline: "Эксперт КИМ по химии",
                education: "МГУ",
                expYears: 7,
                verified: true,
                slots: { [String(todayDowReal)]: ["16:00", "18:00"] }
              },
              tutorInn: "",
              npdVerified: false,
              earnedNetRub: 3760,
              earned30dNetRub: 1880,
              frozenNetRub: 1128,
              withdrawnRub: 940,
              availableRub: 2820,
              completedLessonsCount: 4,
              completedLessons30dCount: 2,
              minPayoutRub: 500,
              payouts: [{
                id: "pay-srv-1",
                tutorId: "tut-real-prof-9",
                tutorName: "Екатерина Соловьёва",
                method: "sbp",
                amountRub: 940,
                npdReceipt: "NPD-2026-AB12",
                npdStatus: "demo",
                bank: "Сбербанк",
                destinationMasked: "+7 (914) ***-**-88",
                status: "succeeded",
                createdAt: nowReal.toISOString()
              }]
            })
          };
        }
        if (url.startsWith("/api/bookings?") && url.includes("scope=tutor")) {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, bookings: srvTutorBks }) };
        }
        const accM = /^\/api\/bookings\/([^/]+)\/accept$/.exec(url);
        if (accM) {
          acceptedServerId = accM[1];
          srvTutorBks = srvTutorBks.map((b) => (b.id === acceptedServerId ? Object.assign({}, b, { status: "accepted", finalPrice: b.offerPrice }) : b));
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, booking: srvTutorBks.find((b) => b.id === acceptedServerId) }) };
        }
        if (url === "/api/auth/logout") {
          logoutCalled = true;
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true }) };
        }
        if (url.startsWith("/api/leads")) return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, leads: [] }) };
        if (url === "/api/telegram/status") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, linked: false }) };
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, tutors: [], directions: [], events: [], verifications: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(16);
    const tcRealWallet = globalThis.EGE.views.tutorCabinet.getWalletSummary();
    const tcRealReqHtml = envTutorRealSrv.elements.get("main").innerHTML;
    assert(
      globalThis.EGE.views.tutorCabinet.pendingCount() === 1 &&
      tcRealReqHtml.includes("Михаил С.") &&
      tcRealReqHtml.includes("Ксения Л.") &&
      tcRealReqHtml.includes("Артур Д.") &&
      !tcRealReqHtml.includes("Чужой Репетитор Для Себя") &&
      !tcRealReqHtml.includes("Заявка ученика (из каталога)") &&
      tcRealWallet.availableRub === 2820 &&
      tcRealWallet.escrowRub === 1128 &&
      hasNum(envTutorRealSrv.elements.get("side-foot").innerHTML, "2 820 ₽"),
      "expected Scenario C: authenticated real tutor hydrates requests, excludes own student mkt bookings, and shows real server wallet 2 820 RUB"
    );
    clickAction(envTutorRealSrv, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(3);
    clickAction(envTutorRealSrv, { a: "tc-day", dow: String(todayDowReal) });
    await flushMicrotasks(3);
    const tcRealCalHtml = envTutorRealSrv.elements.get("main").innerHTML;
    assert(
      tcRealCalHtml.includes("Ксения Л.") &&
      tcRealCalHtml.includes("Артур Д.") &&
      !tcRealCalHtml.includes("Алина С."),
      "expected Scenario C: calendar derives real students Ksenia L. & Artur D. without demo students"
    );
    clickAction(envTutorRealSrv, { a: "go", v: "fees" });
    await flushMicrotasks(3);
    const tcRealFeesHtml = envTutorRealSrv.elements.get("main").innerHTML;
    assert(
      hasNum(tcRealFeesHtml, "2 820 ₽") &&
      hasNum(tcRealFeesHtml, "1 128 ₽") &&
      hasNum(tcRealFeesHtml, "940 ₽") &&
      tcRealFeesHtml.includes("4") &&
      !tcRealFeesHtml.includes('id="tc-stats-empty"') &&
      !tcRealFeesHtml.includes("+7 (914) 210-01-99") &&
      !tcRealFeesHtml.includes("2200 7004 8210 4419"),
      "expected Scenario C: /fees shows real server summary numbers and non-demo payout target"
    );
    clickAction(envTutorRealSrv, { a: "tc-payout-open" });
    await flushMicrotasks(2);
    const tcRealPayModal = envTutorRealSrv.elements.get("modal-root").innerHTML;
    assert(
      tcRealPayModal.includes('id="tc-payout-title"') &&
      !tcRealPayModal.includes("+7 (914) 210-01-99") &&
      !tcRealPayModal.includes("2200 7004 8210 4419") &&
      !tcRealPayModal.includes('value="АЭБ (Алмазэргиэнбанк)" selected') &&
      tcRealPayModal.includes('value="Сбербанк" selected'),
      "expected Scenario C: payout modal contains no hardcoded demo phone, card, or selected demo bank"
    );
    clickAction(envTutorRealSrv, { a: "tc-payout-close" });
    await flushMicrotasks(2);
    clickAction(envTutorRealSrv, { a: "go", v: "tutor-requests" });
    await flushMicrotasks(2);
    clickAction(envTutorRealSrv, { a: "tc-req-accept", id: "bk-srv-pend-1" });
    await flushMicrotasks(12);
    assert(
      acceptedServerId === "bk-srv-pend-1" &&
      globalThis.EGE.views.tutorCabinet.pendingCount() === 0,
      "expected Scenario C: tc-req-accept dispatches POST /api/bookings/bk-srv-pend-1/accept and updates pendingCount"
    );

    // Сценарий D: auth-logout полностью сбрасывает данные реального преподавателя
    clickAction(envTutorRealSrv, { a: "auth-logout" });
    await flushMicrotasks(10);
    const tcAfterLogoutWallet = globalThis.EGE.views.tutorCabinet.getWalletSummary();
    assert(
      logoutCalled === true &&
      globalThis.EGE.views.tutorCabinet.pendingCount() === 0 &&
      tcAfterLogoutWallet.availableRub === 0 &&
      tcAfterLogoutWallet.escrowRub === 0 &&
      !envTutorRealSrv.lsMap["vektor-ege:tutor-cabinet"] &&
      !envTutorRealSrv.elements.get("main").innerHTML.includes("Михаил С.") &&
      !envTutorRealSrv.elements.get("main").innerHTML.includes("Екатерина Соловьёва"),
      "expected Scenario D: auth-logout resets tutorCabinet state, clears localStorage, and leaves zero real or demo data"
    );

    // БЛОК 21: Серверные формы обратной связи («Сообщить о баге» и «Сотрудничество») с '+' вложениями до 20 МБ
    const origFormData = globalThis.FormData;
    class MockFormData {
      constructor() { this.entries = []; }
      append(k, v) { this.entries.push([k, v]); }
      get(k) { const f = this.entries.find((e) => e[0] === k); return f ? f[1] : null; }
      getAll(k) { return this.entries.filter((e) => e[0] === k).map((e) => e[1]); }
    }
    globalThis.FormData = MockFormData;
    const fbSubmissions = [];
    const envFb = installGlobals({
      host: { backend: true, demoMode: true },
      fetch: async (url, opts) => {
        if (url === "/api/me") return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: null, demoMode: true, providers: { local: true, phone: true } }) };
        if (url === "/api/feedback") {
          fbSubmissions.push(opts && opts.body);
          const fd = opts && opts.body;
          const kind = fd && typeof fd.get === "function" ? fd.get("kind") : "bug";
          const filesCnt = fd && typeof fd.getAll === "function" ? fd.getAll("files").length : 0;
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, ticket: { id: "fb-test-" + fbSubmissions.length, kind, attachmentsCount: filesCnt } })
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, tutors: [], directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(10);

    // 21.1: Модалка «Сообщить о баге» с '+' выбором файлов, проверкой >20 МБ, удалением чипа и отправкой на POST /api/feedback
    clickAction(envFb, { a: "bug-site" });
    await flushMicrotasks(2);
    const bugInitHtml = envFb.elements.get("modal-root").innerHTML;
    assert(
      bugInitHtml.includes('id="bug-files"') &&
      bugInitHtml.includes("Добавить файлы") &&
      bugInitHtml.includes('id="bug-mailto"'),
      "expected bug modal to render '+' file attachment picker alongside #bug-mailto fallback"
    );

    const mockPng = { name: "screen.png", size: 20480, type: "image/png" };
    const mockPdf = { name: "report.pdf", size: 51200, type: "application/pdf" };
    const tooBigFile = { name: "huge.pdf", size: 21 * 1024 * 1024, type: "application/pdf" };
    envFb.emitDoc("change", { target: { id: "bug-files", files: [tooBigFile], value: "C:\\huge.pdf", dataset: {} } });
    await flushMicrotasks(2);
    assert(
      envFb.elements.get("modal-root").innerHTML.includes("20 МБ"),
      "expected >20 MB attachment to display inline size limit error"
    );

    envFb.emitDoc("change", { target: { id: "bug-files", files: [mockPng, mockPdf], value: "C:\\files", dataset: {} } });
    await flushMicrotasks(2);
    const bugWithFilesHtml = envFb.elements.get("modal-root").innerHTML;
    assert(
      bugWithFilesHtml.includes("screen.png") &&
      bugWithFilesHtml.includes("report.pdf") &&
      bugWithFilesHtml.includes('data-a="bug-file-remove"'),
      "expected bug modal to render file chips for PNG and PDF with remove buttons"
    );

    clickAction(envFb, { a: "bug-file-remove", i: "0" });
    await flushMicrotasks(2);
    assert(
      !envFb.elements.get("modal-root").innerHTML.includes("screen.png") &&
      envFb.elements.get("modal-root").innerHTML.includes("report.pdf"),
      "expected bug-file-remove to drop first attachment and keep PDF"
    );

    envFb.emitDoc("input", { target: { id: "bug-body", value: "Подробное описание бага для админки", dataset: {} } });
    envFb.emitDoc("input", { target: { id: "bug-contact", value: "@tester_qa", dataset: {} } });
    envFb.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bug-submit" } }) }, preventDefault() {} });
    await flushMicrotasks(8);
    assert(
      fbSubmissions.length === 1 &&
      fbSubmissions[0].get("kind") === "bug" &&
      fbSubmissions[0].get("contact") === "@tester_qa" &&
      fbSubmissions[0].getAll("files").length === 1 &&
      envFb.elements.get("modal-root").innerHTML === "",
      "expected bug-submit to POST FormData to /api/feedback with 1 attachment and close modal"
    );

    // 21.2: Модалка «Сотрудничество» — форма + валидация + отправка с PDF
    clickAction(envFb, { a: "coop-open" });
    await flushMicrotasks(2);
    const coopInitHtml = envFb.elements.get("modal-root").innerHTML;
    assert(
      coopInitHtml.includes('id="coop-files"') &&
      coopInitHtml.includes('data-a="coop-to-apply"') &&
      coopInitHtml.includes('data-f="coop-submit"'),
      "expected coop modal to render feedback form, '+' file picker, and coop-to-apply button"
    );

    envFb.emitDoc("change", { target: { id: "coop-files", files: [mockPdf], value: "C:\\offer.pdf", dataset: {} } });
    envFb.emitDoc("input", { target: { id: "coop-name", value: "Школа ЕГЭ Плюс", dataset: {} } });
    envFb.emitDoc("input", { target: { id: "coop-contact", value: "partner@egeplus.ru", dataset: {} } });
    envFb.emitDoc("input", { target: { id: "coop-body", value: "Хотим подключить 10 преподавателей", dataset: {} } });
    envFb.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "coop-submit" } }) }, preventDefault() {} });
    await flushMicrotasks(8);
    globalThis.FormData = origFormData;
    assert(
      fbSubmissions.length === 2 &&
      fbSubmissions[1].get("kind") === "cooperation" &&
      fbSubmissions[1].get("author_name") === "Школа ЕГЭ Плюс" &&
      fbSubmissions[1].get("contact") === "partner@egeplus.ru" &&
      fbSubmissions[1].getAll("files").length === 1 &&
      envFb.elements.get("modal-root").innerHTML === "",
      "expected coop-submit to POST FormData to /api/feedback with PDF attachment and close modal"
    );

    // БЛОК 22: Банковский возврат остатка кошелька (ЮKassa POST /api/payments/refunds) в окне «Баланс и пополнение»
    const refundPosts = [];
    const envRef = installGlobals({
      host: { backend: true, demoMode: true },
      fetch: async (url, opts) => {
        if (url === "/api/me") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: { id: 404, username: "stu_refund_ui", displayName: "Олег", role: "student" }, demoMode: true, providers: { local: true, phone: true } }) };
        }
        if (url === "/api/market/state") {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, authenticated: true, wallet: { balanceRub: 2500, initialPaid: true, savedCards: [] }, bookings: [], contacts: {}, disputes: [], tutors: [], leads: [], directions: [], reviewsSummary: {} })
          };
        }
        if (url.startsWith("/api/payments/refunds") && (!opts || !opts.method || opts.method === "GET")) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, refunds: [], refundableRub: 2500, wallet: { balanceRub: 2500 } })
          };
        }
        if (url === "/api/payments/refunds" && opts && opts.method === "POST") {
          const bodyObj = JSON.parse(String(opts.body || "{}"));
          refundPosts.push(bodyObj);
          const nextBal = Math.max(0, 2500 - Number(bodyObj.amount || 0));
          const created = { id: "ref-ui-1", amountRub: Number(bodyObj.amount || 0), method: "sbp", status: "requested" };
          return {
            ok: true,
            status: 200,
            headers: { get: () => "application/json" },
            json: async () => ({ ok: true, refund: created, refunds: [created], wallet: { balanceRub: nextBal } })
          };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, docs: {}, tutors: [], directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);

    clickAction(envRef, { a: "bal-open" });
    await flushMicrotasks(3);
    const balWithToggle = envRef.elements.get("modal-root").innerHTML;
    assert(balWithToggle.includes('data-a="bal-refund-toggle"'), "expected authenticated funded balance modal to render bal-refund-toggle button");

    clickAction(envRef, { a: "bal-refund-toggle" });
    await flushMicrotasks(6);
    const balRefundOpen = envRef.elements.get("modal-root").innerHTML;
    assert(
      balRefundOpen.includes('id="bal-refund-amount"') &&
      balRefundOpen.includes('id="bal-refund-reason"') &&
      balRefundOpen.includes('data-f="bal-refund"'),
      "expected bal-refund-toggle to open refund form inside balance modal"
    );

    envRef.emitDoc("input", { target: { id: "bal-refund-amount", value: "1000", dataset: {} } });
    envRef.emitDoc("input", { target: { id: "bal-refund-reason", value: "Завершил подготовку", dataset: {} } });
    envRef.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "bal-refund" } }) }, preventDefault() {} });
    await flushMicrotasks(8);
    const balAfterRefund = envRef.elements.get("modal-root").innerHTML;
    assert(
      refundPosts.length === 1 &&
      refundPosts[0].amount === 1000 &&
      refundPosts[0].reason === "Завершил подготовку" &&
      balAfterRefund.includes("ref-ui-1") &&
      hasNum(balAfterRefund, "1 500 ₽"),
      "expected bal-refund submit to call POST /api/payments/refunds, create ref-ui-1, and reduce balance to 1 500 RUB"
    );

    // БЛОК 23: Прямой URL /market (гостевой публичный каталог и авторизованный вход ученика)
    const envMktGuest = installGlobals({
      host: { backend: true, view: "market" },
      pathname: "/market",
      fetch: async (url) => {
        if (url === "/api/me") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, user: null, demoMode: true, providers: { local: true, phone: true } }) };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, tutors: [], directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    const mktGuestMain = envMktGuest.elements.get("main").innerHTML;
    assert(
      mktGuestMain.includes('id="market-page"') &&
      mktGuestMain.includes('class="land-page is-market-page"') &&
      mktGuestMain.includes('id="mkt-q"') &&
      mktGuestMain.includes('href="/market" data-a="go" data-v="market" aria-current="page"') &&
      mktGuestMain.includes('class="land-footer is-minimal') &&
      !mktGuestMain.includes("land-hero-banner"),
      "expected guest /market entry to render standalone public market catalog without landing hero banner"
    );

    const envMktAuthed = installGlobals({
      host: { backend: true, view: "market" },
      pathname: "/market",
      fetch: async (url) => {
        if (url === "/api/me") {
          return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ user: { id: 405, username: "stu_market_entry", displayName: "Ира", role: "student" }, demoMode: true, providers: { local: true, phone: true } }) };
        }
        return { ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => ({ ok: true, docs: {}, tutors: [], directions: [] }) };
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    const mktAuthedMain = envMktAuthed.elements.get("main").innerHTML;
    const mktAuthedSide = envMktAuthed.elements.get("side-nav").innerHTML;
    assert(
      mktAuthedMain.includes('id="land-market"') &&
      mktAuthedMain.includes('data-a="mkt-exam"') &&
      !mktAuthedMain.includes("Поиск репетитора") &&
      !mktAuthedMain.includes("Ищи репетиторов ниже рынка") &&
      !mktAuthedMain.includes(">Витрина<") &&
      mktAuthedMain.includes('id="mkt-q"') &&
      !mktAuthedMain.includes('id="market-page"') &&
      mktAuthedSide.includes('data-v="market" aria-current="page"'),
      "expected authenticated /market entry to render in-app market view with active sidebar item"
    );

    const mktFirstTutorId = (globalThis.EGE && globalThis.EGE.tutors && globalThis.EGE.tutors.LIST && globalThis.EGE.tutors.LIST[0] && globalThis.EGE.tutors.LIST[0].id) || "";
    assert(mktFirstTutorId, "expected at least one demo tutor to open booking modal");
    clickAction(envMktAuthed, { a: "book-open", id: mktFirstTutorId });
    await flushMicrotasks(2);
    const bookModalWithClose = envMktAuthed.elements.get("modal-root").innerHTML;
    assert(
      bookModalWithClose.includes('class="icon-btn sm sheet-close-btn"') &&
      bookModalWithClose.includes('data-a="book-close"'),
      "expected booking modal to render desktop .sheet-close-btn[data-a='book-close'] button"
    );
    clickAction(envMktAuthed, { a: "book-close" });
    await flushMicrotasks(2);
    assert(envMktAuthed.elements.get("modal-root").innerHTML === "", "expected clicking book-close to dismiss booking modal");
    const mktSheetCss = readFileText("frontend/styles/marketplace.css");
    assert(
      mktSheetCss.includes(".sheet-close-btn {") &&
      mktSheetCss.includes(".sheet-modal > .sheet-grabber-zone { display: none; }"),
      "expected marketplace.css to define .sheet-close-btn and hide mobile grabber on desktop"
    );

    // БЛОК 24: 5 вкладок ученика (Учёба, Общение, Поиск, Календарь, Профиль), Справочник в «Учёбе», чат-центр и плавающий кружок мини-мессенджера
    const chatTid = "booking:bk-chat-1";
    const chatTidUnpaid = "booking:bk-chat-2";
    const chatMessagesStore = {
      [chatTid]: [
        {
          id: "msg-init-1",
          threadId: chatTid,
          bookingId: "bk-chat-1",
          tutorId: "tut-sokolova",
          senderRole: "tutor",
          senderName: "Анна Соколова",
          body: "Здравствуйте! Удобно ли вам начать в среду в 18:00?",
          readByStudent: false,
          readByTutor: true,
          createdAt: "2026-11-24T09:00:00Z"
        }
      ],
      [chatTidUnpaid]: []
    };
    let chatUnreadStu = 1;
    let chatReadCalled = false;
    let tmPatchUrl = "";
    const chatBooking = {
      id: "bk-chat-1",
      tutorId: "tut-sokolova",
      tutorName: "Анна Соколова",
      subjectName: "Биология",
      offerPrice: 1400,
      hour: "18:00",
      dayLabel: "Ср",
      slotDate: "2026-11-25",
      status: "accepted",
      escrowStatus: "frozen",
      reservedRub: 1400,
      telemostUrl: "https://telemost.yandex.ru/j/777888999",
      createdAt: "2026-11-24T08:50:00Z"
    };
    const chatBookingUnpaid = {
      id: "bk-chat-2",
      tutorId: "tut-volkov",
      tutorName: "Дмитрий Волков",
      subjectName: "Физика",
      offerPrice: 2300,
      hour: "17:00",
      dayLabel: "Пт",
      slotDate: "2026-11-27",
      status: "accepted",
      escrowStatus: "none",
      reservedRub: 0,
      telemostUrl: "https://telemost.yandex.ru/j/777888999",
      createdAt: "2026-11-24T08:40:00Z"
    };
    const mkJsonRes = (obj, status = 200) => ({
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "application/json" },
      json: async () => obj
    });
    const envChat = installGlobals({
      host: { backend: true, demoMode: true },
      fetch: async (url, init) => {
        const method = String((init && init.method) || "GET").toUpperCase();
        if (url === "/api/me") {
          return mkJsonRes({
            user: { id: 901, username: "stu_chat_ui", displayName: "Алина", role: "student" },
            demoMode: true,
            providers: { local: true, phone: true }
          });
        }
        if (url === "/api/docs") {
          return mkJsonRes({
            docs: {
              profile: { name: "Алина", exists: true, targets: { bio: 86, chem: 82, rus: 88 } },
              plan: { checked: [] },
              progress: { results: [] },
              essays: [],
              market: { bookings: [chatBooking, chatBookingUnpaid], balance: 2000, walletBalanceRub: 2000 }
            }
          });
        }
        if (url === "/api/wallet") {
          return mkJsonRes({ ok: true, wallet: { balanceRub: 2000, frozenRub: 1400, savedCards: [], ledger: [] } });
        }
        if (url === "/api/bookings?scope=student") {
          return mkJsonRes({ ok: true, bookings: [chatBooking, chatBookingUnpaid] });
        }
        if (url === "/api/market/state") {
          return mkJsonRes({ ok: true, authenticated: true, bookings: [chatBooking, chatBookingUnpaid], wallet: { balanceRub: 2000, frozenRub: 1400 } });
        }
        if (url.startsWith("/api/chats") && method === "GET" && !url.includes("/messages")) {
          const list = chatMessagesStore[chatTid];
          const last = list[list.length - 1];
          const uList = chatMessagesStore[chatTidUnpaid] || [];
          const uLast = uList[uList.length - 1];
          return mkJsonRes({
            ok: true,
            unreadTotal: chatUnreadStu,
            threads: [
              {
                threadId: chatTid,
                bookingId: "bk-chat-1",
                tutorId: "tut-sokolova",
                counterpartName: "Анна Соколова",
                subjectName: "Биология",
                priceRub: 1400,
                slotLabel: "Ср · 18:00",
                slotDate: "2026-11-25",
                dayLabel: "Ср",
                hour: "18:00",
                escrowStatus: "frozen",
                reservedRub: 1400,
                status: "accepted",
                telemostUrl: chatBooking.telemostUrl,
                lastMessage: last.body,
                lastSenderRole: last.senderRole,
                lastAt: last.createdAt,
                messageCount: list.length,
                unreadCount: chatUnreadStu
              },
              {
                threadId: chatTidUnpaid,
                bookingId: "bk-chat-2",
                tutorId: "tut-volkov",
                counterpartName: "Дмитрий Волков",
                subjectName: "Физика",
                priceRub: 2300,
                slotLabel: "Пт · 17:00",
                slotDate: "2026-11-27",
                dayLabel: "Пт",
                hour: "17:00",
                escrowStatus: "none",
                reservedRub: 0,
                status: "accepted",
                telemostUrl: chatBookingUnpaid.telemostUrl,
                lastMessage: uLast ? uLast.body : "",
                lastSenderRole: uLast ? uLast.senderRole : "student",
                lastAt: uLast ? uLast.createdAt : chatBookingUnpaid.createdAt,
                messageCount: uList.length,
                unreadCount: 0
              }
            ]
          });
        }
        if (url.includes("/remind-lesson") && method === "POST") {
          const payload = JSON.parse((init && init.body) || "{}");
          const tgtTid = url.includes(encodeURIComponent(chatTidUnpaid)) ? chatTidUnpaid : chatTid;
          const remMsg = {
            id: "msg-rem-" + ((chatMessagesStore[tgtTid] || []).length + 1),
            threadId: tgtTid,
            bookingId: tgtTid === chatTidUnpaid ? "bk-chat-2" : "bk-chat-1",
            tutorId: tgtTid === chatTidUnpaid ? "tut-volkov" : "tut-sokolova",
            senderRole: "student",
            senderName: "Алина",
            body: String(payload.body || "🔔 Напоминание об уроке"),
            attachments: [],
            readByStudent: true,
            readByTutor: false,
            createdAt: "2026-11-24T09:06:00Z"
          };
          chatMessagesStore[tgtTid].push(remMsg);
          return mkJsonRes({
            ok: true,
            threadId: tgtTid,
            message: remMsg,
            notified: {
              deliveredChannels: ["telegram", "whatsapp"],
              queuedInPlatform: true,
              summary: "Уведомление от ученика отправлено преподавателю через платформу (Telegram / WhatsApp)"
            }
          });
        }
        if (url.includes("/messages")) {
          const tgtTid = url.includes(encodeURIComponent(chatTidUnpaid)) || url.includes(chatTidUnpaid) ? chatTidUnpaid : chatTid;
          if (method === "POST") {
            const rawBody = init && init.body;
            const isFd = rawBody && typeof rawBody.get === "function";
            const msgBody = isFd ? String(rawBody.get("body") || "") : String(JSON.parse(rawBody || "{}").body || "");
            const rawFiles = isFd && typeof rawBody.getAll === "function" ? rawBody.getAll("files") : [];
            const atts = rawFiles.map((f, idx) => {
              const fname = String((f && f.name) || ("file-" + (idx + 1)));
              const ctype = String((f && f.type) || "application/octet-stream");
              const isImg = ctype.indexOf("image/") === 0 || /\.(jpe?g|png|webp|gif)$/i.test(fname);
              const aid = "att-mock-" + (idx + 1);
              return {
                id: aid,
                filename: fname,
                contentType: ctype,
                sizeBytes: Number((f && f.size) || 512),
                isImage: isImg,
                url: isImg
                  ? "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
                  : `/api/chats/${encodeURIComponent(tgtTid)}/files/${aid}`
              };
            });
            const newMsg = {
              id: "msg-new-" + (chatMessagesStore[tgtTid].length + 1),
              threadId: tgtTid,
              bookingId: tgtTid === chatTidUnpaid ? "bk-chat-2" : "bk-chat-1",
              tutorId: tgtTid === chatTidUnpaid ? "tut-volkov" : "tut-sokolova",
              senderRole: "student",
              senderName: "Алина",
              body: msgBody,
              attachments: atts,
              readByStudent: true,
              readByTutor: false,
              createdAt: "2026-11-24T09:05:00Z"
            };
            chatMessagesStore[tgtTid].push(newMsg);
            chatUnreadStu = 0;
            return mkJsonRes({ ok: true, threadId: tgtTid, message: newMsg });
          }
          return mkJsonRes({ ok: true, threadId: tgtTid, messages: chatMessagesStore[tgtTid] || [] });
        }
        if (url.includes("/telemost") && method === "PATCH") {
          const payload = JSON.parse((init && init.body) || "{}");
          tmPatchUrl = String(payload.url || "");
          chatBooking.telemostUrl = tmPatchUrl;
          chatBookingUnpaid.telemostUrl = tmPatchUrl;
          return mkJsonRes({ ok: true, booking: { id: "bk-chat-1", telemostUrl: tmPatchUrl } });
        }
        if (url.includes("/read") && method === "POST") {
          chatReadCalled = true;
          chatUnreadStu = 0;
          return mkJsonRes({ ok: true, threadId: chatTid, updated: 1 });
        }
        if (url.includes("/api/courses/run-python") && method === "POST") {
          const payload = JSON.parse((init && init.body) || "{}");
          const tcList = Array.isArray(payload.tests) ? payload.tests : [];
          return mkJsonRes({
            ok: true,
            passed: tcList.length,
            total: tcList.length,
            error: null,
            results: tcList.map((t, i) => ({
              index: i + 1,
              hidden: !!t.hidden,
              passed: true,
              timeMs: 12,
              stdin: t.hidden ? null : t.stdin,
              expected: t.hidden ? null : t.expected,
              actual: t.hidden ? null : String(t.expected || "").trim(),
              error: null
            }))
          });
        }
        return mkJsonRes({ ok: true, tutors: [], directions: [], events: [] });
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);

    const navOrder = ["Учёба", "Общение", "Поиск", "Календарь", "Профиль"];
    const chatSideHtml = envChat.elements.get("side-nav").innerHTML;
    const chatTabHtml = envChat.elements.get("tabbar").innerHTML;
    for (let i = 0; i < navOrder.length - 1; i++) {
      assert(
        chatSideHtml.indexOf(navOrder[i]) !== -1 && chatSideHtml.indexOf(navOrder[i]) < chatSideHtml.indexOf(navOrder[i + 1]),
        `expected sidebar tab order ${navOrder[i]} before ${navOrder[i + 1]}`
      );
      assert(
        chatTabHtml.indexOf(navOrder[i]) !== -1 && chatTabHtml.indexOf(navOrder[i]) < chatTabHtml.indexOf(navOrder[i + 1]),
        `expected mobile tabbar order ${navOrder[i]} before ${navOrder[i + 1]}`
      );
    }

    // Проверка «Учёба»: без верхнего переключателя, скролл предметов, 4 вкладки в нижнем баре (Учёба, Курсы, Справочник, Вернуться)
    clickAction(envChat, { a: "go", v: "home" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "go", v: "tests" });
    await flushMicrotasks(4);
    const learnSubjectsHtml = envChat.elements.get("main").innerHTML;
    const learnTabbarHtml = envChat.elements.get("tabbar").innerHTML;
    const learnSideHtml = envChat.elements.get("side-nav").innerHTML;
    assert(
      !learnSubjectsHtml.includes("learn-head-seg") &&
      !learnSubjectsHtml.includes("Предметы и тесты") &&
      learnSubjectsHtml.includes("learn-subj-bar") &&
      learnSubjectsHtml.includes("learn-subj-switch") &&
      learnSubjectsHtml.includes('data-a="learn-pick-subject" data-sid="bio"') &&
      !learnSubjectsHtml.includes('data-a="learn-subjects-edit"') &&
      learnSubjectsHtml.includes("Пробные варианты ЕГЭ") &&
      learnSubjectsHtml.includes("Смешанный тест") &&
      learnSubjectsHtml.includes("Темы предмета") &&
      learnTabbarHtml.includes('data-a="learn-tab" data-tab="subjects" aria-current="page"') &&
      learnTabbarHtml.includes('data-a="learn-tab" data-tab="courses"') &&
      learnTabbarHtml.includes('data-a="learn-tab" data-tab="guide"') &&
      learnTabbarHtml.includes('data-a="learn-back"') &&
      learnSideHtml.includes("side-learn-sub"),
      "expected Учёба to omit top learn-head-seg and Предметы button, and render horizontal subject picker + 4-tab Study bottom bar + sidebar sub-nav"
    );
    clickAction(envChat, { a: "learn-tab", tab: "courses" });
    await flushMicrotasks(4);
    const coursesCatalogHtml = envChat.elements.get("main").innerHTML;
    assert(
      coursesCatalogHtml.includes('id="courses-root"') &&
      coursesCatalogHtml.includes("crs-subj-switch") &&
      coursesCatalogHtml.includes("Избранные (0)") &&
      coursesCatalogHtml.includes("Русский язык · ЕГЭ") &&
      coursesCatalogHtml.includes("Математика (профиль) · ЕГЭ") &&
      coursesCatalogHtml.includes("Биология · ЕГЭ") &&
      coursesCatalogHtml.includes("Химия · ЕГЭ") &&
      envChat.elements.get("tabbar").innerHTML.includes('data-a="learn-tab" data-tab="courses" aria-current="page"'),
      "expected Курсы tab to render catalog with subject switcher (incl. Математика) and highlight Курсы in tabbar"
    );
    clickAction(envChat, { a: "course-subj", sid: "math" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("Математика (профиль) · ЕГЭ") &&
      !envChat.elements.get("main").innerHTML.includes("Русский язык · ЕГЭ"),
      "expected course-subj math filter to show Mathematics course only"
    );
    clickAction(envChat, { a: "course-subj", sid: "all" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-fav", course: "rus-ege" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("Избранные (1)") &&
      envChat.elements.get("main").innerHTML.includes('data-a="course-fav" data-course="rus-ege" aria-pressed="true"'),
      "expected course-fav star button to mark rus-ege as favorite"
    );
    clickAction(envChat, { a: "course-subj", sid: "fav" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("Русский язык · ЕГЭ") &&
      !envChat.elements.get("main").innerHTML.includes("Математика (профиль) · ЕГЭ"),
      "expected course-subj fav filter to show favorited course only"
    );
    clickAction(envChat, { a: "course-subj", sid: "all" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-select", course: "rus-ege" });
    await flushMicrotasks(4);
    const syllabusHtml = envChat.elements.get("main").innerHTML;
    assert(
      syllabusHtml.includes('id="crs-topic-q"') &&
      syllabusHtml.includes("Модуль 1 · Культура речи и языковые нормы") &&
      syllabusHtml.includes("Орфоэпические нормы: ударения без зубрёжки") &&
      syllabusHtml.includes("Паронимы: точный выбор слова") &&
      syllabusHtml.includes("Модуль 2 · Орфография") &&
      syllabusHtml.includes("Правописание корней: чередования и ловушки ФИПИ") &&
      syllabusHtml.includes("Правописание приставок: З/С, ПРЕ/ПРИ, Ъ/Ь и Ы/И") &&
      syllabusHtml.includes("Правописание суффиксов разных частей речи") &&
      syllabusHtml.includes("Личные окончания глаголов и суффиксы причастий") &&
      syllabusHtml.includes("Слитное и раздельное написание НЕ и НИ") &&
      syllabusHtml.includes("Слитное, дефисное и раздельное написание слов") &&
      syllabusHtml.includes("Правописание Н и НН в разных частях речи") &&
      syllabusHtml.includes("Запятые при однородных членах и в ССП") &&
      syllabusHtml.includes("Обособленные определения и обстоятельства") &&
      syllabusHtml.includes("0/99 шагов") &&
      syllabusHtml.includes("Модуль 3 · Пунктуация") &&
      syllabusHtml.includes("Модуль 4 · Текст, речь и сочинение"),
      "expected course-select to open compact course syllabus with Modules 1-3 (Topics 1-11) and planned Module 4"
    );
    clickAction(envChat, { a: "course-filter", filter: "done" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("Пока нет полностью пройденных тем."),
      "expected done filter to show empty message before any topic is finished"
    );
    clickAction(envChat, { a: "course-filter", filter: "all" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "crs-topic-q", value: "пароним", dataset: {} } });
    await flushMicrotasks(2);
    const searchTopicHtml = envChat.elements.get("main").innerHTML;
    assert(
      searchTopicHtml.includes("Паронимы: точный выбор слова") &&
      !searchTopicHtml.includes("Орфоэпические нормы: ударения без зубрёжки"),
      "expected crs-topic-q search to filter compact topic rows"
    );
    envChat.emitDoc("input", { target: { id: "crs-topic-q", value: "", dataset: {} } });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-mod-toggle", mod: "m1-norms" });
    await flushMicrotasks(2);
    assert(
      !envChat.elements.get("main").innerHTML.includes('id="crs-lesson-rus-udareniya"'),
      "expected course-mod-toggle to collapse Module 1 compact rows"
    );
    clickAction(envChat, { a: "course-mod-toggle", mod: "m1-norms" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-udareniya" });
    await flushMicrotasks(4);
    const step1Html = envChat.elements.get("main").innerHTML;
    assert(
      step1Html.includes("crs-step-strip") &&
      step1Html.includes("Теория · Блок 1") &&
      step1Html.includes("Темы (1/11)") &&
      step1Html.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected course-open to render Stepik player on Topic 1 step 1 (theory) with topic switcher"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(4);
    const step2Html = envChat.elements.get("main").innerHTML;
    assert(
      step2Html.includes("Мини-практика 1") &&
      step2Html.includes("Шаг 2/9 · Пройдено 1/9"),
      "expected course-theory-done to mark step 1 done and advance to mini-practice 1"
    );
    clickAction(envChat, { a: "course-opt", idx: "0" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    const step2WrongHtml = envChat.elements.get("main").innerHTML;
    assert(
      step2WrongHtml.includes('data-r="0"') &&
      step2WrongHtml.includes('data-a="course-retry"') &&
      step2WrongHtml.includes("Пройдено 1/9"),
      "expected wrong mini-practice answer to show error feedback + retry without marking step done"
    );
    clickAction(envChat, { a: "course-retry" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "1" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    const step2RightHtml = envChat.elements.get("main").innerHTML;
    assert(
      step2RightHtml.includes('data-r="2"') &&
      step2RightHtml.includes("Пройдено 2/9"),
      "expected right mini-practice answer to show success feedback and increment progress"
    );
    clickAction(envChat, { a: "course-step", idx: "5" });
    await flushMicrotasks(4);
    envChat.emitDoc("input", { target: { id: "crs-input", value: "красивее", dataset: {} } });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 3/9"),
      "expected input mini-practice step to accept «красивее» and mark step done"
    );
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-opt", idx: "2" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Тест 1 · ЕГЭ №4") &&
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected multi-select ЕГЭ test step to mark step done"
    );
    // Переключение на Тему 2 (Паронимы) прямо из плеера через drawer
    clickAction(envChat, { a: "course-drawer-toggle" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes('id="crs-topic-drawer"') &&
      envChat.elements.get("main").innerHTML.includes("Паронимы: точный выбор слова"),
      "expected course-drawer-toggle to reveal in-player topic switcher with Topic 2"
    );
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-paronimy" });
    await flushMicrotasks(4);
    const par1Html = envChat.elements.get("main").innerHTML;
    assert(
      !par1Html.includes('id="crs-topic-drawer"') &&
      par1Html.includes("Паронимы: точный выбор слова") &&
      par1Html.includes("Темы (2/11)") &&
      par1Html.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected switching to Topic 2 from drawer to close drawer and open Паронимы step 1"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "5" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "crs-input", value: "дельный", dataset: {} } });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "crs-input", value: "предоставили", dataset: {} } });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "8" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-opt", idx: "2" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 5/9"),
      "expected Topic 2 (Паронимы) to track 5/9 completed steps across theory, practice, input & multi-select tests"
    );
    // Возврат в каталог показывает блок «Продолжить обучение»
    clickAction(envChat, { a: "course-back-catalog" });
    await flushMicrotasks(4);
    const catalogResumeHtml = envChat.elements.get("main").innerHTML;
    assert(
      catalogResumeHtml.includes('id="crs-resume-bar"') &&
      catalogResumeHtml.includes("Паронимы: точный выбор слова") &&
      catalogResumeHtml.includes("Пройдено 5/9"),
      "expected catalog to show Продолжить banner for last active lesson"
    );
    // Очистка прогресса и избранного обратно
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-paronimy" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "course-back-course" });
    await flushMicrotasks(4);
    const syllabusAfterHtml = envChat.elements.get("main").innerHTML;
    assert(
      syllabusAfterHtml.includes("4/99 шагов") &&
      syllabusAfterHtml.includes("Продолжить: Задание 4"),
      "expected course-back-course to return to compact syllabus with 4/99 completed steps"
    );
    // Тема 3 (Задание 9 · Правописание корней): gaps + classify + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-korni" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Правописание корней: чередования и ловушки ФИПИ") &&
      envChat.elements.get("main").innerHTML.includes("Темы (3/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 3 (Правописание корней) to open on step 1 with Темы (3/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "а" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "и" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "а" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "о" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "0" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "2" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 3 (Задание 9) to track 4/9 completed steps across theory, gaps, classify & ЕГЭ №9 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 4 (Задание 10 · Правописание приставок): classify + gaps + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-pristavki" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Правописание приставок: З/С, ПРЕ/ПРИ, Ъ/Ь и Ы/И") &&
      envChat.elements.get("main").innerHTML.includes("Темы (4/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 4 (Правописание приставок) to open on step 1 with Темы (4/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "1" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "и" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "е" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "и" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "и" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "8" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 4 (Задание 10) to track 4/9 completed steps across theory, classify, gaps & ЕГЭ №10 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 5 (Задание 11 · Правописание суффиксов): gaps + classify + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-suffiksy" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Правописание суффиксов разных частей речи") &&
      envChat.elements.get("main").innerHTML.includes("Темы (5/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 5 (Правописание суффиксов) to open on step 1 with Темы (5/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "и" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "е" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "ы" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "о" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "0" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 5 (Задание 11) to track 4/9 completed steps across theory, gaps, classify & ЕГЭ №11 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 6 (Задание 12 · Спряжение и причастия): classify + gaps + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-spryazhenie" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Личные окончания глаголов и суффиксы причастий") &&
      envChat.elements.get("main").innerHTML.includes("Темы (6/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 6 (Задание 12) to open on step 1 with Темы (6/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "0" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "е" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "я" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "е" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "е" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "2" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 6 (Задание 12) to track 4/9 completed steps across theory, classify, gaps & ЕГЭ №12 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 7 (Задание 13 · НЕ и НИ): classify + gaps + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-ne-ni" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Слитное и раздельное написание НЕ и НИ") &&
      envChat.elements.get("main").innerHTML.includes("Темы (7/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 7 (Задание 13) to open on step 1 with Темы (7/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "0" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "5" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "ни" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "не" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "не" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "не" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "2" });
    clickAction(envChat, { a: "course-opt", idx: "4" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 7 (Задание 13) to track 4/9 completed steps across theory, classify, gaps & ЕГЭ №13 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 8 (Задание 14 · Слитное, дефисное и раздельное): classify (2 и 3 категории) + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-slitno-razdelno" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Слитное, дефисное и раздельное написание слов") &&
      envChat.elements.get("main").innerHTML.includes("Темы (8/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 8 (Задание 14) to open on step 1 with Темы (8/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "1" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "5" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "2" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "2" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "0" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "8" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 8 (Задание 14) to track 4/9 completed steps across theory, 2-way/3-way classify & ЕГЭ №14 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 9 (Задание 15 · Правописание Н и НН): classify + gaps + multi
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-n-nn" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Правописание Н и НН в разных частях речи") &&
      envChat.elements.get("main").innerHTML.includes("Темы (9/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 9 (Задание 15) to open on step 1 with Темы (9/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "1" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "н" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "нн" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "н" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "нн" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "6" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-opt", idx: "0" });
    clickAction(envChat, { a: "course-opt", idx: "1" });
    clickAction(envChat, { a: "course-opt", idx: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 9 (Задание 15) to track 4/9 completed steps across theory, classify, gaps & ЕГЭ №15 test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 10 (Задание 16 · Модуль 3: Пунктуация): theory + punct + classify + punct
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-zapyatye-16" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Запятые при однородных членах и в ССП") &&
      envChat.elements.get("main").innerHTML.includes("Темы (10/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 10 (Задание 16) to open on step 1 with Темы (10/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "2" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "4" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "0" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "5" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "2" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "3" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 10 (Задание 16) to track 4/9 completed steps across theory, punct & classify"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    // Тема 11 (Задание 17 · Модуль 3: Пунктуация): theory + punct + classify + punct (test)
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-obosoblenie-17" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Обособленные определения и обстоятельства") &&
      envChat.elements.get("main").innerHTML.includes("Темы (11/11)") &&
      envChat.elements.get("main").innerHTML.includes("Шаг 1/9 · Пройдено 0/9"),
      "expected Topic 11 (Задание 17) to open on step 1 with Темы (11/11)"
    );
    clickAction(envChat, { a: "course-theory-done" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "4" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "4", val: "1" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-step", idx: "8" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "3" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "4" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "5" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "6" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "7" });
    clickAction(envChat, { a: "course-check" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('data-r="2"') &&
      envChat.elements.get("main").innerHTML.includes("Пройдено 4/9"),
      "expected Topic 11 (Задание 17) to track 4/9 completed steps across theory, punct, classify & final punct test"
    );
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "course-open", course: "rus-ege", lesson: "rus-udareniya" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "course-reset" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "course-back-catalog" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-fav", course: "rus-ege" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("Избранные (0)") &&
      !envChat.elements.get("main").innerHTML.includes('id="crs-resume-bar"'),
      "expected reset + unfavorite to restore clean catalog state"
    );
    // Витрина 13 шаблонов ОГЭ и ЕГЭ: проверяем все новые интерактивные форматы
    clickAction(envChat, { a: "course-templates-open" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes('id="crs-tpl-showcase"') &&
      envChat.elements.get("main").innerHTML.includes("Шаблоны ОГЭ и ЕГЭ (13)"),
      "expected course-templates-open to show 13 ОГЭ/ЕГЭ templates showcase"
    );
    // 3. input (число с запятой 0,25)
    clickAction(envChat, { a: "course-tpl-pick", idx: "2" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "crs-input", value: "0,25", dataset: {} } });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected numeric input template to accept 0,25");
    // 4. match (А→1, Б→0, В→2)
    clickAction(envChat, { a: "course-tpl-pick", idx: "3" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "match", row: "0", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "match", row: "1", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "match", row: "2", val: "2" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected match template to grade pairs as correct");
    // 5. order (1→0→3→2)
    clickAction(envChat, { a: "course-tpl-pick", idx: "4" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "order", idx: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "order", idx: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "order", idx: "3" });
    clickAction(envChat, { a: "course-tpl-act", op: "order", idx: "2" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected order template to grade sequence as correct");
    // 6. gaps (н, нн, н)
    clickAction(envChat, { a: "course-tpl-pick", idx: "5" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "н" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "нн" });
    clickAction(envChat, { a: "course-tpl-act", op: "gap-chip", val: "н" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected gaps click-fill template to grade slots as correct");
    // 7. punct (цифры 1, 2, 3)
    clickAction(envChat, { a: "course-tpl-pick", idx: "6" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "2" });
    clickAction(envChat, { a: "course-tpl-act", op: "punct", num: "3" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected punct template to grade comma pins 1,2,3 as correct");
    // 8. classify ([1, 1, 0, 1])
    clickAction(envChat, { a: "course-tpl-pick", idx: "7" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "0", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "1", val: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "2", val: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "classify", row: "3", val: "1" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected classify template to grade categories as correct");
    // 9. self (2-я часть: ввод -> эталон -> критерии -> самопроверка 2/3 балла)
    clickAction(envChat, { a: "course-tpl-pick", idx: "8" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "crs-self-text", value: "Гибель симбиотической микрофлоры снижает синтез витамина K.", dataset: {} } });
    clickAction(envChat, { a: "course-tpl-act", op: "self-reveal" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "self-crit", idx: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "self-crit", idx: "1" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("Самопроверка завершена: 2 из 3"),
      "expected self template to score 2/3 criteria points"
    );
    // 10. multi_input (3 и 18)
    clickAction(envChat, { a: "course-tpl-pick", idx: "9" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "", value: "3", dataset: { crsInput: "mi", idx: "0" } } });
    envChat.emitDoc("input", { target: { id: "", value: "18", dataset: { crsInput: "mi", idx: "1" } } });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected multi_input template to accept [3, 18]");
    // 11. table (слоты 0->0, 1->1, 2->1)
    clickAction(envChat, { a: "course-tpl-pick", idx: "10" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "table-cycle", slot: "0" });
    clickAction(envChat, { a: "course-tpl-act", op: "table-cycle", slot: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "table-cycle", slot: "1" });
    clickAction(envChat, { a: "course-tpl-act", op: "table-cycle", slot: "2" });
    clickAction(envChat, { a: "course-tpl-act", op: "table-cycle", slot: "2" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected table template to grade cells [0, 1, 1]");
    // 12. text_pick (предложение 3 -> idx 2)
    clickAction(envChat, { a: "course-tpl-pick", idx: "11" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "course-tpl-act", op: "text-pick", idx: "2" });
    clickAction(envChat, { a: "course-tpl-check" });
    await flushMicrotasks(2);
    assert(envChat.elements.get("main").innerHTML.includes('data-r="2"'), "expected text_pick template to grade sentence (3)");
    // 13. code (Python): запуск и прохождение тестов
    clickAction(envChat, { a: "course-tpl-pick", idx: "12" });
    await flushMicrotasks(2);
    envChat.emitDoc("input", { target: { id: "crs-code-editor", value: "print(12)", dataset: {} } });
    clickAction(envChat, { a: "course-code-run" });
    await flushMicrotasks(8);
    assert(
      envChat.elements.get("main").innerHTML.includes("Все тесты пройдены (3/3)") &&
      envChat.elements.get("main").innerHTML.includes("Скрытый тест"),
      "expected code (Python) template to run backend check and render 3/3 passed tests"
    );
    clickAction(envChat, { a: "course-templates-close" });
    await flushMicrotasks(2);
    assert(
      !envChat.elements.get("main").innerHTML.includes('id="crs-tpl-showcase"') &&
      envChat.elements.get("main").innerHTML.includes("crs-cat-grid"),
      "expected course-templates-close to return to course catalog"
    );
    clickAction(envChat, { a: "learn-tab", tab: "guide" });
    await flushMicrotasks(4);
    const guideOnlyHtml = envChat.elements.get("main").innerHTML;
    assert(
      guideOnlyHtml.includes('id="guide-q"') &&
      guideOnlyHtml.includes("guide-search-only") &&
      guideOnlyHtml.includes("Все темы ·") &&
      guideOnlyHtml.includes("Сочинение ЕГЭ · памятка") &&
      envChat.elements.get("tabbar").innerHTML.includes('data-a="learn-tab" data-tab="guide" aria-current="page"') &&
      !guideOnlyHtml.includes("learn-head-seg") &&
      !guideOnlyHtml.includes('data-a="guide-sid"') &&
      !guideOnlyHtml.includes('data-a="guide-chip"'),
      "expected Учёба -> Справочник tab to render search bar + guide overview and highlight Справочник in tabbar"
    );
    envChat.emitDoc("input", { target: { id: "guide-q", value: "сочинение", dataset: {} } });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("Сочинение: клише и аргументы"),
      "expected Учёба -> Справочник to return matching essay card on search input"
    );
    clickAction(envChat, { a: "guide-clear" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "learn-back" });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("comm-head-seg") &&
      envChat.elements.get("tabbar").innerHTML.includes("Общение") &&
      !envChat.elements.get("tabbar").innerHTML.includes('data-a="learn-back"'),
      "expected learn-back to return to Общение and restore main 5-tab bottom bar"
    );
    const studyCssTxt = readFileText("frontend/styles/study.css");
    assert(
      studyCssTxt.includes(".learn-subj-switch") &&
      studyCssTxt.includes("flex-wrap: nowrap") &&
      studyCssTxt.includes("overflow-x: auto"),
      "expected horizontal single-row scrolling styles on .learn-subj-switch in study.css"
    );

    // Проверка «Календарь» (study)
    clickAction(envChat, { a: "go", v: "study" });
    await flushMicrotasks(4);
    const studyCalHtml = envChat.elements.get("main").innerHTML;
    assert(
      studyCalHtml.includes('id="study-week-strip"') &&
      !studyCalHtml.includes("Календарь занятий") &&
      !studyCalHtml.includes('<div class="eyebrow">Календарь</div>'),
      "expected Календарь tab (study) to render #study-week-strip without redundant Календарь занятий header"
    );

    // Проверка «Общение» (только 2 вкладки: Чаты +N и Отклики +N, а на «Общение» — сумма N)
    clickAction(envChat, { a: "go", v: "home" });
    await flushMicrotasks(4);
    const commDefaultHtml = envChat.elements.get("main").innerHTML;
    const sideCommHtml = envChat.elements.get("side-nav").innerHTML;
    const tabCommHtml = envChat.elements.get("tabbar").innerHTML;
    assert(
      commDefaultHtml.includes("comm-head-seg") &&
      !commDefaultHtml.includes("Общение ·") &&
      !commDefaultHtml.includes("Чаты с преподавателями, отклики") &&
      !commDefaultHtml.includes('data-tab="all"') &&
      !commDefaultHtml.includes(">Все<") &&
      commDefaultHtml.includes('data-tab="chats"') &&
      commDefaultHtml.includes('data-tab="bids"') &&
      commDefaultHtml.includes(">+1<") &&
      commDefaultHtml.includes(">+2<") &&
      commDefaultHtml.includes('id="comm-chat-workspace"') &&
      sideCommHtml.includes('data-v="home"') &&
      sideCommHtml.includes(">3<") &&
      tabCommHtml.includes(">3<"),
      "expected Общение to show only Чаты (+1) and Отклики (+2) tabs and display sum 3 on Общение nav"
    );
    clickAction(envChat, { a: "comm-tab", tab: "bids" });
    await flushMicrotasks(4);
    const commBidsHtml = envChat.elements.get("main").innerHTML;
    assert(
      commBidsHtml.includes('id="home-bids-section"') &&
      commBidsHtml.includes("Мои отклики преподавателям") &&
      !commBidsHtml.includes("Отклики и ответы") &&
      commBidsHtml.includes('data-a="mc-open-thread"'),
      "expected Общение -> Отклики to render #home-bids-section and Написать в чат buttons"
    );

    // Проверка плавающего кружка мини-мессенджера #mini-chat-dock
    const dockEl = envChat.elements.get("mini-chat-dock");
    assert(
      dockEl.hidden === false &&
      dockEl.innerHTML.includes("mc-fab") &&
      dockEl.innerHTML.includes("mc-fab-badge"),
      "expected #mini-chat-dock to be visible with circular .mc-fab and unread badge"
    );
    clickAction(envChat, { a: "mc-toggle" });
    await flushMicrotasks(6);
    assert(
      dockEl.innerHTML.includes("mc-panel") &&
      dockEl.innerHTML.includes("Анна Соколова"),
      "expected mc-toggle to open floating .mc-panel with thread list"
    );
    clickAction(envChat, { a: "mc-open-thread", threadId: chatTid, bookingId: "bk-chat-1" });
    await flushMicrotasks(8);
    assert(
      chatReadCalled &&
      dockEl.innerHTML.includes("Удобно ли вам начать в среду") &&
      dockEl.innerHTML.includes('data-f="mc-send"') &&
      dockEl.innerHTML.includes('class="mc-attach-btn" for="mc-files"'),
      "expected mc-open-thread to load thread messages, mark read, and render + attach button & #mc-send composer"
    );
    assert(
      globalThis.EGE.ui.ICONS.chat.includes("H8l-5 4V6") &&
      globalThis.EGE.ui.ICONS.send.includes("5.4 4.8 20.4 12 5.4 19.2") &&
      Boolean(globalThis.EGE.ui.ICONS.file),
      "expected symmetric chat/send icons and file icon in EGE.ui.ICONS"
    );
    envChat.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "mc-send", threadId: chatTid },
          querySelector: () => ({ value: "Добрый день! Готов заниматься." })
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    assert(
      dockEl.innerHTML.includes("Добрый день! Готов заниматься.") &&
      dockEl.innerHTML.includes('data-receipt="sent"') &&
      dockEl.innerHTML.includes('title="Отправлено"'),
      "expected mc-send submit to append sent bubble inside #mini-chat-dock with single checkmark"
    );
    globalThis.EGE.views.messenger.onRealtimeEvent({
      eventType: "chat.read",
      payload: { threadId: chatTid, readerRole: "tutor", updated: 1 }
    });
    await flushMicrotasks(2);
    assert(
      dockEl.innerHTML.includes('data-receipt="read"') &&
      dockEl.innerHTML.includes('title="Прочитано"') &&
      !dockEl.innerHTML.includes('data-receipt="sent"'),
      "expected chat.read realtime event from tutor to flip student #mini-chat-dock checkmark to double Прочитано"
    );

    // Вложения в мини-мессенджере: '+' выбор фото + PDF -> удаление PDF -> отправка фото без текста -> просмотр в лайтбоксе
    globalThis.FormData = MockFormData;
    const chatPngFile = { name: "task_photo.png", type: "image/png", size: 2048 };
    const chatPdfFile = { name: "notes.pdf", type: "application/pdf", size: 4096 };
    envChat.emitDoc("change", { target: { id: "mc-files", files: [chatPngFile, chatPdfFile], value: "C:\\task_photo.png", dataset: {} } });
    await flushMicrotasks(4);
    const pendingDockHtml = dockEl.innerHTML;
    assert(
      pendingDockHtml.includes("mc-pending-bar") &&
      pendingDockHtml.includes("notes.pdf") &&
      pendingDockHtml.includes('data-a="mc-file-remove"'),
      "expected #mc-files change to queue selected files into .mc-pending-bar"
    );
    const pdfRmMatches = [...pendingDockHtml.matchAll(/data-a="mc-file-remove" data-fid="([^"]+)"/g)];
    assert(pdfRmMatches.length === 2, "expected 2 queued chat attachment remove buttons");
    clickAction(envChat, { a: "mc-file-remove", fid: pdfRmMatches[1][1] });
    await flushMicrotasks(2);
    assert(
      !dockEl.innerHTML.includes("notes.pdf"),
      "expected mc-file-remove to drop notes.pdf and keep queued photo"
    );
    envChat.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "mc-send", threadId: chatTid },
          querySelector: () => ({ value: "" })
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    globalThis.FormData = origFormData;
    assert(
      dockEl.innerHTML.includes('class="mc-att-photo"') &&
      dockEl.innerHTML.includes('data-a="mc-photo-open"'),
      "expected empty-text photo upload to render inline .mc-att-photo bubble"
    );
    const photoOpenMatch = /data-a="mc-photo-open" data-src="([^"]+)" data-name="([^"]+)"/.exec(dockEl.innerHTML);
    assert(photoOpenMatch, "expected mc-photo-open button metadata");
    clickAction(envChat, { a: "mc-photo-open", src: photoOpenMatch[1], name: photoOpenMatch[2] });
    await flushMicrotasks(2);
    assert(
      dockEl.innerHTML.includes('class="mc-lightbox"'),
      "expected mc-photo-open to render fullscreen .mc-lightbox preview"
    );
    clickAction(envChat, { a: "mc-photo-close" });
    await flushMicrotasks(2);
    assert(
      !dockEl.innerHTML.includes('class="mc-lightbox"'),
      "expected mc-photo-close to dismiss .mc-lightbox preview"
    );
    assert(
      dockEl.innerHTML.includes("mc-lesson-bar") &&
      dockEl.innerHTML.includes("Ближайший урок") &&
      dockEl.innerHTML.includes("mc-pay-pill is-paid") &&
      dockEl.innerHTML.includes("Оплачен"),
      "expected paid thread to display Ближайший урок and green Оплачен status pill"
    );

    // Неоплаченный диалог: Не оплачен + оранжевая кнопка Пополнить 300 ₽ + стартовые подсказки исчезают после первого сообщения
    clickAction(envChat, { a: "mc-open-thread", threadId: chatTidUnpaid, bookingId: "bk-chat-2" });
    await flushMicrotasks(8);
    assert(
      dockEl.innerHTML.includes("mc-lesson-bar is-unpaid") &&
      dockEl.innerHTML.includes("mc-pay-pill is-unpaid") &&
      dockEl.innerHTML.includes("Не оплачен") &&
      dockEl.innerHTML.includes("mc-topup-btn") &&
      hasNum(dockEl.innerHTML, "Пополнить 300 ₽") &&
      dockEl.innerHTML.includes('data-a="mc-quick-reply"') &&
      dockEl.innerHTML.includes("Подойдёт ли время?") &&
      dockEl.innerHTML.includes('data-a="mc-remind-lesson"'),
      "expected unpaid thread to show Ближайший урок, Не оплачен badge, orange Пополнить CTA, starter quick-reply pills, and Напомнить об уроке chip"
    );
    clickAction(envChat, { a: "bal-open", amount: "300", reason: "Пополнение для оплаты ближайшего урока" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("modal-root").innerHTML.includes("Пополнение для оплаты ближайшего урока"),
      "expected clicking orange Пополнить button to open balanceModal with lesson reason"
    );
    clickAction(envChat, { a: "bal-close" });
    await flushMicrotasks(2);

    clickAction(envChat, { a: "mc-remind-lesson", threadId: chatTidUnpaid });
    await flushMicrotasks(8);
    assert(
      dockEl.innerHTML.includes("Напоминание об уроке") &&
      dockEl.innerHTML.includes("mc-notice-bar") &&
      dockEl.innerHTML.includes("Уведомление от ученика отправлено преподавателю через платформу") &&
      !dockEl.innerHTML.includes('data-a="mc-quick-reply"') &&
      !dockEl.innerHTML.includes("Подойдёт ли время?") &&
      dockEl.innerHTML.includes('data-a="mc-remind-lesson"'),
      "expected mc-remind-lesson to append reminder message, hide starter quick-reply pills, keep remind button, and show platform confirmation"
    );
    assert(
      globalThis.EGE.views.messenger.listThreads()[0].threadId === chatTidUnpaid,
      "expected unpaid thread with newer lesson reminder (09:06) to sort to top ahead of earlier thread (09:05)"
    );
    clickAction(envChat, { a: "mc-notice-close" });
    await flushMicrotasks(2);

    clickAction(envChat, { a: "mc-open-thread", threadId: chatTid, bookingId: "bk-chat-1" });
    await flushMicrotasks(8);

    clickAction(envChat, { a: "mc-close" });
    await flushMicrotasks(2);
    assert(
      !dockEl.innerHTML.includes("mc-panel") &&
      dockEl.innerHTML.includes("mc-fab") &&
      !dockEl.innerHTML.includes("mc-fab-badge"),
      "expected mc-close to collapse .mc-panel, keep circular .mc-fab visible, and clear unread badge"
    );

    clickAction(envChat, { a: "comm-tab", tab: "chats" });
    await flushMicrotasks(6);
    const commChatsHtml = envChat.elements.get("main").innerHTML;
    const sideAfterReadHtml = envChat.elements.get("side-nav").innerHTML;
    const tabAfterReadHtml = envChat.elements.get("tabbar").innerHTML;
    assert(
      commChatsHtml.includes('id="comm-chat-workspace"') &&
      commChatsHtml.includes("has-active-thread") &&
      commChatsHtml.includes("comm-mobile-rail") &&
      commChatsHtml.includes("comm-mobile-back") &&
      commChatsHtml.includes("Анна С.") &&
      commChatsHtml.includes("Дмитрий В.") &&
      commChatsHtml.includes("Добрый день! Готов заниматься.") &&
      !commChatsHtml.includes(">+1<") &&
      commChatsHtml.includes(">+2<") &&
      sideAfterReadHtml.includes(">2<") &&
      tabAfterReadHtml.includes(">2<") &&
      commChatsHtml.includes('data-a="mc-open-bid-profile"') &&
      commChatsHtml.includes("comm-head-profile-btn") &&
      commChatsHtml.includes("mc-tm-edit-btn") &&
      commChatsHtml.includes("Сменить ссылку") &&
      commChatsHtml.indexOf("mc-tm-edit-btn") < commChatsHtml.indexOf("mc-tm-btn"),
      "expected Общение -> Чаты to render #comm-chat-workspace, clickable profile header, Сменить ссылку left of Телемост, and sum badge 2"
    );

    clickAction(envChat, { a: "mc-tm-edit", threadId: chatTid, bookingId: "bk-chat-1" });
    await flushMicrotasks(2);
    assert(
      envChat.elements.get("main").innerHTML.includes("mc-tm-editor") &&
      envChat.elements.get("main").innerHTML.includes('data-f="mc-tm-save"'),
      "expected mc-tm-edit to open inline video link editor in .mc-lesson-bar"
    );
    envChat.emitDoc("submit", {
      target: {
        closest: () => ({
          dataset: { f: "mc-tm-save", threadId: chatTid, bookingId: "bk-chat-1" },
          querySelector: () => ({ value: "https://zoom.us/j/9876543210" })
        })
      },
      preventDefault() {}
    });
    await flushMicrotasks(8);
    const zoomChatHtml = envChat.elements.get("main").innerHTML;
    assert(
      tmPatchUrl === "https://zoom.us/j/9876543210" &&
      zoomChatHtml.includes('href="https://zoom.us/j/9876543210"') &&
      zoomChatHtml.includes(">Zoom<") &&
      zoomChatHtml.includes("mc-notice-bar"),
      "expected saving Zoom link in chat to patch backend, update button label to Zoom, and show confirmation banner"
    );
    clickAction(envChat, { a: "mc-tm-edit", threadId: chatTid, bookingId: "bk-chat-1" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "mc-tm-gen", threadId: chatTid, bookingId: "bk-chat-1" });
    await flushMicrotasks(8);
    assert(
      tmPatchUrl.startsWith("https://telemost.yandex.ru/j/") &&
      envChat.elements.get("main").innerHTML.includes(">Телемост<"),
      "expected mc-tm-gen to generate a new Yandex Telemost URL and switch button back to Телемост"
    );

    globalThis.EGE.views.messenger.onRealtimeEvent({
      id: "rt-tm-stu-1",
      eventType: "market.telemost.updated",
      payload: {
        bookingId: "bk-chat-1",
        threadId: chatTid,
        tutorId: "tut-sokolova",
        studentUserId: 901,
        changedByRole: "tutor",
        changedByName: "Анна Соколова",
        providerLabel: "Google Meet",
        actionLabel: "Войти в Google Meet",
        telemostUrl: "https://meet.google.com/new-room-abc"
      }
    });
    await flushMicrotasks(4);
    const tmToastHtml = envChat.elements.get("toast").innerHTML;
    assert(
      tmToastHtml.includes("toast-action-link") &&
      tmToastHtml.includes("Войти в Google Meet") &&
      tmToastHtml.includes('href="https://meet.google.com/new-room-abc"') &&
      envChat.elements.get("main").innerHTML.includes('href="https://meet.google.com/new-room-abc"'),
      "expected counterpart market.telemost.updated to show toast join link and update active thread URL"
    );
    clickAction(envChat, { a: "notif-open" });
    await flushMicrotasks(2);
    const tmNotifModalHtml = envChat.elements.get("modal-root").innerHTML;
    assert(
      tmNotifModalHtml.includes("notif-join-btn") &&
      tmNotifModalHtml.includes("Войти в Google Meet") &&
      tmNotifModalHtml.includes('href="https://meet.google.com/new-room-abc"') &&
      tmNotifModalHtml.includes("Анна Соколова"),
      "expected bell notification inbox to include clickable join button for updated meeting link"
    );
    clickAction(envChat, { a: "notif-close" });
    await flushMicrotasks(2);
    const notifsCountAfterTm = Number(envChat.elements.get("top-notifs-cnt").textContent) || 0;
    globalThis.EGE.views.messenger.onRealtimeEvent({
      id: "rt-tm-self-1",
      eventType: "market.telemost.updated",
      payload: {
        bookingId: "bk-chat-1",
        threadId: chatTid,
        tutorId: "tut-sokolova",
        studentUserId: 901,
        changedByRole: "student",
        changedByName: "Алина",
        providerLabel: "Zoom",
        actionLabel: "Войти в Zoom",
        telemostUrl: "https://zoom.us/j/1122334455"
      }
    });
    await flushMicrotasks(2);
    assert(
      !envChat.elements.get("toast").innerHTML.includes("https://zoom.us/j/1122334455") &&
      (Number(envChat.elements.get("top-notifs-cnt").textContent) || 0) === notifsCountAfterTm,
      "expected self-originated market.telemost.updated not to create toast or duplicate bell alert"
    );

    clickAction(envChat, { a: "mc-open-bid-profile", bookingId: "bk-chat-2", tutorId: "tut-volkov" });
    await flushMicrotasks(6);
    const bidsJumpHtml = envChat.elements.get("main").innerHTML;
    assert(
      bidsJumpHtml.includes('data-tab="bids" aria-pressed="true"') &&
      bidsJumpHtml.includes('id="home-bids-section"') &&
      bidsJumpHtml.includes('is-bid-highlighted" data-tutor-id="tut-volkov" data-booking-id="bk-chat-2"') &&
      !bidsJumpHtml.includes('is-bid-highlighted" data-tutor-id="tut-sokolova"'),
      "expected mc-open-bid-profile to switch to Отклики and highlight only bk-chat-2 once"
    );
    clickAction(envChat, { a: "comm-tab", tab: "chats" });
    await flushMicrotasks(2);
    clickAction(envChat, { a: "comm-tab", tab: "bids" });
    await flushMicrotasks(4);
    assert(
      !envChat.elements.get("main").innerHTML.includes("is-bid-highlighted"),
      "expected switching away and back to Отклики not to replay one-time highlight"
    );

    // Проверка выбора предметов в Профиле и динамической фильтрации в «Учёбе», «Справочнике» и сайдбаре
    clickAction(envChat, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    clickAction(envChat, { a: "pf-subj-toggle", sid: "chem" });
    clickAction(envChat, { a: "pf-subj-toggle", sid: "math" });
    await flushMicrotasks(2);
    const profPickedHtml = envChat.elements.get("main").innerHTML;
    assert(
      profPickedHtml.includes('id="pf-t-math"') &&
      !profPickedHtml.includes('id="pf-t-chem"') &&
      profPickedHtml.includes('class="stu-notch-grid"') &&
      profPickedHtml.includes('<fieldset class="stu-notch-field">') &&
      profPickedHtml.includes('<legend><label for="pf-t-math">Математика</label></legend>') &&
      profPickedHtml.includes('class="stu-notch-input num"'),
      "expected toggling profile subjects to update target score fields dynamically"
    );
    envChat.emitDoc("submit", { target: { closest: () => ({ dataset: { f: "profile" } }) }, preventDefault() {} });
    await flushMicrotasks(6);
    clickAction(envChat, { a: "go", v: "tests" });
    await flushMicrotasks(4);
    const filteredTestsHtml = envChat.elements.get("main").innerHTML;
    const filteredSideSubjsHtml = envChat.elements.get("side-subjects").innerHTML;
    assert(
      filteredTestsHtml.includes('data-a="learn-pick-subject" data-sid="math"') &&
      !filteredTestsHtml.includes('data-a="learn-pick-subject" data-sid="chem"') &&
      filteredSideSubjsHtml.includes("Математика") &&
      !filteredSideSubjsHtml.includes("Химия"),
      "expected Учёба subject picker and sidebar to show Математика and hide deselected Химия"
    );
    clickAction(envChat, { a: "learn-pick-subject", sid: "math" });
    await flushMicrotasks(4);
    const mathTabHtml = envChat.elements.get("main").innerHTML;
    assert(
      mathTabHtml.includes(">Математика<") &&
      mathTabHtml.includes("Тренажёр скоро") &&
      mathTabHtml.includes("Найти репетитора"),
      "expected picking Математика in Учёба to display coming-soon card and Find Tutor CTA"
    );

    clickAction(envChat, { a: "learn-tab", tab: "guide" });
    await flushMicrotasks(4);
    const filteredGuideOverview = envChat.elements.get("main").innerHTML;
    assert(
      filteredGuideOverview.includes('id="guide-q"') &&
      filteredGuideOverview.includes("Биология") &&
      filteredGuideOverview.includes("Русский язык") &&
      !filteredGuideOverview.includes(">Химия<") &&
      !filteredGuideOverview.includes("guide-card"),
      "expected Учёба -> Справочник to render overview for selected content subjects only"
    );
    envChat.emitDoc("input", { target: { id: "guide-q", value: "электролиз", dataset: {} } });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("ничего не найдено"),
      "expected Справочник search to ignore deselected Химия topics"
    );
    envChat.emitDoc("input", { target: { id: "guide-q", value: "митоз", dataset: {} } });
    await flushMicrotasks(4);
    assert(
      envChat.elements.get("main").innerHTML.includes("guide-card") &&
      envChat.elements.get("main").innerHTML.includes("Митоз"),
      "expected Справочник search to return selected Биология results"
    );

    // Проверка отображения linkedProviders и ссылки mode=link без data-a="pf-link-google"
    const envLinkedOAuth = installGlobals({
      host: { backend: true },
      fetch: async (url) => {
        const resJson = (obj) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => obj });
        if (url === "/api/me") {
          return resJson({
            user: {
              id: 404,
              username: "alex_local",
              displayName: "Александр",
              email: "alex@gmail.com",
              authProvider: "local",
              role: "student",
              linkedProviders: {
                local: { connected: true },
                phone: { connected: false },
                google: { connected: true, email: "alex@gmail.com" },
                telegram: { connected: true, username: "alex_tg", botLinked: false }
              }
            },
            providers: { local: true, phone: true, google: true, telegram: false }
          });
        }
        if (url === "/api/docs") return resJson({ docs: { profile: { name: "Александр", contactVerified: true, phone: "+79142100511" } } });
        if (url === "/api/telegram/status") return resJson({ ok: true, linked: false, binding: null });
        if (url === "/api/tutors?limit=200") return resJson({ ok: true, tutors: [] });
        if (url === "/api/market/state") return resJson({ ok: true, wallet: { balanceRub: 0 }, bookings: [], notifications: [] });
        if (url.indexOf("/api/chats") === 0) return resJson({ ok: true, chats: [], unreadTotal: 0 });
        return resJson({ ok: true });
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envLinkedOAuth, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    const linkedProfHtml = envLinkedOAuth.elements.get("main").innerHTML;
    assert(
      linkedProfHtml.includes("alex@gmail.com") &&
      linkedProfHtml.includes("@alex_tg") &&
      linkedProfHtml.includes("Привязан ✓") &&
      !linkedProfHtml.includes("Привязать Google") &&
      !linkedProfHtml.includes("Привязать Telegram"),
      "expected profile with linkedProviders google+telegram to show Привязан ✓ instead of link buttons"
    );

    const envUnlinkedGoogleHref = installGlobals({
      host: { backend: true },
      fetch: async (url) => {
        const resJson = (obj) => ({ ok: true, status: 200, headers: { get: () => "application/json" }, json: async () => obj });
        if (url === "/api/me") {
          return resJson({
            user: {
              id: 405,
              username: "phone_u",
              displayName: "Мария",
              authProvider: "phone",
              role: "student",
              linkedProviders: {
                local: { connected: false },
                phone: { connected: true },
                google: { connected: false, email: "" },
                telegram: { connected: false, username: "", botLinked: false }
              }
            },
            providers: { local: true, phone: true, google: true, telegram: false }
          });
        }
        if (url === "/api/docs") return resJson({ docs: { profile: { name: "Мария", contactVerified: true, phone: "+79142100512" } } });
        if (url === "/api/telegram/status") return resJson({ ok: true, linked: false, binding: null });
        if (url === "/api/tutors?limit=200") return resJson({ ok: true, tutors: [] });
        if (url === "/api/market/state") return resJson({ ok: true, wallet: { balanceRub: 0 }, bookings: [], notifications: [] });
        if (url.indexOf("/api/chats") === 0) return resJson({ ok: true, chats: [], unreadTotal: 0 });
        return resJson({ ok: true });
      }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(12);
    clickAction(envUnlinkedGoogleHref, { a: "go", v: "profile" });
    await flushMicrotasks(4);
    const unlinkedProfHtml = envUnlinkedGoogleHref.elements.get("main").innerHTML;
    assert(
      unlinkedProfHtml.includes('href="/api/auth/google/start?mode=link&role=student&next=') &&
      unlinkedProfHtml.includes(">Привязать Google</a>") &&
      !unlinkedProfHtml.includes('data-a="pf-link-google"'),
      "expected server Google link anchor without data-a interception"
    );

    // Проверка интерфейса ИИ-помощника преподавателя (/teacher-agent + виджет в календаре)
    const envTeacherAgent = installGlobals({
      host: { backend: true, demoMode: true, site: "tutor", view: "teacher-agent" }
    });
    loadScripts(dataScripts);
    vmRun(readFileText("frontend/app.js"), "frontend/app.js");
    await flushMicrotasks(8);
    assert(typeof globalThis.EGE.views.teacherAgent === "object", "expected EGE.views.teacherAgent loaded");
    const taHtml = envTeacherAgent.elements.get("main").innerHTML;
    assert(
      taHtml.includes('id="ta-workspace"') &&
      taHtml.includes("Помощник преподавателя вуза") &&
      taHtml.includes('id="ta-chat-input"'),
      "expected direct /teacher-agent entry to open workspace without auth wall"
    );
    clickAction(envTeacherAgent, { a: "ta-tab", tab: "schedule" });
    await flushMicrotasks(1);
    assert(
      envTeacherAgent.elements.get("main").innerHTML.includes("ИС-21") &&
      envTeacherAgent.elements.get("main").innerHTML.includes("ПИ-22"),
      "expected teacher-agent schedule tab with university groups"
    );
    clickAction(envTeacherAgent, { a: "ta-tab", tab: "courses" });
    await flushMicrotasks(1);
    assert(
      envTeacherAgent.elements.get("main").innerHTML.includes("Базы данных") &&
      envTeacherAgent.elements.get("main").innerHTML.includes("Анализ данных"),
      "expected teacher-agent courses tab with Stepik-template courses"
    );
    clickAction(envTeacherAgent, { a: "ta-tab", tab: "chat" });
    await flushMicrotasks(1);
    assert(envTeacherAgent.elements.get("main").innerHTML.includes("Староста ИС-21"), "expected group student chat tab");
    clickAction(envTeacherAgent, { a: "ta-tab", tab: "journal" });
    await flushMicrotasks(1);
    assert(envTeacherAgent.elements.get("main").innerHTML.includes("Журнал публикаций"), "expected publication journal tab");
    clickAction(envTeacherAgent, { a: "auth-guest" });
    await flushMicrotasks(2);
    clickAction(envTeacherAgent, { a: "go", v: "tutor-calendar" });
    await flushMicrotasks(2);
    assert(
      envTeacherAgent.elements.get("main").innerHTML.includes('id="ta-cal-widget"') &&
      envTeacherAgent.elements.get("main").innerHTML.includes("SQL JOIN"),
      "expected university schedule widget in tutor calendar tab"
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
