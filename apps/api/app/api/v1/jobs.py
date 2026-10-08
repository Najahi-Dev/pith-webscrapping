import asyncio
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Response, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db, AsyncSessionLocal
from app.models import Job
from app.services.engine.job_runner import execute_extraction_job
from app.services.engine.exporter import export_to_csv, export_to_json, export_to_xlsx


router = APIRouter()


class CreateJobRequest(BaseModel):
    url: str
    method: Optional[str] = "http"  # "http" | "playwright"
    recipe_id: Optional[str] = None
    category_id: Optional[str] = None
    selectors: Optional[Dict[str, Any]] = None  # {"container": "...", "fields": {"title": "h2", "price": ".price"}}
    pagination: Optional[Dict[str, Any]] = None  # {"enabled": True, "max_pages": 5}
    cleaning_rules: Optional[Dict[str, Any]] = None
    key_field: Optional[str] = None
    custom_headers: Optional[Dict[str, str]] = None


class JobResponse(BaseModel):
    id: str
    url: str
    recipe_id: Optional[str] = None
    status: str
    method: str
    progress: Dict[str, Any]
    columns: List[str]
    row_count: int
    duration_ms: int
    error_message: Optional[str] = None
    created_at: Optional[str] = None
    completed_at: Optional[str] = None
    results: Optional[List[Dict[str, Any]]] = None
    raw_results: Optional[List[Dict[str, Any]]] = None


async def run_job_task(job_id: str):
    async with AsyncSessionLocal() as session:
        await execute_extraction_job(job_id, session)


@router.post("/jobs", response_model=JobResponse)
async def create_job(
    req: CreateJobRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
) -> JobResponse:
    """
    Creates and starts a data extraction job.
    Executes in the background and reports live progress.
    """
    options = {
        "method": req.method or "http",
        "category_id": req.category_id,
        "selectors": req.selectors,
        "pagination": req.pagination or {"enabled": False, "max_pages": 1},
        "cleaning_rules": req.cleaning_rules or {
            "trim_whitespace": True,
            "remove_duplicates": True,
            "normalize_prices": True,
            "normalize_dates": True,
            "make_urls_absolute": True
        },
        "key_field": req.key_field,
        "custom_headers": req.custom_headers
    }

    job = Job(
        url=req.url.strip(),
        recipe_id=req.recipe_id,
        method=req.method or "http",
        options=options,
        status="pending",
        progress={"current_page": 0, "max_pages": 1, "rows_extracted": 0, "percent": 0, "message": "Job created"}
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    # Launch background extraction task
    background_tasks.add_task(run_job_task, job.id)

    return JobResponse(
        id=job.id,
        url=job.url,
        recipe_id=job.recipe_id,
        status=job.status,
        method=job.method,
        progress=job.progress,
        columns=job.columns or [],
        row_count=job.row_count,
        duration_ms=job.duration_ms,
        error_message=job.error_message,
        created_at=job.created_at.isoformat() if job.created_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        results=[]
    )


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job(
    job_id: str,
    include_results: bool = Query(True),
    db: AsyncSession = Depends(get_db)
) -> JobResponse:
    """
    Retrieves job execution details, live progress, and extracted results.
    """
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    return JobResponse(
        id=job.id,
        url=job.url,
        recipe_id=job.recipe_id,
        status=job.status,
        method=job.method,
        progress=job.progress,
        columns=job.columns or [],
        row_count=job.row_count,
        duration_ms=job.duration_ms,
        error_message=job.error_message,
        created_at=job.created_at.isoformat() if job.created_at else None,
        completed_at=job.completed_at.isoformat() if job.completed_at else None,
        results=job.results if include_results else [],
        raw_results=job.raw_results if include_results else []
    )


@router.get("/jobs/{job_id}/export")
async def export_job(
    job_id: str,
    format: str = Query("csv", pattern="^(csv|json|xlsx)$"),
    cleaned: bool = Query(True),
    db: AsyncSession = Depends(get_db)
) -> Response:
    """
    Exports extracted job data to CSV, JSON, or Excel (.xlsx).
    """
    stmt = select(Job).where(Job.id == job_id)
    res = await db.execute(stmt)
    job = res.scalar_one_or_none()

    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    data = job.results if cleaned or not job.raw_results else job.raw_results

    filename_base = f"pith_export_{job_id[:8]}"

    if format == "csv":
        content = export_to_csv(data)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.csv"}
        )
    elif format == "json":
        content = export_to_json(data)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.json"}
        )
    elif format == "xlsx":
        content = export_to_xlsx(data)
        return Response(
            content=content,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename_base}.xlsx"}
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid export format")
