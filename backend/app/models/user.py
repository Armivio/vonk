import uuid
from datetime import datetime
from typing import Any, Optional

from sqlalchemy import String, TIMESTAMP, Float, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    last_name: Mapped[Optional[str]] = mapped_column(String(100))
    phone: Mapped[Optional[str]] = mapped_column(String(20), unique=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), unique=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255))
    client_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True)
    channel: Mapped[str] = mapped_column(String(20), server_default="web")
    latitude: Mapped[Optional[float]] = mapped_column(Float)
    longitude: Mapped[Optional[float]] = mapped_column(Float)
    city: Mapped[Optional[str]] = mapped_column(String(100))
    neighborhood: Mapped[Optional[str]] = mapped_column(String(100))
    age_group: Mapped[Optional[str]] = mapped_column(String(20))
    preferences: Mapped[Optional[dict[str, Any]]] = mapped_column(JSONB, nullable=True)
    registered_by_name: Mapped[Optional[str]] = mapped_column(String(100))
    registered_by_org: Mapped[Optional[str]] = mapped_column(String(100))
    contact_preference: Mapped[Optional[str]] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
    last_active: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True), server_default=text("NOW()")
    )
