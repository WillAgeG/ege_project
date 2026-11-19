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

DOC_NAME_RE = re.compile(
    r"^(profile|plan|mocks|essays|market|tutor-cabinet|calendar-sync|prog-[a-z]+|log-\d{4}-\d{2})$"
)
USERNAME_RE = re.compile(r"^[0-9A-Za-zА-Яа-яЁё_.\-]{2,32}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
VALID_HOURS: tuple[str, ...] = tuple(f"{h:02d}:00" for h in range(10, 24))
_DOW_ORDER = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6}
_DOW_SHORT = {1: "Пн", 2: "Вт", 3: "Ср", 4: "Чт", 5: "Пт", 6: "Сб", 0: "Вс"}
_DOW_ACC = {
    1: "в понедельник",
    2: "во вторник",
    3: "в среду",
    4: "в четверг",
    5: "в пятницу",
    6: "в субботу",
    0: "в воскресенье",
}


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


def calc_fee_split(gross_rub: int) -> tuple[int, int]:
    """Точный 5% расчёт (half-away-from-zero), идентичный PostgreSQL ROUND(gross_rub::numeric * 0.05)."""
    gross = int(gross_rub or 0)
    if gross <= 0:
        return 0, 0
    fee = (gross * 5 + 50) // 100
    return fee, gross - fee


def validate_hour_slot(raw: str | None, *, default: str | None = None) -> str:
    val = (raw or "").strip()[:5]
    if not val and default is not None:
        val = default
    if re.fullmatch(r"\d{1}:00", val):
        val = "0" + val
    if val not in VALID_HOURS:
        raise StorageError("invalid_hour", "Допустимое время занятия: с 10:00 до 23:00.", 400)
    return val


def validate_telemost_url(raw: str | None) -> str:
    val = (raw or "").strip()
    if not val:
        return ""
    if val.lower().startswith("telemost.yandex."):
        val = "https://" + val
    if len(val) > 512 or not re.match(r"^https://telemost\.yandex\.(ru|com)/[A-Za-z0-9_/?=&.\-%#]+$", val, re.IGNORECASE):
        raise StorageError(
            "invalid_telemost_url",
            "Укажите корректную ссылку Яндекс Телемост (https://telemost.yandex.ru/...).",
            400,
        )
    return val


def generate_telemost_url() -> str:
    digits = "".join(str(secrets.randbelow(10)) for _ in range(14))
    return f"https://telemost.yandex.ru/j/{digits}"


def sort_dows(raw_dows: Any) -> list[int]:
    uniq: list[int] = []
    if isinstance(raw_dows, list):
        for item in raw_dows:
            try:
                d = int(item)
            except (TypeError, ValueError):
                continue
            if 0 <= d <= 6 and d not in uniq:
                uniq.append(d)
    return sorted(uniq, key=lambda d: _DOW_ORDER.get(d, 9))


def format_days_short(dows: list[int]) -> str:
    sorted_dows = sort_dows(dows)
    if not sorted_dows:
        return "не выбрано"
    if len(sorted_dows) == 7:
        return "Ежедневно (Пн–Вс)"
    return ", ".join(_DOW_SHORT[d] for d in sorted_dows if d in _DOW_SHORT)


def format_weekly_bot_phrase(dows: list[int], hour: str, weekly: bool = True) -> str:
    sorted_dows = sort_dows(dows)
    h = (hour or "16:00").strip()[:5]
    if not sorted_dows:
        return f"в {h}{' каждую неделю' if weekly else ''}"
    if len(sorted_dows) == 7:
        return f"в {h} каждый день"
    if len(sorted_dows) == 1:
        day_part = _DOW_ACC.get(sorted_dows[0], "")
    else:
        first = _DOW_ACC.get(sorted_dows[0], "")
        rest = [re.sub(r"^во?\s+", "", _DOW_ACC.get(d, ""), flags=re.IGNORECASE) for d in sorted_dows[1:]]
        rest = [x for x in rest if x]
        tail = rest.pop() if rest else ""
        day_part = f"{first}{(', ' + ', '.join(rest)) if rest else ''}{' и ' + tail if tail else ''}"
    return f"в {h} {day_part}{' каждую неделю' if weekly else ''}".strip()


def validate_schedule_plan(plan: dict[str, Any] | None) -> dict[str, Any] | None:
    if plan is None:
        return None
    if not isinstance(plan, dict):
        raise StorageError("invalid_schedule", "Ожидался объект расписания.", 400)
    status = str(plan.get("status") or "confirmed").strip().lower()
    if status not in ("needs_pick", "sent_to_tutor", "confirmed", "tutor_proposed"):
        raise StorageError("invalid_schedule", "Недопустимый статус расписания.", 400)
    dows = sort_dows(plan.get("dows"))
    if not (1 <= len(dows) <= 7):
        raise StorageError("invalid_schedule", "Выберите от 1 до 7 дней недели.", 400)
    hour = validate_hour_slot(str(plan.get("hour") or "16:00"))
    weekly = plan.get("weekly") is not False
    out: dict[str, Any] = {
        "status": status,
        "autoConfirmed": bool(plan.get("autoConfirmed", status == "confirmed")),
        "dows": dows,
        "hour": hour,
        "weekly": weekly,
        "botText": str(plan.get("botText") or format_weekly_bot_phrase(dows, hour, weekly))[:240],
        "updatedAt": int(plan.get("updatedAt") or int(time.time() * 1000)),
    }
    if plan.get("altDows") is not None:
        alt_dows = sort_dows(plan.get("altDows"))
        if not (1 <= len(alt_dows) <= 7):
            raise StorageError("invalid_schedule", "Укажите от 1 до 7 альтернативных дней.", 400)
        alt_hour = validate_hour_slot(str(plan.get("altHour") or hour))
        out["altDows"] = alt_dows
        out["altHour"] = alt_hour
        out["altBotText"] = str(plan.get("altBotText") or format_weekly_bot_phrase(alt_dows, alt_hour, weekly))[:240]
    return out


def validate_registration_role(raw: str | None) -> str:
    role = (raw or "student").strip().lower()
    if not role:
        return "student"
    if role not in ("student", "tutor"):
        raise StorageError("invalid_role", "При регистрации доступны только роли student и tutor.", 400)
    return role


def normalize_city_tz(city: str | None, tz: str | None = None) -> tuple[str, str]:
    raw_city = (city or "").strip()
    raw_tz = (tz or "").strip()
    if raw_city == "Москва" or (not raw_city and raw_tz in ("UTC+3", "Europe/Moscow", "Москва")):
        return "Москва", "UTC+3"
    return "Якутск", "UTC+9"


def mask_payout_destination(method: str, raw: str) -> str:
    digits = re.sub(r"\D+", "", raw or "")
    if method == "card":
        if len(digits) >= 8:
            return f"{digits[:4]} {digits[4:6]}** **** {digits[-4:]}"
        return f"•••• {digits[-4:]}" if digits else "Карта РФ"
    if len(digits) >= 10:
        d = digits[-10:]
        return f"+7 ({d[:3]}) ***-{d[6:8]}-{d[8:10]}"
    return (raw or "").strip()[:32] or "СБП"


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

