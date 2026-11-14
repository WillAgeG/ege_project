"""Коннекторы и контракты сырых данных (Доска Ykt, Telegram, WhatsApp, MAX)."""

from .ykt_tg_max_schema import (
    HOUR_MAX,
    HOUR_MIN,
    VALID_SOURCES,
    RawTutorListing,
    is_slot_available,
    normalize_listing,
    parse_hour_slot,
)

__all__ = [
    "HOUR_MAX",
    "HOUR_MIN",
    "VALID_SOURCES",
    "RawTutorListing",
    "is_slot_available",
    "normalize_listing",
    "parse_hour_slot",
]
