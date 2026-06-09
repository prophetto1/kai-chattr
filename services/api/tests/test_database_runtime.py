import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = ROOT.parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app import config as config_loader  # noqa: E402


def test_database_url_env_selects_postgres_mode(monkeypatch):
    monkeypatch.setenv(
        "KAI_CHATTR_DATABASE_URL",
        "postgresql://kai_chattr:secret@ep-dev-example.us-east-2.aws.neon.tech/kai_chattr_dev?sslmode=require",
    )

    config = config_loader.load_config(ROOT)

    assert config["database"]["mode"] == "postgres"
    assert config["database"]["url"] == os.environ["KAI_CHATTR_DATABASE_URL"]


def test_hosted_env_overrides_select_host_port_and_allowed_origins(monkeypatch):
    monkeypatch.setenv("CHATTR_HOST", "0.0.0.0")
    monkeypatch.setenv("PORT", "9000")
    monkeypatch.setenv(
        "KAI_CHATTR_ALLOWED_ORIGINS",
        "https://dev.kai-chattr.pages.dev,https://kai-chattr.pages.dev/",
    )

    config = config_loader.load_config(ROOT)

    assert config["server"]["host"] == "0.0.0.0"
    assert config["server"]["port"] == 9000
    assert config["security"]["allowed_origins"] == [
        "https://dev.kai-chattr.pages.dev",
        "https://kai-chattr.pages.dev",
    ]


def test_alembic_scaffold_exists_for_services_api():
    assert (ROOT / "alembic.ini").exists()
    env_py = ROOT / "migrations" / "env.py"
    assert env_py.exists()
    assert 'VERSION_TABLE = "kai_chattr_alembic_version"' in env_py.read_text("utf-8")
    assert "MIGRATION_DATABASE_URL_ENV" in env_py.read_text("utf-8")
    versions = ROOT / "migrations" / "versions"
    assert versions.exists()
    assert any(path.name.endswith("_create_board_rules.py") for path in versions.iterdir())
    assert any(path.name.endswith("_create_board_workflows.py") for path in versions.iterdir())
    assert any(path.name.endswith("_create_routing_decisions.py") for path in versions.iterdir())


def test_file_rule_store_counts_pending_proposed_rules(tmp_path):
    from app.stores.rules import RuleStore

    store = RuleStore(str(tmp_path / "rules.json"))
    created = store.propose("Review proposed rules before drafting.", "codex")

    assert created is not None
    assert created["status"] == "pending"
    assert store.count_proposed() == 1
    assert store.count_draft() == 0

    drafted = store.make_draft(created["id"])

    assert drafted["status"] == "draft"
    assert store.count_proposed() == 0
    assert store.count_draft() == 1


def test_sqlalchemy_rule_store_supports_rule_lifecycle(tmp_path):
    from app.stores.rules_db import SqlAlchemyRuleStore

    store = SqlAlchemyRuleStore(f"sqlite:///{tmp_path / 'rules.db'}")

    created = store.propose(
        "Keep Board rules in the API-owned data plane.",
        "codex",
        "Postgres migration smoke test",
    )
    assert created is not None
    assert created["id"] == 1
    assert created["status"] == "pending"
    assert store.count_proposed() == 1
    assert store.count_draft() == 0

    drafted = store.make_draft(created["id"])
    assert drafted["status"] == "draft"
    assert store.count_proposed() == 0
    assert store.count_draft() == 1

    activated = store.activate(created["id"])
    assert activated["status"] == "active"
    assert store.active_list() == {
        "epoch": 1,
        "rules": ["Keep Board rules in the API-owned data plane."],
    }

    edited = store.edit(created["id"], text="Keep Board rules in Postgres.")
    assert edited["text"] == "Keep Board rules in Postgres."
    assert store.active_list()["epoch"] == 2

    archived = store.deactivate(created["id"])
    assert archived["status"] == "archived"
    assert store.active_list() == {"epoch": 3, "rules": []}

    deleted = store.delete(created["id"])
    assert deleted["id"] == created["id"]
    assert store.list_all() == []


def test_create_database_engine_configures_sqlalchemy_instrumentation_once(monkeypatch):
    from app import database

    calls: list[str] = []

    class RecordingInstrumentor:
        def instrument(self) -> None:
            calls.append("instrument")

    monkeypatch.setattr(database, "SQLAlchemyInstrumentor", RecordingInstrumentor)
    monkeypatch.setattr(database, "_SQLALCHEMY_INSTRUMENTED", False)

    first = database.create_database_engine("sqlite:///:memory:")
    second = database.create_database_engine("sqlite:///:memory:")
    try:
        assert calls == ["instrument"]
    finally:
        first.dispose()
        second.dispose()


def test_sqlalchemy_stores_use_observable_database_engine_factory(tmp_path, monkeypatch):
    from app.stores import home_start_db, jobs_db, routing_decisions_db, rules_db

    calls: list[str] = []
    original = rules_db.create_database_engine

    def recording_factory(url: str):
        calls.append(url)
        return original(url)

    for module in (home_start_db, jobs_db, routing_decisions_db, rules_db):
        monkeypatch.setattr(module, "create_database_engine", recording_factory)

    db_path = tmp_path / "observable.db"
    url = f"sqlite:///{db_path}"

    rules_db.SqlAlchemyRuleStore(url)
    jobs_db.SqlAlchemyJobStore(url)
    routing_decisions_db.SqlAlchemyRoutingDecisionStore(url)
    home_start_db.SqlAlchemyHomeStartStore(url)

    assert calls == [url, url, url, url]


def test_rule_store_factory_uses_sqlalchemy_when_database_configured(tmp_path):
    from app.stores.factory import create_rule_store
    from app.stores.rules_db import SqlAlchemyRuleStore

    config = {
        "database": {
            "mode": "postgres",
            "url": f"sqlite:///{tmp_path / 'rules.db'}",
        }
    }

    store = create_rule_store(config, str(tmp_path / "rules.json"))

    assert isinstance(store, SqlAlchemyRuleStore)


def test_sqlalchemy_job_store_supports_workflow_lifecycle(tmp_path):
    from app.stores.jobs_db import SqlAlchemyJobStore

    store = SqlAlchemyJobStore(f"sqlite:///{tmp_path / 'jobs.db'}")

    created = store.create(
        title="Define the workflow schema",
        job_type="workflow",
        channel="general",
        created_by="codex",
        assignee="codex",
        body="Persist Board jobs as workflows.",
    )

    assert created["id"] == 1
    assert created["type"] == "workflow"
    assert created["status"] == "open"
    assert created["sort_order"] == 1
    assert store.list_all(status="open")[0]["title"] == "Define the workflow schema"

    msg = store.add_message(created["id"], "jon", "Please make it work.")
    assert msg["id"] == 0
    assert store.get_messages(created["id"])[0]["text"] == "Please make it work."

    resolved = store.resolve_message(created["id"], 0, "accepted")
    assert resolved["resolved"] == "accepted"

    updated = store.update_status(created["id"], "done")
    assert updated["status"] == "done"

    deleted_msg = store.delete_message(created["id"], 0)
    assert deleted_msg == {"job_id": created["id"], "message_id": 0}
    assert store.get_messages(created["id"])[0]["deleted"] is True

    deleted = store.delete(created["id"])
    assert deleted["id"] == created["id"]
    assert store.list_all() == []


def test_job_store_factory_uses_sqlalchemy_when_database_configured(tmp_path):
    from app.stores.factory import create_job_store
    from app.stores.jobs_db import SqlAlchemyJobStore

    config = {
        "database": {
            "mode": "postgres",
            "url": f"sqlite:///{tmp_path / 'jobs.db'}",
        }
    }

    store = create_job_store(config, str(tmp_path / "jobs.json"))

    assert isinstance(store, SqlAlchemyJobStore)
