"""Matching engine.

Pre-filter nearby candidates (gloeds + open vonken) by haversine bbox,
then ask Claude to rank them via the `submit_matches` tool. We always
return what the model gives us, sorted by score, with distance attached.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Optional

from anthropic import AsyncAnthropic
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Gloed, Vonk, VonkParticipant
from app.services.geo import bounding_box, haversine_km
from app.services.prompts import MATCHING_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

MAX_GLOED_CANDIDATES = 15
MAX_VONK_CANDIDATES = 10


SUBMIT_MATCHES_TOOL: dict[str, Any] = {
    "name": "submit_matches",
    "description": "Submit the ranked list of matches for the target gloed.",
    "input_schema": {
        "type": "object",
        "required": ["matches"],
        "properties": {
            "matches": {
                "type": "array",
                "items": {
                    "type": "object",
                    "required": [
                        "candidate_id",
                        "type",
                        "score",
                        "reason",
                        "suggested_activity",
                    ],
                    "properties": {
                        "candidate_id": {"type": "string"},
                        "type": {"type": "string", "enum": ["gloed", "vonk"]},
                        "score": {"type": "integer", "minimum": 0, "maximum": 100},
                        "reason": {"type": "string"},
                        "suggested_activity": {"type": "string"},
                    },
                },
            }
        },
    },
}


@dataclass
class MatchResult:
    type: str
    id: uuid.UUID
    score: int
    reason: str
    suggested_activity: str
    distance_km: Optional[float]
    preview: dict[str, Any]


async def match_for_gloed(db: AsyncSession, gloed_id: uuid.UUID) -> list[MatchResult]:
    target: Optional[Gloed] = await db.get(Gloed, gloed_id)
    if target is None:
        return []
    if target.latitude is None or target.longitude is None:
        return []

    gloed_candidates = await _nearby_active_gloeds(db, target)
    vonk_candidates = await _nearby_open_vonken(db, target)

    if not gloed_candidates and not vonk_candidates:
        return []

    if not settings.anthropic_api_key:
        return _heuristic_fallback(target, gloed_candidates, vonk_candidates)

    return await _rank_with_claude(target, gloed_candidates, vonk_candidates)


async def _nearby_active_gloeds(db: AsyncSession, target: Gloed) -> list[tuple[Gloed, float]]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(
        target.latitude, target.longitude, target.radius_km or 5.0
    )
    conditions = [
        Gloed.active.is_(True),
        Gloed.id != target.id,
        Gloed.latitude.between(min_lat, max_lat),
        Gloed.longitude.between(min_lon, max_lon),
    ]
    # Never match a user against their own gloeds — they'd find themselves.
    if target.user_id is not None:
        conditions.append(Gloed.user_id != target.user_id)
    stmt = select(Gloed).where(*conditions).limit(MAX_GLOED_CANDIDATES * 2)
    res = await db.execute(stmt)
    out: list[tuple[Gloed, float]] = []
    for g in res.scalars().all():
        if g.latitude is None or g.longitude is None:
            continue
        d = haversine_km(target.latitude, target.longitude, g.latitude, g.longitude)
        if d <= (target.radius_km or 5.0):
            out.append((g, d))
    out.sort(key=lambda x: x[1])
    return out[:MAX_GLOED_CANDIDATES]


async def _nearby_open_vonken(db: AsyncSession, target: Gloed) -> list[tuple[Vonk, float, int]]:
    min_lat, max_lat, min_lon, max_lon = bounding_box(
        target.latitude, target.longitude, (target.radius_km or 5.0) * 1.5
    )
    now = datetime.now(timezone.utc)
    stmt = (
        select(
            Vonk,
            func.count(VonkParticipant.user_id).label("p_count"),
        )
        .outerjoin(VonkParticipant, VonkParticipant.vonk_id == Vonk.id)
        .where(
            Vonk.status.in_(("open", "active")),
            Vonk.scheduled_at >= now,
            Vonk.latitude.between(min_lat, max_lat),
            Vonk.longitude.between(min_lon, max_lon),
        )
        .group_by(Vonk.id)
        .limit(MAX_VONK_CANDIDATES * 2)
    )
    res = await db.execute(stmt)
    out: list[tuple[Vonk, float, int]] = []
    for v, count in res.all():
        d = haversine_km(target.latitude, target.longitude, v.latitude, v.longitude)
        if d <= (target.radius_km or 5.0) * 1.5:
            out.append((v, d, int(count or 0)))
    out.sort(key=lambda x: x[1])
    return out[:MAX_VONK_CANDIDATES]


async def _rank_with_claude(
    target: Gloed,
    gloeds: list[tuple[Gloed, float]],
    vonken: list[tuple[Vonk, float, int]],
) -> list[MatchResult]:
    target_payload = {
        "description": target.ai_parsed or target.raw_input,
        "category": target.category,
        "energy_level": target.energy_level,
        "group_size_pref": target.group_size_pref,
        "time_preference": target.time_preference,
    }
    candidates: list[dict[str, Any]] = []
    by_id: dict[str, MatchResult] = {}

    for g, dist in gloeds:
        cid = f"gloed:{g.id}"
        candidates.append(
            {
                "id": cid,
                "type": "gloed",
                "description": g.ai_parsed or g.raw_input,
                "category": g.category,
                "energy_level": g.energy_level,
                "group_size_pref": g.group_size_pref,
                "time_preference": g.time_preference,
                "distance_km": round(dist, 2),
            }
        )
        by_id[cid] = MatchResult(
            type="gloed",
            id=g.id,
            score=0,
            reason="",
            suggested_activity="",
            distance_km=round(dist, 2),
            preview={
                "description": g.ai_parsed or g.raw_input,
                "category": g.category,
            },
        )

    for v, dist, count in vonken:
        cid = f"vonk:{v.id}"
        candidates.append(
            {
                "id": cid,
                "type": "vonk",
                "title": v.title,
                "description": v.description,
                "category": v.category,
                "when": v.scheduled_at.isoformat() if v.scheduled_at else None,
                "location_name": v.location_name,
                "spots_left": max(0, (v.max_participants or 6) - count),
                "distance_km": round(dist, 2),
            }
        )
        by_id[cid] = MatchResult(
            type="vonk",
            id=v.id,
            score=0,
            reason="",
            suggested_activity="",
            distance_km=round(dist, 2),
            preview={
                "title": v.title,
                "description": v.description,
                "category": v.category,
                "when": v.scheduled_at.isoformat() if v.scheduled_at else None,
                "location_name": v.location_name,
            },
        )

    user_msg = (
        "Target gloed:\n"
        f"{json.dumps(target_payload, indent=2)}\n\n"
        "Candidates (numbered for your reference; use the candidate_id field when ranking):\n"
        f"{json.dumps(candidates, indent=2)}"
    )

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    try:
        response = await client.messages.create(
            model=settings.anthropic_model,
            max_tokens=1500,
            system=MATCHING_SYSTEM_PROMPT,
            tools=[SUBMIT_MATCHES_TOOL],
            tool_choice={"type": "tool", "name": "submit_matches"},
            messages=[{"role": "user", "content": user_msg}],
        )
    except Exception:
        logger.exception("Claude ranking failed; falling back to heuristic")
        return _heuristic_fallback(target, gloeds, vonken)

    tool_block = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"), None
    )
    if tool_block is None:
        return _heuristic_fallback(target, gloeds, vonken)

    matches_in = tool_block.input.get("matches", [])
    results: list[MatchResult] = []
    for m in matches_in:
        cid = m.get("candidate_id")
        base = by_id.get(cid)
        if base is None:
            continue
        results.append(
            MatchResult(
                type=base.type,
                id=base.id,
                score=int(m.get("score", 0)),
                reason=m.get("reason", ""),
                suggested_activity=m.get("suggested_activity", ""),
                distance_km=base.distance_km,
                preview=base.preview,
            )
        )
    results.sort(key=lambda r: r.score, reverse=True)
    return results[:8]


def _heuristic_fallback(
    target: Gloed,
    gloeds: list[tuple[Gloed, float]],
    vonken: list[tuple[Vonk, float, int]],
) -> list[MatchResult]:
    """Simple scoring used when the LLM is unreachable: closer + same category wins."""
    out: list[MatchResult] = []
    for g, dist in gloeds:
        score = 60 + (10 if g.category == target.category else 0) + max(0, 20 - int(dist * 4))
        out.append(
            MatchResult(
                type="gloed",
                id=g.id,
                score=min(100, score),
                reason=f"Another {g.category or 'soul'} looking for something nearby.",
                suggested_activity="Send a small signal and see if it sparks.",
                distance_km=round(dist, 2),
                preview={
                    "description": g.ai_parsed or g.raw_input,
                    "category": g.category,
                },
            )
        )
    for v, dist, count in vonken:
        score = 65 + (15 if v.category == target.category else 0) + max(0, 20 - int(dist * 4))
        out.append(
            MatchResult(
                type="vonk",
                id=v.id,
                score=min(100, score),
                reason=f"A nearby {v.category or 'gathering'} with spots open.",
                suggested_activity=f"Join the gathering at {v.location_name or 'a nearby spot'}.",
                distance_km=round(dist, 2),
                preview={
                    "title": v.title,
                    "description": v.description,
                    "category": v.category,
                    "when": v.scheduled_at.isoformat() if v.scheduled_at else None,
                    "location_name": v.location_name,
                },
            )
        )
    out.sort(key=lambda r: r.score, reverse=True)
    return out[:8]
