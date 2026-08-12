"""FastAPI entrypoint — producer side of the Vinci task orchestrator."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import Any
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from redis import Redis
from sqlalchemy.orm import Session

from app.database import get_db
from app.logging_config import configure_logging
from app.models import Task, TaskStatus
from app.redis_client import close_redis, enqueue_task, get_redis, redis_dependency
from app.schema import ensure_schema
from app.schemas import TaskCreate, TaskListResponse, TaskResponse

configure_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    redis_client = get_redis()
    redis_client.ping()
    logger.info("API ready", extra={"event": "startup"})
    try:
        yield
    finally:
        close_redis()
        logger.info("API shutdown", extra={"event": "shutdown"})


app = FastAPI(
    title="Vinci LLM Orchestrator",
    description=(
        "Producer API for Vinci LLM tasks. Persists jobs in PostgreSQL and "
        "enqueues work onto Redis for horizontal worker consumers."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",
    ],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health(redis_client: Redis = Depends(redis_dependency)) -> dict[str, Any]:
    redis_ok = False
    try:
        redis_ok = bool(redis_client.ping())
    except Exception:  # noqa: BLE001
        logger.exception("Redis health check failed", extra={"event": "health"})
    return {"status": "ok" if redis_ok else "degraded", "redis": redis_ok}


@app.post(
    "/tasks",
    response_model=TaskResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new LLM task",
)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    redis_client: Redis = Depends(redis_dependency),
) -> Task:
    if payload.parent_task_id is not None:
        parent = db.get(Task, payload.parent_task_id)
        if parent is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parent task {payload.parent_task_id} not found",
            )

    task = Task(
        name=payload.name,
        prompt=payload.prompt,
        status=TaskStatus.PENDING,
        scheduled_at=payload.scheduled_at,
        parent_task_id=payload.parent_task_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    enqueue_task(str(task.id), client=redis_client)
    logger.info(
        "Task created and enqueued",
        extra={"task_id": str(task.id), "event": "create", "status": task.status.value},
    )
    return task


@app.get(
    "/tasks",
    response_model=TaskListResponse,
    summary="List all tasks",
)
def list_tasks(db: Session = Depends(get_db)) -> TaskListResponse:
    tasks = db.query(Task).order_by(Task.created_at.desc()).all()
    return TaskListResponse(tasks=tasks, total=len(tasks))


@app.get(
    "/tasks/{task_id}",
    response_model=TaskResponse,
    summary="Get a task by ID",
)
def get_task(task_id: UUID, db: Session = Depends(get_db)) -> Task:
    task = db.get(Task, task_id)
    if task is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Task {task_id} not found",
        )
    return task
