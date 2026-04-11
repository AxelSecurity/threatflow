from sqlalchemy import String, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, UUIDMixin, TimestampMixin

class Flow(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "flow"
    name:       Mapped[str]  = mapped_column(String(128), unique=True, nullable=False)
    active:     Mapped[bool] = mapped_column(Boolean, default=False)
    definition: Mapped[dict] = mapped_column(JSONB, nullable=False)
