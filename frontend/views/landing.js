/* Витрина /landing: интерактивный моушен-подбор репетитора, бегущие ленты, калькулятор выгоды и бета-тест. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, rich, plural, initials } = EGE.utils;
  const { icon, sakhaPatternSVG, sakhaOhyorHTML, BRAND_MARK_HTML, brandLockupHTML } = EGE.ui;
  const { bidBtnLabelHTML, sakhaBidInnerHTML, priceHeadlineHTML, priceDiffTagsHTML, sliderTicksHTML, hhSelectHTML } = EGE.hh;
  const {
    heroBannerHTML,
    sentNoticeHTML,
    marqueePillsHTML,
    rateBenchCardHTML,
    trustStripHTML,
    reviewCardHTML,
    faqListHTML
  } = EGE.kit;

  let _ctx = {};
  let _stickyObserver = null;
  let _heroCopyIdx = (() => {
    try {
      const variants = (EGE.kit && Array.isArray(EGE.kit.HERO_COPY_VARIANTS)) ? EGE.kit.HERO_COPY_VARIANTS : [];
      const total = variants.length || 5;
      if (typeof sessionStorage !== "undefined" && sessionStorage && typeof sessionStorage.getItem === "function") {
        const raw = sessionStorage.getItem("vektor:hero-copy-idx");
        const next = raw == null ? 0 : ((Number(raw) + 1) % total);
        sessionStorage.setItem("vektor:hero-copy-idx", String(next));
        return next;
      }
    } catch (e) { /* игнор без sessionStorage */ }
    return 0;
  })();

  function getHeroVariant() {
    return _heroCopyIdx;
  }

  function nextHeroVariant() {
    const variants = (EGE.kit && Array.isArray(EGE.kit.HERO_COPY_VARIANTS)) ? EGE.kit.HERO_COPY_VARIANTS : [];
    const total = variants.length || 5;
    _heroCopyIdx = (_heroCopyIdx + 1) % total;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage && typeof sessionStorage.setItem === "function") {
        sessionStorage.setItem("vektor:hero-copy-idx", String(_heroCopyIdx));
      }
    } catch (e) { /* игнор */ }
    return _heroCopyIdx;
  }

  function configure(ctx) {
    _ctx = ctx || {};
  }

  function getTDATA() {
    return _ctx.TDATA || EGE.tutors || null;
  }

  function getUi() {
    return _ctx.ui || {};
  }

  const MOTION_PRESETS = {
    design: { id: "design", label: "UX/UI и Figma", short: "UX/UI-дизайн", tutorId: "tut-kovalev", fallbackName: "Денис Ковалёв", role: "Figma · дизайн-системы · портфолио", defaultHour: 10, defaultOffer: 1200 },
    eng: { id: "eng", label: "Английский", short: "Английский", tutorId: "tut-sokolova", fallbackName: "Анна Соколова", role: "ЕГЭ 90+ · ОГЭ · разговорный", defaultHour: 12, defaultOffer: 1200 },
    inf: { id: "inf", label: "Python и IT", short: "Python / КЕГЭ", tutorId: "tut-lebedev", fallbackName: "Роман Лебедев", role: "Python · алгоритмы · №24–27", defaultHour: 16, defaultOffer: 1300 },
    music: { id: "music", label: "Вокал и гитара", short: "Вокал и гитара", tutorId: "tut-melnikova", fallbackName: "Алина Мельникова", role: "Постановка голоса · акустика", defaultHour: 18, defaultOffer: 900 }
  };
  const MOTION_ORDER = ["design", "eng", "inf", "music"];
  let motionTimer = null;
  let motionPulseTimer = null;

  function parseHourInt(slot) {
    const n = parseInt(String(slot || "10").split(":")[0], 10);
    return Number.isFinite(n) ? Math.max(10, Math.min(20, n)) : 10;
  }

  function heroMotionMeta() {
    const ui = getUi();
    const TDATA = getTDATA();
    const m = ui.motion || (ui.motion = { playing: true, preset: "design", step: 0, slot: "10:00", offer: 1200, sent: false, clicking: false, hitTarget: "" });
    const preset = MOTION_PRESETS[m.preset] || MOTION_PRESETS.design;
    const list = TDATA && TDATA.LIST ? TDATA.LIST : [];
    const tutor = list.find((t) => t.id === preset.tutorId) || list[0] || {
      id: preset.tutorId,
      name: preset.fallbackName,
      subject: preset.id,
      subjectName: preset.label,
      source: "Доска Ykt · Telegram · MAX",
      price: 1200,
      marketPrice: 2000,
      minFair: 900,
      belowPct: 40,
      whatsapp: "79142100100"
    };
    const market = tutor.marketPrice || Math.round(((tutor.price || 1200) * 1.45) / 50) * 50;
    const tutorPrice = tutor.price || 1200;
    const minOffer = 0;
    const maxOffer = 99999;
    const rawOffer = m.offer != null ? Number(m.offer) : (preset.defaultOffer || tutorPrice);
    const offer = Math.max(minOffer, Math.min(maxOffer, Number.isFinite(rawOffer) ? rawOffer : (preset.defaultOffer || tutorPrice)));
    const belowMarketRub = Math.max(0, market - offer);
    const aboveMarketRub = Math.max(0, offer - market);
    const belowTutorRub = Math.max(0, tutorPrice - offer);
    const aboveTutorRub = Math.max(0, offer - tutorPrice);
    const offerBelowPct = market > offer ? Math.round(((market - offer) / market) * 100) : 0;
    const hourNum = parseHourInt(m.slot);
    const slot = String(hourNum).padStart(2, "0") + ":00";
    const hourPct = Math.round(((hourNum - 10) / 10) * 100);
    const split = TDATA && TDATA.commissionSplit
      ? TDATA.commissionSplit(offer)
      : { total: offer, fee: Math.round(offer * 0.05), payout: offer - Math.round(offer * 0.05), pct: 5 };
    return { m, preset, tutor, market, tutorPrice, minOffer, maxOffer, offer, belowMarketRub, aboveMarketRub, belowTutorRub, aboveTutorRub, offerBelowPct, hourNum, slot, hourPct, split };
  }

  function motionDiffHTML(meta) {
    return priceDiffTagsHTML({
      tutorPrice: meta.tutorPrice,
      marketPrice: meta.market,
      offerPrice: meta.offer,
      qualBadge: (meta.tutor && meta.tutor.qualBadge) || "Высокая квалификация"
    });
  }

  function motionStatusHTML(meta) {
    if (meta.m.sent) {
      return sentNoticeHTML({
        slot: meta.slot,
        offer: meta.offer,
        badgeText: "Уведомим"
      });
    }
    return `<span class="small muted">Заявка уйдёт с ценой <b class="num">${meta.offer.toLocaleString("ru-RU")} ₽/ч</b> на ${esc(meta.slot)}</span>
      <button type="button" class="link-btn small" data-a="motion-book-now">Выбрать день →</button>`;
  }

  function heroMotionInnerHTML() {
    const meta = heroMotionMeta();
    const { m, preset, tutor, offer, hourNum, slot, hourPct } = meta;

    const presetPills = MOTION_ORDER.map((id) => {
      const p = MOTION_PRESETS[id];
      const on = preset.id === id;
      return `<button type="button" class="chip-btn${on ? " on" : ""}" data-a="motion-preset" data-v="${id}" style="flex:none">${esc(p.label)}</button>`;
    }).join("");

    return `<div class="motion-cursor${m.clicking ? " clicking" : ""}" id="hero-motion-cursor" aria-hidden="true" style="left:36%;top:220px">
        <svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M4.5 3.5L19.5 11.2L12.6 13.5L9.8 20.5L4.5 3.5Z" fill="#ffffff" stroke="#2f7cff" stroke-width="1.8" stroke-linejoin="round"/></svg>
        <span class="cursor-ring"></span>
      </div>
      <div class="motion-head-rail">
        <div class="motion-preset-rail" role="group" aria-label="Направления подготовки">${presetPills}</div>
        <button type="button" class="chip-btn" data-a="motion-toggle" style="padding:5px 10px;font-size:11.5px;flex:none;gap:5px"><span class="live-dot" style="${m.playing ? "" : "opacity:.35;animation:none"}"></span><span>${m.playing ? "Пауза" : "Авто"}</span></button>
      </div>
      <div class="motion-card-body">
        <div class="row between" style="align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div class="row" style="gap:10px;min-width:0">
            ${EGE.hh && typeof EGE.hh.tutorAvatarHTML === "function" ? EGE.hh.tutorAvatarHTML(tutor) : `<span class="tutor-avatar" aria-hidden="true">${esc(initials(tutor.name))}</span>`}
            <div class="stack" style="gap:2px;min-width:0">
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <b>${esc(tutor.name)}</b>
                <span class="chip accent">${esc(preset.short)}</span>
              </div>
              <span class="small muted">${esc(tutor.source || "Доска Ykt · Telegram · MAX")} · ${esc(preset.role)}</span>
            </div>
          </div>
        </div>
        <div class="stack" style="gap:6px">
          <div class="hh-price-row" data-m="price-row">
            ${priceHeadlineHTML(meta.market, offer, true)}
          </div>
          <div class="hh-diff-strip" data-m="diff-strip">${motionDiffHTML(meta)}</div>
        </div>
        <div class="hh-time-picker">
          <div class="row between">
            <span class="small muted">Удобный час с 10:00 до 20:00</span>
            <span class="hh-time-val num" data-m="hour-pill">Сб · ${esc(slot)}</span>
          </div>
          <input class="hh-time-range is-ruler" id="hero-hour-range" type="range" min="10" max="20" step="1" value="${hourNum}" style="--pct:${hourPct}%" data-mstep-target="0" aria-label="Удобный час с 10:00 до 20:00">
          ${sliderTicksHTML(hourNum, "ruler", { id: "hero-hour-ticks" })}
          <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
        </div>
        <div class="hh-price-stepper">
          <button type="button" class="hh-step-btn${m.hitTarget === "minus" ? " is-hit" : ""}" id="hero-price-minus" data-a="motion-step-price" data-step="-50" data-mstep-target="1" aria-label="Снизить цену на 50 рублей">−50 ₽</button>
          <div class="hh-step-readout">
            <b class="num" data-m="offer-val">${offer.toLocaleString("ru-RU")} ₽/ч</b>
            <span class="small muted">твоя ставка</span>
          </div>
          <button type="button" class="hh-step-btn${m.hitTarget === "plus" ? " is-hit" : ""}" id="hero-price-plus" data-a="motion-step-price" data-step="50" aria-label="Повысить цену на 50 рублей">+50 ₽</button>
        </div>
        <button type="button" class="btn sakha-pattern motion-bid-btn${(m.clicking && m.hitTarget === "bid") ? " is-pressed" : ""}${m.sent ? " is-confirmed" : ""}" id="hero-motion-bid-btn" data-a="motion-bid-press" data-mstep-target="2">
          ${sakhaBidInnerHTML(m.sent, offer, { attr: 'data-m="offer-btn-lbl"' })}
        </button>
        <div class="hh-motion-status${m.sent ? " sent" : ""}" id="hero-motion-status" data-mstep-target="3" data-m="status-strip">
          ${motionStatusHTML(meta)}
        </div>
      </div>`;
  }

  function heroMotionStageHTML() {
    const ui = getUi();
    const m = ui.motion || { playing: true };
    return `<div class="motion-stage${m.playing ? "" : " paused"}" id="hero-motion-stage" aria-label="Быстрый выбор времени и цены">
      ${heroMotionInnerHTML()}
    </div>`;
  }

  function positionMotionCursor(stage, step) {
    if (!stage || typeof stage.querySelector !== "function" || typeof stage.getBoundingClientRect !== "function") return;
    const cursor = stage.querySelector("#hero-motion-cursor");
    if (!cursor || !cursor.style) return;
    const fallbacks = [
      ["42%", "215px"],
      ["18%", "286px"],
      ["50%", "346px"],
      ["54%", "398px"]
    ];
    const target = stage.querySelector('[data-mstep-target="' + step + '"]');
    const sr = stage.getBoundingClientRect();
    if (target && typeof target.getBoundingClientRect === "function" && sr && sr.width > 0 && sr.height > 0) {
      const tr = target.getBoundingClientRect();
      let x = tr.left - sr.left + tr.width * 0.52;
      let y = tr.top - sr.top + tr.height * 0.54;
      if (step === 0 && target.type === "range") {
        const mn = Number(target.min) || 10;
        const mx = Number(target.max) || 20;
        const val = Number(target.value) || 10;
        const pct = Math.max(0.06, Math.min(0.94, (val - mn) / Math.max(1, mx - mn)));
        x = tr.left - sr.left + tr.width * pct;
      }
      x = Math.max(12, Math.min(sr.width - 26, x));
      y = Math.max(14, Math.min(sr.height - 26, y));
      cursor.style.left = Math.round(x) + "px";
      cursor.style.top = Math.round(y) + "px";
    } else {
      const fb = fallbacks[step] || fallbacks[0];
      cursor.style.left = fb[0];
      cursor.style.top = fb[1];
    }
  }

  function patchHeroMotionDOM(opts) {
    opts = opts || {};
    const stage = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
    if (!stage || typeof stage.querySelector !== "function") {
      if (!opts.noRender && typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return;
    }
    const meta = heroMotionMeta();
    const step = Math.max(0, Math.min(3, Number(meta.m.step) || 0));
    if (opts.liveOnly) {
      const q = (s) => stage.querySelector(s);
      if (stage.classList) stage.classList.toggle("paused", !meta.m.playing);
      const togBtn = q('[data-a="motion-toggle"]');
      if (togBtn) togBtn.innerHTML = `<span class="live-dot" style="${meta.m.playing ? "" : "opacity:.35;animation:none"}"></span><span>${meta.m.playing ? "Пауза" : "Авто"}</span>`;
      const hp = q('[data-m="hour-pill"]');
      if (hp) hp.textContent = "Сб · " + meta.slot;
      const rng = q("#hero-hour-range");
      if (rng) {
        if (String(rng.value) !== String(meta.hourNum)) rng.value = String(meta.hourNum);
        if (rng.style && rng.style.setProperty) rng.style.setProperty("--pct", meta.hourPct + "%");
      }
      if (typeof stage.querySelectorAll === "function") {
        stage.querySelectorAll(".hh-slider-ticks i").forEach((it) => {
          const tv = Number(it.getAttribute && it.getAttribute("data-tick")) || 0;
          if (it.classList) it.classList.toggle("on", tv === meta.hourNum);
        });
      }
      const pRow = q('[data-m="price-row"]');
      if (pRow) pRow.innerHTML = priceHeadlineHTML(meta.market, meta.offer, true);
      const ds = q('[data-m="diff-strip"]');
      if (ds) ds.innerHTML = motionDiffHTML(meta);
      const oval = q('[data-m="offer-val"]');
      if (oval) oval.textContent = meta.offer.toLocaleString("ru-RU") + " ₽/ч";
      const curBtn = q("#hero-motion-bid-btn");
      if (curBtn && curBtn.classList) {
        curBtn.classList.toggle("is-confirmed", !!meta.m.sent);
        curBtn.classList.toggle("is-pressed", !!(meta.m.clicking && meta.m.hitTarget === "bid"));
      }
      const lbl = q('[data-m="offer-btn-lbl"]');
      if (lbl) lbl.textContent = bidBtnLabelHTML(meta.m.sent, meta.offer);
      const hm = q("#hero-price-minus");
      if (hm && hm.classList) hm.classList.toggle("is-hit", meta.m.hitTarget === "minus");
      const hpl = q("#hero-price-plus");
      if (hpl && hpl.classList) hpl.classList.toggle("is-hit", meta.m.hitTarget === "plus");
      const curEl = q("#hero-motion-cursor");
      if (curEl && curEl.classList) curEl.classList.toggle("clicking", !!meta.m.clicking);
      const st = q("#hero-motion-status");
      if (st) {
        if (st.classList) st.classList.toggle("sent", !!meta.m.sent);
        st.innerHTML = motionStatusHTML(meta);
      }
      positionMotionCursor(stage, step);
      syncHeroMotion();
      return;
    }
    if (stage.classList) stage.classList.toggle("paused", !meta.m.playing);
    stage.innerHTML = heroMotionInnerHTML();
    syncHeroMotion();
  }

  function stopMotionTimers() {
    if (motionTimer && typeof clearTimeout === "function") { clearTimeout(motionTimer); motionTimer = null; }
    if (motionPulseTimer && typeof clearTimeout === "function") { clearTimeout(motionPulseTimer); motionPulseTimer = null; }
  }

  function pulseMotionReset(selectors, delayMs) {
    if (typeof setTimeout !== "function") return;
    const ui = getUi();
    if (motionPulseTimer && typeof clearTimeout === "function") clearTimeout(motionPulseTimer);
    motionPulseTimer = setTimeout(() => {
      motionPulseTimer = null;
      if (!ui.motion) return;
      ui.motion.clicking = false;
      ui.motion.hitTarget = "";
      const st = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
      if (st && typeof st.querySelector === "function") {
        (selectors || []).forEach(([sel, cls]) => {
          const el = st.querySelector(sel);
          if (el && el.classList) el.classList.remove(cls || "is-hit");
        });
      }
    }, delayMs || 280);
  }

  function syncMobileSticky() {
    try {
      if (typeof document === "undefined" || typeof document.getElementById !== "function") return;
      const bar = document.getElementById("land-mobile-sticky");
      const mktSec = document.getElementById("land-market");
      if (!bar || !mktSec || !bar.classList) return;
      if (_stickyObserver && typeof _stickyObserver.disconnect === "function") {
        _stickyObserver.disconnect();
        _stickyObserver = null;
      }
      if (typeof IntersectionObserver === "function") {
        _stickyObserver = new IntersectionObserver((entries) => {
          const entry = entries && entries[0];
          if (!entry || !bar.classList) return;
          const pastTop = entry.boundingClientRect && entry.boundingClientRect.top <= (typeof window !== "undefined" ? window.innerHeight * 0.82 : 600);
          bar.classList.toggle("is-hidden", !!(entry.isIntersecting || pastTop));
        }, { threshold: 0.02 });
        _stickyObserver.observe(mktSec);
      }
    } catch (e) { /* игнор */ }
  }

  let _infiniteObserver = null;

  function syncInfiniteMarket() {
    try {
      if (typeof document === "undefined") return;
      if (_infiniteObserver) {
        _infiniteObserver.disconnect();
        _infiniteObserver = null;
      }
      const ui = getUi();
      if (ui.view !== "landing") return;
      const sentinel = typeof document.getElementById === "function" ? document.getElementById("mkt-scroll-sentinel") : null;
      if (!sentinel || (sentinel.dataset && sentinel.dataset.hasMore !== "1")) return;
      if (typeof IntersectionObserver === "function") {
        let busy = false;
        _infiniteObserver = new IntersectionObserver((entries) => {
          const entry = entries && entries[0];
          if (!entry || !entry.isIntersecting || busy) return;
          busy = true;
          ui.mktVisibleCount = (Number(ui.mktVisibleCount) || 8) + 8;
          if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
        }, { rootMargin: "220px 0px" });
        _infiniteObserver.observe(sentinel);
      }
    } catch (e) { /* игнор */ }
  }

  function syncHeroMotion() {
    const ui = getUi();
    const onLanding = ui.view === "landing";
    if (typeof document !== "undefined" && document.body && document.body.classList) {
      document.body.classList.toggle("is-land-white", !!(onLanding && ui.landWhiteStage));
    }
    if (EGE.kit && typeof EGE.kit.animateHeroCounters === "function") {
      EGE.kit.animateHeroCounters(typeof document !== "undefined" ? document : null);
    }
    if (EGE.kit && typeof EGE.kit.initHeroFloaters === "function") {
      EGE.kit.initHeroFloaters();
    }
    syncInfiniteMarket();
    syncMobileSticky();
    const TDATA = getTDATA();
    const stage = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
    if (!stage || typeof stage.querySelector !== "function") {
      stopMotionTimers();
      return;
    }
    const m = ui.motion || { playing: true, step: 0 };
    const place = () => positionMotionCursor(stage, Math.max(0, Math.min(3, Number(m.step) || 0)));
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(place);
    else place();

    const visible = typeof document.visibilityState === "undefined" || document.visibilityState !== "hidden";
    if (!m.playing || !visible) {
      stopMotionTimers();
      return;
    }
    if (motionTimer || typeof setTimeout !== "function") return;
    const delay = m.step === 3 ? 2500 : 1850;
    motionTimer = setTimeout(() => {
      motionTimer = null;
      const curStage = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
      if (!curStage || !ui.motion || !ui.motion.playing) return;
      const nextStep = (Number(ui.motion.step || 0) + 1) % 4;
      const meta = heroMotionMeta();
      ui.motion.step = nextStep;
      ui.motion.clicking = false;
      ui.motion.hitTarget = "";

      if (nextStep === 0) {
        const curIdx = MOTION_ORDER.indexOf(ui.motion.preset || "design");
        const nextPresetId = MOTION_ORDER[(curIdx + 1) % MOTION_ORDER.length];
        const np = MOTION_PRESETS[nextPresetId] || MOTION_PRESETS.design;
        const nt = (TDATA && TDATA.LIST || []).find((t) => t.id === np.tutorId);
        ui.motion.preset = nextPresetId;
        ui.motion.slot = String(np.defaultHour).padStart(2, "0") + ":00";
        ui.motion.offer = nt ? nt.price : np.defaultOffer;
        ui.motion.sent = false;
        patchHeroMotionDOM();
        if (typeof setTimeout === "function") {
          setTimeout(() => {
            if (!ui.motion || !ui.motion.playing || ui.motion.step !== 0) return;
            const bumpedH = np.defaultHour < 18 ? np.defaultHour + 3 : 14;
            ui.motion.slot = String(bumpedH).padStart(2, "0") + ":00";
            patchHeroMotionDOM({ liveOnly: true });
          }, 550);
        }
        return;
      }

      if (nextStep === 1) {
        ui.motion.offer = Math.max(meta.minOffer, meta.tutorPrice - 50);
        ui.motion.clicking = true;
        ui.motion.hitTarget = "minus";
      } else if (nextStep === 2) {
        ui.motion.clicking = true;
        ui.motion.hitTarget = "bid";
        ui.motion.sent = true;
      }

      patchHeroMotionDOM({ liveOnly: true });
      if ((nextStep === 1 || nextStep === 2) && typeof setTimeout === "function") {
        if (motionPulseTimer && typeof clearTimeout === "function") clearTimeout(motionPulseTimer);
        motionPulseTimer = setTimeout(() => {
          motionPulseTimer = null;
          if (!ui.motion) return;
          ui.motion.clicking = false;
          ui.motion.hitTarget = "";
          const s2 = typeof document.getElementById === "function" ? document.getElementById("hero-motion-stage") : null;
          if (s2 && typeof s2.querySelector === "function") {
            const c = s2.querySelector("#hero-motion-cursor");
            if (c && c.classList) c.classList.remove("clicking");
            const b = s2.querySelector("#hero-motion-bid-btn");
            if (b && b.classList) b.classList.remove("is-pressed");
            const hm = s2.querySelector("#hero-price-minus");
            if (hm && hm.classList) hm.classList.remove("is-hit");
          }
        }, 460);
      }
    }, delay);
  }

  function marqueeSectionHTML() {
    const TDATA = getTDATA();
    if (!TDATA || !TDATA.PREP_UNIVERSE || !TDATA.LIVE_DEALS) return "";
    const { row1, row2 } = marqueePillsHTML({
      universe: TDATA.PREP_UNIVERSE.concat(TDATA.PREP_UNIVERSE),
      deals: TDATA.LIVE_DEALS.concat(TDATA.LIVE_DEALS)
    });
    return `<section class="stack" style="gap:8px" aria-label="Направления подготовки и недавние ставки ниже рынка">
      <div class="marquee-band">
        <div class="marquee-row left">${row1}</div>
        <div class="marquee-row right">${row2}</div>
      </div>
    </section>`;
  }

  function savingsStats() {
    const ui = getUi();
    const TDATA = getTDATA();
    const s = ui.savings || (ui.savings = { freq: 2, marketRate: 1350, offerRate: 1000 });
    const freq = Math.max(1, Math.min(4, Number(s.freq) || 2));
    const mktRate = Math.max(0, Math.min(99999, s.marketRate != null ? Number(s.marketRate) : 1350));
    const cap = Math.max(0, mktRate - 50);
    const offRate = Math.max(0, Math.min(cap, s.offerRate != null ? Number(s.offerRate) : 1000));
    const monthMkt = freq * 4 * mktRate;
    const monthOff = freq * 4 * offRate;
    const monthSave = Math.max(0, monthMkt - monthOff);
    const yearSave = monthSave * 9;
    const pct = mktRate > 0 ? Math.round((monthSave / Math.max(1, monthMkt)) * 100) : 0;
    const barPct = mktRate > 0 ? Math.max(18, Math.min(96, Math.round((monthOff / Math.max(1, monthMkt)) * 100))) : 18;
    const split = TDATA && TDATA.commissionSplit
      ? TDATA.commissionSplit(offRate)
      : { payout: Math.round(offRate * 0.95), fee: Math.round(offRate * 0.05), total: offRate, pct: 5 };
    return { freq, mktRate, offRate, monthMkt, monthOff, monthSave, yearSave, pct, barPct, split };
  }

  function savingsSectionHTML() {
    const st = savingsStats();
    const freqBtns = [1, 2, 3, 4].map((n) => `<button type="button" class="chip-btn${st.freq === n ? " on" : ""}" data-a="save-freq" data-v="${n}">${n} ${plural(n, "урок", "урока", "уроков")}/нед</button>`).join("");
    return `<section class="land-sec" id="land-savings" aria-label="Сравнение стоимости ниже рынка">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Ниже рынка · честная экономика</div>
          <h2 class="h2">Почему занятия здесь обходятся дешевле на 30%</h2>
          <p class="small muted">Онлайн-школы закладывают до 35% наценки. Мы собираем анкеты с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов — предлагай свою ставку напрямую без лишних переплат.</p>
        </div>
      </div>
      <div class="savings-grid">
        <div class="card pad stack" style="gap:14px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <span class="small muted">Занятий в неделю</span>
            <div class="row" style="gap:6px;flex-wrap:wrap">${freqBtns}</div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Средняя ставка на рынке</span>
            <div class="hh-price-stepper">
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="mkt" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout"><b class="num" data-s="mkt-val">${st.mktRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="mkt" data-step="50">+50 ₽</button>
            </div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Твоя цена на платформе</span>
            <div class="hh-price-stepper">
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="off" data-step="-50">−50 ₽</button>
              <div class="hh-step-readout"><b class="num savings-gold-txt" data-s="off-val">${st.offRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="off" data-step="50">+50 ₽</button>
            </div>
          </div>
          <div class="chip gold" style="justify-content:space-between;width:100%;white-space:normal;padding:6px 12px;border-radius:10px" data-s="split-txt">При ${st.offRate} ₽/ч экономия с каждого урока: ${Math.max(0, st.mktRate - st.offRate)} ₽</div>
        </div>
        <div class="card pad stack" style="gap:14px;justify-content:space-between">
          <div class="stack" style="gap:10px">
            <div class="stack" style="gap:4px">
              <div class="row between small"><span class="muted">Рынок (${st.freq * 4} ур/мес)</span><b class="num" data-s="month-mkt">${st.monthMkt.toLocaleString("ru-RU")} ₽/мес</b></div>
              <div class="savings-bar-track"><div class="savings-bar-fill muted-fill" style="width:100%"></div></div>
            </div>
            <div class="stack" style="gap:4px">
              <div class="row between small"><span class="savings-gold-label">Вектор ЕГЭ · твоя ставка</span><b class="num savings-gold-txt" data-s="month-off">${st.monthOff.toLocaleString("ru-RU")} ₽/мес</b></div>
              <div class="savings-bar-track"><div class="savings-bar-fill gold-fill" data-s="off-bar" style="width:${st.barPct}%"></div></div>
            </div>
          </div>
          <div class="card" style="padding:12px 14px;background:var(--accent-soft);border-color:color-mix(in srgb,var(--accent) 42%,var(--line))">
            <div class="small muted">Чистая выгода с твоей ставкой</div>
            <div style="font-size:24px;font-weight:700;letter-spacing:-.02em;color:var(--accent)" data-s="month-save">−${st.monthSave.toLocaleString("ru-RU")} ₽/мес (−${st.pct}%)</div>
            <div class="small ink2" data-s="year-save">За 9 месяцев экономишь ${st.yearSave.toLocaleString("ru-RU")} ₽</div>
          </div>
          <button type="button" class="btn soft" data-a="land-scroll" data-target="land-market">Найти репетитора ниже рынка →</button>
        </div>
      </div>
    </section>`;
  }

  function patchSavingsDOM() {
    const box = typeof document.getElementById === "function" ? document.getElementById("land-savings") : null;
    if (!box || typeof box.querySelector !== "function") {
      if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender();
      return;
    }
    const st = savingsStats();
    const setT = (sel, val) => { const el = box.querySelector(sel); if (el) el.textContent = val; };
    setT('[data-s="mkt-val"]', st.mktRate.toLocaleString("ru-RU") + " ₽/ч");
    setT('[data-s="off-val"]', st.offRate.toLocaleString("ru-RU") + " ₽/ч");
    setT('[data-s="split-txt"]', `При ${st.offRate} ₽/ч экономия с каждого урока: ${Math.max(0, st.mktRate - st.offRate)} ₽`);
    setT('[data-s="month-mkt"]', st.monthMkt.toLocaleString("ru-RU") + " ₽/мес");
    setT('[data-s="month-off"]', st.monthOff.toLocaleString("ru-RU") + " ₽/мес");
    setT('[data-s="month-save"]', `−${st.monthSave.toLocaleString("ru-RU")} ₽/мес (−${st.pct}%)`);
    setT('[data-s="year-save"]', `За 9 месяцев экономишь ${st.yearSave.toLocaleString("ru-RU")} ₽`);
    const bar = box.querySelector('[data-s="off-bar"]');
    if (bar && bar.style) bar.style.width = st.barPct + "%";
    if (typeof box.querySelectorAll === "function") {
      box.querySelectorAll('[data-a="save-freq"]').forEach((b) => {
        if (b.classList) b.classList.toggle("on", Number(b.dataset.v) === st.freq);
      });
    }
  }

  function demoPool(sid) {
    const SUBJ = _ctx.SUBJ || {};
    const CONTENT = _ctx.CONTENT || [];
    const subj = SUBJ[sid] || (CONTENT[0] && CONTENT[0].content);
    if (!subj) return [];
    const list = [];
    for (const t of (subj.topicList || [])) {
      for (const q of (t.q || [])) {
        if (q && q.t === "single" && !q.ctx && !q.svg && Array.isArray(q.o) && Number.isInteger(q.a) && q.q && q.q.length <= 260) {
          list.push(q);
          if (list.length >= 6) return list;
        }
      }
    }
    return list;
  }

  function demoSectionHTML(inside) {
    const ui = getUi();
    const TDATA = getTDATA();
    const CONTENT = _ctx.CONTENT || [];
    const TOPICS = _ctx.TOPICS || {};
    const QS = _ctx.QS || {};
    const firstSubject = _ctx.firstSubject || CONTENT[0] || { id: "bio" };
    const dm = ui.demo || (ui.demo = { tab: "quiz", sid: firstSubject.id, qIdx: 0, pick: null, revealed: false, topicIdx: 0, bidRate: 800, bidHour: "10:00" });
    const subjObj = CONTENT.find((s) => s.id === dm.sid) || CONTENT[0];
    const sid = subjObj ? subjObj.id : firstSubject.id;
    const totalQ = CONTENT.reduce((acc, s) => acc + (s.content && s.content.topics ? Object.keys(s.content.topics).reduce((n, k) => n + ((s.content.topics[k].q || []).length), 0) : 0), 0) || Object.keys(QS).length;
    const totalTopics = CONTENT.reduce((acc, s) => acc + ((s.content && s.content.topicList) ? s.content.topicList.length : 0), 0);

    let body = "";
    if (dm.tab === "notes") {
      const tList = (subjObj && subjObj.content && subjObj.content.topicList) ? subjObj.content.topicList : [];
      const curIdx = tList.length ? (dm.topicIdx % tList.length) : 0;
      const t = tList[curIdx] || null;
      const chips = CONTENT.map((s) => `<button type="button" class="chip-btn${s.id === sid ? " on" : ""}" data-a="demo-subj" data-sid="${esc(s.id)}">${esc(s.name)}</button>`).join("");
      const tBtns = tList.slice(0, 4).map((tp, idx) => `<button type="button" class="chip-btn${idx === curIdx ? " on" : ""}" data-a="demo-topic" data-i="${idx}">${esc(tp.title.length > 28 ? tp.title.slice(0, 26) + "…" : tp.title)}</button>`).join("");
      const bullets = t ? (t.theory || []).slice(0, 6).map((x) => x.startsWith("## ") ? `<li class="th-h">${rich(x.slice(3))}</li>` : `<li>${rich(x)}</li>`).join("") : "";
      const tbl = t && t.tables && t.tables.length && typeof _ctx.tablesHTML === "function" ? _ctx.tablesHTML({ tables: [t.tables[0]] }) : "";
      body = `<div class="chip-rail">${chips}</div>
        ${tBtns ? `<div class="chip-rail">${tBtns}</div>` : ""}
        ${t ? `<div class="card pad-lg stack" style="gap:10px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div><div class="eyebrow">${esc(subjObj.name)} · конспект темы</div><h3 class="h3">${esc(t.title)}</h3></div>
            <span class="chip accent">${(t.q || []).length} заданий</span>
          </div>
          <ul class="theory">${bullets}</ul>
          ${tbl}
        </div>` : `<div class="empty">Выбери предмет для просмотра конспекта.</div>`}`;
    } else if (dm.tab === "calc") {
      const rate = Math.max(0, Math.min(99999, dm.bidRate != null ? Number(dm.bidRate) : 1000));
      const rates = [800, 1000, 1200, 1400];
      const n5 = rate > 0 ? Math.max(1, Math.floor(4590 / rate)) : 0;
      const n10 = rate > 0 ? Math.max(1, Math.floor(8900 / rate)) : 0;
      const sampleTut = TDATA && TDATA.LIST[0];
      const tutorBase = sampleTut ? sampleTut.price : 1200;
      const marketEx = sampleTut && sampleTut.marketPrice ? sampleTut.marketPrice : 1550;
      const saveRub = Math.max(0, marketEx - rate);
      const winLabel = sampleTut ? sampleTut.windowLabel : "с 10:00 до 20:00";
      const previewTxt = TDATA ? TDATA.botPreviewText({
        exam: "ЕГЭ",
        subjectName: sampleTut ? sampleTut.subjectName : "Английский язык",
        format: "онлайн",
        dayLabel: "ближайшая суббота",
        hour: dm.bidHour || "10:00",
        offerPrice: rate,
        tutorPrice: tutorBase
      }) : "";
      body = `<div class="demo-grid" id="demo-calc-box">
        <div class="card pad demo-calc-card">
          <div class="stack" style="gap:12px">
            <div class="row between" style="gap:8px;flex-wrap:wrap">
              <b>Выбери свою ставку за урок</b>
              <span class="chip">${esc(winLabel)} · Ykt, TG, WA, MAX</span>
            </div>
            <div class="demo-rate-row">
              <div class="demo-rate-chips">
                ${rates.map((r) => `<button type="button" class="chip-btn${rate === r ? " on" : ""}" data-a="demo-rate" data-rate="${r}">${r.toLocaleString("ru-RU")} ₽/ч</button>`).join("")}
              </div>
              <div class="hh-price-stepper compact demo-rate-stepper">
                <button type="button" class="hh-step-btn" data-a="demo-step" data-step="-50" aria-label="Снизить ставку на 50 рублей">−50 ₽</button>
                <label class="hh-step-readout is-inline" for="demo-rate-inp">
                  <input class="demo-rate-input num" id="demo-rate-inp" type="number" min="0" max="99999" step="50" value="${rate}" aria-label="Своя ставка в рублях">
                  <span class="hh-step-unit">₽/ч</span>
                </label>
                <button type="button" class="hh-step-btn" data-a="demo-step" data-step="50" aria-label="Повысить ставку на 50 рублей">+50 ₽</button>
              </div>
            </div>
            <div class="fee-split-box">
              <div class="fee-pill"><span>Цена часа</span><b class="num" data-dc="rate">${rate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <div class="fee-pill"><span>Ниже рынка (${marketEx.toLocaleString("ru-RU")} ₽)</span><b class="num" data-dc="save" style="color:var(--confirm)">${saveRub > 0 ? "−" + saveRub.toLocaleString("ru-RU") + " ₽" : "По рынку"}</b></div>
              <div class="fee-pill"><span>На «Стандарте» 4 590 ₽</span><b class="num" data-dc="n5">${n5} ${plural(n5, "урок", "урока", "уроков")}</b></div>
            </div>
          </div>
          <p class="small muted">На «Интенсиве» 8 900 ₽ выйдет примерно <b data-dc="n10">${n10} ${plural(n10, "урок", "урока", "уроков")}</b>. Оплата по СБП замораживается на эскроу только после согласия преподавателя. <a href="/fees" class="link-btn small" data-a="go" data-v="fees">Как работает СБП и правила оплаты →</a></p>
        </div>
        <div class="card pad demo-calc-card">
          <div class="stack" style="gap:10px">
            <b class="small">Карточка заявки (пришлём уведомление при ответе)</b>
            <div class="bot-preview"><span data-dc="preview">${esc(previewTxt)}</span></div>
          </div>
          <div class="row" style="gap:8px;flex-wrap:wrap">
            <button type="button" class="btn sm" data-a="land-scroll" data-target="land-market">Выбрать время и преподавателя</button>
          </div>
        </div>
      </div>`;
    } else {
      const pool = demoPool(sid);
      const q = pool.length ? pool[dm.qIdx % pool.length] : null;
      const tp = q && TOPICS[q.topic];
      const chips = CONTENT.map((s) => `<button type="button" class="chip-btn${s.id === sid ? " on" : ""}" data-a="demo-subj" data-sid="${esc(s.id)}">${esc(s.name)}</button>`).join("");
      const optsHTML = q ? q.o.map((opt, idx) => {
        const picked = dm.pick === idx;
        const ok = dm.revealed && idx === q.a;
        const bad = dm.revealed && picked && idx !== q.a;
        return `<button type="button" class="demo-opt${ok ? " ok" : bad ? " bad" : picked ? " picked" : ""}" data-a="demo-pick" data-i="${idx}"${dm.revealed ? " disabled" : ""}><span><b>${idx + 1}.</b> ${esc(opt)}</span><span class="small muted">${ok ? "Верно" : bad ? "Ошибка" : ""}</span></button>`;
      }).join("") : "";
      const fb = q && dm.revealed
        ? `<div class="feedback" data-r="${dm.pick === q.a ? "2" : "0"}"><div class="fb-title">${icon(dm.pick === q.a ? "check" : "x")}${dm.pick === q.a ? "Верно!" : `Ошибка · правильный ответ: ${esc(q.o[q.a])}`}</div>${q.e ? `<div class="small ink2">${esc(q.e)}</div>` : ""}</div>`
        : "";
      body = `<div class="demo-grid">
        <div class="card stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <div class="chip-rail">${chips}</div>
            ${q ? `<span class="chip accent">Вопрос ${(dm.qIdx % pool.length) + 1} / ${pool.length}</span>` : ""}
          </div>
          ${q ? `<div class="stack" style="gap:8px">
            ${tp ? `<div class="small muted">Тема: ${esc(tp.title)}</div>` : ""}
            <div style="font-size:16px;font-weight:600;line-height:1.45">${esc(q.q)}</div>
            <div class="stack" style="gap:8px">${optsHTML}</div>
            ${fb}
            <div class="row between" style="gap:8px;flex-wrap:wrap;padding-top:4px">
              <button type="button" class="btn soft sm" data-a="demo-next">Следующий вопрос</button>
              <button type="button" class="btn ghost sm" data-a="demo-tab" data-tab="notes">Открыть конспект</button>
            </div>
          </div>` : `<div class="empty">Вопросы загружаются…</div>`}
        </div>
        <div class="card stack" style="gap:10px">
          <div class="eyebrow">Что внутри тренажёра</div>
          <h3 class="h3">${totalQ}+ заданий ЕГЭ и ${totalTopics} конспекта</h3>
          <p class="small ink2">Каждый вопрос связан со справочником: если ошибся — сразу видишь разбор и ссылку на нужный конспект, а сложные номера попадают в повторение.</p>
          <div class="row" style="gap:8px;flex-wrap:wrap;padding-top:4px">
            ${inside
              ? `<button type="button" class="btn sm" data-a="go" data-v="tests">Перейти к тренажёру</button>`
              : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти и сохранять прогресс</button>`}
          </div>
        </div>
      </div>`;
    }

    return `<section class="land-sec" id="land-demo" aria-label="Пример работы бета">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Пример работы · Бета</div>
          <h2 class="h2">Потыкай прямо сейчас: тест ЕГЭ, конспект и калькулятор ставки</h2>
          <p class="small muted">Без регистрации можно проверить задания по биологии, русскому и химии, полистать шпаргалку и прикинуть стоимость урока.</p>
        </div>
      </div>
      <div class="demo-box">
        <div class="hh-seg" role="group" aria-label="Режим бета-примера">
          <button type="button" data-a="demo-tab" data-tab="quiz" aria-pressed="${dm.tab === "quiz"}">Мини-тест ЕГЭ</button>
          <button type="button" data-a="demo-tab" data-tab="notes" aria-pressed="${dm.tab === "notes"}">Конспекты</button>
          <button type="button" data-a="demo-tab" data-tab="calc" aria-pressed="${dm.tab === "calc"}">Калькулятор ставки</button>
        </div>
        ${body}
      </div>
    </section>`;
  }

  function patchDemoCalcDOM() {
    const box = typeof document.getElementById === "function" ? document.getElementById("demo-calc-box") : null;
    if (!box || typeof box.querySelector !== "function") return false;
    const TDATA = getTDATA();
    const ui = getUi();
    const dm = ui.demo || {};
    const rate = Math.max(0, Math.min(99999, dm.bidRate != null ? Number(dm.bidRate) : 1000));
    const n5 = rate > 0 ? Math.max(1, Math.floor(4590 / rate)) : 0;
    const n10 = rate > 0 ? Math.max(1, Math.floor(8900 / rate)) : 0;
    const sampleTut = TDATA && TDATA.LIST[0];
    const tutorBase = sampleTut ? sampleTut.price : 1200;
    const marketEx = sampleTut && sampleTut.marketPrice ? sampleTut.marketPrice : 1550;
    const saveRub = Math.max(0, marketEx - rate);
    const previewTxt = TDATA ? TDATA.botPreviewText({
      exam: "ЕГЭ",
      subjectName: sampleTut ? sampleTut.subjectName : "Английский язык",
      format: "онлайн",
      dayLabel: "ближайшая суббота",
      hour: dm.bidHour || "10:00",
      offerPrice: rate,
      tutorPrice: tutorBase
    }) : "";
    const inp = box.querySelector("#demo-rate-inp");
    if (inp && document.activeElement !== inp) inp.value = String(rate);
    if (typeof box.querySelectorAll === "function") {
      box.querySelectorAll('[data-a="demo-rate"]').forEach((btn) => {
        const bRate = Number(btn.getAttribute && btn.getAttribute("data-rate")) || 0;
        if (btn.classList) btn.classList.toggle("on", bRate === rate);
      });
    }
    const q = (s) => box.querySelector(s);
    const elRate = q('[data-dc="rate"]');
    if (elRate) elRate.textContent = rate.toLocaleString("ru-RU") + " ₽/ч";
    const elSave = q('[data-dc="save"]');
    if (elSave) elSave.textContent = saveRub > 0 ? "−" + saveRub.toLocaleString("ru-RU") + " ₽" : "По рынку";
    const elN5 = q('[data-dc="n5"]');
    if (elN5) elN5.textContent = n5 + " " + plural(n5, "урок", "урока", "уроков");
    const elN10 = q('[data-dc="n10"]');
    if (elN10) elN10.textContent = n10 + " " + plural(n10, "урок", "урока", "уроков");
    const elPrev = q('[data-dc="preview"]');
    if (elPrev) elPrev.textContent = previewTxt;
    return true;
  }

  const LAND_REVIEWS = [
    {
      name: "Екатерина М.",
      role: "Мама 11-классницы · Биология ЕГЭ",
      oldPrice: 1450,
      newPrice: 1050,
      rating: "5.0",
      badge: "Нашли за 12 мин · Медвуз",
      text: "Нужен был разбор генетики и заданий второй части. Предложили 1 050 ₽/ч вместо 1 450 ₽ на вечерний слот — репетитор подтвердила в тот же день. За 4 месяца сэкономили около 12 000 ₽.",
      pro: false
    },
    {
      name: "Артём К.",
      role: "11 класс · Информатика КЕГЭ",
      oldPrice: 1350,
      newPrice: 1000,
      rating: "5.0",
      badge: "−26% к рынку · Слот 16:00",
      text: "Выбрал на ползунке час 16:00 и предложил 1 000 ₽/ч кнопками ±50 ₽. После уроков повторял темы и конспекты в этом же кабинете — пробник написал на 86 баллов.",
      pro: false
    },
    {
      name: "Дарья Л.",
      role: "Поступление на бюджет · Химия 92",
      oldPrice: 1600,
      newPrice: 1700,
      rating: "5.0",
      badge: "Профи выше рынка · Высокая квалификация",
      text: "Специально выбрали ставку Профи по химии для сложной задачи №34 с олеумом и атомистикой. Деньги с баланса списались только после подтверждения — на экзамене 92 балла.",
      pro: true
    }
  ];

  const LAND_FAQ_ITEMS = [
    {
      q: "Как работает СБП-платёжка и когда реально списываются деньги с баланса?",
      a: "Мы принимаем оплату только через СБП (АЭБ, СберБанк, Т-Банк, ВТБ) — без привязки банковских карт и карточных наценок. Пополненный баланс (490 / 2 190 / 4 590 / 8 900 ₽) хранится на защищённом эскроу-счёте: деньги бронируются на ближайший урок и переводятся преподавателю только после проведённого занятия.",
      hasFeesLink: true
    },
    {
      q: "Сколько стоит пробный урок — 490 ₽ или бесплатно?",
      a: "По умолчанию пробный урок 60 минут стоит всего 490 ₽ по СБП со 100% гарантией бесплатной замены преподавателя. При этом каждый преподаватель в своём кабинете может сделать пробный бесплатным (0 ₽), назначить свою цену или отключить пробный формат.",
      hasFeesLink: false
    },
    {
      q: "Когда открываются прямые кнопки WhatsApp, Telegram и MAX преподавателя?",
      a: "Прямые контакты защищены шлюзом (Contact Escrow) и открываются автоматически в разделе «Учёба» сразу после бронирования слота (от 490 ₽ или на бесплатном пробном). Так мы защищаем и родителей от спама, и преподавателей от пустых откликов без намерения учиться.",
      hasFeesLink: false
    },
    {
      q: "Чем отличается «Мини-группа Саха» (2 190 ₽) от тарифа «ИИ-Старт ЕГЭ» (390 ₽/мес)?",
      a: "«ИИ-Старт ЕГЭ» за 390 ₽/мес даёт безлимитный тренажёр ЕГЭ-2027 и ИИ-проверку сочинений К1–К12 без живого репетитора. «Мини-группа Саха» за 2 190 ₽ — это 4 живых урока в группе 3–5 учеников одного уровня (~548 ₽/ч), куда тариф ИИ-Старт уже включён бесплатно.",
      hasFeesLink: false
    },
    {
      q: "Что делать, если преподаватель не согласился на −50 ₽ или не подошёл по темпу?",
      a: "Преподаватель может предложить встречное время или свою цену, а вы — в 1 клик перенести бронь на соседнего репетитора на тот же час без потери средств на балансе. При отмене ≥ 4 ч до урока 100% суммы мгновенно возвращается на ваш счёт.",
      hasFeesLink: true
    }
  ];

  function matchState() {
    const ui = getUi();
    return ui.landMatch || (ui.landMatch = { subject: "all", tier: "below", hour: "all", menuOpen: false });
  }

  function computeQuickMatchMeta() {
    const TDATA = getTDATA();
    const ms = matchState();
    const list = (TDATA && TDATA.LIST) ? TDATA.LIST : [];
    const days = TDATA ? TDATA.buildCalendarDays(7) : [];
    let filtered = TDATA
      ? TDATA.filterTutors({
          subject: ms.subject || "all",
          maxPrice: ms.tier === "budget" ? 1200 : 2000,
          hour: ms.hour || "all",
          sort: ms.tier === "pro" ? "rating_desc" : "price_asc"
        }, days)
      : [];
    if (ms.tier === "pro") {
      const pros = filtered.filter((t) => (t.price >= 1300) || (t.rating >= 4.9));
      if (pros.length) filtered = pros;
    } else if (ms.tier === "below") {
      const belowList = filtered.filter((t) => !t.aboveRub);
      if (belowList.length) filtered = belowList;
    }
    const minPrice = filtered.length ? Math.min(...filtered.map((t) => t.price)) : 900;
    const maxMarket = filtered.length ? Math.max(...filtered.map((t) => t.marketPrice || Math.round(t.price * 1.45))) : 1650;
    return { ms, filtered, minPrice, maxMarket, totalCount: TDATA && TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL : 2480 };
  }

  function quickMatchSectionHTML() {
    const TDATA = getTDATA();
    if (!TDATA) return "";
    const meta = computeQuickMatchMeta();
    const { ms, filtered, minPrice, maxMarket, totalCount } = meta;
    const subjOpts = [{ id: "all", label: "Все предметы", meta: totalCount.toLocaleString("ru-RU") + "+ анкет" }]
      .concat((TDATA.SUBJECTS || []).map((s) => ({ id: s.id, label: s.name, meta: "ЕГЭ · ОГЭ · ВУЗ" })));
    const topSample = filtered[0];
    const hourChips = [
      ["all", "Любой час"],
      ["10:00", "Утро · 10:00"],
      ["14:00", "День · 14:00"],
      ["18:00", "Вечер · 18:00"]
    ];
    const tierChips = [
      ["below", "Ниже рынка −30%"],
      ["budget", "До 1 200 ₽/ч"],
      ["pro", "Профи выше рынка"]
    ];
    return `<section class="land-sec" id="land-match" aria-label="Быстрый подбор за 20 секунд">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Квиз-подбор за 20 секунд</div>
          <h2 class="h2">Ответь на 3 пункта — сразу покажем лучшие анкеты</h2>
        </div>
        <span class="chip accent">${icon("spark")}<span>Мгновенный фильтр каталога</span></span>
      </div>
      <div class="land-match-grid">
        <div class="card pad stack" style="gap:12px">
          <div class="field">
            <span class="label">1. Какой предмет или навык нужен?</span>
            ${hhSelectHTML({
              id: "land-match-select",
              options: subjOpts,
              value: ms.subject || "all",
              open: !!ms.menuOpen,
              toggleAction: "match-subj-toggle",
              pickAction: "match-subj-pick",
              ariaLabel: "Выбор предмета для быстрого подбора"
            })}
          </div>
          <div class="field">
            <span class="label">2. Целевая ставка за урок</span>
            <div class="chip-rail">
              ${tierChips.map(([id, lbl]) => `<button type="button" class="chip-btn${ms.tier === id ? " on" : ""}" data-a="match-tier" data-v="${id}">${id === "pro" ? `<span style="color:${ms.tier === id ? "inherit" : "var(--pro)"}">★</span> ` : ""}${lbl}</button>`).join("")}
            </div>
          </div>
          <div class="field">
            <span class="label">3. Удобное время занятий</span>
            <div class="chip-rail">
              ${hourChips.map(([id, lbl]) => `<button type="button" class="chip-btn${ms.hour === id ? " on" : ""}" data-a="match-hour" data-v="${id}">${lbl}</button>`).join("")}
            </div>
          </div>
        </div>
        <div class="land-match-result">
          <div class="stack" style="gap:8px">
            <div class="row between" style="gap:6px;flex-wrap:wrap">
              <span class="chip accent">Готово к отклику</span>
              <span class="small muted num">${filtered.length} ${plural(filtered.length, "анкета", "анкеты", "анкет")} сейчас</span>
            </div>
            <div class="hh-price-row">
              ${ms.tier === "pro"
                ? `<b class="hh-price-now lg num">от ${minPrice.toLocaleString("ru-RU")} ₽/ч</b><span class="diff-tag pro">Профи · 90+ баллов</span>`
                : `${priceHeadlineHTML(maxMarket, minPrice, true)}`}
            </div>
            ${topSample
              ? `<p class="small ink2">Например: <b>${esc(topSample.name)}</b> (${esc(topSample.subjectName)}, ★ ${topSample.rating.toFixed(1)}, ${esc(topSample.source || "Доска Ykt")}) — можно предложить от <b class="num">${topSample.minFair.toLocaleString("ru-RU")} ₽/ч</b>.</p>`
              : `<p class="small ink2">По выбранным критериям покажем ближайшие свободные окна по всему каталогу.</p>`}
          </div>
          <button type="button" class="btn" style="width:100%;justify-content:center" data-a="match-apply">Показать ${filtered.length} ${plural(filtered.length, "анкету", "анкеты", "анкет")} в каталоге →</button>
        </div>
      </div>
    </section>`;
  }

  function ratesAnalyticsHTML() {
    const TDATA = getTDATA();
    if (!TDATA || !TDATA.LIST) return "";
    const targetIds = ["eng", "rus", "bio", "chem", "inf", "design"];
    const cards = targetIds.map((sid) => {
      const sb = (TDATA.SUBJECTS || []).find((x) => x.id === sid);
      const tutors = TDATA.LIST.filter((t) => t.subject === sid);
      if (!sb || !tutors.length) return "";
      const minRate = Math.min(...tutors.map((t) => t.price));
      const maxRate = Math.max(...tutors.map((t) => t.price));
      const avgMarket = Math.round(tutors.reduce((s, t) => s + (t.marketPrice || Math.round(t.price * 1.28)), 0) / tutors.length / 50) * 50;
      const savePct = avgMarket > minRate ? Math.round(((avgMarket - minRate) / avgMarket) * 100) : 22;
      const barPct = Math.max(32, Math.min(88, Math.round((minRate / Math.max(1, avgMarket)) * 100)));
      return rateBenchCardHTML({
        sid,
        title: esc(sb.short),
        minRate,
        maxRate,
        avgMarket,
        savePct,
        barPct,
        hasPro: maxRate >= 1400
      });
    }).join("");
    return `<section class="land-sec" id="land-rates" aria-label="Аналитика ставок по предметам">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Аналитика рынка · hh-срез ставок</div>
          <h2 class="h2">Средние ставки по предметам: рынок против нашей витрины</h2>
          <p class="small muted">Собрано по базе анкет: выбирай либо экономию ниже рынка, либо сертифицированных экспертов с тегом «Профи».</p>
        </div>
      </div>
      <div class="land-rates-grid">${cards}</div>
    </section>`;
  }

  function verifySectionHTML() {
    const steps = [
      ["01", "Сбор и дедупликация", "Объединяем дублирующие объявления преподавателя с Доски Ykt, Telegram, WhatsApp и MAX в одну карточку с реальной историей откликов."],
      ["02", "Проверка контакта и торга", "Фильтруем неактуальные номера и заниженные «цены-приманки» — показываем честный коридор цены с шагом ±50 ₽."],
      ["03", "Кнопка «Актуален сегодня»", "Преподаватели подтверждают свободные окна каждые 24 часа. Свежие анкеты получают приоритет и оранжевые уведомления об ответе."]
    ];
    return `<section class="land-sec" id="land-verify" aria-label="Как проверяются анкеты">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Качество базы · Ykt · Telegram · MAX</div>
          <h2 class="h2">Как мы отсеиваем фейки и устаревшие анкеты</h2>
        </div>
        <span class="chip confirm">${icon("shield")}<span>Проверка актуальности</span></span>
      </div>
      <div class="land-verify-grid">
        ${steps.map(([num, title, desc]) => `<div class="card pad stack" style="gap:8px">
          <div class="row between"><span class="how-num">${num}</span><span class="diff-tag confirm">Проверено</span></div>
          <b>${esc(title)}</b>
          <p class="small ink2">${esc(desc)}</p>
        </div>`).join("")}
      </div>
    </section>`;
  }

  function trustUnderPlansHTML() {
    return trustStripHTML({
      title: "СБП-эскроу без карточных наценок · 100% гарантия замены на пробном 490 ₽",
      desc: "Оплата по QR или кнопке банка (АЭБ, Сбер, Т-Банк, ВТБ) лежит на защищённом балансе и списывается поурочно. Контакты WA / TG / MAX открываются сразу после бронирования слота."
    });
  }

  function reviewsSectionHTML() {
    return `<section class="land-sec" id="land-reviews" aria-label="Отзывы и реальные кейсы">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">Кейсы «Было → Стало» · Отзывы</div>
          <h2 class="h2">Отзывы учеников и родителей: как проходит подбор</h2>
        </div>
      </div>
      <div class="land-reviews-grid">${LAND_REVIEWS.map((r) => reviewCardHTML(r)).join("")}</div>
    </section>`;
  }

  function faqSectionHTML() {
    const ui = getUi();
    const openIdx = ui.landFaqOpen === undefined ? 0 : ui.landFaqOpen;
    return `<section class="land-sec" id="land-faq" aria-label="Частые вопросы">
      <div class="land-sec-head">
        <div>
          <div class="eyebrow">FAQ · Прозрачные правила</div>
          <h2 class="h2">Частые вопросы перед первой заявкой</h2>
        </div>
      </div>
      ${faqListHTML(LAND_FAQ_ITEMS, openIdx, "land-faq")}
    </section>`;
  }

  function heroPhotoBannerHTML(opts) {
    opts = opts || {};
    const TDATA = getTDATA();
    const ui = getUi();
    const catalogTotal = TDATA && TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL.toLocaleString("ru-RU") : "2 480";
    const isDemo = !!opts.brandbookDemo;
    const bb = (ui && ui.brandbook) || {};
    return heroBannerHTML({
      brandbookDemo: isDemo,
      catalogTotal,
      variantIdx: isDemo ? 0 : _heroCopyIdx,
      primaryActive: isDemo ? !!bb.heroSubmitted : !!ui.heroBannerSubmitted
    });
  }

  function landingPageHTML(opts) {
    opts = opts || {};
    const TDATA = getTDATA();
    const inside = !!opts.inside;
    const dark = typeof _ctx.effectiveDark === "function" ? _ctx.effectiveDark() : false;
    const catalogTotal = TDATA && TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL.toLocaleString("ru-RU") : "2 480";
    const mktApi = EGE.views && EGE.views.marketplace;

    const ui = getUi();
    const totalNum = (TDATA && TDATA.CATALOG_TOTAL) ? Number(TDATA.CATALOG_TOTAL) : 2480;

    return `<div class="land-page${ui.landWhiteStage ? " is-white-stage" : ""}" data-inside="${inside ? 1 : 0}">
      <header class="land-top${ui.landWhiteStage ? " is-scrolled-light" : ""}">
        ${brandLockupHTML({})}
        <nav class="land-links" aria-label="Разделы лендинга">
          <a href="#land-market" data-a="land-scroll" data-target="land-market">Репетиторы</a>
          <a href="/student">Для ученика</a>
          <a href="/tutor">Для преподавателя</a>
          <a href="/fees" data-a="go" data-v="fees">Условия оплаты</a>
        </nav>
        <div class="land-top-actions">
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside
            ? `<button type="button" class="btn sm" data-a="go" data-v="${ui.role === "tutor" ? "cabinet" : "tests"}">В кабинет</button>`
            : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      ${heroPhotoBannerHTML({ brandbookDemo: false })}

      ${mktApi ? mktApi.marketSectionHTML({ landing: true }) : ""}

      <hr class="land-plain-line" aria-hidden="true">

      <footer class="land-footer is-minimal small muted">
        <div class="land-footer-links is-plain">
          <button type="button" class="land-foot-plain" data-a="bug-site">Сообщить о баге</button>
          <button type="button" class="land-foot-plain" data-a="coop-open">Сотрудничество</button>
          <a href="/fees" class="land-foot-plain" data-a="go" data-v="fees">Условия оплаты</a>
          <a href="/privacy" class="land-foot-plain">Политика конфиденциальности</a>
        </div>
      </footer>

      <div class="land-mobile-sticky" id="land-mobile-sticky" role="region" aria-label="Быстрый переход к подбору">
        <div class="land-mobile-sticky-copy">
          <b class="num">Самая большая база · <span class="num" data-countup="${totalNum}">${catalogTotal}</span>+ анкет</b>
          <span class="small muted num">Ставка 0–99 999 ₽/ч · дешевле на <span class="num" data-countup="30">30</span>%</span>
        </div>
        <button type="button" class="btn sm land-mobile-sticky-btn" data-a="land-scroll" data-target="land-market">Подобрать →</button>
      </div>
    </div>`;
  }

  EGE.views = EGE.views || {};
  EGE.views.landing = {
    configure,
    getHeroVariant,
    nextHeroVariant,
    syncMobileSticky,
    MOTION_PRESETS,
    MOTION_ORDER,
    heroMotionMeta,
    patchHeroMotionDOM,
    syncHeroMotion,
    stopMotionTimers,
    pulseMotionReset,
    patchSavingsDOM,
    computeQuickMatchMeta,
    heroPhotoBannerHTML,
    landingPageHTML,
    demoSectionHTML,
    patchDemoCalcDOM,
    marqueeSectionHTML,
    savingsSectionHTML
  };
})();
