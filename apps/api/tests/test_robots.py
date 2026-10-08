import os
import pytest
from app.services.safety.robots import parse_robots_txt_content


@pytest.fixture
def sample_robots_content():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "robots_samples.txt")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return f.read()


def test_robots_txt_specific_agent_allowed(sample_robots_content):
    allowed, delay, sitemaps, rule = parse_robots_txt_content(
        sample_robots_content, "/catalog/products", user_agent="PithBot"
    )
    assert allowed is True
    assert delay == 2.0


def test_robots_txt_specific_agent_disallowed(sample_robots_content):
    allowed, delay, sitemaps, rule = parse_robots_txt_content(
        sample_robots_content, "/admin/dashboard", user_agent="PithBot"
    )
    assert allowed is False
    assert rule == "Disallow: /admin/"


def test_robots_txt_wildcard_fallback(sample_robots_content):
    # Other agents follow '*' section
    allowed, delay, sitemaps, rule = parse_robots_txt_content(
        sample_robots_content, "/internal/logs", user_agent="GenericBot"
    )
    assert allowed is False
    assert delay == 5.0
    assert "https://example.com/sitemap.xml" in sitemaps
