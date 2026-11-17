"""SQLite-хранилище пользователей, сессий и документов прогресса."""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import json
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from typing import Any

DOC_NAME_RE = re.compile(r"^(profile|plan|mocks|essays|tutor-cabinet|calendar-sync|prog-[a-z]+|log-\d{4}-\d{2})$")
USERNAME_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁё_.\-]{2,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _iso_utc_now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _normalize_tz(raw: str | None) -> str:
    val = (raw or "").strip()
    if val in ("UTC+3", "Europe/Moscow", "Москва"):
        return "UTC+3"
    return "UTC+9"


def _normalize_dow(raw: Any, slot_date: str) -> int:
    try:
        d = int(raw)
        if 0 <= d <= 6:
            return d
    except (TypeError, ValueError):
        pass
    try:
        dt = datetime.strptime(slot_date[:10], "%Y-%m-%d")
        # Python weekday(): Mon=0..Sun=6 -> JS getDay(): Sun=0, Mon=1..Sat=6
        return (dt.weekday() + 1) % 7
    except ValueError:
        return 1


class StorageError(Exception):
    def __init__(self, code: str, message: str, status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        maxmem=32 * 1024 * 1024,
        dklen=32,
    )
    return f"scrypt${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, dk_hex = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(dk_hex)
    except (ValueError, TypeError):
        return False
    actual = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=16384,
        r=8,
        p=1,
        maxmem=32 * 1024 * 1024,
        dklen=32,
    )
    return hmac.compare_digest(actual, expected)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def deep_merge(target: dict[str, Any], patch: dict[str, Any]) -> dict[str, Any]:
    """Сливает patch в target аналогично app.js, удаляя ключи со значением None."""
    out = dict(target) if isinstance(target, dict) else {}
    for key, value in (patch or {}).items():
        if value is None:
            out.pop(key, None)
        elif isinstance(value, dict):
            nested = out.get(key)
            out[key] = deep_merge(nested if isinstance(nested, dict) else {}, value)
        else:
            out[key] = value
    return out


def validate_username(raw: str) -> str:
    username = (raw or "").strip()
    if not USERNAME_RE.match(username):
        raise StorageError(
            "invalid_username",
            "Логин должен быть от 2 до 32 символов (буквы, цифры, _, ., -).",
            400,
        )
    return username


def validate_password(password: str) -> str:
    if not isinstance(password, str) or len(password) < 6 or len(password) > 128:
        raise StorageError(
            "invalid_password",
            "Пароль должен быть от 6 до 128 символов.",
            400,
        )
    return password


def validate_doc_name(name: str) -> str:
    if not DOC_NAME_RE.match(name or ""):
        raise StorageError("invalid_doc", "Недопустимое имя документа.", 400)
    return name


def validate_email(raw: str | None) -> str | None:
    email = (raw or "").strip()
    if not email:
        return None
    if len(email) > 254 or not EMAIL_RE.match(email):
        raise StorageError("invalid_email", "Укажи корректный email.", 400)
    return email


def validate_display_name(raw: str | None) -> str:
    return re.sub(r"\s+", " ", (raw or "").strip())[:40]


@dataclass(frozen=True)
class User:
    id: int
    username: str
    display_name: str = ""
    email: str | None = None
    avatar_url: str | None = None
    auth_provider: str = "local"
    role: str = "student"


def _row_to_user(row: sqlite3.Row) -> User:
    keys = set(row.keys())
    return User(
        id=int(row["id"]),
        username=str(row["username"]),
        display_name=str(row["display_name"] or "") if "display_name" in keys else "",
        email=row["email"] if "email" in keys else None,
        avatar_url=row["avatar_url"] if "avatar_url" in keys else None,
        auth_provider=str(row["auth_provider"] or "local") if "auth_provider" in keys else "local",
        role=str(row["role"] or "student") if "role" in keys else "student",
    )

