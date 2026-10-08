import re
from typing import Optional, List, Tuple
from urllib.parse import urljoin, urlparse, parse_qs, urlencode, urlunparse
from selectolax.lexbor import LexborHTMLParser as HTMLParser


NEXT_PAGE_SELECTORS = [
    'a[rel="next"]',
    'link[rel="next"]',
    '.pagination .next a',
    '.pagination li.next a',
    'a.next-page',
    'a.next',
    'a[aria-label*="Next" i]',
    'a[title*="Next" i]',
    'a.pagination__next',
    'a.pager__next',
]

NEXT_TEXT_PATTERNS = [
    re.compile(r"^\s*next\s*$", re.IGNORECASE),
    re.compile(r"^\s*next\s*(?:page|>|»|→)\s*$", re.IGNORECASE),
    re.compile(r"^\s*(?:>|»|→)\s*$", re.IGNORECASE),
    re.compile(r"^\s*older\s*(?:posts|entries)?\s*$", re.IGNORECASE)
]


def detect_next_page_url(html: str, current_url: str) -> Optional[str]:
    """
    Analyzes HTML to find the next page URL via rel="next", pagination elements, or 'Next' text.
    """
    if not html:
        return None

    tree = HTMLParser(html)
    
    # 1. Try CSS Selectors
    for sel in NEXT_PAGE_SELECTORS:
        el = tree.css_first(sel)
        if el:
            href = el.attributes.get("href")
            if href and not href.startswith("javascript:") and not href.startswith("#"):
                return urljoin(current_url, href)

    # 2. Look for anchor tags whose text matches 'Next' or '»'
    for a in tree.css("a[href]"):
        text = a.text(strip=True)
        href = a.attributes.get("href", "").strip()
        if not href or href.startswith("javascript:") or href.startswith("#"):
            continue

        for pattern in NEXT_TEXT_PATTERNS:
            if pattern.match(text):
                return urljoin(current_url, href)

    # 3. Pattern-based URL incrementing (e.g. ?page=1 -> ?page=2)
    parsed = urlparse(current_url)
    query_params = parse_qs(parsed.query)
    
    for page_key in ["page", "p", "pg", "paged", "page_number", "offset"]:
        if page_key in query_params:
            try:
                curr_val = int(query_params[page_key][0])
                new_params = query_params.copy()
                new_params[page_key] = [str(curr_val + 1)]
                new_query = urlencode(new_params, doseq=True)
                return urlunparse(parsed._replace(query=new_query))
            except ValueError:
                pass

    # Check path pattern /page/1/ -> /page/2/
    path_match = re.search(r"/(page|p)/(\d+)/?$", parsed.path)
    if path_match:
        prefix = path_match.group(1)
        curr_page = int(path_match.group(2))
        new_path = re.sub(r"/(page|p)/(\d+)/?$", f"/{prefix}/{curr_page + 1}/", parsed.path)
        return urlunparse(parsed._replace(path=new_path))

    return None
