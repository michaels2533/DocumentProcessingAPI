"""Arq client wiring for the FastAPI process.

The API enqueues jobs to Redis but never *executes* them -- that's the
`worker` service's responsibility. A single `ArqRedis` pool is created in
the FastAPI lifespan and exposed via `get_arq_pool`, which mirrors the
shape of `get_db_session` so routers can declare it as a `Depends(...)`.
"""

from __future__ import annotations

from arq import create_pool
from arq.connections import ArqRedis, RedisSettings
from fastapi import Request

from app.core.config import get_settings

settings = get_settings()


async def create_arq_pool() -> ArqRedis:
    return await create_pool(RedisSettings.from_dsn(settings.redis_url))


async def get_arq_pool(request: Request) -> ArqRedis:
    """FastAPI dependency that returns the process-wide Arq pool.

    The pool is attached to `app.state.arq` by the lifespan handler. Tests
    can override this dependency with a fake / no-op enqueuer.
    """
    pool: ArqRedis | None = getattr(request.app.state, "arq", None)
    if pool is None:
        raise RuntimeError(
            "Arq pool is not initialized. Did the lifespan run?"
        )
    return pool
