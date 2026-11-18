"""Identity use cases: sign-up, sign-in, sessions and passwords.

Design notes:
- Responses never reveal whether an email address has an account.
- A refresh token is single-use and rotates on every refresh. Re-using an
  old one outside a short grace window signs that device out.
- Signing in from a new app installation needs an email code as well as the
  password, because later phases bind attendance-signing keys to devices.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta

from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from arc.core.audit import record_audit
from arc.core.config import Settings
from arc.core.email import EmailSender, OutgoingEmail
from arc.core.errors import AppError
from arc.core.ratelimit import enforce_rate_limit
from arc.core.security import (
    decode_token,
    encode_token,
    hash_password,
    keyed_digest,
    new_refresh_token,
    password_needs_rehash,
    sha256_hex,
    utcnow,
    verify_password,
)
from arc.modules.identity import emails
from arc.modules.identity.models import AuthSession, TrustedDevice, User
from arc.modules.identity.otp import OtpPurpose, OtpService
from arc.modules.identity.passwords import BreachChecker, validate_new_password
from arc.modules.identity.schemas import RESERVED_USERNAMES

log = logging.getLogger("arc.identity")


@dataclass(frozen=True)
class TokenBundle:
    access_token: str
    refresh_token: str
    expires_in: int
    user: User
    session_row_id: uuid.UUID


@dataclass(frozen=True)
class LoginChallenge:
    challenge_token: str
    email_hint: str
    resend_after_s: int


def revoked_family_key(family_id: uuid.UUID | str) -> str:
    return f"revoked_family:{family_id}"


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:1]}***@{domain}"


def age_on(today: date, born: date) -> int:
    return today.year - born.year - ((today.month, today.day) < (born.month, born.day))


class IdentityService:
    def __init__(
        self,
        session: AsyncSession,
        redis: Redis,
        settings: Settings,
        email_sender: EmailSender,
        breach_checker: BreachChecker,
    ) -> None:
        self._db = session
        self._redis = redis
        self._settings = settings
        self._email = email_sender
        self._breach = breach_checker
        self._otp = OtpService(redis, settings)

    # ------------------------------------------------------------------ sign-up

    async def signup_start(self, email: str, client_ip: str) -> int:
        domain = email.rsplit("@", 1)[-1]
        if domain in self._settings.blocked_email_domains:
            raise AppError(422, "EMAIL_DOMAIN_BLOCKED", "Please use a permanent email address.")

        await self._otp.throttle(OtpPurpose.SIGNUP, email, client_ip)
        if await self._user_by_email(email) is not None:
            # Same response as a new address; the owner is told by email instead.
            await self._send(emails.account_exists(email), OtpPurpose.SIGNUP)
        else:
            code = await self._otp.create(OtpPurpose.SIGNUP, email)
            await self._send(
                emails.signup_code(email, code, self._settings.otp_ttl_s), OtpPurpose.SIGNUP
            )
        return self._settings.otp_resend_cooldown_s

    async def signup_verify(self, email: str, code: str) -> str:
        await self._otp.verify(OtpPurpose.SIGNUP, email, code)
        jti = uuid.uuid4().hex
        await self._redis.set(self._signup_key(jti), "1", ex=self._settings.signup_token_ttl_s)
        return encode_token(
            self._settings.jwt_secret, "signup", email, self._settings.signup_token_ttl_s, jti=jti
        )

    async def signup_complete(
        self,
        signup_token: str,
        username: str,
        password: str,
        date_of_birth: date,
        installation_id: str,
    ) -> TokenBundle:
        expired = AppError(400, "SIGNUP_SESSION_EXPIRED", "Please verify your email again.")
        try:
            claims = decode_token(self._settings.jwt_secret, signup_token, "signup")
        except AppError as exc:
            raise expired from exc
        email: str = claims["sub"]
        signup_key = self._signup_key(claims["jti"])
        if not await self._redis.exists(signup_key):
            raise expired

        # Age gate first (FR-02): no account record is ever created for under-18s.
        underage = AppError(403, "UNDERAGE", "Arc is 18+ for now.")
        underage_key = f"underage:{keyed_digest(self._settings.jwt_secret, 'underage', email)}"
        if await self._redis.exists(underage_key):
            raise underage
        today = utcnow().date()
        if date_of_birth > today or date_of_birth.year < 1900:
            raise AppError(422, "VALIDATION_ERROR", "That date of birth isn't valid.")
        if age_on(today, date_of_birth) < self._settings.min_age_years:
            await self._redis.delete(signup_key)
            await self._redis.set(underage_key, "1", ex=self._settings.underage_block_s)
            raise underage

        await validate_new_password(
            password,
            username=username,
            email=email,
            settings=self._settings,
            breach_checker=self._breach,
        )
        taken = AppError(409, "USERNAME_TAKEN", "That username is taken. Try another.")
        if username in RESERVED_USERNAMES or await self._user_by_username(username) is not None:
            raise taken

        now = utcnow()
        user = User(
            email=email,
            username=username,
            password_hash=hash_password(password),
            date_of_birth=date_of_birth,
            email_verified_at=now,
            password_changed_at=now,
        )
        self._db.add(user)
        try:
            await self._db.flush()
        except IntegrityError as exc:
            await self._db.rollback()
            # Lost a race: decide which unique column collided.
            if await self._user_by_email(email) is not None:
                raise AppError(
                    409, "EMAIL_TAKEN", "This email already has an account. Log in instead."
                ) from exc
            raise taken from exc

        self._db.add(TrustedDevice(user_id=user.id, installation_id=installation_id))
        bundle = self._start_session(user, installation_id)
        record_audit(self._db, "signup_completed", user.id)
        await self._db.commit()
        await self._redis.delete(signup_key)
        return bundle

    # ------------------------------------------------------------------ sign-in

    async def login(
        self, identifier: str, password: str, installation_id: str, client_ip: str
    ) -> TokenBundle | LoginChallenge:
        await enforce_rate_limit(
            self._redis, "login_ip", client_ip, self._settings.login_max_per_ip_per_minute, 60
        )
        identifier = identifier.strip().lower()
        # Failures are counted per identifier (not per account), so the lockout
        # behaves the same whether or not the account exists.
        fail_key = self._login_fail_key(identifier)
        if int(await self._redis.get(fail_key) or 0) >= self._settings.login_max_failures:
            retry_after = max(1, await self._redis.ttl(fail_key))
            raise AppError(
                429,
                "ACCOUNT_LOCKED",
                "Too many wrong attempts. Try again later or reset your password.",
                {"retry_after_s": retry_after},
                headers={"Retry-After": str(retry_after)},
            )

        user = (
            await self._user_by_email(identifier)
            if "@" in identifier
            else await self._user_by_username(identifier)
        )
        usable = user is not None and user.status != "deleted"
        if not verify_password(user.password_hash if user and usable else None, password):
            async with self._redis.pipeline(transaction=True) as pipe:
                pipe.incr(fail_key)
                pipe.expire(fail_key, self._settings.login_lockout_s, nx=True)
                failures, _ = await pipe.execute()
            if user is not None:
                record_audit(self._db, "login_failed", user.id)
                await self._db.commit()
            raise AppError(
                401,
                "INVALID_CREDENTIALS",
                "That username or password isn't right.",
                {"attempts_remaining": max(0, self._settings.login_max_failures - failures)},
            )
        assert user is not None  # noqa: S101 - narrowed by verify_password above
        await self._redis.delete(fail_key)

        if user.status == "suspended":
            raise AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended.")
        if password_needs_rehash(user.password_hash):
            user.password_hash = hash_password(password)

        device = await self._trusted_device(user.id, installation_id)
        if device is not None:
            device.last_seen_at = utcnow()
            bundle = self._start_session(user, installation_id)
            record_audit(self._db, "login_succeeded", user.id)
            await self._db.commit()
            return bundle

        # Unknown installation: the password was right, now prove the email too.
        await self._db.commit()
        try:
            await self._otp.throttle(OtpPurpose.LOGIN_DEVICE, user.email, client_ip)
        except AppError as exc:
            if exc.code != "OTP_COOLDOWN":
                raise
            # A code was sent seconds ago and is still valid; don't send another.
        else:
            code = await self._otp.create(OtpPurpose.LOGIN_DEVICE, user.email)
            await self._send(
                emails.login_device_code(user.email, code, self._settings.otp_ttl_s),
                OtpPurpose.LOGIN_DEVICE,
            )
        return LoginChallenge(
            challenge_token=encode_token(
                self._settings.jwt_secret,
                "login_challenge",
                str(user.id),
                self._settings.otp_ttl_s,
                iid=installation_id,
            ),
            email_hint=mask_email(user.email),
            resend_after_s=self._settings.otp_resend_cooldown_s,
        )

    async def login_verify(self, challenge_token: str, code: str) -> TokenBundle:
        user, installation_id = await self._user_from_challenge(challenge_token)
        await self._otp.verify(OtpPurpose.LOGIN_DEVICE, user.email, code)
        if await self._trusted_device(user.id, installation_id) is None:
            self._db.add(TrustedDevice(user_id=user.id, installation_id=installation_id))
        bundle = self._start_session(user, installation_id)
        record_audit(self._db, "device_trusted", user.id)
        await self._db.commit()
        return bundle

    async def login_resend(self, challenge_token: str, client_ip: str) -> int:
        user, _ = await self._user_from_challenge(challenge_token)
        await self._otp.throttle(OtpPurpose.LOGIN_DEVICE, user.email, client_ip)
        code = await self._otp.create(OtpPurpose.LOGIN_DEVICE, user.email)
        await self._send(
            emails.login_device_code(user.email, code, self._settings.otp_ttl_s),
            OtpPurpose.LOGIN_DEVICE,
        )
        return self._settings.otp_resend_cooldown_s

    # ----------------------------------------------------------------- sessions

    async def refresh(self, refresh_token: str) -> TokenBundle:
        row = (
            await self._db.execute(
                select(AuthSession)
                .where(AuthSession.token_hash == sha256_hex(refresh_token))
                .with_for_update()
            )
        ).scalar_one_or_none()
        if row is None:
            raise AppError(401, "SESSION_REVOKED", "Please log in again.")

        now = utcnow()
        if row.revoked_at is not None:
            if row.revoke_reason == "superseded":
                # A token that lost a grace-window race is being replayed.
                await self._revoke_families([row.family_id], "reuse_detected", row.user_id)
                await self._db.commit()
            raise AppError(401, "SESSION_REVOKED", "Please log in again.")
        if row.expires_at <= now:
            raise AppError(401, "SESSION_EXPIRED", "You've been logged out. Please log in again.")

        user = await self._db.get(User, row.user_id)
        if user is None or user.status != "active":
            await self._revoke_families([row.family_id], "account_inactive", row.user_id)
            await self._db.commit()
            raise AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended.")

        if row.rotated_at is not None:
            grace = timedelta(seconds=self._settings.refresh_reuse_grace_s)
            if now - row.rotated_at > grace:
                # An old token is being re-used: assume it was stolen.
                await self._revoke_families([row.family_id], "reuse_detected", row.user_id)
                await self._db.commit()
                raise AppError(401, "SESSION_REVOKED", "Please log in again.")
            # Within the grace window the app most likely never received the
            # replacement (lost response). Retire it and issue another.
            if row.replaced_by_id is not None:
                await self._db.execute(
                    update(AuthSession)
                    .where(AuthSession.id == row.replaced_by_id, AuthSession.rotated_at.is_(None))
                    .values(revoked_at=now, revoke_reason="superseded")
                )

        bundle = self._start_session(user, row.installation_id, family_id=row.family_id)
        row.rotated_at = row.rotated_at or now
        row.replaced_by_id = bundle.session_row_id
        await self._db.commit()
        return bundle

    async def logout(self, refresh_token: str) -> None:
        row = (
            await self._db.execute(
                select(AuthSession).where(AuthSession.token_hash == sha256_hex(refresh_token))
            )
        ).scalar_one_or_none()
        if row is not None:
            await self._revoke_families([row.family_id], "logout", row.user_id)
            await self._db.commit()

    # ---------------------------------------------------------------- passwords

    async def password_forgot(self, email: str, client_ip: str) -> int:
        await self._otp.throttle(OtpPurpose.PASSWORD_RESET, email, client_ip)
        user = await self._user_by_email(email)
        if user is not None and user.status != "deleted":
            code = await self._otp.create(OtpPurpose.PASSWORD_RESET, email)
            await self._send(
                emails.password_reset_code(email, code, self._settings.otp_ttl_s),
                OtpPurpose.PASSWORD_RESET,
            )
        return self._settings.otp_resend_cooldown_s

    async def password_reset(self, email: str, code: str, new_password: str) -> None:
        user = await self._user_by_email(email)
        # Check the password rules before burning the code, so a weak password
        # doesn't force the user to request another email.
        await validate_new_password(
            new_password,
            username=user.username if user else "",
            email=email,
            settings=self._settings,
            breach_checker=self._breach,
        )
        # With no account there is no stored code, so this raises OTP_EXPIRED:
        # the same answer an unknown address and an expired code both get.
        await self._otp.verify(OtpPurpose.PASSWORD_RESET, email, code)
        if user is None or user.status == "deleted":
            raise AppError(400, "OTP_EXPIRED", "That code has expired. Ask for a new one.")

        user.password_hash = hash_password(new_password)
        user.password_changed_at = utcnow()
        await self._revoke_families(await self._family_ids(user.id), "password_reset", user.id)
        record_audit(self._db, "password_reset", user.id)
        await self._db.commit()
        await self._redis.delete(
            self._login_fail_key(user.email), self._login_fail_key(user.username)
        )
        await self._notify(emails.password_changed(user.email))

    async def password_change(
        self, user: User, current_family_id: uuid.UUID, current_password: str, new_password: str
    ) -> None:
        if not verify_password(user.password_hash, current_password):
            raise AppError(400, "CURRENT_PASSWORD_WRONG", "Your current password isn't right.")
        if current_password == new_password:
            raise AppError(
                422,
                "WEAK_PASSWORD",
                "Choose a password you haven't just used.",
                {"reason": "same_as_current"},
            )
        await validate_new_password(
            new_password,
            username=user.username,
            email=user.email,
            settings=self._settings,
            breach_checker=self._breach,
        )
        user.password_hash = hash_password(new_password)
        user.password_changed_at = utcnow()
        others = [fid for fid in await self._family_ids(user.id) if fid != current_family_id]
        await self._revoke_families(others, "password_changed", user.id)
        record_audit(self._db, "password_changed", user.id)
        await self._db.commit()
        await self._notify(emails.password_changed(user.email))

    # ------------------------------------------------------------------ helpers

    def _signup_key(self, jti: str) -> str:
        return f"signup:{jti}"

    def _login_fail_key(self, identifier: str) -> str:
        return f"login_fail:{keyed_digest(self._settings.jwt_secret, 'login', identifier)}"

    async def _user_by_email(self, email: str) -> User | None:
        return (
            await self._db.execute(select(User).where(User.email == email))
        ).scalar_one_or_none()

    async def _user_by_username(self, username: str) -> User | None:
        return (
            await self._db.execute(select(User).where(User.username == username))
        ).scalar_one_or_none()

    async def _trusted_device(
        self, user_id: uuid.UUID, installation_id: str
    ) -> TrustedDevice | None:
        return (
            await self._db.execute(
                select(TrustedDevice).where(
                    TrustedDevice.user_id == user_id,
                    TrustedDevice.installation_id == installation_id,
                )
            )
        ).scalar_one_or_none()

    async def _user_from_challenge(self, challenge_token: str) -> tuple[User, str]:
        expired = AppError(
            400, "LOGIN_CHALLENGE_EXPIRED", "That took too long. Please log in again."
        )
        try:
            claims = decode_token(self._settings.jwt_secret, challenge_token, "login_challenge")
        except AppError as exc:
            raise expired from exc
        user = await self._db.get(User, uuid.UUID(claims["sub"]))
        if user is None or user.status == "deleted":
            raise expired
        if user.status == "suspended":
            raise AppError(403, "ACCOUNT_SUSPENDED", "This account is suspended.")
        return user, str(claims["iid"])

    def _start_session(
        self, user: User, installation_id: str, family_id: uuid.UUID | None = None
    ) -> TokenBundle:
        """Adds a refresh-token row to the current transaction and signs an access token."""
        family_id = family_id or uuid.uuid4()
        row_id = uuid.uuid4()
        refresh_token = new_refresh_token()
        expires_at: datetime = utcnow() + timedelta(days=self._settings.refresh_idle_ttl_days)
        self._db.add(
            AuthSession(
                id=row_id,
                user_id=user.id,
                family_id=family_id,
                token_hash=sha256_hex(refresh_token),
                installation_id=installation_id,
                expires_at=expires_at,
            )
        )
        access_token = encode_token(
            self._settings.jwt_secret,
            "access",
            str(user.id),
            self._settings.access_token_ttl_s,
            sid=str(family_id),
        )
        return TokenBundle(
            access_token, refresh_token, self._settings.access_token_ttl_s, user, row_id
        )

    async def _family_ids(self, user_id: uuid.UUID) -> list[uuid.UUID]:
        rows = await self._db.execute(
            select(AuthSession.family_id)
            .where(AuthSession.user_id == user_id, AuthSession.revoked_at.is_(None))
            .distinct()
        )
        return list(rows.scalars())

    async def _revoke_families(
        self, family_ids: list[uuid.UUID], reason: str, user_id: uuid.UUID
    ) -> None:
        """Signs devices out: marks their refresh tokens revoked and makes
        their still-valid access tokens fail immediately."""
        if not family_ids:
            return
        await self._db.execute(
            update(AuthSession)
            .where(AuthSession.family_id.in_(family_ids), AuthSession.revoked_at.is_(None))
            .values(revoked_at=utcnow(), revoke_reason=reason)
        )
        for family_id in family_ids:
            await self._redis.set(
                revoked_family_key(family_id), "1", ex=self._settings.access_token_ttl_s
            )
        record_audit(self._db, "sessions_revoked", user_id, reason=reason, count=len(family_ids))

    async def _send(self, email: OutgoingEmail, purpose: OtpPurpose) -> None:
        """Sends an email the flow depends on. If it can't be sent, forget the
        code and cooldown so the user can retry straight away."""
        try:
            await self._email.send(email)
        except Exception as exc:
            log.exception("could not send email kind=%s", email.kind)
            await self._otp.discard(purpose, email.to)
            raise AppError(
                503,
                "EMAIL_SEND_FAILED",
                "We couldn't send the email. Please try again in a moment.",
            ) from exc

    async def _notify(self, email: OutgoingEmail) -> None:
        """Sends a courtesy notice; a failure must not undo the action it reports."""
        try:
            await self._email.send(email)
        except Exception:
            log.exception("could not send notice kind=%s", email.kind)
