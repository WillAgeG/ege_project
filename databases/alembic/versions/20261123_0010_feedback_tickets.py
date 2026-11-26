"""Таблицы feedback_tickets и feedback_attachments + kind='feedback' в media_assets."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0010"
down_revision = "20261123_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check",
            "ALTER TABLE IF EXISTS oltp.media_assets ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('avatar', 'diploma', 'feedback'))",
            """
            CREATE TABLE IF NOT EXISTS oltp.feedback_tickets (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('bug', 'cooperation')),
                user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                author_name TEXT NOT NULL DEFAULT '',
                contact TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                page_url TEXT NOT NULL DEFAULT '',
                context_json JSONB NOT NULL DEFAULT '{}'::jsonb,
                status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_by TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                reviewed_at TIMESTAMPTZ
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_feedback_tickets_status_created ON oltp.feedback_tickets(status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_feedback_tickets_kind_created ON oltp.feedback_tickets(kind, created_at DESC)",
            """
            CREATE TABLE IF NOT EXISTS oltp.feedback_attachments (
                id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL REFERENCES oltp.feedback_tickets(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES oltp.media_assets(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_feedback_attachments_ticket ON oltp.feedback_attachments(ticket_id)",
        ):
            op.execute(sa.text(stmt))
    else:
        inspector = sa.inspect(bind)
        if "media_assets" in inspector.get_table_names():
            ddl_row = bind.execute(
                sa.text("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_assets'")
            ).fetchone()
            ddl_sql = str(ddl_row[0] or "") if ddl_row else ""
            if "'feedback'" not in ddl_sql:
                with op.get_context().autocommit_block():
                    op.execute(sa.text("PRAGMA foreign_keys = OFF"))
                    try:
                        for stmt in (
                            """
                            CREATE TABLE media_assets_v2 (
                                id TEXT PRIMARY KEY,
                                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                                kind TEXT NOT NULL CHECK (kind IN ('avatar', 'diploma', 'feedback')),
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
                            """
                            INSERT OR IGNORE INTO media_assets_v2
                                (id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, sha256, original_filename, public_url, created_at)
                            SELECT id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, sha256, original_filename, public_url, created_at
                            FROM media_assets
                            """,
                            "DROP TABLE media_assets",
                            "ALTER TABLE media_assets_v2 RENAME TO media_assets",
                            "CREATE INDEX IF NOT EXISTS idx_media_assets_user_kind ON media_assets(user_id, kind, created_at DESC)",
                        ):
                            op.execute(sa.text(stmt))
                    finally:
                        op.execute(sa.text("PRAGMA foreign_keys = ON"))

        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS feedback_tickets (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK (kind IN ('bug', 'cooperation')),
                user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                author_name TEXT NOT NULL DEFAULT '',
                contact TEXT NOT NULL DEFAULT '',
                subject TEXT NOT NULL DEFAULT '',
                message TEXT NOT NULL,
                page_url TEXT NOT NULL DEFAULT '',
                context_json TEXT NOT NULL DEFAULT '{}',
                status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_by TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                reviewed_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_feedback_tickets_status_created ON feedback_tickets(status, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_feedback_tickets_kind_created ON feedback_tickets(kind, created_at DESC)",
            """
            CREATE TABLE IF NOT EXISTS feedback_attachments (
                id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL REFERENCES feedback_tickets(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_feedback_attachments_ticket ON feedback_attachments(ticket_id)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "DROP TABLE IF EXISTS oltp.feedback_attachments CASCADE",
            "DROP TABLE IF EXISTS oltp.feedback_tickets CASCADE",
            "DELETE FROM oltp.media_assets WHERE kind = 'feedback'",
            "ALTER TABLE IF EXISTS oltp.media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check",
            "ALTER TABLE IF EXISTS oltp.media_assets ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('avatar', 'diploma'))",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            "DROP TABLE IF EXISTS feedback_attachments",
            "DROP TABLE IF EXISTS feedback_tickets",
        ):
            op.execute(sa.text(stmt))
        inspector = sa.inspect(bind)
        if "media_assets" in inspector.get_table_names():
            with op.get_context().autocommit_block():
                op.execute(sa.text("PRAGMA foreign_keys = OFF"))
                try:
                    for stmt in (
                        "DELETE FROM media_assets WHERE kind = 'feedback'",
                        """
                        CREATE TABLE media_assets_v1 (
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
                        """
                        INSERT OR IGNORE INTO media_assets_v1
                            (id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, sha256, original_filename, public_url, created_at)
                        SELECT id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, sha256, original_filename, public_url, created_at
                        FROM media_assets
                        """,
                        "DROP TABLE media_assets",
                        "ALTER TABLE media_assets_v1 RENAME TO media_assets",
                        "CREATE INDEX IF NOT EXISTS idx_media_assets_user_kind ON media_assets(user_id, kind, created_at DESC)",
                    ):
                        op.execute(sa.text(stmt))
                finally:
                    op.execute(sa.text("PRAGMA foreign_keys = ON"))
