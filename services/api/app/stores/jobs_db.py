"""SQLAlchemy-backed workflow store for the Board jobs slice."""

from __future__ import annotations

import json
import threading
import time
import uuid

from sqlalchemy import (
    Boolean,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    select,
)
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, Session, mapped_column, relationship, selectinload, sessionmaker

from app.database import create_database_engine, normalize_database_url
from app.stores.rules_db import Base

MAX_TITLE_CHARS = 120
MAX_BODY_CHARS = 1000
MAX_WORKFLOW_TYPE_CHARS = 40
MAX_CHANNEL_CHARS = 80
MAX_ACTOR_CHARS = 120
CANONICAL_STATUSES = ("todo", "active", "closed")
LEGACY_STATUS_ALIASES = {
    "open": "todo",
    "done": "active",
    "archived": "closed",
}
VALID_WORKFLOW_STATUSES = CANONICAL_STATUSES + tuple(LEGACY_STATUS_ALIASES)


def normalize_status(status: str | None) -> str | None:
    value = (status or "").strip().lower()
    if value in CANONICAL_STATUSES:
        return value
    return LEGACY_STATUS_ALIASES.get(value)


def _coerce_archived(value) -> bool:
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on", "archived"}
    return bool(value)


def normalize_status_archived(
    status: str | None,
    archived=None,
    current_archived: bool = False,
    default_status: str = "todo",
) -> tuple[str, bool]:
    raw_status = (status or "").strip().lower()
    normalized = normalize_status(raw_status) or default_status
    if archived is None:
        next_archived = True if raw_status == "archived" else bool(current_archived)
    else:
        next_archived = _coerce_archived(archived)
    return normalized, next_archived


class BoardWorkflow(Base):
    __tablename__ = "board_workflows"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    type: Mapped[str] = mapped_column(String(MAX_WORKFLOW_TYPE_CHARS), nullable=False)
    title: Mapped[str] = mapped_column(String(MAX_TITLE_CHARS), nullable=False)
    body: Mapped[str] = mapped_column(String(MAX_BODY_CHARS), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    archived: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    channel: Mapped[str] = mapped_column(String(MAX_CHANNEL_CHARS), nullable=False)
    created_by: Mapped[str] = mapped_column(String(MAX_ACTOR_CHARS), nullable=False)
    assignee: Mapped[str] = mapped_column(String(MAX_ACTOR_CHARS), nullable=False, default="")
    anchor_msg_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[float] = mapped_column(Float, nullable=False)
    updated_at: Mapped[float] = mapped_column(Float, nullable=False)

    messages: Mapped[list["BoardWorkflowMessage"]] = relationship(
        back_populates="workflow",
        cascade="all, delete-orphan",
        order_by="BoardWorkflowMessage.message_index",
    )


class BoardWorkflowMessage(Base):
    __tablename__ = "board_workflow_messages"
    __table_args__ = (
        UniqueConstraint("workflow_id", "message_index", name="uq_board_workflow_messages_index"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    workflow_id: Mapped[int] = mapped_column(
        ForeignKey("board_workflows.id", ondelete="CASCADE"),
        nullable=False,
    )
    message_index: Mapped[int] = mapped_column(Integer, nullable=False)
    uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    sender: Mapped[str] = mapped_column(String(MAX_ACTOR_CHARS), nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    time: Mapped[str] = mapped_column(String(16), nullable=False)
    timestamp: Mapped[float] = mapped_column(Float, nullable=False)
    msg_type: Mapped[str] = mapped_column(String(40), nullable=False, default="chat")
    attachments_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    resolved: Mapped[str | None] = mapped_column(String(32), nullable=True)
    updated_at: Mapped[float | None] = mapped_column(Float, nullable=True)

    workflow: Mapped[BoardWorkflow] = relationship(back_populates="messages")


class SqlAlchemyJobStore:
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
        self._callbacks: list = []

    def on_change(self, callback):
        self._callbacks.append(callback)

    def _fire(self, action: str, job: dict):
        for cb in self._callbacks:
            try:
                cb(action, job)
            except Exception:
                pass

    def _next_sort_order_locked(self, session: Session, status: str, exclude_id: int | None = None) -> int:
        normalized = normalize_status(status) or "todo"
        stmt = select(func.max(BoardWorkflow.sort_order)).where(BoardWorkflow.status == normalized)
        if exclude_id is not None:
            stmt = stmt.where(BoardWorkflow.id != exclude_id)
        max_order = session.scalar(stmt)
        return int(max_order or 0) + 1

    def _message_dict(self, message: BoardWorkflowMessage, job_id: int | None = None) -> dict:
        try:
            attachments = json.loads(message.attachments_json or "[]")
        except json.JSONDecodeError:
            attachments = []
        data = {
            "id": message.message_index,
            "uid": message.uid,
            "sender": message.sender,
            "text": message.text,
            "time": message.time,
            "timestamp": message.timestamp,
            "attachments": attachments if isinstance(attachments, list) else [],
        }
        if message.msg_type != "chat":
            data["type"] = message.msg_type
        if message.deleted:
            data["deleted"] = True
        if message.resolved:
            data["resolved"] = message.resolved
        if message.updated_at is not None:
            data["updated_at"] = message.updated_at
        if job_id is not None:
            data["job_id"] = job_id
        return data

    def _workflow_dict(self, workflow: BoardWorkflow) -> dict:
        status, archived = normalize_status_archived(
            workflow.status,
            getattr(workflow, "archived", False),
        )
        return {
            "id": workflow.id,
            "uid": workflow.uid,
            "type": workflow.type,
            "title": workflow.title,
            "body": workflow.body,
            "status": status,
            "archived": archived,
            "channel": workflow.channel,
            "created_by": workflow.created_by,
            "assignee": workflow.assignee,
            "anchor_msg_id": workflow.anchor_msg_id,
            "messages": [self._message_dict(message) for message in workflow.messages],
            "created_at": workflow.created_at,
            "updated_at": workflow.updated_at,
            "sort_order": workflow.sort_order,
        }

    def list_all(self, channel: str | None = None, status: str | None = None) -> list[dict]:
        with self._lock, self._sessions() as session:
            stmt = (
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .order_by(BoardWorkflow.id)
            )
            if channel:
                stmt = stmt.where(BoardWorkflow.channel == channel)
            if status:
                raw_status = status.strip().lower()
                normalized = normalize_status(raw_status)
                if normalized is None:
                    return []
                stmt = stmt.where(BoardWorkflow.status == normalized)
                if raw_status == "archived":
                    stmt = stmt.where(BoardWorkflow.archived.is_(True))
            workflows = session.scalars(stmt).all()
            return [self._workflow_dict(workflow) for workflow in workflows]

    def get(self, job_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.scalar(
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .where(BoardWorkflow.id == job_id)
            )
            return self._workflow_dict(workflow) if workflow else None

    def create(
        self,
        title: str,
        job_type: str,
        channel: str,
        created_by: str,
        anchor_msg_id: int | None = None,
        assignee: str | None = None,
        body: str | None = None,
        uid: str | None = None,
        status: str | None = None,
        created_at: float | None = None,
        updated_at: float | None = None,
        archived: bool | None = None,
    ) -> dict:
        with self._lock, self._sessions() as session:
            st, is_archived = normalize_status_archived(status, archived)
            now = time.time()
            workflow = BoardWorkflow(
                uid=uid or str(uuid.uuid4()),
                type=(job_type or "job").strip()[:MAX_WORKFLOW_TYPE_CHARS],
                title=title.strip()[:MAX_TITLE_CHARS],
                body=(body or "").strip()[:MAX_BODY_CHARS],
                status=st,
                archived=is_archived,
                channel=(channel or "general").strip()[:MAX_CHANNEL_CHARS],
                created_by=(created_by or "user").strip()[:MAX_ACTOR_CHARS],
                assignee=(assignee or "").strip()[:MAX_ACTOR_CHARS],
                anchor_msg_id=anchor_msg_id,
                created_at=created_at or now,
                updated_at=updated_at or now,
                sort_order=self._next_sort_order_locked(session, st),
            )
            session.add(workflow)
            session.commit()
            session.refresh(workflow)
            result = self._workflow_dict(workflow)
        self._fire("create", result)
        return result

    def update_status(self, job_id: int, status: str, archived: bool | None = None) -> dict | None:
        normalized = normalize_status(status)
        if normalized is None:
            return None
        with self._lock, self._sessions() as session:
            workflow = session.scalar(
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .where(BoardWorkflow.id == job_id)
            )
            if workflow is None:
                return None
            next_status, next_archived = normalize_status_archived(
                status,
                archived,
                current_archived=workflow.archived,
            )
            if workflow.status != next_status:
                workflow.sort_order = self._next_sort_order_locked(session, next_status, exclude_id=job_id)
            workflow.status = next_status
            workflow.archived = next_archived
            workflow.updated_at = time.time()
            session.commit()
            result = self._workflow_dict(workflow)
        self._fire("update", result)
        return result

    def update_archived(self, job_id: int, archived: bool) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.scalar(
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .where(BoardWorkflow.id == job_id)
            )
            if workflow is None:
                return None
            workflow.archived = _coerce_archived(archived)
            workflow.updated_at = time.time()
            session.commit()
            result = self._workflow_dict(workflow)
        self._fire("update", result)
        return result

    def update_title(self, job_id: int, title: str) -> dict | None:
        return self._update_fields(job_id, title=title.strip()[:MAX_TITLE_CHARS])

    def update_assignee(self, job_id: int, assignee: str) -> dict | None:
        return self._update_fields(job_id, assignee=assignee.strip()[:MAX_ACTOR_CHARS])

    def _update_fields(self, job_id: int, **fields: str) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.scalar(
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .where(BoardWorkflow.id == job_id)
            )
            if workflow is None:
                return None
            for key, value in fields.items():
                setattr(workflow, key, value)
            workflow.updated_at = time.time()
            session.commit()
            result = self._workflow_dict(workflow)
        self._fire("update", result)
        return result

    def add_message(
        self,
        job_id: int,
        sender: str,
        text: str,
        attachments: list | None = None,
        msg_type: str = "chat",
        uid: str | None = None,
        timestamp: float | None = None,
        time_str: str | None = None,
    ) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.get(BoardWorkflow, job_id)
            if workflow is None:
                return None
            next_index = int(
                session.scalar(
                    select(func.max(BoardWorkflowMessage.message_index))
                    .where(BoardWorkflowMessage.workflow_id == job_id)
                )
                or -1
            ) + 1
            ts = timestamp if timestamp is not None else time.time()
            message = BoardWorkflowMessage(
                workflow_id=job_id,
                message_index=next_index,
                uid=uid or str(uuid.uuid4()),
                sender=(sender or "user").strip()[:MAX_ACTOR_CHARS],
                text=text.strip(),
                time=time_str or time.strftime("%H:%M:%S"),
                timestamp=ts,
                msg_type=(msg_type or "chat").strip()[:40],
                attachments_json=json.dumps(attachments or [], ensure_ascii=False),
            )
            workflow.updated_at = time.time()
            session.add(message)
            session.commit()
            result_msg = self._message_dict(message, job_id=job_id)
        self._fire("message", {"job_id": job_id, "message": result_msg})
        return result_msg

    def get_messages(self, job_id: int) -> list[dict] | None:
        with self._lock, self._sessions() as session:
            if session.get(BoardWorkflow, job_id) is None:
                return None
            messages = session.scalars(
                select(BoardWorkflowMessage)
                .where(BoardWorkflowMessage.workflow_id == job_id)
                .order_by(BoardWorkflowMessage.message_index)
            ).all()
            return [self._message_dict(message) for message in messages]

    def delete_message(self, job_id: int, msg_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.get(BoardWorkflow, job_id)
            if workflow is None:
                return None
            message = session.scalar(
                select(BoardWorkflowMessage)
                .where(BoardWorkflowMessage.workflow_id == job_id)
                .where(BoardWorkflowMessage.message_index == msg_id)
            )
            if message is None:
                return None
            if not message.deleted:
                message.deleted = True
                message.text = ""
                message.attachments_json = "[]"
                message.updated_at = time.time()
                workflow.updated_at = time.time()
                session.commit()
            payload = {"job_id": job_id, "message_id": msg_id}
        self._fire("message_delete", payload)
        return payload

    def resolve_message(self, job_id: int, msg_index: int, resolution: str) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.get(BoardWorkflow, job_id)
            if workflow is None:
                return None
            message = session.scalar(
                select(BoardWorkflowMessage)
                .where(BoardWorkflowMessage.workflow_id == job_id)
                .where(BoardWorkflowMessage.message_index == msg_index)
            )
            if message is None:
                return None
            message.resolved = resolution.strip()[:32] or "dismissed"
            message.updated_at = time.time()
            workflow.updated_at = time.time()
            session.commit()
            result = self._message_dict(message, job_id=job_id)
        self._fire("message", {"job_id": job_id, "message": result})
        return result

    def delete(self, job_id: int) -> dict | None:
        with self._lock, self._sessions() as session:
            workflow = session.scalar(
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .where(BoardWorkflow.id == job_id)
            )
            if workflow is None:
                return None
            result = self._workflow_dict(workflow)
            session.delete(workflow)
            session.commit()
        self._fire("delete", result)
        return result

    def reorder(self, status: str, ordered_ids: list[int]) -> list[dict]:
        normalized = normalize_status(status)
        if normalized is None:
            return []
        with self._lock, self._sessions() as session:
            workflows = session.scalars(
                select(BoardWorkflow)
                .options(selectinload(BoardWorkflow.messages))
                .where(BoardWorkflow.status == normalized)
                .order_by(BoardWorkflow.sort_order.desc(), BoardWorkflow.updated_at.desc())
            ).all()
            if not workflows:
                return []
            by_id = {workflow.id: workflow for workflow in workflows}
            ordered: list[int] = []
            seen = set()
            for raw in ordered_ids:
                try:
                    item_id = int(raw)
                except (TypeError, ValueError):
                    continue
                if item_id in by_id and item_id not in seen:
                    ordered.append(item_id)
                    seen.add(item_id)
            if not ordered:
                return []
            for workflow in workflows:
                if workflow.id not in seen:
                    ordered.append(workflow.id)
            changed: list[dict] = []
            total = len(ordered)
            for index, workflow_id in enumerate(ordered):
                workflow = by_id.get(workflow_id)
                if workflow is None:
                    continue
                next_order = total - index
                if workflow.sort_order != next_order:
                    workflow.sort_order = next_order
                    workflow.updated_at = time.time()
                    changed.append(self._workflow_dict(workflow))
            if changed:
                session.commit()
        for item in changed:
            self._fire("update", item)
        return changed
