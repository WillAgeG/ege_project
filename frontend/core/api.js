/* Централизованный HTTP API-клиент платформы «Вектор» (window.EGE.api).
   Полностью изолирован от UI-Kit и DOM-рендеринга; работает как с same-origin backend,
   так и с отдельным headless API-сервером через configure({ baseUrl }). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const LS_API_BASE_KEY = "vektor-ege:api-base";

  let _configuredBaseUrl = null;
  let _onUnauthorized = null;

  function isPlainObj(v) {
    return !!v && typeof v === "object" && !Array.isArray(v);
  }

  function normalizeBaseUrl(val) {
    if (val == null) return "";
    return String(val).trim().replace(/\/+$/, "");
  }

  function configure(opts) {
    opts = opts || {};
    if (Object.prototype.hasOwnProperty.call(opts, "baseUrl")) {
      _configuredBaseUrl = opts.baseUrl == null ? null : normalizeBaseUrl(opts.baseUrl);
    }
    if (Object.prototype.hasOwnProperty.call(opts, "onUnauthorized")) {
      _onUnauthorized = typeof opts.onUnauthorized === "function" ? opts.onUnauthorized : null;
    }
    return { baseUrl: getBaseUrl() };
  }

  function getBaseUrl() {
    if (_configuredBaseUrl !== null) return _configuredBaseUrl;
    if (root.EGE_HOST && typeof root.EGE_HOST.apiBaseUrl === "string" && root.EGE_HOST.apiBaseUrl.trim()) {
      return normalizeBaseUrl(root.EGE_HOST.apiBaseUrl);
    }
    try {
      if (root.localStorage && typeof root.localStorage.getItem === "function") {
        const stored = root.localStorage.getItem(LS_API_BASE_KEY);
        if (stored && stored.trim()) return normalizeBaseUrl(stored);
      }
    } catch (e) { /* localStorage недоступен */ }
    return "";
  }

  function resolveUrl(path) {
    const p = String(path || "");
    if (/^https?:\/\//i.test(p)) return p;
    const cleanPath = p.startsWith("/") ? p : ("/" + p);
    const base = getBaseUrl();
    return base ? (base + cleanPath) : cleanPath;
  }

  function isCrossOrigin(baseUrl) {
    if (!baseUrl || baseUrl.startsWith("/")) return false;
    if (!/^https?:\/\//i.test(baseUrl)) return false;
    const locOrigin = root.location && root.location.origin && root.location.origin !== "null" ? root.location.origin : "";
    if (!locOrigin) return true;
    try {
      if (typeof URL === "function") {
        return new URL(baseUrl, locOrigin).origin !== locOrigin;
      }
    } catch (e) { /* игнор */ }
    return !baseUrl.startsWith(locOrigin);
  }

  function buildQuery(params) {
    if (!isPlainObj(params)) return "";
    const parts = [];
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null || v === "") return;
      parts.push(encodeURIComponent(k) + "=" + encodeURIComponent(String(v)));
    });
    return parts.length ? ("?" + parts.join("&")) : "";
  }

  async function request(path, opts) {
    opts = opts || {};
    const fetchFn = opts.fetch || root.fetch;
    if (typeof fetchFn !== "function") {
      throw Object.assign(new Error("Нет связи с сервером."), { code: "unavailable", status: 0 });
    }

    const url = resolveUrl(path);
    const headers = Object.assign({}, opts.headers || {});
    let body = opts.body;
    const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
    if (body != null && !isFormData) {
      if (typeof body !== "string") body = JSON.stringify(body);
      if (!headers["Content-Type"] && !headers["content-type"]) {
        headers["Content-Type"] = "application/json";
      }
    }

    const base = getBaseUrl();
    const credentials = opts.credentials || (isCrossOrigin(base) ? "include" : "same-origin");
    const fetchOpts = Object.assign({}, opts, { credentials, headers });
    if (body !== undefined) fetchOpts.body = body;
    delete fetchOpts.skipUnauthorizedHook;
    delete fetchOpts.fetch;

    let res;
    try {
      res = await fetchFn(url, fetchOpts);
    } catch (e) {
      if (e && e.name === "AbortError") {
        throw Object.assign(new Error("cancelled"), { code: "cancelled", status: 0 });
      }
      throw Object.assign(new Error("Нет связи с сервером."), { code: "unavailable", status: 0 });
    }

    let data = null;
    const ct = (res && res.headers && typeof res.headers.get === "function" ? res.headers.get("content-type") : "") || "";
    if (ct.includes("json") && res && typeof res.json === "function") {
      try { data = await res.json(); } catch (e) { data = null; }
    }

    if (!res || !res.ok) {
      const status = res ? (Number(res.status) || 0) : 0;
      const payload = (data && isPlainObj(data.detail)) ? data.detail : (isPlainObj(data) ? data : {});
      const rawDetail = data && typeof data.detail === "string" ? data.detail : "";
      const code = payload.code || (status === 401 ? "unauthorized" : status === 413 ? "quota_exceeded" : status >= 500 ? "unavailable" : "http_" + status);
      const err = new Error(payload.message || rawDetail || ("Ошибка сервера (" + status + ")"));
      err.code = code;
      err.status = status;
      if (status === 401 && typeof _onUnauthorized === "function" && !opts.skipUnauthorizedHook) {
        try { _onUnauthorized(err); } catch (_) {}
      }
      throw err;
    }

    return data;
  }

  EGE.api = {
    configure,
    getBaseUrl,
    request,

    health() {
      return request("/api/health", { method: "GET" });
    },
    storageHealth() {
      return request("/api/health/storage", { method: "GET" });
    },

    auth: {
      me() {
        return request("/api/me", { method: "GET" });
      },
      login(body) {
        return request("/api/auth/login", { method: "POST", body: body || {} });
      },
      register(body) {
        return request("/api/auth/register", { method: "POST", body: body || {} });
      },
      logout() {
        return request("/api/auth/logout", { method: "POST" });
      },
      telegramLogin(body) {
        return request("/api/auth/telegram/login", { method: "POST", body: body || {} });
      },
      exportData() {
        return request("/api/me/export", { method: "GET" });
      },
      deleteAccount() {
        return request("/api/me", { method: "DELETE" });
      }
    },

    docs: {
      list() {
        return request("/api/docs", { method: "GET" });
      },
      patch(name, patch) {
        return request("/api/docs/" + encodeURIComponent(name), { method: "PATCH", body: patch || {} });
      },
      put(name, data) {
        return request("/api/docs/" + encodeURIComponent(name), { method: "PUT", body: data || {} });
      }
    },

    calendar: {
      state(tutorSlug) {
        return request("/api/calendar/state" + buildQuery({ tutor_slug: tutorSlug }), { method: "GET" });
      },
      sync(payload) {
        return request("/api/calendar/sync", { method: "PUT", body: payload || {} });
      },
      importIcs(payload) {
        return request("/api/calendar/import-ics", { method: "POST", body: payload || {} });
      }
    },

    realtime: {
      recent(params) {
        params = params || {};
        return request("/api/realtime/recent" + buildQuery({
          channel: params.channel,
          tutor_slug: params.tutorSlug != null ? params.tutorSlug : params.tutor_slug,
          since_id: params.sinceId != null ? params.sinceId : params.since_id,
          limit: params.limit
        }), { method: "GET" });
      },
      publish(payload) {
        return request("/api/realtime/publish", { method: "POST", body: payload || {} });
      }
    },

    market: {
      state() {
        return request("/api/market/state", { method: "GET" });
      },
      directions() {
        return request("/api/market/directions", { method: "GET" });
      },
      discoverDirection(payload) {
        return request("/api/market/directions/discover", { method: "POST", body: payload || {} });
      }
    },

    wallet: {
      get() {
        return request("/api/wallet", { method: "GET" });
      },
      topup(payload) {
        return request("/api/wallet/topup", { method: "POST", body: payload || {} });
      },
      addCard(payload) {
        return request("/api/wallet/cards", { method: "POST", body: payload || {} });
      },
      deleteCard(cardId) {
        return request("/api/wallet/cards/" + encodeURIComponent(cardId), { method: "DELETE" });
      }
    },

    payments: {
      topup(payload) {
        return request("/api/payments/topup", { method: "POST", body: payload || {} });
      },
      listIntents(limit) {
        return request("/api/payments/intents" + buildQuery({ limit }), { method: "GET" });
      },
      getIntent(intentId) {
        return request("/api/payments/intents/" + encodeURIComponent(intentId), { method: "GET" });
      },
      listRefunds(limit) {
        return request("/api/payments/refunds" + buildQuery({ limit }), { method: "GET" });
      },
      requestRefund(payload) {
        return request("/api/payments/refunds", { method: "POST", body: payload || {} });
      }
    },

    tutors: {
      list(params) {
        return request("/api/tutors" + buildQuery(params), { method: "GET" });
      }
    },

    chats: {
      list(params) {
        params = params || {};
        return request("/api/chats" + buildQuery({ role: params.role, limit: params.limit }), { method: "GET" });
      },
      messages(threadId, params) {
        params = params || {};
        return request(
          "/api/chats/" + encodeURIComponent(threadId) + "/messages" + buildQuery({ role: params.role, limit: params.limit }),
          { method: "GET" }
        );
      },
      send(threadId, payload) {
        payload = payload || {};
        const files = Array.isArray(payload.files) ? payload.files : [];
        let body;
        if (files.length) {
          if (typeof FormData !== "undefined") {
            const fd = new FormData();
            fd.append("body", String(payload.body || ""));
            if (payload.bookingId) fd.append("bookingId", String(payload.bookingId));
            if (payload.tutorId) fd.append("tutorId", String(payload.tutorId));
            if (payload.role) fd.append("role", String(payload.role));
            files.forEach((f) => {
              if (f) fd.append("files", f);
            });
            body = fd;
          } else {
            body = Object.assign({}, payload, { files });
          }
        } else {
          body = payload;
        }
        return request("/api/chats/" + encodeURIComponent(threadId) + "/messages", {
          method: "POST",
          body
        });
      },
      markRead(threadId, params) {
        params = params || {};
        return request(
          "/api/chats/" + encodeURIComponent(threadId) + "/read" + buildQuery({ role: params.role }),
          { method: "POST", body: {} }
        );
      },
      remindLesson(threadId, payload) {
        return request("/api/chats/" + encodeURIComponent(threadId) + "/remind-lesson", {
          method: "POST",
          body: payload || {}
        });
      },
      remindPayment(threadId, payload) {
        return request("/api/chats/" + encodeURIComponent(threadId) + "/remind-payment", {
          method: "POST",
          body: payload || {}
        });
      }
    },

    bookings: {
      list(params) {
        params = params || {};
        return request("/api/bookings" + buildQuery({
          scope: params.scope,
          tutor_id: params.tutorId != null ? params.tutorId : params.tutor_id,
          limit: params.limit
        }), { method: "GET" });
      },
      create(payload) {
        return request("/api/bookings", { method: "POST", body: payload || {} });
      },
      accept(bookingId, payload) {
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/accept", {
          method: "POST",
          body: payload || {}
        });
      },
      counter(bookingId, counterPrice) {
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/counter", {
          method: "POST",
          body: { counterPrice: Number(counterPrice) }
        });
      },
      cancel(bookingId) {
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/cancel", { method: "POST" });
      },
      complete(bookingId) {
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/complete", { method: "POST" });
      },
      updateSchedule(bookingId, schedulePlan) {
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/schedule", {
          method: "PATCH",
          body: { schedulePlan: schedulePlan || {} }
        });
      },
      updateTelemost(bookingId, url, role) {
        const body = { url: String(url || "") };
        if (role) body.role = String(role);
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/telemost", {
          method: "PATCH",
          body
        });
      }
    },

    leads: {
      list(params) {
        return request("/api/leads" + buildQuery(params), { method: "GET" });
      },
      create(payload) {
        return request("/api/leads", { method: "POST", body: payload || {} });
      },
      remove(leadId) {
        return request("/api/leads/" + encodeURIComponent(leadId), { method: "DELETE" });
      }
    },

    contacts: {
      list() {
        return request("/api/contacts", { method: "GET" });
      },
      upsert(tutorId, payload) {
        return request("/api/contacts/" + encodeURIComponent(tutorId), {
          method: "PUT",
          body: payload || {}
        });
      }
    },

    tutor: {
      summary(tutorId) {
        return request("/api/tutor/summary" + buildQuery({ tutor_id: tutorId }), { method: "GET" });
      },
      updateAccount(payload) {
        return request("/api/tutor/account", { method: "PUT", body: payload || {} });
      },
      listProfiles() {
        return request("/api/tutor/profiles", { method: "GET" });
      },
      createProfile(payload) {
        return request("/api/tutor/profiles", { method: "POST", body: payload || {} });
      },
      updateProfile(tutorId, payload) {
        return request("/api/tutor/profiles/" + encodeURIComponent(tutorId), { method: "PUT", body: payload || {} });
      },
      setProfilePublished(tutorId, published) {
        return request("/api/tutor/profiles/" + encodeURIComponent(tutorId) + "/publish", {
          method: "PATCH",
          body: { published: !!published }
        });
      },
      deleteProfile(tutorId) {
        return request("/api/tutor/profiles/" + encodeURIComponent(tutorId), { method: "DELETE" });
      },
      upsertProfile(payload) {
        return request("/api/tutor/profile", { method: "PUT", body: payload || {} });
      },
      bump(tutorId) {
        return request("/api/tutor/bump" + buildQuery({ tutor_id: tutorId }), { method: "POST" });
      },
      createPayout(payload) {
        return request("/api/tutor/payouts", { method: "POST", body: payload || {} });
      },
      sbpBanks() {
        return request("/api/payouts/sbp-banks", { method: "GET" });
      },
      checkNpdInn(inn, save, tutorId) {
        return request("/api/tutor/npd/check-inn", {
          method: "POST",
          body: { inn: String(inn || ""), save: save !== false, tutorId: tutorId || null }
        });
      },
      attachNpdReceipt(payoutId, receiptUrl) {
        return request("/api/tutor/payouts/" + encodeURIComponent(payoutId) + "/npd-receipt", {
          method: "POST",
          body: { receiptUrl: String(receiptUrl || "") }
        });
      }
    },

    tutorApplications: {
      create(payload) {
        return request("/api/tutor-applications", { method: "POST", body: payload || {} });
      }
    },

    reviews: {
      list(tutorId) {
        return request("/api/tutors/" + encodeURIComponent(tutorId) + "/reviews", { method: "GET" });
      },
      create(tutorId, payload) {
        return request("/api/tutors/" + encodeURIComponent(tutorId) + "/reviews", {
          method: "POST",
          body: payload || {}
        });
      }
    },

    disputes: {
      list() {
        return request("/api/disputes", { method: "GET" });
      },
      open(bookingId, payload) {
        return request("/api/bookings/" + encodeURIComponent(bookingId) + "/dispute", {
          method: "POST",
          body: payload || {}
        });
      }
    },

    telegram: {
      status() {
        return request("/api/telegram/status", { method: "GET" });
      },
      linkToken() {
        return request("/api/telegram/link-token", { method: "POST" });
      },
      unlink() {
        return request("/api/telegram/binding", { method: "DELETE" });
      },
      setNotifications(enabled) {
        return request("/api/telegram/notifications", {
          method: "PATCH",
          body: { enabled: !!enabled }
        });
      }
    },

    media: {
      uploadAvatar(file, target) {
        const fd = typeof FormData !== "undefined" ? new FormData() : { file, target: target || "profile" };
        if (fd && typeof fd.append === "function") {
          fd.append("file", file);
          fd.append("target", String(target || "profile"));
        }
        return request("/api/media/avatar", { method: "POST", body: fd });
      }
    },

    verifications: {
      list() {
        return request("/api/tutor/verifications", { method: "GET" });
      },
      upload(file, opts) {
        opts = opts || {};
        const fd = typeof FormData !== "undefined" ? new FormData() : { file, opts };
        if (fd && typeof fd.append === "function") {
          fd.append("file", file);
          fd.append("doc_type", String(opts.docType || "diploma"));
          if (opts.title) fd.append("title", String(opts.title));
          if (opts.comment) fd.append("comment", String(opts.comment));
          if (opts.tutorId) fd.append("tutor_id", String(opts.tutorId));
        }
        return request("/api/tutor/verifications", { method: "POST", body: fd });
      }
    },

    feedback: {
      submit(payload) {
        payload = payload || {};
        const files = Array.isArray(payload.files) ? payload.files : [];
        let body;
        if (typeof FormData !== "undefined") {
          const fd = new FormData();
          fd.append("kind", String(payload.kind || "bug"));
          fd.append("subject", String(payload.subject || ""));
          fd.append("message", String(payload.message || ""));
          fd.append("contact", String(payload.contact || ""));
          fd.append("author_name", String(payload.authorName || ""));
          fd.append("page_url", String(payload.pageUrl || ""));
          fd.append("context_json", JSON.stringify(payload.context || {}));
          files.forEach((f) => {
            if (f) fd.append("files", f);
          });
          body = fd;
        } else {
          body = Object.assign({}, payload, { files });
        }
        return request("/api/feedback", { method: "POST", body });
      }
    }
  };
})();
