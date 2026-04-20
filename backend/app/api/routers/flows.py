from uuid import UUID
from typing import Annotated
import logging
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone, timedelta
import json
from app.api.deps import get_db
from app.core.redis import get_redis
from app.models.flow import Flow
from app.models.flow_log import FlowLog
from app.models.node_ioc import NodeIoc
from app.executor.parser import parse_flow, FlowValidationError
from app.executor.tasks import schedule_all_flows, execute_ingest_node

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/flows", tags=["Flows"])


class FlowCreate(BaseModel):
    name: str
    definition: dict


class FlowUpdate(BaseModel):
    name: str | None = None
    definition: dict | None = None


class FlowRead(BaseModel):
    id: UUID
    name: str
    active: bool
    definition: dict
    warnings: list = []

    class Config:
        from_attributes = True



@router.get("", response_model=list[FlowRead])
def list_flows(db: Annotated[Session, Depends(get_db)]):
    return db.query(Flow).all()



@router.post("", status_code=201, response_model=FlowRead)
def create_flow(payload: FlowCreate, db: Annotated[Session, Depends(get_db)]):
    try:
        parse_flow(payload.definition)
    except FlowValidationError as e:
        raise HTTPException(422, str(e))
    flow = Flow(name=payload.name, active=True, definition=payload.definition)
    db.add(flow)
    db.commit()
    db.refresh(flow)
    return flow



@router.patch("/{flow_id}", response_model=FlowRead)
def patch_flow(flow_id: UUID, payload: FlowUpdate, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404)
    if payload.name is not None:
        flow.name = payload.name
    if payload.definition is not None:
        try:
            parse_flow(payload.definition)
        except FlowValidationError as e:
            raise HTTPException(422, str(e))
        flow.definition = payload.definition
        flow.active = True
        
        # Pulizia dello stato esistente per evitare "Ghost IOCs" da vecchie connessioni
        try:
            db.query(NodeIoc).filter(NodeIoc.flow_id == flow_id).delete()
            db.commit()
        except Exception as e:
            logger.error(f"[api.flows] Errore pulizia stato: {e}")
            db.rollback()
    
    db.commit()
    db.refresh(flow)
    
    # Esecuzione immediata dei nodi ingest dopo il salvataggio
    try:
        parsed = parse_flow(flow.definition)
        for nid in parsed.ingest_node_ids():
            execute_ingest_node.delay(nid, str(flow.id), True)
    except Exception as e:
        logger.error(f"[api.flows] Errore auto-trigger: {e}")

    return flow



@router.post("/{flow_id}/activate")
def activate(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404)
    flow.active = True
    db.commit()
    schedule_all_flows.delay()
    return {"detail": "activated"}


@router.post("/{flow_id}/deactivate")
def deactivate(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404)
    flow.active = False
    db.commit()
    return {"detail": "deactivated"}


@router.post("/{flow_id}/run")
def run_flow(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404)
    try:
        parsed = parse_flow(flow.definition)
    except FlowValidationError as e:
        raise HTTPException(422, str(e))
    ingest_ids = parsed.ingest_node_ids()
    if not ingest_ids:
        raise HTTPException(422, "Il flow non contiene nodi ingest")
    for nid in ingest_ids:
        # force=True: la run manuale bypassa il check flow.active
        execute_ingest_node.delay(nid, str(flow.id), True)
    return {"detail": "Esecuzione flow avviata", "nodes": len(ingest_ids)}


@router.get("/{flow_id}/logs")
def get_flow_logs(
    flow_id: UUID,
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(100, ge=1, le=500),
):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404)
    logs = (
        db.query(FlowLog)
        .filter(FlowLog.flow_id == flow_id)
        .order_by(FlowLog.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        {
            "id": str(l.id),
            "level": l.level,
            "message": l.message,
            "meta": l.meta,
            "created_at": l.created_at,
        }
        for l in logs
    ]


@router.get("/{flow_id}/node-stats")
def get_node_stats(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    """Ritorna il conteggio degli IOC attivi per ogni nodo del flow, con cache Redis."""
    cache_key = f"flow_stats:{flow_id}"
    r = get_redis()
    
    # Tentativo di recupero dalla cache
    cached = r.get(cache_key)
    if cached:
        return json.loads(cached)
    
    # Query reale se la cache è vuota o scaduta
    now = datetime.now(timezone.utc)
    stats = (
        db.query(NodeIoc.node_id, func.count(NodeIoc.ioc_id))
        .filter(NodeIoc.flow_id == flow_id)
        .filter(NodeIoc.expires_at > now)
        .group_by(NodeIoc.node_id)
        .all()
    )
    
    result = {node_id: count for node_id, count in stats}
    
    # Salvataggio in cache per 10 secondi
    r.setex(cache_key, 10, json.dumps(result))
    
    return result


@router.get("/{flow_id}/nodes/{node_id}/aging")
def get_node_aging_stats(
    flow_id: UUID, 
    node_id: str, 
    db: Annotated[Session, Depends(get_db)],
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    search: str | None = None
):
    """Ritorna la lista degli IOC attualmente in fase di aging per un determinato nodo."""
    from app.models.ioc import Ioc
    from sqlalchemy import and_, or_
    
    flow = db.get(Flow, flow_id)
    if not flow: raise HTTPException(404)
    
    # Mappa dei nomi dei nodi dalla definition per risolvere source_node_id
    nodes_map = { n["id"]: (n.get("label") or n["type"]) for n in flow.definition.get("nodes", []) }
    
    now = datetime.now(timezone.utc)
    # Definizione di "Aging": scadenza < 1 anno nel futuro
    aging_threshold = timedelta(days=365)
    
    query = db.query(NodeIoc, Ioc.value, Ioc.ioc_type).join(Ioc).filter(
        and_(
            NodeIoc.flow_id == flow_id,
            NodeIoc.node_id == node_id,
            NodeIoc.expires_at > now,
            NodeIoc.expires_at < (now + aging_threshold)
        )
    )
    
    if search:
        query = query.filter(Ioc.value.contains(search))
    
    total = query.count()
    items = query.order_by(NodeIoc.expires_at.asc()).offset((page-1)*size).limit(size).all()
    
    result = []
    for r in items:
        rem = (r.NodeIoc.expires_at - now).total_seconds()
        result.append({
            "value": r.value,
            "type": r.ioc_type,
            "source_id": r.NodeIoc.source_node_id,
            "source_label": nodes_map.get(r.NodeIoc.source_node_id, "Unknown"),
            "expires_at": r.NodeIoc.expires_at,
            "remaining_sec": int(rem)
        })
        
    return {
        "total": total,
        "page": page,
        "size": size,
        "items": result
    }


@router.delete("/{flow_id}", status_code=204)
def delete_flow(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(404)
    db.delete(flow)
    db.commit()
