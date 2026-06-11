"""Shared SQLAlchemy declarative base for kai-chattr API-owned persistence.

All ORM models register on this single ``Base.metadata`` so Alembic sees one
schema. Historically the base lived in ``app.stores.rules_db``; it was relocated
here so foundation models (identity/workspace/chat) do not have to import from a
board-rules module. ``rules_db`` re-exports ``Base`` for backwards compatibility.
"""

from __future__ import annotations

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
