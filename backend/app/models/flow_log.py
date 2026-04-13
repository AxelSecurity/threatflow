from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy import String, DateTime, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, UUIDMixin


class FlowLog(UUIDMixin, Base):
    __tablename__ = "flow_log"

    flow_id: Mapped[UUID] = mapped_column(
        ForeignKey("flow.id", ondelete="CASCADE"), index=True, nullable=False
    )
    level: Mapped[str] = mapped_column(String(10), nullable=False, default="INFO")
    message: Mapped[str] = mapped_column(Text, nullable=False)
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
    )

    flow: Mapped["Flow"] = relationship(back_populates="logs")
