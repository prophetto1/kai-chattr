import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Home</CardTitle>
          <CardDescription>
            Placeholder — the signed-in user&apos;s home. Auth-gated (gate pending the auth/tenant backend).
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Per-user / per-tenant content goes here.
        </CardContent>
      </Card>
    </main>
  )
}
