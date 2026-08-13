# Mini LLM Task Orchestrator

## Overview

This is a small LLM task orchestrator. You submit a prompt, optionally schedule it, and a worker runs one queued job at a time against Groq. Results and status history are stored in Postgres and shown in a simple UI. A task can also chain off a previous one: the parent’s output is prepended to the child’s prompt before the LLM call.

## Architecture / Flow

FastAPI is the HTTP layer. Postgres is the system of record for tasks and results. Redis holds a `task_queue` list so creating a task is decoupled from executing it. A separate worker process blocks on `BRPOP` (no database polling), applies chaining and schedule checks, calls Groq, then writes the result back to Postgres. The Next.js UI polls `GET /tasks` every 5 seconds for status updates.

```text
Next.js UI
   │  POST /tasks
   ▼
FastAPI  ── save row (PENDING) ──► Postgres
   │
   │  LPUSH task id
   ▼
Redis (task_queue)
   │  BRPOP
   ▼
Worker  ── Groq chat completion ──► Postgres (COMPLETED / FAILED)
   │
   ▼
Next.js polls GET /tasks
```

| Layer | Technology |
|-------|------------|
| Frontend | Next.js (App Router) + Tailwind + React |
| API | FastAPI + Pydantic |
| DB | PostgreSQL 15 + SQLAlchemy 2 |
| Queue | Redis 7 (`task_queue`) |
| Worker | Python + Groq SDK |

Default Compose runs one worker, so jobs execute one at a time. Extra workers can share the same Redis list if you scale that service.

## What's implemented

- **Task creation** — `POST /tasks` validates input, writes a Postgres row, then `LPUSH`es the task ID onto Redis. If enqueue fails, the row is marked `FAILED` instead of disappearing.
- **Background execution** — `worker_service.py` consumes `task_queue` via `BRPOP`, sets `RUNNING`, then `COMPLETED` / `FAILED`. Scheduled tasks that are not due yet are requeued.
- **LLM call** — Groq Python SDK (`GROQ_API_KEY`). Result JSON includes `output`, `model`, `token_usage`, and `latency_ms`. Requests time out after 30s.
- **Task history** — `GET /tasks` and `GET /tasks/{id}`. The Next.js UI lists status pills and opens a detail panel with the stored result.
- **Task chaining (bonus)** — optional `parent_task_id`. If the parent is still running, the child is requeued. If the parent is missing or failed, the child fails. If the parent completed, `parent.result['output']` is prepended to the child prompt.
- **Frontend** — Next.js App Router SPA: dashboard (KPIs + Chart.js), registry, create form, 5s polling, chain-task flow.

## Setup / How to run

```bash
cp backend/.env.example backend/.env
# Edit backend/.env and set GROQ_API_KEY
# Optional: GROQ_MODEL=llama-3.3-70b-versatile

docker compose up --build
```

| Service | URL |
|---------|-----|
| UI | http://localhost:3001 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

Smoke test:

```bash
curl -s -X POST http://localhost:8000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"name":"smoke","prompt":"Summarize this in one sentence: hello."}' | jq

# Wait a few seconds, then:
curl -s http://localhost:8000/tasks | jq '.tasks[0] | {name,status,result}'
```

Stop:

```bash
docker compose down
```

Tests (from `backend/`):

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
python -m pytest -q
```

## My approach and why

**Redis instead of polling Postgres or using Celery.** A blocking list (`BRPOP`) is the smallest way to decouple “accept the request” from “call the model.” Polling Postgres burns connections and adds delay. Celery would solve the same problem with more moving parts (broker + result backend + workers) than this assignment needs.

**FastAPI instead of Flask or Django.** The API is a handful of CRUD endpoints plus Pydantic schemas that already match the SQLAlchemy model. FastAPI gives typed request/response validation and `/docs` with little extra code. Django’s ORM/admin would be unused weight here.

**Requeue-and-check for schedules, not a second scheduler process.** Scheduled tasks still go on the same Redis list. If a worker pops a job whose `scheduled_at` is in the future, it pushes the ID back and waits briefly. That keeps one consumer path for immediate and delayed work. A dedicated scheduler (or Redis delayed queues) would be cleaner at scale; it was not worth a second process for this size.

**Chaining waits for the parent instead of requiring it to already be `COMPLETED`.** The UI can enqueue a child as soon as the parent exists. If the parent is still `PENDING`/`RUNNING`, the child is put back on the queue. That matches how a pipeline actually runs. Failing immediately unless the parent is done would force the user to poll and click twice.

## Known limitations / what I'd improve with more time

- No cancel endpoint. Once a job is `RUNNING`, you cannot stop the Groq call.
- The UI has no search or status filters; it renders the full list.
- There is a basic stale-task reaper: `RUNNING` rows older than 5 minutes are reset to `PENDING` and re-enqueued. Remaining edge case: a slow-but-alive worker can still be holding the job when the reaper requeues it, so two workers could process the same task. A proper fix needs a `worker_id` / lease column (or compare-and-swap on `updated_at`) so only an expired lease is stolen.
- Tests are smoke-level (chaining helpers, secret redaction, mocked `POST /tasks`). There are no integration tests against real Redis/Postgres/Groq.

## API reference

Full schemas live at http://localhost:8000/docs.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/tasks` | Create a task and enqueue it (`scheduled_at` and `parent_task_id` optional) |
| `GET` | `/tasks` | List tasks, newest first |
| `GET` | `/tasks/{id}` | Fetch one task, including LLM `result` |
| `GET` | `/health` | Liveness plus Redis ping |
