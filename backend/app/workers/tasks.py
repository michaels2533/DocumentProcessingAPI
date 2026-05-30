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
from app.models.document import DOCUMENT_STATUS_FAILED, Document
from app.services.document_service import run_document_pipeline

logger = logging.getLogger(__name__)


async def _record_failure(doc_id: UUID, exc: BaseException) -> None:
    """Best-effort: persist `failed` status on a *fresh* session.

    The pipeline's own session may already be in an invalid-transaction
    state (e.g. the original error was a dropped DB connection), so
    writing failure metadata on it would just raise PendingRollbackError
    and clobber the real exception. A new session pulls a healthy
    connection from the pool and lets us record the failure durably.
    """
    try:
        async with sessionmanager.session() as fresh:
            doc = await fresh.get(Document, doc_id)
            if doc is not None:
                doc.status = DOCUMENT_STATUS_FAILED
                doc.error = f"{type(exc).__name__}: {exc}"
                await fresh.commit()
    except Exception:
        logger.exception("failed to persist failure status doc_id=%s", doc_id)


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

    try:
        async with sessionmanager.session() as session:
            doc = await run_document_pipeline(session, parsed_id)
            await session.commit()
    except Exception as exc:
        # `sessionmanager.session()` already rolled back the in-flight
        # transaction on its way out, so the original session is safely
        # closed by the time we get here. Record the failure on a fresh
        # session so a stale/broken connection can't swallow it.
        logger.exception(
            "process_document_job failed doc_id=%s job_id=%s try=%s",
            doc_id,
            job_id,
            job_try,
        )
        await _record_failure(parsed_id, exc)
        raise

    logger.info(
        "process_document_job done doc_id=%s status=%s",
        doc_id,
        doc.status,
    )
    return doc.status
