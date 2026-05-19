"""One-shot onboarding chat: captures durable user preferences AND produces
the user's first gloed + auto-subscribe in a single conversation.

Two tools available to the LLM:
  - submit_preferences: stored on users.preferences, conversation continues
  - submit_gloed:       creates the Gloed row, triggers auto-subscribe, ends session

Session state lives in Redis (`vonk:onb:{session_id}`) with a 30-min TTL.
"""

from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from anthropic import AsyncAnthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import AIConversation, Gloed, User
from app.redis_client import get_redis
from app.services.ai_conversation import (
    AIUnavailable,
    SUBMIT_GLOED_TOOL,
    _compose_closing_message,
)
from app.services.auto_subscribe import AutoSubscribeResult, auto_subscribe_from_gloed
from app.services.prompts import ONBOARDING_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_REDIS_KEY = "vonk:onb:{session_id}"
_REDIS_TTL_SECONDS = 30 * 60
_MAX_INNER_TURNS = 4  # safety cap on tool_use chaining within one user turn

SUBMIT_PREFERENCES_TOOL: dict[str, Any] = {
    "name": "submit_preferences",
    "description": (
        "Save the user's durable preferences and continue the conversation. "
        "After this returns, ask the Phase-2 bridge question."
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
            },
            "language": {
                "type": "string",
                "enum": ["en", "nl"],
            },
            "notes": {
                "type": "string",
                "description": "Short freeform vibe note (max 30 words).",
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
    gloed: Optional[Gloed] = None
    auto_subscribe: Optional[AutoSubscribeResult] = None


async def handle_onboarding_turn(
    db: AsyncSession,
    *,
    user: User,
    session_id: Optional[str],
    message: str,
    location: Optional[tuple[float, float]] = None,
) -> OnboardingTurnResult:
    redis = get_redis()
    session_id = session_id or str(uuid.uuid4())
    key = _REDIS_KEY.format(session_id=session_id)

    raw = await redis.get(key)
    history: list[dict[str, Any]] = json.loads(raw) if raw else []
    history.append({"role": "user", "content": message})

    saved_preferences: Optional[dict[str, Any]] = None

    # Inner loop lets the LLM chain: submit_preferences → bridge question all in
    # one user turn. We cap iterations so a confused model can't burn money.
    for _ in range(_MAX_INNER_TURNS):
        response = await _call_claude(history)

        assistant_text = ""
        tool_use_block: Optional[Any] = None
        for block in response.content:
            block_type = getattr(block, "type", None)
            if block_type == "text":
                assistant_text += block.text
            elif block_type == "tool_use":
                tool_use_block = block

        # No tool call → plain text reply. Save history, return follow-up.
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
                assistant_message=assistant_text or "Got it. What else feels right for tonight?",
                done=False,
                preferences=saved_preferences,
            )

        # Persist the assistant turn (text + tool_use) in history before reacting.
        history.append(
            {
                "role": "assistant",
                "content": [
                    *([{"type": "text", "text": assistant_text}] if assistant_text else []),
                    {
                        "type": "tool_use",
                        "id": tool_use_block.id,
                        "name": tool_use_block.name,
                        "input": tool_use_block.input,
                    },
                ],
            }
        )

        if tool_use_block.name == "submit_preferences":
            saved_preferences = dict(tool_use_block.input)
            user.preferences = saved_preferences
            await db.commit()
            await db.refresh(user)

            # Inject tool_result so the model can produce its next turn (the bridge question).
            history.append(
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use_block.id,
                            "content": "Preferences saved. Now ask the Phase-2 bridge question.",
                        }
                    ],
                }
            )
            # Loop again — Claude will respond with the bridge question (plain text).
            continue

        if tool_use_block.name == "submit_gloed":
            return await _finalize_with_gloed(
                db,
                user=user,
                session_id=session_id,
                redis_key=key,
                history=history,
                tool_input=dict(tool_use_block.input),
                assistant_text=assistant_text,
                location=location,
                saved_preferences=saved_preferences,
            )

        # Unknown tool — break and return the text we have.
        await redis.setex(key, _REDIS_TTL_SECONDS, json.dumps(history))
        return OnboardingTurnResult(
            session_id=session_id,
            assistant_message=assistant_text or "Got it. What else feels right for tonight?",
            done=False,
            preferences=saved_preferences,
        )

    # Hit the iteration cap. Save and return a soft fallback.
    await redis.setex(key, _REDIS_TTL_SECONDS, json.dumps(history))
    return OnboardingTurnResult(
        session_id=session_id,
        assistant_message="Got it. What else feels right for tonight?",
        done=False,
        preferences=saved_preferences,
    )


async def _finalize_with_gloed(
    db: AsyncSession,
    *,
    user: User,
    session_id: str,
    redis_key: str,
    history: list[dict[str, Any]],
    tool_input: dict[str, Any],
    assistant_text: str,
    location: Optional[tuple[float, float]],
    saved_preferences: Optional[dict[str, Any]],
) -> OnboardingTurnResult:
    raw_input_text = _first_user_text(history) or "Onboarding chat"
    lat, lon = (location or (None, None))
    if (lat is None or lon is None) and user.latitude and user.longitude:
        lat, lon = user.latitude, user.longitude

    gloed = Gloed(
        user_id=user.id,
        raw_input=raw_input_text,
        ai_parsed=tool_input.get("description"),
        category=tool_input.get("category"),
        energy_level=tool_input.get("energy_level"),
        group_size_pref=tool_input.get("group_size_pref"),
        time_preference=tool_input.get("time_preference"),
        latitude=lat,
        longitude=lon,
        radius_km=5.0,
        active=True,
        expires_at=_expiry_for(tool_input.get("time_preference")),
    )
    db.add(gloed)
    await db.flush()

    conversation = AIConversation(
        user_id=user.id,
        channel="web",
        messages=history,
        resulting_gloed_id=gloed.id,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(gloed)

    auto: Optional[AutoSubscribeResult] = None
    try:
        auto = await auto_subscribe_from_gloed(db, gloed=gloed, user=user)
    except Exception:
        logger.exception("auto_subscribe_from_gloed failed in onboarding; continuing")

    redis = get_redis()
    await redis.delete(redis_key)

    closing = _compose_closing_message(assistant_text, auto)
    return OnboardingTurnResult(
        session_id=session_id,
        assistant_message=closing,
        done=True,
        preferences=saved_preferences or user.preferences,
        gloed=gloed,
        auto_subscribe=auto,
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
        tools=[SUBMIT_PREFERENCES_TOOL, SUBMIT_GLOED_TOOL],
        messages=history,
    )


def _first_user_text(history: list[dict[str, Any]]) -> Optional[str]:
    for entry in history:
        if entry.get("role") != "user":
            continue
        content = entry.get("content")
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    return block.get("text")
    return None


def _expiry_for(time_preference: Optional[str]) -> datetime:
    now = datetime.now(timezone.utc)
    if time_preference == "now":
        return now + timedelta(hours=3)
    if time_preference == "today":
        return now + timedelta(hours=12)
    return now + timedelta(days=4)
