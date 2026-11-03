from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "icarus-local-development-secret-not-for-production"


class Settings(BaseSettings):
    """Every setting comes from the environment (or a `.env` file next to the service), never from code."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: Literal["development", "test", "production"] = "development"
    database_url: str = "sqlite:///./data/community.db"
    files_dir: Path = Path("./data/files")
    public_url: str = "http://127.0.0.1:8790"
    cors_origins: list[str] = Field(default_factory=list)

    # Empty in development: the service signs its own tokens (dev auth). Set it to verify Supabase tokens by JWKS.
    supabase_url: str = ""
    # Legacy HS256 projects verify with the project's JWT secret instead of JWKS.
    supabase_jwt_secret: str = ""
    supabase_audience: str = "authenticated"
    # Lets deleting an account also delete its Supabase identity; never needed by the desktop app.
    supabase_service_role_key: str = ""

    dev_auth: bool = False
    dev_jwt_secret: str = DEV_JWT_SECRET

    moderator_emails: list[str] = Field(default_factory=list)
    # When on, new creations wait for a moderator before they are listed.
    moderation_required: bool = False

    writes_per_minute: int = Field(default=60, ge=1)
    max_bundle_bytes: int = Field(default=8 * 1024 * 1024, ge=1024)
    max_image_bytes: int = Field(default=2 * 1024 * 1024, ge=1024)

    @model_validator(mode="after")
    def _safe_auth(self) -> "Settings":
        if self.env == "production" and self.dev_auth:
            raise ValueError("DEV_AUTH is refused when ENV=production")
        if self.env == "production" and not (self.supabase_url or self.supabase_jwt_secret):
            raise ValueError("ENV=production needs SUPABASE_URL or SUPABASE_JWT_SECRET to verify sign-ins")
        if self.env == "production" and "*" in self.cors_origins:
            raise ValueError("CORS_ORIGINS cannot be * in production")
        return self

    @property
    def auth_mode(self) -> Literal["supabase", "dev"]:
        return "dev" if self.dev_auth else "supabase"


@lru_cache
def load_settings() -> Settings:
    return Settings()
