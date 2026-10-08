import os
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.database import init_db


@pytest.fixture
def ecommerce_html():
    fixture_path = os.path.join(os.path.dirname(__file__), "fixtures", "ecommerce_catalog.html")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return f.read()


@pytest.mark.asyncio
async def test_health_route():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/health")
        assert resp.status_code == 200
        assert resp.json()["status"] == "healthy"


@pytest.mark.asyncio
async def test_detect_route_with_html_override(ecommerce_html):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/v1/detect",
            json={
                "url": "https://example.com/store",
                "html_override": ecommerce_html
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["total_categories"] >= 1
        assert len(data["categories"]) >= 1


@pytest.mark.asyncio
async def test_preview_route(ecommerce_html):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/v1/preview",
            json={
                "url": "https://example.com/store",
                "html_override": ecommerce_html
            }
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "<base href=\"https://example.com/store\">" in data["sanitized_html"]
        assert "__pith_hover_highlight" in data["sanitized_html"]
