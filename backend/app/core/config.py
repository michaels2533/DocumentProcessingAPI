from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # OpenAI API key is required even when LLM_PROVIDER is not "openai",
    # because the embedding model is locked to OpenAI at deploy time.
    openai_api_key: str
    database_url: str = "postgresql+asyncpg://docproc:docproc_secret@db:5432/docproc"

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


@lru_cache
def get_settings() -> Settings:
    return Settings()
