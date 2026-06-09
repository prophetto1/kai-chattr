import os
import subprocess

import pytest


def test_preflight_lists_visible_cli_profiles_without_argv_or_cwd(monkeypatch):
    from app.launch.visible_agent_launcher import preflight_visible_cli_profiles

    monkeypatch.setattr("app.launch.visible_agent_launcher.shutil.which", lambda command: f"C:/bin/{command}.exe")

    result = preflight_visible_cli_profiles()
    profiles = result["profiles"]
    claude = next(profile for profile in profiles if profile["profile_id"] == "agent.claude")

    assert claude["kind"] == "cli-agent"
    assert claude["base"] == "claude"
    assert claude["visible_terminal"] is True
    assert claude["ready"] is True
    assert claude["checks"] == {"uv": True, "wrapper": True, "provider_cli": True}
    assert "argv" not in claude
    assert "cwd" not in claude


def test_preflight_marks_provider_cli_blocker(monkeypatch):
    from app.launch.visible_agent_launcher import preflight_visible_cli_profiles

    def fake_which(command):
        return "C:/bin/uv.exe" if command == "uv" else None

    monkeypatch.setattr("app.launch.visible_agent_launcher.shutil.which", fake_which)

    result = preflight_visible_cli_profiles()
    claude = next(profile for profile in result["profiles"] if profile["profile_id"] == "agent.claude")

    assert claude["ready"] is False
    assert claude["checks"]["uv"] is True
    assert claude["checks"]["wrapper"] is True
    assert claude["checks"]["provider_cli"] is False
    assert "provider CLI not found" in claude["blocked_reason"]


def test_start_visible_agent_rejects_non_cli_profiles(monkeypatch):
    from app.launch.visible_agent_launcher import start_visible_agent

    monkeypatch.setattr("app.launch.visible_agent_launcher.shutil.which", lambda command: f"C:/bin/{command}.exe")

    with pytest.raises(RuntimeError, match="not a visible CLI profile"):
        start_visible_agent("agent.api.minimax")


def test_start_visible_agent_uses_windows_visible_console_and_sanitized_env(monkeypatch):
    from app.launch.visible_agent_launcher import start_visible_agent

    captured = {}

    class FakeProcess:
        pid = 43210

    def fake_popen(argv, *, cwd, env, shell, creationflags):
        captured["argv"] = argv
        captured["cwd"] = cwd
        captured["env"] = env
        captured["shell"] = shell
        captured["creationflags"] = creationflags
        return FakeProcess()

    monkeypatch.setattr("app.launch.visible_agent_launcher.shutil.which", lambda command: f"C:/bin/{command}.exe")
    monkeypatch.setattr("app.launch.visible_agent_launcher.platform.system", lambda: "Windows")
    monkeypatch.setattr("app.launch.visible_agent_launcher.subprocess.Popen", fake_popen)
    monkeypatch.setattr(subprocess, "CREATE_NEW_CONSOLE", 16, raising=False)
    monkeypatch.setenv("VIRTUAL_ENV", "C:/unsafe/venv")
    monkeypatch.setenv("CHATTR_REMOTE_AGENT_TOKEN", "keep-me")

    result = start_visible_agent("agent.claude")

    assert result["accepted"] is True
    assert result["profile_id"] == "agent.claude"
    assert result["expected_base"] == "claude"
    assert result["pid"] == 43210
    assert captured["argv"] == ["uv", "run", "python", "wrapper.py", "claude"]
    assert captured["shell"] is False
    assert captured["creationflags"] == subprocess.CREATE_NEW_CONSOLE
    assert "VIRTUAL_ENV" not in captured["env"]
    assert captured["env"]["CHATTR_REMOTE_AGENT_TOKEN"] == "keep-me"
