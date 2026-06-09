from __future__ import annotations

import os
import shutil
import sys
import time
from pathlib import Path


def test_zellij_backend_runs_fake_cli_probe(tmp_path):
    from app.wrappers.zellij import ZellijTerminalBackend

    zellij = os.environ.get("KAI_CHATTR_ZELLIJ_COMMAND") or shutil.which("zellij")
    assert zellij, "zellij must be installed on PATH for the terminal backend probe"

    fake_cli = Path(__file__).with_name("fixtures") / "fake_cli_agent.py"
    session_name = f"kai-chattr-test-{int(time.time() * 1000)}"
    backend = ZellijTerminalBackend(
        command=zellij,
        session_name=session_name,
        cwd=tmp_path,
        timeout=8,
    )

    try:
        backend.start([sys.executable, str(fake_cli)])
        backend.wait_for_text("KAI_FAKE_CLI_READY", timeout=10)

        backend.inject("KAI_ZELLIJ_PROBE")
        output = backend.wait_for_text("KAI_FAKE_CLI_ECHO KAI_ZELLIJ_PROBE", timeout=10)

        assert "KAI_FAKE_CLI_ECHO KAI_ZELLIJ_PROBE" in output
    finally:
        backend.close()

    assert not backend.session_exists()
