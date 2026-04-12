from enum import Enum
from sqlalchemy import String, Boolean
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base, UUIDMixin, TimestampMixin


class UserRole(str, Enum):
    ADMIN   = "admin"
    ANALYST = "analyst"
    VIEWER  = "viewer"


class User(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "user"

    email:        Mapped[str]  = mapped_column(String(256), unique=True, nullable=False, index=True)
    display_name: Mapped[str]  = mapped_column(String(128), nullable=False)
    hashed_pw:    Mapped[str]  = mapped_column(String(256), nullable=False)
    role:         Mapped[str]  = mapped_column(String(16), default=UserRole.ANALYST, nullable=False)
    active:       Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
