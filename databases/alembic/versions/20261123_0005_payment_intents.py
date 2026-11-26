"""Таблица payment_intents для эквайринга (ЮKassa API v3, 54-ФЗ, Idempotence-Key)."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0005"
down_revision = "20261123_0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS oltp.payment_intents (
                id TEXT PRIMARY KEY,
                user_id BIGINT NOT NULL REFERENCES oltp.users(id) ON DELETE CASCADE,
                provider TEXT NOT NULL DEFAULT 'yookassa',
                idempotency_key TEXT NOT NULL UNIQUE,
                provider_payment_id TEXT UNIQUE,
                method TEXT NOT NULL CHECK (method IN ('sbp', 'card')),
                plan_id TEXT NOT NULL DEFAULT 'trial5k',
                amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
                fee_rub INTEGER NOT NULL DEFAULT 0 CHECK (fee_rub >= 0),
                total_rub INTEGER NOT NULL CHECK (total_rub > 0),
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'waiting_for_capture', 'succeeded', 'canceled')),
                credited BOOLEAN NOT NULL DEFAULT FALSE,
                receipt_email TEXT NOT NULL DEFAULT '',
                receipt_phone TEXT NOT NULL DEFAULT '',
                confirmation_url TEXT NOT NULL DEFAULT '',
                return_url TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                paid_at TIMESTAMPTZ
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_oltp_payment_intents_user_created ON oltp.payment_intents(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_oltp_payment_intents_status_created ON oltp.payment_intents(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))
    else:
        for stmt in (
            """
            CREATE TABLE IF NOT EXISTS payment_intents (
                id TEXT PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                provider TEXT NOT NULL DEFAULT 'yookassa',
                idempotency_key TEXT NOT NULL UNIQUE,
                provider_payment_id TEXT UNIQUE,
                method TEXT NOT NULL CHECK (method IN ('sbp', 'card')),
                plan_id TEXT NOT NULL DEFAULT 'trial5k',
                amount_rub INTEGER NOT NULL CHECK (amount_rub > 0),
                fee_rub INTEGER NOT NULL DEFAULT 0 CHECK (fee_rub >= 0),
                total_rub INTEGER NOT NULL CHECK (total_rub > 0),
                status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'waiting_for_capture', 'succeeded', 'canceled')),
                credited INTEGER NOT NULL DEFAULT 0,
                receipt_email TEXT NOT NULL DEFAULT '',
                receipt_phone TEXT NOT NULL DEFAULT '',
                confirmation_url TEXT NOT NULL DEFAULT '',
                return_url TEXT NOT NULL DEFAULT '',
                error_message TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                paid_at TEXT
            )
            """,
            "CREATE INDEX IF NOT EXISTS idx_payment_intents_user_created ON payment_intents(user_id, created_at DESC)",
            "CREATE INDEX IF NOT EXISTS idx_payment_intents_status_created ON payment_intents(status, created_at DESC)",
        ):
            op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP TABLE IF EXISTS oltp.payment_intents CASCADE"))
    else:
        op.execute(sa.text("DROP TABLE IF EXISTS payment_intents"))
