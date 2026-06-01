#!/usr/bin/env python3
"""Python dependency-allowlist gate — parity with check-deps.mjs (npm).

Fails (exit 1) if any apps/services/packages `*/pyproject.toml` declares a
dependency not present in governance/allowed-deps.json under its workspace key,
"shared", or "tooling". Uses the stdlib `tomllib` (Python 3.11+) — no Node TOML
parsing. No-op (passes) until a pyproject.toml lands.

Scope: PEP 621 `[project] dependencies` + `[project.optional-dependencies]` and
PEP 735 `[dependency-groups]`. `[build-system].requires` (build-backend deps) is
intentionally NOT scanned.
"""
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]  # governance/scripts -> repo root
allow = json.loads((ROOT / "governance/allowed-deps.json").read_text("utf-8"))


# PEP 503 normalization so `pydantic_settings` / `Pydantic.Settings` all compare
# equal to the allowlist's canonical `pydantic-settings`.
def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).strip().lower()


always = {_norm(x) for x in (*allow.get("shared", []), *allow.get("tooling", []))}

# PEP 508 requirement -> distribution name (strip extras/version/markers).
_NAME = re.compile(r"^[A-Za-z0-9._-]+")


def dep_names(pyproject: dict) -> set[str]:
    reqs: list[str] = []
    project = pyproject.get("project", {})
    reqs += [r for r in project.get("dependencies", []) if isinstance(r, str)]
    for extra in project.get("optional-dependencies", {}).values():
        reqs += [r for r in extra if isinstance(r, str)]
    for grp in pyproject.get("dependency-groups", {}).values():
        reqs += [r for r in grp if isinstance(r, str)]
    names: set[str] = set()
    for r in reqs:
        m = _NAME.match(r.strip())
        if m:
            names.add(_norm(m.group(0)))
    return names


violations = 0
for group in ("apps", "services", "packages"):
    base = ROOT / group
    if not base.is_dir():
        continue
    for d in sorted(base.iterdir()):
        pp = d / "pyproject.toml"
        if not pp.is_file():
            continue
        rel = d.relative_to(ROOT).as_posix()
        allowed = always | {_norm(x) for x in allow.get(rel, [])}
        with pp.open("rb") as fh:
            data = tomllib.load(fh)
        for dep in sorted(dep_names(data)):
            if dep not in allowed:
                print(
                    f'FAIL {rel}/pyproject.toml: "{dep}" is NOT in the allowlist. '
                    "Confirm it with Jon and add it to governance/allowed-deps.json.",
                    file=sys.stderr,
                )
                violations += 1

if violations:
    print(
        f"\nBLOCKED: {violations} unapproved Python dependency(ies). "
        "See governance/allowed-deps.json.",
        file=sys.stderr,
    )
    sys.exit(1)
print("OK: All declared Python dependencies are on the allowlist.")
