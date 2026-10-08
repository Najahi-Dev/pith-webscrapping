import asyncio
import hashlib
from typing import Dict, Optional, Tuple
import httpx
from app.core.config import settings
from app.services.safety.url_guard import validate_url, safe_redirect_hook, URLValidationError


class FetchResult:
    def __init__(
        self,
        url: str,
        status_code: int,
        html: str,
        headers: Dict[str, str],
        method_used: str,
        duration_ms: int,
        content_hash: str,
        error: Optional[str] = None
    ):
        self.url = url
        self.status_code = status_code
        self.html = html
        self.headers = headers
        self.method_used = method_used
        self.duration_ms = duration_ms
        self.content_hash = content_hash
        self.error = error


async def fetch_page(
    url: str,
    method: str = "http",
    custom_headers: Optional[Dict[str, str]] = None,
    timeout: float = settings.REQUEST_TIMEOUT_SECONDS
) -> FetchResult:
    """
    Fetches a web page safely with SSRF protection, custom headers, and timeout.
    Supports 'http' (httpx) and 'playwright' (headless browser for SPA).
    """
    is_valid, resolved_ip, err = validate_url(url)
    if not is_valid:
        return FetchResult(
            url=url,
            status_code=400,
            html="",
            headers={},
            method_used=method,
            duration_ms=0,
            content_hash="",
            error=f"SSRF Safety Guard: {err}"
        )

    headers = {
        "User-Agent": settings.DEFAULT_USER_AGENT,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
        **(custom_headers or {})
    }

    start_time = asyncio.get_event_loop().time()

    if method == "playwright":
        try:
            from playwright.async_api import async_playwright
            from urllib.parse import urlparse

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent=headers.get("User-Agent", settings.DEFAULT_USER_AGENT),
                    extra_http_headers=headers
                )

                # If custom Cookie header exists, also parse and add to cookies collection
                cookie_str = headers.get("Cookie") or headers.get("cookie") or ""
                if cookie_str:
                    try:
                        domain = urlparse(url).hostname or ""
                        parsed_cookies = []
                        for part in cookie_str.split(";"):
                            if "=" in part:
                                c_name, c_val = part.strip().split("=", 1)
                                if c_name.strip():
                                    parsed_cookies.append({
                                        "name": c_name.strip(),
                                        "value": c_val.strip(),
                                        "domain": domain,
                                        "path": "/"
                                    })
                        if parsed_cookies:
                            await context.add_cookies(parsed_cookies)
                    except Exception as e:
                        print(f"[Fetcher] Cookie parse warning: {e}")

                page = await context.new_page()
                resp = await page.goto(url, wait_until="domcontentloaded", timeout=int(timeout * 1000))
                
                # Wait for any dynamic DOM content to render
                await page.wait_for_timeout(1500)
                html = await page.content()
                status = resp.status if resp else 200
                response_headers = resp.headers if resp else {}
                await browser.close()
                
                duration = int((asyncio.get_event_loop().time() - start_time) * 1000)
                content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
                
                return FetchResult(
                    url=url,
                    status_code=status,
                    html=html,
                    headers=response_headers,
                    method_used="playwright",
                    duration_ms=duration,
                    content_hash=content_hash
                )
        except Exception as e:
            print(f"[Fetcher] Playwright fetch exception: {e}")
            pass

    # Standard HTTP fetch with httpx
    try:
        async with httpx.AsyncClient(
            event_hooks={"response": [safe_redirect_hook]},
            follow_redirects=True,
            timeout=timeout
        ) as client:
            resp = await client.get(url, headers=headers)
            html = resp.text
            duration = int((asyncio.get_event_loop().time() - start_time) * 1000)
            content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()
            
            return FetchResult(
                url=str(resp.url),
                status_code=resp.status_code,
                html=html,
                headers=dict(resp.headers),
                method_used="http",
                duration_ms=duration,
                content_hash=content_hash
            )
    except URLValidationError as e:
        return FetchResult(
            url=url,
            status_code=403,
            html="",
            headers={},
            method_used="http",
            duration_ms=0,
            content_hash="",
            error=str(e)
        )
    except Exception as e:
        duration = int((asyncio.get_event_loop().time() - start_time) * 1000)
        return FetchResult(
            url=url,
            status_code=500,
            html="",
            headers={},
            method_used="http",
            duration_ms=duration,
            content_hash="",
            error=f"Fetch failed: {str(e)}"
        )
