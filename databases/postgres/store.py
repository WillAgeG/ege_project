"""PostgreSQL 17 хранилище (psycopg_pool), Dual-Write и Transactional Outbox."""

from datetime import datetime, timedelta, timezone
import json
import re
import secrets
from typing import Any
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from backend.config import Settings
from databases.sqlite.store import (
    Database,
    StorageError,
    User,
    deep_merge,
    hash_password,
    hash_token,
    validate_display_name,
    validate_doc_name,
    validate_email,
    validate_password,
    validate_username,
    verify_password,
)


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


class PostgresDatabase:
    """PostgreSQL 17 хранилище с psycopg_pool и Transactional Outbox."""

    def __init__(self, database_url: str, *, min_size: int = 1, max_size: int = 10) -> None:
        self.database_url = database_url
        self._pool = ConnectionPool(
            conninfo=database_url,
            min_size=min_size,
            max_size=max_size,
            kwargs={"row_factory": dict_row},
            open=True,
        )
        self._init_schema()

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
                conn.execute(
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT TRUE"
                )
                conn.execute(
                    "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS bumped_today BOOLEAN NOT NULL DEFAULT FALSE"
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

    def create_user(
        self,
        raw_username: str,
        raw_password: str,
        *,
        email: str | None = None,
        display_name: str = "",
        max_users: int = 0,
    ) -> User:
        username = validate_username(raw_username)
        password = validate_password(raw_password)
        clean_email = validate_email(email)
        clean_display = validate_display_name(display_name)
        email_lower = clean_email.lower() if clean_email else None
        pw_hash = hash_password(password)

        with self._pool.connection() as conn:
            with conn.transaction():
                if max_users > 0:
                    cnt_row = conn.execute("SELECT COUNT(*) AS cnt FROM oltp.users").fetchone()
                    if cnt_row and int(cnt_row["cnt"]) >= max_users:
                        raise StorageError(
                            "user_limit",
                            "Достигнут лимит регистраций на этом сервере.",
                            403,
                        )
                if conn.execute(
                    "SELECT 1 FROM oltp.users WHERE username_lower = %s",
                    (username.lower(),),
                ).fetchone():
                    raise StorageError("username_taken", "Такой логин уже занят.", 409)
                if email_lower and conn.execute(
                    "SELECT 1 FROM oltp.users WHERE email_lower = %s",
                    (email_lower,),
                ).fetchone():
                    raise StorageError("email_taken", "Этот email уже зарегистрирован.", 409)

                try:
                    row = conn.execute(
                        """
                        INSERT INTO oltp.users (
                            username, username_lower, password_hash, display_name,
                            email, email_lower, avatar_url, auth_provider
                        ) VALUES (%s, %s, %s, %s, %s, %s, NULL, 'local')
                        RETURNING id, username, display_name, email, avatar_url, auth_provider, role
                        """,
                        (username, username.lower(), pw_hash, clean_display, clean_email, email_lower),
                    ).fetchone()
                except psycopg.errors.UniqueViolation as exc:
                    msg = str(exc).lower()
                    if "email" in msg:
                        raise StorageError("email_taken", "Этот email уже зарегистрирован.", 409) from exc
                    raise StorageError("username_taken", "Такой логин уже занят.", 409) from exc

                uid = int(row["id"])
                conn.execute(
                    """
                    INSERT INTO oltp.user_identities (provider, provider_subject, user_id, email)
                    VALUES ('local', %s, %s, %s)
                    ON CONFLICT (provider, provider_subject) DO NOTHING
                    """,
                    (username.lower(), uid, clean_email),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.user.clickstream.v1",
                    partition_key=str(uid),
                    event_type="auth.user.registered",
                    user_id=uid,
                    role="student",
                    view="auth",
                    payload={"username": username, "authProvider": "local"},
                )
                return _row_to_user(row)

    def ensure_user_from_sqlite(
        self,
        sqlite_row: dict[str, Any],
        *,
        emit_outbox: bool = True,
    ) -> int:
        """Находит пользователя в oltp.users по username_lower или зеркалирует его без коллизии ID."""
        username = str(sqlite_row["username"])
        username_lower = str(sqlite_row.get("username_lower") or username.lower())
        password_hash = str(sqlite_row.get("password_hash") or "")
        display_name = str(sqlite_row.get("display_name") or "")
        email = sqlite_row.get("email")
        email_lower = sqlite_row.get("email_lower") or (email.lower() if isinstance(email, str) and email else None)
        avatar_url = sqlite_row.get("avatar_url")
        auth_provider = str(sqlite_row.get("auth_provider") or "local")

        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    "SELECT id FROM oltp.users WHERE username_lower = %s",
                    (username_lower,),
                ).fetchone()
                if existing:
                    pg_uid = int(existing["id"])
                    conn.execute(
                        """
                        UPDATE oltp.users
                        SET display_name = COALESCE(NULLIF(%s, ''), display_name),
                            avatar_url = COALESCE(%s, avatar_url)
                        WHERE id = %s
                        """,
                        (display_name, avatar_url, pg_uid),
                    )
                    return pg_uid

                # Если email уже занят другим пользователем в PG (например при старых сидах), избегаем падения.
                eff_email = email
                eff_email_lower = email_lower
                if eff_email_lower and conn.execute(
                    "SELECT 1 FROM oltp.users WHERE email_lower = %s",
                    (eff_email_lower,),
                ).fetchone():
                    eff_email = None
                    eff_email_lower = None

                row = conn.execute(
                    """
                    INSERT INTO oltp.users (
                        username, username_lower, password_hash, display_name,
                        email, email_lower, avatar_url, auth_provider
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (username_lower) DO UPDATE SET
                        display_name = EXCLUDED.display_name
                    RETURNING id
                    """,
                    (
                        username,
                        username_lower,
                        password_hash,
                        display_name,
                        eff_email,
                        eff_email_lower,
                        avatar_url,
                        auth_provider,
                    ),
                ).fetchone()
                pg_uid = int(row["id"])
                if password_hash:
                    conn.execute(
                        """
                        INSERT INTO oltp.user_identities (provider, provider_subject, user_id, email)
                        VALUES ('local', %s, %s, %s)
                        ON CONFLICT (provider, provider_subject) DO NOTHING
                        """,
                        (username_lower, pg_uid, eff_email),
                    )
                if emit_outbox:
                    self._insert_outbox(
                        conn,
                        topic="vektor.user.clickstream.v1",
                        partition_key=str(pg_uid),
                        event_type="auth.user.registered",
                        user_id=pg_uid,
                        role="student",
                        view="auth",
                        payload={"username": username, "authProvider": auth_provider},
                    )
                return pg_uid

    def mirror_oauth_identity(self, provider: str, subject: str, pg_user_id: int, email: str | None) -> None:
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.user_identities (provider, provider_subject, user_id, email)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (provider, provider_subject) DO NOTHING
                    """,
                    (provider, subject, pg_user_id, email),
                )

    def authenticate(self, raw_login: str, raw_password: str) -> User | None:
        login_val = (raw_login or "").strip().lower()
        if not login_val or not isinstance(raw_password, str):
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT id, username, password_hash, display_name, email, avatar_url, auth_provider, role
                FROM oltp.users
                WHERE username_lower = %s OR (email_lower IS NOT NULL AND email_lower = %s)
                """,
                (login_val, login_val),
            ).fetchone()
        if not row or not verify_password(raw_password, str(row["password_hash"] or "")):
            return None
        return _row_to_user(row)

    def insert_oauth_state_hash(
        self,
        state_hash: str,
        provider: str,
        code_verifier: str,
        redirect_uri: str,
        ttl_sec: int = 600,
    ) -> None:
        expires_at = _utc_now() + timedelta(seconds=ttl_sec)
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM oltp.oauth_states WHERE expires_at <= NOW()")
                conn.execute(
                    """
                    INSERT INTO oltp.oauth_states (state_hash, provider, code_verifier, redirect_uri, expires_at)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (state_hash) DO NOTHING
                    """,
                    (state_hash, provider, code_verifier, redirect_uri, expires_at),
                )

    def create_oauth_state(
        self,
        provider: str,
        code_verifier: str,
        redirect_uri: str,
        ttl_sec: int = 600,
    ) -> str:
        raw_state = secrets.token_urlsafe(32)
        self.insert_oauth_state_hash(hash_token(raw_state), provider, code_verifier, redirect_uri, ttl_sec)
        return raw_state

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str] | None:
        if not raw_state:
            return None
        sh = hash_token(raw_state)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    DELETE FROM oltp.oauth_states
                    WHERE state_hash = %s AND provider = %s
                    RETURNING code_verifier, redirect_uri, expires_at
                    """,
                    (sh, provider),
                ).fetchone()
        if not row or row["expires_at"] <= _utc_now():
            return None
        return str(row["code_verifier"]), str(row["redirect_uri"])

    def _generate_unique_username(self, conn: psycopg.Connection[Any], hint: str) -> str:
        cleaned = re.sub(r"[^0-9A-Za-z_.\-]+", "_", (hint or "").strip()).strip("_.-")
        if len(cleaned) < 2:
            cleaned = "user"
        base = cleaned[:24]
        candidate = base
        for idx in range(0, 50):
            if idx > 0:
                suffix = f"_{idx}"
                candidate = base[: 32 - len(suffix)] + suffix
            if not conn.execute(
                "SELECT 1 FROM oltp.users WHERE username_lower = %s",
                (candidate.lower(),),
            ).fetchone():
                return candidate
        return f"{base[:20]}_{secrets.token_hex(3)}"

    def upsert_oauth_user(
        self,
        provider: str,
        subject: str,
        *,
        email: str | None = None,
        email_verified: bool = False,
        display_name: str = "",
        avatar_url: str | None = None,
        max_users: int = 0,
    ) -> User:
        clean_email = validate_email(email) if email else None
        email_lower = clean_email.lower() if clean_email else None
        clean_display = validate_display_name(display_name)
        clean_avatar = (avatar_url or "").strip()[:500] or None

        with self._pool.connection() as conn:
            with conn.transaction():
                id_row = conn.execute(
                    """
                    SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.auth_provider, u.role
                    FROM oltp.user_identities ui
                    JOIN oltp.users u ON u.id = ui.user_id
                    WHERE ui.provider = %s AND ui.provider_subject = %s
                    """,
                    (provider, subject),
                ).fetchone()
                if id_row:
                    uid = int(id_row["id"])
                    next_display = clean_display or str(id_row["display_name"] or "")
                    next_avatar = clean_avatar or id_row["avatar_url"]
                    next_email = clean_email if (clean_email and email_verified) else id_row["email"]
                    next_email_lower = next_email.lower() if next_email else None
                    refreshed = conn.execute(
                        """
                        UPDATE oltp.users
                        SET display_name = %s, avatar_url = %s, email = %s, email_lower = %s
                        WHERE id = %s
                        RETURNING id, username, display_name, email, avatar_url, auth_provider, role
                        """,
                        (next_display, next_avatar, next_email, next_email_lower, uid),
                    ).fetchone()
                    self._insert_outbox(
                        conn,
                        topic="vektor.user.clickstream.v1",
                        partition_key=str(uid),
                        event_type="auth.user.registered",
                        user_id=uid,
                        role="student",
                        view="auth",
                        payload={"username": str(refreshed["username"]), "authProvider": provider, "action": "login"},
                    )
                    return _row_to_user(refreshed)

                if email_lower and email_verified:
                    email_row = conn.execute(
                        """
                        SELECT id, username, display_name, email, avatar_url, auth_provider, role
                        FROM oltp.users
                        WHERE email_lower = %s
                        """,
                        (email_lower,),
                    ).fetchone()
                    if email_row:
                        uid = int(email_row["id"])
                        next_display = str(email_row["display_name"] or "") or clean_display
                        next_avatar = email_row["avatar_url"] or clean_avatar
                        refreshed = conn.execute(
                            """
                            UPDATE oltp.users
                            SET display_name = %s, avatar_url = %s
                            WHERE id = %s
                            RETURNING id, username, display_name, email, avatar_url, auth_provider, role
                            """,
                            (next_display, next_avatar, uid),
                        ).fetchone()
                        conn.execute(
                            """
                            INSERT INTO oltp.user_identities (provider, provider_subject, user_id, email)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (provider, provider_subject) DO NOTHING
                            """,
                            (provider, subject, uid, clean_email),
                        )
                        self._insert_outbox(
                            conn,
                            topic="vektor.user.clickstream.v1",
                            partition_key=str(uid),
                            event_type="auth.user.registered",
                            user_id=uid,
                            role="student",
                            view="auth",
                            payload={"username": str(refreshed["username"]), "authProvider": provider, "action": "linked"},
                        )
                        return _row_to_user(refreshed)

                if max_users > 0:
                    cnt_row = conn.execute("SELECT COUNT(*) AS cnt FROM oltp.users").fetchone()
                    if cnt_row and int(cnt_row["cnt"]) >= max_users:
                        raise StorageError(
                            "user_limit",
                            "Достигнут лимит регистраций на этом сервере.",
                            403,
                        )

                hint = (clean_email.split("@", 1)[0] if clean_email else "") or clean_display or "user"
                username = self._generate_unique_username(conn, hint)
                stored_email = clean_email if email_verified else None
                stored_email_lower = email_lower if email_verified else None
                row = conn.execute(
                    """
                    INSERT INTO oltp.users (
                        username, username_lower, password_hash, display_name,
                        email, email_lower, avatar_url, auth_provider
                    ) VALUES (%s, %s, '', %s, %s, %s, %s, %s)
                    RETURNING id, username, display_name, email, avatar_url, auth_provider
                    """,
                    (
                        username,
                        username.lower(),
                        clean_display,
                        stored_email,
                        stored_email_lower,
                        clean_avatar,
                        provider,
                    ),
                ).fetchone()
                uid = int(row["id"])
                conn.execute(
                    """
                    INSERT INTO oltp.user_identities (provider, provider_subject, user_id, email)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (provider, provider_subject) DO NOTHING
                    """,
                    (provider, subject, uid, stored_email),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.user.clickstream.v1",
                    partition_key=str(uid),
                    event_type="auth.user.registered",
                    user_id=uid,
                    role="student",
                    view="auth",
                    payload={"username": username, "authProvider": provider, "action": "created"},
                )
                return _row_to_user(row)

    def insert_session_hash(self, token_hash: str, user_id: int, ttl_sec: int) -> None:
        expires_at = _utc_now() + timedelta(seconds=ttl_sec)
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.sessions (token_hash, user_id, expires_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (token_hash) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        expires_at = EXCLUDED.expires_at
                    """,
                    (token_hash, user_id, expires_at),
                )

    def create_session(self, user_id: int, ttl_sec: int) -> str:
        raw_token = secrets.token_urlsafe(32)
        self.insert_session_hash(hash_token(raw_token), user_id, ttl_sec)
        return raw_token

    def get_user_by_token(self, raw_token: str | None) -> User | None:
        if not raw_token:
            return None
        th = hash_token(raw_token)
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.auth_provider, u.role, s.expires_at
                FROM oltp.sessions s
                JOIN oltp.users u ON u.id = s.user_id
                WHERE s.token_hash = %s
                """,
                (th,),
            ).fetchone()
            if not row:
                return None
            if row["expires_at"] <= _utc_now():
                with conn.transaction():
                    conn.execute("DELETE FROM oltp.sessions WHERE token_hash = %s", (th,))
                return None
            return _row_to_user(row)

    def delete_session(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        th = hash_token(raw_token)
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM oltp.sessions WHERE token_hash = %s", (th,))

    def get_docs(self, user_id: int) -> dict[str, dict[str, Any]]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT name, data FROM oltp.docs WHERE user_id = %s",
                (user_id,),
            ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            data = row["data"]
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    continue
            if isinstance(data, dict):
                out[str(row["name"])] = data
        return out

    def _serialize_checked(self, data: dict[str, Any], max_bytes: int) -> str:
        encoded = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
        if len(encoded.encode("utf-8")) > max_bytes:
            raise StorageError("quota_exceeded", "Документ слишком большой.", 413)
        return encoded

    def patch_doc(self, user_id: int, name: str, patch: dict[str, Any], max_bytes: int) -> None:
        validate_doc_name(name)
        if not isinstance(patch, dict):
            raise StorageError("invalid_body", "Ожидался JSON-объект.", 400)
        topic, role, view = _doc_outbox_meta(name)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT data FROM oltp.docs WHERE user_id = %s AND name = %s FOR UPDATE",
                    (user_id, name),
                ).fetchone()
                current = row["data"] if row and isinstance(row["data"], dict) else {}
                merged = deep_merge(current, patch)
                self._serialize_checked(merged, max_bytes)
                conn.execute(
                    """
                    INSERT INTO oltp.docs (user_id, name, data, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (user_id, name) DO UPDATE SET
                        data = EXCLUDED.data,
                        updated_at = NOW()
                    """,
                    (user_id, name, Jsonb(merged)),
                )
                self._insert_outbox(
                    conn,
                    topic=topic,
                    partition_key=str(user_id),
                    event_type="doc.patched",
                    user_id=user_id,
                    role=role,
                    view=view,
                    payload={"docName": name, "patchKeys": sorted(patch.keys())},
                )

    def replace_doc(self, user_id: int, name: str, data: dict[str, Any], max_bytes: int) -> None:
        validate_doc_name(name)
        if not isinstance(data, dict):
            raise StorageError("invalid_body", "Ожидался JSON-объект.", 400)
        self._serialize_checked(data, max_bytes)
        topic, role, view = _doc_outbox_meta(name)
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.docs (user_id, name, data, updated_at)
                    VALUES (%s, %s, %s, NOW())
                    ON CONFLICT (user_id, name) DO UPDATE SET
                        data = EXCLUDED.data,
                        updated_at = NOW()
                    """,
                    (user_id, name, Jsonb(data)),
                )
                self._insert_outbox(
                    conn,
                    topic=topic,
                    partition_key=str(user_id),
                    event_type="doc.replaced",
                    user_id=user_id,
                    role=role,
                    view=view,
                    payload={"docName": name, "keys": sorted(data.keys())},
                )

    def _calendar_row_to_dict(self, conn: psycopg.Connection[Any], row: dict[str, Any]) -> dict[str, Any]:
        slug = str(row["tutor_slug"])
        open_slots = row["open_slots"] if isinstance(row["open_slots"], dict) else {}
        busy_slots = row["busy_slots"] if isinstance(row["busy_slots"], list) else []
        ev_rows = conn.execute(
            """
            SELECT uid, tutor_slug, student_name, subject, exam, dow, slot_date, hour_slot,
                   duration_min, timezone, price_rub, status, source, note
            FROM oltp.calendar_events
            WHERE tutor_slug = %s AND source <> 'gcal_ics'
            ORDER BY slot_date ASC, hour_slot ASC, uid ASC
            """,
            (slug,),
        ).fetchall()
        events = [
            {
                "uid": str(r["uid"]),
                "tutorSlug": str(r["tutor_slug"]),
                "studentName": str(r["student_name"]),
                "subject": str(r["subject"]),
                "exam": str(r["exam"]),
                "dow": int(r["dow"]),
                "slotDate": r["slot_date"].isoformat()[:10] if hasattr(r["slot_date"], "isoformat") else str(r["slot_date"])[:10],
                "hour": str(r["hour_slot"]),
                "durationMin": int(r["duration_min"]),
                "timezone": str(r["timezone"]),
                "priceRub": int(r["price_rub"]),
                "status": str(r["status"]),
                "source": str(r["source"]),
                "note": str(r["note"]),
            }
            for r in ev_rows
        ]
        return {
            "feedToken": str(row["feed_token"]),
            "tutorSlug": slug,
            "tutorName": str(row["tutor_name"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "openSlots": open_slots,
            "busySlots": busy_slots,
            "events": events,
            "gcalConnected": bool(row["gcal_connected"]),
            "externalIcsUrl": row["external_ics_url"],
            "lastSyncedAt": _iso_utc(row["last_synced_at"]),
        }

    def upsert_calendar_sync(
        self,
        *,
        tutor_slug: str,
        user_id: int | None = None,
        tutor_name: str = "Преподаватель Вектор ЕГЭ",
        city: str = "Якутск",
        timezone: str = "UTC+9",
        open_slots: dict[str, list[str]] | None = None,
        events: list[dict[str, Any]] | None = None,
        external_ics_url: str | None = None,
        gcal_connected: bool | None = None,
        busy_slots: list[dict[str, Any]] | None = None,
        feed_token_override: str | None = None,
    ) -> dict[str, Any]:
        slug = (tutor_slug or "").strip() or "default-tutor"
        tz = _normalize_tz(timezone)
        today_str = _utc_now().strftime("%Y-%m-%d")

        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    "SELECT * FROM oltp.calendar_sync_tokens WHERE tutor_slug = %s FOR UPDATE",
                    (slug,),
                ).fetchone()
                feed_token = (
                    (feed_token_override or "").strip()
                    or (str(existing["feed_token"]) if existing else secrets.token_urlsafe(24))
                )
                eff_user_id = user_id if user_id is not None else (existing["user_id"] if existing else None)
                eff_name = (tutor_name or "").strip() or (str(existing["tutor_name"]) if existing else "Преподаватель Вектор ЕГЭ")
                eff_city = (city or "").strip() or (str(existing["city"]) if existing else ("Москва" if tz == "UTC+3" else "Якутск"))
                eff_open_slots = (
                    open_slots
                    if open_slots is not None
                    else (existing["open_slots"] if existing and isinstance(existing["open_slots"], dict) else {})
                )
                eff_busy_slots = (
                    busy_slots
                    if busy_slots is not None
                    else (existing["busy_slots"] if existing and isinstance(existing["busy_slots"], list) else [])
                )
                eff_gcal = (
                    bool(gcal_connected)
                    if gcal_connected is not None
                    else (bool(existing["gcal_connected"]) if existing else False)
                )
                eff_ext_url = (
                    (external_ics_url.strip() or None)
                    if external_ics_url is not None
                    else (existing["external_ics_url"] if existing else None)
                )

                token_row = conn.execute(
                    """
                    INSERT INTO oltp.calendar_sync_tokens (
                        feed_token, user_id, tutor_slug, tutor_name, city, timezone,
                        external_ics_url, gcal_connected, open_slots, busy_slots,
                        last_synced_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (tutor_slug) DO UPDATE SET
                        feed_token = EXCLUDED.feed_token,
                        user_id = EXCLUDED.user_id,
                        tutor_name = EXCLUDED.tutor_name,
                        city = EXCLUDED.city,
                        timezone = EXCLUDED.timezone,
                        external_ics_url = EXCLUDED.external_ics_url,
                        gcal_connected = EXCLUDED.gcal_connected,
                        open_slots = EXCLUDED.open_slots,
                        busy_slots = EXCLUDED.busy_slots,
                        last_synced_at = NOW(),
                        updated_at = NOW()
                    RETURNING *
                    """,
                    (
                        feed_token,
                        eff_user_id,
                        slug,
                        eff_name,
                        eff_city,
                        tz,
                        eff_ext_url,
                        eff_gcal,
                        Jsonb(eff_open_slots),
                        Jsonb(eff_busy_slots),
                    ),
                ).fetchone()

                if events is not None:
                    conn.execute(
                        "DELETE FROM oltp.calendar_events WHERE tutor_slug = %s AND source = 'vektor'",
                        (slug,),
                    )
                    for idx, ev in enumerate(events):
                        slot_date = str(ev.get("slotDate") or ev.get("slot_date") or today_str)[:10]
                        hour_slot = str(ev.get("hour") or ev.get("hourSlot") or ev.get("hour_slot") or "16:00")[:5]
                        dow = _normalize_dow(ev.get("dow"), slot_date)
                        uid = str(ev.get("uid") or f"vektor:{slug}:{slot_date}:{hour_slot}:{idx}")
                        status = str(ev.get("status") or "accepted")
                        if status not in ("accepted", "pending", "external_busy", "cancelled"):
                            status = "accepted"
                        source = str(ev.get("source") or "vektor")
                        if source not in ("vektor", "gcal_ics", "manual"):
                            source = "vektor"
                        conn.execute(
                            """
                            INSERT INTO oltp.calendar_events (
                                uid, tutor_slug, student_name, subject, exam, dow, slot_date,
                                hour_slot, duration_min, timezone, price_rub, status, source, note, updated_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW())
                            ON CONFLICT (uid) DO UPDATE SET
                                tutor_slug = EXCLUDED.tutor_slug,
                                student_name = EXCLUDED.student_name,
                                subject = EXCLUDED.subject,
                                exam = EXCLUDED.exam,
                                dow = EXCLUDED.dow,
                                slot_date = EXCLUDED.slot_date,
                                hour_slot = EXCLUDED.hour_slot,
                                duration_min = EXCLUDED.duration_min,
                                timezone = EXCLUDED.timezone,
                                price_rub = EXCLUDED.price_rub,
                                status = EXCLUDED.status,
                                source = EXCLUDED.source,
                                note = EXCLUDED.note,
                                updated_at = NOW()
                            """,
                            (
                                uid,
                                slug,
                                str(ev.get("studentName") or ev.get("student_name") or ""),
                                str(ev.get("subject") or "bio"),
                                str(ev.get("exam") or "ЕГЭ"),
                                dow,
                                slot_date,
                                hour_slot,
                                int(ev.get("durationMin") or ev.get("duration_min") or 60),
                                _normalize_tz(ev.get("timezone") or tz),
                                int(ev.get("priceRub") or ev.get("price_rub") or 0),
                                status,
                                source,
                                str(ev.get("note") or ""),
                            ),
                        )

                if busy_slots is not None:
                    conn.execute(
                        "DELETE FROM oltp.calendar_events WHERE tutor_slug = %s AND source = 'gcal_ics'",
                        (slug,),
                    )
                    for idx, bs in enumerate(busy_slots):
                        slot_date = str(bs.get("slotDate") or bs.get("slot_date") or today_str)[:10]
                        hour_slot = str(bs.get("hour") or bs.get("hourSlot") or bs.get("hour_slot") or "16:00")[:5]
                        dow = _normalize_dow(bs.get("dow"), slot_date)
                        raw_uid = str(bs.get("uid") or f"gcal-{idx}")
                        row_uid = f"gcal:{slug}:{raw_uid}:{slot_date}:{hour_slot}:{idx}"
                        summary = str(bs.get("summary") or "Занято (Google Calendar)")
                        conn.execute(
                            """
                            INSERT INTO oltp.calendar_events (
                                uid, tutor_slug, student_name, subject, exam, dow, slot_date,
                                hour_slot, duration_min, timezone, price_rub, status, source, note, updated_at
                            ) VALUES (%s, %s, %s, 'bio', 'ЕГЭ', %s, %s, %s, 60, %s, 0, 'external_busy', 'gcal_ics', %s, NOW())
                            ON CONFLICT (uid) DO UPDATE SET
                                dow = EXCLUDED.dow,
                                slot_date = EXCLUDED.slot_date,
                                hour_slot = EXCLUDED.hour_slot,
                                timezone = EXCLUDED.timezone,
                                note = EXCLUDED.note,
                                updated_at = NOW()
                            """,
                            (row_uid, slug, summary, dow, slot_date, hour_slot, tz, summary),
                        )

                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=slug,
                    event_type="calendar.synced",
                    user_id=eff_user_id,
                    role="tutor",
                    view="cabinet",
                    payload={
                        "tutorSlug": slug,
                        "timezone": tz,
                        "gcalConnected": eff_gcal,
                        "eventCount": len(events) if events is not None else None,
                        "busyCount": len(eff_busy_slots),
                    },
                )
                return self._calendar_row_to_dict(conn, token_row)

    def get_calendar_by_token(self, feed_token: str) -> dict[str, Any] | None:
        tok = (feed_token or "").strip()
        if not tok:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM oltp.calendar_sync_tokens WHERE feed_token = %s",
                (tok,),
            ).fetchone()
            if not row:
                return None
            return self._calendar_row_to_dict(conn, row)

    def get_calendar_by_slug(self, tutor_slug: str) -> dict[str, Any] | None:
        slug = (tutor_slug or "").strip()
        if not slug:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM oltp.calendar_sync_tokens WHERE tutor_slug = %s",
                (slug,),
            ).fetchone()
            if not row:
                return None
            return self._calendar_row_to_dict(conn, row)

    def _realtime_row_to_dict(self, row: dict[str, Any]) -> dict[str, Any]:
        payload = row["payload"] if isinstance(row["payload"], dict) else {}
        return {
            "id": int(row["id"]),
            "eventId": str(row["event_id"]),
            "channel": str(row["channel"]),
            "eventType": str(row["event_type"]),
            "title": str(row["title"]),
            "message": str(row["message"]),
            "tutorSlug": row["tutor_slug"],
            "payload": payload,
            "createdAt": _iso_utc(row["created_at"]),
        }

    def record_realtime_event(
        self,
        *,
        event_id: str,
        channel: str,
        event_type: str,
        title: str,
        message: str = "",
        tutor_slug: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        eid = (event_id or "").strip() or secrets.token_hex(12)
        ch = (channel or "").strip() or "tutor"
        etype = (event_type or "").strip() or "system.event"
        ttl = (title or "").strip() or "Уведомление"
        msg = str(message or "")
        slug = (tutor_slug or "").strip() or None
        payload_dict = payload or {}

        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    INSERT INTO oltp.realtime_notifications (
                        event_id, channel, tutor_slug, event_type, title, message, payload
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (event_id) DO NOTHING
                    RETURNING *
                    """,
                    (eid, ch, slug, etype, ttl, msg, Jsonb(payload_dict)),
                ).fetchone()
                if row:
                    self._insert_outbox(
                        conn,
                        topic="vektor.market.bids.v1",
                        partition_key=slug or ch,
                        event_type=etype,
                        role="tutor" if ch == "tutor" else "student",
                        view="cabinet",
                        payload={
                            "channel": ch,
                            "tutorSlug": slug,
                            "title": ttl,
                            "message": msg,
                            "data": payload_dict,
                        },
                        event_id=eid,
                    )
                else:
                    row = conn.execute(
                        "SELECT * FROM oltp.realtime_notifications WHERE event_id = %s",
                        (eid,),
                    ).fetchone()
                return self._realtime_row_to_dict(row)

    def list_realtime_events(
        self,
        *,
        channel: str | None = None,
        tutor_slug: str | None = None,
        since_id: int = 0,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 30), 200))
        clauses: list[str] = []
        params: list[Any] = []
        if channel and channel != "all":
            clauses.append("(channel = %s OR channel = 'all')")
            params.append(channel)
        if tutor_slug:
            clauses.append("tutor_slug = %s")
            params.append(tutor_slug)
        if since_id > 0:
            clauses.append("id > %s")
            params.append(int(since_id))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._pool.connection() as conn:
            if since_id > 0:
                rows = conn.execute(
                    f"SELECT * FROM oltp.realtime_notifications {where} ORDER BY id ASC LIMIT %s",
                    (*params, lim),
                ).fetchall()
                return [self._realtime_row_to_dict(r) for r in rows]
            rows = conn.execute(
                f"SELECT * FROM oltp.realtime_notifications {where} ORDER BY id DESC LIMIT %s",
                (*params, lim),
            ).fetchall()
            return [self._realtime_row_to_dict(r) for r in reversed(rows)]

    @staticmethod
    def _admin_user_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "username": str(row["username"]),
            "displayName": str(row.get("display_name") or row["username"]),
            "email": row.get("email"),
            "authProvider": str(row.get("auth_provider") or "local"),
            "role": str(row.get("role") or "student"),
            "createdAt": _iso_utc(row.get("created_at")),
        }

    @staticmethod
    def _admin_tutor_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row.get("user_id") is not None else None,
            "fullName": str(row["full_name"]),
            "subject": str(row["subject"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "baseRateRub": int(row["base_rate_rub"]),
            "marketRateRub": int(row["market_rate_rub"]),
            "sourceChannel": str(row["source_channel"]),
            "tariffId": str(row["tariff_id"]),
            "whatsappPhone": str(row.get("whatsapp_phone") or ""),
            "telegramHandle": str(row.get("telegram_handle") or ""),
            "maxHandle": str(row.get("max_handle") or ""),
            "hasPhoto": bool(row.get("has_photo", True)),
            "verified": bool(row.get("verified", True)),
            "bumpedToday": bool(row.get("bumped_today", False)),
            "rating": float(row.get("rating") or 4.9),
            "reviewsCount": int(row.get("reviews_count") or 0),
            "lastBumpedAt": _iso_utc(row.get("last_bumped_at")),
            "updatedAt": _iso_utc(row.get("updated_at")),
        }

    @staticmethod
    def _normalize_pg_request_status(raw_status: str, escrow_status: str | None) -> str:
        raw = (raw_status or "").strip().lower()
        esc = (escrow_status or "").strip().lower()
        if esc == "refunded" or raw == "cancelled":
            return "refunded"
        if raw in ("offered", "countered"):
            return "pending"
        if raw in ("accepted", "completed"):
            return "accepted"
        if raw == "declined":
            return "declined"
        return raw or "pending"

    @classmethod
    def _admin_request_row_to_dict(cls, row: dict[str, Any]) -> dict[str, Any]:
        raw_status = str(row.get("status") or "offered")
        escrow_status = str(row.get("escrow_status") or "none")
        slot_date = row.get("slot_date")
        slot_date_str = slot_date.isoformat()[:10] if hasattr(slot_date, "isoformat") else str(slot_date or "")[:10]
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row.get("tutor_name") or ""),
            "studentUserId": int(row["student_user_id"]) if row.get("student_user_id") is not None else None,
            "studentName": str(row["student_name"]),
            "subject": str(row["subject"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "slotDate": slot_date_str,
            "hourSlot": str(row["hour_slot"]),
            "tariffId": str(row["tariff_id"]),
            "offerPriceRub": int(row["offer_price_rub"]),
            "counterPriceRub": int(row["counter_price_rub"]) if row.get("counter_price_rub") is not None else None,
            "finalPriceRub": int(row["final_price_rub"]) if row.get("final_price_rub") is not None else None,
            "status": cls._normalize_pg_request_status(raw_status, escrow_status),
            "rawStatus": raw_status,
            "escrowStatus": escrow_status,
            "messengerChannel": str(row.get("messenger_channel") or "whatsapp"),
            "createdAt": _iso_utc(row.get("created_at")),
            "updatedAt": _iso_utc(row.get("updated_at")),
        }

    @staticmethod
    def _normalize_pg_payout_status(raw_status: str) -> str:
        raw = (raw_status or "").strip().lower()
        if raw == "paid":
            return "succeeded"
        if raw == "failed":
            return "rejected"
        return raw or "processing"

    @classmethod
    def _admin_payout_row_to_dict(cls, row: dict[str, Any]) -> dict[str, Any]:
        raw_status = str(row.get("status") or "pending")
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row.get("tutor_name") or ""),
            "method": str(row["method"]),
            "amountRub": int(row["amount_rub"]),
            "npdReceipt": row.get("npd_receipt"),
            "bank": str(row.get("bank") or ""),
            "destinationMasked": str(row.get("destination_masked") or ""),
            "status": cls._normalize_pg_payout_status(raw_status),
            "rawStatus": raw_status,
            "createdAt": _iso_utc(row.get("created_at")),
            "paidAt": _iso_utc(row["paid_at"]) if row.get("paid_at") is not None else None,
        }

    def admin_overview(self) -> dict[str, Any]:
        with self._pool.connection() as conn:
            users_count = int(conn.execute("SELECT COUNT(*) AS cnt FROM oltp.users").fetchone()["cnt"])
            tutors_count = int(conn.execute("SELECT COUNT(*) AS cnt FROM oltp.tutors").fetchone()["cnt"])
            req_agg = conn.execute(
                """
                SELECT COUNT(*) AS total_cnt,
                       COUNT(*) FILTER (WHERE status IN ('offered', 'countered')) AS pending_cnt
                FROM oltp.lesson_requests
                """
            ).fetchone()
            requests_count = int(req_agg["total_cnt"] or 0)
            pending_requests_count = int(req_agg["pending_cnt"] or 0)
            payouts_count = int(conn.execute("SELECT COUNT(*) AS cnt FROM oltp.payout_requests").fetchone()["cnt"])
            outbox_pending = int(
                conn.execute("SELECT COUNT(*) AS cnt FROM outbox.kafka_outbox WHERE published_at IS NULL").fetchone()["cnt"]
            )

            esc = conn.execute(
                """
                SELECT COALESCE(SUM(gross_rub), 0) AS gmv_rub,
                       COALESCE(SUM(platform_fee_rub), 0) AS fee_rub,
                       COALESCE(SUM(tutor_payout_rub), 0) AS payout_rub
                FROM oltp.escrow_holds
                WHERE status <> 'refunded'
                """
            ).fetchone()
            gmv_rub = int(esc["gmv_rub"] or 0)
            fee_rub = int(esc["fee_rub"] or 0)
            payout_rub = int(esc["payout_rub"] or 0)

            ch_rows = conn.execute(
                """
                SELECT source_channel AS channel, COUNT(*) AS cnt
                FROM oltp.tutors
                GROUP BY source_channel
                ORDER BY cnt DESC, source_channel ASC
                """
            ).fetchall()
            total_tutors = max(1, tutors_count)
            channel_share = [
                {
                    "channel": str(r["channel"]),
                    "count": int(r["cnt"]),
                    "sharePct": round(int(r["cnt"]) * 100.0 / total_tutors, 1),
                }
                for r in ch_rows
            ]

            has_gold = conn.execute("SELECT to_regclass('gold.daily_gmv_metrics') AS reg").fetchone()["reg"]
            daily_series: list[dict[str, Any]] = []
            if has_gold:
                g_rows = conn.execute(
                    """
                    SELECT metric_date,
                           COALESCE(SUM(gmv_rub), 0) AS gmv_rub,
                           COALESCE(SUM(platform_fee_rub), 0) AS fee_rub,
                           COALESCE(SUM(tutor_payout_rub), 0) AS payout_rub,
                           COALESCE(SUM(total_requests), 0) AS requests,
                           COALESCE(SUM(accepted_requests), 0) AS accepted
                    FROM gold.daily_gmv_metrics
                    GROUP BY metric_date
                    ORDER BY metric_date ASC
                    """
                ).fetchall()
                for r in g_rows:
                    d_val = r["metric_date"]
                    daily_series.append(
                        {
                            "date": d_val.isoformat()[:10] if hasattr(d_val, "isoformat") else str(d_val)[:10],
                            "gmvRub": int(r["gmv_rub"] or 0),
                            "feeRub": int(r["fee_rub"] or 0),
                            "payoutRub": int(r["payout_rub"] or 0),
                            "requests": int(r["requests"] or 0),
                            "accepted": int(r["accepted"] or 0),
                        }
                    )

        storage = self.storage_health()
        return {
            "ok": True,
            "kpi": {
                "gmvRub": gmv_rub,
                "feeRub": fee_rub,
                "payoutRub": payout_rub,
                "usersCount": users_count,
                "tutorsCount": tutors_count,
                "requestsCount": requests_count,
                "pendingRequestsCount": pending_requests_count,
                "payoutsCount": payouts_count,
                "outboxPending": outbox_pending,
            },
            "channelShare": channel_share,
            "dailySeries": daily_series,
            "storage": storage,
        }

    def admin_list_users(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT id, username, display_name, email, auth_provider, role, created_at
                FROM oltp.users
                ORDER BY id DESC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._admin_user_row_to_dict(r) for r in rows]

    def admin_set_user_role(self, user_id: int, role: str) -> dict[str, Any]:
        clean_role = (role or "").strip().lower()
        if clean_role not in ("student", "tutor", "admin"):
            raise StorageError("invalid_role", "Допустимые роли: student, tutor, admin.", 400)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    UPDATE oltp.users
                    SET role = %s
                    WHERE id = %s
                    RETURNING id, username, display_name, email, auth_provider, role, created_at
                    """,
                    (clean_role, int(user_id)),
                ).fetchone()
                if not row:
                    raise StorageError("not_found", "Пользователь не найден.", 404)
                self._insert_outbox(
                    conn,
                    topic="vektor.user.clickstream.v1",
                    partition_key=str(user_id),
                    event_type="admin.user.role_updated",
                    user_id=int(user_id),
                    role=clean_role,
                    view="admin",
                    payload={"userId": int(user_id), "username": str(row["username"]), "role": clean_role},
                )
        return self._admin_user_row_to_dict(row)

    def admin_list_tutors(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM oltp.tutors
                ORDER BY bumped_today DESC, rating DESC, id ASC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._admin_tutor_row_to_dict(r) for r in rows]

    def admin_moderate_tutor(
        self,
        tutor_id: Any,
        *,
        verified: bool | None = None,
        bumped: bool | None = None,
        tariff_id: str | None = None,
    ) -> dict[str, Any]:
        tid = str(tutor_id or "").strip()
        if tariff_id is not None and tariff_id not in ("free", "trial5k", "month10k"):
            raise StorageError("invalid_tariff", "Допустимые тарифы: free, trial5k, month10k.", 400)
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (tid,)).fetchone()
                if not existing:
                    raise StorageError("not_found", "Преподаватель не найден.", 404)
                next_verified = bool(verified) if verified is not None else bool(existing.get("verified", True))
                next_bumped = bool(bumped) if bumped is not None else bool(existing.get("bumped_today", False))
                next_tariff = tariff_id if tariff_id is not None else str(existing["tariff_id"])
                row = conn.execute(
                    """
                    UPDATE oltp.tutors
                    SET verified = %s,
                        bumped_today = %s,
                        tariff_id = %s,
                        last_bumped_at = CASE WHEN %s THEN NOW() ELSE last_bumped_at END,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING *
                    """,
                    (next_verified, next_bumped, next_tariff, bool(bumped is True), tid),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=tid,
                    event_type="admin.tutor.moderated",
                    user_id=int(existing["user_id"]) if existing.get("user_id") is not None else None,
                    role="admin",
                    view="admin",
                    payload={
                        "tutorId": tid,
                        "verified": next_verified,
                        "bumpedToday": next_bumped,
                        "tariffId": next_tariff,
                    },
                )
        return self._admin_tutor_row_to_dict(row)

    def admin_list_requests(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT lr.*,
                       COALESCE(t.full_name, '') AS tutor_name,
                       COALESCE(eh.status, 'none') AS escrow_status
                FROM oltp.lesson_requests lr
                LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                LEFT JOIN oltp.escrow_holds eh ON eh.request_id = lr.id
                ORDER BY lr.slot_date DESC, lr.hour_slot DESC, lr.id ASC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._admin_request_row_to_dict(r) for r in rows]

    def admin_set_request_status(self, req_id: Any, status: str) -> dict[str, Any]:
        rid = str(req_id or "").strip()
        clean_status = (status or "").strip().lower()
        if clean_status not in ("accepted", "pending", "declined", "refunded"):
            raise StorageError(
                "invalid_status",
                "Допустимые статусы заявки: accepted, pending, declined, refunded.",
                400,
            )
        pg_status_map = {
            "accepted": "accepted",
            "pending": "offered",
            "declined": "declined",
            "refunded": "cancelled",
        }
        target_pg_status = pg_status_map[clean_status]
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    "SELECT * FROM oltp.lesson_requests WHERE id = %s FOR UPDATE",
                    (rid,),
                ).fetchone()
                if not existing:
                    raise StorageError("not_found", "Заявка не найдена.", 404)
                if clean_status == "accepted":
                    conn.execute(
                        """
                        UPDATE oltp.lesson_requests
                        SET status = %s,
                            final_price_rub = COALESCE(final_price_rub, counter_price_rub, offer_price_rub),
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (target_pg_status, rid),
                    )
                    conn.execute(
                        """
                        UPDATE oltp.escrow_holds
                        SET status = 'captured', settled_at = NOW()
                        WHERE request_id = %s
                        """,
                        (rid,),
                    )
                elif clean_status == "pending":
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = %s, updated_at = NOW() WHERE id = %s",
                        (target_pg_status, rid),
                    )
                    conn.execute(
                        """
                        UPDATE oltp.escrow_holds
                        SET status = 'frozen', settled_at = NULL
                        WHERE request_id = %s
                        """,
                        (rid,),
                    )
                else:
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = %s, updated_at = NOW() WHERE id = %s",
                        (target_pg_status, rid),
                    )
                    conn.execute(
                        """
                        UPDATE oltp.escrow_holds
                        SET status = 'refunded', settled_at = NOW()
                        WHERE request_id = %s
                        """,
                        (rid,),
                    )
                topic = "vektor.payments.ledger.v1" if clean_status == "refunded" else "vektor.market.bids.v1"
                self._insert_outbox(
                    conn,
                    topic=topic,
                    partition_key=rid,
                    event_type=f"admin.request.{clean_status}",
                    user_id=int(existing["student_user_id"]) if existing.get("student_user_id") is not None else None,
                    role="admin",
                    view="admin",
                    payload={"requestId": rid, "status": clean_status, "pgStatus": target_pg_status},
                )
                row = conn.execute(
                    """
                    SELECT lr.*,
                           COALESCE(t.full_name, '') AS tutor_name,
                           COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN oltp.escrow_holds eh ON eh.request_id = lr.id
                    WHERE lr.id = %s
                    """,
                    (rid,),
                ).fetchone()
        return self._admin_request_row_to_dict(row)

    def admin_list_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                FROM oltp.payout_requests p
                LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                ORDER BY p.created_at DESC, p.id ASC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._admin_payout_row_to_dict(r) for r in rows]

    def admin_set_payout_status(self, payout_id: Any, status: str) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        clean_status = (status or "").strip().lower()
        if clean_status not in ("succeeded", "processing", "rejected"):
            raise StorageError(
                "invalid_status",
                "Допустимые статусы выплаты: succeeded, processing, rejected.",
                400,
            )
        pg_status_map = {
            "succeeded": "paid",
            "processing": "processing",
            "rejected": "failed",
        }
        target_pg_status = pg_status_map[clean_status]
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    "SELECT * FROM oltp.payout_requests WHERE id = %s FOR UPDATE",
                    (pid,),
                ).fetchone()
                if not existing:
                    raise StorageError("not_found", "Выплата не найдена.", 404)
                conn.execute(
                    """
                    UPDATE oltp.payout_requests
                    SET status = %s,
                        paid_at = CASE WHEN %s = 'paid' THEN NOW() ELSE NULL END
                    WHERE id = %s
                    """,
                    (target_pg_status, target_pg_status, pid),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=pid,
                    event_type=f"admin.payout.{clean_status}",
                    role="admin",
                    view="admin",
                    payload={
                        "payoutId": pid,
                        "status": clean_status,
                        "pgStatus": target_pg_status,
                        "amountRub": int(existing["amount_rub"]),
                    },
                )
                row = conn.execute(
                    """
                    SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.payout_requests p
                    LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                    WHERE p.id = %s
                    """,
                    (pid,),
                ).fetchone()
        return self._admin_payout_row_to_dict(row)

    def admin_list_outbox(self, limit: int = 50) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 50), 200))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT id, topic, partition_key, payload, created_at, published_at
                FROM outbox.kafka_outbox
                ORDER BY id DESC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            payload = r["payload"] if isinstance(r["payload"], dict) else {}
            out.append(
                {
                    "id": int(r["id"]),
                    "topic": str(r["topic"]),
                    "partitionKey": str(r["partition_key"]),
                    "eventType": str(payload.get("event_type") or ""),
                    "payload": payload,
                    "createdAt": _iso_utc(r["created_at"]),
                    "publishedAt": _iso_utc(r["published_at"]) if r["published_at"] is not None else None,
                    "status": "published" if r["published_at"] is not None else "pending",
                }
            )
        return out


class DualWriteDatabase:
    """Адаптер двойной записи: SQLite (primary) + PostgreSQL 17 (mirror + outbox)."""

    def __init__(self, sqlite_db: Database, pg_db: PostgresDatabase) -> None:
        self.sqlite = sqlite_db
        self.pg = pg_db

    def close(self) -> None:
        try:
            self.sqlite.close()
        finally:
            self.pg.close()

    def ping(self) -> None:
        self.sqlite.ping()
        self.pg.ping()

    def storage_health(self) -> dict[str, Any]:
        self.sqlite.ping()
        pg_health = self.pg.storage_health()
        return {
            "ok": True,
            "mode": "dual",
            "sqlite": "ok",
            "postgres": pg_health["postgres"],
            "outboxPending": pg_health["outboxPending"],
        }

    def _sqlite_user_row(self, user_id: int) -> dict[str, Any] | None:
        with self.sqlite._lock:
            row = self.sqlite._conn.execute(
                """
                SELECT id, username, username_lower, password_hash, display_name,
                       email, email_lower, avatar_url, auth_provider, role
                FROM users WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        return dict(row) if row else None

    def _resolve_pg_user_id(self, sqlite_user_id: int, *, emit_outbox: bool = False) -> int | None:
        row = self._sqlite_user_row(sqlite_user_id)
        if not row:
            return None
        return self.pg.ensure_user_from_sqlite(row, emit_outbox=emit_outbox)

    def create_user(
        self,
        raw_username: str,
        raw_password: str,
        *,
        email: str | None = None,
        display_name: str = "",
        max_users: int = 0,
    ) -> User:
        user = self.sqlite.create_user(
            raw_username,
            raw_password,
            email=email,
            display_name=display_name,
            max_users=max_users,
        )
        row = self._sqlite_user_row(user.id)
        if row:
            self.pg.ensure_user_from_sqlite(row, emit_outbox=True)
        return user

    def authenticate(self, raw_login: str, raw_password: str) -> User | None:
        return self.sqlite.authenticate(raw_login, raw_password)

    def create_oauth_state(
        self,
        provider: str,
        code_verifier: str,
        redirect_uri: str,
        ttl_sec: int = 600,
    ) -> str:
        raw_state = self.sqlite.create_oauth_state(provider, code_verifier, redirect_uri, ttl_sec)
        self.pg.insert_oauth_state_hash(
            hash_token(raw_state), provider, code_verifier, redirect_uri, ttl_sec
        )
        return raw_state

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str] | None:
        res = self.sqlite.consume_oauth_state(raw_state, provider)
        self.pg.consume_oauth_state(raw_state, provider)
        return res

    def upsert_oauth_user(
        self,
        provider: str,
        subject: str,
        *,
        email: str | None = None,
        email_verified: bool = False,
        display_name: str = "",
        avatar_url: str | None = None,
        max_users: int = 0,
    ) -> User:
        user = self.sqlite.upsert_oauth_user(
            provider,
            subject,
            email=email,
            email_verified=email_verified,
            display_name=display_name,
            avatar_url=avatar_url,
            max_users=max_users,
        )
        row = self._sqlite_user_row(user.id)
        if row:
            pg_uid = self.pg.ensure_user_from_sqlite(row, emit_outbox=True)
            self.pg.mirror_oauth_identity(provider, subject, pg_uid, user.email)
        return user

    def create_session(self, user_id: int, ttl_sec: int) -> str:
        raw_token = self.sqlite.create_session(user_id, ttl_sec)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.insert_session_hash(hash_token(raw_token), pg_uid, ttl_sec)
        return raw_token

    def get_user_by_token(self, raw_token: str | None) -> User | None:
        return self.sqlite.get_user_by_token(raw_token)

    def delete_session(self, raw_token: str | None) -> None:
        self.sqlite.delete_session(raw_token)
        self.pg.delete_session(raw_token)

    def get_docs(self, user_id: int) -> dict[str, dict[str, Any]]:
        return self.sqlite.get_docs(user_id)

    def patch_doc(self, user_id: int, name: str, patch: dict[str, Any], max_bytes: int) -> None:
        self.sqlite.patch_doc(user_id, name, patch, max_bytes)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.patch_doc(pg_uid, name, patch, max_bytes)

    def replace_doc(self, user_id: int, name: str, data: dict[str, Any], max_bytes: int) -> None:
        self.sqlite.replace_doc(user_id, name, data, max_bytes)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.replace_doc(pg_uid, name, data, max_bytes)

    def upsert_calendar_sync(
        self,
        *,
        tutor_slug: str,
        user_id: int | None = None,
        tutor_name: str = "Преподаватель Вектор ЕГЭ",
        city: str = "Якутск",
        timezone: str = "UTC+9",
        open_slots: dict[str, list[str]] | None = None,
        events: list[dict[str, Any]] | None = None,
        external_ics_url: str | None = None,
        gcal_connected: bool | None = None,
        busy_slots: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.upsert_calendar_sync(
            tutor_slug=tutor_slug,
            user_id=user_id,
            tutor_name=tutor_name,
            city=city,
            timezone=timezone,
            open_slots=open_slots,
            events=events,
            external_ics_url=external_ics_url,
            gcal_connected=gcal_connected,
            busy_slots=busy_slots,
        )
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False) if user_id is not None else None
        self.pg.upsert_calendar_sync(
            tutor_slug=tutor_slug,
            user_id=pg_uid,
            tutor_name=tutor_name,
            city=city,
            timezone=timezone,
            open_slots=open_slots,
            events=events,
            external_ics_url=external_ics_url,
            gcal_connected=gcal_connected,
            busy_slots=busy_slots,
            feed_token_override=res["feedToken"],
        )
        return res

    def get_calendar_by_token(self, feed_token: str) -> dict[str, Any] | None:
        return self.sqlite.get_calendar_by_token(feed_token) or self.pg.get_calendar_by_token(feed_token)

    def get_calendar_by_slug(self, tutor_slug: str) -> dict[str, Any] | None:
        return self.sqlite.get_calendar_by_slug(tutor_slug) or self.pg.get_calendar_by_slug(tutor_slug)

    def record_realtime_event(
        self,
        *,
        event_id: str,
        channel: str,
        event_type: str,
        title: str,
        message: str = "",
        tutor_slug: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.record_realtime_event(
            event_id=event_id,
            channel=channel,
            event_type=event_type,
            title=title,
            message=message,
            tutor_slug=tutor_slug,
            payload=payload,
        )
        self.pg.record_realtime_event(
            event_id=res["eventId"],
            channel=channel,
            event_type=event_type,
            title=title,
            message=message,
            tutor_slug=tutor_slug,
            payload=payload,
        )
        return res

    def list_realtime_events(
        self,
        *,
        channel: str | None = None,
        tutor_slug: str | None = None,
        since_id: int = 0,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_realtime_events(
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=limit,
        )

    def admin_overview(self) -> dict[str, Any]:
        data = self.pg.admin_overview()
        data["storage"] = self.storage_health()
        data["kpi"]["outboxPending"] = int(data["storage"].get("outboxPending") or 0)
        return data

    def admin_list_users(self, limit: int = 100) -> list[dict[str, Any]]:
        return self.pg.admin_list_users(limit=limit)

    def admin_set_user_role(self, user_id: int, role: str) -> dict[str, Any]:
        updated = self.pg.admin_set_user_role(user_id, role)
        uname_lower = str(updated.get("username") or "").lower()
        if uname_lower:
            with self.sqlite._lock:
                self.sqlite._conn.execute(
                    "UPDATE users SET role = ? WHERE username_lower = ?",
                    (updated["role"], uname_lower),
                )
                self.sqlite._conn.commit()
        return updated

    def admin_list_tutors(self, limit: int = 100) -> list[dict[str, Any]]:
        return self.pg.admin_list_tutors(limit=limit)

    def admin_moderate_tutor(
        self,
        tutor_id: Any,
        *,
        verified: bool | None = None,
        bumped: bool | None = None,
        tariff_id: str | None = None,
    ) -> dict[str, Any]:
        updated = self.pg.admin_moderate_tutor(
            tutor_id,
            verified=verified,
            bumped=bumped,
            tariff_id=tariff_id,
        )
        try:
            self.sqlite.admin_moderate_tutor(
                tutor_id,
                verified=verified,
                bumped=bumped,
                tariff_id=tariff_id,
            )
        except StorageError as exc:
            if exc.code != "not_found":
                raise
        return updated

    def admin_list_requests(self, limit: int = 100) -> list[dict[str, Any]]:
        return self.pg.admin_list_requests(limit=limit)

    def admin_set_request_status(self, req_id: Any, status: str) -> dict[str, Any]:
        updated = self.pg.admin_set_request_status(req_id, status)
        try:
            self.sqlite.admin_set_request_status(req_id, status)
        except StorageError as exc:
            if exc.code != "not_found":
                raise
        return updated

    def admin_list_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        return self.pg.admin_list_payouts(limit=limit)

    def admin_set_payout_status(self, payout_id: Any, status: str) -> dict[str, Any]:
        updated = self.pg.admin_set_payout_status(payout_id, status)
        try:
            self.sqlite.admin_set_payout_status(payout_id, status)
        except StorageError as exc:
            if exc.code != "not_found":
                raise
        return updated

    def admin_list_outbox(self, limit: int = 50) -> list[dict[str, Any]]:
        return self.pg.admin_list_outbox(limit=limit)


def create_store(settings: Settings) -> Database | PostgresDatabase | DualWriteDatabase:
    """Фабрика хранилища по настройкам DATABASE_URL и DB_MODE."""
    mode = (settings.db_mode or "auto").strip().lower()
    if not settings.database_url or mode == "sqlite":
        return Database(settings.db_path)
    if mode == "postgres":
        return PostgresDatabase(settings.database_url)
    return DualWriteDatabase(Database(settings.db_path), PostgresDatabase(settings.database_url))
