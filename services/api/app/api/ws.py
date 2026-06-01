"""WebSocket route (unprefixed): minimal hello + echo.

Establishes the bidirectional WS half of the typed-HTTP + WebSocket seam — the
transport the embedded terminal (xterm.js) will later ride. No auth in this
slice (loopback only; the security posture lands with the first real endpoint).
"""
from __future__ import annotations

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()


@router.websocket("/ws")
async def ws(websocket: WebSocket) -> None:
    await websocket.accept()
    await websocket.send_json({"type": "hello"})
    try:
        while True:
            text = await websocket.receive_text()
            await websocket.send_json({"echo": text})
    except WebSocketDisconnect:
        return
