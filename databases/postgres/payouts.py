"""PostgreSQL 17 операции для B2C-выплат (ЮKassa Payouts API v3) и чеков НПД (ФНС «Мой налог»)."""

from __future__ import annotations

from typing import Any
import uuid

from databases.sqlite.store import StorageError

from .schema import _iso_utc


class PgPayoutsMixin:
    @staticmethod
    def _pg_serialize_npd_receipt(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "payoutId": str(row["payout_id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row.get("tutor_name") or ""),
            "tutorInn": str(row.get("tutor_inn") or ""),
            "provider": str(row.get("provider") or "demo"),
            "receiptUuid": str(row.get("receipt_uuid") or ""),
            "receiptUrl": str(row.get("receipt_url") or ""),
            "receiptJsonUrl": str(row.get("receipt_json_url") or ""),
            "serviceName": str(row.get("service_name") or ""),
            "amountRub": int(row.get("amount_rub") or 0),
            "status": str(row.get("status") or "demo"),
            "errorMessage": str(row.get("error_message") or ""),
            "createdAt": _iso_utc(row.get("created_at")) or "",
            "updatedAt": _iso_utc(row.get("updated_at")) or "",
            "canceledAt": _iso_utc(row.get("canceled_at")),
        }

    def get_payout(self, payout_id: str) -> dict[str, Any] | None:
        pid = str(payout_id or "").strip()
        if not pid:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                FROM oltp.payout_requests p
                LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                WHERE p.id = %s
                """,
                (pid,),
            ).fetchone()
        return self._admin_payout_row_to_dict(row) if row else None

    def get_payout_dispatch_details(self, payout_id: str) -> dict[str, Any] | None:
        pid = str(payout_id or "").strip()
        if not pid:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT p.*, COALESCE(t.full_name, '') AS tutor_name,
                       t.user_id AS tutor_user_id, t.inn AS tutor_saved_inn
                FROM oltp.payout_requests p
                LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                WHERE p.id = %s
                """,
                (pid,),
            ).fetchone()
        if not row:
            return None
        out = self._admin_payout_row_to_dict(row)
        out["sbpPhone"] = str(row.get("sbp_phone") or "")
        out["payoutToken"] = str(row.get("payout_token") or "")
        out["tutorUserId"] = int(row["tutor_user_id"]) if row.get("tutor_user_id") is not None else None
        out["tutorSavedInn"] = str(row.get("tutor_saved_inn") or "")
        return out

    def get_payout_by_provider_id(self, provider_payout_id: str) -> dict[str, Any] | None:
        ppid = str(provider_payout_id or "").strip()
        if not ppid:
            return None
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                FROM oltp.payout_requests p
                LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                WHERE p.provider_payout_id = %s
                """,
                (ppid,),
            ).fetchone()
        return self._admin_payout_row_to_dict(row) if row else None

    def list_pending_provider_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                FROM oltp.payout_requests p
                LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                WHERE p.provider = 'yookassa'
                  AND p.provider_payout_id IS NOT NULL
                  AND p.provider_payout_id <> ''
                  AND p.status IN ('processing', 'pending')
                ORDER BY p.created_at ASC, p.id ASC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._admin_payout_row_to_dict(r) for r in rows]

    def attach_provider_payout(
        self,
        payout_id: str,
        *,
        provider: str,
        provider_payout_id: str | None,
        provider_status: str,
        error_message: str = "",
    ) -> dict[str, Any] | None:
        pid = str(payout_id or "").strip()
        if not pid:
            return None
        clean_err = str(error_message or "").strip()[:300]
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    UPDATE oltp.payout_requests
                    SET provider = %s,
                        provider_payout_id = COALESCE(NULLIF(%s, ''), provider_payout_id),
                        provider_status = %s,
                        antifraud_hold = FALSE,
                        antifraud_reason = '',
                        error_message = %s,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (
                        str(provider or "yookassa").strip()[:32] or "yookassa",
                        str(provider_payout_id or "").strip(),
                        str(provider_status or "pending").strip()[:32] or "pending",
                        clean_err,
                        pid,
                    ),
                )
        return self.get_payout(pid)

    def finalize_payout_succeeded(
        self,
        payout_id: str,
        *,
        provider_payout_id: str | None = None,
        provider_status: str = "succeeded",
    ) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        clean_pstat = str(provider_status or "succeeded").strip()[:32] or "succeeded"
        newly_succeeded = False
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT * FROM oltp.payout_requests WHERE id = %s FOR UPDATE",
                    (pid,),
                ).fetchone()
                if not row:
                    raise StorageError("not_found", "Выплата не найдена.", 404)
                already_ok = str(row["status"] or "") == "paid"
                conn.execute(
                    """
                    UPDATE oltp.payout_requests
                    SET status = 'paid',
                        provider_payout_id = COALESCE(NULLIF(%s, ''), provider_payout_id),
                        provider_status = %s,
                        antifraud_hold = FALSE,
                        antifraud_reason = '',
                        sbp_phone = '',
                        payout_token = '',
                        error_message = '',
                        paid_at = COALESCE(paid_at, NOW()),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (str(provider_payout_id or "").strip(), clean_pstat, pid),
                )
                if not already_ok:
                    newly_succeeded = True
                    self._insert_outbox(
                        conn,
                        topic="vektor.payments.ledger.v1",
                        partition_key=pid,
                        event_type="payments.payout.succeeded",
                        role="tutor",
                        view="fees",
                        payload={
                            "payoutId": pid,
                            "tutorId": str(row["tutor_id"]),
                            "amountRub": int(row["amount_rub"]),
                            "method": str(row["method"]),
                            "provider": str(row.get("provider") or "yookassa"),
                            "providerPayoutId": str(provider_payout_id or row.get("provider_payout_id") or ""),
                        },
                    )
        return {"payout": self.get_payout(pid), "newlySucceeded": newly_succeeded}

    def finalize_payout_canceled(
        self,
        payout_id: str,
        *,
        reason: str = "",
        provider_status: str = "canceled",
    ) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        clean_reason = str(reason or "canceled").strip()[:300]
        clean_pstat = str(provider_status or "canceled").strip()[:32] or "canceled"
        newly_canceled = False
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT * FROM oltp.payout_requests WHERE id = %s FOR UPDATE",
                    (pid,),
                ).fetchone()
                if not row:
                    raise StorageError("not_found", "Выплата не найдена.", 404)
                cur_st = str(row["status"] or "")
                if cur_st == "paid":
                    return {"payout": self.get_payout(pid), "newlyCanceled": False}
                already_failed = cur_st == "failed"
                conn.execute(
                    """
                    UPDATE oltp.payout_requests
                    SET status = 'failed',
                        provider_status = %s,
                        sbp_phone = '',
                        payout_token = '',
                        error_message = COALESCE(NULLIF(%s, ''), error_message),
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (clean_pstat, clean_reason, pid),
                )
                if not already_failed:
                    newly_canceled = True
                    self._insert_outbox(
                        conn,
                        topic="vektor.payments.ledger.v1",
                        partition_key=pid,
                        event_type="payments.payout.canceled",
                        role="tutor",
                        view="fees",
                        payload={
                            "payoutId": pid,
                            "tutorId": str(row["tutor_id"]),
                            "amountRub": int(row["amount_rub"]),
                            "reason": clean_reason,
                        },
                    )
        return {"payout": self.get_payout(pid), "newlyCanceled": newly_canceled}

    def save_npd_receipt(
        self,
        payout_id: str,
        *,
        tutor_id: str,
        tutor_inn: str,
        provider: str,
        receipt_uuid: str,
        receipt_url: str,
        receipt_json_url: str,
        service_name: str,
        amount_rub: int,
        status: str,
        error_message: str = "",
    ) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        clean_st = str(status or "demo").strip().lower()
        if clean_st not in ("demo", "pending", "registered", "failed", "canceled"):
            clean_st = "failed"
        clean_inn = str(tutor_inn or "").strip()[:16]
        clean_uuid = str(receipt_uuid or "").strip()[:80]
        clean_url = str(receipt_url or "").strip()[:500]
        clean_json_url = str(receipt_json_url or "").strip()[:500]
        clean_srv = str(service_name or "").strip()[:255]
        clean_prov = str(provider or "demo").strip()[:32] or "demo"
        clean_err = str(error_message or "").strip()[:300]
        rid = f"npd-{uuid.uuid4().hex[:12]}"

        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT * FROM oltp.payout_requests WHERE id = %s FOR UPDATE",
                    (pid,),
                ).fetchone()
                if not row:
                    raise StorageError("not_found", "Выплата не найдена.", 404)
                eff_tid = str(tutor_id or row["tutor_id"]).strip()
                eff_amt = int(amount_rub or row["amount_rub"] or 0)
                conn.execute(
                    """
                    INSERT INTO oltp.npd_receipts (
                        id, payout_id, tutor_id, tutor_inn, provider,
                        receipt_uuid, receipt_url, receipt_json_url, service_name,
                        amount_rub, status, error_message, canceled_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        CASE WHEN %s = 'canceled' THEN NOW() ELSE NULL END
                    )
                    ON CONFLICT(payout_id) DO UPDATE SET
                        tutor_inn = COALESCE(NULLIF(excluded.tutor_inn, ''), oltp.npd_receipts.tutor_inn),
                        provider = excluded.provider,
                        receipt_uuid = CASE
                            WHEN excluded.status = 'canceled' THEN oltp.npd_receipts.receipt_uuid
                            ELSE COALESCE(NULLIF(excluded.receipt_uuid, ''), oltp.npd_receipts.receipt_uuid)
                        END,
                        receipt_url = CASE
                            WHEN excluded.status = 'canceled' THEN oltp.npd_receipts.receipt_url
                            ELSE COALESCE(NULLIF(excluded.receipt_url, ''), oltp.npd_receipts.receipt_url)
                        END,
                        receipt_json_url = CASE
                            WHEN excluded.status = 'canceled' THEN oltp.npd_receipts.receipt_json_url
                            ELSE COALESCE(NULLIF(excluded.receipt_json_url, ''), oltp.npd_receipts.receipt_json_url)
                        END,
                        service_name = COALESCE(NULLIF(excluded.service_name, ''), oltp.npd_receipts.service_name),
                        status = excluded.status,
                        error_message = excluded.error_message,
                        updated_at = NOW(),
                        canceled_at = CASE WHEN excluded.status = 'canceled' THEN NOW() ELSE NULL END
                    """,
                    (
                        rid,
                        pid,
                        eff_tid,
                        clean_inn,
                        clean_prov,
                        clean_uuid,
                        clean_url,
                        clean_json_url,
                        clean_srv,
                        eff_amt,
                        clean_st,
                        clean_err,
                        clean_st,
                    ),
                )
                if clean_st == "canceled":
                    conn.execute(
                        """
                        UPDATE oltp.payout_requests
                        SET npd_status = 'canceled',
                            npd_receipt = NULL,
                            npd_receipt_url = '',
                            tutor_inn = COALESCE(NULLIF(%s, ''), tutor_inn),
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (clean_inn, pid),
                    )
                elif clean_st in ("registered", "demo"):
                    conn.execute(
                        """
                        UPDATE oltp.payout_requests
                        SET npd_status = %s,
                            npd_receipt = COALESCE(NULLIF(%s, ''), npd_receipt),
                            npd_receipt_url = COALESCE(NULLIF(%s, ''), npd_receipt_url),
                            tutor_inn = COALESCE(NULLIF(%s, ''), tutor_inn),
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (clean_st, clean_uuid, clean_url, clean_inn, pid),
                    )
                else:
                    conn.execute(
                        """
                        UPDATE oltp.payout_requests
                        SET npd_status = %s,
                            tutor_inn = COALESCE(NULLIF(%s, ''), tutor_inn),
                            error_message = COALESCE(NULLIF(%s, ''), error_message),
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (clean_st, clean_inn, clean_err, pid),
                    )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=pid,
                    event_type=f"payments.npd.{clean_st}",
                    role="tutor",
                    view="fees",
                    payload={
                        "payoutId": pid,
                        "tutorId": eff_tid,
                        "provider": clean_prov,
                        "receiptUuid": clean_uuid,
                        "receiptUrl": clean_url,
                        "status": clean_st,
                        "amountRub": eff_amt,
                    },
                )
                rc_row = conn.execute(
                    """
                    SELECT r.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.npd_receipts r
                    LEFT JOIN oltp.tutors t ON t.id = r.tutor_id
                    WHERE r.payout_id = %s
                    """,
                    (pid,),
                ).fetchone()
        return {
            "receipt": self._pg_serialize_npd_receipt(rc_row) if rc_row else None,
            "payout": self.get_payout(pid),
        }

    def list_npd_receipts(self, *, tutor_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        with self._pool.connection() as conn:
            if tutor_id:
                rows = conn.execute(
                    """
                    SELECT r.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.npd_receipts r
                    LEFT JOIN oltp.tutors t ON t.id = r.tutor_id
                    WHERE r.tutor_id = %s
                    ORDER BY r.created_at DESC, r.id DESC
                    LIMIT %s
                    """,
                    (str(tutor_id).strip(), lim),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT r.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.npd_receipts r
                    LEFT JOIN oltp.tutors t ON t.id = r.tutor_id
                    ORDER BY r.created_at DESC, r.id DESC
                    LIMIT %s
                    """,
                    (lim,),
                ).fetchall()
        return [self._pg_serialize_npd_receipt(r) for r in rows]

    def update_tutor_inn(
        self,
        tutor_id: str | None,
        *,
        inn: str,
        npd_verified: bool,
        actor_user_id: int | None = None,
        actor_role: str = "student",
    ) -> dict[str, Any] | None:
        tid = str(tutor_id or "").strip()
        with self._pool.connection() as conn:
            with conn.transaction():
                row = None
                if tid:
                    row = conn.execute("SELECT id, user_id FROM oltp.tutors WHERE id = %s FOR UPDATE", (tid,)).fetchone()
                    if row and actor_user_id is not None and row.get("user_id") is not None:
                        if int(row["user_id"]) != int(actor_user_id) and str(actor_role or "").lower() != "admin":
                            raise StorageError("forbidden", "Нет прав на изменение чужой анкеты.", 403)
                elif actor_user_id is not None:
                    row = conn.execute("SELECT id, user_id FROM oltp.tutors WHERE user_id = %s LIMIT 1 FOR UPDATE", (int(actor_user_id),)).fetchone()
                if not row:
                    return None
                eff_tid = str(row["id"])
                updated = conn.execute(
                    """
                    UPDATE oltp.tutors
                    SET inn = %s, npd_verified = %s, npd_checked_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, inn, npd_verified, npd_checked_at
                    """,
                    (str(inn or "").strip()[:16], bool(npd_verified), eff_tid),
                ).fetchone()
        if not updated:
            return None
        return {
            "tutorId": str(updated["id"]),
            "inn": str(updated.get("inn") or ""),
            "npdVerified": bool(updated.get("npd_verified")),
            "npdCheckedAt": _iso_utc(updated.get("npd_checked_at")),
        }

    def count_tutor_captured_lessons(self, tutor_id: str) -> int:
        tid = str(tutor_id or "").strip()
        if not tid:
            return 0
        with self._pool.connection() as conn:
            row = conn.execute(
                "SELECT COUNT(*) AS cnt FROM oltp.escrow_holds WHERE tutor_id = %s AND status = 'captured'",
                (tid,),
            ).fetchone()
        return int(row["cnt"] if row else 0)


__all__ = ["PgPayoutsMixin"]
