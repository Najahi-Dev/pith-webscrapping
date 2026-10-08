import re
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from app.core.database import get_db, AsyncSessionLocal
from app.models import Recipe, Job, ChangeRecord
from app.services.engine.job_runner import execute_extraction_job


router = APIRouter()


def slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower()).strip()
    s = re.sub(r"[-\s]+", "-", s)
    return s or str(uuid.uuid4())[:8]


class RecipeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    url: str
    method: Optional[str] = "http"
    category_id: Optional[str] = None
    selectors: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, Any]] = None
    cleaning_rules: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = "manual"
    alert_rules: Optional[Dict[str, Any]] = None
    api_key_required: Optional[bool] = False


class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    url: Optional[str] = None
    method: Optional[str] = None
    category_id: Optional[str] = None
    selectors: Optional[Dict[str, Any]] = None
    pagination: Optional[Dict[str, Any]] = None
    cleaning_rules: Optional[Dict[str, Any]] = None
    schedule_cron: Optional[str] = None
    alert_rules: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None
    api_key_required: Optional[bool] = None


class RecipeResponse(BaseModel):
    id: str
    slug: str
    name: str
    description: Optional[str] = None
    url: str
    method: str
    category_id: Optional[str] = None
    selectors: Dict[str, Any]
    pagination: Dict[str, Any]
    cleaning_rules: Dict[str, Any]
    schedule_cron: Optional[str] = None
    alert_rules: Dict[str, Any]
    is_active: bool
    api_key_required: bool
    last_run_at: Optional[str] = None
    last_status: Optional[str] = None
    last_row_count: int = 0
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


async def run_recipe_job_task(job_id: str):
    async with AsyncSessionLocal() as session:
        await execute_extraction_job(job_id, session)


@router.get("/recipes", response_model=List[RecipeResponse])
async def list_recipes(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db)
) -> List[RecipeResponse]:
    """Lists all saved recipes."""
    stmt = select(Recipe).order_by(desc(Recipe.created_at)).offset(offset).limit(limit)
    res = await db.execute(stmt)
    recipes = res.scalars().all()
    return [
        RecipeResponse(
            id=r.id,
            slug=r.slug,
            name=r.name,
            description=r.description,
            url=r.url,
            method=r.method,
            category_id=r.category_id,
            selectors=r.selectors or {},
            pagination=r.pagination or {},
            cleaning_rules=r.cleaning_rules or {},
            schedule_cron=r.schedule_cron,
            alert_rules=r.alert_rules or {},
            is_active=r.is_active,
            api_key_required=r.api_key_required,
            last_run_at=r.last_run_at.isoformat() if r.last_run_at else None,
            last_status=r.last_status,
            last_row_count=r.last_row_count,
            created_at=r.created_at.isoformat() if r.created_at else None,
            updated_at=r.updated_at.isoformat() if r.updated_at else None
        )
        for r in recipes
    ]


@router.post("/recipes", response_model=RecipeResponse)
async def create_recipe(
    req: RecipeCreate,
    db: AsyncSession = Depends(get_db)
) -> RecipeResponse:
    """Creates a new scraper recipe."""
    base_slug = slugify(req.name)
    slug = f"{base_slug}-{str(uuid.uuid4())[:6]}"

    recipe = Recipe(
        slug=slug,
        name=req.name,
        description=req.description,
        url=req.url.strip(),
        method=req.method or "http",
        category_id=req.category_id,
        selectors=req.selectors or {},
        pagination=req.pagination or {"enabled": False, "max_pages": 1},
        cleaning_rules=req.cleaning_rules or {
            "trim_whitespace": True,
            "remove_duplicates": True,
            "normalize_prices": True,
            "normalize_dates": True,
            "make_urls_absolute": True
        },
        schedule_cron=req.schedule_cron or "manual",
        alert_rules=req.alert_rules or {"notify_on_change": True, "key_field": None, "rules": []},
        api_key_required=req.api_key_required or False
    )
    db.add(recipe)
    await db.commit()
    await db.refresh(recipe)

    return RecipeResponse(
        id=recipe.id,
        slug=recipe.slug,
        name=recipe.name,
        description=recipe.description,
        url=recipe.url,
        method=recipe.method,
        category_id=recipe.category_id,
        selectors=recipe.selectors,
        pagination=recipe.pagination,
        cleaning_rules=recipe.cleaning_rules,
        schedule_cron=recipe.schedule_cron,
        alert_rules=recipe.alert_rules,
        is_active=recipe.is_active,
        api_key_required=recipe.api_key_required,
        last_run_at=None,
        last_status=None,
        last_row_count=0,
        created_at=recipe.created_at.isoformat() if recipe.created_at else None,
        updated_at=recipe.updated_at.isoformat() if recipe.updated_at else None
    )


@router.get("/recipes/{recipe_id}", response_model=RecipeResponse)
async def get_recipe(recipe_id: str, db: AsyncSession = Depends(get_db)) -> RecipeResponse:
    """Gets details of a recipe by ID or slug."""
    stmt = select(Recipe).where((Recipe.id == recipe_id) | (Recipe.slug == recipe_id))
    res = await db.execute(stmt)
    recipe = res.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    return RecipeResponse(
        id=recipe.id,
        slug=recipe.slug,
        name=recipe.name,
        description=recipe.description,
        url=recipe.url,
        method=recipe.method,
        category_id=recipe.category_id,
        selectors=recipe.selectors or {},
        pagination=recipe.pagination or {},
        cleaning_rules=recipe.cleaning_rules or {},
        schedule_cron=recipe.schedule_cron,
        alert_rules=recipe.alert_rules or {},
        is_active=recipe.is_active,
        api_key_required=recipe.api_key_required,
        last_run_at=recipe.last_run_at.isoformat() if recipe.last_run_at else None,
        last_status=recipe.last_status,
        last_row_count=recipe.last_row_count,
        created_at=recipe.created_at.isoformat() if recipe.created_at else None,
        updated_at=recipe.updated_at.isoformat() if recipe.updated_at else None
    )


@router.put("/recipes/{recipe_id}", response_model=RecipeResponse)
async def update_recipe(
    recipe_id: str,
    req: RecipeUpdate,
    db: AsyncSession = Depends(get_db)
) -> RecipeResponse:
    """Updates an existing recipe."""
    stmt = select(Recipe).where(Recipe.id == recipe_id)
    res = await db.execute(stmt)
    recipe = res.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    for field, val in req.model_dump(exclude_unset=True).items():
        setattr(recipe, field, val)

    await db.commit()
    await db.refresh(recipe)

    return RecipeResponse(
        id=recipe.id,
        slug=recipe.slug,
        name=recipe.name,
        description=recipe.description,
        url=recipe.url,
        method=recipe.method,
        category_id=recipe.category_id,
        selectors=recipe.selectors or {},
        pagination=recipe.pagination or {},
        cleaning_rules=recipe.cleaning_rules or {},
        schedule_cron=recipe.schedule_cron,
        alert_rules=recipe.alert_rules or {},
        is_active=recipe.is_active,
        api_key_required=recipe.api_key_required,
        last_run_at=recipe.last_run_at.isoformat() if recipe.last_run_at else None,
        last_status=recipe.last_status,
        last_row_count=recipe.last_row_count,
        created_at=recipe.created_at.isoformat() if recipe.created_at else None,
        updated_at=recipe.updated_at.isoformat() if recipe.updated_at else None
    )


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, db: AsyncSession = Depends(get_db)) -> Dict[str, Any]:
    """Deletes a recipe."""
    stmt = select(Recipe).where(Recipe.id == recipe_id)
    res = await db.execute(stmt)
    recipe = res.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    await db.delete(recipe)
    await db.commit()
    return {"message": "Recipe deleted successfully", "id": recipe_id}


@router.post("/recipes/{recipe_id}/duplicate", response_model=RecipeResponse)
async def duplicate_recipe(recipe_id: str, db: AsyncSession = Depends(get_db)) -> RecipeResponse:
    """Duplicates a recipe."""
    stmt = select(Recipe).where(Recipe.id == recipe_id)
    res = await db.execute(stmt)
    orig = res.scalar_one_or_none()
    if not orig:
        raise HTTPException(status_code=404, detail="Recipe not found")

    dup_name = f"{orig.name} (Copy)"
    base_slug = slugify(dup_name)
    slug = f"{base_slug}-{str(uuid.uuid4())[:6]}"

    dup = Recipe(
        slug=slug,
        name=dup_name,
        description=orig.description,
        url=orig.url,
        method=orig.method,
        category_id=orig.category_id,
        selectors=orig.selectors,
        pagination=orig.pagination,
        cleaning_rules=orig.cleaning_rules,
        schedule_cron=orig.schedule_cron,
        alert_rules=orig.alert_rules,
        is_active=orig.is_active,
        api_key_required=orig.api_key_required
    )
    db.add(dup)
    await db.commit()
    await db.refresh(dup)

    return RecipeResponse(
        id=dup.id,
        slug=dup.slug,
        name=dup.name,
        description=dup.description,
        url=dup.url,
        method=dup.method,
        category_id=dup.category_id,
        selectors=dup.selectors or {},
        pagination=dup.pagination or {},
        cleaning_rules=dup.cleaning_rules or {},
        schedule_cron=dup.schedule_cron,
        alert_rules=dup.alert_rules or {},
        is_active=dup.is_active,
        api_key_required=dup.api_key_required,
        last_run_at=None,
        last_status=None,
        last_row_count=0,
        created_at=dup.created_at.isoformat() if dup.created_at else None,
        updated_at=dup.updated_at.isoformat() if dup.updated_at else None
    )


@router.post("/recipes/{recipe_id}/run")
async def run_recipe(
    recipe_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
) -> Dict[str, Any]:
    """Triggers an immediate execution of the recipe."""
    stmt = select(Recipe).where(Recipe.id == recipe_id)
    res = await db.execute(stmt)
    recipe = res.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    options = {
        "method": recipe.method,
        "category_id": recipe.category_id,
        "selectors": recipe.selectors,
        "pagination": recipe.pagination,
        "cleaning_rules": recipe.cleaning_rules,
        "key_field": (recipe.alert_rules or {}).get("key_field")
    }

    job = Job(
        url=recipe.url,
        recipe_id=recipe.id,
        method=recipe.method,
        options=options,
        status="pending",
        progress={"current_page": 0, "max_pages": 1, "rows_extracted": 0, "percent": 0, "message": f"Starting recipe '{recipe.name}'"}
    )
    db.add(job)
    await db.commit()
    await db.refresh(job)

    background_tasks.add_task(run_recipe_job_task, job.id)

    return {
        "message": f"Recipe '{recipe.name}' triggered",
        "recipe_id": recipe.id,
        "job_id": job.id
    }


@router.get("/recipes/{recipe_id}/runs")
async def list_recipe_runs(
    recipe_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Lists past execution runs and history for a recipe."""
    stmt = select(Job).where(Job.recipe_id == recipe_id).order_by(desc(Job.created_at)).limit(limit)
    res = await db.execute(stmt)
    jobs = res.scalars().all()

    return [
        {
            "id": j.id,
            "status": j.status,
            "row_count": j.row_count,
            "duration_ms": j.duration_ms,
            "error_message": j.error_message,
            "created_at": j.created_at.isoformat() if j.created_at else None,
            "completed_at": j.completed_at.isoformat() if j.completed_at else None
        }
        for j in jobs
    ]


@router.get("/recipes/{recipe_id}/changes")
async def list_recipe_changes(
    recipe_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
) -> List[Dict[str, Any]]:
    """Lists change detection diff history and alert records for a recipe."""
    stmt = select(ChangeRecord).where(ChangeRecord.recipe_id == recipe_id).order_by(desc(ChangeRecord.created_at)).limit(limit)
    res = await db.execute(stmt)
    records = res.scalars().all()

    return [
        {
            "id": c.id,
            "job_id": c.job_id,
            "added_count": c.added_count,
            "removed_count": c.removed_count,
            "modified_count": c.modified_count,
            "diff_summary": c.diff_summary,
            "alert_triggered": c.alert_triggered,
            "alert_messages": c.alert_messages,
            "created_at": c.created_at.isoformat() if c.created_at else None
        }
        for c in records
    ]
