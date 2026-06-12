from __future__ import annotations

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SimpleSpanProcessor, SpanExporter

from app import main as api_main
from app import observability
from app.endpoint_contract import endpoint_definitions_for_app, endpoint_policy_for_path
from app.observability import runtime as observability_runtime
from app.settings import Settings
from conftest import chattr_test_configure


IGNORED_FASTAPI_ROUTES = {
    ("GET", "/docs"),
    ("GET", "/docs/oauth2-redirect"),
    ("GET", "/openapi.json"),
    ("GET", "/redoc"),
}
SAFE_METHODS = {"DELETE", "GET", "PATCH", "POST", "PUT"}


class RecordingOTLPSpanExporter(SpanExporter):
    endpoints: list[str | None] = []

    def __init__(self, endpoint: str | None = None, **_: object) -> None:
        self.endpoint = endpoint
        self.endpoints.append(endpoint)

    def export(self, spans: object):
        from opentelemetry.sdk.trace.export import SpanExportResult

        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:
        return None

    def force_flush(self, timeout_millis: int = 30000) -> bool:
        return True


def test_observed_endpoint_catalog_matches_fastapi_routes() -> None:
    actual_routes: set[tuple[str, str]] = set()
    for route in api_main.app.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods or set():
            if method in SAFE_METHODS and (method, route.path) not in IGNORED_FASTAPI_ROUTES:
                actual_routes.add((method, route.path))

    catalog_routes = {
        (endpoint["method"], endpoint["path"])
        for endpoint in observability.observed_endpoint_catalog()
    }

    assert catalog_routes == actual_routes


def test_identify_endpoint_uses_route_templates_instead_of_raw_ids() -> None:
    endpoint = observability.identify_endpoint(
        "DELETE",
        "/api/jobs/job-123/messages/msg-456",
    )

    assert endpoint is not None
    assert endpoint.path == "/api/jobs/{job_id}/messages/{msg_id}"
    assert endpoint.span_name == "kai_chattr.api.jobs.messages.delete"


def test_observability_endpoint_lists_span_names(tmp_path) -> None:
    chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)

    response = client.get("/observability/endpoints")

    assert response.status_code == 200
    endpoints = response.json()
    assert any(
        endpoint["span_name"] == "kai_chattr.api.observability.endpoints.list"
        for endpoint in endpoints
    )
    assert all(endpoint["span_name"].startswith("kai_chattr.api.") for endpoint in endpoints)


def test_endpoint_contract_classifies_auth_and_proxy_surfaces() -> None:
    endpoints = {
        (endpoint.method, endpoint.path): endpoint
        for endpoint in endpoint_definitions_for_app(api_main.app)
    }

    assert endpoints[("GET", "/observability/endpoints")].auth == "public"
    assert endpoints[("GET", "/observability/endpoints")].proxy == "observability"
    assert endpoints[("GET", "/observability/endpoints")].surface == "observability"

    assert endpoints[("GET", "/api/runtime/ports")].auth == "public"
    assert endpoints[("GET", "/api/runtime/ports")].proxy == "api"

    assert endpoints[("PATCH", "/api/settings")].auth == "session"
    assert endpoints[("PATCH", "/api/settings")].surface == "settings"

    assert endpoints[("POST", "/api/register")].auth == "local-or-remote-agent-token"
    assert endpoints[("GET", "/api/poll/{agent_name}")].auth == "local-or-agent-bearer"
    assert endpoints[("GET", "/api/terminal/{agent_name}")].auth == "session-or-agent-bearer"

    assert endpoints[("GET", "/uploads/{filename}")].auth == "public"
    assert endpoints[("GET", "/uploads/{filename}")].proxy == "uploads"

    assert endpoints[("GET", "/api/roles")].auth == "session-or-local-agent-bearer"
    assert endpoints[("POST", "/api/roles/{agent_name}")].auth == "session-or-local-agent-bearer"
    assert endpoint_policy_for_path("GET", "/api/roles-extra").auth == "session"

    assert endpoints[("GET", "/api/git/repositories/search")].auth == "session"
    assert endpoints[("GET", "/api/git/repositories/search")].surface == "home-start"
    assert endpoints[("GET", "/api/git/branches/search")].surface == "home-start"


def test_observability_catalog_exposes_contract_metadata(tmp_path) -> None:
    chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)

    response = client.get("/observability/endpoints")

    assert response.status_code == 200
    endpoint = next(
        item
        for item in response.json()
        if item["method"] == "PATCH" and item["path"] == "/api/settings"
    )
    assert endpoint["auth"] == "session"
    assert endpoint["proxy"] == "api"
    assert endpoint["route_name"] == "patch_settings"
    assert endpoint["surface"] == "settings"


def test_observability_status_reports_trace_exporter(
    tmp_path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("OTEL_TRACES_EXPORTER", "otlp")
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", " http://127.0.0.1:8838/v1/traces ")
    monkeypatch.setenv("LOGFIRE_ENABLED", "true")
    monkeypatch.setenv("LOGFIRE_TOKEN", "test-logfire-token")
    chattr_test_configure(tmp_path)
    client = TestClient(api_main.app)

    response = client.get("/observability/status")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "active"
    assert body["service_name"] == "kai-chattr-api"
    assert body["otel_service_name"] == "kai-chattr-api"
    assert body["otel_traces_exporter"] == "otlp"
    assert body["otel_exporter_otlp_endpoint"] == "http://127.0.0.1:8838/v1/traces"
    assert body["otel_jaeger_ui_url"] == "http://127.0.0.1:8886"
    assert body["observability_stack"] == [
        "opentelemetry",
        "otel-collector",
        "jaeger",
        "logfire",
    ]
    assert body["logfire_enabled"] is True
    assert body["logfire_configured"] is True


def test_console_tracing_uses_synchronous_span_processor() -> None:
    processor = observability._build_span_processor(Settings(OTEL_TRACES_EXPORTER="console"))

    assert isinstance(processor, SimpleSpanProcessor)
    processor.shutdown()


def test_otlp_tracing_uses_batch_span_processor(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(observability_runtime, "OTLPSpanExporter", RecordingOTLPSpanExporter)

    processor = observability._build_span_processor(Settings(OTEL_TRACES_EXPORTER="otlp"))

    assert isinstance(processor, BatchSpanProcessor)
    processor.shutdown()


def test_otlp_exporter_trims_configured_trace_endpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    RecordingOTLPSpanExporter.endpoints = []
    monkeypatch.setattr(observability_runtime, "OTLPSpanExporter", RecordingOTLPSpanExporter)

    exporter = observability._build_span_exporter(
        Settings(
            OTEL_TRACES_EXPORTER="otlp",
            OTEL_EXPORTER_OTLP_ENDPOINT=" http://127.0.0.1:1738/v1/traces ",
        )
    )

    assert isinstance(exporter, RecordingOTLPSpanExporter)
    assert RecordingOTLPSpanExporter.endpoints == ["http://127.0.0.1:1738/v1/traces"]


def test_otlp_exporter_uses_default_endpoint_when_config_is_blank(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    RecordingOTLPSpanExporter.endpoints = []
    monkeypatch.setattr(observability_runtime, "OTLPSpanExporter", RecordingOTLPSpanExporter)

    exporter = observability._build_span_exporter(
        Settings(
            OTEL_TRACES_EXPORTER="otlp",
            OTEL_EXPORTER_OTLP_ENDPOINT="   ",
        )
    )

    assert isinstance(exporter, RecordingOTLPSpanExporter)
    assert RecordingOTLPSpanExporter.endpoints == [None]


def test_unsupported_trace_exporter_fails_closed() -> None:
    with pytest.raises(RuntimeError, match="unsupported OTEL_TRACES_EXPORTER"):
        observability._build_span_exporter(Settings(OTEL_TRACES_EXPORTER="zipkin"))


def test_registry_metadata_reaches_endpoint_catalog() -> None:
    endpoints = {
        (e.method, e.path): e for e in endpoint_definitions_for_app(api_main.app)
    }

    settings = endpoints[("PATCH", "/api/settings")]
    assert settings.scope == "global"
    assert settings.canonical_status == "legacy"
    assert settings.data_owner == "settings store"

    send = endpoints[("POST", "/api/send")]
    assert send.scope == "global"
    assert send.canonical_status == "legacy"
    assert send.data_owner == "MessageStore JSONL"

    observed = endpoints[("GET", "/observability/endpoints")]
    assert observed.scope == "public"
    assert observed.canonical_status == "internal"

    status = endpoints[("GET", "/schemas/endpoint-contracts/status")]
    assert status.canonical_status == "internal"
    assert status.response_model == "coverage_status dict"

    account = endpoints[("GET", "/api/user/account")]
    assert account.scope == "user"
    assert account.canonical_status == "canonical"

    catalog_entry = next(
        item
        for item in observability_runtime.observed_endpoint_catalog()
        if item["method"] == "PATCH" and item["path"] == "/api/settings"
    )
    for key in ("scope", "canonical_status", "data_owner", "request_model", "response_model"):
        assert key in catalog_entry


class _RecordingSpan:
    def __init__(self) -> None:
        self.attributes: dict[str, object] = {}

    def set_attribute(self, key: str, value: object) -> None:
        self.attributes[key] = value


def test_endpoint_span_attributes_exclude_forbidden_identifiers() -> None:
    definition = next(
        e
        for e in endpoint_definitions_for_app(api_main.app)
        if e.path == "/api/send"
    )
    span = _RecordingSpan()
    observability_runtime._set_endpoint_span_attributes(span, definition)

    forbidden_fragments = ("user_id", "session_hash", "email", "token", "filename")
    for key in span.attributes:
        for fragment in forbidden_fragments:
            assert fragment not in key.lower(), f"forbidden attribute key: {key}"
    allowed_prefixes = ("kai_chattr.endpoint.", "http.request.method", "http.route")
    for key in span.attributes:
        assert key.startswith(allowed_prefixes), f"unexpected span attribute: {key}"
