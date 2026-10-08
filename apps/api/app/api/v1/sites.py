import asyncio
from typing import Any, Dict, List, Optional
from urllib.parse import urlparse
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, HttpUrl
from sqlalchemy import select, update, desc, or_
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import StreamingResponse
import io

from app.core.database import get_db, async_session_factory
from app.models import Site, Crawl, PageType, SitePage, SiteExtraction
from app.services.safety.url_guard import validate_url
from app.services.site.discovery import run_site_discovery
from app.services.site.site_runner import (
    execute_site_extraction_task,
    set_site_control_flag,
    retry_failed_pages
)
from app.services.site.site_exporter import export_page_type_data, export_site_zip_archive

router = APIRouter(prefix="/sites", tags=["Site Mode Crawling"])


class SiteDiscoverRequest(BaseModel):
    url: str = Field(..., description="Root URL of the website to discover")
    max_pages: Optional[int] = Field(100, ge=1, le=2000, description="Max pages limit for discovery")
    max_depth: Optional[int] = Field(3, ge=1, le=10, description="Max crawl depth from root URL")
    crawl_delay: Optional[float] = Field(0.2, ge=0.0, le=10.0, description="Delay between requests in seconds")
    include_subdomains: Optional[bool] = Field(False, description="Whether to include subdomains")
    method: Optional[str] = Field("http", description="Engine: http or playwright")


class PageTypeUpdateRequest(BaseModel):
    name: Optional[str] = None
    is_included: Optional[bool] = None
    is_listing: Optional[bool] = None
    selectors: Optional[Dict[str, Any]] = None
    fields: Optional[List[str]] = None


@router.post("/discover", status_code=status.HTTP_202_ACCEPTED)
async def start_discovery(
    req: SiteDiscoverRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Validates the target URL and triggers background page discovery:
    - Reads robots.txt & sitemaps (including nested and gzip).
    - Crawls internal BFS links.
    - Groups discovered URLs into PageTypes with schemas and sample data rows.
    """
    url_str = req.url.strip()
    is_valid, _, error_msg = validate_url(url_str)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Security Guard: {error_msg}"
        )

    parsed = urlparse(url_str)
    domain = parsed.hostname or url_str

    # Create Site record in pending state
    site = Site(
        domain=domain,
        start_url=url_str,
        status="discovering",
        options={
            "max_pages": req.max_pages or 100,
            "max_depth": req.max_depth or 3,
            "crawl_delay": req.crawl_delay or 0.2,
            "include_subdomains": bool(req.include_subdomains),
            "method": req.method or "http"
        }
    )
    db.add(site)
    await db.commit()
    await db.refresh(site)

    # Launch discovery in background task
    async def run_discovery_task(site_id: str):
        async with async_session_factory() as task_db:
            try:
                await run_site_discovery(
                    db=task_db,
                    site_id=site_id,
                    max_pages=req.max_pages or 100,
                    max_depth=req.max_depth or 3,
                    crawl_delay=req.crawl_delay or 0.2,
                    include_subdomains=bool(req.include_subdomains),
                    method=req.method or "http"
                )
            except Exception as e:
                # Mark as failed if discovery unhandled error
                s_stmt = select(Site).where(Site.id == site_id)
                res = await task_db.execute(s_stmt)
                s = res.scalar_one_or_none()
                if s:
                    s.status = "failed"
                    s.error_message = str(e)
                    await task_db.commit()

    background_tasks.add_task(run_discovery_task, site.id)

    return {
        "site_id": site.id,
        "domain": site.domain,
        "start_url": site.start_url,
        "status": site.status,
        "message": "Site discovery started in background."
    }


@router.get("/{site_id}")
async def get_site_status(site_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns current status of the site, crawls, page counts, and detected page types with sample data.
    """
    stmt = select(Site).where(Site.id == site_id)
    res = await db.execute(stmt)
    site = res.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    # Load page types
    pt_stmt = select(PageType).where(PageType.site_id == site_id).order_by(desc(PageType.page_count))
    pt_res = await db.execute(pt_stmt)
    page_types = pt_res.scalars().all()

    # Load latest crawl
    crawl_stmt = select(Crawl).where(Crawl.site_id == site_id).order_by(desc(Crawl.started_at))
    crawl_res = await db.execute(crawl_stmt)
    latest_crawl = crawl_res.scalars().first()

    crawl_info = None
    if latest_crawl:
        crawl_info = {
            "id": latest_crawl.id,
            "status": latest_crawl.status,
            "pages_discovered": latest_crawl.pages_discovered,
            "pages_fetched": latest_crawl.pages_fetched,
            "pages_failed": latest_crawl.pages_failed,
            "speed_pages_per_sec": latest_crawl.speed_pages_per_sec,
            "estimated_time_remaining_sec": latest_crawl.estimated_time_remaining_sec,
            "error_message": latest_crawl.error_message,
            "started_at": latest_crawl.started_at.isoformat() if latest_crawl.started_at else None,
            "completed_at": latest_crawl.completed_at.isoformat() if latest_crawl.completed_at else None
        }

    return {
        "id": site.id,
        "domain": site.domain,
        "start_url": site.start_url,
        "status": site.status,
        "score": site.score,
        "level": site.level,
        "options": site.options,
        "robots_data": site.robots_data,
        "page_count": site.page_count,
        "extracted_count": site.extracted_count,
        "error_message": site.error_message,
        "crawl": crawl_info,
        "created_at": site.created_at.isoformat() if site.created_at else None,
        "updated_at": site.updated_at.isoformat() if site.updated_at else None,
        "page_types": [
            {
                "id": pt.id,
                "name": pt.name,
                "pattern": pt.pattern,
                "is_listing": pt.is_listing,
                "is_included": pt.is_included,
                "selectors": pt.selectors,
                "fields": pt.fields,
                "sample_urls": pt.sample_urls,
                "sample_rows": pt.sample_rows,
                "page_count": pt.page_count,
                "extracted_count": pt.extracted_count
            }
            for pt in page_types
        ]
    }


@router.patch("/{site_id}/types/{type_id}")
async def update_page_type(
    site_id: str,
    type_id: str,
    req: PageTypeUpdateRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Updates a PageType configuration (rename, toggle inclusion, edit selectors / field definitions).
    """
    stmt = select(PageType).where(PageType.id == type_id, PageType.site_id == site_id)
    res = await db.execute(stmt)
    page_type = res.scalar_one_or_none()
    if not page_type:
        raise HTTPException(status_code=404, detail="PageType not found")

    if req.name is not None:
        page_type.name = req.name.strip()
    if req.is_included is not None:
        page_type.is_included = req.is_included
    if req.is_listing is not None:
        page_type.is_listing = req.is_listing
    if req.selectors is not None:
        page_type.selectors = req.selectors
    if req.fields is not None:
        page_type.fields = req.fields

    await db.commit()
    await db.refresh(page_type)

    return {
        "id": page_type.id,
        "name": page_type.name,
        "pattern": page_type.pattern,
        "is_listing": page_type.is_listing,
        "is_included": page_type.is_included,
        "selectors": page_type.selectors,
        "fields": page_type.fields,
        "page_count": page_type.page_count,
        "extracted_count": page_type.extracted_count
    }


@router.post("/{site_id}/extract", status_code=status.HTTP_202_ACCEPTED)
async def start_extraction(
    site_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """
    Triggers full site extraction across all included page types.
    """
    stmt = select(Site).where(Site.id == site_id)
    res = await db.execute(stmt)
    site = res.scalar_one_or_none()
    if not site:
        raise HTTPException(status_code=404, detail="Site not found")

    background_tasks.add_task(execute_site_extraction_task, site.id)

    return {
        "site_id": site.id,
        "status": "extracting",
        "message": "Full site extraction started."
    }


@router.post("/{site_id}/pause")
async def pause_extraction(site_id: str):
    """Pauses an active extraction job."""
    set_site_control_flag(site_id, "paused")
    return {"site_id": site_id, "status": "paused"}


@router.post("/{site_id}/resume", status_code=status.HTTP_202_ACCEPTED)
async def resume_extraction(site_id: str, background_tasks: BackgroundTasks):
    """Resumes a paused extraction job."""
    set_site_control_flag(site_id, "running")
    background_tasks.add_task(execute_site_extraction_task, site_id)
    return {"site_id": site_id, "status": "extracting"}


@router.post("/{site_id}/cancel")
async def cancel_extraction(site_id: str):
    """Cancels an active extraction job."""
    set_site_control_flag(site_id, "cancelled")
    return {"site_id": site_id, "status": "cancelled"}


@router.post("/{site_id}/retry-failed", status_code=status.HTTP_202_ACCEPTED)
async def retry_failed(
    site_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    """Re-queues all failed pages and triggers extraction."""
    count = await retry_failed_pages(db, site_id)
    background_tasks.add_task(execute_site_extraction_task, site_id)
    return {
        "site_id": site_id,
        "requeued_count": count,
        "message": f"Re-queued {count} failed pages for retry."
    }


@router.get("/{site_id}/pages")
async def list_site_pages(
    site_id: str,
    status_filter: Optional[str] = Query(None, alias="status"),
    type_id: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
):
    """
    Lists discovered pages with filter and pagination support.
    """
    query = select(SitePage).where(SitePage.site_id == site_id)

    if status_filter:
        query = query.where(SitePage.status == status_filter)
    if type_id:
        query = query.where(SitePage.type_id == type_id)
    if search and search.strip():
        s = f"%{search.strip()}%"
        query = query.where(
            or_(
                SitePage.url.ilike(s),
                SitePage.error.ilike(s),
                SitePage.status.ilike(s)
            )
        )

    query = query.order_by(SitePage.depth.asc(), SitePage.url.asc()).limit(limit).offset(offset)
    res = await db.execute(query)
    pages = res.scalars().all()

    return {
        "site_id": site_id,
        "limit": limit,
        "offset": offset,
        "pages": [
            {
                "id": p.id,
                "url": p.url,
                "type_id": p.type_id,
                "status": p.status,
                "http_status": p.http_status,
                "depth": p.depth,
                "error": p.error,
                "fetched_at": p.fetched_at.isoformat() if p.fetched_at else None
            }
            for p in pages
        ]
    }


@router.get("/{site_id}/export")
async def export_site_data(
    site_id: str,
    type_id: Optional[str] = Query(None, alias="type"),
    export_format: str = Query("csv", alias="format"),
    db: AsyncSession = Depends(get_db)
):
    """
    Exports extracted data:
    - If format=zip: returns a .zip containing all page types with manifest.
    - If type_id provided: exports that page type in CSV, JSON, or XLSX.
    - Otherwise returns ZIP by default.
    """
    fmt = export_format.lower()

    if type_id and fmt in ("csv", "json", "xlsx"):
        try:
            data_bytes, media_type, filename = await export_page_type_data(db, type_id, export_format=fmt)
            return StreamingResponse(
                io.BytesIO(data_bytes),
                media_type=media_type,
                headers={"Content-Disposition": f'attachment; filename="{filename}"'}
            )
        except ValueError as e:
            raise HTTPException(status_code=404, detail=str(e))

    # ZIP multi-type export
    try:
        inner_fmt = "csv" if fmt == "zip" else fmt
        data_bytes, media_type, filename = await export_site_zip_archive(db, site_id, inner_format=inner_fmt)
        return StreamingResponse(
            io.BytesIO(data_bytes),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
