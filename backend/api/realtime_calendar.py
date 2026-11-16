"""Headless API роуты Realtime (SSE/WebSocket) и двусторонней синхронизации календаря (.ics / GCal)."""

from __future__ import annotations

import asyncio
import time
from typing import Any

from fastapi import APIRouter, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
import httpx
from pydantic import BaseModel, Field

from ..calendar_sync import (
    build_google_calendar_urls,
    detect_busy_conflicts,
    generate_ics,
    normalize_lessons_to_events,
    parse_ics_busy_slots,
    resolve_timezone_info,
    validate_public_ics_url,
)
from ..config import Settings
from .auth_docs import current_user, public_base_url


class RealtimePublishPayload(BaseModel):
    channel: str = Field(default="tutor", max_length=32)
    eventType: str = Field(default="notice", min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(default="", max_length=1000)
    tutorSlug: str | None = Field(default=None, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)


class CalendarSyncPayload(BaseModel):
    tutorSlug: str = Field(default="anna-sokolova", min_length=1, max_length=120)
    tutorName: str = Field(default="Преподаватель Вектор ЕГЭ", max_length=120)
    city: str = Field(default="Якутск", max_length=64)
    timezone: str = Field(default="UTC+9", max_length=64)
    openSlots: dict[str, list[str]] = Field(default_factory=dict)
    lessons: list[dict[str, Any]] = Field(default_factory=list)


class CalendarImportPayload(BaseModel):
    tutorSlug: str = Field(default="anna-sokolova", min_length=1, max_length=120)
    tutorName: str = Field(default="Преподаватель Вектор ЕГЭ", max_length=120)
    city: str = Field(default="Якутск", max_length=64)
    timezone: str = Field(default="UTC+9", max_length=64)
    icsText: str = Field(default="", max_length=2_000_000)
    icsUrl: str | None = Field(default=None, max_length=2000)
    openSlots: dict[str, list[str]] = Field(default_factory=dict)
    lessons: list[dict[str, Any]] = Field(default_factory=list)


def create_realtime_calendar_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/realtime/recent")
    async def realtime_recent(
        request: Request,
        channel: str = "all",
        tutor_slug: str | None = None,
        since_id: int = 0,
        limit: int = 30,
    ) -> dict[str, Any]:
        events = request.app.state.realtime.recent(
            request.app.state.db,
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=limit,
        )
        latest_id = int(events[-1]["id"]) if events else max(0, int(since_id or 0))
        return {"ok": True, "events": events, "latestId": latest_id}

    @router.post("/api/realtime/publish")
    async def realtime_publish(payload: RealtimePublishPayload, request: Request) -> dict[str, Any]:
        evt = request.app.state.realtime.publish(
            request.app.state.db,
            channel=payload.channel,
            event_type=payload.eventType,
            title=payload.title,
            message=payload.message,
            tutor_slug=payload.tutorSlug,
            payload=payload.payload,
        )
        return {"ok": True, "event": evt}

    @router.get("/api/realtime/stream")
    async def realtime_stream(
        request: Request,
        channel: str = "all",
        tutor_slug: str | None = None,
        since_id: int = 0,
        once: int = 0,
    ) -> StreamingResponse:
        effective_since = max(0, int(since_id or 0))
        last_event_id = (request.headers.get("last-event-id") or "").strip()
        if last_event_id:
            try:
                effective_since = max(effective_since, int(last_event_id))
            except ValueError:
                pass
        return StreamingResponse(
            request.app.state.realtime.sse_stream(
                request.app.state.db,
                channel=channel,
                tutor_slug=tutor_slug,
                since_id=effective_since,
                once=bool(once),
            ),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    @router.websocket("/api/realtime/ws")
    async def realtime_ws(websocket: WebSocket) -> None:
        channel = websocket.query_params.get("channel", "all")
        tutor_slug = websocket.query_params.get("tutor_slug") or None
        try:
            since_id = max(0, int(websocket.query_params.get("since_id") or 0))
        except ValueError:
            since_id = 0

        await websocket.accept()
        send_lock = asyncio.Lock()

        async def send_json_safe(data: dict[str, Any]) -> None:
            async with send_lock:
                await websocket.send_json(data)

        sub_id, queue = websocket.app.state.realtime.subscribe(channel=channel, tutor_slug=tutor_slug)
        recent = websocket.app.state.realtime.recent(
            websocket.app.state.db,
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=30,
        )
        latest_id = int(recent[-1]["id"]) if recent else since_id
        await send_json_safe(
            {
                "type": "connected",
                "transport": "ws",
                "channel": channel or "all",
                "tutorSlug": tutor_slug,
                "latestId": latest_id,
                "events": recent,
            }
        )

        async def pump_events() -> None:
            last_sent = latest_id
            while True:
                evt = await queue.get()
                eid = int(evt.get("id") or 0)
                if eid <= last_sent:
                    continue
                last_sent = eid
                await send_json_safe({"type": "event", "event": evt})

        sender_task = asyncio.create_task(pump_events())
        try:
            while True:
                msg = await websocket.receive_json()
                if not isinstance(msg, dict):
                    continue
                msg_type = str(msg.get("type") or "").strip().lower()
                if msg_type == "ping":
                    await send_json_safe({"type": "pong", "ts": int(time.time())})
                elif msg_type == "publish":
                    websocket.app.state.realtime.publish(
                        websocket.app.state.db,
                        channel=str(msg.get("channel") or (channel if channel != "all" else "tutor")),
                        event_type=str(msg.get("eventType") or "ws.message"),
                        title=str(msg.get("title") or "Обновление"),
                        message=str(msg.get("message") or ""),
                        tutor_slug=msg.get("tutorSlug") or tutor_slug,
                        payload=msg.get("payload") if isinstance(msg.get("payload"), dict) else {},
                    )
        except WebSocketDisconnect:
            pass
        finally:
            sender_task.cancel()
            try:
                await sender_task
            except asyncio.CancelledError:
                pass
            websocket.app.state.realtime.unsubscribe(sub_id)

    @router.get("/api/calendar/state")
    async def calendar_state(request: Request, tutor_slug: str = "anna-sokolova") -> dict[str, Any]:
        cal_state = request.app.state.db.get_calendar_by_slug(tutor_slug)
        if not cal_state:
            return {
                "ok": True,
                "synced": False,
                "tutorSlug": tutor_slug,
                "timezone": "UTC+9",
                "ianaTimezone": "Asia/Yakutsk",
                "openSlots": {},
                "busySlots": [],
                "events": [],
            }
        tz_code, iana_name, _, _ = resolve_timezone_info(cal_state.get("timezone"), cal_state.get("city"))
        urls = build_google_calendar_urls(
            base_url=public_base_url(request, settings),
            feed_token=cal_state["feedToken"],
            cal_state=cal_state,
        )
        return {
            "ok": True,
            "synced": True,
            **cal_state,
            "timezone": tz_code,
            "ianaTimezone": iana_name,
            **urls,
        }

    @router.put("/api/calendar/sync")
    async def calendar_sync(payload: CalendarSyncPayload, request: Request) -> dict[str, Any]:
        user = current_user(request, settings)
        tz_code, iana_name, _, _ = resolve_timezone_info(payload.timezone, payload.city)
        events = normalize_lessons_to_events(
            payload.lessons,
            tutor_slug=payload.tutorSlug,
            timezone_str=tz_code,
            city=payload.city,
        )
        cal_state = request.app.state.db.upsert_calendar_sync(
            tutor_slug=payload.tutorSlug,
            user_id=user.id if user else None,
            tutor_name=payload.tutorName,
            city=payload.city,
            timezone=tz_code,
            open_slots=payload.openSlots,
            events=events,
        )
        urls = build_google_calendar_urls(
            base_url=public_base_url(request, settings),
            feed_token=cal_state["feedToken"],
            cal_state=cal_state,
        )
        return {
            "ok": True,
            "feedToken": cal_state["feedToken"],
            "tutorSlug": cal_state["tutorSlug"],
            "timezone": tz_code,
            "ianaTimezone": iana_name,
            "eventCount": len(cal_state.get("events") or []),
            "busySlots": cal_state.get("busySlots") or [],
            **urls,
        }

    @router.get("/api/calendar/{feed_token}.ics")
    async def calendar_ics_feed(feed_token: str, request: Request) -> Response:
        cal_state = request.app.state.db.get_calendar_by_token(feed_token)
        if not cal_state:
            raise HTTPException(
                status_code=404,
                detail={"code": "calendar_not_found", "message": "Календарь не найден."},
            )
        ics_body = generate_ics(cal_state)
        return Response(
            content=ics_body,
            media_type="text/calendar; charset=utf-8",
            headers={
                "Content-Disposition": f'inline; filename="{cal_state["tutorSlug"]}.ics"',
                "Cache-Control": "no-cache",
            },
        )

    @router.post("/api/calendar/import-ics")
    async def calendar_import_ics(payload: CalendarImportPayload, request: Request) -> dict[str, Any]:
        user = current_user(request, settings)
        tz_code, iana_name, _, _ = resolve_timezone_info(payload.timezone, payload.city)
        ics_text = (payload.icsText or "").strip()
        external_url = (payload.icsUrl or "").strip() or None

        if not ics_text and external_url:
            try:
                safe_url = validate_public_ics_url(external_url)
            except ValueError as exc:
                raise HTTPException(
                    status_code=400,
                    detail={"code": "invalid_ics_url", "message": str(exc)},
                ) from exc
            try:
                resp = await request.app.state.http.get(safe_url, follow_redirects=False)
            except httpx.HTTPError as exc:
                raise HTTPException(
                    status_code=502,
                    detail={"code": "ics_fetch_failed", "message": f"Не удалось загрузить .ics: {exc}"},
                ) from exc
            if resp.status_code != 200:
                raise HTTPException(
                    status_code=502,
                    detail={"code": "ics_fetch_failed", "message": f"Удалённый сервер вернул HTTP {resp.status_code}."},
                )
            ics_text = resp.text[:2_000_000].strip()

        if not ics_text:
            raise HTTPException(
                status_code=400,
                detail={"code": "empty_ics", "message": "Передайте .ics текст или публичную https:// ссылку."},
            )

        busy_slots = parse_ics_busy_slots(ics_text, target_timezone=tz_code)
        if payload.lessons:
            events_to_save: list[dict[str, Any]] | None = normalize_lessons_to_events(
                payload.lessons,
                tutor_slug=payload.tutorSlug,
                timezone_str=tz_code,
                city=payload.city,
            )
            events_for_conflicts = events_to_save
        else:
            existing = request.app.state.db.get_calendar_by_slug(payload.tutorSlug)
            events_to_save = None
            events_for_conflicts = (existing or {}).get("events") or []

        conflicts = detect_busy_conflicts(events_for_conflicts, busy_slots)
        cal_state = request.app.state.db.upsert_calendar_sync(
            tutor_slug=payload.tutorSlug,
            user_id=user.id if user else None,
            tutor_name=payload.tutorName,
            city=payload.city,
            timezone=tz_code,
            open_slots=payload.openSlots or None,
            events=events_to_save,
            external_ics_url=external_url,
            gcal_connected=True,
            busy_slots=busy_slots,
        )
        urls = build_google_calendar_urls(
            base_url=public_base_url(request, settings),
            feed_token=cal_state["feedToken"],
            cal_state=cal_state,
        )
        request.app.state.realtime.publish(
            request.app.state.db,
            channel="tutor",
            event_type="calendar.synced",
            title="Календарь синхронизирован",
            message=f"Импортировано слотов: {len(busy_slots)} ({tz_code})",
            tutor_slug=payload.tutorSlug,
            payload={
                "timezone": tz_code,
                "ianaTimezone": iana_name,
                "importedCount": len(busy_slots),
                "conflictsCount": len(conflicts),
            },
        )
        return {
            "ok": True,
            "importedCount": len(busy_slots),
            "busySlots": busy_slots,
            "conflicts": conflicts,
            "feedToken": cal_state["feedToken"],
            "timezone": tz_code,
            "ianaTimezone": iana_name,
            **urls,
        }

    return router
