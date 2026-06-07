export const KAI_CHATTR_PORTS = Object.freeze({
  web: 8800,
  api: 8840,
  mcpHttp: 8841,
  mcpSse: 8842,
});

export const FORBIDDEN_LEGACY_PORTS = Object.freeze([8300, 8301, 8302]);

export const PORT_REGISTRY = Object.freeze([
  { port: KAI_CHATTR_PORTS.web, service: 'kai-chattr web Vite', owner: 'apps/web' },
  { port: KAI_CHATTR_PORTS.api, service: 'kai-chattr API/WebSocket', owner: 'services/api' },
  { port: KAI_CHATTR_PORTS.mcpHttp, service: 'kai-chattr MCP streamable HTTP', owner: 'services/api' },
  { port: KAI_CHATTR_PORTS.mcpSse, service: 'kai-chattr MCP SSE', owner: 'services/api' },
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

function localUrl(port, path) {
  const normalizedPath = path ? (path.startsWith('/') ? path : `/${path}`) : '';
  return `http://127.0.0.1:${port}${normalizedPath}`;
}
