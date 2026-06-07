"""MCP server for agent chat tools â€” runs alongside the web server.

Serves two transports for compatibility:
  - streamable-http on port 8841 (Claude Code, Codex, Qwen)
  - SSE on port 8842 (Gemini)
"""

import json
import os
import time
import logging
import threading
from pathlib import Path

from mcp.server.fastmcp import Context, FastMCP
from app.events.jsonl_stream import JsonlEventStream
from app.proposals.patch_kernel import apply_text_patch
from app.mcp.tools import ToolDefinition, ToolRegistry

log = logging.getLogger(__name__)

# Shared state â€” set by run.py before starting
store = None
rules = None
summaries = None
jobs = None  # set by run.py â€” JobStore instance
locked = None  # set by run.py â€” LockedStore instance
room_settings = None  # set by run.py â€” dict with "channels" list etc.
registry = None       # set by run.py â€” RuntimeRegistry instance
config = None         # set by run.py â€” full config.toml dict
router = None         # set by run.py â€” Router instance
agents = None         # set by run.py â€” AgentManager instance
def bind_runtime_context(context) -> None:
    """Bind MCP tool globals to the current backend runtime context."""
    global store, rules, summaries, jobs, locked, room_settings
    global registry, config, router, agents

    store = context.store
    rules = context.rules
    summaries = context.summaries
    jobs = context.jobs
    locked = context.locked
    room_settings = context.room_settings
    registry = context.registry
    config = context.config
    router = context.router
    agents = context.agents


_presence: dict[str, float] = {}
_activity: dict[str, bool] = {}   # True = screen changed on last poll
_activity_ts: dict[str, float] = {}  # timestamp of last active=True heartbeat
ACTIVITY_TIMEOUT = 8  # auto-expire activity after 8s without a fresh active=True
_presence_lock = threading.Lock()   # guards both _presence and _activity
_renamed_from: set[str] = set()    # old names from renames â€” suppress leave messages
_cursors: dict[str, dict[str, int]] = {}  # agent_name â†’ {channel_name â†’ last_id}
_cursors_lock = threading.Lock()
_empty_read_count: dict[str, int] = {}  # sender â†’ consecutive empty reads
# Last channel (or job_id) each agent explicitly read from. chat_send
# falls back to this when the caller omits the channel/job_id, so agents
# mentioned in #X don't accidentally reply in #general just because
# they forgot the channel param. Closes #58.
_last_read_channel: dict[str, str] = {}
_last_read_job_id: dict[str, int] = {}
_last_read_lock = threading.Lock()
PRESENCE_TIMEOUT = 10  # ~2 missed heartbeats (5s interval) = offline

# Roles â€” per-instance, persisted to roles.json
_roles: dict[str, str] = {}  # agent_name â†’ role string
_ROLES_FILE: Path | None = None

# Cursor persistence â€” set by run.py to enable saving cursors across restarts
_CURSORS_FILE: Path | None = None

_MCP_INSTRUCTIONS = (
    "chattr â€” a shared chat channel for coordinating development between AI agents and humans. "
    "Use chat_send to post messages. Use chat_read to check recent messages. "
    "Use chat_join when you start a session to announce your presence. "
    "Use chat_rules, chat_jobs, chat_pins, and chat_locked to read and update the right-rail workbench. "
    "Always use your own name as the sender â€” never impersonate other agents or humans.\n\n"
    "CRITICAL â€” Sender Identity Rules:\n"
    "Your BASE agent identity (used for chat_claim and chat_read) is:\n"
    "  - All Anthropic products (Claude Code, claude-cli, etc.) â†’ base: \"claude\"\n"
    "  - All OpenAI products (Codex CLI, codex, chatgpt-cli, etc.) â†’ base: \"codex\"\n"
    "  - All Google products (Gemini CLI, gemini-cli, aistudio, etc.) â†’ base: \"gemini\"\n"
    "  - All Alibaba/Qwen products (Qwen Code, qwen-cli, etc.) â†’ base: \"qwen\"\n"
    "  - All Kilo products (Kilo CLI, kilocode, etc.) â†’ base: \"kilo\"\n"
    "  - Humans use their own name (e.g. \"user\")\n"
    "Do NOT use your CLI tool name (e.g. \"gemini-cli\", \"claude-code\") â€” use the base name above.\n"
    "IMPORTANT: When multiple instances run, the server renames slot 1 (e.g. \"claude\" â†’ \"claude-1\"). "
    "If chat_send rejects your sender, call chat_claim(sender='your_base_name') and use the confirmed_name "
    "as your sender for ALL subsequent tool calls. The confirmed_name overrides the base name.\n\n"
    "CRITICAL â€” Identity:\n"
    "Always use your base agent name (claude/codex/gemini/qwen/kilo) as sender. "
    "Do NOT call chat_claim on fresh sessions â€” it is only for "
    "recovering a previous identity after /resume.\n\n"
    "CRITICAL â€” Always Respond In Chat:\n"
    "When you are addressed in a chat message (@yourname or @all agents), you MUST respond using chat_send "
    "in the same channel. NEVER respond only in your terminal/console output. The human and other agents "
    "cannot see your terminal â€” only chat messages are visible to everyone. If you need to do work first, "
    "do the work, then post your response/results in chat using chat_send.\n\n"
    "CRITICAL â€” Token-Aware Reading:\n"
    "Each chat_read call costs tokens. Default: one read per relevant channel per turn. "
    "A second read is fine if you can name the reason (checked a different channel, did work and expect a reply, "
    "recovering from an error). After an empty read ('No new messages'), do NOT read the same channel again â€” "
    "stop and wait for your next prompt. Never use chat_read as a sleep/wait loop.\n\n"
    "Rules are the shared working style for your agents. They are short imperative instructions that all agents should follow. "
    "At session start, call chat_rules(action='list') to read active rules â€” treat them as authoritative guidance. "
    "When you notice a repeated correction, a cross-agent convention, or a preference that should persist, "
    "propose it as a rule via chat_rules(action='propose'). Keep rules short and imperative (max 160 chars). "
    "Don't propose trivial or session-specific things. chat_decision is an alias for chat_rules (backward compat).\n\n"
    "Messages belong to channels (default: 'general'). Use the 'channel' parameter in chat_send and "
    "chat_read to target a specific channel. Omit channel or pass empty string to read from all channels.\n\n"
    "If you are addressed in chat, respond in chat â€” use chat_send to reply in the same channel. "
    "Do not take the answer back to your terminal session. "
    "If the latest message in a channel is addressed to you (or all agents), treat it as your active task "
    "and execute it directly. Reading a channel with no task addressed to you is just catching up â€” no action needed.\n\n"
    "Multi-instance support:\n"
    "When multiple instances of the same agent run simultaneously, each gets a unique identity.\n"
    "The server assigns names like claude-1, claude-2 automatically.\n"
    "On /resume, if your conversation history shows you previously used a different name (e.g. 'claude-music'), "
    "call chat_claim(sender='your_base_name', name='claude-music') to reclaim it.\n"
    "If chat_send rejects your sender with an identity error, call chat_claim first to get your identity.\n\n"
    "Summaries are per-channel snapshots that help agents catch up quickly. "
    "Use chat_summary(action='read') at session start to get context before reading raw messages. "
    "Use chat_summary(action='write', text='...') to update the summary ONLY when:\n"
    "- You are explicitly asked via /summary\n"
    "- The channel has had 20+ messages since the last summary\n"
    "Do NOT update the summary mid-conversation, after trivial exchanges, or when another agent just updated it. "
    "Do NOT summarize just because a task was discussed or abandoned â€” wait for the 20-message threshold or a human request. "
    "Keep summaries factual and concise (under 150 words) â€” focus on decisions made, tasks completed, and open questions.\n\n"
    "Jobs are bounded work conversations â€” like Slack threads with status tracking. "
    "When you are triggered with job_id=N, use chat_read(job_id=N) to read the job conversation. "
    "That read returns a header entry first, including the job title and body, followed by the thread messages. "
    "Then use chat_send(job_id=N, message='...') to reply within it. "
    "Job conversations are separate from the main timeline â€” your response should go to the job, not the channel.\n\n"
    "CRITICAL â€” Jobs:\n"
    "Use chat_jobs for direct read/write access to job records when the user or current job context requires it. "
    "Use chat_propose_job when you need a human-reviewed proposal card before a new job exists. "
    "When creating work without explicit direct-create instruction, agents must only propose jobs using chat_propose_job when the request is a clearly 'scoped task'. "
    "A task is scoped if it has: 1) Concrete outcome, 2) Specific boundary, 3) Clear done criteria, 4) Explicit owner/intention, and 5) Appropriate size. "
    "If these 5 checks do not pass, do NOT propose a job; instead, reply in chat to ask for clarification. "
    "This prevents over-use of the jobs feature for vague requests.\n\n"
    "To post a suggestion (Accept/Dismiss card) in a job, prefix your message with [suggestion]: "
    "chat_send(job_id=N, message='[suggestion] I recommend we refactor the auth module'). "
    "The human can Accept (triggers you with context) or Dismiss."
)

# --- Tool implementations (shared between both servers) ---


def _request_headers(ctx: Context | None):
    if ctx is None:
        return None
    try:
        request = ctx.request_context.request
    except Exception:
        return None
    return getattr(request, "headers", None)


def _extract_agent_token(ctx: Context | None) -> str:
    headers = _request_headers(ctx)
    if not headers:
        return ""
    auth = headers.get("authorization", "")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    return headers.get("x-agent-token", "").strip()


def _authenticated_instance(ctx: Context | None) -> dict | None:
    if not registry:
        return None
    token = _extract_agent_token(ctx)
    if not token:
        return None
    return registry.resolve_token(token)


def _resolve_tool_identity(
    raw_name: str,
    ctx: Context | None,
    *,
    field_name: str,
    required: bool = False,
) -> tuple[str, str | None]:
    provided = raw_name.strip() if raw_name else ""
    token = _extract_agent_token(ctx)
    inst = _authenticated_instance(ctx)
    if inst:
        resolved = inst["name"]
        if resolved:
            _touch_presence(resolved)
        return resolved, None
    if token:
        return "", "Error: stale or unknown authenticated agent session. Re-register and retry."

    if not provided:
        if required:
            return "", f"Error: {field_name} is required."
        return "", None

    if registry:
        resolved = registry.resolve_name(provided)
        if resolved != provided and registry.is_registered(resolved):
            provided = resolved
        if registry.is_agent_family(provided):
            return "", f"Error: authenticated agent session required for '{provided}'."

    if provided:
        _touch_presence(provided)
    return provided, None


def chat_send(
    sender: str,
    message: str,
    choices: list[str] | None = None,
    image_path: str = "",
    reply_to: int = -1,
    channel: str = "",
    job_id: int = 0,
    ctx: Context | None = None,
) -> str:
    """Send a message to the chattr chat. Use your name as sender (claude/codex/user).
    Optionally attach a local image by providing image_path (absolute path).
    Optionally reply to a message by providing reply_to (message ID).
    Channel/job_id resolution:
      - If you pass channel or job_id explicitly, that target is honored.
      - If you omit both, the message is routed to the last channel or
        job this sender read from via chat_read (so replying after
        `chat_read(channel="bugfixing")` lands in #bugfixing, not #general).
      - If this sender has never read anything, the message falls back to
        the 'general' channel.
    IMPORTANT: Always include the choices parameter. When asking a yes/no or
    multiple-choice question, provide the options so the user can respond with
    a single click:
      chat_send(sender="claude", message="Should I merge?", choices=["Yes", "No", "Show diff first"])
    For normal messages without choices, pass choices=[]:
      chat_send(sender="claude", message="Done.", choices=[])"""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=True)
    if err:
        return err

    # Fallback routing: if caller omitted both channel and job_id, use
    # whatever target this sender last read from. Prevents agents that
    # forget the channel param from accidentally replying in #general.
    if sender and not channel and not job_id:
        with _last_read_lock:
            fallback_job = _last_read_job_id.get(sender, 0)
            fallback_channel = _last_read_channel.get(sender, "")
        if fallback_job:
            job_id = fallback_job
        elif fallback_channel:
            channel = fallback_channel
    # Final fallback if still nothing: original 'general' behavior.
    if not channel and not job_id:
        channel = "general"
    # Block pending instances (identity not yet confirmed)
    if registry and registry.is_pending(sender):
        return "Error: identity not confirmed. Call chat_claim(sender=your_base_name) to get your identity."
    # Block base family names when multi-instance is active
    # (but allow if sender is a registered+active instance â€” e.g. slot-1 'claude' that already claimed)
    if registry and sender in registry.get_bases() and registry.family_instance_count(sender) >= 2:
        inst = registry.get_instance(sender)
        if not inst or inst.get("state") != "active":
            return (f"Error: multiple {sender} instances are registered. "
                    f"Call chat_claim(sender='{sender}') to get your unique identity, then use the confirmed_name as sender.")
    # Block unregistered agent names (stale identity from resumed session)
    if registry and registry.is_agent_family(sender) and not registry.is_registered(sender):
        return f"Error: sender '{sender}' is not registered. Call chat_claim(sender=your_base_name) to get your identity."
    if choices is None:
        choices = []

    if not message.strip() and not image_path:
        return "Empty message, not sent."

    # Job-scoped send: post into a job conversation instead of main timeline
    if job_id and jobs:
        # Detect suggestion type from [suggestion] prefix
        text = message.strip()
        msg_type = "chat"
        if text.lower().startswith("[suggestion]"):
            msg_type = "suggestion"
            text = text[len("[suggestion]"):].strip()
        # Handle image attachment for job messages
        job_attachments = None
        if image_path:
            import shutil, uuid
            src = Path(image_path)
            if not src.exists():
                return f"Image not found: {image_path}"
            if src.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'):
                return f"Unsupported image type: {src.suffix}"
            raw_dir = "./uploads"
            if config and "images" in config:
                raw_dir = config["images"].get("upload_dir", raw_dir)
            upload_dir = Path(raw_dir)
            upload_dir.mkdir(parents=True, exist_ok=True)
            filename = f"{uuid.uuid4().hex[:8]}{src.suffix}"
            shutil.copy2(str(src), str(upload_dir / filename))
            job_attachments = [{"name": src.name, "url": f"/uploads/{filename}"}]
        msg = jobs.add_message(job_id, sender, text, msg_type=msg_type,
                               attachments=job_attachments)
        if msg is None:
            return f"Error: job #{job_id} not found."
        with _presence_lock:
            _presence[sender] = time.time()

        # Route @mentions in job messages to trigger other agents
        if router and agents:
            job = jobs.get(job_id)
            if job:
                job_channel = job.get("channel", "general")
                raw_targets = router.get_targets(sender, text, job_channel)
                targets = []
                for t in raw_targets:
                    if registry:
                        targets.extend(registry.resolve_to_instances(t))
                    else:
                        targets.append(t)
                targets = list(dict.fromkeys(targets))
                chat_msg = f"{sender}: {text}" if text else ""
                for target in targets:
                    if registry:
                        inst = registry.get_instance(target)
                        if inst and inst.get("state") == "pending":
                            continue
                    if agents.is_available(target):
                        agents.trigger_sync(target, message=chat_msg,
                                            channel=job_channel, job_id=job_id)

        return f"Sent to job #{job_id} (msg_id={msg['id']})" + (
            " [suggestion]" if msg_type == "suggestion" else "")

    attachments = []
    if image_path:
        import shutil
        import uuid
        from pathlib import Path
        src = Path(image_path)
        if not src.exists():
            return f"Image not found: {image_path}"
        if src.suffix.lower() not in ('.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg'):
            return f"Unsupported image type: {src.suffix}"
        
        # Get upload dir from config (fall back to ./uploads)
        raw_dir = "./uploads"
        if config and "images" in config:
            raw_dir = config["images"].get("upload_dir", raw_dir)
        upload_dir = Path(raw_dir)
        
        upload_dir.mkdir(parents=True, exist_ok=True)
        filename = f"{uuid.uuid4().hex[:8]}{src.suffix}"
        shutil.copy2(str(src), str(upload_dir / filename))
        attachments.append({"name": src.name, "url": f"/uploads/{filename}"})

    reply_id = reply_to if reply_to >= 0 else None
    if reply_id is not None and store.get_by_id(reply_id) is None:
        return f"Message #{reply_to} not found."

    # Determine message type and metadata based on choices
    msg_type = "chat"
    metadata = None
    clean_choices = [c for c in (choices if choices else []) if isinstance(c, str) and c.strip()]
    if clean_choices:
        msg_type = "decision"
        metadata = {"choices": clean_choices, "resolved": False}

    msg = store.add(sender, message.strip(), attachments=attachments,
                    reply_to=reply_id, channel=channel,
                    msg_type=msg_type, metadata=metadata)
    _update_cursor(sender, [msg], channel)
    with _presence_lock:
        _presence[sender] = time.time()
    return f"Sent (id={msg['id']})"


def chat_propose_job(
    sender: str,
    title: str,
    body: str = "",
    channel: str = "general",
    ctx: Context | None = None,
) -> str:
    """Propose a job for human approval. Posts a proposal card in the timeline.
    The human can Accept (creates the job) or Dismiss. Agents must NOT create jobs
    directly â€” always propose and let the human decide.

    Args:
        title: Short job title (max 80 chars)
        body: Detailed description of the work (max 1000 chars)
        channel: Channel to post the proposal in
    """
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=True)
    if err:
        return err
    if not title.strip():
        return "Error: title is required."
    title = title.strip()[:80]
    body = (body or "").strip()[:1000]

    msg = store.add(
        sender, f"Job proposal: {title}",
        msg_type="job_proposal",
        channel=channel,
        metadata={"title": title, "body": body, "status": "pending"},
    )
    _update_cursor(sender, [msg], channel)
    with _presence_lock:
        _presence[sender] = time.time()
    return f"Proposed job (msg_id={msg['id']}): {title}"


def _resolve_attachments(attachments: list[dict]) -> list[dict]:
    """Add absolute file_path to attachments so agents can read images."""
    if not attachments:
        return attachments
    raw_dir = "./uploads"
    if config and "images" in config:
        raw_dir = config["images"].get("upload_dir", raw_dir)
    upload_dir = Path(raw_dir).resolve()
    resolved = []
    for att in attachments:
        a = dict(att)
        url = a.get("url", "")
        if url.startswith("/uploads/"):
            filename = url.split("/")[-1]
            a["file_path"] = str(upload_dir / filename)
        resolved.append(a)
    return resolved


def _serialize_messages(msgs: list[dict]) -> str:
    """Serialize store messages into MCP chat_read output shape."""
    out = []
    for m in msgs:
        entry = {
            "id": m["id"],
            "sender": m["sender"],
            "text": m["text"],
            "type": m["type"],
            "time": m["time"],
            "channel": m.get("channel", "general"),
        }
        if m.get("attachments"):
            entry["attachments"] = _resolve_attachments(m["attachments"])
        if m.get("reply_to") is not None:
            entry["reply_to"] = m["reply_to"]
        out.append(entry)
    return json.dumps(out, ensure_ascii=False) if out else ""


def _load_cursors():
    """Load cursor state from disk (called by run.py after store init)."""
    global _cursors
    if _CURSORS_FILE is None or not _CURSORS_FILE.exists():
        return
    try:
        data = json.loads(_CURSORS_FILE.read_text("utf-8"))
        with _cursors_lock:
            _cursors.update(data)
    except Exception:
        log.warning("Failed to load cursor state from %s", _CURSORS_FILE)


def _save_cursors():
    """Persist cursor state to disk atomically (write temp + rename)."""
    if _CURSORS_FILE is None:
        return
    try:
        with _cursors_lock:
            snapshot = dict(_cursors)
        _CURSORS_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _CURSORS_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(snapshot), "utf-8")
        os.replace(tmp, _CURSORS_FILE)  # atomic on POSIX
    except Exception:
        log.warning("Failed to save cursor state to %s", _CURSORS_FILE)


def _load_roles():
    """Load persisted roles from disk."""
    global _roles
    if _ROLES_FILE is None or not _ROLES_FILE.exists():
        return
    try:
        _roles = json.loads(_ROLES_FILE.read_text("utf-8"))
    except Exception:
        log.warning("Failed to load roles from %s", _ROLES_FILE)


def _save_roles():
    """Persist roles to disk atomically."""
    if _ROLES_FILE is None:
        return
    try:
        _ROLES_FILE.parent.mkdir(parents=True, exist_ok=True)
        tmp = _ROLES_FILE.with_suffix(".tmp")
        tmp.write_text(json.dumps(_roles), "utf-8")
        os.replace(tmp, _ROLES_FILE)
    except Exception:
        log.warning("Failed to save roles to %s", _ROLES_FILE)


def set_role(name: str, role: str):
    """Set or clear an agent's role. Empty string clears."""
    if role:
        _roles[name] = role
    else:
        _roles.pop(name, None)
    _save_roles()


def get_role(name: str) -> str:
    """Get an agent's current role, or empty string."""
    return _roles.get(name, "")


def get_all_roles() -> dict[str, str]:
    """All active roles."""
    return dict(_roles)


def migrate_identity(old_name: str, new_name: str):
    """Migrate all runtime state when an agent is renamed (presence, cursors, activity, roles)."""
    with _presence_lock:
        if old_name in _presence:
            _presence[new_name] = _presence.pop(old_name)
        if old_name in _activity:
            _activity[new_name] = _activity.pop(old_name)
        if old_name in _activity_ts:
            _activity_ts[new_name] = _activity_ts.pop(old_name)
        _renamed_from.add(old_name)  # suppress leave message for old name
    with _cursors_lock:
        if old_name in _cursors:
            _cursors[new_name] = _cursors.pop(old_name)
    if old_name in _roles:
        _roles[new_name] = _roles.pop(old_name)
        _save_roles()
    _save_cursors()


def purge_identity(name: str):
    """Remove all runtime state for a deregistered agent (presence, activity, cursors, roles)."""
    with _presence_lock:
        _presence.pop(name, None)
        _activity.pop(name, None)
        _activity_ts.pop(name, None)
    with _cursors_lock:
        _cursors.pop(name, None)
    if name in _roles:
        del _roles[name]
        _save_roles()
    _save_cursors()


def migrate_cursors_rename(old_name: str, new_name: str):
    """Move cursor entries from old channel name to new channel name."""
    with _cursors_lock:
        for agent_cursors in _cursors.values():
            if old_name in agent_cursors:
                agent_cursors[new_name] = agent_cursors.pop(old_name)
    _save_cursors()


def migrate_cursors_delete(channel: str):
    """Remove cursor entries for a deleted channel."""
    with _cursors_lock:
        for agent_cursors in _cursors.values():
            agent_cursors.pop(channel, None)
    _save_cursors()


def _update_cursor(sender: str, msgs: list[dict], channel: str | None):
    if sender and msgs:
        ch_key = channel if channel else "__all__"
        with _cursors_lock:
            agent_cursors = _cursors.setdefault(sender, {})
            agent_cursors[ch_key] = msgs[-1]["id"]
        _save_cursors()


def chat_read(
    sender: str = "",
    since_id: int = 0,
    limit: int = 20,
    channel: str = "",
    job_id: int = 0,
    ctx: Context | None = None,
) -> str:
    """Read chat messages. Returns JSON array with: id, sender, text, type, time, channel.

    Smart defaults:
    - First call with sender: returns last `limit` messages (full context).
    - Subsequent calls with same sender: returns only NEW messages since last read.
    - Pass since_id to override and read from a specific point.
    - Omit sender to always get the last `limit` messages (no cursor).
    - Pass channel to filter by channel name (default: all channels).
    - Pass job_id to read a specific job. Job reads return a header entry first,
      including title and body, followed by the thread messages."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=False)
    if err:
        return err

    # Job-scoped read: return job metadata plus the thread messages
    if job_id and jobs:
        job = jobs.get(job_id)
        msgs = jobs.get_messages(job_id)
        if job is None or msgs is None:
            return f"Error: job #{job_id} not found."
        # Remember so chat_send defaults back to this job thread.
        if sender:
            with _last_read_lock:
                _last_read_job_id[sender] = job_id
                _last_read_channel.pop(sender, None)
        title = (job.get("title") or "").strip()
        body = (job.get("body") or "").strip()
        header_text = f"Job: {title}" if title else f"Job #{job_id}"
        if body:
            header_text += f"\nDescription: {body}"
        out = [{
            "id": -1,
            "sender": "system",
            "text": header_text,
            "type": "job_header",
            "time": "",
            "job_id": job_id,
            "title": title,
            "body": body,
            "status": job.get("status", ""),
            "channel": job.get("channel", ""),
            "created_by": job.get("created_by", ""),
            "assignee": job.get("assignee", ""),
        }]
        for m in msgs:
            entry = {"id": m["id"], "sender": m["sender"], "text": m["text"],
                     "time": m.get("time", ""), "job_id": job_id}
            if m.get("attachments"):
                entry["attachments"] = _resolve_attachments(m["attachments"])
            if m.get("type"):
                entry["type"] = m["type"]
            if m.get("resolved"):
                entry["resolved"] = m["resolved"]
            out.append(entry)
        return json.dumps(out, ensure_ascii=False)

    ch = channel if channel else None
    # Remember the channel this agent just read so chat_send without an
    # explicit channel defaults here instead of falling back to "general".
    # Only record when a specific channel was requested â€” broad reads
    # (no channel) shouldn't overwrite a useful last-read.
    if sender and ch:
        with _last_read_lock:
            _last_read_channel[sender] = ch
            _last_read_job_id.pop(sender, None)
    if since_id:
        msgs = store.get_since(since_id, channel=ch)
    elif sender:
        ch_key = ch if ch else "__all__"
        with _cursors_lock:
            agent_cursors = _cursors.get(sender, {})
            cursor = agent_cursors.get(ch_key, 0)
        if cursor:
            msgs = store.get_since(cursor, channel=ch)
        else:
            msgs = store.get_recent(limit, channel=ch)
    else:
        msgs = store.get_recent(limit, channel=ch)

    msgs = msgs[-limit:]
    _update_cursor(sender, msgs, ch)
    serialized = _serialize_messages(msgs)

    # Escalating empty-read hints to discourage polling loops
    if not serialized and sender:
        _empty_read_count[sender] = _empty_read_count.get(sender, 0) + 1
        n = _empty_read_count[sender]
        if n == 1:
            serialized = "No new messages. Do not poll â€” wait for your next prompt."
        elif n == 2:
            serialized = ("No new messages. You have read with no results twice â€” "
                          "stop polling and wait for a trigger.")
        else:
            serialized = ("No new messages. STOP. Repeated empty reads waste tokens. "
                          "Wait for your next prompt.")
    elif sender:
        _empty_read_count[sender] = 0

    # Prepend identity breadcrumb if multi-instance
    if sender and registry and registry.is_registered(sender):
        multi = registry.family_instance_count(sender) >= 2
        if multi:
            inst = registry.get_instance(sender)
            if inst:
                breadcrumb = f"[identity: {inst['name']} | label: {inst['label']}]"
                serialized = f"{breadcrumb}\n{serialized}"
    return serialized


def chat_resync(
    sender: str,
    limit: int = 50,
    channel: str = "",
    ctx: Context | None = None,
) -> str:
    """Explicit full-context fetch.

    Returns the latest `limit` messages and resets the sender cursor
    to the latest returned message id.
    Pass channel to filter by channel name (default: all channels).
    """
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=True)
    if err:
        return err
    ch = channel if channel else None
    msgs = store.get_recent(limit, channel=ch)
    _update_cursor(sender, msgs, ch)
    serialized = _serialize_messages(msgs)
    return serialized


def chat_join(name: str, channel: str = "general", ctx: Context | None = None) -> str:
    """Announce that you've connected to chattr."""
    name, err = _resolve_tool_identity(name, ctx, field_name="name", required=True)
    if err:
        return err
    # Block pending instances (identity not yet confirmed)
    if registry and registry.is_pending(name):
        return "Error: identity not confirmed. Call chat_claim(sender=your_base_name) to get your identity."
    # Block base family names when multi-instance is active
    # (but allow if name is a registered+active instance â€” e.g. slot-1 'claude' that already claimed)
    if registry and name in registry.get_bases() and registry.family_instance_count(name) >= 2:
        inst = registry.get_instance(name)
        if not inst or inst.get("state") != "active":
            return (f"Error: multiple {name} instances registered. "
                    f"Call chat_claim(sender='{name}') to get your unique identity first.")
    # Block unregistered agent names (stale identity from resumed session)
    if registry and registry.is_agent_family(name) and not registry.is_registered(name):
        return f"Error: '{name}' is not registered. Call chat_claim(sender=your_base_name) to get your identity."
    store.add(name, f"{name} is online", msg_type="join", channel="general")
    online = _get_online()
    return f"Joined. Online: {', '.join(online)}"


def chat_who() -> str:
    """Check who's currently online in chattr."""
    online = _get_online()
    return f"Online: {', '.join(online)}" if online else "Nobody online."


def _touch_presence(name: str):
    """Update presence timestamp â€” called on any MCP tool use."""
    with _presence_lock:
        _presence[name] = time.time()


def _get_online() -> list[str]:
    now = time.time()
    with _presence_lock:
        return [name for name, ts in _presence.items()
                if now - ts < PRESENCE_TIMEOUT]


def is_online(name: str) -> bool:
    now = time.time()
    with _presence_lock:
        return name in _presence and now - _presence.get(name, 0) < PRESENCE_TIMEOUT


def set_active(name: str, active: bool):
    with _presence_lock:
        _activity[name] = active
        if active:
            _activity_ts[name] = __import__("time").time()


def is_active(name: str) -> bool:
    import time as _time
    with _presence_lock:
        if not _activity.get(name, False):
            return False
        # Auto-expire stale activity
        ts = _activity_ts.get(name, 0)
        if _time.time() - ts > ACTIVITY_TIMEOUT:
            _activity[name] = False
            return False
        return True


def _json_result(data) -> str:
    return json.dumps(data, ensure_ascii=False)


def _require_sender_for_write(sender: str, action: str) -> str | None:
    if not sender.strip():
        return f"Error: sender is required for {action}."
    return None


def chat_rules(
    action: str,
    sender: str,
    rule: str = "",
    reason: str = "",
    channel: str = "general",
    rule_id: int = 0,
    ctx: Context | None = None,
) -> str:
    """Manage shared rules â€” the working style for your agents.

    Actions:
      - list: Return active rules in the legacy human-readable format.
      - list_all: Return all rules as JSON.
      - propose: Create a draft/proposed rule. Requires rule text + sender.
      - activate: Activate a rule by rule_id.
      - draft: Move a rule back to draft by rule_id.
      - archive: Archive a rule by rule_id.
      - edit: Edit rule text/reason by rule_id.
      - delete: Permanently delete a rule by rule_id.

    Pass channel to place the proposal card in the correct chat channel (default: 'general')."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=False)
    if err:
        return err
    action = action.strip().lower()
    if not rules:
        return "Error: rules store not available."

    if action == "list":
        active = rules.active_list()
        if not active["rules"]:
            return "No active rules."
        lines = [f"Active rules (epoch {active['epoch']}):"]
        for i, r in enumerate(active["rules"], 1):
            lines.append(f"  {i}. {r}")
        return "\n".join(lines)

    if action in ("list_all", "all"):
        return _json_result(rules.list_all())

    if action == "propose":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not rule.strip():
            return "Error: rule text is required."
        result = rules.propose(rule, sender, reason)
        if result is None:
            return "Error: too many rules."
        if store:
            store.add(
                sender, f"Rule proposal: {result['text']}",
                msg_type="rule_proposal",
                channel=channel or "general",
                metadata={"rule_id": result["id"], "text": result["text"], "status": "pending"},
            )
        return _json_result(result)

    if action in ("activate", "draft", "make_draft", "archive", "deactivate", "edit", "delete"):
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not rule_id:
            return "Error: rule_id is required."
        if action == "activate":
            result = rules.activate(int(rule_id))
        elif action in ("draft", "make_draft"):
            result = rules.make_draft(int(rule_id))
        elif action in ("archive", "deactivate"):
            result = rules.deactivate(int(rule_id))
        elif action == "edit":
            result = rules.edit(int(rule_id), text=rule or None, reason=reason or None)
        else:
            result = rules.delete(int(rule_id))
            if result is not None:
                return _json_result({"ok": True, "deleted": result})
        if result is None:
            return "Error: rule not found or invalid."
        return _json_result(result)

    return "Unknown action: {0}. Valid actions: list, list_all, propose, activate, draft, archive, edit, delete.".format(action)


def chat_decision(
    action: str,
    sender: str,
    decision: str = "",
    reason: str = "",
    ctx: Context | None = None,
) -> str:
    """Backward-compatible alias for chat_rules. Use chat_rules instead."""
    return chat_rules(action=action, sender=sender, rule=decision, reason=reason, ctx=ctx)


def _job_with_messages(job: dict) -> dict:
    out = dict(job)
    job_id = out.get("id")
    out["messages"] = jobs.get_messages(job_id) if jobs and job_id is not None else []
    return out


def chat_jobs(
    action: str,
    sender: str,
    job_id: int = 0,
    title: str = "",
    body: str = "",
    status: str = "",
    assignee: str = "",
    channel: str = "",
    message: str = "",
    msg_id: int = 0,
    msg_index: int = 0,
    resolution: str = "",
    ordered_ids: list[int] | None = None,
    permanent: bool = False,
    ctx: Context | None = None,
) -> str:
    """Read and update jobs through MCP.

    Actions: list, get, create, update, archive, delete, reorder, message,
    delete_message, resolve_message."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=False)
    if err:
        return err
    action = action.strip().lower()
    if not jobs:
        return "Error: jobs store not available."

    if action == "list":
        ch = channel.strip() or None
        st = status.strip() or None
        return _json_result(jobs.list_all(channel=ch, status=st))

    if action == "get":
        if not job_id:
            return "Error: job_id is required."
        job = jobs.get(int(job_id))
        if not job:
            return f"Error: job #{job_id} not found."
        return _json_result(_job_with_messages(job))

    if action == "create":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not title.strip():
            return "Error: title is required."
        result = jobs.create(
            title=title,
            job_type="job",
            channel=channel.strip() or "general",
            created_by=sender,
            body=body,
            assignee=assignee or None,
            status=status or None,
        )
        if store:
            store.add(
                sender,
                f"Job created: {result['title']}",
                msg_type="job_created",
                channel=result.get("channel", "general"),
                metadata={"job_id": result["id"]},
            )
        return _json_result(result)

    if action == "update":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not job_id:
            return "Error: job_id is required."
        result = None
        if title.strip():
            result = jobs.update_title(int(job_id), title)
        if assignee.strip():
            result = jobs.update_assignee(int(job_id), assignee)
        if status.strip():
            result = jobs.update_status(int(job_id), status)
        if result is None:
            return "Error: job not found or invalid update."
        return _json_result(result)

    if action == "archive":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not job_id:
            return "Error: job_id is required."
        result = jobs.update_status(int(job_id), "archived")
        if result is None:
            return "Error: job not found."
        return _json_result(result)

    if action == "delete":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not job_id:
            return "Error: job_id is required."
        result = jobs.delete(int(job_id)) if permanent else jobs.update_status(int(job_id), "archived")
        if result is None:
            return "Error: job not found."
        if permanent:
            return _json_result({"ok": True, "deleted": result})
        return _json_result(result)

    if action == "reorder":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not status.strip():
            return "Error: status is required."
        if not ordered_ids:
            return "Error: ordered_ids is required."
        return _json_result(jobs.reorder(status.strip(), [int(i) for i in ordered_ids]))

    if action == "message":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not job_id:
            return "Error: job_id is required."
        if not message.strip():
            return "Error: message is required."
        msg_type = "chat"
        text = message.strip()
        if text.lower().startswith("[suggestion]"):
            msg_type = "suggestion"
            text = text[len("[suggestion]"):].strip()
        result = jobs.add_message(int(job_id), sender, text, msg_type=msg_type)
        if result is None:
            return f"Error: job #{job_id} not found."
        return _json_result(result)

    if action == "delete_message":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not job_id or not msg_id:
            return "Error: job_id and msg_id are required."
        result = jobs.delete_message(int(job_id), int(msg_id))
        if result is None:
            return "Error: job message not found."
        return _json_result({"ok": True, **result})

    if action == "resolve_message":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not job_id:
            return "Error: job_id is required."
        job = jobs.get(int(job_id))
        if not job:
            return "Error: job not found."
        msgs = job.get("messages", [])
        if msg_index < 0 or msg_index >= len(msgs):
            return "Error: message index out of range."
        msgs[msg_index]["resolved"] = resolution.strip() or "dismissed"
        jobs._save()
        return _json_result({"ok": True, "resolution": msgs[msg_index]["resolved"]})

    return "Unknown action: {0}. Valid actions: list, get, create, update, archive, delete, reorder, message, delete_message, resolve_message.".format(action)


def _pin_entry(message: dict, status: str) -> dict:
    return {
        "message_id": message["id"],
        "status": status,
        "message": {
            "id": message["id"],
            "sender": message.get("sender", ""),
            "text": message.get("text", ""),
            "type": message.get("type", "chat"),
            "time": message.get("time", ""),
            "channel": message.get("channel", "general"),
        },
    }


def chat_pins(
    action: str,
    sender: str = "",
    message_id: int = -1,
    status: str = "",
    ctx: Context | None = None,
) -> str:
    """Read and update pinned messages through MCP.

    Actions: list, add, done, reopen, remove, clear."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=False)
    if err:
        return err
    action = action.strip().lower()
    if not store:
        return "Error: message store not available."

    if action == "list":
        requested_status = status.strip() or None
        items = []
        for msg in store.get_todo_messages(status=requested_status):
            pin_status = store.get_todo_status(msg["id"])
            if pin_status:
                items.append(_pin_entry(msg, pin_status))
        return _json_result(items)

    if action in ("add", "done", "reopen", "remove"):
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if message_id < 0:
            return "Error: message_id is required."
        mid = int(message_id)
        if action == "add":
            ok = store.add_todo(mid)
            next_status = "todo"
        elif action == "done":
            ok = store.complete_todo(mid)
            next_status = "done"
        elif action == "reopen":
            ok = store.reopen_todo(mid)
            next_status = "todo"
        else:
            ok = store.remove_todo(mid)
            next_status = None
        if not ok:
            return "Error: message not found or pin state invalid."
        return _json_result({"ok": True, "message_id": mid, "status": next_status})

    if action == "clear":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        removed = []
        for mid in list(store.get_todos().keys()):
            if store.remove_todo(int(mid)):
                removed.append(int(mid))
        return _json_result({"ok": True, "removed": removed})

    return "Unknown action: {0}. Valid actions: list, add, done, reopen, remove, clear.".format(action)


def chat_locked(
    action: str,
    sender: str,
    locked_id: int = 0,
    text: str = "",
    reason: str = "",
    status: str = "",
    ctx: Context | None = None,
) -> str:
    """Read and update locked right-rail records through MCP.

    Actions: list, get, create, edit, archive, restore, delete."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=False)
    if err:
        return err
    action = action.strip().lower()
    if not locked:
        return "Error: locked store not available."

    if action == "list":
        st = status.strip() or None
        return _json_result(locked.list_all(status=st))

    if action == "get":
        if not locked_id:
            return "Error: locked_id is required."
        result = locked.get(int(locked_id))
        if result is None:
            return "Error: locked item not found."
        return _json_result(result)

    if action == "create":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        result = locked.create(text, sender, reason)
        if result is None:
            return "Error: text is required."
        return _json_result(result)

    if action == "edit":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not locked_id:
            return "Error: locked_id is required."
        result = locked.edit(
            int(locked_id),
            text=text if text.strip() else None,
            reason=reason if reason.strip() else None,
            updated_by=sender,
        )
        if result is None:
            return "Error: locked item not found or invalid update."
        return _json_result(result)

    if action == "archive":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not locked_id:
            return "Error: locked_id is required."
        result = locked.archive(int(locked_id), updated_by=sender)
        if result is None:
            return "Error: locked item not found."
        return _json_result(result)

    if action == "restore":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not locked_id:
            return "Error: locked_id is required."
        result = locked.restore(int(locked_id), updated_by=sender)
        if result is None:
            return "Error: locked item not found."
        return _json_result(result)

    if action == "delete":
        write_error = _require_sender_for_write(sender, action)
        if write_error:
            return write_error
        if not locked_id:
            return "Error: locked_id is required."
        result = locked.delete(int(locked_id))
        if result is None:
            return "Error: locked item not found."
        return _json_result({"ok": True, "deleted": result})

    return "Unknown action: {0}. Valid actions: list, get, create, edit, archive, restore, delete.".format(action)


# --- Server instances ---

def chat_set_hat(sender: str, svg: str, target: str = "", ctx: Context | None = None) -> str:
    """Set your avatar hat. Pass an SVG string (viewBox "0 0 32 16", max 5KB).
    The hat will appear above your avatar in chat. To remove, users can drag it to the trash.
    Color context for design â€” chat bg is dark (#0f0f17), avatar colors: claude=#da7756 (coral), codex=#10a37f (green), gemini=#4285f4 (blue), qwen=#8b5cf6 (violet).
    Optional: pass target to set a hat on another agent (e.g. target="qwen")."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=True)
    if err:
        return err
    hat_owner = target.strip() if target.strip() else sender
    from app import main as app
    err = app.set_agent_hat(hat_owner, svg)
    if err:
        return f"Error: {err}"
    if hat_owner != sender:
        return f"Hat set for {hat_owner} (by {sender})!"
    return f"Hat set for {sender}!"


def chat_claim(sender: str, name: str = "", ctx: Context | None = None) -> str:
    """Claim your identity in a multi-instance setup.

    - Without name: accept the auto-assigned identity and unlock chat_send.
    - With name: reclaim a previous identity (e.g. from a breadcrumb after /resume).

    Your sender must be your current registered name (the one assigned at registration).
    The identity breadcrumb in chat_read responses shows your current identity."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=True)
    if err:
        return err
    if not registry:
        return "Error: registry not available."
    target = name.strip() if name.strip() else None
    result = registry.claim(sender, target)
    if isinstance(result, str):
        return f"Error: {result}"
    # Touch presence with the CONFIRMED name (may differ from sender)
    confirmed = result.get("name", sender)
    _touch_presence(confirmed)
    return json.dumps({"confirmed_name": confirmed, "label": result.get("label", ""), "base": result.get("base", "")})


def chat_channels() -> str:
    """List all available channels. Returns a JSON array of channel names."""
    channels = room_settings.get("channels", ["general"]) if room_settings else ["general"]
    return json.dumps(channels)


def chat_summary(
    action: str,
    sender: str,
    text: str = "",
    channel: str = "",
    ctx: Context | None = None,
) -> str:
    """Read or write per-channel summaries. Summaries help agents catch up quickly.

    Actions:
      - read: Get the current summary for a channel (default: sender's last active channel).
      - write: Update the channel summary. Requires text (max 1000 chars).

    Keep summaries factual and concise (under 150 words). Focus on decisions made,
    tasks completed, and open questions."""
    sender, err = _resolve_tool_identity(sender, ctx, field_name="sender", required=False)
    if err:
        return err
    action = action.strip().lower()
    channel = (channel or "general").strip()

    if action == "read":
        entry = summaries.get(channel)
        if not entry:
            return json.dumps({"channel": channel, "text": None, "message": f"No summary for #{channel} yet â€” one hasn't been written."})
        return json.dumps(entry, ensure_ascii=False)

    if action == "write":
        if not text.strip():
            return "Error: text is required."
        if len(text.strip()) > 1000:
            return "Error: summary too long (max 1000 characters)."
        # Get the latest message ID for staleness tracking
        latest_id = 0
        if store:
            recent = store.get_recent(1, channel=channel)
            if recent:
                latest_id = recent[-1]["id"]
        result = summaries.write(channel, text, sender, message_id=latest_id)
        if result is None:
            return "Error: failed to write summary."
        # Post a visual summary message to the timeline
        if store:
            store.add(sender, text.strip(), msg_type="summary", channel=channel)
        return f"Summary for #{channel} updated ({len(text.strip())} chars)."

    return f"Unknown action: {action}. Valid actions: read, write."


def tool_manifest() -> list[dict]:
    """Return JSON-compatible metadata for the registered MCP tools."""
    return _TOOL_REGISTRY.manifest()


def configure_event_stream(path: str | Path | None):
    """Configure MCP tool-call events to append to a JSONL stream."""
    stream = JsonlEventStream(path) if path is not None else None
    _TOOL_REGISTRY.set_event_stream(stream)
    return stream


def chat_tool_manifest() -> str:
    """List Chattr MCP tools and their registry metadata as JSON."""
    return json.dumps(tool_manifest(), ensure_ascii=False)


def chat_preview_patch(source: str, hunks: list[dict] | None = None) -> str:
    """Preview a proposal patch against provided text without writing files."""
    result = apply_text_patch(source, hunks or [])
    return json.dumps(result, ensure_ascii=False)


def _define_tool(
    handler,
    *,
    category: str,
    side_effect: str,
    identity_required: bool,
    summary: str,
) -> ToolDefinition:
    return ToolDefinition(
        name=handler.__name__,
        handler=handler,
        category=category,
        side_effect=side_effect,
        identity_required=identity_required,
        summary=summary,
    )


def _build_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    for definition in [
        _define_tool(
            chat_send,
            category="chat",
            side_effect="writes_chat",
            identity_required=True,
            summary="Post a message, decision card, or attachment to a channel or job.",
        ),
        _define_tool(
            chat_read,
            category="chat",
            side_effect="read_only",
            identity_required=False,
            summary="Read channel or job messages with cursor-aware defaults.",
        ),
        _define_tool(
            chat_resync,
            category="chat",
            side_effect="read_only",
            identity_required=True,
            summary="Fetch recent context and reset the caller cursor.",
        ),
        _define_tool(
            chat_join,
            category="presence",
            side_effect="writes_chat",
            identity_required=True,
            summary="Announce an agent or human presence in the room.",
        ),
        _define_tool(
            chat_who,
            category="presence",
            side_effect="read_only",
            identity_required=False,
            summary="List currently online participants.",
        ),
        _define_tool(
            chat_rules,
            category="rules",
            side_effect="conditional_write",
            identity_required=False,
            summary="Read and update rules for the right rail.",
        ),
        _define_tool(
            chat_decision,
            category="rules",
            side_effect="conditional_write",
            identity_required=False,
            summary="Backward-compatible alias for chat_rules.",
        ),
        _define_tool(
            chat_channels,
            category="chat",
            side_effect="read_only",
            identity_required=False,
            summary="List available room channels.",
        ),
        _define_tool(
            chat_set_hat,
            category="profile",
            side_effect="writes_state",
            identity_required=True,
            summary="Set an avatar hat SVG for a participant.",
        ),
        _define_tool(
            chat_claim,
            category="identity",
            side_effect="writes_state",
            identity_required=True,
            summary="Claim or reclaim an agent identity in multi-instance sessions.",
        ),
        _define_tool(
            chat_summary,
            category="summary",
            side_effect="conditional_write",
            identity_required=False,
            summary="Read or update a concise per-channel summary.",
        ),
        _define_tool(
            chat_jobs,
            category="jobs",
            side_effect="conditional_write",
            identity_required=False,
            summary="Read and update jobs for the right rail.",
        ),
        _define_tool(
            chat_pins,
            category="pins",
            side_effect="conditional_write",
            identity_required=False,
            summary="Read and update pinned messages for the right rail.",
        ),
        _define_tool(
            chat_locked,
            category="locked",
            side_effect="conditional_write",
            identity_required=False,
            summary="Read and update locked records for the right rail.",
        ),
        _define_tool(
            chat_propose_job,
            category="proposal",
            side_effect="proposes_change",
            identity_required=True,
            summary="Post a human-reviewed job proposal card.",
        ),
        _define_tool(
            chat_tool_manifest,
            category="tools",
            side_effect="read_only",
            identity_required=False,
            summary="Return the live Chattr MCP tool manifest.",
        ),
        _define_tool(
            chat_preview_patch,
            category="proposal",
            side_effect="read_only",
            identity_required=False,
            summary="Preview a proposal patch against supplied text without file writes.",
        ),
    ]:
        registry.register(definition)
    return registry


_TOOL_REGISTRY = _build_tool_registry()
_ALL_TOOLS = _TOOL_REGISTRY.instrumented_functions()


def _create_server(port: int) -> FastMCP:
    server = FastMCP(
        "chattr",
        host=(
            os.environ.get("CHATTR_MCP_HOST", "").strip()
            or os.environ.get("AGENTCHATTR_MCP_HOST", "").strip()
            or "127.0.0.1"
        ),
        port=port,
        log_level="ERROR",
        instructions=_MCP_INSTRUCTIONS,
    )
    for func in _ALL_TOOLS:
        server.tool()(func)
    return server


mcp_http = _create_server(8841)  # streamable-http for Claude/Codex/Qwen
mcp_sse = _create_server(8842)   # SSE for Gemini

# Keep backward compat â€” run.py references mcp_bridge.store
# (store is set by run.py before starting)


def run_http_server():
    """Block â€” run streamable-http MCP in a background thread."""
    mcp_http.run(transport="streamable-http")


def run_sse_server():
    """Block â€” run SSE MCP in a background thread."""
    mcp_sse.run(transport="sse")

