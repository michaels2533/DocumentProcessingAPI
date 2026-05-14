from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.schemas.document import (
    DocumentResponse,
    DocumentSummary,
    Entities,
    SearchRequest,
    SearchResponse,
)
from app.services.document_service import (
    process_document,
    get_document,
    list_documents,
    search_documents,
)

router = APIRouter(prefix="/documents", tags=["documents"])


@router.post("/upload", response_model=DocumentResponse, status_code=201)
async def upload_document(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db_session),
):
  # Checks whether the received file exists or is a pdf file type.
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted.")

    pdf_bytes = await file.read()

    # Limits file size to 20MB
    if len(pdf_bytes) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File size exceeds 20MB limit.")

    try:
        doc = await process_document(db, file.filename, pdf_bytes)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    return DocumentResponse(
        id=doc.id,
        filename=doc.filename,
        doc_type=doc.doc_type,
        entities=Entities(**doc.entities),
        raw_text=doc.raw_text,
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
            entities=Entities(**d.entities),
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
        entities=Entities(**doc.entities),
        raw_text=doc.raw_text,
        created_at=doc.created_at,
    )


@router.post("/search", response_model=SearchResponse)
async def search(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db_session),
):
    results = await search_documents(db, request)
    return SearchResponse(results=results)
