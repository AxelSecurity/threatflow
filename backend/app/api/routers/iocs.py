from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.api.schemas.ioc import IocCreate, IocUpdate, IocResponse, IocListResponse
from app.models.ioc import Ioc, IocStatus, IocSource
from app.models.tag import Tag, IocTag
from app.processing.validator import IocValidator
from app.processing.normalizer import normalize
from datetime import datetime, timezone, timedelta

router = APIRouter(prefix="/iocs", tags=["IOC"])
_validator = IocValidator()

@router.get("", response_model=IocListResponse)
def list_iocs(db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1), size: int = Query(50, ge=1, le=500),
    ioc_type: str | None = None, tlp: str | None = None,
    status: str | None = None, q: str | None = None,
    min_score: float | None = None):
    qr = db.query(Ioc)
    if ioc_type:  qr = qr.filter(Ioc.ioc_type == ioc_type)
    if tlp:       qr = qr.filter(Ioc.tlp == tlp)
    if status:    qr = qr.filter(Ioc.status == status)
    if min_score: qr = qr.filter(Ioc.score >= min_score)
    if q:         qr = qr.filter(Ioc.value.ilike(f"%{q}%"))
    total = qr.count()
    items = qr.order_by(Ioc.score.desc()).offset((page-1)*size).limit(size).all()
    return IocListResponse(total=total, page=page, size=size, items=[_resp(i) for i in items])

@router.get("/{ioc_id}", response_model=IocResponse)
def get_ioc(ioc_id: UUID, db: Annotated[Session, Depends(get_db)]):
    ioc = db.get(Ioc, ioc_id)
    if not ioc: raise HTTPException(404, "IOC not found")
    return _resp(ioc)

@router.post("", response_model=IocResponse, status_code=201)
def create_ioc(payload: IocCreate, db: Annotated[Session, Depends(get_db)]):
    ioc_type = payload.ioc_type.value
    value    = normalize(payload.value, ioc_type)
    res      = _validator.validate(value, ioc_type)
    if not res.valid:
        raise HTTPException(422, f"Invalid IOC [{res.error.value}]: {res.detail}")
    if db.query(Ioc).filter(Ioc.value == value, Ioc.ioc_type == ioc_type).first():
        raise HTTPException(409, "IOC already exists")
    now = datetime.now(timezone.utc)
    ioc = Ioc(ioc_type=ioc_type, value=value, tlp=payload.tlp.value,
              ttl_days=payload.ttl_days, status=IocStatus.ACTIVE,
              first_seen=now, last_seen=now, score=50.0,
              expires_at=now+timedelta(days=payload.ttl_days) if payload.ttl_days else None)
    db.add(ioc); db.flush()
    _apply_tags(db, ioc, payload.tags); db.commit(); db.refresh(ioc)
    return _resp(ioc)

@router.patch("/{ioc_id}", response_model=IocResponse)
def update_ioc(ioc_id: UUID, payload: IocUpdate, db: Annotated[Session, Depends(get_db)]):
    ioc = db.get(Ioc, ioc_id)
    if not ioc: raise HTTPException(404)
    if payload.tlp:    ioc.tlp    = payload.tlp.value
    if payload.status: ioc.status = payload.status.value
    if payload.ttl_days is not None:
        ioc.ttl_days = payload.ttl_days
        ioc.expires_at = datetime.now(timezone.utc) + timedelta(days=payload.ttl_days)
    if payload.tags is not None: _apply_tags(db, ioc, payload.tags)
    db.commit(); db.refresh(ioc); return _resp(ioc)

@router.delete("/{ioc_id}", status_code=204)
def delete_ioc(ioc_id: UUID, db: Annotated[Session, Depends(get_db)]):
    ioc = db.get(Ioc, ioc_id)
    if not ioc: raise HTTPException(404)
    db.delete(ioc); db.commit()

def _apply_tags(db, ioc, names):
    db.query(IocTag).filter(IocTag.ioc_id == ioc.id).delete()
    for name in names:
        tag = db.query(Tag).filter(Tag.name == name.lower()).first()
        if not tag: tag = Tag(name=name.lower()); db.add(tag); db.flush()
        db.add(IocTag(ioc_id=ioc.id, tag_id=tag.id))

def _resp(ioc):
    return IocResponse(
        **{c: getattr(ioc, c) for c in ["id","ioc_type","value","tlp","score","status",
                                          "ttl_days","first_seen","last_seen","expires_at","created_at"]},
        sources=[s.source.name for s in ioc.sources if s.source],
        tags=[t.tag.name for t in ioc.tags if t.tag])
