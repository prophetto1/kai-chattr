from __future__ import annotations

from typing import Literal

import pydantic
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


class PydanticCapabilities(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_models: bool = True
    response_models: bool = True
    structured_outputs: bool = True
    type_adapter_validation: bool = True
    settings_validation: bool = True


class StructuredOutputContract(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, str_strip_whitespace=True)

    name: str = Field(min_length=1)
    purpose: str = Field(min_length=1)
    validates: tuple[str, ...] = Field(default_factory=tuple)


class PydanticContractStatus(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    package: Literal["pydantic"] = "pydantic"
    package_version: str
    status: Literal["active"] = "active"
    capabilities: PydanticCapabilities
    structured_outputs: tuple[StructuredOutputContract, ...]


_STRUCTURED_OUTPUT_ADAPTER = TypeAdapter(tuple[StructuredOutputContract, ...])


def describe_pydantic_contract_status() -> PydanticContractStatus:
    structured_outputs = _STRUCTURED_OUTPUT_ADAPTER.validate_python(
        (
            {
                "name": "api-request-models",
                "purpose": "Validate inbound FastAPI payloads before store and repository writes.",
                "validates": ("field types", "required fields", "defaulted metadata"),
            },
            {
                "name": "runtime-event-models",
                "purpose": "Validate WebSocket/runtime event envelopes before persistence or replay.",
                "validates": ("event envelope shape", "schema version", "payload metadata"),
            },
            {
                "name": "mcp-tool-schemas",
                "purpose": "Use Pydantic contracts for MCP tool inputs and outputs.",
                "validates": ("tool input types", "tool output envelopes", "extra-field rejection"),
            },
            {
                "name": "routing-decision-models",
                "purpose": "Prepare durable routing decisions beyond mention-only dispatch.",
                "validates": ("assignee identity", "routing reason", "decision source"),
            },
        )
    )
    return PydanticContractStatus(
        package_version=pydantic.__version__,
        capabilities=PydanticCapabilities(),
        structured_outputs=structured_outputs,
    )
