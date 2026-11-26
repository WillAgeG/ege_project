"""Операции SQLite с платёжными намерениями (payment_intents) и зачислением пополнений ЮKassa."""

from __future__ import annotations

from typing import Any
import uuid

from .common import StorageError, _iso_utc_now


class SqlitePaymentsMixin:
    @staticmethod
    def _serialize_payment_intent(row: Any) -> dict[str, Any]:
        keys = set(row.keys())
        amt = int(row["amount_rub"])
        refunded_rub = int(row["refunded_rub"] or 0) if "refunded_rub" in keys else 0
        st = str(row["status"] or "pending")
        credited = bool(row["credited"])
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]),
            "username": str(row["username"] or "") if "username" in keys else "",
            "userDisplayName": (
                str(row["user_display_name"] or row["username"] or "")
                if "user_display_name" in keys
                else ""
            ),
            "provider": str(row["provider"] or "yookassa"),
            "idempotencyKey": str(row["idempotency_key"]),
            "providerPaymentId": str(row["provider_payment_id"]) if row["provider_payment_id"] else None,
            "method": str(row["method"] or "sbp"),
            "planId": str(row["plan_id"] or "trial5k"),
            "amountRub": amt,
            "feeRub": int(row["fee_rub"] or 0),
            "totalRub": int(row["total_rub"]),
            "refundedRub": refunded_rub,
            "refundableRub": max(0, amt - refunded_rub) if (st == "succeeded" and credited) else 0,
            "status": st,
            "credited": credited,
            "receiptEmail": str(row["receipt_email"] or ""),
            "receiptPhone": str(row["receipt_phone"] or ""),
            "confirmationUrl": str(row["confirmation_url"] or ""),
            "returnUrl": str(row["return_url"] or ""),
            "errorMessage": str(row["error_message"] or ""),
            "createdAt": str(row["created_at"] or ""),
            "updatedAt": str(row["updated_at"] or ""),
            "paidAt": row["paid_at"],
        }

    def create_payment_intent(
        self,
        user_id: int,
        *,
        amount_rub: int,
        method: str = "sbp",
        plan_id: str | None = None,
        provider: str = "yookassa",
        receipt_email: str = "",
        receipt_phone: str = "",
        return_url: str = "",
        intent_id: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        uid = int(user_id)
        clean_method = "card" if (method or "").strip().lower() == "card" else "sbp"
        amt = int(amount_rub or 0)
        iid = str(intent_id or f"pi-{uuid.uuid4().hex[:14]}")
        idem = str(idempotency_key or uuid.uuid4())
        now_iso = _iso_utc_now()

        with self._lock:
            self._conn.execute(
                """
                INSERT OR IGNORE INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
                VALUES (?, 0, 0, 'trial5k', '[]', ?)
                """,
                (uid, now_iso),
            )
            w = self._conn.execute("SELECT initial_paid, plan_id FROM wallets WHERE user_id = ?", (uid,)).fetchone()
            urow = self._conn.execute("SELECT email, phone FROM users WHERE id = ?", (uid,)).fetchone()
            initial_paid = bool(w["initial_paid"]) if w else False
            cur_plan = str(w["plan_id"] or "trial5k") if w else "trial5k"
            next_plan = (plan_id or "").strip() or cur_plan
            min_amt = 390 if (next_plan == "ai390" and not initial_paid) else (100 if initial_paid else 490)
            if amt < min_amt or amt > 200_000:
                raise StorageError(
                    "invalid_amount",
                    f"Сумма пополнения должна быть от {min_amt} до 200 000 ₽.",
                    400,
                )

            fee_rub = ((amt * 3 + 50) // 100) if clean_method == "card" else 0
            total_rub = amt + fee_rub
            clean_email = str(receipt_email or (urow["email"] if urow else "") or "").strip()[:254]
            clean_phone = str(receipt_phone or (urow["phone"] if urow else "") or "").strip()[:32]

            self._conn.execute(
                """
                INSERT INTO payment_intents (
                    id, user_id, provider, idempotency_key, provider_payment_id,
                    method, plan_id, amount_rub, fee_rub, total_rub,
                    status, credited, receipt_email, receipt_phone,
                    confirmation_url, return_url, error_message, created_at, updated_at, paid_at
                ) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, '', ?, '', ?, ?, NULL)
                """,
                (
                    iid,
                    uid,
                    str(provider or "yookassa").strip()[:32] or "yookassa",
                    idem,
                    clean_method,
                    next_plan,
                    amt,
                    fee_rub,
                    total_rub,
                    clean_email,
                    clean_phone,
                    str(return_url or "")[:500],
                    now_iso,
                    now_iso,
                ),
            )
            self._conn.commit()
        return self.get_payment_intent(iid) or {"id": iid, "idempotencyKey": idem}

    def attach_provider_payment(
        self,
        intent_id: str,
        *,
        provider_payment_id: str,
        confirmation_url: str,
        status: str = "pending",
    ) -> dict[str, Any] | None:
        iid = str(intent_id or "").strip()
        clean_st = str(status or "pending").strip().lower()
        if clean_st not in ("pending", "waiting_for_capture", "succeeded", "canceled"):
            clean_st = "pending"
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                """
                UPDATE payment_intents
                SET provider_payment_id = ?, confirmation_url = ?, status = ?, updated_at = ?
                WHERE id = ?
                """,
                (
                    str(provider_payment_id or "").strip() or None,
                    str(confirmation_url or "").strip()[:1000],
                    clean_st,
                    now_iso,
                    iid,
                ),
            )
            self._conn.commit()
        return self.get_payment_intent(iid)

    def get_payment_intent(self, intent_id: str) -> dict[str, Any] | None:
        iid = str(intent_id or "").strip()
        if not iid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT p.*, u.username AS username, u.display_name AS user_display_name,
                       COALESCE((
                           SELECT SUM(r.amount_rub) FROM payment_refunds r
                           WHERE r.payment_intent_id = p.id
                             AND r.status IN ('requested', 'pending', 'succeeded')
                       ), 0) AS refunded_rub
                FROM payment_intents p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.id = ?
                """,
                (iid,),
            ).fetchone()
        return self._serialize_payment_intent(row) if row else None

    def get_payment_intent_by_provider_id(self, provider_payment_id: str) -> dict[str, Any] | None:
        pid = str(provider_payment_id or "").strip()
        if not pid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT p.*, u.username AS username, u.display_name AS user_display_name,
                       COALESCE((
                           SELECT SUM(r.amount_rub) FROM payment_refunds r
                           WHERE r.payment_intent_id = p.id
                             AND r.status IN ('requested', 'pending', 'succeeded')
                       ), 0) AS refunded_rub
                FROM payment_intents p
                LEFT JOIN users u ON u.id = p.user_id
                WHERE p.provider_payment_id = ?
                """,
                (pid,),
            ).fetchone()
        return self._serialize_payment_intent(row) if row else None

    def list_payment_intents(
        self,
        *,
        user_id: int | None = None,
        status: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        conds: list[str] = []
        args: list[Any] = []
        if user_id is not None:
            conds.append("p.user_id = ?")
            args.append(int(user_id))
        clean_st = str(status or "").strip().lower()
        if clean_st and clean_st != "all":
            conds.append("p.status = ?")
            args.append(clean_st)
        where = f"WHERE {' AND '.join(conds)}" if conds else ""
        args.append(lim)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT p.*, u.username AS username, u.display_name AS user_display_name,
                       COALESCE((
                           SELECT SUM(r.amount_rub) FROM payment_refunds r
                           WHERE r.payment_intent_id = p.id
                             AND r.status IN ('requested', 'pending', 'succeeded')
                       ), 0) AS refunded_rub
                FROM payment_intents p
                LEFT JOIN users u ON u.id = p.user_id
                {where}
                ORDER BY p.created_at DESC, p.id DESC
                LIMIT ?
                """,
                tuple(args),
            ).fetchall()
        return [self._serialize_payment_intent(r) for r in rows]

    def complete_payment_intent_succeeded(
        self,
        intent_id: str,
        *,
        provider_payment_id: str = "",
    ) -> dict[str, Any]:
        iid = str(intent_id or "").strip()
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM payment_intents WHERE id = ?", (iid,)).fetchone()
            if not row:
                raise StorageError("payment_not_found", "Платёжная сессия не найдена.", 404)
            uid = int(row["user_id"])
            if int(row["credited"] or 0) == 1:
                if str(row["status"] or "") != "succeeded":
                    self._conn.execute(
                        "UPDATE payment_intents SET status = 'succeeded', updated_at = ? WHERE id = ?",
                        (now_iso, iid),
                    )
                    self._conn.commit()
                return {
                    "intent": self.get_payment_intent(iid),
                    "wallet": self._wallet_snapshot(uid),
                    "creditedNow": False,
                }

            cur = self._conn.execute(
                """
                UPDATE payment_intents
                SET status = 'succeeded',
                    credited = 1,
                    provider_payment_id = COALESCE(NULLIF(?, ''), provider_payment_id),
                    paid_at = COALESCE(paid_at, ?),
                    updated_at = ?
                WHERE id = ? AND credited = 0
                """,
                (str(provider_payment_id or "").strip(), now_iso, now_iso, iid),
            )
            if cur.rowcount == 0:
                self._conn.commit()
                return {
                    "intent": self.get_payment_intent(iid),
                    "wallet": self._wallet_snapshot(uid),
                    "creditedNow": False,
                }

            self._conn.execute(
                """
                INSERT OR IGNORE INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
                VALUES (?, 0, 0, 'trial5k', '[]', ?)
                """,
                (uid, now_iso),
            )
            w = self._conn.execute("SELECT * FROM wallets WHERE user_id = ?", (uid,)).fetchone()
            cur_bal = int(w["balance_rub"])
            initial_paid = bool(w["initial_paid"])
            amt = int(row["amount_rub"])
            fee_rub = int(row["fee_rub"] or 0)
            clean_method = str(row["method"] or "sbp")
            next_plan = str(row["plan_id"] or w["plan_id"] or "trial5k")
            new_bal = cur_bal + amt
            new_initial = 1 if (initial_paid or amt >= 490 or new_bal >= 490) else 0
            if new_bal >= 8900 and next_plan == "trial5k":
                next_plan = "month10k"

            self._conn.execute(
                """
                UPDATE wallets
                SET balance_rub = ?, initial_paid = ?, plan_id = ?, updated_at = ?
                WHERE user_id = ?
                """,
                (new_bal, new_initial, next_plan, now_iso, uid),
            )
            self._conn.execute(
                """
                INSERT INTO wallet_ledger (
                    user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                ) VALUES (?, 'topup', ?, ?, ?, ?, 'payment_intent', ?, ?, ?)
                """,
                (
                    uid,
                    amt,
                    new_bal,
                    fee_rub,
                    clean_method,
                    iid,
                    f"Пополнение через ЮKassa ({'Карта +3%' if clean_method == 'card' else 'СБП'})",
                    now_iso,
                ),
            )
            self._record_mkt_outbox(
                "vektor.payments.ledger.v1",
                str(uid),
                "wallet.topup",
                {
                    "intentId": iid,
                    "provider": str(row["provider"] or "yookassa"),
                    "providerPaymentId": str(provider_payment_id or row["provider_payment_id"] or ""),
                    "userId": uid,
                    "amountRub": amt,
                    "feeRub": fee_rub,
                    "method": clean_method,
                    "balanceAfterRub": new_bal,
                },
            )
            self._conn.commit()
            return {
                "intent": self.get_payment_intent(iid),
                "wallet": self._wallet_snapshot(uid),
                "creditedNow": True,
            }

    def mark_payment_intent_canceled(self, intent_id: str, *, reason: str = "") -> dict[str, Any] | None:
        iid = str(intent_id or "").strip()
        if not iid:
            return None
        now_iso = _iso_utc_now()
        clean_reason = str(reason or "").strip()[:300]
        with self._lock:
            self._conn.execute(
                """
                UPDATE payment_intents
                SET status = 'canceled',
                    error_message = COALESCE(NULLIF(?, ''), error_message),
                    updated_at = ?
                WHERE id = ? AND credited = 0
                """,
                (clean_reason, now_iso, iid),
            )
            self._conn.commit()
        return self.get_payment_intent(iid)

    @staticmethod
    def _serialize_payment_refund(row: Any) -> dict[str, Any]:
        keys = set(row.keys())
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]),
            "username": str(row["username"] or "") if "username" in keys else "",
            "userDisplayName": (
                str(row["user_display_name"] or row["username"] or "")
                if "user_display_name" in keys
                else ""
            ),
            "paymentIntentId": str(row["payment_intent_id"]) if row["payment_intent_id"] else None,
            "provider": str(row["provider"] or "yookassa"),
            "idempotencyKey": str(row["idempotency_key"]),
            "providerPaymentId": str(row["provider_payment_id"]) if row["provider_payment_id"] else None,
            "providerRefundId": str(row["provider_refund_id"]) if row["provider_refund_id"] else None,
            "method": str(row["method"] or "sbp"),
            "amountRub": int(row["amount_rub"]),
            "reason": str(row["reason"] or ""),
            "status": str(row["status"] or "requested"),
            "balanceReverted": bool(row["balance_reverted"]),
            "reviewNote": str(row["review_note"] or ""),
            "reviewedBy": str(row["reviewed_by"] or ""),
            "errorMessage": str(row["error_message"] or ""),
            "receiptEmail": str(row["receipt_email"] or ""),
            "receiptPhone": str(row["receipt_phone"] or ""),
            "createdAt": str(row["created_at"] or ""),
            "updatedAt": str(row["updated_at"] or ""),
            "refundedAt": row["refunded_at"],
        }

    def list_refundable_payment_intents(self, user_id: int) -> list[dict[str, Any]]:
        intents = self.list_payment_intents(user_id=int(user_id), status="succeeded", limit=100)
        return [
            p for p in intents
            if p.get("credited") and p.get("provider") == "yookassa" and p.get("providerPaymentId") and int(p.get("refundableRub") or 0) > 0
        ]

    def create_wallet_refund_request(
        self,
        user_id: int,
        *,
        amount_rub: int,
        reason: str = "",
        payment_intent_id: str | None = None,
        allow_demo_without_intent: bool = False,
        receipt_email: str = "",
        refund_ids: list[str] | None = None,
        idempotency_keys: list[str] | None = None,
    ) -> dict[str, Any]:
        uid = int(user_id)
        amt = int(amount_rub or 0)
        if amt < 1 or amt > 200_000:
            raise StorageError("invalid_amount", "Сумма возврата должна быть от 1 до 200 000 ₽.", 400)
        clean_reason = str(reason or "").strip()[:250]
        clean_email = str(receipt_email or "").strip()[:254]
        clean_pi = str(payment_intent_id or "").strip() or None
        now_iso = _iso_utc_now()

        with self._lock:
            self._conn.execute(
                """
                INSERT OR IGNORE INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
                VALUES (?, 0, 0, 'trial5k', '[]', ?)
                """,
                (uid, now_iso),
            )
            w = self._conn.execute("SELECT balance_rub FROM wallets WHERE user_id = ?", (uid,)).fetchone()
            cur_bal = int(w["balance_rub"]) if w else 0
            if cur_bal < amt:
                raise StorageError(
                    "insufficient_balance",
                    f"Доступный остаток кошелька ({cur_bal} ₽) меньше запрашиваемой суммы ({amt} ₽).",
                    400,
                )
            urow = self._conn.execute("SELECT email, phone FROM users WHERE id = ?", (uid,)).fetchone()
            user_email = clean_email or (str(urow["email"] or "") if urow else "")
            user_phone = str(urow["phone"] or "") if urow else ""

            allocations: list[tuple[Any | None, int]] = []
            if clean_pi is not None:
                pi_row = self._conn.execute(
                    """
                    SELECT p.*, COALESCE((
                        SELECT SUM(r.amount_rub) FROM payment_refunds r
                        WHERE r.payment_intent_id = p.id
                          AND r.status IN ('requested', 'pending', 'succeeded')
                    ), 0) AS refunded_rub
                    FROM payment_intents p
                    WHERE p.id = ? AND p.user_id = ?
                    """,
                    (clean_pi, uid),
                ).fetchone()
                if not pi_row:
                    raise StorageError("payment_not_found", "Исходный платёж для возврата не найден.", 404)
                if str(pi_row["status"]) != "succeeded" or not int(pi_row["credited"] or 0):
                    raise StorageError("payment_not_refundable", "Возврат возможен только по оплаченному пополнению.", 400)
                avail_pi = max(0, int(pi_row["amount_rub"]) - int(pi_row["refunded_rub"] or 0))
                if avail_pi < amt:
                    raise StorageError(
                        "refund_exceeds_payment",
                        f"По платежу {clean_pi} к возврату доступно {avail_pi} ₽.",
                        400,
                    )
                if not pi_row["provider_payment_id"] and not allow_demo_without_intent:
                    raise StorageError("no_refundable_payment", "У выбранного платежа отсутствует ID транзакции ЮKassa.", 400)
                allocations.append((pi_row, amt))
            else:
                pi_rows = self._conn.execute(
                    """
                    SELECT p.*, COALESCE((
                        SELECT SUM(r.amount_rub) FROM payment_refunds r
                        WHERE r.payment_intent_id = p.id
                          AND r.status IN ('requested', 'pending', 'succeeded')
                    ), 0) AS refunded_rub
                    FROM payment_intents p
                    WHERE p.user_id = ? AND p.status = 'succeeded' AND p.credited = 1
                      AND p.provider = 'yookassa' AND p.provider_payment_id IS NOT NULL
                    ORDER BY p.created_at DESC, p.id DESC
                    """,
                    (uid,),
                ).fetchall()
                remaining = amt
                total_yk_avail = 0
                for pi_row in pi_rows:
                    avail = max(0, int(pi_row["amount_rub"]) - int(pi_row["refunded_rub"] or 0))
                    if avail <= 0:
                        continue
                    total_yk_avail += avail
                    if remaining > 0:
                        take = min(avail, remaining)
                        allocations.append((pi_row, take))
                        remaining -= take
                if remaining > 0:
                    if allow_demo_without_intent:
                        allocations.append((None, remaining))
                    else:
                        raise StorageError(
                            "no_refundable_payment",
                            f"К банковскому возврату через ЮKassa доступно {total_yk_avail} ₽ по оплаченным пополнениям.",
                            400,
                        )

            running_bal = cur_bal
            created_ids: list[str] = []
            for idx, (pi_row, part_amt) in enumerate(allocations):
                rid = (
                    str(refund_ids[idx]).strip()
                    if (refund_ids and idx < len(refund_ids) and str(refund_ids[idx]).strip())
                    else f"ref-{uuid.uuid4().hex[:12]}"
                )
                idem = (
                    str(idempotency_keys[idx]).strip()
                    if (idempotency_keys and idx < len(idempotency_keys) and str(idempotency_keys[idx]).strip())
                    else str(uuid.uuid4())
                )
                running_bal -= part_amt
                pi_id = str(pi_row["id"]) if pi_row is not None else None
                provider_name = (
                    str(pi_row["provider"] or "yookassa")
                    if (pi_row is not None and pi_row["provider_payment_id"])
                    else "demo"
                )
                provider_pid = str(pi_row["provider_payment_id"]) if (pi_row is not None and pi_row["provider_payment_id"]) else None
                method_val = str(pi_row["method"] or "sbp") if pi_row is not None else "sbp"
                r_email = user_email or (str(pi_row["receipt_email"] or "") if pi_row is not None else "")
                r_phone = user_phone or (str(pi_row["receipt_phone"] or "") if pi_row is not None else "")

                self._conn.execute(
                    """
                    INSERT INTO payment_refunds (
                        id, user_id, payment_intent_id, provider, idempotency_key,
                        provider_payment_id, provider_refund_id, method, amount_rub,
                        reason, status, balance_reverted, review_note, reviewed_by,
                        error_message, receipt_email, receipt_phone,
                        created_at, updated_at, refunded_at
                    ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, 'requested', 0, '', '', '', ?, ?, ?, ?, NULL)
                    """,
                    (
                        rid,
                        uid,
                        pi_id,
                        provider_name,
                        idem,
                        provider_pid,
                        method_val,
                        part_amt,
                        clean_reason,
                        r_email[:254],
                        r_phone[:32],
                        now_iso,
                        now_iso,
                    ),
                )
                self._conn.execute(
                    """
                    INSERT INTO wallet_ledger (
                        user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                    ) VALUES (?, 'bank_refund_hold', ?, ?, 0, ?, 'payment_refund', ?, ?, ?)
                    """,
                    (
                        uid,
                        -part_amt,
                        running_bal,
                        method_val,
                        rid,
                        f"Запрос возврата остатка баланса ({part_amt} ₽)",
                        now_iso,
                    ),
                )
                self._record_mkt_outbox(
                    "vektor.payments.ledger.v1",
                    str(uid),
                    "payments.refund.requested",
                    {
                        "refundId": rid,
                        "paymentIntentId": pi_id,
                        "userId": uid,
                        "amountRub": part_amt,
                        "method": method_val,
                        "balanceAfterRub": running_bal,
                    },
                )
                created_ids.append(rid)

            self._conn.execute(
                "UPDATE wallets SET balance_rub = ?, updated_at = ? WHERE user_id = ?",
                (running_bal, now_iso, uid),
            )
            self._conn.commit()
            wallet_snap = self._wallet_snapshot(uid)

        created = [self.get_payment_refund(rid) for rid in created_ids]
        created_clean = [c for c in created if c is not None]
        return {"refund": created_clean[0], "refunds": created_clean, "wallet": wallet_snap}

    def get_payment_refund(self, refund_id: str) -> dict[str, Any] | None:
        rid = str(refund_id or "").strip()
        if not rid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT r.*, u.username AS username, u.display_name AS user_display_name
                FROM payment_refunds r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.id = ?
                """,
                (rid,),
            ).fetchone()
        return self._serialize_payment_refund(row) if row else None

    def get_payment_refund_by_provider_id(self, provider_refund_id: str) -> dict[str, Any] | None:
        prid = str(provider_refund_id or "").strip()
        if not prid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT r.*, u.username AS username, u.display_name AS user_display_name
                FROM payment_refunds r
                LEFT JOIN users u ON u.id = r.user_id
                WHERE r.provider_refund_id = ?
                """,
                (prid,),
            ).fetchone()
        return self._serialize_payment_refund(row) if row else None

    def list_payment_refunds(
        self,
        *,
        user_id: int | None = None,
        status: str | None = None,
        payment_intent_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit), 500))
        conds: list[str] = []
        args: list[Any] = []
        if user_id is not None:
            conds.append("r.user_id = ?")
            args.append(int(user_id))
        if payment_intent_id:
            conds.append("r.payment_intent_id = ?")
            args.append(str(payment_intent_id).strip())
        clean_st = str(status or "").strip().lower()
        if clean_st and clean_st != "all":
            conds.append("r.status = ?")
            args.append(clean_st)
        where = f"WHERE {' AND '.join(conds)}" if conds else ""
        args.append(lim)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT r.*, u.username AS username, u.display_name AS user_display_name
                FROM payment_refunds r
                LEFT JOIN users u ON u.id = r.user_id
                {where}
                ORDER BY r.created_at DESC, r.id DESC
                LIMIT ?
                """,
                tuple(args),
            ).fetchall()
        return [self._serialize_payment_refund(r) for r in rows]

    def attach_provider_refund(
        self,
        refund_id: str,
        *,
        provider_refund_id: str | None,
        status: str = "pending",
        reviewed_by: str = "",
        review_note: str = "",
        error_message: str = "",
    ) -> dict[str, Any] | None:
        rid = str(refund_id or "").strip()
        clean_st = str(status or "pending").strip().lower()
        if clean_st not in ("requested", "pending", "succeeded", "canceled", "rejected"):
            clean_st = "pending"
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                """
                UPDATE payment_refunds
                SET provider_refund_id = COALESCE(NULLIF(?, ''), provider_refund_id),
                    status = ?,
                    reviewed_by = COALESCE(NULLIF(?, ''), reviewed_by),
                    review_note = COALESCE(NULLIF(?, ''), review_note),
                    error_message = ?,
                    updated_at = ?
                WHERE id = ?
                """,
                (
                    str(provider_refund_id or "").strip(),
                    clean_st,
                    str(reviewed_by or "").strip()[:120],
                    str(review_note or "").strip()[:400],
                    str(error_message or "").strip()[:300],
                    now_iso,
                    rid,
                ),
            )
            self._conn.commit()
        return self.get_payment_refund(rid)

    def complete_payment_refund_succeeded(
        self,
        refund_id: str,
        *,
        provider_refund_id: str = "",
        reviewed_by: str = "",
        review_note: str = "",
    ) -> dict[str, Any]:
        rid = str(refund_id or "").strip()
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM payment_refunds WHERE id = ?", (rid,)).fetchone()
            if not row:
                raise StorageError("refund_not_found", "Заявка на возврат не найдена.", 404)
            uid = int(row["user_id"])
            if str(row["status"]) == "succeeded":
                return {"refund": self.get_payment_refund(rid), "changed": False}
            if int(row["balance_reverted"] or 0) == 1:
                raise StorageError("refund_already_reverted", "Средства по этому возврату уже возвращены в кошелёк.", 409)
            cur = self._conn.execute(
                """
                UPDATE payment_refunds
                SET status = 'succeeded',
                    provider_refund_id = COALESCE(NULLIF(?, ''), provider_refund_id),
                    reviewed_by = COALESCE(NULLIF(?, ''), reviewed_by),
                    review_note = COALESCE(NULLIF(?, ''), review_note),
                    error_message = '',
                    refunded_at = COALESCE(refunded_at, ?),
                    updated_at = ?
                WHERE id = ? AND status <> 'succeeded' AND balance_reverted = 0
                """,
                (
                    str(provider_refund_id or "").strip(),
                    str(reviewed_by or "").strip()[:120],
                    str(review_note or "").strip()[:400],
                    now_iso,
                    now_iso,
                    rid,
                ),
            )
            changed = cur.rowcount == 1
            if changed:
                self._record_mkt_outbox(
                    "vektor.payments.ledger.v1",
                    str(uid),
                    "payments.refund.succeeded",
                    {
                        "refundId": rid,
                        "paymentIntentId": row["payment_intent_id"],
                        "providerRefundId": str(provider_refund_id or row["provider_refund_id"] or ""),
                        "userId": uid,
                        "amountRub": int(row["amount_rub"]),
                        "method": str(row["method"] or "sbp"),
                    },
                )
            self._conn.commit()
        return {"refund": self.get_payment_refund(rid), "changed": changed}

    def cancel_or_reject_payment_refund(
        self,
        refund_id: str,
        *,
        next_status: str = "canceled",
        reason: str = "",
        reviewed_by: str = "",
    ) -> dict[str, Any]:
        rid = str(refund_id or "").strip()
        clean_st = "rejected" if str(next_status or "").strip().lower() == "rejected" else "canceled"
        clean_reason = str(reason or "").strip()[:300]
        clean_rev = str(reviewed_by or "").strip()[:120]
        now_iso = _iso_utc_now()

        with self._lock:
            row = self._conn.execute("SELECT * FROM payment_refunds WHERE id = ?", (rid,)).fetchone()
            if not row:
                raise StorageError("refund_not_found", "Заявка на возврат не найдена.", 404)
            uid = int(row["user_id"])
            if str(row["status"]) == "succeeded":
                raise StorageError("refund_already_succeeded", "Возврат уже проведён банком и не может быть отменён.", 409)

            cur = self._conn.execute(
                """
                UPDATE payment_refunds
                SET status = ?,
                    balance_reverted = 1,
                    review_note = COALESCE(NULLIF(?, ''), review_note),
                    reviewed_by = COALESCE(NULLIF(?, ''), reviewed_by),
                    error_message = COALESCE(NULLIF(?, ''), error_message),
                    updated_at = ?
                WHERE id = ? AND balance_reverted = 0 AND status <> 'succeeded'
                """,
                (
                    clean_st,
                    clean_reason if clean_st == "rejected" else "",
                    clean_rev,
                    clean_reason,
                    now_iso,
                    rid,
                ),
            )
            reverted_now = cur.rowcount == 1
            if reverted_now:
                amt = int(row["amount_rub"])
                self._conn.execute(
                    """
                    INSERT OR IGNORE INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
                    VALUES (?, 0, 0, 'trial5k', '[]', ?)
                    """,
                    (uid, now_iso),
                )
                w = self._conn.execute("SELECT balance_rub FROM wallets WHERE user_id = ?", (uid,)).fetchone()
                new_bal = int(w["balance_rub"]) + amt
                self._conn.execute(
                    "UPDATE wallets SET balance_rub = ?, updated_at = ? WHERE user_id = ?",
                    (new_bal, now_iso, uid),
                )
                self._conn.execute(
                    """
                    INSERT INTO wallet_ledger (
                        user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                    ) VALUES (?, 'bank_refund_revert', ?, ?, 0, ?, 'payment_refund', ?, ?, ?)
                    """,
                    (
                        uid,
                        amt,
                        new_bal,
                        str(row["method"] or "sbp"),
                        rid,
                        clean_reason or "Возврат средств в кошелёк после отмены банковского возврата",
                        now_iso,
                    ),
                )
                self._record_mkt_outbox(
                    "vektor.payments.ledger.v1",
                    str(uid),
                    f"payments.refund.{clean_st}",
                    {
                        "refundId": rid,
                        "userId": uid,
                        "amountRub": amt,
                        "status": clean_st,
                        "balanceAfterRub": new_bal,
                    },
                )
            self._conn.commit()
            wallet_snap = self._wallet_snapshot(uid)
        return {"refund": self.get_payment_refund(rid), "wallet": wallet_snap, "revertedNow": reverted_now}
