# Kai-Chattr Scope-Based Routing Foundation

**Goal:** Record the initial route, auth, workspace, and chat-session direction before more endpoint or MCP work continues.

**Architecture:** Classify every product route as user-scoped, workspace-scoped, or workspace-session-scoped. `/workbench` is not the canonical product route; it can only remain as a transition helper after scoped session routes exist.

**Tech Stack:** React Router in `apps/web`, FastAPI in `services/api`, Postgres for auth/workspace/chat persistence, SOPS for secret-bearing local access.

**Status:** Direction locked - implementation plan required before code changes
**Author:** Codex for Jon
**Date:** 2026-06-10

## Why This Exists

Kai-chattr has accumulated endpoint and URL definitions around a global `/workbench` route. That is useful for the current prototype, but it is not the product route model for a tenant-aware chat/workbench system.

Future workers must not continue API, MCP, or frontend route work as if `/workbench` is the final canonical location. New work must name the scope it belongs to before adding routes, handlers, tables, tool definitions, or frontend callers.

## Current State Checked

- `apps/web/src/main.tsx` currently mounts `/workbench`, `/settings`, and `/observability` as top-level React routes.
- `services/api` must not serve the frontend workbench; existing runtime parity docs already require API `/workbench` to return `404`.
- Existing plans and tests still use `/workbench` as the current acceptance surface. Treat that as transitional acceptance, not canonical product architecture.
- Existing code still contains helper links that point at `/workbench`, including start/session flows. Those must be migrated under a later scoped-route implementation plan.

## Locked Route Scope Decisions

1. User ID must not appear in product URLs. Auth resolves the current user from the browser session.
2. Workspace identity in URLs must use a public workspace identifier, not an internal UUID.
3. Chat session identity in URLs must use a server-generated opaque `session_hash`, not a title, message hash, user ID, or editable content.
4. `/workbench` cannot be canonical. It may become a redirect/helper route only after scoped session routes exist.
5. Settings must be split by scope. User settings are not workspace settings, and workspace settings are not chat-session routes.
6. Settings entry points must land on `User > Account` first, with `Appearance` as a user submenu after `Account`.
7. API and MCP endpoint work must not continue until the route scope, auth rule, persistence table, frontend caller, and observability surface are declared for that slice.

## Canonical Route Contract

| Scope | Route Pattern | Examples | URL Identifiers |
|---|---|---|---|
| Public auth | `/login`, `/signup` | `/login` | None |
| Current-user settings | `/settings/user/{section}` | `/settings/user/account`, `/settings/user/appearance` | None; auth session supplies user |
| Workspace settings | `/w/{workspace_public_id}/settings/workspace/{section}` | `/w/acme/settings/workspace/members`, `/w/acme/settings/workspace/agents` | `workspace_public_id` |
| Chat session workbench | `/w/{workspace_public_id}/sessions/{session_hash}` | `/w/acme/sessions/sess_x7p9...` | `workspace_public_id`, `session_hash` |
| Optional workbench wording | `/w/{workspace_public_id}/workbench/{session_hash}` | `/w/acme/workbench/sess_x7p9...` | `workspace_public_id`, `session_hash` |
| Transitional helper | `/workbench` | `/workbench` | None; helper only |

Preferred canonical chat route: `/w/{workspace_public_id}/sessions/{session_hash}`.

The `/w/{workspace_public_id}/workbench/{session_hash}` form is allowed only if the product language requires the word `workbench`. Do not implement both as independent product surfaces.

## Settings Contract

User-scoped settings:

1. `/settings/user/account`
2. `/settings/user/appearance`
3. `/settings/user/security`
4. `/settings/user/preferences`

Workspace-scoped settings:

1. `/w/{workspace_public_id}/settings/workspace/general`
2. `/w/{workspace_public_id}/settings/workspace/members`
3. `/w/{workspace_public_id}/settings/workspace/agents`

`Settings` in the app shell must open `User > Account`, not a generic settings root and not `Appearance`.

## Persistence Contract

Postgres is required for the canonical route model.

Required tables:

| Table | Purpose |
|---|---|
| `auth_sessions` | Browser login session backing auth |
| `auth_credentials` | Password or provider credentials; stores password hashes only |
| `workspaces` | Tenant/workspace records |
| `workspace_memberships` | User membership and role in a workspace |
| `chat_sessions` | Workspace-scoped chat/workbench sessions |
| `chat_messages` | Messages belonging to a chat session |

`chat_sessions` must use:

- `id uuid primary key` for internal PK/FK use.
- `session_hash text unique not null` for the public URL identifier.
- `workspace_id uuid not null` to bind the session to a tenant.
- `created_by_user_id uuid not null` from auth, not from URL input.
- `title text`.
- `mode text` for values such as `scratch`, `repo`, or `folder`.
- `status text`.
- `created_at timestamptz`.
- `updated_at timestamptz`.
- `archived_at timestamptz null`.

`session_hash` must be server-generated, opaque, stable, and not derived from editable content.

For username/password auth, `auth_credentials` must store only hashes:

- `id uuid`
- `user_id uuid`
- `provider text`
- `email_normalized text`
- `password_hash text`
- `created_at timestamptz`
- `updated_at timestamptz`

Never store plaintext passwords.

## Endpoint Contract Gate

Before adding or modifying a REST endpoint, WebSocket event, MCP tool, MCP resource, MCP prompt, or frontend caller, the implementation plan must declare:

1. Route scope: public auth, current user, workspace, or workspace session.
2. URL pattern and all public identifiers.
3. Auth/session rule.
4. Tables read or written.
5. Frontend callers.
6. OpenAPI or MCP exposure.
7. Observability spans, metrics, and structured logs.
8. Cloudflare/Vite routing behavior.
9. Compatibility rule for any existing `/workbench` caller.

## Initial Worker Rules

1. Do not add new canonical links to `/workbench`.
2. Do not put `user_id` in current-user settings URLs or request bodies.
3. Do not create unscoped chat sessions.
4. Do not derive `session_hash` from chat title, first message, or any editable field.
5. Do not expose MCP tools from endpoints whose scope contract has not been declared.
6. Do not move existing routes silently. Write and approve a scoped-route implementation plan first.

## Suggested First Implementation Slice

The first implementation plan should be small:

1. Add route constants for the scope patterns.
2. Add placeholder user settings route `/settings/user/account`.
3. Make the app Settings entry open Account.
4. Add a persistence migration plan for auth/workspace/chat-session tables.
5. Add a compatibility plan for existing `/workbench` links.
6. Add tests proving `/workbench` is not treated as canonical in new navigation.

## Verification For Future Work

At minimum, future implementation must verify:

```powershell
pnpm run check:contracts
pnpm --dir apps/web run build
Set-Location services/api; uv run pytest -q
```

If scoped session routes are added, browser verification must prove:

1. `/settings/user/account` renders as user-scoped account settings.
2. `/w/{workspace_public_id}/sessions/{session_hash}` renders the session workbench.
3. `/workbench` is absent from new canonical navigation or behaves only as the approved helper route.
