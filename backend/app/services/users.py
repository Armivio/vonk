from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User


def normalise_phone(raw: Optional[str]) -> str:
    """Strip whitespace and punctuation but keep a leading +.

    Same shape as the OTP normaliser so a number written as "+31 6 1234 5678"
    and "+31612345678" hit the same `users.phone` row instead of two.
    """
    s = (raw or "").strip()
    return "".join(ch for ch in s if ch.isdigit() or ch == "+")


_PLACEHOLDER_NAMES = {"", "vriend", "phone user"}


def is_placeholder_name(name: Optional[str]) -> bool:
    """True for names auto-assigned at user creation when we didn't know better.

    Lets us upgrade the row when the real name arrives on a later turn — but
    only if we never had a real one to start with.
    """
    return name is None or name.strip().lower() in _PLACEHOLDER_NAMES


async def find_or_create_anonymous(
    db: AsyncSession,
    *,
    client_id: str,
    name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    city: Optional[str] = None,
) -> User:
    """Idempotent: upserts a web user keyed by `client_id`."""
    result = await db.execute(select(User).where(User.client_id == client_id))
    user = result.scalar_one_or_none()

    if user is None:
        user = User(
            name=name or "Vriend",
            client_id=client_id,
            channel="web",
            latitude=latitude,
            longitude=longitude,
            city=city,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    changed = False
    if name and user.name in (None, "", "Vriend"):
        user.name = name
        changed = True
    if latitude is not None and user.latitude is None:
        user.latitude = latitude
        changed = True
    if longitude is not None and user.longitude is None:
        user.longitude = longitude
        changed = True
    if city and not user.city:
        user.city = city
        changed = True
    if changed:
        await db.commit()
        await db.refresh(user)
    return user


async def find_or_create_by_phone(
    db: AsyncSession,
    *,
    phone: str,
    channel: str,
    name: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    city: Optional[str] = None,
) -> User:
    phone = normalise_phone(phone)
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            name=name or "Vriend",
            phone=phone,
            channel=channel,
            latitude=latitude,
            longitude=longitude,
            city=city,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        return user

    # Existing row — fill in fields the user has now provided that we never had.
    changed = False
    if name and is_placeholder_name(user.name):
        user.name = name.strip()[:100]
        changed = True
    if latitude is not None and user.latitude is None:
        user.latitude = latitude
        changed = True
    if longitude is not None and user.longitude is None:
        user.longitude = longitude
        changed = True
    if city and not user.city:
        user.city = city
        changed = True
    if changed:
        await db.commit()
        await db.refresh(user)
    return user
