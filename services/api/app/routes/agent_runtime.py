"""Per-agent runtime configuration surface — the transport switch.

GET  /api/agents/runtime-config           -> CLI agents with their transport
PUT  /api/agents/{agent}/runtime-config   -> set transport ("console" | "pty")

Writes land in config.local.toml (gitignored machine-local overlay; see
app/config.py LOCAL_AGENT_RUNTIME_KEYS) so the tracked config.toml never
carries machine state. The wrapper process reads the merged config when an
agent launches, so a change applies on that agent's next launch — the
response says so explicitly via effective_on_next_launch.

Transport semantics: governance/plans/kai-chattr-pty-ownership.md.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal

import tomlkit
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, ConfigDict

from app.config import ROOT, load_config

TRANSPORTS: tuple[str, ...] = ("console", "pty")


class AgentRuntimeConfig(BaseModel):
    agent: str
    label: str
    transport: Literal["console", "pty"]
    available_transports: list[str]
    effective_on_next_launch: bool = True


class AgentRuntimeConfigList(BaseModel):
    agents: list[AgentRuntimeConfig]


class TransportUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transport: Literal["console", "pty"]


def create_agent_runtime_router(root: Path | None = None) -> APIRouter:
    router = APIRouter(prefix="/api/agents", tags=["agent-runtime"])
    config_root = root or ROOT

    def _cli_agents() -> dict[str, dict]:
        agents = load_config(config_root).get("agents", {})
        return {
            name: cfg
            for name, cfg in agents.items()
            if isinstance(cfg, dict) and cfg.get("type") != "api"
        }

    def _entry(name: str, cfg: dict) -> AgentRuntimeConfig:
        transport = cfg.get("transport", "console")
        if transport not in TRANSPORTS:
            transport = "console"
        return AgentRuntimeConfig(
            agent=name,
            label=str(cfg.get("label", name)),
            transport=transport,
            available_transports=list(TRANSPORTS),
        )

    @router.get("/runtime-config", response_model=AgentRuntimeConfigList)
    def list_runtime_config() -> AgentRuntimeConfigList:
        return AgentRuntimeConfigList(
            agents=[_entry(name, cfg) for name, cfg in sorted(_cli_agents().items())]
        )

    @router.put("/{agent}/runtime-config", response_model=AgentRuntimeConfig)
    def update_runtime_config(agent: str, request: TransportUpdateRequest) -> AgentRuntimeConfig:
        agents = _cli_agents()
        if agent not in agents:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"unknown CLI agent {agent!r}",
            )

        local_path = config_root / "config.local.toml"
        if local_path.exists():
            document = tomlkit.parse(local_path.read_text(encoding="utf-8"))
        else:
            document = tomlkit.document()
            document.add(
                tomlkit.comment(
                    "Machine-local overrides (gitignored). Runtime keys on existing"
                )
            )
            document.add(
                tomlkit.comment("agents overlay config.toml; identity keys are protected.")
            )

        agents_table = document.get("agents")
        if agents_table is None:
            agents_table = tomlkit.table(is_super_table=True)
            document["agents"] = agents_table
        agent_table = agents_table.get(agent)
        if agent_table is None:
            agent_table = tomlkit.table()
            agents_table[agent] = agent_table
        agent_table["transport"] = request.transport

        local_path.write_text(tomlkit.dumps(document), encoding="utf-8")

        updated = dict(agents[agent])
        updated["transport"] = request.transport
        return _entry(agent, updated)

    return router
