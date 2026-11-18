/* Баланс, кошелёк, статистика дохода и выплаты преподавателя (95% / 5%). */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, plural } = EGE.utils || { esc: (s) => String(s || ""), plural: (n, a) => a };
  const { icon } = EGE.ui || { icon: () => "" };
  const { feeSplitHTML } = EGE.hh || { feeSplitHTML: () => "" };

  const TC = EGE._tutorCab;
  const {
    TC_LS_KEY, DAY_MS, FOUR_HOURS_MS, DAY_LIST, EXAM_OPTIONS, FORMAT_OPTIONS,
    CITY_OPTIONS, TZ_OPTIONS, WA_LEAD_OPTIONS, AUTO_CHANNELS, AUTO_BUMP_HOURS,
    GOAL_PRESETS, QUICK_TEMPLATES, DEFAULT_REQUESTS, DEFAULT_STUDENTS,
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS,
    getCtx, configure, getTDATA, getTutorSlug, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    ensureCountdownTimer, ensureRealtimeConnected, clampStep, profileCompleteness,
    buildMarketTutorPayload, syncPublishedTutor, dayDowFromLabel, syncedRequests,
    findReq, updateReq, pendingCount, renderDataTable, getTab, setTab, toggleArrayVal
  } = TC;

  function renderPayoutStatsBlocks(st, TDATA, allReqs, acceptedList, totalPayout) {
    const p = st.profile;
    const sp = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { payout: Math.round(p.price * 0.95), fee: Math.round(p.price * 0.05) };
    const is30 = st.statsPeriod === "30d";
    const mult = is30 ? 4 : 1;
    const views = (312 + st.bumpCount * 28) * mult;
    const clicks = Math.round(views * 0.24);
    const reqCnt = (allReqs.length + 5) * mult;
    const conv = Math.min(89, Math.round(((acceptedList.length + 3) * mult / Math.max(1, reqCnt)) * 100));
    const dayBars = DAY_LIST.map((d, i) => {
      const slotCnt = Array.isArray(st.slots[d.dow]) ? st.slots[d.dow].length : 0;
      const dayReqs = allReqs.filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === d.dow).length;
      const lessons = Math.max(1, dayReqs + (i >= 4 ? 2 : 1));
      const rev = lessons * sp.payout * (is30 ? 4 : 1);
      return { wd: d.wd, rev, lessons, isGold: st.bumpedToday || slotCnt >= 3 || d.dow === "6" };
    });
    const maxRev = Math.max(1, ...dayBars.map((b) => b.rev));
    const goal = Math.max(20000, Number(st.monthlyGoal) || 60000);
    const lessonsNeededMonth = Math.ceil(goal / Math.max(500, sp.payout));
    const lessonsPerWeek = (lessonsNeededMonth / 4.3).toFixed(1);
    const curMonthlyProj = Math.max(totalPayout, (acceptedList.length + 3) * 4 * sp.payout);
    const goalPct = Math.min(100, Math.round((curMonthlyProj / goal) * 100));

    return `<div class="stack" style="gap:16px">
      <div class="card stack" style="gap:14px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Аналитика анкеты и откликов</div>
            <h2 class="h2">Статистика преподавателя</h2>
          </div>
          <div class="hh-seg" role="group" aria-label="Период статистики">
            <button type="button" data-a="tc-stats-period" data-v="7d" aria-pressed="${!is30}">7 дней</button>
            <button type="button" data-a="tc-stats-period" data-v="30d" aria-pressed="${is30}">30 дней</button>
          </div>
        </div>

        <div class="tiles">
          <div class="tile"><span class="tile-label">Просмотры анкеты</span><span class="tile-value num">${views.toLocaleString("ru-RU")}</span><span class="tile-note">${st.autoBump24h ? "+38% от авто-24ч" : "включи авто-24ч для буста"}</span></div>
          <div class="tile"><span class="tile-label">Открыли контакты</span><span class="tile-value num">${clicks.toLocaleString("ru-RU")}</span><span class="tile-note">CTR ${Math.round((clicks / Math.max(1, views)) * 100)}%</span></div>
          <div class="tile"><span class="tile-label">Конверсия в урок</span><span class="tile-value num" style="color:var(--confirm)">${conv}%</span><span class="tile-note">${reqCnt} откликов за период</span></div>
          <div class="tile"><span class="tile-label">На руки (95%)</span><span class="tile-value num savings-gold-txt">${curMonthlyProj.toLocaleString("ru-RU")} ₽</span><span class="tile-note">прогноз за ${is30 ? "месяц" : "текущий темп"}</span></div>
        </div>

        <div class="stack" style="gap:6px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            <b class="small">Доход по дням недели (золотым — пики после поднятия)</b>
            <div class="hh-seg" role="group" aria-label="Вид графика с палочками">
              ${[
                ["sticks", "Палочки"],
                ["lollipop", "Леденцы"],
                ["capsule", "Капсулы"],
                ["combo", "Тренд"],
                ["classic", "Столбики"]
              ].map(([cid, clbl]) => `<button type="button" data-a="tc-chart-style" data-v="${cid}" aria-pressed="${(st.chartStyle || "sticks") === cid}">${clbl}</button>`).join("")}
            </div>
          </div>
          ${(EGE.kit && typeof EGE.kit.stickChartHTML === "function")
            ? EGE.kit.stickChartHTML(
                st.chartStyle || "sticks",
                dayBars.map((b) => ({
                  wd: b.wd,
                  val: Math.round(b.rev / 1000) + "к ₽",
                  pct: Math.max(18, Math.round((b.rev / maxRev) * 100)),
                  gold: !!b.isGold
                })),
                -1,
                false,
                "Диаграмма дохода по дням недели"
              )
            : ""}
        </div>
      </div>

      <div class="card stack" style="gap:12px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Финансовый планировщик</div>
            <h3 class="h2">Цель дохода на месяц: <span class="num savings-gold-txt">${goal.toLocaleString("ru-RU")} ₽</span></h3>
          </div>
          <div class="row" style="gap:6px;flex-wrap:wrap">
            ${GOAL_PRESETS.map((g) => `<button type="button" class="chip-btn${goal === g ? " on" : ""}" data-a="tc-goal" data-v="${g}">${Math.round(g / 1000)} тыс ₽</button>`).join("")}
          </div>
        </div>
        <div class="tc-hh-meter"><i style="width:${goalPct}%"></i></div>
        <div class="row between small muted" style="gap:8px;flex-wrap:wrap">
          <span>Сейчас подтверждённый темп покрывает <b class="num" style="color:var(--ink)">${goalPct}%</b> цели.</span>
          <span>Нужно примерно <b class="num" style="color:var(--ink)">${lessonsPerWeek} уроков/нед</b> (на руки ${sp.payout.toLocaleString("ru-RU")} ₽/урок).</span>
        </div>
      </div>
    </div>`;
  }

  function getWalletSummary() {
    const st = tState();
    const TDATA = getTDATA();
    const p = st.profile || {};
    const rate = Number(p.price) || 1200;
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(rate)
      : { total: rate, fee: Math.round(rate * 0.05), payout: rate - Math.round(rate * 0.05), pct: 5 };
    const allReqs = syncedRequests(st);
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const studentsDoneLessons = (st.students || []).reduce((sum, s) => sum + (Number(s.lessonsDone) || 0), 0);
    const earnedTotal = studentsDoneLessons * (Number(baseSplit && baseSplit.payout) || 0);
    const escrowRub = acceptedList.reduce((sum, r) => {
      const reqRate = Number(r.counterPrice || r.offerPrice) || rate;
      const sp = TDATA && typeof TDATA.commissionSplit === "function"
        ? TDATA.commissionSplit(reqRate)
        : { payout: reqRate - Math.round(reqRate * 0.05) };
      return sum + (Number(sp && sp.payout) || 0);
    }, 0);
    const payouts = Array.isArray(st.payouts) ? st.payouts : [];
    const withdrawnTotal = payouts.reduce((sum, item) => {
      if (!item) return sum;
      const status = String(item.status || "succeeded");
      if (status !== "succeeded" && status !== "processing") return sum;
      return sum + Math.max(0, Number(item.amount) || 0);
    }, 0);
    const availableRub = Math.max(0, earnedTotal - withdrawnTotal);
    return {
      availableRub,
      escrowRub,
      earnedTotal,
      withdrawnTotal,
      minPayout: MIN_PAYOUT_RUB,
      settings: st.payoutSettings || defaultState().payoutSettings,
      payouts
    };
  }

  function sideBalanceWidgetHTML() {
    const summary = getWalletSummary();
    if (EGE.kit && typeof EGE.kit.sideTutorBalanceHTML === "function") {
      return EGE.kit.sideTutorBalanceHTML({
        availableRub: summary.availableRub,
        escrowRub: summary.escrowRub,
        action: "tc-payout-open"
      });
    }
    return `<div class="side-tutor-bal">
      <div class="top-bal-wrap is-compact" role="region" aria-label="Баланс преподавателя">
        <button type="button" class="top-bal-pill is-funded is-tutor" data-a="tc-payout-open" title="Баланс преподавателя">${icon("wallet")}<b class="num">${summary.availableRub.toLocaleString("ru-RU")} ₽</b></button>
        <button type="button" class="btn sm confirm" data-a="tc-payout-open">Вывести</button>
      </div>
      <div class="small muted num" style="padding:2px 4px 0">В резерве: ${summary.escrowRub.toLocaleString("ru-RU")} ₽</div>
    </div>`;
  }

  function desktopDockHTML() {
    const summary = getWalletSummary();
    if (EGE.kit && typeof EGE.kit.tutorBalanceDockHTML === "function") {
      return EGE.kit.tutorBalanceDockHTML({
        availableRub: summary.availableRub,
        escrowRub: summary.escrowRub,
        action: "tc-payout-open"
      });
    }
    return `<div class="tutor-bal-dock" role="region" aria-label="Баланс преподавателя">
      <span class="tutor-bal-ico" aria-hidden="true">${icon("wallet")}</span>
      <div class="tutor-bal-meta">
        <span class="tutor-bal-lbl">Баланс преподавателя</span>
        <div class="tutor-bal-val">
          <b class="num">${summary.availableRub.toLocaleString("ru-RU")} ₽</b>
          <span class="tutor-bal-escrow num">в резерве ${summary.escrowRub.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>
      <button type="button" class="btn sm confirm" data-a="tc-payout-open">Вывести</button>
    </div>`;
  }

  function mobileTopWidgetHTML() {
    const summary = getWalletSummary();
    if (EGE.kit && typeof EGE.kit.topBalanceWidgetHTML === "function") {
      return EGE.kit.topBalanceWidgetHTML({
        role: "tutor",
        amountRub: summary.availableRub,
        pillAction: "tc-payout-open",
        btnAction: "tc-payout-open"
      });
    }
    return `<div class="top-bal-wrap">
      <button type="button" class="top-bal-pill is-funded is-tutor" data-a="tc-payout-open" title="Баланс и вывод средств">${icon("wallet")}<b class="num">${summary.availableRub.toLocaleString("ru-RU")} ₽</b></button>
      <button type="button" class="top-bal-btn is-payout" data-a="tc-payout-open" aria-label="Вывести средства" title="Вывести средства">${icon("upload")}<span>Вывести</span></button>
    </div>`;
  }

  function payoutModalHTML(modalUi) {
    if (modalUi === null || modalUi === false) return "";
    const summary = getWalletSummary();
    const s = summary.settings || defaultState().payoutSettings;
    const raw = modalUi && typeof modalUi === "object" ? modalUi : {};
    const defaultAmount = summary.availableRub >= summary.minPayout
      ? Math.min(summary.availableRub, 3000)
      : summary.availableRub;
    const hasCustomAmount = raw.amount !== undefined && raw.amount !== null && raw.amount !== "";
    const amountNum = hasCustomAmount
      ? Math.max(0, Math.round(Number(raw.amount) || 0))
      : (raw.amount === "" ? 0 : defaultAmount);
    const inputVal = raw.amount === "" ? "" : String(amountNum);
    const method = (raw.method === "card" || (!raw.method && s.method === "card")) ? "card" : "sbp";
    const bank = String(raw.bank || s.bank || PAYOUT_BANKS[4]);
    const phone = formatPhone(raw.phone !== undefined ? raw.phone : s.phone) || String(raw.phone !== undefined ? raw.phone : (s.phone || ""));
    const card = formatCardMask(raw.card !== undefined ? raw.card : s.card) || String(raw.card !== undefined ? raw.card : (s.card || ""));
    const npdReceipt = raw.npdReceipt !== undefined ? !!raw.npdReceipt : !!s.npdReceipt;
    const errorMsg = raw.error ? String(raw.error) : "";
    const canSubmit = summary.availableRub >= summary.minPayout;
    const bankList = PAYOUT_BANKS.includes(bank) ? PAYOUT_BANKS : [bank].concat(PAYOUT_BANKS);
    const chips = [
      { val: 1000, label: "1 000 ₽" },
      { val: 3000, label: "3 000 ₽" },
      { val: 5000, label: "5 000 ₽" },
      { val: summary.availableRub, label: `Вся сумма (${summary.availableRub.toLocaleString("ru-RU")} ₽)` }
    ];

    return `<div class="modal-back is-sheet-back">
      <div class="modal-card sheet-modal" data-sheet-kind="payout" role="dialog" aria-modal="true" aria-labelledby="tc-payout-title" style="max-width:540px">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="tc-payout-close" aria-label="Свернуть вывод средств">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div>
            <div class="eyebrow">Выплаты преподавателям</div>
            <h2 class="h2" id="tc-payout-title">Вывод средств преподавателя</h2>
          </div>
        </div>
        <div class="sheet-body stack" style="gap:14px">

        ${(EGE.kit && typeof EGE.kit.walletSummaryBarHTML === "function")
          ? EGE.kit.walletSummaryBarHTML({
              extraClass: "tc-payout-wallet",
              label: "Доступно к выводу",
              amountRub: summary.availableRub,
              amountClass: "num",
              amountStyle: "font-size:22px;line-height:1.15;font-weight:700;color:var(--ink)",
              subNote: "95% после 5% комиссии сервиса",
              badge: { text: `В резерве: ${summary.escrowRub.toLocaleString("ru-RU")} ₽`, cls: "confirm num" }
            })
          : `<div class="wallet-bar tc-payout-wallet">
          <div class="stack" style="gap:3px;min-width:0">
            <span class="small muted">Доступно к выводу</span>
            <b class="num" style="font-size:22px;line-height:1.15">${summary.availableRub.toLocaleString("ru-RU")} ₽</b>
            <span class="small muted">95% после 5% комиссии сервиса</span>
          </div>
          <span class="chip confirm num">В резерве: ${summary.escrowRub.toLocaleString("ru-RU")} ₽</span>
        </div>`}

        <div class="hh-seg" role="group" aria-label="Способ получения средств">
          <button type="button" data-a="tc-payout-method" data-v="sbp" aria-pressed="${method === "sbp"}">СБП · 0 ₽ (мгновенно)</button>
          <button type="button" data-a="tc-payout-method" data-v="card" aria-pressed="${method === "card"}">Карта РФ / Мир</button>
        </div>

        <form data-f="tc-payout" class="stack" style="gap:12px" novalidate>
          ${method === "sbp"
            ? `<div class="tc-payout-grid">
                <div class="field">
                  <label class="small muted" for="tc-payout-bank">Банк СБП</label>
                  <select class="input" id="tc-payout-bank" name="bank" data-tc-payout="bank">
                    ${bankList.map((b) => `<option value="${esc(b)}"${bank === b ? " selected" : ""}>${esc(b)}</option>`).join("")}
                  </select>
                </div>
                <div class="field">
                  <label class="small muted" for="tc-payout-phone">Телефон для СБП</label>
                  <input class="input" id="tc-payout-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (914) 210-01-99" value="${esc(phone)}" data-tc-payout="phone">
                </div>
              </div>`
            : `<div class="field">
                <label class="small muted" for="tc-payout-card">Номер карты РФ / Мир</label>
                <input class="input num" id="tc-payout-card" name="card" type="text" inputmode="numeric" maxlength="19" placeholder="2200 7004 8210 4419" value="${esc(card)}" data-tc-payout="card">
              </div>`}

          <div class="stack" style="gap:8px">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <label class="small muted" for="tc-payout-amount">Сумма вывода, ₽</label>
              <span class="small muted num">Минимум ${summary.minPayout.toLocaleString("ru-RU")} ₽</span>
            </div>
            <div class="chip-rail swipe" role="group" aria-label="Быстрый выбор суммы">
              ${chips.map((c) => `<button type="button" class="chip-btn${Number(amountNum) === c.val ? " on" : ""}" data-a="tc-payout-chip" data-v="${c.val}">${esc(c.label)}</button>`).join("")}
            </div>
            <input class="input num" id="tc-payout-amount" name="amount" type="number" min="${summary.minPayout}" max="${Math.max(summary.minPayout, summary.availableRub)}" step="100" value="${esc(inputVal)}" data-tc-payout="amount">
          </div>

          <label class="tc-payout-npd">
            <div class="stack" style="gap:2px;min-width:0">
              <b>Сформировать чек самозанятого (НПД · 4–6%)</b>
              <span class="small muted">Автоматическая передача чека в «Мой налог» после зачисления</span>
            </div>
            <input type="checkbox" name="npdReceipt" data-a="tc-payout-npd" data-tc-payout="npdReceipt"${npdReceipt ? " checked" : ""}>
          </label>

          ${errorMsg ? `<div class="tc-payout-err" role="alert">${esc(errorMsg)}</div>` : ""}
          ${!canSubmit && !errorMsg ? `<div class="small muted">Минимальный доступный остаток для вывода — ${summary.minPayout.toLocaleString("ru-RU")} ₽.</div>` : ""}

          <div class="row between" style="gap:10px;flex-wrap:wrap">
            <button type="submit" class="btn confirm"${canSubmit ? "" : " disabled"}>Вывести ${amountNum.toLocaleString("ru-RU")} ₽</button>
          </div>
        </form>
        </div>
      </div>
    </div>`;
  }

  function submitPayout(modalUi, payload) {
    const st = tState();
    const summary = getWalletSummary();
    const src = Object.assign({}, summary.settings || {}, modalUi || {}, payload || {});
    const method = src.method === "card" ? "card" : "sbp";
    const bank = String(src.bank || (summary.settings && summary.settings.bank) || PAYOUT_BANKS[4]).trim() || PAYOUT_BANKS[4];
    const phoneFormatted = formatPhone(src.phone || "");
    const cardFormatted = formatCardMask(src.card || "");
    const npdReceipt = src.npdReceipt !== undefined ? !!src.npdReceipt : true;

    const fallbackAmount = summary.availableRub >= summary.minPayout
      ? Math.min(summary.availableRub, 3000)
      : summary.availableRub;
    const rawAmount = src.amount === undefined
      ? fallbackAmount
      : (src.amount === "" || src.amount === null ? 0 : Number(src.amount));
    const amount = Math.round(Number.isFinite(rawAmount) ? rawAmount : 0);

    if (!Number.isFinite(amount) || amount < summary.minPayout) {
      return { ok: false, error: `Минимальная сумма вывода — ${summary.minPayout.toLocaleString("ru-RU")} ₽.` };
    }
    if (amount > summary.availableRub) {
      return {
        ok: false,
        error: summary.availableRub < summary.minPayout
          ? `Доступно к выводу ${summary.availableRub.toLocaleString("ru-RU")} ₽ (минимум ${summary.minPayout.toLocaleString("ru-RU")} ₽).`
          : `Доступно к выводу не более ${summary.availableRub.toLocaleString("ru-RU")} ₽.`
      };
    }

    let destination = "";
    let methodLabel = "";
    if (method === "sbp") {
      const phoneRaw = phoneFormatted || src.phone || "";
      const phoneDigits = (EGE.kit && typeof EGE.kit.normalizePhoneDigits === "function")
        ? EGE.kit.normalizePhoneDigits(phoneRaw)
        : String(phoneRaw).replace(/\D+/g, "");
      if (phoneDigits.length < 11) {
        return { ok: false, error: "Укажите корректный телефон для СБП (+7 (XXX) XXX-XX-XX)." };
      }
      destination = phoneFormatted || formatPhone(phoneDigits);
      methodLabel = `СБП · ${bank}`;
    } else {
      const cardDigits = String(cardFormatted || src.card || "").replace(/\D+/g, "");
      if (cardDigits.length < 16) {
        return { ok: false, error: "Введите 16-значный номер банковской карты РФ / Мир." };
      }
      destination = cardFormatted || formatCardMask(cardDigits);
      methodLabel = `Карта ···· ${cardDigits.slice(-4)}`;
    }

    let intent = null;
    if (EGE.payments && typeof EGE.payments.createPayoutIntent === "function") {
      intent = EGE.payments.createPayoutIntent({
        amount,
        method,
        bank,
        phone: destination,
        card: method === "card" ? destination : cardFormatted,
        destination,
        npdReceipt
      });
    } else {
      intent = {
        id: "pout-" + Date.now(),
        amount,
        fee: 0,
        method,
        destination,
        status: "succeeded"
      };
    }

    const now = new Date();
    const months = ["янв.", "февр.", "мар.", "апр.", "мая", "июн.", "июл.", "авг.", "сент.", "окт.", "нояб.", "дек."];
    const hh = String(now.getHours()).padStart(2, "0");
    const mm = String(now.getMinutes()).padStart(2, "0");
    const createdAtLabel = `${now.getDate()} ${months[now.getMonth()]}, ${hh}:${mm}`;
    const payoutStatus = (intent && intent.status) || "succeeded";

    const payoutRow = {
      id: (intent && intent.id) || ("out-" + Date.now()),
      createdAtLabel,
      amount,
      method,
      methodLabel,
      destination,
      npdReceipt,
      fee: Number(intent && intent.fee) || 0,
      status: payoutStatus,
      statusLabel: payoutStatus === "processing" ? "В обработке" : "Исполнено ✓"
    };

    const prevSettings = st.payoutSettings || defaultState().payoutSettings;
    st.payoutSettings = {
      method,
      bank,
      phone: method === "sbp" ? destination : (formatPhone(src.phone) || prevSettings.phone),
      card: method === "card" ? destination : (formatCardMask(src.card) || prevSettings.card),
      npdReceipt
    };
    if (!Array.isArray(st.payouts)) st.payouts = [];
    st.payouts.unshift(payoutRow);
    saveState();

    return {
      ok: true,
      intent,
      payoutRow,
      wallet: getWalletSummary()
    };
  }

  function renderPayoutWalletSection(wallet) {
    const s = wallet.settings || defaultState().payoutSettings;
    const reqLabel = s.method === "card"
      ? `Карта ···· ${String(s.card || "").replace(/\D+/g, "").slice(-4) || "4419"}`
      : `СБП · ${s.bank || "АЭБ (Алмазэргиэнбанк)"} (${s.phone || "+7 (914) 210-01-99"})`;
    return `<section class="card stack" style="gap:12px" aria-label="Баланс и вывод средств">
      <div class="tc-payout-wallet">
        <div class="stack" style="gap:4px;min-width:0;flex:1 1 260px">
          <div class="eyebrow">Кошелёк преподавателя</div>
          <h2 class="h2">Баланс и вывод средств</h2>
          <p class="small muted">Реквизиты по умолчанию: <b class="ink2">${esc(reqLabel)}</b> · ${s.npdReceipt ? "чек НПД (4–6%) вкл." : "без чека НПД"}</p>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn confirm" data-a="tc-payout-open"${wallet.availableRub < wallet.minPayout ? " disabled" : ""}>${icon("wallet")}<span>Вывести средства</span></button>
        </div>
      </div>
      <div class="tc-payout-kpis">
        <div class="tc-payout-kpi">
          <span class="small muted">Доступно к выводу</span>
          <b class="num" style="color:var(--confirm)">${wallet.availableRub.toLocaleString("ru-RU")} ₽</b>
        </div>
        <div class="tc-payout-kpi">
          <span class="small muted">В резерве до урока</span>
          <b class="num">${wallet.escrowRub.toLocaleString("ru-RU")} ₽</b>
        </div>
        <div class="tc-payout-kpi">
          <span class="small muted">Уже выведено</span>
          <b class="num">${wallet.withdrawnTotal.toLocaleString("ru-RU")} ₽</b>
        </div>
      </div>
    </section>`;
  }

  function renderPayoutHistorySection(wallet) {
    const list = Array.isArray(wallet.payouts) ? wallet.payouts : [];
    const dataTableFn = EGE.charts && typeof EGE.charts.dataTableHTML === "function" ? EGE.charts.dataTableHTML : null;
    let bodyHtml = "";
    if (!list.length) {
      bodyHtml = `<div class="empty"><b>Выводов пока не было</b><span>Нажмите «Вывести средства», чтобы перевести доступный остаток на СБП или карту РФ.</span></div>`;
    } else if (dataTableFn) {
      bodyHtml = dataTableFn({
        id: "tc-payout-history",
        cardWrap: false,
        showPresetSwitch: false,
        showColsSwitch: false,
        showSearch: false,
        eyebrow: "",
        title: "",
        rows: list,
        columns: [
          { key: "createdAtLabel", label: "Дата", num: true, render: (row) => `<span class="num">${esc(row.createdAtLabel || "—")}</span>` },
          { key: "methodLabel", label: "Способ", render: (row) => `<b>${esc(row.methodLabel || "СБП")}</b>` },
          {
            key: "destination",
            label: "Реквизиты и чек",
            render: (row) => `<div class="row" style="gap:6px;flex-wrap:wrap"><span class="num">${esc(row.destination || "—")}</span>${row.npdReceipt ? '<span class="chip good">Чек НПД</span>' : '<span class="chip">Без НПД</span>'}</div>`
          },
          { key: "amount", label: "Сумма", num: true, render: (row) => `<b class="num">${Number(row.amount || 0).toLocaleString("ru-RU")} ₽</b>` },
          {
            key: "status",
            label: "Статус",
            render: (row) => `<span class="bb-tbl-st ${row.status === "processing" ? "is-pending" : "is-confirmed"}">${esc(row.statusLabel || "Исполнено ✓")}</span>`
          }
        ]
      });
    } else {
      bodyHtml = `<div class="bb-table-shell">
        <div class="table-wrap">
          <table class="tbl bb-data-table is-adaptive tc-payout-table">
            <thead>
              <tr>
                <th>Дата</th>
                <th>Способ</th>
                <th>Реквизиты и чек</th>
                <th>Сумма</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              ${list.map((row) => `<tr>
                <td data-label="Дата" class="num">${esc(row.createdAtLabel || "—")}</td>
                <td data-label="Способ"><b>${esc(row.methodLabel || "СБП")}</b></td>
                <td data-label="Реквизиты и чек">
                  <div class="row" style="gap:6px;flex-wrap:wrap">
                    <span class="num">${esc(row.destination || "—")}</span>
                    ${row.npdReceipt ? '<span class="chip good">Чек НПД</span>' : '<span class="chip">Без НПД</span>'}
                  </div>
                </td>
                <td data-label="Сумма"><b class="num">${Number(row.amount || 0).toLocaleString("ru-RU")} ₽</b></td>
                <td data-label="Статус"><span class="bb-tbl-st is-confirmed">${esc(row.statusLabel || "Исполнено ✓")}</span></td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </div>`;
    }
    return `<section class="card stack" style="gap:12px" aria-label="История выводов средств">
      <div class="row between" style="gap:10px;flex-wrap:wrap">
        <div>
          <div class="eyebrow">Операции по счёту</div>
          <h2 class="h2">История выводов средств</h2>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <span class="chip num">${list.length} ${plural(list.length, "выплата", "выплаты", "выплат")}</span>
          <button type="button" class="btn soft sm" data-a="tc-payout-open">${icon("upload")}<span>Новый вывод</span></button>
        </div>
      </div>
      ${bodyHtml}
    </section>`;
  }

  function viewPayouts() {
    ensureCountdownTimer();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const allReqs = syncedRequests();
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { total: p.price, fee: Math.round(p.price * 0.05), payout: Math.round(p.price * 0.95), pct: 5 };
    const totalReqPayout = acceptedList.reduce((acc, r) => {
      const rate = Number(r.counterPrice || r.offerPrice) || p.price;
      const sp = TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.round(rate * 0.95) };
      return acc + sp.payout;
    }, 0);
    const studentsDoneLessons = (st.students || []).reduce((sum, s) => sum + (Number(s.lessonsDone) || 0), 0);
    const totalLessonsCount = studentsDoneLessons + acceptedList.length;
    const netIncomeTotal = (studentsDoneLessons * baseSplit.payout) + totalReqPayout;
    const monthEarned = Math.max(netIncomeTotal, (acceptedList.length + 4) * 4 * baseSplit.payout);
    const wallet = getWalletSummary();

    return `
      <div class="head">
        <div class="row between" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div>
            <div class="eyebrow">Финансы преподавателя · 95% на руки</div>
            <h1 class="h1">Выплаты и статистика</h1>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn ghost sm" data-a="go" data-v="cabinet">← В кабинет</button>
          </div>
        </div>
        <p class="lead">Чистый доход после 5% комиссии, количество проведённых уроков, заработок за месяц и цель дохода.</p>
      </div>

      <div class="tiles">
        <div class="tile">
          <span class="tile-label">Чистый доход (95%)</span>
          <span class="tile-value num savings-gold-txt">${netIncomeTotal.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">после 5% сбора системы</span>
        </div>
        <div class="tile">
          <span class="tile-label">Проведено уроков</span>
          <span class="tile-value num">${totalLessonsCount}</span>
          <span class="tile-note">активных учеников: ${(st.students || []).length}</span>
        </div>
        <div class="tile">
          <span class="tile-label">Заработано за месяц</span>
          <span class="tile-value num" style="color:var(--confirm)">${monthEarned.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">прогноз на текущий цикл</span>
        </div>
        <div class="tile">
          <span class="tile-label">Ставка в анкете</span>
          <span class="tile-value num">${p.price.toLocaleString("ru-RU")} ₽/ч</span>
          <span class="tile-note">на руки ${baseSplit.payout.toLocaleString("ru-RU")} ₽ · сбор ${baseSplit.fee.toLocaleString("ru-RU")} ₽</span>
        </div>
      </div>

      ${renderPayoutWalletSection(wallet)}

      ${renderPayoutStatsBlocks(st, TDATA, allReqs, acceptedList, netIncomeTotal)}

      <section class="card stack" style="gap:12px" aria-label="Условия выплат и сервисный сбор 5%">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Прозрачная комиссия</div>
            <h2 class="h2">Расчёт с урока по ставке анкеты</h2>
          </div>
          <span class="chip accent">Комиссия системы: 5%</span>
        </div>
        <div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
        <p class="small muted">Средства ученика замораживаются до урока и переводятся преподавателю сразу после проведения занятия (95% на руки, 5% — сервис и поддержка расписания).</p>
      </section>

      ${renderPayoutHistorySection(wallet)}`;
  }


  Object.assign(TC, {
    renderPayoutStatsBlocks,
    getWalletSummary,
    sideBalanceWidgetHTML,
    desktopDockHTML,
    mobileTopWidgetHTML,
    payoutModalHTML,
    submitPayout,
    renderPayoutWalletSection,
    renderPayoutHistorySection,
    viewPayouts
  });
})();
