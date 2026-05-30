import contextlib
import ssl
from typing import Any, AsyncIterator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncConnection,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from app.core.config import get_settings

settings = get_settings()

class Base(DeclarativeBase):
    pass


class DatabaseSessionManager:
    def __init__(self, host: str, engine_kwargs: dict[str, Any] = {}):
        # asyncpg takes SSL via `connect_args`, NOT as a top-level engine kwarg.
        # Gated on settings.db_ssl so local Docker (no SSL) keeps working.
        if settings.db_ssl:
            engine_kwargs = {**engine_kwargs, "connect_args": {"ssl": "require"}}
        # Long-running workers sit idle between jobs; managed Postgres / proxies
        # silently drop idle TCP connections, after which the next checkout
        # gets a dead socket and the session enters an invalid-transaction
        # state (PendingRollbackError). pool_pre_ping issues a cheap SELECT 1
        # before handing out a connection, and pool_recycle forces SQLAlchemy
        # to rotate connections older than the recycle window so we never
        # bump up against typical 30-60 minute server-side idle timeouts.
        engine_kwargs = {
            "pool_pre_ping": True,
            "pool_recycle": 400,
            **engine_kwargs,
        }
        self._engine = create_async_engine(host, **engine_kwargs)
        self._sessionmaker = async_sessionmaker(
            autocommit=False,
            expire_on_commit=False,
            bind=self._engine,
        )

    async def close(self):
        if self._engine is None:
            raise Exception("DatabaseSessionManager is not initialized")
        await self._engine.dispose()

        self._engine = None
        self._sessionmaker = None

    async def init(self):
        if self._engine is None:
            raise Exception("DatabaseSessionManager is closed")

        async with self._engine.begin() as conn: 
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector")) # Enables pgvector extension

    @contextlib.asynccontextmanager
    async def connect(self) -> AsyncIterator[AsyncConnection]:
        if self._engine is None:
            raise Exception("DatabaseSessionManager is not initialized")

        async with self._engine.begin() as connection:
            try:
                yield connection
            except Exception:
                await connection.rollback()
                raise

    @contextlib.asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        if self._sessionmaker is None:
            raise Exception("DatabaseSessionManager is not initialized")

        session = self._sessionmaker()
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


sessionmanager = DatabaseSessionManager(settings.database_url, {"echo": False})


async def get_db_session():
    async with sessionmanager.session() as session:
        yield session