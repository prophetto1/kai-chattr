"""Shared config loader — merges config.toml + config.local.toml.

Used by run.py, wrapper.py, and wrapper_api.py so the server and all
wrappers see the same agent definitions.

Per-invocation overrides: the following environment variables, if set,
override values from config.toml. This lets dotfiles/launcher layers run
isolated instances per project without editing the repo's config file.

  CHATTR_DATA_DIR        → server.data_dir
  CHATTR_HOST            → server.host
  CHATTR_PORT            → server.port           (int)
  CHATTR_MCP_HTTP_PORT   → mcp.http_port         (int)
  CHATTR_MCP_SSE_PORT    → mcp.sse_port          (int)
  CHATTR_UPLOAD_DIR      → images.upload_dir
Backward-compatible overrides:
  AGENTCHATTR_DATA_DIR   → CHATTR_DATA_DIR fallback
  AGENTCHATTR_PORT       → CHATTR_PORT fallback
  AGENTCHATTR_MCP_HTTP_PORT → CHATTR_MCP_HTTP_PORT fallback
  AGENTCHATTR_MCP_SSE_PORT → CHATTR_MCP_SSE_PORT fallback
  AGENTCHATTR_UPLOAD_DIR → CHATTR_UPLOAD_DIR fallback

Relative paths in env var overrides resolve against the current working
directory (where the user invoked the command from), not chattr's
install directory.
"""

import os
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


# Mapping: env var name → (config section, key, is_int)
_ENV_OVERRIDES = [
    ("CHATTR_DATA_DIR", "AGENTCHATTR_DATA_DIR",      "server", "data_dir",   False),
    ("CHATTR_PORT",     "AGENTCHATTR_PORT",          "server", "port",       True),
    ("CHATTR_MCP_HTTP_PORT", "AGENTCHATTR_MCP_HTTP_PORT", "mcp",    "http_port",  True),
    ("CHATTR_MCP_SSE_PORT", "AGENTCHATTR_MCP_SSE_PORT",  "mcp",    "sse_port",   True),
    ("CHATTR_UPLOAD_DIR", "AGENTCHATTR_UPLOAD_DIR",    "images", "upload_dir", False),
]

# Mapping: CLI flag → env var (for apply_cli_overrides)
CLI_OVERRIDE_FLAGS = [
    ("--data-dir",      "CHATTR_DATA_DIR"),
    ("--port",          "CHATTR_PORT"),
    ("--mcp-http-port", "CHATTR_MCP_HTTP_PORT"),
    ("--mcp-sse-port",  "CHATTR_MCP_SSE_PORT"),
    ("--upload-dir",    "CHATTR_UPLOAD_DIR"),
]


def apply_cli_overrides(argv: list[str] | None = None) -> None:
    """Scan argv for --data-dir/--port/etc and set matching env vars in-place.

    Called by run.py, wrapper.py, and wrapper_api.py BEFORE load_config() so
    all entry points respect the same overrides when launched with the same
    flags. No effect if a flag isn't present. Supports both `--flag value`
    and `--flag=value` forms.

    Arguments after a literal `--` are treated as pass-through (e.g. for the
    agent CLI in wrapper.py) and are NOT scanned — `python wrapper.py claude
    -- --port 9999` sets `--port 9999` on the agent, not on chattr.
    """
    if argv is None:
        argv = sys.argv

    # Truncate at pass-through separator so agent CLI args don't leak in.
    try:
        end = argv.index("--")
        scan = argv[:end]
    except ValueError:
        scan = argv

    for flag, env in CLI_OVERRIDE_FLAGS:
        # Iterate in order; first match wins (ignore later duplicates).
        for i, arg in enumerate(scan):
            if arg == flag and i + 1 < len(scan):
                legacy_env = env.replace("CHATTR_", "AGENTCHATTR_", 1)
                value = scan[i + 1]
                os.environ[env] = value
                os.environ.setdefault(legacy_env, value)
                break
            if arg.startswith(flag + "="):
                legacy_env = env.replace("CHATTR_", "AGENTCHATTR_", 1)
                value = arg.split("=", 1)[1]
                os.environ[env] = value
                os.environ.setdefault(legacy_env, value)
                break


def _apply_env_overrides(config: dict) -> None:
    """Apply CHATTR_* env vars (with AGENTCHATTR_* fallback) to config in-place."""
    for env_var, legacy_env_var, section, key, is_int in _ENV_OVERRIDES:
        raw = os.environ.get(env_var)
        if raw is None or raw == "":
            raw = os.environ.get(legacy_env_var)
        if raw is None or raw == "":
            continue
        if is_int:
            try:
                value = int(raw)
            except ValueError:
                print(f"  Warning: {env_var}={raw!r} is not a valid integer, ignoring")
                continue
        else:
            # Path values: resolve relative paths against current working dir,
            # not against chattr's install directory.
            p = Path(raw)
            if not p.is_absolute():
                p = (Path.cwd() / p).resolve()
            value = str(p)
        config.setdefault(section, {})[key] = value

    server = config.setdefault("server", {})
    host = (
        os.environ.get("CHATTR_HOST", "").strip()
        or os.environ.get("KAI_CHATTR_API_HOST", "").strip()
    )
    if host:
        server["host"] = host

    port = os.environ.get("PORT", "").strip()
    if port and not os.environ.get("CHATTR_PORT"):
        try:
            server["port"] = int(port)
        except ValueError:
            print(f"  Warning: PORT={port!r} is not a valid integer, ignoring")

    database = config.setdefault("database", {})
    database_url = os.environ.get("KAI_CHATTR_DATABASE_URL", "").strip()
    database_mode = os.environ.get("KAI_CHATTR_DATABASE_MODE", "").strip().lower()
    if database_url:
        database["url"] = database_url
    if database_mode:
        database["mode"] = database_mode
    elif database_url:
        database["mode"] = "postgres"
    database.setdefault("mode", "file")

    allowed_origins = os.environ.get("KAI_CHATTR_ALLOWED_ORIGINS", "").strip()
    if allowed_origins:
        config.setdefault("security", {})["allowed_origins"] = [
            origin.strip().rstrip("/")
            for origin in allowed_origins.split(",")
            if origin.strip()
        ]


def load_config(root: Path | None = None) -> dict:
    """Load config.toml and merge config.local.toml if it exists.

    config.local.toml is gitignored and intended for user-specific agents
    (e.g. local LLM endpoints) and optional [server]/[home] tweaks
    that shouldn't be committed.
    The [agents] section merges additively — local entries are added alongside
    (not replacing) the agents defined in config.toml.
    The [server] and [home] sections, if present, update keys in the main blocks.

    CHATTR_* environment variables override values from config.toml
    (AGENTCHATTR_* aliases are still honored as fallback during migration).
    (see module docstring for the list).
    """
    root = root or ROOT
    config_path = root / "config.toml"

    with open(config_path, "rb") as f:
        config = tomllib.load(f)

    local_path = root / "config.local.toml"
    if local_path.exists():
        with open(local_path, "rb") as f:
            local = tomllib.load(f)

        # Merge [agents] section — local agents are added ONLY if they don't already exist.
        # This protects the "holy trinity" (claude, codex, gemini) from being overridden.
        local_agents = local.get("agents", {})
        config_agents = config.setdefault("agents", {})
        for name, agent_cfg in local_agents.items():
            if name not in config_agents:
                config_agents[name] = agent_cfg
            else:
                print(f"  Warning: Ignoring local agent '{name}' (already defined in config.toml)")

        # Merge [server] — optional local overrides for bind address, ports, paths, etc.
        local_server = local.get("server")
        if isinstance(local_server, dict):
            config.setdefault("server", {}).update(local_server)

        # Merge [home] — optional local repository roots and home-start settings.
        local_home = local.get("home")
        if isinstance(local_home, dict):
            config.setdefault("home", {}).update(local_home)

    _apply_env_overrides(config)

    return config
