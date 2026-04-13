from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
import app.core.celery_app  # noqa — deve essere il primo import: inizializza Celery con il broker corretto
from app.api.routers import iocs, sources, export, flows, auth
from app.api.deps import RequireAny, RequireAnalyst


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Crea tutte le tabelle all'avvio se non esistono già
    from app.db import engine
    from app.models.base import Base
    from app.models import Ioc, Source, Tag, Flow, User, SourceLog, FlowLog  # noqa — registra i modelli
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(title="ThreatFlow API", version="0.1.0", docs_url="/api/docs", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Inizializza directory export prima di StaticFiles
os.makedirs("/app/exports", exist_ok=True)

# Public
app.include_router(auth.router, prefix="/api/v1")

# Protected — RequireAny = qualsiasi utente autenticato
app.include_router(iocs.router,    prefix="/api/v1", dependencies=[RequireAny])
app.include_router(sources.router, prefix="/api/v1", dependencies=[RequireAnalyst])
app.include_router(export.router,  prefix="/api/v1", dependencies=[RequireAny])
app.include_router(flows.router,   prefix="/api/v1", dependencies=[RequireAnalyst])

app.mount("/exports", StaticFiles(directory="/app/exports"), name="exports")


@app.get("/health")
def health():
    return {"status": "ok"}

