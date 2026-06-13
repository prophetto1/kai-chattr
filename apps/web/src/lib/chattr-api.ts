declare global {
  interface Window {
    __SESSION_TOKEN__?: string
    __CHATTR_SESSION_TOKEN__?: string
    __CHATTR_SESSION__?: { token?: string }
  }
}

// Phase 0 auth unification: the only user credential is a kcs_ auth session.
// The transport owns token storage (auth-api re-uses these helpers) so there
// is exactly one storage source. The dev launcher token is NOT a credential.
const SESSION_TOKEN_KEY = 'kai_chattr_session_token'

export function getStoredSessionToken(): string {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(SESSION_TOKEN_KEY) ?? ''
}

export function storeSessionToken(token: string) {
  if (typeof window !== 'undefined') window.localStorage.setItem(SESSION_TOKEN_KEY, token)
}

export function clearSessionToken() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_TOKEN_KEY)
}

export function getSessionToken() {
  if (typeof window === 'undefined') {
    return ''
  }

  const stored = getStoredSessionToken()
  if (stored) {
    return stored
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

  return ''
}

let localBootstrap: Promise<string> | null = null

/**
 * Resolve the session token, bootstrapping the local owner session when no
 * session is stored (local mode only; the API refuses the bootstrap when not
 * local/loopback, in which case the caller is unauthenticated until login).
 */
export async function resolveSessionToken(): Promise<string> {
  const existing = getSessionToken()
  if (existing) {
    return existing
  }

  if (!localBootstrap) {
    localBootstrap = fetch(chattrApiUrl('/auth/local-session'), {
      method: 'POST',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then(async (response) => {
        if (!response.ok) {
          console.warn(`local session bootstrap unavailable (${response.status}); login required`)
          return ''
        }
        const payload = (await response.json()) as { token?: string }
        if (payload.token) {
          storeSessionToken(payload.token)
          return payload.token
        }
        return ''
      })
      .catch((error) => {
        console.warn('local session bootstrap failed', error)
        return ''
      })
      .finally(() => {
        localBootstrap = null
      })
  }
  return localBootstrap
}

export async function chattrHeaders(init?: HeadersInit) {
  const headers = new Headers(init)
  const token = await resolveSessionToken()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
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
