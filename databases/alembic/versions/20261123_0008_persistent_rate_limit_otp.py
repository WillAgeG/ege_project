"""Персистентные RateLimiter, PhoneOtpStore и slots_json для анкет репетиторов."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0008"
down_revision = "20261123_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS oltp.rate_limit_hits (
                id BIGSERIAL PRIMARY KEY,
                bucket_key TEXT NOT NULL,
                created_at DOUBLE PRECISION NOT NULL,
                expires_at DOUBLE PRECISION NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_rate_limit_hits_key_created ON oltp.rate_limit_hits(bucket_key, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_rate_limit_hits_expires ON oltp.rate_limit_hits(expires_at)",
            """
            CREATE TABLE IF NOT EXISTS oltp.phone_otp_codes (
                phone_digits TEXT PRIMARY KEY,
                code_hash TEXT NOT NULL,
                channel TEXT NOT NULL DEFAULT 'wa' CHECK (channel IN ('wa', 'tg')),
                mode TEXT NOT NULL DEFAULT 'login' CHECK (mode IN ('login', 'register')),
                invite_ok BOOLEAN NOT NULL DEFAULT FALSE,
                attempts INTEGER NOT NULL DEFAULT 0,
                created_at DOUBLE PRECISION NOT NULL,
                expires_at DOUBLE PRECISION NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_phone_otp_codes_expires ON oltp.phone_otp_codes(expires_at)",
            "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS slots_json JSONB NOT NULL DEFAULT '{}'::jsonb",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS rate_limit_hits (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                bucket_key TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_key_created ON rate_limit_hits(bucket_key, created_at)",
            "CREATE INDEX IF NOT EXISTS idx_rate_limit_hits_expires ON rate_limit_hits(expires_at)",
            """
            CREATE TABLE IF NOT EXISTS phone_otp_codes (
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
            "CREATE INDEX IF NOT EXISTS idx_phone_otp_codes_expires ON phone_otp_codes(expires_at)",
        ):
            op.execute(sa.text(stmt))

        inspector = sa.inspect(bind)
        if "admin_tutors" in inspector.get_table_names():
            cols = {c["name"] for c in inspector.get_columns("admin_tutors")}
            if "slots_json" not in cols:
                op.execute(sa.text("ALTER TABLE admin_tutors ADD COLUMN slots_json TEXT NOT NULL DEFAULT '{}'"))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("ALTER TABLE IF EXISTS oltp.tutors DROP COLUMN IF EXISTS slots_json"))
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.phone_otp_codes CASCADE"))
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.rate_limit_hits CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS phone_otp_codes"))
        op.execute(sa.text("DROP TABLE IF EXISTS rate_limit_hits"))
