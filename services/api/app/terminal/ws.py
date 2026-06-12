"""FastAPI WebSocket bridge: xterm.js <-> backend-owned PTY (Phase 1).

Contract (locked in the Phase 1 plan):
- Auth: ?token= validated like the room /ws (accept then close 4003 on mismatch).
- First frame: {"type":"ready","terminal_id","shell","cols","rows"}.
- Client -> server: {"type":"input","data"} | {"type":"resize","cols","rows"}.
- Server -> client: {"type":"output","data"} | {"type":"exit","exit_code"}.
- Disconnect kills the child (no orphan shells).

Runtime events use only existing chattr.runtime_event.v1 types. terminal.bytes
is emitted as per-direction totals at teardown (not per chunk) to keep the
JSONL stream sane; the schema's byte_count/direction contract is unchanged.
"""

from __future__ import annotations

import asyncio
import json
from typing import Any, Callable

from fastapi import WebSocket, WebSocketDisconnect

from app.observability import get_tracer, validate_attrs
from app.terminal.session_manager import TerminalSessionManager

DEFAULT_COLS = 80
DEFAULT_ROWS = 24


def _emit(get_event_stream: Callable[[], Any | None], event_type: str, details: dict) -> None:
    stream = get_event_stream()
    if stream is None:
        return
    try:
        stream.append(
            {
                "event_type": event_type,
                "source": "terminal-api",
                "actor": "human",
                "details": details,
            }
        )
    except Exception:
        # Terminal telemetry must never break the interactive stream.
        return


async def terminal_stream_endpoint(
    websocket: WebSocket,
    *,
    manager: TerminalSessionManager,
    validate_token: Callable[[str], bool],
    cwd: str,
    get_event_stream: Callable[[], Any | None],
) -> None:
    token = websocket.query_params.get("token", "")
    if not validate_token(token):
        # Accept before closing so the browser receives the close frame
        # (same 4003 convention as the room /ws).
        await websocket.accept()
        await websocket.close(code=4003, reason="forbidden: invalid session token")
        return
    await websocket.accept()

    shell = websocket.query_params.get("shell", "")
    tracer = get_tracer()
    try:
        with tracer.start_as_current_span("terminal.session.create") as span:
            session = manager.create(
                shell=shell, cwd=cwd, cols=DEFAULT_COLS, rows=DEFAULT_ROWS
            )
            for key, value in validate_attrs(
                {"shell": session.shell, "cols": session.cols, "rows": session.rows}
            ).items():
                span.set_attribute(key, value)
    except Exception as exc:
        await websocket.send_text(json.dumps({"type": "error", "message": str(exc)}))
        await websocket.close(code=1011)
        return

    _emit(
        get_event_stream,
        "terminal.opened",
        {
            "shell": session.shell,
            "cwd": session.cwd,
            "pid": session.proc.pid,
            "cols": session.cols,
            "rows": session.rows,
        },
    )

    await websocket.send_text(
        json.dumps(
            {
                "type": "ready",
                "terminal_id": session.terminal_id,
                "shell": session.shell,
                "cols": session.cols,
                "rows": session.rows,
            }
        )
    )

    loop = asyncio.get_running_loop()
    out_queue: asyncio.Queue[str | None] = asyncio.Queue()
    bytes_out = 0
    bytes_in = 0
    child_exited = False

    def _reader() -> None:
        try:
            while session.proc.isalive():
                try:
                    data = session.proc.read(65536)
                except (EOFError, OSError):
                    break
                if data:
                    loop.call_soon_threadsafe(out_queue.put_nowait, data)
        finally:
            loop.call_soon_threadsafe(out_queue.put_nowait, None)

    reader_task = loop.run_in_executor(None, _reader)

    async def pump_out() -> None:
        nonlocal bytes_out, child_exited
        while True:
            chunk = await out_queue.get()
            if chunk is None:
                child_exited = True
                try:
                    await websocket.send_text(json.dumps({"type": "exit", "exit_code": 0}))
                except Exception:
                    pass
                return
            bytes_out += len(chunk)
            await websocket.send_text(json.dumps({"type": "output", "data": chunk}))

    out_task = asyncio.create_task(pump_out())
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                message = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = message.get("type")
            if kind == "input":
                data = message.get("data", "")
                bytes_in += len(data)
                session.proc.write(data)
            elif kind == "resize":
                try:
                    manager.resize(
                        session.terminal_id,
                        int(message["cols"]),
                        int(message["rows"]),
                    )
                except (KeyError, TypeError, ValueError):
                    continue
    except WebSocketDisconnect:
        pass
    finally:
        out_task.cancel()
        cleanup_result = manager.close(session.terminal_id)
        # Emit before joining the reader: when the client vanishes, this
        # coroutine may be CANCELLED rather than receive a disconnect frame,
        # and any await below can raise CancelledError immediately. The
        # emits are synchronous appends and must not be skipped.
        _emit(get_event_stream, "terminal.bytes", {"byte_count": bytes_in, "direction": "in"})
        _emit(get_event_stream, "terminal.bytes", {"byte_count": bytes_out, "direction": "out"})
        if child_exited:
            _emit(get_event_stream, "terminal.exited", {"exit_code": 0})
        _emit(get_event_stream, "terminal.closed", {"cleanup_result": cleanup_result})
        try:
            await asyncio.shield(asyncio.gather(reader_task, return_exceptions=True))
        except asyncio.CancelledError:
            pass
