from __future__ import annotations

import tomllib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app import main as api_main
from conftest import chattr_test_configure


def test_plain_pydantic_status_reports_structured_validation_contracts() -> None:
    from app.pydantic_contracts import PydanticContractStatus, describe_pydantic_contract_status

    status = describe_pydantic_contract_status()

    assert isinstance(status, PydanticContractStatus)
    assert status.package == "pydantic"
    assert status.status == "active"
    assert status.capabilities.request_models is True
    assert status.capabilities.response_models is True
    assert status.capabilities.structured_outputs is True
    assert status.capabilities.type_adapter_validation is True
    assert status.capabilities.settings_validation is True
    assert {contract.name for contract in status.structured_outputs} == {
        "api-request-models",
        "runtime-event-models",
        "mcp-tool-schemas",
        "routing-decision-models",
    }


def test_structured_output_contract_rejects_untyped_extra_fields() -> None:
    from app.pydantic_contracts import StructuredOutputContract

    with pytest.raises(ValidationError):
        StructuredOutputContract.model_validate(
            {
                "name": "routing-result",
                "purpose": "Validate a routing decision payload.",
                "unexpected": True,
            }
        )


def test_pydantic_contract_status_endpoint_uses_response_model(tmp_path: Path) -> None:
    chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)

    response = client.get("/schemas/pydantic/status")

    assert response.status_code == 200
    body = response.json()
    assert body["package"] == "pydantic"
    assert body["status"] == "active"
    assert body["capabilities"]["structured_outputs"] is True
    assert {contract["name"] for contract in body["structured_outputs"]} == {
        "api-request-models",
        "runtime-event-models",
        "mcp-tool-schemas",
        "routing-decision-models",
    }


def test_pydantic_ai_status_route_is_not_registered(tmp_path: Path) -> None:
    token = chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)

    response = client.get("/agents/pydantic-ai/status", headers={"X-Session-Token": token})

    assert response.status_code == 404


def test_pydantic_ai_dependency_is_not_declared() -> None:
    pyproject = Path(__file__).parents[1] / "pyproject.toml"
    project = tomllib.loads(pyproject.read_text(encoding="utf-8"))["project"]

    assert "pydantic>=2.7" in project["dependencies"]
    assert "pydantic-settings>=2.0" in project["dependencies"]
    assert all("pydantic-ai" not in dependency for dependency in project["dependencies"])
