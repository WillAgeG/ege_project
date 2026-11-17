"""Тесты Admin API (/api/admin/*), SQLite / PG17 Dual-Write и изоляции Headless API."""

from __future__ import annotations

from pathlib import Path
import uuid

from fastapi.testclient import TestClient
import psycopg
from psycopg.rows import dict_row
import pytest

from backend.api import create_api_app
from backend.config import AIConfig, GoogleOAuthConfig, Settings
from backend.main import create_app
from databases.postgres.store import PostgresDatabase

PG_DSN = "postgresql://postgres@127.0.0.1:5432/vektor_ege"


def _pg_available() -> bool:
    try:
        with psycopg.connect(PG_DSN, connect_timeout=1) as conn:
            conn.execute("SELECT 1 FROM oltp.users LIMIT 1")
        return True
    except Exception:
        return False


def _sqlite_settings(tmp_path: Path, name: str = "admin_test.db") -> Settings:
    return Settings(
        db_path=tmp_path / name,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )


def test_headless_api_app_isolation_and_cors(tmp_path: Path) -> None:
    app = create_api_app(_sqlite_settings(tmp_path, "headless.db"))
    with TestClient(app) as client:
        r_health = client.get("/api/health")
        assert r_health.status_code == 200
        assert r_health.json() == {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": False, "provider": None},
        }

        r_over = client.get("/api/admin/overview", headers={"Origin": "http://127.0.0.1:8772"})
        assert r_over.status_code == 200
        assert r_over.json()["ok"] is True
        assert r_over.headers.get("access-control-allow-origin") == "http://127.0.0.1:8772"

        assert client.get("/openapi.json").status_code == 200
        assert client.get("/docs").status_code == 200

        # HTML-оболочка и статика в headless-приложении полностью отсутствуют
        assert client.get("/").status_code == 404
        assert client.get("/brandbook").status_code == 404
        assert client.get("/admin").status_code == 404
        assert client.get("/app.js").status_code == 404
        assert client.get("/ux-ui/styles/base.css").status_code == 404


def test_admin_api_sqlite_full_flow(tmp_path: Path) -> None:
    app = create_app(_sqlite_settings(tmp_path))
    with TestClient(app) as client:
        assert client.get("/admin").status_code == 200
        assert client.get("/api/health").json() == {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": False, "provider": None},
        }

        r_arch = client.get("/api/admin/architecture")
        assert r_arch.status_code == 200
        arch = r_arch.json()
        assert arch["ok"] is True
        layer_ids = {item["id"] for item in arch["layers"]}
        assert {"uiKit", "headlessApi", "spaShell", "postgres", "polars", "airflow", "grafana"} == layer_ids

        r_over = client.get("/api/admin/overview")
        assert r_over.status_code == 200
        over = r_over.json()
        assert over["ok"] is True
        assert over["storage"]["mode"] == "sqlite"
        assert over["kpi"]["tutorsCount"] == 6
        assert over["kpi"]["requestsCount"] == 6
        assert over["kpi"]["payoutsCount"] == 4
        assert over["kpi"]["gmvRub"] > 0
        assert over["kpi"]["feeRub"] > 0
        assert over["kpi"]["payoutRub"] > 0
        assert len(over["channelShare"]) >= 3
        assert len(over["dailySeries"]) >= 3

        # Регистрируем пользователя и меняем его роль через Admin API
        r_reg = client.post(
            "/api/auth/register",
            json={"username": "adm_target", "password": "secret123", "displayName": "Тимур"},
        )
        assert r_reg.status_code == 200
        uid = r_reg.json()["user"]["id"]

        r_users = client.get("/api/admin/users")
        assert r_users.status_code == 200
        assert any(u["id"] == uid and u["role"] == "student" for u in r_users.json()["users"])

        r_role = client.post(f"/api/admin/users/{uid}/role", json={"role": "admin"})
        assert r_role.status_code == 200
        assert r_role.json()["user"]["role"] == "admin"

        assert client.post(f"/api/admin/users/{uid}/role", json={"role": "superuser"}).status_code == 400
        assert client.post("/api/admin/users/999999/role", json={"role": "tutor"}).status_code == 404

        # Модерация преподавателя
        tutors = client.get("/api/admin/tutors").json()["tutors"]
        assert len(tutors) == 6
        target_tid = "tut-ykt-bio-2"
        r_mod = client.post(
            f"/api/admin/tutors/{target_tid}/moderate",
            json={"verified": True, "bumped": True, "tariffId": "trial5k"},
        )
        assert r_mod.status_code == 200
        mod_t = r_mod.json()["tutor"]
        assert mod_t["verified"] is True
        assert mod_t["bumpedToday"] is True
        assert mod_t["tariffId"] == "trial5k"
        assert client.post(
            f"/api/admin/tutors/{target_tid}/moderate",
            json={"tariffId": "vip999"},
        ).status_code == 400
        assert client.post("/api/admin/tutors/missing-tutor/moderate", json={"verified": True}).status_code == 404

        # Статусы заявок
        reqs = client.get("/api/admin/requests").json()["requests"]
        assert len(reqs) == 6
        r_req_upd = client.post("/api/admin/requests/req-1006/status", json={"status": "accepted"})
        assert r_req_upd.status_code == 200
        assert r_req_upd.json()["request"]["status"] == "accepted"
        r_req_ref = client.post("/api/admin/requests/req-1006/status", json={"status": "refunded"})
        assert r_req_ref.status_code == 200
        assert r_req_ref.json()["request"]["status"] == "refunded"
        assert client.post("/api/admin/requests/req-1006/status", json={"status": "invalid"}).status_code == 400
        assert client.post("/api/admin/requests/missing-req/status", json={"status": "accepted"}).status_code == 404

        # Статусы выплат
        payouts = client.get("/api/admin/payouts").json()["payouts"]
        assert len(payouts) == 4
        r_pay_ok = client.post("/api/admin/payouts/pay-3003/status", json={"status": "succeeded"})
        assert r_pay_ok.status_code == 200
        assert r_pay_ok.json()["payout"]["status"] == "succeeded"
        assert r_pay_ok.json()["payout"]["paidAt"] is not None
        r_pay_rej = client.post("/api/admin/payouts/pay-3003/status", json={"status": "rejected"})
        assert r_pay_rej.status_code == 200
        assert r_pay_rej.json()["payout"]["status"] == "rejected"
        assert client.post("/api/admin/payouts/pay-3003/status", json={"status": "bad"}).status_code == 400
        assert client.post("/api/admin/payouts/missing-pay/status", json={"status": "succeeded"}).status_code == 404

        # Outbox
        outbox = client.get("/api/admin/outbox").json()["events"]
        assert len(outbox) >= 6
        event_types = {ev["eventType"] for ev in outbox}
        assert "admin.user.role_updated" in event_types
        assert "admin.tutor.moderated" in event_types
        assert "admin.request.accepted" in event_types
        assert "admin.payout.succeeded" in event_types


def test_admin_api_pg17_dualwrite_and_outbox(tmp_path: Path) -> None:
    if not _pg_available():
        pytest.skip("PostgreSQL 17 (:5432/vektor_ege) not available in CI")
    suffix = uuid.uuid4().hex[:8]
    uname = f"adm_pg_{suffix}"

    PostgresDatabase(PG_DSN).close()
    with psycopg.connect(PG_DSN, row_factory=dict_row) as conn:
        max_outbox_id = int(conn.execute("SELECT COALESCE(MAX(id), 0) AS mx FROM outbox.kafka_outbox").fetchone()["mx"])
        orig_tutor = conn.execute(
            "SELECT verified, bumped_today, tariff_id, last_bumped_at, updated_at FROM oltp.tutors WHERE id = 'tut-ykt-bio-2'"
        ).fetchone()
        orig_req = conn.execute(
            "SELECT status, final_price_rub, updated_at FROM oltp.lesson_requests WHERE id = 'req-1010'"
        ).fetchone()
        orig_payout = conn.execute(
            "SELECT status, paid_at FROM oltp.payout_requests WHERE id = 'pay-3004'"
        ).fetchone()

    settings = Settings(
        db_path=tmp_path / "dual_admin.db",
        database_url=PG_DSN,
        db_mode="dual",
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )
    app = create_api_app(settings)
    try:
        with TestClient(app) as client:
            r_over = client.get("/api/admin/overview")
            assert r_over.status_code == 200
            over = r_over.json()
            assert over["storage"]["mode"] == "dual"
            assert over["storage"]["postgres"] == "ok"
            assert over["kpi"]["tutorsCount"] >= 6
            assert over["kpi"]["requestsCount"] >= 10
            assert over["kpi"]["payoutsCount"] >= 5

            # Регистрируем временного пользователя и меняем ему роль в PG
            r_reg = client.post("/api/auth/register", json={"username": uname, "password": "secret123"})
            assert r_reg.status_code == 200

            users = client.get("/api/admin/users").json()["users"]
            pg_user = next(u for u in users if u["username"] == uname)
            r_role = client.post(f"/api/admin/users/{pg_user['id']}/role", json={"role": "tutor"})
            assert r_role.status_code == 200
            assert r_role.json()["user"]["role"] == "tutor"

            # Модерация репетитора, заявки и выплаты в PG17 + outbox
            r_mod = client.post(
                "/api/admin/tutors/tut-ykt-bio-2/moderate",
                json={"verified": True, "bumped": True, "tariffId": "trial5k"},
            )
            assert r_mod.status_code == 200
            assert r_mod.json()["tutor"]["verified"] is True
            assert r_mod.json()["tutor"]["bumpedToday"] is True

            r_req = client.post("/api/admin/requests/req-1010/status", json={"status": "accepted"})
            assert r_req.status_code == 200
            assert r_req.json()["request"]["status"] == "accepted"

            r_pay = client.post("/api/admin/payouts/pay-3004/status", json={"status": "succeeded"})
            assert r_pay.status_code == 200
            assert r_pay.json()["payout"]["status"] == "succeeded"

            outbox = client.get("/api/admin/outbox", params={"limit": 20}).json()["events"]
            ev_types = {e["eventType"] for e in outbox}
            assert "admin.user.role_updated" in ev_types
            assert "admin.tutor.moderated" in ev_types
            assert "admin.request.accepted" in ev_types
            assert "admin.payout.succeeded" in ev_types
    finally:
        # Восстанавливаем исходное состояние PG17 и удаляем тестовые записи outbox / user
        with psycopg.connect(PG_DSN, row_factory=dict_row) as conn:
            with conn.transaction():
                conn.execute("DELETE FROM outbox.kafka_outbox WHERE id > %s", (max_outbox_id,))
                conn.execute("DELETE FROM oltp.users WHERE username_lower = %s", (uname.lower(),))
                if orig_tutor:
                    conn.execute(
                        """
                        UPDATE oltp.tutors
                        SET verified = %s, bumped_today = %s, tariff_id = %s,
                            last_bumped_at = %s, updated_at = %s
                        WHERE id = 'tut-ykt-bio-2'
                        """,
                        (
                            orig_tutor["verified"],
                            orig_tutor["bumped_today"],
                            orig_tutor["tariff_id"],
                            orig_tutor["last_bumped_at"],
                            orig_tutor["updated_at"],
                        ),
                    )
                if orig_req:
                    conn.execute(
                        """
                        UPDATE oltp.lesson_requests
                        SET status = %s, final_price_rub = %s, updated_at = %s
                        WHERE id = 'req-1010'
                        """,
                        (orig_req["status"], orig_req["final_price_rub"], orig_req["updated_at"]),
                    )
                if orig_payout:
                    conn.execute(
                        """
                        UPDATE oltp.payout_requests
                        SET status = %s, paid_at = %s
                        WHERE id = 'pay-3004'
                        """,
                        (orig_payout["status"], orig_payout["paid_at"]),
                    )
