# Superseded Plans

This folder holds draft plans that predate the completed kai-chattr architecture-runtime parity decision.

Current runtime authority is locked by `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md`:

- `apps/web` Vite workbench: `8800`
- `services/api` API/WebSocket: `8840`
- MCP streamable HTTP: `8841`
- MCP SSE: `8842`

Any plan in this folder that treats `8300`, `8301`, or `8302` as kai-chattr runtime authority is historical only and must not be executed without rewriting it against the current runtime contract.
