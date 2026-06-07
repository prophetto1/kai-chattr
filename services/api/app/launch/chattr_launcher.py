from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tomllib
from dataclasses import dataclass
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = Path(__file__).with_name("agents.toml")
PROFILE_ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")


class LauncherError(RuntimeError):
    """Base launcher error."""


class InvalidRegistryError(LauncherError, ValueError):
    """Raised when the launcher registry is malformed."""


class InvalidProfileIdError(LauncherError, ValueError):
    """Raised when a profile ID is not a safe registry key."""


class UnknownProfileError(LauncherError, KeyError):
    """Raised when a requested profile is absent from the registry."""


class UnsafeLaunchError(LauncherError):
    """Raised when a profile cannot be launched safely by this path."""


@dataclass(frozen=True)
class LauncherProfile:
    profile_id: str
    kind: str
    description: str
    cwd: Path
    argv: list[str]
    visible_terminal: bool
    allow_browser_start: bool
    requires_explicit_confirmation: bool = False
    required_env: tuple[str, ...] = ()


@dataclass(frozen=True)
class BuiltCommand:
    profile_id: str
    kind: str
    description: str
    cwd: Path
    argv: list[str]
    visible_terminal: bool
    allow_browser_start: bool
    requires_explicit_confirmation: bool
    required_env: tuple[str, ...]


@dataclass(frozen=True)
class DryRunResult:
    command: BuiltCommand
    missing_required_env: tuple[str, ...]


@dataclass(frozen=True)
class StartResult:
    accepted: bool
    command: BuiltCommand
    pid: int | None
    detail: str


def normalize_profile_id(profile_id: str) -> str:
    if not isinstance(profile_id, str):
        raise InvalidProfileIdError("Invalid launcher profile: profile ID must be a string")
    normalized = profile_id.strip()
    if not normalized or not PROFILE_ID_PATTERN.fullmatch(normalized):
        raise InvalidProfileIdError(f"Invalid launcher profile: {profile_id!r}")
    return normalized


def is_terminal_visible(profile: LauncherProfile | BuiltCommand) -> bool:
    return bool(profile.visible_terminal)


def is_api_agent(profile: LauncherProfile | BuiltCommand) -> bool:
    return profile.kind == "api-agent"


def load_registry(path: Path = REGISTRY_PATH) -> dict[str, LauncherProfile]:
    raw = tomllib.loads(path.read_text(encoding="utf-8"))
    profiles_raw = raw.get("profiles", {})
    if not isinstance(profiles_raw, dict):
        raise InvalidRegistryError("Launcher registry must contain a [profiles] table")

    profiles: dict[str, LauncherProfile] = {}
    for profile_id, value in profiles_raw.items():
        normalized_id = normalize_profile_id(profile_id)
        if not isinstance(value, dict):
            raise InvalidRegistryError(f"Profile {profile_id} must be a table")

        argv = value.get("argv")
        if not isinstance(argv, list) or not all(isinstance(part, str) for part in argv):
            raise InvalidRegistryError(f"Profile {profile_id} must define argv as list[str]")

        cwd = _resolve_cwd(normalized_id, value.get("cwd", "."))
        required_env = value.get("required_env", [])
        if not isinstance(required_env, list) or not all(isinstance(name, str) for name in required_env):
            raise InvalidRegistryError(f"Profile {profile_id} must define required_env as list[str]")

        profiles[normalized_id] = LauncherProfile(
            profile_id=normalized_id,
            kind=_required_str(value, "kind", normalized_id),
            description=str(value.get("description", normalized_id)),
            cwd=cwd,
            argv=list(argv),
            visible_terminal=bool(value.get("visible_terminal", False)),
            allow_browser_start=bool(value.get("allow_browser_start", False)),
            requires_explicit_confirmation=bool(value.get("requires_explicit_confirmation", False)),
            required_env=tuple(required_env),
        )
    return profiles


def list_profiles(path: Path = REGISTRY_PATH) -> list[dict[str, Any]]:
    registry = load_registry(path)
    return [_profile_to_public_dict(profile) for profile in registry.values()]


def build_command(profile_id: str, path: Path = REGISTRY_PATH) -> BuiltCommand:
    normalized_id = normalize_profile_id(profile_id)
    registry = load_registry(path)
    if normalized_id not in registry:
        raise UnknownProfileError(f"Unknown launcher profile: {normalized_id}")
    profile = registry[normalized_id]
    return BuiltCommand(
        profile_id=profile.profile_id,
        kind=profile.kind,
        description=profile.description,
        cwd=profile.cwd,
        argv=list(profile.argv),
        visible_terminal=profile.visible_terminal,
        allow_browser_start=profile.allow_browser_start,
        requires_explicit_confirmation=profile.requires_explicit_confirmation,
        required_env=profile.required_env,
    )


def dry_run(profile_id: str) -> DryRunResult:
    command = build_command(profile_id)
    return DryRunResult(
        command=command,
        missing_required_env=_missing_required_env(command),
    )


def start(profile_id: str, dry_run: bool = False) -> StartResult:
    command = build_command(profile_id)
    if command.visible_terminal:
        raise UnsafeLaunchError(
            f"Profile {command.profile_id} requires a visible terminal and cannot be started by this launcher path"
        )

    missing_env = _missing_required_env(command)
    if missing_env:
        raise UnsafeLaunchError(f"Missing required environment: {', '.join(missing_env)}")

    if dry_run:
        return StartResult(
            accepted=True,
            command=command,
            pid=None,
            detail="dry-run only; no process started",
        )

    proc = subprocess.Popen(command.argv, cwd=str(command.cwd), shell=False)
    return StartResult(
        accepted=True,
        command=command,
        pid=proc.pid,
        detail="process started",
    )


def _resolve_cwd(profile_id: str, raw_cwd: object) -> Path:
    if not isinstance(raw_cwd, str) or not raw_cwd:
        raise InvalidRegistryError(f"Profile {profile_id} cwd must be a non-empty string")
    cwd = (REPO_ROOT / raw_cwd).resolve()
    try:
        cwd.relative_to(REPO_ROOT)
    except ValueError as exc:
        raise InvalidRegistryError(f"Profile {profile_id} cwd escapes repo root") from exc
    return cwd


def _required_str(value: dict[str, Any], key: str, profile_id: str) -> str:
    field = value.get(key)
    if not isinstance(field, str) or not field:
        raise InvalidRegistryError(f"Profile {profile_id} must define {key} as a non-empty string")
    return field


def _missing_required_env(command: BuiltCommand) -> tuple[str, ...]:
    return tuple(name for name in command.required_env if not os.environ.get(name))


def _profile_to_public_dict(profile: LauncherProfile) -> dict[str, Any]:
    return {
        "profile_id": profile.profile_id,
        "kind": profile.kind,
        "description": profile.description,
        "cwd": str(profile.cwd),
        "argv": list(profile.argv),
        "visible_terminal": profile.visible_terminal,
        "allow_browser_start": profile.allow_browser_start,
        "requires_explicit_confirmation": profile.requires_explicit_confirmation,
        "required_env": list(profile.required_env),
    }


def _command_to_public_dict(command: BuiltCommand) -> dict[str, Any]:
    return {
        "profile_id": command.profile_id,
        "kind": command.kind,
        "description": command.description,
        "cwd": str(command.cwd),
        "argv": list(command.argv),
        "visible_terminal": command.visible_terminal,
        "allow_browser_start": command.allow_browser_start,
        "requires_explicit_confirmation": command.requires_explicit_confirmation,
        "required_env": list(command.required_env),
    }


def _dry_run_to_public_dict(result: DryRunResult) -> dict[str, Any]:
    data = _command_to_public_dict(result.command)
    data["missing_required_env"] = list(result.missing_required_env)
    return data


def _start_to_public_dict(result: StartResult) -> dict[str, Any]:
    return {
        "accepted": result.accepted,
        "profile_id": result.command.profile_id,
        "pid": result.pid,
        "detail": result.detail,
        "command": _command_to_public_dict(result.command),
    }


def _write_json(data: object) -> None:
    print(json.dumps(data, indent=2, sort_keys=True))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Chattr launcher")
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser("list", help="List whitelisted launcher profiles")

    dry_run_parser = subparsers.add_parser("dry-run", help="Show the argv for a profile without starting it")
    dry_run_parser.add_argument("profile_id")

    start_parser = subparsers.add_parser("start", help="Start a launcher profile")
    start_parser.add_argument("profile_id")
    start_parser.add_argument("--dry-run", action="store_true", help="Validate start without spawning a process")

    args = parser.parse_args(argv)

    try:
        if args.command == "list":
            _write_json({"profiles": list_profiles()})
            return 0
        if args.command == "dry-run":
            _write_json(_dry_run_to_public_dict(dry_run(args.profile_id)))
            return 0
        if args.command == "start":
            _write_json(_start_to_public_dict(start(args.profile_id, dry_run=args.dry_run)))
            return 0
    except LauncherError as exc:
        print(str(exc), file=sys.stderr)
        return 2

    parser.error(f"unknown command: {args.command}")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
