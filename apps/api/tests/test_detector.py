import os
import pytest
from selectolax.lexbor import LexborHTMLParser as HTMLParser
from app.services.detector.extractor import (
    extract_tables, extract_links, extract_images, extract_entities, extract_structured_json_ld
)
from app.services.detector.pattern_engine import auto_detect_patterns


@pytest.fixture
def ecommerce_html():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "ecommerce_catalog.html")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return f.read()


@pytest.fixture
def table_html():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "data_table.html")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return f.read()


def test_auto_detect_product_patterns(ecommerce_html):
    patterns = auto_detect_patterns(ecommerce_html, "https://example.com/store")
    assert len(patterns) >= 1
    
    prod_pattern = patterns[0]
    assert prod_pattern["count"] == 3
    assert "title" in prod_pattern["field_names"]
    assert "price" in prod_pattern["field_names"]
    assert len(prod_pattern["sample_rows"]) == 3
    assert "129.99" in prod_pattern["sample_rows"][0]["price"]


def test_table_extractor(table_html):
    tree = HTMLParser(table_html)
    tables = extract_tables(tree, "https://example.com/finance")
    assert len(tables) == 1
    
    t = tables[0]
    assert t["row_count"] == 3
    assert "Ticker" in t["headers"]
    assert "Price" in t["headers"]
    assert t["rows"][0]["Ticker"] == "AAPL"


def test_entity_extractor(ecommerce_html):
    tree = HTMLParser(ecommerce_html)
    entities = extract_entities(tree.text() or "")
    assert "support@techgear.io" in entities["emails"]
    assert any("555-0199" in p for p in entities["phone_numbers"])


def test_json_ld_extractor(ecommerce_html):
    items = extract_structured_json_ld(ecommerce_html, "https://example.com/store")
    assert len(items) >= 1
    assert items[0].get("name") == "Mechanical Keyboard RGB"
