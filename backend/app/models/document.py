import uuid
from datetime import datetime, timezone

from sqlalchemy import Computed, DateTime, Index, LargeBinary, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.core.config import get_settings

settings = get_settings()


# Lifecycle states for the background processing pipeline.
#   pending    -> row created by the API; job sitting in Redis
#   processing -> worker has picked it up
#   ready      -> pipeline finished; embedding + entities populated
#   failed     -> all retries exhausted; `error` holds the last exception text
DOCUMENT_STATUS_PENDING = "pending"
DOCUMENT_STATUS_PROCESSING = "processing"
DOCUMENT_STATUS_READY = "ready"
DOCUMENT_STATUS_FAILED = "failed"


class Document(Base):
    __tablename__ = "documents"

    # Declared indexes (picked up by Alembic autogenerate):
    #   - GIN on raw_text_tsv  -> fast full-text search via @@ tsquery
    #   - HNSW on embedding    -> approximate nearest-neighbor search via cosine distance (<=>)
    #   - B-tree on status     -> fast filtering of pending/failed rows for admin/recovery
    __table_args__ = (
        Index(
            "ix_documents_raw_text_tsv",
            "raw_text_tsv",
            postgresql_using="gin",
        ),
        Index(
            "ix_documents_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default=text("gen_random_uuid()"),
    )
    filename: Mapped[str] = mapped_column(String(512))

    # raw_text and the tsvector are populated by the worker after PDF
    # extraction. Both are nullable until the document reaches `ready`, so the
    # API can persist the row immediately on upload without blocking.
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text_tsv = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(raw_text, ''))", persisted=True),
        nullable=False,
    )

    # Original PDF bytes are persisted so the worker can re-read them on
    # retry without relying on the original HTTP request body. Cleared (or
    # left in place) once the document reaches `ready`; the 20 MB upload cap
    # keeps the column from bloating the table.
    pdf_bytes: Mapped[bytes | None] = mapped_column(LargeBinary, nullable=True)

    doc_type: Mapped[str | None] = mapped_column(String(50), index=True, nullable=True)
    entities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    embedding = mapped_column(Vector(settings.embedding_dimensions), nullable=True)

    # Background-processing lifecycle.
    status: Mapped[str] = mapped_column(
        String(20),
        default=DOCUMENT_STATUS_PENDING,
        server_default=text(f"'{DOCUMENT_STATUS_PENDING}'"),
        index=True,
        nullable=False,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
    )
