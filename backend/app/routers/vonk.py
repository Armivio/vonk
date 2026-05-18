import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_user
from app.models import User, Vonk, VonkParticipant
from app.schemas.vonk import (
    VonkCreate,
    VonkDetailOut,
    VonkOut,
    VonkParticipantOut,
)
from app.services.geo import bounding_box, haversine_km

router = APIRouter()


@router.post("", response_model=VonkOut)
async def create_vonk(
    body: VonkCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> VonkOut:
    vonk = Vonk(
        creator_id=user.id,
        title=body.title,
        description=body.description,
        category=body.category,
        location_name=body.location_name,
        latitude=body.latitude,
        longitude=body.longitude,
        scheduled_at=body.scheduled_at,
        max_participants=body.max_participants,
        status="open",
    )
    db.add(vonk)
    await db.flush()
    db.add(VonkParticipant(vonk_id=vonk.id, user_id=user.id))
    await db.commit()
    await db.refresh(vonk)
    return VonkOut(**_vonk_dict(vonk, participants_count=1))


@router.get("/discover", response_model=list[VonkOut])
async def discover_vonken(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(5.0, gt=0, le=50),
    category: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
) -> list[VonkOut]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_km)
    now = datetime.now(timezone.utc)
    stmt = (
        select(Vonk, func.count(VonkParticipant.user_id).label("p_count"))
        .outerjoin(VonkParticipant, VonkParticipant.vonk_id == Vonk.id)
        .where(
            Vonk.status.in_(("open", "active")),
            Vonk.scheduled_at >= now,
            Vonk.latitude.between(min_lat, max_lat),
            Vonk.longitude.between(min_lon, max_lon),
        )
        .group_by(Vonk.id)
        .order_by(Vonk.scheduled_at.asc())
    )
    if category:
        stmt = stmt.where(Vonk.category == category)
    result = await db.execute(stmt)
    out: list[VonkOut] = []
    for v, count in result.all():
        d = haversine_km(lat, lon, v.latitude, v.longitude)
        if d > radius_km:
            continue
        out.append(VonkOut(**_vonk_dict(v, participants_count=int(count or 0), distance_km=round(d, 2))))
    return out


@router.get("/{vonk_id}", response_model=VonkDetailOut)
async def get_vonk(
    vonk_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> VonkDetailOut:
    vonk = await db.get(Vonk, vonk_id)
    if vonk is None:
        raise HTTPException(404, "Vonk not found")
    parts = await db.execute(
        select(VonkParticipant, User)
        .join(User, User.id == VonkParticipant.user_id)
        .where(VonkParticipant.vonk_id == vonk_id)
        .order_by(VonkParticipant.joined_at.asc())
    )
    participants = [
        VonkParticipantOut(
            user_id=u.id,
            name=u.name,
            initials=_initials(u.name),
            age_group=u.age_group,
            joined_at=p.joined_at,
        )
        for p, u in parts.all()
    ]
    return VonkDetailOut(
        **_vonk_dict(vonk, participants_count=len(participants)),
        participants=participants,
    )


@router.post("/{vonk_id}/join", response_model=VonkDetailOut)
async def join_vonk(
    vonk_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> VonkDetailOut:
    vonk = await db.get(Vonk, vonk_id)
    if vonk is None:
        raise HTTPException(404, "Vonk not found")
    existing = await db.execute(
        select(VonkParticipant).where(
            VonkParticipant.vonk_id == vonk_id, VonkParticipant.user_id == user.id
        )
    )
    if existing.scalar_one_or_none() is None:
        count_res = await db.execute(
            select(func.count(VonkParticipant.user_id)).where(
                VonkParticipant.vonk_id == vonk_id
            )
        )
        current_count = int(count_res.scalar() or 0)
        if current_count >= (vonk.max_participants or 6):
            raise HTTPException(409, "Vonk is full")
        db.add(VonkParticipant(vonk_id=vonk_id, user_id=user.id))
        if current_count + 1 >= (vonk.max_participants or 6):
            vonk.status = "full"
        await db.commit()
    return await get_vonk(vonk_id, db)


@router.post("/{vonk_id}/leave", status_code=204)
async def leave_vonk(
    vonk_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    res = await db.execute(
        select(VonkParticipant).where(
            VonkParticipant.vonk_id == vonk_id, VonkParticipant.user_id == user.id
        )
    )
    part = res.scalar_one_or_none()
    if part is not None:
        await db.delete(part)
        await db.commit()


def _vonk_dict(v: Vonk, *, participants_count: int, distance_km: Optional[float] = None) -> dict:
    return {
        "id": v.id,
        "creator_id": v.creator_id,
        "title": v.title,
        "description": v.description,
        "category": v.category,
        "location_name": v.location_name,
        "latitude": v.latitude,
        "longitude": v.longitude,
        "scheduled_at": v.scheduled_at,
        "max_participants": v.max_participants,
        "status": v.status,
        "participants_count": participants_count,
        "distance_km": distance_km,
    }


def _initials(name: str) -> str:
    parts = [p for p in name.split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()

