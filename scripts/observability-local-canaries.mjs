import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { KAI_CHATTR_PORTS } from './lib/kai-chattr-dev-ports.mjs';

const collectorSource = readFileSync(new URL('../ops/otel/collector.local.yaml', import.meta.url), 'utf8');
const runScriptSource = readFileSync(new URL('./dev/run-observability-local.ps1', import.meta.url), 'utf8');
const stopScriptSource = readFileSync(new URL('./dev/stop-observability-local.ps1', import.meta.url), 'utf8');
const packageSource = readFileSync(new URL('../package.json', import.meta.url), 'utf8');

assert.equal(KAI_CHATTR_PORTS.otelGrpc, 8837);
assert.equal(KAI_CHATTR_PORTS.otelHttp, 8838);
assert.equal(KAI_CHATTR_PORTS.jaegerUi, 8886);

assert(collectorSource.includes('endpoint: 0.0.0.0:8838'), 'Collector exposes OTLP HTTP on kai-chattr port 8838');
assert(collectorSource.includes('endpoint: 0.0.0.0:8837'), 'Collector exposes OTLP gRPC on kai-chattr port 8837');
assert(collectorSource.includes('allowed_origins:'), 'Collector config declares browser CORS origins');
assert(collectorSource.includes('http://localhost:8800'), 'Collector CORS allows localhost web origin');
assert(collectorSource.includes('http://127.0.0.1:8800'), 'Collector CORS allows loopback web origin');
assert(collectorSource.includes('endpoint: kai-chattr-jaeger:8837'), 'Collector exports to Jaeger over Docker network on kai-chattr port 8837');
assert(collectorSource.includes('insecure: true'), 'Local Jaeger exporter disables TLS only for local loop');
assert(collectorSource.includes('otlphttp/logfire'), 'Collector declares Logfire OTLP HTTP exporter');
assert(collectorSource.includes('endpoint: ${env:LOGFIRE_OTLP_ENDPOINT:-https://logfire-us.pydantic.dev}'), 'Collector defaults Logfire to the US OTLP endpoint while allowing env override');
assert(collectorSource.includes('Authorization: "Bearer ${env:LOGFIRE_TOKEN}"'), 'Collector reads the Logfire token from environment substitution');
assert(collectorSource.includes('deployment.environment'), 'Collector stamps dev deployment environment on local telemetry');
assert(collectorSource.includes('exporters:') && collectorSource.includes('otlp/jaeger'), 'Trace pipeline exports to Jaeger');
assert(collectorSource.includes('- otlphttp/logfire'), 'Trace pipeline exports to Logfire');

assert(runScriptSource.includes('kai-chattr-jaeger'), 'Runner uses stable Jaeger container name');
assert(runScriptSource.includes('kai-chattr-otel-collector'), 'Runner uses stable collector container name');
assert(runScriptSource.includes('function Test-DockerPortBinding'), 'Runner checks existing container port bindings');
assert(runScriptSource.includes('Remove-LocalContainer $JaegerContainer'), 'Runner can recreate stale Jaeger container bindings');
assert(runScriptSource.includes('Remove-LocalContainer $CollectorContainer'), 'Runner can recreate stale collector bindings');
assert(runScriptSource.includes('[int] $JaegerUiPort = 8886'), 'Runner defaults Jaeger UI to kai-chattr port 8886');
assert(runScriptSource.includes('[int] $OtelHttpPort = 8838'), 'Runner defaults OTLP HTTP to kai-chattr port 8838');
assert(runScriptSource.includes('[int] $OtelGrpcPort = 8837'), 'Runner defaults OTLP gRPC to kai-chattr port 8837');
assert(runScriptSource.includes('LOGFIRE_TOKEN is required'), 'Runner fails closed when the SOPS Logfire token is absent');
assert(runScriptSource.includes('-e "LOGFIRE_TOKEN=$env:LOGFIRE_TOKEN"'), 'Runner passes the SOPS Logfire token into the collector environment');
assert(runScriptSource.includes('-e "LOGFIRE_OTLP_ENDPOINT=$EffectiveLogfireEndpoint"'), 'Runner passes the Logfire endpoint into the collector environment');
assert(runScriptSource.includes('Remove-LocalContainer $CollectorContainer'), 'Runner recreates the collector so SOPS token/config changes are applied');
assert(runScriptSource.includes('-p "$($JaegerUiPort):16686"'), 'Runner maps Jaeger UI to the kai-chattr host port');
assert(runScriptSource.includes('-p "$($OtelHttpPort):$OtelHttpPort"'), 'Runner exposes collector OTLP HTTP on the kai-chattr host port');
assert(runScriptSource.includes('-p "$($OtelGrpcPort):$OtelGrpcPort"'), 'Runner exposes collector OTLP gRPC on the kai-chattr host port');
assert(runScriptSource.includes('COLLECTOR_OTLP_ENABLED=true'), 'Runner enables Jaeger OTLP receiver');
assert(runScriptSource.includes('Logfire is SOPS-gated and exported by the local OpenTelemetry Collector'), 'Runner documents Logfire as SOPS-gated and collector-exported');
assert(!runScriptSource.includes('-p 4318:4318') && !runScriptSource.includes('-p 4317:4317') && !runScriptSource.includes('-p 16686:16686'), 'Runner does not expose legacy observability host ports');
assert(!collectorSource.includes(':4318') && !collectorSource.includes(':4317'), 'Collector config does not use default OTLP host ports');
assert(stopScriptSource.includes('docker stop'), 'Stop script stops local observability containers');

assert(packageSource.includes('"observability:local": "sops exec-env secrets/dev/auth.yaml'), 'Root package starts local observability through SOPS');
assert(packageSource.includes('"observability:local:recreate": "sops exec-env secrets/dev/auth.yaml'), 'Root package recreates local observability through SOPS');
assert(packageSource.includes('"observability:local:stop"'), 'Root package exposes observability stop script');
assert(packageSource.includes('"observability:canaries"'), 'Root package exposes observability canaries');

console.log(JSON.stringify({
  collector_otlp_http_cors_enabled: true,
  collector_exports_to_jaeger: true,
  collector_exports_to_logfire: true,
  jaeger_ui_exposed: true,
  logfire_sops_gated: true,
  observability_ports_in_kai_chattr_band: true,
  observability_scripts_declared: true,
}, null, 2));
