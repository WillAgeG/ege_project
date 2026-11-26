"""Таблица tutor_applications для заявок «Стать репетитором» с лендинга."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0007"
down_revision = "20261123_0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS oltp.tutor_applications (
                id TEXT PRIMARY KEY,
                user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                full_name TEXT NOT NULL,
                subject_id TEXT NOT NULL DEFAULT 'eng',
                subject_name TEXT NOT NULL DEFAULT '',
                desired_rate_rub INTEGER NOT NULL DEFAULT 1100 CHECK (desired_rate_rub >= 0 AND desired_rate_rub <= 99999),
                contact TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'landing',
                status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'approved', 'rejected')),
                review_note TEXT NOT NULL DEFAULT '',
                created_tutor_id TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                reviewed_at TIMESTAMPTZ
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_tutor_applications_status_created ON oltp.tutor_applications(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS tutor_applications (
                id TEXT PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                full_name TEXT NOT NULL,
                subject_id TEXT NOT NULL DEFAULT 'eng',
                subject_name TEXT NOT NULL DEFAULT '',
                desired_rate_rub INTEGER NOT NULL DEFAULT 1100 CHECK (desired_rate_rub >= 0 AND desired_rate_rub <= 99999),
                contact TEXT NOT NULL,
                source TEXT NOT NULL DEFAULT 'landing',
                status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'approved', 'rejected')),
                review_note TEXT NOT NULL DEFAULT '',
                created_tutor_id TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_tutor_applications_status_created ON tutor_applications(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.tutor_applications CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS tutor_applications"))
