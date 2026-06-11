#!/usr/bin/env python3
"""Requirements/pyproject sync gate.

services/api/Dockerfile installs from requirements.txt, but developers declare
dependencies in pyproject.toml [project].dependencies. If the two drift, the
Fly release command crashes at import time (see the 2026-06-11 outage where
opentelemetry-instrumentation-* was missing from requirements.txt and every
API deploy failed). This gate fails fast instead.
"""
from __future__ import annotations

import re
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "services/api"

_REQ = re.compile(r"^([A-Za-z0-9._-]+)(\[[^\]]*\])?\s*(.*)$")


def _parse(req: str) -> tuple[str, str, str] | None:
    req = req.split("#", 1)[0].strip()
    if not req:
        return None
    m = _REQ.match(req)
    if not m:
        return None
    name = re.sub(r"[-_.]+", "-", m.group(1)).lower()
    extras = (m.group(2) or "").replace(" ", "").lower()
    spec = (m.group(3) or "").replace(" ", "")
    return (name, extras, spec)


def _load_pyproject() -> dict[str, tuple[str, str, str]]:
    with (API / "pyproject.toml").open("rb") as fh:
        data = tomllib.load(fh)
    deps = data.get("project", {}).get("dependencies", [])
    parsed = (_parse(r) for r in deps if isinstance(r, str))
    return {p[0]: p for p in parsed if p}


def _load_requirements() -> dict[str, tuple[str, str, str]]:
    lines = (API / "requirements.txt").read_text("utf-8-sig").splitlines()
    parsed = (_parse(line) for line in lines)
    return {p[0]: p for p in parsed if p}


pyproject = _load_pyproject()
requirements = _load_requirements()

violations = 0
for name in sorted(set(pyproject) | set(requirements)):
    py, rq = pyproject.get(name), requirements.get(name)
    if py and not rq:
        print(
            f'FAIL services/api/requirements.txt: missing "{name}" '
            "(declared in pyproject.toml — the Docker image will not install it).",
            file=sys.stderr,
        )
        violations += 1
    elif rq and not py:
        print(
            f'FAIL services/api/pyproject.toml: missing "{name}" '
            "(present only in requirements.txt).",
            file=sys.stderr,
        )
        violations += 1
    elif py != rq:
        print(
            f'FAIL services/api: "{name}" differs — pyproject.toml has '
            f'"{py[1]}{py[2]}", requirements.txt has "{rq[1]}{rq[2]}".',
            file=sys.stderr,
        )
        violations += 1

if violations:
    print(
        f"\nBLOCKED: {violations} drift(s) between services/api/pyproject.toml and "
        "requirements.txt. Keep both in sync — the Dockerfile installs requirements.txt.",
        file=sys.stderr,
    )
    sys.exit(1)
print("OK: services/api requirements.txt matches pyproject.toml dependencies.")
