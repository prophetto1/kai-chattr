# kai-chattr Workbench Live Runtime Store Implementation Plan

Feature name: Workbench live runtime store and Board workflow completion
Goal: Replace isolated mock/local workbench state with the current kai-chattr runtime contract.
Architecture: Vite app on `8800` -> Vite proxy `/api` and `/ws` -> FastAPI runtime on `8840` -> existing stores and MCP bridge.
Tech stack: React 19, React Router v7, Vite, shadcn/ui source components, Vercel AI Elements / AI SDK React source components, TanStack Query, Zustand, native browser WebSocket, FastAPI, SQLAlchemy/Alembic/Neon where persistence already exists.
Status: Draft revised after structural audit. Ready for re-evaluation. Do not execute until approved.
Author: Codex
Date: 2026-06-07

## Evaluation Disposition

Evaluation source: `docs/plans/kai-chattr-workbench-live-runtime-store-plan-audit.md`

Mode: `address-evaluation-results` Mode 1 - Plan Revision. This revision edits the plan document only.

| # | Audit finding | Classification | Plan-file decision |
|---|---|---|---|
| 1 | WebSocket payload contract is under-specified | Confirmed | Added locked inbound and outbound WebSocket protocol tables. |
| 2 | REST mutation contracts are not locked | Confirmed | Added REST model and route contract tables with auth, request, response, and error behavior. |
| 3 | Job message route inventory is incomplete | Confirmed | Added `GET /api/jobs/{job_id}/messages` and `POST /api/jobs/{job_id}/messages/{msg_index}/resolve`; corrected delete placeholder to `{msg_id}`. |
| 4 | Frontend inventory needs type counts and mount points | Confirmed | Added typed inventory counts and mount-point table. |
| 5 | Tasks are too coarse and omit commit messages | Confirmed | Split the execution sequence and added per-task verification plus commit messages. |

Accuracy gate result: proceed. No Critical finding was contradicted or obsolete, and the audit already removed the Edge Functions objection. Edge Functions remain out of scope unless Jon explicitly approves a new architecture decision.

## Objective

Complete the next required kai-chattr workbench slice by building a frontend live runtime store that uses the stack decisions already locked for `apps/web` and `services/api`.

The implementation must:

1. Use the existing FastAPI `/ws?token=...` runtime stream and existing REST routes as the source of truth.
2. Use native browser WebSocket, a typed protocol reducer, Zustand for live room state, and TanStack Query for snapshots and mutations.
3. Keep all backend persistence decisions aligned with the current writing-system parity contract: Neon and Alembic for SQL-backed slices, no Supabase, no Drizzle, no Prisma, and no local Docker Postgres.
4. Make the Board a product/workflow UI, not a REST/MCP status surface.
5. Prove that REST, WebSocket, and MCP-backed mutations converge into the same browser-visible state.

This plan supersedes `docs/plans/kai-chattr-workbench-board-runtime-recovery-implementation-plan.md` for execution. That older draft remains historical evidence and must not be executed as written.

## Current-State Findings

### Runtime Contract

The current runtime contract is:

```text
browser
  -> apps/web Vite dev server on 127.0.0.1:8800
  -> Vite proxy for /api, /uploads, /ws
  -> services/api FastAPI runtime on 127.0.0.1:8840
  -> existing local stores, SQLAlchemy-backed rule store when KAI_CHATTR_DATABASE_URL is injected, and MCP bridge
```

The implementation must not introduce `8300`, `8301`, `8302`, backend-served workbench HTML, or `/api/session`.

### Confirmed Gaps

1. `apps/web/src/main.tsx` mounts only the router and has no TanStack `QueryClientProvider`.
2. `apps/web/src/lib/chattr-api.ts` has REST helpers and session-token lookup, but no WebSocket URL helper.
3. `apps/web/src/routes/workbench.tsx` still uses `initialMessages` and appends composer messages to local React state only.
4. `apps/web/src/routes/workbench.tsx` contains stale local preview references to `http://localhost:1717/workbench`.
5. `apps/web/src/components/workbench/BoardDock.tsx` owns isolated local REST snapshot state and refetches after each mutation instead of subscribing to a shared live room store.
6. `BoardDock` exposes pinned items through manual message id entry instead of a first-class message-row pin workflow.
7. `BoardDock` has no rule Remind action even though `/api/rules/remind` exists.
8. `/ws` already broadcasts runtime events for messages, status, settings, rules, jobs, locked items, todos, and history bootstrap, but the frontend workbench does not consume it.
9. Existing backend and MCP routes already mutate the same store surfaces for rules, jobs, locked items, pins/todos, and messages; the missing work is browser runtime convergence and UX completion.
10. `POST /api/send` is an agent Bearer-token route, not the browser composer path. The browser composer must send through the existing `/ws` `message` command.

### Investigation Manifest

Full files read:

1. `WORKER-ACCESS.md`
2. `E:/writing-system/__start-here/README.md`
3. `AGENTS.md`
4. `apps/web/AGENTS.md`
5. `docs/plans/README.md`
6. `docs/writing-system-parity-no-supabase.md`
7. `docs/neon-data-plane.md`
8. `governance/contracts/architecture.json`
9. `governance/contracts/frontend.json`
10. `package.json`
11. `apps/web/package.json`
12. `apps/web/vite.config.ts`
13. `apps/web/tsconfig.json`
14. `apps/web/src/main.tsx`
15. `apps/web/src/lib/chattr-api.ts`
16. `apps/web/src/routes/workbench.tsx`
17. `apps/web/src/components/workbench/BoardDock.tsx`
18. `apps/web/src/components/workbench/board/types.ts`
19. `playwright.config.ts`
20. `tests/e2e/workbench-runtime.spec.ts`
21. `services/api/app/websocket.py`
22. `services/api/app/context.py`
23. `services/api/app/security.py`
24. `services/api/app/observability/runtime.py`
25. `services/api/app/routes/agents.py`
26. `services/api/app/routes/jobs.py`
27. `services/api/app/routes/locked.py`
28. `services/api/app/routes/messages.py`
29. `services/api/app/routes/pins.py`
30. `services/api/app/routes/platform.py`
31. `services/api/app/routes/right_rail.py`
32. `services/api/app/routes/rules.py`
33. `services/api/app/routes/sessions.py`
34. `services/api/app/routes/status.py`
35. `services/api/app/stores/jobs.py`
36. `services/api/app/stores/locked.py`
37. `services/api/app/stores/messages.py`
38. `services/api/tests/conftest.py`
39. `services/api/tests/test_database_runtime.py`
40. `services/api/tests/test_platform_api.py`
41. `services/api/tests/test_runtime_contract.py`
42. `services/api/tests/test_runtime_observability.py`

Targeted search evidence:

1. `services/api/app/main.py` confirms existing `/ws` bootstrap and broadcasts for `message`, `status`, `settings`, `rule`, `job`, `locked`, `todo_update`, `history_batch`, `clear`, and `rules_remind`.
2. `services/api/app/main.py` confirms browser composer input is the `/ws` inbound `message` command.
3. `services/api/app/routes/jobs.py` confirms `GET /api/jobs/{job_id}/messages`, `POST /api/jobs/{job_id}/messages`, `DELETE /api/jobs/{job_id}/messages/{msg_id}`, and `POST /api/jobs/{job_id}/messages/{msg_index}/resolve`.
4. `services/api/app/mcp/bridge.py` confirms MCP tools use the same rules, jobs, pins/todos, and locked stores as the REST routes.
5. `services/api/tests/test_mcp_right_rail_tools.py` confirms existing MCP/right-rail lifecycle coverage.
6. `git status --short --branch` confirms unrelated dirty backend changes in `services/api/app/cli.py`, `services/api/app/main.py`, `services/api/app/stores/rules.py`, `services/api/app/stores/rules_db.py`, `services/api/tests/test_database_runtime.py`, and `services/api/tests/test_runtime_contract.py`.

## Proposed Architecture

### Frontend State Layers

Use four layers:

1. Transport: native `WebSocket` connected to `/ws?token=...`.
2. Protocol: typed event definitions and normalization for existing backend event shapes.
3. Reducer: pure reducer that applies bootstrap and delta events to a normalized room model.
4. Runtime store: Zustand store that owns connection state, room state, optimistic UI markers, and dispatch actions.

TanStack Query must own REST snapshots and mutations. Query results can hydrate or reconcile the Zustand live room store, but query cache must not replace the live room store.

### Data Flow

```text
initial browser load
  -> AppProviders initializes QueryClientProvider
  -> WorkbenchPage mounts one useChattrRoom instance
  -> useChattrRoom opens /ws?token=...
  -> /ws sends settings, agents, base_colors, todos, rules, jobs, locked_items, history_batch, status
  -> reducer normalizes room state into Zustand

browser chat send
  -> ChatComposer sends {"type":"message","text":...,"attachments":...,"channel":...} over /ws
  -> backend store.add persists in MessageStore
  -> backend broadcasts {"type":"message","data": ChattrMessage}
  -> reducer applies the broadcast to all connected browser tabs

Board mutation from UI
  -> TanStack mutation calls existing REST route with X-Session-Token
  -> backend store callback broadcasts event on /ws
  -> reducer applies event to every connected browser tab
  -> query invalidation only repairs drift or recovers from missed events
```

### Board UX Flow

Board must present three workflow groups: Rules, Decisions, and Pinned.
Jobs must move out of Board and render as a standalone top-level dock tab backed by the existing jobs data plane.

Rules:

- Create, edit, enable or disable, delete, and Remind.
- Remind must call `POST /api/rules/remind`.
- Do not add rule reorder UI in this slice because no current rule reorder route exists.

Jobs standalone dock:

- Create, update status/title/assignee, reorder within a status group, add/read/delete message associations, resolve suggestion messages, archive/delete.
- Jobs must not render as a Board sub-tab.

Decisions:

- Create, edit, archive, restore, and delete.
- Decisions are the Board-facing label for the existing `/api/locked`, locked WebSocket event, and MCP locked-tool category in this slice.

Pinned:

- Primary path must be pinning a visible message row from the chat transcript.
- Board pinned entries must scroll to and highlight the corresponding transcript message.
- Manual message-id entry must not remain the primary UX.

### Degraded Mode

If `/api/right-rail/capabilities` fails, the Board must still render the default Rules, Decisions, and Pinned tabs with a concise degraded connection state, and Jobs remains a separate dock surface. A capability failure must not leave the user with a dead "Board API error" surface.

## Locked Decisions

1. `apps/web` remains the only browser app surface for `/workbench`.
2. `services/api` remains the runtime API and WebSocket source of truth.
3. No new REST endpoint is required for this slice.
4. No backend route contract changes are required for this slice unless implementation discovers a real mismatch that blocks the verified UX.
5. Native browser WebSocket is sufficient. Do not add `socket.io`, `reconnecting-websocket`, or another socket dependency.
6. Zustand is the live room store.
7. TanStack Query is the REST snapshot and mutation layer.
8. Existing session-token lookup stays in `chattr-api.ts`; do not add `/api/session`.
9. Rules remain the only confirmed Postgres-backed Board slice in this scope.
10. Jobs, locked items, pins/todos, and messages stay on their current store surfaces in this scope.
11. No Supabase package, client, environment variable, or runtime assumption can be introduced.
12. No Drizzle or Prisma package can be introduced.
13. No local Docker Postgres workflow can be introduced.
14. No legacy `E:/chattr/static` UI can be ported as target code.
15. The UI must avoid MCP/REST implementation language in product copy.
16. The browser composer must use the `/ws` `message` command. It must not call `POST /api/send`, because that route requires an agent Bearer registration token.
17. Only one `useChattrRoom` instance may own the WebSocket connection for `/workbench`. Child components must consume Zustand selectors, props, or hook actions without opening duplicate sockets.

## API, Data, Frontend, And Observability Surface

### Existing APIs Consumed

No new API routes are planned.

#### REST Routes Consumed

1. `GET /api/right-rail/capabilities`
2. `GET /api/rules`
3. `POST /api/rules`
4. `PATCH /api/rules/{rule_id}`
5. `DELETE /api/rules/{rule_id}`
6. `POST /api/rules/remind`
7. `GET /api/jobs`
8. `POST /api/jobs`
9. `PATCH /api/jobs/{job_id}`
10. `DELETE /api/jobs/{job_id}`
11. `POST /api/jobs/reorder`
12. `GET /api/jobs/{job_id}/messages`
13. `POST /api/jobs/{job_id}/messages`
14. `DELETE /api/jobs/{job_id}/messages/{msg_id}`
15. `POST /api/jobs/{job_id}/messages/{msg_index}/resolve`
16. `GET /api/locked`
17. `POST /api/locked`
18. `PATCH /api/locked/{locked_id}`
19. `DELETE /api/locked/{locked_id}`
20. `GET /api/pins`
21. `POST /api/pins`
22. `PATCH /api/pins/{message_id}`
23. `DELETE /api/pins/{message_id}`
24. `DELETE /api/pins`
25. `GET /api/messages`
26. `GET /api/status`

`POST /api/send` is deliberately not consumed by the browser workbench. It remains an agent API route protected by `Authorization: Bearer <registration-token>`.

#### WebSocket Route Consumed

1. `GET /ws?token=...`

Auth: query parameter `token` must equal the current session token. Invalid token accepts the socket then closes with code `4003`.

### Shared Frontend Runtime Types

These are TypeScript contracts for the frontend protocol/reducer. They describe the fields the reducer may rely on; backend records may include additional fields and must be tolerated.

```ts
type ChattrMessage = {
  id: number
  sender?: string
  text?: string
  type?: string
  time?: string
  timestamp?: number
  channel?: string
  attachments?: unknown[]
  metadata?: Record<string, unknown>
  reply_to?: number | null
}

type RuleItem = {
  id: number
  text: string
  reason?: string
  status: 'pending' | 'draft' | 'active' | 'archived' | string
  author?: string
  created_at?: number
}

type JobMessage = {
  id: number
  sender?: string
  text?: string
  time?: string
  deleted?: boolean
  attachments?: unknown[]
  type?: string
  resolved?: string
}

type JobItem = {
  id: number
  title: string
  body?: string
  status: 'open' | 'done' | 'archived' | string
  channel?: string
  assignee?: string
  created_by?: string
  updated_at?: number
  sort_order?: number
  messages?: JobMessage[]
}

type LockedItem = {
  id: number
  text: string
  reason?: string
  status: 'active' | 'archived' | string
  created_by?: string
  updated_by?: string
  updated_at?: number
}

type PinItem = {
  message_id: number
  status: 'todo' | 'done'
  message: Pick<ChattrMessage, 'id' | 'sender' | 'text' | 'type' | 'time' | 'timestamp' | 'channel'>
}

type CapabilityTab = {
  id: 'rules' | 'jobs' | 'decisions' | 'pins'
  label: string
  category: 'rules' | 'jobs' | 'locked' | 'pins'
  surface: 'board' | 'dock'
  tools: string[]
}

type RuntimeStatus = Record<string, unknown> & {
  paused?: boolean
}
```

### REST Contract Lock

All browser-used `/api/*` routes require the existing `X-Session-Token` header through `chattrHeaders()`, unless a route is explicitly documented as public elsewhere. The frontend must treat non-2xx responses as failed mutations and surface product-facing errors.

| Route | Request | Response | Error behavior | Frontend use |
|---|---|---|---|---|
| `GET /api/right-rail/capabilities` | no body | `{ tabs: CapabilityTab[] }` | `403` for missing/invalid session token | Right-rail capability snapshot; Board consumes `surface: 'board'`, Jobs consumes `surface: 'dock'`. |
| `GET /api/rules` | no body | `RuleItem[]` | `503` if rules store unavailable | Initial/recovery snapshot. |
| `POST /api/rules` | `{ text?: string, rule?: string, reason?: string, status?: 'active'|'draft'|'pending'|'archived'|'archive', author?: string, sender?: string }` | `RuleItem` | `400` invalid text/status/limit, `503` store unavailable | Create rule/draft/active item. |
| `PATCH /api/rules/{rule_id}` | `{ text?: string, rule?: string, reason?: string, action?: 'edit'|'activate'|'active'|'draft'|'archive'|'archived', status?: same-as-action }` | `RuleItem` | `400` invalid JSON/action, `404` missing/invalid, `503` store unavailable | Edit and status changes. |
| `DELETE /api/rules/{rule_id}` | no body | `{ ok: true, deleted: RuleItem }` | `404` not found, `503` store unavailable | Delete rule. |
| `POST /api/rules/remind` | no body | `{ ok: true }` plus `rules_remind` broadcast | no body-level validation | Remind agents about current rules. |
| `GET /api/jobs?channel=&status=` | optional query `channel`, `status` | `JobItem[]` | standard auth failure | Initial/recovery snapshot for the standalone Jobs dock. |
| `POST /api/jobs` | `{ title: string, type?: string, channel?: string, created_by?: string, anchor_msg_id?: number, assignee?: string, body?: string }` | `JobItem`; also adds a chat breadcrumb message | `400` title required | Create job. |
| `PATCH /api/jobs/{job_id}` | `{ status?: string, title?: string, assignee?: string }` | `JobItem` | `404` not found/invalid | Update job status/title/assignee. |
| `DELETE /api/jobs/{job_id}?permanent=` | optional query `permanent=true` | `JobItem` for archived/deleted result | `404` not found | Archive by default; permanent delete when requested. |
| `POST /api/jobs/reorder` | `{ status?: string, ordered_ids: number[] }` | `{ ok: true, updated: number }` | `400` missing/empty `ordered_ids` | Reorder jobs within one status lane. |
| `GET /api/jobs/{job_id}/messages` | no body | `JobMessage[]` | `404` job not found | Load job thread messages when a job is expanded. |
| `POST /api/jobs/{job_id}/messages` | `{ sender?: string, text?: string, attachments?: unknown[], type?: string }` | `JobMessage` | `400` empty text and attachments, `404` job not found | Add message association/thread entry. |
| `DELETE /api/jobs/{job_id}/messages/{msg_id}` | no body | `{ ok: true, ...deletedMessageResult }` | `404` not found | Soft-delete job message. |
| `POST /api/jobs/{job_id}/messages/{msg_index}/resolve` | `{ resolution?: string }` | `{ ok: true, resolution: string }` | `400` invalid message index, `404` job not found | Resolve suggestion message by index. |
| `GET /api/locked?status=` | optional query `status` | `LockedItem[]` | standard auth failure | Initial/recovery snapshot for Board Decisions. |
| `POST /api/locked` | `{ text: string, reason?: string, sender?: string }` | `LockedItem` | `400` text required | Create decision. |
| `PATCH /api/locked/{locked_id}` | `{ text?: string, reason?: string, sender?: string, action?: 'archive'|'restore' }` | `LockedItem` | `404` not found/invalid | Edit/archive/restore decision. |
| `DELETE /api/locked/{locked_id}` | no body | `{ ok: true, deleted: LockedItem }` | `404` not found | Delete decision. |
| `GET /api/pins?status=` | optional query `status='todo'|'done'` | `PinItem[]` | `400` invalid status, `503` message store unavailable | Initial/recovery snapshot. |
| `POST /api/pins` | `{ message_id: number }` | `PinItem` or `{ ok: true, message_id: number, status: 'todo' }` | `400` message id required, `404` message not found, `503` store unavailable | Pin transcript message. |
| `PATCH /api/pins/{message_id}` | `{ action?: 'done'|'reopen'|'remove', status?: 'done'|'todo' }` | `{ ok: true, message_id: number, status: 'todo'|'done'|null }` | `400` invalid JSON/action, `404` not found/invalid, `503` store unavailable | Complete/reopen/remove pin. |
| `DELETE /api/pins/{message_id}` | no body | `{ ok: true, message_id: number, status: null }` | `404` not found/invalid, `503` store unavailable | Remove one pin. |
| `DELETE /api/pins` | no body | `{ ok: true, removed: number[] }` | `503` store unavailable | Clear all pins only if existing UX keeps that action. |
| `GET /api/messages?since_id=&limit=&channel=` | optional query `since_id`, `limit`, `channel` | `ChattrMessage[]` | standard auth failure | Recovery snapshot only; steady-state chat comes from `/ws`. |
| `GET /api/status` | no body | `RuntimeStatus` | standard auth failure | Recovery/status snapshot; `/ws` status event remains primary. |

### WebSocket Protocol Lock

#### Browser to Backend Commands

| Command | Payload | Backend behavior | Frontend use |
|---|---|---|---|
| `message` | `{ type: 'message', text: string, attachments?: unknown[], sender?: string, channel?: string, reply_to?: number }` | Empty text plus empty attachments is ignored. Otherwise backend stores the message and broadcasts `message` with `data: ChattrMessage`. Slash commands are handled by existing backend command branches. | Chat composer submission. |

No other browser-to-backend WebSocket command is required for this slice. Board mutations must use the locked REST contracts above.

#### Backend to Browser Events Consumed By Reducer

| Event | Payload shape | Reducer rule |
|---|---|---|
| `settings` | `{ type: 'settings', data: Record<string, unknown> }` | Replace room settings. |
| `agents` | `{ type: 'agents', data: Record<string, unknown> }` | Replace agent config snapshot. |
| `base_colors` | `{ type: 'base_colors', data: Record<string, { color?: string, label?: string }> }` | Replace base color snapshot. |
| `todos` | `{ type: 'todos', data: Record<string, 'todo'|'done'> }` | Replace pin status map and reconcile with pinned messages when available. |
| `rules` | `{ type: 'rules', data: RuleItem[] }` | Replace rules collection. |
| `jobs` | `{ type: 'jobs', data: JobItem[] }` | Replace jobs collection. |
| `locked_items` | `{ type: 'locked_items', data: LockedItem[] }` | Replace locked collection. |
| `history_batch` | `{ type: 'history_batch', messages: ChattrMessage[], done: boolean }` | Merge messages by `id`; mark history bootstrapped when `done` is true. |
| `status` | `{ type: 'status', data: RuntimeStatus }` | Replace runtime status. |
| `message` | `{ type: 'message', data: ChattrMessage }` | Upsert message by `id` and preserve stable DOM anchor. |
| `rule` | `{ type: 'rule', action: string, data: RuleItem }` | Apply create/update/delete-style delta by action where known; otherwise upsert by `data.id`. |
| `job` | `{ type: 'job', action: string, data: JobItem }` | Apply create/update/delete-style delta by action where known; otherwise upsert by `data.id`. |
| `locked` | `{ type: 'locked', action: string, data: LockedItem }` | Apply create/update/delete-style delta by action where known; otherwise upsert by `data.id`. |
| `todo_update` | `{ type: 'todo_update', data: { id: number, status: 'todo'|'done'|null } }` | Update or remove one pin status by message id. |
| `clear` | `{ type: 'clear', channel?: string }` | Clear messages for the channel when present, otherwise clear visible message history. |
| `rules_remind` | `{ type: 'rules_remind', data: Record<string, never> }` | Record transient rule-remind acknowledgement if needed; do not alter rule rows. |

#### Known Events Classified As Ignored For This Slice

The reducer must not crash on known non-Board events. It must record the last ignored event type for diagnostics and continue.

Known ignored event types for this slice: `typing`, `hats`, `schedules`, `schedule`, `session`, `pending_instance`, `agent_renamed`, `reload`, `delete`, `edit`, `message_update`, and any unknown string.

If implementation discovers one of these events is required for the locked acceptance contract, stop and revise this plan before widening the reducer scope.

### Data Surface

No new database migration is planned.

The implementation must not change persistence for jobs, locked items, pins/todos, or messages. If a later durable persistence requirement is approved, it must be handled as a separate Neon/Alembic plan.

### Frontend Surface

#### Frontend Inventory Counts

| Type | Count | Files |
|---|---:|---|
| New pages/routes | 0 | None |
| New providers | 1 | `apps/web/src/providers/AppProviders.tsx` |
| New hooks | 1 | `apps/web/src/hooks/use-chattr-room.ts` |
| New stores | 1 | `apps/web/src/stores/chattr-room-store.ts` |
| New protocol/reducer libraries | 2 | `apps/web/src/lib/chattr-room-protocol.ts`, `apps/web/src/lib/chattr-room-reducer.ts` |
| New workbench components | 2 | `apps/web/src/components/workbench/ChatTranscript.tsx`, `apps/web/src/components/workbench/ChatComposer.tsx` |
| New frontend support libraries | 1 | `apps/web/src/lib/query-client.ts` |
| Modified pages/routes | 1 | `apps/web/src/routes/workbench.tsx` |
| Modified app entry files | 1 | `apps/web/src/main.tsx` |
| Modified frontend service libraries | 1 | `apps/web/src/lib/chattr-api.ts` |
| Modified workbench components/type modules | 2 | `apps/web/src/components/workbench/BoardDock.tsx`, `apps/web/src/components/workbench/board/types.ts` |
| Modified browser tests | 1 | `tests/e2e/workbench-runtime.spec.ts` |
| New backend test files | 1 | `services/api/tests/test_workbench_live_events.py` |

#### New Frontend Files

1. `apps/web/src/lib/query-client.ts`
2. `apps/web/src/providers/AppProviders.tsx`
3. `apps/web/src/lib/chattr-room-protocol.ts`
4. `apps/web/src/lib/chattr-room-reducer.ts`
5. `apps/web/src/stores/chattr-room-store.ts`
6. `apps/web/src/hooks/use-chattr-room.ts`
7. `apps/web/src/components/workbench/ChatTranscript.tsx`
8. `apps/web/src/components/workbench/ChatComposer.tsx`

#### Existing Files To Modify

1. `apps/web/src/main.tsx`
2. `apps/web/src/lib/chattr-api.ts`
3. `apps/web/src/routes/workbench.tsx`
4. `apps/web/src/components/workbench/BoardDock.tsx`
5. `apps/web/src/components/workbench/board/types.ts`
6. `tests/e2e/workbench-runtime.spec.ts`

Backend test file to add:

1. `services/api/tests/test_workbench_live_events.py`

#### Mount Points

| Artifact | Mount point | Ownership rule |
|---|---|---|
| `AppProviders` | Wraps `RouterProvider` in `apps/web/src/main.tsx`. | Owns `QueryClientProvider`; no route changes. |
| `useChattrRoom` | Called once in `WorkbenchPage` in `apps/web/src/routes/workbench.tsx`. | Opens the only `/ws` connection for the page. |
| `ChatTranscript` | Replaces inline `ConversationContent` message mapping in the center chat panel of `WorkbenchPage`. | Reads normalized messages and exposes stable message row anchors plus pin controls. |
| `ChatComposer` | Replaces inline `PromptInput` composer block in the center chat panel of `WorkbenchPage`. | Sends browser chat through the `/ws` `message` command, not `POST /api/send`. |
| `BoardDock` runtime state | Existing Board dock tab in `WorkbenchPage`. | Consumes shared Zustand state and TanStack mutation actions; must not own final REST snapshot state or open another socket. |

Dependency changes:

1. None expected.
2. If implementation requires a package not already in `governance/contracts/architecture.json`, stop and request a plan amendment before adding it.

### Observability Surface

No new backend spans, metrics, or log streams are planned.

Reason: this slice consumes the existing backend `/ws` and REST route behavior. It does not add a new backend runtime seam or persistence operation. Existing runtime observability in `services/api/app/observability/runtime.py` remains the backend observability boundary.

The frontend must expose visible connection and degraded states in the UI. Those are product states, not a new telemetry contract.

## Locked Inventory Counts

1. Full files read during investigation: 42
2. Targeted searched files: 6
3. New implementation files planned: 9
4. Existing files planned for modification: 6
5. New REST endpoints planned: 0
6. Modified REST endpoints planned: 0
7. New WebSocket routes planned: 0
8. New database migrations planned: 0
9. New dependencies planned: 0
10. Moved or copied legacy files planned: 0
11. REST routes consumed by browser workbench: 26
12. Browser-to-backend WebSocket commands consumed: 1
13. Backend-to-browser WebSocket events reduced: 16

## Implementation Tasks

### Task 1 - Add Query Provider

Files:

- `apps/web/src/lib/query-client.ts`
- `apps/web/src/providers/AppProviders.tsx`
- `apps/web/src/main.tsx`

Actions:

1. Create a shared `QueryClient` with conservative retry behavior for operator-local runtime work.
2. Create `AppProviders` that wraps children with `QueryClientProvider`.
3. Wrap `RouterProvider` with `AppProviders`.
4. Keep existing router entries unchanged.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): add app query provider`

### Task 2 - Add WebSocket URL Helper

Files:

- `apps/web/src/lib/chattr-api.ts`

Actions:

1. Add `chattrWebSocketUrl(path = "/ws")`.
2. Derive `ws:` or `wss:` from the current browser origin.
3. Preserve existing token lookup order.
4. Append the token as the existing backend expects: `/ws?token=...`.
5. Do not introduce `/api/session`.

Verification:

- `pnpm run test:no-api-session-contract`
- `pnpm --dir apps/web run build`

Commit: `feat(web): add chattr websocket url helper`

### Task 3 - Define Room Protocol Types

Files:

- `apps/web/src/lib/chattr-room-protocol.ts`
- `apps/web/src/components/workbench/board/types.ts`

Actions:

1. Add the shared frontend runtime types locked in this plan.
2. Add discriminated unions for the 16 backend-to-browser events reduced by this plan.
3. Add the browser-to-backend `message` command type.
4. Add a typed ignored-event representation for known and unknown ignored events.
5. Re-export Board-compatible item types without replacing the existing Board lane normalizers.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): define chattr room protocol`

### Task 4 - Implement Bootstrap Reducer

Files:

- `apps/web/src/lib/chattr-room-reducer.ts`
- `apps/web/src/lib/chattr-room-protocol.ts`

Actions:

1. Create the normalized room-state shape.
2. Apply `settings`, `agents`, `base_colors`, `todos`, `rules`, `jobs`, `locked_items`, `history_batch`, and `status`.
3. Merge `history_batch.messages` by `id`.
4. Mark history bootstrap complete only when `history_batch.done` is true.
5. Keep the reducer independent of React and browser APIs.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): reduce chattr room bootstrap events`

### Task 5 - Implement Delta Reducer

Files:

- `apps/web/src/lib/chattr-room-reducer.ts`

Actions:

1. Apply `message` by upserting `data.id`.
2. Apply `rule`, `job`, and `locked` by action when known and by upsert fallback when unknown.
3. Apply `todo_update` by adding/updating/removing one pin status.
4. Apply `clear` by channel when present and globally when absent.
5. Apply `rules_remind` as a transient acknowledgement without changing rule rows.
6. Record ignored event types without throwing.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): reduce chattr room delta events`

### Task 6 - Add Zustand Room Store

Files:

- `apps/web/src/stores/chattr-room-store.ts`
- `apps/web/src/lib/chattr-room-reducer.ts`

Actions:

1. Store normalized room state in Zustand.
2. Add selectors for messages, rules, jobs, locked items, pins, connection state, and degraded state.
3. Add dispatch actions that accept typed protocol events.
4. Add reset and rehydrate actions for reconnect recovery.
5. Do not open a WebSocket in this store file.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): add chattr room zustand store`

### Task 7 - Add WebSocket Lifecycle Hook

Files:

- `apps/web/src/hooks/use-chattr-room.ts`
- `apps/web/src/lib/chattr-api.ts`
- `apps/web/src/stores/chattr-room-store.ts`

Actions:

1. Open one native `WebSocket` using `chattrWebSocketUrl("/ws")`.
2. Dispatch parsed backend events through the reducer/store.
3. Track connecting, open, closed, and error states.
4. Reconnect with bounded backoff.
5. Treat close code `4003` as invalid session token state.
6. Expose a `sendMessage` action that sends the locked WebSocket `message` command.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): connect workbench room websocket`

### Task 8 - Add Snapshot And Mutation Helpers

Files:

- `apps/web/src/hooks/use-chattr-room.ts`
- `apps/web/src/lib/chattr-api.ts`
- `apps/web/src/stores/chattr-room-store.ts`

Actions:

1. Add TanStack Query snapshot reads for capabilities, rules, jobs, locked items, pins, messages, and status.
2. Add mutation helpers for every locked Board REST mutation.
3. Do not add `POST /api/send` as a browser mutation helper.
4. Invalidate only the relevant snapshot query after each mutation.
5. Rehydrate Zustand from snapshots when reconnecting or when a mutation response returns before the matching broadcast arrives.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): add workbench runtime mutations`

### Task 9 - Add Reconciliation And Duplicate Guards

Files:

- `apps/web/src/stores/chattr-room-store.ts`
- `apps/web/src/lib/chattr-room-reducer.ts`
- `apps/web/src/hooks/use-chattr-room.ts`

Actions:

1. Ensure history bootstrap and live messages cannot duplicate the same message id.
2. Ensure mutation response rehydration does not duplicate a later broadcast.
3. Preserve stable message anchors across updates.
4. Keep unknown or ignored events non-fatal.

Verification:

- `pnpm --dir apps/web run build`

Commit: `fix(web): guard workbench room reconciliation`

### Task 10 - Replace Mock Chat Transcript

Files:

- `apps/web/src/routes/workbench.tsx`
- `apps/web/src/components/workbench/ChatTranscript.tsx`

Actions:

1. Remove `initialMessages` as operational chat state.
2. Render chat history from the shared room store.
3. Preserve Vercel AI Elements message, reasoning, tool, and source surfaces where current message metadata supports them.
4. Add stable `data-message-id` anchors for each message row.
5. Render visible connection/empty/history-loading states without implementation jargon.

Verification:

- `pnpm --dir apps/web run build`

Commit: `feat(web): render workbench chat from runtime`

### Task 11 - Replace Mock Chat Composer

Files:

- `apps/web/src/routes/workbench.tsx`
- `apps/web/src/components/workbench/ChatComposer.tsx`
- `apps/web/src/hooks/use-chattr-room.ts`

Actions:

1. Move the current PromptInput composition into `ChatComposer`.
2. Submit composer text and attachments through `sendMessage`.
3. Clear the local composer draft only after the WebSocket command is accepted for send.
4. Keep model picker, speech input, attachment UI, and web-search toggle behavior unless those controls depend on mock-only state.
5. Remove stale `localhost:1717` preview references or replace them with the current `8800` workbench URL.

Verification:

- `pnpm --dir apps/web run build`
- `pnpm run test:workbench-browser`

Commit: `feat(web): send workbench chat over websocket`

### Task 12 - Mount Single Runtime Hook

Files:

- `apps/web/src/routes/workbench.tsx`
- `apps/web/src/hooks/use-chattr-room.ts`

Actions:

1. Mount `useChattrRoom` once in `WorkbenchPage`.
2. Pass runtime actions to `ChatTranscript`, `ChatComposer`, and `BoardDock` by props or shared store selectors.
3. Prevent child components from opening duplicate WebSocket connections.
4. Preserve existing right-dock tab layout.

Verification:

- `pnpm --dir apps/web run build`

Commit: `refactor(web): mount one workbench room runtime`

### Task 13 - Convert BoardDock Read State

Files:

- `apps/web/src/components/workbench/BoardDock.tsx`
- `apps/web/src/components/workbench/board/types.ts`
- `apps/web/src/hooks/use-chattr-room.ts`

Actions:

1. Remove isolated final-state ownership for rules, jobs, locked items, and pins.
2. Read Board collections from the shared Zustand room store.
3. Keep local form/draft/edit state inside `BoardDock`.
4. Load capability tabs through TanStack Query.
5. Add default capability tabs when capability fetch fails.
6. Replace steady-state "Board API error" with a degraded connection banner and usable tabs.

Verification:

- `pnpm --dir apps/web run build`

Commit: `refactor(web): read board state from runtime store`

### Task 14 - Convert BoardDock Mutations

Files:

- `apps/web/src/components/workbench/BoardDock.tsx`
- `apps/web/src/hooks/use-chattr-room.ts`

Actions:

1. Route rule create/update/delete/remind through locked mutation helpers.
2. Route job create/update/delete/reorder/message add/message read/message delete/message resolve through locked helpers.
3. Route locked create/update/archive/restore/delete through locked helpers.
4. Route pin create/update/delete/clear through locked helpers where the current UI keeps those actions.
5. Keep workflow labels product-facing.

Verification:

- `pnpm --dir apps/web run build`
- `pnpm run test:workbench-browser`

Commit: `feat(web): mutate board through runtime contracts`

### Task 15 - Add Message Pin Workflow

Files:

- `apps/web/src/components/workbench/ChatTranscript.tsx`
- `apps/web/src/components/workbench/BoardDock.tsx`
- `apps/web/src/hooks/use-chattr-room.ts`
- `tests/e2e/workbench-runtime.spec.ts`

Actions:

1. Add a pin control to each eligible message row.
2. Call the existing pins route through the runtime mutation helper.
3. Show pinned messages in Board Pinned.
4. On pinned item click, scroll to and highlight the transcript message.
5. Remove or demote manual message-id entry so it is not the primary path.

Verification:

- `pnpm run test:workbench-browser`

Commit: `feat(web): pin transcript messages to board`

### Task 16 - Add Backend Runtime Event Contract Tests

Files:

- `services/api/tests/test_workbench_live_events.py`

Actions:

1. Test `/ws` auth failure closes with the existing session-token contract.
2. Test `/ws` success sends bootstrap events with the locked payload shapes.
3. Test browser `message` command broadcasts a `message` event with `data`.
4. Test rule mutation broadcasts a `rule` event with `action` and `data`.
5. Test job mutation broadcasts a `job` event with `action` and `data`.
6. Test locked mutation broadcasts a `locked` event with `action` and `data`.
7. Test pin/todo mutation broadcasts `todo_update` with `data.id` and `data.status`.
8. Test history bootstrap uses `history_batch.messages` and `history_batch.done`.

Verification:

- `cd services/api; uv run pytest -q tests/test_workbench_live_events.py`

Commit: `test(api): lock workbench live event shapes`

### Task 17 - Expand Browser Runtime Tests

Files:

- `tests/e2e/workbench-runtime.spec.ts`
- Workbench components as needed for stable `data-testid` attributes.

Actions:

1. Keep existing route and right-rail assertions.
2. Add a composer-to-runtime message test.
3. Add a two-page live update test for Board state.
4. Add a Remind action test.
5. Add a message-row pin to Board Pinned navigation test.
6. Add a capability failure test that proves default tabs remain usable.
7. Verify the browser never calls `/api/session`.
8. Verify the browser does not call `POST /api/send`.

Verification:

- `pnpm run test:workbench-browser`

Commit: `test(web): prove workbench runtime convergence`

## Tests And Verification

Run these checks before claiming implementation complete:

```powershell
pnpm run check:contracts
pnpm run check:deps
pnpm run test:no-api-session-contract
pnpm run test:no-supabase-contract
pnpm run test:runtime-contract
pnpm --dir apps/web run build
cd services/api; uv run pytest -q tests/test_workbench_live_events.py tests/test_mcp_right_rail_tools.py tests/test_runtime_contract.py tests/test_database_runtime.py
pnpm run test:workbench-browser
```

If a dev runtime is already running, also run:

```powershell
node scripts/dev/verify-runtime.mjs
```

Expected results:

1. No forbidden `/api/session` usage.
2. No Supabase dependency, client, environment variable, or route contract.
3. No dependency allowlist drift.
4. Workbench builds under `apps/web`.
5. Backend WebSocket contract tests pass.
6. Browser test proves live state convergence across tabs.
7. Browser composer uses `/ws` and not `POST /api/send`.
8. Board remains usable in degraded capability state.

## Risks And Rollback

### Risks

1. The worktree currently has unrelated dirty backend changes. Implementation must not overwrite them.
2. The frontend has Playwright coverage but no dedicated frontend unit test runner in the current stack. Reducer coverage can be added later only with an approved test-runner decision.
3. `/ws` uses query-token auth because that is the current backend contract. Hosted production hardening might need a later auth transport decision.
4. Jobs, locked items, pins/todos, and messages are not all SQL-backed yet. This plan intentionally does not solve durable persistence for those slices.
5. WebSocket event shapes in `services/api/app/main.py` are existing behavior, not a separately versioned protocol. The reducer must be tolerant of unknown fields.
6. The browser composer has to use WebSocket send because the current REST send route is an agent Bearer-token route. If browser REST send is desired later, that is a separate backend API plan.

### Rollback

Rollback is file-level:

1. Revert the new frontend runtime files.
2. Revert the `main.tsx`, `chattr-api.ts`, `workbench.tsx`, `BoardDock.tsx`, `board/types.ts`, and Playwright test edits.
3. Revert `services/api/tests/test_workbench_live_events.py`.
4. No database rollback is required because no migrations are planned.

## Completion Criteria

Implementation is complete only when all criteria are met:

1. `/workbench` renders chat from backend runtime history, not `initialMessages`.
2. Composer submission reaches the backend through `/ws` and appears through the shared room state.
3. The browser does not call `POST /api/send`.
4. Rules, jobs, locked items, and pins use shared live room state.
5. Two browser pages converge after one page mutates Board data.
6. Rule Remind is available and calls `POST /api/rules/remind`.
7. A user can pin from a transcript message row, then click the Board pinned item to return to that message.
8. Capability fetch failure leaves the Board usable with default tabs.
9. The implementation adds no new dependency.
10. The implementation adds no Supabase, Drizzle, Prisma, local Docker Postgres, `/api/session`, or legacy static UI.
11. Verification commands in this plan pass, or any failure is documented with root cause and next action.
