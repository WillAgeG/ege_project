"""Админ-аналитика, модерация репетиторов, заявки, выплаты НПД и Outbox (SQLite)."""

from datetime import datetime, timezone
import json
import secrets
import sqlite3
from typing import Any

from .common import StorageError, _iso_utc_now, _normalize_tz, calc_fee_split


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
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row["tutor_name"] or ""),
            "method": str(row["method"]),
            "amountRub": int(row["amount_rub"]),
            "npdReceipt": row["npd_receipt"],
            "bank": str(row["bank"] or ""),
            "destinationMasked": str(row["destination_masked"] or ""),
            "status": str(row["status"]),
            "rawStatus": str(row["status"]),
            "createdAt": str(row["created_at"]),
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
        payout_rub = 0
        by_day: dict[str, dict[str, Any]] = {}
        for r in req_rows:
            day = str(r["slot_date"])[:10]
            slot = by_day.setdefault(
                day,
                {"date": day, "gmvRub": 0, "feeRub": 0, "payoutRub": 0, "requests": 0, "accepted": 0},
            )
            slot["requests"] += 1
            if str(r["status"]) == "accepted":
                gross = int(r["final_price_rub"] or r["counter_price_rub"] or r["offer_price_rub"] or 0)
                fee, net = calc_fee_split(gross)
                gmv_rub += gross
                fee_rub += fee
                payout_rub += net
                slot["gmvRub"] += gross
                slot["feeRub"] += fee
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
                "payoutRub": payout_rub,
                "usersCount": users_count,
                "tutorsCount": tutors_count,
                "requestsCount": requests_count,
                "pendingRequestsCount": pending_requests_count,
                "payoutsCount": payouts_count,
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
                "UPDATE admin_payout_requests SET status = ?, paid_at = ? WHERE id = ?",
                (clean_status, paid_at, pid),
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
