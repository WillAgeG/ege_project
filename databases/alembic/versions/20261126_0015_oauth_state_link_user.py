"""Колонка link_user_id в oauth_states для привязки OAuth к текущему пользователю."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261126_0015"
down_revision = "20261126_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE IF EXISTS oltp.oauth_states ADD COLUMN IF NOT EXISTS link_user_id BIGINT"))
    else:
        rows = bind.execute(sa.text("PRAGMA table_info(oauth_states)")).fetchall()
        cols = {str(r[1]) for r in rows}
        if "link_user_id" not in cols:
            op.execute(sa.text("ALTER TABLE oauth_states ADD COLUMN link_user_id INTEGER"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE IF EXISTS oltp.oauth_states DROP COLUMN IF EXISTS link_user_id"))
    else:
        rows = bind.execute(sa.text("PRAGMA table_info(oauth_states)")).fetchall()
        cols = {str(r[1]) for r in rows}
        if "link_user_id" in cols:
            op.execute(sa.text("ALTER TABLE oauth_states DROP COLUMN link_user_id"))
