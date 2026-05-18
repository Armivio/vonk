import uuid
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import Date, Integer, Interval, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class ConnectionMetric(Base):
    __tablename__ = "connection_metrics"
    __table_args__ = (
        UniqueConstraint("city", "neighborhood", "date", name="uq_metrics_city_neighborhood_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    neighborhood: Mapped[Optional[str]] = mapped_column(String(100))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    vonken_count: Mapped[int] = mapped_column(Integer, server_default="0")
    unique_participants: Mapped[int] = mapped_column(Integer, server_default="0")
    repeat_participants: Mapped[int] = mapped_column(Integer, server_default="0")
    vuuren_formed: Mapped[int] = mapped_column(Integer, server_default="0")
    cross_age_vonken: Mapped[int] = mapped_column(Integer, server_default="0")
    avg_time_to_first_vonk: Mapped[Optional[timedelta]] = mapped_column(Interval)
