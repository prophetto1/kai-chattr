"""In-memory registry of interactive terminal sessions (Phase 1).

Sessions are ephemeral: an API restart kills them (accepted risk). No
persistence, no slots — the Phase 2 agent console reuses this seam.
"""

from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass

from app.terminal import pty_backend

DEFAULT_SHELL = "powershell.exe"
MAX_SESSIONS = 8


@dataclass
class TerminalSession:
    terminal_id: str
    shell: str
    cwd: str
    cols: int
    rows: int
    proc: pty_backend.PtyBackend


class TerminalSessionManager:
    def __init__(self) -> None:
        self._sessions: dict[str, TerminalSession] = {}
        self._lock = threading.Lock()

    def create(self, *, shell: str, cwd: str, cols: int, rows: int) -> TerminalSession:
        with self._lock:
            if len(self._sessions) >= MAX_SESSIONS:
                raise RuntimeError("terminal session limit reached")
            terminal_id = uuid.uuid4().hex[:12]
            resolved_shell = shell or DEFAULT_SHELL
            proc = pty_backend.spawn(resolved_shell, cwd, cols, rows)
            session = TerminalSession(terminal_id, resolved_shell, cwd, cols, rows, proc)
            self._sessions[terminal_id] = session
            return session

    def resize(self, terminal_id: str, cols: int, rows: int) -> None:
        with self._lock:
            session = self._sessions.get(terminal_id)
        if session is None:
            return
        session.proc.setwinsize(rows, cols)
        session.cols, session.rows = cols, rows

    def close(self, terminal_id: str) -> str:
        with self._lock:
            session = self._sessions.pop(terminal_id, None)
        if not session:
            return "absent"
        try:
            session.proc.terminate(force=True)
            return "terminated"
        except Exception:
            return "terminate_failed"

    def list_public(self) -> list[dict]:
        with self._lock:
            sessions = list(self._sessions.values())
        return [
            {
                "terminal_id": s.terminal_id,
                "pid": s.proc.pid,
                "shell": s.shell,
                "cols": s.cols,
                "rows": s.rows,
                "alive": s.proc.isalive(),
            }
            for s in sessions
        ]
