"""Тесты автовыплат ЮKassa Payouts API v3 (СБП / карты Мир), антифрод-холда и чеков НПД (ФНС «Мой налог»)."""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from fastapi.testclient import TestClient
import httpx

from admin_streamlit.api_client import AdminApiClient
from backend.config import PayoutsConfig, SchedulerConfig, Settings
from backend.main import create_app
from backend.npd_fns import build_fns_receipt_urls, parse_fns_receipt_url, validate_inn_12
from backend.payouts import YooKassaPayoutsClient, normalize_sbp_phone, resolve_sbp_bank_id
from backend.realtime import RealtimeBroker
from backend.scheduler import BackgroundScheduler


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


def _payout_settings(
    tmp_path: Path,
    name: str = "payouts.db",
    *,
    npd_provider: str = "partner",
    check_online: bool = False,
    antifraud_min_lessons: int = 1,
    auto_max_rub: int = 15_000,
    admin_token: str = "adm-payout-secret",
) -> Settings:
    return Settings(
        db_path=tmp_path / name,
        admin_api_token=admin_token,
        admin_require_auth=True,
        public_base_url="https://vektor-ege.example.com",
        payouts=PayoutsConfig(
            provider="yookassa",
            yookassa_agent_id="agent_123456",
            yookassa_secret_key="payout_secret_xyz",
            yookassa_api_url="https://api.yookassa.ru/v3",
            auto_dispatch=True,
            auto_max_rub=auto_max_rub,
            antifraud_min_lessons=antifraud_min_lessons,
            check_webhook_ip=True,
            npd_provider=npd_provider,
            npd_status_api_url="https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status",
            npd_check_status_online=check_online,
            npd_partner_api_url="https://npd-partner.example.ru/api",
            npd_partner_api_key="partner_token_abc",
            npd_lknpd_api_url="https://lknpd.nalog.ru/api/v1",
            npd_lknpd_token="lknpd_bearer_tok",
            npd_platform_inn="7707083893",
            npd_platform_name="ООО «Вектор»",
        ),
    )


def _seed_tutor_with_earnings(app, c_tut: TestClient, c_stu: TestClient, *, lessons: int = 1, price: int = 2500) -> str:
    assert c_tut.post(
        "/api/auth/register",
        json={"username": "tut_pay_user", "password": "secret123", "role": "tutor", "displayName": "Анна К."},
    ).status_code == 200
    assert c_stu.post(
        "/api/auth/register",
        json={"username": "stu_pay_user", "password": "secret123", "displayName": "Олег М."},
    ).status_code == 200

    prof = c_tut.put(
        "/api/tutor/profile",
        json={
            "name": "Анна Кузнецова",
            "subject": "bio",
            "subjects": ["bio"],
            "city": "Якутск",
            "price": price,
            "slots": {"1": ["14:00"], "2": ["15:00"], "3": ["16:00"]},
        },
    )
    assert prof.status_code == 200
    tid = prof.json()["tutor"]["id"]

    stu_uid = c_stu.get("/api/me").json()["user"]["id"]
    app.state.db.topup_wallet(stu_uid, amount_rub=lessons * price + 5000, method="sbp")

    for i in range(lessons):
        r_bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tid,
                "studentName": "Олег М.",
                "subject": "Биология",
                "city": "Якутск",
                "dayIso": f"2026-11-{16 + i:02d}",
                "hour": "14:00",
                "offerPrice": price,
            },
        )
        assert r_bk.status_code == 200
        bid = r_bk.json()["booking"]["id"]
        assert c_tut.post(f"/api/bookings/{bid}/accept").status_code == 200
        assert c_tut.post(f"/api/bookings/{bid}/complete").status_code == 200

    return tid


def test_inn_sbp_and_fns_receipt_url_helpers() -> None:
    assert validate_inn_12("500100732259") == (True, "500100732259")
    assert validate_inn_12("143500123413") == (True, "143500123413")
    assert validate_inn_12("500100732258")[0] is False
    assert validate_inn_12("12345")[0] is False

    assert normalize_sbp_phone("8 (914) 210-01-99") == "79142100199"
    assert normalize_sbp_phone("9142100199") == "79142100199"
    assert normalize_sbp_phone("123") is None

    assert resolve_sbp_bank_id("Сбербанк") == "100000000111"
    assert resolve_sbp_bank_id("Т-Банк") == "100000000004"
    assert resolve_sbp_bank_id("Альфа-Банк") == "100000000008"
    assert resolve_sbp_bank_id("ВТБ") == "100000000005"
    assert resolve_sbp_bank_id("АЭБ (Алмазэргиэнбанк)") == "100000000078"

    p_url, j_url = build_fns_receipt_urls("500100732259", "24abcXYZ99")
    assert p_url == "https://lknpd.nalog.ru/api/v1/receipt/500100732259/24abcXYZ99/print"
    assert j_url == "https://lknpd.nalog.ru/api/v1/receipt/500100732259/24abcXYZ99/json"
    assert parse_fns_receipt_url(p_url) == ("500100732259", "24abcXYZ99")
    assert parse_fns_receipt_url("https://evil.example/api/v1/receipt/500100732259/abc/print") is None


def test_yookassa_sbp_autodispatch_webhook_and_fns_partner_receipt(tmp_path: Path) -> None:
    admin_secret = "adm-payout-secret"
    app = create_app(_payout_settings(tmp_path, "po_flow.db", admin_token=admin_secret))

    remote_payouts: dict[str, dict] = {}
    calls: list[dict] = []
    expected_auth = "Basic " + base64.b64encode(b"agent_123456:payout_secret_xyz").decode("ascii")

    def mock_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url.startswith("https://api.yookassa.ru/v3"):
            assert request.headers.get("authorization") == expected_auth
            path = request.url.path
            if request.method == "GET" and path == "/v3/sbp_banks":
                return httpx.Response(
                    200,
                    json={
                        "type": "list",
                        "items": [
                            {"bank_id": "100000000078", "name": "АЭБ (Алмазэргиэнбанк)", "bic": "049805770"},
                            {"bank_id": "100000000111", "name": "Сбербанк", "bic": "044525225"},
                        ],
                    },
                )
            if request.method == "POST" and path == "/v3/payouts":
                idem = request.headers.get("idempotence-key", "")
                assert idem
                body = json.loads(request.content.decode("utf-8"))
                calls.append({"type": "yk_create", "idem": idem, "body": body})
                ppid = f"po-yk-{len(remote_payouts) + 1}"
                obj = {
                    "id": ppid,
                    "status": "pending",
                    "amount": body["amount"],
                    "payout_destination_data": body.get("payout_destination_data"),
                    "metadata": body.get("metadata") or {},
                }
                remote_payouts[ppid] = obj
                return httpx.Response(200, json=obj)
            if request.method == "GET" and path.startswith("/v3/payouts/"):
                ppid = path.rsplit("/", 1)[-1]
                obj = remote_payouts.get(ppid)
                return httpx.Response(200, json=obj) if obj else httpx.Response(404, json={"code": "not_found"})

        if url == "https://statusnpd.nalog.ru/api/v1/tracker/taxpayer_status":
            body = json.loads(request.content.decode("utf-8"))
            calls.append({"type": "fns_status", "body": body})
            return httpx.Response(200, json={"status": True, "message": "Плательщик НПД"})

        if url == "https://npd-partner.example.ru/api/receipts":
            assert request.headers.get("authorization") == "Bearer partner_token_abc"
            assert request.headers.get("idempotence-key")
            body = json.loads(request.content.decode("utf-8"))
            calls.append({"type": "fns_partner_reg", "body": body})
            uuid_rc = f"25npd{len(calls)}"
            return httpx.Response(
                200,
                json={
                    "receiptUuid": uuid_rc,
                    "receiptUrl": f"https://lknpd.nalog.ru/api/v1/receipt/{body['tutorInn']}/{uuid_rc}/print",
                    "receiptJsonUrl": f"https://lknpd.nalog.ru/api/v1/receipt/{body['tutorInn']}/{uuid_rc}/json",
                },
            )

        return httpx.Response(404)

    with TestClient(app) as c_tut, TestClient(app) as c_stu, TestClient(app) as c_adm:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))
        app.state.payout_gateway = YooKassaPayoutsClient(app.state.settings.payouts, http_getter=lambda: app.state.http)
        app.state.npd_client = app.state.npd_client.__class__(app.state.settings.payouts, http_getter=lambda: app.state.http)

        tid = _seed_tutor_with_earnings(app, c_tut, c_stu, lessons=1, price=2500)

        # Список банков СБП с сервера
        banks_res = c_tut.get("/api/payouts/sbp-banks")
        assert banks_res.status_code == 200
        assert any(b["bank_id"] == "100000000078" for b in banks_res.json()["banks"])

        # Проверка ИНН самозанятого: неверный 400 -> верный 200 и сохранение в профиле
        assert c_tut.post("/api/tutor/npd/check-inn", json={"inn": "111122223333"}).status_code == 400
        chk_res = c_tut.post("/api/tutor/npd/check-inn", json={"inn": "500100732259", "save": True})
        assert chk_res.status_code == 200
        assert chk_res.json()["isSelfEmployed"] is True
        assert c_tut.get("/api/tutor/summary").json()["tutorInn"] == "500100732259"

        # Создание выплаты 1500 ₽ по СБП -> автоотправка в ЮKassa
        r_po = c_tut.post(
            "/api/tutor/payouts",
            json={
                "tutorId": tid,
                "method": "sbp",
                "bank": "АЭБ (Алмазэргиэнбанк)",
                "phone": "+7 (914) 210-01-99",
                "amount": 1500,
                "npdReceipt": True,
            },
        )
        assert r_po.status_code == 200
        payout = r_po.json()["payout"]
        assert payout["provider"] == "yookassa"
        assert payout["providerPayoutId"] == "po-yk-1"
        assert payout["sbpBankId"] == "100000000078"
        assert payout["npdStatus"] == "pending"
        assert payout["npdReceipt"] is None
        assert "sbpPhone" not in payout

        yk_call = next(c for c in calls if c["type"] == "yk_create")
        assert yk_call["body"]["payout_destination_data"] == {
            "type": "sbp",
            "phone": "79142100199",
            "bank_id": "100000000078",
        }

        # Посторонний IP на webhook отклонён 403
        bad_wh = c_adm.post(
            "/api/payouts/yookassa/webhook",
            headers={"x-forwarded-for": "8.8.8.8"},
            json={"type": "notification", "event": "payout.succeeded", "object": {"id": "po-yk-1"}},
        )
        assert bad_wh.status_code == 403

        # Официальный IP ЮKassa -> GET /v3/payouts/po-yk-1 -> succeeded -> авточек НПД
        remote_payouts["po-yk-1"]["status"] = "succeeded"
        good_wh = c_adm.post(
            "/api/payouts/yookassa/webhook",
            headers={"x-forwarded-for": "185.71.76.2"},
            json={"type": "notification", "event": "payout.succeeded", "object": {"id": "po-yk-1"}},
        )
        assert good_wh.status_code == 200
        assert good_wh.json()["status"] == "succeeded"
        assert good_wh.json()["changed"] is True
        assert good_wh.json()["npdStatus"] == "registered"

        # Идемпотентный повтор webhook не дублирует чек или выплату
        dup_wh = c_adm.post(
            "/api/payouts/yookassa/webhook",
            headers={"x-forwarded-for": "185.71.76.2"},
            json={"type": "notification", "event": "payout.succeeded", "object": {"id": "po-yk-1"}},
        )
        assert dup_wh.status_code == 200
        assert dup_wh.json()["changed"] is False
        assert sum(1 for c in calls if c["type"] == "fns_partner_reg") == 1

        # Проверка AdminApiClient (ops, npd-receipts)
        adm_client = AdminApiClient(
            base_url="http://testserver",
            admin_token=admin_secret,
            transport=_TestClientTransport(c_adm),
        )
        ops = adm_client.ops_status()
        assert ops["payouts"]["yookassaConfigured"] is True
        assert ops["npd"]["provider"] == "partner"
        receipts = adm_client.npd_receipts()
        assert len(receipts) == 1
        assert receipts[0]["status"] == "registered"
        assert receipts[0]["receiptUrl"].startswith("https://lknpd.nalog.ru/api/v1/receipt/500100732259/")


def test_antifraud_hold_admin_dispatch_cancel_refund_and_scheduler(tmp_path: Path) -> None:
    admin_secret = "adm-hold-secret"
    app = create_app(
        _payout_settings(
            tmp_path,
            "po_hold.db",
            npd_provider="lknpd",
            antifraud_min_lessons=2,
            auto_max_rub=2000,
            admin_token=admin_secret,
        )
    )

    remote_payouts: dict[str, dict] = {}
    calls: list[dict] = []

    def mock_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == "https://api.yookassa.ru/v3/payouts" and request.method == "POST":
            body = json.loads(request.content.decode("utf-8"))
            ppid = f"po-hold-{len(remote_payouts) + 1}"
            obj = {"id": ppid, "status": "pending", "amount": body["amount"], "metadata": body.get("metadata") or {}}
            remote_payouts[ppid] = obj
            return httpx.Response(200, json=obj)
        if url.startswith("https://api.yookassa.ru/v3/payouts/") and request.method == "GET":
            ppid = url.rsplit("/", 1)[-1]
            return httpx.Response(200, json=remote_payouts[ppid])
        if url == "https://lknpd.nalog.ru/api/v1/income":
            assert request.headers.get("authorization") == "Bearer lknpd_bearer_tok"
            calls.append(("lknpd_income", json.loads(request.content.decode("utf-8"))))
            return httpx.Response(200, json={"approvedReceiptUuid": "26lknpd001"})
        if url == "https://lknpd.nalog.ru/api/v1/cancel":
            assert request.headers.get("authorization") == "Bearer lknpd_bearer_tok"
            calls.append(("lknpd_cancel", json.loads(request.content.decode("utf-8"))))
            return httpx.Response(200, json={"status": "canceled"})
        return httpx.Response(404)

    with TestClient(app) as c_tut, TestClient(app) as c_stu, TestClient(app) as c_adm:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(mock_handler))
        app.state.payout_gateway = YooKassaPayoutsClient(app.state.settings.payouts, http_getter=lambda: app.state.http)
        app.state.npd_client = app.state.npd_client.__class__(app.state.settings.payouts, http_getter=lambda: app.state.http)

        # Репетитор с 1 проведённым уроком -> сработает антифрод new_tutor_hold
        tid = _seed_tutor_with_earnings(app, c_tut, c_stu, lessons=1, price=3000)

        r_hold = c_tut.post(
            "/api/tutor/payouts",
            json={
                "tutorId": tid,
                "method": "sbp",
                "bank": "Сбербанк",
                "phone": "+7 (914) 210-01-99",
                "tutorInn": "143500123413",
                "amount": 1000,
                "npdReceipt": True,
            },
        )
        assert r_hold.status_code == 200
        p1 = r_hold.json()["payout"]
        assert p1["antifraudHold"] is True
        assert "new_tutor_hold" in p1["antifraudReason"]
        assert p1["providerPayoutId"] is None
        assert len(remote_payouts) == 0

        # Админ вручную отправляет выплату из антифрод-холда
        adm = AdminApiClient(
            base_url="http://testserver",
            admin_token=admin_secret,
            transport=_TestClientTransport(c_adm),
        )
        disp = adm.dispatch_payout(p1["id"])
        assert disp["payout"]["providerPayoutId"] == "po-hold-1"
        assert disp["payout"]["antifraudHold"] is False

        # Имитируем устаревший pending payout (> 2 мин) -> BackgroundScheduler синхронизирует с ЮKassa -> canceled!
        app.state.db._conn.execute(
            "UPDATE admin_payout_requests SET created_at = ? WHERE id = ?",
            ((datetime.now(timezone.utc) - timedelta(minutes=10)).isoformat().replace("+00:00", "Z"), p1["id"]),
        )
        app.state.db._conn.commit()
        remote_payouts["po-hold-1"] = {
            "id": "po-hold-1",
            "status": "canceled",
            "amount": {"value": "1000.00", "currency": "RUB"},
            "cancellation_details": {"reason": "recipient_bank_rejected"},
        }
        sched = BackgroundScheduler(
            settings=Settings(
                db_path=tmp_path / "po_hold.db",
                payouts=app.state.settings.payouts,
                scheduler=SchedulerConfig(enabled=False),
            ),
            db=app.state.db,
            realtime=RealtimeBroker(),
            payout_gateway=app.state.payout_gateway,
            npd_client=app.state.npd_client,
        )
        tick_res = asyncio.run(sched.run_once())
        assert tick_res["payoutsSynced"] == 1
        assert app.state.db.get_payout(p1["id"])["status"] == "rejected"
        # Баланс репетитора полностью восстановился
        assert c_tut.get("/api/tutor/summary").json()["availableRub"] == 2820

        # Карточная выплата -> админ отправляет по номеру карты -> succeeded -> авточек lknpd -> отмена чека + привязка ссылки
        r_card = c_tut.post(
            "/api/tutor/payouts",
            json={
                "tutorId": tid,
                "method": "card",
                "bank": "Карта РФ (Мир)",
                "card": "2200 7004 8210 4419",
                "tutorInn": "143500123413",
                "amount": 1200,
                "npdReceipt": True,
            },
        )
        assert r_card.status_code == 200
        p2 = r_card.json()["payout"]
        assert p2["destinationMasked"] == "2200 70** **** 4419"

        adm.dispatch_payout(p2["id"], card_number="2200 7004 8210 4419")
        remote_payouts["po-hold-2"]["status"] = "succeeded"
        sync_ok = adm.sync_payout(p2["id"])
        assert sync_ok["payout"]["status"] == "succeeded"
        assert sync_ok["payout"]["npdReceipt"] == "26lknpd001"
        assert sync_ok["payout"]["npdStatus"] == "registered"

        # Аннулирование чека администратором
        canc_res = adm.cancel_payout_npd(p2["id"], reason="Ошибка суммы")
        assert canc_res["payout"]["npdStatus"] == "canceled"
        assert canc_res["payout"]["npdReceipt"] is None
        assert any(c[0] == "lknpd_cancel" for c in calls)

        # Репетитор сам привязывает официальную ссылку на чек ФНС
        manual_url = "https://lknpd.nalog.ru/api/v1/receipt/143500123413/26manual77/print"
        r_att = c_tut.post(f"/api/tutor/payouts/{p2['id']}/npd-receipt", json={"receiptUrl": manual_url})
        assert r_att.status_code == 200
        assert r_att.json()["payout"]["npdReceipt"] == "26manual77"
        assert r_att.json()["payout"]["npdReceiptUrl"] == manual_url
        assert r_att.json()["payout"]["npdStatus"] == "registered"
