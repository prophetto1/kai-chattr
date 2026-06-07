import os

import pytest


def test_load_registry_returns_profiles():
    from app.launch.chattr_launcher import load_registry

    registry = load_registry()

    assert "server.default" in registry
    assert registry["server.default"].kind == "server"


def test_unknown_profile_is_rejected():
    from app.launch.chattr_launcher import build_command

    with pytest.raises(KeyError, match="Unknown launcher profile"):
        build_command("does-not-exist")


def test_invalid_profile_id_is_rejected():
    from app.launch.chattr_launcher import build_command

    with pytest.raises(ValueError, match="Invalid launcher profile"):
        build_command("../server.default")


def test_command_is_argv_list_not_shell_string():
    from app.launch.chattr_launcher import build_command

    cmd = build_command("server.default")

    assert isinstance(cmd.argv, list)
    assert all(isinstance(part, str) for part in cmd.argv)
    assert not isinstance(cmd.argv, str)


def test_registry_preserves_browser_start_and_terminal_safety():
    from app.launch.chattr_launcher import build_command

    server_cmd = build_command("server.default")
    api_cmd = build_command("agent.api.minimax")
    cli_cmd = build_command("agent.claude")

    assert server_cmd.visible_terminal is False
    assert server_cmd.allow_browser_start is False
    assert api_cmd.visible_terminal is False
    assert api_cmd.allow_browser_start is True
    assert cli_cmd.visible_terminal is True
    assert cli_cmd.allow_browser_start is False


def test_dry_run_redacts_environment_secrets(monkeypatch):
    from app.launch.chattr_launcher import dry_run

    monkeypatch.setenv("MINIMAX_API_KEY", "super-secret-token-value")

    result = dry_run("agent.api.minimax")
    rendered = str(result)

    assert "super-secret-token-value" not in rendered
    assert "TOKEN" not in rendered
    assert "SECRET" not in rendered


def test_start_rejects_visible_terminal_profiles():
    from app.launch.chattr_launcher import start

    with pytest.raises(RuntimeError, match="visible terminal"):
        start("agent.claude")


def test_start_rejects_missing_required_environment(monkeypatch):
    from app.launch.chattr_launcher import start

    monkeypatch.delenv("MINIMAX_API_KEY", raising=False)

    with pytest.raises(RuntimeError, match="Missing required environment"):
        start("agent.api.minimax")


def test_start_dry_run_does_not_spawn_process(monkeypatch):
    from app.launch.chattr_launcher import start

    monkeypatch.setenv("MINIMAX_API_KEY", "placeholder")

    result = start("agent.api.minimax", dry_run=True)

    assert result.accepted is True
    assert result.pid is None
    assert result.command.profile_id == "agent.api.minimax"
