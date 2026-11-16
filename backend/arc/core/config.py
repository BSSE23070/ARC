"""All tunable rules and environment-specific values live here.

Every field can be overridden with an environment variable prefixed ``ARC_``
(for example ``ARC_DATABASE_URL``). Nothing in this file is a secret: real
secrets come from the environment and are never committed.
"""

from functools import lru_cache
from typing import Literal, Self

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

DEV_JWT_SECRET = "dev-only-secret-change-me-dev-only-secret"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ARC_", env_file=".env", extra="ignore")

    env: Literal["dev", "test", "prod"] = "dev"

    # --- Infrastructure -----------------------------------------------------
    database_url: str = "postgresql+asyncpg://arc:arc@localhost:5432/arc"
    redis_url: str = "redis://localhost:6379/0"

    # --- Tokens and sessions ------------------------------------------------
    jwt_secret: str = DEV_JWT_SECRET
    access_token_ttl_s: int = 15 * 60
    # A session ends after this long without the app being opened. Each
    # refresh slides the window forward, so active users stay signed in.
    refresh_idle_ttl_days: int = 90
    # A just-rotated refresh token is still accepted for this long, so a
    # response lost on a weak network does not sign the user out.
    refresh_reuse_grace_s: int = 30
    signup_token_ttl_s: int = 15 * 60

    # --- One-time email codes -----------------------------------------------
    otp_length: int = 6
    otp_ttl_s: int = 10 * 60
    otp_max_attempts: int = 5
    otp_resend_cooldown_s: int = 30
    otp_max_per_email_per_hour: int = 5
    otp_max_per_ip_per_hour: int = 30

    # --- Passwords and login ------------------------------------------------
    password_min_length: int = 10
    password_breach_check: Literal["off", "hibp"] = "off"
    login_max_failures: int = 5
    login_lockout_s: int = 15 * 60
    login_max_per_ip_per_minute: int = 30

    # --- Sign-up rules ------------------------------------------------------
    min_age_years: int = 18
    underage_block_s: int = 24 * 60 * 60
    blocked_email_domains: list[str] = [
        "mailinator.com",
        "guerrillamail.com",
        "10minutemail.com",
        "tempmail.com",
        "yopmail.com",
        "trashmail.com",
    ]

    # --- Outgoing email -----------------------------------------------------
    # "console" prints codes to the API log (development only).
    email_backend: Literal["console", "smtp"] = "console"
    email_from: str = "Arc <no-reply@arc.localhost>"
    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_username: str | None = None
    smtp_password: str | None = None
    smtp_starttls: bool = False

    @model_validator(mode="after")
    def _refuse_unsafe_production_config(self) -> Self:
        if self.env == "prod":
            if self.jwt_secret == DEV_JWT_SECRET or len(self.jwt_secret) < 32:
                raise ValueError("ARC_JWT_SECRET must be a random value of 32+ characters in prod")
            if self.email_backend == "console":
                raise ValueError(
                    "ARC_EMAIL_BACKEND=console would log sign-in codes; use smtp in prod"
                )
        return self


@lru_cache
def get_settings() -> Settings:
    return Settings()
