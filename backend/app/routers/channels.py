"""Unified webhook endpoints for non-web channels.

Three thin adapters wrap the same `ai_conversation.handle_turn` service.
Each adapter resolves (or creates) a user from phone + channel and then
delegates entirely. The text that comes back is what the bot speaks or
sends — no channel-specific intelligence lives here.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.channel import ChannelIncoming, ChannelResponse
from app.schemas.gloed import GloedOut
from app.services.ai_conversation import handle_turn
from app.services.users import find_or_create_by_phone

router = APIRouter()


async def _route(
    channel: str, body: ChannelIncoming, db: AsyncSession
) -> ChannelResponse:
    user = await find_or_create_by_phone(
        db,
        phone=body.phone,
        channel=channel,
        name=body.user_name,
        latitude=body.location.lat if body.location else None,
        longitude=body.location.lon if body.location else None,
    )
    location = (body.location.lat, body.location.lon) if body.location else None
    if location is None and user.latitude and user.longitude:
        location = (user.latitude, user.longitude)

    result = await handle_turn(
        db,
        user_id=user.id,
        channel=channel,
        session_id=body.session_id,
        message=body.message,
        location=location,
    )
    return ChannelResponse(
        session_id=result.session_id,
        assistant_message=result.assistant_message,
        done=result.done,
        gloed=GloedOut.model_validate(result.gloed) if result.gloed else None,
    )


@router.post("/whatsapp/incoming", response_model=ChannelResponse)
async def whatsapp_incoming(
    body: ChannelIncoming, db: AsyncSession = Depends(get_db)
) -> ChannelResponse:
    return await _route("whatsapp", body, db)


@router.post("/voice/incoming", response_model=ChannelResponse)
async def voice_incoming(
    body: ChannelIncoming, db: AsyncSession = Depends(get_db)
) -> ChannelResponse:
    return await _route("voice", body, db)


@router.post("/wijkconnector", response_model=ChannelResponse)
async def wijkconnector_incoming(
    body: ChannelIncoming, db: AsyncSession = Depends(get_db)
) -> ChannelResponse:
    return await _route("wijkconnector", body, db)
