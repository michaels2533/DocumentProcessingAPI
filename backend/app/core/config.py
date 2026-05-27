from functools import lru_cache
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

from pydantic import field_validator
from pydantic_settings import BaseSettings

# libpq/psycopg2-only query params that asyncpg's `connect()` rejects.
# We strip these from the URL; SSL is configured separately via `connect_args`.
_LIBPQ_ONLY_PARAMS = {"sslmode", "sslcert", "sslkey", "sslrootcert", "channel_binding"}


class Settings(BaseSettings):
    # OpenAI API key is required even when LLM_PROVIDER is not "openai",
    # because the embedding model is locked to OpenAI at deploy time.
    openai_api_key: str
    database_url: str = "postgresql+asyncpg://docproc:docproc_secret@db:5432/docproc"
    # Set to True in production (e.g. Render managed Postgres requires SSL).
    # Leave False for local Docker Compose where the bundled Postgres has no SSL.
    db_ssl: bool = False

    # ------------------------------------------------------------------ #
    # Background processing (Arq + Redis)
    # ------------------------------------------------------------------ #
    # API enqueues jobs to this Redis instance; the `worker` service pops them.
    redis_url: str = "redis://redis:6379/0"
    # Per-worker concurrency. Each in-flight job holds one DB session and one
    # outbound LLM/embedding connection, so size this to your provider limits.
    worker_concurrency: int = 4
    # Per-job timeout (seconds). Should comfortably exceed the slowest LLM call.
    worker_job_timeout: int = 180
    # Arq retries failed jobs with exponential backoff up to this many times.
    worker_max_tries: int = 5

    # ------------------------------------------------------------------ #
    # Chat / classification (swappable at runtime via LLM_PROVIDER)
    # ------------------------------------------------------------------ #
    # Case-insensitive in practice: `app.services.llm.factory` lower-cases
    # this before dispatch. Allowed values: "openai", "anthropic", "ollama".
    llm_provider: str = "openai"

    openai_chat_model: str = "gpt-4o-mini"

    anthropic_api_key: str | None = None
    anthropic_chat_model: str = "claude-3-5-haiku-latest"

    ollama_base_url: str = "http://localhost:11434"
    ollama_chat_model: str = "llama3.1:8b"

    # ------------------------------------------------------------------ #
    # Embeddings (LOCKED at deploy time)
    #
    # Every row in `documents.embedding` was produced by this exact model and
    # dimension. Changing either value here without re-embedding existing
    # rows will silently corrupt similarity search. See
    # `app/services/embedding_service.py` for the rationale.
    # ------------------------------------------------------------------ #
    embedding_model: str = "text-embedding-3-small"
    embedding_dimensions: int = 1536

    model_config = {"env_file": ".env", "extra": "ignore"}

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, v: str) -> str:
        """Make Render/Heroku-style URLs work with asyncpg.

        Three normalizations:
        1. `postgres://` → `postgresql://` (Render/Heroku legacy scheme).
        2. `postgresql://` → `postgresql+asyncpg://` so SQLAlchemy picks the async driver.
        3. Strip libpq-only query params (e.g. `sslmode=require`) that asyncpg rejects.
           SSL is configured separately via `connect_args` when `db_ssl=True`.
        """
        if not isinstance(v, str) or not v:
            return v
        if v.startswith("postgres://"):
            v = "postgresql://" + v[len("postgres://") :]
        if v.startswith("postgresql://"):
            v = "postgresql+asyncpg://" + v[len("postgresql://") :]

        parts = urlsplit(v)
        if parts.query:
            kept = [(k, val) for k, val in parse_qsl(parts.query, keep_blank_values=True)
                    if k not in _LIBPQ_ONLY_PARAMS]
            v = urlunsplit(parts._replace(query=urlencode(kept)))
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()
