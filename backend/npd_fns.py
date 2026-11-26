"""Интеграция с ФНС «Мой налог» (НПД): проверка ИНН самозанятого и регистрация/отмена чеков."""

from __future__ import annotations

from datetime import datetime, timezone
import re
import secrets
from typing import Any, Callable
from urllib.parse import urlsplit

import httpx

from .config import PayoutsConfig

_RECEIPT_PATH_RE = re.compile(r"^/api/v1/receipt/(\d{12})/([A-Za-z0-9_-]{4,64})(?:/(?:print|json))?/?$")


class NpdError(Exception):
    """Ошибка проверки статуса самозанятого или регистрации чека НПД."""

    def __init__(self, code: str, message: str, status: int = 502) -> None:
        self.code = code
        self.message = message
        self.status = status
        super().__init__(message)


def _mask_inn(inn: str | None) -> str | None:
    s = re.sub(r"\D+", "", str(inn or ""))
    if not s:
        return None
    if len(s) <= 4:
        return "*" * len(s)
    return f"{s[:2]}***{s[-2:]}"


def validate_inn_12(raw: str | None) -> tuple[bool, str]:
    """Проверяет 12-значный ИНН физического лица / самозанятого РФ по контрольным разрядам."""
    digits_only = re.sub(r"\D+", "", str(raw or ""))
    if len(digits_only) != 12:
        return False, digits_only
    d = [int(ch) for ch in digits_only]
    w11 = (7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
    w12 = (3, 7, 2, 4, 10, 3, 5, 9, 4, 6, 8)
    c11 = (sum(d[i] * w11[i] for i in range(10)) % 11) % 10
    c12 = (sum(d[i] * w12[i] for i in range(11)) % 11) % 10
    return (d[10] == c11 and d[11] == c12), digits_only


def build_fns_receipt_urls(inn: str, receipt_uuid: str) -> tuple[str, str]:
    """Формирует официальные ссылки ФНС «Мой налог» на печатную форму и JSON-карточку чека."""
    clean_inn = re.sub(r"\D+", "", str(inn or ""))
    clean_uuid = str(receipt_uuid or "").strip()
    base = f"https://lknpd.nalog.ru/api/v1/receipt/{clean_inn}/{clean_uuid}"
    return f"{base}/print", f"{base}/json"


def parse_fns_receipt_url(raw_url: str | None) -> tuple[str, str] | None:
    """Разбирает ссылку на чек ФНС https://lknpd.nalog.ru/api/v1/receipt/{inn}/{uuid}/print."""
    txt = str(raw_url or "").strip()
    if not txt:
        return None
    try:
        parts = urlsplit(txt)
    except ValueError:
        return None
    if parts.scheme.lower() != "https" or parts.netloc.lower() != "lknpd.nalog.ru":
        return None
    m = _RECEIPT_PATH_RE.match(parts.path or "")
    if not m:
        return None
    inn, receipt_uuid = m.group(1), m.group(2)
    ok_inn, clean_inn = validate_inn_12(inn)
    if not ok_inn:
        return None
    return clean_inn, receipt_uuid


class FnsNpdClient:
    """Асинхронный клиент проверки статуса НПД и регистрации чеков («Партнёрское API ФНС» / lknpd / demo)."""

    def __init__(
        self,
        cfg: PayoutsConfig,
        *,
        http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
    ) -> None:
        self.cfg = cfg
        self._http_getter = http_getter

    def status(self) -> dict[str, Any]:
        return {
            "provider": self.cfg.active_npd_provider,
            "configuredProvider": self.cfg.npd_provider,
            "partnerConfigured": self.cfg.npd_partner_configured,
            "lknpdConfigured": self.cfg.npd_lknpd_configured,
            "onlineInnCheck": bool(self.cfg.npd_check_status_online),
            "platformInnMasked": _mask_inn(self.cfg.npd_platform_inn),
            "platformName": self.cfg.npd_platform_name,
        }

    async def _post_json(
        self,
        url: str,
        *,
        json_body: dict[str, Any],
        headers: dict[str, str] | None = None,
        allow_4xx_json: bool = False,
    ) -> tuple[int, dict[str, Any]]:
        req_headers = {"Accept": "application/json", **(headers or {})}
        client = self._http_getter() if self._http_getter else None
        owns = False
        if client is None:
            client = httpx.AsyncClient(timeout=httpx.Timeout(20.0, connect=10.0))
            owns = True

        try:
            resp = await client.request("POST", url, json=json_body, headers=req_headers)
        except httpx.HTTPError as exc:
            raise NpdError("npd_network_error", f"Ошибка подключения к сервису НПД: {exc}", 502) from exc
        finally:
            if owns:
                await client.aclose()

        try:
            data = resp.json()
        except ValueError:
            data = {}
        if not isinstance(data, dict):
            data = {}

        if resp.status_code >= 400 and not (allow_4xx_json and data):
            msg = str(data.get("message") or data.get("description") or "").strip()
            code = str(data.get("code") or "npd_api_error")
            out_status = 400 if resp.status_code == 400 else 502
            raise NpdError(code, msg or f"Сервис НПД вернул HTTP {resp.status_code}", out_status)

        return resp.status_code, data

    async def check_taxpayer_status(
        self,
        inn: str,
        *,
        request_date: str | None = None,
    ) -> dict[str, Any]:
        """Проверяет контрольную сумму ИНН и (при включении) статус самозанятого в ФНС."""
        ok_inn, clean_inn = validate_inn_12(inn)
        if not ok_inn:
            raise NpdError(
                "invalid_inn",
                "ИНН физического лица / самозанятого должен содержать 12 цифр и корректную контрольную сумму.",
                400,
            )
        req_date = str(request_date or datetime.now(timezone.utc).strftime("%Y-%m-%d")).strip()[:10]

        if not self.cfg.npd_check_status_online and self.cfg.active_npd_provider == "demo":
            return {
                "inn": clean_inn,
                "isSelfEmployed": True,
                "mode": "offline_checksum",
                "message": "Контрольная сумма ИНН подтверждена (онлайн-сверка ФНС отключена).",
                "requestDate": req_date,
            }

        status_code, data = await self._post_json(
            self.cfg.npd_status_api_url,
            json_body={"inn": clean_inn, "requestDate": req_date},
            allow_4xx_json=True,
        )
        if status_code >= 400:
            msg = str(data.get("message") or "").strip() or f"ФНС вернула HTTP {status_code}"
            err_code = str(data.get("code") or "npd_status_error")
            if status_code == 422 and ("не является" in msg.lower() or "not registered" in msg.lower()):
                return {
                    "inn": clean_inn,
                    "isSelfEmployed": False,
                    "mode": "online",
                    "message": msg,
                    "requestDate": req_date,
                }
            raise NpdError(err_code, msg, 502)

        is_npd = bool(data.get("status") if "status" in data else data.get("inNpd", False))
        default_msg = (
            "Статус плательщика НПД (самозанятого) подтверждён ФНС."
            if is_npd
            else "ИНН не состоит на учёте как плательщик НПД на указанную дату."
        )
        return {
            "inn": clean_inn,
            "isSelfEmployed": is_npd,
            "mode": "online",
            "message": str(data.get("message") or default_msg),
            "requestDate": req_date,
        }

    async def register_income_receipt(
        self,
        *,
        payout_id: str,
        tutor_inn: str,
        amount_rub: int,
        service_name: str,
        idempotency_key: str,
        operation_time: str | None = None,
    ) -> dict[str, Any]:
        """Регистрирует доход в НПД и возвращает receiptUuid + ссылки печати ФНС."""
        provider = self.cfg.active_npd_provider
        clean_service = str(service_name or "Услуги репетитора «Вектор»").strip()[:255]
        op_time = str(operation_time or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")).strip()

        ok_inn, clean_inn = validate_inn_12(tutor_inn)
        if provider in ("partner", "lknpd"):
            if not ok_inn:
                raise NpdError(
                    "tutor_inn_required",
                    "Для регистрации чека НПД в ФНС требуется корректный 12-значный ИНН репетитора.",
                    400,
                )
        elif str(tutor_inn or "").strip() and not ok_inn:
            raise NpdError(
                "invalid_inn",
                "ИНН репетитора должен содержать 12 цифр и корректную контрольную сумму.",
                400,
            )

        if provider == "partner":
            if not self.cfg.npd_partner_configured:
                raise NpdError(
                    "npd_partner_not_configured",
                    "Партнёрский шлюз ФНС НПД (NPD_PARTNER_API_URL / NPD_PARTNER_API_KEY) не настроен.",
                    503,
                )
            url = f"{str(self.cfg.npd_partner_api_url).rstrip('/')}/receipts"
            body = {
                "payoutId": str(payout_id),
                "tutorInn": clean_inn,
                "amount": f"{int(amount_rub)}.00",
                "currency": "RUB",
                "serviceName": clean_service,
                "operationTime": op_time,
                "incomeType": "FROM_LEGAL_ENTITY" if self.cfg.npd_platform_inn else "FROM_INDIVIDUAL",
                "customerInn": self.cfg.npd_platform_inn or "",
                "customerOrganization": self.cfg.npd_platform_name,
            }
            _, data = await self._post_json(
                url,
                json_body=body,
                headers={
                    "Authorization": f"Bearer {self.cfg.npd_partner_api_key}",
                    "Idempotence-Key": str(idempotency_key),
                },
            )
            receipt_uuid = str(
                data.get("receiptUuid")
                or data.get("receipt_uuid")
                or data.get("approvedReceiptUuid")
                or data.get("uuid")
                or data.get("id")
                or ""
            ).strip()
            if not receipt_uuid:
                raise NpdError("npd_invalid_response", "Партнёрский шлюз НПД не вернул идентификатор чека.", 502)
            def_print, def_json = build_fns_receipt_urls(clean_inn, receipt_uuid)
            receipt_url = str(data.get("receiptUrl") or data.get("printUrl") or def_print).strip()
            json_url = str(data.get("receiptJsonUrl") or data.get("jsonUrl") or def_json).strip()
            return {
                "provider": "partner",
                "status": "registered",
                "tutorInn": clean_inn,
                "receiptUuid": receipt_uuid,
                "receiptUrl": receipt_url,
                "receiptJsonUrl": json_url,
                "serviceName": clean_service,
            }

        if provider == "lknpd":
            if not self.cfg.npd_lknpd_configured:
                raise NpdError(
                    "npd_lknpd_not_configured",
                    "Токен кабинета «Мой налог» (NPD_LKNPD_TOKEN) не задан.",
                    503,
                )
            url = f"{self.cfg.npd_lknpd_api_url.rstrip('/')}/income"
            now_time = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            client_info: dict[str, Any] = {
                "incomeType": "FROM_LEGAL_ENTITY" if self.cfg.npd_platform_inn else "FROM_INDIVIDUAL",
                "displayName": self.cfg.npd_platform_name,
            }
            if self.cfg.npd_platform_inn:
                client_info["inn"] = self.cfg.npd_platform_inn
            body = {
                "operationTime": op_time,
                "requestTime": now_time,
                "services": [{"name": clean_service, "amount": float(int(amount_rub)), "quantity": 1}],
                "totalAmount": str(int(amount_rub)),
                "client": client_info,
                "paymentType": "WIRE",
                "ignoreMaxTotalIncomeRestriction": False,
            }
            _, data = await self._post_json(
                url,
                json_body=body,
                headers={"Authorization": f"Bearer {self.cfg.npd_lknpd_token}"},
            )
            receipt_uuid = str(
                data.get("approvedReceiptUuid")
                or data.get("receiptUuid")
                or data.get("uuid")
                or ""
            ).strip()
            if not receipt_uuid:
                raise NpdError("npd_invalid_response", "API «Мой налог» не вернуло approvedReceiptUuid чека.", 502)
            def_print, def_json = build_fns_receipt_urls(clean_inn, receipt_uuid)
            receipt_url = str(data.get("printUrl") or data.get("receiptUrl") or def_print).strip()
            json_url = str(data.get("jsonUrl") or def_json).strip()
            return {
                "provider": "lknpd",
                "status": "registered",
                "tutorInn": clean_inn,
                "receiptUuid": receipt_uuid,
                "receiptUrl": receipt_url,
                "receiptJsonUrl": json_url,
                "serviceName": clean_service,
            }

        demo_uuid = f"NPD-{datetime.now(timezone.utc).year}-{secrets.token_hex(4).upper()}"
        demo_print, demo_json = build_fns_receipt_urls(clean_inn, demo_uuid) if ok_inn else ("", "")
        return {
            "provider": "demo",
            "status": "demo",
            "tutorInn": clean_inn if ok_inn else "",
            "receiptUuid": demo_uuid,
            "receiptUrl": demo_print,
            "receiptJsonUrl": demo_json,
            "serviceName": clean_service,
        }

    async def cancel_income_receipt(
        self,
        *,
        receipt_uuid: str,
        tutor_inn: str,
        reason: str = "Чек сформирован ошибочно",
        provider: str | None = None,
    ) -> dict[str, Any]:
        """Аннулирует ранее сформированный чек НПД."""
        clean_uuid = str(receipt_uuid or "").strip()
        if not clean_uuid:
            raise NpdError("receipt_not_found", "У выплаты отсутствует идентификатор чека НПД.", 404)
        eff_provider = str(provider or self.cfg.active_npd_provider).strip().lower()
        clean_reason = str(reason or "Чек сформирован ошибочно").strip()[:120]

        if eff_provider == "partner":
            if not self.cfg.npd_partner_configured:
                raise NpdError("npd_partner_not_configured", "Партнёрский шлюз ФНС НПД не настроен.", 503)
            url = f"{str(self.cfg.npd_partner_api_url).rstrip('/')}/receipts/{clean_uuid}/cancel"
            await self._post_json(
                url,
                json_body={"receiptUuid": clean_uuid, "tutorInn": tutor_inn, "reason": clean_reason},
                headers={"Authorization": f"Bearer {self.cfg.npd_partner_api_key}"},
            )
            return {"ok": True, "provider": "partner", "receiptUuid": clean_uuid, "status": "canceled"}

        if eff_provider == "lknpd":
            if not self.cfg.npd_lknpd_configured:
                raise NpdError("npd_lknpd_not_configured", "Токен кабинета «Мой налог» (NPD_LKNPD_TOKEN) не задан.", 503)
            now_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            url = f"{self.cfg.npd_lknpd_api_url.rstrip('/')}/cancel"
            await self._post_json(
                url,
                json_body={
                    "operationTime": now_iso,
                    "requestTime": now_iso,
                    "comment": clean_reason,
                    "receiptUuid": clean_uuid,
                    "partnerCode": None,
                },
                headers={"Authorization": f"Bearer {self.cfg.npd_lknpd_token}"},
            )
            return {"ok": True, "provider": "lknpd", "receiptUuid": clean_uuid, "status": "canceled"}

        return {"ok": True, "provider": "demo", "receiptUuid": clean_uuid, "status": "canceled"}


__all__ = [
    "FnsNpdClient",
    "NpdError",
    "build_fns_receipt_urls",
    "parse_fns_receipt_url",
    "validate_inn_12",
]
