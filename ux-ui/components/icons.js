/* SVG-иконки, логотип «Вектор ЕГЭ», каталог 40 иконок, якутские узоры Оһуор / Харысхал / Күн и триггер анимации. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l8-8"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 2 2 3-3"/><path d="M14 10h4"/><path d="m7 15 2 2 3-3"/><path d="M14 16h4"/>',
    chart: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-7"/><path d="M3 20h18"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.4A8 8 0 1 1 21 12z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    arrow: '<path d="M5 12h14"/><path d="m13 6 6 6-6 6"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    alert: '<path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    repeat: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
    book: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5"/>',
    spark: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
    trash: '<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    download: '<path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/>',
    upload: '<path d="M12 20V9"/><path d="m7 14 5-5 5 5"/><path d="M5 4h14"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="2"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    hint: '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-4 12.7c.7.6 1 1.4 1 2.3h6c0-.9.3-1.7 1-2.3A7 7 0 0 0 12 2z"/>',
    bug: '<path d="m8 2 1.88 1.88M14.12 3.88 16 2M9 7.13v-1a3 3 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9M6.53 9C4.6 8.8 3 7.1 3 5M6 13H2M3 21c0-2.1 1.7-3.9 3.8-4M20.97 5c0 2.1-1.6 3.8-3.5 4M22 13h-4M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    cal: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    sliders: '<line x1="4" y1="6" x2="20" y2="6"/><circle cx="9" cy="6" r="2"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="15" cy="12" r="2"/><line x1="4" y1="18" x2="20" y2="18"/><circle cx="10" cy="18" r="2"/>',
    heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.3l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.9z"/>',
    heartFill: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.3l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.9z" fill="currentColor"/>',
    sort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    back: '<path d="m15 18-6-6 6-6"/>',
    chevDown: '<path d="m6 9 6 6 6-6"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    msg: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
    eyeOff: '<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
    shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/>',
    video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    ohyorCross: '<polygon points="12,3 21,12 12,21 3,12"/><polygon points="12,8 16,12 12,16 8,12"/><line x1="12" y1="1.2" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="22.8"/><line x1="1.2" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="22.8" y2="12"/><line x1="7.5" y1="7.5" x2="5.2" y2="5.2"/><line x1="16.5" y1="7.5" x2="18.8" y2="5.2"/><line x1="7.5" y1="16.5" x2="5.2" y2="18.8"/><line x1="16.5" y1="16.5" x2="18.8" y2="18.8"/>',
    sakhaStar: '<polygon points="12,2 14,7.5 12,10.5 10,7.5"/><polygon points="12,22 14,16.5 12,13.5 10,16.5"/><polygon points="2,12 7.5,10 10.5,12 7.5,14"/><polygon points="22,12 16.5,10 13.5,12 16.5,14"/><polygon points="4.8,4.8 9.2,7.2 10.5,10.5 7.2,9.2"/><polygon points="19.2,4.8 16.8,9.2 13.5,10.5 14.8,7.2"/><polygon points="19.2,19.2 14.8,16.8 13.5,13.5 16.8,14.8"/><polygon points="4.8,19.2 7.2,14.8 10.5,13.5 9.2,16.8"/><circle cx="12" cy="12" r="1.2"/>',
    sakhaLattice: '<polygon points="12,2.5 21.5,12 12,21.5 2.5,12"/><polygon points="12,7 17,12 12,17 7,12"/><line x1="7.2" y1="7.2" x2="16.8" y2="16.8"/><line x1="16.8" y1="7.2" x2="7.2" y2="16.8"/>',
    sakhaKun: '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="12" r="5"/><polygon points="12,2 13.6,4 12,6 10.4,4"/><polygon points="12,18 13.6,20 12,22 10.4,20"/><polygon points="2,12 4,10.4 6,12 4,13.6"/><polygon points="18,12 20,10.4 22,12 20,13.6"/><path d="M9.6 9.6c1.5-1.2 3.3-1.2 4.8 0M9.6 14.4c1.5 1.2 3.3 1.2 4.8 0"/>'
  };

  function icon(name) {
    return (
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (ICONS[name] || "") +
      "</svg>"
    );
  }

  function sakhaStarCoreSVG() {
    // Точная D4-симметрия 8-лучевого якутского узора (параллелограммы 45°, 4 внешних ромба, полый центр)
    const pts = [[1.55, 3.55], [1.55, 12.80], [10.80, 22.05], [10.80, 12.80]];
    const petals = [];
    for (const [sa, sb] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const p1 = pts.map(([a, b]) => `${(32 + sa * a).toFixed(2)},${(32 - sb * b).toFixed(2)}`).join(" ");
      const p2 = pts.map(([a, b]) => `${(32 + sa * b).toFixed(2)},${(32 - sb * a).toFixed(2)}`).join(" ");
      petals.push(`<polygon points="${p1}" fill="currentColor" stroke="none"/><polygon points="${p2}" fill="currentColor" stroke="none"/>`);
    }
    const cardinal = [
      "32,4.50 36.06,8.56 32,12.62 27.94,8.56",
      "51.38,32 55.44,27.94 59.50,32 55.44,36.06",
      "32,51.38 36.06,55.44 32,59.50 27.94,55.44",
      "4.50,32 8.56,27.94 12.62,32 8.56,36.06"
    ].map((p) => `<polygon points="${p}" fill="currentColor" stroke="none"/>`).join("");
    const center = '<path d="M32 29.30L34.70 32 32 34.70 29.30 32ZM32 30.50L30.50 32 32 33.50 33.50 32Z" fill="currentColor" fill-rule="evenodd" stroke="none"/>';
    return petals.join("") + cardinal + center;
  }

  function sakhaPatternSVG(kind, size) {
    const px = Number(size) || 44;
    let body = "";
    if (kind === "kun") {
      body =
        '<circle cx="32" cy="32" r="29" stroke-width="2" stroke-dasharray="2.1 2.4"/>' +
        '<circle cx="32" cy="32" r="24.5" stroke-width="1.8"/>' +
        '<circle cx="32" cy="32" r="14.5" stroke-width="1.5"/>' +
        '<polygon points="32,14.5 36.2,19.5 32,24.5 27.8,19.5" stroke-width="1.4"/>' +
        '<polygon points="32,39.5 36.2,44.5 32,49.5 27.8,44.5" stroke-width="1.4"/>' +
        '<polygon points="14.5,32 19.5,27.8 24.5,32 19.5,36.2" stroke-width="1.4"/>' +
        '<polygon points="39.5,32 44.5,27.8 49.5,32 44.5,36.2" stroke-width="1.4"/>' +
        '<path d="M32 32c-4-3.2-5.8-8-2.4-9.8 2.2-1.2 3.8 1.5 2.4 4.2M32 32c4-3.2 5.8-8 2.4-9.8-2.2-1.2-3.8 1.5-2.4 4.2M32 32c-4 3.2-5.8 8-2.4 9.8 2.2 1.2 3.8-1.5 2.4-4.2M32 32c4 3.2 5.8 8 2.4 9.8-2.2 1.2-3.8-1.5-2.4-4.2" stroke-width="1.5"/>' +
        '<path d="M32 32c-3.2-4-8-5.8-9.8-2.4-1.2 2.2 1.5 3.8 4.2 2.4M32 32c3.2-4 8-5.8 9.8-2.4 1.2 2.2-1.5 3.8-4.2 2.4M32 32c-3.2 4-8 5.8-9.8 2.4-1.2-2.2 1.5-3.8 4.2-2.4M32 32c3.2 4 8 5.8 9.8 2.4 1.2-2.2-1.5-3.8-4.2-2.4" stroke-width="1.5"/>';
    } else if (kind === "star") {
      body = sakhaStarCoreSVG();
    } else if (kind === "lattice") {
      body =
        '<polygon points="32,6 58,32 32,58 6,32" stroke-width="2.2"/>' +
        '<polygon points="32,16 48,32 32,48 16,32" stroke-width="2"/>' +
        '<polygon points="32,25 39,32 32,39 25,32" stroke-width="2"/>' +
        '<line x1="15" y1="15" x2="49" y2="49" stroke-width="2"/>' +
        '<line x1="49" y1="15" x2="15" y2="49" stroke-width="2"/>' +
        '<line x1="21" y1="11" x2="53" y2="43" stroke-width="1.4" opacity=".7"/>' +
        '<line x1="11" y1="21" x2="43" y2="53" stroke-width="1.4" opacity=".7"/>' +
        '<line x1="43" y1="11" x2="11" y2="43" stroke-width="1.4" opacity=".7"/>' +
        '<line x1="53" y1="21" x2="21" y2="53" stroke-width="1.4" opacity=".7"/>';
    } else {
      body =
        '<polygon points="32,10 54,32 32,54 10,32" stroke-width="2.4"/>' +
        '<polygon points="32,20 44,32 32,44 20,32" stroke-width="2"/>' +
        '<polygon points="32,27 37,32 32,37 27,32" fill="currentColor" stroke="none"/>' +
        '<path d="M21 21l-5-5M26.5 15.5l-5-5M15.5 26.5l-5-5M43 21l5-5M37.5 15.5l5-5M48.5 26.5l5-5M21 43l-5 5M26.5 48.5l-5 5M15.5 37.5l-5 5M43 43l5 5M37.5 48.5l5 5M48.5 37.5l5 5" stroke-width="2.1"/>';
    }
    return `<svg width="${px}" height="${px}" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  function sakhaOhyorHTML(label) {
    const ornament =
      '<svg width="64" height="18" viewBox="0 0 64 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M2 9h14M48 9h14"/>' +
      '<polygon points="32,2 40,9 32,16 24,9"/>' +
      '<polygon points="32,5.5 35.5,9 32,12.5 28.5,9"/>' +
      '<polygon points="20,9 22,7 24,9 22,11" fill="currentColor" stroke="none"/>' +
      '<polygon points="40,9 42,7 44,9 42,11" fill="currentColor" stroke="none"/>' +
      "</svg>";
    return `<div class="sakha-divider" aria-label="${label || "Якутский узор Оһуор"}"><span class="sakha-div-line" aria-hidden="true"></span><span class="sakha-div-emblem">${ornament}${label ? `<span class="sakha-div-label">${label}</span>` : ""}</span><span class="sakha-div-line" aria-hidden="true"></span></div>`;
  }

  const BRAND_MARK_HTML =
    `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none">${sakhaStarCoreSVG()}</svg></span>`;

  const BRAND_WORDMARK_HTML =
    '<span class="brand-wordmark-wrap">' +
    '<svg class="brand-wordmark" viewBox="0 0 144 30" fill="none" stroke="currentColor" stroke-width="2.55" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<g class="wm-main">' +
    '<path d="M3 22.5V6h7.2l2.6 2.6v3.2l-2.4 2.4H3"/>' +
    '<path d="M10.4 14.2l3 2.6v3.2l-2.6 2.5H3"/>' +
    '<path d="M17.5 16.4H27v-2.9L24.5 11H20l-2.5 2.5V20l2.5 2.5h5l1.8-1.8"/>' +
    '<path d="M31.5 11v11.5M40.8 11l-6.6 5.7 7 5.8M31.5 16.7h3"/>' +
    '<path d="M44.5 11h11M50 11v11.5"/>' +
    '<path d="M61 11h5l2.5 2.5V20L66 22.5h-5L58.5 20v-6.5Z"/>' +
    '<path d="M73 11v16.5M73 11h7.2l2.6 2.6v6.3l-2.6 2.6H73"/>' +
    '</g>' +
    '<polygon class="wm-diamond" points="90,11.6 93,14.6 90,17.6 87,14.6" fill="currentColor" stroke="none"/>' +
    '<g class="wm-ege">' +
    '<path d="M108 6h-8.2L97.5 8.3v11.9l2.3 2.3H108M97.5 14.2h8.5"/>' +
    '<path d="M113.5 22.5V8.3l2.3-2.3h8"/>' +
    '<path d="M128.5 6h9l2.7 2.7v11.1l-2.7 2.7h-9M130.5 14.2h9.7"/>' +
    '</g>' +
    "</svg>" +
    '<span class="sr">Вектор ЕГЭ</span>' +
    "</span>";

  function brandLockupHTML(opts) {
    opts = opts || {};
    const surfAttr = opts.surface ? ` data-surface="${opts.surface}"` : "";
    const tagHTML = opts.tag ? `<span class="brand-tag">${opts.tag}</span>` : "";
    const subHTML = opts.sub ? `<div class="brand-sub">${opts.sub}</div>` : "";
    return `<div class="brand-lockup"${surfAttr}>${BRAND_MARK_HTML}<div class="brand-text"><div class="brand-name">${BRAND_WORDMARK_HTML}${tagHTML}</div>${subHTML}</div></div>`;
  }

  const GOOGLE_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.2 14.2A7.2 7.2 0 0 1 4.8 12c0-.8.1-1.5.4-2.2V6.7H1.2A12 12 0 0 0 0 12c0 1.9.5 3.8 1.2 5.3l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.9 11.9 0 0 0 12 0 12 12 0 0 0 1.2 6.7l4 3.1c1-2.9 3.7-5 6.8-5z"/></svg>';

  function getIconCatalog(dark) {
    return [
      ["heartFill", "Избранное (актив.)", "var(--bad)", "", "heartbeat", "Пульс ♥"],
      ["heart", "Избранное (контур)", "var(--muted)", "", "heartbeat", "Пульс ♡"],
      ["eyeOff", "Скрыть анкету", "var(--ink-2)", "", "shake", "Встряска"],
      ["eye", "Просмотр анкеты", "var(--accent)", "", "pop", "Фокус"],
      ["bell", "Уведомление (оранж.)", "var(--notif)", "3", "ring", "Звон"],
      ["flame", "Горящая ставка", "var(--notif)", "", "jiggle", "Искра"],
      ["check", "Проверено ✓", "var(--confirm)", "", "pop-bounce", "Подтверждено"],
      ["shield", "Защита оплаты", "var(--confirm)", "", "pop-bounce", "Щит"],
      ["star", "Рейтинг 4.9", "var(--pro)", "", "spin-pop", "Звезда 360°"],
      ["award", "Эксперт / ВсОШ", "var(--pro)", "", "spin-pop", "Медаль"],
      ["search", "Поиск", "var(--ink-2)", "", "scan", "Поиск"],
      ["sliders", "Фильтры", "var(--ink-2)", "", "nudge", "Настройка"],
      ["cal", "Расписание", "var(--accent)", "", "tick", "Календарь"],
      ["clock", "Время 10–20 ч", "var(--accent)", "", "tick", "Тик-так"],
      ["msg", "Чат / Отклик", "var(--accent)", "", "fly", "Отклик"],
      ["send", "Отправить ставку", "var(--accent)", "", "fly", "Полёт ↗"],
      ["video", "Онлайн-урок", "var(--accent)", "", "pop", "Камера"],
      ["users", "Репетиторы", "var(--ink-2)", "", "pop", "Каталог"],
      ["wallet", "Баланс / Тариф", "var(--confirm)", "", "lift", "Баланс"],
      ["lock", "Заморозка цены", "var(--ink-2)", "", "shake", "Бронь"],
      ["pin", "Город / Очно", "var(--accent)", "", "bounce-down", "Локация"],
      ["spark", "Подбор / ИИ", "var(--pro)", "", "twinkle", "Искры"],
      ["book", "Конспекты", "var(--ink-2)", "", "flip", "Страница"],
      ["list", "Тесты ЕГЭ", "var(--ink-2)", "", "pop", "Тесты"],
      ["chart", "Показатели", "var(--accent)", "", "lift", "Рост"],
      ["home", "Главная", "var(--ink-2)", "", "pop", "Домой"],
      ["repeat", "Обновить базу", "var(--ink-2)", "", "spin-ccw", "Обновить"],
      ["sort", "Сортировка", "var(--ink-2)", "", "nudge", "Порядок"],
      ["copy", "Копировать", "var(--ink-2)", "", "pop", "Скопировано"],
      ["share", "Поделиться", "var(--accent)", "", "lift", "Ссылка"],
      ["download", "Скачать PDF", "var(--ink-2)", "", "bounce-down", "Загрузка"],
      ["upload", "Загрузить файл", "var(--ink-2)", "", "lift", "Выгрузка"],
      ["bug", "Баг-репорт", "var(--ink-2)", "", "jiggle", "Проверка"],
      ["gear", "Настройки", "var(--ink-2)", "", "spin-180", "Поворот 180°"],
      [dark ? "sun" : "moon", "Смена темы", "var(--ink-2)", "", "spin-pop", "Тема 360°"],
      ["logout", "Выход", "var(--bad)", "", "fly", "Выход"],
      ["ohyorCross", "Харысхал · Ромб", "var(--ink)", "", "pop-bounce", "Геометрия"],
      ["sakhaStar", "Сулус · Звезда Саха", "var(--accent)", "", "spin-pop", "8 лучей"],
      ["sakhaLattice", "Тоҕус харах · Узор", "var(--ink-2)", "", "twinkle", "Решётка"],
      ["sakhaKun", "Күн Оһуор · Солнце", "#C59B5F", "", "spin-pop", "Медальон"]
    ];
  }

  function triggerIconTileAnim(tile) {
    if (!tile || !tile.classList) return;
    tile.classList.remove("is-anim");
    if (typeof tile.offsetWidth === "number") void tile.offsetWidth;
    tile.classList.add("is-anim");
    clearTimeout(tile._animTimer);
    if (typeof setTimeout === "function") {
      tile._animTimer = setTimeout(() => {
        if (tile.classList) tile.classList.remove("is-anim");
      }, 720);
    }
  }

  EGE.ui = {
    ICONS,
    icon,
    sakhaPatternSVG,
    sakhaOhyorHTML,
    BRAND_MARK_HTML,
    BRAND_WORDMARK_HTML,
    brandLockupHTML,
    GOOGLE_SVG,
    getIconCatalog,
    triggerIconTileAnim
  };
})();
