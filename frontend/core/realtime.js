/* Realtime SSE / WebSocket / BroadcastChannel клиент и двусторонняя .ics / Google Calendar синхронизация. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});

  const CHANNEL_NAME = "vektor-ege-realtime";
  const DAY_BY_UTC_DAY = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const DAY_LABELS = { mon: "Пн", tue: "Вт", wed: "Ср", thu: "Чт", fri: "Пт", sat: "Сб", sun: "Вс" };

  let es = null;
  let ws = null;
  let bc = null;
  let localSeq = 0;

  const eventListeners = new Set();
  const stateListeners = new Set();
  const seenEventIds = new Set();

  const state = {
    mode: "local",
    channel: "tutor",
    tutorSlug: "",
    latestId: 0,
    unreadCount: 0,
    events: [],
    calendar: {
      feedToken: "demo-tutor",
      tutorSlug: "demo-tutor",
      timezone: "UTC+9",
      ianaTimezone: "Asia/Yakutsk",
      eventCount: 0,
      busySlots: [],
      conflicts: [],
      icsUrl: "/api/calendar/demo-tutor.ics",
      webcalUrl: "webcal://localhost/api/calendar/demo-tutor.ics",
      googleSubscribeUrl: "https://calendar.google.com/calendar/u/0/r?cid=" + encodeURIComponent("/api/calendar/demo-tutor.ics"),
      googleTemplateUrl: "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Урок ЕГЭ · Вектор ЕГЭ") + "&ctz=Asia%2FYakutsk"
    }
  };

  function hasBackend() {
    return !!(root.EGE_HOST && root.EGE_HOST.backend);
  }

  function cloneCalendar(cal) {
    return {
      feedToken: cal.feedToken,
      tutorSlug: cal.tutorSlug,
      timezone: cal.timezone,
      ianaTimezone: cal.ianaTimezone,
      eventCount: cal.eventCount,
      busySlots: Array.isArray(cal.busySlots) ? cal.busySlots.map(s => Object.assign({}, s)) : [],
      conflicts: Array.isArray(cal.conflicts) ? cal.conflicts.map(c => Object.assign({}, c)) : [],
      icsUrl: cal.icsUrl,
      webcalUrl: cal.webcalUrl,
      googleSubscribeUrl: cal.googleSubscribeUrl,
      googleTemplateUrl: cal.googleTemplateUrl
    };
  }

  function getState() {
    return {
      mode: state.mode,
      channel: state.channel,
      tutorSlug: state.tutorSlug,
      latestId: state.latestId,
      unreadCount: state.unreadCount,
      events: state.events.slice(),
      calendar: cloneCalendar(state.calendar)
    };
  }

  function emitState() {
    const snap = getState();
    stateListeners.forEach(fn => {
      try { fn(snap); } catch (_) {}
    });
  }

  function normalizeEvent(raw) {
    raw = raw || {};
    const id = raw.id != null ? String(raw.id) : ("loc-" + (++localSeq));
    return {
      id,
      channel: raw.channel || state.channel || "tutor",
      eventType: raw.eventType || raw.event_type || "notice",
      title: raw.title || "",
      message: raw.message || "",
      tutorSlug: raw.tutorSlug || raw.tutor_slug || state.tutorSlug || "",
      payload: raw.payload || {},
      createdAt: raw.createdAt || raw.created_at || new Date().toISOString()
    };
  }

  function dispatchEvent(raw, opts) {
    opts = opts || {};
    const evt = normalizeEvent(raw);
    const dedupKey = evt.id + "|" + evt.eventType + "|" + evt.tutorSlug;
    if (seenEventIds.has(dedupKey)) return evt;
    seenEventIds.add(dedupKey);
    if (seenEventIds.size > 400) {
      const first = seenEventIds.values().next().value;
      if (first !== undefined) seenEventIds.delete(first);
    }

    const numId = Number(evt.id);
    if (!Number.isNaN(numId) && numId > state.latestId) state.latestId = numId;
    state.events = [evt].concat(state.events).slice(0, 50);
    if (!opts.silent) state.unreadCount += 1;

    eventListeners.forEach(fn => {
      try { fn(evt); } catch (_) {}
    });
    emitState();
    return evt;
  }

  function ensureBroadcastChannel() {
    if (bc || typeof BroadcastChannel !== "function") return;
    try {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = function (ev) {
        const msg = ev && ev.data;
        if (!msg || msg.kind !== "rt-event" || !msg.event) return;
        dispatchEvent(msg.event);
      };
    } catch (_) {
      bc = null;
    }
  }

  function closeTransports() {
    if (es) {
      try { es.close(); } catch (_) {}
      es = null;
    }
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
  }

  function buildStreamPath(base, opts) {
    const params = [];
    if (opts.channel) params.push("channel=" + encodeURIComponent(opts.channel));
    if (opts.tutorSlug) params.push("tutor_slug=" + encodeURIComponent(opts.tutorSlug));
    if (opts.sinceId) params.push("since_id=" + encodeURIComponent(String(opts.sinceId)));
    return base + (params.length ? "?" + params.join("&") : "");
  }

  function connect(opts) {
    opts = opts || {};
    if (opts.channel) state.channel = String(opts.channel);
    if (opts.tutorSlug !== undefined) state.tutorSlug = String(opts.tutorSlug || "");
    ensureBroadcastChannel();
    closeTransports();

    if (hasBackend() && typeof EventSource === "function") {
      state.mode = "connecting";
      emitState();
      try {
        const url = buildStreamPath("/api/realtime/stream", {
          channel: state.channel,
          tutorSlug: state.tutorSlug,
          sinceId: opts.sinceId || state.latestId
        });
        es = new EventSource(url);
        es.addEventListener("connected", function (ev) {
          let data = {};
          try { data = JSON.parse(ev.data || "{}"); } catch (_) {}
          state.mode = data.transport === "ws" ? "ws" : "sse";
          if (Number(data.latestId || 0) > state.latestId) state.latestId = Number(data.latestId);
          if (Array.isArray(data.events)) {
            data.events.forEach(item => dispatchEvent(item, { silent: true }));
          }
          emitState();
        });
        es.addEventListener("message", function (ev) {
          let data = null;
          try { data = JSON.parse(ev.data || "null"); } catch (_) {}
          if (data) dispatchEvent(data);
        });
        es.onerror = function () {
          if (state.mode !== "local") {
            state.mode = "local";
            emitState();
          }
        };
      } catch (_) {
        state.mode = "local";
        emitState();
      }
    } else {
      state.mode = "local";
      emitState();
    }
    return getState();
  }

  function connectWS(opts) {
    opts = opts || {};
    if (opts.channel) state.channel = String(opts.channel);
    if (opts.tutorSlug !== undefined) state.tutorSlug = String(opts.tutorSlug || "");
    ensureBroadcastChannel();
    closeTransports();

    if (hasBackend() && typeof WebSocket === "function" && root.location && root.location.host) {
      state.mode = "connecting";
      emitState();
      try {
        const proto = root.location.protocol === "https:" ? "wss:" : "ws:";
        const path = buildStreamPath("/api/realtime/ws", {
          channel: state.channel,
          tutorSlug: state.tutorSlug
        });
        ws = new WebSocket(proto + "//" + root.location.host + path);
        ws.onopen = function () {
          state.mode = "ws";
          emitState();
        };
        ws.onmessage = function (ev) {
          let msg = null;
          try { msg = JSON.parse(ev.data || "null"); } catch (_) {}
          if (!msg) return;
          if (msg.type === "event" && msg.event) dispatchEvent(msg.event);
        };
        ws.onerror = function () {
          state.mode = "local";
          emitState();
        };
        ws.onclose = function () {
          if (state.mode === "ws") {
            state.mode = "local";
            emitState();
          }
        };
      } catch (_) {
        state.mode = "local";
        emitState();
      }
    } else {
      state.mode = "local";
      emitState();
    }
    return getState();
  }

  function disconnect() {
    closeTransports();
    if (bc) {
      try { bc.close(); } catch (_) {}
      bc = null;
    }
    state.mode = "local";
    emitState();
  }

  function publish(rawEvent) {
    ensureBroadcastChannel();
    const evt = dispatchEvent(rawEvent, { silent: !!(rawEvent && rawEvent.silent) });
    if (bc) {
      try { bc.postMessage({ kind: "rt-event", event: evt }); } catch (_) {}
    }
    if (hasBackend() && typeof fetch === "function") {
      return fetch("/api/realtime/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({
          channel: evt.channel,
          eventType: evt.eventType,
          title: evt.title,
          message: evt.message,
          tutorSlug: evt.tutorSlug,
          payload: evt.payload
        })
      }).then(res => res.ok ? res.json() : { ok: false, event: evt }).catch(() => ({ ok: true, local: true, event: evt }));
    }
    return Promise.resolve({ ok: true, local: true, event: evt });
  }

  function onEvent(fn) {
    if (typeof fn !== "function") return function () {};
    eventListeners.add(fn);
    return function () { eventListeners.delete(fn); };
  }

  function onStateChange(fn) {
    if (typeof fn !== "function") return function () {};
    stateListeners.add(fn);
    return function () { stateListeners.delete(fn); };
  }

  function clearUnread() {
    state.unreadCount = 0;
    emitState();
  }

  function tzOffsetHours(timezone) {
    return timezone === "UTC+3" ? 3 : 9;
  }

  function tzIana(timezone) {
    return timezone === "UTC+3" ? "Europe/Moscow" : "Asia/Yakutsk";
  }

  function parseIcsTimestampToSlot(rawValue, timezone) {
    const m = String(rawValue || "").trim().match(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?/i);
    if (!m) return null;
    const year = Number(m[1]);
    const month = Number(m[2]) - 1;
    const dayOfMonth = Number(m[3]);
    const hour = Number(m[4]);
    const minute = Number(m[5]);
    const second = Number(m[6] || 0);
    const isUtc = !!m[7];

    const utcMs = Date.UTC(year, month, dayOfMonth, hour, minute, second);
    const shiftedMs = isUtc ? (utcMs + tzOffsetHours(timezone) * 3600000) : utcMs;
    const shifted = new Date(shiftedMs);
    const dayKey = DAY_BY_UTC_DAY[shifted.getUTCDay()];
    const localHour = String(shifted.getUTCHours()).padStart(2, "0") + ":00";
    return {
      day: dayKey,
      dayLabel: DAY_LABELS[dayKey] || dayKey,
      hour: localHour,
      startUtc: isUtc ? new Date(utcMs).toISOString() : ""
    };
  }

  function normalizeBusySlot(s) {
    s = s || {};
    const hasDow = s.dow !== undefined && s.dow !== null && s.dow !== "";
    const dowNum = hasDow ? Number(s.dow) : NaN;
    const dayFromDow = (!Number.isNaN(dowNum) && dowNum >= 0 && dowNum <= 6) ? DAY_BY_UTC_DAY[dowNum] : "";
    const day = s.day || dayFromDow || "";
    const dayLabel = s.dayLabel || (day ? (DAY_LABELS[day] || day) : "");
    const key = s.key || (day && s.hour ? (day + "|" + s.hour) : "");
    return Object.assign({}, s, { day, dayLabel, key });
  }

  function normalizeOpenSlotSet(openSlots) {
    const set = new Set();
    if (!openSlots) return set;
    if (Array.isArray(openSlots)) {
      openSlots.forEach(item => {
        if (typeof item === "string") set.add(item);
        else if (item && item.day && item.hour) set.add(item.day + "|" + item.hour);
      });
    } else if (typeof openSlots === "object") {
      Object.keys(openSlots).forEach(k => {
        const val = openSlots[k];
        if (Array.isArray(val)) {
          const keyStr = String(k).trim();
          const dayKey = /^\d+$/.test(keyStr) ? (DAY_BY_UTC_DAY[Number(keyStr)] || keyStr) : keyStr.toLowerCase();
          val.forEach(hr => {
            if (hr) set.add(dayKey + "|" + String(hr).trim());
          });
        } else if (val) {
          set.add(k);
        }
      });
    }
    return set;
  }

  function parseIcsBusySlots(icsText, timezone, openSlots) {
    const tz = timezone === "UTC+3" ? "UTC+3" : "UTC+9";
    const text = String(icsText || "").replace(/\r\n[ \t]/g, "").replace(/\r\n/g, "\n");
    const blocks = text.split(/BEGIN:VEVENT/i).slice(1);
    const openSet = normalizeOpenSlotSet(openSlots);
    const seen = new Set();
    const busySlots = [];
    const conflicts = [];
    let importedCount = 0;

    blocks.forEach(block => {
      const endIdx = block.search(/END:VEVENT/i);
      const body = endIdx >= 0 ? block.slice(0, endIdx) : block;
      const dtStartMatch = body.match(/^DTSTART[^:]*:([^\n]+)/mi);
      if (!dtStartMatch) return;
      const summaryMatch = body.match(/^SUMMARY[^:]*:([^\n]+)/mi);
      const summary = summaryMatch ? summaryMatch[1].trim() : "Занято в GCal";
      const parsed = parseIcsTimestampToSlot(dtStartMatch[1], tz);
      if (!parsed) return;
      importedCount += 1;
      const key = parsed.day + "|" + parsed.hour;
      if (seen.has(key)) return;
      seen.add(key);
      const slot = {
        key,
        day: parsed.day,
        dayLabel: parsed.dayLabel,
        hour: parsed.hour,
        summary,
        source: "gcal",
        startUtc: parsed.startUtc
      };
      busySlots.push(slot);
      if (openSet.has(key)) {
        conflicts.push(Object.assign({ reason: "Пересечение с открытым слотом" }, slot));
      }
    });

    return { importedCount, busySlots, conflicts };
  }

  function buildIcsText(payload) {
    payload = payload || {};
    const tz = payload.timezone === "UTC+3" ? "UTC+3" : "UTC+9";
    const lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vektor EGE//Calendar Sync 2027//RU",
      "X-WR-TIMEZONE:" + tzIana(tz)
    ];
    lessons.forEach((l, idx) => {
      const uid = "vektor-ege-" + (l.id || idx) + "@vektor-ege.ru";
      const sum = String((l.title || l.student || "Урок ЕГЭ") + " · " + (l.subject || "ЕГЭ")).replace(/\r?\n/g, " ");
      lines.push("BEGIN:VEVENT");
      lines.push("UID:" + uid);
      lines.push("DTSTAMP:20261115T070000Z");
      lines.push("DTSTART:20261118T070000Z");
      lines.push("DTEND:20261118T080000Z");
      lines.push("SUMMARY:" + sum);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    return lines.join("\r\n") + "\r\n";
  }

  function slugifyTutor(name, explicitSlug) {
    if (explicitSlug) return String(explicitSlug).trim();
    const s = String(name || "tutor").toLowerCase().replace(/[^a-z0-9а-яё]+/gi, "-").replace(/^-|-$/g, "");
    return s || "tutor-demo";
  }

  function applyLocalCalendarMeta(payload) {
    payload = payload || {};
    const tz = payload.timezone === "UTC+3" ? "UTC+3" : (state.calendar.timezone || "UTC+9");
    const slug = slugifyTutor(payload.tutorName, payload.tutorSlug || state.tutorSlug || state.calendar.tutorSlug);
    const lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
    const openKeys = normalizeOpenSlotSet(payload.openSlots);
    const origin = (root.location && root.location.origin && root.location.origin !== "null") ? root.location.origin : "";
    const host = (root.location && root.location.host) ? root.location.host : "localhost";
    const icsPath = "/api/calendar/" + encodeURIComponent(slug) + ".ics";
    const fullIcs = origin ? (origin + icsPath) : icsPath;
    state.calendar.feedToken = slug;
    state.calendar.tutorSlug = slug;
    state.calendar.timezone = tz;
    state.calendar.ianaTimezone = tzIana(tz);
    state.calendar.eventCount = lessons.length + openKeys.size;
    state.calendar.icsUrl = icsPath;
    state.calendar.webcalUrl = "webcal://" + host + icsPath;
    state.calendar.googleSubscribeUrl = "https://calendar.google.com/calendar/u/0/r?cid=" + encodeURIComponent(fullIcs);
    state.calendar.googleTemplateUrl = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent("Урок ЕГЭ · " + (payload.tutorName || "Вектор ЕГЭ")) + "&ctz=" + encodeURIComponent(tzIana(tz));
  }

  function syncCalendar(payload) {
    payload = payload || {};
    applyLocalCalendarMeta(payload);
    emitState();

    const localRes = Object.assign({ ok: true, local: true }, cloneCalendar(state.calendar));
    if (hasBackend() && typeof fetch === "function") {
      return fetch("/api/calendar/sync", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      }).then(res => res.ok ? res.json() : localRes).then(data => {
        if (data && data.ok) {
          const normBusy = Array.isArray(data.busySlots) ? data.busySlots.map(normalizeBusySlot) : state.calendar.busySlots;
          const normConf = Array.isArray(data.conflicts) ? data.conflicts.map(normalizeBusySlot) : state.calendar.conflicts;
          if (Array.isArray(data.busySlots)) data.busySlots = normBusy;
          if (Array.isArray(data.conflicts)) data.conflicts = normConf;
          Object.assign(state.calendar, {
            feedToken: data.feedToken || state.calendar.feedToken,
            tutorSlug: data.tutorSlug || state.calendar.tutorSlug,
            timezone: data.timezone || state.calendar.timezone,
            ianaTimezone: data.ianaTimezone || state.calendar.ianaTimezone,
            eventCount: data.eventCount != null ? Number(data.eventCount) : state.calendar.eventCount,
            busySlots: normBusy,
            conflicts: normConf,
            icsUrl: data.icsUrl || state.calendar.icsUrl,
            webcalUrl: data.webcalUrl || state.calendar.webcalUrl,
            googleSubscribeUrl: data.googleSubscribeUrl || state.calendar.googleSubscribeUrl,
            googleTemplateUrl: data.googleTemplateUrl || state.calendar.googleTemplateUrl
          });
          emitState();
        }
        return data || localRes;
      }).catch(() => localRes);
    }
    return Promise.resolve(localRes);
  }

  function importIcs(payload) {
    payload = payload || {};
    applyLocalCalendarMeta(payload);
    const parsed = parseIcsBusySlots(payload.icsText || "", state.calendar.timezone, payload.openSlots);
    state.calendar.busySlots = parsed.busySlots;
    state.calendar.conflicts = parsed.conflicts;
    emitState();

    const localRes = Object.assign({
      ok: true,
      local: true,
      importedCount: parsed.importedCount
    }, cloneCalendar(state.calendar));

    if (hasBackend() && typeof fetch === "function") {
      return fetch("/api/calendar/import-ics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload)
      }).then(res => res.ok ? res.json() : localRes).then(data => {
        if (data && data.ok) {
          if (Array.isArray(data.busySlots)) {
            data.busySlots = data.busySlots.map(normalizeBusySlot);
            state.calendar.busySlots = data.busySlots;
          }
          if (Array.isArray(data.conflicts)) {
            data.conflicts = data.conflicts.map(normalizeBusySlot);
            state.calendar.conflicts = data.conflicts;
          }
          if (data.icsUrl) state.calendar.icsUrl = data.icsUrl;
          if (data.googleSubscribeUrl) state.calendar.googleSubscribeUrl = data.googleSubscribeUrl;
          if (data.googleTemplateUrl) state.calendar.googleTemplateUrl = data.googleTemplateUrl;
          emitState();
        }
        return data || localRes;
      }).catch(() => localRes);
    }
    return Promise.resolve(localRes);
  }

  EGE.realtime = {
    connect,
    connectWS,
    disconnect,
    publish,
    syncCalendar,
    importIcs,
    parseIcsBusySlots,
    buildIcsText,
    onEvent,
    onStateChange,
    clearUnread,
    getState
  };
})();
