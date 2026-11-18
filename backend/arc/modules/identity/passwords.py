"""Password rules and the optional breached-password check."""

import hashlib
import logging
from typing import Protocol

import httpx

from arc.core.config import Settings
from arc.core.errors import AppError

log = logging.getLogger("arc.identity.passwords")

# A short list of the passwords attackers try first. The breach check below
# (when enabled) covers the long tail.
_COMMON_PASSWORDS = frozenset(
    {
        "1234567890",
        "0123456789",
        "0987654321",
        "1q2w3e4r5t",
        "qwertyuiop",
        "qwerty12345",
        "password123",
        "password1234",
        "passwordpassword",
        "iloveyou123",
        "pakistan123",
        "abcdefghij",
        "letmein12345",
    }
)


class BreachChecker(Protocol):
    async def is_breached(self, password: str) -> bool: ...


class NoBreachChecker:
    async def is_breached(self, password: str) -> bool:
        return False


class HibpBreachChecker:
    """Have I Been Pwned range API (k-anonymity).

    Only the first five characters of the password's SHA-1 leave our server,
    so the service never learns the password. If the service is unreachable
    we allow the password rather than block sign-ups.
    """

    def __init__(self, transport: httpx.AsyncBaseTransport | None = None) -> None:
        self._transport = transport

    async def is_breached(self, password: str) -> bool:
        digest = hashlib.sha1(password.encode(), usedforsecurity=False).hexdigest().upper()
        prefix, suffix = digest[:5], digest[5:]
        try:
            async with httpx.AsyncClient(transport=self._transport, timeout=3.0) as client:
                response = await client.get(
                    f"https://api.pwnedpasswords.com/range/{prefix}",
                    headers={"Add-Padding": "true"},
                )
                response.raise_for_status()
        except httpx.HTTPError:
            log.warning("breached-password check unavailable; allowing password")
            return False
        for line in response.text.splitlines():
            candidate, _, count = line.partition(":")
            if candidate.strip() == suffix and count.strip() != "0":
                return True
        return False


def build_breach_checker(settings: Settings) -> BreachChecker:
    return HibpBreachChecker() if settings.password_breach_check == "hibp" else NoBreachChecker()


def _weak(reason: str, message: str) -> AppError:
    return AppError(422, "WEAK_PASSWORD", message, {"reason": reason})


async def validate_new_password(
    password: str,
    *,
    username: str,
    email: str,
    settings: Settings,
    breach_checker: BreachChecker,
) -> None:
    if len(password) < settings.password_min_length:
        raise _weak("too_short", f"Use at least {settings.password_min_length} characters.")
    lowered = password.lower()
    email_name = email.split("@", 1)[0]
    for identity in (username, email_name):
        if len(identity) >= 4 and identity.lower() in lowered:
            raise _weak("contains_identity", "Don't use your username or email in your password.")
    if lowered in _COMMON_PASSWORDS or len(set(password)) <= 2:
        raise _weak("too_common", "That password is too easy to guess. Try a longer phrase.")
    if await breach_checker.is_breached(password):
        raise _weak("breached", "That password has appeared in a data leak. Please choose another.")
