/* Личный кабинет преподавателя: входящие заявки с торгом ±100 ₽, ставка, окна 10:00–20:00 и выплата 95%. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural, initials } = EGE.utils || { esc: (s) => String(s || ""), plural: (n, a) => a, initials: () => "П" };
  const { icon, sakhaPatternSVG, sakhaOhyorHTML } = EGE.ui || { icon: () => "", sakhaPatternSVG: () => "", sakhaOhyorHTML: () => "" };
  const { priceHeadlineHTML, priceDiffTagsHTML, feeSplitHTML, hhSelectHTML } = EGE.hh || { priceHeadlineHTML: () => "", priceDiffTagsHTML: () => "", feeSplitHTML: () => "", hhSelectHTML: null };

  const TC_LS_KEY = "vektor-ege:tutor-cabinet";
  const DAY_LIST = [
    { dow: "1", wd: "Пн", full: "Понедельник" },
    { dow: "2", wd: "Вт", full: "Вторник" },
    { dow: "3", wd: "Ср", full: "Среда" },
    { dow: "4", wd: "Чт", full: "Четверг" },
    { dow: "5", wd: "Пт", full: "Пятница" },
    { dow: "6", wd: "Сб", full: "Суббота" },
    { dow: "0", wd: "Вс", full: "Воскресенье" }
  ];

  const DEFAULT_REQUESTS = [
    {
      id: "tc-req-1",
      studentName: "Алина С.",
      exam: "ЕГЭ",
      subjectName: "Биология",
      format: "Онлайн",
      dayLabel: "Сб, 14 нояб.",
      hour: "16:00",
      offerPrice: 1100,
      counterPrice: 1100,
      tutorPrice: 1200,
      marketPrice: 1550,
      note: "Нужен разбор второй части ФИПИ: митоз, мейоз и задачи по генетике №28.",
      status: "pending",
      createdLabel: "12 мин назад"
    },
    {
      id: "tc-req-2",
      studentName: "Тимур К.",
      exam: "ЕГЭ",
      subjectName: "Химия",
      format: "Онлайн",
      dayLabel: "Вс, 15 нояб.",
      hour: "14:00",
      offerPrice: 1500,
      counterPrice: 1500,
      tutorPrice: 1200,
      marketPrice: 1400,
      note: "Готов доплатить за быстрый интенсив по сложной задаче №34 на смеси и олеум.",
      status: "pending",
      createdLabel: "28 мин назад"
    },
    {
      id: "tc-req-3",
      studentName: "Дарья В.",
      exam: "ОГЭ",
      subjectName: "Русский язык",
      format: "Онлайн",
      dayLabel: "Пн, 16 нояб.",
      hour: "18:00",
      offerPrice: 1200,
      counterPrice: 1200,
      tutorPrice: 1200,
      marketPrice: 1450,
      note: "Регулярные занятия раз в неделю по тестовой части и изложению.",
      status: "accepted",
      createdLabel: "Вчера"
    }
  ];

  let _ctx = {};
  let _cache = null;

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
  }

  function defaultState() {
    const profName =
      (typeof _ctx.profile === "function" && _ctx.profile().name) ||
      (_ctx.store && _ctx.store.user && (_ctx.store.user.displayName || _ctx.store.user.username)) ||
      "";
    return {
      filter: "all",
      activeDow: "6",
      bumpedToday: false,
      subjMenuOpen: false,
      profile: {
        name: profName || "Анна Соколова",
        subject: "bio",
        exams: ["ЕГЭ", "ОГЭ"],
        formats: ["Онлайн"],
        price: 1200,
        minFair: 900,
        bio: "Экспертная подготовка без шаблонов: разбираем задания ФИПИ, ловушки второй части и пишем пробники на 85+."
      },
      slots: {
        "1": ["14:00", "16:00", "19:00"],
        "2": ["10:00", "18:00"],
        "3": ["12:00", "16:00", "20:00"],
        "4": ["15:00", "18:00"],
        "5": ["10:00", "14:00", "19:00"],
        "6": ["10:00", "12:00", "16:00", "18:00"],
        "0": ["11:00", "15:00"]
      },
      requests: DEFAULT_REQUESTS.map((r) => Object.assign({}, r))
    };
  }

  function tState() {
    if (_cache) return _cache;
    let saved = null;
    try {
      const raw = localStorage.getItem(TC_LS_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { /* игнор */ }
    const def = defaultState();
    if (saved && typeof saved === "object") {
      _cache = Object.assign({}, def, saved);
      _cache.profile = Object.assign({}, def.profile, saved.profile || {});
      _cache.slots = Object.assign({}, def.slots, saved.slots || {});
      _cache.requests = Array.isArray(saved.requests) && saved.requests.length
        ? saved.requests
        : def.requests;
    } else {
      _cache = def;
    }
    return _cache;
  }

  function saveState() {
    try {
      localStorage.setItem(TC_LS_KEY, JSON.stringify(tState()));
    } catch (e) { /* игнор */ }
  }

  function clampStep(val, delta, lo, hi) {
    const cur = Math.round((Number(val) || lo) / 100) * 100;
    return Math.max(lo, Math.min(hi, cur + delta));
  }

  function syncedRequests() {
    const st = tState();
    const mktState = typeof _ctx.mkt === "function" ? _ctx.mkt() : null;
    const mktBookings = (mktState && Array.isArray(mktState.bookings)) ? mktState.bookings : [];
    const fromMarket = mktBookings.map((bk) => ({
      id: "mkt-" + bk.id,
      mktId: bk.id,
      studentName: "Заявка ученика (из каталога)",
      exam: bk.exam || "ЕГЭ",
      subjectName: bk.subjectName || "Подготовка",
      format: bk.format || "Онлайн",
      dayLabel: bk.dayLabel || "Ближайший слот",
      hour: bk.hour || "14:00",
      offerPrice: Number(bk.offerPrice) || st.profile.price,
      counterPrice: Number(bk.counterPrice || bk.offerPrice) || st.profile.price,
      tutorPrice: Number(bk.tutorPrice) || st.profile.price,
      marketPrice: Math.round((Number(bk.tutorPrice) || st.profile.price) * 1.28),
      note: bk.note || `Отклик со слотом ${bk.hour || "14:00"} — выберите ставку и подтвердите.`,
      status: bk.status || "pending",
      createdLabel: "С витрины /market"
    }));
    const marketIds = new Set(fromMarket.map((x) => x.id));
    const localOnly = (st.requests || []).filter((r) => !marketIds.has(r.id));
    return fromMarket.concat(localOnly);
  }

  function findReq(id) {
    return syncedRequests().find((r) => r.id === id) || null;
  }

  function updateReq(id, mutator) {
    const st = tState();
    if (String(id).indexOf("mkt-") === 0 && typeof _ctx.mkt === "function") {
      const mktId = String(id).slice(4);
      const mktState = _ctx.mkt();
      const bk = (mktState.bookings || []).find((b) => String(b.id) === mktId);
      if (bk) {
        mutator(bk, true);
        if (typeof _ctx.saveMkt === "function") _ctx.saveMkt();
        return bk;
      }
    }
    const target = (st.requests || []).find((r) => r.id === id);
    if (!target) return null;
    mutator(target, false);
    saveState();
    return target;
  }

  function pendingCount() {
    return syncedRequests().filter((r) => r.status === "pending").length;
  }

  function renderRequestCard(req, st) {
    const TDATA = getTDATA();
    const bidRate = Number(req.counterPrice || req.offerPrice) || st.profile.price;
    const tutorRate = Number(req.tutorPrice) || st.profile.price;
    const mktRate = Number(req.marketPrice) || Math.round(tutorRate * 1.25);
    const sp = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(bidRate)
      : { total: bidRate, fee: Math.round(bidRate * 0.05), payout: Math.round(bidRate * 0.95), pct: 5 };
    const isPending = req.status === "pending";
    const isAccepted = req.status === "accepted";
    const isCountered = req.status === "countered";
    const isDeclined = req.status === "declined";

    const statusBadge = isAccepted
      ? `<span class="chip confirm">✓ Подтверждено</span>`
      : isCountered
        ? `<span class="chip accent">Предложена ставка ${bidRate.toLocaleString("ru-RU")} ₽/ч</span>`
        : isDeclined
          ? `<span class="chip bad">Отклонено</span>`
          : `<span class="chip notif">Ожидает ответа · ${esc(req.createdLabel || "новое")}</span>`;

    return `<article class="tc-req-card${isPending ? " is-pending" : isAccepted ? " is-accepted" : ""}">
      <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:flex-start">
        <div class="row" style="gap:10px;min-width:0">
          <span class="tutor-avatar" aria-hidden="true">${esc(initials(req.studentName))}</span>
          <div class="stack" style="gap:2px;min-width:0">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <b>${esc(req.studentName)}</b>
              <span class="chip">${esc(req.exam)} · ${esc(req.subjectName)}</span>
            </div>
            <div class="small muted">${esc(req.dayLabel)} в <b class="num" style="color:var(--ink)">${esc(req.hour)}</b> · ${esc(req.format)}</div>
          </div>
        </div>
        ${statusBadge}
      </div>

      <div class="stack" style="gap:6px">
        <div class="hh-price-row">${priceHeadlineHTML(mktRate, bidRate, false)}</div>
        <div class="hh-diff-strip">
          ${priceDiffTagsHTML({ tutorPrice: tutorRate, marketPrice: mktRate, offerPrice: bidRate, qualBadge: "Повышенная ставка · Профи" })}
          <span class="diff-tag rate num">На руки 95%: ${sp.payout.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>

      ${req.note ? `<div class="tc-req-quote">${esc(req.note)}</div>` : ""}

      ${(isPending || isCountered) ? `
        <div class="hh-price-stepper compact">
          <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="-100">−100 ₽</button>
          <div class="hh-step-readout"><b class="num">${bidRate.toLocaleString("ru-RU")} ₽/ч</b><span class="small muted">ваша цена</span></div>
          <button type="button" class="hh-step-btn" data-a="tc-req-step" data-id="${esc(req.id)}" data-step="100">+100 ₽</button>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn confirm sm" data-a="tc-req-accept" data-id="${esc(req.id)}">${icon("check")}<span>Подтвердить ${bidRate.toLocaleString("ru-RU")} ₽</span></button>
          ${bidRate !== req.offerPrice ? `<button type="button" class="btn soft sm" data-a="tc-req-counter" data-id="${esc(req.id)}">Отправить контр-ставку</button>` : ""}
          <button type="button" class="btn ghost sm" data-a="tc-req-decline" data-id="${esc(req.id)}">Отклонить</button>
        </div>` : isAccepted ? `
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <span class="small ink2">Выплата после урока: <b class="num">${sp.payout.toLocaleString("ru-RU")} ₽</b> <span class="muted">(сбор ${sp.fee} ₽)</span></span>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn confirm sm" data-a="tc-req-msg" data-id="${esc(req.id)}">${icon("msg")}<span>Написать ученику</span></button>
          </div>
        </div>` : `
        <div class="row" style="gap:8px">
          <button type="button" class="btn soft sm" data-a="tc-req-restore" data-id="${esc(req.id)}">Вернуть в рассмотрение</button>
        </div>`}
    </article>`;
  }

  function viewCabinet() {
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const allReqs = syncedRequests();
    const pendingList = allReqs.filter((r) => r.status === "pending");
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const visibleReqs = st.filter === "pending"
      ? pendingList
      : st.filter === "accepted"
        ? acceptedList
        : allReqs;

    const totalPayout = acceptedList.reduce((acc, r) => {
      const rate = Number(r.counterPrice || r.offerPrice) || p.price;
      const sp = TDATA && typeof TDATA.commissionSplit === "function"
        ? TDATA.commissionSplit(rate)
        : { payout: Math.round(rate * 0.95) };
      return acc + sp.payout;
    }, 0);

    const activeDayObj = DAY_LIST.find((d) => d.dow === st.activeDow) || DAY_LIST[5];
    const daySlots = Array.isArray(st.slots[activeDayObj.dow]) ? st.slots[activeDayObj.dow] : [];
    const totalSlotsCount = Object.keys(st.slots).reduce((s, k) => s + (Array.isArray(st.slots[k]) ? st.slots[k].length : 0), 0);
    const subjects = (TDATA && TDATA.SUBJECTS) ? TDATA.SUBJECTS : [{ id: "bio", name: "Биология" }];
    const hours = (TDATA && TDATA.HOURS) ? TDATA.HOURS : ["10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00", "20:00"];
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { total: p.price, fee: Math.round(p.price * 0.05), payout: Math.round(p.price * 0.95), pct: 5 };

    return `
      <div class="head">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div class="eyebrow">Саха сирэ · Личный кабинет преподавателя</div>
            <h1 class="h1">${esc(p.name)}</h1>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn sakha-pattern${st.bumpedToday ? " is-confirmed" : ""}" data-a="tc-bump">
              ${sakhaPatternSVG("rhombus", 18)}
              <span>${st.bumpedToday ? "✓ Анкета поднята сегодня" : "Сөп · Актуален сегодня (0 ₽)"}</span>
              ${sakhaPatternSVG("lattice", 18)}
            </button>
          </div>
        </div>
        <p class="lead">Управляйте входящими ставками ±100 ₽, открывайте окна 10:00–20:00 и поднимайте анкету в начало каталога без скрытых сборов.</p>
      </div>

      <div class="tc-role-bar" role="region" aria-label="Режим профиля">
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="chip gold">${icon("users")}<span>Режим: Преподаватель</span></span>
          <span class="small ink2">Нужно позаниматься по тестам или найти коллегу? Переключитесь в режим ученика в один клик.</span>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn soft sm" data-a="role-set" data-role="student">Перейти как ученик</button>
          <button type="button" class="btn ghost sm" data-a="go" data-v="market">Каталог /market</button>
        </div>
      </div>

      ${sakhaOhyorHTML("Саха сирэ · Торг ±100 ₽ · Выплата 95%")}

      <div class="tiles">
        <div class="tile">
          <span class="tile-label">Новые заявки</span>
          <span class="tile-value num" style="color:${pendingList.length ? "var(--notif)" : "var(--ink)"}">${pendingList.length}</span>
          <span class="tile-note">${pendingList.length ? "ждут вашего ответа" : "все разобраны"}</span>
        </div>
        <div class="tile">
          <span class="tile-label">Подтверждено</span>
          <span class="tile-value num" style="color:var(--confirm)">${acceptedList.length}</span>
          <span class="tile-note">${plural(acceptedList.length, "урок на неделе", "урока на неделе", "уроков на неделе")}</span>
        </div>
        <div class="tile">
          <span class="tile-label">Ставка в анкете</span>
          <span class="tile-value num">${p.price.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">торг от ${p.minFair.toLocaleString("ru-RU")} ₽/ч</span>
        </div>
        <div class="tile">
          <span class="tile-label">Чистый доход (95%)</span>
          <span class="tile-value num savings-gold-txt">${totalPayout.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note"><button type="button" class="link-btn small" data-a="go" data-v="fees">Условия 5% →</button></span>
        </div>
      </div>

      <div class="tc-grid">
        <section class="stack" style="gap:12px" aria-label="Входящие заявки учеников">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div>
              <div class="eyebrow">Торг в реальном времени</div>
              <h2 class="h2">Входящие заявки учеников</h2>
            </div>
            <div class="chip-rail" role="group" aria-label="Фильтр заявок">
              <button type="button" class="chip-btn${st.filter === "all" ? " on" : ""}" data-a="tc-filter" data-v="all">Все (${allReqs.length})</button>
              <button type="button" class="chip-btn${st.filter === "pending" ? " on" : ""}" data-a="tc-filter" data-v="pending">Ждут ответа (${pendingList.length})</button>
              <button type="button" class="chip-btn${st.filter === "accepted" ? " on" : ""}" data-a="tc-filter" data-v="accepted">Подтверждено (${acceptedList.length})</button>
            </div>
          </div>

          ${visibleReqs.length
            ? visibleReqs.map((req) => renderRequestCard(req, st)).join("")
            : `<div class="empty"><b>По этому фильтру заявок нет</b><span class="small muted">Переключите фильтр или проверьте расписание открытых окон справа.</span><button type="button" class="btn soft sm" data-a="tc-reset-demo">Показать пример заявок</button></div>`}
        </section>

        <aside class="stack" style="gap:16px" aria-label="Настройки анкеты и окна">
          <form class="card stack" style="gap:12px" data-f="tc-profile">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <div>
                <div class="eyebrow">Ваша анкета</div>
                <h2 class="h2">Ставка и профиль</h2>
              </div>
              <span class="chip${p.price >= 1400 ? " pro" : " accent"}">${p.price >= 1400 ? "Профи выше рынка" : "В рынке"}</span>
            </div>

            <div class="field">
              <label for="tc-name">Имя в каталоге</label>
              <input class="input" id="tc-name" name="name" data-tc="name" value="${esc(p.name)}" maxlength="48">
            </div>

            <div class="field">
              <span class="label">Основной предмет</span>
              <input type="hidden" name="subject" value="${esc(p.subject)}">
              ${typeof hhSelectHTML === "function"
                ? hhSelectHTML({
                    id: "tc-subject",
                    options: subjects.map((sb) => ({ id: sb.id, label: sb.name })),
                    value: p.subject,
                    open: !!st.subjMenuOpen,
                    toggleAction: "tc-subj-toggle",
                    pickAction: "tc-subj-pick",
                    ariaLabel: "Основной предмет"
                  })
                : `<select class="select" id="tc-subject" data-tc="subject">${subjects.map((sb) => `<option value="${esc(sb.id)}"${sb.id === p.subject ? " selected" : ""}>${esc(sb.name)}</option>`).join("")}</select>`}
            </div>

            <div class="field">
              <span class="label">Стандартная ставка (₽/ч)</span>
              <div class="hh-price-stepper compact">
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="-100">−100 ₽</button>
                <div class="hh-step-readout"><b class="num">${p.price.toLocaleString("ru-RU")} ₽/ч</b></div>
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="100">+100 ₽</button>
              </div>
            </div>

            <div class="field">
              <span class="label">Минимальный порог торга от учеников</span>
              <div class="hh-price-stepper compact">
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="-100">−100 ₽</button>
                <div class="hh-step-readout"><b class="num">${p.minFair.toLocaleString("ru-RU")} ₽/ч</b></div>
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="100">+100 ₽</button>
              </div>
              <span class="hint">Ученики видят кнопки ±100 ₽ не ниже ${p.minFair.toLocaleString("ru-RU")} ₽/ч.</span>
            </div>

            <div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
            <span class="small muted">На руки <b class="num">${baseSplit.payout.toLocaleString("ru-RU")} ₽</b> за каждый урок. <button type="button" class="link-btn small" data-a="go" data-v="fees">Правила оплаты →</button></span>

            <div class="field">
              <label for="tc-bio">Коротко об опыте и подходе</label>
              <textarea class="textarea" id="tc-bio" name="bio" data-tc="bio" rows="3" maxlength="240">${esc(p.bio || "")}</textarea>
            </div>

            <div class="row" style="gap:8px;flex-wrap:wrap">
              <button type="submit" class="btn sm">Сохранить анкету</button>
              <button type="button" class="btn ghost sm" data-a="tc-reset-demo">Сбросить демо</button>
            </div>
          </form>

          <section class="card stack" style="gap:12px" aria-label="Окна времени 10:00–20:00">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <div>
                <div class="eyebrow">Слоты 10:00–20:00</div>
                <h2 class="h2">Свободные окна (${totalSlotsCount})</h2>
              </div>
              <span class="chip accent num">${esc(activeDayObj.wd)}: ${daySlots.length} ч</span>
            </div>

            <div class="cal-days" aria-label="День недели">
              ${DAY_LIST.map((d) => {
                const cnt = Array.isArray(st.slots[d.dow]) ? st.slots[d.dow].length : 0;
                return `<button type="button" class="day-cir${st.activeDow === d.dow ? " on" : ""}" data-a="tc-day" data-dow="${d.dow}">
                  <span class="day-wd">${d.wd}</span>
                  <span class="day-dot">${cnt}</span>
                  <span class="day-cnt">${cnt ? "откр." : "выкл."}</span>
                </button>`;
              }).join("")}
            </div>

            <div class="hour-circles" aria-label="Часы на день">
              ${hours.map((h) => {
                const on = daySlots.includes(h);
                return `<button type="button" class="hr-cir${on ? " on" : ""}" data-a="tc-slot-toggle" data-hour="${h}" aria-pressed="${on}">
                  <span>${h}</span>
                  <span class="hr-cnt">${on ? "✓" : "—"}</span>
                </button>`;
              }).join("")}
            </div>
            <span class="small muted">Нажмите на кружок часа, чтобы открыть или закрыть запись на ${esc(activeDayObj.full.toLowerCase())}.</span>
          </section>
        </aside>
      </div>`;
  }

  function handleAction(act, el) {
    const st = tState();
    const d = (el && el.dataset) || {};
    const id = d.id || "";

    if (act === "tc-bump") {
      st.bumpedToday = !st.bumpedToday;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          st.bumpedToday ? "Анкета поднята в топ" : "Поднятие отменено",
          st.bumpedToday ? "Вы среди первых репетиторов в разделе «Актуален сегодня» (0 ₽)." : "Статус анкеты возвращён к обычному."
        );
      }
      return true;
    }

    if (act === "tc-filter") {
      st.filter = ["pending", "accepted"].includes(d.v) ? d.v : "all";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-rate-step") {
      const which = d.which === "minFair" ? "minFair" : "price";
      const step = Number(d.step) || 0;
      if (which === "price") {
        st.profile.price = clampStep(st.profile.price, step, 600, 3500);
        if (st.profile.minFair > st.profile.price) st.profile.minFair = Math.max(500, st.profile.price - 100);
      } else {
        st.profile.minFair = clampStep(st.profile.minFair, step, 500, st.profile.price);
      }
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-step") {
      const step = Number(d.step) || 0;
      updateReq(id, (req) => {
        const cur = Number(req.counterPrice || req.offerPrice) || st.profile.price;
        req.counterPrice = clampStep(cur, step, 500, 4000);
      });
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-accept") {
      const updated = updateReq(id, (req) => {
        const finalPrice = Number(req.counterPrice || req.offerPrice) || st.profile.price;
        req.counterPrice = finalPrice;
        req.offerPrice = finalPrice;
        req.status = "accepted";
      });
      if (updated && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      const who = findReq(id);
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          "Урок подтверждён",
          who ? `${who.studentName} · ${who.dayLabel} в ${who.hour} за ${who.offerPrice.toLocaleString("ru-RU")} ₽/ч` : "Заявка переведена в подтверждённые"
        );
      }
      return true;
    }

    if (act === "tc-req-counter") {
      const updated = updateReq(id, (req) => {
        req.status = "countered";
      });
      if (updated && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      const who = findReq(id);
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          "Контр-ставка отправлена",
          who ? `Предложили ${who.counterPrice.toLocaleString("ru-RU")} ₽/ч — уведомим ученика` : "Новая ставка отправлена ученику"
        );
      }
      return true;
    }

    if (act === "tc-req-decline") {
      updateReq(id, (req) => { req.status = "declined"; });
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast("Заявка отклонена");
      return true;
    }

    if (act === "tc-req-restore") {
      updateReq(id, (req) => { req.status = "pending"; });
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-req-msg") {
      const who = findReq(id);
      if (typeof _ctx.notifySide === "function") {
        _ctx.notifySide(
          "Чат с учеником",
          who ? `Открыт диалог с ${who.studentName} (${who.dayLabel}, ${who.hour})` : "Сообщение ученику подготовлено"
        );
      }
      return true;
    }

    if (act === "tc-day") {
      st.activeDow = DAY_LIST.some((x) => x.dow === d.dow) ? d.dow : "6";
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-slot-toggle") {
      const hour = String(d.hour || "").trim();
      if (!hour) return true;
      const dow = st.activeDow || "6";
      const list = Array.isArray(st.slots[dow]) ? st.slots[dow].slice() : [];
      const idx = list.indexOf(hour);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(hour);
      list.sort();
      st.slots[dow] = list;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-subj-toggle") {
      st.subjMenuOpen = !st.subjMenuOpen;
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-subj-pick") {
      st.profile.subject = String(d.v || "bio");
      st.subjMenuOpen = false;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return true;
    }

    if (act === "tc-reset-demo") {
      const def = defaultState();
      st.filter = "all";
      st.requests = def.requests;
      saveState();
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      if (typeof _ctx.toast === "function") _ctx.toast("Демо-заявки обновлены");
      return true;
    }

    return false;
  }

  function handleInput(el) {
    if (!el || !el.dataset || !el.dataset.tc) return false;
    const key = el.dataset.tc;
    const st = tState();
    if (key === "name") st.profile.name = String(el.value || "").slice(0, 48);
    else if (key === "subject") st.profile.subject = String(el.value || "bio");
    else if (key === "bio") st.profile.bio = String(el.value || "").slice(0, 240);
    saveState();
    return true;
  }

  function handleSubmit(form) {
    if (!form || !form.dataset || form.dataset.f !== "tc-profile") return false;
    const st = tState();
    const els = form.elements || {};
    if (els.name && String(els.name.value || "").trim()) st.profile.name = String(els.name.value).trim().slice(0, 48);
    if (els.subject) st.profile.subject = String(els.subject.value || "bio");
    if (els.bio) st.profile.bio = String(els.bio.value || "").trim().slice(0, 240);
    saveState();
    if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
    if (typeof _ctx.notifySide === "function") {
      _ctx.notifySide("Анкета сохранена", `${st.profile.name} · ${st.profile.price.toLocaleString("ru-RU")} ₽/ч (торг от ${st.profile.minFair.toLocaleString("ru-RU")} ₽/ч)`);
    }
    return true;
  }

  EGE.views = EGE.views || {};
  EGE.views.tutorCabinet = {
    configure,
    pendingCount,
    viewCabinet,
    handleAction,
    handleInput,
    handleSubmit
  };
})();
