from datetime import datetime, timezone
from unittest.mock import MagicMock, patch
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient

from app.database import get_db
from app.main import app
from app.models import Task, TaskStatus
from app.redis_client import redis_dependency


class _FakeDB:
    def __init__(self) -> None:
        self.tasks: dict[UUID, Task] = {}

    def get(self, _model: object, task_id: UUID) -> Task | None:
        return self.tasks.get(task_id)

    def add(self, task: Task) -> None:
        if task.id is None:
            task.id = uuid4()
        now = datetime.now(timezone.utc)
        if getattr(task, "created_at", None) is None:
            task.created_at = now
        if getattr(task, "updated_at", None) is None:
            task.updated_at = now
        if getattr(task, "status", None) is None:
            task.status = TaskStatus.PENDING
        self.tasks[task.id] = task

    def commit(self) -> None:
        return None

    def refresh(self, task: Task) -> None:
        stored = self.tasks.get(task.id)
        if stored is None:
            return
        task.status = stored.status
        task.result = stored.result


@pytest.fixture
def fake_db() -> _FakeDB:
    return _FakeDB()


@pytest.fixture
def client(fake_db: _FakeDB):
    def override_get_db():
        yield fake_db

    def override_redis():
        yield MagicMock()

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[redis_dependency] = override_redis

    with (
        patch("app.main.ensure_schema"),
        patch("app.main.get_redis") as mock_get_redis,
        patch("app.main.enqueue_task", return_value=1) as mock_enqueue,
    ):
        mock_get_redis.return_value.ping.return_value = True
        with TestClient(app) as test_client:
            yield test_client, mock_enqueue

    app.dependency_overrides.clear()


def test_post_tasks_returns_201_and_is_fetchable(client, fake_db: _FakeDB) -> None:
    test_client, mock_enqueue = client

    response = test_client.post(
        "/tasks",
        json={"name": "audit-smoke", "prompt": "Summarize chamber A drift."},
    )
    assert response.status_code == 201
    body = response.json()
    task_id = body["id"]
    assert body["name"] == "audit-smoke"
    assert body["status"] == "PENDING"
    mock_enqueue.assert_called_once()

    fetched = test_client.get(f"/tasks/{task_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == task_id
    assert fetched.json()["prompt"] == "Summarize chamber A drift."
    assert UUID(task_id) in fake_db.tasks
