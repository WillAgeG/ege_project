"""Авторизация, OAuth, сессии и документы прогресса (SQLite)."""

import json
import re
import secrets
import sqlite3
import time
from typing import Any

from .common import (
    StorageError,
    User,
    _row_to_user,
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


class SqliteAuthDocsMixin:
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
        now = int(time.time())
        with self._lock:
            if max_users > 0:
                count = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                if count >= max_users:
                    raise StorageError(
                        "user_limit",
                        "Достигнут лимит регистраций на этом сервере.",
                        403,
                    )
            exists = self._conn.execute(
                "SELECT 1 FROM users WHERE username_lower = ?",
                (username.lower(),),
            ).fetchone()
            if exists:
                raise StorageError("username_taken", "Такой логин уже занят.", 409)
            if email_lower:
                email_exists = self._conn.execute(
                    "SELECT 1 FROM users WHERE email_lower = ?",
                    (email_lower,),
                ).fetchone()
                if email_exists:
                    raise StorageError("email_taken", "Этот email уже зарегистрирован.", 409)
            cur = self._conn.execute(
                """
                INSERT INTO users (
                    username, username_lower, password_hash, display_name,
                    email, email_lower, avatar_url, auth_provider, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'local', ?)
                """,
                (username, username.lower(), pw_hash, clean_display, clean_email, email_lower, now),
            )
            uid = int(cur.lastrowid)
            self._conn.execute(
                "INSERT INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                ("local", username.lower(), uid, clean_email, now),
            )
            self._conn.commit()
            return User(
                id=uid,
                username=username,
                display_name=clean_display,
                email=clean_email,
                avatar_url=None,
                auth_provider="local",
            )

    def authenticate(self, raw_login: str, raw_password: str) -> User | None:
        login_val = (raw_login or "").strip().lower()
        if not login_val or not isinstance(raw_password, str):
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT id, username, password_hash, display_name, email, avatar_url, auth_provider, role
                FROM users
                WHERE username_lower = ? OR (email_lower IS NOT NULL AND email_lower = ?)
                """,
                (login_val, login_val),
            ).fetchone()
        if not row or not verify_password(raw_password, row["password_hash"]):
            return None
        return _row_to_user(row)

    def create_oauth_state(
        self,
        provider: str,
        code_verifier: str,
        redirect_uri: str,
        ttl_sec: int = 600,
    ) -> str:
        raw_state = secrets.token_urlsafe(32)
        now = int(time.time())
        with self._lock:
            self._conn.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (now,))
            self._conn.execute(
                """
                INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (hash_token(raw_state), provider, code_verifier, redirect_uri, now, now + ttl_sec),
            )
            self._conn.commit()
        return raw_state

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str] | None:
        if not raw_state:
            return None
        sh = hash_token(raw_state)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT code_verifier, redirect_uri, expires_at FROM oauth_states WHERE state_hash = ? AND provider = ?",
                (sh, provider),
            ).fetchone()
            self._conn.execute("DELETE FROM oauth_states WHERE state_hash = ?", (sh,))
            self._conn.commit()
        if not row or int(row["expires_at"]) <= now:
            return None
        return str(row["code_verifier"]), str(row["redirect_uri"])

    def _generate_unique_username(self, hint: str) -> str:
        cleaned = re.sub(r"[^0-9A-Za-z_.\-]+", "_", (hint or "").strip()).strip("_.-")
        if len(cleaned) < 2:
            cleaned = "user"
        base = cleaned[:24]
        candidate = base
        for idx in range(0, 50):
            if idx > 0:
                suffix = f"_{idx}"
                candidate = base[: 32 - len(suffix)] + suffix
            row = self._conn.execute(
                "SELECT 1 FROM users WHERE username_lower = ?",
                (candidate.lower(),),
            ).fetchone()
            if not row:
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
        now = int(time.time())

        with self._lock:
            id_row = self._conn.execute(
                """
                SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.auth_provider, u.role
                FROM user_identities ui
                JOIN users u ON u.id = ui.user_id
                WHERE ui.provider = ? AND ui.provider_subject = ?
                """,
                (provider, subject),
            ).fetchone()
            if id_row:
                uid = int(id_row["id"])
                next_display = clean_display or str(id_row["display_name"] or "")
                next_avatar = clean_avatar or id_row["avatar_url"]
                next_email = clean_email if (clean_email and email_verified) else id_row["email"]
                next_email_lower = next_email.lower() if next_email else None
                self._conn.execute(
                    "UPDATE users SET display_name = ?, avatar_url = ?, email = ?, email_lower = ? WHERE id = ?",
                    (next_display, next_avatar, next_email, next_email_lower, uid),
                )
                self._conn.commit()
                refreshed = self._conn.execute(
                    "SELECT id, username, display_name, email, avatar_url, auth_provider, role FROM users WHERE id = ?",
                    (uid,),
                ).fetchone()
                return _row_to_user(refreshed)

            if email_lower and email_verified:
                email_row = self._conn.execute(
                    "SELECT id, username, display_name, email, avatar_url, auth_provider, role FROM users WHERE email_lower = ?",
                    (email_lower,),
                ).fetchone()
                if email_row:
                    uid = int(email_row["id"])
                    next_display = str(email_row["display_name"] or "") or clean_display
                    next_avatar = email_row["avatar_url"] or clean_avatar
                    self._conn.execute(
                        "UPDATE users SET display_name = ?, avatar_url = ? WHERE id = ?",
                        (next_display, next_avatar, uid),
                    )
                    self._conn.execute(
                        "INSERT OR IGNORE INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                        (provider, subject, uid, clean_email, now),
                    )
                    self._conn.commit()
                    refreshed = self._conn.execute(
                        "SELECT id, username, display_name, email, avatar_url, auth_provider, role FROM users WHERE id = ?",
                        (uid,),
                    ).fetchone()
                    return _row_to_user(refreshed)

            if max_users > 0:
                count = self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                if count >= max_users:
                    raise StorageError(
                        "user_limit",
                        "Достигнут лимит регистраций на этом сервере.",
                        403,
                    )

            hint = (clean_email.split("@", 1)[0] if clean_email else "") or clean_display or "user"
            username = self._generate_unique_username(hint)
            stored_email = clean_email if email_verified else None
            stored_email_lower = email_lower if email_verified else None
            cur = self._conn.execute(
                """
                INSERT INTO users (
                    username, username_lower, password_hash, display_name,
                    email, email_lower, avatar_url, auth_provider, created_at
                ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?)
                """,
                (username, username.lower(), clean_display, stored_email, stored_email_lower, clean_avatar, provider, now),
            )
            uid = int(cur.lastrowid)
            self._conn.execute(
                "INSERT INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                (provider, subject, uid, stored_email, now),
            )
            self._conn.commit()
            return User(
                id=uid,
                username=username,
                display_name=clean_display,
                email=stored_email,
                avatar_url=clean_avatar,
                auth_provider=provider,
            )

    def create_session(self, user_id: int, ttl_sec: int) -> str:
        raw_token = secrets.token_urlsafe(32)
        now = int(time.time())
        with self._lock:
            self._conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                (hash_token(raw_token), user_id, now, now + ttl_sec),
            )
            self._conn.commit()
        return raw_token

    def get_user_by_token(self, raw_token: str | None) -> User | None:
        if not raw_token:
            return None
        th = hash_token(raw_token)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                """
                SELECT u.id, u.username, u.display_name, u.email, u.avatar_url, u.auth_provider, u.role, s.expires_at
                FROM sessions s
                JOIN users u ON u.id = s.user_id
                WHERE s.token_hash = ?
                """,
                (th,),
            ).fetchone()
            if not row:
                return None
            if int(row["expires_at"]) <= now:
                self._conn.execute("DELETE FROM sessions WHERE token_hash = ?", (th,))
                self._conn.commit()
                return None
            return _row_to_user(row)

    def delete_session(self, raw_token: str | None) -> None:
        if not raw_token:
            return
        with self._lock:
            self._conn.execute("DELETE FROM sessions WHERE token_hash = ?", (hash_token(raw_token),))
            self._conn.commit()

    def get_docs(self, user_id: int) -> dict[str, dict[str, Any]]:
        with self._lock:
            rows = self._conn.execute(
                "SELECT name, data FROM docs WHERE user_id = ?",
                (user_id,),
            ).fetchall()
        out: dict[str, dict[str, Any]] = {}
        for row in rows:
            try:
                parsed = json.loads(row["data"])
                if isinstance(parsed, dict):
                    out[str(row["name"])] = parsed
            except json.JSONDecodeError:
                continue
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
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT data FROM docs WHERE user_id = ? AND name = ?",
                (user_id, name),
            ).fetchone()
            current = json.loads(row["data"]) if row else {}
            if not isinstance(current, dict):
                current = {}
            merged = deep_merge(current, patch)
            encoded = self._serialize_checked(merged, max_bytes)
            self._conn.execute(
                """
                INSERT INTO docs (user_id, name, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
                """,
                (user_id, name, encoded, now),
            )
            self._conn.commit()

    def replace_doc(self, user_id: int, name: str, data: dict[str, Any], max_bytes: int) -> None:
        validate_doc_name(name)
        if not isinstance(data, dict):
            raise StorageError("invalid_body", "Ожидался JSON-объект.", 400)
        encoded = self._serialize_checked(data, max_bytes)
        now = int(time.time())
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO docs (user_id, name, data, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, name) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
                """,
                (user_id, name, encoded, now),
            )
            self._conn.commit()
