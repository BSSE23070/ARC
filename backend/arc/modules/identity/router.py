"""HTTP routes for sign-up, sign-in, sessions and passwords."""

from fastapi import APIRouter, Response, status
from fastapi.responses import JSONResponse

from arc.core.deps import ClientIpDep, SettingsDep
from arc.modules.identity.deps import AuthDep, IdentityServiceDep
from arc.modules.identity.models import User
from arc.modules.identity.schemas import (
    Accepted,
    LoginChallengeResponse,
    LoginRequest,
    LoginResendRequest,
    LoginVerifyRequest,
    LogoutRequest,
    PasswordChangeRequest,
    PasswordForgotRequest,
    PasswordResetRequest,
    RefreshRequest,
    SignupCompleteRequest,
    SignupStartRequest,
    SignupVerifyRequest,
    SignupVerifyResponse,
    TokenResponse,
    UserOut,
)
from arc.modules.identity.service import LoginChallenge, TokenBundle

router = APIRouter()
auth = APIRouter(prefix="/auth", tags=["auth"])


def _user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        username=user.username,
        status=user.status,  # constrained to the allowed values by a DB check
        liveness_status="passed" if user.liveness_verified_at else "pending",
        created_at=user.created_at,
    )


def _tokens(bundle: TokenBundle) -> TokenResponse:
    return TokenResponse(
        access_token=bundle.access_token,
        refresh_token=bundle.refresh_token,
        expires_in=bundle.expires_in,
        user=_user_out(bundle.user),
    )


# --- Sign-up ------------------------------------------------------------------


@auth.post("/signup/start", status_code=status.HTTP_202_ACCEPTED, operation_id="signupStart")
async def signup_start(
    body: SignupStartRequest, service: IdentityServiceDep, ip: ClientIpDep
) -> Accepted:
    """Emails a 6-digit code. The response is the same whether or not the
    address already has an account."""
    return Accepted(resend_after_s=await service.signup_start(body.email, ip))


@auth.post("/signup/verify", operation_id="signupVerify")
async def signup_verify(
    body: SignupVerifyRequest, service: IdentityServiceDep, settings: SettingsDep
) -> SignupVerifyResponse:
    """Checks the code and returns a short-lived token for finishing sign-up."""
    token = await service.signup_verify(body.email, body.code)
    return SignupVerifyResponse(signup_token=token, expires_in=settings.signup_token_ttl_s)


@auth.post("/signup/complete", status_code=status.HTTP_201_CREATED, operation_id="signupComplete")
async def signup_complete(
    body: SignupCompleteRequest, service: IdentityServiceDep
) -> TokenResponse:
    """Creates the account (18+ only) and signs this phone in."""
    bundle = await service.signup_complete(
        body.signup_token, body.username, body.password, body.date_of_birth, body.installation_id
    )
    return _tokens(bundle)


# --- Sign-in ------------------------------------------------------------------


@auth.post(
    "/login",
    operation_id="login",
    responses={
        202: {
            "model": LoginChallengeResponse,
            "description": "New phone: an email code is required.",
        }
    },
)
async def login(body: LoginRequest, service: IdentityServiceDep, ip: ClientIpDep) -> TokenResponse:
    """Username or email plus password. On a phone the account hasn't used
    before, returns 202 and emails a code to confirm with `/auth/login/verify`."""
    result = await service.login(body.identifier, body.password, body.installation_id, ip)
    if isinstance(result, LoginChallenge):
        challenge = LoginChallengeResponse(
            challenge_token=result.challenge_token,
            email_hint=result.email_hint,
            resend_after_s=result.resend_after_s,
        )
        return JSONResponse(challenge.model_dump(), status_code=status.HTTP_202_ACCEPTED)  # type: ignore[return-value]
    return _tokens(result)


@auth.post("/login/verify", operation_id="loginVerify")
async def login_verify(body: LoginVerifyRequest, service: IdentityServiceDep) -> TokenResponse:
    """Confirms a new phone with the emailed code and signs it in."""
    return _tokens(await service.login_verify(body.challenge_token, body.code))


@auth.post("/login/resend", status_code=status.HTTP_202_ACCEPTED, operation_id="loginResend")
async def login_resend(
    body: LoginResendRequest, service: IdentityServiceDep, ip: ClientIpDep
) -> Accepted:
    """Sends the new-phone code again."""
    return Accepted(resend_after_s=await service.login_resend(body.challenge_token, ip))


# --- Sessions -----------------------------------------------------------------


@auth.post("/refresh", operation_id="refreshSession")
async def refresh(body: RefreshRequest, service: IdentityServiceDep) -> TokenResponse:
    """Swaps a refresh token for a new pair. Each refresh token works once."""
    return _tokens(await service.refresh(body.refresh_token))


@auth.post("/logout", status_code=status.HTTP_204_NO_CONTENT, operation_id="logout")
async def logout(body: LogoutRequest, service: IdentityServiceDep) -> Response:
    """Signs this phone out. Always succeeds."""
    await service.logout(body.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Passwords ----------------------------------------------------------------


@auth.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED, operation_id="passwordForgot")
async def password_forgot(
    body: PasswordForgotRequest, service: IdentityServiceDep, ip: ClientIpDep
) -> Accepted:
    """Emails a reset code if the address has an account. The response is the same either way."""
    return Accepted(resend_after_s=await service.password_forgot(body.email, ip))


@auth.post("/password/reset", status_code=status.HTTP_204_NO_CONTENT, operation_id="passwordReset")
async def password_reset(body: PasswordResetRequest, service: IdentityServiceDep) -> Response:
    """Sets a new password with the emailed code and signs every phone out."""
    await service.password_reset(body.email, body.code, body.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@auth.post(
    "/password/change", status_code=status.HTTP_204_NO_CONTENT, operation_id="passwordChange"
)
async def password_change(
    body: PasswordChangeRequest, service: IdentityServiceDep, ctx: AuthDep
) -> Response:
    """Changes the password and signs the account's other phones out."""
    await service.password_change(ctx.user, ctx.family_id, body.current_password, body.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# --- Current user -------------------------------------------------------------


@router.get("/me", tags=["me"], operation_id="getMe")
async def get_me(ctx: AuthDep) -> UserOut:
    return _user_out(ctx.user)


router.include_router(auth)
