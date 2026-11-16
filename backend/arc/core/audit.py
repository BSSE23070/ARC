"""Security audit trail (NFR-10).

Rows record *what happened* and *to which account*, never personal data:
no email addresses, tokens, codes, IP addresses or locations.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, DateTime, Identity, String, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from arc.core.db import Base


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    # Deliberately not a foreign key: the trail must outlive account deletion.
    user_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    action: Mapped[str] = mapped_column(String(48))
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)


def record_audit(
    session: AsyncSession, action: str, user_id: uuid.UUID | None = None, **meta: Any
) -> None:
    """Adds an audit row to the caller's transaction."""
    session.add(AuditLog(action=action, user_id=user_id, meta=meta))
