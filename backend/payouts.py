"""Клиент B2C-выплат репетиторам через ЮKassa Payouts API v3 (СБП и карты РФ/Мир)."""

from __future__ import annotations

import re
import time
from typing import Any, Callable
from urllib.parse import quote

import httpx

from .config import PayoutsConfig

# Справочник основных участников СБП (НСПК bank_id) для работы без внешнего запроса или fallback
DEFAULT_SBP_BANKS: tuple[dict[str, str], ...] = (
    {"bank_id": "100000000111", "name": "Сбербанк", "bic": "044525225"},
    {"bank_id": "100000000004", "name": "Т-Банк", "bic": "044525974"},
    {"bank_id": "100000000008", "name": "Альфа-Банк", "bic": "044525593"},
    {"bank_id": "100000000005", "name": "ВТБ", "bic": "044525187"},
    {"bank_id": "100000000078", "name": "АЭБ (Алмазэргиэнбанк)", "bic": "049805770"},
    {"bank_id": "100000000022", "name": "ЮMoney", "bic": "044525444"},
)

_BANK_ALIASES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("сбер", "sber"), "100000000111"),
    (("т-банк", "t-bank", "тинькофф", "tbank", "tinkoff"), "100000000004"),
    (("альфа", "alfa"), "100000000008"),
    (("втб", "vtb"), "100000000005"),
    (("аэб", "алмаз", "aeb", "almaz"), "100000000078"),
    (("юмани", "yoomoney", "юmoney", "яндекс"), "100000000022"),
)


class PayoutGatewayError(Exception):
    """Ошибка взаимодействия со шлюзом выплат ЮKassa или подготовки реквизитов."""

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _mask_agent_id(agent_id: str | None) -> str | None:
    s = str(agent_id or "").strip()
    if not s:
        return None
    if len(s) <= 4:
        return "*" * len(s)
    return f"{s[:2]}***{s[-2:]}"


def normalize_sbp_phone(raw: str | None) -> str | None:
    """Приводит телефон получателя СБП к формату 79XXXXXXXXX."""
    digits = re.sub(r"\D+", "", str(raw or ""))
    if len(digits) == 10:
        digits = "7" + digits
    elif len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    if len(digits) == 11 and digits.startswith("7"):
        return digits
    return None


def normalize_card_number(raw: str | None) -> str | None:
    """Очищает номер карты до 16–19 цифр без жёсткой проверки Луна."""
    digits = re.sub(r"\D+", "", str(raw or ""))
    if 16 <= len(digits) <= 19:
        return digits
    return None


def resolve_sbp_bank_id(bank_name: str | None, explicit_bank_id: str | None = None) -> str:
    """Возвращает 12-значный идентификатор участника СБП (НСПК bank_id)."""
    exp = str(explicit_bank_id or "").strip()
    if exp and exp.isdigit() and 6 <= len(exp) <= 20:
        return exp
    low = str(bank_name or "").strip().lower()
    if low.isdigit() and 6 <= len(low) <= 20:
        return low
    for keys, bank_id in _BANK_ALIASES:
        if any(k in low for k in keys):
            return bank_id
    return "100000000111"


class YooKassaPayoutsClient:
    """Асинхронный клиент ЮKassa Payouts API v3 поверх httpx.AsyncClient."""

    def __init__(
        self,
        cfg: PayoutsConfig,
        *,
        http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
    ) -> None:
        self.cfg = cfg
        self._http_getter = http_getter
        self._sbp_banks_cache: tuple[float, list[dict[str, str]]] | None = None

    def status(self) -> dict[str, Any]:
        return {
            "provider": self.cfg.active_provider,
            "configuredProvider": self.cfg.provider,
            "yookassaConfigured": self.cfg.yookassa_payouts_configured,
            "agentIdMasked": _mask_agent_id(self.cfg.yookassa_agent_id),
            "apiUrl": self.cfg.yookassa_api_url,
            "autoDispatch": bool(self.cfg.auto_dispatch),
            "autoMaxRub": int(self.cfg.auto_max_rub),
            "antifraudMinLessons": int(self.cfg.antifraud_min_lessons),
            "checkWebhookIp": bool(self.cfg.check_webhook_ip),
        }

    def _require_credentials(self) -> tuple[str, str]:
        if not self.cfg.yookassa_payouts_configured:
            raise PayoutGatewayError(
                "payouts_not_configured",
                "Шлюз выплат ЮKassa (YOOKASSA_PAYOUT_AGENT_ID / YOOKASSA_PAYOUT_SECRET_KEY) не настроен.",
                503,
            )
        return str(self.cfg.yookassa_agent_id), str(self.cfg.yookassa_secret_key)

    async def _request(
        self,
        method: str,
        path: str,
        *,
        json_body: dict[str, Any] | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        agent_id, secret_key = self._require_credentials()
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
                auth=(agent_id, secret_key),
            )
        except httpx.HTTPError as exc:
            raise PayoutGatewayError("yookassa_payout_network_error", f"Ошибка подключения к ЮKassa: {exc}", 502) from exc
        finally:
            if owns:
                await client.aclose()

        try:
            data = resp.json()
        except ValueError:
            data = {}

        if resp.status_code >= 400:
            desc = ""
            err_code = "yookassa_payout_api_error"
            if isinstance(data, dict):
                desc = str(data.get("description") or "").strip()
                err_code = str(data.get("code") or err_code)
            out_status = 400 if resp.status_code == 400 else 502
            raise PayoutGatewayError(
                err_code,
                desc or f"ЮKassa Payouts вернула HTTP {resp.status_code}",
                out_status,
            )

        if not isinstance(data, dict):
            raise PayoutGatewayError("yookassa_invalid_response", "Некорректный ответ ЮKassa Payouts.", 502)
        return data

    async def list_sbp_banks(self) -> list[dict[str, str]]:
        """Возвращает актуальный список участников СБП (кэш 1 час + fallback на DEFAULT_SBP_BANKS)."""
        now = time.monotonic()
        if self._sbp_banks_cache is not None and self._sbp_banks_cache[0] > now:
            return list(self._sbp_banks_cache[1])

        if not self.cfg.yookassa_payouts_configured:
            return [dict(b) for b in DEFAULT_SBP_BANKS]

        try:
            raw = await self._request("GET", "/sbp_banks")
            items = raw.get("items") if isinstance(raw.get("items"), list) else []
            out: list[dict[str, str]] = []
            for item in items:
                if not isinstance(item, dict):
                    continue
                bid = str(item.get("bank_id") or "").strip()
                name = str(item.get("name") or "").strip()
                bic = str(item.get("bic") or "").strip()
                if bid and name:
                    out.append({"bank_id": bid, "name": name, "bic": bic})
            if out:
                self._sbp_banks_cache = (now + 3600.0, out)
                return list(out)
        except PayoutGatewayError:
            pass
        return [dict(b) for b in DEFAULT_SBP_BANKS]

    async def create_payout(
        self,
        *,
        payout_id: str,
        tutor_id: str,
        amount_rub: int,
        method: str,
        idempotency_key: str,
        sbp_phone: str | None = None,
        sbp_bank_id: str | None = None,
        sbp_bank_name: str | None = None,
        card_number: str | None = None,
        payout_token: str | None = None,
        description: str = "",
    ) -> dict[str, Any]:
        """Создаёт выплату через POST /v3/payouts (СБП или карта РФ/Мир)."""
        clean_method = "card" if str(method or "").strip().lower() == "card" else "sbp"
        desc = (
            str(description or "").strip()
            or f"Выплата преподавателю «Вектор» ({payout_id})"
        )[:128]
        payload: dict[str, Any] = {
            "amount": {"value": f"{int(amount_rub)}.00", "currency": "RUB"},
            "description": desc,
            "metadata": {
                "payout_id": str(payout_id),
                "tutor_id": str(tutor_id),
                "method": clean_method,
            },
        }

        if clean_method == "sbp":
            clean_phone = normalize_sbp_phone(sbp_phone)
            if not clean_phone:
                raise PayoutGatewayError(
                    "invalid_sbp_phone",
                    "Некорректный номер телефона для выплаты по СБП.",
                    400,
                )
            clean_bank_id = resolve_sbp_bank_id(sbp_bank_name, explicit_bank_id=sbp_bank_id)
            if not clean_bank_id:
                raise PayoutGatewayError(
                    "sbp_bank_required",
                    "Не удалось определить bank_id банка СБП.",
                    400,
                )
            payload["payout_destination_data"] = {
                "type": "sbp",
                "phone": clean_phone,
                "bank_id": clean_bank_id,
            }
        else:
            clean_token = str(payout_token or "").strip()
            if clean_token:
                payload["payout_token"] = clean_token
            else:
                clean_card = normalize_card_number(card_number)
                if not clean_card:
                    raise PayoutGatewayError(
                        "card_or_token_required",
                        "Укажите номер карты РФ/Мир или payout_token для отправки выплаты.",
                        400,
                    )
                payload["payout_destination_data"] = {
                    "type": "bank_card",
                    "card": {"number": clean_card},
                }

        raw = await self._request("POST", "/payouts", json_body=payload, idempotency_key=idempotency_key)
        provider_id = str(raw.get("id") or "").strip()
        if not provider_id:
            raise PayoutGatewayError(
                "yookassa_invalid_response",
                "ЮKassa не вернула идентификатор выплаты.",
                502,
            )
        details = raw.get("cancellation_details") if isinstance(raw.get("cancellation_details"), dict) else {}
        return {
            "providerPayoutId": provider_id,
            "status": str(raw.get("status") or "pending").strip().lower(),
            "cancellationReason": str(details.get("reason") or ""),
            "raw": raw,
        }

    async def get_payout(self, provider_payout_id: str) -> dict[str, Any]:
        safe_id = quote(str(provider_payout_id or "").strip(), safe="")
        return await self._request("GET", f"/payouts/{safe_id}")


__all__ = [
    "DEFAULT_SBP_BANKS",
    "PayoutGatewayError",
    "YooKassaPayoutsClient",
    "normalize_card_number",
    "normalize_sbp_phone",
    "resolve_sbp_bank_id",
]
