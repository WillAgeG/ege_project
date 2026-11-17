"""Фасад PostgreSQL 17 хранилища (psycopg_pool), Dual-Write и Transactional Outbox."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from backend.config import Settings
from databases.sqlite.store import Database

from .admin import PgAdminMixin
from .auth_docs import PgAuthDocsMixin
from .calendar_realtime import PgCalendarRealtimeMixin
from .dual_write import DualWriteDatabase
from .schema import (
    PgSchemaMixin,
    _build_envelope,
    _doc_outbox_meta,
    _iso_utc,
    _normalize_dow,
    _normalize_tz,
    _row_to_user,
    _utc_now,
)


class PostgresDatabase(
    PgSchemaMixin,
    PgAuthDocsMixin,
    PgCalendarRealtimeMixin,
    PgAdminMixin,
):
    """PostgreSQL 17 хранилище с psycopg_pool и Transactional Outbox."""

    def __init__(self, database_url: str, *, min_size: int = 1, max_size: int = 10) -> None:
        self.database_url = database_url
        self._pool = ConnectionPool(
            conninfo=database_url,
            min_size=min_size,
            max_size=max_size,
            kwargs={"row_factory": dict_row},
            open=True,
        )
        self._init_schema()


def create_store(settings: Settings) -> Database | PostgresDatabase | DualWriteDatabase:
    """Фабрика хранилища по настройкам DATABASE_URL и DB_MODE."""
    mode = (settings.db_mode or "auto").strip().lower()
    if not settings.database_url or mode == "sqlite":
        return Database(settings.db_path)
    if mode == "postgres":
        return PostgresDatabase(settings.database_url)
    return DualWriteDatabase(Database(settings.db_path), PostgresDatabase(settings.database_url))


__all__ = [
    "DualWriteDatabase",
    "PgAdminMixin",
    "PgAuthDocsMixin",
    "PgCalendarRealtimeMixin",
    "PgSchemaMixin",
    "PostgresDatabase",
    "_build_envelope",
    "_doc_outbox_meta",
    "_iso_utc",
    "_normalize_dow",
    "_normalize_tz",
    "_row_to_user",
    "_utc_now",
    "create_store",
]
