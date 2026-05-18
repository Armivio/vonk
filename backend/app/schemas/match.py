import uuid
from typing import Any, Literal, Optional

from pydantic import BaseModel


class MatchRequest(BaseModel):
    gloed_id: uuid.UUID


class MatchOut(BaseModel):
    type: Literal["gloed", "vonk"]
    id: uuid.UUID
    score: int
    reason: str
    suggested_activity: str
    distance_km: Optional[float] = None
    preview: dict[str, Any]


class MatchResponse(BaseModel):
    matches: list[MatchOut]


class SuggestVonkRequest(BaseModel):
    gloed_ids: list[uuid.UUID]


class SuggestedVonk(BaseModel):
    title: str
    description: str
    category: str
    location_name: str
    when_relative: str
    why_it_works: str
