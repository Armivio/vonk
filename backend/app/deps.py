import uuid
from typing import Optional

from fastapi import Depends, Header, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User


async def optional_user(
    db: AsyncSession = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> Optional[User]:
    if not x_user_id:
        return None
    try:
        uid = uuid.UUID(x_user_id)
    except ValueError:
        return None
    return await db.get(User, uid)


async def current_user(
    db: AsyncSession = Depends(get_db),
    x_user_id: Optional[str] = Header(default=None, alias="X-User-Id"),
) -> User:
    if not x_user_id:
        raise HTTPException(status_code=401, detail="Missing X-User-Id header")
    try:
        uid = uuid.UUID(x_user_id)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail="Invalid X-User-Id") from exc
    user = await db.get(User, uid)
    if user is None:
        raise HTTPException(status_code=401, detail="Unknown user")
    return user
