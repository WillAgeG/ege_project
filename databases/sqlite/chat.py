"""Операции SQLite с диалогами и сообщениями мини-мессенджера (chat_messages)."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import re
from typing import Any
from urllib.parse import quote
import uuid

from .common import StorageError, _iso_utc_now


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


class SqliteChatMixin:
    @staticmethod
    def _validate_thread_id(thread_id: str) -> str:
        clean = str(thread_id or "").strip()
        if not clean or not _THREAD_ID_RE.fullmatch(clean):
            raise StorageError("invalid_thread", "Некорректный идентификатор диалога.", 400)
        return clean

    @staticmethod
    def _serialize_chat_attachment(row: Any, thread_id: str) -> dict[str, Any]:
        aid = str(row["id"])
        ctype = str(row["content_type"] or "application/octet-stream")
        fname = str(row["original_filename"] or f"{aid}.bin")
        return {
            "id": aid,
            "filename": fname,
            "contentType": ctype,
            "sizeBytes": int(row["size_bytes"] or 0),
            "isImage": ctype.startswith("image/"),
            "url": f"/api/chats/{quote(thread_id, safe='')}/files/{quote(aid, safe='')}",
        }

    @staticmethod
    def _attachment_preview(attachments: list[dict[str, Any]]) -> str:
        if not attachments:
            return ""
        first = attachments[0]
        if first.get("isImage"):
            return "📷 Фото" if len(attachments) == 1 else f"📷 Фото ({len(attachments)})"
        return f"📎 {first.get('filename') or 'Файл'}"

    @staticmethod
    def _serialize_chat_message(
        row: Any,
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "threadId": str(row["thread_id"]),
            "bookingId": str(row["booking_id"]) if row["booking_id"] else None,
            "tutorId": str(row["tutor_id"] or ""),
            "studentUserId": int(row["student_user_id"]) if row["student_user_id"] is not None else None,
            "tutorUserId": int(row["tutor_user_id"]) if row["tutor_user_id"] is not None else None,
            "senderUserId": int(row["sender_user_id"]) if row["sender_user_id"] is not None else None,
            "senderRole": str(row["sender_role"] or "student"),
            "senderName": str(row["sender_name"] or ""),
            "body": str(row["body"] or ""),
            "attachments": list(attachments or []),
            "readByStudent": bool(row["read_by_student"]),
            "readByTutor": bool(row["read_by_tutor"]),
            "createdAt": str(row["created_at"] or ""),
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
        with self._lock:
            return self._authorize_chat_thread(
                thread_id,
                user_id=user_id,
                role=role,
                booking_id=booking_id,
                tutor_id=tutor_id,
            )

    def _chat_attachments_map(self, thread_id: str, message_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        if not message_ids:
            return {}
        placeholders = ",".join("?" for _ in message_ids)
        rows = self._conn.execute(
            f"""
            SELECT cma.message_id, ma.id, ma.content_type, ma.size_bytes, ma.original_filename
            FROM chat_message_attachments cma
            JOIN media_assets ma ON ma.id = cma.asset_id
            WHERE cma.message_id IN ({placeholders})
            ORDER BY cma.rowid ASC
            """,
            message_ids,
        ).fetchall()
        out: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            mid = str(r["message_id"])
            out.setdefault(mid, []).append(self._serialize_chat_attachment(r, thread_id))
        return out

    def _resolve_tutor_ids_for_user(self, user_id: int) -> list[str]:
        rows = self._conn.execute(
            "SELECT id FROM admin_tutors WHERE user_id = ?",
            (int(user_id),),
        ).fetchall()
        return [str(r["id"]) for r in rows if r["id"]]

    def list_tutor_ids_for_user(self, user_id: int) -> list[str]:
        with self._lock:
            return self._resolve_tutor_ids_for_user(int(user_id))

    def _authorize_chat_thread(
        self,
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
        booking_id: str | None = None,
        tutor_id: str = "",
    ) -> dict[str, Any]:
        clean_tid = self._validate_thread_id(thread_id)
        uid = int(user_id)
        pref_role = "tutor" if str(role or "").strip().lower() == "tutor" else "student"
        owned_tutors = set(self._resolve_tutor_ids_for_user(uid))

        eff_booking_id = str(booking_id or "").strip()
        if not eff_booking_id and clean_tid.startswith("booking:"):
            eff_booking_id = clean_tid[len("booking:"):].strip()

        if eff_booking_id:
            row = self._conn.execute(
                """
                SELECT lr.*, t.user_id AS tutor_owner_id, t.full_name AS tutor_full_name
                FROM admin_lesson_requests lr
                LEFT JOIN admin_tutors t ON t.id = lr.tutor_id
                WHERE lr.id = ?
                """,
                (eff_booking_id,),
            ).fetchone()
            if not row:
                raise StorageError("not_found", "Заявка для диалога не найдена.", 404)
            stu_uid = int(row["student_user_id"]) if row["student_user_id"] is not None else None
            tut_uid = int(row["tutor_owner_id"]) if row["tutor_owner_id"] is not None else None
            row_tut_id = str(row["tutor_id"] or "")
            is_student = stu_uid == uid
            is_tutor = (tut_uid == uid) or (row_tut_id in owned_tutors)
            if not (is_student or is_tutor):
                raise StorageError("forbidden", "Нет доступа к этому диалогу.", 403)
            if is_student and is_tutor:
                viewer_role = pref_role
            else:
                viewer_role = "tutor" if is_tutor else "student"
            return {
                "threadId": clean_tid,
                "bookingId": eff_booking_id,
                "tutorId": row_tut_id,
                "studentUserId": stu_uid,
                "tutorUserId": tut_uid,
                "viewerRole": viewer_role,
            }

        existing = self._conn.execute(
            """
            SELECT booking_id, tutor_id, student_user_id, tutor_user_id
            FROM chat_messages
            WHERE thread_id = ?
            ORDER BY created_at ASC
            LIMIT 1
            """,
            (clean_tid,),
        ).fetchone()
        if existing:
            stu_uid = int(existing["student_user_id"]) if existing["student_user_id"] is not None else None
            tut_uid = int(existing["tutor_user_id"]) if existing["tutor_user_id"] is not None else None
            row_tut_id = str(existing["tutor_id"] or tutor_id or "")
            if tut_uid is None and row_tut_id:
                trow = self._conn.execute("SELECT user_id FROM admin_tutors WHERE id = ?", (row_tut_id,)).fetchone()
                if trow and trow["user_id"] is not None:
                    tut_uid = int(trow["user_id"])
            is_student = stu_uid == uid
            is_tutor = (tut_uid == uid) or (row_tut_id in owned_tutors)
            if not (is_student or is_tutor):
                raise StorageError("forbidden", "Нет доступа к этому диалогу.", 403)
            viewer_role = pref_role if (is_student and is_tutor) else ("tutor" if is_tutor else "student")
            return {
                "threadId": clean_tid,
                "bookingId": str(existing["booking_id"]) if existing["booking_id"] else None,
                "tutorId": row_tut_id,
                "studentUserId": stu_uid,
                "tutorUserId": tut_uid,
                "viewerRole": viewer_role,
            }

        m = _DIRECT_TUTOR_THREAD_RE.fullmatch(clean_tid)
        if m:
            dir_tid = str(m.group(1))
            dir_suid = int(m.group(2))
            trow = self._conn.execute("SELECT user_id FROM admin_tutors WHERE id = ?", (dir_tid,)).fetchone()
            dir_tuid = int(trow["user_id"]) if (trow and trow["user_id"] is not None) else None
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

    def _chat_thread_stats(self, viewer_role: str, thread_ids: list[str]) -> dict[str, dict[str, Any]]:
        if not thread_ids:
            return {}
        placeholders = ",".join("?" for _ in thread_ids)
        unread_col = "read_by_tutor" if viewer_role == "tutor" else "read_by_student"
        agg_rows = self._conn.execute(
            f"""
            SELECT thread_id,
                   COUNT(*) AS msg_count,
                   SUM(CASE WHEN {unread_col} = 0 THEN 1 ELSE 0 END) AS unread_count,
                   MAX(created_at) AS last_at
            FROM chat_messages
            WHERE thread_id IN ({placeholders})
            GROUP BY thread_id
            """,
            thread_ids,
        ).fetchall()
        stats: dict[str, dict[str, Any]] = {}
        for r in agg_rows:
            tid = str(r["thread_id"])
            last_row = self._conn.execute(
                """
                SELECT id, body, sender_role, read_by_student, read_by_tutor, created_at, rowid
                FROM chat_messages
                WHERE thread_id = ?
                ORDER BY created_at DESC, rowid DESC
                LIMIT 1
                """,
                (tid,),
            ).fetchone()
            last_text = str(last_row["body"] or "") if last_row else ""
            if last_row and not last_text:
                att_map = self._chat_attachments_map(tid, [str(last_row["id"])])
                last_text = self._attachment_preview(att_map.get(str(last_row["id"]), []))
            stats[tid] = {
                "messageCount": int(r["msg_count"] or 0),
                "unreadCount": int(r["unread_count"] or 0),
                "lastMessage": last_text,
                "lastSenderRole": str(last_row["sender_role"] or "") if last_row else "",
                "lastReadByStudent": bool(last_row["read_by_student"]) if last_row else False,
                "lastReadByTutor": bool(last_row["read_by_tutor"]) if last_row else False,
                "lastAt": str((last_row["created_at"] if last_row else r["last_at"]) or ""),
                "lastMsgSeq": int(last_row["rowid"] or 0) if last_row else 0,
            }
        return stats

    def list_chat_threads(self, user_id: int, role: str = "student", limit: int = 50) -> list[dict[str, Any]]:
        uid = int(user_id)
        viewer_role = "tutor" if str(role or "").strip().lower() == "tutor" else "student"
        lim = max(1, min(100, int(limit or 50)))
        with self._lock:
            owned_tutors = self._resolve_tutor_ids_for_user(uid)
            booking_rows: list[Any] = []
            if viewer_role == "tutor":
                if owned_tutors:
                    placeholders = ",".join("?" for _ in owned_tutors)
                    booking_rows = self._conn.execute(
                        f"""
                        SELECT lr.*, t.full_name AS tutor_full_name
                        FROM admin_lesson_requests lr
                        LEFT JOIN admin_tutors t ON t.id = lr.tutor_id
                        LEFT JOIN (
                            SELECT thread_id, MAX(created_at) AS last_msg_at, MAX(rowid) AS last_msg_rowid
                            FROM chat_messages
                            GROUP BY thread_id
                        ) cm_last ON cm_last.thread_id = ('booking:' || lr.id)
                        WHERE lr.tutor_id IN ({placeholders}) OR t.user_id = ?
                        ORDER BY (cm_last.last_msg_at IS NOT NULL) DESC,
                                 COALESCE(cm_last.last_msg_at, lr.updated_at, lr.created_at) DESC,
                                 COALESCE(cm_last.last_msg_rowid, 0) DESC
                        LIMIT ?
                        """,
                        [*owned_tutors, uid, lim],
                    ).fetchall()
            else:
                booking_rows = self._conn.execute(
                    """
                    SELECT lr.*, t.full_name AS tutor_full_name
                    FROM admin_lesson_requests lr
                    LEFT JOIN admin_tutors t ON t.id = lr.tutor_id
                    LEFT JOIN (
                        SELECT thread_id, MAX(created_at) AS last_msg_at, MAX(rowid) AS last_msg_rowid
                        FROM chat_messages
                        GROUP BY thread_id
                    ) cm_last ON cm_last.thread_id = ('booking:' || lr.id)
                    WHERE lr.student_user_id = ?
                    ORDER BY (cm_last.last_msg_at IS NOT NULL) DESC,
                             COALESCE(cm_last.last_msg_at, lr.updated_at, lr.created_at) DESC,
                             COALESCE(cm_last.last_msg_rowid, 0) DESC
                    LIMIT ?
                    """,
                    (uid, lim),
                ).fetchall()

            threads_map: dict[str, dict[str, Any]] = {}
            for r in booking_rows:
                bk_id = str(r["id"])
                tid = f"booking:{bk_id}"
                tut_name = str(r["tutor_full_name"] or r["tutor_name"] or "Преподаватель").strip()
                stu_name = str(r["student_name"] or "Ученик").strip()
                day_part = str(r["day_label"] or r["slot_date"] or "").strip()
                hour_part = str(r["hour_slot"] or "").strip()
                slot_label = f"{day_part} · {hour_part}".strip(" ·")
                price_rub = int(r["final_price_rub"] or r["counter_price_rub"] or r["offer_price_rub"] or 0)
                st_norm = _STATUS_MAP.get(str(r["status"] or "pending"), str(r["status"] or "pending"))
                raw_dows = r["dows_json"] if "dows_json" in r.keys() else "[]"
                try:
                    parsed_dows = json.loads(raw_dows) if isinstance(raw_dows, str) else list(raw_dows or [])
                except Exception:
                    parsed_dows = []
                dows_list = [int(d) for d in parsed_dows if str(d).isdigit() or isinstance(d, int)]
                raw_plan = r["schedule_plan_json"] if "schedule_plan_json" in r.keys() else None
                try:
                    sched_plan = json.loads(raw_plan) if isinstance(raw_plan, str) and raw_plan.strip() else (raw_plan if isinstance(raw_plan, dict) else None)
                except Exception:
                    sched_plan = None
                threads_map[tid] = {
                    "threadId": tid,
                    "bookingId": bk_id,
                    "tutorId": str(r["tutor_id"] or ""),
                    "counterpartName": stu_name if viewer_role == "tutor" else tut_name,
                    "subjectName": str(r["subject"] or ""),
                    "priceRub": price_rub,
                    "slotLabel": slot_label,
                    "slotDate": str(r["slot_date"] or ""),
                    "dayLabel": day_part,
                    "hour": hour_part,
                    "dows": dows_list,
                    "schedulePlan": sched_plan,
                    "escrowStatus": str(r["escrow_status"] or "none"),
                    "reservedRub": int(r["reserved_rub"] or 0) if "reserved_rub" in r.keys() else 0,
                    "status": st_norm,
                    "telemostUrl": str(r["telemost_url"] or ""),
                    "lastMessage": str(r["note"] or "") if not r["note"] else f"Запрос: {r['note']}",
                    "lastSenderRole": "student",
                    "lastReadByStudent": False,
                    "lastReadByTutor": False,
                    "lastAt": str(r["updated_at"] or r["created_at"] or ""),
                    "lastMessageAt": "",
                    "lastMessageSeq": 0,
                    "unreadCount": 0,
                    "messageCount": 0,
                }

            # Подмешиваем прямые треды (без заявки) из chat_messages
            extra_rows: list[Any] = []
            if viewer_role == "tutor":
                conds = ["cm.tutor_user_id = ?"]
                params: list[Any] = [uid]
                if owned_tutors:
                    placeholders = ",".join("?" for _ in owned_tutors)
                    conds.append(f"cm.tutor_id IN ({placeholders})")
                    params.extend(owned_tutors)
                extra_rows = self._conn.execute(
                    f"""
                    SELECT cm.thread_id, cm.tutor_id, cm.student_user_id,
                           t.full_name AS tutor_full_name, t.subject AS tutor_subject,
                           u.display_name AS stu_display_name, u.username AS stu_username,
                           MAX(cm.created_at) AS last_at,
                           MAX(cm.rowid) AS last_rowid
                    FROM chat_messages cm
                    LEFT JOIN admin_tutors t ON t.id = cm.tutor_id
                    LEFT JOIN users u ON u.id = cm.student_user_id
                    WHERE {" OR ".join(conds)}
                    GROUP BY cm.thread_id
                    ORDER BY last_at DESC, last_rowid DESC
                    LIMIT ?
                    """,
                    [*params, lim],
                ).fetchall()
            else:
                extra_rows = self._conn.execute(
                    """
                    SELECT cm.thread_id, cm.tutor_id, cm.student_user_id,
                           t.full_name AS tutor_full_name, t.subject AS tutor_subject,
                           u.display_name AS stu_display_name, u.username AS stu_username,
                           MAX(cm.created_at) AS last_at,
                           MAX(cm.rowid) AS last_rowid
                    FROM chat_messages cm
                    LEFT JOIN admin_tutors t ON t.id = cm.tutor_id
                    LEFT JOIN users u ON u.id = cm.student_user_id
                    WHERE cm.student_user_id = ?
                    GROUP BY cm.thread_id
                    ORDER BY last_at DESC, last_rowid DESC
                    LIMIT ?
                    """,
                    (uid, lim),
                ).fetchall()

            for er in extra_rows:
                tid = str(er["thread_id"])
                if tid in threads_map:
                    continue
                tut_name = str(er["tutor_full_name"] or "Преподаватель").strip()
                stu_name = str(er["stu_display_name"] or er["stu_username"] or "Ученик").strip()
                threads_map[tid] = {
                    "threadId": tid,
                    "bookingId": None,
                    "tutorId": str(er["tutor_id"] or ""),
                    "counterpartName": stu_name if viewer_role == "tutor" else tut_name,
                    "subjectName": str(er["tutor_subject"] or "Занятие"),
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
                    "lastAt": str(er["last_at"] or ""),
                    "lastMessageAt": "",
                    "lastMessageSeq": 0,
                    "unreadCount": 0,
                    "messageCount": 0,
                }

            stats = self._chat_thread_stats(viewer_role, list(threads_map.keys()))
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
        with self._lock:
            auth_info = self._authorize_chat_thread(thread_id, user_id=user_id, role=role)
            rows = self._conn.execute(
                """
                SELECT *
                FROM chat_messages
                WHERE thread_id = ?
                ORDER BY created_at ASC, rowid ASC
                LIMIT ?
                """,
                (auth_info["threadId"], lim),
            ).fetchall()
            att_map = self._chat_attachments_map(auth_info["threadId"], [str(r["id"]) for r in rows])
            return [self._serialize_chat_message(r, att_map.get(str(r["id"]))) for r in rows]

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
        now_iso = _iso_utc_now()

        with self._lock:
            auth_info = self._authorize_chat_thread(
                thread_id,
                user_id=uid,
                role=sender_role,
                booking_id=booking_id,
                tutor_id=tutor_id,
            )
            eff_role = auth_info["viewerRole"]
            read_stu = 1 if eff_role == "student" else 0
            read_tut = 1 if eff_role == "tutor" else 0
            clean_sender_name = str(sender_name or "").strip()[:120]
            if not clean_sender_name:
                urow = self._conn.execute(
                    "SELECT display_name, username FROM users WHERE id = ?",
                    (uid,),
                ).fetchone()
                clean_sender_name = (
                    str(urow["display_name"] or urow["username"] or "").strip()[:120]
                    if urow
                    else ("Преподаватель" if eff_role == "tutor" else "Ученик")
                )

            self._conn.execute(
                """
                INSERT INTO chat_messages (
                    id, thread_id, booking_id, tutor_id, student_user_id, tutor_user_id,
                    sender_user_id, sender_role, sender_name, body,
                    read_by_student, read_by_tutor, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                    now_iso,
                ),
            )
            for aid in clean_assets:
                cma_id = f"cma-{uuid.uuid4().hex[:14]}"
                self._conn.execute(
                    """
                    INSERT OR IGNORE INTO chat_message_attachments (id, message_id, asset_id, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (cma_id, mid, aid, now_iso),
                )
            row = self._conn.execute("SELECT * FROM chat_messages WHERE id = ?", (mid,)).fetchone()
            self._conn.commit()
            att_map = self._chat_attachments_map(auth_info["threadId"], [mid])
            return self._serialize_chat_message(row, att_map.get(mid))

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
        with self._lock:
            auth_info = self._authorize_chat_thread(thread_id, user_id=user_id, role=role)
            row = self._conn.execute(
                """
                SELECT ma.*
                FROM chat_message_attachments cma
                JOIN chat_messages cm ON cm.id = cma.message_id
                JOIN media_assets ma ON ma.id = cma.asset_id
                WHERE cm.thread_id = ? AND cma.asset_id = ?
                LIMIT 1
                """,
                (auth_info["threadId"], clean_aid),
            ).fetchone()
            if not row:
                return None
            return {
                "id": str(row["id"]),
                "userId": row["user_id"],
                "kind": str(row["kind"]),
                "storageDriver": str(row["storage_driver"]),
                "bucket": str(row["bucket"]),
                "objectKey": str(row["object_key"]),
                "contentType": str(row["content_type"]),
                "sizeBytes": int(row["size_bytes"] or 0),
                "sha256": str(row["sha256"] or ""),
                "originalFilename": str(row["original_filename"] or ""),
                "publicUrl": row["public_url"],
            }

    def get_chat_thread_notification_target(
        self,
        thread_id: str,
        *,
        user_id: int,
        role: str = "student",
    ) -> dict[str, Any]:
        with self._lock:
            auth_info = self._authorize_chat_thread(thread_id, user_id=user_id, role=role)
            bk_id = auth_info.get("bookingId")
            tut_id = str(auth_info.get("tutorId") or "").strip()
            stu_uid = auth_info.get("studentUserId")

            tut_name = "Преподаватель"
            tut_wa = ""
            stu_wa = ""
            tut_uid_resolved = auth_info.get("tutorUserId")

            if bk_id:
                brow = self._conn.execute(
                    """
                    SELECT lr.tutor_id, lr.tutor_name, lr.student_name, lr.subject,
                           lr.day_label, lr.slot_date, lr.hour_slot, lr.telemost_url,
                           lr.offer_price_rub, lr.counter_price_rub, lr.final_price_rub,
                           lr.reserved_rub, lr.escrow_status, lr.status AS booking_status,
                           t.full_name AS t_full_name, t.user_id AS t_user_id,
                           t.whatsapp_phone, t.telegram_handle
                    FROM admin_lesson_requests lr
                    LEFT JOIN admin_tutors t ON t.id = lr.tutor_id
                    WHERE lr.id = ?
                    """,
                    (bk_id,),
                ).fetchone()
                if brow:
                    tut_id = tut_id or str(brow["tutor_id"] or "")
                    if tut_uid_resolved is None and brow["t_user_id"] is not None:
                        tut_uid_resolved = int(brow["t_user_id"])
                    tut_name = str(brow["t_full_name"] or brow["tutor_name"] or tut_name).strip()
                    tut_wa = str(brow["whatsapp_phone"] or "").strip()
                    tut_tg = str(brow["telegram_handle"] or "").strip()
                    stu_name = str(brow["student_name"] or stu_name).strip()
                    subj_name = str(brow["subject"] or subj_name).strip()
                    day_part = str(brow["day_label"] or brow["slot_date"] or "").strip()
                    hour_part = str(brow["hour_slot"] or "").strip()
                    slot_label = f"{day_part} · {hour_part}".strip(" ·")
                    telemost_url = str(brow["telemost_url"] or "").strip()
                    price_rub = int(brow["final_price_rub"] or brow["counter_price_rub"] or brow["offer_price_rub"] or 0)
                    reserved_rub = int(brow["reserved_rub"] or 0) if "reserved_rub" in brow.keys() else 0
                    escrow_status = str(brow["escrow_status"] or ("frozen" if reserved_rub > 0 else "none"))
                    raw_bk_st = str(brow["booking_status"] or "")
                    booking_status = _STATUS_MAP.get(raw_bk_st, raw_bk_st)
            elif tut_id:
                trow = self._conn.execute(
                    "SELECT user_id, full_name, subject, whatsapp_phone, telegram_handle FROM admin_tutors WHERE id = ?",
                    (tut_id,),
                ).fetchone()
                if trow:
                    if tut_uid_resolved is None and trow["user_id"] is not None:
                        tut_uid_resolved = int(trow["user_id"])
                    tut_name = str(trow["full_name"] or tut_name).strip()
                    subj_name = str(trow["subject"] or subj_name).strip()
                    tut_wa = str(trow["whatsapp_phone"] or "").strip()
                    tut_tg = str(trow["telegram_handle"] or "").strip()

            if not tut_wa and tut_uid_resolved is not None:
                tut_wa = self._resolve_user_phone(int(tut_uid_resolved))

            if stu_uid is not None:
                stu_wa = self._resolve_user_phone(int(stu_uid))
                if stu_name in ("", "Ученик"):
                    urow = self._conn.execute(
                        "SELECT display_name, username FROM users WHERE id = ?",
                        (int(stu_uid),),
                    ).fetchone()
                    if urow:
                        stu_name = str(urow["display_name"] or urow["username"] or stu_name).strip()

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

    def _resolve_user_phone(self, user_id: int | None) -> str:
        if user_id is None:
            return ""
        uid = int(user_id)
        ui_row = self._conn.execute(
            "SELECT provider_subject FROM user_identities WHERE user_id = ? AND provider = 'phone' LIMIT 1",
            (uid,),
        ).fetchone()
        if ui_row and str(ui_row["provider_subject"] or "").strip():
            return str(ui_row["provider_subject"] or "").strip()
        urow = self._conn.execute("SELECT phone FROM users WHERE id = ?", (uid,)).fetchone()
        return str(urow["phone"] or "").strip() if urow else ""

    def mark_chat_read(self, thread_id: str, *, user_id: int, role: str = "student") -> int:
        with self._lock:
            auth_info = self._authorize_chat_thread(thread_id, user_id=user_id, role=role)
            if auth_info["viewerRole"] == "tutor":
                cur = self._conn.execute(
                    "UPDATE chat_messages SET read_by_tutor = 1 WHERE thread_id = ? AND read_by_tutor = 0",
                    (auth_info["threadId"],),
                )
            else:
                cur = self._conn.execute(
                    "UPDATE chat_messages SET read_by_student = 1 WHERE thread_id = ? AND read_by_student = 0",
                    (auth_info["threadId"],),
                )
            self._conn.commit()
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
        max_age_query_iso = max_age_dt.strftime("%Y-%m-%dT%H:%M:%SZ")

        with self._lock:
            cand_rows = self._conn.execute(
                """
                WITH latest_per_thread AS (
                    SELECT id, thread_id, sender_role, read_by_student, read_by_tutor, created_at,
                           ROW_NUMBER() OVER (PARTITION BY thread_id ORDER BY created_at DESC, rowid DESC) AS rn
                    FROM chat_messages
                    WHERE sender_role IN ('student', 'tutor')
                )
                SELECT l.thread_id
                FROM latest_per_thread l
                WHERE l.rn = 1
                  AND l.created_at >= ?
                  AND (
                    (l.sender_role = 'student' AND l.read_by_tutor = 0)
                    OR (l.sender_role = 'tutor' AND l.read_by_student = 0)
                  )
                  AND NOT EXISTS (
                    SELECT 1 FROM chat_unanswered_notifications n
                    WHERE n.thread_id = l.thread_id
                      AND n.latest_message_id = l.id
                      AND n.recipient_role = CASE WHEN l.sender_role = 'student' THEN 'tutor' ELSE 'student' END
                  )
                ORDER BY l.created_at ASC
                LIMIT ?
                """,
                (max_age_query_iso, max(lim * 2, 200)),
            ).fetchall()

            results: list[dict[str, Any]] = []
            for cr in cand_rows:
                if len(results) >= lim:
                    break
                tid = str(cr["thread_id"] or "")
                if not tid:
                    continue
                rows = self._conn.execute(
                    """
                    SELECT *
                    FROM chat_messages
                    WHERE thread_id = ? AND sender_role IN ('student', 'tutor')
                    ORDER BY created_at ASC, rowid ASC
                    """,
                    (tid,),
                ).fetchall()
                if not rows:
                    continue
                latest = rows[-1]
                sender_role = str(latest["sender_role"] or "")
                recipient_role = "tutor" if sender_role == "student" else "student"
                read_col = "read_by_tutor" if recipient_role == "tutor" else "read_by_student"
                if bool(latest[read_col]):
                    continue

                streak: list[Any] = []
                for r in reversed(rows):
                    if str(r["sender_role"] or "") != sender_role or bool(r[read_col]):
                        break
                    streak.append(r)
                if not streak:
                    continue
                anchor = streak[-1]
                anchor_dt = _parse_iso_dt(anchor["created_at"])
                if anchor_dt is None or anchor_dt < max_age_dt or anchor_dt > older_dt:
                    continue

                anchor_id = str(anchor["id"])
                latest_id = str(latest["id"])
                dup = self._conn.execute(
                    """
                    SELECT 1 FROM chat_unanswered_notifications
                    WHERE thread_id = ? AND anchor_message_id = ? AND recipient_role = ?
                    LIMIT 1
                    """,
                    (tid, anchor_id, recipient_role),
                ).fetchone()
                if dup:
                    continue

                preview = str(latest["body"] or "").strip()[:240]
                if not preview:
                    att_map = self._chat_attachments_map(tid, [latest_id])
                    atts = att_map.get(latest_id) or []
                    if atts:
                        preview = "📷 Фото" if any(a.get("isImage") for a in atts) else self._attachment_preview(atts)[:240]

                bk_id = str(latest["booking_id"] or "").strip() or (
                    tid[len("booking:"):].strip() if tid.startswith("booking:") else None
                )
                tut_id = str(latest["tutor_id"] or "").strip()
                stu_uid = int(latest["student_user_id"]) if latest["student_user_id"] is not None else None
                tut_uid = int(latest["tutor_user_id"]) if latest["tutor_user_id"] is not None else None
                tut_name = "Преподаватель"
                stu_name = "Ученик"
                subj_name = "Занятие"
                tut_wa = ""

                if bk_id:
                    brow = self._conn.execute(
                        """
                        SELECT lr.tutor_id, lr.tutor_name, lr.student_name, lr.student_user_id, lr.subject,
                               t.full_name AS t_full_name, t.user_id AS t_user_id, t.whatsapp_phone
                        FROM admin_lesson_requests lr
                        LEFT JOIN admin_tutors t ON t.id = lr.tutor_id
                        WHERE lr.id = ?
                        """,
                        (bk_id,),
                    ).fetchone()
                    if brow:
                        tut_id = tut_id or str(brow["tutor_id"] or "")
                        if stu_uid is None and brow["student_user_id"] is not None:
                            stu_uid = int(brow["student_user_id"])
                        if tut_uid is None and brow["t_user_id"] is not None:
                            tut_uid = int(brow["t_user_id"])
                        tut_name = str(brow["t_full_name"] or brow["tutor_name"] or tut_name).strip()
                        stu_name = str(brow["student_name"] or stu_name).strip()
                        subj_name = str(brow["subject"] or subj_name).strip()
                        tut_wa = str(brow["whatsapp_phone"] or "").strip()

                if tut_id and (not tut_wa or tut_uid is None or tut_name == "Преподаватель"):
                    trow = self._conn.execute(
                        "SELECT user_id, full_name, subject, whatsapp_phone FROM admin_tutors WHERE id = ?",
                        (tut_id,),
                    ).fetchone()
                    if trow:
                        if tut_uid is None and trow["user_id"] is not None:
                            tut_uid = int(trow["user_id"])
                        if tut_name == "Преподаватель":
                            tut_name = str(trow["full_name"] or tut_name).strip()
                        if subj_name == "Занятие":
                            subj_name = str(trow["subject"] or subj_name).strip()
                        if not tut_wa:
                            tut_wa = str(trow["whatsapp_phone"] or "").strip()
                elif not tut_id and tut_uid is not None:
                    trow = self._conn.execute(
                        "SELECT id, full_name, subject, whatsapp_phone FROM admin_tutors WHERE user_id = ? LIMIT 1",
                        (tut_uid,),
                    ).fetchone()
                    if trow:
                        tut_id = str(trow["id"] or "").strip()
                        if tut_name == "Преподаватель":
                            tut_name = str(trow["full_name"] or tut_name).strip()
                        if subj_name == "Занятие":
                            subj_name = str(trow["subject"] or subj_name).strip()
                        if not tut_wa:
                            tut_wa = str(trow["whatsapp_phone"] or "").strip()

                if stu_uid is not None and stu_name in ("", "Ученик"):
                    urow = self._conn.execute(
                        "SELECT display_name, username FROM users WHERE id = ?",
                        (stu_uid,),
                    ).fetchone()
                    if urow:
                        stu_name = str(urow["display_name"] or urow["username"] or stu_name).strip()

                latest_sender = str(latest["sender_name"] or "").strip()
                if sender_role == "student":
                    sender_name = stu_name if stu_name not in ("", "Ученик") else (latest_sender or "Ученик")
                    recipient_name = tut_name
                    recipient_phone = tut_wa or self._resolve_user_phone(tut_uid)
                else:
                    sender_name = tut_name if tut_name not in ("", "Преподаватель") else (latest_sender or "Преподаватель")
                    recipient_name = stu_name
                    recipient_phone = self._resolve_user_phone(stu_uid)

                results.append(
                    {
                        "threadId": tid,
                        "anchorMessageId": anchor_id,
                        "latestMessageId": latest_id,
                        "firstUnreadAt": str(anchor["created_at"] or ""),
                        "latestMessageAt": str(latest["created_at"] or ""),
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
        now_iso = _iso_utc_now()
        with self._lock:
            cur = self._conn.execute(
                """
                INSERT OR IGNORE INTO chat_unanswered_notifications (
                    thread_id, anchor_message_id, recipient_role, latest_message_id, channels, sent_at
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (tid, aid, role_norm, str(latest_message_id or ""), ch_str, now_iso),
            )
            self._conn.commit()
        return bool(cur.rowcount and cur.rowcount > 0)
