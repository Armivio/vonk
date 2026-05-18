from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.schemas.auth import AnonymousLoginRequest, UserOut
from app.services.users import find_or_create_anonymous

router = APIRouter()


@router.post("/anonymous", response_model=UserOut)
async def anonymous_login(
    body: AnonymousLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> UserOut:
    user = await find_or_create_anonymous(
        db,
        client_id=body.client_id,
        name=body.name,
        latitude=body.latitude,
        longitude=body.longitude,
        city=body.city,
    )
    return UserOut.model_validate(user)
