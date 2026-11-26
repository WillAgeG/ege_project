"""Таблицы media_assets и tutor_verifications для объектного хранилища и проверки дипломов."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0003"
down_revision = "20261123_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS oltp.media_assets (
                id TEXT PRIMARY KEY,
                user_id BIGINT REFERENCES oltp.users(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK (kind IN ('avatar', 'diploma')),
                storage_driver TEXT NOT NULL DEFAULT 'local',
                bucket TEXT NOT NULL,
                object_key TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
                sha256 TEXT NOT NULL DEFAULT '',
                original_filename TEXT NOT NULL DEFAULT '',
                public_url TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_media_assets_user_kind ON oltp.media_assets(user_id, kind, created_at DESC)",
            """
            CREATE TABLE IF NOT EXISTS oltp.tutor_verifications (
                id TEXT PRIMARY KEY,
                user_id BIGINT REFERENCES oltp.users(id) ON DELETE CASCADE,
                tutor_id TEXT NOT NULL DEFAULT '',
                asset_id TEXT NOT NULL REFERENCES oltp.media_assets(id) ON DELETE CASCADE,
                doc_type TEXT NOT NULL DEFAULT 'diploma' CHECK (doc_type IN ('diploma', 'ege_expert', 'certificate', 'other')),
                title TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_by TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                reviewed_at TIMESTAMPTZ
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_tutor_verifications_status ON oltp.tutor_verifications(status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_tutor_verifications_user ON oltp.tutor_verifications(user_id, created_at DESC)",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS media_assets (
                id TEXT PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                kind TEXT NOT NULL CHECK (kind IN ('avatar', 'diploma')),
                storage_driver TEXT NOT NULL DEFAULT 'local',
                bucket TEXT NOT NULL,
                object_key TEXT NOT NULL,
                content_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
                sha256 TEXT NOT NULL DEFAULT '',
                original_filename TEXT NOT NULL DEFAULT '',
                public_url TEXT,
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_media_assets_user_kind ON media_assets(user_id, kind, created_at DESC)",
            """
            CREATE TABLE IF NOT EXISTS tutor_verifications (
                id TEXT PRIMARY KEY,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                tutor_id TEXT NOT NULL DEFAULT '',
                asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
                doc_type TEXT NOT NULL DEFAULT 'diploma' CHECK (doc_type IN ('diploma', 'ege_expert', 'certificate', 'other')),
                title TEXT NOT NULL DEFAULT '',
                comment TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                reviewed_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_tutor_verifications_status_created ON tutor_verifications(status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_tutor_verifications_user ON tutor_verifications(user_id, created_at DESC)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.tutor_verifications CASCADE"))
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.media_assets CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS tutor_verifications"))
        op.execute(sa.text("DROP TABLE IF EXISTS media_assets"))
