from functools import lru_cache
from pathlib import Path
from pydantic import Field, model_validator
from typing import Literal
from urllib.parse import urlsplit
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    database_url: str
    secret_key: str = Field(min_length=32)
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    access_token_minutes: int = Field(default=15, ge=5, le=30)
    cors_origins: str = "http://localhost:5173"
    refresh_token_days: int = Field(default=7, ge=1, le=30)
    cookie_secure: bool = True
    cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    environment: Literal["development", "production", "test"] = "production"

    @model_validator(mode="after")
    def secure_configuration(self):
        if self.secret_key.startswith("replace-"):
            raise ValueError("Generate a unique SECRET_KEY before starting the API")

        if self.cookie_samesite == "none" and not self.cookie_secure:
            raise ValueError("SameSite=None requires Secure cookies")

        if self.environment == "production" and not self.cookie_secure:
            raise ValueError("Production requires Secure cookies")

        for origin in self.cors_origins.split(","):
            parsed = urlsplit(origin.strip())

            if (
                not parsed.hostname
                or parsed.scheme not in ("https", "http")
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
                or "*" in origin
            ):
                raise ValueError("CORS_ORIGINS must contain exact browser origins")

            if self.environment == "production" and parsed.scheme != "https":
                raise ValueError(
                    "Production browser origins must use HTTPS"
                )

        return self

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        extra="ignore"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()