"""Тесты FastAPI-бэкенда «Вектор ЕГЭ»."""

import json
from pathlib import Path
import sqlite3
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient
import httpx
import pytest

from server.ai import AIError, extract_json, normalize_messages
from server.config import AIConfig, GoogleOAuthConfig, Settings, load_ai_config, resolve_db_path
from server.db import Database
from server.main import create_app


def _make_settings(
    tmp_path: Path,
    *,
    invite_code: str = "",
    max_users: int = 0,
    max_doc_bytes: int = 2 * 1024 * 1024,
    ai: AIConfig | None = None,
    google: GoogleOAuthConfig | None = None,
    public_base_url: str = "",
) -> Settings:
    return Settings(
        db_path=tmp_path / "test.db",
        invite_code=invite_code,
        max_users=max_users,
        max_doc_bytes=max_doc_bytes,
        ai=ai or AIConfig(None, None, None, None, None),
        google=google or GoogleOAuthConfig(None, None),
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
        assert "<title>Вектор ЕГЭ</title>" in html
        assert "--accent: #13794b" in html
        flag_pos = html.find("<script>window.EGE_HOST={backend:true};</script>")
        app_pos = html.find('<script src="app.js"></script>')
        assert 0 < flag_pos < app_pos

        r_priv = client.get("/privacy")
        assert r_priv.status_code == 200
        assert "Политика конфиденциальности" in r_priv.text


def test_static_asset_allowlist(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        for ok_path in (
            "/app.js",
            "/bank-core.js",
            "/data/plan.js",
            "/data/essay.js",
            "/subjects/biology.js",
            "/subjects/russian.js",
            "/subjects/chemistry.js",
        ):
            resp = client.get(ok_path)
            assert resp.status_code == 200, ok_path
            assert "javascript" in resp.headers["content-type"]

        for blocked_path in (
            "/tools/bank.html",
            "/tools/bank-tools.js",
            "/.env",
            "/.env.example",
            "/server/main.py",
            "/server/db.py",
            "/requirements.txt",
            "/data/plan.txt",
            "/subjects/../.env",
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
        assert r_me.json()["providers"] == {"local": True, "google": False}

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
        assert me["providers"] == {"local": True, "google": True}

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
        r_land = client.get("/landing")
        assert r_land.status_code == 200
        assert "window.EGE_HOST={backend:true,landing:true}" in r_land.text
        assert 'src="data/tutors.js"' in r_land.text

        r_js = client.get("/data/tutors.js")
        assert r_js.status_code == 200
        assert "javascript" in r_js.headers["content-type"]
        assert "EGE.tutors" in r_js.text


