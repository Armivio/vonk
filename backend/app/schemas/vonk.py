import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class VonkCreate(BaseModel):
    title: str = Field(..., max_length=200)
    description: Optional[str] = None
    category: Optional[str] = None
    location_name: Optional[str] = None
    latitude: float
    longitude: float
    scheduled_at: datetime
    max_participants: int = Field(default=6, ge=2, le=20)


class VonkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    creator_id: Optional[uuid.UUID] = None
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    location_name: Optional[str] = None
    latitude: float
    longitude: float
    scheduled_at: datetime
    max_participants: int
    status: str
    participants_count: int = 0
    distance_km: Optional[float] = None


class VonkParticipantOut(BaseModel):
    user_id: uuid.UUID
    name: str
    initials: str
    age_group: Optional[str] = None
    joined_at: datetime


class VonkDetailOut(VonkOut):
    participants: list[VonkParticipantOut] = []
