import asyncio
import hashlib
import json
import time
from typing import Any, Dict, List, Optional, Set
from urllib.parse import urljoin
from selectolax.lexbor import LexborHTMLParser as HTMLParser, LexborNode as Node
from sqlalchemy import select, update, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import async_session_factory
from app.models import Site, Crawl, PageType, SitePage, SiteExtraction
from app.services.engine.fetcher import fetch_page, FetchResult
from app.services.engine.cleaner import clean_dataset
from app.services.detector.pattern_engine import auto_detect_patterns


# Global tracking for active site crawl cancellation / pause state
CRAWL_CONTROL_FLAGS: Dict[str, str] = {}  # site_id -> "running" | "paused" | "cancelled"


def set_site_control_flag(site_id: str, state: str) -> None:
    CRAWL_CONTROL_FLAGS[site_id] = state


def get_site_control_flag(site_id: str) -> str:
    return CRAWL_CONTROL_FLAGS.get(site_id, "running")


def extract_data_from_page(
    html: str,
    page_url: str,
    selectors: Dict[str, Any],
    is_listing: bool = False
) -> List[Dict[str, Any]]:
    """
    Extracts structured data rows from a single HTML page using the PageType's selector configuration.
    """
    if not html:
        return []

    tree = HTMLParser(html)
    rows: List[Dict[str, Any]] = []

    container_selector = selectors.get("container")
    fields_config: Dict[str, Any] = selectors.get("fields", {})

    if container_selector:
        container_nodes = tree.css(container_selector)
        for node in container_nodes:
            row: Dict[str, Any] = {}
            for f_name, f_def in fields_config.items():
                if isinstance(f_def, str):
                    sel = f_def
                    attr = "text"
                elif isinstance(f_def, dict):
                    sel = f_def.get("selector", "")
                    attr = f_def.get("attribute", "text")
                else:
                    continue

                if not sel:
                    continue

                target = node.css_first(sel)
                if not target:
                    row[f_name] = None
                    continue

                if attr == "text":
                    row[f_name] = target.text(strip=True)
                elif attr == "src":
                    src_val = target.attributes.get("src") or target.attributes.get("data-src") or ""
                    row[f_name] = urljoin(page_url, src_val) if src_val else None
                elif attr == "href":
                    href_val = target.attributes.get("href") or ""
                    row[f_name] = urljoin(page_url, href_val) if href_val else None
                else:
                    row[f_name] = target.attributes.get(attr, "")

            if any(v is not None for v in row.values()):
                row["_source_url"] = page_url
                rows.append(row)
    else:
        # Single entity / Detail page extraction
        row = {}
        for f_name, f_def in fields_config.items():
            if isinstance(f_def, str):
                sel = f_def
                attr = "text"
            elif isinstance(f_def, dict):
                sel = f_def.get("selector", "")
                attr = f_def.get("attribute", "text")
            else:
                continue

            if not sel:
                continue

            target = tree.css_first(sel)
            if not target:
                row[f_name] = None
                continue

            if attr == "text":
                row[f_name] = target.text(strip=True)
            elif attr == "src":
                src_val = target.attributes.get("src") or target.attributes.get("data-src") or ""
                row[f_name] = urljoin(page_url, src_val) if src_val else None
            elif attr == "href":
                href_val = target.attributes.get("href") or ""
                row[f_name] = urljoin(page_url, href_val) if href_val else None
            else:
                row[f_name] = target.attributes.get(attr, "")

        # Fallback to automatic page title & description if no fields configured
        if not row:
            h1 = tree.css_first("h1")
            title = tree.css_first("title")
            meta_desc = tree.css_first('meta[name="description"]')
            row = {
                "title": h1.text(strip=True) if h1 else (title.text(strip=True) if title else None),
                "description": meta_desc.attributes.get("content") if meta_desc else None
            }

        if any(v is not None for v in row.values()):
            row["_source_url"] = page_url
            rows.append(row)

    return rows


async def execute_site_extraction_task(site_id: str) -> None:
    """
    Background worker that runs extraction across all included page types for a given site.
    """
    set_site_control_flag(site_id, "running")

    async with async_session_factory() as db:
        # Load Site
        stmt = select(Site).where(Site.id == site_id)
        res = await db.execute(stmt)
        site = res.scalar_one_or_none()
        if not site:
            return

        # Load active Crawl or create new one
        crawl_stmt = select(Crawl).where(Crawl.site_id == site.id).order_by(Crawl.started_at.desc())
        crawl_res = await db.execute(crawl_stmt)
        crawl = crawl_res.scalars().first()
        if not crawl:
            crawl = Crawl(site_id=site.id, status="running")
            db.add(crawl)
            await db.commit()
            await db.refresh(crawl)

        # Update statuses
        site.status = "extracting"
        site.error_message = None
        crawl.status = "running"
        crawl.error_message = None
        await db.commit()

        # Load all included PageTypes
        pt_stmt = select(PageType).where(PageType.site_id == site.id, PageType.is_included == True)
        pt_res = await db.execute(pt_stmt)
        included_page_types = {pt.id: pt for pt in pt_res.scalars().all()}

        if not included_page_types:
            site.status = "completed"
            crawl.status = "completed"
            await db.commit()
            return

        # Load all pending/queued or retrying pages belonging to included page types
        included_type_ids = list(included_page_types.keys())
        pages_stmt = select(SitePage).where(
            SitePage.site_id == site.id,
            SitePage.type_id.in_(included_type_ids),
            SitePage.status.in_(["queued", "fetching", "retrying"])
        )
        pages_res = await db.execute(pages_stmt)
        pages_to_extract = pages_res.scalars().all()

        total_pages = len(pages_to_extract)
        site_opts = site.options or {}
        crawl_delay = float(site_opts.get("crawl_delay", 0.2))
        method = site_opts.get("method", "http")
        store_raw_html = site_opts.get("store_raw_html", False)

        concurrency = 3
        semaphore = asyncio.Semaphore(concurrency)

        pages_completed = 0
        pages_failed = 0
        consecutive_blocks = 0
        start_time = time.time()

        async def process_single_page(page: SitePage) -> None:
            nonlocal pages_completed, pages_failed, consecutive_blocks

            # Check if paused or cancelled
            flag = get_site_control_flag(site_id)
            if flag in ("paused", "cancelled"):
                return

            async with semaphore:
                # Crawl delay throttle
                if crawl_delay > 0:
                    await asyncio.sleep(min(crawl_delay, 2.0))

                # Check flag again
                if get_site_control_flag(site_id) in ("paused", "cancelled"):
                    return

                page.status = "fetching"
                await db.commit()

                fetch_res: FetchResult = await fetch_page(page.url, method=method, timeout=15.0)
                page.http_status = fetch_res.status_code
                page.content_hash = fetch_res.content_hash
                page.fetched_at = func.now()

                if fetch_res.status_code in (403, 429):
                    consecutive_blocks += 1
                else:
                    consecutive_blocks = 0

                if fetch_res.error or fetch_res.status_code >= 400 or not fetch_res.html:
                    page.status = "failed"
                    page.error = fetch_res.error or f"HTTP status {fetch_res.status_code}"
                    pages_failed += 1
                else:
                    # Extract data using the page type selectors
                    page_type = included_page_types.get(page.type_id)
                    selectors = page_type.selectors if page_type else {}
                    is_listing = page_type.is_listing if page_type else False

                    extracted_rows = extract_data_from_page(
                        html=fetch_res.html,
                        page_url=page.url,
                        selectors=selectors,
                        is_listing=is_listing
                    )

                    # Clean data
                    cleaned_rows, _ = clean_dataset(
                        rows=extracted_rows,
                        base_url=page.url,
                        trim_whitespace_enabled=True,
                        remove_duplicates_enabled=True,
                        normalize_prices_enabled=True,
                        normalize_dates_enabled=True,
                        make_urls_absolute_enabled=True
                    )

                    # Idempotent data hash
                    data_str = json.dumps(cleaned_rows, sort_keys=True)
                    data_hash = hashlib.sha256(data_str.encode("utf-8")).hexdigest()

                    # Save SiteExtraction record
                    extraction = SiteExtraction(
                        site_id=site.id,
                        page_id=page.id,
                        type_id=page.type_id,
                        data=cleaned_rows,
                        row_count=len(cleaned_rows),
                        data_hash=data_hash
                    )
                    db.add(extraction)

                    page.status = "extracted"
                    page.error = None
                    pages_completed += 1

                    if page_type:
                        page_type.extracted_count = (page_type.extracted_count or 0) + 1

                # Update live stats
                elapsed = max(time.time() - start_time, 0.1)
                speed = round((pages_completed + pages_failed) / elapsed, 2)
                remaining_pages = max(0, total_pages - (pages_completed + pages_failed))
                eta_sec = int(remaining_pages / speed) if speed > 0 else 0

                crawl.pages_fetched = pages_completed
                crawl.pages_failed = pages_failed
                crawl.speed_pages_per_sec = int(speed * 100) / 100.0
                crawl.estimated_time_remaining_sec = eta_sec
                site.extracted_count = pages_completed

                await db.commit()

        # Iterate over pages
        for page in pages_to_extract:
            current_flag = get_site_control_flag(site_id)
            if current_flag == "cancelled":
                crawl.status = "cancelled"
                site.status = "failed"
                site.error_message = "Extraction was cancelled by the user."
                await db.commit()
                return

            if current_flag == "paused":
                crawl.status = "paused"
                await db.commit()
                return

            # Check consecutive rate limits / anti-bot blocks
            if consecutive_blocks >= 6:
                crawl.status = "failed"
                site.status = "failed"
                err_msg = "Extraction stopped early: Site responded with repeated 429 (Rate Limit) or 403 (Forbidden) blocks."
                crawl.error_message = err_msg
                site.error_message = err_msg
                await db.commit()
                return

            await process_single_page(page)

        # Finalize job status
        final_flag = get_site_control_flag(site_id)
        if final_flag == "cancelled":
            crawl.status = "cancelled"
            site.status = "failed"
        elif final_flag == "paused":
            crawl.status = "paused"
        else:
            crawl.status = "completed"
            site.status = "completed"
            crawl.completed_at = func.now()

        await db.commit()


async def retry_failed_pages(db: AsyncSession, site_id: str) -> int:
    """
    Resets failed pages for a site back to 'queued' and triggers extraction.
    """
    stmt = (
        update(SitePage)
        .where(SitePage.site_id == site_id, SitePage.status == "failed")
        .values(status="queued", error=None)
    )
    res = await db.execute(stmt)
    await db.commit()
    return res.rowcount
