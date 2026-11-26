"""Мониторинг ошибок 5xx, дедупликация алертов, отправка в админский чат Telegram и Sentry."""

from __future__ import annotations

from collections import deque
from datetime import datetime, timezone
import logging
import re
import time
import traceback
from typing import Any, Callable
from urllib.parse import parse_qs, urlsplit
import uuid

import httpx

from .config import MonitoringConfig, Settings
from .observability import get_request_id

logger = logging.getLogger("vektor.monitoring")

_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
_PHONE_RE = re.compile(r"\+?\d[\d\s()\-]{8,}\d")


def _scrub_text(raw: str, max_len: int = 280) -> str:
    txt = _EMAIL_RE.sub("[email]", str(raw or ""))
    txt = _PHONE_RE.sub("[phone]", txt)
    txt = " ".join(txt.split())
    if len(txt) > max_len:
        return txt[: max_len - 1] + "…"
    return txt


def parse_sentry_dsn(dsn: str | None) -> dict[str, str] | None:
    """Разбирает Sentry DSN вида https://<key>@<host>/<project_id> в endpoint Store API."""
    raw = str(dsn or "").strip()
    if not raw:
        return None
    try:
        parsed = urlsplit(raw)
    except ValueError:
        return None
    if parsed.scheme not in ("http", "https") or not parsed.hostname or not parsed.username:
        return None
    segs = [s for s in parsed.path.split("/") if s]
    if not segs or not segs[-1].isdigit():
        return None
    project_id = segs[-1]
    prefix = "/" + "/".join(segs[:-1]) if len(segs) > 1 else ""
    host_port = f"{parsed.hostname}:{parsed.port}" if parsed.port else parsed.hostname
    return {
        "store_url": f"{parsed.scheme}://{host_port}{prefix}/api/{project_id}/store/",
        "public_key": parsed.username,
        "project_id": project_id,
    }


def _extract_query_keys(query_bytes: bytes) -> list[str]:
    if not query_bytes:
        return []
    try:
        q_str = query_bytes.decode("latin-1", errors="ignore")
        parsed = parse_qs(q_str, keep_blank_values=True)
        return sorted(parsed.keys())[:20]
    except Exception:
        return []


def _format_frames(exc: BaseException | None, limit: int = 8) -> list[dict[str, Any]]:
    if exc is None or exc.__traceback__ is None:
        return []
    frames: list[dict[str, Any]] = []
    for frame in traceback.extract_tb(exc.__traceback__)[-limit:]:
        frames.append(
            {
                "filename": frame.filename.split("/")[-1],
                "lineno": int(frame.lineno or 0),
                "function": str(frame.name or ""),
            }
        )
    return frames


class ErrorMonitor:
    """Фиксирует инциденты 5xx, подавляет дубли и шлёт алерты в Telegram и Sentry."""

    def __init__(
        self,
        *,
        settings: Settings,
        telegram: Any | None = None,
        http_getter: Callable[[], httpx.AsyncClient | None] | None = None,
    ) -> None:
        self.settings = settings
        self.config: MonitoringConfig = settings.monitoring
        self.telegram = telegram
        self._http_getter = http_getter
        self._sentry = parse_sentry_dsn(self.config.sentry_dsn)
        self._sentry_sdk = self._try_init_sentry_sdk()
        self._recent: deque[dict[str, Any]] = deque(maxlen=50)
        self._cooldowns: dict[tuple[str, str, int, str], float] = {}
        self._total_5xx = 0
        self._alerts_sent = 0
        self._alerts_suppressed = 0
        self._sentry_sent = 0
        self._last_alert_at: str | None = None

    def _try_init_sentry_sdk(self) -> Any | None:
        if not self._sentry or not self.config.sentry_dsn:
            return None
        try:
            import sentry_sdk  # type: ignore[import-not-found]
        except ImportError:
            return None
        try:
            sentry_sdk.init(
                dsn=self.config.sentry_dsn,
                environment=self.settings.env,
                release=self.config.release,
                traces_sample_rate=self.config.sentry_traces_sample_rate,
                send_default_pii=False,
            )
            return sentry_sdk
        except Exception as exc:
            logger.warning("sentry_sdk init skipped: %s", exc)
            return None

    def _in_cooldown(self, key: tuple[str, str, int, str]) -> bool:
        now_mono = time.monotonic()
        last = self._cooldowns.get(key)
        if last is not None and (now_mono - last) < float(self.config.alert_cooldown_sec):
            return True
        if len(self._cooldowns) > 256:
            cutoff = now_mono - float(self.config.alert_cooldown_sec)
            self._cooldowns = {k: v for k, v in self._cooldowns.items() if v >= cutoff}
        self._cooldowns[key] = now_mono
        return False

    async def _send_sentry_event(
        self,
        *,
        incident_id: str,
        method: str,
        path: str,
        query_keys: list[str],
        status_code: int,
        exc_type: str,
        clean_msg: str,
        frames: list[dict[str, Any]],
        exc: BaseException | None = None,
        request_id: str = "",
    ) -> bool:
        if not self._sentry:
            return False
        if self._sentry_sdk is not None and exc is not None:
            try:
                self._sentry_sdk.capture_exception(exc)
                self._sentry_sent += 1
                return True
            except Exception as sdk_exc:
                logger.warning("sentry_sdk capture failed: %s", sdk_exc)

        client = self._http_getter() if self._http_getter else None
        owns_client = False
        if client is None:
            client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=5.0))
            owns_client = True

        tags = {
            "incident_id": incident_id,
            "http.method": method,
            "http.status_code": str(status_code),
        }
        if request_id:
            tags["request_id"] = request_id

        event_payload: dict[str, Any] = {
            "event_id": uuid.uuid4().hex,
            "timestamp": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "platform": "python",
            "level": "error",
            "environment": self.settings.env,
            "release": self.config.release,
            "tags": tags,
            "request": {
                "method": method,
                "url": path,
                "query_keys": query_keys,
            },
            "exception": {
                "values": [
                    {
                        "type": exc_type or f"HTTP_{status_code}",
                        "value": clean_msg,
                        **({"stacktrace": {"frames": frames}} if frames else {}),
                    }
                ]
            },
        }
        auth_header = (
            f"Sentry sentry_version=7, sentry_client=vektor-monitor/1.0, sentry_key={self._sentry['public_key']}"
        )
        try:
            resp = await client.post(
                self._sentry["store_url"],
                json=event_payload,
                headers={"X-Sentry-Auth": auth_header, "Content-Type": "application/json"},
            )
            if 200 <= resp.status_code < 300:
                self._sentry_sent += 1
                return True
            logger.warning("Sentry Store API status=%s", resp.status_code)
            return False
        except Exception as send_exc:
            logger.warning("Sentry Store API request failed: %s", send_exc)
            return False
        finally:
            if owns_client:
                await client.aclose()

    async def record_and_alert(
        self,
        *,
        method: str,
        path: str,
        query_keys: list[str] | None = None,
        status_code: int = 500,
        exc: BaseException | None = None,
        message: str = "",
    ) -> str:
        """Сохраняет инцидент без ПДн и отправляет алерт при отсутствии кулдауна."""
        incident_id = f"inc-{uuid.uuid4().hex[:10]}"
        req_id = get_request_id()
        occurred_iso = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        exc_type = type(exc).__name__ if exc is not None else f"HTTP{status_code}"
        raw_msg = str(exc) if exc is not None and str(exc).strip() else (message or exc_type)
        clean_msg = _scrub_text(raw_msg)
        q_keys = list(query_keys or [])
        frames = _format_frames(exc)

        self._total_5xx += 1
        suppressed = False
        if not self.config.alert_5xx_enabled:
            suppressed = True
        elif self._in_cooldown((method.upper(), path, int(status_code), exc_type)):
            suppressed = True
            self._alerts_suppressed += 1

        record = {
            "incidentId": incident_id,
            "requestId": req_id,
            "occurredAt": occurred_iso,
            "method": method.upper(),
            "path": path,
            "queryKeys": q_keys,
            "statusCode": int(status_code),
            "excType": exc_type,
            "message": clean_msg,
            "location": (
                f"{frames[-1]['filename']}:{frames[-1]['lineno']} ({frames[-1]['function']})"
                if frames
                else ""
            ),
            "alertSuppressed": suppressed,
        }
        self._recent.appendleft(record)

        if suppressed:
            return incident_id

        tg_sent = False
        if self.telegram is not None:
            loc_line = f"\nМесто: {record['location']}" if record["location"] else ""
            q_line = f"\nQuery-ключи: {', '.join(q_keys)}" if q_keys else ""
            rid_line = f"\nRequest-ID: {req_id}" if req_id else ""
            alert_body = (
                f"Инцидент: {incident_id}{rid_line}\n"
                f"Среда: {self.settings.env}\n"
                f"Запрос: {method.upper()} {path} -> HTTP {int(status_code)}\n"
                f"Тип: {exc_type}: {clean_msg}"
                f"{loc_line}{q_line}"
            )
            try:
                tg_sent = bool(await self.telegram.notify_admin_alert("Ошибка 5xx на сервере", alert_body))
            except Exception as tg_exc:
                logger.warning("Telegram 5xx alert failed: %s", tg_exc)

        sentry_ok = await self._send_sentry_event(
            incident_id=incident_id,
            method=method.upper(),
            path=path,
            query_keys=q_keys,
            status_code=int(status_code),
            exc_type=exc_type,
            clean_msg=clean_msg,
            frames=frames,
            exc=exc,
            request_id=req_id,
        )

        if tg_sent or sentry_ok:
            self._alerts_sent += 1
            self._last_alert_at = occurred_iso
        return incident_id

    async def send_test_alert(self) -> dict[str, Any]:
        """Отправляет тестовое уведомление в настроенные каналы мониторинга."""
        tg_configured = bool(
            self.telegram is not None
            and (self.settings.telegram.bot_token or "").strip()
            and (self.settings.telegram.admin_chat_id or "").strip()
        )
        sentry_configured = self._sentry is not None
        incident_id = f"test-{uuid.uuid4().hex[:8]}"
        tg_sent = False
        if self.telegram is not None and tg_configured:
            try:
                tg_sent = bool(
                    await self.telegram.notify_admin_alert(
                        "Тестовый алерт 5xx-мониторинга",
                        f"ID: {incident_id}\nСреда: {self.settings.env}\nПроверка доставки уведомлений Вектор.",
                    )
                )
            except Exception as exc:
                logger.warning("Telegram test alert failed: %s", exc)

        sentry_sent = False
        if sentry_configured:
            sentry_sent = await self._send_sentry_event(
                incident_id=incident_id,
                method="POST",
                path="/api/admin/monitoring/test-alert",
                query_keys=[],
                status_code=500,
                exc_type="SyntheticTestAlert",
                clean_msg="Тестовое событие проверки Sentry",
                frames=[],
                exc=None,
            )

        if tg_sent or sentry_sent:
            self._alerts_sent += 1
            self._last_alert_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

        return {
            "incidentId": incident_id,
            "telegramConfigured": tg_configured,
            "telegramSent": tg_sent,
            "sentryConfigured": sentry_configured,
            "sentrySent": sentry_sent,
        }

    def status(self) -> dict[str, Any]:
        tg_ok = bool(
            (self.settings.telegram.bot_token or "").strip()
            and (self.settings.telegram.admin_chat_id or "").strip()
        )
        return {
            "enabled": bool(self.config.alert_5xx_enabled),
            "cooldownSec": int(self.config.alert_cooldown_sec),
            "total5xx": int(self._total_5xx),
            "alertsSent": int(self._alerts_sent),
            "alertsSuppressed": int(self._alerts_suppressed),
            "telegramAlertsEnabled": tg_ok,
            "sentryEnabled": self._sentry is not None,
            "sentrySent": int(self._sentry_sent),
            "lastAlertAt": self._last_alert_at,
            "recentErrors": list(self._recent),
        }


class ErrorMonitoringMiddleware:
    """Pure-ASGI перехватчик необработанных исключений и ответов 5xx без буферизации."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        method = str(scope.get("method") or "GET").upper()
        path = str(scope.get("path") or "/")
        query_keys = _extract_query_keys(scope.get("query_string") or b"")
        response_started = False
        captured_status = 200

        async def wrapped_send(message: dict[str, Any]) -> None:
            nonlocal response_started, captured_status
            if message.get("type") == "http.response.start":
                response_started = True
                captured_status = int(message.get("status") or 200)
            await send(message)

        def _get_monitor() -> ErrorMonitor | None:
            app_obj = scope.get("app")
            state = getattr(app_obj, "state", None)
            mon = getattr(state, "monitor", None)
            return mon if isinstance(mon, ErrorMonitor) else None

        try:
            await self.app(scope, receive, wrapped_send)
        except Exception as exc:
            logger.exception("Unhandled HTTP error on %s %s", method, path)
            mon = _get_monitor()
            incident_id = (
                await mon.record_and_alert(
                    method=method,
                    path=path,
                    query_keys=query_keys,
                    status_code=500,
                    exc=exc,
                )
                if mon is not None
                else f"inc-{uuid.uuid4().hex[:10]}"
            )
            if response_started:
                return
            import json as _json

            payload = _json.dumps(
                {
                    "code": "internal_error",
                    "message": "Внутренняя ошибка сервера.",
                    "incidentId": incident_id,
                    "requestId": get_request_id(),
                },
                ensure_ascii=False,
            ).encode("utf-8")
            await send(
                {
                    "type": "http.response.start",
                    "status": 500,
                    "headers": [
                        (b"content-type", b"application/json; charset=utf-8"),
                        (b"cache-control", b"no-store"),
                        (b"content-length", str(len(payload)).encode("ascii")),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": payload})
            return

        if captured_status >= 500:
            mon = _get_monitor()
            if mon is not None:
                await mon.record_and_alert(
                    method=method,
                    path=path,
                    query_keys=query_keys,
                    status_code=captured_status,
                    message=f"HTTP {captured_status}",
                )


__all__ = ["ErrorMonitor", "ErrorMonitoringMiddleware", "parse_sentry_dsn"]
