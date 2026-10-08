import asyncio
import hashlib
import time
import gzip
import zlib
from typing import Dict, Optional, Tuple, Any
from urllib.parse import urlparse
import httpx

try:
    import brotli
except ImportError:
    brotli = None

from app.core.config import settings
from app.services.safety.url_guard import validate_url, safe_redirect_hook, URLValidationError
from app.services.safety.stealth import get_random_fingerprint, generate_stealth_headers, get_stealth_evasion_script
from app.services.safety.proxy_manager import proxy_pool, ProxyNode
from app.services.safety.captcha_solver import (
    detect_captcha_in_html,
    solve_challenge,
    inject_captcha_token_into_playwright
)


def decode_response_html(resp: httpx.Response) -> str:
    """
    Safely decodes an HTTP response into clean HTML string,
    transparently decompressing gzip, deflate, and brotli payloads if needed,
    and handling charset encoding fallbacks.
    """
    raw_bytes = resp.content
    if not raw_bytes:
        return ""

    content_encoding = (resp.headers.get("content-encoding") or "").lower()

    # If raw_bytes still contains compressed streams
    # 1. GZIP check
    if "gzip" in content_encoding or (len(raw_bytes) >= 2 and raw_bytes[:2] == b"\x1f\x8b"):
        try:
            raw_bytes = gzip.decompress(raw_bytes)
        except Exception:
            pass
    # 2. Deflate / zlib check
    elif "deflate" in content_encoding or "zlib" in content_encoding:
        try:
            raw_bytes = zlib.decompress(raw_bytes)
        except Exception:
            try:
                raw_bytes = zlib.decompress(raw_bytes, -zlib.MAX_WBITS)
            except Exception:
                pass
    # 3. Brotli check
    elif "br" in content_encoding:
        if brotli is not None:
            try:
                raw_bytes = brotli.decompress(raw_bytes)
            except Exception:
                pass

    # Decode charset
    content_type = resp.headers.get("content-type", "").lower()
    charset = None
    if "charset=" in content_type:
        try:
            charset = content_type.split("charset=")[-1].split(";")[0].strip("\"' ")
        except Exception:
            charset = None

    if charset:
        try:
            return raw_bytes.decode(charset, errors="replace")
        except Exception:
            pass

    # Standard UTF-8
    try:
        return raw_bytes.decode("utf-8")
    except UnicodeDecodeError:
        pass

    # httpx detected encoding
    if resp.encoding and resp.encoding.lower() != "utf-8":
        try:
            return raw_bytes.decode(resp.encoding, errors="replace")
        except Exception:
            pass

    # Fallback to UTF-8 with replacement or latin-1
    try:
        return raw_bytes.decode("utf-8", errors="replace")
    except Exception:
        return raw_bytes.decode("latin-1", errors="replace")



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
        proxy_used: Optional[str] = None,
        captcha_solved: bool = False,
        error: Optional[str] = None
    ):
        self.url = url
        self.status_code = status_code
        self.html = html
        self.headers = headers
        self.method_used = method_used
        self.duration_ms = duration_ms
        self.content_hash = content_hash
        self.proxy_used = proxy_used
        self.captcha_solved = captcha_solved
        self.error = error


async def fetch_page(
    url: str,
    method: str = "http",
    custom_headers: Optional[Dict[str, str]] = None,
    timeout: float = settings.REQUEST_TIMEOUT_SECONDS,
    enable_stealth: bool = settings.ENABLE_STEALTH_MODE,
    proxy_url: Optional[str] = None,
    auto_rotate_proxy: bool = True,
    auto_solve_captcha: bool = True
) -> FetchResult:
    """
    Fetches a web page safely with SSRF protection, advanced stealth evasion,
    proxy pool rotation, and automated CAPTCHA solving hooks.
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

    domain = urlparse(url).hostname or ""
    fingerprint = get_random_fingerprint() if enable_stealth else None

    # Base headers with stealth client hints if enabled
    if enable_stealth and fingerprint:
        base_headers = generate_stealth_headers(fingerprint)
    else:
        base_headers = {
            "User-Agent": settings.DEFAULT_USER_AGENT,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Cache-Control": "no-cache",
        }

    headers = {**base_headers, **(custom_headers or {})}

    # Resolve Proxy
    active_proxy_node: Optional[ProxyNode] = None
    if proxy_url:
        active_proxy_node = ProxyNode(proxy_url)
    elif auto_rotate_proxy:
        active_proxy_node = proxy_pool.get_proxy(domain=domain)

    proxy_str = active_proxy_node.formatted_url if active_proxy_node else None
    start_time = time.time()
    captcha_solved_flag = False

    # -------------------------------------------------------------------------
    # 1. PLAYWRIGHT STEALTH BROWSER ENGINE
    # -------------------------------------------------------------------------
    if method == "playwright":
        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                launch_args = [
                    "--disable-blink-features=AutomationControlled",
                    "--disable-features=IsolateOrigins,site-per-process",
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-infobars",
                    "--window-position=0,0",
                    "--ignore-certificate-errors",
                ]

                browser = await p.chromium.launch(
                    headless=True,
                    args=launch_args
                )

                context_kwargs: Dict[str, Any] = {
                    "user_agent": headers.get("User-Agent", fingerprint["user_agent"] if fingerprint else settings.DEFAULT_USER_AGENT),
                    "extra_http_headers": headers,
                    "bypass_csp": True,
                    "ignore_https_errors": True,
                }

                if fingerprint:
                    context_kwargs["viewport"] = fingerprint.get("viewport", {"width": 1920, "height": 1080})
                    context_kwargs["locale"] = "en-US"
                    context_kwargs["timezone_id"] = "America/New_York"
                    context_kwargs["device_scale_factor"] = 1

                if active_proxy_node:
                    context_kwargs["proxy"] = active_proxy_node.to_playwright_proxy()

                context = await browser.new_context(**context_kwargs)

                # Inject stealth evasion scripts before any page scripts load
                if enable_stealth:
                    stealth_js = get_stealth_evasion_script(fingerprint)
                    await context.add_init_script(stealth_js)

                # Parse Cookie header if provided
                cookie_str = headers.get("Cookie") or headers.get("cookie") or ""
                if cookie_str:
                    try:
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

                # Background request drain
                try:
                    await page.wait_for_load_state("networkidle", timeout=5000)
                except Exception:
                    pass

                # Check for Cloudflare Turnstile or CAPTCHA Challenges
                html_current = await page.content()
                challenge = detect_captcha_in_html(html_current, url)

                if challenge and auto_solve_captcha and settings.CAPTCHA_SOLVER_API_KEY:
                    print(f"[Fetcher] Detected {challenge.challenge_type} on {url}. Dispatching automated solver...")
                    token = await solve_challenge(challenge)
                    if token:
                        injected = await inject_captcha_token_into_playwright(page, challenge, token)
                        if injected:
                            captcha_solved_flag = True
                            print(f"[Fetcher] Token injected! Waiting for page unlock...")
                            await page.wait_for_timeout(3000)
                            try:
                                await page.wait_for_load_state("networkidle", timeout=5000)
                            except Exception:
                                pass

                # Scroll to bottom and back for lazy-loaded catalogs
                try:
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1000)
                    await page.evaluate("window.scrollTo(0, 0)")
                except Exception:
                    pass

                await page.wait_for_timeout(1200)

                final_html = await page.content()
                status = resp.status if resp else 200
                response_headers = resp.headers if resp else {}
                await browser.close()

                duration = int((time.time() - start_time) * 1000)
                content_hash = hashlib.sha256(final_html.encode("utf-8")).hexdigest()

                if active_proxy_node:
                    if status in (429, 403, 502, 503):
                        proxy_pool.report_failure(active_proxy_node.raw_url, status_code=status)
                    else:
                        proxy_pool.report_success(active_proxy_node.raw_url, latency_ms=duration)

                return FetchResult(
                    url=url,
                    status_code=status,
                    html=final_html,
                    headers=response_headers,
                    method_used="playwright",
                    duration_ms=duration,
                    content_hash=content_hash,
                    proxy_used=active_proxy_node.raw_url if active_proxy_node else None,
                    captcha_solved=captcha_solved_flag
                )
        except Exception as e:
            print(f"[Fetcher] Playwright fetch exception: {e}")
            if active_proxy_node:
                proxy_pool.report_failure(active_proxy_node.raw_url, error=str(e))

    # -------------------------------------------------------------------------
    # 2. FAST HTTPX CLIENT ENGINE (With Proxy & Stealth)
    # -------------------------------------------------------------------------
    try:
        client_kwargs: Dict[str, Any] = {
            "event_hooks": {"response": [safe_redirect_hook]},
            "follow_redirects": True,
            "timeout": timeout,
        }
        if proxy_str:
            client_kwargs["proxy"] = proxy_str

        # Filter out manual Accept-Encoding so httpx handles decompression natively
        http_headers = {k: v for k, v in headers.items() if k.lower() != "accept-encoding"}

        async with httpx.AsyncClient(**client_kwargs) as client:
            resp = await client.get(url, headers=http_headers)
            html = decode_response_html(resp)
            duration = int((time.time() - start_time) * 1000)
            content_hash = hashlib.sha256(html.encode("utf-8")).hexdigest()

            if active_proxy_node:
                if resp.status_code in (429, 403, 502, 503):
                    proxy_pool.report_failure(active_proxy_node.raw_url, status_code=resp.status_code)
                else:
                    proxy_pool.report_success(active_proxy_node.raw_url, latency_ms=duration)

            return FetchResult(
                url=str(resp.url),
                status_code=resp.status_code,
                html=html,
                headers=dict(resp.headers),
                method_used="http",
                duration_ms=duration,
                content_hash=content_hash,
                proxy_used=active_proxy_node.raw_url if active_proxy_node else None,
                captcha_solved=False
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
        duration = int((time.time() - start_time) * 1000)
        if active_proxy_node:
            proxy_pool.report_failure(active_proxy_node.raw_url, error=str(e))

        return FetchResult(
            url=url,
            status_code=500,
            html="",
            headers={},
            method_used="http",
            duration_ms=duration,
            content_hash="",
            proxy_used=active_proxy_node.raw_url if active_proxy_node else None,
            error=f"Fetch failed: {str(e)}"
        )
