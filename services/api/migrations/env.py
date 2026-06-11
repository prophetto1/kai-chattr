from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.database import (  # noqa: E402
    DATABASE_URL_ENV,
    MIGRATION_DATABASE_URL_ENV,
    normalize_database_url,
)
from app.stores.base import Base  # noqa: E402
import app.stores.rules_db  # noqa: E402, F401
import app.stores.jobs_db  # noqa: E402, F401
import app.stores.home_start_db  # noqa: E402, F401
import app.stores.routing_decisions_db  # noqa: E402, F401
import app.stores.identity_db  # noqa: E402, F401

config = context.config
VERSION_TABLE = "kai_chattr_alembic_version"

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    url = normalize_database_url(
        os.environ.get(MIGRATION_DATABASE_URL_ENV, "")
        or os.environ.get(DATABASE_URL_ENV, "")
    )
    if not url:
        raise RuntimeError(
            f"{MIGRATION_DATABASE_URL_ENV} or {DATABASE_URL_ENV} is required to run API migrations"
        )
    return url


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        version_table=VERSION_TABLE,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    section = config.get_section(config.config_ini_section, {})
    section["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        section,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            version_table=VERSION_TABLE,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
