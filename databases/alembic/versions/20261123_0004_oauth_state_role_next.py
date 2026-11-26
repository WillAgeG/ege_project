"""Колонки role и next_url в oauth_states для сохранения роли и URL возврата в OAuth."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0004"
down_revision = "20261123_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.oauth_states ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'student'",
            "ALTER TABLE IF EXISTS oltp.oauth_states ADD COLUMN IF NOT EXISTS next_url TEXT NOT NULL DEFAULT '/'",
        ):
            op.execute(sa.text(stmt))
    else:
        rows = bind.execute(sa.text("PRAGMA table_info(oauth_states)")).fetchall()
        cols = {str(r[1]) for r in rows}
        if "role" not in cols:
            op.execute(sa.text("ALTER TABLE oauth_states ADD COLUMN role TEXT NOT NULL DEFAULT 'student'"))
        if "next_url" not in cols:
            op.execute(sa.text("ALTER TABLE oauth_states ADD COLUMN next_url TEXT NOT NULL DEFAULT '/'"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.oauth_states DROP COLUMN IF EXISTS next_url",
            "ALTER TABLE IF EXISTS oltp.oauth_states DROP COLUMN IF EXISTS role",
        ):
            op.execute(sa.text(stmt))
    else:
        rows = bind.execute(sa.text("PRAGMA table_info(oauth_states)")).fetchall()
        cols = {str(r[1]) for r in rows}
        if "next_url" in cols:
            op.execute(sa.text("ALTER TABLE oauth_states DROP COLUMN next_url"))
        if "role" in cols:
            op.execute(sa.text("ALTER TABLE oauth_states DROP COLUMN role"))
