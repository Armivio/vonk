from typing import Optional

from pydantic import BaseModel, Field

INTERESTS = ["social", "active", "creative", "learning", "quiet", "food"]
AVAILABILITY = ["morning", "afternoon", "evening"]


class WijkconnectorRegistration(BaseModel):
    first_name: str = Field(..., max_length=100)
    last_name: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    neighborhood: Optional[str] = Field(default=None, max_length=100)
    city: str = Field(default="Rotterdam", max_length=100)
    language: str = Field(default="nl", pattern=r"^(nl|en|other)$")
    interests: list[str] = Field(default_factory=list)
    availability: list[str] = Field(default_factory=list)
    notes: Optional[str] = Field(default=None, max_length=500)
    consent_obtained: bool


class WijkconnectorRegistrationOut(BaseModel):
    user_id: str
    name: str
    last_name: Optional[str] = None
    neighborhood: Optional[str] = None
    language: str
    interests: list[str]
