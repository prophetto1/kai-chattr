"""File-backed store for the home start surface."""

from __future__ import annotations

import json
import threading
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any


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
    def __init__(self, path: str):
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
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

    def list_repositories(self, query: str | None = None) -> dict:
        with self._lock:
            items = list(self._data.get("repositories", []))
        if query:
            needle = query.strip().lower()
            items = [
                item
                for item in items
                if needle in str(item.get("full_name", "")).lower()
            ]
        return {"items": items, "next_page_id": None}

    def list_branches(self, repository: str) -> dict:
        with self._lock:
            branches = self._data.get("branches", {})
            items = list(branches.get(repository, [])) if isinstance(branches, dict) else []
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
            "url": f"/workbench?conversation_id={conversation_id}",
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
