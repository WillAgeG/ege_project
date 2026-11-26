"""SSR-оболочка SPA и allowlist-раздача статики (frontend/ и ux-ui/)."""

from __future__ import annotations

import json
from pathlib import Path
from xml.sax.saxutils import escape as xml_escape

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response

from .api.auth_docs import public_base_url
from .config import ROOT_DIR, Settings, load_settings
from .legal import render_privacy_html, render_refunds_html, render_terms_html

SHELL_HEAD_OPEN = (
    "<!doctype html><html><head><meta charset=utf-8>"
    '<meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
    "<style>:root{color-scheme:light dark;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}"
    "body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>"
)
SHELL_PREFIX = SHELL_HEAD_OPEN + "</head><body>"
BODY_CLOSE = "</body></html>"


SITE_TITLES = {
    "student": "Вектор — Ученик",
    "tutor": "Вектор — Преподаватель",
    "brandbook": "Вектор — Брендбук",
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
    dev_demo_mode: bool = True,
    yandex_metrika_id: str | None = None,
    yandex_metrika_webvisor: bool = False,
) -> str:
    frontend_dir = root_dir / "frontend"
    raw = (frontend_dir / "index.html").read_text(encoding="utf-8")

    if view == "fees":
        page_title = "Вектор — Условия оплаты, эскроу и комиссия"
    elif view == "market":
        page_title = "Вектор — Поиск репетиторов"
    elif site == "brandbook" and bb_site and bb_site in BB_SUBSITE_TITLES:
        page_title = f"Вектор — Брендбук · {BB_SUBSITE_TITLES[bb_site]}"
    else:
        page_title = SITE_TITLES.get(site or "")
    if page_title:
        raw = raw.replace("<title>Вектор</title>", f"<title>{page_title}</title>", 1)

    host_cfg: dict[str, Any] = {"backend": True}
    if not dev_demo_mode:
        host_cfg["demoMode"] = False
    if landing:
        host_cfg["landing"] = True
    if site:
        host_cfg["site"] = site
    if view:
        host_cfg["view"] = view
    if bb_site:
        host_cfg["bbSite"] = bb_site
    clean_ym = str(yandex_metrika_id or "").strip()
    if clean_ym.isdigit():
        host_cfg["ymId"] = clean_ym
        if yandex_metrika_webvisor:
            host_cfg["ymWebvisor"] = True
    host_json = json.dumps(host_cfg, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
    flag_script = (
        f'<script id="ege-host-config" type="application/json">{host_json}</script>\n'
        '<script src="/core/host-config.js"></script>'
    )

    for target in ('<script src="data/tutors.js"></script>', '<script src="app.js"></script>'):
        if target in raw:
            raw = raw.replace(target, flag_script + "\n" + target, 1)
            break
    else:
        raw = raw + "\n" + flag_script

    for body_marker in ('<svg aria-hidden="true"', '<div class="site-boot-loader"'):
        if body_marker in raw:
            head_part, body_part = raw.split(body_marker, 1)
            return SHELL_HEAD_OPEN + "\n" + head_part + "</head><body>\n" + body_marker + body_part + BODY_CLOSE
    return SHELL_PREFIX + raw + BODY_CLOSE


def register_shell_routes(
    app: FastAPI,
    root_dir: Path = ROOT_DIR,
    settings: Settings | None = None,
) -> None:
    frontend_dir = root_dir / "frontend"
    ux_ui_dir = root_dir / "ux-ui"

    def _eff_settings() -> Settings:
        return settings or getattr(app.state, "settings", None) or load_settings()

    def _demo_flag() -> bool:
        return bool(getattr(_eff_settings(), "dev_demo_mode", True))

    def _analytics_kwargs() -> dict[str, Any]:
        acfg = getattr(_eff_settings(), "analytics", None)
        if not acfg:
            return {}
        return {
            "yandex_metrika_id": getattr(acfg, "yandex_metrika_id", None),
            "yandex_metrika_webvisor": bool(getattr(acfg, "yandex_metrika_webvisor", False)),
        }

    @app.get("/robots.txt", response_class=PlainTextResponse)
    async def robots_txt(request: Request) -> PlainTextResponse:
        base = public_base_url(request, _eff_settings())
        body = "\n".join(
            [
                "User-agent: *",
                "Allow: /",
                "Disallow: /api/",
                "Disallow: /docs",
                "Disallow: /redoc",
                "Disallow: /openapi.json",
                "Disallow: /design",
                "Disallow: /studio",
                f"Sitemap: {base}/sitemap.xml",
                "",
            ]
        )
        return PlainTextResponse(
            content=body,
            media_type="text/plain; charset=utf-8",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    @app.get("/sitemap.xml")
    async def sitemap_xml(request: Request) -> Response:
        base = public_base_url(request, _eff_settings())
        entries = (
            ("/", "daily", "1.0"),
            ("/landing", "daily", "0.9"),
            ("/market", "daily", "0.9"),
            ("/student", "weekly", "0.8"),
            ("/tutor", "weekly", "0.8"),
            ("/fees", "monthly", "0.6"),
            ("/brandbook", "weekly", "0.7"),
            ("/terms", "monthly", "0.4"),
            ("/refunds", "monthly", "0.4"),
            ("/privacy", "monthly", "0.4"),
        )
        urls_xml = "".join(
            f"  <url><loc>{xml_escape(base + path)}</loc>"
            f"<changefreq>{freq}</changefreq><priority>{prio}</priority></url>\n"
            for path, freq, prio in entries
        )
        xml_body = (
            '<?xml version="1.0" encoding="UTF-8"?>\n'
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            f"{urls_xml}"
            "</urlset>\n"
        )
        return Response(
            content=xml_body,
            media_type="application/xml; charset=utf-8",
            headers={"Cache-Control": "public, max-age=3600"},
        )

    @app.get("/", response_class=HTMLResponse)
    @app.get("/index.html", response_class=HTMLResponse)
    async def index_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, landing=False, dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/student", response_class=HTMLResponse)
    async def student_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="student", dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/tutor", response_class=HTMLResponse)
    @app.get("/teacher", response_class=HTMLResponse)
    @app.get("/cabinet", response_class=HTMLResponse)
    async def tutor_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="tutor", dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/landing", response_class=HTMLResponse)
    async def landing_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, landing=True, dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/market", response_class=HTMLResponse)
    async def market_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, view="market", dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/brandbook", response_class=HTMLResponse)
    async def brandbook_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, site="brandbook", dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/brandbook/{subsite}", response_class=HTMLResponse)
    async def brandbook_subsite_page(subsite: str) -> HTMLResponse:
        slug = (subsite or "").strip().lower()
        if slug not in BB_SUBSITE_TITLES:
            raise HTTPException(status_code=404, detail="Not found")
        return HTMLResponse(
            content=render_index_html(
                root_dir,
                site="brandbook",
                bb_site=slug,
                dev_demo_mode=_demo_flag(),
                **_analytics_kwargs(),
            ),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/fees", response_class=HTMLResponse)
    async def fees_page() -> HTMLResponse:
        return HTMLResponse(
            content=render_index_html(root_dir, view="fees", dev_demo_mode=_demo_flag(), **_analytics_kwargs()),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/design", response_class=HTMLResponse)
    @app.get("/studio", response_class=HTMLResponse)
    async def design_studio_page() -> HTMLResponse:
        studio_file = frontend_dir / "design-studio.html"
        if not studio_file.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return HTMLResponse(
            content=studio_file.read_text(encoding="utf-8"),
            headers={"Cache-Control": "no-store"},
        )

    @app.get("/privacy", response_class=HTMLResponse)
    async def privacy_page() -> HTMLResponse:
        return HTMLResponse(content=render_privacy_html(), headers={"Cache-Control": "no-cache"})

    @app.get("/terms", response_class=HTMLResponse)
    @app.get("/offer", response_class=HTMLResponse)
    async def terms_page() -> HTMLResponse:
        return HTMLResponse(content=render_terms_html(), headers={"Cache-Control": "no-cache"})

    @app.get("/refunds", response_class=HTMLResponse)
    @app.get("/escrow", response_class=HTMLResponse)
    async def refunds_page() -> HTMLResponse:
        return HTMLResponse(content=render_refunds_html(), headers={"Cache-Control": "no-cache"})

    @app.get("/favicon.ico")
    async def favicon_ico() -> FileResponse:
        ico = (frontend_dir / "assets" / "favicon.ico").resolve()
        if not ico.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(
            ico,
            media_type="image/x-icon",
            headers={"Cache-Control": "public, max-age=86400"},
        )

    @app.get("/apple-touch-icon.png")
    async def apple_touch_icon() -> FileResponse:
        png = (frontend_dir / "assets" / "apple-touch-icon.png").resolve()
        if not png.is_file():
            raise HTTPException(status_code=404, detail="Not found")
        return FileResponse(
            png,
            media_type="image/png",
            headers={"Cache-Control": "public, max-age=86400"},
        )

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
        elif clean.startswith("assets/") and clean.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".ico")):
            target = (frontend_dir / clean).resolve()
            allowed_dir = (frontend_dir / "assets").resolve()
            ext = target.suffix.lower()
            if ext in {".jpg", ".jpeg"}:
                media_type = "image/jpeg"
            elif ext == ".png":
                media_type = "image/png"
            elif ext == ".webp":
                media_type = "image/webp"
            elif ext == ".ico":
                media_type = "image/x-icon"
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
