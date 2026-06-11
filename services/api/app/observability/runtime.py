"""Runtime observability instruments for the chattr backend runtime.

Per the 2026-05-17 Phase 2 remediation amendment, this module wires the
nine instruments locked by the 2026-05-16 parent plan:

Trace spans:
- runtime.events.ingest       (runtime event ingestion)
- runtime.events.persist      (server/events/jsonl_stream.py)
- runtime.session.bind        (server/runtime/session_registry.py)

Metrics:
- chattr.runtime.events.ingest.count        (Counter, labeled by event.type)
- chattr.runtime.events.rejected.count      (Counter, labeled by reason)
- chattr.runtime.events.ingest.duration_ms  (Histogram, ms)
- chattr.runtime.events.dropped.count       (Counter, host queue drops)

Structured logs:
- runtime.session.opened                    (logger chattr.runtime.session, level INFO)
- runtime.session.closed                    (logger chattr.runtime.session, level INFO)

Exporter: tests and compatibility paths can still use local JSON-lines files
under chattr data_dir (data/otel_traces.jsonl, data/otel_metrics.jsonl).
Local dev now uses OTLP to the repo-owned OpenTelemetry Collector and Jaeger
loop when launched through the root dev script.

Test isolation: tracer/meter providers install once per process, but the
export file paths are re-pointable via set_export_paths() so test classes
that swap data_dir between TemporaryDirectory instances all get fresh
output files. This mirrors the chattr_test_configure re-plumbing pattern.
"""

from __future__ import annotations

import json
import logging
import threading
from collections.abc import Awaitable, Callable
from pathlib import Path
from typing import Any, Mapping

from fastapi import FastAPI
from opentelemetry import metrics, trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.metrics import Counter, Histogram, Meter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import (
    MetricExporter,
    MetricExportResult,
    PeriodicExportingMetricReader,
)
from opentelemetry.sdk.trace import SpanProcessor, TracerProvider
from opentelemetry.sdk.trace.export import (
    BatchSpanProcessor,
    ConsoleSpanExporter,
    SimpleSpanProcessor,
    SpanExporter,
    SpanExportResult,
)
from opentelemetry.trace import ProxyTracerProvider, Status, StatusCode
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.endpoint_contract import (
    EndpointDefinition,
    endpoint_definitions_for_app,
    identify_endpoint as identify_endpoint_definition,
)
from app.settings import Settings


FORBIDDEN_ATTR_KEYS: frozenset[str] = frozenset(
    {
        "command_text",
        "command",
        "cwd",
        "env",
        "environment",
        "secret",
        "secrets",
        "token",
        "password",
        "api_key",
        "username",
        "os_user",
        "user_name",
        "raw_bytes",
        "stdout",
        "stderr",
        "stdin",
        "user_prompt",
    }
)

_CATALOG_APP: FastAPI | None = None


class EndpointTelemetryMiddleware(BaseHTTPMiddleware):
    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        endpoint = identify_endpoint(request.method, request.url.path)
        if endpoint is None:
            return await call_next(request)

        tracer = trace.get_tracer("kai_chattr.api")
        with tracer.start_as_current_span(endpoint.span_name) as span:
            _set_endpoint_span_attributes(span, endpoint)
            try:
                response = await call_next(request)
            except Exception as exc:
                span.record_exception(exc)
                span.set_status(Status(StatusCode.ERROR, str(exc)))
                raise

            span.set_attribute("http.response.status_code", response.status_code)
            span.set_attribute("kai_chattr.endpoint.result", _result_for_status(response.status_code))
            if response.status_code >= 500:
                span.set_status(Status(StatusCode.ERROR))
            return response


class ForbiddenAttributeError(ValueError):
    """Raised when an attribute key is on the locked forbidden list."""


def validate_attrs(attrs: Mapping[str, Any]) -> dict[str, Any]:
    """Return attrs as a plain dict after rejecting forbidden keys.

    Call this at every span/metric attribute site so the locked forbidden
    list is enforced uniformly. Keys are case-sensitive and matched exactly.
    """
    out: dict[str, Any] = {}
    for k, v in attrs.items():
        if k in FORBIDDEN_ATTR_KEYS:
            raise ForbiddenAttributeError(
                f"observability attribute key {k!r} is on the locked forbidden list"
            )
        out[k] = v
    return out


def configure_observability(app: FastAPI, settings: Settings) -> None:
    global _CATALOG_APP
    _CATALOG_APP = app
    if getattr(app.state, "kai_chattr_observability_configured", False):
        return

    app.add_middleware(EndpointTelemetryMiddleware)
    FastAPIInstrumentor.instrument_app(app, tracer_provider=trace.get_tracer_provider())
    app.state.kai_chattr_observability_configured = True


def observed_endpoint_catalog() -> list[dict[str, str]]:
    if _CATALOG_APP is None:
        return []
    return [
        endpoint.to_observability_dict()
        for endpoint in endpoint_definitions_for_app(_CATALOG_APP)
    ]


def identify_endpoint(method: str, path: str) -> EndpointDefinition | None:
    if _CATALOG_APP is None:
        return None
    return identify_endpoint_definition(
        endpoint_definitions_for_app(_CATALOG_APP),
        method,
        path,
    )


def _set_endpoint_span_attributes(span: trace.Span, endpoint: EndpointDefinition) -> None:
    span.set_attribute("kai_chattr.endpoint.area", endpoint.area)
    span.set_attribute("kai_chattr.endpoint.auth", endpoint.auth)
    span.set_attribute("kai_chattr.endpoint.operation", endpoint.operation)
    span.set_attribute("kai_chattr.endpoint.path_template", endpoint.path)
    span.set_attribute("kai_chattr.endpoint.proxy", endpoint.proxy)
    span.set_attribute("kai_chattr.endpoint.surface", endpoint.surface)
    span.set_attribute("http.request.method", endpoint.method)
    span.set_attribute("http.route", endpoint.path)


def _result_for_status(status_code: int) -> str:
    if status_code >= 500:
        return "error"
    if status_code >= 400:
        return "client_error"
    return "ok"


# Path holders. Updated by set_export_paths(); read each export() so tests
# can repoint between classes after the providers are already installed.
_paths_lock = threading.Lock()
_traces_path: Path = Path("./data/otel_traces.jsonl")
_metrics_path: Path = Path("./data/otel_metrics.jsonl")


def set_export_paths(data_dir: Path) -> None:
    """Point the JSON-lines exporters at data_dir/otel_{traces,metrics}.jsonl."""
    global _traces_path, _metrics_path
    data_dir = Path(data_dir)
    with _paths_lock:
        _traces_path = data_dir / "otel_traces.jsonl"
        _metrics_path = data_dir / "otel_metrics.jsonl"


def _get_traces_path() -> Path:
    with _paths_lock:
        return _traces_path


def _get_metrics_path() -> Path:
    with _paths_lock:
        return _metrics_path


# Instrument singletons. Populated by init_observability(). Access via
# getter functions (events_ingest_counter() etc.) so call sites pick up
# the current instrument after init_observability runs - module-level
# `from .. import X` would otherwise freeze the None binding.
_TRACER: trace.Tracer | None = None
_METER: Meter | None = None
_EVENTS_INGEST_COUNT: Counter | None = None
_EVENTS_REJECTED_COUNT: Counter | None = None
_EVENTS_DROPPED_COUNT: Counter | None = None
_EVENTS_INGEST_DURATION_MS: Histogram | None = None

runtime_session_logger = logging.getLogger("chattr.runtime.session")


def events_ingest_counter() -> Counter | None:
    return _EVENTS_INGEST_COUNT


def events_rejected_counter() -> Counter | None:
    return _EVENTS_REJECTED_COUNT


def events_dropped_counter() -> Counter | None:
    return _EVENTS_DROPPED_COUNT


def events_ingest_duration_ms() -> Histogram | None:
    return _EVENTS_INGEST_DURATION_MS


class _JsonlSpanExporter(SpanExporter):
    """Append completed spans as JSON-lines to the current traces path."""

    def __init__(self) -> None:
        self._write_lock = threading.Lock()

    def export(self, spans) -> SpanExportResult:
        records: list[dict[str, Any]] = []
        for span in spans:
            ctx = span.get_span_context()
            start = span.start_time or 0
            end = span.end_time or 0
            duration_ms = (end - start) / 1_000_000 if start and end else None
            attrs = dict(span.attributes) if span.attributes else {}
            records.append(
                {
                    "name": span.name,
                    "trace_id": f"{ctx.trace_id:032x}",
                    "span_id": f"{ctx.span_id:016x}",
                    "start_ns": start,
                    "end_ns": end,
                    "duration_ms": duration_ms,
                    "status": span.status.status_code.name,
                    "attributes": attrs,
                }
            )
        path = _get_traces_path()
        with self._write_lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                for r in records:
                    f.write(
                        json.dumps(r, ensure_ascii=False, sort_keys=True, default=str)
                        + "\n"
                    )
        return SpanExportResult.SUCCESS

    def shutdown(self) -> None:  # pragma: no cover - lifecycle
        pass

    def force_flush(self, timeout_millis: int = 30_000) -> bool:
        return True


class _JsonlMetricExporter(MetricExporter):
    """Append metric points as JSON-lines to the current metrics path."""

    def __init__(self) -> None:
        super().__init__()
        self._write_lock = threading.Lock()

    def export(self, metrics_data, timeout_millis: float = 10_000, **kwargs) -> MetricExportResult:
        records: list[dict[str, Any]] = []
        for resource_metrics in metrics_data.resource_metrics:
            for scope_metrics in resource_metrics.scope_metrics:
                for metric in scope_metrics.metrics:
                    data = metric.data
                    for point in data.data_points:
                        attrs = dict(point.attributes) if point.attributes else {}
                        rec: dict[str, Any] = {
                            "name": metric.name,
                            "unit": metric.unit,
                            "time_unix_nano": getattr(point, "time_unix_nano", None),
                            "attributes": attrs,
                        }
                        if hasattr(point, "value"):
                            rec["value"] = point.value
                        if hasattr(point, "sum"):
                            rec["sum"] = point.sum
                        if hasattr(point, "count"):
                            rec["count"] = point.count
                        if hasattr(point, "bucket_counts"):
                            rec["bucket_counts"] = list(point.bucket_counts)
                            rec["explicit_bounds"] = list(point.explicit_bounds)
                        records.append(rec)
        path = _get_metrics_path()
        with self._write_lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            with path.open("a", encoding="utf-8") as f:
                for r in records:
                    f.write(
                        json.dumps(r, ensure_ascii=False, sort_keys=True, default=str)
                        + "\n"
                    )
        return MetricExportResult.SUCCESS

    def force_flush(self, timeout_millis: float = 10_000) -> bool:
        return True

    def shutdown(self, timeout_millis: float = 30_000, **kwargs) -> None:  # pragma: no cover
        pass


_INITIALIZED = False
_INIT_LOCK = threading.Lock()
_SPAN_PROCESSOR: BatchSpanProcessor | None = None
_METER_PROVIDER: MeterProvider | None = None
_TRACER_PROVIDER: TracerProvider | None = None


def init_observability(data_dir: Path, settings: Settings | None = None) -> None:
    """Install global tracer + meter providers wired to the JSON-lines exporters.

    Idempotent. First call installs the providers; later calls only update
    the export paths via set_export_paths() so tests reusing the same
    process across TemporaryDirectory boundaries still see fresh files.
    """
    global _INITIALIZED, _TRACER, _METER, _SPAN_PROCESSOR, _METER_PROVIDER, _TRACER_PROVIDER
    global _EVENTS_INGEST_COUNT, _EVENTS_REJECTED_COUNT, _EVENTS_DROPPED_COUNT, _EVENTS_INGEST_DURATION_MS

    set_export_paths(data_dir)

    with _INIT_LOCK:
        if _INITIALIZED:
            return

        settings = settings or Settings()
        tracer_provider = TracerProvider(
            resource=Resource.create(
                {
                    "service.name": settings.otel_service_name,
                    "service.namespace": "kai-chattr",
                }
            )
        )
        span_processor = _build_span_processor(settings)
        tracer_provider.add_span_processor(span_processor)
        if isinstance(trace.get_tracer_provider(), ProxyTracerProvider):
            trace.set_tracer_provider(tracer_provider)
        _TRACER_PROVIDER = tracer_provider
        _SPAN_PROCESSOR = span_processor
        _TRACER = trace.get_tracer("chattr.runtime")

        reader = PeriodicExportingMetricReader(
            _JsonlMetricExporter(),
            export_interval_millis=5_000,
        )
        meter_provider = MeterProvider(metric_readers=[reader])
        metrics.set_meter_provider(meter_provider)
        _METER_PROVIDER = meter_provider
        _METER = metrics.get_meter("chattr.runtime")

        _EVENTS_INGEST_COUNT = _METER.create_counter(
            "chattr.runtime.events.ingest.count",
            description="Runtime events accepted by the runtime event ingestion seam",
        )
        _EVENTS_REJECTED_COUNT = _METER.create_counter(
            "chattr.runtime.events.rejected.count",
            description="Runtime events rejected by the runtime event ingestion seam",
        )
        _EVENTS_DROPPED_COUNT = _METER.create_counter(
            "chattr.runtime.events.dropped.count",
            description="Host bounded-queue drops surfaced via runtime.events.dropped",
        )
        _EVENTS_INGEST_DURATION_MS = _METER.create_histogram(
            "chattr.runtime.events.ingest.duration_ms",
            unit="ms",
            description="End-to-end latency of runtime event ingestion",
        )

        _INITIALIZED = True


def _build_span_processor(settings: Settings) -> SpanProcessor:
    exporter = _build_span_exporter(settings)
    exporter_name = settings.otel_traces_exporter.strip().lower()
    if exporter_name == "console":
        return SimpleSpanProcessor(exporter)
    return BatchSpanProcessor(exporter)


def _build_span_exporter(settings: Settings) -> SpanExporter:
    exporter = settings.otel_traces_exporter.strip().lower()
    if exporter == "jsonl":
        return _JsonlSpanExporter()
    if exporter == "console":
        return ConsoleSpanExporter()
    if exporter == "otlp":
        endpoint = settings.otel_exporter_otlp_endpoint.strip()
        if endpoint:
            return OTLPSpanExporter(endpoint=endpoint)
        return OTLPSpanExporter()
    raise RuntimeError(f"unsupported OTEL_TRACES_EXPORTER: {settings.otel_traces_exporter}")


def get_tracer() -> trace.Tracer:
    """Return the chattr.runtime Tracer. Falls back to a no-op if uninitialized."""
    if _TRACER is None:
        return trace.get_tracer("chattr.runtime")
    return _TRACER


def get_meter() -> Meter:
    """Return the chattr.runtime Meter. Falls back to a no-op if uninitialized."""
    if _METER is None:
        return metrics.get_meter("chattr.runtime")
    return _METER


def force_flush(timeout_millis: int = 1_000) -> None:
    """Synchronously flush spans and metrics. Used by tests to assert on files."""
    if _SPAN_PROCESSOR is not None:
        _SPAN_PROCESSOR.force_flush(timeout_millis=timeout_millis)
    if _METER_PROVIDER is not None:
        _METER_PROVIDER.force_flush(timeout_millis=timeout_millis)
