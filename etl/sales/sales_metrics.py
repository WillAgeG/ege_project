"""Расчёт unit-экономики, GMV, 5% комиссии платформы и воронки тарифов."""

from dataclasses import dataclass
from typing import Any

COMMISSION_PCT = 5
TUTOR_PAYOUT_PCT = 95
TARIFF_PRICES_RUB: dict[str, int] = {
    "free": 0,
    "trial5k": 5000,
    "month10k": 10000,
}

try:
    import polars as pl
except ImportError:  # pragma: no cover - облегчённый web-профиль без Polars
    pl = None  # type: ignore[assignment]


@dataclass(frozen=True)
class SalesEvent:
    """Событие отклика/оплаты урока или подписки."""

    event_id: str
    tariff_id: str
    subject: str
    gross_amount_rub: int
    status: str  # offered | confirmed | refunded


def commission_split(price_rub: int) -> dict[str, int]:
    """Делит ставку на выплату преподавателю (95%) и системный сбор (5%).

    Формула синхронизирована с frontend/data/tutors.js (EGE.tutors.commissionSplit).
    """
    total = max(0, round(int(price_rub)))
    fee = round(total * COMMISSION_PCT / 100)
    return {
        "total": total,
        "payout": total - fee,
        "fee": fee,
        "pct": COMMISSION_PCT,
    }


def summarize_sales(events: list[SalesEvent | dict[str, Any]]) -> dict[str, Any]:
    """Считает GMV, комиссию платформы 5%, выплату преподавателям 95% и конверсию."""
    normalized: list[dict[str, Any]] = []
    for item in events:
        raw = item.__dict__ if isinstance(item, SalesEvent) else dict(item)
        tariff = str(raw["tariff_id"]).strip()
        if tariff not in TARIFF_PRICES_RUB:
            raise ValueError(f"Неизвестный тариф '{tariff}'.")
        gross = int(raw["gross_amount_rub"])
        status = str(raw["status"]).strip().lower()
        split = commission_split(gross) if status == "confirmed" else {"fee": 0, "payout": 0}
        normalized.append(
            {
                "tariff_id": tariff,
                "subject": str(raw["subject"]).strip().lower(),
                "status": status,
                "gross_amount_rub": gross,
                "fee_rub": split["fee"],
                "payout_rub": split["payout"],
            }
        )

    if not normalized:
        return {
            "total_events": 0,
            "confirmed_count": 0,
            "conversion_rate": 0.0,
            "gmv_rub": 0,
            "platform_fee_rub": 0,
            "tutor_payout_rub": 0,
            "avg_confirmed_check_rub": 0.0,
            "by_tariff": {},
        }

    if pl is not None:
        df = pl.DataFrame(normalized)
        confirmed = df.filter(pl.col("status") == "confirmed")
        confirmed_count = confirmed.height
        gmv = int(confirmed["gross_amount_rub"].sum()) if confirmed_count else 0
        fee = int(confirmed["fee_rub"].sum()) if confirmed_count else 0
        payout = int(confirmed["payout_rub"].sum()) if confirmed_count else 0
        tariff_rows = (
            confirmed.lazy()
            .group_by("tariff_id")
            .agg(
                pl.len().alias("count"),
                pl.col("gross_amount_rub").sum().alias("gmv_rub"),
                pl.col("fee_rub").sum().alias("fee_rub"),
            )
            .sort("tariff_id")
            .collect()
            .to_dicts()
        )
        by_tariff = {
            r["tariff_id"]: {"count": r["count"], "gmv_rub": r["gmv_rub"], "fee_rub": r["fee_rub"]}
            for r in tariff_rows
        }
    else:
        confirmed_rows = [r for r in normalized if r["status"] == "confirmed"]
        confirmed_count = len(confirmed_rows)
        gmv = sum(r["gross_amount_rub"] for r in confirmed_rows)
        fee = sum(r["fee_rub"] for r in confirmed_rows)
        payout = sum(r["payout_rub"] for r in confirmed_rows)
        by_tariff = {}
        for row in confirmed_rows:
            bucket = by_tariff.setdefault(row["tariff_id"], {"count": 0, "gmv_rub": 0, "fee_rub": 0})
            bucket["count"] += 1
            bucket["gmv_rub"] += row["gross_amount_rub"]
            bucket["fee_rub"] += row["fee_rub"]

    total_events = len(normalized)
    return {
        "total_events": total_events,
        "confirmed_count": confirmed_count,
        "conversion_rate": round(confirmed_count / total_events, 4),
        "gmv_rub": gmv,
        "platform_fee_rub": fee,
        "tutor_payout_rub": payout,
        "avg_confirmed_check_rub": round(gmv / confirmed_count, 2) if confirmed_count else 0.0,
        "by_tariff": by_tariff,
    }
