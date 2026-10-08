import pytest
from app.services.engine.cleaner import clean_dataset, clean_whitespace, normalize_price, normalize_date


def test_clean_whitespace():
    assert clean_whitespace("   hello    world\n\t  ") == "hello world"


def test_normalize_price():
    p1 = normalize_price("$1,299.99")
    assert isinstance(p1, dict)
    assert p1["amount"] == 1299.99
    assert p1["currency"] == "USD"

    p2 = normalize_price("49.00 EUR")
    assert p2["amount"] == 49.0
    assert p2["currency"] == "EUR"


def test_normalize_date():
    d1 = normalize_date("October 5, 2026")
    assert d1 == "2026-10-05"

    d2 = normalize_date("2026/09/28")
    assert d2 == "2026-09-28"


def test_clean_dataset_pipeline():
    raw_rows = [
        {"title": "  Item A  ", "price": "$100.00", "link": "/item/a"},
        {"title": "Item A", "price": "$100.00", "link": "/item/a"},  # Duplicate
        {"title": "Item B", "price": "$250.50", "link": "/item/b"}
    ]

    cleaned, stats = clean_dataset(
        raw_rows,
        base_url="https://example.com",
        trim_whitespace_enabled=True,
        remove_duplicates_enabled=True,
        normalize_prices_enabled=True,
        normalize_dates_enabled=True,
        make_urls_absolute_enabled=True
    )

    assert len(cleaned) == 2
    assert stats["duplicates_removed"] == 1
    assert cleaned[0]["link"] == "https://example.com/item/a"
    assert cleaned[0]["price"]["amount"] == 100.0
