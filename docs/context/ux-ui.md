# Контекст: UX/UI и независимый UI Kit (`ux-ui/` и `vektor-ui-kit`)

> [!IMPORTANT]
> **Однонаправленный DAG**: файлы в `ux-ui/` ([manifest](../../ux-ui/package.json)) НЕ должны содержать `fetch(`, `EventSource`, `WebSocket`, `EGE.api`, `EGE.tutors` или импортов бизнес-вьюх. Живой standalone-стенд: `http://127.0.0.1:8772` (`vektor-ui-kit`).

## 1. Токены и палитры ([ux-ui/tokens.json](../../ux-ui/tokens.json))
- **Light (`[data-theme="light"]`)**: `--bg: #F4F5F7`, `--surface: #FFFFFF`, `--surface-2: #F2F3F6`, `--ink: #141517`, `--ink-2: #3D424D`, `--muted: #7C828E`, `--accent: #0070FF`, `--confirm: #16A34A`, `--notif: #F97316`, `--bad: #FF2B4D`, `--pro: #7C3AED`.
- **OLED Dark (default `:root`)**: `--bg: #000000`, `--surface: #16181D`, `--surface-2: #22252E`, `--ink: #FFFFFF`, `--accent: #1D7BFF`, `--confirm: #22C55E`, `--notif: #FB923C`, `--pro: #A78BFA`.
- **Sakha & Gold**: `--gold: #C59B5F`, градиенты `goldGrad`, `goldGlass`, `goldTextGrad`; Саха `auroraCyan: #0EA5E9`, `auroraGreen: #10B981`, `glacierLight: #EFF9FF`.
- **Предметы**: `--c-bio: #7C3AED` (`#A855F7` dark), `--c-chem: #0284C7` (`#38BDF8` dark), `--c-rus: #EA580C` (`#FB923C` dark).
- **Строгие запреты**: нет `#13794b`, нет `"Вывести 95%"`, нет `"5%:"` на `/brandbook`.

## 2. CSS-слой (`ux-ui/styles/`)
- `ux-ui/styles/base.css` — каркас `.shell`/`.side`/`.topbar`/`.tabbar` (`@media (max-width: 899px)`), кнопки `.btn`, `.switch`, `.hh-seg`, `.chip-rail`, `.modal-card`, `.toast.is-side`, `.btn-msg` (`.is-wa`/`.is-tg`/`.is-max`), `.wallet-bar`, `.side-tutor-bal`, `.rt-status-pill`, `.cal-sync-card`, Admin UI Kit (`.adm-kpi-grid`, `.adm-mod-badge`, `.arch-boundary-card`, `.role-switch-banner`).
- `ux-ui/styles/brandbook.css` — сетка `/brandbook`, DataViz (`.tc-bar-chart` со `--bar-count`, `.tc-combo-svg-wrap`, `.bb-line-chart`, `.bb-line-legend`, `.bb-donut-chart`, `.bb-table-shell`).
- `ux-ui/styles/tables.css` (подключается после `brandbook.css`) — авто-адаптивный слой `.bb-table-scroll` (1..15+ колонок), липкая 1-я колонка (`th:first-child, td:first-child`) для `.is-wide-cols` (`>= 7` колонок), фикс степпера `.hh-price-stepper.compact` (`minmax(92px, max-content)`), `@container (max-width: 640px)` карточная трансформация.

## 3. JS-модули UI Kit (`ux-ui/components/` и `ux-ui/brandbook/`)
1. **`ux-ui/components/icons.js` → `window.EGE.ui`**: `ICONS` (53 SVG `24×24`), `icon(name)`, `sakhaPatternSVG`, `sakhaOhyorHTML`, `brandLogoSVG`, `BRAND_MARK_HTML`, `BRAND_WORDMARK_HTML`, `brandLockupHTML`, `GOOGLE_SVG`, `getIconCatalog(dark)`, `triggerIconTileAnim(tile)`.
2. **`ux-ui/components/hh-components.js` → `window.EGE.hh`**: `feeSplitHTML(price, TDATA)` (stateless `95%/5%` fallback), `bidBtnLabelHTML`, `sakhaBidInnerHTML`, `priceHeadlineHTML`, `priceDiffTagsHTML`, `sliderTicksHTML`, `BB_DAYS`, `bbDayObj`, `hhSelectHTML`, `hhMultiSelectHTML`, `tutorAvatarHTML`.
3. **`ux-ui/components/charts.js` → `window.EGE.charts`** (только графика; завершается `Object.assign(root.EGE.charts || {}, ...)`):
   - `CHART_STYLE_META` (6 видов), `CHART_PALETTE_20` (20 контрастных цветов без `#13794b`), `monotoneCubicPath(pts)` (сплайн Фрича–Карлсона без выбросов кривой мимо точек).
   - `stickChartHTML`: при `styleId === "combo"` или `bars.length > 10` — единый SVG (`viewBox="0 0 640 206"`) с общей `(cx, cy)` математикой; прореживание подписей X.
   - `lineChartHTML`, `buildMultiSeriesDemo(linesCount, pointsCount, datasetId)`, `multiLineChartHTML(opts)` (до `20` линий × `30+` точек с прореживанием X и `.bb-line-legend`), `DONUT_DATASETS`, `donutChartHTML`.
4. **`ux-ui/components/tables.js` → дополняет `window.EGE.charts`** (подключается сразу после `charts.js`):
   - `TABLE_PRESETS` (`requests`, `students`, `payouts`, `exams`, `admin`), `buildStressColumns(colsCount, presetId)`, `dataTableHTML(opts)` — поддержка **`1..15+` колонок**; `showColsSwitch: false` и `showPresetSwitch: false` по умолчанию в продукте (включаются явно `showColsSwitch: true` в `/brandbook`); панель навигации `.bb-tbl-wide-bar` при `>= 7` колонок.
5. **`ux-ui/components/kit.js` → `window.EGE.kit`**:
   - `CATALOG_CATEGORIES`, `CATALOG_ITEMS` (**`27` элементов**), `sideTutorBalanceHTML(opts)` (для `#side-balance-slot`, кнопка `«Вывести»`), `topBalanceWidgetHTML`, `tutorBalanceDockHTML`, `walletSummaryBarHTML`, Admin/Telemetry (`adminKpiGridHTML`, `adminModerationBadgeHTML`, `serviceBoundaryCardHTML`, `roleSwitchBannerHTML`, `pipelineStageCardHTML`, `eventLogFeedHTML`), WA/TG/MAX (`formatPhoneMask`, `formatTelegramContact`, `resolveMessengerUrls`, `messengerLinksHTML`).
6. **`ux-ui/brandbook/brandbook.js` → `window.EGE.views.brandbook`**: `/brandbook` и `/fees`, экспортирует `viewBrandbook`, `viewFees`, `applyBrandbookViewport`, `handleAction`, `handleInput`. Стенды DataViz включают стресс-переключатели колонок `1/3/5/7/10/12/15` (`bb-tbl-cols`, `showColsSwitch: true`), линий `1/3/8/12/20` (`bb-chart-lines`) и точек `7/18/30` (`bb-chart-pts`).
