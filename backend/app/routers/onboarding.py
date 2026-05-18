from sqlalchemy import func, select
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import current_user
from app.models import User, VonkParticipant
from app.schemas.gloed import (
    AutoSubscribeAlternative,
    AutoSubscribedVonk,
    GloedOut,
)
from app.schemas.onboarding import OnboardingChatRequest, OnboardingChatResponse
from app.services.ai_onboarding import handle_onboarding_turn

router = APIRouter()


@router.post("/chat", response_model=OnboardingChatResponse)
async def onboarding_chat(
    body: OnboardingChatRequest,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> OnboardingChatResponse:
    location = (body.location.lat, body.location.lon) if body.location else None
    result = await handle_onboarding_turn(
        db,
        user=user,
        session_id=body.session_id,
        message=body.message,
        location=location,
    )

    auto_payload = None
    alts: list[AutoSubscribeAlternative] = []
    if result.auto_subscribe is not None:
        v = result.auto_subscribe.vonk
        count_res = await db.execute(
            select(func.count(VonkParticipant.user_id)).where(
                VonkParticipant.vonk_id == v.id
            )
        )
        count = int(count_res.scalar() or 0)
        spots_left = max(0, (v.max_participants or 6) - count)
        auto_payload = AutoSubscribedVonk(
            vonk_id=v.id,
            title=v.title,
            location_name=v.location_name,
            scheduled_at=v.scheduled_at,
            spots_left=spots_left,
            action=result.auto_subscribe.action,
        )
        alts = [
            AutoSubscribeAlternative(
                vonk_id=a.id,
                title=a.title,
                location_name=a.location_name,
                scheduled_at=a.scheduled_at,
            )
            for a in result.auto_subscribe.alternatives
        ]

    return OnboardingChatResponse(
        session_id=result.session_id,
        assistant_message=result.assistant_message,
        done=result.done,
        preferences=result.preferences,
        gloed=GloedOut.model_validate(result.gloed) if result.gloed else None,
        auto_subscribed=auto_payload,
        alternatives=alts,
    )


@router.delete("/preferences", status_code=204)
async def reset_preferences(
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    user.preferences = None
    await db.commit()
