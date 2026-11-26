/* Веб-аналитика (Яндекс Метрика), строго подчинённая согласию cookie-баннера (152-ФЗ). */
(function (root) {
  "use strict";
  const EGE = (root.EGE = root.EGE || {});
  const YM_COOKIES = ["_ym_uid", "_ym_d", "_ym_isad", "_ym_visorc", "_ym_debug"];

  const state = {
    counterId: null,
    active: false,
    initialized: false,
    scriptInjected: false,
    webvisor: false,
    hitsCount: 0,
    lastHitPath: ""
  };

  function getHostConfig() {
    const h = root.EGE_HOST;
    return h && typeof h === "object" ? h : {};
  }

  function resolveCounterId() {
    const raw = String(getHostConfig().ymId || "").trim();
    if (!/^\d{4,15}$/.test(raw)) return null;
    return raw;
  }

  function isBrandbookContext() {
    const h = getHostConfig();
    if (h.site === "brandbook" || h.uikitStandalone) return true;
    try {
      if (typeof location !== "undefined" && typeof location.pathname === "string") {
        if (location.pathname === "/brandbook" || location.pathname.indexOf("/brandbook/") === 0) {
          return true;
        }
      }
    } catch (e) { /* игнор */ }
    return false;
  }

  function isAllowed(consent) {
    const id = resolveCounterId();
    if (!id || isBrandbookContext()) return false;
    return !!(consent && consent.analytics === true);
  }

  function expireYmCookies() {
    try {
      if (typeof document === "undefined" || typeof document.cookie !== "string") return;
      for (let i = 0; i < YM_COOKIES.length; i++) {
        document.cookie = YM_COOKIES[i] + "=; Max-Age=0; path=/; SameSite=Lax";
      }
    } catch (e) { /* игнор */ }
  }

  function ensureYmQueue() {
    if (typeof root.ym === "function") return;
    root.ym = function () {
      (root.ym.a = root.ym.a || []).push(arguments);
    };
    root.ym.l = Date.now();
  }

  function injectMetrikaScript(counterId) {
    if (state.scriptInjected) return;
    try {
      if (typeof document === "undefined" || typeof document.createElement !== "function") return;
      const hostEl = document.head || document.body;
      if (!hostEl || typeof hostEl.appendChild !== "function") return;
      if (typeof document.querySelector === "function") {
        const existing = document.querySelector('script[data-vektor-ym="' + counterId + '"]');
        if (existing) {
          state.scriptInjected = true;
          return;
        }
      }
      const s = document.createElement("script");
      s.async = true;
      s.src = "https://mc.yandex.ru/metrika/tag.js";
      if (s.dataset) s.dataset.vektorYm = counterId;
      hostEl.appendChild(s);
      state.scriptInjected = true;
    } catch (e) { /* игнор */ }
  }

  function syncConsent(consent) {
    const id = resolveCounterId();
    const host = getHostConfig();
    state.counterId = id;
    state.webvisor = !!host.ymWebvisor;

    if (!id) {
      state.active = false;
      return getState();
    }

    if (isAllowed(consent)) {
      root["disableYaCounter" + id] = false;
      state.active = true;
      ensureYmQueue();
      if (!state.initialized) {
        root.ym(Number(id), "init", {
          clickmap: true,
          trackLinks: true,
          accurateTrackBounce: true,
          webvisor: state.webvisor
        });
        state.initialized = true;
      }
      injectMetrikaScript(id);
    } else {
      state.active = false;
      root["disableYaCounter" + id] = true;
      expireYmCookies();
    }
    return getState();
  }

  function trackPageView(path, title) {
    if (!state.active || !state.counterId || typeof root.ym !== "function") return false;
    const cleanPath = String(path || (typeof location !== "undefined" ? (location.pathname + (location.hash || "")) : "/"));
    if (state.lastHitPath === cleanPath) return false;
    state.lastHitPath = cleanPath;
    state.hitsCount += 1;
    try {
      root.ym(Number(state.counterId), "hit", cleanPath, title ? { title: String(title) } : undefined);
    } catch (e) { /* игнор */ }
    return true;
  }

  function reachGoal(goalName, params) {
    if (!state.active || !state.counterId || typeof root.ym !== "function") return false;
    const name = String(goalName || "").trim();
    if (!name) return false;
    try {
      root.ym(Number(state.counterId), "reachGoal", name, params && typeof params === "object" ? params : undefined);
    } catch (e) { /* игнор */ }
    return true;
  }

  function getState() {
    return {
      counterId: state.counterId || resolveCounterId(),
      active: state.active,
      initialized: state.initialized,
      scriptInjected: state.scriptInjected,
      webvisor: state.webvisor,
      hitsCount: state.hitsCount,
      lastHitPath: state.lastHitPath
    };
  }

  EGE.analytics = {
    getCounterId: resolveCounterId,
    isAllowed: isAllowed,
    syncConsent: syncConsent,
    trackPageView: trackPageView,
    reachGoal: reachGoal,
    getState: getState
  };
})(typeof window !== "undefined" ? window : globalThis);
