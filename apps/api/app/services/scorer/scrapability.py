import re
from typing import Dict, List, Optional
from selectolax.lexbor import LexborHTMLParser as HTMLParser


BOT_CHALLENGE_SIGNATURES = [
    # Cloudflare
    (re.compile(r"cf-browser-verification|cf-challenge|ray-id|__cf_chl_tk|turnstile", re.IGNORECASE), "Cloudflare Bot Management / Turnstile detected"),
    # reCAPTCHA / hCaptcha
    (re.compile(r"recaptcha/api\.js|g-recaptcha|hcaptcha\.com|h-captcha", re.IGNORECASE), "CAPTCHA challenge (reCAPTCHA/hCaptcha) present"),
    # DataDome
    (re.compile(r"datadome\.js|dd\.js|geo\.captcha-delivery\.com", re.IGNORECASE), "DataDome anti-bot protection detected"),
    # Akamai Bot Manager
    (re.compile(r"_abck|bm_sz|akamai-bot-detector", re.IGNORECASE), "Akamai Bot Manager signature detected"),
    # PerimeterX / HUMAN
    (re.compile(r"px-captcha|_px|client\.perimeterx\.net", re.IGNORECASE), "PerimeterX / HUMAN bot defense detected"),
    # Kasada
    (re.compile(r"kpsdk\.js|ips\.js", re.IGNORECASE), "Kasada anti-bot defense detected"),
    # AWS WAF Captcha
    (re.compile(r"awswaf|aws-waf-captcha", re.IGNORECASE), "AWS WAF Challenge detected")
]

LOGIN_SIGNATURES = [
    re.compile(r'input[^>]+type=["\']password["\']', re.IGNORECASE),
    re.compile(r'action=["\'][^"\']*(?:login|signin|session|auth)[^"\']*["\']', re.IGNORECASE),
    re.compile(r'name=["\'](?:username|passwd|password|login_email)["\']', re.IGNORECASE)
]


class ScrapabilityResult:
    def __init__(
        self,
        score: int,
        level: str,  # 'easy', 'medium', 'hard'
        recommended_method: str,  # 'http', 'playwright'
        reasons: List[str],
        factors: Dict,
        allow_scraping: bool
    ):
        self.score = max(0, min(100, score))
        self.level = level
        self.recommended_method = recommended_method
        self.reasons = reasons
        self.factors = factors
        self.allow_scraping = allow_scraping

    def to_dict(self) -> Dict:
        return {
            "score": self.score,
            "level": self.level,
            "recommended_method": self.recommended_method,
            "reasons": self.reasons,
            "factors": self.factors,
            "allow_scraping": self.allow_scraping
        }


def evaluate_scrapability(
    status_code: int,
    headers: Dict[str, str],
    html: str,
    robots_allowed: bool,
    robots_reason: Optional[str] = None,
    content_length: int = 0
) -> ScrapabilityResult:
    """
    Evaluates scrapability score (0-100), difficulty tier (easy, medium, hard),
    and optimal extraction engine (http or playwright).
    """
    score = 100
    reasons: List[str] = []
    headers_lower = {k.lower(): v for k, v in headers.items()}
    
    # 1. Status Code Analysis
    if status_code == 200:
        reasons.append("HTTP 200 OK: Target page is publicly accessible")
    elif status_code in (301, 302, 307, 308):
        score -= 5
        reasons.append(f"HTTP {status_code}: Page redirects to another URL")
    elif status_code in (401, 403):
        score -= 75
        reasons.append(f"HTTP {status_code}: Access is restricted or unauthorized")
    elif status_code == 404:
        score = 0
        reasons.append("HTTP 404 Not Found: Target page does not exist")
        return ScrapabilityResult(0, "hard", "http", reasons, {"status_code": 404}, False)
    elif status_code >= 500:
        score -= 50
        reasons.append(f"HTTP {status_code}: Server error encountered on target")
    else:
        score -= 20
        reasons.append(f"HTTP {status_code}: Non-standard response status code")

    # 2. Robots.txt Compliance
    if not robots_allowed:
        score -= 50
        reasons.append(f"Robots.txt: {robots_reason or 'Crawling disallowed by policy'}")
    else:
        reasons.append(f"Robots.txt: {robots_reason or 'Crawling allowed'}")

    # 3. Bot Protection & CAPTCHA Detection
    detected_bot_defenses: List[str] = []
    server_header = headers_lower.get("server", "").lower()
    if "cloudflare" in server_header:
        # Check if actual challenge page or normal CDN pass
        if status_code in (403, 503) or "cf-mitigated" in headers_lower:
            detected_bot_defenses.append("Cloudflare Managed Challenge active")
            
    for pattern, label in BOT_CHALLENGE_SIGNATURES:
        if pattern.search(html):
            detected_bot_defenses.append(label)
            
    has_bot_protection = len(detected_bot_defenses) > 0
    if has_bot_protection:
        score -= 40
        for defense in detected_bot_defenses:
            reasons.append(f"Bot Block: {defense}")

    # 4. Login Wall Detection
    login_indicators = 0
    for pattern in LOGIN_SIGNATURES:
        if pattern.search(html):
            login_indicators += 1
            
    has_login_wall = (login_indicators >= 2) or (status_code in (401, 403) and login_indicators >= 1)
    if has_login_wall:
        score -= 30
        reasons.append("Authentication Wall: Login/Password forms detected on landing page")

    # 5. DOM Structure & JavaScript Rendering Requirement
    tree = HTMLParser(html) if html else None
    text_content = tree.text(strip=True) if tree else ""
    body_text_len = len(text_content)
    
    # Check SPA markers
    spa_containers = 0
    if tree:
        for selector in ["#root:empty", "#app:empty", "#__next:empty", "#mount:empty", "div[id*='app']:empty"]:
            if tree.css(selector):
                spa_containers += 1

    script_tags = len(tree.css("script")) if tree else 0
    noscript_tags = len(tree.css("noscript")) if tree else 0
    
    # Is JavaScript required to render meaningful content?
    js_required = False
    if (body_text_len < 300 and script_tags > 2) or (spa_containers > 0 and body_text_len < 500):
        js_required = True
        score -= 15
        reasons.append("Client-Side Rendering: Page appears to be an SPA; dynamic JavaScript execution is recommended")
    else:
        reasons.append("Static HTML: Page has pre-rendered DOM content suitable for fast HTTP extraction")

    # 6. Structured Data Present (Bonus for ease)
    has_json_ld = False
    has_opengraph = False
    has_tables = False
    
    if tree:
        if tree.css('script[type="application/ld+json"]'):
            has_json_ld = True
            reasons.append("Structured Data: JSON-LD metadata found on page")
        if tree.css('meta[property^="og:"]'):
            has_opengraph = True
            reasons.append("Social Metadata: OpenGraph tags detected")
        if tree.css("table"):
            has_tables = True
            reasons.append("Tabular Data: HTML table elements detected")

    # 7. Page Size Assessment
    size_kb = len(html.encode("utf-8")) / 1024
    if size_kb > 5000:
        score -= 10
        reasons.append(f"Large Payload: Page size is {size_kb:.1f} KB (may slow processing)")

    # Compute final tier
    score = max(5, min(100, score))
    
    if score >= 75 and not has_bot_protection and not has_login_wall:
        level = "easy"
    elif score >= 45 and not has_bot_protection and not has_login_wall:
        level = "medium"
    else:
        level = "hard"

    # Method recommendation
    recommended_method = "playwright" if js_required else "http"
    allow_scraping = robots_allowed and status_code not in (401, 403, 404) and not has_bot_protection

    factors = {
        "status_code": status_code,
        "robots_allowed": robots_allowed,
        "js_required": js_required,
        "has_login_wall": has_login_wall,
        "has_bot_protection": has_bot_protection,
        "bot_defenses": detected_bot_defenses,
        "has_json_ld": has_json_ld,
        "has_opengraph": has_opengraph,
        "has_tables": has_tables,
        "page_size_kb": round(size_kb, 1),
        "text_length": body_text_len
    }

    return ScrapabilityResult(
        score=score,
        level=level,
        recommended_method=recommended_method,
        reasons=reasons,
        factors=factors,
        allow_scraping=allow_scraping
    )
