"""Доменная логика маркетплейса: кошелёк/леджер, эскроу, заявки, расписание, лиды, контакты и выплаты (SQLite)."""

from __future__ import annotations

from datetime import datetime, timezone
import json
import re
import secrets
import sqlite3
from typing import Any

from .common import (
    StorageError,
    _iso_utc_now,
    _normalize_dow,
    _normalize_tz,
    calc_fee_split,
    format_days_short,
    mask_payout_destination,
    normalize_city_tz,
    sort_dows,
    validate_hour_slot,
    validate_schedule_plan,
    validate_telemost_url,
)

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


class SqliteMarketplaceMixin:
    def _record_mkt_outbox(self, topic: str, partition_key: str, event_type: str, payload: dict[str, Any]) -> None:
        now_iso = _iso_utc_now()
        envelope = {
            "event_id": secrets.token_hex(12),
            "event_type": event_type,
            "occurred_at": now_iso,
            "user_id": payload.get("userId"),
            "session_id": None,
            "role": payload.get("role") or "student",
            "view": payload.get("view") or "market",
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
    def _json_load(raw: Any, default: Any) -> Any:
        if raw is None or raw == "":
            return default
        if default is not None and isinstance(raw, type(default)):
            return raw
        try:
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if default is None:
                return parsed if isinstance(parsed, dict) else None
            return parsed if isinstance(parsed, type(default)) else default
        except (TypeError, json.JSONDecodeError):
            return default

    def _wallet_snapshot(self, user_id: int) -> dict[str, Any]:
        uid = int(user_id)
        now_iso = _iso_utc_now()
        self._conn.execute(
            """
            INSERT OR IGNORE INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
            VALUES (?, 0, 0, 'trial5k', '[]', ?)
            """,
            (uid, now_iso),
        )
        w = self._conn.execute("SELECT * FROM wallets WHERE user_id = ?", (uid,)).fetchone()
        frozen_row = self._conn.execute(
            """
            SELECT COALESCE(SUM(reserved_rub), 0) AS frozen
            FROM admin_lesson_requests
            WHERE student_user_id = ? AND reserved_rub > 0 AND status IN ('pending', 'offered', 'countered', 'accepted')
            """,
            (uid,),
        ).fetchone()
        led_rows = self._conn.execute(
            """
            SELECT id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
            FROM wallet_ledger
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 30
            """,
            (uid,),
        ).fetchall()
        cards = self._json_load(w["saved_cards_json"] if w else "[]", [])
        return {
            "balanceRub": int(w["balance_rub"]) if w else 0,
            "frozenRub": int(frozen_row["frozen"]) if frozen_row else 0,
            "initialPaid": bool(w["initial_paid"]) if w else False,
            "planId": str(w["plan_id"] or "trial5k") if w else "trial5k",
            "savedCards": cards,
            "ledger": [
                {
                    "id": int(r["id"]),
                    "kind": str(r["kind"]),
                    "amountRub": int(r["amount_rub"]),
                    "balanceAfterRub": int(r["balance_after_rub"]),
                    "feeRub": int(r["fee_rub"]),
                    "method": str(r["method"] or ""),
                    "refType": str(r["ref_type"] or ""),
                    "refId": str(r["ref_id"] or ""),
                    "note": str(r["note"] or ""),
                    "createdAt": str(r["created_at"]),
                }
                for r in led_rows
            ],
        }

    def get_wallet(self, user_id: int) -> dict[str, Any]:
        with self._lock:
            snap = self._wallet_snapshot(user_id)
            self._conn.commit()
            return snap

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
        now_iso = _iso_utc_now()
        with self._lock:
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
            cur_plan = str(w["plan_id"] or "trial5k")
            saved_cards = self._json_load(w["saved_cards_json"], [])
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
            new_initial = 1 if (initial_paid or amt >= 490 or new_bal >= 490) else 0
            if not plan_id and new_bal >= 8900:
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
                ) VALUES (?, 'topup', ?, ?, ?, ?, 'plan', ?, ?, ?)
                """,
                (
                    uid,
                    amt,
                    new_bal,
                    fee_rub,
                    clean_method,
                    next_plan,
                    f"Пополнение баланса ({'Карта +3%' if clean_method == 'card' else 'СБП'})",
                    now_iso,
                ),
            )
            self._record_mkt_outbox(
                "vektor.payments.ledger.v1",
                str(uid),
                "wallet.topup",
                {"userId": uid, "amountRub": amt, "feeRub": fee_rub, "method": clean_method, "balanceAfterRub": new_bal},
            )
            self._conn.commit()
            return self._wallet_snapshot(uid)

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
        now_iso = _iso_utc_now()
        with self._lock:
            self._conn.execute(
                """
                INSERT OR IGNORE INTO wallets (user_id, balance_rub, initial_paid, plan_id, saved_cards_json, updated_at)
                VALUES (?, 0, 0, 'trial5k', '[]', ?)
                """,
                (uid, now_iso),
            )
            w = self._conn.execute("SELECT saved_cards_json FROM wallets WHERE user_id = ?", (uid,)).fetchone()
            cards = self._json_load(w["saved_cards_json"] if w else "[]", [])
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
                self._conn.execute(
                    "UPDATE wallets SET saved_cards_json = ?, updated_at = ? WHERE user_id = ?",
                    (json.dumps(cards[:10], ensure_ascii=False), now_iso, uid),
                )
                self._conn.commit()
            return {"card": card_obj, "wallet": self._wallet_snapshot(uid)}

    def delete_saved_card(self, user_id: int, card_id: str) -> dict[str, Any]:
        uid = int(user_id)
        cid = str(card_id or "").strip()
        now_iso = _iso_utc_now()
        with self._lock:
            snap = self._wallet_snapshot(uid)
            cards = [c for c in snap["savedCards"] if str(c.get("id") or "") != cid]
            removed = len(cards) != len(snap["savedCards"])
            if removed:
                self._conn.execute(
                    "UPDATE wallets SET saved_cards_json = ?, updated_at = ? WHERE user_id = ?",
                    (json.dumps(cards, ensure_ascii=False), now_iso, uid),
                )
                self._conn.commit()
            return {"ok": True, "removed": removed, "wallet": self._wallet_snapshot(uid)}

    def _tutor_row_to_public_dict(self, r: sqlite3.Row) -> dict[str, Any]:
        keys = set(r.keys())
        return {
            "id": str(r["id"]),
            "userId": int(r["user_id"]) if r["user_id"] is not None else None,
            "fullName": str(r["full_name"]),
            "name": str(r["full_name"]),
            "subject": str(r["subject"]),
            "subjects": self._json_load(r["subjects_json"], []) if "subjects_json" in keys else [],
            "exams": self._json_load(r["exams_json"], ["ЕГЭ"]) if "exams_json" in keys else ["ЕГЭ"],
            "formats": self._json_load(r["formats_json"], ["Онлайн"]) if "formats_json" in keys else ["Онлайн"],
            "city": str(r["city"]),
            "timezone": str(r["timezone"]),
            "baseRateRub": int(r["base_rate_rub"]),
            "price": int(r["base_rate_rub"]),
            "marketRateRub": int(r["market_rate_rub"]),
            "marketPrice": int(r["market_rate_rub"]),
            "sourceChannel": str(r["source_channel"]),
            "tariffId": str(r["tariff_id"]),
            "whatsappPhone": str(r["whatsapp_phone"] or ""),
            "telegramHandle": str(r["telegram_handle"] or ""),
            "maxHandle": str(r["max_handle"] or ""),
            "photoUrl": str(r["photo_url"] or "") if "photo_url" in keys else "",
            "headline": str(r["headline"] or "") if "headline" in keys else "",
            "bio": str(r["bio"] or "") if "bio" in keys else "",
            "education": str(r["education"] or "") if "education" in keys else "",
            "expYears": int(r["exp_years"]) if "exp_years" in keys else 3,
            "avgScore": int(r["avg_score"]) if "avg_score" in keys else 85,
            "customSkills": str(r["custom_skills"] or "") if "custom_skills" in keys else "",
            "firstLessonGuarantee": bool(r["first_lesson_guarantee"]) if "first_lesson_guarantee" in keys else True,
            "hasPhoto": bool(r["has_photo"]),
            "verified": bool(r["verified"]),
            "bumpedToday": bool(r["bumped_today"]),
            "rating": float(r["rating"]),
            "reviewsCount": int(r["reviews_count"]),
            "lastBumpedAt": str(r["last_bumped_at"]),
            "updatedAt": str(r["updated_at"]),
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
            clauses.append("(LOWER(subject) LIKE ? OR LOWER(subjects_json) LIKE ?)")
            params.extend([f"%{s}%", f"%{s}%"])
        if city and city.strip().lower() not in ("", "all"):
            clauses.append("LOWER(city) = ?")
            params.append(city.strip().lower())
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM admin_tutors {where} ORDER BY bumped_today DESC, rating DESC, id ASC LIMIT ?",
                (*params, lim),
            ).fetchall()
        return [self._tutor_row_to_public_dict(r) for r in rows]

    def _ensure_tutor_exists(
        self,
        tutor_id: str,
        *,
        tutor_name: str = "Преподаватель Вектор ЕГЭ",
        subject: str = "Подготовка",
        city: str | None = None,
        timezone_str: str | None = None,
        base_rate_rub: int = 1200,
        whatsapp_phone: str = "",
        telegram_handle: str = "",
        max_handle: str = "",
    ) -> sqlite3.Row:
        tid = tutor_id.strip()[:64]
        existing = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
        if existing:
            return existing
        norm_city, norm_tz = normalize_city_tz(city, timezone_str)
        rate = max(100, min(99999, int(base_rate_rub or 1200)))
        mkt_rate = max(rate, ((rate * 128 + 50) // 100))
        now_iso = _iso_utc_now()
        self._conn.execute(
            """
            INSERT INTO admin_tutors (
                id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                source_channel, tariff_id, whatsapp_phone, telegram_handle, max_handle,
                has_photo, verified, bumped_today, rating, reviews_count,
                last_bumped_at, created_at, updated_at
            ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, 'platform', 'free', ?, ?, ?, 0, 1, 0, 4.9, 12, ?, ?, ?)
            """,
            (
                tid,
                (tutor_name or "Преподаватель Вектор ЕГЭ").strip()[:80],
                (subject or "Подготовка").strip()[:64],
                norm_city,
                norm_tz,
                rate,
                mkt_rate,
                (whatsapp_phone or "").strip()[:32],
                (telegram_handle or "").strip()[:64],
                (max_handle or "").strip()[:64],
                now_iso,
                now_iso,
                now_iso,
            ),
        )
        return self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()

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

        now_iso = _iso_utc_now()
        with self._lock:
            own = self._conn.execute("SELECT * FROM admin_tutors WHERE user_id = ? LIMIT 1", (uid,)).fetchone()
            tid = str(own["id"]) if own else str(tutor_id or f"tut-{secrets.token_hex(5)}").strip()[:64]
            if not own:
                clash = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
                if clash and clash["user_id"] is not None and int(clash["user_id"]) != uid:
                    tid = f"tut-{secrets.token_hex(5)}"
            photo_url = str(payload.get("photo") or payload.get("photoUrl") or "").strip()[:220_000]
            has_photo = 1 if photo_url else 0
            tariff_id = str(payload.get("tariffId") or (own["tariff_id"] if own else "free"))
            if tariff_id not in ("free", "trial5k", "month10k"):
                tariff_id = "free"
            bumped_today = int(own["bumped_today"]) if own else 0
            verified = int(own["verified"]) if own else 1
            last_bumped_at = str(own["last_bumped_at"]) if own else now_iso

            self._conn.execute(
                """
                INSERT INTO admin_tutors (
                    id, user_id, full_name, subject, city, timezone, base_rate_rub, market_rate_rub,
                    source_channel, tariff_id, whatsapp_phone, telegram_handle, max_handle,
                    has_photo, verified, bumped_today, rating, reviews_count,
                    last_bumped_at, created_at, updated_at,
                    photo_url, headline, bio, education, exp_years, avg_score,
                    subjects_json, exams_json, formats_json, custom_skills, first_lesson_guarantee
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'platform', ?, ?, ?, ?, ?, ?, ?, 4.9, 12, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    user_id = excluded.user_id,
                    full_name = excluded.full_name,
                    subject = excluded.subject,
                    city = excluded.city,
                    timezone = excluded.timezone,
                    base_rate_rub = excluded.base_rate_rub,
                    market_rate_rub = excluded.market_rate_rub,
                    whatsapp_phone = excluded.whatsapp_phone,
                    telegram_handle = excluded.telegram_handle,
                    max_handle = excluded.max_handle,
                    has_photo = excluded.has_photo,
                    updated_at = excluded.updated_at,
                    photo_url = excluded.photo_url,
                    headline = excluded.headline,
                    bio = excluded.bio,
                    education = excluded.education,
                    exp_years = excluded.exp_years,
                    avg_score = excluded.avg_score,
                    subjects_json = excluded.subjects_json,
                    exams_json = excluded.exams_json,
                    formats_json = excluded.formats_json,
                    custom_skills = excluded.custom_skills,
                    first_lesson_guarantee = excluded.first_lesson_guarantee
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
                    last_bumped_at,
                    now_iso,
                    now_iso,
                    photo_url,
                    str(payload.get("headline") or "").strip()[:120],
                    str(payload.get("bio") or "").strip()[:600],
                    str(payload.get("education") or "").strip()[:120],
                    max(1, min(60, int(payload.get("expYears") or 3))),
                    max(40, min(100, int(payload.get("avgScore") or 85))),
                    json.dumps(clean_subjects, ensure_ascii=False),
                    json.dumps(exams, ensure_ascii=False),
                    json.dumps(formats, ensure_ascii=False),
                    str(payload.get("customSkills") or "").strip()[:240],
                    1 if payload.get("firstLessonGuarantee", True) else 0,
                ),
            )
            self._conn.execute("UPDATE users SET role = 'tutor' WHERE id = ? AND role = 'student'", (uid,))
            self._record_mkt_outbox(
                "vektor.tutors.raw.v1",
                tid,
                "tutor.profile.updated",
                {"userId": uid, "tutorId": tid, "role": "tutor", "view": "cabinet", "city": norm_city, "price": base_rate},
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
            return {"tutor": self._tutor_row_to_public_dict(row), "slots": clean_slots}

    def bump_tutor(self, user_id: int, *, actor_role: str = "student", tutor_id: str | None = None) -> dict[str, Any]:
        uid = int(user_id)
        with self._lock:
            row = None
            if tutor_id:
                row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tutor_id.strip(),)).fetchone()
                if row and row["user_id"] is not None and int(row["user_id"]) != uid and actor_role != "admin":
                    raise StorageError("forbidden", "Нет прав на поднятие чужой анкеты.", 403)
            if row is None:
                row = self._conn.execute("SELECT * FROM admin_tutors WHERE user_id = ? LIMIT 1", (uid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Сначала сохраните анкету преподавателя.", 404)
            now_dt = datetime.now(timezone.utc)
            if bool(row["bumped_today"]) and row["last_bumped_at"]:
                try:
                    last_dt = datetime.fromisoformat(str(row["last_bumped_at"]).replace("Z", "+00:00"))
                    elapsed = (now_dt - last_dt).total_seconds()
                    if 0 <= elapsed < 14400:
                        rem = int(14400 - elapsed)
                        mins = max(1, (rem + 59) // 60)
                        raise StorageError(
                            "bump_cooldown",
                            f"Поднятие анкеты доступно раз в 4 часа. Осталось ~{mins} мин.",
                            429,
                        )
                except ValueError:
                    pass
            now_iso = _iso_utc_now()
            tid = str(row["id"])
            self._conn.execute(
                "UPDATE admin_tutors SET bumped_today = 1, last_bumped_at = ?, updated_at = ? WHERE id = ?",
                (now_iso, now_iso, tid),
            )
            self._record_mkt_outbox(
                "vektor.market.bids.v1",
                tid,
                "tutor.bumped",
                {"userId": uid, "tutorId": tid, "role": "tutor", "view": "cabinet", "lastBumpedAt": now_iso},
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tid,)).fetchone()
            return self._tutor_row_to_public_dict(updated)

    def _booking_row_to_dict(self, r: sqlite3.Row) -> dict[str, Any]:
        keys = set(r.keys())
        raw_status = str(r["status"] or "pending")
        eff_price = int(r["final_price_rub"] or r["counter_price_rub"] or r["offer_price_rub"] or 0)
        fee, payout = calc_fee_split(eff_price)
        slot_date = str(r["slot_date"] or "")[:10]
        dows = sort_dows(self._json_load(r["dows_json"], [])) if "dows_json" in keys else []
        schedule_plan = None
        if "schedule_plan_json" in keys and r["schedule_plan_json"]:
            schedule_plan = self._json_load(r["schedule_plan_json"], None)
        return {
            "id": str(r["id"]),
            "tutorId": str(r["tutor_id"]),
            "tutorName": str(r["tutor_name"] or ""),
            "studentUserId": int(r["student_user_id"]) if r["student_user_id"] is not None else None,
            "studentName": str(r["student_name"] or "Ученик"),
            "subject": str(r["subject"] or "Подготовка"),
            "subjectName": str(r["subject"] or "Подготовка"),
            "exam": str(r["exam"] or "ЕГЭ") if "exam" in keys else "ЕГЭ",
            "format": str(r["format"] or "Онлайн") if "format" in keys else "Онлайн",
            "city": str(r["city"] or "Якутск"),
            "timezone": _normalize_tz(r["timezone"]),
            "dayIso": slot_date,
            "slotDate": slot_date,
            "dow": dows[0] if dows else _normalize_dow(None, slot_date),
            "dows": dows,
            "dayLabel": (str(r["day_label"] or "") if "day_label" in keys else "") or (format_days_short(dows) if dows else slot_date),
            "hour": str(r["hour_slot"] or "16:00"),
            "tariffId": str(r["tariff_id"] or "trial5k"),
            "offerPrice": int(r["offer_price_rub"] or 0),
            "counterPrice": int(r["counter_price_rub"]) if r["counter_price_rub"] is not None else None,
            "finalPrice": int(r["final_price_rub"]) if r["final_price_rub"] is not None else None,
            "tutorPrice": int(r["tutor_price_rub"]) if ("tutor_price_rub" in keys and r["tutor_price_rub"] is not None) else int(r["offer_price_rub"] or 0),
            "reserved": int(r["reserved_rub"] or 0) if "reserved_rub" in keys else 0,
            "firstLessonGuarantee": bool(r["first_lesson_guarantee"]) if "first_lesson_guarantee" in keys else True,
            "fee": fee,
            "payout": payout,
            "note": str(r["note"] or "") if "note" in keys else "",
            "telemostUrl": str(r["telemost_url"] or "") if "telemost_url" in keys else "",
            "schedulePlan": schedule_plan,
            "status": _PG_TO_MKT_STATUS.get(raw_status, raw_status),
            "rawStatus": raw_status,
            "escrowStatus": str(r["escrow_status"] or "none"),
            "messengerChannel": str(r["messenger_channel"] or "whatsapp"),
            "createdAt": str(r["created_at"]),
            "updatedAt": str(r["updated_at"]),
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
        with self._lock:
            if scope == "tutor":
                tid = (tutor_id or "").strip()
                if tid:
                    rows = self._conn.execute(
                        """
                        SELECT lr.* FROM admin_lesson_requests lr
                        JOIN admin_tutors t ON t.id = lr.tutor_id
                        WHERE lr.tutor_id = ? AND (t.user_id = ? OR t.user_id IS NULL)
                        ORDER BY lr.updated_at DESC, lr.id DESC LIMIT ?
                        """,
                        (tid, uid, lim),
                    ).fetchall()
                else:
                    rows = self._conn.execute(
                        """
                        SELECT lr.* FROM admin_lesson_requests lr
                        JOIN admin_tutors t ON t.id = lr.tutor_id
                        WHERE t.user_id = ?
                        ORDER BY lr.updated_at DESC, lr.id DESC LIMIT ?
                        """,
                        (uid, lim),
                    ).fetchall()
            else:
                rows = self._conn.execute(
                    """
                    SELECT * FROM admin_lesson_requests
                    WHERE student_user_id = ?
                    ORDER BY updated_at DESC, id DESC LIMIT ?
                    """,
                    (uid, lim),
                ).fetchall()
        return [self._booking_row_to_dict(r) for r in rows]

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
            raw_date = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        try:
            datetime.strptime(raw_date, "%Y-%m-%d")
        except ValueError as exc:
            raise StorageError("invalid_date", "Ожидалась дата в формате ГГГГ-ММ-ДД.", 400) from exc

        bid = str(booking_id or f"bk-{secrets.token_hex(6)}").strip()[:64]
        now_iso = _iso_utc_now()
        with self._lock:
            snap = self._wallet_snapshot(uid)
            cur_bal = int(snap["balanceRub"])
            if offer_price > 0 and cur_bal < offer_price:
                raise StorageError(
                    "insufficient_balance",
                    f"Недостаточно средств на балансе: нужно {offer_price} ₽, доступно {cur_bal} ₽.",
                    402,
                )
            u_row = self._conn.execute(
                "SELECT username, display_name, city FROM users WHERE id = ?",
                (uid,),
            ).fetchone()
            student_name = str(
                payload.get("studentName")
                or (u_row["display_name"] if u_row else "")
                or (u_row["username"] if u_row else "")
                or "Ученик"
            ).strip()[:64]
            tutor_row = self._ensure_tutor_exists(
                tutor_id,
                tutor_name=str(payload.get("tutorName") or "Преподаватель Вектор ЕГЭ"),
                subject=str(payload.get("subjectName") or payload.get("subject") or "Подготовка"),
                city=payload.get("city") or (u_row["city"] if u_row else None),
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
            tariff_id = str(payload.get("tariffId") or snap["planId"] or "trial5k")
            if tariff_id not in ("free", "trial5k", "month10k"):
                tariff_id = "trial5k"
            dow = _normalize_dow(payload.get("dow"), raw_date)

            reserved = offer_price if offer_price > 0 else 0
            if reserved > 0:
                new_bal = cur_bal - reserved
                self._conn.execute(
                    "UPDATE wallets SET balance_rub = ?, updated_at = ? WHERE user_id = ?",
                    (new_bal, now_iso, uid),
                )
                self._conn.execute(
                    """
                    INSERT INTO wallet_ledger (
                        user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                    ) VALUES (?, 'escrow_freeze', ?, ?, 0, 'escrow', 'booking', ?, ?, ?)
                    """,
                    (uid, -reserved, new_bal, bid, f"Заморозка по заявке к {tutor_name}", now_iso),
                )
                fee, payout = calc_fee_split(reserved)
                self._conn.execute(
                    """
                    INSERT INTO escrow_holds (
                        id, request_id, tutor_id, student_user_id, gross_rub,
                        platform_fee_rub, tutor_payout_rub, status, created_at, settled_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'frozen', ?, NULL)
                    """,
                    (f"esc-{bid}", bid, tutor_id, uid, reserved, fee, payout, now_iso),
                )
                escrow_status = "frozen"
            else:
                escrow_status = "none"

            self._conn.execute(
                """
                INSERT INTO admin_lesson_requests (
                    id, tutor_id, tutor_name, student_user_id, student_name, subject, city, timezone,
                    slot_date, hour_slot, tariff_id, offer_price_rub, counter_price_rub, final_price_rub,
                    status, escrow_status, messenger_channel, created_at, updated_at,
                    exam, format, note, telemost_url, schedule_plan_json, dows_json,
                    day_label, tutor_price_rub, first_lesson_guarantee, reserved_rub
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 'pending', ?, 'whatsapp', ?, ?, ?, ?, ?, '', NULL, ?, ?, ?, ?, ?)
                """,
                (
                    bid,
                    tutor_id,
                    tutor_name,
                    uid,
                    student_name,
                    subj,
                    city,
                    tz,
                    raw_date,
                    hour_slot,
                    tariff_id,
                    offer_price,
                    escrow_status,
                    now_iso,
                    now_iso,
                    exam,
                    fmt,
                    note,
                    json.dumps([dow]),
                    day_label,
                    tutor_price,
                    1 if payload.get("firstLessonGuarantee", True) else 0,
                    reserved,
                ),
            )
            self._record_mkt_outbox(
                "vektor.market.bids.v1",
                bid,
                "market.bid.created",
                {"userId": uid, "bookingId": bid, "tutorId": tutor_id, "offerPrice": offer_price, "reserved": reserved},
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM admin_lesson_requests WHERE id = ?", (bid,)).fetchone()
            return {"booking": self._booking_row_to_dict(row), "wallet": self._wallet_snapshot(uid)}

    def _load_authorized_booking(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
    ) -> tuple[sqlite3.Row, bool, bool]:
        bid = str(booking_id or "").strip()
        row = self._conn.execute(
            """
            SELECT lr.*, t.user_id AS tutor_owner_uid
            FROM admin_lesson_requests lr
            LEFT JOIN admin_tutors t ON t.id = lr.tutor_id
            WHERE lr.id = ?
            """,
            (bid,),
        ).fetchone()
        if not row:
            raise StorageError("not_found", "Заявка не найдена.", 404)
        uid = int(actor_user_id)
        is_admin = (actor_role or "").strip().lower() == "admin"
        is_student = row["student_user_id"] is not None and int(row["student_user_id"]) == uid
        is_tutor = row["tutor_owner_uid"] is not None and int(row["tutor_owner_uid"]) == uid
        if not (is_admin or is_student or is_tutor):
            raise StorageError("forbidden", "Нет доступа к этой заявке.", 403)
        return row, is_student, is_tutor

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
        now_iso = _iso_utc_now()
        with self._lock:
            row, is_student, is_tutor = self._load_authorized_booking(
                booking_id, actor_user_id=actor_user_id, actor_role=actor_role
            )
            bid = str(row["id"])
            is_admin = (actor_role or "").strip().lower() == "admin"
            cur_raw = str(row["status"] or "pending")
            cur_norm = _PG_TO_MKT_STATUS.get(cur_raw, cur_raw)
            if cur_norm in ("cancelled", "declined", "refunded", "completed"):
                raise StorageError("invalid_transition", f"Заявка уже в финальном статусе ({cur_norm}).", 409)
            tutor_owned = row["tutor_owner_uid"] is not None
            if act in ("counter", "decline") and tutor_owned and not (is_tutor or is_admin):
                raise StorageError("forbidden", "Только преподаватель может изменить или отклонить ставку.", 403)
            if act == "accept" and tutor_owned and cur_norm == "pending" and not (is_tutor or is_admin):
                raise StorageError("forbidden", "Подтвердить новую ставку должен преподаватель.", 403)

            student_uid = int(row["student_user_id"]) if row["student_user_id"] is not None else None
            cur_reserved = int(row["reserved_rub"] or 0)
            tutor_id = str(row["tutor_id"])

            if act == "counter":
                if cur_norm not in ("pending", "countered"):
                    raise StorageError("invalid_transition", "Нельзя предложить контр-цену для текущей заявки.", 409)
                cp = int(counter_price_rub or 0)
                if cp <= 0 or cp > 99999:
                    raise StorageError("invalid_price", "Укажите корректную контр-цену от 1 до 99 999 ₽.", 400)
                self._conn.execute(
                    "UPDATE admin_lesson_requests SET status = 'countered', counter_price_rub = ?, updated_at = ? WHERE id = ?",
                    (cp, now_iso, bid),
                )
                self._record_mkt_outbox(
                    "vektor.market.bids.v1",
                    bid,
                    "market.bid.countered",
                    {"userId": actor_user_id, "bookingId": bid, "counterPrice": cp},
                )

            elif act == "accept":
                if cur_norm not in ("pending", "countered"):
                    raise StorageError("invalid_transition", "Заявка уже подтверждена.", 409)
                eff_price = int(counter_price_rub or row["counter_price_rub"] or row["offer_price_rub"] or 0)
                new_reserved = cur_reserved
                if student_uid is not None and eff_price >= 0:
                    delta = eff_price - cur_reserved
                    snap = self._wallet_snapshot(student_uid)
                    bal = int(snap["balanceRub"])
                    if delta > 0:
                        if bal < delta:
                            raise StorageError(
                                "insufficient_balance",
                                f"Недостаточно средств для доплаты ({delta} ₽).",
                                402,
                            )
                        new_bal = bal - delta
                        self._conn.execute(
                            "UPDATE wallets SET balance_rub = ?, updated_at = ? WHERE user_id = ?",
                            (new_bal, now_iso, student_uid),
                        )
                        self._conn.execute(
                            """
                            INSERT INTO wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                            ) VALUES (?, 'escrow_freeze', ?, ?, 0, 'escrow', 'booking', ?, ?, ?)
                            """,
                            (student_uid, -delta, new_bal, bid, f"Корректировка резерва по {bid}", now_iso),
                        )
                    elif delta < 0:
                        refund = -delta
                        new_bal = bal + refund
                        self._conn.execute(
                            "UPDATE wallets SET balance_rub = ?, updated_at = ? WHERE user_id = ?",
                            (new_bal, now_iso, student_uid),
                        )
                        self._conn.execute(
                            """
                            INSERT INTO wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                            ) VALUES (?, 'escrow_refund', ?, ?, 0, 'escrow', 'booking', ?, ?, ?)
                            """,
                            (student_uid, refund, new_bal, bid, f"Частичный возврат резерва по {bid}", now_iso),
                        )
                    new_reserved = eff_price

                if eff_price > 0:
                    fee, payout = calc_fee_split(eff_price)
                    self._conn.execute(
                        """
                        INSERT INTO escrow_holds (
                            id, request_id, tutor_id, student_user_id, gross_rub,
                            platform_fee_rub, tutor_payout_rub, status, created_at, settled_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'frozen', ?, NULL)
                        ON CONFLICT(request_id) DO UPDATE SET
                            gross_rub = excluded.gross_rub,
                            platform_fee_rub = excluded.platform_fee_rub,
                            tutor_payout_rub = excluded.tutor_payout_rub,
                            status = 'frozen',
                            settled_at = NULL
                        """,
                        (f"esc-{bid}", bid, tutor_id, student_uid, eff_price, fee, payout, now_iso),
                    )
                    next_esc = "frozen"
                else:
                    next_esc = "none"

                self._conn.execute(
                    """
                    UPDATE admin_lesson_requests
                    SET status = 'accepted',
                        counter_price_rub = COALESCE(?, counter_price_rub),
                        final_price_rub = ?,
                        reserved_rub = ?,
                        escrow_status = ?,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (eff_price if counter_price_rub else None, eff_price, new_reserved, next_esc, now_iso, bid),
                )
                self._record_mkt_outbox(
                    "vektor.market.bids.v1",
                    bid,
                    "market.bid.accepted",
                    {"userId": actor_user_id, "bookingId": bid, "finalPriceRub": eff_price},
                )

            elif act in ("cancel", "decline"):
                if student_uid is not None and cur_reserved > 0:
                    snap = self._wallet_snapshot(student_uid)
                    new_bal = int(snap["balanceRub"]) + cur_reserved
                    self._conn.execute(
                        "UPDATE wallets SET balance_rub = ?, updated_at = ? WHERE user_id = ?",
                        (new_bal, now_iso, student_uid),
                    )
                    self._conn.execute(
                        """
                        INSERT INTO wallet_ledger (
                            user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                        ) VALUES (?, 'escrow_refund', ?, ?, 0, 'escrow', 'booking', ?, ?, ?)
                        """,
                        (student_uid, cur_reserved, new_bal, bid, f"Возврат при отмене заявки {bid}", now_iso),
                    )
                self._conn.execute(
                    "UPDATE escrow_holds SET status = 'refunded', settled_at = ? WHERE request_id = ?",
                    (now_iso, bid),
                )
                next_status = "declined" if act == "decline" else "cancelled"
                next_esc = "refunded" if (cur_reserved > 0 or str(row["escrow_status"]) in ("frozen", "captured")) else "none"
                self._conn.execute(
                    """
                    UPDATE admin_lesson_requests
                    SET status = ?, escrow_status = ?, reserved_rub = 0, updated_at = ?
                    WHERE id = ?
                    """,
                    (next_status, next_esc, now_iso, bid),
                )
                self._record_mkt_outbox(
                    "vektor.payments.ledger.v1",
                    bid,
                    f"market.bid.{next_status}",
                    {"userId": actor_user_id, "bookingId": bid, "refundedRub": cur_reserved},
                )

            elif act == "complete":
                if cur_norm != "accepted":
                    raise StorageError("invalid_transition", "Завершить можно только подтверждённое занятие.", 409)
                eff_price = int(row["final_price_rub"] or row["counter_price_rub"] or row["offer_price_rub"] or 0)
                if eff_price > 0:
                    fee, payout = calc_fee_split(eff_price)
                    self._conn.execute(
                        """
                        INSERT INTO escrow_holds (
                            id, request_id, tutor_id, student_user_id, gross_rub,
                            platform_fee_rub, tutor_payout_rub, status, created_at, settled_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, 'captured', ?, ?)
                        ON CONFLICT(request_id) DO UPDATE SET
                            gross_rub = excluded.gross_rub,
                            platform_fee_rub = excluded.platform_fee_rub,
                            tutor_payout_rub = excluded.tutor_payout_rub,
                            status = 'captured',
                            settled_at = excluded.settled_at
                        """,
                        (f"esc-{bid}", bid, tutor_id, student_uid, eff_price, fee, payout, now_iso, now_iso),
                    )
                    if student_uid is not None and cur_reserved > 0:
                        snap = self._wallet_snapshot(student_uid)
                        self._conn.execute(
                            """
                            INSERT INTO wallet_ledger (
                                user_id, kind, amount_rub, balance_after_rub, fee_rub, method, ref_type, ref_id, note, created_at
                            ) VALUES (?, 'escrow_capture', 0, ?, ?, 'escrow', 'booking', ?, ?, ?)
                            """,
                            (student_uid, int(snap["balanceRub"]), fee, bid, f"Урок проведён: списано {eff_price} ₽", now_iso),
                        )
                self._conn.execute(
                    """
                    UPDATE admin_lesson_requests
                    SET status = 'completed',
                        final_price_rub = COALESCE(final_price_rub, ?),
                        escrow_status = CASE WHEN ? > 0 THEN 'captured' ELSE escrow_status END,
                        reserved_rub = 0,
                        updated_at = ?
                    WHERE id = ?
                    """,
                    (eff_price, eff_price, now_iso, bid),
                )
                self._record_mkt_outbox(
                    "vektor.payments.ledger.v1",
                    bid,
                    "market.lesson.completed",
                    {"userId": actor_user_id, "bookingId": bid, "grossRub": eff_price},
                )

            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_lesson_requests WHERE id = ?", (bid,)).fetchone()
            wallet_uid = student_uid if student_uid is not None else int(actor_user_id)
            return {"booking": self._booking_row_to_dict(updated), "wallet": self._wallet_snapshot(wallet_uid)}

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
        now_iso = _iso_utc_now()
        with self._lock:
            row, _, _ = self._load_authorized_booking(
                booking_id, actor_user_id=actor_user_id, actor_role=actor_role
            )
            cur_norm = _PG_TO_MKT_STATUS.get(str(row["status"] or "pending"), str(row["status"] or "pending"))
            if cur_norm in ("cancelled", "declined", "refunded"):
                raise StorageError("invalid_transition", "Нельзя изменить график отменённой заявки.", 409)
            bid = str(row["id"])
            dows = clean_plan["dows"]
            hour = clean_plan["hour"]
            day_label = format_days_short(dows)
            self._conn.execute(
                """
                UPDATE admin_lesson_requests
                SET schedule_plan_json = ?, dows_json = ?, hour_slot = ?, day_label = ?, updated_at = ?
                WHERE id = ?
                """,
                (json.dumps(clean_plan, ensure_ascii=False), json.dumps(dows), hour, day_label, now_iso, bid),
            )
            self._record_mkt_outbox(
                "vektor.market.bids.v1",
                bid,
                "market.schedule.updated",
                {"userId": actor_user_id, "bookingId": bid, "schedulePlan": clean_plan},
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_lesson_requests WHERE id = ?", (bid,)).fetchone()
            return self._booking_row_to_dict(updated)

    def update_booking_telemost(
        self,
        booking_id: str,
        *,
        actor_user_id: int,
        actor_role: str,
        telemost_url: str,
    ) -> dict[str, Any]:
        clean_url = validate_telemost_url(telemost_url)
        now_iso = _iso_utc_now()
        with self._lock:
            row, _, _ = self._load_authorized_booking(
                booking_id, actor_user_id=actor_user_id, actor_role=actor_role
            )
            bid = str(row["id"])
            self._conn.execute(
                "UPDATE admin_lesson_requests SET telemost_url = ?, updated_at = ? WHERE id = ?",
                (clean_url, now_iso, bid),
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM admin_lesson_requests WHERE id = ?", (bid,)).fetchone()
            return self._booking_row_to_dict(updated)

    def _lead_row_to_dict(self, r: sqlite3.Row) -> dict[str, Any]:
        return {
            "id": str(r["id"]),
            "studentUserId": int(r["student_user_id"]) if r["student_user_id"] is not None else None,
            "studentName": str(r["student_name"]),
            "subjects": self._json_load(r["subjects_json"], ["bio"]),
            "exam": str(r["exam"]),
            "format": str(r["format"]),
            "targetPrice": int(r["target_price_rub"]),
            "whatsapp": str(r["whatsapp"] or ""),
            "whatsappCountry": str(r["whatsapp_country"] or "RU"),
            "comment": str(r["comment"] or ""),
            "status": str(r["status"]),
            "createdAt": str(r["created_at"]),
            "updatedAt": str(r["updated_at"]),
        }

    def list_student_leads(
        self,
        *,
        subject: str | None = None,
        student_user_id: int | None = None,
        limit: int = 100,
    ) -> list[dict[str, Any]]:
        lim = max(1, min(int(limit or 100), 300))
        clauses = ["status != 'closed'"]
        params: list[Any] = []
        if student_user_id is not None:
            clauses.append("student_user_id = ?")
            params.append(int(student_user_id))
        if subject and subject.strip().lower() not in ("", "all"):
            clauses.append("LOWER(subjects_json) LIKE ?")
            params.append(f"%{subject.strip().lower()}%")
        where = "WHERE " + " AND ".join(clauses)
        with self._lock:
            rows = self._conn.execute(
                f"SELECT * FROM student_leads {where} ORDER BY created_at DESC, id DESC LIMIT ?",
                (*params, lim),
            ).fetchall()
        return [self._lead_row_to_dict(r) for r in rows]

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
        now_iso = _iso_utc_now()
        with self._lock:
            student_name = str(payload.get("studentName") or "").strip()[:64]
            if not student_name and student_user_id is not None:
                u_row = self._conn.execute("SELECT display_name, username FROM users WHERE id = ?", (int(student_user_id),)).fetchone()
                if u_row:
                    student_name = str(u_row["display_name"] or u_row["username"] or "")
            if not student_name:
                student_name = "Ученик"
            self._conn.execute(
                """
                INSERT INTO student_leads (
                    id, student_user_id, student_name, subjects_json, exam, format,
                    target_price_rub, whatsapp, whatsapp_country, comment, status, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
                """,
                (
                    lid,
                    int(student_user_id) if student_user_id is not None else None,
                    student_name,
                    json.dumps(subjects, ensure_ascii=False),
                    str(payload.get("exam") or "ЕГЭ").strip()[:32],
                    str(payload.get("format") or "Онлайн").strip()[:32],
                    target_price,
                    str(payload.get("whatsapp") or "").strip()[:32],
                    str(payload.get("whatsappCountry") or "RU").strip().upper()[:12] or "RU",
                    str(payload.get("comment") or "").strip()[:500],
                    now_iso,
                    now_iso,
                ),
            )
            self._record_mkt_outbox(
                "vektor.market.bids.v1",
                lid,
                "market.lead.created",
                {"userId": student_user_id, "leadId": lid, "subjects": subjects, "targetPrice": target_price},
            )
            self._conn.commit()
            row = self._conn.execute("SELECT * FROM student_leads WHERE id = ?", (lid,)).fetchone()
            return self._lead_row_to_dict(row)

    def close_student_lead(
        self,
        lead_id: str,
        *,
        actor_user_id: int,
        actor_role: str = "student",
    ) -> dict[str, Any]:
        lid = str(lead_id or "").strip()
        now_iso = _iso_utc_now()
        with self._lock:
            row = self._conn.execute("SELECT * FROM student_leads WHERE id = ?", (lid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Запрос не найден.", 404)
            is_admin = (actor_role or "").strip().lower() == "admin"
            is_owner = row["student_user_id"] is not None and int(row["student_user_id"]) == int(actor_user_id)
            if not (is_admin or is_owner):
                raise StorageError("forbidden", "Нет прав на закрытие этого запроса.", 403)
            self._conn.execute(
                "UPDATE student_leads SET status = 'closed', updated_at = ? WHERE id = ?",
                (now_iso, lid),
            )
            self._conn.commit()
            updated = self._conn.execute("SELECT * FROM student_leads WHERE id = ?", (lid,)).fetchone()
            return self._lead_row_to_dict(updated)

    def list_tutor_contacts(self, user_id: int) -> dict[str, dict[str, str]]:
        uid = int(user_id)
        with self._lock:
            rows = self._conn.execute(
                "SELECT tutor_id, whatsapp, telegram, max_handle FROM tutor_contact_overrides WHERE user_id = ?",
                (uid,),
            ).fetchall()
        return {
            str(r["tutor_id"]): {
                "whatsapp": str(r["whatsapp"] or ""),
                "telegram": str(r["telegram"] or ""),
                "maxHandle": str(r["max_handle"] or ""),
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
        now_iso = _iso_utc_now()
        with self._lock:
            prev = self._conn.execute(
                "SELECT whatsapp, telegram, max_handle FROM tutor_contact_overrides WHERE user_id = ? AND tutor_id = ?",
                (uid, tid),
            ).fetchone()
            next_wa = str(whatsapp).strip()[:32] if whatsapp is not None else (str(prev["whatsapp"]) if prev else "")
            next_tg = str(telegram).strip()[:64] if telegram is not None else (str(prev["telegram"]) if prev else "")
            next_max = str(max_handle).strip()[:64] if max_handle is not None else (str(prev["max_handle"]) if prev else "")
            self._conn.execute(
                """
                INSERT INTO tutor_contact_overrides (user_id, tutor_id, whatsapp, telegram, max_handle, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(user_id, tutor_id) DO UPDATE SET
                    whatsapp = excluded.whatsapp,
                    telegram = excluded.telegram,
                    max_handle = excluded.max_handle,
                    updated_at = excluded.updated_at
                """,
                (uid, tid, next_wa, next_tg, next_max, now_iso),
            )
            self._conn.commit()
            return {"whatsapp": next_wa, "telegram": next_tg, "maxHandle": next_max}

    def get_tutor_wallet_summary(self, user_id: int, tutor_id: str | None = None) -> dict[str, Any]:
        uid = int(user_id)
        with self._lock:
            row = None
            if tutor_id:
                row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (tutor_id.strip(),)).fetchone()
            if row is None:
                row = self._conn.execute("SELECT * FROM admin_tutors WHERE user_id = ? LIMIT 1", (uid,)).fetchone()
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
            agg = self._conn.execute(
                """
                SELECT
                    COALESCE(SUM(CASE WHEN status = 'captured' THEN tutor_payout_rub ELSE 0 END), 0) AS earned_net,
                    COALESCE(SUM(CASE WHEN status = 'frozen' THEN tutor_payout_rub ELSE 0 END), 0) AS frozen_net
                FROM escrow_holds
                WHERE tutor_id = ?
                """,
                (tid,),
            ).fetchone()
            wd_row = self._conn.execute(
                """
                SELECT COALESCE(SUM(amount_rub), 0) AS withdrawn
                FROM admin_payout_requests
                WHERE tutor_id = ? AND status NOT IN ('failed', 'rejected')
                """,
                (tid,),
            ).fetchone()
            p_rows = self._conn.execute(
                """
                SELECT * FROM admin_payout_requests
                WHERE tutor_id = ?
                ORDER BY created_at DESC, id DESC
                LIMIT 30
                """,
                (tid,),
            ).fetchall()
            earned = int(agg["earned_net"]) if agg else 0
            frozen = int(agg["frozen_net"]) if agg else 0
            withdrawn = int(wd_row["withdrawn"]) if wd_row else 0
            return {
                "tutorId": tid,
                "earnedNetRub": earned,
                "frozenNetRub": frozen,
                "withdrawnRub": withdrawn,
                "availableRub": max(0, earned - withdrawn),
                "minPayoutRub": 500,
                "payouts": [self._admin_payout_row_to_dict(r) for r in p_rows],
            }

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
        npd_receipt = f"NPD-{datetime.now(timezone.utc).year}-{secrets.token_hex(4).upper()}" if npd_flag else None
        pid = str(payout_id or f"pay-{secrets.token_hex(6)}").strip()[:64]
        now_iso = _iso_utc_now()
        req_tid = str(payload.get("tutorId") or "").strip() or None

        with self._lock:
            row = None
            if req_tid:
                row = self._conn.execute("SELECT * FROM admin_tutors WHERE id = ?", (req_tid,)).fetchone()
                if row and row["user_id"] is not None and int(row["user_id"]) != uid and actor_role != "admin":
                    raise StorageError("forbidden", "Нет прав на вывод средств чужой анкеты.", 403)
            if row is None:
                row = self._conn.execute("SELECT * FROM admin_tutors WHERE user_id = ? LIMIT 1", (uid,)).fetchone()
            if not row:
                raise StorageError("not_found", "Анкета преподавателя не найдена.", 404)
            tid = str(row["id"])
            summary = self.get_tutor_wallet_summary(uid, tutor_id=tid)
            if summary["availableRub"] < amount:
                raise StorageError(
                    "insufficient_payout_balance",
                    f"Доступно к выводу {summary['availableRub']} ₽.",
                    400,
                )
            self._conn.execute(
                """
                INSERT INTO admin_payout_requests (
                    id, tutor_id, tutor_name, method, amount_rub, npd_receipt,
                    bank, destination_masked, status, created_at, paid_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'processing', ?, NULL)
                """,
                (pid, tid, str(row["full_name"]), method, amount, npd_receipt, bank, masked, now_iso),
            )
            self._record_mkt_outbox(
                "vektor.payments.ledger.v1",
                pid,
                "tutor.payout.requested",
                {"userId": uid, "payoutId": pid, "tutorId": tid, "amountRub": amount, "method": method, "role": "tutor", "view": "fees"},
            )
            self._conn.commit()
            p_row = self._conn.execute("SELECT * FROM admin_payout_requests WHERE id = ?", (pid,)).fetchone()
            return {"payout": self._admin_payout_row_to_dict(p_row), "summary": self.get_tutor_wallet_summary(uid, tutor_id=tid)}
