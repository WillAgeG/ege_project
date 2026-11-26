"""Поддержка канала доставки OTP 'sms' в таблице phone_otp_codes."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0009"
down_revision = "20261123_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.phone_otp_codes DROP CONSTRAINT IF EXISTS phone_otp_codes_channel_check",
            "ALTER TABLE IF EXISTS oltp.phone_otp_codes ADD CONSTRAINT phone_otp_codes_channel_check CHECK (channel IN ('wa', 'tg', 'sms'))",
        ):
            op.execute(sa.text(stmt))
    else:
        inspector = sa.inspect(bind)
        if "phone_otp_codes" in inspector.get_table_names():
            for stmt in (
                """
                CREATE TABLE phone_otp_codes_v2 (
                    phone_digits TEXT PRIMARY KEY,
                    code_hash TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'wa' CHECK (channel IN ('wa', 'tg', 'sms')),
                    mode TEXT NOT NULL DEFAULT 'login' CHECK (mode IN ('login', 'register')),
                    invite_ok INTEGER NOT NULL DEFAULT 0,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                )
                """,
                """
                INSERT OR IGNORE INTO phone_otp_codes_v2
                    (phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at)
                SELECT phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
                FROM phone_otp_codes
                """,
                "DROP TABLE phone_otp_codes",
                "ALTER TABLE phone_otp_codes_v2 RENAME TO phone_otp_codes",
                "CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_expires ON phone_otp_codes(expires_at)",
            ):
                op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "UPDATE oltp.phone_otp_codes SET channel = 'wa' WHERE channel = 'sms'",
            "ALTER TABLE IF EXISTS oltp.phone_otp_codes DROP CONSTRAINT IF EXISTS phone_otp_codes_channel_check",
            "ALTER TABLE IF EXISTS oltp.phone_otp_codes ADD CONSTRAINT phone_otp_codes_channel_check CHECK (channel IN ('wa', 'tg'))",
        ):
            op.execute(sa.text(stmt))
    else:
        inspector = sa.inspect(bind)
        if "phone_otp_codes" in inspector.get_table_names():
            for stmt in (
                "UPDATE phone_otp_codes SET channel = 'wa' WHERE channel = 'sms'",
                """
                CREATE TABLE phone_otp_codes_v1 (
                    phone_digits TEXT PRIMARY KEY,
                    code_hash TEXT NOT NULL,
                    channel TEXT NOT NULL DEFAULT 'wa' CHECK (channel IN ('wa', 'tg')),
                    mode TEXT NOT NULL DEFAULT 'login' CHECK (mode IN ('login', 'register')),
                    invite_ok INTEGER NOT NULL DEFAULT 0,
                    attempts INTEGER NOT NULL DEFAULT 0,
                    created_at REAL NOT NULL,
                    expires_at REAL NOT NULL
                )
                """,
                """
                INSERT OR IGNORE INTO phone_otp_codes_v1
                    (phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at)
                SELECT phone_digits, code_hash, channel, mode, invite_ok, attempts, created_at, expires_at
                FROM phone_otp_codes
                """,
                "DROP TABLE phone_otp_codes",
                "ALTER TABLE phone_otp_codes_v1 RENAME TO phone_otp_codes",
                "CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_expires ON phone_otp_codes(expires_at)",
            ):
                op.execute(sa.text(stmt))
