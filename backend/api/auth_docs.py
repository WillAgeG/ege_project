"""Headless API роуты здоровья, аутентификации, документов и ИИ-прокси."""

from __future__ import annotations

import base64
from collections import deque
import hashlib
import hmac
import ipaddress
import json
import re
import secrets
import threading
import time
from typing import Any, Callable
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, Body, HTTPException, Request, Response
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
import httpx
from pydantic import BaseModel, Field

from ..ai import AIError, complete_ai_json, stream_ai_text
from ..config import Settings
from ..otp_delivery import OtpDeliveryService
from databases.sqlite.store import User, hash_token


class RateLimiter:
    """Ограничение частоты запросов (sliding-window в БД при наличии store либо fallback в памяти)."""

    def __init__(self, db_getter: Callable[[], Any] | None = None) -> None:
        self._db_getter = db_getter
        self._hits: dict[str, deque[float]] = {}
        self._lock = threading.Lock()

    def _db(self) -> Any | None:
        if self._db_getter is None:
            return None
        try:
            db = self._db_getter()
        except Exception:
            return None
        return db if (db is not None and hasattr(db, "check_rate_limit")) else None

    @property
    def backend_name(self) -> str:
        return "database" if self._db() is not None else "memory"

    def check(self, key: str, limit: int, window_sec: int) -> None:
        db = self._db()
        if db is not None:
            allowed, _ = db.check_rate_limit(key, limit, window_sec)
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "Слишком много запросов. Подожди немного."},
                )
            return

        now = time.time()
        cutoff = now - window_sec
        with self._lock:
            if len(self._hits) > 2048:
                stale_keys: list[str] = []
                for k, dq in self._hits.items():
                    while dq and dq[0] <= cutoff:
                        dq.popleft()
                    if not dq:
                        stale_keys.append(k)
                for k in stale_keys:
                    self._hits.pop(k, None)
            q = self._hits.get(key)
            if q is not None:
                while q and q[0] <= cutoff:
                    q.popleft()
                if not q:
                    self._hits.pop(key, None)
                    q = None
            if q is None:
                q = deque()
                self._hits[key] = q
            if len(q) >= limit:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "rate_limited", "message": "Слишком много запросов. Подожди немного."},
                )
            q.append(now)


class AuthPayload(BaseModel):
    username: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)
    email: str = Field(default="", max_length=254)
    displayName: str = Field(default="", max_length=64)
    inviteCode: str = Field(default="", max_length=128)
    role: str = Field(default="student", max_length=16)


class PhoneOtpSendPayload(BaseModel):
    phone: str = Field(..., min_length=1, max_length=36)
    country: str = Field(default="RU", max_length=12)
    channel: str = Field(default="wa", max_length=16)
    mode: str = Field(default="login", max_length=16)
    inviteCode: str = Field(default="", max_length=128)
    resend: bool = Field(default=False)


class PhoneOtpVerifyPayload(BaseModel):
    phone: str = Field(..., min_length=1, max_length=36)
    country: str = Field(default="RU", max_length=12)
    channel: str = Field(default="wa", max_length=16)
    code: str = Field(..., min_length=4, max_length=8)
    role: str = Field(default="student", max_length=16)
    inviteCode: str = Field(default="", max_length=128)
    authProvider: str = Field(default="phone", max_length=24)
    displayName: str = Field(default="", max_length=64)


class PhoneOtpStore:
    """Потокобезопасное хранилище 4-значных кодов подтверждения для WhatsApp и Telegram (БД или память)."""

    def __init__(
        self,
        ttl_sec: int = 600,
        max_attempts: int = 5,
        db_getter: Callable[[], Any] | None = None,
    ) -> None:
        self._ttl_sec = ttl_sec
        self._max_attempts = max_attempts
        self._db_getter = db_getter
        self._records: dict[str, dict[str, Any]] = {}
        self._lock = threading.Lock()

    def _db(self) -> Any | None:
        if self._db_getter is None:
            return None
        try:
            db = self._db_getter()
        except Exception:
            return None
        needed = ("get_phone_otp", "upsert_phone_otp", "verify_and_consume_phone_otp")
        return db if (db is not None and all(hasattr(db, m) for m in needed)) else None

    @property
    def backend_name(self) -> str:
        return "database" if self._db() is not None else "memory"

    @staticmethod
    def _otp_hash(digits: str, code: str) -> str:
        return hash_token(f"otp:{digits}:{code}")

    def _prune_locked(self, now: float) -> None:
        if len(self._records) <= 2048:
            return
        expired = [k for k, v in self._records.items() if float(v.get("expires_at", 0)) <= now]
        for k in expired:
            self._records.pop(k, None)

    def send(
        self,
        digits: str,
        channel: str,
        *,
        mode: str = "login",
        resend: bool = False,
        invite_ok: bool = False,
        dev_demo_mode: bool = True,
    ) -> str:
        db = self._db()
        if db is not None:
            prev = db.get_phone_otp(digits)
            if dev_demo_mode:
                if resend and prev and hmac.compare_digest(str(prev.get("codeHash") or ""), self._otp_hash(digits, "4829")):
                    code = "7391"
                else:
                    code = "4829"
            else:
                prev_hash = str(prev.get("codeHash") or "") if resend and prev else ""
                while True:
                    code = f"{secrets.randbelow(10000):04d}"
                    if code not in ("4829", "7391"):
                        if not prev_hash or not hmac.compare_digest(self._otp_hash(digits, code), prev_hash):
                            break
            db.upsert_phone_otp(
                digits,
                code_hash=self._otp_hash(digits, code),
                channel=channel,
                mode=mode,
                invite_ok=invite_ok,
                ttl_sec=self._ttl_sec,
            )
            return code

        now = time.time()
        with self._lock:
            self._prune_locked(now)
            prev = self._records.get(digits)
            if dev_demo_mode:
                if resend and prev and prev.get("code") == "4829":
                    code = "7391"
                else:
                    code = "4829"
            else:
                prev_code = str(prev.get("code") or "") if resend and prev else ""
                while True:
                    code = f"{secrets.randbelow(10000):04d}"
                    if code not in ("4829", "7391") and code != prev_code:
                        break
            self._records[digits] = {
                "code": code,
                "channel": channel,
                "mode": mode,
                "invite_ok": invite_ok,
                "attempts": 0,
                "expires_at": now + self._ttl_sec,
            }
            return code

    def verify(
        self,
        digits: str,
        code: str,
        *,
        server_invite: str = "",
        invite_code: str = "",
    ) -> dict[str, Any]:
        clean_code = re.sub(r"\D+", "", str(code or ""))
        db = self._db()
        if db is not None:
            cand_hash = self._otp_hash(digits, clean_code) if len(clean_code) == 4 else ""
            status, rec = db.verify_and_consume_phone_otp(
                digits,
                cand_hash,
                max_attempts=self._max_attempts,
                server_invite=server_invite,
                invite_code=invite_code,
            )
            if status == "expired":
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "otp_expired",
                        "message": "Сначала запроси 4-значный код в WhatsApp или Telegram.",
                    },
                )
            if status == "max_attempts":
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "otp_attempts",
                        "message": "Слишком много неверных попыток. Запроси новый код.",
                    },
                )
            if status == "invalid_invite":
                raise HTTPException(
                    status_code=403,
                    detail={"code": "invalid_invite", "message": "Неверный код приглашения."},
                )
            if status != "ok" or not rec:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "invalid_code",
                        "message": "Неверный код подтверждения. Проверьте сообщение в WhatsApp или Telegram.",
                    },
                )
            return rec

        now = time.time()
        with self._lock:
            rec = self._records.get(digits)
            if not rec or float(rec.get("expires_at", 0)) <= now:
                self._records.pop(digits, None)
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "otp_expired",
                        "message": "Сначала запроси 4-значный код в WhatsApp или Telegram.",
                    },
                )
            rec["attempts"] = int(rec.get("attempts", 0)) + 1
            if rec["attempts"] > self._max_attempts:
                self._records.pop(digits, None)
                raise HTTPException(
                    status_code=429,
                    detail={
                        "code": "otp_attempts",
                        "message": "Слишком много неверных попыток. Запроси новый код.",
                    },
                )
            if len(clean_code) != 4 or not hmac.compare_digest(clean_code, str(rec["code"])):
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "invalid_code",
                        "message": "Неверный код подтверждения. Проверьте сообщение в WhatsApp или Telegram.",
                    },
                )
            if server_invite and rec.get("mode") == "register" and not rec.get("invite_ok"):
                if not hmac.compare_digest((invite_code or "").strip(), server_invite):
                    raise HTTPException(
                        status_code=403,
                        detail={"code": "invalid_invite", "message": "Неверный код приглашения."},
                    )
            self._records.pop(digits, None)
            return dict(rec)


def _normalize_phone_digits(raw_phone: str, country: str = "RU") -> str:
    digits = re.sub(r"\D+", "", str(raw_phone or ""))
    c = (country or "RU").strip().upper()
    if c == "RU" and len(digits) == 11 and digits.startswith("8"):
        digits = "7" + digits[1:]
    return digits


def _normalize_otp_channel(raw_channel: str) -> str:
    ch = (raw_channel or "wa").strip().lower()
    if ch in ("tg", "telegram"):
        return "tg"
    if ch in ("sms", "phone"):
        return "sms"
    return "wa"


def _otp_channel_name(channel: str) -> str:
    if channel == "tg":
        return "Telegram"
    if channel == "sms":
        return "SMS"
    return "WhatsApp"


class AIRequestPayload(BaseModel):
    mode: str = Field(default="text")
    messages: str | list[dict[str, Any]]
    modelTier: str | None = Field(default=None)


_DEFAULT_TRUSTED_PROXIES = (
    "127.0.0.1/32",
    "::1/128",
    "10.0.0.0/8",
    "172.16.0.0/12",
    "192.168.0.0/16",
)


def _normalize_ip_literal(raw: str | None) -> str | None:
    candidate = str(raw or "").strip().split("%", 1)[0]
    if not candidate:
        return None
    if candidate.startswith("[") and "]" in candidate:
        candidate = candidate[1:candidate.index("]")]
    elif candidate.count(":") == 1 and "." in candidate:
        candidate = candidate.split(":", 1)[0]
    try:
        return str(ipaddress.ip_address(candidate))
    except ValueError:
        return None


def _trusted_proxy_networks(settings: Settings | None = None) -> list[ipaddress._BaseNetwork]:
    raw_items = getattr(settings, "trusted_proxy_ips", None) or _DEFAULT_TRUSTED_PROXIES
    nets: list[ipaddress._BaseNetwork] = []
    for item in raw_items:
        txt = str(item or "").strip()
        if not txt or txt == "testclient":
            continue
        try:
            nets.append(ipaddress.ip_network(txt, strict=False))
        except ValueError:
            continue
    return nets


def is_trusted_proxy_peer(peer_host: str | None, settings: Settings | None = None) -> bool:
    peer = str(peer_host or "").strip()
    if not peer:
        return False
    if peer == "testclient":
        return True
    norm = _normalize_ip_literal(peer)
    if not norm:
        return False
    addr = ipaddress.ip_address(norm)
    return any(addr in net for net in _trusted_proxy_networks(settings))


def _resolve_request_settings(request: Request, settings: Settings | None = None) -> Settings | None:
    if settings is not None:
        return settings
    app_obj = getattr(request, "app", None)
    state_obj = getattr(app_obj, "state", None)
    return getattr(state_obj, "settings", None)


def client_ip(request: Request, settings: Settings | None = None) -> str:
    eff_settings = _resolve_request_settings(request, settings)
    peer_raw = (request.client.host if request.client else "") or "unknown"
    if not is_trusted_proxy_peer(peer_raw, eff_settings):
        return _normalize_ip_literal(peer_raw) or peer_raw

    xff = request.headers.get("x-forwarded-for", "")
    if xff:
        nets = _trusted_proxy_networks(eff_settings)
        valid_ips = [ip for part in xff.split(",") if (ip := _normalize_ip_literal(part))]
        for ip_str in reversed(valid_ips):
            addr = ipaddress.ip_address(ip_str)
            if not any(addr in net for net in nets):
                return ip_str
        if valid_ips:
            return valid_ips[-1]

    x_real = _normalize_ip_literal(request.headers.get("x-real-ip"))
    if x_real:
        return x_real
    return _normalize_ip_literal(peer_raw) or peer_raw


def is_https(request: Request, settings: Settings | None = None) -> bool:
    eff_settings = _resolve_request_settings(request, settings)
    peer_raw = (request.client.host if request.client else "") or ""
    if is_trusted_proxy_peer(peer_raw, eff_settings):
        proto = request.headers.get("x-forwarded-proto", "").split(",")[0].strip().lower()
        if proto:
            return proto == "https"
    return request.url.scheme == "https"


def set_session_cookie(response: Response, request: Request, settings: Settings, token: str) -> None:
    response.set_cookie(
        key=settings.session_cookie,
        value=token,
        max_age=settings.session_ttl_sec,
        httponly=True,
        samesite="lax",
        secure=is_https(request),
        path="/",
    )


def clear_session_cookie(response: Response, request: Request, settings: Settings) -> None:
    response.delete_cookie(
        key=settings.session_cookie,
        httponly=True,
        samesite="lax",
        secure=is_https(request),
        path="/",
    )


def serialize_user(user: User, db: Any | None = None) -> dict[str, Any]:
    auth_prov = str(getattr(user, "auth_provider", "local") or "local").strip().lower()
    if db is not None and hasattr(db, "get_user_linked_providers"):
        linked_providers = db.get_user_linked_providers(user.id)
    else:
        linked_providers = {
            "local": {"connected": auth_prov == "local"},
            "phone": {"connected": auth_prov == "phone"},
            "google": {"connected": auth_prov == "google", "email": (user.email or "") if auth_prov == "google" else ""},
            "telegram": {"connected": auth_prov == "telegram", "username": "", "botLinked": False},
        }
    return {
        "id": user.id,
        "username": user.username,
        "displayName": user.display_name or user.username,
        "email": user.email,
        "avatarUrl": user.avatar_url,
        "authProvider": user.auth_provider,
        "role": getattr(user, "role", "student"),
        "linkedProviders": linked_providers,
    }


def public_base_url(request: Request, settings: Settings) -> str:
    if settings.public_base_url:
        return settings.public_base_url.rstrip("/")
    scheme = "https" if is_https(request, settings) else request.url.scheme
    peer_raw = (request.client.host if request.client else "") or ""
    fwd_host = ""
    if is_trusted_proxy_peer(peer_raw, settings):
        fwd_host = request.headers.get("x-forwarded-host", "").split(",")[0].strip()
    host = (
        fwd_host
        or request.headers.get("host", "").strip()
        or request.url.netloc
    )
    return f"{scheme}://{host}".rstrip("/")


def google_redirect_uri(request: Request, settings: Settings) -> str:
    return f"{public_base_url(request, settings)}/api/auth/google/callback"


def pkce_challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def normalize_oauth_role(raw_role: str | None) -> str:
    return "tutor" if str(raw_role or "").strip().lower() == "tutor" else "student"


def sanitize_next_url(raw_next: str | None, *, default_url: str = "/") -> str:
    val = str(raw_next or "").strip()
    if not val or len(val) > 256:
        return default_url
    if any(ord(ch) < 32 for ch in val) or "\\" in val:
        return default_url
    if not val.startswith("/") or val.startswith("//"):
        return default_url
    parts = urlsplit(val)
    if parts.scheme or parts.netloc:
        return default_url
    path = parts.path or "/"
    if not path.startswith("/") or path.startswith("//"):
        return default_url
    return urlunsplit(("", "", path, parts.query, parts.fragment))


def append_query_param(next_url: str, key: str, value: str) -> str:
    safe_next = sanitize_next_url(next_url, default_url="/")
    parts = urlsplit(safe_next)
    query_items = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != key]
    query_items.append((str(key), str(value)))
    return urlunsplit(("", "", parts.path or "/", urlencode(query_items), parts.fragment))


def append_auth_error(next_url: str, error_code: str) -> str:
    return append_query_param(next_url, "auth_error", str(error_code or "oauth_failed"))


def _telegram_bot_id(settings: Settings) -> str | None:
    if not settings.telegram.enabled:
        return None
    prefix = str(settings.telegram.bot_token or "").split(":", 1)[0].strip()
    return prefix if prefix.isdigit() else None


def current_user(request: Request, settings: Settings) -> User | None:
    token = request.cookies.get(settings.session_cookie)
    return request.app.state.db.get_user_by_token(token)


def require_user(request: Request, settings: Settings) -> User:
    user = current_user(request, settings)
    if not user:
        raise HTTPException(
            status_code=401,
            detail={"code": "session_expired", "message": "Нужно войти в аккаунт."},
        )
    return user


def require_tutor(request: Request, settings: Settings) -> User:
    user = require_user(request, settings)
    role = str(getattr(user, "role", "student") or "student").strip().lower()
    if role not in ("tutor", "admin"):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "tutor_only",
                "message": "Доступ разрешён только для преподавателей.",
            },
        )
    return user


def _get_otp_store(request: Request) -> PhoneOtpStore:
    store = getattr(request.app.state, "otp_store", None)
    if store is None:
        store = PhoneOtpStore(db_getter=lambda: getattr(request.app.state, "db", None))
        request.app.state.otp_store = store
    return store


def create_auth_docs_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/health")
    async def health(request: Request) -> dict[str, Any]:
        request.app.state.db.ping()
        return {
            "ok": True,
            "db": "ok",
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
        }

    @router.get("/api/health/storage")
    async def storage_health(request: Request) -> dict[str, Any]:
        db = request.app.state.db
        if hasattr(db, "storage_health"):
            return db.storage_health()
        db.ping()
        return {
            "ok": True,
            "mode": "sqlite",
            "sqlite": "ok",
            "postgres": "disabled",
            "outboxPending": 0,
        }

    @router.get("/api/me")
    async def me(request: Request) -> dict[str, Any]:
        user = current_user(request, settings)
        return {
            "user": serialize_user(user, request.app.state.db) if user else None,
            "ai": {"enabled": settings.ai.enabled, "provider": settings.ai.provider},
            "inviteRequired": bool(settings.invite_code),
            "demoMode": bool(settings.dev_demo_mode),
            "telegramBotUsername": settings.telegram.bot_username,
            "telegramBotId": _telegram_bot_id(settings),
            "payments": {
                "provider": settings.payments.active_provider,
                "yookassaEnabled": bool(
                    settings.payments.active_provider == "yookassa" and settings.payments.yookassa_configured
                ),
                "receiptEnabled": bool(settings.payments.yookassa_receipt_enabled),
            },
            "payouts": {
                "provider": settings.payouts.active_provider,
                "yookassaEnabled": bool(
                    settings.payouts.active_provider == "yookassa" and settings.payouts.yookassa_payouts_configured
                ),
                "autoDispatch": bool(settings.payouts.auto_dispatch),
                "npdProvider": settings.payouts.active_npd_provider,
                "npdLive": settings.payouts.active_npd_provider in ("partner", "lknpd"),
            },
            "providers": {
                "local": True,
                "phone": True,
                "google": settings.google.enabled,
                "telegram": settings.telegram.enabled,
            },
            "otpChannels": {
                "wa": True,
                "tg": True,
                "sms": True,
                "whatsappLive": settings.otp.active_whatsapp_provider != "none",
                "telegramGatewayLive": bool(settings.otp.telegram_gateway_configured),
                "telegramBotLive": bool(settings.telegram.bot_api_enabled),
                "smsLive": settings.otp.active_sms_provider != "none",
                "smsFallback": bool(settings.otp.sms_fallback_enabled and settings.otp.active_sms_provider != "none"),
            },
        }

    @router.get("/api/me/export")
    async def export_me(request: Request) -> JSONResponse:
        user = require_user(request, settings)
        data = request.app.state.db.export_user_data(user.id)
        return JSONResponse(
            content=data,
            headers={
                "Cache-Control": "no-store",
                "Content-Disposition": 'attachment; filename="vektor-personal-data.json"',
            },
        )

    @router.delete("/api/me")
    @router.post("/api/auth/account/delete")
    async def delete_me(request: Request, response: Response) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        user = require_user(request, settings)
        summary = request.app.state.db.delete_user_account(user.id)
        clear_session_cookie(response, request, settings)
        return {"ok": True, **summary}

    @router.post("/api/auth/phone/send")
    async def phone_send(payload: PhoneOtpSendPayload, request: Request) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        digits = _normalize_phone_digits(payload.phone, payload.country)
        if not (7 <= len(digits) <= 15):
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "invalid_phone",
                    "message": "Введи корректный номер телефона для отправки кода в WhatsApp, Telegram или по SMS.",
                },
            )
        channel = _normalize_otp_channel(payload.channel)
        mode = "register" if (payload.mode or "").strip().lower() == "register" else "login"
        invite_ok = True
        if settings.invite_code:
            invite_ok = hmac.compare_digest(payload.inviteCode.strip(), settings.invite_code)
            if mode == "register" and not invite_ok:
                raise HTTPException(
                    status_code=403,
                    detail={"code": "invalid_invite", "message": "Неверный код приглашения."},
                )
        code = _get_otp_store(request).send(
            digits,
            channel,
            mode=mode,
            resend=bool(payload.resend),
            invite_ok=invite_ok,
            dev_demo_mode=bool(settings.dev_demo_mode),
        )
        tg_svc = getattr(request.app.state, "telegram", None)
        otp_svc = getattr(request.app.state, "otp_delivery", None) or OtpDeliveryService(
            settings.otp,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        delivery = await otp_svc.deliver_otp(
            digits,
            code,
            channel=channel,
            telegram_bot=tg_svc,
            bot_api_enabled=bool(settings.telegram.bot_api_enabled),
        )
        if not settings.dev_demo_mode and settings.otp.require_delivery and not delivery.delivered:
            raise HTTPException(
                status_code=503,
                detail={
                    "code": "otp_delivery_unavailable",
                    "message": "Не удалось доставить код подтверждения. Попробуйте другой канал (WhatsApp / Telegram / SMS) или повторите позже.",
                },
            )
        clean_phone = payload.phone.strip() or f"+{digits}"
        channel_name = _otp_channel_name(channel)
        delivered_ch = delivery.delivered_channel or channel
        out: dict[str, Any] = {
            "ok": True,
            "phone": clean_phone,
            "digits": digits,
            "channel": channel,
            "channelName": channel_name,
            "demoMode": bool(settings.dev_demo_mode),
            "delivered": bool(delivery.delivered),
            "deliveredViaBot": bool(delivery.delivered_via_bot),
            "deliveredChannel": delivered_ch,
            "deliveredChannelName": _otp_channel_name(delivered_ch),
            "deliveryProvider": delivery.provider,
            "fallbackUsed": bool(delivery.fallback_used),
        }
        if delivery.external_id:
            out["externalId"] = delivery.external_id
        if settings.dev_demo_mode:
            out["demoCode"] = code
        return out

    @router.post("/api/auth/phone/verify")
    async def phone_verify(
        payload: PhoneOtpVerifyPayload,
        request: Request,
        response: Response,
    ) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        digits = _normalize_phone_digits(payload.phone, payload.country)
        if not (7 <= len(digits) <= 15):
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_phone", "message": "Введи корректный номер телефона."},
            )
        channel = _normalize_otp_channel(payload.channel)
        rec = _get_otp_store(request).verify(
            digits,
            payload.code,
            server_invite=settings.invite_code,
            invite_code=payload.inviteCode,
        )
        resolved_channel = rec.get("channel") or channel
        raw_prov = (payload.authProvider or "phone").strip().lower()
        resolved_provider = (
            "telegram"
            if raw_prov == "telegram"
            else ("google" if raw_prov == "google" else "phone")
        )
        clean_phone = payload.phone.strip() or f"+{digits}"
        clean_display = (payload.displayName or "").strip() or clean_phone
        user = request.app.state.db.upsert_oauth_user(
            resolved_provider,
            f"phone:{digits}",
            display_name=clean_display,
            role=payload.role,
            max_users=settings.max_users,
        )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        set_session_cookie(response, request, settings, token)
        return {
            "user": serialize_user(user, request.app.state.db),
            "phone": clean_phone,
            "channel": resolved_channel,
        }

    @router.post("/api/auth/register")
    async def register(payload: AuthPayload, request: Request, response: Response) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        if settings.invite_code and not hmac.compare_digest(payload.inviteCode.strip(), settings.invite_code):
            raise HTTPException(
                status_code=403,
                detail={"code": "invalid_invite", "message": "Неверный код приглашения."},
            )
        user = request.app.state.db.create_user(
            payload.username,
            payload.password,
            email=payload.email or None,
            display_name=payload.displayName,
            role=payload.role,
            max_users=settings.max_users,
        )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        set_session_cookie(response, request, settings, token)
        return {"user": serialize_user(user, request.app.state.db)}

    @router.post("/api/auth/login")
    async def login(payload: AuthPayload, request: Request, response: Response) -> dict[str, Any]:
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        user = request.app.state.db.authenticate(payload.username, payload.password)
        if not user:
            raise HTTPException(
                status_code=401,
                detail={"code": "invalid_credentials", "message": "Неверный логин или пароль."},
            )
        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        set_session_cookie(response, request, settings, token)
        return {"user": serialize_user(user, request.app.state.db)}

    @router.post("/api/auth/logout")
    async def logout(request: Request, response: Response) -> dict[str, bool]:
        request.app.state.db.delete_session(request.cookies.get(settings.session_cookie))
        clear_session_cookie(response, request, settings)
        return {"ok": True}

    @router.get("/api/auth/google/start")
    async def google_start(request: Request, role: str = "", next: str = "", mode: str = "") -> RedirectResponse:
        if not settings.google.enabled:
            raise HTTPException(
                status_code=503,
                detail={"code": "google_not_configured", "message": "Вход через Google не настроен на сервере."},
            )
        request.app.state.limiter.check(
            f"auth:{client_ip(request)}",
            settings.auth_rate_limit,
            settings.auth_rate_window_sec,
        )
        clean_role = normalize_oauth_role(role)
        default_next = "/tutor" if clean_role == "tutor" else "/"
        clean_next = sanitize_next_url(next, default_url=default_next)
        link_user_id: int | None = None
        if str(mode or "").strip().lower() == "link":
            cur = current_user(request, settings)
            if not cur:
                return RedirectResponse(url=append_auth_error(clean_next, "oauth_link_auth"), status_code=302)
            link_user_id = cur.id
        code_verifier = secrets.token_urlsafe(48)
        redirect_uri = google_redirect_uri(request, settings)
        state = request.app.state.db.create_oauth_state(
            "google",
            code_verifier,
            redirect_uri,
            role=clean_role,
            next_url=clean_next,
            link_user_id=link_user_id,
        )
        params = urlencode(
            {
                "client_id": settings.google.client_id,
                "redirect_uri": redirect_uri,
                "response_type": "code",
                "scope": "openid email profile",
                "state": state,
                "code_challenge": pkce_challenge(code_verifier),
                "code_challenge_method": "S256",
                "prompt": "select_account",
            }
        )
        return RedirectResponse(url=f"https://accounts.google.com/o/oauth2/v2/auth?{params}", status_code=302)

    @router.get("/api/auth/google/callback")
    async def google_callback(
        request: Request,
        code: str = "",
        state: str = "",
        error: str = "",
    ) -> RedirectResponse:
        if not settings.google.enabled or error or not code or not state:
            err_next = "/"
            if state:
                consumed_err = request.app.state.db.consume_oauth_state_data(state, "google")
                if consumed_err:
                    err_next = sanitize_next_url(consumed_err.get("nextUrl"), default_url="/")
            return RedirectResponse(url=append_auth_error(err_next, "google_denied"), status_code=302)

        consumed = request.app.state.db.consume_oauth_state_data(state, "google")
        if not consumed:
            return RedirectResponse(url="/?auth_error=oauth_state", status_code=302)
        code_verifier = str(consumed["codeVerifier"])
        redirect_uri = str(consumed["redirectUri"])
        clean_role = normalize_oauth_role(consumed.get("role"))
        next_url = sanitize_next_url(consumed.get("nextUrl"), default_url="/tutor" if clean_role == "tutor" else "/")
        link_user_id = consumed.get("linkUserId")

        if link_user_id is not None:
            cur = current_user(request, settings)
            if not cur or int(cur.id) != int(link_user_id):
                return RedirectResponse(url=append_auth_error(next_url, "oauth_state"), status_code=302)

        try:
            token_resp = await request.app.state.http.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "code": code,
                    "client_id": settings.google.client_id or "",
                    "client_secret": settings.google.client_secret or "",
                    "redirect_uri": redirect_uri,
                    "grant_type": "authorization_code",
                    "code_verifier": code_verifier,
                },
            )
            if token_resp.status_code != 200:
                return RedirectResponse(url=append_auth_error(next_url, "oauth_exchange"), status_code=302)
            access_token = (token_resp.json() or {}).get("access_token")
            if not access_token:
                return RedirectResponse(url=append_auth_error(next_url, "oauth_exchange"), status_code=302)

            info_resp = await request.app.state.http.get(
                "https://openidconnect.googleapis.com/v1/userinfo",
                headers={"Authorization": f"Bearer {access_token}"},
            )
            if info_resp.status_code != 200:
                return RedirectResponse(url=append_auth_error(next_url, "oauth_profile"), status_code=302)
            info = info_resp.json() or {}
            sub = str(info.get("sub") or "").strip()
            if not sub:
                return RedirectResponse(url=append_auth_error(next_url, "oauth_profile"), status_code=302)
            if link_user_id is not None:
                request.app.state.db.link_oauth_identity(
                    int(link_user_id),
                    "google",
                    sub,
                    email=info.get("email"),
                    email_verified=bool(info.get("email_verified")),
                    avatar_url=info.get("picture"),
                )
                return RedirectResponse(url=append_query_param(next_url, "linked", "google"), status_code=302)
            user = request.app.state.db.upsert_oauth_user(
                "google",
                sub,
                email=info.get("email"),
                email_verified=bool(info.get("email_verified")),
                display_name=str(info.get("name") or ""),
                avatar_url=info.get("picture"),
                role=clean_role,
                max_users=settings.max_users,
            )
        except Exception as exc:
            err_code = getattr(exc, "code", None)
            if err_code in ("user_limit", "invalid_email", "google_already_linked", "not_found"):
                return RedirectResponse(url=append_auth_error(next_url, str(err_code)), status_code=302)
            if isinstance(exc, httpx.HTTPError):
                return RedirectResponse(url=append_auth_error(next_url, "oauth_failed"), status_code=302)
            raise

        token = request.app.state.db.create_session(user.id, settings.session_ttl_sec)
        resp = RedirectResponse(url=next_url, status_code=302)
        set_session_cookie(resp, request, settings, token)
        return resp

    @router.get("/api/docs")
    async def list_docs(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return {"docs": request.app.state.db.get_docs(user.id)}

    @router.patch("/api/docs/{name}")
    async def patch_doc(name: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, bool]:
        user = require_user(request, settings)
        request.app.state.db.patch_doc(user.id, name, payload, settings.max_doc_bytes)
        return {"ok": True}

    @router.put("/api/docs/{name}")
    async def put_doc(name: str, request: Request, payload: dict[str, Any] = Body(...)) -> dict[str, bool]:
        user = require_user(request, settings)
        request.app.state.db.replace_doc(user.id, name, payload, settings.max_doc_bytes)
        return {"ok": True}

    @router.post("/api/ai")
    async def ai_proxy(payload: AIRequestPayload, request: Request):
        user = require_user(request, settings)
        if not settings.ai.enabled:
            raise AIError("not_granted", "ИИ-помощник не настроен на сервере.", 503)
        request.app.state.limiter.check(
            f"ai:{user.id}",
            settings.ai_rate_limit,
            settings.ai_rate_window_sec,
        )

        if payload.mode == "json":
            data = await complete_ai_json(request.app.state.http, settings.ai, payload.messages, payload.modelTier)
            return {"data": data}

        async def sse_gen():
            try:
                async for chunk in stream_ai_text(request.app.state.http, settings.ai, payload.messages, payload.modelTier):
                    yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
            except AIError as exc:
                yield f"data: {json.dumps({'error': exc.code, 'message': exc.message}, ensure_ascii=False)}\n\n"

        return StreamingResponse(
            sse_gen(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    return router
