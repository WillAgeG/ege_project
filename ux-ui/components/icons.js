/* SVG-иконки, логотип «Вектор», каталог 40 иконок, якутские узоры Оһуор / Харысхал / Күн и триггер анимации. */
(function () {
  "use strict";

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  const EGE = (root.EGE = root.EGE || {});

  const ICONS = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    leaf: '<path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15z"/><path d="M5 19l8-8"/>',
    list: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 2 2 3-3"/><path d="M14 10h4"/><path d="m7 15 2 2 3-3"/><path d="M14 16h4"/>',
    chart: '<path d="M4 20V11"/><path d="M10 20V5"/><path d="M16 20v-7"/><path d="M3 20h18"/>',
    chat: '<path d="M21 14a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3z"/>',
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
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
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
    send: '<path d="M5.4 4.8 20.4 12 5.4 19.2l2.6-7.2L5.4 4.8z"/><path d="M8 12h6.4"/>',
    flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    award: '<circle cx="12" cy="8" r="6"/><path d="M15.477 12.89 17 22l-5-3-5 3 1.523-9.11"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>',
    pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
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

  const VEKTOR_STAR_D =
    "M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z";
  const VEKTOR_SWIRL_D = VEKTOR_STAR_D;

  function sakhaStarCoreSVG() {
    // 6-лучевая шестиугольная звезда с симметрией C6 вокруг центра (32, 32)
    return `<path class="bm-glyph" fill="currentColor" stroke="none" d="${VEKTOR_STAR_D}"/>`;
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

  function sakhaOhyorHTML(label, opts) {
    if (opts && opts.goldLogo) {
      const goldEmblem =
        '<span class="sakha-gold-emblem" aria-hidden="true">' +
        '<svg width="32" height="32" viewBox="0 0 64 64" fill="none">' +
        sakhaStarCoreSVG() +
        "</svg>" +
        "</span>";
      return `<div class="sakha-divider is-gold-logo" aria-label="${label || "Вектор · Саха"}"><span class="sakha-div-line" aria-hidden="true"></span>${goldEmblem}<span class="sakha-div-line" aria-hidden="true"></span></div>`;
    }
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

  let _bmGradSeq = 0;

  function brandMarkDefsSVG(gid) {
    return (
      `<defs>` +
      `<linearGradient id="${gid}-base" gradientUnits="userSpaceOnUse" x1="8" y1="12" x2="58" y2="52">` +
      `<stop offset="0%" stop-color="#4285f4"/>` +
      `<stop offset="56%" stop-color="#2b7fff"/>` +
      `<stop offset="100%" stop-color="#669df6"/>` +
      `</linearGradient>` +
      `<radialGradient id="${gid}-red" gradientUnits="userSpaceOnUse" cx="16" cy="15" r="30">` +
      `<stop offset="0%" stop-color="#ff5252" stop-opacity="1"/>` +
      `<stop offset="46%" stop-color="#ea4335" stop-opacity=".92"/>` +
      `<stop offset="100%" stop-color="#ea4335" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<radialGradient id="${gid}-amber" gradientUnits="userSpaceOnUse" cx="13" cy="47" r="29">` +
      `<stop offset="0%" stop-color="#fbbc04" stop-opacity="1"/>` +
      `<stop offset="48%" stop-color="#f9ab00" stop-opacity=".88"/>` +
      `<stop offset="100%" stop-color="#fbbc04" stop-opacity="0"/>` +
      `</radialGradient>` +
      `<radialGradient id="${gid}-green" gradientUnits="userSpaceOnUse" cx="32" cy="59" r="26">` +
      `<stop offset="0%" stop-color="#34a853" stop-opacity=".96"/>` +
      `<stop offset="44%" stop-color="#22c55e" stop-opacity=".68"/>` +
      `<stop offset="100%" stop-color="#34a853" stop-opacity="0"/>` +
      `</radialGradient>` +
      `</defs>`
    );
  }

  function geminiStarBodySVG(gid) {
    return (
      `<g class="bm-gemini-layers">` +
      `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-base)"/>` +
      `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-red)"/>` +
      `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-amber)"/>` +
      `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-green)"/>` +
      `</g>` +
      `<path class="bm-mono" d="${VEKTOR_STAR_D}" fill="currentColor" opacity="0"/>`
    );
  }

  function brandMarkHTML() {
    const gid = "vlg-" + (++_bmGradSeq);
    return (
      `<span class="brand-mark" aria-hidden="true">` +
      `<svg viewBox="0 0 64 64" fill="none">${brandMarkDefsSVG(gid)}${geminiStarBodySVG(gid)}</svg>` +
      `</span>`
    );
  }

  const BRAND_MARK_HTML =
    `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none">${brandMarkDefsSVG("vektor-bm-grad")}${geminiStarBodySVG("vektor-bm-grad")}</svg></span>`;

  const BRAND_WORDMARK_HTML =
    '<span class="brand-wordmark-wrap">' +
    '<span class="brand-wordmark" aria-hidden="true">Вектор</span>' +
    '<span class="sr">Вектор</span>' +
    "</span>";

  function brandLockupHTML(opts) {
    opts = opts || {};
    const surfAttr = opts.surface ? ` data-surface="${opts.surface}"` : "";
    const tagHTML = opts.tag ? `<span class="brand-tag">${opts.tag}</span>` : "";
    const subHTML = opts.sub ? `<div class="brand-sub">${opts.sub}</div>` : "";
    return `<div class="brand-lockup"${surfAttr}>${brandMarkHTML()}<div class="brand-text"><div class="brand-name">${BRAND_WORDMARK_HTML}${tagHTML}</div>${subHTML}</div></div>`;
  }

  function brandLogoSVG(surface, kind) {
    const mode = surface === "dark" || surface === "blue" ? surface : "light";
    const isLockup = kind === "lockup";
    const wmInk = mode === "light" ? "#1f1f1f" : "#ffffff";
    const gid = "vektor-svg-" + mode + (isLockup ? "-l" : "");
    const defs = mode === "blue" ? "" : brandMarkDefsSVG(gid);
    const bgHex = mode === "dark" ? "#0b0d12" : (mode === "blue" ? "#0070ff" : "#ffffff");
    const starLayers = mode === "blue"
      ? `<path d="${VEKTOR_STAR_D}" fill="#ffffff"/>`
      : (
        `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-base)"/>` +
        `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-red)"/>` +
        `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-amber)"/>` +
        `<path d="${VEKTOR_STAR_D}" fill="url(#${gid}-green)"/>`
      );
    if (!isLockup) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">${defs}<rect width="64" height="64" rx="16" fill="${bgHex}"/>${starLayers}</svg>`;
    }
    const lockupCanvas = `<rect width="260" height="72" rx="16" fill="${bgHex}"/>`;
    const wordText =
      `<text x="80" y="45" font-family="Google Sans, Onest, Outfit, Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="30" font-weight="500" letter-spacing="-0.5" fill="${wmInk}">Вектор</text>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="72" viewBox="0 0 260 72" fill="none">${defs}${lockupCanvas}<g transform="translate(8, 4)">${starLayers}</g>${wordText}</svg>`;
  }

  const GOOGLE_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-3l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.8-5H1.2v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.2 14.2A7.2 7.2 0 0 1 4.8 12c0-.8.1-1.5.4-2.2V6.7H1.2A12 12 0 0 0 0 12c0 1.9.5 3.8 1.2 5.3l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A11.9 11.9 0 0 0 12 0 12 12 0 0 0 1.2 6.7l4 3.1c1-2.9 3.7-5 6.8-5z"/></svg>';

  const TELEGRAM_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#229ED9"/><path fill="#ffffff" d="M17.4 7.4c.2-.8-.3-1.2-1-.9L5.9 10.6c-.7.3-.7.8-.1 1l2.7.8 6.2-3.9c.3-.2.6-.1.4.1l-5 4.5-.2 2.9c.3 0 .4-.1.6-.3l1.4-1.3 2.8 2c.5.3.9.2 1-.5l1.7-8.5z"/></svg>';

  const WHATSAPP_SVG =
    '<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#25D366"/><path fill="none" stroke="#ffffff" stroke-width="1.65" stroke-linejoin="round" d="M12 5.5a6.3 6.3 0 0 0-5.45 9.45L5.6 18.4l3.55-.93A6.3 6.3 0 1 0 12 5.5z"/><path fill="#ffffff" d="M15.45 13.78c-.19-.1-1.12-.55-1.3-.62-.17-.06-.3-.1-.42.1-.13.19-.48.61-.59.74-.11.12-.22.14-.41.05-.19-.1-.8-.3-1.52-.94-.56-.5-.94-1.12-1.05-1.31-.11-.19-.01-.29.08-.39.09-.08.19-.22.28-.33.1-.11.13-.19.19-.31.06-.13.03-.24-.02-.33-.05-.1-.42-1.02-.58-1.4-.15-.37-.31-.32-.42-.32h-.36c-.13 0-.33.05-.5.24-.17.19-.66.64-.66 1.56s.67 1.81.77 1.94c.09.12 1.32 2.02 3.21 2.83.45.19.8.31 1.07.4.45.14.86.12 1.18.07.36-.05 1.12-.46 1.28-.9.16-.44.16-.82.11-.9-.05-.08-.17-.13-.34-.18z"/></svg>';

  function sbpLogoSVG(size) {
    const h = Number(size) || 28;
    const w = Math.max(12, Math.round((h * 266) / 325));
    return (
      `<svg class="ygo-sbp-svg" width="${w}" height="${h}" viewBox="0 0 266 325" fill="none" role="img" aria-label="СБП">` +
      "<title>СБП</title>" +
      '<polygon points="114,0 152,70 152,116 114,140" fill="#F1BA46"/>' +
      '<polygon points="114,0 266,93 188,93 152,70" fill="#E07C3E"/>' +
      '<polygon points="0,255 40,183 152,116 152,163" fill="#8E4D91"/>' +
      '<polygon points="152,116 188,93 266,93 152,163" fill="#C72C54"/>' +
      '<polygon points="0,70 40,142 40,183 0,255" fill="#5D579F"/>' +
      '<polygon points="114,186 152,209 152,255 114,325" fill="#76AF46"/>' +
      '<polygon points="114,325 152,255 188,232 266,232" fill="#377D3F"/>' +
      '<polygon points="0,70 266,232 188,232 40,142" fill="#4286C5"/>' +
      "</svg>"
    );
  }

  let _mirGradSeq = 0;

  function mirLogoSVG(opts) {
    opts = opts || {};
    const h = Number(opts.height) || 16;
    const w = Math.round((h * 90) / 26);
    const isDark = opts.tone === "dark";
    const ink = isDark ? "#34D06E" : "#1F9E52";
    const gid = "mir-wing-" + (++_mirGradSeq);
    return (
      `<svg class="ygo-net-svg ygo-mir-svg" width="${w}" height="${h}" viewBox="0 0 90 26" fill="none" role="img" aria-label="МИР">` +
      "<title>МИР</title>" +
      `<defs><linearGradient id="${gid}" x1="60.4" y1="7" x2="89.2" y2="7" gradientUnits="userSpaceOnUse">` +
      '<stop offset="0%" stop-color="#0095D9"/><stop offset="100%" stop-color="#20C4F4"/>' +
      `</linearGradient></defs>` +
      `<path d="M0 24V4h7.4c2.1 0 3.7 1.1 4.6 3l3.1 7.2L18.2 7c.9-1.9 2.5-3 4.6-3h5.4v20h-6V12.6L17.4 24h-4.6L8 12.6V24H0Z" fill="${ink}"/>` +
      `<path d="M33 24V4h6v11.6L48.4 4h6.4v20h-6V12.4L39.4 24H33Z" fill="${ink}"/>` +
      `<path d="M61 24V12.4h23.8c-.9 3.4-3.7 5.4-7.9 5.4H67.4V24H61Z" fill="${ink}"/>` +
      `<path d="M60.4 4h20.4c4.7 0 8.1 2.7 8.4 6.6H70.4c-5.4 0-9.1-2.5-10-6.6Z" fill="url(#${gid})"/>` +
      "</svg>"
    );
  }

  function cardNetworkLogoHTML(brand, opts) {
    opts = opts || {};
    const h = Number(opts.height) || 16;
    const isDark = opts.tone === "dark";
    const b = String(brand || "").trim();
    if (b === "МИР" || (opts.defaultMir && (!b || b === "Карта РФ"))) {
      return mirLogoSVG({ height: h, tone: isDark ? "dark" : "light" });
    }
    if (b === "VISA") {
      const vw = Math.round((h * 56) / 18);
      const vInk = isDark ? "#FFFFFF" : "#1A1F71";
      return (
        `<svg class="ygo-net-svg ygo-visa-svg" width="${vw}" height="${h}" viewBox="0 0 56 18" fill="none" role="img" aria-label="VISA">` +
        "<title>VISA</title>" +
        `<text x="0" y="15.5" font-family="Inter, Arial, sans-serif" font-style="italic" font-weight="900" font-size="18" letter-spacing="-0.8" fill="${vInk}">VISA</text>` +
        "</svg>"
      );
    }
    if (b === "Mastercard") {
      const mh = Math.max(16, Math.round(h * 1.15));
      const mw = Math.round((mh * 32) / 20);
      const mcSvg =
        `<svg class="ygo-net-svg ygo-mc-svg" width="${mw}" height="${mh}" viewBox="0 0 32 20" fill="none" role="img" aria-label="Mastercard">` +
        "<title>Mastercard</title>" +
        '<circle cx="11" cy="10" r="8.5" fill="#EB001B"/>' +
        '<circle cx="21" cy="10" r="8.5" fill="#F79E1B"/>' +
        '<path d="M16 3.3a8.5 8.5 0 0 0 0 13.4 8.5 8.5 0 0 0 0-13.4Z" fill="#FF5F00"/>' +
        "</svg>";
      return opts.showLabel ? `${mcSvg}<span class="ygo-net-mc-lbl">Mastercard</span>` : mcSvg;
    }
    if (b === "UnionPay") {
      const uh = Math.max(16, Math.round(h * 1.15));
      const uw = Math.round((uh * 32) / 20);
      return (
        `<svg class="ygo-net-svg ygo-up-svg" width="${uw}" height="${uh}" viewBox="0 0 32 20" fill="none" role="img" aria-label="UnionPay">` +
        "<title>UnionPay</title>" +
        '<rect x="1" y="2" width="11" height="16" rx="3" fill="#E21836"/>' +
        '<rect x="10.5" y="2" width="11" height="16" rx="3" fill="#00447C"/>' +
        '<rect x="20" y="2" width="11" height="16" rx="3" fill="#007B84"/>' +
        '<text x="5.5" y="13.5" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="8.5" fill="#FFFFFF">UP</text>' +
        "</svg>"
      );
    }
    return `<span class="ygo-net-fallback${isDark ? " is-dark" : ""}">Карта РФ</span>`;
  }

  const CARD_BANK_RULES = [
    ["220024", "ВТБ", "vtb"],
    ["220040", "ВТБ", "vtb"],
    ["220065", "ВТБ", "vtb"],
    ["220224", "ВТБ", "vtb"],
    ["220220", "СберБанк", "sber"],
    ["220221", "СберБанк", "sber"],
    ["220222", "СберБанк", "sber"],
    ["220070", "Т-Банк", "tbank"],
    ["437772", "Т-Банк", "tbank"],
    ["437773", "Т-Банк", "tbank"],
    ["521324", "Т-Банк", "tbank"],
    ["553691", "Т-Банк", "tbank"],
    ["518901", "Т-Банк", "tbank"],
    ["220015", "Альфа-Банк", "alfa"],
    ["220424", "Ozon Банк", "ozon"],
    ["220432", "Ozon Банк", "ozon"],
    ["220431", "Яндекс Банк", "yandex"],
    ["220341", "Райффайзенбанк", "raif"],
    ["2202", "СберБанк", "sber"],
    ["4276", "СберБанк", "sber"],
    ["4279", "СберБанк", "sber"],
    ["4274", "СберБанк", "sber"],
    ["4048", "СберБанк", "sber"],
    ["5469", "СберБанк", "sber"],
    ["5336", "СберБанк", "sber"],
    ["5228", "СберБанк", "sber"],
    ["5484", "СберБанк", "sber"],
    ["4272", "ВТБ", "vtb"],
    ["4366", "ВТБ", "vtb"],
    ["4188", "ВТБ", "vtb"],
    ["4475", "ВТБ", "vtb"],
    ["5368", "ВТБ", "vtb"],
    ["5543", "ВТБ", "vtb"],
    ["5278", "ВТБ", "vtb"],
    ["4377", "Т-Банк", "tbank"],
    ["5280", "Т-Банк", "tbank"],
    ["5213", "Т-Банк", "tbank"],
    ["5536", "Т-Банк", "tbank"],
    ["4154", "Альфа-Банк", "alfa"],
    ["4584", "Альфа-Банк", "alfa"],
    ["4779", "Альфа-Банк", "alfa"],
    ["5486", "Альфа-Банк", "alfa"],
    ["5559", "Альфа-Банк", "alfa"],
    ["5101", "Альфа-Банк", "alfa"],
    ["5211", "Альфа-Банк", "alfa"],
    ["5489", "Газпромбанк", "gpb"],
    ["5264", "Газпромбанк", "gpb"]
  ];

  function detectCardMeta(rawNum) {
    const d = String(rawNum || "").replace(/\D+/g, "");
    let brand = "Карта РФ";
    if (!d) {
      brand = "МИР";
    } else if (/^220[0-4]/.test(d) || d === "2" || d === "22" || d === "220") {
      brand = "МИР";
    } else if (/^5[1-5]/.test(d) || /^(?:222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(d)) {
      brand = "Mastercard";
    } else if (/^4/.test(d)) {
      brand = "VISA";
    } else if (/^62/.test(d)) {
      brand = "UnionPay";
    }
    let bankName = "";
    let bankTheme = "default";
    for (let i = 0; i < CARD_BANK_RULES.length; i++) {
      const rule = CARD_BANK_RULES[i];
      if (d.startsWith(rule[0])) {
        bankName = rule[1];
        bankTheme = rule[2];
        break;
      }
    }
    return { brand, bankName, bankTheme, bin: d.slice(0, 6) };
  }

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
    VEKTOR_STAR_D,
    VEKTOR_SWIRL_D,
    geminiStarBodySVG,
    BRAND_MARK_HTML,
    BRAND_WORDMARK_HTML,
    brandMarkHTML,
    brandLockupHTML,
    brandLogoSVG,
    GOOGLE_SVG,
    TELEGRAM_SVG,
    WHATSAPP_SVG,
    sbpLogoSVG,
    mirLogoSVG,
    cardNetworkLogoHTML,
    detectCardMeta,
    getIconCatalog,
    triggerIconTileAnim
  };
})();
