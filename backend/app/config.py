"""Centralized environment configuration for the task orchestrator."""

from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()

DEFAULT_GROQ_MODEL = None
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

    return Settings(
        database_url=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        redis_url=os.getenv("REDIS_URL", DEFAULT_REDIS_URL),
        groq_api_key=groq_key,
    )


def get_groq_model() -> str:
    """
    Read GROQ_MODEL from the environment on every call.

    This is intentionally NOT cached on Settings, so changing GROQ_MODEL
    in the environment takes effect on the next LLM call without needing
    to restart the process.
    """
    model = os.getenv("GROQ_MODEL", "").strip()
    if not model:
        raise ConfigurationError(
            "GROQ_MODEL is missing. Add it to backend/.env "
            "(see backend/.env.example) or set it in the environment."
        )
    return model

settings: Settings = load_settings()
