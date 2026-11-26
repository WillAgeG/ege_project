# Контекст: Обзор системы, экраны и карта 7 репозиториев

> [!NOTE]
> Полная карта команд запуска 7 репозиториев: [REPOSITORIES.md](../../REPOSITORIES.md). Бэклог будущих интеграций: [ROADMAP_UNCONNECTED.md](../../ROADMAP_UNCONNECTED.md). План запуска (`30.11.2026`, Якутск) и СБП-монетизация: [vektor_ege_pitch_300k_yakutsk.pdf](../../docs/business/vektor_ege_pitch_300k_yakutsk.pdf) и [vektor_ege_unit_economics_v2_sbp_low_fee.docx](../../docs/business/vektor_ege_unit_economics_v2_sbp_low_fee.docx).

## 1. Назначение «Вектор ЕГЭ»
Веб-платформа подготовки к **ЕГЭ-2027** (биология, химия, русский язык) с адаптивным банком заданий, тренажёром сочинения Задания 27, планом поступления и встроенным маркетплейсом репетиторов с механикой торга `±100 ₽` и часовыми окнами `10:00–20:00` (`UTC+9` Якутск ↔ `UTC+3` Москва).

## 2. Три сайта одного домена (`backend/shell.py` + `HOST_SITE` в `frontend/app.js`)
Платформа разделена на 3 отдельных входа одного домена `:8770` через `render_index_html(..., site, view)` (плюс `/` для обратной совместимости) и публичные маршруты:
- **Публичные**:
  - `landing` (`/landing`) — hero с `/assets/lena-pillars.jpg`, прямые ссылки на `/student` и `/tutor`, калькулятор `±100 ₽`, витрина репетиторов без платных подписок, СБП-эскроу, FAQ.
  - `brandbook` (`/brandbook`) — живая документация дизайн-системы (`27` карточек `EGE.kit.CATALOG_ITEMS`, `40` анимируемых иконок, `6` видов графиков, `multiLineChartHTML` до `20` линий × `30+` точек, `dataTableHTML` `1–15` колонок с `showColsSwitch: true` и `5` пресетами, разделы `#bb-mask-trainer` .. `#bb-a11y`).
  - `fees` (`/fees`, `site="tutor", view="fees"`) — условия СБП (`>= 990 ₽` первый платёж на уроки / `390 ₽` ИИ-Старт, от `100 ₽` далее), формула `95%/5%` (`8%` мини-группы) и «Выплаты» с `#tc-payout-history`.
  - `/privacy` — статическая HTML-страница политики конфиденциальности на Light-токенах (`backend/shell.py`).
- **Сайт Ученика (`/student` + `/`, `role="student"`, 5 пунктов меню + 3 предмета)**:
  - `tests`, `tutor`, `market` (`#student-bookings-table`, `#student-leads-table`), `study` (`#study-schedule-table`, `#study-chats-table`), `stats`, `subject`, `topic`, `quiz`, `essay`, `plan`, `profile`. Виджет баланса: `#side-balance-slot` (desktop) / `#top-balance-slot` (mobile).
- **Сайт Преподавателя (`/tutor`, `/teacher`, `/cabinet`, `role="tutor"`)**:
  - `cabinet` (`requests` 5-кол. `#tc-requests-table`, чистый `calendar` 10:00–20:00 + модалка `tc-cal-import-modal`, 5-кол. `students` `#tc-students-table` с WA/TG/MAX, `leads` `#tc-leads-table` с контр-ценой `±100 ₽`, `profile` с единственным блоком «Поднять анкету»), `fees`, `tutor`. Баланс: `#side-balance-slot` слева снизу (`EGE.kit.sideTutorBalanceHTML`, `#tutor-balance-dock` отключён) и `#top-balance-slot` (mobile) с кнопкой **«Вывести»**.
- **Админ-панель (`/admin`, `role="admin"`, `#admin`)**:
  - 5 вкладок: `overview` (KPI GMV / 95% / 5% / Заявки / Outbox + 7-дневный `combo`-график + русифицированный 5-кол. `#adm-overview-users`), `requests` (`#adm-requests-table`), `tutors` (`#adm-tutors-table`), `payouts` (`#adm-payouts-table`), `system` (`serviceBoundaryCardHTML`, `pipelineStageCardHTML`, `outbox.kafka_outbox`).

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
