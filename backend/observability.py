"""Наблюдаемость: сквозной X-Request-ID, структурированные JSON-логи и Prometheus /metrics."""

from __future__ import annotations

import contextvars
from datetime import datetime, timezone
import json
import logging
import re
import sys
import threading
import time
from typing import Any
import uuid

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("vektor_request_id", default="")

_REQ_ID_RE = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
_ID_SEG_RE = re.compile(
    r"/((?:tut|req|med|pi|rf|po|dsp|lead|usr|evt|msg|tic)-[A-Za-z0-9_-]+|[0-9]+|[0-9a-fA-F]{12,})(?=/|$)"
)
_PROM_BUCKETS: tuple[float, ...] = (0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0)

_EXTRA_FIELDS = (
    "method",
    "path",
    "route",
    "status",
    "duration_ms",
    "client_ip",
    "incident_id",
    "worker_id",
)


def get_request_id() -> str:
    return request_id_var.get("")


def sanitize_request_id(raw: str | None) -> str:
    txt = str(raw or "").strip()
    if txt and _REQ_ID_RE.match(txt):
        return txt
    return f"req-{uuid.uuid4().hex[:16]}"


def normalize_route_label(scope: dict[str, Any]) -> str:
    route_obj = scope.get("route")
    route_path = getattr(route_obj, "path", None)
    if isinstance(route_path, str) and route_path:
        return route_path
    raw_path = str(scope.get("path") or "/")
    return _ID_SEG_RE.sub("/{id}", raw_path) or "/"


def _prom_escape(val: str) -> str:
    return str(val).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")


class JsonLogFormatter(logging.Formatter):
    """Форматирует LogRecord в одну строку JSON с request_id и структурными полями."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": datetime.fromtimestamp(record.created, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        req_id = getattr(record, "request_id", None) or get_request_id()
        if req_id:
            payload["request_id"] = str(req_id)
        for field in _EXTRA_FIELDS:
            val = getattr(record, field, None)
            if val is not None:
                payload[field] = val
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


def configure_logging(*, json_logs: bool = False, level: str = "INFO") -> None:
    """Настраивает логирование семейства логгеров `vektor` без дублирования хендлеров и удаления caplog."""
    num_level = getattr(logging, str(level or "INFO").upper(), logging.INFO)
    pkg_logger = logging.getLogger("vektor")
    pkg_logger.setLevel(num_level)

    http_logger = logging.getLogger("vektor.http")
    http_logger.setLevel(num_level)

    handler: logging.Handler | None = None
    for h in pkg_logger.handlers:
        if getattr(h, "_vektor_managed", False):
            handler = h
            break
    if handler is None:
        handler = logging.StreamHandler(sys.stdout)
        setattr(handler, "_vektor_managed", True)
        pkg_logger.addHandler(handler)

    if json_logs:
        handler.setFormatter(JsonLogFormatter())
    else:
        handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(name)s %(message)s"))


class MetricsRegistry:
    """Лёгкий thread-safe реестр Prometheus-метрик в текстовом формате Exposition 0.0.4."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._started_mono = time.monotonic()
        self._in_flight = 0
        self._requests_total: dict[tuple[str, str, str], int] = {}
        self._errors_5xx_total = 0
        self._dur_sum: dict[tuple[str, str], float] = {}
        self._dur_count: dict[tuple[str, str], int] = {}
        self._dur_buckets: dict[tuple[str, str, float], int] = {}

    def inc_in_flight(self) -> None:
        with self._lock:
            self._in_flight += 1

    def dec_in_flight(self) -> None:
        with self._lock:
            self._in_flight = max(0, self._in_flight - 1)

    def observe_http(self, method: str, route: str, status: int, duration_sec: float) -> None:
        m = (method or "GET").upper()
        r = route or "/"
        st = str(int(status))
        dur = max(0.0, float(duration_sec))
        with self._lock:
            key = (m, r, st)
            self._requests_total[key] = self._requests_total.get(key, 0) + 1
            if int(status) >= 500:
                self._errors_5xx_total += 1
            hk = (m, r)
            self._dur_sum[hk] = self._dur_sum.get(hk, 0.0) + dur
            self._dur_count[hk] = self._dur_count.get(hk, 0) + 1
            for b in _PROM_BUCKETS:
                if dur <= b:
                    bk = (m, r, b)
                    self._dur_buckets[bk] = self._dur_buckets.get(bk, 0) + 1

    def render_prometheus(self, app_state: Any | None = None) -> str:
        lines: list[str] = []
        with self._lock:
            uptime = max(0.0, time.monotonic() - self._started_mono)
            in_flight = self._in_flight
            errors_5xx = self._errors_5xx_total
            reqs = sorted(self._requests_total.items())
            d_counts = sorted(self._dur_count.items())
            d_sums = dict(self._dur_sum)
            d_buckets = dict(self._dur_buckets)

        lines.append("# HELP vektor_process_uptime_seconds Application uptime in seconds.")
        lines.append("# TYPE vektor_process_uptime_seconds gauge")
        lines.append(f"vektor_process_uptime_seconds {uptime:.3f}")

        lines.append("# HELP vektor_http_requests_in_flight Current in-flight HTTP requests.")
        lines.append("# TYPE vektor_http_requests_in_flight gauge")
        lines.append(f"vektor_http_requests_in_flight {in_flight}")

        lines.append("# HELP vektor_http_errors_5xx_total Total HTTP 5xx responses served.")
        lines.append("# TYPE vektor_http_errors_5xx_total counter")
        lines.append(f"vektor_http_errors_5xx_total {errors_5xx}")

        lines.append("# HELP vektor_http_requests_total Total HTTP requests processed.")
        lines.append("# TYPE vektor_http_requests_total counter")
        for (m, r, st), cnt in reqs:
            lines.append(
                f'vektor_http_requests_total{{method="{_prom_escape(m)}",route="{_prom_escape(r)}",status="{_prom_escape(st)}"}} {cnt}'
            )

        lines.append("# HELP vektor_http_request_duration_seconds HTTP request duration histogram.")
        lines.append("# TYPE vektor_http_request_duration_seconds histogram")
        for (m, r), total_cnt in d_counts:
            em = _prom_escape(m)
            er = _prom_escape(r)
            for b in _PROM_BUCKETS:
                bcnt = d_buckets.get((m, r, b), 0)
                lines.append(
                    f'vektor_http_request_duration_seconds_bucket{{method="{em}",route="{er}",le="{b:g}"}} {bcnt}'
                )
            lines.append(f'vektor_http_request_duration_seconds_bucket{{method="{em}",route="{er}",le="+Inf"}} {total_cnt}')
            lines.append(f'vektor_http_request_duration_seconds_sum{{method="{em}",route="{er}"}} {d_sums.get((m, r), 0.0):.6f}')
            lines.append(f'vektor_http_request_duration_seconds_count{{method="{em}",route="{er}"}} {total_cnt}')

        if app_state is not None:
            rt = getattr(app_state, "realtime", None)
            if rt is not None:
                subs = int(getattr(rt, "subscriber_count", 0))
                pg_conn = 1 if bool(getattr(rt, "_pg_listener_connected", False)) else 0
                lines.append("# HELP vektor_realtime_subscribers Active SSE/WS realtime subscribers.")
                lines.append("# TYPE vektor_realtime_subscribers gauge")
                lines.append(f"vektor_realtime_subscribers {subs}")
                lines.append("# HELP vektor_realtime_pg_listener_connected PostgreSQL LISTEN/NOTIFY listener status (1=up, 0=down).")
                lines.append("# TYPE vektor_realtime_pg_listener_connected gauge")
                lines.append(f"vektor_realtime_pg_listener_connected {pg_conn}")

            sched = getattr(app_state, "scheduler", None)
            if sched is not None and hasattr(sched, "status"):
                st_data = sched.status()
                totals = st_data.get("totals") or {}
                lines.append("# HELP vektor_scheduler_ticks_total Completed background scheduler ticks.")
                lines.append("# TYPE vektor_scheduler_ticks_total counter")
                lines.append(f"vektor_scheduler_ticks_total {int(st_data.get('ticksTotal') or 0)}")
                lines.append("# HELP vektor_scheduler_lock_skipped_total Scheduler ticks skipped because pg_try_advisory_lock was held by another worker.")
                lines.append("# TYPE vektor_scheduler_lock_skipped_total counter")
                lines.append(f"vektor_scheduler_lock_skipped_total {int(totals.get('lockSkipped') or 0)}")
                lines.append("# HELP vektor_scheduler_errors_total Scheduler errors encountered.")
                lines.append("# TYPE vektor_scheduler_errors_total counter")
                lines.append(f"vektor_scheduler_errors_total {int(totals.get('errors') or 0)}")

            backups = getattr(app_state, "backups", None)
            if backups is not None and hasattr(backups, "status"):
                b_data = backups.status()
                lines.append("# HELP vektor_backups_s3_uploads_total Encrypted/plain backups uploaded to S3.")
                lines.append("# TYPE vektor_backups_s3_uploads_total counter")
                lines.append(f"vektor_backups_s3_uploads_total {int(b_data.get('s3UploadsTotal') or 0)}")

        return "\n".join(lines) + "\n"


_http_logger = logging.getLogger("vektor.http")


class RequestObservabilityMiddleware:
    """Pure-ASGI middleware для X-Request-ID, структурных access-логов и Prometheus-метрик."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict[str, Any], receive: Any, send: Any) -> None:
        if scope.get("type") != "http":
            await self.app(scope, receive, send)
            return

        hdrs = {k.lower(): v for k, v in (scope.get("headers") or ())}
        raw_req_id = hdrs.get(b"x-request-id", b"").decode("latin-1", errors="ignore")
        req_id = sanitize_request_id(raw_req_id)
        token = request_id_var.set(req_id)
        scope.setdefault("state", {})["request_id"] = req_id

        app_obj = scope.get("app")
        state = getattr(app_obj, "state", None)
        metrics = getattr(state, "metrics", None)
        if not isinstance(metrics, MetricsRegistry):
            metrics = None

        if metrics is not None:
            metrics.inc_in_flight()

        method = str(scope.get("method") or "GET").upper()
        path = str(scope.get("path") or "/")
        peer_info = scope.get("client")
        peer_ip = str(peer_info[0]) if (isinstance(peer_info, (tuple, list)) and peer_info) else ""
        started = time.perf_counter()
        captured_status = 500

        async def wrapped_send(message: dict[str, Any]) -> None:
            nonlocal captured_status
            if message.get("type") == "http.response.start":
                captured_status = int(message.get("status") or 200)
                raw_out = [(k, v) for k, v in (message.get("headers") or []) if k.lower() != b"x-request-id"]
                raw_out.append((b"x-request-id", req_id.encode("ascii")))
                message["headers"] = raw_out
            await send(message)

        try:
            await self.app(scope, receive, wrapped_send)
        finally:
            dur_sec = max(0.0, time.perf_counter() - started)
            if metrics is not None:
                metrics.dec_in_flight()
                route_lbl = normalize_route_label(scope)
                metrics.observe_http(method, route_lbl, captured_status, dur_sec)
            else:
                route_lbl = normalize_route_label(scope)
            if path != "/metrics":
                _http_logger.info(
                    "%s %s -> %s (%.1fms)",
                    method,
                    path,
                    captured_status,
                    dur_sec * 1000.0,
                    extra={
                        "request_id": req_id,
                        "method": method,
                        "path": path,
                        "route": route_lbl,
                        "status": captured_status,
                        "duration_ms": round(dur_sec * 1000.0, 2),
                        "client_ip": peer_ip,
                    },
                )
            request_id_var.reset(token)


__all__ = [
    "JsonLogFormatter",
    "MetricsRegistry",
    "RequestObservabilityMiddleware",
    "configure_logging",
    "get_request_id",
    "normalize_route_label",
    "request_id_var",
    "sanitize_request_id",
]
