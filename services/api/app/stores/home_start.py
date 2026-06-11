"""File-backed store for the home start surface."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.product_routes import workspace_session_url


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _empty_data() -> dict[str, Any]:
    return {
        "repositories": [],
        "branches": {},
        "conversations": [],
        "suggested_tasks": [],
    }


class HomeStartStore:
    def __init__(self, path: str, local_repository_roots: list[str] | None = None):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._local_repository_roots = local_repository_roots or []
        self._lock = threading.Lock()
        self._data = self._load()

    def _load(self) -> dict[str, Any]:
        if not self._path.exists():
            return _empty_data()
        try:
            loaded = json.loads(self._path.read_text("utf-8"))
        except json.JSONDecodeError:
            return _empty_data()
        if not isinstance(loaded, dict):
            return _empty_data()
        data = _empty_data()
        data.update(loaded)
        return data

    def _save(self) -> None:
        self._path.write_text(
            json.dumps(self._data, indent=2, ensure_ascii=False) + "\n",
            "utf-8",
        )

    def list_repositories(self, query: str | None = None, provider: str | None = "github") -> dict:
        with self._lock:
            items = list(self._data.get("repositories", []))
        items = _filter_cloud_repositories(items, provider=provider)
        if query:
            needle = query.strip().lower()
            items = [
                item
                for item in items
                if needle in str(item.get("full_name", "")).lower()
            ]
        return {"items": items, "next_page_id": None}

    def list_branches(self, repository: str, provider: str | None = "github") -> dict:
        with self._lock:
            branches = self._data.get("branches", {})
            items = _provider_branch_items(branches, provider=provider, repository=repository)
        return {"items": items, "next_page_id": None}

    def list_suggested_tasks(self) -> dict:
        with self._lock:
            items = list(self._data.get("suggested_tasks", []))
        return {"items": items, "next_page_id": None}

    def list_recent_conversations(self, limit: int = 10) -> dict:
        with self._lock:
            items = list(self._data.get("conversations", []))
        items.sort(key=lambda item: str(item.get("updated_at", "")), reverse=True)
        return {"items": items[:limit], "next_page_id": None}

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
        item = {
            "id": conversation_id,
            "title": title,
            "selected_repository": selected_repository,
            "selected_branch": selected_branch,
            "git_provider": git_provider,
            "status": "ready",
            "url": workspace_session_url(conversation_id),
            "created_at": now,
            "updated_at": now,
        }
        with self._lock:
            self._data.setdefault("conversations", []).append(item)
            self._save()
        return item


def _conversation_title(
    repository: str | None,
    initial_message: str | None,
    suggested_task: dict | None,
) -> str:
    if suggested_task and suggested_task.get("title"):
        return str(suggested_task["title"])[:160]
    if initial_message:
        return initial_message.strip()[:80] or "New Conversation"
    if repository:
        return repository
    return "New Conversation"


def _filter_cloud_repositories(
    stored_items: list[dict[str, Any]],
    *,
    provider: str | None,
) -> list[dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    provider_name = (provider or "github").strip().lower()
    for item in stored_items:
        full_name = str(item.get("full_name") or "").strip()
        if not full_name:
            continue
        item_provider = str(item.get("git_provider") or item.get("gitProvider") or "github").strip().lower()
        if item_provider != provider_name:
            continue
        by_name[f"{item_provider}:{full_name}"] = {
            **item,
            "git_provider": item_provider,
            "id": item.get("id") or f"{item_provider}:{full_name}",
        }
    return list(by_name.values())


def _provider_branch_items(
    branches: Any,
    *,
    provider: str | None,
    repository: str,
) -> list[dict[str, Any]]:
    if not isinstance(branches, dict):
        return []
    provider_name = (provider or "github").strip().lower()
    provider_key = f"{provider_name}:{repository}"
    return list(branches.get(provider_key, branches.get(repository, [])))
