"""Доменная логика маркетплейса: кошелёк/леджер, эскроу, заявки, расписание, лиды, контакты и выплаты (PostgreSQL 17)."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import re
import secrets
from typing import Any

import psycopg
from psycopg.types.json import Jsonb

from databases.sqlite.common import (
    StorageError,
    _normalize_dow,
    _normalize_tz,
    calc_fee_split,
    format_days_short,
    generate_telemost_url,
    mask_payout_destination,
    normalize_city_tz,
    sort_dows,
    validate_hour_slot,
    validate_schedule_plan,
    validate_telemost_url,
)
from .schema import _iso_utc, _utc_now

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
            "rating": float(r.get("rating") or 4.9),
            "reviewsCount": int(r.get("reviews_count") or 0),
            "lastBumpedAt": _iso_utc(r.get("last_bumped_at")),
            "updatedAt": _iso_utc(r.get("updated_at")),
        }

    def list_tutors(
        self,
        *,
        subject: str | None = None,
        city: str | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 500))
        clauses: list[str] = []
        params: list[Any] = []
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

    def _pg_ensure_tutor_exists(
        self,
        conn: psycopg.Connection[Any],
        tutor_id: str,
        *,
        tutor_name: str = "Преподаватель Вектор ЕГЭ",
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
                (tutor_name or "Преподаватель Вектор ЕГЭ").strip()[:80],
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
    ) -> dict[str, Any]:
        uid = int(user_id)
        full_name = str(payload.get("name") or payload.get("fullName") or "").strip()[:80]
        if len(full_name) < 2:
            raise StorageError("invalid_name", "Укажите имя и фамилию преподавателя (минимум 2 символа).", 400)
        norm_city, norm_tz = normalize_city_tz(payload.get("city"), payload.get("timezone"))
        base_rate = max(100, min(99999, int(payload.get("price") or payload.get("baseRateRub") or 1200)))
        market_rate = max(base_rate, int(payload.get("marketPrice") or payload.get("marketRateRub") or ((base_rate * 128 + 50) // 100)))
        subjects = payload.get("subjects") if isinstance(payload.get("subjects"), list) else []
        clean_subjects = [str(s).strip()[:32] for s in subjects if str(s).strip()][:8]
        subject_label = str(payload.get("subjectName") or payload.get("subject") or (clean_subjects[0] if clean_subjects else "Биология")).strip()[:64]
        exams = [str(x).strip()[:32] for x in (payload.get("exams") or ["ЕГЭ"]) if str(x).strip()][:5] or ["ЕГЭ"]
        formats = [str(x).strip()[:32] for x in (payload.get("formats") or ["Онлайн"]) if str(x).strip()][:4] or ["Онлайн"]
        raw_slots = payload.get("slots") if isinstance(payload.get("slots"), dict) else {}
        clean_slots: dict[str, list[str]] = {}
        for dow_key, hours_val in raw_slots.items():
            try:
                dow_num = int(dow_key)
            except (TypeError, ValueError):
                continue
            if 0 <= dow_num <= 6 and isinstance(hours_val, list):
                valid_hrs = sorted({validate_hour_slot(str(h)) for h in hours_val if str(h).strip()})
                if valid_hrs:
                    clean_slots[str(dow_num)] = valid_hrs

        with self._pool.connection() as conn:
            with conn.transaction():
                own = conn.execute("SELECT * FROM oltp.tutors WHERE user_id = %s LIMIT 1", (uid,)).fetchone()
                tid = str(own["id"]) if own else str(tutor_id or f"tut-{secrets.token_hex(5)}").strip()[:64]
                if not own:
                    clash = conn.execute("SELECT user_id FROM oltp.tutors WHERE id = %s", (tid,)).fetchone()
                    if clash and clash.get("user_id") is not None and int(clash["user_id"]) != uid:
                        tid = f"tut-{secrets.token_hex(5)}"
                photo_url = str(payload.get("photo") or payload.get("photoUrl") or "").strip()[:220_000]
                has_photo = bool(photo_url)
                tariff_id = str(payload.get("tariffId") or (own["tariff_id"] if own else "free"))
                if tariff_id not in ("free", "trial5k", "month10k"):
                    tariff_id = "free"
                bumped_today = bool(own.get("bumped_today")) if own else False
                verified = bool(own.get("verified", True)) if own else True

                row = conn.execute(
                    """
                    INSERT INTO oltp.tutors (
                        id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                        source_channel, tariff_id, whatsapp_phone, telegram_handle, max_handle,
                        has_photo, verified, bumped_today, rating, reviews_count,
                        photo_url, headline, bio, education, exp_years, avg_score,
                        subjects_json, exams_json, formats_json, custom_skills, first_lesson_guarantee
                    ) VALUES (
                        %s, %s, %s, %s, %s, %s, %s, %s, 'platform', %s, %s, %s, %s,
                        %s, %s, %s, 4.90, 12, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s
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
                        first_lesson_guarantee = EXCLUDED.first_lesson_guarantee
                    RETURNING *
                    """,
                    (
                        tid,
                        uid,
                        full_name,
                        subject_label,
                        norm_city,
                        norm_tz,
                        base_rate,
                        market_rate,
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
                        Jsonb(clean_subjects),
                        Jsonb(exams),
                        Jsonb(formats),
                        str(payload.get("customSkills") or "").strip()[:240],
                        bool(payload.get("firstLessonGuarantee", True)),
                    ),
                ).fetchone()
                if clean_slots:
                    conn.execute("DELETE FROM oltp.tutor_slots WHERE tutor_id = %s AND is_booked = FALSE", (tid,))
                    for dow_str, hrs in clean_slots.items():
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
                    payload={"tutorId": tid, "city": norm_city, "price": base_rate},
                )
                return {"tutor": self._pg_tutor_to_public_dict(row), "slots": clean_slots}

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
                    row = conn.execute("SELECT * FROM oltp.tutors WHERE user_id = %s LIMIT 1 FOR UPDATE", (uid,)).fetchone()
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
                    tutor_name=str(payload.get("tutorName") or "Преподаватель Вектор ЕГЭ"),
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
                if act == "accept" and tutor_owned and cur_norm == "pending" and not (is_tutor or is_admin):
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
                row, _, _ = self._pg_load_authorized_booking(
                    conn, booking_id, actor_user_id=actor_user_id, actor_role=actor_role
                )
                bid = str(row["id"])
                stu_id = row.get("student_user_id")
                if clean_url and stu_id is not None:
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
        row = None
        if tutor_id:
            row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s", (tutor_id.strip(),)).fetchone()
        if row is None:
            row = conn.execute("SELECT * FROM oltp.tutors WHERE user_id = %s LIMIT 1", (uid,)).fetchone()
        if not row:
            return {
                "tutorId": None,
                "earnedNetRub": 0,
                "frozenNetRub": 0,
                "withdrawnRub": 0,
                "availableRub": 0,
                "minPayoutRub": 500,
                "payouts": [],
            }
        tid = str(row["id"])
        agg = conn.execute(
            """
            SELECT
                COALESCE(SUM(tutor_payout_rub) FILTER (WHERE status = 'captured'), 0) AS earned_net,
                COALESCE(SUM(tutor_payout_rub) FILTER (WHERE status = 'frozen'), 0) AS frozen_net
            FROM oltp.escrow_holds
            WHERE tutor_id = %s
            """,
            (tid,),
        ).fetchone()
        wd = conn.execute(
            """
            SELECT COALESCE(SUM(amount_rub), 0) AS withdrawn
            FROM oltp.payout_requests
            WHERE tutor_id = %s AND status <> 'failed'
            """,
            (tid,),
        ).fetchone()
        p_rows = conn.execute(
            """
            SELECT p.*, COALESCE(t.full_name, '') AS tutor_name
            FROM oltp.payout_requests p
            LEFT JOIN oltp.tutors t ON t.id = p.tutor_id
            WHERE p.tutor_id = %s
            ORDER BY p.created_at DESC, p.id DESC
            LIMIT 30
            """,
            (tid,),
        ).fetchall()
        earned = int(agg["earned_net"]) if agg else 0
        frozen = int(agg["frozen_net"]) if agg else 0
        withdrawn = int(wd["withdrawn"]) if wd else 0
        return {
            "tutorId": tid,
            "earnedNetRub": earned,
            "frozenNetRub": frozen,
            "withdrawnRub": withdrawn,
            "availableRub": max(0, earned - withdrawn),
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
        masked = mask_payout_destination(method, dest_raw)
        npd_flag = payload.get("npdReceipt", True) is not False
        npd_receipt = f"NPD-{_utc_now().year}-{secrets.token_hex(4).upper()}" if npd_flag else None
        pid = str(payout_id or f"pay-{secrets.token_hex(6)}").strip()[:64]
        req_tid = str(payload.get("tutorId") or "").strip() or None

        with self._pool.connection() as conn:
            with conn.transaction():
                row = None
                if req_tid:
                    row = conn.execute("SELECT * FROM oltp.tutors WHERE id = %s FOR UPDATE", (req_tid,)).fetchone()
                    if row and row.get("user_id") is not None and int(row["user_id"]) != uid and actor_role != "admin":
                        raise StorageError("forbidden", "Нет прав на вывод средств чужой анкеты.", 403)
                if row is None:
                    row = conn.execute("SELECT * FROM oltp.tutors WHERE user_id = %s LIMIT 1 FOR UPDATE", (uid,)).fetchone()
                if not row:
                    raise StorageError("not_found", "Анкета преподавателя не найдена.", 404)
                tid = str(row["id"])
                summary = self._pg_tutor_summary_on_conn(conn, uid, tutor_id=tid)
                if summary["availableRub"] < amount:
                    raise StorageError(
                        "insufficient_payout_balance",
                        f"Доступно к выводу {summary['availableRub']} ₽.",
                        400,
                    )
                conn.execute(
                    """
                    INSERT INTO oltp.payout_requests (
                        id, tutor_id, method, amount_rub, npd_receipt, bank, destination_masked, status
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'processing')
                    """,
                    (pid, tid, method, amount, npd_receipt, bank, masked),
                )
                self._insert_outbox(
                    conn,
                    topic="vektor.payments.ledger.v1",
                    partition_key=pid,
                    event_type="tutor.payout.requested",
                    user_id=uid,
                    role="tutor",
                    view="fees",
                    payload={"payoutId": pid, "tutorId": tid, "amountRub": amount, "method": method},
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
                    "summary": self._pg_tutor_summary_on_conn(conn, uid, tutor_id=tid),
                }
