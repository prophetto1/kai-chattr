"""File-backed store for the home start surface."""

from __future__ import annotations

import json
import subprocess
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
        self._local_repository_roots = [
            Path(root).expanduser().resolve()
            for root in (local_repository_roots or [])
        ]
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
        items = _merge_repository_items(items, _discover_local_repositories(self._local_repository_roots))
        if query:
            needle = query.strip().lower()
            items = [
                item
                for item in items
                if needle in str(item.get("full_name", "")).lower()
            ]
        return {"items": items, "next_page_id": None}

    def list_branches(self, repository: str) -> dict:
        local_repo = _find_local_repository(self._local_repository_roots, repository)
        if local_repo is not None:
            return {"items": _list_local_branches(local_repo), "next_page_id": None}

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


def _merge_repository_items(
    stored_items: list[dict[str, Any]],
    local_items: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_name: dict[str, dict[str, Any]] = {}
    for item in stored_items + local_items:
        full_name = str(item.get("full_name") or "").strip()
        if not full_name:
            continue
        by_name[full_name] = item
    return list(by_name.values())


def _discover_local_repositories(roots: list[Path]) -> list[dict[str, Any]]:
    repositories: list[dict[str, Any]] = []
    for root in roots:
        for repo_path in _iter_git_repositories(root):
            label = _local_repository_label(root, repo_path)
            repositories.append(
                {
                    "id": f"local:{label}",
                    "full_name": label,
                    "git_provider": "local",
                    "is_public": False,
                    "main_branch": _current_branch(repo_path),
                }
            )
    repositories.sort(key=lambda item: item["full_name"])
    return repositories


def _find_local_repository(roots: list[Path], label: str) -> Path | None:
    for root in roots:
        for repo_path in _iter_git_repositories(root):
            if _local_repository_label(root, repo_path) == label:
                return repo_path
    return None


def _iter_git_repositories(root: Path, max_depth: int = 2):
    if not root.exists():
        return
    if _is_git_repository(root):
        yield root
        return

    ignored = {
        ".git",
        ".hg",
        ".svn",
        ".venv",
        "__pycache__",
        "node_modules",
        ".next",
        "dist",
        "build",
    }
    stack: list[tuple[Path, int]] = [(root, 0)]
    while stack:
        current, depth = stack.pop()
        if depth >= max_depth:
            continue
        try:
            children = sorted(
                (child for child in current.iterdir() if child.is_dir()),
                key=lambda child: child.name.lower(),
            )
        except OSError:
            continue
        for child in children:
            if child.name in ignored:
                continue
            if _is_git_repository(child):
                yield child
                continue
            stack.append((child, depth + 1))


def _is_git_repository(path: Path) -> bool:
    return (path / ".git").exists()


def _local_repository_label(root: Path, repo_path: Path) -> str:
    try:
        relative = repo_path.relative_to(root)
    except ValueError:
        relative = Path(repo_path.name)
    if str(relative) in ("", "."):
        relative = Path(repo_path.name)
    return "local/" + relative.as_posix().strip("/")


def _current_branch(repo_path: Path) -> str | None:
    branch = _git_output(repo_path, "branch", "--show-current")
    if branch:
        return branch
    symbolic = _git_output(repo_path, "symbolic-ref", "--short", "HEAD")
    return symbolic or None


def _list_local_branches(repo_path: Path) -> list[dict[str, Any]]:
    output = _git_output(
        repo_path,
        "for-each-ref",
        "--format=%(refname:short)|%(objectname)|%(committerdate:iso8601-strict)",
        "refs/heads",
    )
    branches: list[dict[str, Any]] = []
    if output:
        for line in output.splitlines():
            name, commit_sha, last_push_date = (line.split("|", 2) + ["", ""])[:3]
            if name:
                branches.append(
                    {
                        "name": name,
                        "commit_sha": commit_sha,
                        "protected": False,
                        "last_push_date": last_push_date or None,
                    }
                )
    if not branches:
        current = _current_branch(repo_path)
        if current:
            branches.append(
                {
                    "name": current,
                    "commit_sha": "",
                    "protected": False,
                    "last_push_date": None,
                }
            )
    return branches


def _git_output(repo_path: Path, *args: str) -> str:
    try:
        completed = subprocess.run(
            ["git", *args],
            cwd=str(repo_path),
            check=False,
            capture_output=True,
            text=True,
            timeout=3,
        )
    except (OSError, subprocess.TimeoutExpired):
        return ""
    if completed.returncode != 0:
        return ""
    return completed.stdout.strip()
