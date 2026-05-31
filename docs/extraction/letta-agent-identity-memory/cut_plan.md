# Cut-Plan: agent-identity-memory (Letta → kai-chattr)

**Source:** `E:\repos\letta` (Letta v0.16.8, Apache-2.0) · **Target:** `E:\kai-chattr\services\` (Python, greenfield)
**Capability:** identity + memory-blocks + shared-block mechanism. **NOT** Letta's agent runtime.
**Method:** extracting-capability pipeline (grimp graph, 23 nodes / 41 edges, mode=full). Render step produced a hollow JSON on Windows; this MD is authored from the validated phase_1–4 files.
**License:** Apache-2.0 → kai-chattr AGPL-3.0 = compatible (permissive into copyleft). Keep Letta's NOTICE/attribution on ported files.

## The cut line (one sentence)
Take the **Block + Identity ORM/schemas + their M2M joins + the block-manager's shared-update logic**; build our own thin SQLAlchemy base; **leave behind Letta's Agent runtime, User, and Organization multi-tenancy**.

## Take-list (KEEP — lift, then de-tenant)
| File | Purpose | Note |
|---|---|---|
| `letta/orm/block.py` | Block ORM: `label`/`value`/`limit`/`read_only`/`version` (optimistic lock)/`is_template` | KEEP; drop Org/Project mixins |
| `letta/orm/identity.py` | Identity ORM: `identifier_key`/`name`/`identity_type`/`properties` JSON | KEEP; drop Org/Project mixins |
| `letta/orm/blocks_agents.py` | **Block↔Agent M2M — the shared-memory keystone** | KEEP verbatim (retarget `agents.id` FK to our agent table) |
| `letta/orm/identities_blocks.py` | Identity↔Block M2M (identity-scoped shared memory) | KEEP |
| `letta/orm/identities_agents.py` | Identity↔Agent M2M | KEEP |
| `letta/orm/block_history.py` | Block versioning / optimistic-lock history | KEEP |
| `letta/schemas/block.py` | Block pydantic (Human/Persona variants) | KEEP |
| `letta/schemas/identity.py` | Identity pydantic | KEEP |
| `letta/schemas/memory.py` | Memory = composed blocks (core memory) | KEEP |

## Adapt (core logic transfers, strip framework scoping)
| File | What to keep | What to strip |
|---|---|---|
| `letta/services/block_manager.py` | CRUD + **`_rebuild_system_prompts_for_connected_agents` (the ground-truth-ledger update-propagation)**, `get_agents_for_block`, `get_blocks_by_agent` | `actor: PydanticUser` org-scoping, organization filters |
| `letta/services/identity_manager.py` | Identity CRUD, attach/detach agents+blocks | org-scoping, project_id |

## Shim (kai-chattr builds its own equivalent)
| Source | Minimal interface | Action |
|---|---|---|
| `letta/orm/sqlalchemy_base.py` | async CRUD base (create/read/update/delete/list) | **build_new** — slim version, no org multi-tenancy |
| `letta/orm/base.py` | DeclarativeBase + MetaData/naming | build_new |
| `letta/orm/mixins.py` | Organization/Project FK mixins | build_new — replace with our scoping (workspace_id or none for v1) |
| `letta/orm/custom_columns.py` | SQLAlchemy TypeDecorators (JSON/enum) | port only what KEEP models use |
| `letta/schemas/enums.py` | shared enums | copy only the few referenced |
| `letta/orm/sqlite_functions.py` | sqlite vector/distance fns | **DEFER** — embedding seam, not needed for v1 |

## Cut (explicitly do NOT take — the framework boundary)
| File | Why |
|---|---|
| `letta/orm/agent.py` + `letta/schemas/agent.py` | Letta's heavy Agent runtime (pulls tools/sources/runs/groups/messages). **kai-chattr keeps its own agent/session model** (terminal-wrapper loop). This is THE cut line. |
| `letta/orm/organization.py` | Letta org multi-tenancy — kai-chattr is not multi-org |
| `letta/orm/user.py` | Letta user model — kai-chattr has its own identity primitive |

## External deps pulled in (both already our stack)
`sqlalchemy` (async 2.x), `pydantic` v2 — add to `governance/allowed-deps.json` when the slice lands.

## Port order
1. **Shim base** — kai-chattr's slim `SqlalchemyBase` + `Base` + minimal mixins (no org).
2. **KEEP models** — Block, Identity, their M2M joins, block_history; retarget FKs to kai-chattr's agent table.
3. **KEEP schemas** — block/identity/memory pydantic (copy only needed enums).
4. **ADAPT managers** — block_manager (incl. rebuild-on-update) + identity_manager, de-tenanted.
5. **Gate** — test: create identity → attach a shared block to 2 agents → update block → both agents observe the change (proves the ledger primitive).

## Risk register
- **R1 (AMBIGUOUS→resolved):** `blocks_agents` FK points at Letta's `agents.id`. kai-chattr must define its own agent/session table first, then retarget the FK. Sequencing dependency, not a blocker.
- **R2:** `sqlalchemy_base.py` is large and assumes actor/org scoping throughout — the de-tenanting is the real work; budget for it.
- **R3:** Block optimistic-locking (`version_id_col`) must be preserved or concurrent shared-block writes corrupt — keep it.
- **R4 (license):** carry Letta Apache-2.0 attribution on ported files; record in kai-chattr NOTICE.

## Hard invariants
1. Do NOT lift Letta's Agent/User/Organization — kai-chattr owns its agent identity.
2. Preserve Block optimistic-locking (version counter) — it's what makes shared blocks safe.
3. The block-update→connected-agents propagation is the ground-truth-ledger primitive — port it intact.
4. Every ported file carries Apache-2.0 attribution.
5. Embedding/vector (sqlite_functions) is deferred, not silently dropped — documented as a later seam.
