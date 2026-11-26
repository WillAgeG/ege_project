"""Headless API пакет: только JSON / SSE / WebSocket / .ics роуты без HTML и UI-Kit."""

from __future__ import annotations

from contextlib import asynccontextmanager
import json
from typing import Iterable
from urllib.parse import urlsplit

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx

from ..ai import AIError
from ..backups import BackupManager
from ..config import Settings, load_settings
from ..media_storage import MediaStorageError, MediaValidationError, create_media_storage
from ..monitoring import ErrorMonitor, ErrorMonitoringMiddleware
from ..npd_fns import FnsNpdClient, NpdError
from ..observability import MetricsRegistry, RequestObservabilityMiddleware, configure_logging
from ..otp_delivery import OtpDeliveryService
from ..payouts import PayoutGatewayError, YooKassaPayoutsClient
from ..realtime import RealtimeBroker
from ..scheduler import BackgroundScheduler
from ..telegram_bot import TelegramBotService
from ..yookassa import YooKassaClient, YooKassaError
from databases.postgres.store import create_store
from databases.sqlite.store import StorageError
from .admin import create_admin_router
from .auth_docs import PhoneOtpStore, RateLimiter, create_auth_docs_router, is_trusted_proxy_peer
from .chat import create_chat_router
from .feedback import create_feedback_router
from .marketplace import create_marketplace_router
from .media import create_media_router
from .payments import create_payments_router
from .payouts import create_payouts_router
from .realtime_calendar import create_realtime_calendar_router
from .telegram import create_telegram_router

DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:8770",
    "http://localhost:8770",
    "http://127.0.0.1:8772",
    "http://localhost:8772",
]

_CSRF_SAFE_METHODS = {"GET", "HEAD", "OPTIONS", "TRACE"}
_CSRF_EXEMPT_PATHS = {
    "/api/payments/yookassa/webhook",
    "/api/payouts/yookassa/webhook",
    "/api/telegram/webhook",
}


def _normalize_origin(raw: str | None) -> str | None:
    txt = str(raw or "").strip()
    if not txt or txt.lower() == "null":
        return None
    parsed = urlsplit(txt)
    if parsed.scheme.lower() not in ("http", "https") or not parsed.netloc:
        return None
    return f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"


def _has_cookie(headers: dict[bytes, bytes], cookie_name: str) -> bool:
    raw_cookie = headers.get(b"cookie", b"").decode("latin-1", errors="ignore")
    if not raw_cookie:
        return False
    prefix = f"{cookie_name}="
    for part in raw_cookie.split(";"):
        if part.strip().startswith(prefix):
            return True
    return False


class CsrfOriginMiddleware:
    """Pure-ASGI защита от CSRF через проверку Sec-Fetch-Site / Origin / Referer для cookie-запросов."""

    def __init__(
        self,
        app,
        *,
        settings: Settings,
        allowed_origins: Iterable[str] = (),
    ) -> None:
        self.app = app
        self.settings = settings
        self.session_cookie = str(getattr(settings, "session_cookie", "pvm_session") or "pvm_session")
        self.allowed_origins: set[str] = {
            norm for item in allowed_origins if (norm := _normalize_origin(item))
        }
        pub = _normalize_origin(getattr(settings, "public_base_url", None))
        if pub:
            self.allowed_origins.add(pub)

    def _allowed_for_scope(self, scope: dict, hdrs: dict[bytes, bytes]) -> set[str]:
        allowed = set(self.allowed_origins)
        peer_info = scope.get("client")
        peer_host = peer_info[0] if (isinstance(peer_info, (tuple, list)) and peer_info) else ""
        hosts: list[str] = []
        raw_host = hdrs.get(b"host", b"").decode("latin-1", errors="ignore").strip().lower()
        if raw_host:
            hosts.append(raw_host)
        if is_trusted_proxy_peer(peer_host, self.settings):
            fwd_host = hdrs.get(b"x-forwarded-host", b"").decode("latin-1", errors="ignore").split(",")[0].strip().lower()
            if fwd_host:
                hosts.append(fwd_host)
        for h in hosts:
            allowed.add(f"http://{h}")
            allowed.add(f"https://{h}")
        return allowed

    @staticmethod
    async def _send_csrf_error(send) -> None:
        body = json.dumps(
            {
                "detail": {
                    "code": "csrf_origin_forbidden",
                    "message": "Запрос отклонён защитой CSRF: недопустимый Origin.",
                }
            },
            ensure_ascii=False,
        ).encode("utf-8")
        await send(
            {
                "type": "http.response.start",
                "status": 403,
                "headers": [
                    (b"content-type", b"application/json; charset=utf-8"),
                    (b"content-length", str(len(body)).encode("ascii")),
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return
        method = str(scope.get("method") or "GET").upper()
        if method in _CSRF_SAFE_METHODS:
            await self.app(scope, receive, send)
            return
        path = str(scope.get("path") or "")
        if path in _CSRF_EXEMPT_PATHS or not path.startswith("/api/"):
            await self.app(scope, receive, send)
            return

        hdrs = {k.lower(): v for k, v in (scope.get("headers") or ())}
        if hdrs.get(b"x-admin-token") or hdrs.get(b"authorization", b"").lower().startswith(b"bearer "):
            await self.app(scope, receive, send)
            return
        if not _has_cookie(hdrs, self.session_cookie):
            await self.app(scope, receive, send)
            return

        sec_fetch_site = hdrs.get(b"sec-fetch-site", b"").decode("latin-1", errors="ignore").strip().lower()
        if sec_fetch_site == "cross-site":
            await self._send_csrf_error(send)
            return

        allowed = self._allowed_for_scope(scope, hdrs)
        raw_origin = hdrs.get(b"origin")
        if raw_origin is not None:
            origin_norm = _normalize_origin(raw_origin.decode("latin-1", errors="ignore"))
            if not origin_norm or origin_norm not in allowed:
                await self._send_csrf_error(send)
                return
        else:
            raw_referer = hdrs.get(b"referer")
            if raw_referer is not None:
                ref_norm = _normalize_origin(raw_referer.decode("latin-1", errors="ignore"))
                if not ref_norm or ref_norm not in allowed:
                    await self._send_csrf_error(send)
                    return

        await self.app(scope, receive, send)


def _build_csp_policy(settings: Settings | None) -> str:
    script_src = ["'self'"]
    style_src = ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]
    font_src = ["'self'", "https://fonts.gstatic.com", "data:"]
    img_src = ["'self'", "data:", "blob:", "https:"]
    connect_src = ["'self'", "ws:", "wss:", "https:"]
    frame_src = ["'self'"]
    form_action = ["'self'", "https://accounts.google.com"]

    if settings is not None and getattr(getattr(settings, "analytics", None), "enabled", False):
        for origin in ("https://mc.yandex.ru", "https://mc.yandex.com"):
            script_src.append(origin)
            img_src.append(origin)
            connect_src.append(origin)
            frame_src.append(origin)
        connect_src.append("wss://mc.yandex.ru")

    if settings is not None and getattr(getattr(settings, "telegram", None), "enabled", False):
        script_src.append("https://telegram.org")
        frame_src.append("https://oauth.telegram.org")
        form_action.append("https://oauth.telegram.org")

    if settings is not None and getattr(getattr(settings, "payments", None), "yookassa_configured", False):
        form_action.extend(["https://yookassa.ru", "https://yoomoney.ru"])

    return (
        "default-src 'self'; "
        f"script-src {' '.join(script_src)}; "
        f"style-src {' '.join(style_src)}; "
        f"font-src {' '.join(font_src)}; "
        f"img-src {' '.join(img_src)}; "
        f"connect-src {' '.join(connect_src)}; "
        f"frame-src {' '.join(frame_src)}; "
        "frame-ancestors 'self'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        f"form-action {' '.join(form_action)}"
    )


_CSP_POLICY = _build_csp_policy(None)


class SecurityHeadersMiddleware:
    """Pure-ASGI middleware добавляющий security-заголовки без буферизации SSE/WS."""

    def __init__(self, app, *, csp_policy: str = _CSP_POLICY, is_prod: bool = False) -> None:
        self.app = app
        self._csp_bytes = csp_policy.encode("latin-1")
        self._is_prod = bool(is_prod)

    @staticmethod
    def _is_https_scope(scope: dict) -> bool:
        if scope.get("scheme") == "https":
            return True
        for k, v in scope.get("headers") or ():
            if k.lower() == b"x-forwarded-proto":
                proto = v.decode("latin-1", errors="ignore").split(",")[0].strip().lower()
                if proto == "https":
                    return True
        return False

    async def __call__(self, scope, receive, send) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "") or ""
        skip_csp = (not self._is_prod) and (
            path in ("/docs", "/redoc", "/design", "/studio")
            or path.startswith(("/docs/", "/redoc/"))
        )
        https_req = self._is_https_scope(scope)

        async def send_with_security_headers(message) -> None:
            if message.get("type") == "http.response.start":
                raw_headers = list(message.get("headers") or [])
                present = {k.lower() for k, _ in raw_headers}

                def _set_if_missing(name: bytes, val: bytes) -> None:
                    if name not in present:
                        raw_headers.append((name, val))
                        present.add(name)

                _set_if_missing(b"x-content-type-options", b"nosniff")
                _set_if_missing(b"x-frame-options", b"SAMEORIGIN")
                _set_if_missing(b"referrer-policy", b"strict-origin-when-cross-origin")
                _set_if_missing(b"permissions-policy", b"camera=(self), microphone=(self), geolocation=(), payment=()")
                _set_if_missing(b"x-permitted-cross-domain-policies", b"none")
                if not skip_csp:
                    _set_if_missing(b"content-security-policy", self._csp_bytes)
                if https_req:
                    _set_if_missing(b"strict-transport-security", b"max-age=31536000; includeSubDomains")
                message["headers"] = raw_headers
            await send(message)

        await self.app(scope, receive, send_with_security_headers)


def _resolve_cors_origins(settings: Settings, explicit: Iterable[str] | None) -> list[str]:
    base = (
        list(explicit)
        if explicit is not None
        else (list(settings.cors_origins) if settings.cors_origins else list(DEFAULT_CORS_ORIGINS))
    )
    pub = (settings.public_base_url or "").strip().rstrip("/")
    if pub and pub not in base:
        base.append(pub)
    return base


def create_api_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    router.include_router(create_auth_docs_router(settings))
    router.include_router(create_realtime_calendar_router(settings))
    router.include_router(create_marketplace_router(settings))
    router.include_router(create_media_router(settings))
    router.include_router(create_payments_router(settings))
    router.include_router(create_payouts_router(settings))
    router.include_router(create_admin_router(settings))
    router.include_router(create_feedback_router(settings))
    router.include_router(create_telegram_router(settings))
    router.include_router(create_chat_router(settings))
    return router


def create_api_app(
    custom_settings: Settings | None = None,
    *,
    enable_cors: bool = True,
    cors_origins: list[str] | None = None,
) -> FastAPI:
    """Создаёт чистое headless FastAPI приложение без HTML-оболочки и статики."""
    settings = custom_settings or load_settings()
    configure_logging(
        json_logs=bool(getattr(settings.monitoring, "json_logs", False)),
        level=str(getattr(settings.monitoring, "log_level", "INFO") or "INFO"),
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.db = create_store(settings)
        app.state.http = httpx.AsyncClient(timeout=httpx.Timeout(90.0, connect=15.0))
        app.state.limiter = RateLimiter(db_getter=lambda: getattr(app.state, "db", None))
        app.state.otp_store = PhoneOtpStore(db_getter=lambda: getattr(app.state, "db", None))
        app.state.realtime = RealtimeBroker()
        if (
            settings.database_url
            and (settings.db_mode or "auto").strip().lower() != "sqlite"
            and bool(getattr(settings, "realtime_pg_notify_enabled", True))
        ):
            app.state.realtime.start_pg_listener(settings.database_url, db=app.state.db)
        app.state.telegram = TelegramBotService(
            settings=settings,
            db=app.state.db,
            http_getter=lambda: app.state.http,
            realtime=app.state.realtime,
        )
        app.state.otp_delivery = OtpDeliveryService(
            settings.otp,
            http_getter=lambda: app.state.http,
        )
        app.state.backups = BackupManager(settings)
        app.state.media_storage = create_media_storage(
            settings,
            http_getter=lambda: app.state.http,
        )
        app.state.yookassa = YooKassaClient(
            settings.payments,
            http_getter=lambda: app.state.http,
        )
        app.state.payout_gateway = YooKassaPayoutsClient(
            settings.payouts,
            http_getter=lambda: app.state.http,
        )
        app.state.npd_client = FnsNpdClient(
            settings.payouts,
            http_getter=lambda: app.state.http,
        )
        app.state.monitor = ErrorMonitor(
            settings=settings,
            telegram=app.state.telegram,
            http_getter=lambda: app.state.http,
        )
        app.state.scheduler = BackgroundScheduler(
            settings=settings,
            db=app.state.db,
            realtime=app.state.realtime,
            telegram=app.state.telegram,
            otp_delivery=app.state.otp_delivery,
            backups=app.state.backups,
            monitor=app.state.monitor,
            yookassa=app.state.yookassa,
            payout_gateway=app.state.payout_gateway,
            npd_client=app.state.npd_client,
        )
        app.state.scheduler.start()
        try:
            yield
        finally:
            await app.state.scheduler.stop()
            app.state.realtime.stop_pg_listener()
            await app.state.http.aclose()
            app.state.db.close()

    expose_docs = str(getattr(settings, "env", "development") or "development").strip().lower() != "production"
    app = FastAPI(
        title="Вектор — Headless API",
        version="1.2.0",
        docs_url="/docs" if expose_docs else None,
        redoc_url="/redoc" if expose_docs else None,
        openapi_url="/openapi.json" if expose_docs else None,
        lifespan=lifespan,
    )
    app.state.settings = settings
    app.state.metrics = MetricsRegistry()
    resolved_cors = _resolve_cors_origins(settings, cors_origins)

    app.add_middleware(ErrorMonitoringMiddleware)
    app.add_middleware(CsrfOriginMiddleware, settings=settings, allowed_origins=resolved_cors)

    if settings.security_headers:
        app.add_middleware(
            SecurityHeadersMiddleware,
            csp_policy=_build_csp_policy(settings),
            is_prod=not expose_docs,
        )

    if enable_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=resolved_cors,
            allow_credentials=True,
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=[
                "Content-Type",
                "Authorization",
                "X-Admin-Token",
                "X-Metrics-Token",
                "X-Request-ID",
                "X-Requested-With",
                "Last-Event-ID",
            ],
            expose_headers=["X-Request-ID"],
        )

    app.add_middleware(RequestObservabilityMiddleware)

    @app.exception_handler(StorageError)
    async def handle_storage_error(_: Request, exc: StorageError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(AIError)
    async def handle_ai_error(_: Request, exc: AIError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(MediaValidationError)
    async def handle_media_validation_error(_: Request, exc: MediaValidationError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(MediaStorageError)
    async def handle_media_storage_error(_: Request, exc: MediaStorageError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(YooKassaError)
    async def handle_yookassa_error(_: Request, exc: YooKassaError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(PayoutGatewayError)
    async def handle_payout_gateway_error(_: Request, exc: PayoutGatewayError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(NpdError)
    async def handle_npd_error(_: Request, exc: NpdError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    app.include_router(create_api_router(settings))
    return app


__all__ = [
    "CsrfOriginMiddleware",
    "DEFAULT_CORS_ORIGINS",
    "SecurityHeadersMiddleware",
    "create_api_app",
    "create_api_router",
]
