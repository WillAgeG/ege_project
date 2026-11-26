"""Форматирование, русские словари статусов, CSS-полировка и Altair-графики для Streamlit-админки."""

from __future__ import annotations

from datetime import datetime
from typing import Any

REASON_LABELS = {
    "first_lesson_guarantee": "Гарантия 1-го урока",
    "no_show": "Репетитор не вышел на связь",
    "quality": "Не подошёл формат",
    "tech_issue": "Технический сбой",
    "other": "Другая причина",
}

DISPUTE_STATUS_LABELS = {
    "open": "Открыт",
    "refunded": "Возврат 100%",
    "rejected": "Отклонён",
    "resolved": "Решён",
}
DISPUTE_STATUS_BADGES = {
    "open": "🟡 Открыт",
    "refunded": "🟢 Возврат 100%",
    "rejected": "⚪ Отклонён",
    "resolved": "🟢 Решён",
}

REQUEST_STATUS_LABELS = {
    "pending": "Ждёт ответа",
    "offered": "Ждёт ответа",
    "countered": "Встречная ставка",
    "accepted": "Подтверждена",
    "completed": "Завершён",
    "declined": "Отклонена",
    "cancelled": "Отменена",
    "refunded": "Возврат средств",
}
REQUEST_STATUS_BADGES = {
    "pending": "🟡 Ждёт ответа",
    "offered": "🟡 Ждёт ответа",
    "countered": "💬 Встречная ставка",
    "accepted": "🟢 Подтверждена",
    "completed": "🎓 Завершён",
    "declined": "🔴 Отклонена",
    "cancelled": "⚪ Отменена",
    "refunded": "↩️ Возврат средств",
}

ESCROW_LABELS = {
    "none": "Без резерва",
    "frozen": "В резерве",
    "captured": "К выплате / проведено",
    "refunded": "Возвращено",
}
ESCROW_BADGES = {
    "none": "⚪ Без резерва",
    "frozen": "🔒 В резерве",
    "captured": "🟢 К выплате",
    "refunded": "↩️ Возвращено",
}

PAYOUT_STATUS_LABELS = {
    "processing": "В обработке",
    "pending": "Ожидает",
    "succeeded": "Выплачено",
    "paid": "Выплачено",
    "rejected": "Отклонено",
    "failed": "Ошибка",
}
PAYOUT_STATUS_BADGES = {
    "processing": "🟡 В обработке",
    "pending": "🟡 Ожидает",
    "succeeded": "🟢 Выплачено",
    "paid": "🟢 Выплачено",
    "rejected": "🔴 Отклонено",
    "failed": "🔴 Ошибка",
}

ROLE_LABELS = {
    "student": "Ученик",
    "tutor": "Преподаватель",
    "admin": "Админ",
}
ROLE_BADGES = {
    "student": "🎓 Ученик",
    "tutor": "🧑‍🏫 Преподаватель",
    "admin": "🛡 Админ",
}

CHANNEL_LABELS = {
    "platform": "Платформа",
    "doska_ykt": "Доска Ykt",
    "telegram": "Telegram",
    "whatsapp": "WhatsApp",
    "max": "MAX",
}

METHOD_LABELS = {
    "sbp": "СБП",
    "card": "Карта Мир",
}

AUTH_PROVIDER_LABELS = {
    "local": "Логин / пароль",
    "phone": "Телефон OTP",
    "telegram": "Telegram",
    "google": "Google",
}


def fmt_rub(value: Any) -> str:
    """Форматирует сумму в рублях: 3500 -> '3 500 ₽'."""
    try:
        num = int(round(float(value or 0)))
    except (TypeError, ValueError):
        num = 0
    return f"{num:,} ₽".replace(",", " ")


def _format_dt(raw: Any, *, short: bool = False) -> str:
    if raw is None or raw == "":
        return "—"
    dt_fmt = "%d.%m %H:%M" if short else "%d.%m.%Y %H:%M"
    d_fmt = "%d.%m" if short else "%d.%m.%Y"
    if isinstance(raw, (int, float)):
        try:
            return datetime.fromtimestamp(float(raw)).strftime(dt_fmt)
        except (OSError, OverflowError, ValueError):
            return "—"
    s = str(raw).strip()
    if not s or s == "—":
        return "—"
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        try:
            return datetime.strptime(s, "%Y-%m-%d").strftime(d_fmt)
        except ValueError:
            return s
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00")).strftime(dt_fmt)
    except ValueError:
        return s[:16].replace("T", " ")


def fmt_dt(raw: Any) -> str:
    """Приводит ISO-строку или unix timestamp к читаемому виду ДД.ММ.ГГГГ ЧЧ:ММ."""
    return _format_dt(raw, short=False)


def fmt_dt_short(raw: Any) -> str:
    """Короткий формат даты/времени для компактных таблиц: ДД.ММ ЧЧ:ММ."""
    return _format_dt(raw, short=True)


def selected_row_idx(event: Any, length: int) -> int:
    """Безопасно извлекает индекс выбранной строки из st.dataframe(on_select='rerun')."""
    if length <= 0:
        return 0
    try:
        rows = event.selection.rows
        if rows:
            idx = int(rows[0])
            if 0 <= idx < length:
                return idx
    except (AttributeError, IndexError, TypeError, ValueError):
        pass
    return 0


def csv_bytes(df: Any) -> bytes:
    return df.to_csv(index=False).encode("utf-8-sig")


def filter_df(df: Any, query: str, columns: list[str]) -> Any:
    import pandas as pd

    q = (query or "").strip().lower()
    if not q or df.empty:
        return df
    present = [c for c in columns if c in df.columns]
    if not present:
        return df
    mask = pd.Series(False, index=df.index)
    for col in present:
        mask = mask | df[col].astype(str).str.lower().str.contains(q, regex=False, na=False)
    return df[mask]


def prepare_gmv_rows(daily_series: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Готовит нормированные строки по дням без двойного учёта GMV = Payout + Fee + SBP."""
    out: list[dict[str, Any]] = []
    for item in daily_series or []:
        raw_date = str(item.get("date") or "")
        gmv = int(item.get("gmvRub") or 0)
        fee = int(item.get("feeRub") or 0)
        raw_sbp = item.get("sbpFeeRub")
        raw_payout = item.get("payoutRub")
        if raw_sbp is not None:
            sbp_fee = int(raw_sbp)
        elif raw_payout is not None:
            sbp_fee = max(0, gmv - fee - int(raw_payout))
        else:
            sbp_fee = (gmv * 1 + 50) // 100
        payout = int(raw_payout) if raw_payout is not None else max(0, gmv - fee - sbp_fee)
        reqs = int(item.get("requests") or 0)
        acc = int(item.get("accepted") or 0)
        try:
            short_date = datetime.strptime(raw_date[:10], "%Y-%m-%d").strftime("%d.%m")
        except ValueError:
            short_date = raw_date
        out.append(
            {
                "date": raw_date,
                "label": short_date,
                "gmvRub": gmv,
                "payoutRub": payout,
                "feeRub": fee,
                "sbpFeeRub": sbp_fee,
                "requests": reqs,
                "accepted": acc,
            }
        )
    return out


def prepare_channel_rows(channel_share: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Готовит отсортированные строки каналов привлечения репетиторов с русскими метками."""
    out: list[dict[str, Any]] = []
    for item in channel_share or []:
        code = str(item.get("channel") or "platform")
        cnt = int(item.get("count") or 0)
        pct = float(item.get("sharePct") or 0.0)
        out.append(
            {
                "code": code,
                "Канал": CHANNEL_LABELS.get(code, code),
                "Анкет": cnt,
                "Доля %": round(pct, 1),
                "Метка": f"{cnt} ({pct:.0f}%)",
            }
        )
    out.sort(key=lambda r: (-r["Анкет"], r["Канал"]))
    return out


def build_gmv_chart(daily_series: list[dict[str, Any]], mode: str = "money") -> Any:
    """Строит Altair-график по дням: stacked (Выплаты 94% + Комиссия 5% + СБП 1% = GMV) или Заявки/Принято."""
    import altair as alt
    import pandas as pd

    rows = prepare_gmv_rows(daily_series)
    if not rows:
        return None
    df = pd.DataFrame(rows)

    if mode == "count":
        melted = df.melt(
            id_vars=["label", "date"],
            value_vars=["requests", "accepted"],
            var_name="metric",
            value_name="count",
        )
        melted["Показатель"] = melted["metric"].map({"requests": "Всего заявок", "accepted": "Подтверждено"})
        return (
            alt.Chart(melted)
            .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4)
            .encode(
                x=alt.X("label:N", sort=list(df["label"]), title=None, axis=alt.Axis(labelAngle=0)),
                y=alt.Y("count:Q", title="Заявки, шт.", axis=alt.Axis(tickMinStep=1)),
                xOffset="Показатель:N",
                color=alt.Color(
                    "Показатель:N",
                    scale=alt.Scale(
                        domain=["Всего заявок", "Подтверждено"],
                        range=["#CBD5E1", "#0070FF"],
                    ),
                    legend=alt.Legend(orient="top", title=None, labelLimit=240),
                ),
                tooltip=[
                    alt.Tooltip("date:N", title="Дата"),
                    alt.Tooltip("Показатель:N", title="Метрика"),
                    alt.Tooltip("count:Q", title="Штук"),
                ],
            )
            .properties(height=270)
            .configure_view(strokeWidth=0)
        )

    # Stacked: Выплаты 94% + Комиссия 5% + Шлюз СБП 1% = 100% GMV
    melted = df.melt(
        id_vars=["label", "date", "gmvRub", "requests", "accepted"],
        value_vars=["payoutRub", "feeRub", "sbpFeeRub"],
        var_name="part",
        value_name="amount",
    )
    melted["Составляющая"] = melted["part"].map(
        {
            "payoutRub": "Репетиторам 94%",
            "feeRub": "Комиссия 5%",
            "sbpFeeRub": "Шлюз СБП 1%",
        }
    )
    return (
        alt.Chart(melted)
        .mark_bar(cornerRadiusTopLeft=4, cornerRadiusTopRight=4)
        .encode(
            x=alt.X("label:N", sort=list(df["label"]), title=None, axis=alt.Axis(labelAngle=0)),
            y=alt.Y("sum(amount):Q", title="GMV, ₽"),
            color=alt.Color(
                "Составляющая:N",
                scale=alt.Scale(
                    domain=["Репетиторам 94%", "Комиссия 5%", "Шлюз СБП 1%"],
                    range=["#0070FF", "#16A34A", "#94A3B8"],
                ),
                legend=alt.Legend(orient="top", title=None, labelLimit=240),
            ),
            tooltip=[
                alt.Tooltip("date:N", title="Дата"),
                alt.Tooltip("gmvRub:Q", title="Оборот GMV (₽)", format=",.0f"),
                alt.Tooltip("Составляющая:N", title="Часть"),
                alt.Tooltip("amount:Q", title="Сумма (₽)", format=",.0f"),
                alt.Tooltip("accepted:Q", title="Подтверждено заявок"),
            ],
        )
        .properties(height=270)
        .configure_view(strokeWidth=0)
    )


def build_channels_chart(channel_share: list[dict[str, Any]]) -> Any:
    """Горизонтальный Altair bar chart по источникам анкет с подписями количества и %."""
    import altair as alt
    import pandas as pd

    rows = prepare_channel_rows(channel_share)
    if not rows:
        return None
    df = pd.DataFrame(rows)
    bars = (
        alt.Chart(df)
        .mark_bar(cornerRadiusTopRight=5, cornerRadiusBottomRight=5, color="#0070FF", height=22)
        .encode(
            y=alt.Y("Канал:N", sort="-x", title=None, axis=alt.Axis(labelLimit=130)),
            x=alt.X("Анкет:Q", title="Анкет репетиторов", axis=alt.Axis(tickMinStep=1)),
            tooltip=[
                alt.Tooltip("Канал:N", title="Источник"),
                alt.Tooltip("Анкет:Q", title="Анкет"),
                alt.Tooltip("Доля %:Q", title="Доля (%)"),
            ],
        )
    )
    labels = (
        alt.Chart(df)
        .mark_text(align="left", baseline="middle", dx=6, fontSize=12, color="#3D424D")
        .encode(
            y=alt.Y("Канал:N", sort="-x"),
            x=alt.X("Анкет:Q"),
            text="Метка:N",
        )
    )
    return (bars + labels).properties(height=270).configure_view(strokeWidth=0)


def inject_styles() -> None:
    """Внедряет аккуратную визуальную полировку, табличные цифры и скрывает лишний dev-хром."""
    import streamlit as st

    st.markdown(
        """
        <style>
        #MainMenu, footer, [data-testid="stAppDeployButton"] { display: none !important; }
        .block-container {
            padding-top: 1.4rem !important;
            padding-bottom: 2.2rem !important;
            max-width: 1400px;
        }
        [data-testid="stSidebarContent"] {
            padding-top: 1.2rem !important;
        }
        [data-testid="stMetricValue"] {
            font-size: 1.55rem !important;
            font-weight: 700 !important;
            font-variant-numeric: tabular-nums;
            line-height: 1.2 !important;
        }
        [data-testid="stMetricLabel"] {
            font-size: 0.82rem !important;
            color: #5E6472 !important;
        }
        div[data-testid="stSidebar"] button[kind="primary"],
        div[data-testid="stSidebar"] button[kind="secondary"] {
            justify-content: flex-start !important;
            text-align: left !important;
            border-radius: 10px !important;
            padding: 0.48rem 0.78rem !important;
            font-weight: 500 !important;
        }
        div[data-testid="stSidebar"] button[kind="primary"] > div,
        div[data-testid="stSidebar"] button[kind="secondary"] > div {
            width: 100%;
            display: flex;
            justify-content: flex-start;
        }
        div[data-testid="stSidebar"] button[kind="primary"] {
            font-weight: 600 !important;
        }
        .adm-card-title {
            font-size: 0.95rem;
            font-weight: 700;
            margin: 0 0 4px 0;
            color: #141517;
        }
        .adm-muted {
            font-size: 0.84rem;
            color: #5E6472;
        }
        </style>
        """,
        unsafe_allow_html=True,
    )
