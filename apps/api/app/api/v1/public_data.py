import secrets
import time
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, Header, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db
from app.models import Recipe, Job, ApiKey
from app.services.engine.exporter import export_to_csv, export_to_json


router = APIRouter()

# In-memory token bucket rate limiter for public endpoints
RATE_LIMIT_STORE: Dict[str, List[float]] = {}


def check_rate_limit(key: str, limit_per_minute: int = 60) -> None:
    now = time.time()
    if key not in RATE_LIMIT_STORE:
        RATE_LIMIT_STORE[key] = []
    
    # Filter out requests older than 60s
    RATE_LIMIT_STORE[key] = [t for t in RATE_LIMIT_STORE[key] if now - t < 60]
    
    if len(RATE_LIMIT_STORE[key]) >= limit_per_minute:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded ({limit_per_minute} req/min). Please throttle requests."
        )
        
    RATE_LIMIT_STORE[key].append(now)


class ApiKeyCreate(BaseModel):
    name: str
    rate_limit_per_minute: Optional[int] = 60


class ApiKeyResponse(BaseModel):
    id: str
    key: str
    name: str
    rate_limit_per_minute: int
    is_active: bool
    created_at: Optional[str] = None


@router.post("/keys", response_model=ApiKeyResponse)
async def create_api_key(req: ApiKeyCreate, db: AsyncSession = Depends(get_db)) -> ApiKeyResponse:
    """Generates a new API key for public endpoints."""
    raw_key = f"pith_live_{secrets.token_hex(16)}"
    api_key = ApiKey(
        key=raw_key,
        name=req.name,
        rate_limit_per_minute=req.rate_limit_per_minute or 60,
        is_active=True
    )
    db.add(api_key)
    await db.commit()
    await db.refresh(api_key)

    return ApiKeyResponse(
        id=api_key.id,
        key=api_key.key,
        name=api_key.name,
        rate_limit_per_minute=api_key.rate_limit_per_minute,
        is_active=api_key.is_active,
        created_at=api_key.created_at.isoformat() if api_key.created_at else None
    )


@router.get("/keys", response_model=List[ApiKeyResponse])
async def list_api_keys(db: AsyncSession = Depends(get_db)) -> List[ApiKeyResponse]:
    """Lists all active API keys."""
    stmt = select(ApiKey).order_by(desc(ApiKey.created_at))
    res = await db.execute(stmt)
    keys = res.scalars().all()
    return [
        ApiKeyResponse(
            id=k.id,
            key=k.key,
            name=k.name,
            rate_limit_per_minute=k.rate_limit_per_minute,
            is_active=k.is_active,
            created_at=k.created_at.isoformat() if k.created_at else None
        )
        for k in keys
    ]


@router.get("/r/{slug}/data")
async def get_public_recipe_data(
    slug: str,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=500),
    format: str = Query("json", pattern="^(json|csv)$"),
    filter_field: Optional[str] = None,
    filter_val: Optional[str] = None,
    x_api_key: Optional[str] = Header(None),
    db: AsyncSession = Depends(get_db)
) -> Response:
    """
    Public data endpoint for a saved recipe.
    Returns the latest successful dataset with pagination, filtering, and JSON/CSV streaming.
    """
    # 1. Fetch recipe
    stmt = select(Recipe).where(Recipe.slug == slug)
    res = await db.execute(stmt)
    recipe = res.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail=f"Recipe '{slug}' not found")

    # 2. Check API key if required
    rate_limit = 60
    rate_key = f"ip_{slug}"
    if recipe.api_key_required or x_api_key:
        if not x_api_key:
            raise HTTPException(status_code=401, detail="X-Api-Key header is required for this recipe")
        key_stmt = select(ApiKey).where(ApiKey.key == x_api_key, ApiKey.is_active == True)
        key_res = await db.execute(key_stmt)
        key_record = key_res.scalar_one_or_none()
        if not key_record:
            raise HTTPException(status_code=403, detail="Invalid or inactive API key")
        rate_limit = key_record.rate_limit_per_minute
        rate_key = x_api_key

    # Apply rate limiting
    check_rate_limit(rate_key, limit_per_minute=rate_limit)

    # 3. Fetch latest completed job
    job_stmt = (
        select(Job)
        .where(Job.recipe_id == recipe.id, Job.status == "completed")
        .order_by(desc(Job.completed_at))
        .limit(1)
    )
    job_res = await db.execute(job_stmt)
    job = job_res.scalar_one_or_none()

    if not job or not job.results:
        # Return empty response if no runs yet
        results_data: List[Dict[str, Any]] = []
        total_rows = 0
        last_updated = None
    else:
        results_data = job.results
        total_rows = len(results_data)
        last_updated = job.completed_at.isoformat() if job.completed_at else None

    # Apply optional field filter
    if filter_field and filter_val:
        results_data = [
            r for r in results_data
            if filter_field in r and filter_val.lower() in str(r[filter_field]).lower()
        ]
        total_rows = len(results_data)

    # Apply pagination
    offset = (page - 1) * limit
    paged_rows = results_data[offset : offset + limit]

    if format == "csv":
        csv_content = export_to_csv(paged_rows)
        return Response(
            content=csv_content,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"inline; filename={slug}_data.csv",
                "X-Total-Count": str(total_rows),
                "X-Page": str(page)
            }
        )

    response_payload = {
        "recipe": {
            "slug": recipe.slug,
            "name": recipe.name,
            "target_url": recipe.url,
            "last_updated": last_updated
        },
        "pagination": {
            "page": page,
            "limit": limit,
            "total_rows": total_rows,
            "total_pages": max(1, (total_rows + limit - 1) // limit)
        },
        "data": paged_rows
    }

    return Response(
        content=export_to_json(response_payload),
        media_type="application/json",
        headers={
            "X-Total-Count": str(total_rows),
            "X-Page": str(page)
        }
    )
