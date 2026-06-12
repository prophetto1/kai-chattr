"""Raw PTY backend for the interactive human terminal (Phase 1).

This is the thin byte-bridge consumed by xterm.js: the browser renderer owns
the screen, so the backend just pumps raw VT bytes. Distinct from
`app/wrappers/pty_backend.py`, the agent transport, which feeds a headless
pyte screen for capture — same pywinpty underneath, different consumer.
Phase 2's managed agent console unifies the two behind this seam.
"""

from __future__ import annotations

import sys
from typing import Protocol


class PtyBackend(Protocol):
    def write(self, data: str) -> None: ...
    def read(self, size: int = 65536) -> str: ...  # blocking; call off the event loop
    def setwinsize(self, rows: int, cols: int) -> None: ...
    def isalive(self) -> bool: ...
    def terminate(self, force: bool = True) -> None: ...
    @property
    def pid(self) -> int: ...


def spawn(shell: str, cwd: str, cols: int, rows: int) -> PtyBackend:
    if sys.platform == "win32":
        from winpty import PtyProcess  # pywinpty (ConPTY)

        return PtyProcess.spawn(shell, cwd=cwd, dimensions=(rows, cols))
    raise RuntimeError("POSIX PTY backend not implemented in Phase 1 (Windows host)")
