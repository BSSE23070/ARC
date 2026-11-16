"""Outgoing email behind one small interface.

The rest of the code only knows ``EmailSender``. Swapping providers (or
adding WhatsApp/SMS codes later) means adding one class here, nothing else.
"""

import logging
from dataclasses import dataclass
from email.message import EmailMessage
from typing import Protocol

import aiosmtplib

from arc.core.config import Settings

log = logging.getLogger("arc.email")


@dataclass(frozen=True)
class OutgoingEmail:
    to: str
    subject: str
    text: str
    kind: str  # e.g. "signup_code"; used for logs and tests, never shown to users


class EmailSender(Protocol):
    async def send(self, email: OutgoingEmail) -> None: ...


class ConsoleEmailSender:
    """Development only: prints the email to the API log so you can read the code."""

    async def send(self, email: OutgoingEmail) -> None:
        log.warning("[dev email] to=%s subject=%r\n%s", email.to, email.subject, email.text)


class SmtpEmailSender:
    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    async def send(self, email: OutgoingEmail) -> None:
        message = EmailMessage()
        message["From"] = self._settings.email_from
        message["To"] = email.to
        message["Subject"] = email.subject
        message.set_content(email.text)
        await aiosmtplib.send(
            message,
            hostname=self._settings.smtp_host,
            port=self._settings.smtp_port,
            username=self._settings.smtp_username,
            password=self._settings.smtp_password,
            start_tls=self._settings.smtp_starttls,
            timeout=10,
        )
        # Log that we sent it, never the address or the content.
        log.info("email sent kind=%s", email.kind)


def build_email_sender(settings: Settings) -> EmailSender:
    if settings.email_backend == "smtp":
        return SmtpEmailSender(settings)
    return ConsoleEmailSender()
