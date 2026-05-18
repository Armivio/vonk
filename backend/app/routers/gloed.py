import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_user, optional_user
from app.models import Gloed, User
from app.schemas.gloed import (
    AutoSubscribeAlternative,
    AutoSubscribedVonk,
    GloedCreateRequest,
    GloedDiscoverRequest,
    GloedDiscoverResponse,
    GloedOut,
)
from app.services.ai_conversation import handle_turn
from app.services.geo import bounding_box, haversine_km

router = APIRouter()


@router.post("/ai-discover", response_model=GloedDiscoverResponse)
async def ai_discover(
    body: GloedDiscoverRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(optional_user),
) -> GloedDiscoverResponse:
    location = (body.location.lat, body.location.lon) if body.location else None
    if location is None and user is not None and user.latitude and user.longitude:
        location = (user.latitude, user.longitude)

    result = await handle_turn(
        db,
        user=user,
        channel=user.channel if user else "web",
        session_id=body.session_id,
        message=body.message,
        location=location,
    )

    auto_payload = None
    alts: list[AutoSubscribeAlternative] = []
    if result.auto_subscribe is not None:
        v = result.auto_subscribe.vonk
        from sqlalchemy import func, select as _select
        from app.models import VonkParticipant

        count_res = await db.execute(
            _select(func.count(VonkParticipant.user_id)).where(
                VonkParticipant.vonk_id == v.id
            )
        )
        count = int(count_res.scalar() or 0)
        spots_left = max(0, (v.max_participants or 6) - count)
        auto_payload = AutoSubscribedVonk(
            vonk_id=v.id,
            title=v.title,
            location_name=v.location_name,
            scheduled_at=v.scheduled_at,
            spots_left=spots_left,
            action=result.auto_subscribe.action,
        )
        alts = [
            AutoSubscribeAlternative(
                vonk_id=a.id,
                title=a.title,
                location_name=a.location_name,
                scheduled_at=a.scheduled_at,
            )
            for a in result.auto_subscribe.alternatives
        ]

    return GloedDiscoverResponse(
        session_id=result.session_id,
        assistant_message=result.assistant_message,
        done=result.done,
        gloed=GloedOut.model_validate(result.gloed) if result.gloed else None,
        auto_subscribed=auto_payload,
        alternatives=alts,
    )


@router.post("", response_model=GloedOut)
async def create_gloed(
    body: GloedCreateRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> GloedOut:
    g = Gloed(
        user_id=user.id,
        raw_input=body.raw_input,
        ai_parsed=body.ai_parsed,
        category=body.category,
        energy_level=body.energy_level,
        group_size_pref=body.group_size_pref,
        time_preference=body.time_preference,
        latitude=body.latitude,
        longitude=body.longitude,
        radius_km=body.radius_km,
        active=True,
    )
    db.add(g)
    await db.commit()
    await db.refresh(g)
    return GloedOut.model_validate(g)


@router.get("/nearby", response_model=list[GloedOut])
async def gloeds_nearby(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(5.0, gt=0, le=50),
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(optional_user),
) -> list[GloedOut]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_km)
    stmt = select(Gloed).where(
        Gloed.active.is_(True),
        Gloed.latitude.between(min_lat, max_lat),
        Gloed.longitude.between(min_lon, max_lon),
    )
    if user is not None:
        stmt = stmt.where(Gloed.user_id != user.id)
    res = await db.execute(stmt)
    out: list[GloedOut] = []
    for g in res.scalars().all():
        if g.latitude is None or g.longitude is None:
            continue
        d = haversine_km(lat, lon, g.latitude, g.longitude)
        if d <= radius_km:
            out.append(GloedOut.model_validate(g))
    return out


@router.delete("/{gloed_id}", status_code=204)
async def deactivate_gloed(
    gloed_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    g = await db.get(Gloed, gloed_id)
    if g is None or g.user_id != user.id:
        raise HTTPException(404, "Gloed not found")
    g.active = False
    await db.commit()
