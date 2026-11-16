# Контекст: Обзор системы, экраны и карта 7 репозиториев

> [!NOTE]
> Полная карта команд запуска 7 репозиториев: [REPOSITORIES.md](../../REPOSITORIES.md). Бэклог будущих интеграций: [ROADMAP_UNCONNECTED.md](../../ROADMAP_UNCONNECTED.md).

## 1. Назначение «Вектор ЕГЭ»
Веб-платформа подготовки к **ЕГЭ-2027** (биология, химия, русский язык) с адаптивным банком заданий, тренажёром сочинения Задания 27, планом поступления и встроенным маркетплейсом репетиторов с механикой торга `±100 ₽` и часовыми окнами `10:00–20:00` (`UTC+9` Якутск ↔ `UTC+3` Москва).

## 2. Продуктовые режимы и экраны (`VIEWS` в `frontend/app.js`)
- **Публичные**:
  - `landing` (`/landing`) — hero с `/assets/lena-pillars.jpg`, калькулятор `±100 ₽`, витрина репетиторов, тарифы `0 / 5 000 / 10 000 ₽`, FAQ.
  - `brandbook` (`/brandbook`) — живая документация дизайн-системы (`27` карточек `EGE.kit.CATALOG_ITEMS`, `40` анимируемых иконок, `6` видов графиков, `dataTableHTML` с `5` пресетами, разделы `#bb-mask-trainer`, `#bb-payments`, `#bb-ui-kit-shells`, `#bb-telemetry-etl`, `#bb-admin-kit`, `#bb-arch-split`, `#bb-ege-timers`, `#bb-a11y`).
  - `fees` (`/fees`) — условия комиссии `5%` и порогов пополнения (`>= 5 000 ₽` первый платёж, от `100 ₽` далее); для преподавателя — раздел **«Выплаты»** с `#tc-payout-history`.
  - `/privacy` — статическая HTML-страница политики конфиденциальности на Light-токенах брендбука (`backend/shell.py`).
- **Ученик (`role="student"`, 5 пунктов меню + 3 предмета слева)**:
  - `tests`, `tutor` (офлайн-справочник), `market` (подбор, табличные заявки `#student-bookings-table` и `#student-leads-table`), `study` (`#study-schedule-table`, `#study-chats-table`), `stats`, плюс `subject`, `topic`, `quiz`, `essay`, `plan`, `profile`. Виджет баланса: слева снизу на desktop, справа в топбаре на mobile.
- **Преподаватель (`role="tutor"`, 7 пунктов меню desktop / 5 mobile)**:
  - `cabinet` (`requests` `#tc-requests-table` + бейдж `tc-jump-pending`, `calendar` с `.ics`/Google Calendar `UTC+9`/`UTC+3`, `students` `#tc-students-table` + маски WA/TG/MAX, `leads` `#tc-leads-table`, `profile`), `fees` (Выплаты), `tutor` (Справочник). Виджет баланса: `#tutor-balance-dock` (справа снизу, скрыт `< 900 px`) и `#top-balance-slot` (mobile) с кнопкой **«Вывести»** (СБП / Мир от `500 ₽` + НПД).
- **Админ-панель (`role="admin"`, `/admin`, `#admin`, пилюля `.side-admin-pill`)**:
  - 5 вкладок: `overview` (KPI GMV / 95% / 5% / Заявки / Outbox + графики + `adm-overview-users`), `requests` (`#adm-requests-table`), `tutors` (`#adm-tutors-table`), `payouts` (`#adm-payouts-table`), `system` (`7` `serviceBoundaryCardHTML`, `pipelineStageCardHTML`, лента `outbox.kafka_outbox`).

## 3. Карта 7 независимых репозиториев (`/Users/aleksej/Documents/my_projects/`)

| № | Репозиторий | Живой порт / Режим | Назначение |
|---|---|---|---|
| 1 | `Preparation` | `http://127.0.0.1:8770` | Основное SPA (`frontend/`) + UI Kit (`ux-ui/`) + композитный FastAPI (`backend/main.py`) + SQLite/PG17 Dual-Write (`databases/`). |
| 2 | `vektor-api` | `http://127.0.0.1:8771` | Чистый Headless FastAPI (`/api/*`, `/docs`, CORS, без HTML/CSS/UI-Kit). |
| 3 | `vektor-ui-kit` | `http://127.0.0.1:8772` | Независимая дизайн-система `@vektor-ege/ui-kit` и standalone `/brandbook` + `/preview/` (без API-вызовов). |
| 4 | `vektor-postgres` | `127.0.0.1:5432` | PostgreSQL 17.12 (`vektor_ege`, `airflow_meta`; схемы `oltp`, `bronze`, `silver`, `gold`, `telemetry`, `outbox`). Порт `55432` (PID `9188`) не трогать! |
| 5 | `vektor-polars-engine` | Bare-metal `arm64` CLI | Нативный движок Polars (`arm64`, 12 потоков) без Docker: ZSTD Parquet + синк витрин в PG17 (`~8–11.8M rows/sec`). |
| 6 | `vektor-airflow` | `http://127.0.0.1:8085` | Apache Airflow 3.4.0 (`api-server`, `scheduler`, `dag-processor`, `triggerer`), 3 DAG'а с логом в `gold.pipeline_runs`. |
| 7 | `vektor-grafana` | `http://127.0.0.1:3000` | Grafana 13.3.1 (`admin`/`admin`), datasource `vektor-postgres` и 2 дашборда (19 панелей). |

## 4. Команды проверки и запуска
```bash
# Полная проверка Preparation (macOS jsc + pytest + CRLF + поисковый движок):
/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc tests/check_app.js \
  && .venv/bin/pytest -q \
  && python3 -c 'b=open("frontend/app.js","rb").read(); assert b.count(b"\n")==b.count(b"\r\n"); print("CRLF_OK")'

# Живой сервер Preparation с PostgreSQL 17 Dual-Write:
DATABASE_URL="postgresql://postgres@127.0.0.1:5432/vektor_ege" DB_MODE="dual" \
  .venv/bin/uvicorn backend.main:app --host 127.0.0.1 --port 8770 --workers 1
```
