"""FastAPI-сервер для платформы «Вектор ЕГЭ» (статика, аккаунты, SQLite и ИИ-прокси)."""

import asyncio
import base64
from collections import deque
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
from pathlib import Path
import secrets
import threading
import time
from typing import Any
from urllib.parse import urlencode

from fastapi import Body, FastAPI, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
import httpx
from pydantic import BaseModel, Field

from .ai import AIError, complete_ai_json, stream_ai_text
from .calendar_sync import (
    build_google_calendar_urls,
    detect_busy_conflicts,
    generate_ics,
    normalize_lessons_to_events,
    parse_ics_busy_slots,
    resolve_timezone_info,
    validate_public_ics_url,
)
from .config import ROOT_DIR, Settings, load_settings
from .realtime import RealtimeBroker
from databases.postgres.store import create_store
from databases.sqlite.store import StorageError, User

FRONTEND_DIR = ROOT_DIR / "frontend"
UX_UI_DIR = ROOT_DIR / "ux-ui"

SHELL_PREFIX = (
    "<!doctype html><html><head><meta charset=utf-8>"
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)
HOST_FLAG_SCRIPT = "<script>window.EGE_HOST={backend:true};</script>"


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


class RealtimePublishPayload(BaseModel):
    channel: str = Field(default="tutor", max_length=32)
    eventType: str = Field(default="notice", min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(default="", max_length=1000)
    tutorSlug: str | None = Field(default=None, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)


class CalendarSyncPayload(BaseModel):
    tutorSlug: str = Field(default="anna-sokolova", min_length=1, max_length=120)
    tutorName: str = Field(default="Преподаватель Вектор ЕГЭ", max_length=120)
    city: str = Field(default="Якутск", max_length=64)
    timezone: str = Field(default="UTC+9", max_length=64)
    openSlots: dict[str, list[str]] = Field(default_factory=dict)
    lessons: list[dict[str, Any]] = Field(default_factory=list)


class CalendarImportPayload(BaseModel):
    tutorSlug: str = Field(default="anna-sokolova", min_length=1, max_length=120)
    tutorName: str = Field(default="Преподаватель Вектор ЕГЭ", max_length=120)
    city: str = Field(default="Якутск", max_length=64)
    timezone: str = Field(default="UTC+9", max_length=64)
    icsText: str = Field(default="", max_length=2_000_000)
    icsUrl: str | None = Field(default=None, max_length=2000)
    openSlots: dict[str, list[str]] = Field(default_factory=dict)
    lessons: list[dict[str, Any]] = Field(default_factory=list)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "").split(",")[0].strip()
    if fwd:
        return fwd
    return request.client.host if request.client else "unknown"


def _is_https(request: Request) -> bool:
    proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
    if proto:
        return proto == "https"
    return request.url.scheme == "https"


def _set_session_cookie(response: Response, request: Request, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        max_age=settings.session_ttl_sec,
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
        path="/",
    )


def _clear_session_cookie(response: Response, request: Request, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie,
        httponly=True,
        samesite="lax",
        secure=_is_https(request),
        path="/",
    )


def _serialize_user(user: User) -> dict[str, Any]:
    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name or user.username,
        "email": user.email,
        "avatarUrl": user.avatar_url,
        "authProvider": user.auth_provider,
    }


def _public_base_url(request: Request, settings: Settings) -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    scheme = "https" if _is_https(request) else request.url.scheme
    host = (
        request.headers.get("x-forwarded-host", "").split(",")[0].strip()
        or request.headers.get("host", "").strip()
        or request.url.netloc
    )
    return f"{scheme}://{host}".rstrip("/")


def _google_redirect_uri(request: Request, settings: Settings) -> str:
    return f"{_public_base_url(request, settings)}/api/auth/google/callback"


def _pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def _render_index_html(landing: bool = False) -> str:
    raw = (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    flag_script = "<script>window.EGE_HOST={backend:true,landing:true};</script>" if landing else HOST_FLAG_SCRIPT
    target = '<script src="app.js"></script>'
    if target in raw:
        raw = raw.replace(target, flag_script + "\n" + target, 1)
    else:
        raw = raw + "\n" + flag_script
    return SHELL_PREFIX + raw + "</body></html>"


def create_app(custom_settings: Settings | None = None) -> FastAPI:
    settings = custom_settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.db = create_store(settings)
        app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0))
        app.state.limiter = RateLimiter()
        app.state.realtime = RealtimeBroker()
        try:
            yield
        finally:
            await app.state.http.aclose()
            app.state.db.close()

    app = FastAPI(title="Вектор ЕГЭ", lifespan=lifespan)
    app.state.settings = settings

    def current_user(request: Request) -> User | None:
        token = request.cookies.get(settings.session_cookie)
        return app.state.db.get_user_by_token(token)

    def require_user(request: Request) -> User:
        user = current_user(request)
        if not user:
            raise HTTPException(
                status_code=401,
                detail={"code": "session_expired", "message": "Нужно войти в аккаунт."},
            )
        return user

    @app.exception_handler(StorageError)
    async def handle_storage_error(_: Request, exc: StorageError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(AIError)
    async def handle_ai_error(_: Request, exc: AIError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.get("/api/health")
    async def health() -> dict[str, Any]:
        app.state.db.ping()
        return {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
        }

    @app.get("/api/health/storage")
    async def storage_health() -> dict[str, Any]:
        if hasattr(app.state.db, "storage_health"):
            return app.state.db.storage_health()
        app.state.db.ping()
        return {
            "ok": True,
            "mode": "sqlite",
            "sqlite": "ok",
            "postgres": "disabled",
            "outboxPending": 0,
        }

    @app.get("/api/me")
    async def me(request: Request) -> dict[str, Any]:
        user = current_user(request)
        return {
            "user": _serialize_user(user) if user else None,
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
            "inviteRequired": bool(settings.invite_code),
            "providers": {"local": True, "google": settings.google.enabled},
        }

    @app.post("/api/auth/register")
    async def register(payload: AuthPayload, request: Request, response: Response) -> dict[str, Any]:
        app.state.limiter.check(
            f"auth:{_client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        if settings.invite_code and not hmac.compare_digest(payload.inviteCode.strip(), settings.invite_code):
            raise HTTPException(
                status_code=403,
                detail={"code": "invalid_invite", "message": "Неверный код приглашения."},
            )
        user = app.state.db.create_user(
            payload.username,
            payload.password,
            email=payload.email or None,
            display_name=payload.displayName,
            max_users=settings.max_users,
        )
        token = app.state.db.create_session(user.id, settings.session_ttl_sec)
        _set_session_cookie(response, request, settings, token)
        return {"user": _serialize_user(user)}

    @app.post("/api/auth/login")
    async def login(payload: AuthPayload, request: Request, response: Response) -> dict[str, Any]:
        app.state.limiter.check(
            f"auth:{_client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        user = app.state.db.authenticate(payload.username, payload.password)
        if not user:
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_credentials", "message": "Неверный логин или пароль."},
            )
        token = app.state.db.create_session(user.id, settings.session_ttl_sec)
        _set_session_cookie(response, request, settings, token)
        return {"user": _serialize_user(user)}

    @app.post("/api/auth/logout")
    async def logout(request: Request, response: Response) -> dict[str, bool]:
        app.state.db.delete_session(request.cookies.get(settings.session_cookie))
        _clear_session_cookie(response, request, settings)
        return {"ok": True}

    @app.get("/api/auth/google/start")
    async def google_start(request: Request) -> RedirectResponse:
        if not settings.google.enabled:
            raise HTTPException(
                status_code=503,
                detail={"code": "google_not_configured", "message": "Вход через Google не настроен на сервере."},
            )
        app.state.limiter.check(
            f"auth:{_client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        code_verifier = secrets.token_urlsafe(48)
        redirect_uri = _google_redirect_uri(request, settings)
        state = app.state.db.create_oauth_state("google", code_verifier, redirect_uri)
        params = urlencode(
            {
                "client_id": settings.google.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": _pkce_challenge(code_verifier),
                "code_challenge_method": "S256",
                "prompt": "select_account",
            }
        )
        return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}", status_code=302)

    @app.get("/api/auth/google/callback")
    async def google_callback(
        request: Request,
        code: str = "",
        state: str = "",
        error: str = "",
    ) -> RedirectResponse:
        if not settings.google.enabled or error or not code or not state:
            return RedirectResponse(url="/?auth_error=google_denied", status_code=302)

        consumed = app.state.db.consume_oauth_state(state, "google")
        if not consumed:
            return RedirectResponse(url="/?auth_error=oauth_state", status_code=302)
        code_verifier, redirect_uri = consumed

        try:
            token_resp = await app.state.http.post(
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

            info_resp = await app.state.http.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if info_resp.status_code != 200:
                return RedirectResponse(url="/?auth_error=oauth_profile", status_code=302)
            info = info_resp.json() or {}
            sub = str(info.get("sub") or "").strip()
            if not sub:
                return RedirectResponse(url="/?auth_error=oauth_profile", status_code=302)
            user = app.state.db.upsert_oauth_user(
                "google",
                sub,
                email=info.get("email"),
                email_verified=bool(info.get("email_verified")),
                display_name=str(info.get("name") or ""),
                avatar_url=info.get("picture"),
                max_users=settings.max_users,
            )
        except StorageError as exc:
            err_code = exc.code if exc.code in ("user_limit", "invalid_email") else "oauth_failed"
            return RedirectResponse(url=f"/?auth_error={err_code}", status_code=302)
        except httpx.HTTPError:
            return RedirectResponse(url="/?auth_error=oauth_failed", status_code=302)

        token = app.state.db.create_session(user.id, settings.session_ttl_sec)
        resp = RedirectResponse(url="/", status_code=302)
        _set_session_cookie(resp, request, settings, token)
        return resp

    @app.get("/api/docs")
    async def list_docs(request: Request) -> dict[str, Any]:
        user = require_user(request)
        return {"docs": app.state.db.get_docs(user.id)}

    @app.patch("/api/docs/{name}")
    async def patch_doc(name: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, bool]:
        user = require_user(request)
        app.state.db.patch_doc(user.id, name, payload, settings.max_doc_bytes)
        return {"ok": True}

    @app.put("/api/docs/{name}")
    async def put_doc(name: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, bool]:
        user = require_user(request)
        app.state.db.replace_doc(user.id, name, payload, settings.max_doc_bytes)
        return {"ok": True}

    @app.post("/api/ai")
    async def ai_proxy(payload: AIRequestPayload, request: Request):
        user = require_user(request)
        if not settings.ai.enabled:
            raise AIError("not_granted", "ИИ-помощник не настроен на сервере.", 503)
        app.state.limiter.check(
            f"ai:{user.id}",
            settings.ai_rate_limit,
            settings.ai_rate_window_sec,
        )

        if payload.mode == "json":
            data = await complete_ai_json(app.state.http, settings.ai, payload.messages, payload.modelTier)
            return {"data": data}

        async def sse_gen():
            try:
                async for chunk in stream_ai_text(app.state.http, settings.ai, payload.messages, payload.modelTier):
                    yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
            except AIError as exc:
                yield f"data: {json.dumps({'error': exc.code, 'message': exc.message}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            sse_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    @app.get("/api/realtime/recent")
    async def realtime_recent(
        channel: str = "all",
        tutor_slug: str | None = None,
        since_id: int = 0,
        limit: int = 30,
    ) -> dict[str, Any]:
        events = app.state.realtime.recent(
            app.state.db,
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=limit,
        )
        latest_id = int(events[-1]["id"]) if events else max(0, int(since_id or 0))
        return {"ok": True, "events": events, "latestId": latest_id}

    @app.post("/api/realtime/publish")
    async def realtime_publish(payload: RealtimePublishPayload) -> dict[str, Any]:
        evt = app.state.realtime.publish(
            app.state.db,
            channel=payload.channel,
            event_type=payload.eventType,
            title=payload.title,
            message=payload.message,
            tutor_slug=payload.tutorSlug,
            payload=payload.payload,
        )
        return {"ok": True, "event": evt}

    @app.get("/api/realtime/stream")
    async def realtime_stream(
        request: Request,
        channel: str = "all",
        tutor_slug: str | None = None,
        since_id: int = 0,
        once: int = 0,
    ) -> StreamingResponse:
        effective_since = max(0, int(since_id or 0))
        last_event_id = (request.headers.get("last-event-id") or "").strip()
        if last_event_id:
            try:
                effective_since = max(effective_since, int(last_event_id))
            except ValueError:
                pass
        return StreamingResponse(
            app.state.realtime.sse_stream(
                app.state.db,
                channel=channel,
                tutor_slug=tutor_slug,
                since_id=effective_since,
                once=bool(once),
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @app.websocket("/api/realtime/ws")
    async def realtime_ws(websocket: WebSocket) -> None:
        channel = websocket.query_params.get("channel", "all")
        tutor_slug = websocket.query_params.get("tutor_slug") or None
        try:
            since_id = max(0, int(websocket.query_params.get("since_id") or 0))
        except ValueError:
            since_id = 0

        await websocket.accept()
        send_lock = asyncio.Lock()

        async def send_json_safe(data: dict[str, Any]) -> None:
            async with send_lock:
                await websocket.send_json(data)

        sub_id, queue = app.state.realtime.subscribe(channel=channel, tutor_slug=tutor_slug)
        recent = app.state.realtime.recent(
            app.state.db,
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=30,
        )
        latest_id = int(recent[-1]["id"]) if recent else since_id
        await send_json_safe(
            {
                "type": "connected",
                "transport": "ws",
                "channel": channel or "all",
                "tutorSlug": tutor_slug,
                "latestId": latest_id,
                "events": recent,
            }
        )

        async def pump_events() -> None:
            last_sent = latest_id
            while True:
                evt = await queue.get()
                eid = int(evt.get("id") or 0)
                if eid <= last_sent:
                    continue
                last_sent = eid
                await send_json_safe({"type": "event", "event": evt})

        sender_task = asyncio.create_task(pump_events())
        try:
            while True:
                msg = await websocket.receive_json()
                if not isinstance(msg, dict):
                    continue
                msg_type = str(msg.get("type") or "").strip().lower()
                if msg_type == "ping":
                    await send_json_safe({"type": "pong", "ts": int(time.time())})
                elif msg_type == "publish":
                    app.state.realtime.publish(
                        app.state.db,
                        channel=str(msg.get("channel") or (channel if channel != "all" else "tutor")),
                        event_type=str(msg.get("eventType") or "ws.message"),
                        title=str(msg.get("title") or "Обновление"),
                        message=str(msg.get("message") or ""),
                        tutor_slug=msg.get("tutorSlug") or tutor_slug,
                        payload=msg.get("payload") if isinstance(msg.get("payload"), dict) else {},
                    )
        except WebSocketDisconnect:
            pass
        finally:
            sender_task.cancel()
            try:
                await sender_task
            except asyncio.CancelledError:
                pass
            app.state.realtime.unsubscribe(sub_id)

    @app.get("/api/calendar/state")
    async def calendar_state(request: Request, tutor_slug: str = "anna-sokolova") -> dict[str, Any]:
        cal_state = app.state.db.get_calendar_by_slug(tutor_slug)
        if not cal_state:
            return {
                "ok": True,
                "synced": False,
                "tutorSlug": tutor_slug,
                "timezone": "UTC+9",
                "ianaTimezone": "Asia/Yakutsk",
                "openSlots": {},
                "busySlots": [],
                "events": [],
            }
        tz_code, iana_name, _, _ = resolve_timezone_info(cal_state.get("timezone"), cal_state.get("city"))
        urls = build_google_calendar_urls(
            base_url=_public_base_url(request, settings),
            feed_token=cal_state["feedToken"],
            cal_state=cal_state,
        )
        return {
            "ok": True,
            "synced": True,
            **cal_state,
            "timezone": tz_code,
            "ianaTimezone": iana_name,
            **urls,
        }

    @app.put("/api/calendar/sync")
    async def calendar_sync(payload: CalendarSyncPayload, request: Request) -> dict[str, Any]:
        user = current_user(request)
        tz_code, iana_name, _, _ = resolve_timezone_info(payload.timezone, payload.city)
        events = normalize_lessons_to_events(
            payload.lessons,
            tutor_slug=payload.tutorSlug,
            timezone_str=tz_code,
            city=payload.city,
        )
        cal_state = app.state.db.upsert_calendar_sync(
            tutor_slug=payload.tutorSlug,
            user_id=user.id if user else None,
            tutor_name=payload.tutorName,
            city=payload.city,
            timezone=tz_code,
            open_slots=payload.openSlots,
            events=events,
        )
        urls = build_google_calendar_urls(
            base_url=_public_base_url(request, settings),
            feed_token=cal_state["feedToken"],
            cal_state=cal_state,
        )
        return {
            "ok": True,
            "feedToken": cal_state["feedToken"],
            "tutorSlug": cal_state["tutorSlug"],
            "timezone": tz_code,
            "ianaTimezone": iana_name,
            "eventCount": len(cal_state.get("events") or []),
            "busySlots": cal_state.get("busySlots") or [],
            **urls,
        }

    @app.get("/api/calendar/{feed_token}.ics")
    async def calendar_ics_feed(feed_token: str) -> Response:
        cal_state = app.state.db.get_calendar_by_token(feed_token)
        if not cal_state:
            raise HTTPException(
                status_code=404,
                detail={"code": "calendar_not_found", "message": "Календарь не найден."},
            )
        ics_body = generate_ics(cal_state)
        return Response(
            content=ics_body,
            media_type="text/calendar; charset=utf-8",
            headers={
                "Content-Disposition": f'inline; filename="{cal_state["tutorSlug"]}.ics"',
                "Cache-Control": "no-cache",
            },
        )

    @app.post("/api/calendar/import-ics")
    async def calendar_import_ics(payload: CalendarImportPayload, request: Request) -> dict[str, Any]:
        user = current_user(request)
        tz_code, iana_name, _, _ = resolve_timezone_info(payload.timezone, payload.city)
        ics_text = (payload.icsText or "").strip()
        external_url = (payload.icsUrl or "").strip() or None

        if not ics_text and external_url:
            try:
                safe_url = validate_public_ics_url(external_url)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "invalid_ics_url", "message": str(exc)},
                ) from exc
            try:
                resp = await app.state.http.get(safe_url, follow_redirects=False)
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=502,
                    detail={"code": "ics_fetch_failed", "message": f"Не удалось загрузить .ics: {exc}"},
                ) from exc
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail={"code": "ics_fetch_failed", "message": f"Удалённый сервер вернул HTTP {resp.status_code}."},
                )
            ics_text = resp.text[:2_000_000].strip()

        if not ics_text:
            raise HTTPException(
                status_code=400,
                detail={"code": "empty_ics", "message": "Передайте .ics текст или публичную https:// ссылку."},
            )

        busy_slots = parse_ics_busy_slots(ics_text, target_timezone=tz_code)
        if payload.lessons:
            events_to_save: list[dict[str, Any]] | None = normalize_lessons_to_events(
                payload.lessons,
                tutor_slug=payload.tutorSlug,
                timezone_str=tz_code,
                city=payload.city,
            )
            events_for_conflicts = events_to_save
        else:
            existing = app.state.db.get_calendar_by_slug(payload.tutorSlug)
            events_to_save = None
            events_for_conflicts = (existing or {}).get("events") or []

        conflicts = detect_busy_conflicts(events_for_conflicts, busy_slots)
        cal_state = app.state.db.upsert_calendar_sync(
            tutor_slug=payload.tutorSlug,
            user_id=user.id if user else None,
            tutor_name=payload.tutorName,
            city=payload.city,
            timezone=tz_code,
            open_slots=payload.openSlots or None,
            events=events_to_save,
            external_ics_url=external_url,
            gcal_connected=True,
            busy_slots=busy_slots,
        )
        urls = build_google_calendar_urls(
            base_url=_public_base_url(request, settings),
            feed_token=cal_state["feedToken"],
            cal_state=cal_state,
        )
        app.state.realtime.publish(
            app.state.db,
            channel="tutor",
            event_type="calendar.synced",
            title="Календарь синхронизирован",
            message=f"Импортировано слотов: {len(busy_slots)} ({tz_code})",
            tutor_slug=payload.tutorSlug,
            payload={
                "timezone": tz_code,
                "ianaTimezone": iana_name,
                "importedCount": len(busy_slots),
                "conflictsCount": len(conflicts),
            },
        )
        return {
            "ok": True,
            "importedCount": len(busy_slots),
            "busySlots": busy_slots,
            "conflicts": conflicts,
            "feedToken": cal_state["feedToken"],
            "timezone": tz_code,
            "ianaTimezone": iana_name,
            **urls,
        }

    @app.get("/", response_class=HTMLResponse)
    @app.get("/index.html", response_class=HTMLResponse)
    async def index_page() -> HTMLResponse:
        return HTMLResponse(
            content=_render_index_html(),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/landing", response_class=HTMLResponse)
    async def landing_page() -> HTMLResponse:
        return HTMLResponse(
            content=_render_index_html(landing=True),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/brandbook", response_class=HTMLResponse)
    async def brandbook_page() -> HTMLResponse:
        return HTMLResponse(
            content=_render_index_html(landing=True),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/fees", response_class=HTMLResponse)
    async def fees_page() -> HTMLResponse:
        return HTMLResponse(
            content=_render_index_html(landing=True),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/privacy", response_class=HTMLResponse)
    async def privacy_page() -> HTMLResponse:
        html = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Политика конфиденциальности — Вектор ЕГЭ</title><style>
body{margin:0;background:#f2f7f4;color:#102419;font:15px/1.6 system-ui,-apple-system,sans-serif;padding:32px 16px}
main{max-width:720px;margin:0 auto;background:#fff;border:1px solid #d4e3da;border-radius:14px;padding:28px}
h1{margin:0 0 12px;font-size:24px}h2{margin:20px 0 8px;font-size:17px}p,li{color:#3b5546}a{color:#13794b}
</style></head><body><main>
<h1>Политика конфиденциальности «Вектор ЕГЭ»</h1>
<p>Настоящая страница описывает, какие данные обрабатывает образовательное веб-приложение «Вектор ЕГЭ».</p>
<h2>Какие данные мы получаем</h2>
<ul><li>При регистрации или входе через Google — имя, адрес электронной почты и изображение профиля (если предоставлено Google).</li>
<li>Данные вашей подготовки — результаты тестов, прочитанные темы, отметки плана поступления, пробники и сочинения.</li></ul>
<h2>Как используются данные</h2>
<p>Данные используются исключительно для авторизации и сохранения прогресса подготовки между вашими устройствами. Мы не передаём и не продаём персональные данные третьим лицам.</p>
<h2>Удаление и связь</h2>
<p>По вопросам обработки или удаления данных аккаунта обращайтесь к администратору сервиса по контакту, указанному на экране входа Google.</p>
<p><a href="/">← Вернуться в «Вектор ЕГЭ»</a></p>
</main></body></html>"""
        return HTMLResponse(content=html, headers={"Cache-Control": "no-cache"})

    @app.get("/{asset_path:path}")
    async def static_assets(asset_path: str) -> FileResponse:
        clean = asset_path.strip("/")
        media_type = "application/javascript; charset=utf-8"

        if clean.startswith("ux-ui/"):
            rest = clean[len("ux-ui/"):]
            if rest.startswith("styles/") and rest.endswith(".css"):
                target = (UX_UI_DIR / rest).resolve()
                allowed_dir = (UX_UI_DIR / "styles").resolve()
                media_type = "text/css; charset=utf-8"
            elif rest.startswith(("components/", "brandbook/")) and rest.endswith(".js"):
                sub = rest.split("/", 1)[0]
                target = (UX_UI_DIR / rest).resolve()
                allowed_dir = (UX_UI_DIR / sub).resolve()
            else:
                raise HTTPException(status_code=404, detail="Not found")
        elif clean in {"app.js", "bank-core.js"}:
            target = (FRONTEND_DIR / clean).resolve()
            allowed_dir = FRONTEND_DIR.resolve()
        elif clean.startswith("styles/") and clean.endswith(".css"):
            target = (FRONTEND_DIR / clean).resolve()
            allowed_dir = (FRONTEND_DIR / "styles").resolve()
            media_type = "text/css; charset=utf-8"
        elif clean.startswith(("core/", "views/", "data/", "subjects/")) and clean.endswith(".js"):
            top = clean.split("/", 1)[0]
            target = (FRONTEND_DIR / clean).resolve()
            allowed_dir = (FRONTEND_DIR / top).resolve()
        elif clean.startswith("assets/") and clean.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
            target = (FRONTEND_DIR / clean).resolve()
            allowed_dir = (FRONTEND_DIR / "assets").resolve()
            ext = target.suffix.lower()
            if ext in {".jpg", ".jpeg"}:
                media_type = "image/jpeg"
            elif ext == ".png":
                media_type = "image/png"
            elif ext == ".webp":
                media_type = "image/webp"
            else:
                media_type = "image/svg+xml; charset=utf-8"
        else:
            raise HTTPException(status_code=404, detail="Not found")

        if not target.is_relative_to(allowed_dir) or not target.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(
            target,
            media_type=media_type,
            headers={"Cache-Control": "no-cache"},
        )

    return app


app = create_app()
