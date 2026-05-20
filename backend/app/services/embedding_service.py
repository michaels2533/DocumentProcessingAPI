"""Embedding generation.

The embedding model is intentionally **locked at deploy time** — not
swappable via the runtime `LLM_PROVIDER` switch — because every existing row
in the `documents` table was embedded with a specific model and dimension.
Mixing vectors from different models in one `vector(N)` column would silently
poison cosine similarity results.

If you need to change the embedding model, treat it as a schema change:
re-embed every existing row, then alter the `documents.embedding` column
dimension via an Alembic migration if the new model uses a different size.
"""

from __future__ import annotations

from openai import AsyncOpenAI

from app.core.config import get_settings


_settings = get_settings()
_client = AsyncOpenAI(api_key=_settings.openai_api_key)


# Conservative cap on input length sent to the embedding API. Most text-based
# PDFs comfortably fit; longer inputs are truncated rather than chunked at the
# MVP stage (chunking is a planned follow-up for finer-grained retrieval).
_MAX_INPUT_CHARS = 8_000


async def generate_embedding(text: str) -> list[float]:
    truncated = text[:_MAX_INPUT_CHARS]
    response = await _client.embeddings.create(
        model=_settings.embedding_model,
        input=truncated,
    )
    return response.data[0].embedding
