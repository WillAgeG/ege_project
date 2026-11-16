# Контекст: Базы данных SQLite WAL и PostgreSQL 17 Dual-Write (`databases/` и `vektor-postgres`)

> [!CAUTION]
> Порт `127.0.0.1:55432` (PID `9188`) принадлежит другому проекту — **никогда** не останавливайте и не подключайтесь к нему. Наш PostgreSQL 17 работает на `127.0.0.1:5432` (`vektor_ege`, `airflow_meta`).

## 1. Архитектура хранилища и Dual-Write
Фабрика `create_store(settings)` в `databases/postgres/store.py`:
- Без `DATABASE_URL` или `DB_MODE=sqlite` → `Database(settings.db_path)` (автономный **SQLite 3 WAL**, `synchronous=NORMAL`, `foreign_keys=ON`, `busy_timeout=5000`, `threading.RLock`).
- `DB_MODE=dual` (или `auto` с заданным `DATABASE_URL`) → `DualWriteDatabase(sqlite_db, pg_db)`: синхронная запись в SQLite и в PostgreSQL 17 через `psycopg_pool.ConnectionPool`, с сопоставлением пользователей по `username_lower` (без коллизии `id=1` с сидированными записями PG17, `oltp.users_id_seq >= 100`).
- `DB_MODE=postgres` → чистый `PostgresDatabase`.

## 2. Таблицы SQLite ([databases/sqlite/store.py](../../databases/sqlite/store.py) и [001_initial_sqlite.sql](../../databases/migrations/001_initial_sqlite.sql))
- **Core Auth & Docs**: `users` (+ колонка `role`: `student | tutor | admin`), `user_identities` (`provider, provider_subject`), `oauth_states`, `sessions` (SHA-256 `token_hash`), `docs` (`(user_id, name)` → JSON).
- **Разрешённые документы `DOC_NAME_RE`**: `^(profile|plan|mocks|essays|tutor-cabinet|calendar-sync|prog-[a-z]+|log-\d{4}-\d{2})$`.
- **Calendar & Realtime**: `calendar_sync_tokens`, `calendar_events`, `realtime_notifications`.
- **Admin Local Mirror**: `admin_tutors`, `admin_lesson_requests`, `admin_payout_requests`, `admin_outbox_events` (автосид при пустых таблицах).

## 3. Схемы PostgreSQL 17 ([databases/postgres/store.py](../../databases/postgres/store.py) и `vektor-postgres/migrations/001..005`)
1. `oltp.*`: `users`, `user_identities`, `oauth_states`, `sessions`, `docs` (`JSONB`), `tutors` (`verified`, `bumped_today`), `tutor_slots`, `lesson_requests`, `escrow_holds` (`95%/5%`: `frozen`/`captured`/`refunded`), `payout_requests` (`method IN ('sbp','card')`, `>= 500`), `calendar_sync_tokens`, `calendar_events`, `realtime_notifications`.
2. `telemetry.user_events`: сырые события кликстрима (`view`, `filter`, `slider_move`, `bid_offer`, `messenger_click`, `quiz_attempt`, `payment_topup`).
3. `outbox.kafka_outbox`: транзакционный аутбокс (**Canonical Event Envelope v1**, `schema_version: "1.0.0"`, поля `event_id`, `event_type`, `occurred_at`, `user_id`, `session_id`, `role`, `view`, `payload` JSONB). Каждая мутация пользователей, `docs`, календаря, realtime и `admin_*` пишется сюда в той же транзакции PG.
4. `bronze.*`, `silver.*`, `gold.*`: Medallion-слой (`tutors_raw`, `tutors_dedup`, `subject_price_mart`, `daily_gmv_metrics`, `clickstream_funnel`, `engine_benchmarks`, `pipeline_runs`).

## 4. Общие методы репозитория (SQLite, PG, DualWrite)
- `ping()`, `storage_health()`
- Auth/Docs: `create_user`, `authenticate`, `create_oauth_state`, `consume_oauth_state`, `upsert_oauth_user`, `create_session`, `get_user_by_token`, `delete_session`, `get_docs`, `patch_doc`, `replace_doc`
- Calendar/Realtime: `upsert_calendar_sync`, `get_calendar_by_token`, `get_calendar_by_slug`, `record_realtime_event`, `list_realtime_events`
- Admin: `admin_overview`, `admin_list_users`, `admin_set_user_role`, `admin_list_tutors`, `admin_moderate_tutor`, `admin_list_requests`, `admin_set_request_status`, `admin_list_payouts`, `admin_set_payout_status`, `admin_list_outbox`
