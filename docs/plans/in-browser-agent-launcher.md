# In-Browser Agent Launcher — Implementation Plan

**Goal:** Replace the manual terminal procedure for connecting a CLI agent (Claude/Codex/Gemini) to the chattr server with a **browser launcher modal**: the user picks an agent, clicks Launch, the backend spawns the exact `uv run python wrapper.py <agent>` process the human runs by hand today (in its own console), the wrapper self-registers, and the modal reflects the agent going **active** in the live roster.

**Architecture:** The browser cannot spawn a host process, and the existing launcher (`/api/launchers/start` → `chattr_launcher.start()`) **refuses** every CLI agent (`visible_terminal=true` → `UnsafeLaunchError`). So add ONE new loopback-only backend endpoint that spawns the wrapper with its **own new console** (`CREATE_NEW_CONSOLE` on Windows / tmux on Unix) — bypassing the refusing launcher path but reusing everything downstream: the wrapper self-registers via the **existing** `POST /api/register`, which drives the **existing** WebSocket `agents`/`status` roster push the frontend already consumes. The modal is new; the registration, roster, and naming-lightbox plumbing already exist and are reused unchanged.

**Tech Stack:** Python 3.11, FastAPI, uvicorn, `subprocess` (Windows `CREATE_NEW_CONSOLE` / Unix tmux), OpenTelemetry + `runtime_events.jsonl`, pytest; React 19 + Vite 7 + shadcn/ui + Vercel AI Elements + TanStack Query + Zustand (the apps/web stack), WebSocket.

**Status:** Draft
**Author:** Jon (requested) / Claude (worker)
**Date:** 2026-06-05

---

## Objective & Deliverables (read this first)

**Objective.** Today a CLI agent joins `:8300` only if a human opens a console and runs `uv run python wrapper.py <agent>` — there is **no in-browser launcher**. This plan delivers a browser **modal** that performs that exact launch on click and reflects the agent going **active**, by adding **one** backend spawn endpoint and a frontend modal while **reusing** the existing registration, roster, and naming plumbing unchanged.

**What the implementation achieves on completion:**
- One-click, in-browser launch of Claude/Codex/Gemini (or any configured CLI agent) into `:8300` — no manual terminal.
- A live launch state machine (`spawning → registered → active / timeout`) mirroring the verified manual signals (§0 D).
- Host-readiness **preflight** (uv + each CLI on PATH) so unavailable agents are disabled with a clear reason.
- Multi-instance support via the existing naming lightbox.
- Loopback-only, **fixed-argv** spawning (no shell-exec hole).
- Honest provider-auth: surfaces "may need login" instead of faking OAuth (auth is ambient — verified, §0 P5).

**Deliverables:**

| Category | Count | Items |
|---|---|---|
| **New files** | **12** (9 source + 3 tests) | **Source:** `apps/web/src/components/launcher/{AgentLauncherModal,AgentCard,LaunchStatus,InstanceNameDialog,NewAgentButton}.tsx`; `apps/web/src/hooks/{use-agent-roster,use-launch-agent,use-launcher-preflight}.ts`; `apps/web/src/lib/launcher-api.ts`. **Tests:** `tests/test_launcher_agent.py` (pytest); `use-agent-roster.test.ts`, `use-launch-agent.test.ts` (Vitest) |
| **Edited files** | **2** | `server/launcher_control.py` (add the 2 endpoints + `load_config` import); the apps/web app-shell host file (mount the button + modal — exact file per §2 decision 6) |
| **Deleted files** | **0** | none |
| **New API endpoints** | **2** | `POST /api/launchers/agent` (spawn wrapper in a new console, loopback-only); `GET /api/launchers/agent/preflight` (host readiness) |
| **Reused endpoints** | 4 | `POST /api/register`, `GET /api/status`, `POST /api/label/{name}`, WS `/ws` — all unchanged |
| **New features** | 5 | launcher modal; preflight gating; launch status tracking; multi-instance naming dialog; live-roster consumption (WS) in the new frontend |

**Where it lives (open — §2.5–§2.6):** backend endpoint in the chattr server (`server/launcher_control.py`), mirrored to `kai-chattr/services/api`; modal in the new `apps/web`. The North Star home is **kai-chattr**, gated on `services/api` serving `:8300`.

---

## 0. The Reverse-Engineering Source — the COMPLETE manual procedure (every step, verified)

This is the exact procedure executed and verified live this session (one Claude + one Codex + one Gemini, all confirmed `state: active`). Each step is tagged with how the launcher automates it. Evidence is `file:line` in `E:\chattr`.

### A. Preconditions (must hold before *any* agent can connect)

| # | Precondition | Evidence / how verified | Automation |
|---|---|---|---|
| P1 | chattr server running at `127.0.0.1:8300` (+ MCP `8301` http / `8302` sse) | live: PID 28316 owns 8300/8301/8302; root → HTTP 200; profile `server.default` = `uv run python run.py` | **Reused** (assumed up; modal shows "server unreachable" if down) |
| P2 | `uv` on PATH | `uv.exe` at `C:\Users\jwchu\.local\bin` | Precheck endpoint |
| P3 | External uv env `UV_PROJECT_ENVIRONMENT=%LOCALAPPDATA%\chattr\uv-project-env`, **no conflicting `VIRTUAL_ENV`** | `windows\uv-env.bat`; I had to clear `VIRTUAL_ENV=.venv` (uv warned + ignored) | **Endpoint sets env** when spawning |
| P4 | The CLI tool on PATH (`claude.exe`, `codex.ps1`, `gemini.ps1`) | verified via `Get-Command`; wrapper fatal-exits if `shutil.which(command)` is None (`wrapper.py:844`) | Precheck endpoint |
| P5 | The CLI is **already authenticated on the host** (chattr passes NO provider creds) | **verified: 0** `api_key`/`oauth`/`anthropic`/`openai`/`login` hits across the wrapper chain | **Out of scope** — surfaced as a status, not orchestrated |
| P6 | `config.toml` has `[agents.<name>]` (command, cwd, color, label) | `E:\chattr\config.toml:10-26` (claude/codex/gemini) | **Reused** (drives the agent list) |

### B. Launch — what I did by hand, per agent

| # | Manual action | Why / evidence | Automation |
|---|---|---|---|
| L1 | Open a **new console window** on the host | the wrapper injects keystrokes into its *own* console via `WriteConsoleInputW` (`wrapper_windows.py:89,75-121`); the CLI shares that console (Popen has no new-console flag, `wrapper_windows.py:307`) | **Endpoint spawns wrapper with `CREATE_NEW_CONSOLE`** (Win) / tmux (Unix) |
| L2 | In it: `cd /d E:\chattr` → clear `VIRTUAL_ENV` → set uv env → `uv run python wrapper.py <agent>` | **The launcher path does NOT work**: `chattr_launcher.start()` raises `UnsafeLaunchError` for `visible_terminal=true` (`chattr_launcher.py:166-169`); `/api/launchers/start` also rejects `allow_browser_start=false` (`launcher_control.py:264-276`) | **The new endpoint runs exactly this argv** |

> **Verified failure of the obvious path:** `start_claude.bat` → `chattr.bat start agent.claude` → `chattr_launcher start agent.claude` → refused (no agent connected, no new process). The working method is the direct `uv run python wrapper.py <agent>` in a fresh console.

### C. What the wrapper does once launched (the 11 steps the endpoint triggers; reused as-is)

All in `E:\chattr\wrapper.py` unless noted. The endpoint does **not** reimplement these — it just spawns the wrapper, which performs them:

1. `apply_cli_overrides()` + `load_config(ROOT)` — read `config.toml`/`config.local.toml` (`wrapper.py:669-670`, `config_loader.py:117`).
2. **`_register_instance()` → `POST /api/register {base,label}`** → `{name, token, slot, state, color}` (`wrapper.py:407-426`; handler `app.py:2358`). Fatal exit if it fails → **server must be up**.
3. Resolve MCP inject mode — built-ins: `claude=flag`, `gemini=env`, `codex=proxy_flag` (`wrapper.py:131-175`).
4. Start `McpIdentityProxy` for codex/no-mode (`mcp_proxy.py:125`), stamping `Authorization: Bearer <token>` + `X-Agent-Token`.
5. Write provider MCP config — claude `--mcp-config <json>` (http 8301 + bearer); gemini `GEMINI_CLI_SYSTEM_SETTINGS_PATH` + trustedFolders; codex `-c mcp_servers.chattr.url=<proxy>` (`wrapper.py:225-372`).
6. Identity lock, clear `<name>_queue.jsonl`, strip `CLAUDECODE`, `shutil.which(command)` (fatal if absent) (`wrapper.py:781-849`).
7. **Spawn the CLI** in the console + start queue watcher — `Popen([command]+args, cwd, env)` (`wrapper_windows.py:307`) / tmux (`wrapper_unix.py:155`).
8. Heartbeat thread → `POST /api/heartbeat/{name}` every 5s (`wrapper.py:881-914`).
9. Queue watcher → poll triggers; on @mention inject `"use mcp to read #<channel> …"` into the console (`wrapper.py:543-652`).
10. Terminal capture + activity monitor → `POST /api/terminal/{name}` (`wrapper.py:1006-1029`).
11. On exit → `POST /api/deregister/{name}`; stop proxy (`wrapper.py:1067-1083`).

### D. Verification — how I confirmed each agent connected (the modal mirrors this)

| # | Signal | Observed | Modal equivalent |
|---|---|---|---|
| V1 | new `python` procs (uv→python ×3) | 6 procs at 8:18 PM | endpoint returns spawned `pid` |
| V2 | `GET /api/poll/<agent>` → **409** (known) not 404 | 409 for claude | — (internal) |
| V3 | `getAgentRosterModel()` instance `state:"active"`; `_getAvailableAgents()` lists it | `[claude,codex,gemini]` active, `instanceCount:3` | **modal watches the roster (WS `agents`/`status`)** |
| V4 | active pill in UI | confirmed | the roster pill is the success state |

---

## 1. Manifest

### 1.1 Platform API

| Verb | Path | Action | Status |
|------|------|--------|--------|
| `POST` | `/api/launchers/agent` | Spawn `uv run python wrapper.py <agent>` in its own console (loopback-only); the wrapper self-registers | **New** |
| `GET` | `/api/launchers/agent/preflight` | Report host readiness: `uv` on PATH, each agent's CLI on PATH, server self-reachable | **New** |
| `POST` | `/api/register` | Wrapper self-registers (mint name/token/slot) | **Reused, unchanged** (`app.py:2358`) |
| `GET` | `/api/status` | Roster + presence (`get_status()` + `paused`) | **Reused** (HTTP fallback for the modal poll) |
| `POST` | `/api/label/{name}` | Resolve the multi-instance naming lightbox | **Reused, unchanged** (`app.py:2469`) |
| WS | `/ws` `{"type":"agents"\|"status"\|"pending_instance"}` | Live roster + lightbox push | **Reused, unchanged** |

**`POST /api/launchers/agent` contract**
- Auth: **loopback-only** (reuse `_is_loopback`, `launcher_control.py:80`); returns `403` otherwise.
- Request: `{ "agent": "claude"|"codex"|"gemini"|<config key>, "variant"?: "default"|"skip-permissions"|"bypass"|"yolo", "label"?: string }`.
- Validation: `agent` must be a key in `config.toml [agents.*]` (and a CLI agent, not `type="api"`); `variant` maps to the existing `agents.toml` flag profiles.
- Behavior: builds argv `["uv","run","python","wrapper.py", agent, *variant_flags]`, cwd `E:\chattr` (repo root), env = inherited + `UV_PROJECT_ENVIRONMENT=<external>` + `VIRTUAL_ENV` removed; spawns with `creationflags=CREATE_NEW_CONSOLE` (Windows) / new tmux session (Unix). Does **not** wait.
- Response: `{ "accepted": true, "agent": "claude", "pid": 12345, "detail": "spawned" }` or `4xx` with `{ "error": ... }`.
- Touches: no DB; spawns a process; the wrapper then hits `/api/register`.

**`GET /api/launchers/agent/preflight`** → `{ "uv": true, "server": true, "agents": { "claude": {"on_path": true}, "codex": {...}, "gemini": {...} } }`. Auth: loopback-only.

### 1.2 Observability

| Type | Name | Where | Purpose |
|------|------|-------|---------|
| Trace | `launcher.agent.spawn` | `launcher_control.py:spawn_agent` | spawn latency + failures |
| Structured log | `launcher.agent.spawned` | same | audit: agent, variant, pid, console flag |
| Structured log | `launcher.agent.spawn_rejected` | same | audit: reason (not-loopback / unknown-agent / not-on-path) |
| Metric | `chattr.launcher.agent.spawn.count` | same | launches by agent + result |

Emitted into the existing `runtime_events.jsonl` stream (`schema chattr.runtime_event.v1`). **Allowed attributes:** `agent`, `variant`, `result`, `pid`, `console`, `http.status_code`. **Forbidden:** any bearer token, file paths beyond repo-relative, env values.

### 1.3 Persistence / Migrations

**Zero.** The agent list is config-driven (`config.toml`); identity/token/roster are in-memory in the running server (`registry.py`). No schema, no migration.

### 1.4 Edge Functions

N/A — not that architecture.

### 1.5 Frontend Surface Area

**New components:** `5`

| Component | File | Role |
|-----------|------|------|
| `AgentLauncherModal` | `apps/web/src/components/launcher/AgentLauncherModal.tsx` | shadcn `Dialog`; agent grid + variant select + Launch + live status |
| `AgentCard` | `apps/web/src/components/launcher/AgentCard.tsx` | one configured agent (color/label/on-path/active) |
| `LaunchStatus` | `apps/web/src/components/launcher/LaunchStatus.tsx` | per-launch state machine: `idle→spawning→registered→active→timeout/error` |
| `InstanceNameDialog` | `apps/web/src/components/launcher/InstanceNameDialog.tsx` | resolves the `pending_instance` lightbox → `POST /api/label/{name}` |
| `NewAgentButton` | `apps/web/src/components/launcher/NewAgentButton.tsx` | opens the modal |

**New hooks/lib:** `4` — `apps/web/src/hooks/use-agent-roster.ts` (WS `agents`/`status` + `/api/status` fallback), `use-launch-agent.ts` (POST + watch roster), `use-launcher-preflight.ts`, `apps/web/src/lib/launcher-api.ts`.

**Modified:** `1` — the app shell mounts `NewAgentButton` + the modal overlay (exact host file = the open scoping decision in §2).

### 1.6 Dependency cascade check

The new endpoint is a new owned runtime seam (spawns processes). API ✅ (`/api/launchers/agent` + preflight). Persistence ✅ (zero — justified, config-driven). Observability ✅ (§1.2). Caller surface ✅ (the modal). Verification ✅ (§6 acceptance). No untraced browser→external hop (the only "external" is the CLI's own login, which is intentionally out of scope per P5).

---

## 2. Locked Product Decisions (PROPOSED — confirm before execution)

1. **The launcher path is not reused for CLI agents.** A new endpoint spawns the wrapper directly, because `chattr_launcher.start()` refuses `visible_terminal` agents by design (verified `chattr_launcher.py:166`). *Do not* "fix" the launcher to start them headlessly — they need a real console.
2. **`CREATE_NEW_CONSOLE` is mandatory on Windows** (the console window appears — by design; that's where the CLI runs and where any login prompt shows). A hidden/no-window spawn breaks keystroke injection (`WriteConsoleInputW` needs a console).
3. **Provider auth is out of scope.** claude/codex/gemini authenticate ambiently (host login). The modal surfaces "registered" and, on no-activity timeout, "the agent's console may need login" — it does **not** build OAuth/API-key flows for these. (API-key agents like `minimax` are a separate, already-supported `wrapper_api.py` path, not in this plan.)
4. **The modal reuses the existing roster, registration, and naming-lightbox** — it adds no new presence/identity backend.
5. **Backend endpoint lands in the chattr server** (`E:\chattr\server\launcher_control.py`), the running system; it ports identically to `kai-chattr/services/api/app/launch` (same code lineage). — *confirm.*
6. **Frontend modal lands in the new `apps/web` (Vite/React/shadcn/AI-Elements) app** that visualizes `:8300`. **Open:** chattr's `apps/web` vs `kai-chattr/apps/web` — the latter is the stated North Star but does not yet consume the roster WS, so it needs `use-agent-roster.ts` built. — *confirm which app.*

---

## 3. New Backend Code

### `E:\chattr\server\launcher_control.py` (add to the existing router)
```python
# `router`, `_is_loopback`, `Request`, `HTTPException` ALREADY exist in launcher_control.py.
# These are the imports to ADD:
import os, shutil, subprocess
from pathlib import Path
from pydantic import BaseModel, Field
from config_loader import load_config   # root module; resolves at runtime because the server
                                        # runs from repo root (same import app.py/wrapper.py use)

REPO_ROOT = Path(__file__).resolve().parents[1]          # E:\chattr
_CONSOLE_FLAG = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)  # 0 on non-Windows

# variant -> extra argv passed after the agent name (mirrors agents.toml flag profiles)
_VARIANTS = {
    "default": [],
    "skip-permissions": ["--dangerously-skip-permissions"],          # claude
    "bypass": ["--", "--dangerously-bypass-approvals-and-sandbox"],  # codex
    "yolo": ["--", "--yolo"],                                        # gemini/qwen
}

class SpawnAgentRequest(BaseModel):
    agent: str = Field(min_length=1)
    variant: str = "default"
    label: str | None = None

def _cli_agents() -> dict:
    cfg = load_config(REPO_ROOT)                 # same loader the wrapper uses
    return {k: v for k, v in cfg.get("agents", {}).items() if v.get("type") != "api"}

@router.get("/agent/preflight")
async def agent_preflight(request: Request):
    if not _is_loopback(request):
        raise HTTPException(403, "loopback only")
    agents = {name: {"on_path": shutil.which(c.get("command", name)) is not None}
              for name, c in _cli_agents().items()}
    return {"uv": shutil.which("uv") is not None, "server": True, "agents": agents}

@router.post("/agent")
async def spawn_agent(request: Request, body: SpawnAgentRequest):
    if not _is_loopback(request):
        raise HTTPException(403, "loopback only")          # log: spawn_rejected not-loopback
    agents = _cli_agents()
    if body.agent not in agents:
        raise HTTPException(400, f"unknown cli agent: {body.agent}")
    if body.variant not in _VARIANTS:
        raise HTTPException(400, f"unknown variant: {body.variant}")
    command = agents[body.agent].get("command", body.agent)
    if shutil.which(command) is None:
        raise HTTPException(409, f"{command} not on PATH")  # log: spawn_rejected not-on-path

    argv = ["uv", "run", "python", "wrapper.py", body.agent, *_VARIANTS[body.variant]]
    if body.label:
        argv += ["--label", body.label]
    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)                            # avoid the uv conflict warning
    env.setdefault("UV_PROJECT_ENVIRONMENT",
                   str(Path(os.environ.get("LOCALAPPDATA", "")) / "chattr" / "uv-project-env"))
    # span: launcher.agent.spawn
    proc = subprocess.Popen(argv, cwd=str(REPO_ROOT), env=env, creationflags=_CONSOLE_FLAG)
    # log: launcher.agent.spawned {agent, variant, pid, console=bool(_CONSOLE_FLAG)}
    return {"accepted": True, "agent": body.agent, "pid": proc.pid, "detail": "spawned"}
```
*Unix note:* `CREATE_NEW_CONSOLE` is `0` there; the wrapper's Unix path uses tmux (`wrapper_unix.py:155`) so it manages its own terminal — the bare `Popen` is sufficient. (If the host has no tmux, that's a documented Unix precondition.)

---

## 4. Frontend Modal — spec + core code

`use-agent-roster.ts` (the success signal): open `new WebSocket('ws://127.0.0.1:8300/ws')`, maintain a map from `{"type":"agents"}` (`{name:{color,label,base,state}}`) and `{"type":"status"}` (`{name:{available,busy}}`); expose `roster` + `isActive(name)`. Fallback: poll `GET /api/status` (header `Authorization: Bearer <SESSION_TOKEN>` from `window.__SESSION_TOKEN__`).

`use-launch-agent.ts` (the state machine, reverse-engineering V1→V3):
```ts
// 1) POST /api/launchers/agent {agent, variant, label?}  -> {pid}      => state 'spawning'
// 2) watch roster: when base appears with an instance               => state 'registered'
// 3) when that instance state==='active' (and present in /api/status) => state 'active'  (success)
// 4) if no instance within ~25s                                      => state 'timeout'
//    message: "Launched (pid N) but the agent hasn't registered — check its console window; it may need to log in."
```

`AgentLauncherModal.tsx`: shadcn `Dialog` → `AgentCard` grid from `GET /api/launchers/agent/preflight` (disable cards whose CLI is not on PATH) → optional `Select` for variant → Launch button calls the hook → `LaunchStatus` shows the state machine. A separate `InstanceNameDialog` subscribes to WS `pending_instance` and submits `POST /api/label/{name}`.

(Full `.tsx` authored per task in §5, composing existing shadcn `dialog`/`card`/`select`/`badge`/`progress` + sonner — no bespoke primitives, per AGENTS.md.)

---

## 5. Build Sequence (TDD)

**Phase A — Backend endpoint.**
A1. Test (pytest, `e:\chattr\tests\test_launcher_agent.py`): `POST /api/launchers/agent` from a non-loopback client → 403. A2. Unknown agent → 400; `type=api` agent → 400. A3. Happy path with `subprocess.Popen` monkeypatched → asserts argv `["uv","run","python","wrapper.py","claude"]`, cwd repo root, `VIRTUAL_ENV` removed, `CREATE_NEW_CONSOLE` flag on Windows; returns `{accepted, pid}`. A4. `GET /agent/preflight` shape. A5. Implement; run `uv run pytest -q tests/test_launcher_agent.py`. **Gate:** real call spawns a console and the agent reaches `state:active` in the roster (the manual procedure, now one HTTP call).

**Phase B — Roster hook + launch hook (apps/web).** B1. `use-agent-roster.ts` (WS + fallback) with a fixture WS test (Vitest). B2. `use-launch-agent.ts` state machine test (mock fetch + roster). B3. `launcher-api.ts`.

**Phase C — Modal UI.** C1. `AgentCard`/`LaunchStatus`/`AgentLauncherModal`/`NewAgentButton` from shadcn sources. C2. `InstanceNameDialog` (WS `pending_instance` → `/api/label`). C3. Mount in the app shell.

Each task: failing test → red → implement → green → commit (`feat(launcher): …`).

## 6. Locked Acceptance Contract

Complete only when all hold (this is the manual procedure, automated):
1. With the server up and `claude` logged-in on the host, the user opens the modal, sees a `Claude` card (enabled; on-PATH), clicks **Launch**.
2. A new console window appears running `uv run python wrapper.py claude` (pid returned).
3. Within ~25s the modal shows **active**, and the agent appears in the roster with `state:"active"` (verified via the same `getAgentRosterModel`/`/api/status` used this session).
4. Repeating for `codex` and `gemini` yields three active agents — identical end state to the verified manual run.
5. Launching a 2nd `claude` triggers the naming dialog; submitting a name calls `POST /api/label/{name}` and the roster shows the renamed instance.
6. Launching an agent whose CLI is not on PATH is blocked (card disabled / 409) with a clear message.
7. From a non-loopback origin, `POST /api/launchers/agent` returns 403.

## 7. Explicit Risks Accepted

1. The agent console window is **visible** by design (required for keystroke injection); it is not hidden. 
2. Provider login is ambient: if the CLI isn't authenticated, the agent still **registers** (step 2 precedes CLI auth) but won't act until the user logs in via the console — the modal surfaces this rather than solving it.
3. Unix requires `tmux` on the host (the wrapper's Unix terminal mechanism); documented as a precondition, not handled.
4. The endpoint trusts loopback only; it intentionally executes a fixed argv template (no arbitrary command) to avoid a shell-exec hole.

## 8. Frozen Wrapper-Launch Contract

The endpoint must spawn **exactly** `["uv","run","python","wrapper.py",<agent>, *variant_flags]` with cwd = chattr repo root, env with `UV_PROJECT_ENVIRONMENT` set + `VIRTUAL_ENV` cleared, and a **new console** (Windows `CREATE_NEW_CONSOLE`). Do not route through `chattr_launcher.start()` (it refuses these). Do not add `CREATE_NO_WINDOW`/`DETACHED_PROCESS` (breaks injection). Do not pass provider credentials (there are none).

## 9. Plan Validity Gate (self-check)

- **Requirement fit:** captures every manual step (§0 A–D), automates L1/L2 via one endpoint, reflects V3 via the existing roster, sequenced end-to-end. ✔
- **Repo-reality fit:** every seam verified by me — `chattr_launcher.py:164-183` (refusal+Popen), `app.py:2358` (register), `launcher_control.py:80/264-276` (loopback + browser-start guards), wrapper steps `wrapper.py:407/543/881/1066`, ambient-auth (0 cred hits), live roster (`getAgentRosterModel` active ×3). ✔
- **Strongest-justified:** new-endpoint chosen over (a) "fix the launcher" (rejected — visible_terminal is a real console requirement) and (b) modal-shells-out (impossible — browser can't spawn). ✔
- **Open items to confirm:** §2 decisions 5–6 (which backend file lineage + which `apps/web`); these don't block Phase A.
