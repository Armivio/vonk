"""Portal endpoint used by community workers (wijkconnectoren) to register
residents — typically elderly or low-digital-literacy people — on their
behalf, with consent.

The created user has channel='wijkconnector', a derived preferences dict
(no AI onboarding chat needed), and is immediately eligible for matching.
"""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User
from app.schemas.wijkconnector import (
    WijkconnectorRegistration,
    WijkconnectorRegistrationOut,
)

router = APIRouter()


def _social_style_from_interests(interests: list[str]) -> str:
    if "social" in interests:
        return "small_groups"
    if "quiet" in interests:
        return "one_on_one"
    return "any_size"


def _typical_when_from_availability(avail: list[str]) -> str:
    if "evening" in avail:
        return "weekday_evenings"
    if "morning" in avail and "afternoon" in avail:
        return "weekends"
    return "spontaneous"


def _preferences_from_form(body: WijkconnectorRegistration) -> dict[str, Any]:
    interests = [i for i in body.interests if i in {"social", "active", "creative", "learning", "quiet", "food"}]
    if not interests:
        interests = ["social"]
    lang = body.language if body.language in ("nl", "en") else "nl"
    return {
        "interests": interests,
        "social_style": _social_style_from_interests(interests),
        "energy_baseline": "balanced",
        "typical_when": _typical_when_from_availability(body.availability),
        "comfort_radius_km": 2,
        "language": lang,
        "notes": (body.notes or "").strip()[:280] or "Registered via wijkconnector portal.",
    }


@router.post("/register", response_model=WijkconnectorRegistrationOut)
async def wijkconnector_register(
    body: WijkconnectorRegistration,
    db: AsyncSession = Depends(get_db),
) -> WijkconnectorRegistrationOut:
    if not body.consent_obtained:
        raise HTTPException(
            status_code=422,
            detail="Consent must be obtained before registering a resident.",
        )
    if not body.first_name.strip():
        raise HTTPException(status_code=422, detail="First name is required.")

    user = User(
        name=body.first_name.strip()[:100],
        last_name=(body.last_name.strip()[:100] if body.last_name else None),
        phone=(body.phone.strip()[:20] if body.phone else None),
        channel="wijkconnector",
        city=body.city.strip()[:100] or "Rotterdam",
        neighborhood=(body.neighborhood.strip()[:100] if body.neighborhood else None),
        preferences=_preferences_from_form(body),
        registered_by_name=(body.registered_by_name.strip()[:100] if body.registered_by_name else None),
        registered_by_org=(body.registered_by_org.strip()[:100] if body.registered_by_org else None),
        contact_preference=body.contact_preference,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    return WijkconnectorRegistrationOut(
        user_id=str(user.id),
        name=user.name,
        last_name=user.last_name,
        neighborhood=user.neighborhood,
        language=(user.preferences or {}).get("language", "nl"),
        interests=(user.preferences or {}).get("interests", []),
        registered_by_name=user.registered_by_name,
        registered_by_org=user.registered_by_org,
        contact_preference=user.contact_preference or "call",
    )
