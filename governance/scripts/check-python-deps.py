#!/usr/bin/env python3
"""Python dependency-allowlist gate.

The allowlist data lives in governance/contracts/architecture.json under
allowedDeps. Scans apps/services/packages */pyproject.toml.
"""
from __future__ import annotations

import json
import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
architecture = json.loads(
    (ROOT / "governance/contracts/architecture.json").read_text("utf-8")
)
allow = architecture.get("allowedDeps", {})


def _norm(name: str) -> str:
    return re.sub(r"[-_.]+", "-", name).strip().lower()


always = {_norm(x) for x in (*allow.get("shared", []), *allow.get("tooling", []))}
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
                    f'FAIL {rel}/pyproject.toml: "{dep}" is not in Architecture allowedDeps.',
                    file=sys.stderr,
                )
                violations += 1

if violations:
    print(
        f"\nBLOCKED: {violations} unapproved Python dependency(ies). "
        "See governance/contracts/architecture.json allowedDeps.",
        file=sys.stderr,
    )
    sys.exit(1)
print("OK: All declared Python dependencies are in Architecture allowedDeps.")
