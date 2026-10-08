import pytest
from app.services.engine.fetcher import fetch_page


@pytest.mark.asyncio
async def test_fetch_page_ssrf_blocked():
    res = await fetch_page("http://127.0.0.1/admin")
    assert res.status_code == 400
    assert "SSRF" in res.error


@pytest.mark.asyncio
async def test_fetch_page_valid_public():
    res = await fetch_page("https://example.com")
    assert res.error is None
    assert res.status_code == 200
    assert len(res.html) > 0
    assert res.duration_ms > 0
