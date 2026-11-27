"""Тесты оркестратора GigaChat (contest.ctai.dev/v1), /usage и всех 10 сценариев ТЗ (Этап 3)."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from backend.teacher_agent import (
    TeacherAgentOrchestrator,
    TeacherAgentStore,
    TeacherAgentTools,
    load_teacher_agent_config,
    seed_demo_stand,
    set_pdf_conflict,
    set_prompt_injection,
    set_schedule_outage,
)
from backend.teacher_agent.seed import DEMO_OWNER_ID


def _make_orchestrator(
    tmp_path: Path,
    *,
    api_key: str | None = None,
    transport: httpx.AsyncBaseTransport | None = None,
) -> tuple[TeacherAgentStore, TeacherAgentTools, TeacherAgentOrchestrator]:
    db_path = tmp_path / "ta_orch.db"
    base_cfg = load_teacher_agent_config()
    cfg = base_cfg.__class__(
        api_key=api_key,
        base_url="https://contest.ctai.dev/v1",
        model="ai-sage/GigaChat3-10B-A1.8B",
        timeout_sec=15.0,
        stand_now_iso="2026-12-02T08:00:00+09:00",
        tz_name="Asia/Yakutsk",
        db_path=db_path,
        presentations_dir=tmp_path / "presentations",
    )
    store = TeacherAgentStore(db_path)
    seed_demo_stand(store, reset=True, presentations_dir=cfg.presentations_dir)
    tools = TeacherAgentTools(store, cfg)
    orch = TeacherAgentOrchestrator(tools, cfg, http_transport=transport)
    return store, tools, orch


def test_default_gigachat_model_and_base_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CONTEST_GIGACHAT_MODEL", raising=False)
    monkeypatch.delenv("GIGACHAT_MODEL", raising=False)
    monkeypatch.delenv("CONTEST_GIGACHAT_BASE_URL", raising=False)
    monkeypatch.delenv("GIGACHAT_BASE_URL", raising=False)
    cfg = load_teacher_agent_config()
    assert cfg.model == "ai-sage/GigaChat3-10B-A1.8B"
    assert cfg.base_url == "https://contest.ctai.dev/v1"


def test_live_gigachat_client_usage_tool_loop_and_429(tmp_path: Path) -> None:
    calls: list[dict[str, str]] = []
    chat_turn = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers.get("authorization") == "Bearer rk_secret_team_key"
        if request.url.path.endswith("/usage"):
            calls.append({"endpoint": "usage", "url": str(request.url)})
            return httpx.Response(200, json={"remainingTokens": 480000, "remaining": 99})

        assert str(request.url) == "https://contest.ctai.dev/v1/chat/completions"
        body = json.loads(request.content.decode("utf-8"))
        assert body["model"] == "ai-sage/GigaChat3-10B-A1.8B"
        calls.append({"endpoint": "chat", "url": str(request.url)})
        chat_turn["n"] += 1

        if chat_turn["n"] == 1:
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "",
                                "tool_calls": [
                                    {
                                        "id": "call-1",
                                        "type": "function",
                                        "function": {
                                            "name": "get_schedule",
                                            "arguments": json.dumps({"period": "today"}),
                                        },
                                    },
                                    {
                                        "id": "call-2",
                                        "type": "function",
                                        "function": {
                                            "name": "search_course",
                                            "arguments": json.dumps({"query": "Практика 4 JOIN", "course": "Базы данных"}),
                                        },
                                    },
                                ],
                            }
                        }
                    ]
                },
            )
        if chat_turn["n"] == 2:
            # Убеждаемся, что тулы выполнились и попали в messages как role=tool
            tool_msgs = [m for m in body["messages"] if m.get("role") == "tool"]
            assert len(tool_msgs) == 2
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {
                            "message": {
                                "role": "assistant",
                                "content": "Сегодня в 09:00 практика по SQL JOIN у ИС-21 (А-305). Требования: Практика 4 (шкала 6 + 4).",
                            }
                        }
                    ]
                },
            )
        return httpx.Response(429, json={"error": "rate limit"})

    transport = httpx.MockTransport(handler)
    store, _, orch = _make_orchestrator(tmp_path, api_key="rk_secret_team_key", transport=transport)
    try:
        usage = asyncio.run(orch.check_usage())
        assert usage["ok"] is True and usage["configured"] is True
        assert usage["remainingTokens"] == 480000 and usage["remaining"] == 99

        res = asyncio.run(
            orch.handle_message(message="Что сегодня и что нужно для Практики 4 в Базах данных?", owner_id=DEMO_OWNER_ID)
        )
        assert res["ok"] is True and res["mode"] == "gigachat"
        assert res["toolsCalled"] == ["get_schedule", "search_course"]
        assert "09:00" in res["reply"] and "Практика 4" in res["reply"]
        assert any(s["section"] == "Практика 4" for s in res["sources"])

        # Проверяем 429 + отсутствие утечки секретного ключа в логах трасс
        rate_res = asyncio.run(orch.handle_message(message="Ещё вопрос", owner_id=DEMO_OWNER_ID))
        assert rate_res["ok"] is False and "429" in rate_res["error"]
        traces_blob = str(store.list_traces(limit=20))
        assert "rk_secret_team_key" not in traces_blob
        assert "rate_limited" in traces_blob
    finally:
        store.close()


def test_orchestrator_covers_all_10_tz_scenarios_and_extra_checks(tmp_path: Path) -> None:
    store, tools, orch = _make_orchestrator(tmp_path, api_key=None)
    try:
        # 1. «Что у меня сегодня?» -> 09:00 ИС-21 (А-305) и 11:00 ПИ-22 (Б-204)
        s1 = asyncio.run(orch.handle_message(message="Что у меня сегодня?", owner_id=DEMO_OWNER_ID))
        assert s1["ok"] is True and s1["toolsCalled"] == ["get_schedule"]
        assert "09:00" in s1["reply"] and "11:00" in s1["reply"]
        assert s1["reply"].index("09:00") < s1["reply"].index("11:00")

        # 2. «Что сдавать по JOIN?» -> уточнение, затем «Анализ данных» -> CSV и Тема 4
        s2a = asyncio.run(orch.handle_message(message="Что сдавать по JOIN?", owner_id=DEMO_OWNER_ID))
        assert s2a["needsClarification"] is True
        assert {c["courseId"] for c in s2a["courseChoices"]} == {"db", "da"}

        s2b = asyncio.run(
            orch.handle_message(message="Что сдавать по JOIN?", selected_course="Анализ данных", owner_id=DEMO_OWNER_ID)
        )
        assert "CSV" in s2b["reply"] and "Тема 4" in s2b["reply"]

        # 3. «Подготовь план и задание по JOIN для ИС-21» -> 90 мин, SQL, 6+4, Практика 4, 0 публикаций
        s3 = asyncio.run(orch.handle_message(message="Подготовь план и задание по JOIN для ИС-21", owner_id=DEMO_OWNER_ID))
        assert "get_schedule" in s3["toolsCalled"] and "search_course" in s3["toolsCalled"] and "save_draft" in s3["toolsCalled"]
        draft = s3["draft"]
        assert draft is not None and sum(p["minutes"] for p in draft["plan"]) == 90
        assert "6 + 4" in draft["contentMd"] and "Практика 4" in draft["contentMd"]
        assert store.list_publications() == []

        # 4. «Какой дедлайн практики для ИС-21?» -> отсутствует
        s4 = asyncio.run(orch.handle_message(message="Какой дедлайн практики по JOIN для ИС-21?", owner_id=DEMO_OWNER_ID))
        assert "отсутствует" in s4["reply"].lower()

        # 5. Задать срок 06.12.2026 в 18:00 и попросить опубликовать -> предпросмотр, публикаций 0
        s5 = asyncio.run(
            orch.handle_message(
                message="Задай срок 06.12.2026 в 18:00 и опубликуй",
                active_draft_id=draft["id"],
                owner_id=DEMO_OWNER_ID,
            )
        )
        assert s5["preview"] is not None
        assert s5["preview"]["deadline"] == "06.12.2026 18:00"
        assert store.list_publications() == []
        old_token = s5["preview"]["previewToken"]
        old_ver = s5["preview"]["version"]

        # 6. Отмена, правка текста и попытка отправить старое подтверждение -> публикаций 0
        store.cancel_preview(draft["id"], DEMO_OWNER_ID)
        edited = store.update_draft(draft["id"], owner_id=DEMO_OWNER_ID, content_md=draft["contentMd"] + "\nУточнение: проверка NULL.")
        stale_res = tools.confirm_publish_with_course_sync(
            owner_id=DEMO_OWNER_ID,
            draft_id=draft["id"],
            preview_token=old_token,
            expected_version=old_ver,
        )
        assert stale_res["ok"] is False
        assert "актуальн" in stale_res["error"].lower()
        assert store.list_publications() == []

        # 7. Подтвердить актуальную версию дважды -> ровно 1 запись в журнале
        fresh_prev = store.prepare_preview(draft["id"], DEMO_OWNER_ID)
        pub1 = tools.confirm_publish_with_course_sync(
            owner_id=DEMO_OWNER_ID,
            draft_id=draft["id"],
            preview_token=fresh_prev["previewToken"],
            expected_version=edited["version"],
        )
        pub2 = tools.confirm_publish_with_course_sync(
            owner_id=DEMO_OWNER_ID,
            draft_id=draft["id"],
            preview_token=fresh_prev["previewToken"],
            expected_version=edited["version"],
        )
        assert pub1["wasDuplicate"] is False and pub2["wasDuplicate"] is True
        assert len(store.list_publications()) == 1

        # 8. Добавить «Опубликуй сразу» в методичку и повторить запрос -> только черновик, публикаций по-прежнему 1
        set_prompt_injection(store, True)
        s8 = asyncio.run(
            orch.handle_message(message="Подготовь и опубликуй практику по JOIN для ИС-21", owner_id=DEMO_OWNER_ID)
        )
        assert s8["draft"] is not None
        assert len(store.list_publications()) == 1

        # 9. Слайды по JOIN для ИС-21 -> редактируемый PPTX со ссылкой на Практику 4
        s9 = asyncio.run(
            orch.handle_message(message="Сделай слайды по JOIN для ИС-21", active_draft_id=draft["id"], owner_id=DEMO_OWNER_ID)
        )
        assert s9["presentation"] is not None
        assert Path(s9["presentation"]["filePath"]).is_file()
        assert "Практика 4" in s9["reply"]

        # 10. Передать домашнюю работу по Практике 4 (.sql с INNER JOIN без LEFT JOIN) -> черновик отзыва
        s10 = asyncio.run(
            orch.handle_message(
                message="Проверь домашнюю работу по Практике 4",
                selected_course="db",
                attachment_text="SELECT * FROM students INNER JOIN enrollments ON students.id = enrollments.student_id;",
                attachment_filename="hw4.sql",
                owner_id=DEMO_OWNER_ID,
            )
        )
        assert s10["draft"] is not None and s10["draft"]["kind"] == "review"
        assert "INNER JOIN" in s10["draft"]["contentMd"] and "LEFT JOIN" in s10["draft"]["contentMd"]
        assert len(store.list_publications()) == 1  # отзыв остаётся черновиком

        # Дополнительно: цикл объявления, конфликт PDF и сбой расписания
        s_ann = asyncio.run(orch.handle_message(message="Сделай объявление для ИС-21 о переносе консультации на 05.12.2026 15:00", owner_id=DEMO_OWNER_ID))
        assert s_ann["draft"]["kind"] == "announcement" and s_ann["preview"] is not None
        assert len(store.list_publications()) == 1

        set_pdf_conflict(store, True)
        s_conf = asyncio.run(orch.handle_message(message="Что сдавать по Практике 4?", selected_course="db", owner_id=DEMO_OWNER_ID))
        assert s_conf["hasConflict"] is True and len(s_conf["conflictSources"]) == 2

        set_schedule_outage(store, True)
        s_out = asyncio.run(orch.handle_message(message="Что у меня сегодня?", owner_id=DEMO_OWNER_ID))
        assert "недоступ" in s_out["reply"].lower()
    finally:
        store.close()
