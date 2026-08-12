"""Groq-backed LLM execution for Vinci task processing."""

from __future__ import annotations

import logging
import re
import time
from typing import Any

from groq import APIError, AuthenticationError, Groq, RateLimitError

from app.config import ConfigurationError, settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = (
    "You are Vinci's physics-analysis assistant. Provide clear, precise "
    "technical analysis suitable for a high-stakes simulation pipeline."
)


class LLMConfigurationError(Exception):
    """Raised when the worker is misconfigured (e.g. missing API key)."""


class LLMExecutionError(Exception):
    """Raised when a Groq request fails or returns an unusable response."""


def sanitize_error_message(message: str) -> str:
    """Strip secrets from error strings before logging or persisting."""
    redacted = re.sub(
        r"(?i)(api[_-]?key|authorization|bearer)\s*[:=]\s*\S+",
        r"\1=[REDACTED]",
        message,
    )
    redacted = re.sub(r"gsk_[A-Za-z0-9]+", "[REDACTED]", redacted)
    return redacted


def execute_llm(prompt: str) -> dict[str, Any]:
    """
    Call Groq chat completions and return Vinci result metadata.

    Returns:
        dict with keys: output, model, token_usage, latency_ms
    """
    try:
        api_key = settings.require_groq_api_key()
    except ConfigurationError as exc:
        raise LLMConfigurationError(str(exc)) from exc

    model = settings.groq_model
    client = Groq(api_key=api_key)

    started = time.perf_counter()
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt},
            ],
            temperature=0.2,
        )
    except AuthenticationError as exc:
        logger.error(
            "Groq authentication failed",
            extra={"event": "llm_auth_error", "status": "FAILED"},
        )
        raise LLMExecutionError(
            "Groq authentication failed. Check that GROQ_API_KEY is valid."
        ) from exc
    except RateLimitError as exc:
        logger.error(
            "Groq rate limit exceeded",
            extra={"event": "llm_rate_limit", "status": "FAILED"},
        )
        raise LLMExecutionError("Groq rate limit exceeded. Retry later.") from exc
    except APIError as exc:
        logger.error(
            "Groq API request failed",
            extra={"event": "llm_api_error", "status": "FAILED"},
        )
        raise LLMExecutionError("Groq API request failed.") from exc
    except Exception as exc:  # noqa: BLE001
        logger.error(
            "Unexpected Groq client error",
            extra={"event": "llm_unexpected_error", "status": "FAILED"},
        )
        raise LLMExecutionError("Unexpected error while calling Groq.") from exc
    finally:
        del api_key

    elapsed_ms = int((time.perf_counter() - started) * 1000)

    if not completion.choices:
        raise LLMExecutionError("Groq returned no choices.")

    message = completion.choices[0].message
    output = (message.content or "").strip() if message is not None else ""
    if not output:
        raise LLMExecutionError("Groq returned an empty response.")

    usage = completion.usage
    prompt_tokens = int(getattr(usage, "prompt_tokens", 0) or 0) if usage else 0
    completion_tokens = int(getattr(usage, "completion_tokens", 0) or 0) if usage else 0
    total_tokens = (
        int(getattr(usage, "total_tokens", 0) or 0)
        if usage
        else (prompt_tokens + completion_tokens)
    )

    resolved_model = completion.model or model

    logger.info(
        "Groq LLM completed",
        extra={
            "event": "llm_complete",
            "status": "COMPLETED",
            "model": resolved_model,
            "latency_ms": elapsed_ms,
        },
    )

    return {
        "output": output,
        "model": resolved_model,
        "token_usage": {
            "prompt": prompt_tokens,
            "completion": completion_tokens,
            "total": total_tokens,
        },
        "latency_ms": elapsed_ms,
    }
