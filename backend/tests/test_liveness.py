"""Liveness check: attempts, limits, the verdict and the gate it puts on features."""

import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from pydantic import ValidationError
from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from arc.core.audit import AuditLog
from arc.core.config import Settings
from arc.core.security import utcnow
from arc.modules.identity.deps import VerifiedDep
from arc.modules.identity.liveness import ProviderSession, StubLivenessProvider, Verdict
from arc.modules.identity.models import LivenessCheck, User
from tests.conftest import MemoryEmailSender, auth, sign_up

CHECKS = "/api/v1/liveness/checks"
PASS = {"evidence": {"stub_outcome": "pass"}}
FAIL = {"evidence": {"stub_outcome": "fail"}}


async def start(client: httpx.AsyncClient, tokens: dict) -> dict:
    r = await client.post(CHECKS, headers=auth(tokens))
    assert r.status_code == 201, r.text
    return r.json()


async def complete(
    client: httpx.AsyncClient, tokens: dict, check_id: str, body: dict
) -> httpx.Response:
    return await client.post(f"{CHECKS}/{check_id}/complete", json=body, headers=auth(tokens))


async def test_passing_the_check_verifies_the_account(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    assert tokens["user"]["liveness_status"] == "pending"

    check = await start(client, tokens)
    assert check["provider"] == "stub"
    assert 0 < check["expires_in"] <= 300
    assert check["attempts_left"] == 4

    r = await complete(client, tokens, check["check_id"], PASS)
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "passed"
    assert r.json()["reason"] is None
    assert r.json()["user"]["liveness_status"] == "passed"

    me = await client.get("/api/v1/me", headers=auth(tokens))
    assert me.json()["liveness_status"] == "passed"

    actions = (await db.scalars(select(AuditLog.action).order_by(AuditLog.id))).all()
    assert actions[-2:] == ["liveness_started", "liveness_passed"]


async def test_a_failed_check_leaves_the_account_unverified_and_can_be_retried(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    check = await start(client, tokens)

    r = await complete(client, tokens, check["check_id"], FAIL)
    assert r.status_code == 200
    assert r.json()["status"] == "failed"
    assert r.json()["reason"] == "stub_declined"
    assert r.json()["attempts_left"] == 4
    assert r.json()["user"]["liveness_status"] == "pending"

    # A finished attempt can't be replayed with a better answer.
    again = await complete(client, tokens, check["check_id"], PASS)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "LIVENESS_CHECK_FINISHED"

    second = await start(client, tokens)
    assert (await complete(client, tokens, second["check_id"], PASS)).json()["status"] == "passed"
    row = await db.scalar(
        select(LivenessCheck).where(LivenessCheck.id == uuid.UUID(check["check_id"]))
    )
    assert row is not None and row.status == "failed" and row.failure_reason == "stub_declined"


async def test_a_verified_account_cannot_start_another_check(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    tokens = await sign_up(client, mail)
    check = await start(client, tokens)
    await complete(client, tokens, check["check_id"], PASS)

    r = await client.post(CHECKS, headers=auth(tokens))
    assert r.status_code == 409
    assert r.json()["error"]["code"] == "LIVENESS_ALREADY_PASSED"


async def test_daily_attempt_limit(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    for expected_left in (4, 3, 2, 1, 0):
        check = await start(client, tokens)
        assert check["attempts_left"] == expected_left
        await complete(client, tokens, check["check_id"], FAIL)

    r = await client.post(CHECKS, headers=auth(tokens))
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "LIVENESS_ATTEMPTS_EXCEEDED"
    assert int(r.headers["retry-after"]) > 0

    # Attempts older than 24 hours no longer count.
    await db.execute(update(LivenessCheck).values(created_at=utcnow() - timedelta(hours=25)))
    await db.commit()
    assert (await start(client, tokens))["attempts_left"] == 4


async def test_an_expired_check_is_refused(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    check = await start(client, tokens)
    await db.execute(update(LivenessCheck).values(expires_at=utcnow() - timedelta(seconds=1)))
    await db.commit()

    r = await complete(client, tokens, check["check_id"], PASS)
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "LIVENESS_CHECK_EXPIRED"
    me = await client.get("/api/v1/me", headers=auth(tokens))
    assert me.json()["liveness_status"] == "pending"


async def test_starting_again_closes_the_open_attempt(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    tokens = await sign_up(client, mail)
    first = await start(client, tokens)
    second = await start(client, tokens)

    stale = await complete(client, tokens, first["check_id"], PASS)
    assert stale.status_code == 410
    assert (await complete(client, tokens, second["check_id"], PASS)).json()["status"] == "passed"


async def test_one_account_cannot_complete_anothers_check(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    maryam = await sign_up(client, mail)
    bilal = await sign_up(
        client,
        mail,
        email="bilal@itu.edu.pk",
        username="bilal",
        installation_id="installation-cccccccc",
    )
    check = await start(client, maryam)

    r = await complete(client, bilal, check["check_id"], PASS)
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "LIVENESS_CHECK_NOT_FOUND"
    me = await client.get("/api/v1/me", headers=auth(bilal))
    assert me.json()["liveness_status"] == "pending"


async def test_liveness_routes_need_a_signed_in_user_and_valid_input(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    assert (await client.post(CHECKS)).status_code == 401
    tokens = await sign_up(client, mail)
    check = await start(client, tokens)

    assert (await complete(client, tokens, "not-a-uuid", PASS)).status_code == 422
    assert (await complete(client, tokens, check["check_id"], {})).status_code == 422
    huge = {"evidence": {"blob": "x" * 5000}}
    assert (await complete(client, tokens, check["check_id"], huge)).status_code == 422


async def test_provider_outage_is_reported_and_keeps_the_attempt_open(
    app: FastAPI, client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    class FlakyProvider:
        name = "stub"
        down = True

        async def start(self, user_id: uuid.UUID) -> ProviderSession:
            if self.down:
                raise RuntimeError("provider down")
            return ProviderSession("ref", {})

        async def verify(self, ref: str, evidence: dict[str, Any]) -> Verdict:
            if self.down:
                raise RuntimeError("provider down")
            return Verdict(passed=True)

    flaky = FlakyProvider()
    tokens = await sign_up(client, mail)
    app.state.liveness_provider = flaky
    try:
        r = await client.post(CHECKS, headers=auth(tokens))
        assert r.status_code == 503
        assert r.json()["error"]["code"] == "LIVENESS_UNAVAILABLE"

        flaky.down = False
        check = await start(client, tokens)
        assert check["attempts_left"] == 4  # the outage did not use up an attempt

        flaky.down = True
        assert (await complete(client, tokens, check["check_id"], PASS)).status_code == 503
        flaky.down = False
        assert (await complete(client, tokens, check["check_id"], PASS)).json()[
            "status"
        ] == "passed"
    finally:
        app.state.liveness_provider = StubLivenessProvider()


async def test_verified_only_routes_refuse_unverified_accounts(
    app: FastAPI, client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    async def verified_only(ctx: VerifiedDep) -> dict[str, str]:
        return {"username": ctx.user.username}

    app.add_api_route("/_test/verified-only", verified_only, methods=["GET"])
    tokens = await sign_up(client, mail)

    r = await client.get("/_test/verified-only", headers=auth(tokens))
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "LIVENESS_REQUIRED"

    check = await start(client, tokens)
    await complete(client, tokens, check["check_id"], PASS)
    r = await client.get("/_test/verified-only", headers=auth(tokens))
    assert r.json() == {"username": "maryam"}


async def test_deleting_an_account_removes_its_checks(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    await start(client, tokens)
    await db.execute(text("delete from users"))
    await db.commit()
    assert (await db.scalars(select(LivenessCheck))).all() == []
    assert (await db.scalars(select(User))).all() == []


def test_the_stub_provider_is_refused_in_production() -> None:
    with pytest.raises(ValidationError, match="ARC_LIVENESS_PROVIDER"):
        Settings(env="prod", jwt_secret="x" * 40, email_backend="smtp")


def test_api_docs_describe_the_real_error_shape(app: FastAPI) -> None:
    spec = app.openapi()
    schemas = spec["components"]["schemas"]
    assert "HTTPValidationError" not in schemas
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            for code, response in operation["responses"].items():
                if code.startswith(("4", "5")):
                    ref = response["content"]["application/json"]["schema"]["$ref"]
                    assert ref.endswith("/ErrorResponse"), f"{method} {path} {code}"
    assert "429" in spec["paths"]["/api/v1/auth/signup/start"]["post"]["responses"]
