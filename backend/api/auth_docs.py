"""Headless API роуты здоровья, аутентификации, документов и ИИ-прокси."""

from __future__ import annotations

import base64
from collections import deque
import hashlib
import hmac
import json
import secrets
import threading
import time
from typing import Any
from urllib.parse import urlencode

from fastapi import APIRouter, Body, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, StreamingResponse
import httpx
from pydantic import BaseModel, Field

from ..ai import AIError, complete_ai_json, stream_ai_text
from ..config import Settings
from databases.sqlite.store import User


class RateLimiter:
    """Простое ограничение частоты запросов в окне sliding-window."""

    def __init__(self) -> None:
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def check(self, key: str, limit: int, window_sec: int) -> None:
        now = time.monotonic()
        cutoff = now - window_sec
        with self._lock:
            q = self._hits.setdefault(key, deque())
            while q and q[0] <= cutoff:
                q.popleft()
            if len(q) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "Слишком много запросов. Подожди немного."},
                )
            q.append(now)


class AuthPayload(BaseModel):
    username: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)
    email: str = Field(default="", max_length=254)
    displayName: str = Field(default="", max_length=64)
    inviteCode: str = Field(default="", max_length=128)


class AIRequestPayload(BaseModel):
    mode: str = Field(default="text")
    messages: str | list[dict[str, Any]]
    modelTier: str | None = Field(default=None)


def client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    if proto:
        return proto == "https"
    return request.url.scheme == "https"


def set_session_cookie(response: Response, request: Request, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        max_age=settings.session_ttl_sec,
        httponly=True,
        samesite="lax",
        secure=is_https(request),
        path="/",
    )


def clear_session_cookie(response: Response, request: Request, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie,
        httponly=True,
        samesite="lax",
        secure=is_https(request),
        path="/",
    )


def serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name or user.username,
        "email": user.email,
        "avatarUrl": user.avatar_url,
        "authProvider": user.auth_provider,
        "role": getattr(user, "role", "student"),
    }


def public_base_url(request: Request, settings: Settings) -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    scheme = "https" if is_https(request) else request.url.scheme
    host = (
        request.headers.get("x-forwarded-host", "").split(",")[0].strip()
        or request.headers.get("host", "").strip()
        or request.url.netloc
    )
    return f"{scheme}://{host}".rstrip("/")


def google_redirect_uri(request: Request, settings: Settings) -> str:
    return f"{public_base_url(request, settings)}/api/auth/google/callback"


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def current_user(request: Request, settings: Settings) -> User | None:
    token = request.cookies.get(settings.session_cookie)
    return request.app.state.db.get_user_by_token(token)


def require_user(request: Request, settings: Settings) -> User:
    user = current_user(request, settings)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "session_expired", "message": "Нужно войти в аккаунт."},
        )
    return user


def create_auth_docs_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/health")
    async def health(request: Request) -> dict[str, Any]:
        request.app.state.db.ping()
        return {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
        }

    @router.get("/api/health/storage")
    async def storage_health(request: Request) -> dict[str, Any]:
        db = request.app.state.db
        if hasattr(db, "storage_health"):
            return db.storage_health()
        db.ping()
        return {
            "ok": True,
            "mode": "sqlite",
            "sqlite": "ok",
            "postgres": "disabled",
            "outboxPending": 0,
        }

    @router.get("/api/me")
    async def me(request: Request) -> dict[str, Any]:
        user = current_user(request, settings)
        return {
            "user": serialize_user(user) if user else None,
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
            "inviteRequired": bool(settings.invite_code),
            "providers": {"local": True, "google": settings.google.enabled},
        }

    @router.post("/api/auth/register")
    async def register(payload: AuthPayload, request: Request, response: Response) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        if settings.invite_code and not hmac.compare_digest(payload.inviteCode.strip(), settings.invite_code):
            raise HTTPException(
                status_code=403,
                detail={"code": "invalid_invite", "message": "Неверный код приглашения."},
            )
        user = request.app.state.db.create_user(
            payload.username,
            payload.password,
            email=payload.email or None,
            display_name=payload.displayName,
            max_users=settings.max_users,
        )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        set_session_cookie(response, request, settings, token)
        return {"user": serialize_user(user)}

    @router.post("/api/auth/login")
    async def login(payload: AuthPayload, request: Request, response: Response) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        user = request.app.state.db.authenticate(payload.username, payload.password)
        if not user:
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_credentials", "message": "Неверный логин или пароль."},
            )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        set_session_cookie(response, request, settings, token)
        return {"user": serialize_user(user)}

    @router.post("/api/auth/logout")
    async def logout(request: Request, response: Response) -> dict[str, bool]:
        request.app.state.db.delete_session(request.cookies.get(settings.session_cookie))
        clear_session_cookie(response, request, settings)
        return {"ok": True}

    @router.get("/api/auth/google/start")
    async def google_start(request: Request) -> RedirectResponse:
        if not settings.google.enabled:
            raise HTTPException(
                status_code=503,
                detail={"code": "google_not_configured", "message": "Вход через Google не настроен на сервере."},
            )
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        code_verifier = secrets.token_urlsafe(48)
        redirect_uri = google_redirect_uri(request, settings)
        state = request.app.state.db.create_oauth_state("google", code_verifier, redirect_uri)
        params = urlencode(
            {
                "client_id": settings.google.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": pkce_challenge(code_verifier),
                "code_challenge_method": "S256",
                "prompt": "select_account",
            }
        )
        return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}", status_code=302)

    @router.get("/api/auth/google/callback")
    async def google_callback(
        request: Request,
        code: str = "",
        state: str = "",
        error: str = "",
    ) -> RedirectResponse:
        if not settings.google.enabled or error or not code or not state:
            return RedirectResponse(url="/?auth_error=google_denied", status_code=302)

        consumed = request.app.state.db.consume_oauth_state(state, "google")
        if not consumed:
            return RedirectResponse(url="/?auth_error=oauth_state", status_code=302)
        code_verifier, redirect_uri = consumed

        try:
            token_resp = await request.app.state.http.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.google.client_id or "",
                    "client_secret": settings.google.client_secret or "",
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": code_verifier,
                },
            )
            if token_resp.status_code != 200:
                return RedirectResponse(url="/?auth_error=oauth_exchange", status_code=302)
            access_token = (token_resp.json() or {}).get("access_token")
            if not access_token:
                return RedirectResponse(url="/?auth_error=oauth_exchange", status_code=302)

            info_resp = await request.app.state.http.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if info_resp.status_code != 200:
                return RedirectResponse(url="/?auth_error=oauth_profile", status_code=302)
            info = info_resp.json() or {}
            sub = str(info.get("sub") or "").strip()
            if not sub:
                return RedirectResponse(url="/?auth_error=oauth_profile", status_code=302)
            user = request.app.state.db.upsert_oauth_user(
                "google",
                sub,
                email=info.get("email"),
                email_verified=bool(info.get("email_verified")),
                display_name=str(info.get("name") or ""),
                avatar_url=info.get("picture"),
                max_users=settings.max_users,
            )
        except Exception as exc:
            err_code = getattr(exc, "code", None)
            if err_code in ("user_limit", "invalid_email"):
                return RedirectResponse(url=f"/?auth_error={err_code}", status_code=302)
            if isinstance(exc, httpx.HTTPError):
                return RedirectResponse(url="/?auth_error=oauth_failed", status_code=302)
            raise

        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        resp = RedirectResponse(url="/", status_code=302)
        set_session_cookie(resp, request, settings, token)
        return resp

    @router.get("/api/docs")
    async def list_docs(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return {"docs": request.app.state.db.get_docs(user.id)}

    @router.patch("/api/docs/{name}")
    async def patch_doc(name: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, bool]:
        user = require_user(request, settings)
        request.app.state.db.patch_doc(user.id, name, payload, settings.max_doc_bytes)
        return {"ok": True}

    @router.put("/api/docs/{name}")
    async def put_doc(name: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, bool]:
        user = require_user(request, settings)
        request.app.state.db.replace_doc(user.id, name, payload, settings.max_doc_bytes)
        return {"ok": True}

    @router.post("/api/ai")
    async def ai_proxy(payload: AIRequestPayload, request: Request):
        user = require_user(request, settings)
        if not settings.ai.enabled:
            raise AIError("not_granted", "ИИ-помощник не настроен на сервере.", 503)
        request.app.state.limiter.check(
            f"ai:{user.id}",
            settings.ai_rate_limit,
            settings.ai_rate_window_sec,
        )

        if payload.mode == "json":
            data = await complete_ai_json(request.app.state.http, settings.ai, payload.messages, payload.modelTier)
            return {"data": data}

        async def sse_gen():
            try:
                async for chunk in stream_ai_text(request.app.state.http, settings.ai, payload.messages, payload.modelTier):
                    yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
            except AIError as exc:
                yield f"data: {json.dumps({'error': exc.code, 'message': exc.message}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            sse_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router
