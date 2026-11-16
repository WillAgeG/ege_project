# GEMINI.md — Архитектура, стек и путеводитель по проекту «Вектор ЕГЭ»

Единый справочник по проекту для разработчика и AI-агентов: продуктовые режимы, полный технологический стек, базы данных, обособленный UI Kit (`ux-ui/`), ETL/аналитика, API-контракты, инварианты и команды запуска.

---

## 1. Назначение и продуктовые режимы

**«Вектор ЕГЭ»** — веб-платформа подготовки к ЕГЭ-2027 (биология, химия, русский язык) с адаптивным банком заданий, тренажёром сочинения, планом поступления и встроенным маркетплейсом репетиторов с механикой предложения цены (`±100 ₽`) и часовыми окнами `10:00–20:00`.

### Публичные и внутренние экраны (`VIEWS` в [frontend/app.js](frontend/app.js))

- **Лендинг** (`/landing`, `landing`) — герой-секция с баннером Ленских столбов (`/assets/lena-pillars.jpg`), интерактивный калькулятор ставки `±100 ₽`, витрина репетиторов, бегущая строка тарифов, FAQ, блок с якутскими узорами «Оһуор».
- **Брендбук / UI Kit** (`/brandbook`, `brandbook`) — живая документация дизайн-системы (`27` карточек каталога `EGE.kit.CATALOG_ITEMS`, включая `#bb-admin-kit` и `#bb-arch-split`): 40 анимируемых SVG-иконок, 6 видов графиков + линейные/круговые графики, супер-адаптивные schema-driven таблицы (`EGE.charts.dataTableHTML` с `5` пресетами `requests | students | payouts | exams | admin` и `@container`-карточками), интерактивные селекты и паттерны кабинета, живой тренажёр масок контактов (`#bb-mask-trainer`), экраны эквайринга и выплат (`#bb-payments`), единые Shell-виджеты сайта (`#bb-ui-kit-shells`), Data & Observability UI Kit для ETL/ELT-стадий и потока логов (`#bb-telemetry-etl`), Admin UI Kit (`#bb-admin-kit`), границы слоёв UI-Kit/API (`#bb-arch-split`), таймеры ЕГЭ-2027 с ИИ-разбором задания 27 (`#bb-ege-timers`) и доступность (`#bb-a11y`, карта `:focus-visible`, горячие клавиши и `reduced-motion`).
- **Оплата и комиссия** (`/fees`, `fees`) — правила пополнения баланса ученика, тарифов, сервисного сбора `5%` (не показывается на этапе подбора, только на `/fees` и при оплате), а в режиме преподавателя — раздел **«Выплаты»** с KPI кошелька и адаптивной историей выводов (`#tc-payout-history`).
- **Админ-панель** (`/admin`, `admin`) — роль `admin` (`5` пунктов бокового меню на desktop + ссылка `Брендбук`, `5` вкладок в мобильном таббаре, пилюля `.side-admin-pill` в сайдбаре и выбор в `/profile`): вкладки `overview` (KPI GMV / 95% / 5% / Заявки / Outbox + графики + таблица пользователей `adm-overview-users` со сменой роли), `requests` (`adm-requests-table` с модерацией статусов + открытые запросы учеников), `tutors` (`adm-tutors-table` с `adminModerationBadgeHTML`, верификацией и поднятием анкет), `payouts` (`adm-payouts-table` СБП / Карта Мир `>= 500 ₽` + НПД) и `system` (`7` карточек границ сервисов `serviceBoundaryCardHTML`, `pipelineStageCardHTML` и лента `outbox.kafka_outbox` в `eventLogFeedHTML`).
- **Правовая информация** (`/privacy`) — статическая HTML-страница политики конфиденциальности, отдаваемая напрямую FastAPI.
- **Учебный и маркетплейс-контуры**:
  - `Ученик` (`5` пунктов бокового меню + блок 3 предметов слева): `tests` (Тесты), `tutor` (Справочник), `market` (Репетиторы — табличные заявки `#student-bookings-table` и `#student-leads-table`), `study` (Учёба — табличное расписание `#study-schedule-table` и чаты `#study-chats-table`), `stats` (Показатели), плюс `subject`, `topic`, `quiz`, `essay`, `plan`, `profile`. Виджет баланса закреплён внизу левого сайдбара на desktop и справа в топбаре (`28 px` кнопка `+`) на mobile; первое пополнение от `5 000 ₽`, последующие от `100 ₽`.
  - `Преподаватель` (`7` пунктов бокового меню на desktop, `5` вкладок в мобильном таббаре, без блока предметов и студенческого баланса): `cabinet` (вкладки `requests` + кликабельный бейдж с таблицей `#tc-requests-table`, `calendar`, `students` с `#tc-students-table`, `leads` с `#tc-leads-table`, `profile`), `fees` (Выплаты) и `tutor` (Справочник). Виджет баланса преподавателя закреплён **справа снизу** на desktop (`#tutor-balance-dock`) и **справа сверху** в топбаре на mobile (`#top-balance-slot`), с модалкой вывода средств (СБП по телефону + выбор банка или Карта РФ/Мир, опциональный чек НПД, от `500 ₽`, через `EGE.payments.createPayoutIntent`). Поддерживает поднятие анкеты (кулдаун `4` часа, автопродвижение каждые `24` часа), мультиканальные контакты (`WhatsApp`, `Telegram` с телефоном или `@login`, `MAX`), город (`Якутск` / `Москва`, по умолчанию `UTC+9`) и загрузку/отключение фото («Без фото»).

---

## 2. Полный стек технологий

| Слой | Технологии и версии | Назначение и ключевые файлы |
|---|---|---|
| **Backend API** | Python `3.13`, `fastapi>=0.115,<1`, `uvicorn[standard]>=0.32,<1`, `httpx>=0.27,<1`, `psycopg[binary]>=3.2,<4`, `psycopg-pool>=3.2,<4` | Модульный Headless API (`backend/api/{auth_docs,realtime_calendar,admin}.py`) + SSR-оболочка SPA (`backend/shell.py`, `backend/main.py`): OAuth 2.0 + PKCE (`S256`), `scrypt`-аутентификация, Realtime SSE/WS хаб, `.ics`/Google Calendar синк (`UTC+9` ↔ `UTC+3`), Admin REST (`/api/admin/*`), SSE/JSON ИИ-прокси, allowlist статики ([backend/main.py](backend/main.py), [backend/api/](backend/api/), [backend/shell.py](backend/shell.py), [backend/config.py](backend/config.py), [backend/realtime.py](backend/realtime.py), [backend/calendar_sync.py](backend/calendar_sync.py), [backend/ai.py](backend/ai.py)) |
| **Frontend SPA** | Vanilla JS (ES2020+ IIFE, zero-bundler), HTML5, CSS Custom Properties | Одностраничное приложение без сборки и фреймворков; единый неймспейс `window.EGE`; централизованный HTTP-клиент `EGE.api` ([frontend/core/api.js](frontend/core/api.js)), офлайн-режим `localStorage`, облачная очередь синка, Realtime SSE/WS/BroadcastChannel клиент и `/admin` вьюха ([frontend/index.html](frontend/index.html), [frontend/core/realtime.js](frontend/core/realtime.js), [frontend/views/admin.js](frontend/views/admin.js), [frontend/app.js](frontend/app.js)) |
| **UI Kit (`ux-ui/`)** | JSON Design Tokens + чистый CSS + модульные SVG/DOM/DataViz компоненты | Изолированная дизайн-система (`EGE.ui`, `EGE.hh`, `EGE.charts`, `EGE.kit`, `EGE.views.brandbook`), не зависящая от данных репетиторов и бизнес-вьюх |
| **OLTP База данных** | SQLite 3 (`WAL`) + PostgreSQL 17 (`oltp.*`, `outbox.kafka_outbox` в режиме `DualWriteDatabase`) | Хранение пользователей, OAuth-идентичностей, сессий, PKCE-состояний, JSONB-документов прогресса и транзакционного аутбокса ([databases/sqlite/store.py](databases/sqlite/store.py), [databases/postgres/store.py](databases/postgres/store.py), [databases/migrations/001_initial_sqlite.sql](databases/migrations/001_initial_sqlite.sql)) |
| **OLAP & ETL (`etl/`)** | Python, `polars>=1.9,<2` (`LazyFrame`), `pyarrow>=18,<20`, `duckdb>=1.1,<2` (+ zero-dep fallback) | Medallion-пайплайн (`Bronze → Silver → Gold Parquet`) нормализации анкет из Ykt/TG/WA/MAX и расчёт unit-экономики/GMV ([etl/](etl/)) |
| **ИИ-провайдеры** | Gemini API (`gemini-3.8-flash` / `gemini-3.1-pro-preview`), OpenAI (`gpt-6.1-terra` / `gpt-6.1-sol`), Anthropic (`claude-sonnet-5-5` / `claude-opus-5-5`), OpenRouter | Проверка сочинений, ИИ-подсказки и разбор тем через `/api/ai` (SSE streaming и JSON mode) ([backend/ai.py](backend/ai.py)) |
| **Тестирование и CI** | `pytest`, JavaScriptCore (`jsc` на macOS) / Node.js `22`, GitHub Actions, Docker + Railway | Юнит- и интеграционные тесты API/SQLite/ETL/SPA ([tests/](tests/), [.github/workflows/ci.yml](.github/workflows/ci.yml), [Dockerfile](Dockerfile)) |

---

## 3. Структура репозитория

```text
Preparation/
├── GEMINI.md                     # Этот документ (полный архитектурный справочник)
├── ARCHITECTURE.md               # Краткая схема слоёв, HTTP-потока и инвариантов
├── ROADMAP_UNCONNECTED.md        # Бэклог из 12 неподключённых к живому сайту систем, JSON-конверт и 5 Kafka-топиков
├── REPOSITORIES.md               # Карта всех 7 независимых репозиториев, порты, скрипты запуска и поток данных
├── README.md                     # Быстрый старт и переменные окружения
├── Dockerfile                    # python:3.13-slim; копирует ux-ui, frontend, backend, databases; 1 worker
├── requirements.txt              # Web-зависимости контейнера (fastapi, uvicorn, httpx, psycopg)
├── pyproject.toml                # Конфигурация pytest (pythonpath = ["."], testpaths = ["tests"])
├── .env.example                  # Шаблон ENV-переменных (БД, инвайт, лимиты, AI, Google OAuth)
├── .github/workflows/ci.yml      # CI: pytest -q + node tests/check_app.js
│
├── ux-ui/                        # Отдельный независимый UI Kit и дизайн-система (@vektor-ege/ui-kit, :8772)
│   ├── README.md
│   ├── package.json              # Манифест @vektor-ege/ui-kit v1.2.0 (zero-API дизайн-система)
│   ├── tokens.json               # Токены светлой/тёмной тем, Саха, типографика, zIndex, правила
│   ├── styles/
│   │   ├── base.css              # Базовые стили сетки, сайдбара, карточек, форм, Admin UI Kit
│   │   └── brandbook.css         # Стили брендбука, лендинга, графиков, таблиц, мессенджеров
│   ├── components/
│   │   ├── icons.js              # EGE.ui — 53 SVG-иконки, логотипы, якутские узоры, каталог 40 плиток
│   │   ├── hh-components.js      # EGE.hh — селекты, мультиселект, теги разницы ставок, аватар, тики
│   │   ├── charts.js             # EGE.charts — DataViz и DataTable (5 пресетов: requests, students, payouts, exams, admin)
│   │   └── kit.js                # EGE.kit — 27 элементов каталога, Shell-виджеты, Admin UI Kit, маски WA/TG/MAX
│   └── brandbook/
│       └── brandbook.js          # EGE.views.brandbook — интерактивная страница /brandbook (+ handleAction/handleInput)
│
├── frontend/                     # Прикладное SPA (зависит от ux-ui/, но не наоборот)
│   ├── README.md
│   ├── index.html                # HTML-оболочка SPA, CSS-переменные, порядок <script>-подключений
│   ├── app.js                    # Оркестратор: роутинг (/admin, /cabinet, /market...), VIEWS, ACTIONS, EGE.payments (CRLF!)
│   ├── bank-core.js              # EGE.hash, EGE.qSig, EGE.loadBank — сборка и дедупликация банка
│   ├── core/utils.js             # EGE.utils — esc, rich, clone, deepMerge, даты, plural, norm
│   ├── core/api.js               # EGE.api — централизованный HTTP-клиент (auth, docs, calendar, realtime, admin)
│   ├── core/realtime.js          # EGE.realtime — SSE/WebSocket/BroadcastChannel клиент + RFC 5545 .ics парсер
│   ├── assets/lena-pillars.jpg   # Локальный hero-баннер (Ленские столбы)
│   ├── styles/
│   │   ├── marketplace.css       # Стили маркетплейса, фильтров, календаря, кабинета преподавателя
│   │   └── study.css             # Стили тестирования, статистики, сочинений
│   ├── data/
│   │   ├── tutors.js             # EGE.tutors — каталог/справочник репетиторов, города, часовые пояса, заявки учеников
│   │   ├── plan.js               # EGE.exams, EGE.plan — контрольные даты ЕГЭ-2027 и чек-лист поступления
│   │   └── essay.js              # EGE.essay — тексты и эталоны задания 27 по русскому языку
│   ├── subjects/                 # Банк заданий по биологии, химии, русскому + table.js (правки CSV)
│   └── views/
│       ├── landing.js            # EGE.views.landing — лендинг, калькулятор цены, моушен-пресеты, бегущая строка
│       ├── marketplace.js        # EGE.views.marketplace — витрина подбора, табличные заявки/учёба, модалка ±100 ₽
│       ├── tutor-cabinet.js      # EGE.views.tutorCabinet — кабинет преподавателя, табличные заявки/ученики/лиды, выплаты
│       └── admin.js              # EGE.views.admin — админ-панель (/admin) на UI-Kit + EGE.api.admin
│
├── backend/                      # Серверный слой (FastAPI)
│   ├── README.md
│   ├── config.py                 # Загрузка ENV: Settings, AIConfig, GoogleOAuthConfig, resolve_db_path(), database_url, db_mode
│   ├── ai.py                     # Адаптер Gemini / OpenAI / Anthropic / OpenRouter (SSE + JSON)
│   ├── realtime.py               # RealtimeHub: SSE (/api/realtime/stream), WebSocket (/api/realtime/ws), publish, recent + PG outbox
│   ├── calendar_sync.py          # CalendarSyncService: двусторонний .ics / Google Calendar синк (Asia/Yakutsk UTC+9 ↔ Europe/Moscow UTC+3)
│   ├── shell.py                  # SSR-оболочка SPA (/, /landing, /brandbook, /fees, /admin, /privacy) + allowlist статики
│   ├── api/                      # Чистый Headless API пакет (используется и в Preparation, и в vektor-api :8771)
│   │   ├── __init__.py           # create_api_app(), create_api_router(), CORS (:8770, :8772)
│   │   ├── auth_docs.py          # Health, OAuth 2.0 PKCE, scrypt auth, docs CRUD, AI proxy
│   │   ├── realtime_calendar.py  # Realtime SSE/WS/publish/recent + Calendar .ics/sync/import
│   │   └── admin.py              # Admin REST (/api/admin/{architecture,overview,users,tutors,requests,payouts,outbox})
│   └── main.py                   # create_app(): объединяет create_api_app + register_shell_routes
│
├── databases/                    # Слой баз данных
│   ├── README.md
│   ├── migrations/001_initial_sqlite.sql  # Базовая DDL-схема SQLite
│   ├── sqlite/store.py           # Database: WAL, потокобезопасный RLock, scrypt, сессии, docs, admin_*
│   ├── postgres/store.py         # PostgresDatabase, DualWriteDatabase, create_store (oltp.* + outbox.kafka_outbox + admin_*)
│   └── analytics/.gitkeep        # Место для аналитических витрин/Parquet
│
├── etl/                          # Изолированная Big Data / Analytics подсистема
│   ├── README.md
│   ├── requirements-etl.txt      # polars, pyarrow, duckdb (не ставятся в Docker web-образа)
│   ├── sources/ykt_tg_max_schema.py      # RawTutorListing, VALID_SOURCES, normalize_listing (Bronze → Silver)
│   ├── pipelines/tutors_polars_pipeline.py # LazyFrame дедупликация и Gold-витрина + write_gold_parquet
│   └── sales/sales_metrics.py    # commission_split (95/5%), summarize_sales (GMV, конверсия по тарифам)
│
├── tools/                        # Локальные инструменты работы с банком заданий
│   ├── bank.html                 # Просмотр и проверка банка
│   └── bank-tools.js
│
├── bank/                         # Исходные табличные материалы банка заданий (bank.csv и т.п.)
│
└── tests/                        # Автотесты
    ├── check_app.js              # Frontend + банк + UI Kit + DataViz + Realtime/Calendar + кабинет репетитора + /admin (jsc / node)
    ├── test_server.py            # FastAPI endpoints, auth, docs, AI mock, static allowlist
    ├── test_dualwrite_pg.py      # DualWriteDatabase, PostgresDatabase, /api/health/storage, outbox.kafka_outbox
    ├── test_realtime_calendar.py # Realtime SSE/WS/publish и двусторонний .ics/Google Calendar синк (UTC+9 ↔ UTC+3)
    ├── test_admin_api.py         # Headless API изоляция + /api/admin/* (SQLite & PG17 Dual-Write)
    └── test_etl.py               # Схема ETL, Polars/fallback витрины, sales_metrics, tokens.json
```

---

## 4. UI Kit (`ux-ui/`) — отдельная архитектура

UI Kit полностью отделён от домена ЕГЭ и маркетплейса: любой компонент можно перенести в другой проект вместе с `ux-ui/`, `frontend/core/utils.js` (для `esc`) и CSS.

### 4.1 Дизайн-токены ([ux-ui/tokens.json](ux-ui/tokens.json) и CSS `:root` / `html.dark`)

- **Палитра Light / Dark**:
  - Светлая: `--bg: #F4F5F7`, `--surface: #FFFFFF`, `--surface-2: #F2F3F6`, `--ink: #141517`, `--accent: #0070FF`, `--confirm: #16A34A`, `--notif: #F97316`, `--bad: #FF2B4D`, `--pro: #7C3AED`.
  - Тёмная: `--bg: #000000`, `--surface: #16181D`, `--surface-2: #22252E`, `--ink: #FFFFFF`, `--accent: #1D7BFF`, `--confirm: #22C55E`.
  - Премиальное золото (рамка/лого/кнопки бренда и акцентные пики графиков): `--gold: #C59B5F`, градиенты `goldGrad`, `goldGlass`, `goldTextGrad`.
  - Цвета предметов: `bio: #7C3AED` (`#A855F7` dark), `chem: #0284C7` (`#38BDF8` dark), `rus: #EA580C` (`#FB923C` dark).
  - Якутская палитра `sakha`: `auroraCyan: #0EA5E9`, `auroraGreen: #10B981`, `glacierLight: #EFF9FF`.
- **Сетка и слои**: радиусы `16 / 12 / 999 px`, брейкпоинты `mini: 360`, `mobile: 680`, `tablet: 1080`, `desktop: 1360`, `zIndex` (`stickyTop: 10`, `selectMenu: 25`, `mobileTabbar: 40`, `sideToast: 60`, `modal: 100`).
- **Стили**:
  - [ux-ui/styles/base.css](ux-ui/styles/base.css) — каркас, типографика, кнопки, инпуты, модалки, сайдбар, таббар.
  - [ux-ui/styles/brandbook.css](ux-ui/styles/brandbook.css) — карусель/сетка DataViz (`.tc-bar-chart`, `.bb-line-chart`, `.bb-donut-chart`, `.bb-table-wrap`), мультиканальные кнопки мессенджеров `.btn-msg` (`.is-wa`, `.is-tg`, `.is-max`), `.hh-select`, `.hh-multi`, орнаменты Саха.

### 4.2 JavaScript-модули UI Kit

1. **[ux-ui/components/icons.js](ux-ui/components/icons.js) → `window.EGE.ui`**
   - `ICONS` (53 SVG-пути `24×24`, `stroke-width: 1.8`), `icon(name)`.
   - `sakhaPatternSVG`, `sakhaOhyorHTML`, `brandLogoSVG`, `BRAND_MARK_HTML`, `BRAND_WORDMARK_HTML`, `brandLockupHTML`, `GOOGLE_SVG`.
   - `getIconCatalog(dark)` (каталог 40 иконок с микро-анимациями) и `triggerIconTileAnim(tile)`.
2. **[ux-ui/components/hh-components.js](ux-ui/components/hh-components.js) → `window.EGE.hh`**
   - `feeSplitHTML`, `bidBtnLabelHTML`, `sakhaBidInnerHTML`, `priceHeadlineHTML`, `priceDiffTagsHTML`, `sliderTicksHTML`.
   - `BB_DAYS`, `bbDayObj`, `hhSelectHTML`, `hhMultiSelectHTML` (мультиселект с чипами и крестиком удаления внутри поля), `tutorAvatarHTML` (поддержка загруженного фото или аккуратной заглушки «Без фото»).
3. **[ux-ui/components/charts.js](ux-ui/components/charts.js) → `window.EGE.charts`**
   - Вынесенный независимый модуль визуализации данных:
   - `CHART_STYLE_META` — 6 вариантов (`sticks`, `candles`, `range`, `stacked`, `dual`, `segmented`), активная колонка выделяется капсульной обводкой `.tc-bar-col.is-active`.
   - `chartDatasetBars(dsId)`, `smoothTrendPath(pts)` (кубическая кривая Безье для комбо-тренда `.tc-combo-line`).
   - `stickChartHTML`, `lineChartHTML` (линейный + area SVG), `DONUT_DATASETS`, `donutChartHTML` (`stroke-linecap="butt"`, без лишних штрихов и с внешним кольцом-индикатором `.bb-donut-outer-ring`), `TABLE_ROWS`, `STUDENT_ROWS`, `ADMIN_ROWS`, `TABLE_PRESETS` (`requests`, `students`, `payouts`, `exams`, `admin`), `dataTableHTML(opts)` (универсальная schema-driven таблица: 3/5/7 колонок или кастомные `columns`/`rows`, поиск и фильтрация, `filterAction`/`colsAction`/`presetAction`/`searchAction`, `rowAttrs`, `toolbarExtraHTML`, `cardWrap: false`, подтверждение строк и автоматическая `@container`/`@media`-трансформация в мобильные карточки с `td[data-label]`).
4. **[ux-ui/components/kit.js](ux-ui/components/kit.js) → `window.EGE.kit`**
   - Реестр `CATALOG_CATEGORIES` / `CATALOG_ITEMS` (`27` элементов, включая `admin-kit` и `arch-split`), переиспользуемые лендинг-блоки (`heroBannerHTML`, `searchStripHTML`, `sentNoticeHTML`, `sakhaButtonsHTML`, `marqueePillsHTML`, `rateBenchCardHTML`, `trustStripHTML`, `reviewCardHTML`, `faqListHTML`, `blueBannerHTML`).
   - Единые Shell-виджеты сайта и системных состояний (используются в `frontend/app.js`, `frontend/views/marketplace.js`, `frontend/views/tutor-cabinet.js`, `frontend/views/admin.js` и `/brandbook`): `topBalanceWidgetHTML` (`student` / `tutor`), `tutorBalanceDockHTML` (с `inlinePreview` для стендов), `walletSummaryBarHTML`, `sideToastInnerHTML`, `emptyStateHTML`, `skeletonCardHTML`, `realtimeStatusPillHTML` (`.rt-status-pill` для `sse | ws | local | connecting`) и `calendarSyncCardHTML` (`.cal-sync-card` для двустороннего `.ics` / Google Calendar синка `UTC+9` ↔ `UTC+3`).
   - Admin UI Kit компоненты: `adminKpiGridHTML`, `adminModerationBadgeHTML` (`7` статусов: `verified`, `pending`, `flagged`, `paid`, `frozen`, `published`, `declined`), `serviceBoundaryCardHTML`, `roleSwitchBannerHTML`.
   - Data & Observability UI Kit компоненты для витрины пайплайнов и кликстрима: `pipelineStageCardHTML` (`PostgreSQL 17`, `Polars M4 Pro`, `Airflow DAG`, `Kafka Clickstream`, `Grafana BI`) и `eventLogFeedHTML`.
   - Единая каноническая логика контактов и мессенджеров (WA / TG / MAX): `normalizePhoneDigits`, `formatPhoneMask` (`+7 (XXX) XXX-XX-XX`), `formatTelegramContact` (телефон или `@login`), `entitySlug`, `whatsappUrl`, `telegramUrl`, `maxUrl`, `resolveMessengerUrls`, `messengerLinksHTML`.
   - Ре-экспортирует `EGE.charts` хэлперы и `TABLE_PRESETS` без дублирования кода.
5. **[ux-ui/brandbook/brandbook.js](ux-ui/brandbook/brandbook.js) → `window.EGE.views.brandbook`**
   - Рендерит `/brandbook` (передаваемый опционально `{ inside: true }`), включая разделы `#bb-mask-trainer`, `#bb-payments`, `#bb-ui-kit-shells`, `#bb-telemetry-etl`, `#bb-admin-kit`, `#bb-arch-split`, `#bb-ege-timers` и `#bb-a11y`, и экспортирует `handleAction` и `handleInput` для интерактивных состояний (типы графиков, датасеты, `5` пресетов и подтверждение строк таблицы, тренажёр масок, эскроу/пороги оплаты, переключение роли Shell-виджетов `bb-shell-role`, фильтр стадий ETL `bb-pipe-filter`, переключение часового пояса календаря `bb-cal-tz`, вкладки `#bb-admin-kit` `bb-admin-tab`, dual-role таблица `bb-dual-role`, вкладки разбора сочинения, мультиселект, анимации и `reduced-motion`).
   - Дорожная карта дальнейших интеграций и карта **7 независимых репозиториев** описаны в [ROADMAP_UNCONNECTED.md](ROADMAP_UNCONNECTED.md) и [REPOSITORIES.md](REPOSITORIES.md).

---

## 5. Backend API ([backend/](backend/))

### 5.1 HTTP и WebSocket эндпоинты ([backend/main.py](backend/main.py), [backend/realtime.py](backend/realtime.py), [backend/calendar_sync.py](backend/calendar_sync.py))

| Метод и путь | Авторизация | Назначение |
|---|---|---|
| `GET /api/health` | Нет | Проверка готовности сервиса, `SELECT 1` в хранилище, статуса AI (`enabled`, `provider`) |
| `GET /api/health/storage` | Нет | Диагностика активного хранилища (`mode`: `sqlite` / `dual` / `postgres`, статус SQLite и PostgreSQL 17) |
| `GET /api/me` | Опц. кука | Текущий пользователь, флаг `inviteRequired`, доступные провайдеры (`local`, `google`) и AI |
| `POST /api/auth/register` | Rate limit (`20/15м`) | Регистрация (локально + `scrypt`), проверка `INVITE_CODE` при его наличии, установка `HttpOnly` куки `pvm_session` |
| `POST /api/auth/login` | Rate limit (`20/15м`) | Логин по username или email, выдача сессионной куки |
| `POST /api/auth/logout` | Кука (опц.) | Удаление сессии из БД и очистка куки |
| `GET /api/auth/google/start` | Rate limit (`20/15м`) | Генерация PKCE `code_verifier`/`S256` и `oauth_states`, редирект на Google OAuth 2.0 |
| `GET /api/auth/google/callback` | `state` + `code` | Обмен кода на `access_token`, загрузка userinfo, `upsert_oauth_user`, установка сессии |
| `GET /api/docs` | `require_user` | Выгрузка всех JSON-документов прогресса пользователя |
| `PATCH /api/docs/{name}` | `require_user` | Глубокое слияние `deep_merge` (с удалением `null`-ключей) и проверкой `max_doc_bytes` |
| `PUT /api/docs/{name}` | `require_user` | Полная перезапись документа `{name}` с валидацией |
| `GET /api/realtime/stream` | Опц. кука | SSE-поток (`text/event-stream`) мгновенных уведомлений кабинета и маркетплейса |
| `WS /api/realtime/ws` | Опц. кука | Двусторонний WebSocket-канал (`ping`/`pong`, `publish`, `connected`) |
| `POST /api/realtime/publish` | Опц. кука | Публикация realtime-события (например, `market.bid.created`) в хаб и `outbox.kafka_outbox` |
| `GET /api/realtime/recent` | Опц. кука | Буфер последних realtime-событий для восстановления состояния после переподключения |
| `GET /api/calendar/state` | Опц. кука | Состояние расписания репетитора (`10:00–20:00`), `.ics`-ссылки, Google Calendar URL и конвертация `UTC+9` ↔ `UTC+3` |
| `PUT /api/calendar/sync` | Опц. кука | Сохранение/синхронизация слотов и уроков репетитора с записью в PostgreSQL (`oltp.calendar_sync_tokens`, `oltp.calendar_events`) и `outbox.kafka_outbox` |
| `GET /api/calendar/{feed_token}.ics` | По токену фида | Экспорт расписания репетитора в формате RFC 5545 `text/calendar` (`UTC` + `VTIMEZONE` `Asia/Yakutsk` / `Europe/Moscow`) |
| `POST /api/calendar/import-ics` | Опц. кука | Двусторонний импорт внешнего `.ics` (Google Calendar) с вычислением занятых окон и конфликтов в часовом поясе репетитора |
| `GET /api/admin/architecture` | Нет | Границы 7 репозиториев (`uiKit`, `headlessApi`, `spaShell`, `postgres`, `polars`, `airflow`, `grafana`) и статус хранилища |
| `GET /api/admin/overview` | Нет | Сводка KPI админ-панели (`gmvRub`, `payoutRub` 95%, `feeRub` 5%, `pendingRequestsCount`, `outboxPending`), доли каналов и серия по дням |
| `GET /api/admin/users` / `POST /api/admin/users/{id}/role` | Нет | Реестр пользователей и смена роли (`student \| tutor \| admin`) с записью события в `outbox.kafka_outbox` |
| `GET /api/admin/tutors` / `POST /api/admin/tutors/{id}/moderate` | Нет | Реестр преподавателей и модерация (`verified`, `bumped`, `tariffId`) |
| `GET /api/admin/requests` / `POST /api/admin/requests/{id}/status` | Нет | Реестр заявок и модерация статуса (`accepted \| pending \| declined \| refunded`) с обновлением эскроу |
| `GET /api/admin/payouts` / `POST /api/admin/payouts/{id}/status` | Нет | Очередь выплат СБП / Карта Мир и переводы статусов (`succeeded \| processing \| rejected`) |
| `GET /api/admin/outbox` | Нет | Лента транзакционного аутбокса `outbox.kafka_outbox` / `admin_outbox_events` |
| `POST /api/ai` | `require_user` + `50/ч` | Прокси к LLM: `mode: "stream"` (SSE `text/event-stream`) или `mode: "json"` |
| `GET /`, `/index.html`, `/landing`, `/brandbook`, `/fees`, `/admin` | Нет | Отдача SPA с инъекцией `window.EGE_HOST = {"backend": true}` перед `app.js` (`Cache-Control: no-store`) |
| `GET /privacy` | Нет | Статическая HTML-страница политики конфиденциальности |
| `GET /{file_path}` | Нет | Allowlist статических ассетов (`ux-ui/*`, `frontend/*` через `static_assets`) с защитой от `..` |

### 5.2 Конфигурация через ENV ([backend/config.py](backend/config.py), [.env.example](.env.example))

- `DB_PATH` → `RAILWAY_VOLUME_MOUNT_PATH/app.db` → `.local_data/app.db`
- `DATABASE_URL` (`postgresql://postgres@127.0.0.1:5432/vektor_ege`) и `DB_MODE` (`auto | sqlite | dual | postgres`)
- `SESSION_DAYS` (`30`), `INVITE_CODE` (`""`), `MAX_USERS` (`0` = без лимита), `MAX_DOC_BYTES` (`2 MiB`)
- `AI_PROVIDER` (`auto | gemini | openai | anthropic | openrouter`), `GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY` / `AI_API_KEY`, `AI_MODEL`, `AI_MODEL_COMPLEX`, `AI_BASE_URL`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_BASE_URL`

---

## 6. Схема баз данных и документы прогресса ([databases/](databases/))

### 6.1 OLTP SQLite WAL и PostgreSQL 17 Dual-Write ([databases/sqlite/store.py](databases/sqlite/store.py) & [databases/postgres/store.py](databases/postgres/store.py))

Прагмы SQLite-соединения: `journal_mode=WAL`, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`. Потокобезопасность внутри 1 процесса обеспечивается через `threading.RLock`. При указании `DATABASE_URL` и `DB_MODE=dual` (или `auto`) фабрика `create_store()` инициализирует `DualWriteDatabase`, который синхронно записывает изменения в SQLite WAL и в схему `oltp.*` PostgreSQL 17, а также публикует события в транзакционный аутбокс `outbox.kafka_outbox`.

Таблицы:
1. **`users`** — `id`, `username` (UNIQUE), `username_lower` (UNIQUE), `password_hash` (`scrypt$salt$dk`), `display_name`, `email`, `email_lower` (partial UNIQUE index `idx_users_email_lower`), `avatar_url`, `auth_provider` (`local` / `google`), `created_at`.
2. **`user_identities`** — PK `(provider, provider_subject)`, FK `user_id -> users(id) ON DELETE CASCADE`, `email`, `created_at`.
3. **`oauth_states`** — `state_hash` (PK), `provider`, `code_verifier`, `redirect_uri`, `created_at`, `expires_at`.
4. **`sessions`** — `token_hash` (PK, SHA-256 от сырого токена), `user_id` (FK CASCADE), `created_at`, `expires_at`.
5. **`docs`** — PK `(user_id, name)`, `data` (JSON-строка), `updated_at`.

Разрешённые имена документов (`DOC_NAME_RE`): `^(profile|plan|mocks|essays|tutor-cabinet|calendar-sync|prog-[a-z]+|log-\d{4}-\d{2})$` (`profile`, `plan`, `mocks`, `essays`, `tutor-cabinet`, `calendar-sync`, `prog-bio`/`prog-chem`/`prog-rus`, `log-YYYY-MM`). Локальные данные маркетплейса и кабинета преподавателя дополнительно кешируются в браузере под ключом `vektor-ege:market`.

### 6.2 OLAP & ETL ([etl/](etl/))

- Зависимости вынесены в [etl/requirements-etl.txt](etl/requirements-etl.txt), чтобы web-образ Docker оставался компактным.
- **Источники (`VALID_SOURCES`)**: `doska_ykt`, `telegram`, `whatsapp`, `max`.
- **Пайплайн**: `RawTutorListing` → `normalize_listing()` (Silver) → `build_silver_tutors()` / `build_gold_subject_mart()` через `polars.LazyFrame` → `write_gold_parquet()`.
- **Метрики продаж (`etl/sales/sales_metrics.py`)**: тарифы `free (0 ₽)`, `trial5k (5 000 ₽)`, `month10k (10 000 ₽)`; `commission_split()` (95% выплата репетитору / 5% комиссия системы, совпадает с `EGE.tutors.commissionSplit`); `summarize_sales()` агрегирует GMV, конверсию, средний чек и разбивку по тарифам.

---

## 7. Порядок загрузки и API `window.EGE` на Frontend

Скрипты подключаются в [frontend/index.html](frontend/index.html) строго по DAG (снизу вверх):
1. `bank-core.js` → `EGE.hash`, `EGE.qSig`, `EGE.loadBank`
2. `subjects/*.js` → `EGE.subjects.{bio,chem,rus}`, `EGE.chemLib`, `EGE.table`
3. `data/plan.js`, `data/essay.js` → `EGE.exams`, `EGE.plan`, `EGE.essay`
4. `core/utils.js` → `EGE.utils` (`esc`, `rich`, `clone`, `deepMerge`, `norm`, `plural`, даты), `core/api.js` → `EGE.api` (изолированный HTTP-клиент с `configure({ baseUrl, onUnauthorized })`, `health`, `storageHealth`, `auth`, `docs`, `calendar`, `realtime`, `admin`) и `core/realtime.js` → `EGE.realtime` (`connect`, `connectWS`, `publish`, `syncCalendar`, `importIcs`, `parseIcsBusySlots`, `buildIcsText`)
5. UI Kit: `ux-ui/components/icons.js` (`EGE.ui`) → `hh-components.js` (`EGE.hh`) → `charts.js` (`EGE.charts`) → `kit.js` (`EGE.kit`) → `ux-ui/brandbook/brandbook.js` (`EGE.views.brandbook`)
6. `data/tutors.js` → `EGE.tutors` (в runtime использует `EGE.kit` для масок и мессенджер-ссылок; обратная зависимость отсутствует)
7. `views/landing.js` (`EGE.views.landing`), `views/marketplace.js` (`EGE.views.marketplace`), `views/tutor-cabinet.js` (`EGE.views.tutorCabinet`), `views/admin.js` (`EGE.views.admin`)
8. `app.js` → инициализация состояния, связывание `configure(...)` всех вьюх, роутер (`student | tutor | admin`), делегирование в `EGE.api` и `EGE.views.*`, `EGE.payments` (`provider: "demo"`, `createTopupIntent`, `createPayoutIntent`, `setGatewayHandler`).

---

## 8. Жёсткие инварианты (нельзя нарушать при изменениях)

1. **Однонаправленный DAG UI Kit**: код внутри `ux-ui/` не должен зависеть от `EGE.tutors`, `frontend/data/*` или `frontend/views/*`. Прикладные данные делегируют форматирование в `EGE.kit` / `EGE.charts` / `EGE.hh`, а не наоборот.
2. **Allowlist статики**: добавление нового `.js`/`.css`/image-файла требует включения в `<script>`/`<link>` в `frontend/index.html`, проверки allowlist в `static_assets()` в `backend/main.py` и добавления пути в `test_static_asset_allowlist` в [tests/test_server.py](tests/test_server.py).
3. **CRLF в [frontend/app.js](frontend/app.js)**: файл исторически хранится со строгими `\r\n` (`bare_lf == 0` проверяется перед коммитами и правками).
4. **Брендинг и копирайтинг**:
   - Цвет `#13794b` запрещён в CSS-токенах `frontend/index.html`.
   - Подстрока `"5%:"` запрещена на `/brandbook`; сервисный сбор `5%` отображается на `/fees` и при оплате.
   - На `/landing` кнопка «Подбор» и витрина не дублируются разделом «Моушен» в верхнем баре.
5. **1 процесс uvicorn**: `Dockerfile` и локальный сервер запускаются с `--workers 1`, так как `RateLimiter` хранится в памяти процесса.
6. **Синхронизация формулы комиссии**: формула `95% / 5%` должна оставаться идентичной в `EGE.tutors.commissionSplit` ([frontend/data/tutors.js](frontend/data/tutors.js)) и `commission_split` ([etl/sales/sales_metrics.py](etl/sales/sales_metrics.py)).

---

## 9. Команды запуска, проверки и деплоя

```bash
# 1. Полная проверка: Frontend/Банк/UI Kit (JavaScriptCore на macOS) + Backend/ETL (pytest) + CRLF-проверка
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/check_app.js \
  && .venv/bin/pytest -q \
  && python3 -c 'b=open("frontend/app.js","rb").read(); print("bare_lf:", b.replace(b"\r\n",b"").count(b"\n"))'

# В CI / Linux (Node.js 22):
node tests/check_app.js && pytest -q

# 2. Запуск локального full-stack сервера (с FastAPI + SQLite WAL)
.venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8770

# 3. Локальный сбор образа и запуск как на Railway
docker build -t vektor-ege . && docker run --rm -p 8000:8000 -e PORT=8000 vektor-ege

# 4. Деплой на прод (Railway автодеплоится при push в origin main)
git push origin main
```
