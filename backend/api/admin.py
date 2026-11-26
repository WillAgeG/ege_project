"""Headless API роуты админ-панели («Вектор» — модерация, роли, заявки, выплаты, outbox)."""

from __future__ import annotations

import asyncio
import hmac
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field

from databases.migrations_status import get_migration_status
from ..backups import BackupManager
from ..config import Settings
from ..media_storage import create_media_storage
from ..npd_fns import FnsNpdClient
from ..observability import MetricsRegistry
from ..otp_delivery import OtpDeliveryService
from ..payouts import YooKassaPayoutsClient
from ..yookassa import YooKassaClient
from .auth_docs import require_user


class AdminUserRolePayload(BaseModel):
    role: str = Field(..., min_length=1, max_length=32)


class AdminModerateTutorPayload(BaseModel):
    verified: bool | None = None
    bumped: bool | None = None
    tariffId: str | None = Field(default=None, max_length=32)


class AdminTutorApplicationReviewPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)
    reviewNote: str = Field(default="", max_length=400)
    publishToCatalog: bool = Field(default=False)


class AdminRequestStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class AdminPayoutStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class AdminDisputeResolvePayload(BaseModel):
    action: str = Field(..., min_length=1, max_length=16)
    resolutionNote: str = Field(default="", max_length=300)


def _architecture_layers() -> list[dict[str, Any]]:
    return [
        {
            "id": "uiKit",
            "name": "@vektor-ege/ui-kit",
            "layer": "ui-kit",
            "port": 8772,
            "url": "http://127.0.0.1:8772",
            "status": "decoupled",
            "repo": "vektor-ui-kit",
            "summary": "Zero-API дизайн-система, Design Tokens, DataViz и /brandbook",
            "endpoints": ["/brandbook", "/tokens.json", "/components/kit.js"],
        },
        {
            "id": "headlessApi",
            "name": "vektor-api",
            "layer": "headless-api",
            "port": 8771,
            "url": "http://127.0.0.1:8771",
            "status": "active",
            "repo": "vektor-api",
            "summary": "Headless FastAPI (JSON / SSE / WebSocket / .ics / Admin REST)",
            "endpoints": ["/api/health/storage", "/api/admin/overview", "/docs"],
        },
        {
            "id": "spaShell",
            "name": "Preparation SPA Shell",
            "layer": "spa-shell",
            "port": 8770,
            "url": "http://127.0.0.1:8770",
            "status": "active",
            "repo": "Preparation",
            "summary": "Единая точка сборки SPA-оболочки, EGE.api клиента и модульных вьюх",
            "endpoints": ["/", "/landing", "/market", "/brandbook", "/fees"],
        },
        {
            "id": "postgres",
            "name": "PostgreSQL 17 OLTP + Outbox",
            "layer": "postgres",
            "port": 5432,
            "url": "postgresql://127.0.0.1:5432/vektor_ege",
            "status": "active",
            "repo": "vektor-postgres",
            "summary": "Схемы oltp.*, silver.*, gold.* и outbox.kafka_outbox (Envelope v1)",
            "endpoints": ["oltp.users", "oltp.tutors", "oltp.lesson_requests", "outbox.kafka_outbox"],
        },
        {
            "id": "polars",
            "name": "Polars 2.1 + DuckDB Engine",
            "layer": "polars",
            "port": None,
            "url": None,
            "status": "active",
            "repo": "vektor-polars-engine",
            "summary": "Medallion Bronze -> Silver -> Gold ZSTD Parquet (arm64, 12 потоков)",
            "endpoints": ["run-medallion", "run-sales-elt", "run-clickstream"],
        },
        {
            "id": "airflow",
            "name": "Apache Airflow 3.4.0",
            "layer": "airflow",
            "port": 8085,
            "url": "http://127.0.0.1:8085",
            "status": "active",
            "repo": "vektor-airflow",
            "summary": "3 оркестрируемых DAG (Medallion, Sales/Escrow ELT, Clickstream)",
            "endpoints": ["/api/v2/monitor/health"],
        },
        {
            "id": "grafana",
            "name": "Grafana 11.3 BI",
            "layer": "grafana",
            "port": 3000,
            "url": "http://127.0.0.1:3000",
            "status": "active",
            "repo": "vektor-grafana",
            "summary": "4 дашборда по GMV, комиссии 5%, воронке кликстрима и SLA",
            "endpoints": ["/api/health"],
        },
    ]


def _clamp_limit(limit: int, *, default: int = 100, maximum: int = 500) -> int:
    try:
        val = int(limit)
    except (TypeError, ValueError):
        return default
    return max(1, min(maximum, val))


def _extract_admin_token(request: Request) -> str:
    direct = (request.headers.get("x-admin-token") or "").strip()
    if direct:
        return direct
    auth_hdr = (request.headers.get("authorization") or "").strip()
    if auth_hdr.lower().startswith("bearer "):
        return auth_hdr[7:].strip()
    return ""


def _require_admin(request: Request, settings: Settings) -> str:
    expected_token = (getattr(settings, "admin_api_token", "") or "").strip()
    candidate = _extract_admin_token(request)
    if expected_token and candidate:
        if hmac.compare_digest(candidate, expected_token):
            return "token"
        raise HTTPException(
            status_code=403,
            detail={"code": "invalid_admin_token", "message": "Неверный токен администратора."},
        )
    if expected_token or getattr(settings, "admin_require_auth", False):
        user = require_user(request, settings)
        if str(getattr(user, "role", "student") or "").lower() != "admin":
            raise HTTPException(
                status_code=403,
                detail={"code": "admin_only", "message": "Доступ только для администратора."},
            )
        return "session"
    return "open"


def create_admin_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/admin/ping")
    async def admin_ping(request: Request) -> dict[str, Any]:
        auth_mode = _require_admin(request, settings)
        return {"ok": True, "authMode": auth_mode}

    @router.get("/api/admin/architecture")
    async def admin_architecture(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        db = request.app.state.db
        storage = db.storage_health() if hasattr(db, "storage_health") else {"ok": True, "mode": "sqlite"}
        return {
            "ok": True,
            "layers": _architecture_layers(),
            "storage": storage,
        }

    @router.get("/api/admin/overview")
    async def admin_overview(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        return request.app.state.db.admin_overview()

    @router.get("/api/admin/users")
    async def admin_users(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_admin(request, settings)
        return {"ok": True, "users": request.app.state.db.admin_list_users(limit=_clamp_limit(limit))}

    @router.post("/api/admin/users/{user_id}/role")
    async def admin_set_user_role(user_id: int, payload: AdminUserRolePayload, request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        user = request.app.state.db.admin_set_user_role(user_id, payload.role)
        return {"ok": True, "user": user}

    @router.get("/api/admin/tutors")
    async def admin_tutors(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_admin(request, settings)
        return {"ok": True, "tutors": request.app.state.db.admin_list_tutors(limit=_clamp_limit(limit))}

    @router.post("/api/admin/tutors/{tutor_id}/moderate")
    async def admin_moderate_tutor(
        tutor_id: str,
        payload: AdminModerateTutorPayload,
        request: Request,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        tutor = request.app.state.db.admin_moderate_tutor(
            tutor_id,
            verified=payload.verified,
            bumped=payload.bumped,
            tariff_id=payload.tariffId,
        )
        return {"ok": True, "tutor": tutor}

    @router.get("/api/admin/tutor-applications")
    async def admin_tutor_applications(
        request: Request,
        status: str = "all",
        limit: int = 200,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        items = request.app.state.db.admin_list_tutor_applications(
            status=status,
            limit=_clamp_limit(limit, default=200),
        )
        return {"ok": True, "applications": items}

    @router.post("/api/admin/tutor-applications/{app_id}/review")
    async def admin_review_tutor_application(
        app_id: str,
        payload: AdminTutorApplicationReviewPayload,
        request: Request,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        res = request.app.state.db.admin_review_tutor_application(
            app_id,
            status=payload.status,
            review_note=payload.reviewNote,
            publish_to_catalog=payload.publishToCatalog,
        )
        app_item = res["application"]
        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            rt.publish(
                request.app.state.db,
                channel="all",
                event_type=f"admin.tutor_application.{app_item['status']}",
                title="Статус заявки преподавателя обновлён",
                message=f"{app_item['name']} · {app_item['status']}",
                payload={"applicationId": app_id, "application": app_item},
            )
        return {"ok": True, **res}

    @router.get("/api/admin/requests")
    async def admin_requests(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_admin(request, settings)
        return {"ok": True, "requests": request.app.state.db.admin_list_requests(limit=_clamp_limit(limit))}

    @router.post("/api/admin/requests/{req_id}/status")
    async def admin_set_request_status(
        req_id: str,
        payload: AdminRequestStatusPayload,
        request: Request,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        req_item = request.app.state.db.admin_set_request_status(req_id, payload.status)
        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            rt.publish(
                request.app.state.db,
                channel="all",
                event_type=f"admin.request.{req_item.get('status', payload.status)}",
                title="Статус заявки обновлён администратором",
                message=f"{req_item.get('tutorName') or req_item.get('tutorId')} · {req_item.get('status')}",
                tutor_slug=str(req_item.get("tutorId") or "") or None,
                payload={"requestId": req_id, "booking": req_item},
            )
        return {"ok": True, "request": req_item}

    @router.get("/api/admin/payouts")
    async def admin_payouts(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_admin(request, settings)
        return {"ok": True, "payouts": request.app.state.db.admin_list_payouts(limit=_clamp_limit(limit))}

    @router.post("/api/admin/payouts/{payout_id}/status")
    async def admin_set_payout_status(
        payout_id: str,
        payload: AdminPayoutStatusPayload,
        request: Request,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        payout = request.app.state.db.admin_set_payout_status(payout_id, payload.status)
        if (
            payout.get("status") == "succeeded"
            and payout.get("npdRequested")
            and payout.get("npdStatus") in ("pending", "failed")
            and settings.payouts.active_npd_provider != "demo"
        ):
            from ..npd_fns import NpdError
            from .payouts import register_payout_npd_receipt

            npd_client = getattr(request.app.state, "npd_client", None) or FnsNpdClient(
                settings.payouts,
                http_getter=lambda: getattr(request.app.state, "http", None),
            )
            try:
                await register_payout_npd_receipt(
                    request.app.state.db,
                    npd_client,
                    payout_id,
                    realtime=getattr(request.app.state, "realtime", None),
                )
                payout = request.app.state.db.get_payout(payout_id) or payout
            except NpdError:
                payout = request.app.state.db.get_payout(payout_id) or payout
        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            rt.publish(
                request.app.state.db,
                channel="tutor",
                event_type=f"admin.payout.{payout.get('status', payload.status)}",
                title="Статус выплаты обновлён",
                message=f"{int(payout.get('amountRub') or 0)} ₽ · {payout.get('status')}",
                tutor_slug=str(payout.get("tutorId") or "") or None,
                payload={"payoutId": payout_id, "payout": payout},
            )
        return {"ok": True, "payout": payout}

    @router.get("/api/admin/disputes")
    async def admin_disputes(request: Request, limit: int = 100) -> dict[str, Any]:
        _require_admin(request, settings)
        return {"ok": True, "disputes": request.app.state.db.list_disputes(limit=_clamp_limit(limit))}

    @router.post("/api/admin/disputes/{dispute_id}/resolve")
    async def admin_resolve_dispute(
        dispute_id: str,
        payload: AdminDisputeResolvePayload,
        request: Request,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        res = request.app.state.db.resolve_dispute(
            dispute_id,
            payload.action,
            resolution_note=payload.resolutionNote,
        )
        dsp = res["dispute"]
        rt = getattr(request.app.state, "realtime", None)
        if rt is not None:
            rt.publish(
                request.app.state.db,
                channel="all",
                event_type=f"payments.dispute.{dsp.get('status', payload.action)}",
                title="Решение по спору" if dsp.get("status") == "rejected" else "Возврат по гарантии одобрен",
                message=f"{dsp.get('tutorName') or dsp.get('tutorId')} · {int(res.get('refundedRub') or 0)} ₽",
                tutor_slug=str(dsp.get("tutorId") or "") or None,
                payload={"disputeId": dispute_id, "dispute": dsp, "refundedRub": res.get("refundedRub", 0)},
            )
        return {"ok": True, **res}

    @router.get("/api/admin/outbox")
    async def admin_outbox(request: Request, limit: int = 50) -> dict[str, Any]:
        _require_admin(request, settings)
        return {"ok": True, "events": request.app.state.db.admin_list_outbox(limit=_clamp_limit(limit, default=50))}

    @router.get("/api/admin/scheduler")
    async def admin_scheduler_status(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        sched = getattr(request.app.state, "scheduler", None)
        if sched is None:
            return {"ok": True, "enabled": False, "running": False, "ticksTotal": 0, "totals": {}}
        return {"ok": True, **sched.status()}

    @router.post("/api/admin/scheduler/run")
    async def admin_scheduler_run(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        sched = getattr(request.app.state, "scheduler", None)
        if sched is None:
            raise HTTPException(
                status_code=503,
                detail={"code": "scheduler_unavailable", "message": "Планировщик не инициализирован."},
            )
        result = await sched.run_once()
        return {"ok": True, "result": result, "scheduler": sched.status()}

    @router.get("/api/admin/ops")
    async def admin_ops_status(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        backups = getattr(request.app.state, "backups", None) or BackupManager(settings)
        media_storage = getattr(request.app.state, "media_storage", None) or create_media_storage(
            settings,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        yookassa = getattr(request.app.state, "yookassa", None) or YooKassaClient(
            settings.payments,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        payout_gw = getattr(request.app.state, "payout_gateway", None) or YooKassaPayoutsClient(
            settings.payouts,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        npd_client = getattr(request.app.state, "npd_client", None) or FnsNpdClient(
            settings.payouts,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        monitor = getattr(request.app.state, "monitor", None)
        limiter = getattr(request.app.state, "limiter", None)
        otp_store = getattr(request.app.state, "otp_store", None)
        otp_delivery = getattr(request.app.state, "otp_delivery", None) or OtpDeliveryService(
            settings.otp,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        return {
            "ok": True,
            "migrations": get_migration_status(settings),
            "backups": backups.status(),
            "media": media_storage.status(),
            "payments": yookassa.status(),
            "payouts": payout_gw.status(),
            "npd": npd_client.status(),
            "otpDelivery": otp_delivery.status(),
            "security": {
                "rateLimiterStore": getattr(limiter, "backend_name", "memory"),
                "otpStore": getattr(otp_store, "backend_name", "memory"),
                "demoMode": bool(settings.dev_demo_mode),
            },
            "monitoring": (
                monitor.status()
                if monitor is not None
                else {
                    "enabled": False,
                    "cooldownSec": int(settings.monitoring.alert_cooldown_sec),
                    "total5xx": 0,
                    "alertsSent": 0,
                    "alertsSuppressed": 0,
                    "telegramAlertsEnabled": False,
                    "sentryEnabled": bool(settings.monitoring.sentry_dsn),
                    "sentrySent": 0,
                    "lastAlertAt": None,
                    "recentErrors": [],
                }
            ),
            "analytics": {
                "enabled": bool(settings.analytics.enabled),
                "yandexMetrikaId": settings.analytics.yandex_metrika_id,
                "webvisor": bool(settings.analytics.yandex_metrika_webvisor),
            },
            "realtime": (
                rt.status()
                if (rt := getattr(request.app.state, "realtime", None)) is not None and hasattr(rt, "status")
                else {}
            ),
            "observability": {
                "jsonLogs": bool(settings.monitoring.json_logs),
                "logLevel": settings.monitoring.log_level,
                "metricsEnabled": bool(settings.monitoring.metrics_enabled),
            },
        }

    @router.get("/metrics")
    async def prometheus_metrics(request: Request) -> Response:
        if not getattr(settings.monitoring, "metrics_enabled", True):
            raise HTTPException(
                status_code=404,
                detail={"code": "metrics_disabled", "message": "Экспорт метрик отключён."},
            )
        expected_metrics_tok = str(getattr(settings.monitoring, "metrics_token", "") or "").strip()
        if expected_metrics_tok:
            cand = (request.headers.get("x-metrics-token") or "").strip()
            if not cand:
                auth_hdr = (request.headers.get("authorization") or "").strip()
                if auth_hdr.lower().startswith("bearer "):
                    cand = auth_hdr[7:].strip()
            if not cand or not hmac.compare_digest(cand, expected_metrics_tok):
                raise HTTPException(
                    status_code=403,
                    detail={"code": "invalid_metrics_token", "message": "Неверный токен доступа к /metrics."},
                )
        elif getattr(settings, "admin_require_auth", False) or (getattr(settings, "admin_api_token", "") or "").strip():
            _require_admin(request, settings)

        registry = getattr(request.app.state, "metrics", None)
        if not isinstance(registry, MetricsRegistry):
            registry = MetricsRegistry()
        body = registry.render_prometheus(request.app.state)
        return Response(
            content=body,
            media_type="text/plain; version=0.0.4; charset=utf-8",
            headers={"Cache-Control": "no-store"},
        )

    @router.post("/api/admin/backups/run")
    async def admin_backups_run(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        backups = getattr(request.app.state, "backups", None)
        if backups is None:
            backups = BackupManager(settings)
            request.app.state.backups = backups
        result = await asyncio.to_thread(backups.run_backup)
        return {"ok": True, "backup": result, "backups": backups.status()}

    @router.post("/api/admin/monitoring/test-alert")
    async def admin_monitoring_test_alert(request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        monitor = getattr(request.app.state, "monitor", None)
        if monitor is None:
            raise HTTPException(
                status_code=503,
                detail={"code": "monitor_unavailable", "message": "Сервис мониторинга не инициализирован."},
            )
        res = await monitor.send_test_alert()
        return {"ok": True, **res, "monitoring": monitor.status()}

    return router
