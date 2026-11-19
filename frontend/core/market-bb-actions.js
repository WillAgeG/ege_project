/* Действия маркетплейса, баланса, лендинга и интерактивного брендбука. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { $, clampInt, days, esc, range, scrollToEl } = EGE.utils;
  const { icon, triggerIconTileAnim } = EGE.ui;
  const { bidBtnLabelHTML, isValidHHMM } = EGE.hh;

  let EGEPayments, MOTION_PRESETS, TDATA, ai, defaultMarketState, draft, go;
  let heroMotionMeta, isUserAuthenticated, mkt, notifySide, patchHeroMotionDOM, patchSavingsDOM;
  let renderModal, requireAuthForBid, saveMkt, scheduleRender, stopMotionTimers, tile, toast, ui;
  let updateBookingModalLive, writeHash;

  function buildBookingDraft(tutor, el, TDATA_ref, mkt_ref, ui_ref) {
    const st = mkt_ref();
    const daysList = TDATA_ref.buildCalendarDays(7);
    const pickDay = (st.day !== "all" ? daysList.find((d) => d.iso === st.day) : null)
      || daysList.find((d) => TDATA_ref.tutorSlotsForDay(tutor, d.dow).length > 0)
      || daysList[0];
    const daySlots = TDATA_ref.tutorSlotsForDay(tutor, pickDay.dow);
    const wantedHour = (el && el.dataset && el.dataset.hour) || (st.hour !== "all" ? st.hour : "");
    const hour = isValidHHMM(wantedHour) ? wantedHour : (daySlots[0] || "10:00");
    const exam = st.exam !== "all" && tutor.exams.includes(st.exam) ? st.exam : tutor.exams[0];
    const format = st.format !== "all" && tutor.formats.includes(st.format) ? st.format : tutor.formats[0];
    const cardOffers = (ui_ref && ui_ref.cardOffers) || {};
    const dataOffer = el && el.dataset && el.dataset.offer != null ? Number(el.dataset.offer) : NaN;
    const offerPrice = (cardOffers[tutor.id] != null && Number.isFinite(Number(cardOffers[tutor.id])))
      ? Math.max(0, Math.min(99999, Math.round(Number(cardOffers[tutor.id]))))
      : (Number.isFinite(dataOffer)
          ? Math.max(0, Math.min(99999, Math.round(dataOffer)))
          : Math.max(0, Number(tutor.price) || 1200));
    const mktViews = EGE.views && EGE.views.marketplace;
    const gInfo = mktViews && typeof mktViews.resolveTutorGuarantee === "function"
      ? mktViews.resolveTutorGuarantee(tutor)
      : { enabled: !!tutor.firstLessonGuarantee };
    return {
      tutorId: tutor.id,
      mode: "paid",
      firstLessonGuarantee: !!gInfo.enabled,
      exam,
      format,
      dayIso: pickDay.iso,
      hour,
      offerPrice,
      note: ""
    };
  }

  const BB_EXPORT_SCHEMA = {
    light: {
      bg: "#f4f5f7", surface: "#ffffff", "surface-2": "#f2f3f6", ink: "#141517", "ink-2": "#3d424d",
      muted: "#7c828e", line: "#e4e6ec", "line-strong": "#cdd2dc", accent: "#0070ff", "accent-hover": "#005ce0",
      "accent-ink": "#ffffff", "accent-soft": "#ebf3ff", notif: "#f97316", "notif-soft": "#fff3eb",
      confirm: "#16a34a", "confirm-hover": "#15803d", "confirm-soft": "#dcfce7",
      pro: "#7c3aed", "pro-soft": "#f3e8ff", bad: "#ff2b4d", "bad-soft": "#ffe4e8", warn: "#b45309", "warn-soft": "#fef3c7",
      gold: "#c59b5f", "gold-hover": "#b3884d", "gold-ink": "#8c6327", "gold-soft": "#fbf5ea",
      "gold-btn-ink": "#4a310a",
      "gold-grad": "linear-gradient(90deg, #9a6d28 0%, #c59b5f 40%, #e4be73 76%, #f4da9c 100%)",
      "gold-glass": "linear-gradient(135deg, rgba(246, 212, 134, .30) 0%, rgba(197, 155, 95, .44) 52%, rgba(168, 116, 40, .30) 100%)",
      "gold-glass-hover": "linear-gradient(135deg, rgba(250, 220, 146, .42) 0%, rgba(212, 166, 98, .54) 52%, rgba(180, 126, 46, .42) 100%)",
      "gold-text-grad": "linear-gradient(115deg, #754c12 0%, #b58234 52%, #8a5e1d 100%)"
    },
    dark: {
      bg: "#000000", surface: "#16181d", "surface-2": "#22252e", ink: "#ffffff", "ink-2": "#d4d8e2",
      muted: "#8b909d", line: "#282b36", "line-strong": "#373b49", accent: "#1d7bff", "accent-hover": "#0d67e8",
      "accent-ink": "#ffffff", "accent-soft": "#102548", notif: "#fb923c", "notif-soft": "#2e1909",
      confirm: "#22c55e", "confirm-hover": "#16a34a", "confirm-soft": "#0c2b17",
      pro: "#a78bfa", "pro-soft": "#21153b", bad: "#ff4d5e", "bad-soft": "#3a171c",
      gold: "#c59b5f", "gold-hover": "#d8b377", "gold-ink": "#e5c185", "gold-soft": "#261e12",
      "gold-btn-ink": "#fff3d6",
      "gold-grad": "linear-gradient(90deg, rgba(168, 117, 42, .92) 0%, #c59b5f 36%, #ebca86 72%, rgba(248, 224, 160, .96) 100%)",
      "gold-glass": "linear-gradient(135deg, rgba(245, 210, 128, .22) 0%, rgba(197, 155, 95, .34) 52%, rgba(154, 106, 36, .22) 100%)",
      "gold-glass-hover": "linear-gradient(135deg, rgba(248, 218, 142, .32) 0%, rgba(214, 170, 102, .44) 52%, rgba(168, 118, 44, .32) 100%)",
      "gold-text-grad": "linear-gradient(115deg, #fde4a8 0%, #e5b869 52%, #f4d38c 100%)"
    },
    sakha: {
      auroraCyan: "#0EA5E9", auroraGreen: "#10B981", ornamentGold: "#C59B5F",
      glacierLight: "#EFF9FF", glacierBorderLight: "#7DD3FC", glacierDark: "#091E32", glacierBorderDark: "#0284C7"
    },
    zIndex: { stickyTop: 10, selectMenu: 25, mobileTabbar: 40, sideToast: 60, modal: 100 },
    editorial: { currencyFormat: "1 200 ₽/ч", timeWindow: "10:00–20:00" }
  };
  function copyTextSafe(txt) {
    if (!txt) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
        navigator.clipboard.writeText(txt).catch(() => {});
      }
    } catch (e) { /* без буфера в тестовом окружении */ }
  }
  function cssVarsBlock(selector, varsMap) {
    return `${selector} {\n${Object.keys(varsMap).map((k) => `  --${k}: ${varsMap[k]};`).join("\n")}\n}`;
  }
  function buildBrandbookTokensExport(fmt) {
    if (fmt === "json") return JSON.stringify(BB_EXPORT_SCHEMA, null, 2);
    const extraVars = {
      "sakha-cyan": BB_EXPORT_SCHEMA.sakha.auroraCyan,
      "sakha-green": BB_EXPORT_SCHEMA.sakha.auroraGreen,
      "sakha-gold": BB_EXPORT_SCHEMA.sakha.ornamentGold,
      "z-sticky-top": BB_EXPORT_SCHEMA.zIndex.stickyTop,
      "z-select-menu": BB_EXPORT_SCHEMA.zIndex.selectMenu,
      "z-mobile-tabbar": BB_EXPORT_SCHEMA.zIndex.mobileTabbar,
      "z-side-toast": BB_EXPORT_SCHEMA.zIndex.sideToast,
      "z-modal": BB_EXPORT_SCHEMA.zIndex.modal
    };
    return [
      cssVarsBlock(":root", Object.assign({}, BB_EXPORT_SCHEMA.light, extraVars)),
      cssVarsBlock('[data-theme="dark"]', BB_EXPORT_SCHEMA.dark)
    ].join("\n\n");
  }
  function bbState() {
    const bb = ui.brandbook || (ui.brandbook = {
      mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true,
      vpWidth: 390, chipOn: true, sent: false, fav: true, switchVal: "online",
      subj: "bio", subjMenuOpen: false, pickedPlan: "month10k", quizOpt: 1,
      cancelDemoUndone: false, previewToastDismissed: false, sakhaSent: false, sakhaKunOn: false, sakhaStarOn: false,
      heroSubmitted: false, heroBetaOn: false, heroSearchSubmitted: false, heroQ: "", cat: "all", catQ: "", faqOpen: 0,
      marketDemoAccepted: false, reducedMotion: false, balFunded: true,
      chartStyle: "sticks", chartDataset: "income", chartActiveIdx: 3, chartLines: 1, chartPoints: 7,
      linePtIdx: 3, donutDataset: "channels", donutSliceIdx: 0, tableCols: 5, tableFilter: "all", tableSearch: "",
      maskPhone: "+7 (914) 210-05-11", maskTg: "@aytal_bio", maskMax: "aytal_ege",
      payMethod: "sbp", payState: "frozen", payInitialDone: false,
      tablePreset: "requests", confirmedRows: {}, essayOpenIdx: 0,
      shellRole: "tutor", pipeFilter: "all", calTz: "UTC+9"
    });
    if (bb.marketDemoAccepted === undefined) bb.marketDemoAccepted = false;
    if (bb.reducedMotion === undefined) bb.reducedMotion = false;
    if (bb.balFunded === undefined) bb.balFunded = true;
    if (!bb.chartStyle) bb.chartStyle = "sticks";
    if (!bb.chartDataset) bb.chartDataset = "income";
    if (bb.chartActiveIdx === undefined) bb.chartActiveIdx = 3;
    if (!bb.chartLines) bb.chartLines = 1;
    if (!bb.chartPoints) bb.chartPoints = 7;
    if (bb.linePtIdx === undefined) bb.linePtIdx = 3;
    if (!bb.donutDataset) bb.donutDataset = "channels";
    if (bb.donutSliceIdx === undefined) bb.donutSliceIdx = 0;
    if (!bb.tableCols) bb.tableCols = 5;
    if (!bb.tableFilter) bb.tableFilter = "all";
    if (bb.tableSearch === undefined) bb.tableSearch = "";
    if (bb.maskPhone === undefined) bb.maskPhone = "+7 (914) 210-05-11";
    if (bb.maskTg === undefined) bb.maskTg = "@aytal_bio";
    if (bb.maskMax === undefined) bb.maskMax = "aytal_ege";
    if (!bb.payMethod) bb.payMethod = "sbp";
    if (!bb.payState) bb.payState = "frozen";
    if (bb.payInitialDone === undefined) bb.payInitialDone = false;
    if (!bb.tablePreset) bb.tablePreset = "requests";
    if (!bb.confirmedRows || typeof bb.confirmedRows !== "object") bb.confirmedRows = {};
    if (bb.essayOpenIdx === undefined) bb.essayOpenIdx = 0;
    if (!bb.shellRole) bb.shellRole = "tutor";
    if (!bb.pipeFilter) bb.pipeFilter = "all";
    if (!bb.calTz) bb.calTz = "UTC+9";
    return bb;
  }
  function patchMaskTrainerDOM() {
    const bb = bbState();
    const urlsEl = typeof document.getElementById === "function" ? document.getElementById("bb-mask-urls") : null;
    const linksEl = typeof document.getElementById === "function" ? document.getElementById("bb-mask-links") : null;
    if (!urlsEl && !linksEl) return false;
    const fmtP = EGE.kit && EGE.kit.formatPhoneMask;
    const fmtTg = EGE.kit && EGE.kit.formatTelegramContact;
    const urlsFn = EGE.kit && EGE.kit.resolveMessengerUrls;
    const linksFn = EGE.kit && EGE.kit.messengerLinksHTML;
    const phoneRaw = String(bb.maskPhone != null ? bb.maskPhone : "+7 (914) 210-05-11");
    const tgRaw = String(bb.maskTg != null ? bb.maskTg : "@aytal_bio");
    const maxRaw = String(bb.maskMax != null ? bb.maskMax : "aytal_ege");
    const phoneNorm = typeof fmtP === "function" && phoneRaw ? (fmtP(phoneRaw) || phoneRaw) : phoneRaw;
    const tgNorm = typeof fmtTg === "function" && tgRaw ? (fmtTg(tgRaw) || tgRaw) : tgRaw;
    const entity = {
      id: "mask-demo",
      name: "Айтал Б.",
      whatsapp: phoneNorm || "+7 (914) 210-05-11",
      telegram: tgNorm || tgRaw || "@aytal_bio",
      maxHandle: maxRaw || "aytal_ege"
    };
    const msgText = "Здравствуйте! Проверяю живую маску контактов в Вектор ЕГЭ.";
    const urls = typeof urlsFn === "function"
      ? urlsFn(entity, msgText)
      : { whatsapp: "https://wa.me/79142100511", telegram: "https://t.me/aytal_bio", max: "https://max.ru/aytal_ege" };
    if (urlsEl) {
      urlsEl.innerHTML = `<div class="bb-mask-url-row"><span class="small muted">WhatsApp</span><code>${esc(urls.whatsapp.split("?")[0])}</code></div>
        <div class="bb-mask-url-row"><span class="small muted">Telegram</span><code>${esc(urls.telegram.split("?")[0])}</code></div>
        <div class="bb-mask-url-row"><span class="small muted">MAX</span><code>${esc(urls.max.split("?")[0])}</code></div>`;
    }
    if (linksEl && typeof linksFn === "function") {
      linksEl.innerHTML = linksFn({ entity, message: msgText, compact: true });
    }
    return true;
  }
  function applyBrandbookViewport(rawW) { return EGE.views.brandbook.applyBrandbookViewport(ui, rawW); }

  function registerMarketBbActions(ctx, ACTIONS) {
    ({
      EGEPayments, MOTION_PRESETS, TDATA, ai, defaultMarketState, draft, go,
      heroMotionMeta, isUserAuthenticated, mkt, notifySide, patchHeroMotionDOM, patchSavingsDOM,
      renderModal, requireAuthForBid, saveMkt, scheduleRender, stopMotionTimers, tile, toast, ui,
      updateBookingModalLive, writeHash
    } = ctx || {});

    Object.assign(ACTIONS, {
    "land-scroll": (el) => {
      const id = el.dataset.target;
      let node = id ? document.getElementById(id) : null;
      if (!node && ui.view === "brandbook" && id) {
        const bb = bbState();
        const subApi = EGE.brandbookSubsites;
        if (bb.subsite && bb.subsite !== "all" && subApi && typeof subApi.subsiteForSection === "function") {
          const targetSub = subApi.subsiteForSection(id);
          if (targetSub && targetSub !== "all") {
            bb.subsite = targetSub;
            if (typeof subApi.syncSubsiteUrl === "function") subApi.syncSubsiteUrl(targetSub, false);
          }
        }
        bb.cat = "all";
        bb.catQ = "";
        scheduleRender();
        if (typeof setTimeout === "function") {
          setTimeout(() => {
            const n = document.getElementById(id);
            if (n && typeof n.scrollIntoView === "function") n.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 40);
        }
        return;
      }
      if (id === "land-market") {
        if (ui.view === "landing" && typeof isUserAuthenticated === "function" && isUserAuthenticated() && ui.role !== "tutor" && ui.role !== "admin") {
          go("market");
          return;
        }
        ui.landWhiteStage = true;
        if (typeof document !== "undefined") {
          if (document.body && document.body.classList) document.body.classList.add("is-land-white");
          const lp = typeof document.querySelector === "function" ? document.querySelector(".land-page:not(#brandbook-page)") : null;
          if (lp && lp.dataset) lp.dataset.whiteLockUntil = String(Date.now() + 1400);
          if (lp && lp.classList) lp.classList.add("is-white-stage");
          const top = lp && typeof lp.querySelector === "function" ? lp.querySelector(".land-top") : null;
          if (top && top.classList) top.classList.add("is-scrolled-light");
          const bar = typeof document.getElementById === "function" ? document.getElementById("land-mobile-sticky") : null;
          if (bar && bar.classList) bar.classList.add("is-hidden");
        }
      }
      if (node && typeof node.scrollIntoView === "function") {
        node.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },
    "mkt-load-more": () => {
      ui.mktVisibleCount = (Number(ui.mktVisibleCount) || 8) + 8;
      scheduleRender();
    },
    "coop-open": () => { ui.coopModal = true; renderModal(); },
    "coop-close": () => { ui.coopModal = false; renderModal(); },
    "coop-to-apply": () => {
      ui.coopModal = false;
      ui.tutorApply = ui.tutorApply || { name: "", subject: "eng", rate: 1100, contact: "", error: "" };
      ui.tutorApply.error = "";
      ui.tutorApplyModal = true;
      ui.focusNext = "ta-name";
      renderModal();
    },
    "hero-copy-next": () => {
      if (EGE.views && EGE.views.landing && typeof EGE.views.landing.nextHeroVariant === "function") {
        EGE.views.landing.nextHeroVariant();
      }
      scheduleRender();
    },
    "mkt-plan": (el) => {
      if (!TDATA) return;
      const plan = TDATA.PLANS.find((p) => p.id === el.dataset.id);
      if (!plan) return;
      const st = mkt();
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      const targetBal = Math.max(390, Number(plan.balance) || trialRub);
      EGEPayments.createTopupIntent({ amount: targetBal, planId: plan.id });
      st.planId = plan.id;
      const reserved = st.bookings.reduce((sum, bk) => sum + (bk.reserved || 0), 0);
      st.balance = Math.max(0, targetBal - reserved);
      if (targetBal >= trialRub) st.initialPaid = true;
      saveMkt();
      const pending = ui.balanceModal && ui.balanceModal.pendingBooking;
      if (ui.balanceModal) { ui.balanceModal = null; }
      if (pending && (Number(st.balance) || 0) >= (Number(pending.offerPrice) || 0)) {
        ui.booking = pending;
      }
      renderModal();
      toast(`Подключён тариф «${plan.name}» (СБП): баланс ${st.balance.toLocaleString("ru-RU")} ₽`);
      scheduleRender();
    },
    "bal-open": (el) => {
      const st = mkt();
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      const reason = el && el.dataset && el.dataset.reason === "trial"
        ? `Пополните баланс минимум на ${trialRub} ₽ для записи на занятие.`
        : "";
      const pendingBooking = ui.booking ? Object.assign({}, ui.booking) : null;
      const minTopup = st.initialPaid ? 100 : trialRub;
      const customAmt = pendingBooking && Number(pendingBooking.offerPrice) > (Number(st.balance) || 0)
        ? Math.max(minTopup, Number(pendingBooking.offerPrice) - (Number(st.balance) || 0))
        : (st.initialPaid ? 500 : trialRub);
      if (pendingBooking) ui.booking = null;
      const cards = Array.isArray(st.savedCards) ? st.savedCards : (st.savedCard && st.savedCard.last4 ? [st.savedCard] : []);
      ui.cardBindModal = null;
      ui.balanceModal = {
        method: "sbp",
        selectedCardId: (cards[0] && cards[0].id) || "",
        customAmount: customAmt,
        error: "",
        reason,
        pendingBooking
      };
      renderModal();
    },
    "bal-close": () => {
      const pending = ui.balanceModal && ui.balanceModal.pendingBooking;
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      ui.cardBindModal = null;
      ui.balanceModal = null;
      if (pending && (Number(mkt().balance) || 0) >= (Number(pending.offerPrice) || trialRub)) ui.booking = pending;
      renderModal();
    },
    "bal-chip": (el) => {
      if (!ui.balanceModal) return;
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      const minAmt = mkt().initialPaid ? 100 : trialRub;
      ui.balanceModal.customAmount = Math.max(minAmt, Math.min(200000, Number(el.dataset.v) || minAmt));
      ui.balanceModal.error = "";
      renderModal();
    },
    "bal-method": (el) => {
      if (!ui.balanceModal) return;
      const st = mkt();
      const amtEl = typeof document !== "undefined" && document.getElementById ? document.getElementById("bal-custom-amount") : null;
      if (amtEl && amtEl.value != null) {
        const digits = String(amtEl.value).replace(/\D+/g, "").slice(0, 6);
        if (digits !== "") ui.balanceModal.customAmount = digits;
      }
      const next = el && el.dataset && el.dataset.v === "card" ? "card" : "sbp";
      const cards = Array.isArray(st.savedCards) ? st.savedCards : (st.savedCard && st.savedCard.last4 ? [Object.assign({ id: "card-1" }, st.savedCard)] : []);
      if (next === "card" && !cards.length) {
        ui.cardBindModal = { cardNum: "", cardExp: "", cardCvc: "", saveCard: true, error: "" };
        renderModal();
        return;
      }
      ui.balanceModal.method = next;
      if (next === "card") {
        ui.balanceModal.selectedCardId = (el && el.dataset && el.dataset.cardId) || (cards[0] && cards[0].id) || "card-1";
      }
      ui.balanceModal.error = "";
      renderModal();
      if (typeof document !== "undefined" && typeof document.querySelector === "function") {
        const targetTile = next === "sbp"
          ? document.querySelector('[data-a="bal-method"][data-v="sbp"]')
          : document.querySelector('[data-a="bal-method"][data-v="card"].is-on');
        if (targetTile && typeof targetTile.scrollIntoView === "function") {
          try { targetTile.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); } catch (e) {}
        }
      }
    },
    "bal-card-open": () => {
      if (ui.balanceModal && typeof document !== "undefined" && document.getElementById) {
        const amtEl = document.getElementById("bal-custom-amount");
        if (amtEl && amtEl.value != null) {
          const digits = String(amtEl.value).replace(/\D+/g, "").slice(0, 6);
          if (digits !== "") ui.balanceModal.customAmount = digits;
        }
      }
      ui.cardBindModal = { cardNum: "", cardExp: "", cardCvc: "", saveCard: true, error: "" };
      renderModal();
    },
    "bal-card-close": () => {
      ui.cardBindModal = null;
      renderModal();
    },
    "bal-topup-preset": (el) => {
      const st = mkt();
      const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
      const presetPlan = el.dataset.plan || "";
      const minAmt = presetPlan === "ai390" ? 390 : (st.initialPaid ? 100 : trialRub);
      const amt = Math.max(minAmt, Math.min(200000, Math.round(Number(el.dataset.amount) || trialRub)));
      EGEPayments.createTopupIntent({ amount: amt, planId: presetPlan || st.planId || "trial5k" });
      st.balance = (Number(st.balance) || 0) + amt;
      if (st.balance >= trialRub) st.initialPaid = true;
      if (presetPlan) st.planId = presetPlan;
      else if (st.balance >= 8900) st.planId = "month10k";
      else if (!st.planId) st.planId = "trial5k";
      saveMkt();
      const pending = ui.balanceModal && ui.balanceModal.pendingBooking;
      ui.balanceModal = null;
      if (pending && st.balance >= (Number(pending.offerPrice) || trialRub)) {
        ui.booking = Object.assign({}, pending, { offerPrice: pending.mode === "trial" ? (Number(pending.offerPrice) || trialRub) : (pending.offerPrice != null ? pending.offerPrice : 1000) });
      }
      renderModal();
      notifySide("Баланс пополнен по СБП", `+${amt.toLocaleString("ru-RU")} ₽ · на счёте ${st.balance.toLocaleString("ru-RU")} ₽`);
      scheduleRender();
    },
    "tc-payout-open": () => {
      const tcMod = EGE.views.tutorCabinet;
      const summary = tcMod && typeof tcMod.getWalletSummary === "function" ? tcMod.getWalletSummary() : null;
      const sets = (summary && summary.settings) || {};
      const defAmt = summary && summary.availableRub >= (summary.minPayout || 500)
        ? Math.min(summary.availableRub, 3000)
        : (summary ? summary.availableRub : 0);
      ui.payoutModal = {
        method: sets.method === "card" ? "card" : "sbp",
        bank: sets.bank || "АЭБ (Алмазэргиэнбанк)",
        phone: sets.phone || "+7 (914) 210-01-99",
        card: sets.card || "2200 7004 8210 4419",
        amount: defAmt,
        npdReceipt: sets.npdReceipt !== undefined ? !!sets.npdReceipt : true,
        error: ""
      };
      renderModal();
    },
    "tc-payout-close": () => { ui.payoutModal = null; renderModal(); },
    "tc-payout-method": (el) => {
      if (!ui.payoutModal) return;
      const next = el.dataset && el.dataset.v === "card" ? "card" : "sbp";
      ui.payoutModal.method = next;
      ui.payoutModal.error = "";
      renderModal();
      if (typeof document !== "undefined" && typeof document.querySelector === "function") {
        const targetTile = document.querySelector(`[data-a="tc-payout-method"][data-v="${next}"]`);
        if (targetTile && typeof targetTile.scrollIntoView === "function") {
          try { targetTile.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" }); } catch (e) {}
        }
      }
    },
    "tc-payout-chip": (el) => {
      if (!ui.payoutModal) return;
      const tcMod = EGE.views.tutorCabinet;
      const summary = tcMod && typeof tcMod.getWalletSummary === "function" ? tcMod.getWalletSummary() : null;
      const maxAmt = summary ? summary.availableRub : 50000;
      const v = Math.max(0, Math.round(Number(el.dataset && el.dataset.v) || 0));
      ui.payoutModal.amount = maxAmt ? Math.min(maxAmt, v) : v;
      ui.payoutModal.error = "";
      renderModal();
    },
    "tc-payout-npd": () => {
      if (!ui.payoutModal) return;
      ui.payoutModal.npdReceipt = !ui.payoutModal.npdReceipt;
      ui.payoutModal.error = "";
      renderModal();
    },
    "filter-open": () => { ui.filterModal = true; renderModal(); },
    "filter-close": () => { ui.filterModal = false; renderModal(); },
    "study-tab": (el) => { ui.studyTab = el.dataset.tab || "week"; scheduleRender(true); },
    "study-week": (el) => { ui.studyWeekOffset = el.dataset.w === "1" ? 1 : 0; scheduleRender(); },
    "study-subj": (el) => { ui.studySubj = el.dataset.v || "all"; scheduleRender(); },
    "tests-guide-chip": (el) => { ui.guideSid = "all"; ui.guideQ = el.dataset.q || ""; go("tutor"); },
    "mkt-fav": (el) => {
      const st = mkt(), id = el.dataset.id;
      if (!id) return;
      const i = st.favs.indexOf(id);
      if (i < 0) st.favs.push(id);
      else st.favs.splice(i, 1);
      saveMkt();
      scheduleRender();
    },
    "mkt-clear-q": () => { mkt().q = ""; ui.mktVisibleCount = 8; saveMkt(); ui.focusNext = "mkt-q"; if (ui.filterModal) renderModal(); scheduleRender(); },
    "mkt-bumped-set": (el) => { mkt().onlyBumped = el.dataset.v === "1"; ui.mktVisibleCount = 8; saveMkt(); if (ui.filterModal) renderModal(); scheduleRender(); },
    "mkt-sort-cycle": () => {
      const order = ["actual", "price_asc", "rating_desc"];
      const st = mkt();
      st.sort = order[(order.indexOf(st.sort) + 1) % order.length];
      ui.mktVisibleCount = 8;
      saveMkt();
      scheduleRender();
    },
    "mkt-reset-chip": (el) => {
      const st = mkt(), k = el.dataset.k;
      if (!k) return;
      const def = defaultMarketState();
      if (k === "price") {
        st.minPrice = 0;
        st.maxPrice = 0;
        st.priceCustom = false;
        st.priceExplicit = false;
      } else if (Object.prototype.hasOwnProperty.call(def, k)) {
        st[k] = def[k];
      }
      ui.mktVisibleCount = 8;
      saveMkt();
      scheduleRender();
    },
    "mkt-calc": (el) => {
      const rate = Number(el.dataset.rate);
      if (!rate) return;
      mkt().calcRate = rate;
      saveMkt();
      scheduleRender();
    },
    "mkt-preset": () => {
      if (!TDATA) return;
      const st = mkt();
      st.exam = "ЕГЭ";
      st.subject = "eng";
      st.format = "Онлайн";
      st.minPrice = 0;
      st.maxPrice = 0;
      st.priceCustom = false;
      st.priceExplicit = false;
      st.onlyBumped = false;
      st.day = "all";
      st.hour = "all";
      ui.mktVisibleCount = 8;
      saveMkt();
      toast("Фильтр: Английский · ЕГЭ · Онлайн");
      if (ui.filterModal) renderModal();
      scheduleRender();
    },
    "mkt-exam": (el) => {
      const st = mkt();
      st.exam = el.dataset.v || "all";
      if ((st.exam === "ЕГЭ" || st.exam === "ОГЭ") && st.subject && st.subject !== "all" && TDATA) {
        const sb = TDATA.SUBJECTS.find((x) => x.id === st.subject);
        if (sb && !sb.isExam) st.subject = "all";
      }
      ui.mktVisibleCount = 8;
      saveMkt();
      if (ui.filterModal) renderModal();
      scheduleRender();
    },
    "mkt-format": (el) => { mkt().format = el.dataset.v || "all"; ui.mktVisibleCount = 8; saveMkt(); if (ui.filterModal) renderModal(); scheduleRender(); },
    "mkt-city": (el) => { mkt().city = el.dataset.v || "all"; ui.mktVisibleCount = 8; saveMkt(); if (ui.filterModal) renderModal(); scheduleRender(); },
    "mkt-subj": (el) => { mkt().subject = el.dataset.v || "all"; ui.mktVisibleCount = 8; saveMkt(); if (ui.filterModal) renderModal(); scheduleRender(); },
    "mkt-price": (el) => {
      const v = Math.max(0, Math.round(Number(el.dataset.v) || 0));
      const st = mkt();
      st.minPrice = 0;
      st.maxPrice = v;
      st.priceCustom = false;
      st.priceExplicit = v > 0;
      ui.mktVisibleCount = 8;
      saveMkt();
      if (ui.filterModal) renderModal();
      scheduleRender();
    },
    "mkt-price-custom": () => {
      const st = mkt();
      st.priceCustom = !st.priceCustom;
      saveMkt();
      if (ui.filterModal) renderModal();
      scheduleRender();
    },
    "mkt-bumped": () => { const st = mkt(); st.onlyBumped = !st.onlyBumped; ui.mktVisibleCount = 8; saveMkt(); if (ui.filterModal) renderModal(); scheduleRender(); },
    "mkt-sort": (el) => { mkt().sort = el.dataset.v || "actual"; ui.mktVisibleCount = 8; saveMkt(); scheduleRender(); },
    "mkt-day": (el) => { mkt().day = el.dataset.v || "all"; ui.mktVisibleCount = 8; saveMkt(); scheduleRender(); },
    "mkt-hour": (el) => { mkt().hour = el.dataset.v || "all"; ui.mktVisibleCount = 8; saveMkt(); scheduleRender(); },
    "mkt-reset": () => {
      const cur = mkt(), fresh = defaultMarketState();
      fresh.planId = cur.planId;
      fresh.balance = cur.balance;
      fresh.initialPaid = !!cur.initialPaid;
      fresh.calcRate = cur.calcRate;
      fresh.favs = cur.favs;
      fresh.bookings = cur.bookings;
      ui.market = fresh;
      ui.mktVisibleCount = 8;
      saveMkt();
      if (ui.filterModal) renderModal();
      scheduleRender();
    },
    "tutor-bio-toggle": (el) => {
      const id = el && el.dataset && el.dataset.id;
      if (!id) return;
      const map = ui.expandedBios || (ui.expandedBios = {});
      map[id] = !map[id];
      scheduleRender();
    },
    "card-offer-step": (el) => {
      if (!TDATA) return;
      const id = el && el.dataset && el.dataset.id;
      const tutor = id && TDATA.LIST.find((x) => x.id === id);
      if (!tutor) return;
      const step = Number(el.dataset.step) || 0;
      const map = ui.cardOffers || (ui.cardOffers = {});
      const raw = map[id] != null && Number.isFinite(Number(map[id])) ? Number(map[id]) : (Number(tutor.price) || 1200);
      const base = Math.round(raw / 50) * 50;
      map[id] = Math.max(0, Math.min(99999, base + step));
      scheduleRender();
    },
    "card-bid": (el) => {
      if (!TDATA) return;
      const tutor = TDATA.LIST.find((x) => x.id === el.dataset.id);
      if (!tutor) return;
      const draftBooking = buildBookingDraft(tutor, el, TDATA, mkt, ui);
      if (typeof requireAuthForBid === "function" && requireAuthForBid(draftBooking)) return;
      if (ui.view === "landing" && typeof isUserAuthenticated === "function" && isUserAuthenticated() && ui.role !== "tutor" && ui.role !== "admin") {
        ui.view = "market";
        if (typeof writeHash === "function") writeHash();
        scheduleRender();
      }
      ui.booking = draftBooking;
      renderModal();
    },
    "book-open": (el) => {
      if (!TDATA) return;
      const tutor = TDATA.LIST.find((x) => x.id === el.dataset.id);
      if (!tutor) return;
      if (ui.view === "landing" && typeof isUserAuthenticated === "function" && isUserAuthenticated() && ui.role !== "tutor" && ui.role !== "admin") {
        ui.view = "market";
        if (typeof writeHash === "function") writeHash();
        scheduleRender();
      }
      ui.booking = buildBookingDraft(tutor, el, TDATA, mkt, ui);
      renderModal();
    },
    "trial-open": (el) => {
      if (!TDATA) return;
      const tutor = TDATA.LIST.find((x) => x.id === el.dataset.id);
      if (!tutor) return;
      if (ui.view === "landing" && typeof isUserAuthenticated === "function" && isUserAuthenticated() && ui.role !== "tutor" && ui.role !== "admin") {
        ui.view = "market";
        if (typeof writeHash === "function") writeHash();
        scheduleRender();
      }
      const draftBooking = buildBookingDraft(tutor, el, TDATA, mkt, ui);
      ui.booking = draftBooking;
      if (!draftBooking.firstLessonGuarantee) {
        toast("Преподаватель не проводит первый урок бесплатно — запись по обычной ставке");
      }
      renderModal();
    },
    "go-student-lead": () => {
      if (ui.view !== "study") go("study");
      ui.studyTab = "week";
      scheduleRender(true);
      if (typeof setTimeout === "function") setTimeout(() => scrollToEl("study-lead-card"), 40);
    },
    "lead-subj-toggle": () => {
      if (!ui.leadDraft) ui.leadDraft = { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, whatsapp: "", comment: "" };
      ui.leadDraft.subjMenuOpen = !ui.leadDraft.subjMenuOpen;
      scheduleRender();
    },
    "lead-subj-pick": (el) => {
      if (!ui.leadDraft) ui.leadDraft = { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, whatsapp: "", comment: "" };
      const id = String(el.dataset.v || "").trim();
      if (!id) return;
      const list = Array.isArray(ui.leadDraft.subjects) ? ui.leadDraft.subjects.slice() : ["chem"];
      const idx = list.indexOf(id);
      if (idx >= 0) {
        if (list.length <= 1) { toast("Должен остаться хотя бы один предмет"); return; }
        list.splice(idx, 1);
      } else {
        list.push(id);
      }
      ui.leadDraft.subjects = list;
      scheduleRender();
    },
    "lead-exam": (el) => {
      if (!ui.leadDraft) ui.leadDraft = { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, whatsapp: "", comment: "" };
      if (el.dataset.v) { ui.leadDraft.exam = el.dataset.v; scheduleRender(); }
    },
    "lead-format": (el) => {
      if (!ui.leadDraft) ui.leadDraft = { subjects: ["chem"], subjMenuOpen: false, exam: "ЕГЭ", format: "Онлайн", targetPrice: 1000, whatsapp: "", comment: "" };
      if (el.dataset.v) { ui.leadDraft.format = el.dataset.v; scheduleRender(); }
    },
    "lead-remove": (el) => {
      if (!TDATA || typeof TDATA.removeStudentLead !== "function" || !el.dataset.id) return;
      TDATA.removeStudentLead(el.dataset.id);
      toast("Запрос снят с каталога преподавателей");
      scheduleRender();
    },
    "book-close": () => { ui.booking = null; renderModal(); },
    "book-exam": (el) => { if (ui.booking && el.dataset.v) { ui.booking.exam = el.dataset.v; renderModal(); } },
    "book-format": (el) => { if (ui.booking && el.dataset.v) { ui.booking.format = el.dataset.v; renderModal(); } },
    "book-day": (el) => {
      if (!ui.booking || !TDATA || !el.dataset.v) return;
      const tutor = TDATA.LIST.find((x) => x.id === ui.booking.tutorId);
      const days = TDATA.buildCalendarDays(7);
      const d = days.find((x) => x.iso === el.dataset.v);
      if (!d) return;
      ui.booking.dayIso = d.iso;
      const slots = tutor ? TDATA.tutorSlotsForDay(tutor, d.dow) : [];
      if (slots.length && !slots.includes(ui.booking.hour)) ui.booking.hour = slots[0];
      renderModal();
    },
    "book-hour": (el) => {
      if (!ui.booking || !el.dataset.v) return;
      ui.booking.hour = el.dataset.v;
      ui.booking.timeMenuOpen = false;
      const modalRoot = $("#modal-root");
      const liveRange = typeof document.getElementById === "function" ? document.getElementById("bid-hour-range") : null;
      if (modalRoot && typeof modalRoot.contains === "function" && liveRange && modalRoot.contains(liveRange)) {
        updateBookingModalLive();
      } else {
        renderModal();
      }
    },
    "book-time-toggle": () => {
      if (!ui.booking) return;
      ui.booking.timeMenuOpen = !ui.booking.timeMenuOpen;
      renderModal();
    },
    "book-time-pick": (el) => {
      if (!ui.booking || !el.dataset.v) return;
      ui.booking.hour = el.dataset.v;
      ui.booking.timeMenuOpen = false;
      renderModal();
    },
    "bid-step": (el) => {
      if (!ui.booking) return;
      const delta = Number(el.dataset.step) || 0;
      const cur = ui.booking.offerPrice != null ? Number(ui.booking.offerPrice) : 1000;
      const next = Math.max(0, Math.min(99999, Math.round(cur) + delta));
      ui.booking.offerPrice = next;
      const cardOffers = ui.cardOffers || (ui.cardOffers = {});
      if (ui.booking.tutorId && ui.booking.mode !== "trial") cardOffers[ui.booking.tutorId] = next;
      const modalRoot = $("#modal-root");
      const liveInput = typeof document.getElementById === "function" ? document.getElementById("bid-price") : null;
      if (modalRoot && typeof modalRoot.contains === "function" && liveInput && modalRoot.contains(liveInput)) {
        updateBookingModalLive();
      } else {
        renderModal();
      }
    },
    "book-submit": () => {
      if (!ui.booking || !TDATA) return;
      const b = ui.booking;
      const tutor = TDATA.LIST.find((x) => x.id === b.tutorId);
      if (!tutor) return;
      const st = mkt();
      const mktViews = EGE.views && EGE.views.marketplace;
      const gInfo = mktViews && typeof mktViews.resolveTutorGuarantee === "function"
        ? mktViews.resolveTutorGuarantee(tutor)
        : { enabled: !!tutor.firstLessonGuarantee };
      const hasGuarantee = !!gInfo.enabled;
      const days = TDATA.buildCalendarDays(7);
      const dayObj = days.find((d) => d.iso === b.dayIso) || days[0];
      const daySlots = TDATA.tutorSlotsForDay(tutor, dayObj.dow);
      const hour = isValidHHMM(b.hour) ? b.hour : (daySlots[0] || "10:00");
      const domPriceEl = $("#bid-price");
      const domNoteEl = $("#bid-note");
      const rawPriceVal = domPriceEl && domPriceEl.value !== "" ? Number(String(domPriceEl.value).replace(/\D+/g, "")) : (b.offerPrice != null ? Number(b.offerPrice) : tutor.price);
      const offerPrice = Math.max(0, Math.min(99999, Number.isFinite(rawPriceVal) ? Math.round(rawPriceVal) : tutor.price));
      const noteText = String((domNoteEl ? domNoteEl.value : b.note) || "").trim();
      if (typeof requireAuthForBid === "function" && requireAuthForBid(Object.assign({}, b, { offerPrice, note: noteText }))) {
        return;
      }
      if (offerPrice > 0 && (Number(st.balance) || 0) < offerPrice) {
        const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
        const minTopup = st.initialPaid ? 100 : trialRub;
        const deficit = Math.max(minTopup, offerPrice - (Number(st.balance) || 0));
        const pending = Object.assign({}, b, { mode: "paid", isTrial: false, offerPrice, note: noteText });
        ui.booking = null;
        const cards = Array.isArray(st.savedCards) ? st.savedCards : (st.savedCard && st.savedCard.last4 ? [st.savedCard] : []);
        ui.cardBindModal = null;
        ui.balanceModal = {
          method: "sbp",
          selectedCardId: (cards[0] && cards[0].id) || "",
          customAmount: deficit,
          error: "",
          reason: `Нужно пополнить баланс для отправки заявки преподавателю (${offerPrice.toLocaleString("ru-RU")} ₽/ч).`,
          pendingBooking: pending
        };
        renderModal();
        return;
      }
      const feeSplit = typeof TDATA.commissionSplit === "function"
        ? TDATA.commissionSplit(offerPrice)
        : { total: offerPrice, fee: Math.round(offerPrice * 0.05), payout: offerPrice - Math.round(offerPrice * 0.05), pct: 5 };
      let reserved = 0;
      if (offerPrice > 0 && st.balance >= offerPrice) {
        reserved = offerPrice;
        st.balance -= reserved;
      }
      const newBooking = {
        id: "bk-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
        tutorId: tutor.id,
        tutorName: tutor.name,
        subjectName: tutor.subjectName,
        exam: b.exam || tutor.exams[0],
        format: b.format || tutor.formats[0],
        dayIso: dayObj.iso,
        dow: dayObj.dow,
        dayLabel: dayObj.shortLabel,
        hour,
        offerPrice,
        isTrial: false,
        firstLessonGuarantee: hasGuarantee,
        fee: feeSplit.fee,
        payout: feeSplit.payout,
        tutorPrice: tutor.price,
        note: noteText,
        reserved,
        status: "pending",
        createdAt: Date.now()
      };
      st.bookings.unshift(newBooking);
      ui.booking = null;
      if (ui.view === "landing" && ui.role !== "tutor" && ui.role !== "admin") {
        ui.view = "market";
        if (typeof writeHash === "function") writeHash();
      }
      saveMkt();
      if (EGE.views.marketplace && typeof EGE.views.marketplace.publishStudentBid === "function") {
        EGE.views.marketplace.publishStudentBid(newBooking, tutor);
      } else if (EGE.realtime && typeof EGE.realtime.publish === "function") {
        EGE.realtime.publish({
          channel: "tutor",
          eventType: "market.bid.created",
          title: "Новая ставка от ученика",
          message: `${tutor.name} · ${dayObj.shortLabel}, ${hour} (${offerPrice.toLocaleString("ru-RU")} ₽/ч)`,
          tutorSlug: String(tutor.id || ""),
          payload: Object.assign({}, newBooking)
        });
      }
      renderModal();
      const gNote = hasGuarantee ? " · возврат за 1-й урок при отказе" : "";
      notifySide(
        "Предложение передано преподавателю",
        `Написали ему в мессенджер (WhatsApp, Telegram, MAX) — когда ответит, мы напишем вам уведомление в WhatsApp, Telegram или MAX · ставка ${offerPrice.toLocaleString("ru-RU")} ₽/ч${reserved ? ` · в резерве ${reserved.toLocaleString("ru-RU")} ₽` : ""}${gNote}`
      );
      scheduleRender();
    },
    "demo-tab": (el) => {
      if (!el.dataset.tab) return;
      ui.demo.tab = el.dataset.tab;
      scheduleRender();
    },
    "demo-subj": (el) => {
      if (!el.dataset.sid) return;
      ui.demo.sid = el.dataset.sid;
      ui.demo.qIdx = 0;
      ui.demo.pick = null;
      ui.demo.revealed = false;
      ui.demo.topicIdx = 0;
      scheduleRender();
    },
    "demo-pick": (el) => {
      const idx = Number(el.dataset.i);
      if (!Number.isFinite(idx)) return;
      ui.demo.pick = idx;
      ui.demo.revealed = true;
      scheduleRender();
    },
    "demo-next": () => {
      ui.demo.qIdx = (ui.demo.qIdx || 0) + 1;
      ui.demo.pick = null;
      ui.demo.revealed = false;
      scheduleRender();
    },
    "demo-topic": (el) => {
      ui.demo.topicIdx = Math.max(0, Number(el.dataset.i) || 0);
      scheduleRender();
    },
    "demo-rate": (el) => {
      const r = el.dataset.rate != null ? Number(el.dataset.rate) : 1000;
      ui.demo.bidRate = Math.max(0, Math.min(99999, Number.isFinite(r) ? r : 1000));
      if (!EGE.views.landing || typeof EGE.views.landing.patchDemoCalcDOM !== "function" || !EGE.views.landing.patchDemoCalcDOM()) {
        scheduleRender();
      }
    },
    "demo-step": (el) => {
      const step = Number(el.dataset.step) || 0;
      const cur = ui.demo.bidRate != null ? Number(ui.demo.bidRate) : 1000;
      ui.demo.bidRate = Math.max(0, Math.min(99999, cur + step));
      if (!EGE.views.landing || typeof EGE.views.landing.patchDemoCalcDOM !== "function" || !EGE.views.landing.patchDemoCalcDOM()) {
        scheduleRender();
      }
    },
    "mkt-sim-accept": (el) => {
      const st = mkt();
      const bk = st.bookings.find((x) => x.id === el.dataset.id);
      if (!bk) return;
      bk.status = "accepted";
      if (!bk.reserved && st.balance >= bk.offerPrice) {
        bk.reserved = bk.offerPrice;
        st.balance -= bk.reserved;
      }
      if (!bk.schedulePlan) {
        const tutor = TDATA && TDATA.LIST ? TDATA.LIST.find((x) => x.id === bk.tutorId) : null;
        const mktMod = EGE.views && EGE.views.marketplace;
        const defaultDows = mktMod && typeof mktMod.suggestTwoDows === "function"
          ? mktMod.suggestTwoDows(bk, tutor)
          : [3, 4];
        bk.schedulePlan = {
          status: "needs_pick",
          dows: defaultDows,
          hour: bk.hour || "16:00",
          weekly: true
        };
      }
      saveMkt();
      toast(`${bk.tutorName} подтвердил(а) занятие — выберите 2 удобных дня и время`);
      scheduleRender();
    },
    "mkt-cancel-book": (el) => {
      const st = mkt();
      const idx = st.bookings.findIndex((x) => x.id === el.dataset.id);
      if (idx < 0) return;
      const bk = st.bookings[idx];
      if (bk.reserved) st.balance += bk.reserved;
      st.bookings.splice(idx, 1);
      saveMkt();
      toast(bk.reserved
        ? `Заявка отменена · ${bk.reserved.toLocaleString("ru-RU")} ₽ возвращены на баланс`
        : "Заявка отменена — можно выбрать другого репетитора");
      scheduleRender();
    },
    "motion-preset": (el) => {
      const id = el.dataset.v;
      const preset = MOTION_PRESETS[id];
      if (!preset) return;
      const dh = preset.defaultHour || 10;
      const slot = String(dh).padStart(2, "0") + ":00";
      if (!ui.motion) ui.motion = { playing: true, preset: id, step: 0, slot, offer: preset.defaultOffer, sent: false, clicking: false, hitTarget: "" };
      ui.motion.preset = id;
      ui.motion.slot = slot;
      ui.motion.offer = preset.defaultOffer;
      ui.motion.sent = false;
      ui.motion.step = 0;
      ui.motion.playing = false;
      ui.motion.clicking = false;
      ui.motion.hitTarget = "";
      stopMotionTimers();
      patchHeroMotionDOM();
    },
    "motion-step-price": (el) => {
      if (!ui.motion) ui.motion = { playing: false, preset: "design", step: 1, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" };
      const meta = heroMotionMeta();
      const step = Number(el.dataset.step) || 0;
      ui.motion.offer = Math.max(meta.minOffer, Math.min(meta.maxOffer, meta.offer + step));
      ui.motion.sent = false;
      ui.motion.step = 1;
      ui.motion.playing = false;
      ui.motion.clicking = false;
      ui.motion.hitTarget = step < 0 ? "minus" : "plus";
      stopMotionTimers();
      patchHeroMotionDOM({ liveOnly: true });
      EGE.views.landing.pulseMotionReset([["#hero-price-minus", "is-hit"], ["#hero-price-plus", "is-hit"]], 280);
    },
    "motion-toggle": () => {
      if (!ui.motion) return;
      ui.motion.playing = !ui.motion.playing;
      if (!ui.motion.playing) stopMotionTimers();
      else { ui.motion.sent = false; ui.motion.step = 0; }
      patchHeroMotionDOM();
    },
    "motion-bid-press": () => {
      if (!ui.motion) ui.motion = { playing: false, preset: "design", step: 2, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" };
      ui.motion.playing = false;
      stopMotionTimers();
      ui.motion.sent = true;
      ui.motion.step = 2;
      ui.motion.clicking = true;
      ui.motion.hitTarget = "bid";
      patchHeroMotionDOM({ liveOnly: true });
      const meta = heroMotionMeta();
      notifySide(
        "Предложение передано преподавателю",
        `${meta.tutor.subjectName}: ставка ${meta.offer.toLocaleString("ru-RU")} ₽/ч на ${meta.slot} отправлена — уведомим об ответе`
      );
      EGE.views.landing.pulseMotionReset([["#hero-motion-bid-btn", "is-pressed"]], 420);
    },
    "motion-book-now": () => {
      const meta = heroMotionMeta();
      if (typeof ACTIONS["book-open"] === "function") {
        ACTIONS["book-open"]({ dataset: { id: meta.tutor.id, hour: meta.slot } });
        if (ui.booking) {
          ui.booking.offerPrice = meta.offer;
          renderModal();
        }
      }
    },
    "hero-cat": (el) => {
      const st = mkt();
      st.subject = el.dataset.subj || "all";
      st.exam = el.dataset.exam || "all";
      st.q = "";
      st.onlyBumped = false;
      st.maxPrice = 2000;
      st.day = "all";
      st.hour = "all";
      saveMkt();
      scheduleRender();
      if (typeof setTimeout === "function") {
        setTimeout(() => scrollToEl("land-market"), 40);
      }
    },
    "save-freq": (el) => {
      if (!ui.savings) ui.savings = { freq: 2, marketRate: 1350, offerRate: 1000 };
      ui.savings.freq = Math.max(1, Math.min(4, Number(el.dataset.v) || 2));
      patchSavingsDOM();
    },
    "save-step": (el) => {
      if (!ui.savings) ui.savings = { freq: 2, marketRate: 1350, offerRate: 1000 };
      const which = el.dataset.which === "mkt" ? "marketRate" : "offerRate";
      const step = Number(el.dataset.step) || 0;
      if (which === "marketRate") {
        const curMkt = ui.savings.marketRate != null ? Number(ui.savings.marketRate) : 1350;
        ui.savings.marketRate = Math.max(0, Math.min(99999, curMkt + step));
        const curOff = ui.savings.offerRate != null ? Number(ui.savings.offerRate) : 1000;
        if (curOff > Math.max(0, ui.savings.marketRate - 50)) {
          ui.savings.offerRate = Math.max(0, ui.savings.marketRate - 50);
        }
      } else {
        const cap = Math.max(0, (ui.savings.marketRate != null ? Number(ui.savings.marketRate) : 1350) - 50);
        const curOff = ui.savings.offerRate != null ? Number(ui.savings.offerRate) : 1000;
        ui.savings.offerRate = Math.max(0, Math.min(cap, curOff + step));
      }
      patchSavingsDOM();
    },
    "bb-mode": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.mode = ["both", "light", "dark"].includes(el.dataset.v) ? el.dataset.v : "both";
      scheduleRender();
    },
    "bb-step": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const step = Number(el.dataset.step) || 0;
      const cur = bb.price != null ? Number(bb.price) : 1200;
      bb.price = Math.max(0, Math.min(99999, cur + step));
      bb.sent = false;
      scheduleRender();
    },
    "bb-preset": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const p = Number(el.dataset.price);
      bb.price = Math.max(0, Math.min(99999, Number.isFinite(p) ? p : 1200));
      bb.sent = false;
      scheduleRender();
    },
    "bb-day": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const d = el.dataset.v;
      if (["all", "sat", "sun", "mon"].includes(d)) bb.day = d;
      scheduleRender();
    },
    "bb-slider-style": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      const s = el.dataset.v;
      if (["clean", "ticks", "ruler"].includes(s)) bb.sliderStyle = s;
      scheduleRender();
    },
    "bb-bounds-toggle": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.showBounds = bb.showBounds === false;
      scheduleRender();
    },
    "bb-chip": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.chipOn = !bb.chipOn;
      scheduleRender();
    },
    "bb-fav": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true });
      bb.fav = bb.fav === false;
      scheduleRender();
    },
    "bb-bid": () => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
      bb.sent = !bb.sent;
      const hhStr = String(bb.hour || 14).padStart(2, "0") + ":00";
      if (bb.sent) {
        notifySide(
          "Предложение передано преподавателю",
          `Ставка ${bb.price.toLocaleString("ru-RU")} ₽/ч на ${hhStr} отправлена — уведомим об ответе`
        );
      }
      const btns = typeof document.querySelectorAll === "function" ? document.querySelectorAll('[data-a="bb-bid"]') : null;
      if (btns && btns.length) {
        btns.forEach((btn) => {
          const isShort = !!(btn.dataset && btn.dataset.bbShort);
          if (btn.classList) btn.classList.toggle("is-confirmed", !!bb.sent);
          const lbl = btn.querySelector && (btn.querySelector("[data-bid-lbl]") || btn.querySelector("span"));
          if (lbl) {
            lbl.textContent = isShort
              ? (bb.sent ? "✓ Подтверждено" : "Сөп · Предложить")
              : bidBtnLabelHTML(bb.sent, bb.price);
          } else if (EGE.hh && typeof EGE.hh.sakhaBidInnerHTML === "function") {
            btn.innerHTML = EGE.hh.sakhaBidInnerHTML(bb.sent, bb.price, isShort ? { short: true, size: 15 } : undefined);
          } else {
            btn.textContent = isShort
              ? (bb.sent ? "✓ Подтверждено" : "Сөп · Предложить")
              : bidBtnLabelHTML(bb.sent, bb.price);
          }
        });
        document.querySelectorAll('[data-bb="bid-status"]').forEach((st) => {
          if (st.classList) st.classList.toggle("sent", !!bb.sent);
          st.innerHTML = bb.sent
            ? (EGE.kit && typeof EGE.kit.sentNoticeHTML === "function"
                ? EGE.kit.sentNoticeHTML({ slot: hhStr, offer: bb.price, badgeText: "Уведомим" })
                : "Предложение передано преподавателю · Уведомим")
            : `<span class="small muted">Обычное состояние CTA · Узор Саха</span><span class="chip notif">Уведомим оранжевым</span>`;
        });
      } else {
        scheduleRender();
      }
    },
    "bb-vp": (el) => {
      const w = Number(el.dataset.w) || 390;
      const vpEl = typeof document.getElementById === "function" ? document.getElementById("bb-resp-viewport") : null;
      applyBrandbookViewport(w);
      if (!vpEl) scheduleRender();
    },
    "bb-icon-play": (el) => {
      const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
      const ic = (el.dataset && el.dataset.icon) || "bell";
      const label = (el.dataset && el.dataset.label) || ic;
      const animDesc = (el.dataset && el.dataset.animDesc) || "Анимация";
      bb.activeIcon = ic;
      const tiles = typeof document.querySelectorAll === "function" ? document.querySelectorAll(".bb-icon-tile") : null;
      if (tiles && tiles.length) {
        tiles.forEach((tile) => {
          const isMe = tile === el || (tile.dataset && tile.dataset.icon === ic);
          if (tile.classList) {
            tile.classList.toggle("is-active", isMe);
            if (!isMe) tile.classList.remove("is-anim");
          }
          if (typeof tile.setAttribute === "function") tile.setAttribute("aria-pressed", isMe ? "true" : "false");
        });
        triggerIconTileAnim(el);
        document.querySelectorAll('[data-bb="icon-status"]').forEach((st) => {
          st.textContent = label + " · " + animDesc;
        });
      } else {
        scheduleRender();
      }
    },
    "bb-icons-wave": () => {
      const tiles = typeof document.querySelectorAll === "function" ? document.querySelectorAll(".bb-icon-tile") : null;
      if (tiles && tiles.length) {
        document.querySelectorAll('[data-bb="icon-status"]').forEach((st) => {
          st.textContent = "Каскад · " + tiles.length + " анимаций";
        });
        tiles.forEach((tile, idx) => {
          const run = () => triggerIconTileAnim(tile);
          if (typeof setTimeout === "function") setTimeout(run, idx * 24);
          else run();
        });
      } else {
        const bb = ui.brandbook || (ui.brandbook = { mode: "both", hour: 14, price: 1200, day: "all", sliderStyle: "ticks", showBounds: true, chipOn: true, sent: false, fav: true, vpWidth: 390 });
        bb.activeIcon = "spark";
        scheduleRender();
      }
    },
    "bb-copy-token": (el) => {
      const txt = (el.dataset && el.dataset.copy) || "";
      if (!txt) return;
      copyTextSafe(txt);
      toast("Скопировано: " + txt);
    },
    "bb-switch": (el) => {
      bbState().switchVal = el.dataset.v || "online";
      scheduleRender();
    },
    "bb-plan-pick": (el) => {
      bbState().pickedPlan = el.dataset.v || "month10k";
      scheduleRender();
    },
    "bb-quiz-opt": (el) => {
      const idx = Number(el.dataset.i);
      bbState().quizOpt = Number.isFinite(idx) ? idx : 0;
      scheduleRender();
    },
    "match-subj-toggle": () => {
      const lm = ui.landMatch || (ui.landMatch = { subject: "all", tier: "below", hour: "all", menuOpen: false });
      lm.menuOpen = !lm.menuOpen;
      scheduleRender();
    },
    "match-subj-pick": (el) => {
      const lm = ui.landMatch || (ui.landMatch = { subject: "all", tier: "below", hour: "all", menuOpen: false });
      lm.subject = el.dataset.v || "all";
      lm.menuOpen = false;
      scheduleRender();
    },
    "match-tier": (el) => {
      const lm = ui.landMatch || (ui.landMatch = { subject: "all", tier: "below", hour: "all", menuOpen: false });
      lm.tier = ["below", "budget", "pro"].includes(el.dataset.v) ? el.dataset.v : "below";
      scheduleRender();
    },
    "match-hour": (el) => {
      const lm = ui.landMatch || (ui.landMatch = { subject: "all", tier: "below", hour: "all", menuOpen: false });
      lm.hour = el.dataset.v || "all";
      scheduleRender();
    },
    "match-apply": () => {
      const lm = ui.landMatch || { subject: "all", tier: "below", hour: "all" };
      const st = mkt();
      st.subject = lm.subject || "all";
      st.maxPrice = lm.tier === "budget" ? 1200 : 2000;
      st.hour = lm.hour || "all";
      st.day = "all";
      st.exam = "all";
      st.q = "";
      st.onlyBumped = false;
      st.sort = lm.tier === "pro" ? "rating_desc" : "price_asc";
      saveMkt();
      scheduleRender();
      if (typeof setTimeout === "function") setTimeout(() => scrollToEl("land-market"), 40);
      const cnt = EGE.views.landing && EGE.views.landing.computeQuickMatchMeta ? EGE.views.landing.computeQuickMatchMeta().filtered.length : 0;
      notifySide("Подборка применена", `Показано анкет по твоим условиям: ${cnt}`);
    },
    "land-ai-subj": (el) => {
      ui.landAiSubj = ["bio", "chem", "rus"].includes(el.dataset.v) ? el.dataset.v : "bio";
      scheduleRender();
    },
    "land-faq": (el) => {
      const idx = Number(el.dataset.i);
      const cur = ui.landFaqOpen === undefined ? 0 : ui.landFaqOpen;
      ui.landFaqOpen = cur === idx ? -1 : idx;
      scheduleRender();
    },
    "tutor-apply-open": () => {
      if (!ui.tutorApply) ui.tutorApply = { name: "", subject: "eng", rate: 1100, contact: "", error: "" };
      ui.tutorApply.error = "";
      ui.tutorApplyModal = true;
      renderModal();
    },
    "tutor-apply-close": () => {
      ui.tutorApplyModal = false;
      renderModal();
    },
    "tutor-apply-step": (el) => {
      if (!ui.tutorApply) ui.tutorApply = { name: "", subject: "eng", rate: 1100, contact: "", error: "" };
      const nm = $("#ta-name"), ct = $("#ta-contact"), sb = $("#ta-subj");
      if (nm) ui.tutorApply.name = nm.value;
      if (ct) ui.tutorApply.contact = ct.value;
      if (sb) ui.tutorApply.subject = sb.value;
      const step = Number(el.dataset.step) || 0;
      const cur = ui.tutorApply.rate != null ? Number(ui.tutorApply.rate) : 1100;
      ui.tutorApply.rate = Math.max(0, Math.min(99999, cur + step));
      renderModal();
    },
    "bb-subj-toggle": () => {
      const bb = bbState();
      bb.subjMenuOpen = !bb.subjMenuOpen;
      scheduleRender();
    },
    "bb-subj-pick": (el) => {
      const bb = bbState();
      bb.subj = el.dataset.v || "bio";
      bb.subjMenuOpen = false;
      scheduleRender();
    },
    "bb-multi-toggle": () => {
      const bb = bbState();
      bb.multiMenuOpen = !bb.multiMenuOpen;
      scheduleRender();
    },
    "bb-multi-pick": (el) => {
      const bb = bbState();
      const id = String(el.dataset.v || "").trim();
      if (!id) return;
      const list = Array.isArray(bb.multiSubjs) ? bb.multiSubjs.slice() : ["bio", "chem"];
      const idx = list.indexOf(id);
      if (idx >= 0) {
        if (list.length <= 1) { toast("Должен остаться хотя бы 1 предмет"); return; }
        list.splice(idx, 1);
      } else {
        list.push(id);
      }
      bb.multiSubjs = list;
      scheduleRender();
    },
    "bb-preview-toast-close": () => {
      const box = typeof document.querySelector === "function" ? document.querySelector('[data-swipe-toast="preview"]') : null;
      if (box && box.classList) {
        box.classList.add("is-dismissing");
        setTimeout(() => { bbState().previewToastDismissed = true; scheduleRender(); }, 190);
      } else {
        bbState().previewToastDismissed = true;
        scheduleRender();
      }
    },
    "bb-preview-toast-reset": () => {
      bbState().previewToastDismissed = false;
      scheduleRender();
    },
    "bb-cancel-demo": () => {
      const bb = bbState();
      bb.cancelDemoUndone = !bb.cancelDemoUndone;
      scheduleRender();
      notifySide(
        bb.cancelDemoUndone ? "Запись отменена" : "Запись восстановлена",
        bb.cancelDemoUndone
          ? "Спокойный янтарный режим · смахни влево или нажми ×"
          : "Возвращено в активный опасный режим (--bad)"
      );
    },
    "bb-demo-toast": () => {
      const bb = bbState();
      const hhStr = String(bb.hour || 14).padStart(2, "0") + ":00";
      notifySide("Демо бокового уведомления", `Ставка ${bb.price.toLocaleString("ru-RU")} ₽/ч на ${hhStr} отправлена преподавателю`);
    },
    "bb-sakha-toggle": () => {
      const bb = bbState();
      bb.sakhaSent = !bb.sakhaSent;
      if (bb.sakhaSent) {
        notifySide("Сөп · Ставка отправлена", "Узорная кнопка Оһуор перешла в подтверждённый статус .is-confirmed");
      }
      scheduleRender();
    },
    "bb-sakha-medallion": () => {
      const bb = bbState();
      bb.sakhaKunOn = !bb.sakhaKunOn;
      notifySide(bb.sakhaKunOn ? "Күн Оһуор · Активен" : "Күн Оһуор · Сброшен", "Солнечный медальон в стиле Саха (.sakha-medallion-btn)");
      scheduleRender();
    },
    "bb-sakha-diamond": () => {
      const bb = bbState();
      bb.sakhaStarOn = !bb.sakhaStarOn;
      notifySide(bb.sakhaStarOn ? "Сулус · Ромб выбран" : "Сулус · Сброшен", "Геометрический узор 8-лучевой звезды (.sakha-diamond-btn)");
      scheduleRender();
    },
    "bb-faq-toggle": (el) => {
      const idx = Number(el.dataset.i);
      const bb = bbState();
      bb.faqOpen = bb.faqOpen === idx ? -1 : idx;
      scheduleRender();
    },
    "land-sakha-pattern": () => {
      ui.landSakhaSent = !ui.landSakhaSent;
      if (ui.landSakhaSent) {
        notifySide("Сөп · Предложение передано", "Узорная кнопка Оһуор перешла в статус .is-confirmed — уведомим об ответе преподавателя");
      }
      scheduleRender();
    },
    "land-sakha-medallion": () => {
      ui.landKunActive = !ui.landKunActive;
      const st = mkt();
      st.subject = "all";
      st.exam = "all";
      st.format = "all";
      st.day = "all";
      st.hour = "all";
      st.q = "";
      st.maxPrice = ui.landKunActive ? 1400 : 2000;
      st.sort = "price_asc";
      saveMkt();
      scheduleRender();
      notifySide("Күн Оһуор · Анкеты Саха и РФ", ui.landKunActive ? "Выборка до 1 400 ₽/ч (Доска Ykt, Telegram, WhatsApp, MAX)" : "Фильтр солнечного медальона сброшен");
    },
    "land-sakha-diamond": () => {
      ui.landStarActive = !ui.landStarActive;
      const preset = ui.landStarActive ? "inf" : "design";
      if (ACTIONS["motion-preset"]) ACTIONS["motion-preset"]({ dataset: { v: preset } });
      scheduleRender();
      notifySide("Сулус · Звёздный фильтр Саха", ui.landStarActive ? "Включён трек Информатика КЕГЭ в живой карточке" : "Возвращён трек UX/UI и Figma");
    },
    "bb-modal-open": () => {
      ui.bbModal = true;
      renderModal();
    },
    "bb-modal-close": () => {
      ui.bbModal = false;
      renderModal();
    },
    "go-fees": () => {
      ui.booking = null;
      renderModal();
      go("fees");
    },
    "bb-cat": (el) => {
      bbState().cat = el.dataset.v || "all";
      scheduleRender();
    },
    "bb-cat-clear": () => {
      const bb = bbState();
      bb.cat = "all";
      bb.catQ = "";
      ui.focusNext = "bb-catalog-q";
      scheduleRender();
    },
    "bb-hero-primary": () => {
      const bb = bbState();
      bb.heroSubmitted = !bb.heroSubmitted;
      scheduleRender();
      notifySide("Hero CTA · Найти ниже рынка", bb.heroSubmitted ? "Кнопка на фото перешла в статус .is-confirmed" : "Возврат в золото Саха");
    },
    "bb-hero-submit": () => ACTIONS["bb-hero-primary"](),
    "bb-hero-beta": () => {
      const bb = bbState();
      bb.heroBetaOn = !bb.heroBetaOn;
      scheduleRender();
      notifySide("Hero CTA №2 · Бета-тест", bb.heroBetaOn ? "Кнопка бета-теста на фото -> .is-confirmed" : "Возврат в полупрозрачный контур на фото");
    },
    "bb-logo-dl": (el) => {
      const surface = (el.dataset && el.dataset.surface) || "light";
      const kind = (el.dataset && el.dataset.kind) || "lockup";
      const svg = EGE.ui && typeof EGE.ui.brandLogoSVG === "function" ? EGE.ui.brandLogoSVG(surface, kind) : "";
      if (!svg) return;
      const filename = `vektor-ege-${kind}-${surface}.svg`;
      try {
        if (typeof Blob === "function" && typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
          const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
          const href = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = href;
          a.download = filename;
          document.body.appendChild(a);
          a.click();
          a.remove();
          if (typeof URL.revokeObjectURL === "function") setTimeout(() => URL.revokeObjectURL(href), 500);
        }
      } catch (e) { /* в тестовом окружении скачивание файла пропускается */ }
      bbState().lastExportedSvg = svg;
      toast("Скачан " + filename);
      notifySide("Экспорт SVG · Вектор ЕГЭ", `Файл ${filename} (${surface}, ${kind})`);
    },
    "bb-logo-copy": (el) => {
      const surface = (el.dataset && el.dataset.surface) || "light";
      const kind = (el.dataset && el.dataset.kind) || "lockup";
      const svg = EGE.ui && typeof EGE.ui.brandLogoSVG === "function" ? EGE.ui.brandLogoSVG(surface, kind) : "";
      if (!svg) return;
      copyTextSafe(svg);
      bbState().lastExportedSvg = svg;
      toast(`SVG (${surface}) скопирован`);
      notifySide("SVG в буфере", `Векторный ${kind} для поверхности «${surface}» скопирован`);
    },
    "bb-export-tokens": (el) => {
      const fmt = (el.dataset && el.dataset.fmt) === "json" ? "json" : "css";
      const payload = buildBrandbookTokensExport(fmt);
      copyTextSafe(payload);
      bbState().lastExportedTokens = { fmt, payload };
      toast(fmt === "json" ? "Скопирован tokens.json" : "Скопирован :root CSS");
      notifySide(fmt === "json" ? "Экспорт tokens.json" : "Экспорт :root CSS", `Токены (${payload.length} симв.) скопированы в буфер`);
    },
    "bb-app-role": (el) => {
      bbState().appRole = el.dataset && el.dataset.role === "tutor" ? "tutor" : "student";
      scheduleRender();
    },
    "bb-market-req-toggle": () => {
      const bb = bbState();
      bb.marketDemoAccepted = !bb.marketDemoAccepted;
      scheduleRender();
      notifySide(
        "Отклик /market · Состояние",
        bb.marketDemoAccepted ? "Статус «Преподаватель подтвердил» → открыт чат" : "Статус «На рассмотрении · уведомим» → кнопка «Отменить»"
      );
    },
    "bb-reduced-toggle": () => {
      const bb = bbState();
      bb.reducedMotion = !bb.reducedMotion;
      try {
        if (document.documentElement && document.documentElement.classList) {
          document.documentElement.classList.toggle("reduced-motion", !!bb.reducedMotion);
        }
      } catch (e) { /* игнор */ }
      scheduleRender();
      toast(bb.reducedMotion ? "prefers-reduced-motion: ВКЛ" : "Анимации восстановлены");
      notifySide("Доступность · Motion", bb.reducedMotion ? "Анимации отключены (html.reduced-motion)" : "Плавные переходы и hover-эффекты активны");
    },
    "bb-reduced-motion": () => ACTIONS["bb-reduced-toggle"](),
    "bb-mask-sample": (el) => {
      const bb = bbState();
      const fmtP = EGE.kit && EGE.kit.formatPhoneMask;
      const fmtTg = EGE.kit && EGE.kit.formatTelegramContact;
      const rawP = (el.dataset && el.dataset.phone) || "+7 (914) 210-05-11";
      const rawTg = (el.dataset && el.dataset.tg) || "@aytal_bio";
      const rawMax = (el.dataset && el.dataset.max) || "aytal_ege";
      bb.maskPhone = typeof fmtP === "function" ? (fmtP(rawP) || rawP) : rawP;
      bb.maskTg = typeof fmtTg === "function" ? (fmtTg(rawTg) || rawTg) : rawTg;
      bb.maskMax = rawMax;
      scheduleRender();
    },
    "bb-pay-threshold": (el) => {
      const bb = bbState();
      bb.payInitialDone = !!(el.dataset && el.dataset.v === "repeat");
      scheduleRender();
    },
    "bb-pay-method": (el) => {
      const bb = bbState();
      const m = (el.dataset && el.dataset.v) || "sbp";
      bb.payMethod = ["sbp", "card", "tpay"].includes(m) ? m : "sbp";
      scheduleRender();
    },
    "bb-pay-state": (el) => {
      const bb = bbState();
      const s = (el.dataset && el.dataset.v) || "frozen";
      bb.payState = ["frozen", "captured", "refunded"].includes(s) ? s : "frozen";
      scheduleRender();
    },
    "bb-essay-tab": (el) => {
      const bb = bbState();
      const idx = Number(el.dataset && (el.dataset.idx !== undefined ? el.dataset.idx : el.dataset.v));
      bb.essayOpenIdx = Number.isInteger(idx) ? Math.max(0, Math.min(2, idx)) : 0;
      scheduleRender();
    },
    "bb-bal-toggle": () => {
      const bb = bbState();
      bb.balFunded = bb.balFunded === false;
      scheduleRender();
      toast(bb.balFunded ? "Баланс: 5 000 ₽ · пробный урок 0 ₽ открыт" : "Баланс: 0 ₽ · требуется первый взнос от 5 000 ₽");
      notifySide("Баланс · Стенд", bb.balFunded ? "Первый порог 5 000 ₽ пройден — доступны пополнения от 100 ₽ и бесплатный пробный урок" : "Начальный баланс 0 ₽: запись на пробный 0 ₽ заблокирована до внесения 5 000 ₽");
    },
    "bb-chart-style": (el) => {
      const bb = bbState();
      bb.chartStyle = (el.dataset && el.dataset.v) || "sticks";
      scheduleRender();
      toast("Вид графика: " + bb.chartStyle);
      notifySide("График с палочками", `Выбран стиль «${bb.chartStyle}» — обновлён в кабинете и стенде`);
    },
    "bb-chart-data": (el) => {
      const bb = bbState();
      bb.chartDataset = (el.dataset && el.dataset.v) || "income";
      scheduleRender();
      toast("Набор данных графика обновлён");
    },
    "bb-chart-bar": (el) => {
      const bb = bbState();
      bb.chartActiveIdx = Math.max(0, Math.min(59, Number(el.dataset && el.dataset.idx) || 0));
      scheduleRender();
      toast("Выбран столбик №" + (bb.chartActiveIdx + 1));
    },
    "bb-line-pt": (el) => {
      const bb = bbState();
      bb.linePtIdx = Math.max(0, Math.min(59, Number(el.dataset && el.dataset.idx) || 0));
      scheduleRender();
      toast("Точка линии №" + (bb.linePtIdx + 1));
    },
    "bb-donut-ds": (el) => {
      const bb = bbState();
      bb.donutDataset = (el.dataset && el.dataset.v) || "channels";
      bb.donutSliceIdx = 0;
      scheduleRender();
      toast("Срез диаграммы обновлён");
    },
    "bb-donut-slice": (el) => {
      const bb = bbState();
      bb.donutSliceIdx = Math.max(0, Math.min(3, Number(el.dataset && el.dataset.idx) || 0));
      scheduleRender();
    },
    "bb-tbl-cols": (el) => {
      const bb = bbState();
      bb.tableCols = clampInt(Number(el.dataset && el.dataset.cols) || 5, 1, 15, 5);
      scheduleRender();
      toast("Колонок в таблице: " + bb.tableCols);
    },
    "bb-tbl-preset": (el) => {
      const bb = bbState();
      const p = (el.dataset && (el.dataset.preset || el.dataset.v)) || "requests";
      bb.tablePreset = ["requests", "students", "payouts", "exams", "admin"].includes(p) ? p : "requests";
      bb.tableFilter = "all";
      bb.tableSearch = "";
      scheduleRender();
      toast("Пресет таблицы: " + bb.tablePreset);
    },
    "bb-tbl-confirm": (el) => {
      const bb = bbState();
      const rowId = el.dataset && el.dataset.id;
      if (!rowId) return;
      if (!bb.confirmedRows || typeof bb.confirmedRows !== "object") bb.confirmedRows = {};
      const on = !bb.confirmedRows[rowId];
      if (on) bb.confirmedRows[rowId] = true;
      else delete bb.confirmedRows[rowId];
      scheduleRender();
      notifySide(
        on ? "Запись подтверждена ✓" : "Подтверждение сброшено",
        on ? `Запись ${rowId} переведена в статус «Подтверждено ✓»` : `Запись ${rowId} возвращена в исходный статус`
      );
    },
    "bb-tbl-step": (el) => {
      const bb = bbState();
      const rowId = el.dataset && el.dataset.id;
      if (!rowId) return;
      const step = Number(el.dataset && el.dataset.step) || 0;
      const presets = (EGE.charts && EGE.charts.TABLE_PRESETS) || {};
      const preset = presets[bb.tablePreset || "requests"] || presets.requests;
      const rows = preset && Array.isArray(preset.rows) ? preset.rows : [];
      const row = rows.find((r) => r && r.id === rowId);
      const base = (bb.tableRates && Number(bb.tableRates[rowId]) > 0)
        ? Number(bb.tableRates[rowId])
        : (row && (Number(row.rate) || Number(row.gross)) || 1200);
      if (!bb.tableRates || typeof bb.tableRates !== "object") bb.tableRates = {};
      bb.tableRates[rowId] = Math.max(0, Math.min(99999, Math.round(base / 50) * 50 + step));
      scheduleRender();
    },
    "bb-tbl-filter": (el) => {
      const bb = bbState();
      bb.tableFilter = (el.dataset && el.dataset.v) || "all";
      if (el.dataset && el.dataset.clearQ) bb.tableSearch = "";
      scheduleRender();
    },
    "bb-shell-role": (el) => {
      const bb = bbState();
      bb.shellRole = (el.dataset && (el.dataset.role === "student" || el.dataset.v === "student")) ? "student" : "tutor";
      scheduleRender();
    },
    "bb-pipe-filter": (el) => {
      const bb = bbState();
      const v = (el.dataset && el.dataset.v) || "all";
      bb.pipeFilter = ["all", "postgres", "polars", "airflow", "kafka"].includes(v) ? v : "all";
      scheduleRender();
    },
    "bb-cal-tz": (el) => {
      const bb = bbState();
      bb.calTz = (el.dataset && el.dataset.v === "UTC+3") ? "UTC+3" : "UTC+9";
      scheduleRender();
    },
    "fees-rate": (el) => {
      const r = Number(el.dataset.rate);
      ui.feesRate = Math.max(0, Math.min(99999, Number.isFinite(r) ? r : 800));
      scheduleRender();
    }
    });

    const api = {
      BB_EXPORT_SCHEMA,
      bbState,
      buildBrandbookTokensExport,
      copyTextSafe,
      cssVarsBlock,
      patchMaskTrainerDOM,
      applyBrandbookViewport
    };
    EGE.marketBb = Object.assign(EGE.marketBb || {}, api);
    return api;
  }

  EGE.marketBb = {
    BB_EXPORT_SCHEMA,
    cssVarsBlock,
    copyTextSafe,
    buildBrandbookTokensExport
  };
  EGE.registerMarketBbActions = registerMarketBbActions;
})();
