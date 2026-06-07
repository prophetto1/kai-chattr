"""Entry point - starts MCP servers (8301/8302) + web UI (8300)."""

import argparse
import asyncio
import os
import secrets
import sys
import threading
import time
import logging
from pathlib import Path

# Ensure the service directory is on the import path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def _parse_args():
    parser = argparse.ArgumentParser(
        description="Start chattr (web UI + MCP server).",
        epilog="Flags override config.toml for this invocation. The same flags "
               "are also accepted by wrapper.py and wrapper_api.py so a launcher "
               "can isolate per-project instances by passing matching values to "
               "each process.",
    )
    parser.add_argument("--data-dir",      default=None, help="Override server.data_dir (path)")
    parser.add_argument("--port",          default=None, help="Override server.port (int)")
    parser.add_argument("--mcp-http-port", default=None, help="Override mcp.http_port (int)")
    parser.add_argument("--mcp-sse-port",  default=None, help="Override mcp.sse_port (int)")
    parser.add_argument("--upload-dir",    default=None, help="Override images.upload_dir (path)")
    parser.add_argument("--allow-network", action="store_true",
                        help="Allow binding to non-localhost hosts (with confirmation).")
    return parser.parse_args()


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

    # --- Security: generate a random session token (in-memory only) ---
    session_token = secrets.token_hex(32)

    # Configure the FastAPI app (creates shared store)
    from app.main import app, configure, set_event_loop, store as _store_ref
    configure(config, session_token=session_token)

    host = config.get("server", {}).get("host", "127.0.0.1")
    if host not in ("127.0.0.1", "localhost", "::1"):
        legacy_host = os.environ.get("AGENTCHATTR_MCP_HOST", "")
        canonical_host = os.environ.get("CHATTR_MCP_HOST", legacy_host)
        if not canonical_host:
            canonical_host = host
        os.environ["CHATTR_MCP_HOST"] = canonical_host
        os.environ.setdefault("AGENTCHATTR_MCP_HOST", canonical_host)

    # Share runtime state with the MCP bridge
    from app.context import runtime_context
    from app.main import session_engine
    from app.mcp import bridge as mcp_bridge
    mcp_bridge.bind_runtime_context(runtime_context)

    # Enable cursor and role persistence across restarts
    data_dir = ROOT / config.get("server", {}).get("data_dir", "./data")
    mcp_bridge.configure_event_stream(data_dir / "agent_events.jsonl")
    mcp_bridge._CURSORS_FILE = data_dir / "mcp_cursors.json"
    mcp_bridge._load_cursors()
    mcp_bridge._ROLES_FILE = data_dir / "roles.json"
    mcp_bridge._load_roles()

    # Start MCP servers in background threads
    http_port = config.get("mcp", {}).get("http_port", 8301)
    sse_port = config.get("mcp", {}).get("sse_port", 8302)
    mcp_bridge.mcp_http.settings.port = http_port
    mcp_bridge.mcp_sse.settings.port = sse_port

    threading.Thread(target=mcp_bridge.run_http_server, daemon=True).start()
    threading.Thread(target=mcp_bridge.run_sse_server, daemon=True).start()
    time.sleep(0.5)
    logging.getLogger(__name__).info("MCP streamable-http on port %d, SSE on port %d", http_port, sse_port)

    # Mount static files
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import HTMLResponse, RedirectResponse

    static_dir = ROOT / "static"
    app.mount(
        "/workbench/assets",
        StaticFiles(directory=str(static_dir / "workbench" / "assets"), check_dir=False),
        name="workbench-assets",
    )

    @app.get("/")
    async def index():
        # Read index.html fresh each request so changes take effect without restart.
        # Inject the session token into the HTML so the browser client can use it.
        # This is safe: same-origin policy prevents cross-origin pages from reading
        # the response body, so only the user's own browser tab gets the token.
        index_path = static_dir / "index.html"
        if not index_path.exists():
            return RedirectResponse(url="/workbench", status_code=307)
        html = index_path.read_text("utf-8")
        injected = html.replace(
            "</head>",
            f'<script>window.__SESSION_TOKEN__="{session_token}";</script>\n</head>',
        )
        return HTMLResponse(injected, headers={"Cache-Control": "no-store"})

    @app.get("/platform-admin")
    async def platform_admin():
        # Single-page Platform Admin surface (sits above org/project/runtime).
        # Same token-injection pattern as the chat root so the page can call
        # session-token-aware endpoints when org/platform APIs land.
        index_path = static_dir / "platform-admin.html"
        if not index_path.exists():
            return HTMLResponse(
                "Platform Admin build not found.",
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
        html = index_path.read_text("utf-8")
        injected = html.replace(
            "</head>",
            f'<script>window.__SESSION_TOKEN__="{session_token}";</script>\n</head>',
        )
        return HTMLResponse(injected, headers={"Cache-Control": "no-store"})

    @app.get("/workbench")
    @app.get("/workbench/{path:path}")
    async def workbench(path: str = ""):
        # React workbench surface. Built assets live on disk under
        # static/workbench, but the browser route is /workbench.
        index_path = static_dir / "workbench" / "index.html"
        if not index_path.exists():
            return HTMLResponse(
                "Workbench build not found. Run pnpm web:build from the repo root.",
                status_code=503,
                headers={"Cache-Control": "no-store"},
            )
        html = index_path.read_text("utf-8")
        injected = html.replace(
            "</head>",
            f'<script>window.__SESSION_TOKEN__="{session_token}";</script>\n</head>',
        )
        return HTMLResponse(injected, headers={"Cache-Control": "no-store"})

    app.mount("/static", StaticFiles(directory=str(static_dir), check_dir=False), name="static")

    # Capture the event loop for the store→WebSocket bridge
    @app.on_event("startup")
    async def on_startup():
        set_event_loop(asyncio.get_running_loop())
        # Resume any sessions that were active before restart
        if session_engine:
            session_engine.resume_active_sessions()

    # Run web server
    import uvicorn
    port = config.get("server", {}).get("port", 8300)

    # --- Security: warn if binding to a non-localhost address ---
    if host not in ("127.0.0.1", "localhost", "::1"):
        print(f"\n  !! SECURITY WARNING — binding to {host} !!")
        print("  This exposes chattr to your local network.")
        print()
        print("  Risks:")
        print("  - No TLS: traffic (including session token) is plaintext")
        print("  - Anyone on your network can sniff the token and gain full access")
        print("  - With the token, anyone can @mention agents and trigger tool execution")
        print("  - If agents run with auto-approve, this means remote code execution")
        print()
        print("  Only use this on a trusted home network. Never on public/shared WiFi.")
        if "--allow-network" not in sys.argv:
            print("  Pass --allow-network to start anyway, or set host to 127.0.0.1.\n")
            sys.exit(1)
        else:
            print()
            # Non-interactive automation / scripts: CHATTR_ACCEPT_NETWORK_RISK=YES
            confirm = os.environ.get("CHATTR_ACCEPT_NETWORK_RISK", "").strip()
            if confirm != "YES":
                try:
                    confirm = input("  Type YES to accept these risks and start: ").strip()
                except (EOFError, KeyboardInterrupt):
                    confirm = ""
            if confirm != "YES":
                print("  Aborted.\n")
                sys.exit(1)

    print(f"\n  chattr")
    print(f"  Web UI:  http://{host}:{port}")
    print(f"  MCP HTTP: http://{host}:{http_port}/mcp  (Claude, Codex)")
    print(f"  MCP SSE:  http://{host}:{sse_port}/sse   (Gemini)")
    print(f"  Data:    {data_dir}")
    print(f"  Agents auto-trigger on @mention")
    print(f"\n  Session token: {session_token}\n")

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()

