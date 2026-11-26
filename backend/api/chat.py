"""Headless API роуты мини-мессенджера и диалогов «Общение» (/api/chats/*) с вложениями до 20 МБ."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote
import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field, ValidationError

from ..config import Settings
from ..media_storage import MediaValidationError, detect_and_validate_chat_file
from ..otp_delivery import OtpDeliveryService
from .auth_docs import RateLimiter, require_user
from .media import _sanitize_filename, _storage_from


class ChatMessageCreatePayload(BaseModel):
    body: str = Field(default="", max_length=2000)
    bookingId: str | None = Field(default=None, max_length=64)
    tutorId: str = Field(default="", max_length=64)
    role: str | None = Field(default=None, max_length=16)


class ChatRemindLessonPayload(BaseModel):
    body: str = Field(default="", max_length=1000)
    slotLabel: str = Field(default="", max_length=120)
    bookingId: str | None = Field(default=None, max_length=64)
    tutorId: str = Field(default="", max_length=64)
    role: str | None = Field(default=None, max_length=16)


class ChatRemindPaymentPayload(BaseModel):
    body: str = Field(default="", max_length=1000)
    slotLabel: str = Field(default="", max_length=120)
    amountRub: int | None = Field(default=None, ge=0, le=500_000)
    bookingId: str | None = Field(default=None, max_length=64)
    tutorId: str = Field(default="", max_length=64)
    role: str | None = Field(default=None, max_length=16)


def _effective_role(requested_role: str | None, user_role: str | None) -> str:
    raw = str(requested_role or user_role or "student").strip().lower()
    return "tutor" if raw == "tutor" else "student"


def _format_mb(max_bytes: int) -> str:
    return f"{round(max_bytes / (1024 * 1024), 1):g}"


def _attachment_rt_preview(msg: dict[str, Any]) -> str:
    body = str(msg.get("body") or "").strip()
    if body:
        return body[:120]
    atts = msg.get("attachments") or []
    if not atts:
        return ""
    first = atts[0]
    if first.get("isImage"):
        return "📷 Фото" if len(atts) == 1 else f"📷 Фото ({len(atts)})"
    return f"📎 {first.get('filename') or 'Файл'}"[:120]


def _publish_chat_rt(
    request: Request,
    *,
    thread_id: str,
    msg: dict[str, Any],
) -> None:
    rt = getattr(request.app.state, "realtime", None)
    if rt is None:
        return
    eff_tid = str(msg.get("threadId") or thread_id)
    eff_tutor_id = str(msg.get("tutorId") or "")
    sender_role = str(msg.get("senderRole") or "student")
    target_channel = "student" if sender_role == "tutor" else "tutor"
    sender_name = str(msg.get("senderName") or ("Преподаватель" if sender_role == "tutor" else "Ученик"))
    preview = _attachment_rt_preview(msg)
    try:
        rt.publish(
            request.app.state.db,
            channel=target_channel,
            event_type="chat.message",
            title=f"Сообщение от {sender_name}",
            message=preview,
            tutor_slug=(eff_tutor_id or None),
            payload={
                "threadId": eff_tid,
                "tutorId": eff_tutor_id,
                "studentUserId": msg.get("studentUserId"),
                "tutorUserId": msg.get("tutorUserId"),
                "message": msg,
            },
        )
    except Exception:
        pass


def create_chat_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/chats")
    async def chat_threads_list(
        request: Request,
        role: str | None = None,
        limit: int = 50,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        eff_role = _effective_role(role, getattr(user, "role", "student"))
        threads = request.app.state.db.list_chat_threads(user.id, role=eff_role, limit=limit)
        unread_total = sum(int(t.get("unreadCount") or 0) for t in threads)
        return {"ok": True, "threads": threads, "unreadTotal": unread_total}

    @router.get("/api/chats/{thread_id}/messages")
    async def chat_messages_list(
        thread_id: str,
        request: Request,
        role: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        eff_role = _effective_role(role, getattr(user, "role", "student"))
        msgs = request.app.state.db.list_chat_messages(thread_id, user.id, role=eff_role, limit=limit)
        return {"ok": True, "threadId": thread_id, "messages": msgs}

    @router.post("/api/chats/{thread_id}/messages")
    async def chat_messages_create(
        thread_id: str,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        content_type = str(request.headers.get("content-type") or "").lower()
        sender_name = str(getattr(user, "display_name", "") or getattr(user, "username", "") or "").strip()

        upload_files: list[Any] = []
        if "multipart/form-data" in content_type or "application/x-www-form-urlencoded" in content_type:
            form = await request.form()
            body_text = str(form.get("body") or "")[:2000]
            booking_id = str(form.get("bookingId") or "").strip()[:64] or None
            tutor_id = str(form.get("tutorId") or "").strip()[:64]
            req_role = str(form.get("role") or "").strip()[:16] or None
            upload_files = [item for item in form.getlist("files") if hasattr(item, "read")]
        else:
            try:
                raw_json = await request.json()
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "invalid_json", "message": "Некорректный JSON-запрос."},
                ) from exc
            try:
                payload = ChatMessageCreatePayload.model_validate(raw_json)
            except ValidationError as exc:
                raise HTTPException(
                    status_code=422,
                    detail={"code": "validation_error", "message": str(exc)},
                ) from exc
            body_text = payload.body
            booking_id = payload.bookingId
            tutor_id = payload.tutorId
            req_role = payload.role

        eff_role = _effective_role(req_role, getattr(user, "role", "student"))
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is None:
            limiter = RateLimiter(db_getter=lambda: getattr(request.app.state, "db", None))
            request.app.state.limiter = limiter
        limiter.check(f"chat_msg:{int(user.id)}", limit=60, window_sec=60)
        if upload_files:
            limiter.check(f"chat_upload:{int(user.id)}", limit=15, window_sec=60)

        asset_ids: list[str] = []

        if upload_files:
            auth_info = request.app.state.db.authorize_chat_thread(
                thread_id,
                user_id=user.id,
                role=eff_role,
                booking_id=booking_id,
                tutor_id=tutor_id,
            )
            max_bytes = int(settings.media.max_chat_bytes)
            max_files = int(settings.media.max_chat_files)
            limit_mb = _format_mb(max_bytes)

            validated_files: list[tuple[bytes, str, str, str]] = []
            total_bytes = 0
            for up in upload_files:
                data = await up.read(max_bytes + 1)
                raw_fname = str(getattr(up, "filename", "") or "").strip()
                if not raw_fname and len(data) == 0:
                    continue
                if len(validated_files) >= max_files:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "code": "too_many_files",
                            "message": f"Можно прикрепить не более {max_files} файлов к одному сообщению.",
                        },
                    )
                if len(data) > max_bytes or (total_bytes + len(data)) > max_bytes:
                    raise MediaValidationError(
                        "file_too_large",
                        f"Максимальный размер вложений — {limit_mb} МБ.",
                        413,
                    )
                mime, ext, _is_image = detect_and_validate_chat_file(
                    data,
                    raw_fname,
                    max_bytes=max_bytes,
                )
                total_bytes += len(data)
                validated_files.append((data, mime, ext, _sanitize_filename(raw_fname, ext)))

            if not str(body_text or "").strip() and not validated_files:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "empty_message", "message": "Введите текст сообщения или прикрепите файл."},
                )

            if validated_files:
                storage = _storage_from(request, settings)
                bucket = settings.media.s3_bucket_diplomas
                safe_tid = "".join(c if c.isalnum() or c in "._-" else "_" for c in auth_info["threadId"])
                for data, mime, ext, clean_name in validated_files:
                    asset_id = f"med-{uuid.uuid4().hex[:14]}"
                    object_key = f"chat/{safe_tid}/{asset_id}.{ext}"
                    put_info = await storage.put_object(bucket, object_key, data, mime)
                    request.app.state.db.create_media_asset(
                        asset_id=asset_id,
                        user_id=int(user.id),
                        kind="chat",
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

        msg = request.app.state.db.create_chat_message(
            thread_id,
            sender_user_id=user.id,
            sender_role=eff_role,
            sender_name=sender_name,
            body=body_text,
            booking_id=booking_id,
            tutor_id=tutor_id,
            asset_ids=asset_ids,
        )
        _publish_chat_rt(request, thread_id=msg["threadId"], msg=msg)
        return {"ok": True, "threadId": msg["threadId"], "message": msg}

    @router.get("/api/chats/{thread_id}/files/{asset_id}")
    async def chat_attachment_download(
        thread_id: str,
        asset_id: str,
        request: Request,
        role: str | None = None,
        redirect: bool | None = None,
    ) -> Response:
        user = require_user(request, settings)
        eff_role = _effective_role(role, getattr(user, "role", "student"))
        asset = request.app.state.db.get_chat_attachment_asset(
            thread_id,
            asset_id,
            user_id=int(user.id),
            role=eff_role,
        )
        if not asset:
            raise HTTPException(
                status_code=404,
                detail={"code": "attachment_not_found", "message": "Файл диалога не найден."},
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
                        "Cache-Control": "private, max-age=300",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
        raw = await storage.get_object(asset["bucket"], asset["objectKey"])
        ctype = str(asset["contentType"] or "application/octet-stream")
        disp_kind = "inline" if (ctype.startswith("image/") or ctype == "application/pdf") else "attachment"
        fname = quote(str(asset.get("originalFilename") or f"{asset_id}.bin"))
        return Response(
            content=raw,
            media_type=ctype,
            headers={
                "Cache-Control": "private, max-age=300",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f"{disp_kind}; filename*=UTF-8''{fname}",
            },
        )

    @router.post("/api/chats/{thread_id}/remind-lesson")
    async def chat_remind_lesson(
        thread_id: str,
        payload: ChatRemindLessonPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        eff_role = _effective_role(payload.role, getattr(user, "role", "student"))
        target = request.app.state.db.get_chat_thread_notification_target(
            thread_id,
            user_id=int(user.id),
            role=eff_role,
        )

        limiter = getattr(request.app.state, "limiter", None)
        if limiter is None:
            limiter = RateLimiter(db_getter=lambda: getattr(request.app.state, "db", None))
            request.app.state.limiter = limiter
        limiter.check(f"chat_remind:{int(user.id)}:{target['threadId']}", limit=3, window_sec=600)

        actual_role = str(target.get("viewerRole") or eff_role)
        eff_slot = str(payload.slotLabel or target.get("slotLabel") or "").strip()
        slot_part = f" ({eff_slot})" if eff_slot else ""
        chat_body = str(payload.body or "").strip()
        if not chat_body:
            if actual_role == "tutor":
                chat_body = f"🔔 Напоминание от преподавателя: здравствуйте! Скоро занятие{slot_part}. Жду вас на уроке!"
            else:
                chat_body = f"🔔 Напоминание об уроке: здравствуйте! У нас запланировано занятие{slot_part}. Буду готов(а) к уроку!"

        role_fallback_name = target.get("tutorName") or "Преподаватель" if actual_role == "tutor" else (target.get("studentName") or "Ученик")
        sender_name = str(
            getattr(user, "display_name", "") or getattr(user, "username", "") or role_fallback_name
        ).strip()
        eff_booking_id = payload.bookingId or target.get("bookingId")
        eff_tutor_id = str(payload.tutorId or target.get("tutorId") or "").strip()
        stu_uid = target.get("studentUserId")
        tut_uid = target.get("tutorUserId")
        msg = request.app.state.db.create_chat_message(
            target["threadId"],
            sender_user_id=int(user.id),
            sender_role=actual_role,
            sender_name=sender_name,
            body=chat_body,
            booking_id=eff_booking_id,
            tutor_id=eff_tutor_id,
        )
        _publish_chat_rt(request, thread_id=target["threadId"], msg=msg)

        rt = getattr(request.app.state, "realtime", None)
        subj_name = str(target.get("subjectName") or "Занятие").strip()
        tm_url = str(target.get("telemostUrl") or "").strip()
        delivered_channels: list[str] = []
        tg = getattr(request.app.state, "telegram", None)
        slot_desc = f", {eff_slot}" if eff_slot else ""
        tm_label = "Телемост" if "telemost.yandex." in tm_url.lower() else "Видеозвонок"
        tm_suffix = f" {tm_label}: {tm_url}" if tm_url else ""

        if actual_role == "tutor":
            if rt is not None:
                try:
                    rt.publish(
                        request.app.state.db,
                        channel="student",
                        event_type="lesson.reminder.tutor_ping",
                        title=f"Напоминание от преподавателя {sender_name}",
                        message=f"{subj_name}{(' · ' + eff_slot) if eff_slot else ''}",
                        tutor_slug=(eff_tutor_id or None),
                        payload={
                            "threadId": target["threadId"],
                            "bookingId": eff_booking_id,
                            "tutorId": eff_tutor_id,
                            "studentUserId": stu_uid,
                            "tutorUserId": tut_uid,
                            "tutorName": sender_name,
                            "subjectName": subj_name,
                            "slotLabel": eff_slot,
                            "message": msg,
                        },
                    )
                except Exception:
                    pass
            if tg is not None and stu_uid is not None and hasattr(tg, "notify_tutor_lesson_ping"):
                try:
                    ok_tg = bool(
                        await tg.notify_tutor_lesson_ping(
                            student_user_id=int(stu_uid),
                            tutor_name=sender_name,
                            subject_name=subj_name,
                            slot_label=eff_slot,
                            message_text=chat_body,
                            telemost_url=tm_url,
                        )
                    )
                    if ok_tg:
                        delivered_channels.append("telegram")
                except Exception:
                    pass
            stu_wa_phone = str(target.get("studentWhatsappPhone") or "").strip()
            if stu_wa_phone:
                otp_svc = getattr(request.app.state, "otp_delivery", None) or OtpDeliveryService(
                    settings.otp,
                    http_getter=lambda: getattr(request.app.state, "http", None),
                )
                platform_text = (
                    f"Уведомление от преподавателя {sender_name} через платформу Вектор: "
                    f"скоро занятие ({subj_name}{slot_desc}). {chat_body}{tm_suffix}"
                )
                try:
                    ok_wa, _, _ = await otp_svc.send_text_notification(stu_wa_phone, platform_text)
                    if ok_wa:
                        delivered_channels.append("whatsapp")
                except Exception:
                    pass
            channel_labels = ["Telegram" if c == "telegram" else ("WhatsApp" if c == "whatsapp" else c) for c in delivered_channels]
            summary = (
                f"Напоминание от преподавателя отправлено ученику ({' / '.join(channel_labels)})"
                if channel_labels
                else "Напоминание отправлено в чат; при подключении Telegram/WhatsApp платформа продублирует его ученику."
            )
        else:
            if rt is not None:
                try:
                    rt.publish(
                        request.app.state.db,
                        channel="tutor",
                        event_type="lesson.reminder.student_ping",
                        title=f"Напоминание от ученика {sender_name}",
                        message=f"{subj_name}{(' · ' + eff_slot) if eff_slot else ''}",
                        tutor_slug=(eff_tutor_id or None),
                        payload={
                            "threadId": target["threadId"],
                            "bookingId": eff_booking_id,
                            "tutorId": eff_tutor_id,
                            "studentUserId": stu_uid,
                            "tutorUserId": tut_uid,
                            "studentName": sender_name,
                            "subjectName": subj_name,
                            "slotLabel": eff_slot,
                            "message": msg,
                        },
                    )
                except Exception:
                    pass
            if tg is not None and eff_tutor_id and hasattr(tg, "notify_student_lesson_ping"):
                try:
                    ok_tg = bool(
                        await tg.notify_student_lesson_ping(
                            tutor_id=eff_tutor_id,
                            student_name=sender_name,
                            subject_name=subj_name,
                            slot_label=eff_slot,
                            message_text=chat_body,
                            telemost_url=tm_url,
                        )
                    )
                    if ok_tg:
                        delivered_channels.append("telegram")
                except Exception:
                    pass
            tut_wa_phone = str(target.get("tutorWhatsappPhone") or "").strip()
            if tut_wa_phone:
                otp_svc = getattr(request.app.state, "otp_delivery", None) or OtpDeliveryService(
                    settings.otp,
                    http_getter=lambda: getattr(request.app.state, "http", None),
                )
                platform_text = (
                    f"Уведомление от ученика {sender_name} через платформу Вектор: "
                    f"скоро занятие ({subj_name}{slot_desc}). {chat_body}{tm_suffix}"
                )
                try:
                    ok_wa, _, _ = await otp_svc.send_text_notification(tut_wa_phone, platform_text)
                    if ok_wa:
                        delivered_channels.append("whatsapp")
                except Exception:
                    pass
            channel_labels = ["Telegram" if c == "telegram" else ("WhatsApp" if c == "whatsapp" else c) for c in delivered_channels]
            summary = (
                f"Уведомление от ученика отправлено преподавателю через платформу ({' / '.join(channel_labels)})"
                if channel_labels
                else "Напоминание отправлено в чат; при подключении Telegram/WhatsApp платформа продублирует его преподавателю."
            )
        return {
            "ok": True,
            "threadId": msg["threadId"],
            "message": msg,
            "notified": {
                "deliveredChannels": delivered_channels,
                "queuedInPlatform": True,
                "summary": summary,
            },
        }

    @router.post("/api/chats/{thread_id}/remind-payment")
    async def chat_remind_payment(
        thread_id: str,
        payload: ChatRemindPaymentPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        eff_role = _effective_role(payload.role, getattr(user, "role", "student"))
        target = request.app.state.db.get_chat_thread_notification_target(
            thread_id,
            user_id=int(user.id),
            role=eff_role,
        )
        actual_role = str(target.get("viewerRole") or eff_role)
        if actual_role != "tutor":
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "only_tutor_payment_reminder",
                    "message": "Напоминать об оплате может только преподаватель.",
                },
            )

        price_rub = int(target.get("priceRub") or payload.amountRub or 0)
        reserved_rub = int(target.get("reservedRub") or 0)
        escrow = str(target.get("escrowStatus") or "none").lower()
        bk_status = str(target.get("bookingStatus") or "").lower()
        if price_rub <= 0 or escrow in ("frozen", "captured") or reserved_rub >= price_rub or bk_status == "completed":
            raise HTTPException(
                status_code=409,
                detail={
                    "code": "already_paid",
                    "message": "Этот урок уже оплачен или бесплатный.",
                },
            )

        limiter = getattr(request.app.state, "limiter", None)
        if limiter is None:
            limiter = RateLimiter(db_getter=lambda: getattr(request.app.state, "db", None))
            request.app.state.limiter = limiter
        limiter.check(f"chat_pay_remind:{int(user.id)}:{target['threadId']}", limit=3, window_sec=600)

        eff_slot = str(payload.slotLabel or target.get("slotLabel") or "").strip()
        chat_body = str(payload.body or "").strip()
        if not chat_body:
            amount_fmt = f"{price_rub:,}".replace(",", " ") + " ₽"
            details = ", ".join(p for p in [eff_slot, amount_fmt] if p)
            details_part = f" ({details})" if details else ""
            chat_body = f"💳 Напоминание об оплате: здравствуйте! Для подтверждения ближайшего урока{details_part} пожалуйста, пополните баланс на платформе Вектор."

        sender_name = str(
            getattr(user, "display_name", "") or getattr(user, "username", "") or target.get("tutorName") or "Преподаватель"
        ).strip()
        eff_booking_id = payload.bookingId or target.get("bookingId")
        eff_tutor_id = str(payload.tutorId or target.get("tutorId") or "").strip()
        stu_uid = target.get("studentUserId")
        tut_uid = target.get("tutorUserId")

        msg = request.app.state.db.create_chat_message(
            target["threadId"],
            sender_user_id=int(user.id),
            sender_role="tutor",
            sender_name=sender_name,
            body=chat_body,
            booking_id=eff_booking_id,
            tutor_id=eff_tutor_id,
        )
        _publish_chat_rt(request, thread_id=target["threadId"], msg=msg)

        rt = getattr(request.app.state, "realtime", None)
        subj_name = str(target.get("subjectName") or "Занятие").strip()
        if rt is not None:
            try:
                rt.publish(
                    request.app.state.db,
                    channel="student",
                    event_type="lesson.reminder.payment_due",
                    title=f"Напоминание об оплате от {sender_name}",
                    message=f"{subj_name}{(' · ' + eff_slot) if eff_slot else ''} · {price_rub} ₽",
                    tutor_slug=(eff_tutor_id or None),
                    payload={
                        "threadId": target["threadId"],
                        "bookingId": eff_booking_id,
                        "tutorId": eff_tutor_id,
                        "studentUserId": stu_uid,
                        "tutorUserId": tut_uid,
                        "tutorName": sender_name,
                        "subjectName": subj_name,
                        "slotLabel": eff_slot,
                        "amountRub": price_rub,
                        "message": msg,
                    },
                )
            except Exception:
                pass

        delivered_channels: list[str] = []
        tg = getattr(request.app.state, "telegram", None)
        if tg is not None and stu_uid is not None and hasattr(tg, "notify_tutor_payment_reminder"):
            try:
                ok_tg = bool(
                    await tg.notify_tutor_payment_reminder(
                        student_user_id=int(stu_uid),
                        tutor_name=sender_name,
                        subject_name=subj_name,
                        slot_label=eff_slot,
                        amount_rub=price_rub,
                        message_text=chat_body,
                    )
                )
                if ok_tg:
                    delivered_channels.append("telegram")
            except Exception:
                pass

        stu_wa_phone = str(target.get("studentWhatsappPhone") or "").strip()
        if stu_wa_phone:
            otp_svc = getattr(request.app.state, "otp_delivery", None) or OtpDeliveryService(
                settings.otp,
                http_getter=lambda: getattr(request.app.state, "http", None),
            )
            slot_desc = f", {eff_slot}" if eff_slot else ""
            amount_fmt = f"{price_rub:,}".replace(",", " ") + " ₽"
            platform_text = (
                f"Напоминание об оплате от преподавателя {sender_name} в Вектор: "
                f"занятие ({subj_name}{slot_desc}, {amount_fmt}). {chat_body}"
            )
            try:
                ok_wa, _, _ = await otp_svc.send_text_notification(stu_wa_phone, platform_text)
                if ok_wa:
                    delivered_channels.append("whatsapp")
            except Exception:
                pass

        channel_labels = ["Telegram" if c == "telegram" else ("WhatsApp" if c == "whatsapp" else c) for c in delivered_channels]
        summary = (
            f"Напоминание об оплате отправлено ученику ({' / '.join(channel_labels)})"
            if channel_labels
            else "Напоминание об оплате отправлено в чат; при подключении Telegram/WhatsApp платформа продублирует его ученику."
        )
        return {
            "ok": True,
            "threadId": msg["threadId"],
            "message": msg,
            "notified": {
                "deliveredChannels": delivered_channels,
                "queuedInPlatform": True,
                "summary": summary,
            },
        }

    @router.post("/api/chats/{thread_id}/read")
    async def chat_messages_mark_read(
        thread_id: str,
        request: Request,
        role: str | None = None,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        eff_role = _effective_role(role, getattr(user, "role", "student"))
        updated = request.app.state.db.mark_chat_read(thread_id, user_id=user.id, role=eff_role)
        if int(updated or 0) > 0:
            rt = getattr(request.app.state, "realtime", None)
            if rt is not None:
                try:
                    auth_info = request.app.state.db.authorize_chat_thread(
                        thread_id,
                        user_id=int(user.id),
                        role=eff_role,
                    )
                    reader_role = str(auth_info.get("viewerRole") or eff_role)
                    target_channel = "student" if reader_role == "tutor" else "tutor"
                    eff_tutor_id = str(auth_info.get("tutorId") or "")
                    rt.publish(
                        request.app.state.db,
                        channel=target_channel,
                        event_type="chat.read",
                        title="Сообщения прочитаны",
                        message="",
                        tutor_slug=(eff_tutor_id or None),
                        payload={
                            "threadId": auth_info["threadId"],
                            "tutorId": eff_tutor_id,
                            "studentUserId": auth_info.get("studentUserId"),
                            "tutorUserId": auth_info.get("tutorUserId"),
                            "readerRole": reader_role,
                            "updated": int(updated),
                        },
                    )
                except Exception:
                    pass
        return {"ok": True, "threadId": thread_id, "updated": updated}

    return router
