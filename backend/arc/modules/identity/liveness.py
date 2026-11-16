"""Liveness check (FR-04): proving a real person is holding the phone.

The check itself is done by a *provider* behind the ``LivenessProvider``
interface, so the real one can be plugged in without touching the rest of the
code. This module owns the rules around it: one open attempt at a time, a
time limit, a daily attempt limit, and recording the verdict.

Privacy: the server stores the verdict only. Images and face data go from the
phone to the provider and are never sent to or stored by this API.
"""

import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any, Literal, Protocol

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from arc.core.audit import record_audit
from arc.core.config import Settings
from arc.core.errors import AppError
from arc.core.security import utcnow
from arc.modules.identity.models import LivenessCheck, User

log = logging.getLogger("arc.liveness")

ATTEMPT_WINDOW = timedelta(hours=24)


@dataclass(frozen=True)
class ProviderSession:
    ref: str  # the provider's identifier for this attempt
    client_payload: dict[str, Any]  # what the app needs to run the check


@dataclass(frozen=True)
class Verdict:
    passed: bool
    reason: str | None = None  # short machine-readable code when not passed


class LivenessProvider(Protocol):
    name: str

    async def start(self, user_id: uuid.UUID) -> ProviderSession: ...

    async def verify(self, ref: str, evidence: dict[str, Any]) -> Verdict:
        """Decides the outcome on the server. ``evidence`` comes from the app
        and is untrusted: a real provider must confirm it with its own backend."""
        ...


class StubLivenessProvider:
    """Development stand-in. It does NOT check a face: it passes when the app
    reports ``{"stub_outcome": "pass"}``. Settings refuse it in production."""

    name = "stub"

    async def start(self, user_id: uuid.UUID) -> ProviderSession:
        return ProviderSession(ref=secrets.token_urlsafe(16), client_payload={"mode": "stub"})

    async def verify(self, ref: str, evidence: dict[str, Any]) -> Verdict:
        if evidence.get("stub_outcome") == "pass":
            return Verdict(passed=True)
        return Verdict(passed=False, reason="stub_declined")


def build_liveness_provider(settings: Settings) -> LivenessProvider:
    # Only the stub exists so far; the real provider is added here.
    return StubLivenessProvider()


@dataclass(frozen=True)
class StartedCheck:
    check: LivenessCheck
    client_payload: dict[str, Any]
    attempts_left: int


@dataclass(frozen=True)
class CheckResult:
    status: Literal["passed", "failed"]
    reason: str | None
    attempts_left: int
    user: User


class LivenessService:
    def __init__(self, session: AsyncSession, settings: Settings, provider: LivenessProvider):
        self._db = session
        self._settings = settings
        self._provider = provider

    async def start(self, user: User) -> StartedCheck:
        if user.liveness_verified_at is not None:
            raise AppError(409, "LIVENESS_ALREADY_PASSED", "You've already been verified.")
        # Lock the account row so two requests at once can't both slip under
        # the daily limit.
        await self._db.execute(select(User.id).where(User.id == user.id).with_for_update())
        used, oldest = await self._attempts(user.id)
        limit = self._settings.liveness_max_attempts_per_day
        if used >= limit:
            retry_after = max(1, int((oldest + ATTEMPT_WINDOW - utcnow()).total_seconds()))
            raise AppError(
                429,
                "LIVENESS_ATTEMPTS_EXCEEDED",
                "You've used today's verification attempts. Please try again tomorrow.",
                {"retry_after_s": retry_after},
                headers={"Retry-After": str(retry_after)},
            )

        provider_session = await self._call_provider(self._provider.start(user.id))
        now = utcnow()
        # Only one attempt can be open at a time.
        await self._db.execute(
            update(LivenessCheck)
            .where(LivenessCheck.user_id == user.id, LivenessCheck.status == "pending")
            .values(status="expired", completed_at=now)
        )
        check = LivenessCheck(
            id=uuid.uuid4(),
            user_id=user.id,
            provider=self._provider.name,
            provider_ref=provider_session.ref,
            status="pending",
            expires_at=now + timedelta(seconds=self._settings.liveness_check_ttl_s),
        )
        self._db.add(check)
        record_audit(self._db, "liveness_started", user.id, provider=self._provider.name)
        await self._db.commit()
        return StartedCheck(check, provider_session.client_payload, limit - used - 1)

    async def complete(
        self, user: User, check_id: uuid.UUID, evidence: dict[str, Any]
    ) -> CheckResult:
        check = await self._db.scalar(
            select(LivenessCheck)
            .where(LivenessCheck.id == check_id, LivenessCheck.user_id == user.id)
            .with_for_update()
        )
        if check is None:
            raise AppError(404, "LIVENESS_CHECK_NOT_FOUND", "That verification wasn't found.")
        if check.status == "pending" and check.expires_at <= utcnow():
            check.status = "expired"
            check.completed_at = utcnow()
            await self._db.commit()
        if check.status == "expired":
            raise AppError(410, "LIVENESS_CHECK_EXPIRED", "That took too long. Please start again.")
        if check.status != "pending":
            raise AppError(409, "LIVENESS_CHECK_FINISHED", "That verification is already finished.")

        verdict = await self._call_provider(self._provider.verify(check.provider_ref, evidence))
        now = utcnow()
        check.completed_at = now
        outcome: Literal["passed", "failed"] = "passed" if verdict.passed else "failed"
        check.status = outcome
        if verdict.passed:
            user.liveness_verified_at = now
            record_audit(self._db, "liveness_passed", user.id, provider=check.provider)
        else:
            check.failure_reason = (verdict.reason or "declined")[:32]
            record_audit(
                self._db,
                "liveness_failed",
                user.id,
                provider=check.provider,
                reason=check.failure_reason,
            )
        await self._db.commit()
        used, _ = await self._attempts(user.id)
        return CheckResult(
            status=outcome,
            reason=check.failure_reason,
            attempts_left=max(0, self._settings.liveness_max_attempts_per_day - used),
            user=user,
        )

    async def _attempts(self, user_id: uuid.UUID) -> tuple[int, Any]:
        """How many attempts were started in the last 24 hours, and the oldest one's time."""
        row = (
            await self._db.execute(
                select(func.count(), func.min(LivenessCheck.created_at)).where(
                    LivenessCheck.user_id == user_id,
                    LivenessCheck.created_at > utcnow() - ATTEMPT_WINDOW,
                )
            )
        ).one()
        return row[0], row[1]

    async def _call_provider(self, call: Any) -> Any:
        try:
            return await call
        except Exception as exc:
            # The attempt stays open, so the user can retry once the provider is back.
            log.exception("liveness provider %s failed", self._provider.name)
            await self._db.rollback()
            raise AppError(
                503,
                "LIVENESS_UNAVAILABLE",
                "Verification isn't available right now. Please try again shortly.",
            ) from exc
