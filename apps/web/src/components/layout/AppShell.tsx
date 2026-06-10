import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type AppShellProps = {
  rail?: ReactNode
  children: ReactNode
  className?: string
}

export function AppShell({ rail, children, className }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      {rail}
      <div className={cn('flex min-h-0 min-w-0 flex-1 flex-col gap-[5px] p-[5px] pl-0', className)}>
        {children}
      </div>
    </div>
  )
}
