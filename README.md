# Vinci LLM Orchestrator

High-stakes LLM task orchestration for Vinci physics-analysis pipelines: a FastAPI **producer**, PostgreSQL system of record, Redis work queue, horizontally scalable **consumers**, Groq inference, and an industrial control SPA.

## Key features

- **Producer–Consumer messaging** — API enqueues work on Redis; workers never poll PostgreSQL for jobs
- **Context-aware task chaining** — child tasks prepend `parent.result['output']` into the prompt before Groq runs
- **Groq-backed inference** — real model responses with `output`, `model`, `token_usage`, `latency_ms`
- **Horizontal scale** — add worker containers to drain `task_queue` in parallel
- **Operator SPA** — live registry, dashboard KPIs, create + chain flows on port **3001**

## Architecture (Producer–Consumer)

```text
┌──────────────┐  POST /tasks   ┌─────────────┐  LPUSH id   ┌───────────────┐
│ Frontend UI  │ ─────────────► │ FastAPI API │ ──────────► │ Redis list    │
│ :3001        │ ◄─ GET /tasks ─│ + Postgres  │             │ task_queue    │
└──────────────┘   (poll 5s)    └─────────────┘             └───────┬───────┘
                                                                    │ BRPOP
                                                                    ▼
                                                          ┌─────────────────┐
                                                          │ Worker × N      │
                                                          │ chain → Groq    │
                                                          │ → UPDATE tasks  │
                                                          └─────────────────┘
```

1. **Producer (`app/main.py`)** — Persists a `PENDING` task, then `LPUSH`es the task UUID onto Redis `task_queue`.
2. **Broker (Redis)** — Durable-enough dispatch list; no DB busy-loop.
3. **Consumer (`worker_service.py`)** — Blocks on `redis.brpop("task_queue")`, applies chaining rules, calls Groq, writes `COMPLETED` / `FAILED` + JSON result.
4. **UI** — Polls `http://localhost:8000/tasks` every 5 seconds; **Chain Task** POSTs with `parent_task_id`.

## One-click setup (reviewer)

```bash
# 1) Configure secrets (required for real Groq completions)
cp backend/.env.example backend/.env
# Edit backend/.env and set GROQ_API_KEY=<your key from console.groq.com>
# Optional: GROQ_MODEL=llama-3.3-70b-versatile

# 2) Start the stack
docker compose up --build
```

| Service | URL |
|---------|-----|
| Control SPA | http://localhost:3001 |
| API docs | http://localhost:8000/docs |
| Health | http://localhost:8000/health |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

Smoke test:

```bash
curl -s -X POST http://localhost:8000/tasks \
  -H 'Content-Type: application/json' \
  -d '{"name":"audit-smoke","prompt":"Summarize chamber A lattice drift in two sentences."}' | jq

# Wait a few seconds, then:
curl -s http://localhost:8000/tasks | jq '.tasks[0] | {name,status,result}'
```

Stop:

```bash
docker compose down
```

## Scaling to 50+ workers

Workers are stateless consumers of the same Redis list. Redis `BRPOP` hands each task ID to **exactly one** worker.

```bash
docker compose up --build --scale worker=50
```

- Keep a single (or load-balanced) API producer writing to Postgres + Redis
- Scale only the `worker` service — no code changes
- Throughput grows roughly with worker count until Groq rate limits or DB write capacity saturate

## Context-aware task chaining

When a task has `parent_task_id`:

| Parent state | Child behavior |
|--------------|----------------|
| `PENDING` / `RUNNING` | Child returns to `PENDING` and is **requeued** until the parent finishes |
| Missing / `FAILED` / no `result.output` | Child marked `FAILED` with `"Error: Parent task did not complete successfully."` |
| `COMPLETED` with `result['output']` | Prompt becomes `Context from previous task: {output}\n\nUser Instruction: {child prompt}` |

In the SPA, use **Chain Task** on a completed job — the create form sends `parent_task_id` in the POST body.

## Stack

| Layer | Technology |
|-------|------------|
| API | FastAPI + Pydantic + CORS |
| DB | PostgreSQL 15 + SQLAlchemy 2 |
| Queue | Redis 7 (`task_queue`) |
| Worker | `worker_service.py` + Groq Python SDK |
| Frontend | HTML / Tailwind / Chart.js |
| Runtime | Docker Compose |

## Project layout

```text
.
├── docker-compose.yml
├── README.md
├── frontend/                 # SPA (nginx → :3001)
│   ├── index.html
│   ├── app.js                # fetch http://localhost:8000/tasks
│   └── nginx.conf
└── backend/
    ├── Dockerfile
    ├── requirements.txt
    ├── worker_service.py     # BRPOP consumer
    ├── .env.example
    └── app/
        ├── main.py           # Producer + CORS + enqueue
        ├── config.py         # GROQ_API_KEY / env settings
        ├── redis_client.py   # LPUSH / BRPOP helpers
        ├── chaining.py       # parent.result['output'] merge
        ├── llm.py            # Groq client
        ├── models.py
        ├── schemas.py
        ├── database.py
        ├── schema.py
        └── logging_config.py
```

## Environment

| Variable | Required | Notes |
|----------|----------|-------|
| `GROQ_API_KEY` | Yes (worker) | Loaded via `app/config.py` from `backend/.env`; never commit |
| `GROQ_MODEL` | No | Default `llama-3.3-70b-versatile` |
| `DATABASE_URL` | Compose sets | Points at service `db` in Docker |
| `REDIS_URL` | Compose sets | Points at service `redis` in Docker |

`.env` is gitignored. Use `.env.example` placeholders only.

## API

- `POST /tasks` — create + enqueue (`parent_task_id` optional)
- `GET /tasks` — list (newest first)
- `GET /tasks/{id}` — detail + LLM result
- `GET /health` — API + Redis ping

## Security notes

- API keys never appear in responses, frontend JS, or structured success logs
- Worker errors are sanitized before persistence
- CORS allows `http://localhost:3001` (and `*` without credentials) for the SPA
