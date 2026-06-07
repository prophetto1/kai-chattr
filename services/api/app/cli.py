"""Entry point - starts kai-chattr API/WebSocket plus MCP servers."""

import argparse
import logging
import os
import sys
import threading
import time
from pathlib import Path

# Ensure the service directory is on the import path.
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _parse_args():
    parser = argparse.ArgumentParser(
        description="Start kai-chattr API/WebSocket plus MCP servers.",
        epilog="Flags override config.toml for this invocation. The same flags "
        "are also accepted by wrapper.py and wrapper_api.py so a launcher "
        "can isolate per-project instances by passing matching values to "
        "each process.",
    )
    parser.add_argument("--data-dir", default=None, help="Override server.data_dir (path)")
    parser.add_argument("--port", default=None, help="Override server.port (int)")
    parser.add_argument("--mcp-http-port", default=None, help="Override mcp.http_port (int)")
    parser.add_argument("--mcp-sse-port", default=None, help="Override mcp.sse_port (int)")
    parser.add_argument("--upload-dir", default=None, help="Override images.upload_dir (path)")
    parser.add_argument(
        "--allow-network",
        action="store_true",
        help="Allow binding to non-localhost hosts (with confirmation).",
    )
    return parser.parse_args()


def _session_token_from_env() -> str:
    return (
        os.environ.get("KAI_CHATTR_SESSION_TOKEN", "").strip()
        or os.environ.get("CHATTR_SESSION_TOKEN", "").strip()
    )


def main():
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
        datefmt="%H:%M:%S",
    )

    # Parse flags for --help support; the actual env propagation happens via
    # the shared app.config.apply_cli_overrides helper so run.py and the
    # wrappers use identical extraction logic.
    _parse_args()

    from app.config import apply_cli_overrides, load_config

    apply_cli_overrides()

    config_path = ROOT / "config.toml"
    if not config_path.exists():
        print(f"Error: {config_path} not found")
        sys.exit(1)

    config = load_config(ROOT)

    from app.runtime_contract import resolve_session_token_from_env

    session_contract = resolve_session_token_from_env()
    session_token = session_contract.token
    session_token_source = session_contract.source

    from app.lifecycle import register_cli_startup
    from app.main import app, configure, set_event_loop

    configure(config, session_token=session_token)

    host = config.get("server", {}).get("host", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost", "::1"):
        legacy_host = os.environ.get("AGENTCHATTR_MCP_HOST", "")
        canonical_host = os.environ.get("CHATTR_MCP_HOST", legacy_host) or host
        os.environ["CHATTR_MCP_HOST"] = canonical_host
        os.environ.setdefault("AGENTCHATTR_MCP_HOST", canonical_host)

    from app.context import runtime_context
    from app.main import session_engine
    from app.mcp import bridge as mcp_bridge

    mcp_bridge.bind_runtime_context(runtime_context)

    data_dir = ROOT / config.get("server", {}).get("data_dir", "./data")
    mcp_bridge.configure_event_stream(data_dir / "agent_events.jsonl")
    mcp_bridge._CURSORS_FILE = data_dir / "mcp_cursors.json"
    mcp_bridge._load_cursors()
    mcp_bridge._ROLES_FILE = data_dir / "roles.json"
    mcp_bridge._load_roles()

    http_port = config.get("mcp", {}).get("http_port", 8841)
    sse_port = config.get("mcp", {}).get("sse_port", 8842)
    mcp_bridge.mcp_http.settings.port = http_port
    mcp_bridge.mcp_sse.settings.port = sse_port

    threading.Thread(target=mcp_bridge.run_http_server, daemon=True).start()
    threading.Thread(target=mcp_bridge.run_sse_server, daemon=True).start()
    time.sleep(0.5)
    logging.getLogger(__name__).info(
        "MCP streamable-http on port %d, SSE on port %d",
        http_port,
        sse_port,
    )

    register_cli_startup(app, set_loop=set_event_loop, get_session_engine=lambda: session_engine)

    import uvicorn

    port = config.get("server", {}).get("port", 8840)

    if host not in ("127.0.0.1", "localhost", "::1"):
        print(f"\n  !! SECURITY WARNING: binding to {host} !!")
        print("  This exposes kai-chattr to your local network.")
        print()
        print("  Risks:")
        print("  - No TLS: traffic is plaintext")
        print("  - Anyone on your network can reach the API and WebSocket server")
        print("  - Anyone with the session token can trigger agent/tool actions")
        print()
        print("  Only use this on a trusted home network. Never on public/shared WiFi.")
        if "--allow-network" not in sys.argv:
            print("  Pass --allow-network to start anyway, or set host to 127.0.0.1.\n")
            sys.exit(1)

        confirm = os.environ.get("CHATTR_ACCEPT_NETWORK_RISK", "").strip()
        if confirm != "YES":
            try:
                confirm = input("  Type YES to accept these risks and start: ").strip()
            except (EOFError, KeyboardInterrupt):
                confirm = ""
        if confirm != "YES":
            print("  Aborted.\n")
            sys.exit(1)

    print("\n  kai-chattr")
    print(f"  API/WS:   http://{host}:{port}")
    print(f"  MCP HTTP: http://{host}:{http_port}/mcp  (Claude, Codex)")
    print(f"  MCP SSE:  http://{host}:{sse_port}/sse   (Gemini)")
    print(f"  Data:     {data_dir}")
    print("  Agents auto-trigger on @mention")
    print(f"\n  Session token: {session_token_source}\n")

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
