import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Body, Depends, Header, HTTPException, Query, Response
from sqlalchemy import func, select
from sqlalchemy.orm import aliased
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_user, optional_user
from app.models import User, Vonk, VonkFeedback, VonkParticipant
from app.schemas.vonk import (
    JoinRequest,
    VonkCreate,
    VonkDetailOut,
    VonkFeedbackCreate,
    VonkFeedbackOut,
    VonkOut,
    VonkParticipantOut,
    VonkUpdate,
)
from app.services.geo import bounding_box, haversine_km
from app.services.users import is_placeholder_name, normalise_phone

router = APIRouter()


@router.post("", response_model=VonkOut)
async def create_vonk(
    body: VonkCreate,
    db: AsyncSession = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> VonkOut:
    # Web sends X-User-Id; voice/Telegram send phone + user_name in the body.
    actor_hint = JoinRequest(phone=body.phone, user_name=body.user_name)
    user = await _resolve_actor(db, x_user_id, actor_hint, create_if_missing=True)
    assert user is not None  # create_if_missing=True never returns None
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
    return VonkOut(
        **_vonk_dict(
            vonk,
            participants_count=1,
            joined=True,
            creator_name=user.name,
            creator_last_name=user.last_name,
        )
    )


@router.get("/upcoming-mine", response_model=list[VonkOut])
async def upcoming_mine(
    hours_ahead: float = Query(2.0, gt=0, le=72),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> list[VonkOut]:
    """Vonken the current user has joined that start within the next N hours.

    Used by the in-app notification bell.
    """
    now = datetime.now(timezone.utc)
    horizon = now + __import__("datetime").timedelta(hours=hours_ahead)
    stmt = (
        select(Vonk, func.count(VonkParticipant.user_id).label("p_count"))
        .join(VonkParticipant, VonkParticipant.vonk_id == Vonk.id)
        .where(
            VonkParticipant.user_id == user.id,
            Vonk.scheduled_at >= now,
            Vonk.scheduled_at <= horizon,
        )
        .group_by(Vonk.id)
        .order_by(Vonk.scheduled_at.asc())
    )
    res = await db.execute(stmt)
    rows = res.all()
    return [
        VonkOut(**_vonk_dict(v, participants_count=int(c or 0), joined=True))
        for v, c in rows
    ]


@router.get("/discover", response_model=list[VonkOut])
async def discover_vonken(
    lat: float = Query(...),
    lon: float = Query(...),
    radius_km: float = Query(5.0, gt=0, le=50),
    category: Optional[str] = None,
    user: Optional[User] = Depends(optional_user),
    db: AsyncSession = Depends(get_db),
) -> list[VonkOut]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_km)
    now = datetime.now(timezone.utc)
    Creator = aliased(User)
    stmt = (
        select(
            Vonk,
            func.count(VonkParticipant.user_id).label("p_count"),
            Creator.name.label("creator_name"),
            Creator.last_name.label("creator_last_name"),
        )
        .outerjoin(VonkParticipant, VonkParticipant.vonk_id == Vonk.id)
        .outerjoin(Creator, Creator.id == Vonk.creator_id)
        .where(
            Vonk.status.in_(("open", "active", "full")),
            Vonk.scheduled_at >= now,
            Vonk.latitude.between(min_lat, max_lat),
            Vonk.longitude.between(min_lon, max_lon),
        )
        .group_by(Vonk.id, Creator.name, Creator.last_name)
        .order_by(Vonk.scheduled_at.asc())
    )
    if category:
        # Case-insensitive match so a stray "Social" from a client doesn't
        # silently return zero results.
        stmt = stmt.where(func.lower(Vonk.category) == category.strip().lower())
    result = await db.execute(stmt)
    rows = result.all()

    joined_ids: set[uuid.UUID] = set()
    if user is not None and rows:
        ids = [v.id for v, _, _, _ in rows]
        j = await db.execute(
            select(VonkParticipant.vonk_id).where(
                VonkParticipant.user_id == user.id,
                VonkParticipant.vonk_id.in_(ids),
            )
        )
        joined_ids = {row[0] for row in j.all()}

    out: list[VonkOut] = []
    for v, count, cname, clast in rows:
        d = haversine_km(lat, lon, v.latitude, v.longitude)
        if d > radius_km:
            continue
        out.append(
            VonkOut(
                **_vonk_dict(
                    v,
                    participants_count=int(count or 0),
                    distance_km=round(d, 2),
                    joined=v.id in joined_ids,
                    creator_name=cname,
                    creator_last_name=clast,
                )
            )
        )
    return out


@router.get("/{vonk_id}", response_model=VonkDetailOut)
async def get_vonk(
    vonk_id: uuid.UUID,
    user: Optional[User] = Depends(optional_user),
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
    participants_rows = parts.all()
    participants = [
        VonkParticipantOut(
            user_id=u.id,
            name=u.name,
            last_name=u.last_name,
            initials=_initials(u.name, u.last_name),
            age_group=u.age_group,
            joined_at=p.joined_at,
        )
        for p, u in participants_rows
    ]
    joined = user is not None and any(u.id == user.id for _, u in participants_rows)
    creator = next((u for _, u in participants_rows if u.id == vonk.creator_id), None)
    if creator is None and vonk.creator_id is not None:
        creator = await db.get(User, vonk.creator_id)
    return VonkDetailOut(
        **_vonk_dict(
            vonk,
            participants_count=len(participants),
            joined=joined,
            creator_name=creator.name if creator else None,
            creator_last_name=creator.last_name if creator else None,
        ),
        participants=participants,
    )


@router.patch("/{vonk_id}", response_model=VonkDetailOut)
async def update_vonk(
    vonk_id: uuid.UUID,
    body: VonkUpdate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> VonkDetailOut:
    vonk = await db.get(Vonk, vonk_id)
    if vonk is None:
        raise HTTPException(404, "Vonk not found")
    if vonk.creator_id != user.id:
        raise HTTPException(403, "Only the host can edit this vonk")
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(vonk, field, value)
    await db.commit()
    return await get_vonk(vonk_id, user, db)


@router.post("/{vonk_id}/cancel", status_code=204)
async def cancel_vonk(
    vonk_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    vonk = await db.get(Vonk, vonk_id)
    if vonk is None:
        raise HTTPException(404, "Vonk not found")
    if vonk.creator_id != user.id:
        raise HTTPException(403, "Only the host can cancel this vonk")
    vonk.status = "cancelled"
    await db.commit()
    return Response(status_code=204)


@router.post("/{vonk_id}/join", response_model=VonkDetailOut)
async def join_vonk(
    vonk_id: uuid.UUID,
    body: Optional[JoinRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> VonkDetailOut:
    user = await _resolve_actor(db, x_user_id, body, create_if_missing=True)
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
        cap = vonk.max_participants or 6
        if current_count >= cap:
            raise HTTPException(409, "Vonk is full")
        db.add(VonkParticipant(vonk_id=vonk_id, user_id=user.id))
        if current_count + 1 >= cap:
            vonk.status = "full"
    await db.commit()
    return await get_vonk(vonk_id, user, db)


async def _resolve_actor(
    db: AsyncSession,
    x_user_id: Optional[str],
    body: Optional[JoinRequest],
    *,
    create_if_missing: bool,
) -> Optional[User]:
    """Resolve the acting user from `X-User-Id` or fall back to phone in body.

    Voice and Telegram clients only have a phone number. For join we create a
    voice-channel user on first contact; for leave we return None (the caller
    treats it as a no-op — you can't leave something you never joined).
    """
    if x_user_id:
        try:
            uid = uuid.UUID(x_user_id)
        except ValueError as exc:
            raise HTTPException(401, "Invalid X-User-Id") from exc
        user = await db.get(User, uid)
        if user is None:
            raise HTTPException(401, "Unknown user")
        return user

    phone = normalise_phone(body.phone if body else None)
    if not phone:
        raise HTTPException(400, "Provide X-User-Id header or phone number")

    res = await db.execute(select(User).where(User.phone == phone))
    user = res.scalar_one_or_none()
    supplied_name = body.user_name.strip() if body and body.user_name else None
    if user is not None:
        if supplied_name and is_placeholder_name(user.name):
            user.name = supplied_name[:100]
            await db.flush()
        return user
    if not create_if_missing:
        return None
    user = User(
        name=supplied_name or "Phone User",
        phone=phone,
        channel="voice",
    )
    db.add(user)
    await db.flush()
    return user


@router.post("/{vonk_id}/feedback", response_model=VonkFeedbackOut)
async def submit_feedback(
    vonk_id: uuid.UUID,
    body: VonkFeedbackCreate,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> VonkFeedbackOut:
    vonk = await db.get(Vonk, vonk_id)
    if vonk is None:
        raise HTTPException(404, "Vonk not found")
    # Must be a participant
    p_res = await db.execute(
        select(VonkParticipant).where(
            VonkParticipant.vonk_id == vonk_id, VonkParticipant.user_id == user.id
        )
    )
    if p_res.scalar_one_or_none() is None:
        raise HTTPException(403, "Only participants can leave feedback")

    # Upsert by composite PK
    existing = await db.get(VonkFeedback, (vonk_id, user.id))
    if existing is None:
        fb = VonkFeedback(
            vonk_id=vonk_id,
            user_id=user.id,
            rating=body.rating,
            comment=(body.comment.strip() if body.comment else None),
            would_start_vuur=body.would_start_vuur,
        )
        db.add(fb)
    else:
        existing.rating = body.rating
        existing.comment = body.comment.strip() if body.comment else None
        existing.would_start_vuur = body.would_start_vuur
        fb = existing
    await db.commit()
    await db.refresh(fb)
    return VonkFeedbackOut.model_validate(fb)


@router.get("/{vonk_id}/feedback/me", response_model=Optional[VonkFeedbackOut])
async def my_feedback(
    vonk_id: uuid.UUID,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Optional[VonkFeedbackOut]:
    fb = await db.get(VonkFeedback, (vonk_id, user.id))
    return VonkFeedbackOut.model_validate(fb) if fb else None


@router.post("/{vonk_id}/leave", status_code=204)
async def leave_vonk(
    vonk_id: uuid.UUID,
    body: Optional[JoinRequest] = Body(default=None),
    db: AsyncSession = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> Response:
    user = await _resolve_actor(db, x_user_id, body, create_if_missing=False)
    if user is None:
        return Response(status_code=204)
    vonk = await db.get(Vonk, vonk_id)
    if vonk is None:
        return Response(status_code=204)
    res = await db.execute(
        select(VonkParticipant).where(
            VonkParticipant.vonk_id == vonk_id, VonkParticipant.user_id == user.id
        )
    )
    part = res.scalar_one_or_none()
    if part is not None:
        await db.delete(part)
        if vonk.status == "full":
            vonk.status = "open"
        await db.commit()
    return Response(status_code=204)


def _vonk_dict(
    v: Vonk,
    *,
    participants_count: int,
    distance_km: Optional[float] = None,
    joined: bool = False,
    creator_name: Optional[str] = None,
    creator_last_name: Optional[str] = None,
) -> dict:
    cap = v.max_participants or 6
    return {
        "id": v.id,
        "creator_id": v.creator_id,
        "creator_name": creator_name,
        "creator_last_name": creator_last_name,
        "title": v.title,
        "description": v.description,
        "category": v.category,
        "location_name": v.location_name,
        "latitude": v.latitude,
        "longitude": v.longitude,
        "scheduled_at": v.scheduled_at,
        "scheduled_at_human": _humanise_when(v.scheduled_at),
        "max_participants": v.max_participants,
        "status": v.status,
        "participants_count": participants_count,
        "is_full": participants_count >= cap,
        "joined": joined,
        "distance_km": distance_km,
    }


def _humanise_when(dt: Optional[datetime]) -> Optional[str]:
    """Render `scheduled_at` for non-UI consumers (voice agent, Telegram).

    Examples: "Today at 17:00" · "Tomorrow at 19:00" · "Wednesday at 14:00"
    · "Wed 27 May at 14:00" (for anything > 6 days out or in the past).
    """
    if dt is None:
        return None
    dt_aware = dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    time_str = dt_aware.strftime("%H:%M")
    delta_days = (dt_aware.date() - now.date()).days
    if delta_days == 0:
        return f"Today at {time_str}"
    if delta_days == 1:
        return f"Tomorrow at {time_str}"
    if 2 <= delta_days <= 6:
        return f"{dt_aware.strftime('%A')} at {time_str}"
    return dt_aware.strftime("%a %d %b at ") + time_str


def _initials(name: str, last_name: Optional[str] = None) -> str:
    first = name.strip() if name else ""
    last = (last_name or "").strip()
    if first and last:
        return (first[0] + last[0]).upper()
    parts = [p for p in (first or "").split() if p]
    if not parts:
        return "?"
    if len(parts) == 1:
        return parts[0][:2].upper()
    return (parts[0][0] + parts[-1][0]).upper()
