"""SSR-оболочка SPA и allowlist-раздача статики (frontend/ и ux-ui/)."""

from __future__ import annotations

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, HTMLResponse

from .config import ROOT_DIR

SHELL_PREFIX = (
    "<!doctype html><html><head><meta charset=utf-8>"
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
    "</head><body>"
)
HOST_FLAG_SCRIPT = "<script>window.EGE_HOST={backend:true};</script>"


SITE_TITLES = {
    "student": "Вектор ЕГЭ — Ученик",
    "tutor": "Вектор ЕГЭ — Преподаватель",
    "admin": "Вектор ЕГЭ — Админ-панель",
    "brandbook": "Вектор ЕГЭ — Брендбук",
}

BB_SUBSITE_TITLES = {
    "hub": "Обзор системы",
    "home": "Главная · Mobile & Desktop",
    "mobile": "Mobile Главная (390 px)",
    "desktop": "Desktop Главная (1440 px)",
    "landing": "Главная · Mobile & Desktop",
    "showcase": "Главная · Mobile & Desktop",
    "ui-kit": "UI Kit & Токены",
    "tokens": "UI Kit & Токены",
    "components": "UI Kit & Токены",
    "marketplace": "Маркетплейс & СБП",
    "product": "Маркетплейс & СБП",
    "payments": "Маркетплейс & СБП",
    "dataviz": "DataViz & Таблицы",
    "charts": "DataViz & Таблицы",
    "tables": "DataViz & Таблицы",
    "api": "API & Контракты",
    "architecture": "API & Контракты",
    "admin": "Admin UI Kit",
    "data": "Data Platform & ETL",
    "etl": "Data Platform & ETL",
    "telemetry": "Data Platform & ETL",
    "all": "Полный индекс",
}


def render_index_html(
    root_dir: Path = ROOT_DIR,
    *,
    landing: bool = False,
    site: str | None = None,
    view: str | None = None,
    bb_site: str | None = None,
) -> str:
    frontend_dir = root_dir / "frontend"
    raw = (frontend_dir / "index.html").read_text(encoding="utf-8")

    if site == "tutor" and view == "fees":
        page_title = "Вектор ЕГЭ — Выплаты преподавателя"
    elif site == "brandbook" and bb_site and bb_site in BB_SUBSITE_TITLES:
        page_title = f"Вектор ЕГЭ — Брендбук · {BB_SUBSITE_TITLES[bb_site]}"
    else:
        page_title = SITE_TITLES.get(site or "")
    if page_title:
        raw = raw.replace("<title>Вектор ЕГЭ</title>", f"<title>{page_title}</title>", 1)

    if site in {"student", "tutor"}:
        raw = raw.replace('<script src="views/admin.js"></script>\r\n', "")
        raw = raw.replace('<script src="views/admin.js"></script>\n', "")
        raw = raw.replace('<script src="views/admin.js"></script>', "")

    parts = ["backend:true"]
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
    return SHELL_PREFIX + raw + "</body></html>"


def register_shell_routes(app: FastAPI, root_dir: Path = ROOT_DIR) -> None:
    frontend_dir = root_dir / "frontend"
    ux_ui_dir = root_dir / "ux-ui"

    @app.get("/", response_class=HTMLResponse)
    @app.get("/index.html", response_class=HTMLResponse)
    async def index_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, landing=False),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/student", response_class=HTMLResponse)
    async def student_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="student"),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/tutor", response_class=HTMLResponse)
    @app.get("/teacher", response_class=HTMLResponse)
    @app.get("/cabinet", response_class=HTMLResponse)
    async def tutor_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="tutor"),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/landing", response_class=HTMLResponse)
    async def landing_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, landing=True),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/brandbook", response_class=HTMLResponse)
    async def brandbook_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="brandbook"),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/brandbook/{subsite}", response_class=HTMLResponse)
    async def brandbook_subsite_page(subsite: str) -> HTMLResponse:
        slug = (subsite or "").strip().lower()
        if slug not in BB_SUBSITE_TITLES:
            raise HTTPException(status_code=404, detail="Not found")
        return HTMLResponse(
            content=render_index_html(root_dir, site="brandbook", bb_site=slug),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/fees", response_class=HTMLResponse)
    async def fees_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="tutor", view="fees"),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/admin", response_class=HTMLResponse)
    async def admin_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="admin"),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/privacy", response_class=HTMLResponse)
    async def privacy_page() -> HTMLResponse:
        html = """<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Политика конфиденциальности — Вектор ЕГЭ</title><style>
body{margin:0;background:#f4f5f7;color:#141517;font:15px/1.6 system-ui,-apple-system,sans-serif;padding:32px 16px}
main{max-width:720px;margin:0 auto;background:#ffffff;border:1px solid #e4e6ec;border-radius:16px;padding:28px}
h1{margin:0 0 12px;font-size:24px}h2{margin:20px 0 8px;font-size:17px}p,li{color:#3d424d}a{color:#0070ff}
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
                target = (ux_ui_dir / rest).resolve()
                allowed_dir = (ux_ui_dir / "styles").resolve()
                media_type = "text/css; charset=utf-8"
            elif rest.startswith(("components/", "brandbook/")) and rest.endswith(".js"):
                sub = rest.split("/", 1)[0]
                target = (ux_ui_dir / rest).resolve()
                allowed_dir = (ux_ui_dir / sub).resolve()
            elif rest.startswith("assets/") and rest.lower().endswith((".svg", ".png", ".jpg", ".jpeg", ".webp")):
                target = (ux_ui_dir / rest).resolve()
                allowed_dir = (ux_ui_dir / "assets").resolve()
                media_type = "image/svg+xml; charset=utf-8" if target.suffix.lower() == ".svg" else "application/octet-stream"
            else:
                raise HTTPException(status_code=404, detail="Not found")
        elif clean in {"app.js", "bank-core.js"}:
            target = (frontend_dir / clean).resolve()
            allowed_dir = frontend_dir.resolve()
        elif clean.startswith("styles/") and clean.endswith(".css"):
            target = (frontend_dir / clean).resolve()
            allowed_dir = (frontend_dir / "styles").resolve()
            media_type = "text/css; charset=utf-8"
        elif clean.startswith(("core/", "views/", "data/", "subjects/")) and clean.endswith(".js"):
            top = clean.split("/", 1)[0]
            target = (frontend_dir / clean).resolve()
            allowed_dir = (frontend_dir / top).resolve()
        elif clean.startswith("assets/") and clean.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
            target = (frontend_dir / clean).resolve()
            allowed_dir = (frontend_dir / "assets").resolve()
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
