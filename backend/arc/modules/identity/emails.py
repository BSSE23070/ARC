"""The emails the identity module sends. Plain text, short, no tracking."""

from arc.core.email import OutgoingEmail

_FOOTER = "\n\nIf this wasn't you, you can ignore this email.\n\nArc"


def _minutes(seconds: int) -> int:
    return max(1, seconds // 60)


def signup_code(to: str, code: str, ttl_s: int) -> OutgoingEmail:
    return OutgoingEmail(
        to=to,
        subject=f"{code} is your Arc code",
        text=f"Your Arc sign-up code is {code}. It expires in {_minutes(ttl_s)} minutes.{_FOOTER}",
        kind="signup_code",
    )


def account_exists(to: str) -> OutgoingEmail:
    return OutgoingEmail(
        to=to,
        subject="You already have an Arc account",
        text=(
            "Someone tried to sign up for Arc with this email address, but it already has an account.\n\n"
            "If that was you, open the app and log in. If you've forgotten your password, "
            'tap "Forgot password" on the log-in screen.' + _FOOTER
        ),
        kind="account_exists",
    )


def login_device_code(to: str, code: str, ttl_s: int) -> OutgoingEmail:
    return OutgoingEmail(
        to=to,
        subject=f"{code} is your Arc log-in code",
        text=(
            f"Your Arc code for logging in on a new phone is {code}. "
            f"It expires in {_minutes(ttl_s)} minutes.\n\n"
            "If you didn't just try to log in, someone else knows your password: "
            "change it in the app under Profile." + "\n\nArc"
        ),
        kind="login_device_code",
    )


def password_reset_code(to: str, code: str, ttl_s: int) -> OutgoingEmail:
    return OutgoingEmail(
        to=to,
        subject=f"{code} is your Arc password reset code",
        text=f"Your Arc password reset code is {code}. It expires in {_minutes(ttl_s)} minutes.{_FOOTER}",
        kind="password_reset_code",
    )


def password_changed(to: str) -> OutgoingEmail:
    return OutgoingEmail(
        to=to,
        subject="Your Arc password was changed",
        text=(
            "Your Arc password was just changed, and your other phones were logged out.\n\n"
            "If you didn't do this, reset your password now from the log-in screen.\n\nArc"
        ),
        kind="password_changed",
    )
