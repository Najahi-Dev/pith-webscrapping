import re
from typing import List, Optional, Set, Tuple
from urllib.parse import urlparse, urlunparse, urljoin, parse_qsl, urlencode


# Common query parameters used for tracking, analytics, and session IDs to drop during normalization
TRACKING_PARAMS: Set[str] = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
    "gclid", "fbclid", "msclkid", "dclid", "twclid", "zanpid",
    "ref", "source", "affiliate", "aff_id", "yclid", "_ga", "_gl",
    "mc_cid", "mc_eid", "igshid", "spJobID", "spUserID"
}

# File extensions to exclude from web page crawling
BINARY_EXTENSIONS: Set[str] = {
    # Images
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff", ".avif",
    # Documents
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".odt", ".rtf",
    # Archives & Binaries
    ".zip", ".tar", ".gz", ".rar", ".7z", ".bz2", ".exe", ".bin", ".dmg", ".iso", ".apk",
    # Media
    ".mp3", ".mp4", ".wav", ".avi", ".mov", ".mkv", ".flv", ".webm", ".m4a", ".ogg",
    # Web Assets
    ".css", ".js", ".mjs", ".map", ".woff", ".woff2", ".ttf", ".eot", ".otf", ".json", ".xml"
}

# URL paths that typically indicate non-content or sensitive pages
EXCLUDED_PATH_PATTERNS: List[re.Pattern] = [
    re.compile(r"^/(?:wp-)?login(?:\.php)?", re.IGNORECASE),
    re.compile(r"^/(?:wp-)?admin(?:/.*)?", re.IGNORECASE),
    re.compile(r"^/user/(?:login|register|password|logout)", re.IGNORECASE),
    re.compile(r"^/auth/(?:login|signup|callback|logout)", re.IGNORECASE),
    re.compile(r"^/signin|^/signup|^/register|^/logout", re.IGNORECASE),
    re.compile(r"^/cart|^/checkout|^/basket|^/my-account|^/account", re.IGNORECASE),
    re.compile(r"^/search|^/search_results|^/find", re.IGNORECASE),
    re.compile(r"^/cgi-bin/", re.IGNORECASE),
    re.compile(r"^/cdn-cgi/", re.IGNORECASE),
    re.compile(r"^/api/", re.IGNORECASE),
    re.compile(r"/wp-json/", re.IGNORECASE),
    re.compile(r"/xmlrpc\.php", re.IGNORECASE),
]


def normalize_url(url: str, base_url: Optional[str] = None) -> Optional[str]:
    """
    Normalizes a URL:
    - Resolves relative URLs against base_url
    - Converts scheme and host to lowercase
    - Removes fragments (#...)
    - Strips analytics/tracking query parameters (utm_*, fbclid, etc.)
    - Alphabetically sorts remaining query parameters for deterministic deduplication
    - Removes default ports (80 for http, 443 for https)
    - Strips duplicate slashes in path
    """
    if not url or not isinstance(url, str):
        return None

    url_str = url.strip()
    if not url_str or url_str.startswith("javascript:") or url_str.startswith("mailto:") or url_str.startswith("tel:"):
        return None

    if base_url:
        try:
            url_str = urljoin(base_url, url_str)
        except Exception:
            return None

    try:
        parsed = urlparse(url_str)
    except Exception:
        return None

    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        return None

    host = (parsed.hostname or "").lower()
    if not host:
        return None

    # Handle custom port
    port = parsed.port
    netloc = host
    if port and not ((scheme == "http" and port == 80) or (scheme == "https" and port == 443)):
        netloc = f"{host}:{port}"

    # Clean path: normalize slashes
    path = parsed.path or "/"
    path = re.sub(r"/+", "/", path)

    # Clean and sort query parameters
    query = ""
    if parsed.query:
        try:
            pairs = parse_qsl(parsed.query, keep_blank_values=True)
            filtered = [(k, v) for k, v in pairs if k.lower() not in TRACKING_PARAMS]
            filtered.sort(key=lambda x: (x[0], x[1]))
            if filtered:
                query = urlencode(filtered)
        except Exception:
            query = ""

    # Reassemble without fragment
    normalized = urlunparse((scheme, netloc, path, "", query, ""))
    return normalized


def is_same_domain(url: str, base_url: str, include_subdomains: bool = False) -> bool:
    """
    Checks if a URL belongs to the same domain as base_url.
    If include_subdomains is True, subdomains like blog.example.com match example.com.
    """
    try:
        parsed_target = urlparse(url)
        parsed_base = urlparse(base_url)

        target_host = (parsed_target.hostname or "").lower()
        base_host = (parsed_base.hostname or "").lower()

        if not target_host or not base_host:
            return False

        if target_host == base_host:
            return True

        if include_subdomains:
            # Check if target is a subdomain of base or vice versa (e.g. www.domain.com and domain.com)
            base_parts = base_host.split(".")
            # Strip www prefix if comparing root domain
            clean_base = base_host[4:] if base_host.startswith("www.") else base_host
            clean_target = target_host[4:] if target_host.startswith("www.") else target_host

            if clean_target == clean_base:
                return True
            if target_host.endswith("." + clean_base):
                return True

        return False
    except Exception:
        return False


def is_crawlable_page(url: str) -> Tuple[bool, Optional[str]]:
    """
    Determines if a URL should be crawled as an HTML page.
    Returns: (is_crawlable: bool, reason_skipped: Optional[str])
    """
    try:
        parsed = urlparse(url)
        path_lower = (parsed.path or "").lower()

        # Check binary/static asset extension
        for ext in BINARY_EXTENSIONS:
            if path_lower.endswith(ext):
                return False, f"Static asset / file extension ({ext})"

        # Check search query strings
        if parsed.query:
            query_lower = parsed.query.lower()
            if any(q in query_lower for q in ("s=", "search=", "q=", "keyword=")):
                return False, "Search query URL"

        # Check excluded path patterns (login, cart, admin, etc.)
        for pattern in EXCLUDED_PATH_PATTERNS:
            if pattern.search(path_lower):
                return False, f"Excluded sensitive or utility path ({path_lower})"

        return True, None
    except Exception as e:
        return False, f"URL parse error: {str(e)}"
