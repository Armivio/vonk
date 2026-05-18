from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import distinct, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User, Vonk, VonkParticipant
from app.schemas.dashboard import (
    DashboardMetrics,
    HeatmapResponse,
    TrendPoint,
    TrendResponse,
)
from app.services.metrics import aggregate_metrics, heatmap_geojson, trend_series

router = APIRouter()


@router.get("/metrics", response_model=DashboardMetrics)
async def metrics(
    city: str = Query("Rotterdam"),
    db: AsyncSession = Depends(get_db),
) -> DashboardMetrics:
    data = await aggregate_metrics(db, city)
    return DashboardMetrics(**data)


@router.get("/trends", response_model=TrendResponse)
async def trends(
    city: str = Query("Rotterdam"),
    days: int = Query(7, ge=1, le=90),
    db: AsyncSession = Depends(get_db),
) -> TrendResponse:
    series = await trend_series(db, city, days)
    return TrendResponse(
        city=city,
        days=days,
        series=[TrendPoint(**p) for p in series],
    )


@router.get("/heatmap", response_model=HeatmapResponse)
async def heatmap(
    city: str = Query("Rotterdam"),
    db: AsyncSession = Depends(get_db),
) -> HeatmapResponse:
    geojson = await heatmap_geojson(db, city)
    return HeatmapResponse(city=city, geojson=geojson)


@router.get("/extras")
async def extras(
    city: str = Query("Rotterdam"),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    """Aggregate extras for the upgraded municipality dashboard.

    Real where data exists, demo-seeded where the underlying signal isn't
    captured yet (after-vonk feedback, return rates). All numeric — no
    individual rows are exposed.
    """
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    # New residents this month who joined at least one vonk
    activated_res = await db.execute(
        select(func.count(distinct(User.id)))
        .join(VonkParticipant, VonkParticipant.user_id == User.id)
        .where(User.city == city, User.created_at >= month_start)
    )
    activated = int(activated_res.scalar() or 0)

    # Wijkconnector registrations
    wijk_res = await db.execute(
        select(func.count(User.id)).where(
            User.city == city, User.channel == "wijkconnector"
        )
    )
    wijkconnector_count = int(wijk_res.scalar() or 0)

    # Neighborhood breakdown — count upcoming active vonken + participants per hood
    nb_rows = await db.execute(
        select(
            User.neighborhood,
            func.count(distinct(Vonk.id)),
            func.count(distinct(VonkParticipant.user_id)),
        )
        .join(Vonk, Vonk.creator_id == User.id)
        .outerjoin(VonkParticipant, VonkParticipant.vonk_id == Vonk.id)
        .where(
            User.city == city,
            User.neighborhood.is_not(None),
            Vonk.status.in_(("open", "active", "full")),
            Vonk.scheduled_at >= now,
        )
        .group_by(User.neighborhood)
        .order_by(func.count(distinct(Vonk.id)).desc())
    )
    neighborhoods = [
        {
            "neighborhood": n,
            "active_vonken": int(vc or 0),
            "participants": int(pc or 0),
            "vuuren": _seed_vuuren_for(n),
        }
        for n, vc, pc in nb_rows.all()
    ]

    return {
        "city": city,
        "new_residents_activated": activated,
        "wijkconnector_registrations": wijkconnector_count,
        # Seeded for demo — feedback model lands in a follow-up.
        "satisfaction_rate_pct": 92,
        "return_rate_pct": 78,
        "wijkconnector_growth_pct": 34,
        "avg_days_to_first_vonk": 4.2,
        "neighborhoods": neighborhoods,
        "seeded_fields": [
            "satisfaction_rate_pct",
            "return_rate_pct",
            "wijkconnector_growth_pct",
            "avg_days_to_first_vonk",
        ],
    }


def _seed_vuuren_for(neighborhood: str) -> int:
    """Deterministic small integer per neighborhood until vuuren land is real."""
    return abs(hash(neighborhood or "")) % 4

