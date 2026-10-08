import gzip
import io
import re
import xml.etree.ElementTree as ET
from typing import Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse, urljoin
import httpx
from app.core.config import settings
from app.services.safety.url_guard import validate_url, safe_redirect_hook
from app.services.safety.robots import check_robots_txt
from app.services.site.url_normalizer import normalize_url, is_same_domain, is_crawlable_page


class SitemapEntry:
    def __init__(self, url: str, lastmod: Optional[str] = None):
        self.url = url
        self.lastmod = lastmod

    def to_dict(self) -> Dict[str, Optional[str]]:
        return {"url": self.url, "lastmod": self.lastmod}


async def fetch_sitemap_content(url: str, client: Optional[httpx.AsyncClient] = None) -> Optional[str]:
    """
    Fetches raw XML content from a sitemap URL, decompressing gzip if needed.
    """
    is_valid, _, err = validate_url(url)
    if not is_valid:
        return None

    headers = {
        "User-Agent": settings.DEFAULT_USER_AGENT,
        "Accept": "application/xml,text/xml,application/gzip,application/x-gzip,*/*"
    }

    try:
        if client:
            resp = await client.get(url, headers=headers, timeout=settings.REQUEST_TIMEOUT_SECONDS, follow_redirects=True)
        else:
            async with httpx.AsyncClient(
                event_hooks={"response": [safe_redirect_hook]},
                follow_redirects=True,
                timeout=settings.REQUEST_TIMEOUT_SECONDS
            ) as c:
                resp = await c.get(url, headers=headers)

        if resp.status_code != 200:
            return None

        content_bytes = resp.content
        # Check if content is gzipped (starts with gzip magic number \x1f\x8b or url ends in .gz)
        if url.lower().endswith(".gz") or content_bytes.startswith(b"\x1f\x8b"):
            try:
                decompressed = gzip.decompress(content_bytes)
                return decompressed.decode("utf-8", errors="replace")
            except Exception:
                pass

        return resp.text
    except Exception:
        return None


def parse_xml_sitemap(xml_text: str) -> Tuple[List[str], List[SitemapEntry]]:
    """
    Parses sitemap XML.
    Returns: (nested_sitemap_urls: List[str], page_entries: List[SitemapEntry])
    """
    nested_sitemaps: List[str] = []
    page_entries: List[SitemapEntry] = []

    if not xml_text:
        return nested_sitemaps, page_entries

    # Strip XML namespaces for simplified parsing
    cleaned_xml = re.sub(r'\sxmlns(:\w+)?="[^"]+"', '', xml_text, count=0)
    cleaned_xml = re.sub(r'\sxsi:[^=]+="[^"]+"', '', cleaned_xml, count=0)

    try:
        root = ET.fromstring(cleaned_xml)
    except Exception:
        # Fallback to regex extraction if XML is slightly malformed
        loc_matches = re.findall(r'<loc>([^<]+)</loc>', xml_text, re.IGNORECASE)
        for loc in loc_matches:
            loc_clean = loc.strip()
            if loc_clean.endswith(".xml") or loc_clean.endswith(".xml.gz") or "sitemap" in loc_clean.lower():
                nested_sitemaps.append(loc_clean)
            else:
                page_entries.append(SitemapEntry(loc_clean))
        return nested_sitemaps, page_entries

    tag_name = root.tag.lower()

    # Case 1: Sitemap Index containing nested sitemaps
    if "sitemapindex" in tag_name:
        for sitemap_elem in root.findall(".//sitemap"):
            loc = sitemap_elem.find("loc")
            if loc is not None and loc.text:
                nested_sitemaps.append(loc.text.strip())

    # Case 2: URL set containing page URLs
    elif "urlset" in tag_name:
        for url_elem in root.findall(".//url"):
            loc = url_elem.find("loc")
            if loc is not None and loc.text:
                url_val = loc.text.strip()
                lastmod = url_elem.find("lastmod")
                lastmod_val = lastmod.text.strip() if (lastmod is not None and lastmod.text) else None
                page_entries.append(SitemapEntry(url=url_val, lastmod=lastmod_val))
    else:
        # Generic scan
        for url_elem in root.findall(".//url"):
            loc = url_elem.find("loc")
            if loc is not None and loc.text:
                page_entries.append(SitemapEntry(url=loc.text.strip()))
        for sitemap_elem in root.findall(".//sitemap"):
            loc = sitemap_elem.find("loc")
            if loc is not None and loc.text:
                nested_sitemaps.append(loc.text.strip())

    return nested_sitemaps, page_entries


async def discover_sitemaps(
    start_url: str,
    max_pages: int = 1000,
    include_subdomains: bool = False
) -> Tuple[List[SitemapEntry], List[str]]:
    """
    Discovers all URLs listed in the site's sitemaps (including nested and gzipped sitemaps).
    Returns: (discovered_pages: List[SitemapEntry], sitemap_urls_checked: List[str])
    """
    parsed = urlparse(start_url)
    base_origin = f"{parsed.scheme}://{parsed.netloc}"

    # 1. Check robots.txt for Sitemap directives
    sitemap_candidate_urls: List[str] = []
    robots_result = await check_robots_txt(start_url)
    if robots_result.sitemaps:
        sitemap_candidate_urls.extend(robots_result.sitemaps)

    # 2. Add standard sitemap locations
    standard_locations = [
        f"{base_origin}/sitemap.xml",
        f"{base_origin}/sitemap_index.xml",
        f"{base_origin}/sitemap.xml.gz",
        f"{base_origin}/sitemap1.xml",
    ]
    for loc in standard_locations:
        if loc not in sitemap_candidate_urls:
            sitemap_candidate_urls.append(loc)

    discovered_pages: List[SitemapEntry] = []
    seen_page_urls: Set[str] = set()
    sitemap_queue: List[str] = list(sitemap_candidate_urls)
    visited_sitemaps: Set[str] = set()

    async with httpx.AsyncClient(
        event_hooks={"response": [safe_redirect_hook]},
        follow_redirects=True,
        timeout=settings.REQUEST_TIMEOUT_SECONDS
    ) as client:
        while sitemap_queue and len(discovered_pages) < max_pages and len(visited_sitemaps) < 30:
            sitemap_url = sitemap_queue.pop(0)
            if sitemap_url in visited_sitemaps:
                continue
            visited_sitemaps.add(sitemap_url)

            content = await fetch_sitemap_content(sitemap_url, client=client)
            if not content:
                continue

            nested_sitemaps, entries = parse_xml_sitemap(content)

            # Queue nested sitemaps
            for nested in nested_sitemaps:
                if nested not in visited_sitemaps and nested not in sitemap_queue:
                    # Validate domain
                    if is_same_domain(nested, start_url, include_subdomains=include_subdomains):
                        sitemap_queue.append(nested)

            # Add discovered page entries
            for entry in entries:
                normalized = normalize_url(entry.url, base_url=start_url)
                if not normalized:
                    continue

                if not is_same_domain(normalized, start_url, include_subdomains=include_subdomains):
                    continue

                is_crawlable, _ = is_crawlable_page(normalized)
                if not is_crawlable:
                    continue

                if normalized not in seen_page_urls:
                    seen_page_urls.add(normalized)
                    entry.url = normalized
                    discovered_pages.append(entry)
                    if len(discovered_pages) >= max_pages:
                        break

    return discovered_pages, list(visited_sitemaps)
