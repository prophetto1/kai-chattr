import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Public auth route `/login` — the canonical public entry (locked:
 * governance/plans/kai-chattr-scope-based-routing-foundation.md).
 * Placeholder shell — designer owns the visual design.
 *
 * Wiring contract (backend live): POST /auth/login
 *   body  { email, password }
 *   200 → { token, expires_at, user{id,email,display_name} } (store the bearer token)
 *   401 → uniform "invalid credentials" (response never reveals whether the email exists)
 * Logout: POST /auth/logout with Authorization: Bearer <token> revokes the session.
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Placeholder — public route. Form design pending.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Login form goes here (email, password → POST /auth/login).
        </CardContent>
      </Card>
    </main>
  )
}
