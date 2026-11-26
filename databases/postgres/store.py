"""Фасад PostgreSQL 17 хранилища (psycopg_pool), Dual-Write и Transactional Outbox."""

from typing import Any

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from backend.config import Settings
from databases.sqlite.store import Database

from .admin import PgAdminMixin
from .auth_docs import PgAuthDocsMixin
from .calendar_realtime import PgCalendarRealtimeMixin
from .chat import PgChatMixin
from .dual_write import DualWriteDatabase
from .marketplace import PgMarketplaceMixin
from .media import PgMediaMixin
from .payments import PgPaymentsMixin
from .payouts import PgPayoutsMixin
from .telegram import PgTelegramMixin
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
    PgMarketplaceMixin,
    PgChatMixin,
    PgTelegramMixin,
    PgMediaMixin,
    PgPaymentsMixin,
    PgPayoutsMixin,
):
    """PostgreSQL 17 хранилище с psycopg_pool и Transactional Outbox."""

    def __init__(
        self,
        database_url: str,
        *,
        min_size: int = 1,
        max_size: int = 10,
        run_constraint_migrations: bool = True,
        skip_schema_init: bool = False,
    ) -> None:
        self.database_url = database_url
        self._run_constraint_migrations = bool(run_constraint_migrations)
        self._pool = ConnectionPool(
            conninfo=database_url,
            min_size=min_size,
            max_size=max_size,
            kwargs={"row_factory": dict_row},
            open=True,
        )
        if not skip_schema_init:
            self._init_schema()


def create_store(settings: Settings) -> Database | PostgresDatabase | DualWriteDatabase:
    """Фабрика хранилища по настройкам DATABASE_URL и DB_MODE."""
    mode = (settings.db_mode or "auto").strip().lower()
    seed_demo = bool(getattr(settings, "dev_demo_mode", True))
    if not settings.database_url or mode == "sqlite":
        return Database(settings.db_path, seed_demo=seed_demo)
    is_prod = str(getattr(settings, "env", "development") or "").strip().lower() == "production"
    raw_ddl = getattr(settings, "db_run_constraint_ddl", None)
    run_constraint_migrations = (not is_prod) if raw_ddl is None else bool(raw_ddl)
    skip_schema_init = bool(getattr(settings, "db_skip_schema_init", False))
    if mode == "postgres":
        return PostgresDatabase(
            settings.database_url,
            run_constraint_migrations=run_constraint_migrations,
            skip_schema_init=skip_schema_init,
        )
    return DualWriteDatabase(
        Database(settings.db_path, seed_demo=seed_demo),
        PostgresDatabase(
            settings.database_url,
            run_constraint_migrations=run_constraint_migrations,
            skip_schema_init=skip_schema_init,
        ),
    )


__all__ = [
    "DualWriteDatabase",
    "PgAdminMixin",
    "PgAuthDocsMixin",
    "PgCalendarRealtimeMixin",
    "PgChatMixin",
    "PgMarketplaceMixin",
    "PgSchemaMixin",
    "PgTelegramMixin",
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
