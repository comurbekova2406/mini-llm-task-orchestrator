# AI-Assisted Development Log

The base implementation was built first (API, Postgres, UI, chaining, Redis worker, Groq), then reviewed against the assignment, then hardened with the following AI-assisted changes. Git history is coarse: the bulk of prompts 1–6 landed in commit `7f86e5d` (`added codebase`). Prompt 7 and 8 are uncommitted at the time this log was written (`git diff` / untracked files). File lists below are what was actually created or edited in this session, not only what the prompt named.

## Prompt 1: Foundational API and database layer

**Why:** Stand up FastAPI, SQLAlchemy `Task` model, CRUD endpoints, and local Postgres so the rest of the orchestrator had a real backend.

**Prompt:**

> Prompt 1: The Foundational API & Database Layer
>
> Role: Senior Backend Infrastructure Engineer
> Context: Building a Mini LLM Task Orchestrator for Vinci.
> Objective: Set up a FastAPI application with a PostgreSQL backend using SQLAlchemy to manage LLM task definitions and statuses.
>
> Requirements:
>
> Database Schema: Create a Task model in SQLAlchemy. Fields: id (UUID), name (String), prompt (Text), status (Enum: PENDING, RUNNING, COMPLETED, FAILED), result (JSONB), scheduled_at (DateTime, nullable), created_at (DateTime), updated_at (DateTime).
>
> API Endpoints (FastAPI): POST /tasks, GET /tasks, GET /tasks/{task_id}.
>
> Project Structure: app/main.py, app/models.py, app/schemas.py, app/database.py.
>
> Tooling: pydantic, psycopg2-binary, clean requirements.txt.
>
> Generate the boilerplate for this project. Use a modern FastAPI structure. Ensure that the database session is handled as a dependency in the API routes. Include a Docker-compose file that spins up a PostgreSQL 15 container for local development. and fill in nice readme.md

**Files changed:**

- `backend/app/__init__.py`
- `backend/app/database.py`
- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/main.py`
- `backend/requirements.txt`
- `backend/.env.example`
- `docker-compose.yml`
- `.gitignore`
- `README.md`

## Prompt 2: Frontend SPA

**Why:** Add an operator UI (dashboard, registry, create form) so tasks could be created and inspected without curl.

**Prompt:**

> Act as a Senior Frontend Engineer and UI/UX Designer. Build a sophisticated Single-Page Application (SPA) for the "Vinci LLM Orchestrator" using HTML5, Tailwind CSS, and Chart.js.
>
> Theme: Industrial Minimalist. Palette: background #fdfcfb, text #334155, accents #d97706. Three views: Dashboard (KPIs + doughnut/line charts), Task Registry (table + Explore), Create Task (name, prompt, immediate vs scheduled).
>
> Task inspection via modal/slide-over. Initialize with 5 mock tasks. Tailwind and Chart.js via CDN. No SVGs. Charts max-height 350px.

**Files changed:**

- `frontend/index.html`
- `frontend/app.js`
- `README.md`

## Prompt 3: Task chaining bonus

**Why:** Implement parent/child tasks so a later job can use a previous LLM output as context.

**Prompt:**

> We need to implement the "Task Chaining" bonus feature.
>
> 1. models.py: add parent_task_id (UUID FK, nullable) and a self-referential relationship.
> 2. schemas.py: optional parent_task_id on TaskCreate and TaskResponse.
> 3. Worker: if parent_task_id is set, fetch parent; fail child if parent did not complete; otherwise prepend parent result to the child prompt.
> 4. POST /tasks must persist parent_task_id.
> 5. Frontend: "Chain Task" on COMPLETED tasks, prefill parent id on the create form.
> 6. Change frontend port to 3001.

**Files changed:**

- `backend/app/models.py`
- `backend/app/schemas.py`
- `backend/app/main.py`
- `frontend/index.html`
- `frontend/app.js`
- `README.md`

## Prompt 4: Redis messaging layer and live UI

**Why:** Stop polling Postgres for work; enqueue task IDs on Redis and have a dedicated worker consume them. Wire the SPA to the real API.

**Prompt:**

> We are finalizing the orchestrator. Move from database polling to Redis and fully integrate the frontend.
>
> 1. docker-compose: redis:7-alpine on 6379; REDIS_URL on backend and worker.
> 2. FastAPI: redis-py client; POST /tasks LPUSH to task_queue; CORS for localhost:3001.
> 3. worker_service.py: BRPOP instead of DB polling; RUNNING → mock LLM → COMPLETED.
> 4. Frontend: drop mock arrays; fetchTasks() on load and every 5s; POST real tasks.
> 5. README: stack, producer-consumer, scaling, docker-compose up.

**Files changed:**

- `docker-compose.yml`
- `backend/Dockerfile`
- `backend/requirements.txt`
- `backend/.env.example`
- `backend/app/main.py`
- `backend/app/redis_client.py`
- `backend/app/logging_config.py`
- `backend/app/chaining.py`
- `backend/app/llm.py`
- `backend/app/schema.py`
- `backend/worker_service.py`
- `frontend/app.js`
- `frontend/nginx.conf`
- `README.md`

## Prompt 5: Real Groq LLM calls

**Why:** Replace the simulated response with the official Groq SDK, without committing a real API key.

**Prompt:**

> Update the backend to use the real Groq API instead of the simulated/mock LLM response.
>
> Use the official Groq Python SDK. Read GROQ_API_KEY from the environment. Do not hardcode the key. Do not write a real key into .env. Keep .env gitignored. Update .env.example with a placeholder only. Return output, model, latency_ms, token_usage. Handle missing key and API failures without leaking the key. Optional GROQ_MODEL.

**Files changed:**

- `backend/app/llm.py`
- `backend/worker_service.py`
- `backend/requirements.txt`
- `backend/.env.example`
- `docker-compose.yml`
- `backend/app/logging_config.py`
- `README.md`

(`.env` was not modified with a key, per the prompt.)

## Prompt 6: Pre-submit audit and production gaps

**Why:** Check Redis enqueue/BRPOP, chaining, CORS/UI, config/secrets, and README; fix anything that would break a one-click reviewer run.

**Prompt:**

> Perform a deep-dive audit for production readiness.
>
> Verify Redis LPUSH/BRPOP, chaining on parent.result['output'], CORS for localhost:3001, frontend fetch to :8000, docker-compose depends_on, app/config.py loading GROQ_API_KEY, .gitignore for .env, and rewrite README (producer-consumer, setup, chaining, scaling). Fix missing links or bugs.

**Files changed:**

- `backend/app/config.py` (created; this file was requested and did not exist)
- `backend/app/llm.py`
- `backend/app/chaining.py`
- `backend/worker_service.py`
- `backend/app/redis_client.py`
- `backend/app/database.py`
- `backend/app/main.py`
- `docker-compose.yml`
- `.gitignore`
- `README.md`

## Prompt 7: Timeout, enqueue failure, reaper, tests

**Why:** Close remaining reliability holes (hung Groq calls, Redis enqueue orphans, stuck RUNNING rows) and add a small pytest suite.

**Prompt:**

> Make the following changes. Keep existing style.
>
> 1. Groq timeout=30 in execute_llm(); catch APITimeoutError.
> 2. create_task(): if enqueue_task fails, mark FAILED and still return 201.
> 3. reap_stale_tasks() in the worker; run on a 60s monotonic timer without extra threads.
> 4. pytest tests for chaining, sanitize_error_message, and POST /tasks via TestClient. Add pytest/dev deps.

**Files changed:** (confirmed via `git diff` / untracked)

- `backend/app/llm.py`
- `backend/app/main.py`
- `backend/worker_service.py`
- `backend/pytest.ini`
- `backend/requirements-dev.txt`
- `backend/tests/__init__.py`
- `backend/tests/test_chaining.py`
- `backend/tests/test_llm_sanitize.py`
- `backend/tests/test_create_task.py`

## Prompt 8: Rewrite README for submission

**Why:** Strip fictional branding and write a short engineering README a reviewer can skim in a few minutes.

**Prompt:**

> Rewrite README.md from scratch. Remove all "Vinci" branding. Professional, direct tone. Sections: Overview, Architecture/Flow, What's implemented, Setup/How to run (keep docker-compose), My approach and why, Known limitations, API reference. Readable in 3–5 minutes.

**Files changed:** (confirmed via `git diff`)

- `README.md`

## Prompt 9: Document AI-assisted prompts

**Why:** Record which prompts produced which files so the submission can disclose AI assistance accurately.

**Prompt:**

> Generate a file called PROMPTS.md that documents the AI-assisted changes made to this project in this Cursor session. For each distinct prompt: the prompt text, why it was needed, and the files actually changed (cross-check git).

**Files changed:**

- `PROMPTS.md`

## Prompt 10: Port frontend to Next.js

**Why:** The assignment's Technical Expectations required React/Next.js for the frontend; the original vanilla JS + nginx SPA did not meet that, so this was a compliance fix.

**Prompt:**

> Convert the frontend from vanilla JS + nginx to a minimal Next.js app. Keep every existing feature and the same visual design — this is a framework port, not a redesign.
>
> Requirements:
>
> 1. Scaffold a minimal Next.js app in frontend/ (App Router, no TypeScript needed unless it's trivial to add, keep it simple)
>    - Use Tailwind (proper Tailwind setup via postcss, replacing the CDN `<script>` tag currently in index.html)
>    - Move fonts (Inter, IBM Plex Mono) into next/font or a standard `<link>` in the root layout
>
> 2. Port every feature currently in app.js and index.html into React components with equivalent behavior:
>    - Create-task form: name, prompt, immediate vs scheduled toggle, optional parent_task_id for chaining
>    - Task list/registry view with status pills
>    - Dashboard with KPIs and the latency/status charts (keep Chart.js, or swap to a React-friendly equivalent like recharts if that's cleaner — your call, just preserve the same charts)
>    - Task detail slide-over panel showing prompt, result, model, tokens, latency
>    - Polling GET /tasks every 5 seconds (use useEffect + setInterval, or a simple polling hook)
>    - "Chain Task" flow — using a completed task's output to prefill a new task's parent_task_id
>    - Toast notifications and form validation error states exactly as they currently behave
>
> 3. Replace window.API_BASE with a Next.js environment variable (NEXT_PUBLIC_API_BASE), defaulting to http://localhost:8000 if unset
>
> 4. Update the Docker setup:
>    - Replace frontend/nginx.conf and the current static-serving approach with a proper Next.js Dockerfile (multi-stage build: install deps, build, run `next start` or use `next build && next export` if a static export fits better given no server-side needs)
>    - Update docker-compose.yml's frontend service accordingly (build context, port mapping, env vars)
>
> 5. Delete the old app.js, index.html, and nginx.conf once the Next.js version fully replaces them — don't leave both versions in the repo
>
> After the frontend port is done:
>
> 6. Update README.md:
>    - In "What's implemented" and the architecture flow, change references to the old vanilla JS frontend to Next.js
>    - Update the "Stack" table: change Frontend row to Next.js (App Router) + Tailwind + React
>    - Update "Setup / How to run" if the docker-compose command or ports changed
>    - In "Known limitations," remove any note that implied a framework deviation, since this is now fixed
>
> 7. Update PROMPTS.md:
>    - Add a new entry documenting this change, following the same format as the existing entries (why it was needed, the prompt used — this exact prompt, verbatim — and files changed)
>    - Note the "why": the assignment's Technical Expectations explicitly required React/Next.js for the frontend, and the original vanilla JS implementation didn't meet that, so this was a compliance fix
>
> Show me the resulting file structure when done so I can confirm nothing from the old frontend was left behind.

**Files changed:**

- Added `frontend/` Next.js app (`app/`, `components/`, `lib/`, `package.json`, `Dockerfile`, Tailwind/PostCSS config)
- `docker-compose.yml` (frontend service now builds Next.js, port 3001→3000)
- `.gitignore` (node_modules / `.next`)
- `README.md`
- `PROMPTS.md`
- Deleted `frontend/index.html`, `frontend/app.js`, `frontend/nginx.conf`
