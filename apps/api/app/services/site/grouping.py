import re
from typing import Any, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse
from selectolax.lexbor import LexborHTMLParser as HTMLParser


# Regular expressions for identifying parameterized URL path segments
UUID_REGEX = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
HASH_REGEX = re.compile(r"^[0-9a-f]{16,64}$", re.IGNORECASE)
INT_REGEX = re.compile(r"^\d+$")
DATE_SLUG_REGEX = re.compile(r"^\d{4}[-/]\d{1,2}(?:[-/]\d{1,2})?$")


def extract_url_pattern(url: str) -> str:
    """
    Generalizes a URL path into a parameterized pattern.
    Examples:
      - https://example.com/products/42 -> /products/{id}
      - https://example.com/blog/2024/best-tools -> /blog/{year}/{slug}
      - https://example.com/category/tech -> /category/{slug}
      - https://example.com/ -> /
    """
    try:
        parsed = urlparse(url)
        path = parsed.path.strip("/")
        if not path:
            return "/"

        segments = path.split("/")
        pattern_segments = []

        for idx, seg in enumerate(segments):
            if not seg:
                continue

            seg_clean = seg.strip()
            
            # Check for numeric ID (or .html/.htm suffix)
            base_seg = re.sub(r"\.(html|htm|php|asp|aspx)$", "", seg_clean, flags=re.IGNORECASE)

            if re.match(r"^\d{4}$", base_seg) and idx > 0 and (int(base_seg) >= 1990 and int(base_seg) <= 2050):
                pattern_segments.append("{year}")
            elif re.match(r"^\d{2}$", base_seg) and idx > 0 and (1 <= int(base_seg) <= 12):
                pattern_segments.append("{month}")
            elif INT_REGEX.match(base_seg):
                pattern_segments.append("{id}")
            elif UUID_REGEX.match(base_seg) or HASH_REGEX.match(base_seg):
                pattern_segments.append("{id}")
            elif (idx > 0 and len(segments) > 1 and 
                  segments[idx-1].lower() in ("product", "products", "item", "items", "p", "goods", "shop")):
                pattern_segments.append("{id}")
            elif (idx > 0 and len(segments) > 1 and 
                  segments[idx-1].lower() in ("blog", "posts", "post", "article", "articles", "news", "story")):
                pattern_segments.append("{slug}")
            elif (idx > 0 and len(segments) > 1 and 
                  segments[idx-1].lower() in ("category", "categories", "c", "collection", "collections", "tag", "tags", "genre")):
                pattern_segments.append("{category}")
            elif idx == len(segments) - 1 and len(segments) >= 2 and "-" in seg:
                # Trailing hyphenated slug
                pattern_segments.append("{slug}")
            else:
                pattern_segments.append(seg_clean.lower())

        return "/" + "/".join(pattern_segments)
    except Exception:
        return "/"


def infer_page_type_name(pattern: str, is_listing: bool = False) -> str:
    """
    Infers a human-readable title for a page type based on its URL pattern and classification.
    """
    pattern_lower = pattern.lower()

    if pattern == "/":
        return "Homepage / Root"

    if any(k in pattern_lower for k in ("/product", "/item", "/goods", "/p/")):
        return "Product Detail" if not is_listing else "Product Listing"

    if any(k in pattern_lower for k in ("/blog", "/article", "/post", "/news", "/story")):
        return "Blog / Article" if not is_listing else "Blog / Article Index"

    if any(k in pattern_lower for k in ("/category", "/categories", "/collection", "/tag", "/catalog")):
        return "Category / Collection"

    if any(k in pattern_lower for k in ("/docs", "/documentation", "/guide", "/tutorial")):
        return "Documentation / Guides"

    if any(k in pattern_lower for k in ("/user", "/profile", "/author", "/member")):
        return "Author / User Profile"

    if any(k in pattern_lower for k in ("/pricing", "/plans")):
        return "Pricing Page"

    if any(k in pattern_lower for k in ("/about", "/contact", "/team", "/faq", "/terms", "/privacy")):
        clean_name = pattern.strip("/").replace("-", " ").capitalize()
        return f"{clean_name} Page"

    # Default fallback derived from pattern
    segments = [s for s in pattern.strip("/").split("/") if s and not s.startswith("{")]
    if segments:
        label = " / ".join(s.replace("-", " ").title() for s in segments)
        return f"{label} {'Listing' if is_listing else 'Pages'}"

    return "General Content Pages"


def detect_listing_vs_detail(html: str) -> bool:
    """
    Determines if a page behaves as a Listing page (multiple item links, cards, tables)
    or a Detail page (single primary entity, singular h1, lengthy article, product buy box).
    """
    if not html:
        return False

    try:
        tree = HTMLParser(html)

        # Count cards / repeated item candidates
        cards = tree.css("[class*='product'], [class*='card'], [class*='item'], [class*='listing'], article, table tbody tr")
        if len(cards) >= 4:
            return True

        # Count content links
        links = tree.css("main a[href], #content a[href], .container a[href]")
        if len(links) >= 15:
            return True

        # Check for single detail indicators
        paragraphs = [p for p in tree.css("article p, main p, .content p") if len(p.text(strip=True)) > 40]
        if len(paragraphs) >= 4 and len(cards) <= 2:
            return False

        return False
    except Exception:
        return False


def get_dom_structure_hash(html: str) -> str:
    """
    Produces a simple structural signature of the DOM layout to help cluster pages.
    """
    if not html:
        return "empty"

    try:
        tree = HTMLParser(html)
        tags = [node.tag for node in tree.css("main, header, nav, article, section, footer, table, ul, ol, form")]
        return "-".join(tags[:12]) or "generic"
    except Exception:
        return "unknown"


def group_urls_into_types(urls: List[str]) -> Dict[str, List[str]]:
    """
    Groups a list of URLs by their normalized URL pattern.
    Returns: Dict[pattern, List[url]]
    """
    groups: Dict[str, List[str]] = {}
    for url in urls:
        pattern = extract_url_pattern(url)
        if pattern not in groups:
            groups[pattern] = []
        groups[pattern].append(url)
    return groups
