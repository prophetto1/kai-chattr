"""Working-tree file access for the workbench Changes/Code/Files docks.

All paths are repo-relative and confined to the repository working tree.
Reads reject binary and oversized files; writes additionally require the
target to already exist (the workbench edits files, it does not create them).
Git access is subprocess-based (no shell) with timeouts.
"""

from __future__ import annotations

import subprocess
from pathlib import Path

MAX_FILE_BYTES = 512 * 1024
MAX_TREE_ENTRIES = 8000
GIT_TIMEOUT_SECONDS = 10

_repo_root: Path | None = None


class WorkspaceFilesError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def _git(args: list[str], cwd: Path) -> str:
    try:
        proc = subprocess.run(
            ["git", *args],
            capture_output=True,
            cwd=str(cwd),
            encoding="utf-8",
            errors="replace",
            text=True,
            timeout=GIT_TIMEOUT_SECONDS,
        )
    except (OSError, subprocess.TimeoutExpired) as error:
        raise WorkspaceFilesError(f"git unavailable: {error}", status=500)
    if proc.returncode != 0:
        raise WorkspaceFilesError(proc.stderr.strip() or f"git {args[0]} failed", status=500)
    return proc.stdout


def repo_root() -> Path:
    global _repo_root
    if _repo_root is None:
        service_dir = Path(__file__).resolve().parents[1]
        try:
            _repo_root = Path(_git(["rev-parse", "--show-toplevel"], cwd=service_dir).strip())
        except WorkspaceFilesError:
            _repo_root = service_dir.parents[0]
    return _repo_root


def resolve_workspace_path(raw: str) -> Path:
    rel = (raw or "").replace("\\", "/").strip()
    first_segment = rel.split("/", 1)[0]
    if not rel or rel.startswith(("/", "~")) or ":" in first_segment:
        raise WorkspaceFilesError("path must be repo-relative")
    root = repo_root()
    candidate = (root / rel).resolve()
    if candidate == root or root not in candidate.parents:
        raise WorkspaceFilesError("path escapes the workspace", status=403)
    if ".git" in candidate.relative_to(root).parts:
        raise WorkspaceFilesError("path not allowed", status=403)
    return candidate


def list_tree() -> dict:
    root = repo_root()
    out = _git(["ls-files", "--cached", "--others", "--exclude-standard"], cwd=root)
    files = sorted(line.strip() for line in out.splitlines() if line.strip())
    return {
        "root": root.name,
        "files": files[:MAX_TREE_ENTRIES],
        "truncated": len(files) > MAX_TREE_ENTRIES,
    }


def _status_map() -> dict[str, str]:
    out = _git(["status", "--porcelain"], cwd=repo_root())
    statuses: dict[str, str] = {}
    for line in out.splitlines():
        if len(line) < 4:
            continue
        code, path = line[:2], line[3:]
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        path = path.strip().strip('"')
        if not path or path.endswith("/"):
            continue
        if code == "??" or "A" in code:
            statuses[path] = "added"
        elif "D" in code:
            statuses[path] = "deleted"
        else:
            statuses[path] = "modified"
    return statuses


def list_changes() -> dict:
    root = repo_root()
    statuses = _status_map()
    numstat: dict[str, tuple[int, int]] = {}
    for line in _git(["diff", "--numstat", "HEAD", "--"], cwd=root).splitlines():
        parts = line.split("\t")
        if len(parts) != 3:
            continue
        added, deleted, path = parts
        numstat[path.strip().strip('"')] = (
            int(added) if added.isdigit() else 0,
            int(deleted) if deleted.isdigit() else 0,
        )

    changes = []
    for path, status in sorted(statuses.items()):
        additions, deletions = numstat.get(path, (0, 0))
        if status == "added" and additions == 0:
            try:
                target = resolve_workspace_path(path)
                if target.is_file() and target.stat().st_size <= MAX_FILE_BYTES:
                    with target.open("rb") as handle:
                        additions = sum(1 for _ in handle)
            except (WorkspaceFilesError, OSError):
                additions = 0
        changes.append(
            {"path": path, "status": status, "additions": additions, "deletions": deletions}
        )
    return {"root": root.name, "changes": changes}


def _read_text(target: Path) -> str:
    data = target.read_bytes()
    if len(data) > MAX_FILE_BYTES:
        raise WorkspaceFilesError("file too large for the workbench editor", status=413)
    if b"\x00" in data:
        raise WorkspaceFilesError("binary file", status=415)
    return data.decode("utf-8", errors="replace")


def read_file(raw_path: str) -> dict:
    target = resolve_workspace_path(raw_path)
    if not target.is_file():
        raise WorkspaceFilesError("not found", status=404)
    return {"path": raw_path.replace("\\", "/").strip(), "content": _read_text(target)}


def read_diff(raw_path: str) -> dict:
    rel = (raw_path or "").replace("\\", "/").strip()
    target = resolve_workspace_path(rel)
    try:
        original = _git(["show", f"HEAD:{rel}"], cwd=repo_root())
    except WorkspaceFilesError:
        original = ""
    modified = _read_text(target) if target.is_file() else ""
    if not original and modified:
        status = "added"
    elif original and not target.is_file():
        status = "deleted"
    else:
        status = "modified"
    return {"path": rel, "original": original, "modified": modified, "status": status}


def write_file(raw_path: str, content: str) -> dict:
    target = resolve_workspace_path(raw_path)
    if not target.is_file():
        raise WorkspaceFilesError(
            "only existing files can be saved from the workbench", status=404
        )
    if len(content.encode("utf-8")) > MAX_FILE_BYTES:
        raise WorkspaceFilesError("file too large", status=413)
    _read_text(target)  # rejects binary targets before overwriting
    target.write_text(content, encoding="utf-8", newline="")
    return {"ok": True, "path": raw_path.replace("\\", "/").strip()}
