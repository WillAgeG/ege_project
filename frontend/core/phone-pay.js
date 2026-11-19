/* Региональные телефонные поля, модалки СМС-подтверждения, контакта преподавателя и баланса / привязки карты. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});
  const { $, esc } = EGE.utils || { $: (s) => document.querySelector(s), esc: (s) => String(s || "") };
  const icon = (n) => (EGE.ui && typeof EGE.ui.icon === "function" ? EGE.ui.icon(n) : "");

  let _ctx = {};
  const _fallbackUi = {};

  function configure(ctx) {
    _ctx = ctx || {};
  }
  function getUi() { return _ctx.ui || _fallbackUi; }
  function getStore() { return _ctx.store || {}; }
  function getTDATA() { return _ctx.TDATA || EGE.tutors || null; }
  function getMkt() { return typeof _ctx.mkt === "function" ? _ctx.mkt() : {}; }
  function saveMkt() { if (typeof _ctx.saveMkt === "function") _ctx.saveMkt(); }
  function getProfile() { return typeof _ctx.profile === "function" ? _ctx.profile() : { phone: "", phoneCountry: "RU" }; }
  function getDraft(k, fb) { return typeof _ctx.draft === "function" ? _ctx.draft(k, fb) : fb; }
  function renderModal() { if (typeof _ctx.renderModal === "function") _ctx.renderModal(); }
  function scheduleRender(top) { if (typeof _ctx.scheduleRender === "function") _ctx.scheduleRender(top); }
  function notifySide(t, m) { if (typeof _ctx.notifySide === "function") _ctx.notifySide(t, m); }
  function toast(m, o) { if (typeof _ctx.toast === "function") _ctx.toast(m, o); }

  const PHONE_COUNTRIES = [
    { code: "RU", name: "Россия", flag: "🇷🇺", dial: "7", len: 10, mask: "ru", placeholder: "+7 (914) 210-05-11" },
    { code: "KZ", name: "Казахстан", flag: "🇰🇿", dial: "7", len: 10, mask: "ru", placeholder: "+7 (701) 123-45-67" },
    { code: "BY", name: "Беларусь", flag: "🇧🇾", dial: "375", len: 9, mask: "by", placeholder: "+375 (29) 123-45-67" },
    { code: "UZ", name: "Узбекистан", flag: "🇺🇿", dial: "998", len: 9, mask: "by", placeholder: "+998 (90) 123-45-67" },
    { code: "KG", name: "Кыргызстан", flag: "🇰🇬", dial: "996", len: 9, mask: "kg", placeholder: "+996 (555) 123-456" },
    { code: "AM", name: "Армения", flag: "🇦🇲", dial: "374", len: 8, mask: "am", placeholder: "+374 (77) 123-456" },
    { code: "AZ", name: "Азербайджан", flag: "🇦🇿", dial: "994", len: 9, mask: "by", placeholder: "+994 (50) 123-45-67" },
    { code: "GE", name: "Грузия", flag: "🇬🇪", dial: "995", len: 9, mask: "kg", placeholder: "+995 (555) 123-456" },
    { code: "TJ", name: "Таджикистан", flag: "🇹🇯", dial: "992", len: 9, mask: "by", placeholder: "+992 (90) 123-45-67" },
    { code: "OTHER", name: "Другая страна", flag: "🌍", dial: "", len: 15, mask: "intl", placeholder: "+1 415 555 0199" }
  ];

  function phoneCountryByCode(code) {
    return PHONE_COUNTRIES.find((c) => c.code === code) || PHONE_COUNTRIES[0];
  }

  function formatPhoneForCountry(raw, countryCode) {
    const trimmed = String(raw || "").trim();
    const digits = String(raw || "").replace(/\D+/g, "");
    let c = phoneCountryByCode(countryCode);
    if (trimmed.startsWith("+") && c.code !== "OTHER") {
      const explicitMatch = PHONE_COUNTRIES.find((x) => x.dial && x.dial.length > 1 && digits.startsWith(x.dial));
      if (explicitMatch) c = explicitMatch;
    }
    if (c.mask === "intl") {
      const d = digits.slice(0, 15);
      if (!d) return { formatted: trimmed === "+" ? "+" : "", nationalDigits: "", country: c, valid: false };
      const groups = [];
      const g1 = d.length > 10 ? d.length - 10 : Math.min(3, d.length);
      groups.push(d.slice(0, g1));
      let i = g1;
      while (i < d.length) {
        const take = (d.length - i) <= 4 ? (d.length - i) : 3;
        groups.push(d.slice(i, i + take));
        i += take;
      }
      return { formatted: "+" + groups.join(" "), nationalDigits: d, country: c, valid: d.length >= 7 && d.length <= 15 };
    }
    let national = digits;
    if (c.dial === "7") {
      if (trimmed.startsWith("+")) {
        national = digits.startsWith("7") ? digits.slice(1) : digits;
      } else if (!digits) {
        national = "";
      } else if (digits.length === 1) {
        if ((digits === "8" && c.code === "RU") || (digits === "7" && c.code === "RU")) national = "";
        else national = digits;
      } else if (digits.length > 10 && (digits[0] === "7" || (c.code === "RU" && digits[0] === "8"))) {
        national = digits.slice(1);
      } else if (digits.length <= 10 && c.code === "RU" && (digits[0] === "7" || digits[0] === "8") && digits[1] === "9") {
        national = digits.slice(1);
      }
      national = national.slice(0, 10);
      if (!digits) return { formatted: trimmed === "+" ? "+" : "", nationalDigits: "", country: c, valid: false };
      if (!national) return { formatted: trimmed === "+7" ? "+7" : "+7 ", nationalDigits: "", country: c, valid: false };
      let out = "+7 (" + national.slice(0, 3);
      if (national.length > 3) out += ") " + national.slice(3, 6);
      if (national.length > 6) out += "-" + national.slice(6, 8);
      if (national.length > 8) out += "-" + national.slice(8, 10);
      return { formatted: out, nationalDigits: national, country: c, valid: national.length === 10 };
    }
    if (trimmed.startsWith("+") && digits.startsWith(c.dial)) national = digits.slice(c.dial.length);
    else if (digits.startsWith(c.dial) && digits.length >= c.dial.length + c.len) national = digits.slice(c.dial.length);
    national = national.slice(0, c.len);
    if (!digits) return { formatted: trimmed === "+" ? "+" : "", nationalDigits: "", country: c, valid: false };
    if (!national) {
      const bareDial = "+" + c.dial;
      return { formatted: trimmed === bareDial ? bareDial : (bareDial + " "), nationalDigits: "", country: c, valid: false };
    }
    let out = "+" + c.dial + " (";
    if (c.mask === "by") {
      out += national.slice(0, 2);
      if (national.length > 2) out += ") " + national.slice(2, 5);
      if (national.length > 5) out += "-" + national.slice(5, 7);
      if (national.length > 7) out += "-" + national.slice(7, 9);
    } else if (c.mask === "kg") {
      out += national.slice(0, 3);
      if (national.length > 3) out += ") " + national.slice(3, 6);
      if (national.length > 6) out += "-" + national.slice(6, 9);
    } else {
      out += national.slice(0, 2);
      if (national.length > 2) out += ") " + national.slice(2, 5);
      if (national.length > 5) out += "-" + national.slice(5, 8);
    }
    return { formatted: out, nationalDigits: national, country: c, valid: national.length === c.len };
  }

  function detectPhoneCountry(raw, fallbackCode) {
    const trimmed = String(raw || "").trim();
    const digits = String(raw || "").replace(/\D+/g, "");
    const fb = phoneCountryByCode(fallbackCode || "RU").code;
    if (trimmed.startsWith("+") && digits) {
      const explicitMatch = PHONE_COUNTRIES.find((x) => x.dial && x.dial.length > 1 && digits.startsWith(x.dial));
      if (explicitMatch) return explicitMatch.code;
      if (digits.startsWith("7")) return fb === "KZ" ? "KZ" : "RU";
    }
    return fb;
  }

  function getPhoneFieldState(scope, fallbackCountry, forceReset) {
    const ui = getUi();
    const map = ui.phoneFields || (ui.phoneFields = {});
    const key = String(scope || "phone");
    const fbCode = phoneCountryByCode(fallbackCountry || "RU").code;
    if (!map[key] || forceReset) {
      map[key] = { country: fbCode, menuOpen: false, userPicked: false };
    } else if (!map[key].userPicked && fallbackCountry && PHONE_COUNTRIES.some((c) => c.code === fbCode) && map[key].country !== fbCode) {
      map[key].country = fbCode;
    }
    return map[key];
  }

  function stripEmptyDialPhone(raw, countryCode) {
    const str = String(raw || "").trim();
    if (!str) return "";
    const parsed = formatPhoneForCountry(str, countryCode || "RU");
    return parsed.nationalDigits ? parsed.formatted : "";
  }

  function syncPhoneScopeState(scope, formatted, countryCode) {
    const ui = getUi();
    const s = String(scope || "");
    if (s === "pf-phone") {
      if (!ui.drafts) ui.drafts = {};
      ui.drafts["pf.phone"] = formatted;
      ui.drafts["pf.phoneCountry"] = countryCode;
    } else if (s === "tc-contact" && ui.tutorContactModal) {
      ui.tutorContactModal.value = formatted;
      ui.tutorContactModal.country = countryCode;
      ui.tutorContactModal.error = "";
    } else if (s === "lead-wa" && ui.leadDraft) {
      ui.leadDraft.whatsapp = formatted;
      ui.leadDraft.whatsappCountry = countryCode;
    }
  }

  function phoneFieldHTML(opts) {
    opts = opts || {};
    const scope = String(opts.scope || opts.id || "phone");
    const id = String(opts.id || scope);
    const name = String(opts.name || "phone");
    const rawVal = opts.value == null ? "" : String(opts.value);
    const st = getPhoneFieldState(scope, detectPhoneCountry(rawVal, opts.country || "RU"));
    const country = phoneCountryByCode(st.country || "RU");
    const parsed = rawVal.trim() ? formatPhoneForCountry(rawVal, country.code) : null;
    const displayVal = (parsed && parsed.formatted) ? parsed.formatted : (country.dial ? ("+" + country.dial + " ") : "+");
    const compactCls = opts.compact === false ? "" : " is-compact";
    const dataDAttr = opts.dataD ? ` data-d="${esc(opts.dataD)}"` : "";
    const extraAttrs = opts.extraAttrs ? (" " + opts.extraAttrs) : "";
    const menuHTML = st.menuOpen
      ? `<div class="cv-country-menu" role="listbox" aria-label="Выбор региона">
          ${PHONE_COUNTRIES.map((c) => {
            const on = c.code === country.code;
            const codeText = c.dial ? ("+" + c.dial) : "Код";
            return `<button type="button" class="cv-country-opt${on ? " is-on" : ""}" data-a="phone-country-pick" data-scope="${esc(scope)}" data-input-id="${esc(id)}" data-v="${esc(c.code)}" role="option" aria-selected="${on ? "true" : "false"}">
              <span>${c.flag} ${esc(c.name)}</span>
              <span class="small num muted">${esc(codeText)}</span>
            </button>`;
          }).join("")}
        </div>`
      : "";
    return `<div class="field cv-phone-field${compactCls}" id="phone-field-${esc(scope)}">
      ${opts.label ? `<label for="${esc(id)}">${esc(opts.label)} (${esc(country.name)})</label>` : ""}
      <div class="cv-phone-wrap">
        <button type="button" class="cv-country-btn" data-a="phone-country-toggle" data-scope="${esc(scope)}" aria-expanded="${st.menuOpen ? "true" : "false"}" aria-label="Выбрать регион: ${esc(country.name)}">
          <span>${country.flag}</span>
          <span>${esc(country.code === "OTHER" ? "Мир" : country.code)}</span>
          ${icon("chevDown")}
        </button>
        <input class="cv-phone-inp num" id="${esc(id)}" name="${esc(name)}" type="tel" inputmode="tel" autocomplete="tel" data-phone-scope="${esc(scope)}"${dataDAttr}${extraAttrs} maxlength="28" placeholder="${esc(country.placeholder)}" value="${esc(displayVal)}">
      </div>
      ${menuHTML}
    </div>`;
  }

  function detectCardMeta(rawNum) {
    if (EGE.ui && typeof EGE.ui.detectCardMeta === "function") return EGE.ui.detectCardMeta(rawNum);
    const d = String(rawNum || "").replace(/\D+/g, "");
    let brand = "Карта РФ";
    if (!d || /^220[0-4]/.test(d) || d === "2" || d === "22" || d === "220") brand = "МИР";
    else if (/^5[1-5]/.test(d) || /^(?:222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(d)) brand = "Mastercard";
    else if (/^4/.test(d)) brand = "VISA";
    else if (/^62/.test(d)) brand = "UnionPay";
    return { brand, bankName: "", bankTheme: "default", bin: d.slice(0, 6) };
  }

  function cardNetHTML(brand, opts) {
    if (EGE.ui && typeof EGE.ui.cardNetworkLogoHTML === "function") return EGE.ui.cardNetworkLogoHTML(brand, opts);
    return `<span class="ygo-net-fallback">${esc(brand || "МИР")}</span>`;
  }

  function savedCardsForMarket(st) {
    if (st && Array.isArray(st.savedCards) && st.savedCards.length) return st.savedCards;
    if (st && st.savedCard && st.savedCard.last4) {
      return [Object.assign({ id: st.savedCard.id || "card-1", brand: st.savedCard.brand || "МИР" }, st.savedCard)];
    }
    return [];
  }

  function calcBalanceTopupMeta(rawAmount, method) {
    const clean = String(rawAmount == null ? "" : rawAmount).replace(/\D+/g, "");
    const amt = clean === "" ? 0 : Math.max(0, Math.min(200000, Math.round(Number(clean) || 0)));
    const isCard = method === "card";
    const fee = isCard ? Math.round(amt * 0.03) : 0;
    const total = amt + fee;
    return {
      amt,
      isCard,
      fee,
      total,
      feeText: isCard
        ? `На баланс: ${amt.toLocaleString("ru-RU")} ₽ · Комиссия карты 3%: +${fee.toLocaleString("ru-RU")} ₽ · К списанию: ${total.toLocaleString("ru-RU")} ₽`
        : `Комиссия 0% · На баланс зачислится ровно ${amt.toLocaleString("ru-RU")} ₽`,
      btnText: isCard
        ? `Пополнить на ${amt.toLocaleString("ru-RU")} ₽ · Карта (${total.toLocaleString("ru-RU")} ₽)`
        : `Пополнить на ${amt.toLocaleString("ru-RU")} ₽ по СБП`
    };
  }

  function updateBalanceModalLive() {
    const ui = getUi();
    if (!ui.balanceModal || typeof document === "undefined") return;
    const meta = calcBalanceTopupMeta(ui.balanceModal.customAmount, ui.balanceModal.method);
    const feeEl = typeof document.getElementById === "function" ? document.getElementById("bal-fee-line") : null;
    if (feeEl) feeEl.textContent = meta.feeText;
    const btnEl = typeof document.getElementById === "function" ? document.getElementById("bal-submit-btn") : null;
    if (btnEl) btnEl.textContent = meta.btnText;
    if (typeof document.querySelectorAll === "function") {
      document.querySelectorAll('[data-a="bal-chip"]').forEach((chip) => {
        const cv = Number(chip.getAttribute && chip.getAttribute("data-v"));
        const on = meta.amt > 0 && cv === meta.amt;
        if (chip.classList) chip.classList.toggle("is-on", on);
      });
    }
  }

  function balanceTopWidgetHTML(compact) {
    const st = getMkt();
    if (EGE.kit && typeof EGE.kit.topBalanceWidgetHTML === "function") {
      return EGE.kit.topBalanceWidgetHTML({
        role: "student",
        amountRub: st.balance,
        compact: !!compact,
        pillAction: "bal-open",
        btnAction: "bal-open"
      });
    }
    const funded = (Number(st.balance) || 0) >= 5000;
    return `<div class="top-bal-wrap" aria-label="Баланс ученика">
      <button type="button" class="top-bal-pill${funded ? " is-funded" : ""}" data-a="bal-open" title="Баланс и пополнение">
        ${icon("wallet")}
        ${compact ? "" : `<span class="top-bal-lbl muted">Баланс:</span>`}
        <b class="num">${st.balance.toLocaleString("ru-RU")} ₽</b>
      </button>
      <button type="button" class="top-bal-btn" data-a="bal-open" aria-label="Пополнить баланс" title="Пополнить баланс">${icon("plus")}<span>Пополнить</span></button>
    </div>`;
  }

  function balanceModalHTML() {
    const ui = getUi();
    const bm = ui.balanceModal;
    if (!bm) return "";
    const st = getMkt();
    const TDATA = getTDATA();
    const trialRub = (TDATA && TDATA.TRIAL_PRICE != null) ? Number(TDATA.TRIAL_PRICE) : 490;
    const minTopup = st.initialPaid ? 100 : trialRub;
    const cards = savedCardsForMarket(st);
    const method = (bm.method === "card" && cards.length) ? "card" : "sbp";
    const activeCardId = bm.selectedCardId || (cards[0] && cards[0].id) || "";
    const customVal = bm.customAmount != null ? String(bm.customAmount) : String(minTopup);
    const meta = calcBalanceTopupMeta(customVal, method);
    const chipVals = st.initialPaid ? [500, 1000, 1500, 3000] : [trialRub, 1000, 2150, 4590];
    if (meta.amt >= minTopup && !chipVals.includes(meta.amt)) chipVals.unshift(meta.amt);
    const sbpMark = (EGE.ui && typeof EGE.ui.sbpLogoSVG === "function")
      ? EGE.ui.sbpLogoSVG(28)
      : '<svg class="ygo-sbp-svg" width="23" height="28" viewBox="0 0 266 325" fill="none" role="img" aria-label="СБП"><title>СБП</title><polygon points="114,0 152,70 152,116 114,140" fill="#F1BA46"/><polygon points="114,0 266,93 188,93 152,70" fill="#E07C3E"/><polygon points="0,255 40,183 152,116 152,163" fill="#8E4D91"/><polygon points="152,116 188,93 266,93 152,163" fill="#C72C54"/><polygon points="0,70 40,142 40,183 0,255" fill="#5D579F"/><polygon points="114,186 152,209 152,255 114,325" fill="#76AF46"/><polygon points="114,325 152,255 188,232 266,232" fill="#377D3F"/><polygon points="0,70 266,232 188,232 40,142" fill="#4286C5"/></svg>';
    const checkSvg = '<span class="ygo-check" aria-hidden="true">' + icon("check") + '</span>';
    const cardTilesHTML = cards.map((c) => {
      const isSel = method === "card" && activeCardId === c.id;
      const inferred = c.bin ? detectCardMeta(c.bin) : null;
      const bankLabel = c.bankName || (inferred && inferred.bankName) || "";
      const netBrand = (!c.brand || c.brand === "Карта РФ") ? "МИР" : c.brand;
      const tileTitle = bankLabel ? `${esc(bankLabel)} · •• ${esc(c.last4)}` : `•• ${esc(c.last4)}`;
      return `<button type="button" class="ygo-pay-tile${isSel ? " is-on" : ""}" data-a="bal-method" data-v="card" data-card-id="${esc(c.id)}" role="radio" aria-checked="${isSel ? "true" : "false"}">
        <div class="ygo-tile-top">
          <span class="ygo-tile-net">${cardNetHTML(netBrand, { height: 15, tone: "light", defaultMir: true })}</span>
          ${isSel ? checkSvg : ""}
        </div>
        <div class="ygo-tile-copy">
          <b>${tileTitle}</b>
          <span>Комиссия +3%</span>
        </div>
      </button>`;
    }).join("");
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="bal-modal-title">
      <div class="modal-card sheet-modal is-balance-sheet" data-sheet-kind="balance">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="bal-close" aria-label="Свернуть окно баланса">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row" style="gap:8px">${icon("wallet")}<b id="bal-modal-title">Баланс и пополнение</b></div>
        </div>
        <div class="sheet-body">
          <div class="bal-flat-sec">
            <span class="small muted">Баланс ученика</span>
            <strong class="bal-flat-amount num">${(Number(st.balance) || 0).toLocaleString("ru-RU")} ₽</strong>
            ${bm.reason ? `<span class="bal-flat-need">${esc(bm.reason)}</span>` : ""}
          </div>
          <div class="bal-flat-sec">
            <b class="small">Как работает оплата и защита счёта</b>
            <p class="bal-flat-copy">Деньги хранятся на защищённом счёте и переводятся преподавателю только после проведения урока. Контакты в WhatsApp, Telegram и MAX открываются сразу после отправки заявки.</p>
          </div>
          <div class="stack" style="gap:8px">
            <span class="label">Способ оплаты</span>
            <div class="ygo-pay-rail" role="radiogroup" aria-label="Способ оплаты">
              <button type="button" class="ygo-pay-tile${method === "sbp" ? " is-on" : ""}" data-a="bal-method" data-v="sbp" role="radio" aria-checked="${method === "sbp" ? "true" : "false"}">
                <div class="ygo-tile-top">
                  <span class="ygo-sbp-badge">${sbpMark}</span>
                  ${method === "sbp" ? checkSvg : ""}
                </div>
                <div class="ygo-tile-copy">
                  <b>СБП</b>
                  <span class="is-free">Комиссия 0%</span>
                </div>
              </button>
              ${cardTilesHTML}
              <button type="button" class="ygo-pay-tile" data-a="bal-card-open">
                <div class="ygo-tile-top">
                  <span class="ygo-add-badge">${icon("plus")}</span>
                </div>
                <div class="ygo-tile-copy">
                  <b>Добавить карту</b>
                  <span>МИР, Visa, Mastercard · +3%</span>
                </div>
              </button>
            </div>
          </div>
          <form class="stack" style="gap:10px" data-f="bal-custom">
            <div class="stack" style="gap:8px">
              <label for="bal-custom-amount" class="label">Сумма зачисления (${st.initialPaid ? "от 100 ₽" : `первый платёж от ${trialRub} ₽`})</label>
              <div class="chip-rail">
                ${chipVals.map((v) => `<button type="button" class="chip-btn${meta.amt === v ? " is-on" : ""}" data-a="bal-chip" data-v="${v}">${v.toLocaleString("ru-RU")} ₽</button>`).join("")}
              </div>
            </div>
            <div class="bal-amount-box">
              <input class="bal-amount-inp num" id="bal-custom-amount" name="amount" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="6" value="${esc(customVal)}" placeholder="${st.initialPaid ? "От 100" : `От ${trialRub}`}">
              <span class="bal-amount-cur">₽</span>
            </div>
            <div class="bal-fee-line" id="bal-fee-line">${esc(meta.feeText)}</div>
            ${bm.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(bm.error)}</div>` : ""}
            <button type="submit" class="btn bal-submit-btn" id="bal-submit-btn">${esc(meta.btnText)}</button>
          </form>
        </div>
      </div>
    </div>`;
  }

  function cardBindModalHTML() {
    const cb = getUi().cardBindModal;
    if (!cb) return "";
    const meta = detectCardMeta(cb.cardNum);
    const chipSvg = '<svg width="36" height="26" viewBox="0 0 36 26" fill="none" aria-hidden="true"><rect x=".75" y=".75" width="34.5" height="24.5" rx="5.25" fill="#e5c07b" fill-opacity=".9" stroke="#bfa05a" stroke-width="1.2"/><path d="M12 1v24M24 1v24M1 9.5h11M1 16.5h11M24 9.5h11M24 16.5h11" stroke="#8c6d2c" stroke-width="1.1"/></svg>';
    const nfcSvg = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 16a6 6 0 0 1 0-8"/><path d="M10 18a10 10 0 0 1 0-12"/><path d="M14 20a14 14 0 0 1 0-16"/></svg>';
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="card-bind-title">
      <div class="modal-card sheet-modal is-card-bind-sheet" data-sheet-kind="card-bind">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="bal-card-close" aria-label="Свернуть добавление карты">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <button type="button" class="sheet-back-btn" data-a="bal-card-close">${icon("back")}<span>Назад</span></button>
          <b id="card-bind-title">Добавить карту</b>
          <span style="width:64px" aria-hidden="true"></span>
        </div>
        <div class="sheet-body">
          <form class="stack" style="gap:14px" data-f="bal-card-bind">
            <div class="ygo-bank-card" id="ygo-bind-card" data-bank="${esc(meta.bankTheme || "default")}">
              <div class="ygo-card-top">
                <div class="ygo-chip-wrap">${chipSvg}${nfcSvg}<span class="ygo-card-bank" id="ygo-card-bank">${esc(meta.bankName || "")}</span></div>
                <span class="ygo-brand-slot" id="ygo-card-brand">${cardNetHTML(meta.brand, { height: 18, tone: "dark" })}</span>
              </div>
              <div class="ygo-card-field">
                <label class="ygo-card-lbl" for="bal-card-num">Номер карты</label>
                <input class="ygo-card-inp num" id="bal-card-num" name="cardNum" type="text" inputmode="numeric" autocomplete="cc-number" maxlength="19" placeholder="2202 2000 0000 0000" value="${esc(cb.cardNum || "")}">
              </div>
              <div class="ygo-card-bottom2">
                <div class="ygo-card-field">
                  <label class="ygo-card-lbl" for="bal-card-exp">Срок действия</label>
                  <input class="ygo-card-inp num" id="bal-card-exp" name="cardExp" type="text" inputmode="numeric" autocomplete="cc-exp" maxlength="5" placeholder="ММ/ГГ" value="${esc(cb.cardExp || "")}">
                </div>
                <div class="ygo-card-field">
                  <label class="ygo-card-lbl" for="bal-card-cvc">Код CVC</label>
                  <input class="ygo-card-inp num" id="bal-card-cvc" name="cardCvc" type="password" inputmode="numeric" autocomplete="cc-csc" maxlength="3" placeholder="•••" value="${esc(cb.cardCvc || "")}">
                </div>
              </div>
            </div>
            <label class="row small" style="gap:8px;cursor:pointer">
              <input type="checkbox" id="bal-save-card" ${cb.saveCard !== false ? "checked" : ""}>
              <span>Сохранить карту для быстрых пополнений</span>
            </label>
            <div class="ygo-sec-note">
              ${icon("shield")}
              <span>Данные передаются по защищённому каналу. Для проверки карты спишется и сразу вернётся 1 ₽ · при пополнении комиссия +3%.</span>
            </div>
            ${cb.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(cb.error)}</div>` : ""}
            <button type="submit" class="btn bal-submit-btn" id="bal-card-submit">Привязать карту</button>
          </form>
        </div>
      </div>
    </div>`;
  }

  function openContactVerifyModal(opts) {
    opts = opts || {};
    const ui = getUi();
    const existing = getMkt().verifiedContact;
    const countryCode = (opts.country && phoneCountryByCode(opts.country).code)
      || (existing && existing.country && phoneCountryByCode(existing.country).code)
      || "RU";
    const defCountry = phoneCountryByCode(countryCode);
    const seedContact = opts.contact || (existing && existing.value) || (defCountry.dial ? ("+" + defCountry.dial + " ") : "");
    ui.contactVerifyModal = {
      step: "input",
      country: defCountry.code,
      countryMenuOpen: false,
      contact: seedContact,
      digits: ["", "", "", ""],
      expectedCode: "4829",
      required: opts.required !== false,
      fromGoogleDemo: !!opts.fromGoogleDemo,
      error: ""
    };
    renderModal();
  }

  function contactVerifyModalHTML() {
    const cv = getUi().contactVerifyModal;
    if (!cv) return "";
    const store = getStore();
    const isOtp = cv.step === "otp";
    const country = phoneCountryByCode(cv.country || "RU");
    const digits = Array.isArray(cv.digits) ? cv.digits : ["", "", "", ""];
    const countryMenuHTML = cv.countryMenuOpen
      ? `<div class="cv-country-menu" role="listbox" aria-label="Выбор страны">
          ${PHONE_COUNTRIES.map((c) => {
            const on = c.code === country.code;
            const codeText = c.dial ? ("+" + c.dial) : "Код";
            return `<button type="button" class="cv-country-opt${on ? " is-on" : ""}" data-a="cv-country-pick" data-v="${esc(c.code)}" role="option" aria-selected="${on ? "true" : "false"}">
              <span>${c.flag} ${esc(c.name)}</span>
              <span class="small num muted">${esc(codeText)}</span>
            </button>`;
          }).join("")}
        </div>`
      : "";
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="cv-modal-title">
      <div class="modal-card sheet-modal is-contact-verify-sheet" data-sheet-kind="contact-verify">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="cv-close" aria-label="Свернуть подтверждение номера">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          ${isOtp
            ? `<button type="button" class="sheet-back-btn" data-a="cv-back">${icon("back")}<span>Номер</span></button>`
            : `<span style="width:64px" aria-hidden="true"></span>`}
          <b id="cv-modal-title">${isOtp ? "Код из СМС" : "Подтвердите номер телефона"}</b>
          <span style="width:64px" aria-hidden="true"></span>
        </div>
        <div class="sheet-body">
          ${!isOtp ? `
            <p class="small ink2" style="margin:0;line-height:1.48">Обязательный шаг: введите номер телефона — мы отправим обычное СМС с кодом из 4 цифр для подтверждения аккаунта.</p>
            <form class="stack" style="gap:12px" data-f="contact-verify-send">
              <div class="cv-phone-field" id="cv-phone-field">
                <label for="cv-contact-inp">Номер телефона (${esc(country.name)})</label>
                <div class="cv-phone-wrap">
                  <button type="button" class="cv-country-btn" data-a="cv-country-toggle" aria-expanded="${cv.countryMenuOpen ? "true" : "false"}" aria-label="Выбрать страну: ${esc(country.name)}">
                    <span>${country.flag}</span>
                    <span>${esc(country.code === "OTHER" ? "Мир" : country.code)}</span>
                    ${icon("chevDown")}
                  </button>
                  <input class="cv-phone-inp num" id="cv-contact-inp" name="contact" type="tel" inputmode="tel" autocomplete="tel" placeholder="${esc(country.placeholder)}" value="${esc(cv.contact || "")}">
                </div>
                ${countryMenuHTML}
              </div>
              ${cv.error ? `<div class="small" style="color:var(--bad);font-weight:600">${esc(cv.error)}</div>` : ""}
              <button type="submit" class="btn bal-submit-btn" id="cv-send-btn">Получить СМС с кодом</button>
              <div class="row center" style="gap:12px">
                ${cv.fromGoogleDemo
                  ? `<button type="button" class="link-btn small" data-a="cv-close">Назад ко входу</button>`
                  : (store.user ? `<button type="button" class="link-btn small" data-a="auth-logout">Выйти из аккаунта</button>` : "")}
              </div>
            </form>
          ` : `
            <p class="small ink2" style="margin:0;line-height:1.48">Мы отправили СМС с 4-значным кодом на номер <b>${esc(cv.contact)}</b>. Введите код из сообщения, чтобы подтвердить аккаунт.</p>
            <div class="cv-demo-push">
              <div class="cv-demo-push-copy">
                <b>СМС · Вектор</b>
                <span>Код подтверждения аккаунта: <b class="num">${esc(cv.expectedCode)}</b></span>
              </div>
              <button type="button" class="chip-btn" data-a="cv-autofill">Подставить</button>
            </div>
            <form class="stack" style="gap:14px" data-f="contact-verify-check">
              <div class="otp-4-grid" aria-label="Код из СМС (4 цифры)">
                ${[0, 1, 2, 3].map((idx) => `<input class="otp-digit-box" id="cv-d${idx}" data-otp-idx="${idx}" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="${idx === 0 ? "one-time-code" : "off"}" value="${esc(digits[idx] || "")}" aria-label="Цифра ${idx + 1}">`).join("")}
              </div>
              ${cv.error ? `<div class="small" style="color:var(--bad);font-weight:600;text-align:center">${esc(cv.error)}</div>` : ""}
              <button type="submit" class="btn bal-submit-btn" id="cv-check-btn">Подтвердить аккаунт</button>
              <div class="row center small" style="gap:8px">
                <span class="muted">Не пришло СМС?</span>
                <button type="button" class="link-btn small" data-a="cv-resend">Отправить снова</button>
              </div>
            </form>
          `}
        </div>
      </div>
    </div>`;
  }

  function openTutorContactModal(tutorId, tutorName, ch) {
    const ui = getUi();
    const TDATA = getTDATA();
    const channel = ch === "wa" ? "wa" : (ch === "max" ? "max" : "tg");
    const st = getMkt();
    const map = st.tutorContacts && typeof st.tutorContacts === "object" ? st.tutorContacts : {};
    const ov = (tutorId && map[tutorId]) || {};
    const tutorObj = TDATA && Array.isArray(TDATA.LIST) ? TDATA.LIST.find((x) => x.id === tutorId) : null;
    const resolvedName = tutorName || (tutorObj && tutorObj.name) || "Преподаватель";
    let curVal = "";
    let waCountry = "RU";
    if (channel === "wa") {
      const rawWa = String(ov.whatsapp || (tutorObj && tutorObj.whatsapp) || "").trim();
      waCountry = detectPhoneCountry(rawWa, "RU");
      const parsedWa = rawWa ? formatPhoneForCountry(rawWa, waCountry) : null;
      curVal = parsedWa && parsedWa.formatted ? parsedWa.formatted : ("+" + phoneCountryByCode(waCountry).dial + " ");
      getPhoneFieldState("tc-contact", waCountry, true);
    } else if (channel === "max") {
      curVal = String(ov.maxHandle || (tutorObj && tutorObj.maxHandle) || "");
    } else {
      curVal = String(ov.telegram || (tutorObj && tutorObj.telegram) || "");
    }
    ui.tutorContactModal = {
      tutorId: String(tutorId || ""),
      tutorName: resolvedName,
      channel,
      country: waCountry,
      value: curVal,
      hasExisting: Boolean(channel === "wa" ? stripEmptyDialPhone(curVal, waCountry) : (curVal && curVal.trim())),
      error: ""
    };
    ui.focusNext = "tc-contact-inp";
    renderModal();
  }

  function tutorContactModalHTML() {
    const m = getUi().tutorContactModal || { tutorId: "", tutorName: "Преподаватель", channel: "tg", country: "RU", value: "", hasExisting: false, error: "" };
    const isWa = m.channel === "wa";
    const isMax = m.channel === "max";
    const chName = isWa ? "WhatsApp" : (isMax ? "MAX" : "Telegram");
    const ph = isMax ? "@username или ссылка max.ru/..." : "@username или +7 (914) 000-00-00";
    const titlePrefix = m.hasExisting ? "Изменить" : "Указать";
    const desc = isWa
      ? `Укажите актуальный номер WhatsApp преподавателя ${esc(m.tutorName || "")} — кнопка перехода в чат обновится сразу.`
      : (m.hasExisting
          ? `Обновите контакт преподавателя ${esc(m.tutorName || "")} в ${chName} — кнопка перехода обновится сразу.`
          : `${esc(m.tutorName || "Преподаватель")} пока подключён только через WhatsApp. Если вы узнали его контакт в ${chName}, сохраните его — кнопка сразу станет активной.`);
    return `<div class="modal-back is-sheet-back" role="dialog" aria-modal="true" aria-labelledby="tcm-modal-title">
      <div class="modal-card sheet-modal" data-sheet-kind="tutor-contact">
        <div class="sheet-grabber-zone" data-sheet-drag="1" role="button" tabindex="0" data-a="tutor-contact-close" aria-label="Свернуть окно">
          <span class="sheet-grabber"></span>
        </div>
        <div class="sheet-head is-booking-head">
          <div class="row" style="gap:8px">${icon("msg")}<b id="tcm-modal-title">${titlePrefix} ${chName} преподавателя</b></div>
        </div>
        <div class="sheet-body">
          <p class="small ink2" style="margin:0;line-height:1.45">${desc}</p>
          <form class="stack" style="gap:12px" data-f="tutor-contact-save">
            ${isWa
              ? `${phoneFieldHTML({ scope: "tc-contact", id: "tc-contact-inp", name: "contact", label: "Номер телефона WhatsApp", value: m.value || "", country: m.country || "RU", compact: false })}${m.error ? `<span class="small" style="color:var(--bad);font-weight:600">${esc(m.error)}</span>` : ""}`
              : `<div class="field">
                  <label for="tc-contact-inp">Ник, телефон или ссылка в ${chName}</label>
                  <input class="input" id="tc-contact-inp" name="contact" type="text" maxlength="64" placeholder="${esc(ph)}" value="${esc(m.value || "")}">
                  ${m.error ? `<span class="small" style="color:var(--bad);font-weight:600">${esc(m.error)}</span>` : ""}
                </div>`}
            <div class="stack" style="gap:8px">
              <button type="submit" class="btn sm" style="width:100%;justify-content:center">Сохранить контакт</button>
              <button type="button" class="btn ghost sm" style="width:100%;justify-content:center" data-a="tutor-contact-close">Отмена</button>
            </div>
          </form>
        </div>
      </div>
    </div>`;
  }

  function handleBalanceFieldInput(el) {
    const ui = getUi();
    if (!el) return false;
    if (el.id === "bal-custom-amount") {
      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 6);
      if (el.value !== digits) el.value = digits;
      if (ui.balanceModal) {
        ui.balanceModal.customAmount = digits;
        ui.balanceModal.error = "";
        updateBalanceModalLive();
      }
      return true;
    }
    if (el.id === "bal-card-num") {
      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 16);
      const formatted = digits.replace(/(\d{4})(?=\d)/g, "$1 ");
      if (el.value !== formatted) el.value = formatted;
      const target = ui.cardBindModal || ui.balanceModal;
      if (target) { target.cardNum = formatted; target.error = ""; }
      const meta = detectCardMeta(digits);
      if (typeof document !== "undefined" && document.getElementById) {
        const brandEl = document.getElementById("ygo-card-brand");
        if (brandEl) brandEl.innerHTML = cardNetHTML(meta.brand, { height: 18, tone: "dark" });
        const bankEl = document.getElementById("ygo-card-bank");
        if (bankEl) bankEl.textContent = meta.bankName || "";
        const cardBox = document.getElementById("ygo-bind-card");
        if (cardBox && typeof cardBox.setAttribute === "function") cardBox.setAttribute("data-bank", meta.bankTheme || "default");
      }
      if (digits.length === 16 && typeof document !== "undefined" && document.getElementById) {
        const expEl = document.getElementById("bal-card-exp");
        if (expEl && typeof expEl.focus === "function") expEl.focus();
      }
      return true;
    }
    if (el.id === "bal-card-exp") {
      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 4);
      const formatted = digits.length > 2 ? (digits.slice(0, 2) + "/" + digits.slice(2)) : digits;
      if (el.value !== formatted) el.value = formatted;
      const target = ui.cardBindModal || ui.balanceModal;
      if (target) { target.cardExp = formatted; target.error = ""; }
      if (digits.length === 4 && typeof document !== "undefined" && document.getElementById) {
        const cvcEl = document.getElementById("bal-card-cvc");
        if (cvcEl && typeof cvcEl.focus === "function") cvcEl.focus();
      }
      return true;
    }
    if (el.id === "bal-card-cvc") {
      const digits = String(el.value || "").replace(/\D+/g, "").slice(0, 3);
      if (el.value !== digits) el.value = digits;
      const target = ui.cardBindModal || ui.balanceModal;
      if (target) { target.cardCvc = digits; target.error = ""; }
      return true;
    }
    if (el.id === "bal-save-card") {
      const target = ui.cardBindModal || ui.balanceModal;
      if (target) target.saveCard = !!el.checked;
      return true;
    }
    if (el.id === "cv-contact-inp") {
      const cv = ui.contactVerifyModal;
      const curCountry = (cv && cv.country) || "RU";
      const parsed = formatPhoneForCountry(el.value, curCountry);
      if (el.value !== parsed.formatted) el.value = parsed.formatted;
      if (cv) {
        const countryChanged = parsed.country.code !== cv.country;
        cv.country = parsed.country.code;
        cv.contact = parsed.formatted;
        cv.error = "";
        if (countryChanged) renderModal();
      }
      return true;
    }
    if (el.dataset && el.dataset.otpIdx != null) {
      const idx = Number(el.dataset.otpIdx);
      const digits = String(el.value || "").replace(/\D+/g, "");
      const cv = ui.contactVerifyModal;
      const curDigits = (cv && Array.isArray(cv.digits)) ? cv.digits.slice() : ["", "", "", ""];
      if (digits.length > 1) {
        for (let k = 0; k < 4 - idx && k < digits.length; k++) {
          const ch = digits.charAt(k);
          curDigits[idx + k] = ch;
          const node = typeof document !== "undefined" && document.getElementById ? document.getElementById("cv-d" + (idx + k)) : null;
          if (node) node.value = ch;
        }
        if (cv) { cv.digits = curDigits; cv.error = ""; }
        const nextIdx = Math.min(3, idx + digits.length);
        const focusEl = typeof document !== "undefined" && document.getElementById ? document.getElementById(nextIdx < 4 && digits.length + idx < 4 ? ("cv-d" + nextIdx) : "cv-check-btn") : null;
        if (focusEl && typeof focusEl.focus === "function") focusEl.focus();
      } else {
        const ch = digits.slice(0, 1);
        if (el.value !== ch) el.value = ch;
        curDigits[idx] = ch;
        if (cv) { cv.digits = curDigits; cv.error = ""; }
        if (ch && idx < 3 && typeof document !== "undefined" && document.getElementById) {
          const nxt = document.getElementById("cv-d" + (idx + 1));
          if (nxt && typeof nxt.focus === "function") nxt.focus();
        }
      }
      return true;
    }
    return false;
  }

  function handlePhoneScopeFocus(el) {
    const ui = getUi();
    if (!el) return false;
    if (el.id === "cv-contact-inp" && ui.contactVerifyModal && !String(el.value || "").trim()) {
      const c = phoneCountryByCode(ui.contactVerifyModal.country || "RU");
      if (c.dial) {
        el.value = "+" + c.dial + " ";
        ui.contactVerifyModal.contact = el.value;
      }
      return true;
    }
    if (el.dataset && el.dataset.phoneScope && !String(el.value || "").trim()) {
      const scope = el.dataset.phoneScope;
      const st = getPhoneFieldState(scope);
      const c = phoneCountryByCode(st.country || "RU");
      if (c.dial) {
        el.value = "+" + c.dial + " ";
        syncPhoneScopeState(scope, el.value, c.code);
      }
      return true;
    }
    if (el.id === "tc-payout-phone" && !String(el.value || "").trim()) {
      el.value = "+7 ";
      if (ui.payoutModal) ui.payoutModal.phone = "+7 ";
      return true;
    }
    return false;
  }

  function handlePhoneScopeInput(el) {
    const ui = getUi();
    if (!el || !el.dataset || !el.dataset.phoneScope) return false;
    const scope = el.dataset.phoneScope;
    const st = getPhoneFieldState(scope);
    const parsed = formatPhoneForCountry(el.value, st.country || "RU");
    const countryChanged = parsed.country.code !== st.country;
    st.country = parsed.country.code;
    if (el.value !== parsed.formatted) el.value = parsed.formatted;
    syncPhoneScopeState(scope, parsed.formatted, st.country);
    if (countryChanged) {
      st.userPicked = true;
      if (scope === "tc-contact" && ui.tutorContactModal) renderModal();
      else scheduleRender();
    }
    return !el.dataset.tc;
  }

  function closePhoneMenus(target) {
    const ui = getUi();
    let changed = false;
    if (ui.contactVerifyModal && ui.contactVerifyModal.countryMenuOpen && (!target || typeof target.closest !== "function" || !target.closest("#cv-phone-field"))) {
      ui.contactVerifyModal.countryMenuOpen = false;
      renderModal();
    }
    if (ui.phoneFields) {
      let phoneModalChanged = false;
      Object.keys(ui.phoneFields).forEach((scope) => {
        const ps = ui.phoneFields[scope];
        if (ps && ps.menuOpen && (!target || typeof target.closest !== "function" || !target.closest("#phone-field-" + scope))) {
          ps.menuOpen = false;
          if (scope === "tc-contact") phoneModalChanged = true;
          else changed = true;
        }
      });
      if (phoneModalChanged) renderModal();
    }
    return changed;
  }

  function registerActions(ACTIONS) {
    Object.assign(ACTIONS, {
      "tutor-contact-open": (el) => {
        openTutorContactModal((el.dataset && (el.dataset.tutorId || el.dataset.id)) || "", (el.dataset && el.dataset.tutorName) || "", (el.dataset && (el.dataset.holdCh || el.dataset.ch)) || "tg");
      },
      "tutor-contact-close": () => {
        getUi().tutorContactModal = null;
        renderModal();
      },
      "msg-hold-hint": (el) => {
        const rawCh = el.dataset && el.dataset.holdCh;
        const ch = rawCh === "wa" ? "WhatsApp" : (rawCh === "max" ? "MAX" : "Telegram");
        toast(`Удерживайте ${ch}, чтобы указать или изменить контакт преподавателя`);
      },
      "cv-country-toggle": () => {
        const ui = getUi();
        if (!ui.contactVerifyModal) return;
        ui.contactVerifyModal.countryMenuOpen = !ui.contactVerifyModal.countryMenuOpen;
        renderModal();
      },
      "cv-country-pick": (el) => {
        const cv = getUi().contactVerifyModal;
        if (!cv) return;
        const nextCode = el && el.dataset && el.dataset.v ? el.dataset.v : "RU";
        const prevParsed = formatPhoneForCountry(cv.contact, cv.country);
        const nextCountry = phoneCountryByCode(nextCode);
        cv.country = nextCountry.code;
        cv.countryMenuOpen = false;
        cv.error = "";
        if (prevParsed.nationalDigits) {
          cv.contact = formatPhoneForCountry(
            nextCountry.dial ? ("+" + nextCountry.dial + prevParsed.nationalDigits) : prevParsed.nationalDigits,
            nextCountry.code
          ).formatted;
        } else {
          cv.contact = nextCountry.dial ? ("+" + nextCountry.dial + " ") : "+";
        }
        renderModal();
        const inp = typeof document !== "undefined" && document.getElementById ? document.getElementById("cv-contact-inp") : null;
        if (inp && typeof inp.focus === "function") inp.focus();
      },
      "phone-country-toggle": (el) => {
        const ui = getUi();
        const scope = (el && el.dataset && el.dataset.scope) || "phone";
        const map = ui.phoneFields || (ui.phoneFields = {});
        const st = getPhoneFieldState(scope);
        const nextOpen = !st.menuOpen;
        Object.keys(map).forEach((k) => { if (map[k]) map[k].menuOpen = false; });
        st.menuOpen = nextOpen;
        if (scope === "tc-contact" && ui.tutorContactModal) renderModal();
        else scheduleRender();
      },
      "phone-country-pick": (el) => {
        const ui = getUi();
        const scope = (el && el.dataset && el.dataset.scope) || "phone";
        const inputId = (el && el.dataset && el.dataset.inputId) || scope;
        const nextCode = (el && el.dataset && el.dataset.v) || "RU";
        const st = getPhoneFieldState(scope);
        const inpNode = typeof document !== "undefined" && document.getElementById ? document.getElementById(inputId) : null;
        const prevVal = inpNode && inpNode.value != null
          ? inpNode.value
          : (scope === "pf-phone"
              ? getDraft("pf.phone", getProfile().phone || "")
              : (scope === "tc-contact" && ui.tutorContactModal ? (ui.tutorContactModal.value || "") : (scope === "lead-wa" && ui.leadDraft ? (ui.leadDraft.whatsapp || "") : "")));
        const prevParsed = formatPhoneForCountry(prevVal, st.country || "RU");
        const nextCountry = phoneCountryByCode(nextCode);
        st.country = nextCountry.code;
        st.menuOpen = false;
        st.userPicked = true;
        const nextFormatted = prevParsed.nationalDigits
          ? formatPhoneForCountry(nextCountry.dial ? ("+" + nextCountry.dial + prevParsed.nationalDigits) : prevParsed.nationalDigits, nextCountry.code).formatted
          : (nextCountry.dial ? ("+" + nextCountry.dial + " ") : "+");
        syncPhoneScopeState(scope, nextFormatted, nextCountry.code);
        if (scope === "tc-hh-wa" && EGE.views && EGE.views.tutorCabinet && typeof EGE.views.tutorCabinet.handleInput === "function") {
          EGE.views.tutorCabinet.handleInput({ dataset: { tc: "whatsapp", phoneScope: scope }, value: nextFormatted });
        }
        ui.focusNext = inputId;
        if (scope === "tc-contact" && ui.tutorContactModal) {
          renderModal();
          const inp = typeof document !== "undefined" && document.getElementById ? document.getElementById(inputId) : null;
          if (inp && typeof inp.focus === "function") inp.focus();
        } else {
          scheduleRender();
        }
      },
      "cv-back": () => {
        const cv = getUi().contactVerifyModal;
        if (!cv) return;
        cv.step = "input";
        cv.countryMenuOpen = false;
        cv.digits = ["", "", "", ""];
        cv.error = "";
        renderModal();
      },
      "cv-resend": () => {
        const cv = getUi().contactVerifyModal;
        if (!cv) return;
        cv.expectedCode = cv.expectedCode === "4829" ? "7391" : "4829";
        cv.digits = ["", "", "", ""];
        cv.error = "";
        renderModal();
        notifySide("Повторное СМС · Вектор", `Отправили код ${cv.expectedCode} на ${cv.contact}`);
      },
      "cv-autofill": () => {
        const cv = getUi().contactVerifyModal;
        if (!cv) return;
        const code = String(cv.expectedCode || "4829").padStart(4, "0").slice(0, 4);
        cv.digits = code.split("");
        cv.error = "";
        renderModal();
        const subBtn = typeof document !== "undefined" && document.getElementById ? document.getElementById("cv-check-btn") : null;
        if (subBtn && typeof subBtn.focus === "function") subBtn.focus();
      },
      "cv-close": () => {
        const ui = getUi();
        const cv = ui.contactVerifyModal;
        if (!cv) return;
        if (cv.fromGoogleDemo || !cv.required) {
          ui.contactVerifyModal = null;
          if (cv.fromGoogleDemo) ui.authModal = true;
          renderModal();
          return;
        }
        cv.error = "Обязательный шаг: подтвердите номер телефона кодом из СМС.";
        renderModal();
      }
    });
  }

  function registerForms(FORMS) {
    FORMS["tutor-contact-save"] = (form) => {
      const ui = getUi();
      const TDATA = getTDATA();
      const m = ui.tutorContactModal;
      if (!m) return;
      const inp = (form && form.elements && form.elements.contact) || $("#tc-contact-inp");
      const raw = String(inp ? inp.value : "").trim();
      const ch = m.channel === "wa" ? "wa" : (m.channel === "max" ? "max" : "tg");
      let cleanVal = "";
      let displayVal = "";
      if (ch === "wa") {
        const noUrl = raw.replace(/^https?:\/\/(wa\.me|api\.whatsapp\.com\/send\/?)\/?/i, "").trim();
        const waSt = ui.phoneFields && ui.phoneFields["tc-contact"];
        const curCountry = m.country || (waSt && waSt.country) || "RU";
        const parsedWa = formatPhoneForCountry(noUrl, curCountry);
        let digits = parsedWa.nationalDigits
          ? ((parsedWa.country.dial || "") + parsedWa.nationalDigits).replace(/\D+/g, "")
          : (TDATA && typeof TDATA.normalizePhoneDigits === "function" ? TDATA.normalizePhoneDigits(noUrl) : noUrl.replace(/\D+/g, ""));
        if (parsedWa.country.code === "OTHER") digits = parsedWa.nationalDigits;
        if (digits.length === 11 && digits[0] === "8" && curCountry === "RU") digits = "7" + digits.slice(1);
        if (!parsedWa.valid && digits.length < 10) {
          m.error = `Укажите корректный номер WhatsApp (${parsedWa.country.name}, пример: ${parsedWa.country.placeholder}).`;
          renderModal();
          return;
        }
        cleanVal = digits;
        displayVal = parsedWa.formatted || ("+" + digits);
      } else if (ch === "tg") {
        const noUrl = raw.replace(/^https?:\/\/(t\.me|telegram\.me)\//i, "").trim();
        const digits = TDATA && typeof TDATA.normalizePhoneDigits === "function"
          ? TDATA.normalizePhoneDigits(noUrl)
          : noUrl.replace(/\D+/g, "");
        if (/^[a-zA-Z0-9_@.-]{3,}$/.test(noUrl.replace(/\s+/g, ""))) {
          cleanVal = TDATA && typeof TDATA.formatTelegramContact === "function"
            ? TDATA.formatTelegramContact(noUrl)
            : (noUrl.startsWith("@") ? noUrl : "@" + noUrl.replace(/^@+/, ""));
        } else if (digits.length >= 10) {
          cleanVal = TDATA && typeof TDATA.formatTelegramContact === "function"
            ? TDATA.formatTelegramContact(noUrl)
            : "+" + digits;
        }
        if (!cleanVal) {
          m.error = "Укажите @username в Telegram или номер телефона (от 10 цифр).";
          renderModal();
          return;
        }
        displayVal = cleanVal;
      } else {
        cleanVal = raw.replace(/^https?:\/\/max\.ru\//i, "").replace(/^@+/, "").trim();
        if (!cleanVal || cleanVal.length < 2) {
          m.error = "Укажите ник или ID преподавателя в MAX (минимум 2 символа).";
          renderModal();
          return;
        }
        displayVal = cleanVal;
      }
      const st = getMkt();
      const map = st.tutorContacts && typeof st.tutorContacts === "object" ? st.tutorContacts : (st.tutorContacts = {});
      const prev = map[m.tutorId] && typeof map[m.tutorId] === "object" ? map[m.tutorId] : {};
      const patchObj = ch === "wa"
        ? { whatsapp: cleanVal }
        : (ch === "max" ? { maxHandle: cleanVal } : { telegram: cleanVal });
      map[m.tutorId] = Object.assign({}, prev, patchObj);
      saveMkt();
      ui.tutorContactModal = null;
      renderModal();
      const label = ch === "wa" ? "WhatsApp" : (ch === "max" ? "MAX" : "Telegram");
      notifySide(`Контакт ${label} сохранён`, `${m.tutorName || "Преподаватель"} · ${displayVal}`);
      scheduleRender();
    };
  }

  EGE.phoneField = {
    PHONE_COUNTRIES,
    phoneCountryByCode,
    formatPhoneForCountry,
    detectPhoneCountry,
    getPhoneFieldState,
    stripEmptyDialPhone,
    phoneFieldHTML,
    syncPhoneScopeState
  };

  EGE.phonePay = {
    configure,
    registerActions,
    registerForms,
    PHONE_COUNTRIES,
    phoneCountryByCode,
    formatPhoneForCountry,
    detectPhoneCountry,
    getPhoneFieldState,
    stripEmptyDialPhone,
    phoneFieldHTML,
    syncPhoneScopeState,
    detectCardMeta,
    cardNetHTML,
    savedCardsForMarket,
    calcBalanceTopupMeta,
    updateBalanceModalLive,
    balanceTopWidgetHTML,
    balanceModalHTML,
    cardBindModalHTML,
    openContactVerifyModal,
    contactVerifyModalHTML,
    openTutorContactModal,
    tutorContactModalHTML,
    handleBalanceFieldInput,
    handlePhoneScopeFocus,
    handlePhoneScopeInput,
    closePhoneMenus
  };
})();
