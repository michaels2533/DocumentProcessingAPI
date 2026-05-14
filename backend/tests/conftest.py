"""
Pytest configuration for the Document Processing API.

Pipeline:
  1. Session start -> point the app at TEST_DATABASE_URL, enable pgvector,
     run Alembic migrations up to `head`.
  2. Each test    -> receive a fresh AsyncSession wrapped in a transaction
     that is always rolled back, so nothing persists between tests.
  3. Integration  -> an httpx `client` fixture routes FastAPI's db dependency
     through the same transactional session.
"""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import AsyncGenerator

import pytest
import pytest_asyncio

# -----------------------------------------------------------------------------
# CRITICAL: Rebind DATABASE_URL BEFORE importing anything from `app`.
# `app.core.database.sessionmanager` is constructed at import time from
# settings.database_url, so the environment must already point at the test DB.
# -----------------------------------------------------------------------------
_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+asyncpg://testuser:testpassword@localhost:5434/test_db",
)
os.environ["DATABASE_URL"] = _TEST_DB_URL

from alembic import command  # noqa: E402
from alembic.config import Config as AlembicConfig  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.database import get_db_session  # noqa: E402
from app.main import app  # noqa: E402


BACKEND_DIR = Path(__file__).resolve().parent.parent
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"


# -----------------------------------------------------------------------------
# Session-scoped: one engine + pgvector + migrations for the whole test run.
# -----------------------------------------------------------------------------
@pytest_asyncio.fixture(scope="session")
async def test_engine():
    engine = create_async_engine(_TEST_DB_URL)
    yield engine
    await engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def prepare_database(test_engine) -> AsyncGenerator[None, None]:
    async with test_engine.begin() as conn:
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector")) # Enables Pgvector extension
    
    #Programmatically invokes Alembic and using an alembic config file points 'sqlalchemy.url' to the test DB. 
    alembic_cfg = AlembicConfig(str(ALEMBIC_INI))
    alembic_cfg.set_main_option("sqlalchemy.url", _TEST_DB_URL)
    # Alembic's `command.upgrade` is synchronous; run it off the event loop
    # so it doesn't conflict with the running asyncio loop.
    await asyncio.to_thread(command.upgrade, alembic_cfg, "head")

    yield


# -----------------------------------------------------------------------------
# Per-test: open a connection, begin an outer transaction, and roll it back
# unconditionally at teardown. SAVEPOINT (begin_nested) lets the code under
# test call session.commit() safely -- those commits apply to the savepoint,
# not the outer transaction, which we always roll back.
# -----------------------------------------------------------------------------
@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    async with test_engine.connect() as connection:
        #Opens outer transaction
        outer_tx = await connection.begin()
        #Bind connection to session and opens inner transaction
        SessionLocal = async_sessionmaker(
            bind=connection, expire_on_commit=False, autoflush=False
        )
        session = SessionLocal()

        #Begins savepoint on inner transaction.
        await session.begin_nested()

        try:
            yield session
        finally:
            await session.close()
            if outer_tx.is_active:
                await outer_tx.rollback()


# -----------------------------------------------------------------------------
# Integration client: FastAPI app whose `get_db_session` dependency resolves
# to the same transactional session as the `db_session` fixture, so API
# interactions and direct DB assertions share one transaction.
# -----------------------------------------------------------------------------
@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db_session] = _override_get_db
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as c:
            yield c
    finally:
        app.dependency_overrides.clear()
