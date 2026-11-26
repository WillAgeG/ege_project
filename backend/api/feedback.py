"""Headless API роуты обратной связи («Сообщить о баге» и «Сотрудничество») с вложениями до 20 МБ."""

from __future__ import annotations

import json
from typing import Any
from urllib.parse import quote
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ..config import Settings
from ..media_storage import MediaValidationError, detect_and_validate_media
from .admin import _clamp_limit, _require_admin
from .auth_docs import RateLimiter, client_ip, current_user
from .media import _sanitize_filename, _storage_from


class FeedbackReviewIn(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    reviewNote: str = Field(default="", max_length=1000)


def _parse_context(raw: str | None) -> dict[str, Any]:
    txt = str(raw or "").strip()
    if not txt:
        return {}
    try:
        parsed = json.loads(txt)
    except Exception:
        return {}
    if not isinstance(parsed, dict):
        return {}
    cleaned: dict[str, Any] = {}
    for k, v in list(parsed.items())[:24]:
        key = str(k or "").strip()[:64]
        if not key:
            continue
        if isinstance(v, (str, int, float, bool)) or v is None:
            cleaned[key] = v[:400] if isinstance(v, str) else v
        else:
            cleaned[key] = str(v)[:400]
    return cleaned


def _format_mb(max_bytes: int) -> str:
    mb = max_bytes / (1024 * 1024)
    return f"{round(mb, 1):g}"


def create_feedback_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.post("/api/feedback")
    async def submit_feedback(
        request: Request,
        kind: str = Form("bug"),
        subject: str = Form(""),
        message: str = Form(...),
        contact: str = Form(""),
        author_name: str = Form(""),
        page_url: str = Form(""),
        context_json: str = Form("{}"),
        files: list[UploadFile] = File(default=[]),
    ) -> dict[str, Any]:
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is None:
            limiter = RateLimiter(db_getter=lambda: getattr(request.app.state, "db", None))
            request.app.state.limiter = limiter
        limiter.check(f"feedback:ip:{client_ip(request)}", limit=10, window_sec=900)

        clean_kind = str(kind or "bug").strip().lower()
        if clean_kind not in ("bug", "cooperation"):
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_kind", "message": "Допустимые типы обращения: bug, cooperation."},
            )
        clean_message = str(message or "").strip()[:4000]
        if len(clean_message) < 3:
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_message", "message": "Опишите обращение подробнее (минимум 3 символа)."},
            )
        clean_contact = str(contact or "").strip()[:160]
        if clean_kind == "cooperation" and len(clean_contact) < 3:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "invalid_contact",
                    "message": "Укажите Telegram, телефон или email для обратной связи.",
                },
            )

        user = current_user(request, settings)
        clean_author = str(author_name or "").strip()[:120]
        if not clean_author and user is not None:
            clean_author = str(user.display_name or user.username or "").strip()[:120]
        if not clean_contact and user is not None:
            fallback_contact = str(getattr(user, "phone", "") or getattr(user, "email", "") or "").strip()
            if fallback_contact:
                clean_contact = fallback_contact[:160]

        max_bytes = int(settings.media.max_feedback_bytes)
        max_files = int(settings.media.max_feedback_files)
        limit_mb = _format_mb(max_bytes)

        validated_files: list[tuple[bytes, str, str, str]] = []
        total_bytes = 0
        for up in files or []:
            data = await up.read(max_bytes + 1)
            raw_fname = str(up.filename or "").strip()
            if not raw_fname and len(data) == 0:
                continue
            if len(validated_files) >= max_files:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "too_many_files",
                        "message": f"Можно прикрепить не более {max_files} файлов к одному обращению.",
                    },
                )
            if len(data) > max_bytes or (total_bytes + len(data)) > max_bytes:
                raise MediaValidationError(
                    "file_too_large",
                    f"Максимальный размер вложений — {limit_mb} МБ.",
                    413,
                )
            mime, ext = detect_and_validate_media(
                data,
                allow_pdf=True,
                max_bytes=max_bytes,
            )
            total_bytes += len(data)
            validated_files.append((data, mime, ext, _sanitize_filename(raw_fname, ext)))

        ticket_id = f"fb-{uuid.uuid4().hex[:10]}"
        uid = int(user.id) if user is not None else None
        asset_ids: list[str] = []
        if validated_files:
            storage = _storage_from(request, settings)
            bucket = settings.media.s3_bucket_diplomas
            for data, mime, ext, clean_name in validated_files:
                asset_id = f"med-{uuid.uuid4().hex[:14]}"
                object_key = f"feedback/{ticket_id}/{asset_id}.{ext}"
                put_info = await storage.put_object(bucket, object_key, data, mime)
                request.app.state.db.create_media_asset(
                    asset_id=asset_id,
                    user_id=uid,
                    kind="feedback",
                    storage_driver=put_info["driver"],
                    bucket=bucket,
                    object_key=object_key,
                    content_type=mime,
                    size_bytes=put_info["sizeBytes"],
                    sha256=put_info["sha256"],
                    original_filename=clean_name,
                    public_url=None,
                )
                asset_ids.append(asset_id)

        clean_subject = str(subject or "").strip()[:200] or (
            "Сотрудничество с Вектор" if clean_kind == "cooperation" else "Баг на сайте Вектор"
        )
        ticket = request.app.state.db.create_feedback_ticket(
            {
                "kind": clean_kind,
                "subject": clean_subject,
                "message": clean_message,
                "contact": clean_contact,
                "authorName": clean_author,
                "pageUrl": str(page_url or "").strip()[:500],
                "context": _parse_context(context_json),
            },
            user_id=uid,
            asset_ids=asset_ids,
            ticket_id=ticket_id,
        )

        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            try:
                rt.publish(
                    request.app.state.db,
                    channel="all",
                    event_type="feedback.ticket.submitted",
                    title="Новое обращение в поддержку"
                    if clean_kind == "bug"
                    else "Новое предложение о сотрудничестве",
                    message=f"{ticket['id']} · {clean_subject}",
                    payload={
                        "ticketId": ticket["id"],
                        "kind": clean_kind,
                        "attachmentsCount": ticket.get("attachmentsCount", 0),
                    },
                )
            except Exception:
                pass

        tg = getattr(request.app.state, "telegram", None)
        if tg is not None:
            try:
                badge = "🐞 Новый баг-репорт" if clean_kind == "bug" else "🤝 Заявка на сотрудничество"
                snippet = clean_message[:300] + ("…" if len(clean_message) > 300 else "")
                att_names = ", ".join(
                    str(a.get("originalFilename") or "") for a in ticket.get("attachments") or []
                )
                lines = [
                    f"Тикет: {ticket['id']}",
                    f"Тема: {clean_subject}",
                ]
                if clean_author:
                    lines.append(f"От: {clean_author}")
                if clean_contact:
                    lines.append(f"Контакт: {clean_contact}")
                if ticket.get("attachmentsCount"):
                    lines.append(f"Вложения ({ticket['attachmentsCount']}): {att_names}")
                lines.append(f"Текст: {snippet}")
                await tg.notify_admin_alert(badge, "\n".join(lines))
            except Exception:
                pass

        return {"ok": True, "ticket": ticket}

    @router.get("/api/admin/feedback")
    async def admin_list_feedback(
        request: Request,
        kind: str = "all",
        status: str = "all",
        limit: int = 200,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        items = request.app.state.db.admin_list_feedback_tickets(
            kind=kind,
            status=status,
            limit=_clamp_limit(limit, default=200),
        )
        return {"ok": True, "tickets": items}

    @router.post("/api/admin/feedback/{ticket_id}/review")
    async def admin_review_feedback(
        ticket_id: str,
        payload: FeedbackReviewIn,
        request: Request,
    ) -> dict[str, Any]:
        reviewer = _require_admin(request, settings)
        updated = request.app.state.db.admin_review_feedback_ticket(
            ticket_id,
            status=payload.status,
            review_note=payload.reviewNote,
            reviewed_by=reviewer,
        )
        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            try:
                rt.publish(
                    request.app.state.db,
                    channel="all",
                    event_type=f"admin.feedback.{updated['status']}",
                    title="Статус обращения обновлён",
                    message=f"{updated['id']} · {updated['status']}",
                    payload={"ticketId": updated["id"], "status": updated["status"]},
                )
            except Exception:
                pass
        return {"ok": True, "ticket": updated}

    @router.get("/api/admin/feedback/{ticket_id}/files/{asset_id}")
    async def admin_get_feedback_file(
        ticket_id: str,
        asset_id: str,
        request: Request,
        redirect: bool | None = None,
    ) -> Response:
        _require_admin(request, settings)
        asset = request.app.state.db.get_feedback_attachment_asset(ticket_id, asset_id)
        if not asset:
            raise HTTPException(
                status_code=404,
                detail={"code": "attachment_not_found", "message": "Вложение обращения не найдено."},
            )
        storage = _storage_from(request, settings)
        want_redirect = settings.media.private_presign_redirect if redirect is None else bool(redirect)
        if want_redirect:
            presigned = storage.presign_get_url(asset["bucket"], asset["objectKey"])
            if isinstance(presigned, str) and presigned.startswith(("http://", "https://")):
                return RedirectResponse(
                    url=presigned,
                    status_code=307,
                    headers={
                        "Cache-Control": "private, no-store",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
        raw = await storage.get_object(asset["bucket"], asset["objectKey"])
        fname = quote(str(asset.get("originalFilename") or f"{asset_id}.bin"))
        return Response(
            content=raw,
            media_type=asset["contentType"],
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f"inline; filename*=UTF-8''{fname}",
            },
        )

    return router
