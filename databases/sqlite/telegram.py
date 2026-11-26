"""Привязка Telegram-чатов, одноразовые токены и поиск получателей уведомлений (SQLite)."""

import re
import secrets
import sqlite3
import time
from typing import Any

from .common import StorageError, User, _iso_utc_now, _row_to_user, hash_token


def _norm_tg_phone(raw: str | None) -> str:
    digits = re.sub(r"\D+", "", str(raw or ""))[:20]
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits


def _row_to_tg_binding(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "chatId": str(row["chat_id"]),
        "userId": int(row["user_id"]) if row["user_id"] is not None else None,
        "telegramUserId": str(row["telegram_user_id"] or ""),
        "telegramUsername": str(row["telegram_username"] or ""),
        "phoneDigits": str(row["phone_digits"] or ""),
        "firstName": str(row["first_name"] or ""),
        "notificationsEnabled": bool(row["notifications_enabled"]),
        "linkedAt": str(row["linked_at"]),
        "updatedAt": str(row["updated_at"]),
    }


class SqliteTelegramMixin:
    def create_telegram_link_token(self, user_id: int, ttl_sec: int = 900) -> str:
        raw_token = secrets.token_urlsafe(18)
        now = int(time.time())
        with self._lock:
            self._conn.execute("DELETE FROM telegram_link_tokens WHERE expires_at <= ?", (now,))
            self._conn.execute(
                """
                INSERT INTO telegram_link_tokens (token_hash, user_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
                """,
                (hash_token(raw_token), int(user_id), now, now + max(60, int(ttl_sec))),
            )
            self._conn.commit()
        return raw_token

    def consume_telegram_link_token(self, raw_token: str) -> int | None:
        clean = (raw_token or "").strip()
        if not clean:
            return None
        th = hash_token(clean)
        now = int(time.time())
        with self._lock:
            row = self._conn.execute(
                "SELECT user_id, expires_at FROM telegram_link_tokens WHERE token_hash = ?",
                (th,),
            ).fetchone()
            self._conn.execute("DELETE FROM telegram_link_tokens WHERE token_hash = ? OR expires_at <= ?", (th, now))
            self._conn.commit()
        if not row or int(row["expires_at"]) <= now:
            return None
        return int(row["user_id"])

    def get_user_by_id(self, user_id: int) -> User | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT id, username, display_name, email, avatar_url, auth_provider, role FROM users WHERE id = ?",
                (int(user_id),),
            ).fetchone()
        return _row_to_user(row) if row else None

    def upsert_telegram_binding(
        self,
        chat_id: str,
        *,
        user_id: int | None = None,
        telegram_user_id: str = "",
        telegram_username: str = "",
        phone_digits: str = "",
        first_name: str = "",
        notifications_enabled: bool | None = None,
    ) -> dict[str, Any]:
        cid = str(chat_id or "").strip()[:64]
        if not cid:
            raise StorageError("invalid_chat", "Не указан chat_id Telegram.", 400)
        clean_tg_uid = str(telegram_user_id or "").strip()[:64]
        clean_uname = str(telegram_username or "").strip().lstrip("@")[:64]
        clean_phone = _norm_tg_phone(phone_digits)
        clean_first = re.sub(r"\s+", " ", str(first_name or "")).strip()[:80]
        now_iso = _iso_utc_now()

        with self._lock:
            prev = self._conn.execute(
                "SELECT * FROM telegram_bindings WHERE chat_id = ?",
                (cid,),
            ).fetchone()
            resolved_uid: int | None = int(user_id) if user_id is not None else (
                int(prev["user_id"]) if prev and prev["user_id"] is not None else None
            )
            if resolved_uid is None and clean_phone:
                id_row = self._conn.execute(
                    """
                    SELECT user_id FROM user_identities
                    WHERE provider IN ('phone', 'telegram') AND provider_subject = ?
                    LIMIT 1
                    """,
                    (f"phone:{clean_phone}",),
                ).fetchone()
                if id_row:
                    resolved_uid = int(id_row["user_id"])
            if resolved_uid is None and clean_tg_uid:
                id_row = self._conn.execute(
                    """
                    SELECT user_id FROM user_identities
                    WHERE provider = 'telegram' AND provider_subject = ?
                    LIMIT 1
                    """,
                    (f"tg:{clean_tg_uid}",),
                ).fetchone()
                if id_row:
                    resolved_uid = int(id_row["user_id"])

            if resolved_uid is not None:
                self._conn.execute(
                    "DELETE FROM telegram_bindings WHERE user_id = ? AND chat_id != ?",
                    (resolved_uid, cid),
                )

            next_tg_uid = clean_tg_uid or (str(prev["telegram_user_id"]) if prev else "")
            next_uname = clean_uname or (str(prev["telegram_username"]) if prev else "")
            next_phone = clean_phone or (str(prev["phone_digits"]) if prev else "")
            next_first = clean_first or (str(prev["first_name"]) if prev else "")
            next_notif = (
                (1 if notifications_enabled else 0)
                if notifications_enabled is not None
                else (int(prev["notifications_enabled"]) if prev else 1)
            )
            linked_at = str(prev["linked_at"]) if prev else now_iso
            self._conn.execute(
                """
                INSERT INTO telegram_bindings (
                    chat_id, user_id, telegram_user_id, telegram_username,
                    phone_digits, first_name, notifications_enabled, linked_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(chat_id) DO UPDATE SET
                    user_id = excluded.user_id,
                    telegram_user_id = excluded.telegram_user_id,
                    telegram_username = excluded.telegram_username,
                    phone_digits = excluded.phone_digits,
                    first_name = excluded.first_name,
                    notifications_enabled = excluded.notifications_enabled,
                    updated_at = excluded.updated_at
                """,
                (cid, resolved_uid, next_tg_uid, next_uname, next_phone, next_first, next_notif, linked_at, now_iso),
            )
            if resolved_uid is not None and next_uname:
                row_u = self._conn.execute("SELECT data FROM docs WHERE user_id = ? AND name = 'profile'", (resolved_uid,)).fetchone()
                # Не перезаписываем профиль целиком; храним структурированную привязку в docs.profile лишь если она отсутствует
                _ = row_u
            row = self._conn.execute("SELECT * FROM telegram_bindings WHERE chat_id = ?", (cid,)).fetchone()
            self._conn.commit()
            return _row_to_tg_binding(row)

    def get_telegram_binding_by_user(self, user_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM telegram_bindings WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
                (int(user_id),),
            ).fetchone()
        return _row_to_tg_binding(row) if row else None

    def get_telegram_binding_by_chat(self, chat_id: str) -> dict[str, Any] | None:
        cid = str(chat_id or "").strip()
        if not cid:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM telegram_bindings WHERE chat_id = ?",
                (cid,),
            ).fetchone()
        return _row_to_tg_binding(row) if row else None

    def find_telegram_chat_by_phone(self, phone_digits: str) -> str | None:
        clean = _norm_tg_phone(phone_digits)
        if not clean:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT chat_id FROM telegram_bindings
                WHERE phone_digits = ? AND notifications_enabled = 1
                ORDER BY updated_at DESC LIMIT 1
                """,
                (clean,),
            ).fetchone()
            if row:
                return str(row["chat_id"])
            id_row = self._conn.execute(
                """
                SELECT tb.chat_id FROM user_identities ui
                JOIN telegram_bindings tb ON tb.user_id = ui.user_id
                WHERE ui.provider IN ('phone', 'telegram')
                  AND ui.provider_subject = ?
                  AND tb.notifications_enabled = 1
                ORDER BY tb.updated_at DESC LIMIT 1
                """,
                (f"phone:{clean}",),
            ).fetchone()
            if id_row:
                return str(id_row["chat_id"])
        return None

    def find_telegram_chat_for_tutor(self, tutor_id: str) -> str | None:
        tid = str(tutor_id or "").strip()
        if not tid:
            return None
        with self._lock:
            tut = self._conn.execute(
                "SELECT user_id, telegram_handle, whatsapp_phone FROM admin_tutors WHERE id = ?",
                (tid,),
            ).fetchone()
            if not tut:
                return None
            if tut["user_id"] is not None:
                row = self._conn.execute(
                    """
                    SELECT chat_id FROM telegram_bindings
                    WHERE user_id = ? AND notifications_enabled = 1
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (int(tut["user_id"]),),
                ).fetchone()
                if row:
                    return str(row["chat_id"])
            handle = str(tut["telegram_handle"] or "").strip().lstrip("@").lower()
            if handle and not handle.lstrip("+").isdigit():
                row = self._conn.execute(
                    """
                    SELECT chat_id FROM telegram_bindings
                    WHERE LOWER(LTRIM(telegram_username, '@')) = ? AND notifications_enabled = 1
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (handle,),
                ).fetchone()
                if row:
                    return str(row["chat_id"])
            wa = _norm_tg_phone(str(tut["whatsapp_phone"] or ""))
            if wa:
                row = self._conn.execute(
                    """
                    SELECT chat_id FROM telegram_bindings
                    WHERE phone_digits = ? AND notifications_enabled = 1
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (wa,),
                ).fetchone()
                if row:
                    return str(row["chat_id"])
        return None

    def set_telegram_notifications(
        self,
        chat_id_or_user_id: str | int,
        enabled: bool,
        *,
        by_user: bool = False,
    ) -> dict[str, Any] | None:
        now_iso = _iso_utc_now()
        flag = 1 if enabled else 0
        with self._lock:
            if by_user:
                self._conn.execute(
                    "UPDATE telegram_bindings SET notifications_enabled = ?, updated_at = ? WHERE user_id = ?",
                    (flag, now_iso, int(chat_id_or_user_id)),
                )
                row = self._conn.execute(
                    "SELECT * FROM telegram_bindings WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1",
                    (int(chat_id_or_user_id),),
                ).fetchone()
            else:
                cid = str(chat_id_or_user_id or "").strip()
                self._conn.execute(
                    "UPDATE telegram_bindings SET notifications_enabled = ?, updated_at = ? WHERE chat_id = ?",
                    (flag, now_iso, cid),
                )
                row = self._conn.execute("SELECT * FROM telegram_bindings WHERE chat_id = ?", (cid,)).fetchone()
            self._conn.commit()
        return _row_to_tg_binding(row) if row else None

    def unlink_telegram_binding(self, user_id: int) -> bool:
        with self._lock:
            cur = self._conn.execute("DELETE FROM telegram_bindings WHERE user_id = ?", (int(user_id),))
            self._conn.commit()
            return int(cur.rowcount or 0) > 0

    def unlink_telegram_chat(self, chat_id: str) -> bool:
        cid = str(chat_id or "").strip()
        if not cid:
            return False
        with self._lock:
            cur = self._conn.execute("DELETE FROM telegram_bindings WHERE chat_id = ?", (cid,))
            self._conn.commit()
            return int(cur.rowcount or 0) > 0
