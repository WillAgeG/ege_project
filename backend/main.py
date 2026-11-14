"""FastAPI-сервер для платформы «Вектор ЕГЭ» (статика, аккаунты, SQLite и ИИ-прокси)."""

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

from fastapi import Body, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
import httpx
from pydantic import BaseModel, Field

from .ai import AIError, complete_ai_json, stream_ai_text
from .config import ROOT_DIR, Settings, load_settings
from databases.sqlite.store import Database, StorageError, User

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


def _google_redirect_uri(request: Request, settings: Settings) -> str:
    if settings.public_base_url:
        return f"{settings.public_base_url}/api/auth/google/callback"
    scheme = "https" if _is_https(request) else request.url.scheme
    host = (
        request.headers.get("x-forwarded-host", "").split(",")[0].strip()
        or request.headers.get("host", "").strip()
        or request.url.netloc
    )
    return f"{scheme}://{host}/api/auth/google/callback"


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
        app.state.db = Database(settings.db_path)
        app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0))
        app.state.limiter = RateLimiter()
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
