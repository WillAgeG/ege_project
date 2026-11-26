"""Реальная доставка 4-значных OTP-кодов: Telegram Gateway API, WhatsApp Business API и SMS-шлюзы (РФ)."""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
import re
from typing import Any, Callable

import httpx

from .config import OtpDeliveryConfig

logger = logging.getLogger(__name__)


@dataclass
class OtpDeliveryResult:
    """Результат попытки доставки 4-значного OTP-кода пользователю."""

    delivered: bool
    requested_channel: str
    delivered_channel: str | None = None
    provider: str | None = None
    delivered_via_bot: bool = False
    fallback_used: bool = False
    external_id: str | None = None
    error: str | None = None
    attempts: list[dict[str, Any]] = field(default_factory=list)


class OtpDeliveryService:
    """Единый клиент доставки OTP по каналам Telegram / WhatsApp / SMS с авто-фоллбэком."""

    def __init__(
        self,
        cfg: OtpDeliveryConfig,
        *,
        http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
    ) -> None:
        self.cfg = cfg
        self._http_getter = http_getter
        self._sent_total = 0
        self._failed_total = 0
        self._fallback_total = 0

    async def _post(
        self,
        url: str,
        *,
        headers: dict[str, str] | None = None,
        json_body: dict[str, Any] | None = None,
        data_body: dict[str, Any] | None = None,
    ) -> httpx.Response:
        client = self._http_getter() if self._http_getter else None
        owns = False
        if client is None:
            client = httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=6.0))
            owns = True
        try:
            if json_body is not None:
                return await client.post(url, json=json_body, headers=headers)
            return await client.post(url, data=data_body or {}, headers=headers)
        finally:
            if owns:
                await client.aclose()

    @staticmethod
    def _otp_message_text(code: str) -> str:
        return f"Код подтверждения Вектор: {code}. Никому не передавайте код."

    async def _send_telegram_gateway(self, digits: str, code: str) -> tuple[bool, str | None, str | None]:
        if not self.cfg.telegram_gateway_configured:
            return False, None, "telegram_gateway_not_configured"
        url = f"{self.cfg.telegram_gateway_api_url}/sendVerificationMessage"
        payload: dict[str, Any] = {
            "phone_number": f"+{digits}",
            "code": code,
            "ttl": int(self.cfg.telegram_gateway_ttl_sec),
        }
        if self.cfg.telegram_gateway_sender_username:
            payload["sender_username"] = self.cfg.telegram_gateway_sender_username
        headers = {
            "Authorization": f"Bearer {self.cfg.telegram_gateway_token}",
            "Content-Type": "application/json",
        }
        try:
            resp = await self._post(url, headers=headers, json_body=payload)
            data = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            return False, None, f"telegram_gateway_http_error: {type(exc).__name__}"
        if resp.status_code == 200 and isinstance(data, dict) and data.get("ok") is True:
            result = data.get("result") if isinstance(data.get("result"), dict) else {}
            req_id = str(result.get("request_id") or "") or None
            return True, req_id, None
        err = (data.get("error") if isinstance(data, dict) else None) or f"http_{resp.status_code}"
        return False, None, f"telegram_gateway_{err}"

    async def send_text_notification(
        self,
        phone: str,
        text: str,
        *,
        kind: str = "lesson_reminder",
    ) -> tuple[bool, str | None, str | None]:
        """Отправляет сервисное текстовое уведомление по WhatsApp (Cloud или Webhook) от имени платформы."""
        digits = re.sub(r"\D+", "", str(phone or ""))
        if len(digits) < 10:
            return False, None, "invalid_phone"
        clean_text = str(text or "").strip()[:1000]
        if not clean_text:
            return False, None, "empty_text"
        wa_prov = self.cfg.active_whatsapp_provider
        if wa_prov == "cloud" and not self.cfg.whatsapp_use_template:
            url = f"{self.cfg.whatsapp_api_url}/{self.cfg.whatsapp_phone_number_id}/messages"
            headers = {
                "Authorization": f"Bearer {self.cfg.whatsapp_access_token}",
                "Content-Type": "application/json",
            }
            payload: dict[str, Any] = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": digits,
                "type": "text",
                "text": {"preview_url": False, "body": clean_text},
            }
            try:
                resp = await self._post(url, headers=headers, json_body=payload)
                data = resp.json() if resp.content else {}
            except (httpx.HTTPError, ValueError) as exc:
                return False, None, f"whatsapp_cloud_http_error: {type(exc).__name__}"
            if resp.status_code in (200, 201) and isinstance(data, dict):
                msgs = data.get("messages")
                if isinstance(msgs, list) and msgs and isinstance(msgs[0], dict):
                    return True, str(msgs[0].get("id") or "") or None, None
                if "error" not in data:
                    return True, None, None
            return False, None, f"whatsapp_cloud_{resp.status_code}"

        if wa_prov == "webhook" and self.cfg.whatsapp_webhook_url:
            headers = {"Content-Type": "application/json"}
            if self.cfg.whatsapp_webhook_token:
                headers["Authorization"] = f"Bearer {self.cfg.whatsapp_webhook_token}"
            payload = {
                "phone": f"+{digits}",
                "digits": digits,
                "channel": "wa",
                "kind": str(kind or "lesson_reminder"),
                "text": clean_text,
            }
            try:
                resp = await self._post(self.cfg.whatsapp_webhook_url, headers=headers, json_body=payload)
                data = resp.json() if resp.content else {}
            except (httpx.HTTPError, ValueError) as exc:
                return False, None, f"whatsapp_webhook_http_error: {type(exc).__name__}"
            if 200 <= resp.status_code < 300:
                ext_id = str(data.get("id") or data.get("message_id") or "") if isinstance(data, dict) else ""
                return True, ext_id or None, None
            return False, None, f"whatsapp_webhook_{resp.status_code}"

        return False, None, "whatsapp_not_configured"

    async def _send_whatsapp_cloud(self, digits: str, code: str) -> tuple[bool, str | None, str | None]:
        if not self.cfg.whatsapp_cloud_configured:
            return False, None, "whatsapp_cloud_not_configured"
        url = f"{self.cfg.whatsapp_api_url}/{self.cfg.whatsapp_phone_number_id}/messages"
        headers = {
            "Authorization": f"Bearer {self.cfg.whatsapp_access_token}",
            "Content-Type": "application/json",
        }
        if self.cfg.whatsapp_use_template:
            payload: dict[str, Any] = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": digits,
                "type": "template",
                "template": {
                    "name": self.cfg.whatsapp_template_name,
                    "language": {"code": self.cfg.whatsapp_template_lang},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [{"type": "text", "text": code}],
                        },
                        {
                            "type": "button",
                            "sub_type": "url",
                            "index": "0",
                            "parameters": [{"type": "text", "text": code}],
                        },
                    ],
                },
            }
        else:
            payload = {
                "messaging_product": "whatsapp",
                "recipient_type": "individual",
                "to": digits,
                "type": "text",
                "text": {"preview_url": False, "body": self._otp_message_text(code)},
            }
        try:
            resp = await self._post(url, headers=headers, json_body=payload)
            data = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            return False, None, f"whatsapp_cloud_http_error: {type(exc).__name__}"
        if resp.status_code in (200, 201) and isinstance(data, dict):
            msgs = data.get("messages")
            if isinstance(msgs, list) and msgs and isinstance(msgs[0], dict):
                msg_id = str(msgs[0].get("id") or "") or None
                if msg_id or "error" not in data:
                    return True, msg_id, None
        err_obj = data.get("error") if isinstance(data, dict) and isinstance(data.get("error"), dict) else {}
        err_code = err_obj.get("code") or resp.status_code
        return False, None, f"whatsapp_cloud_{err_code}"

    async def _send_whatsapp_webhook(self, digits: str, code: str) -> tuple[bool, str | None, str | None]:
        if not self.cfg.whatsapp_webhook_configured or not self.cfg.whatsapp_webhook_url:
            return False, None, "whatsapp_webhook_not_configured"
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.cfg.whatsapp_webhook_token:
            headers["Authorization"] = f"Bearer {self.cfg.whatsapp_webhook_token}"
        payload = {
            "phone": f"+{digits}",
            "digits": digits,
            "code": code,
            "message": self._otp_message_text(code),
            "channel": "wa",
        }
        try:
            resp = await self._post(self.cfg.whatsapp_webhook_url, headers=headers, json_body=payload)
            data = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            return False, None, f"whatsapp_webhook_http_error: {type(exc).__name__}"
        if 200 <= resp.status_code < 300:
            if isinstance(data, dict) and data.get("ok") is False:
                return False, None, f"whatsapp_webhook_{data.get('error') or 'rejected'}"
            ext_id = str(data.get("id") or data.get("messageId") or "") if isinstance(data, dict) else ""
            return True, ext_id or None, None
        return False, None, f"whatsapp_webhook_http_{resp.status_code}"

    async def _send_sms_ru(self, digits: str, code: str) -> tuple[bool, str | None, str | None]:
        if not self.cfg.sms_ru_configured or not self.cfg.sms_ru_api_id:
            return False, None, "sms_ru_not_configured"
        form: dict[str, Any] = {
            "api_id": self.cfg.sms_ru_api_id,
            "to": f"+{digits}",
            "msg": self._otp_message_text(code),
            "json": "1",
        }
        if self.cfg.sms_sender:
            form["from"] = self.cfg.sms_sender
        try:
            resp = await self._post(self.cfg.sms_ru_api_url, data_body=form)
            data = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            return False, None, f"sms_ru_http_error: {type(exc).__name__}"
        if resp.status_code == 200 and isinstance(data, dict) and str(data.get("status") or "").upper() == "OK":
            sms_map = data.get("sms") if isinstance(data.get("sms"), dict) else {}
            entry = sms_map.get(f"+{digits}") or sms_map.get(digits)
            if isinstance(entry, dict) and str(entry.get("status") or "").upper() == "OK":
                sms_id = str(entry.get("sms_id") or "") or None
                return True, sms_id, None
            if isinstance(entry, dict):
                return False, None, f"sms_ru_code_{entry.get('status_code') or 'rejected'}"
        return False, None, f"sms_ru_status_{data.get('status_code') if isinstance(data, dict) else resp.status_code}"

    async def _send_smsc(self, digits: str, code: str) -> tuple[bool, str | None, str | None]:
        if not self.cfg.smsc_configured or not self.cfg.smsc_login or not self.cfg.smsc_password:
            return False, None, "smsc_not_configured"
        form: dict[str, Any] = {
            "login": self.cfg.smsc_login,
            "psw": self.cfg.smsc_password,
            "phones": f"+{digits}",
            "mes": self._otp_message_text(code),
            "fmt": "3",
            "charset": "utf-8",
        }
        if self.cfg.sms_sender:
            form["sender"] = self.cfg.sms_sender
        try:
            resp = await self._post(self.cfg.smsc_api_url, data_body=form)
            data = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            return False, None, f"smsc_http_error: {type(exc).__name__}"
        if resp.status_code == 200 and isinstance(data, dict) and "error" not in data and data.get("id") is not None:
            return True, str(data.get("id")), None
        err = (data.get("error_code") if isinstance(data, dict) else None) or resp.status_code
        return False, None, f"smsc_{err}"

    async def _send_sms_webhook(self, digits: str, code: str) -> tuple[bool, str | None, str | None]:
        if not self.cfg.sms_webhook_configured or not self.cfg.sms_webhook_url:
            return False, None, "sms_webhook_not_configured"
        headers: dict[str, str] = {"Content-Type": "application/json"}
        if self.cfg.sms_webhook_token:
            headers["Authorization"] = f"Bearer {self.cfg.sms_webhook_token}"
        payload = {
            "phone": f"+{digits}",
            "digits": digits,
            "code": code,
            "message": self._otp_message_text(code),
            "channel": "sms",
            "sender": self.cfg.sms_sender,
        }
        try:
            resp = await self._post(self.cfg.sms_webhook_url, headers=headers, json_body=payload)
            data = resp.json() if resp.content else {}
        except (httpx.HTTPError, ValueError) as exc:
            return False, None, f"sms_webhook_http_error: {type(exc).__name__}"
        if 200 <= resp.status_code < 300:
            if isinstance(data, dict) and data.get("ok") is False:
                return False, None, f"sms_webhook_{data.get('error') or 'rejected'}"
            ext_id = str(data.get("id") or data.get("messageId") or "") if isinstance(data, dict) else ""
            return True, ext_id or None, None
        return False, None, f"sms_webhook_http_{resp.status_code}"

    async def _send_sms(self, digits: str, code: str) -> tuple[str | None, bool, str | None, str | None]:
        prov = self.cfg.active_sms_provider
        if prov == "sms_ru":
            ok, ext_id, err = await self._send_sms_ru(digits, code)
            return "sms_ru", ok, ext_id, err
        if prov == "smsc":
            ok, ext_id, err = await self._send_smsc(digits, code)
            return "smsc", ok, ext_id, err
        if prov == "webhook":
            ok, ext_id, err = await self._send_sms_webhook(digits, code)
            return "sms_webhook", ok, ext_id, err
        return None, False, None, "sms_not_configured"

    async def deliver_otp(
        self,
        phone_digits: str,
        code: str,
        *,
        channel: str,
        telegram_bot: Any | None = None,
        bot_api_enabled: bool = False,
    ) -> OtpDeliveryResult:
        req_ch = channel if channel in ("wa", "tg", "sms") else "wa"
        attempts: list[dict[str, Any]] = []
        last_error: str | None = None

        if req_ch == "tg":
            if bot_api_enabled and telegram_bot is not None:
                try:
                    sent_bot = bool(await telegram_bot.send_otp_by_phone(phone_digits, code))
                except Exception as exc:
                    sent_bot = False
                    last_error = f"telegram_bot_error: {type(exc).__name__}"
                attempts.append({"channel": "tg", "provider": "telegram_bot", "ok": sent_bot})
                if sent_bot:
                    self._sent_total += 1
                    return OtpDeliveryResult(
                        delivered=True,
                        requested_channel=req_ch,
                        delivered_channel="tg",
                        provider="telegram_bot",
                        delivered_via_bot=True,
                        attempts=attempts,
                    )
            if self.cfg.telegram_gateway_configured:
                ok, ext_id, err = await self._send_telegram_gateway(phone_digits, code)
                attempts.append({"channel": "tg", "provider": "telegram_gateway", "ok": ok, "error": err})
                if ok:
                    self._sent_total += 1
                    return OtpDeliveryResult(
                        delivered=True,
                        requested_channel=req_ch,
                        delivered_channel="tg",
                        provider="telegram_gateway",
                        external_id=ext_id,
                        attempts=attempts,
                    )
                last_error = err

        elif req_ch == "wa":
            wa_prov = self.cfg.active_whatsapp_provider
            if wa_prov == "cloud":
                ok, ext_id, err = await self._send_whatsapp_cloud(phone_digits, code)
                attempts.append({"channel": "wa", "provider": "whatsapp_cloud", "ok": ok, "error": err})
                if ok:
                    self._sent_total += 1
                    return OtpDeliveryResult(
                        delivered=True,
                        requested_channel=req_ch,
                        delivered_channel="wa",
                        provider="whatsapp_cloud",
                        external_id=ext_id,
                        attempts=attempts,
                    )
                last_error = err
            elif wa_prov == "webhook":
                ok, ext_id, err = await self._send_whatsapp_webhook(phone_digits, code)
                attempts.append({"channel": "wa", "provider": "whatsapp_webhook", "ok": ok, "error": err})
                if ok:
                    self._sent_total += 1
                    return OtpDeliveryResult(
                        delivered=True,
                        requested_channel=req_ch,
                        delivered_channel="wa",
                        provider="whatsapp_webhook",
                        external_id=ext_id,
                        attempts=attempts,
                    )
                last_error = err

        # Основной канал SMS либо автоматический SMS-фоллбэк при недоступности WA / TG
        should_try_sms = (req_ch == "sms") or (
            req_ch in ("wa", "tg") and self.cfg.sms_fallback_enabled
        )
        if should_try_sms and self.cfg.active_sms_provider != "none":
            sms_prov, ok, ext_id, err = await self._send_sms(phone_digits, code)
            attempts.append({"channel": "sms", "provider": sms_prov, "ok": ok, "error": err})
            if ok:
                is_fallback = req_ch != "sms"
                self._sent_total += 1
                if is_fallback:
                    self._fallback_total += 1
                return OtpDeliveryResult(
                    delivered=True,
                    requested_channel=req_ch,
                    delivered_channel="sms",
                    provider=sms_prov,
                    fallback_used=is_fallback,
                    external_id=ext_id,
                    attempts=attempts,
                )
            last_error = err or last_error

        if attempts:
            self._failed_total += 1
            logger.warning("OTP delivery failed (channel=%s, error=%s)", req_ch, last_error)
        return OtpDeliveryResult(
            delivered=False,
            requested_channel=req_ch,
            delivered_channel=None,
            provider=None,
            error=last_error,
            attempts=attempts,
        )

    def status(self) -> dict[str, Any]:
        return {
            "telegramGatewayConfigured": bool(self.cfg.telegram_gateway_configured),
            "whatsappProvider": self.cfg.active_whatsapp_provider,
            "smsProvider": self.cfg.active_sms_provider,
            "smsFallbackEnabled": bool(self.cfg.sms_fallback_enabled),
            "requireDelivery": bool(self.cfg.require_delivery),
            "anyLiveProvider": bool(self.cfg.any_live_provider),
            "sentTotal": int(self._sent_total),
            "failedTotal": int(self._failed_total),
            "fallbackTotal": int(self._fallback_total),
        }


__all__ = ["OtpDeliveryResult", "OtpDeliveryService"]
