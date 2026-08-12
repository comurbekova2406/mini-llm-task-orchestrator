"""Task chaining helpers shared by the API and worker."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import Task, TaskStatus

PARENT_FAILURE_MESSAGE = "Error: Parent task did not complete successfully."


class ParentNotReadyError(Exception):
    """Parent exists but is still PENDING or RUNNING — child should be requeued."""


class ParentInvalidError(Exception):
    """Parent is missing, failed, or lacks a usable result['output']."""


def build_chained_prompt(parent_output: str, child_prompt: str) -> str:
    """Prepend parent.result['output'] context to the child user instruction."""
    return (
        f"Context from previous task: {parent_output}\n\n"
        f"User Instruction: {child_prompt}"
    )


def resolve_execution_prompt(db: Session, task: Task) -> str:
    """
    Resolve the prompt for LLM execution, applying context-aware chaining.

    - No parent → original prompt
    - Parent PENDING/RUNNING → ParentNotReadyError (caller should requeue)
    - Parent missing / FAILED / COMPLETED without result['output'] → ParentInvalidError
    - Parent COMPLETED with result['output'] → chained prompt
    """
    if task.parent_task_id is None:
        return task.prompt

    parent = db.get(Task, task.parent_task_id)
    if parent is None:
        raise ParentInvalidError(PARENT_FAILURE_MESSAGE)

    if parent.status in {TaskStatus.PENDING, TaskStatus.RUNNING}:
        raise ParentNotReadyError(
            f"Parent task {parent.id} is still {parent.status.value}"
        )

    if parent.status != TaskStatus.COMPLETED:
        raise ParentInvalidError(PARENT_FAILURE_MESSAGE)

    result = parent.result if isinstance(parent.result, dict) else None
    parent_output = result.get("output") if result else None
    if not isinstance(parent_output, str) or not parent_output.strip():
        raise ParentInvalidError(PARENT_FAILURE_MESSAGE)

    return build_chained_prompt(parent_output, task.prompt)
