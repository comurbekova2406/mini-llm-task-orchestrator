"""Redis connection helpers for the task queue."""

from __future__ import annotations

import logging
from collections.abc import Generator

from redis import Redis

from app.config import settings

logger = logging.getLogger(__name__)

TASK_QUEUE_KEY = "task_queue"

_redis_client: Redis | None = None


def get_redis_url() -> str:
    return settings.redis_url


def create_redis_client() -> Redis:
    """Create a new Redis client bound to REDIS_URL."""
    client = Redis.from_url(
        get_redis_url(),
        decode_responses=True,
        socket_connect_timeout=5,
        health_check_interval=30,
    )
    return client


def get_redis() -> Redis:
    """Return a process-wide Redis client (lazy singleton)."""
    global _redis_client
    if _redis_client is None:
        _redis_client = create_redis_client()
    return _redis_client


def close_redis() -> None:
    """Close the shared Redis client if it was opened."""
    global _redis_client
    if _redis_client is not None:
        _redis_client.close()
        _redis_client = None


def enqueue_task(task_id: str, client: Redis | None = None) -> int:
    """
    Push a task ID onto the Redis list queue (producer side).

    Returns the new queue length after the push.
    """
    redis_client = client or get_redis()
    length = int(redis_client.lpush(TASK_QUEUE_KEY, task_id))
    logger.info(
        "Enqueued task",
        extra={"task_id": task_id, "queue": TASK_QUEUE_KEY, "event": "enqueue", "count": length},
    )
    return length


def brpop_task(timeout: int = 5, client: Redis | None = None) -> str | None:
    """
    Blocking pop from the task queue (consumer side).

    Uses redis.brpop — no PostgreSQL polling.
    Returns the task ID string, or None on timeout.
    """
    redis_client = client or get_redis()
    item = redis_client.brpop(TASK_QUEUE_KEY, timeout=timeout)
    if item is None:
        return None
    _, task_id = item
    return str(task_id)


def redis_dependency() -> Generator[Redis, None, None]:
    """FastAPI dependency that yields the shared Redis client."""
    yield get_redis()
