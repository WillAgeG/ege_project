"""Тесты REST API и прав доступа мини-мессенджера (/api/chats/*)."""

from __future__ import annotations

import base64
from datetime import datetime, timedelta, timezone
from functools import partial
import json
from pathlib import Path
import sqlite3

from fastapi.testclient import TestClient
import httpx

from backend.config import AIConfig, GoogleOAuthConfig, MediaConfig, OtpDeliveryConfig, SchedulerConfig, Settings, TelegramAuthConfig
from backend.main import create_app
from backend.otp_delivery import OtpDeliveryService


def _make_settings(tmp_path: Path, name: str = "chat_test.db", *, max_chat_bytes: int = 20 * 1024 * 1024) -> Settings:
    return Settings(
        db_path=tmp_path / name,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        telegram=TelegramAuthConfig(),
        media=MediaConfig(local_dir=tmp_path / "media", max_chat_bytes=max_chat_bytes),
    )


def test_chat_booking_flow_unread_realtime_and_isolation(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with (
        TestClient(app) as c_anon,
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        # 1. Без авторизации /api/chats отдаёт 401
        assert c_anon.get("/api/chats").status_code == 401

        # 2. Регистрируем преподавателя, ученика и стороннего пользователя
        r_tut_reg = c_tut.post(
            "/api/auth/register",
            json={"username": "tut_chat", "password": "secret123", "displayName": "Анна Соколова", "role": "tutor"},
        )
        assert r_tut_reg.status_code == 200
        r_prof = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Анна Соколова",
                "headline": "Эксперт ЕГЭ по биологии",
                "subject": "bio",
                "subjectName": "Биология",
                "subjects": ["bio"],
                "city": "Москва",
                "timezone": "UTC+3",
                "price": 1400,
                "slots": {"3": ["18:00"]},
            },
        )
        assert r_prof.status_code == 200
        tutor_slug = r_prof.json()["tutor"]["id"]

        r_stu_reg = c_stu.post(
            "/api/auth/register",
            json={"username": "stu_chat", "password": "secret123", "displayName": "Иван Петров"},
        )
        assert r_stu_reg.status_code == 200
        stu_uid = r_stu_reg.json()["user"]["id"]

        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_user", "password": "secret123", "displayName": "Посторонний"},
        ).status_code == 200

        # 3. Ученик пополняет баланс и создаёт заявку -> диалог сразу виден обоим
        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Анна Соколова",
                "subjectName": "Биология",
                "offerPrice": 1400,
                "hour": "18:00",
                "dayIso": "2026-11-25",
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]
        thread_id = f"booking:{booking_id}"

        stu_list = c_stu.get("/api/chats")
        assert stu_list.status_code == 200
        stu_threads = stu_list.json()["threads"]
        bk_thread = next(t for t in stu_threads if t["threadId"] == thread_id)
        assert bk_thread["unreadCount"] == 0
        assert bk_thread["escrowStatus"] == "frozen"
        assert bk_thread["reservedRub"] == 1400
        assert bk_thread["slotDate"] == "2026-11-25"
        assert bk_thread["hour"] == "18:00"

        tut_list = c_tut.get("/api/chats")
        assert tut_list.status_code == 200
        tut_threads = tut_list.json()["threads"]
        assert any(t["threadId"] == thread_id and t["unreadCount"] == 0 for t in tut_threads)

        # 4. Ученик пишет сообщение -> история, unread у преподавателя = 1, realtime event
        r_send_stu = c_stu.post(
            f"/api/chats/{thread_id}/messages",
            json={"body": "Здравствуйте! Когда удобно провести вводный урок?", "bookingId": booking_id, "tutorId": tutor_slug},
        )
        assert r_send_stu.status_code == 200
        msg1 = r_send_stu.json()["message"]
        assert msg1["senderRole"] == "student"
        assert msg1["readByStudent"] is True
        assert msg1["readByTutor"] is False

        r_hist_tut = c_tut.get(f"/api/chats/{thread_id}/messages")
        assert r_hist_tut.status_code == 200
        assert [m["body"] for m in r_hist_tut.json()["messages"]] == [msg1["body"]]

        tut_after_stu = c_tut.get("/api/chats").json()
        assert tut_after_stu["unreadTotal"] == 1
        assert next(t for t in tut_after_stu["threads"] if t["threadId"] == thread_id)["unreadCount"] == 1
        assert c_stu.get("/api/chats").json()["unreadTotal"] == 0

        rt_events = c_tut.get("/api/realtime/recent", params={"channel": "tutor", "tutor_slug": tutor_slug}).json()["events"]
        chat_evts = [e for e in rt_events if e["eventType"] == "chat.message"]
        assert len(chat_evts) >= 1
        assert chat_evts[-1]["payload"]["threadId"] == thread_id
        assert chat_evts[-1]["payload"]["message"]["body"] == msg1["body"]

        # 5. Преподаватель отмечает диалог прочитанным -> unreadTotal = 0
        r_read_tut = c_tut.post(f"/api/chats/{thread_id}/read")
        assert r_read_tut.status_code == 200
        assert r_read_tut.json()["updated"] == 1
        assert c_tut.get("/api/chats").json()["unreadTotal"] == 0

        # 6. Преподаватель отвечает -> у ученика unreadCount = 1
        r_send_tut = c_tut.post(
            f"/api/chats/{thread_id}/messages",
            json={"body": "Добрый день! Давайте в среду в 18:00.", "role": "tutor"},
        )
        assert r_send_tut.status_code == 200
        msg2 = r_send_tut.json()["message"]
        assert msg2["senderRole"] == "tutor"

        stu_after_tut = c_stu.get("/api/chats").json()
        assert stu_after_tut["unreadTotal"] == 1
        assert next(t for t in stu_after_tut["threads"] if t["threadId"] == thread_id)["unreadCount"] == 1

        r_hist_stu = c_stu.get(f"/api/chats/{thread_id}/messages")
        assert r_hist_stu.status_code == 200
        assert [m["body"] for m in r_hist_stu.json()["messages"]] == [msg1["body"], msg2["body"]]

        assert c_stu.post(f"/api/chats/{thread_id}/read").status_code == 200
        assert c_stu.get("/api/chats").json()["unreadTotal"] == 0

        # 7. Посторонний пользователь получает 403 при попытке чтения/отправки/отметки
        assert c_other.get(f"/api/chats/{thread_id}/messages").status_code == 403
        assert c_other.post(f"/api/chats/{thread_id}/messages", json={"body": "чужой"}).status_code == 403
        assert c_other.post(f"/api/chats/{thread_id}/read").status_code == 403

        # 8. Прямой диалог tutor:{id}:u:{uid} без заявки тоже доступен участникам и закрыт третьему лицу
        direct_tid = f"tutor:{tutor_slug}:u:{stu_uid}"
        r_dir = c_stu.post(f"/api/chats/{direct_tid}/messages", json={"body": "Вопрос до заявки", "tutorId": tutor_slug})
        assert r_dir.status_code == 200
        assert c_tut.get(f"/api/chats/{direct_tid}/messages").json()["messages"][0]["body"] == "Вопрос до заявки"
        assert c_other.get(f"/api/chats/{direct_tid}/messages").status_code == 403


def test_chat_attachments_photos_files_limits_and_access_control(tmp_path: Path) -> None:
    png_bytes = base64.b64decode(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    )
    pdf_bytes = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"
    app = create_app(_make_settings(tmp_path, "chat_media.db", max_chat_bytes=2048))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_media", "password": "secret123", "displayName": "Ольга", "role": "tutor"},
        ).status_code == 200
        r_prof = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Ольга Смирнова",
                "headline": "ЕГЭ по химии",
                "subject": "chem",
                "subjectName": "Химия",
                "subjects": ["chem"],
                "city": "Москва",
                "timezone": "UTC+3",
                "price": 1500,
                "slots": {"4": ["19:00"]},
            },
        )
        assert r_prof.status_code == 200
        tutor_slug = r_prof.json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_media", "password": "secret123", "displayName": "Мария"},
        ).status_code == 200
        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_media", "password": "secret123", "displayName": "Чужой"},
        ).status_code == 200

        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Ольга Смирнова",
                "subjectName": "Химия",
                "offerPrice": 1500,
                "hour": "19:00",
                "dayIso": "2026-11-26",
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]
        thread_id = f"booking:{booking_id}"

        # 1. Отправка фото без текста -> isImage=True, превью "📷 Фото", скачивание доступно участникам, 403 постороннему
        r_img = c_stu.post(
            f"/api/chats/{thread_id}/messages",
            data={"body": "", "bookingId": booking_id, "tutorId": tutor_slug},
            files=[("files", ("task.png", png_bytes, "image/png"))],
        )
        assert r_img.status_code == 200, r_img.text
        msg_img = r_img.json()["message"]
        assert msg_img["body"] == ""
        assert len(msg_img["attachments"]) == 1
        att_img = msg_img["attachments"][0]
        assert att_img["isImage"] is True
        assert att_img["contentType"] == "image/png"

        tut_threads = c_tut.get("/api/chats").json()["threads"]
        assert next(t for t in tut_threads if t["threadId"] == thread_id)["lastMessage"] == "📷 Фото"

        r_dl_stu = c_stu.get(att_img["url"])
        assert r_dl_stu.status_code == 200
        assert r_dl_stu.content == png_bytes
        assert r_dl_stu.headers.get("x-content-type-options") == "nosniff"
        assert "inline" in r_dl_stu.headers.get("content-disposition", "").lower()

        r_dl_tut = c_tut.get(att_img["url"])
        assert r_dl_tut.status_code == 200
        assert r_dl_tut.content == png_bytes

        assert c_other.get(att_img["url"]).status_code == 403

        # 2. Отправка PDF с подписью -> isImage=False, доступно участникам и закрыто третьему лицу
        r_pdf = c_tut.post(
            f"/api/chats/{thread_id}/messages",
            data={"body": "Разбор варианта", "role": "tutor"},
            files=[("files", ("variant_12.pdf", pdf_bytes, "application/pdf"))],
        )
        assert r_pdf.status_code == 200
        msg_pdf = r_pdf.json()["message"]
        assert msg_pdf["body"] == "Разбор варианта"
        att_pdf = msg_pdf["attachments"][0]
        assert att_pdf["isImage"] is False
        assert att_pdf["contentType"] == "application/pdf"
        assert c_stu.get(att_pdf["url"]).content == pdf_bytes
        assert c_other.get(att_pdf["url"]).status_code == 403

        # История диалога возвращает вложения у каждого сообщения
        hist = c_stu.get(f"/api/chats/{thread_id}/messages").json()["messages"]
        assert len(hist) == 2
        assert hist[0]["attachments"][0]["id"] == att_img["id"]
        assert hist[1]["attachments"][0]["id"] == att_pdf["id"]

        # 3. Защита от SVG/HTML (400) и превышения лимита (413)
        r_svg = c_stu.post(
            f"/api/chats/{thread_id}/messages",
            data={"body": ""},
            files=[("files", ("xss.svg", b"<svg onload=alert(1)></svg>", "image/svg+xml"))],
        )
        assert r_svg.status_code == 400
        assert r_svg.json()["code"] == "unsupported_media_type"

        r_big = c_stu.post(
            f"/api/chats/{thread_id}/messages",
            data={"body": ""},
            files=[("files", ("big.pdf", b"%PDF-1.4\n" + b"0" * 3000, "application/pdf"))],
        )
        assert r_big.status_code == 413
        assert r_big.json()["code"] == "file_too_large"


def test_chat_remind_lesson_platform_delivery_permissions_and_rate_limit(tmp_path: Path) -> None:
    db_file = tmp_path / "chat_remind.db"
    wa_calls: list[dict[str, object]] = []
    tg_calls: list[dict[str, object]] = []

    class _MockTelegram:
        async def notify_student_lesson_ping(self, **kwargs):
            tg_calls.append(kwargs)
            return True

    def _wa_handler(req: httpx.Request) -> httpx.Response:
        import json as _json

        wa_calls.append(_json.loads(req.content.decode("utf-8")))
        return httpx.Response(200, json={"id": "wa-msg-1"})

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(_wa_handler))
    app = create_app(_make_settings(tmp_path, "chat_remind.db"))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_rem", "password": "secret123", "displayName": "Дмитрий Волков", "role": "tutor"},
        ).status_code == 200
        r_prof = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Дмитрий Волков",
                "headline": "Физика ЕГЭ",
                "subject": "phys",
                "subjectName": "Физика",
                "subjects": ["phys"],
                "city": "Москва",
                "timezone": "UTC+3",
                "price": 2000,
                "slots": {"4": ["17:00"]},
            },
        )
        assert r_prof.status_code == 200
        tutor_slug = r_prof.json()["tutor"]["id"]

        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_tutors SET whatsapp_phone = ? WHERE id = ?", ("+7 (914) 555-77-88", tutor_slug))
        conn.commit()
        conn.close()

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_rem", "password": "secret123", "displayName": "Иван"},
        ).status_code == 200
        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_rem", "password": "secret123", "displayName": "Чужой"},
        ).status_code == 200

        assert c_stu.post("/api/wallet/topup", json={"amount": 2500, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Дмитрий Волков",
                "subjectName": "Физика",
                "offerPrice": 2000,
                "hour": "17:00",
                "dayIso": "2026-11-27",
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]
        thread_id = f"booking:{booking_id}"

        app.state.telegram = _MockTelegram()
        app.state.otp_delivery = OtpDeliveryService(
            OtpDeliveryConfig(whatsapp_webhook_url="https://wa.test/hook"),
            http_getter=lambda: mock_http,
        )

        # Посторонний получает 403
        assert c_other.post(f"/api/chats/{thread_id}/remind-lesson", json={}).status_code == 403

        # Ученик отправляет напоминание -> чат + Telegram + WhatsApp + realtime
        r_rem = c_stu.post(
            f"/api/chats/{thread_id}/remind-lesson",
            json={"slotLabel": "Пт, 27 нояб. · 17:00"},
        )
        assert r_rem.status_code == 200, r_rem.text
        rem_json = r_rem.json()
        assert "Напоминание об уроке" in rem_json["message"]["body"]
        assert "Пт, 27 нояб. · 17:00" in rem_json["message"]["body"]
        assert rem_json["notified"]["deliveredChannels"] == ["telegram", "whatsapp"]
        assert "Telegram" in rem_json["notified"]["summary"]
        assert "WhatsApp" in rem_json["notified"]["summary"]

        assert len(tg_calls) == 1
        assert tg_calls[0]["tutor_id"] == tutor_slug
        assert tg_calls[0]["student_name"] == "Иван"
        assert tg_calls[0]["slot_label"] == "Пт, 27 нояб. · 17:00"

        assert len(wa_calls) == 1
        assert wa_calls[0]["digits"] == "79145557788"
        assert wa_calls[0]["kind"] == "lesson_reminder"
        assert "Уведомление от ученика Иван через платформу Вектор" in str(wa_calls[0]["text"])

        rt_events = c_tut.get("/api/realtime/recent", params={"channel": "tutor", "tutor_slug": tutor_slug}).json()["events"]
        assert any(e["eventType"] == "lesson.reminder.student_ping" for e in rt_events)

        # Rate limit: 3 раза за 10 минут ок, 4-й -> 429
        assert c_stu.post(f"/api/chats/{thread_id}/remind-lesson", json={}).status_code == 200
        assert c_stu.post(f"/api/chats/{thread_id}/remind-lesson", json={}).status_code == 200
        assert c_stu.post(f"/api/chats/{thread_id}/remind-lesson", json={}).status_code == 429


def test_chat_realtime_privacy_and_spoof_block(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path, "chat_rt_privacy.db"))
    with (
        TestClient(app) as c_anon,
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_priv", "password": "secret123", "displayName": "Репетитор Приват", "role": "tutor"},
        ).status_code == 200
        r_prof = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Репетитор Приват", "subject": "bio", "subjectName": "Биология", "price": 1200},
        )
        assert r_prof.status_code == 200
        tutor_slug = r_prof.json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_priv", "password": "secret123", "displayName": "Ученик Приват"},
        ).status_code == 200
        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_priv", "password": "secret123", "displayName": "Посторонний"},
        ).status_code == 200

        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={"tutorId": tutor_slug, "tutorName": "Репетитор Приват", "subjectName": "Биология", "offerPrice": 1200, "hour": "18:00", "dayIso": "2026-11-28"},
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]
        thread_id = f"booking:{booking_id}"

        assert c_stu.post(
            f"/api/chats/{thread_id}/messages",
            json={"body": "Секретный вопрос по уроку", "bookingId": booking_id, "tutorId": tutor_slug},
        ).status_code == 200
        assert c_stu.post(
            f"/api/chats/{thread_id}/remind-lesson",
            json={"slotLabel": "Сб, 28 нояб. · 18:00"},
        ).status_code == 200

        # Публикация приватных eventType извне через /api/realtime/publish заблокирована (403)
        for priv_type in ("chat.message", "lesson.reminder.student_ping", "lesson.reminder.tutor_ping"):
            assert c_other.post(
                "/api/realtime/publish",
                json={"channel": "tutor", "eventType": priv_type, "title": "Spoof", "message": "x"},
            ).status_code == 403

        # Аноним получает 401, а посторонний не видит чужие события (ни приватные, ни чужие заявки)
        assert c_anon.get("/api/realtime/recent", params={"channel": "all", "limit": 50}).status_code == 401
        assert c_anon.get("/api/realtime/stream?channel=all&once=1").status_code == 401

        recent_all = c_other.get("/api/realtime/recent", params={"channel": "all", "limit": 50}).json()["events"]
        assert not any(
            str(e.get("eventType") or "").startswith(("chat.", "lesson.reminder."))
            for e in recent_all
        )
        assert not any(e.get("eventType") == "market.bid.created" for e in recent_all)

        sse_body = c_other.get("/api/realtime/stream?channel=all&once=1").text
        assert "Секретный вопрос" not in sse_body
        assert "lesson.reminder." not in sse_body

        # Репетитор и ученик видят свои приватные события
        tut_recent = c_tut.get("/api/realtime/recent", params={"channel": "tutor", "tutor_slug": tutor_slug}).json()["events"]
        assert any(
            e.get("eventType") == "chat.message" and e.get("payload", {}).get("message", {}).get("body") == "Секретный вопрос по уроку"
            for e in tut_recent
        )
        assert any(e.get("eventType") == "lesson.reminder.student_ping" for e in tut_recent)


def test_chat_remind_lesson_tutor_to_student(tmp_path: Path) -> None:
    db_file = tmp_path / "chat_remind_tutor.db"
    wa_calls: list[dict[str, object]] = []
    tg_stu_pings: list[dict[str, object]] = []
    tg_tut_pings: list[dict[str, object]] = []

    class _MockTelegramBidirectional:
        async def notify_student_lesson_ping(self, **kwargs):
            tg_stu_pings.append(kwargs)
            return True

        async def notify_tutor_lesson_ping(self, **kwargs):
            tg_tut_pings.append(kwargs)
            return True

    def _wa_handler(req: httpx.Request) -> httpx.Response:
        import json as _json

        wa_calls.append(_json.loads(req.content.decode("utf-8")))
        return httpx.Response(200, json={"id": "wa-msg-2"})

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(_wa_handler))
    app = create_app(_make_settings(tmp_path, "chat_remind_tutor.db"))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
        TestClient(app) as c_anon,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_sender", "password": "secret123", "displayName": "Мария Преподаватель", "role": "tutor"},
        ).status_code == 200
        r_prof = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Мария Преподаватель", "subject": "math", "subjectName": "Математика", "price": 1600},
        )
        assert r_prof.status_code == 200
        tutor_slug = r_prof.json()["tutor"]["id"]

        r_stu = c_stu.post(
            "/api/auth/register",
            json={"username": "stu_target", "password": "secret123", "displayName": "Артём Ученик"},
        )
        assert r_stu.status_code == 200
        stu_uid = r_stu.json()["user"]["id"]

        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_watch", "password": "secret123", "displayName": "Посторонний"},
        ).status_code == 200

        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_tutors SET whatsapp_phone = ? WHERE id = ?", ("+79140001122", tutor_slug))
        conn.execute(
            "INSERT OR IGNORE INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES ('phone', '79148889900', ?, NULL, 1)",
            (int(stu_uid),),
        )
        conn.commit()
        conn.close()

        assert c_stu.post("/api/wallet/topup", json={"amount": 3000, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={"tutorId": tutor_slug, "tutorName": "Мария Преподаватель", "subjectName": "Математика", "offerPrice": 1600, "hour": "16:00", "dayIso": "2026-11-29"},
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]
        thread_id = f"booking:{booking_id}"

        app.state.telegram = _MockTelegramBidirectional()
        app.state.otp_delivery = OtpDeliveryService(
            OtpDeliveryConfig(whatsapp_webhook_url="https://wa.test/hook"),
            http_getter=lambda: mock_http,
        )

        r_rem = c_tut.post(
            f"/api/chats/{thread_id}/remind-lesson",
            json={"slotLabel": "Вс, 29 нояб. · 16:00", "role": "tutor"},
        )
        assert r_rem.status_code == 200, r_rem.text
        rem_json = r_rem.json()
        assert rem_json["message"]["senderRole"] == "tutor"
        assert "Напоминание от преподавателя" in rem_json["message"]["body"]
        assert rem_json["notified"]["deliveredChannels"] == ["telegram", "whatsapp"]
        assert "ученику" in rem_json["notified"]["summary"]

        assert len(tg_stu_pings) == 0
        assert len(tg_tut_pings) == 1
        assert int(tg_tut_pings[0]["student_user_id"]) == int(stu_uid)
        assert len(wa_calls) == 1
        assert wa_calls[0]["digits"] == "79148889900"
        assert "Уведомление от преподавателя" in str(wa_calls[0]["text"])

        stu_rt = c_stu.get("/api/realtime/recent", params={"channel": "student"}).json()["events"]
        assert any(e["eventType"] == "lesson.reminder.tutor_ping" for e in stu_rt)
        assert c_anon.get("/api/realtime/recent", params={"channel": "all"}).status_code == 401
        out_rt = c_other.get("/api/realtime/recent", params={"channel": "all"}).json()["events"]
        assert not any(e["eventType"] == "lesson.reminder.tutor_ping" for e in out_rt)


def test_telemost_cross_tutor_isolation_and_realtime(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path, "chat_telemost_iso.db"))
    with (
        TestClient(app) as c_tut_a,
        TestClient(app) as c_tut_b,
        TestClient(app) as c_stu,
    ):
        assert c_tut_a.post(
            "/api/auth/register",
            json={"username": "tut_a_tm", "password": "secret123", "displayName": "Репетитор А", "role": "tutor"},
        ).status_code == 200
        tut_a = c_tut_a.put(
            "/api/tutor/profile",
            json={"name": "Репетитор А", "subject": "bio", "subjectName": "Биология", "price": 1000},
        ).json()["tutor"]["id"]

        assert c_tut_b.post(
            "/api/auth/register",
            json={"username": "tut_b_tm", "password": "secret123", "displayName": "Репетитор Б", "role": "tutor"},
        ).status_code == 200
        tut_b = c_tut_b.put(
            "/api/tutor/profile",
            json={"name": "Репетитор Б", "subject": "chem", "subjectName": "Химия", "price": 1100},
        ).json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_tm", "password": "secret123", "displayName": "Ученик Видео"},
        ).status_code == 200
        assert c_stu.post("/api/wallet/topup", json={"amount": 5000, "method": "sbp"}).status_code == 200

        bk_a = c_stu.post(
            "/api/bookings",
            json={"tutorId": tut_a, "tutorName": "Репетитор А", "subjectName": "Биология", "offerPrice": 1000, "hour": "16:00", "dayIso": "2026-11-28"},
        ).json()["booking"]
        bk_b = c_stu.post(
            "/api/bookings",
            json={"tutorId": tut_b, "tutorName": "Репетитор Б", "subjectName": "Химия", "offerPrice": 1100, "hour": "18:00", "dayIso": "2026-11-29"},
        ).json()["booking"]
        orig_url = bk_a["telemostUrl"]
        assert bk_b["telemostUrl"] == orig_url

        # Репетитор А меняет видеоссылку только по своей заявке -> у Репетитора Б остаётся прежняя ссылка ученика
        r_upd = c_tut_a.patch(
            f"/api/bookings/{bk_a['id']}/telemost",
            json={"url": "https://zoom.us/j/111222333"},
        )
        assert r_upd.status_code == 200
        assert r_upd.json()["booking"]["telemostUrl"] == "https://zoom.us/j/111222333"

        stu_bks = {b["id"]: b for b in c_stu.get("/api/bookings?scope=student").json()["bookings"]}
        assert stu_bks[bk_a["id"]]["telemostUrl"] == "https://zoom.us/j/111222333"
        assert stu_bks[bk_b["id"]]["telemostUrl"] == orig_url

        # Событие market.telemost.updated уходит ученику в realtime
        stu_rt = c_stu.get("/api/realtime/recent", params={"channel": "student"}).json()["events"]
        assert any(
            e["eventType"] == "market.telemost.updated" and e.get("payload", {}).get("bookingId") == bk_a["id"]
            for e in stu_rt
        )

        # Пустой multipart без текста и файла возвращает 400
        r_empty = c_stu.post(
            f"/api/chats/booking:{bk_a['id']}/messages",
            data={"body": "   "},
            files=[("files", ("", b"", "application/octet-stream"))],
        )
        assert r_empty.status_code == 400


def test_chat_remind_payment_tutor_permissions_paid_guard_and_rate_limit(tmp_path: Path) -> None:
    db_file = tmp_path / "chat_pay_remind.db"
    wa_calls: list[dict[str, object]] = []
    tg_pay_pings: list[dict[str, object]] = []

    class _MockTelegramPay:
        async def notify_tutor_payment_reminder(self, **kwargs):
            tg_pay_pings.append(kwargs)
            return True

    def _wa_handler(req: httpx.Request) -> httpx.Response:
        import json as _json

        wa_calls.append(_json.loads(req.content.decode("utf-8")))
        return httpx.Response(200, json={"id": "wa-pay-1"})

    mock_http = httpx.AsyncClient(transport=httpx.MockTransport(_wa_handler))
    app = create_app(_make_settings(tmp_path, "chat_pay_remind.db"))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
        TestClient(app) as c_anon,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_pay", "password": "secret123", "displayName": "Ольга Физика", "role": "tutor"},
        ).status_code == 200
        tutor_slug = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Ольга Физика", "subject": "phys", "subjectName": "Физика", "price": 1500},
        ).json()["tutor"]["id"]

        r_stu = c_stu.post(
            "/api/auth/register",
            json={"username": "stu_pay", "password": "secret123", "displayName": "Денис"},
        )
        assert r_stu.status_code == 200
        stu_uid = r_stu.json()["user"]["id"]

        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_pay", "password": "secret123", "displayName": "Чужой"},
        ).status_code == 200

        conn = sqlite3.connect(db_file)
        conn.execute(
            "INSERT OR IGNORE INTO user_identities (provider, provider_subject, user_id, email, created_at) VALUES ('phone', '79147770011', ?, NULL, 1)",
            (int(stu_uid),),
        )
        conn.commit()
        conn.close()

        assert c_stu.post("/api/wallet/topup", json={"amount": 3500, "method": "sbp"}).status_code == 200
        bk_paid = c_stu.post(
            "/api/bookings",
            json={"tutorId": tutor_slug, "tutorName": "Ольга Физика", "subjectName": "Физика", "offerPrice": 1500, "hour": "18:00", "dayIso": "2026-11-28"},
        ).json()["booking"]
        bk_unpaid = c_stu.post(
            "/api/bookings",
            json={"tutorId": tutor_slug, "tutorName": "Ольга Физика", "subjectName": "Физика", "offerPrice": 1500, "hour": "19:00", "dayIso": "2026-11-29"},
        ).json()["booking"]

        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_lesson_requests SET reserved_rub = 0, escrow_status = 'none' WHERE id = ?", (bk_unpaid["id"],))
        conn.commit()
        conn.close()

        tid_paid = f"booking:{bk_paid['id']}"
        tid_unpaid = f"booking:{bk_unpaid['id']}"

        app.state.telegram = _MockTelegramPay()
        app.state.otp_delivery = OtpDeliveryService(
            OtpDeliveryConfig(whatsapp_webhook_url="https://wa.test/hook"),
            http_getter=lambda: mock_http,
        )

        # Посторонний и ученик -> 403
        assert c_other.post(f"/api/chats/{tid_unpaid}/remind-payment", json={}).status_code == 403
        assert c_stu.post(f"/api/chats/{tid_unpaid}/remind-payment", json={}).status_code == 403

        # Оплаченный урок -> 409 already_paid
        assert c_tut.post(f"/api/chats/{tid_paid}/remind-payment", json={"role": "tutor"}).status_code == 409

        # Неоплаченный урок от репетитора -> 200, сообщение в чате, Telegram + WhatsApp ученику, приватный realtime
        r_ok = c_tut.post(
            f"/api/chats/{tid_unpaid}/remind-payment",
            json={"slotLabel": "Вс, 29 нояб. · 19:00", "role": "tutor"},
        )
        assert r_ok.status_code == 200, r_ok.text
        res_json = r_ok.json()
        assert res_json["message"]["senderRole"] == "tutor"
        assert "Напоминание об оплате" in res_json["message"]["body"]
        assert "1 500 ₽" in res_json["message"]["body"]
        assert res_json["notified"]["deliveredChannels"] == ["telegram", "whatsapp"]

        assert len(tg_pay_pings) == 1
        assert int(tg_pay_pings[0]["student_user_id"]) == int(stu_uid)
        assert int(tg_pay_pings[0]["amount_rub"]) == 1500
        assert len(wa_calls) == 1
        assert wa_calls[0]["digits"] == "79147770011"
        assert "Напоминание об оплате" in str(wa_calls[0]["text"])

        stu_rt = c_stu.get("/api/realtime/recent", params={"channel": "student"}).json()["events"]
        assert any(e["eventType"] == "lesson.reminder.payment_due" for e in stu_rt)
        assert c_anon.get("/api/realtime/recent", params={"channel": "all"}).status_code == 401
        out_rt = c_other.get("/api/realtime/recent", params={"channel": "all"}).json()["events"]
        assert not any(e["eventType"] == "lesson.reminder.payment_due" for e in out_rt)

        # Лимит 3 раза за 10 минут, 4-й -> 429
        assert c_tut.post(f"/api/chats/{tid_unpaid}/remind-payment", json={"role": "tutor"}).status_code == 200
        assert c_tut.post(f"/api/chats/{tid_unpaid}/remind-payment", json={"role": "tutor"}).status_code == 200
        assert c_tut.post(f"/api/chats/{tid_unpaid}/remind-payment", json={"role": "tutor"}).status_code == 429


def test_chat_threads_sorted_by_latest_message_from_either_side(tmp_path: Path) -> None:
    db_file = tmp_path / "chat_sort.db"
    app = create_app(_make_settings(tmp_path, "chat_sort.db"))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu_a,
        TestClient(app) as c_stu_b,
        TestClient(app) as c_stu_c,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_sort", "password": "secret123", "displayName": "Анна Сорт", "role": "tutor"},
        ).status_code == 200
        tutor_slug = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Анна Сорт", "subject": "bio", "subjectName": "Биология", "price": 1300},
        ).json()["tutor"]["id"]

        bks = []
        for client, uname, dname, hour in (
            (c_stu_a, "stu_a", "Ученик А", "12:00"),
            (c_stu_b, "stu_b", "Ученик Б", "13:00"),
            (c_stu_c, "stu_c", "Ученик В", "14:00"),
        ):
            assert client.post(
                "/api/auth/register",
                json={"username": uname, "password": "secret123", "displayName": dname},
            ).status_code == 200
            assert client.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
            r_bk = client.post(
                "/api/bookings",
                json={
                    "tutorId": tutor_slug,
                    "tutorName": "Анна Сорт",
                    "subjectName": "Биология",
                    "offerPrice": 1300,
                    "hour": hour,
                    "dayIso": "2026-11-28",
                },
            )
            assert r_bk.status_code == 200
            bks.append(r_bk.json()["booking"]["id"])

        bk_a, bk_b, bk_c = bks
        tid_a, tid_b, tid_c = f"booking:{bk_a}", f"booking:{bk_b}", f"booking:{bk_c}"

        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_lesson_requests SET reserved_rub = 0, escrow_status = 'none' WHERE id = ?", (bk_c,))
        conn.commit()
        conn.close()

        # 1. Ученик А пишет сообщение -> A становится первым в списке, lastMessageAt и lastMessageSeq заполнены
        assert c_stu_a.post(
            f"/api/chats/{tid_a}/messages",
            json={"body": "Привет от А", "bookingId": bk_a, "tutorId": tutor_slug},
        ).status_code == 200
        tut_threads_1 = c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]
        assert tut_threads_1[0]["threadId"] == tid_a
        assert tut_threads_1[0]["lastMessageAt"] != ""
        assert tut_threads_1[0]["lastMessageSeq"] > 0

        # 2. Ученик Б пишет сообщение (в ту же секунду) -> Б поднимается выше А
        assert c_stu_b.post(
            f"/api/chats/{tid_b}/messages",
            json={"body": "Привет от Б", "bookingId": bk_b, "tutorId": tutor_slug},
        ).status_code == 200
        tut_ids_2 = [t["threadId"] for t in c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]]
        assert tut_ids_2 == [tid_b, tid_a, tid_c]

        # 3. Репетитор отвечает А ("наше сообщение") -> А поднимается обратно на 1-е место
        assert c_tut.post(
            f"/api/chats/{tid_a}/messages",
            json={"body": "Ответ преподавателя для А", "role": "tutor"},
        ).status_code == 200
        tut_ids_3 = [t["threadId"] for t in c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]]
        assert tut_ids_3 == [tid_a, tid_b, tid_c]

        # 4. Обновление метаданных заявки C и Б (ссылка Телемост / updated_at) не ломает порядок по последнему сообщению
        assert c_tut.patch(f"/api/bookings/{bk_c}/telemost", json={"url": "https://zoom.us/j/111222333"}).status_code == 200
        assert c_tut.patch(f"/api/bookings/{bk_b}/telemost", json={"url": "https://zoom.us/j/444555666"}).status_code == 200
        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_lesson_requests SET updated_at = '2099-01-01T00:00:00Z' WHERE id = ?", (bk_c,))
        conn.commit()
        conn.close()
        tut_ids_4 = [t["threadId"] for t in c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]]
        assert tut_ids_4 == [tid_a, tid_b, tid_c]

        # 5. Напоминание об оплате ученику В -> В мгновенно поднимается на 1-е место ([C, A, B])
        assert c_tut.post(
            f"/api/chats/{tid_c}/remind-payment",
            json={"slotLabel": "Сб, 28 нояб. · 14:00", "role": "tutor"},
        ).status_code == 200
        tut_ids_5 = [t["threadId"] for t in c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]]
        assert tut_ids_5 == [tid_c, tid_a, tid_b]


def test_student_chat_message_notifies_tutor_realtime_without_immediate_external_ping(tmp_path: Path) -> None:
    from types import SimpleNamespace
    from backend.api.realtime_calendar import _make_event_filter

    tg_chat_pings: list[dict[str, object]] = []

    class _MockTelegramChat:
        async def notify_student_chat_message(self, **kwargs):
            tg_chat_pings.append(kwargs)
            return True

    app = create_app(_make_settings(tmp_path, "chat_tutor_notify.db"))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_notif", "password": "secret123", "displayName": "Анна Увед", "role": "tutor"},
        ).status_code == 200
        tut_uid = c_tut.get("/api/me").json()["user"]["id"]
        tutor_slug = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Анна Увед", "subject": "bio", "subjectName": "Биология", "price": 1350},
        ).json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_notif", "password": "secret123", "displayName": "Кирилл"},
        ).status_code == 200
        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_notif", "password": "secret123", "displayName": "Сторонний"},
        ).status_code == 200
        other_uid = c_other.get("/api/me").json()["user"]["id"]

        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Анна Увед",
                "subjectName": "Биология",
                "offerPrice": 1350,
                "hour": "17:00",
                "dayIso": "2026-11-28",
            },
        ).json()["booking"]
        tid = f"booking:{bk['id']}"
        app.state.telegram = _MockTelegramChat()

        # 1. Сообщение от ученика -> сразу идёт только in-app realtime SSE (с ACL-изоляцией), без мгновенного TG-спама до 1 мин
        r1 = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Здравствуйте! Скинул домашку.", "bookingId": bk["id"], "tutorId": tutor_slug},
        )
        assert r1.status_code == 200
        assert len(tg_chat_pings) == 0

        mismatch_sub = SimpleNamespace(channel="tutor", tutor_slug="different-display-slug")
        chat_evt = {
            "channel": "tutor",
            "eventType": "chat.message",
            "tutorSlug": tutor_slug,
            "payload": {"threadId": tid, "tutorId": tutor_slug, "tutorUserId": tut_uid, "message": r1.json()["message"]},
        }
        assert app.state.realtime._matches(mismatch_sub, chat_evt) is True
        assert _make_event_filter(app.state.db, SimpleNamespace(id=tut_uid, role="tutor"))(chat_evt) is True
        assert _make_event_filter(app.state.db, SimpleNamespace(id=other_uid, role="student"))(chat_evt) is False

        with c_tut.stream(
            "GET",
            "/api/realtime/stream",
            params={"channel": "tutor", "tutor_slug": "different-display-slug", "once": 1},
        ) as s_tut:
            sse_tut = "".join(s_tut.iter_text())
        assert "chat.message" in sse_tut and tid in sse_tut
        with c_other.stream(
            "GET",
            "/api/realtime/stream",
            params={"channel": "tutor", "tutor_slug": "different-display-slug", "once": 1},
        ) as s_other:
            sse_other = "".join(s_other.iter_text())
        assert "Здравствуйте! Скинул домашку." not in sse_other

        # 2. Быстрое второе сообщение -> unreadTotal == 2, мгновенного TG по-прежнему нет
        r2 = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "И ещё один вопрос по задаче.", "bookingId": bk["id"], "tutorId": tutor_slug},
        )
        assert r2.status_code == 200
        assert len(tg_chat_pings) == 0
        assert c_tut.get("/api/chats", params={"role": "tutor"}).json()["unreadTotal"] == 2

        # 3. Ответ репетитора также не шлёт мгновенный внешний ping
        r3 = c_tut.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Хорошо, посмотрю сейчас.", "role": "tutor"},
        )
        assert r3.status_code == 200
        assert len(tg_chat_pings) == 0


def test_chat_read_receipts_state_and_realtime_event(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path, "chat_receipts.db"))
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_rcp", "password": "secret123", "displayName": "Анна Чек", "role": "tutor"},
        ).status_code == 200
        tutor_slug = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Анна Чек", "subject": "bio", "subjectName": "Биология", "price": 1400},
        ).json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_rcp", "password": "secret123", "displayName": "Мария Чек"},
        ).status_code == 200
        assert c_other.post(
            "/api/auth/register",
            json={"username": "oth_rcp", "password": "secret123", "displayName": "Чужой"},
        ).status_code == 200

        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Анна Чек",
                "subjectName": "Биология",
                "offerPrice": 1400,
                "hour": "18:00",
                "dayIso": "2026-11-28",
            },
        ).json()["booking"]
        tid = f"booking:{bk['id']}"

        # 1. Репетитор пишет -> readByTutor=True, readByStudent=False, lastReadByStudent=False
        r_tut_msg = c_tut.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Отправил материалы к занятию.", "role": "tutor"},
        )
        assert r_tut_msg.status_code == 200
        msg_t = r_tut_msg.json()["message"]
        assert msg_t["readByTutor"] is True
        assert msg_t["readByStudent"] is False

        tut_threads_1 = c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]
        th_t1 = next(t for t in tut_threads_1 if t["threadId"] == tid)
        assert th_t1["lastSenderRole"] == "tutor"
        assert th_t1["lastReadByStudent"] is False
        assert th_t1["lastReadByTutor"] is True

        # 2. Ученик читает -> updated=1, readByStudent=True, lastReadByStudent=True, chat.read для репетитора
        r_stu_read = c_stu.post(f"/api/chats/{tid}/read")
        assert r_stu_read.status_code == 200
        assert r_stu_read.json()["updated"] == 1

        msgs_after_stu = c_tut.get(f"/api/chats/{tid}/messages", params={"role": "tutor"}).json()["messages"]
        assert msgs_after_stu[0]["readByStudent"] is True
        tut_threads_2 = c_tut.get("/api/chats", params={"role": "tutor"}).json()["threads"]
        assert next(t for t in tut_threads_2 if t["threadId"] == tid)["lastReadByStudent"] is True

        tut_rt = c_tut.get("/api/realtime/recent", params={"channel": "tutor"}).json()["events"]
        read_evts_tut = [e for e in tut_rt if e["eventType"] == "chat.read" and e["payload"].get("threadId") == tid]
        assert len(read_evts_tut) >= 1
        assert read_evts_tut[-1]["payload"]["readerRole"] == "student"

        oth_rt = c_other.get("/api/realtime/recent", params={"channel": "all"}).json()["events"]
        assert not any(e["eventType"] == "chat.read" and e["payload"].get("threadId") == tid for e in oth_rt)

        # 3. Обратный поток: ученик пишет -> readByTutor=False -> репетитор читает -> readByTutor=True и chat.read ученику
        r_stu_msg = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Спасибо, всё посмотрела!", "bookingId": bk["id"], "tutorId": tutor_slug},
        )
        assert r_stu_msg.status_code == 200
        assert r_stu_msg.json()["message"]["readByTutor"] is False

        stu_threads_1 = c_stu.get("/api/chats").json()["threads"]
        assert next(t for t in stu_threads_1 if t["threadId"] == tid)["lastReadByTutor"] is False

        r_tut_read = c_tut.post(f"/api/chats/{tid}/read", params={"role": "tutor"})
        assert r_tut_read.status_code == 200
        assert r_tut_read.json()["updated"] == 1

        msgs_after_tut = c_stu.get(f"/api/chats/{tid}/messages").json()["messages"]
        assert msgs_after_tut[-1]["readByTutor"] is True
        stu_threads_2 = c_stu.get("/api/chats").json()["threads"]
        assert next(t for t in stu_threads_2 if t["threadId"] == tid)["lastReadByTutor"] is True

        stu_rt = c_stu.get("/api/realtime/recent", params={"channel": "student"}).json()["events"]
        read_evts_stu = [e for e in stu_rt if e["eventType"] == "chat.read" and e["payload"].get("threadId") == tid]
        assert len(read_evts_stu) >= 1
        assert read_evts_stu[-1]["payload"]["readerRole"] == "tutor"


def test_unanswered_chat_notifies_telegram_and_whatsapp_after_one_minute(tmp_path: Path) -> None:
    db_file = tmp_path / "chat_unanswered.db"
    settings = Settings(
        db_path=db_file,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        telegram=TelegramAuthConfig(
            bot_username="vektor_ege_bot",
            bot_token="123456:CHATTOKEN",
            webhook_secret="chat-wh-sec",
        ),
        otp=OtpDeliveryConfig(
            whatsapp_provider="webhook",
            whatsapp_webhook_url="https://wa.example.test/send",
            whatsapp_webhook_token="wa-tok",
        ),
        public_base_url="https://vektor-ege.example.com",
        media=MediaConfig(local_dir=tmp_path / "media"),
        scheduler=SchedulerConfig(
            enabled=True,
            interval_sec=60,
            initial_delay_sec=300,
            chat_unanswered_delay_sec=60,
            chat_unanswered_max_age_hours=24,
            chat_check_interval_sec=15,
        ),
    )

    tg_calls: list[dict] = []
    wa_calls: list[dict] = []
    fail_flag = [False]

    def _transport(request: httpx.Request) -> httpx.Response:
        if fail_flag[0]:
            return httpx.Response(502, json={"ok": False, "description": "Bad Gateway"})
        body = json.loads(request.content.decode("utf-8") or "{}")
        if request.url.host == "wa.example.test":
            wa_calls.append(body)
            return httpx.Response(200, json={"ok": True, "id": f"wa-{len(wa_calls)}"})
        tg_calls.append(body)
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(tg_calls)}})

    def _set_msg_time(mid: str, dt: datetime) -> None:
        iso = dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE chat_messages SET created_at = ? WHERE id = ?", (iso, mid))
        conn.commit()
        conn.close()

    def _tick(client: TestClient, dt: datetime) -> dict:
        return client.portal.call(partial(client.app.state.scheduler.run_once, now=dt))

    app = create_app(settings)
    with TestClient(app) as c_tut, TestClient(app) as c_stu:
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(_transport))

        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_1m", "password": "secret123", "displayName": "Анна 1м", "role": "tutor"},
        ).status_code == 200
        tut_uid = c_tut.get("/api/me").json()["user"]["id"]
        tutor_slug = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Анна 1м", "subject": "math", "subjectName": "Математика", "price": 1500},
        ).json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_1m", "password": "secret123", "displayName": "Иван 1м"},
        ).status_code == 200
        stu_uid = c_stu.get("/api/me").json()["user"]["id"]

        app.state.db.upsert_telegram_binding("8101", user_id=tut_uid, notifications_enabled=True)
        app.state.db.upsert_telegram_binding("8102", user_id=stu_uid, notifications_enabled=True)

        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_tutors SET whatsapp_phone = ? WHERE id = ?", ("+79149001122", tutor_slug))
        # Проверка fallback на users.phone (без отдельной записи phone в user_identities)
        conn.execute("UPDATE users SET phone = ? WHERE id = ?", ("+79149001133", int(stu_uid)))
        conn.commit()
        conn.close()

        assert c_stu.post("/api/wallet/topup", json={"amount": 3000, "method": "sbp"}).status_code == 200
        bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Анна 1м",
                "subjectName": "Математика",
                "offerPrice": 1500,
                "hour": "16:00",
                "dayIso": "2026-12-15",
            },
        ).json()["booking"]
        tid = f"booking:{bk['id']}"
        t0 = datetime(2026, 11, 24, 12, 0, 0, tzinfo=timezone.utc)
        tg_calls.clear()
        wa_calls.clear()

        # 1. Ученик отправляет m1 (0s) и m2 (+20s) -> у репетитора одна галочка (readByTutor=False)
        m1 = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Добрый день! Проверьте вариант 5.", "bookingId": bk["id"], "tutorId": tutor_slug},
        ).json()["message"]
        m2 = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "И задание 15 тоже.", "bookingId": bk["id"], "tutorId": tutor_slug},
        ).json()["message"]
        _set_msg_time(m1["id"], t0)
        _set_msg_time(m2["id"], t0 + timedelta(seconds=20))

        # +30s: меньше 1 минуты -> тишина
        res_30 = _tick(c_tut, t0 + timedelta(seconds=30))
        assert res_30["chatAlertsCount"] == 0
        assert len(tg_calls) == 0 and len(wa_calls) == 0

        # +65s, но оба канала отдают 502 -> НЕ помечается отправленным, повторится при восстановлении
        fail_flag[0] = True
        res_502 = _tick(c_tut, t0 + timedelta(seconds=65))
        assert res_502["chatAlertsCount"] == 0
        assert len(tg_calls) == 0 and len(wa_calls) == 0

        # +70s, сеть восстановилась -> преподавателю уходят Telegram и WhatsApp
        fail_flag[0] = False
        res_70 = _tick(c_tut, t0 + timedelta(seconds=70))
        assert res_70["chatAlertsCount"] == 1
        assert res_70["chatAlerts"][0]["recipientRole"] == "tutor"
        assert res_70["chatAlerts"][0]["channels"] == ["telegram", "whatsapp"]
        assert len(tg_calls) == 1
        assert str(tg_calls[0]["chat_id"]) == "8101"
        assert "Иван 1м" in tg_calls[0]["text"]
        assert "И задание 15 тоже." in tg_calls[0]["text"]
        assert "Непрочитанных сообщений: <b>2</b>" in tg_calls[0]["text"]
        assert tg_calls[0]["reply_markup"]["inline_keyboard"][0][0]["url"].endswith("/tutor#tutor-comm")

        assert len(wa_calls) == 1
        assert wa_calls[0]["kind"] == "chat_unanswered"
        assert wa_calls[0]["digits"] == "79149001122"
        assert "/tutor#tutor-comm" in wa_calls[0]["text"]
        assert "Иван 1м" in wa_calls[0]["text"]

        # Повторный тик +120s и даже третье непрочитанное сообщение m3 в той же серии не шлют дубликат
        m3 = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Жду ответа.", "bookingId": bk["id"], "tutorId": tutor_slug},
        ).json()["message"]
        _set_msg_time(m3["id"], t0 + timedelta(seconds=90))
        res_dup = _tick(c_tut, t0 + timedelta(seconds=120))
        assert res_dup["chatAlertsCount"] == 0
        assert len(tg_calls) == 1 and len(wa_calls) == 1

        # 2. Преподаватель читает (✓✓) и отвечает ученику -> через +65s уведомляются Telegram и WhatsApp ученика
        assert c_tut.post(f"/api/chats/{tid}/read", params={"role": "tutor"}).status_code == 200
        tg_calls.clear()
        wa_calls.clear()
        t_turn2 = t0 + timedelta(minutes=5)
        t1 = c_tut.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Проверил, 15-е нужно пересчитать.", "role": "tutor"},
        ).json()["message"]
        _set_msg_time(t1["id"], t_turn2)

        assert _tick(c_stu, t_turn2 + timedelta(seconds=45))["chatAlertsCount"] == 0
        res_stu_65 = _tick(c_stu, t_turn2 + timedelta(seconds=65))
        assert res_stu_65["chatAlertsCount"] == 1
        assert res_stu_65["chatAlerts"][0]["recipientRole"] == "student"
        assert res_stu_65["chatAlerts"][0]["channels"] == ["telegram", "whatsapp"]
        assert len(tg_calls) == 1
        assert str(tg_calls[0]["chat_id"]) == "8102"
        assert "Анна 1м" in tg_calls[0]["text"]
        assert tg_calls[0]["reply_markup"]["inline_keyboard"][0][0]["url"].endswith("/student#home")
        assert len(wa_calls) == 1
        assert wa_calls[0]["kind"] == "chat_unanswered"
        assert wa_calls[0]["digits"] == "79149001133"
        assert "/student#home" in wa_calls[0]["text"]

        # 3. Если получатель прочитал сообщение (✓✓) до истечения 1 минуты -> уведомление НЕ уходит
        tg_calls.clear()
        wa_calls.clear()
        t_turn3 = t0 + timedelta(minutes=10)
        s_read = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Понял, пересчитываю!", "bookingId": bk["id"], "tutorId": tutor_slug},
        ).json()["message"]
        _set_msg_time(s_read["id"], t_turn3)
        assert c_tut.post(f"/api/chats/{tid}/read", params={"role": "tutor"}).status_code == 200
        res_read_cancel = _tick(c_tut, t_turn3 + timedelta(seconds=90))
        assert res_read_cancel["chatAlertsCount"] == 0
        assert len(tg_calls) == 0 and len(wa_calls) == 0

        # 4. Если получатель ответил в течение минуты (даже без явного /read) -> уведомление НЕ уходит
        t_turn4 = t0 + timedelta(minutes=15)
        t_fast = c_tut.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Пришлёшь решение сюда?", "role": "tutor"},
        ).json()["message"]
        _set_msg_time(t_fast["id"], t_turn4)
        s_fast = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Да, вот оно!", "bookingId": bk["id"], "tutorId": tutor_slug},
        ).json()["message"]
        _set_msg_time(s_fast["id"], t_turn4 + timedelta(seconds=20))
        assert c_tut.post(f"/api/chats/{tid}/read", params={"role": "tutor"}).status_code == 200
        res_reply_cancel = _tick(c_stu, t_turn4 + timedelta(seconds=90))
        assert res_reply_cancel["chatAlertsCount"] == 0
        assert len(tg_calls) == 0 and len(wa_calls) == 0

        # 5. Если Telegram у пользователя отключён, WhatsApp всё равно доставляет уведомление
        app.state.db.set_telegram_notifications(tut_uid, False, by_user=True)
        t_turn5 = t0 + timedelta(minutes=20)
        m_wa_only = c_stu.post(
            f"/api/chats/{tid}/messages",
            json={"body": "Отправил новый скан.", "bookingId": bk["id"], "tutorId": tutor_slug},
        ).json()["message"]
        _set_msg_time(m_wa_only["id"], t_turn5)
        res_wa_only = _tick(c_tut, t_turn5 + timedelta(seconds=70))
        assert res_wa_only["chatAlertsCount"] == 1
        assert res_wa_only["chatAlerts"][0]["channels"] == ["whatsapp"]
        assert len(tg_calls) == 0
        assert len(wa_calls) == 1
        assert wa_calls[0]["digits"] == "79149001122"

        # 6. Прямой диалог без заявки + вложение-фото без текста -> корректное превью «📷 Фото»
        app.state.db.set_telegram_notifications(tut_uid, True, by_user=True)
        tg_calls.clear()
        wa_calls.clear()
        direct_tid = f"tutor:{tutor_slug}:u:{stu_uid}"
        png_bytes = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+X2Z0AAAAASUVORK5CYII="
        )
        r_img = c_stu.post(
            f"/api/chats/{direct_tid}/messages",
            data={"tutorId": tutor_slug, "role": "student"},
            files={"files": ("task.png", png_bytes, "image/png")},
        )
        assert r_img.status_code == 200
        t_turn6 = t0 + timedelta(minutes=25)
        _set_msg_time(r_img.json()["message"]["id"], t_turn6)
        res_direct = _tick(c_tut, t_turn6 + timedelta(seconds=65))
        assert res_direct["chatAlertsCount"] == 1
        assert res_direct["chatAlerts"][0]["threadId"] == direct_tid
        assert res_direct["chatAlerts"][0]["channels"] == ["telegram", "whatsapp"]
        assert "📷 Фото" in tg_calls[0]["text"]
        assert "📷 Фото" in wa_calls[0]["text"]


def test_telemost_update_notifies_counterpart_with_join_link(tmp_path: Path) -> None:
    from backend.api.realtime_calendar import _make_event_filter

    db_file = tmp_path / "telemost_notify.db"
    settings = Settings(
        db_path=db_file,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        telegram=TelegramAuthConfig(
            bot_username="vektor_ege_bot",
            bot_token="123456:TMTOKEN",
            webhook_secret="tm-wh-sec",
        ),
        otp=OtpDeliveryConfig(
            whatsapp_provider="webhook",
            whatsapp_webhook_url="https://wa.example.test/send",
            whatsapp_webhook_token="wa-tok",
        ),
        public_base_url="https://vektor-ege.example.com",
        media=MediaConfig(local_dir=tmp_path / "media"),
    )

    tg_calls: list[dict] = []
    wa_calls: list[dict] = []

    def _transport(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content.decode("utf-8") or "{}")
        if request.url.host == "wa.example.test":
            wa_calls.append(body)
            return httpx.Response(200, json={"ok": True, "id": f"wa-{len(wa_calls)}"})
        tg_calls.append(body)
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(tg_calls)}})

    app = create_app(settings)
    with (
        TestClient(app) as c_tut,
        TestClient(app) as c_stu,
        TestClient(app) as c_other,
    ):
        app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(_transport))

        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_tm", "password": "secret123", "displayName": "Анна Соколова", "role": "tutor"},
        ).status_code == 200
        tut_uid = c_tut.get("/api/me").json()["user"]["id"]
        tutor_slug = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Анна Соколова", "subject": "bio", "subjectName": "Биология", "price": 1400},
        ).json()["tutor"]["id"]

        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_tm", "password": "secret123", "displayName": "Иван Петров"},
        ).status_code == 200
        stu_uid = c_stu.get("/api/me").json()["user"]["id"]

        assert c_other.post(
            "/api/auth/register",
            json={"username": "other_tm", "password": "secret123", "displayName": "Посторонний"},
        ).status_code == 200
        other_uid = c_other.get("/api/me").json()["user"]["id"]

        app.state.db.upsert_telegram_binding("8201", user_id=tut_uid, notifications_enabled=True)
        app.state.db.upsert_telegram_binding("8202", user_id=stu_uid, notifications_enabled=True)
        conn = sqlite3.connect(db_file)
        conn.execute("UPDATE admin_tutors SET whatsapp_phone = ? WHERE id = ?", ("+79149001122", tutor_slug))
        conn.execute("UPDATE users SET phone = ? WHERE id = ?", ("+79149001133", int(stu_uid)))
        conn.commit()
        conn.close()

        assert c_stu.post("/api/wallet/topup", json={"amount": 2500, "method": "sbp"}).status_code == 200
        r_bk = c_stu.post(
            "/api/bookings",
            json={
                "tutorId": tutor_slug,
                "tutorName": "Анна Соколова",
                "subjectName": "Биология",
                "offerPrice": 1400,
                "hour": "18:00",
                "dayIso": "2026-12-20",
            },
        )
        assert r_bk.status_code == 200
        booking_id = r_bk.json()["booking"]["id"]
        thread_id = f"booking:{booking_id}"

        tg_calls.clear()
        wa_calls.clear()

        # 1. Преподаватель меняет ссылку на Zoom -> уведомляются Telegram и WhatsApp ученика + приватный realtime
        r_tut_tm = c_tut.patch(
            f"/api/bookings/{booking_id}/telemost",
            json={"url": "https://zoom.us/j/9988776655", "role": "tutor"},
        )
        assert r_tut_tm.status_code == 200
        res_tut = r_tut_tm.json()
        assert res_tut["booking"]["telemostUrl"] == "https://zoom.us/j/9988776655"
        assert res_tut["notified"]["targetRole"] == "student"
        assert res_tut["notified"]["channels"] == ["telegram", "whatsapp"]

        assert len(tg_calls) == 1
        assert str(tg_calls[0]["chat_id"]) == "8202"
        tg_stu_buttons = [
            btn
            for row in (tg_calls[0].get("reply_markup") or {}).get("inline_keyboard", [])
            for btn in row
        ]
        assert any(btn.get("url") == "https://zoom.us/j/9988776655" for btn in tg_stu_buttons)
        assert len(wa_calls) == 1
        assert "79149001133" in json.dumps(wa_calls[0], ensure_ascii=False)
        assert "https://zoom.us/j/9988776655" in wa_calls[0]["text"]

        stu_evts = c_stu.get("/api/realtime/recent", params={"channel": "student"}).json()["events"]
        evt_stu = [e for e in stu_evts if e["eventType"] == "market.telemost.updated"][-1]
        assert evt_stu["payload"]["changedByRole"] == "tutor"
        assert evt_stu["payload"]["actionLabel"] == "Войти в Zoom"
        assert evt_stu["payload"]["telemostUrl"] == "https://zoom.us/j/9988776655"

        stu_user = app.state.db.get_user_by_id(stu_uid)
        tut_user = app.state.db.get_user_by_id(tut_uid)
        other_user = app.state.db.get_user_by_id(other_uid)
        assert _make_event_filter(app.state.db, stu_user)(evt_stu) is True
        assert _make_event_filter(app.state.db, other_user)(evt_stu) is False

        tg_calls.clear()
        wa_calls.clear()

        # 2. Ученик меняет ссылку на Телемост -> уведомляются Telegram и WhatsApp преподавателя + приватный realtime
        r_stu_tm = c_stu.patch(
            f"/api/bookings/{booking_id}/telemost",
            json={"url": "https://telemost.yandex.ru/j/5544332211", "role": "student"},
        )
        assert r_stu_tm.status_code == 200
        res_stu = r_stu_tm.json()
        assert res_stu["booking"]["telemostUrl"] == "https://telemost.yandex.ru/j/5544332211"
        assert res_stu["notified"]["targetRole"] == "tutor"
        assert res_stu["notified"]["channels"] == ["telegram", "whatsapp"]

        assert len(tg_calls) == 1
        assert str(tg_calls[0]["chat_id"]) == "8201"
        tg_tut_buttons = [
            btn
            for row in (tg_calls[0].get("reply_markup") or {}).get("inline_keyboard", [])
            for btn in row
        ]
        assert any(btn.get("url") == "https://telemost.yandex.ru/j/5544332211" for btn in tg_tut_buttons)
        assert len(wa_calls) == 1
        assert "79149001122" in json.dumps(wa_calls[0], ensure_ascii=False)
        assert "https://telemost.yandex.ru/j/5544332211" in wa_calls[0]["text"]

        tut_evts = c_tut.get(
            "/api/realtime/recent", params={"channel": "tutor", "tutor_slug": tutor_slug}
        ).json()["events"]
        evt_tut = [e for e in tut_evts if e["eventType"] == "market.telemost.updated"][-1]
        assert evt_tut["payload"]["changedByRole"] == "student"
        assert evt_tut["payload"]["actionLabel"] == "Войти в Телемост"
        assert evt_tut["payload"]["telemostUrl"] == "https://telemost.yandex.ru/j/5544332211"
        assert _make_event_filter(app.state.db, tut_user)(evt_tut) is True
        assert _make_event_filter(app.state.db, other_user)(evt_tut) is False

        # Смена ссылки встречи не добавляет лишних сообщений в историю и не ломает порядок чатов
        assert c_stu.get(f"/api/chats/{thread_id}/messages").json()["messages"] == []








