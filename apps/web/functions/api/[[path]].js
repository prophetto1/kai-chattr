const DEFAULT_DEV_API_ORIGIN = 'https://kai-chattr-api-dev.fly.dev'
const DEFAULT_PROD_API_ORIGIN = 'https://kai-chattr-api.fly.dev'

export async function onRequest(context) {
  // Phase 0 auth unification: the proxy FORWARDS the caller's Authorization
  // header and never injects a shared identity. Every visitor authenticates
  // as themselves against auth_sessions on the API.
  const incomingUrl = new URL(context.request.url)
  const apiOrigin = resolveApiOrigin(context.env, incomingUrl.hostname)
  const targetUrl = new URL(incomingUrl.pathname + incomingUrl.search, apiOrigin)
  const headers = new Headers(context.request.headers)

  headers.delete('host')
  headers.delete('cf-connecting-ip')
  headers.delete('cf-ipcountry')
  headers.delete('cf-ray')
  headers.delete('cf-visitor')
  headers.delete('x-forwarded-for')
  headers.delete('x-forwarded-proto')

  const response = await fetch(targetUrl, {
    method: context.request.method,
    headers,
    body: bodyFor(context.request),
    redirect: 'manual',
  })

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

function resolveApiOrigin(env, hostname) {
  const configured = trimTrailingSlash(env.KAI_CHATTR_API_ORIGIN)
  if (configured) {
    return configured
  }

  return hostname === 'kai-chattr.pages.dev'
    ? DEFAULT_PROD_API_ORIGIN
    : DEFAULT_DEV_API_ORIGIN
}

function trimTrailingSlash(value) {
  return typeof value === 'string' ? value.trim().replace(/\/$/, '') : ''
}

function bodyFor(request) {
  return request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body
}

function jsonError(error, status) {
  return new Response(JSON.stringify({ error }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
