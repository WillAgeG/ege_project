"""Тесты серверной отправки формы «Стать репетитором» (tutor-apply) и модерации в админке."""

from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient
import httpx

from admin_streamlit.api_client import AdminApiClient
from backend.config import Settings
from backend.main import create_app


class _TestClientTransport(httpx.BaseTransport):
    """Адаптер httpx.BaseTransport -> Starlette/FastAPI TestClient."""

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
        resp_headers = [
            (k, v)
            for k, v in resp.headers.multi_items()
            if k.lower() not in {"content-encoding", "content-length", "transfer-encoding"}
        ]
        return httpx.Response(
            status_code=resp.status_code,
            headers=resp_headers,
            content=resp.content,
            request=request,
        )


def test_public_tutor_application_validation_and_admin_review(tmp_path: Path) -> None:
    admin_secret = "adm-tapp-secret"
    app = create_app(
        Settings(
            db_path=tmp_path / "tapp.db",
            admin_api_token=admin_secret,
            admin_require_auth=True,
        )
    )

    with TestClient(app) as c_guest, TestClient(app) as c_user, TestClient(app) as c_adm:
        # Ошибки валидации короткого имени / контакта
        assert c_guest.post(
            "/api/tutor-applications",
            json={"name": "А", "subject": "bio", "rate": 1200, "contact": "+79142100199"},
        ).status_code == 422
        assert c_guest.post(
            "/api/tutor-applications",
            json={"name": "Анна Соколова", "subject": "bio", "rate": 1200, "contact": "ab"},
        ).status_code == 422

        # Гостевая отправка анкеты с /landing без авторизации -> 200
        r_guest = c_guest.post(
            "/api/tutor-applications",
            json={
                "name": "Мария Семенова",
                "subject": "bio",
                "subjectName": "Биология",
                "rate": 1400,
                "contact": "https://t.me/maria_bio_ege",
                "source": "landing",
            },
        )
        assert r_guest.status_code == 200
        app1 = r_guest.json()["application"]
        assert app1["name"] == "Мария Семенова"
        assert app1["status"] == "new"
        assert app1["userId"] is None
        assert app1["rate"] == 1400

        # Авторизованный пользователь -> привязывается userId
        assert c_user.post(
            "/api/auth/register",
            json={"username": "tutor_applicant", "password": "secret123", "displayName": "Иван П."},
        ).status_code == 200
        uid = c_user.get("/api/me").json()["user"]["id"]
        r_auth = c_user.post(
            "/api/tutor-applications",
            json={
                "name": "Иван Петров",
                "subject": "chem",
                "subjectName": "Химия",
                "rate": 1100,
                "contact": "+7 (914) 222-33-44",
            },
        )
        assert r_auth.status_code == 200
        app2 = r_auth.json()["application"]
        assert app2["userId"] == uid

        # Гость не может читать админские заявки
        assert c_guest.get("/api/admin/tutor-applications").status_code == 401

        # Проверка AdminApiClient (Streamlit)
        adm = AdminApiClient(
            base_url="http://testserver",
            admin_token=admin_secret,
            transport=_TestClientTransport(c_adm),
        )
        ov = adm.overview()
        assert ov["kpi"]["newTutorApplicationsCount"] == 2

        all_apps = adm.tutor_applications()
        assert len(all_apps) == 2

        # Перевод в работу -> затем одобрение с публикацией в каталог
        cnt_res = adm.review_tutor_application(app1["id"], "contacted", "Созвонились в Telegram")
        assert cnt_res["application"]["status"] == "contacted"

        pub_res = adm.review_tutor_application(
            app1["id"],
            "approved",
            "Отличный профиль",
            publish_to_catalog=True,
        )
        assert pub_res["application"]["status"] == "approved"
        created_tid = pub_res["application"]["createdTutorId"]
        assert created_tid.startswith("tut-app-")
        assert pub_res["tutor"]["telegramHandle"] == "@maria_bio_ege"
        assert any(t["id"] == created_tid for t in adm.tutors())

        # Повторное одобрение не дублирует анкету в каталоге
        cnt_before = len(adm.tutors())
        pub_again = adm.review_tutor_application(app1["id"], "approved", publish_to_catalog=True)
        assert pub_again["application"]["createdTutorId"] == created_tid
        assert len(adm.tutors()) == cnt_before

        # Отклонение второй заявки
        rej_res = adm.review_tutor_application(app2["id"], "rejected", "Не подходит формат")
        assert rej_res["application"]["status"] == "rejected"
        assert adm.overview()["kpi"]["newTutorApplicationsCount"] == 0

        # Outbox события в topic vektor.tutors.raw.v1
        outbox_evts = adm.outbox(limit=50)
        evt_types = {e["eventType"] for e in outbox_evts}
        assert "tutors.application.submitted" in evt_types
        assert "admin.tutor_application.approved" in evt_types
