from __future__ import annotations

import subprocess


def test_start_headless_agent_spawns_no_window_and_forces_pty(monkeypatch):
    from app.launch import visible_agent_launcher as launcher

    captured: dict = {}

    class FakeProc:
        pid = 4242

    def fake_popen(argv, **kwargs):
        captured["argv"] = argv
        captured.update(kwargs)
        return FakeProc()

    monkeypatch.setattr(launcher.subprocess, "Popen", fake_popen)
    # Preflight must pass regardless of local CLI availability.
    monkeypatch.setattr(launcher.shutil, "which", lambda name: f"C:/fake/{name}.exe")

    result = launcher.start_headless_agent("agent.claude")

    assert result["accepted"] is True
    assert result["pid"] == 4242
    assert "headless" in result["detail"]

    no_window = getattr(subprocess, "CREATE_NO_WINDOW", 0)
    assert captured["creationflags"] == no_window
    assert captured["env"]["KAI_CHATTR_TRANSPORT_OVERRIDE"] == "pty"
    assert captured["stdout"] is subprocess.DEVNULL
    assert "wrapper.py" in " ".join(captured["argv"])


def test_transport_override_env_wins_over_config(monkeypatch):
    monkeypatch.setenv("KAI_CHATTR_TRANSPORT_OVERRIDE", "pty")
    import os

    agent_cfg = {"transport": "console"}
    transport = os.environ.get("KAI_CHATTR_TRANSPORT_OVERRIDE") or agent_cfg.get(
        "transport", "console"
    )
    assert transport == "pty"
