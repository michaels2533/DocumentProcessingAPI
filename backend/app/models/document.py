import uuid
from datetime import datetime, timezone

from sqlalchemy import Computed, DateTime, Index, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column
from pgvector.sqlalchemy import Vector

from app.core.database import Base
from app.core.config import get_settings

settings = get_settings()


class Document(Base):
    __tablename__ = "documents"

    # Declared indexes (picked up by Alembic autogenerate):
    #   - GIN on raw_text_tsv  -> fast full-text search via @@ tsquery
    #   - HNSW on embedding    -> approximate nearest-neighbor search via cosine distance (<=>)
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
    raw_text: Mapped[str] = mapped_column(Text)
    # Server-generated tsvector for full-text search; read-only from the ORM.
    raw_text_tsv = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', raw_text)", persisted=True),
        nullable=False,
    )
    doc_type: Mapped[str] = mapped_column(String(50), index=True)
    entities: Mapped[dict] = mapped_column(JSONB, default=dict)
    embedding = mapped_column(Vector(settings.embedding_dimensions))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("now()"),
    )
