from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import sessionmanager
from app.core.queue import create_arq_pool
from app.routers import documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initializes pgvector extension
    await sessionmanager.init()
    # Open a single Arq Redis pool for the lifetime of the process. The API
    # only enqueues jobs through this pool; the worker service runs them.
    app.state.arq = await create_arq_pool()
    try:
        yield
    finally:
        await app.state.arq.close()
        if sessionmanager._engine is not None:
            # Close DB Connection
            await sessionmanager.close()



app = FastAPI(
    title="Document Processing API",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(documents.router, prefix="/api")


@app.get("/health")
async def health():
    return {"status": "ok"}
