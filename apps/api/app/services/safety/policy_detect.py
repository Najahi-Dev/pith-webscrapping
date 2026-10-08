import re
from typing import Dict, List, Optional, Tuple
from urllib.parse import urljoin
from selectolax.lexbor import LexborHTMLParser as HTMLParser


SCRAPING_PROHIBITION_PATTERNS = [
    re.compile(r"prohibit(?:s|ed)?\s+(?:the\s+)?(?:use\s+of\s+)?(?:automated\s+)?(?:data\s+)?(?:scraping|mining|harvesting|crawling|extraction)", re.IGNORECASE),
    re.compile(r"no\s+(?:automated\s+)?(?:bots?|spiders?|scrapers?|crawlers?)\s+(?:allowed|permitted)", re.IGNORECASE),
    re.compile(r"(?:screen\s+scraping|data\s+scraping|web\s+scraping)\s+is\s+strictly\s+prohibited", re.IGNORECASE),
    re.compile(r"you\s+agree\s+not\s+to\s+(?:use\s+any\s+)?(?:robot|spider|scraper|automated\s+means)", re.IGNORECASE),
    re.compile(r"unauthorized\s+(?:scraping|crawling|automated\s+access|data\s+collection)", re.IGNORECASE),
    re.compile(r"do\s+not\s+copy,\s+scrape,\s+or\s+extract\s+data", re.IGNORECASE),
    re.compile(r"without\s+(?:prior\s+)?(?:written\s+)?permission.*?(?:scrape|crawl|extract\s+data)", re.IGNORECASE),
]

TERMS_KEYWORDS = [
    "terms", "terms of service", "terms of use", "tos", "legal",
    "acceptable use", "conditions of use", "user agreement", "privacy policy"
]


def detect_policy_warnings(html: str, base_url: str) -> Dict:
    """
    Scans HTML for Terms of Service links and anti-scraping policy clauses.
    Returns: {
        'found_terms_link': bool,
        'terms_urls': List[str],
        'scraping_warnings': List[str],
        'has_scraping_restrictions': bool,
        'summary': str
    }
    """
    terms_urls: List[str] = []
    scraping_warnings: List[str] = []
    
    if not html:
        return {
            "found_terms_link": False,
            "terms_urls": [],
            "scraping_warnings": [],
            "has_scraping_restrictions": False,
            "summary": "No HTML content analyzed"
        }
        
    tree = HTMLParser(html)
    
    # 1. Look for Terms of Service links in footer / navigation
    for a in tree.css("a[href]"):
        href = a.attributes.get("href", "")
        text = (a.text() or "").strip().lower()
        title = (a.attributes.get("title", "") or "").lower()
        aria_label = (a.attributes.get("aria-label", "") or "").lower()
        
        href_lower = href.lower()
        combined_text = f"{text} {title} {aria_label} {href_lower}"
        
        for kw in TERMS_KEYWORDS:
            if kw in combined_text and ("terms" in href_lower or "tos" in href_lower or "legal" in href_lower or "policy" in href_lower or kw in text):
                full_url = urljoin(base_url, href)
                if full_url not in terms_urls and not full_url.startswith("javascript:") and not full_url.startswith("mailto:"):
                    terms_urls.append(full_url)
                break
                
    # 2. Check for explicit scraping prohibition text within the document
    text_content = tree.text() or ""
    
    for pattern in SCRAPING_PROHIBITION_PATTERNS:
        match = pattern.search(text_content)
        if match:
            start = max(0, match.start() - 40)
            end = min(len(text_content), match.end() + 60)
            snippet = text_content[start:end].replace("\n", " ").strip()
            snippet_cleaned = re.sub(r"\s+", " ", snippet)
            warning_msg = f"Detected anti-scraping phrase: \"...{snippet_cleaned}...\""
            if warning_msg not in scraping_warnings:
                scraping_warnings.append(warning_msg)
                
    has_restrictions = len(scraping_warnings) > 0
    
    if has_restrictions:
        summary = f"Notice: Found {len(scraping_warnings)} potential anti-scraping clause(s) on page."
    elif terms_urls:
        summary = f"Detected {len(terms_urls)} Terms / Legal link(s). Review target site terms before scraping."
    else:
        summary = "No obvious anti-scraping policy clauses detected on landing page."
        
    return {
        "found_terms_link": len(terms_urls) > 0,
        "terms_urls": terms_urls[:5],
        "scraping_warnings": scraping_warnings[:5],
        "has_scraping_restrictions": has_restrictions,
        "summary": summary
    }
