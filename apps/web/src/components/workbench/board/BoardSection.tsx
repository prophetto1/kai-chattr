'use client'

import { type ReactNode, useState } from 'react'
import { IconChevronRight } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { cn } from '@/lib/cn'

type BoardSectionProps = {
  action?: ReactNode
  children: ReactNode
  className?: string
  collapsible?: boolean
  count: number
  defaultOpen?: boolean
  description?: string
  title: string
}

export function BoardSection({
  action,
  children,
  className,
  collapsible = true,
  count,
  defaultOpen = true,
  description,
  title,
}: BoardSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  const heading = (
    <>
      <span className="truncate">{title}</span>
      <Badge variant="secondary" className="ml-1 h-4 min-w-4 px-1 text-[10px] tabular-nums">
        {count}
      </Badge>
      {description ? (
        <span className="ml-1 min-w-0 truncate text-[11px] font-normal text-muted-foreground">
          {description}
        </span>
      ) : null}
    </>
  )

  if (!collapsible) {
    return (
      <section className={cn('overflow-hidden rounded-md border border-border/70 bg-background', className)}>
        <div className="flex min-h-9 items-center gap-2 border-b border-border/60 px-2">
          <div className="flex h-8 min-w-0 flex-1 items-center justify-start gap-1 px-1.5 text-xs font-medium">
            {heading}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="space-y-1.5 p-1.5">{children}</div>
      </section>
    )
  }

  return (
    <Collapsible
      className={cn('overflow-hidden rounded-md border border-border/70 bg-background', className)}
      onOpenChange={setOpen}
      open={open}
    >
      <div className="flex min-h-9 items-center gap-2 border-b border-border/60 px-2">
        <CollapsibleTrigger asChild>
          <Button
            className="h-8 min-w-0 flex-1 justify-start gap-1 px-1.5 text-xs font-medium"
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconChevronRight
              className={cn('size-3.5 shrink-0 transition-transform', open ? 'rotate-90' : '')}
            />
            {heading}
          </Button>
        </CollapsibleTrigger>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="space-y-1.5 p-1.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
