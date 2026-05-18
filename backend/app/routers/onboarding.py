from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_user
from app.models import User
from app.schemas.onboarding import OnboardingChatRequest, OnboardingChatResponse
from app.services.ai_onboarding import handle_onboarding_turn

router = APIRouter()


@router.post("/chat", response_model=OnboardingChatResponse)
async def onboarding_chat(
    body: OnboardingChatRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> OnboardingChatResponse:
    result = await handle_onboarding_turn(
        db,
        user=user,
        session_id=body.session_id,
        message=body.message,
    )
    return OnboardingChatResponse(
        session_id=result.session_id,
        assistant_message=result.assistant_message,
        done=result.done,
        preferences=result.preferences,
    )


@router.delete("/preferences", status_code=204)
async def reset_preferences(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    user.preferences = None
    await db.commit()
