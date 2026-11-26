"""Тесты продакшн-hardening: персистентный RateLimiter/OTP, WebP/EXIF/CDN и DEV_DEMO_MODE=0."""

from __future__ import annotations

import io
from pathlib import Path
import time

from fastapi.testclient import TestClient
import httpx
from PIL import Image
import pytest

from backend.api import create_api_app
from backend.config import AIConfig, Settings, TelegramAuthConfig, load_media_config
from databases.sqlite.store import Database


def test_persistent_rate_limiter_survives_restart_for_auth_and_ai(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_file = tmp_path / "persist_rl.db"
    admin_secret = "rl-secret-2026"

    async def _fake_complete_ai(*_args, **_kwargs) -> dict:
        return {"score": 21, "note": "ok"}

    monkeypatch.setattr("backend.api.auth_docs.complete_ai_json", _fake_complete_ai)

    def _build_app():
        return create_api_app(
            Settings(
                db_path=db_file,
                admin_api_token=admin_secret,
                auth_rate_limit=2,
                auth_rate_window_sec=3600,
                ai_rate_limit=2,
                ai_rate_window_sec=3600,
                ai=AIConfig(
                    provider="openai",
                    api_key="sk-test-123",
                    model="gpt-6.1-terra",
                    model_complex="gpt-6.1-sol",
                    base_url=None,
                ),
            )
        )

    with TestClient(_build_app()) as c1:
        r_ops = c1.get("/api/admin/ops", headers={"X-Admin-Token": admin_secret})
        assert r_ops.status_code == 200
        sec = r_ops.json()["security"]
        assert sec["rateLimiterStore"] == "database"
        assert sec["otpStore"] == "database"

        assert c1.post("/api/auth/register", json={"username": "rl_user1", "password": "secret123"}).status_code == 200
        assert c1.post("/api/auth/login", json={"username": "rl_user1", "password": "wrong"}).status_code == 401
        r_ai_1 = c1.post("/api/ai", json={"mode": "json", "messages": [{"role": "user", "content": "test"}]})
        r_ai_2 = c1.post("/api/ai", json={"mode": "json", "messages": [{"role": "user", "content": "test"}]})
        assert r_ai_1.status_code == 200
        assert r_ai_2.status_code == 200

    # Перезапуск приложения на той же БД: лимиты НЕ сбрасываются
    with TestClient(_build_app()) as c2:
        r_auth_429 = c2.post("/api/auth/login", json={"username": "rl_user1", "password": "secret123"})
        assert r_auth_429.status_code == 429
        assert r_auth_429.json()["detail"]["code"] == "rate_limited"

        assert c2.post("/api/auth/login", json={"username": "rl_user1", "password": "secret123"}).status_code == 429
        # Возьмём новую сессию с другого IP, чтобы проверить лимит AI (50/h -> здесь 2/h) именно по user.id
        c2_other_ip = TestClient(_build_app())
        with c2_other_ip as c3:
            c3.headers.update({"X-Forwarded-For": "10.20.30.40"})
            assert (
                c3.post("/api/auth/login", json={"username": "rl_user1", "password": "secret123"}).status_code == 200
            )
            r_ai_3 = c3.post("/api/ai", json={"mode": "json", "messages": [{"role": "user", "content": "test"}]})
            assert r_ai_3.status_code == 429
            assert r_ai_3.json()["detail"]["code"] == "rate_limited"


def test_persistent_phone_otp_survives_restart_attempts_and_pruning(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    db_file = tmp_path / "persist_otp.db"
    sent_codes: list[str] = []

    async def _capture_otp(_self, _digits: str, code: str) -> bool:
        sent_codes.append(code)
        return True

    monkeypatch.setattr("backend.telegram_bot.TelegramBotService.send_otp_by_phone", _capture_otp)

    def _build_prod_app():
        return create_api_app(
            Settings(
                db_path=db_file,
                env="production",
                dev_demo_mode=False,
                telegram=TelegramAuthConfig(bot_token="123456:TESTTOKEN", bot_username="vektor_test_bot"),
            )
        )

    # 1) Отправляем код в первом процессе
    with TestClient(_build_prod_app()) as c1:
        r_send = c1.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-08-88", "country": "RU", "channel": "tg", "mode": "login"},
        )
        assert r_send.status_code == 200
        assert r_send.json()["deliveredViaBot"] is True
        assert "demoCode" not in r_send.json()
        assert len(sent_codes) == 1
        code1 = sent_codes[-1]

    # 2) Проверяем, что код и счётчик неверных попыток сохранились после перезапуска
    with TestClient(_build_prod_app()) as c2:
        for _ in range(5):
            r_bad = c2.post(
                "/api/auth/phone/verify",
                json={"phone": "+7 (914) 210-08-88", "country": "RU", "channel": "tg", "code": "0000"},
            )
            assert r_bad.status_code == 400
        # 6-я попытка -> 429 otp_attempts даже в новом процессе
        with TestClient(_build_prod_app()) as c3:
            r_locked = c3.post(
                "/api/auth/phone/verify",
                json={"phone": "+7 (914) 210-08-88", "country": "RU", "channel": "tg", "code": code1},
            )
            assert r_locked.status_code == 429
            assert r_locked.json()["detail"]["code"] == "otp_attempts"

            # Запрашиваем свежий OTP и подтверждаем его в новом инстансе
            assert (
                c3.post(
                    "/api/auth/phone/send",
                    json={"phone": "+7 (914) 210-08-88", "country": "RU", "channel": "tg", "mode": "login"},
                ).status_code
                == 200
            )
            code2 = sent_codes[-1]

        with TestClient(_build_prod_app()) as c4:
            r_ok = c4.post(
                "/api/auth/phone/verify",
                json={
                    "phone": "+7 (914) 210-08-88",
                    "country": "RU",
                    "channel": "tg",
                    "code": code2,
                    "role": "student",
                    "authProvider": "telegram",
                },
            )
            assert r_ok.status_code == 200, r_ok.text
            assert r_ok.json()["channel"] == "tg"
            assert r_ok.json()["user"]["authProvider"] == "telegram"

    # 3) Очистка истёкших записей security state
    db = Database(db_file)
    try:
        db.check_rate_limit("expired_test", 5, 1, now_ts=time.time() - 100.0)
        db.upsert_phone_otp(
            "79990001122",
            code_hash="abc",
            channel="wa",
            mode="login",
            invite_ok=True,
            ttl_sec=10,
            now_ts=time.time() - 100.0,
        )
        pruned = db.prune_expired_security_state()
        assert pruned["rateLimitPruned"] >= 1
        assert pruned["otpPruned"] >= 1
    finally:
        db.close()


def test_avatar_webp_resize_exif_strip_and_cdn_presign_redirects(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("MEDIA_STORAGE", "local")
    monkeypatch.setenv("MEDIA_LOCAL_DIR", str(tmp_path / "media"))
    monkeypatch.setenv("MEDIA_AVATAR_WEBP", "1")
    monkeypatch.setenv("MEDIA_AVATAR_MAX_DIM", "256")
    monkeypatch.setenv("MEDIA_AVATAR_WEBP_QUALITY", "80")

    # Создаём JPEG 1200x800 с EXIF Orientation=6 (поворот на 90°) и метаданными Artist/Software
    raw_img = Image.new("RGB", (1200, 800), color=(25, 120, 90))
    exif = Image.Exif()
    exif[274] = 6  # Orientation: Rotate 270 CW / 90 CW visual -> transposed to 800x1200
    exif[315] = "Private Artist Metadata"
    exif[305] = "Secret Camera App"
    jpeg_buf = io.BytesIO()
    raw_img.save(jpeg_buf, format="JPEG", exif=exif.tobytes())
    exif_jpeg = jpeg_buf.getvalue()

    app_local = create_api_app(Settings(db_path=tmp_path / "webp.db", media=load_media_config()))
    with TestClient(app_local) as client:
        assert (
            client.post(
                "/api/auth/register",
                json={"username": "webp_user", "password": "secret123", "displayName": "Анна"},
            ).status_code
            == 200
        )

        # Битый PNG-заголовок без пикселей отклоняется с 400 invalid_image
        bad_png = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 32
        r_bad = client.post("/api/media/avatar", files={"file": ("broken.png", bad_png, "image/png")})
        assert r_bad.status_code == 400
        assert r_bad.json()["code"] == "invalid_image"

        r_up = client.post("/api/media/avatar", files={"file": ("photo.jpg", exif_jpeg, "image/jpeg")})
        assert r_up.status_code == 200, r_up.text
        data = r_up.json()
        assert data["asset"]["contentType"] == "image/webp"
        opt = data["optimization"]
        assert opt["normalized"] is True
        assert opt["exifStripped"] is True
        assert max(opt["width"], opt["height"]) == 256
        assert opt["height"] > opt["width"]  # EXIF Orientation=6 применён

        r_pub = client.get(data["url"])
        assert r_pub.status_code == 200
        assert r_pub.headers.get("content-type", "").startswith("image/webp")
        decoded = Image.open(io.BytesIO(r_pub.content))
        assert max(decoded.size) == 256
        assert len(decoded.getexif()) == 0

    # Проверка CDN / presigned 307 redirect на S3 (через MockTransport)
    s3_store: dict[str, tuple[bytes, str]] = {}

    def _s3_handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "PUT":
            s3_store[path] = (request.content, request.headers.get("content-type", "application/octet-stream"))
            return httpx.Response(200)
        if request.method == "GET":
            item = s3_store.get(path)
            if not item:
                return httpx.Response(404)
            return httpx.Response(200, content=item[0], headers={"Content-Type": item[1]})
        return httpx.Response(204)

    real_async_client = httpx.AsyncClient
    mock_transport = httpx.MockTransport(_s3_handler)
    monkeypatch.setattr(
        httpx,
        "AsyncClient",
        lambda *a, **kw: real_async_client(*a, **{**kw, "transport": mock_transport}),
    )
    monkeypatch.setenv("MEDIA_STORAGE", "s3")
    monkeypatch.setenv("S3_ENDPOINT_URL", "https://s3.ru-1.storage.selcloud.ru")
    monkeypatch.setenv("S3_REGION", "ru-1")
    monkeypatch.setenv("S3_ACCESS_KEY_ID", "ak_cdn")
    monkeypatch.setenv("S3_SECRET_ACCESS_KEY", "sk_cdn")
    monkeypatch.setenv("S3_PUBLIC_BASE_URL", "https://cdn.vektor-ege.ru")
    monkeypatch.setenv("MEDIA_PUBLIC_REDIRECT", "1")
    monkeypatch.setenv("MEDIA_PRIVATE_PRESIGN_REDIRECT", "1")

    app_s3 = create_api_app(Settings(db_path=tmp_path / "s3_redir.db", media=load_media_config()))
    with TestClient(app_s3) as c_tut, TestClient(app_s3) as c_other:
        assert (
            c_tut.post(
                "/api/auth/register",
                json={"username": "s3_tut", "password": "secret123", "displayName": "Ольга", "role": "tutor"},
            ).status_code
            == 200
        )
        assert (
            c_other.post(
                "/api/auth/register",
                json={"username": "s3_other", "password": "secret123", "displayName": "Гость"},
            ).status_code
            == 200
        )

        av_res = c_tut.post("/api/media/avatar", files={"file": ("ava.jpg", exif_jpeg, "image/jpeg")}).json()
        aid = av_res["asset"]["id"]
        assert av_res["url"].startswith("https://cdn.vektor-ege.ru/avatars-public/")

        r_pub_307 = c_other.get(f"/api/media/public/{aid}", follow_redirects=False)
        assert r_pub_307.status_code == 307
        assert r_pub_307.headers["location"].startswith("https://cdn.vektor-ege.ru/avatars-public/")

        r_pub_proxy = c_other.get(f"/api/media/public/{aid}?redirect=0")
        assert r_pub_proxy.status_code == 200
        assert r_pub_proxy.headers.get("content-type", "").startswith("image/webp")

        pdf_sample = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n"
        ver_res = c_tut.post(
            "/api/tutor/verifications",
            data={"doc_type": "diploma", "title": "Диплом"},
            files={"file": ("d.pdf", pdf_sample, "application/pdf")},
        ).json()
        priv_url = ver_res["verification"]["fileUrl"]
        assert c_other.get(priv_url, follow_redirects=False).status_code == 403

        r_priv_307 = c_tut.get(priv_url, follow_redirects=False)
        assert r_priv_307.status_code == 307
        assert "X-Amz-Signature=" in r_priv_307.headers["location"]
        assert "no-store" in r_priv_307.headers.get("cache-control", "")


def test_dev_demo_mode_zero_disables_seed_and_serves_real_tutors_with_slots(tmp_path: Path) -> None:
    app = create_api_app(Settings(db_path=tmp_path / "prod_market.db", env="production", dev_demo_mode=False))
    with TestClient(app) as c_anon, TestClient(app) as c_tut:
        # Без демо-сидинга свежая БД возвращает пустой каталог реальных репетиторов
        r_empty = c_anon.get("/api/tutors")
        assert r_empty.status_code == 200
        assert r_empty.json() == {"ok": True, "tutors": []}

        assert (
            c_tut.post(
                "/api/auth/register",
                json={"username": "real_tutor_prod", "password": "secret123", "displayName": "Ирина С.", "role": "tutor"},
            ).status_code
            == 200
        )
        r_put = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Ирина Соколова",
                "subject": "math",
                "subjectName": "Математика",
                "city": "Москва",
                "timezone": "UTC+3",
                "price": 1500,
                "slots": {"1": ["18:00"], "6": ["10:00", "12:00"]},
            },
        )
        assert r_put.status_code == 200, r_put.text
        created_id = r_put.json()["tutor"]["id"]

        r_full = c_anon.get("/api/tutors")
        assert r_full.status_code == 200
        tutors = r_full.json()["tutors"]
        assert len(tutors) == 1
        assert tutors[0]["id"] == created_id
        assert tutors[0]["name"] == "Ирина Соколова"
        assert tutors[0]["slots"] == {"1": ["18:00"], "6": ["10:00", "12:00"]}


def test_client_ip_blocks_xff_spoofing_for_rate_limit_and_webhooks(tmp_path: Path) -> None:
    from fastapi import Request as FastApiRequest

    from backend.api.auth_docs import client_ip
    from backend.config import PaymentsConfig

    app = create_api_app(
        Settings(
            db_path=tmp_path / "xff_guard.db",
            auth_rate_limit=2,
            auth_rate_window_sec=600,
            payments=PaymentsConfig(provider="yookassa", yookassa_shop_id="1", yookassa_secret_key="s", yookassa_check_webhook_ip=True),
        )
    )

    def _make_fake_request(peer_host: str, xff: str = "") -> FastApiRequest:
        headers = []
        if xff:
            headers.append((b"x-forwarded-for", xff.encode("latin-1")))
        scope = {
            "type": "http",
            "method": "POST",
            "path": "/api/auth/login",
            "headers": headers,
            "client": (peer_host, 12345),
            "app": app,
        }
        return FastApiRequest(scope)

    # Недоверенный внешний IP: X-Forwarded-For игнорируется целиком
    assert client_ip(_make_fake_request("203.0.113.77", "185.71.76.12"), app.state.settings) == "203.0.113.77"
    # Доверенный прокси с цепочкой [подделанный_клиентом_IP, реальный_IP]: берём реальный справа
    assert client_ip(_make_fake_request("127.0.0.1", "185.71.76.12, 203.0.113.55"), app.state.settings) == "203.0.113.55"

    with TestClient(app) as client:
        # Подмена левого IP в XFF не позволяет обойти allowlist ЮKassa и rate-limit авторизации
        r_wh = client.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "185.71.76.12, 203.0.113.55"},
            json={"event": "payment.succeeded", "object": {"id": "fake"}},
        )
        assert r_wh.status_code == 403
        assert r_wh.json()["detail"]["code"] == "webhook_ip_forbidden"

        assert client.post(
            "/api/auth/login",
            headers={"X-Forwarded-For": "1.1.1.1, 198.51.100.42"},
            json={"username": "no_user", "password": "wrong"},
        ).status_code == 401
        assert client.post(
            "/api/auth/login",
            headers={"X-Forwarded-For": "8.8.8.8, 198.51.100.42"},
            json={"username": "no_user", "password": "wrong"},
        ).status_code == 401
        r_rl = client.post(
            "/api/auth/login",
            headers={"X-Forwarded-For": "9.9.9.9, 198.51.100.42"},
            json={"username": "no_user", "password": "wrong"},
        )
        assert r_rl.status_code == 429


def test_realtime_and_calendar_auth_and_idor_protection(tmp_path: Path) -> None:
    app = create_api_app(Settings(db_path=tmp_path / "rt_cal_auth.db"))
    with TestClient(app) as c_anon, TestClient(app) as c_stu, TestClient(app) as c_tut1, TestClient(app) as c_tut2:
        assert c_stu.post("/api/auth/register", json={"username": "rt_stu", "password": "secret123"}).status_code == 200
        assert c_tut1.post("/api/auth/register", json={"username": "rt_tut1", "password": "secret123", "role": "tutor"}).status_code == 200
        assert c_tut2.post("/api/auth/register", json={"username": "rt_tut2", "password": "secret123", "role": "tutor"}).status_code == 200

        # Realtime закрыт для анонима
        assert c_anon.get("/api/realtime/recent").status_code == 401
        assert c_anon.post("/api/realtime/publish", json={"eventType": "notice", "title": "x"}).status_code == 401
        assert c_anon.get("/api/realtime/stream?once=1").status_code == 401
        with pytest.raises(Exception):
            with c_anon.websocket_connect("/api/realtime/ws"):
                pass

        # Календарь требует роль tutor
        assert c_anon.get("/api/calendar/state", params={"tutor_slug": "tut-1"}).status_code == 401
        assert c_anon.put("/api/calendar/sync", json={"tutorSlug": "tut-1"}).status_code == 401
        assert c_anon.post("/api/calendar/import-ics", json={"tutorSlug": "tut-1", "icsText": "x"}).status_code == 401
        assert c_stu.get("/api/calendar/state", params={"tutor_slug": "tut-1"}).status_code == 403
        assert c_stu.put("/api/calendar/sync", json={"tutorSlug": "tut-1"}).status_code == 403
        assert c_stu.post("/api/calendar/import-ics", json={"tutorSlug": "tut-1", "icsText": "x"}).status_code == 403

        # Tutor1 создаёт профиль/календарь -> Tutor2 не может читать/перезаписывать его (403 IDOR)
        t1_prof = c_tut1.put("/api/tutor/profile", json={"name": "Репетитор 1", "subject": "bio", "subjectName": "Биология", "price": 1200})
        assert t1_prof.status_code == 200
        t1_slug = t1_prof.json()["tutor"]["id"]
        assert c_tut1.put("/api/calendar/sync", json={"tutorSlug": t1_slug, "tutorName": "Репетитор 1"}).status_code == 200

        assert c_tut2.get("/api/calendar/state", params={"tutor_slug": t1_slug}).status_code == 403
        assert c_tut2.put("/api/calendar/sync", json={"tutorSlug": t1_slug, "tutorName": "Взлом"}).status_code == 403
        assert c_tut2.post("/api/calendar/import-ics", json={"tutorSlug": t1_slug, "icsText": "BEGIN:VCALENDAR\r\nEND:VCALENDAR"}).status_code == 403

        # Приватные финансовые/админские события нельзя публиковать с клиента (403)
        for blocked_ev in ("tutor.payout.requested", "market.dispute.opened", "payments.topup.succeeded", "refund.succeeded"):
            r_blk = c_tut1.post("/api/realtime/publish", json={"eventType": blocked_ev, "title": "Fake"})
            assert r_blk.status_code == 403


def test_tutor_endpoints_reject_student_role(tmp_path: Path) -> None:
    app = create_api_app(Settings(db_path=tmp_path / "tutor_role.db"))
    with TestClient(app) as c_stu:
        assert c_stu.post("/api/auth/register", json={"username": "only_student", "password": "secret123", "role": "student"}).status_code == 200

        checks = [
            ("GET", "/api/tutor/summary", None),
            ("PUT", "/api/tutor/account", {"name": "Хакер"}),
            ("GET", "/api/tutor/profiles", None),
            ("POST", "/api/tutor/profiles", {"name": "Хакер", "subject": "bio", "subjectName": "Биология", "price": 900}),
            ("PUT", "/api/tutor/profile", {"name": "Хакер", "subject": "bio", "subjectName": "Биология", "price": 900}),
            ("POST", "/api/tutor/bump", None),
            ("POST", "/api/tutor/payouts", {"amount": 500, "method": "sbp", "phone": "+79140001122"}),
            ("POST", "/api/tutor/npd/check-inn", {"inn": "500100732259", "save": False}),
            ("GET", "/api/tutor/verifications", None),
        ]
        for method, path, body in checks:
            res = c_stu.request(method, path, json=body)
            assert res.status_code == 403, f"{method} {path} -> {res.status_code}"
            assert res.json()["detail"]["code"] == "tutor_only"

        r_ver = c_stu.post(
            "/api/tutor/verifications",
            data={"doc_type": "diploma"},
            files={"file": ("d.pdf", b"%PDF-1.4\n%%EOF", "application/pdf")},
        )
        assert r_ver.status_code == 403
        assert r_ver.json()["detail"]["code"] == "tutor_only"


def test_csrf_origin_middleware_blocks_cross_site_cookie_mutations(tmp_path: Path) -> None:
    app = create_api_app(Settings(db_path=tmp_path / "csrf_guard.db"))
    with TestClient(app) as client:
        assert client.post("/api/auth/register", json={"username": "csrf_u", "password": "secret123"}).status_code == 200

        # Same-origin проходит
        assert client.patch(
            "/api/docs/profile",
            headers={"Origin": "http://testserver", "Sec-Fetch-Site": "same-origin"},
            json={"name": "Анна"},
        ).status_code == 200

        # Cross-site Origin / Referer / Sec-Fetch-Site с cookie отклоняются (403)
        for bad_hdrs in (
            {"Origin": "https://evil.example"},
            {"Origin": "null"},
            {"Sec-Fetch-Site": "cross-site"},
            {"Referer": "https://evil.example/phish.html"},
        ):
            r_bad = client.patch("/api/docs/profile", headers=bad_hdrs, json={"name": "Взлом"})
            assert r_bad.status_code == 403, bad_hdrs
            assert r_bad.json()["detail"]["code"] == "csrf_origin_forbidden"

        # GET с Sec-Fetch-Site=cross-site разрешён
        assert client.get("/api/docs", headers={"Sec-Fetch-Site": "cross-site"}).status_code == 200


def test_prod_hides_swagger_and_enforces_strict_csp_no_unsafe_inline(tmp_path: Path) -> None:
    from backend.main import create_app

    app = create_app(Settings(db_path=tmp_path / "prod_csp.db", env="production", dev_demo_mode=False))
    with TestClient(app) as client:
        for docs_path in ("/docs", "/redoc", "/openapi.json"):
            assert client.get(docs_path).status_code == 404, docs_path

        for html_path in ("/", "/student", "/tutor", "/privacy"):
            res = client.get(html_path)
            assert res.status_code == 200, html_path
            csp = res.headers.get("content-security-policy") or ""
            script_src = next((d.strip() for d in csp.split(";") if d.strip().startswith("script-src")), "")
            assert "'self'" in script_src
            assert "'unsafe-inline'" not in script_src, f"unsafe-inline leaked on {html_path}: {script_src}"
            assert "<script>window.EGE_HOST" not in res.text


def test_p1_rate_limits_on_payments_payouts_bookings_reviews_and_media(tmp_path: Path) -> None:
    app = create_api_app(Settings(db_path=tmp_path / "p1_ratelimits.db"))
    with TestClient(app) as c_stu, TestClient(app) as c_tut:
        r_stu = c_stu.post("/api/auth/register", json={"username": "rl_student", "password": "secret123"})
        assert r_stu.status_code == 200
        stu_id = int(r_stu.json()["user"]["id"])

        r_tut = c_tut.post(
            "/api/auth/register",
            json={"username": "rl_tutor", "password": "secret123", "role": "tutor"},
        )
        assert r_tut.status_code == 200
        tut_id = int(r_tut.json()["user"]["id"])

        # Предзаполняем лимиты через DB RateLimiter и проверяем 429 на каждом критичном роуте
        for key, limit, win in (
            (f"pay_topup:{stu_id}", 20, 600),
            (f"pay_refund:{stu_id}", 10, 900),
            (f"booking_create:{stu_id}", 20, 600),
            (f"review_create:{stu_id}", 10, 900),
            (f"dispute_open:{stu_id}", 10, 900),
            (f"media_avatar:{stu_id}", 15, 600),
            (f"tutor_payout:{tut_id}", 10, 900),
            (f"media_verif:{tut_id}", 10, 900),
        ):
            for _ in range(limit):
                app.state.db.check_rate_limit(key, limit, win)

        checks = [
            (c_stu, "POST", "/api/payments/topup", {"json": {"amount": 500, "method": "sbp"}}),
            (c_stu, "POST", "/api/wallet/topup", {"json": {"amount": 500, "method": "sbp"}}),
            (c_stu, "POST", "/api/payments/refunds", {"json": {"amount": 500, "reason": "test"}}),
            (c_stu, "POST", "/api/bookings", {"json": {"tutorId": "tut-1", "offerPrice": 1000}}),
            (c_stu, "POST", "/api/tutors/tut-1/reviews", {"json": {"rating": 5, "comment": "ok"}}),
            (
                c_stu,
                "POST",
                "/api/bookings/req-missing/dispute",
                {"json": {"reason": "first_lesson_guarantee", "comment": "Тестовый спор"}},
            ),
            (
                c_stu,
                "POST",
                "/api/media/avatar",
                {"files": {"file": ("a.png", b"\x89PNG\r\n\x1a\n", "image/png")}},
            ),
            (
                c_tut,
                "POST",
                "/api/tutor/payouts",
                {"json": {"amount": 500, "method": "sbp", "phone": "+79140001122"}},
            ),
            (
                c_tut,
                "POST",
                "/api/tutor/verifications",
                {"data": {"doc_type": "diploma"}, "files": {"file": ("d.pdf", b"%PDF-1.4\n", "application/pdf")}},
            ),
        ]
        for client, method, path, kwargs in checks:
            res = client.request(method, path, **kwargs)
            assert res.status_code == 429, f"{method} {path} -> {res.status_code} {res.text}"
            body = res.json()
            code = body.get("code") or (body.get("detail") or {}).get("code")
            assert code == "rate_limited", f"{method} {path} -> {body}"


def test_p1_postgres_prod_skips_drop_add_constraint_and_escrow_check_allows_1pct(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    import sqlite3

    from databases.postgres.schema import PgSchemaMixin
    from databases.postgres.store import PostgresDatabase, create_store

    class _FakeResult:
        def fetchone(self):
            return None

    class _FakeTx:
        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

    class _FakeConn:
        def __init__(self, log: list[str]) -> None:
            self._log = log

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

        def transaction(self):
            return _FakeTx()

        def execute(self, sql: str, *_args, **_kwargs):
            self._log.append(str(sql))
            return _FakeResult()

    class _FakePool:
        def __init__(self, log: list[str]) -> None:
            self._log = log

        def connection(self):
            return _FakeConn(self._log)

    class _FakePg(PgSchemaMixin):
        def __init__(self, run_constraint_migrations: bool) -> None:
            self.sql_log: list[str] = []
            self._pool = _FakePool(self.sql_log)
            self._run_constraint_migrations = run_constraint_migrations

    # В prod-режиме (run_constraint_migrations=False) DROP/ADD CONSTRAINT на старте не выполняется
    pg_prod = _FakePg(run_constraint_migrations=False)
    pg_prod._init_schema()
    joined_prod = "\n".join(pg_prod.sql_log)
    assert "DROP CONSTRAINT" not in joined_prod
    assert "ADD CONSTRAINT" not in joined_prod
    assert "platform_fee_rub >= 0 AND platform_fee_rub <= gross_rub" in joined_prod
    assert "tutor_payout_rub >= 0 AND tutor_payout_rub <= gross_rub - platform_fee_rub" in joined_prod
    assert "0.05" not in joined_prod
    for idx_name in (
        "idx_oltp_lesson_requests_student_created",
        "idx_oltp_lesson_requests_tutor_status_created",
        "idx_oltp_sessions_expires",
        "idx_oltp_oauth_states_expires",
        "idx_oltp_telegram_link_tokens_expires",
        "idx_oltp_realtime_notifications_created",
    ):
        assert idx_name in joined_prod

    # В dev-режиме (run_constraint_migrations=True) DROP/ADD CONSTRAINT по-прежнему отрабатывает
    pg_dev = _FakePg(run_constraint_migrations=True)
    pg_dev._init_schema()
    joined_dev = "\n".join(pg_dev.sql_log)
    assert "DROP CONSTRAINT" in joined_dev
    assert "ADD CONSTRAINT" in joined_dev

    # Проверяем, что create_store(env="production") передаёт run_constraint_migrations=False
    captured_calls: list[dict[str, object]] = []

    def _fake_pg_init(
        self,
        database_url: str,
        *,
        min_size: int = 1,
        max_size: int = 10,
        run_constraint_migrations: bool = True,
        skip_schema_init: bool = False,
    ) -> None:
        captured_calls.append(
            {
                "database_url": database_url,
                "run_constraint_migrations": run_constraint_migrations,
                "skip_schema_init": skip_schema_init,
            }
        )

    monkeypatch.setattr(PostgresDatabase, "__init__", _fake_pg_init)
    create_store(
        Settings(
            db_path=tmp_path / "cs_prod.db",
            database_url="postgresql://u:p@localhost:5432/v",
            db_mode="postgres",
            env="production",
        )
    )
    create_store(
        Settings(
            db_path=tmp_path / "cs_dev.db",
            database_url="postgresql://u:p@localhost:5432/v",
            db_mode="postgres",
            env="development",
        )
    )
    assert captured_calls[0]["run_constraint_migrations"] is False
    assert captured_calls[1]["run_constraint_migrations"] is True

    # SQLite CHECK-ограничения на escrow_holds допускают тариф ручного ученика 1%+1% и отклоняют перебор > gross_rub
    db_file = tmp_path / "escrow_1pct.db"
    db = Database(db_file)
    try:
        db.topup_wallet(db.create_user("manual_stu", "secret123").id, amount_rub=2000)
        with db._lock:
            db._conn.execute(
                """
                INSERT INTO escrow_holds (
                    id, request_id, tutor_id, student_user_id,
                    gross_rub, platform_fee_rub, tutor_payout_rub, status, created_at
                ) VALUES ('eh-1pct', 'req-1pct', 'tut-1', NULL, 1000, 10, 980, 'frozen', '2026-11-26T00:00:00Z')
                """
            )
            with pytest.raises(sqlite3.IntegrityError):
                db._conn.execute(
                    """
                    INSERT INTO escrow_holds (
                        id, request_id, tutor_id, student_user_id,
                        gross_rub, platform_fee_rub, tutor_payout_rub, status, created_at
                    ) VALUES ('eh-bad', 'req-bad', 'tut-1', NULL, 1000, 200, 900, 'frozen', '2026-11-26T00:00:00Z')
                    """
                )
    finally:
        db.close()


def test_p1_scheduler_prunes_expired_sessions_oauth_telegram_and_old_realtime(tmp_path: Path) -> None:
    import asyncio
    from datetime import datetime, timedelta, timezone

    from backend.config import SchedulerConfig
    from backend.scheduler import BackgroundScheduler

    db_file = tmp_path / "sched_prune.db"
    db = Database(db_file)
    try:
        u = db.create_user("prune_u", "secret123")
        now_int = int(time.time())
        old_iso = (datetime.now(timezone.utc) - timedelta(days=45)).strftime("%Y-%m-%dT%H:%M:%SZ")
        fresh_iso = (datetime.now(timezone.utc) - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        with db._lock:
            db._conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                ("sess-exp", u.id, now_int - 1000, now_int - 10),
            )
            db._conn.execute(
                "INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                ("sess-ok", u.id, now_int, now_int + 3600),
            )
            db._conn.execute(
                "INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, role, next_url, created_at, expires_at) VALUES (?, 'google', 'v', 'http://localhost', 'student', '/', ?, ?)",
                ("oa-exp", now_int - 1000, now_int - 10),
            )
            db._conn.execute(
                "INSERT INTO oauth_states (state_hash, provider, code_verifier, redirect_uri, role, next_url, created_at, expires_at) VALUES (?, 'google', 'v', 'http://localhost', 'student', '/', ?, ?)",
                ("oa-ok", now_int, now_int + 600),
            )
            db._conn.execute(
                "INSERT INTO telegram_link_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                ("tg-exp", u.id, now_int - 1000, now_int - 10),
            )
            db._conn.execute(
                "INSERT INTO telegram_link_tokens (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
                ("tg-ok", u.id, now_int, now_int + 600),
            )
            db._conn.execute(
                "INSERT INTO realtime_notifications (event_id, channel, event_type, title, message, payload, created_at) VALUES (?, 'all', 'notice', 'old', '', '{}', ?)",
                ("ev-old", old_iso),
            )
            db._conn.execute(
                "INSERT INTO realtime_notifications (event_id, channel, event_type, title, message, payload, created_at) VALUES (?, 'all', 'notice', 'fresh', '', '{}', ?)",
                ("ev-fresh", fresh_iso),
            )
            db._conn.commit()

        sched = BackgroundScheduler(
            settings=Settings(db_path=db_file, scheduler=SchedulerConfig(realtime_retention_days=30)),
            db=db,
        )
        res = asyncio.run(sched.run_once())
        assert res["ok"] is True
        assert res["sessionsPruned"] >= 1
        assert res["oauthStatesPruned"] >= 1
        assert res["telegramTokensPruned"] >= 1
        assert res["realtimePruned"] >= 1
        assert res["securityPruned"] >= 4

        with db._lock:
            sess_hashes = {r[0] for r in db._conn.execute("SELECT token_hash FROM sessions").fetchall()}
            oa_hashes = {r[0] for r in db._conn.execute("SELECT state_hash FROM oauth_states").fetchall()}
            tg_hashes = {r[0] for r in db._conn.execute("SELECT token_hash FROM telegram_link_tokens").fetchall()}
            rt_ids = {r[0] for r in db._conn.execute("SELECT event_id FROM realtime_notifications").fetchall()}
        assert "sess-exp" not in sess_hashes and "sess-ok" in sess_hashes
        assert "oa-exp" not in oa_hashes and "oa-ok" in oa_hashes
        assert "tg-exp" not in tg_hashes and "tg-ok" in tg_hashes
        assert "ev-old" not in rt_ids and "ev-fresh" in rt_ids
    finally:
        db.close()


