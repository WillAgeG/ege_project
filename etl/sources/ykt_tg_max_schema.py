"""Схема и нормализация анкет репетиторов из внешних каналов (Ykt, TG, WA, MAX)."""

from dataclasses import dataclass
import re
from typing import Any

VALID_SOURCES = ("doska_ykt", "telegram", "whatsapp", "max")
HOUR_MIN = 10
HOUR_MAX = 20
_HOUR_RE = re.compile(r"^(\d{1,2}):00$")


@dataclass(frozen=True)
class RawTutorListing:
    """Сырая запись анкеты преподавателя до дедупликации (Bronze-слой)."""

    external_id: str
    source: str
    full_name: str
    subject: str
    offered_price_rub: int
    market_price_rub: int
    available_from: str = "10:00"
    available_to: str = "20:00"


def parse_hour_slot(value: str) -> int:
    """Парсит строковый час ('10:00'..'20:00') и проверяет допустимый диапазон."""
    match = _HOUR_RE.match((value or "").strip())
    if not match:
        raise ValueError(f"Некорректный формат слота '{value}', ожидается HH:00.")
    hour = int(match.group(1))
    if hour < HOUR_MIN or hour > HOUR_MAX:
        raise ValueError(f"Час {hour}:00 вне допустимого диапазона {HOUR_MIN}:00–{HOUR_MAX}:00.")
    return hour


def is_slot_available(listing: RawTutorListing | dict[str, Any], target_hour: str) -> bool:
    """Проверяет, попадает ли выбранный час в окно доступности преподавателя."""
    target = parse_hour_slot(target_hour)
    if isinstance(listing, RawTutorListing):
        start_raw, end_raw = listing.available_from, listing.available_to
    else:
        start_raw = str(listing.get("available_from", "10:00"))
        end_raw = str(listing.get("available_to", "20:00"))
    return parse_hour_slot(start_raw) <= target <= parse_hour_slot(end_raw)


def normalize_listing(item: RawTutorListing | dict[str, Any]) -> dict[str, Any]:
    """Приводит запись из источника к каноническому словарю Silver-слоя."""
    raw = (
        item.__dict__
        if isinstance(item, RawTutorListing)
        else dict(item)
    )
    source = str(raw.get("source", "")).strip().lower()
    if source not in VALID_SOURCES:
        raise ValueError(f"Неизвестный источник '{source}'. Ожидается один из {VALID_SOURCES}.")

    offered = int(raw["offered_price_rub"])
    market = int(raw["market_price_rub"])
    if offered <= 0 or market <= 0:
        raise ValueError("Ставки offered_price_rub и market_price_rub должны быть положительными.")

    from_hour = parse_hour_slot(str(raw.get("available_from", "10:00")))
    to_hour = parse_hour_slot(str(raw.get("available_to", "20:00")))
    if from_hour > to_hour:
        raise ValueError("available_from не может быть позже available_to.")

    diff_rub = offered - market
    price_tier = "above_market" if diff_rub > 0 else ("below_market" if diff_rub < 0 else "at_market")

    return {
        "external_id": str(raw["external_id"]).strip(),
        "source": source,
        "full_name": " ".join(str(raw["full_name"]).split()),
        "subject": str(raw["subject"]).strip().lower(),
        "offered_price_rub": offered,
        "market_price_rub": market,
        "price_diff_rub": diff_rub,
        "price_tier": price_tier,
        "available_from": f"{from_hour:02d}:00",
        "available_to": f"{to_hour:02d}:00",
    }
