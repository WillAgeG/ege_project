"""Таблица payment_refunds для банковских возвратов остатка кошелька через ЮKassa (POST /v3/refunds)."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0011"
down_revision = "20261123_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS oltp.payment_refunds (
                id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                payment_intent_id TEXT REFERENCES oltp.payment_intents(id) ON DELETE SET NULL,
                provider TEXT NOT NULL DEFAULT 'yookassa',
                idempotency_key TEXT NOT NULL UNIQUE,
                provider_payment_id TEXT,
                provider_refund_id TEXT UNIQUE,
                method TEXT NOT NULL DEFAULT 'sbp' CHECK (method IN ('sbp', 'card')),
                amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
                reason TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'pending', 'succeeded', 'canceled', 'rejected')),
                balance_reverted BOOLEAN NOT NULL DEFAULT FALSE,
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_by TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                receipt_email TEXT NOT NULL DEFAULT '',
                receipt_phone TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                refunded_at TIMESTAMPTZ
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_payment_refunds_user_created ON oltp.payment_refunds(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_payment_refunds_intent_status ON oltp.payment_refunds(payment_intent_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_payment_refunds_status_created ON oltp.payment_refunds(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS payment_refunds (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                payment_intent_id TEXT REFERENCES payment_intents(id) ON DELETE SET NULL,
                provider TEXT NOT NULL DEFAULT 'yookassa',
                idempotency_key TEXT NOT NULL UNIQUE,
                provider_payment_id TEXT,
                provider_refund_id TEXT UNIQUE,
                method TEXT NOT NULL DEFAULT 'sbp' CHECK (method IN ('sbp', 'card')),
                amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
                reason TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'pending', 'succeeded', 'canceled', 'rejected')),
                balance_reverted INTEGER NOT NULL DEFAULT 0,
                review_note TEXT NOT NULL DEFAULT '',
                reviewed_by TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                receipt_email TEXT NOT NULL DEFAULT '',
                receipt_phone TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                refunded_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_payment_refunds_user_created ON payment_refunds(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_payment_refunds_intent_status ON payment_refunds(payment_intent_id, status)",
            "CREATE INDEX IF NOT EXISTS idx_payment_refunds_status_created ON payment_refunds(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.payment_refunds CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS payment_refunds"))
