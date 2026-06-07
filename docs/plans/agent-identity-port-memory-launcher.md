# Agent Identity, Per-Port Memory & Launcher — Implementation Plan

**Goal:** Add a predefined agent **port range** where each launched CLI agent (claude/codex/gemini, via subscription-OAuth or API key) is bound to a free port that is its **identity anchor** and owns an **isolated SQLite `.db`** for individual memory; a **single** token-routed MCP serves every agent and exposes memory tools that resolve to *only that caller's* db; collective memory stays in **Hindsight/Postgres**; and a **launcher** (frontend + backend + provisioning script) lets the user pick a provider, authenticate, define an agent profile, provision it, and drop into chat.

**Architecture:** Extend the existing chattr FastAPI service (`services/api`, `:8300`) and its single MCP bridge (`:8301` http / `:8302` SSE). Identity is keyed by the existing `x-agent-token` (wire credential); the **port is the durable provisioning slot** that the token resolves to and that selects the agent's `.db`. A new `app/agents/` subpackage owns ports, per-db SQLAlchemy memory, the token→port→db router, provisioning, and provider auth. The MCP bridge gains memory tools routed through that boundary. The `apps/web` Vite/React/shadcn/AI-Elements app gains the launcher + chat surface. No new MCP instances; no Letta server.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, MCP FastMCP, SQLAlchemy 2.x + Alembic (already declared), `cryptography` (new — AES-GCM), OpenTelemetry, pytest; React 19 + Vite 7 + Tailwind 4 + AI-SDK v6 + shadcn/ui + Vercel AI Elements, TanStack Query, Zustand, react-router v7.

**Status:** Draft
**Author:** Jon (requested) / Claude (worker)
**Date:** 2026-06-05

---

## 0. Decisions to Lock (PROPOSED — confirm before execution)

> Per the decide→encode→render rule, nothing below is treated as locked until Jon confirms. Each row is marked **prior** (already decided by Jon in the memory record) or **proposed** (this worker's recommendation, awaiting lock).

| # | Decision | Status | Source |
|---|----------|--------|--------|
| D1 | **Letta = reference-only**; do **not** stand up a Letta server. Individual memory is a bespoke SQLite `.db` per port. | **proposed** (supersedes the 2026-06-01 "adopt Letta" lock after Jon's first-hand "much more primitive than anticipated" review) | this session |
| D2 | **Individual memory = one isolated SQLite `.db` per predefined port**; **collective memory = Hindsight/Postgres** (already set up, out of scope here). | **proposed** | this session |
| D3 | **Port = durable identity anchor + db selector; `x-agent-token` = wire key.** The registry maps `port ↔ token ↔ profile ↔ db_path`. MCP keeps routing by token; no per-agent MCP. | **proposed** | this session (token routing is the verified current mechanism, `bridge.py:162`) |
| D4 | **Port range is config-driven**, default `8900–8910`; ports are **pre-provisioned** (dirs + empty `.db`) at startup and claimed on agent creation. | **proposed** | this session |
| D5 | **Provider auth = two modes**: API-key entry, and **OAuth Device Flow** for "subscription" (browser opens to a verification URI + user code, backend polls token endpoint). Ported from lobehub/LibreChat (MIT). | **proposed** | borrow brief |
| D6 | **Frontend integrates into `apps/web`** (not a separate app); composes real shadcn/ui + AI-Elements source per AGENTS.md. | **prior** | AGENTS.md |
| D7 | New backend deps (`cryptography`) are added to `governance/contracts/architecture.json` allowlist **one slice at a time**, before the code lands. | **prior** | AGENTS.md |

**Gate:** Confirming D1–D5 (D6/D7 already hold) is the green light to execute. If D1 is rejected (keep Letta), the memory layer (§5.2–§5.5) is replaced by a Letta-client adapter and the rest of the plan stands.

---

## 1. Architecture Overview

```
  apps/web (:8800, Vite)                 services/api (:8300, FastAPI)              CLI agent process
  ─────────────────────                  ─────────────────────────────             ─────────────────
  LauncherDialog                         POST /api/agents  ──┐                      wrapper.py <provider>
   ├─ ProviderPicker ──► /api/providers                      │ provision_agent()      └─ McpIdentityProxy
   ├─ ApiKeyEntry  ───► /api/auth/validate-key               ▼                            (stamps x-agent-token)
   ├─ DeviceFlowAuth ─► /api/auth/device/start+poll    PortAllocator.claim() ─► 8900..8910      │
   └─ AgentProfileForm                                  AgentDbRouter ─► data/agents/<port>/memory.db
            │                                           RuntimeRegistry: port↔token↔profile↔db_path
            ▼                                                 ▲                                  │
  ChatPage (AI-Elements) ◄──── /ws, /api/messages ─────  MCP bridge (:8301/:8302) ◄─ memory_* tools
                                                          _resolve_agent_db(ctx): token→port→store ┘
  collective memory ──► Hindsight (Postgres)  [out of scope; separate]
```

**The isolation boundary (the crux):** every `memory_*` MCP tool calls `_resolve_agent_db(ctx)` → `_extract_agent_token(ctx)` (existing, `bridge.py:162`) → `agent_db_router.store_for_token(token)` → `RuntimeRegistry.resolve_token(token)["port"]` → `self._stores[port]`. An agent physically cannot address another port's db: it never supplies a port or path; the token it was issued at provisioning deterministically selects exactly one store.

---

## 2. Manifest

### 2.1 Platform API

New endpoints follow the **self-contained `APIRouter` + loopback-guard** pattern of `app/routes/launchers.py` (NOT the `main_module.handler` shim pattern). All are loopback-only.

| Verb | Path | Action | Status |
|------|------|--------|--------|
| GET | `/api/providers` | List configured providers + each one's `auth_type` (`api_key`/`oauth_device`) and model list | New |
| POST | `/api/auth/validate-key` | Validate a provider API key; on success store it encrypted | New |
| POST | `/api/auth/device/start` | Begin OAuth Device Flow → `{verification_uri, user_code, poll_id, interval}` | New |
| GET | `/api/auth/device/{poll_id}/poll` | Poll device flow → `{status: pending\|success\|error, ...}`; on success store token encrypted | New |
| GET | `/api/agents` | List provisioned agents (port, name, role, state, online) | New |
| POST | `/api/agents` | Create + provision an agent: claim port, create `.db`, write profile, return `{port, name, token, db_path}` | New |
| GET | `/api/agents/{port}` | Read one agent's profile + status | New |
| DELETE | `/api/agents/{port}` | Deregister + release port (db retained on disk by default) | New |
| GET | `/api/agents/{port}/status` | Provisioning/runtime status for the launcher poller | New |
| POST | `/api/register` | **Modified** — accept optional `port`, `profile`, `db_path` so wrapper-initiated launches register with their slot | Existing (`main.py:2313` `register_agent`) |

**Into-chat** reuses existing surfaces (`/api/messages`, `/ws`, session/message stores) — **no new chat endpoints** in this plan; the launcher's final step navigates to `ChatPage` bound to the provisioned agent.

`POST /api/agents` contract:
- Auth: loopback only (`_is_loopback`, reuse from `launchers.py:80`).
- Request: `{ provider, auth_ref, profile: {name, role, position, function, notes?}, label? }`.
- Touches: `PortAllocator`, `AgentDbRouter` (creates the db), `RuntimeRegistry` (registers the instance with port/profile), `CredentialStore` (resolves `auth_ref`).
- Response: `{ port, name, token, db_path, state }`.

### 2.2 Persistence & Data Layout

SQLite-only addition; the legacy JSON/JSONL stores are untouched.

```
data/
  ( …existing flat JSON/JSONL files unchanged… )
  agents/
    8900/memory.db        # AgentProfile (1 row) + MemoryNote (N rows)
    8901/memory.db
    …                     # one dir+db per port in the range, pre-provisioned at startup
    8910/memory.db
  credentials.db          # encrypted provider credentials (AES-GCM), chmod 0600
```

| Schema object | Where | Notes |
|---|---|---|
| `AgentProfile(port pk, name, role, position, function, created_at, updated_at)` | each `agents/<port>/memory.db` | one row; the agent's identity profile |
| `MemoryNote(id pk, kind, content, created_at)` | each `agents/<port>/memory.db` | the agent's individual memory entries |
| `Credential(id pk, provider, auth_type, ciphertext, expires_at, created_at)` | `credentials.db` | AES-256-GCM; key from `KEY_VAULTS_SECRET` (SOPS) |

Migrations: per-db schema is created with `Base.metadata.create_all()` at store construction (idempotent, N identical schemas) — **Alembic deferred** (declared dep, but `create_all` suffices for the stable v1 schema; documented as a later seam, not silently dropped).

### 2.3 Observability

Existing OTel lives in `app/observability/`. New surface:

| Type | Name | Where | Purpose |
|------|------|-------|---------|
| Trace | `agents.provision` | `app/agents/provisioning.py:provision_agent` | provisioning latency + failures |
| Trace | `agents.port.claim` | `app/agents/ports.py:PortAllocator.claim` | allocation contention / exhaustion |
| Trace | `agents.memory.read` / `.write` | `app/mcp/memory_tools.py` | per-call memory latency, isolation hits |
| Trace | `agents.auth.device.start` / `.poll` / `agents.auth.validate_key` | `app/routes/agent_provisioning.py` | auth-flow timing + outcomes |
| Metric | `agents.provisioned.count`, `agents.ports.in_use`, `agents.memory.calls.count`, `agents.auth.failures.count` | as above | fleet + health counters |
| Log | `agents.provisioned`, `agents.port.exhausted`, `agents.auth.stored` | as above | audit |

**Attribute rules** — Allowed: `agent.port`, `provider`, `auth.type`, `memory.kind`, `result`, `status`, `http.status_code`, `ports.in_use`. **Forbidden in traces/metrics:** `x-agent-token`, API keys, OAuth tokens, profile free-text, db paths. Tokens/keys appear only in the encrypted `credentials.db`, never in telemetry.

### 2.4 Edge Functions

None. Not an edge-function architecture.

### 2.5 Frontend Surface Area

**New pages:** `2` — `pages/DashboardPage.tsx`, `pages/ChatPage.tsx`
**New components:** `8` — `layout/WorkbenchLayout`, `layout/AppSidebar`, `launcher/LauncherDialog`, `launcher/ProviderPicker`, `launcher/ApiKeyEntry`, `launcher/DeviceFlowAuth`, `launcher/AgentProfileForm`, `launcher/ProvisioningStatus`
**New hooks:** `5` — `use-agents`, `use-provision-agent`, `use-validate-api-key`, `use-device-flow`, `use-launcher`
**New lib/store:** `3` — `lib/api.ts`, `lib/query-client.ts`, `store/launcher-store.ts`
**Modified:** `2` — `src/main.tsx` (layout router + `QueryClientProvider`), `src/App.tsx` (gut placeholder → mount `DashboardPage` inside layout)

---

## 3. New File Inventory

**Backend (`services/api/`)**
- `app/agents/__init__.py` — package exports
- `app/agents/ports.py` — `PortAllocator`
- `app/agents/models.py` — SQLAlchemy `Base`, `AgentProfile`, `MemoryNote`
- `app/agents/memory_store.py` — `AgentMemoryStore` (one db) + profile/notes CRUD
- `app/agents/db_router.py` — `AgentDbRouter` (token/port → store; the isolation boundary)
- `app/agents/provisioning.py` — `provision_port_range()`, `provision_agent()`
- `app/agents/providers.py` — provider registry (claude/codex/gemini config)
- `app/agents/credentials.py` — `KeyVault` (AES-GCM) + `CredentialStore`
- `app/agents/provider_auth.py` — `validate_api_key()`, `start_device_flow()`, `poll_device_flow()`
- `app/mcp/memory_tools.py` — MCP memory tool handlers (registered by bridge)
- `app/routes/agent_provisioning.py` — FastAPI `APIRouter` for §2.1 new endpoints
- `tests/test_port_allocator.py`, `tests/test_agent_memory_store.py`, `tests/test_db_router_isolation.py`, `tests/test_provisioning.py`, `tests/test_provider_auth.py`, `tests/test_agent_provisioning_routes.py`, `tests/test_mcp_memory_tools.py`

**Frontend (`apps/web/src/`)** — the 18 files listed in §2.5.

## 4. Existing File Refactor Inventory (detailed, per-file)

Each entry was read in the investigation; line refs are from that read and are confirm-at-task-start anchors.

### `app/runtime/registry.py` — **edit**
The `Instance` dataclass (line 20: `name, base, slot, label, color, identity_id, token, epoch, state, registered_at`) has **no port/db/profile**, and `resolve_token` (line 505) is an **O(n) linear scan** invoked on every MCP call. Changes:
1. Add fields `port: int = 0`, `db_path: str = ""`, `profile: dict = field(default_factory=dict)` to `Instance` (line 20).
2. In `__init__` (line 37) add reverse indexes `_token_to_name: dict[str,str]` and `_port_to_name: dict[int,str]`, and accept an injected `PortAllocator`.
3. In `register` (line 93), after the `Instance(...)` construction at line 149: claim a port (or accept a caller-supplied pre-claimed port), set `inst.port`/`inst.db_path`/`inst.profile`, populate both reverse indexes.
4. In `deregister` (line 159): pop both indexes and call `port_allocator.release(port)`.
5. Add `resolve_port(port:int)->dict|None` (O(1) via `_port_to_name`) near line 505, and convert `resolve_token` to O(1) via `_token_to_name`.
6. In `_inst_dict` (line 567) emit `port`, `db_path`, `profile`. *Why:* propagates the new identity fields to every consumer (MCP, main, launcher) without further per-call lookups.

### `app/context.py` — **edit**
Holds the runtime context dataclass that `bind_runtime_context` (bridge) and `_sync_runtime_context` (main) populate. Add fields: `port_allocator`, `agent_db_router`, `credential_store`. *Why:* the wiring channel from `configure()` → MCP/routes.

### `app/mcp/bridge.py` — **edit**
Single MCP, token-routed; tools assembled in `_build_tool_registry` (line 1377); servers built by `_create_server` (line 1508, instances 1525/1526); identity via `_extract_agent_token` (162) + `_resolve_tool_identity` (181); context injected at `bind_runtime_context` (33). Changes:
1. Add module global `agent_db_router = None` (near line 29) and assign it in `bind_runtime_context` (line 33) from `context.agent_db_router`.
2. Import and register the new memory tools from `app/mcp/memory_tools.py` inside `_build_tool_registry` (line 1377), category `"memory"`, `identity_required=True`, before `registry.register(...)` at line 1500 — so both `mcp_http` and `mcp_sse` pick them up via the existing `_create_server` loop.
3. *No change* to `_resolve_tool_identity`; memory tools use the **token** (stable) for db routing, not the resolved name (renameable). *Why:* name can change via the rename chain; token cannot — token is the correct isolation key.

### `app/main.py` — **edit**
`configure()` (line 387) is the single store-wiring point; `data_dir` resolved at 396-397; stores constructed through ~450; `_sync_runtime_context` at 117; `register_agent` handler at 2313. Changes:
1. After `data_dir` mkdir (397): `provision_port_range(Path(data_dir)/"agents", port_range)`.
2. After the last store (~450): construct `port_allocator = PortAllocator(port_range)`, `agent_db_router = AgentDbRouter(Path(data_dir)/"agents", port_range)`, `credential_store = CredentialStore(Path(data_dir)/"credentials.db")`; pass `port_allocator` into the `RuntimeRegistry(...)` construction.
3. Add the three to the `global` decl (387) and to `_sync_runtime_context` (117).
4. `register_agent` (2313): accept optional `port`/`profile`/`db_path` in the JSON body and forward to `registry.register(...)`. *Why:* wrapper-initiated launches (the real spawn path) must register with their provisioned slot.
5. Mount the new router: `app.include_router(agent_provisioning.router)` next to the existing launchers router include.

### `app/wrappers/cli.py` — **edit**
Real spawn path: `main()` (659) → `load_config` (670) → `_register_instance` (407, POSTs `{base,label}` to `/api/register`) → MCP inject → `run_agent`. No provider auth today (ambient host login). Changes:
1. Between `load_config` (670) and `_register_instance` (723): call provisioning — resolve/claim port, ensure db+profile, resolve provider credential via `CredentialStore` (api-key → env; device-token → env/inject).
2. Extend `_register_instance` (407) body to include `port`, `profile`, `db_path`.
3. In the env-copy block (~841) merge the resolved provider credential into `env`/`inject_env`. *Why:* binds the spawned process to its slot and supplies provider auth without a visible terminal step.

### `app/routes/launchers.py` — **edit (light)**
Self-contained `APIRouter`, loopback-guarded (`_is_loopback` 80; guards 236-276). Changes: extend `LauncherStartRequest` (62) with `auth_ref`/`agent_port` and pass through to `chattr_launcher.start()`; **reuse `_is_loopback` from here** in the new router (or lift to a shared `app/routes/_guards.py`).

### `app/launch/chattr_launcher.py` + `app/launch/agents.toml` — **edit**
`LauncherProfile`/`BuiltCommand` (41/54) + `tomllib` loader; all cli-agent profiles are `visible_terminal=true, allow_browser_start=false` (so the HTTP `/start` cannot launch them today). Changes: add optional `port` to the dataclasses + loader; introduce a `kind="managed-agent"` profile (or generate dynamically) with `allow_browser_start=true, visible_terminal=false` for launcher-driven starts. *Why:* lets the launcher start agents headless via the API instead of a manual terminal.

### `app/stores/__init__.py` — **edit (trivial)**
Re-export nothing new required (memory store lives under `app/agents/`); leave unless a convenience re-export is wanted.

### `pyproject.toml` + `config.toml` + `governance/contracts/architecture.json` — **edit**
Add `cryptography` to deps (and to the allowlist per D7, one slice). Add a `[agents]` section to `config.toml`: `port_range_start=8900`, `port_range_end=8910`, `providers=[…]`.

### `apps/web/src/main.tsx`, `apps/web/src/App.tsx` — **edit** (see §2.5).

---

## 5. New File Code

> The **backend identity/memory spine** (§5.1–§5.6) is write-from-scratch and authored in full. **Provider-auth + credentials** (§5.7–§5.8) and the **frontend** (§5.10) are *adapt-from-MIT-source* per the borrow brief — authored here as complete interfaces + core logic + the exact lobehub/opencode/LibreChat file to port, with full bodies filled in per task at execution (authoring 2k lines of speculative UI before the locks would be the over-generation Jon has rejected).

### 5.1 `app/agents/ports.py`
```python
"""Predefined agent port range allocator (identity slots)."""
from __future__ import annotations
import threading
from dataclasses import dataclass


class PortExhaustedError(RuntimeError):
    """No free port remains in the configured range."""


@dataclass(frozen=True)
class PortRange:
    start: int
    end: int  # inclusive

    def __iter__(self):
        return iter(range(self.start, self.end + 1))

    def __contains__(self, p: int) -> bool:
        return self.start <= p <= self.end


class PortAllocator:
    """Thread-safe claim/release over a fixed port range. Reconciles against
    already-claimed ports on construction so a restart does not double-allocate."""

    def __init__(self, port_range: PortRange, *, claimed: set[int] | None = None):
        self._range = port_range
        self._lock = threading.Lock()
        self._free: list[int] = [p for p in port_range if p not in (claimed or set())]
        self._claimed: set[int] = set(claimed or set())

    def claim(self, preferred: int | None = None) -> int:
        with self._lock:
            if preferred is not None:
                if preferred not in self._range:
                    raise ValueError(f"port {preferred} outside range")
                if preferred in self._claimed:
                    raise PortExhaustedError(f"port {preferred} already claimed")
                self._free.remove(preferred)
                self._claimed.add(preferred)
                return preferred
            if not self._free:
                raise PortExhaustedError("no free agent port in range")
            port = self._free.pop(0)
            self._claimed.add(port)
            return port

    def release(self, port: int) -> None:
        with self._lock:
            if port in self._claimed:
                self._claimed.discard(port)
                self._free.append(port)
                self._free.sort()

    def in_use(self) -> list[int]:
        with self._lock:
            return sorted(self._claimed)
```

### 5.2 `app/agents/models.py`
```python
"""Per-agent SQLite schema: one profile + N memory notes, isolated per port."""
from __future__ import annotations
from datetime import datetime, timezone
from sqlalchemy import String, Integer, Text, DateTime
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class AgentProfile(Base):
    __tablename__ = "agent_profile"
    port: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120), default="")
    role: Mapped[str] = mapped_column(String(120), default="")
    position: Mapped[str] = mapped_column(String(120), default="")
    function: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, onupdate=_utcnow)


class MemoryNote(Base):
    __tablename__ = "memory_note"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(40), default="note")  # note|fact|task|...
    content: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
```

### 5.3 `app/agents/memory_store.py`
```python
"""One isolated SQLite db = one agent's individual memory."""
from __future__ import annotations
from pathlib import Path
from sqlalchemy import create_engine, select, delete
from sqlalchemy.orm import Session
from app.agents.models import Base, AgentProfile, MemoryNote


class AgentMemoryStore:
    def __init__(self, db_path: Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._engine = create_engine(
            f"sqlite:///{self.db_path}", connect_args={"check_same_thread": False}
        )
        with self._engine.begin() as conn:
            conn.exec_driver_sql("PRAGMA journal_mode=WAL")
        Base.metadata.create_all(self._engine)

    # profile -----------------------------------------------------------
    def get_profile(self, port: int) -> dict | None:
        with Session(self._engine) as s:
            row = s.get(AgentProfile, port)
            return _profile_dict(row) if row else None

    def set_profile(self, port: int, **fields) -> dict:
        with Session(self._engine) as s:
            row = s.get(AgentProfile, port) or AgentProfile(port=port)
            for k in ("name", "role", "position", "function"):
                if k in fields and fields[k] is not None:
                    setattr(row, k, fields[k])
            s.add(row); s.commit(); s.refresh(row)
            return _profile_dict(row)

    # notes -------------------------------------------------------------
    def add_note(self, content: str, kind: str = "note") -> dict:
        with Session(self._engine) as s:
            n = MemoryNote(content=content, kind=kind)
            s.add(n); s.commit(); s.refresh(n)
            return _note_dict(n)

    def list_notes(self, kind: str | None = None, limit: int = 200) -> list[dict]:
        with Session(self._engine) as s:
            q = select(MemoryNote).order_by(MemoryNote.created_at.desc()).limit(limit)
            if kind:
                q = q.where(MemoryNote.kind == kind)
            return [_note_dict(n) for n in s.scalars(q)]

    def delete_note(self, note_id: int) -> bool:
        with Session(self._engine) as s:
            res = s.execute(delete(MemoryNote).where(MemoryNote.id == note_id))
            s.commit()
            return res.rowcount > 0


def _profile_dict(r: AgentProfile) -> dict:
    return {"port": r.port, "name": r.name, "role": r.role,
            "position": r.position, "function": r.function,
            "updated_at": r.updated_at.isoformat()}


def _note_dict(n: MemoryNote) -> dict:
    return {"id": n.id, "kind": n.kind, "content": n.content,
            "created_at": n.created_at.isoformat()}
```

### 5.4 `app/agents/db_router.py`
```python
"""Token/port -> AgentMemoryStore. THE isolation boundary the MCP calls into."""
from __future__ import annotations
from pathlib import Path
from app.agents.ports import PortRange
from app.agents.memory_store import AgentMemoryStore


class UnknownAgentError(RuntimeError):
    pass


class AgentDbRouter:
    def __init__(self, base_dir: Path, port_range: PortRange, registry=None):
        self._base = Path(base_dir)
        self._range = port_range
        self._registry = registry  # RuntimeRegistry, injected after construction
        self._stores: dict[int, AgentMemoryStore] = {
            p: AgentMemoryStore(self._base / str(p) / "memory.db") for p in port_range
        }

    def bind_registry(self, registry) -> None:
        self._registry = registry

    def store_for_port(self, port: int) -> AgentMemoryStore:
        try:
            return self._stores[port]
        except KeyError:
            raise UnknownAgentError(f"no memory store for port {port}")

    def store_for_token(self, token: str) -> AgentMemoryStore:
        """Resolve the calling agent's OWN store. Token is the stable key."""
        inst = self._registry.resolve_token(token) if self._registry else None
        if not inst or not inst.get("port"):
            raise UnknownAgentError("token does not resolve to a provisioned agent")
        return self.store_for_port(int(inst["port"]))
```

### 5.5 `app/agents/provisioning.py`
```python
"""Pre-provision the port range; provision a single agent on creation."""
from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from app.agents.ports import PortAllocator, PortRange
from app.agents.memory_store import AgentMemoryStore


def provision_port_range(base_dir: Path, port_range: PortRange) -> None:
    """Idempotent: create data/agents/<port>/memory.db (schema) for every port.
    Safe to run on every startup."""
    base = Path(base_dir); base.mkdir(parents=True, exist_ok=True)
    for port in port_range:
        AgentMemoryStore(base / str(port) / "memory.db")  # __init__ creates schema


@dataclass(frozen=True)
class AgentProvision:
    port: int
    db_path: str
    profile: dict


def provision_agent(*, base_dir: Path, allocator: PortAllocator, profile: dict,
                    preferred_port: int | None = None) -> AgentProvision:
    port = allocator.claim(preferred_port)
    db_path = Path(base_dir) / str(port) / "memory.db"
    store = AgentMemoryStore(db_path)
    saved = store.set_profile(port, **profile)
    return AgentProvision(port=port, db_path=str(db_path), profile=saved)
```

### 5.6 `app/mcp/memory_tools.py`
```python
"""MCP memory tools — each routes to ONLY the caller's own db via the token."""
from __future__ import annotations
from typing import Any

# bound by bridge.bind_runtime_context via module import
agent_db_router = None  # set in app/mcp/bridge.py: memory_tools.agent_db_router = ...


def _store(ctx) -> Any:
    from app.mcp.bridge import _extract_agent_token
    token = _extract_agent_token(ctx)
    if not token:
        raise PermissionError("memory tools require an authenticated agent token")
    return agent_db_router.store_for_token(token)


async def memory_write(content: str, kind: str = "note", ctx=None) -> dict:
    """Append an entry to YOUR individual memory."""
    return _store(ctx).add_note(content, kind)


async def memory_read(kind: str | None = None, limit: int = 50, ctx=None) -> dict:
    """Read YOUR individual memory (most recent first)."""
    return {"notes": _store(ctx).list_notes(kind, limit)}


async def memory_profile_get(ctx=None) -> dict:
    """Read YOUR identity profile (name/role/position/function)."""
    st = _store(ctx)
    # port is resolved inside the store via the token->port binding
    from app.mcp.bridge import _extract_agent_token
    inst = agent_db_router._registry.resolve_token(_extract_agent_token(ctx))
    return st.get_profile(int(inst["port"])) or {}


async def memory_profile_set(name=None, role=None, position=None,
                             function=None, ctx=None) -> dict:
    st = _store(ctx)
    from app.mcp.bridge import _extract_agent_token
    inst = agent_db_router._registry.resolve_token(_extract_agent_token(ctx))
    return st.set_profile(int(inst["port"]), name=name, role=role,
                          position=position, function=function)
```
*Bridge registration (inside `_build_tool_registry`, line ~1379):* for each handler call `_define_tool(memory_write, category="memory", identity_required=True, side_effect=True, summary="…")` etc., then the existing `registry.register(...)` + `_create_server` loop wires them onto both servers automatically.

### 5.7 `app/agents/credentials.py` — interface + core (port lobehub `KeyVaultsGateKeeper`, LibreChat `tokens.ts`)
```python
"""AES-256-GCM credential vault + encrypted-at-rest store. Key from KEY_VAULTS_SECRET (SOPS)."""
from __future__ import annotations
import os, json, base64
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class KeyVault:
    def __init__(self, secret: str | None = None):
        raw = (secret or os.environ["KEY_VAULTS_SECRET"]).encode()
        self._key = raw[:32].ljust(32, b"0")  # 256-bit

    def encrypt(self, plaintext: str) -> str:
        iv = os.urandom(12)
        ct = AESGCM(self._key).encrypt(iv, plaintext.encode(), None)
        return base64.b64encode(iv + ct).decode()

    def decrypt(self, blob: str) -> str:
        data = base64.b64decode(blob); iv, ct = data[:12], data[12:]
        return AESGCM(self._key).decrypt(iv, ct, None).decode()


class CredentialStore:
    """SQLite-backed, 0600. Stores {provider,auth_type,ciphertext,expires_at}.
    Mirror LibreChat tokens.ts record shape (expiry + refresh) for OAuth."""
    def __init__(self, db_path: Path, vault: KeyVault | None = None):
        self.db_path = Path(db_path); self._vault = vault or KeyVault()
        # … create table (id, provider, auth_type, ciphertext, expires_at, created_at);
        #     os.chmod(db_path, 0o600). [authored at task time]
    def put(self, provider: str, auth_type: str, secret: dict, expires_at=None) -> str: ...
    def get(self, ref: str) -> dict | None: ...   # returns decrypted secret
```

### 5.8 `app/agents/provider_auth.py` + `app/agents/providers.py` — interface (port lobehub `OAuthDeviceFlowService` + opencode `auth.ts`)
```python
# providers.py — config-driven provider registry
PROVIDERS = {
  "claude": {"auth_type": "oauth_device", "device_code_url": "...", "token_url": "...", "models": [...]},
  "codex":  {"auth_type": "oauth_device", "device_code_url": "...", "token_url": "...", "models": [...]},
  "gemini": {"auth_type": "api_key", "validate_url": "...", "models": [...]},
}

# provider_auth.py
def validate_api_key(provider: str, key: str) -> bool: ...        # ping provider, store via CredentialStore
def start_device_flow(provider: str) -> dict: ...                # -> {poll_id, verification_uri, user_code, interval}
def poll_device_flow(poll_id: str) -> dict: ...                  # -> {status: pending|success|error, auth_ref?}
```
*Port target:* lobehub `src/server/services/oauthDeviceFlow/index.ts` (device-code → poll FSM) → these three functions; storage via §5.7. Provider entries are data, so claude/codex/gemini are added as config, not code.

### 5.9 `app/routes/agent_provisioning.py` — FastAPI router (mirror `launchers.py` shape)
```python
from fastapi import APIRouter, Request, HTTPException, status
from pydantic import BaseModel, Field
from app.routes.launchers import _is_loopback  # reuse loopback guard
# … pull deps off the runtime context (port_allocator, agent_db_router, registry, credential_store)

router = APIRouter(prefix="/api", tags=["agents"])

class CreateAgentRequest(BaseModel):
    provider: str
    auth_ref: str | None = None
    profile: dict = Field(default_factory=dict)
    label: str | None = None

@router.get("/providers")          # -> list providers + auth_type + models
@router.post("/auth/validate-key") # -> {ok}; store encrypted
@router.post("/auth/device/start") # -> start_device_flow()
@router.get("/auth/device/{poll_id}/poll")
@router.get("/agents")             # -> registry list (port,name,role,state,online)
@router.post("/agents")            # -> provision_agent() + registry.register(port,profile) -> {port,name,token,db_path}
@router.get("/agents/{port}")
@router.delete("/agents/{port}")   # -> deregister + allocator.release
@router.get("/agents/{port}/status")
```
*Handlers authored at task time; each is loopback-guarded and emits the §2.3 spans.*

### 5.10 Frontend — core authored; flow components specced + borrow-pointed
- `lib/api.ts` — typed `fetch` wrapper over `/api`: `getProviders, validateApiKey, startDeviceFlow, pollDeviceFlow, listAgents, createAgent, getAgentStatus`. *(authored in full at task time — thin, ~80 lines)*
- `lib/query-client.ts` — singleton `QueryClient`. `store/launcher-store.ts` — Zustand `{open, step, provider, authRef, profile, agentPort}` + actions.
- `hooks/*` — `useQuery`/`useMutation` wrappers over `lib/api.ts`; `use-device-flow.ts` runs the poll FSM (idle→pending→polling→success) — **port lobehub `useOAuthDeviceFlow.ts`**.
- `launcher/LauncherDialog.tsx` — shadcn `Dialog`, 4 steps. `ProviderPicker.tsx` — shadcn `Tabs` (subscription | api-key) + `Command` search. `ApiKeyEntry.tsx` — masked `Input` + validate (port lobehub `FormPassword`). `DeviceFlowAuth.tsx` — `window.open(verification_uri)` + show `user_code` + poll (port lobehub `OAuthDeviceFlowAuth/index.tsx`). `AgentProfileForm.tsx` — `Input`/`Select` for name/role/position/function. `ProvisioningStatus.tsx` — `Progress` + poll `getAgentStatus`.
- `pages/ChatPage.tsx` — compose AI-Elements `PromptInput*` from `ai-elements/prompt-input.tsx` + `@ai-sdk/react` `useChat` over `/ws`/`/api/messages`, bound to the provisioned agent.
- `pages/DashboardPage.tsx` — agent list (`use-agents`) + "New Agent" → opens launcher. `layout/WorkbenchLayout.tsx` + `AppSidebar.tsx` — shadcn `Sidebar` shell; mount launcher overlay.
- Edits: `main.tsx` (wrap router in `QueryClientProvider`; root layout route → `WorkbenchLayout` with `index`=Dashboard, `/chat/:port`=Chat); `App.tsx` (retire placeholder → `DashboardPage`).

---

## 6. Borrow Map (exact sources — all MIT/Apache, AGPL-compatible; retain notices)

| Need | Source (path:symbol) | Decision |
|------|----------------------|----------|
| MCP transport/registry wiring | `f:\repos\mcp-agent` `src/mcp_agent/mcp/mcp_server_registry.py:start_server`, `config.py:MCPServerSettings` | Lift (Python) |
| OAuth Device Flow engine | `f:\repos\lobehub` `src/server/services/oauthDeviceFlow/index.ts:OAuthDeviceFlowService` | Rework → `provider_auth.py` |
| Device-flow UX + poll FSM | `f:\repos\lobehub` `.../OAuthDeviceFlowAuth/useOAuthDeviceFlow.ts` + `index.tsx:handleOpenBrowser` | Adapt → `use-device-flow.ts` + `DeviceFlowAuth.tsx` |
| API-key entry UI | `f:\repos\lobehub` `.../ProviderConfig/index.tsx`, `FormInput/FormPassword.tsx` | Adapt → `ApiKeyEntry.tsx` |
| Credential AES-GCM vault | `f:\repos\lobehub` `src/server/modules/KeyVaultsEncrypt/index.ts:KeyVaultsGateKeeper` | Rework → `credentials.py` |
| Encrypted token record (expiry/refresh) | `f:\repos\LibreChat` `packages/api/src/oauth/tokens.ts:storeToken/encryptV2` | Adapt → `CredentialStore` |
| oauth-vs-apikey discriminated auth schema | `f:\repos\opencode` `packages/opencode/src/provider/auth.ts`, `auth/index.ts` | Adapt → `providers.py` |

*Not borrowable (kai-chattr-original):* CLI-agent-on-fixed-port binding, token→port→db routing, per-port isolated SQLite. Confirmed absent in all four repos.

---

## 7. Build Sequence (phased, TDD)

**Phase A — Memory spine (no UI, no provider auth).** ports → models → memory_store → db_router → provisioning, each with a failing test first. Gate: `test_db_router_isolation.py` proves agent-A's token cannot read agent-B's notes.

**Phase B — Wire into runtime + MCP.** Edit `registry.py` (port/db/profile + indexes), `context.py`, `main.py` `configure()` (provision range + construct + wire), `bridge.py` + `memory_tools.py`. Gate: a registered token calling `memory_write`/`memory_read` over `:8301` round-trips to exactly its `<port>/memory.db`.

**Phase C — Provisioning API + provider auth.** `credentials.py`, `providers.py`, `provider_auth.py`, `app/routes/agent_provisioning.py`; modify `register_agent` + `cli.py` spawn path + `agents.toml` managed-agent profile. Gate: `POST /api/agents` provisions a port+db+profile and returns a token; `POST /api/auth/validate-key` stores an encrypted key.

**Phase D — Launcher + chat frontend.** `lib`/`store`/`hooks` → launcher components → `DashboardPage`/`ChatPage` → `main.tsx`/`App.tsx`. Gate: the **acceptance contract** below.

Each task: write failing test → run (red) → implement → run (green) → commit (`feat(agents): …`). Per-slice dep allowlist update (D7) precedes the `cryptography` import.

## 8. Locked Acceptance Contract

Complete only when all hold:
1. Startup pre-provisions `data/agents/8900..8910/memory.db`.
2. In the launcher, the user picks `claude` (subscription) → a browser opens to the verification URI showing a user code → on approval the agent provisions to a free port.
3. The user defines a profile (name/role/position/function); it persists in that port's `memory.db` `agent_profile` row.
4. The agent, over the single MCP, calls `memory_write` then `memory_read` and sees only its own notes; a second agent on another port cannot read them.
5. An API-key agent (`gemini`) is created via the key-entry path; the key is stored encrypted (never in telemetry).
6. The launcher drops the user into `ChatPage` bound to the provisioned agent.
7. `GET /api/agents` lists both agents with correct port/role/state.

## 9. Risks Accepted
1. v1 uses `create_all` (no Alembic migrations) — acceptable for the stable schema; Alembic is a documented later seam.
2. OAuth device-flow provider endpoints for claude/codex must be confirmed real (provider config is data; endpoints filled when known) — until then `gemini`/api-key path is the proven path.
3. Per-db SQLite (not Postgres) for individual memory is the v1 choice; the `AgentMemoryStore` interface is the swap seam if Postgres-per-agent is ever wanted.
4. Collective memory (Hindsight) is explicitly out of scope here.

## 10. Hard Invariants
1. An agent never supplies a port or path to reach memory — the **token** resolves it; cross-port reads are impossible by construction.
2. Exactly **one** MCP server pair (`:8301`/`:8302`); never one-per-agent.
3. No secret (token, API key, OAuth token) ever enters traces/metrics/logs; secrets live only in encrypted `credentials.db`.
4. Legacy JSON/JSONL stores are untouched; the SQLite work is additive.
5. Letta code is not vendored; only patterns are referenced.

## 11. Plan Validity Gate (worker self-check)
- **Requirement fit:** covers identity-by-port, isolated per-port memory, single token-routed MCP, launcher (provider subscription-OAuth + API-key) + into-chat, integrated into the existing repo. ✔
- **Repo-reality fit:** every named seam verified in investigation — `bridge.py:162/181/1377/1508`, `registry.py:20/505/567`, `main.py:387/396/2313`, `cli.py:659/407`, `launchers.py:80`, `app/context.py`, `app/routes/agents.py` pattern, `apps/web` scaffold. ✔
- **Strongest-justified:** Letta-adopt rejected on first-hand review (D1); sqlite-per-port chosen over Postgres-per-agent for v1 isolation+infra simplicity, swap seam preserved; borrow map cites exact MIT sources. ✔
- **Open:** D1–D5 require Jon's lock before execution; two backend file line-anchors (`include_router` site for the new router; exact env-merge line in `cli.py`) are confirm-at-task-start.
