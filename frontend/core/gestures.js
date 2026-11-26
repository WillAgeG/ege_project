/* Жесты мобильных шторок, свайп тостов, удержание мессенджеров (WA/TG/MAX) и hover-свет на Hero. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});

  let swipeToast = null;
  let sheetDrag = null;
  let suppressSheetClick = false;
  let holdContactTimer = null;
  let holdContactState = null;
  let suppressHoldClick = false;

  function swipeClientPt(e, axis) {
    if (e.touches && e.touches[0]) return axis === "x" ? e.touches[0].clientX : e.touches[0].clientY;
    if (e.changedTouches && e.changedTouches[0]) return axis === "x" ? e.changedTouches[0].clientX : e.changedTouches[0].clientY;
    return axis === "x" ? (typeof e.clientX === "number" ? e.clientX : 0) : (typeof e.clientY === "number" ? e.clientY : 0);
  }

  function consumeSuppressedClick() {
    if (suppressSheetClick) { suppressSheetClick = false; return true; }
    if (suppressHoldClick) { suppressHoldClick = false; return true; }
    return false;
  }

  function bind(ctx) {
    ctx = ctx || {};
    const ui = ctx.ui || {};
    const openTutorContactModal = typeof ctx.openTutorContactModal === "function" ? ctx.openTutorContactModal : () => {};
    const dismissActiveModal = typeof ctx.dismissActiveModal === "function" ? ctx.dismissActiveModal : () => {};
    const dismissSideToast = typeof ctx.dismissSideToast === "function" ? ctx.dismissSideToast : () => {};
    const resetToastTimer = typeof ctx.resetToastTimer === "function" ? ctx.resetToastTimer : () => {};
    const clearToastTimer = typeof ctx.clearToastTimer === "function" ? ctx.clearToastTimer : () => {};
    const bbState = typeof ctx.bbState === "function" ? ctx.bbState : () => ({});
    const scheduleRender = typeof ctx.scheduleRender === "function" ? ctx.scheduleRender : () => {};

    function clearHoldContact() {
      if (holdContactTimer) {
        clearTimeout(holdContactTimer);
        holdContactTimer = null;
      }
      if (holdContactState && holdContactState.el && holdContactState.el.classList) {
        holdContactState.el.classList.remove("is-holding");
      }
      holdContactState = null;
    }

    function startHoldContact(e) {
      if (!e || !e.target || typeof e.target.closest !== "function") return;
      if (typeof e.button === "number" && e.button !== 0) return;
      const btn = e.target.closest(".btn-msg.is-hold-add[data-hold-ch]");
      if (!btn) return;
      suppressHoldClick = false;
      clearHoldContact();
      const x0 = swipeClientPt(e, "x");
      const y0 = swipeClientPt(e, "y");
      if (btn.classList) btn.classList.add("is-holding");
      holdContactState = { el: btn, x0, y0 };
      holdContactTimer = setTimeout(() => {
        const cur = holdContactState;
        clearHoldContact();
        if (!cur || !cur.el) return;
        suppressHoldClick = true;
        setTimeout(() => { suppressHoldClick = false; }, 350);
        const d = cur.el.dataset || {};
        openTutorContactModal(d.tutorId || "", d.tutorName || "", d.holdCh || "tg");
      }, 450);
    }

    function moveHoldContact(e) {
      if (!holdContactState) return;
      const dx = Math.abs(swipeClientPt(e, "x") - holdContactState.x0);
      const dy = Math.abs(swipeClientPt(e, "y") - holdContactState.y0);
      if (dx > 12 || dy > 12) clearHoldContact();
    }

    function startSheetDrag(e) {
      if (!e || !e.target || typeof e.target.closest !== "function") return;
      const zone = e.target.closest("[data-sheet-drag]");
      if (!zone) return;
      const sheet = zone.closest(".sheet-modal");
      if (!sheet) return;
      sheetDrag = { sheet, y0: swipeClientPt(e, "y"), t0: Date.now(), dy: 0, moved: false };
      if (sheet.style) sheet.style.transition = "none";
    }

    function moveSheetDrag(e) {
      if (!sheetDrag) return;
      const dy = Math.max(0, swipeClientPt(e, "y") - sheetDrag.y0);
      sheetDrag.dy = dy;
      if (dy > 4) sheetDrag.moved = true;
      if (sheetDrag.sheet && sheetDrag.sheet.style) {
        sheetDrag.sheet.style.transform = dy > 0 ? `translateY(${Math.round(dy)}px)` : "";
      }
    }

    function endSheetDrag() {
      if (!sheetDrag) return;
      const cur = sheetDrag;
      sheetDrag = null;
      const vel = cur.dy / Math.max(1, Date.now() - cur.t0);
      const shouldClose = cur.dy > 84 || (cur.dy > 32 && vel > 0.55);
      if (cur.moved) suppressSheetClick = true;
      if (shouldClose) {
        if (ui.contactVerifyModal && !(ui.contactVerifyModal.fromSocialDemo || ui.contactVerifyModal.fromPhoneAuth || ui.contactVerifyModal.fromGoogleDemo) && ui.contactVerifyModal.required) {
          if (cur.sheet && cur.sheet.style) {
            cur.sheet.style.transition = "transform .2s cubic-bezier(.22, 1, .36, 1)";
            cur.sheet.style.transform = "";
          }
          dismissActiveModal();
          return;
        }
        if (cur.sheet && cur.sheet.style) {
          cur.sheet.style.transition = "transform .2s ease";
          cur.sheet.style.transform = "translateY(105%)";
        }
        const closeNow = () => { dismissActiveModal(); };
        if (typeof setTimeout === "function") setTimeout(closeNow, 150);
        else closeNow();
      } else if (cur.sheet && cur.sheet.style) {
        cur.sheet.style.transition = "transform .2s cubic-bezier(.22, 1, .36, 1)";
        cur.sheet.style.transform = "";
      }
    }

    function startSwipeToast(e) {
      if (!e || !e.target || typeof e.target.closest !== "function") return;
      if (e.target.closest("button, [data-a]")) return;
      const node = e.target.closest("#toast.is-side, [data-swipe-toast]");
      if (!node) return;
      clearToastTimer();
      swipeToast = { node, x0: swipeClientPt(e, "x"), y0: swipeClientPt(e, "y"), dx: 0, active: false };
    }

    function moveSwipeToast(e) {
      if (!swipeToast) return;
      const dx = swipeClientPt(e, "x") - swipeToast.x0;
      const dy = swipeClientPt(e, "y") - swipeToast.y0;
      if (!swipeToast.active) {
        if (dx < -8 && Math.abs(dx) > Math.abs(dy)) {
          swipeToast.active = true;
          if (swipeToast.node.classList) swipeToast.node.classList.add("is-dragging");
        } else if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) {
          swipeToast = null;
          return;
        } else {
          return;
        }
      }
      const clamped = Math.min(0, dx);
      swipeToast.dx = clamped;
      if (swipeToast.node.style) {
        swipeToast.node.style.transform = `translateX(${clamped}px)`;
        swipeToast.node.style.opacity = String(Math.max(0.18, 1 + clamped / 170));
      }
    }

    function endSwipeToast() {
      if (!swipeToast) return;
      const cur = swipeToast;
      swipeToast = null;
      const node = cur.node;
      if (node.classList) node.classList.remove("is-dragging");
      if (cur.active && cur.dx <= -48) {
        if (node.id === "toast") {
          dismissSideToast(node);
        } else {
          if (node.style) { node.style.transform = ""; node.style.opacity = ""; }
          if (node.classList) node.classList.add("is-dismissing");
          setTimeout(() => {
            bbState().previewToastDismissed = true;
            scheduleRender();
          }, 190);
        }
      } else {
        if (node.style) { node.style.transform = ""; node.style.opacity = ""; }
        if (node.id === "toast" && !node.hidden) {
          resetToastTimer(node);
        }
      }
    }

    document.addEventListener("pointerdown", (e) => { startSwipeToast(e); startSheetDrag(e); startHoldContact(e); });
    document.addEventListener("pointerup", () => { endSwipeToast(); endSheetDrag(); clearHoldContact(); });
    document.addEventListener("pointercancel", () => { endSwipeToast(); endSheetDrag(); clearHoldContact(); });
    document.addEventListener("pointermove", (e) => {
      moveSwipeToast(e);
      moveSheetDrag(e);
      moveHoldContact(e);
      if (!e || ui.view !== "landing" || typeof document.getElementById !== "function") return;
      const wrap = document.getElementById("hero-stage-wrap");
      if (!wrap || !wrap.getBoundingClientRect || !wrap.style || !wrap.style.setProperty) return;
      const r = wrap.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const mx = Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100));
      const my = Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100));
      wrap.style.setProperty("--mx", mx.toFixed(1) + "%");
      wrap.style.setProperty("--my", my.toFixed(1) + "%");
    }, { passive: true });
    document.addEventListener("contextmenu", (e) => {
      const btn = e && e.target && typeof e.target.closest === "function"
        ? e.target.closest(".btn-msg.is-hold-add[data-hold-ch]")
        : null;
      if (!btn) return;
      if (typeof e.preventDefault === "function") e.preventDefault();
      clearHoldContact();
      const d = btn.dataset || {};
      openTutorContactModal(d.tutorId || "", d.tutorName || "", d.holdCh || "tg");
    });
  }

  EGE.gestures = {
    bind,
    consumeSuppressedClick
  };
})();
