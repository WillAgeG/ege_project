"""Расширение таблиц выплат для ЮKassa Payouts API v3 (СБП / Мир), ИНН репетиторов и чеков НПД (ФНС)."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0006"
down_revision = "20261123_0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS inn TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS npd_verified BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE IF EXISTS oltp.tutors ADD COLUMN IF NOT EXISTS npd_checked_at TIMESTAMPTZ",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS idempotency_key TEXT",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'manual'",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS provider_payout_id TEXT",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS provider_status TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS sbp_bank_id TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS sbp_phone TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS payout_token TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS tutor_inn TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS antifraud_hold BOOLEAN NOT NULL DEFAULT FALSE",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS antifraud_reason TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS npd_requested BOOLEAN NOT NULL DEFAULT TRUE",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS npd_status TEXT NOT NULL DEFAULT 'none'",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS npd_receipt_url TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS error_message TEXT NOT NULL DEFAULT ''",
            "ALTER TABLE IF EXISTS oltp.payout_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()",
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_payout_requests_idempotency
            ON oltp.payout_requests(idempotency_key)
            WHERE idempotency_key IS NOT NULL AND idempotency_key <> ''
            """,
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_oltp_payout_requests_provider_id
            ON oltp.payout_requests(provider_payout_id)
            WHERE provider_payout_id IS NOT NULL AND provider_payout_id <> ''
            """,
            """
            CREATE TABLE IF NOT EXISTS oltp.npd_receipts (
                id TEXT PRIMARY KEY,
                payout_id TEXT NOT NULL UNIQUE REFERENCES oltp.payout_requests(id) ON DELETE CASCADE,
                tutor_id TEXT NOT NULL REFERENCES oltp.tutors(id) ON DELETE CASCADE,
                tutor_inn TEXT NOT NULL DEFAULT '',
                provider TEXT NOT NULL DEFAULT 'demo',
                receipt_uuid TEXT NOT NULL DEFAULT '',
                receipt_url TEXT NOT NULL DEFAULT '',
                receipt_json_url TEXT NOT NULL DEFAULT '',
                service_name TEXT NOT NULL DEFAULT '',
                amount_rub INTEGER NOT NULL CHECK (amount_rub >= 0),
                status TEXT NOT NULL DEFAULT 'demo' CHECK (status IN ('demo', 'pending', 'registered', 'failed', 'canceled')),
                error_message TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                canceled_at TIMESTAMPTZ
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_npd_receipts_tutor_created ON oltp.npd_receipts(tutor_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_npd_receipts_status_created ON oltp.npd_receipts(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))
    else:
        conn = op.get_bind()
        tutor_cols = {
            str(r[1]) for r in conn.execute(sa.text("PRAGMA table_info(admin_tutors)")).fetchall()
        }
        for col_name, col_def in (
            ("inn", "TEXT NOT NULL DEFAULT ''"),
            ("npd_verified", "INTEGER NOT NULL DEFAULT 0"),
            ("npd_checked_at", "TEXT"),
        ):
            if col_name not in tutor_cols:
                op.execute(sa.text(f"ALTER TABLE admin_tutors ADD COLUMN {col_name} {col_def}"))

        pay_cols = {
            str(r[1]) for r in conn.execute(sa.text("PRAGMA table_info(admin_payout_requests)")).fetchall()
        }
        for col_name, col_def in (
            ("idempotency_key", "TEXT"),
            ("provider", "TEXT NOT NULL DEFAULT 'manual'"),
            ("provider_payout_id", "TEXT"),
            ("provider_status", "TEXT NOT NULL DEFAULT ''"),
            ("sbp_bank_id", "TEXT NOT NULL DEFAULT ''"),
            ("sbp_phone", "TEXT NOT NULL DEFAULT ''"),
            ("payout_token", "TEXT NOT NULL DEFAULT ''"),
            ("tutor_inn", "TEXT NOT NULL DEFAULT ''"),
            ("antifraud_hold", "INTEGER NOT NULL DEFAULT 0"),
            ("antifraud_reason", "TEXT NOT NULL DEFAULT ''"),
            ("npd_requested", "INTEGER NOT NULL DEFAULT 1"),
            ("npd_status", "TEXT NOT NULL DEFAULT 'none'"),
            ("npd_receipt_url", "TEXT NOT NULL DEFAULT ''"),
            ("error_message", "TEXT NOT NULL DEFAULT ''"),
            ("updated_at", "TEXT"),
        ):
            if col_name not in pay_cols:
                op.execute(sa.text(f"ALTER TABLE admin_payout_requests ADD COLUMN {col_name} {col_def}"))

        for stmt in (
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_payout_requests_idempotency
            ON admin_payout_requests(idempotency_key)
            WHERE idempotency_key IS NOT NULL AND idempotency_key != ''
            """,
            """
            CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_payout_requests_provider_id
            ON admin_payout_requests(provider_payout_id)
            WHERE provider_payout_id IS NOT NULL AND provider_payout_id != ''
            """,
            """
            CREATE TABLE IF NOT EXISTS npd_receipts (
                id TEXT PRIMARY KEY,
                payout_id TEXT NOT NULL UNIQUE REFERENCES admin_payout_requests(id) ON DELETE CASCADE,
                tutor_id TEXT NOT NULL,
                tutor_inn TEXT NOT NULL DEFAULT '',
                provider TEXT NOT NULL DEFAULT 'demo',
                receipt_uuid TEXT NOT NULL DEFAULT '',
                receipt_url TEXT NOT NULL DEFAULT '',
                receipt_json_url TEXT NOT NULL DEFAULT '',
                service_name TEXT NOT NULL DEFAULT '',
                amount_rub INTEGER NOT NULL CHECK (amount_rub >= 0),
                status TEXT NOT NULL DEFAULT 'demo' CHECK (status IN ('demo', 'pending', 'registered', 'failed', 'canceled')),
                error_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                canceled_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_npd_receipts_tutor_created ON npd_receipts(tutor_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_npd_receipts_status_created ON npd_receipts(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.npd_receipts CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS npd_receipts"))
