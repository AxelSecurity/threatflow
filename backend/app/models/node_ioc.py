import uuid
from datetime import datetime
from sqlalchemy import String, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base

class NodeIoc(Base):
    __tablename__ = "node_ioc"
    
    flow_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("flow.id"), primary_key=True)
    node_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    ioc_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ioc.id", ondelete="CASCADE"), primary_key=True)
    
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    source_node_id: Mapped[str] = mapped_column(String(64), nullable=True)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    ioc: Mapped["Ioc"] = relationship(foreign_keys=[ioc_id])
    flow: Mapped["Flow"] = relationship(foreign_keys=[flow_id])
