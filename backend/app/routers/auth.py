from fastapi import APIRouter, Depends
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
    """Always creates a fresh guest. Each device/browser/refresh gets its own user."""
    user = User(
        name=body.name.strip()[:100] or "Vriend",
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
