"""Headless API роуты админ-панели («Вектор ЕГЭ» — модерация, роли, заявки, выплаты, outbox)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..config import Settings


class AdminUserRolePayload(BaseModel):
    role: str = Field(..., min_length=1, max_length=32)


class AdminModerateTutorPayload(BaseModel):
    verified: bool | None = None
    bumped: bool | None = None
    tariffId: str | None = Field(default=None, max_length=32)


class AdminRequestStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


class AdminPayoutStatusPayload(BaseModel):
    status: str = Field(..., min_length=1, max_length=32)


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
            "endpoints": ["/", "/landing", "/brandbook", "/fees", "/admin"],
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


def create_admin_router(settings: Settings) -> APIRouter:
    del settings
    router = APIRouter()

    @router.get("/api/admin/architecture")
    async def admin_architecture(request: Request) -> dict[str, Any]:
        db = request.app.state.db
        storage = db.storage_health() if hasattr(db, "storage_health") else {"ok": True, "mode": "sqlite"}
        return {
            "ok": True,
            "layers": _architecture_layers(),
            "storage": storage,
        }

    @router.get("/api/admin/overview")
    async def admin_overview(request: Request) -> dict[str, Any]:
        return request.app.state.db.admin_overview()

    @router.get("/api/admin/users")
    async def admin_users(request: Request, limit: int = 100) -> dict[str, Any]:
        return {"ok": True, "users": request.app.state.db.admin_list_users(limit=limit)}

    @router.post("/api/admin/users/{user_id}/role")
    async def admin_set_user_role(user_id: int, payload: AdminUserRolePayload, request: Request) -> dict[str, Any]:
        user = request.app.state.db.admin_set_user_role(user_id, payload.role)
        return {"ok": True, "user": user}

    @router.get("/api/admin/tutors")
    async def admin_tutors(request: Request, limit: int = 100) -> dict[str, Any]:
        return {"ok": True, "tutors": request.app.state.db.admin_list_tutors(limit=limit)}

    @router.post("/api/admin/tutors/{tutor_id}/moderate")
    async def admin_moderate_tutor(
        tutor_id: str,
        payload: AdminModerateTutorPayload,
        request: Request,
    ) -> dict[str, Any]:
        tutor = request.app.state.db.admin_moderate_tutor(
            tutor_id,
            verified=payload.verified,
            bumped=payload.bumped,
            tariff_id=payload.tariffId,
        )
        return {"ok": True, "tutor": tutor}

    @router.get("/api/admin/requests")
    async def admin_requests(request: Request, limit: int = 100) -> dict[str, Any]:
        return {"ok": True, "requests": request.app.state.db.admin_list_requests(limit=limit)}

    @router.post("/api/admin/requests/{req_id}/status")
    async def admin_set_request_status(
        req_id: str,
        payload: AdminRequestStatusPayload,
        request: Request,
    ) -> dict[str, Any]:
        req_item = request.app.state.db.admin_set_request_status(req_id, payload.status)
        return {"ok": True, "request": req_item}

    @router.get("/api/admin/payouts")
    async def admin_payouts(request: Request, limit: int = 100) -> dict[str, Any]:
        return {"ok": True, "payouts": request.app.state.db.admin_list_payouts(limit=limit)}

    @router.post("/api/admin/payouts/{payout_id}/status")
    async def admin_set_payout_status(
        payout_id: str,
        payload: AdminPayoutStatusPayload,
        request: Request,
    ) -> dict[str, Any]:
        payout = request.app.state.db.admin_set_payout_status(payout_id, payload.status)
        return {"ok": True, "payout": payout}

    @router.get("/api/admin/outbox")
    async def admin_outbox(request: Request, limit: int = 50) -> dict[str, Any]:
        return {"ok": True, "events": request.app.state.db.admin_list_outbox(limit=limit)}

    return router
