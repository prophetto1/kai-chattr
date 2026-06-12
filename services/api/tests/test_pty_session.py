from __future__ import annotations

import time
from pathlib import Path


def test_pty_session_echo_list_and_close(tmp_path):
    from app.terminal.session_manager import TerminalSessionManager

    manager = TerminalSessionManager()
    session = manager.create(
        shell="powershell.exe", cwd=str(tmp_path), cols=100, rows=30
    )
    try:
        assert session.proc.isalive()
        assert session.proc.pid > 0

        listed = manager.list_public()
        assert [s["terminal_id"] for s in listed] == [session.terminal_id]
        assert listed[0]["shell"] == "powershell.exe"
        assert listed[0]["alive"] is True

        session.proc.write("echo plan-1-ok\r")
        buffer = ""
        deadline = time.time() + 20
        while time.time() < deadline and "plan-1-ok" not in buffer:
            chunk = session.proc.read(65536)
            if chunk:
                buffer += chunk
        assert "plan-1-ok" in buffer
    finally:
        result = manager.close(session.terminal_id)

    assert result in ("terminated", "terminate_failed")
    assert manager.list_public() == []
    assert manager.close(session.terminal_id) == "absent"


def test_pty_session_limit(tmp_path):
    from app.terminal import session_manager as sm

    manager = sm.TerminalSessionManager()
    opened = []
    try:
        for _ in range(sm.MAX_SESSIONS):
            opened.append(
                manager.create(shell="powershell.exe", cwd=str(tmp_path), cols=80, rows=24)
            )
        try:
            manager.create(shell="powershell.exe", cwd=str(tmp_path), cols=80, rows=24)
            raised = False
        except RuntimeError:
            raised = True
        assert raised, "session limit must raise"
    finally:
        for session in opened:
            manager.close(session.terminal_id)
    assert manager.list_public() == []
