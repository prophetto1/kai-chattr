"""Pure text patch application for proposal review flows.

The kernel is intentionally side-effect free: callers provide source text and a
JSON-compatible list of hunks, and receive either transformed text or a
structured validation error.
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from typing import Any


PatchResult = dict[str, Any]
PatchHunk = Mapping[str, Any]

LINE_MODES = {"deleteLines", "insertAt", "replaceLines"}


def apply_text_patch(source: str, hunks: Iterable[PatchHunk]) -> PatchResult:
    """Apply proposal patch hunks to text with all-or-nothing semantics."""

    indexed_hunks = (
        list(hunks)
        if isinstance(hunks, Iterable) and not isinstance(hunks, (str, bytes, Mapping))
        else []
    )
    if not indexed_hunks:
        return _failure({"code": "EMPTY_HUNKS", "hunkIndex": -1})

    current = source
    applied = 0
    line_hunks: list[tuple[int, PatchHunk]] = []

    for hunk_index, hunk in enumerate(indexed_hunks):
        if _mode(hunk) in LINE_MODES:
            line_hunks.append((hunk_index, hunk))
            continue

        result = _apply_content_hunk(current, hunk, hunk_index)
        if "code" in result:
            return _failure(result)
        current = result["content"]
        applied += result["count"]

    if not line_hunks:
        return _success(current, applied)

    sorted_line_hunks = sorted(
        line_hunks,
        key=lambda indexed_hunk: _line_anchor(indexed_hunk[1]),
        reverse=True,
    )
    preserve_trailing_newline = current.endswith("\n")
    lines = _split_lines(current)
    baseline_total_lines = len(lines)

    for hunk_index, hunk in sorted_line_hunks:
        error = _validate_line_hunk(hunk, baseline_total_lines, hunk_index)
        if error:
            return _failure(error)

    for idx, left in enumerate(sorted_line_hunks[:-1]):
        for right in sorted_line_hunks[idx + 1 :]:
            if _ranges_overlap_or_touch(left[1], right[1]):
                return _failure({"code": "LINE_OVERLAP", "hunkIndex": left[0]})

    for _hunk_index, hunk in sorted_line_hunks:
        lines = _apply_line_hunk(lines, hunk)
        applied += 1

    return _success(_join_lines(lines, preserve_trailing_newline), applied)


def _success(content: str, applied: int) -> PatchResult:
    return {"ok": True, "content": content, "applied": applied}


def _failure(error: dict[str, Any]) -> PatchResult:
    return {"ok": False, "error": error}


def _mode(hunk: PatchHunk) -> str:
    if not isinstance(hunk, Mapping):
        return ""
    mode = hunk.get("mode", "replace")
    return mode if isinstance(mode, str) else ""


def _apply_content_hunk(source: str, hunk: PatchHunk, hunk_index: int) -> dict[str, Any]:
    if not isinstance(hunk, Mapping):
        return {"code": "EMPTY_SEARCH", "hunkIndex": hunk_index}

    search = hunk.get("search")
    if not isinstance(search, str) or not search:
        return {"code": "EMPTY_SEARCH", "hunkIndex": hunk_index}

    occurrences = source.count(search)
    if occurrences == 0:
        return {"code": "HUNK_NOT_FOUND", "hunkIndex": hunk_index, "search": search}

    replace_all = bool(hunk.get("replaceAll"))
    if occurrences > 1 and not replace_all:
        return {
            "code": "HUNK_AMBIGUOUS",
            "hunkIndex": hunk_index,
            "occurrences": occurrences,
        }

    replacement = "" if _mode(hunk) == "delete" else hunk.get("replace", "")
    if not isinstance(replacement, str):
        replacement = str(replacement)

    next_source = (
        source.replace(search, replacement)
        if replace_all
        else source.replace(search, replacement, 1)
    )
    return {"content": next_source, "count": occurrences if replace_all else 1}


def _split_lines(source: str) -> list[str]:
    if source == "":
        return []
    normalized = source[:-1] if source.endswith("\n") else source
    return normalized.split("\n")


def _join_lines(lines: list[str], preserve_trailing_newline: bool) -> str:
    joined = "\n".join(lines)
    return f"{joined}\n" if preserve_trailing_newline and lines else joined


def _validate_line_hunk(
    hunk: PatchHunk, total_lines: int, hunk_index: int
) -> dict[str, Any] | None:
    mode = _mode(hunk)
    if mode == "insertAt":
        line = hunk.get("line")
        if not _is_int(line) or line < 1 or line > total_lines + 1:
            return {
                "code": "LINE_OUT_OF_RANGE",
                "hunkIndex": hunk_index,
                "line": line,
                "totalLines": total_lines,
            }
        return None

    start_line = hunk.get("startLine")
    end_line = hunk.get("endLine")
    if not _is_int(start_line) or not _is_int(end_line):
        return {
            "code": "LINE_OUT_OF_RANGE",
            "hunkIndex": hunk_index,
            "totalLines": total_lines,
        }

    if end_line < start_line:
        return {"code": "INVALID_LINE_RANGE", "hunkIndex": hunk_index}

    if start_line < 1 or end_line > total_lines:
        return {"code": "LINE_OUT_OF_RANGE", "hunkIndex": hunk_index, "totalLines": total_lines}

    return None


def _is_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool)


def _line_anchor(hunk: PatchHunk) -> int:
    if _mode(hunk) == "insertAt":
        line = hunk.get("line")
        return line if _is_int(line) else -1

    start_line = hunk.get("startLine")
    return start_line if _is_int(start_line) else -1


def _ranges_overlap_or_touch(left: PatchHunk, right: PatchHunk) -> bool:
    left_start, left_end = _line_range(left)
    right_start, right_end = _line_range(right)
    return left_start <= right_end and right_start <= left_end


def _line_range(hunk: PatchHunk) -> tuple[int, int]:
    if _mode(hunk) == "insertAt":
        line = hunk["line"]
        return line, line
    return hunk["startLine"], hunk["endLine"]


def _apply_line_hunk(lines: list[str], hunk: PatchHunk) -> list[str]:
    mode = _mode(hunk)
    if mode == "insertAt":
        line = hunk["line"]
        content = hunk.get("content", "")
        inserted = [""] if content == "" else str(content).split("\n")
        next_lines = lines.copy()
        next_lines[line - 1 : line - 1] = inserted
        return next_lines

    start_line = hunk["startLine"]
    end_line = hunk["endLine"]
    remove_count = end_line - start_line + 1
    next_lines = lines.copy()

    if mode == "deleteLines":
        del next_lines[start_line - 1 : start_line - 1 + remove_count]
        return next_lines

    content = hunk.get("content", "")
    replacement = [] if content == "" else str(content).split("\n")
    next_lines[start_line - 1 : start_line - 1 + remove_count] = replacement
    return next_lines
