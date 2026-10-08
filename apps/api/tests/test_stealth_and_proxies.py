import pytest
import time
from app.services.safety.stealth import (
    get_random_fingerprint,
    generate_stealth_headers,
    get_stealth_evasion_script,
    BROWSER_FINGERPRINTS
)
from app.services.safety.proxy_manager import ProxyPool, ProxyNode
from app.services.safety.captcha_solver import (
    detect_captcha_in_html,
    CaptchaChallenge
)


def test_stealth_fingerprint_generation():
    fp = get_random_fingerprint()
    assert "user_agent" in fp
    assert "sec_ch_ua" in fp
    assert "platform" in fp
    assert "webgl_renderer" in fp
    assert fp in BROWSER_FINGERPRINTS

    headers = generate_stealth_headers(fp)
    assert headers["User-Agent"] == fp["user_agent"]
    assert "Sec-Ch-Ua" in headers
    assert "Sec-Ch-Ua-Platform" in headers
    assert headers["Sec-Fetch-Dest"] == "document"


def test_stealth_evasion_script_structure():
    js = get_stealth_evasion_script()
    assert "navigator, 'webdriver'" in js
    assert "window.chrome" in js
    assert "WebGLRenderingContext.prototype.getParameter" in js
    assert "RTCPeerConnection" in js
    assert "HTMLCanvasElement.prototype.toDataURL" in js


def test_proxy_pool_addition_and_normalization():
    pool = ProxyPool()
    
    p1 = pool.add_proxy("http://192.168.1.100:8080")
    assert p1 is not None
    assert p1.host == "192.168.1.100"
    assert p1.port == 8080
    assert p1.protocol == "http"
    assert p1.formatted_url == "http://192.168.1.100:8080"

    p2 = pool.add_proxy("http://user:pass123@proxy.example.com:3128")
    assert p2 is not None
    assert p2.username == "user"
    assert p2.password == "pass123"
    assert p2.formatted_url == "http://user:pass123@proxy.example.com:3128"

    pw_cfg = p2.to_playwright_proxy()
    assert pw_cfg["server"] == "http://proxy.example.com:3128"
    assert pw_cfg["username"] == "user"
    assert pw_cfg["password"] == "pass123"


def test_proxy_pool_rotation_and_cooldown():
    pool = ProxyPool()
    pool.add_proxy("http://proxy1:8080")
    pool.add_proxy("http://proxy2:8080")

    # Round Robin
    n1 = pool.get_proxy(strategy="round-robin")
    n2 = pool.get_proxy(strategy="round-robin")
    assert n1 is not None and n2 is not None
    assert n1.raw_url != n2.raw_url

    # Simulate 429 on proxy1
    pool.report_failure(n1.raw_url, status_code=429)
    assert not n1.is_available

    # Next request should automatically pick proxy2
    next_node = pool.get_proxy(strategy="round-robin")
    assert next_node.raw_url == n2.raw_url

    # Report success on proxy2
    pool.report_success(n2.raw_url, latency_ms=120)
    assert n2.successes_count == 1
    assert n2.last_latency_ms == 120


def test_captcha_detection_turnstile():
    html = """
    <html>
        <head><title>Verify you are human</title></head>
        <body>
            <div class="cf-turnstile" data-sitekey="0x4AAAAAAABBBCCCDDDEEE"></div>
            <script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>
        </body>
    </html>
    """
    challenge = detect_captcha_in_html(html, "https://target.com/login")
    assert challenge is not None
    assert challenge.challenge_type == "turnstile"
    assert challenge.sitekey == "0x4AAAAAAABBBCCCDDDEEE"
    assert challenge.page_url == "https://target.com/login"


def test_captcha_detection_recaptcha():
    html = """
    <html>
        <body>
            <form action="/submit" method="POST">
                <div class="g-recaptcha" data-sitekey="6Lc_example_site_key_12345"></div>
                <script src="https://www.google.com/recaptcha/api.js" async defer></script>
            </form>
        </body>
    </html>
    """
    challenge = detect_captcha_in_html(html, "https://example.com/contact")
    assert challenge is not None
    assert challenge.challenge_type == "recaptcha_v2"
    assert challenge.sitekey == "6Lc_example_site_key_12345"


def test_captcha_detection_hcaptcha():
    html = """
    <html>
        <body>
            <div class="h-captcha" data-sitekey="10000000-ffff-ffff-ffff-000000000001"></div>
            <script src="https://js.hcaptcha.com/1/api.js" async defer></script>
        </body>
    </html>
    """
    challenge = detect_captcha_in_html(html, "https://example.com/signup")
    assert challenge is not None
    assert challenge.challenge_type == "hcaptcha"
    assert challenge.sitekey == "10000000-ffff-ffff-ffff-000000000001"
