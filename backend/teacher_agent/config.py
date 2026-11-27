"""Конфигурация ИИ-помощника преподавателя вуза и шлюза GigaChat."""

from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
import sys
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


def _float_env(name: str, default: float, dotenv: dict[str, str] | None = None) -> float:
    raw = _env_or_dotenv(name, dotenv)
    if not raw:
        return default
    try:
        val = float(raw)
        return val if val > 0 else default
    except ValueError:
        return default


def _read_local_dotenv() -> dict[str, str]:
    """Читает локальный .env в корне проекта (пропуская тестовую изоляцию pytest)."""
    if (
        "pytest" in sys.modules
        or os.environ.get("PYTEST_CURRENT_TEST")
        or os.environ.get("TEACHER_AGENT_IGNORE_DOTENV") == "1"
    ):
        return {}
    env_path = ROOT_DIR / ".env"
    if not env_path.is_file():
        return {}
    values: dict[str, str] = {}
    try:
        raw_text = env_path.read_text(encoding="utf-8")
    except OSError:
        return {}
    for line in raw_text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#") or "=" not in stripped:
            continue
        key, val = stripped.split("=", 1)
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and val[0] == val[-1] and val[0] in ("'", '"'):
            val = val[1:-1]
        if key:
            values[key] = val
    return values


def _env_or_dotenv(name: str, dotenv: dict[str, str] | None = None) -> str:
    explicit = os.environ.get(name, "").strip()
    if explicit:
        return explicit
    if dotenv:
        return dotenv.get(name, "").strip()
    return ""


def resolve_teacher_agent_db_path(settings: Any = None, dotenv: dict[str, str] | None = None) -> Path:
    explicit = _env_or_dotenv("TEACHER_AGENT_DB_PATH", dotenv)
    if explicit:
        return Path(explicit)
    if settings is not None and getattr(settings, "db_path", None):
        return Path(settings.db_path).parent / "teacher_agent.db"
    vol = _env_or_dotenv("RAILWAY_VOLUME_MOUNT_PATH", dotenv)
    if vol:
        return Path(vol) / "teacher_agent.db"
    return ROOT_DIR / ".local_data" / "teacher_agent.db"


def load_teacher_agent_config(settings: Any = None) -> TeacherAgentConfig:
    """Загружает конфигурацию агента из переменных окружения или локального .env без хардкода секретов."""
    dotenv = _read_local_dotenv()
    api_key = (
        _env_or_dotenv("CONTEST_GIGACHAT_API_KEY", dotenv)
        or _env_or_dotenv("GIGACHAT_API_KEY", dotenv)
        or None
    )
    base_url = (
        _env_or_dotenv("CONTEST_GIGACHAT_BASE_URL", dotenv)
        or _env_or_dotenv("GIGACHAT_BASE_URL", dotenv)
        or "https://contest.ctai.dev/v1"
    ).rstrip("/")
    model = (
        _env_or_dotenv("CONTEST_GIGACHAT_MODEL", dotenv)
        or _env_or_dotenv("GIGACHAT_MODEL", dotenv)
        or "ai-sage/GigaChat3-10B-A1.8B"
    )
    stand_now_iso = _env_or_dotenv("TEACHER_AGENT_NOW", dotenv) or "2026-12-02T08:00:00+09:00"
    db_path = resolve_teacher_agent_db_path(settings, dotenv)
    return TeacherAgentConfig(
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout_sec=_float_env("CONTEST_GIGACHAT_TIMEOUT_SEC", 45.0, dotenv),
        stand_now_iso=stand_now_iso,
        tz_name="Asia/Yakutsk",
        db_path=db_path,
        presentations_dir=db_path.parent / "teacher_presentations",
    )
