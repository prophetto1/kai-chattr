import { useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router'

import { AuthAlerts, AuthDivider, AuthFooter, AuthShell } from '@/components/auth/auth-shell'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APP_ROUTES } from '@/lib/app-routes'
import { AuthError, getStoredSessionToken, login } from '@/lib/auth-api'

/**
 * Public auth route `/login` (locked route law). Real form wired to the
 * FastAPI `POST /auth/login`; structure lifted from the kai-ai donor, rebuilt
 * on shadcn. Visual polish belongs to the designer; the flow works.
 */
function safeRedirect(raw: string | null): string {
  return raw && raw.startsWith('/') ? raw : APP_ROUTES.home
}

export default function LoginPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(params.get('auth_error'))

  if (getStoredSessionToken()) {
    return <Navigate to={safeRedirect(params.get('redirect'))} replace />
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login({ email: email.trim(), password })
      navigate(safeRedirect(params.get('redirect')))
    } catch (err) {
      // /auth/login returns a uniform 401 — never reveal whether the email exists.
      setError(
        err instanceof AuthError && err.status === 401
          ? 'Invalid email or password.'
          : err instanceof Error
            ? err.message
            : 'Sign-in is unavailable right now. Please try again.',
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Welcome back" subtitle="Sign in to access your workspace.">
      <AuthAlerts error={error} />
      <OAuthButtons />
      <AuthDivider label="or continue with email" />

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="login-email">Email</Label>
          <Input
            id="login-email"
            type="email"
            autoComplete="email"
            required
            placeholder="name@work-email.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <Input
            id="login-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            placeholder="Enter your password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <AuthFooter prompt="Don't have an account?" linkTo={APP_ROUTES.signup} linkLabel="Create account" />
    </AuthShell>
  )
}
