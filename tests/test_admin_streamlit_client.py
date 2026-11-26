"""Тесты клиента Streamlit-админки (admin_streamlit/api_client.py) поверх FastAPI TestClient."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
import httpx
import pytest

from admin_streamlit.api_client import AdminApiClient, AdminApiError
from admin_streamlit.ui_helpers import (
    CHANNEL_LABELS,
    fmt_dt,
    fmt_rub,
    prepare_channel_rows,
    prepare_gmv_rows,
    selected_row_idx,
)
from backend.api import create_api_app
from backend.config import AIConfig, GoogleOAuthConfig, Settings


class _TestClientTransport(httpx.BaseTransport):
    """Адаптер httpx.BaseTransport -> Starlette/FastAPI TestClient без поднятия сокета."""

    def __init__(self, tc: TestClient) -> None:
        self._tc = tc

    def handle_request(self, request: httpx.Request) -> httpx.Response:
        body = request.read()
        path = request.url.raw_path.decode("ascii")
        req_headers = {k: v for k, v in request.headers.items() if k.lower() not in {"host", "content-length"}}
        resp = self._tc.request(
            method=request.method,
            url=path,
            content=body,
            headers=req_headers,
            follow_redirects=False,
        )
        return httpx.Response(
            status_code=resp.status_code,
            headers=list(resp.headers.multi_items()),
            content=resp.content,
            request=request,
        )


def _make_settings(tmp_path: Path, name: str, *, admin_token: str = "") -> Settings:
    return Settings(
        db_path=tmp_path / name,
        admin_api_token=admin_token,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )


def test_streamlit_admin_client_full_workflow(tmp_path: Path) -> None:
    secret = "st-panel-secret-2027"
    app = create_api_app(_make_settings(tmp_path, "st_admin_full.db", admin_token=secret))

    with TestClient(app) as stu_tc, TestClient(app) as api_tc:
        # 1. Токен-защита и проверка ping
        with AdminApiClient("http://testserver", transport=_TestClientTransport(api_tc)) as bad_cli:
            with pytest.raises(AdminApiError) as exc_401:
                bad_cli.ping()
            assert exc_401.value.status_code == 401

        with AdminApiClient("http://testserver", admin_token="wrong", transport=_TestClientTransport(api_tc)) as wrong_cli:
            with pytest.raises(AdminApiError) as exc_403:
                wrong_cli.ping()
            assert exc_403.value.status_code == 403
            assert exc_403.value.code == "invalid_admin_token"

        # 2. Ученик создаёт бронь и открывает спор, чтобы проверить полный цикл в админке
        assert stu_tc.post("/api/auth/register", json={"username": "st_stu", "password": "secret123"}).status_code == 200
        assert stu_tc.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        r_bk = stu_tc.post("/api/bookings", json={"tutorId": "tut-ykt-bio-1", "offerPrice": 1200, "hour": "18:00"})
        assert r_bk.status_code == 200
        bk_id = r_bk.json()["booking"]["id"]
        assert stu_tc.post(f"/api/bookings/{bk_id}/accept", json={}).status_code == 200
        r_dsp = stu_tc.post(
            f"/api/bookings/{bk_id}/dispute",
            json={"reason": "first_lesson_guarantee", "comment": "Методика не подошла", "firstLessonGuarantee": True},
        )
        assert r_dsp.status_code == 200
        dsp_id = r_dsp.json()["dispute"]["id"]

        # 3. Полный проход админа через AdminApiClient с X-Admin-Token
        with AdminApiClient("http://testserver", admin_token=secret, transport=_TestClientTransport(api_tc)) as cli:
            assert cli.ping() == {"ok": True, "authMode": "token"}

            arch = cli.architecture()
            assert arch["ok"] is True and len(arch["layers"]) >= 5

            over = cli.overview()
            assert over["kpi"]["openDisputesCount"] >= 1
            assert over["kpi"]["tutorsCount"] >= 6

            users = cli.users()
            stu_row = next(u for u in users if u["username"] == "st_stu")
            role_res = cli.set_user_role(int(stu_row["id"]), "tutor")
            assert role_res["user"]["role"] == "tutor"

            tutors = cli.tutors()
            t_id = tutors[0]["id"]
            mod_res = cli.moderate_tutor(t_id, verified=True, bumped=True, tariff_id="month10k")
            assert mod_res["tutor"]["verified"] is True
            assert mod_res["tutor"]["tariffId"] == "month10k"

            reqs = cli.requests()
            assert any(r["id"] == bk_id for r in reqs)
            req_res = cli.set_request_status("req-1006", "accepted")
            assert req_res["request"]["status"] == "accepted"

            disputes = cli.disputes()
            assert any(d["id"] == dsp_id and d["status"] == "open" for d in disputes)
            ref_res = cli.resolve_dispute(dsp_id, "refund", resolution_note="Одобрено в Streamlit")
            assert ref_res["dispute"]["status"] == "refunded"
            assert ref_res["refundedRub"] == 1200

            payouts = cli.payouts()
            p_id = payouts[0]["id"]
            pay_res = cli.set_payout_status(p_id, "succeeded")
            assert pay_res["payout"]["status"] == "succeeded"

            events = cli.outbox()
            assert any(ev["eventType"] == "payments.dispute.refunded" for ev in events)

            tg_st = cli.telegram_status()
            assert tg_st["ok"] is True
            assert "botApiEnabled" in tg_st

            sch_st = cli.scheduler_status()
            assert sch_st["ok"] is True
            assert "intervalSec" in sch_st
            sch_run = cli.run_scheduler()
            assert sch_run["ok"] is True
            assert sch_run["scheduler"]["ticksTotal"] >= 1

            ops_res = cli.ops_status()
            assert ops_res["ok"] is True
            assert "migrations" in ops_res and "backups" in ops_res and "monitoring" in ops_res and "analytics" in ops_res

            bkp_res = cli.run_backup()
            assert bkp_res["ok"] is True and bkp_res["backup"]["ok"] is True

            alert_res = cli.send_test_alert()
            assert alert_res["ok"] is True and alert_res["incidentId"].startswith("test-")

            # 4. Обратная связь с вложением -> просмотр файла и смена статуса в Streamlit
            png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + b"\x00" * 32
            r_fb = stu_tc.post(
                "/api/feedback",
                data={
                    "kind": "bug",
                    "subject": "Баг в личном кабинете",
                    "message": "Тестовое обращение из Streamlit-клиента",
                    "contact": "@st_stu",
                },
                files=[("files", ("bug.png", png_bytes, "image/png"))],
            )
            assert r_fb.status_code == 200
            fb_id = r_fb.json()["ticket"]["id"]
            fb_aid = r_fb.json()["ticket"]["attachments"][0]["assetId"]

            assert cli.overview()["kpi"]["newFeedbackCount"] >= 1
            fb_list = cli.feedback()
            assert any(t["id"] == fb_id and t["attachmentsCount"] == 1 for t in fb_list)
            raw_fb_file, mime_fb = cli.feedback_file_bytes(fb_id, fb_aid)
            assert raw_fb_file == png_bytes and mime_fb == "image/png"
            rev_fb = cli.review_feedback(fb_id, "resolved", "Проверено в Streamlit")
            assert rev_fb["ticket"]["status"] == "resolved"
            assert rev_fb["ticket"]["reviewNote"] == "Проверено в Streamlit"

            # 5. Заявка ученика на возврат остатка баланса -> очередь в Streamlit -> проведение / отклонение
            r_wref = stu_tc.post("/api/payments/refunds", json={"amount": 500, "reason": "Возврат остатка в тесте"})
            assert r_wref.status_code == 200
            wref_id = r_wref.json()["refund"]["id"]
            assert cli.overview()["kpi"]["pendingRefundsCount"] >= 1
            assert any(r["id"] == wref_id and r["status"] == "requested" for r in cli.refunds())
            rej_res = cli.reject_refund(wref_id, "Отклонено для теста возврата на баланс")
            assert rej_res["refund"]["status"] == "rejected"
            assert rej_res["revertedNow"] is True

        # Кошелёк ученика получил 1 200 ₽ назад (800 + 1200 = 2000), а отклонённый возврат 500 ₽ вернулся назад (2000)
        assert stu_tc.get("/api/wallet").json()["wallet"]["balanceRub"] == 2000


def test_streamlit_ui_helpers_formatting_and_charts_data() -> None:
    assert fmt_rub(3500) == "3 500 ₽"
    assert fmt_rub(None) == "0 ₽"
    assert fmt_dt("2026-11-23T14:05:00Z") == "23.11.2026 14:05"
    assert fmt_dt("2026-11-12") == "12.11.2026"
    assert fmt_dt("") == "—"

    gmv_rows = prepare_gmv_rows(
        [{"date": "2026-11-12", "gmvRub": 1100, "feeRub": 55, "sbpFeeRub": 11, "payoutRub": 1034, "requests": 2, "accepted": 1}]
    )
    assert len(gmv_rows) == 1
    assert gmv_rows[0]["payoutRub"] + gmv_rows[0]["feeRub"] + gmv_rows[0]["sbpFeeRub"] == gmv_rows[0]["gmvRub"] == 1100
    assert gmv_rows[0]["label"] == "12.11"

    ch_rows = prepare_channel_rows(
        [{"channel": "doska_ykt", "count": 2, "sharePct": 25.0}, {"channel": "platform", "count": 3, "sharePct": 37.5}]
    )
    assert ch_rows[0]["Канал"] == CHANNEL_LABELS["platform"] == "Платформа"
    assert ch_rows[1]["Канал"] == "Доска Ykt"

    class _Sel:
        rows = [1]

    class _Ev:
        selection = _Sel()

    assert selected_row_idx(_Ev(), 3) == 1
    assert selected_row_idx(_Ev(), 1) == 0
    assert selected_row_idx(None, 5) == 0


def test_streamlit_admin_client_session_login_flow(tmp_path: Path) -> None:
    app = create_api_app(_make_settings(tmp_path, "st_admin_sess.db", admin_token="other-secret"))
    with TestClient(app) as tc:
        assert tc.post("/api/auth/register", json={"username": "adm_ui", "password": "secret123"}).status_code == 200
        adm_uid = tc.get("/api/me").json()["user"]["id"]
        app.state.db.admin_set_user_role(adm_uid, "admin")

    with TestClient(app) as api_tc:
        with AdminApiClient("http://testserver", transport=_TestClientTransport(api_tc)) as cli:
            cli.login_session("adm_ui", "secret123")
            assert cli.ping() == {"ok": True, "authMode": "session"}
            cli.logout_session()
            with pytest.raises(AdminApiError) as exc_after:
                cli.ping()
            assert exc_after.value.status_code == 401
