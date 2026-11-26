"""HTTP-клиент для Headless Admin REST API платформы «Вектор»."""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

import httpx


class AdminApiError(RuntimeError):
    """Ошибка ответа или соединения с Admin REST API."""

    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = int(status_code)
        self.code = str(code or "api_error")
        self.message = str(message or f"Ошибка HTTP {status_code}")
        super().__init__(f"[{self.status_code}:{self.code}] {self.message}")


class AdminApiClient:
    """Синхронный клиент поверх httpx.Client с поддержкой X-Admin-Token и cookie-сессий."""

    def __init__(
        self,
        base_url: str,
        admin_token: str = "",
        timeout: float = 10.0,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        clean_url = (base_url or "http://127.0.0.1:8770").strip().rstrip("/")
        self.base_url = clean_url or "http://127.0.0.1:8770"
        self.admin_token = (admin_token or "").strip()
        headers: dict[str, str] = {"Accept": "application/json"}
        if self.admin_token:
            headers["X-Admin-Token"] = self.admin_token
        self._client = httpx.Client(
            base_url=self.base_url,
            headers=headers,
            timeout=timeout,
            transport=transport,
            follow_redirects=True,
        )

    def __enter__(self) -> AdminApiClient:
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._client.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            resp = self._client.request(method, path, params=params, json=json_body)
        except httpx.HTTPError as exc:
            raise AdminApiError(0, "connection_error", f"Не удалось подключиться к {self.base_url}: {exc}") from exc

        data: Any = None
        try:
            data = resp.json()
        except ValueError:
            data = None

        if resp.status_code >= 400:
            code = "api_error"
            msg = f"HTTP {resp.status_code}"
            if isinstance(data, dict):
                detail = data.get("detail", data)
                if isinstance(detail, dict):
                    code = str(detail.get("code") or code)
                    msg = str(detail.get("message") or msg)
                elif isinstance(detail, str) and detail.strip():
                    msg = detail.strip()
            raise AdminApiError(resp.status_code, code, msg)

        return data if isinstance(data, dict) else {"ok": True, "data": data}

    def login_session(self, username: str, password: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/api/auth/login",
            json_body={"username": username, "password": password},
        )

    def logout_session(self) -> dict[str, Any]:
        return self._request("POST", "/api/auth/logout")

    def ping(self) -> dict[str, Any]:
        return self._request("GET", "/api/admin/ping")

    def telegram_status(self) -> dict[str, Any]:
        return self._request("GET", "/api/telegram/status")

    def architecture(self) -> dict[str, Any]:
        return self._request("GET", "/api/admin/architecture")

    def overview(self) -> dict[str, Any]:
        return self._request("GET", "/api/admin/overview")

    def users(self, limit: int = 200) -> list[dict[str, Any]]:
        res = self._request("GET", "/api/admin/users", params={"limit": int(limit)})
        return list(res.get("users") or [])

    def set_user_role(self, user_id: int, role: str) -> dict[str, Any]:
        return self._request(
            "POST",
            f"/api/admin/users/{int(user_id)}/role",
            json_body={"role": role},
        )

    def tutors(self, limit: int = 200) -> list[dict[str, Any]]:
        res = self._request("GET", "/api/admin/tutors", params={"limit": int(limit)})
        return list(res.get("tutors") or [])

    def moderate_tutor(
        self,
        tutor_id: str,
        *,
        verified: bool | None = None,
        bumped: bool | None = None,
        tariff_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if verified is not None:
            payload["verified"] = bool(verified)
        if bumped is not None:
            payload["bumped"] = bool(bumped)
        if tariff_id is not None:
            payload["tariffId"] = str(tariff_id)
        safe_id = quote(str(tutor_id), safe="")
        return self._request("POST", f"/api/admin/tutors/{safe_id}/moderate", json_body=payload)

    def requests(self, limit: int = 200) -> list[dict[str, Any]]:
        res = self._request("GET", "/api/admin/requests", params={"limit": int(limit)})
        return list(res.get("requests") or [])

    def set_request_status(self, req_id: str, status: str) -> dict[str, Any]:
        safe_id = quote(str(req_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/requests/{safe_id}/status",
            json_body={"status": status},
        )

    def disputes(self, limit: int = 200) -> list[dict[str, Any]]:
        res = self._request("GET", "/api/admin/disputes", params={"limit": int(limit)})
        return list(res.get("disputes") or [])

    def resolve_dispute(self, dispute_id: str, action: str, resolution_note: str = "") -> dict[str, Any]:
        safe_id = quote(str(dispute_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/disputes/{safe_id}/resolve",
            json_body={"action": action, "resolutionNote": str(resolution_note or "")},
        )

    def payouts(self, limit: int = 200) -> list[dict[str, Any]]:
        res = self._request("GET", "/api/admin/payouts", params={"limit": int(limit)})
        return list(res.get("payouts") or [])

    def set_payout_status(self, payout_id: str, status: str) -> dict[str, Any]:
        safe_id = quote(str(payout_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/payouts/{safe_id}/status",
            json_body={"status": status},
        )

    def outbox(self, limit: int = 100) -> list[dict[str, Any]]:
        res = self._request("GET", "/api/admin/outbox", params={"limit": int(limit)})
        return list(res.get("events") or [])

    def scheduler_status(self) -> dict[str, Any]:
        return self._request("GET", "/api/admin/scheduler")

    def run_scheduler(self) -> dict[str, Any]:
        return self._request("POST", "/api/admin/scheduler/run")

    def ops_status(self) -> dict[str, Any]:
        return self._request("GET", "/api/admin/ops")

    def run_backup(self) -> dict[str, Any]:
        return self._request("POST", "/api/admin/backups/run")

    def send_test_alert(self) -> dict[str, Any]:
        return self._request("POST", "/api/admin/monitoring/test-alert")

    def verifications(self, *, status: str = "all", limit: int = 200) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": int(limit)}
        if status and status != "all":
            params["status"] = status
        res = self._request("GET", "/api/admin/verifications", params=params)
        return list(res.get("verifications") or [])

    def _get_binary(self, path: str) -> tuple[bytes, str]:
        try:
            resp = self._client.get(path, headers={"Accept": "*/*"})
        except httpx.HTTPError as exc:
            raise AdminApiError(0, "connection_error", f"Не удалось подключиться к {self.base_url}: {exc}") from exc

        if resp.status_code >= 400:
            code = "api_error"
            msg = f"HTTP {resp.status_code}"
            try:
                data = resp.json()
            except ValueError:
                data = None
            if isinstance(data, dict):
                detail = data.get("detail", data)
                if isinstance(detail, dict):
                    code = str(detail.get("code") or code)
                    msg = str(detail.get("message") or msg)
                elif isinstance(detail, str) and detail.strip():
                    msg = detail.strip()
            raise AdminApiError(resp.status_code, code, msg)

        content_type = str(resp.headers.get("content-type") or "application/octet-stream").split(";")[0].strip()
        return bytes(resp.content), content_type

    def verification_file_bytes(self, verification_id: str) -> tuple[bytes, str]:
        path = f"/api/admin/verifications/{quote(str(verification_id), safe='')}/file"
        return self._get_binary(path)

    def review_verification(
        self,
        verification_id: str,
        action: str,
        review_note: str = "",
    ) -> dict[str, Any]:
        path = f"/api/admin/verifications/{quote(str(verification_id), safe='')}/review"
        return self._request(
            "POST",
            path,
            json_body={"action": str(action or "").strip(), "reviewNote": str(review_note or "").strip()},
        )

    def payments(self, *, status: str = "all", limit: int = 200) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": int(limit)}
        if status and status != "all":
            params["status"] = status
        res = self._request("GET", "/api/admin/payments", params=params)
        return list(res.get("payments") or [])

    def sync_payment(self, intent_id: str) -> dict[str, Any]:
        path = f"/api/admin/payments/{quote(str(intent_id), safe='')}/sync"
        return self._request("POST", path)

    def refunds(self, *, status: str = "all", limit: int = 200) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": int(limit)}
        if status and status != "all":
            params["status"] = status
        res = self._request("GET", "/api/admin/refunds", params=params)
        return list(res.get("refunds") or [])

    def create_payment_refund(
        self,
        intent_id: str,
        *,
        amount: int | None = None,
        reason: str = "",
    ) -> dict[str, Any]:
        safe_id = quote(str(intent_id), safe="")
        body: dict[str, Any] = {"reason": str(reason or "").strip()}
        if amount is not None:
            body["amount"] = int(amount)
        return self._request("POST", f"/api/admin/payments/{safe_id}/refund", json_body=body)

    def dispatch_refund(self, refund_id: str, review_note: str = "") -> dict[str, Any]:
        safe_id = quote(str(refund_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/refunds/{safe_id}/dispatch",
            json_body={"reviewNote": str(review_note or "").strip()},
        )

    def sync_refund(self, refund_id: str) -> dict[str, Any]:
        safe_id = quote(str(refund_id), safe="")
        return self._request("POST", f"/api/admin/refunds/{safe_id}/sync")

    def reject_refund(self, refund_id: str, review_note: str = "") -> dict[str, Any]:
        safe_id = quote(str(refund_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/refunds/{safe_id}/reject",
            json_body={"reviewNote": str(review_note or "").strip()},
        )

    def dispatch_payout(
        self,
        payout_id: str,
        *,
        card_number: str = "",
        payout_token: str = "",
        sbp_phone: str = "",
        sbp_bank_id: str = "",
    ) -> dict[str, Any]:
        safe_id = quote(str(payout_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/payouts/{safe_id}/dispatch",
            json_body={
                "cardNumber": str(card_number or "").strip(),
                "payoutToken": str(payout_token or "").strip(),
                "sbpPhone": str(sbp_phone or "").strip(),
                "sbpBankId": str(sbp_bank_id or "").strip(),
            },
        )

    def sync_payout(self, payout_id: str) -> dict[str, Any]:
        safe_id = quote(str(payout_id), safe="")
        return self._request("POST", f"/api/admin/payouts/{safe_id}/sync")

    def register_payout_npd(
        self,
        payout_id: str,
        *,
        tutor_inn: str = "",
        receipt_url: str = "",
    ) -> dict[str, Any]:
        safe_id = quote(str(payout_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/payouts/{safe_id}/npd-register",
            json_body={
                "tutorInn": str(tutor_inn or "").strip(),
                "receiptUrl": str(receipt_url or "").strip(),
            },
        )

    def cancel_payout_npd(self, payout_id: str, *, reason: str = "") -> dict[str, Any]:
        safe_id = quote(str(payout_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/payouts/{safe_id}/npd-cancel",
            json_body={"reason": str(reason or "Чек сформирован ошибочно").strip()},
        )

    def npd_receipts(self, *, tutor_id: str | None = None, limit: int = 200) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": int(limit)}
        if tutor_id:
            params["tutor_id"] = str(tutor_id)
        res = self._request("GET", "/api/admin/npd-receipts", params=params)
        return list(res.get("receipts") or [])

    def tutor_applications(self, *, status: str = "all", limit: int = 200) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": int(limit)}
        if status and status != "all":
            params["status"] = status
        res = self._request("GET", "/api/admin/tutor-applications", params=params)
        return list(res.get("applications") or [])

    def review_tutor_application(
        self,
        app_id: str,
        status: str,
        review_note: str = "",
        *,
        publish_to_catalog: bool = False,
    ) -> dict[str, Any]:
        safe_id = quote(str(app_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/tutor-applications/{safe_id}/review",
            json_body={
                "status": str(status or "").strip(),
                "reviewNote": str(review_note or "").strip(),
                "publishToCatalog": bool(publish_to_catalog),
            },
        )

    def feedback(
        self,
        *,
        kind: str = "all",
        status: str = "all",
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"limit": int(limit)}
        if kind and kind != "all":
            params["kind"] = kind
        if status and status != "all":
            params["status"] = status
        res = self._request("GET", "/api/admin/feedback", params=params)
        return list(res.get("tickets") or [])

    def review_feedback(
        self,
        ticket_id: str,
        status: str,
        review_note: str = "",
    ) -> dict[str, Any]:
        safe_id = quote(str(ticket_id), safe="")
        return self._request(
            "POST",
            f"/api/admin/feedback/{safe_id}/review",
            json_body={
                "status": str(status or "").strip(),
                "reviewNote": str(review_note or "").strip(),
            },
        )

    def feedback_file_bytes(self, ticket_id: str, asset_id: str) -> tuple[bytes, str]:
        safe_tid = quote(str(ticket_id), safe="")
        safe_aid = quote(str(asset_id), safe="")
        return self._get_binary(f"/api/admin/feedback/{safe_tid}/files/{safe_aid}")
