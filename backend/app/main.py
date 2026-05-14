from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.database import sessionmanager
from app.routers import documents


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initializes pgvector extension
    await sessionmanager.init()
    yield
    if sessionmanager._engine is not None:
        # Close DB Connection
        sessionmanager.close()



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
