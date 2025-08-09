"""Application configuration using Pydantic Settings."""
from functools import lru_cache
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings."""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )
    
    # App settings
    ENVIRONMENT: str = Field(default="development")
    LOG_LEVEL: str = Field(default="INFO")
    
    # Security
    ALLOWED_HOSTS: List[str] = Field(default=["*"])
    ALLOWED_ORIGINS: List[str] = Field(default=["*"])
    
    # Database
    DATABASE_URL: str = Field(..., description="PostgreSQL database URL")
    
    # Supabase Auth settings
    SUPABASE_URL: str = Field(..., description="Supabase project URL")
    SUPABASE_JWT_SECRET: str = Field(..., description="Supabase JWT secret for token verification")
    SUPABASE_SERVICE_KEY: str = Field(..., description="Supabase service role key")
    
    # JWT settings
    JWT_ALGORITHM: str = Field(default="HS256")
    ACCESS_TOKEN_EXPIRE_MINUTES: int = Field(default=30)

    # Redis / Realtime
    REDIS_URL: str = Field(default="redis://localhost:6379/0")
    WS_PING_INTERVAL_SECONDS: int = Field(default=25)
    WS_IDLE_TIMEOUT_SECONDS: int = Field(default=90)


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings() 