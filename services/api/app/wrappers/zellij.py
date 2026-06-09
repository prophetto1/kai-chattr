"""Zellij-backed terminal transport for interactive CLI agents.

This adapter intentionally mirrors the platform wrappers' small surface:
start a visible terminal host, inject text, capture the visible pane, and
clean up owned sessions. On Windows, Zellij currently needs a real terminal
host; launching it as a hidden child process does not create a usable session.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence


class ZellijError(RuntimeError):
    """Raised when Zellij cannot provide an action-controllable session."""


@dataclass(frozen=True)
class ZellijPane:
    pane_id: str
    session_name: str


class ZellijTerminalBackend:
    def __init__(
        self,
        *,
        command: str = "zellij",
        session_name: str,
        cwd: str | os.PathLike[str],
        timeout: float = 8.0,
        terminal_host: str | None = None,
    ) -> None:
        resolved = shutil.which(command) or command
        self.command = str(resolved)
        self.session_name = session_name
        self.cwd = Path(cwd).resolve()
        self.timeout = float(timeout)
        self.terminal_host = terminal_host or ("wt" if sys.platform == "win32" else "")
        self.pane = ZellijPane("terminal_0", session_name)
        self._host_script: Path | None = None

    def start(self, argv: Sequence[str]) -> ZellijPane:
        """Start a session and run an interactive command in the default pane."""
        if not argv:
            raise ValueError("argv must contain an executable")
        self.close()
        self._start_host()
        self._wait_for_session(timeout=self.timeout)
        self._prepare_default_pane()
        self.inject_command(argv)
        return self.pane

    def inject_command(self, argv: Sequence[str]) -> None:
        self.inject(subprocess.list2cmdline([str(part) for part in argv]))

    def inject(self, text: str) -> None:
        """Paste text as inert terminal input, then submit it."""
        self._action(["paste", text, "--pane-id", self.pane.pane_id])
        self._send_enter()

    def capture_terminal(self, max_lines: int = 120) -> str:
        output = self._action([
            "dump-screen",
            "--pane-id",
            self.pane.pane_id,
            "--full",
        ])
        lines = output.replace("\r\n", "\n").replace("\r", "\n").split("\n")
        if max_lines and len(lines) > max_lines:
            lines = lines[-int(max_lines):]
        return "\n".join(lines).rstrip()

    def wait_for_text(self, needle: str, *, timeout: float = 10.0) -> str:
        deadline = time.time() + timeout
        last_output = ""
        while time.time() < deadline:
            last_output = self.capture_terminal()
            if needle in last_output:
                return last_output
            time.sleep(0.25)
        raise ZellijError(
            f"timed out waiting for {needle!r} in Zellij session {self.session_name!r}; "
            f"last output: {last_output[-500:]!r}"
        )

    def session_exists(self) -> bool:
        result = self._run(["list-sessions"], check=False, timeout=3)
        if result.returncode != 0:
            return False
        return self.session_name in (result.stdout or "")

    def close(self) -> None:
        self._run(["delete-session", "--force", self.session_name], check=False, timeout=5)

    def get_activity_checker(self, trigger_flag=None):
        last_hash = [None]

        def check() -> bool:
            if trigger_flag is not None and trigger_flag[0]:
                trigger_flag[0] = False
                return True
            try:
                text = self.capture_terminal()
            except Exception:
                return False
            current_hash = hash(text)
            changed = last_hash[0] is not None and current_hash != last_hash[0]
            last_hash[0] = current_hash
            return changed

        return check

    def _start_host(self) -> None:
        if sys.platform == "win32":
            host = shutil.which(self.terminal_host)
            if not host:
                raise ZellijError("Windows Terminal (wt.exe) is required to host Zellij on Windows")
            script = Path(tempfile.gettempdir()) / f"{self.session_name}.zellij.ps1"
            script.write_text(
                "\n".join([
                    f"Set-Location {self._ps_quote(str(self.cwd))}",
                    f"& {self._ps_quote(self.command)} attach --create {self._ps_quote(self.session_name)} | Out-Null",
                ]),
                encoding="utf-8",
            )
            self._host_script = script
            subprocess.Popen([
                host,
                "new-tab",
                "--title",
                self.session_name,
                "powershell.exe",
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
            ])
            return

        self._run(["attach", "--create-background", self.session_name], timeout=self.timeout)

    def _wait_for_session(self, *, timeout: float) -> None:
        deadline = time.time() + timeout
        while time.time() < deadline:
            if self.session_exists():
                return
            time.sleep(0.25)
        raise ZellijError(f"Zellij session {self.session_name!r} did not become active")

    def _prepare_default_pane(self) -> None:
        # First-run Zellij on Windows opens a floating About plugin that can steal
        # focus. Closing it is idempotent when the pane is absent.
        self._action(["close-pane", "--pane-id", "plugin_3"], check=False)
        self._run(["--session", self.session_name, "action", "focus-pane-id", self.pane.pane_id], check=False)

    def _send_enter(self) -> None:
        self._action(["send-keys", "--pane-id", self.pane.pane_id, "Enter"])

    def _action(self, args: Sequence[str], *, check: bool = True) -> str:
        result = self._run(["--session", self.session_name, "action", *args], check=check)
        return result.stdout or ""

    def _run(
        self,
        args: Sequence[str],
        *,
        check: bool = True,
        timeout: float | None = None,
    ) -> subprocess.CompletedProcess[str]:
        result = subprocess.run(
            [self.command, *[str(arg) for arg in args]],
            cwd=str(self.cwd),
            capture_output=True,
            text=True,
            timeout=timeout or self.timeout,
        )
        if check and result.returncode != 0:
            detail = (result.stderr or result.stdout or "").strip()
            raise ZellijError(
                f"zellij {' '.join(str(arg) for arg in args)} failed with exit "
                f"{result.returncode}: {detail}"
            )
        return result

    @staticmethod
    def _ps_quote(value: str) -> str:
        return "'" + value.replace("'", "''") + "'"


def probe(command: str = "zellij") -> dict[str, object]:
    resolved = shutil.which(command) or command
    result = subprocess.run(
        [resolved, "--version"],
        capture_output=True,
        text=True,
        timeout=5,
    )
    return {
        "ok": result.returncode == 0,
        "command": resolved,
        "version": (result.stdout or "").strip(),
    }


def parse_panes(raw_json: str) -> list[dict]:
    data = json.loads(raw_json)
    if not isinstance(data, list):
        raise ZellijError("zellij list-panes did not return a JSON array")
    return data
