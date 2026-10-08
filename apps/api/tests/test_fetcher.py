import pytest
import gzip
import zlib
import httpx
from app.services.engine.fetcher import fetch_page, decode_response_html

try:
    import brotli  # type: ignore
except ImportError:
    brotli = None


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


def test_decode_response_html_gzip():
    sample = "<html><body><h1>Hello Gzip</h1></body></html>"
    compressed = gzip.compress(sample.encode("utf-8"))
    resp = httpx.Response(200, content=compressed, headers={"content-encoding": "gzip"})
    decoded = decode_response_html(resp)
    assert "Hello Gzip" in decoded


def test_decode_response_html_brotli():
    if brotli is None:
        pytest.skip("brotli not installed")
    sample = "<html><body><h1>Hello Brotli</h1></body></html>"
    compressed = brotli.compress(sample.encode("utf-8"))
    resp = httpx.Response(200, content=compressed, headers={"content-encoding": "br"})
    decoded = decode_response_html(resp)
    assert "Hello Brotli" in decoded

