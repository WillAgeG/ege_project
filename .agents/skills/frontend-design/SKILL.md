---
name: frontend-design
description: >-
  Use this skill whenever designing, styling, refactoring, or auditing web pages,
  landing pages, product dashboards, data tables, DataViz charts, or UI Kit
  components across Vektor EGE (`ux-ui/`, `/brandbook`, `frontend/`) to ensure
  distinctive, production-grade UI craft and responsive parity.
---

# Frontend & UI Systems Design Skill (Vektor Workspace)

Design interfaces with deliberate visual hierarchy, crisp typography, tactile states, and zero generic template clutter. Every reusable UI pattern in Vektor EGE originates in `@vektor-ege/ui-kit` (`ux-ui/` + `/brandbook`) before entering product views.

## 1. Visual Craft & Anti-Clutter Principles

- **Hierarchy First**: One clear visual anchor per screen or card. Keep body typography crisp (`14px`) and pair with disciplined display sizing (`clamp()`) and muted captions (`var(--muted)`).
- **Structured Whitespace**: Use consistent spacing multiples (`4 / 8 / 12 / 16 / 24 / 32px`). Prefer clean hairline surfaces over nested drop-shadow stacks.
- **Tabular Metrics**: Apply `font-variant-numeric: tabular-nums` on prices (`₽`), percentages, clocks, and table numbers so figures align cleanly without layout jitter.
- **Tactile Interactive States**: Always define `:hover`, `:focus-visible`, `:active`, and `:disabled` states with smooth `150–220ms` transitions; design explicit empty/loading/error states.

## 2. Token & Theme Discipline (Light + OLED Dark + Sakha Gold)

- **Light (`[data-theme="light"]`)**: `--bg: #F4F5F7`, `--surface: #FFFFFF`, `--surface-2: #F2F3F6`, `--ink: #141517`, `--muted: #7C828E`, `--accent: #0070FF`, `--confirm: #16A34A`, `--notif: #F97316`, `--bad: #FF2B4D`, `--pro: #7C3AED`.
- **OLED Dark (default `:root`)**: `--bg: #000000`, `--surface: #16181D`, `--surface-2: #22252E`, `--ink: #FFFFFF`, `--accent: #1D7BFF`, `--confirm: #22C55E`, `--notif: #FB923C`, `--pro: #A78BFA`.
- **Sakha & Subject Accents**: `--gold: #C59B5F` (`goldGrad`/`goldGlass`), aurora `#0EA5E9` / `#10B981`; Bio `#7C3AED`/`#A855F7`, Chem `#0284C7`/`#38BDF8`, Rus `#EA580C`/`#FB923C`.
- **Vektor Strict Bans**: Zero `#13794b`, `"Вывести 95%"`, or `"5%:"` anywhere in `ux-ui/` or `/brandbook`.

## 3. Adaptive Layout, Tables & DataViz

1. **Mobile (`375px`) & Desktop (`1440px`) Parity**: Zero unintended page horizontal overflow; shared navigation/balance chrome belongs in `#side-balance-slot` rather than overlapping table action buttons.
2. **Adaptive `@container` Tables (`1..15+` columns)**: Built on `EGE.charts.dataTableHTML` + `.bb-table-scroll` (`ux-ui/styles/tables.css`) with sticky 1st column at `>= 7` cols, compact `.hh-price-stepper.compact`, and `@container (max-width: 640px)` card transformation. Keep stress switches visible only in `/brandbook`.
3. **Charts**: Use Fritsch-Carlson `monotoneCubicPath(pts)` (`EGE.charts`) with shared `(cx, cy)` geometry, X-tick thinning (`7..30+` points), and up to `20` contrasting series from `CHART_PALETTE_20`.

## 4. Workflow & Verification

1. Stress-test tokens, typography, tables, and charts inside `ux-ui/` and `/brandbook` first (`Light` & `OLED Dark`, `375px` & `1440px`).
2. Strictly enforce Zero-API in `ux-ui/` (no `fetch(`, `EventSource`, `WebSocket`, `EGE.api`, `EGE.tutors`) and strict CRLF on `frontend/app.js`.
3. Full QA checklist lives at [design-checklist.md](file:///Users/aleksej/.gemini/config/skills/frontend-design/references/design-checklist.md). Run `jsc tests/check_app.js`, Node/V8 `tests/check_app.js`, and `.venv/bin/python -m pytest -q` after visual/DOM changes.
