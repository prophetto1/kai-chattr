# Kai-Chattr 8300 To 8800 Runtime Equivalence Runbook

Date: 2026-06-09
Status: migration runbook
Author: Codex for Jon

## Purpose

This document maps the manual legacy `E:\chattr` flow used to get CLI runtimes participating in the
group chat at `http://localhost:8300` against the equivalent behavior kai-chattr must own through
`http://127.0.0.1:8800/workbench`.

The left column is legacy behavior and manual operator flow. The right column is the kai-chattr target
behavior. `8300/8301/8302` are reference-only in this repo; kai-chattr must not proxy to, shell into,
or depend on `E:\chattr` at runtime.

## Source Evidence Checked

Legacy `E:\chattr` reference:

- `README.md`
- `config.toml`
- `run.py`
- `wrapper.py`
- `wrapper_windows.py`
- `wrapper_unix.py`
- `server/api/terminal.py`
- `static/chat.js`
- `windows/chattr.bat`
- `windows/start_*.bat`
- `macos-linux/chattr.sh`
- `macos-linux/start_*.sh`

Kai-chattr target:

- `docs/plans/kai-chattr-architecture-runtime-parity-implementation-plan.md`
- `docs/plans/kai-chattr-live-room-launcher-implementation-plan.md`
- `governance/plans/kai-chattr-zellij-terminal-session-backend.md`
- `services/api/config.toml`
- `services/api/app/launch/agents.toml`
- `services/api/app/runtime/agents.py`
- `services/api/app/wrappers/cli.py`
- `services/api/app/wrappers/windows.py`
- `services/api/app/wrappers/unix.py`
- `services/api/app/wrappers/zellij.py`
- `services/api/app/routes/terminal.py`
- `apps/web/vite.config.ts`
- `apps/web/src/hooks/use-chattr-room.ts`
- `apps/web/src/lib/terminal-api.ts`
- `apps/web/src/components/workbench/AgentTerminalPane.tsx`

## Observed 2026-06-09 Reference Runtime

The `8300` runtime is intentionally the legacy reference baseline, not the kai-chattr target. It was
stood up from `E:\chattr` so the migration can compare a working room against the incomplete clean
repo runtime.

Observed legacy baseline:

- `127.0.0.1:8300`, `127.0.0.1:8301`, and `127.0.0.1:8302` were owned by legacy `python run.py`.
- `http://127.0.0.1:8300/` returned HTTP 200 and page title `noname`.
- The active manual terminal session was a Zellij session named `marvellous-peach`.
- Agent wrappers were launched directly in panes with:

```cmd
cd /d E:\chattr && call windows\uv-env.bat && uv run python wrapper.py claude
cd /d E:\chattr && call windows\uv-env.bat && uv run python wrapper.py codex
```

The legacy `windows\start_claude.bat` and `windows\start_codex.bat` opened visible command windows
but did not start wrappers in this run because the launch path rejects `visible_terminal=true`
profiles. Direct wrapper commands in Zellij panes were the working operator path.

Observed clean-repo shell:

- `http://127.0.0.1:8800/` returned HTTP 200 and page title `kai chattr`.
- `http://127.0.0.1:8800/api/runtime/ports` and
  `http://127.0.0.1:8840/api/runtime/ports` returned the clean port contract.
- This proves the Vite shell and port registry are live. It does not prove runtime equivalence.
  Equivalence requires the behavioral proof in the verification gate below.

## Side-By-Side Runtime Steps

| Step | Legacy `E:\chattr` manual `8300` flow | Kai-chattr `8800` equivalent requirement |
|---:|---|---|
| 1 | Start the legacy server from `E:\chattr`. The documented registry flow is `windows\chattr.bat start server.default` on Windows or `./macos-linux/chattr.sh start server.default` on macOS/Linux. The direct fallback is `uv run python run.py`. | Start the kai-chattr owned stack from `E:\kai-chattr` with `pnpm run dev`. This must start Vite on `8800` and `services/api` on `8840`, with MCP on `8841/8842`. The frontend must never target legacy `8300`. |
| 2 | Legacy server owns all browser/API/WebSocket traffic on `8300`; MCP is on `8301` and `8302`. | Kai-chattr splits the browser and backend: `apps/web` on `8800`, API/WebSocket on `8840`, MCP HTTP on `8841`, MCP SSE on `8842`. This is locked in `services/api/config.toml` and the architecture parity plan. |
| 3 | Open `http://localhost:8300`. The backend-served static UI receives the browser session token from the legacy server startup path. | Open `http://127.0.0.1:8800/workbench`. Vite proxies `/api`, `/observability`, `/uploads`, and `/ws` to `8840`. The local dev orchestrator supplies `VITE_KAI_CHATTR_SESSION_TOKEN`; kai-chattr must not restore an unauthenticated `/api/session` token endpoint. |
| 4 | Manually start one visible agent runtime per terminal: examples are `python wrapper.py claude`, `python wrapper.py codex`, or the legacy `start_*.bat` / `start_*.sh` launchers. Multiple wrappers share the same server. | Manual equivalent already exists from `E:\kai-chattr\services\api`: `uv run python wrapper.py claude`, `uv run python wrapper.py codex`, etc. Browser-started visible CLI launch is not fully equivalent yet; it needs the constrained launcher endpoint planned in `docs/plans/kai-chattr-live-room-launcher-implementation-plan.md`. |
| 5 | Each wrapper starts the provider CLI in a real terminal. Windows runs a direct subprocess and injects through Win32 console input. macOS/Linux runs inside `tmux` and injects through `tmux send-keys`. | Keep Win32 and tmux as the working injection backends for live multi-agent runtime triggers. Zellij can remain an optional managed-session candidate only after input submission is proven; it must not replace `cli.py` until paste plus Enter works reliably. |
| 6 | The wrapper registers itself with the server, receives an agent-scoped token, heartbeats, and appears as an active `@agent` in the roster/status surface. | Same backend concept must remain: wrappers self-register through `services/api` routes, heartbeat, and surface through WebSocket agent/status updates. This is existing backend behavior; the workbench must render and test it through `8800`. |
| 7 | The wrapper writes or injects MCP config for the provider. Legacy agents read chat and send responses through MCP endpoints on `8301/8302`, authenticated with the agent token. | The wrapper must generate MCP config for kai-chattr endpoints on `8841/8842`, not `8301/8302`. Provider-specific MCP injection must continue to use the registered agent token, not the browser session token. |
| 8 | The human types a message in the `8300` chat, for example `@claude what's the status?`. The legacy WebSocket receives `type = "message"` and persists the message. | The `8800` workbench must send browser messages over `/ws?token=...` to the `8840` backend. Current `apps/web/src/hooks/use-chattr-room.ts` implements the WebSocket send/history path; it must stay wired into the workbench route and covered by browser tests. |
| 9 | The backend parses mentions, resolves active agents, applies loop guards, and writes queue entries such as `<data_dir>/<agent>_queue.jsonl`. | Kai-chattr must use the existing `AgentTrigger` queue path under `services/api/app/runtime/agents.py`. Verification must prove that a message submitted from `8800` produces a queue entry for a registered fake agent. |
| 10 | The wrapper queue watcher consumes the queue entry and injects a prompt into the agent terminal telling it to use MCP to read the channel. | `services/api/app/wrappers/cli.py` must continue to own queue watching and terminal injection. Do not route real @mention triggers into a backend input adapter unless that adapter has passed input submission tests. |
| 11 | The agent reads the shared chat through MCP tools, does its work, and posts back through MCP `chat_send` or the wrapper/API send path. The browser receives the response through the WebSocket broadcast. | The backend MCP/API send path must remain server-owned. The `8800` workbench must render server messages from history and live WebSocket events, not local-only optimistic state. Browser E2E must prove an agent response appears after backend send. |
| 12 | A second agent can be woken by the first agent's `@mention`. The same router -> queue -> wrapper injection loop repeats until loop guards pause or the human intervenes. | Add a multi-agent fake-runtime test: register fake `claude` and `codex`, send `@claude`, simulate `@codex` from `claude`, and assert both routing decisions and queue writes. This is required before calling `8800` group-chat parity operational. |
| 13 | Terminal status/activity is derived from visible terminal text. Legacy README describes Windows `ReadConsoleOutputW` and macOS/Linux `tmux capture-pane`; the legacy terminal modal only displays snapshots. | Kai-chattr already has the same read-only snapshot concept: wrappers POST `POST /api/terminal/{agent_name}`, the browser reads `GET /api/terminal/{agent_name}`, and `AgentTerminalPane` renders snapshots. This is visibility, not browser input. |
| 14 | The legacy browser terminal view is read-only. `static/chat.js` polls `/api/terminal/{agent}` and writes text into a `<pre>` element; it does not send keystrokes to the terminal. | Preserve read-only snapshot rendering for agent visibility. Any interactive browser terminal must be a new managed terminal-session API with explicit `POST /api/terminal/sessions/{id}/input`, safe observability, and backend-owned session lifecycle. |
| 15 | Multi-instance behavior comes from launching another wrapper. The registry assigns names like `claude-2`, `claude-3`, and routes mentions to the registered instance. | Browser and backend must keep instance identity explicit. Launcher profiles must not rely on provider name alone once multiple same-family agents are active. Verification must include two same-provider fake agents. |
| 16 | Operators could stop terminals manually. Legacy visible-terminal control was mostly operator-owned; lifecycle visibility was surfaced through heartbeat/status. | Kai-chattr must either implement owned process lifecycle for browser-launched runtimes or explicitly return an operator handoff for visible terminals. Do not pretend `/api/launchers/status` and stop are complete unless process ownership is actually implemented. |

## What Is Already Equivalent In Kai-Chattr

1. The target port map exists: `8800/8840/8841/8842`.
2. Vite proxies the workbench to kai-chattr `services/api`, not legacy chattr.
3. The backend wrapper code still self-registers, heartbeats, posts terminal snapshots, watches queue files, and configures provider CLIs.
4. The backend `AgentTrigger` queue writer exists.
5. The `useChattrRoom` hook opens `/ws`, receives `history_batch` and `message` events, and sends `type: message` payloads.
6. The read-only terminal snapshot route exists and is rendered by `AgentTerminalPane`.
7. Zellij is documented as optional and not allowed to replace Win32/tmux injection until backend input proof passes.

## What Is Not Yet Equivalent

1. Browser-started visible CLI wrappers are not complete. Current launcher profiles intentionally mark CLI agents as `visible_terminal=true` and `allow_browser_start=false`.
2. Zellij is not a live @mention injection backend yet. It can capture with `dump-screen`, but Windows input submission still needs proof.
3. Full group-chat parity needs E2E proof from `8800`: browser message -> backend message store -> mention routing -> fake agent queue -> fake agent response -> browser transcript.
4. Launcher lifecycle status/stop is not equivalent until kai-chattr owns PIDs/session IDs or returns a clear visible-terminal handoff model.
5. Multi-instance same-provider routing needs a regression test before calling the new runtime operational.

## Implementation Order To Reach Equivalence

1. Keep `pnpm run dev` as the only local stack entrypoint for the browser target.
2. Verify `useChattrRoom` is wired into `apps/web/src/routes/workbench.tsx`, not just present as a hook.
3. Add the `8800` browser E2E that sends `@fake-agent` and asserts the backend receives it.
4. Add a fake wrapper/agent fixture that registers, receives a queue entry, and sends a response back through the backend.
5. Add the constrained visible CLI launcher endpoint for fixed profiles only, preserving the existing safe `/api/launchers/start` behavior.
6. Add launcher observability with sanitized attributes only. Never attach raw command, cwd, env, token, prompt, stdout, stderr, or terminal text.
7. Keep Win32/tmux as the active injection backends.
8. Continue Zellij as an optional managed terminal backend only after input submission passes on this PC.

## Verification Gate

Kai-chattr should be considered equivalent to the manual `8300` runtime only when these commands and checks pass from `E:\kai-chattr`:

```powershell
pnpm run dev
pnpm run runtime:probe
pnpm run test:workbench-browser
```

```powershell
cd services\api
uv run pytest -q tests/test_terminal_snapshots.py tests/test_runtime_contract.py
uv run pytest -q tests/test_chattr_launcher.py tests/test_launcher_control_api.py
```

Required behavioral proof:

1. `http://127.0.0.1:8800/workbench` opens without any legacy `8300` dependency.
2. A browser message submitted from `8800` reaches `services/api` over `/ws`.
3. A registered fake agent receives an @mention queue entry.
4. A fake agent response appears in the browser transcript.
5. A terminal snapshot for that fake/real agent appears read-only in the workbench terminal pane.
6. Runtime events/spans exist for message routing, terminal snapshot read/write, and launcher actions without leaking secrets or raw terminal text.
7. No test, script, proxy, or runtime process requires `E:\chattr` or ports `8300/8301/8302`.
