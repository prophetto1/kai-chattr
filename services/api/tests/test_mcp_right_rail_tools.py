import importlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from app.stores.jobs import JobStore
from app.stores.rules import RuleStore
from app.stores.locked import LockedStore
from app.stores.messages import MessageStore


def configure_bridge(tmp_path):
    from app.mcp import bridge as mcp_bridge

    bridge = importlib.reload(mcp_bridge)
    bridge.store = MessageStore(str(tmp_path / "chattr_log.jsonl"))
    bridge.rules = RuleStore(str(tmp_path / "rules.json"))
    bridge.jobs = JobStore(str(tmp_path / "jobs.json"))
    bridge.locked = LockedStore(str(tmp_path / "locked.json"))
    bridge.room_settings = {"channels": ["general"]}
    bridge.registry = None
    bridge.router = None
    bridge.agents = None
    bridge.config = {"images": {"upload_dir": str(tmp_path / "uploads")}}
    return bridge


def parse_result(raw):
    return json.loads(raw)


def test_manifest_exposes_right_rail_tools_without_artifacts(tmp_path):
    bridge = configure_bridge(tmp_path)

    manifest = parse_result(bridge.chat_tool_manifest())
    categories = {entry["category"] for entry in manifest}
    tools = {entry["name"]: entry for entry in manifest}

    assert tools["chat_rules"]["category"] == "rules"
    assert tools["chat_jobs"]["category"] == "jobs"
    assert tools["chat_pins"]["category"] == "pins"
    assert tools["chat_locked"]["category"] == "locked"
    assert "artifacts" not in categories


def test_rules_tool_supports_full_read_write_lifecycle(tmp_path):
    bridge = configure_bridge(tmp_path)

    created = parse_result(
        bridge.chat_rules(
            action="propose",
            sender="codex",
            rule="Keep MCP parity for right rail tabs.",
        )
    )
    rule_id = created["id"]

    activated = parse_result(
        bridge.chat_rules(action="activate", sender="codex", rule_id=rule_id)
    )
    assert activated["status"] == "active"

    edited = parse_result(
        bridge.chat_rules(
            action="edit",
            sender="codex",
            rule_id=rule_id,
            rule="Keep MCP parity for every retained right rail tab.",
        )
    )
    assert edited["text"] == "Keep MCP parity for every retained right rail tab."

    all_rules = parse_result(bridge.chat_rules(action="list_all", sender="codex"))
    assert [item["id"] for item in all_rules] == [rule_id]

    archived = parse_result(
        bridge.chat_rules(action="archive", sender="codex", rule_id=rule_id)
    )
    assert archived["status"] == "archived"

    deleted = parse_result(
        bridge.chat_rules(action="delete", sender="codex", rule_id=rule_id)
    )
    assert deleted["ok"] is True
    assert parse_result(bridge.chat_rules(action="list_all", sender="codex")) == []


def test_jobs_tool_supports_full_read_write_lifecycle(tmp_path):
    bridge = configure_bridge(tmp_path)

    created = parse_result(
        bridge.chat_jobs(
            action="create",
            sender="codex",
            title="Standardize right rail MCP",
            body="Make jobs readable and editable through MCP.",
            channel="general",
        )
    )
    job_id = created["id"]

    updated = parse_result(
        bridge.chat_jobs(
            action="update",
            sender="codex",
            job_id=job_id,
            title="Right rail MCP parity",
            status="done",
            assignee="claude",
        )
    )
    assert updated["title"] == "Right rail MCP parity"
    assert updated["status"] == "done"
    assert updated["assignee"] == "claude"

    message = parse_result(
        bridge.chat_jobs(
            action="message",
            sender="codex",
            job_id=job_id,
            message="Job thread is reachable from MCP.",
        )
    )
    assert message["text"] == "Job thread is reachable from MCP."

    details = parse_result(bridge.chat_jobs(action="get", sender="codex", job_id=job_id))
    assert details["id"] == job_id
    assert details["messages"][0]["text"] == "Job thread is reachable from MCP."

    archived = parse_result(
        bridge.chat_jobs(action="archive", sender="codex", job_id=job_id)
    )
    assert archived["status"] == "archived"

    deleted = parse_result(
        bridge.chat_jobs(action="delete", sender="codex", job_id=job_id, permanent=True)
    )
    assert deleted["ok"] is True
    assert parse_result(bridge.chat_jobs(action="list", sender="codex")) == []


def test_pins_tool_supports_message_pin_lifecycle(tmp_path):
    bridge = configure_bridge(tmp_path)
    msg = bridge.store.add("user", "Pin this coordination note.", channel="general")

    added = parse_result(
        bridge.chat_pins(action="add", sender="codex", message_id=msg["id"])
    )
    assert added["status"] == "todo"

    listed = parse_result(bridge.chat_pins(action="list", sender="codex"))
    assert listed[0]["message"]["text"] == "Pin this coordination note."
    assert listed[0]["status"] == "todo"

    completed = parse_result(
        bridge.chat_pins(action="done", sender="codex", message_id=msg["id"])
    )
    assert completed["status"] == "done"

    reopened = parse_result(
        bridge.chat_pins(action="reopen", sender="codex", message_id=msg["id"])
    )
    assert reopened["status"] == "todo"

    removed = parse_result(
        bridge.chat_pins(action="remove", sender="codex", message_id=msg["id"])
    )
    assert removed["ok"] is True
    assert parse_result(bridge.chat_pins(action="list", sender="codex")) == []


def test_locked_tool_supports_full_read_write_lifecycle(tmp_path):
    bridge = configure_bridge(tmp_path)

    created = parse_result(
        bridge.chat_locked(
            action="create",
            sender="codex",
            text="Artifacts are not a retained right rail tab.",
            reason="No durable artifact feature is needed in legacy chattr.",
        )
    )
    locked_id = created["id"]

    edited = parse_result(
        bridge.chat_locked(
            action="edit",
            sender="codex",
            locked_id=locked_id,
            text="Artifacts are not retained in the legacy right rail.",
        )
    )
    assert edited["text"] == "Artifacts are not retained in the legacy right rail."

    listed = parse_result(bridge.chat_locked(action="list", sender="codex"))
    assert [item["id"] for item in listed] == [locked_id]

    archived = parse_result(
        bridge.chat_locked(action="archive", sender="codex", locked_id=locked_id)
    )
    assert archived["status"] == "archived"

    deleted = parse_result(
        bridge.chat_locked(action="delete", sender="codex", locked_id=locked_id)
    )
    assert deleted["ok"] is True
    assert parse_result(bridge.chat_locked(action="list", sender="codex")) == []


def test_right_rail_capabilities_endpoint_is_mcp_backed(tmp_path):
    from app import main as app_module
    from fastapi.testclient import TestClient

    app_module = importlib.reload(app_module)
    app_module.configure(
        {
            "server": {"port": 8300, "data_dir": str(tmp_path)},
            "agents": {},
            "routing": {"default": "none", "max_agent_hops": 4},
            "images": {"upload_dir": str(tmp_path / "uploads"), "max_size_mb": 10},
            "mcp": {"http_port": 8301, "sse_port": 8302},
        },
        session_token="right-rail-test-token",
    )
    client = TestClient(app_module.app)

    res = client.get(
        "/api/right-rail/capabilities",
        headers={"X-Session-Token": "right-rail-test-token"},
    )
    assert res.status_code == 200
    tabs = res.json()["tabs"]
    assert [tab["id"] for tab in tabs] == ["rules", "jobs", "locked", "pins"]
    assert "artifacts" not in {tab["id"] for tab in tabs}
    assert all(tab["tools"] for tab in tabs)


def test_locked_http_api_supports_ui_lifecycle(tmp_path):
    from app import main as app_module
    from fastapi.testclient import TestClient

    app_module = importlib.reload(app_module)
    app_module.configure(
        {
            "server": {"port": 8300, "data_dir": str(tmp_path)},
            "agents": {},
            "routing": {"default": "none", "max_agent_hops": 4},
            "images": {"upload_dir": str(tmp_path / "uploads"), "max_size_mb": 10},
            "mcp": {"http_port": 8301, "sse_port": 8302},
        },
        session_token="right-rail-test-token",
    )
    client = TestClient(app_module.app)
    headers = {"X-Session-Token": "right-rail-test-token"}

    created = client.post(
        "/api/locked",
        headers=headers,
        json={"text": "Keep Locked as an MCP-backed right rail tab.", "sender": "user"},
    )
    assert created.status_code == 200
    locked_id = created.json()["id"]

    edited = client.patch(
        f"/api/locked/{locked_id}",
        headers=headers,
        json={"text": "Keep Locked MCP-backed.", "reason": "Compatibility contract"},
    )
    assert edited.status_code == 200
    assert edited.json()["text"] == "Keep Locked MCP-backed."

    archived = client.patch(
        f"/api/locked/{locked_id}",
        headers=headers,
        json={"action": "archive"},
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    listed = client.get("/api/locked", headers=headers)
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()] == [locked_id]

    deleted = client.delete(f"/api/locked/{locked_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True


def test_rules_http_api_supports_ui_lifecycle(tmp_path):
    from app import main as app_module
    from fastapi.testclient import TestClient

    app_module = importlib.reload(app_module)
    app_module.configure(
        {
            "server": {"port": 8300, "data_dir": str(tmp_path)},
            "agents": {},
            "routing": {"default": "none", "max_agent_hops": 4},
            "images": {"upload_dir": str(tmp_path / "uploads"), "max_size_mb": 10},
            "mcp": {"http_port": 8301, "sse_port": 8302},
        },
        session_token="right-rail-test-token",
    )
    client = TestClient(app_module.app)
    headers = {"X-Session-Token": "right-rail-test-token"}

    created = client.post(
        "/api/rules",
        headers=headers,
        json={
            "text": "Keep Board backed by MCP right rail capabilities.",
            "author": "user",
            "status": "draft",
        },
    )
    assert created.status_code == 200
    assert created.json()["status"] == "draft"
    rule_id = created.json()["id"]

    edited = client.patch(
        f"/api/rules/{rule_id}",
        headers=headers,
        json={"text": "Keep Board wired to MCP right rail capabilities."},
    )
    assert edited.status_code == 200
    assert edited.json()["text"] == "Keep Board wired to MCP right rail capabilities."

    activated = client.patch(
        f"/api/rules/{rule_id}",
        headers=headers,
        json={"action": "activate"},
    )
    assert activated.status_code == 200
    assert activated.json()["status"] == "active"

    active = client.get("/api/rules/active", headers=headers)
    assert active.status_code == 200
    assert active.json()["rules"] == ["Keep Board wired to MCP right rail capabilities."]

    archived = client.patch(
        f"/api/rules/{rule_id}",
        headers=headers,
        json={"action": "archive"},
    )
    assert archived.status_code == 200
    assert archived.json()["status"] == "archived"

    deleted = client.delete(f"/api/rules/{rule_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True


def test_pins_http_api_supports_ui_lifecycle(tmp_path):
    from app import main as app_module
    from fastapi.testclient import TestClient

    app_module = importlib.reload(app_module)
    app_module.configure(
        {
            "server": {"port": 8300, "data_dir": str(tmp_path)},
            "agents": {},
            "routing": {"default": "none", "max_agent_hops": 4},
            "images": {"upload_dir": str(tmp_path / "uploads"), "max_size_mb": 10},
            "mcp": {"http_port": 8301, "sse_port": 8302},
        },
        session_token="right-rail-test-token",
    )
    client = TestClient(app_module.app)
    headers = {"X-Session-Token": "right-rail-test-token"}
    msg = app_module.store.add("user", "Pin this Board item.", channel="general")

    created = client.post(
        "/api/pins",
        headers=headers,
        json={"message_id": msg["id"]},
    )
    assert created.status_code == 200
    assert created.json()["status"] == "todo"

    listed = client.get("/api/pins", headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["message"]["text"] == "Pin this Board item."

    completed = client.patch(
        f"/api/pins/{msg['id']}",
        headers=headers,
        json={"action": "done"},
    )
    assert completed.status_code == 200
    assert completed.json()["status"] == "done"

    reopened = client.patch(
        f"/api/pins/{msg['id']}",
        headers=headers,
        json={"action": "reopen"},
    )
    assert reopened.status_code == 200
    assert reopened.json()["status"] == "todo"

    deleted = client.delete(f"/api/pins/{msg['id']}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True
    assert client.get("/api/pins", headers=headers).json() == []


