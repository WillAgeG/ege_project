"""Схема PostgreSQL 17, общие хелперы, Transactional Outbox и healthcheck."""

from datetime import datetime, timezone
import re
from typing import Any
import uuid

import psycopg
from psycopg.types.json import Jsonb

from databases.sqlite.store import User


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _iso_utc(dt: datetime | str | None) -> str:
    if isinstance(dt, datetime):
        return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    if dt:
        return str(dt)
    return _utc_now().strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_tz(raw: str | None) -> str:
    val = (raw or "").strip()
    if val in ("UTC+3", "Europe/Moscow", "Москва"):
        return "UTC+3"
    return "UTC+9"


def _normalize_dow(raw: Any, slot_date: str) -> int:
    try:
        d = int(raw)
        if 0 <= d <= 6:
            return d
    except (TypeError, ValueError):
        pass
    try:
        dt = datetime.strptime(slot_date[:10], "%Y-%m-%d")
        return (dt.weekday() + 1) % 7
    except ValueError:
        return 1


def _doc_outbox_meta(name: str) -> tuple[str, str, str]:
    if name in ("tutor-cabinet", "calendar-sync"):
        return "vektor.market.bids.v1", "tutor", "cabinet"
    if name == "market":
        return "vektor.market.bids.v1", "student", "market"
    if name == "profile" or name.startswith("log-"):
        view = "profile" if name == "profile" else "stats"
        return "vektor.user.clickstream.v1", "student", view
    return "vektor.study.attempts.v1", "student", name


def _build_envelope(
    *,
    event_type: str,
    user_id: int | None = None,
    session_id: str | None = None,
    role: str = "student",
    view: str = "app",
    payload: dict[str, Any] | None = None,
    event_id: str | None = None,
    occurred_at: datetime | None = None,
) -> dict[str, Any]:
    return {
        "event_id": event_id or str(uuid.uuid4()),
        "event_type": event_type,
        "occurred_at": _iso_utc(occurred_at or _utc_now()),
        "user_id": user_id,
        "session_id": session_id,
        "role": role,
        "view": view,
        "payload": payload or {},
        "schema_version": "1.0.0",
    }


def _row_to_user(row: dict[str, Any]) -> User:
    return User(
        id=int(row["id"]),
        username=str(row["username"]),
        display_name=str(row.get("display_name") or ""),
        email=row.get("email"),
        avatar_url=row.get("avatar_url"),
        auth_provider=str(row.get("auth_provider") or "local"),
        role=str(row.get("role") or "student"),
    )


class PgSchemaMixin:
    def _init_schema(self) -> None:
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute("CREATE SCHEMA IF NOT EXISTS oltp")
                conn.execute("CREATE SCHEMA IF NOT EXISTS outbox")
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.users (
                        id BIGSERIAL PRIMARY KEY,
                        username TEXT NOT NULL UNIQUE,
                        username_lower TEXT NOT NULL UNIQUE,
                        password_hash TEXT NOT NULL DEFAULT '',
                        display_name TEXT NOT NULL DEFAULT '',
                        email TEXT,
                        email_lower TEXT,
                        avatar_url TEXT,
                        auth_provider TEXT NOT NULL DEFAULT 'local',
                        role TEXT NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'tutor', 'admin')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_users_email_lower
                    ON oltp.users(email_lower)
                    WHERE email_lower IS NOT NULL AND email_lower <> ''
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.user_identities (
                        provider TEXT NOT NULL,
                        provider_subject TEXT NOT NULL,
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        email TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (provider, provider_subject)
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_identities_user ON oltp.user_identities(user_id)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.oauth_states (
                        state_hash TEXT PRIMARY KEY,
                        provider TEXT NOT NULL,
                        code_verifier TEXT NOT NULL,
                        redirect_uri TEXT NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.sessions (
                        token_hash TEXT PRIMARY KEY,
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_sessions_user ON oltp.sessions(user_id)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.docs (
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        name TEXT NOT NULL,
                        data JSONB NOT NULL DEFAULT '{}'::jsonb,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (user_id, name)
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.calendar_sync_tokens (
                        feed_token TEXT PRIMARY KEY,
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        tutor_slug TEXT NOT NULL UNIQUE,
                        tutor_name TEXT NOT NULL DEFAULT 'Преподаватель Вектор ЕГЭ',
                        city TEXT NOT NULL DEFAULT 'Якутск',
                        timezone TEXT NOT NULL DEFAULT 'UTC+9' CHECK (timezone IN ('UTC+9', 'UTC+3')),
                        external_ics_url TEXT,
                        gcal_connected BOOLEAN NOT NULL DEFAULT FALSE,
                        open_slots JSONB NOT NULL DEFAULT '{}'::jsonb,
                        busy_slots JSONB NOT NULL DEFAULT '[]'::jsonb,
                        last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.calendar_events (
                        uid TEXT PRIMARY KEY,
                        tutor_slug TEXT NOT NULL,
                        student_name TEXT NOT NULL DEFAULT '',
                        subject TEXT NOT NULL DEFAULT 'bio',
                        exam TEXT NOT NULL DEFAULT 'ЕГЭ',
                        dow INTEGER NOT NULL CHECK (dow BETWEEN 0 AND 6),
                        slot_date DATE NOT NULL,
                        hour_slot TEXT NOT NULL,
                        duration_min INTEGER NOT NULL DEFAULT 60,
                        timezone TEXT NOT NULL DEFAULT 'UTC+9',
                        price_rub INTEGER NOT NULL DEFAULT 0,
                        status TEXT NOT NULL DEFAULT 'accepted' CHECK (status IN ('accepted', 'pending', 'external_busy', 'cancelled')),
                        source TEXT NOT NULL DEFAULT 'vektor' CHECK (source IN ('vektor', 'gcal_ics', 'manual')),
                        note TEXT NOT NULL DEFAULT '',
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_oltp_calendar_events_tutor_slot
                    ON oltp.calendar_events(tutor_slug, slot_date, hour_slot)
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.realtime_notifications (
                        id BIGSERIAL PRIMARY KEY,
                        event_id TEXT NOT NULL UNIQUE,
                        channel TEXT NOT NULL DEFAULT 'tutor',
                        tutor_slug TEXT,
                        event_type TEXT NOT NULL,
                        title TEXT NOT NULL,
                        message TEXT NOT NULL DEFAULT '',
                        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE INDEX IF NOT EXISTS idx_oltp_realtime_notifications_channel_id
                    ON oltp.realtime_notifications(channel, id DESC)
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS outbox.kafka_outbox (
                        id BIGSERIAL PRIMARY KEY,
                        topic TEXT NOT NULL CHECK (topic IN (
                            'vektor.user.clickstream.v1',
                            'vektor.market.bids.v1',
                            'vektor.payments.ledger.v1',
                            'vektor.study.attempts.v1',
                            'vektor.tutors.raw.v1'
                        )),
                        partition_key TEXT NOT NULL,
                        payload JSONB NOT NULL,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        published_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_kafka_outbox_topic_created ON outbox.kafka_outbox(topic, created_at)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_kafka_outbox_unpublished ON outbox.kafka_outbox(created_at) WHERE published_at IS NULL"
                )
                conn.execute("DELETE FROM oltp.sessions WHERE expires_at <= NOW()")
                conn.execute("DELETE FROM oltp.oauth_states WHERE expires_at <= NOW()")
                conn.execute(
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'"
                )
                for sql in (
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS phone TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS phone_country TEXT NOT NULL DEFAULT 'RU'",
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS city TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS grade TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS goal TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.users ADD COLUMN IF NOT EXISTS contact_verified BOOLEAN NOT NULL DEFAULT FALSE",
                ):
                    conn.execute(sql)

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutors (
                        id TEXT PRIMARY KEY,
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        full_name TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        city TEXT NOT NULL DEFAULT 'Якутск' CHECK (city IN ('Якутск', 'Москва')),
                        timezone TEXT NOT NULL DEFAULT 'UTC+9' CHECK (timezone IN ('UTC+9', 'UTC+3')),
                        base_rate_rub INTEGER NOT NULL DEFAULT 1200 CHECK (base_rate_rub > 0),
                        market_rate_rub INTEGER NOT NULL DEFAULT 1500 CHECK (market_rate_rub > 0),
                        source_channel TEXT NOT NULL DEFAULT 'platform' CHECK (source_channel IN ('platform', 'doska_ykt', 'telegram', 'whatsapp', 'max')),
                        tariff_id TEXT NOT NULL DEFAULT 'free' CHECK (tariff_id IN ('free', 'trial5k', 'month10k')),
                        whatsapp_phone TEXT NOT NULL DEFAULT '',
                        telegram_handle TEXT NOT NULL DEFAULT '',
                        max_handle TEXT NOT NULL DEFAULT '',
                        has_photo BOOLEAN NOT NULL DEFAULT TRUE,
                        rating NUMERIC(3,2) NOT NULL DEFAULT 4.90 CHECK (rating BETWEEN 1.00 AND 5.00),
                        reviews_count INTEGER NOT NULL DEFAULT 0 CHECK (reviews_count >= 0),
                        last_bumped_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        verified BOOLEAN NOT NULL DEFAULT TRUE,
                        bumped_today BOOLEAN NOT NULL DEFAULT FALSE,
                        CONSTRAINT chk_tutor_city_tz CHECK ((city = 'Якутск' AND timezone = 'UTC+9') OR (city = 'Москва' AND timezone = 'UTC+3'))
                    )
                    """
                )
                for sql in (
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT TRUE",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS bumped_today BOOLEAN NOT NULL DEFAULT FALSE",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS photo_url TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS bio TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS education TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS exp_years INTEGER NOT NULL DEFAULT 3",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS avg_score INTEGER NOT NULL DEFAULT 85",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS subjects_json JSONB NOT NULL DEFAULT '[]'::jsonb",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS exams_json JSONB NOT NULL DEFAULT '[\"ЕГЭ\"]'::jsonb",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS formats_json JSONB NOT NULL DEFAULT '[\"Онлайн\"]'::jsonb",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS custom_skills TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS first_lesson_guarantee BOOLEAN NOT NULL DEFAULT TRUE",
                ):
                    conn.execute(sql)

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutor_slots (
                        id BIGSERIAL PRIMARY KEY,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
                        hour_slot TEXT NOT NULL,
                        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
                        UNIQUE (tutor_id, weekday, hour_slot)
                    )
                    """
                )
                conn.execute("ALTER TABLE oltp.tutor_slots DROP CONSTRAINT IF EXISTS tutor_slots_hour_slot_check")
                conn.execute(
                    """
                    ALTER TABLE oltp.tutor_slots ADD CONSTRAINT tutor_slots_hour_slot_check
                    CHECK (hour_slot IN ('10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'))
                    """
                )

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.lesson_requests (
                        id TEXT PRIMARY KEY,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        student_name TEXT NOT NULL,
                        subject TEXT NOT NULL,
                        city TEXT NOT NULL DEFAULT 'Якутск',
                        timezone TEXT NOT NULL DEFAULT 'UTC+9' CHECK (timezone IN ('UTC+9', 'UTC+3')),
                        slot_date DATE NOT NULL,
                        hour_slot TEXT NOT NULL,
                        tariff_id TEXT NOT NULL DEFAULT 'trial5k' CHECK (tariff_id IN ('free', 'trial5k', 'month10k')),
                        offer_price_rub INTEGER NOT NULL DEFAULT 0,
                        counter_price_rub INTEGER,
                        final_price_rub INTEGER,
                        status TEXT NOT NULL DEFAULT 'offered' CHECK (status IN ('offered', 'countered', 'accepted', 'declined', 'completed', 'cancelled')),
                        messenger_channel TEXT NOT NULL DEFAULT 'whatsapp' CHECK (messenger_channel IN ('whatsapp', 'telegram', 'max')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                for sql in (
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS exam TEXT NOT NULL DEFAULT 'ЕГЭ'",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS format TEXT NOT NULL DEFAULT 'Онлайн'",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS note TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS telemost_url TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS schedule_plan JSONB",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS dows JSONB NOT NULL DEFAULT '[]'::jsonb",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS day_label TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS tutor_price_rub INTEGER",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS first_lesson_guarantee BOOLEAN NOT NULL DEFAULT TRUE",
                    "ALTER TABLE IF EXISTS oltp.lesson_requests ADD COLUMN IF NOT EXISTS reserved_rub INTEGER NOT NULL DEFAULT 0",
                ):
                    conn.execute(sql)
                conn.execute("ALTER TABLE oltp.lesson_requests DROP CONSTRAINT IF EXISTS lesson_requests_hour_slot_check")
                conn.execute(
                    """
                    ALTER TABLE oltp.lesson_requests ADD CONSTRAINT lesson_requests_hour_slot_check
                    CHECK (hour_slot IN ('10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00'))
                    """
                )
                conn.execute("ALTER TABLE oltp.lesson_requests DROP CONSTRAINT IF EXISTS lesson_requests_offer_price_rub_check")
                conn.execute(
                    "ALTER TABLE oltp.lesson_requests ADD CONSTRAINT lesson_requests_offer_price_rub_check CHECK (offer_price_rub >= 0)"
                )
                conn.execute("ALTER TABLE oltp.lesson_requests DROP CONSTRAINT IF EXISTS lesson_requests_final_price_rub_check")
                conn.execute(
                    "ALTER TABLE oltp.lesson_requests ADD CONSTRAINT lesson_requests_final_price_rub_check CHECK (final_price_rub IS NULL OR final_price_rub >= 0)"
                )
                conn.execute("ALTER TABLE oltp.lesson_requests DROP CONSTRAINT IF EXISTS lesson_requests_city_check")
                conn.execute(
                    "ALTER TABLE oltp.lesson_requests ADD CONSTRAINT lesson_requests_city_check CHECK (length(trim(city)) > 0)"
                )

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.escrow_holds (
                        id TEXT PRIMARY KEY,
                        request_id TEXT NOT NULL REFERENCES oltp.lesson_requests(id) ON DELETE CASCADE,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        gross_rub INTEGER NOT NULL CHECK (gross_rub > 0),
                        platform_fee_rub INTEGER NOT NULL CHECK (platform_fee_rub = ROUND(gross_rub::numeric * 0.05)::integer),
                        tutor_payout_rub INTEGER NOT NULL CHECK (tutor_payout_rub = gross_rub - platform_fee_rub),
                        status TEXT NOT NULL CHECK (status IN ('frozen', 'captured', 'refunded')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        settled_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_escrow_holds_request ON oltp.escrow_holds(request_id)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.payout_requests (
                        id TEXT PRIMARY KEY,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        method TEXT NOT NULL CHECK (method IN ('sbp', 'card')),
                        amount_rub INTEGER NOT NULL CHECK (amount_rub >= 500),
                        npd_receipt TEXT,
                        bank TEXT NOT NULL DEFAULT '',
                        destination_masked TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'paid', 'failed')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        paid_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.wallets (
                        user_id BIGINT PRIMARY KEY REFERENCES oltp.users(id) ON DELETE CASCADE,
                        balance_rub INTEGER NOT NULL DEFAULT 0 CHECK (balance_rub >= 0),
                        initial_paid BOOLEAN NOT NULL DEFAULT FALSE,
                        plan_id TEXT NOT NULL DEFAULT 'trial5k',
                        saved_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.wallet_ledger (
                        id BIGSERIAL PRIMARY KEY,
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        kind TEXT NOT NULL,
                        amount_rub INTEGER NOT NULL,
                        balance_after_rub INTEGER NOT NULL CHECK (balance_after_rub >= 0),
                        fee_rub INTEGER NOT NULL DEFAULT 0,
                        method TEXT NOT NULL DEFAULT '',
                        ref_type TEXT NOT NULL DEFAULT '',
                        ref_id TEXT NOT NULL DEFAULT '',
                        note TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_wallet_ledger_user ON oltp.wallet_ledger(user_id, id DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.student_leads (
                        id TEXT PRIMARY KEY,
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        student_name TEXT NOT NULL,
                        subjects JSONB NOT NULL DEFAULT '["bio"]'::jsonb,
                        exam TEXT NOT NULL DEFAULT 'ЕГЭ',
                        format TEXT NOT NULL DEFAULT 'Онлайн',
                        target_price_rub INTEGER NOT NULL CHECK (target_price_rub >= 0),
                        whatsapp TEXT NOT NULL DEFAULT '',
                        whatsapp_country TEXT NOT NULL DEFAULT 'RU',
                        comment TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'matched', 'closed')),
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutor_contact_overrides (
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        tutor_id TEXT NOT NULL,
                        whatsapp TEXT NOT NULL DEFAULT '',
                        telegram TEXT NOT NULL DEFAULT '',
                        max_handle TEXT NOT NULL DEFAULT '',
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (user_id, tutor_id)
                    )
                    """
                )

    def close(self) -> None:
        self._pool.close()

    def ping(self) -> None:
        with self._pool.connection() as conn:
            conn.execute("SELECT 1").fetchone()

    def _insert_outbox(
        self,
        conn: psycopg.Connection[Any],
        *,
        topic: str,
        partition_key: str,
        event_type: str,
        user_id: int | None = None,
        session_id: str | None = None,
        role: str = "student",
        view: str = "app",
        payload: dict[str, Any] | None = None,
        event_id: str | None = None,
    ) -> None:
        envelope = _build_envelope(
            event_type=event_type,
            user_id=user_id,
            session_id=session_id,
            role=role,
            view=view,
            payload=payload,
            event_id=event_id,
        )
        conn.execute(
            """
            INSERT INTO outbox.kafka_outbox (topic, partition_key, payload)
            VALUES (%s, %s, %s)
            """,
            (topic, partition_key, Jsonb(envelope)),
        )

    def storage_health(self) -> dict[str, Any]:
        with self._pool.connection() as conn:
            conn.execute("SELECT 1").fetchone()
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM outbox.kafka_outbox WHERE published_at IS NULL"
            ).fetchone()
            pending = int(row["cnt"]) if row else 0
        return {
            "ok": True,
            "mode": "postgres",
            "sqlite": "disabled",
            "postgres": "ok",
            "outboxPending": pending,
        }
