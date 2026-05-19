from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_user
from app.models import User, Vonk, VonkParticipant, Vuur, VuurMember
from app.schemas.auth import (
    AnonymousLoginRequest,
    GuestLoginRequest,
    OtpSendRequest,
    OtpSendResponse,
    OtpVerifyRequest,
    SigninRequest,
    UserOut,
)
from app.services.otp import is_email, normalise, send_otp, verify_otp
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


@router.get("/me/stats")
async def my_stats(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    # vonken attended (joined)
    joined_count_res = await db.execute(
        select(func.count(VonkParticipant.vonk_id)).where(VonkParticipant.user_id == user.id)
    )
    joined_count = int(joined_count_res.scalar() or 0)

    # vonken hosted
    hosted_count_res = await db.execute(
        select(func.count(Vonk.id)).where(Vonk.creator_id == user.id)
    )
    hosted_count = int(hosted_count_res.scalar() or 0)

    # vuuren membership
    try:
        vuren_count_res = await db.execute(
            select(func.count(VuurMember.vuur_id)).where(VuurMember.user_id == user.id)
        )
        vuren_count = int(vuren_count_res.scalar() or 0)
    except Exception:
        vuren_count = 0

    # connections = distinct co-participants across joined vonken
    co_res = await db.execute(
        select(VonkParticipant.user_id)
        .where(
            VonkParticipant.vonk_id.in_(
                select(VonkParticipant.vonk_id).where(VonkParticipant.user_id == user.id)
            ),
            VonkParticipant.user_id != user.id,
        )
        .distinct()
    )
    connections = len(co_res.all())

    return {
        "vonken_attended": joined_count,
        "vonken_hosted": hosted_count,
        "vuuren_member": vuren_count,
        "connections": connections,
        "joined_month": user.created_at.strftime("%b %Y"),
    }


@router.post("/send-code", response_model=OtpSendResponse)
async def send_code(
    body: OtpSendRequest,
) -> OtpSendResponse:
    try:
        result = await send_otp(body.identifier)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return OtpSendResponse(sent=result.sent, method=result.method, dev_code=result.dev_code)


@router.post("/verify-code", response_model=UserOut)
async def verify_code(
    body: OtpVerifyRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    if not await verify_otp(body.identifier, body.code):
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    identifier = normalise(body.identifier)
    email = identifier if is_email(identifier) else None
    phone = None if is_email(identifier) else identifier

    # Find an existing account by whichever channel was used.
    if email:
        res = await db.execute(select(User).where(User.email == email))
    else:
        res = await db.execute(select(User).where(User.phone == phone))
    user = res.scalar_one_or_none()

    if user is None:
        if not body.name or not body.name.strip():
            raise HTTPException(
                status_code=422,
                detail="name is required to create a new account",
            )
        user = User(
            name=body.name.strip()[:100],
            last_name=(body.last_name.strip()[:100] if body.last_name else None),
            email=email,
            phone=phone,
            city=(body.city.strip()[:100] if body.city else "Rotterdam"),
            neighborhood=(body.neighborhood.strip()[:100] if body.neighborhood else None),
            channel="web",
        )
        db.add(user)
    else:
        # Fill in optional profile fields if we have them and the user didn't.
        if body.last_name and not user.last_name:
            user.last_name = body.last_name.strip()[:100]
        if body.city and not user.city:
            user.city = body.city.strip()[:100]

    user.last_active = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/me", status_code=204)
async def delete_account(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    """Hard-delete the current user account.

    For the demo we delete the row directly. Foreign-key cascades on
    `vonk_participants` and `vuur_members` clean up join rows; vonken
    they hosted are kept but lose the creator reference (creator_id is nullable).
    """
    await db.delete(user)
    await db.commit()
