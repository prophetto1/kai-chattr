import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

type SheetProps = {
  children: ReactNode
  className?: string
}

export function Sheet({ children, className }: SheetProps) {
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[10px] border border-border bg-card',
        'shadow-[0_1px_2px_rgba(17,18,24,0.05),0_4px_16px_rgba(17,18,24,0.06)]',
        className
      )}
    >
      {children}
    </section>
  )
}
