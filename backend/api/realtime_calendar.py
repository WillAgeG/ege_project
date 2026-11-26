"""Headless API роуты Realtime (SSE/WebSocket) и двусторонней синхронизации календаря (.ics / GCal)."""

from __future__ import annotations

import asyncio
import time
from typing import Any, Callable

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
from .auth_docs import current_user, public_base_url, require_tutor, require_user


class RealtimePublishPayload(BaseModel):
    channel: str = Field(default="tutor", max_length=32)
    eventType: str = Field(default="notice", min_length=1, max_length=80)
    title: str = Field(..., min_length=1, max_length=200)
    message: str = Field(default="", max_length=1000)
    tutorSlug: str | None = Field(default=None, max_length=120)
    payload: dict[str, Any] = Field(default_factory=dict)


class CalendarSyncPayload(BaseModel):
    tutorSlug: str = Field(default="anna-sokolova", min_length=1, max_length=120)
    tutorName: str = Field(default="Преподаватель Вектор", max_length=120)
    city: str = Field(default="Якутск", max_length=64)
    timezone: str = Field(default="UTC+9", max_length=64)
    openSlots: dict[str, list[str]] = Field(default_factory=dict)
    lessons: list[dict[str, Any]] = Field(default_factory=list)


class CalendarImportPayload(BaseModel):
    tutorSlug: str = Field(default="anna-sokolova", min_length=1, max_length=120)
    tutorName: str = Field(default="Преподаватель Вектор", max_length=120)
    city: str = Field(default="Якутск", max_length=64)
    timezone: str = Field(default="UTC+9", max_length=64)
    icsText: str = Field(default="", max_length=2_000_000)
    icsUrl: str | None = Field(default=None, max_length=2000)
    openSlots: dict[str, list[str]] = Field(default_factory=dict)
    lessons: list[dict[str, Any]] = Field(default_factory=list)


_PRIVATE_EVENT_PREFIXES = (
    "chat.",
    "lesson.reminder.",
    "market.telemost.",
    "tutor.payout.",
    "market.dispute.",
    "payment.",
    "payments.",
    "refund.",
)


def _is_private_event_type(raw_type: Any) -> bool:
    et = str(raw_type or "").strip().lower()
    return et.startswith(_PRIVATE_EVENT_PREFIXES)


def _is_private_event(evt: dict[str, Any]) -> bool:
    return isinstance(evt, dict) and _is_private_event_type(evt.get("eventType"))


def _assert_calendar_owner(
    db: Any,
    user: Any,
    tutor_slug: str,
    *,
    existing_cal: dict[str, Any] | None = None,
) -> None:
    if str(getattr(user, "role", "") or "").strip().lower() == "admin":
        return
    uid = int(user.id)
    cal = existing_cal if existing_cal is not None else (
        db.get_calendar_by_slug(tutor_slug) if hasattr(db, "get_calendar_by_slug") else None
    )
    if cal and cal.get("userId") is not None and int(cal["userId"]) != uid:
        raise HTTPException(
            status_code=403,
            detail={"code": "forbidden_calendar", "message": "Нет доступа к календарю другого преподавателя."},
        )
    if hasattr(db, "get_tutor"):
        try:
            tutor_row = db.get_tutor(tutor_slug)
        except Exception:
            tutor_row = None
        if tutor_row and tutor_row.get("userId") is not None and int(tutor_row["userId"]) != uid:
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden_calendar", "message": "Нет доступа к календарю другого преподавателя."},
            )


def _make_event_filter(db: Any, user: Any) -> Callable[[dict[str, Any]], bool]:
    owned_cache: list[set[str] | None] = [None]
    cal_owner_cache: dict[str, int | None] = {}

    def _get_owned_tutors() -> set[str]:
        if owned_cache[0] is not None:
            return owned_cache[0]
        if user is None or db is None or not hasattr(db, "list_tutor_ids_for_user"):
            owned_cache[0] = set()
            return owned_cache[0]
        try:
            owned_cache[0] = {str(tid) for tid in db.list_tutor_ids_for_user(int(user.id)) if tid}
        except Exception:
            owned_cache[0] = set()
        return owned_cache[0]

    def _calendar_owner_uid(slug: str) -> int | None:
        if slug in cal_owner_cache:
            return cal_owner_cache[slug]
        if not slug or db is None or not hasattr(db, "get_calendar_by_slug"):
            cal_owner_cache[slug] = None
            return None
        try:
            cal = db.get_calendar_by_slug(slug)
            owner = int(cal["userId"]) if (cal and cal.get("userId") is not None) else None
        except Exception:
            owner = None
        cal_owner_cache[slug] = owner
        return owner

    def _allowed(evt: dict[str, Any]) -> bool:
        if user is None or not isinstance(evt, dict):
            return False
        if str(getattr(user, "role", "") or "").strip().lower() == "admin":
            return True
        uid = int(user.id)
        payload = evt.get("payload") if isinstance(evt.get("payload"), dict) else {}
        containers = [payload]
        for sub_key in ("message", "booking", "dispute", "payout"):
            sub_val = payload.get(sub_key)
            if isinstance(sub_val, dict):
                containers.append(sub_val)
        for container in containers:
            for key in ("studentUserId", "tutorUserId", "senderUserId", "userId", "publisherUserId"):
                val = container.get(key)
                if val is not None:
                    try:
                        if int(val) == uid:
                            return True
                    except (TypeError, ValueError):
                        pass
        owned = _get_owned_tutors()
        tutor_candidates: list[str] = []
        for cand in (evt.get("tutorSlug"), payload.get("tutorId")):
            if cand:
                tutor_candidates.append(str(cand))
        for container in containers[1:]:
            if container.get("tutorId"):
                tutor_candidates.append(str(container["tutorId"]))
        for cand in tutor_candidates:
            if owned and cand in owned:
                return True
            if _calendar_owner_uid(cand) == uid:
                return True
        return False

    return _allowed


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
        user = require_user(request, settings)
        allow_evt = _make_event_filter(request.app.state.db, user)
        safe_limit = max(1, min(int(limit or 30), 200))
        fetch_limit = safe_limit if int(since_id or 0) > 0 else min(200, max(safe_limit * 3, 60))
        raw_events = request.app.state.realtime.recent(
            request.app.state.db,
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=fetch_limit,
        )
        filtered = [e for e in raw_events if allow_evt(e)]
        events = filtered[:safe_limit] if int(since_id or 0) > 0 else filtered[-safe_limit:]
        latest_id = int(events[-1]["id"]) if events else max(0, int(since_id or 0))
        return {"ok": True, "events": events, "latestId": latest_id}

    @router.post("/api/realtime/publish")
    async def realtime_publish(payload: RealtimePublishPayload, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"rt_pub:{int(user.id)}", 60, 60)
        is_admin = str(getattr(user, "role", "") or "").strip().lower() == "admin"
        if not is_admin and _is_private_event_type(payload.eventType):
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "forbidden_event_type",
                    "message": "Приватные события публикуются только сервером.",
                },
            )
        ev_lower = str(payload.eventType or "").strip().lower()
        if payload.tutorSlug and ev_lower.startswith(("calendar.", "tutor.")):
            _assert_calendar_owner(request.app.state.db, user, payload.tutorSlug)
        evt_payload = dict(payload.payload or {})
        evt_payload["publisherUserId"] = int(user.id)
        evt = request.app.state.realtime.publish(
            request.app.state.db,
            channel=payload.channel,
            event_type=payload.eventType,
            title=payload.title,
            message=payload.message,
            tutor_slug=payload.tutorSlug,
            payload=evt_payload,
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
        user = require_user(request, settings)
        allow_evt = _make_event_filter(request.app.state.db, user)
        return StreamingResponse(
            request.app.state.realtime.sse_stream(
                request.app.state.db,
                channel=channel,
                tutor_slug=tutor_slug,
                since_id=effective_since,
                once=bool(once),
                event_filter=allow_evt,
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

        raw_token = websocket.cookies.get(settings.session_cookie)
        ws_user = websocket.app.state.db.get_user_by_token(raw_token) if raw_token else None
        if ws_user is None:
            await websocket.close(code=4401)
            return
        is_ws_admin = str(getattr(ws_user, "role", "") or "").strip().lower() == "admin"
        allow_evt = _make_event_filter(websocket.app.state.db, ws_user)

        await websocket.accept()
        send_lock = asyncio.Lock()

        async def send_json_safe(data: dict[str, Any]) -> None:
            async with send_lock:
                await websocket.send_json(data)

        sub_id, queue = websocket.app.state.realtime.subscribe(channel=channel, tutor_slug=tutor_slug)
        raw_recent = websocket.app.state.realtime.recent(
            websocket.app.state.db,
            channel=channel,
            tutor_slug=tutor_slug,
            since_id=since_id,
            limit=30,
        )
        recent = [e for e in raw_recent if allow_evt(e)]
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
                if not allow_evt(evt):
                    continue
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
                    ev_type = str(msg.get("eventType") or "ws.message")
                    if not is_ws_admin and _is_private_event_type(ev_type):
                        continue
                    limiter = getattr(websocket.app.state, "limiter", None)
                    if limiter is not None:
                        try:
                            limiter.check(f"rt_pub:{int(ws_user.id)}", 60, 60)
                        except HTTPException:
                            continue
                    target_slug = msg.get("tutorSlug") or tutor_slug
                    if target_slug and ev_type.strip().lower().startswith(("calendar.", "tutor.")):
                        try:
                            _assert_calendar_owner(websocket.app.state.db, ws_user, str(target_slug))
                        except HTTPException:
                            continue
                    msg_payload = dict(msg.get("payload") if isinstance(msg.get("payload"), dict) else {})
                    msg_payload["publisherUserId"] = int(ws_user.id)
                    websocket.app.state.realtime.publish(
                        websocket.app.state.db,
                        channel=str(msg.get("channel") or (channel if channel != "all" else "tutor")),
                        event_type=ev_type,
                        title=str(msg.get("title") or "Обновление"),
                        message=str(msg.get("message") or ""),
                        tutor_slug=target_slug,
                        payload=msg_payload,
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
        user = require_tutor(request, settings)
        cal_state = request.app.state.db.get_calendar_by_slug(tutor_slug)
        _assert_calendar_owner(request.app.state.db, user, tutor_slug, existing_cal=cal_state)
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
        user = require_tutor(request, settings)
        _assert_calendar_owner(request.app.state.db, user, payload.tutorSlug)
        tz_code, iana_name, _, _ = resolve_timezone_info(payload.timezone, payload.city)
        events = normalize_lessons_to_events(
            payload.lessons,
            tutor_slug=payload.tutorSlug,
            timezone_str=tz_code,
            city=payload.city,
        )
        cal_state = request.app.state.db.upsert_calendar_sync(
            tutor_slug=payload.tutorSlug,
            user_id=user.id,
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
        user = require_tutor(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"cal_import:{int(user.id)}", 15, 300)
        _assert_calendar_owner(request.app.state.db, user, payload.tutorSlug)
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
            user_id=user.id,
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
                "userId": int(user.id),
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
