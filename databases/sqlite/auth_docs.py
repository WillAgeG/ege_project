"""Авторизация, OAuth, сессии и документы прогресса (SQLite)."""

from datetime import datetime, timezone
import hmac
import json
import re
import secrets
import sqlite3
import time
from typing import Any

from .common import (
    StorageError,
    User,
    _iso_utc_now,
    _row_to_user,
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


class SqliteAuthDocsMixin:
    def _sync_user_profile_from_doc(
        self, user_id: int, doc: dict[str, Any], changed_keys: set[str]
    ) -> None:
        sets: list[str] = []
        params: list[Any] = []
        if "name" in changed_keys:
            clean_name = validate_display_name(doc.get("name"))
            if clean_name:
                sets.append("display_name = ?")
                params.append(clean_name)
        if "photo" in changed_keys:
            raw_photo = str(doc.get("photo") or "").strip()
            sets.append("avatar_url = ?")
            params.append(raw_photo[:220_000] if raw_photo else None)
        if "phone" in changed_keys:
            sets.append("phone = ?")
            params.append(str(doc.get("phone") or "").strip()[:32])
        if "phoneCountry" in changed_keys:
            sets.append("phone_country = ?")
            params.append(str(doc.get("phoneCountry") or "RU").strip().upper()[:12] or "RU")
        if "city" in changed_keys:
            sets.append("city = ?")
            params.append(str(doc.get("city") or "").strip()[:64])
        if "grade" in changed_keys:
            sets.append("grade = ?")
            params.append(str(doc.get("grade") or "").strip()[:64])
        if "goal" in changed_keys:
            sets.append("goal = ?")
            params.append(str(doc.get("goal") or "").strip()[:320])
        if "contactVerified" in changed_keys:
            sets.append("contact_verified = ?")
            params.append(1 if doc.get("contactVerified") else 0)
        if sets:
            params.append(int(user_id))
            self._conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", tuple(params))

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
                    email, email_lower, avatar_url, auth_provider, role, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, NULL, 'local', ?, ?)
                """,
                (username, username.lower(), pw_hash, clean_display, clean_email, email_lower, clean_role, now),
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
                role=clean_role,
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
        *,
        role: str = "student",
        next_url: str = "/",
        link_user_id: int | None = None,
    ) -> str:
        raw_state = secrets.token_urlsafe(32)
        clean_role = validate_registration_role(role)
        clean_next = str(next_url or "/").strip()[:256] or "/"
        clean_link_uid = int(link_user_id) if link_user_id is not None else None
        now = int(time.time())
        with self._lock:
            self._conn.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (now,))
            self._conn.execute(
                """
                INSERT INTO oauth_states (
                    state_hash, provider, code_verifier, redirect_uri, role, next_url, link_user_id, created_at, expires_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    hash_token(raw_state),
                    provider,
                    code_verifier,
                    redirect_uri,
                    clean_role,
                    clean_next,
                    clean_link_uid,
                    now,
                    now + ttl_sec,
                ),
            )
            self._conn.commit()
        return raw_state

    def consume_oauth_state_data(self, raw_state: str, provider: str) -> dict[str, Any] | None:
        if not raw_state:
            return None
        sh = hash_token(raw_state)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT code_verifier, redirect_uri, role, next_url, link_user_id, expires_at FROM oauth_states WHERE state_hash = ? AND provider = ?",
                (sh, provider),
            ).fetchone()
            self._conn.execute("DELETE FROM oauth_states WHERE state_hash = ?", (sh,))
            self._conn.commit()
        if not row or int(row["expires_at"]) <= now:
            return None
        role_val = "tutor" if str(row["role"] or "").strip().lower() == "tutor" else "student"
        next_val = str(row["next_url"] or "/").strip()[:256] or "/"
        link_uid = int(row["link_user_id"]) if row["link_user_id"] is not None else None
        return {
            "codeVerifier": str(row["code_verifier"]),
            "redirectUri": str(row["redirect_uri"]),
            "role": role_val,
            "nextUrl": next_val,
            "linkUserId": link_uid,
        }

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str, str, str] | None:
        data = self.consume_oauth_state_data(raw_state, provider)
        if not data:
            return None
        return data["codeVerifier"], data["redirectUri"], data["role"], data["nextUrl"]

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
        role: str = "student",
        max_users: int = 0,
    ) -> User:
        clean_email = validate_email(email) if email else None
        email_lower = clean_email.lower() if clean_email else None
        clean_display = validate_display_name(display_name)
        clean_avatar = (avatar_url or "").strip()[:500] or None
        clean_role = validate_registration_role(role)
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

            phone_digits = re.sub(r"\D+", "", subject) if provider in ("phone", "telegram") else ""
            phone_hint = f"u_{phone_digits[-4:]}" if len(phone_digits) >= 4 else ""
            hint = (clean_email.split("@", 1)[0] if clean_email else "") or phone_hint or clean_display or "user"
            username = self._generate_unique_username(hint)
            stored_email = clean_email if email_verified else None
            stored_email_lower = email_lower if email_verified else None
            cur = self._conn.execute(
                """
                INSERT INTO users (
                    username, username_lower, password_hash, display_name,
                    email, email_lower, avatar_url, auth_provider, role, created_at
                ) VALUES (?, ?, '', ?, ?, ?, ?, ?, ?, ?)
                """,
                (username, username.lower(), clean_display, stored_email, stored_email_lower, clean_avatar, provider, clean_role, now),
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
                role=clean_role,
            )

    def get_user_linked_providers(self, user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        with self._lock:
            u_row = self._conn.execute(
                "SELECT auth_provider, email, username FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
            id_rows = self._conn.execute(
                "SELECT provider, provider_subject, email FROM user_identities WHERE user_id = ? ORDER BY created_at",
                (uid,),
            ).fetchall()
            tg_row = self._conn.execute(
                "SELECT telegram_username FROM telegram_bindings WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
                (uid,),
            ).fetchone()
        auth_prov = str(u_row["auth_provider"] or "local") if u_row else "local"
        user_email = str(u_row["email"] or "").strip() if u_row else ""
        providers_map: dict[str, dict[str, str]] = {}
        for r in id_rows:
            prov = str(r["provider"] or "").strip().lower()
            if prov and prov not in providers_map:
                providers_map[prov] = {
                    "subject": str(r["provider_subject"] or ""),
                    "email": str(r["email"] or "").strip(),
                }
        google_info = providers_map.get("google")
        google_connected = bool(google_info is not None or auth_prov == "google")
        google_email = str((google_info and google_info.get("email")) or (user_email if google_connected else "") or "").strip()
        tg_info = providers_map.get("telegram")
        tg_bot_linked = bool(tg_row)
        tg_bot_username = str(tg_row["telegram_username"] or "").strip().lstrip("@") if tg_row else ""
        tg_connected = bool(tg_info is not None or tg_bot_linked or auth_prov == "telegram")
        return {
            "local": {"connected": bool("local" in providers_map or auth_prov == "local")},
            "phone": {"connected": bool("phone" in providers_map or auth_prov == "phone")},
            "google": {"connected": google_connected, "email": google_email},
            "telegram": {
                "connected": tg_connected,
                "username": tg_bot_username,
                "botLinked": tg_bot_linked,
            },
        }

    def link_oauth_identity(
        self,
        user_id: int,
        provider: str,
        subject: str,
        *,
        email: str | None = None,
        email_verified: bool = False,
        avatar_url: str | None = None,
    ) -> User:
        uid = int(user_id)
        prov = str(provider or "").strip().lower()
        subj = str(subject or "").strip()
        clean_email = validate_email(email) if email else None
        stored_email = clean_email if (clean_email and email_verified) else None
        clean_email_lower = stored_email.lower() if stored_email else None
        clean_avatar = (avatar_url or "").strip()[:500] or None
        now = int(time.time())

        with self._lock:
            u_row = self._conn.execute(
                "SELECT id, username, display_name, email, email_lower, avatar_url, auth_provider, role FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
            if not u_row:
                raise StorageError("not_found", "Пользователь не найден.", 404)

            existing = self._conn.execute(
                "SELECT user_id FROM user_identities WHERE provider = ? AND provider_subject = ?",
                (prov, subj),
            ).fetchone()
            if existing and int(existing["user_id"]) != uid:
                label = "Google" if prov == "google" else ("Telegram" if prov == "telegram" else prov)
                raise StorageError(
                    f"{prov}_already_linked",
                    f"Этот аккаунт {label} уже привязан к другому пользователю.",
                    409,
                )

            if existing:
                if stored_email:
                    self._conn.execute(
                        "UPDATE user_identities SET email = ? WHERE provider = ? AND provider_subject = ?",
                        (stored_email, prov, subj),
                    )
            else:
                self._conn.execute(
                    "INSERT INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES (?, ?, ?, ?, ?)",
                    (prov, subj, uid, stored_email, now),
                )

            sets: list[str] = []
            params: list[Any] = []
            if clean_avatar and not u_row["avatar_url"]:
                sets.append("avatar_url = ?")
                params.append(clean_avatar)
            if clean_email_lower and not u_row["email"]:
                conflict = self._conn.execute(
                    "SELECT 1 FROM users WHERE email_lower = ? AND id != ?",
                    (clean_email_lower, uid),
                ).fetchone()
                if not conflict:
                    sets.append("email = ?")
                    params.append(stored_email)
                    sets.append("email_lower = ?")
                    params.append(clean_email_lower)
            if sets:
                params.append(uid)
                self._conn.execute(f"UPDATE users SET {', '.join(sets)} WHERE id = ?", tuple(params))

            self._conn.commit()
            refreshed = self._conn.execute(
                "SELECT id, username, display_name, email, avatar_url, auth_provider, role FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
            return _row_to_user(refreshed)

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
            if name == "profile":
                self._sync_user_profile_from_doc(user_id, merged, set(patch.keys()))
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
            if name == "profile":
                self._sync_user_profile_from_doc(user_id, data, set(data.keys()))
            self._conn.commit()

    def export_user_data(self, user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        with self._lock:
            u = self._conn.execute(
                """
                SELECT id, username, display_name, email, avatar_url, auth_provider, role,
                       phone, phone_country, city, grade, goal, contact_verified, created_at
                FROM users WHERE id = ?
                """,
                (uid,),
            ).fetchone()
            if not u:
                raise StorageError("not_found", "Пользователь не найден.", 404)
            id_rows = self._conn.execute(
                "SELECT provider, email, created_at FROM user_identities WHERE user_id = ? ORDER BY created_at",
                (uid,),
            ).fetchall()
            doc_rows = self._conn.execute(
                "SELECT name, data, updated_at FROM docs WHERE user_id = ? ORDER BY name",
                (uid,),
            ).fetchall()
            wallet_row = self._conn.execute(
                "SELECT balance_rub, initial_paid, plan_id, saved_cards_json, updated_at FROM wallets WHERE user_id = ?",
                (uid,),
            ).fetchone()
            bk_rows = self._conn.execute(
                """
                SELECT id, tutor_id, tutor_name, subject, exam, format, city, timezone,
                       slot_date, hour_slot, offer_price_rub, counter_price_rub, final_price_rub,
                       status, created_at
                FROM admin_lesson_requests WHERE student_user_id = ? ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()
            lead_rows = self._conn.execute(
                """
                SELECT id, student_name, subjects_json, exam, format, target_price_rub,
                       whatsapp, whatsapp_country, comment, status, created_at
                FROM student_leads WHERE student_user_id = ? ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()
            rev_rows = self._conn.execute(
                """
                SELECT id, tutor_id, booking_id, rating, comment, tags_json, verified_lesson, created_at
                FROM tutor_reviews WHERE student_user_id = ? ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()
            dsp_rows = self._conn.execute(
                """
                SELECT id, booking_id, tutor_id, tutor_name, reason, comment, amount_rub,
                       first_lesson_guarantee, status, resolution_note, created_at, resolved_at
                FROM lesson_disputes WHERE student_user_id = ? ORDER BY created_at DESC
                """,
                (uid,),
            ).fetchall()

        docs_out: dict[str, Any] = {}
        for row in doc_rows:
            try:
                parsed = json.loads(row["data"])
                if isinstance(parsed, dict):
                    docs_out[str(row["name"])] = parsed
            except json.JSONDecodeError:
                continue

        saved_cards: list[Any] = []
        if wallet_row:
            try:
                parsed_cards = json.loads(wallet_row["saved_cards_json"] or "[]")
                if isinstance(parsed_cards, list):
                    saved_cards = parsed_cards
            except json.JSONDecodeError:
                saved_cards = []

        def _parse_json_list(raw: Any) -> list[Any]:
            try:
                val = json.loads(raw or "[]")
                return val if isinstance(val, list) else []
            except (TypeError, json.JSONDecodeError):
                return []

        return {
            "schema": "vektor-ege-personal-data-v1",
            "exportedAt": _iso_utc_now(),
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
                "createdAt": int(u["created_at"] or 0),
            },
            "identities": [
                {
                    "provider": str(r["provider"]),
                    "email": r["email"],
                    "createdAt": int(r["created_at"] or 0),
                }
                for r in id_rows
            ],
            "docs": docs_out,
            "wallet": {
                "balanceRub": int(wallet_row["balance_rub"]) if wallet_row else 0,
                "initialPaid": bool(wallet_row["initial_paid"]) if wallet_row else False,
                "planId": str(wallet_row["plan_id"]) if wallet_row else "trial5k",
                "savedCards": saved_cards,
                "updatedAt": wallet_row["updated_at"] if wallet_row else None,
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
                    "createdAt": str(r["created_at"]),
                }
                for r in bk_rows
            ],
            "leads": [
                {
                    "id": str(r["id"]),
                    "studentName": str(r["student_name"] or ""),
                    "subjects": _parse_json_list(r["subjects_json"]),
                    "exam": str(r["exam"] or "ЕГЭ"),
                    "format": str(r["format"] or "Онлайн"),
                    "targetPriceRub": int(r["target_price_rub"] or 0),
                    "whatsapp": str(r["whatsapp"] or ""),
                    "whatsappCountry": str(r["whatsapp_country"] or "RU"),
                    "comment": str(r["comment"] or ""),
                    "status": str(r["status"]),
                    "createdAt": str(r["created_at"]),
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
                    "tags": _parse_json_list(r["tags_json"]),
                    "verifiedLesson": bool(r["verified_lesson"]),
                    "createdAt": str(r["created_at"]),
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
                    "createdAt": str(r["created_at"]),
                    "resolvedAt": r["resolved_at"],
                }
                for r in dsp_rows
            ],
            "telegramBinding": self.get_telegram_binding_by_user(uid) if hasattr(self, "get_telegram_binding_by_user") else None,
        }

    def delete_user_account(self, user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        now_iso = _iso_utc_now()
        with self._lock:
            exists = self._conn.execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone()
            if not exists:
                raise StorageError("not_found", "Пользователь не найден.", 404)
            sessions_count = int(
                self._conn.execute("SELECT COUNT(*) FROM sessions WHERE user_id = ?", (uid,)).fetchone()[0]
            )
            self._conn.execute("DELETE FROM calendar_sync_tokens WHERE user_id = ?", (uid,))
            self._conn.execute("DELETE FROM student_leads WHERE student_user_id = ?", (uid,))
            self._conn.execute(
                """
                UPDATE admin_tutors
                SET user_id = NULL,
                    full_name = 'Удалённый преподаватель',
                    whatsapp_phone = '',
                    telegram_handle = '',
                    max_handle = '',
                    photo_url = '',
                    bio = '',
                    education = '',
                    verified = 0,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (now_iso, uid),
            )
            cur_req = self._conn.execute(
                """
                UPDATE admin_lesson_requests
                SET student_user_id = NULL,
                    student_name = 'Удалённый пользователь',
                    note = '',
                    updated_at = ?
                WHERE student_user_id = ?
                """,
                (now_iso, uid),
            )
            anonymized_bookings = int(cur_req.rowcount or 0)
            self._conn.execute(
                """
                UPDATE tutor_reviews
                SET student_user_id = NULL, student_name = 'Удалённый пользователь'
                WHERE student_user_id = ?
                """,
                (uid,),
            )
            self._conn.execute(
                """
                UPDATE lesson_disputes
                SET student_user_id = NULL, student_name = 'Удалённый пользователь'
                WHERE student_user_id = ?
                """,
                (uid,),
            )
            self._conn.execute("DELETE FROM users WHERE id = ?", (uid,))
            self._conn.execute(
                """
                INSERT INTO admin_outbox_events (topic, partition_key, event_type, payload, created_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    "vektor.user.clickstream.v1",
                    str(uid),
                    "auth.user.deleted",
                    json.dumps(
                        {
                            "event_type": "auth.user.deleted",
                            "payload": {"deletedUserId": uid, "reason": "user_request_152fz"},
                        },
                        ensure_ascii=False,
                    ),
                    now_iso,
                ),
            )
            self._conn.commit()
            return {
                "deleted": True,
                "userId": uid,
                "revokedSessions": sessions_count,
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
        with self._lock:
            self._conn.execute(
                "DELETE FROM rate_limit_hits WHERE bucket_key = ? AND created_at <= ?",
                (clean_key, cutoff),
            )
            cnt = int(
                self._conn.execute(
                    "SELECT COUNT(*) FROM rate_limit_hits WHERE bucket_key = ? AND created_at > ?",
                    (clean_key, cutoff),
                ).fetchone()[0]
            )
            if cnt >= lim:
                self._conn.commit()
                return False, cnt
            self._conn.execute(
                """
                INSERT INTO rate_limit_hits (bucket_key, created_at, expires_at)
                VALUES (?, ?, ?)
                """,
                (clean_key, now, now + win),
            )
            self._conn.commit()
            return True, cnt + 1

    def get_phone_otp(
        self,
        phone_digits: str,
        *,
        now_ts: float | None = None,
    ) -> dict[str, Any] | None:
        now = float(now_ts if now_ts is not None else time.time())
        digits = str(phone_digits or "").strip()[:24]
        with self._lock:
            row = self._conn.execute(
                """
                SELECT phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
                FROM phone_otp_codes WHERE phone_digits = ?
                """,
                (digits,),
            ).fetchone()
            if not row:
                return None
            if float(row["expires_at"]) <= now:
                self._conn.execute("DELETE FROM phone_otp_codes WHERE phone_digits = ?", (digits,))
                self._conn.commit()
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
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO phone_otp_codes (
                    phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
                ) VALUES (?, ?, ?, ?, ?, 0, ?, ?)
                ON CONFLICT(phone_digits) DO UPDATE SET
                    code_hash = excluded.code_hash,
                    channel = excluded.channel,
                    mode = excluded.mode,
                    invite_ok = excluded.invite_ok,
                    attempts = 0,
                    created_at = excluded.created_at,
                    expires_at = excluded.expires_at
                """,
                (digits, code_hash, ch, md, 1 if invite_ok else 0, now, exp),
            )
            self._conn.commit()
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
        with self._lock:
            row = self._conn.execute(
                """
                SELECT phone_digits, code_hash, channel, mode, invite_ok, attempts, expires_at
                FROM phone_otp_codes WHERE phone_digits = ?
                """,
                (digits,),
            ).fetchone()
            if not row or float(row["expires_at"]) <= now:
                if row:
                    self._conn.execute("DELETE FROM phone_otp_codes WHERE phone_digits = ?", (digits,))
                    self._conn.commit()
                return "expired", None
            attempts = int(row["attempts"]) + 1
            if attempts > max(1, int(max_attempts)):
                self._conn.execute("DELETE FROM phone_otp_codes WHERE phone_digits = ?", (digits,))
                self._conn.commit()
                return "max_attempts", None
            if not candidate_hash or not hmac.compare_digest(candidate_hash, str(row["code_hash"])):
                self._conn.execute(
                    "UPDATE phone_otp_codes SET attempts = ? WHERE phone_digits = ?",
                    (attempts, digits),
                )
                self._conn.commit()
                return "invalid_code", None
            if server_invite and str(row["mode"]) == "register" and not bool(row["invite_ok"]):
                if not hmac.compare_digest((invite_code or "").strip(), server_invite):
                    self._conn.execute(
                        "UPDATE phone_otp_codes SET attempts = ? WHERE phone_digits = ?",
                        (attempts, digits),
                    )
                    self._conn.commit()
                    return "invalid_invite", None
            self._conn.execute("DELETE FROM phone_otp_codes WHERE phone_digits = ?", (digits,))
            self._conn.commit()
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
        now_int = int(now)
        rt_days = max(1, int(realtime_retention_days))
        rt_cutoff_iso = datetime.fromtimestamp(now - rt_days * 86400, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        with self._lock:
            cur_rl = self._conn.execute("DELETE FROM rate_limit_hits WHERE expires_at <= ?", (now,))
            cur_otp = self._conn.execute("DELETE FROM phone_otp_codes WHERE expires_at <= ?", (now,))
            cur_sess = self._conn.execute("DELETE FROM sessions WHERE expires_at <= ?", (now_int,))
            cur_oauth = self._conn.execute("DELETE FROM oauth_states WHERE expires_at <= ?", (now_int,))
            cur_tg = self._conn.execute("DELETE FROM telegram_link_tokens WHERE expires_at <= ?", (now_int,))
            cur_rt = self._conn.execute(
                "DELETE FROM realtime_notifications WHERE created_at <= ?",
                (rt_cutoff_iso,),
            )
            self._conn.commit()
            return {
                "rateLimitPruned": int(cur_rl.rowcount or 0),
                "otpPruned": int(cur_otp.rowcount or 0),
                "sessionsPruned": int(cur_sess.rowcount or 0),
                "oauthStatesPruned": int(cur_oauth.rowcount or 0),
                "telegramTokensPruned": int(cur_tg.rowcount or 0),
                "realtimePruned": int(cur_rt.rowcount or 0),
            }
