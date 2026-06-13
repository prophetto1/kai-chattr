# Changelog

Repo-root changelog (decision 2026-06-11: lives here, not in the Planned store). Append an entry per codebase change, newest first.

## 2026-06-13

### feat(web): design-system token upgrade, graphite theme, compact approval card
- Applied the Phase 1 design-system token layer: full rewrite of `apps/web/src/styles/design-tokens.css` and `shadcn-tokens.css` — new surface ladder (`--surface-base/-sunken/-raised/-overlay/-hover/-highlight`), ink ramp (`--ink-1..4`), `--divider`, elevation (`--elevation-1..3`), the `--ui-text-*` type ramp, and `--space-*`/`--radius-control/card/pill` scales. All legacy token names are preserved and rerouted through the new ramp for a free contrast bump. Registered the matching Tailwind utilities (`bg-surface-*`, `text-ink-*`, `border-divider`, `rounded-control/card/pill`, `shadow-e1..3/highlight/focus`, `text-ui-*`).
- Added the selectable `.graphite` theme (true achromatic gray, chroma 0) to the served theme catalog: `services/api/app/schemas/workbench_settings.schema.json` (`selected_theme` enum + `x-options`), its `workbench_settings.py` fallback mirror, and `apps/web/src/components/theme/AppThemeProvider.tsx` `FALLBACK_THEMES`. It surfaces via `GET /api/themes` (items[4]) and the Appearance switcher applies `.dark .graphite`. Updated `test_theme_settings_api.py` to assert graphite at `items[4]`.
- Redesigned `ChatApprovalCard` into a compact "primary + collapse" inline card (single Approve action; alt keystrokes 2/y/Enter + free-text in a popover; terminal snapshot behind an eye icon), neutral semantic surfaces with a warning dot only while pending and a success check when resolved, action row always rendered but disabled when not actionable. Refactored onto the new role utilities (`rounded-card/control`, `bg-surface-raised/sunken`, `text-ui-sm/2xs`, `text-ink-1/3`, `border-divider`), replacing inline magic numbers and raw amber/emerald/zinc.
- Note: the dev API caches the theme schema at import and runs without `--reload`, so the running stack was restarted to serve the new catalog; live `GET /api/themes` returns 5 themes including `graphite`.
- Tests: `pnpm --dir apps/web run build` (exit 0, vite); `uv run pytest -q tests/test_theme_settings_api.py` (6 passed).

### fix(web): recover stale auth sessions and align workbench runtime shell
- `apps/web/src/lib/chattr-api.ts` now clears stale browser session material after a protected request returns 401, remints the local owner session through `POST /auth/local-session`, and retries the request once with the fresh `kcs_` bearer. This prevents `/home` from getting stuck on `Home API error: unauthorized: a valid auth session is required` after a local DB/session reset.
- The 401 retry path now reuses an already-refreshed token across concurrent Home API requests, so one request cannot clear the fresh token bootstrapped by another request during the same load.
- Added `/auth/*` Vite and Cloudflare Pages Function proxy coverage, updated `runtime:probe` to mint a local `kcs_` session and use bearer auth, and locked the proxy/auth behavior in the runtime contract test.
- Added `pnpm run neon:dev:runtime` as the SOPS-backed local runtime entrypoint for Neon dev data.
- Reworked the workbench lower Terminal dock into tabbed interactive PTY sessions, with terminal focus/fit behavior for active tabs, and moved Observability from the compact rail utility area into the account menu.
- Added Playwright regressions for stale Home session reminting and the workbench runtime shell behavior.
- Tests: `pnpm run check:contracts`; `pnpm run check:deps`; `pnpm run runtime:probe`; `pnpm run test:runtime-contract`; `pnpm --dir apps/web run build`; `pnpm exec playwright test tests/e2e/home-start.spec.ts`; `pnpm exec playwright test tests/e2e/workbench-runtime.spec.ts`; `git diff --check`.

## 2026-06-11

### fix(dev): map Neon SOPS env into the dev orchestrator
- `scripts/dev/start-kai-chattr.mjs` now maps `NEON_DEV_DATABASE_URL` into `KAI_CHATTR_DATABASE_URL` and forces `KAI_CHATTR_DATABASE_MODE=postgres` when a database URL is present. This lets `sops exec-env secrets/dev/neon.yaml 'pnpm run dev'` start the full web/API stack with the current Neon-backed identity/home schema instead of silently falling back to file mode.
- Restarted the local stack on `8800/8840/8841/8842`. Verification: `GET /healthz` returned `database_mode:"postgres"` and the `/home` browser probe reported no `Home API error` and no failed responses; `pnpm exec playwright test tests/e2e/home-start.spec.ts` passed 3 tests.

### feat(web): functional login/signup forms (kai-ai donor, rewired to /auth/*) — commit 4d3d781
- Lifted the kai-ai auth page shape and rebuilt it on kai-chattr's stack (shadcn + react-router v7; dropped ark-ui/tabler/Supabase). `lib/auth-api.ts` wires real `POST /auth/{login,signup,logout}` + stores the `kcs_` bearer token + `oauthStartUrl`; `components/auth/{oauth-buttons,auth-shell}.tsx`; `/login` (uniform-401 copy, `?redirect=` support), `/signup` (match/min-8 guard, 409→already-registered, success→/home); `/register` stays redirect-only. Build green. Decision: **kai-ai = FE donor; Better Auth (blockdata) = deferred backend-architecture fork, not adopted.**

### chore(dev): dev Neon now carries migrations (policy change)
- Stopped the round-trip-and-restore pattern; applied `0005`+`0006` and **left dev Neon at `20260611_0006 (head)`** so id/URL-law verification can run against real data.

### feat(api): Plan 1.5 T5 — OAuth sign-in (Google + GitHub) with the S1 link rule
- `GET /auth/oauth/{provider}` + `/callback`: returning provider credential → login (keyed on the provider's immutable account id, never mutable email); **IdP-verified email matching an existing user → links** (never a second account); **unverified + existing → 409 login-then-link** (blocks unverified-email account takeover); verified + unknown → OAuth signup (user + personal workspace + session); unverified + unknown → 403.
- State = server-side single-use hashed attempt rows (`auth_oauth_attempts`, shape borrowed lean from writing-system) with expiry; replay → 400. Google uses PKCE.
- Declared schema delta: migration `0006` adds `auth_credentials.provider_account_id` (+ unique per provider) and `auth_oauth_attempts`. Round-trip-verified on dev Neon (up `0004→0006`, check clean for identity/oauth, down restored to `0004`).
- Providers load from SOPS-decrypted env (`KAI_CHATTR_OAUTH_{GOOGLE,GITHUB}_CLIENT_ID/_SECRET`); unconfigured → 503, no stub. `httpx` added for the live exchange. Live round-trip pending creds in `secrets/dev/`.
- Tests: 8 new (`tests/test_oauth_s1.py`, fake-IdP boundary only — real attempt/S1/store paths); suite 244 pass / 1 pre-existing zellij failure.

### feat(web): scoped workspace route placeholders for route-law compliance
- Added workspace route patterns/helpers for `/w/{workspace_public_id}/repositories`, `/w/{workspace_public_id}/settings/workspace/{section}`, and `/w/{workspace_public_id}/sessions/{session_hash}` in `apps/web/src/lib/app-routes.ts`.
- Mounted designer-ready AppShell placeholders for workspace repositories and workspace settings in `apps/web/src/main.tsx` and `apps/web/src/routes/workspace-placeholders.tsx`.
- Existing `/workbench` and global product routes remain transitional/helper surfaces; the canonical session mount remains `/w/{workspace_public_id}/sessions/{session_hash}`.
- Tests: `pnpm --dir apps/web run build`; `pnpm exec playwright test tests/e2e/scoped-routing.spec.ts` (3 passed); `pnpm exec playwright test tests/e2e/home-start.spec.ts` (3 passed); `pnpm run check:contracts`.

### feat(home-start): cloud-first Open Repository flow
- Added provider-aware `/api/git/repositories/search` and `/api/git/branches/search` aliases and classified them as `home-start`.
- Made the cloud repository list provider-filtered, removed local repository discovery from the cloud Open Repository flow, and updated `/home` to choose Git provider before repository/branch selection.
- Scratch session creation and the Design Agent card wiring remain intact; local folder opening stays separated for the future local bridge path.
- Tests: `uv run pytest -q tests/test_home_start_api.py`; `uv run pytest -q tests/test_home_start_api.py tests/test_observability_contract.py` (17 passed); `pnpm exec playwright test tests/e2e/home-start.spec.ts` (3 passed); `pnpm --dir apps/web run build`; `pnpm run check:contracts`.

### feat(api): Plan 1.5 T6 — /api/user/account + workspace invitations
- `GET /api/user/account`: answers from the validated session only; any client-supplied user id is ignored by construction (acceptance 5).
- `POST /w/{workspace_public_id}/invitations`: first real consumer of the frozen tenancy seam (`resolve_workspace_context`) — non-member → 404 (seam, fail-closed), member-but-not-admin → 403, duplicate → 409 (DB constraint), unknown email → 404, `role: owner` → 422 (ownership never granted by invite). v1 invites existing accounts into the workspace; token-based email invitations for unregistered users = later slice.
- Store: `find_user_by_email` lookup. Middleware passes `/api/user/*` + `/w/*` (route layer owns authn); endpoint contracts registered for both.
- Tests: 7 new (`tests/test_account_invitations.py`); full suite 236 pass / 1 pre-existing zellij failure.

### feat(web): public auth routes aligned with the locked route law (commit 6bebbbb)
- `/register` → `/signup` per `governance/plans/kai-chattr-scope-based-routing-foundation.md` (public auth = `/login` + `/signup`); `/register` kept as a redirect alias only.
- `APP_ROUTES` gains `login`/`signup`; `main.tsx` registers via constants.
- Login/Signup pages remain designer-ready placeholders but now document their live wiring contracts (`POST /auth/login`, `POST /auth/signup`). Build green.

### feat(api): Plan 1.5 T4 — signup/login/logout routes
- `app/routes/auth.py`: `POST /auth/signup` (S1: duplicate email → 409 via the DB constraint; argon2 hash; auto-creates the personal workspace + owner membership; issues a session), `POST /auth/login` (uniform 401 — no account enumeration), `POST /auth/logout` (revokes the bearer session).
- `app/stores/factory.py`: `create_identity_store` (postgres-only; file mode → None and `/auth/*` answers 503 — no stub fallback). Wired in `main.py` as `app.state.identity_store` + router include.
- `app/security.py`: `/auth/*` passes the legacy x-session-token middleware; authn happens at the route layer.
- `app/endpoint_contract.py`: new `user-bearer` auth + `identity` surface literals; `/auth/*` policies registered.
- `app/stores/identity_db.py`: `find_password_credential` lookup.
- Tests: 6 new (`tests/test_auth_routes.py`); full suite 230 pass / 1 pre-existing zellij env failure.

### feat(api): Plan 1.5 batch 1 — argon2 passwords, revocable sessions, tenancy seam (commit 46eee28)
- New `app/auth/` package: `passwords.py` (argon2), `tokens.py` (opaque `kcs_` tokens, SHA-256 at rest), `deps.py` (`current_session`), `tenancy.py` (frozen seam: `WorkspaceContext` + `resolve_workspace_context`, resolve→authorize→translate, non-member = 404 fail-closed, `workspace_scoped` helper).
- Identity store: `issue/validate/revoke_session` + tenancy lookups. 9 new tests.


# Merged: changelog-kai-chattr.md

# Changelog

Project: kai-chattr

## Update Rule

Every time work changes the kai-chattr codebase, find and update this changelog before the task is considered complete.

A codebase change includes source code edits, migrations, configuration changes, dependency changes, scripts, tests, docs that affect implementation behavior, or store/API/data changes tied to this project.

## Entries

### 2026-06-11

- Created this changelog in Planned/kai-chattr.
- Established the rule that future kai-chattr changes must update this file.
### 2026-06-11

- Changed: Added endpoint contract metadata for Kai Chattr runtime routes, exposed route auth/proxy/surface data through Observability, added Cloudflare Pages Function proxy coverage for docs/openapi/redoc/uploads, tightened `/api/roles` access, and recorded the scope-based routing foundation plan.
- Verification: `pnpm check:contracts`; `pnpm check:deps`; `pnpm test:runtime-contract`; `uv run pytest -q tests/test_observability_contract.py tests/test_runtime_contract.py`; `pnpm web:build`.

### 2026-06-11

- Changed: Recorded the SIM-port tenancy and contract decision (structural path-scoped tenancy, resource-derived flat routes, 404 mismatch rule, contract ratchet fields, agent/runtime scope tier) as `planned/kai-chattr/kai-chattr-sim-port-tenancy-contract-decision.md`. Governance decision doc; no source code changed yet.
- Verification: GET of the new node returns MDX-clean content (no HTML comments); node present in planned/kai-chattr tree.


### 2026-06-11

- Changed: Drafted the multitenant data-plane foundation implementation plan (7 identity/tenancy/session tables, 3 Alembic migrations, Base relocation, Neon wiring, repository primitives; HTTP auth API deferred to Plan 2) as `planned/kai-chattr/kai-chattr-data-plane-foundation-implementation-plan.md`. Planning doc; no source code changed.
- Verification: created via POST (200); readback MDX-clean; passes in-plan Validity Gate.

### 2026-06-11

- Changed: Added `E:\kai-chattr\docs\0610-library (file stores, kbs)\stores-as-kb-foundation-recommendation.md`, documenting the recommendation that Stores remain the system of record for files/revisions/objects while the knowledge base is a derived indexing/search layer over Store content.
- Verification: Local file readback confirmed; Planned changelog updated through `PUT /stores/planned/nodes/{node_id}/content`.

### 2026-06-11

- Changed: Drafted the local-bridge / typed-HTTP runtime spec (loopback-only `/local/*` typed-Pydantic surface, opaque-id + cloud-visibility identity contract, agent dual-home + pairing, persistence split) extending the JWC local-managed-stores contract package, as `planned/kai-chattr/kai-chattr-local-bridge-typed-http-spec.md`. Design spec; no source code changed.
- Verification: created via POST (200); readback MDX-clean; cross-refs the 2 JWC baseline docs + tenancy decision + data-plane plan.


### 2026-06-11

- Changed: Local-bridge / typed-HTTP spec rev 2 - configured agent slot port range (example `9501-9520`, internal binding), per-identity on-disk home (soul.md/heartbeat.md + cross-session memory.db, path-isolated), agent lifecycle (structured-form create, sequential allocation, call-into-chat exposes home to the agent runtime), and the UI/cloud-vs-agent-runtime access boundary. `planned/kai-chattr/kai-chattr-local-bridge-typed-http-spec.md`. Design spec; no source code changed.
- Verification: PUT (200); readback MDX-clean; contains lifecycle + 9501 range + home layout.


### 2026-06-11

- Changed: Local-bridge spec rev 3 - model/provider is a swappable attribute (chosen on the creation form; changeable later), and a model swap changes only the launch script while the identity home (soul/heartbeat + memory.db) and its paths stay constant so the new model inherits all context; clarified port (e.g. 9501) is internal vs user-facing agent name/role. `planned/kai-chattr/kai-chattr-local-bridge-typed-http-spec.md`.
- Verification: PUT (200); readback contains the swap-model rule.


### 2026-06-11

- Changed: LOCKED agent identity / memory / terminal decisions. Filed canonical record `planned/kai-chattr/kai-chattr-agent-identity-memory-terminal-locked-decisions.md`. Collective memory = pluggable CollectiveMemoryProvider, workspace-scoped, default Postgres+pgvector, alternates Hindsight/Zep/Mem0/HelixDB. Terminal = wterm (xterm replacement; backend owns PTY), Zellij disabled-by-default fallback. Updated local-bridge spec (Zellij->wterm).
- Verification: POST/PUT 200; readbacks MDX-clean. Next: fix docs/schema/agent-surfaces-spec.json + draft Plan 1b.

### 2026-06-11

- Changed: Migrated `/home` to the shared AppShell + Sheet layout (`apps/web/src/routes/home.tsx`); moved Recent Conversations into the rail's collapsible "Recent" menu and Suggested Tasks into a new "Tasks" rail menu between Projects and Recent (new `recentEntries`/`taskEntries` props on `WorkbenchCompactRail`, forwarded through `KaiAppRail`).
- Verification: `pnpm exec tsc --noEmit` (no errors in touched files); `pnpm run build` passed; Playwright on `http://localhost:8800/home` confirmed AppShell layout, Tasks menu between Projects and Recent, Recent menu listing 3 conversations, 0 console errors.


### 2026-06-11

- Changed: Corrected `docs/schema/agent-surfaces-spec.json` (kai-chattr repo) per the lock - collective memory HelixDB -> pluggable CollectiveMemoryProvider (default pgvector; alternates Hindsight/Zep/Mem0/HelixDB; workspace-scoped), added `lockedCorrections` block (workspace routing, terminal = wterm with Zellij fallback).
- Verification: json.load parses; collective.provider set; HelixDB-as-product removed.


### 2026-06-11

- Changed: Filed the Agent Builder WORK ORDER `planned/kai-chattr/kai-chattr-WORKORDER-agent-builder.md` for the other agent (lane, owned paths, build scope, non-negotiable locks, FE/BE seam, do-not-touch list, references, reporting).
- Verification: POST 200; readback MDX-clean.


### 2026-06-11

- Changed: PM surgical finalization of v4 schema `docs/schema/analysis3-schema.json` - added hard invariants (collective workspace-partition isolation, budget run-time guard->suspended, two-person rule for prod admin-access, collective-delete policy), MemoryPolicy.collective_contribution_on_delete + partitionRule, reserved `agentHomeMigration` contract, EngineDefinition.catalogOwnership; resolved 2 openItems. Fixed artifact naming in the locked-decisions doc (identity.md/loadout.json/agent.db -> soul.md/heartbeat.md/memory.db).
- Verification: json.load parses; new entities/invariants present; locked-doc residual identity.md/agent.db removed.


### 2026-06-11

- Changed: Drafted `planned/kai-chattr/kai-chattr-plan-1b-agent-identity-implementation-plan.md` (Slice 2, backend) - agents/agent_versions/runtime_bindings/runtime_slots/admin_access/workspace_memory_providers tables, 3 migrations, repository w/ transactional slot allocation, /w/{workspace_public_id}/agents API; FE deferred to Agent Builder lane; depends on Plan 1 + contract registry. Answers v4 evaluationPrompts.
- Verification: POST 200; readback MDX-clean; contains tables + tasks + validity gate.

### 2026-06-11

- Changed: Saved the kai-chattr backend open-decision priority triage as `kai-chattr/kai-chattr-backend-open-decision-priority-triage.md` in the Planned store.
- Verification: Read back `docs-node-309a36f86ac44f07b2f7cd70050e0407` and confirmed exact content match with no mojibake.


### 2026-06-11

- Changed: Mode-1 audit-revision pass (locks S1 global-email/verified-link, S5 workspaces.tier text default free/'production' gate, B2 identity-owned home). Rewrote Plan 1 template-adapted (full-stack-ai-agent-template substrate + delta table); added Plan 1.5 (auth/session + the resolve->authorize->translate tenancy dependency + jwc-promotion compat declaration); Plan 1b corrected (B1 no port/home in Neon, B4 reservation-not-allocation + slot pool->Slice3, S4 join table, M1); bridge spec + locked-decisions B2; 05 draft re-home note.
- Verification: PUT/POST 200s; readbacks MDX-clean. Next: re-evaluation, then Plan 1 implementation.

### 2026-06-11

- Changed: Added the agent-builder frontend prototype against the locked v4 schema (fixture-backed until Plan 1b): contract types `apps/web/src/lib/agent-system-contract.ts` (FE projection of docs/schema/final-schema-v4.json), declared fixtures `agent-fixtures.ts` (4 agents + 6-engine catalog), shared bits `components/agents/agent-bits.tsx`, and three surfaces �?? `/agents` roster (entity tiles, lifecycle filter, engine/home chips), `/agents/{agent_public_id}` console (10 v4 tabs: Overview/Identity/Model/Runtime real, 4 stubbed with slice notes; right properties rail), `/agents/new` thin 5-step wizard (Intent/Identity/Home/Model & Trust/Review + provisioning rail). Routes replaced the ProductSectionPage placeholders in `main.tsx`.
- Verification: `pnpm exec tsc --noEmit` zero errors in new files (4 pre-existing repo errors unchanged); `pnpm run build` passed; Playwright on :8800 confirmed all three surfaces render with 0 console errors on fresh loads.

### 2026-06-11

- Changed: Pushed Kai scoped app shell and identity foundation commit `e99b6eb` to `origin/main`: app rail/agent routes, scope route helpers, product routes, home-start URL update, shared SQLAlchemy `Base`, identity/workspace/chat SQLAlchemy store, Alembic revision `20260611_0005`, and identity foundation tests.
- Verification: `pnpm run check:contracts`; `pnpm run check:deps`; `pnpm web:build`; `uv run pytest -q tests/test_home_start_api.py tests/test_identity_foundation_db.py`; `uv run ruff check app/stores/identity_db.py app/stores/rules_db.py migrations/versions/20260611_0005_create_identity_foundation.py tests/test_identity_foundation_db.py`; `uv run python -m compileall app -q`; `git diff --cached --check`; cached secret-pattern scan; `git push origin main`.
### 2026-06-11

- Changed: Rendered active fixture-backed agents as nested items under the My Agents rail group, with a Command Center row and per-agent accent markers. The selected agent is derived from the current `/agents/{agent_public_id}` route without touching the agent detail page.
- Files: `apps/web/src/components/layout/KaiAppRail.tsx`, `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`.
- Verification: `pnpm --dir apps/web run build` passed; `git diff --check` reported no whitespace errors.

### 2026-06-11

- Changed: Synced the agent-builder frontend to the PM's schema update �?? `final-schema-v4.json` is canonical (`analysis3-schema.json` retired to a tombstone pointer); new reserved entity `agentHomeMigration` (v1.5). FE tweaks: `AgentLifecycleState` gains `deleted` (+ badge label/styling), reserved `AgentHomeMigrationStatus` type added to `agent-system-contract.ts`, disabled "Migrate home · v1.5 reserved" action added to the console Runtime tab. No breaking schema changes �?? tabs, wizard steps, entity fields all unchanged.
- Verification: `pnpm exec tsc --noEmit` zero errors in agent/rail files (including concurrent console TAB_META + rail agentEntries edits); `pnpm run build` passed.

### 2026-06-11

- Changed: Workbench UI polish batch. Replaced the agent console top tabs with a denser icon-led tab bar, added Rules/Decisions/Pinned tabs to the Board dock, removed the My Agents Command Center row in favor of direct navigation plus expandable agent children, moved rail disclosure chevrons to sit immediately after section titles, and tightened workbench transcript density with 13px chat text, tighter line-height, and reduced inter-message spacing.
- Files: `apps/web/src/routes/agent-detail.tsx`, `apps/web/src/components/workbench/BoardDock.tsx`, `apps/web/src/components/layout/KaiAppRail.tsx`, `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`, `apps/web/src/routes/workbench.tsx`.
- Verification: `pnpm web:build` passed; `git diff --check` reported only CRLF normalization warnings; Playwright screenshots captured `C:\Users\jwchu\AppData\Local\Temp\kai-chat-density-desktop.png`, `C:\Users\jwchu\AppData\Local\Temp\kai-side-rail-chevron-desktop.png`, and `C:\Users\jwchu\AppData\Local\Temp\kai-side-rail-chevron-expanded.png`.
### 2026-06-11

- Changed: Fixed Board Rules right-side clipping by constraining the Radix ScrollArea generated viewport child in `BoardDock.tsx` with a shared Board viewport class (`display:block`, `min-width:0`, `width:100%`, `max-width:100%`) so rule rows size to the visible dock width instead of the long truncated title's intrinsic width.
- Files: `apps/web/src/components/workbench/BoardDock.tsx`.
- Verification: `pnpm web:build` passed; `git diff --check` reported only CRLF normalization warnings; Playwright DOM measurements showed the Rules viewport `scrollWidth` dropped from 1141px to 493px at 1440px viewport and to 245px at 900px viewport; screenshot inspected at `C:\Users\jwchu\AppData\Local\Temp\kai-board-rules-overflow-fixed.png`.
### 2026-06-11

- Changed: Moved the Rules create action into the Board tab row as a right-aligned `+ New` button, removed the duplicate in-body create button, and kept the existing create-rule state transition intact.
- Files: `apps/web/src/components/workbench/BoardDock.tsx`.
- Verification: `pnpm web:build` passed; `git diff --check` reported only CRLF normalization warnings; Playwright measured the `New` button at the far-right of the Board header with a 12px right gutter and confirmed clicking it opens the Create rule form; screenshot inspected at `C:\Users\jwchu\AppData\Local\Temp\kai-board-new-rule-tab-row.png`.

### 2026-06-11

- Changed: Reworked the Board dock Decisions tab to mirror Rules (Jon's spec): mode machine (list/create/edit) with header "New" button, thin collapsed cards that expand on press (details + reason + Edit/Delete), Active/Inactive lanes with drag-to-move (archive/restore), and a 3-field form (Decision title / Decision details / Reason). Backend: additive `details` field on locked items (`stores/locked.py` create/edit + `main.py` create_locked/update_locked, max 2000 chars). Frontend: `LockedItem.details`, DecisionForm/DecisionRow in `BoardDock.tsx`, DragRecord extended with decision type.
- Verification: `pnpm exec tsc --noEmit` clean for touched files; `pnpm run build` passed; `uv run pytest tests/test_mcp_right_rail_tools.py tests/test_runtime_contract.py` 21 passed; Playwright on /workbench confirmed lanes, thin-card expand, and the 3-field create form with counters, 0 console errors.
- Note: the running API process must be restarted to serve/persist `details` (additive; old process ignores the field silently).


### 2026-06-11 - Plan 1 gap closure (branch feat/plan1-finish-gaps)

- Changed: closed the two Plan 1 data-plane gaps on a branch off foundation commit `e99b6eb`. **Gap 1** = `migrations/env.py` now takes `Base` from `app.stores.base` and imports `identity_db` + `routing_decisions_db`, so alembic sees every table (fixes the routing_decisions autogenerate-drift latent bug; identity tables visible). **Gap 2 (audit S6)** = `chat_messages` gains a per-session `sequence` column + `UniqueConstraint(chat_session_id, sequence)`; `append_message` assigns the next monotonic sequence; `list_messages` orders by it; migration `0005` + `_message_dict` updated. The stable UUID `id` stays the reference target for pins/jobs/decisions (richer-than-chattr: 'save to job' will attach a real message via a future `job_messages` link). **Guard** = identity store scopes its SQLite `create_all` to identity tables so it cannot materialise board tables that share `Base.metadata`.
- Verification: `test_identity_foundation_db.py` 14/14; full `services/api` suite 213 pass / 1 pre-existing fail (`test_zellij_terminal_backend`, unrelated env). Commit `057241c`.
- Remaining: `alembic check` on the Neon dev branch (T7, needs SOPS creds); board-store-side `create_all` scoping (`rules_db`/`jobs_db`/`home_start_db`) is the parallel hand's lane - coordinate; merge `feat/plan1-finish-gaps` -> `main`.

### 2026-06-11

- Changed: Simplified the Board dock Rules tab to match Decisions: lanes reduced to Active/Inactive (Drafts lane removed; legacy draft rules display under Inactive; nothing destroyed server-side), Inactive relabeled from Archive, expanded rule cards gain a trash delete button next to Edit, rules count badge now counts Active only, and new rules are created as `active` (previously `draft`) for create-flow parity with Decisions.
- Verification: tsc clean for BoardDock; `pnpm --dir apps/web run build` passed; Playwright on /workbench confirmed Active(2)/Inactive(0) lanes, thin-card expand with trash + Edit actions, 0 console errors.
### 2026-06-11

- Changed: Installed the agreed AI Elements source component slice for upcoming agent/chat/runtime surfaces: `artifact`, `chain-of-thought`, `checkpoint`, `commit`, `confirmation`, `context`, `inline-citation`, `mic-selector`, `open-in-chat`, `snippet`, `toolbar`, and `transcription`. Added the required shadcn `popover` source primitive for `mic-selector`, added `tokenlens` and `@xyflow/react` as explicit web dependencies and Architecture allowed deps, and added the Streamdown Tailwind `@source` directive in `styles.css`. SIM/workflow graph components (`canvas`, `node`, `edge`, `connection`, `controls`, `panel`) were intentionally not installed.
- Files: `apps/web/src/components/ai-elements/*.tsx`, `apps/web/src/components/ui/popover.tsx`, `apps/web/src/styles.css`, `apps/web/package.json`, `pnpm-lock.yaml`, `governance/contracts/architecture.json`.
- Verification: `pnpm check:deps` passed; `pnpm web:build` passed; `git diff --check` reported only CRLF normalization warnings; `pnpm --dir apps/web exec tsc --noEmit` no longer reports missing `tokenlens` or `@xyflow/react`, but still fails on pre-existing unrelated errors in `conversation.tsx`, `chattr-api.ts`, and `settings.tsx`.
### 2026-06-11

- Changed: Added the Kai New Project modal, modeled after JWC's Create Store dialog, and wired the Projects rail plus action to open it instead of navigating to the placeholder `/projects/new` page. The modal fields are `Project`, `Description`, and short `Objectives`; created projects are shown as children under the Projects rail group in the current workspace shell.
- Files: `apps/web/src/components/projects/CreateProjectDialog.tsx`, `apps/web/src/components/layout/KaiAppRail.tsx`, `apps/web/src/components/workbench/WorkbenchCompactRail.tsx`.
- Verification: `pnpm web:build` passed; `git diff --check` reported only CRLF normalization warnings; browser check on `http://127.0.0.1:8800/projects` confirmed the Projects plus opens the modal, all three fields are present, submit stores and renders the project under Projects, and console/page errors were 0. `pnpm --dir apps/web exec tsc --noEmit` still fails only on pre-existing unrelated errors in `conversation.tsx`, `chattr-api.ts`, and `settings.tsx`.

### 2026-06-11

- Changed: Made the workbench Changes/Code/Files docks real (was all static fixtures). Backend: new `app/workspace_files.py` (git-backed working-tree access confined to repo root: ls-files tree, status+numstat changes, file read with binary/size guards, HEAD-vs-working diff, save restricted to existing text files) + `routes/workspace.py` registering GET /api/workspace/{tree,changes,file,diff} and PUT /api/workspace/file (session-gated by default middleware). Frontend: `lib/workspace-api.ts`, data-driven `WorkspaceFileTree` component, ChangesViewerPane rewired to live changes + real Monaco DiffEditor per file, new CodeEditorPane (editable Monaco + dirty indicator + Save) for Code, Files tab (renamed from Docs) = same pane read-only. Composer: "+" action menu gained "Add agent" which opens the AgentLauncherDialog (dialog gained additive controlled props open/onOpenChange/hideTrigger).
- Verification: backend py_compile + runtime contract tests 11 passed + TestClient smoke (tree 200/333 files, changes 200/33, file read 200, traversal 403, no-token 403); tsc clean; `pnpm --dir apps/web run build` passed. Live UI renders with graceful error/empty states; REAL data requires restarting the API process (new routes + earlier locked.details are not in the running process).
- Deferred by design: "/" composer command system (own pass) and the chat�??dock shared-context injection (dock_context on send �?? message metadata �?? agent visibility via MCP; per the OTEL passive-context precedent) �?? design proposed to Jon, pending go.

### 2026-06-11

- Changed: Removed the fixed `max-w-3xl` cap from the workbench chat transcript and composer wrappers so the chat message area tracks the actual chat pane width instead of stopping at 768px on wide screens. Kept the AI Elements `Message` source component intact; the fix is local to the workbench composition layer.
- Files: `apps/web/src/routes/workbench.tsx`.
- Verification: browser measurements on `http://127.0.0.1:8800/workbench` showed transcript width matching its parent at 1440/1920/2560px (714/973/1318px) with 0 console/page errors; `pnpm --dir apps/web run build` passed; `git diff --check` exited 0 with only CRLF normalization warnings. `pnpm --dir apps/web exec tsc --noEmit` still fails only on pre-existing unrelated errors in `conversation.tsx`, `chattr-api.ts`, and `settings.tsx`.


### 2026-06-11 - Plan 1 real-Postgres verification + index-drift finding

- Verified Gap 1/Gap 2 against the **dev Neon DB** via SOPS (`sops exec-env secrets/dev/neon.yaml` + `run-alembic-from-env.ps1`): migration `0005` applies (`0004->0005`) and reverses cleanly; `alembic check` shows zero drift on the `sequence` column or unique constraint (Gap 2 correct) and now sees `routing_decisions` + identity tables (Gap 1 working). Dev restored to `0004` (no footprint).
- Finding: `alembic check`, now honest, surfaced pre-existing repo-wide index-declaration drift - migrations create `op.create_index` indexes the models never declare. Fixed the identity slice (commit `d0b210c`: `index=True` on the 3 identity FK cols; identity drift 3->0). Remaining **12** board/home/routing indexes tracked at `kai-chattr-alembic-index-declaration-reconciliation-task.md` (coordinate with that lane).
- Branch `feat/plan1-finish-gaps`: `057241c` (gaps+guard) + `d0b210c` (identity indexes). Remaining: index reconciliation (12), board-store create_all guard, merge->main.


### 2026-06-11 - Merged Plan 1 gap fixes to main

- Merged `feat/plan1-finish-gaps` -> `main` as a fast-forward (`e99b6eb` -> `d0b210c`): commits `057241c` (Gap 1 env.py registration + Gap 2 chat_messages sequence/uniqueness + create_all guard) and `d0b210c` (identity FK index declarations). Foundation tests **14/14** on merged main. Worktree + branch cleaned up.
- The parallel lane's **34-file uncommitted WIP** (apps/web agent-builder, home_start, product_routes) was left untouched. `main` is **not yet pushed** (origin/main at `e99b6eb`). Dev Neon still at `0004` (foundation `0005` not yet applied to dev). 1 pre-existing unrelated test fail (`test_zellij_terminal_backend`).
- Open: 12-index reconciliation task; board-store create_all guard; push main; apply 0005 to dev; **Plan 1.5 next**.

### 2026-06-11

- Changed: Moved the composer's web Search toggle into the "+" action menu as a DropdownMenuCheckboxItem (checked state = useWebSearch); removed the standalone Search button from the tools row (now: + / mic / model / send).
- Verification: tsc clean; `pnpm --dir apps/web run build` passed; live menu shows Add photos or files / Take screenshot / Add agent / Web search (menuitemcheckbox, aria-checked wired), 0 console errors.


### 2026-06-11 - Repo regroup: single-branch main workflow

- Pushed `main` (`e99b6eb` -> `d0b210c`) to origin; local and origin/main in sync (0 0).
- Branch/worktree cleanup per Jon: deleted local `dev`, `feat/plan1-data-plane`, `sim-shell-preview` (incl. its worktree's 3 uncommitted abandoned Sim-experiment files - explicit discard), removed `E:/kai-chattr-pr-1-merge` worktree. Kept `origin/dev`.
- **Workflow decision (Jon): work directly on `main`** - no feature branches unless a specific need arises. Only worktree = `E:/kai-chattr` on `main` @ `d0b210c`. Parallel lane's 34-file uncommitted WIP untouched.
- Next: Plan 1.5 (auth/session + tenancy dependency) implemented on `main`.


### 2026-06-11 - Committed parallel lane snapshot to main

- Committed the in-flight frontend+API lane (`fe12dbe`) and pushed; `main` now `fe12dbe`, origin in sync, working tree **0 uncommitted**.
- Scope (23 files, current verified state - lane had evolved past the earlier snapshot): backend `app/routes/workspace.py` + `app/workspace_files.py` + main.py registration + `stores/locked.py`; frontend agent builder (KaiAppRail, agent-detail, AgentLauncherDialog, agent-system-contract, agent-bits), BoardDock rework, WorkspaceFileTree + `lib/workspace-api`, projects dialog, 12 `ai-elements/*`, popover ui; `governance/contracts/architecture.json`, package.json + pnpm-lock.yaml.
- Pre-commit gate: no secrets/conflict-markers/deletions; `services/api` pytest **213 pass / 1 pre-existing zellij fail**; `apps/web` build **OK** (~52s).
- main is now the single clean source of truth. Next: Plan 1.5 (auth/session + tenancy dependency) on main.

### 2026-06-11

- Changed: Pushed origin/main through fe12dbe (workbench docks 227004a + lane snapshot), then hygiene commits fc4850f/cbeaff2: AGENTS.md gained Python-environment rules for services/api (.venv machine-local, uv.lock source of truth, always `uv run`, rebuild via uv sync); .remember/ and ad-hoc api-restart logs gitignored; stale page-closures/ removed. API process restarted via `uv run python -m app.cli` from services/api �?? healthz 200, /api/workspace/* live (403 token-gated); bare-interpreter launch confirmed broken and documented.
- Verification: pre-push gates (check-contracts OK, node contract 6/6, backend 213 passed + 1 pre-existing zellij env failure); post-restart healthz + route probes; memory-vector health checked (1417 memories, integrity green).

### 2026-06-11

- Changed: Added `_staging/` to Kai Chattr `.gitignore` and created the local `_staging/openhands-cloud-repository-runtime-flow` source-reference package for the OpenHands cloud-first repository/runtime flow. The package is local-only and documents provenance, scope, planned implementation, and promotion rules.
- Persisted: Saved the `_staging` purpose in local `_staging/README.md`, MCP memory-vector, Hindsight collective memory, and Planned root document `kai-chattr-_staging-purpose.md`.
- Verification: Copied 43 non-enterprise OpenHands files into the gitignored staging package, verified Planned store guide via `GET /stores/planned/nodes/docs-node-5fcea3aaab9a41db972bcc0cb10ac2a8`, and updated this changelog through the Stores API.

### 2026-06-11 - Plan 1.5 batch 1 (T1-T3) on main

- Commit `46eee28` (pushed; origin in sync). New `app/auth/` package (path drift: plan said `app/security/` but `app/security.py` exists as a module - intent preserved): `passwords.py` (argon2-cffi), `tokens.py` (opaque `kcs_` tokens, SHA-256 at rest, raw shown once), `deps.py` (`current_session` bearer dependency), `tenancy.py` (**frozen seam**: `WorkspaceContext` + `resolve_workspace_context` resolve->authorize->translate, non-member/unknown = 404 fail-closed, + `workspace_scoped` helper).
- Identity store gained `issue/validate/revoke_session` (DB row = single source of truth, expiry honored) + `get_user`/`get_workspace_by_public_id`/`get_membership`.
- Verification: 9 new tests (`test_auth_session_tenancy.py`) + 14 foundation = green; full suite 222 pass / 1 pre-existing zellij fail.
- Remaining in Plan 1.5: **T4** signup/login/logout routes + personal-workspace backfill, **T5** OAuth callback with the S1 verified-link rule, **T6** `/api/user/account` + invitations + endpoint-contract registration.

### 2026-06-11 - Deploy pipeline repair + dev-environment stack doc

- Root cause of every recent "Deploy API to Fly" failure: `services/api/requirements.txt` (what the Dockerfile installs) drifted from `pyproject.toml` — missing `argon2-cffi`, `httpx`, `opentelemetry-exporter-otlp`, `opentelemetry-instrumentation-{fastapi,sqlalchemy}` — so the Alembic release command crashed (`ModuleNotFoundError: opentelemetry.instrumentation`) and deployed APIs ran stale code. Fixed: requirements.txt now mirrors pyproject `[project].dependencies` exactly.
- New drift gate: `governance/scripts/check-python-requirements-sync.py` (BOM-tolerant; compares names + extras + specifiers both directions), wired as `pnpm run check:python-requirements-sync`, chained into `check:deps`, and run as the first step of `deploy-api.yml` before `flyctl deploy`. Negative-tested against the old requirements.txt: 8 drifts caught, exit 1.
- `deploy-web.yml`: trigger paths now include the workflow file itself. Reverted (same session, pre-commit) an erroneous `VITE_KAI_CHATTR_API_ORIGIN` injection — the deployed client must keep relative `/api` paths so the Pages Functions proxy (`apps/web/functions/api/[[path]].js`) handles origin + token server-side.
- New worker reference: `governance/plans/kai-chattr-deploy-pipeline-runbook.md` — verified stack map (Pages + Functions proxy → Fly → Neon), branch→environment mapping, backmerge GITHUB_TOKEN no-trigger caveat, secrets inventory (names only), correct verification probes (`/healthz` at API root; `pages.dev/api/healthz` 404 is expected), Neon's role.
- Verification: sync gate OK on fixed files + 8-drift fail on old file; live probes — both Fly healthz 200 postgres, both `pages.dev/api/*` proxies return FastAPI JSON (chain works; APIs stale pending this deploy).

### 2026-06-11 - PTY-ownership requirement locked into governance

- Recorded Jon's locked requirement at `governance/plans/kai-chattr-pty-ownership.md`: "backend owns PTY/process/session" = **ConPTY ownership** (Windows, CreatePseudoConsole/pywinpty) / openpty (Unix) — the wrapper spawns the agent CLI on a pseudoconsole it owns, writes input as bytes, reads the authoritative VT stream (pyte screen model + OTel stream tap; one PTY core serving both the agent control plane and the Phase 1 WS/xterm.js human terminal). Priority: top-3 objective of the chattr→kai-chattr migration, not optional. Clean-room constraint: Jon's prior implementation lives in a work project — feasibility evidence only, no code enters this repo.
- Kill-list frozen (functional until replaced, no new investment): WriteConsoleInputW injection, `wm_setfocus`/`console_input` enter backends + `enter_backend` config, length-scaled sleeps, console-buffer de-noising, tmux/Zellij send-keys control paths (Zellij Enter investigation moot). Deprecation banners added to `app/wrappers/windows.py` and `app/wrappers/zellij.py` docstrings.
- Why the requirement circled (recorded so it stops): Jon described the architecture repeatedly but the term "ConPTY" was foreign to him, and no worker ever named it back as the requirement — the doc opens by binding the plain language to the named architecture.
- Verification: `uv run python -m compileall app/wrappers/windows.py app/wrappers/zellij.py -q` OK (docstring-only edits); `pnpm run check:contracts` OK.

### 2026-06-11 - PTY-ownership core landed (migration step 1, commit 52a93fb)

- New `app/wrappers/pty_backend.py` (`PtyTerminalBackend`): headless PTY transport implementing the locked requirement — wrapper owns the pseudoterminal (pywinpty/ConPTY on Windows, `os.openpty` on POSIX), spawns the agent CLI on it, input = pipe writes (no WriteConsoleInput/VK codes/focus state/enter_backend variants), output = continuous VT stream into a pyte `HistoryScreen` (+ `bytes_received`/`last_output_at` telemetry counters). Bracketed paste wraps input only when the child has enabled DECSET 2004, tracked deterministically from its own output. Surface mirrors `ZellijTerminalBackend` for drop-in parity (`start/inject/inject_command/capture_terminal/wait_for_text/session_exists/close/get_activity_checker`).
- Fixes applied to the drafted implementation before landing: DECSET 2004 sequences split across PTY read boundaries (scan carry), incremental UTF-8 decoding on POSIX (split multibyte chars no longer corrupt the screen), reader-thread teardown race (handles snapshotted to locals).
- Deps: `pyte>=0.8` + `pywinpty>=2.0 ; sys_platform == 'win32'` via `uv add`, mirrored verbatim into `requirements.txt` (requirements-sync gate enforced) and registered in `architecture.json` items + allowedDeps. Linux/Fly image unaffected (marker skips pywinpty).
- TDD: `tests/test_pty_terminal_backend.py` red (ModuleNotFoundError) → 4/4 green on real ConPTY against `fake_cli_agent.py` — probe echo, exit + telemetry counters, activity-checker parity, split-chunk paste tracking. **Enter submission works as a plain `\r` pipe write** — the exact thing the Zellij send-keys lane could not solve on Windows.
- Full suite: 247 passed; 2 fails = pre-existing zellij env failure (moot under the kill-list) + `test_runtime_agent_loop` websocket timing flake (passes in isolation).
- Rollout constraint honored: backend is unwired (no config flag yet — that is migration step 2); per the wterm lock, local CLI agents keep a visible terminal surface until approval-prompt relay is reliable.

### 2026-06-11 - PTY transport switchable per agent (migration step 2, commit 3bf2d5d)

- Changed: `transport = "pty"` in any `[agents.<name>]` section of `services/api/config.toml` now switches that agent from the console-injection runners to the owned-PTY transport; default stays `"console"` (no behavior change without opt-in). `app/wrappers/cli.py` dispatch gained the pty branch ahead of the platform branches; `enter_backend` is never passed on the pty path. `app/wrappers/pty_backend.py` gained the module-level runner surface mirroring windows/unix: `run_agent` (restart loop, watcher registration, pid_holder), `capture_terminal`, restart-resilient `get_activity_checker`, `inject`, and a `pid` property.
- Found+fixed while shipping: the morning's `check:deps` chain change (requirements-sync gate) broke `test:runtime-contract`, which pins the exact script string — contract updated to pin the new chain including `check:python-requirements-sync`. That contract test was missed before pushing 5a710b2; caught here.
- Verification: 13 passed (5 PTY incl. new runner-surface test driving run_agent/capture/inject headless on ConPTY + 8 wrapper-config); full suite 249 passed / 1 pre-existing zellij env fail; `check:deps` OK; `test:runtime-contract` + `test:port-drift-contract` pass; compileall OK.

### 2026-06-11 - Transport switch surface: API + launcher UI (commit 20cf5c9)

- Backend: new `app/routes/agent_runtime.py` (factory router, registered in `main.py`) — `GET /api/agents/runtime-config` lists CLI agents (api-type excluded) with transport + `effective_on_next_launch`; `PUT /api/agents/{agent}/runtime-config` sets `console|pty`. Writes go to gitignored `config.local.toml` via tomlkit (style-preserving; unrelated local content untouched) so the tracked `config.toml` never carries machine state.
- `app/config.py`: `config.local.toml` `[agents]` merge now overlays runtime keys (`LOCAL_AGENT_RUNTIME_KEYS` = transport/inject_delay/enter_backend) onto agents that already exist in `config.toml`; identity keys (command/cwd/label/mcp_*) remain protected with a warning. Previously local entries for existing agents were discarded wholesale, which would have silently ignored the transport switch.
- Frontend: `lib/agent-runtime-api.ts` (GET/PUT client + profile-id→agent mapper) and a Transport select (Console/PTY, "applies on next launch") on each Agent launcher card, react-query wired with invalidation; hidden for profiles without a matching CLI agent.
- Deps: `tomlkit>=0.13` via uv, mirrored in requirements.txt (sync gate) and architecture.json.
- Verification: 5 new backend tests green (overlay semantics incl. identity-key protection, GET/PUT round-trip with file assertions, local-content preservation, 404 unknown/api-agent + 422 bad transport); full suite 253 passed (same 2 non-blocking: pre-existing zellij env fail + websocket flake passing in isolation); web build passed; tsc clean on touched files; all governance gates green.

### 2026-06-11 - Interactive human terminal shipped (Phase 1, commit 59be295)

- First real interactive terminal in kai-chattr, per the locked Phase 1 plan (`docs/plans/kai-chattr-terminal-foundation-phase1-implementation-plan.md`, now marked Implemented): backend owns the PTY via pywinpty/ConPTY — new `app/terminal/` package (`pty_backend.py` raw byte-bridge protocol, `session_manager.py` in-memory registry w/ 8-session cap, `ws.py` FastAPI WS bridge). `/ws/terminals` (ready/input/resize/output/exit frames, room-style `?token=` auth, 4003 on mismatch, disconnect kills the child) + `GET /api/terminals`. Registered via `websocket.py` with a reload-safe dispatcher (FastAPI quirk: an unannotated ws param becomes a query dep → 1008).
- Runtime events: existing `chattr.runtime_event.v1` types only — `terminal.opened`, per-direction `terminal.bytes` totals at teardown, `terminal.exited`, `terminal.closed` — emitted before the reader join because client-vanish cancels the coroutine (CancelledError would skip post-await emits); `terminal.session.create` OTel span. Frozen schema untouched.
- Frontend: `InteractiveTerminal.tsx` (xterm.js + fit addon, ResizeObserver, input/resize frames) replaces the read-only snapshot pane in the workbench Terminal dock tab; `terminal-session-api.ts` mirrors the room WS URL pattern. Renderer = xterm.js per the plan's amendment of the wterm lock (wterm stays a future swappable renderer behind this seam). Deps `@xterm/xterm` + `@xterm/addon-fit` in the architecture allowlist.
- Verification: TDD red→green, 5 new tests (PTY echo `plan-1-ok`/list/close/limit; WS ready+`ws-ok` io/list/cleanup, bad-token 4003, lifecycle-event schema validation via `validate_payload`); full suite 259 passed / 1 pre-existing zellij env fail; web build + tsc clean on touched files; all gates green. **Live acceptance on the restarted 8800 stack:** workbench Terminal tab → real `PS E:\kai-chattr>` prompt, `echo hello-from-pty` round-trip (screenshots in `docs/images/scratch/terminal-{tab-initial,echo-test}.png`), tab close killed the shell (OS-verified, PID gone — no orphan), `runtime_events.jsonl` shows bytes in/out + `terminal.closed cleanup_result=terminated`. Snapshot routes + 501 launcher stubs unchanged.

### 2026-06-12 - Headless agent launch (commit a89ffdb)

- `start_headless_agent` in `app/launch/visible_agent_launcher.py`: same preflight as visible launch but `CREATE_NO_WINDOW` + stdio DEVNULL + `KAI_CHATTR_TRANSPORT_OVERRIDE=pty` (headless requires PTY transport; console injection needs a console). `wrappers/cli.py` honors the env override ahead of agent config. `POST /api/launchers/agent` gains `headless: bool`; launcher dialog cards gain a Headless button beside Launch.
- Verification: `tests/test_headless_agent_launch.py` — spawn kwargs (CREATE_NO_WINDOW flag, env override, DEVNULL stdio) + override precedence. Live-verified: Claude launched headless from the workbench dialog, uv→conhost→python chain all `MainWindowHandle=0`, zero visible windows, wrapper on forced PTY transport.

### 2026-06-12 - Agent approval signal: runtime cards + raw-input lane

- Backend (`app/routes/terminal.py`): server-side approval detection on every snapshot write — `detect_approval` flags an approval prompt only when it sits at the live bottom of the screen (old prompts scrolled into history don't re-flag); `GET /api/terminal-runtimes` returns per-agent cards (`approval_needed`, `approval_hint`, `screen_tail`, `has_snapshot`, `snapshot_age_ms`) + `pending_approvals` count; `POST /api/terminal/{agent}/input` appends raw keystrokes to `{data_dir}/{agent}_input.jsonl` (≤200 chars, 404 unknown agent). `main.py` passes `get_data_dir` into `TerminalApiState`.
- Wrapper (`app/wrappers/cli.py`): `_drain_raw_input` drains the per-identity `_input.jsonl` each loop tick and injects the keys verbatim into the owned PTY (empty string = bare Enter; malformed lines dropped; file truncated after drain) — the human approval lane alongside the existing message queue.
- Frontend: `AgentRuntimeOverlay.tsx` mounted at the bottom of the workbench right dock rail — quiet robot trigger with an amber count circle while approvals are pending (red stays reserved for failures), green dot when agents are live; popup card stack overlays the dock (no layout push), autohides after ~8s without interaction (badge never hides), auto-surfaces on new approvals; expanded card shows the screen tail + Approve (y)/1/2/Enter/custom-keys actions via the raw-input endpoint. `terminal-api.ts` gains `getTerminalRuntimes`/`sendTerminalInput`.
- Removed dead zellij transport: `app/wrappers/zellij.py`, `tests/test_zellij_terminal_backend.py`, and the vendored `tools/zellij/` binary (kill-list item; console paths remain for non-PTY agents).
- Verification: `tests/test_agent_runtime_cards.py` — detection patterns incl. scrolled-history negative, snapshot→runtimes round-trip with approval set/clear, input endpoint validation + JSONL append, wrapper drain verbatim/no-op-on-empty. Full suite 265 passed, 0 failed. Web `vite build` green with the overlay mounted.
