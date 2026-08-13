from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.chaining import ParentInvalidError, ParentNotReadyError, resolve_execution_prompt
from app.models import TaskStatus


def test_no_parent_returns_original_prompt() -> None:
    task = MagicMock()
    task.parent_task_id = None
    task.prompt = "analyze chamber A drift"
    db = MagicMock()

    assert resolve_execution_prompt(db, task) == "analyze chamber A drift"
    db.get.assert_not_called()


def test_parent_running_raises_not_ready() -> None:
    parent_id = uuid4()
    task = MagicMock()
    task.parent_task_id = parent_id
    task.prompt = "expand the findings"

    parent = MagicMock()
    parent.id = parent_id
    parent.status = TaskStatus.RUNNING

    db = MagicMock()
    db.get.return_value = parent

    with pytest.raises(ParentNotReadyError):
        resolve_execution_prompt(db, task)
    db.get.assert_called_once()


def test_parent_failed_raises_invalid() -> None:
    parent_id = uuid4()
    task = MagicMock()
    task.parent_task_id = parent_id
    task.prompt = "expand the findings"

    parent = MagicMock()
    parent.id = parent_id
    parent.status = TaskStatus.FAILED
    parent.result = {"output": "previous failure", "error": "LLM_EXECUTION_FAILED"}

    db = MagicMock()
    db.get.return_value = parent

    with pytest.raises(ParentInvalidError):
        resolve_execution_prompt(db, task)


def test_parent_completed_merges_output_into_prompt() -> None:
    parent_id = uuid4()
    task = MagicMock()
    task.parent_task_id = parent_id
    task.prompt = "expand the findings"

    parent = MagicMock()
    parent.id = parent_id
    parent.status = TaskStatus.COMPLETED
    parent.result = {"output": "Chamber A drifted +0.18 eV."}

    db = MagicMock()
    db.get.return_value = parent

    prompt = resolve_execution_prompt(db, task)
    assert "Chamber A drifted +0.18 eV." in prompt
    assert "expand the findings" in prompt
    assert prompt.startswith("Context from previous task:")
