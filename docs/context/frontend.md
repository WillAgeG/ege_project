# Контекст: Frontend SPA (`frontend/`)

## 1. Порядок загрузки `<script>` в [frontend/index.html](../../frontend/index.html)
Скрипты подключаются строго по DAG (без бандлера, IIFE на `window.EGE`):
1. CSS в `<head>`: `ux-ui/styles/base.css`, `frontend/styles/marketplace.css`, `ux-ui/styles/brandbook.css`, `ux-ui/styles/tables.css`
2. `subjects/*.js` + `data/{plan,essay,tutors}.js` + `subjects/table.js`
3. `bank-core.js` (`EGE.hash`, `EGE.qSig`, `EGE.loadBank`)
4. `core/utils.js` (`EGE.utils`: `esc`, `rich`, `clone`, `deepMerge`, `norm`, `plural`, даты)
5. `core/api.js` (`window.EGE.api`) — централизованный HTTP-клиент
6. `core/realtime.js` (`window.EGE.realtime`) — SSE / WebSocket / `BroadcastChannel` + `.ics` парсер
7. UI Kit: `ux-ui/components/{icons,hh-components,charts,tables,kit}.js` → `ux-ui/brandbook/brandbook.js`
8. `core/market-bb-actions.js` (`EGE.marketBb`, `EGE.registerMarketBbActions`) — обработчики `land-*`, `mkt-*`, `bal-*`, `book-*`, `bb-*`, `fees-*` и экспорт токенов брендбука
9. `views/{trainer,essay-guide,progress,marketplace,landing}.js` + кабинет репетитора (`views/tutor-{state,schedule,payouts,cabinet}.js`) + `views/admin.js`
10. `app.js` (подключается **последним**, строго с окончаниями строк **CRLF** `bare_lf == 0`!)

## 2. Ключевые модули и таблицы
- **`frontend/core/api.js` (`window.EGE.api`)**:
  - `configure({ baseUrl, onUnauthorized })`, `getBaseUrl()`, `request(path, opts)` (auto `credentials: "include"` cross-origin / `"same-origin"` locally).
  - Группы: `health()`, `storageHealth()`, `auth.{me,login,register,logout}`, `docs.{list,patch,put}`, `calendar.{state,sync,importIcs}`, `realtime.{recent,publish}`, `admin.{architecture,overview,users,setUserRole,tutors,moderateTutor,requests,setRequestStatus,payouts,setPayoutStatus,outbox}`.
- **`frontend/core/realtime.js` (`window.EGE.realtime`)**:
  - `connect({ channel, tutorSlug })`, `connectWS(...)`, `publish(...)`, `syncCalendar(...)`, `importIcs(...)`, `parseIcsBusySlots(icsText, tz)`.
- **`frontend/core/market-bb-actions.js` (`EGE.marketBb`)**:
  - `BB_EXPORT_SCHEMA`, `bbState()`, `patchMaskTrainerDOM()`, `applyBrandbookViewport()`, `buildBrandbookTokensExport()`, обработчики `ACTIONS` маркетплейса и брендбука.
- **`frontend/views/trainer.js` (`EGE.views.trainer`)**: `viewHome()`, `viewTests()`, `viewSubject()`, `viewTopic()`, `viewQuiz()`, ИИ-разбор/чат (`explainCurrent()`, `generateQuestions()`, `sendChat()`).
- **`frontend/views/essay-guide.js` (`EGE.views.essayGuide`)**: `viewGuide()`, `viewTutor()`, `viewEssay()` («Сочинение 27» + проверка ИИ).
- **`frontend/views/progress.js` (`EGE.views.progress`)**: `viewPlan()`, `viewStats()`, `viewProfile()`, canvas-графики (`drawCharts()`, `drawActivity()`, `drawMocks()`), экспорт/импорт.
- **`frontend/views/marketplace.js` (`EGE.views.marketplace`)**:
  - `viewMarket()`, `viewStudy()`, `bookingsStripHTML(st)`. `renderDataTable(opts)` по умолчанию ставит `showColsSwitch: false, showPresetSwitch: false`.
  - Таблицы на `EGE.charts.dataTableHTML`: `#student-bookings-table` (ставки `±100 ₽`), `#student-leads-table`, `#study-schedule-table`, `#study-chats-table`.
- **`frontend/views/landing.js`**: прямые ссылки `<a href="/student">` и `<a href="/tutor">` на раздельные сайты без `data-a="go"`.
- **Кабинет преподавателя (`frontend/views/tutor-{state,schedule,payouts,cabinet}.js`, `EGE.views.tutorCabinet`)**:
  - `tutor-state.js`: общее состояние `EGE._tutorCab`, форматтеры, таймер, хелперы заявок и `syncTutorCabinetDoc`.
  - `tutor-schedule.js`: вкладки `calendar` (чистая сетка 10:00–20:00, `.ics` только в модалке `tc-cal-import-modal`), `students` (`#tc-students-table`, ровно 5 колонок), `leads` (`#tc-leads-table`, 6 колонок, контр-цена `±100 ₽` через `tc-lead-step`/`tc-lead-rate`/`tc-lead-offer`).
  - `tutor-payouts.js`: кошелёк/выплаты (`viewPayouts()`), баланс в сайдбаре (`sideBalanceWidgetHTML()` → `EGE.kit.sideTutorBalanceHTML` в `#side-balance-slot`, `#tutor-balance-dock` отключён).
  - `tutor-cabinet.js`: фасад `EGE.views.tutorCabinet`, вкладка `requests` (5 колонок, степпер `±100 ₽`), вкладка `profile` (единственное место «Поднять анкету»: `tc-bump`, `tc-autobump-toggle`, `tc-autobump-hour`), диспетчер `handleAction`/`handleInput`/`handleSubmit`.
- **`frontend/views/admin.js` (`EGE.views.admin`)**:
  - `renderDataTable(opts)` принудительно ставит `showColsSwitch: false, showPresetSwitch: false`.
  - 5 вкладок (`overview`, `requests`, `tutors`, `payouts`, `system`), 7-дневный `dailySeries` для `stickChartHTML("combo", ...)`, 5-колоночный Реестр аккаунтов (`#adm-overview-users`) с русскими кнопками ролей (`Ученик` / `Преподаватель` / `Админ`).
- **`frontend/app.js`**:
  - Компактное ядро (~2 790 строк): хранилище/синхронизация, `HOST_SITE` (`resolveHostSite()`), маршрутизатор `VIEWS`, `renderChrome()`, `authCard()`, модалки, `FORMS`, глобальные слушатели и сборка `appCtx` для модулей.

## 3. Проверка Frontend
Для поиска обработчиков используйте `python3 tools/ctx.py actions <подстрока>` или `python3 tools/ctx.py outline <файл>`. Перед коммитом обязательны `jsc tests/check_app.js` (`APP_SMOKE_TESTS_OK`) и `CRLF_OK`.
