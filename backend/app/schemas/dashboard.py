from datetime import date
from typing import Any, Optional

from pydantic import BaseModel


class DashboardMetrics(BaseModel):
    city: str
    vonken_this_week: int
    unique_participants: int
    vuuren_formed: int
    cross_age_vonken: int
    avg_time_to_first_vonk_days: Optional[float]
    active_gloeds: int


class TrendPoint(BaseModel):
    date: date
    vonken_count: int
    unique_participants: int


class TrendResponse(BaseModel):
    city: str
    days: int
    series: list[TrendPoint]


class HeatmapResponse(BaseModel):
    city: str
    geojson: dict[str, Any]
