from datetime import date
from typing import Any, Optional

from pydantic import BaseModel


class RecentVonk(BaseModel):
    id: str
    title: str
    category: Optional[str] = None
    location_name: Optional[str] = None
    created_at: str
    scheduled_at: str
    participants_count: int


class DashboardMetrics(BaseModel):
    city: str
    vonken_this_week: int
    active_vonken: int
    unique_participants: int
    vuuren_formed: int
    cross_age_vonken: int
    avg_time_to_first_vonk_days: Optional[float]
    active_gloeds: int
    recent_vonken: list[RecentVonk] = []


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
