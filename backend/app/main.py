from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from app.api.routers import iocs, sources, export, flows, auth
from app.api.deps import RequireAny, RequireAnalyst, RequireAdmin

app = FastAPI(title="ThreatFlow API", version="0.1.0", docs_url="/api/docs")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public
app.include_router(auth.router, prefix="/api/v1")

# Protected — RequireAny = qualsiasi utente autenticato
app.include_router(iocs.router,    prefix="/api/v1", dependencies=[RequireAny])
app.include_router(sources.router, prefix="/api/v1", dependencies=[RequireAnalyst])
app.include_router(export.router,  prefix="/api/v1", dependencies=[RequireAny])
app.include_router(flows.router,   prefix="/api/v1", dependencies=[RequireAnalyst])


@app.get("/health")
def health():
    return {"status": "ok"}

