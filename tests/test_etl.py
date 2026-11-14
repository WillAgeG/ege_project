"""Тесты ETL-слоя, Polars-пайплайнов (Medallion) и Sales-аналитики."""

import json
from pathlib import Path
import pytest

from etl.pipelines.tutors_polars_pipeline import (
    build_gold_subject_mart,
    build_silver_tutors,
    has_polars,
    write_gold_parquet,
)
from etl.sales.sales_metrics import (
    COMMISSION_PCT,
    TUTOR_PAYOUT_PCT,
    SalesEvent,
    commission_split,
    summarize_sales,
)
from etl.sources.ykt_tg_max_schema import (
    RawTutorListing,
    is_slot_available,
    normalize_listing,
    parse_hour_slot,
)


def _sample_listings() -> list[RawTutorListing]:
    return [
        RawTutorListing(
            external_id="ykt-101",
            source="doska_ykt",
            full_name="Анна  Соколова",
            subject="english",
            offered_price_rub=1200,
            market_price_rub=1650,
            available_from="10:00",
            available_to="18:00",
        ),
        # Дубликат той же анкеты с другого вызова парсера должен отфильтровываться в Silver
        RawTutorListing(
            external_id="ykt-101",
            source="doska_ykt",
            full_name="Анна Соколова",
            subject="english",
            offered_price_rub=1200,
            market_price_rub=1650,
        ),
        RawTutorListing(
            external_id="tg-202",
            source="telegram",
            full_name="Дмитрий Волков",
            subject="english",
            offered_price_rub=2300,
            market_price_rub=1800,
            available_from="12:00",
            available_to="20:00",
        ),
        RawTutorListing(
            external_id="max-303",
            source="max",
            full_name="Роман Лебедев",
            subject="python",
            offered_price_rub=1100,
            market_price_rub=1900,
        ),
    ]


def test_source_schema_slots_and_normalization() -> None:
    assert parse_hour_slot("10:00") == 10
    assert parse_hour_slot("20:00") == 20
    with pytest.raises(ValueError):
        parse_hour_slot("09:00")
    with pytest.raises(ValueError):
        parse_hour_slot("21:00")

    listing = _sample_listings()[0]
    assert is_slot_available(listing, "15:00") is True
    assert is_slot_available(listing, "19:00") is False

    normalized = normalize_listing(listing)
    assert normalized["full_name"] == "Анна Соколова"
    assert normalized["price_tier"] == "below_market"
    assert normalized["price_diff_rub"] == -450

    with pytest.raises(ValueError):
        normalize_listing(
            {
                "external_id": "bad-1",
                "source": "unknown",
                "full_name": "Тест",
                "subject": "math",
                "offered_price_rub": 1000,
                "market_price_rub": 1200,
            }
        )


def test_polars_pipeline_silver_dedup_and_gold_mart(tmp_path: Path) -> None:
    sample = _sample_listings()
    silver = build_silver_tutors(sample)
    silver_rows = silver.to_dicts() if has_polars() else silver
    assert len(silver_rows) == 3

    gold = build_gold_subject_mart(sample)
    assert len(gold) == 2
    by_subj = {row["subject"]: row for row in gold}

    eng = by_subj["english"]
    assert eng["tutor_count"] == 2
    assert eng["min_offered_rub"] == 1200
    assert eng["median_offered_rub"] == 1750.0
    assert eng["above_market_count"] == 1

    py = by_subj["python"]
    assert py["tutor_count"] == 1
    assert py["above_market_count"] == 0

    if not has_polars():
        with pytest.raises(RuntimeError):
            write_gold_parquet(sample, tmp_path / "gold.parquet")
    else:
        out_path = write_gold_parquet(sample, tmp_path / "gold.parquet")
        assert out_path.is_file()


def test_sales_commission_split_and_summary() -> None:
    assert COMMISSION_PCT == 5
    assert TUTOR_PAYOUT_PCT == 95
    assert commission_split(800) == {"total": 800, "payout": 760, "fee": 40, "pct": 5}
    assert commission_split(2000) == {"total": 2000, "payout": 1900, "fee": 100, "pct": 5}

    summary = summarize_sales(
        [
            SalesEvent("e-1", "free", "english", 800, "confirmed"),
            SalesEvent("e-2", "trial5k", "python", 2000, "confirmed"),
            SalesEvent("e-3", "month10k", "biology", 1500, "offered"),
        ]
    )
    assert summary["total_events"] == 3
    assert summary["confirmed_count"] == 2
    assert summary["gmv_rub"] == 2800
    assert summary["platform_fee_rub"] == 140
    assert summary["tutor_payout_rub"] == 2660
    assert summary["avg_confirmed_check_rub"] == 1400.0
    assert summary["by_tariff"]["free"]["fee_rub"] == 40
    assert summary["by_tariff"]["trial5k"]["gmv_rub"] == 2000


def test_ux_ui_tokens_manifest_is_valid_json() -> None:
    tokens_path = Path(__file__).resolve().parent.parent / "ux-ui" / "tokens.json"
    data = json.loads(tokens_path.read_text(encoding="utf-8"))
    assert data["themes"]["light"]["accent"] == "#0070FF"
    assert data["themes"]["dark"]["accent"] == "#1D7BFF"
    assert data["themes"]["light"]["notificationOrange"] == "#F97316"
    assert data["controls"]["sliderHours"] == {"min": 10, "max": 20, "step": 1, "variants": ["clean", "ticks", "ruler"]}
