"""Админ-аналитика, модерация репетиторов, заявки, выплаты НПД и Outbox (SQLite)."""

from datetime import datetime, timezone
import json
import re
import secrets
import sqlite3
from typing import Any

from .common import StorageError, _iso_utc_now, _normalize_tz, calc_fee_split, calc_sbp_fee


def _split_application_contact(raw_contact: str) -> tuple[str, str]:
    txt = str(raw_contact or "").strip()
    low = txt.lower()
    if "t.me/" in low or "telegram.me/" in low:
        slug = txt.split("/", 1)[-1].rsplit("/", 1)[-1].split("?", 1)[0].strip().lstrip("@")
        return ("", ("@" + slug)[:64]) if slug else ("", "")
    if txt.startswith("@") and len(txt) >= 3:
        return ("", txt[:64])
    digits = re.sub(r"\D+", "", txt)
    if 10 <= len(digits) <= 15:
        return (txt[:32], "")
    return ("", txt[:64])


class SqliteAdminMixin:
    def _record_admin_outbox(self, topic: str, partition_key: str, event_type: str, payload: dict[str, Any]) -> None:
        now_iso = _iso_utc_now()
        envelope = {
            "event_id": secrets.token_hex(12),
            "event_type": event_type,
            "occurred_at": now_iso,
            "user_id": payload.get("userId"),
            "session_id": None,
            "role": "admin",
            "view": "admin",
            "payload": payload,
            "schema_version": "1.0.0",
        }
        self._conn.execute(
            """
            INSERT INTO admin_outbox_events (topic, partition_key, event_type, payload, created_at, published_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (topic, partition_key, event_type, json.dumps(envelope, ensure_ascii=False), now_iso, now_iso),
        )

    @staticmethod
    def _admin_user_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        created_val = row["created_at"]
        if isinstance(created_val, (int, float)):
            created_iso = datetime.fromtimestamp(int(created_val), tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        else:
            created_iso = str(created_val or "")
        return {
            "id": int(row["id"]),
            "username": str(row["username"]),
            "displayName": str(row["display_name"] or row["username"]),
            "email": row["email"],
            "authProvider": str(row["auth_provider"] or "local"),
            "role": str(row["role"] or "student"),
            "createdAt": created_iso,
        }

    @staticmethod
    def _admin_tutor_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "fullName": str(row["full_name"]),
            "subject": str(row["subject"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "baseRateRub": int(row["base_rate_rub"]),
            "marketRateRub": int(row["market_rate_rub"]),
            "sourceChannel": str(row["source_channel"]),
            "tariffId": str(row["tariff_id"]),
            "whatsappPhone": str(row["whatsapp_phone"] or ""),
            "telegramHandle": str(row["telegram_handle"] or ""),
            "maxHandle": str(row["max_handle"] or ""),
            "hasPhoto": bool(row["has_photo"]),
            "verified": bool(row["verified"]),
            "bumpedToday": bool(row["bumped_today"]),
            "rating": float(row["rating"]),
            "reviewsCount": int(row["reviews_count"]),
            "lastBumpedAt": str(row["last_bumped_at"]),
            "updatedAt": str(row["updated_at"]),
        }

    @staticmethod
    def _admin_request_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row["tutor_name"] or ""),
            "studentUserId": int(row["student_user_id"]) if row["student_user_id"] is not None else None,
            "studentName": str(row["student_name"]),
            "subject": str(row["subject"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "slotDate": str(row["slot_date"]),
            "hourSlot": str(row["hour_slot"]),
            "tariffId": str(row["tariff_id"]),
            "offerPriceRub": int(row["offer_price_rub"]),
            "counterPriceRub": int(row["counter_price_rub"]) if row["counter_price_rub"] is not None else None,
            "finalPriceRub": int(row["final_price_rub"]) if row["final_price_rub"] is not None else None,
            "status": str(row["status"]),
            "rawStatus": str(row["status"]),
            "escrowStatus": str(row["escrow_status"] or "none"),
            "messengerChannel": str(row["messenger_channel"] or "whatsapp"),
            "createdAt": str(row["created_at"]),
            "updatedAt": str(row["updated_at"]),
        }

    @staticmethod
    def _admin_payout_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        keys = set(row.keys())

        def _col(name: str, default: Any = "") -> Any:
            return row[name] if name in keys and row[name] is not None else default

        npd_receipt = row["npd_receipt"]
        npd_url = str(_col("npd_receipt_url", "") or "")
        raw_npd_st = str(_col("npd_status", "none") or "none").strip().lower()
        if raw_npd_st in ("", "none") and npd_receipt:
            raw_npd_st = "registered" if npd_url.startswith("https://") else "demo"
        has_target = bool(
            str(_col("sbp_phone", "") or "").strip()
            or str(_col("payout_token", "") or "").strip()
        )
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row["tutor_name"] or ""),
            "method": str(row["method"]),
            "amountRub": int(row["amount_rub"]),
            "npdReceipt": npd_receipt,
            "npdReceiptUrl": npd_url,
            "npdStatus": raw_npd_st,
            "npdRequested": bool(_col("npd_requested", 1)),
            "bank": str(row["bank"] or ""),
            "sbpBankId": str(_col("sbp_bank_id", "") or ""),
            "destinationMasked": str(row["destination_masked"] or ""),
            "provider": str(_col("provider", "manual") or "manual"),
            "idempotencyKey": str(_col("idempotency_key", "") or "") or None,
            "providerPayoutId": str(_col("provider_payout_id", "") or "") or None,
            "providerStatus": str(_col("provider_status", "") or ""),
            "tutorInn": str(_col("tutor_inn", "") or ""),
            "antifraudHold": bool(_col("antifraud_hold", 0)),
            "antifraudReason": str(_col("antifraud_reason", "") or ""),
            "errorMessage": str(_col("error_message", "") or ""),
            "hasSavedDispatchTarget": has_target,
            "status": str(row["status"]),
            "rawStatus": str(row["status"]),
            "createdAt": str(row["created_at"]),
            "updatedAt": _col("updated_at", None),
            "paidAt": row["paid_at"],
        }

    def admin_overview(self) -> dict[str, Any]:
        with self._lock:
            users_count = int(self._conn.execute("SELECT COUNT(*) FROM users").fetchone()[0])
            tutors_count = int(self._conn.execute("SELECT COUNT(*) FROM admin_tutors").fetchone()[0])
            req_rows = self._conn.execute(
                """
                SELECT slot_date, status, escrow_status, offer_price_rub, counter_price_rub, final_price_rub
                FROM admin_lesson_requests
                ORDER BY slot_date ASC
                """
            ).fetchall()
            payouts_count = int(self._conn.execute("SELECT COUNT(*) FROM admin_payout_requests").fetchone()[0])
            open_disputes_count = int(self._conn.execute("SELECT COUNT(*) FROM lesson_disputes WHERE status = 'open'").fetchone()[0])
            new_tutor_apps_count = int(
                self._conn.execute("SELECT COUNT(*) FROM tutor_applications WHERE status = 'new'").fetchone()[0]
            )
            new_feedback_count = int(
                self._conn.execute("SELECT COUNT(*) FROM feedback_tickets WHERE status = 'new'").fetchone()[0]
            )
            pending_refunds_count = int(
                self._conn.execute(
                    "SELECT COUNT(*) FROM payment_refunds WHERE status IN ('requested', 'pending')"
                ).fetchone()[0]
            )
            channel_rows = self._conn.execute(
                """
                SELECT source_channel AS channel, COUNT(*) AS cnt
                FROM admin_tutors
                GROUP BY source_channel
                ORDER BY cnt DESC, source_channel ASC
                """
            ).fetchall()

        requests_count = len(req_rows)
        pending_requests_count = sum(1 for r in req_rows if str(r["status"]) == "pending")
        gmv_rub = 0
        fee_rub = 0
        sbp_fee_rub = 0
        payout_rub = 0
        by_day: dict[str, dict[str, Any]] = {}
        for r in req_rows:
            day = str(r["slot_date"])[:10]
            slot = by_day.setdefault(
                day,
                {"date": day, "gmvRub": 0, "feeRub": 0, "sbpFeeRub": 0, "payoutRub": 0, "requests": 0, "accepted": 0},
            )
            slot["requests"] += 1
            if str(r["status"]) in ("accepted", "completed"):
                gross = int(r["final_price_rub"] or r["counter_price_rub"] or r["offer_price_rub"] or 0)
                fee, net = calc_fee_split(gross)
                sbp = calc_sbp_fee(gross)
                gmv_rub += gross
                fee_rub += fee
                sbp_fee_rub += sbp
                payout_rub += net
                slot["gmvRub"] += gross
                slot["feeRub"] += fee
                slot["sbpFeeRub"] += sbp
                slot["payoutRub"] += net
                slot["accepted"] += 1

        total_tutors = max(1, tutors_count)
        channel_share = [
            {
                "channel": str(r["channel"]),
                "count": int(r["cnt"]),
                "sharePct": round(int(r["cnt"]) * 100.0 / total_tutors, 1),
            }
            for r in channel_rows
        ]
        storage = self.storage_health()
        return {
            "ok": True,
            "kpi": {
                "gmvRub": gmv_rub,
                "feeRub": fee_rub,
                "sbpFeeRub": sbp_fee_rub,
                "payoutRub": payout_rub,
                "usersCount": users_count,
                "tutorsCount": tutors_count,
                "requestsCount": requests_count,
                "pendingRequestsCount": pending_requests_count,
                "payoutsCount": payouts_count,
                "openDisputesCount": open_disputes_count,
                "newTutorApplicationsCount": new_tutor_apps_count,
                "newFeedbackCount": new_feedback_count,
                "pendingRefundsCount": pending_refunds_count,
                "outboxPending": int(storage.get("outboxPending") or 0),
            },
            "channelShare": channel_share,
            "dailySeries": [by_day[d] for d in sorted(by_day.keys())],
            "storage": storage,
        }

    def admin_list_users(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, username, display_name, email, auth_provider, role, created_at
                FROM users
                ORDER BY id DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return [self._admin_user_row_to_dict(r) for r in rows]

    def admin_set_user_role(self, user_id: int, role: str) -> dict[str, Any]:
        clean_role = (role or "").strip().lower()
        if clean_role not in ("student", "tutor", "admin"):
            raise StorageError("invalid_role", "Допустимые роли: student, tutor, admin.", 400)
        with self._lock:
            row = self._conn.execute("SELECT id FROM users WHERE id = ?", (int(user_id),)).fetchone()
            if not row:
                raise StorageError("not_found", "Пользователь не найден.", 404)
            self._conn.execute("UPDATE users SET role = ? WHERE id = ?", (clean_role, int(user_id)))
            self._record_admin_outbox(
                "vektor.user.clickstream.v1",
                str(user_id),
                "admin.user.role_updated",
                {"userId": int(user_id), "role": clean_role},
            )
            self._conn.commit()
            updated = self._conn.execute(
                """
                SELECT id, username, display_name, email, auth_provider, role, created_at
                FROM users WHERE id = ?
                """,
                (int(user_id),),
            ).fetchone()
        return self._admin_user_row_to_dict(updated)

    def admin_list_tutors(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT * FROM admin_tutors
                ORDER BY bumped_today DESC, rating DESC, id ASC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return [self._admin_tutor_row_to_dict(r) for r in rows]

    def admin_moderate_tutor(
        self,
        tutor_id: Any,
        *,
        verified: bool | None = None,
        bumped: bool | None = None,
        tariff_id: str | None = None,
    ) -> dict[str, Any]:
        tid = str(tutor_id or "").strip()
        if tariff_id is not None and tariff_id not in ("free", "trial5k", "month10k"):
            raise StorageError("invalid_tariff", "Допустимые тарифы: free, trial5k, month10k.", 400)
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Преподаватель не найден.", 404)
            next_verified = (1 if verified else 0) if verified is not None else int(row["verified"])
            next_bumped = (1 if bumped else 0) if bumped is not None else int(row["bumped_today"])
            next_tariff = tariff_id if tariff_id is not None else str(row["tariff_id"])
            next_bumped_at = now_iso if bumped is True else str(row["last_bumped_at"])
            self._conn.execute(
                """
                UPDATE admin_tutors
                SET verified = ?, bumped_today = ?, tariff_id = ?, last_bumped_at = ?, updated_at = ?
                WHERE id = ?
                """,
                (next_verified, next_bumped, next_tariff, next_bumped_at, now_iso, tid),
            )
            self._record_admin_outbox(
                "vektor.market.bids.v1",
                tid,
                "admin.tutor.moderated",
                {
                    "tutorId": tid,
                    "verified": bool(next_verified),
                    "bumpedToday": bool(next_bumped),
                    "tariffId": next_tariff,
                },
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
        return self._admin_tutor_row_to_dict(updated)

    def admin_list_requests(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT * FROM admin_lesson_requests
                ORDER BY slot_date DESC, hour_slot DESC, id ASC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return [self._admin_request_row_to_dict(r) for r in rows]

    def admin_set_request_status(self, req_id: Any, status: str) -> dict[str, Any]:
        rid = str(req_id or "").strip()
        clean_status = (status or "").strip().lower()
        if clean_status not in ("accepted", "pending", "declined", "refunded"):
            raise StorageError(
                "invalid_status",
                "Допустимые статусы заявки: accepted, pending, declined, refunded.",
                400,
            )
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM admin_lesson_requests WHERE id = ?", (rid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Заявка не найдена.", 404)
            next_escrow = str(row["escrow_status"] or "none")
            next_final = row["final_price_rub"]
            next_reserved = int(row["reserved_rub"] or 0)
            student_uid = row["student_user_id"]
            if clean_status == "accepted":
                next_final = row["final_price_rub"] or row["counter_price_rub"] or row["offer_price_rub"]
                if next_escrow in ("none", "refunded", "frozen"):
                    next_escrow = "captured"
            elif clean_status == "pending":
                if next_escrow == "captured":
                    next_escrow = "frozen"
            elif clean_status in ("declined", "refunded"):
                if clean_status == "refunded" or next_escrow in ("frozen", "captured") or next_reserved > 0:
                    next_escrow = "refunded"
                if student_uid is not None and next_reserved > 0:
                    self._conn.execute(
                        """
                        INSERT INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
                        VALUES (?, ?, 1, 'trial5k', '[]', ?)
                        ON CONFLICT(user_id) DO UPDATE SET
                            balance_rub = wallets.balance_rub + excluded.balance_rub,
                            updated_at = excluded.updated_at
                        """,
                        (int(student_uid), next_reserved, now_iso),
                    )
                    w_row = self._conn.execute(
                        "SELECT balance_rub FROM wallets WHERE user_id = ?",
                        (int(student_uid),),
                    ).fetchone()
                    bal_after = int(w_row["balance_rub"]) if w_row else next_reserved
                    self._conn.execute(
                        """
                        INSERT INTO wallet_ledger (
                            user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                        ) VALUES (?, 'escrow_refund', ?, ?, 0, 'escrow', 'booking', ?, ?, ?)
                        """,
                        (
                            int(student_uid),
                            next_reserved,
                            bal_after,
                            rid,
                            f"Возврат средств администратором по заявке {rid}",
                            now_iso,
                        ),
                    )
                    next_reserved = 0

            gross_esc = int(next_final or row["counter_price_rub"] or row["offer_price_rub"] or 0)
            if next_escrow in ("frozen", "captured", "refunded") and gross_esc > 0:
                fee_esc, payout_esc = calc_fee_split(gross_esc)
                settled_at = now_iso if next_escrow in ("captured", "refunded") else None
                self._conn.execute(
                    """
                    INSERT INTO escrow_holds (
                        id, request_id, tutor_id, student_user_id, gross_rub,
                        platform_fee_rub, tutor_payout_rub, status, created_at, settled_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON CONFLICT(request_id) DO UPDATE SET
                        gross_rub = excluded.gross_rub,
                        platform_fee_rub = excluded.platform_fee_rub,
                        tutor_payout_rub = excluded.tutor_payout_rub,
                        status = excluded.status,
                        settled_at = excluded.settled_at
                    """,
                    (
                        f"esc-{rid}",
                        rid,
                        str(row["tutor_id"]),
                        student_uid,
                        gross_esc,
                        fee_esc,
                        payout_esc,
                        next_escrow,
                        now_iso,
                        settled_at,
                    ),
                )

            self._conn.execute(
                """
                UPDATE admin_lesson_requests
                SET status = ?, escrow_status = ?, final_price_rub = ?, reserved_rub = ?, updated_at = ?
                WHERE id = ?
                """,
                (clean_status, next_escrow, next_final, next_reserved, now_iso, rid),
            )
            topic = "vektor.payments.ledger.v1" if clean_status == "refunded" else "vektor.market.bids.v1"
            self._record_admin_outbox(
                topic,
                rid,
                f"admin.request.{clean_status}",
                {"requestId": rid, "status": clean_status, "escrowStatus": next_escrow},
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_lesson_requests WHERE id = ?", (rid,)).fetchone()
        return self._admin_request_row_to_dict(updated)

    def admin_list_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT * FROM admin_payout_requests
                ORDER BY created_at DESC, id ASC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        return [self._admin_payout_row_to_dict(r) for r in rows]

    def admin_set_payout_status(self, payout_id: Any, status: str) -> dict[str, Any]:
        pid = str(payout_id or "").strip()
        clean_status = (status or "").strip().lower()
        if clean_status not in ("succeeded", "processing", "rejected"):
            raise StorageError(
                "invalid_status",
                "Допустимые статусы выплаты: succeeded, processing, rejected.",
                400,
            )
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM admin_payout_requests WHERE id = ?", (pid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Выплата не найдена.", 404)
            paid_at = now_iso if clean_status == "succeeded" else None
            self._conn.execute(
                """
                UPDATE admin_payout_requests
                SET status = ?,
                    paid_at = COALESCE(?, paid_at),
                    sbp_phone = CASE WHEN ? IN ('succeeded', 'rejected') THEN '' ELSE sbp_phone END,
                    payout_token = CASE WHEN ? IN ('succeeded', 'rejected') THEN '' ELSE payout_token END,
                    updated_at = ?
                WHERE id = ?
                """,
                (clean_status, paid_at if clean_status == "succeeded" else None, clean_status, clean_status, now_iso, pid),
            )
            self._record_admin_outbox(
                "vektor.payments.ledger.v1",
                pid,
                f"admin.payout.{clean_status}",
                {"payoutId": pid, "status": clean_status, "amountRub": int(row["amount_rub"])},
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_payout_requests WHERE id = ?", (pid,)).fetchone()
        return self._admin_payout_row_to_dict(updated)

    def admin_list_outbox(self, limit: int = 50) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 50), 200))
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT id, topic, partition_key, event_type, payload, created_at, published_at
                FROM admin_outbox_events
                ORDER BY id DESC
                LIMIT ?
                """,
                (lim,),
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            try:
                payload = json.loads(r["payload"])
            except (json.JSONDecodeError, TypeError):
                payload = {}
            out.append(
                {
                    "id": int(r["id"]),
                    "topic": str(r["topic"]),
                    "partitionKey": str(r["partition_key"]),
                    "eventType": str(r["event_type"]),
                    "payload": payload,
                    "createdAt": str(r["created_at"]),
                    "publishedAt": r["published_at"],
                    "status": "published" if r["published_at"] else "pending",
                }
            )
        return out

    @staticmethod
    def _tutor_application_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "name": str(row["full_name"] or ""),
            "subject": str(row["subject_id"] or "eng"),
            "subjectName": str(row["subject_name"] or ""),
            "rate": int(row["desired_rate_rub"] or 0),
            "contact": str(row["contact"] or ""),
            "source": str(row["source"] or "landing"),
            "status": str(row["status"] or "new"),
            "reviewNote": str(row["review_note"] or ""),
            "createdTutorId": str(row["created_tutor_id"] or ""),
            "createdAt": str(row["created_at"] or ""),
            "updatedAt": str(row["updated_at"] or ""),
            "reviewedAt": row["reviewed_at"],
        }

    def create_tutor_application(
        self,
        payload: dict[str, Any],
        *,
        user_id: int | None = None,
        application_id: str | None = None,
    ) -> dict[str, Any]:
        full_name = str(payload.get("name") or "").strip()[:80]
        if len(full_name) < 2:
            raise StorageError("invalid_name", "Укажите имя и фамилию преподавателя (минимум 2 символа).", 400)
        contact = str(payload.get("contact") or "").strip()[:160]
        if len(contact) < 3:
            raise StorageError("invalid_contact", "Укажите ссылку (Ykt / Telegram / MAX) или телефон.", 400)
        subj_id = str(payload.get("subject") or "eng").strip()[:64] or "eng"
        subj_name = str(payload.get("subjectName") or subj_id).strip()[:80]
        try:
            rate = int(payload.get("rate") if payload.get("rate") is not None else 1100)
        except (TypeError, ValueError):
            rate = 1100
        rate = max(0, min(99_999, rate))
        source = str(payload.get("source") or "landing").strip()[:32] or "landing"
        aid = str(application_id or f"tapp-{secrets.token_hex(6)}").strip()[:64]
        uid = int(user_id) if user_id is not None else None
        now_iso = _iso_utc_now()

        with self._lock:
            self._conn.execute(
                """
                INSERT INTO tutor_applications (
                    id, user_id, full_name, subject_id, subject_name, desired_rate_rub,
                    contact, source, status, review_note, created_tutor_id, created_at, updated_at, reviewed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '', '', ?, ?, NULL)
                """,
                (aid, uid, full_name, subj_id, subj_name, rate, contact, source, now_iso, now_iso),
            )
            self._record_admin_outbox(
                "vektor.tutors.raw.v1",
                aid,
                "tutors.application.submitted",
                {
                    "applicationId": aid,
                    "userId": uid,
                    "name": full_name,
                    "subject": subj_id,
                    "subjectName": subj_name,
                    "rate": rate,
                    "source": source,
                },
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM tutor_applications WHERE id = ?", (aid,)).fetchone()
        return self._tutor_application_row_to_dict(row)

    def admin_list_tutor_applications(
        self,
        *,
        status: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 200), 500))
        clean_st = str(status or "").strip().lower()
        with self._lock:
            if clean_st and clean_st != "all":
                rows = self._conn.execute(
                    """
                    SELECT * FROM tutor_applications
                    WHERE status = ?
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (clean_st, lim),
                ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT * FROM tutor_applications
                    ORDER BY created_at DESC, id DESC
                    LIMIT ?
                    """,
                    (lim,),
                ).fetchall()
        return [self._tutor_application_row_to_dict(r) for r in rows]

    def admin_review_tutor_application(
        self,
        app_id: Any,
        *,
        status: str,
        review_note: str = "",
        publish_to_catalog: bool = False,
    ) -> dict[str, Any]:
        aid = str(app_id or "").strip()
        clean_status = str(status or "").strip().lower()
        if clean_status not in ("new", "contacted", "approved", "rejected"):
            raise StorageError(
                "invalid_status",
                "Допустимые статусы заявки: new, contacted, approved, rejected.",
                400,
            )
        clean_note = str(review_note or "").strip()[:400]
        now_iso = _iso_utc_now()
        created_tutor: dict[str, Any] | None = None

        with self._lock:
            row = self._conn.execute("SELECT * FROM tutor_applications WHERE id = ?", (aid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Заявка преподавателя не найдена.", 404)

            created_tutor_id = str(row["created_tutor_id"] or "")
            if clean_status == "approved" and publish_to_catalog and not created_tutor_id:
                suffix = aid.split("-", 1)[-1][-10:]
                created_tutor_id = f"tut-app-{suffix}"
                base_rate = max(100, int(row["desired_rate_rub"] or 1100))
                market_rate = max(1200, int(round(base_rate * 1.25)))
                wa_phone, tg_handle = _split_application_contact(str(row["contact"] or ""))
                subj_label = str(row["subject_name"] or row["subject_id"] or "ЕГЭ").strip()[:64]
                subj_list_json = json.dumps([str(row["subject_id"] or "eng")], ensure_ascii=False)
                self._conn.execute(
                    """
                    INSERT OR IGNORE INTO admin_tutors (
                        id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                        source_channel, tariff_id, whatsapp_phone, telegram_handle, max_handle,
                        has_photo, verified, bumped_today, rating, reviews_count,
                        last_bumped_at, created_at, updated_at, subjects_json
                    ) VALUES (?, ?, ?, ?, 'Якутск', 'UTC+9', ?, ?, 'platform', 'free', ?, ?, '', 0, 0, 0, 4.90, 0, ?, ?, ?, ?)
                    """,
                    (
                        created_tutor_id,
                        row["user_id"],
                        str(row["full_name"]),
                        subj_label,
                        base_rate,
                        market_rate,
                        wa_phone,
                        tg_handle,
                        now_iso,
                        now_iso,
                        now_iso,
                        subj_list_json,
                    ),
                )
                t_row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (created_tutor_id,)).fetchone()
                if t_row:
                    created_tutor = self._admin_tutor_row_to_dict(t_row)

            reviewed_at = row["reviewed_at"] or now_iso if clean_status != "new" else None
            self._conn.execute(
                """
                UPDATE tutor_applications
                SET status = ?,
                    review_note = ?,
                    created_tutor_id = ?,
                    updated_at = ?,
                    reviewed_at = ?
                WHERE id = ?
                """,
                (clean_status, clean_note, created_tutor_id, now_iso, reviewed_at, aid),
            )
            self._record_admin_outbox(
                "vektor.tutors.raw.v1",
                aid,
                f"admin.tutor_application.{clean_status}",
                {
                    "applicationId": aid,
                    "status": clean_status,
                    "publishToCatalog": bool(publish_to_catalog),
                    "createdTutorId": created_tutor_id,
                },
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM tutor_applications WHERE id = ?", (aid,)).fetchone()
            if created_tutor is None and created_tutor_id:
                t_row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (created_tutor_id,)).fetchone()
                if t_row:
                    created_tutor = self._admin_tutor_row_to_dict(t_row)

        return {"application": self._tutor_application_row_to_dict(updated), "tutor": created_tutor}

    @staticmethod
    def _feedback_attachment_row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
        tid = str(row["ticket_id"])
        aid = str(row["asset_id"])
        return {
            "id": str(row["id"]),
            "ticketId": tid,
            "assetId": aid,
            "originalFilename": str(row["original_filename"] or f"{aid}.bin"),
            "contentType": str(row["content_type"] or "application/octet-stream"),
            "sizeBytes": int(row["size_bytes"] or 0),
            "fileUrl": f"/api/admin/feedback/{tid}/files/{aid}",
            "createdAt": str(row["created_at"] or ""),
        }

    @staticmethod
    def _feedback_ticket_row_to_dict(
        row: sqlite3.Row,
        attachments: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        try:
            ctx = json.loads(str(row["context_json"] or "{}"))
        except Exception:
            ctx = {}
        if not isinstance(ctx, dict):
            ctx = {}
        atts = list(attachments or [])
        return {
            "id": str(row["id"]),
            "kind": str(row["kind"] or "bug"),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "authorName": str(row["author_name"] or ""),
            "contact": str(row["contact"] or ""),
            "subject": str(row["subject"] or ""),
            "message": str(row["message"] or ""),
            "pageUrl": str(row["page_url"] or ""),
            "context": ctx,
            "status": str(row["status"] or "new"),
            "reviewNote": str(row["review_note"] or ""),
            "reviewedBy": str(row["reviewed_by"] or ""),
            "attachments": atts,
            "attachmentsCount": len(atts),
            "createdAt": str(row["created_at"] or ""),
            "updatedAt": str(row["updated_at"] or ""),
            "reviewedAt": row["reviewed_at"],
        }

    def _load_feedback_attachments_map(self, ticket_ids: list[str]) -> dict[str, list[dict[str, Any]]]:
        clean_ids = [str(tid).strip() for tid in ticket_ids if str(tid).strip()]
        if not clean_ids:
            return {}
        placeholders = ",".join("?" for _ in clean_ids)
        rows = self._conn.execute(
            f"""
            SELECT fa.id, fa.ticket_id, fa.asset_id, fa.created_at,
                   m.original_filename, m.content_type, m.size_bytes
            FROM feedback_attachments fa
            JOIN media_assets m ON m.id = fa.asset_id
            WHERE fa.ticket_id IN ({placeholders})
            ORDER BY fa.created_at ASC, fa.id ASC
            """,
            tuple(clean_ids),
        ).fetchall()
        out: dict[str, list[dict[str, Any]]] = {}
        for r in rows:
            item = self._feedback_attachment_row_to_dict(r)
            out.setdefault(item["ticketId"], []).append(item)
        return out

    def create_feedback_ticket(
        self,
        payload: dict[str, Any],
        *,
        user_id: int | None = None,
        asset_ids: list[str] | None = None,
        ticket_id: str | None = None,
    ) -> dict[str, Any]:
        kind = str(payload.get("kind") or "bug").strip().lower()
        if kind not in ("bug", "cooperation"):
            raise StorageError("invalid_kind", "Допустимые типы обращения: bug, cooperation.", 400)
        message = str(payload.get("message") or "").strip()[:4000]
        if len(message) < 3:
            raise StorageError("invalid_message", "Опишите обращение подробнее (минимум 3 символа).", 400)
        contact = str(payload.get("contact") or "").strip()[:160]
        if kind == "cooperation" and len(contact) < 3:
            raise StorageError("invalid_contact", "Укажите Telegram, телефон или email для обратной связи.", 400)
        subject = str(payload.get("subject") or "").strip()[:200]
        author_name = str(payload.get("authorName") or payload.get("author_name") or "").strip()[:120]
        page_url = str(payload.get("pageUrl") or payload.get("page_url") or "").strip()[:500]
        raw_ctx = payload.get("context")
        ctx = raw_ctx if isinstance(raw_ctx, dict) else {}
        ctx_json = json.dumps(ctx, ensure_ascii=False)
        clean_assets = [str(aid).strip() for aid in (asset_ids or []) if str(aid).strip()]
        tid = str(ticket_id or f"fb-{secrets.token_hex(5)}").strip()[:64]
        uid = int(user_id) if user_id is not None else None
        now_iso = _iso_utc_now()

        with self._lock:
            self._conn.execute(
                """
                INSERT INTO feedback_tickets (
                    id, kind, user_id, author_name, contact, subject, message,
                    page_url, context_json, status, review_note, reviewed_by,
                    created_at, updated_at, reviewed_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', '', '', ?, ?, NULL)
                """,
                (tid, kind, uid, author_name, contact, subject, message, page_url, ctx_json, now_iso, now_iso),
            )
            for idx, aid in enumerate(clean_assets, start=1):
                att_id = f"fbat-{idx:02d}-{secrets.token_hex(4)}"
                self._conn.execute(
                    """
                    INSERT INTO feedback_attachments (id, ticket_id, asset_id, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (att_id, tid, aid, now_iso),
                )
            self._record_admin_outbox(
                "vektor.support.raw.v1",
                tid,
                "feedback.ticket.submitted",
                {
                    "ticketId": tid,
                    "kind": kind,
                    "userId": uid,
                    "subject": subject,
                    "contact": contact,
                    "attachmentsCount": len(clean_assets),
                },
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM feedback_tickets WHERE id = ?", (tid,)).fetchone()
            att_map = self._load_feedback_attachments_map([tid])
        return self._feedback_ticket_row_to_dict(row, att_map.get(tid, []))

    def get_feedback_ticket(self, ticket_id: str) -> dict[str, Any] | None:
        tid = str(ticket_id or "").strip()
        if not tid:
            return None
        with self._lock:
            row = self._conn.execute("SELECT * FROM feedback_tickets WHERE id = ?", (tid,)).fetchone()
            if not row:
                return None
            att_map = self._load_feedback_attachments_map([tid])
        return self._feedback_ticket_row_to_dict(row, att_map.get(tid, []))

    def get_feedback_attachment_asset(self, ticket_id: str, asset_id: str) -> dict[str, Any] | None:
        tid = str(ticket_id or "").strip()
        aid = str(asset_id or "").strip()
        if not tid or not aid:
            return None
        with self._lock:
            row = self._conn.execute(
                """
                SELECT m.id, m.user_id, m.kind, m.storage_driver, m.bucket, m.object_key,
                       m.content_type, m.size_bytes, m.sha256, m.original_filename, m.public_url, m.created_at
                FROM feedback_attachments fa
                JOIN media_assets m ON m.id = fa.asset_id
                WHERE fa.ticket_id = ? AND fa.asset_id = ?
                """,
                (tid, aid),
            ).fetchone()
        if not row:
            return None
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row["user_id"] is not None else None,
            "kind": str(row["kind"]),
            "storageDriver": str(row["storage_driver"]),
            "bucket": str(row["bucket"]),
            "objectKey": str(row["object_key"]),
            "contentType": str(row["content_type"]),
            "sizeBytes": int(row["size_bytes"] or 0),
            "sha256": str(row["sha256"] or ""),
            "originalFilename": str(row["original_filename"] or ""),
            "publicUrl": row["public_url"],
            "createdAt": str(row["created_at"] or ""),
        }

    def admin_list_feedback_tickets(
        self,
        *,
        kind: str | None = None,
        status: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 200), 500))
        clean_kind = str(kind or "").strip().lower()
        clean_status = str(status or "").strip().lower()
        clauses: list[str] = []
        params: list[Any] = []
        if clean_kind in ("bug", "cooperation"):
            clauses.append("kind = ?")
            params.append(clean_kind)
        if clean_status in ("new", "in_progress", "resolved", "closed"):
            clauses.append("status = ?")
            params.append(clean_status)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        params.append(lim)
        with self._lock:
            rows = self._conn.execute(
                f"""
                SELECT * FROM feedback_tickets
                {where}
                ORDER BY created_at DESC, id DESC
                LIMIT ?
                """,
                tuple(params),
            ).fetchall()
            att_map = self._load_feedback_attachments_map([str(r["id"]) for r in rows])
        return [self._feedback_ticket_row_to_dict(r, att_map.get(str(r["id"]), [])) for r in rows]

    def admin_review_feedback_ticket(
        self,
        ticket_id: Any,
        *,
        status: str,
        review_note: str = "",
        reviewed_by: str = "",
    ) -> dict[str, Any]:
        tid = str(ticket_id or "").strip()
        clean_status = str(status or "").strip().lower()
        if clean_status not in ("new", "in_progress", "resolved", "closed"):
            raise StorageError(
                "invalid_status",
                "Допустимые статусы обращения: new, in_progress, resolved, closed.",
                400,
            )
        clean_note = str(review_note or "").strip()[:1000]
        clean_reviewer = str(reviewed_by or "").strip()[:120]
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM feedback_tickets WHERE id = ?", (tid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Обращение не найдено.", 404)
            reviewed_at = row["reviewed_at"] or now_iso if clean_status != "new" else None
            self._conn.execute(
                """
                UPDATE feedback_tickets
                SET status = ?,
                    review_note = ?,
                    reviewed_by = ?,
                    updated_at = ?,
                    reviewed_at = ?
                WHERE id = ?
                """,
                (clean_status, clean_note, clean_reviewer, now_iso, reviewed_at, tid),
            )
            self._record_admin_outbox(
                "vektor.support.raw.v1",
                tid,
                f"admin.feedback.{clean_status}",
                {"ticketId": tid, "status": clean_status, "reviewedBy": clean_reviewer},
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM feedback_tickets WHERE id = ?", (tid,)).fetchone()
            att_map = self._load_feedback_attachments_map([tid])
        return self._feedback_ticket_row_to_dict(updated, att_map.get(tid, []))
