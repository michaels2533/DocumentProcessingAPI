# Document Processing API
This deployable API processes and analyzes documents using AI then stores them in a vector database. Enables semantic search, exact match-search and RAG on a collection of documents.

## Architecture

| Component | Technology |
|-----------|-----------|
| Frontend | React 19 + TypeScript + Vite |
| Backend | FastAPI + SQLAlchemy (async) |
| Database | PostgreSQL 16 + pgvector |
| Migrations | Alembic |
| Testing | Pytest + pytest-asyncio + httpx |
| AI | OpenAI GPT-4o-mini (classification) + text-embedding-3-small (embeddings) |
| PDF parsing | PyMuPDF (text-based PDFs) |

## Pipeline

1. **Upload** -- PDF uploaded via React frontend to FastAPI backend
2. **Extract** -- PyMuPDF extracts raw text (no OCR, text-based PDFs only)
3. **Classify** -- GPT-4o-mini classifies the document (`medical_record`, `legal_filing`, `billing`, `correspondence`, `other`) and extracts entities (person names, dates, dollar amounts, medical conditions, organizations)
4. **Embed** -- text-embedding-3-small generates a 1536-dimension vector
5. **Store** -- Everything saved in a single PostgreSQL table: raw text, doc_type, entities (JSONB), embedding (pgvector)
6. **Search** -- pgvector cosine similarity search with optional SQL filtering on doc_type and JSONB entity fields

## Database Schema (ERD)

The MVP is intentionally a **single-table, denormalized design**. Every uploaded PDF becomes one row in `documents`. Extracted entities are stored as embedded JSONB rather than a separate table, and the OpenAI embedding lives in a `pgvector` column on the same row. This keeps the read path for search to a single index scan + filter and avoids joins on the hot path.

## ERD Diagram
```mermaid
    DOCUMENTS {
        uuid          id           PK "default gen_random_uuid()"
        varchar_512   filename     "original upload name"
        text          raw_text     "PyMuPDF extracted text"
        varchar_50    doc_type     "B-tree indexed; one of: medical_record, legal_filing, billing, correspondence, other"
        jsonb         entities     "embedded Entities object (see below)"
        vector_1536   embedding    "pgvector; cosine similarity search"
        timestamptz   created_at   "default now()"
    }

    ENTITIES_JSONB {
        text_array person_names        "extracted by GPT-4o-mini"
        text_array dates               "extracted by GPT-4o-mini"
        text_array dollar_amounts      "extracted by GPT-4o-mini"
        text_array medical_conditions  "extracted by GPT-4o-mini"
        text_array organizations       "extracted by GPT-4o-mini"
    }

    DOCUMENTS ||--|| ENTITIES_JSONB : "embeds as JSONB"
```
![ERDPhoto](assets/Screenshot%202026-05-04%20at%203.55.22 PM.png)
![ERDPhoto2](assets/Screenshot%202026-05-04%20at%203.56.06 PM.png)

`ENTITIES_JSONB` is **not a separate table** -- it is the logical shape of the `documents.entities` column, defined in `app/schemas/document.py::Entities`. It is shown as its own entity in the diagram only to make the structure of the JSONB document explicit.

### Columns

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | `uuid` | No | Primary key. Server default `gen_random_uuid()`. |
| `filename` | `varchar(512)` | No | Original filename of the uploaded PDF. |
| `raw_text` | `text` | No | Full extracted text from PyMuPDF. |
| `doc_type` | `varchar(50)` | No | Classification label from GPT-4o-mini. Indexed for fast filtering. |
| `entities` | `jsonb` | No | Default `{}`. Shape conforms to the `Entities` Pydantic model. |
| `embedding` | `vector(1536)` | Yes | `text-embedding-3-small` output. Dimension comes from `settings.embedding_dimensions`. |
| `created_at` | `timestamptz` | No | Server default `now()`. |

### Indexes & Constraints

| Index | Type | Columns | Purpose |
|-------|------|---------|---------|
| `documents_pkey` | B-tree (unique) | `id` | Primary key lookup. |
| `ix_documents_doc_type` | B-tree | `doc_type` | Fast filtering in search (`WHERE doc_type = ?`). |
| *(future)* | `pgvector` (HNSW or IVFFlat) | `embedding` `vector_cosine_ops` | Approximate nearest-neighbor search. Not yet defined in the model -- searches currently use an exact scan, which is acceptable at MVP volume. |
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
```

### Services

| Service | URL / Port |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Docs (Swagger) | http://localhost:8000/docs |
| Health Check | http://localhost:8000/health |
| Postgres (app DB) | localhost:5432 |
| Postgres (test DB) | localhost:5434 |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/documents/upload` | Upload a PDF for processing |
| `GET` | `/api/documents/` | List all documents |
| `GET` | `/api/documents/{id}` | Get a single document with full text |
| `POST` | `/api/documents/search` | Semantic search with optional filters |

### Search Request Body

```json
{
  "query": "patient diagnosis for diabetes",
  "doc_type": "medical_record",
  "top_k": 10
}
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
    assert response.status_code == 201
```

## Project Structure

```
├── backend/
│   ├── app/
│   │   ├── alembic/       # Alembic migration runtime config
│   │   ├── core/          # Config, database session manager
│   │   ├── models/        # SQLAlchemy models
│   │   ├── routers/       # FastAPI route handlers
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   ├── services/      # Business logic (PDF, OpenAI, document processing)
│   │   └── main.py        # FastAPI app entrypoint
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
| `OPENAI_API_KEY` | API key for GPT-4o-mini and embeddings |
| `DATABASE_URL` | Async Postgres URL for the app database |
| `TEST_DATABASE_URL` | Async Postgres URL for the test database |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | App DB credentials used by the `db` service |
| `TEST_POSTGRES_USER` / `TEST_POSTGRES_PASSWORD` / `TEST_POSTGRES_DB` | Test DB credentials used by the `test-db` service |

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

# Apply migrations
alembic upgrade head

# Run the app
uvicorn app.main:app --reload
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