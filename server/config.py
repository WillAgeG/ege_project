"""Конфигурация сервера через переменные окружения."""

from dataclasses import dataclass
import os
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent

DEFAULT_MODELS = {
    "gemini": ("gemini-3.8-flash", "gemini-3.1-pro-preview"),
    "openai": ("gpt-6.1-terra", "gpt-6.1-sol"),
    "anthropic": ("claude-sonnet-5-5", "claude-opus-5-5"),
    "openrouter": ("google/gemini-3.8-flash", "anthropic/claude-sonnet-5-5"),
}

PROVIDER_ENV_KEYS = (
    ("gemini", "GEMINI_API_KEY"),
    ("openai", "OPENAI_API_KEY"),
    ("anthropic", "ANTHROPIC_API_KEY"),
    ("openrouter", "OPENROUTER_API_KEY"),
)


def _int_env(name: str, default: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def resolve_db_path() -> Path:
    explicit = os.environ.get("DB_PATH", "").strip()
    if explicit:
        return Path(explicit)
    vol = os.environ.get("RAILWAY_VOLUME_MOUNT_PATH", "").strip()
    if vol:
        return Path(vol) / "app.db"
    return ROOT_DIR / ".local_data" / "app.db"


@dataclass(frozen=True)
class AIConfig:
    provider: str | None
    api_key: str | None
    model: str | None
    model_complex: str | None
    base_url: str | None

    @property
    def enabled(self) -> bool:
        return bool(self.provider and self.api_key)


def load_ai_config() -> AIConfig:
    wanted = os.environ.get("AI_PROVIDER", "auto").strip().lower()
    explicit_key = os.environ.get("AI_API_KEY", "").strip()
    provider: str | None = None
    api_key: str | None = None

    if wanted in ("", "auto"):
        for p, env_name in PROVIDER_ENV_KEYS:
            val = os.environ.get(env_name, "").strip()
            if val:
                provider, api_key = p, val
                break
    elif wanted in DEFAULT_MODELS:
        provider = wanted
        env_name = dict(PROVIDER_ENV_KEYS)[wanted]
        api_key = explicit_key or os.environ.get(env_name, "").strip() or None

    if not provider or not api_key:
        return AIConfig(provider=None, api_key=None, model=None, model_complex=None, base_url=None)

    def_fast, def_complex = DEFAULT_MODELS[provider]
    model = os.environ.get("AI_MODEL", "").strip() or def_fast
    model_complex = os.environ.get("AI_MODEL_COMPLEX", "").strip() or def_complex
    base_url = os.environ.get("AI_BASE_URL", "").strip().rstrip("/") or None
    return AIConfig(provider=provider, api_key=api_key, model=model, model_complex=model_complex, base_url=base_url)


@dataclass(frozen=True)
class Settings:
    db_path: Path
    session_cookie: str = "pvm_session"
    session_ttl_sec: int = 30 * 86400
    invite_code: str = ""
    max_users: int = 0
    max_doc_bytes: int = 2 * 1024 * 1024
    auth_rate_limit: int = 20
    auth_rate_window_sec: int = 900
    ai_rate_limit: int = 50
    ai_rate_window_sec: int = 3600
    ai: AIConfig = AIConfig(None, None, None, None, None)


def load_settings() -> Settings:
    return Settings(
        db_path=resolve_db_path(),
        session_ttl_sec=max(1, _int_env("SESSION_DAYS", 30)) * 86400,
        invite_code=os.environ.get("INVITE_CODE", "").strip(),
        max_users=max(0, _int_env("MAX_USERS", 0)),
        max_doc_bytes=max(1024, _int_env("MAX_DOC_BYTES", 2 * 1024 * 1024)),
        ai=load_ai_config(),
    )
