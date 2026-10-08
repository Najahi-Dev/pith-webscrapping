import asyncio
import logging
from typing import Optional
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from sqlalchemy import select
from app.core.database import AsyncSessionLocal
from app.models import Recipe, Job
from app.services.engine.job_runner import execute_extraction_job

logger = logging.getLogger("pith.scheduler")
scheduler = AsyncIOScheduler()


async def execute_scheduled_recipe(recipe_id: str):
    logger.info(f"Triggering scheduled job for recipe: {recipe_id}")
    async with AsyncSessionLocal() as session:
        stmt = select(Recipe).where(Recipe.id == recipe_id, Recipe.is_active == True)
        res = await session.execute(stmt)
        recipe = res.scalar_one_or_none()
        if not recipe:
            return

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
            progress={"current_page": 0, "max_pages": 1, "rows_extracted": 0, "percent": 0, "message": f"Scheduled run for '{recipe.name}'"}
        )
        session.add(job)
        await session.commit()
        await session.refresh(job)

        await execute_extraction_job(job.id, session)


def map_schedule_to_cron(schedule_str: str) -> Optional[CronTrigger]:
    s = schedule_str.lower().strip()
    if s == "hourly":
        return CronTrigger(minute="0")
    elif s == "daily":
        return CronTrigger(hour="0", minute="0")
    elif s == "weekly":
        return CronTrigger(day_of_week="mon", hour="0", minute="0")
    elif " " in s and len(s.split()) == 5:
        # Standard 5-field cron expression
        p = s.split()
        return CronTrigger(minute=p[0], hour=p[1], day=p[2], month=p[3], day_of_week=p[4])
    return None


async def sync_scheduled_recipes():
    """Syncs recipes from the database with the in-memory APScheduler."""
    async with AsyncSessionLocal() as session:
        stmt = select(Recipe).where(Recipe.is_active == True)
        res = await session.execute(stmt)
        recipes = res.scalars().all()

        for r in recipes:
            job_id = f"recipe_schedule_{r.id}"
            if scheduler.get_job(job_id):
                scheduler.remove_job(job_id)

            if r.schedule_cron and r.schedule_cron != "manual":
                trigger = map_schedule_to_cron(r.schedule_cron)
                if trigger:
                    scheduler.add_job(
                        execute_scheduled_recipe,
                        trigger=trigger,
                        args=[r.id],
                        id=job_id,
                        replace_existing=True
                    )
                    logger.info(f"Registered schedule '{r.schedule_cron}' for recipe '{r.name}'")


def start_scheduler():
    if not scheduler.running:
        scheduler.start()
        logger.info("Pith APScheduler started.")


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown()
