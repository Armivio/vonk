from typing import Any, Optional

from pydantic import BaseModel


class OnboardingChatRequest(BaseModel):
    session_id: Optional[str] = None
    message: str


class OnboardingChatResponse(BaseModel):
    session_id: str
    assistant_message: str
    done: bool = False
    preferences: Optional[dict[str, Any]] = None
