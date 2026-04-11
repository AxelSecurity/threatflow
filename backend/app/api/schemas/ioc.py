from uuid import UUID
from datetime import datetime
from pydantic import BaseModel, field_validator
from app.models.ioc import IocType, TLP, IocStatus

class IocCreate(BaseModel):
    value:    str
    ioc_type: IocType
    tlp:      TLP = TLP.AMBER
    ttl_days: int | None = None
    tags:     list[str] = []

    @field_validator("value")
    @classmethod
    def value_not_empty(cls, v):
        if not v.strip(): raise ValueError("value cannot be empty")
        return v.strip()

class IocUpdate(BaseModel):
    tlp:      TLP | None = None
    ttl_days: int | None = None
    status:   IocStatus | None = None
    tags:     list[str] | None = None

class IocResponse(BaseModel):
    id: UUID; ioc_type: str; value: str; tlp: str; score: float
    status: str; ttl_days: int | None; first_seen: datetime | None
    last_seen: datetime | None; expires_at: datetime | None
    created_at: datetime; sources: list[str] = []; tags: list[str] = []
    model_config = {"from_attributes": True}

class IocListResponse(BaseModel):
    total: int; page: int; size: int; items: list[IocResponse]
