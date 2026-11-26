"""Headless API роуты Telegram-бота: статус, токен привязки, уведомления, Login Widget и webhook."""

from __future__ import annotations

import hmac
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, ConfigDict, Field

from ..config import Settings
from ..telegram_bot import verify_telegram_login_widget
from .auth_docs import (
    append_auth_error,
    client_ip,
    current_user,
    normalize_oauth_role,
    require_user,
    sanitize_next_url,
    serialize_user,
    set_session_cookie,
)


class TelegramNotifyPayload(BaseModel):
    enabled: bool = Field(default=True)


class TelegramLoginPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: int = Field(..., ge=1)
    auth_date: int = Field(..., ge=1)
    hash: str = Field(..., min_length=16, max_length=128)
    first_name: str = Field(default="", max_length=64)
    last_name: str = Field(default="", max_length=64)
    username: str = Field(default="", max_length=64)
    photo_url: str = Field(default="", max_length=500)
    role: str = Field(default="student", max_length=16)


def create_telegram_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/telegram/status")
    async def telegram_status(request: Request) -> dict[str, Any]:
        user = current_user(request, settings)
        binding = request.app.state.db.get_telegram_binding_by_user(user.id) if user else None
        return {
            "ok": True,
            "enabled": settings.telegram.enabled,
            "botApiEnabled": settings.telegram.bot_api_enabled,
            "botUsername": settings.telegram.bot_username,
            "linked": bool(binding),
            "binding": binding,
        }

    @router.post("/api/telegram/link-token")
    async def telegram_link_token(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        ttl_sec = 900
        token = request.app.state.db.create_telegram_link_token(user.id, ttl_sec=ttl_sec)
        bot = settings.telegram.bot_username
        return {
            "ok": True,
            "token": token,
            "botUsername": bot,
            "deepLink": f"https://t.me/{bot}?start=link_{token}" if bot else None,
            "expiresInSec": ttl_sec,
        }

    @router.delete("/api/telegram/binding")
    async def telegram_unlink(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        unlinked = request.app.state.db.unlink_telegram_binding(user.id)
        return {"ok": True, "unlinked": bool(unlinked)}

    @router.patch("/api/telegram/notifications")
    async def telegram_notifications(
        payload: TelegramNotifyPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        binding = request.app.state.db.set_telegram_notifications(
            user.id, bool(payload.enabled), by_user=True
        )
        if not binding:
            raise HTTPException(
                status_code=404,
                detail={"code": "telegram_not_linked", "message": "Telegram-бот ещё не привязан к аккаунту."},
            )
        return {"ok": True, "binding": binding}

    @router.post("/api/auth/telegram/login")
    async def telegram_login(
        payload: TelegramLoginPayload,
        request: Request,
        response: Response,
    ) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        bot_token = (settings.telegram.bot_token or "").strip()
        if not bot_token:
            raise HTTPException(
                status_code=503,
                detail={"code": "telegram_not_configured", "message": "Вход через Telegram не настроен на сервере."},
            )
        raw = payload.model_dump()
        role = normalize_oauth_role(str(raw.pop("role", "student") or "student"))
        raw.pop("next", None)
        try:
            tg = verify_telegram_login_widget(raw, bot_token)
        except ValueError as exc:
            code = str(exc)
            if code == "auth_expired":
                raise HTTPException(
                    status_code=400,
                    detail={"code": "auth_expired", "message": "Срок авторизации Telegram истёк. Повторите вход."},
                ) from exc
            if code == "invalid_signature":
                raise HTTPException(
                    status_code=403,
                    detail={"code": "invalid_signature", "message": "Неверная подпись Telegram Login."},
                ) from exc
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_payload", "message": "Некорректные данные входа Telegram."},
            ) from exc

        user = request.app.state.db.upsert_oauth_user(
            "telegram",
            f"tg:{tg['id']}",
            display_name=tg["display_name"],
            avatar_url=tg["photo_url"],
            role=role,
            max_users=settings.max_users,
        )
        binding = request.app.state.db.upsert_telegram_binding(
            str(tg["id"]),
            user_id=user.id,
            telegram_user_id=str(tg["id"]),
            telegram_username=tg["username"],
            first_name=tg["first_name"],
        )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        set_session_cookie(response, request, settings, token)
        return {"ok": True, "user": serialize_user(user), "binding": binding}

    @router.get("/api/auth/telegram/callback")
    async def telegram_callback(request: Request) -> RedirectResponse:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        raw = dict(request.query_params)
        clean_role = normalize_oauth_role(raw.pop("role", "student"))
        default_next = "/tutor" if clean_role == "tutor" else "/"
        clean_next = sanitize_next_url(raw.pop("next", ""), default_url=default_next)

        bot_token = (settings.telegram.bot_token or "").strip()
        if not bot_token:
            return RedirectResponse(url=append_auth_error(clean_next, "telegram_not_configured"), status_code=302)

        try:
            tg = verify_telegram_login_widget(raw, bot_token)
        except ValueError as exc:
            err_code = "telegram_expired" if str(exc) == "auth_expired" else "telegram_invalid"
            return RedirectResponse(url=append_auth_error(clean_next, err_code), status_code=302)

        try:
            user = request.app.state.db.upsert_oauth_user(
                "telegram",
                f"tg:{tg['id']}",
                display_name=tg["display_name"],
                avatar_url=tg["photo_url"],
                role=clean_role,
                max_users=settings.max_users,
            )
        except Exception as exc:
            err_code = getattr(exc, "code", None)
            if err_code in ("user_limit", "invalid_email"):
                return RedirectResponse(url=append_auth_error(clean_next, str(err_code)), status_code=302)
            raise

        request.app.state.db.upsert_telegram_binding(
            str(tg["id"]),
            user_id=user.id,
            telegram_user_id=str(tg["id"]),
            telegram_username=tg["username"],
            first_name=tg["first_name"],
        )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        resp = RedirectResponse(url=clean_next, status_code=302)
        set_session_cookie(resp, request, settings, token)
        return resp

    @router.post("/api/telegram/webhook")
    async def telegram_webhook(request: Request) -> dict[str, Any]:
        expected_secret = (settings.telegram.webhook_secret or "").strip()
        if expected_secret:
            got_secret = (request.headers.get("x-telegram-bot-api-secret-token") or "").strip()
            if not got_secret or not hmac.compare_digest(got_secret, expected_secret):
                raise HTTPException(
                    status_code=403,
                    detail={"code": "invalid_webhook_secret", "message": "Forbidden"},
                )
        try:
            update = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"code": "invalid_json", "message": "Invalid JSON"}) from exc

        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is None:
            return {"ok": False, "handled": False}
        res = await tg_svc.handle_update(update if isinstance(update, dict) else {})
        return {"ok": True, **res}

    return router
