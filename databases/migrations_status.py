"""Чтение статуса версионированных миграций Alembic (SQLite / PostgreSQL 17)."""

from __future__ import annotations

from pathlib import Path
import sqlite3
from typing import Any

import psycopg

from backend.config import ROOT_DIR, Settings


def get_migration_status(settings: Settings) -> dict[str, Any]:
    """Возвращает текущую и целевую ревизию Alembic без модификации БД."""
    ini_path = ROOT_DIR / "alembic.ini"
    script_dir = ROOT_DIR / "databases" / "alembic"
    configured = ini_path.is_file() and (script_dir / "env.py").is_file()

    head_rev: str | None = None
    revisions: list[dict[str, str]] = []
    if configured:
        try:
            from alembic.config import Config
            from alembic.script import ScriptDirectory

            cfg = Config(str(ini_path))
            cfg.set_main_option("script_location", str(script_dir))
            sd = ScriptDirectory.from_config(cfg)
            head_rev = sd.get_current_head()
            for rev in sd.walk_revisions():
                revisions.append(
                    {
                        "revision": str(rev.revision),
                        "downRevision": str(rev.down_revision or ""),
                        "doc": str(rev.doc or "").splitlines()[0] if rev.doc else "",
                    }
                )
        except Exception:
            configured = False

    mode = (settings.db_mode or "auto").strip().lower()
    use_pg = bool(settings.database_url and mode != "sqlite")
    dialect = "postgresql" if use_pg else "sqlite"
    current_rev: str | None = None
    error: str | None = None

    if use_pg and settings.database_url:
        try:
            with psycopg.connect(settings.database_url, connect_timeout=2) as conn:
                row = conn.execute("SELECT version_num FROM oltp.alembic_version LIMIT 1").fetchone()
                if row:
                    current_rev = str(row[0])
        except Exception as exc:
            msg = str(exc)
            if "alembic_version" not in msg.lower():
                error = msg
    else:
        db_file = Path(settings.db_path)
        if db_file.is_file():
            try:
                conn = sqlite3.connect(str(db_file), timeout=2.0)
                try:
                    has_tbl = conn.execute(
                        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='alembic_version'"
                    ).fetchone()
                    if has_tbl:
                        row = conn.execute("SELECT version_num FROM alembic_version LIMIT 1").fetchone()
                        if row:
                            current_rev = str(row[0])
                finally:
                    conn.close()
            except Exception as exc:
                error = str(exc)

    return {
        "configured": bool(configured),
        "dialect": dialect,
        "headRevision": head_rev,
        "currentRevision": current_rev,
        "upToDate": bool(head_rev and current_rev == head_rev),
        "revisionsCount": len(revisions),
        "revisions": revisions,
        "error": error,
    }


__all__ = ["get_migration_status"]
