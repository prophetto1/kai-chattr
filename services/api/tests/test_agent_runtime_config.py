from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BASE_CONFIG = """
[server]
port = 8840

[agents.claude]
command = "claude"
cwd = ".."
label = "Claude"

[agents.copilot]
command = "copilot"
cwd = ".."
label = "Copilot"
enter_backend = "wm_setfocus"

[agents.minimax]
type = "api"
base_url = "https://api.minimax.io/v1"
label = "MiniMax"
"""


def _write_config(root: Path, local: str | None = None) -> None:
    (root / "config.toml").write_text(BASE_CONFIG, encoding="utf-8")
    if local is not None:
        (root / "config.local.toml").write_text(local, encoding="utf-8")


def _client(root: Path) -> TestClient:
    from app.routes.agent_runtime import create_agent_runtime_router

    app = FastAPI()
    app.include_router(create_agent_runtime_router(root))
    return TestClient(app)


# ----------------------------------------------------------------------
# config.local.toml merge semantics (app/config.py)
# ----------------------------------------------------------------------


def test_local_runtime_keys_overlay_existing_agents(tmp_path):
    from app.config import load_config

    _write_config(
        tmp_path,
        local="""
[agents.copilot]
transport = "pty"
command = "evil-binary"

[agents.local-llm]
command = "ollama"
label = "Local LLM"
""",
    )
    config = load_config(tmp_path)
    agents = config["agents"]

    # Runtime key overlays onto an existing agent...
    assert agents["copilot"]["transport"] == "pty"
    # ...identity keys stay protected...
    assert agents["copilot"]["command"] == "copilot"
    # ...and brand-new local agents are still added wholesale.
    assert agents["local-llm"]["command"] == "ollama"
    # Agents untouched by the local file keep no transport key (= console default).
    assert "transport" not in agents["claude"]


# ----------------------------------------------------------------------
# /api/agents/runtime-config routes
# ----------------------------------------------------------------------


def test_get_lists_cli_agents_with_default_transport(tmp_path):
    _write_config(tmp_path)
    response = _client(tmp_path).get("/api/agents/runtime-config")
    assert response.status_code == 200
    agents = {entry["agent"]: entry for entry in response.json()["agents"]}

    assert set(agents) == {"claude", "copilot"}  # api-type minimax excluded
    assert agents["claude"]["transport"] == "console"
    assert agents["claude"]["available_transports"] == ["console", "pty"]
    assert agents["claude"]["effective_on_next_launch"] is True


def test_put_writes_local_overlay_and_get_reflects_it(tmp_path):
    _write_config(tmp_path)
    client = _client(tmp_path)

    response = client.put(
        "/api/agents/copilot/runtime-config", json={"transport": "pty"}
    )
    assert response.status_code == 200
    assert response.json()["transport"] == "pty"

    # The write landed in the gitignored local overlay, not config.toml.
    local_text = (tmp_path / "config.local.toml").read_text(encoding="utf-8")
    assert 'transport = "pty"' in local_text
    assert "copilot" in local_text
    assert 'transport' not in (tmp_path / "config.toml").read_text(encoding="utf-8")

    # A fresh GET re-reads the merged config and reflects the change.
    agents = {
        entry["agent"]: entry
        for entry in client.get("/api/agents/runtime-config").json()["agents"]
    }
    assert agents["copilot"]["transport"] == "pty"
    assert agents["claude"]["transport"] == "console"

    # Switching back works and preserves the file as valid TOML.
    response = client.put(
        "/api/agents/copilot/runtime-config", json={"transport": "console"}
    )
    assert response.status_code == 200
    agents = {
        entry["agent"]: entry
        for entry in client.get("/api/agents/runtime-config").json()["agents"]
    }
    assert agents["copilot"]["transport"] == "console"


def test_put_preserves_unrelated_local_content(tmp_path):
    _write_config(
        tmp_path,
        local="""# my machine notes
[agents.local-llm]
command = "ollama"
label = "Local LLM"
""",
    )
    client = _client(tmp_path)
    assert (
        client.put("/api/agents/claude/runtime-config", json={"transport": "pty"})
        .status_code
        == 200
    )
    local_text = (tmp_path / "config.local.toml").read_text(encoding="utf-8")
    assert "# my machine notes" in local_text
    assert 'command = "ollama"' in local_text
    assert 'transport = "pty"' in local_text


def test_put_rejects_unknown_and_api_agents_and_bad_transport(tmp_path):
    _write_config(tmp_path)
    client = _client(tmp_path)

    assert (
        client.put("/api/agents/nope/runtime-config", json={"transport": "pty"})
        .status_code
        == 404
    )
    # API-type agents have no terminal transport.
    assert (
        client.put("/api/agents/minimax/runtime-config", json={"transport": "pty"})
        .status_code
        == 404
    )
    assert (
        client.put("/api/agents/claude/runtime-config", json={"transport": "tmux"})
        .status_code
        == 422
    )
