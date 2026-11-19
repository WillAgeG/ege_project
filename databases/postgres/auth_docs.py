"""Авторизация, OAuth, сессии и документы прогресса (PostgreSQL 17)."""

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

from databases.sqlite.common import (
    StorageError,
    User,
    deep_merge,
    hash_password,
    hash_token,
    validate_display_name,
    validate_doc_name,
    validate_email,
    validate_password,
    validate_registration_role,
    validate_username,
    verify_password,
)
from .schema import _build_envelope, _doc_outbox_meta, _iso_utc, _row_to_user, _utc_now


class PgAuthDocsMixin:
    def _sync_user_profile_from_doc(
        self, conn: psycopg.Connection[Any], user_id: int, doc: dict[str, Any], changed_keys: set[str]
    ) -> None:
        sets: list[str] = []
        params: list[Any] = []
        if "name" in changed_keys:
            clean_name = validate_display_name(doc.get("name"))
            if clean_name:
                sets.append("display_name = %s")
                params.append(clean_name)
        if "photo" in changed_keys:
            raw_photo = str(doc.get("photo") or "").strip()
            sets.append("avatar_url = %s")
            params.append(raw_photo[:220_000] if raw_photo else None)
        if "phone" in changed_keys:
            sets.append("phone = %s")
            params.append(str(doc.get("phone") or "").strip()[:32])
        if "phoneCountry" in changed_keys:
            sets.append("phone_country = %s")
            params.append(str(doc.get("phoneCountry") or "RU").strip().upper()[:12] or "RU")
        if "city" in changed_keys:
            sets.append("city = %s")
            params.append(str(doc.get("city") or "").strip()[:64])
        if "grade" in changed_keys:
            sets.append("grade = %s")
            params.append(str(doc.get("grade") or "").strip()[:64])
        if "goal" in changed_keys:
            sets.append("goal = %s")
            params.append(str(doc.get("goal") or "").strip()[:320])
        if "contactVerified" in changed_keys:
            sets.append("contact_verified = %s")
            params.append(bool(doc.get("contactVerified")))
        if sets:
            params.append(int(user_id))
            conn.execute(f"UPDATE oltp.users SET {', '.join(sets)} WHERE id = %s", tuple(params))

    def create_user(
        self,
        raw_username: str,
        raw_password: str,
        *,
        email: str | None = None,
        display_name: str = "",
        role: str = "student",
        max_users: int = 0,
    ) -> User:
        username = validate_username(raw_username)
        password = validate_password(raw_password)
        clean_email = validate_email(email)
        clean_display = validate_display_name(display_name)
        clean_role = validate_registration_role(role)
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
                            email, email_lower, avatar_url, auth_provider, role
                        ) VALUES (%s, %s, %s, %s, %s, %s, NULL, 'local', %s)
                        RETURNING id, username, display_name, email, avatar_url, auth_provider, role
                        """,
                        (username, username.lower(), pw_hash, clean_display, clean_email, email_lower, clean_role),
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
                    role=clean_role,
                    view="auth",
                    payload={"username": username, "authProvider": "local", "role": clean_role},
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
        raw_role = str(sqlite_row.get("role") or "student").strip().lower()
        role = raw_role if raw_role in ("student", "tutor", "admin") else "student"

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
                        email, email_lower, avatar_url, auth_provider, role
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
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
                        role,
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
                        role=role,
                        view="auth",
                        payload={"username": username, "authProvider": auth_provider, "role": role},
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
                    RETURNING id, username, display_name, email, avatar_url, auth_provider, role
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
                if name == "profile":
                    self._sync_user_profile_from_doc(conn, user_id, merged, set(patch.keys()))
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
                if name == "profile":
                    self._sync_user_profile_from_doc(conn, user_id, data, set(data.keys()))
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
