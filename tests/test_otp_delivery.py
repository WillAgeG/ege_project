"""Тесты реальной доставки OTP через Telegram Gateway, WhatsApp Business API и SMS-шлюзы."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.api import create_api_app
from backend.config import OtpDeliveryConfig, Settings, TelegramAuthConfig


def _install_mock_http(app, handler) -> None:
    transport = httpx.MockTransport(handler)

    async def _swap() -> None:
        old = getattr(app.state, "http", None)
        if old is not None:
            await old.aclose()
        app.state.http = httpx.AsyncClient(transport=transport, timeout=httpx.Timeout(10.0))

    # Заменяем app.state.http прямо после входа в lifespan контекста TestClient
    app.state._custom_otp_transport = transport


def _make_otp_app(
    tmp_path: Path,
    name: str,
    *,
    otp: OtpDeliveryConfig,
    telegram: TelegramAuthConfig = TelegramAuthConfig(None, None),
    admin_token: str = "adm-otp-secret",
):
    return create_api_app(
        Settings(
            db_path=tmp_path / f"{name}.db",
            env="production",
            dev_demo_mode=False,
            admin_require_auth=True,
            admin_api_token=admin_token,
            telegram=telegram,
            otp=otp,
        )
    )


def _set_transport(app, handler) -> httpx.AsyncClient:
    client = httpx.AsyncClient(transport=httpx.MockTransport(handler), timeout=httpx.Timeout(10.0))
    app.state.http = client
    return client


def test_telegram_gateway_delivers_to_unlinked_phone_and_logs_in(tmp_path: Path) -> None:
    calls: list[dict[str, Any]] = []

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        calls.append({"url": str(request.url), "auth": request.headers.get("authorization"), "body": body})
        return httpx.Response(200, json={"ok": True, "result": {"request_id": "tgw-req-901"}})

    app = _make_otp_app(
        tmp_path,
        "tg_gw",
        otp=OtpDeliveryConfig(
            telegram_gateway_token="tgw-secret-tok",
            telegram_gateway_sender_username="VektorEge",
            telegram_gateway_ttl_sec=240,
        ),
    )
    with TestClient(app) as tc:
        _set_transport(app, handler)
        r_me = tc.get("/api/me").json()
        assert r_me["otpChannels"]["telegramGatewayLive"] is True

        r_send = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-11-22", "country": "RU", "channel": "tg", "mode": "login"},
        )
        assert r_send.status_code == 200, r_send.text
        data = r_send.json()
        assert data["delivered"] is True
        assert data["deliveredViaBot"] is False
        assert data["deliveredChannel"] == "tg"
        assert data["deliveryProvider"] == "telegram_gateway"
        assert data["externalId"] == "tgw-req-901"
        assert data["fallbackUsed"] is False
        assert "demoCode" not in data

        assert len(calls) == 1
        assert calls[0]["url"] == "https://gatewayapi.telegram.org/sendVerificationMessage"
        assert calls[0]["auth"] == "Bearer tgw-secret-tok"
        assert calls[0]["body"]["phone_number"] == "+79142101122"
        assert calls[0]["body"]["sender_username"] == "VektorEge"
        code = calls[0]["body"]["code"]
        assert len(code) == 4 and code.isdigit()

        r_ver = tc.post(
            "/api/auth/phone/verify",
            json={
                "phone": "+7 (914) 210-11-22",
                "country": "RU",
                "channel": "tg",
                "code": code,
                "role": "student",
                "authProvider": "telegram",
            },
        )
        assert r_ver.status_code == 200, r_ver.text
        assert r_ver.json()["user"]["authProvider"] == "telegram"


def test_linked_telegram_bot_takes_priority_over_gateway(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    gw_calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        gw_calls.append(str(request.url))
        return httpx.Response(200, json={"ok": True, "result": {"request_id": "unexpected"}})

    async def _bot_send(_self, _digits: str, _code: str) -> bool:
        return True

    monkeypatch.setattr("backend.telegram_bot.TelegramBotService.send_otp_by_phone", _bot_send)
    app = _make_otp_app(
        tmp_path,
        "tg_prio",
        telegram=TelegramAuthConfig(bot_token="123456:BOTTOK", bot_username="vektor_test_bot"),
        otp=OtpDeliveryConfig(telegram_gateway_token="tgw-secret-tok"),
    )
    with TestClient(app) as tc:
        _set_transport(app, handler)
        r_send = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-33-44", "country": "RU", "channel": "tg"},
        )
        assert r_send.status_code == 200
        j = r_send.json()
        assert j["delivered"] is True
        assert j["deliveredViaBot"] is True
        assert j["deliveryProvider"] == "telegram_bot"
        assert gw_calls == []


def test_whatsapp_cloud_template_text_and_webhook(tmp_path: Path) -> None:
    calls: list[dict[str, Any]] = []

    def cloud_handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8"))
        calls.append({"url": str(request.url), "auth": request.headers.get("authorization"), "body": body})
        return httpx.Response(200, json={"messaging_product": "whatsapp", "messages": [{"id": "wamid.HBgM123"}]})

    app_cloud = _make_otp_app(
        tmp_path,
        "wa_cloud",
        otp=OtpDeliveryConfig(
            whatsapp_provider="cloud",
            whatsapp_phone_number_id="555000111",
            whatsapp_access_token="waba-token-xyz",
            whatsapp_template_name="otp_auth_ru",
            whatsapp_template_lang="ru",
            whatsapp_use_template=True,
        ),
    )
    with TestClient(app_cloud) as tc:
        _set_transport(app_cloud, cloud_handler)
        r_send = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-55-66", "country": "RU", "channel": "wa"},
        )
        assert r_send.status_code == 200
        j = r_send.json()
        assert j["delivered"] is True
        assert j["deliveredChannel"] == "wa"
        assert j["deliveryProvider"] == "whatsapp_cloud"
        assert j["externalId"] == "wamid.HBgM123"
        assert calls[0]["url"] == "https://graph.facebook.com/v21.0/555000111/messages"
        assert calls[0]["body"]["type"] == "template"
        assert calls[0]["body"]["template"]["name"] == "otp_auth_ru"
        otp_code = calls[0]["body"]["template"]["components"][0]["parameters"][0]["text"]
        assert tc.post(
            "/api/auth/phone/verify",
            json={"phone": "+7 (914) 210-55-66", "country": "RU", "channel": "wa", "code": otp_code},
        ).status_code == 200

    # Проверяем WHATSAPP_PROVIDER=webhook
    wh_calls: list[dict[str, Any]] = []

    def wh_handler(request: httpx.Request) -> httpx.Response:
        wh_calls.append(json.loads(request.content.decode("utf-8")))
        return httpx.Response(200, json={"ok": True, "id": "wh-msg-7"})

    app_wh = _make_otp_app(
        tmp_path,
        "wa_wh",
        otp=OtpDeliveryConfig(
            whatsapp_provider="webhook",
            whatsapp_webhook_url="https://bsp.example.ru/wa/send",
            whatsapp_webhook_token="bsp-secret",
        ),
    )
    with TestClient(app_wh) as tc_wh:
        _set_transport(app_wh, wh_handler)
        r_wh = tc_wh.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-77-88", "country": "RU", "channel": "wa"},
        )
        assert r_wh.status_code == 200
        assert r_wh.json()["deliveryProvider"] == "whatsapp_webhook"
        assert wh_calls[0]["channel"] == "wa"
        assert len(wh_calls[0]["code"]) == 4


def test_sms_ru_smsc_and_automatic_fallback_from_messengers(tmp_path: Path) -> None:
    calls: list[dict[str, Any]] = []

    def smsru_handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "gatewayapi.telegram.org" in url:
            return httpx.Response(400, json={"ok": False, "error": "PHONE_NUMBER_NOT_FOUND"})
        if "graph.facebook.com" in url:
            return httpx.Response(502, json={"error": {"code": 131026, "message": "not on whatsapp"}})
        form = {k: v[0] for k, v in parse_qs(request.content.decode("utf-8")).items()}
        calls.append({"url": url, "form": form})
        to_num = form["to"]
        return httpx.Response(
            200,
            json={"status": "OK", "status_code": 100, "sms": {to_num: {"status": "OK", "sms_id": "smsru-42"}}},
        )

    app_fb = _make_otp_app(
        tmp_path,
        "sms_fb",
        otp=OtpDeliveryConfig(
            telegram_gateway_token="tgw-tok",
            whatsapp_provider="cloud",
            whatsapp_phone_number_id="555000",
            whatsapp_access_token="wa-tok",
            sms_provider="sms_ru",
            sms_ru_api_id="smsru-api-key",
            sms_sender="VektorEGE",
            sms_fallback_enabled=True,
        ),
    )
    with TestClient(app_fb) as tc:
        _set_transport(app_fb, smsru_handler)

        # 1) WhatsApp упал -> авто-фоллбэк в SMS.ru
        r_wa_fb = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-12-34", "country": "RU", "channel": "wa"},
        )
        assert r_wa_fb.status_code == 200
        j1 = r_wa_fb.json()
        assert j1["channel"] == "wa"
        assert j1["delivered"] is True
        assert j1["deliveredChannel"] == "sms"
        assert j1["deliveryProvider"] == "sms_ru"
        assert j1["fallbackUsed"] is True
        assert j1["externalId"] == "smsru-42"

        # 2) Telegram Gateway вернул PHONE_NUMBER_NOT_FOUND -> авто-фоллбэк в SMS.ru
        r_tg_fb = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-12-35", "country": "RU", "channel": "tg"},
        )
        assert r_tg_fb.status_code == 200
        j2 = r_tg_fb.json()
        assert j2["delivered"] is True
        assert j2["deliveredChannel"] == "sms"
        assert j2["fallbackUsed"] is True

        # 3) Явный channel="sms" напрямую + verify с channel="sms"
        r_sms = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-12-36", "country": "RU", "channel": "sms"},
        )
        assert r_sms.status_code == 200
        j3 = r_sms.json()
        assert j3["channel"] == "sms"
        assert j3["channelName"] == "SMS"
        assert j3["deliveredChannel"] == "sms"
        assert j3["fallbackUsed"] is False

        last_msg = calls[-1]["form"]["msg"]
        sms_code = "".join(ch for ch in last_msg if ch.isdigit())[:4]
        assert len(sms_code) == 4
        r_ver = tc.post(
            "/api/auth/phone/verify",
            json={"phone": "+7 (914) 210-12-36", "country": "RU", "channel": "sms", "code": sms_code},
        )
        assert r_ver.status_code == 200
        assert r_ver.json()["channel"] == "sms"

        # Проверяем метрики и отсутствие секретов в /api/admin/ops
        r_ops = tc.get("/api/admin/ops", headers={"X-Admin-Token": "adm-otp-secret"})
        assert r_ops.status_code == 200
        ops_raw = r_ops.text
        assert "smsru-api-key" not in ops_raw
        assert "wa-tok" not in ops_raw
        assert "tgw-tok" not in ops_raw
        od = r_ops.json()["otpDelivery"]
        assert od["telegramGatewayConfigured"] is True
        assert od["whatsappProvider"] == "cloud"
        assert od["smsProvider"] == "sms_ru"
        assert od["sentTotal"] == 3
        assert od["fallbackTotal"] == 2

    # SMSC.ru проверка
    def smsc_handler(request: httpx.Request) -> httpx.Response:
        form = {k: v[0] for k, v in parse_qs(request.content.decode("utf-8")).items()}
        assert form["login"] == "smsc_u"
        assert form["phones"] == "+79142109900"
        return httpx.Response(200, json={"id": 88412, "cnt": 1})

    app_smsc = _make_otp_app(
        tmp_path,
        "smsc",
        otp=OtpDeliveryConfig(sms_provider="smsc", smsc_login="smsc_u", smsc_password="smsc_p"),
    )
    with TestClient(app_smsc) as tc_s:
        _set_transport(app_smsc, smsc_handler)
        r_smsc = tc_s.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-99-00", "country": "RU", "channel": "sms"},
        )
        assert r_smsc.status_code == 200
        assert r_smsc.json()["deliveryProvider"] == "smsc"
        assert r_smsc.json()["externalId"] == "88412"


def test_require_delivery_returns_503_when_no_provider_succeeds(tmp_path: Path) -> None:
    app = _make_otp_app(
        tmp_path,
        "strict_otp",
        otp=OtpDeliveryConfig(require_delivery=True),
    )
    with TestClient(app) as tc:
        r = tc.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-44-55", "country": "RU", "channel": "wa"},
        )
        assert r.status_code == 503
        assert r.json()["detail"]["code"] == "otp_delivery_unavailable"
