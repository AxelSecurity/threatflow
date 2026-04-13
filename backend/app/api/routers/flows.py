from uuid import UUID
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.api.deps import get_db
from app.models.flow import Flow
from app.executor.parser import parse_flow, FlowValidationError
from app.executor.tasks import schedule_all_flows

router = APIRouter(prefix="/flows", tags=["Flows"])

class FlowCreate(BaseModel):
    name: str; definition: dict

class FlowUpdate(BaseModel):
    name: str | None = None; definition: dict | None = None


@router.get("")
def list_flows(db: Annotated[Session, Depends(get_db)]):
    return db.query(Flow).all()

@router.post("", status_code=201)
def create_flow(payload: FlowCreate, db: Annotated[Session, Depends(get_db)]):
    try: parse_flow(payload.definition)
    except FlowValidationError as e: raise HTTPException(422, str(e))
    flow = Flow(name=payload.name, active=True, definition=payload.definition)
    db.add(flow); db.commit(); db.refresh(flow); return flow

@router.patch("/{flow_id}")
def patch_flow(flow_id: UUID, payload: FlowUpdate, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow: raise HTTPException(404)
    if payload.name is not None:
        flow.name = payload.name
    if payload.definition is not None:
        try: parse_flow(payload.definition)
        except FlowValidationError as e: raise HTTPException(422, str(e))
        flow.definition = payload.definition
        flow.active = True # Ri-attiva in caso di modifiche
    db.commit(); db.refresh(flow); return flow


@router.post("/{flow_id}/activate")
def activate(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow: raise HTTPException(404)
    flow.active = True; db.commit()
    schedule_all_flows.delay()
    return {"detail": "activated"}

@router.post("/{flow_id}/deactivate")
def deactivate(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow: raise HTTPException(404)
    flow.active = False; db.commit()
    return {"detail": "deactivated"}

@router.delete("/{flow_id}", status_code=204)
def delete_flow(flow_id: UUID, db: Annotated[Session, Depends(get_db)]):
    flow = db.get(Flow, flow_id)
    if not flow: raise HTTPException(404)
    db.delete(flow); db.commit()
