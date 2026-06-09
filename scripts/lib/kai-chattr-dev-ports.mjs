export const KAI_CHATTR_PORTS = Object.freeze({
  web: 8800,
  api: 8840,
  mcpHttp: 8841,
  mcpSse: 8842,
  otelGrpc: 8837,
  otelHttp: 8838,
  jaegerUi: 8886,
});

export const FORBIDDEN_LEGACY_PORTS = Object.freeze([8300, 8301, 8302]);

export const PORT_REGISTRY = Object.freeze([
  { port: KAI_CHATTR_PORTS.web, service: 'kai-chattr web Vite', owner: 'apps/web' },
  { port: KAI_CHATTR_PORTS.api, service: 'kai-chattr API/WebSocket', owner: 'services/api' },
  { port: KAI_CHATTR_PORTS.mcpHttp, service: 'kai-chattr MCP streamable HTTP', owner: 'services/api' },
  { port: KAI_CHATTR_PORTS.mcpSse, service: 'kai-chattr MCP SSE', owner: 'services/api' },
  { port: KAI_CHATTR_PORTS.otelGrpc, service: 'kai-chattr OTel Collector gRPC', owner: 'ops/otel' },
  { port: KAI_CHATTR_PORTS.otelHttp, service: 'kai-chattr OTel Collector HTTP', owner: 'ops/otel' },
  { port: KAI_CHATTR_PORTS.jaegerUi, service: 'kai-chattr Jaeger UI', owner: 'ops/otel' },
]);

export function localWebUrl(path = '') {
  return localUrl(KAI_CHATTR_PORTS.web, path);
}

export function localApiUrl(path = '') {
  return localUrl(KAI_CHATTR_PORTS.api, path);
}

export function localMcpHttpUrl(path = '/mcp') {
  return localUrl(KAI_CHATTR_PORTS.mcpHttp, path);
}

export function localMcpSseUrl(path = '/sse') {
  return localUrl(KAI_CHATTR_PORTS.mcpSse, path);
}

export function localOtelHttpTracesUrl() {
  return localUrl(KAI_CHATTR_PORTS.otelHttp, '/v1/traces');
}

export function localJaegerUrl() {
  return localUrl(KAI_CHATTR_PORTS.jaegerUi);
}

function localUrl(port, path) {
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `http://127.0.0.1:${port}${normalizedPath}`;
}
