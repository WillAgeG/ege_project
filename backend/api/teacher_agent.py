"""FastAPI роуты ИИ-помощника преподавателя вуза (Кейс №3 + курсы, расписание и чат группы)."""

from __future__ import annotations

from pathlib import Path
from typing import Any
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from ..config import Settings
from ..teacher_agent import (
    TeacherAgentConfig,
    TeacherAgentOrchestrator,
    TeacherAgentStore,
    TeacherAgentTools,
    seed_demo_stand,
    set_pdf_conflict,
    set_prompt_injection,
    set_schedule_outage,
)
from ..teacher_agent.seed import DEMO_OWNER_ID


class ChatRequest(BaseModel):
    message: str = Field(default="", max_length=8000)
    history: list[dict[str, Any]] = Field(default_factory=list)
    activeDraftId: str | None = None
    selectedCourse: str | None = None
    attachmentText: str | None = Field(default=None, max_length=25000)
    attachmentFilename: str | None = Field(default=None, max_length=255)
    forceLocal: bool = False


class DemoTogglesRequest(BaseModel):
    pdfConflict: bool | None = None
    promptInjection: bool | None = None
    scheduleOutage: bool | None = None


class CreateCourseRequest(BaseModel):
    courseId: str | None = Field(default=None, max_length=64)
    code: str = Field(..., min_length=1, max_length=32)
    title: str = Field(..., min_length=1, max_length=160)
    description: str = Field(default="", max_length=2000)
    groups: list[str] = Field(default_factory=list)
    templateSteps: list[dict[str, Any]] = Field(default_factory=list)


class UpdateCourseStepsRequest(BaseModel):
    steps: list[dict[str, Any]] = Field(default_factory=list)


class AddMaterialRequest(BaseModel):
    docTitle: str = Field(..., min_length=1, max_length=200)
    section: str = Field(..., min_length=1, max_length=120)
    title: str = Field(..., min_length=1, max_length=200)
    contentMd: str = Field(..., min_length=1, max_length=12000)
    deliverableFormat: str = Field(default="", max_length=240)
    deadline: str | None = Field(default=None, max_length=64)
    rubric: list[dict[str, Any]] = Field(default_factory=list)


class CreateLessonRequest(BaseModel):
    courseId: str = Field(..., min_length=1, max_length=64)
    groupName: str = Field(..., min_length=1, max_length=64)
    dateIso: str = Field(..., min_length=10, max_length=10)
    startTime: str = Field(..., min_length=4, max_length=8)
    endTime: str = Field(..., min_length=4, max_length=8)
    topic: str = Field(..., min_length=1, max_length=200)
    kind: str = Field(default="практика", max_length=64)
    room: str = Field(default="", max_length=120)


class RescheduleLessonRequest(BaseModel):
    dateIso: str = Field(..., min_length=10, max_length=10)
    startTime: str = Field(..., min_length=4, max_length=8)
    endTime: str = Field(..., min_length=4, max_length=8)
    room: str | None = Field(default=None, max_length=120)
    note: str = Field(default="", max_length=500)
    createAnnouncementDraft: bool = False


class CancelLessonRequest(BaseModel):
    note: str = Field(default="", max_length=500)
    createAnnouncementDraft: bool = False


class PatchDraftRequest(BaseModel):
    title: str | None = Field(default=None, max_length=240)
    contentMd: str | None = Field(default=None, max_length=20000)
    groupName: str | None = Field(default=None, max_length=64)
    plan: list[dict[str, Any]] | None = None
    criteria: list[dict[str, Any]] | None = None
    deadline: str | None = Field(default=None, max_length=64)
    clearDeadline: bool = False


class PublishDraftRequest(BaseModel):
    previewToken: str = Field(..., min_length=1, max_length=256)
    expectedVersion: int = Field(..., ge=1)


class GroupMessageRequest(BaseModel):
    body: str = Field(..., min_length=1, max_length=4000)
    senderRole: str = Field(default="teacher", max_length=32)
    senderName: str = Field(default="Преподаватель (демо)", max_length=120)


def _owner_for_request(request: Request) -> str:
    # В демо-режиме Кейса №3 используется изолированный владелец demo-teacher без реальных ПДн.
    return DEMO_OWNER_ID


def _components(
    request: Request,
) -> tuple[TeacherAgentStore, TeacherAgentTools, TeacherAgentOrchestrator, TeacherAgentConfig]:
    st = request.app.state
    store: TeacherAgentStore | None = getattr(st, "teacher_agent_store", None)
    tools: TeacherAgentTools | None = getattr(st, "teacher_agent_tools", None)
    orch: TeacherAgentOrchestrator | None = getattr(st, "teacher_agent", None)
    cfg: TeacherAgentConfig | None = getattr(st, "teacher_agent_config", None)
    if store is None or tools is None or orch is None or cfg is None:
        raise HTTPException(status_code=503, detail="Модуль ИИ-помощника преподавателя не инициализирован.")
    return store, tools, orch, cfg


def _build_state_payload(
    store: TeacherAgentStore,
    cfg: TeacherAgentConfig,
    owner_id: str,
) -> dict[str, Any]:
    return {
        "ok": True,
        "ownerId": owner_id,
        "standState": store.get_stand_state(),
        "courses": store.list_courses(owner_id=owner_id),
        "schedule": store.list_schedule(include_cancelled=True),
        "materials": store.list_materials(),
        "drafts": store.list_drafts(owner_id=owner_id),
        "publications": store.list_publications(),
        "presentations": store.list_presentations(),
        "groupMessages": store.list_group_messages(),
        "traces": store.list_traces(limit=50),
        "config": {
            "model": cfg.model,
            "baseUrl": cfg.base_url,
            "gigachatEnabled": cfg.enabled,
            "tzName": cfg.tz_name,
        },
    }


def _ics_escape(val: str) -> str:
    return (
        str(val or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def create_teacher_agent_router(settings: Settings) -> APIRouter:
    del settings
    router = APIRouter(prefix="/api/teacher-agent", tags=["teacher-agent"])

    @router.get("/state")
    async def get_state(request: Request) -> dict[str, Any]:
        store, _, _, cfg = _components(request)
        return _build_state_payload(store, cfg, _owner_for_request(request))

    @router.get("/usage")
    async def get_usage(request: Request) -> dict[str, Any]:
        _, _, orch, _ = _components(request)
        return await orch.check_usage()

    @router.post("/demo/reset")
    async def demo_reset(request: Request) -> dict[str, Any]:
        store, _, _, cfg = _components(request)
        summary = seed_demo_stand(
            store,
            reset=True,
            stand_now_iso=cfg.stand_now_iso,
            presentations_dir=cfg.presentations_dir,
        )
        payload = _build_state_payload(store, cfg, _owner_for_request(request))
        payload["resetSummary"] = summary
        return payload

    @router.post("/demo/toggles")
    async def demo_toggles(request: Request, body: DemoTogglesRequest) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        if body.pdfConflict is not None:
            set_pdf_conflict(store, bool(body.pdfConflict))
        if body.promptInjection is not None:
            set_prompt_injection(store, bool(body.promptInjection))
        if body.scheduleOutage is not None:
            set_schedule_outage(store, bool(body.scheduleOutage))
        return {
            "ok": True,
            "standState": store.get_stand_state(),
            "materials": store.list_materials(),
        }

    @router.post("/chat")
    async def agent_chat(request: Request, body: ChatRequest) -> dict[str, Any]:
        _, _, orch, _ = _components(request)
        owner_id = _owner_for_request(request)
        return await orch.handle_message(
            message=body.message,
            owner_id=owner_id,
            history=body.history,
            active_draft_id=body.activeDraftId,
            selected_course=body.selectedCourse,
            attachment_text=body.attachmentText,
            attachment_filename=body.attachmentFilename,
            force_local=body.forceLocal,
        )

    @router.post("/chat/upload")
    async def agent_chat_upload(
        request: Request,
        message: str = Form(default="Проверь домашнюю работу"),
        selected_course: str = Form(default=""),
        active_draft_id: str = Form(default=""),
        file: UploadFile = File(...),
    ) -> dict[str, Any]:
        _, _, orch, _ = _components(request)
        raw_bytes = await file.read(262_145)
        if len(raw_bytes) > 262_144:
            raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 256 КБ).")
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text = raw_bytes.decode("cp1251", errors="replace")

        return await orch.handle_message(
            message=message,
            owner_id=_owner_for_request(request),
            active_draft_id=active_draft_id.strip() or None,
            selected_course=selected_course.strip() or None,
            attachment_text=text,
            attachment_filename=file.filename or "submission.sql",
        )

    # ── Курсы и Stepik-шаблоны преподавателя ────────────────────────────────────

    @router.get("/courses")
    async def list_courses(request: Request) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        return {"ok": True, "courses": store.list_courses(owner_id=_owner_for_request(request))}

    @router.post("/courses")
    async def create_course(request: Request, body: CreateCourseRequest) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        owner_id = _owner_for_request(request)
        cid = (body.courseId or f"crs-{uuid.uuid4().hex[:6]}").strip().lower()
        if store.get_course(cid) is not None:
            raise HTTPException(status_code=409, detail=f"Курс с ID «{cid}» уже существует.")
        created = store.create_course(
            course_id=cid,
            code=body.code,
            title=body.title,
            description=body.description,
            groups=body.groups,
            owner_id=owner_id,
            template_steps=body.templateSteps,
        )
        return {"ok": True, "course": created}

    @router.put("/courses/{course_id}/steps")
    async def update_course_steps(
        request: Request,
        course_id: str,
        body: UpdateCourseStepsRequest,
    ) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        owner_id = _owner_for_request(request)
        try:
            updated = store.update_course_steps(course_id, owner_id, body.steps)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {"ok": True, "course": updated}

    @router.post("/courses/{course_id}/materials")
    async def add_course_material(
        request: Request,
        course_id: str,
        body: AddMaterialRequest,
    ) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        owner_id = _owner_for_request(request)
        try:
            store.check_course_access(owner_id, course_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        mat = store.add_material(
            course_id=course_id,
            doc_id=f"{course_id}-doc",
            doc_title=body.docTitle,
            section=body.section,
            title=body.title,
            content_md=body.contentMd,
            deliverable_format=body.deliverableFormat,
            deadline=body.deadline,
            rubric=body.rubric,
        )
        return {"ok": True, "material": mat}

    # ── Расписание пар и календарь .ics ─────────────────────────────────────────

    @router.get("/schedule")
    async def list_schedule(
        request: Request,
        date_from: str | None = None,
        date_to: str | None = None,
        course_id: str | None = None,
        group_name: str | None = None,
        include_cancelled: bool = True,
    ) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        lessons = store.list_schedule(
            date_from=date_from,
            date_to=date_to,
            course_id=course_id,
            group_name=group_name,
            include_cancelled=include_cancelled,
        )
        return {"ok": True, "lessons": lessons}

    @router.get("/schedule.ics")
    async def schedule_ics(request: Request) -> Response:
        store, _, _, cfg = _components(request)
        lessons = store.list_schedule(include_cancelled=False)
        lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//Vektor//University Teacher Schedule//RU",
            "CALSCALE:GREGORIAN",
            f"X-WR-TIMEZONE:{cfg.tz_name}",
        ]
        for l in lessons:
            d_clean = l["dateIso"].replace("-", "")
            s_clean = l["startTime"].replace(":", "") + "00"
            e_clean = l["endTime"].replace(":", "") + "00"
            summary = f"{l['courseTitle']} ({l['groupName']}) — {l['topic']}"
            lines.extend(
                [
                    "BEGIN:VEVENT",
                    f"UID:{l['id']}@vektor.teacher-agent",
                    f"DTSTART;TZID={cfg.tz_name}:{d_clean}T{s_clean}",
                    f"DTEND;TZID={cfg.tz_name}:{d_clean}T{e_clean}",
                    f"SUMMARY:{_ics_escape(summary)}",
                    f"LOCATION:{_ics_escape(l['room'])}",
                    f"DESCRIPTION:{_ics_escape(l['kind'])}",
                    "END:VEVENT",
                ]
            )
        lines.append("END:VCALENDAR")
        return Response(
            content="\r\n".join(lines) + "\r\n",
            media_type="text/calendar; charset=utf-8",
            headers={"Cache-Control": "no-cache"},
        )

    @router.post("/schedule")
    async def create_lesson(request: Request, body: CreateLessonRequest) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        try:
            lesson = store.create_lesson(
                course_id=body.courseId,
                group_name=body.groupName,
                date_iso=body.dateIso,
                start_time=body.startTime,
                end_time=body.endTime,
                topic=body.topic,
                kind=body.kind,
                room=body.room,
                owner_id=_owner_for_request(request),
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {"ok": True, "lesson": lesson}

    @router.post("/schedule/{lesson_id}/reschedule")
    async def reschedule_lesson(
        request: Request,
        lesson_id: str,
        body: RescheduleLessonRequest,
    ) -> dict[str, Any]:
        store, tools, _, _ = _components(request)
        owner_id = _owner_for_request(request)
        try:
            updated = store.reschedule_lesson(
                lesson_id,
                owner_id=owner_id,
                date_iso=body.dateIso,
                start_time=body.startTime,
                end_time=body.endTime,
                room=body.room,
                note=body.note,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        ann_draft = None
        if body.createAnnouncementDraft:
            res = tools.draft_schedule_change_announcement(
                owner_id=owner_id,
                lesson=updated,
                action="rescheduled",
                note=body.note,
            )
            ann_draft = res.get("draft")
        return {"ok": True, "lesson": updated, "announcementDraft": ann_draft}

    @router.post("/schedule/{lesson_id}/cancel")
    async def cancel_lesson(
        request: Request,
        lesson_id: str,
        body: CancelLessonRequest,
    ) -> dict[str, Any]:
        store, tools, _, _ = _components(request)
        owner_id = _owner_for_request(request)
        try:
            updated = store.cancel_lesson(lesson_id, owner_id=owner_id, note=body.note)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc

        ann_draft = None
        if body.createAnnouncementDraft:
            res = tools.draft_schedule_change_announcement(
                owner_id=owner_id,
                lesson=updated,
                action="cancelled",
                note=body.note,
            )
            ann_draft = res.get("draft")
        return {"ok": True, "lesson": updated, "announcementDraft": ann_draft}

    # ── Черновики, предпросмотр, подтверждённая публикация и PPTX ───────────────

    @router.get("/drafts")
    async def list_drafts(request: Request) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        return {"ok": True, "drafts": store.list_drafts(owner_id=_owner_for_request(request))}

    @router.get("/drafts/{draft_id}")
    async def get_draft(request: Request, draft_id: str) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        draft = store.get_draft(draft_id)
        if not draft:
            raise HTTPException(status_code=404, detail="Черновик не найден.")
        return {"ok": True, "draft": draft}

    @router.patch("/drafts/{draft_id}")
    async def patch_draft(request: Request, draft_id: str, body: PatchDraftRequest) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        try:
            updated = store.update_draft(
                draft_id,
                owner_id=_owner_for_request(request),
                title=body.title,
                content_md=body.contentMd,
                group_name=body.groupName,
                plan=body.plan,
                criteria=body.criteria,
                deadline=body.deadline,
                clear_deadline=body.clearDeadline,
            )
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {"ok": True, "draft": updated}

    @router.post("/drafts/{draft_id}/preview")
    async def preview_draft(request: Request, draft_id: str) -> dict[str, Any]:
        _, tools, _, _ = _components(request)
        res = tools.prepare_publish_preview(owner_id=_owner_for_request(request), draft_id=draft_id)
        if not res.get("ok"):
            if res.get("needsDeadline"):
                raise HTTPException(
                    status_code=400,
                    detail={"needsDeadline": True, "message": res.get("error", "Укажите дедлайн.")},
                )
            msg = str(res.get("error") or "")
            if "не найден" in msg.lower():
                raise HTTPException(status_code=404, detail=msg)
            if "прав" in msg.lower():
                raise HTTPException(status_code=403, detail=msg)
            raise HTTPException(status_code=400, detail=msg)
        return res

    @router.post("/drafts/{draft_id}/cancel")
    async def cancel_draft_preview(request: Request, draft_id: str) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        try:
            draft = store.cancel_preview(draft_id, _owner_for_request(request))
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        return {"ok": True, "draft": draft}

    @router.post("/drafts/{draft_id}/publish")
    async def publish_draft(request: Request, draft_id: str, body: PublishDraftRequest) -> dict[str, Any]:
        store, tools, _, _ = _components(request)
        if store.get_draft(draft_id) is None:
            raise HTTPException(status_code=404, detail="Черновик не найден.")
        res = tools.confirm_publish_with_course_sync(
            owner_id=_owner_for_request(request),
            draft_id=draft_id,
            preview_token=body.previewToken,
            expected_version=body.expectedVersion,
        )
        if not res.get("ok"):
            err = str(res.get("error") or "Не удалось опубликовать черновик.")
            if "прав" in err.lower() or "доступ" in err.lower():
                raise HTTPException(status_code=403, detail=err)
            raise HTTPException(status_code=409, detail=err)
        return res

    @router.get("/publications")
    async def list_publications(request: Request) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        return {"ok": True, "publications": store.list_publications()}

    @router.get("/presentations/{pres_id}/download")
    async def download_presentation(request: Request, pres_id: str) -> FileResponse:
        store, _, _, _ = _components(request)
        pres = store.get_presentation(pres_id)
        if not pres:
            raise HTTPException(status_code=404, detail="Презентация не найдена.")
        fpath = Path(pres["filePath"])
        if not fpath.is_file():
            raise HTTPException(status_code=404, detail="Файл презентации отсутствует на диске.")
        return FileResponse(
            fpath,
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            filename=pres["filename"],
            headers={"Cache-Control": "no-cache"},
        )

    # ── Чат группы и трассировка ───────────────────────────────────────────────

    @router.get("/groups/{course_id}/{group_name}/messages")
    async def get_group_messages(request: Request, course_id: str, group_name: str) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        return {
            "ok": True,
            "messages": store.list_group_messages(course_id=course_id, group_name=group_name),
        }

    @router.post("/groups/{course_id}/{group_name}/messages")
    async def post_group_message(
        request: Request,
        course_id: str,
        group_name: str,
        body: GroupMessageRequest,
    ) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        try:
            store.check_course_access(_owner_for_request(request), course_id)
        except LookupError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except PermissionError as exc:
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        msg = store.post_group_message(
            course_id=course_id,
            group_name=group_name,
            sender_role=body.senderRole,
            sender_name=body.senderName,
            body=body.body,
        )
        return {"ok": True, "message": msg}

    @router.get("/traces")
    async def list_traces(request: Request, limit: int = Query(default=50, ge=1, le=200)) -> dict[str, Any]:
        store, _, _, _ = _components(request)
        return {"ok": True, "traces": store.list_traces(limit=limit)}

    return router
