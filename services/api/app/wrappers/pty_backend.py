"""Headless PTY transport for interactive CLI agents.

Implements the locked PTY-ownership requirement
(governance/plans/kai-chattr-pty-ownership.md): the wrapper owns a
pseudoterminal (ConPTY via pywinpty on Windows, os.openpty on POSIX), so
agent CLIs run as background processes with no spawned terminal windows.
Terminal state is maintained in-process with a pyte screen and served
through the existing snapshot/websocket routes.

Rollout note: per the wterm lock, local CLI agents keep a visible/available
terminal surface until provider approval prompts are reliably relayed into
app surfaces — this backend is the transport, not a mandate to hide agents.

Surface intentionally mirrors ZellijTerminalBackend / platform wrappers:
  start(argv), inject(text), inject_command(argv), capture_terminal(),
  wait_for_text(), session_exists(), close(), get_activity_checker()

Dependencies:
  pyte>=0.8                                  (all platforms)
  pywinpty>=2.0; sys_platform == 'win32'     (ConPTY binding)

Design notes:
  - Input is a pipe write, not keystroke synthesis. No WriteConsoleInput,
    no VK codes, no focus state, no enter_backend variants.
  - Bracketed paste is applied only when the child application has enabled
    mode 2004 (tracked deterministically from its own output stream), so
    Ink-based TUIs get inert paste + submit, while plain REPLs get raw text.
  - get_activity_checker() keeps screen-hash semantics for behavioral
    parity with the Zellij/tmux backends. The raw byte counter
    (bytes_received) is exposed separately as a telemetry signal.
"""

from __future__ import annotations

import codecs
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Sequence

import pyte

_BRACKETED_PASTE_ON = "\x1b[?2004h"
_BRACKETED_PASTE_OFF = "\x1b[?2004l"
_PASTE_BEGIN = "\x1b[200~"
_PASTE_END = "\x1b[201~"
# A DECSET 2004 sequence can be split across PTY read boundaries; keep the
# longest possible partial suffix from the previous chunk when scanning.
_PASTE_SCAN_TAIL = max(len(_BRACKETED_PASTE_ON), len(_BRACKETED_PASTE_OFF)) - 1


class PtyError(RuntimeError):
    """Raised when the PTY child cannot be started or controlled."""


class PtyTerminalBackend:
    """Run an interactive CLI agent on a hidden pseudoterminal."""

    def __init__(
        self,
        *,
        session_name: str,
        cwd: str | Path,
        cols: int = 120,
        rows: int = 40,
        history_lines: int = 2000,
        env: dict[str, str] | None = None,
        read_chunk: int = 65536,
    ) -> None:
        self.session_name = session_name
        self.cwd = Path(cwd).resolve()
        self.cols = int(cols)
        self.rows = int(rows)
        self.extra_env = dict(env or {})
        self.read_chunk = int(read_chunk)

        self._screen = pyte.HistoryScreen(self.cols, self.rows, history=history_lines)
        self._stream = pyte.Stream(self._screen)
        self._lock = threading.Lock()

        self._reader: threading.Thread | None = None
        self._stop = threading.Event()
        self._bracketed_paste = False
        self._paste_scan_carry = ""

        # Telemetry-facing counters (read-only from outside). On Windows,
        # pywinpty yields decoded text, so this counts characters there.
        self.bytes_received: int = 0
        self.last_output_at: float | None = None

        # Platform handles — exactly one pair is populated after start().
        self._winpty = None          # winpty.PtyProcess on Windows
        self._posix_proc: subprocess.Popen | None = None
        self._posix_master: int | None = None
        self._posix_decoder = codecs.getincrementaldecoder("utf-8")("replace")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    def start(self, argv: Sequence[str]) -> None:
        """Spawn the agent CLI attached to a hidden pseudoterminal."""
        if not argv:
            raise ValueError("argv must contain an executable")
        self.close()
        self._stop.clear()
        self._paste_scan_carry = ""
        self._bracketed_paste = False
        self._posix_decoder.reset()

        if sys.platform == "win32":
            self._start_windows(argv)
        else:
            self._start_posix(argv)

        self._reader = threading.Thread(
            target=self._pump_output,
            name=f"pty-reader-{self.session_name}",
            daemon=True,
        )
        self._reader.start()

    def _start_windows(self, argv: Sequence[str]) -> None:
        try:
            from winpty import PtyProcess  # lazy: only present on Windows
        except ImportError as exc:  # pragma: no cover - platform guard
            raise PtyError(
                "pywinpty is required for the PTY transport on Windows "
                "(pip install pywinpty)"
            ) from exc

        cmdline = subprocess.list2cmdline([str(part) for part in argv])
        try:
            self._winpty = PtyProcess.spawn(
                cmdline,
                dimensions=(self.rows, self.cols),
                cwd=str(self.cwd),
                env=self._child_env(),
            )
        except Exception as exc:
            raise PtyError(f"failed to spawn {cmdline!r} under ConPTY: {exc}") from exc

    def _start_posix(self, argv: Sequence[str]) -> None:
        import fcntl
        import os
        import struct
        import termios

        master, slave = os.openpty()
        winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
        fcntl.ioctl(slave, termios.TIOCSWINSZ, winsize)
        try:
            self._posix_proc = subprocess.Popen(
                [str(part) for part in argv],
                stdin=slave,
                stdout=slave,
                stderr=slave,
                cwd=str(self.cwd),
                env=self._child_env(),
                start_new_session=True,
                close_fds=True,
            )
        except OSError as exc:
            os.close(master)
            os.close(slave)
            raise PtyError(f"failed to spawn {argv!r} on a PTY: {exc}") from exc
        os.close(slave)
        self._posix_master = master

    def _child_env(self) -> dict[str, str]:
        import os

        env = dict(os.environ)
        env.setdefault("TERM", "xterm-256color")
        env.setdefault("COLORTERM", "truecolor")
        env.update(self.extra_env)
        return env

    def close(self) -> None:
        """Terminate the child and release the pseudoterminal."""
        self._stop.set()

        if self._winpty is not None:
            try:
                if self._winpty.isalive():
                    self._winpty.terminate(force=True)
            except Exception:
                pass
            self._winpty = None

        if self._posix_proc is not None:
            import os
            import signal

            try:
                if self._posix_proc.poll() is None:
                    self._posix_proc.terminate()
                    try:
                        self._posix_proc.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        self._posix_proc.send_signal(signal.SIGKILL)
            except Exception:
                pass
            self._posix_proc = None
            if self._posix_master is not None:
                try:
                    os.close(self._posix_master)
                except OSError:
                    pass
                self._posix_master = None

        if self._reader is not None:
            self._reader.join(timeout=2)
            self._reader = None

    def session_exists(self) -> bool:
        if self._winpty is not None:
            try:
                return bool(self._winpty.isalive())
            except Exception:
                return False
        if self._posix_proc is not None:
            return self._posix_proc.poll() is None
        return False

    @property
    def pid(self) -> int | None:
        """OS pid of the child CLI, or None when not running."""
        if self._winpty is not None:
            try:
                return self._winpty.pid
            except Exception:
                return None
        if self._posix_proc is not None:
            return self._posix_proc.pid
        return None

    def resize(self, cols: int, rows: int) -> None:
        """Resize the pseudoterminal and the mirrored screen."""
        self.cols, self.rows = int(cols), int(rows)
        if self._winpty is not None:
            self._winpty.setwinsize(self.rows, self.cols)
        elif self._posix_master is not None:
            import fcntl
            import struct
            import termios

            winsize = struct.pack("HHHH", self.rows, self.cols, 0, 0)
            fcntl.ioctl(self._posix_master, termios.TIOCSWINSZ, winsize)
        with self._lock:
            self._screen.resize(self.rows, self.cols)

    # ------------------------------------------------------------------
    # Input
    # ------------------------------------------------------------------

    def inject_command(self, argv: Sequence[str]) -> None:
        self.inject(subprocess.list2cmdline([str(part) for part in argv]))

    def inject(self, text: str, *, submit: bool = True, settle: float = 0.05) -> None:
        """Write text into the agent's terminal input, then submit it.

        If the child has enabled bracketed paste (mode 2004), the text is
        wrapped as an inert paste so embedded newlines are not interpreted
        as submissions — same semantics as Zellij's paste action. The
        trailing Enter is a plain carriage return on the pipe; there is no
        focus state and no per-TUI Enter variant.
        """
        if self._bracketed_paste:
            self._write(_PASTE_BEGIN + text + _PASTE_END)
        else:
            self._write(text)
        if submit:
            time.sleep(settle)
            self._write("\r")

    def _write(self, data: str) -> None:
        winpty, master = self._winpty, self._posix_master
        if winpty is not None:
            winpty.write(data)
            return
        if master is not None:
            import os

            payload = data.encode("utf-8", errors="replace")
            while payload:
                written = os.write(master, payload)
                payload = payload[written:]
            return
        raise PtyError(f"PTY session {self.session_name!r} is not running")

    # ------------------------------------------------------------------
    # Output
    # ------------------------------------------------------------------

    def _pump_output(self) -> None:
        """Reader thread: PTY byte stream -> pyte screen + counters."""
        while not self._stop.is_set():
            chunk = self._read_chunk()
            if chunk is None:
                break  # EOF: child exited or PTY closed
            if not chunk:
                continue
            self.bytes_received += len(chunk)
            self.last_output_at = time.time()
            self._track_paste_mode(chunk)
            with self._lock:
                self._stream.feed(chunk)

    def _read_chunk(self) -> str | None:
        # Snapshot handles: close() may null them while a blocking read is
        # in flight on this thread.
        winpty, master = self._winpty, self._posix_master
        try:
            if winpty is not None:
                data = winpty.read(self.read_chunk)
                return data if data else None
            if master is not None:
                import os

                raw = os.read(master, self.read_chunk)
                if not raw:
                    return self._posix_decoder.decode(b"", final=True) or None
                return self._posix_decoder.decode(raw)
        except (EOFError, OSError, ValueError):
            return None
        return None

    def _track_paste_mode(self, chunk: str) -> None:
        """Deterministically track DECSET 2004 from the child's own output.

        Scans with a carry from the previous chunk so a sequence split
        across PTY read boundaries is still seen.
        """
        data = self._paste_scan_carry + chunk
        self._paste_scan_carry = data[-_PASTE_SCAN_TAIL:]
        on = data.rfind(_BRACKETED_PASTE_ON)
        off = data.rfind(_BRACKETED_PASTE_OFF)
        if on == off == -1:
            return
        self._bracketed_paste = on > off

    def capture_terminal(self, max_lines: int = 120) -> str:
        """Render the current screen (plus scrollback) as plain text."""
        with self._lock:
            history = [
                self._render_history_line(line)
                for line in self._screen.history.top
            ]
            display = list(self._screen.display)
        lines = [line.rstrip() for line in (*history, *display)]
        while lines and not lines[-1]:
            lines.pop()
        if max_lines and len(lines) > max_lines:
            lines = lines[-int(max_lines):]
        return "\n".join(lines)

    def _render_history_line(self, line) -> str:
        return "".join(line[x].data for x in range(self._screen.columns))

    def wait_for_text(self, needle: str, *, timeout: float = 10.0) -> str:
        deadline = time.time() + timeout
        last_output = ""
        while time.time() < deadline:
            last_output = self.capture_terminal()
            if needle in last_output:
                return last_output
            time.sleep(0.25)
        raise PtyError(
            f"timed out waiting for {needle!r} in PTY session "
            f"{self.session_name!r}; last output: {last_output[-500:]!r}"
        )

    # ------------------------------------------------------------------
    # Activity detection
    # ------------------------------------------------------------------

    def get_activity_checker(self, trigger_flag=None):
        """Screen-hash activity checker, parity with the Zellij backend.

        Byte-level sensitivity is intentionally NOT used here: the raw
        stream changes on cursor jitter and timer ticks — exactly the noise
        the snapshot pipeline filters. Consumers that want the firehose can
        read .bytes_received / .last_output_at directly.
        """
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


# ----------------------------------------------------------------------
# Module-level transport surface — mirrors app.wrappers.windows/unix so
# cli.py can select `transport = "pty"` per agent as a drop-in second
# method beside the console-injection runners.
# ----------------------------------------------------------------------

_active_lock = threading.Lock()
_active_backend: PtyTerminalBackend | None = None


def _set_active(backend: PtyTerminalBackend | None) -> None:
    global _active_backend
    with _active_lock:
        _active_backend = backend


def _get_active() -> PtyTerminalBackend | None:
    with _active_lock:
        return _active_backend


def inject(text: str, *, settle: float = 0.05) -> None:
    """Inject text + Enter into the active PTY session (watcher entrypoint)."""
    backend = _get_active()
    if backend is None:
        raise PtyError("no active PTY session to inject into")
    backend.inject(text, settle=settle)


def capture_terminal(max_lines: int = 120) -> str:
    """Render the active PTY screen; empty string when no session is live."""
    backend = _get_active()
    if backend is None:
        return ""
    return backend.capture_terminal(max_lines=max_lines)


def get_activity_checker(trigger_flag=None):
    """Screen-hash activity checker over whichever session is active.

    Resilient to restarts: reads the active backend at every poll instead
    of binding one instance, so the checker survives the run_agent restart
    loop swapping sessions underneath it.
    """
    last_hash = [None]

    def check() -> bool:
        if trigger_flag is not None and trigger_flag[0]:
            trigger_flag[0] = False
            return True
        backend = _get_active()
        if backend is None:
            return False
        try:
            text = backend.capture_terminal()
        except Exception:
            return False
        current_hash = hash(text)
        changed = last_hash[0] is not None and current_hash != last_hash[0]
        last_hash[0] = current_hash
        return changed

    return check


def run_agent(
    command,
    extra_args,
    cwd,
    env,
    queue_file,
    agent,
    no_restart,
    start_watcher,
    strip_env=None,
    pid_holder=None,
    session_name=None,
    inject_env=None,
    inject_delay: float = 0.3,
    **_ignored,
):
    """Run the agent CLI on an owned PTY. Same contract as the platform runners.

    The injection runners' `enter_backend` knob does not exist here — Enter
    is a carriage return on the pipe. `inject_delay` maps to the paste
    settle. Restart semantics mirror windows.run_agent: respawn after exit
    unless no_restart; KeyboardInterrupt stops.
    """
    if inject_env:
        env = {**env, **inject_env}
    start_watcher(lambda text: inject(text, settle=inject_delay))

    name = session_name or f"kai-pty-{agent}"
    argv = [command] + list(extra_args)
    while True:
        backend = PtyTerminalBackend(session_name=name, cwd=cwd, env=env)
        try:
            backend.start(argv)
            _set_active(backend)
            if pid_holder is not None:
                pid_holder[0] = backend.pid
            while backend.session_exists():
                time.sleep(0.5)
            returncode = "?"
            if backend._posix_proc is not None:
                returncode = backend._posix_proc.poll()
        except KeyboardInterrupt:
            break
        finally:
            if pid_holder is not None:
                pid_holder[0] = None
            _set_active(None)
            backend.close()

        if no_restart:
            break
        print(f"\n  {agent.capitalize()} exited (code {returncode}).")
        print("  Restarting in 3s... (Ctrl+C to quit)")
        try:
            time.sleep(3)
        except KeyboardInterrupt:
            break
