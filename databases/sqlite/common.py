"""SQLite-хранилище пользователей, сессий и документов прогресса."""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import hmac
import ipaddress
import json
from pathlib import Path
import re
import secrets
import sqlite3
import threading
import time
from typing import Any
from urllib.parse import urlsplit

DOC_NAME_RE = re.compile(
    r"^(profile|plan|mocks|essays|market|tutor-cabinet|calendar-sync|courses|prog-[a-z]+|log-\d{4}-\d{2})$"
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


def calc_sbp_fee(gross_rub: int) -> int:
    """Комиссия банковского шлюза СБП 1% (half-away-from-zero)."""
    gross = int(gross_rub or 0)
    if gross <= 0:
        return 0
    return (gross * 1 + 50) // 100


def calc_fee_split(gross_rub: int) -> tuple[int, int]:
    """Точный расчёт выплаты 94% (5% сервис + 1% СБП, half-away-from-zero)."""
    gross = int(gross_rub or 0)
    if gross <= 0:
        return 0, 0
    fee = (gross * 5 + 50) // 100
    sbp = calc_sbp_fee(gross)
    return fee, max(0, gross - fee - sbp)


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
    if len(val) > 512 or any(ch.isspace() or ord(ch) < 32 or ch in "<>\"'" for ch in val):
        raise StorageError(
            "invalid_telemost_url",
            "Укажите корректную https-ссылку на видеозвонок (Яндекс Телемост, Zoom, Google Meet, VK Звонки и др.).",
            400,
        )
    if "://" not in val and ":" not in val.split("/", 1)[0]:
        if re.match(r"^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:[/?#].*)?$", val):
            val = "https://" + val
    try:
        parsed = urlsplit(val)
    except ValueError as exc:
        raise StorageError(
            "invalid_telemost_url",
            "Укажите корректную https-ссылку на видеозвонок (Яндекс Телемост, Zoom, Google Meet, VK Звонки и др.).",
            400,
        ) from exc
    host = (parsed.hostname or "").strip().lower().rstrip(".")
    invalid = (
        parsed.scheme.lower() != "https"
        or parsed.username is not None
        or parsed.password is not None
        or not host
        or host == "localhost"
        or host.endswith((".local", ".internal", ".localhost"))
        or "." not in host
    )
    if not invalid:
        try:
            ipaddress.ip_address(host)
            invalid = True
        except ValueError:
            pass
    if not invalid and (
        not re.fullmatch(
            r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+",
            host,
        )
        or not re.fullmatch(r"[a-z]{2,24}", host.rsplit(".", 1)[-1])
    ):
        invalid = True
    if invalid:
        raise StorageError(
            "invalid_telemost_url",
            "Укажите корректную https-ссылку на видеозвонок (Яндекс Телемост, Zoom, Google Meet, VK Звонки и др.).",
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


_TRANSLIT_RU = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "ts", "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "",
    "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def clean_direction_label(raw: Any, *, max_len: int = 60) -> str:
    text = re.sub(r"[<>]", "", str(raw or ""))
    return re.sub(r"\s+", " ", text).strip()[:max_len]


def slugify_direction(label: str) -> str:
    src = clean_direction_label(label).lower()
    out_chars: list[str] = []
    for ch in src:
        if ch in _TRANSLIT_RU:
            out_chars.append(_TRANSLIT_RU[ch])
        elif ("a" <= ch <= "z") or ("0" <= ch <= "9"):
            out_chars.append(ch)
        else:
            out_chars.append("-")
    slug = re.sub(r"-+", "-", "".join(out_chars)).strip("-")[:36]
    if not slug or slug.isdigit():
        slug = f"dir-{slug or 'custom'}"
    return slug


def normalize_direction_payload(payload: dict[str, Any]) -> dict[str, Any]:
    raw_short = clean_direction_label(payload.get("short") or payload.get("name") or "")
    raw_name = clean_direction_label(payload.get("name") or raw_short)
    label = raw_short or raw_name
    if len(label) < 2:
        raise StorageError("invalid_direction", "Название направления должно содержать минимум 2 символа.", 400)
    full_name = raw_name if len(raw_name) >= 2 else label
    short_label = (label[:33].strip() + "…") if len(label) > 34 else label
    raw_id = re.sub(r"[^a-z0-9_-]", "", str(payload.get("id") or "").strip().lower())[:36]
    dir_id = raw_id if len(raw_id) >= 2 else slugify_direction(short_label)
    category = clean_direction_label(payload.get("category") or "", max_len=48) or "Добавлено оркестратором"
    source_raw = str(payload.get("source") or "orchestrator").strip().lower()
    source = "orchestrator" if source_raw not in ("base", "user", "orchestrator") else source_raw
    kw_list: list[str] = []
    seen_kw: set[str] = set()
    for item in payload.get("keywords") or []:
        kw = clean_direction_label(item, max_len=36).lower()
        if kw and kw not in seen_kw:
            seen_kw.add(kw)
            kw_list.append(kw)
        if len(kw_list) >= 12:
            break
    tutor_count = max(0, int(payload.get("tutorCount") or payload.get("tutor_count") or 0))
    return {
        "id": dir_id,
        "name": full_name,
        "short": short_label,
        "category": category,
        "is_exam": bool(payload.get("isExam")),
        "source": source,
        "keywords": kw_list,
        "tutor_count": tutor_count,
    }


DISPUTE_REASONS = (
    "first_lesson_guarantee",
    "no_show",
    "quality",
    "tech_issue",
    "other",
)


def normalize_review_payload(payload: dict[str, Any]) -> dict[str, Any]:
    try:
        rating = int(payload.get("rating"))
    except (TypeError, ValueError):
        rating = 0
    if not (1 <= rating <= 5):
        raise StorageError("invalid_rating", "Оценка должна быть от 1 до 5 звёзд.", 400)
    comment = clean_direction_label(payload.get("comment") or "", max_len=600)
    booking_id = clean_direction_label(payload.get("bookingId") or payload.get("booking_id") or "", max_len=64) or None
    student_name = clean_direction_label(payload.get("studentName") or "", max_len=64)
    tags: list[str] = []
    seen_tags: set[str] = set()
    for item in payload.get("tags") or []:
        t = clean_direction_label(item, max_len=36)
        tl = t.lower()
        if t and tl not in seen_tags:
            seen_tags.add(tl)
            tags.append(t)
        if len(tags) >= 4:
            break
    return {
        "rating": rating,
        "comment": comment,
        "booking_id": booking_id,
        "student_name": student_name,
        "tags": tags,
    }


def normalize_dispute_payload(payload: dict[str, Any]) -> dict[str, Any]:
    raw_reason = str(payload.get("reason") or "first_lesson_guarantee").strip().lower()
    reason = raw_reason if raw_reason in DISPUTE_REASONS else "other"
    comment = clean_direction_label(payload.get("comment") or "", max_len=600)
    if len(comment) < 4:
        raise StorageError("invalid_dispute", "Опишите причину спора (минимум 4 символа).", 400)
    return {
        "reason": reason,
        "comment": comment,
        "first_lesson_guarantee": payload.get("firstLessonGuarantee", True) is not False,
    }


@dataclass(frozen=True)
class User:
    id: int
    username: str
    display_name: str = ""
    email: str | None = None
    avatar_url: str | None = None
    auth_provider: str = "local"
    role: str = "student"


def clean_custom_badges(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    out: list[str] = []
    for item in raw:
        label = clean_direction_label(item, max_len=36)
        if label and label not in out:
            out.append(label)
        if len(out) >= 2:
            break
    return out


def normalize_tutor_profile_payload(payload: dict[str, Any], *, fallback_name: str = "") -> dict[str, Any]:
    raw_name = str(payload.get("name") or payload.get("fullName") or fallback_name or "").strip()[:80]
    if len(raw_name) < 2:
        raise StorageError("invalid_name", "Укажите имя и фамилию преподавателя (минимум 2 символа).", 400)
    norm_city, norm_tz = normalize_city_tz(payload.get("city"), payload.get("timezone"))
    base_rate = max(100, min(99999, int(payload.get("price") or payload.get("baseRateRub") or 1200)))
    market_rate = max(
        base_rate,
        int(payload.get("marketPrice") or payload.get("marketRateRub") or ((base_rate * 128 + 50) // 100)),
    )
    raw_min_fair = payload.get("minFair")
    if raw_min_fair not in (None, ""):
        try:
            min_fair: int | None = max(0, min(base_rate, int(raw_min_fair)))
        except (TypeError, ValueError):
            min_fair = None
    else:
        min_fair = None
    subjects = payload.get("subjects") if isinstance(payload.get("subjects"), list) else []
    clean_subjects = [str(s).strip()[:32] for s in subjects if str(s).strip()][:8]
    subject_label = str(
        payload.get("subjectName") or payload.get("subject") or (clean_subjects[0] if clean_subjects else "Биология")
    ).strip()[:64]
    exams = [str(x).strip()[:32] for x in (payload.get("exams") or ["ЕГЭ"]) if str(x).strip()][:5] or ["ЕГЭ"]
    formats = [str(x).strip()[:32] for x in (payload.get("formats") or ["Онлайн"]) if str(x).strip()][:4] or ["Онлайн"]
    raw_slots = payload.get("slots") if isinstance(payload.get("slots"), dict) else {}
    clean_slots: dict[str, list[str]] = {}
    for dow_key, hours_val in raw_slots.items():
        try:
            dow_num = int(dow_key)
        except (TypeError, ValueError):
            continue
        if 0 <= dow_num <= 6 and isinstance(hours_val, list):
            valid_hrs = sorted({validate_hour_slot(str(h)) for h in hours_val if str(h).strip()})
            if valid_hrs:
                clean_slots[str(dow_num)] = valid_hrs
    return {
        "full_name": raw_name,
        "norm_city": norm_city,
        "norm_tz": norm_tz,
        "base_rate": base_rate,
        "market_rate": market_rate,
        "min_fair": min_fair,
        "clean_subjects": clean_subjects,
        "subject_label": subject_label,
        "exams": exams,
        "formats": formats,
        "clean_slots": clean_slots,
        "custom_badges": clean_custom_badges(payload.get("customBadges")),
        "has_published": ("published" in payload and payload["published"] is not None),
        "published": bool(payload.get("published")) if payload.get("published") is not None else True,
    }


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

