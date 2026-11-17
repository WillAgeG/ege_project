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
    StorageError,
    User,
    _iso_utc_now,
    _normalize_dow,
    _normalize_tz,
    _row_to_user,
    deep_merge,
    hash_password,
    hash_token,
    validate_display_name,
    validate_doc_name,
    validate_email,
    validate_password,
    validate_username,
    verify_password,
)
from .schema import SqliteSchemaMixin


class Database(
    SqliteSchemaMixin,
    SqliteAuthDocsMixin,
    SqliteCalendarRealtimeMixin,
    SqliteAdminMixin,
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
    "Database",
    "SqliteAdminMixin",
    "SqliteAuthDocsMixin",
    "SqliteCalendarRealtimeMixin",
    "SqliteSchemaMixin",
    "StorageError",
    "User",
    "_iso_utc_now",
    "_normalize_dow",
    "_normalize_tz",
    "_row_to_user",
    "deep_merge",
    "hash_password",
    "hash_token",
    "validate_display_name",
    "validate_doc_name",
    "validate_email",
    "validate_password",
    "validate_username",
    "verify_password",
]
