"""Auto-subscribe: after a gloed is created, either join the user to a
matching open vonk or create a fresh vonk and make them the host.

Pure side-effect helper used from the gloed AI flow. Falls back gracefully
if Anthropic is unavailable or the user has no location.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Literal, Optional

from anthropic import AsyncAnthropic
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Gloed, User, Vonk, VonkParticipant
from app.services.geo import bounding_box, haversine_km
from app.services.prompts import SUGGEST_VONK_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

AutoSubscribeAction = Literal["joined", "created_and_joined"]


@dataclass
class AutoSubscribeResult:
    vonk: Vonk
    action: AutoSubscribeAction
    alternatives: list[Vonk]


async def auto_subscribe_from_gloed(
    db: AsyncSession,
    *,
    gloed: Gloed,
    user: User,
) -> Optional[AutoSubscribeResult]:
    if gloed.latitude is None or gloed.longitude is None:
        return None

    radius_km = (gloed.radius_km or 5.0) * 1.5
    matches = await _nearby_open_vonken(
        db,
        lat=gloed.latitude,
        lon=gloed.longitude,
        radius_km=radius_km,
        category=gloed.category,
        user_id=user.id,
    )

    if matches:
        best, _ = matches[0]
        await _add_participant(db, best, user)
        alternatives = [v for v, _ in matches[1:4] if v.id != best.id]
        return AutoSubscribeResult(vonk=best, action="joined", alternatives=alternatives)

    created = await _create_vonk_from_gloed(db, gloed=gloed, host=user)
    if created is None:
        return None
    return AutoSubscribeResult(vonk=created, action="created_and_joined", alternatives=[])


async def _nearby_open_vonken(
    db: AsyncSession,
    *,
    lat: float,
    lon: float,
    radius_km: float,
    category: Optional[str],
    user_id: uuid.UUID,
) -> list[tuple[Vonk, float]]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(lat, lon, radius_km)
    now = datetime.now(timezone.utc)

    already_in = await db.execute(
        select(VonkParticipant.vonk_id).where(VonkParticipant.user_id == user_id)
    )
    excluded = {row[0] for row in already_in.all()}

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
        .limit(40)
    )
    res = await db.execute(stmt)
    rows = res.all()

    scored: list[tuple[Vonk, float, int]] = []
    for v, count in rows:
        if v.id in excluded:
            continue
        cap = v.max_participants or 6
        if int(count or 0) >= cap:
            continue
        d = haversine_km(lat, lon, v.latitude, v.longitude)
        if d > radius_km:
            continue
        cat_bonus = -0.5 if category and v.category == category else 0.0
        scored.append((v, d + cat_bonus, int(count or 0)))

    scored.sort(key=lambda t: t[1])
    return [(v, d) for v, d, _ in scored[:6]]


async def _add_participant(db: AsyncSession, vonk: Vonk, user: User) -> None:
    existing = await db.execute(
        select(VonkParticipant).where(
            VonkParticipant.vonk_id == vonk.id, VonkParticipant.user_id == user.id
        )
    )
    if existing.scalar_one_or_none() is not None:
        return
    db.add(VonkParticipant(vonk_id=vonk.id, user_id=user.id))
    count_res = await db.execute(
        select(func.count(VonkParticipant.user_id)).where(
            VonkParticipant.vonk_id == vonk.id
        )
    )
    current = int(count_res.scalar() or 0)
    if current + 1 >= (vonk.max_participants or 6):
        vonk.status = "full"
    await db.commit()
    await db.refresh(vonk)


async def _create_vonk_from_gloed(
    db: AsyncSession, *, gloed: Gloed, host: User
) -> Optional[Vonk]:
    suggestion = await _ai_design_vonk(gloed)
    if suggestion is None:
        suggestion = _fallback_suggestion(gloed)

    scheduled_at = _resolve_time(gloed.time_preference, suggestion.get("when_relative"))

    vonk = Vonk(
        creator_id=host.id,
        title=suggestion["title"][:200],
        description=suggestion.get("description"),
        category=suggestion.get("category") or gloed.category or "social",
        location_name=suggestion.get("location_name"),
        latitude=gloed.latitude,
        longitude=gloed.longitude,
        scheduled_at=scheduled_at,
        max_participants=6,
        status="open",
        ai_suggested=True,
    )
    db.add(vonk)
    await db.flush()
    db.add(VonkParticipant(vonk_id=vonk.id, user_id=host.id))
    await db.commit()
    await db.refresh(vonk)
    return vonk


async def _ai_design_vonk(gloed: Gloed) -> Optional[dict[str, Any]]:
    if not settings.anthropic_api_key:
        return None
    payload = {
        "description": gloed.ai_parsed or gloed.raw_input,
        "category": gloed.category,
        "energy_level": gloed.energy_level,
        "group_size_pref": gloed.group_size_pref,
        "time_preference": gloed.time_preference,
    }
    tool = {
        "name": "suggest_vonk",
        "description": "Design a concrete micro-gathering this single person can host.",
        "input_schema": {
            "type": "object",
            "required": [
                "title",
                "description",
                "category",
                "location_name",
                "when_relative",
                "why_it_works",
            ],
            "properties": {
                "title": {"type": "string"},
                "description": {"type": "string"},
                "category": {
                    "type": "string",
                    "enum": ["social", "active", "creative", "learning", "quiet", "food"],
                },
                "location_name": {"type": "string"},
                "when_relative": {"type": "string"},
                "why_it_works": {"type": "string"},
            },
        },
    }
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=500,
            system=SUGGEST_VONK_SYSTEM_PROMPT,
            tools=[tool],
            tool_choice={"type": "tool", "name": "suggest_vonk"},
            messages=[
                {
                    "role": "user",
                    "content": (
                        "Design a single small vonk in Rotterdam that this one person "
                        "could host, so others nearby with similar gloeds can join:\n"
                        + json.dumps(payload, indent=2)
                    ),
                }
            ],
        )
    except Exception:
        logger.exception("Auto-subscribe vonk design failed; using fallback")
        return None

    tool_block = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"), None
    )
    if tool_block is None:
        return None
    return dict(tool_block.input)


def _fallback_suggestion(gloed: Gloed) -> dict[str, Any]:
    cat = gloed.category or "social"
    titles = {
        "social": "Coffee & conversations",
        "active": "Easy evening walk",
        "creative": "Sketchbooks & a corner table",
        "learning": "Reading hour, swap one thing",
        "quiet": "Quiet park hour",
        "food": "Small plates, slow chat",
    }
    return {
        "title": titles.get(cat, "An easy gathering"),
        "description": "A small, low-pressure spot. Two to six people. Show up, see who sparks.",
        "category": cat,
        "location_name": "A cozy spot nearby",
        "when_relative": gloed.time_preference or "this_week",
        "why_it_works": "Same vibe, same evening — that's usually enough.",
    }


def _resolve_time(
    time_preference: Optional[str], when_relative: Optional[str]
) -> datetime:
    now = datetime.now(timezone.utc)
    text = (when_relative or "").lower()

    if "tonight" in text or "today" in text or time_preference == "today":
        return _today_at(19, now)
    if "tomorrow" in text:
        return _tomorrow_at(19, now)
    if "weekend" in text or "saturday" in text or "sunday" in text:
        return _next_weekend(now)
    if time_preference == "now":
        return now + timedelta(hours=2)

    # default: friday evening
    return _next_weekday(4, 19, now)


def _today_at(hour: int, now: datetime) -> datetime:
    target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= now + timedelta(minutes=30):
        target = now + timedelta(hours=2)
    return target


def _tomorrow_at(hour: int, now: datetime) -> datetime:
    return (now + timedelta(days=1)).replace(hour=hour, minute=0, second=0, microsecond=0)


def _next_weekday(weekday: int, hour: int, now: datetime) -> datetime:
    delta = (weekday - now.weekday()) % 7
    if delta == 0:
        delta = 7
    return (now + timedelta(days=delta)).replace(hour=hour, minute=0, second=0, microsecond=0)


def _next_weekend(now: datetime) -> datetime:
    # Saturday at 14:00
    return _next_weekday(5, 14, now)
