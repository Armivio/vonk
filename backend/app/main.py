from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.services.ai_conversation import AIUnavailable

app = FastAPI(title="Vonk API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AIUnavailable)
async def ai_unavailable_handler(_: Request, exc: AIUnavailable) -> JSONResponse:
    return JSONResponse(status_code=503, content={"detail": str(exc), "ai_unavailable": True})


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


def _include_routers() -> None:
    from app.routers import (
        auth,
        channels,
        dashboard,
        gloed,
        match,
        onboarding,
        vonk,
        wijkconnector,
    )

    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(onboarding.router, prefix="/api/onboarding", tags=["onboarding"])
    app.include_router(gloed.router, prefix="/api/gloed", tags=["gloed"])
    app.include_router(vonk.router, prefix="/api/vonk", tags=["vonk"])
    app.include_router(match.router, prefix="/api/match", tags=["match"])
    app.include_router(channels.router, prefix="/api/channels", tags=["channels"])
    app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
    app.include_router(wijkconnector.router, prefix="/api/wijkconnector", tags=["wijkconnector"])


_include_routers()
