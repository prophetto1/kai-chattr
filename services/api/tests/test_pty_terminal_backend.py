from __future__ import annotations

import sys
import time
from pathlib import Path


def _make_backend(tmp_path, **kwargs):
    from app.wrappers.pty_backend import PtyTerminalBackend

    return PtyTerminalBackend(
        session_name=f"kai-chattr-pty-test-{int(time.time() * 1000)}",
        cwd=tmp_path,
        **kwargs,
    )


def _fake_cli() -> Path:
    return Path(__file__).with_name("fixtures") / "fake_cli_agent.py"


def test_pty_backend_runs_fake_cli_probe(tmp_path):
    backend = _make_backend(tmp_path)
    try:
        backend.start([sys.executable, str(_fake_cli())])
        backend.wait_for_text("KAI_FAKE_CLI_READY", timeout=15)
        assert backend.session_exists()

        backend.inject("KAI_PTY_PROBE")
        output = backend.wait_for_text("KAI_FAKE_CLI_ECHO KAI_PTY_PROBE", timeout=10)
        assert "KAI_FAKE_CLI_ECHO KAI_PTY_PROBE" in output
    finally:
        backend.close()

    assert not backend.session_exists()


def test_pty_backend_exit_and_telemetry_counters(tmp_path):
    backend = _make_backend(tmp_path)
    try:
        backend.start([sys.executable, str(_fake_cli())])
        backend.wait_for_text("KAI_FAKE_CLI_READY", timeout=15)

        backend.inject("exit")
        backend.wait_for_text("KAI_FAKE_CLI_EXIT", timeout=10)

        assert backend.bytes_received > 0
        assert backend.last_output_at is not None

        deadline = time.time() + 10
        while backend.session_exists() and time.time() < deadline:
            time.sleep(0.2)
        assert not backend.session_exists()
    finally:
        backend.close()


def test_pty_backend_activity_checker_detects_output_change(tmp_path):
    backend = _make_backend(tmp_path)
    try:
        backend.start([sys.executable, str(_fake_cli())])
        backend.wait_for_text("KAI_FAKE_CLI_READY", timeout=15)

        check = backend.get_activity_checker()
        check()  # prime the hash

        backend.inject("KAI_PTY_ACTIVITY")
        backend.wait_for_text("KAI_FAKE_CLI_ECHO KAI_PTY_ACTIVITY", timeout=10)
        assert check() is True

        # No further input: screen settles, checker reports no change.
        time.sleep(0.5)
        check()
        assert check() is False
    finally:
        backend.close()


def test_pty_backend_paste_mode_tracking_handles_split_chunks(tmp_path):
    backend = _make_backend(tmp_path)
    # Feed the DECSET 2004 enable sequence split across two chunks the way a
    # real PTY read boundary can split it; the tracker must still see it.
    backend._track_paste_mode("\x1b[?20")
    backend._track_paste_mode("04h")
    assert backend._bracketed_paste is True
    backend._track_paste_mode("\x1b[?2004")
    backend._track_paste_mode("l")
    assert backend._bracketed_paste is False
