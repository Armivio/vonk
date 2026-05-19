import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, computed_field


class AnonymousLoginRequest(BaseModel):
    client_id: str
    name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None


class GuestLoginRequest(BaseModel):
    name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    user_id: Optional[uuid.UUID] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None


class SigninRequest(BaseModel):
    email: str


class OtpSendRequest(BaseModel):
    identifier: str  # email or phone


class OtpSendResponse(BaseModel):
    sent: bool
    method: str  # "email" or "sms"
    dev_code: Optional[str] = None  # populated only when delivery isn't configured


class OtpVerifyRequest(BaseModel):
    identifier: str
    code: str
    # Optional profile fields used when a new account is created on verify.
    name: Optional[str] = None
    last_name: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    last_name: Optional[str] = None
    channel: str
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    age_group: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    preferences: Optional[dict[str, Any]] = None
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_preferences(self) -> bool:
        """True once the user has completed the vibe-checker (onboarding) chat.

        Frontend uses this to route post-auth: first-timers → /find,
        returning users → /discover.
        """
        return bool(self.preferences)
