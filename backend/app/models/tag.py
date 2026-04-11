import uuid
from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base, UUIDMixin

class Tag(UUIDMixin, Base):
    __tablename__ = "tag"
    name:  Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    color: Mapped[str] = mapped_column(String(16), default="#888888")
    ioc_tags: Mapped[list["IocTag"]] = relationship(back_populates="tag")

class IocTag(Base):
    __tablename__ = "ioc_tag"
    ioc_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("ioc.id"), primary_key=True)
    tag_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tag.id"), primary_key=True)
    ioc: Mapped["Ioc"] = relationship(back_populates="tags")
    tag: Mapped["Tag"] = relationship(back_populates="ioc_tags")
