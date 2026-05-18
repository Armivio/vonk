from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User
from app.schemas.auth import (
    AnonymousLoginRequest,
    GuestLoginRequest,
    SigninRequest,
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
            # Update optional profile fields if newly provided
            if body.last_name and not existing.last_name:
                existing.last_name = body.last_name.strip()[:100]
            if body.email and not existing.email:
                existing.email = body.email.strip().lower()[:255]
            if body.phone and not existing.phone:
                existing.phone = body.phone.strip()[:20]
            if body.neighborhood and not existing.neighborhood:
                existing.neighborhood = body.neighborhood.strip()[:100]
            if body.city and not existing.city:
                existing.city = body.city.strip()[:100]
            await db.commit()
            await db.refresh(existing)
            return UserOut.model_validate(existing)

    if not body.name or not body.name.strip():
        raise HTTPException(status_code=422, detail="name is required for new guests")

    email_norm = body.email.strip().lower() if body.email else None
    # Email collision → return the existing user so signup re-uses the account.
    if email_norm:
        existing_by_email = await db.execute(select(User).where(User.email == email_norm))
        eu = existing_by_email.scalar_one_or_none()
        if eu is not None:
            eu.last_active = datetime.now(timezone.utc)
            await db.commit()
            await db.refresh(eu)
            return UserOut.model_validate(eu)

    user = User(
        name=body.name.strip()[:100],
        last_name=(body.last_name.strip()[:100] if body.last_name else None),
        email=email_norm,
        phone=(body.phone.strip()[:20] if body.phone else None),
        channel="web",
        latitude=body.latitude,
        longitude=body.longitude,
        city=(body.city.strip()[:100] if body.city else "Rotterdam"),
        neighborhood=(body.neighborhood.strip()[:100] if body.neighborhood else None),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/signin", response_model=UserOut)
async def signin(body: SigninRequest, db: AsyncSession = Depends(get_db)) -> UserOut:
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=422, detail="valid email is required")
    res = await db.execute(select(User).where(User.email == email))
    user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="No account with that email")
    user.last_active = datetime.now(timezone.utc)
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
