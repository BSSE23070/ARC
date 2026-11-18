"""One-time email codes.

Codes live only in Redis, stored as a keyed hash (never in plain text), expire
on their own, are single-use, and lock after too many wrong attempts.
"""

from enum import StrEnum

from redis.asyncio import Redis

from arc.core.config import Settings
from arc.core.errors import AppError
from arc.core.ratelimit import enforce_rate_limit
from arc.core.security import constant_time_equals, keyed_digest, random_numeric_code


class OtpPurpose(StrEnum):
    SIGNUP = "signup"
    LOGIN_DEVICE = "login_device"
    PASSWORD_RESET = "password_reset"


class OtpService:
    def __init__(self, redis: Redis, settings: Settings) -> None:
        self._redis = redis
        self._settings = settings

    def _key(self, purpose: OtpPurpose, email: str) -> str:
        # The address is hashed so Redis never holds emails in plain text.
        return f"otp:{purpose}:{keyed_digest(self._settings.jwt_secret, 'otp-key', email)}"

    async def throttle(self, purpose: OtpPurpose, email: str, client_ip: str) -> None:
        """Call before sending anything. Enforces the resend cooldown and the
        hourly limits per address and per IP."""
        cooldown_key = self._key(purpose, email) + ":cooldown"
        started = await self._redis.set(
            cooldown_key, "1", nx=True, ex=self._settings.otp_resend_cooldown_s
        )
        if not started:
            retry_after = max(1, await self._redis.ttl(cooldown_key))
            raise AppError(
                429,
                "OTP_COOLDOWN",
                "We just sent you a code. Please wait a moment before asking for another.",
                {"retry_after_s": retry_after},
                headers={"Retry-After": str(retry_after)},
            )
        email_key = keyed_digest(self._settings.jwt_secret, "otp-rate", email)
        await enforce_rate_limit(
            self._redis, "otp_email", email_key, self._settings.otp_max_per_email_per_hour, 3600
        )
        await enforce_rate_limit(
            self._redis, "otp_ip", client_ip, self._settings.otp_max_per_ip_per_hour, 3600
        )

    async def create(self, purpose: OtpPurpose, email: str) -> str:
        """Stores a fresh code (replacing any earlier one) and returns it for sending."""
        code = random_numeric_code(self._settings.otp_length)
        key = self._key(purpose, email)
        digest = keyed_digest(self._settings.jwt_secret, "otp-code", purpose, email, code)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.delete(key)
            pipe.hset(key, mapping={"digest": digest, "attempts": "0"})
            pipe.expire(key, self._settings.otp_ttl_s)
            await pipe.execute()
        return code

    async def discard(self, purpose: OtpPurpose, email: str) -> None:
        """Forgets the code and cooldown, e.g. when the email could not be sent."""
        key = self._key(purpose, email)
        await self._redis.delete(key, key + ":cooldown")

    async def verify(self, purpose: OtpPurpose, email: str, code: str) -> None:
        """Returns on success (and burns the code); raises otherwise."""
        key = self._key(purpose, email)
        async with self._redis.pipeline(transaction=True) as pipe:
            pipe.hget(key, "digest")
            pipe.hincrby(key, "attempts", 1)
            stored_digest, attempts = await pipe.execute()

        if stored_digest is None:
            # HINCRBY just re-created an expired key without a TTL; remove it.
            await self._redis.delete(key)
            raise AppError(400, "OTP_EXPIRED", "That code has expired. Ask for a new one.")

        max_attempts = self._settings.otp_max_attempts
        expected = keyed_digest(self._settings.jwt_secret, "otp-code", purpose, email, code)
        if attempts <= max_attempts and constant_time_equals(stored_digest, expected):
            await self._redis.delete(key)
            return

        remaining = max_attempts - attempts
        if remaining <= 0:
            await self._redis.delete(key)
            raise AppError(429, "OTP_LOCKED", "Too many wrong codes. Ask for a new one.")
        raise AppError(
            400,
            "OTP_INVALID",
            "That code didn't match.",
            {"attempts_remaining": remaining},
        )
