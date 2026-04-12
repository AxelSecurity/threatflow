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
    qr = db.query(Ioc.value).filter(Ioc.status == IocStatus.ACTIVE)
    if ioc_type:  qr = qr.filter(Ioc.ioc_type == ioc_type)
    if tlp:       qr = qr.filter(Ioc.tlp == tlp)
    if min_score: qr = qr.filter(Ioc.score >= min_score)
    return "\n".join(r[0] for r in qr.all())

@router.get("/json")
def export_json(db: Annotated[Session, Depends(get_db)],
    ioc_type: str | None = None, min_score: float = Query(0.0)):
    qr = db.query(Ioc).filter(Ioc.status == IocStatus.ACTIVE)
    if ioc_type:  qr = qr.filter(Ioc.ioc_type == ioc_type)
    if min_score: qr = qr.filter(Ioc.score >= min_score)
    return [{"value": i.value, "type": i.ioc_type, "score": i.score,
             "tlp": i.tlp, "last_seen": i.last_seen} for i in qr.all()]
