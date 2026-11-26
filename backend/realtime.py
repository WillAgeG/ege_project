"""Realtime-брокер (SSE + WebSocket) для мгновенных обновлений кабинета и маркетплейса."""

from __future__ import annotations

import asyncio
from collections import deque
from dataclasses import dataclass
from datetime import datetime, timezone
import json
import logging
import os
import threading
from typing import Any, AsyncIterator, Callable
import uuid

logger = logging.getLogger("vektor.realtime")


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
    """Потоко- и async-безопасный брокер событий для SSE, WebSocket и мультиворкерного PG LISTEN/NOTIFY."""

    def __init__(
        self,
        *,
        max_ring: int = 200,
        heartbeat_sec: float = 15.0,
        pg_channel: str = "vektor_realtime_events",
        worker_id: str | None = None,
    ) -> None:
        self._lock = threading.RLock()
        self._subscribers: dict[str, _Subscriber] = {}
        self._ring: deque[dict[str, Any]] = deque(maxlen=max_ring)
        self._fallback_seq = 0
        self.heartbeat_sec = heartbeat_sec
        self.pg_channel = str(pg_channel or "vektor_realtime_events").strip() or "vektor_realtime_events"
        self.worker_id = str(worker_id or f"wrk-{os.getpid()}-{uuid.uuid4().hex[:8]}")
        self._pg_listener_stop = threading.Event()
        self._pg_listener_thread: threading.Thread | None = None
        self._pg_listener_connected = False
        self._pg_notifications_sent = 0
        self._pg_notifications_received = 0
        self._pg_listener_error: str | None = None

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    def status(self) -> dict[str, Any]:
        return {
            "workerId": self.worker_id,
            "pgChannel": self.pg_channel,
            "subscribers": self.subscriber_count,
            "pgListenerRunning": bool(
                self._pg_listener_thread is not None and self._pg_listener_thread.is_alive()
            ),
            "pgListenerConnected": bool(self._pg_listener_connected),
            "pgNotificationsSent": int(self._pg_notifications_sent),
            "pgNotificationsReceived": int(self._pg_notifications_received),
            "pgListenerError": self._pg_listener_error,
        }

    def _matches(self, sub: _Subscriber, event: dict[str, Any]) -> bool:
        ev_channel = str(event.get("channel") or "tutor").lower()
        if sub.channel != "all" and ev_channel != "all" and sub.channel != ev_channel:
            return False
        ev_type = str(event.get("eventType") or "").strip().lower()
        if ev_type.startswith(("chat.", "lesson.reminder.", "market.telemost.")):
            return True
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
            ev_type = str(evt.get("eventType") or "").strip().lower()
            if slug and evt.get("tutorSlug") and evt.get("tutorSlug") != slug and not ev_type.startswith(("chat.", "lesson.reminder.")):
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

    def _dispatch_local(self, evt: dict[str, Any]) -> None:
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

    def handle_pg_notification(self, payload_str: str, *, db: Any | None = None) -> bool:
        """Принимает NOTIFY из PostgreSQL и доставляет событие локальным подписчикам (игнорируя свои же)."""
        try:
            msg = json.loads(payload_str or "{}")
        except (json.JSONDecodeError, TypeError, ValueError):
            return False
        if not isinstance(msg, dict):
            return False
        if str(msg.get("workerId") or "") == self.worker_id:
            return False

        evt = msg.get("event")
        if not isinstance(evt, dict) and msg.get("eventId") is not None and db is not None and hasattr(db, "get_realtime_event"):
            try:
                evt = db.get_realtime_event(int(msg["eventId"]))
            except Exception as exc:
                logger.warning("Failed to hydrate PG notify event %s: %s", msg.get("eventId"), exc)
                evt = None
        if not isinstance(evt, dict):
            return False

        self._pg_notifications_received += 1
        self._dispatch_local(evt)
        return True

    def start_pg_listener(self, database_url: str, *, db: Any | None = None) -> None:
        """Запускает фоновый LISTEN-поток в PostgreSQL для синхронизации SSE/WS между воркерами."""
        dsn = str(database_url or "").strip()
        if not dsn:
            return
        if self._pg_listener_thread is not None and self._pg_listener_thread.is_alive():
            return
        self._pg_listener_stop.clear()

        def _worker() -> None:
            import re as _re
            import psycopg

            safe_ch = _re.sub(r"[^A-Za-z0-9_]", "_", self.pg_channel)[:63] or "vektor_realtime_events"
            while not self._pg_listener_stop.is_set():
                conn = None
                try:
                    conn = psycopg.connect(dsn, autocommit=True)
                    conn.execute(f"LISTEN {safe_ch}")
                    self._pg_listener_connected = True
                    self._pg_listener_error = None
                    for notify in conn.notifies(timeout=2.0):
                        if self._pg_listener_stop.is_set():
                            break
                        if notify is not None and getattr(notify, "payload", None):
                            self.handle_pg_notification(str(notify.payload), db=db)
                except Exception as exc:
                    self._pg_listener_connected = False
                    self._pg_listener_error = str(exc)
                    if not self._pg_listener_stop.is_set():
                        logger.warning("PG LISTEN loop reconnecting (%s): %s", safe_ch, exc)
                finally:
                    self._pg_listener_connected = False
                    if conn is not None:
                        try:
                            conn.close()
                        except Exception:
                            pass
                if not self._pg_listener_stop.is_set():
                    self._pg_listener_stop.wait(2.0)

        t = threading.Thread(target=_worker, name="vektor-rt-pg-listen", daemon=True)
        self._pg_listener_thread = t
        t.start()

    def stop_pg_listener(self) -> None:
        self._pg_listener_stop.set()
        t = self._pg_listener_thread
        self._pg_listener_thread = None
        self._pg_listener_connected = False
        if t is not None and t.is_alive():
            t.join(timeout=3.0)

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

        self._dispatch_local(evt)
        if db is not None and hasattr(db, "notify_realtime_event"):
            try:
                wire = json.dumps({"workerId": self.worker_id, "event": evt}, ensure_ascii=False, separators=(",", ":"))
                if len(wire.encode("utf-8")) > 7500:
                    wire = json.dumps(
                        {"workerId": self.worker_id, "eventId": int(evt.get("id") or 0)},
                        ensure_ascii=False,
                        separators=(",", ":"),
                    )
                db.notify_realtime_event(self.pg_channel, wire)
                self._pg_notifications_sent += 1
            except Exception as exc:
                logger.warning("PG NOTIFY failed: %s", exc)
        return evt

    async def sse_stream(
        self,
        db: Any,
        *,
        channel: str = "all",
        tutor_slug: str | None = None,
        since_id: int = 0,
        once: bool = False,
        event_filter: Callable[[dict[str, Any]], bool] | None = None,
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
            if event_filter is not None:
                events = [e for e in events if event_filter(e)]
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
                if event_filter is not None and not event_filter(evt):
                    continue
                eid = int(evt.get("id") or 0)
                if eid <= last_sent_id:
                    continue
                last_sent_id = eid
                yield f"id: {eid}\nevent: message\ndata: {json.dumps(evt, ensure_ascii=False)}\n\n"
        finally:
            self.unsubscribe(sub_id)
