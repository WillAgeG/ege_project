"""Тесты доменной логики БД и API маркетплейса: роли, профиль, кошелёк/леджер, эскроу, расписание, Телемост, лиды, выплаты и PG17 Dual-Write."""

from __future__ import annotations

from pathlib import Path
import sqlite3
import uuid

from fastapi.testclient import TestClient
import psycopg
from psycopg.rows import dict_row
import pytest

from backend.api import create_api_app
from backend.config import AIConfig, GoogleOAuthConfig, Settings
from backend.main import create_app

PG_DSN = "postgresql://postgres@127.0.0.1:5432/vektor_ege"


def _pg_available() -> bool:
    try:
        with psycopg.connect(PG_DSN, connect_timeout=1) as conn:
            conn.execute("SELECT 1 FROM oltp.users LIMIT 1")
        return True
    except Exception:
        return False


def _sqlite_settings(
    tmp_path: Path, name: str = "mkt_test.db", *, admin_require_auth: bool = False
) -> Settings:
    return Settings(
        db_path=tmp_path / name,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        admin_require_auth=admin_require_auth,
    )


def test_role_registration_and_profile_doc_sync(tmp_path: Path) -> None:
    db_path = tmp_path / "roles.db"
    app = create_app(_sqlite_settings(tmp_path, "roles.db"))
    with TestClient(app) as client:
        # Нельзя зарегистрироваться напрямую с ролью admin
        r_adm = client.post(
            "/api/auth/register",
            json={"username": "bad_admin", "password": "secret123", "role": "admin"},
        )
        assert r_adm.status_code == 400
        assert r_adm.json()["code"] == "invalid_role"

        # Допускаются роли student и tutor
        r_tut = client.post(
            "/api/auth/register",
            json={"username": "tutor_acc", "password": "secret123", "displayName": "Ольга", "role": "tutor"},
        )
        assert r_tut.status_code == 200
        assert r_tut.json()["user"]["role"] == "tutor"
        uid = r_tut.json()["user"]["id"]

        # Расширенный DOC_NAME_RE разрешает market и синхронизирует profile -> users
        assert client.put("/api/docs/market", json={"planId": "trial5k"}).status_code == 200
        assert client.patch(
            "/api/docs/profile",
            json={
                "name": "Ольга Иванова",
                "phone": "+7 (914) 210-05-11",
                "phoneCountry": "RU",
                "city": "Якутск",
                "grade": "Преподаватель",
                "goal": "Подготовка к ЕГЭ",
                "contactVerified": True,
                "photo": "data:image/jpeg;base64,/9j/4AAQ",
            },
        ).status_code == 200

        me = client.get("/api/me").json()["user"]
        assert me["displayName"] == "Ольга Иванова"
        assert me["avatarUrl"] == "data:image/jpeg;base64,/9j/4AAQ"

    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT display_name, phone, phone_country, city, grade, goal, contact_verified, avatar_url FROM users WHERE id = ?",
        (uid,),
    ).fetchone()
    conn.close()
    assert row["display_name"] == "Ольга Иванова"
    assert row["phone"] == "+7 (914) 210-05-11"
    assert row["phone_country"] == "RU"
    assert row["city"] == "Якутск"
    assert row["grade"] == "Преподаватель"
    assert row["goal"] == "Подготовка к ЕГЭ"
    assert int(row["contact_verified"]) == 1
    assert row["avatar_url"] == "data:image/jpeg;base64,/9j/4AAQ"


def test_wallet_topup_cards_and_pci_guard(tmp_path: Path) -> None:
    app = create_app(_sqlite_settings(tmp_path, "wallet.db"))
    with TestClient(app) as client:
        assert client.get("/api/wallet").status_code == 401
        assert client.post("/api/auth/register", json={"username": "stu_wal", "password": "secret123"}).status_code == 200

        # Первый платёж < 490 ₽ отклоняется (если не ai390)
        r_low = client.post("/api/wallet/topup", json={"amount": 300, "method": "sbp"})
        assert r_low.status_code == 400
        assert r_low.json()["code"] == "invalid_amount"

        # Передача PAN / CVC запрещена (PCI guard)
        r_pci = client.post(
            "/api/wallet/cards",
            json={"last4": "4419", "exp": "12/28", "brand": "МИР", "cardNum": "2200700482104419", "cvc": "123"},
        )
        assert r_pci.status_code == 400
        assert r_pci.json()["detail"]["code"] == "pci_forbidden"

        # Привязка безопасных метаданных карты + дедупликация
        r_c1 = client.post(
            "/api/wallet/cards",
            json={"last4": "4419", "exp": "12/28", "bin": "220070", "brand": "МИР", "bankName": "Т-Банк"},
        )
        assert r_c1.status_code == 200
        cid = r_c1.json()["card"]["id"]

        r_c1_dup = client.post(
            "/api/wallet/cards",
            json={"last4": "4419", "exp": "12/28", "bin": "220070", "brand": "МИР"},
        )
        assert r_c1_dup.status_code == 200
        assert len(r_c1_dup.json()["wallet"]["savedCards"]) == 1

        # Первое пополнение 500 ₽ по СБП (fee=0), затем повторное 100 ₽ картой (fee=3)
        r_top1 = client.post("/api/wallet/topup", json={"amount": 500, "method": "sbp"})
        assert r_top1.status_code == 200
        w1 = r_top1.json()["wallet"]
        assert w1["balanceRub"] == 500
        assert w1["initialPaid"] is True
        assert w1["ledger"][0]["feeRub"] == 0

        r_top2 = client.post("/api/wallet/topup", json={"amount": 100, "method": "card", "cardId": cid})
        assert r_top2.status_code == 200
        w2 = r_top2.json()["wallet"]
        assert w2["balanceRub"] == 600
        assert w2["ledger"][0]["feeRub"] == 3
        assert w2["ledger"][0]["method"] == "card"

        r_del = client.delete(f"/api/wallet/cards/{cid}")
        assert r_del.status_code == 200
        assert r_del.json()["removed"] is True
        assert r_del.json()["wallet"]["savedCards"] == []


def test_booking_escrow_schedule_telemost_and_double_cancel_guard(tmp_path: Path) -> None:
    app = create_app(_sqlite_settings(tmp_path, "bookings.db"))
    with TestClient(app) as client:
        assert client.post(
            "/api/auth/register",
            json={"username": "stu_bk", "password": "secret123", "displayName": "Иван"},
        ).status_code == 200

        # Недостаточно средств -> 402
        r_poor = client.post(
            "/api/bookings",
            json={"tutorId": "t-egor", "tutorName": "Егор Макаров", "offerPrice": 1400, "hour": "18:00", "dayIso": "2026-11-20"},
        )
        assert r_poor.status_code == 402
        assert r_poor.json()["code"] == "insufficient_balance"

        assert client.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200

        # Проверка граничной суммы 130 ₽ (5% half-away-from-zero: 6.5 -> 7, payout=123)
        r_edge = client.post(
            "/api/bookings",
            json={"tutorId": "t-egor", "tutorName": "Егор Макаров", "subjectName": "Python", "offerPrice": 130, "hour": "22:00", "dayIso": "2026-11-20"},
        )
        assert r_edge.status_code == 200
        edge_bk = r_edge.json()["booking"]
        assert edge_bk["fee"] == 7
        assert edge_bk["payout"] == 123
        assert r_edge.json()["wallet"]["balanceRub"] == 1870
        assert r_edge.json()["wallet"]["frozenRub"] == 130

        # Расписание: невалидный час 09:00 и пустые дни -> 400; валидное 1..7 дней и 23:00 -> 200
        assert client.patch(
            f"/api/bookings/{edge_bk['id']}/schedule",
            json={"schedulePlan": {"status": "confirmed", "dows": [1, 3], "hour": "09:00", "weekly": True}},
        ).status_code == 400
        assert client.patch(
            f"/api/bookings/{edge_bk['id']}/schedule",
            json={"schedulePlan": {"status": "confirmed", "dows": [], "hour": "23:00", "weekly": True}},
        ).status_code == 400
        r_sched = client.patch(
            f"/api/bookings/{edge_bk['id']}/schedule",
            json={"schedulePlan": {"status": "confirmed", "dows": [3, 5, 0], "hour": "23:00", "weekly": True}},
        )
        assert r_sched.status_code == 200
        sched_bk = r_sched.json()["booking"]
        assert sched_bk["hour"] == "23:00"
        assert sched_bk["dows"] == [3, 5, 0]
        assert sched_bk["schedulePlan"]["status"] == "confirmed"

        # Телемост: чужой домен -> 400, telemost.yandex.ru -> 200, очистка "" -> 200
        assert client.patch(
            f"/api/bookings/{edge_bk['id']}/telemost",
            json={"url": "https://evil.example.com/meet"},
        ).status_code == 400
        r_tm = client.patch(
            f"/api/bookings/{edge_bk['id']}/telemost",
            json={"url": "https://telemost.yandex.ru/j/99887766"},
        )
        assert r_tm.status_code == 200
        assert r_tm.json()["booking"]["telemostUrl"] == "https://telemost.yandex.ru/j/99887766"
        assert client.patch(f"/api/bookings/{edge_bk['id']}/telemost", json={"url": ""}).json()["booking"]["telemostUrl"] == ""

        # Отмена возвращает 130 ₽ ровно один раз; повторная отмена -> 409 invalid_transition
        r_cancel = client.post(f"/api/bookings/{edge_bk['id']}/cancel")
        assert r_cancel.status_code == 200
        assert r_cancel.json()["booking"]["status"] == "cancelled"
        assert r_cancel.json()["wallet"]["balanceRub"] == 2000
        assert r_cancel.json()["wallet"]["frozenRub"] == 0
        assert r_cancel.json()["wallet"]["ledger"][0]["kind"] == "escrow_refund"

        r_cancel_dup = client.post(f"/api/bookings/{edge_bk['id']}/cancel")
        assert r_cancel_dup.status_code == 409
        assert r_cancel_dup.json()["code"] == "invalid_transition"
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 2000


def test_tutor_profile_bump_cooldown_escrow_payout_leads_and_contacts(tmp_path: Path) -> None:
    app = create_api_app(_sqlite_settings(tmp_path, "tutor_flow.db"))
    with TestClient(app) as c_tut, TestClient(app) as c_stu:
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_pro", "password": "secret123", "displayName": "Саргылана", "role": "tutor"},
        ).status_code == 200
        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_lead", "password": "secret123", "displayName": "Айана"},
        ).status_code == 200

        # Репетитор заполняет анкету (со слотами до 23:00)
        r_prof = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Саргылана Петрова",
                "headline": "Эксперт ФИПИ 85+",
                "subject": "bio",
                "subjectName": "Биология",
                "subjects": ["bio", "chem"],
                "city": "Якутск",
                "timezone": "UTC+9",
                "price": 1200,
                "slots": {"3": ["16:00", "23:00"]},
            },
        )
        assert r_prof.status_code == 200
        tid = r_prof.json()["tutor"]["id"]

        # Поднятие анкеты и кулдаун 4 часа -> 429
        r_bump1 = c_tut.post("/api/tutor/bump")
        assert r_bump1.status_code == 200
        assert r_bump1.json()["tutor"]["bumpedToday"] is True
        r_bump2 = c_tut.post("/api/tutor/bump")
        assert r_bump2.status_code == 429
        assert r_bump2.json()["code"] == "bump_cooldown"

        # Ученик пополняет счёт и отправляет ставку репетитору
        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={"tutorId": tid, "offerPrice": 1000, "hour": "23:00", "dayIso": "2026-11-20"},
        )
        assert r_bk.status_code == 200
        bid = r_bk.json()["booking"]["id"]

        # Чужой (ученик) НЕ может подтвердить ставку реального репетитора -> 403
        assert c_stu.post(f"/api/bookings/{bid}/accept").status_code == 403

        # Репетитор делает контр-предложение 1100 ₽ -> ученик соглашается (дозаморозка +100 ₽) -> урок завершён
        r_cnt = c_tut.post(f"/api/bookings/{bid}/counter", json={"counterPrice": 1100})
        assert r_cnt.status_code == 200
        assert r_cnt.json()["booking"]["status"] == "countered"

        r_acc = c_stu.post(f"/api/bookings/{bid}/accept")
        assert r_acc.status_code == 200
        assert r_acc.json()["booking"]["status"] == "accepted"
        assert r_acc.json()["wallet"]["balanceRub"] == 900
        assert r_acc.json()["wallet"]["frozenRub"] == 1100

        # После accept доступно ещё 0 ₽ (деньги на эскроу)
        assert c_tut.get("/api/tutor/summary").json()["frozenNetRub"] == 1045
        assert c_tut.get("/api/tutor/summary").json()["availableRub"] == 0

        # Завершение урока переводит 1045 ₽ (95% от 1100) в доступный баланс репетитора
        r_comp = c_tut.post(f"/api/bookings/{bid}/complete")
        assert r_comp.status_code == 200
        assert r_comp.json()["booking"]["status"] == "completed"
        summary = c_tut.get("/api/tutor/summary").json()
        assert summary["earnedNetRub"] == 1045
        assert summary["availableRub"] == 1045

        # Вывод сверх остатка отклонён, в пределах остатка -> создан с маской и чеком НПД
        r_over = c_tut.post(
            "/api/tutor/payouts",
            json={"method": "sbp", "bank": "АЭБ", "phone": "+7 (914) 210-01-99", "amount": 1500},
        )
        assert r_over.status_code == 400
        assert r_over.json()["code"] == "insufficient_payout_balance"

        r_pay = c_tut.post(
            "/api/tutor/payouts",
            json={"method": "card", "bank": "Мир", "card": "2200 7004 8210 4419", "amount": 600, "npdReceipt": True},
        )
        assert r_pay.status_code == 200
        pay_data = r_pay.json()
        assert pay_data["payout"]["destinationMasked"] == "2200 70** **** 4419"
        assert str(pay_data["payout"]["npdReceipt"]).startswith("NPD-")
        assert pay_data["summary"]["availableRub"] == 445

        # Запросы учеников (student_leads) и контакты преподавателей
        r_lead = c_stu.post(
            "/api/leads",
            json={"subjects": ["bio"], "exam": "ЕГЭ", "format": "Онлайн", "targetPrice": 1100, "whatsapp": "+79142100500", "comment": "Медвуз"},
        )
        assert r_lead.status_code == 200
        lid = r_lead.json()["lead"]["id"]
        assert any(x["id"] == lid for x in c_tut.get("/api/leads").json()["leads"])
        assert c_tut.delete(f"/api/leads/{lid}").status_code == 403
        assert c_stu.delete(f"/api/leads/{lid}").status_code == 200

        assert c_stu.put(f"/api/contacts/{tid}", json={"telegram": "@sargylana_bio", "maxHandle": "sarg_ege"}).status_code == 200
        mkt_state = c_stu.get("/api/market/state").json()
        assert mkt_state["authenticated"] is True
        assert mkt_state["contacts"][tid]["telegram"] == "@sargylana_bio"


def test_admin_auth_guard_and_refund_returns_wallet_balance(tmp_path: Path) -> None:
    app = create_api_app(_sqlite_settings(tmp_path, "adm_guard.db", admin_require_auth=True))
    with TestClient(app) as c_guest, TestClient(app) as c_stu, TestClient(app) as c_adm:
        assert c_guest.get("/api/admin/overview").status_code == 401

        assert c_stu.post("/api/auth/register", json={"username": "stu_x", "password": "secret123"}).status_code == 200
        assert c_stu.get("/api/admin/overview").status_code == 403

        assert c_adm.post("/api/auth/register", json={"username": "adm_x", "password": "secret123"}).status_code == 200
        adm_uid = c_adm.get("/api/me").json()["user"]["id"]
        app.state.db.admin_set_user_role(adm_uid, "admin")
        assert c_adm.get("/api/admin/overview").status_code == 200

        # Создаём заявку со списанием с кошелька ученика и делаем возврат через Admin API
        assert c_stu.post("/api/wallet/topup", json={"amount": 1500, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post("/api/bookings", json={"tutorId": "tut-ykt-bio-1", "offerPrice": 1100, "hour": "18:00"})
        assert r_bk.status_code == 200
        bid = r_bk.json()["booking"]["id"]
        assert c_stu.get("/api/wallet").json()["wallet"]["balanceRub"] == 400

        r_ref = c_adm.post(f"/api/admin/requests/{bid}/status", json={"status": "refunded"})
        assert r_ref.status_code == 200
        assert r_ref.json()["request"]["status"] == "refunded"
        assert c_stu.get("/api/wallet").json()["wallet"]["balanceRub"] == 1500


def test_dualwrite_pg17_marketplace_full_flow(tmp_path: Path) -> None:
    if not _pg_available():
        pytest.skip("PostgreSQL 17 (:5432/vektor_ege) not available in CI")

    suffix = uuid.uuid4().hex[:8]
    u_stu = f"dw_stu_{suffix}"
    u_tut = f"dw_tut_{suffix}"
    tid = f"tut-dw-{suffix}"

    with psycopg.connect(PG_DSN, row_factory=dict_row) as conn:
        max_outbox_id = int(conn.execute("SELECT COALESCE(MAX(id), 0) AS mx FROM outbox.kafka_outbox").fetchone()["mx"])

    settings = Settings(
        db_path=tmp_path / "dual_mkt.db",
        database_url=PG_DSN,
        db_mode="dual",
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
    )
    app = create_api_app(settings)
    lead_id = None
    booking_id = None
    payout_id = None
    try:
        with TestClient(app) as c_tut, TestClient(app) as c_stu:
            assert c_tut.post(
                "/api/auth/register",
                json={"username": u_tut, "password": "secret123", "displayName": "Анна ПГ", "role": "tutor"},
            ).status_code == 200
            assert c_stu.post(
                "/api/auth/register",
                json={"username": u_stu, "password": "secret123", "displayName": "Тимур ПГ"},
            ).status_code == 200

            app.state.db.upsert_tutor_profile(
                c_tut.get("/api/me").json()["user"]["id"],
                {"name": "Анна ПГ", "city": "Якутск", "timezone": "UTC+9", "price": 1200, "slots": {"4": ["23:00"]}},
                tutor_id=tid,
            )

            assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
            r_bk = c_stu.post(
                "/api/bookings",
                json={"tutorId": tid, "offerPrice": 1130, "hour": "23:00", "dayIso": "2026-11-20"},
            )
            assert r_bk.status_code == 200
            booking_id = r_bk.json()["booking"]["id"]

            assert c_stu.patch(
                f"/api/bookings/{booking_id}/schedule",
                json={"schedulePlan": {"status": "confirmed", "dows": [2, 4], "hour": "23:00", "weekly": True}},
            ).status_code == 200
            assert c_stu.patch(
                f"/api/bookings/{booking_id}/telemost",
                json={"url": f"https://telemost.yandex.ru/j/dw{suffix}"},
            ).status_code == 200

            assert c_tut.post(f"/api/bookings/{booking_id}/accept").status_code == 200
            assert c_tut.post(f"/api/bookings/{booking_id}/complete").status_code == 200

            r_pay = c_tut.post(
                "/api/tutor/payouts",
                json={"tutorId": tid, "method": "sbp", "bank": "АЭБ", "phone": "+79142100199", "amount": 500},
            )
            assert r_pay.status_code == 200
            payout_id = r_pay.json()["payout"]["id"]

            r_lead = c_stu.post(
                "/api/leads",
                json={"subjects": ["chem"], "targetPrice": 1100, "whatsapp": "+79142100500", "comment": "PG test"},
            )
            assert r_lead.status_code == 200
            lead_id = r_lead.json()["lead"]["id"]

            assert c_stu.put(f"/api/contacts/{tid}", json={"telegram": f"@tg_{suffix}"}).status_code == 200

        with psycopg.connect(PG_DSN, row_factory=dict_row) as pg_conn:
            pg_stu = pg_conn.execute("SELECT id FROM oltp.users WHERE username_lower = %s", (u_stu.lower(),)).fetchone()
            assert pg_stu is not None
            pg_stu_id = int(pg_stu["id"])

            pg_w = pg_conn.execute("SELECT balance_rub FROM oltp.wallets WHERE user_id = %s", (pg_stu_id,)).fetchone()
            assert pg_w is not None and int(pg_w["balance_rub"]) == 870

            pg_lr = pg_conn.execute(
                "SELECT status, hour_slot, telemost_url, schedule_plan FROM oltp.lesson_requests WHERE id = %s",
                (booking_id,),
            ).fetchone()
            assert pg_lr["status"] == "completed"
            assert pg_lr["hour_slot"] == "23:00"
            assert pg_lr["telemost_url"] == f"https://telemost.yandex.ru/j/dw{suffix}"
            assert pg_lr["schedule_plan"]["status"] == "confirmed"

            pg_esc = pg_conn.execute(
                "SELECT gross_rub, platform_fee_rub, tutor_payout_rub, status FROM oltp.escrow_holds WHERE request_id = %s",
                (booking_id,),
            ).fetchone()
            assert pg_esc["status"] == "captured"
            assert int(pg_esc["gross_rub"]) == 1130
            assert int(pg_esc["platform_fee_rub"]) == 57
            assert int(pg_esc["tutor_payout_rub"]) == 1073

            assert pg_conn.execute("SELECT 1 FROM oltp.payout_requests WHERE id = %s", (payout_id,)).fetchone() is not None
            assert pg_conn.execute("SELECT 1 FROM oltp.student_leads WHERE id = %s", (lead_id,)).fetchone() is not None
            assert (
                pg_conn.execute(
                    "SELECT telegram FROM oltp.tutor_contact_overrides WHERE user_id = %s AND tutor_id = %s",
                    (pg_stu_id, tid),
                ).fetchone()["telegram"]
                == f"@tg_{suffix}"
            )
            pg_out = pg_conn.execute(
                "SELECT COUNT(*) AS cnt FROM outbox.kafka_outbox WHERE id > %s",
                (max_outbox_id,),
            ).fetchone()
            assert int(pg_out["cnt"]) >= 5
    finally:
        with psycopg.connect(PG_DSN, row_factory=dict_row) as conn:
            with conn.transaction():
                conn.execute("DELETE FROM outbox.kafka_outbox WHERE id > %s", (max_outbox_id,))
                if lead_id:
                    conn.execute("DELETE FROM oltp.student_leads WHERE id = %s", (lead_id,))
                if payout_id:
                    conn.execute("DELETE FROM oltp.payout_requests WHERE id = %s", (payout_id,))
                if booking_id:
                    conn.execute("DELETE FROM oltp.lesson_requests WHERE id = %s", (booking_id,))
                conn.execute("DELETE FROM oltp.tutors WHERE id = %s", (tid,))
                conn.execute("DELETE FROM oltp.users WHERE username_lower = ANY(%s)", ([u_stu.lower(), u_tut.lower()],))
