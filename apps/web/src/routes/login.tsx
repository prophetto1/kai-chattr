import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Log in</CardTitle>
          <CardDescription>Placeholder — public route. Auth form not wired yet.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Login form goes here.</CardContent>
      </Card>
    </main>
  )
}
