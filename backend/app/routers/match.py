import json
from typing import Any

from anthropic import AsyncAnthropic
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_db
from app.models import Gloed
from app.schemas.match import (
    MatchOut,
    MatchRequest,
    MatchResponse,
    SuggestedVonk,
    SuggestVonkRequest,
)
from app.services.ai_conversation import AIUnavailable
from app.services.matching import match_for_gloed
from app.services.prompts import SUGGEST_VONK_SYSTEM_PROMPT

router = APIRouter()


SUGGEST_VONK_TOOL: dict[str, Any] = {
    "name": "suggest_vonk",
    "description": "Submit a single concrete micro-gathering for the given gloeds.",
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


@router.post("", response_model=MatchResponse)
async def match(body: MatchRequest, db: AsyncSession = Depends(get_db)) -> MatchResponse:
    results = await match_for_gloed(db, body.gloed_id)
    return MatchResponse(
        matches=[
            MatchOut(
                type=r.type,
                id=r.id,
                score=r.score,
                reason=r.reason,
                suggested_activity=r.suggested_activity,
                distance_km=r.distance_km,
                preview=r.preview,
            )
            for r in results
        ]
    )


@router.post("/suggest-vonk", response_model=SuggestedVonk)
async def suggest_vonk(
    body: SuggestVonkRequest,
    db: AsyncSession = Depends(get_db),
) -> SuggestedVonk:
    if not body.gloed_ids:
        raise HTTPException(400, "Provide at least one gloed_id")

    gloeds: list[Gloed] = []
    for gid in body.gloed_ids[:5]:
        g = await db.get(Gloed, gid)
        if g is not None:
            gloeds.append(g)
    if not gloeds:
        raise HTTPException(404, "No gloeds found for those IDs")

    if not settings.anthropic_api_key:
        raise AIUnavailable("Set ANTHROPIC_API_KEY in .env to enable vonk suggestions.")

    payload = [
        {
            "description": g.ai_parsed or g.raw_input,
            "category": g.category,
            "energy_level": g.energy_level,
            "group_size_pref": g.group_size_pref,
            "time_preference": g.time_preference,
        }
        for g in gloeds
    ]

    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    response = await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=600,
        system=SUGGEST_VONK_SYSTEM_PROMPT,
        tools=[SUGGEST_VONK_TOOL],
        tool_choice={"type": "tool", "name": "suggest_vonk"},
        messages=[
            {
                "role": "user",
                "content": "Design a single vonk that works for all of these:\n" + json.dumps(payload, indent=2),
            }
        ],
    )

    tool_block = next(
        (b for b in response.content if getattr(b, "type", None) == "tool_use"), None
    )
    if tool_block is None:
        raise HTTPException(502, "AI did not return a vonk suggestion")
    return SuggestedVonk(**tool_block.input)

