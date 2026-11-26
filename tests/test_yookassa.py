"""Тесты эквайринга ЮKassa API v3 (СБП 0%, карты РФ +3%, чеки 54-ФЗ, IP-фильтр webhook и идемпотентность)."""

from __future__ import annotations

import asyncio
import base64
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path

from fastapi.testclient import TestClient
import httpx

from admin_streamlit.api_client import AdminApiClient
from backend.api import create_api_app
from backend.config import PaymentsConfig, SchedulerConfig, Settings
from backend.main import create_app
from backend.realtime import RealtimeBroker
from backend.scheduler import BackgroundScheduler
from backend.yookassa import YooKassaClient, is_yookassa_webhook_ip


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
        return httpx.Response(
            status_code=resp.status_code,
            headers=list(resp.headers.multi_items()),
            content=resp.content,
            request=request,
        )


def _yk_settings(tmp_path: Path, name: str = "yk.db", *, shop_id: str = "987654", secret: str = "test_secret_key", admin_token: str = "") -> Settings:
    return Settings(
        db_path=tmp_path / name,
        admin_api_token=admin_token,
        public_base_url="https://vektor-ege.example.com",
        payments=PaymentsConfig(
            provider="yookassa",
            yookassa_shop_id=shop_id,
            yookassa_secret_key=secret,
            yookassa_api_url="https://api.yookassa.ru/v3",
            yookassa_receipt_enabled=True,
            yookassa_vat_code=1,
            yookassa_tax_system_code=2,
            yookassa_payment_mode="advance",
            yookassa_payment_subject="payment",
            yookassa_check_webhook_ip=True,
        ),
    )


def test_yookassa_webhook_ip_allowlist() -> None:
    for good in (
        "185.71.76.1",
        "185.71.77.30",
        "77.75.153.10",
        "77.75.154.200",
        "77.75.156.11",
        "77.75.156.35",
        "::ffff:185.71.76.12",
        "2a02:5180::1234",
    ):
        assert is_yookassa_webhook_ip(good) is True, good

    for bad in ("", "127.0.0.1", "8.8.8.8", "203.0.113.5", "not-an-ip", "2001:db8::1"):
        assert is_yookassa_webhook_ip(bad) is False, bad


def test_yookassa_sbp_card_54fz_webhook_and_idempotency(tmp_path: Path) -> None:
    admin_secret = "yk-admin-secret-99"
    app = create_app(_yk_settings(tmp_path, "yk_flow.db", admin_token=admin_secret))

    remote_payments: dict[str, dict] = {}
    recorded_calls: list[dict] = []
    expected_auth = "Basic " + base64.b64encode(b"987654:test_secret_key").decode("ascii")

    def yk_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == expected_auth
        path = request.url.path
        if request.method == "POST" and path == "/v3/payments":
            idem = request.headers.get("idempotence-key", "")
            assert idem
            payload = json.loads(request.content.decode("utf-8"))
            recorded_calls.append({"method": "POST", "idem": idem, "payload": payload})
            pid = f"yk-pay-{len(remote_payments) + 1}"
            obj = {
                "id": pid,
                "status": "pending",
                "paid": False,
                "amount": payload["amount"],
                "confirmation": {"type": "redirect", "confirmation_url": f"https://yoomoney.ru/checkout/{pid}"},
                "metadata": payload.get("metadata") or {},
            }
            remote_payments[pid] = obj
            return httpx.Response(200, json=obj)
        if request.method == "GET" and path.startswith("/v3/payments/"):
            pid = path.rsplit("/", 1)[-1]
            obj = remote_payments.get(pid)
            if not obj:
                return httpx.Response(404, json={"code": "not_found", "description": "Not found"})
            return httpx.Response(200, json=obj)
        return httpx.Response(404)

    with TestClient(app) as client, TestClient(app) as yk_cli:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(yk_handler))

        assert (
            client.post(
                "/api/auth/register",
                json={"username": "yk_stu", "password": "secret123", "displayName": "Оля П."},
            ).status_code
            == 200
        )

        # 1. Без email и телефона 54-ФЗ отклоняет до запроса в ЮKassa
        r_no_rcpt = client.post(
            "/api/payments/topup",
            json={"amount": 1000, "method": "sbp"},
        )
        assert r_no_rcpt.status_code == 400
        assert r_no_rcpt.json()["code"] == "receipt_contact_required"

        # 2. Создаём пополнение СБП (0%) с receiptEmail и returnPath
        r_sbp = client.post(
            "/api/payments/topup",
            json={
                "amount": 1000,
                "method": "sbp",
                "receiptEmail": "olya@ege.ru",
                "returnPath": "/#market",
            },
        )
        assert r_sbp.status_code == 200, r_sbp.text
        body1 = r_sbp.json()
        assert body1["mode"] == "redirect"
        assert body1["provider"] == "yookassa"
        assert body1["confirmationUrl"] == "https://yoomoney.ru/checkout/yk-pay-1"
        intent1 = body1["intent"]
        assert intent1["amountRub"] == 1000
        assert intent1["feeRub"] == 0
        assert intent1["totalRub"] == 1000

        posted1 = recorded_calls[-1]["payload"]
        assert posted1["amount"] == {"value": "1000.00", "currency": "RUB"}
        assert posted1["payment_method_data"] == {"type": "sbp"}
        assert posted1["confirmation"]["return_url"] == f"https://vektor-ege.example.com/?payment_intent={intent1['id']}#market"
        assert posted1["receipt"]["customer"]["email"] == "olya@ege.ru"
        assert posted1["receipt"]["tax_system_code"] == 2
        assert posted1["receipt"]["items"][0]["vat_code"] == 1
        assert posted1["receipt"]["items"][0]["payment_mode"] == "advance"

        # До оплаты баланс 0 ₽
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 0

        # 3. Webhook с левого IP -> 403
        r_rogue = yk_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "203.0.113.55"},
            json={"event": "payment.succeeded", "object": {"id": "yk-pay-1"}},
        )
        assert r_rogue.status_code == 403

        # Даже с официального IP, пока ЮKassa GET /v3/payments/{id} отвечает pending, баланс НЕ зачисляется
        r_wh_pending = yk_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "185.71.76.12"},
            json={"event": "payment.succeeded", "object": {"id": "yk-pay-1", "status": "succeeded"}},
        )
        assert r_wh_pending.status_code == 200
        assert r_wh_pending.json()["creditedNow"] is False
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 0

        # 4. Переводим платёж в succeeded на стороне ЮKassa -> webhook зачисляет ровно 1 раз
        remote_payments["yk-pay-1"]["status"] = "succeeded"
        remote_payments["yk-pay-1"]["paid"] = True
        r_wh_ok = yk_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "185.71.76.12"},
            json={"event": "payment.succeeded", "object": {"id": "yk-pay-1"}},
        )
        assert r_wh_ok.status_code == 200
        assert r_wh_ok.json()["status"] == "succeeded"
        assert r_wh_ok.json()["creditedNow"] is True
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 1000

        # Повторный webhook и GET /api/payments/intents/{id} не начисляют повторно
        r_wh_dup = yk_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "77.75.156.11"},
            json={"event": "payment.succeeded", "object": {"id": "yk-pay-1"}},
        )
        assert r_wh_dup.status_code == 200
        assert r_wh_dup.json()["creditedNow"] is False
        assert client.get(f"/api/payments/intents/{intent1['id']}").json()["creditedNow"] is False
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 1000

        # 5. Пополнение картой (+3%) через /api/wallet/topup -> return_url fallback sync без webhook
        r_card = client.post(
            "/api/wallet/topup",
            json={"amount": 1000, "method": "card", "receiptEmail": "olya@ege.ru"},
        )
        assert r_card.status_code == 200
        card_data = r_card.json()
        assert card_data["mode"] == "redirect"
        assert card_data["intent"]["feeRub"] == 30
        assert card_data["intent"]["totalRub"] == 1030
        assert recorded_calls[-1]["payload"]["amount"]["value"] == "1030.00"
        assert recorded_calls[-1]["payload"]["payment_method_data"] == {"type": "bank_card"}

        remote_payments["yk-pay-2"]["status"] = "succeeded"
        remote_payments["yk-pay-2"]["paid"] = True
        r_ret = client.get(f"/api/payments/intents/{card_data['intent']['id']}")
        assert r_ret.status_code == 200
        assert r_ret.json()["creditedNow"] is True
        assert r_ret.json()["wallet"]["balanceRub"] == 2000

        # 6. Защита от подмены суммы в ответе и проверка отмены платежа
        r_mis = client.post(
            "/api/payments/topup",
            json={"amount": 500, "method": "sbp", "receiptEmail": "olya@ege.ru"},
        )
        mis_id = r_mis.json()["intent"]["id"]
        remote_payments["yk-pay-3"]["status"] = "succeeded"
        remote_payments["yk-pay-3"]["paid"] = True
        remote_payments["yk-pay-3"]["amount"] = {"value": "1.00", "currency": "RUB"}
        r_mis_chk = client.get(f"/api/payments/intents/{mis_id}")
        assert r_mis_chk.json()["intent"]["status"] == "canceled"
        assert r_mis_chk.json()["intent"]["errorMessage"] == "amount_mismatch"
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 2000


def test_prod_guard_blocks_demo_topup_without_yookassa_keys(tmp_path: Path) -> None:
    app = create_api_app(
        Settings(
            db_path=tmp_path / "prod_no_yk.db",
            env="production",
            dev_demo_mode=False,
            payments=PaymentsConfig(provider="auto"),
        )
    )
    with TestClient(app) as client:
        assert (
            client.post(
                "/api/auth/register",
                json={"username": "prod_u1", "password": "secret123", "displayName": "Прод Ученик"},
            ).status_code
            == 200
        )
        r = client.post("/api/wallet/topup", json={"amount": 1000, "method": "sbp"})
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "payments_not_configured"
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 0


def test_scheduler_reconcile_and_admin_client_payments(tmp_path: Path) -> None:
    admin_secret = "yk-admin-sched-2026"
    settings = _yk_settings(tmp_path, "yk_sched.db", admin_token=admin_secret)
    app = create_api_app(settings)

    remote_state = {
        "yk-stale-1": {
            "id": "yk-stale-1",
            "status": "succeeded",
            "paid": True,
            "amount": {"value": "700.00", "currency": "RUB"},
        }
    }

    def yk_handler(request: httpx.Request) -> httpx.Response:
        if request.method == "POST" and request.url.path == "/v3/payments":
            payload = json.loads(request.content.decode("utf-8"))
            return httpx.Response(
                200,
                json={
                    "id": "yk-stale-1",
                    "status": "pending",
                    "paid": False,
                    "amount": payload["amount"],
                    "confirmation": {"type": "redirect", "confirmation_url": "https://yoomoney.ru/checkout/yk-stale-1"},
                },
            )
        if request.method == "GET" and request.url.path == "/v3/payments/yk-stale-1":
            return httpx.Response(200, json=remote_state["yk-stale-1"])
        return httpx.Response(404)

    with TestClient(app) as client, TestClient(app) as api_tc:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(yk_handler))
        assert (
            client.post(
                "/api/auth/register",
                json={"username": "yk_sched_u", "password": "secret123", "displayName": "Антон К."},
            ).status_code
            == 200
        )
        r_up = client.post(
            "/api/payments/topup",
            json={"amount": 700, "method": "sbp", "receiptEmail": "anton@ege.ru"},
        )
        assert r_up.status_code == 200
        iid = r_up.json()["intent"]["id"]

        # Откатываем created_at на 10 минут назад и запускаем сверку в планировщике
        ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        app.state.db._conn.execute("UPDATE payment_intents SET created_at = ? WHERE id = ?", (ten_min_ago, iid))
        app.state.db._conn.commit()

        yk_client = YooKassaClient(settings.payments, http_getter=lambda: app.state.http)
        sched = BackgroundScheduler(
            settings=Settings(db_path=settings.db_path, scheduler=SchedulerConfig(), payments=settings.payments),
            db=app.state.db,
            realtime=RealtimeBroker(),
            yookassa=yk_client,
        )
        tick = asyncio.run(sched.run_once())
        assert tick["paymentsSynced"] == 1
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 700

        with AdminApiClient("http://testserver", admin_token=admin_secret, transport=_TestClientTransport(api_tc)) as adm:
            items = adm.payments()
            assert any(item["id"] == iid and item["status"] == "succeeded" for item in items)
            sync_res = adm.sync_payment(iid)
            assert sync_res["creditedNow"] is False
            ops = adm.ops_status()
            assert ops["payments"]["yookassaConfigured"] is True
            assert ops["payments"]["shopIdMasked"] == "98***54"


def test_yookassa_wallet_refund_full_lifecycle_webhook_and_idempotency(tmp_path: Path) -> None:
    admin_secret = "yk-ref-admin-1"
    app = create_app(_yk_settings(tmp_path, "yk_ref_life.db", admin_token=admin_secret))

    remote_payments: dict[str, dict] = {}
    remote_refunds: dict[str, dict] = {}
    refund_calls: list[dict] = []
    tg_sent: list[tuple[str, str]] = []
    expected_auth = "Basic " + base64.b64encode(b"987654:test_secret_key").decode("ascii")

    def yk_handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == expected_auth
        path = request.url.path
        if request.method == "POST" and path == "/v3/payments":
            payload = json.loads(request.content.decode("utf-8"))
            pid = f"yk-pay-r{len(remote_payments) + 1}"
            pending_obj = {
                "id": pid,
                "status": "pending",
                "paid": False,
                "amount": payload["amount"],
                "confirmation": {"type": "redirect", "confirmation_url": f"https://yoomoney.ru/checkout/{pid}"},
            }
            remote_payments[pid] = {
                "id": pid,
                "status": "succeeded",
                "paid": True,
                "amount": payload["amount"],
            }
            return httpx.Response(200, json=pending_obj)
        if request.method == "GET" and path.startswith("/v3/payments/"):
            pid = path.rsplit("/", 1)[-1]
            return httpx.Response(200, json=remote_payments[pid])
        if request.method == "POST" and path == "/v3/refunds":
            idem = request.headers.get("idempotence-key", "")
            assert idem
            payload = json.loads(request.content.decode("utf-8"))
            refund_calls.append({"idem": idem, "payload": payload})
            prid = f"yk-refund-{len(remote_refunds) + 1}"
            obj = {
                "id": prid,
                "payment_id": payload["payment_id"],
                "status": "pending",
                "amount": payload["amount"],
                "metadata": payload.get("metadata") or {},
            }
            remote_refunds[prid] = obj
            return httpx.Response(200, json=obj)
        if request.method == "GET" and path.startswith("/v3/refunds/"):
            prid = path.rsplit("/", 1)[-1]
            return httpx.Response(200, json=remote_refunds[prid])
        return httpx.Response(404)

    with TestClient(app) as client, TestClient(app) as adm_cli, TestClient(app) as wh_cli:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(yk_handler))

        async def _fake_safe_send(chat_id: str | int, text: str, **kwargs) -> bool:
            tg_sent.append((str(chat_id), text))
            return True

        app.state.telegram._safe_send = _fake_safe_send

        assert (
            client.post(
                "/api/auth/register",
                json={"username": "stu_ref_1", "password": "secret123", "displayName": "Мария С."},
            ).status_code
            == 200
        )
        uid = client.get("/api/me").json()["user"]["id"]
        app.state.db.upsert_telegram_binding("88112233", user_id=uid, telegram_username="masha")

        # Пополняем 2000 ₽ через СБП и подтверждаем платёж
        r_top = client.post(
            "/api/payments/topup",
            json={"amount": 2000, "method": "sbp", "receiptEmail": "masha@ege.ru"},
        )
        assert r_top.status_code == 200
        iid = r_top.json()["intent"]["id"]
        assert client.get(f"/api/payments/intents/{iid}").json()["creditedNow"] is True
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 2000

        # Тратим 800 ₽ на занятие -> остаётся 1200 ₽ неиспользованного остатка
        r_bk = client.post("/api/bookings", json={"tutorId": "tut-ykt-bio-1", "offerPrice": 800, "hour": "18:00"})
        assert r_bk.status_code == 200
        bk_id = r_bk.json()["booking"]["id"]
        assert client.post(f"/api/bookings/{bk_id}/accept", json={}).status_code == 200
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 1200

        # Ученик запрашивает банковский возврат остатка 1200 ₽
        r_mine_before = client.get("/api/payments/refunds").json()
        assert r_mine_before["refundableRub"] == 1200
        r_req = client.post("/api/payments/refunds", json={"reason": "Завершил подготовку"})
        assert r_req.status_code == 200
        rf = r_req.json()["refund"]
        assert rf["amountRub"] == 1200
        assert rf["status"] == "requested"
        assert rf["paymentIntentId"] == iid
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 0

        # Админ проводит возврат в ЮKassa -> POST /v3/refunds с чеком 54-ФЗ и Idempotence-Key
        adm_hdr = {"X-Admin-Token": admin_secret}
        over = adm_cli.get("/api/admin/overview", headers=adm_hdr).json()
        assert over["kpi"]["pendingRefundsCount"] == 1

        r_disp = adm_cli.post(
            f"/api/admin/refunds/{rf['id']}/dispatch",
            headers=adm_hdr,
            json={"reviewNote": "Одобрено"},
        )
        assert r_disp.status_code == 200
        assert r_disp.json()["refund"]["status"] == "pending"
        prid = r_disp.json()["refund"]["providerRefundId"]
        assert prid == "yk-refund-1"
        assert len(refund_calls) == 1
        yk_req_body = refund_calls[0]["payload"]
        assert yk_req_body["payment_id"] == "yk-pay-r1"
        assert yk_req_body["amount"] == {"value": "1200.00", "currency": "RUB"}
        assert yk_req_body["receipt"]["customer"]["email"] == "masha@ege.ru"

        # ЮKassa подтверждает refund.succeeded через webhook (с allowlist IP + проверкой GET /v3/refunds/{id})
        remote_refunds[prid]["status"] = "succeeded"
        wh_bad = wh_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "8.8.8.8"},
            json={"event": "refund.succeeded", "object": {"id": prid}},
        )
        assert wh_bad.status_code == 403

        wh_ok = wh_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "185.71.76.10"},
            json={"event": "refund.succeeded", "object": {"id": prid}},
        )
        assert wh_ok.status_code == 200 and wh_ok.json()["status"] == "succeeded" and wh_ok.json()["changed"] is True

        # Повторный webhook идемпотентен
        wh_dup = wh_cli.post(
            "/api/payments/yookassa/webhook",
            headers={"X-Forwarded-For": "77.75.156.11"},
            json={"event": "refund.succeeded", "object": {"id": prid}},
        )
        assert wh_dup.status_code == 200 and wh_dup.json()["changed"] is False
        assert any("Банковский возврат выполнен" in msg and "1200 ₽" in msg for _, msg in tg_sent)
        assert adm_cli.get("/api/admin/overview", headers=adm_hdr).json()["kpi"]["pendingRefundsCount"] == 0


def test_yookassa_refund_multi_intent_split_caps_and_revert(tmp_path: Path) -> None:
    admin_secret = "yk-ref-admin-split"
    app = create_app(_yk_settings(tmp_path, "yk_ref_split.db", admin_token=admin_secret))

    remote_payments: dict[str, dict] = {}
    remote_refunds: dict[str, dict] = {}

    def yk_handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST" and path == "/v3/payments":
            payload = json.loads(request.content.decode("utf-8"))
            pid = f"yk-pay-s{len(remote_payments) + 1}"
            pending_obj = {
                "id": pid,
                "status": "pending",
                "paid": False,
                "amount": payload["amount"],
                "confirmation": {"type": "redirect", "confirmation_url": f"https://yoomoney.ru/checkout/{pid}"},
            }
            remote_payments[pid] = {
                "id": pid,
                "status": "succeeded",
                "paid": True,
                "amount": payload["amount"],
            }
            return httpx.Response(200, json=pending_obj)
        if request.method == "GET" and path.startswith("/v3/payments/"):
            return httpx.Response(200, json=remote_payments[path.rsplit("/", 1)[-1]])
        if request.method == "POST" and path == "/v3/refunds":
            payload = json.loads(request.content.decode("utf-8"))
            prid = f"yk-ref-s{len(remote_refunds) + 1}"
            obj = {"id": prid, "status": "pending", "amount": payload["amount"]}
            remote_refunds[prid] = obj
            return httpx.Response(200, json=obj)
        if request.method == "GET" and path.startswith("/v3/refunds/"):
            return httpx.Response(200, json=remote_refunds[path.rsplit("/", 1)[-1]])
        return httpx.Response(404)

    with TestClient(app) as client, TestClient(app) as adm_cli:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(yk_handler))
        assert (
            client.post(
                "/api/auth/register",
                json={"username": "stu_split", "password": "secret123"},
            ).status_code
            == 200
        )

        # Два пополнения по 1000 ₽ -> итого 2000 ₽
        for _ in range(2):
            iid = client.post(
                "/api/payments/topup",
                json={"amount": 1000, "method": "sbp", "receiptEmail": "split@ege.ru"},
            ).json()["intent"]["id"]
            assert client.get(f"/api/payments/intents/{iid}").json()["creditedNow"] is True

        # Запрос возврата на 1500 ₽ автоматически разбивается на 1000 ₽ + 500 ₽ по двум платежам
        r_req = client.post("/api/payments/refunds", json={"amount": 1500, "reason": "Частичный возврат"})
        assert r_req.status_code == 200
        parts = r_req.json()["refunds"]
        assert len(parts) == 2
        assert sorted(p["amountRub"] for p in parts) == [500, 1000]
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 500

        # Попытка запросить ещё 600 ₽ (> остатка 500 ₽) -> 400
        r_over = client.post("/api/payments/refunds", json={"amount": 600})
        assert r_over.status_code == 400

        adm_hdr = {"X-Admin-Token": admin_secret}
        part_500 = next(p for p in parts if p["amountRub"] == 500)
        part_1000 = next(p for p in parts if p["amountRub"] == 1000)

        # Админ отклоняет заявку на 500 ₽ -> баланс атомарно возвращается к 1000 ₽; повтор не дублирует
        r_rej = adm_cli.post(f"/api/admin/refunds/{part_500['id']}/reject", headers=adm_hdr, json={"reviewNote": "Отмена учеником"})
        assert r_rej.status_code == 200 and r_rej.json()["revertedNow"] is True
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 1000
        r_rej_dup = adm_cli.post(f"/api/admin/refunds/{part_500['id']}/reject", headers=adm_hdr, json={})
        assert r_rej_dup.status_code == 200 and r_rej_dup.json()["revertedNow"] is False
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 1000

        # Вторая заявка (1000 ₽) отправляется в ЮKassa и затем отменяется банком при sync -> баланс восстанавливается до 2000 ₽
        r_disp = adm_cli.post(f"/api/admin/refunds/{part_1000['id']}/dispatch", headers=adm_hdr, json={})
        prid = r_disp.json()["refund"]["providerRefundId"]
        remote_refunds[prid] = {"id": prid, "status": "canceled", "cancellation_details": {"reason": "fraud_suspected"}}
        r_sync = adm_cli.post(f"/api/admin/refunds/{part_1000['id']}/sync", headers=adm_hdr)
        assert r_sync.status_code == 200 and r_sync.json()["refund"]["status"] == "canceled"
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 2000


def test_yookassa_admin_direct_payment_refund_and_scheduler_sync(tmp_path: Path) -> None:
    admin_secret = "yk-ref-dir-sched"
    settings = _yk_settings(tmp_path, "yk_ref_dir.db", admin_token=admin_secret)
    app = create_app(settings)

    remote_payments: dict[str, dict] = {}
    remote_refunds: dict[str, dict] = {}

    def yk_handler(request: httpx.Request) -> httpx.Response:
        path = request.url.path
        if request.method == "POST" and path == "/v3/payments":
            payload = json.loads(request.content.decode("utf-8"))
            pending_obj = {
                "id": "yk-pay-dir-1",
                "status": "pending",
                "paid": False,
                "amount": payload["amount"],
                "confirmation": {"type": "redirect", "confirmation_url": "https://yoomoney.ru/checkout/dir1"},
            }
            remote_payments["yk-pay-dir-1"] = {
                "id": "yk-pay-dir-1",
                "status": "succeeded",
                "paid": True,
                "amount": payload["amount"],
            }
            return httpx.Response(200, json=pending_obj)
        if request.method == "GET" and path.startswith("/v3/payments/"):
            return httpx.Response(200, json=remote_payments["yk-pay-dir-1"])
        if request.method == "POST" and path == "/v3/refunds":
            payload = json.loads(request.content.decode("utf-8"))
            obj = {"id": "yk-ref-dir-1", "status": "pending", "amount": payload["amount"]}
            remote_refunds["yk-ref-dir-1"] = obj
            return httpx.Response(200, json=obj)
        if request.method == "GET" and path == "/v3/refunds/yk-ref-dir-1":
            return httpx.Response(200, json={"id": "yk-ref-dir-1", "status": "succeeded"})
        return httpx.Response(404)

    with TestClient(app) as client, TestClient(app) as adm_cli:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(yk_handler))
        assert client.get("/refunds").status_code == 200
        assert "POST /v3/refunds" in client.get("/refunds").text

        assert client.post("/api/auth/register", json={"username": "stu_dir", "password": "secret123"}).status_code == 200
        iid = client.post(
            "/api/payments/topup",
            json={"amount": 2000, "method": "card", "receiptEmail": "dir@ege.ru"},
        ).json()["intent"]["id"]
        assert client.get(f"/api/payments/intents/{iid}").json()["creditedNow"] is True

        # Админ инициирует прямой частичный возврат 600 ₽ прямо из платежа
        adm_hdr = {"X-Admin-Token": admin_secret}
        r_dir = adm_cli.post(
            f"/api/admin/payments/{iid}/refund",
            headers=adm_hdr,
            json={"amount": 600, "reason": "Частичный возврат по заявке"},
        )
        assert r_dir.status_code == 200
        rf = r_dir.json()["refund"]
        assert rf["status"] == "pending"
        assert rf["amountRub"] == 600
        assert client.get("/api/wallet").json()["wallet"]["balanceRub"] == 1400

        # Фоновый планировщик сверяет pending-возврат и переводит в succeeded
        ten_min_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).strftime("%Y-%m-%dT%H:%M:%SZ")
        app.state.db._conn.execute("UPDATE payment_refunds SET created_at = ? WHERE id = ?", (ten_min_ago, rf["id"]))
        app.state.db._conn.commit()

        yk_client = YooKassaClient(settings.payments, http_getter=lambda: app.state.http)
        sched = BackgroundScheduler(
            settings=Settings(db_path=settings.db_path, scheduler=SchedulerConfig(), payments=settings.payments),
            db=app.state.db,
            realtime=RealtimeBroker(),
            yookassa=yk_client,
        )
        tick = asyncio.run(sched.run_once())
        assert tick["refundsSynced"] == 1

        pi_after = adm_cli.get("/api/admin/payments", headers=adm_hdr).json()["payments"][0]
        assert pi_after["refundedRub"] == 600
        assert pi_after["refundableRub"] == 1400
