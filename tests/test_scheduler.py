"""Тесты фонового планировщика: эскроу (94%), просроченные заявки, споры, напоминания TG и Admin API."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from functools import partial
import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient
import httpx
import pytest

from backend.api import create_api_app
from backend.config import AIConfig, GoogleOAuthConfig, SchedulerConfig, Settings, TelegramAuthConfig
from backend.scheduler import parse_iso_utc, parse_slot_start_utc, parse_tz_offset


def _sched_settings(
    tmp_path: Path,
    name: str = "sched.db",
    *,
    scheduler_enabled: bool = True,
    bot_token: str = "123456:SCHEDTOKEN",
    admin_token: str = "",
) -> Settings:
    return Settings(
        db_path=tmp_path / name,
        admin_api_token=admin_token,
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        telegram=TelegramAuthConfig(
            bot_username="vektor_ege_bot",
            bot_token=bot_token,
            webhook_secret="sched-wh-sec",
        ),
        public_base_url="https://vektor-ege.example.com",
        scheduler=SchedulerConfig(
            enabled=scheduler_enabled,
            interval_sec=60,
            initial_delay_sec=300,
            lesson_duration_min=60,
            auto_capture_grace_min=15,
            pending_ttl_hours=24,
            reminder_24h_min=24 * 60,
            reminder_1h_min=60,
        ),
    )


def _mock_tg(app, sent: list[tuple[str, dict]], *, fail_flag: list[bool] | None = None) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if fail_flag and fail_flag[0]:
            return httpx.Response(502, json={"ok": False, "description": "Bad Gateway"})
        method = request.url.path.rsplit("/", 1)[-1]
        try:
            body = json.loads(request.content.decode("utf-8") or "{}")
        except Exception:
            body = {}
        sent.append((method, body))
        return httpx.Response(200, json={"ok": True, "result": {"message_id": len(sent)}})

    app.state.http = httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _tick(client: TestClient, now: datetime) -> dict[str, Any]:
    return client.portal.call(partial(client.app.state.scheduler.run_once, now=now))


def test_timezone_and_slot_parsing() -> None:
    assert parse_tz_offset("UTC+9").utcoffset(None) == timedelta(hours=9)
    assert parse_tz_offset("UTC+3").utcoffset(None) == timedelta(hours=3)
    assert parse_tz_offset("Europe/Moscow").utcoffset(None) == timedelta(hours=3)
    assert parse_tz_offset("unknown-tz").utcoffset(None) == timedelta(hours=9)

    dt_ykt = parse_slot_start_utc("2026-12-01", "18:00", "UTC+9")
    assert dt_ykt == datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc)
    dt_msk = parse_slot_start_utc("2026-12-01", "18:00", "Europe/Moscow")
    assert dt_msk == datetime(2026, 12, 1, 15, 0, tzinfo=timezone.utc)
    assert parse_slot_start_utc("bad-date", "18:00", "UTC+9") is None
    assert parse_iso_utc("2026-12-01T09:00:00Z") == datetime(2026, 12, 1, 9, 0, tzinfo=timezone.utc)
    assert parse_iso_utc("") is None


def test_scheduler_auto_capture_and_idempotency(tmp_path: Path) -> None:
    app = create_api_app(_sched_settings(tmp_path, "cap.db"))
    sent: list[tuple[str, dict]] = []
    with TestClient(app) as c_tut, TestClient(app) as c_stu:
        _mock_tg(app, sent)
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_cap", "password": "secret123", "displayName": "Мария С.", "role": "tutor"},
        ).status_code == 200
        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_cap", "password": "secret123", "displayName": "Кирилл В."},
        ).status_code == 200

        tut_uid = c_tut.get("/api/me").json()["user"]["id"]
        stu_uid = c_stu.get("/api/me").json()["user"]["id"]
        app.state.db.upsert_telegram_binding("7001", user_id=stu_uid, notifications_enabled=True)
        app.state.db.upsert_telegram_binding("7002", user_id=tut_uid, notifications_enabled=True)

        tid = c_tut.put(
            "/api/tutor/profile",
            json={
                "name": "Мария Смирнова",
                "subject": "bio",
                "subjectName": "Биология",
                "city": "Якутск",
                "timezone": "UTC+9",
                "price": 1100,
                "slots": {"2": ["18:00"]},
            },
        ).json()["tutor"]["id"]

        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200
        bid = c_stu.post(
            "/api/bookings",
            json={"tutorId": tid, "offerPrice": 1100, "hour": "18:00", "dayIso": "2026-12-01"},
        ).json()["booking"]["id"]
        assert c_tut.post(f"/api/bookings/{bid}/accept").status_code == 200

        # До окончания урока + grace (2026-12-01 18:00 UTC+9 = 09:00 UTC; завершение +15м = 10:15 UTC)
        res_early = _tick(c_tut, datetime(2026, 12, 1, 10, 14, tzinfo=timezone.utc))
        assert bid not in res_early["capturedIds"]
        assert c_tut.get("/api/tutor/summary").json()["availableRub"] == 0

        # После 10:15 UTC эскроу переходит frozen -> captured (94% = 1 034 ₽, комиссия 55 ₽ + СБП 11 ₽)
        sent.clear()
        res_ok = _tick(c_tut, datetime(2026, 12, 1, 10, 15, tzinfo=timezone.utc))
        assert bid in res_ok["capturedIds"]
        assert res_ok["capturedRub"] >= 1100

        tut_sum = c_tut.get("/api/tutor/summary").json()
        assert tut_sum["frozenNetRub"] == 0
        assert tut_sum["earnedNetRub"] == 1034
        assert tut_sum["availableRub"] == 1034

        bk_after = next(b for b in c_stu.get("/api/bookings").json()["bookings"] if b["id"] == bid)
        assert bk_after["status"] == "completed"
        assert bk_after["escrowStatus"] == "captured"

        chat_msgs = {str(body["chat_id"]): body["text"] for m, body in sent if m == "sendMessage"}
        assert "7001" in chat_msgs and "Занятие завершено" in chat_msgs["7001"]
        assert "7002" in chat_msgs and "1 034 ₽" in chat_msgs["7002"] and "СБП 1%" in chat_msgs["7002"]

        with app.state.db._lock:
            ob_row = app.state.db._conn.execute(
                "SELECT event_type, payload FROM admin_outbox_events WHERE partition_key = ? AND event_type = 'payments.escrow.auto_captured'",
                (bid,),
            ).fetchone()
        assert ob_row is not None
        ob_payload = json.loads(ob_row["payload"])["payload"]
        assert ob_payload["payoutRub"] == 1034 and ob_payload["feeRub"] == 55 and ob_payload["sbpFeeRub"] == 11

        # Повторный тик абсолютно идемпотентен
        sent.clear()
        res_dup = _tick(c_tut, datetime(2026, 12, 1, 10, 20, tzinfo=timezone.utc))
        assert bid not in res_dup["capturedIds"]
        assert not [body for _, body in sent if body.get("chat_id") in ("7001", "7002")]


def test_scheduler_skips_open_dispute_then_captures_when_rejected(tmp_path: Path) -> None:
    app = create_api_app(_sched_settings(tmp_path, "dispute.db"))
    with TestClient(app) as c_tut, TestClient(app) as c_stu, TestClient(app) as c_adm:
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_dsp", "password": "secret123", "displayName": "Анна Д.", "role": "tutor"},
        ).status_code == 200
        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_dsp", "password": "secret123", "displayName": "Олег Д."},
        ).status_code == 200

        tid = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Анна Д.", "subject": "chem", "city": "Москва", "timezone": "UTC+3", "price": 1000, "slots": {"2": ["14:00"]}},
        ).json()["tutor"]["id"]

        assert c_stu.post("/api/wallet/topup", json={"amount": 1500, "method": "sbp"}).status_code == 200
        bid = c_stu.post(
            "/api/bookings",
            json={"tutorId": tid, "offerPrice": 1000, "hour": "14:00", "dayIso": "2026-12-01"},
        ).json()["booking"]["id"]
        assert c_tut.post(f"/api/bookings/{bid}/accept").status_code == 200

        # Открытый спор блокирует автозавершение эскроу
        did = c_stu.post(
            f"/api/bookings/{bid}/dispute",
            json={"reason": "quality", "comment": "Задержка урока"},
        ).json()["dispute"]["id"]

        res_blocked = _tick(c_tut, datetime(2026, 12, 1, 15, 0, tzinfo=timezone.utc))
        assert bid not in res_blocked["capturedIds"]
        assert c_tut.get("/api/tutor/summary").json()["availableRub"] == 0

        # Админ отклоняет спор -> на следующем тике урок автозавершается
        assert c_adm.post(
            f"/api/admin/disputes/{did}/resolve",
            json={"action": "reject", "resolutionNote": "Урок проведён"},
        ).status_code == 200

        res_released = _tick(c_tut, datetime(2026, 12, 1, 15, 5, tzinfo=timezone.utc))
        assert bid in res_released["capturedIds"]
        assert c_tut.get("/api/tutor/summary").json()["availableRub"] == 940


def test_scheduler_expires_overdue_pending_and_countered_with_refund(tmp_path: Path) -> None:
    app = create_api_app(_sched_settings(tmp_path, "expire.db"))
    sent: list[tuple[str, dict]] = []
    with TestClient(app) as c_tut, TestClient(app) as c_stu:
        _mock_tg(app, sent)
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_exp", "password": "secret123", "displayName": "Денис Э.", "role": "tutor"},
        ).status_code == 200
        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_exp", "password": "secret123", "displayName": "Вика Э."},
        ).status_code == 200

        stu_uid = c_stu.get("/api/me").json()["user"]["id"]
        app.state.db.upsert_telegram_binding("7101", user_id=stu_uid, notifications_enabled=True)

        tid = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Денис Э.", "subject": "rus", "city": "Якутск", "timezone": "UTC+9", "price": 1000, "slots": {"2": ["10:00", "15:00", "18:00"]}},
        ).json()["tutor"]["id"]

        assert c_stu.post("/api/wallet/topup", json={"amount": 2500, "method": "sbp"}).status_code == 200
        # 1) Слот сегодняшнего дня (до истечения 24ч TTL b_ttl): 10:00 UTC+9
        now0 = datetime.now(timezone.utc)
        today_ykt = (now0 + timedelta(hours=9)).strftime("%Y-%m-%d")
        slot_b_utc = parse_slot_start_utc(today_ykt, "10:00", "UTC+9")
        assert slot_b_utc is not None
        b_slot = c_stu.post(
            "/api/bookings",
            json={"tutorId": tid, "offerPrice": 900, "hour": "10:00", "dayIso": today_ykt},
        ).json()["booking"]["id"]
        # 2) Далёкий слот countered с истекшим TTL (24 ч от created_at)
        far_day = (now0 + timedelta(days=30)).strftime("%Y-%m-%d")
        b_ttl = c_stu.post(
            "/api/bookings",
            json={"tutorId": tid, "offerPrice": 1000, "hour": "18:00", "dayIso": far_day},
        ).json()["booking"]["id"]
        assert c_tut.post(f"/api/bookings/{b_ttl}/counter", json={"counterPrice": 1150}).status_code == 200

        assert c_stu.get("/api/wallet").json()["wallet"]["balanceRub"] == 600

        # Сначала срабатывает только прошедший слот b_slot (до истечения TTL b_ttl)
        res_slot = _tick(c_tut, slot_b_utc + timedelta(minutes=5))
        assert b_slot in res_slot["expiredIds"] and b_ttl not in res_slot["expiredIds"]
        assert c_stu.get("/api/wallet").json()["wallet"]["balanceRub"] == 1500

        # Сдвигаем время > created_at + 24 ч -> истекает countered-заявка b_ttl и возвращает 1 000 ₽
        ttl_now = now0 + timedelta(hours=25)
        res_ttl = _tick(c_tut, ttl_now)
        assert b_ttl in res_ttl["expiredIds"]
        wallet_after = c_stu.get("/api/wallet").json()["wallet"]
        assert wallet_after["balanceRub"] == 2500
        assert wallet_after["frozenRub"] == 0

        tg_texts = [body["text"] for _, body in sent if str(body.get("chat_id")) == "7101"]
        assert any("900 ₽" in t and "автоматически отменена" in t for t in tg_texts)
        assert any("1 000 ₽" in t and "не успел ответить" in t for t in tg_texts)

        # Повторный цикл не делает двойного возврата
        res_repeat = _tick(c_tut, ttl_now + timedelta(minutes=5))
        assert b_slot not in res_repeat["expiredIds"] and b_ttl not in res_repeat["expiredIds"]
        assert c_stu.get("/api/wallet").json()["wallet"]["balanceRub"] == 2500


def test_scheduler_telegram_reminders_24h_1h_retry_and_preferences(tmp_path: Path) -> None:
    app = create_api_app(_sched_settings(tmp_path, "rem.db"))
    sent: list[tuple[str, dict]] = []
    fail_flag = [False]
    with TestClient(app) as c_tut, TestClient(app) as c_stu:
        _mock_tg(app, sent, fail_flag=fail_flag)
        assert c_tut.post(
            "/api/auth/register",
            json={"username": "tut_rem", "password": "secret123", "displayName": "Ирина Р.", "role": "tutor"},
        ).status_code == 200
        assert c_stu.post(
            "/api/auth/register",
            json={"username": "stu_rem", "password": "secret123", "displayName": "Павел Р."},
        ).status_code == 200

        tut_uid = c_tut.get("/api/me").json()["user"]["id"]
        stu_uid = c_stu.get("/api/me").json()["user"]["id"]
        app.state.db.upsert_telegram_binding("7201", user_id=stu_uid, notifications_enabled=True)
        app.state.db.upsert_telegram_binding("7202", user_id=tut_uid, notifications_enabled=True)

        tid = c_tut.put(
            "/api/tutor/profile",
            json={"name": "Ирина Р.", "subject": "bio", "city": "Якутск", "timezone": "UTC+9", "price": 1200, "slots": {"4": ["18:00"]}},
        ).json()["tutor"]["id"]
        assert c_stu.post("/api/wallet/topup", json={"amount": 2000, "method": "sbp"}).status_code == 200

        # Занятие: 2026-12-10 18:00 UTC+9 = 2026-12-10 09:00 UTC
        bid = c_stu.post(
            "/api/bookings",
            json={"tutorId": tid, "offerPrice": 1200, "hour": "18:00", "dayIso": "2026-12-10"},
        ).json()["booking"]["id"]
        assert c_tut.post(f"/api/bookings/{bid}/accept").status_code == 200

        # За 30 ч до урока напоминание 24h ещё рано
        res_30h = _tick(c_tut, datetime(2026, 12, 9, 3, 0, tzinfo=timezone.utc))
        assert [r for r in res_30h["reminders"] if r["bookingId"] == bid] == []

        # За 18 ч до урока: оба получают 24h-напоминание с Телемостом
        res_18h = _tick(c_tut, datetime(2026, 12, 9, 15, 0, tzinfo=timezone.utc))
        bid_rems = [r for r in res_18h["reminders"] if r["bookingId"] == bid]
        assert {(r["kind"], r["role"]) for r in bid_rems} == {("24h", "student"), ("24h", "tutor")}
        assert any(b.get("chat_id") == "7201" and "за 24 часа" in b["text"] and "telemost.yandex.ru" in b["text"] for _, b in sent)
        assert any(b.get("chat_id") == "7202" and "за 24 часа" in b["text"] for _, b in sent)

        # Повтор в окне 24h не дублирует отправку
        sent.clear()
        res_18h_dup = _tick(c_tut, datetime(2026, 12, 9, 16, 0, tzinfo=timezone.utc))
        assert [r for r in res_18h_dup["reminders"] if r["bookingId"] == bid] == []

        # За 45 мин при временной ошибке сети TG напоминание НЕ помечается отправленным и повторяется
        fail_flag[0] = True
        res_fail = _tick(c_tut, datetime(2026, 12, 10, 8, 15, tzinfo=timezone.utc))
        assert [r for r in res_fail["reminders"] if r["bookingId"] == bid] == []
        assert app.state.db.has_lesson_reminder_sent(bid, "1h", "student") is False

        # Ученик отключает уведомления -> при восстановлении сети 1h получает только преподаватель
        fail_flag[0] = False
        app.state.db.set_telegram_notifications(stu_uid, False, by_user=True)
        res_1h = _tick(c_tut, datetime(2026, 12, 10, 8, 20, tzinfo=timezone.utc))
        bid_1h = [r for r in res_1h["reminders"] if r["bookingId"] == bid]
        assert bid_1h == [{"bookingId": bid, "kind": "1h", "role": "tutor"}]
        assert any(b.get("chat_id") == "7202" and "через 1 час" in b["text"] for _, b in sent)
        assert not any(b.get("chat_id") == "7201" and "через 1 час" in b["text"] for _, b in sent)


def test_admin_scheduler_endpoints_auth_and_manual_run(tmp_path: Path) -> None:
    app_open = create_api_app(_sched_settings(tmp_path, "adm_open.db"))
    with TestClient(app_open) as cli:
        st = cli.get("/api/admin/scheduler")
        assert st.status_code == 200
        st_json = st.json()
        assert st_json["ok"] is True and st_json["enabled"] is True and st_json["intervalSec"] == 60
        assert st_json["chatUnansweredDelaySec"] == 60
        assert st_json["chatCheckIntervalSec"] == 15

        run_r = cli.post("/api/admin/scheduler/run")
        assert run_r.status_code == 200
        run_json = run_r.json()
        assert run_json["ok"] is True
        assert run_json["result"]["capturedCount"] >= 1
        assert run_json["result"]["chatAlertsCount"] == 0
        assert run_json["scheduler"]["ticksTotal"] == 1

    secret = "sched-admin-tok"
    app_sec = create_api_app(_sched_settings(tmp_path, "adm_sec.db", admin_token=secret))
    with TestClient(app_sec) as cli:
        assert cli.get("/api/admin/scheduler").status_code == 401
        assert cli.post("/api/admin/scheduler/run").status_code == 401
        hdr = {"X-Admin-Token": secret}
        assert cli.get("/api/admin/scheduler", headers=hdr).status_code == 200
        assert cli.post("/api/admin/scheduler/run", headers=hdr).json()["scheduler"]["ticksTotal"] == 1
