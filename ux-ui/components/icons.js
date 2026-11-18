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

  const VEKTOR_SWIRL_D =
    "M32.86 2.81C35.01 5.22 36.07 9.39 34.73 12.33C34.33 13.21 33.66 13.95 33.04 14.69C32.17 15.74 31.28 16.77 30.42 17.82C29.81 18.57 29.07 19.30 28.82 20.23C27.94 23.55 34.11 28.76 31.04 30.30C30.43 30.60 29.57 30.26 29.05 29.82C26.80 27.91 26.21 24.21 23.59 22.85C23.36 23.43 23.18 24.05 23.12 24.67C23.11 24.82 23.10 24.96 23.10 25.11C23.09 25.30 23.09 25.50 23.10 25.69C23.11 25.89 23.12 26.08 23.14 26.27C23.18 26.56 23.23 26.85 23.30 27.13C23.39 27.46 23.51 27.78 23.66 28.08C23.87 28.51 24.15 28.90 24.43 29.29C22.83 29.61 20.66 28.50 20.12 26.96C19.99 26.59 19.92 26.21 19.88 25.82C19.74 24.37 20.12 22.92 20.29 21.48C20.45 20.04 20.24 18.58 20.26 17.13C21.38 17.61 22.17 18.68 22.90 19.65C24.22 21.40 25.25 23.34 26.47 25.16C26.84 25.72 27.18 26.36 27.75 26.72C28.17 27.00 28.82 27.09 29.25 26.84C30.30 26.24 29.20 24.31 28.56 23.28C27.62 21.76 26.71 20.09 26.56 18.31C26.38 16.06 27.30 13.80 28.18 11.71C29.49 8.63 31.11 5.67 32.86 2.81ZM57.71 18.15C56.69 21.22 53.62 24.22 50.40 24.53C49.44 24.63 48.46 24.41 47.51 24.24C46.17 24.01 44.83 23.76 43.49 23.54C42.54 23.38 41.54 23.11 40.61 23.36C37.29 24.26 35.86 32.21 32.99 30.32C32.43 29.94 32.30 29.03 32.42 28.36C32.95 25.45 35.85 23.09 35.72 20.14C35.10 20.24 34.48 20.39 33.91 20.65C33.77 20.71 33.65 20.78 33.52 20.85C33.35 20.94 33.18 21.04 33.01 21.14C32.85 21.24 32.69 21.35 32.53 21.47C32.30 21.64 32.07 21.83 31.87 22.03C31.63 22.27 31.41 22.54 31.22 22.82C30.96 23.21 30.76 23.66 30.57 24.09C29.49 22.86 29.36 20.43 30.42 19.19C30.68 18.90 30.98 18.64 31.29 18.42C32.47 17.57 33.92 17.17 35.26 16.59C36.59 16.02 37.74 15.11 39.01 14.40C39.16 15.61 38.63 16.83 38.15 17.95C37.29 19.96 36.12 21.82 35.16 23.79C34.86 24.39 34.48 25.01 34.44 25.68C34.42 26.18 34.66 26.79 35.10 27.04C36.14 27.65 37.26 25.73 37.83 24.66C38.68 23.09 39.67 21.47 41.14 20.45C43.00 19.16 45.41 18.83 47.66 18.55C50.99 18.14 54.36 18.07 57.71 18.15ZM56.85 47.34C53.68 48.00 49.55 46.83 47.67 44.20C47.10 43.41 46.81 42.46 46.47 41.55C46.00 40.28 45.56 38.99 45.07 37.72C44.73 36.82 44.47 35.81 43.79 35.14C41.35 32.71 33.74 35.45 33.96 32.02C34.00 31.34 34.72 30.77 35.36 30.54C38.14 29.55 41.64 30.88 44.13 29.29C43.74 28.80 43.30 28.34 42.79 27.98C42.67 27.89 42.54 27.81 42.42 27.74C42.25 27.63 42.08 27.54 41.91 27.45C41.74 27.36 41.57 27.27 41.39 27.19C41.12 27.08 40.85 26.98 40.57 26.90C40.24 26.82 39.90 26.76 39.56 26.74C39.09 26.70 38.61 26.76 38.13 26.80C38.66 25.26 40.70 23.93 42.31 24.23C42.69 24.30 43.06 24.43 43.41 24.59C44.73 25.19 45.80 26.25 46.97 27.12C48.13 27.98 49.50 28.53 50.74 29.27C49.77 30.00 48.45 30.15 47.25 30.30C45.07 30.56 42.87 30.48 40.69 30.63C40.02 30.68 39.30 30.65 38.69 30.96C38.25 31.18 37.84 31.70 37.84 32.20C37.84 33.41 40.06 33.42 41.27 33.38C43.06 33.33 44.96 33.38 46.57 34.14C48.62 35.10 50.11 37.03 51.48 38.84C53.50 41.51 55.24 44.39 56.85 47.34ZM31.14 61.19C28.99 58.78 27.93 54.61 29.27 51.67C29.67 50.79 30.34 50.05 30.96 49.31C31.83 48.26 32.72 47.23 33.58 46.18C34.19 45.43 34.93 44.70 35.18 43.77C36.06 40.45 29.89 35.24 32.96 33.70C33.57 33.40 34.43 33.74 34.95 34.18C37.20 36.09 37.79 39.79 40.41 41.15C40.64 40.57 40.82 39.95 40.88 39.33C40.89 39.18 40.90 39.04 40.90 38.89C40.91 38.70 40.91 38.50 40.90 38.31C40.89 38.11 40.88 37.92 40.86 37.73C40.82 37.44 40.77 37.15 40.70 36.87C40.61 36.54 40.49 36.22 40.34 35.92C40.13 35.49 39.85 35.10 39.57 34.71C41.17 34.39 43.34 35.50 43.88 37.04C44.01 37.41 44.08 37.79 44.12 38.18C44.26 39.63 43.88 41.08 43.71 42.52C43.55 43.96 43.76 45.42 43.74 46.87C42.62 46.39 41.83 45.32 41.10 44.35C39.78 42.60 38.75 40.66 37.53 38.84C37.16 38.28 36.82 37.64 36.25 37.28C35.83 37.00 35.18 36.91 34.75 37.16C33.70 37.76 34.80 39.69 35.44 40.72C36.38 42.24 37.29 43.91 37.44 45.69C37.62 47.94 36.70 50.20 35.82 52.29C34.51 55.37 32.89 58.33 31.14 61.19ZM6.29 45.85C7.31 42.78 10.38 39.78 13.60 39.47C14.56 39.37 15.54 39.59 16.49 39.76C17.83 39.99 19.17 40.24 20.51 40.46C21.46 40.62 22.46 40.89 23.39 40.64C26.71 39.74 28.14 31.79 31.01 33.68C31.57 34.06 31.70 34.97 31.58 35.64C31.05 38.55 28.15 40.91 28.28 43.86C28.90 43.76 29.52 43.61 30.09 43.35C30.23 43.29 30.35 43.22 30.48 43.15C30.65 43.06 30.82 42.96 30.99 42.86C31.15 42.76 31.31 42.65 31.47 42.53C31.70 42.36 31.93 42.17 32.13 41.97C32.37 41.73 32.59 41.46 32.78 41.18C33.04 40.79 33.24 40.34 33.43 39.91C34.51 41.14 34.64 43.57 33.58 44.81C33.32 45.10 33.02 45.36 32.71 45.58C31.53 46.43 30.08 46.83 28.74 47.41C27.41 47.98 26.26 48.89 24.99 49.60C24.84 48.39 25.37 47.17 25.85 46.05C26.71 44.04 27.88 42.18 28.84 40.21C29.14 39.61 29.52 38.99 29.56 38.32C29.58 37.82 29.34 37.21 28.90 36.96C27.86 36.35 26.74 38.27 26.17 39.34C25.32 40.91 24.33 42.53 22.86 43.55C21.00 44.84 18.59 45.17 16.34 45.45C13.01 45.86 9.64 45.93 6.29 45.85ZM7.15 16.66C10.32 16.00 14.45 17.17 16.33 19.80C16.90 20.59 17.19 21.54 17.53 22.45C18.00 23.72 18.44 25.01 18.93 26.28C19.27 27.18 19.53 28.19 20.21 28.86C22.65 31.29 30.26 28.55 30.04 31.98C30.00 32.66 29.28 33.23 28.64 33.46C25.86 34.45 22.36 33.12 19.87 34.71C20.26 35.20 20.70 35.66 21.21 36.02C21.33 36.11 21.46 36.19 21.58 36.26C21.75 36.37 21.92 36.46 22.09 36.55C22.26 36.64 22.43 36.73 22.61 36.81C22.88 36.92 23.15 37.02 23.43 37.10C23.76 37.18 24.10 37.24 24.44 37.26C24.91 37.30 25.39 37.24 25.87 37.20C25.34 38.74 23.30 40.07 21.69 39.77C21.31 39.70 20.94 39.57 20.59 39.41C19.27 38.81 18.20 37.75 17.03 36.88C15.87 36.02 14.50 35.47 13.26 34.73C14.23 34.00 15.55 33.85 16.75 33.70C18.93 33.44 21.13 33.52 23.31 33.37C23.98 33.32 24.70 33.35 25.31 33.04C25.75 32.82 26.16 32.30 26.16 31.80C26.16 30.59 23.94 30.58 22.73 30.62C20.94 30.67 19.04 30.62 17.43 29.86C15.38 28.90 13.89 26.97 12.52 25.16C10.50 22.49 8.76 19.61 7.15 16.66Z";

  function sakhaStarCoreSVG() {
    // 6-лепестковый якутский цветок-вихрь (точная симметрия C6 вокруг центра 32, 32)
    return `<path class="bm-glyph" fill="currentColor" stroke="none" d="${VEKTOR_SWIRL_D}"/>`;
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
      return `<div class="sakha-divider is-gold-logo" aria-label="${label || "Вектор ЕГЭ · Саха"}"><span class="sakha-div-line" aria-hidden="true"></span>${goldEmblem}<span class="sakha-div-line" aria-hidden="true"></span></div>`;
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
      `<defs><linearGradient id="${gid}" gradientUnits="userSpaceOnUse" x1="9" y1="8" x2="55" y2="56">` +
      `<stop offset="0%" stop-color="#6fd5fe"/>` +
      `<stop offset="50%" stop-color="#81a5d4"/>` +
      `<stop offset="100%" stop-color="#9375aa"/>` +
      `</linearGradient></defs>`
    );
  }

  function brandMarkHTML() {
    const gid = "vlg-" + (++_bmGradSeq);
    return (
      `<span class="brand-mark" aria-hidden="true">` +
      `<svg viewBox="0 0 64 64" fill="none">${brandMarkDefsSVG(gid)}<path class="bm-glyph" fill="url(#${gid})" d="${VEKTOR_SWIRL_D}"/></svg>` +
      `</span>`
    );
  }

  const BRAND_MARK_HTML =
    `<span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 64 64" fill="none">${brandMarkDefsSVG("vektor-bm-grad")}<path class="bm-glyph" fill="url(#vektor-bm-grad)" d="${VEKTOR_SWIRL_D}"/></svg></span>`;

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
    return `<div class="brand-lockup"${surfAttr}>${brandMarkHTML()}<div class="brand-text"><div class="brand-name">${BRAND_WORDMARK_HTML}${tagHTML}</div>${subHTML}</div></div>`;
  }

  function brandLogoSVG(surface, kind) {
    const mode = surface === "dark" || surface === "blue" ? surface : "light";
    const isLockup = kind === "lockup";
    const wmInk = mode === "light" ? "#0e1116" : "#ffffff";
    const wmAccent = mode === "light" ? "#0070ff" : (mode === "dark" ? "#3b8fff" : "#bae6fd");
    const gid = mode === "dark" ? (isLockup ? "vektor-svg-dark-l" : "vektor-svg-dark") : "";
    const defs = gid ? brandMarkDefsSVG(gid) : "";
    const bgHex = mode === "dark" ? "#0b0d12" : (mode === "blue" ? "#0070ff" : "#ffffff");
    const markFill = mode === "dark" ? `url(#${gid})` : (mode === "blue" ? "#ffffff" : "#1f1a17");
    const swirlPath = `<path fill="${markFill}" d="${VEKTOR_SWIRL_D}"/>`;
    if (!isLockup) {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" fill="none">${defs}<rect width="64" height="64" rx="16" fill="${bgHex}"/>${swirlPath}</svg>`;
    }
    const lockupCanvas = `<rect width="260" height="72" rx="16" fill="${bgHex}"/>`;
    const wordPaths =
      `<g transform="translate(80, 17) scale(1.22)" stroke-width="2.55" stroke-linecap="round" stroke-linejoin="round">` +
      `<g stroke="${wmInk}" fill="none">` +
      `<path d="M3 22.5V6h7.2l2.6 2.6v3.2l-2.4 2.4H3"/>` +
      `<path d="M10.4 14.2l3 2.6v3.2l-2.6 2.5H3"/>` +
      `<path d="M17.5 16.4H27v-2.9L24.5 11H20l-2.5 2.5V20l2.5 2.5h5l1.8-1.8"/>` +
      `<path d="M31.5 11v11.5M40.8 11l-6.6 5.7 7 5.8M31.5 16.7h3"/>` +
      `<path d="M44.5 11h11M50 11v11.5"/>` +
      `<path d="M61 11h5l2.5 2.5V20L66 22.5h-5L58.5 20v-6.5Z"/>` +
      `<path d="M73 11v16.5M73 11h7.2l2.6 2.6v6.3l-2.6 2.6H73"/>` +
      `</g>` +
      `<polygon points="90,11.6 93,14.6 90,17.6 87,14.6" fill="${wmAccent}"/>` +
      `<g stroke="${wmAccent}" fill="none">` +
      `<path d="M108 6h-8.2L97.5 8.3v11.9l2.3 2.3H108M97.5 14.2h8.5"/>` +
      `<path d="M113.5 22.5V8.3l2.3-2.3h8"/>` +
      `<path d="M128.5 6h9l2.7 2.7v11.1l-2.7 2.7h-9M130.5 14.2h9.7"/>` +
      `</g></g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="260" height="72" viewBox="0 0 260 72" fill="none">${defs}${lockupCanvas}<g transform="translate(8, 4)">${swirlPath}</g>${wordPaths}</svg>`;
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
    VEKTOR_SWIRL_D,
    BRAND_MARK_HTML,
    BRAND_WORDMARK_HTML,
    brandMarkHTML,
    brandLockupHTML,
    brandLogoSVG,
    GOOGLE_SVG,
    getIconCatalog,
    triggerIconTileAnim
  };
})();
