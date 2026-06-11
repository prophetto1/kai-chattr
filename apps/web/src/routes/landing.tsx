import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { APP_ROUTES } from '@/lib/app-routes'

export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">kai-chattr</CardTitle>
          <CardDescription>Landing — placeholder. Public route.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => navigate('/login')}>Log in</Button>
          <Button variant="outline" onClick={() => navigate('/register')}>
            Register
          </Button>
          <Button variant="ghost" onClick={() => navigate(APP_ROUTES.workbenchHelper)}>
            Workbench
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
