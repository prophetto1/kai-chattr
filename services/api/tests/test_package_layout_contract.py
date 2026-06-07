from __future__ import annotations

import importlib.util
from pathlib import Path


SERVICE_ROOT = Path(__file__).resolve().parents[1]


def test_backend_uses_app_package_not_root_app_module():
    assert not (SERVICE_ROOT / "app.py").exists()
    assert (SERVICE_ROOT / "app" / "__init__.py").is_file()


def test_old_server_tree_removed_from_source_layout():
    server_root = SERVICE_ROOT / "server"
    remaining_sources = [
        path
        for path in server_root.rglob("*")
        if path.is_file() and "__pycache__" not in path.parts and path.suffix != ".pyc"
    ] if server_root.exists() else []
    assert remaining_sources == []


def test_package_entrypoints_import():
    from app.main import app
    from app.lifecycle import configure, set_event_loop
    from app.config import load_config

    assert app.title
    assert callable(configure)
    assert callable(set_event_loop)
    assert callable(load_config)


def test_old_root_business_modules_are_not_importable():
    forbidden = [
        "agents",
        "archive",
        "config_loader",
        "jobs",
        "mcp_bridge",
        "mcp_proxy",
        "registry",
        "router",
        "rules",
        "schedules",
        "session_engine",
        "session_store",
        "store",
        "summaries",
    ]

    for module_name in forbidden:
        spec = importlib.util.find_spec(module_name)
        assert spec is None, f"{module_name} is still importable from the service root"

