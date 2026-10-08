from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.database import init_db
from app.services.scheduler.cron_service import start_scheduler, stop_scheduler, sync_scheduled_recipes
from app.api.v1.check import router as check_router
from app.api.v1.detect import router as detect_router
from app.api.v1.preview import router as preview_router
from app.api.v1.jobs import router as jobs_router
from app.api.v1.recipes import router as recipes_router
from app.api.v1.public_data import router as public_data_router
from app.api.v1.ai import router as ai_router
from app.api.v1.sites import router as sites_router
from app.api.v1.proxies import router as proxies_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await init_db()
    start_scheduler()
    try:
        await sync_scheduled_recipes()
    except Exception:
        pass
    yield
    # Shutdown
    stop_scheduler()


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="pith - High-density intelligent web scraping API",
    lifespan=lifespan
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API V1 Routers
app.include_router(check_router, prefix=settings.API_V1_STR, tags=["Safety & Check"])
app.include_router(detect_router, prefix=settings.API_V1_STR, tags=["Data Detection"])
app.include_router(preview_router, prefix=settings.API_V1_STR, tags=["Visual Preview"])
app.include_router(jobs_router, prefix=settings.API_V1_STR, tags=["Extraction Jobs"])
app.include_router(recipes_router, prefix=settings.API_V1_STR, tags=["Recipes & Schedules"])
app.include_router(public_data_router, prefix=settings.API_V1_STR, tags=["Public API & Keys"])
app.include_router(ai_router, prefix=settings.API_V1_STR, tags=["AI Suggestions"])
app.include_router(sites_router, prefix=settings.API_V1_STR, tags=["Site Mode Crawling"])
app.include_router(proxies_router, prefix=settings.API_V1_STR, tags=["Stealth & Proxy Pool"])


@app.get("/", tags=["Root"])
async def root():
    return {
        "name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "status": "online",
        "docs": "/docs",
        "bot_user_agent": settings.DEFAULT_USER_AGENT
    }


@app.get("/health", tags=["Health"])
async def health():
    return {"status": "healthy"}
