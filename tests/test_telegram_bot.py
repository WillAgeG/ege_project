"""Тесты Telegram-бота, webhook-команд, OTP-доставки, Login Widget и пушей по заявкам."""

import hashlib
import hmac
import json
from pathlib import Path
import re
import time

from fastapi.testclient import TestClient
import httpx

from backend.config import AIConfig, GoogleOAuthConfig, Settings, TelegramAuthConfig
from backend.main import create_app


def _make_tg_settings(
    tmp_path: Path,
    *,
    dev_demo_mode: bool = True,
    bot_username: str = "vektor_ege_bot",
    bot_token: str = "123456:TESTTOKEN",
    webhook_secret: str = "wh-secret-42",
    admin_chat_id: str = "",
) -> Settings:
    return Settings(
        db_path=tmp_path / "tg_test.db",
        env="production" if not dev_demo_mode else "development",
        dev_demo_mode=dev_demo_mode,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        telegram=TelegramAuthConfig(
            bot_username=bot_username,
            bot_token=bot_token,
            webhook_secret=webhook_secret,
            admin_chat_id=admin_chat_id or None,
        ),
        public_base_url="https://vektor-ege.example.com",
    )


def _install_mock_tg_http(app, recorded: list[tuple[str, dict]]) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        method = request.url.path.rsplit("/", 1)[-1]
        try:
            body = json.loads(request.content.decode("utf-8") or "{}")
        except Exception:
            body = {}
        recorded.append((method, body))
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(recorded), "text": body.get("text", "")}})

    old_http = app.state.http
    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    return old_http


def _sign_login_widget(payload: dict, bot_token: str) -> dict:
    pairs = [f"{k}={payload[k]}" for k in sorted(payload.keys()) if payload[k] not in (None, "")]
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    sig = hmac.new(secret_key, "\n".join(pairs).encode("utf-8"), hashlib.sha256).hexdigest()
    return {**payload, "hash": sig}


def test_telegram_link_token_and_webhook_commands(tmp_path: Path) -> None:
    app = create_app(_make_tg_settings(tmp_path / "commands"))
    sent_calls: list[tuple[str, dict]] = []
    with TestClient(app) as client:
        _install_mock_tg_http(app, sent_calls)

        # Регистрируем ученика и запрашиваем deep-link токен
        assert client.post(
            "/api/auth/register",
            json={"username": "tg_stu", "password": "secret123", "displayName": "Айана Т."},
        ).status_code == 200
        st0 = client.get("/api/telegram/status").json()
        assert st0["linked"] is False and st0["botUsername"] == "vektor_ege_bot"

        r_tok = client.post("/api/telegram/link-token")
        assert r_tok.status_code == 200
        tok_data = r_tok.json()
        token = tok_data["token"]
        assert tok_data["deepLink"] == f"https://t.me/vektor_ege_bot?start=link_{token}"

        # Неверный секрет webhook -> 403
        r_bad_sec = client.post(
            "/api/telegram/webhook",
            headers={"X-Telegram-Bot-Api-Secret-Token": "wrong"},
            json={"update_id": 1, "message": {"chat": {"id": 5001}, "text": "/start"}},
        )
        assert r_bad_sec.status_code == 403

        hdr = {"X-Telegram-Bot-Api-Secret-Token": "wh-secret-42"}
        # Привязываем чат командой /start link_<token>
        r_start = client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={
                "update_id": 2,
                "message": {
                    "chat": {"id": 5001, "type": "private", "first_name": "Айана"},
                    "from": {"id": 5001, "username": "ayana_ege", "first_name": "Айана"},
                    "text": f"/start link_{token}",
                },
            },
        )
        assert r_start.status_code == 200
        assert r_start.json()["kind"] == "start_link_ok"

        st1 = client.get("/api/telegram/status").json()
        assert st1["linked"] is True
        assert st1["binding"]["chatId"] == "5001"
        assert st1["binding"]["telegramUsername"] == "ayana_ege"

        # /tutors, /balance, /notify + callback tg:notify:off, /help, /unlink
        for uid_num, cmd_text in ((3, "/tutors"), (4, "/balance"), (5, "/notify"), (6, "/help")):
            r_cmd = client.post(
                "/api/telegram/webhook",
                headers=hdr,
                json={"update_id": uid_num, "message": {"chat": {"id": 5001}, "from": {"id": 5001}, "text": cmd_text}},
            )
            assert r_cmd.status_code == 200

        r_cb_off = client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={
                "update_id": 7,
                "callback_query": {
                    "id": "cb-off-1",
                    "from": {"id": 5001},
                    "message": {"message_id": 99, "chat": {"id": 5001}},
                    "data": "tg:notify:off",
                },
            },
        )
        assert r_cb_off.status_code == 200
        assert client.get("/api/telegram/status").json()["binding"]["notificationsEnabled"] is False

        r_unlink = client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={"update_id": 8, "message": {"chat": {"id": 5001}, "from": {"id": 5001}, "text": "/unlink"}},
        )
        assert r_unlink.status_code == 200 and r_unlink.json()["unlinked"] is True
        assert client.get("/api/telegram/status").json()["linked"] is False
        assert any(m == "sendMessage" and "Telegram привязан" in p["text"] for m, p in sent_calls)
        assert any(m == "editMessageText" and "выключены" in p["text"] for m, p in sent_calls)


def test_telegram_contact_share_and_real_otp_delivery(tmp_path: Path) -> None:
    app = create_app(_make_tg_settings(tmp_path / "otp_bot", dev_demo_mode=False))
    sent_calls: list[tuple[str, dict]] = []
    with TestClient(app) as client:
        _install_mock_tg_http(app, sent_calls)
        hdr = {"X-Telegram-Bot-Api-Secret-Token": "wh-secret-42"}

        # Пользователь делится контактом в Telegram
        r_contact = client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={
                "update_id": 10,
                "message": {
                    "chat": {"id": 7701, "type": "private", "first_name": "Тимур"},
                    "from": {"id": 7701, "username": "timur_ege", "first_name": "Тимур"},
                    "contact": {"phone_number": "8 (914) 210-05-88", "user_id": 7701},
                },
            },
        )
        assert r_contact.status_code == 200
        assert r_contact.json()["binding"]["phoneDigits"] == "79142100588"

        # Запрашиваем OTP по телефону через канал Telegram в prod-режиме (без demoCode в HTTP-ответе)
        r_send = client.post(
            "/api/auth/phone/send",
            json={"phone": "+7 (914) 210-05-88", "country": "RU", "channel": "tg", "mode": "login"},
        )
        assert r_send.status_code == 200
        send_json = r_send.json()
        assert send_json["deliveredViaBot"] is True
        assert "demoCode" not in send_json

        otp_msgs = [p["text"] for m, p in sent_calls if m == "sendMessage" and str(p["chat_id"]) == "7701" and "Код подтверждения" in p["text"]]
        assert len(otp_msgs) == 1
        match = re.search(r"<code>(\d{4})</code>", otp_msgs[0])
        assert match is not None
        delivered_code = match.group(1)
        assert delivered_code not in ("4829", "7391")

        # Вводим код, пришедший в бота -> успешный вход
        r_ver = client.post(
            "/api/auth/phone/verify",
            json={
                "phone": "+7 (914) 210-05-88",
                "country": "RU",
                "channel": "tg",
                "code": delivered_code,
                "authProvider": "telegram",
            },
        )
        assert r_ver.status_code == 200
        assert "pvm_session" in client.cookies


def test_telegram_booking_push_and_inline_accept(tmp_path: Path) -> None:
    app = create_app(_make_tg_settings(tmp_path / "booking_push", dev_demo_mode=False))
    sent_calls: list[tuple[str, dict]] = []
    hdr = {"X-Telegram-Bot-Api-Secret-Token": "wh-secret-42"}

    with TestClient(app) as client:
        _install_mock_tg_http(app, sent_calls)

        # 1. Преподаватель регистрируется, создаёт анкету и привязывает чат 9001
        assert client.post(
            "/api/auth/register",
            json={"username": "tut_tg_owner", "password": "secret123", "displayName": "Анна С.", "role": "tutor"},
        ).status_code == 200
        tut_session = client.cookies.get("pvm_session")
        r_prof = client.put(
            "/api/tutor/profile",
            json={
                "name": "Анна Соколова (ТГ)",
                "subject": "eng",
                "subjectName": "Английский язык",
                "city": "Якутск",
                "timezone": "UTC+9",
                "price": 1200,
                "telegram": "@anna_sokolova_ege",
            },
        )
        assert r_prof.status_code == 200
        tutor_id = r_prof.json()["tutor"]["id"]

        tut_tok = client.post("/api/telegram/link-token").json()["token"]
        assert client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={
                "update_id": 20,
                "message": {
                    "chat": {"id": 9001},
                    "from": {"id": 9001, "username": "anna_sokolova_ege", "first_name": "Анна"},
                    "text": f"/start link_{tut_tok}",
                },
            },
        ).status_code == 200

        # 2. Переключаемся на сессию ученика: регистрируемся, привязываем чат 9002 и предлагаем ставку
        client.cookies.clear()
        assert client.post(
            "/api/auth/register",
            json={"username": "stu_tg_bid", "password": "secret123", "displayName": "Миша П."},
        ).status_code == 200
        stu_session = client.cookies.get("pvm_session")
        stu_tok = client.post("/api/telegram/link-token").json()["token"]
        assert client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={
                "update_id": 21,
                "message": {
                    "chat": {"id": 9002},
                    "from": {"id": 9002, "username": "misha_ege", "first_name": "Миша"},
                    "text": f"/start link_{stu_tok}",
                },
            },
        ).status_code == 200

        stu_uid = client.get("/api/me").json()["user"]["id"]
        app.state.db.topup_wallet(stu_uid, amount_rub=5000, method="sbp")
        r_bk = client.post(
            "/api/bookings",
            json={
                "tutorId": tutor_id,
                "tutorName": "Анна Соколова (ТГ)",
                "subject": "eng",
                "subjectName": "Английский язык",
                "dayIso": "2026-11-28",
                "hour": "18:00",
                "offerPrice": 1200,
                "note": "Нужен разбор эссе",
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]

        # Преподаватель получил пуш с inline-кнопками
        tut_pushes = [p for m, p in sent_calls if m == "sendMessage" and str(p["chat_id"]) == "9001" and "Новая ставка от ученика" in p["text"]]
        assert len(tut_pushes) == 1
        assert tut_pushes[0]["reply_markup"]["inline_keyboard"][0][0]["callback_data"] == f"bk:accept:{booking_id}"

        # 3. Преподаватель нажимает «Подтвердить» прямо в боте (webhook без куки)
        client.cookies.clear()
        r_accept_cb = client.post(
            "/api/telegram/webhook",
            headers=hdr,
            json={
                "update_id": 22,
                "callback_query": {
                    "id": "cb-acc-1",
                    "from": {"id": 9001},
                    "message": {"message_id": 333, "chat": {"id": 9001}},
                    "data": f"bk:accept:{booking_id}",
                },
            },
        )
        assert r_accept_cb.status_code == 200 and r_accept_cb.json()["kind"] == "cb_accept"

        # Заявка стала accepted в БД, а ученик получил пуш со ссылкой Телемост
        client.cookies.set("pvm_session", stu_session)
        bookings = client.get("/api/bookings").json()["bookings"]
        assert any(b["id"] == booking_id and b["status"] == "accepted" for b in bookings)
        client.cookies.set("pvm_session", tut_session)
        assert any(b["id"] == booking_id and b["status"] == "accepted" for b in client.get("/api/bookings?scope=tutor").json()["bookings"])
        stu_pushes = [p for m, p in sent_calls if m == "sendMessage" and str(p["chat_id"]) == "9002" and "подтвердил занятие" in p["text"]]
        assert len(stu_pushes) == 1 and "telemost.yandex" in stu_pushes[0]["text"]


def test_telegram_login_widget_hmac_and_152fz(tmp_path: Path) -> None:
    app = create_app(_make_tg_settings(tmp_path / "login_widget", bot_token="123456:TESTTOKEN"))
    with TestClient(app) as client:
        valid_payload = _sign_login_widget(
            {
                "id": 884422,
                "first_name": "Айтал",
                "username": "aytal_tg",
                "auth_date": int(time.time()),
            },
            "123456:TESTTOKEN",
        )
        r_bad = client.post("/api/auth/telegram/login", json={**valid_payload, "hash": "0" * 64})
        assert r_bad.status_code == 403

        r_old = client.post(
            "/api/auth/telegram/login",
            json=_sign_login_widget({"id": 884422, "first_name": "Айтал", "auth_date": int(time.time()) - 200000}, "123456:TESTTOKEN"),
        )
        assert r_old.status_code == 400

        r_ok = client.post("/api/auth/telegram/login", json=valid_payload)
        assert r_ok.status_code == 200
        assert r_ok.json()["user"]["authProvider"] == "telegram"
        assert "pvm_session" in client.cookies

        # 152-ФЗ экспорт включает telegramBinding, а удаление удаляет привязку
        exp = client.get("/api/me/export").json()
        assert exp["telegramBinding"] is not None
        assert exp["telegramBinding"]["telegramUsername"] == "aytal_tg"

        assert client.delete("/api/me").status_code == 200
        assert app.state.db.get_telegram_binding_by_chat("884422") is None


def test_telegram_login_callback_redirect_and_role(tmp_path: Path) -> None:
    app = create_app(_make_tg_settings(tmp_path / "tg_callback", bot_token="123456:TESTTOKEN"))
    with TestClient(app) as client:
        signed_tutor = _sign_login_widget(
            {
                "id": 995511,
                "first_name": "Марина",
                "username": "marina_ege",
                "auth_date": int(time.time()),
            },
            "123456:TESTTOKEN",
        )
        # 1. Валидный GET callback с role=tutor & next=/tutor#tutor-profile
        r_ok = client.get(
            "/api/auth/telegram/callback",
            params={**signed_tutor, "role": "tutor", "next": "/tutor#tutor-profile"},
            follow_redirects=False,
        )
        assert r_ok.status_code == 302
        assert r_ok.headers["location"] == "/tutor#tutor-profile"
        assert "pvm_session" in client.cookies
        me_u = client.get("/api/me").json()["user"]
        assert me_u["role"] == "tutor"
        assert me_u["authProvider"] == "telegram"
        assert client.get("/api/telegram/status").json()["linked"] is True

        # 2. Открытый редирект сбрасывается на /tutor (для tutor) и неверная подпись / просрочка редиректят с auth_error
        r_open = client.get(
            "/api/auth/telegram/callback",
            params={**signed_tutor, "role": "tutor", "next": "https://evil.com/steal"},
            follow_redirects=False,
        )
        assert r_open.status_code == 302
        assert r_open.headers["location"] == "/tutor"

        r_bad = client.get(
            "/api/auth/telegram/callback",
            params={**signed_tutor, "hash": "0" * 64, "role": "tutor", "next": "/tutor"},
            follow_redirects=False,
        )
        assert r_bad.status_code == 302
        assert r_bad.headers["location"] == "/tutor?auth_error=telegram_invalid"

        old_signed = _sign_login_widget(
            {"id": 995511, "first_name": "Марина", "auth_date": int(time.time()) - 200000},
            "123456:TESTTOKEN",
        )
        r_exp = client.get(
            "/api/auth/telegram/callback",
            params={**old_signed, "role": "tutor"},
            follow_redirects=False,
        )
        assert r_exp.status_code == 302
        assert r_exp.headers["location"] == "/tutor?auth_error=telegram_expired"
