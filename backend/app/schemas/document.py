from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field


class Entities(BaseModel):
    person_names: list[str] = []
    dates: list[str] = []
    dollar_amounts: list[str] = []
    medical_conditions: list[str] = []
    organizations: list[str] = []


class ClassificationResult(BaseModel):
    doc_type: str
    entities: Entities


class DocumentResponse(BaseModel):
    id: UUID
    filename: str
    # Pipeline outputs are populated by the worker, so they are absent while
    # the document is still `pending` / `processing` and may be missing on a
    # `failed` document.
    doc_type: str | None = None
    entities: Entities | None = None
    raw_text: str | None = None
    status: str
    error: str | None = None
    created_at: datetime
    processed_at: datetime | None = None

    model_config = {"from_attributes": True}


class DocumentSummary(BaseModel):
    id: UUID
    filename: str
    doc_type: str | None = None
    entities: Entities | None = None
    status: str
    created_at: datetime
    similarity: float | None = None
    fts_rank: float | None = None

    model_config = {"from_attributes": True}


class DocumentJobResponse(BaseModel):
    """Returned by `POST /documents/upload` (HTTP 202).

    The pipeline runs asynchronously; clients poll `GET /documents/{id}`
    until `status == "ready"` (or `"failed"`).
    """

    id: UUID
    status: str
    filename: str
    created_at: datetime

    model_config = {"from_attributes": True}


class SearchRequest(BaseModel):
    query: str
    # Optional FTS term; if omitted, the semantic `query` is reused for full-text search.
    keyword: str | None = None
    # Blend weight between cosine similarity (semantic) and FTS rank.
    # 1.0 = pure semantic, 0.0 = pure keyword.
    semantic_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    doc_type: str | None = None
    entity_filters: dict[str, str] | None = None
    top_k: int = 10


class SearchResponse(BaseModel):
    results: list[DocumentSummary]
