"""Forgot / reset / change password, and the breached-password check."""

import httpx
from redis.asyncio import Redis

from arc.modules.identity.passwords import HibpBreachChecker
from tests.conftest import (
    INSTALL_A,
    INSTALL_B,
    PASSWORD,
    MemoryEmailSender,
    auth,
    clear_cooldowns,
    sign_up,
)

EMAIL = "maryam@itu.edu.pk"
NEW_PASSWORD = "a brand new passphrase"


async def _second_phone(client: httpx.AsyncClient, mail: MemoryEmailSender) -> dict:
    r = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "maryam", "password": PASSWORD, "installation_id": INSTALL_B},
    )
    r = await client.post(
        "/api/v1/auth/login/verify",
        json={"challenge_token": r.json()["challenge_token"], "code": mail.code_for(EMAIL)},
    )
    assert r.status_code == 200
    return r.json()


async def test_reset_password_with_email_code_signs_every_phone_out(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    tokens = await sign_up(client, mail)

    r = await client.post("/api/v1/auth/password/forgot", json={"email": EMAIL})
    assert r.status_code == 202
    r = await client.post(
        "/api/v1/auth/password/reset",
        json={"email": EMAIL, "code": mail.code_for(EMAIL), "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 204
    assert mail.kinds(EMAIL)[-1] == "password_changed"

    assert (await client.get("/api/v1/me", headers=auth(tokens))).status_code == 401
    old = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "maryam", "password": PASSWORD, "installation_id": INSTALL_A},
    )
    assert old.status_code == 401
    new = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "maryam", "password": NEW_PASSWORD, "installation_id": INSTALL_A},
    )
    assert new.status_code == 200


async def test_forgot_password_does_not_reveal_unknown_addresses(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    r = await client.post("/api/v1/auth/password/forgot", json={"email": "nobody@itu.edu.pk"})
    assert r.status_code == 202
    assert r.json() == {"status": "sent", "resend_after_s": 30}
    assert mail.outbox == []

    reset = await client.post(
        "/api/v1/auth/password/reset",
        json={"email": "nobody@itu.edu.pk", "code": "123456", "new_password": NEW_PASSWORD},
    )
    assert reset.status_code == 400
    assert reset.json()["error"]["code"] == "OTP_EXPIRED"


async def test_weak_new_password_does_not_burn_the_reset_code(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    await client.post("/api/v1/auth/password/forgot", json={"email": EMAIL})
    code = mail.code_for(EMAIL)

    weak = await client.post(
        "/api/v1/auth/password/reset", json={"email": EMAIL, "code": code, "new_password": "short"}
    )
    assert weak.json()["error"]["code"] == "WEAK_PASSWORD"

    ok = await client.post(
        "/api/v1/auth/password/reset",
        json={"email": EMAIL, "code": code, "new_password": NEW_PASSWORD},
    )
    assert ok.status_code == 204


async def test_reset_clears_a_login_lockout(
    client: httpx.AsyncClient, mail: MemoryEmailSender
) -> None:
    await sign_up(client, mail)
    for _ in range(5):
        await client.post(
            "/api/v1/auth/login",
            json={"identifier": "maryam", "password": "wrong-wrong", "installation_id": INSTALL_A},
        )
    await client.post("/api/v1/auth/password/forgot", json={"email": EMAIL})
    await client.post(
        "/api/v1/auth/password/reset",
        json={"email": EMAIL, "code": mail.code_for(EMAIL), "new_password": NEW_PASSWORD},
    )
    r = await client.post(
        "/api/v1/auth/login",
        json={"identifier": "maryam", "password": NEW_PASSWORD, "installation_id": INSTALL_A},
    )
    assert r.status_code == 200


async def test_change_password_keeps_this_phone_and_signs_others_out(
    client: httpx.AsyncClient, mail: MemoryEmailSender, redis: Redis
) -> None:
    phone_a = await sign_up(client, mail)
    phone_b = await _second_phone(client, mail)
    await clear_cooldowns(redis)

    wrong = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": "not-my-password", "new_password": NEW_PASSWORD},
        headers=auth(phone_a),
    )
    assert wrong.status_code == 400
    assert wrong.json()["error"]["code"] == "CURRENT_PASSWORD_WRONG"

    same = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": PASSWORD, "new_password": PASSWORD},
        headers=auth(phone_a),
    )
    assert same.json()["error"]["details"]["reason"] == "same_as_current"

    ok = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
        headers=auth(phone_a),
    )
    assert ok.status_code == 204

    assert (await client.get("/api/v1/me", headers=auth(phone_a))).status_code == 200
    assert (await client.get("/api/v1/me", headers=auth(phone_b))).status_code == 401
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": phone_a["refresh_token"]})
    ).status_code == 200
    assert (
        await client.post("/api/v1/auth/refresh", json={"refresh_token": phone_b["refresh_token"]})
    ).status_code == 401


async def test_change_password_requires_log_in(client: httpx.AsyncClient) -> None:
    r = await client.post(
        "/api/v1/auth/password/change",
        json={"current_password": PASSWORD, "new_password": NEW_PASSWORD},
    )
    assert r.status_code == 401


async def test_hibp_checker_reads_range_response_without_sending_the_password() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(str(request.url))
        # SHA-1("password") = 5BAA6 1E4C9B93F3F0682250B6CF8331B7EE68FD8
        return httpx.Response(
            200,
            text="0018A45C4D1DEF81644B54AB7F969B88D65:1\r\n1E4C9B93F3F0682250B6CF8331B7EE68FD8:52256179\r\n",
        )

    checker = HibpBreachChecker(transport=httpx.MockTransport(handler))
    assert await checker.is_breached("password") is True
    assert await checker.is_breached("a-password-nobody-has-leaked") is False
    assert seen[0] == "https://api.pwnedpasswords.com/range/5BAA6"
    # Only a 5-character hash prefix ever leaves the server.
    assert all(len(httpx.URL(url).path.removeprefix("/range/")) == 5 for url in seen)


async def test_hibp_outage_does_not_block_sign_up() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("offline")

    assert (
        await HibpBreachChecker(transport=httpx.MockTransport(handler)).is_breached("password")
        is False
    )
