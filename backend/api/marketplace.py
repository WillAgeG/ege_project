"""Headless API роуты маркетплейса: кошелёк, карты, заявки/эскроу, расписание, Телемост, лиды, контакты и кабинет репетитора."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..config import Settings
from ..otp_delivery import OtpDeliveryService
from .auth_docs import client_ip, current_user, require_tutor, require_user, serialize_user
from .payments import execute_wallet_topup


class WalletTopupPayload(BaseModel):
    amount: int = Field(..., ge=1, le=200_000)
    method: str = Field(default="sbp", max_length=16)
    cardId: str | None = Field(default=None, max_length=64)
    planId: str | None = Field(default=None, max_length=32)
    receiptEmail: str = Field(default="", max_length=254)
    returnPath: str = Field(default="", max_length=256)


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
    telemostUrl: str = Field(default="", max_length=512)


class BookingAcceptPayload(BaseModel):
    counterPrice: int | None = Field(default=None, ge=0, le=99_999)


class BookingCounterPayload(BaseModel):
    counterPrice: int = Field(..., ge=1, le=99_999)


class BookingSchedulePayload(BaseModel):
    schedulePlan: dict[str, Any] = Field(default_factory=dict)


class BookingTelemostPayload(BaseModel):
    url: str = Field(default="", max_length=512)
    role: str | None = Field(default=None, max_length=16)


def _describe_video_link(url: str) -> tuple[str, str]:
    low = str(url or "").strip().lower()
    if "telemost.yandex." in low:
        return "Яндекс Телемост", "Войти в Телемост"
    if "zoom." in low:
        return "Zoom", "Войти в Zoom"
    if "meet.google.com" in low:
        return "Google Meet", "Войти в Google Meet"
    if "vk.com/call" in low or "calls.vk.com" in low or "vkvideo." in low:
        return "VK Звонки", "Войти в VK Звонки"
    if "discord.gg" in low or "discord.com" in low:
        return "Discord", "Войти в Discord"
    return "Видеозвонок", "Войти на встречу"


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


class TutorApplicationCreatePayload(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    subject: str = Field(default="eng", max_length=64)
    subjectName: str = Field(default="", max_length=80)
    rate: int = Field(default=1100, ge=0, le=99_999)
    contact: str = Field(..., min_length=3, max_length=160)
    source: str = Field(default="landing", max_length=32)


class TutorProfileUpsertPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str | None = Field(default=None, max_length=64)
    tutorId: str | None = Field(default=None, max_length=64)
    name: str = Field(default="", max_length=80)
    headline: str = Field(default="", max_length=120)
    photo: str = Field(default="", max_length=220_000)
    hasPhoto: bool | None = None
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
    avgScore: int = Field(default=85, ge=0, le=100)
    price: int = Field(default=1200, ge=100, le=99_999)
    marketPrice: int | None = Field(default=None, ge=100, le=199_999)
    minFair: int | None = Field(default=None, ge=0, le=99_999)
    customSkills: str = Field(default="", max_length=240)
    customBadges: list[str] = Field(default_factory=list)
    bio: str = Field(default="", max_length=600)
    firstLessonGuarantee: bool = Field(default=True)
    published: bool | None = None
    slots: dict[str, list[str]] = Field(default_factory=dict)


class TutorProfilePublishPayload(BaseModel):
    published: bool


class TutorAccountUpdatePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(..., min_length=2, max_length=80)
    city: str = Field(default="Якутск", max_length=48)
    timezone: str = Field(default="UTC+9", max_length=32)
    photo: str = Field(default="", max_length=220_000)
    hasPhoto: bool = Field(default=True)
    whatsapp: str = Field(default="", max_length=32)
    telegram: str = Field(default="", max_length=64)
    maxHandle: str = Field(default="", max_length=64)
    vk: str = Field(default="", max_length=120)


class TutorPayoutCreatePayload(BaseModel):
    tutorId: str | None = Field(default=None, max_length=64)
    method: str = Field(default="sbp", max_length=16)
    bank: str = Field(default="СБП", max_length=48)
    sbpBankId: str = Field(default="", max_length=32)
    destination: str = Field(default="", max_length=64)
    phone: str = Field(default="", max_length=32)
    card: str = Field(default="", max_length=32)
    payoutToken: str = Field(default="", max_length=255)
    tutorInn: str = Field(default="", max_length=20)
    amount: int = Field(..., ge=500, le=500_000)
    npdReceipt: bool = Field(default=True)


class DirectionDiscoverPayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    name: str = Field(..., min_length=1, max_length=80)
    short: str | None = Field(default=None, max_length=80)
    id: str | None = Field(default=None, max_length=48)
    category: str | None = Field(default=None, max_length=48)
    keywords: list[str] = Field(default_factory=list)
    source: str = Field(default="orchestrator", max_length=24)
    tutorCount: int = Field(default=0, ge=0, le=100_000)


class TutorReviewCreatePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    rating: int = Field(..., ge=1, le=5)
    comment: str = Field(default="", max_length=600)
    bookingId: str | None = Field(default=None, max_length=64)
    tags: list[str] = Field(default_factory=list)
    studentName: str | None = Field(default=None, max_length=64)


class DisputeCreatePayload(BaseModel):
    model_config = ConfigDict(extra="allow")

    reason: str = Field(default="first_lesson_guarantee", max_length=40)
    comment: str = Field(..., min_length=4, max_length=600)
    firstLessonGuarantee: bool = Field(default=True)


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
        directions = db.list_market_directions(limit=200)
        reviews_summary = db.list_tutor_review_summaries()
        if not user:
            return {
                "ok": True,
                "authenticated": False,
                "tutors": tutors,
                "leads": leads,
                "directions": directions,
                "reviewsSummary": reviews_summary,
            }
        wallet = db.get_wallet(user.id)
        bookings = db.list_bookings(user.id, scope="student", limit=100)
        contacts = db.list_tutor_contacts(user.id)
        disputes = db.list_disputes(student_user_id=user.id, limit=100)
        unified_telemost = next((str(b.get("telemostUrl") or "") for b in bookings if b.get("telemostUrl")), "")
        return {
            "ok": True,
            "authenticated": True,
            "wallet": wallet,
            "bookings": bookings,
            "contacts": contacts,
            "disputes": disputes,
            "telemostUrl": unified_telemost,
            "tutors": tutors,
            "leads": leads,
            "directions": directions,
            "reviewsSummary": reviews_summary,
        }

    @router.get("/api/market/directions")
    async def market_directions(request: Request) -> dict[str, Any]:
        directions = request.app.state.db.list_market_directions(limit=200)
        return {"ok": True, "directions": directions}

    @router.post("/api/market/directions/discover")
    async def market_directions_discover(
        payload: DirectionDiscoverPayload,
        request: Request,
    ) -> dict[str, Any]:
        clean_name = str(payload.short or payload.name or "").strip()
        if len(clean_name) < 2:
            raise HTTPException(
                status_code=400,
                detail={
                    "code": "invalid_direction",
                    "message": "Укажите название направления (от 2 символов).",
                },
            )
        db = request.app.state.db
        res = db.upsert_market_direction(payload.model_dump())
        direction = res["direction"]
        if res.get("created"):
            _publish_rt(
                request,
                channel="student",
                event_type="market.direction.discovered",
                title="Новое направление в каталоге",
                message=f"Оркестратор добавил «{direction['short']}»",
                payload={"direction": direction},
            )
        return {
            "ok": True,
            "created": bool(res.get("created")),
            "direction": direction,
            "directions": db.list_market_directions(limit=200),
        }

    @router.get("/api/wallet")
    async def wallet_get(request: Request) -> dict[str, Any]:
        user = require_user(request, settings)
        return {"ok": True, "wallet": request.app.state.db.get_wallet(user.id)}

    @router.post("/api/wallet/topup")
    async def wallet_topup(payload: WalletTopupPayload, request: Request) -> dict[str, Any]:
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

    @router.get("/api/tutors/{tutor_id}/reviews")
    async def tutor_reviews_list(
        tutor_id: str,
        request: Request,
        limit: int = 50,
    ) -> dict[str, Any]:
        res = request.app.state.db.list_tutor_reviews(tutor_id, limit=limit)
        return {"ok": True, **res}

    @router.post("/api/tutors/{tutor_id}/reviews")
    async def tutor_reviews_create(
        tutor_id: str,
        payload: TutorReviewCreatePayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"review_create:{int(user.id)}", 10, 900)
        res = request.app.state.db.create_tutor_review(user.id, tutor_id, payload.model_dump())
        rev = res["review"]
        _publish_rt(
            request,
            channel="tutor",
            event_type="market.review.created",
            title=f"Новый отзыв · ★ {rev['rating']}",
            message=rev.get("comment") or f"{rev['studentName']} оценил(а) занятие",
            tutor_slug=tutor_id,
            payload={
                "studentUserId": user.id,
                "review": rev,
                "rating": res["rating"],
                "reviewsCount": res["reviewsCount"],
            },
        )
        return {"ok": True, **res}

    @router.get("/api/disputes")
    async def disputes_list(request: Request, limit: int = 100) -> dict[str, Any]:
        user = require_user(request, settings)
        if str(getattr(user, "role", "student") or "").lower() == "admin":
            items = request.app.state.db.list_disputes(limit=limit)
        else:
            items = request.app.state.db.list_disputes(student_user_id=user.id, limit=limit)
        return {"ok": True, "disputes": items}

    @router.post("/api/bookings/{booking_id}/dispute")
    async def booking_dispute_open(
        booking_id: str,
        payload: DisputeCreatePayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_user(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"dispute_open:{int(user.id)}", 10, 900)
        res = request.app.state.db.open_dispute(
            user.id, booking_id, payload.model_dump(), actor_role=user.role
        )
        dsp = res["dispute"]
        _publish_rt(
            request,
            channel="all",
            event_type="market.dispute.opened",
            title="Открыт спор по занятию",
            message=f"{dsp['tutorName']} · {dsp['amountRub']} ₽",
            tutor_slug=str(dsp["tutorId"]),
            payload={"dispute": dsp, "disputeId": dsp["id"], "bookingId": booking_id},
        )
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_admin_alert("Открыт спор по занятию", f"{dsp['tutorName']} · {dsp['amountRub']} ₽ ({booking_id})")
        return {"ok": True, **res}

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
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"booking_create:{int(user.id)}", 20, 600)
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
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_booking_created(bk)
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
            allow_student_demo_accept=bool(settings.dev_demo_mode),
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
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_booking_status(bk, "accepted")
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
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_booking_status(bk, "countered", counter_price=payload.counterPrice)
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
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_booking_status(bk, "cancelled")
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
            message=f"{bk['studentName']} · +{bk['payout']} ₽ (94%)",
            tutor_slug=str(bk["tutorId"]),
            payload={"booking": bk, "bookingId": bk["id"]},
        )
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_booking_status(bk, "completed")
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
        target_ch = "student" if (bk.get("studentUserId") != user.id) else "tutor"
        _publish_rt(
            request,
            channel=target_ch,
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
        db = request.app.state.db
        bk = db.update_booking_telemost(
            booking_id,
            actor_user_id=user.id,
            actor_role=user.role,
            telemost_url=payload.url,
        )
        pref_role = (
            "tutor"
            if (
                str(payload.role or "").strip().lower() == "tutor"
                or (payload.role is None and str(getattr(user, "role", "") or "").strip().lower() == "tutor")
            )
            else "student"
        )
        eff_tid = f"booking:{bk['id']}"
        target: dict[str, Any] = {}
        try:
            target = db.get_chat_thread_notification_target(
                eff_tid,
                user_id=int(user.id),
                role=pref_role,
            )
        except Exception:
            target = {}

        if target.get("viewerRole") in ("tutor", "student"):
            changed_by_role = str(target["viewerRole"])
        else:
            is_stu_owner = bk.get("studentUserId") is not None and int(bk["studentUserId"]) == int(user.id)
            changed_by_role = "student" if is_stu_owner else "tutor"

        target_ch = "student" if changed_by_role == "tutor" else "tutor"
        new_url = str(bk.get("telemostUrl") or "").strip()
        subj_name = str(target.get("subjectName") or bk.get("subjectName") or bk.get("subject") or "Занятие").strip()
        slot_label = str(target.get("slotLabel") or f"{bk.get('dayLabel') or ''} · {bk.get('hour') or ''}").strip(" ·")
        role_fallback = (
            str(target.get("tutorName") or bk.get("tutorName") or "Преподаватель").strip()
            if changed_by_role == "tutor"
            else str(target.get("studentName") or bk.get("studentName") or "Ученик").strip()
        )
        actor_name = str(getattr(user, "display_name", "") or getattr(user, "username", "") or role_fallback).strip()
        provider_label, join_label = _describe_video_link(new_url)

        if new_url:
            rt_title = (
                f"Преподаватель {actor_name} обновил ссылку встречи"
                if changed_by_role == "tutor"
                else f"Ученик {actor_name} обновил ссылку встречи"
            )
            rt_message = f"{subj_name}{(' · ' + slot_label) if slot_label else ''} · {provider_label}"
        else:
            rt_title = (
                f"Преподаватель {actor_name} очистил ссылку встречи"
                if changed_by_role == "tutor"
                else f"Ученик {actor_name} очистил ссылку встречи"
            )
            rt_message = f"{subj_name}{(' · ' + slot_label) if slot_label else ''}"

        stu_uid = target.get("studentUserId") if target else bk.get("studentUserId")
        tut_uid = target.get("tutorUserId") if target else None
        tut_id = str(bk.get("tutorId") or target.get("tutorId") or "").strip()

        _publish_rt(
            request,
            channel=target_ch,
            event_type="market.telemost.updated",
            title=rt_title,
            message=rt_message,
            tutor_slug=tut_id,
            payload={
                "bookingId": bk["id"],
                "threadId": str(target.get("threadId") or eff_tid),
                "tutorId": tut_id,
                "tutorUserId": tut_uid,
                "studentUserId": stu_uid,
                "changedByRole": changed_by_role,
                "changedByName": actor_name,
                "subjectName": subj_name,
                "slotLabel": slot_label,
                "providerLabel": provider_label,
                "actionLabel": join_label if new_url else "",
                "telemostUrl": new_url,
            },
        )

        delivered_channels: list[str] = []
        if new_url:
            tg = getattr(request.app.state, "telegram", None)
            if tg is not None and hasattr(tg, "notify_video_link_updated"):
                try:
                    ok_tg = bool(
                        await tg.notify_video_link_updated(
                            recipient_role=target_ch,
                            actor_name=actor_name,
                            subject_name=subj_name,
                            slot_label=slot_label,
                            telemost_url=new_url,
                            provider_label=provider_label,
                            join_button_label=join_label,
                            student_user_id=int(stu_uid) if stu_uid is not None else None,
                            tutor_id=tut_id,
                        )
                    )
                    if ok_tg:
                        delivered_channels.append("telegram")
                except Exception:
                    pass
            wa_phone = str(
                (target.get("studentWhatsappPhone") if target_ch == "student" else target.get("tutorWhatsappPhone")) or ""
            ).strip()
            if wa_phone:
                otp_svc = getattr(request.app.state, "otp_delivery", None) or OtpDeliveryService(
                    settings.otp,
                    http_getter=lambda: getattr(request.app.state, "http", None),
                )
                who_txt = (
                    f"Преподаватель {actor_name}"
                    if changed_by_role == "tutor"
                    else f"Ученик {actor_name}"
                )
                slot_part = f" ({slot_label})" if slot_label else ""
                wa_text = (
                    f"{who_txt} обновил(а) ссылку встречи по предмету «{subj_name}»{slot_part} "
                    f"на платформе Вектор. Войти ({provider_label}): {new_url}"
                )
                try:
                    ok_wa, _, _ = await otp_svc.send_text_notification(wa_phone, wa_text)
                    if ok_wa:
                        delivered_channels.append("whatsapp")
                except Exception:
                    pass

        return {
            "ok": True,
            "booking": bk,
            "notified": {
                "targetRole": target_ch,
                "changedByRole": changed_by_role,
                "channels": delivered_channels,
            },
        }

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
        user = require_tutor(request, settings)
        summary = request.app.state.db.get_tutor_wallet_summary(user.id, tutor_id=tutor_id)
        return {"ok": True, **summary}

    @router.put("/api/tutor/account")
    async def tutor_account_update(
        payload: TutorAccountUpdatePayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        res = request.app.state.db.update_tutor_account(user.id, payload.model_dump())
        _publish_rt(
            request,
            channel="tutor",
            event_type="tutor.account.updated",
            title="Данные аккаунта обновлены",
            message=str((res.get("account") or {}).get("name") or ""),
            payload={"userId": user.id, "profilesCount": len(res.get("profiles") or [])},
        )
        return {
            "ok": True,
            "user": serialize_user(res["userObj"]),
            "account": res["account"],
            "profiles": res["profiles"],
        }

    @router.get("/api/tutor/profiles")
    async def tutor_profiles_list(request: Request) -> dict[str, Any]:
        user = require_tutor(request, settings)
        profiles = request.app.state.db.list_tutor_profiles(user.id)
        return {"ok": True, "profiles": profiles}

    @router.post("/api/tutor/profiles")
    async def tutor_profile_create(
        payload: TutorProfileUpsertPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        res = request.app.state.db.upsert_tutor_profile(
            user.id,
            payload.model_dump(),
            tutor_id=payload.id or payload.tutorId,
            create_new=True,
        )
        return {"ok": True, **res}

    @router.put("/api/tutor/profiles/{tutor_id}")
    async def tutor_profile_update_by_id(
        tutor_id: str,
        payload: TutorProfileUpsertPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        res = request.app.state.db.upsert_tutor_profile(
            user.id,
            payload.model_dump(),
            tutor_id=tutor_id,
            strict_tutor_id=True,
        )
        return {"ok": True, **res}

    @router.patch("/api/tutor/profiles/{tutor_id}/publish")
    async def tutor_profile_publish(
        tutor_id: str,
        payload: TutorProfilePublishPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        res = request.app.state.db.set_tutor_profile_published(
            user.id,
            tutor_id,
            payload.published,
            actor_role=user.role,
        )
        return {"ok": True, **res}

    @router.delete("/api/tutor/profiles/{tutor_id}")
    async def tutor_profile_delete(
        tutor_id: str,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        res = request.app.state.db.delete_tutor_profile(
            user.id,
            tutor_id,
            actor_role=user.role,
        )
        return {"ok": True, **res}

    @router.put("/api/tutor/profile")
    async def tutor_profile_upsert(
        payload: TutorProfileUpsertPayload,
        request: Request,
    ) -> dict[str, Any]:
        user = require_tutor(request, settings)
        res = request.app.state.db.upsert_tutor_profile(
            user.id,
            payload.model_dump(),
            tutor_id=payload.id or payload.tutorId,
        )
        return {"ok": True, **res}

    @router.post("/api/tutor/bump")
    async def tutor_bump(request: Request, tutor_id: str | None = None) -> dict[str, Any]:
        user = require_tutor(request, settings)
        tutor = request.app.state.db.bump_tutor(user.id, actor_role=user.role, tutor_id=tutor_id)
        return {"ok": True, "tutor": tutor}

    @router.post("/api/tutor/payouts")
    async def tutor_payout_create(
        payload: TutorPayoutCreatePayload,
        request: Request,
    ) -> dict[str, Any]:
        from .payouts import execute_tutor_payout

        user = require_tutor(request, settings)
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"tutor_payout:{int(user.id)}", 10, 900)
        res = await execute_tutor_payout(request, settings, user, payload.model_dump())
        p = res["payout"]
        _publish_rt(
            request,
            channel="tutor",
            event_type="tutor.payout.requested",
            title="Заявка на вывод средств оформлена",
            message=f"{p['amountRub']} ₽ · {p['bank'] or p['method']}",
            tutor_slug=str(p["tutorId"]),
            payload={"userId": user.id, "payout": p, "payoutId": p["id"]},
        )
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            hold_tag = " [Антифрод-холд]" if p.get("antifraudHold") else ""
            await tg_svc.notify_admin_alert(
                f"Заявка на вывод средств{hold_tag}",
                f"{p['tutorName']} · {p['amountRub']} ₽ ({p['bank'] or p['method']})",
            )
        return {"ok": True, **res}

    @router.post("/api/tutor-applications")
    async def tutor_application_create(
        payload: TutorApplicationCreatePayload,
        request: Request,
    ) -> dict[str, Any]:
        limiter = getattr(request.app.state, "limiter", None)
        if limiter is not None:
            limiter.check(f"tutor_apply:{client_ip(request)}", 10, 900)
        user = current_user(request, settings)
        app_item = request.app.state.db.create_tutor_application(
            payload.model_dump(),
            user_id=user.id if user else None,
        )
        _publish_rt(
            request,
            channel="all",
            event_type="tutors.application.submitted",
            title="Новая заявка преподавателя с лендинга",
            message=f"{app_item['name']} · {app_item['subjectName']} · {int(app_item['rate'])} ₽/ч",
            payload={"applicationId": app_item["id"], "application": app_item},
        )
        tg_svc = getattr(request.app.state, "telegram", None)
        if tg_svc is not None:
            await tg_svc.notify_admin_alert(
                "Новая заявка преподавателя с лендинга",
                f"{app_item['name']} · {app_item['subjectName']} · {int(app_item['rate'])} ₽/ч · {app_item['contact']}",
            )
        return {"ok": True, "application": app_item}

    return router
