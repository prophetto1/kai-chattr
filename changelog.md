# Changelog

Repo-root changelog (decision 2026-06-11: lives here, not in the Planned store). Append an entry per codebase change, newest first.

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
