# ADR 0001 — Agent Infrastructure: identity, memory, coordination

**Status:** Accepted (Jon, 2026-05-31)
**Context repo:** kai-chattr (clean rebuild of chattr) · **Source studied:** Letta v0.16.8 (`E:\repos\letta`, Apache-2.0)

## Context

kai-chattr is a local multi-agent coordination room: external CLI agents (Claude Code, Codex, etc.) and humans share channels, @mention each other, and drive a proposal→approval loop. We need an agent-infrastructure foundation — durable **identity**, per-agent **persistent memory**, and **coordination** — before features layer on top.

We evaluated Letta (formerly MemGPT) as the source. Letta's identity + memory-block model is exactly what we need. Its **agent runtime** is not.

## Decisions

### D1 — Extract, do not adopt
Letta is a **code source to mine**, not a dependency to run. We do not run Letta as a service, embed it as a library, or use its cloud. We lift the specific capability (identity + memory blocks + shared-block mechanism) into kai-chattr's own `services/`, owned by us. *Why: no external solution dictates our architecture; ownership + native integration is a hard requirement. Apache-2.0 → AGPL-3.0 makes this clean (keep attribution).*

### D2 — The cut line: take the memory substrate, leave the runtime
- **KEEP/ADAPT:** Block + Identity ORM/schemas, their M2M joins (`blocks_agents`, `identities_blocks`, `identities_agents`), `block_history`, and the two managers (`block_manager`, `identity_manager`) — de-tenanted (strip Letta's Organization/Project/actor scoping).
- **CUT:** Letta's agent runtime (`letta/agents/*`, `orm/agent.py`), `organization.py`, `user.py`.
- **SHIM:** our own slim async-SQLAlchemy base (no multi-tenancy), minimal mixins, the few enums/column-types the kept models use.
- **DEFER:** `sqlite_functions` (embedding/vector seam) — not needed for identity+block v1.

Full take/adapt/shim/cut/port-order lives in [`docs/extraction/letta-agent-identity-memory/cut_plan.md`](../extraction/letta-agent-identity-memory/cut_plan.md).

### D3 — Why the runtime is cut (incompatible execution models)
Letta's runtime (`letta_agent_v3.py`) is a **server-side, DB-hydrated, tool-call-driven step loop that owns the LLM call** — every turn it rehydrates state from the DB, calls the LLM via adapters, executes tools, and loops until a plain-text response. kai-chattr's agents are **external CLIs in terminals**, driven by keystroke injection, where the CLI owns its own loop and LLM. These cannot both drive the same agent. We keep chattr's terminal-agent model and take only Letta's *stateful-memory model*.

### D4 — The bridge: memory-as-MCP-tools
The join between the extracted memory substrate and chattr's terminal agents is **MCP tools, not Letta's loop**. Letta's own pattern is "memory editing as tools" (`memory_replace`, `block_update` called during its loop). We port the *pattern*: expose `block_read` / `block_update` / `memory_replace` and shared-block `read`/`append` as **MCP tools on chattr's MCP bridge**, writing the same ported Block tables. External CLI agents thus get self-editing persistent memory + shared-block access **without** adopting Letta's loop.

### D5 — Storage: one SQLite DB, identity-scoped rows (file-per-agent deferred)
v1 uses Letta's model — agent-scoped rows in one SQLite DB (stdlib, fits chattr's one-file ethos). True file-per-agent isolation (libSQL embedded replicas) is a **documented future option**, triggered only by a real isolation/compliance need. *Why: row-scoping satisfies "per-agent backend" functionally; libSQL now would reopen storage architecture before the foundation is proven.*

## The three-layer model

```
┌─ Layer 3 — Coordination (the blackboard) ───────────────────────────┐
│  registry · router · presence/heartbeat · jobs/step-board ·         │
│  ground-truth ledger = a SHARED memory block (Letta's keystone)     │
│  gate-runner · roles (Lead + adversarial Reviewers)                 │
├─ Layer 2 — Room (chattr's own, kept) ───────────────────────────────┤
│  chat UI (v3 design) · @mention · side-panel stores · MCP bridge ·  │
│  terminal-wrapper agent execution (UNCHANGED — not Letta's loop)    │
├─ Layer 1 — Identity + Memory substrate (extracted from Letta) ──────┤
│  Identity · Block (core memory) · shared blocks · block_history ·   │
│  block_manager (incl. update→connected-agents propagation)          │
│  ── reached by agents via MCP tools (D4), backed by SQLite (D5) ──  │
└─────────────────────────────────────────────────────────────────────┘
```

- **Ground-truth ledger** (the coordination fix for duplicated-effort/false-truth) = a **shared memory block**. `block_manager`'s update→connected-agents propagation is the primitive, already built — we extract it.
- **Roles** = an Identity attribute + a persona/role Block injected into the agent's context (for CLI agents, via the wrapper prompt).

## Build order (slices)
1. **Identity provisioning** *(first slice)* — provision an agent with a role at chat-start (Identity + persona Block), wired to chattr's registry. The precondition everything else rests on.
2. **Memory substrate** — port Block/shared-block + block_manager (de-tenanted); the shared-block ground-truth ledger.
3. **Memory-as-MCP-tools bridge (D4)** — `block_*` MCP tools for CLI agents.
4. **Coordination completion** — gate-runner, step-board (upgrade chattr's jobs), turn-taking.
5. **Room store hardening** — chattr's JSON stores (Rules/Jobs/Pins) → SQLite + MCP.

## Hard invariants
1. Do NOT lift Letta's Agent/User/Organization — kai-chattr owns its agent identity and is not multi-org.
2. Preserve Block optimistic-locking (version counter) — it makes shared-block writes safe.
3. The block-update→connected-agents propagation is the ledger primitive — port it intact.
4. chattr's terminal-wrapper agent execution is unchanged — Letta's loop is never adopted.
5. Every ported file carries Apache-2.0 attribution; record in NOTICE.
6. Dependencies enter `governance/allowed-deps.json` one slice at a time (sqlalchemy, pydantic when slice 2 lands).

## Consequences
- **Positive:** own the memory model outright; no heavy Letta service; chattr's agent model untouched; clean MCP seam; license-clean.
- **Cost:** the de-tenanting of `sqlalchemy_base`/managers is real work (R2 in the cut-plan); FKs in `blocks_agents` must retarget to kai-chattr's own agent/session table (sequencing dependency).
- **Deferred:** embedding/vector search (`sqlite_functions`), file-per-agent isolation (libSQL), Letta's groups/multi-agent-orchestration (design our own).
