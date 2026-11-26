"""Headless API роуты эквайринга (ЮKassa API v3): пополнение СБП/картой РФ, чеки 54-ФЗ и webhook."""

from __future__ import annotations

from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..config import Settings
from ..yookassa import YooKassaClient, YooKassaError, is_yookassa_webhook_ip
from .admin import _clamp_limit, _require_admin
from .auth_docs import client_ip, current_user, public_base_url, require_user, sanitize_next_url


class PaymentsTopupPayload(BaseModel):
    amount: int = Field(..., ge=1, le=200_000)
    method: str = Field(default="sbp", max_length=16)
    cardId: str | None = Field(default=None, max_length=64)
    planId: str | None = Field(default=None, max_length=32)
    receiptEmail: str = Field(default="", max_length=254)
    returnPath: str = Field(default="", max_length=256)


class WalletRefundRequestPayload(BaseModel):
    amount: int | None = Field(default=None, ge=1, le=200_000)
    paymentIntentId: str | None = Field(default=None, max_length=64)
    reason: str = Field(default="", max_length=250)
    receiptEmail: str = Field(default="", max_length=254)


class AdminDirectRefundPayload(BaseModel):
    amount: int | None = Field(default=None, ge=1, le=200_000)
    reason: str = Field(default="", max_length=250)


class AdminReviewRefundPayload(BaseModel):
    reviewNote: str = Field(default="", max_length=400)


def _yookassa_from(request: Request, settings: Settings) -> YooKassaClient:
    yk = getattr(request.app.state, "yookassa", None)
    if yk is None:
        yk = YooKassaClient(
            settings.payments,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        request.app.state.yookassa = yk
    return yk


def _build_payment_return_url(request: Request, settings: Settings, intent_id: str, return_path: str) -> str:
    base = public_base_url(request, settings)
    safe_rel = sanitize_next_url(return_path, default_url="/")
    parts = urlsplit(safe_rel)
    q_items = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k != "payment_intent"]
    q_items.append(("payment_intent", str(intent_id)))
    rel_out = urlunsplit(("", "", parts.path or "/", urlencode(q_items), parts.fragment))
    return f"{base}{rel_out}"


async def reconcile_payment_intent(
    db: Any,
    yookassa: YooKassaClient,
    intent_id: str,
    *,
    realtime: Any | None = None,
    telegram: Any | None = None,
) -> dict[str, Any]:
    """Сверяет статус платежа напрямую с API ЮKassa (GET /v3/payments/{id}) и идемпотентно зачисляет баланс."""
    intent = db.get_payment_intent(intent_id)
    if not intent:
        raise HTTPException(
            status_code=404,
            detail={"code": "payment_not_found", "message": "Платёжная сессия не найдена."},
        )
    if intent.get("credited") or not intent.get("providerPaymentId"):
        return {
            "intent": intent,
            "wallet": db.get_wallet(intent["userId"]),
            "creditedNow": False,
        }

    remote = await yookassa.get_payment(str(intent["providerPaymentId"]))
    remote_id = str(remote.get("id") or intent["providerPaymentId"]).strip()
    remote_status = str(remote.get("status") or "pending").strip().lower()
    remote_paid = bool(remote.get("paid"))
    amt_obj = remote.get("amount") if isinstance(remote.get("amount"), dict) else {}
    raw_val = amt_obj.get("value")
    currency = str(amt_obj.get("currency") or "RUB").upper()
    try:
        parsed_val = f"{float(raw_val):.2f}"
    except (TypeError, ValueError):
        parsed_val = ""
    expected_val = f"{int(intent['totalRub'])}.00"

    if currency != "RUB" or (parsed_val and parsed_val != expected_val):
        canceled = db.mark_payment_intent_canceled(intent["id"], reason="amount_mismatch")
        return {
            "intent": canceled,
            "wallet": db.get_wallet(intent["userId"]),
            "creditedNow": False,
        }

    if remote_status == "succeeded" and remote_paid:
        res = db.complete_payment_intent_succeeded(intent["id"], provider_payment_id=remote_id)
        if res.get("creditedNow"):
            done_intent = res["intent"]
            wallet = res["wallet"]
            if realtime is not None:
                try:
                    realtime.publish(
                        db,
                        channel="all",
                        event_type="payments.topup.succeeded",
                        title="Баланс пополнен",
                        message=f"+{int(done_intent['amountRub'])} ₽ ({done_intent['method'].upper()})",
                        payload={
                            "intentId": done_intent["id"],
                            "userId": done_intent["userId"],
                            "amountRub": int(done_intent["amountRub"]),
                            "balanceRub": int(wallet["balanceRub"]),
                        },
                    )
                except Exception:
                    pass
            if telegram is not None:
                try:
                    binding = db.get_telegram_binding(int(done_intent["userId"]), by_user=True)
                    chat_id = binding.get("chatId") if binding else None
                    if chat_id and binding.get("notificationsEnabled", True):
                        m_label = "СБП (0%)" if done_intent["method"] == "sbp" else "Карта РФ (+3%)"
                        await telegram._safe_send(
                            chat_id,
                            f"💳 <b>Баланс пополнен</b>\n"
                            f"Зачислено: <b>{int(done_intent['amountRub'])} ₽</b> ({m_label})\n"
                            f"Текущий баланс: <b>{int(wallet['balanceRub'])} ₽</b>",
                        )
                except Exception:
                    pass
        return res

    if remote_status == "canceled":
        details = remote.get("cancellation_details") if isinstance(remote.get("cancellation_details"), dict) else {}
        reason = str(details.get("reason") or "canceled")
        canceled = db.mark_payment_intent_canceled(intent["id"], reason=reason)
        return {
            "intent": canceled,
            "wallet": db.get_wallet(intent["userId"]),
            "creditedNow": False,
        }

    return {
        "intent": intent,
        "wallet": db.get_wallet(intent["userId"]),
        "creditedNow": False,
    }


async def _notify_student_refund_tg(
    db: Any,
    telegram: Any | None,
    refund: dict[str, Any],
    *,
    status: str,
) -> None:
    if telegram is None:
        return
    try:
        uid = int(refund["userId"])
        binding = db.get_telegram_binding_by_user(uid)
        chat_id = binding.get("chatId") if binding else None
        if not chat_id or not binding.get("notificationsEnabled", True):
            return
        amt = int(refund.get("amountRub") or 0)
        method_lbl = "СБП" if refund.get("method") == "sbp" else "Карта РФ"
        if status == "succeeded":
            await telegram._safe_send(
                chat_id,
                f"↩️ <b>Банковский возврат выполнен</b>\n"
                f"Сумма: <b>{amt} ₽</b> ({method_lbl})\n"
                f"Сроки зачисления: 1–3 раб. дня по СБП или 3–10 банковских дней на карту.",
            )
        else:
            note = str(refund.get("reviewNote") or refund.get("errorMessage") or "отменён").strip()
            await telegram._safe_send(
                chat_id,
                f"⚠️ <b>Возврат {amt} ₽ не выполнен ({status})</b>\n"
                f"Причина: {note}\n"
                f"Средства возвращены на баланс вашего кошелька.",
            )
    except Exception:
        pass


def _publish_refund_rt(
    db: Any,
    realtime: Any | None,
    *,
    event_type: str,
    title: str,
    refund: dict[str, Any],
) -> None:
    if realtime is None:
        return
    try:
        realtime.publish(
            db,
            channel="all",
            event_type=event_type,
            title=title,
            message=f"{refund['id']} · {int(refund.get('amountRub') or 0)} ₽ ({refund.get('status')})",
            payload={
                "refundId": refund["id"],
                "paymentIntentId": refund.get("paymentIntentId"),
                "userId": refund["userId"],
                "amountRub": int(refund.get("amountRub") or 0),
                "status": refund.get("status"),
            },
        )
    except Exception:
        pass


async def reconcile_payment_refund(
    db: Any,
    yookassa: YooKassaClient,
    refund_id: str,
    *,
    realtime: Any | None = None,
    telegram: Any | None = None,
) -> dict[str, Any]:
    """Сверяет статус возврата с ЮKassa API (GET /v3/refunds/{id}) и обновляет баланс/леджер."""
    refund = db.get_payment_refund(refund_id)
    if not refund:
        raise HTTPException(
            status_code=404,
            detail={"code": "refund_not_found", "message": "Заявка на возврат не найдена."},
        )
    if refund.get("status") in ("succeeded", "canceled", "rejected") or not refund.get("providerRefundId"):
        return {
            "refund": refund,
            "wallet": db.get_wallet(refund["userId"]),
            "changed": False,
        }

    remote = await yookassa.get_refund(str(refund["providerRefundId"]))
    remote_id = str(remote.get("id") or refund["providerRefundId"]).strip()
    remote_status = str(remote.get("status") or "pending").strip().lower()

    if remote_status == "succeeded":
        res = db.complete_payment_refund_succeeded(refund["id"], provider_refund_id=remote_id)
        done_ref = res["refund"]
        if res.get("changed"):
            _publish_refund_rt(db, realtime, event_type="payments.refund.succeeded", title="Банковский возврат выполнен", refund=done_ref)
            await _notify_student_refund_tg(db, telegram, done_ref, status="succeeded")
        return {
            "refund": done_ref,
            "wallet": db.get_wallet(refund["userId"]),
            "changed": bool(res.get("changed")),
        }

    if remote_status == "canceled":
        details = remote.get("cancellation_details") if isinstance(remote.get("cancellation_details"), dict) else {}
        reason = str(details.get("reason") or "canceled_by_provider")
        res = db.cancel_or_reject_payment_refund(refund["id"], next_status="canceled", reason=reason)
        canc_ref = res["refund"]
        if res.get("revertedNow"):
            _publish_refund_rt(db, realtime, event_type="payments.refund.canceled", title="Возврат отменён банком", refund=canc_ref)
            await _notify_student_refund_tg(db, telegram, canc_ref, status="canceled")
        return {
            "refund": canc_ref,
            "wallet": res["wallet"],
            "changed": bool(res.get("revertedNow")),
        }

    return {
        "refund": refund,
        "wallet": db.get_wallet(refund["userId"]),
        "changed": False,
    }


async def dispatch_payment_refund(
    db: Any,
    yookassa: YooKassaClient,
    settings: Settings,
    refund_id: str,
    *,
    reviewed_by: str = "",
    review_note: str = "",
    realtime: Any | None = None,
    telegram: Any | None = None,
) -> dict[str, Any]:
    """Проводит банковский возврат через ЮKassa API (POST /v3/refunds) с идемпотентностью."""
    refund = db.get_payment_refund(refund_id)
    if not refund:
        raise HTTPException(
            status_code=404,
            detail={"code": "refund_not_found", "message": "Заявка на возврат не найдена."},
        )

    cur_st = str(refund.get("status") or "requested")
    if cur_st in ("canceled", "rejected"):
        raise HTTPException(
            status_code=409,
            detail={"code": "refund_closed", "message": "Возврат уже отклонён или отменён."},
        )
    if cur_st == "succeeded":
        return {"refund": refund, "wallet": db.get_wallet(refund["userId"]), "changed": False, "mode": refund.get("provider")}

    if refund.get("providerRefundId"):
        return await reconcile_payment_refund(db, yookassa, refund["id"], realtime=realtime, telegram=telegram)

    if refund.get("provider") == "demo" or (
        not settings.payments.yookassa_configured and settings.dev_demo_mode and not refund.get("providerPaymentId")
    ):
        res = db.complete_payment_refund_succeeded(
            refund["id"],
            provider_refund_id=f"demo-ref-{refund['id']}",
            reviewed_by=reviewed_by,
            review_note=review_note,
        )
        done_ref = res["refund"]
        if res.get("changed"):
            _publish_refund_rt(db, realtime, event_type="payments.refund.succeeded", title="Возврат выполнен (demo)", refund=done_ref)
            await _notify_student_refund_tg(db, telegram, done_ref, status="succeeded")
        return {"refund": done_ref, "wallet": db.get_wallet(refund["userId"]), "changed": bool(res.get("changed")), "mode": "demo"}

    if not settings.payments.yookassa_configured:
        raise HTTPException(
            status_code=503,
            detail={"code": "payments_not_configured", "message": "Платёжный провайдер ЮKassa не настроен на сервере."},
        )

    try:
        yk_res = await yookassa.create_refund(
            refund_id=refund["id"],
            provider_payment_id=str(refund.get("providerPaymentId") or ""),
            amount_rub=int(refund["amountRub"]),
            idempotency_key=refund["idempotencyKey"],
            method=str(refund.get("method") or "sbp"),
            description=str(refund.get("reason") or ""),
            customer_email=refund.get("receiptEmail") or None,
            customer_phone=refund.get("receiptPhone") or None,
        )
    except YooKassaError as exc:
        if exc.status == 400 and exc.code != "receipt_contact_required":
            rev_res = db.cancel_or_reject_payment_refund(
                refund["id"],
                next_status="canceled",
                reason=exc.message,
                reviewed_by=reviewed_by,
            )
            _publish_refund_rt(db, realtime, event_type="payments.refund.canceled", title="Возврат отклонён ЮKassa", refund=rev_res["refund"])
            await _notify_student_refund_tg(db, telegram, rev_res["refund"], status="canceled")
            raise
        db.attach_provider_refund(
            refund["id"],
            provider_refund_id=None,
            status="requested",
            reviewed_by=reviewed_by,
            review_note=review_note,
            error_message=exc.message,
        )
        raise

    yk_status = str(yk_res.get("status") or "pending").lower()
    prid = str(yk_res.get("providerRefundId") or "")
    if yk_status == "succeeded":
        res = db.complete_payment_refund_succeeded(
            refund["id"],
            provider_refund_id=prid,
            reviewed_by=reviewed_by,
            review_note=review_note,
        )
        done_ref = res["refund"]
        if res.get("changed"):
            _publish_refund_rt(db, realtime, event_type="payments.refund.succeeded", title="Банковский возврат выполнен", refund=done_ref)
            await _notify_student_refund_tg(db, telegram, done_ref, status="succeeded")
        return {"refund": done_ref, "wallet": db.get_wallet(refund["userId"]), "changed": bool(res.get("changed")), "mode": "yookassa"}

    if yk_status == "canceled":
        rev_res = db.cancel_or_reject_payment_refund(
            refund["id"],
            next_status="canceled",
            reason=str(yk_res.get("cancellationReason") or "canceled_by_provider"),
            reviewed_by=reviewed_by,
        )
        db.attach_provider_refund(refund["id"], provider_refund_id=prid, status="canceled")
        _publish_refund_rt(db, realtime, event_type="payments.refund.canceled", title="Возврат отменён ЮKassa", refund=rev_res["refund"])
        await _notify_student_refund_tg(db, telegram, rev_res["refund"], status="canceled")
        return {"refund": db.get_payment_refund(refund["id"]), "wallet": rev_res["wallet"], "changed": bool(rev_res.get("revertedNow")), "mode": "yookassa"}

    pending_ref = db.attach_provider_refund(
        refund["id"],
        provider_refund_id=prid,
        status="pending",
        reviewed_by=reviewed_by,
        review_note=review_note,
        error_message="",
    )
    _publish_refund_rt(db, realtime, event_type="payments.refund.pending", title="Возврат отправлен в ЮKassa", refund=pending_ref)
    return {"refund": pending_ref, "wallet": db.get_wallet(refund["userId"]), "changed": True, "mode": "yookassa"}


async def execute_wallet_topup(
    request: Request,
    settings: Settings,
    user: Any,
    *,
    amount_rub: int,
    method: str = "sbp",
    card_id: str | None = None,
    plan_id: str | None = None,
    receipt_email: str = "",
    return_path: str = "",
) -> dict[str, Any]:
    """Инициирует платёж через ЮKassa (redirect) либо выполняет демо-пополнение при DEV_DEMO_MODE."""
    limiter = getattr(request.app.state, "limiter", None)
    if limiter is not None:
        limiter.check(f"pay_topup:{int(user.id)}", 20, 600)
    clean_receipt_email = str(receipt_email or "").strip()[:254]
    if clean_receipt_email and "@" not in clean_receipt_email:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_email", "message": "Укажите корректный email для фискального чека 54-ФЗ."},
        )

    provider = settings.payments.active_provider
    if provider == "yookassa":
        yookassa = _yookassa_from(request, settings)
        intent = request.app.state.db.create_payment_intent(
            user.id,
            amount_rub=amount_rub,
            method=method,
            plan_id=plan_id,
            provider="yookassa",
            receipt_email=clean_receipt_email,
            return_url="",
        )
        return_url = _build_payment_return_url(request, settings, intent["id"], return_path)
        try:
            yk_res = await yookassa.create_payment(
                intent_id=intent["id"],
                user_id=user.id,
                amount_rub=intent["amountRub"],
                fee_rub=intent["feeRub"],
                total_rub=intent["totalRub"],
                method=intent["method"],
                idempotency_key=intent["idempotencyKey"],
                return_url=return_url,
                customer_email=intent.get("receiptEmail") or user.email,
                customer_phone=intent.get("receiptPhone") or None,
            )
        except YooKassaError as exc:
            request.app.state.db.mark_payment_intent_canceled(intent["id"], reason=exc.code)
            raise

        updated = request.app.state.db.attach_provider_payment(
            intent["id"],
            provider_payment_id=yk_res["providerPaymentId"],
            confirmation_url=yk_res["confirmationUrl"],
            status=yk_res["status"],
        )
        return {
            "ok": True,
            "mode": "redirect",
            "provider": "yookassa",
            "intent": updated or intent,
            "confirmationUrl": yk_res["confirmationUrl"],
        }

    if not settings.dev_demo_mode:
        raise HTTPException(
            status_code=503,
            detail={
                "code": "payments_not_configured",
                "message": "Платёжный провайдер ЮKassa не настроен на сервере.",
            },
        )

    wallet = request.app.state.db.topup_wallet(
        user.id,
        amount_rub=amount_rub,
        method=method,
        card_id=card_id,
        plan_id=plan_id,
    )
    return {"ok": True, "mode": "demo", "provider": "demo", "wallet": wallet}


def create_payments_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.post("/api/payments/topup")
    async def payments_topup(payload: PaymentsTopupPayload, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return await execute_wallet_topup(
            request,
            settings,
            user,
            amount_rub=payload.amount,
            method=payload.method,
            card_id=payload.cardId,
            plan_id=payload.planId,
            receipt_email=payload.receiptEmail,
            return_path=payload.returnPath,
        )

    @router.get("/api/payments/intents")
    async def payments_list_mine(request: Request, limit: int = 30) -> dict[str, Any]:
        user = require_user(request, settings)
        items = request.app.state.db.list_payment_intents(
            user_id=user.id,
            limit=_clamp_limit(limit, default=30),
        )
        return {"ok": True, "intents": items}

    @router.get("/api/payments/intents/{intent_id}")
    async def payments_get_intent(intent_id: str, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        intent = request.app.state.db.get_payment_intent(intent_id)
        if not intent:
            raise HTTPException(
                status_code=404,
                detail={"code": "payment_not_found", "message": "Платёжная сессия не найдена."},
            )
        is_admin = str(getattr(user, "role", "") or "").lower() == "admin"
        if int(intent["userId"]) != int(user.id) and not is_admin:
            raise HTTPException(
                status_code=403,
                detail={"code": "forbidden", "message": "Нет доступа к чужой платёжной сессии."},
            )

        if intent.get("provider") == "yookassa" and intent.get("status") in ("pending", "waiting_for_capture") and settings.payments.yookassa_configured:
            yookassa = _yookassa_from(request, settings)
            res = await reconcile_payment_intent(
                request.app.state.db,
                yookassa,
                intent["id"],
                realtime=getattr(request.app.state, "realtime", None),
                telegram=getattr(request.app.state, "telegram", None),
            )
            return {"ok": True, **res}

        return {
            "ok": True,
            "intent": intent,
            "wallet": request.app.state.db.get_wallet(intent["userId"]),
            "creditedNow": False,
        }

    @router.post("/api/payments/yookassa/webhook")
    async def yookassa_webhook(request: Request) -> dict[str, Any]:
        if settings.payments.yookassa_check_webhook_ip:
            remote_ip = client_ip(request)
            if not is_yookassa_webhook_ip(remote_ip):
                raise HTTPException(
                    status_code=403,
                    detail={"code": "webhook_ip_forbidden", "message": "IP-адрес не входит в allowlist ЮKassa."},
                )

        try:
            body = await request.json()
        except Exception as exc:
            raise HTTPException(status_code=400, detail={"code": "invalid_json", "message": "Invalid JSON"}) from exc

        if not isinstance(body, dict):
            return {"ok": True, "ignored": True}

        event_name = str(body.get("event") or "").strip().lower()
        obj = body.get("object") if isinstance(body.get("object"), dict) else {}
        db = request.app.state.db

        if event_name.startswith("payout."):
            from .payouts import _npd_client_from, _payout_gateway_from, reconcile_payout_status

            provider_payout_id = str(obj.get("id") or "").strip()
            meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
            meta_payout_id = str(meta.get("payout_id") or "").strip()
            payout = db.get_payout_by_provider_id(provider_payout_id) if provider_payout_id else None
            if payout is None and meta_payout_id:
                payout = db.get_payout(meta_payout_id)
            if payout is None:
                return {"ok": True, "ignored": True}
            if provider_payout_id and not payout.get("providerPayoutId"):
                payout = db.attach_provider_payout(
                    payout["id"],
                    provider="yookassa",
                    provider_payout_id=provider_payout_id,
                    provider_status=payout.get("providerStatus") or "pending",
                ) or payout
            if not settings.payouts.yookassa_payouts_configured:
                return {"ok": True, "ignored": True, "status": payout.get("status")}
            p_res = await reconcile_payout_status(
                db,
                _payout_gateway_from(request, settings),
                _npd_client_from(request, settings),
                payout["id"],
                realtime=getattr(request.app.state, "realtime", None),
                telegram=getattr(request.app.state, "telegram", None),
            )
            return {
                "ok": True,
                "status": (p_res.get("payout") or {}).get("status"),
                "changed": bool(p_res.get("changed")),
            }

        provider_payment_id = str(obj.get("id") or "").strip()
        if event_name.startswith("refund."):
            provider_refund_id = str(obj.get("id") or "").strip()
            refund = db.get_payment_refund_by_provider_id(provider_refund_id) if provider_refund_id else None
            if refund is None:
                meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
                meta_ref_id = str(meta.get("refund_id") or "").strip()
                if meta_ref_id:
                    refund = db.get_payment_refund(meta_ref_id)
            if refund is None:
                pay_id = str(obj.get("payment_id") or "").strip()
                if pay_id:
                    cands = [
                        r for r in db.list_payment_refunds(limit=50)
                        if r.get("providerPaymentId") == pay_id and r.get("status") in ("requested", "pending")
                    ]
                    if len(cands) == 1:
                        refund = cands[0]
            if refund is None:
                return {"ok": True, "ignored": True}
            if provider_refund_id and not refund.get("providerRefundId"):
                refund = db.attach_provider_refund(
                    refund["id"],
                    provider_refund_id=provider_refund_id,
                    status=refund.get("status") or "pending",
                ) or refund
            if not settings.payments.yookassa_configured:
                return {"ok": True, "ignored": True, "status": refund.get("status")}
            r_res = await reconcile_payment_refund(
                db,
                _yookassa_from(request, settings),
                refund["id"],
                realtime=getattr(request.app.state, "realtime", None),
                telegram=getattr(request.app.state, "telegram", None),
            )
            return {
                "ok": True,
                "status": (r_res.get("refund") or {}).get("status"),
                "changed": bool(r_res.get("changed")),
            }

        meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        meta_intent_id = str(meta.get("intent_id") or "").strip()

        intent = db.get_payment_intent_by_provider_id(provider_payment_id) if provider_payment_id else None
        if intent is None and meta_intent_id:
            intent = db.get_payment_intent(meta_intent_id)
        if intent is None:
            return {"ok": True, "ignored": True}

        if provider_payment_id and not intent.get("providerPaymentId"):
            intent = db.attach_provider_payment(
                intent["id"],
                provider_payment_id=provider_payment_id,
                confirmation_url=intent.get("confirmationUrl") or "",
                status=intent.get("status") or "pending",
            ) or intent

        if not settings.payments.yookassa_configured:
            return {"ok": True, "ignored": True, "status": intent.get("status")}

        yookassa = _yookassa_from(request, settings)
        res = await reconcile_payment_intent(
            db,
            yookassa,
            intent["id"],
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {
            "ok": True,
            "status": (res.get("intent") or {}).get("status"),
            "creditedNow": bool(res.get("creditedNow")),
        }

    @router.get("/api/admin/payments")
    async def admin_list_payments(
        request: Request,
        status: str = "all",
        limit: int = 100,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        items = request.app.state.db.list_payment_intents(
            status=None if status in ("", "all") else status,
            limit=_clamp_limit(limit, default=100),
        )
        return {"ok": True, "payments": items}

    @router.post("/api/admin/payments/{intent_id}/sync")
    async def admin_sync_payment(intent_id: str, request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        intent = request.app.state.db.get_payment_intent(intent_id)
        if not intent:
            raise HTTPException(
                status_code=404,
                detail={"code": "payment_not_found", "message": "Платёжная сессия не найдена."},
            )
        if not settings.payments.yookassa_configured or not intent.get("providerPaymentId"):
            return {
                "ok": True,
                "intent": intent,
                "wallet": request.app.state.db.get_wallet(intent["userId"]),
                "creditedNow": False,
            }
        yookassa = _yookassa_from(request, settings)
        res = await reconcile_payment_intent(
            request.app.state.db,
            yookassa,
            intent["id"],
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {"ok": True, **res}

    @router.get("/api/payments/refunds")
    async def payments_list_my_refunds(request: Request, limit: int = 30) -> dict[str, Any]:
        user = require_user(request, settings)
        db = request.app.state.db
        wallet = db.get_wallet(user.id)
        refunds = db.list_payment_refunds(user_id=user.id, limit=_clamp_limit(limit, default=30))
        refundable_intents = db.list_refundable_payment_intents(user.id)
        avail_yk = sum(int(p.get("refundableRub") or 0) for p in refundable_intents)
        allow_demo = bool(settings.dev_demo_mode and settings.payments.active_provider != "yookassa")
        refundable_rub = int(wallet["balanceRub"]) if allow_demo else min(int(wallet["balanceRub"]), avail_yk)
        return {
            "ok": True,
            "refunds": refunds,
            "wallet": wallet,
            "refundablePayments": refundable_intents,
            "refundableRub": max(0, refundable_rub),
        }

    @router.post("/api/payments/refunds")
    async def payments_request_refund(payload: WalletRefundRequestPayload, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"pay_refund:{int(user.id)}", 10, 900)
        db = request.app.state.db
        clean_email = str(payload.receiptEmail or "").strip()[:254]
        if clean_email and "@" not in clean_email:
            raise HTTPException(
                status_code=400,
                detail={"code": "invalid_email", "message": "Укажите корректный email для чека возврата 54-ФЗ."},
            )
        wallet = db.get_wallet(user.id)
        target_amt = int(payload.amount) if payload.amount is not None else int(wallet.get("balanceRub") or 0)
        if target_amt <= 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "insufficient_balance", "message": "На балансе кошелька нет доступного остатка для возврата."},
            )
        allow_demo = bool(settings.dev_demo_mode and settings.payments.active_provider != "yookassa")
        res = db.create_wallet_refund_request(
            user.id,
            amount_rub=target_amt,
            reason=payload.reason,
            payment_intent_id=payload.paymentIntentId,
            allow_demo_without_intent=allow_demo,
            receipt_email=clean_email,
        )
        rt = getattr(request.app.state, "realtime", None)
        for ref in res.get("refunds") or []:
            _publish_refund_rt(db, rt, event_type="payments.refund.requested", title="Запрос возврата остатка", refund=ref)
        tg = getattr(request.app.state, "telegram", None)
        if tg is not None:
            try:
                await tg.notify_admin_alert(
                    "Новый запрос на возврат остатка ЮKassa",
                    f"Пользователь: {user.display_name or user.username} (#{user.id})\n"
                    f"Сумма: {target_amt} ₽\nЗаявок: {len(res.get('refunds') or [])}\n"
                    f"Причина: {payload.reason or 'не указана'}",
                )
            except Exception:
                pass
        return {"ok": True, **res}

    @router.get("/api/admin/refunds")
    async def admin_list_refunds(
        request: Request,
        status: str = "all",
        limit: int = 200,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        items = request.app.state.db.list_payment_refunds(
            status=None if status in ("", "all") else status,
            limit=_clamp_limit(limit, default=200),
        )
        return {"ok": True, "refunds": items}

    @router.post("/api/admin/payments/{intent_id}/refund")
    async def admin_refund_payment_intent(
        intent_id: str,
        payload: AdminDirectRefundPayload,
        request: Request,
    ) -> dict[str, Any]:
        reviewer = _require_admin(request, settings)
        db = request.app.state.db
        intent = db.get_payment_intent(intent_id)
        if not intent:
            raise HTTPException(
                status_code=404,
                detail={"code": "payment_not_found", "message": "Платёжная сессия не найдена."},
            )
        if intent.get("status") != "succeeded" or not intent.get("credited"):
            raise HTTPException(
                status_code=400,
                detail={"code": "payment_not_refundable", "message": "Возврат возможен только по оплаченному пополнению."},
            )
        avail_pi = int(intent.get("refundableRub") or 0)
        if avail_pi <= 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "refund_exhausted", "message": "По этому платежу средства уже полностью возвращены."},
            )
        wallet = db.get_wallet(intent["userId"])
        max_avail = min(int(wallet.get("balanceRub") or 0), avail_pi)
        target_amt = int(payload.amount) if payload.amount is not None else max_avail
        if target_amt <= 0 or max_avail <= 0:
            raise HTTPException(
                status_code=400,
                detail={"code": "insufficient_balance", "message": "Недостаточно доступного остатка в кошельке ученика для возврата."},
            )
        req_res = db.create_wallet_refund_request(
            intent["userId"],
            amount_rub=target_amt,
            reason=payload.reason or f"Возврат администратором по платежу {intent_id}",
            payment_intent_id=intent_id,
            allow_demo_without_intent=bool(settings.dev_demo_mode and not intent.get("providerPaymentId")),
        )
        created_ref = req_res["refund"]
        yookassa = _yookassa_from(request, settings)
        disp_res = await dispatch_payment_refund(
            db,
            yookassa,
            settings,
            created_ref["id"],
            reviewed_by=reviewer,
            review_note=payload.reason or "Инициировано администратором",
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {"ok": True, **disp_res}

    @router.post("/api/admin/refunds/{refund_id}/dispatch")
    async def admin_dispatch_refund(
        refund_id: str,
        payload: AdminReviewRefundPayload,
        request: Request,
    ) -> dict[str, Any]:
        reviewer = _require_admin(request, settings)
        res = await dispatch_payment_refund(
            request.app.state.db,
            _yookassa_from(request, settings),
            settings,
            refund_id,
            reviewed_by=reviewer,
            review_note=payload.reviewNote,
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {"ok": True, **res}

    @router.post("/api/admin/refunds/{refund_id}/sync")
    async def admin_sync_refund(refund_id: str, request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        ref = request.app.state.db.get_payment_refund(refund_id)
        if not ref:
            raise HTTPException(
                status_code=404,
                detail={"code": "refund_not_found", "message": "Заявка на возврат не найдена."},
            )
        if not settings.payments.yookassa_configured or not ref.get("providerRefundId"):
            return {
                "ok": True,
                "refund": ref,
                "wallet": request.app.state.db.get_wallet(ref["userId"]),
                "changed": False,
            }
        res = await reconcile_payment_refund(
            request.app.state.db,
            _yookassa_from(request, settings),
            refund_id,
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {"ok": True, **res}

    @router.post("/api/admin/refunds/{refund_id}/reject")
    async def admin_reject_refund(
        refund_id: str,
        payload: AdminReviewRefundPayload,
        request: Request,
    ) -> dict[str, Any]:
        reviewer = _require_admin(request, settings)
        db = request.app.state.db
        res = db.cancel_or_reject_payment_refund(
            refund_id,
            next_status="rejected",
            reason=payload.reviewNote or "Отклонено администратором",
            reviewed_by=reviewer,
        )
        rej_ref = res["refund"]
        if res.get("revertedNow"):
            _publish_refund_rt(
                db,
                getattr(request.app.state, "realtime", None),
                event_type="payments.refund.rejected",
                title="Заявка на возврат отклонена",
                refund=rej_ref,
            )
            await _notify_student_refund_tg(
                db,
                getattr(request.app.state, "telegram", None),
                rej_ref,
                status="rejected",
            )
        return {"ok": True, **res}

    return router


__all__ = [
    "create_payments_router",
    "dispatch_payment_refund",
    "execute_wallet_topup",
    "reconcile_payment_intent",
    "reconcile_payment_refund",
]
