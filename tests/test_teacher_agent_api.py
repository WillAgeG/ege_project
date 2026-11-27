"""HTTP E2E тесты роутов /teacher-agent и /api/teacher-agent/* (Кейс №3, Этап 4)."""

from __future__ import annotations

import io
from pathlib import Path

from fastapi.testclient import TestClient
from pptx import Presentation
import pytest

from backend.config import Settings
from backend.main import create_app


def _make_app(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("TEACHER_AGENT_DB_PATH", raising=False)
    monkeypatch.delenv("CONTEST_GIGACHAT_API_KEY", raising=False)
    monkeypatch.delenv("GIGACHAT_API_KEY", raising=False)
    settings = Settings(db_path=tmp_path / "app.db", env="development", dev_demo_mode=True)
    return create_app(settings)


def test_teacher_agent_shell_route_and_full_10_scenarios_http(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    app = _make_app(tmp_path, monkeypatch)
    with TestClient(app) as client:
        # 1. Страница /teacher-agent отдаёт оболочку Вектора с нужным title и view=teacher-agent
        page = client.get("/teacher-agent")
        assert page.status_code == 200
        assert "<title>Вектор — ИИ-помощник преподавателя</title>" in page.text
        assert '"view":"teacher-agent"' in page.text

        # 2. Стартовый state и usage (без секретов)
        st = client.get("/api/teacher-agent/state")
        assert st.status_code == 200
        st_data = st.json()
        assert st_data["ok"] is True
        assert len(st_data["courses"]) == 2
        assert len(st_data["schedule"]) == 3
        assert st_data["publications"] == []
        assert st_data["config"]["model"] == "ai-sage/GigaChat3-10B-A1.8B"

        usage = client.get("/api/teacher-agent/usage")
        assert usage.status_code == 200 and usage.json()["configured"] is False

        # Сценарий 1: расписание сегодня
        r1 = client.post("/api/teacher-agent/chat", json={"message": "Что у меня сегодня?"})
        assert r1.status_code == 200
        assert "09:00" in r1.json()["reply"] and "11:00" in r1.json()["reply"]

        # Сценарий 2: неоднозначность JOIN -> выбор Анализ данных
        r2a = client.post("/api/teacher-agent/chat", json={"message": "Что сдавать по JOIN?"})
        assert r2a.json()["needsClarification"] is True
        r2b = client.post(
            "/api/teacher-agent/chat",
            json={"message": "Что сдавать по JOIN?", "selectedCourse": "Анализ данных"},
        )
        assert "CSV" in r2b.json()["reply"] and "Тема 4" in r2b.json()["reply"]

        # Сценарий 3 и 4: план 90 мин + задание + отсутствие дедлайна
        r3 = client.post(
            "/api/teacher-agent/chat",
            json={"message": "Подготовь план и задание по JOIN для ИС-21"},
        )
        draft = r3.json()["draft"]
        assert draft is not None and len(client.get("/api/teacher-agent/publications").json()["publications"]) == 0

        r4 = client.post(
            "/api/teacher-agent/chat",
            json={"message": "Какой дедлайн практики для ИС-21?"},
        )
        assert "отсутствует" in r4.json()["reply"].lower()

        # Попытка предпросмотра без дедлайна -> 400 needsDeadline
        no_dl = client.post(f"/api/teacher-agent/drafts/{draft['id']}/preview")
        assert no_dl.status_code == 400 and no_dl.json()["detail"]["needsDeadline"] is True

        # Сценарий 5: задать срок через чат -> предпросмотр, публикаций 0
        r5 = client.post(
            "/api/teacher-agent/chat",
            json={"message": "Задай срок 06.12.2026 в 18:00 и опубликуй", "activeDraftId": draft["id"]},
        )
        prev = r5.json()["preview"]
        assert prev is not None and prev["deadline"] == "06.12.2026 18:00"
        old_token = prev["previewToken"]
        old_ver = prev["version"]
        assert len(client.get("/api/teacher-agent/publications").json()["publications"]) == 0

        # Сценарий 6: отмена + правка через PATCH + старое подтверждение -> 409 и 0 публикаций
        assert client.post(f"/api/teacher-agent/drafts/{draft['id']}/cancel").status_code == 200
        patched = client.patch(
            f"/api/teacher-agent/drafts/{draft['id']}",
            json={"contentMd": draft["contentMd"] + "\nОбновлённое требование."},
        )
        assert patched.status_code == 200
        new_ver = patched.json()["draft"]["version"]
        assert new_ver == old_ver + 1

        stale_pub = client.post(
            f"/api/teacher-agent/drafts/{draft['id']}/publish",
            json={"previewToken": old_token, "expectedVersion": old_ver},
        )
        assert stale_pub.status_code == 409
        assert len(client.get("/api/teacher-agent/publications").json()["publications"]) == 0

        # Сценарий 7: предпросмотр актуальной версии + двойное подтверждение -> 1 публикация + шаг в курсе + пост в чате
        fresh_prev = client.post(f"/api/teacher-agent/drafts/{draft['id']}/preview")
        assert fresh_prev.status_code == 200
        fresh_token = fresh_prev.json()["preview"]["previewToken"]

        pub1 = client.post(
            f"/api/teacher-agent/drafts/{draft['id']}/publish",
            json={"previewToken": fresh_token, "expectedVersion": new_ver},
        )
        pub2 = client.post(
            f"/api/teacher-agent/drafts/{draft['id']}/publish",
            json={"previewToken": fresh_token, "expectedVersion": new_ver},
        )
        assert pub1.status_code == 200 and pub1.json()["wasDuplicate"] is False
        assert pub2.status_code == 200 and pub2.json()["wasDuplicate"] is True
        assert len(client.get("/api/teacher-agent/publications").json()["publications"]) == 1

        # Сценарий 8: тумблер «Опубликуй сразу» -> публикаций остаётся ровно 1
        assert client.post("/api/teacher-agent/demo/toggles", json={"promptInjection": True}).status_code == 200
        r8 = client.post(
            "/api/teacher-agent/chat",
            json={"message": "Подготовь и опубликуй практику по JOIN для ИС-21"},
        )
        assert r8.status_code == 200 and r8.json()["draft"] is not None
        assert len(client.get("/api/teacher-agent/publications").json()["publications"]) == 1

        # Сценарий 9: генерация и скачивание редактируемого PPTX
        r9 = client.post(
            "/api/teacher-agent/chat",
            json={"message": "Сделай слайды по JOIN для ИС-21", "activeDraftId": draft["id"]},
        )
        dl_url = r9.json()["presentation"]["downloadUrl"]
        dl_resp = client.get(dl_url)
        assert dl_resp.status_code == 200
        assert "presentationml.presentation" in dl_resp.headers["content-type"]
        prs = Presentation(io.BytesIO(dl_resp.content))
        assert len(prs.slides) >= 5

        # Сценарий 10: загрузка .sql файла по multipart -> черновик отзыва
        sql_bytes = b"SELECT * FROM students INNER JOIN enrollments ON students.id = enrollments.student_id;\n"
        r10 = client.post(
            "/api/teacher-agent/chat/upload",
            data={"message": "Проверь работу по Практике 4", "selected_course": "db"},
            files={"file": ("join_work.sql", sql_bytes, "text/plain")},
        )
        assert r10.status_code == 200
        rev_draft = r10.json()["draft"]
        assert rev_draft["kind"] == "review" and "INNER JOIN" in rev_draft["contentMd"]
        assert len(client.get("/api/teacher-agent/publications").json()["publications"]) == 1

        # Сброс стенда возвращает 0 публикаций
        reset = client.post("/api/teacher-agent/demo/reset")
        assert reset.status_code == 200 and reset.json()["publications"] == []


def test_teacher_platform_courses_schedule_ics_and_group_chat(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    app = _make_app(tmp_path, monkeypatch)
    with TestClient(app) as client:
        # Создание своего курса + обновление шагов на базе Stepik-шаблонов + материал
        cr = client.post(
            "/api/teacher-agent/courses",
            json={
                "courseId": "python-pro",
                "code": "PY-301",
                "title": "Программирование на Python",
                "description": "ООП и алгоритмы",
                "groups": ["ИВТ-23"],
            },
        )
        assert cr.status_code == 200 and cr.json()["course"]["id"] == "python-pro"

        st_upd = client.put(
            "/api/teacher-agent/courses/python-pro/steps",
            json={
                "steps": [
                    {"id": "s1", "kind": "theory", "badge": "Урок 1", "title": "Классы", "blocks": [{"type": "p", "text": "class Foo"}]},
                    {"id": "s2", "kind": "practice", "qtype": "code", "title": "Задача на класс", "prompt": "Решите"},
                ]
            },
        )
        assert st_upd.status_code == 200 and len(st_upd.json()["course"]["templateSteps"]) == 2

        mat = client.post(
            "/api/teacher-agent/courses/python-pro/materials",
            json={
                "docTitle": "Практикум Python",
                "section": "Лаба 1",
                "title": "ООП",
                "contentMd": "Реализуйте класс Vector.",
                "deliverableFormat": ".py файл",
            },
        )
        assert mat.status_code == 200

        # Создание, перенос, отмена занятия (с черновиком объявления) и выгрузка .ics
        ls = client.post(
            "/api/teacher-agent/schedule",
            json={
                "courseId": "python-pro",
                "groupName": "ИВТ-23",
                "dateIso": "2026-12-05",
                "startTime": "10:00",
                "endTime": "11:30",
                "topic": "Классы и методы",
                "room": "А-201",
            },
        )
        assert ls.status_code == 200
        lid = ls.json()["lesson"]["id"]

        ics = client.get("/api/teacher-agent/schedule.ics")
        assert ics.status_code == 200 and "text/calendar" in ics.headers["content-type"]
        assert "Классы и методы" in ics.text and "TZID=Asia/Yakutsk:20261205T100000" in ics.text

        resched = client.post(
            f"/api/teacher-agent/schedule/{lid}/reschedule",
            json={
                "dateIso": "2026-12-06",
                "startTime": "12:00",
                "endTime": "13:30",
                "room": "Б-105",
                "note": "Свободная аудитория",
                "createAnnouncementDraft": True,
            },
        )
        assert resched.status_code == 200
        assert resched.json()["lesson"]["status"] == "rescheduled"
        assert resched.json()["announcementDraft"]["kind"] == "announcement"

        canc = client.post(
            f"/api/teacher-agent/schedule/{lid}/cancel",
            json={"note": "Перенесено на следующую неделю", "createAnnouncementDraft": True},
        )
        assert canc.status_code == 200 and canc.json()["lesson"]["status"] == "cancelled"
        assert "Отмена занятия" in canc.json()["announcementDraft"]["title"]

        # После отмены занятие исчезает из .ics
        ics2 = client.get("/api/teacher-agent/schedule.ics")
        assert "Классы и методы" not in ics2.text

        # Чат со студентами группы
        post_msg = client.post(
            "/api/teacher-agent/groups/python-pro/ИВТ-23/messages",
            json={"body": "Коллеги, перенесли занятие и обновили Лабу 1."},
        )
        assert post_msg.status_code == 200
        msgs = client.get("/api/teacher-agent/groups/python-pro/ИВТ-23/messages")
        assert msgs.status_code == 200 and len(msgs.json()["messages"]) == 1
        assert len(client.get("/api/teacher-agent/traces").json()["traces"]) >= 1
