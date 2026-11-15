# REPOSITORIES.md — Карта 5 независимых репозиториев экосистемы «Вектор ЕГЭ»

> [!NOTE]
> Вся платформа разделена на **5 независимых Git-репозиториев** в каталоге `/Users/aleksej/Documents/my_projects/`. Основной веб-репозиторий (`Preparation`) остаётся полностью автономным и не содержит незавершённых внешних связок в рантайме, а серверная база данных PostgreSQL 17, bare-metal движок Polars на Apple M4 Pro, оркестратор Airflow и аналитика Grafana развёрнуты в собственных изолированных репозиториях.

---

## 1. Сводный реестр 5 репозиториев

| № | Репозиторий | Абсолютный путь | Порт / Режим | Назначение, схемы и ключевой стек |
|---|---|---|---|---|
| **1** | **`Preparation`**<br>*(Web SPA + FastAPI + UI Kit)* | `/Users/aleksej/Documents/my_projects/Preparation` | **`8770`**<br>(HTTP Web / API) | Основное веб-приложение «Вектор ЕГЭ»: изолированный UI Kit (`ux-ui/`), Vanilla JS SPA (`frontend/`), FastAPI сервер (`backend/`), локальная БД SQLite (`databases/`) и базовые ETL-контракты (`etl/`). |
| **2** | **`vektor-postgres`**<br>*(PostgreSQL 17 OLTP + Outbox + Gold Marts)* | `/Users/aleksej/Documents/my_projects/vektor-postgres` | **`5432`**<br>(PostgreSQL 17, БД `vektor_ege` + `airflow_meta`) | Серверная реляционная СУБД PostgreSQL 17 со схемами: `oltp.*` (пользователи, репетиторы, заявки, ставки `±100 ₽`, эскроу `95%/5%`, выплаты), `telemetry.user_events` (кликстрим), `outbox.kafka_outbox` (конверты событий Kafka), `silver.*` и `gold.*` (аналитические витрины). |
| **3** | **`vektor-polars-engine`**<br>*(Bare-Metal Polars Lakehouse on Apple M4 Pro)* | `/Users/aleksej/Documents/my_projects/vektor-polars-engine` | **Bare-metal CLI**<br>(`arm64`, без сетевого порта) | Нативный высокопроизводительный движок обработки данных на Apple M4 Pro (`polars` `LazyFrame` + `pyarrow` + `duckdb` + `psycopg`): слои `warehouse/bronze/*.parquet` → `warehouse/silver/*.parquet` → `warehouse/gold/*.parquet`, синхронизация витрин в PostgreSQL (`silver.*`, `gold.*`) и замер throughput в `gold.engine_benchmarks`. |
| **4** | **`vektor-airflow`**<br>*(Apache Airflow Orchestrator)* | `/Users/aleksej/Documents/my_projects/vektor-airflow` | **`8085`**<br>(Airflow Webserver & Scheduler) | Оркестратор расписаний и DAG-пайплайнов (метабаза `airflow_meta` в PostgreSQL `:5432`): запуск bare-metal задач `vektor-polars-engine`, расчёт эскроу/выплат `95%/5%`, обработка очереди `outbox.kafka_outbox` и логирование запусков в `gold.pipeline_runs`. |
| **5** | **`vektor-grafana`**<br>*(Grafana BI & Data Platform Observability)* | `/Users/aleksej/Documents/my_projects/vektor-grafana` | **`3000`**<br>(Grafana HTTP Server) | Провижининг datasource `vektor-postgres` (`127.0.0.1:5432`) и двух живых дашбордов: **«Вектор ЕГЭ · Бизнес и Clickstream аналитика»** (`vektor_super_analytics.json`) и **«Вектор ЕГЭ · Data Platform (Polars M4 Pro, Airflow, Kafka Outbox)»** (`vektor_data_platform.json`). |

---

## 2. Сквозная схема потоков данных (ASCII Data Flow)

```text
+-----------------------------------------------------------------------------------+
| 1. BROWSER / SPA (Preparation :8770)                                              |
|    - Vanilla JS SPA (window.EGE) + изолированный UI Kit (ux-ui/)                  |
|    - Контуры: Ученик (тесты, сочинения, подбор ±100 ₽) и Преподаватель (кабинет)  |
|    - Локальный стор localStorage + синхронизация /api/docs и батчи кликстрима     |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | HTTP / JSON / SSE (127.0.0.1:8770)
                                          v
+-----------------------------------------------------------------------------------+
| 2. WEB API (Preparation / FastAPI :8770)                                          |
|    - OAuth 2.0 + PKCE, scrypt-аутентификация, AI-прокси (Gemini/OpenAI/Anthropic) |
|    - Текущий рантайм: автономный SQLite WAL (.local_data/app.db)                  |
|    - Целевой контракт (Dual-Write): запись в PostgreSQL 17 + outbox.kafka_outbox  |
+-----------------------------------------+-----------------------------------------+
                                          |
                                          | TCP 127.0.0.1:5432 (БД vektor_ege)
                                          v
+-----------------------------------------------------------------------------------+
| 3. POSTGRESQL 17 (vektor-postgres :5432)                                          |
|    - oltp.*               : users, tutors, market_bids (±100 ₽), escrow (95%/5%), |
|                             payout_requests (от 500 ₽, СБП / Мир)                 |
|    - telemetry.user_events: сырые события кликстрима и логов пользователей        |
|    - outbox.kafka_outbox  : транзакционная очередь событий (Canonical Envelope v1)|
|    - silver.* / gold.*    : дедуплицированные анкеты, GMV, бенчмарки и запуски    |
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

# Запуск веб-сервера на порту 8770
.venv/bin/uvicorn backend.main:app --reload --host 127.0.0.1 --port 8770

# Проверка тестов бэкенда, ETL и фронтенда/UI Kit
.venv/bin/pytest -q
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/check_app.js
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
