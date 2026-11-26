"""Фоновый планировщик: автозавершение эскроу (94%), отмена просроченных заявок и напоминания в Telegram."""

from __future__ import annotations

import argparse
import asyncio
import contextlib
from dataclasses import replace
from datetime import datetime, timedelta, timezone
import json
import logging
import re
from typing import Any

import httpx

from .config import SchedulerConfig, Settings, load_settings
from .npd_fns import FnsNpdClient
from .otp_delivery import OtpDeliveryService
from .payouts import YooKassaPayoutsClient
from .realtime import RealtimeBroker
from .telegram_bot import TelegramBotService
from .yookassa import YooKassaClient

logger = logging.getLogger(__name__)

_TZ_OFFSET_RE = re.compile(r"^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$", re.IGNORECASE)
_HOUR_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
SCHEDULER_MAIN_LOCK_KEY = 481516234201
SCHEDULER_CHAT_LOCK_KEY = 481516234202


def parse_tz_offset(raw: str | None) -> timezone:
    """Преобразует часовой пояс ('UTC+9', 'UTC+3', 'Europe/Moscow') в datetime.timezone."""
    val = str(raw or "").strip()
    low = val.lower()
    if low in ("utc+3", "europe/moscow", "москва", "msk"):
        return timezone(timedelta(hours=3))
    if low in ("utc+9", "asia/yakutsk", "якутск", "ykt"):
        return timezone(timedelta(hours=9))
    m = _TZ_OFFSET_RE.match(val)
    if m:
        sign = 1 if m.group(1) == "+" else -1
        hours = int(m.group(2))
        minutes = int(m.group(3) or 0)
        if 0 <= hours <= 14 and 0 <= minutes < 60:
            delta = timedelta(hours=hours, minutes=minutes)
            return timezone(delta if sign > 0 else -delta)
    return timezone(timedelta(hours=9))


def parse_slot_start_utc(
    slot_date: str | None,
    hour_slot: str | None,
    tz_raw: str | None,
) -> datetime | None:
    """Вычисляет UTC-время начала слота по дате, часу и часовому поясу анкеты/заявки."""
    date_part = str(slot_date or "").strip()[:10]
    if not date_part:
        return None
    try:
        base_day = datetime.strptime(date_part, "%Y-%m-%d")
    except ValueError:
        return None

    hour_str = str(hour_slot or "16:00").strip()[:5]
    hm = _HOUR_RE.match(hour_str)
    if not hm:
        return None
    hh, mm = int(hm.group(1)), int(hm.group(2))
    if not (0 <= hh <= 23 and 0 <= mm <= 59):
        return None

    tz = parse_tz_offset(tz_raw)
    local_dt = datetime(base_day.year, base_day.month, base_day.day, hh, mm, tzinfo=tz)
    return local_dt.astimezone(timezone.utc)


def parse_iso_utc(raw: str | None) -> datetime | None:
    """Разбирает ISO-метку времени и приводит её к UTC."""
    txt = str(raw or "").strip()
    if not txt:
        return None
    if txt.endswith("Z"):
        txt = txt[:-1] + "+00:00"
    try:
        dt = datetime.fromisoformat(txt)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


class BackgroundScheduler:
    """Асинхронный периодический воркер обслуживания эскроу и напоминаний по слотам."""

    def __init__(
        self,
        *,
        settings: Settings,
        db: Any,
        realtime: Any | None = None,
        telegram: Any | None = None,
        otp_delivery: Any | None = None,
        backups: Any | None = None,
        monitor: Any | None = None,
        yookassa: Any | None = None,
        payout_gateway: Any | None = None,
        npd_client: Any | None = None,
    ) -> None:
        self.settings = settings
        self.config: SchedulerConfig = settings.scheduler
        self.db = db
        self.realtime = realtime
        self.telegram = telegram
        self.otp_delivery = otp_delivery
        self.backups = backups
        self.monitor = monitor
        self.yookassa = yookassa
        self.payout_gateway = payout_gateway
        self.npd_client = npd_client
        self._run_lock = asyncio.Lock()
        self._chat_lock = asyncio.Lock()
        self._stop_event: asyncio.Event | None = None
        self._task: asyncio.Task[Any] | None = None
        self._chat_task: asyncio.Task[Any] | None = None
        self._running = False
        self._ticks_total = 0
        self._last_run_at: str | None = None
        self._last_result: dict[str, Any] | None = None
        self._last_error: str | None = None
        self._totals: dict[str, int] = {
            "captured": 0,
            "capturedRub": 0,
            "expired": 0,
            "refundedRub": 0,
            "reminders": 0,
            "chatAlerts": 0,
            "paymentsSynced": 0,
            "refundsSynced": 0,
            "payoutsSynced": 0,
            "backups": 0,
            "securityPruned": 0,
            "sessionsPruned": 0,
            "oauthStatesPruned": 0,
            "telegramTokensPruned": 0,
            "realtimePruned": 0,
            "lockSkipped": 0,
            "errors": 0,
        }

    def _try_advisory_lock(self, lock_key: int) -> Any:
        if bool(getattr(self.config, "advisory_lock_enabled", True)) and hasattr(self.db, "advisory_lock"):
            return self.db.advisory_lock(lock_key)
        return contextlib.nullcontext(True)

    def start(self) -> None:
        if not self.config.enabled:
            return
        if self._stop_event is None or self._stop_event.is_set():
            self._stop_event = asyncio.Event()
        self._running = True
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._loop(), name="vektor-scheduler")
        if self._chat_task is None or self._chat_task.done():
            self._chat_task = asyncio.create_task(self._chat_loop(), name="vektor-scheduler-chat")

    async def stop(self) -> None:
        self._running = False
        if self._stop_event is not None:
            self._stop_event.set()
        tasks = [t for t in (self._task, self._chat_task) if t is not None]
        self._task = None
        self._chat_task = None
        for task in tasks:
            if not task.done():
                task.cancel()
        for task in tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass

    async def _wait_stop(self, timeout_sec: int) -> bool:
        if self._stop_event is None:
            return True
        if timeout_sec <= 0:
            return self._stop_event.is_set()
        try:
            await asyncio.wait_for(self._stop_event.wait(), timeout=float(timeout_sec))
            return True
        except asyncio.TimeoutError:
            return self._stop_event.is_set()

    async def _loop(self) -> None:
        try:
            if await self._wait_stop(self.config.initial_delay_sec):
                return
            while self._stop_event is not None and not self._stop_event.is_set():
                try:
                    await self.run_once()
                except Exception as exc:
                    self._last_error = str(exc)
                    logger.exception("Scheduler loop tick failed: %s", exc)
                if await self._wait_stop(self.config.interval_sec):
                    break
        except asyncio.CancelledError:
            raise
        finally:
            self._running = False

    async def _chat_loop(self) -> None:
        try:
            if await self._wait_stop(self.config.initial_delay_sec):
                return
            check_interval = max(5, int(getattr(self.config, "chat_check_interval_sec", 15)))
            while self._stop_event is not None and not self._stop_event.is_set():
                try:
                    await self.run_chat_unanswered_once()
                except Exception as exc:
                    logger.warning("Chat unanswered check tick failed: %s", exc)
                if await self._wait_stop(check_interval):
                    break
        except asyncio.CancelledError:
            raise

    async def _process_unanswered_chats(
        self,
        now_utc: datetime,
    ) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
        alerts_sent: list[dict[str, Any]] = []
        chat_errors: list[dict[str, str]] = []
        if not hasattr(self.db, "list_unanswered_chat_threads"):
            return alerts_sent, chat_errors

        delay_sec = max(5, int(getattr(self.config, "chat_unanswered_delay_sec", 60)))
        max_age_h = max(1, int(getattr(self.config, "chat_unanswered_max_age_hours", 24)))
        older_than_iso = (now_utc - timedelta(seconds=delay_sec)).strftime("%Y-%m-%dT%H:%M:%SZ")
        max_age_iso = (now_utc - timedelta(hours=max_age_h)).strftime("%Y-%m-%dT%H:%M:%SZ")
        wait_min = max(1, delay_sec // 60)
        base_url = str(getattr(self.settings, "public_base_url", None) or "https://vektor-ege.ru").rstrip("/")

        async with self._chat_lock:
            with self._try_advisory_lock(SCHEDULER_CHAT_LOCK_KEY) as acquired:
                if not acquired:
                    self._totals["lockSkipped"] += 1
                    return alerts_sent, chat_errors
                try:
                    candidates = self.db.list_unanswered_chat_threads(
                        older_than_iso=older_than_iso,
                        max_age_iso=max_age_iso,
                        limit=200,
                    )
                except Exception as exc:
                    logger.warning("Listing unanswered chat threads failed: %s", exc)
                    chat_errors.append({"bookingId": "_chat_unanswered", "error": str(exc)})
                    return alerts_sent, chat_errors

                for item in candidates:
                    tid = str(item.get("threadId") or "")
                    anchor_id = str(item.get("anchorMessageId") or "")
                    latest_id = str(item.get("latestMessageId") or anchor_id)
                    recipient_role = "tutor" if str(item.get("recipientRole") or "") == "tutor" else "student"
                    sender_name = str(item.get("senderName") or ("Ученик" if recipient_role == "tutor" else "Преподаватель"))
                    subj_name = str(item.get("subjectName") or "").strip()
                    preview = str(item.get("preview") or "").strip()
                    unread_cnt = max(1, int(item.get("unreadCount") or 1))
                    delivered_channels: list[str] = []

                    if self.telegram is not None and hasattr(self.telegram, "notify_unanswered_chat_message"):
                        try:
                            ok_tg = bool(
                                await self.telegram.notify_unanswered_chat_message(
                                    recipient_role=recipient_role,
                                    tutor_id=str(item.get("tutorId") or ""),
                                    tutor_user_id=item.get("tutorUserId"),
                                    student_user_id=item.get("studentUserId"),
                                    sender_name=sender_name,
                                    subject_name=subj_name,
                                    preview_text=preview,
                                    unread_count=unread_cnt,
                                    wait_minutes=wait_min,
                                    thread_id=tid,
                                )
                            )
                            if ok_tg:
                                delivered_channels.append("telegram")
                        except Exception as exc:
                            logger.warning("Telegram unanswered chat alert failed (%s): %s", tid, exc)
                            chat_errors.append({"bookingId": tid, "error": f"telegram:{exc}"})

                    phone = str(item.get("recipientPhone") or "").strip()
                    if phone and self.otp_delivery is not None and hasattr(self.otp_delivery, "send_text_notification"):
                        target_url = f"{base_url}{'/tutor#tutor-comm' if recipient_role == 'tutor' else '/student#home'}"
                        role_prefix = "ученик" if recipient_role == "tutor" else "преподаватель"
                        subj_part = f" ({subj_name})" if subj_name and subj_name != "Занятие" else ""
                        cnt_part = f" (непрочитанных: {unread_cnt})" if unread_cnt > 1 else ""
                        prev_part = f": «{preview[:120]}»" if preview else ""
                        wa_text = (
                            f"Вектор: {role_prefix} {sender_name}{subj_part} ждёт ответа в чате уже более {wait_min} мин"
                            f"{cnt_part}{prev_part}. Ответить: {target_url}"
                        )
                        try:
                            ok_wa, _, _ = await self.otp_delivery.send_text_notification(
                                phone,
                                wa_text,
                                kind="chat_unanswered",
                            )
                            if ok_wa:
                                delivered_channels.append("whatsapp")
                        except Exception as exc:
                            logger.warning("WhatsApp unanswered chat alert failed (%s): %s", tid, exc)
                            chat_errors.append({"bookingId": tid, "error": f"whatsapp:{exc}"})

                    if delivered_channels:
                        self.db.mark_chat_unanswered_notified(
                            tid,
                            anchor_id,
                            recipient_role,
                            latest_message_id=latest_id,
                            channels=delivered_channels,
                        )
                        alerts_sent.append(
                            {
                                "threadId": tid,
                                "anchorMessageId": anchor_id,
                                "latestMessageId": latest_id,
                                "recipientRole": recipient_role,
                                "channels": delivered_channels,
                            }
                        )

                self._totals["chatAlerts"] += len(alerts_sent)
                self._totals["errors"] += len(chat_errors)
        return alerts_sent, chat_errors

    async def run_chat_unanswered_once(self, *, now: datetime | None = None) -> dict[str, Any]:
        now_utc = (
            (now.astimezone(timezone.utc) if now.tzinfo else now.replace(tzinfo=timezone.utc))
            if now is not None
            else datetime.now(timezone.utc)
        )
        alerts_sent, chat_errors = await self._process_unanswered_chats(now_utc)
        return {
            "ok": True,
            "ranAt": now_utc.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "chatAlertsCount": len(alerts_sent),
            "chatAlerts": alerts_sent,
            "errorCount": len(chat_errors),
            "errors": chat_errors,
        }

    def _publish_rt(
        self,
        *,
        channel: str,
        event_type: str,
        title: str,
        message: str,
        tutor_slug: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> None:
        if self.realtime is None:
            return
        try:
            self.realtime.publish(
                self.db,
                channel=channel,
                event_type=event_type,
                title=title,
                message=message,
                tutor_slug=tutor_slug,
                payload=payload or {},
            )
        except Exception as exc:
            logger.warning("Scheduler realtime publish failed: %s", exc)

    async def run_once(self, *, now: datetime | None = None) -> dict[str, Any]:
        """Выполняет один идемпотентный цикл: авто-эскроу 94%, автоотмена просроченных и TG-напоминания."""
        async with self._run_lock:
            now_utc = (
                (now.astimezone(timezone.utc) if now.tzinfo else now.replace(tzinfo=timezone.utc))
                if now is not None
                else datetime.now(timezone.utc)
            )
            started_iso = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
            with self._try_advisory_lock(SCHEDULER_MAIN_LOCK_KEY) as acquired:
                if not acquired:
                    self._totals["lockSkipped"] += 1
                    return {
                        "ok": True,
                        "skipped": True,
                        "reason": "advisory_lock_held",
                        "ranAt": started_iso,
                    }
                return await self._run_once_body(now_utc, started_iso)

    async def _run_once_body(self, now_utc: datetime, started_iso: str) -> dict[str, Any]:
        if True:
            captured_ids: list[str] = []
            captured_rub = 0
            expired_ids: list[str] = []
            refunded_rub = 0
            reminders_sent: list[dict[str, str]] = []
            errors: list[dict[str, str]] = []

            bookings = self.db.list_scheduler_bookings(
                statuses=("pending", "countered", "accepted"),
                limit=1000,
            )

            for bk in bookings:
                bid = str(bk.get("id") or "")
                try:
                    st = str(bk.get("status") or "").strip().lower()
                    esc = str(bk.get("escrowStatus") or "none").strip().lower()
                    blocking = bool(bk.get("hasBlockingDispute"))
                    slot_start = parse_slot_start_utc(
                        bk.get("slotDate") or bk.get("dayIso"),
                        bk.get("hour"),
                        bk.get("timezone"),
                    )
                    created_at = parse_iso_utc(bk.get("createdAt"))

                    # 1. Автозавершение проведённого урока (frozen -> captured 94%), если спор не открыт
                    if st == "accepted" and esc == "frozen" and not blocking and slot_start is not None:
                        capture_after = slot_start + timedelta(
                            minutes=self.config.lesson_duration_min + self.config.auto_capture_grace_min
                        )
                        if now_utc >= capture_after:
                            res = self.db.auto_capture_booking(bid, reason="slot_finished")
                            if res is not None:
                                cap_bk = res["booking"]
                                gross_val = int(res.get("grossRub") or 0)
                                payout_val = int(res.get("payoutRub") or 0)
                                fee_val = int(res.get("feeRub") or 0)
                                sbp_val = int(res.get("sbpFeeRub") or 0)
                                captured_ids.append(bid)
                                captured_rub += gross_val
                                self._publish_rt(
                                    channel="all",
                                    event_type="payments.escrow.auto_captured",
                                    title="Занятие завершено автоматически",
                                    message=f"{cap_bk.get('tutorName') or cap_bk.get('tutorId')} · {payout_val} ₽ (94%)",
                                    tutor_slug=str(cap_bk.get("tutorId") or "") or None,
                                    payload={
                                        "booking": cap_bk,
                                        "bookingId": bid,
                                        "grossRub": gross_val,
                                        "feeRub": fee_val,
                                        "sbpFeeRub": sbp_val,
                                        "payoutRub": payout_val,
                                    },
                                )
                                if self.telegram is not None:
                                    await self.telegram.notify_booking_status(cap_bk, "completed")
                                    await self.telegram.notify_tutor_payout_captured(
                                        cap_bk,
                                        payout_rub=payout_val,
                                        fee_rub=fee_val,
                                        sbp_fee_rub=sbp_val,
                                    )
                            continue

                    # 2. Автоотмена просроченных pending/countered заявок с 100% возвратом эскроу
                    if st in ("pending", "countered"):
                        expire_reason: str | None = None
                        if slot_start is not None and now_utc >= slot_start:
                            expire_reason = "slot_passed"
                        elif created_at is not None and now_utc >= created_at + timedelta(hours=self.config.pending_ttl_hours):
                            expire_reason = "ttl_expired"
                        if expire_reason:
                            res = self.db.auto_expire_pending_booking(bid, reason=expire_reason)
                            if res is not None:
                                exp_bk = res["booking"]
                                ref_val = int(res.get("refundedRub") or 0)
                                expired_ids.append(bid)
                                refunded_rub += ref_val
                                self._publish_rt(
                                    channel="all",
                                    event_type="market.bid.auto_expired",
                                    title="Просроченная заявка отменена",
                                    message=f"{exp_bk.get('tutorName') or exp_bk.get('tutorId')} · возврат {ref_val} ₽",
                                    tutor_slug=str(exp_bk.get("tutorId") or "") or None,
                                    payload={
                                        "booking": exp_bk,
                                        "bookingId": bid,
                                        "refundedRub": ref_val,
                                        "reason": expire_reason,
                                    },
                                )
                                if self.telegram is not None:
                                    await self.telegram.notify_booking_expired(
                                        exp_bk,
                                        refunded_rub=ref_val,
                                        reason=expire_reason,
                                    )
                        continue

                    # 3. Напоминания в Telegram за 24 ч и за 1 ч до начала подтверждённого занятия
                    if (
                        st == "accepted"
                        and not blocking
                        and slot_start is not None
                        and slot_start > now_utc
                        and self.telegram is not None
                        and getattr(self.telegram, "enabled", False)
                    ):
                        delta_min = (slot_start - now_utc).total_seconds() / 60.0
                        due_kinds: list[str] = []
                        if 120.0 < delta_min <= float(self.config.reminder_24h_min):
                            due_kinds.append("24h")
                        if 0.0 < delta_min <= float(self.config.reminder_1h_min):
                            due_kinds.append("1h")
                        if not due_kinds:
                            continue

                        stu_uid = bk.get("studentUserId")
                        stu_binding = (
                            self.db.get_telegram_binding_by_user(int(stu_uid))
                            if stu_uid is not None
                            else None
                        )
                        stu_chat = (
                            str(stu_binding["chatId"])
                            if (stu_binding and stu_binding.get("notificationsEnabled", True))
                            else None
                        )
                        tut_chat = self.db.find_telegram_chat_for_tutor(str(bk.get("tutorId") or ""))

                        for kind in due_kinds:
                            if stu_chat and not self.db.has_lesson_reminder_sent(bid, kind, "student"):
                                sent_stu = await self.telegram.notify_lesson_reminder(
                                    bk,
                                    kind=kind,
                                    recipient_role="student",
                                    chat_id=stu_chat,
                                )
                                if sent_stu:
                                    self.db.mark_lesson_reminder_sent(bid, kind, "student", chat_id=stu_chat)
                                    reminders_sent.append(
                                        {"bookingId": bid, "kind": kind, "role": "student"}
                                    )

                            if tut_chat and tut_chat != stu_chat and not self.db.has_lesson_reminder_sent(bid, kind, "tutor"):
                                sent_tut = await self.telegram.notify_lesson_reminder(
                                    bk,
                                    kind=kind,
                                    recipient_role="tutor",
                                    chat_id=tut_chat,
                                )
                                if sent_tut:
                                    self.db.mark_lesson_reminder_sent(bid, kind, "tutor", chat_id=tut_chat)
                                    reminders_sent.append(
                                        {"bookingId": bid, "kind": kind, "role": "tutor"}
                                    )
                except Exception as exc:
                    logger.warning("Scheduler failed for booking %s: %s", bid, exc)
                    errors.append({"bookingId": bid, "error": str(exc)})

            backups_created = 0
            if self.backups is not None and self.backups.should_run_scheduled(now_utc):
                try:
                    bres = await asyncio.to_thread(self.backups.run_backup)
                    backups_created = len(bres.get("created") or [])
                    if not bres.get("ok"):
                        b_err = str(bres.get("error") or "backup_failed")
                        errors.append({"bookingId": "_backup", "error": b_err})
                        if self.monitor is not None:
                            await self.monitor.record_and_alert(
                                method="CRON",
                                path="/internal/backup",
                                status_code=500,
                                message=b_err,
                            )
                        elif self.telegram is not None:
                            await self.telegram.notify_admin_alert("Ошибка автобэкапа БД", b_err)
                except Exception as exc:
                    logger.warning("Scheduled backup failed: %s", exc)
                    errors.append({"bookingId": "_backup", "error": str(exc)})

            payments_synced = 0
            if (
                self.yookassa is not None
                and getattr(getattr(self.settings, "payments", None), "yookassa_configured", False)
                and self.settings.payments.active_provider == "yookassa"
            ):
                from .api.payments import reconcile_payment_intent

                try:
                    pending_intents = self.db.list_payment_intents(status="pending", limit=200)
                except Exception as exc:
                    pending_intents = []
                    errors.append({"bookingId": "_payments", "error": str(exc)})

                for pi in pending_intents:
                    if pi.get("provider") != "yookassa" or not pi.get("providerPaymentId"):
                        continue
                    pi_created = parse_iso_utc(pi.get("createdAt"))
                    if pi_created is None:
                        continue
                    age = now_utc - pi_created
                    if age < timedelta(minutes=5) or age > timedelta(hours=24):
                        continue
                    try:
                        sync_res = await reconcile_payment_intent(
                            self.db,
                            self.yookassa,
                            pi["id"],
                            realtime=self.realtime,
                            telegram=self.telegram,
                        )
                        synced_intent = sync_res.get("intent") or {}
                        if sync_res.get("creditedNow") or synced_intent.get("status") == "canceled":
                            payments_synced += 1
                    except Exception as exc:
                        logger.warning("Payment reconcile failed for %s: %s", pi.get("id"), exc)
                        errors.append({"bookingId": str(pi.get("id") or "_payment"), "error": str(exc)})

            refunds_synced = 0
            if (
                self.yookassa is not None
                and getattr(getattr(self.settings, "payments", None), "yookassa_configured", False)
                and self.settings.payments.active_provider == "yookassa"
            ):
                from .api.payments import reconcile_payment_refund

                try:
                    pending_refunds = self.db.list_payment_refunds(status="pending", limit=200)
                except Exception as exc:
                    pending_refunds = []
                    errors.append({"bookingId": "_refunds", "error": str(exc)})

                for rf in pending_refunds:
                    if rf.get("provider") != "yookassa" or not rf.get("providerRefundId"):
                        continue
                    rf_created = parse_iso_utc(rf.get("createdAt"))
                    if rf_created is None:
                        continue
                    age = now_utc - rf_created
                    if age < timedelta(minutes=2) or age > timedelta(hours=72):
                        continue
                    try:
                        rf_res = await reconcile_payment_refund(
                            self.db,
                            self.yookassa,
                            rf["id"],
                            realtime=self.realtime,
                            telegram=self.telegram,
                        )
                        if rf_res.get("changed"):
                            refunds_synced += 1
                    except Exception as exc:
                        logger.warning("Refund reconcile failed for %s: %s", rf.get("id"), exc)
                        errors.append({"bookingId": str(rf.get("id") or "_refund"), "error": str(exc)})

            payouts_synced = 0
            if (
                self.payout_gateway is not None
                and getattr(getattr(self.settings, "payouts", None), "yookassa_payouts_configured", False)
                and self.settings.payouts.active_provider == "yookassa"
            ):
                from .api.payouts import reconcile_payout_status

                try:
                    pending_payouts = self.db.list_pending_provider_payouts(limit=200)
                except Exception as exc:
                    pending_payouts = []
                    errors.append({"bookingId": "_payouts", "error": str(exc)})

                eff_npd = self.npd_client or FnsNpdClient(self.settings.payouts)
                for pout in pending_payouts:
                    if pout.get("provider") != "yookassa" or not pout.get("providerPayoutId"):
                        continue
                    po_created = parse_iso_utc(pout.get("createdAt"))
                    if po_created is None:
                        continue
                    age = now_utc - po_created
                    if age < timedelta(minutes=2) or age > timedelta(hours=48):
                        continue
                    try:
                        p_res = await reconcile_payout_status(
                            self.db,
                            self.payout_gateway,
                            eff_npd,
                            pout["id"],
                            realtime=self.realtime,
                            telegram=self.telegram,
                        )
                        if p_res.get("changed"):
                            payouts_synced += 1
                    except Exception as exc:
                        logger.warning("Payout reconcile failed for %s: %s", pout.get("id"), exc)
                        errors.append({"bookingId": str(pout.get("id") or "_payout"), "error": str(exc)})

            security_pruned = 0
            sessions_pruned = 0
            oauth_states_pruned = 0
            telegram_tokens_pruned = 0
            realtime_pruned = 0
            if hasattr(self.db, "prune_expired_security_state"):
                try:
                    rt_days = max(1, int(getattr(self.config, "realtime_retention_days", 30)))
                    pruned = self.db.prune_expired_security_state(realtime_retention_days=rt_days)
                    if isinstance(pruned, dict):
                        sessions_pruned = int(pruned.get("sessionsPruned") or 0)
                        oauth_states_pruned = int(pruned.get("oauthStatesPruned") or 0)
                        telegram_tokens_pruned = int(pruned.get("telegramTokensPruned") or 0)
                        realtime_pruned = int(pruned.get("realtimePruned") or 0)
                        security_pruned = (
                            int(pruned.get("rateLimitPruned") or 0)
                            + int(pruned.get("otpPruned") or 0)
                            + sessions_pruned
                            + oauth_states_pruned
                            + telegram_tokens_pruned
                            + realtime_pruned
                        )
                except Exception as exc:
                    logger.warning("Security state cleanup failed: %s", exc)
                    errors.append({"bookingId": "_security_prune", "error": str(exc)})

            chat_alerts, chat_errors = await self._process_unanswered_chats(now_utc)
            if chat_errors:
                errors.extend(chat_errors)

            self._ticks_total += 1
            self._last_run_at = started_iso
            self._last_error = errors[0]["error"] if errors else None
            self._totals["captured"] += len(captured_ids)
            self._totals["capturedRub"] += captured_rub
            self._totals["expired"] += len(expired_ids)
            self._totals["refundedRub"] += refunded_rub
            self._totals["reminders"] += len(reminders_sent)
            self._totals["paymentsSynced"] += payments_synced
            self._totals["refundsSynced"] += refunds_synced
            self._totals["payoutsSynced"] += payouts_synced
            self._totals["backups"] += backups_created
            self._totals["securityPruned"] += security_pruned
            self._totals["sessionsPruned"] += sessions_pruned
            self._totals["oauthStatesPruned"] += oauth_states_pruned
            self._totals["telegramTokensPruned"] += telegram_tokens_pruned
            self._totals["realtimePruned"] += realtime_pruned
            self._totals["errors"] += len(errors) - len(chat_errors)

            result: dict[str, Any] = {
                "ok": True,
                "ranAt": started_iso,
                "scanned": len(bookings),
                "capturedCount": len(captured_ids),
                "capturedIds": captured_ids,
                "capturedRub": captured_rub,
                "expiredCount": len(expired_ids),
                "expiredIds": expired_ids,
                "refundedRub": refunded_rub,
                "remindersCount": len(reminders_sent),
                "reminders": reminders_sent,
                "chatAlertsCount": len(chat_alerts),
                "chatAlerts": chat_alerts,
                "paymentsSynced": payments_synced,
                "refundsSynced": refunds_synced,
                "payoutsSynced": payouts_synced,
                "backupsCreated": backups_created,
                "securityPruned": security_pruned,
                "sessionsPruned": sessions_pruned,
                "oauthStatesPruned": oauth_states_pruned,
                "telegramTokensPruned": telegram_tokens_pruned,
                "realtimePruned": realtime_pruned,
                "errorCount": len(errors),
                "errors": errors,
            }
            self._last_result = result
            return result

    def status(self) -> dict[str, Any]:
        return {
            "enabled": bool(self.config.enabled),
            "running": bool(self._running and self._task is not None and not self._task.done()),
            "intervalSec": int(self.config.interval_sec),
            "initialDelaySec": int(self.config.initial_delay_sec),
            "lessonDurationMin": int(self.config.lesson_duration_min),
            "autoCaptureGraceMin": int(self.config.auto_capture_grace_min),
            "pendingTtlHours": int(self.config.pending_ttl_hours),
            "reminder24hMin": int(self.config.reminder_24h_min),
            "reminder1hMin": int(self.config.reminder_1h_min),
            "chatUnansweredDelaySec": int(getattr(self.config, "chat_unanswered_delay_sec", 60)),
            "chatCheckIntervalSec": int(getattr(self.config, "chat_check_interval_sec", 15)),
            "realtimeRetentionDays": int(getattr(self.config, "realtime_retention_days", 30)),
            "advisoryLockEnabled": bool(getattr(self.config, "advisory_lock_enabled", True)),
            "distributedLock": (
                "pg_advisory"
                if (bool(getattr(self.config, "advisory_lock_enabled", True)) and hasattr(self.db, "advisory_lock"))
                else "local"
            ),
            "ticksTotal": int(self._ticks_total),
            "totals": dict(self._totals),
            "lastRunAt": self._last_run_at,
            "lastError": self._last_error,
            "lastResult": self._last_result,
        }


async def _cli_main(*, once: bool, interval_sec: int | None) -> None:
    from databases.postgres.store import create_store

    settings = load_settings()
    if interval_sec is not None:
        settings = replace(
            settings,
            scheduler=SchedulerConfig(
                enabled=settings.scheduler.enabled,
                interval_sec=max(5, int(interval_sec)),
                initial_delay_sec=0,
                lesson_duration_min=settings.scheduler.lesson_duration_min,
                auto_capture_grace_min=settings.scheduler.auto_capture_grace_min,
                pending_ttl_hours=settings.scheduler.pending_ttl_hours,
                reminder_24h_min=settings.scheduler.reminder_24h_min,
                reminder_1h_min=settings.scheduler.reminder_1h_min,
                chat_unanswered_delay_sec=settings.scheduler.chat_unanswered_delay_sec,
                chat_unanswered_max_age_hours=settings.scheduler.chat_unanswered_max_age_hours,
                chat_check_interval_sec=settings.scheduler.chat_check_interval_sec,
                realtime_retention_days=settings.scheduler.realtime_retention_days,
                advisory_lock_enabled=settings.scheduler.advisory_lock_enabled,
            ),
        )

    db = create_store(settings)
    http = httpx.AsyncClient(timeout=httpx.Timeout(30.0, connect=10.0))
    realtime = RealtimeBroker()
    telegram = TelegramBotService(
        settings=settings,
        db=db,
        http_getter=lambda: http,
        realtime=realtime,
    )
    otp_delivery = OtpDeliveryService(settings.otp, http_getter=lambda: http)
    yookassa = YooKassaClient(settings.payments, http_getter=lambda: http)
    payout_gateway = YooKassaPayoutsClient(settings.payouts, http_getter=lambda: http)
    npd_client = FnsNpdClient(settings.payouts, http_getter=lambda: http)
    scheduler = BackgroundScheduler(
        settings=settings,
        db=db,
        realtime=realtime,
        telegram=telegram,
        otp_delivery=otp_delivery,
        yookassa=yookassa,
        payout_gateway=payout_gateway,
        npd_client=npd_client,
    )
    try:
        if once:
            res = await scheduler.run_once()
            print(json.dumps(res, ensure_ascii=False, indent=2))
        else:
            while True:
                res = await scheduler.run_once()
                print(json.dumps(res, ensure_ascii=False), flush=True)
                await asyncio.sleep(float(scheduler.config.interval_sec))
    finally:
        await http.aclose()
        db.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Фоновый планировщик Вектор (эскроу и напоминания)")
    parser.add_argument("--once", action="store_true", help="Выполнить один цикл планировщика и выйти")
    parser.add_argument("--interval", type=int, default=None, help="Интервал между циклами в секундах (>= 5)")
    args = parser.parse_args()
    try:
        asyncio.run(_cli_main(once=bool(args.once), interval_sec=args.interval))
    except KeyboardInterrupt:
        pass


__all__ = [
    "BackgroundScheduler",
    "parse_iso_utc",
    "parse_slot_start_utc",
    "parse_tz_offset",
]
