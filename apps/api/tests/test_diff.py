import pytest
from app.services.alerts.diff_engine import compare_datasets


def test_diff_engine_detects_changes_and_alerts():
    prev_rows = [
        {"url": "https://example.com/p1", "title": "Keyboard", "price": {"amount": 100.0, "currency": "USD"}},
        {"url": "https://example.com/p2", "title": "Mouse", "price": {"amount": 50.0, "currency": "USD"}}
    ]

    curr_rows = [
        # Price dropped on Keyboard
        {"url": "https://example.com/p1", "title": "Keyboard", "price": {"amount": 79.99, "currency": "USD"}},
        # New item Monitor added
        {"url": "https://example.com/p3", "title": "Monitor 4K", "price": {"amount": 399.0, "currency": "USD"}}
        # Mouse removed
    ]

    rules = [
        {"type": "price_dropped"},
        {"type": "new_item"},
        {"type": "item_removed"}
    ]

    diff = compare_datasets(prev_rows, curr_rows, key_field="url", rules=rules)

    assert diff["added_count"] == 1
    assert diff["removed_count"] == 1
    assert diff["modified_count"] == 1
    assert len(diff["alerts"]) >= 2
    assert any("Price dropped" in a for a in diff["alerts"])
    assert any("New item added" in a for a in diff["alerts"])
