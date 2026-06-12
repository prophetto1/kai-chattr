declare global {
  interface Window {
    __SESSION_TOKEN__?: string
    __CHATTR_SESSION_TOKEN__?: string
    __CHATTR_SESSION__?: { token?: string }
  }
}

export function getSessionToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  if (window.__SESSION_TOKEN__) {
    return window.__SESSION_TOKEN__
  }

  if (window.__CHATTR_SESSION_TOKEN__) {
    return window.__CHATTR_SESSION_TOKEN__
  }

  if (window.__CHATTR_SESSION__?.token) {
    return window.__CHATTR_SESSION__.token
  }

  const fromEnv = import.meta.env.VITE_KAI_CHATTR_SESSION_TOKEN
  if (typeof fromEnv === 'string' && fromEnv) {
    return fromEnv
  }

  return ''
}

export async function resolveSessionToken() {
  return getSessionToken()
}

export async function chattrHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  const token = await resolveSessionToken()

  if (token) {
    headers.set('X-Session-Token', token)
  }

  return headers
}

export function chattrApiUrl(path: string) {
  const configuredOrigin = import.meta.env.VITE_KAI_CHATTR_API_ORIGIN
  const origin = typeof configuredOrigin === 'string' ? configuredOrigin.replace(/\/$/, '') : ''

  if (!origin || /^https?:\/\//i.test(path)) {
    return path
  }

  return `${origin}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Low-level transport ONLY. Product code should call contract-bound helpers
 * (see `chattr-api-contracts.ts` and the per-area `lib/*-api.ts` modules)
 * rather than passing raw '/api/...' string literals from components.
 * The endpoint-contracts governance boundary test enforces this.
 */
export async function chattrJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = await chattrHeaders(init.headers)

  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(chattrApiUrl(path), {
    ...init,
    cache: 'no-store',
    headers,
  })
  const payload = await response.json().catch(() => null)

  if (!response.ok) {
    const message =
      payload && typeof payload === 'object' && 'error' in payload
        ? String(payload.error)
        : `Request failed with ${response.status}`
    throw new Error(message)
  }

  return payload as T
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown error'
}

export {}
