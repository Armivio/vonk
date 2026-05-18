"""Conversational gloed discovery.

Drives one turn at a time. Session state lives in Redis with a 30-min TTL,
keyed by `vonk:conv:{session_id}`. On completion, the full message history
plus the resulting gloed are written to the `ai_conversations` table.

The Claude model is called with a `submit_gloed` tool. When the model has
enough signal to produce a structured gloed it emits a `tool_use` block;
otherwise it emits text (a follow-up question) and we keep going.
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
from app.models import AIConversation, Gloed
from app.redis_client import get_redis
from app.services.prompts import CONVERSATION_SYSTEM_PROMPT

logger = logging.getLogger(__name__)

_REDIS_KEY = "vonk:conv:{session_id}"
_REDIS_TTL_SECONDS = 30 * 60

SUBMIT_GLOED_TOOL: dict[str, Any] = {
    "name": "submit_gloed",
    "description": (
        "Call this only when you have enough signal to produce a structured gloed "
        "for the person. Provide a short user-facing description and your private "
        "perception of the deeper need in `deeper_need`."
    ),
    "input_schema": {
        "type": "object",
        "required": [
            "description",
            "category",
            "energy_level",
            "group_size_pref",
            "time_preference",
            "deeper_need",
        ],
        "properties": {
            "description": {
                "type": "string",
                "description": "Short user-facing summary of what they're looking for.",
            },
            "category": {
                "type": "string",
                "enum": ["social", "active", "creative", "learning", "quiet", "food"],
            },
            "energy_level": {
                "type": "string",
                "enum": ["low", "medium", "high"],
            },
            "group_size_pref": {
                "type": "string",
                "enum": ["one_on_one", "small", "any"],
            },
            "time_preference": {
                "type": "string",
                "enum": ["now", "today", "this_week"],
            },
            "deeper_need": {
                "type": "string",
                "description": (
                    "PRIVATE. Your perception of what they actually need beyond what they said. "
                    "Used to refine matching. Never shown to other users."
                ),
            },
        },
    },
}


@dataclass
class GloedDraft:
    description: str
    category: str
    energy_level: str
    group_size_pref: str
    time_preference: str
    deeper_need: str


@dataclass
class TurnResult:
    session_id: str
    assistant_message: str
    done: bool
    gloed: Optional[Gloed] = None


async def handle_turn(
    db: AsyncSession,
    *,
    user_id: Optional[uuid.UUID],
    channel: str,
    session_id: Optional[str],
    message: str,
    location: Optional[tuple[float, float]] = None,
) -> TurnResult:
    """Run one conversational turn. Returns a TurnResult.

    If `session_id` is None a fresh session is started.
    On completion the gloed is created in the DB and a non-None `gloed` is returned.
    """
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
        elif block_type == "tool_use" and block.name == "submit_gloed":
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
        return TurnResult(
            session_id=session_id,
            assistant_message=assistant_text or "Tell me a bit more?",
            done=False,
        )

    draft = GloedDraft(**tool_use_block["input"])
    history.append(
        {
            "role": "assistant",
            "content": [
                {"type": "text", "text": assistant_text},
                {
                    "type": "tool_use",
                    "id": tool_use_block["id"],
                    "name": tool_use_block["name"],
                    "input": tool_use_block["input"],
                },
            ],
        }
    )

    raw_input_text = _extract_first_user_message(history) or message

    lat, lon = (location or (None, None))
    gloed = Gloed(
        user_id=user_id,
        raw_input=raw_input_text,
        ai_parsed=draft.description,
        category=draft.category,
        energy_level=draft.energy_level,
        group_size_pref=draft.group_size_pref,
        time_preference=draft.time_preference,
        latitude=lat,
        longitude=lon,
        radius_km=5.0,
        active=True,
        expires_at=_expiry_for(draft.time_preference),
    )
    db.add(gloed)
    await db.flush()

    conversation = AIConversation(
        user_id=user_id,
        channel=channel,
        messages=history,
        resulting_gloed_id=gloed.id,
    )
    db.add(conversation)
    await db.commit()
    await db.refresh(gloed)

    await redis.delete(key)

    closing = assistant_text or "Got it — let's find you something."
    return TurnResult(
        session_id=session_id,
        assistant_message=closing,
        done=True,
        gloed=gloed,
    )


class AIUnavailable(RuntimeError):
    """Raised when the AI provider can't be reached or isn't configured."""


async def _call_claude(history: list[dict[str, Any]]):
    if not settings.anthropic_api_key:
        raise AIUnavailable(
            "ANTHROPIC_API_KEY is not set. Add it to .env to enable the connection assistant."
        )
    client = AsyncAnthropic(api_key=settings.anthropic_api_key)
    return await client.messages.create(
        model=settings.anthropic_model,
        max_tokens=600,
        system=CONVERSATION_SYSTEM_PROMPT,
        tools=[SUBMIT_GLOED_TOOL],
        messages=history,
    )


def _extract_first_user_message(history: list[dict[str, Any]]) -> Optional[str]:
    for entry in history:
        if entry.get("role") == "user":
            content = entry.get("content")
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        return block.get("text")
    return None


def _expiry_for(time_preference: str) -> datetime:
    now = datetime.now(timezone.utc)
    if time_preference == "now":
        return now + timedelta(hours=3)
    if time_preference == "today":
        return now + timedelta(hours=12)
    return now + timedelta(days=4)
