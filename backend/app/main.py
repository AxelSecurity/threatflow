from fastapi import FastAPI
from app.api.routers import iocs, sources, export, flows

app = FastAPI(title="ThreatFlow API", version="0.1.0", docs_url="/api/docs")
app.include_router(iocs.router,    prefix="/api/v1")
app.include_router(sources.router, prefix="/api/v1")
app.include_router(export.router,  prefix="/api/v1")
app.include_router(flows.router,   prefix="/api/v1")

@app.get("/health")
def health():
    return {"status": "ok"}
