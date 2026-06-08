Legacy source files read in full for this audit:

None. This audit evaluated the kai-chattr implementation plan against current kai-chattr repo reality. It did not perform a new full-file legacy `E:/chattr` runtime recovery pass.

# Kai Chattr Workbench Live Runtime Store Plan Audit

**Plan reviewed:** `docs/plans/kai-chattr-workbench-live-runtime-store-implementation-plan.md`

**Audit type:** Pre-implementation plan evaluation

**Date:** 2026-06-07

**Skills used:** `evaluating-plan-before-implementation`, `waza-hunt`

**Verdict:** Revise - Structural

## Correction Applied

Edge Functions are no longer a required kai-chattr planning surface.

Do not treat a missing Edge Functions section or zero-case as a structural deficiency for this repo. Kai-chattr does not use Supabase Edge Functions, Cloudflare Pages Functions, or any Edge Functions layer for this workbench runtime slice unless Jon explicitly approves a new architecture decision.

## Plan Reviewed

The plan proposes replacing isolated mock/local `/workbench` state with the current kai-chattr runtime contract:

```text
apps/web Vite on 127.0.0.1:8800
  -> Vite proxy for /api, /uploads, and /ws
  -> services/api FastAPI runtime on 127.0.0.1:8840
  -> existing stores and MCP bridge
```

The intended implementation uses the existing `/ws?token=...` stream, existing REST routes, native browser WebSocket, a typed reducer, Zustand for live room state, and TanStack Query for REST snapshots and mutations.

## Structural Verdict

**Structurally Incomplete.**

Do not execute this plan yet. The high-level architecture and target runtime are directionally correct, but the plan does not lock enough protocol and API detail for surgical implementation.

## Structural Deficiencies

### 1. WebSocket Payload Contract Is Under-Specified

The plan lists consumed WebSocket event names but does not lock the payload shapes needed by the typed protocol and reducer.

Backend reality is not a single uniform event shape:

- `message`, `status`, and `settings` events use `data`.
- `history_batch` uses `messages` and `done`.
- `rule`, `job`, and `locked` delta events use `action` plus `data`.
- `todo_update` uses `data.id` and `data.status`.
- `clear` uses optional `channel`.
- Other runtime events exist and must be ignored or classified deliberately.

Because Task 3 requires typed event definitions and normalization, the plan must declare these event shapes explicitly or cite a canonical schema source.

### 2. REST Mutation Contracts Are Not Locked

The plan lists REST paths, but does not declare request bodies, response shapes, auth requirements, or error behavior for the routes the frontend mutations must call.

This matters because the frontend work includes typed mutation helpers, TanStack Query integration, Board workflow actions, and pin navigation. An implementer should not have to rediscover each backend contract while executing an approved plan.

At minimum, the plan needs concrete contracts for:

- rules create/update/delete/remind
- jobs create/update/delete/reorder/message add/message delete/message resolve
- locked create/update/delete
- pins create/update/delete/update status
- messages read/send, if used by the chat composer
- status and right-rail capabilities snapshots

### 3. Job Message Route Inventory Is Incomplete For The Stated Board UX

The plan says the Board Jobs workflow must support add/remove message associations and resolve actions according to existing route contracts.

However, the consumed route inventory omits current job-message surfaces needed by that statement:

- `GET /api/jobs/{job_id}/messages`
- `POST /api/jobs/{job_id}/messages/{msg_index}/resolve`

The plan lists `POST /api/jobs/{job_id}/messages` and delete, but not the read and resolve routes. Either the UX scope must drop those behaviors or the API inventory and tasks must include them.

### 4. Frontend Inventory Needs Type Counts And Mount Points

The plan lists new and modified files, but does not fully lock the frontend inventory by type and mount point.

The plan should explicitly state counts for:

- pages
- providers
- hooks
- stores
- protocol/reducer libraries
- workbench components
- browser tests
- backend test files

It should also state where `ChatTranscript`, `ChatComposer`, `AppProviders`, and the runtime hook mount in the app. This prevents file-count drift during implementation.

### 5. Tasks Are Too Coarse For Surgical Execution

Several tasks group too many behaviors into one implementation step.

The largest example is the Zustand runtime task, which combines:

- live state ownership
- WebSocket lifecycle
- bounded reconnect
- REST rehydration
- mutation helpers
- broadcast reconciliation
- duplicate-message avoidance

That is not bite-sized enough for the execution contract. The plan should split transport, reducer, store, mutation helpers, reconciliation, and UI adoption into smaller steps with direct verification after each step.

The plan also omits commit messages, which the evaluation contract expects for executable implementation plans.

## Quality Findings

Not evaluated.

The structural gate failed, so a full architecture-quality assessment was intentionally not performed. The plan should be revised structurally first, then re-evaluated before execution.

## What The Plan Gets Right

The plan correctly identifies several current repo facts:

1. `apps/web` is the browser workbench target on port `8800`.
2. `services/api` is the FastAPI runtime on port `8840`.
3. Vite already proxies `/api`, `/uploads`, and `/ws` to the API runtime.
4. `/api/session` must not be introduced.
5. Supabase, Drizzle, Prisma, and local Docker Postgres are outside this scope.
6. The current `/workbench` page still uses mock/local chat state.
7. `BoardDock` currently owns isolated REST snapshot state and refetches after mutations.
8. The backend already broadcasts relevant runtime events over `/ws`.
9. Existing backend and MCP routes already converge on shared store surfaces.

These correct pieces do not make the plan implementation-ready because the protocol and mutation contracts remain insufficiently locked.

## Evidence Checked

Repo evidence checked during the audit:

- `docs/plans/kai-chattr-workbench-live-runtime-store-implementation-plan.md`
- `apps/web/vite.config.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/lib/chattr-api.ts`
- `apps/web/src/routes/workbench.tsx`
- `apps/web/src/components/workbench/BoardDock.tsx`
- `tests/e2e/workbench-runtime.spec.ts`
- `services/api/app/main.py`
- `services/api/app/websocket.py`
- `services/api/app/routes/jobs.py`
- `services/api/app/routes/locked.py`
- `services/api/app/routes/pins.py`
- `services/api/app/routes/rules.py`
- `services/api/tests/test_runtime_contract.py`
- `services/api/tests/test_mcp_right_rail_tools.py`
- `governance/contracts/architecture.json`
- `apps/web/package.json`

Current worktree note from the audit: unrelated dirty backend changes were present and must not be overwritten by future plan execution.

## Approval Recommendation

**Revise - Structural.**

The plan should not be implemented until it is updated with:

1. Locked WebSocket event payload shapes.
2. Locked REST mutation request/response/error contracts.
3. Complete route inventory for the stated Board UX.
4. Frontend inventory counts by type and mount point.
5. Smaller execution tasks with verification and commit messages.

After those changes, run another pre-implementation evaluation before execution.
