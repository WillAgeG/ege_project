"""Схема PostgreSQL 17, общие хелперы, Transactional Outbox и healthcheck."""

from contextlib import contextmanager
from datetime import datetime, timezone
import re
from typing import Any, Iterator
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
        run_constraint_migrations = bool(getattr(self, "_run_constraint_migrations", True))
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
                        role TEXT NOT NULL DEFAULT 'student',
                        next_url TEXT NOT NULL DEFAULT '/',
                        link_user_id BIGINT,
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
                    "CREATE INDEX IF NOT EXISTS idx_oltp_sessions_expires ON oltp.sessions(expires_at)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_oauth_states_expires ON oltp.oauth_states(expires_at)"
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
                        tutor_name TEXT NOT NULL DEFAULT 'Преподаватель Вектор',
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
                    "CREATE INDEX IF NOT EXISTS idx_oltp_realtime_notifications_created ON oltp.realtime_notifications(created_at)"
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
                    "ALTER TABLE IF EXISTS oltp.oauth_states ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'",
                    "ALTER TABLE IF EXISTS oltp.oauth_states ADD COLUMN IF NOT EXISTS next_url TEXT NOT NULL DEFAULT '/'",
                    "ALTER TABLE IF EXISTS oltp.oauth_states ADD COLUMN IF NOT EXISTS link_user_id BIGINT",
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
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS inn TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS npd_verified BOOLEAN NOT NULL DEFAULT FALSE",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS npd_checked_at TIMESTAMPTZ",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS slots_json JSONB NOT NULL DEFAULT '{}'::jsonb",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT TRUE",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS custom_badges_json JSONB NOT NULL DEFAULT '[]'::jsonb",
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS min_fair_rub INTEGER NOT NULL DEFAULT 0",
                ):
                    conn.execute(sql)

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutor_slots (
                        id BIGSERIAL PRIMARY KEY,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
                        hour_slot TEXT NOT NULL CHECK (hour_slot IN ('10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00')),
                        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
                        UNIQUE (tutor_id, weekday, hour_slot)
                    )
                    """
                )
                if run_constraint_migrations:
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
                        city TEXT NOT NULL DEFAULT 'Якутск' CHECK (length(trim(city)) > 0),
                        timezone TEXT NOT NULL DEFAULT 'UTC+9' CHECK (timezone IN ('UTC+9', 'UTC+3')),
                        slot_date DATE NOT NULL,
                        hour_slot TEXT NOT NULL CHECK (hour_slot IN ('10:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00','21:00','22:00','23:00')),
                        tariff_id TEXT NOT NULL DEFAULT 'trial5k' CHECK (tariff_id IN ('free', 'trial5k', 'month10k')),
                        offer_price_rub INTEGER NOT NULL DEFAULT 0 CHECK (offer_price_rub >= 0),
                        counter_price_rub INTEGER,
                        final_price_rub INTEGER CHECK (final_price_rub IS NULL OR final_price_rub >= 0),
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
                if run_constraint_migrations:
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
                    "CREATE INDEX IF NOT EXISTS idx_oltp_lesson_requests_student_created ON oltp.lesson_requests(student_user_id, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_lesson_requests_tutor_status_created ON oltp.lesson_requests(tutor_id, status, created_at DESC)"
                )

                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.escrow_holds (
                        id TEXT PRIMARY KEY,
                        request_id TEXT NOT NULL REFERENCES oltp.lesson_requests(id) ON DELETE CASCADE,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        gross_rub INTEGER NOT NULL CHECK (gross_rub > 0),
                        platform_fee_rub INTEGER NOT NULL CHECK (platform_fee_rub >= 0 AND platform_fee_rub <= gross_rub),
                        tutor_payout_rub INTEGER NOT NULL CHECK (tutor_payout_rub >= 0 AND tutor_payout_rub <= gross_rub - platform_fee_rub),
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
                for sql in (
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS idempotency_key TEXT",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual'",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS provider_payout_id TEXT",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS sbp_bank_id TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS sbp_phone TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS payout_token TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS tutor_inn TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS antifraud_hold BOOLEAN NOT NULL DEFAULT FALSE",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS antifraud_reason TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS npd_requested BOOLEAN NOT NULL DEFAULT TRUE",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS npd_status TEXT NOT NULL DEFAULT 'none'",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS npd_receipt_url TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT ''",
                    "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
                ):
                    conn.execute(sql)
                conn.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_payout_requests_idempotency
                    ON oltp.payout_requests(idempotency_key)
                    WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''
                    """
                )
                conn.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_payout_requests_provider_id
                    ON oltp.payout_requests(provider_payout_id)
                    WHERE provider_payout_id IS NOT NULL AND provider_payout_id <> ''
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.npd_receipts (
                        id TEXT PRIMARY KEY,
                        payout_id TEXT NOT NULL UNIQUE REFERENCES oltp.payout_requests(id) ON DELETE CASCADE,
                        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                        tutor_inn TEXT NOT NULL DEFAULT '',
                        provider TEXT NOT NULL DEFAULT 'demo',
                        receipt_uuid TEXT NOT NULL DEFAULT '',
                        receipt_url TEXT NOT NULL DEFAULT '',
                        receipt_json_url TEXT NOT NULL DEFAULT '',
                        service_name TEXT NOT NULL DEFAULT '',
                        amount_rub INTEGER NOT NULL CHECK (amount_rub >= 0),
                        status TEXT NOT NULL DEFAULT 'demo' CHECK (status IN ('demo', 'pending', 'registered', 'failed', 'canceled')),
                        error_message TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        canceled_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_npd_receipts_tutor_created ON oltp.npd_receipts(tutor_id, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_npd_receipts_status_created ON oltp.npd_receipts(status, created_at DESC)"
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
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.market_directions (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        short TEXT NOT NULL,
                        category TEXT NOT NULL DEFAULT 'Добавлено оркестратором',
                        is_exam BOOLEAN NOT NULL DEFAULT FALSE,
                        source TEXT NOT NULL DEFAULT 'orchestrator',
                        keywords JSONB NOT NULL DEFAULT '[]'::jsonb,
                        demand_count INTEGER NOT NULL DEFAULT 1,
                        tutor_count INTEGER NOT NULL DEFAULT 0,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutor_reviews (
                        id TEXT PRIMARY KEY,
                        tutor_id TEXT NOT NULL,
                        booking_id TEXT,
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        student_name TEXT NOT NULL DEFAULT 'Ученик',
                        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
                        comment TEXT NOT NULL DEFAULT '',
                        tags JSONB NOT NULL DEFAULT '[]'::jsonb,
                        verified_lesson BOOLEAN NOT NULL DEFAULT TRUE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_tutor_reviews_booking
                    ON oltp.tutor_reviews(booking_id)
                    WHERE booking_id IS NOT NULL AND booking_id <> ''
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.lesson_disputes (
                        id TEXT PRIMARY KEY,
                        booking_id TEXT NOT NULL UNIQUE,
                        tutor_id TEXT NOT NULL,
                        tutor_name TEXT NOT NULL DEFAULT '',
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        student_name TEXT NOT NULL DEFAULT 'Ученик',
                        reason TEXT NOT NULL,
                        comment TEXT NOT NULL DEFAULT '',
                        amount_rub INTEGER NOT NULL DEFAULT 0,
                        first_lesson_guarantee BOOLEAN NOT NULL DEFAULT TRUE,
                        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'refunded', 'rejected', 'resolved')),
                        resolution_note TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        resolved_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.telegram_bindings (
                        chat_id TEXT PRIMARY KEY,
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE CASCADE,
                        telegram_user_id TEXT NOT NULL DEFAULT '',
                        telegram_username TEXT NOT NULL DEFAULT '',
                        phone_digits TEXT NOT NULL DEFAULT '',
                        first_name TEXT NOT NULL DEFAULT '',
                        notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE,
                        linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_tg_bindings_user ON oltp.telegram_bindings(user_id)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_tg_bindings_phone ON oltp.telegram_bindings(phone_digits)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.telegram_link_tokens (
                        token_hash TEXT PRIMARY KEY,
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        expires_at TIMESTAMPTZ NOT NULL
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_telegram_link_tokens_expires ON oltp.telegram_link_tokens(expires_at)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.lesson_reminders_sent (
                        booking_id TEXT NOT NULL,
                        kind TEXT NOT NULL CHECK (kind IN ('24h', '1h')),
                        recipient_role TEXT NOT NULL CHECK (recipient_role IN ('student', 'tutor')),
                        chat_id TEXT NOT NULL DEFAULT '',
                        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (booking_id, kind, recipient_role)
                    )
                    """
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.media_assets (
                        id TEXT PRIMARY KEY,
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE CASCADE,
                        kind TEXT NOT NULL CHECK (kind IN ('avatar', 'diploma', 'feedback', 'chat')),
                        storage_driver TEXT NOT NULL DEFAULT 'local',
                        bucket TEXT NOT NULL,
                        object_key TEXT NOT NULL,
                        content_type TEXT NOT NULL,
                        size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
                        sha256 TEXT NOT NULL DEFAULT '',
                        original_filename TEXT NOT NULL DEFAULT '',
                        public_url TEXT,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_media_assets_user_kind ON oltp.media_assets(user_id, kind, created_at DESC)"
                )
                if run_constraint_migrations:
                    conn.execute(
                        "ALTER TABLE oltp.media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check"
                    )
                    conn.execute(
                        "ALTER TABLE oltp.media_assets ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('avatar', 'diploma', 'feedback', 'chat'))"
                    )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutor_verifications (
                        id TEXT PRIMARY KEY,
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE CASCADE,
                        tutor_id TEXT NOT NULL DEFAULT '',
                        asset_id TEXT NOT NULL REFERENCES oltp.media_assets(id) ON DELETE CASCADE,
                        doc_type TEXT NOT NULL DEFAULT 'diploma' CHECK (doc_type IN ('diploma', 'ege_expert', 'certificate', 'other')),
                        title TEXT NOT NULL DEFAULT '',
                        comment TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                        review_note TEXT NOT NULL DEFAULT '',
                        reviewed_by TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        reviewed_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_tutor_verifications_status ON oltp.tutor_verifications(status, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_tutor_verifications_user ON oltp.tutor_verifications(user_id, created_at DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.payment_intents (
                        id TEXT PRIMARY KEY,
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        provider TEXT NOT NULL DEFAULT 'yookassa',
                        idempotency_key TEXT NOT NULL UNIQUE,
                        provider_payment_id TEXT UNIQUE,
                        method TEXT NOT NULL CHECK (method IN ('sbp', 'card')),
                        plan_id TEXT NOT NULL DEFAULT 'trial5k',
                        amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
                        fee_rub INTEGER NOT NULL DEFAULT 0 CHECK (fee_rub >= 0),
                        total_rub INTEGER NOT NULL CHECK (total_rub > 0),
                        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'waiting_for_capture', 'succeeded', 'canceled')),
                        credited BOOLEAN NOT NULL DEFAULT FALSE,
                        receipt_email TEXT NOT NULL DEFAULT '',
                        receipt_phone TEXT NOT NULL DEFAULT '',
                        confirmation_url TEXT NOT NULL DEFAULT '',
                        return_url TEXT NOT NULL DEFAULT '',
                        error_message TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        paid_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_payment_intents_user_created ON oltp.payment_intents(user_id, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_payment_intents_status_created ON oltp.payment_intents(status, created_at DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.payment_refunds (
                        id TEXT PRIMARY KEY,
                        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                        payment_intent_id TEXT REFERENCES oltp.payment_intents(id) ON DELETE SET NULL,
                        provider TEXT NOT NULL DEFAULT 'yookassa',
                        idempotency_key TEXT NOT NULL UNIQUE,
                        provider_payment_id TEXT,
                        provider_refund_id TEXT UNIQUE,
                        method TEXT NOT NULL DEFAULT 'sbp' CHECK (method IN ('sbp', 'card')),
                        amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
                        reason TEXT NOT NULL DEFAULT '',
                        status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'pending', 'succeeded', 'canceled', 'rejected')),
                        balance_reverted BOOLEAN NOT NULL DEFAULT FALSE,
                        review_note TEXT NOT NULL DEFAULT '',
                        reviewed_by TEXT NOT NULL DEFAULT '',
                        error_message TEXT NOT NULL DEFAULT '',
                        receipt_email TEXT NOT NULL DEFAULT '',
                        receipt_phone TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        refunded_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_payment_refunds_user_created ON oltp.payment_refunds(user_id, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_payment_refunds_intent_status ON oltp.payment_refunds(payment_intent_id, status)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_payment_refunds_status_created ON oltp.payment_refunds(status, created_at DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.tutor_applications (
                        id TEXT PRIMARY KEY,
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        full_name TEXT NOT NULL,
                        subject_id TEXT NOT NULL DEFAULT 'eng',
                        subject_name TEXT NOT NULL DEFAULT '',
                        desired_rate_rub INTEGER NOT NULL DEFAULT 1100 CHECK (desired_rate_rub >= 0 AND desired_rate_rub <= 99999),
                        contact TEXT NOT NULL,
                        source TEXT NOT NULL DEFAULT 'landing',
                        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'approved', 'rejected')),
                        review_note TEXT NOT NULL DEFAULT '',
                        created_tutor_id TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        reviewed_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_tutor_applications_status_created ON oltp.tutor_applications(status, created_at DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.rate_limit_hits (
                        id BIGSERIAL PRIMARY KEY,
                        bucket_key TEXT NOT NULL,
                        created_at DOUBLE PRECISION NOT NULL,
                        expires_at DOUBLE PRECISION NOT NULL
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_rate_limit_hits_key_created ON oltp.rate_limit_hits(bucket_key, created_at)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_rate_limit_hits_expires ON oltp.rate_limit_hits(expires_at)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.phone_otp_codes (
                        phone_digits TEXT PRIMARY KEY,
                        code_hash TEXT NOT NULL,
                        channel TEXT NOT NULL DEFAULT 'wa' CHECK (channel IN ('wa', 'tg', 'sms')),
                        mode TEXT NOT NULL DEFAULT 'login' CHECK (mode IN ('login', 'register')),
                        invite_ok BOOLEAN NOT NULL DEFAULT FALSE,
                        attempts INTEGER NOT NULL DEFAULT 0,
                        created_at DOUBLE PRECISION NOT NULL,
                        expires_at DOUBLE PRECISION NOT NULL
                    )
                    """
                )
                if run_constraint_migrations:
                    conn.execute(
                        "ALTER TABLE oltp.phone_otp_codes DROP CONSTRAINT IF EXISTS phone_otp_codes_channel_check"
                    )
                    conn.execute(
                        "ALTER TABLE oltp.phone_otp_codes ADD CONSTRAINT phone_otp_codes_channel_check CHECK (channel IN ('wa', 'tg', 'sms'))"
                    )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_phone_otp_codes_expires ON oltp.phone_otp_codes(expires_at)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.feedback_tickets (
                        id TEXT PRIMARY KEY,
                        kind TEXT NOT NULL CHECK (kind IN ('bug', 'cooperation')),
                        user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        author_name TEXT NOT NULL DEFAULT '',
                        contact TEXT NOT NULL DEFAULT '',
                        subject TEXT NOT NULL DEFAULT '',
                        message TEXT NOT NULL,
                        page_url TEXT NOT NULL DEFAULT '',
                        context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                        status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                        review_note TEXT NOT NULL DEFAULT '',
                        reviewed_by TEXT NOT NULL DEFAULT '',
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        reviewed_at TIMESTAMPTZ
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_feedback_tickets_status_created ON oltp.feedback_tickets(status, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_feedback_tickets_kind_created ON oltp.feedback_tickets(kind, created_at DESC)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.feedback_attachments (
                        id TEXT PRIMARY KEY,
                        ticket_id TEXT NOT NULL REFERENCES oltp.feedback_tickets(id) ON DELETE CASCADE,
                        asset_id TEXT NOT NULL REFERENCES oltp.media_assets(id) ON DELETE CASCADE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_feedback_attachments_ticket ON oltp.feedback_attachments(ticket_id)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.chat_messages (
                        id TEXT PRIMARY KEY,
                        thread_id TEXT NOT NULL,
                        booking_id TEXT,
                        tutor_id TEXT NOT NULL DEFAULT '',
                        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        tutor_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        sender_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                        sender_role TEXT NOT NULL DEFAULT 'student' CHECK (sender_role IN ('student', 'tutor', 'system')),
                        sender_name TEXT NOT NULL DEFAULT '',
                        body TEXT NOT NULL,
                        read_by_student BOOLEAN NOT NULL DEFAULT FALSE,
                        read_by_tutor BOOLEAN NOT NULL DEFAULT FALSE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_thread_created ON oltp.chat_messages(thread_id, created_at)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_student_created ON oltp.chat_messages(student_user_id, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_tutor_created ON oltp.chat_messages(tutor_user_id, created_at DESC)"
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_booking ON oltp.chat_messages(booking_id)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.chat_message_attachments (
                        id TEXT PRIMARY KEY,
                        message_id TEXT NOT NULL REFERENCES oltp.chat_messages(id) ON DELETE CASCADE,
                        asset_id TEXT NOT NULL REFERENCES oltp.media_assets(id) ON DELETE CASCADE,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_chat_msg_attachments_message ON oltp.chat_message_attachments(message_id)"
                )
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS oltp.chat_unanswered_notifications (
                        thread_id TEXT NOT NULL,
                        anchor_message_id TEXT NOT NULL,
                        recipient_role TEXT NOT NULL CHECK (recipient_role IN ('student', 'tutor')),
                        latest_message_id TEXT NOT NULL DEFAULT '',
                        channels TEXT NOT NULL DEFAULT '',
                        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        PRIMARY KEY (thread_id, anchor_message_id, recipient_role)
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_oltp_chat_unanswered_notif_sent ON oltp.chat_unanswered_notifications(sent_at DESC)"
                )

    def close(self) -> None:
        self._pool.close()

    def ping(self) -> None:
        with self._pool.connection() as conn:
            conn.execute("SELECT 1").fetchone()

    @contextmanager
    def advisory_lock(self, lock_key: int) -> Iterator[bool]:
        """Неблокирующий распределённый PostgreSQL advisory lock (pg_try_advisory_lock)."""
        key = int(lock_key)
        with self._pool.connection() as conn:
            prev_autocommit = bool(conn.autocommit)
            acquired = False
            try:
                conn.autocommit = True
                row = conn.execute("SELECT pg_try_advisory_lock(%s) AS locked", (key,)).fetchone()
                acquired = bool(row["locked"]) if isinstance(row, dict) else bool(row and row[0])
                yield acquired
            finally:
                if acquired:
                    try:
                        conn.execute("SELECT pg_advisory_unlock(%s)", (key,))
                    except Exception:
                        pass
                try:
                    conn.autocommit = prev_autocommit
                except Exception:
                    pass

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
