"""Клиент ЮKassa API v3 (СБП + карты РФ), чеки по 54-ФЗ и проверка IP вебхуков."""

from __future__ import annotations

import ipaddress
import re
from typing import Any, Callable
from urllib.parse import quote

import httpx

from .config import PaymentsConfig

# Официальные IPv4/IPv6-сети ЮKassa для входящих webhook-уведомлений
YOOKASSA_WEBHOOK_CIDRS: tuple[str, ...] = (
    "185.71.76.0/27",
    "185.71.77.0/27",
    "77.75.153.0/25",
    "77.75.154.128/25",
    "77.75.156.11/32",
    "77.75.156.35/32",
    "2a02:5180::/32",
)

YOOKASSA_WEBHOOK_NETWORKS = tuple(ipaddress.ip_network(cidr) for cidr in YOOKASSA_WEBHOOK_CIDRS)


class YooKassaError(Exception):
    """Ошибка взаимодействия с API ЮKassa или подготовки чека."""

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def is_yookassa_webhook_ip(raw_ip: str | None) -> bool:
    """Проверяет, что IP-адрес запроса принадлежит официальному allowlist ЮKassa."""
    candidate = str(raw_ip or "").split(",", 1)[0].strip()
    if not candidate:
        return False
    if "%" in candidate:
        candidate = candidate.split("%", 1)[0]
    try:
        ip_obj = ipaddress.ip_address(candidate)
    except ValueError:
        return False
    if isinstance(ip_obj, ipaddress.IPv6Address) and ip_obj.ipv4_mapped is not None:
        ip_obj = ip_obj.ipv4_mapped
    return any(ip_obj in net for net in YOOKASSA_WEBHOOK_NETWORKS)


def normalize_receipt_phone(raw_phone: str | None) -> str | None:
    """Приводит телефон к формату 79XXXXXXXXX без '+' для фискального чека ЮKassa."""
    digits = re.sub(r"\D+", "", str(raw_phone or ""))
    if len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if 10 <= len(digits) <= 15:
        return digits
    return None


def _mask_shop_id(shop_id: str | None) -> str | None:
    s = str(shop_id or "").strip()
    if not s:
        return None
    if len(s) <= 4:
        return "*" * len(s)
    return f"{s[:2]}***{s[-2:]}"


def build_54fz_receipt(
    *,
    total_rub: int,
    method: str,
    customer_email: str | None,
    customer_phone: str | None,
    cfg: PaymentsConfig,
    description: str = "",
    is_refund: bool = False,
) -> dict[str, Any] | None:
    """Формирует блок receipt для фискализации по 54-ФЗ (ЮKassa API v3)."""
    if not cfg.yookassa_receipt_enabled:
        return None

    clean_email = str(customer_email or "").strip()[:254] or None
    if clean_email and "@" not in clean_email:
        clean_email = None
    clean_phone = normalize_receipt_phone(customer_phone)
    if not clean_email and not clean_phone:
        fallback_email = str(cfg.yookassa_fallback_receipt_email or "").strip()[:254] or None
        clean_email = fallback_email if (fallback_email and "@" in fallback_email) else None

    customer: dict[str, str] = {}
    if clean_email:
        customer["email"] = clean_email
    if clean_phone:
        customer["phone"] = clean_phone
    if not customer:
        raise YooKassaError(
            "receipt_contact_required",
            "Для отправки чека по 54-ФЗ укажите email или подтвердите номер телефона.",
            400,
        )

    clean_desc = (
        str(description or "").strip()
        or (
            "Возврат неиспользованного остатка баланса «Вектор»"
            if is_refund
            else (
                "Пополнение баланса «Вектор» (СБП, аванс)"
                if method == "sbp"
                else "Пополнение баланса «Вектор» (карта РФ +3%, аванс)"
            )
        )
    )[:128]
    receipt: dict[str, Any] = {
        "customer": customer,
        "items": [
            {
                "description": clean_desc,
                "quantity": "1.00",
                "amount": {"value": f"{int(total_rub)}.00", "currency": "RUB"},
                "vat_code": int(cfg.yookassa_vat_code),
                "payment_mode": str(cfg.yookassa_payment_mode or "advance"),
                "payment_subject": str(cfg.yookassa_payment_subject or "payment"),
            }
        ],
    }
    if cfg.yookassa_tax_system_code is not None:
        receipt["tax_system_code"] = int(cfg.yookassa_tax_system_code)
    return receipt


class YooKassaClient:
    """Асинхронный клиент ЮKassa API v3 поверх httpx.AsyncClient."""

    def __init__(
        self,
        cfg: PaymentsConfig,
        *,
        http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
    ) -> None:
        self.cfg = cfg
        self._http_getter = http_getter

    def status(self) -> dict[str, Any]:
        return {
            "provider": self.cfg.active_provider,
            "configuredProvider": self.cfg.provider,
            "yookassaConfigured": self.cfg.yookassa_configured,
            "shopIdMasked": _mask_shop_id(self.cfg.yookassa_shop_id),
            "apiUrl": self.cfg.yookassa_api_url,
            "receiptEnabled": bool(self.cfg.yookassa_receipt_enabled),
            "vatCode": int(self.cfg.yookassa_vat_code),
            "taxSystemCode": self.cfg.yookassa_tax_system_code,
            "checkWebhookIp": bool(self.cfg.yookassa_check_webhook_ip),
        }

    def _require_credentials(self) -> tuple[str, str]:
        if not self.cfg.yookassa_configured:
            raise YooKassaError(
                "payments_not_configured",
                "Платёжный провайдер ЮKassa не настроен на сервере.",
                503,
            )
        return str(self.cfg.yookassa_shop_id), str(self.cfg.yookassa_secret_key)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        shop_id, secret_key = self._require_credentials()
        url = f"{self.cfg.yookassa_api_url.rstrip('/')}/{path.lstrip('/')}"
        headers: dict[str, str] = {"Accept": "application/json"}
        if idempotency_key:
            headers["Idempotence-Key"] = str(idempotency_key)

        client = self._http_getter() if self._http_getter else None
        owns = False
        if client is None:
            client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0))
            owns = True

        try:
            resp = await client.request(
                method,
                url,
                json=json_body,
                headers=headers,
                auth=(shop_id, secret_key),
            )
        except httpx.HTTPError as exc:
            raise YooKassaError("yookassa_network_error", f"Ошибка подключения к ЮKassa: {exc}", 502) from exc
        finally:
            if owns:
                await client.aclose()

        try:
            data = resp.json()
        except ValueError:
            data = {}

        if resp.status_code >= 400:
            desc = ""
            err_code = "yookassa_api_error"
            if isinstance(data, dict):
                desc = str(data.get("description") or "").strip()
                err_code = str(data.get("code") or err_code)
            out_status = 400 if resp.status_code == 400 else 502
            raise YooKassaError(
                err_code,
                desc or f"ЮKassa вернула HTTP {resp.status_code}",
                out_status,
            )

        if not isinstance(data, dict):
            raise YooKassaError("yookassa_invalid_response", "Некорректный ответ ЮKassa.", 502)
        return data

    async def create_payment(
        self,
        *,
        intent_id: str,
        user_id: int,
        amount_rub: int,
        fee_rub: int,
        total_rub: int,
        method: str,
        idempotency_key: str,
        return_url: str,
        customer_email: str | None = None,
        customer_phone: str | None = None,
        description: str = "",
    ) -> dict[str, Any]:
        clean_method = "card" if str(method or "").strip().lower() == "card" else "sbp"
        desc = (
            str(description or "").strip()
            or f"Пополнение кошелька «Вектор» ({int(amount_rub)} ₽)"
        )[:128]
        payload: dict[str, Any] = {
            "amount": {"value": f"{int(total_rub)}.00", "currency": "RUB"},
            "capture": True,
            "confirmation": {"type": "redirect", "return_url": str(return_url)},
            "payment_method_data": {"type": "sbp" if clean_method == "sbp" else "bank_card"},
            "description": desc,
            "metadata": {
                "intent_id": str(intent_id),
                "user_id": str(user_id),
                "method": clean_method,
                "amount_rub": str(int(amount_rub)),
                "fee_rub": str(int(fee_rub)),
            },
        }
        receipt = build_54fz_receipt(
            total_rub=int(total_rub),
            method=clean_method,
            customer_email=customer_email,
            customer_phone=customer_phone,
            cfg=self.cfg,
            description=desc,
        )
        if receipt is not None:
            payload["receipt"] = receipt

        raw = await self._request("POST", "/payments", json_body=payload, idempotency_key=idempotency_key)
        provider_id = str(raw.get("id") or "").strip()
        confirmation = raw.get("confirmation") if isinstance(raw.get("confirmation"), dict) else {}
        confirmation_url = str(confirmation.get("confirmation_url") or "").strip()
        if not provider_id or not confirmation_url:
            raise YooKassaError(
                "yookassa_invalid_response",
                "ЮKassa не вернула идентификатор или ссылку для оплаты.",
                502,
            )
        amt_obj = raw.get("amount") if isinstance(raw.get("amount"), dict) else {}
        return {
            "providerPaymentId": provider_id,
            "status": str(raw.get("status") or "pending"),
            "paid": bool(raw.get("paid")),
            "confirmationUrl": confirmation_url,
            "amountValue": str(amt_obj.get("value") or f"{int(total_rub)}.00"),
        }

    async def get_payment(self, provider_payment_id: str) -> dict[str, Any]:
        pid = str(provider_payment_id or "").strip()
        if not pid:
            raise YooKassaError("invalid_payment_id", "Пустой идентификатор платежа ЮKassa.", 400)
        return await self._request("GET", f"/payments/{quote(pid, safe='')}")

    async def create_refund(
        self,
        *,
        refund_id: str,
        provider_payment_id: str,
        amount_rub: int,
        idempotency_key: str,
        method: str = "sbp",
        description: str = "",
        customer_email: str | None = None,
        customer_phone: str | None = None,
    ) -> dict[str, Any]:
        clean_pid = str(provider_payment_id or "").strip()
        if not clean_pid:
            raise YooKassaError("invalid_payment_id", "Отсутствует payment_id ЮKassa для возврата.", 400)
        amt = int(amount_rub or 0)
        if amt <= 0:
            raise YooKassaError("invalid_amount", "Сумма возврата должна быть положительной.", 400)

        clean_method = "card" if str(method or "").strip().lower() == "card" else "sbp"
        clean_desc = (
            str(description or "").strip()
            or f"Возврат неиспользованного остатка баланса «Вектор» ({amt} ₽)"
        )[:250]
        payload: dict[str, Any] = {
            "payment_id": clean_pid,
            "amount": {"value": f"{amt}.00", "currency": "RUB"},
            "description": clean_desc,
            "metadata": {
                "refund_id": str(refund_id),
                "method": clean_method,
                "amount_rub": str(amt),
            },
        }
        receipt = build_54fz_receipt(
            total_rub=amt,
            method=clean_method,
            customer_email=customer_email,
            customer_phone=customer_phone,
            cfg=self.cfg,
            description=clean_desc[:128],
            is_refund=True,
        )
        if receipt is not None:
            payload["receipt"] = receipt

        raw = await self._request("POST", "/refunds", json_body=payload, idempotency_key=idempotency_key)
        provider_ref_id = str(raw.get("id") or "").strip()
        if not provider_ref_id:
            raise YooKassaError(
                "yookassa_invalid_response",
                "ЮKassa не вернула идентификатор возврата.",
                502,
            )
        amt_obj = raw.get("amount") if isinstance(raw.get("amount"), dict) else {}
        details = raw.get("cancellation_details") if isinstance(raw.get("cancellation_details"), dict) else {}
        return {
            "providerRefundId": provider_ref_id,
            "status": str(raw.get("status") or "pending").strip().lower(),
            "amountValue": str(amt_obj.get("value") or f"{amt}.00"),
            "cancellationReason": str(details.get("reason") or ""),
        }

    async def get_refund(self, provider_refund_id: str) -> dict[str, Any]:
        rid = str(provider_refund_id or "").strip()
        if not rid:
            raise YooKassaError("invalid_refund_id", "Пустой идентификатор возврата ЮKassa.", 400)
        return await self._request("GET", f"/refunds/{quote(rid, safe='')}")
