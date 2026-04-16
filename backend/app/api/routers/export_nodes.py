from fastapi import APIRouter, Depends, HTTPException, Path
from fastapi.responses import PlainTextResponse
from sqlalchemy.orm import Session
from sqlalchemy import select
from datetime import datetime, timezone
import uuid

from app.api.deps import get_db
from app.models.ioc import Ioc, IocStatus
from app.models.node_ioc import NodeIoc
from app.models.flow import Flow
from app.executor.parser import parse_flow, FlowValidationError

router = APIRouter(prefix="/export/node", tags=["Export"])

@router.get("/{flow_id}/{node_id}.txt", response_class=PlainTextResponse)
def export_node_txt(
    flow_id: uuid.UUID,
    node_id: str,
    db: Session = Depends(get_db)
):
    # 1. Verifica che il flow esista e il nodo sia di tipo output
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
        
    try:
        parsed = parse_flow(flow.definition)
        node = parsed.find_node(node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found in flow")
        if node.category != "output":
            raise HTTPException(status_code=403, detail="Dynamic export only available for output nodes")
        
        effective_node_id = node.id
        if not parsed.predecessors(effective_node_id):
            return ""
    except FlowValidationError:
        raise HTTPException(status_code=400, detail="Invalid flow definition")

    # 2. Query per gli IOC validi e non scaduti associati al nodo
    now = datetime.now(timezone.utc)
    stmt = (
        select(Ioc.value)
        .join(NodeIoc, NodeIoc.ioc_id == Ioc.id)
        .filter(NodeIoc.flow_id == flow_id)
        .filter(NodeIoc.node_id == effective_node_id)
        .filter(NodeIoc.expires_at > now)
        .filter(Ioc.status == IocStatus.ACTIVE)
    )
    
    results = db.execute(stmt).scalars().all()
    return "\n".join(results)

@router.get("/{flow_id}/{node_id}.json")
def export_node_json(
    flow_id: uuid.UUID,
    node_id: str,
    db: Session = Depends(get_db)
):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
        
    try:
        parsed = parse_flow(flow.definition)
        node = parsed.find_node(node_id)
        if not node:
            raise HTTPException(status_code=404, detail="Node not found in flow")
        if node.category != "output":
            raise HTTPException(status_code=403, detail="Dynamic export only available for output nodes")
        
        effective_node_id = node.id
        if not parsed.predecessors(effective_node_id):
            return []
    except FlowValidationError:
        raise HTTPException(status_code=400, detail="Invalid flow definition")

    now = datetime.now(timezone.utc)
    stmt = (
        select(Ioc)
        .join(NodeIoc, NodeIoc.ioc_id == Ioc.id)
        .filter(NodeIoc.flow_id == flow_id)
        .filter(NodeIoc.node_id == effective_node_id)
        .filter(NodeIoc.expires_at > now)
        .filter(Ioc.status == IocStatus.ACTIVE)
    )
    
    results = db.execute(stmt).scalars().all()
    return [
        {
            "value": i.value,
            "type": i.ioc_type,
            "score": i.score,
            "tlp": i.tlp,
            "received_at": i.last_seen # O potremmo esporre la data diNodeIoc
        } for i in results
    ]

@router.get("/{flow_id}/{node_id}.csv", response_class=PlainTextResponse)
def export_node_csv(
    flow_id: uuid.UUID,
    node_id: str,
    db: Session = Depends(get_db)
):
    flow = db.get(Flow, flow_id)
    if not flow:
        raise HTTPException(status_code=404, detail="Flow not found")
        
    try:
        parsed = parse_flow(flow.definition)
        node = parsed.find_node(node_id)
        if not node or node.category != "output":
            raise HTTPException(status_code=404, detail="Output node not found")
        
        effective_node_id = node.id
    except FlowValidationError:
        raise HTTPException(status_code=400, detail="Invalid flow definition")

    now = datetime.now(timezone.utc)
    stmt = (
        select(Ioc)
        .join(NodeIoc, NodeIoc.ioc_id == Ioc.id)
        .filter(NodeIoc.flow_id == flow_id)
        .filter(NodeIoc.node_id == effective_node_id)
        .filter(NodeIoc.expires_at > now)
        .filter(Ioc.status == IocStatus.ACTIVE)
    )
    
    results = db.execute(stmt).scalars().all()
    
    csv_lines = ["value,ioc_type,score"]
    for i in results:
        csv_lines.append(f"{i.value},{i.ioc_type},{i.score}")
    
    return "\n".join(csv_lines)
