"""Адаптер двойной записи DualWriteDatabase: SQLite (primary) + PostgreSQL 17 (mirror + outbox)."""

from typing import Any
import uuid

from databases.sqlite.store import Database, StorageError, User, hash_token


class DualWriteDatabase:
    """Адаптер двойной записи: SQLite (primary) + PostgreSQL 17 (mirror + outbox)."""

    def __init__(self, sqlite_db: Database, pg_db: Any) -> None:
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
