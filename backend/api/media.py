"""Headless API загрузки медиа (S3 / локальный том) и верификации дипломов репетиторов."""

from __future__ import annotations

import hmac
from pathlib import Path
from typing import Any
from urllib.parse import quote
import uuid

from fastapi import APIRouter, File, Form, HTTPException, Request, Response, UploadFile
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field

from ..config import Settings
from ..media_storage import (
    MediaValidationError,
    create_media_storage,
    detect_and_validate_media,
    normalize_avatar_image,
)
from .admin import _clamp_limit, _extract_admin_token, _require_admin
from .auth_docs import current_user, require_tutor, require_user


class AdminVerificationReviewPayload(BaseModel):
    action: str = Field(..., min_length=1, max_length=24)
    reviewNote: str = Field(default="", max_length=300)


def _storage_from(request: Request, settings: Settings):
    st = getattr(request.app.state, "media_storage", None)
    if st is None:
        st = create_media_storage(
            settings,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        request.app.state.media_storage = st
    return st


def _sanitize_filename(raw: str | None, fallback_ext: str) -> str:
    base = Path(str(raw or f"file.{fallback_ext}")).name
    clean = "".join(c for c in base if c.isalnum() or c in "._- ")[:120].strip()
    return clean or f"upload.{fallback_ext}"


def _resolve_public_redirect_url(storage: Any, asset_id: str, asset: dict[str, Any]) -> str | None:
    pub = storage.public_url_for(asset_id, asset["bucket"], asset["objectKey"])
    if isinstance(pub, str) and pub.startswith(("http://", "https://")):
        return pub
    presigned = storage.presign_get_url(asset["bucket"], asset["objectKey"])
    if isinstance(presigned, str) and presigned.startswith(("http://", "https://")):
        return presigned
    return None


def create_media_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.post("/api/media/avatar")
    async def upload_avatar(
        request: Request,
        file: UploadFile = File(...),
        target: str = Form("profile"),
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"media_avatar:{int(user.id)}", 15, 600)
        data = await file.read(settings.media.max_avatar_bytes + 1)
        mime, ext = detect_and_validate_media(
            data,
            allow_pdf=False,
            max_bytes=settings.media.max_avatar_bytes,
        )

        data, mime, ext, opt_meta = normalize_avatar_image(
            data,
            mime,
            ext,
            max_dim=settings.media.avatar_max_dim,
            quality=settings.media.avatar_webp_quality,
            enabled=settings.media.avatar_webp_enabled,
        )

        storage = _storage_from(request, settings)
        asset_id = f"med-{uuid.uuid4().hex[:14]}"
        bucket = settings.media.s3_bucket_avatars
        object_key = f"avatars/{user.id}/{asset_id}.{ext}"

        put_info = await storage.put_object(bucket, object_key, data, mime)
        public_url = storage.public_url_for(asset_id, bucket, object_key)
        clean_name = _sanitize_filename(file.filename, ext)

        asset = request.app.state.db.create_media_asset(
            asset_id=asset_id,
            user_id=user.id,
            kind="avatar",
            storage_driver=put_info["driver"],
            bucket=bucket,
            object_key=object_key,
            content_type=mime,
            size_bytes=put_info["sizeBytes"],
            sha256=put_info["sha256"],
            original_filename=clean_name,
            public_url=public_url,
        )
        sync_tutor = str(target or "").strip().lower() == "tutor" or str(user.role or "").lower() == "tutor"
        av_res = request.app.state.db.set_user_avatar_url(user.id, public_url, update_tutor=sync_tutor)
        return {
            "ok": True,
            "url": public_url,
            "asset": asset,
            "optimization": opt_meta,
            "tutorUpdated": bool(av_res.get("tutorUpdated")),
        }

    @router.get("/api/media/public/{asset_id}")
    async def get_public_media(
        asset_id: str,
        request: Request,
        redirect: bool | None = None,
    ) -> Response:
        asset = request.app.state.db.get_media_asset(asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail={"code": "media_not_found", "message": "Файл не найден."})
        if asset.get("kind") != "avatar":
            raise HTTPException(
                status_code=403,
                detail={"code": "private_asset_forbidden", "message": "Приватные документы недоступны по публичной ссылке."},
            )
        storage = _storage_from(request, settings)
        want_redirect = settings.media.public_redirect if redirect is None else bool(redirect)
        if want_redirect:
            target_url = _resolve_public_redirect_url(storage, asset_id, asset)
            if target_url:
                return RedirectResponse(
                    url=target_url,
                    status_code=307,
                    headers={
                        "Cache-Control": "public, max-age=300",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
        raw = await storage.get_object(asset["bucket"], asset["objectKey"])
        return Response(
            content=raw,
            media_type=asset["contentType"],
            headers={
                "Cache-Control": "public, max-age=31536000, immutable",
                "X-Content-Type-Options": "nosniff",
            },
        )

    @router.post("/api/tutor/verifications")
    async def submit_verification_doc(
        request: Request,
        file: UploadFile = File(...),
        doc_type: str = Form("diploma"),
        title: str = Form(""),
        comment: str = Form(""),
        tutor_id: str = Form(""),
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"media_verif:{int(user.id)}", 10, 900)
        data = await file.read(settings.media.max_diploma_bytes + 1)
        mime, ext = detect_and_validate_media(
            data,
            allow_pdf=True,
            max_bytes=settings.media.max_diploma_bytes,
        )

        storage = _storage_from(request, settings)
        asset_id = f"med-{uuid.uuid4().hex[:14]}"
        bucket = settings.media.s3_bucket_diplomas
        object_key = f"diplomas/{user.id}/{asset_id}.{ext}"

        put_info = await storage.put_object(bucket, object_key, data, mime)
        clean_name = _sanitize_filename(file.filename, ext)
        request.app.state.db.create_media_asset(
            asset_id=asset_id,
            user_id=user.id,
            kind="diploma",
            storage_driver=put_info["driver"],
            bucket=bucket,
            object_key=object_key,
            content_type=mime,
            size_bytes=put_info["sizeBytes"],
            sha256=put_info["sha256"],
            original_filename=clean_name,
            public_url=None,
        )
        ver = request.app.state.db.create_tutor_verification(
            user_id=user.id,
            asset_id=asset_id,
            doc_type=doc_type,
            title=(title or clean_name)[:120],
            comment=comment,
            tutor_id=tutor_id,
        )
        ver["fileUrl"] = f"/api/media/private/{asset_id}"

        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            try:
                rt.publish(
                    request.app.state.db,
                    channel="all",
                    event_type="tutor.verification.submitted",
                    title="Загружен документ на верификацию",
                    message=f"{ver.get('tutorName')} · {ver.get('title') or ver.get('docType')}",
                    tutor_slug=ver.get("tutorId") or None,
                    payload={"userId": user.id, "verificationId": ver["id"], "docType": ver.get("docType")},
                )
            except Exception:
                pass

        tg = getattr(request.app.state, "telegram", None)
        if tg is not None:
            try:
                await tg.notify_admin_alert(
                    "Новый документ на верификацию",
                    f"Репетитор: {ver.get('tutorName')}\nТип: {ver.get('docType')}\nДокумент: {ver.get('title') or clean_name}",
                )
            except Exception:
                pass

        return {"ok": True, "verification": ver}

    @router.get("/api/tutor/verifications")
    async def list_my_verifications(request: Request) -> dict[str, Any]:
        user = require_tutor(request, settings)
        items = request.app.state.db.list_user_verifications(user.id)
        for item in items:
            item["fileUrl"] = f"/api/media/private/{item['assetId']}"
        return {"ok": True, "verifications": items}

    @router.get("/api/media/private/{asset_id}")
    async def get_private_media(
        asset_id: str,
        request: Request,
        redirect: bool | None = None,
    ) -> Response:
        asset = request.app.state.db.get_media_asset(asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail={"code": "media_not_found", "message": "Документ не найден."})

        user = current_user(request, settings)
        expected_token = (getattr(settings, "admin_api_token", "") or "").strip()
        candidate_token = _extract_admin_token(request)
        token_ok = bool(expected_token and candidate_token and hmac.compare_digest(candidate_token, expected_token))
        is_admin_user = bool(user is not None and str(getattr(user, "role", "student") or "").lower() == "admin")
        is_owner = bool(user is not None and asset.get("userId") is not None and int(user.id) == int(asset["userId"]))

        if not (token_ok or is_admin_user or is_owner):
            if user is None:
                raise HTTPException(
                    status_code=401,
                    detail={"code": "unauthorized", "message": "Войдите в аккаунт для просмотра документа."},
                )
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden", "message": "Нет прав доступа к чужому документу."},
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

    @router.get("/api/admin/verifications")
    async def admin_list_verifications(
        request: Request,
        status: str = "all",
        limit: int = 100,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        storage = _storage_from(request, settings)
        items = request.app.state.db.admin_list_verifications(
            status=None if status in ("", "all") else status,
            limit=_clamp_limit(limit, default=100),
        )
        for item in items:
            item["fileUrl"] = f"/api/admin/verifications/{item['id']}/file"
            presigned = storage.presign_get_url(item["bucket"], item["objectKey"]) if item.get("objectKey") else None
            if presigned:
                item["presignedUrl"] = presigned
        return {"ok": True, "verifications": items}

    @router.get("/api/admin/verifications/{verification_id}/file")
    async def admin_get_verification_file(
        verification_id: str,
        request: Request,
        redirect: bool | None = None,
    ) -> Response:
        _require_admin(request, settings)
        ver = request.app.state.db.get_verification(verification_id)
        if not ver:
            raise HTTPException(
                status_code=404,
                detail={"code": "verification_not_found", "message": "Заявка на верификацию не найдена."},
            )
        storage = _storage_from(request, settings)
        want_redirect = settings.media.private_presign_redirect if redirect is None else bool(redirect)
        if want_redirect:
            presigned = storage.presign_get_url(ver["bucket"], ver["objectKey"])
            if isinstance(presigned, str) and presigned.startswith(("http://", "https://")):
                return RedirectResponse(
                    url=presigned,
                    status_code=307,
                    headers={
                        "Cache-Control": "private, no-store",
                        "X-Content-Type-Options": "nosniff",
                    },
                )
        raw = await storage.get_object(ver["bucket"], ver["objectKey"])
        fname = quote(str(ver.get("originalFilename") or f"{verification_id}.bin"))
        return Response(
            content=raw,
            media_type=ver["contentType"],
            headers={
                "Cache-Control": "private, no-store",
                "X-Content-Type-Options": "nosniff",
                "Content-Disposition": f"inline; filename*=UTF-8''{fname}",
            },
        )

    @router.post("/api/admin/verifications/{verification_id}/review")
    async def admin_review_verification(
        verification_id: str,
        payload: AdminVerificationReviewPayload,
        request: Request,
    ) -> dict[str, Any]:
        reviewer = _require_admin(request, settings)
        res = request.app.state.db.admin_review_verification(
            verification_id,
            payload.action,
            review_note=payload.reviewNote,
            reviewer=reviewer,
        )
        ver = res["verification"]
        ver["fileUrl"] = f"/api/admin/verifications/{ver['id']}/file"

        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            try:
                is_ok = ver.get("status") == "approved"
                rt.publish(
                    request.app.state.db,
                    channel="all",
                    event_type="tutor.verification.reviewed",
                    title="Верификация подтверждена" if is_ok else "Документ верификации отклонён",
                    message=f"{ver.get('tutorName') or ver.get('tutorId')} · {ver.get('title') or ver.get('docType')}",
                    tutor_slug=res.get("tutorId") or None,
                    payload={
                        "verificationId": ver["id"],
                        "status": ver.get("status"),
                        "verifiedGranted": bool(res.get("verifiedGranted")),
                    },
                )
            except Exception:
                pass

        tg = getattr(request.app.state, "telegram", None)
        uid = ver.get("userId")
        if tg is not None and uid is not None:
            try:
                binding = request.app.state.db.get_telegram_binding(int(uid), by_user=True)
                chat_id = binding.get("chatId") if binding else None
                if chat_id and binding.get("notificationsEnabled", True):
                    if ver.get("status") == "approved":
                        txt = (
                            f"✅ <b>Верификация пройдена</b>\n"
                            f"Документ «{tg._esc(ver.get('title') or ver.get('docType'))}» одобрен. "
                            f"Вашей анкете присвоена синяя галочка «Проверен»."
                        )
                    else:
                        reason = f"\nПричина: {tg._esc(ver.get('reviewNote'))}" if ver.get("reviewNote") else ""
                        txt = (
                            f"❌ <b>Документ верификации отклонён</b>\n"
                            f"Документ «{tg._esc(ver.get('title') or ver.get('docType'))}» не прошёл проверку.{reason}"
                        )
                    await tg._safe_send(chat_id, txt)
            except Exception:
                pass

        return {"ok": True, **res}

    return router


__all__ = ["create_media_router"]
