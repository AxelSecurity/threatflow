from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.api.schemas.source import SourceCreate, SourceResponse, SourceDetailResponse, SourceLogEntry
from app.models.source import Source
from app.models.source_log import SourceLog
from app.models.ioc import IocSource, Ioc
from app.tasks.ingest import fetch_feed

router = APIRouter(prefix="/sources", tags=["Sources"])


@router.get("", response_model=list[SourceResponse])
def list_sources(db: Annotated[Session, Depends(get_db)]):
    return db.query(Source).all()


@router.post("", response_model=SourceResponse, status_code=201)
def create_source(payload: SourceCreate, db: Annotated[Session, Depends(get_db)]):
    if db.query(Source).filter(Source.name == payload.name).first():
        raise HTTPException(409, "Source already exists")
    src = Source(**payload.model_dump())
    db.add(src)
    db.commit()
    db.refresh(src)
    return src


@router.get("/{source_id}", response_model=SourceDetailResponse)
def get_source(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src:
        raise HTTPException(404)
    ioc_count = db.query(IocSource).filter(IocSource.source_id == source_id).count()
    log_count = db.query(SourceLog).filter(SourceLog.source_id == source_id).count()
    return SourceDetailResponse(
        id=src.id,
        name=src.name,
        feed_type=src.feed_type,
        url=src.url,
        active=src.active,
        fetch_interval=src.fetch_interval,
        config=src.config or {},
        last_fetched=src.last_fetched,
        created_at=src.created_at,
        ioc_count=ioc_count,
        log_count=log_count,
    )


@router.post("/{source_id}/fetch", status_code=202)
def trigger_fetch(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src:
        raise HTTPException(404)
    fetch_feed.delay(str(source_id))
    return {"detail": "fetch queued", "source": src.name}


@router.patch("/{source_id}/toggle")
def toggle_source(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src:
        raise HTTPException(404)
    src.active = not src.active
    db.commit()
    return {"active": src.active}


@router.patch("/{source_id}/config")
def update_source_config(source_id: UUID, payload: dict, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src:
        raise HTTPException(404)
    src.config = payload
    db.add(src)
    db.commit()
    return {"config": src.config}


@router.delete("/{source_id}", status_code=204)
def delete_source(source_id: UUID, db: Annotated[Session, Depends(get_db)]):
    src = db.get(Source, source_id)
    if not src:
        raise HTTPException(404)
    db.delete(src)
    db.commit()


@router.get("/{source_id}/logs", response_model=list[SourceLogEntry])
def get_source_logs(
    source_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(200, ge=1, le=500),
):
    src = db.get(Source, source_id)
    if not src:
        raise HTTPException(404)
    return (
        db.query(SourceLog)
        .filter(SourceLog.source_id == source_id)
        .order_by(SourceLog.created_at.desc())
        .limit(limit)
        .all()
    )


@router.get("/{source_id}/iocs")
def get_source_iocs(
    source_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=200),
):
    from app.api.routers.iocs import _resp
    q = (
        db.query(Ioc)
        .join(IocSource, IocSource.ioc_id == Ioc.id)
        .filter(IocSource.source_id == source_id)
    )
    total = q.count()
    items = q.order_by(Ioc.last_seen.desc()).offset((page - 1) * size).limit(size).all()
    return {"total": total, "page": page, "size": size, "items": [_resp(i) for i in items]}
