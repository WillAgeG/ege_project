"""Доменная логика маркетплейса: кошелёк/леджер, эскроу, заявки, расписание, лиды, контакты и выплаты (PostgreSQL 17)."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import re
import secrets
from typing import Any
import uuid

import psycopg
from psycopg.types.json import Jsonb

from databases.sqlite.common import (
    StorageError,
    _normalize_dow,
    _normalize_tz,
    calc_fee_split,
    calc_sbp_fee,
    clean_custom_badges,
    clean_direction_label,
    deep_merge,
    format_days_short,
    generate_telemost_url,
    mask_payout_destination,
    normalize_city_tz,
    normalize_direction_payload,
    normalize_dispute_payload,
    normalize_review_payload,
    normalize_tutor_profile_payload,
    sort_dows,
    validate_display_name,
    validate_hour_slot,
    validate_schedule_plan,
    validate_telemost_url,
)
from .schema import _doc_outbox_meta, _iso_utc, _row_to_user, _utc_now

_PG_TO_MKT_STATUS = {
    "offered": "pending",
    "pending": "pending",
    "countered": "countered",
    "accepted": "accepted",
    "completed": "completed",
    "declined": "declined",
    "cancelled": "cancelled",
    "refunded": "cancelled",
}


class PgMarketplaceMixin:
    def _pg_wallet_snapshot(self, conn: psycopg.Connection[Any], user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        conn.execute(
            """
            INSERT INTO oltp.wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards)
            VALUES (%s, 0, FALSE, 'trial5k', '[]'::jsonb)
            ON CONFLICT (user_id) DO NOTHING
            """,
            (uid,),
        )
        w = conn.execute("SELECT * FROM oltp.wallets WHERE user_id = %s", (uid,)).fetchone()
        frozen_row = conn.execute(
            """
            SELECT COALESCE(SUM(reserved_rub), 0) AS frozen
            FROM oltp.lesson_requests
            WHERE student_user_id = %s AND reserved_rub > 0 AND status IN ('offered', 'countered', 'accepted')
            """,
            (uid,),
        ).fetchone()
        led_rows = conn.execute(
            """
            SELECT id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
            FROM oltp.wallet_ledger
            WHERE user_id = %s
            ORDER BY id DESC
            LIMIT 30
            """,
            (uid,),
        ).fetchall()
        cards = w["saved_cards"] if (w and isinstance(w.get("saved_cards"), list)) else []
        return {
            "balanceRub": int(w["balance_rub"]) if w else 0,
            "frozenRub": int(frozen_row["frozen"]) if frozen_row else 0,
            "initialPaid": bool(w["initial_paid"]) if w else False,
            "planId": str(w.get("plan_id") or "trial5k") if w else "trial5k",
            "savedCards": cards,
            "ledger": [
                {
                    "id": int(r["id"]),
                    "kind": str(r["kind"]),
                    "amountRub": int(r["amount_rub"]),
                    "balanceAfterRub": int(r["balance_after_rub"]),
                    "feeRub": int(r["fee_rub"]),
                    "method": str(r.get("method") or ""),
                    "refType": str(r.get("ref_type") or ""),
                    "refId": str(r.get("ref_id") or ""),
                    "note": str(r.get("note") or ""),
                    "createdAt": _iso_utc(r.get("created_at")),
                }
                for r in led_rows
            ],
        }

    def get_wallet(self, user_id: int) -> dict[str, Any]:
        with self._pool.connection() as conn:
            with conn.transaction():
                return self._pg_wallet_snapshot(conn, user_id)

    def topup_wallet(
        self,
        user_id: int,
        *,
        amount_rub: int,
        method: str = "sbp",
        card_id: str | None = None,
        plan_id: str | None = None,
    ) -> dict[str, Any]:
        uid = int(user_id)
        clean_method = "card" if (method or "").strip().lower() == "card" else "sbp"
        amt = int(amount_rub or 0)
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards)
                    VALUES (%s, 0, FALSE, 'trial5k', '[]'::jsonb)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    (uid,),
                )
                w = conn.execute("SELECT * FROM oltp.wallets WHERE user_id = %s FOR UPDATE", (uid,)).fetchone()
                cur_bal = int(w["balance_rub"])
                initial_paid = bool(w["initial_paid"])
                cur_plan = str(w.get("plan_id") or "trial5k")
                saved_cards = w["saved_cards"] if isinstance(w.get("saved_cards"), list) else []
                next_plan = (plan_id or "").strip() or cur_plan
                min_amt = 390 if (next_plan == "ai390" and not initial_paid) else (100 if initial_paid else 490)
                if amt < min_amt or amt > 200_000:
                    raise StorageError(
                        "invalid_amount",
                        f"Сумма пополнения должна быть от {min_amt} до 200 000 ₽.",
                        400,
                    )
                if clean_method == "card" and card_id:
                    if not any(str(c.get("id") or "") == str(card_id) for c in saved_cards if isinstance(c, dict)):
                        raise StorageError("card_not_found", "Указанная карта не найдена.", 404)
                fee_rub = ((amt * 3 + 50) // 100) if clean_method == "card" else 0
                new_bal = cur_bal + amt
                new_initial = initial_paid or amt >= 490 or new_bal >= 490
                if not plan_id and new_bal >= 8900:
                    next_plan = "month10k"
                conn.execute(
                    """
                    UPDATE oltp.wallets
                    SET balance_rub = %s, initial_paid = %s, plan_id = %s, updated_at = NOW()
                    WHERE user_id = %s
                    """,
                    (new_bal, new_initial, next_plan, uid),
                )
                conn.execute(
                    """
                    INSERT INTO oltp.wallet_ledger (
                        user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                    ) VALUES (%s, 'topup', %s, %s, %s, %s, 'plan', %s, %s)
                    """,
                    (
                        uid,
                        amt,
                        new_bal,
                        fee_rub,
                        clean_method,
                        next_plan,
                        f"Пополнение баланса ({'Карта +3%' if clean_method == 'card' else 'СБП'})",
                    ),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=str(uid),
                    event_type="wallet.topup",
                    user_id=uid,
                    role="student",
                    view="market",
                    payload={"amountRub": amt, "feeRub": fee_rub, "method": clean_method, "balanceAfterRub": new_bal},
                )
                return self._pg_wallet_snapshot(conn, uid)

    def add_saved_card(
        self,
        user_id: int,
        card: dict[str, Any],
        *,
        card_id: str | None = None,
    ) -> dict[str, Any]:
        uid = int(user_id)
        last4 = re.sub(r"\D+", "", str(card.get("last4") or ""))[-4:]
        exp = str(card.get("exp") or "").strip()[:5]
        if len(last4) != 4 or not re.fullmatch(r"(0[1-9]|1[0-2])/\d{2}", exp):
            raise StorageError("invalid_card", "Укажите 4 последние цифры и срок ММ/ГГ.", 400)
        clean_bin = re.sub(r"\D+", "", str(card.get("bin") or ""))[:6]
        brand = str(card.get("brand") or "МИР").strip()[:32] or "МИР"
        bank_name = str(card.get("bankName") or "").strip()[:48]
        bank_theme = str(card.get("bankTheme") or "default").strip()[:24] or "default"
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards)
                    VALUES (%s, 0, FALSE, 'trial5k', '[]'::jsonb)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    (uid,),
                )
                w = conn.execute("SELECT saved_cards FROM oltp.wallets WHERE user_id = %s FOR UPDATE", (uid,)).fetchone()
                cards = list(w["saved_cards"]) if (w and isinstance(w.get("saved_cards"), list)) else []
                existing = next((c for c in cards if isinstance(c, dict) and c.get("last4") == last4 and c.get("exp") == exp), None)
                if existing:
                    card_obj = existing
                else:
                    card_obj = {
                        "id": str(card_id or f"card-{last4}-{secrets.token_hex(4)}"),
                        "brand": brand,
                        "bankName": bank_name,
                        "bankTheme": bank_theme,
                        "bin": clean_bin,
                        "last4": last4,
                        "exp": exp,
                    }
                    cards.insert(0, card_obj)
                    conn.execute(
                        "UPDATE oltp.wallets SET saved_cards = %s, updated_at = NOW() WHERE user_id = %s",
                        (Jsonb(cards[:10]), uid),
                    )
                return {"card": card_obj, "wallet": self._pg_wallet_snapshot(conn, uid)}

    def delete_saved_card(self, user_id: int, card_id: str) -> dict[str, Any]:
        uid = int(user_id)
        cid = str(card_id or "").strip()
        with self._pool.connection() as conn:
            with conn.transaction():
                w = conn.execute("SELECT saved_cards FROM oltp.wallets WHERE user_id = %s FOR UPDATE", (uid,)).fetchone()
                cur_cards = list(w["saved_cards"]) if (w and isinstance(w.get("saved_cards"), list)) else []
                cards = [c for c in cur_cards if str(c.get("id") or "") != cid]
                removed = len(cards) != len(cur_cards)
                if removed:
                    conn.execute(
                        "UPDATE oltp.wallets SET saved_cards = %s, updated_at = NOW() WHERE user_id = %s",
                        (Jsonb(cards), uid),
                    )
                return {"ok": True, "removed": removed, "wallet": self._pg_wallet_snapshot(conn, uid)}

    @staticmethod
    def _pg_tutor_to_public_dict(r: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(r["id"]),
            "userId": int(r["user_id"]) if r.get("user_id") is not None else None,
            "fullName": str(r["full_name"]),
            "name": str(r["full_name"]),
            "subject": str(r["subject"]),
            "subjects": r.get("subjects_json") if isinstance(r.get("subjects_json"), list) else [],
            "exams": r.get("exams_json") if isinstance(r.get("exams_json"), list) else ["ЕГЭ"],
            "formats": r.get("formats_json") if isinstance(r.get("formats_json"), list) else ["Онлайн"],
            "city": str(r["city"]),
            "timezone": str(r["timezone"]),
            "baseRateRub": int(r["base_rate_rub"]),
            "price": int(r["base_rate_rub"]),
            "marketRateRub": int(r["market_rate_rub"]),
            "marketPrice": int(r["market_rate_rub"]),
            "sourceChannel": str(r["source_channel"]),
            "tariffId": str(r["tariff_id"]),
            "whatsappPhone": str(r.get("whatsapp_phone") or ""),
            "telegramHandle": str(r.get("telegram_handle") or ""),
            "maxHandle": str(r.get("max_handle") or ""),
            "photoUrl": str(r.get("photo_url") or ""),
            "headline": str(r.get("headline") or ""),
            "bio": str(r.get("bio") or ""),
            "education": str(r.get("education") or ""),
            "expYears": int(r.get("exp_years") or 3),
            "avgScore": int(r.get("avg_score") or 85),
            "customSkills": str(r.get("custom_skills") or ""),
            "firstLessonGuarantee": bool(r.get("first_lesson_guarantee", True)),
            "hasPhoto": bool(r.get("has_photo", True)),
            "verified": bool(r.get("verified", True)),
            "bumpedToday": bool(r.get("bumped_today", False)),
            "published": bool(r.get("is_published", True)),
            "customBadges": clean_custom_badges(r.get("custom_badges_json")),
            "minFair": int(r["min_fair_rub"]) if int(r.get("min_fair_rub") or 0) > 0 else 0,
            "rating": float(r.get("rating") or 4.9),
            "reviewsCount": int(r.get("reviews_count") or 0),
            "slots": r.get("slots_json") if isinstance(r.get("slots_json"), dict) else {},
            "lastBumpedAt": _iso_utc(r.get("last_bumped_at")),
            "updatedAt": _iso_utc(r.get("updated_at")),
        }

    def list_tutors(
        self,
        *,
        subject: str | None = None,
        city: str | None = None,
        limit: int = 100,
        include_unpublished: bool = False,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        clauses: list[str] = []
        params: list[Any] = []
        if not include_unpublished:
            clauses.append("COALESCE(is_published, TRUE) = TRUE")
        if subject and subject.strip().lower() not in ("", "all"):
            s = subject.strip().lower()
            clauses.append("(LOWER(subject) LIKE %s OR LOWER(subjects_json::text) LIKE %s)")
            params.extend([f"%{s}%", f"%{s}%"])
        if city and city.strip().lower() not in ("", "all"):
            clauses.append("LOWER(city) = %s")
            params.append(city.strip().lower())
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"SELECT * FROM oltp.tutors {where} ORDER BY bumped_today DESC, rating DESC, id ASC LIMIT %s",
                (*params, lim),
            ).fetchall()
        return [self._pg_tutor_to_public_dict(r) for r in rows]

    def list_tutor_profiles(self, user_id: int) -> list[dict[str, Any]]:
        uid = int(user_id)
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM oltp.tutors
                WHERE user_id = %s
                ORDER BY COALESCE(is_published, TRUE) DESC, updated_at DESC, id ASC
                """,
                (uid,),
            ).fetchall()
        return [self._pg_tutor_to_public_dict(r) for r in rows]

    def _pg_ensure_tutor_exists(
        self,
        conn: psycopg.Connection[Any],
        tutor_id: str,
        *,
        tutor_name: str = "Преподаватель Вектор",
        subject: str = "Подготовка",
        city: str | None = None,
        timezone_str: str | None = None,
        base_rate_rub: int = 1200,
    ) -> dict[str, Any]:
        tid = tutor_id.strip()[:64]
        existing = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s", (tid,)).fetchone()
        if existing:
            return existing
        norm_city, norm_tz = normalize_city_tz(city, timezone_str)
        rate = max(100, min(99999, int(base_rate_rub or 1200)))
        mkt_rate = max(rate, ((rate * 128 + 50) // 100))
        return conn.execute(
            """
            INSERT INTO oltp.tutors (
                id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                source_channel, tariff_id, has_photo, verified, bumped_today, rating, reviews_count
            ) VALUES (%s, NULL, %s, %s, %s, %s, %s, %s, 'platform', 'free', FALSE, TRUE, FALSE, 4.90, 12)
            ON CONFLICT (id) DO UPDATE SET updated_at = oltp.tutors.updated_at
            RETURNING *
            """,
            (
                tid,
                (tutor_name or "Преподаватель Вектор").strip()[:80],
                (subject or "Подготовка").strip()[:64],
                norm_city,
                norm_tz,
                rate,
                mkt_rate,
            ),
        ).fetchone()

    def upsert_tutor_profile(
        self,
        user_id: int,
        payload: dict[str, Any],
        *,
        tutor_id: str | None = None,
        create_new: bool = False,
        strict_tutor_id: bool = False,
    ) -> dict[str, Any]:
        uid = int(user_id)
        req_tid = str(tutor_id or payload.get("id") or payload.get("tutorId") or "").strip()[:64]
        with self._pool.connection() as conn:
            with conn.transaction():
                own = None
                sibling = conn.execute(
                    """
                    SELECT * FROM oltp.tutors
                    WHERE user_id = %s
                    ORDER BY COALESCE(is_published, TRUE) DESC, updated_at DESC, id ASC
                    LIMIT 1
                    """,
                    (uid,),
                ).fetchone()
                u_row = conn.execute(
                    "SELECT display_name, city, avatar_url FROM oltp.users WHERE id = %s",
                    (uid,),
                ).fetchone()
                cnt_row = conn.execute(
                    "SELECT COUNT(*) AS cnt FROM oltp.tutors WHERE user_id = %s",
                    (uid,),
                ).fetchone()
                profile_count = int(cnt_row["cnt"]) if cnt_row else 0

                if create_new:
                    if profile_count >= 10:
                        raise StorageError("too_many_profiles", "Можно создать не более 10 профилей для поиска.", 400)
                    tid = req_tid or f"tut-{secrets.token_hex(5)}"
                    clash = conn.execute("SELECT id FROM oltp.tutors WHERE id = %s", (tid,)).fetchone()
                    if clash:
                        raise StorageError("already_exists", "Анкета с таким ID уже существует.", 409)
                elif req_tid:
                    own = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (req_tid,)).fetchone()
                    if own and own.get("user_id") is not None and int(own["user_id"]) != uid:
                        raise StorageError("forbidden", "Нет прав на редактирование чужой анкеты.", 403)
                    if not own:
                        if strict_tutor_id:
                            raise StorageError("not_found", "Профиль для поиска не найден.", 404)
                        if profile_count >= 10:
                            raise StorageError("too_many_profiles", "Можно создать не более 10 профилей для поиска.", 400)
                    tid = req_tid
                else:
                    own = sibling
                    tid = str(own["id"]) if own else f"tut-{secrets.token_hex(5)}"

                fallback_name = str(
                    (own.get("full_name") if own else "")
                    or (sibling.get("full_name") if sibling else "")
                    or (u_row.get("display_name") if u_row else "")
                ).strip()
                norm = normalize_tutor_profile_payload(payload, fallback_name=fallback_name)

                if payload.get("hasPhoto") is False:
                    photo_url = ""
                else:
                    photo_url = str(
                        payload.get("photo")
                        or payload.get("photoUrl")
                        or (own.get("photo_url") if own and "photo" not in payload and "photoUrl" not in payload else "")
                        or (sibling.get("photo_url") if not own and sibling and "photo" not in payload and "photoUrl" not in payload else "")
                        or ""
                    ).strip()[:220_000]
                has_photo = bool(photo_url)
                tariff_id = str(payload.get("tariffId") or (own["tariff_id"] if own else (sibling["tariff_id"] if sibling else "free")))
                if tariff_id not in ("free", "trial5k", "month10k"):
                    tariff_id = "free"
                bumped_today = bool(own.get("bumped_today")) if own else False
                verified = bool(own.get("verified", False)) if own else (bool(sibling.get("verified", False)) if sibling else False)
                inn_val = str(own.get("inn") or "") if own else (str(sibling.get("inn") or "") if sibling else "")
                npd_ver = bool(own.get("npd_verified", False)) if own else (bool(sibling.get("npd_verified", False)) if sibling else False)
                npd_at = own.get("npd_checked_at") if own else (sibling.get("npd_checked_at") if sibling else None)

                is_published = (
                    norm["published"]
                    if norm["has_published"]
                    else (bool(own.get("is_published", True)) if own else True)
                )
                min_fair = (
                    norm["min_fair"]
                    if norm["min_fair"] is not None
                    else (int(own.get("min_fair_rub") or 0) if own else 0)
                )
                custom_badges = (
                    norm["custom_badges"]
                    if "customBadges" in payload
                    else (clean_custom_badges(own.get("custom_badges_json")) if own else [])
                )

                row = conn.execute(
                    """
                    INSERT INTO oltp.tutors (
                        id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                        source_channel, tariff_id, whatsapp_phone, telegram_handle, max_handle,
                        has_photo, verified, bumped_today, rating, reviews_count,
                        photo_url, headline, bio, education, exp_years, avg_score,
                        subjects_json, exams_json, formats_json, custom_skills, first_lesson_guarantee, slots_json,
                        inn, npd_verified, npd_checked_at,
                        is_published, custom_badges_json, min_fair_rub
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, 'platform', %s, %s, %s, %s,
                        %s, %s, %s, 4.90, 12, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                        %s, %s, %s, %s, %s, %s
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        user_id = EXCLUDED.user_id,
                        full_name = EXCLUDED.full_name,
                        subject = EXCLUDED.subject,
                        city = EXCLUDED.city,
                        timezone = EXCLUDED.timezone,
                        base_rate_rub = EXCLUDED.base_rate_rub,
                        market_rate_rub = EXCLUDED.market_rate_rub,
                        whatsapp_phone = EXCLUDED.whatsapp_phone,
                        telegram_handle = EXCLUDED.telegram_handle,
                        max_handle = EXCLUDED.max_handle,
                        has_photo = EXCLUDED.has_photo,
                        updated_at = NOW(),
                        photo_url = EXCLUDED.photo_url,
                        headline = EXCLUDED.headline,
                        bio = EXCLUDED.bio,
                        education = EXCLUDED.education,
                        exp_years = EXCLUDED.exp_years,
                        avg_score = EXCLUDED.avg_score,
                        subjects_json = EXCLUDED.subjects_json,
                        exams_json = EXCLUDED.exams_json,
                        formats_json = EXCLUDED.formats_json,
                        custom_skills = EXCLUDED.custom_skills,
                        first_lesson_guarantee = EXCLUDED.first_lesson_guarantee,
                        slots_json = EXCLUDED.slots_json,
                        is_published = EXCLUDED.is_published,
                        custom_badges_json = EXCLUDED.custom_badges_json,
                        min_fair_rub = EXCLUDED.min_fair_rub
                    RETURNING *
                    """,
                    (
                        tid,
                        uid,
                        norm["full_name"],
                        norm["subject_label"],
                        norm["norm_city"],
                        norm["norm_tz"],
                        norm["base_rate"],
                        norm["market_rate"],
                        tariff_id,
                        str(payload.get("whatsapp") or "").strip()[:32],
                        str(payload.get("telegram") or "").strip()[:64],
                        str(payload.get("maxHandle") or "").strip()[:64],
                        has_photo,
                        verified,
                        bumped_today,
                        photo_url,
                        str(payload.get("headline") or "").strip()[:120],
                        str(payload.get("bio") or "").strip()[:600],
                        str(payload.get("education") or "").strip()[:120],
                        max(1, min(60, int(payload.get("expYears") or 3))),
                        max(40, min(100, int(payload.get("avgScore") or 85))),
                        Jsonb(norm["clean_subjects"]),
                        Jsonb(norm["exams"]),
                        Jsonb(norm["formats"]),
                        str(payload.get("customSkills") or "").strip()[:240],
                        bool(payload.get("firstLessonGuarantee", True)),
                        Jsonb(norm["clean_slots"]),
                        inn_val,
                        npd_ver,
                        npd_at,
                        is_published,
                        Jsonb(custom_badges),
                        min_fair,
                    ),
                ).fetchone()
                if norm["clean_slots"]:
                    conn.execute("DELETE FROM oltp.tutor_slots WHERE tutor_id = %s AND is_booked = FALSE", (tid,))
                    for dow_str, hrs in norm["clean_slots"].items():
                        for h in hrs:
                            conn.execute(
                                """
                                INSERT INTO oltp.tutor_slots (tutor_id, weekday, hour_slot, is_booked)
                                VALUES (%s, %s, %s, FALSE)
                                ON CONFLICT (tutor_id, weekday, hour_slot) DO NOTHING
                                """,
                                (tid, int(dow_str), h),
                            )
                conn.execute("UPDATE oltp.users SET role = 'tutor' WHERE id = %s AND role = 'student'", (uid,))
                self._insert_outbox(
                    conn,
                    topic="vektor.tutors.raw.v1",
                    partition_key=tid,
                    event_type="tutor.profile.updated",
                    user_id=uid,
                    role="tutor",
                    view="cabinet",
                    payload={"tutorId": tid, "city": norm["norm_city"], "price": norm["base_rate"], "published": is_published},
                )
                return {"tutor": self._pg_tutor_to_public_dict(row), "slots": norm["clean_slots"]}

    def set_tutor_profile_published(
        self,
        user_id: int,
        tutor_id: str,
        published: bool,
        *,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        uid = int(user_id)
        tid = str(tutor_id or "").strip()[:64]
        if not tid:
            raise StorageError("not_found", "Профиль для поиска не найден.", 404)
        pub_bool = bool(published)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (tid,)).fetchone()
                if not row:
                    raise StorageError("not_found", "Профиль для поиска не найден.", 404)
                if row.get("user_id") is not None and int(row["user_id"]) != uid and actor_role != "admin":
                    raise StorageError("forbidden", "Нет прав на управление чужой анкетой.", 403)
                updated = conn.execute(
                    "UPDATE oltp.tutors SET is_published = %s, updated_at = NOW() WHERE id = %s RETURNING *",
                    (pub_bool, tid),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.tutors.raw.v1",
                    partition_key=tid,
                    event_type="tutor.profile.visibility",
                    user_id=uid,
                    role="tutor",
                    view="cabinet",
                    payload={"tutorId": tid, "published": pub_bool},
                )
                return {"tutor": self._pg_tutor_to_public_dict(updated)}

    def delete_tutor_profile(
        self,
        user_id: int,
        tutor_id: str,
        *,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        uid = int(user_id)
        tid = str(tutor_id or "").strip()[:64]
        if not tid:
            raise StorageError("not_found", "Профиль для поиска не найден.", 404)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (tid,)).fetchone()
                if not row:
                    raise StorageError("not_found", "Профиль для поиска не найден.", 404)
                if row.get("user_id") is not None and int(row["user_id"]) != uid and actor_role != "admin":
                    raise StorageError("forbidden", "Нет прав на удаление чужой анкеты.", 403)
                has_deps = False
                for tbl in (
                    "oltp.lesson_requests",
                    "oltp.escrow_holds",
                    "oltp.payout_requests",
                    "oltp.tutor_reviews",
                    "oltp.npd_receipts",
                ):
                    cnt = conn.execute(f"SELECT COUNT(*) AS cnt FROM {tbl} WHERE tutor_id = %s", (tid,)).fetchone()
                    if cnt and int(cnt["cnt"]) > 0:
                        has_deps = True
                        break
                if has_deps:
                    updated = conn.execute(
                        "UPDATE oltp.tutors SET is_published = FALSE, updated_at = NOW() WHERE id = %s RETURNING *",
                        (tid,),
                    ).fetchone()
                    self._insert_outbox(
                        conn,
                        topic="vektor.tutors.raw.v1",
                        partition_key=tid,
                        event_type="tutor.profile.archived",
                        user_id=uid,
                        role="tutor",
                        view="cabinet",
                        payload={"tutorId": tid},
                    )
                    return {
                        "deleted": False,
                        "archived": True,
                        "tutorId": tid,
                        "tutor": self._pg_tutor_to_public_dict(updated),
                    }
                conn.execute("DELETE FROM oltp.tutor_contact_overrides WHERE tutor_id = %s", (tid,))
                conn.execute("DELETE FROM oltp.tutors WHERE id = %s", (tid,))
                self._insert_outbox(
                    conn,
                    topic="vektor.tutors.raw.v1",
                    partition_key=tid,
                    event_type="tutor.profile.deleted",
                    user_id=uid,
                    role="tutor",
                    view="cabinet",
                    payload={"tutorId": tid},
                )
                return {"deleted": True, "archived": False, "tutorId": tid}

    def update_tutor_account(self, user_id: int, payload: dict[str, Any]) -> dict[str, Any]:
        uid = int(user_id)
        name_raw = str(payload.get("name") or payload.get("displayName") or "").strip()[:80]
        clean_name = validate_display_name(name_raw)
        if len(clean_name) < 2:
            raise StorageError("invalid_name", "Укажите имя и фамилию преподавателя (минимум 2 символа).", 400)
        norm_city, norm_tz = normalize_city_tz(payload.get("city"), payload.get("timezone"))
        has_photo = payload.get("hasPhoto") is not False and bool(
            str(payload.get("photo") or payload.get("photoUrl") or "").strip()
        )
        photo_url = (
            str(payload.get("photo") or payload.get("photoUrl") or "").strip()[:220_000]
            if has_photo
            else ""
        )
        whatsapp = str(payload.get("whatsapp") or payload.get("whatsappPhone") or "").strip()[:32]
        telegram = str(payload.get("telegram") or payload.get("telegramHandle") or "").strip()[:64]
        max_handle = str(payload.get("maxHandle") or "").strip()[:64]
        vk = str(payload.get("vk") or "").strip()[:120]
        doc_patch = {
            "name": clean_name,
            "city": norm_city,
            "timezone": norm_tz,
            "photo": photo_url,
            "hasPhoto": bool(has_photo),
            "whatsapp": whatsapp,
            "telegram": telegram,
            "maxHandle": max_handle,
            "vk": vk,
        }
        topic, role, view = _doc_outbox_meta("profile")
        with self._pool.connection() as conn:
            with conn.transaction():
                u_row = conn.execute("SELECT * FROM oltp.users WHERE id = %s FOR UPDATE", (uid,)).fetchone()
                if not u_row:
                    raise StorageError("not_found", "Пользователь не найден.", 404)
                d_row = conn.execute(
                    "SELECT data FROM oltp.docs WHERE user_id = %s AND name = 'profile' FOR UPDATE",
                    (uid,),
                ).fetchone()
                current_doc = d_row["data"] if d_row and isinstance(d_row.get("data"), dict) else {}
                merged_doc = deep_merge(current_doc, doc_patch)
                conn.execute(
                    """
                    INSERT INTO oltp.docs (user_id, name, data, updated_at)
                    VALUES (%s, 'profile', %s, NOW())
                    ON CONFLICT (user_id, name) DO UPDATE SET
                        data = EXCLUDED.data,
                        updated_at = NOW()
                    """,
                    (uid, Jsonb(merged_doc)),
                )
                u_updated = conn.execute(
                    """
                    UPDATE oltp.users
                    SET display_name = %s,
                        city = %s,
                        avatar_url = %s,
                        role = CASE WHEN role = 'student' THEN 'tutor' ELSE role END,
                        updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, username, display_name, email, avatar_url, auth_provider, role
                    """,
                    (clean_name, norm_city, photo_url or None, uid),
                ).fetchone()
                conn.execute(
                    """
                    UPDATE oltp.tutors
                    SET full_name = %s,
                        city = %s,
                        timezone = %s,
                        whatsapp_phone = %s,
                        telegram_handle = %s,
                        max_handle = %s,
                        has_photo = %s,
                        photo_url = %s,
                        updated_at = NOW()
                    WHERE user_id = %s
                    """,
                    (
                        clean_name,
                        norm_city,
                        norm_tz,
                        whatsapp,
                        telegram,
                        max_handle,
                        bool(has_photo),
                        photo_url,
                        uid,
                    ),
                )
                self._insert_outbox(
                    conn,
                    topic=topic,
                    partition_key=str(uid),
                    event_type="tutor.account.updated",
                    user_id=uid,
                    role="tutor",
                    view="cabinet",
                    payload={"city": norm_city},
                )
                t_rows = conn.execute(
                    """
                    SELECT * FROM oltp.tutors
                    WHERE user_id = %s
                    ORDER BY COALESCE(is_published, TRUE) DESC, updated_at DESC, id ASC
                    """,
                    (uid,),
                ).fetchall()
                return {
                    "userObj": _row_to_user(u_updated),
                    "account": merged_doc,
                    "profiles": [self._pg_tutor_to_public_dict(r) for r in t_rows],
                }

    def bump_tutor(self, user_id: int, *, actor_role: str = "student", tutor_id: str | None = None) -> dict[str, Any]:
        uid = int(user_id)
        with self._pool.connection() as conn:
            with conn.transaction():
                row = None
                if tutor_id:
                    row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (tutor_id.strip(),)).fetchone()
                    if row and row.get("user_id") is not None and int(row["user_id"]) != uid and actor_role != "admin":
                        raise StorageError("forbidden", "Нет прав на поднятие чужой анкеты.", 403)
                if row is None:
                    row = conn.execute(
                        "SELECT * FROM oltp.tutors WHERE user_id = %s ORDER BY COALESCE(is_published, TRUE) DESC, updated_at DESC, id ASC LIMIT 1 FOR UPDATE",
                        (uid,),
                    ).fetchone()
                if not row:
                    raise StorageError("not_found", "Сначала сохраните анкету преподавателя.", 404)
                last_dt = row.get("last_bumped_at")
                if bool(row.get("bumped_today")) and isinstance(last_dt, datetime):
                    elapsed = (_utc_now() - last_dt.astimezone(timezone.utc)).total_seconds()
                    if 0 <= elapsed < 14400:
                        rem = int(14400 - elapsed)
                        mins = max(1, (rem + 59) // 60)
                        raise StorageError(
                            "bump_cooldown",
                            f"Поднятие анкеты доступно раз в 4 часа. Осталось ~{mins} мин.",
                            429,
                        )
                tid = str(row["id"])
                updated = conn.execute(
                    """
                    UPDATE oltp.tutors
                    SET bumped_today = TRUE, last_bumped_at = NOW(), updated_at = NOW()
                    WHERE id = %s
                    RETURNING *
                    """,
                    (tid,),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=tid,
                    event_type="tutor.bumped",
                    user_id=uid,
                    role="tutor",
                    view="cabinet",
                    payload={"tutorId": tid},
                )
                return self._pg_tutor_to_public_dict(updated)

    @staticmethod
    def _pg_booking_row_to_dict(r: dict[str, Any]) -> dict[str, Any]:
        raw_status = str(r.get("status") or "offered")
        eff_price = int(r.get("final_price_rub") or r.get("counter_price_rub") or r.get("offer_price_rub") or 0)
        fee, payout = calc_fee_split(eff_price)
        sbp_fee = calc_sbp_fee(eff_price)
        sd = r.get("slot_date")
        slot_date = sd.isoformat()[:10] if hasattr(sd, "isoformat") else str(sd or "")[:10]
        dows = sort_dows(r.get("dows") if isinstance(r.get("dows"), list) else [])
        schedule_plan = r.get("schedule_plan") if isinstance(r.get("schedule_plan"), dict) else None
        return {
            "id": str(r["id"]),
            "tutorId": str(r["tutor_id"]),
            "tutorName": str(r.get("tutor_name") or ""),
            "studentUserId": int(r["student_user_id"]) if r.get("student_user_id") is not None else None,
            "studentName": str(r.get("student_name") or "Ученик"),
            "subject": str(r.get("subject") or "Подготовка"),
            "subjectName": str(r.get("subject") or "Подготовка"),
            "exam": str(r.get("exam") or "ЕГЭ"),
            "format": str(r.get("format") or "Онлайн"),
            "city": str(r.get("city") or "Якутск"),
            "timezone": _normalize_tz(r.get("timezone")),
            "dayIso": slot_date,
            "slotDate": slot_date,
            "dow": dows[0] if dows else _normalize_dow(None, slot_date),
            "dows": dows,
            "dayLabel": str(r.get("day_label") or "") or (format_days_short(dows) if dows else slot_date),
            "hour": str(r.get("hour_slot") or "16:00"),
            "tariffId": str(r.get("tariff_id") or "trial5k"),
            "offerPrice": int(r.get("offer_price_rub") or 0),
            "counterPrice": int(r["counter_price_rub"]) if r.get("counter_price_rub") is not None else None,
            "finalPrice": int(r["final_price_rub"]) if r.get("final_price_rub") is not None else None,
            "tutorPrice": int(r["tutor_price_rub"]) if r.get("tutor_price_rub") is not None else int(r.get("offer_price_rub") or 0),
            "reserved": int(r.get("reserved_rub") or 0),
            "firstLessonGuarantee": bool(r.get("first_lesson_guarantee", True)),
            "fee": fee,
            "sbpFee": sbp_fee,
            "payout": payout,
            "note": str(r.get("note") or ""),
            "telemostUrl": str(r.get("telemost_url") or ""),
            "schedulePlan": schedule_plan,
            "status": _PG_TO_MKT_STATUS.get(raw_status, raw_status),
            "rawStatus": raw_status,
            "escrowStatus": str(r.get("escrow_status") or "none"),
            "messengerChannel": str(r.get("messenger_channel") or "whatsapp"),
            "createdAt": _iso_utc(r.get("created_at")),
            "updatedAt": _iso_utc(r.get("updated_at")),
        }

    def list_bookings(
        self,
        user_id: int,
        *,
        scope: str = "student",
        tutor_id: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        uid = int(user_id)
        lim = max(1, min(int(limit or 100), 300))
        with self._pool.connection() as conn:
            if scope == "tutor":
                tid = (tutor_id or "").strip()
                if tid:
                    rows = conn.execute(
                        """
                        SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                        FROM oltp.lesson_requests lr
                        JOIN oltp.tutors t ON t.id = lr.tutor_id
                        LEFT JOIN LATERAL (
                            SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                        ) eh ON TRUE
                        WHERE lr.tutor_id = %s AND (t.user_id = %s OR t.user_id IS NULL)
                        ORDER BY lr.updated_at DESC, lr.id DESC LIMIT %s
                        """,
                        (tid, uid, lim),
                    ).fetchall()
                else:
                    rows = conn.execute(
                        """
                        SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                        FROM oltp.lesson_requests lr
                        JOIN oltp.tutors t ON t.id = lr.tutor_id
                        LEFT JOIN LATERAL (
                            SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                        ) eh ON TRUE
                        WHERE t.user_id = %s
                        ORDER BY lr.updated_at DESC, lr.id DESC LIMIT %s
                        """,
                        (uid, lim),
                    ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.student_user_id = %s
                    ORDER BY lr.updated_at DESC, lr.id DESC LIMIT %s
                    """,
                    (uid, lim),
                ).fetchall()
        return [self._pg_booking_row_to_dict(r) for r in rows]

    def create_booking(
        self,
        user_id: int,
        payload: dict[str, Any],
        *,
        booking_id: str | None = None,
    ) -> dict[str, Any]:
        uid = int(user_id)
        tutor_id = str(payload.get("tutorId") or "").strip()[:64]
        if not tutor_id:
            raise StorageError("invalid_tutor", "Не указан преподаватель (tutorId).", 400)
        offer_price = int(payload.get("offerPrice") if payload.get("offerPrice") is not None else 0)
        if offer_price < 0 or offer_price > 99999:
            raise StorageError("invalid_price", "Ставка должна быть от 0 до 99 999 ₽.", 400)
        hour_slot = validate_hour_slot(str(payload.get("hour") or "16:00"))
        raw_date = str(payload.get("dayIso") or payload.get("slotDate") or "").strip()[:10]
        if not raw_date:
            raw_date = _utc_now().strftime("%Y-%m-%d")
        try:
            datetime.strptime(raw_date, "%Y-%m-%d")
        except ValueError as exc:
            raise StorageError("invalid_date", "Ожидалась дата в формате ГГГГ-ММ-ДД.", 400) from exc

        bid = str(booking_id or f"bk-{secrets.token_hex(6)}").strip()[:64]
        with self._pool.connection() as conn:
            with conn.transaction():
                conn.execute(
                    """
                    INSERT INTO oltp.wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards)
                    VALUES (%s, 0, FALSE, 'trial5k', '[]'::jsonb)
                    ON CONFLICT (user_id) DO NOTHING
                    """,
                    (uid,),
                )
                w = conn.execute("SELECT * FROM oltp.wallets WHERE user_id = %s FOR UPDATE", (uid,)).fetchone()
                cur_bal = int(w["balance_rub"])
                if offer_price > 0 and cur_bal < offer_price:
                    raise StorageError(
                        "insufficient_balance",
                        f"Недостаточно средств на балансе: нужно {offer_price} ₽, доступно {cur_bal} ₽.",
                        402,
                    )
                u_row = conn.execute(
                    "SELECT username, display_name, city FROM oltp.users WHERE id = %s",
                    (uid,),
                ).fetchone()
                student_name = str(
                    payload.get("studentName")
                    or (u_row["display_name"] if u_row else "")
                    or (u_row["username"] if u_row else "")
                    or "Ученик"
                ).strip()[:64]
                tutor_row = self._pg_ensure_tutor_exists(
                    conn,
                    tutor_id,
                    tutor_name=str(payload.get("tutorName") or "Преподаватель Вектор"),
                    subject=str(payload.get("subjectName") or payload.get("subject") or "Подготовка"),
                    city=payload.get("city") or (u_row.get("city") if u_row else None),
                    timezone_str=payload.get("timezone"),
                    base_rate_rub=int(payload.get("tutorPrice") or offer_price or 1200),
                )
                tutor_name = str(tutor_row["full_name"])
                city = str(payload.get("city") or tutor_row["city"] or "Якутск").strip()[:48] or "Якутск"
                tz = _normalize_tz(payload.get("timezone") or tutor_row["timezone"])
                subj = str(payload.get("subjectName") or payload.get("subject") or tutor_row["subject"] or "Подготовка").strip()[:64]
                exam = str(payload.get("exam") or "ЕГЭ").strip()[:32]
                fmt = str(payload.get("format") or "Онлайн").strip()[:32]
                day_label = str(payload.get("dayLabel") or raw_date).strip()[:32]
                note = str(payload.get("note") or "").strip()[:500]
                tutor_price = int(payload.get("tutorPrice") or tutor_row["base_rate_rub"] or offer_price)
                tariff_id = str(payload.get("tariffId") or w.get("plan_id") or "trial5k")
                if tariff_id not in ("free", "trial5k", "month10k"):
                    tariff_id = "trial5k"
                dow = _normalize_dow(payload.get("dow"), raw_date)

                raw_tm = str(payload.get("telemostUrl") or "").strip()
                if raw_tm:
                    telemost_url = validate_telemost_url(raw_tm)
                else:
                    existing_tm = conn.execute(
                        """
                        SELECT telemost_url FROM oltp.lesson_requests
                        WHERE student_user_id = %s AND telemost_url <> ''
                        ORDER BY updated_at DESC, id DESC
                        LIMIT 1
                        """,
                        (uid,),
                    ).fetchone()
                    telemost_url = (
                        str(existing_tm["telemost_url"])
                        if existing_tm and str(existing_tm.get("telemost_url") or "").strip()
                        else generate_telemost_url()
                    )

                reserved = offer_price if offer_price > 0 else 0
                if reserved > 0:
                    new_bal = cur_bal - reserved
                    conn.execute(
                        "UPDATE oltp.wallets SET balance_rub = %s, updated_at = NOW() WHERE user_id = %s",
                        (new_bal, uid),
                    )
                    conn.execute(
                        """
                        INSERT INTO oltp.wallet_ledger (
                            user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                        ) VALUES (%s, 'escrow_freeze', %s, %s, 0, 'escrow', 'booking', %s, %s)
                        """,
                        (uid, -reserved, new_bal, bid, f"Заморозка по заявке к {tutor_name}"),
                    )

                conn.execute(
                    """
                    INSERT INTO oltp.lesson_requests (
                        id, tutor_id, student_user_id, student_name, subject, city, timezone,
                        slot_date, hour_slot, tariff_id, offer_price_rub, status, messenger_channel,
                        exam, format, note, telemost_url, dows, day_label, tutor_price_rub,
                        first_lesson_guarantee, reserved_rub
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'offered', 'whatsapp', %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        bid,
                        tutor_id,
                        uid,
                        student_name,
                        subj,
                        city,
                        tz,
                        raw_date,
                        hour_slot,
                        tariff_id,
                        offer_price,
                        exam,
                        fmt,
                        note,
                        telemost_url,
                        Jsonb([dow]),
                        day_label,
                        tutor_price,
                        bool(payload.get("firstLessonGuarantee", True)),
                        reserved,
                    ),
                )
                if reserved > 0:
                    fee, payout = calc_fee_split(reserved)
                    conn.execute(
                        """
                        INSERT INTO oltp.escrow_holds (
                            id, request_id, tutor_id, student_user_id, gross_rub,
                            platform_fee_rub, tutor_payout_rub, status
                        ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'frozen')
                        """,
                        (f"esc-{bid}", bid, tutor_id, uid, reserved, fee, payout),
                    )
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=bid,
                    event_type="market.bid.created",
                    user_id=uid,
                    role="student",
                    view="market",
                    payload={"bookingId": bid, "tutorId": tutor_id, "offerPrice": offer_price, "reserved": reserved},
                )
                row = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.id = %s
                    """,
                    (bid,),
                ).fetchone()
                return {"booking": self._pg_booking_row_to_dict(row), "wallet": self._pg_wallet_snapshot(conn, uid)}

    def _pg_load_authorized_booking(
        self,
        conn: psycopg.Connection[Any],
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
    ) -> tuple[dict[str, Any], bool, bool]:
        bid = str(booking_id or "").strip()
        row = conn.execute(
            """
            SELECT lr.*, t.user_id AS tutor_owner_uid, COALESCE(t.full_name, '') AS tutor_name
            FROM oltp.lesson_requests lr
            LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
            WHERE lr.id = %s
            FOR UPDATE OF lr
            """,
            (bid,),
        ).fetchone()
        if not row:
            raise StorageError("not_found", "Заявка не найдена.", 404)
        uid = int(actor_user_id)
        is_admin = (actor_role or "").strip().lower() == "admin"
        is_student = row.get("student_user_id") is not None and int(row["student_user_id"]) == uid
        is_tutor = row.get("tutor_owner_uid") is not None and int(row["tutor_owner_uid"]) == uid
        if not (is_admin or is_student or is_tutor):
            raise StorageError("forbidden", "Нет доступа к этой заявке.", 403)
        return row, is_student, is_tutor

    def _pg_upsert_escrow(
        self,
        conn: psycopg.Connection[Any],
        *,
        booking_id: str,
        tutor_id: str,
        student_uid: int | None,
        gross_rub: int,
        status: str,
    ) -> None:
        if gross_rub <= 0:
            return
        fee, payout = calc_fee_split(gross_rub)
        existing = conn.execute(
            "SELECT id FROM oltp.escrow_holds WHERE request_id = %s LIMIT 1",
            (booking_id,),
        ).fetchone()
        settled_expr = "NOW()" if status in ("captured", "refunded") else "NULL"
        if existing:
            conn.execute(
                f"""
                UPDATE oltp.escrow_holds
                SET gross_rub = %s,
                    platform_fee_rub = %s,
                    tutor_payout_rub = %s,
                    status = %s,
                    settled_at = {settled_expr}
                WHERE id = %s
                """,
                (gross_rub, fee, payout, status, existing["id"]),
            )
        else:
            conn.execute(
                f"""
                INSERT INTO oltp.escrow_holds (
                    id, request_id, tutor_id, student_user_id, gross_rub,
                    platform_fee_rub, tutor_payout_rub, status, settled_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, {settled_expr})
                """,
                (f"esc-{booking_id}", booking_id, tutor_id, student_uid, gross_rub, fee, payout, status),
            )

    def transition_booking(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        action: str,
        counter_price_rub: int | None = None,
        allow_student_demo_accept: bool = True,
    ) -> dict[str, Any]:
        act = (action or "").strip().lower()
        if act not in ("accept", "counter", "cancel", "decline", "complete"):
            raise StorageError("invalid_action", "Недопустимое действие над заявкой.", 400)
        with self._pool.connection() as conn:
            with conn.transaction():
                row, is_student, is_tutor = self._pg_load_authorized_booking(
                    conn, booking_id, actor_user_id=actor_user_id, actor_role=actor_role
                )
                bid = str(row["id"])
                is_admin = (actor_role or "").strip().lower() == "admin"
                cur_raw = str(row.get("status") or "offered")
                cur_norm = _PG_TO_MKT_STATUS.get(cur_raw, cur_raw)
                if cur_norm in ("cancelled", "declined", "refunded", "completed"):
                    raise StorageError("invalid_transition", f"Заявка уже в финальном статусе ({cur_norm}).", 409)
                tutor_owned = row.get("tutor_owner_uid") is not None
                if act in ("counter", "decline") and tutor_owned and not (is_tutor or is_admin):
                    raise StorageError("forbidden", "Только преподаватель может изменить или отклонить ставку.", 403)
                if act == "accept" and cur_norm == "pending" and (tutor_owned or not allow_student_demo_accept) and not (is_tutor or is_admin):
                    raise StorageError("forbidden", "Подтвердить новую ставку должен преподаватель.", 403)

                student_uid = int(row["student_user_id"]) if row.get("student_user_id") is not None else None
                cur_reserved = int(row.get("reserved_rub") or 0)
                tutor_id = str(row["tutor_id"])

                if act == "counter":
                    if cur_norm not in ("pending", "countered"):
                        raise StorageError("invalid_transition", "Нельзя предложить контр-цену для текущей заявки.", 409)
                    cp = int(counter_price_rub or 0)
                    if cp <= 0 or cp > 99999:
                        raise StorageError("invalid_price", "Укажите корректную контр-цену от 1 до 99 999 ₽.", 400)
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = 'countered', counter_price_rub = %s, updated_at = NOW() WHERE id = %s",
                        (cp, bid),
                    )
                    self._insert_outbox(
                        conn,
                        topic="vektor.market.bids.v1",
                        partition_key=bid,
                        event_type="market.bid.countered",
                        user_id=int(actor_user_id),
                        role="tutor" if is_tutor else "student",
                        view="cabinet",
                        payload={"bookingId": bid, "counterPrice": cp},
                    )

                elif act == "accept":
                    if cur_norm not in ("pending", "countered"):
                        raise StorageError("invalid_transition", "Заявка уже подтверждена.", 409)
                    eff_price = int(counter_price_rub or row.get("counter_price_rub") or row.get("offer_price_rub") or 0)
                    new_reserved = cur_reserved
                    if student_uid is not None and eff_price >= 0:
                        delta = eff_price - cur_reserved
                        w_snap = self._pg_wallet_snapshot(conn, student_uid)
                        bal = int(w_snap["balanceRub"])
                        if delta > 0:
                            if bal < delta:
                                raise StorageError(
                                    "insufficient_balance",
                                    f"Недостаточно средств для доплаты ({delta} ₽).",
                                    402,
                                )
                            new_bal = bal - delta
                            conn.execute(
                                "UPDATE oltp.wallets SET balance_rub = %s, updated_at = NOW() WHERE user_id = %s",
                                (new_bal, student_uid),
                            )
                            conn.execute(
                                """
                                INSERT INTO oltp.wallet_ledger (
                                    user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                                ) VALUES (%s, 'escrow_freeze', %s, %s, 0, 'escrow', 'booking', %s, %s)
                                """,
                                (student_uid, -delta, new_bal, bid, f"Корректировка резерва по {bid}"),
                            )
                        elif delta < 0:
                            refund = -delta
                            new_bal = bal + refund
                            conn.execute(
                                "UPDATE oltp.wallets SET balance_rub = %s, updated_at = NOW() WHERE user_id = %s",
                                (new_bal, student_uid),
                            )
                            conn.execute(
                                """
                                INSERT INTO oltp.wallet_ledger (
                                    user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                                ) VALUES (%s, 'escrow_refund', %s, %s, 0, 'escrow', 'booking', %s, %s)
                                """,
                                (student_uid, refund, new_bal, bid, f"Частичный возврат резерва по {bid}"),
                            )
                        new_reserved = eff_price

                    if eff_price > 0:
                        self._pg_upsert_escrow(
                            conn, booking_id=bid, tutor_id=tutor_id, student_uid=student_uid, gross_rub=eff_price, status="frozen"
                        )
                    conn.execute(
                        """
                        UPDATE oltp.lesson_requests
                        SET status = 'accepted',
                            counter_price_rub = COALESCE(%s, counter_price_rub),
                            final_price_rub = %s,
                            reserved_rub = %s,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (eff_price if counter_price_rub else None, eff_price if eff_price > 0 else None, new_reserved, bid),
                    )
                    self._insert_outbox(
                        conn,
                        topic="vektor.market.bids.v1",
                        partition_key=bid,
                        event_type="market.bid.accepted",
                        user_id=int(actor_user_id),
                        role="tutor" if is_tutor else "student",
                        view="cabinet",
                        payload={"bookingId": bid, "finalPriceRub": eff_price},
                    )

                elif act in ("cancel", "decline"):
                    if student_uid is not None and cur_reserved > 0:
                        w_snap = self._pg_wallet_snapshot(conn, student_uid)
                        new_bal = int(w_snap["balanceRub"]) + cur_reserved
                        conn.execute(
                            "UPDATE oltp.wallets SET balance_rub = %s, updated_at = NOW() WHERE user_id = %s",
                            (new_bal, student_uid),
                        )
                        conn.execute(
                            """
                            INSERT INTO oltp.wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                            ) VALUES (%s, 'escrow_refund', %s, %s, 0, 'escrow', 'booking', %s, %s)
                            """,
                            (student_uid, cur_reserved, new_bal, bid, f"Возврат при отмене заявки {bid}"),
                        )
                    conn.execute(
                        "UPDATE oltp.escrow_holds SET status = 'refunded', settled_at = NOW() WHERE request_id = %s",
                        (bid,),
                    )
                    next_status = "declined" if act == "decline" else "cancelled"
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = %s, reserved_rub = 0, updated_at = NOW() WHERE id = %s",
                        (next_status, bid),
                    )
                    self._insert_outbox(
                        conn,
                        topic="vektor.payments.ledger.v1",
                        partition_key=bid,
                        event_type=f"market.bid.{next_status}",
                        user_id=int(actor_user_id),
                        role="tutor" if is_tutor else "student",
                        view="market",
                        payload={"bookingId": bid, "refundedRub": cur_reserved},
                    )

                elif act == "complete":
                    if cur_norm != "accepted":
                        raise StorageError("invalid_transition", "Завершить можно только подтверждённое занятие.", 409)
                    eff_price = int(row.get("final_price_rub") or row.get("counter_price_rub") or row.get("offer_price_rub") or 0)
                    if eff_price > 0:
                        self._pg_upsert_escrow(
                            conn, booking_id=bid, tutor_id=tutor_id, student_uid=student_uid, gross_rub=eff_price, status="captured"
                        )
                        if student_uid is not None and cur_reserved > 0:
                            fee, _ = calc_fee_split(eff_price)
                            w_snap = self._pg_wallet_snapshot(conn, student_uid)
                            conn.execute(
                                """
                                INSERT INTO oltp.wallet_ledger (
                                    user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                                ) VALUES (%s, 'escrow_capture', 0, %s, %s, 'escrow', 'booking', %s, %s)
                                """,
                                (student_uid, int(w_snap["balanceRub"]), fee, bid, f"Урок проведён: списано {eff_price} ₽"),
                            )
                    conn.execute(
                        """
                        UPDATE oltp.lesson_requests
                        SET status = 'completed',
                            final_price_rub = COALESCE(final_price_rub, %s),
                            reserved_rub = 0,
                            updated_at = NOW()
                        WHERE id = %s
                        """,
                        (eff_price if eff_price > 0 else None, bid),
                    )
                    self._insert_outbox(
                        conn,
                        topic="vektor.payments.ledger.v1",
                        partition_key=bid,
                        event_type="market.lesson.completed",
                        user_id=int(actor_user_id),
                        role="tutor" if is_tutor else "student",
                        view="study",
                        payload={"bookingId": bid, "grossRub": eff_price},
                    )

                updated = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.id = %s
                    """,
                    (bid,),
                ).fetchone()
                wallet_uid = student_uid if student_uid is not None else int(actor_user_id)
                return {"booking": self._pg_booking_row_to_dict(updated), "wallet": self._pg_wallet_snapshot(conn, wallet_uid)}

    def update_booking_schedule(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        schedule_plan: dict[str, Any],
    ) -> dict[str, Any]:
        clean_plan = validate_schedule_plan(schedule_plan)
        assert clean_plan is not None
        with self._pool.connection() as conn:
            with conn.transaction():
                row, is_student, is_tutor = self._pg_load_authorized_booking(
                    conn, booking_id, actor_user_id=actor_user_id, actor_role=actor_role
                )
                cur_norm = _PG_TO_MKT_STATUS.get(str(row.get("status") or "offered"), "pending")
                if cur_norm in ("cancelled", "declined", "refunded"):
                    raise StorageError("invalid_transition", "Нельзя изменить график отменённой заявки.", 409)
                bid = str(row["id"])
                dows = clean_plan["dows"]
                hour = clean_plan["hour"]
                day_label = format_days_short(dows)
                conn.execute(
                    """
                    UPDATE oltp.lesson_requests
                    SET schedule_plan = %s, dows = %s, hour_slot = %s, day_label = %s, updated_at = NOW()
                    WHERE id = %s
                    """,
                    (Jsonb(clean_plan), Jsonb(dows), hour, day_label, bid),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=bid,
                    event_type="market.schedule.updated",
                    user_id=int(actor_user_id),
                    role="tutor" if is_tutor else "student",
                    view="study",
                    payload={"bookingId": bid, "schedulePlan": clean_plan},
                )
                updated = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.id = %s
                    """,
                    (bid,),
                ).fetchone()
                return self._pg_booking_row_to_dict(updated)

    def update_booking_telemost(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        telemost_url: str,
    ) -> dict[str, Any]:
        clean_url = validate_telemost_url(telemost_url)
        with self._pool.connection() as conn:
            with conn.transaction():
                row, is_student, _ = self._pg_load_authorized_booking(
                    conn, booking_id, actor_user_id=actor_user_id, actor_role=actor_role
                )
                bid = str(row["id"])
                stu_id = row.get("student_user_id")
                if is_student and clean_url and stu_id is not None:
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET telemost_url = %s, updated_at = NOW() WHERE student_user_id = %s OR id = %s",
                        (clean_url, int(stu_id), bid),
                    )
                else:
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET telemost_url = %s, updated_at = NOW() WHERE id = %s",
                        (clean_url, bid),
                    )
                updated = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.id = %s
                    """,
                    (bid,),
                ).fetchone()
                return self._pg_booking_row_to_dict(updated)

    @staticmethod
    def _pg_lead_to_dict(r: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(r["id"]),
            "studentUserId": int(r["student_user_id"]) if r.get("student_user_id") is not None else None,
            "studentName": str(r["student_name"]),
            "subjects": r.get("subjects") if isinstance(r.get("subjects"), list) else ["bio"],
            "exam": str(r["exam"]),
            "format": str(r["format"]),
            "targetPrice": int(r["target_price_rub"]),
            "whatsapp": str(r.get("whatsapp") or ""),
            "whatsappCountry": str(r.get("whatsapp_country") or "RU"),
            "comment": str(r.get("comment") or ""),
            "status": str(r["status"]),
            "createdAt": _iso_utc(r.get("created_at")),
            "updatedAt": _iso_utc(r.get("updated_at")),
        }

    def list_student_leads(
        self,
        *,
        subject: str | None = None,
        student_user_id: int | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 300))
        clauses = ["status <> 'closed'"]
        params: list[Any] = []
        if student_user_id is not None:
            clauses.append("student_user_id = %s")
            params.append(int(student_user_id))
        if subject and subject.strip().lower() not in ("", "all"):
            clauses.append("LOWER(subjects::text) LIKE %s")
            params.append(f"%{subject.strip().lower()}%")
        where = "WHERE " + " AND ".join(clauses)
        with self._pool.connection() as conn:
            rows = conn.execute(
                f"SELECT * FROM oltp.student_leads {where} ORDER BY created_at DESC, id DESC LIMIT %s",
                (*params, lim),
            ).fetchall()
        return [self._pg_lead_to_dict(r) for r in rows]

    def create_student_lead(
        self,
        student_user_id: int | None,
        payload: dict[str, Any],
        *,
        lead_id: str | None = None,
    ) -> dict[str, Any]:
        raw_subjs = payload.get("subjects")
        subjects = [str(s).strip()[:32] for s in raw_subjs if str(s).strip()][:8] if isinstance(raw_subjs, list) else []
        if not subjects:
            subjects = ["chem"]
        target_price = max(0, min(99999, int(payload.get("targetPrice") if payload.get("targetPrice") is not None else 1000)))
        lid = str(lead_id or f"lead-{secrets.token_hex(6)}").strip()[:64]
        with self._pool.connection() as conn:
            with conn.transaction():
                student_name = str(payload.get("studentName") or "").strip()[:64]
                if not student_name and student_user_id is not None:
                    u_row = conn.execute(
                        "SELECT display_name, username FROM oltp.users WHERE id = %s",
                        (int(student_user_id),),
                    ).fetchone()
                    if u_row:
                        student_name = str(u_row.get("display_name") or u_row["username"] or "")
                if not student_name:
                    student_name = "Ученик"
                row = conn.execute(
                    """
                    INSERT INTO oltp.student_leads (
                        id, student_user_id, student_name, subjects, exam, format,
                        target_price_rub, whatsapp, whatsapp_country, comment, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'open')
                    RETURNING *
                    """,
                    (
                        lid,
                        int(student_user_id) if student_user_id is not None else None,
                        student_name,
                        Jsonb(subjects),
                        str(payload.get("exam") or "ЕГЭ").strip()[:32],
                        str(payload.get("format") or "Онлайн").strip()[:32],
                        target_price,
                        str(payload.get("whatsapp") or "").strip()[:32],
                        str(payload.get("whatsappCountry") or "RU").strip().upper()[:12] or "RU",
                        str(payload.get("comment") or "").strip()[:500],
                    ),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=lid,
                    event_type="market.lead.created",
                    user_id=int(student_user_id) if student_user_id is not None else None,
                    role="student",
                    view="market",
                    payload={"leadId": lid, "subjects": subjects, "targetPrice": target_price},
                )
                return self._pg_lead_to_dict(row)

    def close_student_lead(
        self,
        lead_id: str,
        *,
        actor_user_id: int,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        lid = str(lead_id or "").strip()
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute("SELECT * FROM oltp.student_leads WHERE id = %s FOR UPDATE", (lid,)).fetchone()
                if not row:
                    raise StorageError("not_found", "Запрос не найден.", 404)
                is_admin = (actor_role or "").strip().lower() == "admin"
                is_owner = row.get("student_user_id") is not None and int(row["student_user_id"]) == int(actor_user_id)
                if not (is_admin or is_owner):
                    raise StorageError("forbidden", "Нет прав на закрытие этого запроса.", 403)
                updated = conn.execute(
                    "UPDATE oltp.student_leads SET status = 'closed', updated_at = NOW() WHERE id = %s RETURNING *",
                    (lid,),
                ).fetchone()
                return self._pg_lead_to_dict(updated)

    def list_tutor_contacts(self, user_id: int) -> dict[str, dict[str, str]]:
        uid = int(user_id)
        with self._pool.connection() as conn:
            rows = conn.execute(
                "SELECT tutor_id, whatsapp, telegram, max_handle FROM oltp.tutor_contact_overrides WHERE user_id = %s",
                (uid,),
            ).fetchall()
        return {
            str(r["tutor_id"]): {
                "whatsapp": str(r.get("whatsapp") or ""),
                "telegram": str(r.get("telegram") or ""),
                "maxHandle": str(r.get("max_handle") or ""),
            }
            for r in rows
        }

    def upsert_tutor_contact(
        self,
        user_id: int,
        tutor_id: str,
        *,
        whatsapp: str | None = None,
        telegram: str | None = None,
        max_handle: str | None = None,
    ) -> dict[str, str]:
        uid = int(user_id)
        tid = str(tutor_id or "").strip()[:64]
        if not tid:
            raise StorageError("invalid_tutor", "Не указан tutorId.", 400)
        with self._pool.connection() as conn:
            with conn.transaction():
                prev = conn.execute(
                    "SELECT whatsapp, telegram, max_handle FROM oltp.tutor_contact_overrides WHERE user_id = %s AND tutor_id = %s FOR UPDATE",
                    (uid, tid),
                ).fetchone()
                next_wa = str(whatsapp).strip()[:32] if whatsapp is not None else (str(prev["whatsapp"]) if prev else "")
                next_tg = str(telegram).strip()[:64] if telegram is not None else (str(prev["telegram"]) if prev else "")
                next_max = str(max_handle).strip()[:64] if max_handle is not None else (str(prev["max_handle"]) if prev else "")
                conn.execute(
                    """
                    INSERT INTO oltp.tutor_contact_overrides (user_id, tutor_id, whatsapp, telegram, max_handle)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (user_id, tutor_id) DO UPDATE SET
                        whatsapp = EXCLUDED.whatsapp,
                        telegram = EXCLUDED.telegram,
                        max_handle = EXCLUDED.max_handle,
                        updated_at = NOW()
                    """,
                    (uid, tid, next_wa, next_tg, next_max),
                )
                return {"whatsapp": next_wa, "telegram": next_tg, "maxHandle": next_max}

    def _pg_tutor_summary_on_conn(
        self, conn: psycopg.Connection[Any], user_id: int, tutor_id: str | None = None
    ) -> dict[str, Any]:
        uid = int(user_id)
        all_rows = conn.execute(
            """
            SELECT * FROM oltp.tutors
            WHERE user_id = %s
            ORDER BY COALESCE(is_published, TRUE) DESC, updated_at DESC, id ASC
            """,
            (uid,),
        ).fetchall()
        row = None
        if tutor_id:
            row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s", (tutor_id.strip(),)).fetchone()
        if row is None and all_rows:
            row = all_rows[0]
        if not row:
            return {
                "tutorId": None,
                "tutor": None,
                "profiles": [],
                "tutorInn": "",
                "npdVerified": False,
                "earnedNetRub": 0,
                "earned30dNetRub": 0,
                "frozenNetRub": 0,
                "withdrawnRub": 0,
                "availableRub": 0,
                "completedLessonsCount": 0,
                "completedLessons30dCount": 0,
                "minPayoutRub": 500,
                "payouts": [],
            }
        tid = str(row["id"])
        target_ids = [tid] if tutor_id else ([str(r["id"]) for r in all_rows] if all_rows else [tid])
        profiles_list = (
            [self._pg_tutor_to_public_dict(r) for r in all_rows]
            if all_rows
            else [self._pg_tutor_to_public_dict(row)]
        )
        eff_inn = str(row.get("inn") or "")
        if not eff_inn:
            for r_own in all_rows:
                if str(r_own.get("inn") or "").strip():
                    eff_inn = str(r_own.get("inn") or "").strip()
                    break
        eff_npd_ver = bool(row.get("npd_verified")) or any(bool(r_own.get("npd_verified")) for r_own in all_rows)
        agg = conn.execute(
            """
            SELECT
                COALESCE(SUM(tutor_payout_rub) FILTER (WHERE status = 'captured'), 0) AS earned_net,
                COALESCE(SUM(tutor_payout_rub) FILTER (WHERE status = 'captured' AND COALESCE(settled_at, created_at) >= NOW() - INTERVAL '30 days'), 0) AS earned_30d_net,
                COALESCE(SUM(tutor_payout_rub) FILTER (WHERE status = 'frozen'), 0) AS frozen_net
            FROM oltp.escrow_holds
            WHERE tutor_id = ANY(%s)
            """,
            (target_ids,),
        ).fetchone()
        les_agg = conn.execute(
            """
            SELECT
                COUNT(*) FILTER (WHERE status = 'completed') AS completed_total,
                COUNT(*) FILTER (WHERE status = 'completed' AND COALESCE(updated_at, created_at) >= NOW() - INTERVAL '30 days') AS completed_30d
            FROM oltp.lesson_requests
            WHERE tutor_id = ANY(%s)
            """,
            (target_ids,),
        ).fetchone()
        wd = conn.execute(
            """
            SELECT COALESCE(SUM(amount_rub), 0) AS withdrawn
            FROM oltp.payout_requests
            WHERE tutor_id = ANY(%s) AND status NOT IN ('failed', 'rejected')
            """,
            (target_ids,),
        ).fetchone()
        p_rows = conn.execute(
            """
            SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
            FROM oltp.payout_requests p
            LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
            WHERE p.tutor_id = ANY(%s)
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT 30
            """,
            (target_ids,),
        ).fetchall()
        earned = int(agg["earned_net"]) if agg else 0
        earned_30d = int(agg["earned_30d_net"]) if agg else 0
        frozen = int(agg["frozen_net"]) if agg else 0
        withdrawn = int(wd["withdrawn"]) if wd else 0
        completed_total = int(les_agg["completed_total"]) if les_agg else 0
        completed_30d = int(les_agg["completed_30d"]) if les_agg else 0
        return {
            "tutorId": tid,
            "tutor": self._pg_tutor_to_public_dict(row),
            "profiles": profiles_list,
            "tutorInn": eff_inn,
            "npdVerified": eff_npd_ver,
            "earnedNetRub": earned,
            "earned30dNetRub": earned_30d,
            "frozenNetRub": frozen,
            "withdrawnRub": withdrawn,
            "availableRub": max(0, earned - withdrawn),
            "completedLessonsCount": completed_total,
            "completedLessons30dCount": completed_30d,
            "minPayoutRub": 500,
            "payouts": [self._admin_payout_row_to_dict(r) for r in p_rows],
        }

    def get_tutor_wallet_summary(self, user_id: int, tutor_id: str | None = None) -> dict[str, Any]:
        with self._pool.connection() as conn:
            return self._pg_tutor_summary_on_conn(conn, user_id, tutor_id=tutor_id)

    def create_tutor_payout(
        self,
        user_id: int,
        payload: dict[str, Any],
        *,
        actor_role: str = "student",
        payout_id: str | None = None,
    ) -> dict[str, Any]:
        uid = int(user_id)
        method = "card" if str(payload.get("method") or "sbp").strip().lower() == "card" else "sbp"
        amount = int(payload.get("amount") or payload.get("amountRub") or 0)
        if amount < 500 or amount > 500_000:
            raise StorageError("invalid_amount", "Сумма вывода от 500 до 500 000 ₽.", 400)
        dest_raw = str(payload.get("destination") or payload.get("phone") or payload.get("card") or "").strip()
        digits = re.sub(r"\D+", "", dest_raw)
        if method == "sbp" and len(digits) < 10:
            raise StorageError("invalid_destination", "Укажите корректный номер телефона для СБП.", 400)
        if method == "card" and len(digits) < 12:
            raise StorageError("invalid_destination", "Укажите корректный номер карты.", 400)
        bank = str(payload.get("bank") or ("Карта РФ (Мир)" if method == "card" else "СБП")).strip()[:48]
        sbp_bank_id = str(payload.get("sbpBankId") or "").strip()[:32]
        sbp_phone = str(payload.get("sbpPhone") or "").strip()[:32]
        payout_token = str(payload.get("payoutToken") or "").strip()[:255]
        tutor_inn = str(payload.get("tutorInn") or "").strip()[:16]
        provider = str(payload.get("provider") or "manual").strip()[:32] or "manual"
        idempotency_key = str(payload.get("idempotencyKey") or f"pout-{uuid.uuid4().hex[:16]}").strip()[:64]
        antifraud_hold = bool(payload.get("antifraudHold"))
        antifraud_reason = str(payload.get("antifraudReason") or "").strip()[:200]
        npd_mode = str(payload.get("npdMode") or "demo").strip().lower()
        masked = mask_payout_destination(method, dest_raw)
        npd_flag = payload.get("npdReceipt", True) is not False
        explicit_code = str(payload.get("npdReceiptCode") or "").strip()[:80]
        if not npd_flag:
            npd_receipt = None
            npd_status = "none"
        elif npd_mode == "live":
            npd_receipt = None
            npd_status = "pending"
        else:
            npd_receipt = explicit_code or f"NPD-{_utc_now().year}-{secrets.token_hex(4).upper()}"
            npd_status = "demo"
        pid = str(payout_id or f"pay-{secrets.token_hex(6)}").strip()[:64]
        req_tid = str(payload.get("tutorId") or "").strip() or None

        with self._pool.connection() as conn:
            with conn.transaction():
                existing_idem = conn.execute(
                    """
                    SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.payout_requests p
                    LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                    WHERE p.idempotency_key = %s
                    """,
                    (idempotency_key,),
                ).fetchone()
                if existing_idem:
                    tid_existing = str(existing_idem["tutor_id"])
                    return {
                        "payout": self._admin_payout_row_to_dict(existing_idem),
                        "summary": self._pg_tutor_summary_on_conn(conn, uid, tutor_id=tid_existing),
                    }

                row = None
                if req_tid:
                    row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (req_tid,)).fetchone()
                    if row and row.get("user_id") is not None and int(row["user_id"]) != uid and actor_role != "admin":
                        raise StorageError("forbidden", "Нет прав на вывод средств чужой анкеты.", 403)
                if row is None:
                    row = conn.execute(
                        """
                        SELECT * FROM oltp.tutors t
                        WHERE t.user_id = %s
                        ORDER BY
                            EXISTS(SELECT 1 FROM oltp.lesson_requests lr WHERE lr.tutor_id = t.id) DESC,
                            COALESCE(t.is_published, TRUE) DESC,
                            t.updated_at DESC,
                            t.id ASC
                        LIMIT 1 FOR UPDATE OF t
                        """,
                        (uid,),
                    ).fetchone()
                if not row:
                    raise StorageError("not_found", "Анкета преподавателя не найдена.", 404)
                tid = str(row["id"])
                eff_inn = tutor_inn or str(row.get("inn") or "").strip()[:16]
                sum_tid = None if (row.get("user_id") is not None and int(row["user_id"]) == uid) else tid
                summary = self._pg_tutor_summary_on_conn(conn, uid, tutor_id=sum_tid)
                if summary["availableRub"] < amount:
                    raise StorageError(
                        "insufficient_payout_balance",
                        f"Доступно к выводу {summary['availableRub']} ₽.",
                        400,
                    )
                conn.execute(
                    """
                    INSERT INTO oltp.payout_requests (
                        id, tutor_id, method, amount_rub, npd_receipt, bank, destination_masked, status,
                        idempotency_key, provider, sbp_bank_id, sbp_phone, payout_token,
                        tutor_inn, antifraud_hold, antifraud_reason, npd_requested, npd_status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'processing', %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        pid,
                        tid,
                        method,
                        amount,
                        npd_receipt,
                        bank,
                        masked,
                        idempotency_key,
                        provider,
                        sbp_bank_id,
                        sbp_phone,
                        payout_token,
                        eff_inn,
                        antifraud_hold,
                        antifraud_reason,
                        npd_flag,
                        npd_status,
                    ),
                )
                if npd_flag and npd_status == "demo" and npd_receipt:
                    rid = f"npd-{uuid.uuid4().hex[:12]}"
                    conn.execute(
                        """
                        INSERT INTO oltp.npd_receipts (
                            id, payout_id, tutor_id, tutor_inn, provider,
                            receipt_uuid, receipt_url, receipt_json_url, service_name,
                            amount_rub, status, error_message
                        ) VALUES (%s, %s, %s, %s, 'demo', %s, '', '', %s, %s, 'demo', '')
                        ON CONFLICT (payout_id) DO NOTHING
                        """,
                        (
                            rid,
                            pid,
                            tid,
                            eff_inn,
                            npd_receipt,
                            "Услуги репетитора «Вектор»",
                            amount,
                        ),
                    )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=pid,
                    event_type="tutor.payout.requested",
                    user_id=uid,
                    role="tutor",
                    view="fees",
                    payload={
                        "payoutId": pid,
                        "tutorId": tid,
                        "amountRub": amount,
                        "method": method,
                        "provider": provider,
                        "antifraudHold": antifraud_hold,
                    },
                )
                p_row = conn.execute(
                    """
                    SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.payout_requests p
                    LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
                    WHERE p.id = %s
                    """,
                    (pid,),
                ).fetchone()
                return {
                    "payout": self._admin_payout_row_to_dict(p_row),
                    "summary": self._pg_tutor_summary_on_conn(conn, uid, tutor_id=sum_tid),
                }

    @staticmethod
    def _direction_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        kw_raw = row.get("keywords")
        if isinstance(kw_raw, str):
            try:
                kw_raw = json.loads(kw_raw)
            except Exception:
                kw_raw = []
        keywords = [str(k) for k in (kw_raw or []) if str(k).strip()] if isinstance(kw_raw, list) else []
        return {
            "id": str(row["id"]),
            "name": str(row["name"]),
            "short": str(row["short"]),
            "category": str(row.get("category") or "Добавлено оркестратором"),
            "isExam": bool(row.get("is_exam")),
            "source": str(row.get("source") or "orchestrator"),
            "keywords": keywords,
            "demandCount": int(row.get("demand_count") or 1),
            "tutorCount": int(row.get("tutor_count") or 0),
            "autoAdded": True,
            "addedAt": _iso_utc(row.get("created_at")),
        }

    def list_market_directions(self, *, limit: int = 200) -> list[dict[str, Any]]:
        lim = max(1, min(500, int(limit or 200)))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM oltp.market_directions
                ORDER BY demand_count DESC, updated_at DESC, id ASC
                LIMIT %s
                """,
                (lim,),
            ).fetchall()
        return [self._direction_row_to_dict(r) for r in rows]

    def upsert_market_direction(
        self,
        payload: dict[str, Any],
        *,
        direction_id: str | None = None,
    ) -> dict[str, Any]:
        norm = normalize_direction_payload(payload)
        if direction_id:
            norm["id"] = str(direction_id).strip()[:36]
        with self._pool.connection() as conn:
            with conn.transaction():
                existing = conn.execute(
                    """
                    SELECT * FROM oltp.market_directions
                    WHERE id = %s OR LOWER(short) = LOWER(%s) OR LOWER(name) = LOWER(%s)
                    LIMIT 1
                    FOR UPDATE
                    """,
                    (norm["id"], norm["short"], norm["name"]),
                ).fetchone()
                if existing is not None:
                    eid = str(existing["id"])
                    prev_kw = existing.get("keywords") or []
                    if isinstance(prev_kw, str):
                        try:
                            prev_kw = json.loads(prev_kw)
                        except Exception:
                            prev_kw = []
                    merged_kw = list(dict.fromkeys([*(str(k) for k in prev_kw if str(k).strip()), *norm["keywords"]]))[:12]
                    next_demand = int(existing.get("demand_count") or 1) + 1
                    next_tutor_count = max(int(existing.get("tutor_count") or 0), norm["tutor_count"])
                    next_source = "orchestrator" if norm["source"] == "orchestrator" else str(existing.get("source") or "orchestrator")
                    updated = conn.execute(
                        """
                        UPDATE oltp.market_directions
                        SET keywords = %s, demand_count = %s, tutor_count = %s, source = %s, updated_at = NOW()
                        WHERE id = %s
                        RETURNING *
                        """,
                        (Jsonb(merged_kw), next_demand, next_tutor_count, next_source, eid),
                    ).fetchone()
                    return {"direction": self._direction_row_to_dict(updated), "created": False}

                created_row = conn.execute(
                    """
                    INSERT INTO oltp.market_directions (
                        id, name, short, category, is_exam, source, keywords, demand_count, tutor_count
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, 1, %s)
                    RETURNING *
                    """,
                    (
                        norm["id"],
                        norm["name"],
                        norm["short"],
                        norm["category"],
                        norm["is_exam"],
                        norm["source"],
                        Jsonb(norm["keywords"]),
                        norm["tutor_count"],
                    ),
                ).fetchone()
                return {"direction": self._direction_row_to_dict(created_row), "created": True}

    @staticmethod
    def _review_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        tags_raw = row.get("tags")
        if isinstance(tags_raw, str):
            try:
                tags_raw = json.loads(tags_raw)
            except Exception:
                tags_raw = []
        tags = [str(t) for t in (tags_raw or []) if str(t).strip()] if isinstance(tags_raw, list) else []
        return {
            "id": str(row["id"]),
            "tutorId": str(row["tutor_id"]),
            "bookingId": row.get("booking_id"),
            "studentUserId": int(row["student_user_id"]) if row.get("student_user_id") is not None else None,
            "studentName": str(row.get("student_name") or "Ученик"),
            "rating": int(row["rating"]),
            "comment": str(row.get("comment") or ""),
            "tags": tags,
            "verifiedLesson": bool(row.get("verified_lesson")),
            "createdAt": _iso_utc(row.get("created_at")),
        }

    def _pg_tutor_review_agg(self, conn: psycopg.Connection[Any], tutor_id: str) -> tuple[float, int]:
        agg = conn.execute(
            "SELECT COUNT(*) AS cnt, AVG(rating) AS avg_r FROM oltp.tutor_reviews WHERE tutor_id = %s",
            (tutor_id,),
        ).fetchone()
        cnt = int(agg["cnt"] or 0) if agg else 0
        if cnt > 0 and agg and agg.get("avg_r") is not None:
            return round(float(agg["avg_r"]), 1), cnt
        t_row = conn.execute("SELECT rating, reviews_count FROM oltp.tutors WHERE id = %s", (tutor_id,)).fetchone()
        if t_row:
            return round(float(t_row["rating"] or 4.9), 1), int(t_row["reviews_count"] or 0)
        return 5.0, 0

    def list_tutor_reviews(self, tutor_id: str, *, limit: int = 50) -> dict[str, Any]:
        tid = clean_direction_label(tutor_id, max_len=64)
        if not tid:
            raise StorageError("invalid_tutor", "Не указан преподаватель.", 400)
        lim = max(1, min(200, int(limit or 50)))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT * FROM oltp.tutor_reviews
                WHERE tutor_id = %s
                ORDER BY created_at DESC, id DESC
                LIMIT %s
                """,
                (tid, lim),
            ).fetchall()
            rating, cnt = self._pg_tutor_review_agg(conn, tid)
        return {
            "tutorId": tid,
            "rating": rating,
            "reviewsCount": cnt,
            "reviews": [self._review_row_to_dict(r) for r in rows],
        }

    def list_tutor_review_summaries(self) -> dict[str, dict[str, Any]]:
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT tutor_id, COUNT(*) AS cnt, ROUND(AVG(rating)::numeric, 1) AS avg_r
                FROM oltp.tutor_reviews
                GROUP BY tutor_id
                """
            ).fetchall()
        return {
            str(r["tutor_id"]): {
                "rating": round(float(r["avg_r"] or 5.0), 1),
                "reviewsCount": int(r["cnt"] or 0),
            }
            for r in rows
            if int(r["cnt"] or 0) > 0
        }

    def create_tutor_review(
        self,
        student_user_id: int | None,
        tutor_id: str,
        payload: dict[str, Any],
        *,
        review_id: str | None = None,
    ) -> dict[str, Any]:
        tid = clean_direction_label(tutor_id, max_len=64)
        if not tid:
            raise StorageError("invalid_tutor", "Не указан преподаватель.", 400)
        norm = normalize_review_payload(payload)
        rid = str(review_id or f"rev-{secrets.token_hex(6)}").strip()[:64]
        uid = int(student_user_id) if student_user_id is not None else None
        bid = norm["booking_id"]

        with self._pool.connection() as conn:
            with conn.transaction():
                if bid:
                    dup = conn.execute("SELECT id FROM oltp.tutor_reviews WHERE booking_id = %s", (bid,)).fetchone()
                    if dup is not None:
                        raise StorageError("review_exists", "Отзыв по этому занятию уже оставлен.", 409)
                    bk = conn.execute("SELECT * FROM oltp.lesson_requests WHERE id = %s", (bid,)).fetchone()
                    if bk is not None:
                        if str(bk["tutor_id"]) != tid:
                            raise StorageError("invalid_booking", "Заявка относится к другому преподавателю.", 400)
                        if uid is not None and bk.get("student_user_id") is not None and int(bk["student_user_id"]) != uid:
                            raise StorageError("forbidden", "Нет прав на оценку чужого занятия.", 403)
                        if not norm["student_name"]:
                            norm["student_name"] = str(bk.get("student_name") or "")
                if not norm["student_name"] and uid is not None:
                    u_row = conn.execute("SELECT display_name, username FROM oltp.users WHERE id = %s", (uid,)).fetchone()
                    if u_row:
                        norm["student_name"] = str(u_row.get("display_name") or u_row["username"] or "Ученик")[:64]
                if not norm["student_name"]:
                    norm["student_name"] = "Ученик"

                row = conn.execute(
                    """
                    INSERT INTO oltp.tutor_reviews (
                        id, tutor_id, booking_id, student_user_id, student_name,
                        rating, comment, tags, verified_lesson
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING *
                    """,
                    (
                        rid,
                        tid,
                        bid,
                        uid,
                        norm["student_name"],
                        norm["rating"],
                        norm["comment"],
                        Jsonb(norm["tags"]),
                        bool(bid),
                    ),
                ).fetchone()
                rating, cnt = self._pg_tutor_review_agg(conn, tid)
                conn.execute(
                    "UPDATE oltp.tutors SET rating = %s, reviews_count = %s, updated_at = NOW() WHERE id = %s",
                    (rating, cnt, tid),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.market.bids.v1",
                    partition_key=tid,
                    event_type="market.review.created",
                    user_id=uid,
                    role="student",
                    view="market",
                    payload={"reviewId": rid, "tutorId": tid, "bookingId": bid, "rating": norm["rating"], "reviewsCount": cnt},
                )
                return {
                    "review": self._review_row_to_dict(row),
                    "rating": rating,
                    "reviewsCount": cnt,
                }

    @staticmethod
    def _dispute_row_to_dict(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": str(row["id"]),
            "bookingId": str(row["booking_id"]),
            "tutorId": str(row["tutor_id"]),
            "tutorName": str(row.get("tutor_name") or row["tutor_id"]),
            "studentUserId": int(row["student_user_id"]) if row.get("student_user_id") is not None else None,
            "studentName": str(row.get("student_name") or "Ученик"),
            "reason": str(row.get("reason") or "first_lesson_guarantee"),
            "comment": str(row.get("comment") or ""),
            "amountRub": int(row.get("amount_rub") or 0),
            "firstLessonGuarantee": bool(row.get("first_lesson_guarantee")),
            "status": str(row.get("status") or "open"),
            "resolutionNote": str(row.get("resolution_note") or ""),
            "createdAt": _iso_utc(row.get("created_at")),
            "resolvedAt": _iso_utc(row.get("resolved_at")) if row.get("resolved_at") else None,
        }

    def list_disputes(
        self,
        *,
        student_user_id: int | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(500, int(limit or 100)))
        with self._pool.connection() as conn:
            if student_user_id is not None:
                rows = conn.execute(
                    """
                    SELECT * FROM oltp.lesson_disputes
                    WHERE student_user_id = %s
                    ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (int(student_user_id), lim),
                ).fetchall()
            else:
                rows = conn.execute(
                    """
                    SELECT * FROM oltp.lesson_disputes
                    ORDER BY CASE WHEN status = 'open' THEN 0 ELSE 1 END, created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (lim,),
                ).fetchall()
        return [self._dispute_row_to_dict(r) for r in rows]

    def open_dispute(
        self,
        actor_user_id: int,
        booking_id: str,
        payload: dict[str, Any],
        *,
        actor_role: str = "student",
        dispute_id: str | None = None,
    ) -> dict[str, Any]:
        uid = int(actor_user_id)
        bid = clean_direction_label(booking_id, max_len=64)
        if not bid:
            raise StorageError("invalid_booking", "Не указана заявка.", 400)
        norm = normalize_dispute_payload(payload)
        did = str(dispute_id or f"dsp-{secrets.token_hex(6)}").strip()[:64]

        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    WHERE lr.id = %s
                    FOR UPDATE OF lr
                    """,
                    (bid,),
                ).fetchone()
                if not row:
                    raise StorageError("not_found", "Заявка не найдена.", 404)
                is_owner = row.get("student_user_id") is not None and int(row["student_user_id"]) == uid
                if not is_owner and actor_role != "admin":
                    raise StorageError("forbidden", "Нет прав на открытие спора по этой заявке.", 403)
                cur_status = _PG_TO_MKT_STATUS.get(str(row["status"]), str(row["status"]))
                if cur_status not in ("accepted", "completed"):
                    raise StorageError("invalid_transition", "Спор можно открыть только по подтверждённому или проведённому занятию.", 409)
                existing = conn.execute("SELECT id FROM oltp.lesson_disputes WHERE booking_id = %s", (bid,)).fetchone()
                if existing is not None:
                    raise StorageError("dispute_exists", "Спор по этому занятию уже открыт.", 409)

                amount = int(row.get("final_price_rub") or row.get("counter_price_rub") or row.get("offer_price_rub") or row.get("reserved_rub") or 0)
                student_uid = int(row["student_user_id"]) if row.get("student_user_id") is not None else uid
                d_row = conn.execute(
                    """
                    INSERT INTO oltp.lesson_disputes (
                        id, booking_id, tutor_id, tutor_name, student_user_id, student_name,
                        reason, comment, amount_rub, first_lesson_guarantee, status, resolution_note
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, 'open', '')
                    RETURNING *
                    """,
                    (
                        did,
                        bid,
                        str(row["tutor_id"]),
                        str(row.get("tutor_name") or row["tutor_id"]),
                        student_uid,
                        str(row.get("student_name") or "Ученик"),
                        norm["reason"],
                        norm["comment"],
                        amount,
                        bool(row.get("first_lesson_guarantee", True) and norm["first_lesson_guarantee"]),
                    ),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=did,
                    event_type="market.dispute.opened",
                    user_id=student_uid,
                    role="student",
                    view="study",
                    payload={"disputeId": did, "bookingId": bid, "tutorId": str(row["tutor_id"]), "reason": norm["reason"], "amountRub": amount},
                )
                return {"dispute": self._dispute_row_to_dict(d_row)}

    def resolve_dispute(
        self,
        dispute_id: str,
        action: str,
        *,
        resolution_note: str = "",
    ) -> dict[str, Any]:
        did = clean_direction_label(dispute_id, max_len=64)
        act = str(action or "").strip().lower()
        if act not in ("refund", "reject"):
            raise StorageError("invalid_action", "Допустимые решения: refund или reject.", 400)
        note = clean_direction_label(resolution_note or "", max_len=300)

        with self._pool.connection() as conn:
            with conn.transaction():
                d_row = conn.execute("SELECT * FROM oltp.lesson_disputes WHERE id = %s FOR UPDATE", (did,)).fetchone()
                if not d_row:
                    raise StorageError("not_found", "Спор не найден.", 404)
                if str(d_row["status"]) != "open":
                    raise StorageError("dispute_closed", "Спор уже закрыт.", 409)

                bid = str(d_row["booking_id"])
                amount = max(0, int(d_row.get("amount_rub") or 0))
                student_uid = int(d_row["student_user_id"]) if d_row.get("student_user_id") is not None else None
                refunded_rub = 0
                wallet_snap = None

                if act == "refund":
                    next_status = "refunded"
                    refunded_rub = amount
                    if student_uid is not None and refunded_rub > 0:
                        snap = self._pg_wallet_snapshot(conn, student_uid)
                        new_bal = int(snap["balanceRub"]) + refunded_rub
                        conn.execute(
                            "UPDATE oltp.wallets SET balance_rub = %s, updated_at = NOW() WHERE user_id = %s",
                            (new_bal, student_uid),
                        )
                        conn.execute(
                            """
                            INSERT INTO oltp.wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                            ) VALUES (%s, 'dispute_refund', %s, %s, 0, 'escrow', 'dispute', %s, %s)
                            """,
                            (student_uid, refunded_rub, new_bal, did, f"Возврат по спору {did} (гарантия 1-го урока)"),
                        )
                        wallet_snap = self._pg_wallet_snapshot(conn, student_uid)
                    conn.execute(
                        "UPDATE oltp.escrow_holds SET status = 'refunded', settled_at = NOW() WHERE request_id = %s",
                        (bid,),
                    )
                    conn.execute(
                        "UPDATE oltp.lesson_requests SET status = 'cancelled', reserved_rub = 0, updated_at = NOW() WHERE id = %s",
                        (bid,),
                    )
                else:
                    next_status = "rejected"

                updated = conn.execute(
                    """
                    UPDATE oltp.lesson_disputes
                    SET status = %s, resolution_note = %s, resolved_at = NOW()
                    WHERE id = %s
                    RETURNING *
                    """,
                    (next_status, note, did),
                ).fetchone()
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=did,
                    event_type=f"payments.dispute.{next_status}",
                    user_id=student_uid,
                    role="admin",
                    view="admin",
                    payload={"disputeId": did, "bookingId": bid, "refundedRub": refunded_rub},
                )
                out: dict[str, Any] = {
                    "dispute": self._dispute_row_to_dict(updated),
                    "refundedRub": refunded_rub,
                }
                if wallet_snap is not None:
                    out["wallet"] = wallet_snap
                return out

    # ---------- Фоновый планировщик: эскроу и напоминания ----------

    def list_scheduler_bookings(
        self,
        *,
        statuses: tuple[str, ...] = ("pending", "countered", "accepted"),
        limit: int = 500,
    ) -> list[dict[str, Any]]:
        norm: list[str] = []
        for s in statuses:
            val = str(s or "").strip().lower()
            if val == "pending":
                norm.extend(("offered", "pending"))
            elif val:
                norm.append(val)
        unique_statuses = list(dict.fromkeys(norm))
        if not unique_statuses:
            return []
        lim = max(1, min(int(limit or 500), 2000))
        with self._pool.connection() as conn:
            rows = conn.execute(
                """
                SELECT lr.*,
                       COALESCE(t.full_name, '') AS tutor_name,
                       COALESCE(eh.status, 'none') AS escrow_status,
                       EXISTS (
                           SELECT 1 FROM oltp.lesson_disputes d
                           WHERE d.booking_id = lr.id AND d.status IN ('open', 'refunded')
                       ) AS has_blocking_dispute
                FROM oltp.lesson_requests lr
                LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                LEFT JOIN LATERAL (
                    SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                ) eh ON TRUE
                WHERE lr.status = ANY(%s)
                ORDER BY lr.slot_date ASC, lr.hour_slot ASC, lr.created_at ASC
                LIMIT %s
                """,
                (unique_statuses, lim),
            ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            item = self._pg_booking_row_to_dict(r)
            item["hasBlockingDispute"] = bool(r.get("has_blocking_dispute"))
            out.append(item)
        return out

    def auto_capture_booking(
        self,
        booking_id: str,
        *,
        reason: str = "slot_finished",
    ) -> dict[str, Any] | None:
        bid = str(booking_id or "").strip()
        if not bid:
            return None
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT * FROM oltp.lesson_requests WHERE id = %s FOR UPDATE",
                    (bid,),
                ).fetchone()
                if not row:
                    return None
                cur_norm = _PG_TO_MKT_STATUS.get(str(row.get("status") or ""), str(row.get("status") or ""))
                if cur_norm != "accepted":
                    return None
                dispute_row = conn.execute(
                    """
                    SELECT 1 FROM oltp.lesson_disputes
                    WHERE booking_id = %s AND status IN ('open', 'refunded')
                    LIMIT 1
                    """,
                    (bid,),
                ).fetchone()
                if dispute_row:
                    return None
                esc_row = conn.execute(
                    "SELECT status FROM oltp.escrow_holds WHERE request_id = %s ORDER BY created_at DESC LIMIT 1 FOR UPDATE",
                    (bid,),
                ).fetchone()
                if not esc_row or str(esc_row.get("status") or "") != "frozen":
                    return None

                eff_price = int(row.get("final_price_rub") or row.get("counter_price_rub") or row.get("offer_price_rub") or 0)
                student_uid = int(row["student_user_id"]) if row.get("student_user_id") is not None else None
                tutor_id = str(row["tutor_id"])
                cur_reserved = int(row.get("reserved_rub") or 0)
                fee, payout = calc_fee_split(eff_price)
                sbp_fee = calc_sbp_fee(eff_price)

                if eff_price > 0:
                    self._pg_upsert_escrow(
                        conn, booking_id=bid, tutor_id=tutor_id, student_uid=student_uid, gross_rub=eff_price, status="captured"
                    )
                    if student_uid is not None and cur_reserved > 0:
                        w_snap = self._pg_wallet_snapshot(conn, student_uid)
                        conn.execute(
                            """
                            INSERT INTO oltp.wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                            ) VALUES (%s, 'escrow_capture', 0, %s, %s, 'escrow', 'booking', %s, %s)
                            """,
                            (student_uid, int(w_snap["balanceRub"]), fee, bid, f"Автозавершение урока {bid}: списано {eff_price} ₽"),
                        )
                conn.execute(
                    """
                    UPDATE oltp.lesson_requests
                    SET status = 'completed',
                        final_price_rub = COALESCE(final_price_rub, %s),
                        reserved_rub = 0,
                        updated_at = NOW()
                    WHERE id = %s
                    """,
                    (eff_price if eff_price > 0 else None, bid),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=bid,
                    event_type="payments.escrow.auto_captured",
                    user_id=student_uid,
                    role="system",
                    view="backend",
                    payload={
                        "bookingId": bid,
                        "tutorId": tutor_id,
                        "grossRub": eff_price,
                        "feeRub": fee,
                        "sbpFeeRub": sbp_fee,
                        "payoutRub": payout,
                        "reason": reason,
                    },
                )
                updated = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.id = %s
                    """,
                    (bid,),
                ).fetchone()
                return {
                    "booking": self._pg_booking_row_to_dict(updated),
                    "grossRub": eff_price,
                    "feeRub": fee,
                    "sbpFeeRub": sbp_fee,
                    "payoutRub": payout,
                    "reason": reason,
                }

    def auto_expire_pending_booking(
        self,
        booking_id: str,
        *,
        reason: str = "expired",
    ) -> dict[str, Any] | None:
        bid = str(booking_id or "").strip()
        if not bid:
            return None
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    "SELECT * FROM oltp.lesson_requests WHERE id = %s FOR UPDATE",
                    (bid,),
                ).fetchone()
                if not row:
                    return None
                cur_norm = _PG_TO_MKT_STATUS.get(str(row.get("status") or ""), str(row.get("status") or ""))
                if cur_norm not in ("pending", "countered"):
                    return None
                student_uid = int(row["student_user_id"]) if row.get("student_user_id") is not None else None
                cur_reserved = int(row.get("reserved_rub") or 0)
                if student_uid is not None and cur_reserved > 0:
                    w_snap = self._pg_wallet_snapshot(conn, student_uid)
                    new_bal = int(w_snap["balanceRub"]) + cur_reserved
                    conn.execute(
                        "UPDATE oltp.wallets SET balance_rub = %s, updated_at = NOW() WHERE user_id = %s",
                        (new_bal, student_uid),
                    )
                    conn.execute(
                        """
                        INSERT INTO oltp.wallet_ledger (
                            user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note
                        ) VALUES (%s, 'escrow_refund', %s, %s, 0, 'escrow', 'booking', %s, %s)
                        """,
                        (student_uid, cur_reserved, new_bal, bid, f"Автоотмена просроченной заявки {bid}"),
                    )
                conn.execute(
                    "UPDATE oltp.escrow_holds SET status = 'refunded', settled_at = NOW() WHERE request_id = %s",
                    (bid,),
                )
                conn.execute(
                    "UPDATE oltp.lesson_requests SET status = 'cancelled', reserved_rub = 0, updated_at = NOW() WHERE id = %s",
                    (bid,),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=bid,
                    event_type="market.bid.auto_expired",
                    user_id=student_uid,
                    role="system",
                    view="backend",
                    payload={"bookingId": bid, "refundedRub": cur_reserved, "reason": reason},
                )
                updated = conn.execute(
                    """
                    SELECT lr.*, COALESCE(t.full_name, '') AS tutor_name, COALESCE(eh.status, 'none') AS escrow_status
                    FROM oltp.lesson_requests lr
                    LEFT JOIN oltp.tutors t ON t.id = lr.tutor_id
                    LEFT JOIN LATERAL (
                        SELECT status FROM oltp.escrow_holds WHERE request_id = lr.id ORDER BY created_at DESC LIMIT 1
                    ) eh ON TRUE
                    WHERE lr.id = %s
                    """,
                    (bid,),
                ).fetchone()
                return {
                    "booking": self._pg_booking_row_to_dict(updated),
                    "refundedRub": cur_reserved,
                    "reason": reason,
                }

    def has_lesson_reminder_sent(self, booking_id: str, kind: str, recipient_role: str) -> bool:
        bid = str(booking_id or "").strip()
        k = "24h" if str(kind or "").strip() == "24h" else "1h"
        role_norm = "tutor" if str(recipient_role or "").strip() == "tutor" else "student"
        if not bid:
            return False
        with self._pool.connection() as conn:
            row = conn.execute(
                """
                SELECT 1 FROM oltp.lesson_reminders_sent
                WHERE booking_id = %s AND kind = %s AND recipient_role = %s
                LIMIT 1
                """,
                (bid, k, role_norm),
            ).fetchone()
        return row is not None

    def mark_lesson_reminder_sent(
        self,
        booking_id: str,
        kind: str,
        recipient_role: str,
        chat_id: str = "",
    ) -> bool:
        bid = str(booking_id or "").strip()
        k = "24h" if str(kind or "").strip() == "24h" else "1h"
        role_norm = "tutor" if str(recipient_role or "").strip() == "tutor" else "student"
        if not bid:
            return False
        with self._pool.connection() as conn:
            with conn.transaction():
                row = conn.execute(
                    """
                    INSERT INTO oltp.lesson_reminders_sent (booking_id, kind, recipient_role, chat_id)
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (booking_id, kind, recipient_role) DO NOTHING
                    RETURNING booking_id
                    """,
                    (bid, k, role_norm, str(chat_id or "")),
                ).fetchone()
        return row is not None
