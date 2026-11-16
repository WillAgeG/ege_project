/* Админ-панель платформы «Вектор ЕГЭ» (/admin):
   100% построена на компонентах Brandbook / UI-Kit (EGE.kit, EGE.charts, EGE.ui, EGE.utils)
   и подключается к централизованному HTTP-клиенту EGE.api.admin с чистым fallback для офлайн/jsc. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc } = EGE.utils || { esc: (s) => String(s == null ? "" : s) };
  const { icon } = EGE.ui || { icon: () => "" };

  const VALID_TABS = ["overview", "requests", "tutors", "payouts", "system"];
  const VALID_REQ_STATUSES = ["pending", "accepted", "declined", "refunded"];
  const VALID_ROLES = ["student", "tutor", "admin"];

  let _ctx = {};
  const state = {
    tab: "overview",
    loading: false,
    lastLoadedAt: 0,
    filter: "all",
    query: "",
    cols: 5,
    overview: null,
    users: null,
    tutors: null,
    requests: null,
    payouts: null,
    outbox: null,
    architecture: null
  };

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
  }

  function getMkt() {
    return typeof _ctx.mkt === "function" ? _ctx.mkt() : { bookings: [] };
  }

  function isBackendLive() {
    return !!(root.EGE_HOST && root.EGE_HOST.backend && EGE.api && EGE.api.admin);
  }

  function getTab() {
    return state.tab;
  }

  function setTab(next) {
    const clean = VALID_TABS.includes(next) ? next : "overview";
    if (state.tab !== clean) {
      state.tab = clean;
      state.filter = "all";
      state.query = "";
    }
    return state.tab;
  }

  function notify(title, msg) {
    if (typeof _ctx.notifySide === "function") _ctx.notifySide(title, msg);
    else if (typeof _ctx.toast === "function") _ctx.toast(title);
  }

  function toast(msg) {
    if (typeof _ctx.toast === "function") _ctx.toast(msg);
  }

  function renderLater() {
    if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
  }

  function buildSeededArchitecture() {
    return [
      {
        id: "uiKit",
        name: "@vektor-ege/ui-kit",
        layer: "ui-kit",
        port: 8772,
        status: "stateless",
        repo: "vektor-ui-kit",
        summary: "Zero-API дизайн-система, Design Tokens, DataViz и стенд /brandbook",
        endpoints: ["/brandbook", "/tokens.json", "/components/kit.js"],
        note: "Никаких сетевых вызовов и бизнес-данных."
      },
      {
        id: "headlessApi",
        name: "vektor-api",
        layer: "headless-api",
        port: 8771,
        status: "live",
        repo: "vektor-api",
        summary: "Headless FastAPI (JSON / SSE / WebSocket / .ics / Admin REST)",
        endpoints: ["/api/health/storage", "/api/admin/overview", "/docs"],
        note: "CORS открыт для :8770 и :8772."
      },
      {
        id: "spaShell",
        name: "Preparation · SPA Shell",
        layer: "spa-shell",
        port: 8770,
        status: "live",
        repo: "Preparation",
        summary: "SPA-оболочка, клиент EGE.api и экраны Ученика / Преподавателя / Админа",
        endpoints: ["/landing", "/market", "/cabinet", "/admin"],
        note: "Единый табличный движок EGE.charts.dataTableHTML."
      },
      {
        id: "postgres",
        name: "PostgreSQL 17 OLTP + Outbox",
        layer: "postgresql",
        port: 5432,
        status: "healthy",
        repo: "vektor-postgres",
        summary: "Схемы oltp.*, silver.*, gold.* и транзакционный аутбокс outbox.kafka_outbox",
        endpoints: ["oltp.users", "oltp.tutors", "oltp.lesson_requests", "outbox.kafka_outbox"],
        note: "Dual-Write + Envelope v1."
      },
      {
        id: "polars",
        name: "Polars + DuckDB Engine",
        layer: "polars",
        port: null,
        status: "active",
        repo: "vektor-polars-engine",
        summary: "Medallion Bronze → Silver → Gold ZSTD Parquet (Apple M4 Pro, arm64)",
        endpoints: ["run-medallion", "run-sales-elt", "run-clickstream"],
        note: "Bare-metal CLI без сетевого порта."
      },
      {
        id: "airflow",
        name: "Apache Airflow 3.4",
        layer: "airflow",
        port: 8085,
        status: "active",
        repo: "vektor-airflow",
        summary: "Оркестратор 3 DAG (Medallion, Sales/Escrow ELT, Clickstream)",
        endpoints: ["/api/v2/monitor/health", "vektor_medallion_hourly"],
        note: "Метабаза airflow_meta на :5432."
      },
      {
        id: "grafana",
        name: "Grafana BI",
        layer: "grafana",
        port: 3000,
        status: "active",
        repo: "vektor-grafana",
        summary: "Дашборды GMV, сбора 5%, воронки кликстрима и SLA пайплайнов",
        endpoints: ["/api/health", "vektor_super_analytics", "vektor_data_platform"],
        note: "Datasource uid: vektor-postgres."
      }
    ];
  }

  function buildSeededUsers() {
    const curUser = _ctx.store && _ctx.store.user;
    const list = [
      { id: 1, username: "admin_vektor", displayName: "Айаал (Админ)", email: "admin@vektorege.ru", authProvider: "local", role: "admin", createdAt: "2026-11-10T09:00:00Z" },
      { id: 2, username: "sokolova_bio", displayName: "Анна Соколова", email: "sokolova@vektorege.ru", authProvider: "google", role: "tutor", createdAt: "2026-11-11T11:20:00Z" },
      { id: 3, username: "alina_2027", displayName: "Алина С.", email: "alina27@mail.ru", authProvider: "local", role: "student", createdAt: "2026-11-12T14:05:00Z" },
      { id: 4, username: "timur_chem", displayName: "Тимур К.", email: "timur@mail.ru", authProvider: "local", role: "student", createdAt: "2026-11-14T16:40:00Z" }
    ];
    if (curUser && curUser.id && !list.some((u) => String(u.id) === String(curUser.id))) {
      list.unshift({
        id: curUser.id,
        username: curUser.username || "user",
        displayName: curUser.displayName || curUser.username || "Текущий пользователь",
        email: curUser.email || "",
        authProvider: curUser.authProvider || "local",
        role: curUser.role || (_ctx.ui && _ctx.ui.role) || "student",
        createdAt: new Date().toISOString()
      });
    }
    return list;
  }

  function buildSeededTutors() {
    const TDATA = getTDATA();
    const src = (TDATA && Array.isArray(TDATA.LIST) ? TDATA.LIST : []).slice(0, 8);
    if (!src.length) {
      return [
        {
          id: "tut-ykt-bio-1",
          fullName: "Айтал Б.",
          subject: "Биология",
          city: "Якутск",
          timezone: "UTC+9",
          baseRateRub: 1200,
          marketRateRub: 1550,
          sourceChannel: "doska_ykt",
          tariffId: "month10k",
          verified: true,
          bumpedToday: true,
          rating: 4.95,
          reviewsCount: 42
        },
        {
          id: "tut-ykt-bio-2",
          fullName: "Сардана К.",
          subject: "Химия",
          city: "Якутск",
          timezone: "UTC+9",
          baseRateRub: 1100,
          marketRateRub: 1450,
          sourceChannel: "telegram",
          tariffId: "trial5k",
          verified: false,
          bumpedToday: false,
          rating: 4.88,
          reviewsCount: 19
        }
      ];
    }
    return src.map((t, idx) => ({
      id: t.id || ("tut-local-" + idx),
      fullName: t.name || "Преподаватель",
      subject: t.subjectName || t.subject || "ЕГЭ",
      city: t.city || "Якутск",
      timezone: t.timezone || (t.city === "Москва" ? "UTC+3" : "UTC+9"),
      baseRateRub: Number(t.price || 1200),
      marketRateRub: Number(t.marketPrice || 1500),
      sourceChannel: t.source || (idx % 3 === 0 ? "doska_ykt" : idx % 3 === 1 ? "telegram" : "max"),
      tariffId: idx % 2 === 0 ? "month10k" : "trial5k",
      verified: idx === 1 ? false : (t.verified !== false),
      bumpedToday: !!t.bumpedToday || idx === 0,
      rating: Number(t.rating || 4.9),
      reviewsCount: Number(t.reviews || 18)
    }));
  }

  function buildSeededRequests() {
    const bookings = Array.isArray(getMkt().bookings) ? getMkt().bookings : [];
    const fromBookings = bookings.map((b, idx) => ({
      id: b.id || ("bk-" + idx),
      tutorId: b.tutorId || "tut-sokolova",
      tutorName: b.tutorName || "Преподаватель",
      studentName: b.studentName || "Ученик (мой профиль)",
      subject: b.subjectName || "Биология",
      city: b.city || "Якутск",
      timezone: b.timezone || "UTC+9",
      slotDate: b.dayLabel || "2026-11-18",
      hourSlot: b.hour || "14:00",
      tariffId: "trial5k",
      offerPriceRub: Number(b.offerPrice || 1200),
      counterPriceRub: null,
      finalPriceRub: b.status === "accepted" ? Number(b.offerPrice || 1200) : null,
      status: b.status || "pending",
      escrowStatus: b.status === "accepted" ? "captured" : "frozen",
      messengerChannel: "whatsapp",
      createdAt: "2026-11-16T09:10:00Z"
    }));
    const defaults = [
      {
        id: "req-1001",
        tutorId: "tut-sokolova",
        tutorName: "Анна Соколова",
        studentName: "Алина С.",
        subject: "Биология",
        city: "Якутск",
        timezone: "UTC+9",
        slotDate: "2026-11-18",
        hourSlot: "16:00",
        tariffId: "month10k",
        offerPriceRub: 1200,
        counterPriceRub: 1300,
        finalPriceRub: 1300,
        status: "accepted",
        escrowStatus: "captured",
        messengerChannel: "whatsapp",
        createdAt: "2026-11-16T08:15:00Z"
      },
      {
        id: "req-1002",
        tutorId: "tut-ykt-bio-2",
        tutorName: "Сардана К.",
        studentName: "Тимур К.",
        subject: "Химия",
        city: "Якутск",
        timezone: "UTC+9",
        slotDate: "2026-11-19",
        hourSlot: "14:00",
        tariffId: "trial5k",
        offerPriceRub: 1400,
        counterPriceRub: null,
        finalPriceRub: null,
        status: "pending",
        escrowStatus: "frozen",
        messengerChannel: "telegram",
        createdAt: "2026-11-16T09:42:00Z"
      },
      {
        id: "req-1003",
        tutorId: "tut-msk-rus-1",
        tutorName: "Елена М.",
        studentName: "Дарья В.",
        subject: "Русский язык",
        city: "Москва",
        timezone: "UTC+3",
        slotDate: "2026-11-20",
        hourSlot: "18:00",
        tariffId: "trial5k",
        offerPriceRub: 1100,
        counterPriceRub: null,
        finalPriceRub: null,
        status: "pending",
        escrowStatus: "frozen",
        messengerChannel: "max",
        createdAt: "2026-11-16T10:05:00Z"
      }
    ];
    return fromBookings.concat(defaults);
  }

  function buildSeededPayouts() {
    const tcMod = EGE.views.tutorCabinet;
    const summary = tcMod && typeof tcMod.getWalletSummary === "function" ? tcMod.getWalletSummary() : null;
    const localRows = summary && Array.isArray(summary.payouts)
      ? summary.payouts.map((p, idx) => ({
          id: p.id || ("tc-pay-" + idx),
          tutorId: "tc-my-profile",
          tutorName: (summary.settings && summary.settings.ownerName) || "Анна Соколова",
          method: p.method || "sbp",
          amountRub: Number(p.amount || 1500),
          npdReceipt: p.npdReceipt ? "НПД-2026-" + (88410 + idx) : null,
          bank: p.bank || p.methodLabel || "СБП · АЭБ",
          destinationMasked: p.destination || "+7 (914) ***-01-99",
          status: p.status === "succeeded" ? "succeeded" : "processing",
          createdAt: "2026-11-16T09:30:00Z",
          paidAt: p.status === "succeeded" ? "2026-11-16T09:32:00Z" : null
        }))
      : [];
    const defaults = [
      {
        id: "pay-3001",
        tutorId: "tut-sokolova",
        tutorName: "Анна Соколова",
        method: "sbp",
        amountRub: 5700,
        npdReceipt: "88412-НПД",
        bank: "АЭБ (Алмазэргиэнбанк)",
        destinationMasked: "+7 (914) ***-05-11",
        status: "succeeded",
        createdAt: "2026-11-15T18:10:00Z",
        paidAt: "2026-11-15T18:12:00Z"
      },
      {
        id: "pay-3002",
        tutorId: "tut-ykt-bio-2",
        tutorName: "Сардана К.",
        method: "card",
        amountRub: 2850,
        npdReceipt: "88419-НПД",
        bank: "Карта РФ / Мир",
        destinationMasked: "2200 70** **** 4419",
        status: "processing",
        createdAt: "2026-11-16T10:15:00Z",
        paidAt: null
      }
    ];
    return localRows.concat(defaults);
  }

  function buildSeededOutbox() {
    return [
      {
        id: 101,
        topic: "vektor.market.bids.v1",
        partitionKey: "req-1002",
        eventType: "market.bid.created",
        payload: { tutorId: "tut-ykt-bio-2", offerPriceRub: 1400, city: "Якутск" },
        createdAt: "2026-11-16T09:42:00Z",
        publishedAt: "2026-11-16T09:42:01Z",
        status: "published"
      },
      {
        id: 102,
        topic: "vektor.payments.ledger.v1",
        partitionKey: "pay-3002",
        eventType: "payout.requested",
        payload: { method: "card", amountRub: 2850, npdReceipt: "88419-НПД" },
        createdAt: "2026-11-16T10:15:00Z",
        publishedAt: null,
        status: "pending"
      },
      {
        id: 103,
        topic: "vektor.user.clickstream.v1",
        partitionKey: "usr-2",
        eventType: "calendar.ics.synced",
        payload: { timezone: "UTC+9", conflicts: 0 },
        createdAt: "2026-11-16T10:25:00Z",
        publishedAt: "2026-11-16T10:25:01Z",
        status: "published"
      }
    ];
  }

  function recomputeLocalOverview() {
    const reqs = Array.isArray(state.requests) ? state.requests : [];
    const tutors = Array.isArray(state.tutors) ? state.tutors : [];
    const users = Array.isArray(state.users) ? state.users : [];
    const payouts = Array.isArray(state.payouts) ? state.payouts : [];
    const outbox = Array.isArray(state.outbox) ? state.outbox : [];

    let gmvRub = 0;
    let feeRub = 0;
    let payoutRub = 0;
    let pendingRequestsCount = 0;
    for (const r of reqs) {
      if (r.status === "pending") pendingRequestsCount += 1;
      if (r.status === "accepted") {
        const gross = Number(r.finalPriceRub || r.counterPriceRub || r.offerPriceRub || 0);
        const fee = Math.round(gross * 0.05);
        gmvRub += gross;
        feeRub += fee;
        payoutRub += (gross - fee);
      }
    }
    if (!gmvRub) {
      gmvRub = 18450;
      feeRub = 923;
      payoutRub = 17527;
    }

    const chCounts = {};
    for (const t of tutors) {
      const ch = t.sourceChannel || "doska_ykt";
      chCounts[ch] = (chCounts[ch] || 0) + 1;
    }
    const totalTutors = Math.max(1, tutors.length);
    const channelShare = Object.keys(chCounts).map((ch) => ({
      channel: ch,
      count: chCounts[ch],
      sharePct: Math.round((chCounts[ch] * 1000) / totalTutors) / 10
    }));

    state.overview = {
      ok: true,
      kpi: {
        gmvRub,
        feeRub,
        payoutRub,
        usersCount: users.length,
        tutorsCount: tutors.length,
        requestsCount: reqs.length,
        pendingRequestsCount,
        payoutsCount: payouts.length,
        outboxPending: outbox.filter((e) => e.status !== "published").length
      },
      channelShare,
      dailySeries: [
        { date: "2026-11-11", gmvRub: 2400, feeRub: 120, payoutRub: 2280, requests: 2, accepted: 2 },
        { date: "2026-11-12", gmvRub: 3600, feeRub: 180, payoutRub: 3420, requests: 3, accepted: 3 },
        { date: "2026-11-13", gmvRub: 2100, feeRub: 105, payoutRub: 1995, requests: 2, accepted: 1 },
        { date: "2026-11-14", gmvRub: 4800, feeRub: 240, payoutRub: 4560, requests: 4, accepted: 4 },
        { date: "2026-11-15", gmvRub: 3100, feeRub: 155, payoutRub: 2945, requests: 3, accepted: 2 },
        { date: "2026-11-16", gmvRub: gmvRub, feeRub: feeRub, payoutRub: payoutRub, requests: reqs.length, accepted: reqs.filter((r) => r.status === "accepted").length }
      ],
      storage: {
        ok: true,
        mode: isBackendLive() ? "dual" : "local",
        sqlite: "ok",
        postgres: isBackendLive() ? "ok" : "local",
        outboxPending: outbox.filter((e) => e.status !== "published").length
      }
    };
  }

  function ensureLocalData() {
    if (!state.architecture) state.architecture = buildSeededArchitecture();
    if (!state.users) state.users = buildSeededUsers();
    if (!state.tutors) state.tutors = buildSeededTutors();
    if (!state.requests) state.requests = buildSeededRequests();
    if (!state.payouts) state.payouts = buildSeededPayouts();
    if (!state.outbox) state.outbox = buildSeededOutbox();
    if (!state.overview) recomputeLocalOverview();
  }

  function pushLocalOutbox(topic, key, eventType, payload) {
    ensureLocalData();
    const nextId = state.outbox.reduce((mx, e) => Math.max(mx, Number(e.id) || 0), 100) + 1;
    state.outbox.unshift({
      id: nextId,
      topic,
      partitionKey: String(key || ""),
      eventType,
      payload: payload || {},
      createdAt: new Date().toISOString(),
      publishedAt: null,
      status: "pending"
    });
    recomputeLocalOverview();
  }

  async function loadData(force) {
    ensureLocalData();
    if (!isBackendLive()) return false;
    const now = Date.now();
    if (state.loading) return false;
    if (!force && state.lastLoadedAt && (now - state.lastLoadedAt) < 12000) return false;

    state.loading = true;
    renderLater();
    try {
      const adm = EGE.api.admin;
      const results = await Promise.allSettled([
        adm.overview(),
        adm.users(),
        adm.tutors(),
        adm.requests(),
        adm.payouts(),
        adm.outbox(),
        adm.architecture()
      ]);
      if (results[0].status === "fulfilled" && results[0].value && results[0].value.kpi) state.overview = results[0].value;
      if (results[1].status === "fulfilled" && results[1].value && Array.isArray(results[1].value.users)) state.users = results[1].value.users;
      if (results[2].status === "fulfilled" && results[2].value && Array.isArray(results[2].value.tutors)) state.tutors = results[2].value.tutors;
      if (results[3].status === "fulfilled" && results[3].value && Array.isArray(results[3].value.requests)) state.requests = results[3].value.requests;
      if (results[4].status === "fulfilled" && results[4].value && Array.isArray(results[4].value.payouts)) state.payouts = results[4].value.payouts;
      if (results[5].status === "fulfilled" && results[5].value && Array.isArray(results[5].value.events)) state.outbox = results[5].value.events;
      if (results[6].status === "fulfilled" && results[6].value && Array.isArray(results[6].value.layers)) state.architecture = results[6].value.layers;
      state.lastLoadedAt = Date.now();
    } catch (e) {
      /* остаёмся на локальном кэше */
    } finally {
      state.loading = false;
      renderLater();
    }
    return true;
  }

  function renderDataTable(opts) {
    if (EGE.charts && typeof EGE.charts.dataTableHTML === "function") {
      return EGE.charts.dataTableHTML(opts);
    }
    return "";
  }

  function modBadge(status, label) {
    if (EGE.kit && typeof EGE.kit.adminModerationBadgeHTML === "function") {
      return EGE.kit.adminModerationBadgeHTML(status, label);
    }
    return `<span class="chip">${esc(label || status)}</span>`;
  }

  function reqStatusBadge(status) {
    if (status === "accepted") return modBadge("verified", "Подтверждена ✓");
    if (status === "declined") return modBadge("declined", "Отклонена");
    if (status === "refunded") return modBadge("frozen", "Возврат 100%");
    return modBadge("pending", "Ждёт ответа");
  }

  function payoutStatusBadge(status) {
    if (status === "succeeded") return modBadge("paid", "Выплачено ✓");
    if (status === "rejected") return modBadge("declined", "Отклонено");
    if (status === "processing") return modBadge("frozen", "В обработке");
    return modBadge("pending", "На проверке");
  }

  function fmtRub(n) {
    return (Number(n) || 0).toLocaleString("ru-RU") + " ₽";
  }

  function headerHTML() {
    ensureLocalData();
    const kpi = (state.overview && state.overview.kpi) || {};
    const storage = (state.overview && state.overview.storage) || {};
    const rtMode = isBackendLive() ? "sse" : "local";
    const storageLbl = storage.mode === "dual" ? "Dual PG17 + SQLite" : (storage.mode === "postgres" ? "PostgreSQL 17" : (isBackendLive() ? "SQLite WAL" : "Локальный стенд"));

    const roleBanner = (EGE.kit && typeof EGE.kit.roleSwitchBannerHTML === "function")
      ? EGE.kit.roleSwitchBannerHTML({
          activeRole: "admin",
          action: "role-set",
          counts: {
            student: kpi.usersCount || (state.users || []).length,
            tutor: kpi.tutorsCount || (state.tutors || []).length,
            admin: kpi.pendingRequestsCount || 0
          }
        })
      : "";

    const rtPill = (EGE.kit && typeof EGE.kit.realtimeStatusPillHTML === "function")
      ? EGE.kit.realtimeStatusPillHTML({
          mode: rtMode,
          channelLabel: storageLbl,
          unreadCount: Number(kpi.outboxPending || 0)
        })
      : `<span class="chip accent">${esc(storageLbl)}</span>`;

    const tabs = [
      ["overview", "Обзор"],
      ["requests", "Заявки и Ученики"],
      ["tutors", "Репетиторы"],
      ["payouts", "Выплаты"],
      ["system", "Система и API"]
    ];

    return `<div class="stack" style="gap:12px">
      <div class="head">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:center">
          <div>
            <div class="eyebrow">Админ-панель · Вектор ЕГЭ</div>
            <h1 class="h1">Управление платформой, модерация и эскроу</h1>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap;align-items:center">
            ${rtPill}
            <button type="button" class="btn soft sm" data-a="adm-refresh"${state.loading ? " disabled" : ""}>${icon("repeat")}<span>${state.loading ? "Обновление…" : "Обновить"}</span></button>
          </div>
        </div>
        <p class="lead">Модерация анкет, заявки и ставки ±100 ₽, выплаты НПД (95% / 5%) и контроль границ сервисов и аутбокса Kafka.</p>
      </div>
      ${roleBanner}
      <div class="hh-seg" role="group" aria-label="Разделы админ-панели" style="flex-wrap:wrap">
        ${tabs.map(([tid, lbl]) => `<button type="button" data-a="adm-tab" data-v="${tid}" aria-pressed="${state.tab === tid}">${esc(lbl)}</button>`).join("")}
      </div>
    </div>`;
  }

  function renderOverviewTab() {
    const ov = state.overview || {};
    const kpi = ov.kpi || {};
    const users = Array.isArray(state.users) ? state.users : [];
    const daily = Array.isArray(ov.dailySeries) ? ov.dailySeries : [];

    const kpiItems = [
      { label: "GMV ₽", value: fmtRub(kpi.gmvRub), delta: "+18% · 100%", tone: "accent", note: "Подтверждённые уроки (эскроу)", action: "adm-tab", actionVal: "requests" },
      { label: "Выплаты 95% ₽", value: fmtRub(kpi.payoutRub), delta: "На руки репетитору", tone: "confirm", note: "СБП и Карта Мир ≥ 500 ₽", action: "adm-tab", actionVal: "payouts" },
      { label: "Сбор 5% ₽", value: fmtRub(kpi.feeRub), delta: "Комиссия 5%", tone: "gold", note: "Сервисный сбор платформы", action: "adm-tab", actionVal: "payouts" },
      { label: "Активных заявок", value: String(kpi.pendingRequestsCount != null ? kpi.pendingRequestsCount : 0), delta: `Всего ${kpi.requestsCount || 0}`, tone: "notif", note: "Ожидают решения или торга ±100 ₽", action: "adm-tab", actionVal: "requests" },
      { label: "Outbox Pending", value: String(kpi.outboxPending != null ? kpi.outboxPending : 0), delta: "Kafka v1", tone: "pro", note: "outbox.kafka_outbox (PG17)", action: "adm-tab", actionVal: "system" }
    ];

    const kpiHtml = (EGE.kit && typeof EGE.kit.adminKpiGridHTML === "function")
      ? EGE.kit.adminKpiGridHTML(kpiItems)
      : "";

    const maxGmv = Math.max(1000, ...daily.map((d) => Number(d.gmvRub) || 0));
    const bars = daily.length
      ? daily.slice(-7).map((d) => ({
          wd: String(d.date || "").slice(5),
          val: Math.round((Number(d.gmvRub) || 0) / 100) / 10 + "к",
          num: Number(d.gmvRub) || 0,
          detail: `${d.date}: GMV ${fmtRub(d.gmvRub)} · сбор 5% ${fmtRub(d.feeRub)}`,
          pct: Math.max(14, Math.round(((Number(d.gmvRub) || 0) / maxGmv) * 100)),
          gold: (Number(d.gmvRub) || 0) >= maxGmv * 0.8
        }))
      : (EGE.charts ? EGE.charts.chartDatasetBars("income") : []);

    const chartHtml = (EGE.charts && typeof EGE.charts.stickChartHTML === "function")
      ? EGE.charts.stickChartHTML("combo", bars, Math.max(0, bars.length - 1), false, "Динамика GMV платформы")
      : "";
    const donutHtml = (EGE.charts && typeof EGE.charts.donutChartHTML === "function")
      ? EGE.charts.donutChartHTML({ dataset: "channels", activeIdx: 0 })
      : "";

    const userCols = [
      { key: "displayName", label: "Пользователь", render: (u) => `<div class="stack" style="gap:2px"><b>${esc(u.displayName || u.username)}</b><span class="small muted">${esc(u.username)}</span></div>` },
      { key: "email", label: "Контакт / Email", minCols: 5, render: (u) => `<span class="small">${esc(u.email || "—")}</span>` },
      { key: "authProvider", label: "Провайдер", minCols: 7, render: (u) => `<span class="chip">${esc(u.authProvider || "local")}</span>` },
      { key: "createdAt", label: "Создан", minCols: 7, num: true, render: (u) => `<span class="small num">${esc(String(u.createdAt || "").slice(0, 10))}</span>` },
      { key: "role", label: "Текущая роль", render: (u) => modBadge(u.role === "admin" ? "published" : (u.role === "tutor" ? "verified" : "pending"), u.role === "admin" ? "Админ" : (u.role === "tutor" ? "Преподаватель" : "Ученик")) },
      {
        key: "actions",
        label: "Смена роли",
        isActions: true,
        render: (u) => `<div class="row" style="gap:4px;flex-wrap:wrap">
          ${VALID_ROLES.map((r) => `<button type="button" class="chip-btn${u.role === r ? " on" : ""}" data-a="adm-user-role" data-id="${esc(u.id)}" data-role="${r}">${esc(r)}</button>`).join("")}
        </div>`
      }
    ];

    const usersTableHtml = renderDataTable({
      id: "adm-overview-users",
      cardWrap: false,
      showPresetSwitch: false,
      eyebrow: "Пользователи и RBAC-роли",
      title: "Реестр аккаунтов платформы",
      cols: state.cols,
      filter: state.filter,
      query: state.query,
      colsAction: "adm-tbl-cols",
      filterAction: "adm-tbl-filter",
      searchAction: "adm-tbl-q",
      searchId: "adm-tbl-q",
      searchPlaceholder: "Поиск: имя, логин, email, роль…",
      filters: [
        { id: "all", label: `Все (${users.length})`, match: () => true },
        { id: "student", label: "Ученики", match: (u) => u.role === "student" },
        { id: "tutor", label: "Преподаватели", match: (u) => u.role === "tutor" },
        { id: "admin", label: "Админы", match: (u) => u.role === "admin" }
      ],
      columns: userCols,
      rows: users,
      searchFields: (u) => [u.username, u.displayName, u.email, u.role, u.authProvider].join(" "),
      emptyText: "Пользователей по фильтру не найдено."
    });

    return `<div class="stack" style="gap:16px">
      ${kpiHtml}
      <div class="tc-two-col">
        <section class="card pad stack" style="gap:10px" aria-label="Динамика GMV">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div>
              <div class="eyebrow">Оборот и тренд · 95% / 5%</div>
              <h2 class="h2">Динамика GMV по дням</h2>
            </div>
            <span class="bb-spec-pill num">${fmtRub(kpi.gmvRub)}</span>
          </div>
          ${chartHtml}
        </section>
        <section class="card pad stack" style="gap:10px" aria-label="Источники анкет и заявок">
          <div>
            <div class="eyebrow">Ykt · Telegram · WhatsApp · MAX</div>
            <h2 class="h2">Каналы привлечения</h2>
          </div>
          ${donutHtml}
        </section>
      </div>
      <section class="card pad stack" style="gap:12px" aria-label="Пользователи">
        ${usersTableHtml}
      </section>
    </div>`;
  }

  function renderRequestsTab() {
    const reqs = Array.isArray(state.requests) ? state.requests : [];
    const TDATA = getTDATA();
    const leads = TDATA && typeof TDATA.getStudentLeads === "function" ? TDATA.getStudentLeads() : [];

    const reqCols = [
      {
        key: "student",
        label: "Ученик и репетитор",
        render: (r) => `<div class="stack" style="gap:2px"><b>${esc(r.studentName)} → ${esc(r.tutorName)}</b><span class="small muted">${esc(r.subject)} · ${esc(r.city)} (${esc(r.timezone)})</span></div>`
      },
      {
        key: "slot",
        label: "Слот (10–20 ч)",
        minCols: 5,
        num: true,
        render: (r) => `<span class="num">${esc(r.slotDate)} · ${esc(r.hourSlot)}</span>`
      },
      {
        key: "price",
        label: "Ставка ±100 ₽",
        num: true,
        render: (r) => {
          const eff = Number(r.finalPriceRub || r.counterPriceRub || r.offerPriceRub || 0);
          return `<div class="stack" style="gap:2px"><b class="num">${fmtRub(eff)}</b><span class="small muted num">сбор 5%: ${fmtRub(Math.round(eff * 0.05))}</span></div>`;
        }
      },
      {
        key: "escrow",
        label: "Эскроу и канал",
        minCols: 7,
        render: (r) => `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="chip">${esc(r.escrowStatus || "frozen")}</span><span class="small muted">${esc(r.messengerChannel || "whatsapp")}</span></div>`
      },
      {
        key: "tariff",
        label: "Тариф",
        minCols: 7,
        render: (r) => `<span class="small">${esc(r.tariffId || "trial5k")}</span>`
      },
      {
        key: "status",
        label: "Статус",
        render: (r) => reqStatusBadge(r.status)
      },
      {
        key: "actions",
        label: "Модерация",
        isActions: true,
        render: (r) => `<div class="row" style="gap:4px;flex-wrap:wrap">
          <button type="button" class="btn confirm sm" data-a="adm-req-status" data-id="${esc(r.id)}" data-status="accepted">✓ Принять</button>
          <button type="button" class="btn ghost sm" data-a="adm-req-status" data-id="${esc(r.id)}" data-status="declined">Отклонить</button>
          <button type="button" class="btn soft sm" data-a="adm-req-status" data-id="${esc(r.id)}" data-status="refunded">Возврат</button>
        </div>`
      }
    ];

    const reqTableHtml = renderDataTable({
      id: "adm-requests-table",
      cardWrap: false,
      showPresetSwitch: false,
      eyebrow: "Единый поток заявок · Торг ±100 ₽ и эскроу",
      title: "Заявки на занятия и статусы учеников",
      cols: state.cols,
      filter: state.filter,
      query: state.query,
      colsAction: "adm-tbl-cols",
      filterAction: "adm-tbl-filter",
      searchAction: "adm-tbl-q",
      searchId: "adm-tbl-q",
      searchPlaceholder: "Поиск: ученик, репетитор, предмет, дата…",
      filters: [
        { id: "all", label: `Все (${reqs.length})`, match: () => true },
        { id: "pending", label: "Ждут ответа", match: (r) => r.status === "pending" },
        { id: "accepted", label: "Подтверждены", match: (r) => r.status === "accepted" },
        { id: "declined", label: "Отклонены", match: (r) => r.status === "declined" },
        { id: "refunded", label: "Возврат", match: (r) => r.status === "refunded" }
      ],
      columns: reqCols,
      rows: reqs,
      searchFields: (r) => [r.id, r.studentName, r.tutorName, r.subject, r.city, r.slotDate, r.hourSlot, r.status].join(" "),
      emptyText: "По выбранному фильтру заявок нет."
    });

    const leadsCols = [
      { key: "student", label: "Ученик", render: (l) => `<b>${esc(l.studentName || "Ученик")}</b>` },
      { key: "subjects", label: "Предметы", render: (l) => esc(TDATA && typeof TDATA.subjectNamesForIds === "function" ? TDATA.subjectNamesForIds(l.subjects || []).join(" · ") : (l.subjects || []).join(", ")) },
      { key: "budget", label: "Бюджет", num: true, render: (l) => `<b class="num">${fmtRub(l.targetPrice || 1000)}/ч</b>` },
      { key: "status", label: "Статус", render: (l) => modBadge(l.responded ? "verified" : "pending", l.responded ? "Есть отклики" : "Ищет репетитора") }
    ];

    const leadsHtml = leads.length
      ? `<section class="card pad stack" style="gap:10px" aria-label="Заявки учеников в поиске">
          ${renderDataTable({
            id: "adm-student-leads-table",
            cardWrap: false,
            showPresetSwitch: false,
            showColsSwitch: false,
            showSearch: false,
            eyebrow: "Лента «Ученики ищут»",
            title: `Открытые запросы учеников (${leads.length})`,
            cols: 5,
            columns: leadsCols,
            rows: leads
          })}
        </section>`
      : "";

    return `<div class="stack" style="gap:16px">
      <section class="card pad stack" style="gap:12px" aria-label="Заявки и модерация">
        ${reqTableHtml}
      </section>
      ${leadsHtml}
    </div>`;
  }

  function renderTutorsTab() {
    const tutors = Array.isArray(state.tutors) ? state.tutors : [];
    const tutorCols = [
      {
        key: "fullName",
        label: "Преподаватель",
        render: (t) => `<div class="stack" style="gap:2px"><b>${esc(t.fullName)}</b><span class="small muted">${esc(t.subject)} · ★ ${Number(t.rating || 4.9).toFixed(2)} (${t.reviewsCount || 0})</span></div>`
      },
      {
        key: "city",
        label: "Город и пояс",
        minCols: 5,
        render: (t) => `<span class="small">${esc(t.city)} · ${esc(t.timezone)}</span>`
      },
      {
        key: "rate",
        label: "Ставка ±100 ₽",
        num: true,
        render: (t) => `<div class="stack" style="gap:2px"><b class="num">${fmtRub(t.baseRateRub)}/ч</b><span class="small muted num">рынок ${fmtRub(t.marketRateRub)}</span></div>`
      },
      {
        key: "source",
        label: "Источник",
        minCols: 7,
        render: (t) => `<span class="chip">${esc(t.sourceChannel || "doska_ykt")}</span>`
      },
      {
        key: "tariff",
        label: "Тариф",
        minCols: 7,
        render: (t) => `<span class="small">${esc(t.tariffId || "trial5k")}</span>`
      },
      {
        key: "verified",
        label: "Верификация",
        render: (t) => `<div class="row" style="gap:6px;flex-wrap:wrap">${modBadge(t.verified ? "verified" : "pending")}${t.bumpedToday ? '<span class="chip gold">Топ 4 ч</span>' : ""}</div>`
      },
      {
        key: "actions",
        label: "Действия",
        isActions: true,
        render: (t) => `<div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn ${t.verified ? "ghost" : "confirm"} sm" data-a="adm-verify-tutor" data-id="${esc(t.id)}">${t.verified ? "Снять проверку" : "✓ Верифицировать"}</button>
          <button type="button" class="btn soft sm" data-a="adm-bump-tutor" data-id="${esc(t.id)}">${t.bumpedToday ? "Поднята ✓" : "Поднять в топ"}</button>
        </div>`
      }
    ];

    return `<section class="card pad stack" style="gap:12px" aria-label="Реестр репетиторов">
      ${renderDataTable({
        id: "adm-tutors-table",
        cardWrap: false,
        showPresetSwitch: false,
        eyebrow: "Модерация анкет · Ykt / TG / WA / MAX",
        title: "Реестр преподавателей платформы",
        cols: state.cols,
        filter: state.filter,
        query: state.query,
        colsAction: "adm-tbl-cols",
        filterAction: "adm-tbl-filter",
        searchAction: "adm-tbl-q",
        searchId: "adm-tbl-q",
        searchPlaceholder: "Поиск: имя, предмет, город, источник…",
        filters: [
          { id: "all", label: `Все (${tutors.length})`, match: () => true },
          { id: "verified", label: "Проверены ✓", match: (t) => !!t.verified },
          { id: "pending", label: "На проверке", match: (t) => !t.verified },
          { id: "bumped", label: "Подняты", match: (t) => !!t.bumpedToday }
        ],
        columns: tutorCols,
        rows: tutors,
        searchFields: (t) => [t.id, t.fullName, t.subject, t.city, t.timezone, t.sourceChannel, t.tariffId].join(" "),
        emptyText: "Анкет по фильтру не найдено."
      })}
    </section>`;
  }

  function renderPayoutsTab() {
    const payouts = Array.isArray(state.payouts) ? state.payouts : [];
    const payoutCols = [
      {
        key: "tutorName",
        label: "Преподаватель",
        render: (p) => `<div class="stack" style="gap:2px"><b>${esc(p.tutorName || p.tutorId)}</b><span class="small muted">${esc(p.id)}</span></div>`
      },
      {
        key: "channel",
        label: "СБП / Карта Мир",
        minCols: 5,
        render: (p) => `<div class="stack" style="gap:2px"><b>${esc(p.bank || (p.method === "card" ? "Карта Мир" : "СБП"))}</b><span class="small muted num">${esc(p.destinationMasked || "—")}</span></div>`
      },
      {
        key: "amount",
        label: "Сумма (≥ 500 ₽)",
        num: true,
        render: (p) => `<b class="num">${fmtRub(p.amountRub)}</b>`
      },
      {
        key: "npd",
        label: "Чек НПД",
        minCols: 5,
        render: (p) => `<code class="small">${esc(p.npdReceipt || "Без чека")}</code>`
      },
      {
        key: "createdAt",
        label: "Создана",
        minCols: 7,
        num: true,
        render: (p) => `<span class="small num">${esc(String(p.createdAt || "").slice(0, 10))}</span>`
      },
      {
        key: "status",
        label: "Статус",
        render: (p) => payoutStatusBadge(p.status)
      },
      {
        key: "actions",
        label: "Выплата",
        isActions: true,
        render: (p) => `<div class="row" style="gap:6px;flex-wrap:wrap">
          <button type="button" class="btn confirm sm" data-a="adm-payout-approve" data-id="${esc(p.id)}"${p.status === "succeeded" ? " disabled" : ""}>✓ Провести</button>
          <button type="button" class="btn ghost sm" data-a="adm-payout-decline" data-id="${esc(p.id)}"${p.status === "rejected" ? " disabled" : ""}>Отклонить</button>
        </div>`
      }
    ];

    return `<section class="card pad stack" style="gap:12px" aria-label="Очередь выплат НПД">
      ${renderDataTable({
        id: "adm-payouts-table",
        cardWrap: false,
        showPresetSwitch: false,
        eyebrow: "Выплаты 95% · СБП и Карта Мир ≥ 500 ₽",
        title: "Очередь выплат преподавателям и чеки НПД",
        cols: state.cols,
        filter: state.filter,
        query: state.query,
        colsAction: "adm-tbl-cols",
        filterAction: "adm-tbl-filter",
        searchAction: "adm-tbl-q",
        searchId: "adm-tbl-q",
        searchPlaceholder: "Поиск: преподаватель, банк, чек НПД…",
        filters: [
          { id: "all", label: `Все (${payouts.length})`, match: () => true },
          { id: "processing", label: "В обработке", match: (p) => p.status === "processing" },
          { id: "succeeded", label: "Выплачено ✓", match: (p) => p.status === "succeeded" },
          { id: "rejected", label: "Отклонено", match: (p) => p.status === "rejected" }
        ],
        columns: payoutCols,
        rows: payouts,
        searchFields: (p) => [p.id, p.tutorName, p.bank, p.destinationMasked, p.npdReceipt, p.status, String(p.amountRub || "")].join(" "),
        emptyText: "Выплат по выбранному фильтру нет."
      })}
    </section>`;
  }

  function renderSystemTab() {
    const layers = Array.isArray(state.architecture) ? state.architecture : buildSeededArchitecture();
    const outbox = Array.isArray(state.outbox) ? state.outbox : [];

    const boundaryCardsHtml = (EGE.kit && typeof EGE.kit.serviceBoundaryCardHTML === "function")
      ? layers.map((l) => EGE.kit.serviceBoundaryCardHTML(Object.assign({}, l, {
          layer: l.layer === "postgres" ? "postgresql" : l.layer
        }))).join("")
      : "";

    const pipelineStages = [
      {
        engine: "postgres",
        title: "PostgreSQL 17 · Dual-Write + Outbox",
        stage: "OLTP",
        status: "ok",
        statusLabel: "Synced",
        latencyMs: "0.9 ms",
        throughput: "1.4k tx/s",
        freshness: "Live",
        target: "oltp.* → outbox.kafka_outbox",
        notes: "Транзакционная запись пользователей, заявок, выплат и аутбокса."
      },
      {
        engine: "polars",
        title: "Polars 2.1 + DuckDB · Medallion ETL",
        stage: "Bronze → Gold",
        status: "ok",
        statusLabel: "arm64 M4 Pro",
        latencyMs: "18 ms",
        throughput: "250k rows/s",
        freshness: "15 min",
        target: "warehouse/gold/*.parquet",
        notes: "Дедупликация анкет Ykt/TG/WA/MAX и расчёт витрины ставок."
      },
      {
        engine: "airflow",
        title: "Airflow 3.4 · DAG Orchestrator",
        stage: "3 DAGs",
        status: "ok",
        statusLabel: "Healthy :8085",
        latencyMs: "1.2 s",
        throughput: "Hourly",
        freshness: "15 min",
        target: "vektor_medallion_hourly",
        notes: "Контроль качества данных и пересчёт витрин в PostgreSQL."
      }
    ];

    const pipeHtml = (EGE.kit && typeof EGE.kit.pipelineStageCardHTML === "function")
      ? pipelineStages.map((s) => EGE.kit.pipelineStageCardHTML(s)).join("")
      : "";

    const mappedOutbox = outbox.map((ev) => ({
      event_id: String(ev.id || ""),
      occurred_at: String(ev.createdAt || "").slice(11, 19) || "00:00:00",
      event_type: ev.eventType || "outbox.event",
      role: ev.status === "published" ? "kafka" : "outbox",
      view: ev.topic || "vektor.market.bids.v1",
      engine: ev.status === "published" ? "kafka" : "postgres",
      payloadSummary: `key=${ev.partitionKey || "—"} · ${ev.status || "pending"} · ${JSON.stringify(ev.payload || {})}`
    }));

    const outboxHtml = (EGE.kit && typeof EGE.kit.eventLogFeedHTML === "function")
      ? EGE.kit.eventLogFeedHTML({
          title: "Лента транзакционного аутбокса (outbox.kafka_outbox)",
          events: mappedOutbox,
          maxItems: 12
        })
      : "";

    return `<div class="stack" style="gap:16px">
      <section class="stack" style="gap:10px" aria-label="7 сервисов и репозиториев">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Decoupled 7-Repo Architecture</div>
            <h2 class="h2">Границы сервисов (UI-Kit :8772 · API :8771 · SPA :8770 · Data Mesh)</h2>
          </div>
          <span class="bb-spec-pill num">${layers.length} контуров</span>
        </div>
        <div class="bb-arch-grid">${boundaryCardsHtml}</div>
      </section>
      <section class="stack" style="gap:10px" aria-label="Стадии конвейера данных">
        <h2 class="h2">Стадии ETL / ELT и Observability</h2>
        <div class="bb-pipe-grid">${pipeHtml}</div>
      </section>
      ${outboxHtml}
    </div>`;
  }

  function viewAdmin() {
    ensureLocalData();
    let bodyHtml = "";
    if (state.tab === "requests") bodyHtml = renderRequestsTab();
    else if (state.tab === "tutors") bodyHtml = renderTutorsTab();
    else if (state.tab === "payouts") bodyHtml = renderPayoutsTab();
    else if (state.tab === "system") bodyHtml = renderSystemTab();
    else bodyHtml = renderOverviewTab();

    return `${headerHTML()}${bodyHtml}`;
  }

  function handleAction(act, el) {
    ensureLocalData();
    const d = (el && el.dataset) || {};
    if (act === "adm-tab") {
      setTab(d.v || "overview");
      renderLater();
      return true;
    }
    if (act === "adm-refresh") {
      loadData(true);
      toast("Данные админ-панели обновлены");
      return true;
    }
    if (act === "adm-tbl-cols") {
      const c = Number(d.cols);
      state.cols = [3, 5, 7].includes(c) ? c : 5;
      renderLater();
      return true;
    }
    if (act === "adm-tbl-filter") {
      state.filter = d.v || "all";
      if (d.clearQ === "1") state.query = "";
      renderLater();
      return true;
    }
    if (act === "adm-user-role") {
      const uid = d.id;
      const role = VALID_ROLES.includes(d.role) ? d.role : "student";
      const u = (state.users || []).find((x) => String(x.id) === String(uid));
      if (u) {
        u.role = role;
        pushLocalOutbox("vektor.user.clickstream.v1", uid, "admin.user.role_updated", { userId: uid, role });
        if (isBackendLive()) {
          EGE.api.admin.setUserRole(uid, role).catch(() => {});
        }
        notify("Роль обновлена", `${u.displayName || u.username} → ${role}`);
        renderLater();
      }
      return true;
    }
    if (act === "adm-req-status") {
      const rid = d.id;
      const st = VALID_REQ_STATUSES.includes(d.status) ? d.status : "accepted";
      const req = (state.requests || []).find((x) => String(x.id) === String(rid));
      if (req) {
        req.status = st;
        if (st === "accepted") {
          req.finalPriceRub = req.finalPriceRub || req.counterPriceRub || req.offerPriceRub;
          req.escrowStatus = "captured";
        } else if (st === "declined" || st === "refunded") {
          req.escrowStatus = "refunded";
        } else {
          req.escrowStatus = "frozen";
        }
        pushLocalOutbox(st === "refunded" ? "vektor.payments.ledger.v1" : "vektor.market.bids.v1", rid, "admin.request." + st, { requestId: rid, status: st });
        if (isBackendLive()) {
          EGE.api.admin.setRequestStatus(rid, st).catch(() => {});
        }
        notify("Статус заявки обновлён", `${req.studentName} · ${st}`);
        renderLater();
      }
      return true;
    }
    if (act === "adm-verify-tutor") {
      const tid = d.id;
      const t = (state.tutors || []).find((x) => String(x.id) === String(tid));
      if (t) {
        t.verified = !t.verified;
        pushLocalOutbox("vektor.market.bids.v1", tid, "admin.tutor.moderated", { tutorId: tid, verified: t.verified });
        if (isBackendLive()) {
          EGE.api.admin.moderateTutor(tid, { verified: t.verified }).catch(() => {});
        }
        notify(t.verified ? "Преподаватель верифицирован ✓" : "Верификация снята", t.fullName);
        renderLater();
      }
      return true;
    }
    if (act === "adm-bump-tutor") {
      const tid = d.id;
      const t = (state.tutors || []).find((x) => String(x.id) === String(tid));
      if (t) {
        t.bumpedToday = true;
        pushLocalOutbox("vektor.market.bids.v1", tid, "admin.tutor.moderated", { tutorId: tid, bumped: true });
        if (isBackendLive()) {
          EGE.api.admin.moderateTutor(tid, { bumped: true }).catch(() => {});
        }
        notify("Анкета поднята в топ", t.fullName);
        renderLater();
      }
      return true;
    }
    if (act === "adm-payout-approve" || act === "adm-payout-decline") {
      const pid = d.id;
      const nextSt = act === "adm-payout-approve" ? "succeeded" : "rejected";
      const p = (state.payouts || []).find((x) => String(x.id) === String(pid));
      if (p) {
        p.status = nextSt;
        p.paidAt = nextSt === "succeeded" ? new Date().toISOString() : null;
        pushLocalOutbox("vektor.payments.ledger.v1", pid, "admin.payout." + nextSt, { payoutId: pid, status: nextSt, amountRub: p.amountRub });
        if (isBackendLive()) {
          EGE.api.admin.setPayoutStatus(pid, nextSt).catch(() => {});
        }
        notify(nextSt === "succeeded" ? "Выплата проведена ✓" : "Выплата отклонена", `${p.tutorName} · ${fmtRub(p.amountRub)}`);
        renderLater();
      }
      return true;
    }
    return false;
  }

  function handleInput(el) {
    if (!el) return false;
    const act = (el.dataset && el.dataset.a) || el.id || "";
    if (act === "adm-tbl-q") {
      state.query = String(el.value || "");
      renderLater();
      return true;
    }
    return false;
  }

  EGE.views = EGE.views || {};
  EGE.views.admin = {
    configure,
    getTab,
    setTab,
    loadData,
    viewAdmin,
    handleAction,
    handleInput
  };
})();
