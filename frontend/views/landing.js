/* Витрина /landing: интерактивный моушен-подбор репетитора, бегущие ленты, калькулятор выгоды и бета-тест. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { esc, rich, plural, initials } = EGE.utils;
  const { icon, BRAND_MARK_HTML } = EGE.ui;
  const { bidBtnLabelHTML, priceHeadlineHTML, priceDiffTagsHTML, sliderTicksHTML } = EGE.hh;

  let _ctx = {};

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
    design: { id: "design", label: "UX/UI и Моушен", short: "Моушен-дизайн", tutorId: "tut-kovalev", fallbackName: "Денис Ковалёв", role: "Figma · After Effects · портфолио", defaultHour: 10, defaultOffer: 1200 },
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
    const minOffer = Math.max(500, Math.round(((tutor.minFair || tutorPrice * 0.72) - 100) / 100) * 100);
    const maxOffer = Math.max(market + 600, tutorPrice + 600);
    const offer = Math.max(minOffer, Math.min(maxOffer, Number(m.offer) || preset.defaultOffer || tutorPrice));
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
      return `<span class="row" style="gap:7px;align-items:center"><span class="live-dot" style="background:var(--confirm)" aria-hidden="true"></span><b style="color:var(--confirm)">Подтверждено · ${esc(meta.slot)} · ${meta.offer.toLocaleString("ru-RU")} ₽</b></span>
        <span class="chip confirm">Заявка отправлена · уведомим</span>`;
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
            <span class="tutor-avatar" aria-hidden="true">${esc(initials(tutor.name))}</span>
            <div class="stack" style="gap:2px;min-width:0">
              <div class="row" style="gap:6px;flex-wrap:wrap">
                <b>${esc(tutor.name)}</b>
                <span class="badge accent">${esc(preset.short)}</span>
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
          <input class="hh-time-range" id="hero-hour-range" type="range" min="10" max="20" step="1" value="${hourNum}" style="--pct:${hourPct}%" data-mstep-target="0" aria-label="Удобный час с 10:00 до 20:00">
          ${sliderTicksHTML(hourNum, "ticks")}
          <div class="hh-time-ticks" aria-hidden="true"><span>10:00</span><span>12:00</span><span>14:00</span><span>16:00</span><span>18:00</span><span>20:00</span></div>
        </div>
        <div class="hh-price-stepper">
          <button type="button" class="hh-step-btn${m.hitTarget === "minus" ? " is-hit" : ""}" id="hero-price-minus" data-a="motion-step-price" data-step="-100" data-mstep-target="1" aria-label="Снизить цену на 100 рублей">−100 ₽</button>
          <div class="hh-step-readout">
            <b class="num" data-m="offer-val">${offer.toLocaleString("ru-RU")} ₽/ч</b>
            <span class="small muted">твоя ставка</span>
          </div>
          <button type="button" class="hh-step-btn${m.hitTarget === "plus" ? " is-hit" : ""}" id="hero-price-plus" data-a="motion-step-price" data-step="100" aria-label="Повысить цену на 100 рублей">+100 ₽</button>
        </div>
        <button type="button" class="btn motion-bid-btn${(m.clicking && m.hitTarget === "bid") ? " is-pressed" : ""}${m.sent ? " is-confirmed" : ""}" id="hero-motion-bid-btn" data-a="motion-bid-press" data-mstep-target="2">
          <span data-m="offer-btn-lbl">${bidBtnLabelHTML(m.sent, offer)}</span>
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
          if (it.classList) it.classList.toggle("on", Math.abs(tv - meta.hourNum) <= 1);
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

  function syncHeroMotion() {
    const ui = getUi();
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
        ui.motion.offer = Math.max(meta.minOffer, meta.tutorPrice - 100);
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
    const uItems = TDATA.PREP_UNIVERSE.concat(TDATA.PREP_UNIVERSE);
    const dItems = TDATA.LIVE_DEALS.concat(TDATA.LIVE_DEALS);
    const row1 = uItems.map((it) => {
      const goal = it.label.indexOf("ЕГЭ") >= 0 ? "ЕГЭ" : (it.label.indexOf("ОГЭ") >= 0 ? "ОГЭ" : "all");
      return `<button type="button" class="marquee-pill" data-a="hero-cat" data-subj="${esc(it.subject)}" data-exam="${goal}"><b>${esc(it.label)}</b><span>${esc(it.meta)}</span></button>`;
    }).join("");
    const row2 = dItems.map((d) => {
      return `<button type="button" class="marquee-pill" data-a="land-scroll" data-target="land-market"><b>${esc(d.topic)} · ${d.paid.toLocaleString("ru-RU")} ₽/ч</b><span>${esc(d.tag)}</span></button>`;
    }).join("");
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
    const s = ui.savings || (ui.savings = { freq: 2, marketRate: 1600, offerRate: 950 });
    const freq = Math.max(1, Math.min(4, Number(s.freq) || 2));
    const mktRate = Math.max(1000, Math.min(3500, Number(s.marketRate) || 1600));
    const offRate = Math.max(600, Math.min(mktRate - 100, Number(s.offerRate) || 950));
    const monthMkt = freq * 4 * mktRate;
    const monthOff = freq * 4 * offRate;
    const monthSave = Math.max(0, monthMkt - monthOff);
    const yearSave = monthSave * 9;
    const pct = Math.round((monthSave / Math.max(1, monthMkt)) * 100);
    const barPct = Math.max(18, Math.min(96, Math.round((monthOff / Math.max(1, monthMkt)) * 100)));
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
          <h2 class="h2">Почему занятия здесь обходятся дешевле на 35–53%</h2>
          <p class="small muted">Онлайн-школы закладывают до 50% наценки. Мы собираем анкеты с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов — предлагай свою ставку напрямую без лишних переплат.</p>
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
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="mkt" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num" data-s="mkt-val">${st.mktRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="mkt" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="stack" style="gap:6px">
            <span class="small muted">Твоя цена на платформе</span>
            <div class="hh-price-stepper">
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="off" data-step="-100">−100 ₽</button>
              <div class="hh-step-readout"><b class="num" style="color:var(--accent)" data-s="off-val">${st.offRate.toLocaleString("ru-RU")} ₽/ч</b></div>
              <button type="button" class="hh-step-btn" data-a="save-step" data-which="off" data-step="100">+100 ₽</button>
            </div>
          </div>
          <div class="badge" style="justify-content:space-between;width:100%" data-s="split-txt">При ${st.offRate} ₽/ч экономия с каждого урока: ${Math.max(0, st.mktRate - st.offRate)} ₽</div>
        </div>
        <div class="card pad stack" style="gap:14px;justify-content:space-between">
          <div class="stack" style="gap:10px">
            <div class="stack" style="gap:4px">
              <div class="row between small"><span class="muted">Рынок (${st.freq * 4} ур/мес)</span><b class="num" data-s="month-mkt">${st.monthMkt.toLocaleString("ru-RU")} ₽/мес</b></div>
              <div class="savings-bar-track"><div class="savings-bar-fill muted-fill" style="width:100%"></div></div>
            </div>
            <div class="stack" style="gap:4px">
              <div class="row between small"><span>Вектор ЕГЭ · твоя ставка</span><b class="num" style="color:var(--accent)" data-s="month-off">${st.monthOff.toLocaleString("ru-RU")} ₽/мес</b></div>
              <div class="savings-bar-track"><div class="savings-bar-fill" data-s="off-bar" style="width:${st.barPct}%"></div></div>
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
      const rate = Math.max(500, Math.min(3000, Number(dm.bidRate) || 800));
      const rates = [700, 800, 1000, 1200];
      const n5 = Math.max(1, Math.floor(5000 / rate));
      const n10 = Math.max(1, Math.floor(10000 / rate));
      const marketEx = 1650;
      const saveRub = Math.max(0, marketEx - rate);
      const sampleTut = TDATA && TDATA.LIST[0];
      const winLabel = sampleTut ? sampleTut.windowLabel : "с 09:00 до 19:00";
      const previewTxt = TDATA ? TDATA.botPreviewText({
        exam: "ЕГЭ",
        subjectName: sampleTut ? sampleTut.subjectName : "Английский язык",
        format: "онлайн",
        dayLabel: "ближайшая суббота",
        hour: dm.bidHour || "10:00",
        offerPrice: rate,
        tutorPrice: sampleTut ? sampleTut.price : 1200
      }) : "";
      body = `<div class="demo-grid">
        <div class="card stack" style="gap:12px">
          <div class="row between" style="gap:8px;flex-wrap:wrap">
            <b>Выбери свою ставку за урок</b>
            <span class="chip">${esc(winLabel)} · Ykt, TG, WA, MAX</span>
          </div>
          <div class="chip-rail">
            ${rates.map((r) => `<button type="button" class="chip-btn${rate === r ? " on" : ""}" data-a="demo-rate" data-rate="${r}">${r} ₽/ч</button>`).join("")}
            <input class="input num" id="demo-rate-inp" type="number" min="500" max="3000" step="50" value="${rate}" aria-label="Своя ставка в рублях" style="width:110px">
          </div>
          <div class="fee-split-box">
            <div class="fee-pill"><span>Цена часа</span><b class="num">${rate.toLocaleString("ru-RU")} ₽/ч</b></div>
            <div class="fee-pill"><span>Выгода от рынка</span><b class="num">${saveRub > 0 ? "−" + saveRub.toLocaleString("ru-RU") + " ₽" : "По рынку"}</b></div>
            <div class="fee-pill"><span>На «Пробнике» 5 000 ₽</span><b class="num">${n5} ${plural(n5, "урок", "урока", "уроков")}</b></div>
          </div>
          <p class="small muted">На тарифе 10 000 ₽ выйдет примерно <b>${n10} ${plural(n10, "урок", "урока", "уроков")}</b>. Оплата замораживается только после согласия преподавателя. <button type="button" class="link-btn small" data-a="go" data-v="fees">Правила оплаты →</button></p>
        </div>
        <div class="card stack" style="gap:10px">
          <b class="small">Карточка заявки (пришлём уведомление при ответе)</b>
          <div class="bot-preview"><span>${esc(previewTxt)}</span></div>
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

  function landingPageHTML(opts) {
    opts = opts || {};
    const TDATA = getTDATA();
    const inside = !!opts.inside;
    const dark = typeof _ctx.effectiveDark === "function" ? _ctx.effectiveDark() : false;
    const catalogTotal = TDATA && TDATA.CATALOG_TOTAL ? TDATA.CATALOG_TOTAL.toLocaleString("ru-RU") : "2 480";
    const mktApi = EGE.views && EGE.views.marketplace;
    const quickCats = [
      ["design", "UX/UI и Моушен"],
      ["inf", "Python и IT"],
      ["eng", "Английский"],
      ["bio", "Биология / Мед"],
      ["math", "Математика"],
      ["music", "Вокал и гитара"]
    ];

    return `<div class="land-page">
      <header class="land-top">
        <div class="brand-lockup">
          ${BRAND_MARK_HTML}
          <div class="brand-text">
            <div class="brand-name">Вектор ЕГЭ</div>
            <div class="brand-sub">Огромная база · ниже рынка</div>
          </div>
        </div>
        <nav class="land-links" aria-label="Разделы лендинга">
          <a href="/brandbook" data-a="go" data-v="brandbook">Брендбук</a>
          <a href="#hero-motion-stage" data-a="land-scroll" data-target="hero-motion-stage">Подбор</a>
          <a href="#land-savings" data-a="land-scroll" data-target="land-savings">Выгода</a>
          <a href="#land-demo" data-a="land-scroll" data-target="land-demo">Бета-тест</a>
          <a href="#land-market" data-a="land-scroll" data-target="land-market">Репетиторы</a>
          <a href="#land-plans" data-a="land-scroll" data-target="land-plans">Тарифы</a>
        </nav>
        <div class="land-top-actions">
          <button type="button" class="icon-btn sm" data-a="theme-toggle" aria-label="Сменить тему" title="Сменить тему">${icon(dark ? "sun" : "moon")}</button>
          ${inside
            ? `<button type="button" class="btn sm" data-a="go" data-v="tests">В кабинет</button>`
            : `<button type="button" class="btn sm" data-a="auth-modal-open">Войти</button>`}
        </div>
      </header>

      <div class="hero-stage-wrap" id="hero-stage-wrap">
        <span class="hero-orb a" aria-hidden="true"></span>
        <span class="hero-orb b" aria-hidden="true"></span>
        <section class="land-hero">
          <div class="land-hero-copy">
            <div class="row" style="gap:6px;flex-wrap:wrap">
              <span class="chip accent">${catalogTotal}+ анкет · Ykt, TG, WA, MAX и др.</span>
              <span class="chip">Ниже рынка на 35–53%</span>
              <span class="chip pro">Ставка ±100 ₽ в 1 клик</span>
            </div>
            <h1 class="land-h1">Ищи репетиторов <span class="land-h1-grad">ниже рынка</span> для подготовки к чему угодно</h1>
            <p class="land-lead">Единая база анкет с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов: ЕГЭ и ОГЭ, Python, UX/UI и моушен-дизайн, физика, вокал и ВУЗ. Выбирай час с 10:00 до 20:00, нажимай −100 ₽ и отправляй свою ставку.</p>
            <div class="land-hero-ctas">
              <button type="button" class="btn" data-a="land-scroll" data-target="land-market">Найти ниже рынка</button>
              <button type="button" class="btn soft" data-a="land-scroll" data-target="land-demo">Попробовать бета-тест</button>
              ${inside ? `<button type="button" class="btn ghost" data-a="go" data-v="tests">Перейти к тестам</button>` : ""}
            </div>
            <div class="chip-rail" role="group" aria-label="Быстрый выбор направления">${quickCats.map(([sid, label]) => `<button type="button" class="chip-btn" data-a="hero-cat" data-subj="${sid}">${esc(label)}</button>`).join("")}</div>
            <div class="land-stats">
              <div class="land-stat"><b>${catalogTotal}+ анкет</b><span>Ykt, Telegram, WhatsApp, MAX и др.</span></div>
              <div class="land-stat"><b>Шаг ±100 ₽</b><span>Простая ставка ниже рынка</span></div>
              <div class="land-stat"><b>10:00 – 20:00</b><span>Быстрый выбор окна и ответа</span></div>
            </div>
          </div>
          ${heroMotionStageHTML()}
        </section>
      </div>

      ${marqueeSectionHTML()}

      <div class="hh-blue-banner">
        <div class="stack" style="gap:4px;max-width:58ch">
          <b style="font-size:20px">Дизайн-система и брендбук hh-стиля (Белый + Чёрный + Синий)</b>
          <span class="small">Посмотри кнопки, ползунок 10:00–20:00, прочерк цены и палитру в обеих темах отдельно на /brandbook.</span>
        </div>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button type="button" class="btn white" data-a="go" data-v="brandbook">Открыть брендбук</button>
          <button type="button" class="btn blue-ghost" data-a="land-scroll" data-target="land-market">К каталогу</button>
        </div>
      </div>

      ${savingsSectionHTML()}

      <section class="land-sec" id="land-how">
        <div class="land-sec-head">
          <div>
            <div class="eyebrow">Как это устроено</div>
            <h2 class="h2">От выбора часа до подтверждения преподавателя — в пару кликов</h2>
          </div>
        </div>
        <div class="how-grid">
          <div class="card how-card"><span class="how-num">01</span><b>Единая база из 5+ источников</b><p class="small ink2">Собираем анкеты с Доски Ykt, Telegram, WhatsApp, MAX и других сервисов по всем предметам и навыкам.</p></div>
          <div class="card how-card"><span class="how-num">02</span><b>Ползунок времени 10:00–20:00</b><p class="small ink2">Двигай удобный час с 10:00 до 20:00 и сразу видишь свободных репетиторов в нужный интервал.</p></div>
          <div class="card how-card"><span class="how-num">03</span><b>Ставка кнопками ±100 ₽</b><p class="small ink2">Выбирай удобную цену без лишних форм и нажимай «Предложить» — запрос сразу уходит преподавателю.</p></div>
          <div class="card how-card"><span class="how-num">04</span><b>Уведомление и расписание</b><p class="small ink2">Когда преподаватель подтвердит время и ставку, придёт уведомление — всё расписание в «Учёбе».</p></div>
        </div>
      </section>

      ${demoSectionHTML(inside)}
      ${mktApi ? mktApi.marketSectionHTML({ landing: true }) : ""}
      ${mktApi ? mktApi.plansSectionHTML({ landing: true }) : ""}

      <section class="land-sec" id="land-tutors">
        <div class="card pad-lg stack" style="gap:14px">
          <div class="row between" style="flex-wrap:wrap;gap:10px">
            <div>
              <div class="eyebrow">Для преподавателей</div>
              <h2 class="h2">Анкеты с Доски Ykt, Telegram, WhatsApp, MAX без наценок школ</h2>
            </div>
            <a href="/fees" class="chip accent" data-a="go" data-v="fees">Условия оплаты и расчётов →</a>
          </div>
          <div class="grid-3">
            <div class="stack" style="gap:4px"><b>Готовые заявки по времени и цене</b><p class="small ink2">Ученик выбирает час и ставку — сервис аккуратно передаёт предложение и уведомляет при ответе.</p></div>
            <div class="stack" style="gap:4px"><b>Бесплатный топ каждый день</b><p class="small ink2">Раз в сутки нажимаете «Актуален сегодня» — ваша анкета сразу поднимается вверх каталога.</p></div>
            <div class="stack" style="gap:4px"><b>Безопасный баланс и расчёты</b><p class="small ink2">Ученик пополняет баланс 5 000 или 10 000 ₽ — средства бронируются только после вашего подтверждения. <a href="/fees" data-a="go" data-v="fees" style="color:var(--accent)">Подробнее об оплате →</a></p></div>
          </div>
        </div>
      </section>

      <footer class="row between small muted" style="flex-wrap:wrap;gap:10px;padding:8px 0 18px;border-top:1px solid var(--line)">
        <span>Вектор ЕГЭ · тесты, конспекты и маркетплейс репетиторов</span>
        <div class="row" style="gap:14px;flex-wrap:wrap">
          <a href="/fees" data-a="go" data-v="fees">Условия оплаты и сбор системы</a>
          <a href="/privacy">Политика конфиденциальности</a>
          <button type="button" class="link-btn small" data-a="bug-site">Сообщить о баге (${esc(_ctx.BUG_EMAIL || "willagegg@gmail.com")})</button>
        </div>
      </footer>
    </div>`;
  }

  EGE.views = EGE.views || {};
  EGE.views.landing = {
    configure,
    MOTION_PRESETS,
    MOTION_ORDER,
    heroMotionMeta,
    patchHeroMotionDOM,
    syncHeroMotion,
    stopMotionTimers,
    pulseMotionReset,
    patchSavingsDOM,
    landingPageHTML,
    demoSectionHTML,
    marqueeSectionHTML,
    savingsSectionHTML
  };
})();
