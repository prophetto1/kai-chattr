# Changelog

Repo-root changelog (decision 2026-06-11: lives here, not in the Planned store). Append an entry per codebase change, newest first.

## 2026-06-11

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
