#!/usr/bin/env python3
"""Standalone Zero-DB Design Studio server for Vektor EGE (http://127.0.0.1:8773)."""

from __future__ import annotations

import argparse
import json
import mimetypes
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

ROOT_DIR = Path(__file__).resolve().parents[1]
FRONTEND_DIR = ROOT_DIR / "frontend"
UX_UI_DIR = ROOT_DIR / "ux-ui"

SHELL_PREFIX = (
    "<!doctype html><html><head><meta charset=utf-8>"
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)

STATIC_TYPES = {
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".json": "application/json; charset=utf-8",
    ".html": "text/html; charset=utf-8",
}

SITE_TITLES = {
    "student": "Вектор ЕГЭ — Ученик",
    "tutor": "Вектор ЕГЭ — Преподаватель",
    "brandbook": "Вектор ЕГЭ — Брендбук",
}


def render_standalone_app(
    *,
    landing: bool = False,
    site: str | None = None,
    view: str | None = None,
    bb_site: str | None = None,
) -> bytes:
    raw = (FRONTEND_DIR / "index.html").read_text(encoding="utf-8")
    if site and site in SITE_TITLES:
        raw = raw.replace("<title>Вектор ЕГЭ</title>", f"<title>{SITE_TITLES[site]}</title>", 1)
    parts = ["backend:false", "guest:true"]
    if landing:
        parts.append("landing:true")
    if site:
        parts.append(f"site:{json.dumps(site)}")
    if view:
        parts.append(f"view:{json.dumps(view)}")
    if bb_site:
        parts.append(f"bbSite:{json.dumps(bb_site)}")
    flag_script = "<script>window.EGE_HOST={" + ",".join(parts) + "};</script>"
    target = '<script src="app.js"></script>'
    if target in raw:
        raw = raw.replace(target, flag_script + "\n" + target, 1)
    else:
        raw = raw + "\n" + flag_script
    return (SHELL_PREFIX + raw + "</body></html>").encode("utf-8")


class DesignStudioHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        return

    def _send_bytes(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        clean = parsed.path.strip("/")

        if clean in {"", "design", "studio"}:
            studio = FRONTEND_DIR / "design-studio.html"
            if not studio.is_file():
                self._send_bytes(404, b"Not found", "text/plain; charset=utf-8")
                return
            self._send_bytes(200, studio.read_bytes(), "text/html; charset=utf-8")
            return

        if clean == "landing":
            self._send_bytes(200, render_standalone_app(landing=True), "text/html; charset=utf-8")
            return
        if clean in {"student", "app"}:
            self._send_bytes(200, render_standalone_app(site="student"), "text/html; charset=utf-8")
            return
        if clean in {"tutor", "teacher", "cabinet"}:
            self._send_bytes(200, render_standalone_app(site="tutor"), "text/html; charset=utf-8")
            return
        if clean == "fees":
            self._send_bytes(200, render_standalone_app(site="tutor", view="fees"), "text/html; charset=utf-8")
            return
        if clean == "brandbook":
            self._send_bytes(200, render_standalone_app(site="brandbook"), "text/html; charset=utf-8")
            return
        if clean.startswith("brandbook/"):
            slug = clean[len("brandbook/"):].strip("/").lower()
            self._send_bytes(200, render_standalone_app(site="brandbook", bb_site=slug), "text/html; charset=utf-8")
            return

        if clean.startswith("ux-ui/"):
            rest = clean[len("ux-ui/"):]
            target = (UX_UI_DIR / rest).resolve()
            allowed = UX_UI_DIR.resolve()
        else:
            target = (FRONTEND_DIR / clean).resolve()
            allowed = FRONTEND_DIR.resolve()

        if not target.is_relative_to(allowed) or not target.is_file():
            self._send_bytes(404, b"Not found", "text/plain; charset=utf-8")
            return

        ext = target.suffix.lower()
        ctype = STATIC_TYPES.get(ext) or mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        self._send_bytes(200, target.read_bytes(), ctype)


def main() -> None:
    parser = argparse.ArgumentParser(description="Standalone Vektor Design Studio server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8773)
    args = parser.parse_args()
    srv = ThreadingHTTPServer((args.host, args.port), DesignStudioHandler)
    srv.serve_forever()


if __name__ == "__main__":
    main()
