"""Identity dependencies. Other modules import ``CurrentUser`` from here to
protect their routes."""

import uuid
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from arc.core.deps import DbDep, EmailDep, RedisDep, SettingsDep
from arc.core.errors import AppError
from arc.core.security import decode_token
from arc.modules.identity.models import User
from arc.modules.identity.passwords import BreachChecker
from arc.modules.identity.service import IdentityService, revoked_family_key

_bearer = HTTPBearer(auto_error=False, description="Access token from sign-up, log-in or refresh.")


@dataclass(frozen=True)
class AuthContext:
    user: User
    family_id: uuid.UUID  # identifies the signed-in device


def get_identity_service(
    request: Request, session: DbDep, redis: RedisDep, settings: SettingsDep, email_sender: EmailDep
) -> IdentityService:
    breach_checker: BreachChecker = request.app.state.breach_checker
    return IdentityService(session, redis, settings, email_sender, breach_checker)


async def get_auth_context(
    session: DbDep,
    redis: RedisDep,
    settings: SettingsDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> AuthContext:
    if credentials is None:
        raise AppError(401, "AUTH_REQUIRED", "Please log in.")
    claims = decode_token(settings.jwt_secret, credentials.credentials, "access")
    try:
        user_id = uuid.UUID(claims["sub"])
        family_id = uuid.UUID(claims["sid"])
    except (KeyError, ValueError) as exc:
        raise AppError(401, "TOKEN_INVALID", "This session token isn't valid.") from exc

    # Logged-out or revoked devices fail at once, not when the token expires.
    if await redis.exists(revoked_family_key(family_id)):
        raise AppError(401, "SESSION_REVOKED", "Please log in again.")
    user = await session.get(User, user_id)
    if user is None or user.status == "deleted":
        raise AppError(401, "SESSION_REVOKED", "Please log in again.")
    if user.status == "suspended":
        raise AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended.")
    return AuthContext(user=user, family_id=family_id)


IdentityServiceDep = Annotated[IdentityService, Depends(get_identity_service)]
AuthDep = Annotated[AuthContext, Depends(get_auth_context)]
