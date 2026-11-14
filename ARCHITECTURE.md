# Архитектура проекта «Вектор ЕГЭ»

> **Коротко:** Проект разделён на **5 независимых доменных слоёв** в корне репозитория — `ux-ui/`, `frontend/`, `backend/`, `databases/`, `etl/` — чтобы дизайн-система, клиентский стек, HTTP API, базы данных и будущие Big Data / Polars / Sales-пайплайны не смешивались друг с другом и масштабировались раздельно.

---

## 1. Доменные слои: что где лежит и почему

| Слой | Папка / ключевые файлы | Технологический стек | Зачем вынесено отдельно |
| :--- | :--- | :--- | :--- |
| **1. UX/UI** | [`ux-ui/`](ux-ui/README.md) · [`tokens.json`](ux-ui/tokens.json) · [`styles/`](ux-ui/styles) · [`components/`](ux-ui/components) · [`brandbook/`](ux-ui/brandbook) | CSS Tokens (`#0070FF` / OLED `#000`), Inter / IBM Plex Mono, SVG-система (36 иконок), `@keyframes` анимации | Единый контракт визуала в стиле **hh.ru**: цвета, границы кнопок/ползунков, прочерки цен и интерактивный стенд `/brandbook` + `/fees` живут отдельно от логики тренажёра. |
| **2. Frontend** | [`frontend/`](frontend/README.md) · [`index.html`](frontend/index.html) · [`app.js`](frontend/app.js) · [`core/`](frontend/core) · [`views/`](frontend/views) · [`styles/`](frontend/styles) · [`data/`](frontend/data) · [`subjects/`](frontend/subjects) | Zero-bundler SPA (HTML5 / CSS3 / ES6+ IIFE под `EGE`), `localStorage` + REST API, `@container` адаптив | Мгновенная загрузка в браузере и тестирование через `node` / `jsc` без Webpack/Vite; контент банка заданий (40 файлов) и экраны лендинга/маркетплейса изолированы от сервера. |
| **3. Backend** | [`backend/`](backend/README.md) · [`main.py`](backend/main.py) · [`config.py`](backend/config.py) · [`ai.py`](backend/ai.py) | Python 3.13, FastAPI, Uvicorn (`--workers 1`), `httpx`, Google OAuth 2.0 (PKCE) | Лёгкий ASGI-сервер для SPA-роутов, `/api/auth/*`, `/api/docs/*`, SSE ИИ-прокси и безопасного `static_assets` allowlist без зависимостей от тяжёлых data-библиотек. |
| **4. Databases** | [`databases/`](databases/README.md) · [`sqlite/store.py`](databases/sqlite/store.py) · [`migrations/001_initial_sqlite.sql`](databases/migrations/001_initial_sqlite.sql) · [`analytics/`](databases/analytics) | **SQLite WAL** (в проде сейчас) · **DuckDB / PostgreSQL** (задел для роста OLTP и OLAP) | HTTP-роуты не знают деталей SQL: вся работа с пользователями, сессиями, OAuth и документами инкапсулирована в [`databases/sqlite/store.py`](databases/sqlite/store.py). |
| **5. ETL & Big Data** | [`etl/`](etl/README.md) · [`sources/`](etl/sources) · [`pipelines/`](etl/pipelines) · [`sales/`](etl/sales) · [`warehouse/`](etl/warehouse) · [`requirements-etl.txt`](etl/requirements-etl.txt) | **Polars (`LazyFrame`)**, PyArrow / Parquet (Medallion `bronze → silver → gold`), DuckDB | Парсинг анкет из **Доски Ykt, Telegram, WhatsApp, MAX**, очистка/дедупликация на Polars и расчёт **Sales-аналитики** (GMV, 5% сбор, воронка тарифов) вынесены из web-образа Docker. |

---

## 2. Поток данных и HTTP-маршрутизация

```text
Браузер
  ├── GET /, /landing, /brandbook, /fees ──► backend/main.py ──► frontend/index.html (+ EGE_HOST)
  ├── GET /ux-ui/{styles,components,brandbook}/* ──► ux-ui/... (строгий allowlist)
  ├── GET /app.js, /styles/*, /core/*, /views/*, /data/*, /subjects/* ──► frontend/...
  └── POST/GET /api/* ──► backend/main.py ──► databases/sqlite/store.py (SQLite WAL)

Аналитика (вне web-рантайма)
  Источники (Доска Ykt / TG / WA / MAX)
     └──► etl/sources/ykt_tg_max_schema.py
            └──► warehouse/bronze/
                   └──► etl/pipelines/tutors_polars_pipeline.py (Polars LazyFrame)
                          └──► warehouse/silver/ ──► warehouse/gold/*.parquet
                                                        └──► etl/sales/sales_metrics.py & databases/analytics/
```

Обращения к `/backend/*`, `/databases/*`, `/etl/*`, `/tools/*`, `/.env` и path traversal `../` через HTTP жёстко режутся статусом `404` в [`backend/main.py`](backend/main.py).

---

## 3. Важные инварианты (что нельзя ломать при правках)

1. **Порядок `<script>` в [`frontend/index.html`](frontend/index.html):** все модули (`subjects/*`, `data/*`, `bank-core.js`, `core/*`, `ux-ui/*`, `views/*`) обязаны подключаться **до** `<script src="app.js"></script>`. Это проверяют [`tests/check_app.js`](tests/check_app.js) и точка инжекции `window.EGE_HOST` в [`backend/main.py`](backend/main.py).
2. **CRLF в [`frontend/app.js`](frontend/app.js):** `tests/check_app.js` проверяет окончания строк CRLF в `frontend/app.js`.
3. **Allowlist и [`Dockerfile`](Dockerfile) при добавлении директорий:** новые папки клиентской статики должны синхронно добавляться в [`backend/main.py`](backend/main.py), [`Dockerfile`](Dockerfile) (`COPY ...`) и [`tests/test_server.py`](tests/test_server.py).
4. **Инварианты дизайн-системы ([`ux-ui/tokens.json`](ux-ui/tokens.json)):**
   - В inline `<style>` внутри [`frontend/index.html`](frontend/index.html) остаются `--accent: #0070ff` (Light) и `--accent: #1d7bff` (Dark) без `#13794b`.
   - Уведомления строго оранжевые (`#F97316` / `#FB923C`), профи-ставка выше рынка — фиолетовая (`#7C3AED` / `#A78BFA`), зелёный (`#16A34A` / `#22C55E`) — только статус «Подтверждено» после клика по CTA.
   - Системный сбор `5%` скрыт от ученика на карточке подбора и открывается отдельно на `/fees` (и в [`etl/sales/sales_metrics.py`](etl/sales/sales_metrics.py)).
5. **Безопасный JS без вложенных backticks:** внутри template literals не используйте символ `` ` `` (заменяйте на `<code>...</code>` в HTML).

---

## 4. Команды проверки

```bash
# Python: бэкенд, SQLite-слой, ETL (Polars/fallback) и Sales-метрики
.venv/bin/pytest -v

# Frontend & банк заданий: без сборщика, в Node.js или JavaScriptCore на macOS
node tests/check_app.js
# или:
/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/check_app.js
```
