from datetime import datetime
from sqlalchemy import String, Boolean, Integer, DateTime
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, UUIDMixin, TimestampMixin

class Source(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "source"
    name:           Mapped[str]             = mapped_column(String(128), unique=True, nullable=False)
    feed_type:      Mapped[str]             = mapped_column(String(16), nullable=False)
    url:            Mapped[str | None]      = mapped_column(String(2048), nullable=True)
    active:         Mapped[bool]            = mapped_column(Boolean, default=True)
    fetch_interval: Mapped[int]             = mapped_column(Integer, default=3600)
    config:         Mapped[dict]            = mapped_column(JSONB, default=dict)
    last_fetched:   Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ioc_sources: Mapped[list["IocSource"]]  = relationship(back_populates="source")
