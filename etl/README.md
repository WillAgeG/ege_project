# ETL, Big Data, Polars и Sales-аналитика «Вектор ЕГЭ»

Отдельный data-engineering слой проекта для обработки больших потоков анкет репетиторов, аукционных ставок и метрик продаж **независимо от web-бэкенда**.

## Стек и архитектура хранения (Medallion)

1. **`warehouse/bronze/`** — сырые выгрузки (JSONL/Parquet) из каналов поиска: **Доска Ykt**, **Telegram**, **WhatsApp**, **MAX** и другие доски объявлений.
2. **`warehouse/silver/`** — очищенные, нормализованные и дедуплицированные анкеты репетиторов (`10:00–20:00`, предмет, рыночная vs предложенная ставка, флаг квалификации выше/ниже рынка).
3. **`warehouse/gold/`** — агрегированные аналитические Parquet-витрины: медианы цен по предметам, конверсия воронки «предложить цену → подтверждено», unit-экономика и GMV.

## Структура `etl/`

| Путь | Назначение |
| :--- | :--- |
| [`requirements-etl.txt`](requirements-etl.txt) | Отдельные зависимости аналитики (`polars`, `pyarrow`, `duckdb`), чтобы не утяжелять Docker-образ основного FastAPI-сайта. |
| [`sources/ykt_tg_max_schema.py`](sources/ykt_tg_max_schema.py) | Схема и нормализатор сырых анкет из источников `doska_ykt`, `telegram`, `whatsapp`, `max`, валидация почасовых слотов (`10:00–20:00`). |
| [`pipelines/tutors_polars_pipeline.py`](pipelines/tutors_polars_pipeline.py) | Пайплайн `Bronze -> Silver -> Gold` на базе ленивых вычислений **Polars (`LazyFrame`)** с безопасным zero-dep fallback на чистом Python. |
| [`sales/sales_metrics.py`](sales/sales_metrics.py) | Расчёт **Sales / Unit Economics**: GMV, системный сбор `5%` / выплата преподавателю `95%` (`commission_split`), средний чек и разбивка по тарифам (`0 / 5 000 / 10 000 ₽`). |
| [`warehouse/`](warehouse) | Локальное озеро данных `bronze/` → `silver/` → `gold/` (`.parquet`-артефакты игнорируются в `.gitignore`). |

## Установка и запуск ETL-окружения

```bash
python3 -m venv .venv-etl
.venv-etl/bin/pip install -r etl/requirements-etl.txt pytest
.venv-etl/bin/pytest -v tests/test_etl.py
```
