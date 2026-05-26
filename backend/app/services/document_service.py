"""Document orchestration.

This module is split into two phases now that processing runs out-of-band:

  - `enqueue_document` runs on the HTTP request path. It is intentionally
    cheap: it just persists the upload (filename + raw PDF bytes) in a
    `pending` row and returns. The router then pushes a job into Redis.

  - `run_document_pipeline` runs inside the Arq worker. It re-reads the
    persisted bytes, extracts text, classifies, embeds, and transitions the
    row to `ready` (or `failed` on terminal error).

Read paths (`get_document`, `list_documents`, `search_documents`) are
unchanged in shape; `search_documents` is constrained to `ready` rows so
in-flight uploads never show up in semantic results.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import (
    DOCUMENT_STATUS_FAILED,
    DOCUMENT_STATUS_PENDING,
    DOCUMENT_STATUS_PROCESSING,
    DOCUMENT_STATUS_READY,
    Document,
)
from app.services.pdf_service import extract_text
from app.services.classification_service import classify_and_extract
from app.services.embedding_service import generate_embedding
from app.schemas.document import DocumentSummary, Entities, SearchRequest


async def enqueue_document(
    db: AsyncSession, filename: str, pdf_bytes: bytes
) -> Document:
    """Persist a pending document row so it can be processed by the worker.

    The bytes are stored on the row itself so retries don't depend on the
    original HTTP request.
    """
    doc = Document(
        filename=filename,
        pdf_bytes=pdf_bytes,
        status=DOCUMENT_STATUS_PENDING,
    )
    db.add(doc)
    await db.flush()
    await db.refresh(doc)
    return doc


async def run_document_pipeline(db: AsyncSession, doc_id: UUID) -> Document:
    """Execute the full pipeline against an existing `pending` row.

    Intended to be called from the Arq worker. On success the row is
    transitioned to `ready` and the persisted PDF bytes are cleared so the
    table doesn't keep an unbounded BLOB cache. On exception, the row is
    marked `failed` with the error text *and the exception is re-raised* so
    Arq's retry/backoff logic can decide whether to retry.
    """
    doc = await db.get(Document, doc_id)
    if doc is None:
        raise LookupError(f"Document {doc_id} not found")
    if doc.pdf_bytes is None:
        raise ValueError(
            f"Document {doc_id} has no persisted PDF bytes to process"
        )

    doc.status = DOCUMENT_STATUS_PROCESSING
    doc.error = None
    await db.flush()

    try:
        # PyMuPDF is CPU-bound; offload to a thread so the worker event loop
        # remains free to run other concurrent jobs (e.g. their LLM calls).
        raw_text = await asyncio.to_thread(extract_text, doc.pdf_bytes)
        if not raw_text.strip():
            raise ValueError("No extractable text found in the PDF.")

        classification, embedding = await asyncio.gather(
            classify_and_extract(raw_text),
            generate_embedding(raw_text),
        )

        doc.raw_text = raw_text
        doc.doc_type = classification.doc_type
        doc.entities = classification.entities.model_dump()
        doc.embedding = embedding
        doc.status = DOCUMENT_STATUS_READY
        doc.processed_at = datetime.now(timezone.utc)
        # Drop the cached upload now that we don't need to retry from bytes.
        doc.pdf_bytes = None
        await db.flush()
        await db.refresh(doc)
        return doc
    except Exception as exc:
        doc.status = DOCUMENT_STATUS_FAILED
        doc.error = f"{type(exc).__name__}: {exc}"
        await db.flush()
        raise


async def get_document(db: AsyncSession, doc_id: UUID) -> Document | None:
    return await db.get(Document, doc_id)


async def delete_document(db: AsyncSession, doc_id: UUID) -> bool:
    """Permanently remove a document row.

    Returns True if a row was deleted, False if no document with that id
    existed. The caller is responsible for committing the session so the
    delete is durable.
    """
    doc = await db.get(Document, doc_id)
    if doc is None:
        return False
    await db.delete(doc)
    await db.flush()
    return True


async def list_documents(
    db: AsyncSession, skip: int = 0, limit: int = 20
) -> list[Document]:
    result = await db.execute(
        select(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def search_documents(
    db: AsyncSession, request: SearchRequest
) -> list[DocumentSummary]:
    query_embedding = await generate_embedding(request.query)
    # If the caller didn't provide an explicit FTS term, reuse the semantic query.
    keyword = request.keyword or request.query
    alpha = request.semantic_weight

    params: dict = {
        "query_vec": str(query_embedding),
        "keyword": keyword,
        "alpha": alpha,
        "top_k": request.top_k,
        "ready_status": DOCUMENT_STATUS_READY,
    }

    # Adds filters based on the request body to params.
    doc_type_clause = ""
    if request.doc_type:
        doc_type_clause = "AND doc_type = :doc_type"
        params["doc_type"] = request.doc_type

    entity_clauses = ""
    if request.entity_filters:
        for i, (key, value) in enumerate(request.entity_filters.items()):
            safe_key = f"ent_key_{i}"
            safe_val = f"ent_val_{i}"
            entity_clauses += (
                f" AND entities -> :{safe_key} @> to_jsonb(CAST(:{safe_val} AS text))"
            )
            params[safe_key] = key
            params[safe_val] = value

    # Single hybrid query restricted to documents that have finished
    # processing -- pending/processing/failed rows have NULL embeddings and
    # would otherwise be filtered out implicitly by the cosine operator, but
    # we filter explicitly for clarity and to keep the index plan predictable.
    sql = f"""
        WITH q AS (
            SELECT websearch_to_tsquery('english', :keyword) AS tsq
        )
        SELECT
            d.id,
            d.filename,
            d.doc_type,
            d.entities,
            d.status,
            d.created_at,
            1 - (d.embedding <=> CAST(:query_vec AS vector)) AS similarity,
            ts_rank(d.raw_text_tsv, q.tsq) AS fts_rank,
            (
                :alpha * (1 - (d.embedding <=> CAST(:query_vec AS vector)))
                + (1 - :alpha) * ts_rank(d.raw_text_tsv, q.tsq)
            ) AS score
        FROM documents d, q
        WHERE d.status = :ready_status
        {doc_type_clause}
        {entity_clauses}
        ORDER BY score DESC
        LIMIT :top_k
    """

    result = await db.execute(text(sql), params)
    rows = result.fetchall()

    return [
        DocumentSummary(
            id=row.id,
            filename=row.filename,
            doc_type=row.doc_type,
            entities=Entities(**row.entities) if row.entities else None,
            status=row.status,
            created_at=row.created_at,
            similarity=round(row.similarity, 4),
            fts_rank=round(row.fts_rank, 4),
        )
        for row in rows
    ]
