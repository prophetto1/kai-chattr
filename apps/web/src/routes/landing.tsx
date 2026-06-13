import { useNavigate } from 'react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * The one public, non-auth page (Phase 0 auth plan v2, Task 6). The only
 * ways in are Log in and Create account — no Workbench bypass.
 */
export default function LandingPage() {
  const navigate = useNavigate()
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle className="text-2xl">kai chattr</CardTitle>
          <CardDescription>
            A workspace where you and your agents work in the same room.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button onClick={() => navigate('/login')}>Log in</Button>
          <Button variant="outline" onClick={() => navigate('/signup')}>
            Create account
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
