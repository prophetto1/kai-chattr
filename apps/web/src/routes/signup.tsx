import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'

import { AuthAlerts, AuthDivider, AuthFooter, AuthShell } from '@/components/auth/auth-shell'
import { OAuthButtons } from '@/components/auth/oauth-buttons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { APP_ROUTES } from '@/lib/app-routes'
import { AuthError, getStoredSessionToken, signup } from '@/lib/auth-api'

/**
 * Public auth route `/signup` (locked route law). Real form wired to the
 * FastAPI `POST /auth/signup` (which also creates the personal workspace +
 * issues a session). Structure lifted from the kai-ai donor, rebuilt on
 * shadcn; designer owns the visual polish.
 */
export default function SignupPage() {
  const navigate = useNavigate()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (getStoredSessionToken()) {
    return <Navigate to={APP_ROUTES.home} replace />
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setInfo(null)
    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setLoading(true)
    try {
      await signup({ email: email.trim(), password, displayName: displayName.trim() || undefined })
      navigate(APP_ROUTES.home)
    } catch (err) {
      if (err instanceof AuthError && err.status === 409) {
        // S1: one human = one email.
        setInfo('That email is already registered. Try signing in instead.')
      } else {
        setError(
          err instanceof Error ? err.message : 'Sign-up is unavailable right now. Please try again.',
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell title="Create account" subtitle="Get started with your kai-chattr workspace.">
      <AuthAlerts error={error} info={info} />
      <OAuthButtons />
      <AuthDivider label="or sign up with email" />

      <form onSubmit={handleSubmit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="signup-name">Full name</Label>
          <Input
            id="signup-name"
            autoComplete="name"
            placeholder="Your name"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <Input
            id="signup-email"
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
            <Label htmlFor="signup-password">Password</Label>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setShowPassword((value) => !value)}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
          <Input
            id="signup-password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            placeholder="Create a password (min 8 characters)"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="signup-confirm">Confirm password</Label>
          <Input
            id="signup-confirm"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            required
            placeholder="Confirm your password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </Button>
      </form>

      <AuthFooter prompt="Already have an account?" linkTo={APP_ROUTES.login} linkLabel="Sign in" />
    </AuthShell>
  )
}
