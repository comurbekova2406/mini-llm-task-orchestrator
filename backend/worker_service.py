"""
Task worker — Redis consumer.

Blocks on `task_queue` via BRPOP, processes one task at a time per process,
and writes results back to PostgreSQL. Scale horizontally by running many
replicas of this service against the same Redis list.
"""

from __future__ import annotations

import logging
import signal
import sys
import time
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis import Redis
from sqlalchemy.orm import Session

from app.chaining import (
    PARENT_FAILURE_MESSAGE,
    ParentInvalidError,
    ParentNotReadyError,
    resolve_execution_prompt,
)
from app.database import SessionLocal
from app.llm import LLMConfigurationError, LLMExecutionError, execute_llm, sanitize_error_message
from app.logging_config import configure_logging
from app.models import Task, TaskStatus
from app.redis_client import brpop_task, create_redis_client, enqueue_task
from app.schema import ensure_schema

configure_logging()
logger = logging.getLogger("worker")

_shutdown = False
STALE_AFTER_SECONDS = 300
REAP_INTERVAL_SECONDS = 60


def _handle_signal(signum: int, _frame: object) -> None:
    global _shutdown
    logger.info(
        "Shutdown signal received",
        extra={"event": "shutdown_signal", "status": str(signum)},
    )
    _shutdown = True


def reap_stale_tasks(
    db: Session,
    redis_client: Redis,
    stale_after_seconds: int = 300,
) -> int:
    """
    Recover tasks stuck in RUNNING longer than stale_after_seconds.

    Resets each match to PENDING, clears result, and re-enqueues the task ID.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(seconds=stale_after_seconds)
    stale_tasks = (
        db.query(Task)
        .filter(Task.status == TaskStatus.RUNNING)
        .filter(Task.updated_at < cutoff)
        .all()
    )
    recovered = 0
    for task in stale_tasks:
        task.status = TaskStatus.PENDING
        task.result = None
        task.updated_at = datetime.now(timezone.utc)
        db.commit()
        enqueue_task(str(task.id), client=redis_client)
        logger.warning(
            "Recovered stale running task",
            extra={"task_id": str(task.id), "event": "stale_reap", "status": "PENDING"},
        )
        recovered += 1
    return recovered


def process_task(task_id: str) -> None:
    """Load a task, run the Groq LLM pipeline, and persist the outcome."""
    db = SessionLocal()
    try:
        try:
            uuid = UUID(task_id)
        except ValueError:
            logger.error(
                "Invalid task ID on queue",
                extra={"task_id": task_id, "event": "invalid_id"},
            )
            return

        task = db.get(Task, uuid)
        if task is None:
            logger.error(
                "Task not found in database",
                extra={"task_id": task_id, "event": "missing_task"},
            )
            return

        if task.status in {TaskStatus.COMPLETED, TaskStatus.FAILED}:
            logger.info(
                "Skipping terminal task",
                extra={"task_id": task_id, "event": "skip", "status": task.status.value},
            )
            return

        now = datetime.now(timezone.utc)
        if task.scheduled_at is not None and task.scheduled_at > now:
            enqueue_task(task_id)
            delay = min(2.0, (task.scheduled_at - now).total_seconds())
            logger.info(
                "Task not due; requeued",
                extra={"task_id": task_id, "event": "reschedule", "status": "PENDING"},
            )
            time.sleep(max(0.2, delay))
            return

        task.status = TaskStatus.RUNNING
        task.updated_at = now
        db.commit()
        logger.info(
            "Task running",
            extra={"task_id": task_id, "event": "running", "status": "RUNNING"},
        )

        try:
            prompt = resolve_execution_prompt(db, task)
        except ParentNotReadyError:
            task.status = TaskStatus.PENDING
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
            enqueue_task(task_id)
            logger.info(
                "Parent not ready; child requeued",
                extra={"task_id": task_id, "event": "parent_wait", "status": "PENDING"},
            )
            time.sleep(0.5)
            return
        except ParentInvalidError:
            task.status = TaskStatus.FAILED
            task.result = {
                "output": PARENT_FAILURE_MESSAGE,
                "error": "PARENT_TASK_INVALID",
            }
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
            logger.warning(
                "Parent chain failed",
                extra={"task_id": task_id, "event": "parent_failed", "status": "FAILED"},
            )
            return

        try:
            result = execute_llm(prompt)
            task.status = TaskStatus.COMPLETED
            task.result = result
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
            logger.info(
                "Task completed",
                extra={"task_id": task_id, "event": "completed", "status": "COMPLETED"},
            )
        except LLMConfigurationError as exc:
            safe_message = sanitize_error_message(str(exc))
            logger.error(
                "LLM configuration error",
                extra={"task_id": task_id, "event": "llm_config_error", "status": "FAILED"},
            )
            task.status = TaskStatus.FAILED
            task.result = {
                "output": safe_message,
                "error": "LLM_CONFIGURATION_ERROR",
            }
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
        except LLMExecutionError as exc:
            safe_message = sanitize_error_message(str(exc))
            logger.error(
                "LLM execution failed",
                extra={"task_id": task_id, "event": "llm_error", "status": "FAILED"},
            )
            task.status = TaskStatus.FAILED
            task.result = {
                "output": safe_message,
                "error": "LLM_EXECUTION_FAILED",
            }
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
        except Exception:  # noqa: BLE001 - worker must not die on one bad task
            logger.exception(
                "Unhandled LLM failure",
                extra={"task_id": task_id, "event": "llm_unexpected", "status": "FAILED"},
            )
            task.status = TaskStatus.FAILED
            task.result = {
                "output": "Error: LLM execution failed.",
                "error": "LLM_EXECUTION_FAILED",
            }
            task.updated_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        db.close()


def run_worker() -> None:
    """Main BRPOP loop — one message at a time per worker process."""
    ensure_schema()
    redis_client = create_redis_client()
    redis_client.ping()
    logger.info("Worker started", extra={"event": "startup", "queue": "task_queue"})

    last_reap_at = time.monotonic()
    while not _shutdown:
        try:
            now = time.monotonic()
            if now - last_reap_at >= REAP_INTERVAL_SECONDS:
                db = SessionLocal()
                try:
                    reap_stale_tasks(
                        db,
                        redis_client,
                        stale_after_seconds=STALE_AFTER_SECONDS,
                    )
                finally:
                    db.close()
                last_reap_at = time.monotonic()

            task_id = brpop_task(timeout=5, client=redis_client)
            if task_id is None:
                continue
            logger.info(
                "Dequeued task",
                extra={"task_id": task_id, "event": "dequeue", "queue": "task_queue"},
            )
            process_task(task_id)
        except Exception:  # noqa: BLE001
            logger.exception("Unhandled worker error", extra={"event": "worker_error"})
            time.sleep(1)

    redis_client.close()
    logger.info("Worker stopped", extra={"event": "shutdown"})


def main() -> None:
    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)
    run_worker()
    sys.exit(0)


if __name__ == "__main__":
    main()
