"""Тесты Realtime Hub (SSE + WebSocket) и двусторонней синхронизации календаря (.ics / Google Calendar)."""

import json
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from backend.calendar_sync import parse_ics_busy_slots
from backend.config import AIConfig, GoogleOAuthConfig, Settings
from backend.main import create_app


def _make_settings(tmp_path: Path) -> Settings:
    return Settings(
        db_path=tmp_path / "rt_cal.db",
        ai=AIConfig(None, None, None, None, None),
        google=GoogleOAuthConfig(None, None),
        public_base_url="https://vektor-ege.example",
    )


def _parse_sse_events(body: str) -> list[dict[str, str]]:
    blocks = [b.strip() for b in body.strip().split("\n\n") if b.strip()]
    parsed: list[dict[str, str]] = []
    for block in blocks:
        item: dict[str, str] = {}
        data_lines: list[str] = []
        for line in block.splitlines():
            if line.startswith(":"):
                continue
            if line.startswith("event:"):
                item["event"] = line[len("event:"):].strip()
            elif line.startswith("id:"):
                item["id"] = line[len("id:"):].strip()
            elif line.startswith("data:"):
                data_lines.append(line[len("data:"):].strip())
        if data_lines:
            item["data"] = "\n".join(data_lines)
        if item:
            parsed.append(item)
    return parsed


def test_health_and_storage_endpoint(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        r_health = client.get("/api/health")
        assert r_health.status_code == 200
        assert r_health.json() == {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": False, "provider": None},
        }

        r_storage = client.get("/api/health/storage")
        assert r_storage.status_code == 200
        data = r_storage.json()
        assert data["ok"] is True
        assert data["mode"] == "sqlite"
        assert data["sqlite"] == "ok"


def test_realtime_publish_recent_and_sse_replay(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        r1 = client.post(
            "/api/realtime/publish",
            json={
                "channel": "tutor",
                "eventType": "market.bid.created",
                "title": "Новая ставка 1 200 ₽",
                "message": "Алина С. · Биология · Сб 16:00",
                "tutorSlug": "anna-sokolova",
                "payload": {"offerPrice": 1200},
            },
        )
        assert r1.status_code == 200
        ev1 = r1.json()["event"]

        client.post(
            "/api/realtime/publish",
            json={
                "channel": "student",
                "eventType": "lesson.confirmed",
                "title": "Урок подтверждён",
                "tutorSlug": "other-tutor",
            },
        )

        r2 = client.post(
            "/api/realtime/publish",
            json={
                "channel": "tutor",
                "eventType": "calendar.slot.updated",
                "title": "Обновлён слот 18:00",
                "tutorSlug": "anna-sokolova",
            },
        )
        assert r2.status_code == 200
        ev2 = r2.json()["event"]
        assert ev2["id"] > ev1["id"]

        r_recent = client.get("/api/realtime/recent", params={"channel": "tutor", "tutor_slug": "anna-sokolova"})
        assert r_recent.status_code == 200
        events = r_recent.json()["events"]
        assert [e["id"] for e in events] == [ev1["id"], ev2["id"]]

        r_sse_all = client.get("/api/realtime/stream?channel=tutor&tutor_slug=anna-sokolova&once=1")
        assert r_sse_all.status_code == 200
        assert r_sse_all.headers["content-type"].startswith("text/event-stream")
        frames_all = _parse_sse_events(r_sse_all.text)
        assert frames_all[0]["event"] == "connected"
        conn_payload = json.loads(frames_all[0]["data"])
        assert conn_payload["transport"] == "sse"
        assert conn_payload["channel"] == "tutor"
        assert conn_payload["latestId"] == ev2["id"]
        assert len(conn_payload["events"]) == 2

        r_sse_replay = client.get(
            "/api/realtime/stream?channel=tutor&tutor_slug=anna-sokolova&once=1",
            headers={"Last-Event-ID": str(ev1["id"])},
        )
        assert r_sse_replay.status_code == 200
        frames_replay = _parse_sse_events(r_sse_replay.text)
        assert frames_replay[0]["event"] == "connected"
        msg_frames = [f for f in frames_replay if f.get("event") == "message"]
        assert len(msg_frames) == 1
        assert msg_frames[0]["id"] == str(ev2["id"])
        assert json.loads(msg_frames[0]["data"])["title"] == "Обновлён слот 18:00"


def test_realtime_websocket_broadcast_two_clients(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        with client.websocket_connect("/api/realtime/ws?channel=tutor&tutor_slug=anna-sokolova") as ws1:
            c1 = ws1.receive_json()
            assert c1["type"] == "connected"
            assert c1["transport"] == "ws"

            ws1.send_json({"type": "ping"})
            pong = ws1.receive_json()
            assert pong["type"] == "pong"

            with client.websocket_connect("/api/realtime/ws?channel=tutor&tutor_slug=anna-sokolova") as ws2:
                c2 = ws2.receive_json()
                assert c2["type"] == "connected"

                ws1.send_json(
                    {
                        "type": "publish",
                        "eventType": "market.bid.created",
                        "title": "Ставка через WS",
                        "message": "1 300 ₽/ч",
                        "payload": {"price": 1300},
                    }
                )
                m1 = ws1.receive_json()
                m2 = ws2.receive_json()
                assert m1["type"] == "event"
                assert m2["type"] == "event"
                assert m1["event"]["title"] == "Ставка через WS"
                assert m2["event"]["eventType"] == "market.bid.created"

                r_pub = client.post(
                    "/api/realtime/publish",
                    json={
                        "channel": "tutor",
                        "eventType": "market.bid.created",
                        "title": "Ставка через REST",
                        "tutorSlug": "anna-sokolova",
                    },
                )
                assert r_pub.status_code == 200
                m1_rest = ws1.receive_json()
                m2_rest = ws2.receive_json()
                assert m1_rest["event"]["title"] == "Ставка через REST"
                assert m2_rest["event"]["title"] == "Ставка через REST"


def test_calendar_sync_and_ics_feed_timezones(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        r_ykt = client.put(
            "/api/calendar/sync",
            json={
                "tutorSlug": "anna-ykt",
                "tutorName": "Анна Соколова",
                "city": "Якутск",
                "timezone": "UTC+9",
                "openSlots": {"6": ["14:00", "16:00"]},
                "lessons": [
                    {
                        "id": "lesson-ykt-1",
                        "studentName": "Алина С.",
                        "subjectName": "Биология",
                        "exam": "ЕГЭ",
                        "dow": 6,
                        "slotDate": "2026-11-14",
                        "hour": "16:00",
                        "counterPrice": 1200,
                        "status": "accepted",
                    }
                ],
            },
        )
        assert r_ykt.status_code == 200
        ykt_data = r_ykt.json()
        assert ykt_data["timezone"] == "UTC+9"
        assert ykt_data["ianaTimezone"] == "Asia/Yakutsk"
        assert ykt_data["eventCount"] == 1
        assert ykt_data["icsUrl"].endswith(f"/api/calendar/{ykt_data['feedToken']}.ics")

        tpl_qs = parse_qs(urlparse(ykt_data["googleTemplateUrl"]).query)
        assert tpl_qs["dates"] == ["20261114T070000Z/20261114T080000Z"]
        assert tpl_qs["ctz"] == ["Asia/Yakutsk"]

        r_ics_ykt = client.get(f"/api/calendar/{ykt_data['feedToken']}.ics")
        assert r_ics_ykt.status_code == 200
        assert "text/calendar" in r_ics_ykt.headers["content-type"]
        ics_ykt = r_ics_ykt.text
        assert "\r\n" in ics_ykt
        assert "BEGIN:VCALENDAR" in ics_ykt
        assert "BEGIN:VTIMEZONE" in ics_ykt
        assert "TZID:Asia/Yakutsk" in ics_ykt
        assert "TZOFFSETTO:+0900" in ics_ykt
        assert "DTSTART;TZID=Asia/Yakutsk:20261114T160000" in ics_ykt
        assert "SUMMARY:Урок ЕГЭ: Алина С. (Биология)" in ics_ykt

        r_msk = client.put(
            "/api/calendar/sync",
            json={
                "tutorSlug": "ivan-msk",
                "tutorName": "Иван Петров",
                "city": "Москва",
                "timezone": "UTC+3",
                "lessons": [
                    {
                        "id": "lesson-msk-1",
                        "studentName": "Тимур К.",
                        "subjectName": "Химия",
                        "exam": "ЕГЭ",
                        "dow": 6,
                        "slotDate": "2026-11-14",
                        "hour": "16:00",
                        "counterPrice": 1500,
                        "status": "accepted",
                    }
                ],
            },
        )
        assert r_msk.status_code == 200
        msk_data = r_msk.json()
        assert msk_data["ianaTimezone"] == "Europe/Moscow"
        msk_qs = parse_qs(urlparse(msk_data["googleTemplateUrl"]).query)
        assert msk_qs["dates"] == ["20261114T130000Z/20261114T140000Z"]
        assert msk_qs["ctz"] == ["Europe/Moscow"]

        r_ics_msk = client.get(f"/api/calendar/{msk_data['feedToken']}.ics")
        assert r_ics_msk.status_code == 200
        assert "TZID:Europe/Moscow" in r_ics_msk.text
        assert "TZOFFSETTO:+0300" in r_ics_msk.text
        assert "DTSTART;TZID=Europe/Moscow:20261114T160000" in r_ics_msk.text

        assert client.get("/api/calendar/nonexistent-token-xyz.ics").status_code == 404


def test_calendar_import_ics_two_way_and_timezone_math(tmp_path: Path) -> None:
    sample_ics = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:gcal-utc-1@google.com\r\n"
        "DTSTART:20261114T070000Z\r\n"
        "DTEND:20261114T080000Z\r\n"
        "SUMMARY:Консультация в \r\n Google Meet\r\n"
        "STATUS:CONFIRMED\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:gcal-msk-2@google.com\r\n"
        "DTSTART;TZID=Europe/Moscow:20261115T100000\r\n"
        "DTEND;TZID=Europe/Moscow:20261115T120000\r\n"
        "SUMMARY:Созвон по олимпиаде\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:gcal-cancelled@google.com\r\n"
        "DTSTART:20261114T090000Z\r\n"
        "DTEND:20261114T100000Z\r\n"
        "SUMMARY:Отменённое событие\r\n"
        "STATUS:CANCELLED\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )

    msk_slots = parse_ics_busy_slots(sample_ics, target_timezone="UTC+3")
    assert any(s["uid"] == "gcal-utc-1@google.com" and s["hour"] == "10:00" and s["dow"] == 6 for s in msk_slots)
    assert all(s["uid"] != "gcal-cancelled@google.com" for s in msk_slots)

    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        r_imp = client.post(
            "/api/calendar/import-ics",
            json={
                "tutorSlug": "anna-ykt",
                "tutorName": "Анна Соколова",
                "city": "Якутск",
                "timezone": "UTC+9",
                "icsText": sample_ics,
                "lessons": [
                    {
                        "id": "lesson-conflict-1",
                        "studentName": "Алина С.",
                        "subjectName": "Биология",
                        "exam": "ЕГЭ",
                        "dow": 6,
                        "slotDate": "2026-11-14",
                        "hour": "16:00",
                        "counterPrice": 1200,
                        "status": "accepted",
                    }
                ],
            },
        )
        assert r_imp.status_code == 200
        imp = r_imp.json()
        assert imp["importedCount"] == 3
        busy = imp["busySlots"]
        assert any(s["uid"] == "gcal-utc-1@google.com" and s["hour"] == "16:00" and s["dow"] == 6 and s["summary"] == "Консультация в Google Meet" for s in busy)
        assert [s["hour"] for s in busy if s["uid"] == "gcal-msk-2@google.com"] == ["16:00", "17:00"]
        assert all(s["dow"] == 0 for s in busy if s["uid"] == "gcal-msk-2@google.com")

        assert len(imp["conflicts"]) == 1
        assert imp["conflicts"][0]["studentName"] == "Алина С."
        assert imp["conflicts"][0]["hour"] == "16:00"

        r_feed = client.get(f"/api/calendar/{imp['feedToken']}.ics")
        assert r_feed.status_code == 200
        assert "SUMMARY:Занято (Google Calendar)" in r_feed.text

        r_state = client.get("/api/calendar/state", params={"tutor_slug": "anna-ykt"})
        assert r_state.status_code == 200
        assert r_state.json()["synced"] is True
        assert len(r_state.json()["busySlots"]) == 3

        r_rt = client.get("/api/realtime/recent", params={"channel": "tutor", "tutor_slug": "anna-ykt"})
        assert r_rt.status_code == 200
        assert any(e["eventType"] == "calendar.synced" for e in r_rt.json()["events"])


def test_calendar_import_ics_ssrf_guard(tmp_path: Path) -> None:
    app = create_app(_make_settings(tmp_path))
    with TestClient(app) as client:
        for bad_url in (
            "http://127.0.0.1:8770/secret.ics",
            "https://localhost/cal.ics",
            "https://10.0.0.5/cal.ics",
            "https://169.254.169.254/latest/meta-data",
            "ftp://example.com/cal.ics",
        ):
            r = client.post(
                "/api/calendar/import-ics",
                json={"tutorSlug": "anna-ykt", "timezone": "UTC+9", "icsUrl": bad_url},
            )
            assert r.status_code == 400, bad_url
            assert r.json()["detail"]["code"] == "invalid_ics_url"
