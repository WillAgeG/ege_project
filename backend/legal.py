"""Юридические документы «Вектор» (152-ФЗ, публичная оферта, правила эскроу и возврата)."""

from __future__ import annotations

from html import escape


TOP_SITE_NAV = (
    ("/", "Репетиторы"),
    ("/student?auth=register", "Для ученика"),
    ("/tutor?auth=register", "Для преподавателя"),
    ("/fees", "Условия оплаты"),
)

LEGAL_NAV = (
    ("/fees", "Условия оплаты", "fees"),
    ("/terms", "Публичная оферта", "terms"),
    ("/refunds", "Возврат и эскроу", "refunds"),
    ("/privacy", "Политика конфиденциальности", "privacy"),
)

_BRAND_STAR_SVG = (
    '<svg class="brand-star" viewBox="0 0 64 64" width="34" height="34" fill="none" aria-hidden="true">'
    "<defs>"
    '<linearGradient id="vlg-base" gradientUnits="userSpaceOnUse" x1="8" y1="12" x2="58" y2="52">'
    '<stop offset="0%" stop-color="#4285f4"/>'
    '<stop offset="56%" stop-color="#2b7fff"/>'
    '<stop offset="100%" stop-color="#669df6"/>'
    "</linearGradient>"
    '<radialGradient id="vlg-red" gradientUnits="userSpaceOnUse" cx="16" cy="15" r="30">'
    '<stop offset="0%" stop-color="#ff5252" stop-opacity="1"/>'
    '<stop offset="46%" stop-color="#ea4335" stop-opacity=".92"/>'
    '<stop offset="100%" stop-color="#ea4335" stop-opacity="0"/>'
    "</radialGradient>"
    '<radialGradient id="vlg-amber" gradientUnits="userSpaceOnUse" cx="13" cy="47" r="29">'
    '<stop offset="0%" stop-color="#fbbc04" stop-opacity="1"/>'
    '<stop offset="48%" stop-color="#f9ab00" stop-opacity=".88"/>'
    '<stop offset="100%" stop-color="#fbbc04" stop-opacity="0"/>'
    "</radialGradient>"
    '<radialGradient id="vlg-green" gradientUnits="userSpaceOnUse" cx="32" cy="59" r="26">'
    '<stop offset="0%" stop-color="#34a853" stop-opacity=".96"/>'
    '<stop offset="44%" stop-color="#22c55e" stop-opacity=".68"/>'
    '<stop offset="100%" stop-color="#34a853" stop-opacity="0"/>'
    "</radialGradient>"
    "</defs>"
    '<path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20'
    'C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80'
    'C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60'
    'C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80'
    'C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20'
    'C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vlg-base)"/>'
    '<path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20'
    'C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80'
    'C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60'
    'C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80'
    'C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20'
    'C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vlg-red)"/>'
    '<path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20'
    'C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80'
    'C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60'
    'C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80'
    'C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20'
    'C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vlg-amber)"/>'
    '<path d="M32.00 4.40C33.25 4.40 35.57 16.51 39.60 18.84C43.63 21.16 55.28 17.12 55.90 18.20'
    'C56.53 19.28 47.20 27.35 47.20 32.00C47.20 36.65 56.53 44.72 55.90 45.80'
    'C55.28 46.88 43.63 42.84 39.60 45.16C35.57 47.49 33.25 59.60 32.00 59.60'
    'C30.75 59.60 28.43 47.49 24.40 45.16C20.37 42.84 8.72 46.88 8.10 45.80'
    'C7.47 44.72 16.80 36.65 16.80 32.00C16.80 27.35 7.47 19.28 8.10 18.20'
    'C8.72 17.12 20.37 21.16 24.40 18.84C28.43 16.51 30.75 4.40 32.00 4.40Z" fill="url(#vlg-green)"/>'
    "</svg>"
)

_MOON_SVG = (
    '<svg class="ico-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'
    "</svg>"
)

_SUN_SVG = (
    '<svg class="ico-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" '
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    '<circle cx="12" cy="12" r="4"/>'
    '<path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41'
    'M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>'
    "</svg>"
)


def _render_legal_page(
    *,
    active: str,
    title: str,
    badge: str,
    updated_at: str,
    eyebrow: str,
    chips: tuple[tuple[str, str], ...],
    lead: str,
    kpis: tuple[tuple[str, str, str], ...],
    toc: tuple[tuple[str, str], ...],
    cta_secondary: tuple[str, str],
    body_html: str,
) -> str:
    top_links = "".join(
        f'<a href="{href}">{escape(label)}</a>'
        for href, label in TOP_SITE_NAV
    )
    doc_tabs = "".join(
        (
            f'<a href="{href}" class="doc-tab{" is-active" if key == active else ""}"'
            f'{" aria-current=\"page\"" if key == active else ""}>{escape(label)}</a>'
        )
        for href, label, key in LEGAL_NAV
    )
    chips_html = "".join(
        f'<span class="chip {escape(tone)}">{escape(text)}</span>'
        for tone, text in chips
    )
    kpis_html = "".join(
        (
            '<div class="doc-kpi">'
            f'<span class="doc-kpi-val num">{escape(val)}</span>'
            f"<b>{escape(label)}</b>"
            f'<span class="doc-kpi-sub">{escape(sub)}</span>'
            "</div>"
        )
        for val, label, sub in kpis
    )
    toc_html = "".join(
        f'<a href="#{escape(sec_id)}" class="doc-toc-link">{escape(sec_label)}</a>'
        for sec_id, sec_label in toc
    )
    sec_label, sec_href = cta_secondary

    return f"""<!doctype html>
<html lang="ru" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>{escape(title)} — Вектор</title>
<meta name="color-scheme" content="light dark">
<link rel="icon" href="/favicon.ico?v=2" sizes="any">
<link rel="icon" type="image/svg+xml" href="/assets/favicon.svg?v=2">
<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32x32.png?v=2">
<link rel="icon" type="image/png" sizes="16x16" href="/assets/favicon-16x16.png?v=2">
<link rel="apple-touch-icon" sizes="180x180" href="/assets/apple-touch-icon.png?v=2">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700;800&display=swap">
<script src="/core/legal-theme.js"></script>
<style>
:root {{
  --bg: #ffffff;
  --surface: #ffffff;
  --surface-2: #f4f6fa;
  --ink: #111622;
  --ink-2: #3f4756;
  --muted: #667085;
  --line: rgba(17, 22, 34, .10);
  --line-strong: rgba(17, 22, 34, .18);
  --accent: #0b57d0;
  --accent-hover: #0842a0;
  --accent-soft: #e8f0fe;
  --confirm: #15803d;
  --confirm-soft: #dcfce7;
  --pro: #7c3aed;
  --pro-soft: #f3e8ff;
  --pill-bg: #111622;
  --pill-ink: #ffffff;
  --shadow: 0 10px 28px -18px rgba(17, 22, 34, .14);
  --font-body: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  --font-mono: "IBM Plex Mono", ui-monospace, "Cascadia Mono", Consolas, monospace;
  color-scheme: light;
}}
:root[data-theme="dark"] {{
  --bg: #000000;
  --surface: #12151c;
  --surface-2: #1a1f2a;
  --ink: #f5f7fa;
  --ink-2: #cfd6e4;
  --muted: #98a2b3;
  --line: rgba(255, 255, 255, .12);
  --line-strong: rgba(255, 255, 255, .20);
  --accent: #1d7bff;
  --accent-hover: #0d67e8;
  --accent-soft: #102548;
  --confirm: #22c55e;
  --confirm-soft: #0c2b17;
  --pro: #a78bfa;
  --pro-soft: #21153b;
  --pill-bg: #ffffff;
  --pill-ink: #141517;
  --shadow: 0 12px 32px -18px rgba(0, 0, 0, .75);
  color-scheme: dark;
}}
* {{ box-sizing: border-box; }}
html, body {{ min-height: 100%; max-width: 100%; overflow-x: clip; }}
body {{
  margin: 0;
  background: var(--bg);
  color: var(--ink);
  font: 15px/1.6 var(--font-body);
  -webkit-font-smoothing: antialiased;
  padding-bottom: calc(40px + env(safe-area-inset-bottom, 0px));
}}
a {{ color: var(--accent); text-underline-offset: 3px; }}
button {{ font: inherit; color: inherit; cursor: pointer; }}
h1, h2, h3 {{ margin: 0; text-wrap: balance; }}
p {{ margin: 0; }}
.num {{ font-variant-numeric: tabular-nums; }}
.small {{ font-size: 13px; }}
.muted {{ color: var(--muted); }}
.eyebrow {{
  font-family: var(--font-mono);
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: .04em;
  text-transform: uppercase;
  color: var(--muted);
}}
.land-top {{
  position: sticky;
  top: env(safe-area-inset-top, 0px);
  z-index: 30;
  width: 100%;
  border-bottom: 1px solid var(--line);
  background: rgba(255, 255, 255, .94);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
}}
:root[data-theme="dark"] .land-top {{
  background: rgba(12, 14, 19, .90);
  border-bottom-color: rgba(255, 255, 255, .10);
}}
.land-top-inner {{
  width: 100%;
  max-width: 1260px;
  margin: 0 auto;
  padding: 12px max(16px, env(safe-area-inset-left, 0px)) 12px max(16px, env(safe-area-inset-right, 0px));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}}
@media (min-width: 1360px) {{
  .land-top-inner,
  .land-page {{ max-width: 1340px; }}
}}
.brand-home-link {{
  display: inline-flex;
  align-items: center;
  gap: 10px;
  text-decoration: none;
  color: var(--ink);
  flex: none;
}}
.brand-wordmark {{
  font-size: 23px;
  font-weight: 700;
  letter-spacing: -.03em;
  line-height: 1;
  color: var(--ink);
}}
.land-links {{
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1 1 auto;
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}}
.land-links::-webkit-scrollbar {{ display: none; }}
.land-links a {{
  text-decoration: none;
  color: var(--ink-2);
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  padding: 5px 8px;
  border-radius: 8px;
  transition: color .14s ease, background-color .14s ease;
}}
.land-links a:hover {{
  color: var(--accent);
  background: var(--accent-soft);
}}
.land-top-actions {{
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}}
.icon-btn {{
  width: 34px;
  height: 34px;
  padding: 0;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
  display: grid;
  place-items: center;
  transition: border-color .15s ease, color .15s ease, background-color .15s ease;
}}
.icon-btn:hover {{
  border-color: var(--accent);
  color: var(--ink);
}}
:root:not([data-theme="dark"]) .ico-sun {{ display: none; }}
:root[data-theme="dark"] .ico-moon {{ display: none; }}
.btn-pill {{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 6px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--accent);
  color: #ffffff;
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 600;
  white-space: nowrap;
  transition: background-color .15s ease;
}}
.btn-pill:hover {{ background: var(--accent-hover); }}
@media (max-width: 760px) {{
  .land-links {{ display: none; }}
}}
.land-page {{
  width: 100%;
  max-width: 1260px;
  margin: 0 auto;
  padding: 24px max(16px, env(safe-area-inset-left, 0px)) 0 max(16px, env(safe-area-inset-right, 0px));
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 24px;
}}
.legal-tabs {{
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}}
.doc-tab {{
  display: inline-flex;
  align-items: center;
  min-height: 36px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
  text-decoration: none;
  font-size: 13.5px;
  font-weight: 500;
  white-space: nowrap;
  transition: border-color .15s ease, color .15s ease, background-color .15s ease;
}}
.doc-tab:hover {{ border-color: var(--accent); color: var(--ink); }}
.doc-tab.is-active {{
  background: var(--pill-bg);
  border-color: var(--pill-bg);
  color: var(--pill-ink);
  font-weight: 600;
}}
.doc-hero {{
  display: grid;
  gap: 20px;
  padding: 28px;
  border-radius: 22px;
  border: 1px solid var(--line);
  background:
    radial-gradient(640px 260px at 96% 0%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 70%),
    var(--surface);
  box-shadow: var(--shadow);
}}
.doc-hero-top {{ display: grid; gap: 10px; }}
.doc-chips {{
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}}
.chip {{
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 500;
  white-space: nowrap;
  background: var(--surface-2);
  color: var(--ink-2);
}}
.chip.accent {{ background: var(--accent-soft); color: var(--accent); }}
.chip.confirm {{ background: var(--confirm-soft); color: var(--confirm); }}
.chip.pro {{ background: var(--pro-soft); color: var(--pro); }}
.doc-hero-h1 {{
  font-size: clamp(26px, 3.4vw, 38px);
  line-height: 1.15;
  letter-spacing: -.02em;
  color: var(--ink);
  max-width: 24ch;
}}
.doc-hero-lead {{
  font-size: 16px;
  line-height: 1.58;
  color: var(--ink-2);
  max-width: 72ch;
}}
.doc-kpis {{
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}}
.doc-kpi {{
  display: grid;
  gap: 4px;
  align-content: start;
  padding: 16px 18px;
  border-radius: 16px;
  border: 1px solid var(--line);
  background: var(--surface-2);
}}
.doc-kpi-val {{
  font-size: clamp(24px, 2.8vw, 32px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -.02em;
  color: var(--ink);
}}
.doc-kpi b {{ font-size: 14px; color: var(--ink); }}
.doc-kpi-sub {{ font-size: 13px; color: var(--muted); }}
.doc-grid {{
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 20px;
  align-items: start;
}}
.doc-sections {{
  display: grid;
  gap: 14px;
  min-width: 0;
}}
.callout {{
  padding: 16px 20px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--ink-2);
  font-size: 14.5px;
}}
.callout strong {{ color: var(--ink); }}
.callout.is-guar {{
  border-color: color-mix(in srgb, var(--confirm) 40%, var(--line));
  background: var(--confirm-soft);
  color: var(--ink);
}}
.doc-section {{
  display: grid;
  gap: 12px;
  padding: 22px 24px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: var(--surface);
  scroll-margin-top: 78px;
}}
.doc-sec-head {{
  display: flex;
  align-items: center;
  gap: 12px;
}}
.how-num {{
  width: 30px;
  height: 30px;
  border-radius: 50%;
  flex: none;
  display: grid;
  place-items: center;
  background: var(--accent-soft);
  color: var(--accent);
  font-family: var(--font-mono);
  font-weight: 600;
  font-size: 13px;
}}
.doc-section h2 {{
  font-size: 18px;
  line-height: 1.3;
  color: var(--ink);
}}
.doc-section p {{ color: var(--ink-2); font-size: 14.5px; }}
.doc-section ul,
.doc-section ol {{
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 8px;
  color: var(--ink-2);
  font-size: 14.5px;
}}
.doc-section strong {{ color: var(--ink); }}
code {{
  font-family: var(--font-mono);
  font-size: 12.5px;
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--ink);
}}
.doc-aside {{
  position: sticky;
  top: 78px;
  display: grid;
  gap: 12px;
}}
.doc-aside-card {{
  display: grid;
  gap: 10px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: var(--surface);
}}
.doc-toc {{
  display: grid;
  gap: 4px;
}}
.doc-toc-link {{
  display: block;
  padding: 6px 8px;
  border-radius: 8px;
  text-decoration: none;
  color: var(--ink-2);
  font-size: 13.5px;
  font-weight: 500;
  transition: background-color .14s ease, color .14s ease;
}}
.doc-toc-link:hover {{
  background: var(--accent-soft);
  color: var(--accent);
}}
.doc-cta-band {{
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 14px 20px;
  padding: 22px 24px;
  border-radius: 18px;
  border: 1px solid var(--line);
  background: var(--surface-2);
}}
.doc-cta-band b {{ font-size: 16px; color: var(--ink); }}
.doc-cta-actions {{
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}}
.btn {{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid transparent;
  background: var(--accent);
  color: #ffffff;
  text-decoration: none;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  transition: background-color .15s ease, border-color .15s ease, color .15s ease;
}}
.btn:hover {{ background: var(--accent-hover); }}
.btn.ghost {{
  background: var(--surface);
  color: var(--ink);
  border-color: var(--line-strong);
}}
.btn.ghost:hover {{
  border-color: var(--accent);
  color: var(--accent);
}}
.land-plain-line {{
  border: 0;
  height: 1px;
  background: var(--line-strong);
  margin: 6px 0 0;
}}
.land-footer {{
  display: flex;
  justify-content: center;
  padding: 6px 4px 12px;
}}
.land-footer-links {{
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px 22px;
}}
.land-foot-plain {{
  font-size: 13px;
  color: var(--muted);
  text-decoration: none;
}}
.land-foot-plain:hover {{
  color: var(--ink);
  text-decoration: underline;
}}
@media (max-width: 1024px) {{
  .doc-kpis {{ grid-template-columns: repeat(2, minmax(0, 1fr)); }}
  .doc-kpis > :last-child {{ grid-column: 1 / -1; }}
  .doc-grid {{ grid-template-columns: minmax(0, 1fr); }}
  .doc-aside {{ position: static; grid-template-columns: repeat(2, minmax(0, 1fr)); }}
}}
@media (max-width: 640px) {{
  .land-page {{ gap: 18px; padding-top: 16px; }}
  .doc-hero {{ padding: 20px 16px; border-radius: 18px; }}
  .doc-kpis,
  .doc-aside {{ grid-template-columns: minmax(0, 1fr); }}
  .doc-kpis > :last-child {{ grid-column: auto; }}
  .doc-section,
  .doc-cta-band {{ padding: 18px 16px; }}
}}
</style>
</head>
<body>
<header class="land-top">
  <div class="land-top-inner">
    <a href="/" class="brand-home-link" aria-label="Вектор — на главную">
      {_BRAND_STAR_SVG}
      <span class="brand-wordmark">Вектор</span>
    </a>
    <nav class="land-links" aria-label="Разделы сайта">{top_links}</nav>
    <div class="land-top-actions">
      <button type="button" class="icon-btn" id="legal-theme-toggle" aria-label="Сменить тему">
        {_MOON_SVG}
        {_SUN_SVG}
      </button>
      <a href="/student?auth=login" class="btn-pill">Войти</a>
    </div>
  </div>
</header>

<main class="land-page">
  <nav class="legal-tabs" aria-label="Документы и условия">{doc_tabs}</nav>

  <section class="doc-hero" aria-label="{escape(title)}">
    <div class="doc-hero-top">
      <div class="doc-chips">{chips_html}</div>
      <div class="eyebrow">{escape(eyebrow)} · Обновлено {escape(updated_at)}</div>
      <h1 class="doc-hero-h1">{escape(title)}</h1>
      <p class="doc-hero-lead">{escape(lead)}</p>
    </div>
    <div class="doc-kpis">{kpis_html}</div>
  </section>

  <div class="doc-grid">
    <div class="doc-sections">{body_html}</div>
    <aside class="doc-aside" aria-label="Навигация по документу">
      <div class="doc-aside-card">
        <div class="eyebrow">Содержание</div>
        <nav class="doc-toc" aria-label="Разделы документа">{toc_html}</nav>
      </div>
      <div class="doc-aside-card">
        <div class="eyebrow">Поддержка и расчёты</div>
        <div class="small muted">По вопросам споров, возвратов и 152-ФЗ:</div>
        <a href="mailto:willagegg@gmail.com" class="small"><b>willagegg@gmail.com</b></a>
        <a href="/fees" class="small">Калькулятор и условия оплаты →</a>
      </div>
    </aside>
  </div>

  <section class="doc-cta-band" aria-label="Дальнейшие действия">
    <div class="stack" style="display:grid;gap:4px">
      <b>Остались вопросы по оплате или выбору преподавателя?</b>
      <span class="small muted">{escape(badge)} · единые правила для всех уроков на платформе.</span>
    </div>
    <div class="doc-cta-actions">
      <a href="/" class="btn">Перейти к подбору репетиторов</a>
      <a href="/fees" class="btn ghost">Условия оплаты и калькулятор</a>
      <a href="{escape(sec_href)}" class="btn ghost">{escape(sec_label)}</a>
    </div>
  </section>

  <hr class="land-plain-line" aria-hidden="true">

  <footer class="land-footer small muted">
    <div class="land-footer-links">
      <a href="/" class="land-foot-plain">Главная</a>
      <a href="/fees" class="land-foot-plain">Условия оплаты</a>
      <a href="/terms" class="land-foot-plain">Публичная оферта</a>
      <a href="/refunds" class="land-foot-plain">Возврат и эскроу</a>
      <a href="/privacy" class="land-foot-plain">Политика конфиденциальности</a>
      <a href="mailto:willagegg@gmail.com" class="land-foot-plain">Поддержка</a>
    </div>
  </footer>
</main>
</body>
</html>"""


def render_privacy_html() -> str:
    body = """
<div class="callout">
  <strong>Кратко о 152-ФЗ:</strong> «Вектор» обрабатывает только те персональные данные, которые необходимы для авторизации, подбора репетитора, расчётов через СБП/карту РФ и сохранения вашего учебного прогресса. Базы данных пользователей локализованы на территории Российской Федерации в соответствии с ч. 5 ст. 18 Федерального закона № 152-ФЗ.
</div>

<section class="doc-section" id="operator">
  <div class="doc-sec-head"><span class="how-num">01</span><h2>Оператор персональных данных и общие положения</h2></div>
  <p>Настоящая Политика конфиденциальности (далее — «Политика») определяет порядок обработки и защиты персональных данных пользователей платформы <strong>«Вектор»</strong> (далее — «Оператор», «Платформа») в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных».</p>
  <p>Использование сайта, регистрация по номеру телефона (WhatsApp / Telegram OTP), вход через Google или Telegram, а также оформление занятий означает согласие Пользователя с настоящей Политикой.</p>
</section>

<section class="doc-section" id="categories">
  <div class="doc-sec-head"><span class="how-num">02</span><h2>Какие данные мы обрабатываем</h2></div>
  <ul>
    <li><strong>Регистрационные и контактные данные:</strong> имя или отображаемое имя, номер телефона, адрес электронной почты, идентификатор и username в Telegram / Google (при привязке аккаунта).</li>
    <li><strong>Анкета и учебный профиль:</strong> город и часовой пояс (по умолчанию Якутск UTC+9 или выбранный город РФ), класс/цель подготовки, целевые баллы и даты экзаменов.</li>
    <li><strong>Данные преподавателя (при размещении анкеты):</strong> образование, стаж, предметы, ставки, открытые слоты расписания и ссылка на видеосвязь (Яндекс Телемост).</li>
    <li><strong>Платёжные метаданные (без хранения PAN/CVC):</strong> маскированный номер карты (последние 4 цифры, бренд МИР/Visa/Mastercard, банк-эмитент), статус пополнений/выплат и номера чеков НПД (422-ФЗ). Полные номера карт и коды CVC/CVV не передаются на сервер Платформы и обрабатываются на стороне платёжного провайдера по стандарту PCI-DSS.</li>
    <li><strong>Учебный прогресс и активность:</strong> результаты тестов ЕГЭ, статистика по темам, сочинения и история заявок/отзывов/споров.</li>
    <li><strong>Технические данные и файлы cookies:</strong> сессионный cookie авторизации <code>pvm_session</code> (HttpOnly), локальное хранилище настроек интерфейса и аналитические события — строго с учётом вашего выбора в баннере согласия на cookies.</li>
  </ul>
</section>

<section class="doc-section" id="cookies">
  <div class="doc-sec-head"><span class="how-num">03</span><h2>Файлы cookies и веб-аналитика</h2></div>
  <ul>
    <li><strong>Строго необходимые cookies:</strong> обеспечивают вход в аккаунт, защиту от CSRF, работу эскроу-кошелька и сохранение выбранного согласия на cookies. Отключение делает авторизацию невозможной.</li>
    <li><strong>Аналитические и продуктовые cookies:</strong> помогают улучшать качество подбора репетиторов, стабильность видеосвязи и тренажёра ЕГЭ. Включаются и отключаются Пользователем в окне «Настройки cookies».</li>
  </ul>
</section>

<section class="doc-section" id="purposes">
  <div class="doc-sec-head"><span class="how-num">04</span><h2>Цели и сроки обработки</h2></div>
  <ul>
    <li>Идентификация Пользователя и предоставление доступа к личному кабинету Ученика или Преподавателя.</li>
    <li>Заключение и исполнение договоров об оказании услуг (по <a href="/terms">Публичной оферте</a>), резервирование оплаты на эскроу и проведение возвратов (по <a href="/refunds">Правилам возврата</a>).</li>
    <li>Направление сервисных уведомлений о заявках, подтверждениях слотов и статусе споров.</li>
    <li>Данные хранятся до момента отзыва согласия или удаления аккаунта, а платёжные и бухгалтерские записи — в сроки, установленные законодательством РФ (не менее 5 лет).</li>
  </ul>
</section>

<section class="doc-section" id="rights">
  <div class="doc-sec-head"><span class="how-num">05</span><h2>Права субъекта персональных данных и контакты</h2></div>
  <p>Пользователь вправе запросить сведения об обработке своих данных, экспортировать учебный прогресс (функция «Скачать резервную копию» в Профиле), уточнить данные, отозвать согласие на аналитические cookies или удалить аккаунт в Профиле.</p>
  <p><strong>Контакты Оператора по вопросам 152-ФЗ:</strong> Платформа «Вектор» · Email: <a href="mailto:willagegg@gmail.com">willagegg@gmail.com</a>. Срок ответа на обращение — до 10 рабочих дней.</p>
</section>
"""
    return _render_legal_page(
        active="privacy",
        title="Политика конфиденциальности «Вектор»",
        badge="152-ФЗ · Персональные данные",
        updated_at="23 ноября 2026 г.",
        eyebrow="Защита данных · 152-ФЗ",
        chips=(
            ("confirm", "Локализация в РФ · ч. 5 ст. 18"),
            ("accent", "PCI-DSS без хранения карт"),
            ("pro", "Экспорт и удаление в 1 клик"),
        ),
        lead="Какие данные обрабатывает «Вектор», как защищены платежи по СБП и картам РФ и как управлять настройками cookies или удалить аккаунт.",
        kpis=(
            ("152-ФЗ", "Хранение в РФ", "Локализация баз данных по ч. 5 ст. 18"),
            ("PCI-DSS", "Без хранения карт", "PAN и CVC не передаются на сервер"),
            ("до 10 дней", "Ответ оператора", "Экспорт прогресса и удаление в Профиле"),
        ),
        toc=(
            ("operator", "01. Оператор и положения"),
            ("categories", "02. Какие данные собираем"),
            ("cookies", "03. Cookies и аналитика"),
            ("purposes", "04. Цели и сроки хранения"),
            ("rights", "05. Права и удаление"),
        ),
        cta_secondary=("Возврат и эскроу", "/refunds"),
        body_html=body,
    )


def render_terms_html() -> str:
    body = """
<div class="callout">
  <strong>Публичная оферта (ст. 435, 437–438 ГК РФ):</strong> Настоящий документ является официальным предложением платформы «Вектор» заключить Пользовательское соглашение и договор об использовании сервиса подбора репетиторов и тренажёра ЕГЭ. Нажатие кнопок «Войти», «Получить код», «Пополнить баланс» или «Отправить заявку» признаётся полным и безоговорочным акцептом Оферты.
</div>

<section class="doc-section" id="subject">
  <div class="doc-sec-head"><span class="how-num">01</span><h2>Термины и роль Платформы</h2></div>
  <p><strong>Платформа «Вектор»</strong> предоставляет Пользователям (Ученикам и их законным представителям) информационно-технологическую площадку для бесплатной подготовки по тренажёру ЕГЭ и прямого согласования индивидуальных или мини-групповых занятий с независимыми Преподавателями в формате предложения собственной ставки (торг с шагом ±50 ₽).</p>
  <p>Платформа выступает агентом по организации расчётов и защите сделки (эскроу), а сами образовательные и консультационные занятия проводятся непосредственно выбранным Преподавателем.</p>
</section>

<section class="doc-section" id="registration">
  <div class="doc-sec-head"><span class="how-num">02</span><h2>Регистрация, возраст и ответственность аккаунта</h2></div>
  <ul>
    <li>Регистрация осуществляется по номеру телефона РФ с подтверждением через WhatsApp/Telegram-бот, либо через Google / Telegram OAuth.</li>
    <li>Несовершеннолетние Ученики вправе пользоваться тренажёром самостоятельно; оплата занятий на сумму свыше пределов мелких бытовых сделок совершается с согласия родителей/законных представителей (ст. 26, 28 ГК РФ).</li>
    <li>Пользователь обязуется не передавать доступ третьим лицам и указывать достоверные контакты (город и часовой пояс) для корректного планирования расписания.</li>
  </ul>
</section>

<section class="doc-section" id="pricing">
  <div class="doc-sec-head"><span class="how-num">03</span><h2>Стоимость услуг, пополнение и комиссия 5% + 1% СБП</h2></div>
  <ul>
    <li>Доступ к тренажёру, теории и вариантам КИМ предоставляется <strong>бесплатно</strong> (0 ₽).</li>
    <li>Стоимость занятия с Преподавателем определяется индивидуально путём отклика Ученика (от 0 до 99 999 ₽/ч) и акцепта Преподавателем.</li>
    <li><strong>Пополнение баланса:</strong> через Систему быстрых платежей (СБП) — <strong>без комиссии (0%)</strong>; банковской картой РФ (МИР, Visa, Mastercard) — с эквайринговым сбором платёжного шлюза <strong>+3%</strong>, отображаемым до подтверждения платежа.</li>
    <li><strong>Расчёты с Преподавателем:</strong> при успешном завершении подтверждённого урока на баланс Преподавателя начисляется <strong>94%</strong> стоимости занятия (<strong>5%</strong> — сервисный сбор Платформы и <strong>1%</strong> — шлюз СБП с авточеком НПД), а для своих учеников, добавленных преподавателем вручную в разделе «Ученики», действует льготная схема <strong>1%</strong> сервис + <strong>1%</strong> СБП (<strong>98%</strong> на руки). Выплата средств Преподавателю доступна от 500 ₽ с формированием чека НПД (422-ФЗ).</li>
  </ul>
</section>

<section class="doc-section" id="escrow">
  <div class="doc-sec-head"><span class="how-num">04</span><h2>Эскроу-резервирование, отзывы и модерация</h2></div>
  <ul>
    <li>При подтверждении заявки Преподавателем сумма урока замораживается на защищённом эскроу-балансе Ученика и не переводится Преподавателю до момента проведения урока или истечения срока урегулирования спора.</li>
    <li>После подтверждения или завершения занятия Ученик может оставить честный отзыв (оценка 1–5 звёзд и комментарий), который участвует в расчёте публичного рейтинга Преподавателя. Запрещены оскорбления, спам и накрутка оценок.</li>
    <li>Споры и возвраты регулируются <a href="/refunds">Правилами возврата средств и эскроу</a>, являющимися неотъемлемой частью настоящей Оферты.</li>
  </ul>
</section>

<section class="doc-section" id="liability">
  <div class="doc-sec-head"><span class="how-num">05</span><h2>Интеллектуальная собственность и разрешение споров</h2></div>
  <p>Методические материалы, дизайн-система и программный код Платформы охраняются законодательством РФ об интеллектуальной собственности. Досудебный претензионный порядок обязателен: претензии направляются на <a href="mailto:willagegg@gmail.com">willagegg@gmail.com</a> и рассматриваются в течение 10 рабочих дней.</p>
  <p>Связанные документы: <a href="/refunds">Правила возврата и эскроу</a> · <a href="/privacy">Политика конфиденциальности (152-ФЗ)</a>.</p>
</section>
"""
    return _render_legal_page(
        active="terms",
        title="Публичная оферта и Пользовательское соглашение",
        badge="ГК РФ ст. 437 · Публичная оферта",
        updated_at="23 ноября 2026 г.",
        eyebrow="Договор оферты · ГК РФ ст. 435–438",
        chips=(
            ("accent", "Своя ставка ±50 ₽"),
            ("confirm", "СБП 0% · Карта РФ +3%"),
            ("pro", "Авточек НПД · 422-ФЗ"),
        ),
        lead="Условия использования тренажёра ЕГЭ и подбора преподавателей, правила расчётов через СБП/карты РФ, удержания на эскроу и порядок разрешения споров.",
        kpis=(
            ("0 ₽", "Тренажёр ЕГЭ-2027", "Тесты, теория и разборы открыты бесплатно"),
            ("0% / +3%", "Пополнение баланса", "СБП без комиссии · карта РФ +3%"),
            ("94% / 98%", "Выплата преподавателю", "5% сервис + 1% СБП · свои: 1% + 1%"),
        ),
        toc=(
            ("subject", "01. Термины и роль Платформы"),
            ("registration", "02. Регистрация и доступ"),
            ("pricing", "03. Стоимость и комиссия 5% + 1%"),
            ("escrow", "04. Эскроу и отзывы"),
            ("liability", "05. Споры и реквизиты"),
        ),
        cta_secondary=("Возврат и эскроу", "/refunds"),
        body_html=body,
    )


def render_refunds_html() -> str:
    body = """
<div class="callout is-guar">
  <strong>Гарантия первого урока и эскроу-защита 100%:</strong> Оплата занятия резервируется на защищённом эскроу-счёте «Вектор». Если первый урок с преподавателем с бейджем гарантии не подошёл или занятие не состоялось, вы можете открыть спор в карточке урока и получить полный возврат стоимости на баланс.
</div>

<section class="doc-section" id="escrow-flow">
  <div class="doc-sec-head"><span class="how-num">01</span><h2>Как работает защита оплаты (Эскроу)</h2></div>
  <ol>
    <li><strong>Отклик без списания:</strong> при отправке ставки преподавателю деньги остаются на вашем балансе доступными до его ответа.</li>
    <li><strong>Резервирование (Escrow Hold):</strong> после подтверждения времени преподавателем сумма 1 урока блокируется на защищённом счёте эскроу (статус <code>frozen</code>).</li>
    <li><strong>Выплата или возврат:</strong> после успешного проведения урока средства разблокируются в пользу преподавателя (94% выплата: 5% комиссия платформы + 1% шлюз СБП; для своих учеников — 98%: 1% платформа + 1% СБП). При отмене до урока или удовлетворении спора — возвращаются Ученику в размере 100%.</li>
  </ol>
</section>

<section class="doc-section" id="grounds">
  <div class="doc-sec-head"><span class="how-num">02</span><h2>Основания для полного возврата средств (ст. 32 ЗоЗПП)</h2></div>
  <ul>
    <li><strong>Отмена заявки до урока:</strong> нажатие кнопки «Отменить» / «Отменить занятие» до начала согласованного слота мгновенно возвращает 100% зарезервированной суммы на баланс аккаунта.</li>
    <li><strong>Гарантия первого урока (<code>first_lesson_guarantee</code>):</strong> для всех преподавателей с подключённой гарантией первого урока — если пробное/первое занятие не подошло по методике или уровню подготовки, Ученик вправе запросить 100% возврат.</li>
    <li><strong>Преподаватель не вышел на связь (<code>no_show</code>) или технический сбой (<code>tech_issue</code>):</strong> при неявке преподавателя на созвон (Яндекс Телемост / мессенджер) более чем на 15 минут или критическом сбое связи урок считается несостоявшимся, оплата возвращается полностью.</li>
    <li><strong>Несоответствие согласованной программе (<code>quality</code>):</strong> при существенном нарушении договорённостей (предмет, длительность 60 минут, подготовка к заявленному уровню).</li>
    <li><strong>Возврат неиспользованного остатка баланса:</strong> Ученик вправе отказаться от дальнейших услуг и запросить банковский возврат неиспользованного остатка кошелька прямо в окне <strong>«Баланс и пополнение»</strong> («Вернуть остаток на карту / СБП») через ЮKassa (<code>POST /v3/refunds</code> с чеком по 54-ФЗ) либо по обращению на <a href="mailto:willagegg@gmail.com">willagegg@gmail.com</a>.</li>
  </ul>
</section>

<section class="doc-section" id="how-to-dispute">
  <div class="doc-sec-head"><span class="how-num">03</span><h2>Порядок открытия спора и сроки зачисления</h2></div>
  <ul>
    <li>В разделе «Главная» или «Учёба» нажмите кнопку <strong>«Спор / возврат»</strong> (или <strong>«Открыть спор»</strong>) в карточке подтверждённого занятия.</li>
    <li>Выберите причину обращения и опишите ситуацию (от 4 символов). Заявка поступает в реестр споров модератора.</li>
    <li><strong>Срок рассмотрения:</strong> до 24 часов в рабочие дни. При решении в пользу Ученика сумма урока возвращается на баланс аккаунта <strong>мгновенно</strong>.</li>
    <li><strong>Вывод на карту РФ или по СБП (115-ФЗ):</strong> возврат с баланса на исходную карту или счёт СБП, с которого производилось пополнение, занимает от 1 до 3 рабочих дней по СБП и до 3–10 банковских дней на карту в зависимости от банка-эмитента.</li>
  </ul>
</section>

<section class="doc-section" id="exceptions">
  <div class="doc-sec-head"><span class="how-num">04</span><h2>Когда в возврате может быть отказано</h2></div>
  <ul>
    <li>Спор подан по уже проведённому повторному занятию (не первому) без признаков неявки, срыва урока или технического сбоя, при наличии подтверждённых переписки/звонка.</li>
    <li>Неявка Ученика на согласованный урок без предупреждения преподавателя минимум за 4 часа до начала слота.</li>
  </ul>
  <p>Смотрите также: <a href="/fees">Условия оплаты и калькулятор</a> · <a href="/terms">Публичная оферта</a> · <a href="/privacy">Политика конфиденциальности (152-ФЗ)</a>.</p>
</section>
"""
    return _render_legal_page(
        active="refunds",
        title="Правила возврата средств, эскроу и гарантии",
        badge="ЗоЗПП · Эскроу и гарантия 1-го урока",
        updated_at="23 ноября 2026 г.",
        eyebrow="Защита ученика · Поурочный эскроу",
        chips=(
            ("confirm", "Гарантия 1-го урока 100%"),
            ("accent", "Только 1 урок в резерве (frozen)"),
            ("pro", "Разбор споров до 24 ч"),
        ),
        lead="Как резервируется оплата на эскроу, в каких случаях возвращается 100% стоимости занятия на баланс и в какие сроки деньги возвращаются на СБП или карту РФ.",
        kpis=(
            ("100%", "Возврат на баланс", "Отмена до урока или Гарантия 1-го урока"),
            ("до 24 ч", "Разбор спора", "В рабочие дни по заявке из карточки урока"),
            ("1–3 дня", "Вывод на СБП", "На карту РФ — 3–10 банковских дней, 115-ФЗ"),
        ),
        toc=(
            ("escrow-flow", "01. Как работает эскроу"),
            ("grounds", "02. Основания возврата 100%"),
            ("how-to-dispute", "03. Открытие спора и сроки"),
            ("exceptions", "04. Исключения"),
        ),
        cta_secondary=("Публичная оферта", "/terms"),
        body_html=body,
    )
