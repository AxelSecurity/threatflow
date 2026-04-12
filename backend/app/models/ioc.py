import uuid
from datetime import datetime
from enum import Enum
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, UUIDMixin, TimestampMixin

class IocType(str, Enum):
    IPV4="ipv4"; IPV6="ipv6"; DOMAIN="domain"; URL="url"
    MD5="md5"; SHA1="sha1"; SHA256="sha256"; EMAIL="email"

class TLP(str, Enum):
    WHITE="white"; GREEN="green"; AMBER="amber"; RED="red"

class IocStatus(str, Enum):
    ACTIVE="active"; EXPIRED="expired"; REVOKED="revoked"

class Ioc(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "ioc"
    ioc_type:   Mapped[str]             = mapped_column(String(16), nullable=False, index=True)
    value:      Mapped[str]             = mapped_column(String(2048), nullable=False, index=True)
    tlp:        Mapped[str]             = mapped_column(String(8), default=TLP.AMBER, nullable=False)
    score:      Mapped[float]           = mapped_column(Float, default=50.0, nullable=False)
    status:     Mapped[str]             = mapped_column(String(16), default=IocStatus.ACTIVE, nullable=False)
    ttl_days:   Mapped[int | None]      = mapped_column(Integer, nullable=True)
    first_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_seen:  Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sources: Mapped[list["IocSource"]]  = relationship(back_populates="ioc", cascade="all, delete-orphan")
    tags:    Mapped[list["IocTag"]]     = relationship(back_populates="ioc", cascade="all, delete-orphan")

class IocSource(Base):
    __tablename__ = "ioc_source"
    ioc_id:    Mapped[uuid.UUID]        = mapped_column(ForeignKey("ioc.id"), primary_key=True)
    source_id: Mapped[uuid.UUID]        = mapped_column(ForeignKey("source.id"), primary_key=True)
    raw_score: Mapped[float | None]     = mapped_column(Float, nullable=True)
    seen_at:   Mapped[datetime]         = mapped_column(DateTime(timezone=True))
    raw_data:  Mapped[dict | None]      = mapped_column(JSONB, nullable=True)
    ioc:    Mapped["Ioc"]    = relationship(back_populates="sources")
    source: Mapped["Source"] = relationship(back_populates="ioc_sources")
