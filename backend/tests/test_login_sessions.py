"""Log-in, new-phone confirmation, and sessions that stay signed in."""

from datetime import timedelta

import httpx
from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from arc.core.audit import AuditLog
from arc.core.security import sha256_hex, utcnow
from arc.modules.identity.models import AuthSession, User
from tests.conftest import INSTALL_A, INSTALL_B, PASSWORD, MemoryEmailSender, auth, sign_up

EMAIL = "maryam@itu.edu.pk"


def _login(
    identifier: str = "maryam", password: str = PASSWORD, installation_id: str = INSTALL_A
) -> dict[str, str]:
    return {"identifier": identifier, "password": password, "installation_id": installation_id}


async def test_log_in_with_username_or_email_on_a_known_phone(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    for identifier in ("maryam", "Maryam", EMAIL, "MARYAM@itu.edu.pk"):
        r = await client.post("/api/v1/auth/login", json=_login(identifier))
        assert r.status_code == 200, identifier
        assert r.json()["user"]["username"] == "maryam"


async def test_wrong_password_and_unknown_user_look_the_same(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    wrong = await client.post("/api/v1/auth/login", json=_login(password="not the password"))
    unknown = await client.post("/api/v1/auth/login", json=_login(identifier="nobody"))
    for r in (wrong, unknown):
        assert r.status_code == 401
        assert r.json()["error"]["code"] == "INVALID_CREDENTIALS"
        assert r.json()["error"]["message"] == wrong.json()["error"]["message"]


async def test_account_locks_after_repeated_failures(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    for _ in range(5):
        r = await client.post("/api/v1/auth/login", json=_login(password="wrong-password"))
        assert r.status_code == 401
    assert r.json()["error"]["details"]["attempts_remaining"] == 0

    locked = await client.post("/api/v1/auth/login", json=_login())  # even the right password
    assert locked.status_code == 429
    assert locked.json()["error"]["code"] == "ACCOUNT_LOCKED"
    assert locked.json()["error"]["details"]["retry_after_s"] > 0


async def test_new_phone_needs_an_email_code(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    mail.outbox.clear()

    r = await client.post("/api/v1/auth/login", json=_login(installation_id=INSTALL_B))
    assert r.status_code == 202
    challenge = r.json()
    assert challenge["challenge"] == "email_code"
    assert challenge["email_hint"] == "m***@itu.edu.pk"
    assert "access_token" not in challenge
    assert mail.kinds(EMAIL) == ["login_device_code"]

    wrong_code = "000000" if mail.code_for(EMAIL) != "000000" else "111111"
    bad = await client.post(
        "/api/v1/auth/login/verify",
        json={"challenge_token": challenge["challenge_token"], "code": wrong_code},
    )
    assert bad.json()["error"]["code"] == "OTP_INVALID"

    ok = await client.post(
        "/api/v1/auth/login/verify",
        json={"challenge_token": challenge["challenge_token"], "code": mail.code_for(EMAIL)},
    )
    assert ok.status_code == 200
    assert (await client.get("/api/v1/me", headers=auth(ok.json()))).status_code == 200

    # The phone is now trusted: the next log-in needs no code.
    again = await client.post("/api/v1/auth/login", json=_login(installation_id=INSTALL_B))
    assert again.status_code == 200


async def test_retrying_log_in_on_new_phone_does_not_spam_codes(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    mail.outbox.clear()
    first = await client.post("/api/v1/auth/login", json=_login(installation_id=INSTALL_B))
    second = await client.post("/api/v1/auth/login", json=_login(installation_id=INSTALL_B))
    assert first.status_code == second.status_code == 202
    assert len(mail.outbox) == 1

    resend = await client.post(
        "/api/v1/auth/login/resend", json={"challenge_token": second.json()["challenge_token"]}
    )
    assert resend.status_code == 429
    assert resend.json()["error"]["code"] == "OTP_COOLDOWN"


async def test_refresh_rotates_and_old_token_reuse_signs_the_phone_out(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    first = await sign_up(client, mail)

    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert r.status_code == 200
    second = r.json()
    assert second["refresh_token"] != first["refresh_token"]
    assert (await client.get("/api/v1/me", headers=auth(second))).status_code == 200

    # Pretend the first token was rotated long ago, then replay it (a stolen token).
    await db.execute(
        update(AuthSession)
        .where(AuthSession.token_hash == sha256_hex(first["refresh_token"]))
        .values(rotated_at=utcnow() - timedelta(minutes=5))
    )
    await db.commit()
    replay = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert replay.status_code == 401
    assert replay.json()["error"]["code"] == "SESSION_REVOKED"

    # The whole device session is gone: the newer tokens stop working too.
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": second["refresh_token"]})
    ).status_code == 401
    me = await client.get("/api/v1/me", headers=auth(second))
    assert me.status_code == 401
    assert me.json()["error"]["code"] == "SESSION_REVOKED"

    actions = (await db.execute(select(AuditLog.action, AuditLog.meta))).all()
    assert ("sessions_revoked", {"reason": "reuse_detected", "count": 1}) in [
        tuple(a) for a in actions
    ]


async def test_refresh_retry_after_lost_response_keeps_the_user_signed_in(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    first = await sign_up(client, mail)
    lost = await client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]})
    assert lost.status_code == 200  # ...but imagine the app never received this

    retry = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}
    )
    assert retry.status_code == 200
    assert (await client.get("/api/v1/me", headers=auth(retry.json()))).status_code == 200

    # The token from the "lost" response was retired; replaying it is treated as theft.
    stale = await client.post(
        "/api/v1/auth/refresh", json={"refresh_token": lost.json()["refresh_token"]}
    )
    assert stale.status_code == 401
    assert (await client.get("/api/v1/me", headers=auth(retry.json()))).status_code == 401


async def test_session_expires_after_idle_period(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    await db.execute(update(AuthSession).values(expires_at=utcnow() - timedelta(seconds=1)))
    await db.commit()
    r = await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    assert r.status_code == 401
    assert r.json()["error"]["code"] == "SESSION_EXPIRED"


async def test_log_out_ends_the_session_immediately(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    tokens = await sign_up(client, mail)
    assert (
        await client.post("/api/v1/auth/logout", json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 204
    assert (await client.get("/api/v1/me", headers=auth(tokens))).json()["error"][
        "code"
    ] == "SESSION_REVOKED"
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]})
    ).status_code == 401
    # Logging out twice (or with a junk token) is harmless.
    assert (
        await client.post("/api/v1/auth/logout", json={"refresh_token": "junk"})
    ).status_code == 204


async def test_suspended_account_is_shut_out(
    client: httpx.AsyncClient, mail: MemoryEmailSender, db: AsyncSession
) -> None:
    tokens = await sign_up(client, mail)
    await db.execute(update(User).values(status="suspended"))
    await db.commit()

    for response in (
        await client.get("/api/v1/me", headers=auth(tokens)),
        await client.post("/api/v1/auth/login", json=_login()),
        await client.post("/api/v1/auth/refresh", json={"refresh_token": tokens["refresh_token"]}),
    ):
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "ACCOUNT_SUSPENDED"


async def test_protected_route_rejects_missing_and_bad_tokens(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    missing = await client.get("/api/v1/me")
    assert missing.status_code == 401
    assert missing.json()["error"]["code"] == "AUTH_REQUIRED"

    garbage = await client.get("/api/v1/me", headers={"Authorization": "Bearer not.a.token"})
    assert garbage.json()["error"]["code"] == "TOKEN_INVALID"

    # A refresh token is not an access token.
    tokens = await sign_up(client, mail)
    swapped = await client.get(
        "/api/v1/me", headers={"Authorization": f"Bearer {tokens['refresh_token']}"}
    )
    assert swapped.json()["error"]["code"] == "TOKEN_INVALID"


async def test_login_rate_limit_per_ip(client: httpx.AsyncClient, redis: Redis) -> None:
    for i in range(30):
        await client.post("/api/v1/auth/login", json=_login(identifier=f"user{i}"))
    r = await client.post("/api/v1/auth/login", json=_login(identifier="user-final"))
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "RATE_LIMITED"
    assert r.headers["retry-after"].isdigit()
