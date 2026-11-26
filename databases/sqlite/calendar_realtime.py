"""Синхронизация расписания (.ics / GCal) и журнал realtime-событий (SQLite)."""

import json
import secrets
import sqlite3
import time
from typing import Any

from .common import StorageError, _iso_utc_now, _normalize_dow, _normalize_tz


class SqliteCalendarRealtimeMixin:
    def _calendar_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        tutor_slug = str(row["tutor_slug"])
        try:
            open_slots = json.loads(row["open_slots"])
            if not isinstance(open_slots, dict):
                open_slots = {}
        except (json.JSONDecodeError, TypeError):
            open_slots = {}
        try:
            busy_slots = json.loads(row["busy_slots"])
            if not isinstance(busy_slots, list):
                busy_slots = []
        except (json.JSONDecodeError, TypeError):
            busy_slots = []

        ev_rows = self._conn.execute(
            """
            SELECT uid, tutor_slug, student_name, subject, exam, dow, slot_date, hour_slot,
                   duration_min, timezone, price_rub, status, source, note
            FROM calendar_events
            WHERE tutor_slug = ? AND source != 'gcal_ics'
            ORDER BY slot_date ASC, hour_slot ASC, uid ASC
            """,
            (tutor_slug,),
        ).fetchall()
        events: list[dict[str, Any]] = [
            {
                "uid": str(r["uid"]),
                "tutorSlug": str(r["tutor_slug"]),
                "studentName": str(r["student_name"]),
                "subject": str(r["subject"]),
                "exam": str(r["exam"]),
                "dow": int(r["dow"]),
                "slotDate": str(r["slot_date"]),
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
            "tutorSlug": tutor_slug,
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "tutorName": str(row["tutor_name"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "openSlots": open_slots,
            "busySlots": busy_slots,
            "events": events,
            "gcalConnected": bool(row["gcal_connected"]),
            "externalIcsUrl": row["external_ics_url"],
            "lastSyncedAt": str(row["last_synced_at"]),
        }

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
        slug = (tutor_slug or "").strip() or "default-tutor"
        tz = _normalize_tz(timezone)
        now_iso = _iso_utc_now()
        with self._lock:
            existing = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE tutor_slug = ?",
                (slug,),
            ).fetchone()
            feed_token = str(existing["feed_token"]) if existing else secrets.token_urlsafe(24)
            eff_user_id = user_id if user_id is not None else (existing["user_id"] if existing else None)
            eff_name = (tutor_name or "").strip() or (str(existing["tutor_name"]) if existing else "Преподаватель Вектор")
            eff_city = (city or "").strip() or (str(existing["city"]) if existing else ("Москва" if tz == "UTC+3" else "Якутск"))
            if open_slots is not None:
                eff_open_slots = open_slots
            elif existing:
                try:
                    eff_open_slots = json.loads(existing["open_slots"])
                except (json.JSONDecodeError, TypeError):
                    eff_open_slots = {}
            else:
                eff_open_slots = {}

            if busy_slots is not None:
                eff_busy_slots = busy_slots
            elif existing:
                try:
                    eff_busy_slots = json.loads(existing["busy_slots"])
                except (json.JSONDecodeError, TypeError):
                    eff_busy_slots = []
            else:
                eff_busy_slots = []

            if gcal_connected is not None:
                eff_gcal = 1 if gcal_connected else 0
            elif existing:
                eff_gcal = int(existing["gcal_connected"])
            else:
                eff_gcal = 0

            if external_ics_url is not None:
                eff_ext_url = external_ics_url.strip() or None
            elif existing:
                eff_ext_url = existing["external_ics_url"]
            else:
                eff_ext_url = None

            self._conn.execute(
                """
                INSERT INTO calendar_sync_tokens (
                    feed_token, user_id, tutor_slug, tutor_name, city, timezone,
                    external_ics_url, gcal_connected, open_slots, busy_slots,
                    last_synced_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(tutor_slug) DO UPDATE SET
                    user_id = excluded.user_id,
                    tutor_name = excluded.tutor_name,
                    city = excluded.city,
                    timezone = excluded.timezone,
                    external_ics_url = excluded.external_ics_url,
                    gcal_connected = excluded.gcal_connected,
                    open_slots = excluded.open_slots,
                    busy_slots = excluded.busy_slots,
                    last_synced_at = excluded.last_synced_at,
                    updated_at = excluded.updated_at
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
                    json.dumps(eff_open_slots, ensure_ascii=False),
                    json.dumps(eff_busy_slots, ensure_ascii=False),
                    now_iso,
                    now_iso,
                ),
            )

            if events is not None:
                self._conn.execute(
                    "DELETE FROM calendar_events WHERE tutor_slug = ? AND source = 'vektor'",
                    (slug,),
                )
                for idx, ev in enumerate(events):
                    slot_date = str(ev.get("slotDate") or ev.get("slot_date") or now_iso[:10])[:10]
                    hour_slot = str(ev.get("hour") or ev.get("hourSlot") or ev.get("hour_slot") or "16:00")[:5]
                    dow = _normalize_dow(ev.get("dow"), slot_date)
                    uid = str(ev.get("uid") or f"vektor:{slug}:{slot_date}:{hour_slot}:{idx}")
                    status = str(ev.get("status") or "accepted")
                    if status not in ("accepted", "pending", "external_busy", "cancelled"):
                        status = "accepted"
                    source = str(ev.get("source") or "vektor")
                    if source not in ("vektor", "gcal_ics", "manual"):
                        source = "vektor"
                    self._conn.execute(
                        """
                        INSERT INTO calendar_events (
                            uid, tutor_slug, student_name, subject, exam, dow, slot_date,
                            hour_slot, duration_min, timezone, price_rub, status, source, note, updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON CONFLICT(uid) DO UPDATE SET
                            tutor_slug = excluded.tutor_slug,
                            student_name = excluded.student_name,
                            subject = excluded.subject,
                            exam = excluded.exam,
                            dow = excluded.dow,
                            slot_date = excluded.slot_date,
                            hour_slot = excluded.hour_slot,
                            duration_min = excluded.duration_min,
                            timezone = excluded.timezone,
                            price_rub = excluded.price_rub,
                            status = excluded.status,
                            source = excluded.source,
                            note = excluded.note,
                            updated_at = excluded.updated_at
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
                            now_iso,
                        ),
                    )

            if busy_slots is not None:
                self._conn.execute(
                    "DELETE FROM calendar_events WHERE tutor_slug = ? AND source = 'gcal_ics'",
                    (slug,),
                )
                for idx, bs in enumerate(busy_slots):
                    slot_date = str(bs.get("slotDate") or bs.get("slot_date") or now_iso[:10])[:10]
                    hour_slot = str(bs.get("hour") or bs.get("hourSlot") or bs.get("hour_slot") or "16:00")[:5]
                    dow = _normalize_dow(bs.get("dow"), slot_date)
                    raw_uid = str(bs.get("uid") or f"gcal-{idx}")
                    row_uid = f"gcal:{slug}:{raw_uid}:{slot_date}:{hour_slot}:{idx}"
                    summary = str(bs.get("summary") or "Занято (Google Calendar)")
                    self._conn.execute(
                        """
                        INSERT INTO calendar_events (
                            uid, tutor_slug, student_name, subject, exam, dow, slot_date,
                            hour_slot, duration_min, timezone, price_rub, status, source, note, updated_at
                        ) VALUES (?, ?, ?, 'bio', 'ЕГЭ', ?, ?, ?, 60, ?, 0, 'external_busy', 'gcal_ics', ?, ?)
                        ON CONFLICT(uid) DO UPDATE SET
                            dow = excluded.dow,
                            slot_date = excluded.slot_date,
                            hour_slot = excluded.hour_slot,
                            timezone = excluded.timezone,
                            note = excluded.note,
                            updated_at = excluded.updated_at
                        """,
                        (row_uid, slug, summary, dow, slot_date, hour_slot, tz, summary, now_iso),
                    )

            self._conn.commit()
            refreshed = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE tutor_slug = ?",
                (slug,),
            ).fetchone()
            return self._calendar_row_to_dict(refreshed)

    def get_calendar_by_token(self, feed_token: str) -> dict[str, Any] | None:
        tok = (feed_token or "").strip()
        if not tok:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE feed_token = ?",
                (tok,),
            ).fetchone()
            if not row:
                return None
            return self._calendar_row_to_dict(row)

    def get_calendar_by_slug(self, tutor_slug: str) -> dict[str, Any] | None:
        slug = (tutor_slug or "").strip()
        if not slug:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM calendar_sync_tokens WHERE tutor_slug = ?",
                (slug,),
            ).fetchone()
            if not row:
                return None
            return self._calendar_row_to_dict(row)

    def _realtime_row_to_dict(self, row: sqlite3.Row) -> dict[str, Any]:
        try:
            payload = json.loads(row["payload"])
            if not isinstance(payload, dict):
                payload = {}
        except (json.JSONDecodeError, TypeError):
            payload = {}
        return {
            "id": int(row["id"]),
            "eventId": str(row["event_id"]),
            "channel": str(row["channel"]),
            "eventType": str(row["event_type"]),
            "title": str(row["title"]),
            "message": str(row["message"]),
            "tutorSlug": row["tutor_slug"],
            "payload": payload,
            "createdAt": str(row["created_at"]),
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
        payload_json = json.dumps(payload or {}, ensure_ascii=False)
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO realtime_notifications (
                    event_id, channel, tutor_slug, event_type, title, message, payload, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(event_id) DO NOTHING
                """,
                (eid, ch, slug, etype, ttl, msg, payload_json, now_iso),
            )
            self._conn.commit()
            row = self._conn.execute(
                "SELECT * FROM realtime_notifications WHERE event_id = ?",
                (eid,),
            ).fetchone()
            return self._realtime_row_to_dict(row)

    def get_realtime_event(self, event_row_id: int) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM realtime_notifications WHERE id = ?",
                (int(event_row_id),),
            ).fetchone()
            return self._realtime_row_to_dict(row) if row else None

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
            clauses.append("(channel = ? OR channel = 'all')")
            params.append(channel)
        if tutor_slug:
            clauses.append("(tutor_slug = ? OR event_type LIKE 'chat.%' OR event_type LIKE 'lesson.reminder.%')")
            params.append(tutor_slug)
        if since_id > 0:
            clauses.append("id > ?")
            params.append(int(since_id))
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._lock:
            if since_id > 0:
                rows = self._conn.execute(
                    f"SELECT * FROM realtime_notifications {where} ORDER BY id ASC LIMIT ?",
                    (*params, lim),
                ).fetchall()
                return [self._realtime_row_to_dict(r) for r in rows]
            rows = self._conn.execute(
                f"SELECT * FROM realtime_notifications {where} ORDER BY id DESC LIMIT ?",
                (*params, lim),
            ).fetchall()
            return [self._realtime_row_to_dict(r) for r in reversed(rows)]
