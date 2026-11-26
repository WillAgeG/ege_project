/* Баланс, кошелёк, статистика дохода и выплаты преподавателя (94% / 5% сервис + 1% СБП). */
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
    SAMPLE_GCAL_ICS, MIN_PAYOUT_RUB, PAYOUT_BANKS, SBP_BANK_IDS, validateInn12,
    isDevDemoMode, hydrateFromBackend, ensureServerHydrated, formatIsoShort,
    getCtx, configure, getTDATA, getTutorSlug, syncTutorCalendar, publishRtUpdate,
    formatPhone, formatTelegram, formatCardMask, normalizeChannelList,
    copyStr, formatTimestamp, defaultState, tState, saveState,
    checkAutoBumpDue, formatCountdown, autoBumpRemainingMs, manualBumpRemainingMs,
    ensureCountdownTimer, ensureRealtimeConnected, clampStep, profileCompleteness,
    buildMarketTutorPayload, mergeAllProfileSlots, syncPublishedTutor, dayDowFromLabel, syncedRequests,
    findReq, updateReq, pendingCount, calcLessonSplit, renderDataTable, getTab, setTab, toggleArrayVal
  } = TC;

  function renderPayoutStatsBlocks(st, TDATA, allReqs, acceptedList, totalPayout) {
    const p = st.profile;
    const sp = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { payout: Math.max(0, p.price - Math.round(p.price * 0.05) - Math.round(p.price * 0.01)), fee: Math.round(p.price * 0.05), sbpFee: Math.round(p.price * 0.01) };
    const is30 = st.statsPeriod === "30d";
    const isDemo = isDevDemoMode();
    const goal = Math.max(10000, Number(st.monthlyGoal) || 60000);
    const lessonsNeededMonth = Math.ceil(goal / Math.max(500, sp.payout || 1));
    const lessonsPerWeek = (lessonsNeededMonth / 4.3).toFixed(1);

    let views = 0;
    let clicks = 0;
    let reqCnt = 0;
    let confirmedCount = 0;
    let conv = 0;
    let periodEarned = 0;
    let curMonthlyProj = 0;
    let dayBars = [];

    if (isDemo) {
      const mult = is30 ? 4 : 1;
      views = (312 + st.bumpCount * 28) * mult;
      clicks = Math.round(views * 0.24);
      reqCnt = (allReqs.length + 5) * mult;
      conv = Math.min(89, Math.round(((acceptedList.length + 3) * mult / Math.max(1, reqCnt)) * 100));
      const aggSlots = typeof mergeAllProfileSlots === "function" ? mergeAllProfileSlots(st) : (st.slots || {});
      dayBars = (() => {
        if (!is30) {
          return DAY_LIST.map((d, i) => {
            const slotCnt = Array.isArray(aggSlots[d.dow]) ? aggSlots[d.dow].length : 0;
            const dayReqs = allReqs.filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === d.dow).length;
            const lessons = Math.max(1, dayReqs + (i >= 4 ? 2 : 1));
            const rev = lessons * sp.payout;
            return { wd: d.wd, rev, lessons, isGold: st.bumpedToday || slotCnt >= 3 || d.dow === "6" };
          });
        }
        const nowDt = new Date();
        const wave = [1, 2, 1, 0, 2, 3, 2, 1, 2, 3, 1, 2, 4, 2, 1, 2, 3, 2, 1, 3, 2, 4, 3, 1, 2, 3, 2, 4, 3, 3];
        const out = [];
        for (let off = 29; off >= 0; off--) {
          const dt = new Date(nowDt.getFullYear(), nowDt.getMonth(), nowDt.getDate() - off);
          const dd = String(dt.getDate()).padStart(2, "0");
          const mm = String(dt.getMonth() + 1).padStart(2, "0");
          const dowStr = String(dt.getDay());
          const slotCnt = Array.isArray(aggSlots[dowStr]) ? aggSlots[dowStr].length : 0;
          const dayReqs = allReqs.filter((r) => r.status === "accepted" && String(r.dow || dayDowFromLabel(r.dayLabel)) === dowStr).length;
          const idx = 29 - off;
          const baseLessons = wave[idx % wave.length];
          const lessons = Math.max(0, baseLessons + (dayReqs > 0 ? 1 : 0));
          const rev = lessons * sp.payout;
          const isGold = st.bumpedToday || slotCnt >= 3 || lessons >= 3;
          out.push({ wd: `${dd}.${mm}`, rev, lessons, isGold });
        }
        return out;
      })();
      curMonthlyProj = Math.max(totalPayout, (acceptedList.length + 3) * 4 * sp.payout);
      periodEarned = curMonthlyProj;
    } else {
      const confirmedReqs = allReqs.filter((r) => r.status === "accepted" || r.status === "completed");
      reqCnt = allReqs.length;
      confirmedCount = confirmedReqs.length;
      conv = reqCnt > 0 ? Math.round((confirmedCount / reqCnt) * 100) : 0;
      const payoutOf = (r) => {
        if (r && r.payout != null && Number(r.payout) > 0) return Number(r.payout);
        const rate = Number(r && (r.counterPrice || r.offerPrice)) || p.price || 0;
        const cs = typeof calcLessonSplit === "function" ? calcLessonSplit(rate, r, TDATA) : sp;
        return Number(cs && cs.payout) || 0;
      };
      if (!is30) {
        dayBars = DAY_LIST.map((d) => {
          const dayMatches = confirmedReqs.filter((r) => String(r.dow != null ? r.dow : dayDowFromLabel(r.dayLabel)) === d.dow);
          const lessons = dayMatches.length;
          const rev = dayMatches.reduce((acc, r) => acc + payoutOf(r), 0);
          return { wd: d.wd, rev, lessons, isGold: lessons > 0 };
        });
      } else {
        const nowDt = new Date();
        for (let off = 29; off >= 0; off--) {
          const dt = new Date(nowDt.getFullYear(), nowDt.getMonth(), nowDt.getDate() - off);
          const dd = String(dt.getDate()).padStart(2, "0");
          const mm = String(dt.getMonth() + 1).padStart(2, "0");
          const iso = `${dt.getFullYear()}-${mm}-${dd}`;
          const dayMatches = confirmedReqs.filter((r) => {
            const rDate = String(r.dayIso || r.slotDate || String(r.updatedAt || r.createdAt || "").slice(0, 10));
            return rDate === iso;
          });
          const lessons = dayMatches.length;
          const rev = dayMatches.reduce((acc, r) => acc + payoutOf(r), 0);
          dayBars.push({ wd: `${dd}.${mm}`, rev, lessons, isGold: lessons > 0 });
        }
      }
      const srv = st.serverSummary && typeof st.serverSummary === "object" ? st.serverSummary : null;
      curMonthlyProj = srv ? (Number(srv.earned30dNetRub) || 0) : totalPayout;
      const barsRev = dayBars.reduce((acc, b) => acc + b.rev, 0);
      periodEarned = is30 ? (srv ? Math.max(Number(srv.earned30dNetRub) || 0, barsRev) : barsRev) : barsRev;
    }

    const hasChartData = dayBars.some((b) => b.rev > 0);
    const maxRev = Math.max(1, ...dayBars.map((b) => b.rev));
    const goalPct = Math.min(100, Math.round((curMonthlyProj / goal) * 100));

    const kpiTilesHTML = isDemo
      ? `<div class="tiles tc-kpi-tiles">
          <div class="tile"><span class="tile-label">Просмотры анкеты</span><span class="tile-value num">${views.toLocaleString("ru-RU")}</span><span class="tile-note">${st.autoBump24h ? "+38% от авто-24ч" : "включите авто-24ч"}</span></div>
          <div class="tile"><span class="tile-label">Открыли контакты</span><span class="tile-value num">${clicks.toLocaleString("ru-RU")}</span><span class="tile-note">CTR ${Math.round((clicks / Math.max(1, views)) * 100)}%</span></div>
          <div class="tile"><span class="tile-label">Конверсия в урок</span><span class="tile-value num" style="color:var(--confirm)">${conv}%</span><span class="tile-note">${reqCnt} откликов</span></div>
          <div class="tile"><span class="tile-label">На руки (94%)</span><span class="tile-value num savings-gold-txt">${curMonthlyProj.toLocaleString("ru-RU")} ₽</span><span class="tile-note">прогноз за ${is30 ? "месяц" : "неделю"}</span></div>
        </div>`
      : `<div class="tiles tc-kpi-tiles">
          <div class="tile"><span class="tile-label">Всего заявок</span><span class="tile-value num">${reqCnt}</span><span class="tile-note">с витрины и по торгу</span></div>
          <div class="tile"><span class="tile-label">Подтверждено</span><span class="tile-value num">${confirmedCount}</span><span class="tile-note">учеников в графике</span></div>
          <div class="tile"><span class="tile-label">Конверсия в урок</span><span class="tile-value num" style="color:var(--confirm)">${conv}%</span><span class="tile-note">${reqCnt} ${plural(reqCnt, "отклик", "отклика", "откликов")}</span></div>
          <div class="tile"><span class="tile-label">На руки (94%)</span><span class="tile-value num savings-gold-txt">${periodEarned.toLocaleString("ru-RU")} ₽</span><span class="tile-note">${is30 ? "за 30 дней" : "за 7 дней / график"}</span></div>
        </div>`;

    const chartBodyHTML = (!isDemo && !hasChartData)
      ? `<div class="empty" id="tc-stats-empty"><b>Данных о доходе за период пока нет</b><span>График заполнится автоматически после первых подтверждённых и проведённых уроков.</span></div>`
      : ((EGE.kit && typeof EGE.kit.stickChartHTML === "function")
        ? EGE.kit.stickChartHTML(
            "lollipop",
            dayBars.map((b) => ({
              wd: b.wd,
              val: b.rev >= 1000 ? `${Math.round(b.rev / 1000)}к ₽` : (b.rev > 0 ? `${b.rev} ₽` : "0 ₽"),
              pct: b.rev > 0 ? Math.max(18, Math.round((b.rev / maxRev) * 100)) : 10,
              gold: !!b.isGold
            })),
            -1,
            false,
            is30 ? "Диаграмма дохода за последние 30 дней по дням" : "Диаграмма дохода по дням недели",
            { scrollable: is30 }
          )
        : "");

    return `<div class="stack" style="gap:16px">
      <div class="card stack" style="gap:14px">
        <div class="row between" style="gap:8px;flex-wrap:wrap">
          <div>
            <div class="eyebrow">Аналитика анкеты и откликов</div>
            <h2 class="h2">Статистика преподавателя</h2>
          </div>
          <div class="hh-seg tc-period-seg" role="group" aria-label="Период статистики">
            <button type="button" data-a="tc-stats-period" data-v="7d" aria-pressed="${!is30}">7 дней</button>
            <button type="button" data-a="tc-stats-period" data-v="30d" aria-pressed="${is30}">30 дней</button>
          </div>
        </div>

        ${kpiTilesHTML}

        <div class="stack" style="gap:6px">
          <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
            ${is30
              ? '<b class="small">Доход за последние 30 дней</b><span class="small muted">Листайте влево и вправо</span>'
              : `<b class="small">${isDemo ? "Доход по дням недели (золотым — пики после поднятия)" : "Доход по дням недели"}</b>`}
          </div>
          ${chartBodyHTML}
        </div>
      </div>

      <div class="card stack" style="gap:12px">
        <div class="stack" style="gap:8px">
          <div>
            <div class="eyebrow">Финансовый планировщик</div>
            <h3 class="h2">Цель дохода на месяц: <span class="num savings-gold-txt">${goal.toLocaleString("ru-RU")} ₽</span></h3>
          </div>
          <div class="tc-goal-row" role="group" aria-label="Быстрый выбор цели дохода">
            <button type="button" class="chip-btn${goal === 40000 && !st.goalCustomOpen ? " on" : ""}" data-a="tc-goal" data-v="40000">40 тыс</button>
            <button type="button" class="chip-btn${goal === 90000 && !st.goalCustomOpen ? " on" : ""}" data-a="tc-goal" data-v="90000">90 тыс</button>
            <button type="button" class="chip-btn${(st.goalCustomOpen || (goal !== 40000 && goal !== 90000)) ? " on" : ""}" data-a="tc-goal-custom-toggle">Своя цель</button>
          </div>
          ${st.goalCustomOpen ? `<form class="tc-goal-custom-form" data-f="tc-goal-custom">
            <input class="input num" name="goal" type="number" min="10000" max="500000" step="5000" value="${goal}" placeholder="Сумма в ₽" aria-label="Своя цель дохода на месяц">
            <button type="submit" class="btn sm">Сохранить</button>
          </form>` : ""}
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
    const settings = st.payoutSettings || defaultState().payoutSettings;
    const payouts = Array.isArray(st.payouts) ? st.payouts : [];
    if (st.serverSummary && typeof st.serverSummary === "object") {
      const srv = st.serverSummary;
      return {
        availableRub: Math.max(0, Number(srv.availableRub) || 0),
        escrowRub: Math.max(0, Number(srv.frozenNetRub) || 0),
        earnedTotal: Math.max(0, Number(srv.earnedNetRub) || 0),
        withdrawnTotal: Math.max(0, Number(srv.withdrawnRub) || 0),
        minPayout: Number(srv.minPayoutRub) || MIN_PAYOUT_RUB,
        settings,
        payouts,
        fromServer: true
      };
    }
    if (!isDevDemoMode()) {
      return {
        availableRub: 0,
        escrowRub: 0,
        earnedTotal: 0,
        withdrawnTotal: 0,
        minPayout: MIN_PAYOUT_RUB,
        settings,
        payouts,
        fromServer: false
      };
    }
    const p = st.profile || {};
    const rate = Number(p.price) || 1200;
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(rate)
      : { total: rate, fee: Math.round(rate * 0.05), sbpFee: Math.round(rate * 0.01), payout: Math.max(0, rate - Math.round(rate * 0.05) - Math.round(rate * 0.01)), pct: 5, sbpPct: 1 };
    const allReqs = syncedRequests(st);
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const studentsDoneLessons = (st.students || []).reduce((sum, s) => sum + (Number(s.lessonsDone) || 0), 0);
    const earnedTotal = studentsDoneLessons * (Number(baseSplit && baseSplit.payout) || 0);
    const escrowRub = acceptedList.reduce((sum, r) => {
      const reqRate = Number(r.counterPrice || r.offerPrice) || rate;
      const sp = typeof calcLessonSplit === "function"
        ? calcLessonSplit(reqRate, r, TDATA)
        : (TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(reqRate) : { payout: Math.max(0, reqRate - Math.round(reqRate * 0.05) - Math.round(reqRate * 0.01)) });
      return sum + (Number(sp && sp.payout) || 0);
    }, 0);
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
      settings,
      payouts,
      fromServer: false
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
    const defaultAmount = summary.availableRub;
    const hasCustomAmount = raw.amount !== undefined && raw.amount !== null && raw.amount !== "";
    const amountNum = hasCustomAmount
      ? Math.max(0, Math.round(Number(raw.amount) || 0))
      : (raw.amount === "" ? 0 : defaultAmount);
    const inputVal = raw.amount === "" ? "" : String(amountNum);
    const method = (raw.method === "card" || (!raw.method && s.method === "card")) ? "card" : "sbp";
    const bank = String(raw.bank || s.bank || PAYOUT_BANKS[4]);
    const phone = formatPhone(raw.phone !== undefined ? raw.phone : s.phone) || String(raw.phone !== undefined ? raw.phone : (s.phone || ""));
    const card = formatCardMask(raw.card !== undefined ? raw.card : s.card) || String(raw.card !== undefined ? raw.card : (s.card || ""));
    const errorMsg = raw.error ? String(raw.error) : "";
    const canSubmit = summary.availableRub >= summary.minPayout;
    const bankList = PAYOUT_BANKS.includes(bank) ? PAYOUT_BANKS : [bank].concat(PAYOUT_BANKS);
    const sbpMark = (EGE.ui && typeof EGE.ui.sbpLogoSVG === "function")
      ? EGE.ui.sbpLogoSVG(28)
      : '<svg class="ygo-sbp-svg" width="23" height="28" viewBox="0 0 266 325" fill="none" role="img" aria-label="СБП"><title>СБП</title><polygon points="114,0 152,70 152,116 114,140" fill="#F1BA46"/><polygon points="114,0 266,93 188,93 152,70" fill="#E07C3E"/><polygon points="0,255 40,183 152,116 152,163" fill="#8E4D91"/><polygon points="152,116 188,93 266,93 152,163" fill="#C72C54"/><polygon points="0,70 40,142 40,183 0,255" fill="#5D579F"/><polygon points="114,186 152,209 152,255 114,325" fill="#76AF46"/><polygon points="114,325 152,255 188,232 266,232" fill="#377D3F"/><polygon points="0,70 266,232 188,232 40,142" fill="#4286C5"/></svg>';
    const checkSvg = '<span class="ygo-check" aria-hidden="true">' + icon("check") + '</span>';
    const cardDigits = String(card || "").replace(/\D+/g, "");
    const cardMeta = (EGE.ui && typeof EGE.ui.detectCardMeta === "function")
      ? EGE.ui.detectCardMeta(cardDigits)
      : {
          brand: (!cardDigits || /^220[0-4]/.test(cardDigits)) ? "МИР" : (/^4/.test(cardDigits) ? "VISA" : (/^5/.test(cardDigits) ? "Mastercard" : (/^62/.test(cardDigits) ? "UnionPay" : "Карта РФ"))),
          bankName: "",
          bankTheme: "default"
        };
    const netHTML = (brand, opts) => (EGE.ui && typeof EGE.ui.cardNetworkLogoHTML === "function")
      ? EGE.ui.cardNetworkLogoHTML(brand, opts)
      : `<span class="ygo-net-fallback">${esc(brand || "МИР")}</span>`;
    const chipSvg = '<svg width="36" height="26" viewBox="0 0 36 26" fill="none" aria-hidden="true"><rect x=".75" y=".75" width="34.5" height="24.5" rx="5.25" fill="#e5c07b" fill-opacity=".9" stroke="#bfa05a" stroke-width="1.2"/><path d="M12 1v24M24 1v24M1 9.5h11M1 16.5h11M24 9.5h11M24 16.5h11" stroke="#8c6d2c" stroke-width="1.1"/></svg>';
    const nfcSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 16a6 6 0 0 1 0-8"/><path d="M10 18a10 10 0 0 1 0-12"/><path d="M14 20a14 14 0 0 1 0-16"/></svg>';

    return `<div class="modal-back is-sheet-back">
      <div class="modal-card sheet-modal" data-sheet-kind="payout" role="dialog" aria-modal="true" aria-labelledby="tc-payout-title" style="max-width:540px">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="tc-payout-close" aria-label="Свернуть вывод средств">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row" style="gap:8px">${icon("upload")}<b id="tc-payout-title">Вывод средств преподавателя</b></div>
          <button type="button" class="icon-btn sm sheet-close-btn" data-a="tc-payout-close" aria-label="Закрыть вывод средств">${icon("x")}</button>
        </div>
        <div class="sheet-body">
          <div class="bal-flat-sec">
            <span class="small muted">Доступно к выводу</span>
            <strong class="bal-flat-amount num">${summary.availableRub.toLocaleString("ru-RU")} ₽</strong>
            <span class="bal-flat-copy num">В резерве: ${summary.escrowRub.toLocaleString("ru-RU")} ₽ · 94% после 5% сервиса и 1% СБП</span>
          </div>

          <div class="stack" style="gap:8px">
            <span class="label">Способ получения</span>
            <div class="ygo-pay-rail" role="radiogroup" aria-label="Способ получения средств">
              <button type="button" class="ygo-pay-tile${method === "sbp" ? " is-on" : ""}" data-a="tc-payout-method" data-v="sbp" role="radio" aria-checked="${method === "sbp" ? "true" : "false"}">
                <div class="ygo-tile-top">
                  <span class="ygo-sbp-badge">${sbpMark}</span>
                  ${method === "sbp" ? checkSvg : ""}
                </div>
                <div class="ygo-tile-copy">
                  <b>СБП</b>
                  <span class="is-free">0 ₽ · мгновенно</span>
                </div>
              </button>
              <button type="button" class="ygo-pay-tile${method === "card" ? " is-on" : ""}" data-a="tc-payout-method" data-v="card" role="radio" aria-checked="${method === "card" ? "true" : "false"}">
                <div class="ygo-tile-top">
                  <span class="ygo-tile-net" id="tc-payout-tile-net">${netHTML(cardMeta.brand === "Карта РФ" ? "МИР" : cardMeta.brand, { height: 15, tone: "light", defaultMir: true })}</span>
                  ${method === "card" ? checkSvg : ""}
                </div>
                <div class="ygo-tile-copy">
                  <b id="tc-payout-tile-title">${esc(cardMeta.bankName || "Карта РФ")}</b>
                  <span>Зачисление 1–5 мин</span>
                </div>
              </button>
            </div>
          </div>

          <form data-f="tc-payout" class="stack" style="gap:12px" novalidate>
            ${method === "sbp"
              ? `<div class="tc-payout-grid">
                  <div class="field">
                    <label class="label" for="tc-payout-bank">Банк СБП</label>
                    <select class="input" id="tc-payout-bank" name="bank" data-tc-payout="bank">
                      ${bankList.map((b) => `<option value="${esc(b)}"${bank === b ? " selected" : ""}>${esc(b)}</option>`).join("")}
                    </select>
                  </div>
                  <div class="field">
                    <label class="label" for="tc-payout-phone">Телефон для СБП</label>
                    <input class="input num" id="tc-payout-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="${isDevDemoMode() ? "+7 (914) 210-01-99" : "+7 (XXX) XXX-XX-XX"}" value="${esc(phone || "+7 ")}" data-tc-payout="phone">
                  </div>
                </div>`
              : `<div class="ygo-bank-card" id="tc-payout-card-box" data-bank="${esc(cardMeta.bankTheme || "default")}">
                  <div class="ygo-card-top">
                    <div class="ygo-chip-wrap">${chipSvg}${nfcSvg}<span class="ygo-card-bank" id="tc-payout-card-bank">${esc(cardMeta.bankName || "")}</span></div>
                    <span class="ygo-brand-slot" id="tc-payout-card-brand">${netHTML(cardMeta.brand, { height: 18, tone: "dark" })}</span>
                  </div>
                  <div class="ygo-card-field">
                    <label class="ygo-card-lbl" for="tc-payout-card">Номер карты для зачисления</label>
                    <input class="ygo-card-inp num" id="tc-payout-card" name="card" type="text" inputmode="numeric" maxlength="19" placeholder="${isDevDemoMode() ? "2200 7004 8210 4419" : "0000 0000 0000 0000"}" value="${esc(card)}" data-tc-payout="card">
                  </div>
                </div>`}

            <div class="stack" style="gap:8px">
              <div class="row between" style="gap:8px;flex-wrap:wrap;align-items:center">
                <label class="label" for="tc-payout-amount">Сумма вывода</label>
                <span class="small muted num">Минимум ${summary.minPayout.toLocaleString("ru-RU")} ₽</span>
              </div>
              <div class="bal-amount-box">
                <input class="bal-amount-inp num" id="tc-payout-amount" name="amount" type="number" min="${summary.minPayout}" max="${Math.max(summary.minPayout, summary.availableRub)}" step="100" value="${esc(inputVal)}" data-tc-payout="amount">
                <span class="bal-amount-cur">₽</span>
              </div>
            </div>

            ${(() => {
              const npdEnabled = raw.npdReceipt !== undefined ? !!raw.npdReceipt : (s.npdReceipt !== false);
              return `<div class="tc-payout-npd-box${npdEnabled ? " is-on" : ""}">
              <label class="tc-payout-npd" for="tc-payout-npd-chk">
                <div class="stack" style="gap:4px;min-width:0;flex:1 1 0">
                  <div class="tc-payout-npd-head">
                    <b class="small">Чек самозанятого (НПД · 4–6%)</b>
                    <span class="chip good tc-npd-chip">ФНС «Мой налог»</span>
                  </div>
                  <span class="small muted">Автоматическая регистрация чека после исполнения выплаты</span>
                </div>
                <span class="tc-npd-switch">
                  <input class="tc-npd-switch-inp" id="tc-payout-npd-chk" type="checkbox" name="npdReceipt" data-tc-payout="npdReceipt"${npdEnabled ? " checked" : ""}>
                  <i class="tc-switch-track" aria-hidden="true"></i>
                </span>
              </label>
              ${npdEnabled
                ? `<div class="tc-payout-inn-sec">
                    <label class="label" for="tc-payout-inn">ИНН самозанятого (12 цифр)</label>
                    <div class="tc-payout-inn-row">
                      <input class="input num tc-payout-inn-inp" id="tc-payout-inn" name="tutorInn" type="text" inputmode="numeric" maxlength="12" placeholder="143512345678" value="${esc(String(raw.inn !== undefined ? raw.inn : (s.inn || "")).replace(/\D+/g, "").slice(0, 12))}" data-tc-payout="inn">
                      <button type="button" class="btn soft tc-payout-inn-btn" data-a="tc-payout-check-inn"${raw.innCheck && raw.innCheck.loading ? " disabled" : ""}>${raw.innCheck && raw.innCheck.loading ? "Проверяем..." : "Проверить ИНН"}</button>
                    </div>
                    ${raw.innCheck && raw.innCheck.message
                      ? `<div class="tc-npd-status ${raw.innCheck.ok ? "is-ok" : "is-err"}" role="status">${esc(raw.innCheck.message)}</div>`
                      : ""}
                  </div>`
                : ""}
            </div>`;
            })()}

            ${errorMsg ? `<div class="tc-payout-err" role="alert">${esc(errorMsg)}</div>` : ""}
            ${!canSubmit && !errorMsg ? `<div class="small muted">Минимальный доступный остаток для вывода — ${summary.minPayout.toLocaleString("ru-RU")} ₽.</div>` : ""}

            <button type="submit" class="btn confirm bal-submit-btn"${canSubmit ? "" : " disabled"}>Вывести ${amountNum.toLocaleString("ru-RU")} ₽</button>
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
    const innRaw = String(src.tutorInn !== undefined ? src.tutorInn : (src.inn || "")).replace(/\D+/g, "").slice(0, 12);
    if (npdReceipt && innRaw) {
      const innCheck = typeof validateInn12 === "function"
        ? validateInn12(innRaw)
        : { valid: /^\d{12}$/.test(innRaw), inn: innRaw };
      if (!innCheck.valid) {
        return { ok: false, error: "Укажите корректный 12-значный ИНН самозанятого (проверьте контрольные цифры)." };
      }
    }

    const fallbackAmount = summary.availableRub;
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

    const sbpBankId = method === "sbp" && SBP_BANK_IDS && SBP_BANK_IDS[bank] ? SBP_BANK_IDS[bank] : "";
    let intent = null;
    if (EGE.payments && typeof EGE.payments.createPayoutIntent === "function") {
      intent = EGE.payments.createPayoutIntent({
        amount,
        method,
        bank,
        sbpBankId,
        tutorInn: innRaw,
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
    const ctxStore = getCtx().store;
    const isBackendAuth = !!(ctxStore && ctxStore.backend && ctxStore.user && EGE.api && EGE.api.tutor);
    const payoutStatus = isBackendAuth ? "processing" : ((intent && intent.status) || "succeeded");

    const payoutRow = {
      id: (intent && intent.id) || ("out-" + Date.now()),
      createdAtLabel,
      amount,
      method,
      methodLabel,
      destination,
      npdReceipt,
      npdReceiptUrl: "",
      npdStatus: npdReceipt ? "pending" : "none",
      tutorInn: innRaw,
      providerPayoutId: "",
      antifraudHold: false,
      fee: Number(intent && intent.fee) || 0,
      status: payoutStatus,
      statusLabel: payoutStatus === "processing" ? (isBackendAuth ? "Отправка..." : "В обработке") : "Исполнено ✓"
    };

    const prevSettings = st.payoutSettings || defaultState().payoutSettings;
    st.payoutSettings = {
      method,
      bank,
      phone: method === "sbp" ? destination : (src.phone ? formatPhone(src.phone) : (prevSettings.phone || "")),
      card: method === "card" ? destination : (src.card ? formatCardMask(src.card) : (prevSettings.card || "")),
      npdReceipt,
      inn: innRaw || prevSettings.inn || ""
    };
    if (!Array.isArray(st.payouts)) st.payouts = [];
    st.payouts.unshift(payoutRow);
    st.historyDetailsOpen = true;
    if (st.serverSummary && typeof st.serverSummary === "object") {
      st.serverSummary.availableRub = Math.max(0, (Number(st.serverSummary.availableRub) || 0) - amount);
      st.serverSummary.withdrawnRub = Math.max(0, (Number(st.serverSummary.withdrawnRub) || 0) + amount);
    }
    saveState();
    if (isBackendAuth) {
      EGE.api.tutor.createPayout({
        tutorId: st.profile && st.profile.id ? st.profile.id : undefined,
        method,
        bank,
        sbpBankId,
        tutorInn: innRaw,
        destination,
        phone: method === "sbp" ? destination : "",
        card: method === "card" ? destination : "",
        amount,
        npdReceipt
      }).then((res) => {
        if (res && res.payout) {
          const srv = res.payout;
          if (srv.id) payoutRow.id = srv.id;
          if (srv.status) payoutRow.status = srv.status;
          if (srv.createdAt) payoutRow.createdAtLabel = formatIsoShort(srv.createdAt) || payoutRow.createdAtLabel;
          payoutRow.providerPayoutId = srv.providerPayoutId || "";
          payoutRow.antifraudHold = !!srv.antifraudHold;
          payoutRow.npdReceipt = srv.npdReceipt || payoutRow.npdReceipt;
          payoutRow.npdReceiptUrl = srv.npdReceiptUrl || "";
          payoutRow.npdStatus = srv.npdStatus || payoutRow.npdStatus;
          payoutRow.statusLabel = srv.status === "succeeded"
            ? "Исполнено ✓"
            : (srv.status === "rejected"
              ? "Отклонено"
              : (srv.providerPayoutId ? "Отправлено в ЮKassa" : "В обработке"));
        }
        if (res && res.summary && typeof res.summary === "object") {
          st.serverSummary = Object.assign({}, st.serverSummary || {}, res.summary);
        }
        saveState();
        const ctxNow = getCtx();
        if (ctxNow && typeof ctxNow.scheduleRender === "function") ctxNow.scheduleRender();
      }).catch((err) => {
        if (!isDevDemoMode()) {
          st.payouts = (st.payouts || []).filter((row) => row !== payoutRow);
          saveState();
          hydrateFromBackend({ force: true });
          const ctxNow = getCtx();
          if (ctxNow && typeof ctxNow.toast === "function") {
            ctxNow.toast((err && err.message) || "Не удалось оформить выплату");
          }
          if (ctxNow && typeof ctxNow.scheduleRender === "function") ctxNow.scheduleRender();
        }
      });
    }

    return {
      ok: true,
      intent,
      payoutRow,
      wallet: getWalletSummary()
    };
  }

  function renderPayoutWalletSection(wallet) {
    const s = wallet.settings || defaultState().payoutSettings;
    const isDemo = isDevDemoMode();
    const cardLast4 = String(s.card || "").replace(/\D+/g, "").slice(-4);
    const reqLabel = s.method === "card"
      ? (cardLast4 ? `Карта ···· ${cardLast4}` : (isDemo ? "Карта ···· 4419" : "Карта РФ · реквизиты не указаны"))
      : (s.phone
        ? `СБП · ${s.bank || "СБП"} (${s.phone})`
        : (isDemo ? `СБП · ${s.bank || "АЭБ (Алмазэргиэнбанк)"} (+7 (914) 210-01-99)` : `СБП · ${s.bank || "выберите банк при выводе"}`));
    return `<section class="card stack tc-wallet-card" aria-label="Баланс и вывод средств">
      <div class="tc-wallet-top">
        <div class="eyebrow">Кошелёк преподавателя</div>
        <span class="chip good">СБП · Мир · чек НПД</span>
      </div>
      <div class="tc-wallet-hero">
        <span class="small muted">Доступно к выводу</span>
        <div class="tc-wallet-amount num">${wallet.availableRub.toLocaleString("ru-RU")} ₽</div>
      </div>
      <div class="tc-wallet-sub">
        <div class="tc-wallet-sub-item">
          <span class="small muted">В резерве до урока</span>
          <b class="num">${wallet.escrowRub.toLocaleString("ru-RU")} ₽</b>
        </div>
        <div class="tc-wallet-sub-item">
          <span class="small muted">Уже выведено</span>
          <b class="num">${wallet.withdrawnTotal.toLocaleString("ru-RU")} ₽</b>
        </div>
      </div>
      <div class="tc-wallet-req">${icon("wallet")}<span class="muted">${esc(reqLabel)}</span></div>
      <button type="button" class="btn confirm tc-wallet-submit" data-a="tc-payout-open"${wallet.availableRub < wallet.minPayout ? " disabled" : ""}>${icon("wallet")}<span>Вывести средства</span></button>
    </section>`;
  }

  function renderPayoutHistorySection(wallet, st) {
    const curSt = st || tState();
    const list = Array.isArray(wallet.payouts) ? wallet.payouts : [];
    const isOpen = !!curSt.historyDetailsOpen;
    const bodyHtml = !isOpen
      ? ""
      : (!list.length
        ? `<div class="empty"><b>Выводов пока не было</b><span>Нажмите «Вывести средства», чтобы перевести доступный остаток на СБП или карту РФ.</span></div>`
        : `<div class="tc-payout-list" id="tc-payout-history">
            ${list.map((row) => `<div class="tc-payout-item">
              <div class="stack" style="gap:4px;min-width:0;flex:1 1 200px">
                <div class="row" style="gap:6px;flex-wrap:wrap;align-items:center">
                  <b>${esc(row.methodLabel || "СБП")}</b>
                  ${row.npdStatus === "registered"
                    ? '<span class="chip good">Чек ФНС</span>'
                    : (row.npdStatus === "failed"
                      ? '<span class="chip bad">Ошибка НПД</span>'
                      : (row.npdStatus === "pending"
                        ? '<span class="chip">Ожидает НПД</span>'
                        : (row.npdReceipt ? '<span class="chip good">Чек НПД</span>' : '<span class="chip">Без НПД</span>')))}
                  ${row.antifraudHold ? '<span class="chip">Проверка</span>' : ""}
                </div>
                <div class="small muted num">${esc(row.createdAtLabel || "—")} · ${esc(row.destination || "—")}</div>
                ${row.npdReceiptUrl && /^https:\/\//.test(String(row.npdReceiptUrl))
                  ? `<div><a class="small" href="${esc(row.npdReceiptUrl)}" target="_blank" rel="noopener noreferrer">Открыть чек в ФНС ↗</a></div>`
                  : ""}
              </div>
              <div class="tc-payout-item-right">
                <b class="num" style="font-size:15px">${Number(row.amount || 0).toLocaleString("ru-RU")} ₽</b>
                <span class="bb-tbl-st ${row.status === "rejected" ? "is-bad" : (row.status === "processing" ? "is-pending" : "is-confirmed")}">${esc(row.statusLabel || "Исполнено ✓")}</span>
              </div>
            </div>`).join("")}
          </div>`);

    return `<section class="card stack" style="gap:12px" aria-label="История выводов средств">
      <div class="tc-fold-head">
        <div class="stack" style="gap:2px;min-width:0">
          <div class="eyebrow">Операции по счёту</div>
          <h2 class="h2">История выводов средств</h2>
          <span class="small muted num">${list.length} ${plural(list.length, "выплата", "выплаты", "выплат")} · ${wallet.withdrawnTotal.toLocaleString("ru-RU")} ₽</span>
        </div>
        <button type="button" class="btn soft sm" data-a="tc-history-details-toggle" aria-expanded="${isOpen}">${isOpen ? "Скрыть" : "Подробнее"}</button>
      </div>
      ${bodyHtml}
    </section>`;
  }

  function viewPayouts() {
    ensureCountdownTimer();
    ensureServerHydrated();
    const TDATA = getTDATA();
    const st = tState();
    const p = st.profile;
    const isProd = !isDevDemoMode();
    const ctxStore = getCtx().store;
    const isAuthed = !!(ctxStore && ctxStore.user);
    if (isProd && !isAuthed) {
      return `
        <div class="empty" id="tc-payouts-auth-empty">
          <b>Войдите в аккаунт преподавателя</b>
          <span>Авторизуйтесь, чтобы видеть реальные начисления, статистику уроков и выводить средства по СБП или на карту Мир.</span>
          <button type="button" class="btn sm" data-a="auth-modal-open">Войти или зарегистрироваться</button>
        </div>`;
    }
    const isMonth = st.payoutScope === "month";
    const scopeLabel = isMonth ? "за последний месяц" : "за всё время";
    const allReqs = syncedRequests();
    const acceptedList = allReqs.filter((r) => r.status === "accepted");
    const completedList = allReqs.filter((r) => r.status === "completed");
    const baseSplit = TDATA && typeof TDATA.commissionSplit === "function"
      ? TDATA.commissionSplit(p.price)
      : { total: p.price, fee: Math.round(p.price * 0.05), sbpFee: Math.round(p.price * 0.01), payout: Math.max(0, p.price - Math.round(p.price * 0.05) - Math.round(p.price * 0.01)), pct: 5, sbpPct: 1 };
    const reqPayout = (r) => {
      if (r && r.payout != null && Number(r.payout) > 0) return Number(r.payout);
      const rate = Number(r && (r.counterPrice || r.offerPrice)) || p.price;
      const sp = typeof calcLessonSplit === "function"
        ? calcLessonSplit(rate, r, TDATA)
        : (TDATA && typeof TDATA.commissionSplit === "function" ? TDATA.commissionSplit(rate) : { payout: Math.max(0, rate - Math.round(rate * 0.05) - Math.round(rate * 0.01)) });
      return sp.payout;
    };
    const totalReqPayout = acceptedList.reduce((acc, r) => acc + reqPayout(r), 0);
    const completedPayoutTotal = completedList.reduce((acc, r) => acc + reqPayout(r), 0);
    const cutoff30Ms = Date.now() - 30 * DAY_MS;
    const completed30dList = completedList.filter((r) => {
      const ts = Date.parse(String(r.updatedAt || r.createdAt || r.dayIso || ""));
      return Number.isFinite(ts) && ts >= cutoff30Ms;
    });
    const completed30dPayoutTotal = completed30dList.reduce((acc, r) => acc + reqPayout(r), 0);
    const studentsDoneLessons = (st.students || []).reduce((sum, s) => sum + (Number(s.lessonsDone) || 0), 0);
    const srv = st.serverSummary && typeof st.serverSummary === "object" ? st.serverSummary : null;
    const useServerMetrics = Boolean(srv || isProd);
    const lessonsAll = useServerMetrics
      ? (srv ? (Number(srv.completedLessonsCount) || 0) : completedList.length)
      : (studentsDoneLessons + acceptedList.length);
    const lessonsMonth = useServerMetrics
      ? (srv ? (Number(srv.completedLessons30dCount) || 0) : completed30dList.length)
      : Math.max(acceptedList.length, Math.min(lessonsAll, acceptedList.length + Math.round(studentsDoneLessons * 0.45)));
    const netIncomeAll = useServerMetrics
      ? (srv ? (Number(srv.earnedNetRub) || 0) : completedPayoutTotal)
      : ((studentsDoneLessons * baseSplit.payout) + totalReqPayout);
    const netIncomeMonth = useServerMetrics
      ? (srv ? (Number(srv.earned30dNetRub) || 0) : completed30dPayoutTotal)
      : Math.round(lessonsMonth * baseSplit.payout);
    const shownIncome = isMonth ? netIncomeMonth : netIncomeAll;
    const shownLessons = isMonth ? lessonsMonth : lessonsAll;
    const wallet = getWalletSummary();

    return `
      <div class="hh-seg equal tc-payout-scope-seg" role="group" aria-label="Период статистики выплат">
        <button type="button" data-a="tc-payout-scope" data-v="all" aria-pressed="${!isMonth}">За всё время</button>
        <button type="button" data-a="tc-payout-scope" data-v="month" aria-pressed="${isMonth}">За последний месяц</button>
      </div>

      <div class="tc-payout-summary">
        <div class="tc-rate-tile">
          <button type="button" class="tc-rate-tile-btn" data-a="tc-payout-rate-toggle" aria-expanded="${!!st.payoutRateOpen}">
            <div class="stack" style="gap:3px;min-width:0">
              <span class="tile-label">Ставка в анкете</span>
              <span class="tile-value num">${p.price.toLocaleString("ru-RU")} ₽/ч</span>
              <span class="tile-note">торг от ${p.minFair.toLocaleString("ru-RU")} ₽/ч</span>
            </div>
            <span class="chip">${st.payoutRateOpen ? "Свернуть" : "Изменить ›"}</span>
          </button>
          ${st.payoutRateOpen ? `<div class="tc-rate-edit-box">
            <div class="field">
              <span class="label">Базовая ставка (₽/ч)</span>
              <div class="hh-price-stepper compact">
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="-50">−50 ₽</button>
                <div class="hh-step-readout"><b class="num">${p.price.toLocaleString("ru-RU")} ₽/ч</b></div>
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="price" data-step="50">+50 ₽</button>
              </div>
            </div>
            <div class="field">
              <span class="label">Минимальный порог торга</span>
              <div class="hh-price-stepper compact">
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="-50">−50 ₽</button>
                <div class="hh-step-readout"><b class="num">${p.minFair.toLocaleString("ru-RU")} ₽/ч</b></div>
                <button type="button" class="hh-step-btn" data-a="tc-rate-step" data-which="minFair" data-step="50">+50 ₽</button>
              </div>
            </div>
            <button type="button" class="btn soft sm" data-a="tc-payout-rate-toggle" style="width:100%;justify-content:center">Готово</button>
          </div>` : ""}
        </div>

        <div class="tile">
          <span class="tile-label">Чистый доход (94%)</span>
          <span class="tile-value num savings-gold-txt">${shownIncome.toLocaleString("ru-RU")} ₽</span>
          <span class="tile-note">${scopeLabel}</span>
        </div>

        <div class="tile">
          <span class="tile-label">Проведено уроков</span>
          <span class="tile-value num">${shownLessons}</span>
          <span class="tile-note">${scopeLabel}</span>
        </div>
      </div>

      ${renderPayoutWalletSection(wallet)}

      ${renderPayoutStatsBlocks(st, TDATA, allReqs, acceptedList, netIncomeAll)}

      <section class="card stack" style="gap:12px" aria-label="Условия выплат: 5% сервис + 1% СБП">
        <div class="tc-fold-head">
          <div class="stack" style="gap:2px;min-width:0">
            <div class="eyebrow">Прозрачная комиссия · 5% + 1% СБП</div>
            <h2 class="h2">Расчёт с урока</h2>
            <span class="small muted num">${p.price.toLocaleString("ru-RU")} ₽ → ${baseSplit.payout.toLocaleString("ru-RU")} ₽ вам (сервис ${baseSplit.fee} ₽ + СБП ${baseSplit.sbpFee != null ? baseSplit.sbpFee : Math.round(p.price * 0.01)} ₽)</span>
          </div>
          <button type="button" class="btn soft sm" data-a="tc-fee-details-toggle" aria-expanded="${!!st.feeDetailsOpen}">${st.feeDetailsOpen ? "Скрыть" : "Подробнее"}</button>
        </div>
        ${st.feeDetailsOpen ? `<div class="bid-fee-row">${feeSplitHTML(p.price, TDATA)}</div>
        <p class="small muted">Средства ученика замораживаются до урока и переводятся преподавателю сразу после проведения занятия (94% на руки: 5% — сервис и поддержка расписания, 1% — шлюз СБП).</p>
        <p class="small muted">Для своих учеников, добавленных вручную в «Ученики», действует льготная схема: <b>1%</b> сервис + <b>1%</b> СБП (98% на руки).</p>` : ""}
      </section>

      ${renderPayoutHistorySection(wallet, st)}`;
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
