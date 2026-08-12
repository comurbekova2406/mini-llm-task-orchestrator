"""Centralized environment configuration for the Vinci orchestrator."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
DEFAULT_REDIS_URL = "redis://localhost:6379/0"
DEFAULT_DATABASE_URL = (
    "postgresql+psycopg2://orchestrator:orchestrator@localhost:5432/orchestrator"
)


class ConfigurationError(Exception):
    """Raised when a required environment variable is missing or invalid."""


@dataclass(frozen=True)
class Settings:
    """Runtime settings loaded from the process environment."""

    database_url: str
    redis_url: str
    groq_api_key: str | None
    groq_model: str

    def require_groq_api_key(self) -> str:
        """
        Return GROQ_API_KEY or raise a clear configuration error.

        Never log or return the key from callers' error paths intended for clients.
        """
        if not self.groq_api_key:
            raise ConfigurationError(
                "GROQ_API_KEY is missing. Add it to backend/.env "
                "(see backend/.env.example) and restart the worker."
            )
        return self.groq_api_key


def load_settings() -> Settings:
    """Load settings from environment variables."""
    groq_key = os.getenv("GROQ_API_KEY", "").strip() or None
    groq_model = os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL).strip() or DEFAULT_GROQ_MODEL
    return Settings(
        database_url=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        redis_url=os.getenv("REDIS_URL", DEFAULT_REDIS_URL),
        groq_api_key=groq_key,
        groq_model=groq_model,
    )


settings: Settings = load_settings()
