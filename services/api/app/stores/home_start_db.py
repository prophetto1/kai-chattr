"""SQLAlchemy-backed store for the home start surface."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Mapped, mapped_column, relationship, sessionmaker

from app.database import create_database_engine, normalize_database_url
from app.product_routes import workspace_session_url
from app.stores.home_start import (
    _conversation_title,
    _filter_cloud_repositories,
)
from app.stores.rules_db import Base


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


class HomeRepository(Base):
    __tablename__ = "home_repositories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[str] = mapped_column(String(240), unique=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(240), nullable=False)
    git_provider: Mapped[str] = mapped_column(String(40), nullable=False, default="github")
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    main_branch: Mapped[str | None] = mapped_column(String(160), nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)

    branches: Mapped[list["HomeRepositoryBranch"]] = relationship(
        back_populates="repository",
        cascade="all, delete-orphan",
        order_by="HomeRepositoryBranch.name",
    )


class HomeRepositoryBranch(Base):
    __tablename__ = "home_repository_branches"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    repository_id: Mapped[int] = mapped_column(
        ForeignKey("home_repositories.id", ondelete="CASCADE"),
        nullable=False,
    )
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    commit_sha: Mapped[str] = mapped_column(String(80), nullable=False, default="")
    protected: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_push_date: Mapped[str | None] = mapped_column(String(40), nullable=True)

    repository: Mapped[HomeRepository] = relationship(back_populates="branches")


class HomeConversation(Base):
    __tablename__ = "home_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(36), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    selected_repository: Mapped[str | None] = mapped_column(String(240), nullable=True)
    selected_branch: Mapped[str | None] = mapped_column(String(160), nullable=True)
    git_provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="ready")
    url: Mapped[str] = mapped_column(String(260), nullable=False)
    suggested_task_json: Mapped[str] = mapped_column(Text, nullable=False, default="")
    initial_message: Mapped[str] = mapped_column(Text, nullable=False, default="")
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False)


class HomeSuggestedTask(Base):
    __tablename__ = "home_suggested_tasks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    uid: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(240), nullable=False)
    repo: Mapped[str | None] = mapped_column(String(240), nullable=True)
    git_provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    task_type: Mapped[str] = mapped_column(String(60), nullable=False, default="manual")
    issue_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False)


class SqlAlchemyHomeStartStore:
    def __init__(self, database_url: str | Engine, local_repository_roots: list[str] | None = None):
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
        self._local_repository_roots = local_repository_roots or []
        self._lock = threading.Lock()

    def list_repositories(self, query: str | None = None, provider: str | None = "github") -> dict:
        with self._lock, self._sessions() as session:
            stmt = select(HomeRepository).order_by(HomeRepository.updated_at.desc())
            repositories = session.scalars(stmt).all()
            items = [self._repository_dict(repository) for repository in repositories]
            items = _filter_cloud_repositories(items, provider=provider)
            if query:
                needle = query.strip().lower()
                items = [
                    item
                    for item in items
                    if needle in str(item.get("full_name", "")).lower()
                ]
            return {
                "items": items,
                "next_page_id": None,
            }

    def list_branches(self, repository: str, provider: str | None = "github") -> dict:
        provider_name = (provider or "github").strip().lower()
        with self._lock, self._sessions() as session:
            repo = session.scalar(
                select(HomeRepository).where(
                    HomeRepository.full_name == repository,
                    HomeRepository.git_provider == provider_name,
                )
            )
            if repo is None:
                return {"items": [], "next_page_id": None}
            branches = session.scalars(
                select(HomeRepositoryBranch)
                .where(HomeRepositoryBranch.repository_id == repo.id)
                .order_by(HomeRepositoryBranch.name)
            ).all()
            return {
                "items": [self._branch_dict(branch) for branch in branches],
                "next_page_id": None,
            }

    def list_suggested_tasks(self) -> dict:
        with self._lock, self._sessions() as session:
            tasks = session.scalars(select(HomeSuggestedTask).order_by(HomeSuggestedTask.id)).all()
            return {
                "items": [self._suggested_task_dict(task) for task in tasks],
                "next_page_id": None,
            }

    def list_recent_conversations(self, limit: int = 10) -> dict:
        with self._lock, self._sessions() as session:
            conversations = session.scalars(
                select(HomeConversation)
                .order_by(HomeConversation.updated_at.desc())
                .limit(limit)
            ).all()
            return {
                "items": [self._conversation_dict(conversation) for conversation in conversations],
                "next_page_id": None,
            }

    def create_conversation(
        self,
        *,
        repository: dict | None = None,
        initial_message: str | None = None,
        suggested_task: dict | None = None,
    ) -> dict:
        now = _now_iso()
        conversation_id = str(uuid.uuid4())
        selected_repository = (repository or {}).get("name")
        selected_branch = (repository or {}).get("branch")
        git_provider = (repository or {}).get("gitProvider") or (repository or {}).get("git_provider")
        title = _conversation_title(selected_repository, initial_message, suggested_task)
        with self._lock, self._sessions() as session:
            conversation = HomeConversation(
                uid=conversation_id,
                title=title,
                selected_repository=selected_repository,
                selected_branch=selected_branch,
                git_provider=git_provider,
                status="ready",
                url=workspace_session_url(conversation_id),
                suggested_task_json=json.dumps(suggested_task or {}),
                initial_message=initial_message or "",
                created_at=now,
                updated_at=now,
            )
            session.add(conversation)
            session.commit()
            result = self._conversation_dict(conversation)
        return result

    def _repository_dict(self, repository: HomeRepository) -> dict[str, Any]:
        return {
            "id": repository.repository_id,
            "full_name": repository.full_name,
            "git_provider": repository.git_provider,
            "is_public": repository.is_public,
            "main_branch": repository.main_branch,
        }

    def _branch_dict(self, branch: HomeRepositoryBranch) -> dict[str, Any]:
        return {
            "name": branch.name,
            "commit_sha": branch.commit_sha,
            "protected": branch.protected,
            "last_push_date": branch.last_push_date,
        }

    def _suggested_task_dict(self, task: HomeSuggestedTask) -> dict[str, Any]:
        return {
            "id": task.uid,
            "title": task.title,
            "repo": task.repo,
            "git_provider": task.git_provider,
            "task_type": task.task_type,
            "issue_number": task.issue_number,
        }

    def _conversation_dict(self, conversation: HomeConversation) -> dict[str, Any]:
        return {
            "id": conversation.uid,
            "title": conversation.title,
            "selected_repository": conversation.selected_repository,
            "selected_branch": conversation.selected_branch,
            "git_provider": conversation.git_provider,
            "status": conversation.status,
            "url": conversation.url,
            "created_at": conversation.created_at,
            "updated_at": conversation.updated_at,
        }
