"""PostgreSQL 17 операции с диалогами и сообщениями мини-мессенджера (oltp.chat_messages)."""

from __future__ import annotations

from datetime import datetime, timezone
import re
from typing import Any
from urllib.parse import quote
import uuid

import psycopg

from databases.sqlite.store import StorageError

from .schema import _iso_utc


def _parse_iso_dt(raw: Any) -> datetime | None:
    if isinstance(raw, datetime):
        return raw.replace(tzinfo=timezone.utc) if raw.tzinfo is None else raw.astimezone(timezone.utc)
    s = str(raw or "").strip()
    if not s:
        return None
    try:
        iso = s[:-1] + "+00:00" if s.endswith(("Z", "z")) else s
        dt = datetime.fromisoformat(iso)
        return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    except (ValueError, TypeError, OverflowError):
        return None


def _ts_epoch_ms(raw: Any) -> float:
    if raw is None or isinstance(raw, bool):
        return 0.0
    if isinstance(raw, datetime):
        dt = raw if raw.tzinfo is not None else raw.replace(tzinfo=timezone.utc)
        return dt.timestamp() * 1000.0
    if isinstance(raw, (int, float)):
        num = float(raw)
        if not (num > 0):
            return 0.0
        return num * 1000.0 if len(str(int(num))) <= 10 else num
    s = str(raw).strip()
    if not s:
        return 0.0
    if re.fullmatch(r"\d{10,16}(?:\.\d+)?", s):
        num = float(s)
        int_part = s.split(".", 1)[0]
        return num * 1000.0 if len(int_part) <= 10 else num
    dt = _parse_iso_dt(s)
    return dt.timestamp() * 1000.0 if dt is not None else 0.0

_THREAD_ID_RE = re.compile(r"^[A-Za-z0-9:_.-]{1,160}$")
_DIRECT_TUTOR_THREAD_RE = re.compile(r"^tutor:([^:]+):u:(\d+)$")
_STATUS_MAP = {
    "offered": "pending",
    "pending": "pending",
    "countered": "countered",
    "accepted": "accepted",
    "completed": "completed",
    "declined": "declined",
    "cancelled": "cancelled",
    "refunded": "cancelled",
}


class PgChatMixin:
    @staticmethod
    def _pg_validate_thread_id(thread_id: str) -> str:
        clean = str(thread_id or "").strip()
        if not clean or not _THREAD_ID_RE.fullmatch(clean):
            raise StorageError("invalid_thread", "Некорректный идентификатор диалога.", 400)
        return clean

    @staticmethod
    def _pg_serialize_chat_attachment(row: dict[str, Any], thread_id: str) -> dict[str, Any]:
        aid = str(row["id"])
        ctype = str(row.get("content_type") or "application/octet-stream")
        fname = str(row.get("original_filename") or f"{aid}.bin")
        return {
            "id": aid,
            "filename": fname,
            "contentType": ctype,
            "sizeBytes": int(row.get("size_bytes") or 0),
            "isImage": ctype.startswith("image/"),
            "url": f"/api/chats/{quote(thread_id, safe='')}/files/{quote(aid, safe='')}",
        }

    @staticmethod
    def _pg_attachment_preview(attachments: list[dict[str, Any]]) -> str:
        if not attachments:
            return ""
        first = attachments[0]
        if first.get("isImage"):
            return "📷 Фото" if len(attachments) == 1 else f"📷 Фото ({len(attachments)})"
        return f"📎 {first.get('filename') or 'Файл'}"

    @staticmethod
    def _pg_serialize_chat_message(
        row: dict[str, Any],
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "threadId": str(row["thread_id"]),
            "bookingId": str(row["booking_id"]) if row.get("booking_id") else None,
            "tutorId": str(row.get("tutor_id") or ""),
            "studentUserId": int(row["student_user_id"]) if row.get("student_user_id") is not None else None,
            "tutorUserId": int(row["tutor_user_id"]) if row.get("tutor_user_id") is not None else None,
            "senderUserId": int(row["sender_user_id"]) if row.get("sender_user_id") is not None else None,
            "senderRole": str(row.get("sender_role") or "student"),
            "senderName": str(row.get("sender_name") or ""),
            "body": str(row.get("body") or ""),
            "attachments": list(attachments or []),
            "readByStudent": bool(row.get("read_by_student")),
            "readByTutor": bool(row.get("read_by_tutor")),
            "createdAt": _iso_utc(row.get("created_at")) or "",
        }

    def authorize_chat_thread(
        self,
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
        booking_id: str | None = None,
        tutor_id: str = "",
    ) -> dict[str, Any]:
        with self._pool.connection() as conn:
            return self._pg_authorize_chat_thread(
                conn,
                thread_id,
                user_id=user_id,
                role=role,
                booking_id=booking_id,
                tutor_id=tutor_id,
            )

    def _pg_chat_attachments_map(
        self,
        conn: psycopg.Connection[Any],
        thread_id: str,
        message_ids: list[str],
    ) -> dict[str, list[dict[str, Any]]]:
        if not message_ids:
            return {}
        rows = conn.execute(
            """
            SELECT cma.message_id, ma.id, ma.content_type, ma.size_bytes, ma.original_filename
            FROM oltp.chat_message_attachments cma
            JOIN oltp.media_assets ma ON ma.id = cma.asset_id
            WHERE cma.message_id = ANY(%s)
            ORDER BY cma.created_at ASC, cma.id ASC
            """,
            (message_ids,),
        ).fetchall()
        out: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            mid = str(r["message_id"])
            out.setdefault(mid, []).append(self._pg_serialize_chat_attachment(r, thread_id))
        return out

    def _pg_resolve_tutor_ids_for_user(self, conn: psycopg.Connection[Any], user_id: int) -> list[str]:
        rows = conn.execute(
            "SELECT id FROM oltp.tutors WHERE user_id = %s",
            (int(user_id),),
        ).fetchall()
        return [str(r["id"]) for r in rows if r.get("id")]

    def list_tutor_ids_for_user(self, user_id: int) -> list[str]:
        with self._pool.connection() as conn:
            with conn.transaction():
                return self._pg_resolve_tutor_ids_for_user(conn, int(user_id))

    def _pg_authorize_chat_thread(
        self,
        conn: psycopg.Connection[Any],
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
        booking_id: str | None = None,
        tutor_id: str = "",
    ) -> dict[str, Any]:
        clean_tid = self._pg_validate_thread_id(thread_id)
        uid = int(user_id)
        pref_role = "tutor" if str(role or "").strip().lower() == "tutor" else "student"
        owned_tutors = set(self._pg_resolve_tutor_ids_for_user(conn, uid))

        eff_booking_id = str(booking_id or "").strip()
        if not eff_booking_id and clean_tid.startswith("booking:"):
            eff_booking_id = clean_tid[len("booking:"):].strip()

        if eff_booking_id:
            row = conn.execute(
                """
                SELECT lr.*, t.user_id AS tutor_owner_id, t.full_name AS tutor_full_name
                FROM oltp.lesson_requests lr
                LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                WHERE lr.id = %s
                """,
                (eff_booking_id,),
            ).fetchone()
            if not row:
                raise StorageError("not_found", "Заявка для диалога не найдена.", 404)
            stu_uid = int(row["student_user_id"]) if row.get("student_user_id") is not None else None
            tut_uid = int(row["tutor_owner_id"]) if row.get("tutor_owner_id") is not None else None
            row_tut_id = str(row.get("tutor_id") or "")
            is_student = stu_uid == uid
            is_tutor = (tut_uid == uid) or (row_tut_id in owned_tutors)
            if not (is_student or is_tutor):
                raise StorageError("forbidden", "Нет доступа к этому диалогу.", 403)
            viewer_role = pref_role if (is_student and is_tutor) else ("tutor" if is_tutor else "student")
            return {
                "threadId": clean_tid,
                "bookingId": eff_booking_id,
                "tutorId": row_tut_id,
                "studentUserId": stu_uid,
                "tutorUserId": tut_uid,
                "viewerRole": viewer_role,
            }

        existing = conn.execute(
            """
            SELECT booking_id, tutor_id, student_user_id, tutor_user_id
            FROM oltp.chat_messages
            WHERE thread_id = %s
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (clean_tid,),
        ).fetchone()
        if existing:
            stu_uid = int(existing["student_user_id"]) if existing.get("student_user_id") is not None else None
            tut_uid = int(existing["tutor_user_id"]) if existing.get("tutor_user_id") is not None else None
            row_tut_id = str(existing.get("tutor_id") or tutor_id or "")
            if tut_uid is None and row_tut_id:
                trow = conn.execute("SELECT user_id FROM oltp.tutors WHERE id = %s", (row_tut_id,)).fetchone()
                if trow and trow.get("user_id") is not None:
                    tut_uid = int(trow["user_id"])
            is_student = stu_uid == uid
            is_tutor = (tut_uid == uid) or (row_tut_id in owned_tutors)
            if not (is_student or is_tutor):
                raise StorageError("forbidden", "Нет доступа к этому диалогу.", 403)
            viewer_role = pref_role if (is_student and is_tutor) else ("tutor" if is_tutor else "student")
            return {
                "threadId": clean_tid,
                "bookingId": str(existing["booking_id"]) if existing.get("booking_id") else None,
                "tutorId": row_tut_id,
                "studentUserId": stu_uid,
                "tutorUserId": tut_uid,
                "viewerRole": viewer_role,
            }

        m = _DIRECT_TUTOR_THREAD_RE.fullmatch(clean_tid)
        if m:
            dir_tid = str(m.group(1))
            dir_suid = int(m.group(2))
            trow = conn.execute("SELECT user_id FROM oltp.tutors WHERE id = %s", (dir_tid,)).fetchone()
            dir_tuid = int(trow["user_id"]) if (trow and trow.get("user_id") is not None) else None
            is_student = uid == dir_suid
            is_tutor = (dir_tuid == uid) or (dir_tid in owned_tutors)
            if not (is_student or is_tutor):
                raise StorageError("forbidden", "Нет доступа к этому диалогу.", 403)
            viewer_role = pref_role if (is_student and is_tutor) else ("tutor" if is_tutor else "student")
            return {
                "threadId": clean_tid,
                "bookingId": None,
                "tutorId": dir_tid,
                "studentUserId": dir_suid,
                "tutorUserId": dir_tuid,
                "viewerRole": viewer_role,
            }

        raise StorageError("forbidden", "Нет доступа к этому диалогу.", 403)

    def _pg_chat_thread_stats(
        self,
        conn: psycopg.Connection[Any],
        viewer_role: str,
        thread_ids: list[str],
    ) -> dict[str, dict[str, Any]]:
        if not thread_ids:
            return {}
        unread_col = "read_by_tutor" if viewer_role == "tutor" else "read_by_student"
        agg_rows = conn.execute(
            f"""
            SELECT thread_id,
                   COUNT(*) AS msg_count,
                   SUM(CASE WHEN NOT {unread_col} THEN 1 ELSE 0 END) AS unread_count,
                   MAX(created_at) AS last_at
            FROM oltp.chat_messages
            WHERE thread_id = ANY(%s)
            GROUP BY thread_id
            """,
            (thread_ids,),
        ).fetchall()
        stats: dict[str, dict[str, Any]] = {}
        for r in agg_rows:
            tid = str(r["thread_id"])
            last_row = conn.execute(
                """
                SELECT id, body, sender_role, read_by_student, read_by_tutor, created_at
                FROM oltp.chat_messages
                WHERE thread_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT 1
                """,
                (tid,),
            ).fetchone()
            last_text = str(last_row.get("body") or "") if last_row else ""
            if last_row and not last_text:
                att_map = self._pg_chat_attachments_map(conn, tid, [str(last_row["id"])])
                last_text = self._pg_attachment_preview(att_map.get(str(last_row["id"]), []))
            raw_dt = last_row.get("created_at") if last_row else r.get("last_at")
            last_msg_seq = int(raw_dt.timestamp() * 1_000_000) if isinstance(raw_dt, datetime) else 0
            stats[tid] = {
                "messageCount": int(r["msg_count"] or 0),
                "unreadCount": int(r["unread_count"] or 0),
                "lastMessage": last_text,
                "lastSenderRole": str(last_row.get("sender_role") or "") if last_row else "",
                "lastReadByStudent": bool(last_row.get("read_by_student")) if last_row else False,
                "lastReadByTutor": bool(last_row.get("read_by_tutor")) if last_row else False,
                "lastAt": _iso_utc(raw_dt) or "",
                "lastMsgSeq": last_msg_seq,
            }
        return stats

    def list_chat_threads(self, user_id: int, role: str = "student", limit: int = 50) -> list[dict[str, Any]]:
        uid = int(user_id)
        viewer_role = "tutor" if str(role or "").strip().lower() == "tutor" else "student"
        lim = max(1, min(100, int(limit or 50)))
        with self._pool.connection() as conn:
            with conn.transaction():
                owned_tutors = self._pg_resolve_tutor_ids_for_user(conn, uid)
                booking_rows: list[dict[str, Any]] = []
                if viewer_role == "tutor":
                    if owned_tutors:
                        booking_rows = conn.execute(
                            """
                            SELECT lr.*, t.full_name AS tutor_full_name,
                                   COALESCE(eh.status, 'none') AS escrow_status
                            FROM oltp.lesson_requests lr
                            LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                            LEFT JOIN LATERAL (
                                SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                            ) eh ON TRUE
                            LEFT JOIN (
                                SELECT thread_id, MAX(created_at) AS last_msg_at
                                FROM oltp.chat_messages
                                GROUP BY thread_id
                            ) cm_last ON cm_last.thread_id = ('booking:' || lr.id::text)
                            WHERE lr.tutor_id = ANY(%s) OR t.user_id = %s
                            ORDER BY (cm_last.last_msg_at IS NOT NULL) DESC,
                                     COALESCE(cm_last.last_msg_at, lr.updated_at, lr.created_at) DESC
                            LIMIT %s
                            """,
                            (owned_tutors, uid, lim),
                        ).fetchall()
                else:
                    booking_rows = conn.execute(
                        """
                        SELECT lr.*, t.full_name AS tutor_full_name,
                               COALESCE(eh.status, 'none') AS escrow_status
                        FROM oltp.lesson_requests lr
                        LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                        LEFT JOIN LATERAL (
                            SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                        ) eh ON TRUE
                        LEFT JOIN (
                            SELECT thread_id, MAX(created_at) AS last_msg_at
                            FROM oltp.chat_messages
                            GROUP BY thread_id
                        ) cm_last ON cm_last.thread_id = ('booking:' || lr.id::text)
                        WHERE lr.student_user_id = %s
                        ORDER BY (cm_last.last_msg_at IS NOT NULL) DESC,
                                 COALESCE(cm_last.last_msg_at, lr.updated_at, lr.created_at) DESC
                        LIMIT %s
                        """,
                        (uid, lim),
                    ).fetchall()

                threads_map: dict[str, dict[str, Any]] = {}
                for r in booking_rows:
                    bk_id = str(r["id"])
                    tid = f"booking:{bk_id}"
                    tut_name = str(r.get("tutor_full_name") or "Преподаватель").strip()
                    stu_name = str(r.get("student_name") or "Ученик").strip()
                    slot_date = str(r.get("slot_date") or "").strip()
                    day_part = str(r.get("day_label") or slot_date or "").strip()
                    hour_part = str(r.get("hour_slot") or "").strip()
                    slot_label = f"{day_part} · {hour_part}".strip(" ·")
                    price_rub = int(r.get("final_price_rub") or r.get("counter_price_rub") or r.get("offer_price_rub") or 0)
                    reserved_rub = int(r.get("reserved_rub") or 0)
                    esc_status = str(r.get("escrow_status") or ("frozen" if reserved_rub > 0 else "none"))
                    raw_dows = r.get("dows") or []
                    dows_list = [int(d) for d in raw_dows if str(d).isdigit() or isinstance(d, int)] if isinstance(raw_dows, list) else []
                    sched_plan = r.get("schedule_plan") if isinstance(r.get("schedule_plan"), dict) else None
                    st_norm = _STATUS_MAP.get(str(r.get("status") or "pending"), str(r.get("status") or "pending"))
                    note = str(r.get("note") or "")
                    threads_map[tid] = {
                        "threadId": tid,
                        "bookingId": bk_id,
                        "tutorId": str(r.get("tutor_id") or ""),
                        "counterpartName": stu_name if viewer_role == "tutor" else tut_name,
                        "subjectName": str(r.get("subject") or ""),
                        "priceRub": price_rub,
                        "slotLabel": slot_label,
                        "slotDate": slot_date,
                        "dayLabel": day_part,
                        "hour": hour_part,
                        "dows": dows_list,
                        "schedulePlan": sched_plan,
                        "escrowStatus": esc_status,
                        "reservedRub": reserved_rub,
                        "status": st_norm,
                        "telemostUrl": str(r.get("telemost_url") or ""),
                        "lastMessage": f"Запрос: {note}" if note else "",
                        "lastSenderRole": "student",
                        "lastReadByStudent": False,
                        "lastReadByTutor": False,
                        "lastAt": _iso_utc(r.get("updated_at") or r.get("created_at")) or "",
                        "lastMessageAt": "",
                        "lastMessageSeq": 0,
                        "unreadCount": 0,
                        "messageCount": 0,
                    }

                if viewer_role == "tutor":
                    extra_rows = conn.execute(
                        """
                        SELECT cm.thread_id,
                               MAX(cm.tutor_id) AS tutor_id,
                               MAX(cm.student_user_id) AS student_user_id,
                               MAX(t.full_name) AS tutor_full_name,
                               MAX(t.subject) AS tutor_subject,
                               MAX(u.display_name) AS stu_display_name,
                               MAX(u.username) AS stu_username,
                               MAX(cm.created_at) AS last_at
                        FROM oltp.chat_messages cm
                        LEFT JOIN oltp.tutors t ON t.id = cm.tutor_id
                        LEFT JOIN oltp.users u ON u.id = cm.student_user_id
                        WHERE cm.tutor_user_id = %s OR cm.tutor_id = ANY(%s)
                        GROUP BY cm.thread_id
                        ORDER BY last_at DESC
                        LIMIT %s
                        """,
                        (uid, owned_tutors, lim),
                    ).fetchall()
                else:
                    extra_rows = conn.execute(
                        """
                        SELECT cm.thread_id,
                               MAX(cm.tutor_id) AS tutor_id,
                               MAX(cm.student_user_id) AS student_user_id,
                               MAX(t.full_name) AS tutor_full_name,
                               MAX(t.subject) AS tutor_subject,
                               MAX(u.display_name) AS stu_display_name,
                               MAX(u.username) AS stu_username,
                               MAX(cm.created_at) AS last_at
                        FROM oltp.chat_messages cm
                        LEFT JOIN oltp.tutors t ON t.id = cm.tutor_id
                        LEFT JOIN oltp.users u ON u.id = cm.student_user_id
                        WHERE cm.student_user_id = %s
                        GROUP BY cm.thread_id
                        ORDER BY last_at DESC
                        LIMIT %s
                        """,
                        (uid, lim),
                    ).fetchall()

                for er in extra_rows:
                    tid = str(er["thread_id"])
                    if tid in threads_map:
                        continue
                    tut_name = str(er.get("tutor_full_name") or "Преподаватель").strip()
                    stu_name = str(er.get("stu_display_name") or er.get("stu_username") or "Ученик").strip()
                    threads_map[tid] = {
                        "threadId": tid,
                        "bookingId": None,
                        "tutorId": str(er.get("tutor_id") or ""),
                        "counterpartName": stu_name if viewer_role == "tutor" else tut_name,
                        "subjectName": str(er.get("tutor_subject") or "Занятие"),
                        "priceRub": 0,
                        "slotLabel": "",
                        "slotDate": "",
                        "dayLabel": "",
                        "hour": "",
                        "dows": [],
                        "schedulePlan": None,
                        "escrowStatus": "none",
                        "reservedRub": 0,
                        "status": "direct",
                        "telemostUrl": "",
                        "lastMessage": "",
                        "lastSenderRole": "",
                        "lastReadByStudent": False,
                        "lastReadByTutor": False,
                        "lastAt": _iso_utc(er.get("last_at")) or "",
                        "lastMessageAt": "",
                        "lastMessageSeq": 0,
                        "unreadCount": 0,
                        "messageCount": 0,
                    }

                stats = self._pg_chat_thread_stats(conn, viewer_role, list(threads_map.keys()))
                for tid, item in threads_map.items():
                    st = stats.get(tid)
                    if st:
                        item["messageCount"] = st["messageCount"]
                        item["unreadCount"] = st["unreadCount"]
                        item["lastMessage"] = st["lastMessage"]
                        item["lastSenderRole"] = st["lastSenderRole"]
                        if int(st.get("messageCount") or 0) > 0:
                            item["lastReadByStudent"] = bool(st.get("lastReadByStudent"))
                            item["lastReadByTutor"] = bool(st.get("lastReadByTutor"))
                            if st["lastAt"]:
                                item["lastMessageAt"] = st["lastAt"]
                                item["lastAt"] = st["lastAt"]
                            item["lastMessageSeq"] = int(st.get("lastMsgSeq") or 0)

                ordered = sorted(
                    threads_map.values(),
                    key=lambda x: (
                        1 if (int(x.get("messageCount") or 0) > 0 and x.get("lastMessageAt")) else 0,
                        _ts_epoch_ms(x.get("lastMessageAt")) if int(x.get("messageCount") or 0) > 0 else 0.0,
                        int(x.get("lastMessageSeq") or 0) if int(x.get("messageCount") or 0) > 0 else 0,
                        _ts_epoch_ms(x.get("lastAt")),
                    ),
                    reverse=True,
                )
                return ordered[:lim]

    def list_chat_messages(
        self,
        thread_id: str,
        user_id: int,
        role: str = "student",
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(300, int(limit or 100)))
        with self._pool.connection() as conn:
            with conn.transaction():
                auth_info = self._pg_authorize_chat_thread(conn, thread_id, user_id=user_id, role=role)
                rows = conn.execute(
                    """
                    SELECT *
                    FROM oltp.chat_messages
                    WHERE thread_id = %s
                    ORDER BY created_at ASC, id ASC
                    LIMIT %s
                    """,
                    (auth_info["threadId"], lim),
                ).fetchall()
                att_map = self._pg_chat_attachments_map(conn, auth_info["threadId"], [str(r["id"]) for r in rows])
                return [self._pg_serialize_chat_message(r, att_map.get(str(r["id"]))) for r in rows]

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
        clean_body = str(body or "").strip()
        clean_assets = [str(aid).strip() for aid in (asset_ids or []) if str(aid).strip()]
        if not clean_body and not clean_assets:
            raise StorageError("empty_message", "Введите текст сообщения или прикрепите файл.", 400)
        if len(clean_body) > 2000:
            clean_body = clean_body[:2000]
        uid = int(sender_user_id)
        mid = str(msg_id or f"cm-{uuid.uuid4().hex[:14]}")

        with self._pool.connection() as conn:
            with conn.transaction():
                auth_info = self._pg_authorize_chat_thread(
                    conn,
                    thread_id,
                    user_id=uid,
                    role=sender_role,
                    booking_id=booking_id,
                    tutor_id=tutor_id,
                )
                eff_role = auth_info["viewerRole"]
                read_stu = eff_role == "student"
                read_tut = eff_role == "tutor"
                clean_sender_name = str(sender_name or "").strip()[:120]
                if not clean_sender_name:
                    urow = conn.execute(
                        "SELECT display_name, username FROM oltp.users WHERE id = %s",
                        (uid,),
                    ).fetchone()
                    clean_sender_name = (
                        str(urow.get("display_name") or urow.get("username") or "").strip()[:120]
                        if urow
                        else ("Преподаватель" if eff_role == "tutor" else "Ученик")
                    )

                row = conn.execute(
                    """
                    INSERT INTO oltp.chat_messages (
                        id, thread_id, booking_id, tutor_id, student_user_id, tutor_user_id,
                        sender_user_id, sender_role, sender_name, body,
                        read_by_student, read_by_tutor
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                    RETURNING *
                    """,
                    (
                        mid,
                        auth_info["threadId"],
                        auth_info["bookingId"],
                        auth_info["tutorId"] or "",
                        auth_info["studentUserId"],
                        auth_info["tutorUserId"],
                        uid,
                        eff_role,
                        clean_sender_name,
                        clean_body,
                        read_stu,
                        read_tut,
                    ),
                ).fetchone()
                if not row:
                    row = conn.execute("SELECT * FROM oltp.chat_messages WHERE id = %s", (mid,)).fetchone()
                for aid in clean_assets:
                    cma_id = f"cma-{uuid.uuid4().hex[:14]}"
                    conn.execute(
                        """
                        INSERT INTO oltp.chat_message_attachments (id, message_id, asset_id)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (id) DO NOTHING
                        """,
                        (cma_id, mid, aid),
                    )
                att_map = self._pg_chat_attachments_map(conn, auth_info["threadId"], [mid])
                return self._pg_serialize_chat_message(row, att_map.get(mid))

    def get_chat_attachment_asset(
        self,
        thread_id: str,
        asset_id: str,
        *,
        user_id: int,
        role: str = "student",
    ) -> dict[str, Any] | None:
        clean_aid = str(asset_id or "").strip()
        if not clean_aid:
            return None
        with self._pool.connection() as conn:
            with conn.transaction():
                auth_info = self._pg_authorize_chat_thread(conn, thread_id, user_id=user_id, role=role)
                row = conn.execute(
                    """
                    SELECT ma.*
                    FROM oltp.chat_message_attachments cma
                    JOIN oltp.chat_messages cm ON cm.id = cma.message_id
                    JOIN oltp.media_assets ma ON ma.id = cma.asset_id
                    WHERE cm.thread_id = %s AND cma.asset_id = %s
                    LIMIT 1
                    """,
                    (auth_info["threadId"], clean_aid),
                ).fetchone()
                if not row:
                    return None
                return {
                    "id": str(row["id"]),
                    "userId": row.get("user_id"),
                    "kind": str(row["kind"]),
                    "storageDriver": str(row["storage_driver"]),
                    "bucket": str(row["bucket"]),
                    "objectKey": str(row["object_key"]),
                    "contentType": str(row["content_type"]),
                    "sizeBytes": int(row["size_bytes"] or 0),
                    "sha256": str(row.get("sha256") or ""),
                    "originalFilename": str(row.get("original_filename") or ""),
                    "publicUrl": row.get("public_url"),
                }

    def get_chat_thread_notification_target(
        self,
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
    ) -> dict[str, Any]:
        with self._pool.connection() as conn:
            with conn.transaction():
                auth_info = self._pg_authorize_chat_thread(conn, thread_id, user_id=user_id, role=role)
                bk_id = auth_info.get("bookingId")
                tut_id = str(auth_info.get("tutorId") or "").strip()
                stu_uid = auth_info.get("studentUserId")

                tut_name = "Преподаватель"
                tut_wa = ""
                stu_wa = ""
                tut_uid_resolved = auth_info.get("tutorUserId")

                if bk_id:
                    brow = conn.execute(
                        """
                        SELECT lr.tutor_id, lr.student_name, lr.subject,
                               lr.day_label, lr.slot_date, lr.hour_slot, lr.telemost_url,
                               lr.offer_price_rub, lr.counter_price_rub, lr.final_price_rub,
                               lr.reserved_rub, lr.status AS booking_status,
                               COALESCE(eh.status, 'none') AS escrow_status,
                               t.full_name AS t_full_name, t.user_id AS t_user_id,
                               t.whatsapp_phone, t.telegram_handle
                        FROM oltp.lesson_requests lr
                        LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                        LEFT JOIN LATERAL (
                            SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                        ) eh ON TRUE
                        WHERE lr.id = %s
                        """,
                        (bk_id,),
                    ).fetchone()
                    if brow:
                        tut_id = tut_id or str(brow.get("tutor_id") or "")
                        if tut_uid_resolved is None and brow.get("t_user_id") is not None:
                            tut_uid_resolved = int(brow["t_user_id"])
                        tut_name = str(brow.get("t_full_name") or tut_name).strip()
                        tut_wa = str(brow.get("whatsapp_phone") or "").strip()
                        tut_tg = str(brow.get("telegram_handle") or "").strip()
                        stu_name = str(brow.get("student_name") or stu_name).strip()
                        subj_name = str(brow.get("subject") or subj_name).strip()
                        day_part = str(brow.get("day_label") or brow.get("slot_date") or "").strip()
                        hour_part = str(brow.get("hour_slot") or "").strip()
                        slot_label = f"{day_part} · {hour_part}".strip(" ·")
                        telemost_url = str(brow.get("telemost_url") or "").strip()
                        price_rub = int(brow.get("final_price_rub") or brow.get("counter_price_rub") or brow.get("offer_price_rub") or 0)
                        reserved_rub = int(brow.get("reserved_rub") or 0)
                        escrow_status = str(brow.get("escrow_status") or ("frozen" if reserved_rub > 0 else "none"))
                        raw_bk_st = str(brow.get("booking_status") or "")
                        booking_status = _STATUS_MAP.get(raw_bk_st, raw_bk_st)
                elif tut_id:
                    trow = conn.execute(
                        "SELECT user_id, full_name, subject, whatsapp_phone, telegram_handle FROM oltp.tutors WHERE id = %s",
                        (tut_id,),
                    ).fetchone()
                    if trow:
                        if tut_uid_resolved is None and trow.get("user_id") is not None:
                            tut_uid_resolved = int(trow["user_id"])
                        tut_name = str(trow.get("full_name") or tut_name).strip()
                        subj_name = str(trow.get("subject") or subj_name).strip()
                        tut_wa = str(trow.get("whatsapp_phone") or "").strip()
                        tut_tg = str(trow.get("telegram_handle") or "").strip()

                if not tut_wa and tut_uid_resolved is not None:
                    tut_wa = self._pg_resolve_user_phone(conn, int(tut_uid_resolved))

                if stu_uid is not None:
                    stu_wa = self._pg_resolve_user_phone(conn, int(stu_uid))
                    if stu_name in ("", "Ученик"):
                        urow = conn.execute(
                            "SELECT display_name, username FROM oltp.users WHERE id = %s",
                            (int(stu_uid),),
                        ).fetchone()
                        if urow:
                            stu_name = str(urow.get("display_name") or urow.get("username") or stu_name).strip()

                return {
                    "threadId": auth_info["threadId"],
                    "bookingId": bk_id,
                    "tutorId": tut_id,
                    "studentUserId": int(stu_uid) if stu_uid is not None else None,
                    "tutorUserId": int(tut_uid_resolved) if tut_uid_resolved is not None else None,
                    "tutorName": tut_name,
                    "tutorWhatsappPhone": tut_wa,
                    "tutorTelegramHandle": tut_tg,
                    "studentWhatsappPhone": stu_wa,
                    "studentName": stu_name,
                    "subjectName": subj_name,
                    "slotLabel": slot_label,
                    "telemostUrl": telemost_url,
                    "priceRub": price_rub,
                    "reservedRub": reserved_rub,
                    "escrowStatus": escrow_status,
                    "bookingStatus": booking_status,
                    "viewerRole": auth_info["viewerRole"],
                }

    def _pg_resolve_user_phone(self, conn: psycopg.Connection[Any], user_id: int | None) -> str:
        if user_id is None:
            return ""
        uid = int(user_id)
        ui_row = conn.execute(
            "SELECT provider_subject FROM oltp.user_identities WHERE user_id = %s AND provider = 'phone' LIMIT 1",
            (uid,),
        ).fetchone()
        if ui_row and str(ui_row.get("provider_subject") or "").strip():
            return str(ui_row.get("provider_subject") or "").strip()
        urow = conn.execute("SELECT phone FROM oltp.users WHERE id = %s", (uid,)).fetchone()
        return str(urow.get("phone") or "").strip() if urow else ""

    def mark_chat_read(self, thread_id: str, *, user_id: int, role: str = "student") -> int:
        with self._pool.connection() as conn:
            with conn.transaction():
                auth_info = self._pg_authorize_chat_thread(conn, thread_id, user_id=user_id, role=role)
                if auth_info["viewerRole"] == "tutor":
                    cur = conn.execute(
                        "UPDATE oltp.chat_messages SET read_by_tutor = TRUE WHERE thread_id = %s AND NOT read_by_tutor",
                        (auth_info["threadId"],),
                    )
                else:
                    cur = conn.execute(
                        "UPDATE oltp.chat_messages SET read_by_student = TRUE WHERE thread_id = %s AND NOT read_by_student",
                        (auth_info["threadId"],),
                    )
                return int(cur.rowcount or 0)

    def list_unanswered_chat_threads(
        self,
        *,
        older_than_iso: str,
        max_age_iso: str,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        older_dt = _parse_iso_dt(older_than_iso)
        max_age_dt = _parse_iso_dt(max_age_iso)
        if older_dt is None or max_age_dt is None:
            return []
        lim = max(1, min(500, int(limit or 200)))

        with self._pool.connection() as conn:
            with conn.transaction():
                cand_rows = conn.execute(
                    """
                    WITH latest_per_thread AS (
                        SELECT id, thread_id, sender_role, read_by_student, read_by_tutor, created_at,
                               ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC, id DESC) AS rn
                        FROM oltp.chat_messages
                        WHERE sender_role IN ('student', 'tutor')
                    )
                    SELECT l.thread_id
                    FROM latest_per_thread l
                    WHERE l.rn = 1
                      AND l.created_at >= %s::timestamptz
                      AND (
                        (l.sender_role = 'student' AND NOT l.read_by_tutor)
                        OR (l.sender_role = 'tutor' AND NOT l.read_by_student)
                      )
                      AND NOT EXISTS (
                        SELECT 1 FROM oltp.chat_unanswered_notifications n
                        WHERE n.thread_id = l.thread_id
                          AND n.latest_message_id = l.id
                          AND n.recipient_role = CASE WHEN l.sender_role = 'student' THEN 'tutor' ELSE 'student' END
                      )
                    ORDER BY l.created_at ASC
                    LIMIT %s
                    """,
                    (max_age_dt, max(lim * 2, 200)),
                ).fetchall()

                results: list[dict[str, Any]] = []
                for cr in cand_rows:
                    if len(results) >= lim:
                        break
                    tid = str(cr.get("thread_id") or "")
                    if not tid:
                        continue
                    rows = conn.execute(
                        """
                        SELECT *
                        FROM oltp.chat_messages
                        WHERE thread_id = %s AND sender_role IN ('student', 'tutor')
                        ORDER BY created_at ASC, id ASC
                        """,
                        (tid,),
                    ).fetchall()
                    if not rows:
                        continue
                    latest = rows[-1]
                    sender_role = str(latest.get("sender_role") or "")
                    recipient_role = "tutor" if sender_role == "student" else "student"
                    read_col = "read_by_tutor" if recipient_role == "tutor" else "read_by_student"
                    if bool(latest.get(read_col)):
                        continue

                    streak: list[dict[str, Any]] = []
                    for r in reversed(rows):
                        if str(r.get("sender_role") or "") != sender_role or bool(r.get(read_col)):
                            break
                        streak.append(r)
                    if not streak:
                        continue
                    anchor = streak[-1]
                    anchor_dt = _parse_iso_dt(anchor.get("created_at"))
                    if anchor_dt is None or anchor_dt < max_age_dt or anchor_dt > older_dt:
                        continue

                    anchor_id = str(anchor["id"])
                    latest_id = str(latest["id"])
                    dup = conn.execute(
                        """
                        SELECT 1 FROM oltp.chat_unanswered_notifications
                        WHERE thread_id = %s AND anchor_message_id = %s AND recipient_role = %s
                        LIMIT 1
                        """,
                        (tid, anchor_id, recipient_role),
                    ).fetchone()
                    if dup:
                        continue

                    preview = str(latest.get("body") or "").strip()[:240]
                    if not preview:
                        att_map = self._pg_chat_attachments_map(conn, tid, [latest_id])
                        atts = att_map.get(latest_id) or []
                        if atts:
                            preview = "📷 Фото" if any(a.get("isImage") for a in atts) else self._pg_attachment_preview(atts)[:240]

                    bk_id = str(latest.get("booking_id") or "").strip() or (
                        tid[len("booking:"):].strip() if tid.startswith("booking:") else None
                    )
                    tut_id = str(latest.get("tutor_id") or "").strip()
                    stu_uid = int(latest["student_user_id"]) if latest.get("student_user_id") is not None else None
                    tut_uid = int(latest["tutor_user_id"]) if latest.get("tutor_user_id") is not None else None
                    tut_name = "Преподаватель"
                    stu_name = "Ученик"
                    subj_name = "Занятие"
                    tut_wa = ""

                    if bk_id:
                        brow = conn.execute(
                            """
                            SELECT lr.tutor_id, lr.student_name, lr.student_user_id, lr.subject,
                                   t.full_name AS t_full_name, t.user_id AS t_user_id, t.whatsapp_phone
                            FROM oltp.lesson_requests lr
                            LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                            WHERE lr.id = %s
                            """,
                            (bk_id,),
                        ).fetchone()
                        if brow:
                            tut_id = tut_id or str(brow.get("tutor_id") or "")
                            if stu_uid is None and brow.get("student_user_id") is not None:
                                stu_uid = int(brow["student_user_id"])
                            if tut_uid is None and brow.get("t_user_id") is not None:
                                tut_uid = int(brow["t_user_id"])
                            tut_name = str(brow.get("t_full_name") or tut_name).strip()
                            stu_name = str(brow.get("student_name") or stu_name).strip()
                            subj_name = str(brow.get("subject") or subj_name).strip()
                            tut_wa = str(brow.get("whatsapp_phone") or "").strip()

                    if tut_id and (not tut_wa or tut_uid is None or tut_name == "Преподаватель"):
                        trow = conn.execute(
                            "SELECT user_id, full_name, subject, whatsapp_phone FROM oltp.tutors WHERE id = %s",
                            (tut_id,),
                        ).fetchone()
                        if trow:
                            if tut_uid is None and trow.get("user_id") is not None:
                                tut_uid = int(trow["user_id"])
                            if tut_name == "Преподаватель":
                                tut_name = str(trow.get("full_name") or tut_name).strip()
                            if subj_name == "Занятие":
                                subj_name = str(trow.get("subject") or subj_name).strip()
                            if not tut_wa:
                                tut_wa = str(trow.get("whatsapp_phone") or "").strip()
                    elif not tut_id and tut_uid is not None:
                        trow = conn.execute(
                            "SELECT id, full_name, subject, whatsapp_phone FROM oltp.tutors WHERE user_id = %s LIMIT 1",
                            (tut_uid,),
                        ).fetchone()
                        if trow:
                            tut_id = str(trow.get("id") or "").strip()
                            if tut_name == "Преподаватель":
                                tut_name = str(trow.get("full_name") or tut_name).strip()
                            if subj_name == "Занятие":
                                subj_name = str(trow.get("subject") or subj_name).strip()
                            if not tut_wa:
                                tut_wa = str(trow.get("whatsapp_phone") or "").strip()

                    if stu_uid is not None and stu_name in ("", "Ученик"):
                        urow = conn.execute(
                            "SELECT display_name, username FROM oltp.users WHERE id = %s",
                            (stu_uid,),
                        ).fetchone()
                        if urow:
                            stu_name = str(urow.get("display_name") or urow.get("username") or stu_name).strip()

                    latest_sender = str(latest.get("sender_name") or "").strip()
                    if sender_role == "student":
                        sender_name = stu_name if stu_name not in ("", "Ученик") else (latest_sender or "Ученик")
                        recipient_name = tut_name
                        recipient_phone = tut_wa or self._pg_resolve_user_phone(conn, tut_uid)
                    else:
                        sender_name = tut_name if tut_name not in ("", "Преподаватель") else (latest_sender or "Преподаватель")
                        recipient_name = stu_name
                        recipient_phone = self._pg_resolve_user_phone(conn, stu_uid)

                    results.append(
                        {
                            "threadId": tid,
                            "anchorMessageId": anchor_id,
                            "latestMessageId": latest_id,
                            "firstUnreadAt": _iso_utc(anchor.get("created_at")) or "",
                            "latestMessageAt": _iso_utc(latest.get("created_at")) or "",
                            "unreadCount": len(streak),
                            "senderRole": sender_role,
                            "recipientRole": recipient_role,
                            "senderName": sender_name,
                            "recipientName": recipient_name,
                            "bookingId": bk_id,
                            "tutorId": tut_id,
                            "tutorUserId": tut_uid,
                            "studentUserId": stu_uid,
                            "subjectName": subj_name,
                            "preview": preview,
                            "recipientPhone": recipient_phone,
                        }
                    )
                return results

    def mark_chat_unanswered_notified(
        self,
        thread_id: str,
        anchor_message_id: str,
        recipient_role: str,
        *,
        latest_message_id: str = "",
        channels: list[str] | tuple[str, ...] = (),
    ) -> bool:
        tid = str(thread_id or "").strip()
        aid = str(anchor_message_id or "").strip()
        role_norm = "tutor" if str(recipient_role or "").strip().lower() == "tutor" else "student"
        if not tid or not aid:
            return False
        ch_str = ",".join(
            sorted({str(c or "").strip().lower() for c in channels if str(c or "").strip()})
        )
        with self._pool.connection() as conn:
            with conn.transaction():
                cur = conn.execute(
                    """
                    INSERT INTO oltp.chat_unanswered_notifications (
                        thread_id, anchor_message_id, recipient_role, latest_message_id, channels
                    ) VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (thread_id, anchor_message_id, recipient_role) DO NOTHING
                    """,
                    (tid, aid, role_norm, str(latest_message_id or ""), ch_str),
                )
                return bool(cur.rowcount and cur.rowcount > 0)
