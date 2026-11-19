"""Админ-аналитика, модерация, заявки, выплаты НПД и Kafka Outbox (PostgreSQL 17)."""

from datetime import datetime, timedelta, timezone
import json
import re
import secrets
from typing import Any
import uuid

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool

from databases.sqlite.common import (
    StorageError,
    User,
    calc_fee_split,
    deep_merge,
    hash_password,
    hash_token,
    validate_display_name,
    validate_doc_name,
    validate_email,
    validate_password,
    validate_username,
    verify_password,
)
from .schema import _build_envelope, _iso_utc, _normalize_tz, _utc_now


class PgAdminMixin:
    @staticmethod
    def _admin_user_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": int(row["id"]),
            "username": str(row["username"]),
            "displayName": str(row.get("display_name") or row["username"]),
            "email": row.get("email"),
            "authProvider": str(row.get("auth_provider") or "local"),
            "role": str(row.get("role") or "student"),
            "createdAt": _iso_utc(row.get("created_at")),
        }

    @staticmethod
    def _admin_tutor_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "userId": int(row["user_id"]) if row.get("user_id") is not None else None,
            "fullName": str(row["full_name"]),
            "subject": str(row["subject"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "baseRateRub": int(row["base_rate_rub"]),
            "marketRateRub": int(row["market_rate_rub"]),
            "sourceChannel": str(row["source_channel"]),
            "tariffId": str(row["tariff_id"]),
            "whatsappPhone": str(row.get("whatsapp_phone") or ""),
            "telegramHandle": str(row.get("telegram_handle") or ""),
            "maxHandle": str(row.get("max_handle") or ""),
            "hasPhoto": bool(row.get("has_photo", True)),
            "verified": bool(row.get("verified", True)),
            "bumpedToday": bool(row.get("bumped_today", False)),
            "rating": float(row.get("rating") or 4.9),
            "reviewsCount": int(row.get("reviews_count") or 0),
            "lastBumpedAt": _iso_utc(row.get("last_bumped_at")),
            "updatedAt": _iso_utc(row.get("updated_at")),
        }

    @staticmethod
    def _normalize_pg_request_status(raw_status: str, escrow_status: str | None) -> str:
        raw = (raw_status or "").strip().lower()
        esc = (escrow_status or "").strip().lower()
        if esc == "refunded" or raw == "cancelled":
            return "refunded"
        if raw in ("offered", "countered"):
            return "pending"
        if raw in ("accepted", "completed"):
            return "accepted"
        if raw == "declined":
            return "declined"
        return raw or "pending"

    @classmethod
    def _admin_request_row_to_dict(cls, row: dict[str, Any]) -> dict[str, Any]:
        raw_status = str(row.get("status") or "offered")
        escrow_status = str(row.get("escrow_status") or "none")
        slot_date = row.get("slot_date")
        slot_date_str = slot_date.isoformat()[:10] if hasattr(slot_date, "isoformat") else str(slot_date or "")[:10]
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row.get("tutor_name") or ""),
            "studentUserId": int(row["student_user_id"]) if row.get("student_user_id") is not None else None,
            "studentName": str(row["student_name"]),
            "subject": str(row["subject"]),
            "city": str(row["city"]),
            "timezone": str(row["timezone"]),
            "slotDate": slot_date_str,
            "hourSlot": str(row["hour_slot"]),
            "tariffId": str(row["tariff_id"]),
            "offerPriceRub": int(row["offer_price_rub"]),
            "counterPriceRub": int(row["counter_price_rub"]) if row.get("counter_price_rub") is not None else None,
            "finalPriceRub": int(row["final_price_rub"]) if row.get("final_price_rub") is not None else None,
            "status": cls._normalize_pg_request_status(raw_status, escrow_status),
            "rawStatus": raw_status,
            "escrowStatus": escrow_status,
            "messengerChannel": str(row.get("messenger_channel") or "whatsapp"),
            "createdAt": _iso_utc(row.get("created_at")),
            "updatedAt": _iso_utc(row.get("updated_at")),
        }

    @staticmethod
    def _normalize_pg_payout_status(raw_status: str) -> str:
        raw = (raw_status or "").strip().lower()
        if raw == "paid":
            return "succeeded"
        if raw == "failed":
            return "rejected"
        return raw or "processing"

    @classmethod
    def _admin_payout_row_to_dict(cls, row: dict[str, Any]) -> dict[str, Any]:
        raw_status = str(row.get("status") or "pending")
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row.get("tutor_name") or ""),
            "method": str(row["method"]),
            "amountRub": int(row["amount_rub"]),
            "npdReceipt": row.get("npd_receipt"),
            "bank": str(row.get("bank") or ""),
            "destinationMasked": str(row.get("destination_masked") or ""),
            "status": cls._normalize_pg_payout_status(raw_status),
            "rawStatus": raw_status,
            "createdAt": _iso_utc(row.get("created_at")),
            "paidAt": _iso_utc(row["paid_at"]) if row.get("paid_at") is not None else None,
        }

    def admin_overview(self) -> dict[str, Any]:
        with self._pool.connection() as conn:
            users_count = int(conn.execute("SELECT COUNT(*) AS cnt FROM oltp.users").fetchone()["cnt"])
            tutors_count = int(conn.execute("SELECT COUNT(*) AS cnt FROM oltp.tutors").fetchone()["cnt"])
            req_agg = conn.execute(
                """
                SELECT COUNT(*) AS total_cnt,
                       COUNT(*) FILTER (WHERE status IN ('offered', 'countered')) AS pending_cnt
                FROM oltp.lesson_requests
                """
            ).fetchone()
            requests_count = int(req_agg["total_cnt"] or 0)
            pending_requests_count = int(req_agg["pending_cnt"] or 0)
            payouts_count = int(conn.execute("SELECT COUNT(*) AS cnt FROM oltp.payout_requests").fetchone()["cnt"])
            outbox_pending = int(
                conn.execute("SELECT COUNT(*) AS cnt FROM outbox.kafka_outbox WHERE published_at IS NULL").fetchone()["cnt"]
            )

            esc = conn.execute(
                """
                SELECT COALESCE(SUM(gross_rub), 0) AS gmv_rub,
                       COALESCE(SUM(platform_fee_rub), 0) AS fee_rub,
                       COALESCE(SUM(tutor_payout_rub), 0) AS payout_rub
                FROM oltp.escrow_holds
                WHERE status <> 'refunded'
                """
            ).fetchone()
            gmv_rub = int(esc["gmv_rub"] or 0)
            fee_rub = int(esc["fee_rub"] or 0)
            payout_rub = int(esc["payout_rub"] or 0)

            ch_rows = conn.execute(
                """
                SELECT source_channel AS channel, COUNT(*) AS cnt
                FROM oltp.tutors
                GROUP BY source_channel
                ORDER BY cnt DESC, source_channel ASC
                """
            ).fetchall()
            total_tutors = max(1, tutors_count)
            channel_share = [
                {
                    "channel": str(r["channel"]),
                    "count": int(r["cnt"]),
                    "sharePct": round(int(r["cnt"]) * 100.0 / total_tutors, 1),
                }
                for r in ch_rows
            ]

            has_gold = conn.execute("SELECT to_regclass('gold.daily_gmv_metrics') AS reg").fetchone()["reg"]
            daily_series: list[dict[str, Any]] = []
            if has_gold:
                g_rows = conn.execute(
                    """
                    SELECT metric_date,
                           COALESCE(SUM(gmv_rub), 0) AS gmv_rub,
                           COALESCE(SUM(platform_fee_rub), 0) AS fee_rub,
                           COALESCE(SUM(tutor_payout_rub), 0) AS payout_rub,
                           COALESCE(SUM(total_requests), 0) AS requests,
                           COALESCE(SUM(accepted_requests), 0) AS accepted
                    FROM gold.daily_gmv_metrics
                    GROUP BY metric_date
                    ORDER BY metric_date ASC
                    """
                ).fetchall()
                for r in g_rows:
                    d_val = r["metric_date"]
                    daily_series.append(
                        {
                            "date": d_val.isoformat()[:10] if hasattr(d_val, "isoformat") else str(d_val)[:10],
                            "gmvRub": int(r["gmv_rub"] or 0),
                            "feeRub": int(r["fee_rub"] or 0),
                            "payoutRub": int(r["payout_rub"] or 0),
                            "requests": int(r["requests"] or 0),
                            "accepted": int(r["accepted"] or 0),
                        }
                    )

            if not daily_series:
                r_rows = conn.execute(
                    """
                    SELECT slot_date,
                           status,
                           COALESCE(final_price_rub, counter_price_rub, offer_price_rub, 0) AS eff_price
                    FROM oltp.lesson_requests
                    ORDER BY slot_date ASC
                    """
                ).fetchall()
                by_day: dict[str, dict[str, Any]] = {}
                for r in r_rows:
                    sd = r["slot_date"]
                    day = sd.isoformat()[:10] if hasattr(sd, "isoformat") else str(sd or "")[:10]
                    slot = by_day.setdefault(
                        day,
                        {"date": day, "gmvRub": 0, "feeRub": 0, "payoutRub": 0, "requests": 0, "accepted": 0},
                    )
                    slot["requests"] += 1
                    if str(r["status"]) in ("accepted", "completed"):
                        gross = int(r["eff_price"] or 0)
                        fee, net = calc_fee_split(gross)
                        slot["gmvRub"] += gross
                        slot["feeRub"] += fee
                        slot["payoutRub"] += net
                        slot["accepted"] += 1
                daily_series = [by_day[d] for d in sorted(by_day.keys())]

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
                "outboxPending": outbox_pending,
            },
            "channelShare": channel_share,
            "dailySeries": daily_series,
            "storage": storage,
        }

    def admin_list_users(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT id, username, display_name, email, auth_provider, role, created_at
                FROM oltp.users
                ORDER BY id DESC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._admin_user_row_to_dict(r) for r in rows]

    def admin_set_user_role(self, user_id: int, role: str) -> dict[str, Any]:
        clean_role = (role or "").strip().lower()
        if clean_role not in ("student", "tutor", "admin"):
            raise StorageError("invalid_role", "Допустимые роли: student, tutor, admin.", 400)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    UPDATE oltp.users
                    SET role = %s
                    WHERE id = %s
                    RETURNING id, username, display_name, email, auth_provider, role, created_at
                    """,
                    (clean_role, int(user_id)),
                ).fetchone()
                if not row:
                    raise StorageError("not_found", "Пользователь не найден.", 404)
                self._insert_outbox(
                    conn,
                    topic="vektor.user.clickstream.v1",
                    partition_key=str(user_id),
                    event_type="admin.user.role_updated",
                    user_id=int(user_id),
                    role=clean_role,
                    view="admin",
                    payload={"userId": int(user_id), "username": str(row["username"]), "role": clean_role},
                )
        return self._admin_user_row_to_dict(row)

    def admin_list_tutors(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM oltp.tutors
                ORDER BY bumped_today DESC, rating DESC, id ASC
                LIMIT %s
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
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (tid,)).fetchone()
                if not existing:
                    raise StorageError("not_found", "Преподаватель не найден.", 404)
                next_verified = bool(verified) if verified is not None else bool(existing.get("verified", True))
                next_bumped = bool(bumped) if bumped is not None else bool(existing.get("bumped_today", False))
                next_tariff = tariff_id if tariff_id is not None else str(existing["tariff_id"])
                row = conn.execute(
                    """
                    UPDATE oltp.tutors
                    SET verified = %s,
                        bumped_today = %s,
                        tariff_id = %s,
                        last_bumped_at = CASE WHEN %s THEN NOW() ELSE last_bumped_at END,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING *
                    """,
                    (next_verified, next_bumped, next_tariff, bool(bumped is True), tid),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=tid,
                    event_type="admin.tutor.moderated",
                    user_id=int(existing["user_id"]) if existing.get("user_id") is not None else None,
                    role="admin",
                    view="admin",
                    payload={
                        "tutorId": tid,
                        "verified": next_verified,
                        "bumpedToday": next_bumped,
                        "tariffId": next_tariff,
                    },
                )
        return self._admin_tutor_row_to_dict(row)

    def admin_list_requests(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT lr.*,
                       COALESCE(t.full_name, '') AS tutor_name,
                       COALESCE(eh.status, 'none') AS escrow_status
                FROM oltp.lesson_requests lr
                LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                LEFT JOIN oltp.escrow_holds eh ON eh.request_id = lr.id
                ORDER BY lr.slot_date DESC, lr.hour_slot DESC, lr.id ASC
                LIMIT %s
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
        pg_status_map = {
            "accepted": "accepted",
            "pending": "offered",
            "declined": "declined",
            "refunded": "cancelled",
        }
        target_pg_status = pg_status_map[clean_status]
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    "SELECT * FROM oltp.lesson_requests WHERE id = %s FOR UPDATE",
                    (rid,),
                ).fetchone()
                if not existing:
                    raise StorageError("not_found", "Заявка не найдена.", 404)
                if clean_status == "accepted":
                    eff_final = int(
                        existing.get("final_price_rub")
                        or existing.get("counter_price_rub")
                        or existing.get("offer_price_rub")
                        or 0
                    )
                    conn.execute(
                        """
                        UPDATE oltp.lesson_requests
                        SET status = %s,
                            final_price_rub = COALESCE(final_price_rub, counter_price_rub, offer_price_rub),
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (target_pg_status, rid),
                    )
                    if eff_final > 0:
                        fee_esc, payout_esc = calc_fee_split(eff_final)
                        esc_row = conn.execute(
                            "SELECT id FROM oltp.escrow_holds WHERE request_id = %s",
                            (rid,),
                        ).fetchone()
                        if esc_row:
                            conn.execute(
                                """
                                UPDATE oltp.escrow_holds
                                SET gross_rub = %s,
                                    platform_fee_rub = %s,
                                    tutor_payout_rub = %s,
                                    status = 'captured',
                                    settled_at = NOW()
                                WHERE id = %s
                                """,
                                (eff_final, fee_esc, payout_esc, esc_row["id"]),
                            )
                        else:
                            conn.execute(
                                """
                                INSERT INTO oltp.escrow_holds (
                                    id, request_id, tutor_id, student_user_id, gross_rub,
                                    platform_fee_rub, tutor_payout_rub, status, settled_at
                                ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'captured', NOW())
                                """,
                                (
                                    f"esc-{rid}",
                                    rid,
                                    str(existing["tutor_id"]),
                                    existing.get("student_user_id"),
                                    eff_final,
                                    fee_esc,
                                    payout_esc,
                                ),
                            )
                elif clean_status == "pending":
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = %s, updated_at = NOW() WHERE id = %s",
                        (target_pg_status, rid),
                    )
                    conn.execute(
                        """
                        UPDATE oltp.escrow_holds
                        SET status = 'frozen', settled_at = NULL
                        WHERE request_id = %s
                        """,
                        (rid,),
                    )
                else:
                    student_uid = existing.get("student_user_id")
                    reserved_rub = int(existing.get("reserved_rub") or 0)
                    if student_uid is not None and reserved_rub > 0:
                        w_row = conn.execute(
                            """
                            INSERT INTO oltp.wallets (user_id, balance_rub, initial_paid, plan_id)
                            VALUES (%s, %s, TRUE, 'trial5k')
                            ON CONFLICT (user_id) DO UPDATE SET
                                balance_rub = oltp.wallets.balance_rub + EXCLUDED.balance_rub,
                                updated_at = NOW()
                            RETURNING balance_rub
                            """,
                            (int(student_uid), reserved_rub),
                        ).fetchone()
                        bal_after = int(w_row["balance_rub"]) if w_row else reserved_rub
                        conn.execute(
                            """
                            INSERT INTO oltp.wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                            ) VALUES (%s, 'escrow_refund', %s, %s, 0, 'escrow', 'booking', %s, %s)
                            """,
                            (
                                int(student_uid),
                                reserved_rub,
                                bal_after,
                                rid,
                                f"Возврат средств администратором по заявке {rid}",
                            ),
                        )
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = %s, reserved_rub = 0, updated_at = NOW() WHERE id = %s",
                        (target_pg_status, rid),
                    )
                    conn.execute(
                        """
                        UPDATE oltp.escrow_holds
                        SET status = 'refunded', settled_at = NOW()
                        WHERE request_id = %s
                        """,
                        (rid,),
                    )
                topic = "vektor.payments.ledger.v1" if clean_status == "refunded" else "vektor.market.bids.v1"
                self._insert_outbox(
                    conn,
                    topic=topic,
                    partition_key=rid,
                    event_type=f"admin.request.{clean_status}",
                    user_id=int(existing["student_user_id"]) if existing.get("student_user_id") is not None else None,
                    role="admin",
                    view="admin",
                    payload={"requestId": rid, "status": clean_status, "pgStatus": target_pg_status},
                )
                row = conn.execute(
                    """
                    SELECT lr.*,
                           COALESCE(t.full_name, '') AS tutor_name,
                           COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN oltp.escrow_holds eh ON eh.request_id = lr.id
                    WHERE lr.id = %s
                    """,
                    (rid,),
                ).fetchone()
        return self._admin_request_row_to_dict(row)

    def admin_list_payouts(self, limit: int = 100) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                FROM oltp.payout_requests p
                LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                ORDER BY p.created_at DESC, p.id ASC
                LIMIT %s
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
        pg_status_map = {
            "succeeded": "paid",
            "processing": "processing",
            "rejected": "failed",
        }
        target_pg_status = pg_status_map[clean_status]
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    "SELECT * FROM oltp.payout_requests WHERE id = %s FOR UPDATE",
                    (pid,),
                ).fetchone()
                if not existing:
                    raise StorageError("not_found", "Выплата не найдена.", 404)
                conn.execute(
                    """
                    UPDATE oltp.payout_requests
                    SET status = %s,
                        paid_at = CASE WHEN %s = 'paid' THEN NOW() ELSE NULL END
                    WHERE id = %s
                    """,
                    (target_pg_status, target_pg_status, pid),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=pid,
                    event_type=f"admin.payout.{clean_status}",
                    role="admin",
                    view="admin",
                    payload={
                        "payoutId": pid,
                        "status": clean_status,
                        "pgStatus": target_pg_status,
                        "amountRub": int(existing["amount_rub"]),
                    },
                )
                row = conn.execute(
                    """
                    SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.payout_requests p
                    LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                    WHERE p.id = %s
                    """,
                    (pid,),
                ).fetchone()
        return self._admin_payout_row_to_dict(row)

    def admin_list_outbox(self, limit: int = 50) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 50), 200))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT id, topic, partition_key, payload, created_at, published_at
                FROM outbox.kafka_outbox
                ORDER BY id DESC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            payload = r["payload"] if isinstance(r["payload"], dict) else {}
            out.append(
                {
                    "id": int(r["id"]),
                    "topic": str(r["topic"]),
                    "partitionKey": str(r["partition_key"]),
                    "eventType": str(payload.get("event_type") or ""),
                    "payload": payload,
                    "createdAt": _iso_utc(r["created_at"]),
                    "publishedAt": _iso_utc(r["published_at"]) if r["published_at"] is not None else None,
                    "status": "published" if r["published_at"] is not None else "pending",
                }
            )
        return out
