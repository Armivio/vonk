from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User
from app.schemas.auth import (
    AnonymousLoginRequest,
    GuestLoginRequest,
    UserOut,
)
from app.services.users import find_or_create_anonymous

router = APIRouter()


@router.post("/guest", response_model=UserOut)
async def guest_login(
    body: GuestLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """If user_id matches an existing user, return them; otherwise create a fresh guest."""
    if body.user_id is not None:
        existing = await db.get(User, body.user_id)
        if existing is not None:
            existing.last_active = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(existing)
            return UserOut.model_validate(existing)

    if not body.name or not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required for new guests")

    user = User(
        name=body.name.strip()[:100],
        channel="web",
        latitude=body.latitude,
        longitude=body.longitude,
        city=body.city or "Rotterdam",
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/anonymous", response_model=UserOut)
async def anonymous_login(
    body: AnonymousLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    user = await find_or_create_anonymous(
        db,
        client_id=body.client_id,
        name=body.name,
        latitude=body.latitude,
        longitude=body.longitude,
        city=body.city,
    )
    return UserOut.model_validate(user)
