"""Hashing and token primitives. Uses established libraries only."""

import hashlib
import hmac
import secrets
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerificationError

from arc.core.errors import AppError

_hasher = PasswordHasher()  # Argon2id with the library's recommended parameters
_JWT_ALGORITHM = "HS256"

# Verified against when the account does not exist, so a login attempt takes
# the same time whether or not the username is real.
_DUMMY_HASH = _hasher.hash("arc-dummy-password-for-timing")


def utcnow() -> datetime:
    return datetime.now(UTC)


# --- Passwords --------------------------------------------------------------


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerificationError, InvalidHashError):
        return False


def password_needs_rehash(password_hash: str) -> bool:
    return _hasher.check_needs_rehash(password_hash)


# --- Opaque tokens and digests ----------------------------------------------


def new_refresh_token() -> str:
    return secrets.token_urlsafe(48)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def keyed_digest(secret: str, *parts: str) -> str:
    """HMAC-SHA256 of the parts. Used to store email codes and to build
    Redis keys from email addresses without keeping either in plain text."""
    return hmac.new(secret.encode(), "\x1f".join(parts).encode(), hashlib.sha256).hexdigest()


def constant_time_equals(a: str, b: str) -> bool:
    return hmac.compare_digest(a, b)


def random_numeric_code(length: int) -> str:
    return "".join(secrets.choice("0123456789") for _ in range(length))


# --- Signed tokens (JWT) ----------------------------------------------------


def encode_token(secret: str, token_type: str, subject: str, ttl_s: int, **claims: Any) -> str:
    now = utcnow()
    payload = {
        "typ": token_type,
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(seconds=ttl_s),
        "jti": uuid.uuid4().hex,
        **claims,
    }
    return jwt.encode(payload, secret, algorithm=_JWT_ALGORITHM)


def decode_token(secret: str, token: str, expected_type: str) -> dict[str, Any]:
    """Returns the claims, or raises a 401 the app knows how to handle."""
    try:
        claims: dict[str, Any] = jwt.decode(
            token, secret, algorithms=[_JWT_ALGORITHM], options={"require": ["exp", "sub", "typ"]}
        )
    except jwt.ExpiredSignatureError as exc:
        raise AppError(401, "TOKEN_EXPIRED", "This session token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise AppError(401, "TOKEN_INVALID", "This session token isn't valid.") from exc
    if claims.get("typ") != expected_type:
        raise AppError(401, "TOKEN_INVALID", "This session token isn't valid.")
    return claims
