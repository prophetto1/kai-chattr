"""SQLAlchemy-backed routing decision store.

Targets are durable dispatch facts. Mentions are retained as metadata so a
mention can explain a route without becoming the routing system itself.
"""

from __future__ import annotations

import json
import threading
import time
import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import Float, ForeignKey, Integer, String, Text, UniqueConstraint, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column, relationship, selectinload, sessionmaker

from app.database import create_database_engine, normalize_database_url
from app.stores.rules_db import Base

MAX_CHANNEL_CHARS = 80
MAX_ACTOR_CHARS = 120
MAX_TARGET_CHARS = 120
MAX_SOURCE_CHARS = 40
MAX_REASON_CHARS = 240
MAX_SESSION_CHARS = 120


class RoutingDecision(Base):
    __tablename__ = "routing_decisions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    channel: Mapped[str] = mapped_column(String(MAX_CHANNEL_CHARS), nullable=False)
    message_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sender: Mapped[str] = mapped_column(String(MAX_ACTOR_CHARS), nullable=False)
    source: Mapped[str] = mapped_column(String(MAX_SOURCE_CHARS), nullable=False)
    reason: Mapped[str] = mapped_column(String(MAX_REASON_CHARS), nullable=False, default="")
    session_id: Mapped[str | None] = mapped_column(String(MAX_SESSION_CHARS), nullable=True)
    workflow_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[float] = mapped_column(Float, nullable=False)

    targets: Mapped[list["RoutingDecisionTarget"]] = relationship(
        back_populates="decision",
        cascade="all, delete-orphan",
        order_by="RoutingDecisionTarget.route_order",
    )
    mentions: Mapped[list["RoutingDecisionMention"]] = relationship(
        back_populates="decision",
        cascade="all, delete-orphan",
        order_by="RoutingDecisionMention.mention_order",
    )


class RoutingDecisionTarget(Base):
    __tablename__ = "routing_decision_targets"
    __table_args__ = (
        UniqueConstraint("decision_id", "target", name="uq_routing_decision_targets_target"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("routing_decisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    target: Mapped[str] = mapped_column(String(MAX_TARGET_CHARS), nullable=False)
    route_order: Mapped[int] = mapped_column(Integer, nullable=False)

    decision: Mapped[RoutingDecision] = relationship(back_populates="targets")


class RoutingDecisionMention(Base):
    __tablename__ = "routing_decision_mentions"
    __table_args__ = (
        UniqueConstraint("decision_id", "mention", name="uq_routing_decision_mentions_mention"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    decision_id: Mapped[int] = mapped_column(
        ForeignKey("routing_decisions.id", ondelete="CASCADE"),
        nullable=False,
    )
    mention: Mapped[str] = mapped_column(String(MAX_TARGET_CHARS), nullable=False)
    mention_order: Mapped[int] = mapped_column(Integer, nullable=False)

    decision: Mapped[RoutingDecision] = relationship(back_populates="mentions")


class SqlAlchemyRoutingDecisionStore:
    def __init__(self, database_url: str | Engine):
        if isinstance(database_url, Engine):
            self._engine = database_url
        else:
            url = normalize_database_url(database_url)
            if not url:
                raise ValueError("database_url is required")
            self._engine = create_database_engine(url)
        self._sessions = sessionmaker(
            bind=self._engine,
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
        if self._engine.url.get_backend_name() == "sqlite":
            Base.metadata.create_all(self._engine)
        self._lock = threading.Lock()

    def record_decision(
        self,
        *,
        channel: str,
        message_id: int | None,
        sender: str,
        targets: Sequence[str],
        source: str,
        reason: str = "",
        mentions: Sequence[str] | None = None,
        session_id: str | None = None,
        workflow_id: int | None = None,
        metadata: dict[str, Any] | None = None,
        uid: str | None = None,
        created_at: float | None = None,
    ) -> dict[str, Any]:
        cleaned_targets = _clean_ordered_strings(targets, MAX_TARGET_CHARS)
        if not cleaned_targets:
            raise ValueError("routing decisions require at least one target")
        cleaned_mentions = _clean_ordered_strings(mentions or (), MAX_TARGET_CHARS)
        now = time.time() if created_at is None else created_at

        decision = RoutingDecision(
            uid=uid or str(uuid.uuid4()),
            channel=_clean_string(channel or "general", MAX_CHANNEL_CHARS),
            message_id=message_id,
            sender=_clean_string(sender or "system", MAX_ACTOR_CHARS),
            source=_clean_string(source or "manual", MAX_SOURCE_CHARS),
            reason=_clean_string(reason, MAX_REASON_CHARS),
            session_id=_clean_optional_string(session_id, MAX_SESSION_CHARS),
            workflow_id=workflow_id,
            metadata_json=json.dumps(metadata or {}, sort_keys=True),
            created_at=now,
            targets=[
                RoutingDecisionTarget(target=target, route_order=index)
                for index, target in enumerate(cleaned_targets)
            ],
            mentions=[
                RoutingDecisionMention(mention=mention, mention_order=index)
                for index, mention in enumerate(cleaned_mentions)
            ],
        )
        with self._lock, self._sessions() as session:
            session.add(decision)
            session.commit()
            result = self._decision_dict(decision)
        return result

    def get(self, uid: str) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            decision = session.scalar(
                select(RoutingDecision)
                .options(
                    selectinload(RoutingDecision.targets),
                    selectinload(RoutingDecision.mentions),
                )
                .where(RoutingDecision.uid == uid)
            )
            return self._decision_dict(decision) if decision else None

    def list_recent(
        self,
        *,
        channel: str | None = None,
        target: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        with self._lock, self._sessions() as session:
            stmt = select(RoutingDecision).options(
                selectinload(RoutingDecision.targets),
                selectinload(RoutingDecision.mentions),
            )
            if channel:
                stmt = stmt.where(RoutingDecision.channel == _clean_string(channel, MAX_CHANNEL_CHARS))
            if target:
                stmt = stmt.join(RoutingDecisionTarget).where(
                    RoutingDecisionTarget.target == _clean_string(target, MAX_TARGET_CHARS)
                )
            stmt = stmt.order_by(RoutingDecision.created_at.desc(), RoutingDecision.id.desc()).limit(
                max(1, min(int(limit), 200))
            )
            decisions = session.scalars(stmt).all()
            return [self._decision_dict(decision) for decision in decisions]

    def _decision_dict(self, decision: RoutingDecision) -> dict[str, Any]:
        try:
            metadata = json.loads(decision.metadata_json or "{}")
        except json.JSONDecodeError:
            metadata = {}
        if not isinstance(metadata, dict):
            metadata = {}
        return {
            "id": decision.id,
            "uid": decision.uid,
            "channel": decision.channel,
            "message_id": decision.message_id,
            "sender": decision.sender,
            "targets": [target.target for target in decision.targets],
            "source": decision.source,
            "reason": decision.reason,
            "mentions": [mention.mention for mention in decision.mentions],
            "session_id": decision.session_id,
            "workflow_id": decision.workflow_id,
            "metadata": metadata,
            "created_at": decision.created_at,
        }


def _clean_string(value: str, max_chars: int) -> str:
    return str(value or "").strip()[:max_chars]


def _clean_optional_string(value: str | None, max_chars: int) -> str | None:
    cleaned = _clean_string(value or "", max_chars)
    return cleaned or None


def _clean_ordered_strings(values: Sequence[str], max_chars: int) -> list[str]:
    cleaned: list[str] = []
    seen: set[str] = set()
    for value in values:
        item = _clean_string(value, max_chars)
        if not item or item in seen:
            continue
        seen.add(item)
        cleaned.append(item)
    return cleaned
