from uuid import UUID

from arq.connections import ArqRedis
from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.queue import get_arq_pool
from app.core.rate_limit import limiter
from app.schemas.document import (
    DocumentJobResponse,
    DocumentResponse,
    DocumentSummary,
    Entities,
    SearchRequest,
    SearchResponse,
)
from app.services.document_service import (
    delete_document,
    enqueue_document,
    get_document,
    list_documents,
    search_documents,
)

router = APIRouter(prefix="/documents", tags=["documents"])


# Name of the Arq task in `app.workers.tasks`. Kept as a constant so the
# router doesn't have to import the worker module (which would pull arq's
# CLI deps into the API process unnecessarily).
_PROCESS_DOCUMENT_TASK = "process_document_job"


@router.post(
    "/upload",
    response_model=DocumentJobResponse,
    status_code=202,
)
@limiter.limit("3/hour")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
    arq: ArqRedis = Depends(get_arq_pool),
):
    """Accept a PDF, persist it as a `pending` document, and enqueue the pipeline.

    Returns immediately with `202 Accepted` and the new document id. Clients
    poll `GET /documents/{id}` until `status == "ready"` (or `"failed"`).
    """
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_bytes = await file.read()

    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit.")

    doc = await enqueue_document(db, file.filename, pdf_bytes)
    # Commit BEFORE enqueueing so the worker is guaranteed to see the row.
    # If enqueue then fails, we still have a `pending` row that an operator
    # can re-queue manually -- much better than the inverse race.
    await db.commit()

    await arq.enqueue_job(_PROCESS_DOCUMENT_TASK, str(doc.id))

    return DocumentJobResponse(
        id=doc.id,
        status=doc.status,
        filename=doc.filename,
        created_at=doc.created_at,
    )


@router.get("/", response_model=list[DocumentSummary])
async def get_documents(
    skip: int = 0,
    limit: int = 20,
    db: AsyncSession = Depends(get_db_session),
):
    docs = await list_documents(db, skip=skip, limit=limit)
    return [
        DocumentSummary(
            id=d.id,
            filename=d.filename,
            doc_type=d.doc_type,
            entities=Entities(**d.entities) if d.entities else None,
            status=d.status,
            created_at=d.created_at,
        )
        for d in docs
    ]


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document_by_id(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db_session),
):
    doc = await get_document(db, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found.")
    return DocumentResponse(
        id=doc.id,
        filename=doc.filename,
        doc_type=doc.doc_type,
        entities=Entities(**doc.entities) if doc.entities else None,
        raw_text=doc.raw_text,
        status=doc.status,
        error=doc.error,
        created_at=doc.created_at,
        processed_at=doc.processed_at,
    )


@router.delete("/{doc_id}", status_code=204, response_class=Response)
async def delete_document_by_id(
    doc_id: UUID,
    db: AsyncSession = Depends(get_db_session),
):
    """Permanently delete a document. Idempotent in spirit but returns 404
    on a missing id so the client can distinguish 'already gone' from
    'never existed' if it cares to.
    """
    deleted = await delete_document(db, doc_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Document not found.")
    await db.commit()
    return Response(status_code=204)


@router.post("/search", response_model=SearchResponse)
@limiter.limit("3/hour")
async def search(
    request: Request,
    search_request: SearchRequest,
    db: AsyncSession = Depends(get_db_session),
):
    results = await search_documents(db, search_request)
    return SearchResponse(results=results)
