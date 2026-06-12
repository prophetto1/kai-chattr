from __future__ import annotations

import conftest  # noqa: E402

from fastapi.testclient import TestClient

from app import main as api_main
from conftest import chattr_test_configure


def test_model_providers_http_crud_flow(tmp_path):
    chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)
    headers = conftest.session_headers()

    list_blank = client.get("/api/model-providers", headers=headers)
    assert list_blank.status_code == 200
    assert list_blank.json() == []

    created = client.post(
        "/api/model-providers",
        headers=headers,
        json={
            "name": "Primary",
            "provider": "openai",
            "model": "gpt-4o-mini",
            "base_url": "https://api.openai.com/v1",
            "api_key_env": "OPENAI_API_KEY",
            "enabled": True,
        },
    )
    assert created.status_code == 200
    created_body = created.json()
    assert created_body["id"] == 1
    provider_id = created_body["id"]

    duplicate = client.post(
        "/api/model-providers",
        headers=headers,
        json={
            "name": "primary",
            "provider": "openai",
            "model": "gpt-4.1",
        },
    )
    assert duplicate.status_code == 400

    found = client.get(f"/api/model-providers/{provider_id}", headers=headers)
    assert found.status_code == 200
    assert found.json()["name"] == "Primary"

    updated = client.patch(
        f"/api/model-providers/{provider_id}",
        headers=headers,
        json={"enabled": False, "model": "gpt-4o"},
    )
    assert updated.status_code == 200
    assert updated.json()["model"] == "gpt-4o"
    assert updated.json()["enabled"] is False

    only_active = client.get("/api/model-providers?include_inactive=false", headers=headers)
    assert only_active.status_code == 200
    assert only_active.json() == []

    all_providers = client.get("/api/model-providers", headers=headers)
    assert all_providers.status_code == 200
    assert len(all_providers.json()) == 1

    deleted = client.delete(f"/api/model-providers/{provider_id}", headers=headers)
    assert deleted.status_code == 200
    assert deleted.json()["ok"] is True

    gone = client.get(f"/api/model-providers/{provider_id}", headers=headers)
    assert gone.status_code == 404


def test_model_providers_reject_invalid_payloads(tmp_path):
    chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)
    headers = conftest.session_headers()

    bad = client.post(
        "/api/model-providers",
        headers=headers,
        json={"name": "", "provider": "openai", "model": "gpt-4o"},
    )
    assert bad.status_code == 400
    assert bad.json()["error"] == "invalid or duplicate provider payload"

    created = client.post(
        "/api/model-providers",
        headers=headers,
        json={"name": "OpenAI", "provider": "openai", "model": "gpt-4o"},
    )
    assert created.status_code == 200
    provider_id = created.json()["id"]

    missing = client.patch(f"/api/model-providers/{provider_id}", headers=headers, json={})
    assert missing.status_code == 400
    assert missing.json()["error"] == "no update fields"
