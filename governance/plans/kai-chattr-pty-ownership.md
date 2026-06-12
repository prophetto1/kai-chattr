# PTY ownership — the named requirement behind "backend owns PTY/process/session"

**Status:** Requirement locked by Jon (2026-06-11). Priority: top-3 objective of the
chattr → kai-chattr migration — **not optional**. Implementation plan to follow
(amends `docs/plans/kai-chattr-terminal-foundation-phase1-implementation-plan.md`,
machine-local).

## The binding (read this first)

This requirement circled for weeks because it never had its name attached.
Bind these permanently:

> **Requirement (Jon, plain language):** the backend owns the agent's
> PTY/process/session; the wrapper *is* the terminal — not a keystroke injector
> into a console it shares.
>
> **Named architecture:** **ConPTY ownership** (Windows, via
> `CreatePseudoConsole` / pywinpty) and **openpty** (Unix). The wrapper creates
> the pseudoconsole, spawns the agent CLI attached to it, writes input as bytes
> to the input pipe, and reads the authoritative VT byte stream from the output
> pipe.

Any future terminal/wrapper discussion that describes the first paragraph is
talking about the second. Do not re-derive it.

## What this inverts

Today (`services/api/app/wrappers/`): the wrapper shares a console with the
agent CLI and synthesizes keystrokes — `WriteConsoleInputW` batches
(`windows.py`), a `wm_setfocus` fake-focus Enter backend (default,
`config.toml`) because Copilot's Ink drops Enter when unfocused, sleeps scaled
to text length, and capture that de-noises "ConPTY artifacts" because it polls
the console buffer ConPTY repaints. Unix uses tmux `send-keys`; `zellij.py`
mirrors the same surface. Timing-dependent, focus-dependent, per-TUI hacks.

Under PTY ownership:

- **Input is a pipe write.** Prompt text + `\r` as bytes. No key-event records,
  no VK codes, no scaled sleeps. There is no window focus state; if a TUI
  subscribes to focus events, the wrapper sends `\x1b[I` deterministically.
  The per-agent `enter_backend` switch collapses to nothing.
- **Output is a stream, not a scrape.** Read the VT stream continuously, feed a
  headless emulator (pyte), and snapshots become structured screen state — no
  artifact filtering. The same stream feeds the OTel pipeline already wired:
  keystroke-to-render telemetry of every agent session (the runtime-layer
  observability differentiator).
- **One PTY abstraction, two thin backends.** ConPTY on Windows, openpty on
  Unix. tmux/Zellij stop being control paths; they are optional human views
  (consistent with the wterm lock: Zellij disabled-by-default fallback).
- **One core, two consumers.** The agent control plane reads/writes the pipes;
  the Phase 1 human terminal (FastAPI WS → xterm.js) renders the same stream.

## Kill-list (frozen — no new investment)

- `WriteConsoleInputW` injection path (`wrappers/windows.py`)
- `wm_setfocus` / `console_input` Enter backends and the `enter_backend` config
- Length-scaled input sleeps
- Console-buffer capture de-noising ("invisible buffer noise" filtering)
- `send-keys`-style control paths (tmux/Zellij); the unsolved Zellij-on-Windows
  Enter-submission investigation is moot under this requirement

These stay functional until the PTY core replaces them agent-by-agent, but no
lane extends or "fixes" them.

## Constraints

- **Clean-room re-implementation.** Jon has built this architecture before in a
  prior work project — that is feasibility evidence only. No code from that
  project enters this public AGPL repo.
- The CLI is *spawned by* the wrapper; "adopt an existing visible window" goes
  away by design.
- Emit only existing frozen runtime event types from the stream tap.
- Known ConPTY quirks to design around: resize-triggered repaints, output
  coalescing, no scrollback API (the screen model owns the buffer).
- Per-TUI behaviors (bracketed paste, paste detection) are handled at the byte
  level in the PTY core, never with window/focus hacks.

## Migration order (proposed, pending implementation plan)

1. PTY core module with the two backends + pyte screen model, TDD against
   `tests/fixtures/fake_cli_agent.py` — no sleeps, no focus hacks.
2. Port one agent CLI behind a config flag; verify Copilot/Ink Enter works
   headless-unfocused.
3. Swap remaining agents; wire the OTel stream tap.
4. Delete the kill-list; Phase 1 WS terminal consumes the PTY core.
