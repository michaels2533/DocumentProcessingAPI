"""Arq task functions.

Each task opens its own DB session via the shared `sessionmanager`; the
API's request-scoped `get_db_session` dependency is deliberately *not*
reused here, because worker jobs have a different transaction lifecycle
(one transaction per job, retried independently from any HTTP request).
"""

from __future__ import annotations

import logging
from uuid import UUID

from app.core.database import sessionmanager
from app.services.document_service import run_document_pipeline

logger = logging.getLogger(__name__)


async def process_document_job(ctx: dict, doc_id: str) -> str:
    """Run the document pipeline for a single `documents.id`.

    Arq passes a per-job `ctx` containing `job_id`, `job_try`, etc. We log
    them so failures are easy to correlate with the row in Postgres.
    """
    job_id = ctx.get("job_id")
    job_try = ctx.get("job_try")
    logger.info(
        "process_document_job start doc_id=%s job_id=%s try=%s",
        doc_id,
        job_id,
        job_try,
    )

    parsed_id = UUID(doc_id)

    async with sessionmanager.session() as session:
        try:
            doc = await run_document_pipeline(session, parsed_id)
            await session.commit()
        except Exception:
            # The pipeline already wrote `status=failed` + `error` to the row
            # before re-raising. Commit that state separately so the failure
            # is durable even though we're about to bubble the exception up
            # to Arq for retry/backoff handling.
            await session.commit()
            logger.exception(
                "process_document_job failed doc_id=%s job_id=%s try=%s",
                doc_id,
                job_id,
                job_try,
            )
            raise

    logger.info(
        "process_document_job done doc_id=%s status=%s",
        doc_id,
        doc.status,
    )
    return doc.status
