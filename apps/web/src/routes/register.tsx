import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function RegisterPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Register</CardTitle>
          <CardDescription>Placeholder — public route. Sign-up form not wired yet.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">Registration form goes here.</CardContent>
      </Card>
    </main>
  )
}
