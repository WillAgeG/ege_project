"""Двусторонняя синхронизация календаря (.ics / Google Calendar) для UTC+9 (Якутск) и UTC+3 (Москва)."""

from __future__ import annotations

from datetime import date, datetime, time as dt_time, timedelta, timezone
import ipaddress
import re
import socket
from typing import Any
from urllib.parse import urlencode, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

TZ_YAKUTSK = timezone(timedelta(hours=9), name="Asia/Yakutsk")
TZ_MOSCOW = timezone(timedelta(hours=3), name="Europe/Moscow")

TZ_PRESETS: dict[str, tuple[str, str, timezone, str]] = {
    "UTC+9": ("UTC+9", "Asia/Yakutsk", TZ_YAKUTSK, "+0900"),
    "UTC+3": ("UTC+3", "Europe/Moscow", TZ_MOSCOW, "+0300"),
}

_DATE_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})$")
_DT_RE = re.compile(r"^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}:?\d{2})?$")
_DURATION_RE = re.compile(r"^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
_HOUR_RE = re.compile(r"^(\d{1,2}):(\d{2})$")
_OFFSET_TZ_RE = re.compile(r"^(?:UTC|GMT)?\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?$", re.IGNORECASE)


def resolve_timezone_info(raw_tz: str | None, city: str | None = None) -> tuple[str, str, timezone, str]:
    """Нормализует часовой пояс в пару Якутск (UTC+9) / Москва (UTC+3)."""
    text = (raw_tz or "").strip().lower()
    city_l = (city or "").strip().lower()
    if text in {"utc+3", "europe/moscow", "москва", "moscow", "msk", "+0300", "+03:00"} or (
        "moscow" in text or "моск" in text
    ):
        return TZ_PRESETS["UTC+3"]
    if text in {"utc+9", "asia/yakutsk", "якутск", "yakutsk", "ykt", "+0900", "+09:00"} or (
        "yakutsk" in text or "якут" in text
    ):
        return TZ_PRESETS["UTC+9"]
    if "моск" in city_l or "moscow" in city_l:
        return TZ_PRESETS["UTC+3"]
    return TZ_PRESETS["UTC+9"]


def _ics_escape(value: Any) -> str:
    text = str(value or "")
    text = text.replace("\\", "\\\\").replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\n", "\\n").replace(";", "\\;").replace(",", "\\,")
    return text


def _ics_unescape(value: str) -> str:
    out: list[str] = []
    i = 0
    n = len(value)
    while i < n:
        ch = value[i]
        if ch == "\\" and i + 1 < n:
            nxt = value[i + 1]
            if nxt in ("n", "N"):
                out.append("\n")
            elif nxt in ("\\", ";", ","):
                out.append(nxt)
            else:
                out.append(nxt)
            i += 2
            continue
        out.append(ch)
        i += 1
    return "".join(out)


def slot_date_for_dow(dow: int, *, ref_date: date | None = None) -> date:
    """Вычисляет дату текущей недели для JS weekday (0=Вс, 1=Пн .. 6=Сб)."""
    base = ref_date or datetime.now(TZ_YAKUTSK).date()
    js_today = (base.weekday() + 1) % 7
    monday_delta = -6 if js_today == 0 else 1 - js_today
    monday = base + timedelta(days=monday_delta)
    offset_from_mon = 6 if dow == 0 else (dow - 1)
    return monday + timedelta(days=offset_from_mon)


def _parse_hour(raw_hour: str | None) -> tuple[int, int]:
    m = _HOUR_RE.match((raw_hour or "").strip())
    if not m:
        return 16, 0
    hh = max(0, min(23, int(m.group(1))))
    mm = max(0, min(59, int(m.group(2))))
    return hh, mm


def _parse_slot_date(raw_date: Any, dow: int, tzinfo: timezone) -> date:
    if isinstance(raw_date, str) and _ISO_DATE_RE.match(raw_date.strip()):
        try:
            return date.fromisoformat(raw_date.strip())
        except ValueError:
            pass
    today = datetime.now(tzinfo).date()
    return slot_date_for_dow(dow, ref_date=today)


def normalize_lessons_to_events(
    lessons: list[dict[str, Any]] | None,
    *,
    tutor_slug: str,
    timezone_str: str = "UTC+9",
    city: str | None = None,
) -> list[dict[str, Any]]:
    """Приводит клиентские объекты уроков/заявок к единому формату событий календаря."""
    tz_code, _, tzinfo, _ = resolve_timezone_info(timezone_str, city)
    events: list[dict[str, Any]] = []
    for idx, item in enumerate(lessons or []):
        if not isinstance(item, dict):
            continue
        status = str(item.get("status") or "accepted").strip().lower()
        if status not in {"accepted", "confirmed"}:
            continue
        raw_dow = item.get("dow")
        try:
            dow = int(raw_dow) % 7 if raw_dow is not None and str(raw_dow).strip() != "" else 6
        except (TypeError, ValueError):
            dow = 6
        hour = str(item.get("hour") or item.get("hourSlot") or "16:00").strip()
        hh, mm = _parse_hour(hour)
        hour_norm = f"{hh:02d}:{mm:02d}"
        s_date = _parse_slot_date(item.get("slotDate") or item.get("slot_date"), dow, tzinfo)
        js_dow = (s_date.weekday() + 1) % 7
        uid = str(item.get("uid") or item.get("id") or f"{tutor_slug}-{s_date.isoformat()}-{hh:02d}00-{idx}@vektor-ege.ru")
        if "@" not in uid:
            uid = f"{uid}@vektor-ege.ru"
        student_name = str(item.get("studentName") or item.get("student_name") or "Ученик").strip()
        subject_name = str(item.get("subjectName") or item.get("subject") or "Биология").strip()
        exam = str(item.get("exam") or "ЕГЭ").strip()
        note = str(item.get("note") or "").strip()
        try:
            price_rub = int(item.get("counterPrice") or item.get("offerPrice") or item.get("priceRub") or 0)
        except (TypeError, ValueError):
            price_rub = 0
        try:
            duration_min = max(15, min(240, int(item.get("durationMin") or item.get("duration_min") or 60)))
        except (TypeError, ValueError):
            duration_min = 60

        events.append(
            {
                "uid": uid,
                "tutorSlug": tutor_slug,
                "studentName": student_name,
                "subject": subject_name,
                "exam": exam,
                "dow": js_dow,
                "slotDate": s_date.isoformat(),
                "hour": hour_norm,
                "durationMin": duration_min,
                "timezone": tz_code,
                "priceRub": price_rub,
                "status": "accepted",
                "source": "vektor",
                "note": note,
            }
        )
    return events


def _event_local_bounds(item: dict[str, Any], default_tz: timezone) -> tuple[datetime, datetime]:
    tz_raw = item.get("timezone")
    if tz_raw:
        _, _, item_tz, _ = resolve_timezone_info(str(tz_raw))
    else:
        item_tz = default_tz
    try:
        dow = int(item.get("dow") if item.get("dow") is not None else 6) % 7
    except (TypeError, ValueError):
        dow = 6
    s_date = _parse_slot_date(item.get("slotDate") or item.get("slot_date"), dow, item_tz)
    hh, mm = _parse_hour(str(item.get("hour") or item.get("hourSlot") or "16:00"))
    try:
        duration_min = max(15, min(240, int(item.get("durationMin") or item.get("duration_min") or 60)))
    except (TypeError, ValueError):
        duration_min = 60
    start_local = datetime(s_date.year, s_date.month, s_date.day, hh, mm, 0, tzinfo=item_tz)
    start_target = start_local.astimezone(default_tz)
    end_target = start_target + timedelta(minutes=duration_min)
    return start_target, end_target


def generate_ics(cal_state: dict[str, Any]) -> str:
    """Генерирует RFC 5545 VCALENDAR с блоком VTIMEZONE (Asia/Yakutsk или Europe/Moscow)."""
    tz_code, iana_name, tzinfo, offset_str = resolve_timezone_info(
        cal_state.get("timezone"),
        cal_state.get("city"),
    )
    tutor_name = str(cal_state.get("tutorName") or cal_state.get("tutor_name") or "Преподаватель Вектор").strip()
    dtstamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Vektor EGE//Schedule 2027//RU",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{_ics_escape(f'Вектор — {tutor_name}')}",
        f"X-WR-TIMEZONE:{iana_name}",
        "BEGIN:VTIMEZONE",
        f"TZID:{iana_name}",
        f"X-LIC-LOCATION:{iana_name}",
        "BEGIN:STANDARD",
        f"TZOFFSETFROM:{offset_str}",
        f"TZOFFSETTO:{offset_str}",
        f"TZNAME:{tz_code}",
        "DTSTART:19700101T000000",
        "END:STANDARD",
        "END:VTIMEZONE",
    ]

    seen_keys: set[tuple[str, str]] = set()
    raw_events = list(cal_state.get("events") or cal_state.get("lessons") or [])
    for idx, ev in enumerate(raw_events):
        if not isinstance(ev, dict):
            continue
        status = str(ev.get("status") or "accepted").lower()
        source = str(ev.get("source") or "vektor").lower()
        if status == "cancelled":
            continue
        uid = str(ev.get("uid") or ev.get("id") or f"vektor-{idx}@vektor-ege.ru")
        if "@" not in uid:
            uid = f"{uid}@vektor-ege.ru"

        start_dt, end_dt = _event_local_bounds(ev, tzinfo)
        start_key = start_dt.strftime("%Y%m%dT%H%M%S")
        if (uid, start_key) in seen_keys:
            continue
        seen_keys.add((uid, start_key))
        if source == "gcal_ics" or status == "external_busy":
            summary = "Занято (Google Calendar)"
            desc = str(ev.get("summary") or ev.get("note") or "Внешнее событие из Google Calendar")
        else:
            student = str(ev.get("studentName") or ev.get("student_name") or "Ученик").strip()
            subj = str(ev.get("subjectName") or ev.get("subject") or "ЕГЭ").strip()
            exam = str(ev.get("exam") or "ЕГЭ").strip()
            summary = f"Урок {exam}: {student} ({subj})"
            price = int(ev.get("priceRub") or ev.get("counterPrice") or ev.get("offerPrice") or 0)
            note = str(ev.get("note") or "").strip()
            desc_parts = [f"{exam} · {subj}"]
            if price > 0:
                desc_parts.append(f"Ставка: {price} ₽/ч")
            if note:
                desc_parts.append(note)
            desc = " | ".join(desc_parts)

        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{_ics_escape(uid)}",
                f"DTSTAMP:{dtstamp}",
                f"DTSTART;TZID={iana_name}:{start_dt.strftime('%Y%m%dT%H%M%S')}",
                f"DTEND;TZID={iana_name}:{end_dt.strftime('%Y%m%dT%H%M%S')}",
                f"SUMMARY:{_ics_escape(summary)}",
                f"DESCRIPTION:{_ics_escape(desc)}",
                "STATUS:CONFIRMED",
                "END:VEVENT",
            ]
        )

    for idx, busy in enumerate(cal_state.get("busySlots") or []):
        if not isinstance(busy, dict):
            continue
        raw_uid = str(busy.get("uid") or f"gcal-busy-{idx}-{busy.get('slotDate','')}-{busy.get('hour','')}")
        uid = raw_uid if "@" in raw_uid else f"{raw_uid}@gcal.vektor-ege.ru"
        start_dt, end_dt = _event_local_bounds(busy, tzinfo)
        start_key = start_dt.strftime("%Y%m%dT%H%M%S")
        if (uid, start_key) in seen_keys:
            continue
        seen_keys.add((uid, start_key))
        orig_summary = str(busy.get("summary") or "Внешнее событие").strip()
        lines.extend(
            [
                "BEGIN:VEVENT",
                f"UID:{_ics_escape(f'{uid}-{start_key}' if idx >= 0 else uid)}",
                f"DTSTAMP:{dtstamp}",
                f"DTSTART;TZID={iana_name}:{start_key}",
                f"DTEND;TZID={iana_name}:{end_dt.strftime('%Y%m%dT%H%M%S')}",
                "SUMMARY:Занято (Google Calendar)",
                f"DESCRIPTION:{_ics_escape(orig_summary)}",
                "STATUS:CONFIRMED",
                "END:VEVENT",
            ]
        )

    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"


def _resolve_ics_tz(tzid: str | None, default_tz: timezone):
    if not tzid:
        return default_tz, "local"
    cleaned = tzid.strip().strip('"')
    low = cleaned.lower()
    if low in {"asia/yakutsk", "yakutsk standard time", "utc+9", "gmt+9"}:
        return TZ_YAKUTSK, "Asia/Yakutsk"
    if low in {"europe/moscow", "russian standard time", "utc+3", "gmt+3"}:
        return TZ_MOSCOW, "Europe/Moscow"
    m = _OFFSET_TZ_RE.match(cleaned)
    if m:
        sign = 1 if m.group(1) == "+" else -1
        hrs = int(m.group(2))
        mins = int(m.group(3) or 0)
        return timezone(sign * timedelta(hours=hrs, minutes=mins)), cleaned
    try:
        return ZoneInfo(cleaned), cleaned
    except ZoneInfoNotFoundError:
        return default_tz, cleaned


def _parse_ics_datetime(
    value: str,
    params: dict[str, str],
    default_tz: timezone,
) -> tuple[datetime, bool, str]:
    raw = value.strip()
    tzid = params.get("TZID")
    dm = _DATE_RE.match(raw)
    if dm or params.get("VALUE", "").upper() == "DATE":
        if not dm:
            raise ValueError(f"Unsupported DATE value: {raw}")
        d = date(int(dm.group(1)), int(dm.group(2)), int(dm.group(3)))
        tz, src_label = _resolve_ics_tz(tzid, default_tz)
        return datetime.combine(d, dt_time(10, 0), tzinfo=tz), True, src_label

    dtm = _DT_RE.match(raw)
    if not dtm:
        raise ValueError(f"Unsupported DATETIME value: {raw}")
    year, month, day, hh, mm, ss = (int(dtm.group(i)) for i in range(1, 7))
    suffix = dtm.group(7)
    if suffix == "Z":
        return datetime(year, month, day, hh, mm, ss, tzinfo=timezone.utc), False, "UTC"
    if suffix:
        s_clean = suffix.replace(":", "")
        sign = 1 if s_clean[0] == "+" else -1
        oh = int(s_clean[1:3])
        om = int(s_clean[3:5])
        tz = timezone(sign * timedelta(hours=oh, minutes=om))
        return datetime(year, month, day, hh, mm, ss, tzinfo=tz), False, suffix
    tz, src_label = _resolve_ics_tz(tzid, default_tz)
    return datetime(year, month, day, hh, mm, ss, tzinfo=tz), False, src_label


def _parse_ics_duration(raw: str) -> timedelta:
    m = _DURATION_RE.match(raw.strip().upper())
    if not m:
        return timedelta(hours=1)
    days = int(m.group(1) or 0)
    hours = int(m.group(2) or 0)
    mins = int(m.group(3) or 0)
    secs = int(m.group(4) or 0)
    delta = timedelta(days=days, hours=hours, minutes=mins, seconds=secs)
    return delta if delta > timedelta(0) else timedelta(hours=1)


def unfold_ics_lines(ics_text: str) -> list[str]:
    normalized = (ics_text or "").replace("\r\n", "\n").replace("\r", "\n")
    unfolded = re.sub(r"\n[ \t]", "", normalized)
    return [line for line in unfolded.split("\n") if line.strip()]


def parse_ics_busy_slots(ics_text: str, target_timezone: str = "UTC+9") -> list[dict[str, Any]]:
    """Парсит RFC 5545 .ics и переводит занятые интервалы в target_timezone (10:00–20:00)."""
    _, _, target_tz, _ = resolve_timezone_info(target_timezone)
    lines = unfold_ics_lines(ics_text)
    busy_slots: list[dict[str, Any]] = []
    seen_keys: set[tuple[str, str, str]] = set()

    in_event = False
    props: dict[str, tuple[dict[str, str], str]] = {}

    def flush_event() -> None:
        if "DTSTART" not in props:
            return
        status_val = props.get("STATUS", ({}, ""))[1].strip().upper()
        if status_val == "CANCELLED":
            return
        dtstart_params, dtstart_val = props["DTSTART"]
        try:
            start_dt, is_all_day, source_tz = _parse_ics_datetime(dtstart_val, dtstart_params, target_tz)
        except ValueError:
            return

        if is_all_day:
            start_local = start_dt.astimezone(target_tz).replace(hour=10, minute=0, second=0)
            end_local = start_local.replace(hour=21, minute=0, second=0)
        else:
            start_local = start_dt.astimezone(target_tz)
            end_local: datetime | None = None
            if "DTEND" in props:
                dtend_params, dtend_val = props["DTEND"]
                try:
                    end_dt, _, _ = _parse_ics_datetime(dtend_val, dtend_params, target_tz)
                    end_local = end_dt.astimezone(target_tz)
                except ValueError:
                    end_local = None
            if end_local is None:
                if "DURATION" in props:
                    end_local = start_local + _parse_ics_duration(props["DURATION"][1])
                else:
                    end_local = start_local + timedelta(hours=1)
            if end_local <= start_local:
                end_local = start_local + timedelta(hours=1)

        uid = _ics_unescape(props.get("UID", ({}, ""))[1].strip()) or f"gcal-{len(busy_slots)}"
        summary = _ics_unescape(props.get("SUMMARY", ({}, "Занято (Google Calendar)"))[1].strip()) or "Занято (Google Calendar)"

        cur_date = start_local.date()
        end_date = end_local.date()
        # Не раздуваем аномально длинные многодневные события сверх 14 дней
        if (end_date - cur_date).days > 14:
            end_date = cur_date + timedelta(days=14)

        while cur_date <= end_date:
            js_dow = (cur_date.weekday() + 1) % 7
            date_iso = cur_date.isoformat()
            for hour_num in range(10, 21):
                slot_start = datetime(cur_date.year, cur_date.month, cur_date.day, hour_num, 0, tzinfo=target_tz)
                slot_end = slot_start + timedelta(hours=1)
                if start_local < slot_end and end_local > slot_start:
                    hour_str = f"{hour_num:02d}:00"
                    dedup_key = (uid, date_iso, hour_str)
                    if dedup_key not in seen_keys:
                        seen_keys.add(dedup_key)
                        busy_slots.append(
                            {
                                "uid": uid,
                                "dow": js_dow,
                                "slotDate": date_iso,
                                "hour": hour_str,
                                "summary": summary,
                                "sourceTz": source_tz,
                            }
                        )
            cur_date += timedelta(days=1)

    for line in lines:
        upper = line.upper()
        if upper == "BEGIN:VEVENT":
            in_event = True
            props = {}
            continue
        if upper == "END:VEVENT":
            if in_event:
                flush_event()
            in_event = False
            props = {}
            continue
        if not in_event or ":" not in line:
            continue
        left, val = line.split(":", 1)
        parts = left.split(";")
        name = parts[0].strip().upper()
        params: dict[str, str] = {}
        for p in parts[1:]:
            if "=" in p:
                pk, pv = p.split("=", 1)
                params[pk.strip().upper()] = pv.strip()
        props[name] = (params, val)

    return busy_slots


def detect_busy_conflicts(
    events: list[dict[str, Any]],
    busy_slots: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Находит пересечения между принятыми уроками и внешними занятыми слотами."""
    conflicts: list[dict[str, Any]] = []
    for ev in events or []:
        if str(ev.get("status") or "accepted").lower() not in {"accepted", "confirmed"}:
            continue
        if str(ev.get("source") or "vektor").lower() == "gcal_ics":
            continue
        ev_dow = ev.get("dow")
        ev_date = str(ev.get("slotDate") or ev.get("slot_date") or "").strip()
        ev_hour = str(ev.get("hour") or ev.get("hourSlot") or "").strip()
        if not ev_hour:
            continue
        for busy in busy_slots or []:
            b_hour = str(busy.get("hour") or "").strip()
            if b_hour != ev_hour:
                continue
            b_date = str(busy.get("slotDate") or "").strip()
            b_dow = busy.get("dow")
            same_date = bool(ev_date and b_date and ev_date == b_date)
            same_dow = ev_dow is not None and b_dow is not None and int(ev_dow) == int(b_dow)
            if same_date or same_dow:
                conflicts.append(
                    {
                        "lessonUid": ev.get("uid"),
                        "studentName": ev.get("studentName") or "Ученик",
                        "busyUid": busy.get("uid"),
                        "summary": busy.get("summary") or "Занято (Google Calendar)",
                        "dow": int(b_dow) if b_dow is not None else int(ev_dow or 0),
                        "slotDate": b_date or ev_date,
                        "hour": ev_hour,
                    }
                )
    return conflicts


def build_google_calendar_urls(
    *,
    base_url: str,
    feed_token: str,
    cal_state: dict[str, Any],
) -> dict[str, str]:
    """Строит ссылки подписки .ics / webcal:// и шаблон Google Calendar с точным UTC Z временем."""
    clean_base = (base_url or "http://127.0.0.1:8770").rstrip("/")
    ics_url = f"{clean_base}/api/calendar/{feed_token}.ics"
    if clean_base.startswith("https://"):
        webcal_url = "webcal://" + clean_base[len("https://"):] + f"/api/calendar/{feed_token}.ics"
    elif clean_base.startswith("http://"):
        webcal_url = "webcal://" + clean_base[len("http://"):] + f"/api/calendar/{feed_token}.ics"
    else:
        webcal_url = f"webcal://{clean_base}/api/calendar/{feed_token}.ics"

    google_subscribe_url = "https://calendar.google.com/calendar/r?" + urlencode({"cid": webcal_url})

    tz_code, iana_name, tzinfo, _ = resolve_timezone_info(
        cal_state.get("timezone"),
        cal_state.get("city"),
    )
    accepted = [
        ev
        for ev in (cal_state.get("events") or cal_state.get("lessons") or [])
        if isinstance(ev, dict)
        and str(ev.get("status") or "accepted").lower() in {"accepted", "confirmed"}
        and str(ev.get("source") or "vektor").lower() != "gcal_ics"
    ]
    if accepted:
        first = accepted[0]
        start_dt, end_dt = _event_local_bounds(first, tzinfo)
        student = str(first.get("studentName") or first.get("student_name") or "Ученик").strip()
        subj = str(first.get("subjectName") or first.get("subject") or "Биология").strip()
        exam = str(first.get("exam") or "ЕГЭ").strip()
        title = f"Урок {exam}: {student} ({subj})"
        details = f"Платформа Вектор · {tz_code} ({iana_name}). Ссылка подписки: {ics_url}"
    else:
        default_date = slot_date_for_dow(6, ref_date=datetime.now(tzinfo).date())
        start_dt = datetime(default_date.year, default_date.month, default_date.day, 16, 0, tzinfo=tzinfo)
        end_dt = start_dt + timedelta(hours=1)
        tutor_name = str(cal_state.get("tutorName") or "Преподаватель Вектор").strip()
        title = f"Занятие Вектор — {tutor_name}"
        details = f"Расписание {tz_code} ({iana_name}). Подписка .ics: {ics_url}"

    utc_start = start_dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    utc_end = end_dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    google_template_url = "https://calendar.google.com/calendar/render?" + urlencode(
        {
            "action": "TEMPLATE",
            "text": title,
            "dates": f"{utc_start}/{utc_end}",
            "details": details,
            "ctz": iana_name,
        }
    )

    return {
        "icsUrl": ics_url,
        "webcalUrl": webcal_url,
        "googleSubscribeUrl": google_subscribe_url,
        "googleTemplateUrl": google_template_url,
    }


def validate_public_ics_url(raw_url: str) -> str:
    """Проверяет публичный HTTPS URL для защиты от SSRF (блокирует localhost и приватные сети)."""
    url = (raw_url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme.lower() != "https" or not parsed.netloc or not parsed.hostname:
        raise ValueError("Разрешены только публичные https:// ссылки на .ics календарь.")

    host = parsed.hostname.strip().lower().rstrip(".")
    if host in {"localhost", "127.0.0.1", "::1", "0.0.0.0"} or host.endswith((".local", ".internal", ".localhost")):
        raise ValueError("Запрещён доступ к локальным или внутренним адресам.")

    def _check_ip(ip_str: str) -> None:
        addr = ipaddress.ip_address(ip_str)
        if (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        ):
            raise ValueError("Запрещён доступ к приватным IP-адресам.")

    try:
        _check_ip(host)
    except ValueError as exc:
        if "Запрещён доступ" in str(exc):
            raise
        # Не IP-литерал: резолвим DNS и проверяем все адреса
        try:
            infos = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
        except socket.gaierror as gai_exc:
            raise ValueError(f"Не удалось разрешить хост {host}.") from gai_exc
        for info in infos:
            ip_part = info[4][0].split("%", 1)[0]
            _check_ip(ip_part)

    return url
