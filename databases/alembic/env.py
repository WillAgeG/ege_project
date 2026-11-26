"""Окружение Alembic для версионированных миграций SQLite и PostgreSQL 17."""

from __future__ import annotations

from logging.config import fileConfig
import os
from pathlib import Path
import sys

from alembic import context
from sqlalchemy import engine_from_config, pool, text

ROOT_DIR = Path(__file__).resolve().parents[2]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.config import resolve_db_path  # noqa: E402

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)


def _normalize_sa_url(raw_url: str) -> str:
    url = raw_url.strip()
    if url.startswith("postgres://"):
        return "postgresql+psycopg://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg" not in url.split("://", 1)[0]:
        return "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _resolve_database_url() -> str:
    x_args = context.get_x_argument(as_dictionary=True)
    if x_args.get("url"):
        return _normalize_sa_url(str(x_args["url"]))

    cfg_url = (config.get_main_option("sqlalchemy.url") or "").strip()
    if cfg_url:
        return _normalize_sa_url(cfg_url)

    alembic_url = os.environ.get("ALEMBIC_DATABASE_URL", "").strip()
    if alembic_url:
        return _normalize_sa_url(alembic_url)

    db_mode = os.environ.get("DB_MODE", "auto").strip().lower()
    pg_url = os.environ.get("DATABASE_URL", "").strip()
    if pg_url and db_mode != "sqlite":
        return _normalize_sa_url(pg_url)

    db_path = resolve_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


def run_migrations_offline() -> None:
    url = _resolve_database_url()
    is_pg = url.startswith("postgresql")
    context.configure(
        url=url,
        target_metadata=None,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        version_table="alembic_version",
        version_table_schema="oltp" if is_pg else None,
        render_as_batch=not is_pg,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    url = _resolve_database_url()
    is_pg = url.startswith("postgresql")
    cfg_section = dict(config.get_section(config.config_ini_section) or {})
    cfg_section["sqlalchemy.url"] = url

    connectable = engine_from_config(
        cfg_section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        if is_pg:
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS oltp"))
            connection.execute(text("CREATE SCHEMA IF NOT EXISTS outbox"))
            connection.commit()

        context.configure(
            connection=connection,
            target_metadata=None,
            version_table="alembic_version",
            version_table_schema="oltp" if is_pg else None,
            render_as_batch=not is_pg,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
