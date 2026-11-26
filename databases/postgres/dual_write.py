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
        role: str = "student",
        max_users: int = 0,
    ) -> User:
        user = self.sqlite.create_user(
            raw_username,
            raw_password,
            email=email,
            display_name=display_name,
            role=role,
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
        *,
        role: str = "student",
        next_url: str = "/",
        link_user_id: int | None = None,
    ) -> str:
        raw_state = self.sqlite.create_oauth_state(
            provider,
            code_verifier,
            redirect_uri,
            ttl_sec,
            role=role,
            next_url=next_url,
            link_user_id=link_user_id,
        )
        pg_link_uid = self._resolve_pg_user_id(link_user_id, emit_outbox=False) if link_user_id is not None else None
        self.pg.insert_oauth_state_hash(
            hash_token(raw_state),
            provider,
            code_verifier,
            redirect_uri,
            ttl_sec,
            role=role,
            next_url=next_url,
            link_user_id=pg_link_uid,
        )
        return raw_state

    def consume_oauth_state_data(self, raw_state: str, provider: str) -> dict[str, Any] | None:
        res = self.sqlite.consume_oauth_state_data(raw_state, provider)
        self.pg.consume_oauth_state_data(raw_state, provider)
        return res

    def consume_oauth_state(self, raw_state: str, provider: str) -> tuple[str, str, str, str] | None:
        res = self.sqlite.consume_oauth_state(raw_state, provider)
        self.pg.consume_oauth_state(raw_state, provider)
        return res

    def get_user_linked_providers(self, user_id: int) -> dict[str, Any]:
        return self.sqlite.get_user_linked_providers(user_id)

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
        user = self.sqlite.link_oauth_identity(
            user_id,
            provider,
            subject,
            email=email,
            email_verified=email_verified,
            avatar_url=avatar_url,
        )
        pg_uid = self._resolve_pg_user_id(user.id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.mirror_oauth_identity(provider, subject, pg_uid, user.email)
        return user

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
        user = self.sqlite.upsert_oauth_user(
            provider,
            subject,
            email=email,
            email_verified=email_verified,
            display_name=display_name,
            avatar_url=avatar_url,
            role=role,
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

    def export_user_data(self, user_id: int) -> dict[str, Any]:
        return self.sqlite.export_user_data(user_id)

    def delete_user_account(self, user_id: int) -> dict[str, Any]:
        row = self._sqlite_user_row(user_id)
        pg_uid = (
            self.pg.find_user_id_by_username(str(row["username_lower"]))
            if row and row.get("username_lower")
            else None
        )
        res = self.sqlite.delete_user_account(user_id)
        if pg_uid is not None:
            try:
                self.pg.delete_user_account(pg_uid)
            except StorageError as exc:
                if exc.code != "not_found":
                    raise
        return res

    def upsert_calendar_sync(
        self,
        *,
        tutor_slug: str,
        user_id: int | None = None,
        tutor_name: str = "Преподаватель Вектор",
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

    def get_realtime_event(self, event_row_id: int) -> dict[str, Any] | None:
        res = self.sqlite.get_realtime_event(event_row_id)
        if res is not None:
            return res
        try:
            return self.pg.get_realtime_event(event_row_id)
        except Exception:
            return None

    def notify_realtime_event(self, pg_channel: str, payload_json: str) -> None:
        try:
            self.pg.notify_realtime_event(pg_channel, payload_json)
        except Exception:
            pass

    def advisory_lock(self, lock_key: int) -> Any:
        return self.pg.advisory_lock(lock_key)

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

    def create_tutor_application(
        self,
        payload: dict[str, Any],
        *,
        user_id: int | None = None,
        application_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_tutor_application(
            payload, user_id=user_id, application_id=application_id
        )
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False) if user_id is not None else None
        try:
            self.pg.create_tutor_application(
                payload, user_id=pg_uid, application_id=res["id"]
            )
        except Exception:
            pass
        return res

    def admin_list_tutor_applications(
        self,
        *,
        status: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        return self.sqlite.admin_list_tutor_applications(status=status, limit=limit)

    def admin_review_tutor_application(
        self,
        app_id: Any,
        *,
        status: str,
        review_note: str = "",
        publish_to_catalog: bool = False,
    ) -> dict[str, Any]:
        res = self.sqlite.admin_review_tutor_application(
            app_id,
            status=status,
            review_note=review_note,
            publish_to_catalog=publish_to_catalog,
        )
        try:
            self.pg.admin_review_tutor_application(
                app_id,
                status=status,
                review_note=review_note,
                publish_to_catalog=publish_to_catalog,
            )
        except Exception:
            pass
        return res

    def create_feedback_ticket(
        self,
        payload: dict[str, Any],
        *,
        user_id: int | None = None,
        asset_ids: list[str] | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_feedback_ticket(
            payload, user_id=user_id, asset_ids=asset_ids, ticket_id=ticket_id
        )
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False) if user_id is not None else None
        try:
            self.pg.create_feedback_ticket(
                payload, user_id=pg_uid, asset_ids=asset_ids, ticket_id=res["id"]
            )
        except Exception:
            pass
        return res

    def get_feedback_ticket(self, ticket_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_feedback_ticket(ticket_id)

    def get_feedback_attachment_asset(self, ticket_id: str, asset_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_feedback_attachment_asset(ticket_id, asset_id)

    def admin_list_feedback_tickets(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        return self.sqlite.admin_list_feedback_tickets(kind=kind, status=status, limit=limit)

    def admin_review_feedback_ticket(
        self,
        ticket_id: Any,
        *,
        status: str,
        review_note: str = "",
        reviewed_by: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.admin_review_feedback_ticket(
            ticket_id,
            status=status,
            review_note=review_note,
            reviewed_by=reviewed_by,
        )
        try:
            self.pg.admin_review_feedback_ticket(
                ticket_id,
                status=status,
                review_note=review_note,
                reviewed_by=reviewed_by,
            )
        except Exception:
            pass
        return res

    def get_wallet(self, user_id: int) -> dict[str, Any]:
        return self.sqlite.get_wallet(user_id)

    def topup_wallet(
        self,
        user_id: int,
        *,
        amount_rub: int,
        method: str = "sbp",
        card_id: str | None = None,
        plan_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.topup_wallet(
            user_id, amount_rub=amount_rub, method=method, card_id=card_id, plan_id=plan_id
        )
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.topup_wallet(
                pg_uid, amount_rub=amount_rub, method=method, card_id=card_id, plan_id=plan_id
            )
        return res

    def add_saved_card(self, user_id: int, card: dict[str, Any], *, card_id: str | None = None) -> dict[str, Any]:
        res = self.sqlite.add_saved_card(user_id, card, card_id=card_id)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.add_saved_card(pg_uid, card, card_id=res["card"]["id"])
        return res

    def delete_saved_card(self, user_id: int, card_id: str) -> dict[str, Any]:
        res = self.sqlite.delete_saved_card(user_id, card_id)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.delete_saved_card(pg_uid, card_id)
        return res

    def list_tutors(
        self,
        *,
        subject: str | None = None,
        city: str | None = None,
        limit: int = 100,
        include_unpublished: bool = False,
    ) -> list[dict[str, Any]]:
        return self.pg.list_tutors(
            subject=subject,
            city=city,
            limit=limit,
            include_unpublished=include_unpublished,
        )

    def list_tutor_profiles(self, user_id: int) -> list[dict[str, Any]]:
        return self.sqlite.list_tutor_profiles(user_id)

    def upsert_tutor_profile(
        self,
        user_id: int,
        payload: dict[str, Any],
        *,
        tutor_id: str | None = None,
        create_new: bool = False,
        strict_tutor_id: bool = False,
    ) -> dict[str, Any]:
        res = self.sqlite.upsert_tutor_profile(
            user_id,
            payload,
            tutor_id=tutor_id,
            create_new=create_new,
            strict_tutor_id=strict_tutor_id,
        )
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.upsert_tutor_profile(
                pg_uid,
                payload,
                tutor_id=res["tutor"]["id"],
                create_new=create_new,
                strict_tutor_id=strict_tutor_id,
            )
        return res

    def set_tutor_profile_published(
        self,
        user_id: int,
        tutor_id: str,
        published: bool,
        *,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        res = self.sqlite.set_tutor_profile_published(user_id, tutor_id, published, actor_role=actor_role)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.set_tutor_profile_published(pg_uid, tutor_id, published, actor_role=actor_role)
        return res

    def delete_tutor_profile(
        self,
        user_id: int,
        tutor_id: str,
        *,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        res = self.sqlite.delete_tutor_profile(user_id, tutor_id, actor_role=actor_role)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.delete_tutor_profile(pg_uid, tutor_id, actor_role=actor_role)
        return res

    def update_tutor_account(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        res = self.sqlite.update_tutor_account(user_id, payload)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.update_tutor_account(pg_uid, payload)
        return res

    def bump_tutor(
        self, user_id: int, *, actor_role: str = "student", tutor_id: str | None = None
    ) -> dict[str, Any]:
        res = self.sqlite.bump_tutor(user_id, actor_role=actor_role, tutor_id=tutor_id)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.bump_tutor(pg_uid, actor_role=actor_role, tutor_id=res["id"])
        return res

    def list_bookings(
        self,
        user_id: int,
        *,
        scope: str = "student",
        tutor_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_bookings(user_id, scope=scope, tutor_id=tutor_id, limit=limit)

    def create_booking(
        self,
        user_id: int,
        payload: dict[str, Any],
        *,
        booking_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_booking(user_id, payload, booking_id=booking_id)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            pg_payload = dict(payload)
            tm_url = str((res.get("booking") or {}).get("telemostUrl") or "").strip()
            if tm_url:
                pg_payload["telemostUrl"] = tm_url
            self.pg.create_booking(pg_uid, pg_payload, booking_id=res["booking"]["id"])
        return res

    def transition_booking(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        action: str,
        counter_price_rub: int | None = None,
        allow_student_demo_accept: bool = True,
    ) -> dict[str, Any]:
        res = self.sqlite.transition_booking(
            booking_id,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
            action=action,
            counter_price_rub=counter_price_rub,
            allow_student_demo_accept=allow_student_demo_accept,
        )
        pg_uid = self._resolve_pg_user_id(actor_user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.transition_booking(
                booking_id,
                actor_user_id=pg_uid,
                actor_role=actor_role,
                action=action,
                counter_price_rub=counter_price_rub,
                allow_student_demo_accept=allow_student_demo_accept,
            )
        return res

    def update_booking_schedule(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        schedule_plan: dict[str, Any],
    ) -> dict[str, Any]:
        res = self.sqlite.update_booking_schedule(
            booking_id, actor_user_id=actor_user_id, actor_role=actor_role, schedule_plan=schedule_plan
        )
        pg_uid = self._resolve_pg_user_id(actor_user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.update_booking_schedule(
                booking_id, actor_user_id=pg_uid, actor_role=actor_role, schedule_plan=schedule_plan
            )
        return res

    def update_booking_telemost(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        telemost_url: str,
    ) -> dict[str, Any]:
        res = self.sqlite.update_booking_telemost(
            booking_id, actor_user_id=actor_user_id, actor_role=actor_role, telemost_url=telemost_url
        )
        pg_uid = self._resolve_pg_user_id(actor_user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.update_booking_telemost(
                booking_id, actor_user_id=pg_uid, actor_role=actor_role, telemost_url=telemost_url
            )
        return res

    def list_student_leads(
        self,
        *,
        subject: str | None = None,
        student_user_id: int | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        if student_user_id is not None:
            return self.sqlite.list_student_leads(subject=subject, student_user_id=student_user_id, limit=limit)
        return self.sqlite.list_student_leads(subject=subject, limit=limit)

    def create_student_lead(
        self,
        student_user_id: int | None,
        payload: dict[str, Any],
        *,
        lead_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_student_lead(student_user_id, payload, lead_id=lead_id)
        pg_uid = self._resolve_pg_user_id(student_user_id, emit_outbox=False) if student_user_id is not None else None
        self.pg.create_student_lead(pg_uid, payload, lead_id=res["id"])
        return res

    def close_student_lead(
        self,
        lead_id: str,
        *,
        actor_user_id: int,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        res = self.sqlite.close_student_lead(lead_id, actor_user_id=actor_user_id, actor_role=actor_role)
        pg_uid = self._resolve_pg_user_id(actor_user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.close_student_lead(lead_id, actor_user_id=pg_uid, actor_role=actor_role)
        return res

    def list_tutor_contacts(self, user_id: int) -> dict[str, dict[str, str]]:
        return self.sqlite.list_tutor_contacts(user_id)

    def upsert_tutor_contact(
        self,
        user_id: int,
        tutor_id: str,
        *,
        whatsapp: str | None = None,
        telegram: str | None = None,
        max_handle: str | None = None,
    ) -> dict[str, str]:
        res = self.sqlite.upsert_tutor_contact(
            user_id, tutor_id, whatsapp=whatsapp, telegram=telegram, max_handle=max_handle
        )
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.upsert_tutor_contact(
                pg_uid, tutor_id, whatsapp=whatsapp, telegram=telegram, max_handle=max_handle
            )
        return res

    def get_tutor_wallet_summary(self, user_id: int, tutor_id: str | None = None) -> dict[str, Any]:
        return self.sqlite.get_tutor_wallet_summary(user_id, tutor_id=tutor_id)

    def create_tutor_payout(
        self,
        user_id: int,
        payload: dict[str, Any],
        *,
        actor_role: str = "student",
        payout_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_tutor_payout(user_id, payload, actor_role=actor_role, payout_id=payout_id)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            pg_payload = dict(payload)
            if res["payout"].get("idempotencyKey"):
                pg_payload["idempotencyKey"] = res["payout"]["idempotencyKey"]
            if res["payout"].get("npdReceipt"):
                pg_payload["npdReceiptCode"] = res["payout"]["npdReceipt"]
            self.pg.create_tutor_payout(
                pg_uid, pg_payload, actor_role=actor_role, payout_id=res["payout"]["id"]
            )
        return res

    def list_market_directions(self, *, limit: int = 200) -> list[dict[str, Any]]:
        return self.sqlite.list_market_directions(limit=limit)

    def upsert_market_direction(
        self,
        payload: dict[str, Any],
        *,
        direction_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.upsert_market_direction(payload, direction_id=direction_id)
        resolved_id = str((res.get("direction") or {}).get("id") or direction_id or "") or None
        self.pg.upsert_market_direction(payload, direction_id=resolved_id)
        return res

    def list_tutor_reviews(self, tutor_id: str, *, limit: int = 50) -> dict[str, Any]:
        return self.sqlite.list_tutor_reviews(tutor_id, limit=limit)

    def list_tutor_review_summaries(self) -> dict[str, dict[str, Any]]:
        return self.sqlite.list_tutor_review_summaries()

    def create_tutor_review(
        self,
        student_user_id: int | None,
        tutor_id: str,
        payload: dict[str, Any],
        *,
        review_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_tutor_review(student_user_id, tutor_id, payload, review_id=review_id)
        pg_uid = self._resolve_pg_user_id(student_user_id, emit_outbox=False) if student_user_id is not None else None
        self.pg.create_tutor_review(pg_uid, tutor_id, payload, review_id=res["review"]["id"])
        return res

    def list_disputes(
        self,
        *,
        student_user_id: int | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        if student_user_id is not None:
            return self.sqlite.list_disputes(student_user_id=student_user_id, limit=limit)
        return self.sqlite.list_disputes(limit=limit)

    def open_dispute(
        self,
        actor_user_id: int,
        booking_id: str,
        payload: dict[str, Any],
        *,
        actor_role: str = "student",
        dispute_id: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.open_dispute(
            actor_user_id, booking_id, payload, actor_role=actor_role, dispute_id=dispute_id
        )
        pg_uid = self._resolve_pg_user_id(actor_user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.open_dispute(
                pg_uid, booking_id, payload, actor_role=actor_role, dispute_id=res["dispute"]["id"]
            )
        return res

    def resolve_dispute(
        self,
        dispute_id: str,
        action: str,
        *,
        resolution_note: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.resolve_dispute(dispute_id, action, resolution_note=resolution_note)
        self.pg.resolve_dispute(dispute_id, action, resolution_note=resolution_note)
        return res

    def create_telegram_link_token(self, user_id: int, ttl_sec: int = 900) -> str:
        raw_token = self.sqlite.create_telegram_link_token(user_id, ttl_sec=ttl_sec)
        pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
        if pg_uid is not None:
            self.pg.insert_telegram_link_token_hash(hash_token(raw_token), pg_uid, ttl_sec=ttl_sec)
        return raw_token

    def consume_telegram_link_token(self, raw_token: str) -> int | None:
        uid = self.sqlite.consume_telegram_link_token(raw_token)
        self.pg.consume_telegram_link_token(raw_token)
        return uid

    def get_user_by_id(self, user_id: int) -> User | None:
        return self.sqlite.get_user_by_id(user_id)

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
        res = self.sqlite.upsert_telegram_binding(
            chat_id,
            user_id=user_id,
            telegram_user_id=telegram_user_id,
            telegram_username=telegram_username,
            phone_digits=phone_digits,
            first_name=first_name,
            notifications_enabled=notifications_enabled,
        )
        eff_uid = user_id if user_id is not None else res.get("userId")
        pg_uid = self._resolve_pg_user_id(int(eff_uid), emit_outbox=False) if eff_uid is not None else None
        self.pg.upsert_telegram_binding(
            chat_id,
            user_id=pg_uid,
            telegram_user_id=telegram_user_id,
            telegram_username=telegram_username,
            phone_digits=phone_digits,
            first_name=first_name,
            notifications_enabled=notifications_enabled,
        )
        return res

    def get_telegram_binding_by_user(self, user_id: int) -> dict[str, Any] | None:
        return self.sqlite.get_telegram_binding_by_user(user_id)

    def get_telegram_binding_by_chat(self, chat_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_telegram_binding_by_chat(chat_id)

    def find_telegram_chat_by_phone(self, phone_digits: str) -> str | None:
        return self.sqlite.find_telegram_chat_by_phone(phone_digits)

    def find_telegram_chat_for_tutor(self, tutor_id: str) -> str | None:
        return self.sqlite.find_telegram_chat_for_tutor(tutor_id)

    def set_telegram_notifications(
        self,
        chat_id_or_user_id: str | int,
        enabled: bool,
        *,
        by_user: bool = False,
    ) -> dict[str, Any] | None:
        res = self.sqlite.set_telegram_notifications(chat_id_or_user_id, enabled, by_user=by_user)
        if by_user:
            pg_uid = self._resolve_pg_user_id(int(chat_id_or_user_id), emit_outbox=False)
            if pg_uid is not None:
                self.pg.set_telegram_notifications(pg_uid, enabled, by_user=True)
        else:
            self.pg.set_telegram_notifications(chat_id_or_user_id, enabled, by_user=False)
        return res

    def unlink_telegram_binding(self, user_id: int) -> bool:
        row = self._sqlite_user_row(user_id)
        pg_uid = (
            self.pg.find_user_id_by_username(str(row["username_lower"]))
            if row and row.get("username_lower")
            else None
        )
        res = self.sqlite.unlink_telegram_binding(user_id)
        if pg_uid is not None:
            self.pg.unlink_telegram_binding(pg_uid)
        return res

    def unlink_telegram_chat(self, chat_id: str) -> bool:
        res = self.sqlite.unlink_telegram_chat(chat_id)
        self.pg.unlink_telegram_chat(chat_id)
        return res

    def list_scheduler_bookings(
        self,
        *,
        statuses: tuple[str, ...] = ("pending", "countered", "accepted"),
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_scheduler_bookings(statuses=statuses, limit=limit)

    def auto_capture_booking(
        self,
        booking_id: str,
        *,
        reason: str = "slot_finished",
    ) -> dict[str, Any] | None:
        res = self.sqlite.auto_capture_booking(booking_id, reason=reason)
        if res is not None:
            self.pg.auto_capture_booking(booking_id, reason=reason)
        return res

    def auto_expire_pending_booking(
        self,
        booking_id: str,
        *,
        reason: str = "expired",
    ) -> dict[str, Any] | None:
        res = self.sqlite.auto_expire_pending_booking(booking_id, reason=reason)
        if res is not None:
            self.pg.auto_expire_pending_booking(booking_id, reason=reason)
        return res

    def has_lesson_reminder_sent(self, booking_id: str, kind: str, recipient_role: str) -> bool:
        return self.sqlite.has_lesson_reminder_sent(booking_id, kind, recipient_role)

    def mark_lesson_reminder_sent(
        self,
        booking_id: str,
        kind: str,
        recipient_role: str,
        chat_id: str = "",
    ) -> bool:
        ok = self.sqlite.mark_lesson_reminder_sent(booking_id, kind, recipient_role, chat_id=chat_id)
        self.pg.mark_lesson_reminder_sent(booking_id, kind, recipient_role, chat_id=chat_id)
        return ok

    def create_media_asset(
        self,
        *,
        asset_id: str | None = None,
        user_id: int | None,
        kind: str,
        storage_driver: str,
        bucket: str,
        object_key: str,
        content_type: str,
        size_bytes: int,
        sha256: str = "",
        original_filename: str = "",
        public_url: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_media_asset(
            asset_id=asset_id,
            user_id=user_id,
            kind=kind,
            storage_driver=storage_driver,
            bucket=bucket,
            object_key=object_key,
            content_type=content_type,
            size_bytes=size_bytes,
            sha256=sha256,
            original_filename=original_filename,
            public_url=public_url,
        )
        pg_uid = self._resolve_pg_user_id(int(user_id), emit_outbox=False) if user_id is not None else None
        self.pg.create_media_asset(
            asset_id=res["id"],
            user_id=pg_uid,
            kind=kind,
            storage_driver=storage_driver,
            bucket=bucket,
            object_key=object_key,
            content_type=content_type,
            size_bytes=size_bytes,
            sha256=sha256,
            original_filename=original_filename,
            public_url=public_url,
        )
        return res

    def get_media_asset(self, asset_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_media_asset(asset_id)

    def set_user_avatar_url(
        self,
        user_id: int,
        avatar_url: str,
        *,
        update_tutor: bool = False,
    ) -> dict[str, Any]:
        res = self.sqlite.set_user_avatar_url(user_id, avatar_url, update_tutor=update_tutor)
        pg_uid = self._resolve_pg_user_id(int(user_id), emit_outbox=False)
        if pg_uid is not None:
            self.pg.set_user_avatar_url(pg_uid, avatar_url, update_tutor=update_tutor)
        return res

    def create_tutor_verification(
        self,
        *,
        verification_id: str | None = None,
        user_id: int,
        asset_id: str,
        doc_type: str = "diploma",
        title: str = "",
        comment: str = "",
        tutor_id: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.create_tutor_verification(
            verification_id=verification_id,
            user_id=user_id,
            asset_id=asset_id,
            doc_type=doc_type,
            title=title,
            comment=comment,
            tutor_id=tutor_id,
        )
        pg_uid = self._resolve_pg_user_id(int(user_id), emit_outbox=False)
        if pg_uid is not None:
            self.pg.create_tutor_verification(
                verification_id=res["id"],
                user_id=pg_uid,
                asset_id=asset_id,
                doc_type=doc_type,
                title=title,
                comment=comment,
                tutor_id=res.get("tutorId") or tutor_id,
            )
        return res

    def get_verification(self, verification_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_verification(verification_id)

    def list_user_verifications(self, user_id: int) -> list[dict[str, Any]]:
        return self.sqlite.list_user_verifications(user_id)

    def admin_list_verifications(
        self,
        *,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return self.sqlite.admin_list_verifications(status=status, limit=limit)

    def admin_review_verification(
        self,
        verification_id: str,
        action: str,
        *,
        review_note: str = "",
        reviewer: str = "admin",
    ) -> dict[str, Any]:
        res = self.sqlite.admin_review_verification(
            verification_id, action, review_note=review_note, reviewer=reviewer
        )
        try:
            self.pg.admin_review_verification(
                verification_id, action, review_note=review_note, reviewer=reviewer
            )
        except Exception:
            pass
        return res

    # ---------- Эквайринг ЮKassa / payment_intents ----------

    def create_payment_intent(
        self,
        user_id: int,
        *,
        amount_rub: int,
        method: str = "sbp",
        plan_id: str | None = None,
        provider: str = "yookassa",
        receipt_email: str = "",
        receipt_phone: str = "",
        return_url: str = "",
        intent_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_payment_intent(
            user_id,
            amount_rub=amount_rub,
            method=method,
            plan_id=plan_id,
            provider=provider,
            receipt_email=receipt_email,
            receipt_phone=receipt_phone,
            return_url=return_url,
            intent_id=intent_id,
            idempotency_key=idempotency_key,
        )
        pg_uid = self._resolve_pg_user_id(int(user_id), emit_outbox=False)
        if pg_uid is not None:
            self.pg.create_payment_intent(
                pg_uid,
                amount_rub=amount_rub,
                method=method,
                plan_id=plan_id,
                provider=provider,
                receipt_email=receipt_email,
                receipt_phone=receipt_phone,
                return_url=return_url,
                intent_id=res["id"],
                idempotency_key=res["idempotencyKey"],
            )
        return res

    def attach_provider_payment(
        self,
        intent_id: str,
        *,
        provider_payment_id: str,
        confirmation_url: str,
        status: str = "pending",
    ) -> dict[str, Any] | None:
        res = self.sqlite.attach_provider_payment(
            intent_id,
            provider_payment_id=provider_payment_id,
            confirmation_url=confirmation_url,
            status=status,
        )
        try:
            self.pg.attach_provider_payment(
                intent_id,
                provider_payment_id=provider_payment_id,
                confirmation_url=confirmation_url,
                status=status,
            )
        except Exception:
            pass
        return res

    def get_payment_intent(self, intent_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payment_intent(intent_id)

    def get_payment_intent_by_provider_id(self, provider_payment_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payment_intent_by_provider_id(provider_payment_id)

    def list_payment_intents(
        self,
        *,
        user_id: int | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_payment_intents(user_id=user_id, status=status, limit=limit)

    def complete_payment_intent_succeeded(
        self,
        intent_id: str,
        *,
        provider_payment_id: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.complete_payment_intent_succeeded(
            intent_id, provider_payment_id=provider_payment_id
        )
        try:
            self.pg.complete_payment_intent_succeeded(
                intent_id, provider_payment_id=provider_payment_id
            )
        except Exception:
            pass
        return res

    def mark_payment_intent_canceled(self, intent_id: str, *, reason: str = "") -> dict[str, Any] | None:
        res = self.sqlite.mark_payment_intent_canceled(intent_id, reason=reason)
        try:
            self.pg.mark_payment_intent_canceled(intent_id, reason=reason)
        except Exception:
            pass
        return res

    # ---------- Банковские возвраты / payment_refunds ----------

    def list_refundable_payment_intents(self, user_id: int) -> list[dict[str, Any]]:
        return self.sqlite.list_refundable_payment_intents(user_id)

    def create_wallet_refund_request(
        self,
        user_id: int,
        *,
        amount_rub: int,
        reason: str = "",
        payment_intent_id: str | None = None,
        allow_demo_without_intent: bool = False,
        receipt_email: str = "",
        refund_ids: list[str] | None = None,
        idempotency_keys: list[str] | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_wallet_refund_request(
            user_id,
            amount_rub=amount_rub,
            reason=reason,
            payment_intent_id=payment_intent_id,
            allow_demo_without_intent=allow_demo_without_intent,
            receipt_email=receipt_email,
            refund_ids=refund_ids,
            idempotency_keys=idempotency_keys,
        )
        pg_uid = self._resolve_pg_user_id(int(user_id), emit_outbox=False)
        if pg_uid is not None:
            try:
                self.pg.create_wallet_refund_request(
                    pg_uid,
                    amount_rub=amount_rub,
                    reason=reason,
                    payment_intent_id=payment_intent_id,
                    allow_demo_without_intent=allow_demo_without_intent,
                    receipt_email=receipt_email,
                    refund_ids=[r["id"] for r in res.get("refunds") or []],
                    idempotency_keys=[r["idempotencyKey"] for r in res.get("refunds") or []],
                )
            except Exception:
                pass
        return res

    def get_payment_refund(self, refund_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payment_refund(refund_id)

    def get_payment_refund_by_provider_id(self, provider_refund_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payment_refund_by_provider_id(provider_refund_id)

    def list_payment_refunds(
        self,
        *,
        user_id: int | None = None,
        status: str | None = None,
        payment_intent_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_payment_refunds(
            user_id=user_id, status=status, payment_intent_id=payment_intent_id, limit=limit
        )

    def attach_provider_refund(
        self,
        refund_id: str,
        *,
        provider_refund_id: str | None,
        status: str = "pending",
        reviewed_by: str = "",
        review_note: str = "",
        error_message: str = "",
    ) -> dict[str, Any] | None:
        res = self.sqlite.attach_provider_refund(
            refund_id,
            provider_refund_id=provider_refund_id,
            status=status,
            reviewed_by=reviewed_by,
            review_note=review_note,
            error_message=error_message,
        )
        try:
            self.pg.attach_provider_refund(
                refund_id,
                provider_refund_id=provider_refund_id,
                status=status,
                reviewed_by=reviewed_by,
                review_note=review_note,
                error_message=error_message,
            )
        except Exception:
            pass
        return res

    def complete_payment_refund_succeeded(
        self,
        refund_id: str,
        *,
        provider_refund_id: str = "",
        reviewed_by: str = "",
        review_note: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.complete_payment_refund_succeeded(
            refund_id,
            provider_refund_id=provider_refund_id,
            reviewed_by=reviewed_by,
            review_note=review_note,
        )
        try:
            self.pg.complete_payment_refund_succeeded(
                refund_id,
                provider_refund_id=provider_refund_id,
                reviewed_by=reviewed_by,
                review_note=review_note,
            )
        except Exception:
            pass
        return res

    def cancel_or_reject_payment_refund(
        self,
        refund_id: str,
        *,
        next_status: str = "canceled",
        reason: str = "",
        reviewed_by: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.cancel_or_reject_payment_refund(
            refund_id,
            next_status=next_status,
            reason=reason,
            reviewed_by=reviewed_by,
        )
        try:
            self.pg.cancel_or_reject_payment_refund(
                refund_id,
                next_status=next_status,
                reason=reason,
                reviewed_by=reviewed_by,
            )
        except Exception:
            pass
        return res

    def get_payout(self, payout_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payout(payout_id)

    def get_payout_dispatch_details(self, payout_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payout_dispatch_details(payout_id)

    def get_payout_by_provider_id(self, provider_payout_id: str) -> dict[str, Any] | None:
        return self.sqlite.get_payout_by_provider_id(provider_payout_id)

    def list_pending_provider_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        return self.sqlite.list_pending_provider_payouts(limit=limit)

    def attach_provider_payout(
        self,
        payout_id: str,
        *,
        provider: str,
        provider_payout_id: str | None,
        provider_status: str,
        error_message: str = "",
    ) -> dict[str, Any] | None:
        res = self.sqlite.attach_provider_payout(
            payout_id,
            provider=provider,
            provider_payout_id=provider_payout_id,
            provider_status=provider_status,
            error_message=error_message,
        )
        try:
            self.pg.attach_provider_payout(
                payout_id,
                provider=provider,
                provider_payout_id=provider_payout_id,
                provider_status=provider_status,
                error_message=error_message,
            )
        except Exception:
            pass
        return res

    def finalize_payout_succeeded(
        self,
        payout_id: str,
        *,
        provider_payout_id: str | None = None,
        provider_status: str = "succeeded",
    ) -> dict[str, Any]:
        res = self.sqlite.finalize_payout_succeeded(
            payout_id,
            provider_payout_id=provider_payout_id,
            provider_status=provider_status,
        )
        try:
            self.pg.finalize_payout_succeeded(
                payout_id,
                provider_payout_id=provider_payout_id,
                provider_status=provider_status,
            )
        except Exception:
            pass
        return res

    def finalize_payout_canceled(
        self,
        payout_id: str,
        *,
        reason: str = "",
        provider_status: str = "canceled",
    ) -> dict[str, Any]:
        res = self.sqlite.finalize_payout_canceled(
            payout_id,
            reason=reason,
            provider_status=provider_status,
        )
        try:
            self.pg.finalize_payout_canceled(
                payout_id,
                reason=reason,
                provider_status=provider_status,
            )
        except Exception:
            pass
        return res

    def save_npd_receipt(
        self,
        payout_id: str,
        *,
        tutor_id: str,
        tutor_inn: str,
        provider: str,
        receipt_uuid: str,
        receipt_url: str,
        receipt_json_url: str,
        service_name: str,
        amount_rub: int,
        status: str,
        error_message: str = "",
    ) -> dict[str, Any]:
        res = self.sqlite.save_npd_receipt(
            payout_id,
            tutor_id=tutor_id,
            tutor_inn=tutor_inn,
            provider=provider,
            receipt_uuid=receipt_uuid,
            receipt_url=receipt_url,
            receipt_json_url=receipt_json_url,
            service_name=service_name,
            amount_rub=amount_rub,
            status=status,
            error_message=error_message,
        )
        try:
            self.pg.save_npd_receipt(
                payout_id,
                tutor_id=tutor_id,
                tutor_inn=tutor_inn,
                provider=provider,
                receipt_uuid=receipt_uuid,
                receipt_url=receipt_url,
                receipt_json_url=receipt_json_url,
                service_name=service_name,
                amount_rub=amount_rub,
                status=status,
                error_message=error_message,
            )
        except Exception:
            pass
        return res

    def list_npd_receipts(self, *, tutor_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        return self.sqlite.list_npd_receipts(tutor_id=tutor_id, limit=limit)

    def update_tutor_inn(
        self,
        tutor_id: str | None,
        *,
        inn: str,
        npd_verified: bool,
        actor_user_id: int | None = None,
        actor_role: str = "student",
    ) -> dict[str, Any] | None:
        res = self.sqlite.update_tutor_inn(
            tutor_id,
            inn=inn,
            npd_verified=npd_verified,
            actor_user_id=actor_user_id,
            actor_role=actor_role,
        )
        pg_uid = self._resolve_pg_user_id(actor_user_id, emit_outbox=False) if actor_user_id is not None else None
        try:
            eff_tid = res["tutorId"] if res else tutor_id
            self.pg.update_tutor_inn(
                eff_tid,
                inn=inn,
                npd_verified=npd_verified,
                actor_user_id=pg_uid,
                actor_role=actor_role,
            )
        except Exception:
            pass
        return res

    def count_tutor_captured_lessons(self, tutor_id: str) -> int:
        return self.sqlite.count_tutor_captured_lessons(tutor_id)

    # ---------- Персистентный RateLimiter и PhoneOtpStore ----------

    def check_rate_limit(
        self,
        key: str,
        limit: int,
        window_sec: int,
        *,
        now_ts: float | None = None,
    ) -> tuple[bool, int]:
        res = self.sqlite.check_rate_limit(key, limit, window_sec, now_ts=now_ts)
        try:
            self.pg.check_rate_limit(key, limit, window_sec, now_ts=now_ts)
        except Exception:
            pass
        return res

    def get_phone_otp(
        self,
        phone_digits: str,
        *,
        now_ts: float | None = None,
    ) -> dict[str, Any] | None:
        return self.sqlite.get_phone_otp(phone_digits, now_ts=now_ts)

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
        res = self.sqlite.upsert_phone_otp(
            phone_digits,
            code_hash=code_hash,
            channel=channel,
            mode=mode,
            invite_ok=invite_ok,
            ttl_sec=ttl_sec,
            now_ts=now_ts,
        )
        try:
            self.pg.upsert_phone_otp(
                phone_digits,
                code_hash=code_hash,
                channel=channel,
                mode=mode,
                invite_ok=invite_ok,
                ttl_sec=ttl_sec,
                now_ts=now_ts,
            )
        except Exception:
            pass
        return res

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
        res = self.sqlite.verify_and_consume_phone_otp(
            phone_digits,
            candidate_hash,
            max_attempts=max_attempts,
            server_invite=server_invite,
            invite_code=invite_code,
            now_ts=now_ts,
        )
        try:
            self.pg.verify_and_consume_phone_otp(
                phone_digits,
                candidate_hash,
                max_attempts=max_attempts,
                server_invite=server_invite,
                invite_code=invite_code,
                now_ts=now_ts,
            )
        except Exception:
            pass
        return res

    def prune_expired_security_state(
        self,
        *,
        now_ts: float | None = None,
        realtime_retention_days: int = 30,
    ) -> dict[str, int]:
        res = self.sqlite.prune_expired_security_state(
            now_ts=now_ts,
            realtime_retention_days=realtime_retention_days,
        )
        try:
            self.pg.prune_expired_security_state(
                now_ts=now_ts,
                realtime_retention_days=realtime_retention_days,
            )
        except Exception:
            pass
        return res

    def list_tutor_ids_for_user(self, user_id: int) -> list[str]:
        return self.sqlite.list_tutor_ids_for_user(user_id)

    def authorize_chat_thread(
        self,
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
        booking_id: str | None = None,
        tutor_id: str = "",
    ) -> dict[str, Any]:
        return self.sqlite.authorize_chat_thread(
            thread_id,
            user_id=user_id,
            role=role,
            booking_id=booking_id,
            tutor_id=tutor_id,
        )

    def list_chat_threads(self, user_id: int, role: str = "student", limit: int = 50) -> list[dict[str, Any]]:
        return self.sqlite.list_chat_threads(user_id, role=role, limit=limit)

    def list_chat_messages(
        self,
        thread_id: str,
        user_id: int,
        role: str = "student",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_chat_messages(thread_id, user_id=user_id, role=role, limit=limit)

    def create_chat_message(
        self,
        thread_id: str,
        *,
        sender_user_id: int,
        sender_role: str = "student",
        sender_name: str = "",
        body: str = "",
        booking_id: str | None = None,
        tutor_id: str = "",
        msg_id: str | None = None,
        asset_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        res = self.sqlite.create_chat_message(
            thread_id,
            sender_user_id=sender_user_id,
            sender_role=sender_role,
            sender_name=sender_name,
            body=body,
            booking_id=booking_id,
            tutor_id=tutor_id,
            msg_id=msg_id,
            asset_ids=asset_ids,
        )
        try:
            pg_uid = self._resolve_pg_user_id(sender_user_id, emit_outbox=False)
            if pg_uid is not None:
                self.pg.create_chat_message(
                    thread_id,
                    sender_user_id=pg_uid,
                    sender_role=sender_role,
                    sender_name=sender_name,
                    body=body,
                    booking_id=booking_id,
                    tutor_id=tutor_id,
                    msg_id=res.get("id"),
                    asset_ids=asset_ids,
                )
        except Exception:
            pass
        return res

    def get_chat_attachment_asset(
        self,
        thread_id: str,
        asset_id: str,
        *,
        user_id: int,
        role: str = "student",
    ) -> dict[str, Any] | None:
        return self.sqlite.get_chat_attachment_asset(thread_id, asset_id, user_id=user_id, role=role)

    def get_chat_thread_notification_target(
        self,
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
    ) -> dict[str, Any]:
        return self.sqlite.get_chat_thread_notification_target(thread_id, user_id=user_id, role=role)

    def mark_chat_read(self, thread_id: str, *, user_id: int, role: str = "student") -> int:
        res = self.sqlite.mark_chat_read(thread_id, user_id=user_id, role=role)
        try:
            pg_uid = self._resolve_pg_user_id(user_id, emit_outbox=False)
            if pg_uid is not None:
                self.pg.mark_chat_read(thread_id, user_id=pg_uid, role=role)
        except Exception:
            pass
        return res

    def list_unanswered_chat_threads(
        self,
        *,
        older_than_iso: str,
        max_age_iso: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        return self.sqlite.list_unanswered_chat_threads(
            older_than_iso=older_than_iso,
            max_age_iso=max_age_iso,
            limit=limit,
        )

    def mark_chat_unanswered_notified(
        self,
        thread_id: str,
        anchor_message_id: str,
        recipient_role: str,
        *,
        latest_message_id: str = "",
        channels: list[str] | tuple[str, ...] = (),
    ) -> bool:
        ok = self.sqlite.mark_chat_unanswered_notified(
            thread_id,
            anchor_message_id,
            recipient_role,
            latest_message_id=latest_message_id,
            channels=channels,
        )
        try:
            self.pg.mark_chat_unanswered_notified(
                thread_id,
                anchor_message_id,
                recipient_role,
                latest_message_id=latest_message_id,
                channels=channels,
            )
        except Exception:
            pass
        return ok
