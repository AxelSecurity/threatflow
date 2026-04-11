from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.api.schemas.source import SourceCreate, SourceResponse
from app.models.source import Source
from app.tasks.ingest import fetch_feed

router = APIRouter(prefix="/sources", tags=["Sources"])

@router.get("", response_model=list[SourceResponse])
def list_sources(db: Annotated[Session, Depends(get_db)]):
    return db.query(Source).all()

@router.post("", response_model=SourceResponse, status_code=201)
def create_source(payload: SourceCreate, db: Annotated[Session, Depends(get_db)]):
    if db.query(Source).filter(Source.name == payload.name).first():
        raise HTTPException(409, "Source already exists")
    source = Source(**payload.model_dump())
    db.add(source); db.commit(); db.refresh(source); return source

@router.post("/{source_id}/fetch", status_code=202)
def trigger_fetch(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    source = db.get(Source, source_id)
    if not source: raise HTTPException(404)
    fetch_feed.delay(str(source_id))
    return {"detail": "fetch queued", "source": source.name}

@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    source = db.get(Source, source_id)
    if not source: raise HTTPException(404)
    db.delete(source); db.commit()
