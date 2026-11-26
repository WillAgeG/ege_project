"""Тесты Alembic-миграций, автобэкапов БД, 5xx-алертов (TG/Sentry), pg-backup и Яндекс Метрики."""

from __future__ import annotations

from datetime import datetime, timezone
import gzip
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess

from fastapi.testclient import TestClient
import httpx
import pytest
import yaml

from backend.api import create_api_app
from backend.backups import BackupManager
from backend.config import (
    AIConfig,
    AnalyticsConfig,
    BackupConfig,
    GoogleOAuthConfig,
    MonitoringConfig,
    ROOT_DIR,
    SchedulerConfig,
    Settings,
    TelegramAuthConfig,
    load_settings,
)
from backend.main import create_app
from databases.migrations_status import get_migration_status
from databases.sqlite.store import Database


def test_alembic_upgrade_downgrade_and_status(tmp_path: Path) -> None:
    db_file = tmp_path / "alembic_test.db"
    alembic_bin = ROOT_DIR / ".venv" / "bin" / "alembic"
    assert alembic_bin.is_file(), "alembic CLI должен быть установлен в .venv"

    db_url = f"sqlite:///{db_file.as_posix()}"

    r_up = subprocess.run(
        [str(alembic_bin), "-x", f"url={db_url}", "upgrade", "head"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_up.returncode == 0, r_up.stderr

    settings = Settings(db_path=db_file, db_mode="sqlite")
    st_head = get_migration_status(settings)
    assert st_head["configured"] is True
    assert st_head["dialect"] == "sqlite"
    assert st_head["headRevision"] == "20261126_0015"
    assert st_head["currentRevision"] == "20261126_0015"
    assert st_head["upToDate"] is True
    assert st_head["revisionsCount"] >= 15

    conn = sqlite3.connect(str(db_file))
    try:
        idx_names = {
            r[0]
            for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()
        }
        assert "idx_admin_lesson_requests_escrow_status" in idx_names
        assert "idx_admin_lesson_requests_student_created" in idx_names
        assert "idx_admin_lesson_requests_tutor_status_created" in idx_names
        assert "idx_sessions_expires" in idx_names
        assert "idx_oauth_states_expires" in idx_names
        assert "idx_telegram_link_tokens_expires" in idx_names
        assert "idx_realtime_notifications_created" in idx_names
        assert "idx_admin_payout_requests_status_created" in idx_names
        assert "idx_media_assets_user_kind" in idx_names
        assert "idx_tutor_verifications_status_created" in idx_names
        assert "idx_payment_intents_user_created" in idx_names
        assert "idx_npd_receipts_tutor_created" in idx_names
        assert "idx_tutor_applications_status_created" in idx_names
        assert "idx_rate_limit_hits_key_created" in idx_names
        assert "idx_phone_otp_codes_expires" in idx_names
        assert "idx_feedback_tickets_status_created" in idx_names
        assert "idx_feedback_attachments_ticket" in idx_names
        assert "idx_payment_refunds_status_created" in idx_names
        assert "idx_chat_messages_thread_created" in idx_names
        assert "idx_chat_msg_attachments_message" in idx_names
        oauth_cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(oauth_states)").fetchall()}
        assert {"role", "next_url", "link_user_id"} <= oauth_cols
        tutor_cols = {str(r[1]) for r in conn.execute("PRAGMA table_info(admin_tutors)").fetchall()}
        assert "slots_json" in tutor_cols
        # Проверяем, что channel='sms' разрешён после миграции 20261123_0009
        conn.execute(
            """
            INSERT INTO phone_otp_codes (
                phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
            ) VALUES ('79140000001', 'h', 'sms', 'login', 1, 0, 1.0, 9999999999.0)
            """
        )
        conn.commit()
    finally:
        conn.close()

    r_down = subprocess.run(
        [str(alembic_bin), "-x", f"url={db_url}", "downgrade", "-1"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_down.returncode == 0, r_down.stderr
    assert get_migration_status(settings)["currentRevision"] == "20261126_0014"
    assert get_migration_status(settings)["upToDate"] is False

    conn_down_15 = sqlite3.connect(str(db_file))
    try:
        oauth_cols_down = {str(r[1]) for r in conn_down_15.execute("PRAGMA table_info(oauth_states)").fetchall()}
        assert "link_user_id" not in oauth_cols_down
    finally:
        conn_down_15.close()

    r_down2 = subprocess.run(
        [str(alembic_bin), "-x", f"url={db_url}", "downgrade", "-1"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_down2.returncode == 0, r_down2.stderr
    assert get_migration_status(settings)["currentRevision"] == "20261124_0013"

    conn_down = sqlite3.connect(str(db_file))
    try:
        idx_down = {
            r[0]
            for r in conn_down.execute("SELECT name FROM sqlite_master WHERE type='index'").fetchall()
        }
        for dropped_idx in (
            "idx_admin_lesson_requests_student_created",
            "idx_admin_lesson_requests_tutor_status_created",
            "idx_sessions_expires",
            "idx_oauth_states_expires",
            "idx_telegram_link_tokens_expires",
            "idx_realtime_notifications_created",
        ):
            assert dropped_idx not in idx_down
    finally:
        conn_down.close()

    r_reup = subprocess.run(
        [str(alembic_bin), "-x", f"url={db_url}", "upgrade", "head"],
        cwd=ROOT_DIR,
        capture_output=True,
        text=True,
        check=False,
    )
    assert r_reup.returncode == 0, r_reup.stderr
    assert get_migration_status(settings)["upToDate"] is True


def test_backup_manager_sqlite_gzip_sha256_retention_and_api(tmp_path: Path) -> None:
    db_file = tmp_path / "live_app.db"
    backup_dir = tmp_path / "backups"
    db = Database(db_file)
    user = db.create_user("backup_student", "StrongPass123", display_name="Бэкап Тест")
    db.close()

    # Создаём устаревший файл (> 14 дней), чтобы проверить ретенцию
    backup_dir.mkdir(parents=True, exist_ok=True)
    stale_dump = backup_dir / "vektor_sqlite_20000101T000000Z.db.gz"
    stale_sha = backup_dir / "vektor_sqlite_20000101T000000Z.db.gz.sha256"
    stale_dump.write_bytes(b"old-backup")
    stale_sha.write_text("old-sha\n", encoding="utf-8")
    old_ts = datetime(2020, 1, 1, tzinfo=timezone.utc).timestamp()
    os.utime(stale_dump, (old_ts, old_ts))
    os.utime(stale_sha, (old_ts, old_ts))

    settings = Settings(
        db_path=db_file,
        db_mode="sqlite",
        backup=BackupConfig(enabled=True, interval_hours=24, retention_days=14, backup_dir=backup_dir),
    )
    mgr = BackupManager(settings)
    assert mgr.should_run_scheduled() is True

    res = mgr.run_backup()
    assert res["ok"] is True
    assert res["prunedCount"] >= 1
    assert not stale_dump.exists()
    assert len(res["created"]) == 1

    created = res["created"][0]
    gz_path = Path(created["path"])
    sha_path = Path(f"{gz_path}.sha256")
    assert gz_path.is_file() and sha_path.is_file()

    expected_sha = hashlib.sha256(gz_path.read_bytes()).hexdigest()
    assert expected_sha == created["sha256"]
    assert sha_path.read_text(encoding="utf-8").startswith(expected_sha)

    # Распаковываем бэкап и проверяем целостность данных SQLite
    restored = tmp_path / "restored.db"
    with gzip.open(gz_path, "rb") as f_in:
        restored.write_bytes(f_in.read())
    rconn = sqlite3.connect(str(restored))
    try:
        row = rconn.execute("SELECT username FROM users WHERE id = ?", (user.id,)).fetchone()
        assert row is not None and row[0] == "backup_student"
    finally:
        rconn.close()

    assert mgr.should_run_scheduled() is False

    # Проверка ручного бэкапа через Admin API
    app = create_api_app(settings)
    with TestClient(app) as client:
        r_ops = client.get("/api/admin/ops")
        assert r_ops.status_code == 200
        assert r_ops.json()["backups"]["filesCount"] >= 1

        r_run = client.post("/api/admin/backups/run")
        assert r_run.status_code == 200
        b_json = r_run.json()
        assert b_json["ok"] is True
        assert b_json["backup"]["ok"] is True
        assert len(b_json["backup"]["created"]) == 1


def test_5xx_monitoring_tg_sentry_scrubbing_and_cooldown(tmp_path: Path) -> None:
    sent_tg: list[dict] = []
    sent_sentry: list[tuple[dict, dict]] = []

    def _mock_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        body = json.loads(request.content.decode("utf-8"))
        if "api.telegram.org" in url:
            sent_tg.append(body)
            return httpx.Response(200, json={"ok": True, "result": {"message_id": 101}})
        if "sentry.example.ru/api/42/store/" in url:
            sent_sentry.append((dict(request.headers), body))
            return httpx.Response(200, json={"id": body.get("event_id")})
        return httpx.Response(404)

    settings = Settings(
        db_path=tmp_path / "mon.db",
        env="production",
        dev_demo_mode=False,
        admin_require_auth=True,
        admin_api_token="adm-tok-123",
        telegram=TelegramAuthConfig(bot_username="vektor_bot", bot_token="123:ABC", admin_chat_id="-100777888"),
        monitoring=MonitoringConfig(
            alert_5xx_enabled=True,
            alert_cooldown_sec=300,
            sentry_dsn="https://pub999@sentry.example.ru/42",
        ),
        scheduler=SchedulerConfig(enabled=False),
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )
    app = create_api_app(settings)

    @app.get("/api/test-boom")
    async def boom_route() -> dict:
        raise RuntimeError("Crash for student@example.com +79141234567")

    with TestClient(app) as client:
        # Подменяем AsyncClient на mock-транспорт
        client.portal.call(app.state.http.aclose)
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(_mock_handler))

        r1 = client.get(
            "/api/test-boom?secret=super_secret_val&token=abc",
            headers={"Cookie": "pvm_session=very_secret_cookie"},
        )
        assert r1.status_code == 500
        j1 = r1.json()
        assert j1["code"] == "internal_error"
        assert j1["incidentId"].startswith("inc-")
        assert r1.headers.get("x-content-type-options") == "nosniff"

        # Проверяем дедупликацию при повторном одинаковом падении в пределах cooldown
        r2 = client.get("/api/test-boom?secret=other_val")
        assert r2.status_code == 500

        assert len(sent_tg) == 1
        tg_txt = sent_tg[0]["text"]
        assert "student@example.com" not in tg_txt
        assert "+79141234567" not in tg_txt
        assert "super_secret_val" not in tg_txt
        assert "[email]" in tg_txt
        assert "[phone]" in tg_txt
        assert "secret" in tg_txt

        assert len(sent_sentry) == 1
        s_hdrs, s_body = sent_sentry[0]
        assert "sentry_key=pub999" in s_hdrs.get("x-sentry-auth", "")
        s_dump = json.dumps(s_body)
        assert "student@example.com" not in s_dump
        assert "+79141234567" not in s_dump
        assert "super_secret_val" not in s_dump
        assert "very_secret_cookie" not in s_dump
        assert s_body["request"]["query_keys"] == ["secret", "token"]

        r_ops = client.get("/api/admin/ops", headers={"X-Admin-Token": "adm-tok-123"})
        assert r_ops.status_code == 200
        mon = r_ops.json()["monitoring"]
        assert mon["total5xx"] == 2
        assert mon["alertsSent"] == 1
        assert mon["alertsSuppressed"] == 1
        assert len(mon["recentErrors"]) == 2

        r_test = client.post("/api/admin/monitoring/test-alert", headers={"X-Admin-Token": "adm-tok-123"})
        assert r_test.status_code == 200
        tjson = r_test.json()
        assert tjson["telegramSent"] is True
        assert tjson["sentrySent"] is True


def test_yandex_metrika_host_injection_and_dynamic_csp(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("YANDEX_METRIKA_ID", "not-digits<script>")
    bad_loaded = load_settings()
    assert bad_loaded.analytics.enabled is False
    assert bad_loaded.analytics.yandex_metrika_id is None

    # Без счётчика ни ymId, ни mc.yandex.ru в CSP не отдаются
    app_off = create_app(Settings(db_path=tmp_path / "ym_off.db", scheduler=SchedulerConfig(enabled=False)))
    with TestClient(app_off) as c_off:
        r_off = c_off.get("/landing")
        assert r_off.status_code == 200
        assert "ymId" not in r_off.text
        assert "mc.yandex.ru" not in (r_off.headers.get("content-security-policy") or "")

    # С числовым счётчиком отдаётся только конфиг EGE_HOST.ymId (без прямой загрузки tag.js) и расширенный CSP
    app_on = create_app(
        Settings(
            db_path=tmp_path / "ym_on.db",
            analytics=AnalyticsConfig(yandex_metrika_id="98765432", yandex_metrika_webvisor=True),
            scheduler=SchedulerConfig(enabled=False),
        )
    )
    with TestClient(app_on) as c_on:
        for route in ("/landing", "/fees"):
            r_on = c_on.get(route)
            assert r_on.status_code == 200
            assert '"ymId":"98765432"' in r_on.text
            assert '"ymWebvisor":true' in r_on.text
            assert "https://mc.yandex.ru/metrika/tag.js" not in r_on.text
            csp = r_on.headers.get("content-security-policy") or ""
            assert "https://mc.yandex.ru" in csp
            assert "wss://mc.yandex.ru" in csp


def test_compose_pg_backup_sidecar_and_loop_script() -> None:
    compose = yaml.safe_load((ROOT_DIR / "docker-compose.yml").read_text(encoding="utf-8"))
    services = compose["services"]
    assert "pg-backup" in services
    pgb = services["pg-backup"]
    assert pgb["image"] == "postgres:17-alpine"
    assert "ports" not in pgb
    assert pgb["networks"] == ["backend_internal"]
    assert "pg_backups" in compose["volumes"]

    loop_sh = ROOT_DIR / "deploy/scripts/pg_backup_loop.sh"
    assert loop_sh.is_file()
    r_sh = subprocess.run(["sh", "-n", str(loop_sh)], capture_output=True, text=True, check=False)
    assert r_sh.returncode == 0, r_sh.stderr

    docker_bin = shutil.which("docker")
    if docker_bin:
        r_cfg = subprocess.run(
            [docker_bin, "compose", "--env-file", ".env.prod.example", "config", "--quiet"],
            cwd=ROOT_DIR,
            capture_output=True,
            text=True,
            check=False,
        )
        assert r_cfg.returncode == 0, r_cfg.stderr


def test_p2_encrypted_backup_s3_upload_and_decrypt_roundtrip(tmp_path: Path) -> None:
    from backend.backups import decrypt_file_aes256

    db_file = tmp_path / "enc_src.db"
    backup_dir = tmp_path / "enc_backups"
    db = Database(db_file)
    user = db.create_user("enc_student", "StrongPass123", display_name="Шифр Тест")
    db.close()

    s3_puts: dict[str, tuple[bytes, dict[str, str]]] = {}

    def _s3_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "PUT":
            s3_puts[request.url.path] = (bytes(request.content), dict(request.headers))
            return httpx.Response(200)
        return httpx.Response(404)

    transport = httpx.MockTransport(_s3_handler)

    # 1) s3_require_encryption=True без BACKUP_ENCRYPTION_KEY блокирует незашифрованную выгрузку в S3
    settings_no_key = Settings(
        db_path=db_file,
        db_mode="sqlite",
        backup=BackupConfig(
            enabled=True,
            backup_dir=backup_dir / "plain",
            s3_bucket="vektor-backups",
            s3_prefix="db-prod",
            s3_endpoint_url="https://s3.ru-1.storage.selcloud.ru",
            s3_region="ru-1",
            s3_access_key_id="ak_bak",
            s3_secret_access_key="sk_bak",
            s3_require_encryption=True,
        ),
    )
    mgr_no_key = BackupManager(settings_no_key, s3_transport=transport)
    res_fail = mgr_no_key.run_backup()
    assert res_fail["ok"] is False
    assert res_fail["s3UploadedCount"] == 0
    assert any("backup_encryption_key_required" in err for err in res_fail["errors"])
    assert not s3_puts

    # 2) С ключом шифрования создаётся .db.gz.enc + .sha256 и оба файла загружаются в S3 с SigV4
    secret_key = "test-backup-secret-2026-strong"
    settings_enc = Settings(
        db_path=db_file,
        db_mode="sqlite",
        backup=BackupConfig(
            enabled=True,
            backup_dir=backup_dir / "enc",
            encryption_key=secret_key,
            s3_bucket="vektor-backups",
            s3_prefix="db-prod",
            s3_endpoint_url="https://s3.ru-1.storage.selcloud.ru",
            s3_region="ru-1",
            s3_access_key_id="ak_bak",
            s3_secret_access_key="sk_bak",
            s3_require_encryption=True,
        ),
    )
    mgr_enc = BackupManager(settings_enc, s3_transport=transport)
    res_ok = mgr_enc.run_backup()
    assert res_ok["ok"] is True, res_ok
    assert res_ok["s3UploadedCount"] == 1
    item = res_ok["created"][0]
    assert item["encrypted"] is True
    assert item["file"].endswith(".db.gz.enc")
    assert item["s3Uploaded"] is True
    assert item["s3Bucket"] == "vektor-backups"
    assert item["s3Key"].startswith("db-prod/vektor_sqlite_") and item["s3Key"].endswith(".db.gz.enc")

    enc_path = Path(item["path"])
    assert enc_path.is_file()
    enc_bytes = enc_path.read_bytes()
    assert enc_bytes.startswith(b"Salted__")
    assert b"SQLite format 3" not in enc_bytes

    s3_art_path = f"/vektor-backups/{item['s3Key']}"
    s3_sha_path = f"/vektor-backups/{item['s3ShaKey']}"
    assert s3_art_path in s3_puts and s3_sha_path in s3_puts
    assert s3_puts[s3_art_path][0] == enc_bytes
    assert "AWS4-HMAC-SHA256" in s3_puts[s3_art_path][1].get("authorization", "")

    # Проверяем полный round-trip: decrypt -> gunzip -> SELECT из SQLite
    dec_gz = tmp_path / "decrypted.db.gz"
    restored_db = tmp_path / "decrypted.db"
    decrypt_file_aes256(enc_path, dec_gz, secret_key)
    with gzip.open(dec_gz, "rb") as f_in:
        restored_db.write_bytes(f_in.read())
    rconn = sqlite3.connect(str(restored_db))
    try:
        row = rconn.execute("SELECT username FROM users WHERE id = ?", (user.id,)).fetchone()
        assert row is not None and row[0] == "enc_student"
    finally:
        rconn.close()

    st = mgr_enc.status()
    assert st["encryptionEnabled"] is True
    assert st["s3Configured"] is True
    assert st["s3UploadsTotal"] == 1


def test_p2_request_id_json_logs_and_prometheus_metrics(
    tmp_path: Path, caplog: pytest.LogCaptureFixture
) -> None:
    import logging

    from backend.observability import JsonLogFormatter

    # 1) JsonLogFormatter формирует валидный JSON с request_id и структурными полями
    formatter = JsonLogFormatter()
    rec = logging.LogRecord(
        name="vektor.http",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="GET /api/tutors -> 200",
        args=(),
        exc_info=None,
    )
    rec.request_id = "trace-abc-123"
    rec.method = "GET"
    rec.status = 200
    rec.duration_ms = 12.34
    parsed_log = json.loads(formatter.format(rec))
    assert parsed_log["request_id"] == "trace-abc-123"
    assert parsed_log["method"] == "GET"
    assert parsed_log["status"] == 200
    assert parsed_log["duration_ms"] == 12.34

    # 2) X-Request-ID прокидывается/генерируется, access-лог пишется, /metrics отдаёт Prometheus 0.0.4
    app_dev = create_api_app(
        Settings(
            db_path=tmp_path / "obs_dev.db",
            monitoring=MonitoringConfig(json_logs=True, log_level="INFO", metrics_enabled=True),
            scheduler=SchedulerConfig(enabled=False),
        )
    )
    with TestClient(app_dev) as c_dev:
        with caplog.at_level(logging.INFO, logger="vektor.http"):
            r1 = c_dev.get("/api/tutors", headers={"X-Request-ID": "client-trace-42"})
            assert r1.status_code == 200
            assert r1.headers.get("x-request-id") == "client-trace-42"

            r2 = c_dev.get("/api/tutors", headers={"X-Request-ID": "bad\nvalue with spaces"})
            assert r2.status_code == 200
            gen_id = r2.headers.get("x-request-id") or ""
            assert gen_id.startswith("req-") and len(gen_id) > 8

        http_records = [r for r in caplog.records if r.name == "vektor.http"]
        assert any(getattr(r, "request_id", None) == "client-trace-42" for r in http_records)

        r_met = c_dev.get("/metrics")
        assert r_met.status_code == 200
        assert "text/plain" in (r_met.headers.get("content-type") or "")
        body = r_met.text
        assert "vektor_http_requests_total{" in body
        assert 'route="/api/tutors"' in body
        assert "vektor_http_request_duration_seconds_bucket{" in body
        assert "vektor_http_requests_in_flight" in body
        assert "vektor_scheduler_ticks_total" in body
        assert "vektor_realtime_subscribers" in body

    # 3) В prod /metrics защищён METRICS_TOKEN или админ-авторизацией
    app_prod = create_api_app(
        Settings(
            db_path=tmp_path / "obs_prod.db",
            env="production",
            dev_demo_mode=False,
            admin_require_auth=True,
            admin_api_token="adm-tok-999",
            monitoring=MonitoringConfig(metrics_enabled=True, metrics_token="prom-secret-77"),
            scheduler=SchedulerConfig(enabled=False),
        )
    )
    with TestClient(app_prod) as c_prod:
        assert c_prod.get("/metrics").status_code == 403
        assert c_prod.get("/metrics", headers={"Authorization": "Bearer wrong"}).status_code == 403
        assert c_prod.get("/metrics", headers={"Authorization": "Bearer prom-secret-77"}).status_code == 200
        assert c_prod.get("/metrics", headers={"X-Metrics-Token": "prom-secret-77"}).status_code == 200


def test_p2_scheduler_pg_advisory_lock_prevents_duplicate_worker_runs(tmp_path: Path) -> None:
    import asyncio
    from contextlib import contextmanager

    from backend.scheduler import BackgroundScheduler
    from databases.postgres.schema import PgSchemaMixin

    # 1) Проверяем SQL вызовы pg_try_advisory_lock / pg_advisory_unlock на PgSchemaMixin
    sql_calls: list[tuple[str, tuple]] = []

    class _FakeConn:
        def __init__(self, lock_res: bool) -> None:
            self.autocommit = False
            self._lock_res = lock_res

        def __enter__(self):
            return self

        def __exit__(self, *_a):
            return False

        def execute(self, sql: str, params: tuple = ()):
            sql_calls.append((sql, params))

            class _R:
                def __init__(self, val: bool) -> None:
                    self._val = val

                def fetchone(self):
                    return {"locked": self._val}

            return _R(self._lock_res)

    class _FakePool:
        def __init__(self, lock_res: bool) -> None:
            self._lock_res = lock_res

        def connection(self):
            return _FakeConn(self._lock_res)

    class _FakePg(PgSchemaMixin):
        def __init__(self, lock_res: bool) -> None:
            self._pool = _FakePool(lock_res)

    with _FakePg(True).advisory_lock(12345) as acq1:
        assert acq1 is True
    assert ("SELECT pg_try_advisory_lock(%s) AS locked", (12345,)) in sql_calls
    assert ("SELECT pg_advisory_unlock(%s)", (12345,)) in sql_calls

    sql_calls.clear()
    with _FakePg(False).advisory_lock(999) as acq2:
        assert acq2 is False
    assert ("SELECT pg_try_advisory_lock(%s) AS locked", (999,)) in sql_calls
    assert all("pg_advisory_unlock" not in q for q, _ in sql_calls)

    # 2) BackgroundScheduler пропускает цикл, если другой воркер уже держит advisory lock
    class _LockedDb:
        def __init__(self) -> None:
            self.list_called = 0

        @contextmanager
        def advisory_lock(self, _key: int):
            yield False

        def list_scheduler_bookings(self, **_kw):
            self.list_called += 1
            return []

    locked_db = _LockedDb()
    sched = BackgroundScheduler(
        settings=Settings(db_path=tmp_path / "adv.db", scheduler=SchedulerConfig(advisory_lock_enabled=True)),
        db=locked_db,
    )
    res_skip = asyncio.run(sched.run_once())
    assert res_skip["ok"] is True
    assert res_skip["skipped"] is True
    assert res_skip["reason"] == "advisory_lock_held"
    assert locked_db.list_called == 0
    assert sched.status()["totals"]["lockSkipped"] == 1
    assert sched.status()["distributedLock"] == "pg_advisory"


def test_p2_realtime_pg_listen_notify_cross_worker_fanout() -> None:
    import asyncio

    from backend.realtime import RealtimeBroker

    notified_wires: list[tuple[str, str]] = []
    stored_events: dict[int, dict] = {}
    seq = 0

    class _FakeNotifyDb:
        def record_realtime_event(self, **kw):
            nonlocal seq
            seq += 1
            evt = {
                "id": seq,
                "eventId": kw["event_id"],
                "channel": kw["channel"],
                "eventType": kw["event_type"],
                "title": kw["title"],
                "message": kw["message"],
                "tutorSlug": kw["tutor_slug"],
                "payload": kw["payload"],
                "createdAt": "2026-11-26T00:00:00Z",
            }
            stored_events[seq] = evt
            return evt

        def notify_realtime_event(self, pg_channel: str, payload_json: str) -> None:
            notified_wires.append((pg_channel, payload_json))

        def get_realtime_event(self, event_row_id: int):
            return stored_events.get(int(event_row_id))

    db = _FakeNotifyDb()
    worker_a = RealtimeBroker(worker_id="wrk-a")
    worker_b = RealtimeBroker(worker_id="wrk-b")

    async def _run_fanout() -> None:
        sub_id, queue_b = worker_b.subscribe(channel="all")
        try:
            # 1) Обычное событие с worker_a уходит в PG NOTIFY и доставляется в worker_b, но игнорируется worker_a
            evt1 = worker_a.publish(
                db,
                channel="tutor",
                event_type="market.bid.created",
                title="Новая ставка",
                message="Математика",
                tutor_slug="tut-1",
                payload={"bookingId": "req-1"},
            )
            assert len(notified_wires) == 1
            pg_ch, wire1 = notified_wires[-1]
            assert pg_ch == "vektor_realtime_events"
            assert worker_a.handle_pg_notification(wire1, db=db) is False
            assert worker_b.handle_pg_notification(wire1, db=db) is True

            got1 = await asyncio.wait_for(queue_b.get(), timeout=1.0)
            assert got1["eventId"] == evt1["eventId"]
            assert got1["title"] == "Новая ставка"

            # 2) Крупный payload (>7500 Б) уходит в компактном формате {workerId, eventId} и гидратируется через db.get_realtime_event
            big_blob = "X" * 8000
            evt2 = worker_a.publish(
                db,
                channel="tutor",
                event_type="notice",
                title="Большое событие",
                message="short",
                tutor_slug="tut-1",
                payload={"blob": big_blob},
            )
            _, wire2 = notified_wires[-1]
            parsed_wire2 = json.loads(wire2)
            assert "event" not in parsed_wire2 and parsed_wire2["eventId"] == evt2["id"]
            assert worker_b.handle_pg_notification(wire2, db=db) is True
            got2 = await asyncio.wait_for(queue_b.get(), timeout=1.0)
            assert got2["eventId"] == evt2["eventId"]
            assert got2["payload"]["blob"] == big_blob
        finally:
            worker_b.unsubscribe(sub_id)

    asyncio.run(_run_fanout())
    assert worker_a.status()["pgNotificationsSent"] == 2
    assert worker_b.status()["pgNotificationsReceived"] == 2
