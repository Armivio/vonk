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
    PhoneLookupRequest,
    SigninRequest,
    UpdatePreferencesRequest,
    UserOut,
)
from app.services.otp import is_email, normalise, send_otp, verify_otp
from app.services.users import (
    find_or_create_anonymous,
    find_or_create_by_phone,
    normalise_phone,
)

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


@router.post("/phone-lookup", response_model=UserOut)
async def phone_lookup(
    body: PhoneLookupRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Voice/WhatsApp entry-point. Find a user by phone, or create one on first call.

    The MCP `get_or_create_user` tool calls this at the start of every phone
    conversation so the agent always has a user_id and (when returning) full prefs.
    """
    phone = normalise_phone(body.phone)
    if not phone or len(phone) < 6:
        raise HTTPException(status_code=422, detail="A valid phone number is required.")
    user = await find_or_create_by_phone(
        db,
        phone=phone,
        channel=body.channel or "voice",
        name=body.name,
    )
    user.last_active = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.get("/by-phone/{phone}", response_model=UserOut)
async def get_by_phone(
    phone: str,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Look up a user by phone WITHOUT creating one. 404 if unknown."""
    norm = normalise_phone(phone)
    if not norm:
        raise HTTPException(status_code=422, detail="Invalid phone")
    res = await db.execute(select(User).where(User.phone == norm))
    user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="No user with that phone")
    return UserOut.model_validate(user)


_GROUP_SIZE_VALUES = {"one_on_one", "small_groups", "any_size"}
_TIME_PREF_VALUES = {"weekday_evenings", "weekends", "spontaneous"}
_CATEGORY_VALUES = {"social", "active", "creative", "learning", "quiet", "food"}


@router.patch("/preferences", response_model=UserOut)
async def update_preferences(
    body: UpdatePreferencesRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    """Merge new preferences into the existing JSONB blob.

    Identify the user by `phone` or `user_id`. Fields left None are preserved.
    Voice-agent vocabulary (`categories`, `group_size`, `time_preference`,
    `languages`) is mapped to the canonical schema used elsewhere
    (`interests`, `social_style`, `typical_when`, `language`).
    """
    user: Optional[User] = None
    if body.user_id is not None:
        user = await db.get(User, body.user_id)
    elif body.phone is not None:
        norm = normalise_phone(body.phone)
        res = await db.execute(select(User).where(User.phone == norm))
        user = res.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    prefs: dict[str, Any] = dict(user.preferences or {})

    if body.categories is not None:
        valid = [c for c in body.categories if c in _CATEGORY_VALUES]
        if valid:
            prefs["interests"] = valid[:4]

    if body.group_size is not None:
        if body.group_size not in _GROUP_SIZE_VALUES:
            raise HTTPException(
                status_code=422,
                detail=f"group_size must be one of {sorted(_GROUP_SIZE_VALUES)}",
            )
        prefs["social_style"] = body.group_size

    if body.time_preference is not None:
        if body.time_preference not in _TIME_PREF_VALUES:
            raise HTTPException(
                status_code=422,
                detail=f"time_preference must be one of {sorted(_TIME_PREF_VALUES)}",
            )
        prefs["typical_when"] = body.time_preference

    if body.languages is not None and body.languages:
        first = body.languages[0].lower()
        prefs["language"] = "nl" if first.startswith("nl") else "en"
        extras = [l for l in body.languages[1:] if l]
        if extras:
            existing_notes = prefs.get("notes", "") or ""
            tag = f"Also speaks: {', '.join(extras)}."
            if tag not in existing_notes:
                prefs["notes"] = (existing_notes + " " + tag).strip()[:300]

    # Defensive defaults so the row is well-formed even after a single-field patch.
    prefs.setdefault("interests", ["social"])
    prefs.setdefault("social_style", "any_size")
    prefs.setdefault("energy_baseline", "balanced")
    prefs.setdefault("typical_when", "spontaneous")
    prefs.setdefault("comfort_radius_km", 5)
    prefs.setdefault("language", "en")

    user.preferences = prefs
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
