from typing import Optional

from pydantic import BaseModel

from app.schemas.gloed import AutoSubscribedVonk, GloedOut, Location


class ChannelIncoming(BaseModel):
    """Unified payload accepted from WhatsApp / voice / wijkconnector bots."""

    channel: str
    phone: str
    user_name: Optional[str] = None
    message: str
    session_id: str
    location: Optional[Location] = None


class ChannelResponse(BaseModel):
    session_id: str
    assistant_message: str
    done: bool
    gloed: Optional[GloedOut] = None
    auto_subscribed: Optional[AutoSubscribedVonk] = None
