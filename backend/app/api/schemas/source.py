from uuid import UUID
from datetime import datetime
from pydantic import BaseModel


class SourceCreate(BaseModel):
    name: str
    feed_type: str
    url: str | None = None
    fetch_interval: int = 3600
    config: dict = {}


class SourceResponse(BaseModel):
    id: UUID
    name: str
    feed_type: str
    url: str | None
    active: bool
    fetch_interval: int
    last_fetched: datetime | None
    created_at: datetime
    model_config = {"from_attributes": True}


class SourceDetailResponse(BaseModel):
    id: UUID
    name: str
    feed_type: str
    url: str | None
    active: bool
    fetch_interval: int
    config: dict
    last_fetched: datetime | None
    created_at: datetime
    ioc_count: int
    log_count: int
    model_config = {"from_attributes": True}


class SourceLogEntry(BaseModel):
    id: UUID
    level: str
    message: str
    meta: dict | None
    created_at: datetime
    model_config = {"from_attributes": True}
