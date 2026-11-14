"""Пайплайн обработки анкет репетиторов на Polars (LazyFrame) с zero-dep fallback."""

from pathlib import Path
from statistics import median
from typing import Any

from etl.sources.ykt_tg_max_schema import RawTutorListing, normalize_listing

try:
    import polars as pl
except ImportError:  # pragma: no cover - выполняется в облегчённом web-окружении без etl-зависимостей
    pl = None  # type: ignore[assignment]


def has_polars() -> bool:
    """Возвращает True, если в текущем окружении установлен Polars."""
    return pl is not None


def _normalize_records(records: list[RawTutorListing | dict[str, Any]]) -> list[dict[str, Any]]:
    seen_keys: set[tuple[str, str]] = set()
    normalized: list[dict[str, Any]] = []
    for item in records:
        row = normalize_listing(item)
        dedup_key = (row["source"], row["external_id"])
        if dedup_key in seen_keys:
            continue
        seen_keys.add(dedup_key)
        normalized.append(row)
    return normalized


def build_silver_tutors(records: list[RawTutorListing | dict[str, Any]]) -> Any:
    """Строит дедуплицированный Silver-слой (polars.DataFrame при наличии Polars, иначе list[dict])."""
    cleaned = _normalize_records(records)
    if pl is None:
        return cleaned
    return (
        pl.DataFrame(cleaned)
        .lazy()
        .unique(subset=["source", "external_id"], keep="first", maintain_order=True)
        .sort(["subject", "offered_price_rub"])
        .collect()
    )


def build_gold_subject_mart(records: list[RawTutorListing | dict[str, Any]]) -> list[dict[str, Any]]:
    """Агрегирует Gold-витрину цен и предложения по предметам через Polars LazyFrame."""
    cleaned = _normalize_records(records)
    if not cleaned:
        return []

    if pl is not None:
        df = (
            pl.DataFrame(cleaned)
            .lazy()
            .group_by("subject")
            .agg(
                pl.len().alias("tutor_count"),
                pl.col("offered_price_rub").min().alias("min_offered_rub"),
                pl.col("offered_price_rub").median().cast(pl.Float64).alias("median_offered_rub"),
                pl.col("market_price_rub").median().cast(pl.Float64).alias("median_market_rub"),
                (pl.col("price_tier") == "above_market").sum().alias("above_market_count"),
            )
            .sort("subject")
            .collect()
        )
        return df.to_dicts()

    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in cleaned:
        grouped.setdefault(row["subject"], []).append(row)

    mart: list[dict[str, Any]] = []
    for subject in sorted(grouped):
        rows = grouped[subject]
        offered = [r["offered_price_rub"] for r in rows]
        market = [r["market_price_rub"] for r in rows]
        mart.append(
            {
                "subject": subject,
                "tutor_count": len(rows),
                "min_offered_rub": min(offered),
                "median_offered_rub": float(median(offered)),
                "median_market_rub": float(median(market)),
                "above_market_count": sum(1 for r in rows if r["price_tier"] == "above_market"),
            }
        )
    return mart


def write_gold_parquet(records: list[RawTutorListing | dict[str, Any]], output_path: Path) -> Path:
    """Сохраняет Gold-витрину в Parquet (требует установленный Polars)."""
    if pl is None:
        raise RuntimeError("Для записи Parquet установите зависимости из etl/requirements-etl.txt (polars).")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    mart = build_gold_subject_mart(records)
    pl.DataFrame(mart).write_parquet(output_path)
    return output_path
