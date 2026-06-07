# Kai Chattr Workbench Board Runtime Recovery Implementation Plan

**Goal:** Restore and correctly migrate the legacy Chattr Board/right-rail functionality into the clean `E:\kai-chattr` workbench so `http://127.0.0.1:8800/workbench` works end-to-end with Rules, Jobs, Locked, and Pinned backed by live backend, REST, WebSocket, and MCP state.

**Architecture:** `E:\kai-chattr` owns every runtime file required for the workbench. The verified runtime contract is `apps/web` Vite on `8800`, `services/api` API/WebSocket on `8840`, MCP streamable HTTP on `8841`, and MCP SSE on `8842`; Vite may proxy only to same-repo `services/api` on `8840`. Legacy `E:\chattr` is source material only. No runtime path may proxy to, shell out to, import from, or depend on old `E:\chattr`, and no target architecture may make `8300` the backend authority.

**Tech Stack:** React 19, Vite 7, TypeScript, shadcn/ui source components, Vercel AI Elements / AI SDK React source components, Tabler icons only, dnd-kit, FastAPI, Uvicorn, WebSocket, existing JSON stores, existing MCP bridge/tools, OpenTelemetry-compatible runtime observability, pytest, pnpm governance checks, MCP Router Playwright.

**Status:** Draft - runtime-corrected, not execution-ready
**Author:** Codex for Jon
**Date:** 2026-06-07

**Runtime correction:** Earlier text in this draft that says the backend serves the built workbench on `8800`, moves Vite off `8800`, uses MCP ports `8301/8302`, or treats `8300` as a current kai-chattr runtime is superseded by `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md`, now marked `Complete`. Board work must build on the verified `8800/8840/8841/8842` runtime.

**Execution warning:** Do not execute this plan's task/code sections as written. They contain historical pre-parity patch material and must be rewritten against the completed runtime contract before Board implementation starts.

## Manifest

### Objective

The implementation objective is not "write docs" and not "make a visual Board tab." The objective is to restore and correctly migrate the legacy Board/right-rail capability into the clean kai-chattr workbench so the new repo is operational without old-repo runtime reliance.

This means:

1. `http://127.0.0.1:8800/workbench` is the only acceptance surface.
2. All runtime files needed to run the workbench, chat room, Board, REST APIs, WebSocket state, and MCP tools exist inside `E:\kai-chattr`.
3. `E:\chattr` is never a runtime dependency. It is behavior reference only.
4. The Board top-level dock tab packages four sub-tabs: Rules, Jobs, Locked, and Pinned.
5. Board state is live. It must update when agents, MCP tools, REST calls, WebSocket messages, or another browser mutate rules, jobs, locked records, or pins.
6. The frontend uses the approved component foundation: shadcn/ui source primitives plus Vercel AI Elements / AI SDK React source components, composed locally. It must not re-port the legacy static UI or add bespoke approximations where approved primitives exist.
7. The legacy behavior shape is preserved, then improved: grouped lanes, active and inactive sections, drag/drop status transitions, rule remind, safer job deletion, message-row pin actions, pin click-to-message navigation, and capability fallback/degraded states.
8. Mock transcript state and stale demo content are removed from the operational workbench path.
9. Unauthenticated session-token exposure through `/api/session` is removed.

### Source Read Ledger

Every file listed in the two feature-source subsections below was opened and read from line 1 through end of file for this plan. Counts are locked because count drift indicates an incomplete or over-expanded implementation investigation.

Feature-source files read in full: `107`

- Legacy `E:\chattr` files read in full: `60`
- Target/current `E:\kai-chattr` files read in full: `47`

Methodology/onboarding files read in full: `4`

- `C:\Users\jwchu\.agents\skills\investigating-and-writing-plan\SKILL.md`
- `C:\Users\jwchu\.agents\skills\repo-investigator\SKILL.md`
- `C:\Users\jwchu\.agents\skills\waza-hunt\SKILL.md`
- `E:\writing-system\__start-here\README.md`

Additional context checks:

- `E:\kai-chattr\WORKER-ACCESS.md` was checked and was not present.
- `C:\Users\jwchu\.codex\memories\MEMORY.md` was searched for relevant Chattr/kai-chattr memory matches; it was not counted as a full source read.

#### Legacy `E:\chattr` Files Read In Full

1. `E:\chattr\config.toml`
2. `E:\chattr\run.py`
3. `E:\chattr\app.py`
4. `E:\chattr\wrapper.py`
5. `E:\chattr\wrapper_api.py`
6. `E:\chattr\wrapper_unix.py`
7. `E:\chattr\wrapper_windows.py`
8. `E:\chattr\mcp_bridge.py`
9. `E:\chattr\mcp_proxy.py`
10. `E:\chattr\agents.py`
11. `E:\chattr\router.py`
12. `E:\chattr\store.py`
13. `E:\chattr\rules.py`
14. `E:\chattr\jobs.py`
15. `E:\chattr\schedules.py`
16. `E:\chattr\summaries.py`
17. `E:\chattr\session_engine.py`
18. `E:\chattr\session_store.py`
19. `E:\chattr\archive.py`
20. `E:\chattr\registry.py`
21. `E:\chattr\config_loader.py`
22. `E:\chattr\server\api\desktop_runtime.py`
23. `E:\chattr\server\api\platform.py`
24. `E:\chattr\server\api\terminal.py`
25. `E:\chattr\server\events\jsonl_stream.py`
26. `E:\chattr\server\events\terminal_event_schema.py`
27. `E:\chattr\server\launch\agents.toml`
28. `E:\chattr\server\launch\chattr_launcher.py`
29. `E:\chattr\server\launcher_control.py`
30. `E:\chattr\server\locked.py`
31. `E:\chattr\server\observability\runtime_obs.py`
32. `E:\chattr\server\proposals\patch_kernel.py`
33. `E:\chattr\server\runtime\session_registry.py`
34. `E:\chattr\server\tools\registry.py`
35. `E:\chattr\schemas\session-draft-message-metadata.schema.json`
36. `E:\chattr\schemas\session-start-request.schema.json`
37. `E:\chattr\schemas\session-template.schema.json`
38. `E:\chattr\static\index.html`
39. `E:\chattr\static\core.js`
40. `E:\chattr\static\chat.js`
41. `E:\chattr\static\right-panel.js`
42. `E:\chattr\static\rules-panel.js`
43. `E:\chattr\static\jobs.js`
44. `E:\chattr\static\locked-panel.js`
45. `E:\chattr\static\sessions.js`
46. `E:\chattr\static\agents-roster.js`
47. `E:\chattr\static\channels.js`
48. `E:\chattr\static\store.js`
49. `E:\chattr\static\settings-modal.js`
50. `E:\chattr\static\workspace-splitters.js`
51. `E:\chattr\static\style.css`
52. `E:\chattr\static\design-system.css`
53. `E:\chattr\static\design-legacy-bridge.css`
54. `E:\chattr\static\right-panel-overlay.css`
55. `E:\chattr\static\jobs.css`
56. `E:\chattr\static\jobs-upgrade.css`
57. `E:\chattr\static\sessions.css`
58. `E:\chattr\static\agents-roster.css`
59. `E:\chattr\static\idt-theme.css`
60. `E:\chattr\static\mocks\components.css`

#### Target/Current `E:\kai-chattr` Files Read In Full

1. `E:\kai-chattr\AGENTS.md`
2. `E:\kai-chattr\apps\web\AGENTS.md`
3. `E:\kai-chattr\governance\contracts\frontend.json`
4. `E:\kai-chattr\governance\contracts\architecture.json`
5. `E:\kai-chattr\package.json`
6. `E:\kai-chattr\pnpm-workspace.yaml`
7. `E:\kai-chattr\apps\web\package.json`
8. `E:\kai-chattr\apps\web\vite.config.ts`
9. `E:\kai-chattr\apps\web\src\lib\chattr-api.ts`
10. `E:\kai-chattr\apps\web\src\routes\workbench.tsx`
11. `E:\kai-chattr\apps\web\src\components\workbench\BoardDock.tsx`
12. `E:\kai-chattr\apps\web\src\components\workbench\WorkbenchCompactRail.tsx`
13. `E:\kai-chattr\apps\web\src\components\workbench\board\types.ts`
14. `E:\kai-chattr\apps\web\src\components\workbench\board\BoardDropZone.tsx`
15. `E:\kai-chattr\apps\web\src\components\workbench\board\BoardItemRow.tsx`
16. `E:\kai-chattr\apps\web\src\components\workbench\board\BoardSection.tsx`
17. `E:\kai-chattr\services\api\pyproject.toml`
18. `E:\kai-chattr\services\api\config.toml`
19. `E:\kai-chattr\services\api\app\cli.py`
20. `E:\kai-chattr\services\api\app\main.py`
21. `E:\kai-chattr\services\api\app\context.py`
22. `E:\kai-chattr\services\api\app\config.py`
23. `E:\kai-chattr\services\api\app\routes\status.py`
24. `E:\kai-chattr\services\api\app\routes\right_rail.py`
25. `E:\kai-chattr\services\api\app\routes\rules.py`
26. `E:\kai-chattr\services\api\app\routes\jobs.py`
27. `E:\kai-chattr\services\api\app\routes\locked.py`
28. `E:\kai-chattr\services\api\app\routes\pins.py`
29. `E:\kai-chattr\services\api\app\routes\messages.py`
30. `E:\kai-chattr\services\api\app\websocket.py`
31. `E:\kai-chattr\services\api\app\mcp\bridge.py`
32. `E:\kai-chattr\services\api\app\mcp\tools.py`
33. `E:\kai-chattr\services\api\app\stores\messages.py`
34. `E:\kai-chattr\services\api\app\stores\rules.py`
35. `E:\kai-chattr\services\api\app\stores\jobs.py`
36. `E:\kai-chattr\services\api\app\stores\locked.py`
37. `E:\kai-chattr\services\api\app\observability\runtime.py`
38. `E:\kai-chattr\services\api\tests\conftest.py`
39. `E:\kai-chattr\services\api\tests\test_mcp_right_rail_tools.py`
40. `E:\kai-chattr\services\api\tests\test_runtime_health.py`
41. `E:\kai-chattr\services\api\tests\test_config_overrides.py`
42. `E:\kai-chattr\services\api\tests\test_router.py`
43. `E:\kai-chattr\services\api\tests\test_platform_api.py`
44. `E:\kai-chattr\services\api\tests\test_launcher_control_api.py`
45. `E:\kai-chattr\docs\kai-chattr-workbench-board-runtime-recovery-report.md`
46. `E:\kai-chattr\docs\plans\manual-multi-agent-chat-bridge-implementation-plan.md`
47. `E:\kai-chattr\docs\plans\manual-multi-agent-chat-bridge-plan-audit.md`

### Root Cause

I believe the remaining Board root cause is that Board state is still not wired to the live room model with REST, WebSocket, and MCP parity. The old runtime blockers have been corrected by the completed architecture-runtime parity plan: `apps/web` runs on `8800`, `services/api` runs on `8840`, MCP runs on `8841/8842`, `/api/session` is absent, and Vite no longer proxies to `8300`. This Board plan must preserve those runtime decisions.

### Current-State Findings

1. Runtime parity is complete: `apps/web` runs on `8800`, `services/api` runs on `8840`, MCP runs on `8841/8842`, and the root orchestrator passes one local session token to both processes without printing it.
2. `apps/web/vite.config.ts` may proxy `/api`, `/uploads`, and `/ws` only to same-repo `services/api` on `8840`.
3. `/api/session` is absent and must stay absent. Browser token bootstrap is owned by the local dev process environment/window bootstrap, not an unauthenticated REST endpoint.
4. Port-drift, no-api-session, no-Supabase, runtime probe, and Playwright workbench acceptance checks now guard this boundary.
5. Remaining Board work starts after this foundation and must not reintroduce the rejected `8300` runtime model.
6. `apps/web/src/routes/workbench.tsx` still contains mock transcript data and reset paths.
7. `apps/web/src/components/workbench/BoardDock.tsx` owns Board data with REST snapshot loads and self-refreshes after saves.
8. Legacy `E:\chattr\app.py`, `static\chat.js`, `static\right-panel.js`, `static\rules-panel.js`, `static\jobs.js`, and `static\locked-panel.js` show the intended behavior: injected same-origin token, WebSocket room hydration, Hub-dispatched live updates, four right-rail tabs, capability fallback, rules remind, jobs archive/permanent-delete distinction, locked live events, and message-level pins.
9. Current kai-chattr backend already contains many migrated backend pieces in `services/api/app/main.py`, stores, routes, and MCP bridge; the missing work is correction, integration, live-state wiring, security cleanup, and 8800 ownership.

### Platform API

| Verb | Path | Action | Status |
|------|------|--------|--------|
| GET | `/workbench` | Serve built React workbench from `services/api` on port `8800` and inject the browser session token into the HTML before app boot | Modified |
| GET | `/workbench` and Vite assets | Serve the workbench from `apps/web` on `8800` | Existing/consumed |
| WebSocket | `/ws?token=<session_token>` | Hydrate transcript, roster, rules, jobs, locked records, pins/todos, settings, and live updates | Existing - consumed and instrumented |
| GET | `/api/session` | Remove route and remove auth bypass; browser must not retrieve raw token through an unauthenticated REST endpoint | Removed |
| GET | `/api/status` | Keep health/runtime status; update port assertions to `8800` where runtime port is exposed | Modified |
| GET | `/api/right-rail/capabilities` | Discover Board tabs backed by MCP right-rail tool categories | Existing - consumed |
| GET | `/api/rules` | Read rules snapshot for initial/degraded load | Existing - consumed |
| GET | `/api/rules/active` | Read active rules for agents/backend flows | Existing - consumed |
| POST | `/api/rules` | Create rule | Existing - consumed |
| PATCH | `/api/rules/{rule_id}` | Activate, archive, restore, or edit rule | Existing - consumed |
| DELETE | `/api/rules/{rule_id}` | Delete rule only through UI paths that preserve legacy confirmation/status semantics | Existing - consumed |
| POST | `/api/rules/remind` | Broadcast rules-remind event so agents re-read fresh rules | Existing - consumed by Board |
| GET | `/api/rules/freshness` | Read rule freshness state | Existing - consumed |
| GET | `/api/jobs` | Read jobs snapshot for initial/degraded load | Existing - consumed |
| POST | `/api/jobs` | Create job | Existing - consumed |
| PATCH | `/api/jobs/{job_id}` | Edit job, assign, or status-transition via Board drag/drop and controls | Existing - consumed |
| POST | `/api/jobs/reorder` | Persist status-lane order after drag/drop | Existing - consumed |
| GET | `/api/jobs/{job_id}/messages` | Load job conversation messages when needed | Existing - consumed |
| POST | `/api/jobs/{job_id}/messages` | Add job message | Existing - consumed |
| DELETE | `/api/jobs/{job_id}` | Default UI path archives/closes; permanent delete only from archived/trash path with confirmation | Existing - consumed with corrected caller semantics |
| GET | `/api/locked` | Read locked records snapshot for initial/degraded load | Existing - consumed |
| POST | `/api/locked` | Create locked record | Existing - consumed |
| PATCH | `/api/locked/{locked_id}` | Edit/archive/restore locked record | Existing - consumed |
| DELETE | `/api/locked/{locked_id}` | Delete locked record | Existing - consumed |
| GET | `/api/pins` | Read pinned message entries if available for degraded/initial load | Existing - consumed |
| POST/PATCH/DELETE | `/api/pins` and WebSocket todo events | Pin, complete, reopen, or remove pins from message rows and Board pins | Existing - consumed |

#### New Endpoint Contracts

No new REST endpoints are created by this plan.

The required capability already exists as legacy behavior and partially migrated kai-chattr code. Adding new bootstrap endpoints would repeat the rejected runtime mistake. The correct foundation is already in place: the root dev orchestrator starts `apps/web` on `8800`, `services/api` on `8840`, MCP on `8841/8842`, and passes the session token without exposing `/api/session`.

#### Modified Endpoint Contracts

`GET /workbench`

- Auth: local workbench page request does not require a request token, but the HTML response injects the process-owned browser session token before the React app bootstraps.
- Request: no body.
- Response: HTML shell with `window.__SESSION_TOKEN__` and `window.__CHATTR_SESSION_TOKEN__` set before the app script loads.
- Touches: runtime session token holder only.
- Forbidden: no token logged, no token returned through JSON, no token in trace/metric attributes.

`GET /api/session`

- Change: remove from the router and remove from public middleware bypasses.
- Why: it exposes the browser session token unauthenticated and is not needed under the verified root orchestrator token contract.
- Tests: change existing tests so unauthenticated `/api/session` returns `404` or `403`; exact result must be chosen by implementation from the router behavior and locked in the test.

`/ws?token=<session_token>`

- Change: no event protocol expansion is required for Board parity unless implementation finds a missing existing event. The implementation must consume existing events first: transcript, todos/pins, rules, jobs, locked records, agent roster/status, pending names, typing, and errors.
- Why: the legacy live state model already exists through WebSocket/store-change broadcasts; the frontend currently fails to subscribe to it as the shared system of record.

### Observability

| Type | Name | Where | Purpose |
|------|------|-------|---------|
| Trace span | `workbench.html.serve` | `services/api/app/main.py` workbench HTML handler | Measure workbench shell serving and token-injection success/failure without logging token |
| Trace span | `workbench.ws.connect` | `services/api/app/main.py:websocket_endpoint` | Measure accepted and rejected WebSocket connection attempts |
| Trace span | `workbench.ws.initial_hydrate` | `websocket_endpoint` initial send block | Measure initial live-room hydration for transcript, rules, jobs, locked, pins, and roster |
| Trace span | `workbench.board.rules.mutate` | rules mutation handlers in `main.py` | Measure rule create/update/archive/delete/remind calls |
| Trace span | `workbench.board.jobs.mutate` | jobs mutation handlers in `main.py` | Measure job create/update/reorder/archive/permanent-delete calls |
| Trace span | `workbench.board.locked.mutate` | locked mutation handlers in `main.py` | Measure locked record create/update/archive/delete calls |
| Trace span | `workbench.board.pins.mutate` | pin/todo mutation path in `main.py` and message store callbacks | Measure pin add/complete/reopen/remove calls |
| Metric counter | `kai_chattr.workbench.html.serve.count` | workbench HTML handler | Count success/failure of workbench shell serving |
| Metric counter | `kai_chattr.workbench.ws.connect.count` | WebSocket connect path | Count accepted/rejected WebSocket connects |
| Metric counter | `kai_chattr.workbench.board.mutation.count` | Board mutation handlers | Count Board mutation attempts by tab/action/result |
| Metric counter | `kai_chattr.workbench.security.token_rejected.count` | middleware and WebSocket auth | Count rejected or missing-token attempts |
| Structured log | `workbench.html.served` | workbench HTML handler | Audit local runtime page serving without token value |
| Structured log | `workbench.security.token_rejected` | middleware/WebSocket auth | Audit rejected token attempts without token value |
| Structured log | `workbench.board.mutation` | Board mutation handlers | Audit tab/action/result/item counts without raw content |

Observability attribute rules:

- Allowed attributes: `tab`, `action`, `status`, `result`, `http.status_code`, `event.type`, `has_token`, `item_count`, `latency_ms`, `runtime.port`, `source`
- Forbidden attributes: raw session token, raw message text, raw rule text, raw job title, raw locked text, raw filenames, local full paths containing usernames or secrets, email, API keys, OAuth tokens, provider tokens
- Structured logs may include integer IDs and counts. They must not include raw text bodies unless a later approved plan adds an explicit redaction/audit rule.

### Database Migrations

No database migrations.

This runtime slice uses the existing local JSON stores and migrated store modules already present under `services/api/app/stores`. If implementation discovers that persistence is missing for a required Board state, stop and revise this plan before adding a database or migration.

### Edge Functions

No edge functions created or modified.

This is a local workbench runtime and FastAPI/WebSocket/MCP migration. Supabase/Cloudflare edge functions are not part of this slice.

### Frontend Surface Area

**New pages/routes:** `0`

**New hooks:** `1`

| Hook | File | Used by |
|------|------|---------|
| `useChattrRoom` | `apps/web/src/hooks/use-chattr-room.ts` | `workbench.tsx`, `BoardDock.tsx`, transcript/composer/roster components |

**New libraries/services:** `2`

| Library | File | Used by |
|---------|------|---------|
| Chattr room protocol types | `apps/web/src/lib/chattr-room-types.ts` | `use-chattr-room.ts`, workbench components |
| Chattr room reducer | `apps/web/src/lib/chattr-room-reducer.ts` | `use-chattr-room.ts`, reducer tests if added later |

**New components:** `4`

| Component | File | Used by |
|-----------|------|---------|
| `ChatTranscript` | `apps/web/src/components/workbench/ChatTranscript.tsx` | `workbench.tsx` |
| `ChatComposer` | `apps/web/src/components/workbench/ChatComposer.tsx` | `workbench.tsx` |
| `AgentRosterPanel` | `apps/web/src/components/workbench/AgentRosterPanel.tsx` | `workbench.tsx` |
| `PendingAgentNameDialog` | `apps/web/src/components/workbench/PendingAgentNameDialog.tsx` | `workbench.tsx` |

**Modified frontend files:** `9`

| File | What changes |
|------|--------------|
| `apps/web/package.json` | Move dev/preview scripts off `8800` so backend `8800` remains the acceptance runtime |
| `apps/web/vite.config.ts` | Keep Vite dev/preview on `8800`; allow `/api`, `/uploads`, and `/ws` proxies only to same-repo `services/api` on `8840` |
| `apps/web/src/lib/chattr-api.ts` | Remove `/api/session` fallback; use injected token only; centralize same-origin REST helper and WebSocket URL helper |
| `apps/web/src/routes/workbench.tsx` | Remove mock operational transcript state; mount live room hook; wire transcript, composer, roster, and Board to shared live state |
| `apps/web/src/components/workbench/BoardDock.tsx` | Replace isolated REST snapshot ownership with props/actions from shared live room state; preserve REST mutations but update UI through reducer/WS; add Remind, safer job delete, message-linked pins, capability fallback |
| `apps/web/src/components/workbench/WorkbenchCompactRail.tsx` | Keep Board as a top-level dock tab and ensure open/close behavior controls the right column consistently |
| `apps/web/src/components/workbench/board/types.ts` | Align Board type model with live room state and existing backend payloads |
| `apps/web/src/components/workbench/board/BoardItemRow.tsx` | Strengthen state-driven visuals with Tabler icons and reduced indentation while preserving shadcn composition |
| `apps/web/src/components/workbench/board/BoardSection.tsx` | Render draft/active/archive or todo/active/closed lanes with distinct selected/active state and drag/drop affordances |

**Modified backend/test/support files:** see Locked File Inventory.

## Pre-Implementation Contract

No major product, runtime, API, observability, inventory, or port decision may be improvised during implementation. If any locked item below needs to change, implementation must stop and this plan must be revised first.

Implementation must not begin until this plan is approved.

## Locked Product Decisions

1. `http://127.0.0.1:8800/workbench` is the acceptance runtime surface.
2. `E:\kai-chattr` owns every runtime file required to operate the workbench.
3. `E:\chattr` is source/reference only and is not imported, proxied, executed, or read at runtime.
4. `8300` is not a target runtime, backend authority, acceptance surface, or hidden proxy destination for this plan.
5. `apps/web` serves the workbench on `8800`; `services/api` owns API/WebSocket on `8840`.
6. Vite remains the `8800` acceptance surface for this phase and must not proxy `/api` or `/ws` to `8300`.
7. Browser session-token delivery uses backend HTML injection on `/workbench`; unauthenticated JSON token bootstrap endpoints are rejected.
8. Board state uses the shared live room store and WebSocket events as the system of record, not `BoardDock` local REST snapshots.
9. REST remains the mutation transport where it already exists; WebSocket/store events are the live synchronization and hydration transport.
10. Board is a top-level dock tab that contains Rules, Jobs, Locked, and Pinned sub-tabs.
11. Board sub-tabs use shadcn/ui Tabs where tabs are needed and approved components elsewhere; Tabler is the only icon family.
12. Legacy static UI files are not copied into `apps/web` as implementation. Their behavior is adapted into React components composed from approved primitives.
13. Job delete defaults to archive/close or confirmed trash semantics; direct permanent delete from an active row is rejected.
14. Pins are message-level actions in the transcript and navigable Board entries; a manual message-ID form is not parity.
15. Rules include the Remind action.
16. The operational workbench route must not render stale mock transcript text.

## Locked Acceptance Contract

The implementation is complete only when all of the following are true:

1. Starting the kai-chattr runtime from `E:\kai-chattr\services\api` serves `http://127.0.0.1:8800/workbench`.
2. Opening `http://127.0.0.1:8800/workbench` loads the React workbench from `E:\kai-chattr` with no requests to `127.0.0.1:8300`, `localhost:8300`, or `E:\chattr`.
3. The browser workbench receives the session token through injected HTML globals before React bootstraps.
4. `GET /api/session` is not an unauthenticated token-returning endpoint.
5. The browser WebSocket connects to `ws://127.0.0.1:8800/ws?token=<session_token>` or the equivalent secure `wss://` URL in secure contexts.
6. Initial WebSocket hydration populates transcript, roster/status, rules, jobs, locked records, and pinned/todo state.
7. Creating or updating a rule through Board updates the UI live without manual refresh.
8. Calling MCP `chat_rules` or the matching backend tool path updates the visible Board state live.
9. The Rules tab exposes Remind and sends `/api/rules/remind`; connected clients receive the rules-remind event.
10. Jobs render distinct state lanes and drag/drop reordering/status transitions persist through `/api/jobs/reorder` or `PATCH /api/jobs/{id}`.
11. Deleting an active job does not permanently delete it without archive/trash confirmation.
12. Locked records render active and archived/deleted state, update live from backend/MCP changes, and support create/edit/archive/restore/delete paths.
13. Pins can be toggled from transcript message rows and appear in the Board Pinned tab.
14. Clicking a Board pin navigates to and highlights the corresponding transcript message.
15. Board capability loading failure does not silently remove the Board; it falls back to the four required tabs or shows an explicit degraded state.
16. The right dock open/close behavior remains controlled by the top dock tabs, with Board packaged like Changes, Browser, Code, Docs, and Terminal.
17. The workbench no longer displays `Board API error` as a steady-state label.
18. The workbench no longer displays stale mock transcript content such as old artificial thought/tool rows in the operational route.
19. MCP Router Playwright verifies the real `8800/workbench` page, including Board interaction and absence of `8300` network calls.
20. Backend tests, frontend build, dependency checks, contract checks, and targeted runtime tests pass.

## Locked Platform API Surface

### New platform API endpoints: `0`

No new REST endpoints.

### Existing platform API endpoints removed: `1`

1. `GET /api/session` - remove unauthenticated raw-token access.

### Existing platform API endpoints modified: `3`

1. `GET /workbench` - serve built frontend on same-repo runtime port `8800` and inject token.
2. `GET /api/status` - update runtime port/status expectations to `8800` where exposed.
3. `WebSocket /ws` - keep protocol but instrument and verify full live hydration for Board/chat state.

### Existing platform API endpoints reused as-is by frontend actions: `18`

1. `GET /api/right-rail/capabilities`
2. `GET /api/rules`
3. `GET /api/rules/active`
4. `POST /api/rules`
5. `PATCH /api/rules/{rule_id}`
6. `DELETE /api/rules/{rule_id}`
7. `POST /api/rules/remind`
8. `GET /api/rules/freshness`
9. `GET /api/jobs`
10. `POST /api/jobs`
11. `PATCH /api/jobs/{job_id}`
12. `DELETE /api/jobs/{job_id}`
13. `POST /api/jobs/reorder`
14. `GET /api/jobs/{job_id}/messages`
15. `POST /api/jobs/{job_id}/messages`
16. `GET /api/locked`
17. `POST/PATCH/DELETE /api/locked/{locked_id}`
18. `GET/POST/PATCH/DELETE /api/pins` or equivalent existing pin/todo REST/WS path

### MCP right-rail tools that must remain operational: `4`

1. `chat_rules`
2. `chat_jobs`
3. `chat_pins`
4. `chat_locked`

## Locked Observability Surface

### New traces: `7`

1. `workbench.html.serve`
2. `workbench.ws.connect`
3. `workbench.ws.initial_hydrate`
4. `workbench.board.rules.mutate`
5. `workbench.board.jobs.mutate`
6. `workbench.board.locked.mutate`
7. `workbench.board.pins.mutate`

### New metrics: `4 counters`

1. `kai_chattr.workbench.html.serve.count`
2. `kai_chattr.workbench.ws.connect.count`
3. `kai_chattr.workbench.board.mutation.count`
4. `kai_chattr.workbench.security.token_rejected.count`

### New structured logs: `3`

1. `workbench.html.served`
2. `workbench.security.token_rejected`
3. `workbench.board.mutation`

### Attribute rules

The allowed and forbidden attributes are exactly those listed in the Manifest Observability section. Token values and raw user-authored content are forbidden in trace and metric attributes.

## Locked Inventory Counts

### Investigation

- Feature-source files opened/read in full: `107`
- Legacy source files opened/read in full: `60`
- Target/current repo files opened/read in full: `47`
- Methodology/onboarding files read in full: `4`
- Memory registry searched but not read in full: `1`
- Machine-local access files missing: `1`

### Migration and file movement

- Legacy files physically copied/moved into `E:\kai-chattr`: `0`
- Legacy files raw-ported into `apps/web`: `0`
- Legacy files whose behavior is adapted into target code: `12`
- Files moved/copied from old repo into new repo: `0`

### Runtime and frontend

- New top-level pages/routes: `0`
- New hooks: `1`
- New frontend libraries/services: `2`
- New frontend components: `4`
- Modified frontend files: `9`

### Backend and tests

- New backend runtime files: `0`
- New backend test modules: `2`
- Modified backend runtime/config files: `5`
- Modified backend test/support files: `7`
- New database migrations: `0`
- New edge functions: `0`

### Total implementation inventory

- New implementation runtime/test files: `9`
- New planning artifact created by this step: `1`
- Total new files including this plan artifact: `10`
- Modified files during implementation: `21`
- Tests created: `2`
- Tests modified: `6`
- Test support files modified: `1`

## Locked File Inventory

### Planning artifact created now: `1`

1. `docs/plans/kai-chattr-workbench-board-runtime-recovery-implementation-plan.md`

### New implementation files to create: `9`

1. `apps/web/src/lib/chattr-room-types.ts`
2. `apps/web/src/lib/chattr-room-reducer.ts`
3. `apps/web/src/hooks/use-chattr-room.ts`
4. `apps/web/src/components/workbench/ChatTranscript.tsx`
5. `apps/web/src/components/workbench/ChatComposer.tsx`
6. `apps/web/src/components/workbench/AgentRosterPanel.tsx`
7. `apps/web/src/components/workbench/PendingAgentNameDialog.tsx`
8. `services/api/tests/test_workbench_runtime_contract.py`
9. `services/api/tests/test_workbench_observability.py`

### Files to modify during implementation: `21`

1. `apps/web/package.json`
2. `apps/web/vite.config.ts`
3. `apps/web/src/lib/chattr-api.ts`
4. `apps/web/src/routes/workbench.tsx`
5. `apps/web/src/components/workbench/BoardDock.tsx`
6. `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`
7. `apps/web/src/components/workbench/board/types.ts`
8. `apps/web/src/components/workbench/board/BoardItemRow.tsx`
9. `apps/web/src/components/workbench/board/BoardSection.tsx`
10. `services/api/config.toml`
11. `services/api/app/cli.py`
12. `services/api/app/main.py`
13. `services/api/app/routes/status.py`
14. `services/api/app/observability/runtime.py`
15. `services/api/tests/conftest.py`
16. `services/api/tests/test_mcp_right_rail_tools.py`
17. `services/api/tests/test_runtime_health.py`
18. `services/api/tests/test_config_overrides.py`
19. `services/api/tests/test_router.py`
20. `services/api/tests/test_platform_api.py`
21. `services/api/tests/test_launcher_control_api.py`

### Legacy files whose behavior is adapted, not copied: `12`

1. `E:\chattr\run.py` - same-origin workbench serving and token injection
2. `E:\chattr\app.py` - WebSocket hydration, store callbacks, REST semantics, right-rail broadcasts
3. `E:\chattr\store.py` - todo/pin state behavior
4. `E:\chattr\rules.py` - rule states and freshness/remind behavior
5. `E:\chattr\jobs.py` - job status, reorder, messages, archive/delete behavior
6. `E:\chattr\server\locked.py` - locked record model
7. `E:\chattr\mcp_bridge.py` - `chat_rules`, `chat_jobs`, `chat_pins`, `chat_locked`
8. `E:\chattr\static\chat.js` - injected token, WebSocket protocol, Hub events, transcript pin actions
9. `E:\chattr\static\right-panel.js` - four tabs, capability fallback, counts
10. `E:\chattr\static\rules-panel.js` - grouped rules, Remind action, state transitions
11. `E:\chattr\static\jobs.js` - grouped jobs, drag/drop, conversation, delete semantics
12. `E:\chattr\static\locked-panel.js` - live locked records and archived grouping

### Legacy files copied/moved into `E:\kai-chattr`: `0`

No raw legacy runtime files are copied or moved. If implementation discovers that a direct file copy is necessary, stop and revise this plan first because that would conflict with the repo rule that legacy static UI is behavior reference only.

## Code Writeup Addendum

This section is a surgical addendum to the plan. It does not replace the existing plan sections.

The code contract is:

1. New files below show complete proposed file contents.
2. Existing files below show exact proposed code hunks or replacement blocks to apply surgically.
3. No code is shown for legacy files because the locked migration count remains `0` copied/moved/raw-ported files.
4. If implementation needs a file path that is not listed here, stop and revise this plan before writing code.

### Files The Proposed Plan Would Create Or Migrate

| # | Repo location | Source | Action | What it does |
|---|---------------|--------|--------|--------------|
| 1 | `apps/web/src/lib/chattr-room-types.ts` | New | Create | Defines the shared WebSocket/live-room event and state contract |
| 2 | `apps/web/src/lib/chattr-room-reducer.ts` | New | Create | Applies initial snapshots and live event deltas idempotently |
| 3 | `apps/web/src/hooks/use-chattr-room.ts` | New | Create | Owns same-origin WebSocket connection and live room actions |
| 4 | `apps/web/src/components/workbench/ChatTranscript.tsx` | New | Create | Renders live transcript rows with AI Elements messages and message-level pin actions |
| 5 | `apps/web/src/components/workbench/ChatComposer.tsx` | New | Create | Sends user messages with AI Elements PromptInput |
| 6 | `apps/web/src/components/workbench/AgentRosterPanel.tsx` | New | Create | Renders active/configured/offline/pending agents from live room state |
| 7 | `apps/web/src/components/workbench/PendingAgentNameDialog.tsx` | New | Create | Confirms or renames pending agent instances |
| 8 | `services/api/tests/test_workbench_runtime_contract.py` | New | Create | Locks the 8800 runtime, token-injection, and `/api/session` removal contract |
| 9 | `services/api/tests/test_workbench_observability.py` | New | Create | Locks observability names and sensitive-attribute exclusions |
| 10 | No legacy destination path | `E:\chattr\*` | Do not copy | Legacy files are behavior references only, not migrated as files |

### Complete Proposed Code For New Files

#### `apps/web/src/lib/chattr-room-types.ts`

```ts
import type {
  CapabilityTab,
  JobItem,
  LockedItem,
  PinItem,
  RuleItem,
} from '@/components/workbench/board/types'

export type ChattrMessageRole = 'user' | 'assistant' | 'system' | 'tool'

export type ChattrMessage = {
  id: number
  role: ChattrMessageRole
  sender?: string
  text: string
  type?: string
  time?: string
  timestamp?: number
  channel?: string
  deleted?: boolean
}

export type ChattrAgentStatus = 'configured' | 'active' | 'pending' | 'offline'

export type ChattrAgent = {
  name: string
  displayName?: string
  status: ChattrAgentStatus
  model?: string
  provider?: string
  lastSeen?: number
}

export type PendingAgentName = {
  instanceId: string
  suggestedName: string
  provider?: string
}

export type ChattrRoomConnectionState =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'degraded'
  | 'closed'
  | 'error'

export type ChattrRoomState = {
  agents: ChattrAgent[]
  capabilities: CapabilityTab[] | null
  connection: ChattrRoomConnectionState
  error: string
  jobs: JobItem[]
  locked: LockedItem[]
  messages: ChattrMessage[]
  pendingAgent: PendingAgentName | null
  pins: PinItem[]
  rules: RuleItem[]
  todos: Record<number, 'todo' | 'done'>
}

export type ChattrWsEvent =
  | { type: 'agents'; data: ChattrAgent[] }
  | { type: 'agent_status'; data: Partial<ChattrAgent> & { name: string } }
  | { type: 'capabilities'; data: CapabilityTab[] }
  | { type: 'clear'; channel?: string }
  | { type: 'error'; error?: string; message?: string }
  | { type: 'jobs'; data: JobItem[] }
  | { type: 'job'; action?: 'create' | 'update' | 'delete'; data: JobItem; id?: number }
  | { type: 'locked_items'; data: LockedItem[] }
  | { type: 'locked'; action?: 'create' | 'update' | 'delete'; data: LockedItem; id?: number }
  | { type: 'message'; data: ChattrMessage }
  | { type: 'messages'; data: ChattrMessage[] }
  | { type: 'name_pending'; data: PendingAgentName }
  | { type: 'pins'; data: PinItem[] }
  | { type: 'rules'; data: RuleItem[] }
  | { type: 'rule'; action?: 'create' | 'update' | 'delete'; data: RuleItem; id?: number }
  | { type: 'rules_remind'; data?: Record<string, never> }
  | { type: 'todo_update'; data: { id: number; status: 'todo' | 'done' | null } }
  | { type: 'todos'; data: Record<string, 'todo' | 'done'> }
  | { type: 'typing'; agent: string; active: boolean }
  | { type: string; [key: string]: unknown }

export type ChattrRoomAction =
  | { type: 'connect' }
  | { type: 'connected' }
  | { type: 'closed' }
  | { type: 'error'; error: string }
  | { type: 'event'; event: ChattrWsEvent }
  | { type: 'capabilities'; capabilities: CapabilityTab[] | null }
```

#### `apps/web/src/lib/chattr-room-reducer.ts`

```ts
import type { CapabilityTab } from '@/components/workbench/board/types'
import { isBoardTabId } from '@/components/workbench/board/types'
import type {
  ChattrAgent,
  ChattrMessage,
  ChattrRoomAction,
  ChattrRoomState,
  ChattrWsEvent,
} from '@/lib/chattr-room-types'

export const initialChattrRoomState: ChattrRoomState = {
  agents: [],
  capabilities: null,
  connection: 'idle',
  error: '',
  jobs: [],
  locked: [],
  messages: [],
  pendingAgent: null,
  pins: [],
  rules: [],
  todos: {},
}

function sortById<T extends { id: number }>(items: T[]) {
  return [...items].sort((a, b) => a.id - b.id)
}

function upsertById<T extends { id: number }>(items: T[], next: T) {
  const exists = items.some((item) => item.id === next.id)
  if (!exists) {
    return sortById([...items, next])
  }
  return items.map((item) => (item.id === next.id ? next : item))
}

function removeById<T extends { id: number }>(items: T[], id: number) {
  return items.filter((item) => item.id !== id)
}

function normalizeCapabilities(tabs: CapabilityTab[]) {
  const filtered = tabs.filter((tab) => isBoardTabId(tab.id))
  return filtered.length > 0 ? filtered : null
}

function normalizeMessage(raw: ChattrMessage): ChattrMessage {
  return {
    ...raw,
    role: raw.role ?? (raw.sender === 'user' ? 'user' : 'assistant'),
    text: raw.text ?? '',
  }
}

function upsertMessage(messages: ChattrMessage[], raw: ChattrMessage) {
  const next = normalizeMessage(raw)
  return upsertById(messages, next)
}

function upsertAgent(agents: ChattrAgent[], next: ChattrAgent) {
  const exists = agents.some((agent) => agent.name === next.name)
  if (!exists) {
    return [...agents, next].sort((a, b) => a.name.localeCompare(b.name))
  }
  return agents.map((agent) =>
    agent.name === next.name ? { ...agent, ...next } : agent
  )
}

function applyTodos(state: ChattrRoomState, todos: Record<string, 'todo' | 'done'>) {
  const nextTodos: Record<number, 'todo' | 'done'> = {}
  for (const [id, status] of Object.entries(todos)) {
    const messageId = Number.parseInt(id, 10)
    if (Number.isFinite(messageId)) {
      nextTodos[messageId] = status
    }
  }
  return { ...state, todos: nextTodos }
}

function applyEvent(state: ChattrRoomState, event: ChattrWsEvent): ChattrRoomState {
  switch (event.type) {
    case 'agents':
      return { ...state, agents: event.data }
    case 'agent_status':
      return { ...state, agents: upsertAgent(state.agents, event.data as ChattrAgent) }
    case 'capabilities':
      return { ...state, capabilities: normalizeCapabilities(event.data) }
    case 'clear':
      return { ...state, messages: [] }
    case 'error':
      return { ...state, connection: 'error', error: event.error ?? event.message ?? 'Runtime error' }
    case 'jobs':
      return { ...state, jobs: event.data }
    case 'job':
      if (event.action === 'delete' && event.id) {
        return { ...state, jobs: removeById(state.jobs, event.id) }
      }
      return { ...state, jobs: upsertById(state.jobs, event.data) }
    case 'locked_items':
      return { ...state, locked: event.data }
    case 'locked':
      if (event.action === 'delete' && event.id) {
        return { ...state, locked: removeById(state.locked, event.id) }
      }
      return { ...state, locked: upsertById(state.locked, event.data) }
    case 'message':
      return { ...state, messages: upsertMessage(state.messages, event.data) }
    case 'messages':
      return { ...state, messages: sortById(event.data.map(normalizeMessage)) }
    case 'name_pending':
      return { ...state, pendingAgent: event.data }
    case 'pins':
      return { ...state, pins: event.data }
    case 'rules':
      return { ...state, rules: event.data }
    case 'rule':
      if (event.action === 'delete' && event.id) {
        return { ...state, rules: removeById(state.rules, event.id) }
      }
      return { ...state, rules: upsertById(state.rules, event.data) }
    case 'todo_update': {
      const todos = { ...state.todos }
      if (event.data.status) {
        todos[event.data.id] = event.data.status
      } else {
        delete todos[event.data.id]
      }
      return { ...state, todos }
    }
    case 'todos':
      return applyTodos(state, event.data)
    default:
      return state
  }
}

export function chattrRoomReducer(
  state: ChattrRoomState,
  action: ChattrRoomAction
): ChattrRoomState {
  switch (action.type) {
    case 'connect':
      return { ...state, connection: 'connecting', error: '' }
    case 'connected':
      return { ...state, connection: 'connected', error: '' }
    case 'closed':
      return { ...state, connection: 'closed' }
    case 'error':
      return { ...state, connection: 'error', error: action.error }
    case 'capabilities':
      return { ...state, capabilities: action.capabilities }
    case 'event':
      return applyEvent(state, action.event)
    default:
      return state
  }
}
```

#### `apps/web/src/hooks/use-chattr-room.ts`

```ts
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import {
  chattrJson,
  errorMessage,
  getSessionToken,
  websocketUrl,
} from '@/lib/chattr-api'
import {
  chattrRoomReducer,
  initialChattrRoomState,
} from '@/lib/chattr-room-reducer'
import type { ChattrWsEvent } from '@/lib/chattr-room-types'

function parseWsEvent(raw: string): ChattrWsEvent | null {
  try {
    const event = JSON.parse(raw) as ChattrWsEvent
    return event && typeof event === 'object' && 'type' in event ? event : null
  } catch {
    return null
  }
}

export function useChattrRoom() {
  const [state, dispatch] = useReducer(chattrRoomReducer, initialChattrRoomState)
  const socketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    const token = getSessionToken()
    if (!token) {
      dispatch({ type: 'error', error: 'Workbench session token was not injected.' })
      return
    }

    dispatch({ type: 'connect' })
    const socket = new WebSocket(websocketUrl('/ws', token))
    socketRef.current = socket

    socket.addEventListener('open', () => dispatch({ type: 'connected' }))
    socket.addEventListener('close', () => dispatch({ type: 'closed' }))
    socket.addEventListener('error', () => {
      dispatch({ type: 'error', error: 'Workbench WebSocket connection failed.' })
    })
    socket.addEventListener('message', (message) => {
      if (typeof message.data !== 'string') {
        return
      }
      const event = parseWsEvent(message.data)
      if (event) {
        dispatch({ type: 'event', event })
      }
    })

    return () => {
      socketRef.current = null
      socket.close()
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    chattrJson<{ tabs: unknown[] }>('/api/right-rail/capabilities')
      .then((payload) => {
        if (!cancelled) {
          dispatch({ type: 'event', event: { type: 'capabilities', data: payload.tabs as never } })
        }
      })
      .catch(() => {
        if (!cancelled) {
          dispatch({ type: 'capabilities', capabilities: null })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const sendWs = useCallback((payload: Record<string, unknown>) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      dispatch({ type: 'error', error: 'Workbench WebSocket is not connected.' })
      return false
    }
    socket.send(JSON.stringify(payload))
    return true
  }, [])

  const actions = useMemo(
    () => ({
      async archiveJob(jobId: number) {
        await chattrJson(`/api/jobs/${jobId}`, {
          body: JSON.stringify({ status: 'archived' }),
          method: 'PATCH',
        })
      },
      async clearPins() {
        await chattrJson('/api/pins', { method: 'DELETE' })
      },
      async permanentDeleteJob(jobId: number) {
        await chattrJson(`/api/jobs/${jobId}?permanent=true`, { method: 'DELETE' })
      },
      async remindRules() {
        await chattrJson('/api/rules/remind', { method: 'POST' })
      },
      renamePendingAgent(instanceId: string, name: string) {
        sendWs({ type: 'rename_agent', instance_id: instanceId, name })
      },
      sendMessage(text: string) {
        return sendWs({ type: 'message', text, sender: 'user' })
      },
      togglePin(messageId: number) {
        const current = state.todos[messageId]
        if (!current) {
          return sendWs({ type: 'todo_add', id: messageId })
        }
        if (current === 'todo') {
          return sendWs({ type: 'todo_toggle', id: messageId })
        }
        return sendWs({ type: 'todo_remove', id: messageId })
      },
      async updatePin(messageId: number, action: 'done' | 'reopen' | 'remove') {
        await chattrJson(`/api/pins/${messageId}`, {
          body: JSON.stringify({ action }),
          method: 'PATCH',
        }).catch((error) => {
          dispatch({ type: 'error', error: errorMessage(error) })
        })
      },
    }),
    [sendWs, state.todos]
  )

  return { actions, dispatch, state }
}
```

#### `apps/web/src/components/workbench/ChatTranscript.tsx`

```tsx
'use client'

import { IconCheck, IconPinned, IconPinnedOff } from '@tabler/icons-react'
import { useEffect, useRef } from 'react'

import {
  Message,
  MessageAction,
  MessageActions,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChattrMessage } from '@/lib/chattr-room-types'
import { cn } from '@/lib/cn'

type ChatTranscriptProps = {
  highlightedMessageId?: number | null
  messages: ChattrMessage[]
  onTogglePin: (messageId: number) => void
  todos: Record<number, 'todo' | 'done'>
}

export function ChatTranscript({
  highlightedMessageId,
  messages,
  onTogglePin,
  todos,
}: ChatTranscriptProps) {
  const itemRefs = useRef<Record<number, HTMLDivElement | null>>({})

  useEffect(() => {
    if (!highlightedMessageId) {
      return
    }
    itemRefs.current[highlightedMessageId]?.scrollIntoView({
      block: 'center',
      behavior: 'smooth',
    })
  }, [highlightedMessageId])

  return (
    <ScrollArea className="h-full">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 py-5">
        {messages.length === 0 ? (
          <div className="rounded-md border border-dashed border-border/70 p-4 text-sm text-muted-foreground">
            No messages in this session yet.
          </div>
        ) : null}

        {messages.map((message) => {
          const todoStatus = todos[message.id]
          const from = message.role === 'user' ? 'user' : 'assistant'

          return (
            <Message
              className={cn(
                'scroll-mt-10 rounded-md px-1 py-1',
                highlightedMessageId === message.id ? 'bg-primary/10 ring-1 ring-primary/40' : ''
              )}
              data-message-id={message.id}
              from={from}
              key={message.id}
              ref={(node) => {
                itemRefs.current[message.id] = node
              }}
            >
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-medium text-foreground">{message.sender ?? from}</span>
                {message.time ? <span>{message.time}</span> : null}
                {message.channel ? <Badge variant="outline">{message.channel}</Badge> : null}
              </div>
              <MessageContent>
                <MessageResponse>{message.text}</MessageResponse>
              </MessageContent>
              <MessageActions className="opacity-70 transition-opacity group-hover:opacity-100">
                <MessageAction
                  label={todoStatus ? 'Update pin' : 'Pin message'}
                  onClick={() => onTogglePin(message.id)}
                  tooltip={todoStatus === 'done' ? 'Unpin' : todoStatus === 'todo' ? 'Mark done' : 'Pin'}
                >
                  {todoStatus === 'done' ? (
                    <IconCheck className="size-4" />
                  ) : todoStatus === 'todo' ? (
                    <IconPinnedOff className="size-4" />
                  ) : (
                    <IconPinned className="size-4" />
                  )}
                </MessageAction>
              </MessageActions>
            </Message>
          )
        })}
      </div>
    </ScrollArea>
  )
}
```

#### `apps/web/src/components/workbench/ChatComposer.tsx`

```tsx
'use client'

import { useCallback } from 'react'

import {
  PromptInput,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'

type ChatComposerProps = {
  disabled?: boolean
  onSend: (text: string) => void
}

export function ChatComposer({ disabled, onSend }: ChatComposerProps) {
  const handleSubmit = useCallback(
    (message: PromptInputMessage) => {
      const text = message.text.trim()
      if (!text || disabled) {
        return
      }
      onSend(text)
    },
    [disabled, onSend]
  )

  return (
    <PromptInput
      className="border-t border-border/60 bg-background px-3 py-3"
      onSubmit={handleSubmit}
    >
      <PromptInputBody>
        <PromptInputTextarea
          className="min-h-12"
          disabled={disabled}
          placeholder="Message the room"
        />
      </PromptInputBody>
      <PromptInputFooter>
        <div className="text-[11px] text-muted-foreground">Enter sends. Shift+Enter adds a line.</div>
        <PromptInputSubmit disabled={disabled} />
      </PromptInputFooter>
    </PromptInput>
  )
}
```

#### `apps/web/src/components/workbench/AgentRosterPanel.tsx`

```tsx
'use client'

import { IconCircleCheck, IconClock, IconPlugConnected, IconUser } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { ChattrAgent } from '@/lib/chattr-room-types'
import { cn } from '@/lib/cn'

type AgentRosterPanelProps = {
  agents: ChattrAgent[]
}

const statusIcon = {
  active: IconPlugConnected,
  configured: IconCircleCheck,
  offline: IconUser,
  pending: IconClock,
}

export function AgentRosterPanel({ agents }: AgentRosterPanelProps) {
  return (
    <aside className="hidden w-56 shrink-0 border-l border-border/60 bg-background/70 lg:flex lg:flex-col">
      <div className="flex h-9 items-center justify-between border-b border-border/60 px-3">
        <span className="text-xs font-medium">Agents</span>
        <Badge variant="secondary" className="h-5 text-[10px]">
          {agents.length}
        </Badge>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-1 p-2">
          {agents.map((agent) => {
            const Icon = statusIcon[agent.status] ?? IconUser
            return (
              <div
                className="flex min-h-9 items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent/40"
                key={agent.name}
              >
                <Icon
                  className={cn(
                    'size-4 shrink-0',
                    agent.status === 'active' ? 'text-emerald-600' : 'text-muted-foreground'
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{agent.displayName ?? agent.name}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {agent.provider ?? 'local'}{agent.model ? ` / ${agent.model}` : ''}
                  </div>
                </div>
                <Badge variant="outline" className="h-5 text-[10px] capitalize">
                  {agent.status}
                </Badge>
              </div>
            )
          })}
          {agents.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/70 p-3 text-xs text-muted-foreground">
              No agents connected.
            </div>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  )
}
```

#### `apps/web/src/components/workbench/PendingAgentNameDialog.tsx`

```tsx
'use client'

import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { PendingAgentName } from '@/lib/chattr-room-types'

type PendingAgentNameDialogProps = {
  pending: PendingAgentName | null
  onConfirm: (instanceId: string, name: string) => void
}

export function PendingAgentNameDialog({
  onConfirm,
  pending,
}: PendingAgentNameDialogProps) {
  const [name, setName] = useState('')

  useEffect(() => {
    setName(pending?.suggestedName ?? '')
  }, [pending])

  return (
    <Dialog open={Boolean(pending)}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Name agent instance</DialogTitle>
          <DialogDescription>
            Confirm the display name for the pending local agent before it joins the room.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Label htmlFor="pending-agent-name">Agent name</Label>
          <Input
            id="pending-agent-name"
            onChange={(event) => setName(event.target.value)}
            value={name}
          />
        </div>
        <DialogFooter>
          <Button
            disabled={!pending || !name.trim()}
            onClick={() => pending && onConfirm(pending.instanceId, name.trim())}
            type="button"
          >
            Confirm
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
```

#### `services/api/tests/test_workbench_runtime_contract.py`

```py
from fastapi.testclient import TestClient

from app import main


def test_api_session_does_not_expose_token_unauthenticated():
    client = TestClient(main.app)

    response = client.get("/api/session")

    assert response.status_code in {403, 404}
    assert "token" not in response.text.lower()


def test_workbench_html_injects_session_token(monkeypatch):
    monkeypatch.setattr(main, "_session_token_provider", lambda: "test-token")
    client = TestClient(main.app)

    response = client.get("/workbench")

    assert response.status_code == 200
    assert "window.__SESSION_TOKEN__" in response.text
    assert "test-token" in response.text


def test_workbench_static_runtime_does_not_reference_8300():
    client = TestClient(main.app)

    response = client.get("/workbench")

    assert "127.0.0.1:8300" not in response.text
    assert "localhost:8300" not in response.text
```

#### `services/api/tests/test_workbench_observability.py`

```py
from app.observability import runtime


def test_workbench_observability_names_are_declared():
    assert "workbench.html.serve" in runtime.WORKBENCH_TRACE_NAMES
    assert "workbench.ws.connect" in runtime.WORKBENCH_TRACE_NAMES
    assert "workbench.ws.initial_hydrate" in runtime.WORKBENCH_TRACE_NAMES
    assert "workbench.board.rules.mutate" in runtime.WORKBENCH_TRACE_NAMES
    assert "workbench.board.jobs.mutate" in runtime.WORKBENCH_TRACE_NAMES
    assert "workbench.board.locked.mutate" in runtime.WORKBENCH_TRACE_NAMES
    assert "workbench.board.pins.mutate" in runtime.WORKBENCH_TRACE_NAMES


def test_workbench_observability_forbidden_attributes_block_sensitive_content():
    forbidden = runtime.WORKBENCH_FORBIDDEN_ATTRIBUTES

    assert "session.token" in forbidden
    assert "message.text" in forbidden
    assert "rule.text" in forbidden
    assert "job.title" in forbidden
    assert "locked.text" in forbidden
    assert "email" in forbidden
    assert "api_key" in forbidden
```

### Proposed Code For Existing File Edits

Existing-file code is expressed as surgical diff hunks or replacement blocks. Keep surrounding code intact unless a hunk explicitly removes it.

#### `apps/web/package.json`

```diff
@@
-    "dev": "vite --host 127.0.0.1 --port 8800",
+    "dev": "vite --host 127.0.0.1 --port 8801",
@@
-    "preview": "vite preview --host 127.0.0.1 --port 8800"
+    "preview": "vite preview --host 127.0.0.1 --port 8801"
```

#### `apps/web/vite.config.ts`

```diff
@@
   server: {
     host: '127.0.0.1',
-    port: 8800,
+    port: 8801,
     strictPort: true,
   },
   preview: {
     host: '127.0.0.1',
-    port: 8800,
+    port: 8801,
     strictPort: true,
   },
 })
```

No `/api`, `/uploads`, or `/ws` proxy block may be added back.

#### `apps/web/src/lib/chattr-api.ts`

Replace the current file with:

```ts
declare global {
  interface Window {
    __SESSION_TOKEN__?: string
    __CHATTR_SESSION_TOKEN__?: string
    __CHATTR_SESSION__?: { token?: string }
  }
}

export function getSessionToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  return (
    window.__SESSION_TOKEN__ ??
    window.__CHATTR_SESSION_TOKEN__ ??
    window.__CHATTR_SESSION__?.token ??
    ''
  )
}

export function requireSessionToken() {
  const token = getSessionToken()
  if (!token) {
    throw new Error('Workbench session token was not injected.')
  }
  return token
}

export function websocketUrl(path = '/ws', token = requireSessionToken()) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(path, `${protocol}//${window.location.host}`)
  url.searchParams.set('token', token)
  return url.toString()
}

export async function chattrHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  const token = requireSessionToken()
  headers.set('X-Session-Token', token)
  return headers
}

export async function chattrJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await chattrHeaders(init.headers)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(path, {
    ...init,
    cache: 'no-store',
    headers,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Request failed with ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

export {}
```

#### `apps/web/src/routes/workbench.tsx`

Add imports:

```ts
import { AgentRosterPanel } from '@/components/workbench/AgentRosterPanel'
import { ChatComposer } from '@/components/workbench/ChatComposer'
import { ChatTranscript } from '@/components/workbench/ChatTranscript'
import { PendingAgentNameDialog } from '@/components/workbench/PendingAgentNameDialog'
import { useChattrRoom } from '@/hooks/use-chattr-room'
```

Delete the complete block beginning with `const initialMessages: WorkbenchMessage[] = [` and ending with `] as const`, then insert this comment where that constant was:

```ts
// Operational transcript state comes from useChattrRoom. Do not reintroduce
// mock initialMessages into the live workbench route.
```

Inside `WorkbenchPage`, replace mock transcript/composer state with:

```ts
const rightDockRef = useRef<PanelImperativeHandle | null>(null)
const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null)
const room = useChattrRoom()
const [activeDockTab, setActiveDockTab] = useState<DockTabId>('board')
```

Delete `appendUserMessage`. Replace `handleNewSession` and the composer submit handler with:

```ts
const handleNewSession = useCallback(() => {
  room.dispatch({ type: 'event', event: { type: 'clear' } })
}, [room])

const handleComposerSend = useCallback((text: string) => {
  room.actions.sendMessage(text)
}, [room.actions])
```

Mount the pending-name dialog next to the existing settings dialog:

```tsx
<PendingAgentNameDialog
  onConfirm={room.actions.renamePendingAgent}
  pending={room.state.pendingAgent}
/>
```

Replace `main={<BoardDock />}` with:

```tsx
main={
  <BoardDock
    actions={room.actions}
    capabilities={room.state.capabilities}
    connection={room.state.connection}
    jobs={room.state.jobs}
    locked={room.state.locked}
    onSelectPinnedMessage={setHighlightedMessageId}
    pins={room.state.pins}
    rules={room.state.rules}
    todos={room.state.todos}
  />
}
```

Replace the existing center chat transcript/composer render block with:

```tsx
<main className="flex min-w-0 flex-1 flex-col bg-background">
  <ChatTranscript
    highlightedMessageId={highlightedMessageId}
    messages={room.state.messages}
    onTogglePin={room.actions.togglePin}
    todos={room.state.todos}
  />
  <ChatComposer
    disabled={room.state.connection !== 'connected'}
    onSend={handleComposerSend}
  />
</main>
<AgentRosterPanel agents={room.state.agents} />
```

#### `apps/web/src/components/workbench/BoardDock.tsx`

Add this import:

```ts
import type { ChattrRoomConnectionState } from '@/lib/chattr-room-types'
```

Add these props before the component:

```ts
type BoardDockActions = {
  archiveJob: (jobId: number) => Promise<void>
  clearPins: () => Promise<void>
  permanentDeleteJob: (jobId: number) => Promise<void>
  remindRules: () => Promise<void>
  togglePin: (messageId: number) => boolean
  updatePin: (messageId: number, action: 'done' | 'reopen' | 'remove') => Promise<void>
}

type BoardDockProps = {
  actions: BoardDockActions
  capabilities: CapabilityTab[] | null
  connection: ChattrRoomConnectionState
  jobs: JobItem[]
  locked: LockedItem[]
  onSelectPinnedMessage: (messageId: number) => void
  pins: PinItem[]
  rules: RuleItem[]
  todos: Record<number, 'todo' | 'done'>
}
```

Replace the component signature and remove local Board snapshot state:

```ts
export function BoardDock({
  actions,
  capabilities,
  connection,
  jobs,
  locked,
  onSelectPinnedMessage,
  pins,
  rules,
}: BoardDockProps) {
  const [activeTab, setActiveTab] = useState<BoardTabId>('rules')
```

Delete these local snapshot declarations and functions:

```ts
const [capabilities, setCapabilities] = useState<CapabilityTab[] | null>(null)
const [rules, setRules] = useState<RuleItem[]>([])
const [jobs, setJobs] = useState<JobItem[]>([])
const [locked, setLocked] = useState<LockedItem[]>([])
const [pins, setPins] = useState<PinItem[]>([])
const [pinMessageId, setPinMessageId] = useState('')
the complete `loadBoard` callback declaration
useEffect(() => {
  void loadBoard()
}, [loadBoard])
```

Replace `withSave` so it does not reload the full Board after every save:

```ts
const withSave = useCallback(
  async (key: string, action: () => Promise<void>) => {
    setSaving(key)
    setError('')
    try {
      await action()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setSaving('')
    }
  },
  []
)
```

Add:

```ts
const remindRules = useCallback(async () => {
  await withSave('rules-remind', actions.remindRules)
}, [actions.remindRules, withSave])
```

Replace active job delete behavior:

```ts
const deleteJob = useCallback(
  async (jobId: number) => {
    await withSave(`archive-job-${jobId}`, async () => {
      await actions.archiveJob(jobId)
    })
  },
  [actions, withSave]
)
```

Delete the `createPin` form handler entirely. Replace the manual message-ID pin form with:

```tsx
<div className="rounded-md border border-dashed border-border/70 p-2 text-xs text-muted-foreground">
  Pin messages from transcript rows. This tab lists live pinned messages and jumps back to the source message.
</div>
```

Replace the steady-state error title:

```tsx
<AlertTitle>Board unavailable</AlertTitle>
```

Replace pin-row click behavior with:

```tsx
onClick={() => {
  onSelectPinnedMessage(pin.message_id)
}}
```

Add a Rules Remind button in the Rules tab toolbar:

```tsx
<Button
  className="h-7 gap-1 px-2 text-xs"
  disabled={Boolean(saving)}
  onClick={() => void remindRules()}
  size="sm"
  type="button"
  variant="outline"
>
  <IconBellRinging className="size-3.5" />
  Remind
</Button>
```

#### `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`

```diff
@@
-type WorkbenchCompactRailProps = {
+type WorkbenchCompactRailProps = {
   account: {
@@
   onNewConversation: () => void
   onOpenSettings: () => void
+  sessionStatus?: 'idle' | 'connecting' | 'connected' | 'degraded' | 'closed' | 'error'
 }
@@
+        {sessionStatus ? (
+          <span className="sr-only">Session status: {sessionStatus}</span>
+        ) : null}
```

#### `apps/web/src/components/workbench/board/types.ts`

Replace the lane/status section with:

```ts
export type RuleLaneId = 'draft' | 'active' | 'archived'
export type JobLaneId = 'open' | 'active' | 'done' | 'archived'
export type LockedLaneId = 'active' | 'archived'
export type PinLaneId = 'todo' | 'done'

export function normalizeRuleStatus(status: string): RuleLaneId {
  if (status === 'active' || status === 'approved') {
    return 'active'
  }
  if (status === 'archived' || status === 'archive') {
    return 'archived'
  }
  return 'draft'
}

export function normalizeJobStatus(status: string): JobLaneId {
  if (status === 'active' || status === 'running') {
    return 'active'
  }
  if (status === 'done' || status === 'closed') {
    return 'done'
  }
  if (status === 'archived' || status === 'archive') {
    return 'archived'
  }
  return 'open'
}
```

#### `apps/web/src/components/workbench/board/BoardItemRow.tsx`

```diff
@@
 type BoardItemRowProps = {
@@
+  tone?: 'default' | 'active' | 'archived' | 'done' | 'draft'
 }
@@
-      title,
+      title,
+      tone = 'default',
@@
-        'group rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-xs transition-colors',
+        'group rounded-md border px-1.5 py-1.5 shadow-xs transition-colors',
+        tone === 'active' ? 'border-emerald-500/50 bg-emerald-500/10' : '',
+        tone === 'draft' ? 'border-border/70 bg-muted/35' : '',
+        tone === 'done' ? 'border-sky-500/40 bg-sky-500/10' : '',
+        tone === 'archived' ? 'border-border/40 bg-background opacity-70' : '',
+        tone === 'default' ? 'border-border/60 bg-card' : '',
@@
-      {children ? <div className="mt-2 pl-0">{children}</div> : null}
+      {children ? <div className="mt-2">{children}</div> : null}
```

#### `apps/web/src/components/workbench/board/BoardSection.tsx`

```diff
@@
 type BoardSectionProps = {
@@
+  tone?: 'default' | 'active' | 'archived' | 'done' | 'draft'
 }
@@
-  title,
+  title,
+  tone = 'default',
@@
-      className={cn('overflow-hidden rounded-md border border-border/70 bg-background', className)}
+      className={cn(
+        'overflow-hidden rounded-md border bg-background',
+        tone === 'active' ? 'border-emerald-500/40' : '',
+        tone === 'draft' ? 'border-border/70' : '',
+        tone === 'done' ? 'border-sky-500/40' : '',
+        tone === 'archived' ? 'border-border/40 opacity-80' : '',
+        tone === 'default' ? 'border-border/70' : '',
+        className
+      )}
```

#### `services/api/config.toml`

```diff
@@
-port = 8300
+port = 8800
```

Keep MCP HTTP/SSE ports on `8301` and `8302`.

#### `services/api/app/cli.py`

```diff
@@
-"""Entry point - starts MCP servers (8301/8302) + web UI (8300)."""
+"""Entry point - starts MCP servers (8301/8302) + workbench runtime (8800)."""
@@
-    port = config.get("server", {}).get("port", 8300)
+    port = config.get("server", {}).get("port", 8800)
```

#### `services/api/app/main.py`

```diff
@@
-                or path == "/api/session"
                 or path.startswith(("/workbench/", "/static/", "/uploads/", "/api/roles"))
@@
-async def get_browser_session():
-    return JSONResponse({"token": _session_token_provider()})
```

Add workbench HTML serving helpers near the existing static/workbench route setup:

```py
WORKBENCH_DIST = Path(__file__).resolve().parents[2] / "static" / "workbench"


def _inject_workbench_session(html: str) -> str:
    token = _session_token_provider()
    script = (
        f'<script>window.__SESSION_TOKEN__={json.dumps(token)};'
        f'window.__CHATTR_SESSION_TOKEN__={json.dumps(token)};</script>'
    )
    return html.replace("</head>", f"{script}\n</head>")


async def serve_workbench():
    index_path = WORKBENCH_DIST / "index.html"
    html = index_path.read_text(encoding="utf-8")
    return HTMLResponse(_inject_workbench_session(html))
```

Instrument WebSocket rejection:

```py
if token != session_token:
    runtime.record_workbench_token_rejected(source="websocket", has_token=bool(token))
    await websocket.accept()
    await websocket.close(code=1008)
    return
```

Instrument rules/jobs/locked/pins mutations with:

```py
runtime.record_workbench_board_mutation(tab="rules", action="remind", result="ok")
runtime.record_workbench_board_mutation(tab="jobs", action="delete", result="ok")
runtime.record_workbench_board_mutation(tab="locked", action="update", result="ok")
runtime.record_workbench_board_mutation(tab="pins", action="update", result="ok")
```

#### `services/api/app/routes/status.py`

```diff
@@
-    router.add_api_route("/api/session", main_module.get_browser_session, methods=["GET"])
```

#### `services/api/app/observability/runtime.py`

Add:

```py
WORKBENCH_TRACE_NAMES = {
    "workbench.html.serve",
    "workbench.ws.connect",
    "workbench.ws.initial_hydrate",
    "workbench.board.rules.mutate",
    "workbench.board.jobs.mutate",
    "workbench.board.locked.mutate",
    "workbench.board.pins.mutate",
}

WORKBENCH_METRIC_NAMES = {
    "kai_chattr.workbench.html.serve.count",
    "kai_chattr.workbench.ws.connect.count",
    "kai_chattr.workbench.board.mutation.count",
    "kai_chattr.workbench.security.token_rejected.count",
}

WORKBENCH_FORBIDDEN_ATTRIBUTES = {
    "api_key",
    "email",
    "job.title",
    "locked.text",
    "message.text",
    "rule.text",
    "session.token",
}


def record_workbench_token_rejected(*, source: str, has_token: bool) -> None:
    log_event(
        "workbench.security.token_rejected",
        {"source": source, "has_token": has_token},
    )


def record_workbench_board_mutation(*, tab: str, action: str, result: str) -> None:
    log_event(
        "workbench.board.mutation",
        {"tab": tab, "action": action, "result": result},
    )
```

#### `services/api/tests/conftest.py`

```diff
@@
+@pytest.fixture
+def workbench_dist(tmp_path, monkeypatch):
+    dist = tmp_path / "workbench"
+    dist.mkdir()
+    (dist / "index.html").write_text(
+        "<html><head></head><body><div id=\"root\"></div></body></html>",
+        encoding="utf-8",
+    )
+    monkeypatch.setattr(main, "WORKBENCH_DIST", dist)
+    return dist
```

#### `services/api/tests/test_mcp_right_rail_tools.py`

Replace the existing test that asserts unauthenticated `/api/session` token access with:

```py
def test_get_browser_session_does_not_expose_token_without_auth(client):
    response = client.get("/api/session")
    assert response.status_code in {403, 404}
    assert "token" not in response.text.lower()
```

#### `services/api/tests/test_runtime_health.py`

```diff
@@
-    assert payload["port"] == 8300
+    assert payload["port"] == 8800
```

#### `services/api/tests/test_config_overrides.py`

```diff
@@
-    assert config["server"]["port"] == 8300
+    assert config["server"]["port"] == 8800
```

#### `services/api/tests/test_router.py`

```diff
@@
+def test_router_does_not_mount_api_session(app):
+    paths = {route.path for route in app.routes}
+    assert "/api/session" not in paths
```

#### `services/api/tests/test_platform_api.py`

```diff
@@
+def test_workbench_route_serves_html(client, workbench_dist):
+    response = client.get("/workbench")
+    assert response.status_code == 200
+    assert "window.__SESSION_TOKEN__" in response.text
```

#### `services/api/tests/test_launcher_control_api.py`

```diff
@@
-    assert runtime_base_url.endswith(":8300")
+    assert runtime_base_url.endswith(":8800")
```

## Frozen Seam Contract

### Runtime Seam

The runtime seam is:

```text
browser -> http://127.0.0.1:8800/workbench
browser -> same-origin /api/*
browser -> same-origin /ws?token=<injected token>
services/api -> local stores + MCP bridge/tools
```

Rejected seams:

1. `browser 8800 -> proxy -> 8300` for `/api` or `/ws`
2. `browser -> /api/session -> raw token`
3. `kai-chattr -> import/read/execute E:\chattr` at runtime
4. `BoardDock -> isolated REST snapshot state` as the final live model
5. `legacy static JS/CSS -> copied into apps/web` as implementation

If a same-origin `8800` runtime cannot serve the workbench and API/WS together, implementation must stop and this plan must be revised. Do not fall back to an `8300` proxy.

## Frozen Board Behavior Contract

Rules:

- Render draft, active, and archive states distinctly.
- Support create, edit, activate, archive, restore, delete, and Remind.
- Remind calls `/api/rules/remind` and surfaces the live event.
- Active rules must be visually and semantically distinct from drafts/archive.

Jobs:

- Render meaningful status lanes with drag/drop status transitions and ordering.
- Create, edit title/assignee/status, reorder, archive/close, and confirmed permanent delete.
- Permanent delete is available only through archived/trash/confirmation semantics.
- Job changes from REST, WebSocket, or MCP update live.

Locked:

- Render active and archived locked records.
- Support create, edit, archive, restore, and delete.
- Locked changes from REST, WebSocket, or MCP update live.

Pinned:

- Pins originate from transcript message rows.
- Pin state cycles todo/done/unpin according to the existing todo behavior.
- Board Pinned entries show enough message context to identify the message.
- Clicking a pin scrolls/navigates to and highlights the transcript message.
- Manual entry of a message ID is not the primary UI.

Capability fallback:

- If `/api/right-rail/capabilities` fails or returns unusable data, the Board still shows Rules, Jobs, Locked, and Pinned or an explicit degraded state.
- It must never silently remove the Board.

## Explicit Risks Accepted In This Plan

1. The plan modifies an already dirty worktree. Implementation must preserve unrelated user/worker changes and may not revert files wholesale.
2. `services/api` currently contains copied/adapted backend code with `8300` assumptions. The implementation must correct those assumptions inside this repo rather than proxying to the old runtime.
3. Moving Vite dev off `8800` may change local frontend iteration commands. This is accepted because `8800` must be reserved for acceptance runtime ownership.
4. The current backend stores are local JSON stores, not a database. This is accepted for the Board/runtime slice because it matches legacy local workbench behavior.
5. The plan does not add frontend test-runner dependencies. Frontend verification relies on TypeScript/Vite build, governance checks, and MCP Router Playwright unless a later approved plan adds Vitest/Playwright package tests.
6. Exact CSS values are implementation details, but the behavior and component boundaries are locked.

## Tasks

## Task 1: Write failing backend runtime/security tests

**File(s):** `services/api/tests/test_workbench_runtime_contract.py`, `services/api/tests/test_mcp_right_rail_tools.py`, `services/api/tests/test_runtime_health.py`

**Step 1:** Add `test_workbench_served_on_8800_contract` asserting the runtime config/CLI path serves `/workbench` from the same repo on port `8800`.
**Step 2:** Add `test_api_session_does_not_expose_token_unauthenticated` asserting `GET /api/session` returns `404` or `403`, not a token payload.
**Step 3:** Update the existing token-access assertion in `test_mcp_right_rail_tools.py` so it fails until `/api/session` is removed or protected.
**Step 4:** Add runtime-health expectations that expose the runtime web port as `8800` where the health/status contract reports ports.

**Test command:** `cd E:\kai-chattr\services\api; uv run pytest tests/test_workbench_runtime_contract.py tests/test_mcp_right_rail_tools.py tests/test_runtime_health.py -q`
**Expected output:** tests fail only on the not-yet-implemented 8800 runtime contract and `/api/session` removal.

**Commit:** `test: lock workbench runtime and session security contract`

## Task 2: Move backend runtime ownership to 8800

**File(s):** `services/api/config.toml`, `services/api/app/cli.py`, `services/api/app/main.py`, `services/api/tests/test_config_overrides.py`, `services/api/tests/test_router.py`, `services/api/tests/test_platform_api.py`, `services/api/tests/test_launcher_control_api.py`

**Step 1:** Change the default web/API/WS runtime port from `8300` to `8800` in config and CLI defaults.
**Step 2:** Keep MCP ports on `8301` and `8302` unless a direct conflict is discovered.
**Step 3:** Update tests that encode the web runtime port.
**Step 4:** Verify launcher/control tests still register against the same-repo runtime and do not require old `E:\chattr`.

**Test command:** `cd E:\kai-chattr\services\api; uv run pytest tests/test_config_overrides.py tests/test_router.py tests/test_platform_api.py tests/test_launcher_control_api.py -q`
**Expected output:** all selected tests pass with the web/API/WS runtime on `8800`.

**Commit:** `fix(api): make kai-chattr own workbench runtime port`

## Task 3: Serve the built workbench and inject the token same-origin

**File(s):** `services/api/app/main.py`, `services/api/app/cli.py`, `services/api/tests/test_workbench_runtime_contract.py`

**Step 1:** Add or correct the backend `/workbench` HTML serving path so it serves `apps/web/dist` output under `/workbench`.
**Step 2:** Inject `window.__SESSION_TOKEN__` and `window.__CHATTR_SESSION_TOKEN__` before the React app script loads.
**Step 3:** Serve `/workbench/assets/*` from the built frontend output.
**Step 4:** Ensure no handler reads files from `E:\chattr`.
**Step 5:** Extend tests to assert injected-token globals exist in the HTML and no raw token is logged.

**Test command:** `cd E:\kai-chattr\services\api; uv run pytest tests/test_workbench_runtime_contract.py -q`
**Expected output:** the workbench HTML route passes and proves same-origin token injection.

**Commit:** `fix(api): serve workbench shell from kai-chattr runtime`

## Task 4: Remove `/api/session` from browser and backend

**File(s):** `apps/web/src/lib/chattr-api.ts`, `services/api/app/main.py`, `services/api/app/routes/status.py`, `services/api/tests/test_mcp_right_rail_tools.py`, `services/api/tests/test_workbench_runtime_contract.py`

**Step 1:** Remove browser fallback fetching `/api/session`.
**Step 2:** Make token resolution require injected globals from the backend-served page.
**Step 3:** Remove `/api/session` route registration.
**Step 4:** Remove the `/api/session` middleware bypass.
**Step 5:** Update tests to assert unauthenticated access cannot retrieve the raw token.

**Test command:** `cd E:\kai-chattr\services\api; uv run pytest tests/test_mcp_right_rail_tools.py tests/test_workbench_runtime_contract.py -q`
**Expected output:** tests pass and no test asserts unauthenticated token access.

**Commit:** `fix(security): remove browser session token endpoint`

## Task 5: Remove Vite proxy-to-8300 acceptance path

**File(s):** `apps/web/vite.config.ts`, `apps/web/package.json`

**Step 1:** Move Vite dev/preview scripts off `8800` to `8801` or another explicitly non-acceptance port.
**Step 2:** Remove `/api`, `/uploads`, and `/ws` proxy targets to `8300`.
**Step 3:** Keep build output compatible with backend `/workbench` serving.
**Step 4:** Do not add a replacement hidden proxy to `8300`.

**Test command:** `cd E:\kai-chattr; pnpm web:build`
**Expected output:** Vite build succeeds and no Vite config contains a proxy target to `8300`.

**Commit:** `fix(web): remove 8300 proxy from workbench target`

## Task 6: Add shared live room protocol and reducer

**File(s):** `apps/web/src/lib/chattr-room-types.ts`, `apps/web/src/lib/chattr-room-reducer.ts`, `apps/web/src/hooks/use-chattr-room.ts`, `apps/web/src/lib/chattr-api.ts`

**Step 1:** Define typed WebSocket events for transcript, todos/pins, rules, jobs, locked records, roster/status, pending names, typing, errors, and clear/reset.
**Step 2:** Implement an idempotent reducer that can apply initial snapshots and individual update events without duplicating rows.
**Step 3:** Implement `useChattrRoom` to open same-origin `/ws?token=<injected token>`.
**Step 4:** Expose actions for sending chat messages, renaming pending agents, toggling pins, and dispatching Board mutation success updates.
**Step 5:** Include explicit disconnected, connecting, connected, degraded, and error states.

**Test command:** `cd E:\kai-chattr; pnpm web:build`
**Expected output:** TypeScript build passes with the shared live room model.

**Commit:** `feat(web): add shared live chattr room state`

## Task 7: Replace mock workbench transcript with live state

**File(s):** `apps/web/src/routes/workbench.tsx`, `apps/web/src/components/workbench/ChatTranscript.tsx`, `apps/web/src/components/workbench/ChatComposer.tsx`, `apps/web/src/components/workbench/AgentRosterPanel.tsx`, `apps/web/src/components/workbench/PendingAgentNameDialog.tsx`

**Step 1:** Remove operational use of `initialMessages` and mock reset paths from `workbench.tsx`.
**Step 2:** Render transcript rows from `useChattrRoom` state.
**Step 3:** Wire composer sends to the WebSocket message action.
**Step 4:** Render roster/status/pending names from live room state.
**Step 5:** Add pending-agent naming dialog using shadcn Dialog primitives and Tabler icons where icons are needed.
**Step 6:** Keep layout under the approved workbench shell and existing dock components.

**Test command:** `cd E:\kai-chattr; pnpm web:build`
**Expected output:** build passes and `workbench.tsx` no longer contains operational mock transcript initialization.

**Commit:** `feat(web): wire workbench chat to live room state`

## Task 8: Refactor BoardDock to consume live state and preserve Board parity

**File(s):** `apps/web/src/components/workbench/BoardDock.tsx`, `apps/web/src/components/workbench/board/types.ts`, `apps/web/src/components/workbench/board/BoardItemRow.tsx`, `apps/web/src/components/workbench/board/BoardSection.tsx`, `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`

**Step 1:** Change `BoardDock` props so it receives rules, jobs, locked records, pins, capabilities, connection state, and action callbacks from the shared room model.
**Step 2:** Remove isolated REST snapshot ownership as the final model; keep REST only for initial/degraded fallback and mutation calls.
**Step 3:** Implement capability fallback to the four default tabs.
**Step 4:** Add Rules Remind action.
**Step 5:** Implement distinct lane visuals and state semantics for draft/active/archive and job status lanes.
**Step 6:** Implement drag/drop transitions and reorder persistence through existing endpoints.
**Step 7:** Change active job delete to archive/close; reserve permanent delete for archived/trash confirmation.
**Step 8:** Remove the manual message-ID pin form as the primary path; render pins from transcript message actions.
**Step 9:** Ensure Tabler icons are the only icons used by new or modified Board UI.

**Test command:** `cd E:\kai-chattr; pnpm web:build`
**Expected output:** build passes; Board renders with live state props and no steady-state `Board API error` surface.

**Commit:** `feat(web): restore live Board behavior in right dock`

## Task 9: Add backend observability for the workbench runtime and Board mutations

**File(s):** `services/api/app/observability/runtime.py`, `services/api/app/main.py`, `services/api/tests/test_workbench_observability.py`

**Step 1:** Add helper functions or existing-runtime wrappers for the locked traces, counters, and structured logs.
**Step 2:** Instrument `/workbench` serving, WebSocket connect/hydration, Board mutations, and token rejection.
**Step 3:** Add tests that assert the observability hooks are called or configured without leaking token/raw content attributes.
**Step 4:** Keep PII/content exclusions explicit in test names or assertions.

**Test command:** `cd E:\kai-chattr\services\api; uv run pytest tests/test_workbench_observability.py -q`
**Expected output:** observability tests pass and token/raw-content leakage assertions pass.

**Commit:** `feat(api): instrument workbench board runtime`

## Task 10: Run full backend and frontend verification

**File(s):** all files in Locked File Inventory

**Step 1:** Run backend targeted tests.
**Step 2:** Run frontend build.
**Step 3:** Run dependency and contract checks.
**Step 4:** Search for rejected runtime patterns.

**Test command:** `cd E:\kai-chattr\services\api; uv run pytest tests/test_workbench_runtime_contract.py tests/test_workbench_observability.py tests/test_mcp_right_rail_tools.py tests/test_runtime_health.py tests/test_config_overrides.py tests/test_router.py tests/test_platform_api.py tests/test_launcher_control_api.py -q`
**Expected output:** all selected backend tests pass.

**Test command:** `cd E:\kai-chattr; pnpm web:build`
**Expected output:** frontend build passes.

**Test command:** `cd E:\kai-chattr; pnpm check:deps; pnpm check:contracts`
**Expected output:** dependency and governance checks pass.

**Test command:** `cd E:\kai-chattr; rg -n "8300|/api/session|Board API error|initialMessages|E:\\\\chattr" apps services governance docs/plans/kai-chattr-workbench-board-runtime-recovery-implementation-plan.md`
**Expected output:** only allowed documentation references remain; no runtime code path contains rejected `8300`, `/api/session`, steady-state `Board API error`, operational `initialMessages`, or old-repo runtime dependency.

**Commit:** `test: verify workbench board runtime migration`

## Task 11: Run MCP Router Playwright acceptance on `8800/workbench`

**File(s):** no source files unless acceptance uncovers defects

**Step 1:** Start the kai-chattr backend runtime from `E:\kai-chattr\services\api` on `8800`.
**Step 2:** Navigate MCP Router Playwright to `http://127.0.0.1:8800/workbench`.
**Step 3:** Verify the page loads the backend-served React workbench.
**Step 4:** Verify the browser network log has no request to `127.0.0.1:8300` or `localhost:8300`.
**Step 5:** Open Board and verify Rules, Jobs, Locked, and Pinned sub-tabs render.
**Step 6:** Create a rule, activate it, archive/restore it, and trigger Remind.
**Step 7:** Create a job, move it between lanes, reorder it, archive it, then permanent-delete only through confirmation/trash.
**Step 8:** Create/edit/archive/restore a locked record.
**Step 9:** Pin a transcript message from the message row, open Board Pinned, click the pin, and verify the transcript message is reached/highlighted.
**Step 10:** Capture screenshots for desktop and narrow viewport if the UI changed.

**Test command:** MCP Router Playwright browser session against `http://127.0.0.1:8800/workbench`
**Expected output:** all 10 steps pass and screenshots show no mock stale transcript content, no `Board API error`, no hidden `8300` dependency, and a functioning Board.

**Commit:** `test: verify 8800 workbench board acceptance`

## Verification Commands

Run these before claiming implementation completion:

```powershell
cd E:\kai-chattr\services\api
uv run pytest tests/test_workbench_runtime_contract.py tests/test_workbench_observability.py tests/test_mcp_right_rail_tools.py tests/test_runtime_health.py tests/test_config_overrides.py tests/test_router.py tests/test_platform_api.py tests/test_launcher_control_api.py -q
```

Expected result: all selected backend tests pass.

```powershell
cd E:\kai-chattr
pnpm web:build
pnpm check:deps
pnpm check:contracts
```

Expected result: build, dependency check, and governance contract check pass.

```powershell
cd E:\kai-chattr
rg -n "8300|/api/session|Board API error|initialMessages|E:\\\\chattr" apps services governance
```

Expected result: no rejected runtime-code occurrences remain. Documentation references are acceptable only when they describe rejected legacy behavior.

MCP Router Playwright must also verify:

1. `http://127.0.0.1:8800/workbench` loads.
2. No request goes to `127.0.0.1:8300` or `localhost:8300`.
3. Board Rules, Jobs, Locked, and Pinned are visible and interactive.
4. REST, WebSocket, and MCP-originated Board changes appear live.
5. Screenshots show no stale mock transcript content and no steady-state Board API error.

## Plan Validity Check

This plan includes every required section from `/investigating-and-writing-plan`:

1. Header with feature name, goal, architecture, tech stack, status, author, and date.
2. Manifest.
3. Platform API.
4. Observability.
5. Database Migrations.
6. Edge Functions.
7. Frontend Surface Area.
8. Pre-Implementation Contract.
9. Locked Product Decisions.
10. Locked Acceptance Contract.
11. Locked Platform API Surface.
12. Locked Observability Surface.
13. Locked Inventory Counts.
14. Locked File Inventory.
15. Frozen Seam Contract.
16. Explicit Risks Accepted In This Plan.
17. Completion Criteria.
18. Bite-sized tasks with exact files, commands, expected output, and commit labels.

The plan also includes the user-required extras:

1. Explicit objective.
2. Every feature-source file opened and examined, with a statement that those files were read line 1 through EOF.
3. Every new file to be created.
4. Every legacy file to be migrated/copied/moved from old repo to new repo, explicitly `0`.
5. Every file to be modified.
6. Total counts for read files, migrated/copied/moved files, new files, modified files, and tests created/modified.
7. Backend, API, session, WebSocket, MCP, frontend, and Board changes.
8. Exact verification commands and expected results.
9. Locked acceptance criteria proving end-to-end Board/right-rail operation.
10. Code Writeup Addendum with complete proposed code for all `9` new files, proposed code hunks/replacement blocks for all `21` files to edit, and the repo location table for every new or migrated file.

## Completion Criteria

The implementation is complete only when all of the following are true:

1. The locked runtime seam exists exactly as specified: same-repo `8800/workbench`, same-origin `/api`, same-origin `/ws`, no old-repo runtime dependency.
2. The locked API surface exists exactly as specified, including removal of unauthenticated `/api/session`.
3. The locked observability surface exists exactly as specified.
4. The locked file inventory counts match the actual implementation diff.
5. No legacy files were copied/moved into the new repo unless this plan was revised first.
6. Board uses shared live room state rather than isolated REST snapshots as the final model.
7. Rules, Jobs, Locked, and Pinned meet the Frozen Board Behavior Contract.
8. The operational workbench route does not contain stale mock transcript state.
9. Backend tests pass.
10. Frontend build passes.
11. Dependency and governance checks pass.
12. MCP Router Playwright verifies the actual `8800/workbench` acceptance surface, including no `8300` network traffic.

## Execution Handoff

Before implementation, the implementer must:

1. Read this plan fully.
2. Treat locked decisions, inventory counts, and acceptance criteria as the contract.
3. Preserve unrelated existing worktree changes.
4. Stop and revise this plan if any locked decision proves wrong.
5. Never silently replace the 8800 same-origin runtime with an 8300 proxy or old-repo dependency.
