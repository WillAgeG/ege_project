"""Headless API роуты B2C-выплат (ЮKassa Payouts API v3: СБП / Мир) и чеков НПД (ФНС «Мой налог»)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from ..config import Settings
from ..npd_fns import (
    FnsNpdClient,
    NpdError,
    build_fns_receipt_urls,
    parse_fns_receipt_url,
    validate_inn_12,
)
from ..payouts import (
    PayoutGatewayError,
    YooKassaPayoutsClient,
    normalize_card_number,
    normalize_sbp_phone,
    resolve_sbp_bank_id,
)
from ..yookassa import is_yookassa_webhook_ip
from .admin import _clamp_limit, _require_admin
from .auth_docs import client_ip, require_tutor, require_user


class NpdCheckInnPayload(BaseModel):
    inn: str = Field(..., min_length=10, max_length=20)
    tutorId: str | None = Field(default=None, max_length=64)
    save: bool = Field(default=True)


class ManualNpdReceiptPayload(BaseModel):
    receiptUrl: str = Field(..., min_length=10, max_length=500)


class AdminDispatchPayoutPayload(BaseModel):
    cardNumber: str = Field(default="", max_length=32)
    payoutToken: str = Field(default="", max_length=255)
    sbpPhone: str = Field(default="", max_length=32)
    sbpBankId: str = Field(default="", max_length=32)


class AdminRegisterNpdPayload(BaseModel):
    tutorInn: str = Field(default="", max_length=20)
    receiptUrl: str = Field(default="", max_length=500)


class AdminCancelNpdPayload(BaseModel):
    reason: str = Field(default="Чек сформирован ошибочно", max_length=120)


def _payout_gateway_from(request: Request, settings: Settings) -> YooKassaPayoutsClient:
    gw = getattr(request.app.state, "payout_gateway", None)
    if gw is None:
        gw = YooKassaPayoutsClient(
            settings.payouts,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        request.app.state.payout_gateway = gw
    return gw


def _npd_client_from(request: Request, settings: Settings) -> FnsNpdClient:
    npd = getattr(request.app.state, "npd_client", None)
    if npd is None:
        npd = FnsNpdClient(
            settings.payouts,
            http_getter=lambda: getattr(request.app.state, "http", None),
        )
        request.app.state.npd_client = npd
    return npd


async def _notify_tutor_payout_tg(db: Any, telegram: Any | None, tutor_user_id: int | None, payout: dict[str, Any], *, succeeded: bool) -> None:
    if telegram is None or not tutor_user_id:
        return
    try:
        binding = db.get_telegram_binding(int(tutor_user_id), by_user=True)
        chat_id = binding.get("chatId") if binding else None
        if not chat_id or not binding.get("notificationsEnabled", True):
            return
        amt = int(payout.get("amountRub") or 0)
        method_lbl = "СБП" if payout.get("method") == "sbp" else "Карта РФ (Мир)"
        if succeeded:
            npd_line = f"\nЧек НПД: {payout.get('npdReceiptUrl') or payout.get('npdReceipt')}" if (payout.get("npdReceiptUrl") or payout.get("npdReceipt")) else ""
            await telegram._safe_send(
                chat_id,
                f"💸 <b>Выплата исполнена</b>\nСумма: <b>{amt} ₽</b> ({method_lbl} · {payout.get('bank') or '—'}){npd_line}",
            )
        else:
            err = str(payout.get("errorMessage") or "отклонена провайдером")
            await telegram._safe_send(
                chat_id,
                f"⚠️ <b>Выплата {amt} ₽ отклонена</b>\nПричина: {err}\nСредства возвращены в доступный баланс.",
            )
    except Exception:
        pass


async def register_payout_npd_receipt(
    db: Any,
    npd_client: FnsNpdClient,
    payout_id: str,
    *,
    tutor_inn: str | None = None,
    manual_receipt_url: str | None = None,
    realtime: Any | None = None,
) -> dict[str, Any]:
    """Регистрирует чек НПД (через ФНС/Партнёр/демо или по прямой ссылке ФНС) для выплаты."""
    details = db.get_payout_dispatch_details(payout_id)
    if not details:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Выплата не найдена."})

    service_name = f"Услуги репетитора «Вектор» ({details['id']})"
    if manual_receipt_url:
        parsed = parse_fns_receipt_url(manual_receipt_url)
        if not parsed:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "invalid_fns_receipt_url",
                    "message": "Укажите официальную ссылку на чек ФНС вида https://lknpd.nalog.ru/api/v1/receipt/<ИНН>/<UUID>/print",
                },
            )
        parsed_inn, parsed_uuid = parsed
        print_url, json_url = build_fns_receipt_urls(parsed_inn, parsed_uuid)
        saved = db.save_npd_receipt(
            details["id"],
            tutor_id=details["tutorId"],
            tutor_inn=parsed_inn,
            provider="manual_link",
            receipt_uuid=parsed_uuid,
            receipt_url=print_url,
            receipt_json_url=json_url,
            service_name=service_name,
            amount_rub=int(details["amountRub"]),
            status="registered",
        )
        if realtime is not None:
            try:
                realtime.publish(
                    db,
                    channel="tutor",
                    event_type="payments.npd.registered",
                    title="Чек НПД привязан",
                    message=f"{int(details['amountRub'])} ₽ · {parsed_uuid}",
                    tutor_slug=str(details["tutorId"]),
                    payload={"payoutId": details["id"], "receipt": saved.get("receipt")},
                )
            except Exception:
                pass
        return saved

    eff_inn = str(tutor_inn or details.get("tutorInn") or details.get("tutorSavedInn") or "").strip()
    try:
        reg = await npd_client.register_income_receipt(
            payout_id=details["id"],
            tutor_inn=eff_inn,
            amount_rub=int(details["amountRub"]),
            service_name=service_name,
            idempotency_key=f"npd-{details['id']}",
            operation_time=str(details.get("paidAt") or details.get("createdAt") or "") or None,
        )
    except NpdError as exc:
        db.save_npd_receipt(
            details["id"],
            tutor_id=details["tutorId"],
            tutor_inn=eff_inn,
            provider=npd_client.cfg.active_npd_provider,
            receipt_uuid="",
            receipt_url="",
            receipt_json_url="",
            service_name=service_name,
            amount_rub=int(details["amountRub"]),
            status="failed",
            error_message=exc.message,
        )
        raise

    saved = db.save_npd_receipt(
        details["id"],
        tutor_id=details["tutorId"],
        tutor_inn=reg.get("tutorInn") or eff_inn,
        provider=reg.get("provider") or "demo",
        receipt_uuid=reg.get("receiptUuid") or "",
        receipt_url=reg.get("receiptUrl") or "",
        receipt_json_url=reg.get("receiptJsonUrl") or "",
        service_name=reg.get("serviceName") or service_name,
        amount_rub=int(details["amountRub"]),
        status=reg.get("status") or "registered",
    )
    if realtime is not None:
        try:
            realtime.publish(
                db,
                channel="tutor",
                event_type=f"payments.npd.{reg.get('status') or 'registered'}",
                title="Чек НПД сформирован",
                message=f"{int(details['amountRub'])} ₽ · {reg.get('receiptUuid') or ''}",
                tutor_slug=str(details["tutorId"]),
                payload={"payoutId": details["id"], "receipt": saved.get("receipt")},
            )
        except Exception:
            pass
    return saved


async def dispatch_payout_to_provider(
    db: Any,
    payout_gateway: YooKassaPayoutsClient,
    npd_client: FnsNpdClient,
    payout_id: str,
    *,
    card_number: str | None = None,
    payout_token: str | None = None,
    sbp_phone: str | None = None,
    sbp_bank_id: str | None = None,
    realtime: Any | None = None,
    telegram: Any | None = None,
) -> dict[str, Any]:
    """Отправляет заявку на выплату в ЮKassa Payouts API v3 (СБП или карта Мир/РФ)."""
    details = db.get_payout_dispatch_details(payout_id)
    if not details:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Выплата не найдена."})
    if details["status"] == "succeeded":
        return {"payout": details, "dispatchedNow": False, "npdReceipt": None}
    if details.get("providerPayoutId"):
        rec = await reconcile_payout_status(
            db, payout_gateway, npd_client, details["id"], realtime=realtime, telegram=telegram
        )
        return {"payout": rec["payout"], "dispatchedNow": False, "npdReceipt": rec.get("npdReceipt")}

    eff_phone = sbp_phone or details.get("sbpPhone") or ""
    eff_bank_id = sbp_bank_id or details.get("sbpBankId") or ""
    eff_token = payout_token or details.get("payoutToken") or ""

    gw_res = await payout_gateway.create_payout(
        payout_id=details["id"],
        tutor_id=details["tutorId"],
        amount_rub=int(details["amountRub"]),
        method=details["method"],
        idempotency_key=details.get("idempotencyKey") or details["id"],
        sbp_phone=eff_phone,
        sbp_bank_id=eff_bank_id,
        sbp_bank_name=details.get("bank"),
        card_number=card_number,
        payout_token=eff_token,
    )
    attached = db.attach_provider_payout(
        details["id"],
        provider="yookassa",
        provider_payout_id=gw_res["providerPayoutId"],
        provider_status=gw_res["status"],
    )

    npd_res: dict[str, Any] | None = None
    gw_status = str(gw_res.get("status") or "pending").lower()
    if gw_status == "succeeded":
        fin = db.finalize_payout_succeeded(
            details["id"],
            provider_payout_id=gw_res["providerPayoutId"],
            provider_status="succeeded",
        )
        final_payout = fin["payout"]
        if details.get("npdRequested") and final_payout.get("npdStatus") in ("none", "pending", "failed"):
            try:
                npd_res = await register_payout_npd_receipt(db, npd_client, details["id"], realtime=realtime)
                final_payout = db.get_payout(details["id"]) or final_payout
            except NpdError:
                final_payout = db.get_payout(details["id"]) or final_payout
        if realtime is not None:
            try:
                realtime.publish(
                    db,
                    channel="tutor",
                    event_type="payments.payout.succeeded",
                    title="Выплата зачислена",
                    message=f"{int(final_payout['amountRub'])} ₽ · {final_payout.get('bank') or final_payout['method']}",
                    tutor_slug=str(final_payout["tutorId"]),
                    payload={"payoutId": final_payout["id"], "payout": final_payout},
                )
            except Exception:
                pass
        await _notify_tutor_payout_tg(db, telegram, details.get("tutorUserId"), final_payout, succeeded=True)
        return {"payout": final_payout, "dispatchedNow": True, "npdReceipt": (npd_res or {}).get("receipt")}

    if gw_status == "canceled":
        fin = db.finalize_payout_canceled(
            details["id"],
            reason=gw_res.get("cancellationReason") or "canceled",
            provider_status="canceled",
        )
        await _notify_tutor_payout_tg(db, telegram, details.get("tutorUserId"), fin["payout"], succeeded=False)
        return {"payout": fin["payout"], "dispatchedNow": True, "npdReceipt": None}

    if realtime is not None and attached is not None:
        try:
            realtime.publish(
                db,
                channel="tutor",
                event_type="payments.payout.dispatched",
                title="Выплата отправлена в ЮKassa",
                message=f"{int(attached['amountRub'])} ₽ · {attached.get('bank') or attached['method']}",
                tutor_slug=str(attached["tutorId"]),
                payload={"payoutId": attached["id"], "payout": attached},
            )
        except Exception:
            pass
    return {"payout": attached, "dispatchedNow": True, "npdReceipt": None}


async def reconcile_payout_status(
    db: Any,
    payout_gateway: YooKassaPayoutsClient,
    npd_client: FnsNpdClient,
    payout_id: str,
    *,
    realtime: Any | None = None,
    telegram: Any | None = None,
) -> dict[str, Any]:
    """Перепроверяет статус выплаты в ЮKassa (GET /v3/payouts/{id}) и при успехе выпускает чек НПД."""
    details = db.get_payout_dispatch_details(payout_id)
    if not details:
        raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Выплата не найдена."})
    if not details.get("providerPayoutId") or details["status"] in ("succeeded", "rejected"):
        return {"payout": details, "changed": False, "npdReceipt": None}

    remote = await payout_gateway.get_payout(str(details["providerPayoutId"]))
    remote_id = str(remote.get("id") or details["providerPayoutId"]).strip()
    remote_status = str(remote.get("status") or "pending").strip().lower()
    amt_obj = remote.get("amount") if isinstance(remote.get("amount"), dict) else {}
    currency = str(amt_obj.get("currency") or "RUB").upper()
    try:
        parsed_val = f"{float(amt_obj.get('value')):.2f}"
    except (TypeError, ValueError):
        parsed_val = ""
    expected_val = f"{int(details['amountRub'])}.00"

    if currency != "RUB" or (parsed_val and parsed_val != expected_val):
        fin = db.finalize_payout_canceled(details["id"], reason="amount_mismatch", provider_status="canceled")
        return {"payout": fin["payout"], "changed": bool(fin.get("newlyCanceled")), "npdReceipt": None}

    if remote_status == "succeeded":
        fin = db.finalize_payout_succeeded(
            details["id"],
            provider_payout_id=remote_id,
            provider_status="succeeded",
        )
        npd_res: dict[str, Any] | None = None
        if details.get("npdRequested") and (fin["payout"] or {}).get("npdStatus") in ("none", "pending", "failed"):
            try:
                npd_res = await register_payout_npd_receipt(db, npd_client, details["id"], realtime=realtime)
            except NpdError:
                npd_res = None
        final_payout = db.get_payout(details["id"]) or fin["payout"]
        if fin.get("newlySucceeded"):
            if realtime is not None:
                try:
                    realtime.publish(
                        db,
                        channel="tutor",
                        event_type="payments.payout.succeeded",
                        title="Выплата исполнена",
                        message=f"{int(final_payout['amountRub'])} ₽ · {final_payout.get('bank') or final_payout['method']}",
                        tutor_slug=str(final_payout["tutorId"]),
                        payload={"payoutId": final_payout["id"], "payout": final_payout},
                    )
                except Exception:
                    pass
            await _notify_tutor_payout_tg(db, telegram, details.get("tutorUserId"), final_payout, succeeded=True)
        return {
            "payout": final_payout,
            "changed": bool(fin.get("newlySucceeded")),
            "npdReceipt": (npd_res or {}).get("receipt"),
        }

    if remote_status == "canceled":
        c_details = remote.get("cancellation_details") if isinstance(remote.get("cancellation_details"), dict) else {}
        reason = str(c_details.get("reason") or "canceled")
        fin = db.finalize_payout_canceled(details["id"], reason=reason, provider_status="canceled")
        if fin.get("newlyCanceled"):
            if realtime is not None:
                try:
                    realtime.publish(
                        db,
                        channel="tutor",
                        event_type="payments.payout.canceled",
                        title="Выплата отменена",
                        message=f"{int(details['amountRub'])} ₽ · {reason}",
                        tutor_slug=str(details["tutorId"]),
                        payload={"payoutId": details["id"], "payout": fin["payout"]},
                    )
                except Exception:
                    pass
            await _notify_tutor_payout_tg(db, telegram, details.get("tutorUserId"), fin["payout"], succeeded=False)
        return {"payout": fin["payout"], "changed": bool(fin.get("newlyCanceled")), "npdReceipt": None}

    return {"payout": details, "changed": False, "npdReceipt": None}


async def execute_tutor_payout(
    request: Request,
    settings: Settings,
    user: Any,
    payload_dict: dict[str, Any],
) -> dict[str, Any]:
    """Создаёт заявку на выплату с антифрод-проверкой и (при настройке) автоотправкой в ЮKassa."""
    db = request.app.state.db
    payout_gw = _payout_gateway_from(request, settings)
    npd_client = _npd_client_from(request, settings)

    raw_payload = dict(payload_dict or {})
    method = "card" if str(raw_payload.get("method") or "sbp").strip().lower() == "card" else "sbp"
    npd_requested = raw_payload.get("npdReceipt", True) is not False
    active_provider = settings.payouts.active_provider
    active_npd = settings.payouts.active_npd_provider

    # ИНН самозанятого: валидируем, если указан или обязателен для live ФНС НПД
    raw_inn = str(raw_payload.get("tutorInn") or "").strip()
    clean_inn = ""
    if raw_inn:
        ok_inn, parsed_inn = validate_inn_12(raw_inn)
        if not ok_inn:
            raise NpdError(
                "invalid_inn",
                "ИНН самозанятого должен содержать 12 цифр и корректную контрольную сумму.",
                400,
            )
        clean_inn = parsed_inn
    summary_hint = db.get_tutor_wallet_summary(user.id, tutor_id=raw_payload.get("tutorId"))
    eff_inn = clean_inn or str(summary_hint.get("tutorInn") or "").strip()
    if npd_requested and active_npd in ("partner", "lknpd"):
        ok_eff, parsed_eff = validate_inn_12(eff_inn)
        if not ok_eff:
            raise NpdError(
                "tutor_inn_required",
                "Укажите корректный 12-значный ИНН самозанятого для автоматического формирования чека в ФНС «Мой налог».",
                400,
            )
        eff_inn = parsed_eff

    sbp_bank_id = ""
    sbp_phone = ""
    raw_card = ""
    payout_token = str(raw_payload.get("payoutToken") or "").strip()
    if method == "sbp":
        sbp_bank_id = resolve_sbp_bank_id(raw_payload.get("bank"), explicit_bank_id=raw_payload.get("sbpBankId"))
        norm_phone = normalize_sbp_phone(raw_payload.get("destination") or raw_payload.get("phone"))
        if norm_phone:
            sbp_phone = norm_phone
    else:
        norm_card = normalize_card_number(raw_payload.get("destination") or raw_payload.get("card"))
        if norm_card:
            raw_card = norm_card

    antifraud_hold = False
    antifraud_reason = ""
    tid_hint = summary_hint.get("tutorId")
    amt = int(raw_payload.get("amount") or raw_payload.get("amountRub") or 0)
    if active_provider == "yookassa" and tid_hint:
        lessons_cnt = db.count_tutor_captured_lessons(str(tid_hint))
        if lessons_cnt < int(settings.payouts.antifraud_min_lessons):
            antifraud_hold = True
            antifraud_reason = f"new_tutor_hold (проведено уроков: {lessons_cnt})"
        elif amt > int(settings.payouts.auto_max_rub):
            antifraud_hold = True
            antifraud_reason = f"amount_limit_hold (сумма > {int(settings.payouts.auto_max_rub)} ₽)"

    create_payload = dict(raw_payload)
    create_payload.update(
        {
            "sbpBankId": sbp_bank_id,
            "sbpPhone": sbp_phone,
            "payoutToken": payout_token,
            "tutorInn": eff_inn,
            "provider": active_provider,
            "antifraudHold": antifraud_hold,
            "antifraudReason": antifraud_reason,
            "npdMode": "live" if active_npd in ("partner", "lknpd") else "demo",
        }
    )
    res = db.create_tutor_payout(user.id, create_payload, actor_role=user.role)
    p = res["payout"]

    should_dispatch = (
        active_provider == "yookassa"
        and settings.payouts.auto_dispatch
        and not antifraud_hold
        and ((method == "sbp" and bool(sbp_phone)) or bool(raw_card) or bool(payout_token))
    )
    if should_dispatch:
        rt = getattr(request.app.state, "realtime", None)
        tg = getattr(request.app.state, "telegram", None)
        try:
            disp = await dispatch_payout_to_provider(
                db,
                payout_gw,
                npd_client,
                p["id"],
                card_number=raw_card or None,
                payout_token=payout_token or None,
                sbp_phone=sbp_phone or None,
                sbp_bank_id=sbp_bank_id or None,
                realtime=rt,
                telegram=tg,
            )
            res["payout"] = disp["payout"] or p
            res["summary"] = db.get_tutor_wallet_summary(user.id, tutor_id=p["tutorId"])
            if disp.get("npdReceipt"):
                res["npdReceipt"] = disp["npdReceipt"]
        except PayoutGatewayError as exc:
            db.attach_provider_payout(
                p["id"],
                provider="yookassa",
                provider_payout_id=None,
                provider_status="dispatch_error",
                error_message=exc.message,
            )
            res["payout"] = db.get_payout(p["id"]) or p
            res["summary"] = db.get_tutor_wallet_summary(user.id, tutor_id=p["tutorId"])

    return res


def create_payouts_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/payouts/sbp-banks")
    async def payouts_sbp_banks(request: Request) -> dict[str, Any]:
        gw = _payout_gateway_from(request, settings)
        banks = await gw.list_sbp_banks()
        return {"ok": True, "banks": banks, "provider": settings.payouts.active_provider}

    @router.post("/api/tutor/npd/check-inn")
    async def tutor_check_npd_inn(payload: NpdCheckInnPayload, request: Request) -> dict[str, Any]:
        user = require_tutor(request, settings)
        npd_client = _npd_client_from(request, settings)
        result = await npd_client.check_taxpayer_status(payload.inn)
        saved_tutor = None
        if payload.save:
            saved_tutor = request.app.state.db.update_tutor_inn(
                payload.tutorId,
                inn=result["inn"],
                npd_verified=bool(result["isSelfEmployed"]),
                actor_user_id=user.id,
                actor_role=user.role,
            )
        return {"ok": True, **result, "tutor": saved_tutor}

    @router.post("/api/tutor/payouts/{payout_id}/npd-receipt")
    async def tutor_attach_npd_receipt(
        payout_id: str,
        payload: ManualNpdReceiptPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        db = request.app.state.db
        details = db.get_payout_dispatch_details(payout_id)
        if not details:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Выплата не найдена."})
        is_admin = str(getattr(user, "role", "") or "").lower() == "admin"
        owner_uid = details.get("tutorUserId")
        if owner_uid is not None and int(owner_uid) != int(user.id) and not is_admin:
            raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Нет доступа к чужой выплате."})
        if owner_uid is None and not is_admin:
            summary = db.get_tutor_wallet_summary(user.id)
            if str(summary.get("tutorId") or "") != str(details.get("tutorId") or ""):
                raise HTTPException(status_code=403, detail={"code": "forbidden", "message": "Нет доступа к чужой выплате."})
        npd_client = _npd_client_from(request, settings)
        res = await register_payout_npd_receipt(
            db,
            npd_client,
            payout_id,
            manual_receipt_url=payload.receiptUrl,
            realtime=getattr(request.app.state, "realtime", None),
        )
        return {"ok": True, **res}

    @router.post("/api/payouts/yookassa/webhook")
    async def yookassa_payout_webhook(request: Request) -> dict[str, Any]:
        if settings.payouts.check_webhook_ip:
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

        obj = body.get("object") if isinstance(body.get("object"), dict) else {}
        provider_payout_id = str(obj.get("id") or "").strip()
        meta = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
        meta_payout_id = str(meta.get("payout_id") or "").strip()

        db = request.app.state.db
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

        res = await reconcile_payout_status(
            db,
            _payout_gateway_from(request, settings),
            _npd_client_from(request, settings),
            payout["id"],
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {
            "ok": True,
            "status": (res.get("payout") or {}).get("status"),
            "changed": bool(res.get("changed")),
            "npdStatus": (res.get("payout") or {}).get("npdStatus"),
        }

    @router.post("/api/admin/payouts/{payout_id}/dispatch")
    async def admin_dispatch_payout(
        payout_id: str,
        request: Request,
        payload: AdminDispatchPayoutPayload | None = None,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        body = payload or AdminDispatchPayoutPayload()
        res = await dispatch_payout_to_provider(
            request.app.state.db,
            _payout_gateway_from(request, settings),
            _npd_client_from(request, settings),
            payout_id,
            card_number=body.cardNumber.strip() or None,
            payout_token=body.payoutToken.strip() or None,
            sbp_phone=body.sbpPhone.strip() or None,
            sbp_bank_id=body.sbpBankId.strip() or None,
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {"ok": True, **res}

    @router.post("/api/admin/payouts/{payout_id}/sync")
    async def admin_sync_payout(payout_id: str, request: Request) -> dict[str, Any]:
        _require_admin(request, settings)
        if not settings.payouts.yookassa_payouts_configured:
            payout = request.app.state.db.get_payout(payout_id)
            if not payout:
                raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Выплата не найдена."})
            return {"ok": True, "payout": payout, "changed": False, "npdReceipt": None}
        res = await reconcile_payout_status(
            request.app.state.db,
            _payout_gateway_from(request, settings),
            _npd_client_from(request, settings),
            payout_id,
            realtime=getattr(request.app.state, "realtime", None),
            telegram=getattr(request.app.state, "telegram", None),
        )
        return {"ok": True, **res}

    @router.post("/api/admin/payouts/{payout_id}/npd-register")
    async def admin_register_payout_npd(
        payout_id: str,
        request: Request,
        payload: AdminRegisterNpdPayload | None = None,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        body = payload or AdminRegisterNpdPayload()
        res = await register_payout_npd_receipt(
            request.app.state.db,
            _npd_client_from(request, settings),
            payout_id,
            tutor_inn=body.tutorInn.strip() or None,
            manual_receipt_url=body.receiptUrl.strip() or None,
            realtime=getattr(request.app.state, "realtime", None),
        )
        return {"ok": True, **res}

    @router.post("/api/admin/payouts/{payout_id}/npd-cancel")
    async def admin_cancel_payout_npd(
        payout_id: str,
        request: Request,
        payload: AdminCancelNpdPayload | None = None,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        body = payload or AdminCancelNpdPayload()
        db = request.app.state.db
        details = db.get_payout_dispatch_details(payout_id)
        if not details:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": "Выплата не найдена."})
        receipts = db.list_npd_receipts(tutor_id=details["tutorId"], limit=200)
        rc_row = next((r for r in receipts if r["payoutId"] == details["id"]), None)
        receipt_uuid = (rc_row or {}).get("receiptUuid") or details.get("npdReceipt") or ""
        provider = (rc_row or {}).get("provider") or None
        tutor_inn = (rc_row or {}).get("tutorInn") or details.get("tutorInn") or details.get("tutorSavedInn") or ""

        npd_client = _npd_client_from(request, settings)
        await npd_client.cancel_income_receipt(
            receipt_uuid=str(receipt_uuid),
            tutor_inn=str(tutor_inn),
            reason=body.reason,
            provider=provider,
        )
        saved = db.save_npd_receipt(
            details["id"],
            tutor_id=details["tutorId"],
            tutor_inn=str(tutor_inn),
            provider=str(provider or "demo"),
            receipt_uuid=str(receipt_uuid),
            receipt_url="",
            receipt_json_url="",
            service_name=(rc_row or {}).get("serviceName") or f"Услуги репетитора «Вектор» ({details['id']})",
            amount_rub=int(details["amountRub"]),
            status="canceled",
            error_message=body.reason,
        )
        return {"ok": True, **saved}

    @router.get("/api/admin/npd-receipts")
    async def admin_list_npd_receipts(
        request: Request,
        tutor_id: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        _require_admin(request, settings)
        items = request.app.state.db.list_npd_receipts(
            tutor_id=tutor_id,
            limit=_clamp_limit(limit, default=100),
        )
        return {"ok": True, "receipts": items}

    return router


__all__ = [
    "create_payouts_router",
    "dispatch_payout_to_provider",
    "execute_tutor_payout",
    "reconcile_payout_status",
    "register_payout_npd_receipt",
]
