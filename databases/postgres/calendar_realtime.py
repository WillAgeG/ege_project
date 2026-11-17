"""Синхронизация расписания (.ics / GCal) и журнал realtime-событий (PostgreSQL 17)."""

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

from databases.sqlite.store import (
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
from .schema import _build_envelope, _iso_utc, _normalize_dow, _normalize_tz, _utc_now


class PgCalendarRealtimeMixin:
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
