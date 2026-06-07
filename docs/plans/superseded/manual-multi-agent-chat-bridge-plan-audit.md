# Manual Multi-Agent Chat Bridge Plan Audit

**Plan reviewed:** `docs/plans/manual-multi-agent-chat-bridge-implementation-plan.md`

**Audit type:** Pre-implementation evaluation

**Skills used:** `evaluating-plan-before-implementation`, `waza-think`

**Date:** 2026-06-07

---

## Governing Requirement

The runtime target for this repo is the `apps/web` workbench running at `http://127.0.0.1:8800/workbench`.

`8300` must not be made the working page, backend authority, runtime target, or implementation anchor for this clean repo plan. Files brought over from `E:/chattr` are migration source material to be evaluated and adapted, not proof that the old runtime topology should be preserved.

This requirement overrides the current plan.

---

## Plan Reviewed

The reviewed plan proposes a manual multi-agent bridge where:

- `apps/web` on `8800` is the browser UI.
- `services/api` on `8300` is the backend/API/WebSocket/runtime authority.
- manual wrappers are launched from `E:/kai-chattr/services/api` and register to `8300`.
- a new `GET /api/session/bootstrap` endpoint is added to the `8300` backend.
- frontend chat, roster, Board, and session helpers connect to that `8300` backend.

Evidence from the plan:

- Line 3: goal says `8800/workbench` runs against backend on `8300`.
- Line 5: architecture names `services/api` as backend/API/WebSocket/runtime authority.
- Lines 19-22: objective says `services/api` on `8300` is the backend runtime and the `8800` workbench connects to it.
- Lines 83-114: manifest adds backend bootstrap endpoint under the `8300` runtime.
- Lines 213-225: backend surface creates/edits `services/api` files.
- Lines 283-286: acceptance contract starts `services/api` on `8300` and opens a WebSocket to `8300`.

---

## Structural Verdict

**Structurally Incomplete.**

The plan has many expected section headings: objective, manifest, frontend/backend inventory, locked decisions, file inventory, tasks, acceptance contract, and auditor checklist.

That is not enough. The plan contract is incomplete because its runtime boundary, system of record, migration boundary, file inventory, and acceptance evidence are all defined around a rejected premise.

### Structural Deficiencies

1. **Runtime boundary contradicts the governing requirement** - the header and objective make `8300` the backend/API/WebSocket/runtime authority instead of treating `8800/workbench` as the runtime target for this repo.
2. **System of record is not established** - the plan assumes brought-over `services/api` files define the target architecture, but the repo contract says legacy `chattr` is reference/source only.
3. **Migration boundary is missing** - the plan does not classify old-repo behaviors as port/refactor/drop before assigning implementation work.
4. **Backend file inventory is invalid for the clarified target** - the plan creates and edits `services/api` files before proving that backend runtime work belongs in this slice.
5. **Acceptance criteria validate the wrong topology** - the plan proves `8800` can talk to `8300`, not that the `8800` workbench is the migrated runtime target.
6. **Current repo drift is not audited** - existing `apps/web/vite.config.ts` references to `8300` are treated as implementation support instead of being classified as stale, transitional, or approved.

---

## Quality Verdict

**Rethink.**

The plan must not be executed. It should not be revised by patching individual tasks. It needs to be replaced with a new plan whose first locked decision is that the runtime target is `apps/web` on `8800`, and that migrated old-repo files are not automatically target runtime seams.

Because the structural failure is caused by the core architecture premise, the quality findings below are included only to explain why the plan must be replaced rather than patched.

---

## Critical Findings

### 1. Wrong Runtime Authority

**Severity:** Critical

**Finding:** The plan makes `services/api` on `8300` the backend/API/WebSocket/runtime authority. That contradicts the clarified requirement that the runtime target is the `8800` workbench and that `8300` plays no target role in this repo.

**Evidence:**

- Plan line 5: `services/api` is named as runtime authority.
- Plan line 20: `E:/kai-chattr/services/api` on `8300` is named as backend runtime.
- Plan line 238: locked decision says `8300` is API/WebSocket/runtime.

**Impact:** Implementation would preserve the old repo's runtime topology inside the clean repo instead of completing the migration into the new `apps/web` target.

**Required action:** Reject this architecture. A replacement plan must begin from the `8800` workbench as the only runtime target.

### 2. The Plan Treats Migrated Files As Target Authority

**Severity:** Critical

**Finding:** The plan assumes that because `services/api` files were brought over, those files define the target runtime architecture. That is the wrong migration logic. Brought-over files are candidates to adapt, not proof of target topology.

**Evidence:**

- Plan lines 41-53 list `services/api` files as "what exists" and then use them to define the implementation path.
- Plan lines 215-225 create and edit backend files under `services/api`.

**Impact:** The plan skips the essential migration question: which old behavior belongs in the new `8800` workbench, and which old runtime files should be adapted, replaced, or discarded.

**Required action:** Redraft around a source-to-target inventory. For every old-repo behavior, state whether it is ported into `apps/web`, replaced by new frontend logic, or intentionally excluded.

### 3. New `8300` Session Bootstrap Endpoint Is A Symptom Fix

**Severity:** Critical

**Finding:** The plan adds `GET /api/session/bootstrap` so `8800` can authenticate to `8300`. Under the clarified requirement, this is not a target solution; it reinforces the wrong split by making `8800` dependent on an old-style backend runtime.

**Evidence:**

- Plan lines 85-114 define the endpoint.
- Plan lines 341-351 make it Task 1.

**Impact:** Instead of designing the clean workbench runtime correctly, the plan patches around an invented `8300` dependency.

**Required action:** Remove this endpoint from the plan unless a new, explicit architecture decision states what backend/runtime, if any, the `8800` workbench should call.

### 4. Acceptance Criteria Would Prove The Wrong Thing

**Severity:** Critical

**Finding:** The acceptance contract proves that `8800` can talk to `8300`; it does not prove that the clean repo owns the runtime at `8800`.

**Evidence:**

- Plan line 283 starts backend on `8300`.
- Plan line 286 requires a browser WebSocket to `8300`.
- Plan line 292 says human messages broadcast through `8300`.
- Plan line 449 says expected output is a `8800` session "against `8300`."

**Impact:** Auditors could approve an implementation that still depends on the old runtime topology. That would fail the migration goal.

**Required action:** Replace acceptance criteria with proof that the `8800` workbench itself is the target runtime surface and that any brought-over files are integrated only through approved target architecture.

### 5. Backend File Inventory Is Out Of Scope

**Severity:** Critical

**Finding:** The plan adds and edits backend files under `services/api`, but the clarified requirement says `8300` plays no role in this repo target.

**Evidence:**

- Plan lines 215-225 add `services/api/app/routes/session.py` and edit `services/api/app/main.py`.
- Plan lines 255-266 list backend files in locked inventory.

**Impact:** Implementers would spend time building backend glue for a runtime seam that should not be part of the target plan.

**Required action:** Remove backend file changes from this plan. If backend work is truly needed later, it requires a separate architecture decision that explains the target runtime role without relying on `8300`.

---

## Significant Findings

### 6. The Plan Does Not Inventory The Migration Boundary

**Severity:** Significant

**Finding:** The plan lists legacy behavior from `E:/chattr/static/chat.js`, but it does not create a per-file or per-behavior migration inventory that distinguishes behavior to port, UI to reject, and runtime topology to discard.

**Impact:** It leaves implementers free to re-import the old runtime assumptions while claiming to port behavior.

**Required action:** Add a migration inventory before any implementation plan:

- source file or behavior in `E:/chattr`
- target file in `apps/web`
- port/refactor/drop decision
- reason
- verification path

### 7. The Plan Mixes Manual Multi-Agent Chat With Runtime Bootstrap Design

**Severity:** Significant

**Finding:** The plan starts as a manual multi-agent chat bridge but becomes a backend session architecture plan. That widens scope and obscures the real work: replacing mock `apps/web` chat behavior with the migrated workbench behavior.

**Impact:** Implementation would likely overbuild infrastructure and under-specify the actual `apps/web` runtime behavior.

**Required action:** Split the concern. First audit and rebuild `apps/web` at `8800`; only then decide whether any backend/runtime support is needed.

### 8. The Plan Does Not Explain Why `8800` Exists

**Severity:** Significant

**Finding:** The plan says `8800` is the browser UI, but it does not ground that in the migration objective: `apps/web` is the clean repo frontend target, and designing/building the workbench there is the reason the repo exists.

**Impact:** This omission enabled the plan to keep treating `8300` as the real runtime while using `8800` only as a browser shell.

**Required action:** A replacement plan must state that the workbench is designed in `apps/web` because the migration target is the clean repo's frontend, not the old repo runtime.

### 9. Current `8300` References Need Classification, Not Adoption

**Severity:** Significant

**Finding:** Current repo files contain `8300` references, including Vite proxy configuration. The plan uses that as support for its topology instead of auditing whether those references are stale migration scaffolding, deliberate temporary proxies, or approved target architecture.

**Evidence:**

- `apps/web/vite.config.ts` sets dev port `8800`.
- `apps/web/vite.config.ts` proxies `/api`, `/uploads`, and `/ws` to `8300`.
- `apps/web/src/main.tsx` mounts `/workbench`.
- `apps/web/src/routes/workbench.tsx` identifies the page as a mock shell slice.

**Impact:** Existing repo drift could be mistaken for a target contract and then amplified by implementation.

**Required action:** Replacement planning must inventory these references explicitly and decide whether each one is kept, replaced, or removed.

---

## What The Plan Gets Right

1. It correctly rejects copying legacy static UI as the design/component target.
2. It correctly identifies that the current `apps/web/src/routes/workbench.tsx` is mock/local state and not live chat.
3. It correctly identifies legacy `E:/chattr/static/chat.js` as a behavior reference.
4. It correctly insists that browser launcher work should wait until the manual workbench behavior is correct.

These correct pieces are not enough to salvage the plan because the architecture premise is wrong.

---

## Alternative Approaches

### Option A: Replace The Plan With A Pure `8800` Workbench Migration Plan

**Summary:** Treat `apps/web` on `8800` as the only target and draft a source-to-target migration plan for old Chattr chat behavior into the React workbench.

**Effort:** Medium

**Risk:** Lowest architectural risk because it matches the clarified target.

**Builds on:** `apps/web`, shadcn/ui, Vercel AI Elements, legacy `E:/chattr/static` behavior reference.

**Recommendation:** Use this.

### Option B: Quarantine `services/api` Before Planning Runtime Work

**Summary:** Treat brought-over backend files as untrusted migration material until a separate architecture decision says which runtime pieces survive.

**Effort:** Medium-high

**Risk:** Lower long-term risk, slower short-term progress.

**Builds on:** repo inventory and governance process.

**Use when:** there is uncertainty about whether any backend runtime code belongs in this repo.

### Option C: Patch The Existing Plan

**Summary:** Remove `8300` language and try to keep the existing file/task structure.

**Effort:** Low

**Risk:** High. The wrong premise is embedded throughout the plan.

**Recommendation:** Do not use.

---

## Approval Recommendation

**Rethink.**

The plan is structurally detailed, but it is architecturally wrong for the clarified repo target. It should not be sent to external evaluators as an implementation candidate except as an example of a rejected plan. The next plan must start from the `8800` workbench as the runtime target and treat old repo files as migration source material, not target authority.

## Sources Checked

- `docs/plans/manual-multi-agent-chat-bridge-implementation-plan.md`
- `AGENTS.md`
- `apps/web/AGENTS.md`
- `apps/web/vite.config.ts`
- `apps/web/src/main.tsx`
- `apps/web/src/routes/workbench.tsx`
- `E:/writing-system/__start-here/README.md`
