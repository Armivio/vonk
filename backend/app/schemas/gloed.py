import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class Location(BaseModel):
    lat: float
    lon: float


class GloedDiscoverRequest(BaseModel):
    session_id: Optional[str] = None
    message: str
    location: Optional[Location] = None


class GloedOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: Optional[uuid.UUID] = None
    raw_input: str
    ai_parsed: Optional[str] = None
    category: Optional[str] = None
    energy_level: Optional[str] = None
    group_size_pref: Optional[str] = None
    time_preference: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: float
    active: bool
    created_at: datetime


class AutoSubscribedVonk(BaseModel):
    vonk_id: uuid.UUID
    title: str
    location_name: Optional[str] = None
    scheduled_at: datetime
    spots_left: int
    action: Literal["joined", "created_and_joined"]


class AutoSubscribeAlternative(BaseModel):
    vonk_id: uuid.UUID
    title: str
    location_name: Optional[str] = None
    scheduled_at: datetime


class GloedDiscoverResponse(BaseModel):
    session_id: str
    assistant_message: str
    done: bool = False
    gloed: Optional[GloedOut] = None
    auto_subscribed: Optional[AutoSubscribedVonk] = None
    alternatives: list[AutoSubscribeAlternative] = Field(default_factory=list)


class GloedCreateRequest(BaseModel):
    raw_input: str
    category: str
    energy_level: str
    group_size_pref: str
    time_preference: str
    ai_parsed: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius_km: float = Field(default=5.0, ge=0.5, le=50.0)
