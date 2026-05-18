from typing import Any, Optional

from pydantic import BaseModel

from app.schemas.gloed import (
    AutoSubscribeAlternative,
    AutoSubscribedVonk,
    GloedOut,
    Location,
)


class OnboardingChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    location: Optional[Location] = None


class OnboardingChatResponse(BaseModel):
    session_id: str
    assistant_message: str
    done: bool = False
    preferences: Optional[dict[str, Any]] = None
    gloed: Optional[GloedOut] = None
    auto_subscribed: Optional[AutoSubscribedVonk] = None
    alternatives: list[AutoSubscribeAlternative] = []
