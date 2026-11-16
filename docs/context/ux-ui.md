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
- `ux-ui/styles/base.css` — каркас `.shell`/`.side`/`.topbar`/`.tabbar` (`@media (max-width: 899px)`), кнопки `.btn`, `.switch`, `.hh-seg`, `.chip-rail`, `.modal-card`, `.toast.is-side`, мессенджеры `.btn-msg` (`.is-wa`, `.is-tg`, `.is-max`, `radius: 999px`), кошелёк `.wallet-bar`, `#tutor-balance-dock` (`.is-inline-preview`), `.rt-status-pill`, `.cal-sync-card`, Admin UI Kit (`.adm-kpi-grid`, `.adm-kpi-card`, `.adm-mod-badge`, `.arch-boundary-card`, `.role-switch-banner`).
- `ux-ui/styles/brandbook.css` — сетка `/brandbook`, DataViz (`.tc-bar-chart`, `.bb-line-chart`, `.bb-donut-chart`, `.bb-table-shell`), `@container (max-width: 620px)` + `@media (max-width: 720px)` карточная трансформация таблиц `.bb-data-table.is-adaptive td[data-label]`, обёртка `.bb-data-table.is-adaptive td .field`.

## 3. JS-модули UI Kit (`ux-ui/components/` и `ux-ui/brandbook/`)
1. **`ux-ui/components/icons.js` → `window.EGE.ui`**: `ICONS` (53 SVG `24×24`), `icon(name)`, `sakhaPatternSVG`, `sakhaOhyorHTML`, `brandLogoSVG`, `BRAND_MARK_HTML`, `BRAND_WORDMARK_HTML`, `brandLockupHTML`, `GOOGLE_SVG`, `getIconCatalog(dark)`, `triggerIconTileAnim(tile)`.
2. **`ux-ui/components/hh-components.js` → `window.EGE.hh`**: `feeSplitHTML(price, TDATA)` (stateless `95%/5%` fallback без `TDATA`), `bidBtnLabelHTML`, `sakhaBidInnerHTML`, `priceHeadlineHTML`, `priceDiffTagsHTML`, `sliderTicksHTML`, `BB_DAYS`, `bbDayObj`, `hhSelectHTML`, `hhMultiSelectHTML`, `tutorAvatarHTML`.
3. **`ux-ui/components/charts.js` → `window.EGE.charts`**:
   - Графики: `CHART_STYLE_META` (6 видов: `sticks`, `candles`, `range`, `stacked`, `dual`, `segmented`), `stickChartHTML`, `lineChartHTML`, `DONUT_DATASETS`, `donutChartHTML` (`stroke-linecap="butt"`, `.bb-donut-outer-ring`).
   - Таблица: `TABLE_PRESETS` (`requests`, `students`, `payouts`, `exams`, `admin`), `dataTableHTML(opts)` — поддерживает `3/5/7` колонок, кастомные `columns`/`rows`, `filters`, `filterAction`, `colsAction`, `presetAction`, `searchAction`, `confirmAction`, `rowAttrs(r, idx, helpers)`, `toolbarExtraHTML`, `cardWrap: false`.
4. **`ux-ui/components/kit.js` → `window.EGE.kit`**:
   - Каталог `CATALOG_CATEGORIES` и `CATALOG_ITEMS` (**`27` элементов**, `#26 admin-kit` → `#bb-admin-kit`, `#27 arch-split` → `#bb-arch-split`).
   - Shell & лендинг: `heroBannerHTML`, `searchStripHTML`, `sentNoticeHTML`, `sakhaButtonsHTML`, `marqueePillsHTML`, `rateBenchCardHTML`, `trustStripHTML`, `reviewCardHTML`, `faqListHTML`, `blueBannerHTML`, `topBalanceWidgetHTML`, `tutorBalanceDockHTML`, `walletSummaryBarHTML`, `sideToastInnerHTML`, `emptyStateHTML`, `skeletonCardHTML`, `realtimeStatusPillHTML`, `calendarSyncCardHTML`.
   - Admin & Telemetry: `adminKpiGridHTML`, `adminModerationBadgeHTML`, `serviceBoundaryCardHTML`, `roleSwitchBannerHTML`, `pipelineStageCardHTML`, `eventLogFeedHTML`.
   - Контакты WA/TG/MAX: `normalizePhoneDigits`, `formatPhoneMask`, `formatTelegramContact`, `entitySlug`, `whatsappUrl`, `telegramUrl`, `maxUrl`, `resolveMessengerUrls`, `messengerLinksHTML`.
5. **`ux-ui/brandbook/brandbook.js` → `window.EGE.views.brandbook`**: рендер `/brandbook` и `/fees`, экспортирует `viewBrandbook`, `viewFees`, `applyBrandbookViewport`, `handleAction`, `handleInput`.
