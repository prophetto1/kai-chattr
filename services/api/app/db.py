"""Runtime-owned SQLite (stdlib).

The runtime owns its own SQLite file; the path comes from env
(`KAI_CHATTR_API_DB_PATH`), never hardcoded — this is what lets the same binary
run local or in a cloud namespace. The file is created once at startup via
`init_db()` (called from the app lifespan); `db_ok()` is a read-only probe used
by `/health` and must have no side effects.
"""
from __future__ import annotations

import os
import sqlite3

from app.settings import settings


def _connect() -> sqlite3.Connection:
    return sqlite3.connect(settings.db_path)


def init_db() -> None:
    """Create the DB file's parent dir + the file once, at service startup."""
    parent = os.path.dirname(settings.db_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    _connect().close()


def db_ok() -> bool:
    """Read-only connectivity probe for /health — `SELECT 1`, no side effects."""
    try:
        con = _connect()
        try:
            con.execute("SELECT 1")
            return True
        finally:
            con.close()
    except sqlite3.Error:
        return False
