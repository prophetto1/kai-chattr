import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Public auth route `/signup` (locked: governance/plans/kai-chattr-scope-based-routing-foundation.md).
 * Placeholder shell — designer owns the visual design.
 *
 * Wiring contract (backend live): POST /auth/signup
 *   body  { email, password (min 8), display_name? }
 *   201 → { token, expires_at, user{id,email,display_name}, workspace{public_id,name,tier} }
 *         (signup auto-creates the personal workspace; store the bearer token)
 *   409 → email already registered (S1: one human = one email)
 */
export default function SignupPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign up</CardTitle>
          <CardDescription>Placeholder — public route. Form design pending.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Sign-up form goes here (email, password, display name → POST /auth/signup).
        </CardContent>
      </Card>
    </main>
  )
}
