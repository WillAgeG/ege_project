"""Операции SQLite для B2C-выплат (ЮKassa Payouts API v3) и чеков НПД (ФНС «Мой налог»)."""

from __future__ import annotations

from typing import Any
import uuid

from .common import StorageError, _iso_utc_now


class SqlitePayoutsMixin:
    @staticmethod
    def _serialize_npd_receipt(row: Any) -> dict[str, Any]:
        keys = set(row.keys())
        return {
            "id": str(row["id"]),
            "payoutId": str(row["payout_id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row["tutor_name"] or "") if "tutor_name" in keys else "",
            "tutorInn": str(row["tutor_inn"] or ""),
            "provider": str(row["provider"] or "demo"),
            "receiptUuid": str(row["receipt_uuid"] or ""),
            "receiptUrl": str(row["receipt_url"] or ""),
            "receiptJsonUrl": str(row["receipt_json_url"] or ""),
            "serviceName": str(row["service_name"] or ""),
            "amountRub": int(row["amount_rub"] or 0),
            "status": str(row["status"] or "demo"),
            "errorMessage": str(row["error_message"] or ""),
            "createdAt": str(row["created_at"] or ""),
            "updatedAt": str(row["updated_at"] or ""),
            "canceledAt": row["canceled_at"],
        }

    def get_payout(self, payout_id: str) -> dict[str, Any] | None:
        pid = str(payout_id or "").strip()
        if not pid:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM admin_payout_requests WHERE id = ?",
                (pid,),
            ).fetchone()
        return self._admin_payout_row_to_dict(row) if row else None

    def get_payout_dispatch_details(self, payout_id: str) -> dict[str, Any] | None:
        pid = str(payout_id or "").strip()
        if not pid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT p.*, t.user_id AS tutor_user_id, t.inn AS tutor_saved_inn
                FROM admin_payout_requests p
                LEFT JOIN admin_tutors t ON t.id = p.tutor_id
                WHERE p.id = ?
                """,
                (pid,),
            ).fetchone()
            if not row:
                return None
            out = self._admin_payout_row_to_dict(row)
            keys = set(row.keys())
            out["sbpPhone"] = str(row["sbp_phone"] or "") if "sbp_phone" in keys else ""
            out["payoutToken"] = str(row["payout_token"] or "") if "payout_token" in keys else ""
            out["tutorUserId"] = int(row["tutor_user_id"]) if row["tutor_user_id"] is not None else None
            out["tutorSavedInn"] = str(row["tutor_saved_inn"] or "") if "tutor_saved_inn" in keys else ""
            return out

    def get_payout_by_provider_id(self, provider_payout_id: str) -> dict[str, Any] | None:
        ppid = str(provider_payout_id or "").strip()
        if not ppid:
            return None
        with self._lock:
            row = self._conn.execute(
                "SELECT * FROM admin_payout_requests WHERE provider_payout_id = ?",
                (ppid,),
            ).fetchone()
        return self._admin_payout_row_to_dict(row) if row else None

    def list_pending_provider_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT * FROM admin_payout_requests
                WHERE provider = 'yookassa'
                  AND provider_payout_id IS NOT NULL
                  AND provider_payout_id != ''
                  AND status IN ('processing', 'pending')
                ORDER BY created_at ASC, id ASC
                LIMIT ?
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
        now_iso = _iso_utc_now()
        clean_err = str(error_message or "").strip()[:300]
        with self._lock:
            self._conn.execute(
                """
                UPDATE admin_payout_requests
                SET provider = ?,
                    provider_payout_id = COALESCE(NULLIF(?, ''), provider_payout_id),
                    provider_status = ?,
                    antifraud_hold = 0,
                    antifraud_reason = '',
                    error_message = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    str(provider or "yookassa").strip()[:32] or "yookassa",
                    str(provider_payout_id or "").strip(),
                    str(provider_status or "pending").strip()[:32] or "pending",
                    clean_err,
                    now_iso,
                    pid,
                ),
            )
            self._conn.commit()
        return self.get_payout(pid)

    def finalize_payout_succeeded(
        self,
        payout_id: str,
        *,
        provider_payout_id: str | None = None,
        provider_status: str = "succeeded",
    ) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        now_iso = _iso_utc_now()
        clean_pstat = str(provider_status or "succeeded").strip()[:32] or "succeeded"
        with self._lock:
            row = self._conn.execute("SELECT * FROM admin_payout_requests WHERE id = ?", (pid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Выплата не найдена.", 404)
            already_ok = str(row["status"] or "") == "succeeded"
            self._conn.execute(
                """
                UPDATE admin_payout_requests
                SET status = 'succeeded',
                    provider_payout_id = COALESCE(NULLIF(?, ''), provider_payout_id),
                    provider_status = ?,
                    antifraud_hold = 0,
                    antifraud_reason = '',
                    sbp_phone = '',
                    payout_token = '',
                    error_message = '',
                    paid_at = COALESCE(paid_at, ?),
                    updated_at = ?
                WHERE id = ?
                """,
                (str(provider_payout_id or "").strip(), clean_pstat, now_iso, now_iso, pid),
            )
            if not already_ok:
                self._record_admin_outbox(
                    "vektor.payments.ledger.v1",
                    pid,
                    "payments.payout.succeeded",
                    {
                        "payoutId": pid,
                        "tutorId": str(row["tutor_id"]),
                        "amountRub": int(row["amount_rub"]),
                        "method": str(row["method"]),
                        "provider": str(row["provider"] or "yookassa"),
                        "providerPayoutId": str(provider_payout_id or row["provider_payout_id"] or ""),
                    },
                )
            self._conn.commit()
        return {"payout": self.get_payout(pid), "newlySucceeded": not already_ok}

    def finalize_payout_canceled(
        self,
        payout_id: str,
        *,
        reason: str = "",
        provider_status: str = "canceled",
    ) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        now_iso = _iso_utc_now()
        clean_reason = str(reason or "canceled").strip()[:300]
        clean_pstat = str(provider_status or "canceled").strip()[:32] or "canceled"
        with self._lock:
            row = self._conn.execute("SELECT * FROM admin_payout_requests WHERE id = ?", (pid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Выплата не найдена.", 404)
            cur_st = str(row["status"] or "")
            if cur_st == "succeeded":
                return {"payout": self._admin_payout_row_to_dict(row), "newlyCanceled": False}
            already_rej = cur_st == "rejected"
            self._conn.execute(
                """
                UPDATE admin_payout_requests
                SET status = 'rejected',
                    provider_status = ?,
                    sbp_phone = '',
                    payout_token = '',
                    error_message = COALESCE(NULLIF(?, ''), error_message),
                    updated_at = ?
                WHERE id = ?
                """,
                (clean_pstat, clean_reason, now_iso, pid),
            )
            if not already_rej:
                self._record_admin_outbox(
                    "vektor.payments.ledger.v1",
                    pid,
                    "payments.payout.canceled",
                    {
                        "payoutId": pid,
                        "tutorId": str(row["tutor_id"]),
                        "amountRub": int(row["amount_rub"]),
                        "reason": clean_reason,
                    },
                )
            self._conn.commit()
        return {"payout": self.get_payout(pid), "newlyCanceled": not already_rej}

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
        now_iso = _iso_utc_now()
        clean_inn = str(tutor_inn or "").strip()[:16]
        clean_uuid = str(receipt_uuid or "").strip()[:80]
        clean_url = str(receipt_url or "").strip()[:500]
        clean_json_url = str(receipt_json_url or "").strip()[:500]
        clean_srv = str(service_name or "").strip()[:255]
        clean_prov = str(provider or "demo").strip()[:32] or "demo"
        clean_err = str(error_message or "").strip()[:300]
        canceled_at = now_iso if clean_st == "canceled" else None
        rid = f"npd-{uuid.uuid4().hex[:12]}"

        with self._lock:
            row = self._conn.execute("SELECT * FROM admin_payout_requests WHERE id = ?", (pid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Выплата не найдена.", 404)
            eff_tid = str(tutor_id or row["tutor_id"]).strip()
            eff_amt = int(amount_rub or row["amount_rub"] or 0)
            self._conn.execute(
                """
                INSERT INTO npd_receipts (
                    id, payout_id, tutor_id, tutor_inn, provider,
                    receipt_uuid, receipt_url, receipt_json_url, service_name,
                    amount_rub, status, error_message, created_at, updated_at, canceled_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(payout_id) DO UPDATE SET
                    tutor_inn = COALESCE(NULLIF(excluded.tutor_inn, ''), npd_receipts.tutor_inn),
                    provider = excluded.provider,
                    receipt_uuid = CASE
                        WHEN excluded.status = 'canceled' THEN npd_receipts.receipt_uuid
                        ELSE COALESCE(NULLIF(excluded.receipt_uuid, ''), npd_receipts.receipt_uuid)
                    END,
                    receipt_url = CASE
                        WHEN excluded.status = 'canceled' THEN npd_receipts.receipt_url
                        ELSE COALESCE(NULLIF(excluded.receipt_url, ''), npd_receipts.receipt_url)
                    END,
                    receipt_json_url = CASE
                        WHEN excluded.status = 'canceled' THEN npd_receipts.receipt_json_url
                        ELSE COALESCE(NULLIF(excluded.receipt_json_url, ''), npd_receipts.receipt_json_url)
                    END,
                    service_name = COALESCE(NULLIF(excluded.service_name, ''), npd_receipts.service_name),
                    status = excluded.status,
                    error_message = excluded.error_message,
                    updated_at = excluded.updated_at,
                    canceled_at = excluded.canceled_at
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
                    now_iso,
                    now_iso,
                    canceled_at,
                ),
            )
            if clean_st == "canceled":
                self._conn.execute(
                    """
                    UPDATE admin_payout_requests
                    SET npd_status = 'canceled',
                        npd_receipt = NULL,
                        npd_receipt_url = '',
                        tutor_inn = COALESCE(NULLIF(?, ''), tutor_inn),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (clean_inn, now_iso, pid),
                )
            elif clean_st in ("registered", "demo"):
                self._conn.execute(
                    """
                    UPDATE admin_payout_requests
                    SET npd_status = ?,
                        npd_receipt = COALESCE(NULLIF(?, ''), npd_receipt),
                        npd_receipt_url = COALESCE(NULLIF(?, ''), npd_receipt_url),
                        tutor_inn = COALESCE(NULLIF(?, ''), tutor_inn),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (clean_st, clean_uuid, clean_url, clean_inn, now_iso, pid),
                )
            else:
                self._conn.execute(
                    """
                    UPDATE admin_payout_requests
                    SET npd_status = ?,
                        tutor_inn = COALESCE(NULLIF(?, ''), tutor_inn),
                        error_message = COALESCE(NULLIF(?, ''), error_message),
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (clean_st, clean_inn, clean_err, now_iso, pid),
                )

            self._record_admin_outbox(
                "vektor.payments.ledger.v1",
                pid,
                f"payments.npd.{clean_st}",
                {
                    "payoutId": pid,
                    "tutorId": eff_tid,
                    "provider": clean_prov,
                    "receiptUuid": clean_uuid,
                    "receiptUrl": clean_url,
                    "status": clean_st,
                    "amountRub": eff_amt,
                },
            )
            self._conn.commit()
            rc_row = self._conn.execute(
                """
                SELECT r.*, COALESCE(t.full_name, '') AS tutor_name
                FROM npd_receipts r
                LEFT JOIN admin_tutors t ON t.id = r.tutor_id
                WHERE r.payout_id = ?
                """,
                (pid,),
            ).fetchone()
        return {
            "receipt": self._serialize_npd_receipt(rc_row) if rc_row else None,
            "payout": self.get_payout(pid),
        }

    def list_npd_receipts(self, *, tutor_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        with self._lock:
            if tutor_id:
                rows = self._conn.execute(
                    """
                    SELECT r.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM npd_receipts r
                    LEFT JOIN admin_tutors t ON t.id = r.tutor_id
                    WHERE r.tutor_id = ?
                    ORDER BY r.created_at DESC, r.id DESC
                    LIMIT ?
                    """,
                    (str(tutor_id).strip(), lim),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT r.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM npd_receipts r
                    LEFT JOIN admin_tutors t ON t.id = r.tutor_id
                    ORDER BY r.created_at DESC, r.id DESC
                    LIMIT ?
                    """,
                    (lim,),
                ).fetchall()
        return [self._serialize_npd_receipt(r) for r in rows]

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
        now_iso = _iso_utc_now()
        with self._lock:
            row = None
            if tid:
                row = self._conn.execute("SELECT id, user_id FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
                if row and actor_user_id is not None and row["user_id"] is not None:
                    if int(row["user_id"]) != int(actor_user_id) and str(actor_role or "").lower() != "admin":
                        raise StorageError("forbidden", "Нет прав на изменение чужой анкеты.", 403)
            elif actor_user_id is not None:
                row = self._conn.execute("SELECT id, user_id FROM admin_tutors WHERE user_id = ? LIMIT 1", (int(actor_user_id),)).fetchone()
            if not row:
                return None
            eff_tid = str(row["id"])
            self._conn.execute(
                """
                UPDATE admin_tutors
                SET inn = ?, npd_verified = ?, npd_checked_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (str(inn or "").strip()[:16], 1 if npd_verified else 0, now_iso, now_iso, eff_tid),
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT id, inn, npd_verified, npd_checked_at FROM admin_tutors WHERE id = ?", (eff_tid,)).fetchone()
        if not updated:
            return None
        return {
            "tutorId": str(updated["id"]),
            "inn": str(updated["inn"] or ""),
            "npdVerified": bool(updated["npd_verified"]),
            "npdCheckedAt": updated["npd_checked_at"],
        }

    def count_tutor_captured_lessons(self, tutor_id: str) -> int:
        tid = str(tutor_id or "").strip()
        if not tid:
            return 0
        with self._lock:
            row = self._conn.execute(
                "SELECT COUNT(*) AS cnt FROM escrow_holds WHERE tutor_id = ? AND status = 'captured'",
                (tid,),
            ).fetchone()
        return int(row["cnt"] if row else 0)


__all__ = ["SqlitePayoutsMixin"]
