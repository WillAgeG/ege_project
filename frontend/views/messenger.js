/* Мини-мессенджер (плавающий кружок hh.ru на ПК) и полноэкранный раздел диалогов «Общение». */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, initials } = EGE.utils || {
    esc: (s) => String(s || ""),
    initials: (s) => (String(s || "П").trim().slice(0, 1) || "П").toUpperCase()
  };
  const { icon } = EGE.ui || { icon: () => "" };

  const CHAT_LS_KEY = "vektor-ege:chats";
  const SEEN_TM_NOTIFS_KEY = "vektor-ege:seen-tm-notifs";
  const _seenTmNotifIds = new Set();
  const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024;
  const MAX_CHAT_FILES = 5;
  const FORBIDDEN_CHAT_EXT_RE = /\.(html?|svg|js|mjs|exe|bat|cmd|sh|ps1|msi|dll|php|jsp|py)$/i;
  const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif)$/i;
  const CHAT_ACCEPT = "image/jpeg,image/png,image/webp,image/gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.txt,.csv,.md,.rtf,.zip";
  const QUICK_REPLIES = [
    ["Подойдёт ли время?", "Здравствуйте! Подойдёт ли это время?"],
    ["Тема 1-го урока?", "Какая тема для 1-го урока?"],
    ["Давайте в Телемосте", "Давайте в Яндекс Телемосте"]
  ];
  const STATUS_LABELS = {
    pending: "На рассмотрении",
    offered: "На рассмотрении",
    countered: "Встречная ставка",
    accepted: "Подтверждён",
    completed: "Завершён",
    declined: "Отклонён",
    cancelled: "Отменён",
    direct: "Диалог"
  };
  const WD_SHORT = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const MON_SHORT = ["янв.", "фев.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сен.", "окт.", "нояб.", "дек."];
  const RECEIPT_SENT_SVG = '<svg width="14" height="10" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 6.3 5.7 10.2 14.5 1.8"/></svg>';
  const RECEIPT_READ_SVG = '<svg width="18" height="10" viewBox="0 0 20 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.2 6.3 5.2 10.2 13.8 1.8"/><path d="M8.5 8.2 10.0 10.2 18.6 1.8"/></svg>';

  function isMessageReadByOther(msg, viewerRole) {
    if (!msg || typeof msg !== "object") return false;
    return viewerRole === "tutor" ? Boolean(msg.readByStudent) : Boolean(msg.readByTutor);
  }

  function renderReadReceiptHTML(isRead, compact) {
    const label = isRead ? "Прочитано" : "Отправлено";
    return `<span class="mc-receipt ${isRead ? "is-read" : "is-sent"}${compact ? " is-compact" : ""}" data-receipt="${isRead ? "read" : "sent"}" title="${label}" aria-label="${label}">${isRead ? RECEIPT_READ_SVG : RECEIPT_SENT_SVG}</span>`;
  }

  let _ctx = {};
  const _fallbackUi = {};
  let _dockRenderHook = null;
  let _highlightBidTimer = null;
  let _msgSeqCounter = 0;

  function clearBidHighlight() {
    const ui = getUi();
    if (_highlightBidTimer && typeof clearTimeout === "function") {
      clearTimeout(_highlightBidTimer);
      _highlightBidTimer = null;
    }
    ui.highlightBidId = "";
    ui.highlightBidTutorId = "";
  }

  function configure(ctx) {
    _ctx = ctx || {};
    _dockRenderHook = _ctx.renderMiniChatDock || null;
  }

  function getUi() { return _ctx.ui || _fallbackUi; }
  function getStore() { return _ctx.store || {}; }
  function getMkt() {
    return typeof _ctx.mkt === "function" ? _ctx.mkt() : { bookings: [] };
  }

  function isBackendAuthed() {
    const st = getStore();
    return Boolean(st && st.backend && st.user && EGE.api && EGE.api.chats);
  }

  function isMobileViewport() {
    return typeof window !== "undefined" && window.innerWidth > 0 && window.innerWidth <= 899;
  }

  function ensureMessengerState() {
    const ui = getUi();
    if (!ui.messenger || typeof ui.messenger !== "object") {
      ui.messenger = {
        open: false,
        activeThreadId: "",
        query: "",
        draft: "",
        busy: false,
        loading: false,
        error: "",
        notice: "",
        serverThreads: [],
        directThreads: {},
        unreadByThread: {},
        messagesByThread: {},
        pendingFiles: [],
        lightbox: null,
        editingTmThreadId: "",
        tmDraft: null,
        tmError: "",
        loadedRole: "",
        loadedOnce: false
      };
    }
    if (!Array.isArray(ui.messenger.serverThreads)) ui.messenger.serverThreads = [];
    if (!ui.messenger.directThreads || typeof ui.messenger.directThreads !== "object") {
      ui.messenger.directThreads = {};
    }
    if (!ui.messenger.unreadByThread || typeof ui.messenger.unreadByThread !== "object") {
      ui.messenger.unreadByThread = {};
    }
    if (!ui.messenger.messagesByThread || typeof ui.messenger.messagesByThread !== "object") {
      ui.messenger.messagesByThread = {};
    }
    if (!Array.isArray(ui.messenger.pendingFiles)) ui.messenger.pendingFiles = [];
    if (ui.messenger.notice == null) ui.messenger.notice = "";
    if (ui.messenger.editingTmThreadId == null) ui.messenger.editingTmThreadId = "";
    if (ui.messenger.tmError == null) ui.messenger.tmError = "";
    if (ui.messenger.loadedRole == null) ui.messenger.loadedRole = "";
    return ui.messenger;
  }

  function readLocalChats() {
    try {
      if (typeof localStorage === "undefined") return { byThread: {}, unreadByThread: {} };
      const raw = localStorage.getItem(CHAT_LS_KEY);
      if (!raw) return { byThread: {}, unreadByThread: {} };
      const parsed = JSON.parse(raw);
      return {
        byThread: (parsed && parsed.byThread && typeof parsed.byThread === "object") ? parsed.byThread : {},
        unreadByThread: (parsed && parsed.unreadByThread && typeof parsed.unreadByThread === "object") ? parsed.unreadByThread : {}
      };
    } catch (e) {
      return { byThread: {}, unreadByThread: {} };
    }
  }

  function writeLocalChats(data) {
    try {
      if (typeof localStorage === "undefined") return;
      const byThread = {};
      const src = (data && data.byThread) || {};
      Object.keys(src).forEach((tid) => {
        const list = Array.isArray(src[tid]) ? src[tid] : [];
        byThread[tid] = list.map((m) => {
          if (!m || !Array.isArray(m.attachments) || !m.attachments.length) return m;
          const cleanAtts = m.attachments.map((a) => {
            if (!a) return a;
            const u = String(a.url || "");
            if (u.indexOf("data:") === 0 && u.length > 450000) {
              return Object.assign({}, a, { url: "" });
            }
            if (u.indexOf("blob:") === 0) {
              return Object.assign({}, a, { url: "" });
            }
            return a;
          });
          return Object.assign({}, m, { attachments: cleanAtts });
        });
      });
      localStorage.setItem(CHAT_LS_KEY, JSON.stringify({
        byThread,
        unreadByThread: (data && data.unreadByThread) || {}
      }));
    } catch (e) { /* недоступно */ }
  }

  function triggerRender(includePage) {
    if (includePage && typeof _ctx.scheduleRender === "function") {
      _ctx.scheduleRender();
    } else if (typeof _dockRenderHook === "function") {
      _dockRenderHook();
    } else if (typeof _ctx.scheduleRender === "function") {
      _ctx.scheduleRender();
    }
  }

  function formatTimeShort(tsOrIso) {
    if (!tsOrIso) return "";
    const d = new Date(tsOrIso);
    if (Number.isNaN(d.getTime())) return "";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function parseTimestampMs(raw) {
    if (raw == null || typeof raw === "boolean") return 0;
    if (typeof raw === "number") {
      if (!Number.isFinite(raw) || raw <= 0) return 0;
      return raw < 10000000000 ? raw * 1000 : raw;
    }
    const s = String(raw).trim();
    if (!s) return 0;
    if (/^\d{10,16}(?:\.\d+)?$/.test(s)) {
      const num = Number(s);
      if (!Number.isFinite(num) || num <= 0) return 0;
      const intPart = s.split(".")[0];
      return intPart.length <= 10 ? num * 1000 : num;
    }
    const ms = Date.parse(s);
    return Number.isFinite(ms) && ms > 0 ? ms : 0;
  }

  function nextLocalMessageSeq(ms) {
    let maxKnown = Number(_msgSeqCounter || 0);
    if (ms && Array.isArray(ms.serverThreads)) {
      ms.serverThreads.forEach((th) => {
        const seq = Number((th && th.lastMessageSeq) || 0);
        if (seq > maxKnown) maxKnown = seq;
      });
    }
    if (ms && ms.messagesByThread && typeof ms.messagesByThread === "object") {
      Object.keys(ms.messagesByThread).forEach((tid) => {
        const list = ms.messagesByThread[tid];
        if (!Array.isArray(list)) return;
        list.forEach((m) => {
          const seq = Number((m && m._localSeq) || 0);
          if (seq > maxKnown) maxKnown = seq;
        });
      });
    }
    _msgSeqCounter = maxKnown + 1;
    return _msgSeqCounter;
  }

  function touchThreadLastMessage(ms, tid, msg, opts) {
    opts = opts || {};
    if (!ms || !tid || !msg || typeof msg !== "object") return false;
    if (!msg._localSeq) msg._localSeq = nextLocalMessageSeq(ms);
    const seq = Number(msg._localSeq || 0);
    if (seq > _msgSeqCounter) _msgSeqCounter = seq;
    const preview = String(msg.body || attachmentsPreviewText(msg.attachments) || "");
    let found = false;
    (ms.serverThreads || []).forEach((th) => {
      if (!th || th.threadId !== tid) return;
      found = true;
      if (preview) th.lastMessage = preview;
      if (msg.senderRole) th.lastSenderRole = msg.senderRole;
      const msgAt = String(msg.createdAt || th.lastMessageAt || "");
      const curMs = parseTimestampMs(th.lastMessageAt);
      const nextMs = parseTimestampMs(msgAt);
      if (!th.lastMessageAt || nextMs >= curMs) {
        if (msgAt) {
          th.lastMessageAt = msgAt;
          th.lastAt = msgAt;
        }
        if (typeof msg.readByStudent === "boolean") th.lastReadByStudent = msg.readByStudent;
        if (typeof msg.readByTutor === "boolean") th.lastReadByTutor = msg.readByTutor;
      }
      th.lastMessageSeq = Math.max(Number(th.lastMessageSeq || 0), seq);
      const prevCnt = Number(th.messageCount || 0);
      const nextCnt = opts.increment ? (prevCnt + 1) : prevCnt;
      th.messageCount = Math.max(nextCnt, Number(opts.cachedCount || 0));
      if (opts.markRead) {
        th.unreadCount = 0;
      } else if (opts.incrementUnread) {
        th.unreadCount = Number(th.unreadCount || 0) + 1;
      }
    });
    return found;
  }

  function formatBytes(bytes) {
    const n = Math.max(0, Number(bytes) || 0);
    if (n < 1024) return n + " Б";
    if (n < 1048576) return Math.max(1, Math.round(n / 1024)) + " КБ";
    return (n / 1048576).toFixed(1).replace(/\.0$/, "") + " МБ";
  }

  function isImageFile(file) {
    if (!file) return false;
    const t = String(file.type || "").toLowerCase();
    if (/^image\/(jpeg|png|webp|gif)$/.test(t)) return true;
    return IMAGE_EXT_RE.test(String(file.name || ""));
  }

  function safePreviewSrc(raw) {
    const u = String(raw || "").trim();
    if (!u) return "";
    if (/^(\/api\/chats\/|blob:|data:image\/(jpeg|png|webp|gif);base64,)/i.test(u)) return u;
    return "";
  }

  function attachmentsPreviewText(attachments) {
    if (!Array.isArray(attachments) || !attachments.length) return "";
    const first = attachments[0] || {};
    if (first.isImage) {
      return attachments.length === 1 ? "📷 Фото" : ("📷 Фото (" + attachments.length + ")");
    }
    return "📎 " + String(first.filename || "Файл");
  }

  function formatLessonDateLabel(dateObj, hourStr) {
    if (!dateObj || Number.isNaN(dateObj.getTime())) return String(hourStr || "").trim();
    const now = new Date();
    const todayMid = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const tgtMid = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();
    const diffDays = Math.round((tgtMid - todayMid) / 86400000);
    const hTxt = String(hourStr || "").trim();
    if (diffDays === 0) return hTxt ? ("Сегодня, " + hTxt) : "Сегодня";
    if (diffDays === 1) return hTxt ? ("Завтра, " + hTxt) : "Завтра";
    const base = WD_SHORT[dateObj.getDay()] + ", " + dateObj.getDate() + " " + MON_SHORT[dateObj.getMonth()];
    return hTxt ? (base + " · " + hTxt) : base;
  }

  function computeThreadLessonMeta(th, viewerRole) {
    if (!th) {
      return { nextLessonLabel: "", showPayment: false, isPaid: true, isFree: false, paidLabel: "", deficitRub: 0, priceRub: 0 };
    }
    const role = viewerRole || (getUi().role === "tutor" ? "tutor" : "student");
    const sp = th.schedulePlan;
    const hasPlanDows = Boolean(sp && (sp.status === "confirmed" || sp.status === "sent_to_tutor") && Array.isArray(sp.dows) && sp.dows.length);
    const rawDows = hasPlanDows ? sp.dows : (Array.isArray(th.dows) ? th.dows : []);
    const dows = rawDows.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
    const hourStr = String((hasPlanDows && sp.hour) || th.hour || "").trim();
    let hourMin = NaN;
    const hm = /^(\d{1,2}):(\d{2})$/.exec(hourStr);
    if (hm) hourMin = Number(hm[1]) * 60 + Number(hm[2]);

    let nextLessonLabel = "";
    const now = new Date();
    if (dows.length) {
      const nowMin = now.getHours() * 60 + now.getMinutes();
      let pickedDate = null;
      for (let off = 0; off <= 7; off++) {
        const cand = new Date(now.getFullYear(), now.getMonth(), now.getDate() + off);
        if (!dows.includes(cand.getDay())) continue;
        if (off === 0 && Number.isFinite(hourMin) && nowMin >= hourMin) continue;
        pickedDate = cand;
        break;
      }
      if (!pickedDate) pickedDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      nextLessonLabel = formatLessonDateLabel(pickedDate, hourStr);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(th.slotDate || ""))) {
      const parts = String(th.slotDate).split("-").map(Number);
      const dt = new Date(parts[0], parts[1] - 1, parts[2]);
      nextLessonLabel = formatLessonDateLabel(dt, hourStr);
    } else {
      nextLessonLabel = String(th.slotLabel || "").trim();
    }

    const price = Math.max(0, Math.round(Number(th.priceRub) || 0));
    const statusLower = String(th.status || "").toLowerCase();
    const activeBooking = Boolean(th.bookingId) && !["cancelled", "declined", "direct"].includes(statusLower);
    if (!activeBooking) {
      return { nextLessonLabel, showPayment: false, isPaid: true, isFree: false, paidLabel: "", deficitRub: 0, priceRub: price };
    }
    const escrow = String(th.escrowStatus || "").toLowerCase();
    const reserved = Math.max(0, Math.round(Number(th.reservedRub) || 0));
    const mktState = getMkt() || {};
    const balance = role === "tutor" ? 0 : Math.max(0, Math.round(Number(mktState.balance) || 0));

    if (price === 0) {
      return { nextLessonLabel, showPayment: true, isPaid: true, isFree: true, paidLabel: "Бесплатный урок", deficitRub: 0, priceRub: 0 };
    }
    if (escrow === "frozen" || escrow === "captured" || reserved >= price || statusLower === "completed" || th.paid === true) {
      return { nextLessonLabel, showPayment: true, isPaid: true, isFree: false, paidLabel: "Оплачен", deficitRub: 0, priceRub: price };
    }
    if (role !== "tutor" && (reserved + balance) >= price) {
      return { nextLessonLabel, showPayment: true, isPaid: true, isFree: false, paidLabel: "Оплачен", deficitRub: 0, priceRub: price };
    }
    return {
      nextLessonLabel,
      showPayment: true,
      isPaid: false,
      isFree: false,
      paidLabel: "Не оплачен",
      deficitRub: Math.max(1, price - reserved - balance),
      priceRub: price
    };
  }

  function shortCounterpartLabel(name) {
    const parts = String(name || "Чат").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "Чат";
    if (parts.length === 1) return parts[0];
    return parts[0] + " " + parts[1].charAt(0) + ".";
  }

  function bookingToThread(bk, viewerRole) {
    if (!bk || !bk.id) return null;
    const tid = "booking:" + String(bk.id);
    const counterpartName = viewerRole === "tutor"
      ? String(bk.studentName || "Ученик")
      : String(bk.tutorName || "Преподаватель");
    const dayPart = String(bk.dayLabel || bk.slotDate || bk.dayIso || "").trim();
    const hourPart = String(bk.hour || "").trim();
    const slotLabel = [dayPart, hourPart].filter(Boolean).join(" · ");
    const priceRub = bk.isTrial && bk.offerPrice != null && Number(bk.offerPrice) === 0
      ? 0
      : Math.max(0, Number(bk.finalPrice || bk.counterPrice || bk.offerPrice || bk.tutorPrice || 0) || 0);
    const sp = bk.schedulePlan || null;
    const dows = sp && Array.isArray(sp.dows) && sp.dows.length
      ? sp.dows.map(Number)
      : (Array.isArray(bk.dows) ? bk.dows.map(Number) : (bk.dow != null ? [Number(bk.dow)] : []));
    const reservedRub = bk.reservedRub != null
      ? Math.max(0, Number(bk.reservedRub) || 0)
      : Math.max(0, Number(bk.reserved || 0) || 0);
    const escrowStatus = String(bk.escrowStatus || (reservedRub > 0 ? "frozen" : "none"));
    let tutorPaid = !!bk.paid;
    if (viewerRole === "tutor") {
      const tc = EGE.views && EGE.views.tutorCabinet;
      const tSt = tc && typeof tc.tState === "function" ? tc.tState() : null;
      const lp = tSt && tSt.lessonPayments && tSt.lessonPayments[String(bk.id)];
      if (lp && lp.paid) tutorPaid = true;
    }
    return {
      threadId: tid,
      bookingId: String(bk.id),
      tutorId: String(bk.tutorId || ""),
      counterpartName,
      subjectName: String(bk.subjectName || bk.subject || "Занятие"),
      priceRub,
      slotLabel,
      slotDate: String(bk.slotDate || bk.dayIso || ""),
      dayLabel: dayPart,
      hour: hourPart,
      dows,
      schedulePlan: sp,
      escrowStatus,
      reservedRub,
      paid: viewerRole === "tutor" ? tutorPaid : false,
      status: String(bk.status || "pending"),
      telemostUrl: String(bk.telemostUrl || ""),
      lastMessage: bk.note ? ("Запрос: " + String(bk.note)) : (slotLabel ? ("Слот: " + slotLabel) : "Открыть переписку"),
      lastSenderRole: "student",
      lastReadByStudent: false,
      lastReadByTutor: false,
      lastAt: String(bk.updatedAt || bk.createdAt || ""),
      lastMessageAt: "",
      lastMessageSeq: 0,
      bookingAt: String(bk.updatedAt || bk.createdAt || ""),
      unreadCount: 0,
      messageCount: 0
    };
  }

  function listThreads() {
    const ui = getUi();
    const ms = ensureMessengerState();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const localData = !isBackendAuthed() ? readLocalChats() : { byThread: {}, unreadByThread: {} };
    const mergedMap = new Map();

    // 1. Локальные / текущие заявки (для мгновенного UX и офлайн/демо-режима)
    const localBookingMap = {};
    if (viewerRole === "tutor") {
      const tc = EGE.views && EGE.views.tutorCabinet;
      const tSt = tc && typeof tc.tState === "function" ? tc.tState() : null;
      const reqs = (tSt && Array.isArray(tSt.requests)) ? tSt.requests : [];
      reqs.forEach((rk) => {
        const th = bookingToThread(rk, "tutor");
        if (th) mergedMap.set(th.threadId, th);
      });
    } else {
      const st = getMkt();
      const bks = Array.isArray(st && st.bookings) ? st.bookings : [];
      bks.forEach((bk) => {
        const th = bookingToThread(bk, "student");
        if (th) {
          mergedMap.set(th.threadId, th);
          localBookingMap[th.threadId] = bk;
        }
      });
    }

    // 2. Серверные диалоги перекрывают и дополняют локальные (сохраняя актуальные локальные поля расписания/резерва)
    (ms.serverThreads || []).forEach((sth) => {
      if (!sth || !sth.threadId) return;
      const prev = mergedMap.get(sth.threadId) || {};
      const lb = localBookingMap[sth.threadId];
      const merged = Object.assign({}, prev, sth);
      merged.bookingAt = prev.bookingAt || String(sth.bookingAt || sth.lastAt || "");
      merged.lastMessageAt = String(
        sth.lastMessageAt || (Number(sth.messageCount || 0) > 0 ? (sth.lastAt || "") : "")
      );
      merged.lastMessageSeq = Number(sth.lastMessageSeq || 0);
      merged.lastReadByStudent = Boolean(sth.lastReadByStudent);
      merged.lastReadByTutor = Boolean(sth.lastReadByTutor);
      if ((!merged.dows || !merged.dows.length) && prev.dows && prev.dows.length) merged.dows = prev.dows;
      if (!merged.schedulePlan && prev.schedulePlan) merged.schedulePlan = prev.schedulePlan;
      if (!merged.slotDate && prev.slotDate) merged.slotDate = prev.slotDate;
      if (lb && Number(lb.reserved || 0) > Number(merged.reservedRub || 0)) {
        merged.reservedRub = Number(lb.reserved || 0);
        if (!merged.escrowStatus || merged.escrowStatus === "none") merged.escrowStatus = "frozen";
      }
      mergedMap.set(sth.threadId, merged);
    });

    // 2.5. Прямые диалоги (например, возврат к переписке с бывшим учеником из истории)
    if (viewerRole === "tutor" && ms.directThreads && typeof ms.directThreads === "object") {
      Object.keys(ms.directThreads).forEach((tid) => {
        const dt = ms.directThreads[tid];
        if (!dt || mergedMap.has(tid)) return;
        mergedMap.set(tid, Object.assign({
          threadId: tid,
          bookingId: null,
          tutorId: "",
          counterpartName: "Ученик",
          subjectName: "Занятие",
          priceRub: 0,
          slotLabel: "",
          slotDate: "",
          dayLabel: "",
          hour: "",
          dows: [],
          schedulePlan: null,
          escrowStatus: "none",
          reservedRub: 0,
          status: "direct",
          telemostUrl: "",
          lastMessage: "Напишите ученику",
          lastSenderRole: "",
          lastReadByStudent: false,
          lastReadByTutor: false,
          lastAt: "",
          lastMessageAt: "",
          lastMessageSeq: 0,
          bookingAt: "",
          unreadCount: 0,
          messageCount: 0
        }, dt, { threadId: tid }));
      });
    }

    // 3. Применяем кэшированные сообщения из ms.messagesByThread и localStorage
    const allLocalMsgs = localData.byThread || {};
    Object.keys(allLocalMsgs).forEach((tid) => {
      if (!mergedMap.has(tid) && Array.isArray(allLocalMsgs[tid]) && allLocalMsgs[tid].length) {
        const first = allLocalMsgs[tid][0] || {};
        const threadRole = String(first.viewerRole || first.ownerRole || first.senderRole || "student").toLowerCase();
        if (threadRole !== viewerRole) return;
        mergedMap.set(tid, {
          threadId: tid,
          bookingId: first.bookingId || null,
          tutorId: first.tutorId || "",
          counterpartName: first.counterpartName || (viewerRole === "tutor" ? "Ученик" : "Преподаватель"),
          subjectName: first.subjectName || "Занятие",
          priceRub: Number(first.priceRub || 0),
          slotLabel: first.slotLabel || "",
          slotDate: "",
          dayLabel: "",
          hour: "",
          dows: [],
          schedulePlan: null,
          escrowStatus: "none",
          reservedRub: 0,
          status: "direct",
          telemostUrl: "",
          lastMessage: "",
          lastSenderRole: "",
          lastReadByStudent: false,
          lastReadByTutor: false,
          lastAt: "",
          lastMessageAt: "",
          lastMessageSeq: 0,
          bookingAt: "",
          unreadCount: 0,
          messageCount: 0
        });
      }
    });

    mergedMap.forEach((th, tid) => {
      const cached = Array.isArray(ms.messagesByThread[tid]) && ms.messagesByThread[tid].length
        ? ms.messagesByThread[tid]
        : (!isBackendAuthed() && Array.isArray(allLocalMsgs[tid]) ? allLocalMsgs[tid] : null);
      if (cached && cached.length) {
        let last = null;
        let lastMs = -1;
        let lastSeq = -1;
        let lastIdx = -1;
        cached.forEach((m, idx) => {
          if (!m) return;
          const mMs = parseTimestampMs(m.createdAt);
          const mSeq = Number(m._localSeq || 0);
          if (!last || mMs > lastMs || (mMs === lastMs && (mSeq > lastSeq || (mSeq === lastSeq && idx > lastIdx)))) {
            last = m;
            lastMs = mMs;
            lastSeq = mSeq;
            lastIdx = idx;
          }
        });
        const preview = last ? (last.body || attachmentsPreviewText(last.attachments)) : "";
        const curMsgMs = parseTimestampMs(th.lastMessageAt);
        const curSeq = Number(th.lastMessageSeq || 0);
        const cachedSeq = last ? Number(last._localSeq || 0) : 0;
        const cachedMs = last ? parseTimestampMs(last.createdAt) : 0;
        if (last && (!th.lastMessageAt || cachedMs > curMsgMs || (cachedMs === curMsgMs && cachedSeq >= curSeq))) {
          if (preview) th.lastMessage = preview;
          th.lastSenderRole = last.senderRole || th.lastSenderRole;
          if (last.createdAt) {
            th.lastMessageAt = last.createdAt;
            th.lastAt = last.createdAt;
          }
          if (cachedMs > curMsgMs || !th.lastMessageAt) {
            th.lastReadByStudent = Boolean(last.readByStudent);
            th.lastReadByTutor = Boolean(last.readByTutor);
          } else {
            th.lastReadByStudent = Boolean(th.lastReadByStudent || last.readByStudent);
            th.lastReadByTutor = Boolean(th.lastReadByTutor || last.readByTutor);
          }
          th.lastMessageSeq = Math.max(curSeq, cachedSeq);
        }
        th.messageCount = Math.max(Number(th.messageCount || 0), cached.length);
      }
      if (!isBackendAuthed() && localData.unreadByThread && localData.unreadByThread[tid] != null) {
        th.unreadCount = Math.max(0, Number(localData.unreadByThread[tid]) || 0);
      }
      if (ms.unreadByThread && ms.unreadByThread[tid] != null) {
        th.unreadCount = Math.max(Number(th.unreadCount || 0), Math.max(0, Number(ms.unreadByThread[tid]) || 0));
      }
    });

    const indexed = Array.from(mergedMap.values()).map((th, idx) => ({ th, idx }));
    indexed.sort((a, b) => {
      const ta = a.th;
      const tb = b.th;
      const aHasMsg = Number(ta.messageCount || 0) > 0 || parseTimestampMs(ta.lastMessageAt) > 0;
      const bHasMsg = Number(tb.messageCount || 0) > 0 || parseTimestampMs(tb.lastMessageAt) > 0;
      if (aHasMsg !== bHasMsg) return bHasMsg ? 1 : -1;
      if (aHasMsg) {
        const aMsgMs = parseTimestampMs(ta.lastMessageAt || ta.lastAt);
        const bMsgMs = parseTimestampMs(tb.lastMessageAt || tb.lastAt);
        if (bMsgMs !== aMsgMs) return bMsgMs - aMsgMs;
        const aSeq = Number(ta.lastMessageSeq || 0);
        const bSeq = Number(tb.lastMessageSeq || 0);
        if (bSeq !== aSeq) return bSeq - aSeq;
      } else {
        const aBkMs = parseTimestampMs(ta.lastAt || ta.bookingAt);
        const bBkMs = parseTimestampMs(tb.lastAt || tb.bookingAt);
        if (bBkMs !== aBkMs) return bBkMs - aBkMs;
      }
      return a.idx - b.idx;
    });
    return indexed.map((x) => x.th);
  }

  function filterThreads(threads, rawQuery) {
    const q = String(rawQuery || "").trim().toLowerCase();
    if (!q) return threads;
    return threads.filter((th) => {
      const hay = [
        th.counterpartName,
        th.subjectName,
        th.slotLabel,
        th.lastMessage,
        STATUS_LABELS[th.status] || th.status
      ].join(" ").toLowerCase();
      return hay.includes(q);
    });
  }

  function totalUnreadCount() {
    const threads = listThreads();
    return threads.reduce((sum, t) => sum + Math.max(0, Number(t.unreadCount || 0)), 0);
  }

  function commBadgeCounts() {
    const chats = Math.max(0, Number(totalUnreadCount()) || 0);
    const st = getMkt();
    const bookings = Array.isArray(st && st.bookings) ? st.bookings : [];
    const bids = bookings.filter((b) => {
      if (!b) return false;
      const status = String(b.status || "").toLowerCase();
      return status !== "cancelled" && status !== "declined";
    }).length;
    return { chats, bids, total: chats + bids };
  }

  function getThreadMessages(threadId) {
    const ms = ensureMessengerState();
    const cached = ms.messagesByThread[threadId];
    if (Array.isArray(cached)) return cached;
    if (!isBackendAuthed()) {
      const local = readLocalChats();
      const arr = local.byThread[threadId];
      if (Array.isArray(arr)) {
        ms.messagesByThread[threadId] = arr.slice();
        return ms.messagesByThread[threadId];
      }
    }
    return [];
  }

  function hydrateFromBackend(force) {
    if (!isBackendAuthed()) return Promise.resolve([]);
    const ui = getUi();
    const ms = ensureMessengerState();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    if (ms.loadedRole && ms.loadedRole !== viewerRole) {
      ms.serverThreads = [];
      ms.unreadByThread = {};
      ms.activeThreadId = "";
      ms.loadedOnce = false;
    }
    if (!force && ms.loadedOnce && ms.loadedRole === viewerRole) return Promise.resolve(ms.serverThreads);
    return EGE.api.chats.list({ role: viewerRole, limit: 50 }).then((res) => {
      const curRole = ui.role === "tutor" ? "tutor" : "student";
      if (curRole !== viewerRole) return ms.serverThreads;
      if (res && Array.isArray(res.threads)) {
        ms.serverThreads = res.threads;
        if (ms.unreadByThread) {
          res.threads.forEach((th) => {
            if (th && th.threadId) delete ms.unreadByThread[th.threadId];
          });
        }
        ms.loadedRole = viewerRole;
        ms.loadedOnce = true;
        ms.error = "";
        if (viewerRole === "tutor" && typeof _ctx.pushNotification === "function") {
          const unreadThreads = res.threads
            .filter((th) => th && Number(th.unreadCount || 0) > 0)
            .slice()
            .reverse();
          unreadThreads.forEach((th) => {
            const who = String(th.counterpartName || "Ученик").trim() || "Ученик";
            const preview = String(th.lastMessage || "Новое сообщение").trim();
            _ctx.pushNotification("Сообщение от ученика: " + who, preview, {
              threadId: th.threadId,
              bookingId: th.bookingId || "",
              kind: "chat",
              silent: true
            });
          });
        }
        triggerRender(true);
      }
      return ms.serverThreads;
    }).catch(() => ms.serverThreads);
  }

  function markThreadRead(threadId) {
    if (!threadId) return;
    const ms = ensureMessengerState();
    const ui = getUi();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const isTutReader = viewerRole === "tutor";
    if (ms.unreadByThread) delete ms.unreadByThread[threadId];
    if (typeof _ctx.clearNotificationsForThread === "function") {
      _ctx.clearNotificationsForThread(threadId);
    }
    const cachedMsgs = ms.messagesByThread[threadId];
    if (Array.isArray(cachedMsgs)) {
      cachedMsgs.forEach((m) => {
        if (!m) return;
        if (isTutReader) m.readByTutor = true;
        else m.readByStudent = true;
      });
    }
    (ms.serverThreads || []).forEach((th) => {
      if (!th || th.threadId !== threadId) return;
      th.unreadCount = 0;
      if (isTutReader) th.lastReadByTutor = true;
      else th.lastReadByStudent = true;
    });
    if (!isBackendAuthed()) {
      const local = readLocalChats();
      if (local.byThread && Array.isArray(local.byThread[threadId])) {
        local.byThread[threadId].forEach((m) => {
          if (!m) return;
          if (isTutReader) m.readByTutor = true;
          else m.readByStudent = true;
        });
      }
      if (local.unreadByThread) delete local.unreadByThread[threadId];
      writeLocalChats(local);
      return;
    }
    EGE.api.chats.markRead(threadId, { role: viewerRole }).catch(() => {});
  }

  function loadThreadMessages(threadId) {
    const ms = ensureMessengerState();
    const ui = getUi();
    if (!threadId) return Promise.resolve([]);
    markThreadRead(threadId);
    if (!isBackendAuthed()) {
      const list = getThreadMessages(threadId);
      triggerRender(true);
      return Promise.resolve(list);
    }
    ms.loading = true;
    triggerRender(true);
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    return EGE.api.chats.messages(threadId, { role: viewerRole, limit: 120 }).then((res) => {
      ms.loading = false;
      ms.error = "";
      if (res && Array.isArray(res.messages)) {
        const prev = Array.isArray(ms.messagesByThread[threadId]) ? ms.messagesByThread[threadId] : [];
        const merged = res.messages.slice();
        const seen = new Set(merged.map((m) => m && m.id).filter(Boolean));
        prev.forEach((m) => {
          if (m && (!m.id || !seen.has(m.id))) {
            merged.push(m);
            if (m.id) seen.add(m.id);
          }
        });
        merged.sort((a, b) => {
          const da = parseTimestampMs(a && a.createdAt);
          const db = parseTimestampMs(b && b.createdAt);
          if (da !== db) return da - db;
          return Number((a && a._localSeq) || 0) - Number((b && b._localSeq) || 0);
        });
        ms.messagesByThread[threadId] = merged;
        if (merged.length) {
          let latest = merged[merged.length - 1];
          let latestMs = parseTimestampMs(latest && latest.createdAt);
          merged.forEach((m) => {
            const mMs = parseTimestampMs(m && m.createdAt);
            if (mMs >= latestMs) {
              latest = m;
              latestMs = mMs;
            }
          });
          const latestPreview = latest ? (latest.body || attachmentsPreviewText(latest.attachments)) : "";
          (ms.serverThreads || []).forEach((th) => {
            if (!th || th.threadId !== threadId) return;
            const prevMsgMs = parseTimestampMs(th.lastMessageAt);
            if (!th.lastMessageAt || latestMs > prevMsgMs) {
              if (latestPreview) th.lastMessage = latestPreview;
              if (latest && latest.senderRole) th.lastSenderRole = latest.senderRole;
              if (latest && latest.createdAt) {
                th.lastMessageAt = latest.createdAt;
                th.lastAt = latest.createdAt;
              }
              if (latest) {
                th.lastReadByStudent = Boolean(latest.readByStudent);
                th.lastReadByTutor = Boolean(latest.readByTutor);
              }
            } else if (latestMs === prevMsgMs && latest) {
              th.lastReadByStudent = Boolean(th.lastReadByStudent || latest.readByStudent);
              th.lastReadByTutor = Boolean(th.lastReadByTutor || latest.readByTutor);
            }
            th.messageCount = Math.max(Number(th.messageCount || 0), merged.length);
          });
        }
      }
      triggerRender(true);
      return ms.messagesByThread[threadId] || [];
    }).catch((err) => {
      ms.loading = false;
      ms.error = (err && err.message) || "Не удалось загрузить переписку";
      triggerRender(true);
      return ms.messagesByThread[threadId] || [];
    });
  }

  function openThread(threadId, opts) {
    opts = opts || {};
    const ms = ensureMessengerState();
    const cleanId = String(threadId || "").trim();
    if (!cleanId) return;
    ms.activeThreadId = cleanId;
    ms.error = "";
    ms.notice = "";
    ms.editingTmThreadId = "";
    ms.tmDraft = null;
    ms.tmError = "";
    if (opts.openDock !== false && !opts.inPageOnly) ms.open = true;
    loadThreadMessages(cleanId);
    triggerRender(true);
  }

  function openBookingChat(bookingId, tutorId, opts) {
    opts = opts || {};
    const ui = getUi();
    const cleanBk = String(bookingId || "").trim();
    const cleanTut = String(tutorId || "").trim();
    const st = getStore();
    if (cleanBk) {
      openThread("booking:" + cleanBk, opts);
      return;
    }
    if (cleanTut && st && st.uid) {
      openThread("tutor:" + cleanTut + ":u:" + String(st.uid), opts);
      return;
    }
    if (cleanTut) {
      openThread("tutor:" + cleanTut + ":u:guest", opts);
    } else if (ui) {
      const ms = ensureMessengerState();
      ms.open = true;
      ms.activeThreadId = "";
      triggerRender(true);
    }
  }

  function openStudentChat(info) {
    info = info || {};
    const ms = ensureMessengerState();
    const threads = listThreads();
    const cleanReqId = String(info.reqId || "").trim();
    const cleanStuId = String(info.studentId || "").trim();
    const cleanName = String(info.studentName || "").trim();
    const normName = cleanName.toLowerCase();
    const hit = threads.find((th) => {
      if (!th) return false;
      if (cleanReqId && (String(th.bookingId || "") === cleanReqId || String(th.threadId || "") === ("booking:" + cleanReqId))) return true;
      if (normName && String(th.counterpartName || "").trim().toLowerCase() === normName) return true;
      return false;
    });
    const openOpts = { openDock: info.inPageOnly ? false : true, inPageOnly: !!info.inPageOnly };
    if (hit && hit.threadId) {
      openThread(hit.threadId, openOpts);
      return hit.threadId;
    }
    const slug = (cleanStuId || normName || String(Date.now())).replace(/[^a-z0-9а-яё_-]+/gi, "-");
    const tid = cleanReqId ? ("booking:" + cleanReqId) : ("student:" + slug);
    ms.directThreads[tid] = {
      threadId: tid,
      bookingId: cleanReqId || null,
      counterpartName: cleanName || "Ученик",
      subjectName: String(info.subjectName || "Занятие"),
      priceRub: Number(info.rate || 0),
      status: "direct",
      lastMessage: "Напишите ученику",
      lastAt: new Date().toISOString(),
      bookingAt: new Date().toISOString()
    };
    openThread(tid, openOpts);
    return tid;
  }

  function handleFileChange(inputEl) {
    const ms = ensureMessengerState();
    const files = Array.from((inputEl && inputEl.files) || []);
    if (!files.length) return;
    let totalBytes = ms.pendingFiles.reduce((s, p) => s + Number(p && p.size ? p.size : 0), 0);
    let errMsg = "";
    files.forEach((file) => {
      if (!file) return;
      const fname = String(file.name || "file");
      const size = Math.max(0, Number(file.size) || 0);
      if (ms.pendingFiles.length >= MAX_CHAT_FILES) {
        errMsg = "Можно прикрепить не более " + MAX_CHAT_FILES + " файлов к одному сообщению.";
        return;
      }
      if (FORBIDDEN_CHAT_EXT_RE.test(fname)) {
        errMsg = "Неподдерживаемый формат файла: " + fname;
        return;
      }
      if (size <= 0) {
        errMsg = "Выбран пустой файл: " + fname;
        return;
      }
      if (size > MAX_CHAT_FILE_BYTES || totalBytes + size > MAX_CHAT_FILE_BYTES) {
        errMsg = "Общий размер вложений не должен превышать 20 МБ.";
        return;
      }
      const isImg = isImageFile(file);
      let previewUrl = "";
      if (isImg && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
        try { previewUrl = URL.createObjectURL(file); } catch (e) { /* игнор */ }
      }
      const entry = {
        id: "pf-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
        file,
        name: fname,
        size,
        type: String(file.type || ""),
        isImage: isImg,
        previewUrl,
        dataUrl: ""
      };
      if (isImg && size <= 4 * 1024 * 1024 && typeof FileReader !== "undefined") {
        try {
          const reader = new FileReader();
          reader.onload = () => {
            const safe = safePreviewSrc(reader.result);
            if (safe) {
              entry.dataUrl = safe;
              if (!entry.previewUrl) entry.previewUrl = safe;
              triggerRender(true);
            }
          };
          reader.readAsDataURL(file);
        } catch (e) { /* игнор */ }
      }
      ms.pendingFiles.push(entry);
      totalBytes += size;
    });
    ms.error = errMsg;
    triggerRender(true);
  }

  function revokePendingPreview(entry) {
    if (!entry || !entry.previewUrl) return;
    if (String(entry.previewUrl).indexOf("blob:") === 0 && typeof URL !== "undefined" && typeof URL.revokeObjectURL === "function") {
      try { URL.revokeObjectURL(entry.previewUrl); } catch (e) { /* игнор */ }
    }
  }

  function sendMessage(threadId, rawBody) {
    const ms = ensureMessengerState();
    const ui = getUi();
    const st = getStore();
    const cleanTid = String(threadId || ms.activeThreadId || "").trim();
    const body = String(rawBody != null ? rawBody : (ms.draft || "")).trim();
    const pending = (ms.pendingFiles || []).slice();
    if (!cleanTid || (!body && !pending.length) || ms.busy) return Promise.resolve(null);
    if (!ms.activeThreadId) ms.activeThreadId = cleanTid;
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const threads = listThreads();
    const activeTh = threads.find((t) => t.threadId === cleanTid) || null;
    const senderName = (st.user && (st.user.displayName || st.user.username))
      || (typeof _ctx.profile === "function" && _ctx.profile() && _ctx.profile().name)
      || (viewerRole === "tutor" ? "Преподаватель" : "Ученик");

    ms.error = "";
    ms.notice = "";
    if (!isBackendAuthed()) {
      const localAtts = pending.map((p, idx) => ({
        id: p.id || ("loc-att-" + Date.now() + "-" + idx),
        filename: p.name || "Файл",
        contentType: p.type || (p.isImage ? "image/png" : "application/octet-stream"),
        sizeBytes: Number(p.size || 0),
        isImage: !!p.isImage,
        url: p.isImage ? safePreviewSrc(p.previewUrl || p.dataUrl) : ""
      }));
      const msgObj = {
        id: "loc-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        threadId: cleanTid,
        bookingId: (activeTh && activeTh.bookingId) || (cleanTid.indexOf("booking:") === 0 ? cleanTid.slice(8) : null),
        tutorId: (activeTh && activeTh.tutorId) || "",
        viewerRole,
        counterpartName: (activeTh && activeTh.counterpartName) || (viewerRole === "tutor" ? "Ученик" : "Преподаватель"),
        subjectName: (activeTh && activeTh.subjectName) || "Занятие",
        priceRub: (activeTh && activeTh.priceRub) || 0,
        slotLabel: (activeTh && activeTh.slotLabel) || "",
        senderUserId: st.uid ? Number(st.uid) : null,
        senderRole: viewerRole,
        senderName,
        body: body.slice(0, 2000),
        attachments: localAtts,
        readByStudent: viewerRole === "student",
        readByTutor: viewerRole === "tutor",
        createdAt: new Date().toISOString(),
        _localSeq: nextLocalMessageSeq(ms)
      };
      const cur = getThreadMessages(cleanTid).slice();
      cur.push(msgObj);
      ms.messagesByThread[cleanTid] = cur;
      touchThreadLastMessage(ms, cleanTid, msgObj, { increment: true, cachedCount: cur.length, markRead: true });
      const local = readLocalChats();
      local.byThread[cleanTid] = cur;
      writeLocalChats(local);
      ms.pendingFiles = [];
      ms.draft = "";
      triggerRender(true);
      return Promise.resolve(msgObj);
    }

    ms.busy = true;
    triggerRender(false);
    return EGE.api.chats.send(cleanTid, {
      body: body.slice(0, 2000),
      bookingId: activeTh && activeTh.bookingId ? activeTh.bookingId : undefined,
      tutorId: activeTh && activeTh.tutorId ? activeTh.tutorId : "",
      role: viewerRole,
      files: pending.map((p) => p && p.file).filter(Boolean)
    }).then((res) => {
      ms.busy = false;
      pending.forEach(revokePendingPreview);
      ms.pendingFiles = [];
      if (res && res.message) {
        const cur = getThreadMessages(cleanTid).slice();
        const isNew = !cur.some((m) => m && m.id === res.message.id);
        if (isNew) cur.push(res.message);
        ms.messagesByThread[cleanTid] = cur;
        const found = touchThreadLastMessage(ms, cleanTid, res.message, {
          increment: isNew,
          cachedCount: cur.length,
          markRead: true
        });
        if (!found) hydrateFromBackend(true);
      }
      ms.draft = "";
      triggerRender(true);
      return res && res.message ? res.message : null;
    }).catch((err) => {
      ms.busy = false;
      ms.error = (err && err.message) || "Не удалось отправить сообщение";
      triggerRender(true);
      return null;
    });
  }

  function sendLessonReminder(threadId) {
    const ms = ensureMessengerState();
    const ui = getUi();
    const st = getStore();
    const cleanTid = String(threadId || ms.activeThreadId || "").trim();
    if (!cleanTid || ms.busy) return Promise.resolve(null);
    if (!ms.activeThreadId) ms.activeThreadId = cleanTid;
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const threads = listThreads();
    const activeTh = threads.find((t) => t.threadId === cleanTid) || null;
    const meta = computeThreadLessonMeta(activeTh, viewerRole);
    const slotText = String(meta.nextLessonLabel || (activeTh && activeTh.slotLabel) || "").trim();
    const slotPart = slotText ? (" (" + slotText + ")") : "";
    const defaultBody = viewerRole === "tutor"
      ? ("🔔 Напоминание от преподавателя: здравствуйте! Скоро занятие" + slotPart + ". Жду вас на уроке!")
      : ("🔔 Напоминание об уроке: здравствуйте! У нас запланировано занятие" + slotPart + ". Буду готов(а) к уроку!");

    ms.error = "";
    if (!isBackendAuthed() || !EGE.api || !EGE.api.chats || typeof EGE.api.chats.remindLesson !== "function") {
      const senderName = (st.user && (st.user.displayName || st.user.username))
        || (typeof _ctx.profile === "function" && _ctx.profile() && _ctx.profile().name)
        || (viewerRole === "tutor" ? "Преподаватель" : "Ученик");
      const msgObj = {
        id: "loc-rem-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        threadId: cleanTid,
        bookingId: (activeTh && activeTh.bookingId) || null,
        tutorId: (activeTh && activeTh.tutorId) || "",
        viewerRole,
        counterpartName: (activeTh && activeTh.counterpartName) || (viewerRole === "tutor" ? "Ученик" : "Преподаватель"),
        subjectName: (activeTh && activeTh.subjectName) || "Занятие",
        priceRub: (activeTh && activeTh.priceRub) || 0,
        slotLabel: (activeTh && activeTh.slotLabel) || "",
        senderUserId: st.uid ? Number(st.uid) : null,
        senderRole: viewerRole,
        senderName,
        body: defaultBody,
        attachments: [],
        readByStudent: viewerRole === "student",
        readByTutor: viewerRole === "tutor",
        createdAt: new Date().toISOString(),
        _localSeq: nextLocalMessageSeq(ms)
      };
      const cur = getThreadMessages(cleanTid).slice();
      cur.push(msgObj);
      ms.messagesByThread[cleanTid] = cur;
      touchThreadLastMessage(ms, cleanTid, msgObj, { increment: true, cachedCount: cur.length, markRead: true });
      const local = readLocalChats();
      local.byThread[cleanTid] = cur;
      writeLocalChats(local);
      ms.notice = viewerRole === "tutor"
        ? "Напоминание отправлено в чат · уведомление от преподавателя передано ученику через платформу"
        : "Напоминание отправлено в чат · уведомление от ученика передано преподавателю через платформу Вектор (WhatsApp / Telegram)";
      if (typeof _ctx.toast === "function") {
        _ctx.toast(viewerRole === "tutor" ? "Напоминание отправлено ученику" : "Напоминание отправлено · преподаватель уведомлён через платформу");
      }
      triggerRender(true);
      return Promise.resolve(msgObj);
    }

    ms.busy = true;
    triggerRender(false);
    return EGE.api.chats.remindLesson(cleanTid, {
      body: defaultBody,
      slotLabel: slotText,
      bookingId: activeTh && activeTh.bookingId ? activeTh.bookingId : undefined,
      tutorId: activeTh && activeTh.tutorId ? activeTh.tutorId : "",
      role: viewerRole
    }).then((res) => {
      ms.busy = false;
      if (res && res.message) {
        const cur = getThreadMessages(cleanTid).slice();
        const isNew = !cur.some((m) => m && m.id === res.message.id);
        if (isNew) cur.push(res.message);
        ms.messagesByThread[cleanTid] = cur;
        const found = touchThreadLastMessage(ms, cleanTid, res.message, {
          increment: isNew,
          cachedCount: cur.length,
          markRead: true
        });
        if (!found) hydrateFromBackend(true);
      }
      const summary = (res && res.notified && res.notified.summary)
        || "Напоминание отправлено · преподаватель уведомлён через платформу";
      ms.notice = summary;
      if (typeof _ctx.toast === "function") _ctx.toast(summary);
      triggerRender(true);
      return res && res.message ? res.message : null;
    }).catch((err) => {
      ms.busy = false;
      ms.error = (err && err.message) || "Не удалось отправить напоминание";
      triggerRender(true);
      return null;
    });
  }

  function sendPaymentReminder(threadId, bookingId) {
    const ms = ensureMessengerState();
    const ui = getUi();
    const st = getStore();
    const cleanTid = String(threadId || ms.activeThreadId || "").trim();
    if (!cleanTid || ms.busy) return Promise.resolve(null);
    if (!ms.activeThreadId) ms.activeThreadId = cleanTid;
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    if (viewerRole !== "tutor") return Promise.resolve(null);
    const threads = listThreads();
    const activeTh = threads.find((t) => t.threadId === cleanTid) || null;
    const cleanBid = String(bookingId || (activeTh && activeTh.bookingId) || "").trim();
    const meta = computeThreadLessonMeta(activeTh, viewerRole);
    const slotText = String(meta.nextLessonLabel || (activeTh && activeTh.slotLabel) || "").trim();
    const amountRub = Math.max(0, Number(meta.priceRub || (activeTh && activeTh.priceRub) || 0) || 0);
    const amountStr = amountRub > 0 ? (amountRub.toLocaleString("ru-RU") + " ₽") : "";
    const details = [slotText, amountStr].filter(Boolean).join(", ");
    const defaultBody = "💳 Напоминание об оплате: здравствуйте! Для подтверждения ближайшего урока"
      + (details ? (" (" + details + ")") : "")
      + " пожалуйста, пополните баланс на платформе Вектор.";

    const syncLocalPayRemind = () => {
      if (!cleanBid) return;
      const tc = EGE.views && EGE.views.tutorCabinet;
      const tSt = tc && typeof tc.tState === "function" ? tc.tState() : null;
      if (!tSt) return;
      const now = Date.now();
      if (!tSt.lessonPayments || typeof tSt.lessonPayments !== "object") tSt.lessonPayments = {};
      const prev = tSt.lessonPayments[cleanBid] || {};
      tSt.lessonPayments[cleanBid] = {
        paid: !!prev.paid,
        paidAt: Number(prev.paidAt) || 0,
        remindedAt: now,
        remindCount: (Number(prev.remindCount) || 0) + 1
      };
      (tSt.requests || []).forEach((r) => {
        if (r && String(r.id) === cleanBid) {
          r.payRemindedAt = now;
          r.payRemindCount = (Number(r.payRemindCount) || 0) + 1;
        }
      });
      if (typeof tc.saveState === "function") tc.saveState();
    };

    ms.error = "";
    if (!isBackendAuthed() || !EGE.api || !EGE.api.chats || typeof EGE.api.chats.remindPayment !== "function") {
      const senderName = (st.user && (st.user.displayName || st.user.username))
        || (typeof _ctx.profile === "function" && _ctx.profile() && _ctx.profile().name)
        || "Преподаватель";
      const msgObj = {
        id: "loc-pay-" + Date.now() + "-" + Math.floor(Math.random() * 1000),
        threadId: cleanTid,
        bookingId: cleanBid || null,
        tutorId: (activeTh && activeTh.tutorId) || "",
        viewerRole: "tutor",
        counterpartName: (activeTh && activeTh.counterpartName) || "Ученик",
        subjectName: (activeTh && activeTh.subjectName) || "Занятие",
        priceRub: amountRub,
        slotLabel: (activeTh && activeTh.slotLabel) || "",
        senderUserId: st.uid ? Number(st.uid) : null,
        senderRole: "tutor",
        senderName,
        body: defaultBody,
        attachments: [],
        readByStudent: false,
        readByTutor: true,
        createdAt: new Date().toISOString(),
        _localSeq: nextLocalMessageSeq(ms)
      };
      const cur = getThreadMessages(cleanTid).slice();
      cur.push(msgObj);
      ms.messagesByThread[cleanTid] = cur;
      touchThreadLastMessage(ms, cleanTid, msgObj, { increment: true, cachedCount: cur.length, markRead: true });
      const local = readLocalChats();
      local.byThread[cleanTid] = cur;
      writeLocalChats(local);
      syncLocalPayRemind();
      ms.notice = "Напоминание об оплате отправлено в чат и передано ученику через платформу";
      if (typeof _ctx.toast === "function") _ctx.toast("Напоминание об оплате отправлено ученику");
      triggerRender(true);
      return Promise.resolve(msgObj);
    }

    ms.busy = true;
    triggerRender(false);
    return EGE.api.chats.remindPayment(cleanTid, {
      body: defaultBody,
      slotLabel: slotText,
      amountRub,
      bookingId: cleanBid || undefined,
      tutorId: activeTh && activeTh.tutorId ? activeTh.tutorId : "",
      role: "tutor"
    }).then((res) => {
      ms.busy = false;
      if (res && res.message) {
        const cur = getThreadMessages(cleanTid).slice();
        const isNew = !cur.some((m) => m && m.id === res.message.id);
        if (isNew) cur.push(res.message);
        ms.messagesByThread[cleanTid] = cur;
        const found = touchThreadLastMessage(ms, cleanTid, res.message, {
          increment: isNew,
          cachedCount: cur.length,
          markRead: true
        });
        if (!found) hydrateFromBackend(true);
      }
      syncLocalPayRemind();
      const summary = (res && res.notified && res.notified.summary)
        || "Напоминание об оплате отправлено ученику в чат и через платформу";
      ms.notice = summary;
      if (typeof _ctx.toast === "function") _ctx.toast(summary);
      triggerRender(true);
      return res && res.message ? res.message : null;
    }).catch((err) => {
      ms.busy = false;
      ms.error = (err && err.message) || "Не удалось отправить напоминание об оплате";
      triggerRender(true);
      return null;
    });
  }

  function onRealtimeEvent(evt) {
    if (!evt) return;
    const ui = getUi();
    const ms = ensureMessengerState();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    if (evt.eventType === "market.telemost.updated") {
      const p = evt.payload || {};
      const bkId = String(p.bookingId || "").trim();
      const tutId = String(p.tutorId || evt.tutorSlug || "").trim();
      const nextUrl = String(p.telemostUrl || "").trim();
      let changed = false;
      (ms.serverThreads || []).forEach((th) => {
        if (!th) return;
        if ((bkId && String(th.bookingId || "") === bkId) || (!bkId && tutId && String(th.tutorId || "") === tutId)) {
          th.telemostUrl = nextUrl;
          changed = true;
        }
      });
      if (viewerRole === "student" && bkId) {
        const mktSt = getMkt();
        if (mktSt && Array.isArray(mktSt.bookings)) {
          mktSt.bookings.forEach((b) => {
            if (b && String(b.id) === bkId) b.telemostUrl = nextUrl;
          });
        }
      } else if (viewerRole === "tutor" && bkId) {
        const tc = EGE.views && EGE.views.tutorCabinet;
        const tSt = tc && typeof tc.tState === "function" ? tc.tState() : null;
        if (tSt && Array.isArray(tSt.requests)) {
          tSt.requests.forEach((r) => {
            if (r && (String(r.id) === bkId || String(r.serverId || "") === bkId)) r.telemostUrl = nextUrl;
          });
        }
      }
      const changedByRole = String(p.changedByRole || "").trim().toLowerCase();
      const isSelfActor = changedByRole ? (changedByRole === viewerRole) : false;
      const ctxUser = (_ctx && _ctx.store && _ctx.store.user) || null;
      let isMyTarget = true;
      if (ctxUser && ctxUser.id != null) {
        const myUid = Number(ctxUser.id);
        if (viewerRole === "student" && p.studentUserId != null) {
          isMyTarget = Number(p.studentUserId) === myUid;
        } else if (viewerRole === "tutor") {
          if (p.tutorUserId != null) {
            isMyTarget = Number(p.tutorUserId) === myUid;
          } else if (tutId && EGE.views && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.tState === "function") {
            const tSt = EGE.views.tutorCabinet.tState();
            const owned = Array.isArray(tSt && tSt.searchProfiles) ? tSt.searchProfiles : [];
            if (owned.length) isMyTarget = owned.some((sp) => sp && String(sp.id) === tutId);
          }
        }
      }
      if (/^https?:\/\//i.test(nextUrl) && !isSelfActor && isMyTarget) {
        const eid = evt.id != null && evt.id !== "" ? String(evt.id) : "";
        let alreadySeen = false;
        if (eid) {
          if (_seenTmNotifIds.has(eid)) {
            alreadySeen = true;
          } else {
            try {
              const savedIds = JSON.parse(localStorage.getItem(SEEN_TM_NOTIFS_KEY) || "[]");
              if (Array.isArray(savedIds) && savedIds.includes(eid)) {
                _seenTmNotifIds.add(eid);
                alreadySeen = true;
              }
            } catch (e) { /* игнор */ }
          }
        }
        const tooOldCatchup = evt._catchup && evt.createdAt && (Date.now() - Date.parse(evt.createdAt)) > 24 * 3600 * 1000;
        if (!alreadySeen && !tooOldCatchup) {
          if (eid) {
            _seenTmNotifIds.add(eid);
            try {
              const prevIds = JSON.parse(localStorage.getItem(SEEN_TM_NOTIFS_KEY) || "[]");
              const nextIds = (Array.isArray(prevIds) ? prevIds.filter((x) => x !== eid) : []).concat([eid]).slice(-40);
              localStorage.setItem(SEEN_TM_NOTIFS_KEY, JSON.stringify(nextIds));
            } catch (e) { /* игнор */ }
          }
          const actorNm = String(p.changedByName || (changedByRole === "tutor" ? "Преподаватель" : "Ученик")).trim();
          const title = String(
            evt.title || (changedByRole === "tutor"
              ? ("Преподаватель " + actorNm + " обновил ссылку встречи")
              : ("Ученик " + actorNm + " обновил ссылку встречи"))
          );
          const msgTxt = String(
            evt.message ||
            [String(p.subjectName || "").trim(), String(p.slotLabel || "").trim(), String(p.providerLabel || resolveVideoLinkLabel(nextUrl)).trim()].filter(Boolean).join(" · ") ||
            nextUrl
          );
          const actLabel = String(p.actionLabel || ("Войти в " + resolveVideoLinkLabel(nextUrl)));
          const cleanTid = String(p.threadId || (bkId ? ("booking:" + bkId) : "")).trim();
          if (!evt._catchup && typeof _ctx.notifySide === "function") {
            _ctx.notifySide(title, msgTxt, {
              inbox: true,
              kind: "telemost",
              threadId: cleanTid,
              bookingId: bkId,
              actionUrl: nextUrl,
              actionLabel: actLabel,
              duration: 6000
            });
          } else if (typeof _ctx.pushNotification === "function") {
            _ctx.pushNotification(title, msgTxt, {
              kind: "telemost",
              threadId: cleanTid,
              bookingId: bkId,
              actionUrl: nextUrl,
              actionLabel: actLabel
            });
          }
        }
      }
      if (!changed) hydrateFromBackend(true);
      triggerRender(true);
      return;
    }
    if (evt.eventType === "chat.read") {
      if (evt._catchup) return;
      const p = evt.payload || {};
      const tid = String(p.threadId || "").trim();
      const readerRole = String(p.readerRole || "").trim().toLowerCase();
      if (!tid || (readerRole !== "tutor" && readerRole !== "student")) return;
      const cachedMsgs = ms.messagesByThread[tid];
      if (Array.isArray(cachedMsgs)) {
        cachedMsgs.forEach((m) => {
          if (!m) return;
          if (readerRole === "tutor") m.readByTutor = true;
          else m.readByStudent = true;
        });
      }
      let found = false;
      (ms.serverThreads || []).forEach((th) => {
        if (!th || th.threadId !== tid) return;
        found = true;
        if (readerRole === "tutor") th.lastReadByTutor = true;
        else th.lastReadByStudent = true;
        if (readerRole === viewerRole) {
          th.unreadCount = 0;
        }
      });
      if (readerRole === viewerRole) {
        if (ms.unreadByThread) delete ms.unreadByThread[tid];
        if (typeof _ctx.clearNotificationsForThread === "function") {
          _ctx.clearNotificationsForThread(tid);
        }
      }
      if (!isBackendAuthed()) {
        const local = readLocalChats();
        if (local.byThread && Array.isArray(local.byThread[tid])) {
          local.byThread[tid].forEach((m) => {
            if (!m) return;
            if (readerRole === "tutor") m.readByTutor = true;
            else m.readByStudent = true;
          });
        }
        if (readerRole === viewerRole && local.unreadByThread) {
          delete local.unreadByThread[tid];
        }
        writeLocalChats(local);
      } else if (!found) {
        hydrateFromBackend(true);
      }
      triggerRender(true);
      return;
    }
    if (evt.eventType !== "chat.message") return;
    if (evt._catchup) return;
    const p = evt.payload || {};
    const msg = p.message;
    const tid = String(p.threadId || (msg && msg.threadId) || "").trim();
    if (!tid || !msg || !msg.id) return;
    const cur = getThreadMessages(tid).slice();
    const isNew = !cur.some((m) => m && m.id === msg.id);
    if (isNew) {
      if (!msg._localSeq) msg._localSeq = nextLocalMessageSeq(ms);
      cur.push(msg);
      ms.messagesByThread[tid] = cur;
    }
    const isSelf = String(msg.senderRole || "") === viewerRole;
    const tcTab = EGE.views && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.getTab === "function"
      ? EGE.views.tutorCabinet.getTab()
      : "";
    const inCommPage = viewerRole === "tutor"
      ? (ui.view === "cabinet" && tcTab === "comm")
      : (ui.view === "home" && ui.commTab !== "bids");
    const isViewing = ms.activeThreadId === tid && (ms.open || inCommPage);
    if (!ms.unreadByThread || typeof ms.unreadByThread !== "object") ms.unreadByThread = {};
    const existingTh = listThreads().find((t) => t && t.threadId === tid) || null;
    const updated = touchThreadLastMessage(ms, tid, msg, {
      increment: isNew,
      cachedCount: cur.length,
      incrementUnread: isNew && !isSelf && !isViewing
    });
    if (isNew && !isSelf && !isViewing) {
      const baseUnread = Math.max(
        Number((existingTh && existingTh.unreadCount) || 0),
        Number(ms.unreadByThread[tid] || 0)
      );
      const srvMatch = (ms.serverThreads || []).find((x) => x && x.threadId === tid) || null;
      ms.unreadByThread[tid] = updated
        ? Math.max(baseUnread + 1, Number((srvMatch && srvMatch.unreadCount) || 0))
        : (baseUnread + 1);
      const sender = String(
        msg.senderName || (existingTh && existingTh.counterpartName) || (viewerRole === "tutor" ? "Ученик" : "Преподаватель")
      ).trim();
      const preview = String(msg.body || attachmentsPreviewText(msg.attachments) || "Новое сообщение").trim();
      const title = viewerRole === "tutor" ? ("Сообщение от ученика: " + sender) : ("Сообщение от " + sender);
      const bid = String(msg.bookingId || (existingTh && existingTh.bookingId) || "").trim();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(title, preview, {
          inbox: true,
          threadId: tid,
          bookingId: bid,
          kind: "chat"
        });
      } else if (typeof _ctx.pushNotification === "function") {
        _ctx.pushNotification(title, preview, {
          threadId: tid,
          bookingId: bid,
          kind: "chat"
        });
      }
    }
    if (!updated && !isSelf && !isViewing && !isBackendAuthed()) {
      const local = readLocalChats();
      local.byThread[tid] = cur;
      local.unreadByThread[tid] = Math.max(0, Number((local.unreadByThread && local.unreadByThread[tid]) || 0)) + (isNew ? 1 : 0);
      writeLocalChats(local);
    } else if (!isBackendAuthed() && isNew) {
      const local = readLocalChats();
      local.byThread[tid] = cur;
      writeLocalChats(local);
    }
    if (!updated && isBackendAuthed()) hydrateFromBackend(true);
    else if (isViewing && !isSelf) markThreadRead(tid);
    triggerRender(true);
  }

  function closeLightbox() {
    const ms = ensureMessengerState();
    if (!ms.lightbox) return false;
    ms.lightbox = null;
    triggerRender(true);
    return true;
  }

  function renderLightboxHTML(mobileOnly) {
    const ms = ensureMessengerState();
    if (!ms.lightbox) return "";
    const src = safePreviewSrc(ms.lightbox.url);
    if (!src) return "";
    const name = String(ms.lightbox.name || "Фото");
    return `<div class="mc-lightbox${mobileOnly ? " is-mobile-only" : ""}" role="dialog" aria-modal="true" aria-label="Просмотр фото">
      <button type="button" class="mc-lightbox-backdrop" data-a="mc-photo-close" aria-label="Закрыть просмотр"></button>
      <div class="mc-lightbox-card">
        <div class="mc-lightbox-head">
          <b class="mc-lightbox-title">${esc(name)}</b>
          <div class="row" style="gap:6px;flex:none">
            <a class="icon-btn sm" href="${esc(src)}" download="${esc(name)}" aria-label="Скачать фото">${icon("download")}</a>
            <button type="button" class="icon-btn sm" data-a="mc-photo-close" aria-label="Закрыть">${icon("x")}</button>
          </div>
        </div>
        <div class="mc-lightbox-body">
          <img class="mc-lightbox-img" src="${esc(src)}" alt="${esc(name)}">
        </div>
      </div>
    </div>`;
  }

  function renderThreadItemHTML(th, activeId, compact) {
    const isAct = activeId && activeId === th.threadId;
    const stLabel = STATUS_LABELS[th.status] || th.status || "";
    const unread = Math.max(0, Number(th.unreadCount || 0));
    const ui = getUi();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const meta = computeThreadLessonMeta(th);
    const payPillHTML = (meta.showPayment && viewerRole === "student")
      ? `<span class="mc-thread-pay ${meta.isPaid ? "is-paid" : "is-unpaid"}">${meta.isFree ? "Бесплатно" : (meta.isPaid ? "Оплачен" : "Не оплачен")}</span>`
      : "";
    const showListReceipt = Number(th.messageCount || 0) > 0 && String(th.lastSenderRole || "") === viewerRole;
    const listReceiptHTML = showListReceipt
      ? renderReadReceiptHTML(viewerRole === "tutor" ? Boolean(th.lastReadByStudent) : Boolean(th.lastReadByTutor), true)
      : "";
    return `<button type="button" class="mc-thread-item${isAct ? " is-active" : ""}${unread > 0 ? " is-unread" : ""}" data-a="mc-open-thread" data-thread-id="${esc(th.threadId)}"${th.bookingId ? ` data-booking-id="${esc(th.bookingId)}"` : ""}${compact ? ' data-mc-mode="page"' : ""}>
      <span class="avatar" aria-hidden="true">${esc(initials(th.counterpartName || "П"))}</span>
      <span class="mc-thread-copy">
        <span class="mc-thread-top">
          <b class="mc-thread-name">${esc(th.counterpartName || "Диалог")}</b>
          <span class="mc-thread-time-wrap">${listReceiptHTML}<span class="mc-thread-time num">${esc(formatTimeShort(th.lastAt) || stLabel)}</span></span>
        </span>
        <span class="mc-thread-sub">${esc(th.subjectName || "Занятие")}${meta.nextLessonLabel ? ` · ${esc(meta.nextLessonLabel)}` : (th.slotLabel ? ` · ${esc(th.slotLabel)}` : "")}${payPillHTML ? ` · ${payPillHTML}` : ""}</span>
        <span class="mc-thread-prev">${esc(th.lastMessage || "Нажмите, чтобы написать")}</span>
      </span>
      ${unread > 0 ? `<span class="mc-thread-badge num">${unread}</span>` : ""}
    </button>`;
  }

  function renderMessageAttachmentsHTML(atts) {
    if (!Array.isArray(atts) || !atts.length) return "";
    const photos = [];
    const files = [];
    atts.forEach((a) => {
      if (!a) return;
      const url = safePreviewSrc(a.url);
      if (a.isImage && url) {
        photos.push(Object.assign({}, a, { url }));
      } else {
        files.push(a);
      }
    });
    let html = "";
    if (photos.length) {
      html += `<div class="mc-att-photos">${photos.map((p) => `<button type="button" class="mc-att-photo-btn" data-a="mc-photo-open" data-src="${esc(p.url)}" data-name="${esc(p.filename || "Фото")}"><img class="mc-att-photo" src="${esc(p.url)}" alt="${esc(p.filename || "Фото")}" loading="lazy"></button>`).join("")}</div>`;
    }
    if (files.length) {
      html += `<div class="mc-att-files">${files.map((f) => {
        const href = String(f.url || "#");
        const hasLink = href !== "#";
        return `<a class="mc-att-file${hasLink ? "" : " is-local-only"}"${hasLink ? ` href="${esc(href)}" download="${esc(f.filename || "file")}" target="_blank" rel="noopener noreferrer"` : ' href="#"'}>
          <span class="mc-att-file-ico" aria-hidden="true">${icon("file")}</span>
          <span class="mc-att-file-meta">
            <b class="mc-att-file-name">${esc(f.filename || "Файл")}</b>
            ${f.sizeBytes ? `<span class="mc-att-file-size num">${esc(formatBytes(f.sizeBytes))}</span>` : ""}
          </span>
          ${hasLink ? `<span class="mc-att-file-dl" aria-hidden="true">${icon("download")}</span>` : ""}
        </a>`;
      }).join("")}</div>`;
    }
    return html;
  }

  function syncTelemostUrl(url, bookingId) {
    const cleanUrl = String(url || "").trim();
    const cleanBid = String(bookingId || "").trim();
    const ms = ensureMessengerState();
    (ms.serverThreads || []).forEach((th) => {
      if (!th) return;
      if (cleanBid) {
        if (String(th.bookingId || "") === cleanBid) th.telemostUrl = cleanUrl;
      } else if (th.bookingId || th.telemostUrl) {
        th.telemostUrl = cleanUrl;
      }
    });
  }

  function resolveVideoLinkLabel(url) {
    const mktMod = EGE.views && EGE.views.marketplace;
    if (mktMod && typeof mktMod.videoLinkLabel === "function") {
      return mktMod.videoLinkLabel(url, { long: false });
    }
    const low = String(url || "").toLowerCase();
    if (!low || low.indexOf("telemost.yandex.") !== -1) return "Телемост";
    if (low.indexOf("zoom.") !== -1) return "Zoom";
    if (low.indexOf("meet.google.com") !== -1) return "Google Meet";
    return "Видеозвонок";
  }

  function applyThreadVideoLink(threadId, bookingId, nextUrl) {
    const ui = getUi();
    const ms = ensureMessengerState();
    const st = getMkt();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const threads = listThreads();
    const th = threads.find((x) => x.threadId === threadId) || null;
    const cleanBid = String(bookingId || (th && th.bookingId) || "").trim();
    if (viewerRole === "student") {
      if (st && typeof st === "object") {
        st.telemostUrl = nextUrl;
        if (Array.isArray(st.bookings)) {
          st.bookings.forEach((b) => { if (b) b.telemostUrl = nextUrl; });
        }
        if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
      }
      syncTelemostUrl(nextUrl);
    } else {
      const tc = EGE.views && EGE.views.tutorCabinet;
      const tSt = tc && typeof tc.tState === "function" ? tc.tState() : null;
      if (tSt && Array.isArray(tSt.requests)) {
        tSt.requests.forEach((r) => {
          if (r && ((cleanBid && String(r.id) === cleanBid) || (!cleanBid && th && th.tutorId && String(r.tutorId || "") === String(th.tutorId)))) {
            r.telemostUrl = nextUrl;
          }
        });
        if (typeof tc.saveState === "function") tc.saveState();
      }
      if (cleanBid) syncTelemostUrl(nextUrl, cleanBid);
    }
    if (th) th.telemostUrl = nextUrl;
    const lbl = resolveVideoLinkLabel(nextUrl);
    ms.editingTmThreadId = "";
    ms.tmDraft = null;
    ms.tmError = "";
    ms.notice = viewerRole === "tutor"
      ? ("Ссылка на встречу обновлена (" + lbl + ") — уведомление со ссылкой отправлено ученику")
      : ("Ссылка на встречу обновлена (" + lbl + ") — уведомление со ссылкой отправлено преподавателю");
    triggerRender(true);
    const targetBid = cleanBid || (viewerRole === "student" && st && Array.isArray(st.bookings) && st.bookings[0] && st.bookings[0].id ? String(st.bookings[0].id) : "");
    if (isBackendAuthed() && EGE.api && EGE.api.bookings && typeof EGE.api.bookings.updateTelemost === "function" && targetBid) {
      EGE.api.bookings.updateTelemost(targetBid, nextUrl, viewerRole).then((res) => {
        if (res && res.booking && res.booking.telemostUrl) {
          syncTelemostUrl(res.booking.telemostUrl, viewerRole === "tutor" ? (cleanBid || targetBid) : undefined);
        }
      }).catch((err) => {
        ms.editingTmThreadId = String(threadId || "");
        ms.tmDraft = nextUrl;
        ms.tmError = (err && err.message) || "Не удалось сохранить ссылку на сервере";
        triggerRender(true);
      });
    }
  }

  function saveThreadVideoLink(threadId, bookingId, rawUrl) {
    const ms = ensureMessengerState();
    const mktMod = EGE.views && EGE.views.marketplace;
    const parsed = mktMod && typeof mktMod.normalizeTelemostUrl === "function"
      ? mktMod.normalizeTelemostUrl(rawUrl)
      : { ok: /^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(String(rawUrl || "").trim()), url: String(rawUrl || "").trim(), error: "Укажите корректную https-ссылку." };
    if (!parsed.ok || !parsed.url) {
      ms.editingTmThreadId = String(threadId || "");
      ms.tmDraft = String(rawUrl == null ? "" : rawUrl);
      ms.tmError = (parsed.ok && !parsed.url)
        ? "Укажите ссылку Яндекс Телемост или другую https-ссылку (Zoom, Google Meet, VK Звонки и др.)."
        : (parsed.error || "Укажите корректную https-ссылку на видеозвонок.");
      triggerRender(true);
      return;
    }
    applyThreadVideoLink(threadId, bookingId, parsed.url);
  }

  function generateThreadTelemost(threadId, bookingId) {
    const mktMod = EGE.views && EGE.views.marketplace;
    const nextUrl = mktMod && typeof mktMod.generateTelemostUrl === "function"
      ? mktMod.generateTelemostUrl()
      : ("https://telemost.yandex.ru/j/" + String(Date.now()).slice(-8) + String(Math.floor(100000 + Math.random() * 900000)));
    applyThreadVideoLink(threadId, bookingId, nextUrl);
  }

  function renderLessonBarHTML(th, viewerRole) {
    const ms = ensureMessengerState();
    const meta = computeThreadLessonMeta(th, viewerRole);
    const stMkt = getMkt();
    const rawTm = th.telemostUrl || (th.bookingId && stMkt && stMkt.telemostUrl ? stMkt.telemostUrl : "");
    const tm = rawTm && /^https?:\/\//i.test(rawTm) ? rawTm : "";
    const canEditTm = Boolean(th.bookingId || tm);
    const isEditingTm = Boolean(canEditTm && ms.editingTmThreadId === th.threadId);
    const isUnpaidStu = meta.showPayment && !meta.isPaid && viewerRole === "student";
    const isUnpaidTut = meta.showPayment && !meta.isPaid && viewerRole === "tutor";
    const payPillHTML = meta.showPayment
      ? (meta.isPaid
        ? `<span class="mc-pay-pill is-paid">${icon("check")}<span>${esc(meta.paidLabel)}</span></span>`
        : `<span class="mc-pay-pill is-unpaid">Не оплачен</span>`)
      : "";
    const reason = "Пополнение для оплаты ближайшего урока (" + (th.subjectName || "Занятие") + (meta.nextLessonLabel ? (", " + meta.nextLessonLabel) : "") + ")";
    const topupBtnHTML = isUnpaidStu
      ? `<button type="button" class="btn sm mc-topup-btn" data-a="bal-open" data-amount="${meta.deficitRub}" data-reason="${esc(reason)}">${icon("wallet")}<span>Пополнить ${meta.deficitRub.toLocaleString("ru-RU")} ₽</span></button>`
      : "";
    const payRemindBtnHTML = isUnpaidTut
      ? `<button type="button" class="btn sm mc-pay-remind-btn" data-a="mc-remind-payment" data-thread-id="${esc(th.threadId)}" data-booking-id="${esc(th.bookingId || "")}"${ms.busy ? " disabled" : ""} title="Упомянуть об оплате в чате и уведомить ученика через платформу">${icon("bell")}<span>Напомнить об оплате</span></button>`
      : "";
    const tmEditBtnHTML = canEditTm
      ? `<button type="button" class="btn ghost sm mc-tm-edit-btn${isEditingTm ? " is-active" : ""}" data-a="mc-tm-edit" data-thread-id="${esc(th.threadId)}" data-booking-id="${esc(th.bookingId || "")}" aria-expanded="${isEditingTm ? "true" : "false"}" title="Если Телемост не работает — вставьте другую ссылку (Zoom, Google Meet, VK и др.)">${icon("repeat")}<span>Сменить ссылку</span></button>`
      : "";
    const tmBtnHTML = tm
      ? `<a class="btn soft sm mc-tm-btn" href="${esc(tm)}" target="_blank" rel="noopener noreferrer">${icon("video")}<span>${esc(resolveVideoLinkLabel(tm))}</span></a>`
      : "";

    const nearestInfo = meta.nextLessonLabel
      ? `<span class="mc-lesson-when">${icon("cal")}<span>Ближайший урок: <b class="num">${esc(meta.nextLessonLabel)}</b></span></span>`
      : `<span class="mc-lesson-when">${icon("book")}<span>${esc(th.subjectName || "Занятие")}</span></span>`;
    const pricePart = meta.priceRub > 0
      ? `<span class="mc-lesson-sub small muted num">${esc(th.subjectName || "Занятие")} · ${meta.priceRub.toLocaleString("ru-RU")} ₽/ч</span>`
      : (meta.isFree ? `<span class="mc-lesson-sub small muted">${esc(th.subjectName || "Занятие")} · Бесплатный пробный</span>` : "");

    const tmEditorHTML = isEditingTm
      ? `<form class="mc-tm-editor" data-f="mc-tm-save" data-thread-id="${esc(th.threadId)}" data-booking-id="${esc(th.bookingId || "")}">
          <label class="mc-tm-editor-lbl small muted" for="mc-tm-inp-${esc(th.threadId)}">Если Телемост не работает — вставьте Zoom, Google Meet, VK или любую https-ссылку</label>
          <div class="mc-tm-editor-row">
            <input class="input mc-tm-inp" id="mc-tm-inp-${esc(th.threadId)}" name="url" type="url" autocomplete="off" placeholder="https://telemost.yandex.ru/j/... или https://zoom.us/j/..." value="${esc(ms.tmDraft != null ? ms.tmDraft : tm)}">
            <button type="submit" class="btn sm mc-tm-save-btn">Сохранить</button>
          </div>
          ${ms.tmError ? `<div class="mc-tm-err" role="alert">${esc(ms.tmError)}</div>` : ""}
          <div class="mc-tm-editor-foot">
            <button type="button" class="btn soft sm" data-a="mc-tm-gen" data-thread-id="${esc(th.threadId)}" data-booking-id="${esc(th.bookingId || "")}">Новый Телемост</button>
            <button type="button" class="btn ghost sm" data-a="mc-tm-cancel">Отмена</button>
          </div>
        </form>`
      : "";

    return `<div class="mc-lesson-bar${(isUnpaidStu || isUnpaidTut) ? " is-unpaid" : ""}">
      <div class="mc-lesson-info">
        <div class="mc-lesson-top">${nearestInfo}${payPillHTML}</div>
        ${pricePart}
      </div>
      ${(topupBtnHTML || payRemindBtnHTML || tmEditBtnHTML || tmBtnHTML) ? `<div class="mc-lesson-acts">${topupBtnHTML}${payRemindBtnHTML}${tmEditBtnHTML}${tmBtnHTML}</div>` : ""}
      ${tmEditorHTML}
    </div>`;
  }

  function renderMessagesHTML(th, viewerRole, inputId, formAct, fileInputId) {
    const ms = ensureMessengerState();
    const effFileId = fileInputId || "mc-files";
    const msgs = getThreadMessages(th.threadId);
    const bubblesHTML = msgs.length
      ? msgs.map((m) => {
          const isMe = String(m.senderRole || "") === viewerRole;
          const timeStr = formatTimeShort(m.createdAt);
          const atts = Array.isArray(m.attachments) ? m.attachments : [];
          const attHTML = renderMessageAttachmentsHTML(atts);
          const hasText = Boolean(String(m.body || "").trim());
          const mediaOnly = !hasText && atts.length > 0;
          const receiptHTML = isMe ? renderReadReceiptHTML(isMessageReadByOther(m, viewerRole), false) : "";
          const metaHTML = (timeStr || receiptHTML)
            ? `<span class="mc-msg-meta">${timeStr ? `<span class="mc-msg-time num">${esc(timeStr)}</span>` : ""}${receiptHTML}</span>`
            : "";
          return `<div class="mc-msg ${isMe ? "is-me" : "is-them"}">
            <div class="mc-msg-bubble${mediaOnly ? " is-media-only" : ""}">${attHTML}${hasText ? `<div class="mc-msg-text">${esc(m.body)}</div>` : ""}</div>
            ${metaHTML}
          </div>`;
        }).join("")
      : `<div class="mc-empty-thread">
          <b>Начните переписку с ${esc(th.counterpartName || "собеседником")}</b>
          <span class="small muted">Договоритесь о темах урока, прикрепите задание (фото или файл до 20 МБ)${viewerRole === "student" ? " или отправьте автонапоминание ниже" : " или выберите быстрый вопрос ниже"}.</span>
        </div>`;

    const hasMessages = msgs.length > 0 || Number(th.messageCount || 0) > 0;
    const remindChipHTML = viewerRole === "student"
      ? `<button type="button" class="mc-quick-pill is-remind" data-a="mc-remind-lesson" data-thread-id="${esc(th.threadId)}"${ms.busy ? " disabled" : ""} title="Отправить напоминание в чат и уведомить преподавателя в мессенджерах через платформу">${icon("bell")}<span>Напомнить об уроке · уведомить</span></button>`
      : "";
    const quickChipsHTML = hasMessages
      ? ""
      : QUICK_REPLIES.map(([lbl, fullTxt]) => `<button type="button" class="mc-quick-pill" data-a="mc-quick-reply" data-thread-id="${esc(th.threadId)}" data-text="${esc(fullTxt)}">${esc(lbl)}</button>`).join("");
    const quickHTML = (remindChipHTML || quickChipsHTML)
      ? `<div class="mc-quick-row" role="group" aria-label="Быстрые автосообщения">${remindChipHTML}${quickChipsHTML}</div>`
      : "";

    const pendingList = Array.isArray(ms.pendingFiles) ? ms.pendingFiles : [];
    const pendingHTML = pendingList.length
      ? `<div class="mc-pending-bar">${pendingList.map((p) => {
          const pUrl = p.isImage ? safePreviewSrc(p.previewUrl || p.dataUrl) : "";
          if (pUrl) {
            return `<div class="mc-pending-thumb">
              <img src="${esc(pUrl)}" alt="${esc(p.name || "Фото")}">
              <button type="button" class="mc-pending-x" data-a="mc-file-remove" data-fid="${esc(p.id)}" aria-label="Удалить файл">${icon("x")}</button>
            </div>`;
          }
          return `<div class="mc-pending-chip">
            ${icon("file")}
            <span class="mc-pending-name">${esc(p.name || "Файл")}</span>
            ${p.size ? `<span class="mc-pending-size num">${esc(formatBytes(p.size))}</span>` : ""}
            <button type="button" class="mc-pending-x" data-a="mc-file-remove" data-fid="${esc(p.id)}" aria-label="Удалить файл">${icon("x")}</button>
          </div>`;
        }).join("")}</div>`
      : "";

    const noticeHTML = ms.notice
      ? `<div class="mc-notice-bar" role="status">${icon("check")}<span>${esc(ms.notice)}</span><button type="button" class="mc-notice-x" data-a="mc-notice-close" aria-label="Скрыть уведомление">${icon("x")}</button></div>`
      : "";

    return `${renderLessonBarHTML(th, viewerRole)}
      <div class="mc-messages" aria-live="polite">
        ${ms.loading ? '<div class="small muted">Загружаем сообщения…</div>' : bubblesHTML}
      </div>
      ${quickHTML}
      ${pendingHTML}
      ${noticeHTML}
      ${ms.error ? `<div class="small" style="color:var(--bad);padding:4px 12px 6px">${esc(ms.error)}</div>` : ""}
      <form class="mc-composer" data-f="${esc(formAct)}" data-thread-id="${esc(th.threadId)}">
        <label class="mc-attach-btn" for="${esc(effFileId)}" title="Прикрепить фото или файл (до 20 МБ)" aria-label="Прикрепить фото или файл">${icon("plus")}</label>
        <input class="sr" id="${esc(effFileId)}" type="file" multiple accept="${CHAT_ACCEPT}">
        <label class="sr" for="${esc(inputId)}">Сообщение</label>
        <input class="input mc-input" id="${esc(inputId)}" type="text" maxlength="2000" autocomplete="off" placeholder="Напишите сообщение…" value="${esc(ms.draft || "")}">
        <button type="submit" class="btn mc-send-btn" aria-label="Отправить сообщение"${ms.busy ? " disabled" : ""}>${icon("send")}</button>
      </form>`;
  }

  function renderFloatingDockHTML() {
    const ui = getUi();
    const st = getStore();
    const ms = ensureMessengerState();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const unreadTotal = totalUnreadCount();
    const badgeHTML = unreadTotal > 0
      ? `<span class="mc-fab-badge num">${unreadTotal > 99 ? "99+" : unreadTotal}</span>`
      : "";
    const fabHTML = `<button type="button" class="mc-fab${ms.open ? " is-open" : ""}" data-a="mc-toggle" aria-expanded="${ms.open ? "true" : "false"}" aria-label="${ms.open ? "Свернуть сообщения" : "Открыть мини-мессенджер"}" title="Сообщения">
      ${ms.open ? icon("x") : icon("chat")}
      ${!ms.open ? badgeHTML : ""}
    </button>`;
    if (!ms.open) return `${fabHTML}${renderLightboxHTML(false)}`;

    const guestGate = Boolean(st && st.backend && !st.user && !ui.guest && !ui.demoAuthed);
    let panelBody = "";
    if (guestGate) {
      panelBody = `<div class="mc-panel-head">
          <div class="row" style="gap:8px">${icon("chat")}<b>Сообщения</b></div>
          <button type="button" class="icon-btn sm" data-a="mc-close" aria-label="Закрыть">${icon("x")}</button>
        </div>
        <div class="mc-guest-box">
          <b>${viewerRole === "tutor" ? "Чаты с учениками" : "Чаты с преподавателями"}</b>
          <p class="small ink2">${viewerRole === "tutor"
            ? "Войдите в аккаунт преподавателя, чтобы переписываться с учениками, согласовывать расписание и делиться ссылками на видеозвонки."
            : "Войдите в аккаунт, чтобы переписываться с преподавателями, согласовывать расписание и получать ссылки на Яндекс Телемост."}</p>
          <button type="button" class="btn sm" data-a="auth-modal-open">Войти в аккаунт</button>
        </div>`;
    } else {
      const allThreads = listThreads();
      const activeTh = ms.activeThreadId ? allThreads.find((t) => t.threadId === ms.activeThreadId) : null;
      if (activeTh) {
        const stLabel = STATUS_LABELS[activeTh.status] || activeTh.status || "";
        panelBody = `<div class="mc-panel-head">
            <div class="row" style="gap:6px;min-width:0;flex:1 1 auto">
              <button type="button" class="icon-btn sm" data-a="mc-back" aria-label="К списку диалогов">${icon("back")}</button>
              ${viewerRole === "student"
                ? `<button type="button" class="mc-head-profile-btn" data-a="mc-open-bid-profile" data-booking-id="${esc(activeTh.bookingId || "")}" data-tutor-id="${esc(activeTh.tutorId || "")}" title="Открыть профиль в «Откликах»">
                <b class="mc-head-title">${esc(activeTh.counterpartName || "Диалог")}</b>
                <span class="mc-head-sub">${esc(activeTh.subjectName || "Занятие")}${stLabel ? ` · ${esc(stLabel)}` : ""}</span>
              </button>`
                : `<div class="stack" style="gap:1px;min-width:0">
                <b class="mc-head-title">${esc(activeTh.counterpartName || "Диалог")}</b>
                <span class="mc-head-sub">${esc(activeTh.subjectName || "Занятие")}${stLabel ? ` · ${esc(stLabel)}` : ""}</span>
              </div>`}
            </div>
            <div class="row" style="gap:4px;flex:none">
              <button type="button" class="icon-btn sm" data-a="mc-expand" title="Открыть в разделе «Общение»" aria-label="Развернуть">${icon("arrow")}</button>
              <button type="button" class="icon-btn sm" data-a="mc-close" aria-label="Закрыть">${icon("x")}</button>
            </div>
          </div>
          ${renderMessagesHTML(activeTh, viewerRole, "mc-input", "mc-send", "mc-files")}`;
      } else {
        const filtered = filterThreads(allThreads, ms.query);
        const listHTML = filtered.length
          ? `<div class="mc-thread-list">${filtered.map((th) => renderThreadItemHTML(th, "", false)).join("")}</div>`
          : (allThreads.length
            ? `<div class="mc-empty-box"><b class="small">Ничего не найдено</b><button type="button" class="btn ghost sm" data-a="mc-search-clear">Сбросить поиск</button></div>`
            : (viewerRole === "tutor"
              ? `<div class="mc-empty-box"><b>Диалогов пока нет</b><span class="small muted">Когда поступит заявка от ученика, чат появится здесь автоматически.</span><button type="button" class="btn sm" data-a="go" data-v="tutor-requests">Открыть «Заявки»</button></div>`
              : `<div class="mc-empty-box"><b>Диалогов пока нет</b><span class="small muted">Выберите преподавателя в «Поиске» — чат появится здесь сразу после отклика.</span><button type="button" class="btn sm" data-a="go" data-v="market">Найти преподавателя</button></div>`));
        panelBody = `<div class="mc-panel-head">
            <div class="row" style="gap:8px">${icon("chat")}<b>Сообщения</b>${unreadTotal > 0 ? `<span class="chip notif num">${unreadTotal}</span>` : ""}</div>
            <div class="row" style="gap:4px">
              <button type="button" class="icon-btn sm" data-a="mc-expand" title="Открыть в разделе «Общение»" aria-label="Развернуть">${icon("arrow")}</button>
              <button type="button" class="icon-btn sm" data-a="mc-close" aria-label="Закрыть">${icon("x")}</button>
            </div>
          </div>
          <div class="mc-search-wrap">
            <span class="mc-search-ico">${icon("search")}</span>
            <input class="input mc-search-inp" id="mc-search" type="search" autocomplete="off" placeholder="Поиск по диалогам…" value="${esc(ms.query || "")}">
          </div>
          ${listHTML}`;
      }
    }

    return `<section class="mc-panel" role="dialog" aria-label="Мини-мессенджер Вектор">${panelBody}</section>${fabHTML}${renderLightboxHTML(false)}`;
  }

  function renderCommWorkspaceHTML(opts) {
    opts = opts || {};
    const ui = getUi();
    const ms = ensureMessengerState();
    const viewerRole = ui.role === "tutor" ? "tutor" : "student";
    const threads = listThreads();
    const unreadTotal = totalUnreadCount();

    if (opts.compact) {
      const topThreads = threads.slice(0, 3);
      return `<section class="card stack comm-chats-strip" id="comm-chats-strip" style="gap:10px" aria-label="Чаты с преподавателями">
        <div class="row between" style="gap:10px;flex-wrap:wrap">
          <div class="row" style="gap:8px;align-items:center">
            ${icon("chat")}
            <h2 class="h2">Чаты с преподавателями</h2>
            ${unreadTotal > 0 ? `<span class="chip notif num">${unreadTotal} новых</span>` : ""}
          </div>
          <button type="button" class="btn soft sm" data-a="comm-tab" data-tab="chats">Все чаты (${threads.length})</button>
        </div>
        ${topThreads.length
          ? `<div class="comm-strip-grid">${topThreads.map((th) => renderThreadItemHTML(th, "", true)).join("")}</div>`
          : `<div class="small muted">После отправки отклика преподавателю здесь появится прямой чат и статус ответа.</div>`}
      </section>`;
    }

    const filtered = filterThreads(threads, ms.query);
    let activeTh = ms.activeThreadId ? threads.find((t) => t.threadId === ms.activeThreadId) : null;
    if (!activeTh && filtered.length && !isMobileViewport()) {
      activeTh = filtered[0];
    }
    const hasActive = Boolean(activeTh);

    const listColHTML = `<div class="comm-chat-sidebar">
      <div class="mc-search-wrap">
        <span class="mc-search-ico">${icon("search")}</span>
        <input class="input mc-search-inp" id="comm-chat-search" type="search" autocomplete="off" placeholder="${viewerRole === "tutor" ? "Поиск ученика или предмета…" : "Поиск преподавателя или предмета…"}" value="${esc(ms.query || "")}">
      </div>
      ${filtered.length
        ? `<div class="mc-thread-list is-full">${filtered.map((th) => renderThreadItemHTML(th, activeTh ? activeTh.threadId : "", true)).join("")}</div>`
        : (viewerRole === "tutor"
          ? `<div class="empty"><b>Диалогов с учениками пока нет</b><span>Когда поступит заявка от ученика, чат появится здесь автоматически.</span><button type="button" class="btn sm" data-a="go" data-v="tutor-requests">Открыть «Заявки»</button></div>`
          : `<div class="empty"><b>Диалогов не найдено</b><span>Отправьте отклик преподавателю в «Поиске», чтобы начать чат.</span><button type="button" class="btn sm" data-a="go" data-v="market">Открыть «Поиск»</button></div>`)}
    </div>`;

    const mobileRailHTML = filtered.length > 1
      ? `<div class="comm-mobile-rail" role="tablist" aria-label="${viewerRole === "tutor" ? "Быстрое переключение ученика" : "Быстрое переключение преподавателя"}">${filtered.map((th) => {
          const isAct = activeTh && activeTh.threadId === th.threadId;
          const unreadCnt = Math.max(0, Number(th.unreadCount || 0));
          return `<button type="button" class="comm-mobile-chip${isAct ? " is-active" : ""}" data-a="mc-open-thread" data-mc-mode="page" data-thread-id="${esc(th.threadId)}"${th.bookingId ? ` data-booking-id="${esc(th.bookingId)}"` : ""} aria-pressed="${isAct}">
            <span class="avatar" aria-hidden="true">${esc(initials(th.counterpartName || "П"))}</span>
            <span class="comm-mobile-chip-name">${esc(shortCounterpartLabel(th.counterpartName))}</span>
            ${unreadCnt > 0 ? `<span class="comm-mobile-chip-dot num" aria-label="Непрочитанных: ${unreadCnt}">${unreadCnt > 9 ? "9+" : unreadCnt}</span>` : ""}
          </button>`;
        }).join("")}</div>`
      : "";

    const paneColHTML = activeTh
      ? `<div class="comm-chat-pane">
          ${mobileRailHTML}
          <div class="comm-pane-head">
            <div class="comm-pane-person">
              <button type="button" class="icon-btn sm comm-mobile-back" data-a="mc-back" aria-label="К списку чатов">${icon("back")}</button>
              ${viewerRole === "student"
                ? `<button type="button" class="comm-head-profile-btn" data-a="mc-open-bid-profile" data-booking-id="${esc(activeTh.bookingId || "")}" data-tutor-id="${esc(activeTh.tutorId || "")}" title="Открыть профиль в «Откликах»">
                <span class="avatar" aria-hidden="true">${esc(initials(activeTh.counterpartName || "П"))}</span>
                <span class="comm-head-profile-copy">
                  <b class="mc-head-title">${esc(activeTh.counterpartName || "Диалог")}</b>
                  <span class="mc-head-sub">${esc(activeTh.subjectName || "Занятие")}${activeTh.slotLabel ? ` · ${esc(activeTh.slotLabel)}` : ""}</span>
                </span>
              </button>`
                : `<span class="avatar" aria-hidden="true">${esc(initials(activeTh.counterpartName || "П"))}</span>
              <div class="stack" style="gap:1px;min-width:0">
                <b class="mc-head-title">${esc(activeTh.counterpartName || "Диалог")}</b>
                <span class="mc-head-sub">${esc(activeTh.subjectName || "Занятие")}${activeTh.slotLabel ? ` · ${esc(activeTh.slotLabel)}` : ""}</span>
              </div>`}
            </div>
            <span class="chip" style="flex:none">${esc(STATUS_LABELS[activeTh.status] || "Диалог")}</span>
          </div>
          ${renderMessagesHTML(activeTh, viewerRole, "comm-chat-input", "comm-chat-send", "comm-chat-files")}
        </div>`
      : (viewerRole === "tutor"
        ? `<div class="comm-chat-pane is-empty">
            <div class="empty"><b>Выберите диалог слева</b><span>Здесь собраны переписки с учениками по заявкам и расписанию.</span><button type="button" class="btn sm" data-a="go" data-v="tutor-requests">Открыть «Заявки»</button></div>
          </div>`
        : `<div class="comm-chat-pane is-empty">
            <div class="empty"><b>Выберите диалог слева</b><span>Или отправьте новый отклик преподавателю в разделе «Поиск».</span><button type="button" class="btn sm" data-a="go" data-v="market">Найти преподавателя</button></div>
          </div>`);

    return `<section class="card comm-chat-grid${hasActive ? " has-active-thread" : ""}" id="comm-chat-workspace" aria-label="${viewerRole === "tutor" ? "Чаты с учениками" : "Чаты с преподавателями"}">${listColHTML}${paneColHTML}</section>${renderLightboxHTML(true)}`;
  }

  function registerActions(ACTIONS) {
    if (!ACTIONS) return;
    ACTIONS["mc-toggle"] = () => {
      const ms = ensureMessengerState();
      ms.open = !ms.open;
      ms.error = "";
      if (ms.open && isBackendAuthed() && !ms.loadedOnce) hydrateFromBackend(true);
      if (ms.open && ms.activeThreadId) loadThreadMessages(ms.activeThreadId);
      triggerRender(false);
    };
    ACTIONS["mc-close"] = () => {
      const ms = ensureMessengerState();
      ms.open = false;
      triggerRender(false);
    };
    ACTIONS["mc-back"] = () => {
      const ms = ensureMessengerState();
      ms.activeThreadId = "";
      ms.error = "";
      ms.notice = "";
      ms.editingTmThreadId = "";
      ms.tmDraft = null;
      ms.tmError = "";
      triggerRender(true);
    };
    ACTIONS["mc-tm-edit"] = (el) => {
      const ms = ensureMessengerState();
      const d = (el && el.dataset) || {};
      const tid = String(d.threadId || ms.activeThreadId || "").trim();
      if (!tid) return;
      if (ms.editingTmThreadId === tid) {
        ms.editingTmThreadId = "";
        ms.tmDraft = null;
        ms.tmError = "";
      } else {
        const th = listThreads().find((t) => t.threadId === tid) || null;
        const stMkt = getMkt();
        const curUrl = String((th && th.telemostUrl) || (stMkt && stMkt.telemostUrl) || "");
        ms.editingTmThreadId = tid;
        ms.tmDraft = curUrl;
        ms.tmError = "";
      }
      triggerRender(true);
    };
    ACTIONS["mc-tm-cancel"] = () => {
      const ms = ensureMessengerState();
      ms.editingTmThreadId = "";
      ms.tmDraft = null;
      ms.tmError = "";
      triggerRender(true);
    };
    ACTIONS["mc-tm-gen"] = (el) => {
      const ms = ensureMessengerState();
      const d = (el && el.dataset) || {};
      const tid = String(d.threadId || ms.activeThreadId || "").trim();
      const bid = String(d.bookingId || "").trim();
      if (tid) generateThreadTelemost(tid, bid);
    };
    ACTIONS["mc-search-clear"] = () => {
      const ms = ensureMessengerState();
      ms.query = "";
      triggerRender(true);
    };
    ACTIONS["mc-notice-close"] = () => {
      const ms = ensureMessengerState();
      ms.notice = "";
      triggerRender(true);
    };
    ACTIONS["mc-open-thread"] = (el) => {
      const d = (el && el.dataset) || {};
      const tid = String(d.threadId || "").trim();
      const bkId = String(d.bookingId || "").trim();
      const tutId = String(d.tutorId || "").trim();
      const ui = getUi();
      const isPageMode = d.mcMode === "page" || isMobileViewport();
      if (isPageMode && ui.role !== "tutor") {
        ui.commTab = "chats";
      }
      if (tid) openThread(tid, { openDock: !isPageMode, inPageOnly: isPageMode });
      else openBookingChat(bkId, tutId, { openDock: !isPageMode, inPageOnly: isPageMode });
      if (isPageMode && typeof _ctx.go === "function") {
        if (ui.role === "tutor") {
          const tcTab = EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.getTab === "function"
            ? EGE.views.tutorCabinet.getTab()
            : "";
          if (ui.view !== "cabinet" || tcTab !== "comm") _ctx.go("tutor-comm");
        } else if (ui.view !== "home") {
          _ctx.go("home");
        }
      }
    };
    ACTIONS["mc-expand"] = () => {
      const ui = getUi();
      const ms = ensureMessengerState();
      ms.open = false;
      if (ui.role === "tutor") {
        if (typeof _ctx.go === "function") _ctx.go("tutor-comm");
        return;
      }
      ui.commTab = "chats";
      if (typeof _ctx.go === "function") _ctx.go("home");
    };
    ACTIONS["mc-quick-reply"] = (el) => {
      const d = (el && el.dataset) || {};
      const tid = String(d.threadId || "").trim();
      const text = String(d.text || "").trim();
      if (tid && text) sendMessage(tid, text);
    };
    ACTIONS["mc-remind-lesson"] = (el) => {
      const d = (el && el.dataset) || {};
      const tid = String(d.threadId || "").trim();
      if (tid) sendLessonReminder(tid);
    };
    ACTIONS["mc-remind-payment"] = (el) => {
      const d = (el && el.dataset) || {};
      const tid = String(d.threadId || "").trim();
      const bid = String(d.bookingId || "").trim();
      if (tid) sendPaymentReminder(tid, bid);
    };
    ACTIONS["mc-file-remove"] = (el) => {
      const ms = ensureMessengerState();
      const fid = String((el && el.dataset && el.dataset.fid) || "").trim();
      if (!fid) return;
      const next = [];
      (ms.pendingFiles || []).forEach((p) => {
        if (p && p.id === fid) revokePendingPreview(p);
        else if (p) next.push(p);
      });
      ms.pendingFiles = next;
      ms.error = "";
      triggerRender(true);
    };
    ACTIONS["mc-photo-open"] = (el) => {
      const d = (el && el.dataset) || {};
      const src = safePreviewSrc(d.src);
      if (!src) return;
      const ms = ensureMessengerState();
      ms.lightbox = { url: src, name: String(d.name || "Фото") };
      triggerRender(true);
    };
    ACTIONS["mc-photo-close"] = () => {
      closeLightbox();
    };
    ACTIONS["comm-tab"] = (el) => {
      const ui = getUi();
      const ms = ensureMessengerState();
      clearBidHighlight();
      const tab = (el && el.dataset && el.dataset.tab) || "chats";
      ui.commTab = tab === "bids" ? "bids" : "chats";
      if (ui.commTab === "chats" && !ms.activeThreadId && !isMobileViewport()) {
        const list = listThreads();
        if (list.length) {
          ms.activeThreadId = list[0].threadId;
          loadThreadMessages(ms.activeThreadId);
        }
      }
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender(false);
    };
    ACTIONS["mc-open-bid-profile"] = (el) => {
      const ui = getUi();
      if (ui.role === "tutor") return;
      const ms = ensureMessengerState();
      const d = (el && el.dataset) || {};
      const reqBookingId = String(d.bookingId || "").trim();
      const reqTutorId = String(d.tutorId || "").trim();
      const st = getMkt();
      const bookings = Array.isArray(st && st.bookings) ? st.bookings : [];
      const match = (reqBookingId && bookings.find((b) => b && String(b.id) === reqBookingId))
        || (reqTutorId && bookings.find((b) => b && String(b.tutorId) === reqTutorId))
        || null;
      const targetBookingId = match ? String(match.id) : reqBookingId;
      const targetTutorId = match ? String(match.tutorId || reqTutorId) : reqTutorId;

      clearBidHighlight();
      ms.open = false;
      ui.commTab = "bids";
      ui.homeBidFilter = "all";
      const seq = (Number(ui.highlightBidSeq) || 0) + 1;
      ui.highlightBidSeq = seq;
      ui.highlightBidId = targetBookingId;
      ui.highlightBidTutorId = targetTutorId;

      if (ui.view !== "home" && typeof _ctx.go === "function") {
        _ctx.go("home");
      } else if (typeof _ctx.scheduleRender === "function") {
        _ctx.scheduleRender(false);
      }

      const scrollToCard = () => {
        if (Number(ui.highlightBidSeq) !== seq) return;
        if (typeof document === "undefined" || typeof document.querySelector !== "function") return;
        const escAttr = (v) => String(v || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        let card = null;
        if (targetBookingId) {
          card = document.querySelector(`#home-bids-section .tutor-card[data-booking-id="${escAttr(targetBookingId)}"]`);
        }
        if (!card && targetTutorId) {
          card = document.querySelector(`#home-bids-section .tutor-card[data-tutor-id="${escAttr(targetTutorId)}"]`);
        }
        if (card && typeof card.scrollIntoView === "function") {
          try { card.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) { /* игнор */ }
        }
      };
      Promise.resolve().then(() => {
        if (typeof requestAnimationFrame === "function") {
          requestAnimationFrame(() => requestAnimationFrame(scrollToCard));
        } else if (typeof setTimeout === "function") {
          setTimeout(scrollToCard, 0);
        } else {
          scrollToCard();
        }
      });

      if (typeof setTimeout === "function") {
        _highlightBidTimer = setTimeout(() => {
          _highlightBidTimer = null;
          if (Number(ui.highlightBidSeq) !== seq) return;
          ui.highlightBidId = "";
          ui.highlightBidTutorId = "";
          if (typeof document !== "undefined" && typeof document.querySelectorAll === "function") {
            document.querySelectorAll("#home-bids-section .tutor-card.is-bid-highlighted").forEach((node) => {
              if (node && node.classList) node.classList.remove("is-bid-highlighted");
            });
          }
        }, 1700);
      }
    };
    ACTIONS["learn-tab"] = (el) => {
      const ui = getUi();
      const tab = (el && el.dataset && el.dataset.tab) || "subjects";
      ui.learnTab = tab === "guide" ? "guide" : "subjects";
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender(false);
    };
  }

  function registerForms(FORMS) {
    if (!FORMS) return;
    const submitChat = (form) => {
      const ms = ensureMessengerState();
      const tid = (form && form.dataset && form.dataset.threadId) || ms.activeThreadId || "";
      const inp = form && typeof form.querySelector === "function" ? form.querySelector(".mc-input") : null;
      const val = inp ? String(inp.value || "") : String(ms.draft || "");
      sendMessage(tid, val);
    };
    FORMS["mc-send"] = submitChat;
    FORMS["comm-chat-send"] = submitChat;
    FORMS["mc-tm-save"] = (form) => {
      const ms = ensureMessengerState();
      const d = (form && form.dataset) || {};
      const tid = String(d.threadId || ms.activeThreadId || "").trim();
      const bid = String(d.bookingId || "").trim();
      const inp = form && typeof form.querySelector === "function" ? form.querySelector(".mc-tm-inp") : null;
      const raw = inp ? String(inp.value || "") : String(ms.tmDraft || "");
      saveThreadVideoLink(tid, bid, raw);
    };
  }

  function handleInput(el) {
    if (!el) return false;
    const ms = ensureMessengerState();
    if (el.id === "mc-input" || el.id === "comm-chat-input") {
      ms.draft = String(el.value || "");
      return true;
    }
    if (el.id === "mc-search" || el.id === "comm-chat-search") {
      ms.query = String(el.value || "");
      triggerRender(el.id === "comm-chat-search");
      return true;
    }
    if ((el.classList && el.classList.contains("mc-tm-inp")) || String(el.id || "").indexOf("mc-tm-inp-") === 0) {
      ms.tmDraft = String(el.value || "");
      return true;
    }
    return false;
  }

  EGE.views = EGE.views || {};
  EGE.views.messenger = {
    configure,
    listThreads,
    totalUnreadCount,
    commBadgeCounts,
    hydrateFromBackend,
    loadThreadMessages,
    openThread,
    openBookingChat,
    openStudentChat,
    handleFileChange,
    closeLightbox,
    sendMessage,
    sendLessonReminder,
    syncTelemostUrl,
    onRealtimeEvent,
    renderFloatingDockHTML,
    renderCommWorkspaceHTML,
    registerActions,
    registerForms,
    handleInput
  };
})();
