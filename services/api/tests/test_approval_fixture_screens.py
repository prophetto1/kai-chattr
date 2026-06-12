"""Golden fixture tests for detect_approval against recorded provider screens.

Fixtures are real screen captures from live headless agents (recorded
2026-06-12 via GET /api/terminal/{agent} while each agent sat at a prompt).
A provider UI update that breaks detection shows up here as a failing test,
not as a silently hung agent.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.routes.terminal import detect_approval

FIXTURES = Path(__file__).parent / "fixtures" / "approval_screens"

POSITIVE = [
    # Claude Code v2.1.175 tool-permission numbered menu ("Do you want to proceed?")
    "claude_menu_approval.txt",
    # Claude Code MCP-tool permission menu (second live prompt, same session)
    "claude_menu_mcp_approval.txt",
    # Codex CLI numbered choice menu ("press enter to confirm")
    "codex_choice_menu.txt",
]

NEGATIVE = [
    # Claude Code idle prompt screen — must never flag
    "negative_idle.txt",
]


@pytest.mark.parametrize("name", POSITIVE)
def test_positive_screens_detected(name: str) -> None:
    text = (FIXTURES / name).read_text(encoding="utf-8")
    needed, hint = detect_approval(text)
    assert needed, f"{name}: approval prompt not detected"
    assert hint, f"{name}: empty approval hint"


@pytest.mark.parametrize("name", NEGATIVE)
def test_negative_screens_not_detected(name: str) -> None:
    text = (FIXTURES / name).read_text(encoding="utf-8")
    needed, _hint = detect_approval(text)
    assert not needed, f"{name}: false positive on non-approval screen"
