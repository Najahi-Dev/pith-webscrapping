import asyncio
import re
from typing import Any, Callable, Dict, List, Optional, Set, Tuple
from urllib.parse import urlparse, urljoin
import httpx
from selectolax.lexbor import LexborHTMLParser as HTMLParser
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models import Site, Crawl, PageType, SitePage
from app.services.safety.url_guard import validate_url, safe_redirect_hook
from app.services.safety.robots import check_robots_txt
from app.services.scorer.scrapability import evaluate_scrapability
from app.services.engine.fetcher import fetch_page, FetchResult
from app.services.detector.pattern_engine import auto_detect_patterns
from app.services.site.url_normalizer import normalize_url, is_same_domain, is_crawlable_page
from app.services.site.sitemap import discover_sitemaps, SitemapEntry
from app.services.site.grouping import (
    extract_url_pattern,
    infer_page_type_name,
    detect_listing_vs_detail,
    group_urls_into_types
)


async def extract_page_links(html: str, base_url: str, include_subdomains: bool = False) -> List[str]:
    """
    Extracts all valid crawlable internal links from HTML content.
    """
    if not html:
        return []

    links: List[str] = []
    seen: Set[str] = set()

    try:
        tree = HTMLParser(html)
        for a in tree.css("a[href]"):
            href = a.attributes.get("href", "").strip()
            if not href or href.startswith("#") or href.startswith("javascript:") or href.startswith("mailto:"):
                continue

            normalized = normalize_url(href, base_url=base_url)
            if not normalized:
                continue

            if not is_same_domain(normalized, base_url, include_subdomains=include_subdomains):
                continue

            is_crawlable, _ = is_crawlable_page(normalized)
            if not is_crawlable:
                continue

            if normalized not in seen:
                seen.add(normalized)
                links.append(normalized)
    except Exception:
        pass

    return links


async def run_site_discovery(
    db: AsyncSession,
    site_id: str,
    max_pages: int = 100,
    max_depth: int = 3,
    crawl_delay: float = 0.2,
    include_subdomains: bool = False,
    method: str = "http",
    progress_callback: Optional[Callable[[Dict[str, Any]], None]] = None
) -> Dict[str, Any]:
    """
    Orchestrates end-to-end page discovery for a site:
    1. Runs safety & robots checks.
    2. Discovers URLs via Sitemap.xml (including nested and gzip).
    3. Traverses internal links via BFS up to max_pages / max_depth.
    4. Groups URLs into PageTypes.
    5. Samples 3-5 pages per PageType to detect schemas, selectors, and sample rows.
    6. Persists all records into database.
    """
    # Hard cap safety limit
    safe_max_pages = min(max(1, max_pages), 2000)
    safe_max_depth = min(max(1, max_depth), 10)

    # 1. Fetch site record
    stmt = select(Site).where(Site.id == site_id)
    result = await db.execute(stmt)
    site = result.scalar_one_or_none()
    if not site:
        raise ValueError(f"Site with id {site_id} not found")

    # Update site status to discovering
    site.status = "discovering"
    
    # Create or find active Crawl record
    crawl = Crawl(
        site_id=site.id,
        status="running",
        config={
            "max_pages": safe_max_pages,
            "max_depth": safe_max_depth,
            "crawl_delay": crawl_delay,
            "include_subdomains": include_subdomains,
            "method": method
        }
    )
    db.add(crawl)
    await db.commit()
    await db.refresh(crawl)
    await db.refresh(site)

    start_url = site.start_url
    normalized_start = normalize_url(start_url) or start_url

    # 2. Safety & Robots Check
    robots_result = await check_robots_txt(normalized_start)
    site.robots_data = robots_result.to_dict()
    if robots_result.crawl_delay and robots_result.crawl_delay > crawl_delay:
        crawl_delay = min(robots_result.crawl_delay, 5.0)

    # Calculate initial score
    score_res = evaluate_scrapability(
        status_code=200,
        headers={},
        html="",
        robots_allowed=robots_result.allowed,
        robots_reason=robots_result.reason
    )
    site.score = score_res.score
    site.level = score_res.level

    discovered_urls: Set[str] = {normalized_start}
    url_depths: Dict[str, int] = {normalized_start: 0}

    # 3. Discover URLs from Sitemaps
    try:
        sitemap_entries, _ = await discover_sitemaps(
            start_url=normalized_start,
            max_pages=safe_max_pages,
            include_subdomains=include_subdomains
        )
        for entry in sitemap_entries:
            if entry.url not in discovered_urls and len(discovered_urls) < safe_max_pages:
                discovered_urls.add(entry.url)
                url_depths[entry.url] = 1
    except Exception as e:
        print(f"[Discovery] Sitemap discovery warning: {e}")

    # 4. BFS Internal Link Crawl if more pages needed
    bfs_queue: List[Tuple[str, int]] = [(normalized_start, 0)]
    visited_urls: Set[str] = set()

    crawl.pages_discovered = len(discovered_urls)
    await db.commit()

    while bfs_queue and len(discovered_urls) < safe_max_pages:
        current_url, depth = bfs_queue.pop(0)
        if current_url in visited_urls:
            continue
        visited_urls.add(current_url)

        if depth >= safe_max_depth:
            continue

        # Respect crawl delay
        if crawl_delay > 0:
            await asyncio.sleep(min(crawl_delay, 1.0))

        fetch_res = await fetch_page(current_url, method="http", timeout=10.0)
        if fetch_res.status_code == 200 and fetch_res.html:
            child_links = await extract_page_links(
                fetch_res.html,
                base_url=current_url,
                include_subdomains=include_subdomains
            )
            for link in child_links:
                if link not in discovered_urls and len(discovered_urls) < safe_max_pages:
                    discovered_urls.add(link)
                    url_depths[link] = depth + 1
                    bfs_queue.append((link, depth + 1))

        # Update crawl stats live
        crawl.pages_discovered = len(discovered_urls)
        crawl.pages_fetched = len(visited_urls)
        await db.commit()

    # 5. Group Discovered URLs into PageTypes
    url_groups = group_urls_into_types(list(discovered_urls))

    # Clean existing page types & pages for this site if rediscovering
    await db.execute(select(PageType).where(PageType.site_id == site.id))
    
    created_page_types: List[PageType] = []

    for pattern, urls_in_group in url_groups.items():
        # Pick 3-5 sample URLs for inspection
        sample_urls = urls_in_group[:5]
        
        # Analyze first sample page to detect fields, selectors, and listing vs detail
        detected_fields: List[str] = []
        selectors_cfg: Dict[str, Any] = {}
        sample_rows: List[Dict[str, Any]] = []
        is_listing = False

        if sample_urls:
            try:
                sample_fetch = await fetch_page(sample_urls[0], method=method, timeout=12.0)
                if sample_fetch.status_code == 200 and sample_fetch.html:
                    is_listing = detect_listing_vs_detail(sample_fetch.html)
                    patterns = auto_detect_patterns(sample_fetch.html, base_url=sample_urls[0])
                    if patterns:
                        primary_pattern = patterns[0]
                        selectors_cfg = {
                            "container": primary_pattern.get("container_selector", ""),
                            "fields": primary_pattern.get("fields", {})
                        }
                        detected_fields = primary_pattern.get("field_names", [])
                        sample_rows = primary_pattern.get("sample_rows", [])
            except Exception as e:
                print(f"[Discovery] Sample page inspection error: {e}")

        type_name = infer_page_type_name(pattern, is_listing=is_listing)

        page_type = PageType(
            site_id=site.id,
            name=type_name,
            pattern=pattern,
            is_listing=is_listing,
            is_included=True,
            selectors=selectors_cfg,
            fields=detected_fields,
            sample_urls=sample_urls,
            sample_rows=sample_rows,
            page_count=len(urls_in_group),
            extracted_count=0
        )
        db.add(page_type)
        created_page_types.append(page_type)

    await db.commit()

    # Refresh page types to get generated IDs
    for pt in created_page_types:
        await db.refresh(pt)

    # 6. Create SitePage records for all discovered URLs
    # Map pattern to PageType ID
    pattern_to_type_id = {pt.pattern: pt.id for pt in created_page_types}

    for url in discovered_urls:
        pat = extract_url_pattern(url)
        t_id = pattern_to_type_id.get(pat)
        site_page = SitePage(
            site_id=site.id,
            crawl_id=crawl.id,
            type_id=t_id,
            url=url,
            status="queued",
            depth=url_depths.get(url, 0)
        )
        db.add(site_page)

    # Update Site & Crawl summary
    site.status = "discovered"
    site.page_count = len(discovered_urls)
    crawl.status = "completed"
    crawl.pages_discovered = len(discovered_urls)
    crawl.pages_fetched = len(visited_urls)

    await db.commit()
    await db.refresh(site)

    return {
        "site_id": site.id,
        "status": site.status,
        "page_count": len(discovered_urls),
        "page_types_count": len(created_page_types),
        "page_types": [
            {
                "id": pt.id,
                "name": pt.name,
                "pattern": pt.pattern,
                "is_listing": pt.is_listing,
                "is_included": pt.is_included,
                "page_count": pt.page_count,
                "fields": pt.fields,
                "sample_urls": pt.sample_urls,
                "sample_rows": pt.sample_rows
            }
            for pt in created_page_types
        ]
    }
