"""Telegram-бот платформы «Вектор»: команды, inline-кнопки заявок, OTP и пуш-уведомления."""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime, timezone
import hashlib
import hmac
import html
import logging
import signal
import sys
import time
from typing import Any, Callable

import httpx

from .config import Settings, load_settings
from .realtime import RealtimeBroker
from databases.postgres.store import create_store
from databases.sqlite.common import StorageError

logger = logging.getLogger("vektor.telegram")

BOT_COMMANDS = [
    {"command": "start", "description": "Запуск и привязка аккаунта Вектор"},
    {"command": "bookings", "description": "Мои заявки и входящие ставки"},
    {"command": "tutors", "description": "Найти репетитора (можно /tutors химия)"},
    {"command": "balance", "description": "Баланс эскроу и выплаты"},
    {"command": "notify", "description": "Включить или выключить уведомления"},
    {"command": "unlink", "description": "Отвязать Telegram от аккаунта"},
    {"command": "help", "description": "Список команд бота"},
]

MAIN_REPLY_KEYBOARD = {
    "keyboard": [
        [{"text": "📚 Мои заявки"}, {"text": "🔎 Репетиторы"}],
        [{"text": "💳 Баланс"}, {"text": "🔔 Уведомления"}],
        [{"text": "❓ Помощь"}],
    ],
    "resize_keyboard": True,
}


def verify_telegram_login_widget(
    data: dict[str, Any],
    bot_token: str,
    *,
    max_age_sec: int = 86400,
) -> dict[str, Any]:
    """Проверяет подпись Telegram Login Widget по официальному HMAC-SHA256."""
    if not bot_token:
        raise ValueError("bot_not_configured")
    if not isinstance(data, dict):
        raise ValueError("invalid_payload")
    check_hash = str(data.get("hash") or "").strip().lower()
    raw_id = data.get("id")
    raw_auth_date = data.get("auth_date")
    if not check_hash or raw_id in (None, "") or raw_auth_date in (None, ""):
        raise ValueError("invalid_payload")
    try:
        tg_id = int(raw_id)
        auth_date = int(raw_auth_date)
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid_payload") from exc
    if tg_id <= 0:
        raise ValueError("invalid_payload")
    now = int(time.time())
    if auth_date > now + 300 or (now - auth_date) > max(60, int(max_age_sec)):
        raise ValueError("auth_expired")

    pairs: list[str] = []
    for k in sorted(data.keys()):
        if k == "hash":
            continue
        v = data.get(k)
        if v is None or v == "":
            continue
        pairs.append(f"{k}={v}")
    data_check_string = "\n".join(pairs)
    secret_key = hashlib.sha256(bot_token.encode("utf-8")).digest()
    expected = hmac.new(secret_key, data_check_string.encode("utf-8"), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, check_hash):
        raise ValueError("invalid_signature")

    username = str(data.get("username") or "").strip().lstrip("@")[:64]
    first_name = str(data.get("first_name") or "").strip()[:64]
    last_name = str(data.get("last_name") or "").strip()[:64]
    photo_url = str(data.get("photo_url") or "").strip()[:500] or None
    display = " ".join(x for x in (first_name, last_name) if x).strip() or (f"@{username}" if username else f"TG {tg_id}")
    return {
        "id": tg_id,
        "username": username,
        "first_name": first_name,
        "last_name": last_name,
        "photo_url": photo_url,
        "display_name": display[:40],
    }


class TelegramBotClient:
    """Лёгкий async-клиент Telegram Bot API поверх httpx."""

    def __init__(
        self,
        bot_token: str | None,
        http_getter: Callable[[], httpx.AsyncClient],
        *,
        api_base: str = "https://api.telegram.org",
    ) -> None:
        self._token = (bot_token or "").strip()
        self._http_getter = http_getter
        self._api_base = api_base.rstrip("/")

    @property
    def enabled(self) -> bool:
        return bool(self._token)

    async def call(
        self,
        method: str,
        payload: dict[str, Any] | None = None,
        *,
        timeout: float | None = None,
    ) -> Any:
        if not self._token:
            raise RuntimeError("TELEGRAM_BOT_TOKEN is not configured")
        url = f"{self._api_base}/bot{self._token}/{method}"
        client = self._http_getter()
        kwargs: dict[str, Any] = {"json": payload or {}}
        if timeout is not None:
            kwargs["timeout"] = timeout
        resp = await client.post(url, **kwargs)
        resp.raise_for_status()
        body = resp.json()
        if not isinstance(body, dict) or not body.get("ok"):
            desc = body.get("description") if isinstance(body, dict) else "unknown error"
            raise RuntimeError(f"Telegram API {method} error: {desc}")
        return body.get("result")

    async def send_message(
        self,
        chat_id: str | int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str = "HTML",
        disable_web_page_preview: bool = True,
    ) -> Any:
        payload: dict[str, Any] = {
            "chat_id": str(chat_id),
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_web_page_preview,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return await self.call("sendMessage", payload)

    async def edit_message_text(
        self,
        chat_id: str | int,
        message_id: int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
        parse_mode: str = "HTML",
        disable_web_page_preview: bool = True,
    ) -> Any:
        payload: dict[str, Any] = {
            "chat_id": str(chat_id),
            "message_id": int(message_id),
            "text": text,
            "parse_mode": parse_mode,
            "disable_web_page_preview": disable_web_page_preview,
        }
        if reply_markup is not None:
            payload["reply_markup"] = reply_markup
        return await self.call("editMessageText", payload)

    async def answer_callback_query(
        self,
        callback_query_id: str,
        *,
        text: str = "",
        show_alert: bool = False,
    ) -> Any:
        return await self.call(
            "answerCallbackQuery",
            {
                "callback_query_id": callback_query_id,
                "text": text[:200],
                "show_alert": show_alert,
            },
        )

    async def get_me(self) -> Any:
        return await self.call("getMe", {})

    async def get_updates(self, *, offset: int | None = None, timeout: int = 25) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {
            "timeout": timeout,
            "allowed_updates": ["message", "callback_query"],
        }
        if offset is not None:
            payload["offset"] = int(offset)
        res = await self.call("getUpdates", payload, timeout=float(timeout + 10))
        return res if isinstance(res, list) else []

    async def set_webhook(self, url: str, *, secret_token: str | None = None) -> Any:
        payload: dict[str, Any] = {
            "url": url,
            "allowed_updates": ["message", "callback_query"],
        }
        if secret_token:
            payload["secret_token"] = secret_token
        return await self.call("setWebhook", payload)

    async def delete_webhook(self, *, drop_pending_updates: bool = False) -> Any:
        return await self.call("deleteWebhook", {"drop_pending_updates": drop_pending_updates})

    async def set_my_commands(self, commands: list[dict[str, str]] | None = None) -> Any:
        return await self.call("setMyCommands", {"commands": commands or BOT_COMMANDS})


class TelegramBotService:
    """Бизнес-логика Telegram-бота: привязка, команды, inline-подтверждение ставок и пуши."""

    def __init__(
        self,
        *,
        settings: Settings,
        db: Any,
        http_getter: Callable[[], httpx.AsyncClient],
        realtime: RealtimeBroker | None = None,
    ) -> None:
        self.settings = settings
        self.db = db
        self._realtime = realtime
        self.client = TelegramBotClient(settings.telegram.bot_token, http_getter)

    @property
    def enabled(self) -> bool:
        return self.client.enabled

    def _site_url(self) -> str:
        return (self.settings.public_base_url or "http://127.0.0.1:8770").rstrip("/")

    @staticmethod
    def _esc(val: Any) -> str:
        return html.escape(str(val or ""), quote=True)

    @staticmethod
    def _fmt_rub(val: Any) -> str:
        try:
            n = int(val or 0)
        except (TypeError, ValueError):
            n = 0
        return f"{n:,}".replace(",", " ") + " ₽"

    async def _safe_send(
        self,
        chat_id: str | int,
        text: str,
        *,
        reply_markup: dict[str, Any] | None = None,
    ) -> bool:
        if not self.client.enabled:
            return False
        try:
            await self.client.send_message(chat_id, text, reply_markup=reply_markup)
            return True
        except Exception as exc:
            logger.warning("Telegram send_message failed for chat %s: %s", chat_id, exc)
            return False

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
        if self._realtime is None:
            return
        try:
            self._realtime.publish(
                self.db,
                channel=channel,
                event_type=event_type,
                title=title,
                message=message,
                tutor_slug=tutor_slug,
                payload=payload or {},
            )
        except Exception as exc:
            logger.warning("Realtime publish from Telegram bot failed: %s", exc)

    # ---------- Исходящие пуш-уведомления ----------

    async def send_otp_by_phone(self, phone_digits: str, code: str) -> bool:
        if not self.client.enabled:
            return False
        chat_id = self.db.find_telegram_chat_by_phone(phone_digits)
        if not chat_id:
            return False
        text = (
            f"🔐 <b>Код подтверждения Вектор:</b> <code>{self._esc(code)}</code>\n\n"
            "Никому не передавайте этот код. Если вы не запрашивали вход — просто проигнорируйте сообщение."
        )
        return await self._safe_send(chat_id, text)

    async def notify_booking_created(self, booking: dict[str, Any]) -> bool:
        if not self.client.enabled:
            return False
        tutor_id = str(booking.get("tutorId") or "").strip()
        chat_id = self.db.find_telegram_chat_for_tutor(tutor_id)
        if not chat_id:
            return False
        bid = str(booking.get("id") or "")
        student = self._esc(booking.get("studentName") or "Ученик")
        subj = self._esc(booking.get("subjectName") or booking.get("subject") or "Занятие")
        exam = self._esc(booking.get("exam") or "ЕГЭ")
        fmt = self._esc(booking.get("format") or "Онлайн")
        day_lbl = self._esc(booking.get("dayLabel") or booking.get("dayIso") or "")
        hour = self._esc(booking.get("hour") or "16:00")
        offer = self._fmt_rub(booking.get("offerPrice") or 0)
        note = str(booking.get("note") or "").strip()
        lines = [
            "📩 <b>Новая ставка от ученика</b>",
            f"Ученик: <b>{student}</b>",
            f"Предмет: {subj} · {exam} · {fmt}",
            f"Время: <b>{day_lbl}, {hour}</b>",
            f"Ставка: <b>{offer}/ч</b>",
        ]
        if note:
            lines.append(f"Комментарий: <i>{self._esc(note)}</i>")
        kb = {
            "inline_keyboard": [
                [
                    {"text": "✅ Подтвердить", "callback_data": f"bk:accept:{bid}"},
                    {"text": "❌ Отклонить", "callback_data": f"bk:decline:{bid}"},
                ],
                [{"text": "Открыть кабинет", "url": f"{self._site_url()}/tutor"}],
            ]
        }
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup=kb)

    async def notify_booking_status(
        self,
        booking: dict[str, Any],
        status: str,
        *,
        counter_price: int | None = None,
    ) -> bool:
        if not self.client.enabled:
            return False
        student_uid = booking.get("studentUserId")
        if student_uid is None:
            return False
        binding = self.db.get_telegram_binding_by_user(int(student_uid))
        if not binding or not binding.get("notificationsEnabled", True):
            return False
        chat_id = binding["chatId"]
        tutor_name = self._esc(booking.get("tutorName") or "Преподаватель")
        subj = self._esc(booking.get("subjectName") or booking.get("subject") or "Занятие")
        day_lbl = self._esc(booking.get("dayLabel") or booking.get("dayIso") or "")
        hour = self._esc(booking.get("hour") or "16:00")
        st = (status or "").strip().lower()

        if st == "accepted":
            price = self._fmt_rub(booking.get("finalPrice") or booking.get("offerPrice") or 0)
            lines = [
                "✅ <b>Преподаватель подтвердил занятие!</b>",
                f"{tutor_name} · {subj}",
                f"Слот: <b>{day_lbl}, {hour}</b> · Ставка: <b>{price}/ч</b>",
            ]
            tm_url = str(booking.get("telemostUrl") or "").strip()
            if tm_url:
                lines.append(f"Видеокомната: {self._esc(tm_url)}")
            kb = {"inline_keyboard": [[{"text": "Открыть «Учёбу»", "url": f"{self._site_url()}/student"}]]}
            return await self._safe_send(chat_id, "\n".join(lines), reply_markup=kb)

        if st == "countered":
            cp = self._fmt_rub(counter_price or booking.get("counterPrice") or 0)
            text = (
                f"💬 <b>Встречное предложение по цене</b>\n"
                f"{tutor_name} предложил(а) <b>{cp}/ч</b> за {subj} ({day_lbl}, {hour}).\n"
                f"Примите или измените ставку на сайте: {self._site_url()}/student"
            )
            return await self._safe_send(chat_id, text)

        if st in ("declined", "cancelled"):
            label = "Преподаватель отклонил заявку" if st == "declined" else "Заявка отменена"
            text = (
                f"ℹ️ <b>{label}</b>\n"
                f"{tutor_name} · {subj} ({day_lbl}, {hour}).\n"
                "Зарезервированные средства возвращены на баланс."
            )
            return await self._safe_send(chat_id, text)

        if st == "completed":
            text = (
                f"🎓 <b>Занятие завершено</b>\n"
                f"{tutor_name} · {subj}. Оплата с эскроу переведена преподавателю."
            )
            return await self._safe_send(chat_id, text)
        return False

    async def notify_admin_alert(self, title: str, body: str) -> bool:
        admin_chat = (self.settings.telegram.admin_chat_id or "").strip()
        if not self.client.enabled or not admin_chat:
            return False
        text = f"🛡 <b>{self._esc(title)}</b>\n{self._esc(body)}"
        return await self._safe_send(admin_chat, text)

    async def notify_lesson_reminder(
        self,
        booking: dict[str, Any],
        *,
        kind: str,
        recipient_role: str,
        chat_id: str | None = None,
    ) -> bool:
        if not self.client.enabled:
            return False
        is_tutor = (recipient_role or "").strip().lower() == "tutor"
        target_chat = str(chat_id or "").strip()
        if not target_chat:
            if is_tutor:
                target_chat = str(
                    self.db.find_telegram_chat_for_tutor(str(booking.get("tutorId") or "")) or ""
                ).strip()
            else:
                student_uid = booking.get("studentUserId")
                if student_uid is not None:
                    binding = self.db.get_telegram_binding_by_user(int(student_uid))
                    if binding and binding.get("notificationsEnabled", True):
                        target_chat = str(binding["chatId"])
        if not target_chat:
            return False

        is_24h = (kind or "").strip() == "24h"
        hdr = (
            "⏰ <b>Напоминание о занятии (за 24 часа)</b>"
            if is_24h
            else "🔔 <b>Занятие начнётся через 1 час!</b>"
        )
        counterpart_label = "Ученик" if is_tutor else "Преподаватель"
        counterpart_name = (
            (booking.get("studentName") if is_tutor else booking.get("tutorName"))
            or counterpart_label
        )
        subj = self._esc(booking.get("subjectName") or booking.get("subject") or "Занятие")
        date_str = self._esc(booking.get("slotDate") or booking.get("dayIso") or booking.get("dayLabel") or "")
        hour = self._esc(booking.get("hour") or "16:00")
        tz = self._esc(booking.get("timezone") or "UTC+9")
        tm_url = str(booking.get("telemostUrl") or "").strip()

        lines = [
            hdr,
            f"{counterpart_label}: <b>{self._esc(counterpart_name)}</b>",
            f"Предмет: {subj}",
            f"Время: <b>{date_str}, {hour}</b> ({tz})",
        ]
        if tm_url:
            lines.append(f"Видеокомната: {self._esc(tm_url)}")
        buttons: list[list[dict[str, str]]] = [
            [
                {
                    "text": "Открыть кабинет" if is_tutor else "Открыть «Учёбу»",
                    "url": f"{self._site_url()}/{'tutor' if is_tutor else 'student'}",
                }
            ]
        ]
        if tm_url.startswith("https://"):
            tm_btn_text = "🎥 Войти в Телемост" if "telemost.yandex." in tm_url.lower() else "🎥 Войти на урок"
            buttons.append([{"text": tm_btn_text, "url": tm_url}])
        return await self._safe_send(target_chat, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_student_lesson_ping(
        self,
        *,
        tutor_id: str,
        student_name: str,
        subject_name: str,
        slot_label: str,
        message_text: str,
        telemost_url: str = "",
    ) -> bool:
        if not self.client.enabled:
            return False
        chat_id = str(self.db.find_telegram_chat_for_tutor(str(tutor_id or "").strip()) or "").strip()
        if not chat_id:
            return False
        stu = self._esc(student_name or "Ученик")
        subj = self._esc(subject_name or "Занятие")
        slot = self._esc(slot_label or "")
        msg_esc = self._esc(message_text or "")
        tm_url = str(telemost_url or "").strip()
        lines = [
            "🔔 <b>Уведомление от ученика через платформу Вектор</b>",
            f"Ученик: <b>{stu}</b>",
            f"Предмет: {subj}",
        ]
        if slot:
            lines.append(f"Ближайший урок: <b>{slot}</b>")
        if msg_esc:
            lines.append(f"Сообщение: <i>{msg_esc}</i>")
        if tm_url:
            lines.append(f"Видеокомната: {self._esc(tm_url)}")
        buttons: list[list[dict[str, str]]] = [
            [{"text": "Открыть кабинет", "url": f"{self._site_url()}/tutor"}]
        ]
        if tm_url.startswith("https://"):
            tm_btn_text = "🎥 Войти в Телемост" if "telemost.yandex." in tm_url.lower() else "🎥 Войти на урок"
            buttons.append([{"text": tm_btn_text, "url": tm_url}])
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_tutor_lesson_ping(
        self,
        *,
        student_user_id: int,
        tutor_name: str,
        subject_name: str,
        slot_label: str,
        message_text: str,
        telemost_url: str = "",
    ) -> bool:
        if not self.client.enabled:
            return False
        binding = self.db.get_telegram_binding_by_user(int(student_user_id))
        if not binding or not binding.get("notificationsEnabled", True):
            return False
        chat_id = str(binding.get("chatId") or "").strip()
        if not chat_id:
            return False
        tut = self._esc(tutor_name or "Преподаватель")
        subj = self._esc(subject_name or "Занятие")
        slot = self._esc(slot_label or "")
        msg_esc = self._esc(message_text or "")
        tm_url = str(telemost_url or "").strip()
        lines = [
            "🔔 <b>Напоминание от преподавателя через платформу Вектор</b>",
            f"Преподаватель: <b>{tut}</b>",
            f"Предмет: {subj}",
        ]
        if slot:
            lines.append(f"Ближайший урок: <b>{slot}</b>")
        if msg_esc:
            lines.append(f"Сообщение: <i>{msg_esc}</i>")
        if tm_url:
            lines.append(f"Видеокомната: {self._esc(tm_url)}")
        buttons: list[list[dict[str, str]]] = [
            [{"text": "Открыть кабинет", "url": f"{self._site_url()}/student"}]
        ]
        if tm_url.startswith("https://"):
            tm_btn_text = "🎥 Войти в Телемост" if "telemost.yandex." in tm_url.lower() else "🎥 Войти на урок"
            buttons.append([{"text": tm_btn_text, "url": tm_url}])
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_video_link_updated(
        self,
        *,
        recipient_role: str,
        actor_name: str,
        subject_name: str,
        slot_label: str,
        telemost_url: str,
        provider_label: str = "Видеозвонок",
        join_button_label: str = "Войти на встречу",
        student_user_id: int | None = None,
        tutor_id: str = "",
    ) -> bool:
        if not self.client.enabled:
            return False
        tm_url = str(telemost_url or "").strip()
        if not tm_url.startswith(("http://", "https://")):
            return False
        is_tutor_recipient = str(recipient_role or "").strip().lower() == "tutor"
        chat_id = ""
        if is_tutor_recipient:
            if tutor_id:
                chat_id = str(self.db.find_telegram_chat_for_tutor(str(tutor_id).strip()) or "").strip()
        else:
            if student_user_id is None:
                return False
            binding = self.db.get_telegram_binding_by_user(int(student_user_id))
            if not binding or not binding.get("notificationsEnabled", True):
                return False
            chat_id = str(binding.get("chatId") or "").strip()
        if not chat_id:
            return False
        actor = self._esc(actor_name or ("Ученик" if is_tutor_recipient else "Преподаватель"))
        subj = self._esc(subject_name or "Занятие")
        slot = self._esc(slot_label or "")
        prov = self._esc(provider_label or "Видеозвонок")
        who_line = f"Ученик: <b>{actor}</b> обновил ссылку" if is_tutor_recipient else f"Преподаватель: <b>{actor}</b> обновил ссылку"
        lines = [
            "🎥 <b>Обновлена ссылка на видеовстречу — Вектор</b>",
            who_line,
            f"Предмет: {subj}",
        ]
        if slot:
            lines.append(f"Занятие: <b>{slot}</b>")
        lines.append(f"Сервис: {prov}")
        lines.append(f"Ссылка: {self._esc(tm_url)}")
        buttons: list[list[dict[str, str]]] = []
        if tm_url.startswith("https://"):
            buttons.append([{"text": f"🎥 {join_button_label}", "url": tm_url}])
        buttons.append([
            {
                "text": "Открыть кабинет" if is_tutor_recipient else "Открыть «Учёбу»",
                "url": f"{self._site_url()}/{'tutor' if is_tutor_recipient else 'student'}",
            }
        ])
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_tutor_payment_reminder(
        self,
        *,
        student_user_id: int,
        tutor_name: str,
        subject_name: str,
        slot_label: str,
        amount_rub: int,
        message_text: str,
    ) -> bool:
        if not self.client.enabled:
            return False
        binding = self.db.get_telegram_binding_by_user(int(student_user_id))
        if not binding or not binding.get("notificationsEnabled", True):
            return False
        chat_id = str(binding.get("chatId") or "").strip()
        if not chat_id:
            return False
        tut = self._esc(tutor_name or "Преподаватель")
        subj = self._esc(subject_name or "Занятие")
        slot = self._esc(slot_label or "")
        amt_txt = f"{int(amount_rub):,} ₽".replace(",", " ") if int(amount_rub or 0) > 0 else ""
        msg_esc = self._esc(message_text or "")
        lines = [
            "💳 <b>Напоминание об оплате урока в Вектор</b>",
            f"Преподаватель: <b>{tut}</b>",
            f"Предмет: {subj}",
        ]
        if slot:
            lines.append(f"Ближайший урок: <b>{slot}</b>")
        if amt_txt:
            lines.append(f"Сумма к оплате: <b>{self._esc(amt_txt)}</b>")
        if msg_esc:
            lines.append(f"Сообщение: <i>{msg_esc}</i>")
        buttons: list[list[dict[str, str]]] = [
            [{"text": "💳 Пополнить баланс", "url": f"{self._site_url()}/student"}]
        ]
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_student_chat_message(
        self,
        *,
        tutor_id: str,
        tutor_user_id: int | None = None,
        student_name: str,
        subject_name: str = "",
        preview_text: str = "",
        thread_id: str = "",
    ) -> bool:
        if not self.client.enabled:
            return False
        chat_id = str(self.db.find_telegram_chat_for_tutor(str(tutor_id or "").strip()) or "").strip()
        if not chat_id and tutor_user_id is not None:
            binding = self.db.get_telegram_binding_by_user(int(tutor_user_id))
            if binding and binding.get("notificationsEnabled", True):
                chat_id = str(binding.get("chatId") or "").strip()
        if not chat_id:
            return False
        stu = self._esc(student_name or "Ученик")
        subj = self._esc(subject_name or "")
        prev = self._esc(preview_text or "")
        lines = [
            "💬 <b>Новое сообщение от ученика</b>",
            f"Ученик: <b>{stu}</b>",
        ]
        if subj:
            lines.append(f"Предмет: {subj}")
        if prev:
            lines.append(f"Сообщение: <i>{prev}</i>")
        buttons: list[list[dict[str, str]]] = [
            [{"text": "💬 Ответить в «Общении»", "url": f"{self._site_url()}/tutor#tutor-comm"}]
        ]
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_unanswered_chat_message(
        self,
        *,
        recipient_role: str,
        tutor_id: str = "",
        tutor_user_id: int | None = None,
        student_user_id: int | None = None,
        sender_name: str,
        subject_name: str = "",
        preview_text: str = "",
        unread_count: int = 1,
        wait_minutes: int = 1,
        thread_id: str = "",
    ) -> bool:
        if not self.client.enabled:
            return False
        role_norm = "tutor" if str(recipient_role or "").strip().lower() == "tutor" else "student"
        chat_id = ""
        if role_norm == "tutor":
            chat_id = str(self.db.find_telegram_chat_for_tutor(str(tutor_id or "").strip()) or "").strip()
            if not chat_id and tutor_user_id is not None:
                binding = self.db.get_telegram_binding_by_user(int(tutor_user_id))
                if binding and binding.get("notificationsEnabled", True):
                    chat_id = str(binding.get("chatId") or "").strip()
        else:
            if student_user_id is None:
                return False
            binding = self.db.get_telegram_binding_by_user(int(student_user_id))
            if not binding or not binding.get("notificationsEnabled", True):
                return False
            chat_id = str(binding.get("chatId") or "").strip()
        if not chat_id:
            return False

        is_tutor = role_norm == "tutor"
        default_sender = "Ученик" if is_tutor else "Преподаватель"
        sender_esc = self._esc(sender_name or default_sender)
        subj_esc = self._esc(subject_name or "")
        prev_esc = self._esc(preview_text or "")
        cnt = max(1, int(unread_count or 1))
        wait_m = max(1, int(wait_minutes or 1))

        lines = [
            (
                "⏰ <b>Ученик ждёт ответа в чате Вектор</b>"
                if is_tutor
                else "⏰ <b>Преподаватель ждёт ответа в чате Вектор</b>"
            ),
            f"{'Ученик' if is_tutor else 'Преподаватель'}: <b>{sender_esc}</b>",
        ]
        if subj_esc:
            lines.append(f"Предмет: {subj_esc}")
        if cnt > 1:
            lines.append(f"Непрочитанных сообщений: <b>{cnt}</b>")
        if prev_esc:
            prev_label = "Последнее сообщение" if cnt > 1 else "Сообщение"
            lines.append(f"{prev_label}: <i>{prev_esc}</i>")
        lines.append(f"Сообщение не прочитано более {wait_m} мин.")

        target_url = f"{self._site_url()}{'/tutor#tutor-comm' if is_tutor else '/student#home'}"
        buttons: list[list[dict[str, str]]] = [
            [{"text": "💬 Ответить в «Общении»", "url": target_url}]
        ]
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup={"inline_keyboard": buttons})

    async def notify_tutor_payout_captured(
        self,
        booking: dict[str, Any],
        *,
        payout_rub: int,
        fee_rub: int,
        sbp_fee_rub: int,
    ) -> bool:
        if not self.client.enabled:
            return False
        chat_id = self.db.find_telegram_chat_for_tutor(str(booking.get("tutorId") or ""))
        if not chat_id:
            return False
        student = self._esc(booking.get("studentName") or "Ученик")
        subj = self._esc(booking.get("subjectName") or booking.get("subject") or "Занятие")
        date_str = self._esc(booking.get("slotDate") or booking.get("dayIso") or "")
        hour = self._esc(booking.get("hour") or "16:00")
        text = (
            "💰 <b>Урок завершён — средства зачислены</b>\n"
            f"Ученик: <b>{student}</b> · {subj} ({date_str}, {hour})\n"
            f"На баланс (94%): <b>{self._fmt_rub(payout_rub)}</b>\n"
            f"Удержано: {self._fmt_rub(fee_rub)} (сервис 5%) + {self._fmt_rub(sbp_fee_rub)} (СБП 1%)"
        )
        kb = {"inline_keyboard": [[{"text": "Открыть кабинет", "url": f"{self._site_url()}/tutor"}]]}
        return await self._safe_send(chat_id, text, reply_markup=kb)

    async def notify_booking_expired(
        self,
        booking: dict[str, Any],
        *,
        refunded_rub: int,
        reason: str = "expired",
    ) -> bool:
        if not self.client.enabled:
            return False
        student_uid = booking.get("studentUserId")
        if student_uid is None:
            return False
        binding = self.db.get_telegram_binding_by_user(int(student_uid))
        if not binding or not binding.get("notificationsEnabled", True):
            return False
        chat_id = binding["chatId"]
        tutor_name = self._esc(booking.get("tutorName") or "Преподаватель")
        subj = self._esc(booking.get("subjectName") or booking.get("subject") or "Занятие")
        date_str = self._esc(booking.get("slotDate") or booking.get("dayIso") or "")
        hour = self._esc(booking.get("hour") or "16:00")
        why = (
            "Время выбранного слота уже наступило."
            if reason == "slot_passed"
            else "Преподаватель не успел ответить в срок действия заявки."
        )
        lines = [
            "⌛ <b>Заявка автоматически отменена</b>",
            f"{tutor_name} · {subj} ({date_str}, {hour})",
            why,
        ]
        if int(refunded_rub or 0) > 0:
            lines.append(f"Зарезервированные <b>{self._fmt_rub(refunded_rub)}</b> (100%) возвращены на баланс.")
        kb = {"inline_keyboard": [[{"text": "Подобрать другого репетитора", "url": f"{self._site_url()}/student#market"}]]}
        return await self._safe_send(chat_id, "\n".join(lines), reply_markup=kb)

    # ---------- Входящие команды и callback_query ----------

    async def handle_update(self, update: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(update, dict):
            return {"handled": False, "kind": "invalid"}
        if isinstance(update.get("callback_query"), dict):
            return await self._handle_callback_query(update["callback_query"])
        msg = update.get("message") or update.get("edited_message")
        if isinstance(msg, dict):
            return await self._handle_message(msg)
        return {"handled": False, "kind": "ignored"}

    async def _handle_message(self, msg: dict[str, Any]) -> dict[str, Any]:
        chat = msg.get("chat") or {}
        chat_id = str(chat.get("id") or "").strip()
        if not chat_id:
            return {"handled": False, "kind": "no_chat"}

        from_user = msg.get("from") or {}
        tg_uid = str(from_user.get("id") or "")
        tg_username = str(from_user.get("username") or "").lstrip("@")
        first_name = str(from_user.get("first_name") or chat.get("first_name") or "")

        # 1. Пользователь поделился номером телефона через кнопку Контакта
        if isinstance(msg.get("contact"), dict):
            contact = msg["contact"]
            raw_phone = str(contact.get("phone_number") or "")
            binding = self.db.upsert_telegram_binding(
                chat_id,
                telegram_user_id=tg_uid,
                telegram_username=tg_username,
                phone_digits=raw_phone,
                first_name=first_name,
            )
            linked_note = (
                "Аккаунт привязан автоматически! Теперь сюда будут приходить 4-значные коды входа и уведомления о занятиях."
                if binding.get("userId")
                else "Номер сохранён. Теперь при входе на сайте через Telegram по этому номеру код подтверждения придёт прямо в этот чат."
            )
            await self._safe_send(
                chat_id,
                f"📱 <b>Телефон +{self._esc(binding['phoneDigits'])} сохранён.</b>\n{linked_note}",
                reply_markup=MAIN_REPLY_KEYBOARD,
            )
            return {"handled": True, "kind": "contact", "binding": binding}

        raw_text = str(msg.get("text") or "").strip()
        if not raw_text:
            return {"handled": False, "kind": "non_text"}

        # Обновляем метаданные существующей привязки (не затирая userId/phone)
        if self.db.get_telegram_binding_by_chat(chat_id):
            self.db.upsert_telegram_binding(
                chat_id,
                telegram_user_id=tg_uid,
                telegram_username=tg_username,
                first_name=first_name,
            )

        lower = raw_text.lower()
        cmd = lower.split()[0].split("@")[0] if raw_text.startswith("/") else ""

        if cmd == "/start":
            parts = raw_text.split(maxsplit=1)
            arg = parts[1].strip() if len(parts) > 1 else ""
            if arg.startswith("link_"):
                token = arg[5:].strip()
                uid = self.db.consume_telegram_link_token(token)
                if uid is None:
                    await self._safe_send(
                        chat_id,
                        "⚠️ Ссылка привязки устарела или уже была использована. Запросите новую в профиле на сайте.",
                        reply_markup=MAIN_REPLY_KEYBOARD,
                    )
                    return {"handled": True, "kind": "start_link_expired"}
                user = self.db.get_user_by_id(uid)
                binding = self.db.upsert_telegram_binding(
                    chat_id,
                    user_id=uid,
                    telegram_user_id=tg_uid,
                    telegram_username=tg_username,
                    first_name=first_name,
                )
                uname = self._esc((user.display_name or user.username) if user else f"#{uid}")
                await self._safe_send(
                    chat_id,
                    (
                        f"🎉 <b>Telegram привязан к аккаунту «{uname}»!</b>\n\n"
                        "Теперь вы будете получать:\n"
                        "• мгновенные уведомления о новых ставках и подтверждениях;\n"
                        "• кнопки подтверждения уроков прямо здесь;\n"
                        "• коды входа без СМС."
                    ),
                    reply_markup=MAIN_REPLY_KEYBOARD,
                )
                return {"handled": True, "kind": "start_link_ok", "userId": uid, "binding": binding}

            binding = self.db.get_telegram_binding_by_chat(chat_id)
            if binding and binding.get("userId"):
                user = self.db.get_user_by_id(int(binding["userId"]))
                uname = self._esc((user.display_name or user.username) if user else "")
                await self._safe_send(
                    chat_id,
                    f"👋 С возвращением, <b>{uname or self._esc(first_name)}</b>!\nВаш аккаунт Вектор подключён. Выберите действие в меню ниже.",
                    reply_markup=MAIN_REPLY_KEYBOARD,
                )
            else:
                kb = {
                    "keyboard": [
                        [{"text": "📱 Поделиться телефоном", "request_contact": True}],
                        [{"text": "🔎 Репетиторы"}, {"text": "❓ Помощь"}],
                    ],
                    "resize_keyboard": True,
                }
                await self._safe_send(
                    chat_id,
                    (
                        "👋 Привет! Это официальный бот <b>Вектор</b>.\n\n"
                        "Чтобы получать коды входа и пуши по занятиям:\n"
                        "1. Нажмите <b>«📱 Поделиться телефоном»</b> ниже, или\n"
                        f"2. Откройте <a href=\"{self._esc(self._site_url())}/student\">профиль на сайте</a> → «Привязать Telegram»."
                    ),
                    reply_markup=kb,
                )
            return {"handled": True, "kind": "start"}

        if cmd == "/bookings" or raw_text == "📚 Мои заявки":
            return await self._cmd_bookings(chat_id)

        if cmd == "/tutors" or raw_text == "🔎 Репетиторы":
            query = raw_text[len(raw_text.split()[0]):].strip() if cmd == "/tutors" else ""
            return await self._cmd_tutors(chat_id, query)

        if cmd == "/balance" or raw_text == "💳 Баланс":
            return await self._cmd_balance(chat_id)

        if cmd == "/notify" or raw_text == "🔔 Уведомления":
            return await self._cmd_notify(chat_id)

        if cmd == "/unlink":
            removed = self.db.unlink_telegram_chat(chat_id)
            msg_out = (
                "🔓 Telegram отвязан от аккаунта Вектор."
                if removed
                else "ℹ️ Этот чат не привязан ни к одному аккаунту."
            )
            await self._safe_send(chat_id, msg_out, reply_markup={"remove_keyboard": True})
            return {"handled": True, "kind": "unlink", "unlinked": removed}

        await self._cmd_help(chat_id)
        return {"handled": True, "kind": "help"}

    async def _require_bound_user(self, chat_id: str) -> tuple[dict[str, Any], Any] | tuple[None, None]:
        binding = self.db.get_telegram_binding_by_chat(chat_id)
        if not binding or binding.get("userId") is None:
            await self._safe_send(
                chat_id,
                (
                    "🔗 Аккаунт ещё не привязан.\n"
                    f"Откройте <a href=\"{self._esc(self._site_url())}/student\">Настройки профиля</a> → «Подключить бота», "
                    "или поделитесь номером телефона через /start."
                ),
            )
            return None, None
        user = self.db.get_user_by_id(int(binding["userId"]))
        if not user:
            await self._safe_send(chat_id, "⚠️ Привязанный пользователь не найден. Подключите Telegram заново в профиле.")
            return None, None
        return binding, user

    async def _cmd_bookings(self, chat_id: str) -> dict[str, Any]:
        binding, user = await self._require_bound_user(chat_id)
        if not binding or not user:
            return {"handled": True, "kind": "bookings_unlinked"}

        stu_list = self.db.list_bookings(user.id, scope="student", limit=5)
        tut_list = self.db.list_bookings(user.id, scope="tutor", limit=5)

        if not stu_list and not tut_list:
            kb = {"inline_keyboard": [[{"text": "Подобрать репетитора", "url": f"{self._site_url()}/student#market"}]]}
            await self._safe_send(chat_id, "📭 У вас пока нет активных заявок на занятия.", reply_markup=kb)
            return {"handled": True, "kind": "bookings_empty"}

        status_ru = {
            "pending": "⏳ На рассмотрении",
            "countered": "💬 Встречная ставка",
            "accepted": "✅ Подтверждено",
            "completed": "🎓 Завершено",
            "declined": "❌ Отклонено",
            "cancelled": "🚫 Отменено",
            "refunded": "↩️ Возврат",
        }

        if tut_list:
            for bk in tut_list[:5]:
                st = str(bk.get("status") or "pending")
                bid = str(bk["id"])
                line = (
                    f"📥 <b>Заявка от ученика {self._esc(bk.get('studentName'))}</b>\n"
                    f"{self._esc(bk.get('subjectName'))} · {self._esc(bk.get('dayLabel'))}, {self._esc(bk.get('hour'))}\n"
                    f"Ставка: <b>{self._fmt_rub(bk.get('offerPrice'))}/ч</b> · {status_ru.get(st, st)}"
                )
                kb = None
                if st in ("pending", "countered"):
                    kb = {
                        "inline_keyboard": [
                            [
                                {"text": "✅ Подтвердить", "callback_data": f"bk:accept:{bid}"},
                                {"text": "❌ Отклонить", "callback_data": f"bk:decline:{bid}"},
                            ]
                        ]
                    }
                await self._safe_send(chat_id, line, reply_markup=kb)

        if stu_list:
            lines = ["📚 <b>Ваши отклики репетиторам:</b>"]
            for bk in stu_list[:5]:
                st = str(bk.get("status") or "pending")
                price = self._fmt_rub(bk.get("finalPrice") or bk.get("counterPrice") or bk.get("offerPrice") or 0)
                lines.append(
                    f"• <b>{self._esc(bk.get('tutorName'))}</b> ({self._esc(bk.get('subjectName'))}) — "
                    f"{self._esc(bk.get('dayLabel'))}, {self._esc(bk.get('hour'))} · {price} · {status_ru.get(st, st)}"
                )
            kb = {"inline_keyboard": [[{"text": "Открыть на сайте", "url": f"{self._site_url()}/student"}]]}
            await self._safe_send(chat_id, "\n".join(lines), reply_markup=kb)

        return {"handled": True, "kind": "bookings"}

    async def _cmd_tutors(self, chat_id: str, query: str) -> dict[str, Any]:
        tutors = self.db.list_tutors(subject=query or None, limit=5)
        if not tutors and query:
            # Мягкий фильтр по всем загруженным карточкам
            all_tutors = self.db.list_tutors(limit=50)
            ql = query.lower()
            tutors = [
                t for t in all_tutors
                if ql in str(t.get("subject") or "").lower()
                or ql in str(t.get("name") or "").lower()
                or ql in str(t.get("city") or "").lower()
            ][:5]
        if not tutors:
            await self._safe_send(chat_id, f"🔎 По запросу «{self._esc(query)}» репетиторов не найдено.")
            return {"handled": True, "kind": "tutors_empty"}

        lines = [f"🎓 <b>Репетиторы Вектор{f' · {self._esc(query)}' if query else ''}:</b>"]
        for t in tutors:
            name = self._esc(t.get("name") or t.get("fullName"))
            subj = self._esc(t.get("subjectName") or t.get("subject"))
            city = self._esc(t.get("city") or "Якутск")
            rate = self._fmt_rub(t.get("price") or t.get("baseRateRub") or 0)
            rating = t.get("rating", 4.9)
            lines.append(f"• <b>{name}</b> — {subj} ({city})\n  ★ {rating} · от {rate}/ч")
        kb = {"inline_keyboard": [[{"text": "Предложить свою ставку", "url": f"{self._site_url()}/student#market"}]]}
        await self._safe_send(chat_id, "\n".join(lines), reply_markup=kb)
        return {"handled": True, "kind": "tutors", "count": len(tutors)}

    async def _cmd_balance(self, chat_id: str) -> dict[str, Any]:
        binding, user = await self._require_bound_user(chat_id)
        if not binding or not user:
            return {"handled": True, "kind": "balance_unlinked"}

        wallet = self.db.get_wallet(user.id)
        lines = [
            "💳 <b>Кошелёк Вектор</b>",
            f"Доступный баланс: <b>{self._fmt_rub(wallet.get('balanceRub'))}</b>",
            f"Тариф: <code>{self._esc(wallet.get('planId') or 'trial5k')}</code>",
        ]
        try:
            tut = self.db.get_tutor_wallet_summary(user.id)
            if tut and (tut.get("availableRub") or tut.get("escrowFrozenRub") or tut.get("grossEarnedRub")):
                lines.extend(
                    [
                        "",
                        "🧑‍🏫 <b>Кабинет преподавателя:</b>",
                        f"К выводу (94%): <b>{self._fmt_rub(tut.get('availableRub'))}</b>",
                        f"В эскроу: <b>{self._fmt_rub(tut.get('escrowFrozenRub'))}</b>",
                    ]
                )
        except Exception:
            pass
        kb = {"inline_keyboard": [[{"text": "Управлять балансом", "url": f"{self._site_url()}/student"}]]}
        await self._safe_send(chat_id, "\n".join(lines), reply_markup=kb)
        return {"handled": True, "kind": "balance"}

    async def _cmd_notify(self, chat_id: str) -> dict[str, Any]:
        binding = self.db.get_telegram_binding_by_chat(chat_id)
        if not binding:
            binding = self.db.upsert_telegram_binding(chat_id)
        enabled = bool(binding.get("notificationsEnabled", True))
        state_txt = "🔔 <b>включены</b>" if enabled else "🔕 <b>выключены</b>"
        btn = (
            {"text": "🔕 Выключить уведомления", "callback_data": "tg:notify:off"}
            if enabled
            else {"text": "🔔 Включить уведомления", "callback_data": "tg:notify:on"}
        )
        await self._safe_send(
            chat_id,
            f"Уведомления о заявках и уроках сейчас {state_txt}.",
            reply_markup={"inline_keyboard": [[btn]]},
        )
        return {"handled": True, "kind": "notify"}

    async def _cmd_help(self, chat_id: str) -> None:
        text = (
            "🤖 <b>Команды бота Вектор</b>\n\n"
            "/start — привязать аккаунт или телефон\n"
            "/bookings — мои заявки и входящие ставки\n"
            "/tutors [предмет] — каталог репетиторов\n"
            "/balance — баланс кошелька и эскроу\n"
            "/notify — вкл/выкл пуш-уведомлений\n"
            "/unlink — отвязать Telegram от аккаунта\n"
            "/help — эта справка"
        )
        await self._safe_send(chat_id, text, reply_markup=MAIN_REPLY_KEYBOARD)

    async def _handle_callback_query(self, cb: dict[str, Any]) -> dict[str, Any]:
        cb_id = str(cb.get("id") or "")
        data = str(cb.get("data") or "").strip()
        msg = cb.get("message") or {}
        chat_id = str((msg.get("chat") or {}).get("id") or (cb.get("from") or {}).get("id") or "")
        message_id = msg.get("message_id")

        if data in ("tg:notify:on", "tg:notify:off"):
            enabled = data.endswith(":on")
            self.db.set_telegram_notifications(chat_id, enabled, by_user=False)
            state_txt = "🔔 <b>включены</b>" if enabled else "🔕 <b>выключены</b>"
            next_btn = (
                {"text": "🔕 Выключить уведомления", "callback_data": "tg:notify:off"}
                if enabled
                else {"text": "🔔 Включить уведомления", "callback_data": "tg:notify:on"}
            )
            if self.client.enabled:
                if cb_id:
                    try:
                        await self.client.answer_callback_query(
                            cb_id, text="Уведомления включены" if enabled else "Уведомления выключены"
                        )
                    except Exception:
                        pass
                if chat_id and message_id:
                    try:
                        await self.client.edit_message_text(
                            chat_id,
                            int(message_id),
                            f"Уведомления о заявках и уроках сейчас {state_txt}.",
                            reply_markup={"inline_keyboard": [[next_btn]]},
                        )
                    except Exception:
                        pass
            return {"handled": True, "kind": "cb_notify", "enabled": enabled}

        if data.startswith(("bk:accept:", "bk:decline:")):
            _, act, booking_id = data.split(":", 2)
            binding = self.db.get_telegram_binding_by_chat(chat_id)
            user = (
                self.db.get_user_by_id(int(binding["userId"]))
                if binding and binding.get("userId") is not None
                else None
            )
            if not user:
                if self.client.enabled and cb_id:
                    try:
                        await self.client.answer_callback_query(
                            cb_id, text="Сначала привяжите аккаунт на сайте.", show_alert=True
                        )
                    except Exception:
                        pass
                return {"handled": True, "kind": "cb_unlinked"}

            try:
                res = self.db.transition_booking(
                    booking_id,
                    actor_user_id=user.id,
                    actor_role=user.role,
                    action=act,
                    allow_student_demo_accept=False,
                )
            except StorageError as exc:
                if self.client.enabled and cb_id:
                    try:
                        await self.client.answer_callback_query(cb_id, text=exc.message, show_alert=True)
                    except Exception:
                        pass
                return {"handled": True, "kind": "cb_error", "error": exc.code}

            bk = res["booking"]
            status_label = "✅ Занятие подтверждено!" if act == "accept" else "❌ Заявка отклонена"
            if act == "accept":
                self._publish_rt(
                    channel="student",
                    event_type="market.bid.accepted",
                    title="Преподаватель подтвердил занятие",
                    message=f"{bk['tutorName']} · {bk['dayLabel']}, {bk['hour']} ({bk['finalPrice']} ₽/ч)",
                    tutor_slug=str(bk["tutorId"]),
                    payload={"booking": bk, "bookingId": bk["id"]},
                )
            else:
                self._publish_rt(
                    channel="all",
                    event_type="market.bid.cancelled",
                    title="Преподаватель отклонил заявку",
                    message=f"{bk['tutorName']} · слот {bk['dayLabel']} {bk['hour']}",
                    tutor_slug=str(bk["tutorId"]),
                    payload={"booking": bk, "bookingId": bk["id"]},
                )

            if self.client.enabled:
                if cb_id:
                    try:
                        await self.client.answer_callback_query(cb_id, text=status_label)
                    except Exception:
                        pass
                if chat_id and message_id:
                    edited = (
                        f"{status_label}\n"
                        f"Ученик: <b>{self._esc(bk.get('studentName'))}</b>\n"
                        f"{self._esc(bk.get('subjectName'))} · {self._esc(bk.get('dayLabel'))}, {self._esc(bk.get('hour'))} · "
                        f"<b>{self._fmt_rub(bk.get('finalPrice') or bk.get('offerPrice'))}</b>"
                    )
                    try:
                        await self.client.edit_message_text(chat_id, int(message_id), edited)
                    except Exception:
                        pass

            await self.notify_booking_status(bk, str(bk.get("status") or ("accepted" if act == "accept" else "declined")))
            return {"handled": True, "kind": f"cb_{act}", "bookingId": booking_id}

        if self.client.enabled and cb_id:
            try:
                await self.client.answer_callback_query(cb_id)
            except Exception:
                pass
        return {"handled": False, "kind": "cb_unknown"}


# ---------- Long-Polling раннер и CLI ----------

async def run_polling(settings: Settings | None = None) -> None:
    cfg = settings or load_settings()
    if not cfg.telegram.bot_api_enabled:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан в окружении.")

    db = create_store(cfg)
    http = httpx.AsyncClient(timeout=httpx.Timeout(40.0, connect=10.0))
    svc = TelegramBotService(settings=cfg, db=db, http_getter=lambda: http)
    stop_event = asyncio.Event()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop_event.set)
        except NotImplementedError:
            pass

    try:
        me = await svc.client.get_me()
        logger.info("Bot connected: @%s (id=%s)", me.get("username"), me.get("id"))
        await svc.client.delete_webhook(drop_pending_updates=False)
        await svc.client.set_my_commands(BOT_COMMANDS)

        offset: int | None = None
        while not stop_event.is_set():
            try:
                updates = await svc.client.get_updates(offset=offset, timeout=25)
                for upd in updates:
                    upd_id = upd.get("update_id")
                    if upd_id is not None:
                        offset = int(upd_id) + 1
                    try:
                        await svc.handle_update(upd)
                    except Exception as exc:
                        logger.exception("Failed handling Telegram update %s: %s", upd_id, exc)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.warning("getUpdates error: %s", exc)
                try:
                    await asyncio.wait_for(stop_event.wait(), timeout=3.0)
                except asyncio.TimeoutError:
                    pass
    finally:
        await http.aclose()
        db.close()


async def _run_cli_cmd(args: argparse.Namespace) -> None:
    cfg = load_settings()
    if not cfg.telegram.bot_api_enabled:
        raise SystemExit("TELEGRAM_BOT_TOKEN не задан в окружении.")
    async with httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0)) as http:
        client = TelegramBotClient(cfg.telegram.bot_token, lambda: http)
        if args.info:
            me = await client.get_me()
            wh = await client.call("getWebhookInfo", {})
            print("Bot:", me)
            print("Webhook:", wh)
            return
        if args.set_webhook:
            url = args.set_webhook.strip()
            await client.set_webhook(url, secret_token=cfg.telegram.webhook_secret)
            await client.set_my_commands(BOT_COMMANDS)
            print(f"Webhook set: {url}")
            return
        if args.delete_webhook:
            await client.delete_webhook(drop_pending_updates=False)
            print("Webhook deleted.")
            return


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="Telegram-бот платформы Вектор")
    parser.add_argument("--set-webhook", metavar="URL", help="Установить HTTPS webhook (https://domain/api/telegram/webhook)")
    parser.add_argument("--delete-webhook", action="store_true", help="Удалить webhook для перехода на long-polling")
    parser.add_argument("--info", action="store_true", help="Показать getMe и статус webhook")
    args = parser.parse_args(argv)
    if args.info or args.set_webhook or args.delete_webhook:
        asyncio.run(_run_cli_cmd(args))
    else:
        asyncio.run(run_polling())


if __name__ == "__main__":
    main(sys.argv[1:])
