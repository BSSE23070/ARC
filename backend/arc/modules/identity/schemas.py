"""Request and response shapes for the identity API."""

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

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
