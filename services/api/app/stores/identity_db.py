"""SQLAlchemy-backed identity, workspace, and chat-session foundation store."""

from __future__ import annotations

import secrets
import threading
import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid, func, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column, sessionmaker

from app.auth import tokens as auth_tokens
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
        index=True,
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
        index=True,
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
    __table_args__ = (
        UniqueConstraint(
            "chat_session_id", "sequence", name="uq_chat_messages_session_sequence"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(Uuid(), primary_key=True, default=uuid.uuid4)
    chat_session_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(),
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)
    role: Mapped[str] = mapped_column(String(40), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(),
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    metadata_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_now)


# Tables this store owns. The identity store scopes its SQLite create_all to
# these so it never materialises unrelated board tables that also register on
# the shared Base.metadata (audit: keep identity metadata out of the legacy
# SQLite create_all paths and vice-versa).
_IDENTITY_TABLES = [
    User.__table__,
    AuthCredential.__table__,
    AuthSession.__table__,
    Workspace.__table__,
    WorkspaceMembership.__table__,
    ChatSession.__table__,
    ChatMessage.__table__,
]


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
            Base.metadata.create_all(self._engine, tables=_IDENTITY_TABLES)
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
        cs_id = _to_uuid(chat_session_id)
        with self._lock, self._sessions() as session:
            # Per-session monotonic sequence. The (chat_session_id, sequence)
            # unique constraint makes a concurrent duplicate fail loudly
            # instead of silently claiming the same position (audit S6).
            next_sequence = (
                session.scalar(
                    select(func.coalesce(func.max(ChatMessage.sequence), -1)).where(
                        ChatMessage.chat_session_id == cs_id
                    )
                )
                + 1
            )
            message = ChatMessage(
                chat_session_id=cs_id,
                sequence=next_sequence,
                role=str(role or "").strip(),
                content=str(content or ""),
                author_user_id=_to_uuid(author_user_id) if author_user_id is not None else None,
            )
            session.add(message)
            session.commit()
            return self._message_dict(message)

    def list_messages(self, chat_session_id: str | uuid.UUID) -> list[dict[str, Any]]:
        with self._lock, self._sessions() as session:
            messages = session.scalars(
                select(ChatMessage)
                .where(ChatMessage.chat_session_id == _to_uuid(chat_session_id))
                .order_by(ChatMessage.sequence)
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

    # --- auth sessions (Plan 1.5): the DB row is the single source of truth ---

    DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 14  # 14 days

    def issue_session(
        self,
        *,
        user_id: str | uuid.UUID,
        ttl_seconds: int | None = None,
    ) -> dict[str, Any]:
        raw_token = auth_tokens.new_session_token()
        record = AuthSession(
            user_id=_to_uuid(user_id),
            session_token_hash=auth_tokens.hash_token(raw_token),
            status="active",
            expires_at=_now() + timedelta(seconds=ttl_seconds or self.DEFAULT_SESSION_TTL_SECONDS),
        )
        with self._lock, self._sessions() as session:
            session.add(record)
            session.commit()
            result = self._session_dict(record)
        # The raw token leaves the store exactly once; only its SHA-256 persists.
        result["token"] = raw_token
        return result

    def validate_session(self, raw_token: str) -> dict[str, Any] | None:
        token_hash = auth_tokens.hash_token(str(raw_token or ""))
        with self._lock, self._sessions() as session:
            record = session.scalar(
                select(AuthSession).where(AuthSession.session_token_hash == token_hash)
            )
            if record is None or record.status != "active":
                return None
            expires_at = record.expires_at
            if expires_at is not None:
                if expires_at.tzinfo is None:  # SQLite returns naive datetimes
                    expires_at = expires_at.replace(tzinfo=UTC)
                if expires_at <= _now():
                    return None
            return self._session_dict(record)

    def revoke_session(self, raw_token: str) -> bool:
        token_hash = auth_tokens.hash_token(str(raw_token or ""))
        with self._lock, self._sessions() as session:
            record = session.scalar(
                select(AuthSession).where(AuthSession.session_token_hash == token_hash)
            )
            if record is None:
                return False
            record.status = "revoked"
            session.commit()
            return True

    def find_password_credential(self, email: str) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            credential = session.scalar(
                select(AuthCredential).where(
                    AuthCredential.provider == "password",
                    AuthCredential.email_normalized == _normalize_email(email),
                )
            )
            return self._credential_dict(credential) if credential is not None else None

    # --- lookups for the tenancy seam (Plan 1.5) ---

    def get_user(self, user_id: str | uuid.UUID) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            user = session.get(User, _to_uuid(user_id))
            return self._user_dict(user) if user is not None else None

    def find_user_by_email(self, email: str) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            user = session.scalar(
                select(User).where(User.email_normalized == _normalize_email(email))
            )
            return self._user_dict(user) if user is not None else None

    def get_workspace_by_public_id(self, public_id: str) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            workspace = session.scalar(
                select(Workspace).where(Workspace.public_id == str(public_id or "").strip())
            )
            return self._workspace_dict(workspace) if workspace is not None else None

    def get_membership(
        self,
        *,
        workspace_id: str | uuid.UUID,
        user_id: str | uuid.UUID,
    ) -> dict[str, Any] | None:
        with self._lock, self._sessions() as session:
            membership = session.scalar(
                select(WorkspaceMembership).where(
                    WorkspaceMembership.workspace_id == _to_uuid(workspace_id),
                    WorkspaceMembership.user_id == _to_uuid(user_id),
                )
            )
            return self._membership_dict(membership) if membership is not None else None

    def _session_dict(self, record: AuthSession) -> dict[str, Any]:
        return {
            "id": str(record.id),
            "user_id": str(record.user_id),
            "status": record.status,
            "expires_at": record.expires_at.isoformat() if record.expires_at else None,
            "created_at": record.created_at.isoformat(),
        }

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
            "sequence": message.sequence,
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
