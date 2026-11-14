#!/usr/bin/env python3
"""Локальный просмотр сайта: http://localhost:8765/
Оборачивает index.html в тот же каркас <!doctype html>, что добавляет claude.ai при публикации,
и поддерживает /__save для страницы tools/bank.html (кроссплатформенная замена .claude/serve.ps1)."""

import argparse
import os
import re
import sys
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.realpath(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
TYPES = {
    ".html": "text/html; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".csv": "text/csv; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}
SHELL = (
    "<!doctype html><html><head><meta charset=utf-8>"
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)
SAVE_RE = re.compile(r"^(bank/[A-Za-z0-9._-]+\.csv|frontend/subjects/table\.js)$")


def is_within_root(path: str) -> bool:
    try:
        return os.path.commonpath([ROOT, path]) == ROOT
    except ValueError:
        return False


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def _send(self, code: int, body: bytes, content_type: str = "text/plain; charset=utf-8", send_body: bool = True) -> None:
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        if send_body and body:
            self.wfile.write(body)

    def _serve_get(self, send_body: bool) -> None:
        path = urllib.parse.unquote(urllib.parse.urlsplit(self.path).path)
        if path in ("/", "/index.html", "/landing", "/brandbook", "/fees"):
            with open(os.path.join(ROOT, "frontend", "index.html"), "r", encoding="utf-8") as f:
                page = f.read()
            body = (SHELL + page + "</body></html>").encode("utf-8")
            self._send(200, body, "text/html; charset=utf-8", send_body=send_body)
            return

        parts = [p for p in path.split("/") if p]
        candidates = [os.path.join(ROOT, *parts), os.path.join(ROOT, "frontend", *parts)] if parts else []
        full = ""
        for candidate in candidates:
            resolved = os.path.realpath(candidate)
            if is_within_root(resolved) and os.path.isfile(resolved):
                full = resolved
                break
        if not full:
            self._send(404, b"not found", send_body=send_body)
            return

        with open(full, "rb") as f:
            body = f.read()
        ext = os.path.splitext(full)[1].lower()
        self._send(200, body, TYPES.get(ext, "application/octet-stream"), send_body=send_body)

    def do_GET(self) -> None:
        try:
            self._serve_get(send_body=True)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self._send(500, b"internal error")

    def do_HEAD(self) -> None:
        try:
            self._serve_get(send_body=False)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self._send(500, b"", send_body=False)

    def do_POST(self) -> None:
        try:
            parsed = urllib.parse.urlsplit(self.path)
            if urllib.parse.unquote(parsed.path) != "/__save":
                self._send(404, b"not found")
                return

            qs = urllib.parse.parse_qs(parsed.query)
            rel = (qs.get("path") or [""])[0]
            if not SAVE_RE.match(rel) or ".." in rel.split("/"):
                self._send(403, b"path not allowed")
                return

            dest = os.path.realpath(os.path.join(ROOT, *rel.split("/")))
            if not is_within_root(dest):
                self._send(403, b"path not allowed")
                return

            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError:
                self._send(400, b"invalid content-length")
                return
            if length < 0:
                self._send(400, b"invalid content-length")
                return

            body = self.rfile.read(length)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(body)

            msg = f"{rel} ({len(body)} bytes)".encode("utf-8")
            self._send(200, msg)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception:
            self._send(500, b"internal error")

    def log_message(self, format: str, *args) -> None:
        sys.stderr.write(f"[serve] {self.address_string()} - {format % args}\n")


class ReusableThreadingHTTPServer(ThreadingHTTPServer):
    allow_reuse_address = True


def main() -> None:
    parser = argparse.ArgumentParser(description="Local static + /__save server")
    parser.add_argument("port", nargs="?", type=int, default=8765)
    parser.add_argument("--host", default="127.0.0.1")
    args = parser.parse_args()

    server = ReusableThreadingHTTPServer((args.host, args.port), Handler)
    print(f"Serving {ROOT} on http://localhost:{args.port}/", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
