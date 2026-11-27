"""Тесты изолированного хранилища, демо-стенда и инвариантов публикации (Кейс №3, Этап 1)."""

from __future__ import annotations

from pathlib import Path

import pytest

from backend.teacher_agent import (
    TeacherAgentStore,
    load_teacher_agent_config,
    seed_demo_stand,
    set_pdf_conflict,
    set_prompt_injection,
    set_schedule_outage,
)


def test_teacher_agent_config_and_demo_seed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    db_file = tmp_path / "ta_test.db"
    monkeypatch.setenv("TEACHER_AGENT_DB_PATH", str(db_file))
    monkeypatch.delenv("CONTEST_GIGACHAT_API_KEY", raising=False)
    monkeypatch.delenv("GIGACHAT_API_KEY", raising=False)

    cfg = load_teacher_agent_config()
    assert cfg.db_path == db_file
    assert cfg.tz_name == "Asia/Yakutsk"
    assert cfg.stand_now_iso == "2026-12-02T08:00:00+09:00"
    assert cfg.base_url == "https://contest.ctai.dev/v1"
    assert cfg.enabled is False

    store = TeacherAgentStore(cfg.db_path)
    try:
        summary = seed_demo_stand(store, reset=True, presentations_dir=cfg.presentations_dir)
        assert summary["coursesCount"] == 2
        assert summary["lessonsCount"] == 3
        assert summary["publicationsCount"] == 0

        # Таблица п. 4.1 ТЗ: на 02.12.2026 две пары 09:00 и 11:00
        today_lessons = store.list_schedule(date_from="2026-12-02", date_to="2026-12-02")
        assert [(l["startTime"], l["courseTitle"], l["groupName"], l["room"]) for l in today_lessons] == [
            ("09:00", "Базы данных", "ИС-21", "аудитория А-305"),
            ("11:00", "Анализ данных", "ПИ-22", "аудитория Б-204"),
        ]
        assert store.list_publications() == []

        # Материалы п. 4.1: в БД нет дедлайна, шкала 6+4; в Анализе данных — CSV и Тема 4
        db_mats = store.search_materials("JOIN", course_id="db")
        assert len(db_mats) == 1
        assert db_mats[0]["section"] == "Практика 4"
        assert db_mats[0]["deadline"] is None
        assert [c["maxPoints"] for c in db_mats[0]["rubric"]] == [6, 4]

        da_mats = store.search_materials("JOIN", course_id="da")
        assert len(da_mats) == 1
        assert da_mats[0]["section"] == "Тема 4"
        assert "CSV" in da_mats[0]["deliverableFormat"]
    finally:
        store.close()


def test_custom_course_templates_schedule_lifecycle_and_group_chat(tmp_path: Path) -> None:
    store = TeacherAgentStore(tmp_path / "ta_courses.db")
    try:
        seed_demo_stand(store, reset=True)

        # Преподаватель создаёт собственный курс на платформе с шагами в формате Stepik-шаблонов
        custom = store.create_course(
            course_id="algo-2026",
            code="ALG-101",
            title="Алгоритмы и структуры данных",
            description="Графы, деревья и динамическое программирование.",
            groups=["ИС-21", "ПИ-22"],
            owner_id="demo-teacher",
            template_steps=[
                {
                    "id": "alg-1",
                    "kind": "theory",
                    "badge": "Теория",
                    "title": "Обход графа в ширину (BFS)",
                    "blocks": [{"type": "p", "text": "BFS использует очередь."}],
                },
                {
                    "id": "alg-2",
                    "kind": "practice",
                    "qtype": "code",
                    "badge": "Задача",
                    "title": "Реализуйте BFS",
                    "prompt": "Выведите порядок вершин.",
                },
            ],
        )
        assert custom["id"] == "algo-2026"
        assert len(custom["templateSteps"]) == 2

        updated_course = store.update_course_steps(
            "algo-2026",
            "demo-teacher",
            custom["templateSteps"] + [{"id": "alg-3", "kind": "test", "qtype": "single", "title": "Сложность BFS", "options": ["O(V+E)"], "answer": 0}],
        )
        assert len(updated_course["templateSteps"]) == 3

        # Проверка прав доступа: чужой пользователь не может менять курс или расписание
        with pytest.raises(PermissionError):
            store.update_course_steps("algo-2026", "other-teacher", [])

        # Добавление, перенос и отмена занятия в расписании преподавателя
        lesson = store.create_lesson(
            course_id="algo-2026",
            group_name="ИС-21",
            date_iso="2026-12-03",
            start_time="10:00",
            end_time="11:30",
            topic="BFS и кратчайшие пути",
            room="А-401",
            owner_id="demo-teacher",
        )
        assert lesson["durationMin"] == 90 and lesson["status"] == "scheduled"

        moved = store.reschedule_lesson(
            lesson["id"],
            owner_id="demo-teacher",
            date_iso="2026-12-03",
            start_time="12:00",
            end_time="13:30",
            room="Б-102",
            note="Перенос по просьбе группы",
        )
        assert moved["startTime"] == "12:00" and moved["room"] == "Б-102" and moved["status"] == "rescheduled"

        cancelled = store.cancel_lesson(lesson["id"], owner_id="demo-teacher", note="Преподаватель в командировке")
        assert cancelled["status"] == "cancelled"
        active_Dec3 = store.list_schedule(date_from="2026-12-03", date_to="2026-12-03", include_cancelled=False)
        assert active_Dec3 == []

        # Общение со студентами группы напрямую
        msg = store.post_group_message(
            course_id="algo-2026",
            group_name="ИС-21",
            sender_role="teacher",
            sender_name="Преподаватель (демо)",
            body="Пара 03.12 отменена, изучите теорию BFS в курсе.",
        )
        assert msg["groupName"] == "ИС-21"
        msgs = store.list_group_messages(course_id="algo-2026", group_name="ИС-21")
        assert len(msgs) == 1
    finally:
        store.close()


def test_draft_versioning_invalidation_idempotent_publish_and_toggles(tmp_path: Path) -> None:
    store = TeacherAgentStore(tmp_path / "ta_pub.db")
    try:
        seed_demo_stand(store, reset=True)

        draft = store.create_draft(
            kind="homework",
            course_id="db",
            group_name="ИС-21",
            title="Практика 4 · SQL JOIN",
            content_md="Реализуйте INNER JOIN и LEFT JOIN.",
            criteria=[{"name": "JOIN", "maxPoints": 6}, {"name": "Пояснение", "maxPoints": 4}],
            sources=[{"docId": "db-manual-2026", "section": "Практика 4"}],
            deadline=None,
            owner_id="demo-teacher",
        )
        assert draft["version"] == 1

        # Без дедлайна ДЗ нельзя перевести в предпросмотр публикации
        with pytest.raises(ValueError, match="дедлайн"):
            store.prepare_preview(draft["id"], "demo-teacher")

        # Задаём дедлайн -> версия 2 -> открываем предпросмотр -> токен выдан
        v2 = store.update_draft(draft["id"], owner_id="demo-teacher", deadline="06.12.2026 18:00")
        assert v2["version"] == 2
        prev2 = store.prepare_preview(draft["id"], "demo-teacher")
        old_token = prev2["previewToken"]
        assert prev2["version"] == 2 and old_token

        # Сценарий 6: редактирование после отмены сбрасывает подтверждение, старый токен больше не работает
        store.cancel_preview(draft["id"], "demo-teacher")
        v3 = store.update_draft(
            draft["id"],
            owner_id="demo-teacher",
            content_md="Реализуйте INNER JOIN, LEFT JOIN и приложите сравнение строк.",
        )
        assert v3["version"] == 3 and v3["previewToken"] is None
        with pytest.raises(ValueError):
            store.confirm_publish(draft["id"], owner_id="demo-teacher", preview_token=old_token, expected_version=2)
        assert store.list_publications() == []

        # Сценарий 7: актуальный предпросмотр и двойное подтверждение -> ровно ОДНА публикация + 1 пост в чат группы
        prev3 = store.prepare_preview(draft["id"], "demo-teacher")
        pub1, dup1 = store.confirm_publish(
            draft["id"],
            owner_id="demo-teacher",
            preview_token=prev3["previewToken"],
            expected_version=3,
        )
        pub2, dup2 = store.confirm_publish(
            draft["id"],
            owner_id="demo-teacher",
            preview_token=prev3["previewToken"],
            expected_version=3,
        )
        assert dup1 is False and dup2 is True
        assert pub1["id"] == pub2["id"]
        assert len(store.list_publications()) == 1

        group_msgs = store.list_group_messages(course_id="db", group_name="ИС-21")
        pub_msgs = [m for m in group_msgs if m["publicationId"] == pub1["id"]]
        assert len(pub_msgs) == 1
        assert "06.12.2026 18:00" in pub_msgs[0]["body"]

        # Тумблеры стенда и аудит-лог без текстов и ПДн
        set_pdf_conflict(store, True)
        conflict_hits = store.search_materials("Практика 4", course_id="db")
        assert any(m["isConflictDoc"] and "PDF" in m["deliverableFormat"] for m in conflict_hits)

        set_prompt_injection(store, True)
        inj_hits = store.search_materials("Опубликуй сразу", course_id="db")
        assert any(m["isInjectionDoc"] for m in inj_hits)

        set_schedule_outage(store, True)
        assert store.get_stand_state()["schedule_outage"] == "1"

        tr = store.record_trace(
            request_id="req-1",
            trace_id="trace-1",
            tool_name="search_course",
            status="ok",
            duration_ms=12,
            source_refs=["db-manual-2026#Практика 4"],
        )
        assert tr["toolName"] == "search_course"
        assert len(store.list_traces()) == 1

        # Сброс стенда полностью возвращает исходное состояние п. 4.1
        reset_summary = seed_demo_stand(store, reset=True)
        assert reset_summary["publicationsCount"] == 0
        assert store.list_publications() == []
        assert store.list_traces() == []
        assert store.get_stand_state()["schedule_outage"] == "0"
    finally:
        store.close()


def test_claim_initial_seed_is_idempotent(tmp_path: Path) -> None:
    store = TeacherAgentStore(tmp_path / "ta_claim.db")
    try:
        assert store.claim_initial_seed() is True
        assert store.claim_initial_seed() is False
        store.clear_all_tables()
        assert store.claim_initial_seed() is True
    finally:
        store.close()
