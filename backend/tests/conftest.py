"""Test setup: a real PostgreSQL database and a real Redis, migrated with Alembic.

Point the tests at your services with ARC_TEST_DATABASE_URL / ARC_TEST_REDIS_URL
(the defaults match docker-compose.yml).
"""

import os
import re
import subprocess
import sys
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI
from redis.asyncio import Redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from arc.core.config import Settings
from arc.core.email import OutgoingEmail
from arc.main import create_app

BACKEND_DIR = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.environ.get(
    "ARC_TEST_DATABASE_URL", "postgresql+asyncpg://arc:arc@localhost:5432/arc_test"
)
TEST_REDIS_URL = os.environ.get("ARC_TEST_REDIS_URL", "redis://localhost:6379/15")

PASSWORD = "correct horse battery"
ADULT_DOB = "2002-03-14"
INSTALL_A = "installation-aaaaaaaa"
INSTALL_B = "installation-bbbbbbbb"


@dataclass
class MemoryEmailSender:
    """Captures emails instead of sending them."""

    outbox: list[OutgoingEmail] = field(default_factory=list)
    fail: bool = False

    async def send(self, email: OutgoingEmail) -> None:
        if self.fail:
            raise RuntimeError("smtp down")
        self.outbox.append(email)

    def last(self, to: str) -> OutgoingEmail:
        return next(e for e in reversed(self.outbox) if e.to == to)

    def code_for(self, to: str) -> str:
        match = re.search(r"\b(\d{6})\b", self.last(to).text)
        assert match, "no code in the last email"
        return match.group(1)

    def kinds(self, to: str) -> list[str]:
        return [e.kind for e in self.outbox if e.to == to]


@pytest.fixture(scope="session")
def settings() -> Settings:
    return Settings(
        env="test",
        database_url=TEST_DATABASE_URL,
        redis_url=TEST_REDIS_URL,
        jwt_secret="test-secret-test-secret-test-secret-1234",
    )


@pytest.fixture(scope="session", autouse=True)
def _migrated_database(settings: Settings) -> None:
    """Runs the real migrations (down, then up) once per test run."""
    env = {**os.environ, "ARC_DATABASE_URL": settings.database_url}
    for args in (["downgrade", "base"], ["upgrade", "head"]):
        subprocess.run(
            [sys.executable, "-m", "alembic", *args], cwd=BACKEND_DIR, env=env, check=True
        )


@pytest.fixture(scope="session")
def mail() -> MemoryEmailSender:
    return MemoryEmailSender()


@pytest.fixture(scope="session")
async def app(settings: Settings, mail: MemoryEmailSender) -> AsyncIterator[FastAPI]:
    application = create_app(settings, email_sender=mail)
    yield application
    await application.state.redis.aclose()
    await application.state.engine.dispose()


@pytest.fixture(autouse=True)
async def _clean_state(app: FastAPI, mail: MemoryEmailSender) -> None:
    async with app.state.engine.begin() as conn:
        await conn.execute(
            text(
                "truncate users, auth_sessions, trusted_devices, audit_log restart identity cascade"
            )
        )
    redis: Redis = app.state.redis
    await redis.flushdb()
    mail.outbox.clear()
    mail.fail = False


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as http:
        yield http


@pytest.fixture
async def db(app: FastAPI) -> AsyncIterator[AsyncSession]:
    async with app.state.session_factory() as session:
        yield session


@pytest.fixture
def redis(app: FastAPI) -> Redis:
    return app.state.redis  # type: ignore[no-any-return]


def auth(tokens: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {tokens['access_token']}"}


async def sign_up(
    client: httpx.AsyncClient,
    mail: MemoryEmailSender,
    email: str = "maryam@itu.edu.pk",
    username: str = "maryam",
    password: str = PASSWORD,
    installation_id: str = INSTALL_A,
) -> dict:
    """Runs the whole sign-up flow and returns the token response."""
    r = await client.post("/api/v1/auth/signup/start", json={"email": email})
    assert r.status_code == 202, r.text
    r = await client.post(
        "/api/v1/auth/signup/verify", json={"email": email, "code": mail.code_for(email)}
    )
    assert r.status_code == 200, r.text
    r = await client.post(
        "/api/v1/auth/signup/complete",
        json={
            "signup_token": r.json()["signup_token"],
            "username": username,
            "password": password,
            "date_of_birth": ADULT_DOB,
            "installation_id": installation_id,
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


async def clear_cooldowns(redis: Redis) -> None:
    """Lets a test request a second code without waiting 30 seconds."""
    async for key in redis.scan_iter("otp:*:cooldown"):
        await redis.delete(key)
