# Вектор ЕГЭ

Платформа подготовки к ЕГЭ-2027 (биология, русский язык, химия с интервальным повторением, пробниками, проверкой сочинений и ИИ-тьютором) и маркетплейс репетиторов в стиле **hh.ru** со ставкой ученика («Предложить цену»), расписанием `10:00–20:00`, живым брендбуком `/brandbook` и выделенным контуром под **Polars / Big Data / Sales ETL**.

## Структура проекта (5 слоёв)

> Подробная схема зависимостей и правил — в [ARCHITECTURE.md](ARCHITECTURE.md) и в `README.md` каждого слоя.

- **[`ux-ui/`](ux-ui/README.md)** — дизайн-система и брендбук (`/brandbook`, `/fees`): токены [`tokens.json`](ux-ui/tokens.json), базовые стили и брендбук-стенд [`ux-ui/styles/`](ux-ui/styles), **36 анимированных SVG-иконок** [`ux-ui/components/icons.js`](ux-ui/components/icons.js) и переиспользуемые hh-компоненты [`ux-ui/components/hh-components.js`](ux-ui/components/hh-components.js).
- **[`frontend/`](frontend/README.md)** — клиентский zero-bundler стек (HTML5 / CSS3 / ES6+ IIFE): [`index.html`](frontend/index.html), оркестратор [`app.js`](frontend/app.js), [`bank-core.js`](frontend/bank-core.js), утилиты [`core/utils.js`](frontend/core/utils.js), экраны [`views/`](frontend/views), каталог репетиторов [`data/tutors.js`](frontend/data/tutors.js) и банк заданий [`subjects/`](frontend/subjects) (40 файлов).
- **[`backend/`](backend/README.md)** — FastAPI ASGI-бэкенд: [`main.py`](backend/main.py) (SPA-роуты `/`, `/landing`, `/brandbook`, `/fees`, `/privacy`, API `/api/*`, безопасный allowlist статики), [`config.py`](backend/config.py) и ИИ-прокси [`ai.py`](backend/ai.py).
- **[`databases/`](databases/README.md)** — слой хранения данных: операционная БД SQLite WAL [`sqlite/store.py`](databases/sqlite/store.py), SQL-миграция [`migrations/001_initial_sqlite.sql`](databases/migrations/001_initial_sqlite.sql) и каталог аналитического хранилища [`analytics/`](databases/analytics) (задел под DuckDB / PostgreSQL).
- **[`etl/`](etl/README.md)** — Big Data, **Polars (`LazyFrame`)**, источники и **Sales-аналитика**: контракты парсинга Доски Ykt / Telegram / WhatsApp / MAX [`sources/ykt_tg_max_schema.py`](etl/sources/ykt_tg_max_schema.py), Medallion-пайплайн [`pipelines/tutors_polars_pipeline.py`](etl/pipelines/tutors_polars_pipeline.py), расчёт GMV / комиссии `5%` / выплат `95%` [`sales/sales_metrics.py`](etl/sales/sales_metrics.py), озеро [`warehouse/`](etl/warehouse) (`bronze/` → `silver/` → `gold/`) и отдельные зависимости [`requirements-etl.txt`](etl/requirements-etl.txt).
- **[`tests/`](tests)** — `test_server.py` (FastAPI + SQLite + безопасность статики), `test_etl.py` (Polars/Medallion + Sales + токены UX/UI) и `check_app.js` (полный дымовой прогон банка заданий, лендинга, маркетплейса, `/brandbook` и `/fees`).
- **[`tools/`](tools)** и **[`bank/`](bank)** — локальный редактор банка заданий [`tools/bank.html`](tools/bank.html) + CSV-выгрузка (в продакшен-образ Docker не попадают).

## Быстрый старт и тесты

### 1. Web-стек (Backend + Frontend + SQLite)

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt pytest
cp .env.example .env   # опционально: ключ ИИ-провайдера и Google OAuth
.venv/bin/uvicorn backend.main:app --reload
```

Приложение откроется на `http://127.0.0.1:8000/`. Прогон всех тестов:

```bash
.venv/bin/pytest -v
node tests/check_app.js   # на macOS также: /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/check_app.js
```

### 2. Статический просмотр и редактор банка CSV

```bash
python3 .claude/serve.py
# http://localhost:8765/                — сайт
# http://localhost:8765/tools/bank.html — проверка банка и экспорт в bank/bank.csv
```

### 3. Data Engineering / ETL-контур (Polars + Parquet + DuckDB)

Зависимости аналитики изолированы в [`etl/requirements-etl.txt`](etl/requirements-etl.txt), чтобы контейнер сайта оставался быстрым и компактным:

```bash
python3 -m venv .venv-etl
.venv-etl/bin/pip install -r etl/requirements-etl.txt pytest
.venv-etl/bin/pytest -v tests/test_etl.py
```

## Где хранится прогресс ученика (OLTP)

В [`databases/sqlite/store.py`](databases/sqlite/store.py) (и зеркально в `localStorage` при оффлайн-работе) по документам:

| Документ | Что внутри |
|---|---|
| `profile` | имя, целевые баллы, даты экзаменов |
| `prog-bio`, `prog-rus`, `prog-chem` | статистика ответов по вопросам и отметки прочитанных конспектов |
| `plan` | отметки плана поступления и пользовательские задачи |
| `mocks` | пробные варианты |
| `essays` | сохранённые сочинения и баллы ИИ К1–К10 |
| `log-ГГГГ-ММ` | учебный журнал занятий |

## Деплой на Railway и CI/CD

- [`Dockerfile`](Dockerfile) собирает тонкий образ (Python 3.13 + `ux-ui/`, `frontend/`, `backend/`, `databases/`), запуская `uvicorn backend.main:app --workers 1` с постоянным томом `RAILWAY_VOLUME_MOUNT_PATH` для SQLite.
- [`.github/workflows/ci.yml`](.github/workflows/ci.yml) на каждом push / PR запускает `pytest -q` и `node tests/check_app.js`.
- Настройки ИИ (`GEMINI_API_KEY` / `OPENAI_API_KEY` / `ANTHROPIC_API_KEY` / `OPENROUTER_API_KEY`), `INVITE_CODE` и `GOOGLE_CLIENT_*` задаются в Railway Variables (см. [`.env.example`](.env.example)).
