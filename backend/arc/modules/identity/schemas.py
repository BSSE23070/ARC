"""Request and response shapes for the identity API."""

import json
import uuid
from datetime import date, datetime
from typing import Annotated, Any, Literal

from pydantic import AfterValidator, BaseModel, BeforeValidator, EmailStr, Field, StringConstraints

RESERVED_USERNAMES = frozenset(
    {
        "admin",
        "administrator",
        "arc",
        "arcapp",
        "help",
        "moderator",
        "official",
        "root",
        "staff",
        "support",
        "system",
    }
)


def _lower(value: str) -> str:
    return value.strip().lower()


def _lower_if_text(value: object) -> object:
    return value.strip().lower() if isinstance(value, str) else value


Email = Annotated[EmailStr, AfterValidator(_lower)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{4,8}$")]
# Lower-cased before the pattern check, so "Maryam" is accepted and stored as "maryam".
Username = Annotated[
    str, BeforeValidator(_lower_if_text), StringConstraints(pattern=r"^[a-z0-9_.]{3,20}$")
]
Password = Annotated[str, StringConstraints(min_length=1, max_length=128)]
InstallationId = Annotated[str, StringConstraints(pattern=r"^[A-Za-z0-9_-]{16,64}$")]


class Accepted(BaseModel):
    status: Literal["sent"] = "sent"
    resend_after_s: int = Field(description="Seconds to wait before asking for another code.")


# --- Sign-up ----------------------------------------------------------------


class SignupStartRequest(BaseModel):
    email: Email


class SignupVerifyRequest(BaseModel):
    email: Email
    code: Code


class SignupVerifyResponse(BaseModel):
    signup_token: str
    expires_in: int


class SignupCompleteRequest(BaseModel):
    signup_token: str
    username: Username
    password: Password
    date_of_birth: date
    installation_id: InstallationId


# --- Sign-in ----------------------------------------------------------------


class LoginRequest(BaseModel):
    identifier: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)
    ] = Field(description="Username or email address.")
    password: Password
    installation_id: InstallationId


class LoginChallengeResponse(BaseModel):
    """Returned with 202 when the app installation has not been seen before."""

    challenge: Literal["email_code"] = "email_code"
    challenge_token: str
    email_hint: str = Field(description="Masked address the code was sent to, e.g. m***@itu.edu.pk")
    resend_after_s: int


class LoginVerifyRequest(BaseModel):
    challenge_token: str
    code: Code


class LoginResendRequest(BaseModel):
    challenge_token: str


class RefreshRequest(BaseModel):
    refresh_token: str


class LogoutRequest(BaseModel):
    refresh_token: str


# --- Passwords --------------------------------------------------------------


class PasswordForgotRequest(BaseModel):
    email: Email


class PasswordResetRequest(BaseModel):
    email: Email
    code: Code
    new_password: Password


class PasswordChangeRequest(BaseModel):
    current_password: Password
    new_password: Password


# --- Responses --------------------------------------------------------------


class UserOut(BaseModel):
    id: uuid.UUID
    email: str
    username: str
    status: Literal["active", "suspended", "deleted"]
    liveness_status: Literal["pending", "passed"]
    created_at: datetime


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int = Field(description="Lifetime of the access token in seconds.")
    user: UserOut


# --- Liveness ---------------------------------------------------------------


def _small_object(value: dict[str, Any]) -> dict[str, Any]:
    # Evidence is a provider token or result, never an image.
    if len(json.dumps(value)) > 4096:
        raise ValueError("evidence is too large")
    return value


class LivenessCheckOut(BaseModel):
    check_id: uuid.UUID
    provider: str = Field(description="Which liveness provider the app should run.")
    expires_in: int = Field(description="Seconds the app has to finish this attempt.")
    client_payload: dict[str, Any] = Field(description="What the provider's SDK needs to start.")
    attempts_left: int = Field(description="Attempts left today after this one.")


class LivenessCompleteRequest(BaseModel):
    evidence: Annotated[dict[str, Any], AfterValidator(_small_object)] = Field(
        description="The provider SDK's result. Checked on the server, never trusted as-is."
    )


class LivenessResultOut(BaseModel):
    status: Literal["passed", "failed"]
    reason: str | None = Field(description="Short code for why the check failed, if it did.")
    attempts_left: int
    user: UserOut
