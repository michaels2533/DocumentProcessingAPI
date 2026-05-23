"""add document status and queue fields

Adds the lifecycle columns required by the Arq + Redis background-processing
pipeline:

  - status / error / processed_at  -- job state surfaced to the API
  - pdf_bytes                       -- persisted upload so the worker can retry
  - raw_text / doc_type / entities / embedding become NULLABLE while a row is
    in the `pending` or `processing` state (they are populated by the worker)

The generated tsvector is recomputed against `coalesce(raw_text, '')` so the
column can stay NOT NULL even when `raw_text` has not been extracted yet.

Revision ID: 8a1f3c4d9b21
Revises: 5d8355affa5e
Create Date: 2026-05-21 03:45:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "8a1f3c4d9b21"
down_revision: Union[str, None] = "5d8355affa5e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Add lifecycle columns. `status` defaults to 'ready' for any pre-existing
    # rows (they already finished processing under the old synchronous flow);
    # new rows inserted by the API will explicitly start as 'pending'.
    op.add_column(
        "documents",
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'ready'"),
            nullable=False,
        ),
    )
    op.alter_column(
        "documents", "status", server_default=sa.text("'pending'")
    )
    op.add_column("documents", sa.Column("error", sa.Text(), nullable=True))
    op.add_column(
        "documents",
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "documents", sa.Column("pdf_bytes", sa.LargeBinary(), nullable=True)
    )
    op.create_index(
        op.f("ix_documents_status"), "documents", ["status"], unique=False
    )

    # Pipeline outputs are now populated by the worker, so allow NULL.
    op.alter_column("documents", "raw_text", existing_type=sa.Text(), nullable=True)
    op.alter_column(
        "documents", "doc_type", existing_type=sa.String(length=50), nullable=True
    )
    op.alter_column(
        "documents",
        "entities",
        existing_type=sa.dialects.postgresql.JSONB(astext_type=sa.Text()),
        nullable=True,
    )

    # Recompute the tsvector against coalesce(raw_text, '') so the GENERATED
    # column remains NOT NULL when raw_text is NULL.
    op.execute("ALTER TABLE documents DROP COLUMN raw_text_tsv")
    op.execute(
        "ALTER TABLE documents "
        "ADD COLUMN raw_text_tsv tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', coalesce(raw_text, ''))) STORED "
        "NOT NULL"
    )
    op.create_index(
        "ix_documents_raw_text_tsv",
        "documents",
        ["raw_text_tsv"],
        unique=False,
        postgresql_using="gin",
    )


def downgrade() -> None:
    op.drop_index(
        "ix_documents_raw_text_tsv",
        table_name="documents",
        postgresql_using="gin",
    )
    op.execute("ALTER TABLE documents DROP COLUMN raw_text_tsv")
    op.execute(
        "ALTER TABLE documents "
        "ADD COLUMN raw_text_tsv tsvector "
        "GENERATED ALWAYS AS (to_tsvector('english', raw_text)) STORED "
        "NOT NULL"
    )
    op.create_index(
        "ix_documents_raw_text_tsv",
        "documents",
        ["raw_text_tsv"],
        unique=False,
        postgresql_using="gin",
    )

    op.alter_column(
        "documents",
        "entities",
        existing_type=sa.dialects.postgresql.JSONB(astext_type=sa.Text()),
        nullable=False,
    )
    op.alter_column(
        "documents", "doc_type", existing_type=sa.String(length=50), nullable=False
    )
    op.alter_column("documents", "raw_text", existing_type=sa.Text(), nullable=False)

    op.drop_index(op.f("ix_documents_status"), table_name="documents")
    op.drop_column("documents", "pdf_bytes")
    op.drop_column("documents", "processed_at")
    op.drop_column("documents", "error")
    op.drop_column("documents", "status")
