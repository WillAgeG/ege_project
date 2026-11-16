# REPOSITORIES.md — Карта 7 независимых репозиториев экосистемы «Вектор ЕГЭ»

> [!NOTE]
> Вся платформа разделена на **7 независимых Git-репозиториев** в каталоге `/Users/aleksej/Documents/my_projects/`: к пяти базовым сервисам (`Preparation :8770`, `vektor-postgres :5432`, `vektor-polars-engine`, `vektor-airflow :8085`, `vektor-grafana :3000`) добавлены обособленный **Headless API сервер (`vektor-api :8771`)** и автономный **Zero-API UI Kit & Brandbook (`vektor-ui-kit :8772`)**. Основной веб-репозиторий (`Preparation`) поддерживает как автономный zero-config запуск на SQLite WAL, так и **живой режим Dual-Write (`DB_MODE="dual"`) в PostgreSQL 17 (`vektor-postgres :5432`)** с транзакционным аутбоксом `outbox.kafka_outbox`, Admin REST API (`/api/admin/*`), Realtime-хабом (`SSE` / `WebSocket`) и двусторонней синхронизацией календарей `.ics` / Google Calendar (`Asia/Yakutsk UTC+9` ↔ `Europe/Moscow UTC+3`).

---

## 1. Сводный реестр 7 репозиториев

| № | Репозиторий | Абсолютный путь | Порт / Режим | Назначение, схемы и ключевой стек |
|---|---|---|---|---|
| **1** | **`Preparation`**<br>*(SPA Shell + Админ-панель + Full-Stack)* | `/Users/aleksej/Documents/my_projects/Preparation` | **`8770`**<br>(HTTP Web / API / SSE / WS) | Основная SPA-оболочка «Вектор ЕГЭ»: централизованный клиент `frontend/core/api.js` (`EGE.api`), экраны Ученика/Преподавателя (табличные `#student-bookings-table`, `#student-leads-table`, `#study-schedule-table`, `#study-chats-table`, `#tc-requests-table`, `#tc-students-table`, `#tc-leads-table`), Админ-панель (`frontend/views/admin.js`, `/admin`), FastAPI-компоновщик (`backend/main.py`, `backend/shell.py`, `backend/api/*`), хранилища SQLite + PG17 Dual-Write (`databases/`), тесты `tests/check_app.js` и `tests/test_admin_api.py`. |
| **2** | **`vektor-api`**<br>*(Headless FastAPI REST / SSE / WS / Admin API)* | `/Users/aleksej/Documents/my_projects/vektor-api` | **`8771`**<br>(Headless JSON / SSE / WS) | Чистый headless API-сервер (`backend/api/{__init__,auth_docs,realtime_calendar,admin}.py`, `create_api_app`) без HTML и статики UI Kit: авторизация OAuth/scrypt, документы прогресса, Realtime SSE/WS, `.ics`/GCal синк, Admin API (`/api/admin/{architecture,overview,users,tutors,requests,payouts,outbox}`) и OpenAPI `/docs` с CORS для `:8770` и `:8772`. |
| **3** | **`vektor-ui-kit`**<br>*(Standalone Zero-API Design System & Brandbook)* | `/Users/aleksej/Documents/my_projects/vektor-ui-kit` | **`8772`**<br>(Static / Brandbook стенд) | Обособленная дизайн-система `@vektor-ege/ui-kit` (`ux-ui/package.json` v1.2.0, zero `fetch`/`EventSource`/`WebSocket`/`EGE.api`): дизайн-токены (`tokens.json`), `27` карточек каталога Brandbook (`#bb-admin-kit`, `#bb-arch-split` и др.), `5` пресетов `EGE.charts.dataTableHTML` (`requests`, `students`, `payouts`, `exams`, `admin`), Admin UI Kit компоненты (`adminKpiGridHTML`, `adminModerationBadgeHTML`, `serviceBoundaryCardHTML`, `roleSwitchBannerHTML`) и стенд `tests/check_uikit.js`. |
| **4** | **`vektor-postgres`**<br>*(PostgreSQL 17 OLTP + Outbox + Gold Marts)* | `/Users/aleksej/Documents/my_projects/vektor-postgres` | **`5432`**<br>(PostgreSQL 17, БД `vektor_ege` + `airflow_meta`) | Серверная реляционная СУБД PostgreSQL 17 со схемами: `oltp.*` (пользователи, сессии, `docs JSONB`, репетиторы, слоты `10:00–20:00`, заявки `±100 ₽`, эскроу `95%/5%`, выплаты), `telemetry.user_events` (кликстрим), `outbox.kafka_outbox` (конверты событий Kafka), `bronze.*`, `silver.*` и `gold.*` (аналитические витрины). |
| **5** | **`vektor-polars-engine`**<br>*(Bare-Metal Polars Lakehouse on Apple M4 Pro)* | `/Users/aleksej/Documents/my_projects/vektor-polars-engine` | **Bare-metal CLI**<br>(`arm64`, без сетевого порта) | Нативный высокопроизводительный движок обработки данных на Apple M4 Pro (`polars` `LazyFrame` + `pyarrow` + `duckdb` + `psycopg`): слои `warehouse/bronze/*.parquet` → `warehouse/silver/*.parquet` → `warehouse/gold/*.parquet`, синхронизация витрин в PostgreSQL (`silver.*`, `gold.*`) и замер throughput в `gold.engine_benchmarks`. |
| **6** | **`vektor-airflow`**<br>*(Apache Airflow Orchestrator)* | `/Users/aleksej/Documents/my_projects/vektor-airflow` | **`8085`**<br>(Airflow Webserver & Scheduler) | Оркестратор расписаний и DAG-пайплайнов (метабаза `airflow_meta` в PostgreSQL `:5432`): запуск bare-metal задач `vektor-polars-engine`, расчёт эскроу/выплат `95%/5%`, обработка очереди `outbox.kafka_outbox` и логирование запусков в `gold.pipeline_runs`. |
| **7** | **`vektor-grafana`**<br>*(Grafana BI & Data Platform Observability)* | `/Users/aleksej/Documents/my_projects/vektor-grafana` | **`3000`**<br>(Grafana HTTP Server) | Провижининг datasource `vektor-postgres` (`127.0.0.1:5432`) и живых дашбордов (включая **«Вектор ЕГЭ · Бизнес и Clickstream аналитика»** `vektor_super_analytics.json` и **«Вектор ЕГЭ · Data Platform (Polars M4 Pro, Airflow, Kafka Outbox)»** `vektor_data_platform.json`). |

---

## 2. Сквозная схема потоков данных (ASCII Data Flow)

```text
+-----------------------------------------------------------------------------------+
| 1. BROWSER / SPA SHELL (Preparation :8770)  <-- UI-Kit & Brandbook (:8772)        |
|    - Vanilla JS SPA (window.EGE) + @vektor-ege/ui-kit (ux-ui/, 27 каталогов)      |
|    - Централизованный HTTP-клиент EGE.api (frontend/core/api.js)                  |
|    - Админ-панель (/admin, frontend/views/admin.js) + табличные вьюхи ролей       |
|    - Realtime-клиент (frontend/core/realtime.js): SSE + WebSocket + BroadcastChan |
|    - Календарь .ics / Google Calendar (Якутск UTC+9 <-> Москва UTC+3)             |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | HTTP / JSON / SSE / WS (/api/*)
                                          v
+-----------------------------------------------------------------------------------+
| 2. HEADLESS API (vektor-api :8771 / Preparation backend/api/*)                    |
|    - backend/api/{auth_docs,realtime_calendar,admin}.py + CORS (:8770, :8772)     |
|    - Auth (OAuth 2.0 + PKCE, scrypt), Docs JSONB, AI-прокси (/api/ai)             |
|    - LIVE Admin REST (/api/admin/{architecture,overview,users,tutors,requests,    |
|      payouts,outbox})                                                             |
|    - LIVE Realtime Hub (/api/realtime/{stream,ws,publish,recent})                 |
|    - LIVE Calendar Sync (/api/calendar/{state,sync,{feed_token}.ics,import-ics})  |
|    - LIVE DualWriteDatabase (databases/postgres/store.py, DB_MODE="dual")         |
|      синхронно пишет в SQLite WAL (.local_data/app.db) И в PostgreSQL 17 (:5432)  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | LIVE TCP 127.0.0.1:5432 (БД vektor_ege)
                                          v
+-----------------------------------------------------------------------------------+
| 3. POSTGRESQL 17 (vektor-postgres :5432)                                          |
|    - oltp.*               : users, user_identities, oauth_states, sessions,       |
|                             docs (JSONB), tutors, tutor_slots, lesson_requests,   |
|                             escrow_holds (95%/5%), payout_requests                |
|    - outbox.kafka_outbox  : LIVE транзакционная очередь событий (Envelope v1)     |
|    - telemetry.user_events: сырые события кликстрима и логов пользователей        |
|    - bronze.* / silver.* / gold.* : витрины цен, GMV, воронки, бенчмарки и раны   |
+--------------------+-----------------------------------------+--------------------+
                     |                                         ^
                     | Outbox Relay / CDC                      | Запись витрин
                     v                                         | (silver.*, gold.*)
+----------------------------------------+                     |
| 4. [KAFKA / REDPANDA — FUTURE BUS]     |                     |
|    - vektor.user.clickstream.v1        |                     |
|    - vektor.market.bids.v1             |                     |
|    - vektor.payments.ledger.v1         |                     |
|    - vektor.study.attempts.v1          |                     |
|    - vektor.tutors.raw.v1              |                     |
+--------------------+-------------------+                     |
                     |                                         |
                     | Стримы и батчи событий                  |
                     v                                         |
+--------------------------------------------------------------+--------------------+
| 5. POLARS ON APPLE M4 PRO (vektor-polars-engine — Bare-Metal arm64 CLI / Parquet) |
|    - Оркестрация по расписанию из vektor-airflow (:8085 -> gold.pipeline_runs)    |
|    - Bronze Parquet : сырые дампы Ykt / TG / WA / MAX, кликстрим и ставки         |
|    - Silver Parquet : нормализация телефонов (+7), дедупликация в pl.LazyFrame    |
|    - Gold Parquet   : витрины GMV (95%/5%), Якутск vs Москва, матрица ФИПИ и      |
|                       метрики скорости M4 Pro (rows/sec в gold.engine_benchmarks) |
+--------------------------------------------------------------+--------------------+
                                                               |
                                                               | SQL-запросы (:5432)
                                                               v
+-----------------------------------------------------------------------------------+
| 6. GRAFANA (vektor-grafana :3000, datasource uid: "vektor-postgres")              |
|    - Дашборд 1: Вектор ЕГЭ · Бизнес и Clickstream аналитика                       |
|      (GMV ₽, Выплаты 95% ₽, Сбор 5% ₽, ставки ±100 ₽, Якутск vs Москва, WA/TG/MAX)|
|    - Дашборд 2: Вектор ЕГЭ · Data Platform (Polars M4 Pro, Airflow, Kafka Outbox) |
|      (Throughput rows/sec, gold.pipeline_runs, outbox.kafka_outbox, телеметрия)   |
+-----------------------------------------------------------------------------------+
```

---

## 3. Скрипты запуска и проверки каждого репозитория

### 3.1 `Preparation` — Web SPA, UI Kit & FastAPI (`127.0.0.1:8770`)

```bash
cd /Users/aleksej/Documents/my_projects/Preparation

# Вариант А: Автономный zero-config запуск (SQLite WAL)
.venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8770

# Вариант Б: Боевой запуск в режиме Dual-Write (SQLite WAL + PostgreSQL 17 + outbox.kafka_outbox)
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/vektor_ege" DB_MODE="dual" \
  .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8770

# Проверка статуса хранилища, тестов бэкенда/Admin API/Dual-Write/Realtime/Calendar и фронтенда
curl -sf http://127.0.0.1:8770/api/health/storage
.venv/bin/pytest -q
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/check_app.js
```

### 3.1a `vektor-api` — Headless FastAPI (`127.0.0.1:8771`)

```bash
cd /Users/aleksej/Documents/my_projects/vektor-api
./scripts/api_ctl.sh start
curl -sf http://127.0.0.1:8771/api/admin/architecture
/Users/aleksej/Documents/my_projects/Preparation/.venv/bin/pytest -q tests/test_admin_api.py
```

### 3.1b `vektor-ui-kit` — Standalone UI Kit & Brandbook (`127.0.0.1:8772`)

```bash
cd /Users/aleksej/Documents/my_projects/vektor-ui-kit
./scripts/uikit_ctl.sh start
curl -sf http://127.0.0.1:8772/ | head -n 5
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/check_uikit.js
```

### 3.2 `vektor-postgres` — PostgreSQL 17 (`127.0.0.1:5432`)

```bash
cd /Users/aleksej/Documents/my_projects/vektor-postgres

# Инициализация/запуск кластера PostgreSQL 17 на 127.0.0.1:5432, накатка DDL и сидов
./scripts/ctl.sh init && ./scripts/ctl.sh start && ./scripts/ctl.sh migrate && ./scripts/ctl.sh seed

# Проверка готовности и автотестов схемы
/opt/homebrew/opt/postgresql@17/bin/pg_isready -h 127.0.0.1 -p 5432 -U postgres -d vektor_ege
.venv/bin/pytest -q
```

### 3.3 `vektor-polars-engine` — Bare-Metal Polars на Apple M4 Pro (CLI / Parquet)

```bash
cd /Users/aleksej/Documents/my_projects/vektor-polars-engine

# Запуск пайплайна Bronze -> Silver -> Gold Parquet и синхронизации витрин с PostgreSQL 17
.venv/bin/python -m vektor_polars.cli run-all --db-url postgresql://postgres@127.0.0.1:5432/vektor_ege
.venv/bin/python -m vektor_polars.cli benchmark --rows 250000 --db-url postgresql://postgres@127.0.0.1:5432/vektor_ege

# Проверка arm64 Polars и тестов витрин
.venv/bin/pytest -q
```

### 3.4 `vektor-airflow` — Оркестратор DAG-пайплайнов (`127.0.0.1:8085`)

```bash
cd /Users/aleksej/Documents/my_projects/vektor-airflow

# Запуск Airflow на порту 8085 (метабаза airflow_meta в PostgreSQL 127.0.0.1:5432)
./scripts/airflow_ctl.sh start

# Проверка здоровья и автотестов DAG
curl -sf http://127.0.0.1:8085/api/v2/monitor/health
.venv/bin/pytest -q
```

### 3.5 `vektor-grafana` — BI-дашборды и мониторинг платформы (`127.0.0.1:3000`)

```bash
cd /Users/aleksej/Documents/my_projects/vektor-grafana

# Запуск локального grafana-server на 127.0.0.1:3000 с provisioning из ./provisioning
./scripts/grafana_ctl.sh start

# Проверка API здоровья, наличия обоих дашбордов и тестов провижининга
curl -sf http://127.0.0.1:3000/api/health
/Users/aleksej/Documents/my_projects/Preparation/.venv/bin/pytest -q
```
