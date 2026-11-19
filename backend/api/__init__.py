"""Headless API пакет: только JSON / SSE / WebSocket / .ics роуты без HTML и UI-Kit."""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import httpx

from ..ai import AIError
from ..config import Settings, load_settings
from ..realtime import RealtimeBroker
from databases.postgres.store import create_store
from databases.sqlite.store import StorageError
from .admin import create_admin_router
from .auth_docs import RateLimiter, create_auth_docs_router
from .marketplace import create_marketplace_router
from .realtime_calendar import create_realtime_calendar_router

DEFAULT_CORS_ORIGINS = [
    "http://127.0.0.1:8770",
    "http://localhost:8770",
    "http://127.0.0.1:8772",
    "http://localhost:8772",
]


def create_api_router(settings: Settings) -> APIRouter:
    router = APIRouter()
    router.include_router(create_auth_docs_router(settings))
    router.include_router(create_realtime_calendar_router(settings))
    router.include_router(create_marketplace_router(settings))
    router.include_router(create_admin_router(settings))
    return router


def create_api_app(
    custom_settings: Settings | None = None,
    *,
    enable_cors: bool = True,
    cors_origins: list[str] | None = None,
) -> FastAPI:
    """Создаёт чистое headless FastAPI приложение без HTML-оболочки и статики."""
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

    app = FastAPI(
        title="Вектор ЕГЭ — Headless API",
        version="1.2.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )
    app.state.settings = settings

    if enable_cors:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=cors_origins or DEFAULT_CORS_ORIGINS,
            allow_credentials=True,
            allow_methods=["*"],
            allow_headers=["*"],
        )

    @app.exception_handler(StorageError)
    async def handle_storage_error(_: Request, exc: StorageError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    @app.exception_handler(AIError)
    async def handle_ai_error(_: Request, exc: AIError) -> JSONResponse:
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "message": exc.message})

    app.include_router(create_api_router(settings))
    return app


__all__ = ["DEFAULT_CORS_ORIGINS", "create_api_app", "create_api_router"]
