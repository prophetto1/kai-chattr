# Manual Multi-Agent Chat Bridge Implementation Plan

**Goal:** Make the clean kai-chattr frontend at `http://127.0.0.1:8800/workbench` run a real manual multi-agent Chattr session against the kai-chattr backend on `8300`, so manually launched CLI wrappers from `E:/kai-chattr/services/api` appear active, receive @mentions, and respond in the browser transcript.

**Architecture:** `apps/web` is the working frontend. `services/api` is the backend/API/WebSocket/runtime authority. The browser page is not `8300/workbench`; `8300` supplies APIs, WebSocket, session bootstrap, wrapper registration, message routing, MCP bridge, and stores. The implementation ports the legacy `E:/chattr/static/chat.js` behavior contract into the clean React/Vite app using shadcn/ui and Vercel AI Elements, while keeping legacy static UI as behavior reference only.

**Tech Stack:** React 19, Vite 7, TypeScript, shadcn/ui source components, Vercel AI Elements / AI SDK React source components, WebSocket, FastAPI, Uvicorn, pytest, existing Chattr wrappers, existing MCP bridge.

**Status:** Draft
**Author:** Jon requirement / Codex plan
**Date:** 2026-06-07

---

## Objective

This plan fixes the actual migrated-repo gap:

1. `E:/kai-chattr/apps/web` on `8800` must be the browser workbench.
2. `E:/kai-chattr/services/api` on `8300` must be the backend runtime.
3. Manual wrappers launched from `E:/kai-chattr/services/api` must register with `8300`.
4. The `8800` workbench must connect to `8300` for session bootstrap, WebSocket room state, Board APIs, message history, agent roster, and chat sends.
5. The user must be able to manually launch Claude/Codex/Gemini and run one multi-agent session from the `8800` workbench.

This is not the browser launcher plan. This is the prerequisite manual bridge.

---

## Current-State Findings

### What works in `E:/chattr`

Legacy `E:/chattr/static/chat.js` is the behavior reference:

- It reads `window.__SESSION_TOKEN__`.
- It opens `/ws?token=...`.
- It consumes `history_batch`, `agents`, `base_colors`, `status`, `pending_instance`, and message events.
- It sends browser chat as WebSocket `{ type: "message", text, sender, channel, attachments }`.
- It updates roster/naming state for manually launched agents.

### What exists in `E:/kai-chattr/services/api`

The backend has most of the runtime needed for this slice:

- `services/api/config.toml` keeps Web/API/WebSocket on `8300`.
- `services/api/config.toml` keeps MCP on `8301` and `8302`.
- `services/api/app/websocket.py` registers `/ws`.
- `services/api/app/routes/messages.py` registers `/api/messages` and `/api/send`.
- `services/api/app/routes/status.py` registers `/api/status`.
- `services/api/app/routes/agents.py` registers `/api/label/{name}`.
- `services/api/app/main.py` sends `agents`, `base_colors`, `history_batch`, `status`, and `pending_instance`.
- `services/api/app/main.py` accepts WebSocket `message`, `name_pending`, and `rename_agent`.
- `services/api/app/wrappers/cli.py` registers wrappers at `/api/register` and heartbeats to `/api/heartbeat/{name}`.

### What is missing in `E:/kai-chattr/apps/web`

The current `8800` frontend is not yet a real Chattr client:

- The workbench route is a mock shell.
- The composer appends local state instead of sending to `/ws`.
- There is no room WebSocket hook.
- There is no frontend session bootstrap from `8300`.
- There is no live agent roster from backend `agents` / `base_colors` / `status`.
- The Board dock has session-token helper logic separate from the future chat client.

### Correction to previous bad assumption

`8300/workbench` must not be the target browser page for the new repo. That would collapse the clean frontend back into the backend server and make the migration meaningless.

Correct target:

```text
Browser UI:       http://127.0.0.1:8800/workbench
Backend/API/WS:   http://127.0.0.1:8300
MCP HTTP/SSE:     8301 / 8302
Manual wrappers:  launched from E:/kai-chattr/services/api, registering to 8300
```

---

## Manifest

### Backend API Surface

This slice adds one backend bootstrap endpoint because `8800` cannot use backend-injected HTML tokens.

| Verb / Transport | Path | Action | Status |
|---|---|---|---|
| GET | `/api/session/bootstrap` | Return the current local browser session token to the loopback Vite frontend | New |
| WebSocket | `/ws?token=<session_token>` | Hydrate room state and send browser chat events | Existing - consumed |
| GET | `/api/messages` | Read recent messages for fallback/testing | Existing - consumed |
| GET | `/api/status` | Read runtime status for fallback/testing | Existing - consumed |
| POST | `/api/label/{name}` | Name or rename a pending/active agent | Existing - consumed |
| GET | `/api/right-rail/capabilities` | Board capability discovery | Existing - consumed |
| GET/POST/PATCH/DELETE | `/api/rules`, `/api/jobs`, `/api/locked`, `/api/pins` | Board state and mutations | Existing - consumed |
| POST | `/api/register` | Wrapper registration | Existing - wrapper-only |
| POST | `/api/heartbeat/{name}` | Wrapper heartbeat | Existing - wrapper-only |
| GET | `/api/poll/{name}` | Wrapper queue polling | Existing - wrapper-only |
| POST | `/api/deregister/{name}` | Wrapper deregistration | Existing - wrapper-only |

#### New endpoint contract

`GET /api/session/bootstrap`

- Auth: loopback-only and dev-origin constrained.
- Allowed request origins: `http://127.0.0.1:8800`, `http://localhost:8800`, and no-origin local CLI/test requests.
- Forbidden request origins: any non-loopback origin.
- Request body: none.
- Response: `{ "token": "<session_token>", "websocketPath": "/ws", "apiBase": "", "runtimePort": 8300 }`.
- Touches: current in-memory session token holder only.
- Does not create, persist, or rotate tokens.
- Must not be enabled for arbitrary network clients.

Why this endpoint exists: in the migrated architecture, `apps/web` is served by Vite on `8800`, so it cannot receive the token through backend HTML injection.

### WebSocket Events Consumed By `apps/web`

| Event type | Required effect |
|---|---|
| `settings` | Set username, channels, default mention, history settings |
| `agents` | Populate registered active/pending instances |
| `base_colors` | Populate configured agent families even before wrappers connect |
| `history_batch` | Hydrate transcript |
| `message` | Append a backend-broadcast message |
| `message_update` | Patch existing message |
| `delete` | Remove deleted message ids |
| `clear` | Clear channel transcript |
| `status` | Update availability/busy status |
| `pending_instance` | Open pending-name dialog |
| `agent_renamed` | Update roster and transcript identity |
| `todos` / `todo_update` | Keep pin/todo state coherent |
| `rules`, `jobs`, `locked_items`, `schedules`, `hats` | Keep workbench auxiliary state available |
| `reload` | Rehydrate current room |

### WebSocket Events Sent By `apps/web`

| Event type | Payload |
|---|---|
| `message` | `{ type, text, sender, channel, attachments }` |
| `name_pending` | `{ type, name, label }` |
| `rename_agent` | `{ type, name, label }` |
| `delete` | `{ type, ids }` |
| `todo_add` / `todo_toggle` / `todo_remove` | `{ type, id }` |
| `update_settings` | `{ type, data }` |

### Observability

New backend observability is limited to the new session bootstrap seam.

| Type | Name | Where | Purpose |
|---|---|---|---|
| Structured log | `session.bootstrap.issued` | `services/api/app/routes/session.py` | Audit local bootstrap success without logging token |
| Structured log | `session.bootstrap.rejected` | `services/api/app/routes/session.py` | Audit rejected non-loopback or disallowed-origin attempts |
| Metric/counter if existing runtime metrics support it | `chattr.session.bootstrap.count` | bootstrap route | Count success/reject by result |

Forbidden attributes/log fields:

- raw session token
- provider tokens
- API keys
- full request headers

Allowed fields:

- `origin_allowed`
- `client_host`
- `result`
- `http.status_code`

### Database Migrations

No database migrations.

### Edge Functions

No edge functions.

### Frontend Surface Area

**New pages/routes:** `0`

**New hooks:** `1`

| Hook | File | Purpose |
|---|---|---|
| `useChattrRoom` | `apps/web/src/hooks/use-chattr-room.ts` | Bootstrap session from `8300`, open `/ws`, hydrate transcript/roster/status/pending state, send chat and naming events |

**New components:** `4`

| Component | File | Purpose |
|---|---|---|
| `ChatTranscript` | `apps/web/src/components/workbench/ChatTranscript.tsx` | Render backend messages with Vercel AI Elements |
| `ChatComposer` | `apps/web/src/components/workbench/ChatComposer.tsx` | Send WebSocket `message` events using Vercel AI Elements `PromptInput*` |
| `AgentRosterPanel` | `apps/web/src/components/workbench/AgentRosterPanel.tsx` | Show configured, active, pending, and offline agents |
| `PendingAgentNameDialog` | `apps/web/src/components/workbench/PendingAgentNameDialog.tsx` | Confirm/rename pending instances |

**New frontend libraries:** `1`

| File | Purpose |
|---|---|
| `apps/web/src/lib/chattr-room-protocol.ts` | Typed Chattr WebSocket event and message contracts |

**Edited frontend files:** `5`

| File | Change |
|---|---|
| `apps/web/src/lib/chattr-api.ts` | Add session bootstrap, shared fetch, shared WS URL, token storage in memory/localStorage |
| `apps/web/src/routes/workbench.tsx` | Remove mock chat state; mount live room hook and real chat/roster/naming components |
| `apps/web/src/components/workbench/BoardDock.tsx` | Use shared API/session helper |
| `apps/web/src/components/workbench/WorkbenchCompactRail.tsx` | Show real connection/agent summary |
| `apps/web/src/main.tsx` | Keep `/workbench` as the operational route and remove placeholder-first user path |

### Backend Surface Area

**New backend files:** `1`

| File | Purpose |
|---|---|
| `services/api/app/routes/session.py` | Session bootstrap endpoint for the loopback Vite frontend |

**Edited backend files:** `1`

| File | Change |
|---|---|
| `services/api/app/main.py` | Include the new session route module in `_include_main_route_modules()` |

**New backend tests:** `1`

| File | Purpose |
|---|---|
| `services/api/tests/test_workbench_manual_chat_contract.py` | Verify session bootstrap, `/ws`, initial room events, message send, label endpoint, and protected API behavior |

---

## Locked Decisions

1. `8800/workbench` is the browser acceptance surface.
2. `8300` is API/WebSocket/runtime only for this slice.
3. Manual CLI wrappers are launched from `E:/kai-chattr/services/api`.
4. Legacy static UI is behavior reference only.
5. No browser launcher work is included.
6. No port-backed identity or memory work is included.
7. Human chat sends through WebSocket `message`, not `/api/send`.
8. Board and chat must share one frontend API/session helper.
9. The new bootstrap endpoint is local/dev constrained and must not expose the session token to non-loopback clients.
10. No new frontend or backend dependencies are introduced.

---

## Locked File Inventory

### New files

- `docs/plans/manual-multi-agent-chat-bridge-implementation-plan.md`
- `services/api/app/routes/session.py`
- `services/api/tests/test_workbench_manual_chat_contract.py`
- `apps/web/src/hooks/use-chattr-room.ts`
- `apps/web/src/components/workbench/ChatTranscript.tsx`
- `apps/web/src/components/workbench/ChatComposer.tsx`
- `apps/web/src/components/workbench/AgentRosterPanel.tsx`
- `apps/web/src/components/workbench/PendingAgentNameDialog.tsx`
- `apps/web/src/lib/chattr-room-protocol.ts`

### Edited files

- `services/api/app/main.py`
- `apps/web/src/main.tsx`
- `apps/web/src/routes/workbench.tsx`
- `apps/web/src/lib/chattr-api.ts`
- `apps/web/src/components/workbench/BoardDock.tsx`
- `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`

### Deleted files

None.

---

## Locked Acceptance Contract

The implementation is complete only when all of these are true:

1. `cd E:/kai-chattr/services/api; uv run python run.py` starts the backend on `8300`.
2. `cd E:/kai-chattr; pnpm web:dev` starts the clean frontend on `8800`.
3. Opening `http://127.0.0.1:8800/workbench` bootstraps a session from `8300`.
4. The browser opens `ws://127.0.0.1:8300/ws?token=...` through the configured frontend client/proxy path.
5. The transcript hydrates from backend `history_batch`.
6. The roster shows configured agent families from `base_colors`.
7. Manual `uv run python wrapper.py claude` registers and appears active.
8. Manual `uv run python wrapper.py codex` registers and appears active.
9. Manual `uv run python wrapper.py gemini` registers and appears active.
10. Sending a human message from the `8800` composer stores and broadcasts through `8300`.
11. Mentioning active agents routes work to wrappers and responses appear in the `8800` transcript.
12. Starting a second instance of an agent shows the pending-name dialog and confirms/renames correctly.
13. Board dock loads without `forbidden: invalid or missing session token`.
14. `pnpm web:build` passes.
15. `pnpm check:deps` passes.
16. `pnpm check:contracts` passes.
17. `cd services/api; uv run pytest tests/test_workbench_manual_chat_contract.py` passes.
18. MCP Router Playwright/browser verification confirms `8800/workbench` is the live non-mock working page.

---

## Frozen Manual Launch Contract

Start backend:

```powershell
cd E:\kai-chattr\services\api
$env:UV_PROJECT_ENVIRONMENT="$env:LOCALAPPDATA\chattr\uv-project-env"
uv run python run.py
```

Start frontend:

```powershell
cd E:\kai-chattr
pnpm web:dev
```

Start wrappers in separate consoles:

```powershell
cd E:\kai-chattr\services\api
$env:UV_PROJECT_ENVIRONMENT="$env:LOCALAPPDATA\chattr\uv-project-env"
uv run python wrapper.py claude
uv run python wrapper.py codex
uv run python wrapper.py gemini
```

Open:

```text
http://127.0.0.1:8800/workbench
```

---

## Implementation Tasks

### Task 1: Add backend session bootstrap route

**File(s):** `services/api/app/routes/session.py`, `services/api/app/main.py`

**Step 1:** Add tests first in `services/api/tests/test_workbench_manual_chat_contract.py` proving bootstrap rejects non-loopback/disallowed-origin requests.
**Step 2:** Add `GET /api/session/bootstrap`.
**Step 3:** Return the current session token, websocket path, and runtime port only for allowed local callers.
**Step 4:** Include the route module from `services/api/app/main.py`.
**Step 5:** Ensure the route is exempted from session-token middleware only for the constrained bootstrap contract.

**Test command:** `cd services/api; uv run pytest tests/test_workbench_manual_chat_contract.py`

**Expected output:** Bootstrap tests pass.

### Task 2: Centralize frontend session/API helpers

**File(s):** `apps/web/src/lib/chattr-api.ts`

**Step 1:** Add `bootstrapChattrSession()`.
**Step 2:** Store token in memory and optionally localStorage for local dev continuity.
**Step 3:** Add `getChattrWebSocketUrl()`.
**Step 4:** Keep `chattrJson()` and `chattrHeaders()` as the only REST helper path.
**Step 5:** Do not log the token.

**Test command:** `pnpm web:build`

**Expected output:** Build passes.

### Task 3: Add typed room protocol

**File(s):** `apps/web/src/lib/chattr-room-protocol.ts`

**Step 1:** Define message, agent, status, settings, pending-instance, and event types.
**Step 2:** Add normalizers for unknown backend payloads.
**Step 3:** Keep protocol code UI-free.

**Test command:** `pnpm web:build`

**Expected output:** Build passes.

### Task 4: Implement `useChattrRoom`

**File(s):** `apps/web/src/hooks/use-chattr-room.ts`

**Step 1:** Bootstrap session from `8300`.
**Step 2:** Connect WebSocket.
**Step 3:** Hydrate messages, agents, base agents, status, settings, pending instances, todos, and auxiliary store events.
**Step 4:** Expose `sendMessage`, `namePending`, `renameAgent`, and reconnect state.
**Step 5:** Handle close/error without token leakage.

**Test command:** `pnpm web:build`

**Expected output:** Build passes.

### Task 5: Build live chat and roster components

**File(s):** `ChatTranscript.tsx`, `ChatComposer.tsx`, `AgentRosterPanel.tsx`, `PendingAgentNameDialog.tsx`

**Step 1:** Use Vercel AI Elements for transcript and composer.
**Step 2:** Use shadcn/ui for roster and dialog controls.
**Step 3:** Render live backend state only.
**Step 4:** Remove mock message assumptions.

**Test command:** `pnpm web:build`

**Expected output:** Build passes.

### Task 6: Wire `8800/workbench`

**File(s):** `apps/web/src/routes/workbench.tsx`, `apps/web/src/main.tsx`

**Step 1:** Mount `useChattrRoom`.
**Step 2:** Replace local mock transcript state with live backend state.
**Step 3:** Wire composer sends to WebSocket.
**Step 4:** Show roster and pending-name dialog.
**Step 5:** Ensure `/workbench` is the operational route.

**Test command:** `pnpm web:build`

**Expected output:** Build passes and no mock transcript remains.

### Task 7: Share API helper with Board

**File(s):** `apps/web/src/components/workbench/BoardDock.tsx`

**Step 1:** Remove duplicated token/fetch helpers.
**Step 2:** Use `chattrJson()` from `chattr-api.ts`.
**Step 3:** Verify Board calls include `X-Session-Token`.

**Test command:** `pnpm web:build`

**Expected output:** Build passes.

### Task 8: Verify manually launched multi-agent session

**File(s):** no source edits expected

**Step 1:** Start backend on `8300`.
**Step 2:** Start frontend on `8800`.
**Step 3:** Open `8800/workbench`.
**Step 4:** Launch Claude, Codex, and Gemini wrappers manually.
**Step 5:** Confirm roster active state.
**Step 6:** Send a user message and an @mention message.
**Step 7:** Confirm agent replies appear.
**Step 8:** Confirm Board loads without token errors.

**Test command:** manual runtime verification.

**Expected output:** `8800/workbench` runs a real multi-agent session against `8300`.

### Task 9: Run final checks

**File(s):** no source edits expected

**Commands:**

```powershell
pnpm web:build
pnpm check:deps
pnpm check:contracts
cd services/api
uv run pytest tests/test_workbench_manual_chat_contract.py
```

**Expected output:** All commands exit `0`.

### Task 10: Run browser verification

**File(s):** no source edits expected unless bugs are found

**Step 1:** Use MCP Router Playwright/browser tooling against `http://127.0.0.1:8800/workbench`.
**Step 2:** Capture screenshot evidence.
**Step 3:** Confirm live transcript, composer, roster, pending dialog, and Board render without token errors or overlap.

**Expected output:** Auditable browser evidence that the clean frontend is the working page.

---

## Auditor Checklist

Auditors should reject the implementation if:

1. It makes `8300/workbench` the target UI.
2. It treats `8800` as a throwaway demo instead of the working frontend.
3. It copies legacy static UI.
4. It leaves mock chat state in the workbench.
5. It sends human chat through local React state only.
6. It adds launcher behavior before manual multi-agent chat works.
7. It introduces plaintext secrets or provider credentials.
8. It adds unapproved dependencies.
9. It cannot show Claude/Codex/Gemini active in one `8800` session.

---

## Completion Criteria

The slice is complete only when `http://127.0.0.1:8800/workbench` is the live working page for a manual multi-agent session and `8300` is only the backend runtime it talks to.

