import type { ReactNode } from 'react'
import { Link } from 'react-router'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

/**
 * Public auth shell — centered card with header. Lifted in shape from the
 * kai-ai donor (AuthPublicLayout + authFormShared) and rebuilt on shadcn.
 * Designer owns the final visual treatment; structure + wiring are real.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          {subtitle ? <CardDescription>{subtitle}</CardDescription> : null}
        </CardHeader>
        <CardContent className="grid gap-4">{children}</CardContent>
      </Card>
    </main>
  )
}

export function AuthAlerts({ error, info }: { error?: string | null; info?: string | null }) {
  if (!error && !info) return null
  return (
    <div className="grid gap-2" role="alert">
      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-muted-foreground">
          {info}
        </p>
      ) : null}
    </div>
  )
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3">
      <Separator className="flex-1" />
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      <Separator className="flex-1" />
    </div>
  )
}

export function AuthFooter({
  prompt,
  linkTo,
  linkLabel,
}: {
  prompt: string
  linkTo: string
  linkLabel: string
}) {
  return (
    <p className="text-center text-sm text-muted-foreground">
      {prompt}{' '}
      <Link to={linkTo} className="font-medium text-foreground underline-offset-4 hover:underline">
        {linkLabel}
      </Link>
    </p>
  )
}
