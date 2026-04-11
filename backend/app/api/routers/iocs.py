from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.api.schemas.ioc import IocCreate, IocUpdate, IocResponse, IocListResponse
from app.models.ioc import Ioc, IocStatus
from app.models.tag import Tag, IocTag
from app.processing.validator import IocValidator
from app.processing.normalizer import normalize
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/iocs", tags=["IOC"])
validator = IocValidator()

@router.get("", response_model=IocListResponse)
def list_iocs(db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
    ioc_type: str | None = None, tlp: str | None = None,
    status: str | None = None, q: str | None = None,
    min_score: float | None = None):
    query = db.query(Ioc)
    if ioc_type:  query = query.filter(Ioc.ioc_type == ioc_type)
    if tlp:       query = query.filter(Ioc.tlp == tlp)
    if status:    query = query.filter(Ioc.status == status)
    if min_score: query = query.filter(Ioc.score >= min_score)
    if q:         query = query.filter(Ioc.value.ilike(f"%{q}%"))
    total = query.count()
    items = query.offset((page - 1) * size).limit(size).all()
    return IocListResponse(total=total, page=page, size=size, items=[_to_resp(i) for i in items])

@router.get("/{ioc_id}", response_model=IocResponse)
def get_ioc(ioc_id: UUID, db: Annotated[Session, Depends(get_db)]):
    ioc = db.get(Ioc, ioc_id)
    if not ioc: raise HTTPException(404, "IOC not found")
    return _to_resp(ioc)

@router.post("", response_model=IocResponse, status_code=status.HTTP_201_CREATED)
def create_ioc(payload: IocCreate, db: Annotated[Session, Depends(get_db)]):
    ioc_type = payload.ioc_type.value
    value    = normalize(payload.value, ioc_type)
    result   = validator.validate(value, ioc_type)
    if not result.valid:
        raise HTTPException(422, f"Invalid IOC [{result.error.value}]: {result.detail}")
    if db.query(Ioc).filter(Ioc.value == value, Ioc.ioc_type == ioc_type).first():
        raise HTTPException(409, "IOC already exists")
    now = datetime.now(timezone.utc)
    ioc = Ioc(ioc_type=ioc_type, value=value, tlp=payload.tlp.value,
              ttl_days=payload.ttl_days, status=IocStatus.ACTIVE,
              first_seen=now, last_seen=now, score=50.0,
              expires_at=now + timedelta(days=payload.ttl_days) if payload.ttl_days else None)
    db.add(ioc); db.flush()
    _apply_tags(db, ioc, payload.tags); db.commit(); db.refresh(ioc)
    return _to_resp(ioc)

@router.patch("/{ioc_id}", response_model=IocResponse)
def update_ioc(ioc_id: UUID, payload: IocUpdate, db: Annotated[Session, Depends(get_db)]):
    ioc = db.get(Ioc, ioc_id)
    if not ioc: raise HTTPException(404)
    if payload.tlp:      ioc.tlp    = payload.tlp.value
    if payload.status:   ioc.status = payload.status.value
    if payload.ttl_days is not None:
        ioc.ttl_days  = payload.ttl_days
        ioc.expires_at = datetime.now(timezone.utc) + timedelta(days=payload.ttl_days)
    if payload.tags is not None: _apply_tags(db, ioc, payload.tags)
    db.commit(); db.refresh(ioc); return _to_resp(ioc)

@router.delete("/{ioc_id}", status_code=204)
def delete_ioc(ioc_id: UUID, db: Annotated[Session, Depends(get_db)]):
    ioc = db.get(Ioc, ioc_id)
    if not ioc: raise HTTPException(404)
    db.delete(ioc); db.commit()

def _apply_tags(db, ioc, tag_names):
    db.query(IocTag).filter(IocTag.ioc_id == ioc.id).delete()
    for name in tag_names:
        tag = db.query(Tag).filter(Tag.name == name.lower()).first()
        if not tag: tag = Tag(name=name.lower()); db.add(tag); db.flush()
        db.add(IocTag(ioc_id=ioc.id, tag_id=tag.id))

def _to_resp(ioc):
    return IocResponse(
        **{c: getattr(ioc, c) for c in ["id","ioc_type","value","tlp","score","status","ttl_days","first_seen","last_seen","expires_at","created_at"]},
        sources=[s.source.name for s in ioc.sources if s.source],
        tags=[t.tag.name for t in ioc.tags if t.tag])
