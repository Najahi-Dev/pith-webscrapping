import datetime
import uuid
from typing import Any, Dict, List, Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, JSON, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


def generate_uuid() -> str:
    return str(uuid.uuid4())


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    recipe_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)  # pending, running, completed, failed, cancelled
    method: Mapped[str] = mapped_column(String(32), default="http")  # http, playwright
    options: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    progress: Mapped[Dict[str, Any]] = mapped_column(
        JSON, 
        default=lambda: {"current_page": 0, "max_pages": 1, "rows_extracted": 0, "percent": 0, "message": "Queued"}
    )
    results: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list)
    raw_results: Mapped[Optional[List[Dict[str, Any]]]] = mapped_column(JSON, nullable=True)
    columns: Mapped[List[str]] = mapped_column(JSON, default=list)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    duration_ms: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    recipe: Mapped[Optional["Recipe"]] = relationship("Recipe", back_populates="jobs")


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    slug: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    method: Mapped[str] = mapped_column(String(32), default="http")
    category_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    selectors: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)  # {"container": "...", "fields": {"name": "...", "price": "..."}}
    pagination: Mapped[Dict[str, Any]] = mapped_column(JSON, default=lambda: {"enabled": False, "max_pages": 1})
    cleaning_rules: Mapped[Dict[str, Any]] = mapped_column(
        JSON, 
        default=lambda: {
            "trim_whitespace": True,
            "remove_duplicates": True,
            "normalize_prices": True,
            "normalize_dates": True,
            "make_urls_absolute": True
        }
    )
    schedule_cron: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, default="manual")  # manual, hourly, daily, weekly, or cron
    alert_rules: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        default=lambda: {"notify_on_change": True, "key_field": None, "webhook_url": None, "rules": []}
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    api_key_required: Mapped[bool] = mapped_column(Boolean, default=False)
    last_run_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_status: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    last_row_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    jobs: Mapped[List["Job"]] = relationship("Job", back_populates="recipe", cascade="all, delete-orphan")
    changes: Mapped[List["ChangeRecord"]] = relationship("ChangeRecord", back_populates="recipe", cascade="all, delete-orphan")


class ChangeRecord(Base):
    __tablename__ = "change_records"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    recipe_id: Mapped[str] = mapped_column(String(36), ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False, index=True)
    job_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    hash_key_field: Mapped[str] = mapped_column(String(128), default="auto")
    added_count: Mapped[int] = mapped_column(Integer, default=0)
    removed_count: Mapped[int] = mapped_column(Integer, default=0)
    modified_count: Mapped[int] = mapped_column(Integer, default=0)
    diff_summary: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    alert_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    alert_messages: Mapped[List[str]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="changes")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    key: Mapped[str] = mapped_column(String(128), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rate_limit_per_minute: Mapped[int] = mapped_column(Integer, default=60)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    domain: Mapped[str] = mapped_column(String(255), index=True, nullable=False)
    start_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="pending", index=True)  # pending, discovering, discovered, extracting, completed, failed
    options: Mapped[Dict[str, Any]] = mapped_column(
        JSON,
        default=lambda: {
            "method": "http",
            "max_pages": 100,
            "max_depth": 3,
            "crawl_delay": 0.2,
            "include_subdomains": False,
            "store_raw_html": False,
            "custom_headers": {}
        }
    )
    score: Mapped[int] = mapped_column(Integer, default=100)
    level: Mapped[str] = mapped_column(String(32), default="easy")
    robots_data: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    extracted_count: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    crawls: Mapped[List["Crawl"]] = relationship("Crawl", back_populates="site", cascade="all, delete-orphan")
    page_types: Mapped[List["PageType"]] = relationship("PageType", back_populates="site", cascade="all, delete-orphan")
    pages: Mapped[List["SitePage"]] = relationship("SitePage", back_populates="site", cascade="all, delete-orphan")
    extractions: Mapped[List["SiteExtraction"]] = relationship("SiteExtraction", back_populates="site", cascade="all, delete-orphan")


class Crawl(Base):
    __tablename__ = "crawls"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    site_id: Mapped[str] = mapped_column(String(36), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="running", index=True)  # running, paused, completed, failed, cancelled
    pages_discovered: Mapped[int] = mapped_column(Integer, default=0)
    pages_fetched: Mapped[int] = mapped_column(Integer, default=0)
    pages_failed: Mapped[int] = mapped_column(Integer, default=0)
    speed_pages_per_sec: Mapped[float] = mapped_column(Integer, default=0)
    estimated_time_remaining_sec: Mapped[int] = mapped_column(Integer, default=0)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    config: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)
    started_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    completed_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    site: Mapped["Site"] = relationship("Site", back_populates="crawls")


class PageType(Base):
    __tablename__ = "page_types"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    site_id: Mapped[str] = mapped_column(String(36), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)  # e.g. "Product Detail", "Blog Article", "Category Listing"
    pattern: Mapped[str] = mapped_column(String(512), nullable=False)  # e.g. "/product/{id}", "/blog/{slug}"
    is_listing: Mapped[bool] = mapped_column(Boolean, default=False)
    is_included: Mapped[bool] = mapped_column(Boolean, default=True)
    selectors: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict)  # container + fields
    fields: Mapped[List[str]] = mapped_column(JSON, default=list)  # list of field names
    sample_urls: Mapped[List[str]] = mapped_column(JSON, default=list)
    sample_rows: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list)
    page_count: Mapped[int] = mapped_column(Integer, default=0)
    extracted_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    site: Mapped["Site"] = relationship("Site", back_populates="page_types")
    pages: Mapped[List["SitePage"]] = relationship("SitePage", back_populates="page_type")
    extractions: Mapped[List["SiteExtraction"]] = relationship("SiteExtraction", back_populates="page_type", cascade="all, delete-orphan")


class SitePage(Base):
    __tablename__ = "site_pages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    site_id: Mapped[str] = mapped_column(String(36), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    crawl_id: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    type_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey("page_types.id", ondelete="SET NULL"), nullable=True, index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="queued", index=True)  # queued, fetching, fetched, extracting, extracted, failed, skipped
    http_status: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    depth: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    fetched_at: Mapped[Optional[datetime.datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    site: Mapped["Site"] = relationship("Site", back_populates="pages")
    page_type: Mapped[Optional["PageType"]] = relationship("PageType", back_populates="pages")
    extractions: Mapped[List["SiteExtraction"]] = relationship("SiteExtraction", back_populates="page", cascade="all, delete-orphan")


class SiteExtraction(Base):
    __tablename__ = "site_extractions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=generate_uuid)
    site_id: Mapped[str] = mapped_column(String(36), ForeignKey("sites.id", ondelete="CASCADE"), nullable=False, index=True)
    page_id: Mapped[str] = mapped_column(String(36), ForeignKey("site_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    type_id: Mapped[str] = mapped_column(String(36), ForeignKey("page_types.id", ondelete="CASCADE"), nullable=False, index=True)
    data: Mapped[List[Dict[str, Any]]] = mapped_column(JSON, default=list)
    row_count: Mapped[int] = mapped_column(Integer, default=0)
    data_hash: Mapped[str] = mapped_column(String(64), default="")
    extracted_at: Mapped[datetime.datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    site: Mapped["Site"] = relationship("Site", back_populates="extractions")
    page: Mapped["SitePage"] = relationship("SitePage", back_populates="extractions")
    page_type: Mapped["PageType"] = relationship("PageType", back_populates="extractions")
