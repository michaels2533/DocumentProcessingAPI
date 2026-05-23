"""Arq worker entrypoint.

Run with:

    arq app.workers.arq_worker.WorkerSettings

The Docker `worker` service does exactly that (see docker-compose.yml).
"""

from __future__ import annotations

import logging

from arq.connections import RedisSettings

from app.core.config import get_settings
from app.core.database import sessionmanager
from app.workers.tasks import process_document_job


_settings = get_settings()
logging.basicConfig(level=logging.INFO)


async def on_startup(ctx: dict) -> None:
    # The sessionmanager is constructed at import time from settings.database_url
    # but `init()` is what actually opens a transaction to enable the pgvector
    # extension on first boot. Calling it here mirrors the API's lifespan.
    await sessionmanager.init()


async def on_shutdown(ctx: dict) -> None:
    if sessionmanager._engine is not None:
        await sessionmanager.close()


class WorkerSettings:
    functions = [process_document_job]
    redis_settings = RedisSettings.from_dsn(_settings.redis_url)
    on_startup = on_startup
    on_shutdown = on_shutdown
    max_jobs = _settings.worker_concurrency
    job_timeout = _settings.worker_job_timeout
    max_tries = _settings.worker_max_tries
    # Retry on the standard set of failures (network blips, transient LLM
    # errors). Permanent failures (e.g. unreadable PDF) still consume tries
    # but the row's `status` is already `failed` and the error text is
    # surfaced to the API, so users see the cause immediately.
    keep_result = 3600  # seconds; lets clients optionally inspect job results
