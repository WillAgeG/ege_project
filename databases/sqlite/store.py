"""Фасад SQLite-хранилища: объединяет доменные миксины и сохраняет публичный API."""

from pathlib import Path
import sqlite3
import threading

from .admin import SqliteAdminMixin
from .auth_docs import SqliteAuthDocsMixin
from .calendar_realtime import SqliteCalendarRealtimeMixin
from .common import (
    DOC_NAME_RE,
    EMAIL_RE,
    USERNAME_RE,
    VALID_HOURS,
    StorageError,
    User,
    _iso_utc_now,
    _normalize_dow,
    _normalize_tz,
    _row_to_user,
    calc_fee_split,
    deep_merge,
    format_days_short,
    format_weekly_bot_phrase,
    generate_telemost_url,
    hash_password,
    hash_token,
    mask_payout_destination,
    normalize_city_tz,
    sort_dows,
    validate_display_name,
    validate_doc_name,
    validate_email,
    validate_hour_slot,
    validate_password,
    validate_registration_role,
    validate_schedule_plan,
    validate_telemost_url,
    validate_username,
    verify_password,
)
from .marketplace import SqliteMarketplaceMixin
from .schema import SqliteSchemaMixin


class Database(
    SqliteSchemaMixin,
    SqliteAuthDocsMixin,
    SqliteCalendarRealtimeMixin,
    SqliteAdminMixin,
    SqliteMarketplaceMixin,
):
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self._conn = sqlite3.connect(str(path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._init_schema()


__all__ = [
    "DOC_NAME_RE",
    "EMAIL_RE",
    "USERNAME_RE",
    "VALID_HOURS",
    "Database",
    "SqliteAdminMixin",
    "SqliteAuthDocsMixin",
    "SqliteCalendarRealtimeMixin",
    "SqliteMarketplaceMixin",
    "SqliteSchemaMixin",
    "StorageError",
    "User",
    "_iso_utc_now",
    "_normalize_dow",
    "_normalize_tz",
    "_row_to_user",
    "calc_fee_split",
    "deep_merge",
    "format_days_short",
    "format_weekly_bot_phrase",
    "generate_telemost_url",
    "hash_password",
    "hash_token",
    "mask_payout_destination",
    "normalize_city_tz",
    "sort_dows",
    "validate_display_name",
    "validate_doc_name",
    "validate_email",
    "validate_hour_slot",
    "validate_password",
    "validate_registration_role",
    "validate_schedule_plan",
    "validate_telemost_url",
    "validate_username",
    "verify_password",
]
