"""Tests for the Phase 0 identity/workspace/chat data plane (Slice 1).

These exercise the SQLAlchemy models and the thin identity store against an
in-memory SQLite engine (StaticPool so every session sees the same database).
They lock the persistence contract from
``governance/plans/kai-chattr-scope-based-routing-foundation.md``:

- seven foundation tables registered on the shared ``Base`` metadata,
- opaque, server-generated ``session_hash`` that is never derived from title,
- normalized-email uniqueness on ``users`` (locked S1 audit decision),
- a ``tier`` column on ``workspaces`` (locked S5 audit decision),
- membership-based linkage between users and workspaces.
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.exc import IntegrityError
from sqlalchemy.pool import StaticPool


def _memory_engine():
    return create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )


def test_base_metadata_carries_all_foundation_tables():
    from app.stores.base import Base
    import app.stores.identity_db  # noqa: F401  (registers models on Base)

    expected = {
        "users",
        "auth_credentials",
        "auth_sessions",
        "workspaces",
        "workspace_memberships",
        "chat_sessions",
        "chat_messages",
    }
    assert expected.issubset(set(Base.metadata.tables))


def test_create_user_normalizes_email():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="Alice@Example.COM", display_name="Alice")

    assert user["email_normalized"] == "alice@example.com"
    assert user["display_name"] == "Alice"
    assert user["status"] == "active"
    # Internal id is exposed as a stable string, not a raw UUID object.
    assert isinstance(user["id"], str)
    uuid.UUID(user["id"])  # parses as a real UUID


def test_duplicate_normalized_email_is_rejected():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    store.create_user(email="dup@example.com", display_name="First")

    with pytest.raises(IntegrityError):
        store.create_user(email="DUP@example.com", display_name="Second")


def test_workspace_gets_opaque_public_id_and_tier():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="owner@example.com", display_name="Owner")

    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])

    assert ws["public_id"]
    assert ws["public_id"] != ws["id"]  # public identifier is not the internal UUID
    assert ws["tier"] == "free"  # S5: tier column with a sane default


def test_explicit_workspace_public_id_is_honored():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="owner2@example.com", display_name="Owner")

    ws = store.create_workspace(name="Local", created_by_user_id=user["id"], public_id="local")

    assert ws["public_id"] == "local"


def test_membership_links_user_and_workspace():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="member@example.com", display_name="Member")
    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])

    membership = store.add_membership(workspace_id=ws["id"], user_id=user["id"], role="owner")

    assert membership["role"] == "owner"
    assert membership["workspace_id"] == ws["id"]
    assert membership["user_id"] == user["id"]


def test_chat_session_hash_is_opaque_and_not_derived_from_title():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="chatter@example.com", display_name="Chatter")
    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])

    session = store.create_chat_session(
        workspace_id=ws["id"],
        created_by_user_id=user["id"],
        title="My First Chat",
        mode="scratch",
    )

    assert session["session_hash"].startswith("sess_")
    assert "my-first-chat" not in session["session_hash"].lower()
    assert session["title"].lower() not in session["session_hash"].lower()
    assert session["mode"] == "scratch"
    assert session["status"] == "active"
    # created_by comes from auth-supplied id, never URL input.
    assert session["created_by_user_id"] == user["id"]


def test_chat_session_hashes_are_unique_per_session():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="multi@example.com", display_name="Multi")
    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])

    first = store.create_chat_session(
        workspace_id=ws["id"], created_by_user_id=user["id"], title="A", mode="scratch"
    )
    second = store.create_chat_session(
        workspace_id=ws["id"], created_by_user_id=user["id"], title="A", mode="scratch"
    )

    assert first["session_hash"] != second["session_hash"]


def test_append_message_belongs_to_session():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="writer@example.com", display_name="Writer")
    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])
    session = store.create_chat_session(
        workspace_id=ws["id"], created_by_user_id=user["id"], title="Chat", mode="scratch"
    )

    message = store.append_message(
        chat_session_id=session["id"],
        role="user",
        content="hello world",
        author_user_id=user["id"],
    )

    assert message["chat_session_id"] == session["id"]
    assert message["role"] == "user"
    assert message["content"] == "hello world"

    messages = store.list_messages(session["id"])
    assert [m["content"] for m in messages] == ["hello world"]


def test_auth_credential_stores_hash_only():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="cred@example.com", display_name="Cred")

    cred = store.add_password_credential(
        user_id=user["id"],
        email_normalized="cred@example.com",
        password_hash="$argon2id$v=19$fake$hash",
    )

    assert cred["provider"] == "password"
    assert cred["password_hash"].startswith("$argon2id$")
    # The store never accepts or echoes a plaintext password field.
    assert "password" not in {k for k in cred if k != "password_hash"}


def test_migration_file_chains_from_routing_decisions():
    """Guard the Alembic revision chain without needing a live Postgres."""
    import importlib.util
    from pathlib import Path

    migration_path = (
        Path(__file__).resolve().parents[1]
        / "migrations"
        / "versions"
        / "20260611_0005_create_identity_foundation.py"
    )
    assert migration_path.exists()

    spec = importlib.util.spec_from_file_location("identity_migration", migration_path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    assert module.revision == "20260611_0005"
    assert module.down_revision == "20260609_0004"
    assert callable(module.upgrade)
    assert callable(module.downgrade)


def test_chat_messages_get_monotonic_sequence():
    from app.stores.identity_db import SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="seq@example.com", display_name="Seq")
    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])
    session = store.create_chat_session(
        workspace_id=ws["id"], created_by_user_id=user["id"], title="Chat", mode="scratch"
    )

    first = store.append_message(chat_session_id=session["id"], role="user", content="one")
    second = store.append_message(chat_session_id=session["id"], role="agent", content="two")

    assert first["sequence"] == 0
    assert second["sequence"] == 1
    # list_messages orders by the explicit sequence, not insertion timestamp (S6).
    assert [m["content"] for m in store.list_messages(session["id"])] == ["one", "two"]


def test_duplicate_sequence_in_session_is_rejected():
    from app.stores.identity_db import ChatMessage, SqlAlchemyIdentityStore

    store = SqlAlchemyIdentityStore(_memory_engine())
    user = store.create_user(email="dupseq@example.com", display_name="Dup")
    ws = store.create_workspace(name="Acme", created_by_user_id=user["id"])
    session = store.create_chat_session(
        workspace_id=ws["id"], created_by_user_id=user["id"], title="Chat", mode="scratch"
    )
    store.append_message(chat_session_id=session["id"], role="user", content="one")  # sequence 0

    # Force a second row into the same (session, sequence) slot: the DB must reject it.
    with store._sessions() as raw:  # noqa: SLF001  (white-box: prove the unique constraint)
        raw.add(
            ChatMessage(
                chat_session_id=uuid.UUID(session["id"]),
                sequence=0,
                role="user",
                content="dup",
            )
        )
        with pytest.raises(IntegrityError):
            raw.commit()


def test_identity_store_sqlite_creates_only_its_own_tables():
    from sqlalchemy import inspect

    import app.stores.rules_db  # noqa: F401  (registers board tables on the shared Base)
    from app.stores.identity_db import SqlAlchemyIdentityStore

    engine = _memory_engine()
    SqlAlchemyIdentityStore(engine)  # __init__ runs the scoped create_all
    created = set(inspect(engine).get_table_names())

    # The identity store must create its own tables...
    assert {"users", "chat_messages", "workspaces"}.issubset(created)
    # ...but NOT board tables that merely share Base.metadata (audit guard).
    assert "board_rules" not in created
