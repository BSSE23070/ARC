"""Application factory.

Run with:  uvicorn --factory arc.main:create_app
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from redis.asyncio import Redis

from arc.core import health
from arc.core.config import Settings, get_settings
from arc.core.db import create_engine, create_session_factory
from arc.core.email import EmailSender, build_email_sender
from arc.core.errors import install_error_handlers
from arc.modules.identity.liveness import LivenessProvider, build_liveness_provider
from arc.modules.identity.passwords import BreachChecker, build_breach_checker
from arc.modules.identity.router import router as identity_router

API_PREFIX = "/api/v1"


def create_app(
    settings: Settings | None = None,
    *,
    email_sender: EmailSender | None = None,
    breach_checker: BreachChecker | None = None,
    liveness_provider: LivenessProvider | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")

    engine = create_engine(settings.database_url)
    redis: Redis = Redis.from_url(settings.redis_url, decode_responses=True)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        yield
        await redis.aclose()
        await engine.dispose()

    app = FastAPI(
        title="Arc API",
        version="0.1.0",
        lifespan=lifespan,
        docs_url="/api/docs" if settings.env != "prod" else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.env != "prod" else None,
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)
    app.state.redis = redis
    app.state.email_sender = email_sender or build_email_sender(settings)
    app.state.breach_checker = breach_checker or build_breach_checker(settings)

    app.state.liveness_provider = liveness_provider or build_liveness_provider(settings)

    install_error_handlers(app)
    app.include_router(health.router)
    app.include_router(identity_router, prefix=API_PREFIX)
    return app
