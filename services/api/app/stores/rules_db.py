"""SQLAlchemy-backed rules store for the Board rules slice."""

from __future__ import annotations

import threading
import time
import uuid

from sqlalchemy import Float, Integer, String, Text, create_engine, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker

from app.database import normalize_database_url
from app.stores.rules import (
    MAX_ACTIVE_RULES,
    MAX_REASON_CHARS,
    MAX_TEXT_CHARS,
)


class Base(DeclarativeBase):
    pass


class BoardRule(Base):
    __tablename__ = "board_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    text: Mapped[str] = mapped_column(String(MAX_TEXT_CHARS), nullable=False)
    author: Mapped[str] = mapped_column(String(120), nullable=False)
    reason: Mapped[str] = mapped_column(String(MAX_REASON_CHARS), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    archived_at: Mapped[float | None] = mapped_column(Float, nullable=True)


class BoardRuleState(Base):
    __tablename__ = "board_rule_state"

    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    epoch: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    agent_sync: Mapped[str] = mapped_column(Text, nullable=False, default="")


class SqlAlchemyRuleStore:
    def __init__(self, database_url: str | Engine):
        if isinstance(database_url, Engine):
            self._engine = database_url
        else:
            url = normalize_database_url(database_url)
            if not url:
                raise ValueError("database_url is required")
            self._engine = create_engine(url, pool_pre_ping=True, future=True)
        self._sessions = sessionmaker(
            bind=self._engine,
            autoflush=False,
            expire_on_commit=False,
            future=True,
        )
        if self._engine.url.get_backend_name() == "sqlite":
            Base.metadata.create_all(self._engine)
        self._lock = threading.Lock()
        self._callbacks: list = []
        self._agent_sync: dict[str, int] = {}

    def on_change(self, callback):
        self._callbacks.append(callback)

    def _fire(self, action: str, rule: dict):
        for cb in self._callbacks:
            try:
                cb(action, rule)
            except Exception:
                pass

    def _state(self, session: Session) -> BoardRuleState:
        state = session.get(BoardRuleState, "rules")
        if state is None:
            state = BoardRuleState(key="rules", epoch=0, agent_sync="")
            session.add(state)
            session.flush()
        return state

    def _bump_epoch(self, session: Session) -> None:
        self._state(session).epoch += 1

    def _rule_dict(self, rule: BoardRule) -> dict:
        data = {
            "id": rule.id,
            "uid": rule.uid,
            "text": rule.text,
            "author": rule.author,
            "reason": rule.reason,
            "status": rule.status,
            "created_at": rule.created_at,
        }
        if rule.archived_at is not None:
            data["archived_at"] = rule.archived_at
        return data

    def list_all(self) -> list[dict]:
        with self._lock, self._sessions() as session:
            rules = session.scalars(select(BoardRule).order_by(BoardRule.id)).all()
            return [self._rule_dict(rule) for rule in rules]

    def get(self, rule_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            rule = session.get(BoardRule, rule_id)
            return self._rule_dict(rule) if rule else None

    def active_list(self) -> dict:
        with self._lock, self._sessions() as session:
            state = self._state(session)
            rules = session.scalars(
                select(BoardRule)
                .where(BoardRule.status == "active")
                .order_by(BoardRule.id)
            ).all()
            return {"epoch": state.epoch, "rules": [rule.text for rule in rules]}

    @property
    def epoch(self) -> int:
        with self._lock, self._sessions() as session:
            return self._state(session).epoch

    def propose(self, text: str, author: str, reason: str = "") -> dict | None:
        with self._lock, self._sessions() as session:
            total = session.scalar(select(func.count()).select_from(BoardRule))
            if int(total or 0) >= 50:
                return None
            rule = BoardRule(
                uid=str(uuid.uuid4()),
                text=text.strip()[:MAX_TEXT_CHARS],
                author=author.strip(),
                reason=reason.strip()[:MAX_REASON_CHARS],
                status="pending",
                created_at=time.time(),
            )
            session.add(rule)
            session.commit()
            result = self._rule_dict(rule)
        self._fire("propose", result)
        return result

    def activate(self, rule_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            active_count = session.scalar(
                select(func.count()).select_from(BoardRule).where(BoardRule.status == "active")
            )
            if int(active_count or 0) >= MAX_ACTIVE_RULES:
                return None
            rule = session.get(BoardRule, rule_id)
            if rule is None:
                return None
            rule.status = "active"
            self._bump_epoch(session)
            session.commit()
            result = self._rule_dict(rule)
        self._fire("activate", result)
        return result

    def make_draft(self, rule_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            rule = session.get(BoardRule, rule_id)
            if rule is None:
                return None
            was_active = rule.status == "active"
            rule.status = "draft"
            rule.archived_at = None
            if was_active:
                self._bump_epoch(session)
            session.commit()
            result = self._rule_dict(rule)
        self._fire("edit", result)
        return result

    def deactivate(self, rule_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            rule = session.get(BoardRule, rule_id)
            if rule is None or rule.status not in ("active", "proposed", "draft", "pending"):
                return None
            was_active = rule.status == "active"
            rule.status = "archived"
            rule.archived_at = time.time()
            if was_active:
                self._bump_epoch(session)
            session.commit()
            result = self._rule_dict(rule)
        self._fire("deactivate", result)
        return result

    def edit(self, rule_id: int, text: str | None = None, reason: str | None = None) -> dict | None:
        with self._lock, self._sessions() as session:
            rule = session.get(BoardRule, rule_id)
            if rule is None:
                return None
            was_active = rule.status == "active"
            if text is not None:
                rule.text = text.strip()[:MAX_TEXT_CHARS]
            if reason is not None:
                rule.reason = reason.strip()[:MAX_REASON_CHARS]
            if was_active:
                self._bump_epoch(session)
            session.commit()
            result = self._rule_dict(rule)
        self._fire("edit", result)
        return result

    def delete(self, rule_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            rule = session.get(BoardRule, rule_id)
            if rule is None:
                return None
            was_active = rule.status == "active"
            result = self._rule_dict(rule)
            session.delete(rule)
            if was_active:
                self._bump_epoch(session)
            session.commit()
        self._fire("delete", result)
        return result

    def set_remind(self):
        with self._lock, self._sessions() as session:
            self._bump_epoch(session)
            session.commit()

    def clear_remind(self):
        pass

    def report_agent_sync(self, agent_name: str, epoch: int):
        with self._lock:
            self._agent_sync[agent_name] = epoch

    def agent_freshness(self) -> dict:
        with self._lock:
            current = self.epoch
            result = {}
            for name, last_epoch in self._agent_sync.items():
                status = "fresh" if last_epoch >= current else "stale"
                result[name] = {"last_epoch": last_epoch, "status": status}
            return {"epoch": current, "agents": result}

    def count_active(self) -> int:
        with self._lock, self._sessions() as session:
            return int(session.scalar(
                select(func.count()).select_from(BoardRule).where(BoardRule.status == "active")
            ) or 0)

    def count_draft(self) -> int:
        with self._lock, self._sessions() as session:
            return int(session.scalar(
                select(func.count()).select_from(BoardRule).where(BoardRule.status == "draft")
            ) or 0)

    def count_proposed(self) -> int:
        return self.count_draft()
