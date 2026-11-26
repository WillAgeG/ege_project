"""Горячие индексы БД для заявок/сессий/OAuth/TG/realtime и правка CHECK-ограничений escrow_holds."""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "20261126_0014"
down_revision = "20261124_0013"
branch_labels = None
depends_on = None

_SQLITE_INDEXES: tuple[tuple[str, str, str], ...] = (
    (
        "admin_lesson_requests",
        "idx_admin_lesson_requests_student_created",
        "CREATE INDEX IF NOT EXISTS idx_admin_lesson_requests_student_created ON admin_lesson_requests(student_user_id, created_at DESC)",
    ),
    (
        "admin_lesson_requests",
        "idx_admin_lesson_requests_tutor_status_created",
        "CREATE INDEX IF NOT EXISTS idx_admin_lesson_requests_tutor_status_created ON admin_lesson_requests(tutor_id, status, created_at DESC)",
    ),
    (
        "sessions",
        "idx_sessions_expires",
        "CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at)",
    ),
    (
        "oauth_states",
        "idx_oauth_states_expires",
        "CREATE INDEX IF NOT EXISTS idx_oauth_states_expires ON oauth_states(expires_at)",
    ),
    (
        "telegram_link_tokens",
        "idx_telegram_link_tokens_expires",
        "CREATE INDEX IF NOT EXISTS idx_telegram_link_tokens_expires ON telegram_link_tokens(expires_at)",
    ),
    (
        "realtime_notifications",
        "idx_realtime_notifications_created",
        "CREATE INDEX IF NOT EXISTS idx_realtime_notifications_created ON realtime_notifications(created_at)",
    ),
)

_PG_INDEXES: tuple[tuple[str, str], ...] = (
    (
        "idx_oltp_lesson_requests_student_created",
        "CREATE INDEX IF NOT EXISTS idx_oltp_lesson_requests_student_created ON oltp.lesson_requests(student_user_id, created_at DESC)",
    ),
    (
        "idx_oltp_lesson_requests_tutor_status_created",
        "CREATE INDEX IF NOT EXISTS idx_oltp_lesson_requests_tutor_status_created ON oltp.lesson_requests(tutor_id, status, created_at DESC)",
    ),
    (
        "idx_oltp_sessions_expires",
        "CREATE INDEX IF NOT EXISTS idx_oltp_sessions_expires ON oltp.sessions(expires_at)",
    ),
    (
        "idx_oltp_oauth_states_expires",
        "CREATE INDEX IF NOT EXISTS idx_oltp_oauth_states_expires ON oltp.oauth_states(expires_at)",
    ),
    (
        "idx_oltp_telegram_link_tokens_expires",
        "CREATE INDEX IF NOT EXISTS idx_oltp_telegram_link_tokens_expires ON oltp.telegram_link_tokens(expires_at)",
    ),
    (
        "idx_oltp_realtime_notifications_created",
        "CREATE INDEX IF NOT EXISTS idx_oltp_realtime_notifications_created ON oltp.realtime_notifications(created_at)",
    ),
)


def upgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_platform_fee_rub_check",
            "ALTER TABLE IF EXISTS oltp.escrow_holds ADD CONSTRAINT escrow_holds_platform_fee_rub_check CHECK (platform_fee_rub >= 0 AND platform_fee_rub <= gross_rub)",
            "ALTER TABLE IF EXISTS oltp.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_tutor_payout_rub_check",
            "ALTER TABLE IF EXISTS oltp.escrow_holds ADD CONSTRAINT escrow_holds_tutor_payout_rub_check CHECK (tutor_payout_rub >= 0 AND tutor_payout_rub <= gross_rub - platform_fee_rub)",
        ):
            op.execute(sa.text(stmt))
        for _idx_name, stmt in _PG_INDEXES:
            op.execute(sa.text(stmt))
    else:
        existing_tables = set(sa.inspect(bind).get_table_names())
        for table_name, _idx_name, stmt in _SQLITE_INDEXES:
            if table_name in existing_tables:
                op.execute(sa.text(stmt))


def downgrade() -> None:
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        for idx_name, _stmt in reversed(_PG_INDEXES):
            op.execute(sa.text(f"DROP INDEX IF EXISTS oltp.{idx_name}"))
        for stmt in (
            "ALTER TABLE IF EXISTS oltp.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_tutor_payout_rub_check",
            "ALTER TABLE IF EXISTS oltp.escrow_holds DROP CONSTRAINT IF EXISTS escrow_holds_platform_fee_rub_check",
            "ALTER TABLE IF EXISTS oltp.escrow_holds ADD CONSTRAINT escrow_holds_platform_fee_rub_check CHECK (platform_fee_rub = ROUND(gross_rub::numeric * 0.05)::integer)",
            "ALTER TABLE IF EXISTS oltp.escrow_holds ADD CONSTRAINT escrow_holds_tutor_payout_rub_check CHECK (tutor_payout_rub = gross_rub - platform_fee_rub - ROUND(gross_rub::numeric * 0.01)::integer)",
        ):
            op.execute(sa.text(stmt))
    else:
        for _table_name, idx_name, _stmt in reversed(_SQLITE_INDEXES):
            op.execute(sa.text(f"DROP INDEX IF EXISTS {idx_name}"))
