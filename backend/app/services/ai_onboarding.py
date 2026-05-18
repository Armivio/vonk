"""Conversational onboarding to capture durable user preferences.

One-time chat per user. Mirrors `ai_conversation.py` but stores the result
on `users.preferences` instead of creating a Gloed. Session state lives in
Redis (`vonk:onb:{session_id}`) with a 30-min TTL.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from typing import Any, Optional

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import User
from app.redis_client import get_redis
from app.services.ai_conversation import AIUnavailable
from app.services.prompts import ONBOARDING_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_REDIS_KEY = "vonk:onb:{session_id}"
_REDIS_TTL_SECONDS = 30 * 60

SUBMIT_PREFERENCES_TOOL: dict[str, Any] = {
    "name": "submit_preferences",
    "description": (
        "Call this once you have enough signal to capture the user's durable preferences. "
        "These are stored on the user record and used to personalise future suggestions."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "interests",
            "social_style",
            "energy_baseline",
            "typical_when",
            "comfort_radius_km",
            "language",
        ],
        "properties": {
            "interests": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["social", "active", "creative", "learning", "quiet", "food"],
                },
                "minItems": 1,
                "description": "1-4 categories that resonate most with the user.",
            },
            "social_style": {
                "type": "string",
                "enum": ["one_on_one", "small_groups", "any_size"],
            },
            "energy_baseline": {
                "type": "string",
                "enum": ["low", "balanced", "high"],
            },
            "typical_when": {
                "type": "string",
                "enum": ["weekday_evenings", "weekends", "spontaneous"],
            },
            "comfort_radius_km": {
                "type": "integer",
                "enum": [2, 5, 12],
                "description": "How far across the city they'll go: 2 (their neighborhood), 5 (nearby), 12 (whole city).",
            },
            "language": {
                "type": "string",
                "enum": ["en", "nl"],
            },
            "notes": {
                "type": "string",
                "description": "Short freeform vibe note (max 30 words). Captures small things that wouldn't fit the slots.",
            },
        },
    },
}


@dataclass
class OnboardingTurnResult:
    session_id: str
    assistant_message: str
    done: bool
    preferences: Optional[dict[str, Any]] = None


async def handle_onboarding_turn(
    db: AsyncSession,
    *,
    user: User,
    session_id: Optional[str],
    message: str,
) -> OnboardingTurnResult:
    redis = get_redis()
    session_id = session_id or str(uuid.uuid4())
    key = _REDIS_KEY.format(session_id=session_id)

    raw = await redis.get(key)
    history: list[dict[str, Any]] = json.loads(raw) if raw else []
    history.append({"role": "user", "content": message})

    response = await _call_claude(history)

    assistant_text = ""
    tool_use_block: Optional[dict[str, Any]] = None
    for block in response.content:
        block_type = getattr(block, "type", None)
        if block_type == "text":
            assistant_text += block.text
        elif block_type == "tool_use" and block.name == "submit_preferences":
            tool_use_block = {
                "id": block.id,
                "name": block.name,
                "input": block.input,
            }

    if tool_use_block is None:
        history.append(
            {
                "role": "assistant",
                "content": [{"type": "text", "text": assistant_text}],
            }
        )
        await redis.setex(key, _REDIS_TTL_SECONDS, json.dumps(history))
        return OnboardingTurnResult(
            session_id=session_id,
            assistant_message=assistant_text or "Tell me a bit more?",
            done=False,
        )

    prefs = dict(tool_use_block["input"])
    user.preferences = prefs
    await db.commit()
    await db.refresh(user)

    await redis.delete(key)

    closing = assistant_text or "Got it — let's find your first spark. 🔥"
    return OnboardingTurnResult(
        session_id=session_id,
        assistant_message=closing,
        done=True,
        preferences=prefs,
    )


async def _call_claude(history: list[dict[str, Any]]):
    if not settings.anthropic_api_key:
        raise AIUnavailable(
            "ANTHROPIC_API_KEY is not set. Add it to .env to enable the onboarding assistant."
        )
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=600,
        system=ONBOARDING_SYSTEM_PROMPT,
        tools=[SUBMIT_PREFERENCES_TOOL],
        messages=history,
    )
