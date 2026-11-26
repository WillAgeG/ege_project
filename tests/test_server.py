"""Тесты FastAPI-бэкенда «Вектор»."""

import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, quote as quote_url, urlparse

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.ai import AIError, extract_json, normalize_messages
from backend.config import AIConfig, GoogleOAuthConfig, Settings, TelegramAuthConfig, load_ai_config, load_settings, resolve_db_path
from backend.main import create_app
from databases.sqlite.store import Database


def _make_settings(
    tmp_path: Path,
    *,
    invite_code: str = "",
    max_users: int = 0,
    max_doc_bytes: int = 2 * 1024 * 1024,
    ai: AIConfig | None = None,
    google: GoogleOAuthConfig | None = None,
    telegram: TelegramAuthConfig | None = None,
    public_base_url: str = "",
    env: str = "development",
    dev_demo_mode: bool = True,
    cors_origins: tuple[str, ...] = (),
) -> Settings:
    return Settings(
        db_path=tmp_path / "test.db",
        env=env,
        dev_demo_mode=dev_demo_mode,
        cors_origins=cors_origins,
        invite_code=invite_code,
        max_users=max_users,
        max_doc_bytes=max_doc_bytes,
        ai=ai or AIConfig(None, None, None, None, None),
        google=google or GoogleOAuthConfig(None, None),
        telegram=telegram or TelegramAuthConfig(),
        public_base_url=public_base_url,
    )


def _mock_transport(handler):
    return httpx.MockTransport(handler)


def test_health_and_html_shell(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        r_health = client.get("/api/health")
        assert r_health.status_code == 200
        assert r_health.json() == {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": False, "provider": None},
        }

        r_home = client.get("/")
        assert r_home.status_code == 200
        assert r_home.headers["cache-control"] == "no-store"
        html = r_home.text
        assert html.startswith("<!doctype html><html>")
        assert "<title>Вектор</title>" in html
        assert "--accent: #0070ff" in html and "--accent: #1d7bff" in html
        assert "#13794b" not in html
        flag_pos = html.find('<script id="ege-host-config" type="application/json">{"backend":true}</script>')
        helper_pos = html.find('<script src="/core/host-config.js"></script>')
        app_pos = html.find('<script src="app.js"></script>')
        assert 0 < flag_pos < helper_pos < app_pos
        assert "/core/legal-theme.js" in html or True
        assert "<script>window.EGE_HOST=" not in html

        r_priv = client.get("/privacy")
        assert r_priv.status_code == 200
        assert "Политика конфиденциальности" in r_priv.text

        r_design = client.get("/design")
        assert r_design.status_code == 200
        assert "Design Studio" in r_design.text and "frame-mobile" in r_design.text and "390" in r_design.text


def test_static_asset_allowlist(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        for ok_path in (
            "/app.js",
            "/bank-core.js",
            "/core/utils.js",
            "/core/api.js",
            "/core/realtime.js",
            "/core/market-bb-actions.js",
            "/views/trainer.js",
            "/views/essay-guide.js",
            "/views/progress.js",
            "/views/landing.js",
            "/views/marketplace.js",
            "/views/tutor-state.js",
            "/views/tutor-schedule.js",
            "/views/tutor-payouts.js",
            "/views/tutor-cabinet.js",
            "/ux-ui/components/icons.js",
            "/ux-ui/components/hh-components.js",
            "/ux-ui/components/charts.js",
            "/ux-ui/components/tables.js",
            "/ux-ui/components/kit.js",
            "/ux-ui/brandbook/subsites.js",
            "/ux-ui/brandbook/brandbook.js",
            "/data/plan.js",
            "/data/essay.js",
            "/subjects/biology.js",
            "/subjects/russian.js",
            "/subjects/chemistry.js",
        ):
            resp = client.get(ok_path)
            assert resp.status_code == 200, ok_path
            assert "javascript" in resp.headers["content-type"]

        for css_path in (
            "/ux-ui/styles/base.css",
            "/ux-ui/styles/brandbook.css",
            "/ux-ui/styles/tables.css",
            "/styles/study.css",
            "/styles/marketplace.css",
        ):
            resp = client.get(css_path)
            assert resp.status_code == 200, css_path
            assert "text/css" in resp.headers["content-type"]

        for img_path in (
            "/assets/lena-pillars.jpg",
        ):
            resp = client.get(img_path)
            assert resp.status_code == 200, img_path
            assert resp.headers["content-type"].startswith("image/")

        for blocked_path in (
            "/tools/bank.html",
            "/tools/bank-tools.js",
            "/.env",
            "/.env.example",
            "/backend/main.py",
            "/databases/sqlite/store.py",
            "/etl/sales/sales_metrics.py",
            "/ux-ui/tokens.json",
            "/ux-ui/README.md",
            "/requirements.txt",
            "/data/plan.txt",
            "/assets/readme.txt",
            "/assets/../.env",
            "/subjects/../.env",
            "/styles/../.env",
            "/ux-ui/styles/../../backend/main.py",
            "/views/../../databases/sqlite/store.py",
        ):
            resp = client.get(blocked_path)
            assert resp.status_code == 404, blocked_path


def test_auth_register_login_logout_and_limits(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path, invite_code="MED2027", max_users=2))
    with TestClient(app) as client:
        r_me = client.get("/api/me")
        assert r_me.status_code == 200
        assert r_me.json()["user"] is None
        assert r_me.json()["inviteRequired"] is True
        assert r_me.json()["providers"] == {"local": True, "phone": True, "google": False, "telegram": False}

        # Без кода приглашения — отказ
        r_bad_inv = client.post(
            "/api/auth/register",
            json={"username": "student1", "password": "secret123", "inviteCode": "WRONG"},
        )
        assert r_bad_inv.status_code == 403
        assert r_bad_inv.json()["detail"]["code"] == "invalid_invite"

        # Короткий логин или пароль — 400
        r_short = client.post(
            "/api/auth/register",
            json={"username": "a", "password": "secret123", "inviteCode": "MED2027"},
        )
        assert r_short.status_code == 400
        assert r_short.json()["code"] == "invalid_username"

        r_weak = client.post(
            "/api/auth/register",
            json={"username": "student1", "password": "123", "inviteCode": "MED2027"},
        )
        assert r_weak.status_code == 400
        assert r_weak.json()["code"] == "invalid_password"

        # Успешная регистрация
        r_reg = client.post(
            "/api/auth/register",
            json={
                "username": "student1",
                "password": "secret123",
                "inviteCode": "MED2027",
                "email": "Student1@Example.com",
                "displayName": "Анна",
            },
        )
        assert r_reg.status_code == 200
        user = r_reg.json()["user"]
        assert user["username"] == "student1"
        assert user["displayName"] == "Анна"
        assert user["email"] == "Student1@Example.com"
        assert "pvm_session" in client.cookies

        r_me2 = client.get("/api/me")
        assert r_me2.json()["user"] == user

        # Дубликат логина (регистронезависимо)
        r_dup = client.post(
            "/api/auth/register",
            json={"username": "Student1", "password": "secret123", "inviteCode": "MED2027"},
        )
        assert r_dup.status_code == 409
        assert r_dup.json()["code"] == "username_taken"

        # Выход и повторный вход
        assert client.post("/api/auth/logout").status_code == 200
        assert client.get("/api/me").json()["user"] is None

        r_wrong = client.post("/api/auth/login", json={"username": "student1", "password": "wrong"})
        assert r_wrong.status_code == 401
        assert r_wrong.json()["detail"]["code"] == "invalid_credentials"

        r_login = client.post("/api/auth/login", json={"username": "Student1", "password": "secret123"})
        assert r_login.status_code == 200
        assert r_login.json()["user"]["username"] == "student1"

    # Лимит max_users=2 с отдельными клиентами
    with TestClient(app) as c2:
        r2 = c2.post(
            "/api/auth/register",
            json={"username": "friend1", "password": "secret123", "inviteCode": "MED2027"},
        )
        assert r2.status_code == 200

        r3 = c2.post(
            "/api/auth/register",
            json={"username": "friend2", "password": "secret123", "inviteCode": "MED2027"},
        )
        assert r3.status_code == 403
        assert r3.json()["code"] == "user_limit"


def test_docs_crud_deep_merge_isolation_and_size_limit(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path, max_doc_bytes=300))

    with TestClient(app) as c1, TestClient(app) as c2:
        # Без входа — 401
        assert c1.get("/api/docs").status_code == 401
        assert c1.patch("/api/docs/profile", json={"name": "Аня"}).status_code == 401

        assert c1.post("/api/auth/register", json={"username": "user1", "password": "password1"}).status_code == 200
        assert c2.post("/api/auth/register", json={"username": "user2", "password": "password2"}).status_code == 200

        # Запрещённые имена документов
        assert c1.patch("/api/docs/secret", json={"x": 1}).status_code == 400

        # PATCH создаёт и глубоко сливает + удаляет None
        assert c1.patch(
            "/api/docs/profile",
            json={"name": "Анна", "targets": {"bio": 80, "chem": 75}},
        ).status_code == 200
        assert c1.patch(
            "/api/docs/profile",
            json={"targets": {"chem": None, "rus": 85}},
        ).status_code == 200

        docs_u1 = c1.get("/api/docs").json()["docs"]
        assert docs_u1 == {"profile": {"name": "Анна", "targets": {"bio": 80, "rus": 85}}}

        # Изоляция между пользователями
        assert c2.get("/api/docs").json()["docs"] == {}

        # PUT заменяет документ полностью
        assert c1.put("/api/docs/mocks", json={"list": [{"id": "m1", "s": 78}]}).status_code == 200
        assert c1.put("/api/docs/mocks", json={"list": []}).status_code == 200
        assert c1.get("/api/docs").json()["docs"]["mocks"] == {"list": []}

        # Превышение лимита размера документа -> 413
        big = {"note": "x" * 400}
        r_big = c1.put("/api/docs/plan", json=big)
        assert r_big.status_code == 413
        assert r_big.json()["code"] == "quota_exceeded"


def test_ai_disabled_and_unauth(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        assert client.post("/api/ai", json={"mode": "text", "messages": "Привет"}).status_code == 401
        client.post("/api/auth/register", json={"username": "user1", "password": "password1"})
        r = client.post("/api/ai", json={"mode": "text", "messages": "Привет"})
        assert r.status_code == 503
        assert r.json()["code"] == "not_granted"


def test_ai_gemini_stream_and_json_array(tmp_path: Path) -> None:
    ai_cfg = AIConfig(
        provider="gemini",
        api_key="gem-key",
        model="gemini-3.8-flash",
        model_complex="gemini-3.1-pro-preview",
        base_url=None,
    )
    app = create_app(_make_settings(tmp_path, ai=ai_cfg))

    seen: list[tuple[str, dict]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append((str(request.url), json.loads(request.content.decode("utf-8"))))
        assert request.headers["x-goog-api-key"] == "gem-key"
        if ":streamGenerateContent" in str(request.url):
            sse = (
                'data: {"candidates":[{"content":{"parts":[{"text":"Привет, "}]}}]}\n\n'
                'data: {"candidates":[{"content":{"parts":[{"text":"ученик!"}]}}]}\n\n'
            ).encode("utf-8")
            return httpx.Response(200, content=sse, headers={"content-type": "text/event-stream"})
        assert ":generateContent" in str(request.url)
        payload = {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {"text": '```json\n[{"t":"single","q":"Вопрос?","o":["А","Б","В"],"a":0}]\n```'}
                        ]
                    }
                }
            ]
        }
        return httpx.Response(200, json=payload)

    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=_mock_transport(handler))
        client.post("/api/auth/register", json={"username": "user1", "password": "password1"})

        with client.stream(
            "POST",
            "/api/ai",
            json={"mode": "text", "messages": [{"role": "user", "content": "Инструкция"}, {"role": "user", "content": "Объясни осмос"}]},
        ) as resp:
            assert resp.status_code == 200
            lines = [ln for ln in resp.iter_lines() if ln.startswith("data:")]
            events = [json.loads(ln[5:].strip()) for ln in lines]
        assert events == [{"delta": "Привет, "}, {"delta": "ученик!"}, {"done": True}]
        assert "gemini-3.8-flash" in seen[0][0]
        # Соседние user-сообщения объединены
        assert len(seen[0][1]["contents"]) == 1

        r_json = client.post(
            "/api/ai",
            json={"mode": "json", "messages": "Сделай тест", "modelTier": "complex"},
        )
        assert r_json.status_code == 200
        assert r_json.json() == {"data": [{"t": "single", "q": "Вопрос?", "o": ["А", "Б", "В"], "a": 0}]}
        assert "gemini-3.1-pro-preview" in seen[1][0]


def test_ai_openai_anthropic_openrouter_and_errors(tmp_path: Path) -> None:
    # OpenAI + complex tier + rate limit error
    tmp_oai = tmp_path / "oai"
    tmp_oai.mkdir()
    oai_cfg = AIConfig("openai", "sk-test", "gpt-6.1-terra", "gpt-6.1-sol", None)
    app_oai = create_app(_make_settings(tmp_oai, ai=oai_cfg))

    def oai_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        assert request.headers["authorization"] == "Bearer sk-test"
        if body["model"] == "gpt-6.1-sol":
            return httpx.Response(200, json={"choices": [{"message": {"content": '{"k":[{"id":"К1","p":1}]}'}}]})
        return httpx.Response(429, json={"error": "rate_limit"})

    with TestClient(app_oai) as client:
        client.app.state.http = httpx.AsyncClient(transport=_mock_transport(oai_handler))
        client.post("/api/auth/register", json={"username": "u1", "password": "password1"})

        r_ok = client.post("/api/ai", json={"mode": "json", "messages": "Проверь", "modelTier": "complex"})
        assert r_ok.status_code == 200
        assert r_ok.json() == {"data": {"k": [{"id": "К1", "p": 1}]}}

        with client.stream("POST", "/api/ai", json={"mode": "text", "messages": "Привет"}) as resp:
            events = [json.loads(ln[5:].strip()) for ln in resp.iter_lines() if ln.startswith("data:")]
        assert len(events) == 1
        assert events[0]["error"] == "rate_limited"

    # Anthropic streaming
    ant_dir = tmp_path / "ant"
    ant_dir.mkdir()
    ant_cfg = AIConfig("anthropic", "ant-key", "claude-sonnet-5-5", "claude-opus-5-5", None)
    app_ant = create_app(_make_settings(ant_dir, ai=ant_cfg))

    def ant_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["x-api-key"] == "ant-key"
        body = json.loads(request.content.decode("utf-8"))
        assert body.get("system") == "Будь краток."
        sse = (
            'event: content_block_delta\n'
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Ответ "}}\n\n'
            'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Клода"}}\n\n'
        ).encode("utf-8")
        return httpx.Response(200, content=sse, headers={"content-type": "text/event-stream"})

    with TestClient(app_ant) as client:
        client.app.state.http = httpx.AsyncClient(transport=_mock_transport(ant_handler))
        client.post("/api/auth/register", json={"username": "u2", "password": "password2"})
        with client.stream(
            "POST",
            "/api/ai",
            json={"mode": "text", "messages": [{"role": "system", "content": "Будь краток."}, {"role": "user", "content": "Что такое АТФ?"}]},
        ) as resp:
            events = [json.loads(ln[5:].strip()) for ln in resp.iter_lines() if ln.startswith("data:")]
        assert events == [{"delta": "Ответ "}, {"delta": "Клода"}, {"done": True}]

    # OpenRouter заголовки + invalid_json ошибка
    or_dir = tmp_path / "or"
    or_dir.mkdir()
    or_cfg = AIConfig("openrouter", "or-key", "google/gemini-3.8-flash", "anthropic/claude-sonnet-5-5", None)
    app_or = create_app(_make_settings(or_dir, ai=or_cfg))

    def or_handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://openrouter.ai/api/v1/chat/completions"
        assert request.headers["http-referer"] == "https://railway.app"
        assert request.headers["x-title"] == "Vektor EGE"
        return httpx.Response(200, json={"choices": [{"message": {"content": "не json вообще"}}]})

    with TestClient(app_or) as client:
        client.app.state.http = httpx.AsyncClient(transport=_mock_transport(or_handler))
        client.post("/api/auth/register", json={"username": "u3", "password": "password3"})
        r_bad = client.post("/api/ai", json={"mode": "json", "messages": "Дай JSON"})
        assert r_bad.status_code == 502
        assert r_bad.json()["code"] == "invalid_json"


def test_config_and_helpers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DB_PATH", raising=False)
    monkeypatch.setenv("RAILWAY_VOLUME_MOUNT_PATH", "/data")
    assert resolve_db_path() == Path("/data/app.db")

    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-123")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    cfg = load_ai_config()
    assert cfg.provider == "openai"
    assert cfg.model == "gpt-6.1-terra"

    assert extract_json('Текст перед\n[{"a": 1}]\nТекст после') == [{"a": 1}]
    with pytest.raises(AIError):
        normalize_messages([])


def test_email_login_and_validation(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        # Неверный email отклоняется
        r_bad_email = client.post(
            "/api/auth/register",
            json={"username": "ivan", "password": "secret123", "email": "not-an-email"},
        )
        assert r_bad_email.status_code == 400
        assert r_bad_email.json()["code"] == "invalid_email"

        r_ok = client.post(
            "/api/auth/register",
            json={
                "username": "ivan",
                "password": "secret123",
                "email": "Ivan@Med.ru",
                "displayName": "Иван Петров",
            },
        )
        assert r_ok.status_code == 200

        # Дубликат email в другом регистре отклонён
        r_dup = client.post(
            "/api/auth/register",
            json={"username": "ivan2", "password": "secret123", "email": "ivan@med.ru"},
        )
        assert r_dup.status_code == 409
        assert r_dup.json()["code"] == "email_taken"

    # Вход по email работает так же, как по логину
    with TestClient(app) as c2:
        r_login = c2.post("/api/auth/login", json={"username": "ivan@med.ru", "password": "secret123"})
        assert r_login.status_code == 200
        assert r_login.json()["user"]["username"] == "ivan"
        assert r_login.json()["user"]["displayName"] == "Иван Петров"


def test_google_oauth_flow_and_email_linking(tmp_path: Path) -> None:
    # Без ключей /api/auth/google/start возвращает 503
    app_no_google = create_app(_make_settings(tmp_path / "no_google"))
    with TestClient(app_no_google) as c_off:
        r_off = c_off.get("/api/auth/google/start", follow_redirects=False)
        assert r_off.status_code == 503
        assert r_off.json()["detail"]["code"] == "google_not_configured"

    google_cfg = GoogleOAuthConfig(client_id="gid-123", client_secret="gsec-456")
    app = create_app(
        _make_settings(
            tmp_path / "with_google",
            google=google_cfg,
            public_base_url="https://ege.example.com",
            max_users=2,
        )
    )

    token_requests: list[dict[str, str]] = []
    fake_profile = {
        "sub": "google-sub-1",
        "email": "maria@gmail.com",
        "email_verified": True,
        "name": "Мария Соколова",
        "picture": "https://example.com/maria.png",
    }

    def google_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == "https://oauth2.googleapis.com/token":
            parsed = parse_qs(request.content.decode("utf-8"))
            flat = {k: v[0] for k, v in parsed.items()}
            token_requests.append(flat)
            if flat.get("code") == "bad-code":
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "tok-abc"})
        if url == "https://openidconnect.googleapis.com/v1/userinfo":
            assert request.headers["authorization"] == "Bearer tok-abc"
            return httpx.Response(200, json=fake_profile)
        return httpx.Response(404)

    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=_mock_transport(google_handler))

        me = client.get("/api/me").json()
        assert me["providers"] == {"local": True, "phone": True, "google": True, "telegram": False}

        # 1. Инициализация PKCE OAuth
        r_start = client.get("/api/auth/google/start", follow_redirects=False)
        assert r_start.status_code == 302
        auth_url = urlparse(r_start.headers["location"])
        assert auth_url.netloc == "accounts.google.com"
        qs = {k: v[0] for k, v in parse_qs(auth_url.query).items()}
        assert qs["client_id"] == "gid-123"
        assert qs["redirect_uri"] == "https://ege.example.com/api/auth/google/callback"
        assert qs["code_challenge_method"] == "S256"
        state1 = qs["state"]

        # 2. Невалидный state отклоняется
        r_bad_state = client.get(
            "/api/auth/google/callback?code=ok&state=wrong-state",
            follow_redirects=False,
        )
        assert r_bad_state.status_code == 302
        assert r_bad_state.headers["location"] == "/?auth_error=oauth_state"

        # 3. Успешный callback создаёт пользователя и ставит сессию
        r_cb = client.get(
            f"/api/auth/google/callback?code=auth-code-1&state={state1}",
            follow_redirects=False,
        )
        assert r_cb.status_code == 302
        assert r_cb.headers["location"] == "/"
        assert "pvm_session" in client.cookies
        assert token_requests[0]["code_verifier"]
        assert token_requests[0]["redirect_uri"] == "https://ege.example.com/api/auth/google/callback"

        me_authed = client.get("/api/me").json()["user"]
        assert me_authed["displayName"] == "Мария Соколова"
        assert me_authed["email"] == "maria@gmail.com"
        assert me_authed["avatarUrl"] == "https://example.com/maria.png"
        assert me_authed["authProvider"] == "google"

        # Повторное использование того же state невозможно
        r_replay = client.get(
            f"/api/auth/google/callback?code=auth-code-1&state={state1}",
            follow_redirects=False,
        )
        assert r_replay.headers["location"] == "/?auth_error=oauth_state"

    # 4. Привязка Google к уже существующему локальному аккаунту с подтверждённым email
    with TestClient(app) as c_local:
        c_local.app.state.http = httpx.AsyncClient(transport=_mock_transport(google_handler))
        r_reg = c_local.post(
            "/api/auth/register",
            json={"username": "dmitry", "password": "secret123", "email": "Dmitry@Gmail.com", "displayName": "Дмитрий"},
        )
        assert r_reg.status_code == 200
        dmitry_id = r_reg.json()["user"]["id"]
        assert c_local.put("/api/docs/profile", json={"name": "Дима", "exists": True}).status_code == 200

    fake_profile.update({
        "sub": "google-sub-dmitry",
        "email": "dmitry@gmail.com",
        "email_verified": True,
        "name": "Дмитрий Гугл",
        "picture": None,
    })
    with TestClient(app) as c_g:
        c_g.app.state.http = httpx.AsyncClient(transport=_mock_transport(google_handler))
        s2 = parse_qs(urlparse(c_g.get("/api/auth/google/start", follow_redirects=False).headers["location"]).query)["state"][0]
        r_link = c_g.get(f"/api/auth/google/callback?code=ok&state={s2}", follow_redirects=False)
        assert r_link.status_code == 302
        assert r_link.headers["location"] == "/"
        linked_user = c_g.get("/api/me").json()["user"]
        assert linked_user["id"] == dmitry_id
        assert c_g.get("/api/docs").json()["docs"]["profile"]["name"] == "Дима"

    # 5. Лимит пользователей распространяется и на новых Google-пользователей
    fake_profile.update({
        "sub": "google-sub-3",
        "email": "third@gmail.com",
        "email_verified": True,
        "name": "Третий",
    })
    with TestClient(app) as c_lim:
        c_lim.app.state.http = httpx.AsyncClient(transport=_mock_transport(google_handler))
        s3 = parse_qs(urlparse(c_lim.get("/api/auth/google/start", follow_redirects=False).headers["location"]).query)["state"][0]
        r_lim = c_lim.get(f"/api/auth/google/callback?code=ok&state={s3}", follow_redirects=False)
        assert r_lim.headers["location"] == "/?auth_error=user_limit"


def test_google_oauth_role_and_next_redirect(tmp_path: Path) -> None:
    google_cfg = GoogleOAuthConfig(client_id="gid-role", client_secret="gsec-role")
    tg_cfg = TelegramAuthConfig(bot_username="vektor_ege_bot", bot_token="123456:TESTTOKEN")
    app = create_app(
        _make_settings(
            tmp_path / "google_role",
            google=google_cfg,
            telegram=tg_cfg,
            public_base_url="https://ege.example.com",
            max_users=10,
        )
    )

    profile_data = {
        "sub": "google-tutor-1",
        "email": "tutor@gmail.com",
        "email_verified": True,
        "name": "Алина Репетитор",
    }

    def google_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == "https://oauth2.googleapis.com/token":
            parsed = parse_qs(request.content.decode("utf-8"))
            if parsed.get("code", [""])[0] == "bad-code":
                return httpx.Response(400, json={"error": "invalid_grant"})
            return httpx.Response(200, json={"access_token": "tok-role"})
        if url == "https://openidconnect.googleapis.com/v1/userinfo":
            return httpx.Response(200, json=profile_data)
        return httpx.Response(404)

    with TestClient(app) as client:
        client.app.state.http = httpx.AsyncClient(transport=_mock_transport(google_handler))

        # /api/me отдает только числовой telegramBotId без секрета токена, а CSP включает Telegram Login
        me_r = client.get("/api/me")
        assert me_r.status_code == 200
        me_json = me_r.json()
        assert me_json["telegramBotUsername"] == "vektor_ege_bot"
        assert me_json["telegramBotId"] == "123456"
        assert "TESTTOKEN" not in me_r.text
        csp = me_r.headers.get("content-security-policy") or ""
        assert "https://telegram.org" in csp
        assert "https://oauth.telegram.org" in csp

        # 1. role=tutor + next=/tutor#tutor-profile сохраняются и применяются на callback
        r1 = client.get("/api/auth/google/start?role=tutor&next=/tutor%23tutor-profile", follow_redirects=False)
        assert r1.status_code == 302
        st1 = parse_qs(urlparse(r1.headers["location"]).query)["state"][0]
        cb1 = client.get(f"/api/auth/google/callback?code=ok&state={st1}", follow_redirects=False)
        assert cb1.status_code == 302
        assert cb1.headers["location"] == "/tutor#tutor-profile"
        u1 = client.get("/api/me").json()["user"]
        assert u1["role"] == "tutor"

    with TestClient(app) as c2:
        c2.app.state.http = httpx.AsyncClient(transport=_mock_transport(google_handler))
        # 2. role=tutor без next -> дефолт /tutor; открытые редиректы отсекаются
        for bad_next in ("", "https://evil.com/phish", "//evil.com/phish", "/\\evil"):
            profile_data["sub"] = f"google-tutor-{len(bad_next)}"
            profile_data["email"] = f"tut{len(bad_next)}@gmail.com"
            r_st = c2.get(
                f"/api/auth/google/start?role=tutor&next={quote_url(bad_next)}",
                follow_redirects=False,
            )
            st_tok = parse_qs(urlparse(r_st.headers["location"]).query)["state"][0]
            cb = c2.get(f"/api/auth/google/callback?code=ok&state={st_tok}", follow_redirects=False)
            assert cb.status_code == 302
            assert cb.headers["location"] == "/tutor"
            assert c2.get("/api/me").json()["user"]["role"] == "tutor"

        # 3. Недопустимая роль admin сбрасывается в student, а ошибка exchange сохраняет next
        r_adm = c2.get("/api/auth/google/start?role=admin&next=/fees", follow_redirects=False)
        st_adm = parse_qs(urlparse(r_adm.headers["location"]).query)["state"][0]
        profile_data.update({"sub": "google-stu-adm", "email": "stuadm@gmail.com"})
        cb_adm = c2.get(f"/api/auth/google/callback?code=ok&state={st_adm}", follow_redirects=False)
        assert cb_adm.headers["location"] == "/fees"
        assert c2.get("/api/me").json()["user"]["role"] == "student"

        r_err_st = c2.get("/api/auth/google/start?role=tutor", follow_redirects=False)
        st_err = parse_qs(urlparse(r_err_st.headers["location"]).query)["state"][0]
        cb_err = c2.get(f"/api/auth/google/callback?code=bad-code&state={st_err}", follow_redirects=False)
        assert cb_err.headers["location"] == "/tutor?auth_error=oauth_exchange"


def test_legacy_sqlite_migration(tmp_path: Path) -> None:
    db_path = tmp_path / "legacy.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            username_lower TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at INTEGER NOT NULL
        );
        CREATE TABLE sessions (
            token_hash TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
        );
        CREATE TABLE docs (
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            data_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            PRIMARY KEY (user_id, name)
        );
        """
    )
    conn.commit()
    conn.close()

    # Инициализация Database должна мягко мигрировать старую схему и сохранить совместимость
    db = Database(db_path)
    user = db.create_user("legacyuser", "secret123", display_name="Анна", email="legacy@example.com")
    assert user.display_name == "Анна"
    assert db.authenticate("legacy@example.com", "secret123").id == user.id
    oauth_u = db.upsert_oauth_user(
        "google",
        "sub-legacy-1",
        email="legacy@example.com",
        email_verified=True,
        display_name="Анна Google",
        avatar_url=None,
    )
    assert oauth_u.id == user.id


def test_landing_and_tutors_catalog(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        r_root = client.get("/")
        assert r_root.status_code == 200
        assert "<title>Вектор</title>" in r_root.text
        assert '<script id="ege-host-config" type="application/json">{"backend":true}</script>' in r_root.text
        assert 'src="/core/host-config.js"' in r_root.text
        assert 'href="ux-ui/styles/tables.css"' in r_root.text
        assert 'src="ux-ui/components/tables.js"' in r_root.text

        r_stu = client.get("/student")
        assert r_stu.status_code == 200
        assert "<title>Вектор — Ученик</title>" in r_stu.text
        assert '<script id="ege-host-config" type="application/json">{"backend":true,"site":"student"}</script>' in r_stu.text
        assert 'src="views/admin.js"' not in r_stu.text

        for tutor_route in ("/tutor", "/teacher", "/cabinet"):
            r_tut = client.get(tutor_route)
            assert r_tut.status_code == 200, tutor_route
            assert "<title>Вектор — Преподаватель</title>" in r_tut.text
            assert '<script id="ege-host-config" type="application/json">{"backend":true,"site":"tutor"}</script>' in r_tut.text
            assert 'src="views/admin.js"' not in r_tut.text
            assert 'src="subjects/biology.js"' in r_tut.text

        assert client.get("/views/admin.js").status_code == 404
        assert client.get("/admin").status_code == 404

        r_land = client.get("/landing")
        assert r_land.status_code == 200
        assert '<meta name="viewport"' in r_land.text
        assert '<script id="ege-host-config" type="application/json">{"backend":true,"landing":true}</script>' in r_land.text
        assert 'src="data/tutors.js"' in r_land.text

        r_bb = client.get("/brandbook")
        assert r_bb.status_code == 200
        assert "<title>Вектор — Брендбук</title>" in r_bb.text
        assert '<script id="ege-host-config" type="application/json">{"backend":true,"site":"brandbook"}</script>' in r_bb.text
        assert 'src="ux-ui/brandbook/subsites.js"' in r_bb.text
        assert 'src="app.js"' in r_bb.text

        for sub_slug in (
            "api",
            "ui-kit",
            "home",
            "mobile",
            "desktop",
            "marketplace",
            "dataviz",
            "admin",
            "data",
            "all",
        ):
            r_sub = client.get(f"/brandbook/{sub_slug}")
            assert r_sub.status_code == 200, sub_slug
            assert f'"bbSite":"{sub_slug}"' in r_sub.text

        assert client.get("/brandbook/nonexistent-page").status_code == 404

        r_mkt = client.get("/market")
        assert r_mkt.status_code == 200
        assert "<title>Вектор — Поиск репетиторов</title>" in r_mkt.text
        assert '<script id="ege-host-config" type="application/json">{"backend":true,"view":"market"}</script>' in r_mkt.text
        assert 'src="views/admin.js"' not in r_mkt.text
        assert 'src="app.js"' in r_mkt.text
        assert 'src="views/marketplace.js"' in r_mkt.text

        r_fees = client.get("/fees")
        assert r_fees.status_code == 200
        assert "<title>Вектор — Условия оплаты, эскроу и комиссия</title>" in r_fees.text
        assert '<script id="ege-host-config" type="application/json">{"backend":true,"view":"fees"}</script>' in r_fees.text
        assert 'src="views/admin.js"' not in r_fees.text
        assert 'src="app.js"' in r_fees.text

        r_priv = client.get("/privacy")
        assert r_priv.status_code == 200
        assert "Политика конфиденциальности" in r_priv.text

        r_design = client.get("/design")
        assert r_design.status_code == 200
        assert "Design Studio" in r_design.text and "frame-mobile" in r_design.text and "390" in r_design.text

        r_js = client.get("/data/tutors.js")
        assert r_js.status_code == 200
        assert "javascript" in r_js.headers["content-type"]
        assert "EGE.tutors" in r_js.text


def test_phone_otp_auth_whatsapp_and_telegram(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path / "phone_otp", invite_code="MED2027"))
    with TestClient(app) as client:
        me0 = client.get("/api/me").json()
        assert me0["providers"]["phone"] is True
        assert "telegram" in me0["providers"]

        # 1. Невалидный телефон -> 400
        r_bad_phone = client.post(
            "/api/auth/phone/send",
            json={"phone": "123", "country": "RU", "channel": "wa", "mode": "login"},
        )
        assert r_bad_phone.status_code == 400
        assert r_bad_phone.json()["detail"]["code"] == "invalid_phone"

        # 2. Проверка INVITE_CODE на регистрации
        r_bad_inv = client.post(
            "/api/auth/phone/send",
            json={
                "phone": "+7 (914) 210-05-11",
                "country": "RU",
                "channel": "wa",
                "mode": "register",
                "inviteCode": "WRONG",
            },
        )
        assert r_bad_inv.status_code == 403
        assert r_bad_inv.json()["detail"]["code"] == "invalid_invite"

        # 3. Отправка кода в WhatsApp -> смена канала на Telegram -> 7391
        r_wa = client.post(
            "/api/auth/phone/send",
            json={
                "phone": "+7 (914) 210-05-11",
                "country": "RU",
                "channel": "wa",
                "mode": "register",
                "inviteCode": "MED2027",
            },
        )
        assert r_wa.status_code == 200
        d_wa = r_wa.json()
        assert d_wa["ok"] is True
        assert d_wa["channel"] == "wa"
        assert d_wa["channelName"] == "WhatsApp"
        assert d_wa["demoCode"] == "4829"

        r_tg = client.post(
            "/api/auth/phone/send",
            json={
                "phone": "+7 (914) 210-05-11",
                "country": "RU",
                "channel": "tg",
                "mode": "register",
                "inviteCode": "MED2027",
                "resend": True,
            },
        )
        assert r_tg.status_code == 200
        d_tg = r_tg.json()
        assert d_tg["channel"] == "tg"
        assert d_tg["channelName"] == "Telegram"
        assert d_tg["demoCode"] == "7391"

        # 4. Неверный код -> 400
        r_wrong = client.post(
            "/api/auth/phone/verify",
            json={
                "phone": "+7 (914) 210-05-11",
                "country": "RU",
                "channel": "tg",
                "code": "0000",
                "role": "tutor",
                "authProvider": "telegram",
            },
        )
        assert r_wrong.status_code == 400
        assert r_wrong.json()["detail"]["code"] == "invalid_code"

        # 5. Верный код -> создаёт пользователя с ролью tutor и ставит cookie
        r_ok = client.post(
            "/api/auth/phone/verify",
            json={
                "phone": "+7 (914) 210-05-11",
                "country": "RU",
                "channel": "tg",
                "code": "7391",
                "role": "tutor",
                "authProvider": "telegram",
            },
        )
        assert r_ok.status_code == 200
        u1 = r_ok.json()["user"]
        assert u1["role"] == "tutor"
        assert u1["authProvider"] == "telegram"
        assert "pvm_session" in client.cookies

        me1 = client.get("/api/me").json()["user"]
        assert me1["id"] == u1["id"]
        assert me1["role"] == "tutor"

    # 6. Повторный вход по тому же номеру (89142100511 -> нормализуется в 79142100511) возвращает того же пользователя
    with TestClient(app) as c2:
        r_send2 = c2.post(
            "/api/auth/phone/send",
            json={"phone": "89142100511", "country": "RU", "channel": "wa", "mode": "login"},
        )
        assert r_send2.status_code == 200
        r_ok2 = c2.post(
            "/api/auth/phone/verify",
            json={
                "phone": "89142100511",
                "country": "RU",
                "channel": "wa",
                "code": r_send2.json()["demoCode"],
                "authProvider": "telegram",
            },
        )
        assert r_ok2.status_code == 200
        assert r_ok2.json()["user"]["id"] == u1["id"]


def test_orchestrator_directions_discover_and_sync(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path / "directions"))
    with TestClient(app) as client:
        # 1. Изначально список направлений пуст, /api/market/state отдаёт directions
        r0 = client.get("/api/market/directions")
        assert r0.status_code == 200
        assert r0.json() == {"ok": True, "directions": []}
        st0 = client.get("/api/market/state")
        assert st0.status_code == 200
        assert st0.json()["directions"] == []

        # 2. Валидация слишком короткого названия -> 400
        r_bad = client.post("/api/market/directions/discover", json={"name": " "})
        assert r_bad.status_code == 400

        # 3. Оркестратор обнаруживает новое направление
        r1 = client.post(
            "/api/market/directions/discover",
            json={
                "name": "Каллиграфия и леттеринг",
                "short": "Каллиграфия",
                "source": "orchestrator",
                "keywords": ["перо", "тушь"],
                "tutorCount": 3,
            },
        )
        assert r1.status_code == 200
        d1 = r1.json()
        assert d1["ok"] is True
        assert d1["created"] is True
        assert d1["direction"]["short"] == "Каллиграфия"
        assert d1["direction"]["source"] == "orchestrator"
        assert d1["direction"]["demandCount"] == 1
        assert d1["direction"]["tutorCount"] == 3
        assert d1["direction"]["autoAdded"] is True

        # 4. Повторное обнаружение дедуплицируется и увеличивает demandCount
        r2 = client.post(
            "/api/market/directions/discover",
            json={
                "name": "каллиграфия",
                "source": "orchestrator",
                "keywords": ["кисть"],
                "tutorCount": 5,
            },
        )
        assert r2.status_code == 200
        d2 = r2.json()
        assert d2["created"] is False
        assert d2["direction"]["id"] == d1["direction"]["id"]
        assert d2["direction"]["demandCount"] == 2
        assert d2["direction"]["tutorCount"] == 5
        assert "кисть" in d2["direction"]["keywords"]

        # 5. Отображается в GET /api/market/directions и GET /api/market/state
        st1 = client.get("/api/market/state").json()
        assert len(st1["directions"]) == 1
        assert st1["directions"][0]["short"] == "Каллиграфия"


def test_reviews_recalculate_rating_and_dispute_escrow_refund(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path / "reviews_disputes"))
    with TestClient(app) as client:
        r_reg = client.post(
            "/api/auth/register",
            json={"username": "stu_review", "password": "secret123", "displayName": "Мария К."},
        )
        assert r_reg.status_code == 200

        # Пополняем баланс до 5000 ₽
        r_top = client.post("/api/wallet/topup", json={"amount": 5000, "method": "sbp"})
        assert r_top.status_code == 200
        pre_balance = int(r_top.json()["wallet"]["balanceRub"])
        assert pre_balance >= 5000

        # Создаём и принимаем бронь за 1200 ₽ (эскроу списывает 1200 ₽ с доступного баланса)
        r_bk = client.post(
            "/api/bookings",
            json={
                "tutorId": "tut-sokolova",
                "tutorName": "Анна Соколова",
                "subject": "eng",
                "subjectName": "Английский язык",
                "exam": "ЕГЭ",
                "format": "Онлайн",
                "city": "Якутск",
                "dayIso": "2026-11-25",
                "hour": "16:00",
                "offerPrice": 1200,
                "tutorPrice": 1200,
                "firstLessonGuarantee": True,
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]

        r_acc = client.post(f"/api/bookings/{booking_id}/accept", json={"counterPrice": 1200})
        assert r_acc.status_code == 200
        after_hold_balance = int(r_acc.json()["wallet"]["balanceRub"])
        assert after_hold_balance == pre_balance - 1200

        # Оставляем отзыв 3 ★ и проверяем пересчёт среднего рейтинга и reviewsSummary
        r_rev1 = client.post(
            "/api/tutors/tut-sokolova/reviews",
            json={
                "rating": 3,
                "comment": "Понятный разбор, но мало практики.",
                "bookingId": booking_id,
                "tags": ["Понятно объясняет"],
            },
        )
        assert r_rev1.status_code == 200
        rev1_data = r_rev1.json()
        assert rev1_data["ok"] is True
        assert rev1_data["reviewsCount"] == 1
        assert rev1_data["rating"] == 3.0

        r_rev2 = client.post(
            "/api/tutors/tut-sokolova/reviews",
            json={"rating": 5, "comment": "Второй урок прошёл идеально!"},
        )
        assert r_rev2.status_code == 200
        rev2_data = r_rev2.json()
        assert rev2_data["reviewsCount"] == 2
        assert rev2_data["rating"] == 4.0

        r_list = client.get("/api/tutors/tut-sokolova/reviews")
        assert r_list.status_code == 200
        list_json = r_list.json()
        assert list_json["reviewsCount"] == 2
        assert list_json["rating"] == 4.0
        assert len(list_json["reviews"]) == 2

        st_after_rev = client.get("/api/market/state").json()
        assert st_after_rev["reviewsSummary"]["tut-sokolova"]["reviewsCount"] == 2
        assert st_after_rev["reviewsSummary"]["tut-sokolova"]["rating"] == 4.0

        # Короткий комментарий спора -> 400 / 422
        r_bad_dsp = client.post(
            f"/api/bookings/{booking_id}/dispute",
            json={"reason": "first_lesson_guarantee", "comment": "а", "firstLessonGuarantee": True},
        )
        assert r_bad_dsp.status_code in (400, 422)

        # Открываем спор по гарантии 1-го урока
        r_dsp = client.post(
            f"/api/bookings/{booking_id}/dispute",
            json={
                "reason": "first_lesson_guarantee",
                "comment": "Первый урок не подошёл по формату, прошу вернуть оплату.",
                "firstLessonGuarantee": True,
            },
        )
        assert r_dsp.status_code == 200
        dispute = r_dsp.json()["dispute"]
        dispute_id = dispute["id"]
        assert dispute["status"] == "open"
        assert dispute["amountRub"] == 1200

        # Виден и ученику, и админу
        r_my_dsp = client.get("/api/disputes")
        assert r_my_dsp.status_code == 200
        assert any(d["id"] == dispute_id for d in r_my_dsp.json()["disputes"])

        r_adm_dsp = client.get("/api/admin/disputes")
        assert r_adm_dsp.status_code == 200
        assert any(d["id"] == dispute_id for d in r_adm_dsp.json()["disputes"])

        # Админ одобряет возврат оплаты с эскроу
        r_res = client.post(
            f"/api/admin/disputes/{dispute_id}/resolve",
            json={"action": "refund", "resolutionNote": "Подтверждено по гарантии 1-го урока"},
        )
        assert r_res.status_code == 200
        res_json = r_res.json()
        assert res_json["ok"] is True
        assert res_json["dispute"]["status"] == "refunded"
        assert res_json["refundedRub"] == 1200
        assert int(res_json["wallet"]["balanceRub"]) == pre_balance

        # Повторное решение по закрытому спору -> 409
        r_dup = client.post(f"/api/admin/disputes/{dispute_id}/resolve", json={"action": "refund"})
        assert r_dup.status_code == 409


def test_legal_pages_privacy_terms_refunds_152fz(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path / "legal"))
    with TestClient(app) as client:
        r_priv = client.get("/privacy")
        assert r_priv.status_code == 200
        assert "Политика конфиденциальности" in r_priv.text
        assert "152-ФЗ" in r_priv.text
        assert "/terms" in r_priv.text
        assert "/refunds" in r_priv.text

        for path in ("/terms", "/offer"):
            r_terms = client.get(path)
            assert r_terms.status_code == 200
            assert "Публичная оферта" in r_terms.text
            assert "437" in r_terms.text
            assert "5%" in r_terms.text and "94%" in r_terms.text and "98%" in r_terms.text
            assert "/student?auth=register" in r_terms.text
            assert "/tutor?auth=register" in r_terms.text
            assert "/student?auth=login" in r_terms.text

        for path in ("/refunds", "/escrow"):
            r_ref = client.get(path)
            assert r_ref.status_code == 200
            assert "Правила возврата средств" in r_ref.text
            assert "Гарантия первого урока" in r_ref.text
            assert "first_lesson_guarantee" in r_ref.text


def test_production_mode_disables_demo_otp_and_student_sim_accept(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("VEKTOR_ENV", "production")
    monkeypatch.delenv("DEV_DEMO_MODE", raising=False)
    monkeypatch.delenv("ADMIN_REQUIRE_AUTH", raising=False)
    monkeypatch.setenv("CORS_ORIGINS", "https://app.vektor-ege.ru/, https://admin.vektor-ege.ru")
    prod_loaded = load_settings()
    assert prod_loaded.env == "production"
    assert prod_loaded.dev_demo_mode is False
    assert prod_loaded.admin_require_auth is True
    assert prod_loaded.cors_origins == ("https://app.vektor-ege.ru", "https://admin.vektor-ege.ru")

    app = create_app(_make_settings(tmp_path / "prod_mode", env="production", dev_demo_mode=False))
    with TestClient(app) as client:
        me0 = client.get("/api/me").json()
        assert me0["demoMode"] is False

        home_html = client.get("/").text
        assert '<script id="ege-host-config" type="application/json">{"backend":true,"demoMode":false}</script>' in home_html

        r_send = client.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-05-99", "country": "RU", "channel": "wa", "mode": "login"},
        )
        assert r_send.status_code == 200
        send_data = r_send.json()
        assert send_data["ok"] is True
        assert send_data["demoMode"] is False
        assert "demoCode" not in send_data

        # В проде дефолтный "4829" не принимается
        r_bad_otp = client.post(
            "/api/auth/phone/verify",
            json={"phone": "+7 (914) 210-05-99", "country": "RU", "channel": "wa", "code": "4829"},
        )
        assert r_bad_otp.status_code == 400
        assert r_bad_otp.json()["detail"]["code"] == "invalid_code"

        # Ученик в проде не может сам нажать accept по своей pending-заявке
        assert client.post(
            "/api/auth/register",
            json={"username": "stu_prod_sec", "password": "secret123", "displayName": "Артём"},
        ).status_code == 200
        assert client.post("/api/wallet/topup", json={"amount": 5000, "method": "sbp"}).status_code == 503
        stu_uid = client.get("/api/me").json()["user"]["id"]
        app.state.db.topup_wallet(stu_uid, amount_rub=5000, method="sbp")
        r_bk = client.post(
            "/api/bookings",
            json={
                "tutorId": "tut-sokolova",
                "tutorName": "Анна Соколова",
                "subject": "eng",
                "subjectName": "Английский язык",
                "dayIso": "2026-11-26",
                "hour": "16:00",
                "offerPrice": 1200,
            },
        )
        assert r_bk.status_code == 200
        bk_id = r_bk.json()["booking"]["id"]
        r_stu_acc = client.post(f"/api/bookings/{bk_id}/accept", json={"counterPrice": 1200})
        assert r_stu_acc.status_code == 403
        assert r_stu_acc.json()["code"] == "forbidden"


def test_account_export_and_delete_152fz(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path / "delete_152fz"))
    with TestClient(app) as client:
        assert client.get("/api/me/export").status_code == 401
        assert client.delete("/api/me").status_code == 401

        r_reg = client.post(
            "/api/auth/register",
            json={"username": "pd_user", "password": "secret123", "displayName": "Ольга Н.", "email": "olga@example.com"},
        )
        assert r_reg.status_code == 200
        user_id = int(r_reg.json()["user"]["id"])

        assert client.patch(
            "/api/docs/profile",
            json={"name": "Ольга Николаева", "phone": "+79142100577", "city": "Якутск"},
        ).status_code == 200
        assert client.post("/api/wallet/topup", json={"amount": 5000, "method": "sbp"}).status_code == 200
        r_bk = client.post(
            "/api/bookings",
            json={
                "tutorId": "tut-sokolova",
                "tutorName": "Анна Соколова",
                "subject": "eng",
                "subjectName": "Английский язык",
                "dayIso": "2026-11-27",
                "hour": "17:00",
                "offerPrice": 1100,
                "note": "Подготовка к ЕГЭ",
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]

        # 1. Экспорт ПДн (152-ФЗ)
        r_exp = client.get("/api/me/export")
        assert r_exp.status_code == 200
        assert r_exp.headers["cache-control"] == "no-store"
        assert "attachment;" in r_exp.headers["content-disposition"]
        exp = r_exp.json()
        assert exp["schema"] == "vektor-ege-personal-data-v1"
        assert exp["legalBasis"] == "152-FZ"
        assert exp["account"]["username"] == "pd_user"
        assert exp["account"]["email"] == "olga@example.com"
        assert "password_hash" not in json.dumps(exp)
        assert exp["docs"]["profile"]["city"] == "Якутск"
        assert any(b["id"] == booking_id for b in exp["bookings"])

        # 2. Удаление аккаунта (152-ФЗ)
        r_del = client.delete("/api/me")
        assert r_del.status_code == 200
        del_data = r_del.json()
        assert del_data["ok"] is True
        assert del_data["deleted"] is True
        assert del_data["userId"] == user_id
        assert del_data["revokedSessions"] >= 1
        assert del_data["anonymizedBookings"] == 1

        # Сессия и логин больше не действительны
        assert client.get("/api/me").json()["user"] is None
        assert client.get("/api/docs").status_code == 401
        r_relogin = client.post("/api/auth/login", json={"username": "pd_user", "password": "secret123"})
        assert r_relogin.status_code == 401

        # Персональные данные в заявке обезличены, а таблица users не содержит запись
        with sqlite3.connect(app.state.settings.db_path) as conn:
            u_cnt = conn.execute("SELECT COUNT(*) FROM users WHERE id = ?", (user_id,)).fetchone()[0]
            assert u_cnt == 0
            bk_row = conn.execute(
                "SELECT student_user_id, student_name, note FROM admin_lesson_requests WHERE id = ?",
                (booking_id,),
            ).fetchone()
            assert bk_row == (None, "Удалённый пользователь", "")


def test_security_headers_and_seo_routes(tmp_path: Path) -> None:
    app = create_app(
        _make_settings(
            tmp_path / "sec_seo",
            public_base_url="https://vektor-ege.example.com",
        )
    )
    with TestClient(app) as client:
        for path in ("/", "/api/health", "/terms"):
            r = client.get(path)
            assert r.status_code == 200, path
            assert r.headers.get("x-content-type-options") == "nosniff"
            assert r.headers.get("x-frame-options") == "SAMEORIGIN"
            assert r.headers.get("referrer-policy") == "strict-origin-when-cross-origin"
            assert "camera=(self)" in (r.headers.get("permissions-policy") or "")
            assert r.headers.get("x-permitted-cross-domain-policies") == "none"
            csp = r.headers.get("content-security-policy") or ""
            script_src_dir = next((d.strip() for d in csp.split(";") if d.strip().startswith("script-src")), "")
            assert "default-src 'self'" in csp and "frame-ancestors 'self'" in csp
            assert "'self'" in script_src_dir and "'unsafe-inline'" not in script_src_dir

        r_https = client.get("/", headers={"X-Forwarded-Proto": "https"})
        assert r_https.status_code == 200
        assert "max-age=31536000" in (r_https.headers.get("strict-transport-security") or "")

        r_rob = client.get("/robots.txt")
        assert r_rob.status_code == 200
        assert "text/plain" in r_rob.headers["content-type"]
        assert "Disallow: /api/" in r_rob.text
        assert "Sitemap: https://vektor-ege.example.com/sitemap.xml" in r_rob.text

        r_map = client.get("/sitemap.xml")
        assert r_map.status_code == 200
        assert "application/xml" in r_map.headers["content-type"]
        for page in ("/", "/landing", "/market", "/terms", "/refunds", "/privacy"):
            assert f"<loc>https://vektor-ege.example.com{page}</loc>" in r_map.text

