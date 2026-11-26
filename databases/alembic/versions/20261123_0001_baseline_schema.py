"""Базовая идемпотентная схема БД «Вектор ЕГЭ» (SQLite и PostgreSQL 17)."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0001"
down_revision = None
branch_labels = None
depends_on = None


_SQLITE_STATEMENTS = (
    "PRAGMA foreign_keys = ON",
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
        phone TEXT NOT NULL DEFAULT '',
        phone_country TEXT NOT NULL DEFAULT 'RU',
        city TEXT NOT NULL DEFAULT '',
        grade TEXT NOT NULL DEFAULT '',
        goal TEXT NOT NULL DEFAULT '',
        contact_verified INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower
    ON users(email_lower)
    WHERE email_lower IS NOT NULL AND email_lower != ''
    """,
    """
    CREATE TABLE IF NOT EXISTS user_identities (
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (provider, provider_subject)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_identities_user ON user_identities(user_id)",
    """
    CREATE TABLE IF NOT EXISTS oauth_states (
        state_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id)",
    """
    CREATE TABLE IF NOT EXISTS docs (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, name)
    )
    """,
    """
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
    )
    """,
    """
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
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_calendar_events_tutor_date ON calendar_events(tutor_slug, slot_date, hour_slot)",
    """
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
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_realtime_notifications_channel_id ON realtime_notifications(channel, id DESC)",
    """
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
        photo_url TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        education TEXT NOT NULL DEFAULT '',
        exp_years INTEGER NOT NULL DEFAULT 3,
        avg_score INTEGER NOT NULL DEFAULT 85,
        subjects_json TEXT NOT NULL DEFAULT '[]',
        exams_json TEXT NOT NULL DEFAULT '["ЕГЭ"]',
        formats_json TEXT NOT NULL DEFAULT '["Онлайн"]',
        custom_skills TEXT NOT NULL DEFAULT '',
        first_lesson_guarantee INTEGER NOT NULL DEFAULT 1,
        last_bumped_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
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
        exam TEXT NOT NULL DEFAULT 'ЕГЭ',
        format TEXT NOT NULL DEFAULT 'Онлайн',
        note TEXT NOT NULL DEFAULT '',
        telemost_url TEXT NOT NULL DEFAULT '',
        schedule_plan_json TEXT,
        dows_json TEXT NOT NULL DEFAULT '[]',
        day_label TEXT NOT NULL DEFAULT '',
        tutor_price_rub INTEGER,
        first_lesson_guarantee INTEGER NOT NULL DEFAULT 1,
        reserved_rub INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
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
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS admin_outbox_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        topic TEXT NOT NULL,
        partition_key TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        published_at TEXT
    )
    """,
    """
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
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS wallets (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance_rub INTEGER NOT NULL DEFAULT 0 CHECK (balance_rub >= 0),
        initial_paid INTEGER NOT NULL DEFAULT 0,
        plan_id TEXT NOT NULL DEFAULT 'trial5k',
        saved_cards_json TEXT NOT NULL DEFAULT '[]',
        updated_at TEXT NOT NULL
    )
    """,
    """
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
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user ON wallet_ledger(user_id, id DESC)",
    """
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
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutor_contact_overrides (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        tutor_id TEXT NOT NULL,
        whatsapp TEXT NOT NULL DEFAULT '',
        telegram TEXT NOT NULL DEFAULT '',
        max_handle TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (user_id, tutor_id)
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS market_directions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        short TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'Добавлено оркестратором',
        is_exam INTEGER NOT NULL DEFAULT 0,
        source TEXT NOT NULL DEFAULT 'orchestrator',
        keywords_json TEXT NOT NULL DEFAULT '[]',
        demand_count INTEGER NOT NULL DEFAULT 1,
        tutor_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS tutor_reviews (
        id TEXT PRIMARY KEY,
        tutor_id TEXT NOT NULL,
        booking_id TEXT,
        student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        student_name TEXT NOT NULL DEFAULT 'Ученик',
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT NOT NULL DEFAULT '',
        tags_json TEXT NOT NULL DEFAULT '[]',
        verified_lesson INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tutor_reviews_booking
    ON tutor_reviews(booking_id)
    WHERE booking_id IS NOT NULL AND booking_id != ''
    """,
    """
    CREATE TABLE IF NOT EXISTS lesson_disputes (
        id TEXT PRIMARY KEY,
        booking_id TEXT NOT NULL UNIQUE,
        tutor_id TEXT NOT NULL,
        tutor_name TEXT NOT NULL DEFAULT '',
        student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        student_name TEXT NOT NULL DEFAULT 'Ученик',
        reason TEXT NOT NULL,
        comment TEXT NOT NULL DEFAULT '',
        amount_rub INTEGER NOT NULL DEFAULT 0,
        first_lesson_guarantee INTEGER NOT NULL DEFAULT 1,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'refunded', 'rejected', 'resolved')),
        resolution_note TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        resolved_at TEXT
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS telegram_bindings (
        chat_id TEXT PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        telegram_user_id TEXT NOT NULL DEFAULT '',
        telegram_username TEXT NOT NULL DEFAULT '',
        phone_digits TEXT NOT NULL DEFAULT '',
        first_name TEXT NOT NULL DEFAULT '',
        notifications_enabled INTEGER NOT NULL DEFAULT 1,
        linked_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_tg_bindings_user ON telegram_bindings(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_tg_bindings_phone ON telegram_bindings(phone_digits)",
    """
    CREATE TABLE IF NOT EXISTS telegram_link_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS lesson_reminders_sent (
        booking_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('24h', '1h')),
        recipient_role TEXT NOT NULL CHECK (recipient_role IN ('student', 'tutor')),
        chat_id TEXT NOT NULL DEFAULT '',
        sent_at TEXT NOT NULL,
        PRIMARY KEY (booking_id, kind, recipient_role)
    )
    """,
)


_PG_STATEMENTS = (
    "CREATE SCHEMA IF NOT EXISTS oltp",
    "CREATE SCHEMA IF NOT EXISTS outbox",
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
        phone TEXT NOT NULL DEFAULT '',
        phone_country TEXT NOT NULL DEFAULT 'RU',
        city TEXT NOT NULL DEFAULT '',
        grade TEXT NOT NULL DEFAULT '',
        goal TEXT NOT NULL DEFAULT '',
        contact_verified BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_users_email_lower
    ON oltp.users(email_lower)
    WHERE email_lower IS NOT NULL AND email_lower <> ''
    """,
    """
    CREATE TABLE IF NOT EXISTS oltp.user_identities (
        provider TEXT NOT NULL,
        provider_subject TEXT NOT NULL,
        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
        email TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (provider, provider_subject)
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_identities_user ON oltp.user_identities(user_id)",
    """
    CREATE TABLE IF NOT EXISTS oltp.oauth_states (
        state_hash TEXT PRIMARY KEY,
        provider TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS oltp.sessions (
        token_hash TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_sessions_user ON oltp.sessions(user_id)",
    """
    CREATE TABLE IF NOT EXISTS oltp.docs (
        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (user_id, name)
    )
    """,
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
    """,
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
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_calendar_events_tutor_slot ON oltp.calendar_events(tutor_slug, slot_date, hour_slot)",
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
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_realtime_notifications_channel_id ON oltp.realtime_notifications(channel, id DESC)",
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
    """,
    "CREATE INDEX IF NOT EXISTS idx_kafka_outbox_topic_created ON outbox.kafka_outbox(topic, created_at)",
    "CREATE INDEX IF NOT EXISTS idx_kafka_outbox_unpublished ON outbox.kafka_outbox(created_at) WHERE published_at IS NULL",
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
        photo_url TEXT NOT NULL DEFAULT '',
        headline TEXT NOT NULL DEFAULT '',
        bio TEXT NOT NULL DEFAULT '',
        education TEXT NOT NULL DEFAULT '',
        exp_years INTEGER NOT NULL DEFAULT 3,
        avg_score INTEGER NOT NULL DEFAULT 85,
        subjects_json JSONB NOT NULL DEFAULT '[]'::jsonb,
        exams_json JSONB NOT NULL DEFAULT '["ЕГЭ"]'::jsonb,
        formats_json JSONB NOT NULL DEFAULT '["Онлайн"]'::jsonb,
        custom_skills TEXT NOT NULL DEFAULT '',
        first_lesson_guarantee BOOLEAN NOT NULL DEFAULT TRUE,
        CONSTRAINT chk_tutor_city_tz CHECK ((city = 'Якутск' AND timezone = 'UTC+9') OR (city = 'Москва' AND timezone = 'UTC+3'))
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS oltp.tutor_slots (
        id BIGSERIAL PRIMARY KEY,
        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
        weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6),
        hour_slot TEXT NOT NULL,
        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
        UNIQUE (tutor_id, weekday, hour_slot)
    )
    """,
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
        exam TEXT NOT NULL DEFAULT 'ЕГЭ',
        format TEXT NOT NULL DEFAULT 'Онлайн',
        note TEXT NOT NULL DEFAULT '',
        telemost_url TEXT NOT NULL DEFAULT '',
        schedule_plan JSONB,
        dows JSONB NOT NULL DEFAULT '[]'::jsonb,
        day_label TEXT NOT NULL DEFAULT '',
        tutor_price_rub INTEGER,
        first_lesson_guarantee BOOLEAN NOT NULL DEFAULT TRUE,
        reserved_rub INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS oltp.escrow_holds (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL REFERENCES oltp.lesson_requests(id) ON DELETE CASCADE,
        tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
        student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
        gross_rub INTEGER NOT NULL CHECK (gross_rub > 0),
        platform_fee_rub INTEGER NOT NULL,
        tutor_payout_rub INTEGER NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('frozen', 'captured', 'refunded')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        settled_at TIMESTAMPTZ
    )
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_escrow_holds_request ON oltp.escrow_holds(request_id)",
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
    """,
    """
    CREATE TABLE IF NOT EXISTS oltp.wallets (
        user_id BIGINT PRIMARY KEY REFERENCES oltp.users(id) ON DELETE CASCADE,
        balance_rub INTEGER NOT NULL DEFAULT 0 CHECK (balance_rub >= 0),
        initial_paid BOOLEAN NOT NULL DEFAULT FALSE,
        plan_id TEXT NOT NULL DEFAULT 'trial5k',
        saved_cards JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
    """,
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
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_wallet_ledger_user ON oltp.wallet_ledger(user_id, id DESC)",
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
    """,
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
    """,
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
    """,
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
    """,
    """
    CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_tutor_reviews_booking
    ON oltp.tutor_reviews(booking_id)
    WHERE booking_id IS NOT NULL AND booking_id <> ''
    """,
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
    """,
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
    """,
    "CREATE INDEX IF NOT EXISTS idx_oltp_tg_bindings_user ON oltp.telegram_bindings(user_id)",
    "CREATE INDEX IF NOT EXISTS idx_oltp_tg_bindings_phone ON oltp.telegram_bindings(phone_digits)",
    """
    CREATE TABLE IF NOT EXISTS oltp.telegram_link_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS oltp.lesson_reminders_sent (
        booking_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('24h', '1h')),
        recipient_role TEXT NOT NULL CHECK (recipient_role IN ('student', 'tutor')),
        chat_id TEXT NOT NULL DEFAULT '',
        sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (booking_id, kind, recipient_role)
    )
    """,
)


def upgrade() -> None:
    bind = op.get_bind()
    stmts = _PG_STATEMENTS if bind.dialect.name == "postgresql" else _SQLITE_STATEMENTS
    for stmt in stmts:
        op.execute(sa.text(stmt))

    if bind.dialect.name == "sqlite":
        existing_cols = {
            row[1] for row in bind.execute(sa.text("PRAGMA table_info(users)")).fetchall()
        }
        for col_name, col_def in (
            ("role", "TEXT NOT NULL DEFAULT 'student'"),
            ("phone", "TEXT NOT NULL DEFAULT ''"),
            ("phone_country", "TEXT NOT NULL DEFAULT 'RU'"),
            ("city", "TEXT NOT NULL DEFAULT ''"),
            ("grade", "TEXT NOT NULL DEFAULT ''"),
            ("goal", "TEXT NOT NULL DEFAULT ''"),
            ("contact_verified", "INTEGER NOT NULL DEFAULT 0"),
        ):
            if col_name not in existing_cols:
                op.execute(sa.text(f"ALTER TABLE users ADD COLUMN {col_name} {col_def}"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for tbl in (
            "oltp.lesson_reminders_sent",
            "oltp.telegram_link_tokens",
            "oltp.telegram_bindings",
            "oltp.lesson_disputes",
            "oltp.tutor_reviews",
            "oltp.market_directions",
            "oltp.tutor_contact_overrides",
            "oltp.student_leads",
            "oltp.wallet_ledger",
            "oltp.wallets",
            "oltp.payout_requests",
            "oltp.escrow_holds",
            "oltp.lesson_requests",
            "oltp.tutor_slots",
            "oltp.tutors",
            "outbox.kafka_outbox",
            "oltp.realtime_notifications",
            "oltp.calendar_events",
            "oltp.calendar_sync_tokens",
            "oltp.docs",
            "oltp.sessions",
            "oltp.oauth_states",
            "oltp.user_identities",
            "oltp.users",
        ):
            op.execute(sa.text(f"DROP TABLE IF EXISTS {tbl} CASCADE"))
    else:
        for tbl in (
            "lesson_reminders_sent",
            "telegram_link_tokens",
            "telegram_bindings",
            "lesson_disputes",
            "tutor_reviews",
            "market_directions",
            "tutor_contact_overrides",
            "student_leads",
            "wallet_ledger",
            "wallets",
            "escrow_holds",
            "admin_outbox_events",
            "admin_payout_requests",
            "admin_lesson_requests",
            "admin_tutors",
            "realtime_notifications",
            "calendar_events",
            "calendar_sync_tokens",
            "docs",
            "sessions",
            "oauth_states",
            "user_identities",
            "users",
        ):
            op.execute(sa.text(f"DROP TABLE IF EXISTS {tbl}"))
