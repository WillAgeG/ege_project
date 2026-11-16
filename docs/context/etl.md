# Контекст: OLAP, ETL, Polars M4 Pro, Airflow и Grafana (`etl/` и data-репозитории)

> [!NOTE]
> Web-образ `Dockerfile` ставит только [requirements.txt](../../requirements.txt). Тяжёлые аналитические пакеты (`polars`, `pyarrow`, `duckdb`) вынесены в [etl/requirements-etl.txt](../../etl/requirements-etl.txt) и bare-metal окружение `vektor-polars-engine`.

## 1. Модули в `Preparation/etl/`
- **`etl/sources/ykt_tg_max_schema.py`**:
  - `VALID_SOURCES`: `doska_ykt`, `telegram`, `whatsapp`, `max`.
  - `RawTutorListing`, `normalize_listing()` (Bronze → Silver: нормализация телефонов `+7`, `@login`, часового окна `10:00–20:00`, города Якутск/Москва).
- **`etl/pipelines/tutors_polars_pipeline.py`**:
  - `build_silver_tutors()`, `build_gold_subject_mart()`, `write_gold_parquet()` на базе `polars.LazyFrame` с безопасным zero-dep Python-фолбэком для окружений без `polars`.
- **`etl/sales/sales_metrics.py`**:
  - Тарифы `free (0 ₽)`, `trial5k (5 000 ₽)`, `month10k (10 000 ₽)`.
  - `commission_split(price)` — **обязана совпадать** с `EGE.tutors.commissionSplit` (`95%` преподавателю / `5%` платформе).
  - `summarize_sales()` — агрегация GMV, конверсии и среднего чека.

## 2. Внешняя Data-платформа (отдельные репозитории)
1. **`vektor-polars-engine`** (`/Users/aleksej/Documents/my_projects/vektor-polars-engine`):
   - Нативный Apple M4 Pro `arm64` (12 потоков Polars `2.1.0`, PyArrow `26`, DuckDB `2`), без Docker.
   - Генерирует ZSTD Parquet в `warehouse/{bronze,silver,gold}/`, синхронизирует `silver.tutors_dedup`, `gold.subject_price_mart`, `gold.daily_gmv_metrics`, `gold.clickstream_funnel`, `gold.pipeline_runs` и замеряет throughput (`8.0–11.78M rows/sec` на 250k строк) в `gold.engine_benchmarks`.
2. **`vektor-airflow`** (`/Users/aleksej/Documents/my_projects/vektor-airflow`, `http://127.0.0.1:8085`):
   - Apache Airflow `3.4.0` на метабазе `127.0.0.1:5432/airflow_meta`.
   - 3 DAG'а: `vektor_tutors_medallion_etl` (`*/30`), `vektor_sales_escrow_elt` (`0 *`), `vektor_clickstream_kafka_pipeline` (`*/15`).
3. **`vektor-grafana`** (`/Users/aleksej/Documents/my_projects/vektor-grafana`, `http://127.0.0.1:3000`):
   - Grafana `13.3.1`, datasource `uid: vektor-postgres` (`jsonData.database: vektor_ege`), 2 провижиненных дашборда (`vektor-super-analytics` — 10 панелей бизнес/кликстрима и `vektor-data-platform` — 9 панелей Polars/Airflow/Outbox).

## 3. Пять целевых Kafka / Redpanda топиков (Canonical Envelope v1)
1. `vektor.user.clickstream.v1` (`key: session_id`) — просмотры, фильтры, ползунок `10:00–20:00`, клики WA/TG/MAX.
2. `vektor.market.bids.v1` (`key: tutor_id`) — ставки `±100 ₽`, слоты календаря, ручные/авто поднятия (`4ч / 24ч`).
3. `vektor.payments.ledger.v1` (`key: user_id`) — депозиты, эскроу `frozen -> captured -> refunded`, выводы `>= 500 ₽` и НПД.
4. `vektor.study.attempts.v1` (`key: user_id`) — тесты ФИПИ и оценки сочинения Задания 27 (`К1–К10`).
5. `vektor.tutors.raw.v1` (`key: source_listing_id`) — сырые анкеты Ykt / TG / MAX.
