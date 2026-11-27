"""Конфигурация ИИ-помощника преподавателя вуза и шлюза GigaChat."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any

from ..config import ROOT_DIR


@dataclass(frozen=True)
class TeacherAgentConfig:
    """Настройки подключения к GigaChat и изолированного хранилища стенда."""

    api_key: str | None
    base_url: str
    model: str
    timeout_sec: float
    stand_now_iso: str
    tz_name: str
    db_path: Path
    presentations_dir: Path

    @property
    def enabled(self) -> bool:
        return bool(self.api_key)


def _float_env(name: str, default: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        val = float(raw)
        return val if val > 0 else default
    except ValueError:
        return default


def resolve_teacher_agent_db_path(settings: Any = None) -> Path:
    explicit = os.environ.get("TEACHER_AGENT_DB_PATH", "").strip()
    if explicit:
        return Path(explicit)
    if settings is not None and getattr(settings, "db_path", None):
        return Path(settings.db_path).parent / "teacher_agent.db"
    vol = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", "").strip()
    if vol:
        return Path(vol) / "teacher_agent.db"
    return ROOT_DIR / ".local_data" / "teacher_agent.db"


def load_teacher_agent_config(settings: Any = None) -> TeacherAgentConfig:
    """Загружает конфигурацию агента из переменных окружения без хардкода секретов."""
    api_key = (
        os.environ.get("CONTEST_GIGACHAT_API_KEY", "").strip()
        or os.environ.get("GIGACHAT_API_KEY", "").strip()
        or None
    )
    base_url = (
        os.environ.get("CONTEST_GIGACHAT_BASE_URL", "").strip()
        or os.environ.get("GIGACHAT_BASE_URL", "").strip()
        or "https://contest.ctai.dev/v1"
    ).rstrip("/")
    model = (
        os.environ.get("CONTEST_GIGACHAT_MODEL", "").strip()
        or os.environ.get("GIGACHAT_MODEL", "").strip()
        or "ai-sage/GigaChat3-10B-A1.8B"
    )
    stand_now_iso = os.environ.get("TEACHER_AGENT_NOW", "").strip() or "2026-12-02T08:00:00+09:00"
    db_path = resolve_teacher_agent_db_path(settings)
    return TeacherAgentConfig(
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout_sec=_float_env("CONTEST_GIGACHAT_TIMEOUT_SEC", 45.0),
        stand_now_iso=stand_now_iso,
        tz_name="Asia/Yakutsk",
        db_path=db_path,
        presentations_dir=db_path.parent / "teacher_presentations",
    )
