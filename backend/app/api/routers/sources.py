from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
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
    src = Source(**payload.model_dump()); db.add(src); db.commit(); db.refresh(src); return src

@router.post("/{source_id}/fetch", status_code=202)
def trigger_fetch(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src: raise HTTPException(404)
    fetch_feed.delay(str(source_id))
    return {"detail": "fetch queued", "source": src.name}

@router.patch("/{source_id}/toggle")
def toggle_source(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src: raise HTTPException(404)
    src.active = not src.active; db.commit()
    return {"active": src.active}

@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src: raise HTTPException(404)
    db.delete(src); db.commit()
