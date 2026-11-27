"""Изолированное SQLite-хранилище ИИ-помощника преподавателя вуза (Кейс №3)."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import hmac
import json
from pathlib import Path
import secrets
import sqlite3
import threading
from typing import Any
import uuid


def _utc_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _parse_json(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def _dump_json(val: Any) -> str:
    return json.dumps(val, ensure_ascii=False, separators=(",", ":"))


def _compute_draft_hash(
    *,
    kind: str,
    course_id: str,
    group_name: str,
    title: str,
    content_md: str,
    plan: list[Any],
    criteria: list[Any],
    deadline: str | None,
) -> str:
    payload = _dump_json(
        {
            "kind": kind,
            "course_id": course_id,
            "group_name": group_name,
            "title": title,
            "content_md": content_md,
            "plan": plan,
            "criteria": criteria,
            "deadline": deadline or "",
        }
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _calc_duration_min(start_time: str, end_time: str) -> int:
    try:
        sh, sm = map(int, start_time.split(":", 1))
        eh, em = map(int, end_time.split(":", 1))
        diff = (eh * 60 + em) - (sh * 60 + sm)
        return diff if diff > 0 else 90
    except (ValueError, AttributeError):
        return 90


class TeacherAgentStore:
    """Хранилище курсов, расписания, материалов, черновиков, публикаций, чатов и трасс."""

    _ALLOWED_FLAG_COLS = frozenset({"is_conflict_doc", "is_injection_doc"})

    def __init__(self, db_path: Path) -> None:
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(self.db_path), timeout=15.0, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        with self._lock:
            self._conn.execute("PRAGMA busy_timeout = 10000")
            self._conn.execute("PRAGMA journal_mode = WAL")
            self._conn.execute("PRAGMA foreign_keys = ON")
            self._init_schema()

    def close(self) -> None:
        with self._lock:
            self._conn.close()

    def _init_schema(self) -> None:
        self._conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS ta_courses (
                id TEXT PRIMARY KEY,
                code TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                groups_json TEXT NOT NULL DEFAULT '[]',
                owner_id TEXT NOT NULL DEFAULT 'demo-teacher',
                template_steps_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_schedule (
                id TEXT PRIMARY KEY,
                course_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                date_iso TEXT NOT NULL,
                start_time TEXT NOT NULL,
                end_time TEXT NOT NULL,
                duration_min INTEGER NOT NULL DEFAULT 90,
                kind TEXT NOT NULL DEFAULT 'практика',
                topic TEXT NOT NULL,
                room TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'scheduled',
                status_note TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_materials (
                id TEXT PRIMARY KEY,
                course_id TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                doc_title TEXT NOT NULL,
                section TEXT NOT NULL,
                title TEXT NOT NULL,
                content_md TEXT NOT NULL,
                deliverable_format TEXT NOT NULL DEFAULT '',
                deadline TEXT,
                rubric_json TEXT NOT NULL DEFAULT '[]',
                is_conflict_doc INTEGER NOT NULL DEFAULT 0,
                is_injection_doc INTEGER NOT NULL DEFAULT 0,
                priority INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_drafts (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL,
                course_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                title TEXT NOT NULL,
                content_md TEXT NOT NULL,
                plan_json TEXT NOT NULL DEFAULT '[]',
                criteria_json TEXT NOT NULL DEFAULT '[]',
                proposals_json TEXT NOT NULL DEFAULT '[]',
                sources_json TEXT NOT NULL DEFAULT '[]',
                deadline TEXT,
                version INTEGER NOT NULL DEFAULT 1,
                content_hash TEXT NOT NULL,
                preview_token TEXT,
                preview_version INTEGER,
                status TEXT NOT NULL DEFAULT 'draft',
                owner_id TEXT NOT NULL DEFAULT 'demo-teacher',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_publications (
                id TEXT PRIMARY KEY,
                draft_id TEXT NOT NULL,
                draft_version INTEGER NOT NULL,
                idempotency_key TEXT NOT NULL UNIQUE,
                kind TEXT NOT NULL,
                course_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                title TEXT NOT NULL,
                content_md TEXT NOT NULL,
                deadline TEXT,
                status TEXT NOT NULL DEFAULT 'published',
                owner_id TEXT NOT NULL DEFAULT 'demo-teacher',
                published_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_presentations (
                id TEXT PRIMARY KEY,
                draft_id TEXT,
                course_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                topic TEXT NOT NULL,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                slides_json TEXT NOT NULL DEFAULT '[]',
                sources_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_group_messages (
                id TEXT PRIMARY KEY,
                course_id TEXT NOT NULL,
                group_name TEXT NOT NULL,
                sender_role TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                body TEXT NOT NULL,
                publication_id TEXT,
                created_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_stand_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS ta_trace_logs (
                id TEXT PRIMARY KEY,
                request_id TEXT NOT NULL,
                trace_id TEXT NOT NULL,
                tool_name TEXT NOT NULL,
                status TEXT NOT NULL,
                duration_ms INTEGER NOT NULL DEFAULT 0,
                source_refs_json TEXT NOT NULL DEFAULT '[]',
                created_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ta_schedule_date ON ta_schedule(date_iso, start_time);
            CREATE INDEX IF NOT EXISTS idx_ta_materials_course ON ta_materials(course_id, priority);
            CREATE INDEX IF NOT EXISTS idx_ta_drafts_course ON ta_drafts(course_id, updated_at);
            CREATE INDEX IF NOT EXISTS idx_ta_publications_course ON ta_publications(course_id, published_at);
            CREATE INDEX IF NOT EXISTS idx_ta_group_messages_cg ON ta_group_messages(course_id, group_name, created_at);
            CREATE INDEX IF NOT EXISTS idx_ta_traces_req ON ta_trace_logs(created_at, trace_id);
            """
        )
        self._conn.commit()

    def clear_all_tables(self) -> None:
        """Очищает все таблицы стенда перед повторным засевом."""
        with self._lock:
            for tbl in (
                "ta_trace_logs",
                "ta_group_messages",
                "ta_presentations",
                "ta_publications",
                "ta_drafts",
                "ta_materials",
                "ta_schedule",
                "ta_courses",
                "ta_stand_state",
            ):
                self._conn.execute(f"DELETE FROM {tbl}")
            self._conn.commit()

    def claim_initial_seed(self) -> bool:
        """Атомарно резервирует право первичного засева стенда для мультиворкерного запуска."""
        with self._lock:
            row = self._conn.execute("SELECT COUNT(*) AS cnt FROM ta_courses").fetchone()
            if row and int(row["cnt"]) > 0:
                self._conn.execute(
                    "INSERT OR IGNORE INTO ta_stand_state(key, value) VALUES ('seeded_v1', '1')"
                )
                self._conn.commit()
                return False
            cur = self._conn.execute(
                "INSERT OR IGNORE INTO ta_stand_state(key, value) VALUES ('seeded_v1', '1')"
            )
            self._conn.commit()
            return cur.rowcount == 1

    # ── Курсы и права доступа ────────────────────────────────────────────────────

    @staticmethod
    def _row_to_course(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "code": row["code"],
            "title": row["title"],
            "description": row["description"],
            "groups": _parse_json(row["groups_json"], []),
            "ownerId": row["owner_id"],
            "templateSteps": _parse_json(row["template_steps_json"], []),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def list_courses(self, owner_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if owner_id is not None:
                rows = self._conn.execute(
                    "SELECT * FROM ta_courses WHERE owner_id = ? ORDER BY created_at ASC, id ASC",
                    (owner_id,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM ta_courses ORDER BY created_at ASC, id ASC"
                ).fetchall()
            return [self._row_to_course(r) for r in rows]

    def get_course(self, course_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM ta_courses WHERE id = ?",
                (course_id,),
            ).fetchone()
            return self._row_to_course(row) if row else None

    def check_course_access(self, owner_id: str, course_id: str) -> dict[str, Any]:
        course = self.get_course(course_id)
        if not course:
            raise LookupError(f"Курс «{course_id}» не найден.")
        if course["ownerId"] != owner_id:
            raise PermissionError(f"Нет прав доступа к курсу «{course_id}».")
        return course

    def create_course(
        self,
        *,
        course_id: str,
        code: str,
        title: str,
        description: str = "",
        groups: list[str] | tuple[str, ...] = (),
        owner_id: str = "demo-teacher",
        template_steps: list[dict[str, Any]] | tuple[dict[str, Any], ...] = (),
    ) -> dict[str, Any]:
        clean_id = str(course_id).strip()
        if not clean_id:
            raise ValueError("Пустой идентификатор курса.")
        now = _utc_iso()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO ta_courses (
                    id, code, title, description, groups_json, owner_id, template_steps_json, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    clean_id,
                    str(code).strip() or clean_id.upper(),
                    str(title).strip(),
                    str(description).strip(),
                    _dump_json([str(g).strip() for g in groups if str(g).strip()]),
                    owner_id,
                    _dump_json(list(template_steps)),
                    now,
                    now,
                ),
            )
            self._conn.commit()
            created = self.get_course(clean_id)
            assert created is not None
            return created

    def update_course_steps(
        self,
        course_id: str,
        owner_id: str,
        steps: list[dict[str, Any]],
    ) -> dict[str, Any]:
        with self._lock:
            self.check_course_access(owner_id, course_id)
            now = _utc_iso()
            self._conn.execute(
                "UPDATE ta_courses SET template_steps_json = ?, updated_at = ? WHERE id = ?",
                (_dump_json(list(steps)), now, course_id),
            )
            self._conn.commit()
            updated = self.get_course(course_id)
            assert updated is not None
            return updated

    # ── Расписание вуза ──────────────────────────────────────────────────────────

    @staticmethod
    def _row_to_lesson(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "courseId": row["course_id"],
            "courseTitle": row["course_title"] if "course_title" in row.keys() else "",
            "groupName": row["group_name"],
            "dateIso": row["date_iso"],
            "startTime": row["start_time"],
            "endTime": row["end_time"],
            "durationMin": int(row["duration_min"]),
            "kind": row["kind"],
            "topic": row["topic"],
            "room": row["room"],
            "status": row["status"],
            "statusNote": row["status_note"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    def list_schedule(
        self,
        *,
        date_from: str | None = None,
        date_to: str | None = None,
        course_id: str | None = None,
        group_name: str | None = None,
        include_cancelled: bool = True,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if date_from:
            clauses.append("s.date_iso >= ?")
            params.append(date_from)
        if date_to:
            clauses.append("s.date_iso <= ?")
            params.append(date_to)
        if course_id:
            clauses.append("s.course_id = ?")
            params.append(course_id)
        if not include_cancelled:
            clauses.append("s.status != 'cancelled'")

        where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT s.*, COALESCE(c.title, s.course_id) AS course_title
                FROM ta_schedule s
                LEFT JOIN ta_courses c ON c.id = s.course_id
                {where_sql}
                ORDER BY s.date_iso ASC, s.start_time ASC, s.id ASC
                """,
                params,
            ).fetchall()
            out = [self._row_to_lesson(r) for r in rows]
        if group_name:
            needle = group_name.strip().lower()
            out = [it for it in out if needle in it["groupName"].lower()]
        return out

    def get_lesson(self, lesson_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(
                """
                SELECT s.*, COALESCE(c.title, s.course_id) AS course_title
                FROM ta_schedule s
                LEFT JOIN ta_courses c ON c.id = s.course_id
                WHERE s.id = ?
                """,
                (lesson_id,),
            ).fetchone()
            return self._row_to_lesson(row) if row else None

    def create_lesson(
        self,
        *,
        lesson_id: str | None = None,
        course_id: str,
        group_name: str,
        date_iso: str,
        start_time: str,
        end_time: str,
        topic: str,
        kind: str = "практика",
        room: str = "",
        duration_min: int | None = None,
        status: str = "scheduled",
        status_note: str = "",
        owner_id: str = "demo-teacher",
    ) -> dict[str, Any]:
        with self._lock:
            self.check_course_access(owner_id, course_id)
            lid = (lesson_id or f"les-{uuid.uuid4().hex[:8]}").strip()
            dur = int(duration_min) if duration_min else _calc_duration_min(start_time, end_time)
            now = _utc_iso()
            self._conn.execute(
                """
                INSERT INTO ta_schedule (
                    id, course_id, group_name, date_iso, start_time, end_time,
                    duration_min, kind, topic, room, status, status_note, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    lid,
                    course_id,
                    group_name.strip(),
                    date_iso.strip(),
                    start_time.strip(),
                    end_time.strip(),
                    dur,
                    kind.strip() or "практика",
                    topic.strip(),
                    room.strip(),
                    status,
                    status_note.strip(),
                    now,
                    now,
                ),
            )
            self._conn.commit()
            created = self.get_lesson(lid)
            assert created is not None
            return created

    def reschedule_lesson(
        self,
        lesson_id: str,
        *,
        owner_id: str,
        date_iso: str,
        start_time: str,
        end_time: str,
        room: str | None = None,
        note: str = "",
    ) -> dict[str, Any]:
        with self._lock:
            cur = self.get_lesson(lesson_id)
            if not cur:
                raise LookupError(f"Занятие «{lesson_id}» не найдено.")
            self.check_course_access(owner_id, cur["courseId"])
            dur = _calc_duration_min(start_time, end_time)
            new_room = cur["room"] if room is None else room.strip()
            now = _utc_iso()
            self._conn.execute(
                """
                UPDATE ta_schedule
                SET date_iso = ?, start_time = ?, end_time = ?, duration_min = ?,
                    room = ?, status = 'rescheduled', status_note = ?, updated_at = ?
                WHERE id = ?
                """,
                (date_iso.strip(), start_time.strip(), end_time.strip(), dur, new_room, note.strip(), now, lesson_id),
            )
            self._conn.commit()
            updated = self.get_lesson(lesson_id)
            assert updated is not None
            return updated

    def cancel_lesson(self, lesson_id: str, *, owner_id: str, note: str = "") -> dict[str, Any]:
        with self._lock:
            cur = self.get_lesson(lesson_id)
            if not cur:
                raise LookupError(f"Занятие «{lesson_id}» не найдено.")
            self.check_course_access(owner_id, cur["courseId"])
            now = _utc_iso()
            self._conn.execute(
                "UPDATE ta_schedule SET status = 'cancelled', status_note = ?, updated_at = ? WHERE id = ?",
                (note.strip() or "Отменено преподавателем", now, lesson_id),
            )
            self._conn.commit()
            updated = self.get_lesson(lesson_id)
            assert updated is not None
            return updated

    # ── Материалы курса и поиск с источниками ──────────────────────────────────

    @staticmethod
    def _row_to_material(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "courseId": row["course_id"],
            "docId": row["doc_id"],
            "docTitle": row["doc_title"],
            "section": row["section"],
            "title": row["title"],
            "contentMd": row["content_md"],
            "deliverableFormat": row["deliverable_format"],
            "deadline": row["deadline"],
            "rubric": _parse_json(row["rubric_json"], []),
            "isConflictDoc": bool(row["is_conflict_doc"]),
            "isInjectionDoc": bool(row["is_injection_doc"]),
            "priority": int(row["priority"]),
            "createdAt": row["created_at"],
        }

    def list_materials(self, course_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if course_id:
                rows = self._conn.execute(
                    "SELECT * FROM ta_materials WHERE course_id = ? ORDER BY priority DESC, created_at ASC, id ASC",
                    (course_id,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM ta_materials ORDER BY priority DESC, created_at ASC, id ASC"
                ).fetchall()
            return [self._row_to_material(r) for r in rows]

    def add_material(
        self,
        *,
        material_id: str | None = None,
        course_id: str,
        doc_id: str,
        doc_title: str,
        section: str,
        title: str,
        content_md: str,
        deliverable_format: str = "",
        deadline: str | None = None,
        rubric: list[dict[str, Any]] = (),
        is_conflict_doc: bool = False,
        is_injection_doc: bool = False,
        priority: int = 0,
    ) -> dict[str, Any]:
        mid = (material_id or f"mat-{uuid.uuid4().hex[:8]}").strip()
        now = _utc_iso()
        with self._lock:
            self._conn.execute(
                """
                INSERT OR REPLACE INTO ta_materials (
                    id, course_id, doc_id, doc_title, section, title, content_md,
                    deliverable_format, deadline, rubric_json, is_conflict_doc,
                    is_injection_doc, priority, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    mid,
                    course_id,
                    doc_id,
                    doc_title,
                    section,
                    title,
                    content_md,
                    deliverable_format,
                    deadline,
                    _dump_json(list(rubric)),
                    1 if is_conflict_doc else 0,
                    1 if is_injection_doc else 0,
                    int(priority),
                    now,
                ),
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM ta_materials WHERE id = ?", (mid,)).fetchone()
            assert row is not None
            return self._row_to_material(row)

    def delete_materials_by_flag(self, flag_col: str) -> int:
        if flag_col not in self._ALLOWED_FLAG_COLS:
            raise ValueError(f"Недопустимый флаг: {flag_col}")
        with self._lock:
            cur = self._conn.execute(f"DELETE FROM ta_materials WHERE {flag_col} = 1")
            self._conn.commit()
            return int(cur.rowcount or 0)

    def search_materials(
        self,
        query: str,
        *,
        course_id: str | None = None,
        allowed_course_ids: set[str] | list[str] | tuple[str, ...] | None = None,
    ) -> list[dict[str, Any]]:
        candidates = self.list_materials(course_id=course_id)
        if allowed_course_ids is not None:
            allowed = set(allowed_course_ids)
            candidates = [m for m in candidates if m["courseId"] in allowed]

        tokens = [tok.strip(".,!?:;«»\"'()").lower() for tok in (query or "").split() if len(tok.strip(".,!?:;«»\"'()")) >= 2]
        if not tokens:
            return candidates

        scored: list[tuple[int, dict[str, Any]]] = []
        for item in candidates:
            hay = " ".join(
                [
                    item["docTitle"],
                    item["section"],
                    item["title"],
                    item["contentMd"],
                    item["deliverableFormat"],
                ]
            ).lower()
            hits = sum(1 for tok in tokens if tok in hay)
            if hits > 0:
                scored.append((hits, item))

        scored.sort(key=lambda pair: (pair[0], pair[1]["priority"]), reverse=True)
        return [pair[1] for pair in scored]

    # ── Черновики, предпросмотр, подтверждение и идемпотентные публикации ───────

    @staticmethod
    def _row_to_draft(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "kind": row["kind"],
            "courseId": row["course_id"],
            "groupName": row["group_name"],
            "title": row["title"],
            "contentMd": row["content_md"],
            "plan": _parse_json(row["plan_json"], []),
            "criteria": _parse_json(row["criteria_json"], []),
            "proposals": _parse_json(row["proposals_json"], []),
            "sources": _parse_json(row["sources_json"], []),
            "deadline": row["deadline"],
            "version": int(row["version"]),
            "contentHash": row["content_hash"],
            "previewToken": row["preview_token"],
            "previewVersion": row["preview_version"],
            "status": row["status"],
            "ownerId": row["owner_id"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    @staticmethod
    def _row_to_publication(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "draftId": row["draft_id"],
            "draftVersion": int(row["draft_version"]),
            "idempotencyKey": row["idempotency_key"],
            "kind": row["kind"],
            "courseId": row["course_id"],
            "groupName": row["group_name"],
            "title": row["title"],
            "contentMd": row["content_md"],
            "deadline": row["deadline"],
            "status": row["status"],
            "ownerId": row["owner_id"],
            "publishedAt": row["published_at"],
        }

    def get_draft(self, draft_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM ta_drafts WHERE id = ?", (draft_id,)).fetchone()
            return self._row_to_draft(row) if row else None

    def list_drafts(self, course_id: str | None = None, owner_id: str | None = None) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if course_id:
            clauses.append("course_id = ?")
            params.append(course_id)
        if owner_id:
            clauses.append("owner_id = ?")
            params.append(owner_id)
        where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM ta_drafts {where_sql} ORDER BY updated_at DESC, id DESC",
                params,
            ).fetchall()
            return [self._row_to_draft(r) for r in rows]

    def create_draft(
        self,
        *,
        kind: str,
        course_id: str,
        group_name: str,
        title: str,
        content_md: str,
        plan: list[dict[str, Any]] = (),
        criteria: list[dict[str, Any]] = (),
        proposals: list[str] = (),
        sources: list[dict[str, Any]] = (),
        deadline: str | None = None,
        owner_id: str = "demo-teacher",
        draft_id: str | None = None,
    ) -> dict[str, Any]:
        with self._lock:
            self.check_course_access(owner_id, course_id)
            did = (draft_id or f"drf-{uuid.uuid4().hex[:8]}").strip()
            plan_list = list(plan)
            crit_list = list(criteria)
            clean_deadline = deadline.strip() if isinstance(deadline, str) and deadline.strip() else None
            chash = _compute_draft_hash(
                kind=kind,
                course_id=course_id,
                group_name=group_name.strip(),
                title=title.strip(),
                content_md=content_md,
                plan=plan_list,
                criteria=crit_list,
                deadline=clean_deadline,
            )
            now = _utc_iso()
            self._conn.execute(
                """
                INSERT INTO ta_drafts (
                    id, kind, course_id, group_name, title, content_md, plan_json,
                    criteria_json, proposals_json, sources_json, deadline, version,
                    content_hash, preview_token, preview_version, status, owner_id, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, NULL, NULL, 'draft', ?, ?, ?)
                """,
                (
                    did,
                    kind,
                    course_id,
                    group_name.strip(),
                    title.strip(),
                    content_md,
                    _dump_json(plan_list),
                    _dump_json(crit_list),
                    _dump_json(list(proposals)),
                    _dump_json(list(sources)),
                    clean_deadline,
                    chash,
                    owner_id,
                    now,
                    now,
                ),
            )
            self._conn.commit()
            created = self.get_draft(did)
            assert created is not None
            return created

    def update_draft(
        self,
        draft_id: str,
        *,
        owner_id: str,
        title: str | None = None,
        content_md: str | None = None,
        group_name: str | None = None,
        plan: list[dict[str, Any]] | None = None,
        criteria: list[dict[str, Any]] | None = None,
        deadline: str | None = None,
        clear_deadline: bool = False,
    ) -> dict[str, Any]:
        with self._lock:
            cur = self.get_draft(draft_id)
            if not cur:
                raise LookupError(f"Черновик «{draft_id}» не найден.")
            self.check_course_access(owner_id, cur["courseId"])

            new_title = cur["title"] if title is None else title.strip()
            new_content = cur["contentMd"] if content_md is None else content_md
            new_group = cur["groupName"] if group_name is None else group_name.strip()
            new_plan = cur["plan"] if plan is None else list(plan)
            new_criteria = cur["criteria"] if criteria is None else list(criteria)
            if clear_deadline:
                new_deadline = None
            elif deadline is not None:
                new_deadline = deadline.strip() or None
            else:
                new_deadline = cur["deadline"]

            new_version = cur["version"] + 1
            chash = _compute_draft_hash(
                kind=cur["kind"],
                course_id=cur["courseId"],
                group_name=new_group,
                title=new_title,
                content_md=new_content,
                plan=new_plan,
                criteria=new_criteria,
                deadline=new_deadline,
            )
            now = _utc_iso()
            # Любая правка сбрасывает preview_token и preview_version (п. 2.6 ТЗ)
            self._conn.execute(
                """
                UPDATE ta_drafts
                SET title = ?, content_md = ?, group_name = ?, plan_json = ?,
                    criteria_json = ?, deadline = ?, version = ?, content_hash = ?,
                    preview_token = NULL, preview_version = NULL, status = 'draft', updated_at = ?
                WHERE id = ?
                """,
                (
                    new_title,
                    new_content,
                    new_group,
                    _dump_json(new_plan),
                    _dump_json(new_criteria),
                    new_deadline,
                    new_version,
                    chash,
                    now,
                    draft_id,
                ),
            )
            self._conn.commit()
            updated = self.get_draft(draft_id)
            assert updated is not None
            return updated

    def prepare_preview(self, draft_id: str, owner_id: str) -> dict[str, Any]:
        with self._lock:
            cur = self.get_draft(draft_id)
            if not cur:
                raise LookupError(f"Черновик «{draft_id}» не найден.")
            course = self.check_course_access(owner_id, cur["courseId"])
            if cur["kind"] == "homework" and not (cur["deadline"] or "").strip():
                raise ValueError("Не указан дедлайн домашнего задания. Задайте срок перед предпросмотром публикации.")
            token = secrets.token_urlsafe(16)
            now = _utc_iso()
            self._conn.execute(
                """
                UPDATE ta_drafts
                SET preview_token = ?, preview_version = ?, status = 'previewed', updated_at = ?
                WHERE id = ?
                """,
                (token, cur["version"], now, draft_id),
            )
            self._conn.commit()
            return {
                "draftId": draft_id,
                "kind": cur["kind"],
                "courseId": cur["courseId"],
                "courseTitle": course["title"],
                "groupName": cur["groupName"],
                "title": cur["title"],
                "contentMd": cur["contentMd"],
                "deadline": cur["deadline"],
                "version": cur["version"],
                "previewToken": token,
            }

    def cancel_preview(self, draft_id: str, owner_id: str) -> dict[str, Any]:
        with self._lock:
            cur = self.get_draft(draft_id)
            if not cur:
                raise LookupError(f"Черновик «{draft_id}» не найден.")
            self.check_course_access(owner_id, cur["courseId"])
            now = _utc_iso()
            self._conn.execute(
                """
                UPDATE ta_drafts
                SET preview_token = NULL, preview_version = NULL, status = 'draft', updated_at = ?
                WHERE id = ?
                """,
                (now, draft_id),
            )
            self._conn.commit()
            updated = self.get_draft(draft_id)
            assert updated is not None
            return updated

    def confirm_publish(
        self,
        draft_id: str,
        *,
        owner_id: str,
        preview_token: str,
        expected_version: int,
    ) -> tuple[dict[str, Any], bool]:
        """Публикует черновик после подтверждения. Возвращает (публикация, was_duplicate)."""
        with self._lock:
            cur = self.get_draft(draft_id)
            if not cur:
                raise LookupError(f"Черновик «{draft_id}» не найден.")
            self.check_course_access(owner_id, cur["courseId"])

            idem_key = f"{draft_id}:{int(expected_version)}"
            existing_row = self._conn.execute(
                "SELECT * FROM ta_publications WHERE idempotency_key = ?",
                (idem_key,),
            ).fetchone()
            if (
                existing_row is not None
                and cur["version"] == int(expected_version)
                and cur["previewToken"]
                and hmac.compare_digest(cur["previewToken"], preview_token or "")
            ):
                return self._row_to_publication(existing_row), True

            if not cur["previewToken"] or cur["previewVersion"] != int(expected_version):
                raise ValueError(
                    "Предпросмотр неактуален или отменён. Откройте предпросмотр актуальной версии и подтвердите публикацию заново."
                )
            if cur["version"] != int(expected_version):
                raise ValueError(
                    "Версия черновика изменилась после предпросмотра. Проверьте актуальную версию перед публикацией."
                )
            if not hmac.compare_digest(cur["previewToken"], preview_token or ""):
                raise ValueError("Недействительный токен подтверждения. Проверьте актуальную версию перед публикацией.")
            if cur["kind"] == "homework" and not (cur["deadline"] or "").strip():
                raise ValueError("Не указан дедлайн домашнего задания.")

            pub_id = f"pub-{uuid.uuid4().hex[:8]}"
            now = _utc_iso()
            self._conn.execute(
                """
                INSERT INTO ta_publications (
                    id, draft_id, draft_version, idempotency_key, kind, course_id,
                    group_name, title, content_md, deadline, status, owner_id, published_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?)
                """,
                (
                    pub_id,
                    draft_id,
                    int(expected_version),
                    idem_key,
                    cur["kind"],
                    cur["courseId"],
                    cur["groupName"],
                    cur["title"],
                    cur["contentMd"],
                    cur["deadline"],
                    owner_id,
                    now,
                ),
            )
            self._conn.execute(
                "UPDATE ta_drafts SET status = 'published', updated_at = ? WHERE id = ?",
                (now, draft_id),
            )

            kind_label = "Домашнее задание" if cur["kind"] == "homework" else "Объявление"
            deadline_line = f"\nСрок сдачи: {cur['deadline']}" if cur["deadline"] else ""
            chat_body = f"[{kind_label}] {cur['title']}{deadline_line}\n\n{cur['contentMd']}"
            self._insert_group_message_locked(
                course_id=cur["courseId"],
                group_name=cur["groupName"],
                sender_role="teacher",
                sender_name="Преподаватель (демо)",
                body=chat_body,
                publication_id=pub_id,
            )
            self._conn.commit()
            pub_row = self._conn.execute("SELECT * FROM ta_publications WHERE id = ?", (pub_id,)).fetchone()
            assert pub_row is not None
            return self._row_to_publication(pub_row), False

    def list_publications(
        self,
        *,
        course_id: str | None = None,
        group_name: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if course_id:
            clauses.append("course_id = ?")
            params.append(course_id)
        if group_name:
            clauses.append("group_name = ?")
            params.append(group_name)
        where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM ta_publications {where_sql} ORDER BY published_at DESC, id DESC",
                params,
            ).fetchall()
            return [self._row_to_publication(r) for r in rows]

    # ── Чат группы со студентами ─────────────────────────────────────────────────

    @staticmethod
    def _row_to_message(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "courseId": row["course_id"],
            "groupName": row["group_name"],
            "senderRole": row["sender_role"],
            "senderName": row["sender_name"],
            "body": row["body"],
            "publicationId": row["publication_id"],
            "createdAt": row["created_at"],
        }

    def _insert_group_message_locked(
        self,
        *,
        course_id: str,
        group_name: str,
        sender_role: str,
        sender_name: str,
        body: str,
        publication_id: str | None = None,
    ) -> dict[str, Any]:
        mid = f"msg-{uuid.uuid4().hex[:8]}"
        now = _utc_iso()
        self._conn.execute(
            """
            INSERT INTO ta_group_messages (
                id, course_id, group_name, sender_role, sender_name, body, publication_id, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (mid, course_id, group_name.strip(), sender_role, sender_name.strip(), body, publication_id, now),
        )
        row = self._conn.execute("SELECT * FROM ta_group_messages WHERE id = ?", (mid,)).fetchone()
        assert row is not None
        return self._row_to_message(row)

    def post_group_message(
        self,
        *,
        course_id: str,
        group_name: str,
        sender_role: str,
        sender_name: str,
        body: str,
        publication_id: str | None = None,
    ) -> dict[str, Any]:
        clean_body = str(body or "").strip()
        if not clean_body:
            raise ValueError("Текст сообщения не может быть пустым.")
        with self._lock:
            msg = self._insert_group_message_locked(
                course_id=course_id,
                group_name=group_name,
                sender_role=sender_role,
                sender_name=sender_name,
                body=clean_body,
                publication_id=publication_id,
            )
            self._conn.commit()
            return msg

    def list_group_messages(
        self,
        *,
        course_id: str | None = None,
        group_name: str | None = None,
    ) -> list[dict[str, Any]]:
        clauses: list[str] = []
        params: list[Any] = []
        if course_id:
            clauses.append("course_id = ?")
            params.append(course_id)
        if group_name:
            clauses.append("group_name = ?")
            params.append(group_name)
        where_sql = ("WHERE " + " AND ".join(clauses)) if clauses else ""
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM ta_group_messages {where_sql} ORDER BY created_at ASC, id ASC",
                params,
            ).fetchall()
            return [self._row_to_message(r) for r in rows]

    # ── Презентации (PPTX) ──────────────────────────────────────────────────────

    @staticmethod
    def _row_to_presentation(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": row["id"],
            "draftId": row["draft_id"],
            "courseId": row["course_id"],
            "groupName": row["group_name"],
            "topic": row["topic"],
            "filename": row["filename"],
            "filePath": row["file_path"],
            "slides": _parse_json(row["slides_json"], []),
            "sources": _parse_json(row["sources_json"], []),
            "createdAt": row["created_at"],
        }

    def save_presentation(
        self,
        *,
        pres_id: str | None = None,
        draft_id: str | None = None,
        course_id: str,
        group_name: str,
        topic: str,
        filename: str,
        file_path: str | Path,
        slides: list[dict[str, Any]] = (),
        sources: list[dict[str, Any]] = (),
    ) -> dict[str, Any]:
        pid = (pres_id or f"pptx-{uuid.uuid4().hex[:8]}").strip()
        now = _utc_iso()
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO ta_presentations (
                    id, draft_id, course_id, group_name, topic, filename,
                    file_path, slides_json, sources_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    pid,
                    draft_id,
                    course_id,
                    group_name.strip(),
                    topic.strip(),
                    filename,
                    str(file_path),
                    _dump_json(list(slides)),
                    _dump_json(list(sources)),
                    now,
                ),
            )
            self._conn.commit()
            pres = self.get_presentation(pid)
            assert pres is not None
            return pres

    def get_presentation(self, pres_id: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute("SELECT * FROM ta_presentations WHERE id = ?", (pres_id,)).fetchone()
            return self._row_to_presentation(row) if row else None

    def list_presentations(self, course_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if course_id:
                rows = self._conn.execute(
                    "SELECT * FROM ta_presentations WHERE course_id = ? ORDER BY created_at DESC",
                    (course_id,),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    "SELECT * FROM ta_presentations ORDER BY created_at DESC"
                ).fetchall()
            return [self._row_to_presentation(r) for r in rows]

    # ── Состояние стенда и аудит-журнал без ПДн/текстов ─────────────────────────

    def get_stand_state(self) -> dict[str, str]:
        with self._lock:
            rows = self._conn.execute("SELECT key, value FROM ta_stand_state").fetchall()
            return {row["key"]: row["value"] for row in rows}

    def set_stand_flag(self, key: str, value: str) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO ta_stand_state (key, value) VALUES (?, ?)",
                (str(key), str(value)),
            )
            self._conn.commit()

    def record_trace(
        self,
        *,
        request_id: str,
        trace_id: str,
        tool_name: str,
        status: str,
        duration_ms: int,
        source_refs: list[str] | tuple[str, ...] = (),
    ) -> dict[str, Any]:
        """Фиксирует трассу инструмента строго без текстов, ПДн и секретов (п. 4 ТЗ)."""
        tid = f"tr-{uuid.uuid4().hex[:8]}"
        now = _utc_iso()
        refs = [str(r)[:120] for r in source_refs if str(r).strip()]
        with self._lock:
            self._conn.execute(
                """
                INSERT INTO ta_trace_logs (
                    id, request_id, trace_id, tool_name, status, duration_ms, source_refs_json, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (tid, str(request_id), str(trace_id), str(tool_name), str(status), int(duration_ms), _dump_json(refs), now),
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM ta_trace_logs WHERE id = ?", (tid,)).fetchone()
            assert row is not None
            return {
                "id": row["id"],
                "requestId": row["request_id"],
                "traceId": row["trace_id"],
                "toolName": row["tool_name"],
                "status": row["status"],
                "durationMs": int(row["duration_ms"]),
                "sourceRefs": _parse_json(row["source_refs_json"], []),
                "createdAt": row["created_at"],
            }

    def list_traces(self, limit: int = 50) -> list[dict[str, Any]]:
        lim = max(1, min(200, int(limit)))
        with self._lock:
            rows = self._conn.execute(
                "SELECT * FROM ta_trace_logs ORDER BY created_at DESC, id DESC LIMIT ?",
                (lim,),
            ).fetchall()
            return [
                {
                    "id": row["id"],
                    "requestId": row["request_id"],
                    "traceId": row["trace_id"],
                    "toolName": row["tool_name"],
                    "status": row["status"],
                    "durationMs": int(row["duration_ms"]),
                    "sourceRefs": _parse_json(row["source_refs_json"], []),
                    "createdAt": row["created_at"],
                }
                for row in rows
            ]
