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
import { typographyStyle } from '@/lib/design-system'

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

/*
 * Flat lane section. No enclosed bordered card — just a lightweight header
 * (chevron + title + count + optional description) and the items beneath it,
 * separated by spacing. Matches the cleaner Jobs pattern; the dock pane itself
 * is the only container.
 */
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
      <span className="truncate text-xs font-semibold text-foreground">{title}</span>
      <Badge
        variant="secondary"
        className="h-[18px] min-w-[18px] justify-center rounded-full px-1.5"
        style={typographyStyle('code.stat')}
      >
        {count}
      </Badge>
      {description ? (
        <span className="ml-0.5 min-w-0 truncate text-muted-foreground" style={typographyStyle('ui.caption')}>
          {description}
        </span>
      ) : null}
    </>
  )

  if (!collapsible) {
    return (
      <section className={cn('pt-2', className)}>
        <div className="flex min-h-7 items-center gap-2 px-1">
          <div className="flex min-w-0 flex-1 items-center gap-2">{heading}</div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
        <div className="flex flex-col gap-2 pt-1.5">{children}</div>
      </section>
    )
  }

  return (
    <Collapsible className={cn('pt-2', className)} onOpenChange={setOpen} open={open}>
      <div className="flex min-h-7 items-center gap-2">
        <CollapsibleTrigger asChild>
          <Button
            className="h-7 min-w-0 flex-1 justify-start gap-2 rounded-md px-1 text-xs font-semibold hover:bg-accent/60"
            size="sm"
            type="button"
            variant="ghost"
          >
            <IconChevronRight
              className={cn(
                'size-3.5 shrink-0 text-muted-foreground transition-transform',
                open ? 'rotate-90' : ''
              )}
            />
            {heading}
          </Button>
        </CollapsibleTrigger>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <CollapsibleContent>
        <div className="flex flex-col gap-2 pt-1.5">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  )
}
