"""Hosted ASGI bootstrap for the kai-chattr API service."""

from __future__ import annotations

from pathlib import Path

from app.config import load_config
from app.lifecycle import register_cli_startup
from app.runtime_contract import resolve_session_token_from_env

from app import main as main_module


ROOT = Path(__file__).resolve().parents[1]

session_contract = resolve_session_token_from_env(require_configured=True)
config = load_config(ROOT)

main_module.configure(config, session_token=session_contract.token)
register_cli_startup(
    main_module.app,
    set_loop=main_module.set_event_loop,
    get_session_engine=lambda: main_module.session_engine,
)

app = main_module.app
