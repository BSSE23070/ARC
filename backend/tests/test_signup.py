"""Sign-up: email code, username + password, 18+ gate (FR-01, FR-02)."""

import httpx
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from arc.modules.identity.models import User
from tests.conftest import (
    ADULT_DOB,
    INSTALL_A,
    PASSWORD,
    MemoryEmailSender,
    auth,
    clear_cooldowns,
    sign_up,
)

EMAIL = "maryam@itu.edu.pk"


async def _verified_token(
    client: httpx.AsyncClient, mail: MemoryEmailSender, email: str = EMAIL
) -> str:
    await client.post("/api/v1/auth/signup/start", json={"email": email})
    r = await client.post(
        "/api/v1/auth/signup/verify", json={"email": email, "code": mail.code_for(email)}
    )
    return r.json()["signup_token"]


def _complete_body(token: str, **overrides: str) -> dict[str, str]:
    return {
        "signup_token": token,
        "username": "maryam",
        "password": PASSWORD,
        "date_of_birth": ADULT_DOB,
        "installation_id": INSTALL_A,
        **overrides,
    }


async def _user_count(db: AsyncSession) -> int:
    return (await db.execute(select(func.count()).select_from(User))).scalar_one()


async def test_sign_up_creates_account_and_signs_in(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    tokens = await sign_up(client, mail)

    assert tokens["token_type"] == "bearer"
    assert tokens["user"]["email"] == EMAIL
    assert tokens["user"]["username"] == "maryam"
    assert tokens["user"]["liveness_status"] == "pending"

    me = await client.get("/api/v1/me", headers=auth(tokens))
    assert me.status_code == 200
    assert me.json()["username"] == "maryam"


async def test_email_and_username_are_case_insensitive(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await client.post("/api/v1/auth/signup/start", json={"email": "Maryam@ITU.edu.pk"})
    r = await client.post(
        "/api/v1/auth/signup/verify", json={"email": EMAIL, "code": mail.code_for(EMAIL)}
    )
    r = await client.post(
        "/api/v1/auth/signup/complete",
        json=_complete_body(r.json()["signup_token"], username="Maryam"),
    )
    assert r.status_code == 201
    assert r.json()["user"]["username"] == "maryam"


async def test_wrong_code_counts_down_then_locks(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    real = mail.code_for(EMAIL)
    wrong = "000000" if real != "000000" else "111111"

    for expected_remaining in (4, 3, 2, 1):
        r = await client.post("/api/v1/auth/signup/verify", json={"email": EMAIL, "code": wrong})
        assert r.status_code == 400
        assert r.json()["error"]["code"] == "OTP_INVALID"
        assert r.json()["error"]["details"]["attempts_remaining"] == expected_remaining

    r = await client.post("/api/v1/auth/signup/verify", json={"email": EMAIL, "code": wrong})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "OTP_LOCKED"

    # Once locked, even the right code no longer works.
    r = await client.post("/api/v1/auth/signup/verify", json={"email": EMAIL, "code": real})
    assert r.json()["error"]["code"] == "OTP_EXPIRED"


async def test_code_is_single_use(client: httpx.AsyncClient, mail: MemoryEmailSender) -> None:
    await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    code = mail.code_for(EMAIL)
    assert (
        await client.post("/api/v1/auth/signup/verify", json={"email": EMAIL, "code": code})
    ).status_code == 200
    again = await client.post("/api/v1/auth/signup/verify", json={"email": EMAIL, "code": code})
    assert again.json()["error"]["code"] == "OTP_EXPIRED"


async def test_resend_is_throttled(client: httpx.AsyncClient, mail: MemoryEmailSender) -> None:
    first = await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    assert first.json() == {"status": "sent", "resend_after_s": 30}

    second = await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    assert second.status_code == 429
    assert second.json()["error"]["code"] == "OTP_COOLDOWN"
    assert 0 < second.json()["error"]["details"]["retry_after_s"] <= 30
    assert len(mail.outbox) == 1


async def test_hourly_limit_per_email(
    client: httpx.AsyncClient, mail: MemoryEmailSender, redis: Redis
) -> None:
    for _ in range(5):
        assert (
            await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
        ).status_code == 202
        await clear_cooldowns(redis)
    r = await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "RATE_LIMITED"


async def test_existing_email_gets_notice_not_code(
    client: httpx.AsyncClient, mail: MemoryEmailSender, redis: Redis
) -> None:
    await sign_up(client, mail)
    await clear_cooldowns(redis)
    mail.outbox.clear()

    r = await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})

    # Same response as for a new address, so the API doesn't reveal accounts.
    assert r.status_code == 202
    assert r.json() == {"status": "sent", "resend_after_s": 30}
    assert mail.kinds(EMAIL) == ["account_exists"]


async def test_under_18_is_blocked_and_no_account_is_created(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession, redis: Redis
) -> None:
    token = await _verified_token(client, mail)
    r = await client.post(
        "/api/v1/auth/signup/complete", json=_complete_body(token, date_of_birth="2010-01-01")
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "UNDERAGE"
    assert await _user_count(db) == 0

    # Entering a different date straight afterwards doesn't get around the gate.
    r = await client.post("/api/v1/auth/signup/complete", json=_complete_body(token))
    assert r.json()["error"]["code"] == "SIGNUP_SESSION_EXPIRED"
    await clear_cooldowns(redis)
    token = await _verified_token(client, mail)
    r = await client.post("/api/v1/auth/signup/complete", json=_complete_body(token))
    assert r.json()["error"]["code"] == "UNDERAGE"
    assert await _user_count(db) == 0


async def test_username_rules(
    client: httpx.AsyncClient, mail: MemoryEmailSender, redis: Redis
) -> None:
    await sign_up(client, mail)
    await clear_cooldowns(redis)
    token = await _verified_token(client, mail, "noor@itu.edu.pk")

    taken = await client.post(
        "/api/v1/auth/signup/complete", json=_complete_body(token, username="maryam")
    )
    assert taken.status_code == 409
    assert taken.json()["error"]["code"] == "USERNAME_TAKEN"

    reserved = await client.post(
        "/api/v1/auth/signup/complete", json=_complete_body(token, username="admin")
    )
    assert reserved.json()["error"]["code"] == "USERNAME_TAKEN"

    invalid = await client.post(
        "/api/v1/auth/signup/complete", json=_complete_body(token, username="no spaces!")
    )
    assert invalid.status_code == 422
    assert invalid.json()["error"]["code"] == "VALIDATION_ERROR"
    assert invalid.json()["error"]["details"]["fields"][0]["field"] == "username"

    # The verified email survives those failures, so the user can just fix the form.
    ok = await client.post(
        "/api/v1/auth/signup/complete", json=_complete_body(token, username="noor")
    )
    assert ok.status_code == 201


async def test_weak_passwords_are_rejected(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    token = await _verified_token(client, mail)
    cases = {
        "short": "too_short",
        "1234567890": "too_common",
        "maryam-rocks-99": "contains_identity",
    }
    for password, reason in cases.items():
        r = await client.post(
            "/api/v1/auth/signup/complete", json=_complete_body(token, password=password)
        )
        assert r.status_code == 422, password
        assert r.json()["error"]["code"] == "WEAK_PASSWORD"
        assert r.json()["error"]["details"]["reason"] == reason


async def test_signup_token_cannot_be_reused(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    token = await _verified_token(client, mail)
    assert (
        await client.post("/api/v1/auth/signup/complete", json=_complete_body(token))
    ).status_code == 201
    again = await client.post(
        "/api/v1/auth/signup/complete", json=_complete_body(token, username="other")
    )
    assert again.json()["error"]["code"] == "SIGNUP_SESSION_EXPIRED"


async def test_disposable_email_domain_is_refused(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    r = await client.post("/api/v1/auth/signup/start", json={"email": "x@mailinator.com"})
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "EMAIL_DOMAIN_BLOCKED"
    assert mail.outbox == []


async def test_email_failure_is_reported_and_retry_is_immediate(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    mail.fail = True
    r = await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "EMAIL_SEND_FAILED"

    mail.fail = False
    assert (
        await client.post("/api/v1/auth/signup/start", json={"email": EMAIL})
    ).status_code == 202
