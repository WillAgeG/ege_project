"""Авторизация, OAuth, сессии и документы прогресса (PostgreSQL 17)."""

from datetime import datetime, timedelta, timezone
import hmac
import json
import re
import secrets
import time
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
        *,
        role: str = "student",
        next_url: str = "/",
    ) -> None:
        clean_role = validate_registration_role(role)
        clean_next = str(next_url or "/").strip()[:256] or "/"
        expires_at = _utc_now() + timedelta(seconds=ttl_sec)
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM oltp.oauth_states WHERE expires_at <= NOW()")
                conn.execute(
                    """
                    INSERT INTO oltp.oauth_states (state_hash, provider, code_verifier, redirect_uri, role, next_url, expires_at)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (state_hash) DO NOTHING
                    """,
                    (state_hash, provider, code_verifier, redirect_uri, clean_role, clean_next, expires_at),
                )

    def create_oauth_state(
        self,
        provider: str,
        code_verifier: str,
        redirect_uri: str,
        ttl_sec: int = 600,
        *,
        role: str = "student",
        next_url: str = "/",
    ) -> str:
        raw_state = secrets.token_urlsafe(32)
        self.insert_oauth_state_hash(
            hash_token(raw_state),
            provider,
            code_verifier,
            redirect_uri,
            ttl_sec,
            role=role,
            next_url=next_url,
        )
        return raw_state

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str, str, str] | None:
        if not raw_state:
            return None
        sh = hash_token(raw_state)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    DELETE FROM oltp.oauth_states
                    WHERE state_hash = %s AND provider = %s
                    RETURNING code_verifier, redirect_uri, role, next_url, expires_at
                    """,
                    (sh, provider),
                ).fetchone()
        if not row or row["expires_at"] <= _utc_now():
            return None
        role_val = "tutor" if str(row.get("role") or "").strip().lower() == "tutor" else "student"
        next_val = str(row.get("next_url") or "/").strip()[:256] or "/"
        return str(row["code_verifier"]), str(row["redirect_uri"]), role_val, next_val

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
        role: str = "student",
        max_users: int = 0,
    ) -> User:
        clean_email = validate_email(email) if email else None
        email_lower = clean_email.lower() if clean_email else None
        clean_display = validate_display_name(display_name)
        clean_avatar = (avatar_url or "").strip()[:500] or None
        clean_role = validate_registration_role(role)

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

                phone_digits = re.sub(r"\D+", "", subject) if provider in ("phone", "telegram") else ""
                phone_hint = f"u_{phone_digits[-4:]}" if len(phone_digits) >= 4 else ""
                hint = (clean_email.split("@", 1)[0] if clean_email else "") or phone_hint or clean_display or "user"
                username = self._generate_unique_username(conn, hint)
                stored_email = clean_email if email_verified else None
                stored_email_lower = email_lower if email_verified else None
                row = conn.execute(
                    """
                    INSERT INTO oltp.users (
                        username, username_lower, password_hash, display_name,
                        email, email_lower, avatar_url, auth_provider, role
                    ) VALUES (%s, %s, '', %s, %s, %s, %s, %s, %s)
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
                        clean_role,
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
                    role=clean_role,
                    view="auth",
                    payload={"username": username, "authProvider": provider, "role": clean_role, "action": "created"},
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

    def find_user_id_by_username(self, username_lower: str) -> int | None:
        clean = (username_lower or "").strip().lower()
        if not clean:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT id FROM oltp.users WHERE username_lower = %s",
                (clean,),
            ).fetchone()
            return int(row["id"]) if row else None

    def export_user_data(self, user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        with self._pool.connection() as conn:
            u = conn.execute(
                """
                SELECT id, username, display_name, email, avatar_url, auth_provider, role,
                       phone, phone_country, city, grade, goal, contact_verified, created_at
                FROM oltp.users WHERE id = %s
                """,
                (uid,),
            ).fetchone()
            if not u:
                raise StorageError("not_found", "Пользователь не найден.", 404)
            id_rows = conn.execute(
                "SELECT provider, email, created_at FROM oltp.user_identities WHERE user_id = %s ORDER BY created_at",
                (uid,),
            ).fetchall()
            doc_rows = conn.execute(
                "SELECT name, data, updated_at FROM oltp.docs WHERE user_id = %s ORDER BY name",
                (uid,),
            ).fetchall()
            wallet_row = conn.execute(
                "SELECT balance_rub, initial_paid, plan_id, saved_cards, updated_at FROM oltp.wallets WHERE user_id = %s",
                (uid,),
            ).fetchone()
            bk_rows = conn.execute(
                """
                SELECT lr.id, lr.tutor_id, COALESCE(t.full_name, '') AS tutor_name, lr.subject, lr.exam, lr.format,
                       lr.city, lr.timezone, lr.slot_date, lr.hour_slot, lr.offer_price_rub,
                       lr.counter_price_rub, lr.final_price_rub, lr.status, lr.created_at
                FROM oltp.lesson_requests lr
                LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                WHERE lr.student_user_id = %s
                ORDER BY lr.created_at DESC
                """,
                (uid,),
            ).fetchall()
            lead_rows = conn.execute(
                """
                SELECT id, student_name, subjects, exam, format, target_price_rub,
                       whatsapp, whatsapp_country, comment, status, created_at
                FROM oltp.student_leads WHERE student_user_id = %s ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()
            rev_rows = conn.execute(
                """
                SELECT id, tutor_id, booking_id, rating, comment, tags, verified_lesson, created_at
                FROM oltp.tutor_reviews WHERE student_user_id = %s ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()
            dsp_rows = conn.execute(
                """
                SELECT id, booking_id, tutor_id, tutor_name, reason, comment, amount_rub,
                       first_lesson_guarantee, status, resolution_note, created_at, resolved_at
                FROM oltp.lesson_disputes WHERE student_user_id = %s ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()

        docs_out: dict[str, Any] = {}
        for row in doc_rows:
            data = row["data"]
            if isinstance(data, str):
                try:
                    data = json.loads(data)
                except json.JSONDecodeError:
                    continue
            if isinstance(data, dict):
                docs_out[str(row["name"])] = data

        saved_cards: list[Any] = []
        if wallet_row:
            raw_cards = wallet_row["saved_cards"]
            if isinstance(raw_cards, str):
                try:
                    raw_cards = json.loads(raw_cards)
                except json.JSONDecodeError:
                    raw_cards = []
            if isinstance(raw_cards, list):
                saved_cards = raw_cards

        return {
            "schema": "vektor-ege-personal-data-v1",
            "exportedAt": _iso_utc(_utc_now()),
            "legalBasis": "152-FZ",
            "account": {
                "id": int(u["id"]),
                "username": str(u["username"]),
                "displayName": str(u["display_name"] or ""),
                "email": u["email"],
                "avatarUrl": u["avatar_url"],
                "authProvider": str(u["auth_provider"] or "local"),
                "role": str(u["role"] or "student"),
                "phone": str(u["phone"] or ""),
                "phoneCountry": str(u["phone_country"] or "RU"),
                "city": str(u["city"] or ""),
                "grade": str(u["grade"] or ""),
                "goal": str(u["goal"] or ""),
                "contactVerified": bool(u["contact_verified"]),
                "createdAt": _iso_utc(u["created_at"]),
            },
            "identities": [
                {
                    "provider": str(r["provider"]),
                    "email": r["email"],
                    "createdAt": _iso_utc(r["created_at"]),
                }
                for r in id_rows
            ],
            "docs": docs_out,
            "wallet": {
                "balanceRub": int(wallet_row["balance_rub"]) if wallet_row else 0,
                "initialPaid": bool(wallet_row["initial_paid"]) if wallet_row else False,
                "planId": str(wallet_row["plan_id"]) if wallet_row else "trial5k",
                "savedCards": saved_cards,
                "updatedAt": _iso_utc(wallet_row["updated_at"]) if wallet_row else None,
            },
            "bookings": [
                {
                    "id": str(r["id"]),
                    "tutorId": str(r["tutor_id"]),
                    "tutorName": str(r["tutor_name"] or ""),
                    "subject": str(r["subject"] or ""),
                    "exam": str(r["exam"] or "ЕГЭ"),
                    "format": str(r["format"] or "Онлайн"),
                    "city": str(r["city"] or ""),
                    "timezone": str(r["timezone"] or "UTC+9"),
                    "slotDate": str(r["slot_date"]),
                    "hour": str(r["hour_slot"]),
                    "offerPriceRub": int(r["offer_price_rub"] or 0),
                    "counterPriceRub": int(r["counter_price_rub"]) if r["counter_price_rub"] is not None else None,
                    "finalPriceRub": int(r["final_price_rub"]) if r["final_price_rub"] is not None else None,
                    "status": str(r["status"]),
                    "createdAt": _iso_utc(r["created_at"]),
                }
                for r in bk_rows
            ],
            "leads": [
                {
                    "id": str(r["id"]),
                    "studentName": str(r["student_name"] or ""),
                    "subjects": r["subjects"] if isinstance(r["subjects"], list) else [],
                    "exam": str(r["exam"] or "ЕГЭ"),
                    "format": str(r["format"] or "Онлайн"),
                    "targetPriceRub": int(r["target_price_rub"] or 0),
                    "whatsapp": str(r["whatsapp"] or ""),
                    "whatsappCountry": str(r["whatsapp_country"] or "RU"),
                    "comment": str(r["comment"] or ""),
                    "status": str(r["status"]),
                    "createdAt": _iso_utc(r["created_at"]),
                }
                for r in lead_rows
            ],
            "reviews": [
                {
                    "id": str(r["id"]),
                    "tutorId": str(r["tutor_id"]),
                    "bookingId": r["booking_id"],
                    "rating": int(r["rating"]),
                    "comment": str(r["comment"] or ""),
                    "tags": r["tags"] if isinstance(r["tags"], list) else [],
                    "verifiedLesson": bool(r["verified_lesson"]),
                    "createdAt": _iso_utc(r["created_at"]),
                }
                for r in rev_rows
            ],
            "disputes": [
                {
                    "id": str(r["id"]),
                    "bookingId": str(r["booking_id"]),
                    "tutorId": str(r["tutor_id"]),
                    "tutorName": str(r["tutor_name"] or ""),
                    "reason": str(r["reason"]),
                    "comment": str(r["comment"] or ""),
                    "amountRub": int(r["amount_rub"] or 0),
                    "firstLessonGuarantee": bool(r["first_lesson_guarantee"]),
                    "status": str(r["status"]),
                    "resolutionNote": str(r["resolution_note"] or ""),
                    "createdAt": _iso_utc(r["created_at"]),
                    "resolvedAt": _iso_utc(r["resolved_at"]) if r["resolved_at"] else None,
                }
                for r in dsp_rows
            ],
            "telegramBinding": self.get_telegram_binding_by_user(uid) if hasattr(self, "get_telegram_binding_by_user") else None,
        }

    def delete_user_account(self, user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        with self._pool.connection() as conn:
            with conn.transaction():
                exists = conn.execute("SELECT id FROM oltp.users WHERE id = %s FOR UPDATE", (uid,)).fetchone()
                if not exists:
                    raise StorageError("not_found", "Пользователь не найден.", 404)
                sess_row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM oltp.sessions WHERE user_id = %s",
                    (uid,),
                ).fetchone()
                revoked_sessions = int(sess_row["cnt"]) if sess_row else 0
                conn.execute("DELETE FROM oltp.calendar_sync_tokens WHERE user_id = %s", (uid,))
                conn.execute("DELETE FROM oltp.student_leads WHERE student_user_id = %s", (uid,))
                conn.execute(
                    """
                    UPDATE oltp.tutors
                    SET user_id = NULL,
                        full_name = 'Удалённый преподаватель',
                        whatsapp_phone = '',
                        telegram_handle = '',
                        max_handle = '',
                        photo_url = '',
                        bio = '',
                        education = '',
                        verified = FALSE,
                        updated_at = NOW()
                    WHERE user_id = %s
                    """,
                    (uid,),
                )
                req_res = conn.execute(
                    """
                    UPDATE oltp.lesson_requests
                    SET student_user_id = NULL,
                        student_name = 'Удалённый пользователь',
                        note = '',
                        updated_at = NOW()
                    WHERE student_user_id = %s
                    """,
                    (uid,),
                )
                anonymized_bookings = int(req_res.rowcount or 0)
                conn.execute(
                    """
                    UPDATE oltp.tutor_reviews
                    SET student_user_id = NULL, student_name = 'Удалённый пользователь'
                    WHERE student_user_id = %s
                    """,
                    (uid,),
                )
                conn.execute(
                    """
                    UPDATE oltp.lesson_disputes
                    SET student_user_id = NULL, student_name = 'Удалённый пользователь'
                    WHERE student_user_id = %s
                    """,
                    (uid,),
                )
                conn.execute("DELETE FROM oltp.users WHERE id = %s", (uid,))
                self._insert_outbox(
                    conn,
                    topic="vektor.user.clickstream.v1",
                    partition_key=str(uid),
                    event_type="auth.user.deleted",
                    user_id=None,
                    role="student",
                    view="profile",
                    payload={"deletedUserId": uid, "reason": "user_request_152fz"},
                )
                return {
                    "deleted": True,
                    "userId": uid,
                    "revokedSessions": revoked_sessions,
                    "anonymizedBookings": anonymized_bookings,
                }

    # ---------- Персистентный RateLimiter и PhoneOtpStore ----------

    def check_rate_limit(
        self,
        key: str,
        limit: int,
        window_sec: int,
        *,
        now_ts: float | None = None,
    ) -> tuple[bool, int]:
        now = float(now_ts if now_ts is not None else time.time())
        win = max(1.0, float(window_sec))
        lim = max(1, int(limit))
        cutoff = now - win
        clean_key = str(key or "").strip()[:160]
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (clean_key,))
                conn.execute(
                    "DELETE FROM oltp.rate_limit_hits WHERE bucket_key = %s AND created_at <= %s",
                    (clean_key, cutoff),
                )
                row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM oltp.rate_limit_hits WHERE bucket_key = %s AND created_at > %s",
                    (clean_key, cutoff),
                ).fetchone()
                cnt = int(row["cnt"]) if row else 0
                if cnt >= lim:
                    return False, cnt
                conn.execute(
                    """
                    INSERT INTO oltp.rate_limit_hits (bucket_key, created_at, expires_at)
                    VALUES (%s, %s, %s)
                    """,
                    (clean_key, now, now + win),
                )
                return True, cnt + 1

    def get_phone_otp(
        self,
        phone_digits: str,
        *,
        now_ts: float | None = None,
    ) -> dict[str, Any] | None:
        now = float(now_ts if now_ts is not None else time.time())
        digits = str(phone_digits or "").strip()[:24]
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
                FROM oltp.phone_otp_codes WHERE phone_digits = %s
                """,
                (digits,),
            ).fetchone()
            if not row:
                return None
            if float(row["expires_at"]) <= now:
                with conn.transaction():
                    conn.execute("DELETE FROM oltp.phone_otp_codes WHERE phone_digits = %s", (digits,))
                return None
            return {
                "phoneDigits": str(row["phone_digits"]),
                "codeHash": str(row["code_hash"]),
                "channel": str(row["channel"]),
                "mode": str(row["mode"]),
                "inviteOk": bool(row["invite_ok"]),
                "attempts": int(row["attempts"]),
                "createdAt": float(row["created_at"]),
                "expiresAt": float(row["expires_at"]),
            }

    def upsert_phone_otp(
        self,
        phone_digits: str,
        *,
        code_hash: str,
        channel: str,
        mode: str,
        invite_ok: bool,
        ttl_sec: int,
        now_ts: float | None = None,
    ) -> dict[str, Any]:
        now = float(now_ts if now_ts is not None else time.time())
        digits = str(phone_digits or "").strip()[:24]
        raw_ch = str(channel or "").strip().lower()
        ch = raw_ch if raw_ch in ("wa", "tg", "sms") else "wa"
        md = "register" if str(mode or "").strip().lower() == "register" else "login"
        exp = now + max(10.0, float(ttl_sec))
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.phone_otp_codes (
                        phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
                    ) VALUES (%s, %s, %s, %s, %s, 0, %s, %s)
                    ON CONFLICT (phone_digits) DO UPDATE SET
                        code_hash = EXCLUDED.code_hash,
                        channel = EXCLUDED.channel,
                        mode = EXCLUDED.mode,
                        invite_ok = EXCLUDED.invite_ok,
                        attempts = 0,
                        created_at = EXCLUDED.created_at,
                        expires_at = EXCLUDED.expires_at
                    """,
                    (digits, code_hash, ch, md, bool(invite_ok), now, exp),
                )
        return {
            "phoneDigits": digits,
            "channel": ch,
            "mode": md,
            "inviteOk": bool(invite_ok),
            "attempts": 0,
            "createdAt": now,
            "expiresAt": exp,
        }

    def verify_and_consume_phone_otp(
        self,
        phone_digits: str,
        candidate_hash: str,
        *,
        max_attempts: int = 5,
        server_invite: str = "",
        invite_code: str = "",
        now_ts: float | None = None,
    ) -> tuple[str, dict[str, Any] | None]:
        now = float(now_ts if now_ts is not None else time.time())
        digits = str(phone_digits or "").strip()[:24]
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    SELECT phone_digits, code_hash, channel, mode, invite_ok, attempts, expires_at
                    FROM oltp.phone_otp_codes WHERE phone_digits = %s FOR UPDATE
                    """,
                    (digits,),
                ).fetchone()
                if not row or float(row["expires_at"]) <= now:
                    if row:
                        conn.execute("DELETE FROM oltp.phone_otp_codes WHERE phone_digits = %s", (digits,))
                    return "expired", None
                attempts = int(row["attempts"]) + 1
                if attempts > max(1, int(max_attempts)):
                    conn.execute("DELETE FROM oltp.phone_otp_codes WHERE phone_digits = %s", (digits,))
                    return "max_attempts", None
                if not candidate_hash or not hmac.compare_digest(candidate_hash, str(row["code_hash"])):
                    conn.execute(
                        "UPDATE oltp.phone_otp_codes SET attempts = %s WHERE phone_digits = %s",
                        (attempts, digits),
                    )
                    return "invalid_code", None
                if server_invite and str(row["mode"]) == "register" and not bool(row["invite_ok"]):
                    if not hmac.compare_digest((invite_code or "").strip(), server_invite):
                        conn.execute(
                            "UPDATE oltp.phone_otp_codes SET attempts = %s WHERE phone_digits = %s",
                            (attempts, digits),
                        )
                        return "invalid_invite", None
                conn.execute("DELETE FROM oltp.phone_otp_codes WHERE phone_digits = %s", (digits,))
                return "ok", {
                    "channel": str(row["channel"]),
                    "mode": str(row["mode"]),
                    "invite_ok": bool(row["invite_ok"]),
                }

    def prune_expired_security_state(
        self,
        *,
        now_ts: float | None = None,
        realtime_retention_days: int = 30,
    ) -> dict[str, int]:
        now = float(now_ts if now_ts is not None else time.time())
        now_dt = datetime.fromtimestamp(now, tz=timezone.utc)
        rt_days = max(1, int(realtime_retention_days))
        rt_cutoff_dt = datetime.fromtimestamp(now - rt_days * 86400, tz=timezone.utc)
        with self._pool.connection() as conn:
            with conn.transaction():
                r1 = conn.execute("DELETE FROM oltp.rate_limit_hits WHERE expires_at <= %s", (now,))
                r2 = conn.execute("DELETE FROM oltp.phone_otp_codes WHERE expires_at <= %s", (now,))
                r3 = conn.execute("DELETE FROM oltp.sessions WHERE expires_at <= %s", (now_dt,))
                r4 = conn.execute("DELETE FROM oltp.oauth_states WHERE expires_at <= %s", (now_dt,))
                r5 = conn.execute("DELETE FROM oltp.telegram_link_tokens WHERE expires_at <= %s", (now_dt,))
                r6 = conn.execute("DELETE FROM oltp.realtime_notifications WHERE created_at <= %s", (rt_cutoff_dt,))
                return {
                    "rateLimitPruned": int(r1.rowcount or 0),
                    "otpPruned": int(r2.rowcount or 0),
                    "sessionsPruned": int(r3.rowcount or 0),
                    "oauthStatesPruned": int(r4.rowcount or 0),
                    "telegramTokensPruned": int(r5.rowcount or 0),
                    "realtimePruned": int(r6.rowcount or 0),
                }
