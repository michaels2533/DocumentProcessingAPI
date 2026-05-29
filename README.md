# Document Processing API
This deployable API processes and analyzes documents using AI then stores them in a vector database. Enables semantic search, exact match-search and RAG on a collection of documents.

## Live Demo ⚡
Deployment Link: [Visit Link](https://docproc-frontend.onrender.com/)


## Architecture

| Component | Technology |
|-----------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend (API) | FastAPI + SQLAlchemy (async) |
| Background worker | Arq (asyncio task queue) |
| Broker | Redis 7 |
| Database | PostgreSQL 16 + pgvector |
| Migrations | Alembic |
| Testing | Pytest + pytest-asyncio + httpx |
| AI | Pluggable chat provider (OpenAI / Anthropic / Ollama) + text-embedding-3-small for embeddings |
| PDF parsing | PyMuPDF (text-based PDFs) |

### Component diagram

```
┌──────────┐      ┌──────────┐      ┌─────────┐      ┌──────────┐      ┌──────────┐
│ Frontend │ ───► │   API    │ ───► │  Redis  │ ───► │  Worker  │ ───► │ Postgres │
│  (React) │ ◄─── │ (FastAPI)│      │ (queue) │      │  (Arq)   │      │(pgvector)│
└──────────┘ poll └────┬─────┘      └─────────┘      └─────┬────┘      └──────────┘
                       │                                   │                ▲
                       └───────── writes "pending" ────────┴─── writes ─────┘
                                                                "ready/failed"
```

The API is intentionally thin: it persists the upload, enqueues a job, and returns `202 Accepted` immediately. All slow work (PDF extraction, LLM classification, embedding) happens in the `worker` service so the API stays responsive and the LLM pipeline can be retried and scaled independently.

## Pipeline

1. **Upload (API, sync)** -- PDF uploaded via React frontend to FastAPI. The API inserts a `documents` row with `status="pending"`, persists the raw PDF bytes, commits, and enqueues a job in Redis. The client receives `202 Accepted` with the new document id.
2. **Pick up (Worker)** -- An Arq worker pops the job, sets the row to `status="processing"`.
3. **Extract (Worker)** -- PyMuPDF extracts raw text (no OCR, text-based PDFs only). The CPU-bound parse runs in a thread so it doesn't block other concurrent jobs.
4. **Classify + Embed (Worker, in parallel)** -- The configured chat provider (OpenAI / Anthropic / Ollama) classifies the document (`medical_record`, `legal_filing`, `billing`, `correspondence`, `other`) and extracts entities; `text-embedding-3-small` generates a 1536-dim vector.
5. **Finalize (Worker)** -- Results are written back to the row, `status` becomes `"ready"` (or `"failed"` with an `error` message if every retry exhausts), `processed_at` is stamped, and the persisted PDF bytes are cleared.
6. **Poll (Client)** -- Frontend polls `GET /api/documents/{id}` until `status == "ready"` and then renders the result.
7. **Search** -- pgvector cosine similarity + Postgres FTS, restricted to rows in `status="ready"`, with optional SQL filtering on `doc_type` and JSONB entity fields.

### Failure handling

Arq retries failed jobs with exponential backoff up to `WORKER_MAX_TRIES` times. If every attempt fails, the row's `status` becomes `"failed"` and `error` holds the exception text, so the cause is visible immediately through `GET /api/documents/{id}`. Because the original PDF bytes are persisted on the row, operators can re-queue a failed document by hand without asking the user to re-upload.

## LLM Provider Abstraction

Chat/classification and embeddings are deliberately separated:

| Concern | Swappable? | Where |
|---------|------------|-------|
| Chat / classification | **Yes**, at runtime via `LLM_PROVIDER` | `app/services/llm/` |
| Embeddings | **No**, locked at deploy time | `app/services/embedding_service.py` |

**Why lock embeddings?** Every row in `documents.embedding` was produced by one specific model + dimension. Mixing vectors from different models in a single `vector(N)` column silently corrupts cosine similarity. Changing the embedding model is a schema/data migration, not a config flip.

**Why make chat swappable?** Classification is a stateless, per-row call — switching providers does not invalidate any stored data, so picking a provider per environment (cost, latency, privacy) is a pure runtime choice.

### Supported chat providers

| `LLM_PROVIDER` | SDK | Default model | Notes |
|----------------|-----|---------------|-------|
| `openai` *(default)* | `openai` | `gpt-4o-mini` | Native JSON mode via `response_format`. |
| `anthropic` | `anthropic` | `claude-3-5-haiku-latest` | Uses assistant-prefill (`{`) to constrain output to JSON. |
| `ollama` | `httpx` -> local server | `llama3.1:8b` | Runs entirely on-host. No document text leaves the machine. Uses Ollama's `format=json`. |

### Switching providers

Set `LLM_PROVIDER` in `.env` and restart the backend. Each provider also has its own model override and credential vars (see `.env.example`).

```bash
# OpenAI (default)
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_CHAT_MODEL=gpt-4o-mini

# Anthropic
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_CHAT_MODEL=claude-3-5-haiku-latest

# Ollama (local, no data leaves the host)
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_CHAT_MODEL=llama3.1:8b
```

`OPENAI_API_KEY` is always required, because the embedding model is OpenAI-hosted.

### Adding a new chat provider

1. Implement `ChatProvider` (`app/services/llm/base.py`) — a single `complete_json` method.
2. Register the new provider in `app/services/llm/factory.py::get_chat_provider`.
3. Add any new settings to `app/core/config.py::Settings` and `.env.example`.

## Database Schema (ERD)

The MVP is intentionally a **single-table, denormalized design**. Every uploaded PDF becomes one row in `documents`. Extracted entities are stored as embedded JSONB rather than a separate table, and the OpenAI embedding lives in a `pgvector` column on the same row. This keeps the read path for search to a single index scan + filter and avoids joins on the hot path.

## ERD Diagram
![ERDPhoto](assets/Screenshot%202026-05-04%20at%203.55.22 PM.png)
![ERDPhoto2](assets/Screenshot%202026-05-04%20at%203.56.06 PM.png)

`ENTITIES_JSONB` is **not a separate table** -- it is the logical shape of the `documents.entities` column, defined in `app/schemas/document.py::Entities`. It is shown as its own entity in the diagram only to make the structure of the JSONB document explicit.

### Columns

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | No | Primary key. Server default `gen_random_uuid()`. |
| `filename` | `varchar(512)` | No | Original filename of the uploaded PDF. |
| `pdf_bytes` | `bytea` | Yes | Raw upload, persisted so the worker can retry independently of the original request. Cleared when `status` becomes `ready`. |
| `raw_text` | `text` | Yes | Full extracted text from PyMuPDF. NULL until the worker has processed the row. |
| `doc_type` | `varchar(50)` | Yes | Classification label from the configured chat provider. Indexed for fast filtering. NULL until processed. |
| `entities` | `jsonb` | Yes | Shape conforms to the `Entities` Pydantic model. NULL until processed. |
| `embedding` | `vector(1536)` | Yes | `text-embedding-3-small` output. Dimension comes from `settings.embedding_dimensions`. NULL until processed. |
| `status` | `varchar(20)` | No | Lifecycle: `pending` → `processing` → `ready` \| `failed`. Server default `'pending'`. Indexed. |
| `error` | `text` | Yes | Last exception text if `status='failed'`. |
| `processed_at` | `timestamptz` | Yes | Set when `status` transitions to `ready`. |
| `created_at` | `timestamptz` | No | Server default `now()`. |

### Indexes & Constraints

| Index | Type | Columns | Purpose |
|-------|------|---------|---------|
| `documents_pkey` | B-tree (unique) | `id` | Primary key lookup. |
| `ix_documents_doc_type` | B-tree | `doc_type` | Fast filtering in search (`WHERE doc_type = ?`). |
| `ix_documents_status` | B-tree | `status` | Fast filtering of pending/failed rows for admin & recovery. |
| `ix_documents_embedding_hnsw` | HNSW | `embedding` `vector_cosine_ops` | Approximate nearest-neighbor search for the semantic side of the hybrid query. |
| `ix_documents_raw_text_tsv` | GIN | `raw_text_tsv` | Full-text search; backs `ts_rank` in the hybrid query. |
| *(optional)* | GIN | `entities` `jsonb_path_ops` | Would accelerate JSONB containment queries when `entity_filters` is used. |

### Why a single table for the MVP?

- **One write path.** Upload -> extract -> classify -> embed -> insert one row. No transactional coordination across tables.
- **One read path.** Search is `SELECT ... ORDER BY embedding <=> :query LIMIT k` with optional `WHERE doc_type = ?` and JSONB containment -- all served from a single relation.
- **Schema evolution stays cheap.** New entity types are added by extending the `Entities` Pydantic model; no migration needed because the column is JSONB.
- **Clear normalization seams for later.** When the product grows (users, collections, multi-tenant access, document versions, page-level chunks for finer-grained retrieval), each becomes its own table with a foreign key back to `documents.id`.

## Quick Start

### Prerequisites

- Docker and Docker Compose
- An OpenAI API key

### Setup

```bash
# Clone and enter the project
cd Document_Processing_API

# Create your environment file
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Start everything
docker compose up --build

# Generate an initial migration via Alembic(only if app/alembic/versions is empty)
docker compose exec backend alembic revision --autogenerate -m "initial schema" 

# Manually edit the revision to enable the pgvector extension.
op.execute("CREATE EXTENSION IF NOT EXISTS vector")
```

### Services

| Service | URL / Port | Notes |
|---------|-----|-----|
| Frontend | http://localhost:5173 | React + Vite |
| Backend API | http://localhost:8000 | FastAPI, enqueues jobs only |
| API Docs (Swagger) | http://localhost:8000/docs | |
| Health Check | http://localhost:8000/health | |
| Worker | *(no port)* | `arq app.workers.arq_worker.WorkerSettings`. Scale with `docker compose up --scale worker=N`. |
| Redis (broker) | localhost:6379 | Arq queue + job result store |
| Postgres (app DB) | localhost:5432 | |
| Postgres (test DB) | localhost:5434 | |

## API Endpoints

| Method | Path | Response | Description |
|--------|------|----------|-------------|
| `POST` | `/api/documents/upload` | `202 Accepted` + `{id, status, filename, created_at}` | Persists the PDF and enqueues the pipeline. Returns immediately. |
| `GET` | `/api/documents/` | `200` + summaries | List documents (any status). |
| `GET` | `/api/documents/{id}` | `200` + full doc incl. `status` & `error` | Poll this until `status == "ready"`. |
| `POST` | `/api/documents/search` | `200` + ranked results | Hybrid pgvector + FTS search; only returns `status="ready"` rows. |

### Async upload Sequence Diagram

![SequenceDiagram](assets/Sequence%20diagram.png)

### Search Request Body

```json
{
  "query": "patient diagnosis for diabetes",
  "doc_type": "medical_record",
  "top_k": 10
}
```

## Background Processing (Arq + Redis)

The pipeline runs in a separate `worker` container so the API never blocks on PyMuPDF parsing or LLM round-trips.

### Components

- **Broker**: `redis:7-alpine` (`redis` service).
- **Producer**: the FastAPI app opens a single `ArqRedis` pool in `lifespan` and enqueues `process_document_job` from `POST /api/documents/upload`.
- **Consumer**: the `worker` service runs `arq app.workers.arq_worker.WorkerSettings`. Each worker pulls jobs from Redis, opens its own DB session via the shared `sessionmanager`, and executes `run_document_pipeline`.

### Retries & failures

`WorkerSettings.max_tries` controls how many times Arq retries a job with exponential backoff. The pipeline writes `status="failed"` + the exception text to the document row *before* re-raising, so a final failure is durable and immediately visible via `GET /api/documents/{id}`. Because `pdf_bytes` is persisted on the row, an operator can re-enqueue a failed document without re-uploading.

### Scaling

```bash
# Run N worker processes against the same Redis broker
docker compose up --scale worker=3
```

Within a worker, `WORKER_CONCURRENCY` controls how many jobs run in parallel on the asyncio event loop. The CPU-bound `extract_text` call is dispatched via `asyncio.to_thread`, so a single worker can saturate several concurrent LLM / embedding network calls.

### Local development (without Docker)

You'll need a local Redis (e.g. `brew install redis && redis-server`) and to run the worker alongside `uvicorn`:

```bash
# In one terminal -- the API
uvicorn app.main:app --reload

# In another -- the worker
arq app.workers.arq_worker.WorkerSettings
```

## Database Migrations

Schema changes are managed with Alembic. The migration runtime config lives at `backend/app/alembic/env.py`.

```bash
# Generate a new migration after changing a SQLAlchemy model
docker compose exec backend alembic revision --autogenerate -m "describe change"

# Apply pending migrations to the app database
docker compose exec backend alembic upgrade head

# Roll back the most recent migration
docker compose exec backend alembic downgrade -1
```

The test suite runs `alembic upgrade head` automatically against the test database at the start of each test session.

## Testing

The project uses `pytest` with `pytest-asyncio` for async test support and `httpx` for in-process API integration tests. Test configuration lives in `backend/pytest.ini`, and shared fixtures live in `backend/tests/conftest.py`.

### Test Isolation Strategy

Each test gets a fresh `db_session` fixture wrapped in a transaction that is **always rolled back** at teardown. Combined with a SAVEPOINT (via `begin_nested`), this means even tests that call `session.commit()` leave no trace in the test database. The `client` fixture overrides FastAPI's database dependency to share the same transactional session, so HTTP calls and direct DB assertions stay consistent.

### Running Tests

```bash
# Bring up the test database
docker compose --profile test up

# Run the suite from inside the backend container
docker compose exec backend pytest

# Or run locally (set TEST_DATABASE_URL appropriately)
cd backend
pytest
```

### Writing a Test

```python
async def test_insert_document(db_session):
    doc = Document(filename="x.pdf", raw_text="hello", doc_type="other", ...)
    db_session.add(doc)
    await db_session.flush()
    assert doc.id is not None

async def test_upload_endpoint(client):
    response = await client.post("/api/documents/upload", files={...})
    # 202 Accepted -- the pipeline now runs out-of-band in the worker.
    assert response.status_code == 202
    assert response.json()["status"] == "pending"
```

> When testing the upload endpoint, override the `get_arq_pool` dependency with a stub (e.g. an `AsyncMock` with an `enqueue_job` coroutine) so the test doesn't require a running Redis. The same `client` fixture pattern from `conftest.py` applies.

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── alembic/       # Alembic migration runtime config
│   │   ├── core/          # Config, database session manager, Arq pool wiring
│   │   │   └── queue.py   # `create_arq_pool` + `get_arq_pool` FastAPI dep
│   │   ├── models/        # SQLAlchemy models
│   │   ├── routers/       # FastAPI route handlers
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/
│   │   │   ├── llm/                    # Swappable chat providers (OpenAI/Anthropic/Ollama)
│   │   │   ├── classification_service.py  # Provider-agnostic classify+extract
│   │   │   ├── embedding_service.py    # Locked-at-deploy embedding model
│   │   │   ├── document_service.py     # `enqueue_document` + `run_document_pipeline`
│   │   │   └── pdf_service.py          # PyMuPDF text extraction
│   │   ├── workers/
│   │   │   ├── arq_worker.py           # `WorkerSettings` consumed by the `arq` CLI
│   │   │   └── tasks.py                # `process_document_job` task function
│   │   └── main.py        # FastAPI app entrypoint (opens the Arq pool in lifespan)
│   ├── tests/
│   │   └── conftest.py    # Shared pytest fixtures (db_session, client)
│   ├── Dockerfile
│   ├── pytest.ini
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # React components
│   │   ├── types/         # TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
└── .env.example
```

## Environment Variables

Defined in `.env` (see `.env.example` for the full list):

| Variable | Purpose |
|----------|---------|
| `OPENAI_API_KEY` | API key for embeddings (always required) and OpenAI chat |
| `LLM_PROVIDER` | Chat/classification provider: `openai` (default), `anthropic`, or `ollama` |
| `OPENAI_CHAT_MODEL` | Chat model used when `LLM_PROVIDER=openai` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_CHAT_MODEL` | Credentials + model for `LLM_PROVIDER=anthropic` |
| `OLLAMA_BASE_URL` / `OLLAMA_CHAT_MODEL` | Server URL + model for `LLM_PROVIDER=ollama` |
| `DATABASE_URL` | Async Postgres URL for the app database |
| `TEST_DATABASE_URL` | Async Postgres URL for the test database |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | App DB credentials used by the `db` service |
| `TEST_POSTGRES_USER` / `TEST_POSTGRES_PASSWORD` / `TEST_POSTGRES_DB` | Test DB credentials used by the `test-db` service |
| `REDIS_URL` | Redis DSN used by both the API (enqueue) and the worker (consume). Defaults to `redis://redis:6379/0`. |
| `WORKER_CONCURRENCY` | Optional. Max in-flight jobs per worker process. Default `4`. |
| `WORKER_JOB_TIMEOUT` | Optional. Per-job timeout in seconds. Default `180`. |
| `WORKER_MAX_TRIES` | Optional. Retry budget per job before `status` becomes `failed`. Default `5`. |

## Local Development (without Docker)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Set DATABASE_URL to point to your local Postgres with pgvector
export DATABASE_URL="postgresql+asyncpg://docproc:docproc_secret@localhost:5432/docproc"
export OPENAI_API_KEY="sk-..."
# Local Redis for the Arq broker
export REDIS_URL="redis://localhost:6379/0"

# Apply migrations
alembic upgrade head

# Run the API
uvicorn app.main:app --reload

# In a second terminal -- start the background worker
arq app.workers.arq_worker.WorkerSettings
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

When running locally (not in Docker), update the Vite proxy target in `vite.config.ts` from `http://backend:8000` to `http://localhost:8000`.

## Special Thanks
Here are some articles I used throughout the build process for inspiration and guidance.

  **Setting up a FastAPI app With Async SQLAlchemy 2.0 & Pydantic V2 by Thomas Aiken** - 
    https://medium.com/@tclaitken/setting-up-a-fastapi-app-with-async-sqlalchemy-2-0-pydantic-v2-e6c540be4308