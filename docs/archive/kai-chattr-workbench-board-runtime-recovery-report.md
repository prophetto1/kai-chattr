E:\chattr\config.toml
E:\chattr\run.py
E:\chattr\app.py
E:\chattr\wrapper.py
E:\chattr\wrapper_api.py
E:\chattr\wrapper_unix.py
E:\chattr\wrapper_windows.py
E:\chattr\mcp_bridge.py
E:\chattr\mcp_proxy.py
E:\chattr\agents.py
E:\chattr\router.py
E:\chattr\store.py
E:\chattr\rules.py
E:\chattr\jobs.py
E:\chattr\schedules.py
E:\chattr\summaries.py
E:\chattr\session_engine.py
E:\chattr\session_store.py
E:\chattr\archive.py
E:\chattr\registry.py
E:\chattr\config_loader.py
E:\chattr\server\api\desktop_runtime.py
E:\chattr\server\api\platform.py
E:\chattr\server\api\terminal.py
E:\chattr\server\events\jsonl_stream.py
E:\chattr\server\events\terminal_event_schema.py
E:\chattr\server\launch\agents.toml
E:\chattr\server\launch\chattr_launcher.py
E:\chattr\server\launcher_control.py
E:\chattr\server\locked.py
E:\chattr\server\observability\runtime_obs.py
E:\chattr\server\proposals\patch_kernel.py
E:\chattr\server\runtime\session_registry.py
E:\chattr\server\tools\registry.py
E:\chattr\schemas\session-draft-message-metadata.schema.json
E:\chattr\schemas\session-start-request.schema.json
E:\chattr\schemas\session-template.schema.json
E:\chattr\static\index.html
E:\chattr\static\core.js
E:\chattr\static\chat.js
E:\chattr\static\right-panel.js
E:\chattr\static\rules-panel.js
E:\chattr\static\jobs.js
E:\chattr\static\locked-panel.js
E:\chattr\static\sessions.js
E:\chattr\static\agents-roster.js
E:\chattr\static\channels.js
E:\chattr\static\store.js
E:\chattr\static\settings-modal.js
E:\chattr\static\workspace-splitters.js
E:\chattr\static\style.css
E:\chattr\static\design-system.css
E:\chattr\static\design-legacy-bridge.css
E:\chattr\static\right-panel-overlay.css
E:\chattr\static\jobs.css
E:\chattr\static\jobs-upgrade.css
E:\chattr\static\sessions.css
E:\chattr\static\agents-roster.css
E:\chattr\static\idt-theme.css
E:\chattr\static\mocks\components.css

# Kai Chattr Workbench and Board Runtime Recovery Report

**Status:** investigation report, not completion claim  
**Date:** 2026-06-07  
**Target repo:** `E:\kai-chattr`  
**Legacy source repo:** `E:\chattr`  
**Required skills used:** `/repo-investigator`, `/code-review`, `/taking-over-investigation-and-plan`

## Read Evidence

Every file listed at the top of this report was opened and read from line 1 to EOF with `Get-Content -LiteralPath`. The read pass also computed line counts and SHA-256 hashes. The initial selected closure was 58 files; after reading `E:\chattr\static\index.html`, two additional loaded runtime stylesheets were found and read in full: `E:\chattr\static\idt-theme.css` and `E:\chattr\static\mocks\components.css`. Final closure count: 60 files.

Excluded local assets: images, icons, sounds, bytecode caches, standalone design specimen HTML, and generated cache files. Those are not runtime logic files for Board/workbench behavior. External CDN files referenced by legacy HTML were not local `E:\chattr` files.

## Full-File Read Inventory Confirmation

The complete full-file read inventory is the first 60 non-empty lines of this report. Each listed file is an `E:\chattr` runtime file that was opened and read from line 1 through the end of file. No file in that opening list is a partial read, excerpt-only read, or search-only hit.

## Skill Application

`/repo-investigator` was used to identify the legacy runtime closure and compare it to the clean target repo. The operative split is server/API/WS/MCP/store runtime plus browser modules loaded by `static/index.html`.

`/code-review` was used to classify the current kai-chattr implementation defects by security, correctness, and behavioral parity.

`/taking-over-investigation-and-plan` was used because the existing bridge plan and partial implementation are inherited artifacts, not truth. The plan claims are classified below.

## Objectives And Goals

### Primary Objective

Produce a repo-grounded recovery plan for making `E:\kai-chattr` own the complete workbench and Board runtime at `http://127.0.0.1:8800/workbench`, using `E:\chattr` only as source material, with no runtime dependency on the old repo and no hidden proxy that makes 8300 the actual authority.

### Goals

1. Establish the verified legacy runtime closure by listing every `E:\chattr` file read in full and identifying each file's role in the workbench, Board/right-rail, chat, WebSocket, MCP, store, wrapper, and session-token behavior.
2. Identify which legacy behaviors must be preserved: chat room hydration, live WebSocket updates, rules/jobs/locked/pins surfaces, active/draft/archive grouping, status transitions, reorder/drag-drop semantics, Remind rules behavior, message-row pins, and pin-to-message navigation.
3. Identify which legacy implementation details must not be copied: static HTML/CSS/JS visual presentation, mediocre legacy layout, same filenames as target architecture, and any old-repo runtime assumption that conflicts with the clean kai-chattr component contract.
4. Prove where the current `E:\kai-chattr` implementation diverges from the required runtime: 8800 proxying to 8300, unauthenticated `/api/session`, REST-only Board state, mock transcript content, incomplete Board parity, and the rejected 8300-centered plan.
5. Define the target runtime requirement precisely: all files needed for the workbench and Board must exist inside `E:\kai-chattr`; `E:\chattr` may be inspected and adapted from, but must not be called or depended on at runtime.
6. Define the target frontend requirement precisely: `apps/web` must use shadcn/ui primitives and Vercel AI Elements / AI SDK React where applicable, while preserving the behavior and information architecture of legacy Chattr instead of flattening it into generic cards/forms.
7. Define the target live-state requirement precisely: chat, roster, transcript, Board, rules, jobs, locked records, and pins must consume one shared live room model rather than separate one-off REST snapshots.
8. Define the target security requirement precisely: browser session-token delivery must be same-origin or explicitly constrained by an approved local runtime design; unauthenticated token exposure through `/api/session` is rejected.
9. Define the target verification requirement precisely: the task cannot be considered complete until code-level checks and MCP Router Playwright prove `http://127.0.0.1:8800/workbench` is the live, non-mock, standalone kai-chattr workbench.

## Inherited Inputs

This takeover investigation inherited and verified these inputs:

1. User correction: I caused the current Board/workbench implementation failures and must not frame them as anonymous inherited defects.
2. User closure requirement: the report must start with the full path of every `E:\chattr` runtime file opened and read from line 1 to EOF.
3. User runtime requirement: `E:\chattr` is source material only; `E:\kai-chattr` must contain all files needed to run the system without relying on the old repo.
4. User target requirement: `http://127.0.0.1:8800/workbench` is the workbench acceptance surface.
5. Repo contract: `E:\kai-chattr\AGENTS.md` and `governance\contracts\frontend.json` require shadcn/ui source primitives and Vercel AI Elements / AI SDK React for workbench UI surfaces; legacy static UI is behavior reference only.
6. Existing implementation state: modified `apps/web`, `services/api`, and docs files currently exist in the working tree.
7. Existing rejected plan: `E:\kai-chattr\docs\plans\manual-multi-agent-chat-bridge-implementation-plan.md`.
8. Existing plan audit: `E:\kai-chattr\docs\plans\manual-multi-agent-chat-bridge-plan-audit.md`.
9. Legacy source runtime: the 60 `E:\chattr` files listed at the top of this report.

## Legacy Runtime Shape Confirmed

Legacy Chattr is a same-origin FastAPI runtime, not a detached browser shell:

- `E:\chattr\run.py` generates the in-memory session token, serves static HTML, injects `window.__SESSION_TOKEN__`, mounts `/workbench`, and runs the web/API/WS server.
- `E:\chattr\app.py` owns security middleware, store initialization, REST APIs, WebSocket hydration, live broadcasts, and right-rail state mutation.
- `E:\chattr\mcp_bridge.py` exposes right-rail MCP tools: `chat_rules`, `chat_jobs`, `chat_pins`, and `chat_locked`.
- `E:\chattr\static\index.html` loads the runtime browser modules and styles for chat, right panel, rules, jobs, locked, sessions, channels, settings, agents roster, and workspace splitters.
- `E:\chattr\static\chat.js` reads the injected session token, opens the same-origin WebSocket, and emits each WS event through `Hub`.
- `E:\chattr\static\right-panel.js`, `rules-panel.js`, `jobs.js`, and `locked-panel.js` implement the legacy Board-equivalent right rail behavior.

## Legacy Evidence

Token and same-origin runtime:

- `E:\chattr\run.py:58` creates a random in-memory session token.
- `E:\chattr\run.py:127`, `E:\chattr\run.py:139`, and `E:\chattr\run.py:158` inject `window.__SESSION_TOKEN__` into served HTML.
- `E:\chattr\run.py:143` through `E:\chattr\run.py:158` serves `/workbench`.
- `E:\chattr\app.py:1154` defines the WebSocket endpoint at `/ws`.
- `E:\chattr\app.py:1156` validates the session token on WebSocket connect.

Live Board/right-rail state:

- `E:\chattr\app.py:707` and `E:\chattr\app.py:711` broadcast rule changes.
- `E:\chattr\app.py:721` and `E:\chattr\app.py:725` broadcast todo/pin updates.
- `E:\chattr\app.py:735` and `E:\chattr\app.py:739` broadcast job changes.
- `E:\chattr\app.py:749` and `E:\chattr\app.py:753` broadcast locked-record changes.
- `E:\chattr\app.py:1194` sends initial `locked_items` over the WebSocket.
- `E:\chattr\app.py:1413` and `E:\chattr\app.py:2333` broadcast `rules_remind`.

Right-rail APIs and MCP:

- `E:\chattr\app.py:1857` defines right-rail capabilities.
- `E:\chattr\app.py:1842`, `E:\chattr\app.py:2082`, `E:\chattr\app.py:2245`, `E:\chattr\app.py:2251`, `E:\chattr\app.py:2316`, and `E:\chattr\app.py:2330` define key right-rail REST surfaces.
- `E:\chattr\mcp_bridge.py:24`, `E:\chattr\mcp_bridge.py:26`, and `E:\chattr\mcp_bridge.py:27` hold the rules/jobs/locked runtime bindings.
- `E:\chattr\mcp_bridge.py:785`, `E:\chattr\mcp_bridge.py:887`, `E:\chattr\mcp_bridge.py:1067`, and `E:\chattr\mcp_bridge.py:1129` define `chat_rules`, `chat_jobs`, `chat_pins`, and `chat_locked`.

Browser modules:

- `E:\chattr\static\index.html:33` through `E:\chattr\static\index.html:41` load runtime stylesheets, including `design-system.css`, `style.css`, sessions/jobs/right-panel/agents styles, `idt-theme.css`, and `mocks/components.css`.
- `E:\chattr\static\index.html:407` through `E:\chattr\static\index.html:418` load runtime scripts.
- `E:\chattr\static\chat.js:5` reads `window.__SESSION_TOKEN__`.
- `E:\chattr\static\chat.js:577` opens the WebSocket.
- `E:\chattr\static\chat.js:598` emits WS events through `Hub`.
- `E:\chattr\static\right-panel.js:9` defines the four right-panel tabs: rules, jobs, locked, pins.
- `E:\chattr\static\right-panel.js:130` falls back to default tabs when capability loading yields no usable tabs.
- `E:\chattr\static\rules-panel.js:84` defines the remind-agents action.
- `E:\chattr\static\rules-panel.js:87` posts to `/api/rules/remind`.
- `E:\chattr\static\jobs.js:2076` consumes the live `jobs` event.
- `E:\chattr\static\locked-panel.js:234` consumes `locked_items`.
- `E:\chattr\static\chat.js:3024` scrolls to a message.
- `E:\chattr\static\chat.js:3312` through `E:\chattr\static\chat.js:3355` render pins and jump to the pinned message.

## Current Kai-Chattr Defects

### Critical: 8800 Is Still A Shell Proxying To 8300

`E:\kai-chattr\apps\web\vite.config.ts:23` sets Vite to 8800, but `E:\kai-chattr\apps\web\vite.config.ts:25` through `E:\kai-chattr\apps\web\vite.config.ts:31` proxy `/api`, `/uploads`, and `/ws` to 8300.

This is not standalone `E:\kai-chattr`. It is a browser shell pointed at another port. Whether that 8300 process is old `E:\chattr` or copied `services/api`, the current implementation failed the user's runtime boundary: the required runtime files must be inside `E:\kai-chattr` and the acceptance target is `8800/workbench`.

### Critical/Security: I Introduced An Unsafe Session Token Endpoint

`E:\kai-chattr\apps\web\src\lib\chattr-api.ts:54` fetches `/api/session`. `E:\kai-chattr\services\api\app\main.py:319` explicitly exempts `/api/session` from auth. `E:\kai-chattr\services\api\app\routes\status.py:17` registers it. `E:\kai-chattr\services\api\tests\test_mcp_right_rail_tools.py:259` asserts unauthenticated access returns the raw token.

This is not behavior parity with legacy Chattr. Legacy injects the token into same-origin HTML and validates it on APIs/WS. The current endpoint is a workaround I introduced or preserved, and it must be removed or constrained under a correct same-origin local runtime model.

### Critical: Board State Is REST Snapshot, Not Live Runtime State

`E:\kai-chattr\apps\web\src\components\workbench\BoardDock.tsx:556` loads Board state through REST. `BoardDock.tsx:586` loads it on mount. `BoardDock.tsx:601` reloads after its own saves.

Legacy Chattr updates right-rail state from WebSocket events and store-change broadcasts. Current Board will go stale when agents, wrappers, MCP tools, or another client mutate rules/jobs/locked/pins.

### Significant: Workbench Still Contains Mock Transcript State

`E:\kai-chattr\apps\web\src\routes\workbench.tsx:4` says it is mock data. `workbench.tsx:141` defines `initialMessages`. `workbench.tsx:1029` initializes chat state from those mocks. `workbench.tsx:1068` resets to them.

This is why stale transcript text appeared in visual checks. It is not a live workbench.

### Significant: Board Behavior Is Not Legacy-Parity

`E:\kai-chattr\apps\web\src\components\workbench\BoardDock.tsx:707` deletes jobs permanently. Legacy only permanently deletes archived jobs through a narrower delete path and confirmation/trash behavior.

`BoardDock.tsx:501` and `BoardDock.tsx:1275` make pins a manual message-ID form. Legacy pins are message-row actions and clicking a pin jumps to the message.

`E:\kai-chattr\services\api\app\routes\rules.py:19` registers `/api/rules/remind`, but BoardDock does not expose a Remind action.

`BoardDock.tsx:921` displays `Board API error`, which is a symptom of incomplete runtime wiring rather than an acceptable user-facing degraded state.

### Significant: The Existing Bridge Plan Is Architecturally Wrong

`E:\kai-chattr\docs\plans\manual-multi-agent-chat-bridge-implementation-plan.md:3` says 8800 runs against backend on 8300. Line 5 makes `services/api` the backend/API/WebSocket/runtime authority. Lines 83 through 114 add a session bootstrap endpoint for that split.

The plan audit rejects that topology: `E:\kai-chattr\docs\plans\manual-multi-agent-chat-bridge-plan-audit.md:15` locks `8800/workbench` as the runtime target, and line 17 states 8300 must not be the working page, backend authority, runtime target, or implementation anchor for the clean repo plan.

## Plan Drift Findings

1. Runtime boundary drift: the current Vite config still makes 8800 a browser shell that proxies API and WebSocket traffic to 8300.
2. System-of-record drift: the existing bridge plan treats `services/api` on 8300 as runtime authority even though the clean target must be `E:\kai-chattr` with 8800 as the acceptance surface.
3. Security drift: the current `/api/session` endpoint exposes the raw browser session token unauthenticated and is tested as valid behavior.
4. Live-state drift: legacy right-rail state updates through WS/Hub/store broadcasts, but current Board owns isolated REST snapshot state.
5. Frontend behavior drift: `workbench.tsx` still initializes the operational transcript from mock messages.
6. Board parity drift: jobs, pins, rules Remind behavior, capability fallback, and degraded-state handling do not preserve the legacy behavior contract.
7. Migration-boundary drift: legacy `E:\chattr\static` behavior is source material, but its behavior has not been fully classified as port/adapt/drop before implementation.
8. Acceptance drift: existing plan acceptance proves an 8800 page can talk to 8300, not that kai-chattr owns the complete runtime without depending on old-repo assumptions.

## Trust Matrix

| Claim | Classification | Result |
|---|---|---|
| Legacy `E:\chattr` uses same-origin token injection instead of unauthenticated browser token fetch | Verified | Keep as source behavior |
| Legacy right rail is live via WS/Hub/store broadcasts | Verified | Must be migrated as behavior |
| Legacy static UI should be copied into `apps/web` | Contradicted | Behavior reference only; compose shadcn/ui and Vercel AI Elements |
| Current `apps/web` on 8800 is standalone | Contradicted | It proxies API/WS to 8300 |
| Current Board is live-state parity | Contradicted | It is REST snapshot plus reload |
| Current `/api/session` is acceptable | Contradicted | It exposes the token unauthenticated |
| Existing bridge plan can be patched | Contradicted | Runtime premise is wrong throughout |
| Backend files were partly migrated into `services/api` | Verified | Some stores/bridge pieces are present, but target runtime wiring is not resolved |
| Frontend live room client was migrated | Contradicted | No Chattr WS room consumer exists in `apps/web/src` |

## Salvage Or Rewrite Decision

Decision: rewrite the implementation plan; salvage only verified code slices.

What can be salvaged:

- Backend stores that match or closely match legacy stores.
- MCP bridge/tool categories after import-closure verification.
- Route registration modules where they preserve the legacy contract.
- UI component foundation already present in `apps/web` if it remains shadcn/ui and Vercel AI Elements based.

What must not be salvaged:

- The 8300-centered runtime plan.
- The `/api/session` unauthenticated token bootstrap.
- REST-only Board state as the final model.
- Mock transcript state.
- Any assumption that `E:\chattr\static` can be copied as visual implementation.

## Required Recovery Architecture

The next implementation plan must begin with these locked decisions:

1. `E:\chattr` is source material only.
2. `E:\kai-chattr` must contain every runtime file needed for Board/workbench operation.
3. The acceptance surface is `http://127.0.0.1:8800/workbench`.
4. No runtime dependency may point back to the old `E:\chattr` repo.
5. No plan may treat the current 8300 proxy as approved target architecture.
6. Token delivery must be same-origin or otherwise constrained by an explicitly approved local runtime design; `/api/session` unauthenticated token access is rejected.
7. Board must consume the same live room state model as chat/transcript, not a separate REST snapshot.
8. Board UI must use shadcn/ui primitives and Vercel AI Elements where applicable, while preserving legacy behavior.

## Required Import-Closure Work

Before implementation, create a source-to-target closure matrix with these columns:

| Legacy file | Runtime role | Target file | Verdict |
|---|---|---|---|
| `E:\chattr\app.py` | FastAPI/WS/API/store bridge | `E:\kai-chattr\services\api\app\main.py` plus route/store modules | port/adapt |
| `E:\chattr\run.py` | process entry, static serving, token injection | `E:\kai-chattr\services\api\app\cli.py` or replacement 8800 runtime entry | rewrite |
| `E:\chattr\static\chat.js` | WS client, Hub event source, transcript/pins behavior | new React live-room hook/store | port behavior, not UI |
| `E:\chattr\static\right-panel.js` | right rail tabs/capability fallback | Board shell state and tab model | port behavior |
| `E:\chattr\static\rules-panel.js` | rules lanes, remind, drag/drop | Board rules view | port behavior |
| `E:\chattr\static\jobs.js` | jobs lanes/conversation/delete semantics | Board jobs view | port behavior |
| `E:\chattr\static\locked-panel.js` | locked records live view | Board locked view | port behavior |
| `E:\chattr\mcp_bridge.py` | MCP right-rail tools | `services/api/app/mcp/bridge.py` | verify/adapt |
| `E:\chattr\rules.py`, `jobs.py`, `server\locked.py`, `store.py` | persistence | `services/api/app/stores/*` | verify/adapt |

## Required Implementation Sequence

1. Replace the rejected bridge plan with a new plan whose first locked decision is `8800/workbench` as the acceptance target and `E:\kai-chattr` as the only runtime owner.
2. Decide and encode the 8800 runtime topology before code changes: either the same-repo backend serves the built workbench at 8800, or a same-repo dev composition exposes API/WS under 8800 without treating 8300 as authority.
3. Remove the `/api/session` unauthenticated token bootstrap from frontend usage and tests.
4. Build a React live-room client/store that consumes the legacy WS event contract: settings, agents, base colors, todos, rules, jobs, locked_items, schedules, message/history events, status, rule/job/locked deltas, todo_update, and rules_remind.
5. Make the transcript, roster, and Board use that shared live store.
6. Rebuild Board behavior in shadcn/ui/Vercel-composed React views: rules, jobs, locked, pins; active/draft/archive lanes; drag/drop semantics; Remind; pin from message rows; pin click jumps to message.
7. Remove mock `initialMessages` from the operational workbench path.
8. Verify with backend tests, frontend build/contracts, and MCP Router Playwright against `http://127.0.0.1:8800/workbench`.

## Code Review Verdict

Request changes. The current implementation is not acceptable to build on directly. It contains a security defect, a runtime-boundary defect, stale-state behavior, mock operational content, and incomplete Board parity.

## Completion Criteria For The Next Task

The recovery work is not complete until all of these are true:

1. This report remains in `E:\kai-chattr\docs`.
2. A replacement implementation plan exists and rejects the 8300-centered topology.
3. The source-to-target closure matrix is present and covers every runtime file above.
4. `apps/web` no longer uses unauthenticated `/api/session`.
5. `BoardDock` no longer owns isolated REST-snapshot state as the final live model.
6. `workbench.tsx` no longer ships mock transcript content in the operational route.
7. MCP Router Playwright verifies the actual 8800 workbench, not just HTTP status or build success.
