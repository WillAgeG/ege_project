"""FastAPI-сервер для сайта «Путь в медицину» (статика, аккаунты, SQLite и ИИ-прокси)."""

from collections import deque
from contextlib import asynccontextmanager
import hmac
import json
from pathlib import Path
import threading
import time
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, StreamingResponse
import httpx
from pydantic import BaseModel, Field

from .ai import AIError, complete_ai_json, stream_ai_text
from .config import ROOT_DIR, Settings, load_settings
from .db import Database, StorageError, User

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
    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1, max_length=256)
    inviteCode: str = Field(default="", max_length=128)


class AIRequestPayload(BaseModel):
    mode: str = Field(default="text")
    messages: str | list[dict[str, Any]]
    modelTier: str | None = Field(default=None)


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


def _render_index_html() -> str:
    raw = (ROOT_DIR / "index.html").read_text(encoding="utf-8")
    target = '<script src="app.js"></script>'
    if target in raw:
        raw = raw.replace(target, HOST_FLAG_SCRIPT + "\n" + target, 1)
    else:
        raw = raw + "\n" + HOST_FLAG_SCRIPT
    return SHELL_PREFIX + raw + "</body></html>"


def create_app(custom_settings: Settings | None = None) -> FastAPI:
    settings = custom_settings or load_settings()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.db = Database(settings.db_path)
        app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0))
        app.state.limiter = RateLimiter()
        try:
            yield
        finally:
            await app.state.http.aclose()
            app.state.db.close()

    app = FastAPI(title="Путь в медицину", lifespan=lifespan)
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

    @app.get("/api/me")
    async def me(request: Request) -> dict[str, Any]:
        user = current_user(request)
        return {
            "user": {"id": user.id, "username": user.username} if user else None,
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
            "inviteRequired": bool(settings.invite_code),
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
        user = app.state.db.create_user(payload.username, payload.password, max_users=settings.max_users)
        token = app.state.db.create_session(user.id, settings.session_ttl_sec)
        _set_session_cookie(response, request, settings, token)
        return {"user": {"id": user.id, "username": user.username}}

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
        return {"user": {"id": user.id, "username": user.username}}

    @app.post("/api/auth/logout")
    async def logout(request: Request, response: Response) -> dict[str, bool]:
        app.state.db.delete_session(request.cookies.get(settings.session_cookie))
        _clear_session_cookie(response, request, settings)
        return {"ok": True}

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

    @app.get("/", response_class=HTMLResponse)
    @app.get("/index.html", response_class=HTMLResponse)
    async def index_page() -> HTMLResponse:
        return HTMLResponse(
            content=_render_index_html(),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/{asset_path:path}")
    async def static_assets(asset_path: str) -> FileResponse:
        clean = asset_path.strip("/")
        allowed_root = {"app.js", "bank-core.js"}
        if clean in allowed_root:
            target = (ROOT_DIR / clean).resolve()
        elif (clean.startswith("subjects/") or clean.startswith("data/")) and clean.endswith(".js"):
            target = (ROOT_DIR / clean).resolve()
            allowed_dir = (ROOT_DIR / clean.split("/", 1)[0]).resolve()
            if not target.is_relative_to(allowed_dir):
                raise HTTPException(status_code=404, detail="Not found")
        else:
            raise HTTPException(status_code=404, detail="Not found")

        if not target.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(
            target,
            media_type="application/javascript; charset=utf-8",
            headers={"Cache-Control": "no-cache"},
        )

    return app


app = create_app()
