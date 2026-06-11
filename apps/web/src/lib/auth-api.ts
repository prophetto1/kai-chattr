// Auth wiring for the public auth pages. Talks to kai-chattr's own FastAPI
// /auth/* endpoints (argon2 + revocable DB sessions) — NOT Supabase/GoTrue.
// The bearer session token is stored client-side and replayed as
// `Authorization: Bearer <token>`.
import { chattrApiUrl } from '@/lib/chattr-api'

const SESSION_TOKEN_KEY = 'kai_chattr_session_token'

export type AuthUser = { id: string; email: string; display_name: string }
export type AuthWorkspace = { public_id: string; name: string; tier: string }
export type AuthSession = {
  token: string
  expires_at: string | null
  user: AuthUser
  workspace?: AuthWorkspace
}

export function storeSessionToken(token: string) {
  if (typeof window !== 'undefined') window.localStorage.setItem(SESSION_TOKEN_KEY, token)
}
export function getStoredSessionToken(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(SESSION_TOKEN_KEY)
}
export function clearStoredSessionToken() {
  if (typeof window !== 'undefined') window.localStorage.removeItem(SESSION_TOKEN_KEY)
}

export class AuthError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

async function authFetch<T>(path: string, init: RequestInit): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  const response = await fetch(chattrApiUrl(path), { ...init, cache: 'no-store', headers })
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    // FastAPI errors surface as { detail }.
    const detail =
      payload && typeof payload === 'object' && 'detail' in payload
        ? String((payload as { detail: unknown }).detail)
        : `Request failed (${response.status})`
    throw new AuthError(detail, response.status)
  }
  return payload as T
}

export async function signup(input: {
  email: string
  password: string
  displayName?: string
}): Promise<AuthSession> {
  const session = await authFetch<AuthSession>('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({
      email: input.email,
      password: input.password,
      display_name: input.displayName ?? '',
    }),
  })
  storeSessionToken(session.token)
  return session
}

export async function login(input: { email: string; password: string }): Promise<AuthSession> {
  const session = await authFetch<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  storeSessionToken(session.token)
  return session
}

export async function logout(): Promise<void> {
  const token = getStoredSessionToken()
  try {
    if (token) {
      await authFetch('/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
    }
  } finally {
    clearStoredSessionToken()
  }
}

/** OAuth start endpoint (a 302 redirect on the backend) — navigate the browser to it. */
export function oauthStartUrl(provider: 'google' | 'github'): string {
  return chattrApiUrl(`/auth/oauth/${provider}`)
}
