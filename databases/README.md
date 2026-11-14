# Databases — Слой баз данных и миграций «Вектор ЕГЭ»

Здесь изолированы операционные и аналитические хранилища данных проекта.

## Текущее и целевое разделение

| Папка / файл | Статус | Назначение |
| :--- | :--- | :--- |
| [`sqlite/store.py`](sqlite/store.py) | **В проде** | Операционное WAL-хранилище **SQLite**: пользователи (`users`), OAuth-привязки (`user_identities`, `oauth_states`), cookie-сессии (`sessions`) и JSON-документы прогресса учеников (`docs`). |
| [`migrations/001_initial_sqlite.sql`](migrations/001_initial_sqlite.sql) | **Актуально** | Декларативная SQL-схема всех таблиц SQLite и индексов, синхронизированная с `sqlite/store.py`. |
| [`analytics/`](analytics) | **Задел под Big Data** | Локальное/облачное аналитическое хранилище (**DuckDB** поверх Parquet-витрин `etl/warehouse/gold/` и будущий коннектор **PostgreSQL** при масштабировании OLTP). |

## Принципы работы со слоем БД

1. Никаких прямых `sqlite3.connect(...)` внутри `backend/main.py` — HTTP-роуты вызывают методы класса `Database` из [`databases/sqlite/store.py`](sqlite/store.py).
2. При переезде на PostgreSQL / ClickHouse / DuckDB достаточно реализовать совместимый интерфейс репозитория внутри `databases/` без переписывания эндпоинтов.
3. Файлы баз данных (`.db`, `.duckdb`, `.wal`) не коммитятся в Git (добавлены в `.gitignore`).
