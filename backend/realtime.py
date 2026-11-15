"""Realtime-брокер (SSE + WebSocket) для мгновенных обновлений кабинета и маркетплейса."""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import threading
from typing import Any, AsyncIterator
import uuid


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_channel(raw: str | None) -> str:
    val = (raw or "tutor").strip().lower()
    if val in {"tutor", "student", "all"}:
        return val
    return "tutor"


def _normalize_slug(raw: str | None) -> str | None:
    val = (raw or "").strip()
    return val or None


@dataclass
class _Subscriber:
    sub_id: str
    channel: str
    tutor_slug: str | None
    queue: asyncio.Queue[dict[str, Any]]
    loop: asyncio.AbstractEventLoop


class RealtimeBroker:
    """Потоко- и async-безопасный брокер событий для SSE и WebSocket."""

    def __init__(self, *, max_ring: int = 200, heartbeat_sec: float = 15.0) -> None:
        self._lock = threading.RLock()
        self._subscribers: dict[str, _Subscriber] = {}
        self._ring: deque[dict[str, Any]] = deque(maxlen=max_ring)
        self._fallback_seq = 0
        self.heartbeat_sec = heartbeat_sec

    def _matches(self, sub: _Subscriber, event: dict[str, Any]) -> bool:
        ev_channel = str(event.get("channel") or "tutor").lower()
        if sub.channel != "all" and ev_channel != "all" and sub.channel != ev_channel:
            return False
        if sub.tutor_slug:
            ev_slug = event.get("tutorSlug")
            if ev_slug and ev_slug != sub.tutor_slug:
                return False
        return True

    @staticmethod
    def _enqueue(queue: asyncio.Queue[dict[str, Any]], event: dict[str, Any]) -> None:
        if queue.full():
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
        try:
            queue.put_nowait(event)
        except asyncio.QueueFull:
            pass

    def subscribe(
        self,
        *,
        channel: str = "all",
        tutor_slug: str | None = None,
        maxsize: int = 128,
    ) -> tuple[str, asyncio.Queue[dict[str, Any]]]:
        sub_id = uuid.uuid4().hex
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=maxsize)
        sub = _Subscriber(
            sub_id=sub_id,
            channel=_normalize_channel(channel),
            tutor_slug=_normalize_slug(tutor_slug),
            queue=queue,
            loop=loop,
        )
        with self._lock:
            self._subscribers[sub_id] = sub
        return sub_id, queue

    def unsubscribe(self, sub_id: str) -> None:
        with self._lock:
            self._subscribers.pop(sub_id, None)

    def _record_fallback(
        self,
        *,
        event_id: str,
        channel: str,
        event_type: str,
        title: str,
        message: str,
        tutor_slug: str | None,
        payload: dict[str, Any],
    ) -> dict[str, Any]:
        with self._lock:
            self._fallback_seq += 1
            evt = {
                "id": self._fallback_seq,
                "eventId": event_id,
                "channel": channel,
                "eventType": event_type,
                "title": title,
                "message": message,
                "tutorSlug": tutor_slug,
                "payload": payload,
                "createdAt": _utc_now_iso(),
            }
            self._ring.append(evt)
            return evt

    def _recent_fallback(
        self,
        *,
        channel: str | None,
        tutor_slug: str | None,
        since_id: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        ch = _normalize_channel(channel) if channel else "all"
        slug = _normalize_slug(tutor_slug)
        with self._lock:
            items = list(self._ring)
        filtered = []
        for evt in items:
            if int(evt.get("id") or 0) <= since_id:
                continue
            ev_ch = str(evt.get("channel") or "tutor").lower()
            if ch != "all" and ev_ch != "all" and ev_ch != ch:
                continue
            if slug and evt.get("tutorSlug") and evt.get("tutorSlug") != slug:
                continue
            filtered.append(evt)
        if since_id > 0:
            return filtered[:limit]
        return filtered[-limit:] if limit > 0 else filtered

    def recent(
        self,
        db: Any,
        *,
        channel: str | None = None,
        tutor_slug: str | None = None,
        since_id: int = 0,
        limit: int = 30,
    ) -> list[dict[str, Any]]:
        norm_ch = _normalize_channel(channel) if channel else "all"
        query_ch = None if norm_ch == "all" else norm_ch
        norm_slug = _normalize_slug(tutor_slug)
        safe_limit = max(1, min(int(limit or 30), 200))
        safe_since = max(0, int(since_id or 0))
        if db is not None and hasattr(db, "list_realtime_events"):
            return db.list_realtime_events(
                channel=query_ch,
                tutor_slug=norm_slug,
                since_id=safe_since,
                limit=safe_limit,
            )
        return self._recent_fallback(
            channel=norm_ch,
            tutor_slug=norm_slug,
            since_id=safe_since,
            limit=safe_limit,
        )

    def publish(
        self,
        db: Any,
        *,
        channel: str = "tutor",
        event_type: str,
        title: str,
        message: str = "",
        tutor_slug: str | None = None,
        payload: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        norm_ch = _normalize_channel(channel)
        if norm_ch == "all":
            norm_ch = "tutor"
        norm_slug = _normalize_slug(tutor_slug)
        clean_payload = dict(payload) if isinstance(payload, dict) else {}
        event_id = f"evt-{uuid.uuid4().hex[:16]}"
        clean_type = (event_type or "notice").strip()[:80] or "notice"
        clean_title = (title or "Обновление").strip()[:200] or "Обновление"
        clean_msg = (message or "").strip()[:1000]

        if db is not None and hasattr(db, "record_realtime_event"):
            evt = db.record_realtime_event(
                event_id=event_id,
                channel=norm_ch,
                event_type=clean_type,
                title=clean_title,
                message=clean_msg,
                tutor_slug=norm_slug,
                payload=clean_payload,
            )
        else:
            evt = self._record_fallback(
                event_id=event_id,
                channel=norm_ch,
                event_type=clean_type,
                title=clean_title,
                message=clean_msg,
                tutor_slug=norm_slug,
                payload=clean_payload,
            )

        with self._lock:
            subs = list(self._subscribers.values())
        for sub in subs:
            if not self._matches(sub, evt):
                continue
            try:
                running_loop = asyncio.get_running_loop()
            except RuntimeError:
                running_loop = None
            if running_loop is sub.loop:
                self._enqueue(sub.queue, evt)
            else:
                try:
                    sub.loop.call_soon_threadsafe(self._enqueue, sub.queue, evt)
                except RuntimeError:
                    pass
        return evt

    async def sse_stream(
        self,
        db: Any,
        *,
        channel: str = "all",
        tutor_slug: str | None = None,
        since_id: int = 0,
        once: bool = False,
    ) -> AsyncIterator[str]:
        norm_ch = _normalize_channel(channel)
        norm_slug = _normalize_slug(tutor_slug)
        safe_since = max(0, int(since_id or 0))
        sub_id, queue = self.subscribe(channel=norm_ch, tutor_slug=norm_slug)
        try:
            events = self.recent(
                db,
                channel=norm_ch,
                tutor_slug=norm_slug,
                since_id=safe_since,
                limit=50,
            )
            latest_id = int(events[-1]["id"]) if events else safe_since
            connected_payload = {
                "transport": "sse",
                "channel": norm_ch,
                "tutorSlug": norm_slug,
                "latestId": latest_id,
                "events": events,
            }
            yield f"event: connected\ndata: {json.dumps(connected_payload, ensure_ascii=False)}\n\n"

            last_sent_id = safe_since
            if safe_since > 0:
                for evt in events:
                    eid = int(evt.get("id") or 0)
                    if eid > last_sent_id:
                        last_sent_id = eid
                        yield f"id: {eid}\nevent: message\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"
            else:
                last_sent_id = max(last_sent_id, latest_id)

            if once:
                return

            while True:
                try:
                    evt = await asyncio.wait_for(queue.get(), timeout=self.heartbeat_sec)
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
                    continue
                eid = int(evt.get("id") or 0)
                if eid <= last_sent_id:
                    continue
                last_sent_id = eid
                yield f"id: {eid}\nevent: message\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"
        finally:
            self.unsubscribe(sub_id)
