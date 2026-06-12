from __future__ import annotations

import os
import platform
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

from app.launch.chattr_launcher import BuiltCommand, build_command, load_registry
from app.runtime_contract import DEFAULT_API_PORT, DEFAULT_MCP_HTTP_PORT, DEFAULT_MCP_SSE_PORT


REGISTRATION_DEADLINE_MS = 30_000


class VisibleAgentLaunchError(RuntimeError):
    """Raised when a profile is not eligible for visible agent launch."""


class VisibleAgentPreflightError(VisibleAgentLaunchError):
    """Raised when a visible agent profile fails preflight checks."""


@dataclass(frozen=True)
class VisiblePreflight:
    profile_id: str
    kind: str
    description: str
    base: str
    label: str
    visible_terminal: bool
    requires_explicit_confirmation: bool
    ready: bool
    blocked_reason: str | None
    checks: dict[str, bool]

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "profile_id": self.profile_id,
            "kind": self.kind,
            "description": self.description,
            "base": self.base,
            "label": self.label,
            "visible_terminal": self.visible_terminal,
            "requires_explicit_confirmation": self.requires_explicit_confirmation,
            "ready": self.ready,
            "blocked_reason": self.blocked_reason,
            "checks": dict(self.checks),
        }


def preflight_visible_cli_profiles() -> dict[str, Any]:
    profiles = []
    for profile in load_registry().values():
        if profile.kind != "cli-agent" or not profile.visible_terminal:
            continue
        command = build_command(profile.profile_id)
        profiles.append(_preflight(command).to_public_dict())

    return {
        "runtime": {
            "api_port": DEFAULT_API_PORT,
            "mcp_http_port": DEFAULT_MCP_HTTP_PORT,
            "mcp_sse_port": DEFAULT_MCP_SSE_PORT,
        },
        "profiles": profiles,
    }


def start_visible_agent(profile_id: str) -> dict[str, Any]:
    command = build_command(profile_id)
    _require_visible_cli(command)

    check = _preflight(command)
    if not check.ready:
        raise VisibleAgentPreflightError(check.blocked_reason or "visible agent preflight failed")

    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    creationflags = 0
    if platform.system() == "Windows":
        creationflags = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)

    proc = subprocess.Popen(
        command.argv,
        cwd=str(command.cwd),
        env=env,
        shell=False,
        creationflags=creationflags,
    )
    return {
        "profile_id": command.profile_id,
        "accepted": True,
        "detail": "visible console started",
        "pid": proc.pid,
        "expected_base": check.base,
        "registration_deadline_ms": REGISTRATION_DEADLINE_MS,
    }


def start_headless_agent(profile_id: str) -> dict[str, Any]:
    """Launch the wrapper with NO console window (the user's stated objective:
    terminals don't spawn externally). Forces the PTY transport via env
    override — console injection requires a console, which headless lacks.
    Visibility comes from the workbench (snapshots now, live attach later);
    input flows through the chat/queue injection path.
    """
    command = build_command(profile_id)
    _require_visible_cli(command)

    check = _preflight(command)
    if not check.ready:
        raise VisibleAgentPreflightError(check.blocked_reason or "agent preflight failed")

    env = dict(os.environ)
    env.pop("VIRTUAL_ENV", None)
    env["KAI_CHATTR_TRANSPORT_OVERRIDE"] = "pty"
    creationflags = 0
    if platform.system() == "Windows":
        creationflags = getattr(subprocess, "CREATE_NO_WINDOW", 0)

    proc = subprocess.Popen(
        command.argv,
        cwd=str(command.cwd),
        env=env,
        shell=False,
        creationflags=creationflags,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    return {
        "profile_id": command.profile_id,
        "accepted": True,
        "detail": "headless start (no window, pty transport)",
        "pid": proc.pid,
        "expected_base": check.base,
        "registration_deadline_ms": REGISTRATION_DEADLINE_MS,
    }


def _require_visible_cli(command: BuiltCommand) -> None:
    if command.kind != "cli-agent" or not command.visible_terminal:
        raise VisibleAgentLaunchError(f"Profile {command.profile_id} is not a visible CLI profile")


def _preflight(command: BuiltCommand) -> VisiblePreflight:
    _require_visible_cli(command)
    base = _expected_base(command)
    checks = {
        "uv": shutil.which("uv") is not None,
        "wrapper": (command.cwd / "wrapper.py").exists(),
        "provider_cli": shutil.which(base) is not None,
    }
    blocked_reason = _blocked_reason(checks, base)
    return VisiblePreflight(
        profile_id=command.profile_id,
        kind=command.kind,
        description=command.description,
        base=base,
        label=_label_from_command(command, base),
        visible_terminal=command.visible_terminal,
        requires_explicit_confirmation=command.requires_explicit_confirmation,
        ready=blocked_reason is None,
        blocked_reason=blocked_reason,
        checks=checks,
    )


def _expected_base(command: BuiltCommand) -> str:
    for index, part in enumerate(command.argv):
        if part == "wrapper.py" and index + 1 < len(command.argv):
            return command.argv[index + 1]
    pieces = command.profile_id.split(".")
    return pieces[1] if len(pieces) > 1 else command.profile_id


def _label_from_command(command: BuiltCommand, base: str) -> str:
    description = command.description
    marker = "Start "
    if description.startswith(marker) and " through " in description:
        return description[len(marker):].split(" through ", 1)[0]
    return base.capitalize()


def _blocked_reason(checks: dict[str, bool], base: str) -> str | None:
    if not checks["uv"]:
        return "uv not found on PATH"
    if not checks["wrapper"]:
        return "wrapper.py not found"
    if not checks["provider_cli"]:
        return f"provider CLI not found on PATH: {base}"
    return None
