"""Схема таблиц, healthcheck и начальное наполнение SQLite-хранилища."""

import json
import time
from typing import Any

from .common import _iso_utc_now, calc_fee_split


class SqliteSchemaMixin:
    def _init_schema(self) -> None:
        now = int(time.time())
        with self._lock:
            self._conn.execute("PRAGMA journal_mode=WAL;")
            self._conn.execute("PRAGMA synchronous=NORMAL;")
            self._conn.execute("PRAGMA foreign_keys=ON;")
            self._conn.execute("PRAGMA busy_timeout=5000;")
            self._conn.executescript(
                """
                CREATE TABLE IF NOT EXISTS users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    username_lower TEXT NOT NULL UNIQUE,
                    password_hash TEXT NOT NULL DEFAULT '',
                    display_name TEXT NOT NULL DEFAULT '',
                    email TEXT,
                    email_lower TEXT,
                    avatar_url TEXT,
                    auth_provider TEXT NOT NULL DEFAULT 'local',
                    role TEXT NOT NULL DEFAULT 'student',
                    created_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS user_identities (
                    provider TEXT NOT NULL,
                    provider_subject TEXT NOT NULL,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    email TEXT,
                    created_at INTEGER NOT NULL,
                    PRIMARY KEY (provider, provider_subject)
                );
                CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id);
                CREATE TABLE IF NOT EXISTS oauth_states (
                    state_hash TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    code_verifier TEXT NOT NULL,
                    redirect_uri TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE TABLE IF NOT EXISTS sessions (
                    token_hash TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
                CREATE TABLE IF NOT EXISTS docs (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    name TEXT NOT NULL,
                    data TEXT NOT NULL,
                    updated_at INTEGER NOT NULL,
                    PRIMARY KEY (user_id, name)
                );
                CREATE TABLE IF NOT EXISTS calendar_sync_tokens (
                    feed_token TEXT PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    tutor_slug TEXT NOT NULL UNIQUE,
                    tutor_name TEXT NOT NULL DEFAULT 'Преподаватель Вектор ЕГЭ',
                    city TEXT NOT NULL DEFAULT 'Якутск',
                    timezone TEXT NOT NULL DEFAULT 'UTC+9' CHECK (timezone IN ('UTC+9', 'UTC+3')),
                    external_ics_url TEXT,
                    gcal_connected INTEGER NOT NULL DEFAULT 0,
                    open_slots TEXT NOT NULL DEFAULT '{}',
                    busy_slots TEXT NOT NULL DEFAULT '[]',
                    last_synced_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS calendar_events (
                    uid TEXT PRIMARY KEY,
                    tutor_slug TEXT NOT NULL,
                    student_name TEXT NOT NULL DEFAULT '',
                    subject TEXT NOT NULL DEFAULT 'bio',
                    exam TEXT NOT NULL DEFAULT 'ЕГЭ',
                    dow INTEGER NOT NULL CHECK (dow BETWEEN 0 AND 6),
                    slot_date TEXT NOT NULL,
                    hour_slot TEXT NOT NULL,
                    duration_min INTEGER NOT NULL DEFAULT 60,
                    timezone TEXT NOT NULL DEFAULT 'UTC+9',
                    price_rub INTEGER NOT NULL DEFAULT 0,
                    status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'pending', 'external_busy', 'cancelled')),
                    source TEXT NOT NULL DEFAULT 'vektor' CHECK (source IN ('vektor', 'gcal_ics', 'manual')),
                    note TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_calendar_events_tutor_date
                    ON calendar_events(tutor_slug, slot_date, hour_slot);
                CREATE TABLE IF NOT EXISTS realtime_notifications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    event_id TEXT NOT NULL UNIQUE,
                    channel TEXT NOT NULL DEFAULT 'tutor',
                    tutor_slug TEXT,
                    event_type TEXT NOT NULL,
                    title TEXT NOT NULL,
                    message TEXT NOT NULL DEFAULT '',
                    payload TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_realtime_notifications_channel_id
                    ON realtime_notifications(channel, id DESC);
                CREATE TABLE IF NOT EXISTS admin_tutors (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    full_name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    city TEXT NOT NULL,
                    timezone TEXT NOT NULL,
                    base_rate_rub INTEGER NOT NULL,
                    market_rate_rub INTEGER NOT NULL,
                    source_channel TEXT NOT NULL,
                    tariff_id TEXT NOT NULL,
                    whatsapp_phone TEXT NOT NULL DEFAULT '',
                    telegram_handle TEXT NOT NULL DEFAULT '',
                    max_handle TEXT NOT NULL DEFAULT '',
                    has_photo INTEGER NOT NULL DEFAULT 1,
                    verified INTEGER NOT NULL DEFAULT 1,
                    bumped_today INTEGER NOT NULL DEFAULT 0,
                    rating REAL NOT NULL DEFAULT 4.9,
                    reviews_count INTEGER NOT NULL DEFAULT 0,
                    last_bumped_at TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS admin_lesson_requests (
                    id TEXT PRIMARY KEY,
                    tutor_id TEXT NOT NULL,
                    tutor_name TEXT NOT NULL DEFAULT '',
                    student_user_id INTEGER,
                    student_name TEXT NOT NULL,
                    subject TEXT NOT NULL,
                    city TEXT NOT NULL,
                    timezone TEXT NOT NULL,
                    slot_date TEXT NOT NULL,
                    hour_slot TEXT NOT NULL,
                    tariff_id TEXT NOT NULL,
                    offer_price_rub INTEGER NOT NULL,
                    counter_price_rub INTEGER,
                    final_price_rub INTEGER,
                    status TEXT NOT NULL,
                    escrow_status TEXT NOT NULL DEFAULT 'none',
                    messenger_channel TEXT NOT NULL DEFAULT 'whatsapp',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS admin_payout_requests (
                    id TEXT PRIMARY KEY,
                    tutor_id TEXT NOT NULL,
                    tutor_name TEXT NOT NULL DEFAULT '',
                    method TEXT NOT NULL,
                    amount_rub INTEGER NOT NULL,
                    npd_receipt TEXT,
                    bank TEXT NOT NULL DEFAULT '',
                    destination_masked TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    paid_at TEXT
                );
                CREATE TABLE IF NOT EXISTS admin_outbox_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    topic TEXT NOT NULL,
                    partition_key TEXT NOT NULL,
                    event_type TEXT NOT NULL,
                    payload TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    published_at TEXT
                );
                CREATE TABLE IF NOT EXISTS escrow_holds (
                    id TEXT PRIMARY KEY,
                    request_id TEXT NOT NULL UNIQUE,
                    tutor_id TEXT NOT NULL,
                    student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    gross_rub INTEGER NOT NULL CHECK (gross_rub > 0),
                    platform_fee_rub INTEGER NOT NULL CHECK (platform_fee_rub >= 0),
                    tutor_payout_rub INTEGER NOT NULL CHECK (tutor_payout_rub >= 0),
                    status TEXT NOT NULL CHECK (status IN ('frozen', 'captured', 'refunded')),
                    created_at TEXT NOT NULL,
                    settled_at TEXT
                );
                CREATE TABLE IF NOT EXISTS wallets (
                    user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                    balance_rub INTEGER NOT NULL DEFAULT 0 CHECK (balance_rub >= 0),
                    initial_paid INTEGER NOT NULL DEFAULT 0,
                    plan_id TEXT NOT NULL DEFAULT 'trial5k',
                    saved_cards_json TEXT NOT NULL DEFAULT '[]',
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS wallet_ledger (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    kind TEXT NOT NULL,
                    amount_rub INTEGER NOT NULL,
                    balance_after_rub INTEGER NOT NULL CHECK (balance_after_rub >= 0),
                    fee_rub INTEGER NOT NULL DEFAULT 0,
                    method TEXT NOT NULL DEFAULT '',
                    ref_type TEXT NOT NULL DEFAULT '',
                    ref_id TEXT NOT NULL DEFAULT '',
                    note TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL
                );
                CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user
                    ON wallet_ledger(user_id, id DESC);
                CREATE TABLE IF NOT EXISTS student_leads (
                    id TEXT PRIMARY KEY,
                    student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                    student_name TEXT NOT NULL,
                    subjects_json TEXT NOT NULL DEFAULT '["bio"]',
                    exam TEXT NOT NULL DEFAULT 'ЕГЭ',
                    format TEXT NOT NULL DEFAULT 'Онлайн',
                    target_price_rub INTEGER NOT NULL CHECK (target_price_rub >= 0),
                    whatsapp TEXT NOT NULL DEFAULT '',
                    whatsapp_country TEXT NOT NULL DEFAULT 'RU',
                    comment TEXT NOT NULL DEFAULT '',
                    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'closed')),
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS tutor_contact_overrides (
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    tutor_id TEXT NOT NULL,
                    whatsapp TEXT NOT NULL DEFAULT '',
                    telegram TEXT NOT NULL DEFAULT '',
                    max_handle TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (user_id, tutor_id)
                );
                """
            )
            existing_cols = {
                str(r["name"]) for r in self._conn.execute("PRAGMA table_info(users)").fetchall()
            }
            migrations = (
                ("display_name", "TEXT NOT NULL DEFAULT ''"),
                ("email", "TEXT"),
                ("email_lower", "TEXT"),
                ("avatar_url", "TEXT"),
                ("auth_provider", "TEXT NOT NULL DEFAULT 'local'"),
                ("role", "TEXT NOT NULL DEFAULT 'student'"),
                ("phone", "TEXT NOT NULL DEFAULT ''"),
                ("phone_country", "TEXT NOT NULL DEFAULT 'RU'"),
                ("city", "TEXT NOT NULL DEFAULT ''"),
                ("grade", "TEXT NOT NULL DEFAULT ''"),
                ("goal", "TEXT NOT NULL DEFAULT ''"),
                ("contact_verified", "INTEGER NOT NULL DEFAULT 0"),
            )
            for col_name, col_def in migrations:
                if col_name not in existing_cols:
                    self._conn.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}")

            tutor_cols = {
                str(r["name"]) for r in self._conn.execute("PRAGMA table_info(admin_tutors)").fetchall()
            }
            for col_name, col_def in (
                ("photo_url", "TEXT NOT NULL DEFAULT ''"),
                ("headline", "TEXT NOT NULL DEFAULT ''"),
                ("bio", "TEXT NOT NULL DEFAULT ''"),
                ("education", "TEXT NOT NULL DEFAULT ''"),
                ("exp_years", "INTEGER NOT NULL DEFAULT 3"),
                ("avg_score", "INTEGER NOT NULL DEFAULT 85"),
                ("subjects_json", "TEXT NOT NULL DEFAULT '[]'"),
                ("exams_json", 'TEXT NOT NULL DEFAULT \'["ЕГЭ"]\''),
                ("formats_json", 'TEXT NOT NULL DEFAULT \'["Онлайн"]\''),
                ("custom_skills", "TEXT NOT NULL DEFAULT ''"),
                ("first_lesson_guarantee", "INTEGER NOT NULL DEFAULT 1"),
            ):
                if col_name not in tutor_cols:
                    self._conn.execute(f"ALTER TABLE admin_tutors ADD COLUMN {col_name} {col_def}")

            req_cols = {
                str(r["name"]) for r in self._conn.execute("PRAGMA table_info(admin_lesson_requests)").fetchall()
            }
            for col_name, col_def in (
                ("exam", "TEXT NOT NULL DEFAULT 'ЕГЭ'"),
                ("format", "TEXT NOT NULL DEFAULT 'Онлайн'"),
                ("note", "TEXT NOT NULL DEFAULT ''"),
                ("telemost_url", "TEXT NOT NULL DEFAULT ''"),
                ("schedule_plan_json", "TEXT"),
                ("dows_json", "TEXT NOT NULL DEFAULT '[]'"),
                ("day_label", "TEXT NOT NULL DEFAULT ''"),
                ("tutor_price_rub", "INTEGER"),
                ("first_lesson_guarantee", "INTEGER NOT NULL DEFAULT 1"),
                ("reserved_rub", "INTEGER NOT NULL DEFAULT 0"),
            ):
                if col_name not in req_cols:
                    self._conn.execute(f"ALTER TABLE admin_lesson_requests ADD COLUMN {col_name} {col_def}")
            self._conn.execute(
                """
                CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
                ON users(email_lower)
                WHERE email_lower IS NOT NULL AND email_lower != ''
                """
            )
            self._conn.execute(
                """
                INSERT OR IGNORE INTO user_identities (provider, provider_subject, user_id, email, created_at)
                SELECT 'local', username_lower, id, email, created_at FROM users WHERE password_hash != ''
                """
            )
            self._conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now,))
            self._conn.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (now,))
            self._seed_admin_tables()
            self._conn.commit()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def ping(self) -> None:
        with self._lock:
            self._conn.execute("SELECT 1").fetchone()

    def storage_health(self) -> dict[str, Any]:
        self.ping()
        return {
            "ok": True,
            "mode": "sqlite",
            "sqlite": "ok",
            "postgres": "disabled",
            "outboxPending": 0,
        }

    def _seed_admin_tables(self) -> None:
        now_iso = _iso_utc_now()
        tutors_count = int(self._conn.execute("SELECT COUNT(*) FROM admin_tutors").fetchone()[0])
        if tutors_count == 0:
            seed_tutors = (
                ("tut-ykt-bio-1", None, "Саргылана Петрова", "Биология", "Якутск", "UTC+9", 1100, 1400, "doska_ykt", "trial5k", "+79142701122", "@sargylana_bio", "+79142701122", 1, 1, 1, 4.95, 42, now_iso, now_iso, now_iso),
                ("tut-ykt-bio-2", None, "Ньургун Иванов", "Биология", "Якутск", "UTC+9", 1000, 1400, "whatsapp", "free", "+79241653344", "@nyurgun_ege", "+79241653344", 0, 0, 0, 4.88, 19, now_iso, now_iso, now_iso),
                ("tut-msk-chem-1", None, "Дмитрий Волков", "Химия", "Москва", "UTC+3", 1300, 1600, "telegram", "month10k", "+79165558899", "@dmitry_chem34", "@dmitry_chem34", 1, 1, 1, 4.97, 56, now_iso, now_iso, now_iso),
                ("tut-ykt-chem-2", None, "Алина Соколова", "Химия", "Якутск", "UTC+9", 1100, 1450, "max", "trial5k", "+79148881234", "@alina_chem_ykt", "+79148881234", 1, 1, 0, 4.91, 28, now_iso, now_iso, now_iso),
                ("tut-msk-rus-1", None, "Елена Морозова", "Русский язык", "Москва", "UTC+3", 1200, 1500, "platform", "month10k", "+79037774567", "@elena_rus_k1", "@elena_rus_k1", 1, 1, 1, 4.98, 63, now_iso, now_iso, now_iso),
                ("tut-ykt-rus-2", None, "Артём Васильев", "Русский язык", "Якутск", "UTC+9", 900, 1250, "doska_ykt", "free", "+79142229090", "@artem_rus_ykt", "+79142229090", 0, 0, 0, 4.84, 15, now_iso, now_iso, now_iso),
            )
            self._conn.executemany(
                """
                INSERT INTO admin_tutors (
                    id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                    source_channel, tariff_id, whatsapp_phone, telegram_handle, max_handle,
                    has_photo, verified, bumped_today, rating, reviews_count,
                    last_bumped_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_tutors,
            )

        req_count = int(self._conn.execute("SELECT COUNT(*) FROM admin_lesson_requests").fetchone()[0])
        if req_count == 0:
            seed_reqs = (
                ("req-1001", "tut-ykt-bio-1", "Саргылана Петрова", None, "Айана Николаева", "Биология", "Якутск", "UTC+9", "2026-11-12", "16:00", "trial5k", 1000, 1100, 1100, "accepted", "captured", "whatsapp", now_iso, now_iso),
                ("req-1002", "tut-ykt-bio-1", "Саргылана Петрова", None, "Айана Николаева", "Биология", "Якутск", "UTC+9", "2026-11-16", "18:00", "trial5k", 1100, None, 1100, "accepted", "frozen", "whatsapp", now_iso, now_iso),
                ("req-1003", "tut-msk-chem-1", "Дмитрий Волков", None, "Тимур Громов", "Химия", "Москва", "UTC+3", "2026-11-13", "14:00", "month10k", 1200, 1300, 1300, "accepted", "captured", "telegram", now_iso, now_iso),
                ("req-1006", "tut-ykt-rus-2", "Артём Васильев", None, "Айана Николаева", "Русский язык", "Якутск", "UTC+9", "2026-11-17", "10:00", "free", 900, 1000, None, "pending", "none", "whatsapp", now_iso, now_iso),
                ("req-1007", "tut-ykt-bio-2", "Ньургун Иванов", None, "Тимур Громов", "Биология", "Якутск", "UTC+9", "2026-11-11", "16:00", "free", 1000, None, 1000, "refunded", "refunded", "whatsapp", now_iso, now_iso),
                ("req-1010", "tut-ykt-chem-2", "Алина Соколова", None, "Тимур Громов", "Химия", "Якутск", "UTC+9", "2026-11-16", "14:00", "month10k", 1100, None, None, "pending", "none", "max", now_iso, now_iso),
            )
            self._conn.executemany(
                """
                INSERT INTO admin_lesson_requests (
                    id, tutor_id, tutor_name, student_user_id, student_name, subject, city, timezone,
                    slot_date, hour_slot, tariff_id, offer_price_rub, counter_price_rub, final_price_rub,
                    status, escrow_status, messenger_channel, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_reqs,
            )

        esc_count = int(self._conn.execute("SELECT COUNT(*) FROM escrow_holds").fetchone()[0])
        if esc_count == 0:
            rows = self._conn.execute(
                """
                SELECT id, tutor_id, student_user_id, escrow_status, offer_price_rub, counter_price_rub, final_price_rub
                FROM admin_lesson_requests
                WHERE escrow_status IN ('frozen', 'captured', 'refunded')
                """
            ).fetchall()
            esc_rows = []
            for idx, r in enumerate(rows, start=1):
                gross = int(r["final_price_rub"] or r["counter_price_rub"] or r["offer_price_rub"] or 0)
                if gross <= 0:
                    continue
                fee, payout = calc_fee_split(gross)
                esc_status = str(r["escrow_status"])
                settled_at = now_iso if esc_status in ("captured", "refunded") else None
                esc_rows.append(
                    (
                        f"esc-seed-{idx}",
                        str(r["id"]),
                        str(r["tutor_id"]),
                        r["student_user_id"],
                        gross,
                        fee,
                        payout,
                        esc_status,
                        now_iso,
                        settled_at,
                    )
                )
            if esc_rows:
                self._conn.executemany(
                    """
                    INSERT OR IGNORE INTO escrow_holds (
                        id, request_id, tutor_id, student_user_id, gross_rub,
                        platform_fee_rub, tutor_payout_rub, status, created_at, settled_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    esc_rows,
                )

        payout_count = int(self._conn.execute("SELECT COUNT(*) FROM admin_payout_requests").fetchone()[0])
        if payout_count == 0:
            seed_payouts = (
                ("pay-3001", "tut-ykt-bio-1", "Саргылана Петрова", "sbp", 4200, "NPD-2026-YKT-88412", "АЭБ (Якутия)", "+7 (914) ***-11-22", "succeeded", now_iso, now_iso),
                ("pay-3002", "tut-msk-chem-1", "Дмитрий Волков", "card", 6500, "NPD-2026-MSK-55109", "Т-Банк (Мир)", "2200 70** **** 8899", "succeeded", now_iso, now_iso),
                ("pay-3003", "tut-ykt-chem-2", "Алина Соколова", "sbp", 1900, "NPD-2026-YKT-91003", "Сбербанк", "+7 (914) ***-12-34", "processing", now_iso, None),
                ("pay-3004", "tut-msk-rus-1", "Елена Морозова", "card", 3800, None, "Альфа-Банк (Мир)", "2200 15** **** 4567", "processing", now_iso, None),
            )
            self._conn.executemany(
                """
                INSERT INTO admin_payout_requests (
                    id, tutor_id, tutor_name, method, amount_rub, npd_receipt,
                    bank, destination_masked, status, created_at, paid_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                seed_payouts,
            )

        outbox_count = int(self._conn.execute("SELECT COUNT(*) FROM admin_outbox_events").fetchone()[0])
        if outbox_count == 0:
            seed_outbox = (
                (
                    "vektor.market.bids.v1",
                    "req-1001",
                    "market.bid.accepted",
                    json.dumps(
                        {
                            "event_type": "market.bid.accepted",
                            "schema_version": "1.0.0",
                            "role": "tutor",
                            "view": "cabinet",
                            "payload": {"requestId": "req-1001", "finalPriceRub": 1100},
                        },
                        ensure_ascii=False,
                    ),
                    now_iso,
                    now_iso,
                ),
                (
                    "vektor.payments.ledger.v1",
                    "pay-3001",
                    "payments.payout.succeeded",
                    json.dumps(
                        {
                            "event_type": "payments.payout.succeeded",
                            "schema_version": "1.0.0",
                            "role": "tutor",
                            "view": "fees",
                            "payload": {"payoutId": "pay-3001", "amountRub": 4200, "npd": "NPD-2026-YKT-88412"},
                        },
                        ensure_ascii=False,
                    ),
                    now_iso,
                    now_iso,
                ),
            )
            self._conn.executemany(
                """
                INSERT INTO admin_outbox_events (
                    topic, partition_key, event_type, payload, created_at, published_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                seed_outbox,
            )
