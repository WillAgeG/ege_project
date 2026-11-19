"""Headless API роуты маркетплейса: кошелёк, карты, заявки/эскроу, расписание, Телемост, лиды, контакты и кабинет репетитора."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..config import Settings
from .auth_docs import current_user, require_user


class WalletTopupPayload(BaseModel):
    amount: int = Field(..., ge=1, le=200_000)
    method: str = Field(default="sbp", max_length=16)
    cardId: str | None = Field(default=None, max_length=64)
    planId: str | None = Field(default=None, max_length=32)


class AddCardPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = Field(default=None, max_length=64)
    brand: str = Field(default="МИР", max_length=32)
    bankName: str = Field(default="", max_length=48)
    bankTheme: str = Field(default="default", max_length=24)
    bin: str = Field(default="", max_length=12)
    last4: str = Field(..., min_length=4, max_length=8)
    exp: str = Field(..., min_length=4, max_length=8)


class BookingCreatePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    tutorId: str = Field(..., min_length=1, max_length=64)
    tutorName: str = Field(default="", max_length=80)
    subject: str = Field(default="", max_length=64)
    subjectName: str = Field(default="", max_length=64)
    exam: str = Field(default="ЕГЭ", max_length=32)
    format: str = Field(default="Онлайн", max_length=32)
    city: str = Field(default="", max_length=48)
    timezone: str = Field(default="", max_length=32)
    dayIso: str = Field(default="", max_length=16)
    slotDate: str = Field(default="", max_length=16)
    dow: int | None = Field(default=None, ge=0, le=6)
    dayLabel: str = Field(default="", max_length=32)
    hour: str = Field(default="16:00", max_length=8)
    tariffId: str = Field(default="", max_length=32)
    offerPrice: int = Field(default=0, ge=0, le=99_999)
    tutorPrice: int | None = Field(default=None, ge=0, le=99_999)
    firstLessonGuarantee: bool = Field(default=True)
    note: str = Field(default="", max_length=500)


class BookingAcceptPayload(BaseModel):
    counterPrice: int | None = Field(default=None, ge=0, le=99_999)


class BookingCounterPayload(BaseModel):
    counterPrice: int = Field(..., ge=1, le=99_999)


class BookingSchedulePayload(BaseModel):
    schedulePlan: dict[str, Any] = Field(default_factory=dict)


class BookingTelemostPayload(BaseModel):
    url: str = Field(default="", max_length=512)


class StudentLeadCreatePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    subjects: list[str] = Field(default_factory=lambda: ["chem"])
    exam: str = Field(default="ЕГЭ", max_length=32)
    format: str = Field(default="Онлайн", max_length=32)
    targetPrice: int = Field(default=1000, ge=0, le=99_999)
    whatsapp: str = Field(default="", max_length=32)
    whatsappCountry: str = Field(default="RU", max_length=12)
    comment: str = Field(default="", max_length=500)
    studentName: str = Field(default="", max_length=64)


class TutorContactUpsertPayload(BaseModel):
    whatsapp: str | None = Field(default=None, max_length=32)
    telegram: str | None = Field(default=None, max_length=64)
    maxHandle: str | None = Field(default=None, max_length=64)


class TutorProfileUpsertPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(..., min_length=2, max_length=80)
    headline: str = Field(default="", max_length=120)
    photo: str = Field(default="", max_length=220_000)
    subject: str = Field(default="bio", max_length=64)
    subjectName: str = Field(default="", max_length=64)
    subjects: list[str] = Field(default_factory=lambda: ["bio"])
    exams: list[str] = Field(default_factory=lambda: ["ЕГЭ"])
    formats: list[str] = Field(default_factory=lambda: ["Онлайн"])
    city: str = Field(default="Якутск", max_length=48)
    timezone: str = Field(default="UTC+9", max_length=32)
    whatsapp: str = Field(default="", max_length=32)
    telegram: str = Field(default="", max_length=64)
    maxHandle: str = Field(default="", max_length=64)
    education: str = Field(default="", max_length=120)
    expYears: int = Field(default=3, ge=1, le=60)
    avgScore: int = Field(default=85, ge=40, le=100)
    price: int = Field(default=1200, ge=100, le=99_999)
    marketPrice: int | None = Field(default=None, ge=100, le=199_999)
    customSkills: str = Field(default="", max_length=240)
    bio: str = Field(default="", max_length=600)
    firstLessonGuarantee: bool = Field(default=True)
    slots: dict[str, list[str]] = Field(default_factory=dict)


class TutorPayoutCreatePayload(BaseModel):
    tutorId: str | None = Field(default=None, max_length=64)
    method: str = Field(default="sbp", max_length=16)
    bank: str = Field(default="СБП", max_length=48)
    destination: str = Field(default="", max_length=64)
    phone: str = Field(default="", max_length=32)
    card: str = Field(default="", max_length=32)
    amount: int = Field(..., ge=500, le=500_000)
    npdReceipt: bool = Field(default=True)


def _publish_rt(
    request: Request,
    *,
    channel: str,
    event_type: str,
    title: str,
    message: str = "",
    tutor_slug: str | None = None,
    payload: dict[str, Any] | None = None,
) -> None:
    rt = getattr(request.app.state, "realtime", None)
    if rt is None:
        return
    rt.publish(
        request.app.state.db,
        channel=channel,
        event_type=event_type,
        title=title,
        message=message,
        tutor_slug=tutor_slug,
        payload=payload or {},
    )


def create_marketplace_router(settings: Settings) -> APIRouter:
    router = APIRouter()

    @router.get("/api/market/state")
    async def market_state(request: Request) -> dict[str, Any]:
        db = request.app.state.db
        user = current_user(request, settings)
        tutors = db.list_tutors(limit=100)
        leads = db.list_student_leads(limit=100)
        if not user:
            return {
                "ok": True,
                "authenticated": False,
                "tutors": tutors,
                "leads": leads,
            }
        wallet = db.get_wallet(user.id)
        bookings = db.list_bookings(user.id, scope="student", limit=100)
        contacts = db.list_tutor_contacts(user.id)
        return {
            "ok": True,
            "authenticated": True,
            "wallet": wallet,
            "bookings": bookings,
            "contacts": contacts,
            "tutors": tutors,
            "leads": leads,
        }

    @router.get("/api/wallet")
    async def wallet_get(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return {"ok": True, "wallet": request.app.state.db.get_wallet(user.id)}

    @router.post("/api/wallet/topup")
    async def wallet_topup(payload: WalletTopupPayload, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        wallet = request.app.state.db.topup_wallet(
            user.id,
            amount_rub=payload.amount,
            method=payload.method,
            card_id=payload.cardId,
            plan_id=payload.planId,
        )
        return {"ok": True, "wallet": wallet}

    @router.post("/api/wallet/cards")
    async def wallet_add_card(payload: AddCardPayload, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        extras = payload.model_extra or {}
        for forbidden in ("pan", "cardNum", "number", "cvc", "cvv"):
            if forbidden in extras:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "code": "pci_forbidden",
                        "message": "Полный номер карты и CVC не должны передаваться на сервер.",
                    },
                )
        res = request.app.state.db.add_saved_card(user.id, payload.model_dump())
        return {"ok": True, **res}

    @router.delete("/api/wallet/cards/{card_id}")
    async def wallet_delete_card(card_id: str, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return request.app.state.db.delete_saved_card(user.id, card_id)

    @router.get("/api/tutors")
    async def tutors_list(
        request: Request,
        subject: str | None = None,
        city: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        tutors = request.app.state.db.list_tutors(subject=subject, city=city, limit=limit)
        return {"ok": True, "tutors": tutors}

    @router.get("/api/bookings")
    async def bookings_list(
        request: Request,
        scope: str = "student",
        tutor_id: str | None = None,
        limit: int = 100,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        clean_scope = "tutor" if (scope or "").strip().lower() == "tutor" else "student"
        items = request.app.state.db.list_bookings(user.id, scope=clean_scope, tutor_id=tutor_id, limit=limit)
        return {"ok": True, "bookings": items}

    @router.post("/api/bookings")
    async def bookings_create(payload: BookingCreatePayload, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.create_booking(user.id, payload.model_dump())
        bk = res["booking"]
        _publish_rt(
            request,
            channel="tutor",
            event_type="market.bid.created",
            title="Новая ставка от ученика",
            message=f"{bk['tutorName']} · {bk['dayLabel']}, {bk['hour']} ({bk['offerPrice']} ₽/ч)",
            tutor_slug=str(bk["tutorId"]),
            payload={"booking": bk, "bookingId": bk["id"], "offerPrice": bk["offerPrice"]},
        )
        return {"ok": True, **res}

    @router.post("/api/bookings/{booking_id}/accept")
    async def bookings_accept(
        booking_id: str,
        request: Request,
        payload: BookingAcceptPayload | None = None,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.transition_booking(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="accept",
            counter_price_rub=payload.counterPrice if payload else None,
        )
        bk = res["booking"]
        _publish_rt(
            request,
            channel="student",
            event_type="market.bid.accepted",
            title="Преподаватель подтвердил занятие",
            message=f"{bk['tutorName']} · {bk['dayLabel']}, {bk['hour']} ({bk['finalPrice']} ₽/ч)",
            tutor_slug=str(bk["tutorId"]),
            payload={"booking": bk, "bookingId": bk["id"]},
        )
        return {"ok": True, **res}

    @router.post("/api/bookings/{booking_id}/counter")
    async def bookings_counter(
        booking_id: str,
        payload: BookingCounterPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.transition_booking(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="counter",
            counter_price_rub=payload.counterPrice,
        )
        bk = res["booking"]
        _publish_rt(
            request,
            channel="student",
            event_type="market.bid.countered",
            title="Встречное предложение по цене",
            message=f"{bk['tutorName']} предложил(а) {payload.counterPrice} ₽/ч",
            tutor_slug=str(bk["tutorId"]),
            payload={"booking": bk, "bookingId": bk["id"], "counterPrice": payload.counterPrice},
        )
        return {"ok": True, **res}

    @router.post("/api/bookings/{booking_id}/cancel")
    async def bookings_cancel(booking_id: str, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.transition_booking(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="cancel",
        )
        bk = res["booking"]
        _publish_rt(
            request,
            channel="all",
            event_type="market.bid.cancelled",
            title="Заявка отменена",
            message=f"{bk['tutorName']} · слот {bk['dayLabel']} {bk['hour']}",
            tutor_slug=str(bk["tutorId"]),
            payload={"booking": bk, "bookingId": bk["id"]},
        )
        return {"ok": True, **res}

    @router.post("/api/bookings/{booking_id}/complete")
    async def bookings_complete(booking_id: str, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.transition_booking(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            action="complete",
        )
        bk = res["booking"]
        _publish_rt(
            request,
            channel="tutor",
            event_type="market.lesson.completed",
            title="Урок завершён · эскроу зачислен",
            message=f"{bk['studentName']} · +{bk['payout']} ₽ (95%)",
            tutor_slug=str(bk["tutorId"]),
            payload={"booking": bk, "bookingId": bk["id"]},
        )
        return {"ok": True, **res}

    @router.patch("/api/bookings/{booking_id}/schedule")
    async def bookings_schedule(
        booking_id: str,
        payload: BookingSchedulePayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        bk = request.app.state.db.update_booking_schedule(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            schedule_plan=payload.schedulePlan,
        )
        sp = bk.get("schedulePlan") or {}
        _publish_rt(
            request,
            channel="tutor",
            event_type="market.schedule.updated",
            title="Бот: график занятий обновлён",
            message=str(sp.get("botText") or f"{bk['dayLabel']} · {bk['hour']}"),
            tutor_slug=str(bk["tutorId"]),
            payload={"bookingId": bk["id"], "schedulePlan": sp, "booking": bk},
        )
        return {"ok": True, "booking": bk}

    @router.patch("/api/bookings/{booking_id}/telemost")
    async def bookings_telemost(
        booking_id: str,
        payload: BookingTelemostPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        bk = request.app.state.db.update_booking_telemost(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            telemost_url=payload.url,
        )
        return {"ok": True, "booking": bk}

    @router.get("/api/leads")
    async def leads_list(
        request: Request,
        subject: str | None = None,
        mine: int = 0,
        limit: int = 100,
    ) -> dict[str, Any]:
        user = current_user(request, settings)
        student_uid = user.id if (mine and user) else None
        items = request.app.state.db.list_student_leads(
            subject=subject, student_user_id=student_uid, limit=limit
        )
        return {"ok": True, "leads": items}

    @router.post("/api/leads")
    async def leads_create(payload: StudentLeadCreatePayload, request: Request) -> dict[str, Any]:
        user = current_user(request, settings)
        lead = request.app.state.db.create_student_lead(
            user.id if user else None, payload.model_dump()
        )
        _publish_rt(
            request,
            channel="tutor",
            event_type="market.lead.created",
            title="Новый запрос ученика",
            message=f"{lead['studentName']} · до {lead['targetPrice']} ₽/ч",
            payload={"lead": lead, "leadId": lead["id"]},
        )
        return {"ok": True, "lead": lead}

    @router.delete("/api/leads/{lead_id}")
    async def leads_close(lead_id: str, request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        lead = request.app.state.db.close_student_lead(
            lead_id, actor_user_id=user.id, actor_role=user.role
        )
        return {"ok": True, "lead": lead}

    @router.get("/api/contacts")
    async def contacts_list(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return {"ok": True, "contacts": request.app.state.db.list_tutor_contacts(user.id)}

    @router.put("/api/contacts/{tutor_id}")
    async def contacts_upsert(
        tutor_id: str,
        payload: TutorContactUpsertPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        contact = request.app.state.db.upsert_tutor_contact(
            user.id,
            tutor_id,
            whatsapp=payload.whatsapp,
            telegram=payload.telegram,
            max_handle=payload.maxHandle,
        )
        return {"ok": True, "tutorId": tutor_id, "contact": contact}

    @router.get("/api/tutor/summary")
    async def tutor_summary(request: Request, tutor_id: str | None = None) -> dict[str, Any]:
        user = require_user(request, settings)
        summary = request.app.state.db.get_tutor_wallet_summary(user.id, tutor_id=tutor_id)
        return {"ok": True, **summary}

    @router.put("/api/tutor/profile")
    async def tutor_profile_upsert(
        payload: TutorProfileUpsertPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.upsert_tutor_profile(user.id, payload.model_dump())
        return {"ok": True, **res}

    @router.post("/api/tutor/bump")
    async def tutor_bump(request: Request, tutor_id: str | None = None) -> dict[str, Any]:
        user = require_user(request, settings)
        tutor = request.app.state.db.bump_tutor(user.id, actor_role=user.role, tutor_id=tutor_id)
        return {"ok": True, "tutor": tutor}

    @router.post("/api/tutor/payouts")
    async def tutor_payout_create(
        payload: TutorPayoutCreatePayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        res = request.app.state.db.create_tutor_payout(
            user.id, payload.model_dump(), actor_role=user.role
        )
        p = res["payout"]
        _publish_rt(
            request,
            channel="tutor",
            event_type="tutor.payout.requested",
            title="Заявка на вывод средств оформлена",
            message=f"{p['amountRub']} ₽ · {p['bank'] or p['method']}",
            tutor_slug=str(p["tutorId"]),
            payload={"payout": p, "payoutId": p["id"]},
        )
        return {"ok": True, **res}

    return router
