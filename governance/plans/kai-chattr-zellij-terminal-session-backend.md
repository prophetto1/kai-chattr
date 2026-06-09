# kai-chattr Zellij Terminal Session Backend Plan

Date: 2026-06-09
Status: implementation-ready after first adapter probe

## Goal

Use Zellij as an optional API-managed terminal session backend for kai-chattr while keeping the
frontend on the approved AI Elements `Terminal` renderer. Do not reintroduce xterm.

## Proven Local Evidence

Zellij development references were downloaded under:

- `docs/references/zellij/`

The repo-local proof binary was downloaded under:

- `tools/zellij/v0.44.3/zellij.exe`
- `tools/zellij/v0.44.3/zellij-x86_64-pc-windows-msvc.zip`

Verified:

```powershell
.\tools\zellij\v0.44.3\zellij.exe --version
```

Observed:

```text
zellij 0.44.3
```

Confirmed CLI surfaces by `--help`:

- `attach --create-background`
- `list-sessions`
- `kill-session`
- `action new-pane`
- `action list-panes --json`
- `action dump-screen`
- `action paste`
- `action send-keys`
- `run`
- `subscribe --format json`
- `web --start --daemonize`
- `web --stop`

Confirmed local web proof once:

- `zellij web --start --daemonize --ip 127.0.0.1 --port 8847`
- `Invoke-WebRequest http://127.0.0.1:8847`
- observed HTTP `200`, content length `1771`
- `zellij web --stop`
- verified no `8847` listener remained

Confirmed immediate background session lifecycle once:

- `attach --create-background kai-chattr-session-probe-repeat`
- `list-sessions` showed `kai-chattr-session-probe-repeat`
- `kill-session kai-chattr-session-probe-repeat`
- final `list-sessions` reported `No active zellij sessions found.`

## Current Limitation

Windows headless pane driving is not proven. A stronger PowerShell probe showed that a background
session can disappear after a short wait in this non-interactive context, and `action new-pane` did
not return a pane id. A later repeat of `web --start --daemonize` timed out and required cleanup with
`zellij web --stop`.

The implementation must treat these as first-class backend probe failures, not UI problems.

## Current Repo Seams

Frontend:

- `apps/web/src/components/workbench/AgentTerminalPane.tsx`
- `apps/web/src/lib/terminal-api.ts`
- `apps/web/src/routes/workbench.tsx`

Backend:

- `services/api/app/routes/terminal.py`
- `services/api/app/events/terminal_event_schema.py`
- `services/api/app/wrappers/cli.py`
- `services/api/app/wrappers/unix.py`
- `services/api/app/wrappers/windows.py`
- `services/api/app/observability/runtime.py`

Existing terminal behavior is read-only snapshot rendering:

- wrappers POST visible terminal text to `POST /api/terminal/{agent_name}`
- browser reads `GET /api/terminal/{agent_name}`
- terminal runtime events include `terminal.snapshot.write` and `terminal.snapshot.read`

## Architecture

```text
Workbench AI Elements Terminal
  -> terminal session API
  -> TerminalSessionRegistry
  -> TerminalSessionBackend
       -> ZellijTerminalBackend
       -> TmuxTerminalBackend
       -> WindowsConsoleTerminalBackend
  -> runtime events + OpenTelemetry
```

Zellij is optional and API-managed. React must not call `zellij.exe` directly.

## Locked Decisions

1. Keep AI Elements `Terminal` as the UI renderer.
2. Keep old snapshot routes working.
3. Add managed terminal session routes separately.
4. Keep Zellij disabled by default until backend probes pass per OS.
5. Keep tmux and Win32 wrapper paths in place during migration.
6. Never emit raw terminal text, commands, cwd, tokens, prompts, responses, env vars, or secrets as
   telemetry attributes.

## API Surface

Add:

- `GET /api/terminal/backends`
- `POST /api/terminal/sessions`
- `GET /api/terminal/sessions`
- `GET /api/terminal/sessions/{session_id}`
- `GET /api/terminal/sessions/{session_id}/snapshot`
- `POST /api/terminal/sessions/{session_id}/input`
- `DELETE /api/terminal/sessions/{session_id}`

Retain:

- `POST /api/terminal/{agent_name}`
- `GET /api/terminal/{agent_name}`

## Observability Surface

Add runtime events:

- `terminal.backend.probe`
- `terminal.session.create`
- `terminal.session.ready`
- `terminal.session.snapshot`
- `terminal.session.input`
- `terminal.session.close`
- `terminal.zellij.web.start`
- `terminal.zellij.web.stop`
- `terminal.zellij.web.status`

Add spans:

- `kai_chattr.api.terminal.backends.list`
- `kai_chattr.api.terminal.sessions.create`
- `kai_chattr.api.terminal.sessions.list`
- `kai_chattr.api.terminal.sessions.get`
- `kai_chattr.api.terminal.sessions.snapshot`
- `kai_chattr.api.terminal.sessions.input`
- `kai_chattr.api.terminal.sessions.delete`
- `kai_chattr.terminal.zellij.probe`
- `kai_chattr.terminal.zellij.session.create`
- `kai_chattr.terminal.zellij.snapshot`
- `kai_chattr.terminal.zellij.input`
- `kai_chattr.terminal.zellij.close`

Allowed attrs:

- `terminal.backend`
- `terminal.session_id`
- `terminal.profile_id`
- `terminal.status`
- `terminal.exit_code`
- `terminal.duration_ms`
- `terminal.byte_count`
- `terminal.line_count`
- `terminal.has_snapshot`
- `terminal.web_port`
- `terminal.action`

## Implementation Sequence

1. Add failing `test_zellij_terminal_backend.py` for the Windows probe.
2. Add `TerminalSessionBackend` and `TerminalSessionRegistry`.
3. Implement `ZellijTerminalBackend.probe()` with strict subprocess timeouts and cleanup.
4. Prove Zellij web start/status/HTTP/stop/no-listener behavior in a backend test.
5. Prove or explicitly mark unsupported Windows headless pane create/dump/input.
6. Add terminal session routes and OpenAPI/runtime-contract tests.
7. Extend terminal runtime event schema and observability tests.
8. Wire `AgentTerminalPane` to managed session snapshots with old route fallback.
9. Add browser E2E for terminal session rendering.

## Acceptance Criteria

The Zellij terminal backend is operational only when:

1. Supported Zellij version is detected.
2. Web start returns under timeout and serves HTTP 200.
3. Web stop clears the listener.
4. Owned session create/list/close is deterministic.
5. Pane create or explicit per-OS unsupported status is deterministic.
6. Snapshot captures `KAI_ZELLIJ_PROBE`.
7. Input changes observable output.
8. Workbench renders managed session snapshots.
9. Existing `/api/terminal/{agent_name}` snapshot route still passes tests.
10. Runtime events and spans are emitted with safe attrs only.
11. Runtime verifier and workbench browser tests pass.
12. No Zellij process, session, or web listener remains after tests.

## Verification Commands

```powershell
.\tools\zellij\v0.44.3\zellij.exe --version
.\tools\zellij\v0.44.3\zellij.exe web --help
.\tools\zellij\v0.44.3\zellij.exe action --help
.\tools\zellij\v0.44.3\zellij.exe subscribe --help
```

```powershell
cd services\api
uv run pytest tests/test_terminal_snapshots.py tests/test_observability_contract.py tests/test_runtime_observability.py
uv run pytest tests/test_zellij_terminal_backend.py tests/test_terminal_sessions_api.py
```

```powershell
pnpm --dir apps/web run build
pnpm run test:workbench-browser
node scripts/dev/verify-runtime.mjs
pnpm run runtime:probe
```

## Completion Rule

Do not mark this complete because Zellij starts or because this plan exists. Mark it complete only
after the acceptance criteria pass with fresh command output.
