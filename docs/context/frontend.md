# Контекст: Frontend SPA (`frontend/`)

## 1. Порядок загрузки `<script>` в [frontend/index.html](../../frontend/index.html)
Скрипты подключаются строго по DAG (без бандлера, IIFE на `window.EGE`):
1. `subjects/*.js` + `data/{plan,essay,tutors}.js` + `subjects/table.js`
2. `bank-core.js` (`EGE.hash`, `EGE.qSig`, `EGE.loadBank`)
3. `core/utils.js` (`EGE.utils`: `esc`, `rich`, `clone`, `deepMerge`, `norm`, `plural`, даты)
4. `core/api.js` (`window.EGE.api`) — централизованный HTTP-клиент
5. `core/realtime.js` (`window.EGE.realtime`) — SSE / WebSocket / `BroadcastChannel` + `.ics` парсер
6. UI Kit: `ux-ui/components/{icons,hh-components,charts,kit}.js` → `ux-ui/brandbook/brandbook.js`
7. `views/{marketplace,landing,tutor-cabinet,admin}.js`
8. `app.js` (подключается **последним**, строго с окончаниями строк **CRLF** `bare_lf == 0`!)

## 2. Ключевые модули и таблицы
- **`frontend/core/api.js` (`window.EGE.api`)**:
  - `configure({ baseUrl, onUnauthorized })`, `getBaseUrl()`, `request(path, opts)` (auto `credentials: "include"` cross-origin / `"same-origin"` locally).
  - Группы: `health()`, `storageHealth()`, `auth.{me,login,register,logout}`, `docs.{list,patch,put}`, `calendar.{state,sync,importIcs}`, `realtime.{recent,publish}`, `admin.{architecture,overview,users,setUserRole,tutors,moderateTutor,requests,setRequestStatus,payouts,setPayoutStatus,outbox}`.
- **`frontend/core/realtime.js` (`window.EGE.realtime`)**:
  - `connect({ channel, tutorSlug })` (`EventSource`), `connectWS(...)`, `publish(...)`, `syncCalendar(...)`, `importIcs(...)`, локальный парсер `parseIcsBusySlots(icsText, tz)` (`07:00Z → 16:00 UTC+9 / 10:00 UTC+3`).
- **`frontend/views/marketplace.js` (`EGE.views.marketplace`)**:
  - `viewMarket()`, `viewStudy()`, `bookingsStripHTML(st)`.
  - Таблицы на `EGE.charts.dataTableHTML`: `#student-bookings-table` (ставки `±100 ₽`, `mkt-bk-{filter,cols,q}`), `#student-leads-table` (открытые запросы «Ищу преподавателя»), `#study-schedule-table` (`study-sched-{cols,q}`), `#study-chats-table` внутри `.hh-chat-list` (`study-chats-{cols,q}`).
  - Публикует `market.bid.created` через `publishStudentBid()` при отправке ставки.
- **`frontend/views/tutor-cabinet.js` (`EGE.views.tutorCabinet`)**:
  - Таблицы на `EGE.charts.dataTableHTML`: `#tc-requests-table` (`id="tc-first-pending"` на первой pending-строке via `rowAttrs`, торг `±100 ₽` `tc-req-step`, `tc-req-accept/counter/decline`), `#tc-students-table` (`data-tc-student`, `+7`/`@login` маски, каналы WA/TG/MAX, `tc-student-remind`), `#tc-leads-table`, `#tc-payout-history` (на `/fees`).
  - Вкладка `calendar`: `calendarSyncCardHTML` + `.is-gcal-busy` (`Занято в GCal`, вкл. воскресенье `dow === 0`) + модалка/импорт `.ics`.
  - Баланс: `desktopDockHTML()` (справа снизу), `mobileTopWidgetHTML()` (топбар), `payoutModalHTML()` (СБП / Мир от `500 ₽`, чек НПД).
- **`frontend/views/admin.js` (`EGE.views.admin`)**:
  - 5 вкладок (`overview`, `requests`, `tutors`, `payouts`, `system`) 100% на `EGE.kit.*` и `EGE.charts.dataTableHTML` (`#adm-overview-users`, `#adm-requests-table`, `#adm-tutors-table`, `#adm-payouts-table`) с фолбэком на локальные данные, если `window.EGE_HOST.backend` выключен.
- **`frontend/app.js`**:
  - Роутинг `VIEWS`, роли `"student" | "tutor" | "admin"`, `.side-admin-pill` под 2-кнопочным `.side-role-seg`, делегирование `ACTIONS` (`adm-*`, `tc-*`, `mkt-bk-*`, `study-*`, `bb-*`), `FORMS` (`auth`, `profile`, `tc-payout`, `student-lead`, `bal-custom`), `EGE.payments` (`provider: "demo"`).

## 3. Проверка Frontend
Для поиска обработчиков используйте `python3 tools/ctx.py actions <подстрока>` или `python3 tools/ctx.py outline frontend/app.js` вместо чтения всего 5,900-строчного файла. Перед коммитом обязательны `jsc tests/check_app.js` (`APP_SMOKE_TESTS_OK`) и `CRLF_OK`.
