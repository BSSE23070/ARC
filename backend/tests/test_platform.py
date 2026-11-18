"""Cross-cutting behaviour: health probes, error shape, config safety, SMTP."""

import asyncio
import email as email_lib
import socket

import httpx
import pytest
from aiosmtpd.controller import Controller
from pydantic import ValidationError

from arc.core.config import Settings
from arc.core.email import OutgoingEmail, SmtpEmailSender
from arc.core.security import hash_password, verify_password


async def test_health_and_readiness(client: httpx.AsyncClient) -> None:
    assert (await client.get("/healthz")).json() == {"status": "ok"}
    ready = await client.get("/readyz")
    assert ready.status_code == 200
    assert ready.json() == {"status": "ok", "database": "ok", "redis": "ok"}


async def test_unknown_route_uses_the_standard_error_shape(client: httpx.AsyncClient) -> None:
    r = await client.get("/api/v1/does-not-exist")
    assert r.status_code == 404
    assert r.json() == {"error": {"code": "NOT_FOUND", "message": "Not Found", "details": {}}}


async def test_validation_errors_name_the_field(client: httpx.AsyncClient) -> None:
    r = await client.post("/api/v1/auth/signup/start", json={"email": "not-an-email"})
    assert r.status_code == 422
    body = r.json()["error"]
    assert body["code"] == "VALIDATION_ERROR"
    assert body["details"]["fields"][0]["field"] == "email"


def test_production_refuses_unsafe_settings() -> None:
    with pytest.raises(ValidationError, match="ARC_JWT_SECRET"):
        Settings(env="prod", email_backend="smtp")
    with pytest.raises(ValidationError, match="console"):
        Settings(env="prod", jwt_secret="x" * 40, email_backend="console")
    Settings(env="prod", jwt_secret="x" * 40, email_backend="smtp")


def test_passwords_are_hashed_with_argon2id() -> None:
    hashed = hash_password("correct horse battery")
    assert hashed.startswith("$argon2id$")
    assert verify_password(hashed, "correct horse battery")
    assert not verify_password(hashed, "wrong")
    assert not verify_password(None, "anything")


async def test_smtp_sender_delivers_a_real_message() -> None:
    received: list[bytes] = []

    class Handler:
        async def handle_DATA(self, server, session, envelope):
            received.append(envelope.content)
            return "250 OK"

    with socket.socket() as probe:  # find a free port for the throwaway SMTP server
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]
    controller = Controller(Handler(), hostname="127.0.0.1", port=port)
    controller.start()
    try:
        sender = SmtpEmailSender(Settings(env="test", smtp_host="127.0.0.1", smtp_port=port))
        await sender.send(
            OutgoingEmail(
                to="maryam@itu.edu.pk", subject="482193 is your Arc code", text="hello", kind="t"
            )
        )
        await asyncio.sleep(0)
    finally:
        controller.stop()

    message = email_lib.message_from_bytes(received[0])
    assert message["To"] == "maryam@itu.edu.pk"
    assert message["Subject"] == "482193 is your Arc code"
    assert message.get_payload().strip() == "hello"
