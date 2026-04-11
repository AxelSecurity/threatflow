from fastapi import APIRouter, Depends, Query
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from typing import Annotated
from app.api.deps import get_db
from app.models.ioc import Ioc, IocStatus

router = APIRouter(prefix="/export", tags=["Export"])

@router.get("/flat", response_class=PlainTextResponse)
def export_flat(db: Annotated[Session, Depends(get_db)],
    ioc_type: str | None = None, tlp: str | None = None,
    min_score: float = Query(0.0, ge=0, le=100)):
    query = db.query(Ioc.value).filter(Ioc.status == IocStatus.ACTIVE)
    if ioc_type:  query = query.filter(Ioc.ioc_type == ioc_type)
    if tlp:       query = query.filter(Ioc.tlp == tlp)
    if min_score: query = query.filter(Ioc.score >= min_score)
    return "\n".join(row[0] for row in query.all())

@router.get("/json")
def export_json(db: Annotated[Session, Depends(get_db)],
    ioc_type: str | None = None, min_score: float = Query(0.0)):
    query = db.query(Ioc).filter(Ioc.status == IocStatus.ACTIVE)
    if ioc_type:  query = query.filter(Ioc.ioc_type == ioc_type)
    if min_score: query = query.filter(Ioc.score >= min_score)
    return [{"value": i.value, "type": i.ioc_type, "score": i.score, "tlp": i.tlp} for i in query.all()]
