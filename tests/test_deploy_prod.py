"""Тесты прод-контура РФ (152-ФЗ): Docker Compose, Caddy, Nginx, PostgreSQL 17, Streamlit и скрипты."""

from __future__ import annotations

from pathlib import Path
import shutil
import subprocess

from fastapi.testclient import TestClient
import pytest
import yaml

from backend.config import AIConfig, GoogleOAuthConfig, Settings, load_settings
from backend.main import create_app

ROOT_DIR = Path(__file__).resolve().parent.parent


def _load_yaml(rel_path: str) -> dict:
    path = ROOT_DIR / rel_path
    assert path.is_file(), f"Не найден файл {rel_path}"
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


def test_compose_topology_and_152fz_isolation() -> None:
    compose = _load_yaml("docker-compose.yml")
    services = compose["services"]
    networks = compose["networks"]
    volumes = compose["volumes"]

    assert {"postgres", "migrate", "app", "admin", "caddy", "bot"}.issubset(services.keys())
    assert networks["backend_internal"].get("internal") is True
    assert networks["edge"].get("driver") == "bridge"
    assert {"pg_data", "app_data", "caddy_data", "caddy_config"}.issubset(volumes.keys())

    # Одноразовый сервис автомиграций Alembic в закрытой сети
    mig_svc = services["migrate"]
    assert mig_svc["command"] == ["alembic", "upgrade", "head"]
    assert mig_svc["networks"] == ["backend_internal"]

    # PostgreSQL 17 полностью изолирован во внутренней сети без публичных портов
    pg = services["postgres"]
    assert pg["image"] == "postgres:17-alpine"
    assert "ports" not in pg
    assert pg["networks"] == ["backend_internal"]
    assert "healthcheck" in pg
    pg_vols = "\n".join(pg["volumes"])
    assert "./deploy/postgres/init.sql:" in pg_vols
    assert "./deploy/postgres/postgresql.conf:" in pg_vols

    # FastAPI без публичных портов, с prod-дефолтами безопасности и подключением к postgres + migrate + edge
    app_svc = services["app"]
    assert "ports" not in app_svc
    assert set(app_svc["networks"]) == {"edge", "backend_internal"}
    assert "healthcheck" in app_svc
    assert app_svc["depends_on"]["migrate"]["condition"] == "service_completed_successfully"
    app_env = app_svc["environment"]
    assert "${VEKTOR_ENV:-production}" in str(app_env["VEKTOR_ENV"])
    assert "${DEV_DEMO_MODE:-0}" in str(app_env["DEV_DEMO_MODE"])
    assert "${ADMIN_REQUIRE_AUTH:-1}" in str(app_env["ADMIN_REQUIRE_AUTH"])
    assert "${DB_MODE:-postgres}" in str(app_env["DB_MODE"])
    assert "${DB_RUN_CONSTRAINT_DDL:-0}" in str(app_env["DB_RUN_CONSTRAINT_DDL"])
    assert "${WEB_CONCURRENCY:-2}" in str(app_env["WEB_CONCURRENCY"])
    assert "${LOG_FORMAT:-json}" in str(app_env["LOG_FORMAT"])
    assert "${METRICS_ENABLED:-1}" in str(app_env["METRICS_ENABLED"])
    assert "${SCHEDULER_ADVISORY_LOCK_ENABLED:-1}" in str(app_env["SCHEDULER_ADVISORY_LOCK_ENABLED"])
    assert "${REALTIME_PG_NOTIFY_ENABLED:-1}" in str(app_env["REALTIME_PG_NOTIFY_ENABLED"])
    assert "${BACKUP_ENCRYPTION_KEY:-}" in str(app_env["BACKUP_ENCRYPTION_KEY"])
    assert "${BACKUP_S3_BUCKET:-}" in str(app_env["BACKUP_S3_BUCKET"])
    assert "@postgres:5432/" in str(app_env["DATABASE_URL"])

    # Streamlit-админка только в edge, ходит на http://app:8000, без публичных портов
    admin_svc = services["admin"]
    assert "ports" not in admin_svc
    assert admin_svc["build"]["context"] == "./admin_streamlit"
    assert admin_svc["networks"] == ["edge"]
    assert admin_svc["environment"]["ADMIN_API_BASE_URL"] == "http://app:8000"
    assert "healthcheck" in admin_svc

    # Caddy — единственная публичная точка входа (80, 443, 443/udp)
    caddy_svc = services["caddy"]
    assert caddy_svc["image"] == "caddy:2.9-alpine"
    assert set(caddy_svc["ports"]) == {"80:80", "443:443", "443:443/udp"}
    assert caddy_svc["networks"] == ["edge"]
    assert any("Caddyfile" in v for v in caddy_svc["volumes"])

    # Опциональный профиль Telegram bot polling
    bot_svc = services["bot"]
    assert "bot-polling" in bot_svc["profiles"]
    assert set(bot_svc["networks"]) == {"edge", "backend_internal"}


def test_docker_compose_cli_validates_caddy_and_nginx_profiles() -> None:
    docker_bin = shutil.which("docker")
    if not docker_bin:
        pytest.skip("docker CLI недоступен в текущей среде")

    r_caddy = subprocess.run(
        [docker_bin, "compose", "-f", "docker-compose.yml", "--env-file", ".env.prod.example", "config", "--quiet"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_caddy.returncode == 0, r_caddy.stderr

    r_nginx = subprocess.run(
        [
            docker_bin,
            "compose",
            "-f",
            "docker-compose.yml",
            "-f",
            "deploy/nginx/docker-compose.nginx.yml",
            "--env-file",
            ".env.prod.example",
            "config",
            "--quiet",
        ],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_nginx.returncode == 0, r_nginx.stderr


def test_caddy_nginx_and_dockerfile_hardening() -> None:
    caddyfile = (ROOT_DIR / "deploy/caddy/Caddyfile").read_text(encoding="utf-8")
    for token in (
        "{$APP_DOMAIN}",
        "{$ADMIN_DOMAIN}",
        "{$ACME_EMAIL}",
        "basic_auth",
        "{$ADMIN_BASIC_USER}",
        "{$ADMIN_BASIC_HASH}",
        "flush_interval -1",
        "/api/realtime/stream*",
        "/api/ai/*",
        "/api/payments/yookassa/webhook",
        "/api/payouts/yookassa/webhook",
        "185.71.76.0/27",
        "X-Robots-Tag",
        "-Server",
        "admin:8501",
        "/openapi.json",
    ):
        assert token in caddyfile

    nginx_conf = (ROOT_DIR / "deploy/nginx/vektor.conf").read_text(encoding="utf-8")
    for token in (
        "TLSv1.2 TLSv1.3",
        "proxy_buffering off",
        "Upgrade $http_upgrade",
        "auth_basic",
        "X-Forwarded-Proto $scheme",
        "X-Request-ID $vektor_req_id",
        "openapi\\.json",
        "/api/payments/yookassa/webhook",
        "/api/payouts/yookassa/webhook",
        "allow 185.71.76.0/27;",
        "X-Robots-Tag",
        "server_tokens off",
        "/_stcore/stream",
        "http://app:8000",
        "http://admin:8501",
    ):
        assert token in nginx_conf

    app_df = (ROOT_DIR / "Dockerfile").read_text(encoding="utf-8")
    assert "USER vektor" in app_df
    assert "HEALTHCHECK" in app_df
    assert "openssl" in app_df
    assert "postgresql-client" in app_df
    assert "--workers ${WEB_CONCURRENCY:-2}" in app_df
    assert "--proxy-headers" in app_df

    adm_df = (ROOT_DIR / "admin_streamlit/Dockerfile").read_text(encoding="utf-8")
    assert "USER vektor" in adm_df
    assert "HEALTHCHECK" in adm_df
    assert "http://app:8000" in adm_df
    assert (ROOT_DIR / "admin_streamlit/.dockerignore").is_file()

    root_ignore = (ROOT_DIR / ".dockerignore").read_text(encoding="utf-8")
    for pattern in ("deploy/", "backups/", ".env.*", "docker-compose*.yml"):
        assert pattern in root_ignore

    pg_init = (ROOT_DIR / "deploy/postgres/init.sql").read_text(encoding="utf-8")
    assert "CREATE SCHEMA IF NOT EXISTS oltp;" in pg_init
    assert "CREATE SCHEMA IF NOT EXISTS outbox;" in pg_init


def test_proxy_https_headers_and_secure_session_cookie(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("VEKTOR_ENV", "production")
    monkeypatch.setenv("ADMIN_API_TOKEN", "prod_secret_token_for_tests_123456")
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://vektor-test.ru")
    loaded = load_settings()
    assert loaded.env == "production"
    assert loaded.dev_demo_mode is False
    assert loaded.admin_require_auth is True

    settings = Settings(
        db_path=tmp_path / "prod_proxy.db",
        env="production",
        dev_demo_mode=False,
        security_headers=True,
        admin_require_auth=True,
        admin_api_token="prod_secret_token_for_tests_123456",
        public_base_url="https://vektor-test.ru",
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )
    app = create_app(settings)
    with TestClient(app) as client:
        r_http = client.get("/api/health")
        assert r_http.status_code == 200
        assert "strict-transport-security" not in {k.lower() for k in r_http.headers}

        r_https = client.get("/api/health", headers={"X-Forwarded-Proto": "https"})
        assert r_https.status_code == 200
        assert r_https.headers.get("strict-transport-security") == "max-age=31536000; includeSubDomains"
        assert r_https.headers.get("x-content-type-options") == "nosniff"

        r_reg = client.post(
            "/api/auth/register",
            json={"username": "rf_prod_student", "password": "StrongPassword123", "role": "student"},
            headers={"X-Forwarded-Proto": "https"},
        )
        assert r_reg.status_code == 200
        set_cookie = r_reg.headers.get("set-cookie", "")
        assert "pvm_session=" in set_cookie
        assert "HttpOnly" in set_cookie
        assert "SameSite=lax" in set_cookie
        assert "Secure" in set_cookie

        assert client.get("/api/admin/overview").status_code == 401
        assert (
            client.get(
                "/api/admin/overview",
                headers={"X-Admin-Token": "prod_secret_token_for_tests_123456"},
            ).status_code
            == 200
        )


def test_deploy_scripts_syntax_and_preflight_validation(tmp_path: Path) -> None:
    preflight = ROOT_DIR / "deploy/scripts/preflight_rf.sh"
    backup = ROOT_DIR / "deploy/scripts/backup_postgres.sh"

    r_syntax = subprocess.run(
        ["bash", "-n", str(preflight), str(backup)],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_syntax.returncode == 0, r_syntax.stderr

    # Шаблон .env.prod.example с заглушками обязан отклоняться
    r_example = subprocess.run(
        ["bash", str(preflight), "--skip-compose", ".env.prod.example"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_example.returncode != 0

    # Валидный prod .env с bcrypt-хэшем в одинарных кавычках проходит проверку
    good_env = tmp_path / ".env.good"
    good_env.write_text(
        "\n".join(
            [
                "APP_DOMAIN=vektor-ege.ru",
                "ADMIN_DOMAIN=admin.vektor-ege.ru",
                "ACME_EMAIL=ops@vektor-ege.ru",
                "ADMIN_BASIC_USER=ops",
                "ADMIN_BASIC_HASH='$2a$14$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345'",
                "POSTGRES_DB=vektor_ege",
                "POSTGRES_USER=vektor",
                "POSTGRES_PASSWORD=0123456789abcdef0123456789abcdef",
                "DB_MODE=postgres",
                "VEKTOR_ENV=production",
                "DEV_DEMO_MODE=0",
                "SECURITY_HEADERS=1",
                "ADMIN_REQUIRE_AUTH=1",
                "ADMIN_API_TOKEN=abcdef0123456789abcdef0123456789",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    args = ["bash", str(preflight)]
    if not shutil.which("docker"):
        args.append("--skip-compose")
    args.append(str(good_env))
    r_good = subprocess.run(args, cwd=ROOT_DIR, capture_output=True, text=True, check=False)
    assert r_good.returncode == 0, f"{r_good.stdout}\n{r_good.stderr}"

    # Пароль Postgres с @ в URL или неэкранированный хэш должны отклоняться
    bad_env = tmp_path / ".env.bad"
    bad_env.write_text(
        good_env.read_text(encoding="utf-8")
        .replace("0123456789abcdef0123456789abcdef", "bad@pass/with:urlchars1234")
        .replace("'$2a$14$abcdefghijklmnopqrstuvABCDEFGHIJKLMNOPQRSTUVWXYZ012345'", "14"),
        encoding="utf-8",
    )
    r_bad = subprocess.run(
        ["bash", str(preflight), "--skip-compose", str(bad_env)],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_bad.returncode != 0

    # Проверка новых prod-правил: DB_RUN_CONSTRAINT_DDL=1 и BACKUP_S3_BUCKET без BACKUP_ENCRYPTION_KEY отклоняются
    bad_ddl_env = tmp_path / ".env.bad_ddl"
    bad_ddl_env.write_text(good_env.read_text(encoding="utf-8") + "DB_RUN_CONSTRAINT_DDL=1\n", encoding="utf-8")
    assert (
        subprocess.run(
            ["bash", str(preflight), "--skip-compose", str(bad_ddl_env)],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=False,
        ).returncode
        != 0
    )

    bad_s3_env = tmp_path / ".env.bad_s3"
    bad_s3_env.write_text(good_env.read_text(encoding="utf-8") + "BACKUP_S3_BUCKET=vektor-bak\n", encoding="utf-8")
    assert (
        subprocess.run(
            ["bash", str(preflight), "--skip-compose", str(bad_s3_env)],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=False,
        ).returncode
        != 0
    )

    full_prod_env = tmp_path / ".env.full_prod"
    full_prod_env.write_text(
        good_env.read_text(encoding="utf-8")
        + "\n".join(
            [
                "DB_RUN_CONSTRAINT_DDL=0",
                "WEB_CONCURRENCY=2",
                "LOG_FORMAT=json",
                "METRICS_TOKEN=0123456789abcdef0123456789abcdef",
                "BACKUP_ENCRYPTION_KEY=fedcba9876543210fedcba9876543210",
                "BACKUP_S3_BUCKET=vektor-bak",
                "BACKUP_S3_REQUIRE_ENCRYPTION=1",
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    assert (
        subprocess.run(
            ["bash", str(preflight), "--skip-compose", str(full_prod_env)],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=False,
        ).returncode
        == 0
    )
