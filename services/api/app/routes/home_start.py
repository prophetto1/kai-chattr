"""Home start route surface."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, Query

from app.context import runtime_context
from app.schemas.home_start import (
    BranchPage,
    ConversationCreateRequest,
    ConversationCreateResponse,
    ConversationPage,
    RepositoryPage,
    SuggestedTaskPage,
)
from app.stores.factory import create_home_start_store


router = APIRouter(tags=["home-start"])
_STORE_CACHE: tuple[tuple[Any, ...], Any] | None = None


def _store():
    global _STORE_CACHE
    cfg = runtime_context.config or {}
    data_dir = Path(cfg.get("server", {}).get("data_dir", "./data"))
    database = cfg.get("database", {})
    key = (
        str(data_dir),
        str(database.get("mode", "file")),
        str(database.get("url", "")),
    )
    if _STORE_CACHE is None or _STORE_CACHE[0] != key:
        _STORE_CACHE = (
            key,
            create_home_start_store(cfg, str(data_dir / "home_start.json")),
        )
    return _STORE_CACHE[1]


@router.get("/api/repositories", response_model=RepositoryPage)
async def list_repositories(provider: str = Query(default="github", min_length=1)):
    return _store().list_repositories(provider=provider)


@router.get("/api/repositories/search", response_model=RepositoryPage)
async def search_repositories(
    query: str = Query(default=""),
    provider: str = Query(default="github", min_length=1),
):
    return _store().list_repositories(query=query, provider=provider)


@router.get("/api/git/repositories/search", response_model=RepositoryPage)
async def search_git_repositories(
    provider: str = Query(min_length=1),
    query: str = Query(default=""),
    page_id: str | None = Query(default=None),
    limit: int = Query(default=30, gt=0, le=100),
    installation_id: str | None = Query(default=None),
):
    del page_id, limit, installation_id
    return _store().list_repositories(query=query, provider=provider)


@router.get("/api/repositories/{repository:path}/branches", response_model=BranchPage)
async def list_repository_branches(
    repository: str,
    provider: str = Query(default="github", min_length=1),
):
    return _store().list_branches(repository, provider=provider)


@router.get("/api/git/branches/search", response_model=BranchPage)
async def search_git_branches(
    provider: str = Query(min_length=1),
    repository: str = Query(min_length=1),
    query: str = Query(default=""),
    page_id: str | None = Query(default=None),
    limit: int = Query(default=30, gt=0, le=100),
):
    del page_id, limit
    page = _store().list_branches(repository, provider=provider)
    if query:
        needle = query.strip().lower()
        page["items"] = [
            item
            for item in page["items"]
            if needle in str(item.get("name", "")).lower()
        ]
    return page


@router.get("/api/conversations/recent", response_model=ConversationPage)
async def list_recent_conversations(limit: int = Query(default=10, gt=0, le=50)):
    return _store().list_recent_conversations(limit=limit)


@router.post("/api/conversations", response_model=ConversationCreateResponse)
async def create_conversation(request: ConversationCreateRequest):
    repository = None
    if request.repository is not None:
        repository = request.repository.model_dump(by_alias=True)
    conversation = _store().create_conversation(
        repository=repository,
        initial_message=request.initial_message,
        suggested_task=request.suggested_task,
    )
    return {
        "conversation_id": conversation["id"],
        "status": conversation["status"],
        "url": conversation["url"],
        "conversation": conversation,
    }


@router.get("/api/suggested-tasks", response_model=SuggestedTaskPage)
async def list_suggested_tasks():
    return _store().list_suggested_tasks()
