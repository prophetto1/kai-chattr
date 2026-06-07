# Agent Port Identity Launcher Memory Implementation Plan

**Goal:** Build the first usable kai-chattr launcher slice where a user creates an agent from the browser, the backend assigns one predefined identity port, provisions that port's isolated SQLite memory store, handles subscription/API-key auth, launches the CLI/API wrapper, and exposes only that port's memory plus collective Hindsight memory through the shared MCP bridge.

**Architecture:** Keep kai-chattr's current FastAPI service as the owned runtime seam on `8300`, keep the shared Chattr MCP servers on `8301` and `8302`, and add a separate predefined agent identity port pool, initially `8900-8910`. A port is the durable identity anchor. Each port gets its own `data/agents/{port}/memory.sqlite` and profile. One shared MCP bridge remains installed/running; MCP memory tools resolve caller token to registered instance to agent port to that port's SQLite file. No agent can name or browse another port's memory path. Hindsight remains the collective memory provider and is not replaced by the per-port SQLite store.

**Tech Stack:** Python 3.11, FastAPI, stdlib `sqlite3` for per-port memory files, existing OpenTelemetry JSONL exporters, React 19 + Vite, shadcn/ui source components, Vercel AI Elements / AI SDK React source components, pytest, pnpm.

**Status:** Draft
**Author:** Jon requirement / Codex plan
**Date:** 2026-06-05

---

## Investigation Summary

### Current Repo Reality

- Current backend root: `services/api`.
- Current frontend root: `apps/web`.
- Current Chattr runtime ports in `services/api/config.toml`: web/API/WebSocket `8300`, MCP streamable HTTP `8301`, MCP SSE `8302`.
- Current launcher profile registry: `services/api/app/launch/agents.toml`.
- Current launcher route module: `services/api/app/routes/launchers.py`.
- Current runtime identity registry: `services/api/app/runtime/registry.py`.
- Current MCP identity proxy: `services/api/app/mcp/proxy.py`.
- Current MCP tool bridge: `services/api/app/mcp/bridge.py`.
- Current frontend mounted UI: `apps/web/src/App.tsx`, a starter placeholder card, not the launcher/chat experience.
- Current component rule: `AGENTS.md`, `apps/web/AGENTS.md`, and `governance/contracts/frontend.json` require shadcn/ui primitives and Vercel AI Elements / AI SDK React for AI/chat/workbench surfaces.
- Current working tree note: `services/api/` is untracked at the time this plan was written. Treat it as current working-tree reality for planning, not as a committed architecture baseline.

### Existing Architecture Conflict To Resolve

`docs/adr/0001-agent-infrastructure.md` decision D5 currently says v1 uses one SQLite DB with identity-scoped rows and defers file-per-agent isolation. Jon's current requirement supersedes that storage decision for this launcher slice:

- Port identity is the durable anchor.
- Each predefined port has its own local SQLite memory file.
- An agent on one port cannot access another port's memory file.
- One shared MCP bridge routes memory access by authenticated token and bound port.

This plan therefore requires an ADR amendment before implementation tasks that depend on storage can be considered complete.

### External Repo Compatibility Summary

The external repo scan is through the lens of kai-chattr's needs: launcher auth flow, provider/API-key UX, token storage patterns, MCP OAuth testing, and memory isolation.

#### Repo Compatibility Brief

- `repo_name`: kai-chattr borrowing investigation
- `repo_path`: `E:\kai-chattr`
- `analysis_date`: 2026-06-05
- `our_context`: kai-chattr is a local FastAPI + React/Vite agent coordination room. The gap is port-backed agent identity, scoped per-agent memory, and browser-driven launcher/auth UX.
- `scope`: provider auth, browser callback, API-key entry, token store pattern, process launcher, per-agent memory scope, frontend workbench.
- `target_summary`: `F:\repos\mcp-agent`, `F:\repos\opencode`, `F:\repos\sim`, and `F:\repos\LibreChat` contain useful patterns, but none implements kai-chattr's port-scoped memory model directly.

**Decision**

- `fit_decision`: partial-fit
- `thesis`: Borrow OAuth/provider-auth patterns and tests; build port identity and per-port SQLite memory natively in kai-chattr.
- `go_no_go`: approve targeted adaptation, not wholesale adoption
- `confidence`: High for mcp-agent/opencode adaptation; Medium for credential encryption details until SOPS runtime key shape is confirmed in `WORKER-ACCESS.md`.

**Borrowing Matrix**

| Domain | Evidence | Decision | Why | Cost |
|---|---|---|---|---|
| OAuth loopback browser callback | `F:\repos\mcp-agent\src\mcp_agent\oauth\flow.py:_run_loopback_flow` | Adapt | Fixed-port callback listener, browser open, timeout, state validation map directly to subscription auth adapters. | 3d |
| OAuth token-store interface | `F:\repos\mcp-agent\src\mcp_agent\oauth\store\base.py:TokenStoreKey`, `TokenStore` | Adapt | The key tuple idea maps to `agent_port + provider + resource + scope`; implementation must write to Chattr encrypted credential store. | 1d |
| PKCE/state generation | `F:\repos\mcp-agent\src\mcp_agent\oauth\pkce.py` | Adapt | Simple, isolated crypto helpers; use pattern, avoid direct copy unless NOTICE is updated. | 1d |
| Provider auth method API | `F:\repos\opencode\packages\opencode\src\provider\auth.ts:Method`, `Authorization`, `authorize`, `callback` | Rework | API shape is good, but TypeScript Effect/plugin stack does not fit FastAPI backend. | 3d |
| Provider connect dialog UX | `F:\repos\opencode\packages\app\src\components\dialog-connect-provider.tsx:ApiAuthView`, `OAuthAutoView` | Rework | State machine is directly useful; UI must be rebuilt with kai-chattr shadcn/Vercel components. | 3d |
| Provider credential persistence shape | `F:\repos\opencode\packages\opencode\src\auth\index.ts:Oauth`, `Api`, `Service.set` | Adapt | Separates OAuth vs API-key auth cleanly; Chattr storage must encrypt server-side and scope by port. | 2d |
| MCP OAuth callback test harness | `F:\repos\LibreChat\packages\api\src\mcp\__tests__\helpers\oauthTestServer.ts:createOAuthMCPServer` | Adapt | Useful model for fake OAuth server tests; Node implementation is not lifted. | 2d |
| Postgres credential schema | `F:\repos\sim\packages\db\schema.ts:credential`, `api_key`, `encryptedApiKey` | Reference | Good vocabulary for future Postgres store; current phase stays SQLite per port. | 1d |
| Encrypted secret migration pattern | `F:\repos\sim\packages\db\scripts\migrate-block-api-keys-to-byok.ts:encryptSecret`, `decryptSecret` | Reference | Confirms encrypted-at-rest approach; do not port Node crypto code. | 1d |
| Port-scoped per-agent memory | Search across `F:\repos` | Build | Not found. kai-chattr's port-as-identity rule is product-specific. | 1w+ |

**Architecture Map**

### Backend Launcher Layer

- `extract`: OAuth loopback control flow from mcp-agent; provider method state shape from opencode.
- `extension_points`: provider catalog entries in TOML; auth adapter strategies `subscription_oauth`, `subscription_cli_browser`, `api_key`.
- `contracts`: `provision(provider, auth_mode, profile) -> reserved port + memory store`; `start(port) -> process + registration nonce`.

### Memory/MCP Layer

- `extract`: TokenStore key idea, not implementation.
- `extension_points`: MCP tools registered on existing Chattr MCP bridge.
- `contracts`: `resolve_memory_scope(ctx) -> agent_port or deny`; no user-supplied path/port accepted by memory tools.

### Frontend Launcher/Chat Layer

- `extract`: opencode provider connect state machine and API-key/OAuth view sequence.
- `extension_points`: shadcn Dialog/Sheet/Tabs/Table/Form controls; Vercel AI Elements prompt input for chat.
- `contracts`: Create agent flow must show port, provider, auth status, memory path label, and launch state before entering chat.

**Risks**

- `validate_first`: provider-specific Claude/Codex/Gemini subscription login commands must be verified locally; do not guess CLI auth command flags.
- `validate_first`: SOPS-injected encryption key availability must be confirmed through `WORKER-ACCESS.md`.
- `platform_mismatch`: opencode UI is Solid/Effect TypeScript, not React/FastAPI.
- `platform_mismatch`: mcp-agent OAuth is Python but targets downstream MCP OAuth, not Claude/Codex/Gemini CLI subscription auth directly.
- `license`: mcp-agent Apache-2.0, opencode MIT, sim Apache-2.0, LibreChat MIT; compatible with kai-chattr AGPL only if attribution/NOTICE rules are followed for copied code.
- `fit_breakers`: Any provider that cannot be verified without plaintext secrets or unmanaged browser storage is out of scope for this phase.

**Verdict**

Product-fit assignment:

- mcp-agent informs `services/api/app/launch/subscription_auth.py`.
- opencode informs `services/api/app/launch/provider_catalog.py` and `apps/web/src/features/agents/ProviderCredentialDialog.tsx`.
- sim informs encrypted credential vocabulary only.
- LibreChat informs test harness shape only.
- Do not adapt any external agent runtime loop, hosted provider service, or frontend design system.

Roadmap:

- First cut: provision port `8900`, create memory DB, register wrapper with port/nonce.
- Gate: test proves `8900` cannot read/write `8901` memory through MCP.
- Next wave: provider auth adapters, frontend launcher, browser-to-chat flow.

Hard invariants:

1. One shared MCP bridge, not one MCP install per agent.
2. Port is the durable identity anchor.
3. Per-agent individual memory is file-isolated by port in this phase.
4. API keys/tokens never persist plaintext.
5. No fallback memory path: unknown port/token means deny.

---

## Manifest

### Platform API

This feature does not use `services/platform-api`. The owned runtime seam is kai-chattr's FastAPI service under `services/api/app`.

| Verb | Path | Action | Status |
|---|---|---|---|
| GET | `/api/launchers/profiles` | List legacy launcher profiles | Existing - keep but do not use as the new product surface |
| GET | `/api/launchers/providers` | List supported providers and auth modes | New |
| GET | `/api/launchers/ports` | List predefined identity port pool and state | New |
| POST | `/api/launchers/ports/provision` | Reserve/provision one agent port and memory DB | New |
| GET | `/api/launchers/agents/{agent_port}` | Read provisioned agent state | New |
| POST | `/api/launchers/agents/{agent_port}/api-key` | Save encrypted API key credential for the agent/provider | New |
| POST | `/api/launchers/agents/{agent_port}/subscription/start` | Start subscription auth flow | New |
| GET | `/api/launchers/agents/{agent_port}/subscription/status` | Poll subscription auth verification | New |
| POST | `/api/launchers/agents/{agent_port}/start` | Start the wrapper for the provisioned agent | New |
| POST | `/api/launchers/agents/{agent_port}/stop` | Stop the process owned by the provisioned agent | New |
| POST | `/api/register` | Register wrapper identity | Existing - modify to require port/nonce for launcher-created agents |
| POST | `/api/heartbeat/{agent_name}` | Keep presence and process state alive | Existing - modify response to include `agent_port` when bound |
| POST | `/api/deregister/{name}` | Deregister wrapper | Existing - modify to release process state while preserving port profile/memory |
| GET | `/api/mcp/tools` | Read MCP tool manifest | Existing - include new memory tools |

#### New Endpoint Contracts

`GET /api/launchers/providers`

- Auth: existing local Chattr session token.
- Request: no body.
- Response:

```json
{
  "providers": [
    {
      "provider_id": "claude",
      "display_name": "Claude",
      "runtime_kind": "cli",
      "auth_modes": ["subscription", "api_key"],
      "subscription_strategy": "cli_browser",
      "api_key_env": "ANTHROPIC_API_KEY",
      "launcher_profile_id": "agent.claude"
    }
  ]
}
```

- Touches: `services/api/app/launch/providers.toml`, `provider_catalog.py`.

`GET /api/launchers/ports`

- Auth: existing local Chattr session token.
- Request: no body.
- Response:

```json
{
  "range": { "start": 8900, "end": 8910 },
  "ports": [
    {
      "agent_port": 8900,
      "state": "available",
      "provider_id": null,
      "profile_name": null,
      "memory_path": "data/agents/8900/memory.sqlite",
      "pid": null,
      "last_seen_at": null
    }
  ]
}
```

- Touches: `data/launcher/registry.sqlite`, `data/agents/{port}/memory.sqlite`.

`POST /api/launchers/ports/provision`

- Auth: existing local Chattr session token; loopback only for actual provision writes.
- Request:

```json
{
  "provider_id": "codex",
  "auth_mode": "subscription",
  "desired_port": 8900,
  "profile": {
    "name": "codex-reviewer",
    "role": "implementation reviewer",
    "position": "Reviewer 1",
    "purpose": "Review implementation tracker changes before merge",
    "instructions": "Focus on plan conformance and hidden regressions."
  }
}
```

- Response:

```json
{
  "agent_port": 8900,
  "state": "provisioned",
  "provider_id": "codex",
  "auth_mode": "subscription",
  "memory_path": "data/agents/8900/memory.sqlite",
  "profile_saved": true,
  "next_action": "subscription_start"
}
```

- Touches: port allocator, control registry, per-port memory DB, profile table.
- Rules:
  - `desired_port` is optional. If provided, it must be inside the configured range and available.
  - The backend, not the frontend, chooses the actual port when `desired_port` is absent.
  - Provisioning is idempotent only for the same port/profile hash before launch; profile changes after launch require explicit update endpoint in a later plan.

`GET /api/launchers/agents/{agent_port}`

- Auth: existing local Chattr session token.
- Request: path param `agent_port`.
- Response:

```json
{
  "agent_port": 8900,
  "state": "running",
  "provider_id": "codex",
  "auth_mode": "subscription",
  "profile": {
    "name": "codex-reviewer",
    "role": "implementation reviewer",
    "position": "Reviewer 1",
    "purpose": "Review implementation tracker changes before merge"
  },
  "credential_status": "verified",
  "pid": 12345,
  "registered_name": "codex-reviewer",
  "mcp_proxy_url": "http://127.0.0.1:8900/mcp",
  "last_seen_at": "2026-06-05T12:00:00Z"
}
```

- Touches: control registry and runtime registry.

`POST /api/launchers/agents/{agent_port}/api-key`

- Auth: existing local Chattr session token; loopback only.
- Request:

```json
{
  "provider_id": "gemini",
  "api_key": "client-submitted-secret"
}
```

- Response:

```json
{
  "agent_port": 8900,
  "provider_id": "gemini",
  "credential_status": "stored",
  "stored_secret": false
}
```

- Touches: encrypted credential store only; never writes plaintext to logs, traces, metrics, profile JSON, or SQLite memory rows.
- Rule: if server-side encryption key is unavailable, return `503 credential_encryption_unavailable`. No plaintext fallback.

`POST /api/launchers/agents/{agent_port}/subscription/start`

- Auth: existing local Chattr session token; loopback only.
- Request:

```json
{
  "provider_id": "claude",
  "strategy": "cli_browser"
}
```

- Response:

```json
{
  "agent_port": 8900,
  "provider_id": "claude",
  "flow_id": "auth_01h...",
  "status": "browser_opened",
  "manual_url": null,
  "expires_in_seconds": 300
}
```

- Touches: subscription auth adapter, provider catalog, encrypted credential store if tokens are captured.
- Rules:
  - `cli_browser` may delegate browser opening to the provider CLI if the CLI owns login.
  - `oauth_loopback` may use a backend loopback listener adapted from mcp-agent.
  - Provider-specific CLI auth commands must be verified before adding provider entries.
  - The flow may not complete by storing secrets in browser localStorage as the Chattr source of truth.

`GET /api/launchers/agents/{agent_port}/subscription/status?flow_id=...`

- Auth: existing local Chattr session token.
- Response:

```json
{
  "agent_port": 8900,
  "flow_id": "auth_01h...",
  "status": "pending",
  "verified": false,
  "detail": "waiting_for_provider"
}
```

- Touches: subscription auth adapter state.

`POST /api/launchers/agents/{agent_port}/start`

- Auth: existing local Chattr session token; loopback only.
- Request:

```json
{
  "confirm_risky": false
}
```

- Response:

```json
{
  "agent_port": 8900,
  "accepted": true,
  "pid": 12345,
  "launch_nonce": "nonce_01h...",
  "mcp_proxy_port": 8900,
  "detail": "process started"
}
```

- Touches: process registry, wrapper env, `McpIdentityProxy(port=agent_port)`.
- Rule: start fails unless the port is provisioned and required auth status is satisfied for the selected auth mode.

`POST /api/launchers/agents/{agent_port}/stop`

- Auth: existing local Chattr session token; loopback only.
- Request:

```json
{
  "reason": "user_requested"
}
```

- Response:

```json
{
  "agent_port": 8900,
  "accepted": true,
  "pid": 12345,
  "state": "stopped"
}
```

- Touches: process registry.
- Rule: stopping a process does not delete profile or memory.

#### Modified Endpoint Contracts

`POST /api/register`

- Change: accept and validate `agent_port` and `launch_nonce`.
- Request after change:

```json
{
  "base": "codex",
  "label": "codex-reviewer",
  "agent_port": 8900,
  "launch_nonce": "nonce_01h..."
}
```

- Response after change:

```json
{
  "name": "codex-reviewer",
  "base": "codex",
  "slot": 1,
  "label": "codex-reviewer",
  "token": "server-issued-token",
  "agent_port": 8900,
  "memory_scope": "agent-port:8900"
}
```

- Why: the token issued by registration is the only acceptable bridge from MCP calls to per-port memory.
- No fallback: a launcher-started agent without a valid port/nonce is rejected.

`POST /api/heartbeat/{agent_name}`

- Change: include `agent_port` in response for authenticated bound agents.
- Why: wrapper and frontend need to verify that runtime identity did not detach from port identity.

`POST /api/deregister/{name}`

- Change: mark runtime process stopped and clear token binding, but do not delete `data/agents/{port}/memory.sqlite`.
- Why: stopping a session must not erase durable identity memory.

`GET /api/mcp/tools`

- Change: manifest includes individual memory tools and makes their identity requirement visible.
- Why: agents need discoverable memory tools, but the scope remains server-resolved.

### MCP Tool Surface

New tools are registered on the existing Chattr MCP bridge, not by installing another MCP.

| Tool | Purpose | Identity Required | User-Supplied Scope Allowed? |
|---|---|---|---|
| `memory_profile_read` | Read caller port's profile | Yes | No |
| `memory_item_append` | Append a memory item to caller port DB | Yes | No |
| `memory_item_search` | Search caller port memory | Yes | No |
| `memory_item_list` | List recent caller port memory | Yes | No |
| `memory_item_update` | Update caller-owned item metadata | Yes | No |
| `collective_memory_search` | Query collective Hindsight memory | Yes | No local DB scope |

Required resolver shape:

```python
def resolve_agent_memory_scope(ctx: Context) -> AgentMemoryScope:
    token = extract_agent_token(ctx)
    instance = registry.resolve_token(token)
    if not instance or not instance.get("agent_port"):
        raise MemoryScopeDenied("authenticated port-bound agent required")
    return memory_store.scope_for_port(instance["agent_port"])
```

Forbidden tool input fields:

- `agent_port`
- `memory_path`
- `db_path`
- `table`
- `scope`

Any future tool that accepts one of these fields violates this plan.

### Observability

The current backend owns JSONL OpenTelemetry exporters in `services/api/app/observability/runtime.py`. This feature adds launcher and memory observability to the same exporter model.

| Type | Name | Where | Purpose |
|---|---|---|---|
| Trace span | `launcher.provider.list` | `routes/agent_launcher.py:get_providers` | Track provider catalog reads |
| Trace span | `launcher.ports.list` | `routes/agent_launcher.py:get_ports` | Track port pool reads |
| Trace span | `launcher.port.provision` | `routes/agent_launcher.py:provision_port` | Measure provision latency and failures |
| Trace span | `launcher.credential.api_key.store` | `routes/agent_launcher.py:save_api_key` | Verify encrypted credential write path |
| Trace span | `launcher.subscription.start` | `routes/agent_launcher.py:start_subscription` | Track browser/subscription auth start |
| Trace span | `launcher.subscription.status` | `routes/agent_launcher.py:get_subscription_status` | Track auth polling |
| Trace span | `launcher.agent.start` | `routes/agent_launcher.py:start_agent` | Track process launch |
| Trace span | `launcher.agent.stop` | `routes/agent_launcher.py:stop_agent` | Track process stop |
| Trace span | `launcher.agent.register_bind` | `main.py:register_agent` | Track wrapper token binding to port |
| Trace span | `memory.sqlite.provision` | `memory/provisioning.py:provision_memory_store` | Track per-port DB creation |
| Trace span | `memory.scope.resolve` | `mcp/agent_memory_tools.py:resolve_agent_memory_scope` | Track allowed/denied memory scope resolution |
| Trace span | `memory.item.append` | `mcp/agent_memory_tools.py:memory_item_append` | Track memory writes without recording content |
| Trace span | `memory.item.search` | `mcp/agent_memory_tools.py:memory_item_search` | Track memory searches without recording query text |
| Metric | `chattr.launcher.port.provision.count` | `provision_port` | Count provision attempts by result |
| Metric | `chattr.launcher.agent.start.count` | `start_agent` | Count launch attempts by provider/result |
| Metric | `chattr.launcher.agent.stop.count` | `stop_agent` | Count stop attempts by result |
| Metric | `chattr.launcher.auth.count` | auth endpoints | Count subscription/API-key auth events by result |
| Metric | `chattr.memory.scope.denied.count` | memory resolver | Count memory scope denials |
| Metric | `chattr.memory.item.write.count` | memory append/update | Count memory writes |
| Metric | `chattr.memory.item.search.count` | memory search/list | Count memory reads |
| Histogram | `chattr.launcher.port.provision.duration_ms` | `provision_port` | Provision latency |
| Histogram | `chattr.launcher.agent.start.duration_ms` | `start_agent` | Launch latency |
| Histogram | `chattr.memory.item.search.duration_ms` | memory search | Memory search latency |
| Structured log | `launcher.port.provisioned` | `provision_port` | Audit port/profile creation without secrets |
| Structured log | `launcher.agent.started` | `start_agent` | Audit process start |
| Structured log | `launcher.agent.stopped` | `stop_agent` | Audit process stop |
| Structured log | `launcher.credential.stored` | `save_api_key` | Audit encrypted credential save without secret |
| Structured log | `launcher.subscription.completed` | subscription adapter | Audit verified subscription flow |
| Structured log | `memory.scope.denied` | memory resolver | Audit blocked cross-scope/unknown-token access |

Observability attribute rules:

- Allowed attributes: `agent_port`, `provider_id`, `auth_mode`, `runtime_kind`, `result`, `status`, `http.status_code`, `state`, `has_profile`, `has_process`, `memory.operation`, `credential.kind`, `subscription.strategy`.
- Forbidden attributes: `api_key`, `token`, `secret`, `credential_value`, `authorization_url`, `oauth_code`, `refresh_token`, `access_token`, `memory_text`, `memory_query`, `profile.instructions`, raw command argv, raw env, cwd outside a coarse boolean.
- Existing `validate_attrs()` forbidden keys must be extended if any new forbidden names are missing.
- Structured logs may include `agent_port`, `provider_id`, and profile `name`; they must not include API keys, OAuth tokens, prompts, memory text, or browser callback URLs.

### Database Migrations

No Supabase, Neon, or Postgres migrations in this phase.

New local SQLite schema assets:

| File | Creates/Alters | Affects Existing Data? |
|---|---|---|
| `services/api/app/memory/schema.sql` | Per-port `schema_version`, `agent_profile`, `memory_items`, `memory_events` tables in each `data/agents/{port}/memory.sqlite` | No. New files only. |
| `services/api/app/identity/registry_schema.sql` | Control `agent_ports`, `agent_processes`, `auth_flows` tables in `data/launcher/registry.sqlite` | No. New file only. |

Per-port memory schema:

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS agent_profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  agent_port INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('subscription', 'api_key')),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  purpose TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS memory_items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL DEFAULT 'note',
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL,
  tags_json TEXT NOT NULL DEFAULT '[]',
  source TEXT NOT NULL DEFAULT 'agent',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS memory_events (
  id TEXT PRIMARY KEY,
  memory_item_id TEXT,
  event_type TEXT NOT NULL,
  actor_name TEXT NOT NULL DEFAULT '',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(memory_item_id) REFERENCES memory_items(id)
);
```

Control registry schema:

```sql
CREATE TABLE IF NOT EXISTS agent_ports (
  agent_port INTEGER PRIMARY KEY,
  state TEXT NOT NULL CHECK (state IN (
    'available', 'provisioned', 'auth_pending', 'ready', 'running', 'stopped', 'error'
  )),
  provider_id TEXT,
  auth_mode TEXT,
  profile_name TEXT,
  memory_path TEXT NOT NULL,
  credential_ref TEXT,
  launch_nonce_hash TEXT,
  registered_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS agent_processes (
  agent_port INTEGER PRIMARY KEY,
  pid INTEGER,
  started_at TEXT,
  stopped_at TEXT,
  exit_code INTEGER,
  state TEXT NOT NULL,
  FOREIGN KEY(agent_port) REFERENCES agent_ports(agent_port)
);

CREATE TABLE IF NOT EXISTS auth_flows (
  flow_id TEXT PRIMARY KEY,
  agent_port INTEGER NOT NULL,
  provider_id TEXT NOT NULL,
  strategy TEXT NOT NULL,
  state TEXT NOT NULL,
  verifier_ref TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT NOT NULL,
  FOREIGN KEY(agent_port) REFERENCES agent_ports(agent_port)
);
```

### Edge Functions

No edge functions created or modified.

This feature stays in the local kai-chattr FastAPI service. Cloudflare Pages deployment is not the launcher runtime authority.

### Frontend Surface Area

**New pages/routes:** `2`

| Route | File | Purpose |
|---|---|---|
| Launcher | `apps/web/src/features/agents/AgentLauncherPage.tsx` | Create/provision/start agents from the browser |
| Chat | `apps/web/src/features/chat/ChatPage.tsx` | Operational chat page after an agent is started or selected |

**New frontend components:** `7`

| Component | File | Uses |
|---|---|---|
| `AgentPortPoolTable` | `apps/web/src/features/agents/AgentPortPoolTable.tsx` | shadcn `Table`, `Badge`, `Button`, `Tooltip` |
| `AgentProfileForm` | `apps/web/src/features/agents/AgentProfileForm.tsx` | shadcn `Input`, `Textarea`, `Select`, `Button`, `Label` |
| `ProviderModeSelector` | `apps/web/src/features/agents/ProviderModeSelector.tsx` | shadcn `Tabs`, `Card`, `Badge` |
| `ProviderCredentialDialog` | `apps/web/src/features/agents/ProviderCredentialDialog.tsx` | shadcn `Dialog`, `Input`, `Button`; no localStorage secrets |
| `SubscriptionAuthDialog` | `apps/web/src/features/agents/SubscriptionAuthDialog.tsx` | shadcn `Dialog`, `Progress`, `Button`; polls auth status |
| `AgentRuntimeStatusPanel` | `apps/web/src/features/agents/AgentRuntimeStatusPanel.tsx` | shadcn `Card`, `Badge`, `Button` |
| `ChatComposer` | `apps/web/src/features/chat/ChatComposer.tsx` | Vercel AI Elements `PromptInput*` from `components/ai-elements/prompt-input.tsx` |

**New frontend API libs/hooks:** `4`

| File | Purpose |
|---|---|
| `apps/web/src/lib/api/client.ts` | Shared fetch wrapper with session token behavior |
| `apps/web/src/lib/api/launcher.ts` | Provider/port/provision/start/stop/auth calls |
| `apps/web/src/lib/api/chat.ts` | Chat read/send calls for chat page |
| `apps/web/src/features/agents/useLauncherState.ts` | React Query orchestration for providers, ports, agent state |

**Modified frontend files:** `4`

| File | What changes |
|---|---|
| `apps/web/src/App.tsx` | Replace placeholder card with routed launcher/chat shell |
| `apps/web/src/main.tsx` | Mount router/query provider if not already mounted |
| `apps/web/src/styles.css` | Add page layout tokens only if required by shadcn/Vercel components |
| `apps/web/package.json` | Only if a verified source component requires an additional dependency |

Frontend design requirements:

- First viewport is the launcher, not a landing page.
- Layout: left port pool/table, center provision form, right runtime/auth status rail on desktop; stacked panels on mobile.
- The port pool table is the source of visible truth: port, provider, profile name, auth status, runtime state, memory status.
- Creating an agent uses a guided form:
  1. choose provider,
  2. choose `subscription` or `api_key`,
  3. enter profile details,
  4. reserve/provision port,
  5. complete auth,
  6. start process,
  7. enter chat.
- API key entry is a modal/dialog. It never stores the key in frontend state beyond the controlled input and submit lifecycle.
- Subscription auth dialog shows the backend-reported status and manual URL only when the backend returns one.
- Chat composer must use the Vercel AI Elements prompt input source already present in `apps/web/src/components/ai-elements/prompt-input.tsx`.
- No handrolled table, dialog, select, input, prompt composer, or terminal stand-ins when shadcn/Vercel source components exist.

### Backend Surface Area

**New backend modules:** `16`

| File | Purpose |
|---|---|
| `services/api/app/identity/__init__.py` | Identity package marker |
| `services/api/app/identity/models.py` | `AgentPortRecord`, `AgentProfile`, `AgentProcessRecord`, `AuthFlowRecord` |
| `services/api/app/identity/port_allocator.py` | Range validation, availability, reservation |
| `services/api/app/identity/registry_schema.sql` | Control registry schema |
| `services/api/app/identity/registry_store.py` | SQLite control registry store |
| `services/api/app/memory/__init__.py` | Memory package marker |
| `services/api/app/memory/schema.sql` | Per-port memory DB schema |
| `services/api/app/memory/sqlite_store.py` | Per-port memory CRUD/search |
| `services/api/app/memory/provisioning.py` | Pre-create memory DB and write profile |
| `services/api/app/credentials/__init__.py` | Credential package marker |
| `services/api/app/credentials/encrypted_store.py` | Server-side encrypted credential persistence |
| `services/api/app/launch/providers.toml` | Provider catalog and auth strategies |
| `services/api/app/launch/provider_catalog.py` | Typed provider catalog loader |
| `services/api/app/launch/processes.py` | Process ownership/status/stop model |
| `services/api/app/launch/subscription_auth.py` | Subscription/browser auth orchestration |
| `services/api/app/routes/agent_launcher.py` | New port-backed launcher API routes |
| `services/api/app/mcp/agent_memory_tools.py` | MCP individual memory tool handlers |
| `services/api/scripts/provision_agent_ports.py` | Manual pre-provision script |

**Modified backend files:** `8`

| File | What changes |
|---|---|
| `services/api/config.toml` | Add `[agent_ports]`, `[agent_memory]`, `[credentials]` defaults |
| `services/api/app/config.py` | Load and env-override new config sections |
| `services/api/app/main.py` | Mount `agent_launcher` router; require port/nonce in registration; include `agent_port` in heartbeat |
| `services/api/app/runtime/registry.py` | Add port/token binding fields and lookup helpers |
| `services/api/app/mcp/bridge.py` | Register memory tools and scope resolver |
| `services/api/app/mcp/proxy.py` | Ensure fixed port path is tested and failure is explicit |
| `services/api/app/wrappers/cli.py` | Accept/pass `--agent-port`, `--launch-nonce`, `CHATTR_AGENT_PORT`, fixed proxy port |
| `services/api/app/wrappers/api.py` | Same port/nonce/profile/env binding for API agents |
| `services/api/pyproject.toml` | Add dependency only if credential encryption uses non-stdlib crypto |

Config snippet:

```toml
[agent_ports]
start = 8900
end = 8910
bind_host = "127.0.0.1"

[agent_memory]
root_dir = "./data/agents"
filename = "memory.sqlite"
preprovision = true

[credentials]
store_dir = "./data/credentials"
encryption_key_env = "CHATTR_CREDENTIALS_KEY_B64"

[launcher_auth]
subscription_timeout_seconds = 300
oauth_loopback_ports = [8940, 8941, 8942]
```

Provider catalog snippet:

```toml
[providers.claude]
display_name = "Claude"
runtime_kind = "cli"
launcher_profile_id = "agent.claude"
auth_modes = ["subscription", "api_key"]
subscription_strategy = "cli_browser"
api_key_env = "ANTHROPIC_API_KEY"

[providers.codex]
display_name = "Codex"
runtime_kind = "cli"
launcher_profile_id = "agent.codex"
auth_modes = ["subscription", "api_key"]
subscription_strategy = "cli_browser"
api_key_env = "OPENAI_API_KEY"

[providers.gemini]
display_name = "Gemini"
runtime_kind = "cli"
launcher_profile_id = "agent.gemini"
auth_modes = ["subscription", "api_key"]
subscription_strategy = "cli_browser"
api_key_env = "GEMINI_API_KEY"
```

Model snippet:

```python
from pydantic import BaseModel, Field

class AgentProfile(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    role: str = Field(default="", max_length=120)
    position: str = Field(default="", max_length=120)
    purpose: str = Field(default="", max_length=500)
    instructions: str = Field(default="", max_length=2000)

class ProvisionAgentRequest(BaseModel):
    provider_id: str
    auth_mode: str
    desired_port: int | None = None
    profile: AgentProfile

class AgentPortRecord(BaseModel):
    agent_port: int
    state: str
    provider_id: str | None = None
    auth_mode: str | None = None
    profile_name: str | None = None
    memory_path: str
    credential_ref: str | None = None
    registered_name: str | None = None
    pid: int | None = None
```

### Documentation Surface Area

**New docs:** `2`

| File | Purpose |
|---|---|
| `docs/plans/agent-port-identity-launcher-memory-implementation-plan.md` | This canonical implementation plan |
| `docs/adr/0002-port-scoped-agent-identity-memory.md` | ADR amendment superseding ADR 0001 D5 for this slice |

**Modified docs:** `1`

| File | What changes |
|---|---|
| `docs/adr/0001-agent-infrastructure.md` | Add note that D5 is superseded by ADR 0002 for launcher-backed port identity |

### Governance Surface Area

**Modified governance files:** `2`

| File | What changes |
|---|---|
| `governance/contracts/architecture.json` | Add any new backend dependency only after implementation confirms it is required |
| `governance/contracts/backend.json` | Add launcher/memory port contract if contract schema supports it |

No governance contract update is allowed merely to silence checks. The implementer must identify the specific dependency or backend rule being encoded.

---

## Pre-Implementation Contract

No major product, API, data, observability, frontend, provider-auth, or memory-scope decision may be improvised during implementation. If any item below needs to change, implementation must stop and this plan must be revised first.

---

## Locked Product Decisions

1. Predefined agent identity ports are `8900-8910` for this phase unless `services/api/config.toml` changes in the same implementation.
2. Port is the durable identity anchor. Agent name, profile role, process PID, token, and provider are attributes of the port-bound identity.
3. Each identity port owns one per-port SQLite memory file at `data/agents/{port}/memory.sqlite`.
4. The control registry may store port/process/profile metadata, but it must not store individual memory content.
5. One Chattr MCP bridge remains the only MCP surface for agents. Do not install or run one MCP per agent.
6. MCP individual memory tools resolve the memory scope from authenticated token to registered instance to agent port. The agent cannot provide port/path/table/scope.
7. Hindsight remains the collective memory provider. Individual SQLite memory does not replace Hindsight.
8. Subscription auth and API-key auth are backend-owned flows. The browser may display and submit, but it is never the credential source of truth.
9. API keys and OAuth tokens must be encrypted at rest using a server-side key loaded through SOPS-managed environment.
10. If encryption key is unavailable, API-key/token persistence fails closed. No plaintext or `.env.local` fallback.
11. Existing `agents.toml` profile whitelisting remains the safe command source. The new provider catalog maps provider IDs to whitelisted launcher profiles.
12. Existing terminal-wrapper execution remains. Do not adopt Letta's runtime loop or an external hosted agent runtime.
13. The frontend must use shadcn/ui source primitives and Vercel AI Elements / AI SDK React source components for AI/chat/workbench surfaces.
14. Legacy `E:/chattr/static` is behavior reference only, not a frontend design/component source.

---

## Locked Acceptance Contract

The implementation is complete only when all of the following are true:

1. `GET /api/launchers/ports` shows ports `8900-8910`.
2. A user can provision a Codex subscription agent from the browser without hand-editing files.
3. Provisioning port `8900` creates `data/agents/8900/memory.sqlite` with the locked schema and profile row.
4. Starting the agent launches the wrapper with `CHATTR_AGENT_PORT=8900` and a backend-generated launch nonce.
5. `/api/register` rejects the wrapper when the nonce is missing, invalid, expired, or mismatched to the port.
6. `/api/register` returns a token bound to `agent_port=8900` when the nonce is valid.
7. The MCP proxy for that agent binds to fixed port `8900` or fails explicitly if unavailable.
8. `memory_item_append` called by the `8900` agent writes only to `data/agents/8900/memory.sqlite`.
9. A token bound to `8900` cannot read or write `data/agents/8901/memory.sqlite`.
10. API-key mode stores provider keys encrypted server-side and never logs or traces the key.
11. Subscription mode opens or delegates to a browser verification flow and exposes pollable status in the launcher UI.
12. Stopping the agent terminates the owned process but leaves profile and memory DB intact.
13. The frontend first screen is the launcher, not a placeholder card or marketing page.
14. The chat page uses the Vercel AI Elements prompt input source component.
15. Backend tests, frontend build, and governance checks pass.

---

## Locked Platform API Surface

### New FastAPI endpoints: `9`

1. `GET /api/launchers/providers`
2. `GET /api/launchers/ports`
3. `POST /api/launchers/ports/provision`
4. `GET /api/launchers/agents/{agent_port}`
5. `POST /api/launchers/agents/{agent_port}/api-key`
6. `POST /api/launchers/agents/{agent_port}/subscription/start`
7. `GET /api/launchers/agents/{agent_port}/subscription/status`
8. `POST /api/launchers/agents/{agent_port}/start`
9. `POST /api/launchers/agents/{agent_port}/stop`

### Existing FastAPI endpoints modified: `4`

1. `POST /api/register`
2. `POST /api/heartbeat/{agent_name}`
3. `POST /api/deregister/{name}`
4. `GET /api/mcp/tools`

### Existing endpoints retained as compatibility shells: `4`

1. `GET /api/launchers/profiles`
2. `GET /api/launchers/status`
3. `POST /api/launchers/dry-run`
4. `POST /api/launchers/start`

Compatibility shell rule:

- These legacy endpoints may remain for tests and manual dry-runs, but they are not the product launcher surface.
- They must not provide individual memory access.
- They must not launch a port-backed agent without going through the new provision/start path.

---

## Locked Observability Surface

### New traces: `13`

1. `launcher.provider.list`
2. `launcher.ports.list`
3. `launcher.port.provision`
4. `launcher.credential.api_key.store`
5. `launcher.subscription.start`
6. `launcher.subscription.status`
7. `launcher.agent.start`
8. `launcher.agent.stop`
9. `launcher.agent.register_bind`
10. `memory.sqlite.provision`
11. `memory.scope.resolve`
12. `memory.item.append`
13. `memory.item.search`

### New metrics: `7 counters`, `3 histograms`

Counters:

1. `chattr.launcher.port.provision.count`
2. `chattr.launcher.agent.start.count`
3. `chattr.launcher.agent.stop.count`
4. `chattr.launcher.auth.count`
5. `chattr.memory.scope.denied.count`
6. `chattr.memory.item.write.count`
7. `chattr.memory.item.search.count`

Histograms:

1. `chattr.launcher.port.provision.duration_ms`
2. `chattr.launcher.agent.start.duration_ms`
3. `chattr.memory.item.search.duration_ms`

### New structured logs: `6`

1. `launcher.port.provisioned`
2. `launcher.agent.started`
3. `launcher.agent.stopped`
4. `launcher.credential.stored`
5. `launcher.subscription.completed`
6. `memory.scope.denied`

### Attribute Rules

Allowed:

- `agent_port`
- `provider_id`
- `auth_mode`
- `runtime_kind`
- `result`
- `status`
- `http.status_code`
- `state`
- `has_profile`
- `has_process`
- `memory.operation`
- `credential.kind`
- `subscription.strategy`

Forbidden:

- API keys
- bearer tokens
- OAuth access/refresh tokens
- OAuth codes
- launch nonce raw value
- authorization URLs
- raw profile instructions
- memory body text
- memory search query text
- command argv
- cwd path
- raw environment

---

## Locked Inventory Counts

### Backend

- New backend modules: `18`
- Modified backend files: `9`
- New backend test modules: `8`
- Modified backend test modules: `4`

### Frontend

- New pages/routes: `2`
- New components: `7`
- New API/hook files: `4`
- Modified frontend files: `4`

### Docs/Governance

- New docs: `2`
- Modified docs: `1`
- Modified governance files: `0-2`, only if dependency/rule additions are confirmed during implementation.

### Database

- New local SQLite schema files: `2`
- New Supabase/Postgres migrations: `0`

---

## Locked File Inventory

### New Files

- `docs/plans/agent-port-identity-launcher-memory-implementation-plan.md`
- `docs/adr/0002-port-scoped-agent-identity-memory.md`
- `services/api/app/identity/__init__.py`
- `services/api/app/identity/models.py`
- `services/api/app/identity/port_allocator.py`
- `services/api/app/identity/registry_schema.sql`
- `services/api/app/identity/registry_store.py`
- `services/api/app/memory/__init__.py`
- `services/api/app/memory/schema.sql`
- `services/api/app/memory/sqlite_store.py`
- `services/api/app/memory/provisioning.py`
- `services/api/app/credentials/__init__.py`
- `services/api/app/credentials/encrypted_store.py`
- `services/api/app/launch/providers.toml`
- `services/api/app/launch/provider_catalog.py`
- `services/api/app/launch/processes.py`
- `services/api/app/launch/subscription_auth.py`
- `services/api/app/routes/agent_launcher.py`
- `services/api/app/mcp/agent_memory_tools.py`
- `services/api/scripts/provision_agent_ports.py`
- `services/api/tests/test_agent_port_allocator.py`
- `services/api/tests/test_agent_memory_sqlite.py`
- `services/api/tests/test_launcher_agent_api.py`
- `services/api/tests/test_register_agent_port_binding.py`
- `services/api/tests/test_mcp_individual_memory_scope.py`
- `services/api/tests/test_provider_credentials.py`
- `services/api/tests/test_subscription_auth_flow.py`
- `services/api/tests/test_launcher_observability.py`
- `apps/web/src/features/agents/AgentLauncherPage.tsx`
- `apps/web/src/features/agents/AgentPortPoolTable.tsx`
- `apps/web/src/features/agents/AgentProfileForm.tsx`
- `apps/web/src/features/agents/ProviderModeSelector.tsx`
- `apps/web/src/features/agents/ProviderCredentialDialog.tsx`
- `apps/web/src/features/agents/SubscriptionAuthDialog.tsx`
- `apps/web/src/features/agents/AgentRuntimeStatusPanel.tsx`
- `apps/web/src/features/agents/useLauncherState.ts`
- `apps/web/src/features/chat/ChatPage.tsx`
- `apps/web/src/features/chat/ChatComposer.tsx`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/api/launcher.ts`
- `apps/web/src/lib/api/chat.ts`

### Modified Files

- `docs/adr/0001-agent-infrastructure.md`
- `services/api/config.toml`
- `services/api/app/config.py`
- `services/api/app/main.py`
- `services/api/app/runtime/registry.py`
- `services/api/app/mcp/bridge.py`
- `services/api/app/mcp/proxy.py`
- `services/api/app/wrappers/cli.py`
- `services/api/app/wrappers/api.py`
- `services/api/app/observability/runtime.py`
- `services/api/pyproject.toml`
- `services/api/tests/test_chattr_launcher.py`
- `services/api/tests/test_launcher_control_api.py`
- `services/api/tests/test_wrapper_mcp_config.py`
- `services/api/tests/test_runtime_observability.py`
- `apps/web/src/App.tsx`
- `apps/web/src/main.tsx`
- `apps/web/src/styles.css`
- `apps/web/package.json`
- `governance/contracts/architecture.json` only if new dependency is required
- `governance/contracts/backend.json` only if backend contract needs launcher-memory rule

### Deleted Files

No files are deleted in this implementation.

Cleanup is deferred until after the port-backed launcher is verified. Deleting legacy launcher endpoints, old placeholder routes, or old docs requires a separate cleanup request.

---

## Frozen Port Identity Contract

Port identity is not a display choice. It is the resource boundary.

```text
agent_port = identity anchor
agent_port -> profile
agent_port -> encrypted credential ref
agent_port -> memory.sqlite
agent_port -> process
agent_port -> MCP proxy port
agent_port -> registered runtime token
```

Rules:

1. Only predefined configured ports can become agent identities.
2. The backend allocates ports. The frontend may request a desired port but cannot force it.
3. The port allocator must lock around reservation/start to prevent two agents from receiving the same port.
4. The launch nonce binds one process start to one port.
5. Registration token binds one running wrapper to one port.
6. MCP memory tools bind one token to one port.
7. No API accepts a memory path from the browser or agent.
8. No MCP tool accepts `agent_port` as input.
9. Stopping a process releases runtime occupancy but not durable identity/profile/memory.
10. Deleting an agent identity is out of scope for this plan.

---

## Frozen Credential Contract

Credential handling must fail closed.

1. Browser API key entry posts the key once to the local FastAPI service.
2. FastAPI encrypts the key using `CHATTR_CREDENTIALS_KEY_B64`.
3. The encrypted credential is stored under `data/credentials/`.
4. The per-port control registry stores only a credential reference.
5. The per-port memory DB does not store provider API keys or OAuth tokens.
6. Logs/traces/metrics never include credential values.
7. If `CHATTR_CREDENTIALS_KEY_B64` is missing, malformed, or unavailable, API-key and token storage endpoints return `503`.
8. The implementation must not write API keys to `.env.local`, plaintext JSON, frontend localStorage, sessionStorage, or URL query strings.

Encryption implementation decision:

- Prefer Python `cryptography` AES-GCM/Fernet with a SOPS-provided key if `cryptography` is accepted into governance.
- If governance rejects `cryptography`, stop and revise this plan. Do not implement custom encryption.

---

## Frozen Provider Auth Contract

Provider subscription auth is adapter-based because Claude, Codex, and Gemini do not all expose the same auth mechanism.

Allowed strategies:

1. `cli_browser`: the provider CLI owns login and browser opening; Chattr launches the provider auth/start command and verifies by successful wrapper registration/heartbeat.
2. `oauth_loopback`: Chattr owns a short-lived loopback listener and opens a provider authorization URL; adapted from mcp-agent.
3. `manual_url`: backend returns a manual URL generated by a provider adapter and polls/callbacks for completion.

Forbidden strategies:

1. Pretending a provider supports OAuth when only its CLI supports subscription login.
2. Storing browser auth state as Chattr's source of truth.
3. Treating "process started" as "auth verified" unless wrapper registration and heartbeat succeed.
4. Falling back to API key mode when subscription auth fails unless the user explicitly selects API-key mode.

Provider verification requirement:

- Before implementing a provider strategy entry, the implementer must verify the exact local CLI behavior for Claude, Codex, and Gemini on this machine.
- If an exact login command cannot be verified, mark that provider strategy as `unavailable` in `providers.toml` and expose that status in the UI.

---

## Explicit Risks Accepted In This Plan

1. The plan supersedes ADR 0001 D5 for this slice. That is intentional and must be documented in ADR 0002.
2. Per-port SQLite files increase file count and provisioning work. This is accepted because port isolation is the product requirement.
3. SQLite file isolation does not provide OS-level sandboxing. The enforcement boundary is backend path resolution plus token-to-port scoping.
4. Subscription auth for provider CLIs may vary by installed CLI version. The plan requires provider verification before enabling each strategy.
5. The current `services/api` implementation is untracked. The implementer must work carefully with the dirty tree and not revert unrelated changes.
6. Credential encryption depends on a SOPS-injected key. If that key is unavailable, API-key persistence is blocked, not downgraded.
7. Hindsight integration is kept as collective memory but is not implemented inside the per-port SQLite DB.

---

## Implementation Tasks

### Task 1: Write ADR amendment for port-scoped identity

**File(s):** `docs/adr/0002-port-scoped-agent-identity-memory.md`, `docs/adr/0001-agent-infrastructure.md`

**Step 1:** Create ADR 0002 declaring that this launcher slice uses predefined port-scoped identity and per-port SQLite memory files.

**Step 2:** State explicitly that ADR 0002 supersedes ADR 0001 D5 for launcher-backed agents.

**Step 3:** Add a short note to ADR 0001 D5 pointing to ADR 0002.

**Test command:** `git diff -- docs/adr/0001-agent-infrastructure.md docs/adr/0002-port-scoped-agent-identity-memory.md`

**Expected output:** Diff shows one new ADR and one cross-reference note only.

**Commit:** `docs: lock port-scoped agent identity decision`

### Task 2: Add failing port allocator tests

**File(s):** `services/api/tests/test_agent_port_allocator.py`

**Step 1:** Add tests for configured range `8900-8910`.

**Step 2:** Test first available allocation, desired-port allocation, out-of-range rejection, duplicate reservation rejection, and release-to-stopped behavior.

**Step 3:** Test that unavailable OS-bound port fails explicitly.

**Test command:** `cd services/api; uv run pytest tests/test_agent_port_allocator.py`

**Expected output:** Tests fail because `app.identity.port_allocator` does not exist yet.

**Commit:** none until implementation passes.

### Task 3: Implement identity models and port allocator

**File(s):** `services/api/app/identity/models.py`, `services/api/app/identity/port_allocator.py`, `services/api/app/identity/__init__.py`

**Step 1:** Add `AgentProfile`, `AgentPortRecord`, `AgentProcessRecord`, and `AuthFlowRecord` models.

**Step 2:** Implement range validation and desired-port reservation.

**Step 3:** Implement OS bind check for fixed proxy port availability.

**Test command:** `cd services/api; uv run pytest tests/test_agent_port_allocator.py`

**Expected output:** `test_agent_port_allocator.py` passes.

**Commit:** `feat(api): add port identity allocator`

### Task 4: Add failing registry store tests

**File(s):** `services/api/tests/test_agent_port_allocator.py`

**Step 1:** Extend tests to cover durable registry persistence in temporary `registry.sqlite`.

**Step 2:** Test that a provisioned port survives store reload.

**Step 3:** Test that no memory body text is stored in the control registry.

**Test command:** `cd services/api; uv run pytest tests/test_agent_port_allocator.py`

**Expected output:** New registry-store tests fail because store/schema are missing.

**Commit:** none until implementation passes.

### Task 5: Implement control registry SQLite store

**File(s):** `services/api/app/identity/registry_schema.sql`, `services/api/app/identity/registry_store.py`

**Step 1:** Add the locked control registry schema.

**Step 2:** Implement open/init/upsert/read/list operations.

**Step 3:** Store launch nonce only as a hash.

**Test command:** `cd services/api; uv run pytest tests/test_agent_port_allocator.py`

**Expected output:** Port allocator and registry-store tests pass.

**Commit:** `feat(api): persist launcher port registry`

### Task 6: Add failing per-port memory tests

**File(s):** `services/api/tests/test_agent_memory_sqlite.py`

**Step 1:** Test provisioning creates `data/agents/8900/memory.sqlite`.

**Step 2:** Test profile row is written.

**Step 3:** Test appending/listing/searching memory items in port `8900`.

**Step 4:** Test opening port `8901` cannot see `8900` memory rows.

**Test command:** `cd services/api; uv run pytest tests/test_agent_memory_sqlite.py`

**Expected output:** Tests fail because memory modules are missing.

**Commit:** none until implementation passes.

### Task 7: Implement per-port memory store

**File(s):** `services/api/app/memory/schema.sql`, `services/api/app/memory/sqlite_store.py`, `services/api/app/memory/provisioning.py`, `services/api/app/memory/__init__.py`

**Step 1:** Add the locked per-port schema.

**Step 2:** Implement `provision_memory_store(root_dir, port, profile)`.

**Step 3:** Implement `append_item`, `list_items`, `search_items`, and `update_item`.

**Step 4:** Keep search simple with `LIKE` for this phase; FTS/vector search is out of scope.

**Test command:** `cd services/api; uv run pytest tests/test_agent_memory_sqlite.py`

**Expected output:** Per-port memory tests pass.

**Commit:** `feat(api): provision per-port sqlite memory`

### Task 8: Add failing provider catalog tests

**File(s):** `services/api/tests/test_launcher_agent_api.py`

**Step 1:** Test provider catalog exposes `claude`, `codex`, and `gemini`.

**Step 2:** Test each provider maps to an existing `agents.toml` launcher profile.

**Step 3:** Test unavailable provider IDs are rejected.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_agent_api.py`

**Expected output:** Tests fail because provider catalog is missing.

**Commit:** none until implementation passes.

### Task 9: Implement provider catalog

**File(s):** `services/api/app/launch/providers.toml`, `services/api/app/launch/provider_catalog.py`

**Step 1:** Add provider catalog entries for Claude, Codex, and Gemini.

**Step 2:** Implement loader that validates provider IDs, auth modes, runtime kind, strategy, and launcher profile existence.

**Step 3:** Mark provider strategies unavailable if exact local CLI auth behavior has not been verified.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_agent_api.py`

**Expected output:** Provider catalog tests pass.

**Commit:** `feat(api): add launcher provider catalog`

### Task 10: Add failing credential-store tests

**File(s):** `services/api/tests/test_provider_credentials.py`

**Step 1:** Test API key save fails with `503` when encryption key is missing.

**Step 2:** Test API key save writes encrypted data and never returns/stores plaintext.

**Step 3:** Test credential reference is associated with the agent port.

**Test command:** `cd services/api; uv run pytest tests/test_provider_credentials.py`

**Expected output:** Tests fail because credential store is missing.

**Commit:** none until implementation passes.

### Task 11: Implement encrypted credential store

**File(s):** `services/api/app/credentials/encrypted_store.py`, `services/api/app/credentials/__init__.py`, `services/api/pyproject.toml`, `governance/contracts/architecture.json`

**Step 1:** Confirm `CHATTR_CREDENTIALS_KEY_B64` availability through `WORKER-ACCESS.md`.

**Step 2:** If `cryptography` is required, add it to `pyproject.toml` and governance with a specific reason.

**Step 3:** Implement encrypt/decrypt/store/read helpers.

**Step 4:** Ensure no plaintext value is logged, traced, or written to SQLite.

**Test command:** `cd services/api; uv run pytest tests/test_provider_credentials.py`

**Expected output:** Credential tests pass.

**Commit:** `feat(api): add encrypted provider credential store`

### Task 12: Add failing launcher route tests

**File(s):** `services/api/tests/test_launcher_agent_api.py`

**Step 1:** Test `GET /api/launchers/providers`.

**Step 2:** Test `GET /api/launchers/ports`.

**Step 3:** Test `POST /api/launchers/ports/provision`.

**Step 4:** Test `GET /api/launchers/agents/{agent_port}`.

**Step 5:** Test loopback enforcement for write endpoints.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_agent_api.py`

**Expected output:** Route tests fail because `agent_launcher.py` is missing/not mounted.

**Commit:** none until implementation passes.

### Task 13: Implement port-backed launcher routes

**File(s):** `services/api/app/routes/agent_launcher.py`, `services/api/app/main.py`

**Step 1:** Add route module with locked endpoints.

**Step 2:** Mount route in `main.py`.

**Step 3:** Wire provider catalog, registry store, memory provisioning, and credential store.

**Step 4:** Keep legacy `routes/launchers.py` unchanged except where tests require compatibility.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_agent_api.py`

**Expected output:** Launcher route tests pass.

**Commit:** `feat(api): add port-backed launcher routes`

### Task 14: Add failing process ownership tests

**File(s):** `services/api/tests/test_launcher_agent_api.py`

**Step 1:** Test start records PID/state for a fake process.

**Step 2:** Test stop terminates only the owned PID.

**Step 3:** Test start fails if port is not provisioned, auth is missing, or proxy port is busy.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_agent_api.py`

**Expected output:** Process tests fail because `processes.py` is missing.

**Commit:** none until implementation passes.

### Task 15: Implement process ownership model

**File(s):** `services/api/app/launch/processes.py`, `services/api/app/routes/agent_launcher.py`

**Step 1:** Implement `start_agent_process(port_record)` with server-built argv/env only.

**Step 2:** Persist process state in control registry.

**Step 3:** Implement `stop_agent_process(agent_port)`.

**Step 4:** Reject raw command/cwd/env/args from browser requests.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_agent_api.py`

**Expected output:** Process ownership tests pass.

**Commit:** `feat(api): own launcher process lifecycle`

### Task 16: Add failing register port-binding tests

**File(s):** `services/api/tests/test_register_agent_port_binding.py`

**Step 1:** Test `/api/register` rejects missing `agent_port`.

**Step 2:** Test `/api/register` rejects missing/invalid `launch_nonce`.

**Step 3:** Test valid `agent_port + launch_nonce` returns token with `agent_port`.

**Step 4:** Test heartbeat includes `agent_port`.

**Test command:** `cd services/api; uv run pytest tests/test_register_agent_port_binding.py`

**Expected output:** Tests fail against current `register_agent`.

**Commit:** none until implementation passes.

### Task 17: Modify runtime registry and registration

**File(s):** `services/api/app/runtime/registry.py`, `services/api/app/main.py`

**Step 1:** Add `agent_port`, `memory_scope`, and launch binding fields to `Instance`.

**Step 2:** Add `register_bound(base, label, agent_port, launch_nonce)` or equivalent.

**Step 3:** Implement token-to-port lookup helper.

**Step 4:** Update heartbeat/deregister responses.

**Test command:** `cd services/api; uv run pytest tests/test_register_agent_port_binding.py tests/test_launcher_agent_api.py`

**Expected output:** Port-binding tests pass.

**Commit:** `feat(api): bind runtime tokens to agent ports`

### Task 18: Add failing wrapper/proxy tests

**File(s):** `services/api/tests/test_wrapper_mcp_config.py`

**Step 1:** Test CLI wrapper accepts `--agent-port` and `--launch-nonce`.

**Step 2:** Test wrapper starts `McpIdentityProxy(port=agent_port)`.

**Step 3:** Test fixed proxy port busy failure is explicit.

**Test command:** `cd services/api; uv run pytest tests/test_wrapper_mcp_config.py`

**Expected output:** Tests fail because wrapper does not pass fixed port.

**Commit:** none until implementation passes.

### Task 19: Modify wrappers and proxy binding

**File(s):** `services/api/app/wrappers/cli.py`, `services/api/app/wrappers/api.py`, `services/api/app/mcp/proxy.py`

**Step 1:** Add wrapper args and env support for agent port and launch nonce.

**Step 2:** Include port/nonce in registration body.

**Step 3:** Pass `port=agent_port` into `McpIdentityProxy`.

**Step 4:** Make proxy bind failure return false with clear error.

**Test command:** `cd services/api; uv run pytest tests/test_wrapper_mcp_config.py tests/test_register_agent_port_binding.py`

**Expected output:** Wrapper/proxy tests pass.

**Commit:** `feat(api): launch wrappers with fixed port identity`

### Task 20: Add failing MCP memory scope tests

**File(s):** `services/api/tests/test_mcp_individual_memory_scope.py`

**Step 1:** Test unauthenticated MCP memory call is denied.

**Step 2:** Test token bound to `8900` writes to `8900`.

**Step 3:** Test tool payload containing `agent_port` or `memory_path` is rejected.

**Step 4:** Test token bound to `8900` cannot read `8901`.

**Test command:** `cd services/api; uv run pytest tests/test_mcp_individual_memory_scope.py`

**Expected output:** Tests fail because memory tools are not registered.

**Commit:** none until implementation passes.

### Task 21: Implement MCP memory tools

**File(s):** `services/api/app/mcp/agent_memory_tools.py`, `services/api/app/mcp/bridge.py`

**Step 1:** Implement scope resolver.

**Step 2:** Implement `memory_profile_read`, `memory_item_append`, `memory_item_search`, `memory_item_list`, `memory_item_update`.

**Step 3:** Register tools in bridge manifest.

**Step 4:** Add `collective_memory_search` as a stub only if Hindsight connector is not available; otherwise wire to existing Hindsight connector. A stub must return explicit `not_configured`, not fake results.

**Test command:** `cd services/api; uv run pytest tests/test_mcp_individual_memory_scope.py tests/test_tool_registry.py`

**Expected output:** MCP memory scope tests pass.

**Commit:** `feat(api): expose port-scoped memory over shared mcp`

### Task 22: Add failing subscription auth tests

**File(s):** `services/api/tests/test_subscription_auth_flow.py`

**Step 1:** Add fake provider adapter for `oauth_loopback`.

**Step 2:** Test flow start creates flow record and returns status.

**Step 3:** Test callback/status completion marks credential verified.

**Step 4:** Test expired flow fails closed.

**Test command:** `cd services/api; uv run pytest tests/test_subscription_auth_flow.py`

**Expected output:** Tests fail because subscription auth module is incomplete.

**Commit:** none until implementation passes.

### Task 23: Implement subscription auth adapters

**File(s):** `services/api/app/launch/subscription_auth.py`, `services/api/app/routes/agent_launcher.py`

**Step 1:** Implement `cli_browser` adapter with explicit provider verification result.

**Step 2:** Implement `oauth_loopback` adapter using mcp-agent-inspired control flow.

**Step 3:** Store tokens encrypted if tokens are captured.

**Step 4:** Do not enable a real provider strategy until the exact local CLI behavior is verified.

**Test command:** `cd services/api; uv run pytest tests/test_subscription_auth_flow.py tests/test_launcher_agent_api.py`

**Expected output:** Subscription auth tests pass with fake provider.

**Commit:** `feat(api): add subscription auth flow orchestration`

### Task 24: Add failing observability tests

**File(s):** `services/api/tests/test_launcher_observability.py`, `services/api/tests/test_runtime_observability.py`

**Step 1:** Test launcher provision emits locked span/metric/log.

**Step 2:** Test memory scope denial emits locked metric/log.

**Step 3:** Test forbidden attributes are rejected.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_observability.py tests/test_runtime_observability.py`

**Expected output:** Tests fail until instruments are implemented.

**Commit:** none until implementation passes.

### Task 25: Implement launcher/memory observability

**File(s):** `services/api/app/observability/runtime.py`, route/memory modules that emit spans/metrics/logs`

**Step 1:** Add required instruments.

**Step 2:** Add helper functions to avoid copying OTel boilerplate into every route.

**Step 3:** Enforce forbidden attributes.

**Test command:** `cd services/api; uv run pytest tests/test_launcher_observability.py tests/test_runtime_observability.py`

**Expected output:** Observability tests pass.

**Commit:** `feat(api): instrument launcher and memory scope`

### Task 26: Add frontend API client

**File(s):** `apps/web/src/lib/api/client.ts`, `apps/web/src/lib/api/launcher.ts`, `apps/web/src/features/agents/useLauncherState.ts`

**Step 1:** Add typed fetch wrapper.

**Step 2:** Add provider/ports/provision/auth/start/stop API calls.

**Step 3:** Add React Query hooks.

**Test command:** `pnpm --dir apps/web run build`

**Expected output:** Build passes or fails only because components are not yet wired.

**Commit:** `feat(web): add launcher api client`

### Task 27: Build launcher UI with shadcn components

**File(s):** agent feature files listed in frontend inventory, `apps/web/src/App.tsx`

**Step 1:** Build `AgentPortPoolTable`.

**Step 2:** Build `ProviderModeSelector`.

**Step 3:** Build `AgentProfileForm`.

**Step 4:** Build credential/subscription dialogs.

**Step 5:** Build `AgentLauncherPage` and replace placeholder first screen in `App.tsx`.

**Test command:** `pnpm --dir apps/web run build`

**Expected output:** Vite build succeeds with no placeholder first screen.

**Commit:** `feat(web): build port-backed agent launcher`

### Task 28: Build chat page with Vercel AI Elements prompt input

**File(s):** `apps/web/src/features/chat/ChatPage.tsx`, `apps/web/src/features/chat/ChatComposer.tsx`, `apps/web/src/lib/api/chat.ts`, `apps/web/src/App.tsx`

**Step 1:** Build chat layout around existing Chattr messages API.

**Step 2:** Use `PromptInput*` source components from `apps/web/src/components/ai-elements/prompt-input.tsx`.

**Step 3:** Add route/state transition from launcher to chat.

**Step 4:** Do not handroll a composer.

**Test command:** `pnpm --dir apps/web run build`

**Expected output:** Vite build succeeds and imports prove Vercel AI Elements source use.

**Commit:** `feat(web): add chat page with ai elements composer`

### Task 29: Add manual pre-provision script

**File(s):** `services/api/scripts/provision_agent_ports.py`

**Step 1:** Script reads config range.

**Step 2:** Script pre-creates all `data/agents/{port}/memory.sqlite` files.

**Step 3:** Script prints a concise table of created/existing paths.

**Test command:** `cd services/api; uv run python scripts/provision_agent_ports.py --dry-run`

**Expected output:** Shows ports `8900-8910` and does not write in dry-run.

**Commit:** `feat(api): add agent port preprovision script`

### Task 30: Full verification gate

**File(s):** all changed files

**Step 1:** Run backend compile.

**Step 2:** Run backend tests.

**Step 3:** Run frontend build.

**Step 4:** Run governance checks.

**Step 5:** Manually run local server and verify browser flow.

**Commands:**

```powershell
cd E:\kai-chattr\services\api
uv run python -m compileall -q app
uv run pytest

cd E:\kai-chattr
pnpm --dir apps/web run build
pnpm run check:contracts
pnpm run check:deps
```

**Expected output:**

- `compileall` exits `0`.
- `pytest` exits `0`.
- Vite build exits `0`.
- governance checks exit `0`.
- Browser shows launcher first, ports `8900-8910`, successful provision/start path, and chat page.

**Commit:** `test: verify port-backed launcher memory flow`

---

## Verification Strategy

### Unit Tests

- Port allocator range, locking, duplicates, OS-bound port detection.
- Registry store persistence and nonce hash handling.
- Per-port SQLite schema/provisioning/search/list/write.
- Credential encryption fail-closed behavior.
- Provider catalog validation.
- MCP memory scope resolver.

### API Tests

- Provider list.
- Port list.
- Provision.
- API-key save.
- Subscription fake flow.
- Start/stop fake process.
- Registration port/nonce binding.
- Heartbeat returns port.

### Integration Tests

- Provision `8900`.
- Start fake wrapper.
- Register with valid nonce.
- Append memory through MCP as token `8900`.
- Attempt to access `8901`; expect denial.

### Frontend Verification

- `pnpm --dir apps/web run build`.
- Visual check at dev server:
  - desktop: three-panel launcher layout.
  - mobile: no horizontal overflow.
  - API-key dialog traps focus and clears input after close.
  - subscription dialog displays pending/verified/failure status.
  - chat page composer uses Vercel AI Elements source.

### Manual Runtime Verification

1. Start backend on `8300`.
2. Open frontend.
3. Provision `codex-reviewer` on `8900`.
4. Complete selected auth mode.
5. Start agent.
6. Confirm wrapper registers with `agent_port=8900`.
7. Call memory append/read through MCP.
8. Confirm `data/agents/8900/memory.sqlite` changed.
9. Confirm `data/agents/8901/memory.sqlite` did not change.
10. Stop agent.
11. Confirm memory file remains.

---

## Completion Criteria

The work is complete only when all of the following are true:

1. ADR 0002 exists and ADR 0001 points to it for this superseded storage slice.
2. The locked API surface exists exactly as specified or the plan is revised before implementation continues.
3. Ports `8900-8910` are visible from the launcher API.
4. Per-port memory DBs are provisioned under `data/agents/{port}/memory.sqlite`.
5. Launcher-started wrappers cannot register without valid port/nonce.
6. Runtime registry tokens resolve to one agent port.
7. MCP memory tools never accept port/path/scope input.
8. Cross-port memory access is denied and tested.
9. API keys/tokens are encrypted at rest or rejected; plaintext fallback does not exist.
10. One shared MCP bridge serves all agents.
11. Hindsight remains the collective memory path.
12. Launcher frontend replaces placeholder first screen.
13. Chat composer uses Vercel AI Elements source.
14. Backend compile, backend tests, frontend build, and governance checks pass.
15. File inventory drift is reviewed and either matches this plan or triggers a plan amendment.

---

## Execution Handoff

Implementers must read this plan fully before editing code.

Follow the plan exactly. Do not improvise on locked decisions, endpoint names, storage layout, credential handling, MCP scope rules, or frontend component sources.

If current repo reality makes any locked item wrong, stop and revise this plan before implementation continues.

