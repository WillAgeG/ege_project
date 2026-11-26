"""Таблица chat_messages для мини-мессенджера и диалогов «Общение»."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261124_0012"
down_revision = "20261123_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS oltp.chat_messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                booking_id TEXT,
                tutor_id TEXT NOT NULL DEFAULT '',
                student_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                tutor_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                sender_user_id BIGINT REFERENCES oltp.users(id) ON DELETE SET NULL,
                sender_role TEXT NOT NULL DEFAULT 'student' CHECK (sender_role IN ('student', 'tutor', 'system')),
                sender_name TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL,
                read_by_student BOOLEAN NOT NULL DEFAULT FALSE,
                read_by_tutor BOOLEAN NOT NULL DEFAULT FALSE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_thread_created ON oltp.chat_messages(thread_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_student_created ON oltp.chat_messages(student_user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_tutor_created ON oltp.chat_messages(tutor_user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_chat_messages_booking ON oltp.chat_messages(booking_id)",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                thread_id TEXT NOT NULL,
                booking_id TEXT,
                tutor_id TEXT NOT NULL DEFAULT '',
                student_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                tutor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                sender_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
                sender_role TEXT NOT NULL DEFAULT 'student' CHECK (sender_role IN ('student', 'tutor', 'system')),
                sender_name TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL,
                read_by_student INTEGER NOT NULL DEFAULT 0,
                read_by_tutor INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_thread_created ON chat_messages(thread_id, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_student_created ON chat_messages(student_user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_tutor_created ON chat_messages(tutor_user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_chat_messages_booking ON chat_messages(booking_id)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.chat_messages CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS chat_messages"))
