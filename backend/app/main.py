from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.core.database import sessionmanager
from app.core.queue import create_arq_pool
from app.core.rate_limit import limiter
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

# Wire the SlowAPI limiter: state.limiter is required by the decorators,
# the exception handler turns RateLimitExceeded into a 429 response, and
# the middleware adds X-RateLimit-* headers to every response.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

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
