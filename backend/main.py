"""Компоновщик FastAPI-сервера «Вектор» (Headless API + SSR-оболочка SPA)."""

from __future__ import annotations

from fastapi import FastAPI
from starlette.middleware.gzip import GZipMiddleware

from .api import create_api_app
from .config import ROOT_DIR, Settings, load_settings
from .shell import register_shell_routes


class SseSafeGZipMiddleware:
    """Сжимает статику и API JSON через GZip, не буферизуя SSE и AI-потоки."""

    def __init__(self, app, minimum_size: int = 800) -> None:
        self.app = app
        self.gzip_app = GZipMiddleware(app, minimum_size=minimum_size)

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path.startswith("/api/realtime/stream") or path.startswith("/api/ai/"):
                await self.app(scope, receive, send)
                return
        await self.gzip_app(scope, receive, send)


def create_app(custom_settings: Settings | None = None) -> FastAPI:
    settings = custom_settings or load_settings()
    app = create_api_app(settings, enable_cors=True)
    app.title = "Вектор"
    register_shell_routes(app, root_dir=ROOT_DIR, settings=settings)
    app.add_middleware(SseSafeGZipMiddleware, minimum_size=800)
    return app


app = create_app()
