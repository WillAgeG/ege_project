"""Привязка Telegram-чатов, одноразовые токены и поиск получателей уведомлений (PostgreSQL 17)."""

from datetime import timedelta
import re
import secrets
from typing import Any

from databases.sqlite.common import StorageError, User, hash_token
from databases.sqlite.telegram import _norm_tg_phone
from .schema import _iso_utc, _row_to_user, _utc_now


def _pg_row_to_tg_binding(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "chatId": str(row["chat_id"]),
        "userId": int(row["user_id"]) if row.get("user_id") is not None else None,
        "telegramUserId": str(row.get("telegram_user_id") or ""),
        "telegramUsername": str(row.get("telegram_username") or ""),
        "phoneDigits": str(row.get("phone_digits") or ""),
        "firstName": str(row.get("first_name") or ""),
        "notificationsEnabled": bool(row.get("notifications_enabled")),
        "linkedAt": _iso_utc(row.get("linked_at")),
        "updatedAt": _iso_utc(row.get("updated_at")),
    }


class PgTelegramMixin:
    def insert_telegram_link_token_hash(self, token_hash: str, user_id: int, ttl_sec: int = 900) -> None:
        expires_at = _utc_now() + timedelta(seconds=max(60, int(ttl_sec)))
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute("DELETE FROM oltp.telegram_link_tokens WHERE expires_at <= NOW()")
                conn.execute(
                    """
                    INSERT INTO oltp.telegram_link_tokens (token_hash, user_id, expires_at)
                    VALUES (%s, %s, %s)
                    ON CONFLICT (token_hash) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        expires_at = EXCLUDED.expires_at
                    """,
                    (token_hash, int(user_id), expires_at),
                )

    def create_telegram_link_token(self, user_id: int, ttl_sec: int = 900) -> str:
        raw_token = secrets.token_urlsafe(18)
        self.insert_telegram_link_token_hash(hash_token(raw_token), user_id, ttl_sec)
        return raw_token

    def consume_telegram_link_token(self, raw_token: str) -> int | None:
        clean = (raw_token or "").strip()
        if not clean:
            return None
        th = hash_token(clean)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    DELETE FROM oltp.telegram_link_tokens
                    WHERE token_hash = %s
                    RETURNING user_id, expires_at
                    """,
                    (th,),
                ).fetchone()
                conn.execute("DELETE FROM oltp.telegram_link_tokens WHERE expires_at <= NOW()")
        if not row or row["expires_at"] <= _utc_now():
            return None
        return int(row["user_id"])

    def get_user_by_id(self, user_id: int) -> User | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT id, username, display_name, email, avatar_url, auth_provider, role FROM oltp.users WHERE id = %s",
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

        with self._pool.connection() as conn:
            with conn.transaction():
                prev = conn.execute(
                    "SELECT * FROM oltp.telegram_bindings WHERE chat_id = %s FOR UPDATE",
                    (cid,),
                ).fetchone()
                resolved_uid: int | None = int(user_id) if user_id is not None else (
                    int(prev["user_id"]) if prev and prev.get("user_id") is not None else None
                )
                if resolved_uid is None and clean_phone:
                    id_row = conn.execute(
                        """
                        SELECT user_id FROM oltp.user_identities
                        WHERE provider IN ('phone', 'telegram') AND provider_subject = %s
                        LIMIT 1
                        """,
                        (f"phone:{clean_phone}",),
                    ).fetchone()
                    if id_row:
                        resolved_uid = int(id_row["user_id"])
                if resolved_uid is None and clean_tg_uid:
                    id_row = conn.execute(
                        """
                        SELECT user_id FROM oltp.user_identities
                        WHERE provider = 'telegram' AND provider_subject = %s
                        LIMIT 1
                        """,
                        (f"tg:{clean_tg_uid}",),
                    ).fetchone()
                    if id_row:
                        resolved_uid = int(id_row["user_id"])

                if resolved_uid is not None:
                    conn.execute(
                        "DELETE FROM oltp.telegram_bindings WHERE user_id = %s AND chat_id <> %s",
                        (resolved_uid, cid),
                    )

                next_tg_uid = clean_tg_uid or (str(prev["telegram_user_id"]) if prev else "")
                next_uname = clean_uname or (str(prev["telegram_username"]) if prev else "")
                next_phone = clean_phone or (str(prev["phone_digits"]) if prev else "")
                next_first = clean_first or (str(prev["first_name"]) if prev else "")
                next_notif = (
                    bool(notifications_enabled)
                    if notifications_enabled is not None
                    else (bool(prev["notifications_enabled"]) if prev else True)
                )
                row = conn.execute(
                    """
                    INSERT INTO oltp.telegram_bindings (
                        chat_id, user_id, telegram_user_id, telegram_username,
                        phone_digits, first_name, notifications_enabled, linked_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, NOW(), NOW())
                    ON CONFLICT (chat_id) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        telegram_user_id = EXCLUDED.telegram_user_id,
                        telegram_username = EXCLUDED.telegram_username,
                        phone_digits = EXCLUDED.phone_digits,
                        first_name = EXCLUDED.first_name,
                        notifications_enabled = EXCLUDED.notifications_enabled,
                        updated_at = NOW()
                    RETURNING *
                    """,
                    (cid, resolved_uid, next_tg_uid, next_uname, next_phone, next_first, next_notif),
                ).fetchone()
                return _pg_row_to_tg_binding(row)

    def get_telegram_binding_by_user(self, user_id: int) -> dict[str, Any] | None:
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM oltp.telegram_bindings WHERE user_id = %s ORDER BY updated_at DESC LIMIT 1",
                (int(user_id),),
            ).fetchone()
        return _pg_row_to_tg_binding(row) if row else None

    def get_telegram_binding_by_chat(self, chat_id: str) -> dict[str, Any] | None:
        cid = str(chat_id or "").strip()
        if not cid:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT * FROM oltp.telegram_bindings WHERE chat_id = %s",
                (cid,),
            ).fetchone()
        return _pg_row_to_tg_binding(row) if row else None

    def find_telegram_chat_by_phone(self, phone_digits: str) -> str | None:
        clean = _norm_tg_phone(phone_digits)
        if not clean:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT chat_id FROM oltp.telegram_bindings
                WHERE phone_digits = %s AND notifications_enabled = TRUE
                ORDER BY updated_at DESC LIMIT 1
                """,
                (clean,),
            ).fetchone()
            if row:
                return str(row["chat_id"])
            id_row = conn.execute(
                """
                SELECT tb.chat_id FROM oltp.user_identities ui
                JOIN oltp.telegram_bindings tb ON tb.user_id = ui.user_id
                WHERE ui.provider IN ('phone', 'telegram')
                  AND ui.provider_subject = %s
                  AND tb.notifications_enabled = TRUE
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
        with self._pool.connection() as conn:
            tut = conn.execute(
                "SELECT user_id, telegram_handle, whatsapp_phone FROM oltp.tutors WHERE id = %s",
                (tid,),
            ).fetchone()
            if not tut:
                return None
            if tut.get("user_id") is not None:
                row = conn.execute(
                    """
                    SELECT chat_id FROM oltp.telegram_bindings
                    WHERE user_id = %s AND notifications_enabled = TRUE
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (int(tut["user_id"]),),
                ).fetchone()
                if row:
                    return str(row["chat_id"])
            handle = str(tut.get("telegram_handle") or "").strip().lstrip("@").lower()
            if handle and not handle.lstrip("+").isdigit():
                row = conn.execute(
                    """
                    SELECT chat_id FROM oltp.telegram_bindings
                    WHERE LOWER(LTRIM(telegram_username, '@')) = %s AND notifications_enabled = TRUE
                    ORDER BY updated_at DESC LIMIT 1
                    """,
                    (handle,),
                ).fetchone()
                if row:
                    return str(row["chat_id"])
            wa = _norm_tg_phone(str(tut.get("whatsapp_phone") or ""))
            if wa:
                row = conn.execute(
                    """
                    SELECT chat_id FROM oltp.telegram_bindings
                    WHERE phone_digits = %s AND notifications_enabled = TRUE
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
        flag = bool(enabled)
        with self._pool.connection() as conn:
            with conn.transaction():
                if by_user:
                    row = conn.execute(
                        """
                        UPDATE oltp.telegram_bindings
                        SET notifications_enabled = %s, updated_at = NOW()
                        WHERE user_id = %s
                        RETURNING *
                        """,
                        (flag, int(chat_id_or_user_id)),
                    ).fetchone()
                else:
                    row = conn.execute(
                        """
                        UPDATE oltp.telegram_bindings
                        SET notifications_enabled = %s, updated_at = NOW()
                        WHERE chat_id = %s
                        RETURNING *
                        """,
                        (flag, str(chat_id_or_user_id or "").strip()),
                    ).fetchone()
        return _pg_row_to_tg_binding(row) if row else None

    def unlink_telegram_binding(self, user_id: int) -> bool:
        with self._pool.connection() as conn:
            with conn.transaction():
                cur = conn.execute("DELETE FROM oltp.telegram_bindings WHERE user_id = %s", (int(user_id),))
                return int(cur.rowcount or 0) > 0

    def unlink_telegram_chat(self, chat_id: str) -> bool:
        cid = str(chat_id or "").strip()
        if not cid:
            return False
        with self._pool.connection() as conn:
            with conn.transaction():
                cur = conn.execute("DELETE FROM oltp.telegram_bindings WHERE chat_id = %s", (cid,))
                return int(cur.rowcount or 0) > 0
