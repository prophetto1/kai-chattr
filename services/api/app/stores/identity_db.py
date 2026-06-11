"""SQLAlchemy-backed identity, workspace, and chat-session foundation store."""

from __future__ import annotations

import secrets
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker

from app.database import create_database_engine, normalize_database_url
from app.stores.base import Base


def _now() -> datetime:
    return datetime.now(UTC)


def _new_public_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_urlsafe(12).replace('-', '').replace('_', '')}"


def _new_session_hash() -> str:
    return f"sess_{secrets.token_urlsafe(18).replace('-', '').replace('_', '')}"


def _normalize_email(email: str) -> str:
    return str(email or "").strip().lower()


def _to_uuid(value: str | uuid.UUID) -> uuid.UUID:
    return value if isinstance(value, uuid.UUID) else uuid.UUID(str(value))


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    email_normalized: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False, default="")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )


class AuthCredential(Base):
    __tablename__ = "auth_credentials"
    __table_args__ = (
        UniqueConstraint("provider", "email_normalized", name="uq_auth_credentials_provider_email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    email_normalized: Mapped[str] = mapped_column(String(320), nullable=False)
    password_hash: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )


class AuthSession(Base):
    __tablename__ = "auth_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    session_token_hash: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )


class Workspace(Base):
    __tablename__ = "workspaces"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    public_id: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(240), nullable=False)
    tier: Mapped[str] = mapped_column(String(40), nullable=False, default="free")
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )


class WorkspaceMembership(Base):
    __tablename__ = "workspace_memberships"
    __table_args__ = (
        UniqueConstraint("workspace_id", "user_id", name="uq_workspace_memberships_workspace_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    session_hash: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
    )
    title: Mapped[str | None] = mapped_column(String(240), nullable=True)
    mode: Mapped[str] = mapped_column(String(40), nullable=False, default="scratch")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        onupdate=_now,
    )
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    chat_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


class SqlAlchemyIdentityStore:
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

    def create_user(self, *, email: str, display_name: str) -> dict[str, Any]:
        user = User(
            email_normalized=_normalize_email(email),
            display_name=str(display_name or "").strip(),
            status="active",
        )
        with self._lock, self._sessions() as session:
            session.add(user)
            session.commit()
            return self._user_dict(user)

    def create_workspace(
        self,
        *,
        name: str,
        created_by_user_id: str | uuid.UUID,
        public_id: str | None = None,
        tier: str = "free",
    ) -> dict[str, Any]:
        workspace = Workspace(
            public_id=(public_id or _new_public_id("wsp")).strip(),
            name=str(name or "").strip(),
            tier=(tier or "free").strip(),
            created_by_user_id=_to_uuid(created_by_user_id),
            status="active",
        )
        with self._lock, self._sessions() as session:
            session.add(workspace)
            session.commit()
            return self._workspace_dict(workspace)

    def add_membership(
        self,
        *,
        workspace_id: str | uuid.UUID,
        user_id: str | uuid.UUID,
        role: str,
    ) -> dict[str, Any]:
        membership = WorkspaceMembership(
            workspace_id=_to_uuid(workspace_id),
            user_id=_to_uuid(user_id),
            role=str(role or "").strip(),
            status="active",
        )
        with self._lock, self._sessions() as session:
            session.add(membership)
            session.commit()
            return self._membership_dict(membership)

    def create_chat_session(
        self,
        *,
        workspace_id: str | uuid.UUID,
        created_by_user_id: str | uuid.UUID,
        title: str | None,
        mode: str,
    ) -> dict[str, Any]:
        chat_session = ChatSession(
            session_hash=_new_session_hash(),
            workspace_id=_to_uuid(workspace_id),
            created_by_user_id=_to_uuid(created_by_user_id),
            title=title,
            mode=(mode or "scratch").strip(),
            status="active",
        )
        with self._lock, self._sessions() as session:
            session.add(chat_session)
            session.commit()
            return self._chat_session_dict(chat_session)

    def append_message(
        self,
        *,
        chat_session_id: str | uuid.UUID,
        role: str,
        content: str,
        author_user_id: str | uuid.UUID | None = None,
    ) -> dict[str, Any]:
        message = ChatMessage(
            chat_session_id=_to_uuid(chat_session_id),
            role=str(role or "").strip(),
            content=str(content or ""),
            author_user_id=_to_uuid(author_user_id) if author_user_id is not None else None,
        )
        with self._lock, self._sessions() as session:
            session.add(message)
            session.commit()
            return self._message_dict(message)

    def list_messages(self, chat_session_id: str | uuid.UUID) -> list[dict[str, Any]]:
        with self._lock, self._sessions() as session:
            messages = session.scalars(
                select(ChatMessage)
                .where(ChatMessage.chat_session_id == _to_uuid(chat_session_id))
                .order_by(ChatMessage.created_at, ChatMessage.id)
            ).all()
            return [self._message_dict(message) for message in messages]

    def add_password_credential(
        self,
        *,
        user_id: str | uuid.UUID,
        email_normalized: str,
        password_hash: str,
    ) -> dict[str, Any]:
        credential = AuthCredential(
            user_id=_to_uuid(user_id),
            provider="password",
            email_normalized=_normalize_email(email_normalized),
            password_hash=password_hash,
        )
        with self._lock, self._sessions() as session:
            session.add(credential)
            session.commit()
            return self._credential_dict(credential)

    def _user_dict(self, user: User) -> dict[str, Any]:
        return {
            "id": str(user.id),
            "email_normalized": user.email_normalized,
            "display_name": user.display_name,
            "status": user.status,
            "created_at": user.created_at.isoformat(),
            "updated_at": user.updated_at.isoformat(),
        }

    def _workspace_dict(self, workspace: Workspace) -> dict[str, Any]:
        return {
            "id": str(workspace.id),
            "public_id": workspace.public_id,
            "name": workspace.name,
            "tier": workspace.tier,
            "created_by_user_id": str(workspace.created_by_user_id),
            "status": workspace.status,
        }

    def _membership_dict(self, membership: WorkspaceMembership) -> dict[str, Any]:
        return {
            "id": str(membership.id),
            "workspace_id": str(membership.workspace_id),
            "user_id": str(membership.user_id),
            "role": membership.role,
            "status": membership.status,
        }

    def _chat_session_dict(self, chat_session: ChatSession) -> dict[str, Any]:
        return {
            "id": str(chat_session.id),
            "session_hash": chat_session.session_hash,
            "workspace_id": str(chat_session.workspace_id),
            "created_by_user_id": str(chat_session.created_by_user_id),
            "title": chat_session.title,
            "mode": chat_session.mode,
            "status": chat_session.status,
            "created_at": chat_session.created_at.isoformat(),
            "updated_at": chat_session.updated_at.isoformat(),
            "archived_at": chat_session.archived_at.isoformat()
            if chat_session.archived_at is not None
            else None,
        }

    def _message_dict(self, message: ChatMessage) -> dict[str, Any]:
        return {
            "id": str(message.id),
            "chat_session_id": str(message.chat_session_id),
            "role": message.role,
            "content": message.content,
            "author_user_id": str(message.author_user_id) if message.author_user_id else None,
            "created_at": message.created_at.isoformat(),
        }

    def _credential_dict(self, credential: AuthCredential) -> dict[str, Any]:
        return {
            "id": str(credential.id),
            "user_id": str(credential.user_id),
            "provider": credential.provider,
            "email_normalized": credential.email_normalized,
            "password_hash": credential.password_hash,
            "created_at": credential.created_at.isoformat(),
            "updated_at": credential.updated_at.isoformat(),
        }
