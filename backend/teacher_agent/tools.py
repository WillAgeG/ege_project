"""Набор серверных инструментов ИИ-агента преподавателя (Кейс №3)."""

from __future__ import annotations

from datetime import datetime, timedelta
import json
import time
from typing import Any, Callable
from zoneinfo import ZoneInfo

from .config import TeacherAgentConfig
from .pptx_export import build_presentation_pptx
from .sql_review import analyze_submission
from .store import TeacherAgentStore

# ВАЖНО (защита от prompt injection, Сценарий 8 ТЗ):
# В схеме инструментов для LLM намеренно ОТСУТСТВУЕТ confirm_publish / publish!
# Модель может только подготовить черновик и предпросмотр.
OPENAI_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "get_schedule",
            "description": (
                "Получить расписание занятий преподавателя. Все фильтры опциональны: при вопросах "
                "«Что у меня сегодня?» или «Какие пары?» сразу вызывай get_schedule(period='today') без уточнения курса и группы."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "tomorrow", "week", "next", "all"],
                        "description": "Период расписания: today (сегодня), tomorrow (завтра), week (неделя), next (ближайшее), all.",
                    },
                    "date_iso": {
                        "type": "string",
                        "description": "Опциональная точная дата YYYY-MM-DD.",
                    },
                    "course": {
                        "type": "string",
                        "description": "Фильтр по названию или ID курса.",
                    },
                    "group": {
                        "type": "string",
                        "description": "Фильтр по учебной группе (например ИС-21, ПИ-22).",
                    },
                },
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_course",
            "description": "Поиск по методическим материалам доступных курсов со ссылками на документ и раздел.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Поисковый запрос (тема, JOIN, Практика 4 и т.п.)."},
                    "course": {"type": "string", "description": "ID или название курса (если уже уточнён)."},
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "save_draft",
            "description": "Создать или обновить редактируемый черновик плана занятия, домашнего задания или объявления (НЕ публикует).",
            "parameters": {
                "type": "object",
                "properties": {
                    "draft_id": {"type": "string"},
                    "kind": {"type": "string", "enum": ["lesson_plan", "homework", "announcement", "review"]},
                    "course_id": {"type": "string"},
                    "group_name": {"type": "string"},
                    "title": {"type": "string"},
                    "content_md": {"type": "string"},
                    "deadline": {"type": "string"},
                },
                "required": ["kind", "course_id", "group_name", "title", "content_md"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "prepare_publish_preview",
            "description": "Сформировать предпросмотр публикации (курс, группа, текст, срок) и токен подтверждения для преподавателя.",
            "parameters": {
                "type": "object",
                "properties": {
                    "draft_id": {"type": "string"},
                },
                "required": ["draft_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "export_presentation",
            "description": "Собрать редактируемую презентацию PPTX по плану и материалам курса со ссылками на источники.",
            "parameters": {
                "type": "object",
                "properties": {
                    "course_id": {"type": "string"},
                    "group_name": {"type": "string"},
                    "topic": {"type": "string"},
                    "draft_id": {"type": "string"},
                },
                "required": ["course_id", "group_name", "topic"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "review_submission",
            "description": "Проверить сданную работу студента (текст или .sql) по критериям курса и сохранить черновик отзыва.",
            "parameters": {
                "type": "object",
                "properties": {
                    "course_id": {"type": "string"},
                    "assignment_query": {"type": "string"},
                    "submission_text": {"type": "string"},
                    "filename": {"type": "string"},
                    "group_name": {"type": "string"},
                },
                "required": ["course_id", "assignment_query", "submission_text"],
            },
        },
    },
]

_LLM_ALLOWED_TOOL_NAMES = frozenset(t["function"]["name"] for t in OPENAI_TOOL_SCHEMAS)


class TeacherAgentTools:
    """Серверная реализация инструментов ИИ-агента с проверкой прав, трассировкой и защитой публикации."""

    def __init__(self, store: TeacherAgentStore, config: TeacherAgentConfig) -> None:
        self.store = store
        self.config = config

    def _stand_now(self) -> datetime:
        state = self.store.get_stand_state()
        raw_iso = state.get("stand_now_iso") or self.config.stand_now_iso
        try:
            dt = datetime.fromisoformat(raw_iso)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=ZoneInfo(self.config.tz_name))
            return dt.astimezone(ZoneInfo(self.config.tz_name))
        except ValueError:
            return datetime.fromisoformat("2026-12-02T08:00:00+09:00")

    def _resolve_course(self, owner_id: str, course_ref: str) -> dict[str, Any] | None:
        needle = (course_ref or "").strip().lower()
        if not needle:
            return None
        for c in self.store.list_courses(owner_id=owner_id):
            if (
                c["id"].lower() == needle
                or c["code"].lower() == needle
                or needle in c["title"].lower()
            ):
                return c
        return None

    def _require_resolved_course(self, owner_id: str, course_ref: str) -> dict[str, Any]:
        direct = self.store.get_course(course_ref)
        if direct:
            return self.store.check_course_access(owner_id, direct["id"])
        resolved = self._resolve_course(owner_id, course_ref)
        if resolved:
            return self.store.check_course_access(owner_id, resolved["id"])
        raise LookupError(f"Курс «{course_ref}» не найден или недоступен.")

    def _traced(
        self,
        *,
        tool_name: str,
        request_id: str,
        trace_id: str,
        fn: Callable[[], tuple[dict[str, Any], str, list[str]]],
    ) -> dict[str, Any]:
        t0 = time.monotonic()
        try:
            payload, status, source_refs = fn()
        except Exception as exc:
            ms = max(1, int(round((time.monotonic() - t0) * 1000)))
            self.store.record_trace(
                request_id=request_id,
                trace_id=trace_id,
                tool_name=tool_name,
                status="error",
                duration_ms=ms,
            )
            return {"ok": False, "error": str(exc)}
        ms = max(1, int(round((time.monotonic() - t0) * 1000)))
        self.store.record_trace(
            request_id=request_id,
            trace_id=trace_id,
            tool_name=tool_name,
            status=status,
            duration_ms=ms,
            source_refs=source_refs,
        )
        return payload

    def get_schedule(
        self,
        *,
        owner_id: str,
        period: str = "today",
        date_iso: str | None = None,
        course: str | None = None,
        group: str | None = None,
        request_id: str = "req-local",
        trace_id: str = "trace-local",
    ) -> dict[str, Any]:
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            state = self.store.get_stand_state()
            if state.get("schedule_outage") == "1":
                return (
                    {
                        "ok": False,
                        "outage": True,
                        "error": "Источник расписания временно недоступен. Попробуйте повторить запрос позже.",
                    },
                    "outage",
                    [],
                )

            now_dt = self._stand_now()
            today_iso = now_dt.date().isoformat()
            d_from: str | None = None
            d_to: str | None = None
            per = (period or "today").strip().lower()

            if date_iso:
                d_from = date_iso.strip()
                d_to = date_iso.strip()
            elif per == "today":
                d_from = today_iso
                d_to = today_iso
            elif per == "tomorrow":
                tmr = (now_dt.date() + timedelta(days=1)).isoformat()
                d_from = tmr
                d_to = tmr
            elif per == "week":
                d_from = today_iso
                d_to = (now_dt.date() + timedelta(days=6)).isoformat()
            elif per == "next":
                d_from = today_iso

            owned_ids = {c["id"] for c in self.store.list_courses(owner_id=owner_id)}
            course_id = None
            if course:
                resolved = self._resolve_course(owner_id, course)
                if not resolved:
                    return (
                        {
                            "ok": True,
                            "standNowIso": now_dt.isoformat(),
                            "period": per,
                            "lessons": [],
                            "empty": True,
                            "message": f"Курс «{course}» не найден среди доступных курсов преподавателя.",
                        },
                        "empty",
                        [],
                    )
                course_id = resolved["id"]

            lessons = self.store.list_schedule(
                date_from=d_from,
                date_to=d_to,
                course_id=course_id,
                group_name=group,
                include_cancelled=True,
            )
            lessons = [l for l in lessons if l["courseId"] in owned_ids]

            if per == "next" and lessons:
                now_hhmm = now_dt.strftime("%H:%M")
                upcoming = [
                    l
                    for l in lessons
                    if l["status"] != "cancelled" and (l["dateIso"] > today_iso or l["startTime"] >= now_hhmm)
                ]
                lessons = upcoming[:1] if upcoming else lessons[:1]

            refs = [f"schedule:{l['id']}" for l in lessons]
            if not lessons:
                return (
                    {
                        "ok": True,
                        "standNowIso": now_dt.isoformat(),
                        "period": per,
                        "lessons": [],
                        "empty": True,
                        "message": "В расписании на выбранный период и фильтры занятий не найдено.",
                    },
                    "empty",
                    refs,
                )

            return (
                {
                    "ok": True,
                    "standNowIso": now_dt.isoformat(),
                    "period": per,
                    "lessons": lessons,
                    "empty": False,
                    "message": f"Найдено занятий: {len(lessons)}.",
                },
                "ok",
                refs,
            )

        return self._traced(tool_name="get_schedule", request_id=request_id, trace_id=trace_id, fn=_run)

    def search_course(
        self,
        *,
        owner_id: str,
        query: str,
        course: str | None = None,
        request_id: str = "req-local",
        trace_id: str = "trace-local",
    ) -> dict[str, Any]:
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            owned_courses = self.store.list_courses(owner_id=owner_id)
            owned_by_id = {c["id"]: c for c in owned_courses}
            course_id = None
            if course:
                resolved = self._resolve_course(owner_id, course)
                if not resolved:
                    return (
                        {"ok": False, "error": f"Курс «{course}» не найден или недоступен."},
                        "forbidden_or_missing",
                        [],
                    )
                course_id = resolved["id"]

            raw_matches = self.store.search_materials(
                query,
                course_id=course_id,
                allowed_course_ids=set(owned_by_id.keys()),
            )
            injections = [m for m in raw_matches if m.get("isInjectionDoc")]
            clean_matches = [m for m in raw_matches if not m.get("isInjectionDoc")]

            refs = [f"{m['docId']}#{m['section']}" for m in clean_matches]
            distinct_courses = []
            seen_cid: set[str] = set()
            for m in clean_matches:
                if m["courseId"] not in seen_cid:
                    seen_cid.add(m["courseId"])
                    distinct_courses.append(
                        {"courseId": m["courseId"], "courseTitle": owned_by_id[m["courseId"]]["title"]}
                    )

            needs_clarification = bool(course_id is None and len(distinct_courses) >= 2)
            has_conflict = any(m.get("isConflictDoc") for m in clean_matches)
            if has_conflict:
                base_sections = {
                    m["section"].split("·")[0].strip().lower()
                    for m in clean_matches
                    if m.get("isConflictDoc")
                }
                conflict_items = [
                    m
                    for m in clean_matches
                    if m.get("isConflictDoc") or m["section"].split("·")[0].strip().lower() in base_sections
                ]
                conflict_sources = [
                    {
                        "courseId": m["courseId"],
                        "docId": m["docId"],
                        "docTitle": m["docTitle"],
                        "section": m["section"],
                        "deliverableFormat": m["deliverableFormat"],
                    }
                    for m in conflict_items
                ]
            else:
                conflict_sources = []
            missing_fields = (
                ["deadline"]
                if clean_matches and all(not (m.get("deadline") or "").strip() for m in clean_matches)
                else []
            )

            formatted = [
                {
                    "id": m["id"],
                    "courseId": m["courseId"],
                    "courseTitle": owned_by_id[m["courseId"]]["title"],
                    "docId": m["docId"],
                    "docTitle": m["docTitle"],
                    "section": m["section"],
                    "title": m["title"],
                    "excerpt": m["contentMd"],
                    "deliverableFormat": m["deliverableFormat"],
                    "deadline": m["deadline"],
                    "rubric": m["rubric"],
                    "isConflictDoc": m["isConflictDoc"],
                    "sourceRef": f"{m['docTitle']} — {m['section']}",
                }
                for m in clean_matches
            ]

            status = "conflict" if has_conflict else ("empty" if not formatted else "ok")
            return (
                {
                    "ok": True,
                    "matches": formatted,
                    "needsClarification": needs_clarification,
                    "courseChoices": distinct_courses if needs_clarification else [],
                    "hasConflict": has_conflict,
                    "conflictSources": conflict_sources,
                    "missingFields": missing_fields,
                    "quarantinedInjectionsCount": len(injections),
                },
                status,
                refs,
            )

        return self._traced(tool_name="search_course", request_id=request_id, trace_id=trace_id, fn=_run)

    def save_draft(
        self,
        *,
        owner_id: str,
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
        draft_id: str | None = None,
        target_duration_min: int | None = None,
        request_id: str = "req-local",
        trace_id: str = "trace-local",
    ) -> dict[str, Any]:
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            if kind not in {"lesson_plan", "homework", "announcement", "review"}:
                raise ValueError(f"Неподдерживаемый тип черновика: {kind}")

            resolved_course = self._require_resolved_course(owner_id, course_id)
            cid = resolved_course["id"]
            plan_list = list(plan)
            total_min = sum(int(p.get("minutes") or 0) for p in plan_list) if plan_list else None
            if target_duration_min is not None and total_min is not None and total_min != int(target_duration_min):
                raise ValueError(
                    f"Суммарная длительность этапов плана ({total_min} мин) должна совпадать с длительностью пары ({target_duration_min} мин)."
                )

            if draft_id:
                draft = self.store.update_draft(
                    draft_id,
                    owner_id=owner_id,
                    title=title,
                    content_md=content_md,
                    group_name=group_name,
                    plan=plan_list if plan is not None else None,
                    criteria=list(criteria) if criteria is not None else None,
                    deadline=deadline,
                )
            else:
                draft = self.store.create_draft(
                    kind=kind,
                    course_id=cid,
                    group_name=group_name,
                    title=title,
                    content_md=content_md,
                    plan=plan_list,
                    criteria=list(criteria),
                    proposals=list(proposals),
                    sources=list(sources),
                    deadline=deadline,
                    owner_id=owner_id,
                )
            refs = [f"{s.get('docId', cid)}#{s.get('section', '')}" for s in draft.get("sources") or []]
            refs.append(f"draft:{draft['id']}@v{draft['version']}")
            return (
                {"ok": True, "draft": draft, "totalPlanMinutes": total_min},
                "ok",
                refs,
            )

        return self._traced(tool_name="save_draft", request_id=request_id, trace_id=trace_id, fn=_run)

    def prepare_publish_preview(
        self,
        *,
        owner_id: str,
        draft_id: str,
        request_id: str = "req-local",
        trace_id: str = "trace-local",
    ) -> dict[str, Any]:
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            try:
                preview = self.store.prepare_preview(draft_id, owner_id)
            except ValueError as exc:
                msg = str(exc)
                if "дедлайн" in msg.lower():
                    return (
                        {"ok": False, "needsDeadline": True, "error": msg},
                        "needs_deadline",
                        [f"draft:{draft_id}"],
                    )
                raise
            return (
                {"ok": True, "preview": preview, "requiresTeacherConfirmation": True},
                "ok",
                [f"draft:{draft_id}@v{preview['version']}"],
            )

        return self._traced(tool_name="prepare_publish_preview", request_id=request_id, trace_id=trace_id, fn=_run)

    def export_presentation(
        self,
        *,
        owner_id: str,
        course_id: str,
        group_name: str,
        topic: str,
        draft_id: str | None = None,
        slides_spec: list[dict[str, Any]] | None = None,
        request_id: str = "req-local",
        trace_id: str = "trace-local",
    ) -> dict[str, Any]:
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            course = self._require_resolved_course(owner_id, course_id)
            cid = course["id"]
            materials = self.store.search_materials(topic, course_id=cid, allowed_course_ids={cid})
            if not materials:
                materials = self.store.list_materials(course_id=cid)
            draft = self.store.get_draft(draft_id) if draft_id else None
            lessons = self.store.list_schedule(course_id=cid, group_name=group_name)
            lesson = lessons[0] if lessons else None

            pres = build_presentation_pptx(
                store=self.store,
                presentations_dir=self.config.presentations_dir,
                course=course,
                group_name=group_name,
                topic=topic,
                lesson=lesson,
                materials=materials,
                draft=draft,
                slides_spec=slides_spec,
            )
            refs = [f"{s['docId']}#{s['section']}" for s in pres["sources"]]
            refs.append(f"presentation:{pres['presentationId']}")
            return ({"ok": True, "presentation": pres}, "ok", refs)

        return self._traced(tool_name="export_presentation", request_id=request_id, trace_id=trace_id, fn=_run)

    def review_submission(
        self,
        *,
        owner_id: str,
        course_id: str,
        assignment_query: str,
        submission_text: str,
        filename: str | None = None,
        group_name: str = "",
        request_id: str = "req-local",
        trace_id: str = "trace-local",
    ) -> dict[str, Any]:
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            course = self._require_resolved_course(owner_id, course_id)
            cid = course["id"]
            clean_mats = [
                m
                for m in self.store.search_materials(
                    assignment_query, course_id=cid, allowed_course_ids={cid}
                )
                if not m.get("isInjectionDoc") and not m.get("isConflictDoc")
            ]
            if not clean_mats or not clean_mats[0].get("rubric"):
                return (
                    {
                        "ok": False,
                        "needsRubric": True,
                        "error": f"Не найдены задание или критерии оценивания по запросу «{assignment_query}» в курсе «{course['title']}». Уточните задание или шкалу.",
                    },
                    "needs_rubric",
                    [],
                )

            mat = clean_mats[0]
            review = analyze_submission(material=mat, submission_text=submission_text, filename=filename)
            target_group = group_name.strip() or (course["groups"][0] if course["groups"] else "Группа")
            sources = [{"docId": mat["docId"], "docTitle": mat["docTitle"], "section": mat["section"], "title": mat["title"]}]
            draft = self.store.create_draft(
                kind="review",
                course_id=cid,
                group_name=target_group,
                title=f"Отзыв: {mat['section']} ({filename or 'ответ студента'})",
                content_md=review["contentMd"],
                criteria=review["criteriaBreakdown"],
                sources=sources,
                owner_id=owner_id,
            )
            refs = [f"{mat['docId']}#{mat['section']}", f"draft:{draft['id']}@v{draft['version']}"]
            return (
                {
                    "ok": True,
                    "draft": draft,
                    "criteriaBreakdown": review["criteriaBreakdown"],
                    "suggestedScore": review["suggestedScore"],
                    "maxScore": review["maxScore"],
                    "sources": sources,
                },
                "ok",
                refs,
            )

        return self._traced(tool_name="review_submission", request_id=request_id, trace_id=trace_id, fn=_run)

    def confirm_publish_with_course_sync(
        self,
        *,
        owner_id: str,
        draft_id: str,
        preview_token: str,
        expected_version: int,
        request_id: str = "req-publish",
        trace_id: str = "trace-publish",
    ) -> dict[str, Any]:
        """Подтверждённая преподавателем публикация: журнал + курс (Stepik-шаг) + чат группы."""
        def _run() -> tuple[dict[str, Any], str, list[str]]:
            pub, was_duplicate = self.store.confirm_publish(
                draft_id,
                owner_id=owner_id,
                preview_token=preview_token,
                expected_version=expected_version,
            )
            course_step_added = False
            if pub["kind"] == "homework" and not was_duplicate:
                course = self.store.get_course(pub["courseId"])
                if course:
                    steps = list(course.get("templateSteps") or [])
                    step_id = f"hw-{pub['id']}"
                    if not any(s.get("id") == step_id for s in steps):
                        steps.append(
                            {
                                "id": step_id,
                                "kind": "homework",
                                "publicationId": pub["id"],
                                "badge": f"ДЗ · {pub['groupName']}",
                                "title": pub["title"],
                                "deadline": pub["deadline"],
                                "contentMd": pub["contentMd"],
                            }
                        )
                        self.store.update_course_steps(course["id"], owner_id, steps)
                        course_step_added = True

            return (
                {
                    "ok": True,
                    "publication": pub,
                    "wasDuplicate": was_duplicate,
                    "courseStepAdded": course_step_added,
                },
                "duplicate" if was_duplicate else "ok",
                [f"publication:{pub['id']}", f"draft:{draft_id}@v{expected_version}"],
            )

        return self._traced(tool_name="publish_confirmed", request_id=request_id, trace_id=trace_id, fn=_run)

    def draft_schedule_change_announcement(
        self,
        *,
        owner_id: str,
        lesson: dict[str, Any],
        action: str,
        note: str = "",
        request_id: str = "req-sched",
        trace_id: str = "trace-sched",
    ) -> dict[str, Any]:
        """Создаёт редактируемый черновик объявления при отмене/переносе пары (не публикует без подтверждения)."""
        if action == "cancelled":
            title = f"Отмена занятия: {lesson['topic']} ({lesson['dateIso']})"
            body = (
                f"Уважаемая группа {lesson['groupName']}! Занятие по курсу «{lesson['courseTitle']}» "
                f"({lesson['topic']}, {lesson['dateIso']} в {lesson['startTime']}) отменено."
                + (f"\nКомментарий: {note}" if note else "")
            )
        else:
            title = f"Перенос занятия: {lesson['topic']} -> {lesson['dateIso']} {lesson['startTime']}"
            body = (
                f"Уважаемая группа {lesson['groupName']}! Занятие по курсу «{lesson['courseTitle']}» "
                f"({lesson['topic']}) перенесено на {lesson['dateIso']} с {lesson['startTime']} до {lesson['endTime']} "
                f"({lesson['room']})."
                + (f"\nКомментарий: {note}" if note else "")
            )

        return self.save_draft(
            owner_id=owner_id,
            kind="announcement",
            course_id=lesson["courseId"],
            group_name=lesson["groupName"],
            title=title,
            content_md=body,
            deadline=lesson["dateIso"],
            sources=[{"docId": "schedule", "docTitle": "Расписание преподавателя", "section": lesson["id"]}],
            request_id=request_id,
            trace_id=trace_id,
        )

    def dispatch_tool(
        self,
        name: str,
        arguments: str | dict[str, Any],
        *,
        owner_id: str,
        request_id: str,
        trace_id: str,
    ) -> dict[str, Any]:
        """Единая безопасная точка вызова инструментов из LLM loop."""
        if name not in _LLM_ALLOWED_TOOL_NAMES:
            self.store.record_trace(
                request_id=request_id,
                trace_id=trace_id,
                tool_name=str(name),
                status="blocked",
                duration_ms=1,
            )
            return {"ok": False, "error": f"Инструмент «{name}» не разрешён для прямого вызова моделью."}

        if isinstance(arguments, str):
            try:
                args = json.loads(arguments) if arguments.strip() else {}
            except ValueError:
                return {"ok": False, "error": "Некорректный JSON аргументов инструмента."}
        else:
            args = dict(arguments or {})

        if name == "get_schedule":
            return self.get_schedule(
                owner_id=owner_id,
                period=str(args.get("period") or "today"),
                date_iso=args.get("date_iso"),
                course=args.get("course"),
                group=args.get("group"),
                request_id=request_id,
                trace_id=trace_id,
            )
        if name == "search_course":
            return self.search_course(
                owner_id=owner_id,
                query=str(args.get("query") or ""),
                course=args.get("course"),
                request_id=request_id,
                trace_id=trace_id,
            )
        if name == "save_draft":
            return self.save_draft(
                owner_id=owner_id,
                draft_id=args.get("draft_id"),
                kind=str(args.get("kind") or "homework"),
                course_id=str(args.get("course_id") or ""),
                group_name=str(args.get("group_name") or ""),
                title=str(args.get("title") or ""),
                content_md=str(args.get("content_md") or ""),
                deadline=args.get("deadline"),
                request_id=request_id,
                trace_id=trace_id,
            )
        if name == "prepare_publish_preview":
            return self.prepare_publish_preview(
                owner_id=owner_id,
                draft_id=str(args.get("draft_id") or ""),
                request_id=request_id,
                trace_id=trace_id,
            )
        if name == "export_presentation":
            return self.export_presentation(
                owner_id=owner_id,
                course_id=str(args.get("course_id") or ""),
                group_name=str(args.get("group_name") or ""),
                topic=str(args.get("topic") or ""),
                draft_id=args.get("draft_id"),
                request_id=request_id,
                trace_id=trace_id,
            )
        return self.review_submission(
            owner_id=owner_id,
            course_id=str(args.get("course_id") or ""),
            assignment_query=str(args.get("assignment_query") or ""),
            submission_text=str(args.get("submission_text") or ""),
            filename=args.get("filename"),
            group_name=str(args.get("group_name") or ""),
            request_id=request_id,
            trace_id=trace_id,
        )
