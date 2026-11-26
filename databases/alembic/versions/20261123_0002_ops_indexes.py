"""Составные операционные индексы для планировщика эскроу и админ-реестров."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261123_0002"
down_revision = "20261123_0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS idx_oltp_lesson_requests_status_slot "
                "ON oltp.lesson_requests(status, slot_date)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS idx_oltp_escrow_holds_status_req "
                "ON oltp.escrow_holds(status, request_id)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS idx_oltp_payout_requests_status_created "
                "ON oltp.payout_requests(status, created_at)"
            )
        )
    else:
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS idx_admin_lesson_requests_escrow_status "
                "ON admin_lesson_requests(escrow_status, status, slot_date)"
            )
        )
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS idx_admin_payout_requests_status_created "
                "ON admin_payout_requests(status, created_at)"
            )
        )


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute(sa.text("DROP INDEX IF EXISTS oltp.idx_oltp_payout_requests_status_created"))
        op.execute(sa.text("DROP INDEX IF EXISTS oltp.idx_oltp_escrow_holds_status_req"))
        op.execute(sa.text("DROP INDEX IF EXISTS oltp.idx_oltp_lesson_requests_status_slot"))
    else:
        op.execute(sa.text("DROP INDEX IF EXISTS idx_admin_payout_requests_status_created"))
        op.execute(sa.text("DROP INDEX IF EXISTS idx_admin_lesson_requests_escrow_status"))
