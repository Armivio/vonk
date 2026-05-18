"""Aggregate metrics for the municipality dashboard.

Everything here returns counts, not rows. The dashboard never sees individual
people, individual gloeds, or individual vonken.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from sqlalchemy import distinct, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ConnectionMetric, Gloed, User, Vonk, VonkParticipant, Vuur


async def aggregate_metrics(db: AsyncSession, city: str) -> dict[str, Any]:
    week_ago = datetime.now(timezone.utc) - timedelta(days=7)

    vonk_this_week_q = (
        select(func.count(Vonk.id))
        .join(User, User.id == Vonk.creator_id)
        .where(User.city == city, Vonk.created_at >= week_ago)
    )
    vonken_this_week = int((await db.execute(vonk_this_week_q)).scalar() or 0)

    unique_q = (
        select(func.count(distinct(VonkParticipant.user_id)))
        .join(User, User.id == VonkParticipant.user_id)
        .where(User.city == city, VonkParticipant.joined_at >= week_ago)
    )
    unique_participants = int((await db.execute(unique_q)).scalar() or 0)

    vuuren_total = int((await db.execute(select(func.count(Vuur.id)))).scalar() or 0)

    cross_age_q = """
        SELECT COUNT(*) FROM (
            SELECT v.id
            FROM vonken v
            JOIN vonk_participants vp ON vp.vonk_id = v.id
            JOIN users u ON u.id = vp.user_id
            WHERE u.city = :city
            GROUP BY v.id
            HAVING COUNT(DISTINCT u.age_group) >= 2
        ) sub
    """
    cross = await db.execute(text(cross_age_q), {"city": city})
    cross_age_vonken = int(cross.scalar() or 0)

    avg_q = await db.execute(
        select(func.avg(ConnectionMetric.avg_time_to_first_vonk)).where(
            ConnectionMetric.city == city
        )
    )
    avg_interval: timedelta | None = avg_q.scalar()
    avg_days = (
        round(avg_interval.total_seconds() / 86400.0, 1) if avg_interval else None
    )

    active_q = (
        select(func.count(Gloed.id))
        .join(User, User.id == Gloed.user_id)
        .where(Gloed.active.is_(True), User.city == city)
    )
    active_gloeds = int((await db.execute(active_q)).scalar() or 0)

    return {
        "city": city,
        "vonken_this_week": vonken_this_week,
        "unique_participants": unique_participants,
        "vuuren_formed": vuuren_total,
        "cross_age_vonken": cross_age_vonken,
        "avg_time_to_first_vonk_days": avg_days,
        "active_gloeds": active_gloeds,
    }


async def trend_series(db: AsyncSession, city: str, days: int) -> list[dict[str, Any]]:
    since = date.today() - timedelta(days=days - 1)
    res = await db.execute(
        select(ConnectionMetric)
        .where(ConnectionMetric.city == city, ConnectionMetric.date >= since)
        .order_by(ConnectionMetric.date.asc())
    )
    out: list[dict[str, Any]] = []
    for m in res.scalars().all():
        out.append(
            {
                "date": m.date,
                "vonken_count": m.vonken_count,
                "unique_participants": m.unique_participants,
            }
        )
    return out


async def heatmap_geojson(db: AsyncSession, city: str) -> dict[str, Any]:
    """Return a FeatureCollection of vonk points; intensity = participant count.

    Aggregate only — point density indicates activity, not individuals.
    """
    res = await db.execute(
        select(
            Vonk.id,
            Vonk.latitude,
            Vonk.longitude,
            func.count(VonkParticipant.user_id).label("p_count"),
        )
        .join(User, User.id == Vonk.creator_id)
        .outerjoin(VonkParticipant, VonkParticipant.vonk_id == Vonk.id)
        .where(User.city == city)
        .group_by(Vonk.id)
    )
    features = []
    for vid, lat, lon, p_count in res.all():
        if lat is None or lon is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [float(lon), float(lat)]},
                "properties": {"intensity": int(p_count or 1)},
            }
        )
    return {"type": "FeatureCollection", "features": features}
