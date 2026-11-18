"""Liveness and readiness probes for the load balancer and uptime checks."""

import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from arc.core.deps import DbDep, RedisDep

log = logging.getLogger("arc.health")
router = APIRouter(tags=["health"])


@router.get("/healthz")
async def healthz() -> dict[str, str]:
    """The process is up."""
    return {"status": "ok"}


@router.get("/readyz")
async def readyz(session: DbDep, redis: RedisDep) -> JSONResponse:
    """The process can reach PostgreSQL and Redis."""
    checks: dict[str, str] = {}
    try:
        await session.execute(text("select 1"))
        checks["database"] = "ok"
    except Exception:
        log.exception("readiness: database unreachable")
        checks["database"] = "down"
    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception:
        log.exception("readiness: redis unreachable")
        checks["redis"] = "down"
    ready = all(value == "ok" for value in checks.values())
    return JSONResponse(
        {"status": "ok" if ready else "degraded", **checks}, status_code=200 if ready else 503
    )
