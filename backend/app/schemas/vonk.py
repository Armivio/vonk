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
    max_participants: int = Field(default=6, ge=2)


class VonkUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = None
    location_name: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    scheduled_at: Optional[datetime] = None
    max_participants: Optional[int] = Field(default=None, ge=2)


class VonkOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    creator_id: Optional[uuid.UUID] = None
    creator_name: Optional[str] = None
    creator_last_name: Optional[str] = None
    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    location_name: Optional[str] = None
    latitude: float
    longitude: float
    scheduled_at: datetime
    scheduled_at_human: Optional[str] = None
    max_participants: int
    status: str
    participants_count: int = 0
    is_full: bool = False
    joined: bool = False
    distance_km: Optional[float] = None


class VonkParticipantOut(BaseModel):
    user_id: uuid.UUID
    name: str
    last_name: Optional[str] = None
    initials: str
    age_group: Optional[str] = None
    joined_at: datetime


class VonkDetailOut(VonkOut):
    participants: list[VonkParticipantOut] = []


class VonkFeedbackCreate(BaseModel):
    rating: int = Field(..., ge=1, le=3)
    comment: Optional[str] = Field(default=None, max_length=500)
    would_start_vuur: bool = False


class VonkFeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    vonk_id: uuid.UUID
    user_id: uuid.UUID
    rating: int
    comment: Optional[str] = None
    would_start_vuur: bool
    created_at: datetime
