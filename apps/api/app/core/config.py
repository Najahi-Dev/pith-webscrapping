import os
from typing import List, Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(case_sensitive=True, env_file=".env", extra="ignore")

    PROJECT_NAME: str = "pith"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/v1"
    
    # Environment
    ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
    DEBUG: bool = os.getenv("DEBUG", "true").lower() == "true"
    
    # Server & CORS
    SERVER_HOST: str = os.getenv("SERVER_HOST", "0.0.0.0")
    SERVER_PORT: int = int(os.getenv("SERVER_PORT", "8000"))
    CORS_ORIGINS: List[str] = ["*"]
    
    # Database (PostgreSQL or SQLite fallback for local dev)
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", 
        "sqlite+aiosqlite:///./pith.db"
    )
    
    # Redis for queue & rate-limiting
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Polite Crawler Identity
    BOT_NAME: str = "PithBot"
    BOT_VERSION: str = "1.0"
    BOT_CONTACT_URL: str = "https://github.com/pith-systems/pith"
    DEFAULT_USER_AGENT: str = "Mozilla/5.0 (compatible; PithBot/1.0; +https://github.com/pith-systems/pith; contact: bot@pith.dev)"
    
    # Scraping safety limits
    MAX_PAGE_LIMIT: int = int(os.getenv("MAX_PAGE_LIMIT", "50"))
    MAX_PAYLOAD_BYTES: int = int(os.getenv("MAX_PAYLOAD_BYTES", "15728640"))  # 15 MB
    REQUEST_TIMEOUT_SECONDS: float = float(os.getenv("REQUEST_TIMEOUT_SECONDS", "15.0"))
    DEFAULT_RATE_LIMIT_DELAY: float = float(os.getenv("DEFAULT_RATE_LIMIT_DELAY", "0.5"))
    
    # AI Optional Settings
    ENABLE_AI_SUGGESTIONS: bool = os.getenv("ENABLE_AI_SUGGESTIONS", "false").lower() == "true"
    AI_PROVIDER: Optional[str] = os.getenv("AI_PROVIDER", None)
    AI_API_KEY: Optional[str] = os.getenv("AI_API_KEY", None)
    AI_MODEL: Optional[str] = os.getenv("AI_MODEL", "gpt-4o-mini")


settings = Settings()
