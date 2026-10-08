import os
import pytest
from app.services.scorer.scrapability import evaluate_scrapability


@pytest.fixture
def ecommerce_html():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "ecommerce_catalog.html")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return f.read()


@pytest.fixture
def spa_html():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "js_spa_page.html")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return f.read()


def test_scorer_easy_static_catalog(ecommerce_html):
    res = evaluate_scrapability(
        status_code=200,
        headers={"content-type": "text/html"},
        html=ecommerce_html,
        robots_allowed=True,
        robots_reason="Allowed by robots.txt"
    )
    assert res.score >= 75
    assert res.level == "easy"
    assert res.recommended_method == "http"
    assert res.allow_scraping is True


def test_scorer_spa_requires_playwright(spa_html):
    res = evaluate_scrapability(
        status_code=200,
        headers={"content-type": "text/html"},
        html=spa_html,
        robots_allowed=True
    )
    assert res.recommended_method == "playwright"
    assert res.factors["js_required"] is True


def test_scorer_bot_protection():
    cloudflare_block_html = "<html><head><title>Just a moment...</title><script src='/cdn-cgi/challenge-platform/turnstile.js'></script></head><body>cf-browser-verification</body></html>"
    res = evaluate_scrapability(
        status_code=403,
        headers={"server": "cloudflare"},
        html=cloudflare_block_html,
        robots_allowed=True
    )
    assert res.level == "hard"
    assert res.factors["has_bot_protection"] is True
    assert res.allow_scraping is False
