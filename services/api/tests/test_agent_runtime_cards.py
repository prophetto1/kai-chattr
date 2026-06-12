from __future__ import annotations

import json
import threading

from fastapi import FastAPI
from fastapi.testclient import TestClient

CLAUDE_APPROVAL_SCREEN = """
╭──────────────────────────────────────╮
│ Edit file services/api/app/main.py   │
╰──────────────────────────────────────╯
Do you want to make this edit to main.py?
❯ 1. Yes
  2. Yes, allow all edits during this session
  3. No, and tell Claude what to do differently
"""

PLAIN_SCREEN = """
PS E:\\kai-chattr> echo hello
hello
PS E:\\kai-chattr>
"""


class _FakeRegistry:
    def __init__(self, names):
        self._names = list(names)

    def get_all_names(self):
        return list(self._names)

    def resolve_name(self, name):
        return name


def _state(tmp_path, names=("claude",), agent_auth=True):
    from app.routes.terminal import TerminalApiState

    return TerminalApiState(
        snapshots={},
        snapshots_lock=threading.Lock(),
        get_registry=lambda: _FakeRegistry(names),
        resolve_authenticated_agent=lambda request: {"name": "claude"} if agent_auth else None,
        extract_agent_token=lambda request: "agent-token" if agent_auth else "",
        get_event_stream=lambda: None,
        get_data_dir=lambda: str(tmp_path),
    )


def _client(state):
    from app.routes.terminal import create_terminal_router

    app = FastAPI()
    app.include_router(create_terminal_router(state))
    return TestClient(app)


def test_detect_approval_patterns():
    from app.routes.terminal import detect_approval

    needed, hint = detect_approval(CLAUDE_APPROVAL_SCREEN)
    assert needed is True
    assert "Do you want" in hint or "1." in hint

    needed, hint = detect_approval(PLAIN_SCREEN)
    assert needed is False and hint == ""

    # Old prompt scrolled far into history must not re-flag.
    scrolled = CLAUDE_APPROVAL_SCREEN + ("\nworking...\n" * 30)
    needed, _ = detect_approval(scrolled)
    assert needed is False


def test_snapshot_write_sets_approval_and_runtimes_reports_it(tmp_path):
    state = _state(tmp_path)
    client = _client(state)

    response = client.post(
        "/api/terminal/claude",
        json={"text": CLAUDE_APPROVAL_SCREEN},
        headers={"Authorization": "Bearer agent-token"},
    )
    assert response.status_code == 200

    runtimes = client.get("/api/terminal-runtimes").json()
    assert runtimes["pending_approvals"] == 1
    card = next(a for a in runtimes["agents"] if a["name"] == "claude")
    assert card["approval_needed"] is True
    assert card["has_snapshot"] is True
    assert "Do you want" in card["screen_tail"]

    # Approval clears when the prompt leaves the screen.
    client.post(
        "/api/terminal/claude",
        json={"text": PLAIN_SCREEN},
        headers={"Authorization": "Bearer agent-token"},
    )
    runtimes = client.get("/api/terminal-runtimes").json()
    assert runtimes["pending_approvals"] == 0


def test_input_endpoint_appends_jsonl_and_validates(tmp_path):
    state = _state(tmp_path)
    client = _client(state)

    assert client.post("/api/terminal/claude/input", json={"keys": "y"}).status_code == 200
    assert client.post("/api/terminal/claude/input", json={"keys": ""}).status_code == 200
    assert client.post("/api/terminal/nope/input", json={"keys": "y"}).status_code == 404
    assert (
        client.post("/api/terminal/claude/input", json={"keys": "x" * 201}).status_code == 400
    )

    lines = (tmp_path / "claude_input.jsonl").read_text("utf-8").splitlines()
    assert [json.loads(line)["keys"] for line in lines] == ["y", ""]


def test_wrapper_drains_raw_input_verbatim(tmp_path):
    from app.wrappers.cli import _drain_raw_input

    input_file = tmp_path / "claude_input.jsonl"
    input_file.write_text(
        json.dumps({"keys": "y"}) + "\n" + json.dumps({"keys": ""}) + "\nnot-json\n",
        encoding="utf-8",
    )
    assert _drain_raw_input(input_file) == ["y", ""]
    # Drained: file emptied, second drain is a no-op.
    assert _drain_raw_input(input_file) == []
    assert _drain_raw_input(tmp_path / "absent.jsonl") == []
