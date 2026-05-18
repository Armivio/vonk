from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
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
