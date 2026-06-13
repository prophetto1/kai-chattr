import { useEffect, useState } from 'react'

import { Navigate, Outlet, useLocation } from 'react-router'

import { getStoredSessionToken, resolveSessionToken } from '@/lib/chattr-api'

type AuthState = 'checking' | 'authed' | 'anonymous'

/**
 * Authenticated app shell gate (Phase 0 auth plan v2, Task 6).
 *
 * With a stored session: render. Without one: attempt the local-owner
 * bootstrap exactly once (the API refuses it outside local mode), then
 * either render or redirect to /login?next=<original destination>.
 */
export function RequireAuth() {
  const location = useLocation()
  const [state, setState] = useState<AuthState>(() =>
    getStoredSessionToken() ? 'authed' : 'checking'
  )

  useEffect(() => {
    if (state !== 'checking') return
    let cancelled = false
    void resolveSessionToken().then((token) => {
      if (!cancelled) setState(token ? 'authed' : 'anonymous')
    })
    return () => {
      cancelled = true
    }
  }, [state])

  if (state === 'checking') {
    return null
  }
  if (state === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  return <Outlet />
}
