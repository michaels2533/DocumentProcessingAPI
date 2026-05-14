import asyncio
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document
from app.services.pdf_service import extract_text
from app.services.openai_service import classify_and_extract, generate_embedding
from app.schemas.document import DocumentSummary, Entities, SearchRequest


async def process_document(db: AsyncSession, filename: str, pdf_bytes: bytes) -> Document:
    raw_text = extract_text(pdf_bytes)
    if not raw_text.strip():
        raise ValueError("No extractable text found in the PDF.")

    classification, embedding = await asyncio.gather(
        classify_and_extract(raw_text),
        generate_embedding(raw_text),
    )

    doc = Document(
        filename=filename,
        raw_text=raw_text,
        doc_type=classification.doc_type,
        entities=classification.entities.model_dump(),
        embedding=embedding,
    )
    # Registers document with the pending state
    db.add(doc)
    # Sends SQL(INSERT) statement to databases within existing transaction and generates DB assigned values.
    await db.flush()
     # Re-reads and updates the Python object with the DB assigned values
    await db.refresh(doc)
    return doc


async def get_document(db: AsyncSession, doc_id: UUID) -> Document | None:
    return await db.get(Document, doc_id)


async def list_documents(db: AsyncSession, skip: int = 0, limit: int = 20) -> list[Document]:
    result = await db.execute(
        select(Document).order_by(Document.created_at.desc()).offset(skip).limit(limit)
    )
    return list(result.scalars().all())


async def search_documents(db: AsyncSession, request: SearchRequest) -> list[DocumentSummary]:
    query_embedding = await generate_embedding(request.query)
    # If the caller didn't provide an explicit FTS term, reuse the semantic query.
    keyword = request.keyword or request.query
    alpha = request.semantic_weight

    params: dict = {
        "query_vec": str(query_embedding),
        "keyword": keyword,
        "alpha": alpha,
        "top_k": request.top_k,
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
            entity_clauses += f" AND entities->:{safe_key} @> to_jsonb(:{safe_val}::text)"
            params[safe_key] = key
            params[safe_val] = value

    # Single hybrid query:
    #   - cosine similarity from pgvector
    #   - ts_rank against the server-generated raw_text_tsv
    #   - blended score = alpha * similarity + (1 - alpha) * fts_rank
    # `websearch_to_tsquery` is used because it tolerates raw user input.
    sql = f"""
        WITH q AS (
            SELECT websearch_to_tsquery('english', :keyword) AS tsq
        )
        SELECT
            d.id,
            d.filename,
            d.doc_type,
            d.entities,
            d.created_at,
            1 - (d.embedding <=> :query_vec::vector) AS similarity,
            ts_rank(d.raw_text_tsv, q.tsq) AS fts_rank,
            (
                :alpha * (1 - (d.embedding <=> :query_vec::vector))
                + (1 - :alpha) * ts_rank(d.raw_text_tsv, q.tsq)
            ) AS score
        FROM documents d, q
        WHERE 1=1
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
            entities=Entities(**row.entities),
            created_at=row.created_at,
            similarity=round(row.similarity, 4),
            fts_rank=round(row.fts_rank, 4),
        )
        for row in rows
    ]
