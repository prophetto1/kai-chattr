"""Pydantic contracts for the home start surface."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _strip(value):
    return value.strip() if isinstance(value, str) else value


class RepositorySummary(BaseModel):
    id: str
    full_name: str
    git_provider: str = "local"
    is_public: bool = True
    main_branch: str | None = None


class RepositoryPage(BaseModel):
    items: list[RepositorySummary] = Field(default_factory=list)
    next_page_id: str | None = None


class BranchSummary(BaseModel):
    name: str
    commit_sha: str = ""
    protected: bool = False
    last_push_date: str | None = None


class BranchPage(BaseModel):
    items: list[BranchSummary] = Field(default_factory=list)
    next_page_id: str | None = None


class SuggestedTask(BaseModel):
    id: str
    title: str
    repo: str | None = None
    git_provider: str | None = None
    task_type: str = "manual"
    issue_number: int | None = None


class SuggestedTaskPage(BaseModel):
    items: list[SuggestedTask] = Field(default_factory=list)
    next_page_id: str | None = None


class ConversationRepositoryInput(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(min_length=1, max_length=240)
    branch: str | None = Field(default=None, max_length=160)
    git_provider: str = Field(default="local", alias="gitProvider", max_length=40)

    _strip_name = field_validator("name", mode="before")(_strip)
    _strip_branch = field_validator("branch", mode="before")(_strip)
    _strip_git_provider = field_validator("git_provider", mode="before")(_strip)


class ConversationCreateRequest(BaseModel):
    repository: ConversationRepositoryInput | None = None
    initial_message: str | None = Field(default=None, max_length=4000)
    suggested_task: dict[str, Any] | None = None

    _strip_initial_message = field_validator("initial_message", mode="before")(_strip)


class ConversationSummary(BaseModel):
    id: str
    title: str
    selected_repository: str | None = None
    selected_branch: str | None = None
    git_provider: str | None = None
    status: str = "ready"
    url: str
    created_at: str
    updated_at: str


class ConversationPage(BaseModel):
    items: list[ConversationSummary] = Field(default_factory=list)
    next_page_id: str | None = None


class ConversationCreateResponse(BaseModel):
    conversation_id: str
    status: str = "ready"
    url: str
    conversation: ConversationSummary
