"""Таблица chat_message_attachments и kind='chat' в media_assets для вложений мини-мессенджера."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261124_0013"
down_revision = "20261124_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check",
            "ALTER TABLE IF EXISTS oltp.media_assets ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('avatar', 'diploma', 'feedback', 'chat'))",
            """
            CREATE TABLE IF NOT EXISTS oltp.chat_message_attachments (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL REFERENCES oltp.chat_messages(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES oltp.media_assets(id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_chat_msg_attachments_message ON oltp.chat_message_attachments(message_id)",
        ):
            op.execute(sa.text(stmt))
    else:
        inspector = sa.inspect(bind)
        if "media_assets" in inspector.get_table_names():
            ddl_row = bind.execute(
                sa.text("SELECT sql FROM sqlite_master WHERE type='table' AND name='media_assets'")
            ).fetchone()
            ddl_sql = str(ddl_row[0] or "") if ddl_row else ""
            if "'chat'" not in ddl_sql:
                with op.get_context().autocommit_block():
                    op.execute(sa.text("PRAGMA foreign_keys = OFF"))
                    try:
                        for stmt in (
                            """
                            CREATE TABLE media_assets_v3 (
                                id TEXT PRIMARY KEY,
                                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                                kind TEXT NOT NULL CHECK (kind IN ('avatar', 'diploma', 'feedback', 'chat')),
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
                            INSERT OR IGNORE INTO media_assets_v3
                                (id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, sha256, original_filename, public_url, created_at)
                            SELECT id, user_id, kind, storage_driver, bucket, object_key, content_type, size_bytes, sha256, original_filename, public_url, created_at
                            FROM media_assets
                            """,
                            "DROP TABLE media_assets",
                            "ALTER TABLE media_assets_v3 RENAME TO media_assets",
                            "CREATE INDEX IF NOT EXISTS idx_media_assets_user_kind ON media_assets(user_id, kind, created_at DESC)",
                        ):
                            op.execute(sa.text(stmt))
                    finally:
                        op.execute(sa.text("PRAGMA foreign_keys = ON"))

        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS chat_message_attachments (
                id TEXT PRIMARY KEY,
                message_id TEXT NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
                asset_id TEXT NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_chat_msg_attachments_message ON chat_message_attachments(message_id)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "DROP TABLE IF EXISTS oltp.chat_message_attachments CASCADE",
            "DELETE FROM oltp.media_assets WHERE kind = 'chat'",
            "ALTER TABLE IF EXISTS oltp.media_assets DROP CONSTRAINT IF EXISTS media_assets_kind_check",
            "ALTER TABLE IF EXISTS oltp.media_assets ADD CONSTRAINT media_assets_kind_check CHECK (kind IN ('avatar', 'diploma', 'feedback'))",
        ):
            op.execute(sa.text(stmt))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS chat_message_attachments"))
        inspector = sa.inspect(bind)
        if "media_assets" in inspector.get_table_names():
            with op.get_context().autocommit_block():
                op.execute(sa.text("PRAGMA foreign_keys = OFF"))
                try:
                    for stmt in (
                        "DELETE FROM media_assets WHERE kind = 'chat'",
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
