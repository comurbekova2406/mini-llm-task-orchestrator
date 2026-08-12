"""Database schema bootstrap helpers."""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text

from app.database import Base, engine

logger = logging.getLogger(__name__)


def ensure_schema() -> None:
    """Create tables and add columns introduced after the initial schema."""
    Base.metadata.create_all(bind=engine)
    inspector = inspect(engine)
    if "tasks" not in inspector.get_table_names():
        return

    column_names = {column["name"] for column in inspector.get_columns("tasks")}
    if "parent_task_id" not in column_names:
        logger.info("Adding parent_task_id column to tasks", extra={"event": "migrate"})
        with engine.begin() as connection:
            connection.execute(
                text(
                    "ALTER TABLE tasks "
                    "ADD COLUMN parent_task_id UUID REFERENCES tasks(id)"
                )
            )
            connection.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS ix_tasks_parent_task_id "
                    "ON tasks (parent_task_id)"
                )
            )
