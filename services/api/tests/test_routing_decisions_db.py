from __future__ import annotations

import pytest


def test_sqlalchemy_routing_decision_store_separates_targets_from_mentions(tmp_path) -> None:
    from app.stores.routing_decisions_db import SqlAlchemyRoutingDecisionStore

    store = SqlAlchemyRoutingDecisionStore(f"sqlite:///{tmp_path / 'routing.db'}")

    decision = store.record_decision(
        channel="general",
        message_id=42,
        sender="jon",
        targets=["codex"],
        source="assignment",
        reason="Job owner owns the next step.",
        mentions=["claude"],
        session_id="session-1",
        workflow_id=7,
        metadata={"job_id": 7},
        created_at=1710000000.0,
    )

    assert decision["id"] == 1
    assert decision["targets"] == ["codex"]
    assert decision["mentions"] == ["claude"]
    assert decision["source"] == "assignment"
    assert decision["reason"] == "Job owner owns the next step."
    assert decision["metadata"] == {"job_id": 7}

    assert store.list_recent(target="codex")[0]["uid"] == decision["uid"]
    assert store.list_recent(target="claude") == []
    assert store.list_recent(channel="general")[0]["session_id"] == "session-1"


def test_sqlalchemy_routing_decision_store_requires_a_dispatch_target(tmp_path) -> None:
    from app.stores.routing_decisions_db import SqlAlchemyRoutingDecisionStore

    store = SqlAlchemyRoutingDecisionStore(f"sqlite:///{tmp_path / 'routing.db'}")

    with pytest.raises(ValueError, match="at least one target"):
        store.record_decision(
            channel="general",
            message_id=43,
            sender="jon",
            targets=[],
            source="mention",
            reason="No dispatch target was resolved.",
            mentions=["codex"],
        )


def test_routing_decision_store_factory_uses_sqlalchemy_when_database_configured(tmp_path) -> None:
    from app.stores.factory import create_routing_decision_store
    from app.stores.routing_decisions_db import SqlAlchemyRoutingDecisionStore

    store = create_routing_decision_store(
        {
            "database": {
                "mode": "postgres",
                "url": f"sqlite:///{tmp_path / 'routing.db'}",
            }
        }
    )

    assert isinstance(store, SqlAlchemyRoutingDecisionStore)


def test_routing_decision_migration_exists() -> None:
    from pathlib import Path

    root = Path(__file__).resolve().parents[1]
    migration_dir = root / "migrations" / "versions"
    migration = next(
        path
        for path in migration_dir.iterdir()
        if path.name.endswith("_create_routing_decisions.py")
    )
    text = migration.read_text("utf-8")

    assert "routing_decisions" in text
    assert "routing_decision_targets" in text
    assert "routing_decision_mentions" in text
    assert "ix_routing_decision_targets_target" in text
