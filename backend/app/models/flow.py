from sqlalchemy import String, Boolean
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, UUIDMixin, TimestampMixin

class Flow(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "flow"
    name:       Mapped[str]  = mapped_column(String(128), unique=True, nullable=False)
    active:     Mapped[bool] = mapped_column(Boolean, default=False)
    definition: Mapped[dict] = mapped_column(JSONB, nullable=False)
    logs: Mapped[list["FlowLog"]] = relationship(back_populates="flow", cascade="all, delete-orphan")

    @property
    def warnings(self) -> list:
        """Ritorna i warning strutturali del flow."""
        try:
            from app.executor.parser import parse_flow, validate_flow_structure
            parsed = parse_flow(self.definition)
            return validate_flow_structure(parsed)
        except Exception:
            # Se il flow non è parsabile (es. manca ingest), la validazione strutturale è secondaria
            return []

