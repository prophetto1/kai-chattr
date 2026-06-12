"""Working-tree file access for the workbench Changes/Code/Files docks.

All paths are repo-relative and confined to the repository working tree.
Reads reject binary and oversized files; writes additionally require the
target to already exist (the workbench edits files, it does not create them).
Git access is subprocess-based (no shell) with timeouts.
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

MAX_FILE_BYTES = 512 * 1024
MAX_TREE_ENTRIES = 8000
GIT_TIMEOUT_SECONDS = 10
MAX_DIFF_CONTEXT_LINES = 20
MAX_INTER_HUNK_CONTEXT_LINES = 20

HUNK_HEADER_RE = re.compile(
    r"^@@ -(?P<old_start>\d+)(?:,(?P<old_lines>\d+))? "
    r"\+(?P<new_start>\d+)(?:,(?P<new_lines>\d+))? @@ ?(?P<section>.*)$"
)

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


def _bounded_diff_option(value: int, maximum: int, default: int) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        return default
    return max(0, min(parsed, maximum))


def _change_map() -> dict[str, dict]:
    return {change["path"]: change for change in list_changes()["changes"]}


def _parse_hunk_header(line: str) -> dict | None:
    match = HUNK_HEADER_RE.match(line)
    if not match:
        return None
    return {
        "oldStart": int(match.group("old_start")),
        "oldLines": int(match.group("old_lines") or "1"),
        "newStart": int(match.group("new_start")),
        "newLines": int(match.group("new_lines") or "1"),
        "section": match.group("section") or None,
        "lines": [],
    }


def _parse_git_patch(patch: str, changes: dict[str, dict]) -> list[dict]:
    files: list[dict] = []
    current_file: dict | None = None
    current_hunk: dict | None = None
    old_line = 0
    new_line = 0

    for line in patch.splitlines():
        if line.startswith("diff --git "):
            current_file = None
            current_hunk = None
            old_line = 0
            new_line = 0
            continue

        if line.startswith("+++ "):
            raw_path = line[4:].strip()
            if raw_path == "/dev/null":
                continue
            path = raw_path[2:] if raw_path.startswith("b/") else raw_path
            change = changes.get(path, {})
            current_file = {
                "path": path,
                "status": change.get("status", "modified"),
                "additions": change.get("additions", 0),
                "deletions": change.get("deletions", 0),
                "binary": False,
                "tooLarge": False,
                "hunks": [],
            }
            files.append(current_file)
            continue

        if current_file is None:
            continue

        if line.startswith("Binary files "):
            current_file["binary"] = True
            continue

        hunk = _parse_hunk_header(line)
        if hunk:
            current_hunk = hunk
            current_file["hunks"].append(current_hunk)
            old_line = hunk["oldStart"]
            new_line = hunk["newStart"]
            continue

        if current_hunk is None:
            continue

        if line.startswith("\\"):
            continue

        marker = line[:1]
        content = line[1:]
        if marker == " ":
            current_hunk["lines"].append(
                {"kind": "context", "oldLine": old_line, "newLine": new_line, "content": content}
            )
            old_line += 1
            new_line += 1
        elif marker == "-":
            current_hunk["lines"].append(
                {"kind": "delete", "oldLine": old_line, "newLine": None, "content": content}
            )
            old_line += 1
        elif marker == "+":
            current_hunk["lines"].append(
                {"kind": "add", "oldLine": None, "newLine": new_line, "content": content}
            )
            new_line += 1

    return files


def _added_file_diff(path: str, change: dict) -> dict:
    file = {
        "path": path,
        "status": "added",
        "additions": change.get("additions", 0),
        "deletions": 0,
        "binary": False,
        "tooLarge": False,
        "hunks": [],
    }
    try:
        target = resolve_workspace_path(path)
        content = _read_text(target)
    except WorkspaceFilesError as error:
        if error.status == 413:
            file["tooLarge"] = True
        elif error.status == 415:
            file["binary"] = True
        return file

    lines = content.splitlines()
    file["additions"] = len(lines)
    file["hunks"] = [
        {
            "oldStart": 0,
            "oldLines": 0,
            "newStart": 1,
            "newLines": len(lines),
            "section": None,
            "lines": [
                {"kind": "add", "oldLine": None, "newLine": index + 1, "content": line}
                for index, line in enumerate(lines)
            ],
        }
    ]
    return file


def read_diff_document(context: int = 3, inter_hunk_context: int = 0) -> dict:
    root = repo_root()
    context_lines = _bounded_diff_option(context, MAX_DIFF_CONTEXT_LINES, 3)
    inter_hunk_lines = _bounded_diff_option(
        inter_hunk_context, MAX_INTER_HUNK_CONTEXT_LINES, 0
    )
    changes = _change_map()
    patch = _git(
        [
            "diff",
            f"--unified={context_lines}",
            f"--inter-hunk-context={inter_hunk_lines}",
            "HEAD",
            "--",
        ],
        cwd=root,
    )
    files = _parse_git_patch(patch, changes)
    present_paths = {file["path"] for file in files}

    for path, change in sorted(changes.items()):
        if path in present_paths:
            continue
        if change.get("status") == "added":
            files.append(_added_file_diff(path, change))
        else:
            files.append(
                {
                    "path": path,
                    "status": change.get("status", "modified"),
                    "additions": change.get("additions", 0),
                    "deletions": change.get("deletions", 0),
                    "binary": False,
                    "tooLarge": False,
                    "hunks": [],
                }
            )

    files.sort(key=lambda file: file["path"])
    return {
        "root": root.name,
        "baseRef": "HEAD",
        "compareRef": "WORKTREE",
        "contextLines": context_lines,
        "interHunkContext": inter_hunk_lines,
        "files": files,
    }


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
