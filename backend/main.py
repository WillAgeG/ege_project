"""Компоновщик FastAPI-сервера «Вектор ЕГЭ» (Headless API + SSR-оболочка SPA)."""

from __future__ import annotations

from fastapi import FastAPI

from .api import create_api_app
from .config import ROOT_DIR, Settings, load_settings
from .shell import register_shell_routes


def create_app(custom_settings: Settings | None = None) -> FastAPI:
    settings = custom_settings or load_settings()
    app = create_api_app(settings, enable_cors=True)
    app.title = "Вектор ЕГЭ"
    register_shell_routes(app, root_dir=ROOT_DIR)
    return app


app = create_app()
