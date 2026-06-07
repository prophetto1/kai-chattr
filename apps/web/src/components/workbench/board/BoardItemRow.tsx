'use client'

import {
  forwardRef,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react'
import { IconGripVertical } from '@tabler/icons-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

type BoardItemRowProps = {
  actions?: ReactNode
  children?: ReactNode
  className?: string
  dragHandleProps?: HTMLAttributes<HTMLButtonElement>
  isDragging?: boolean
  meta?: ReactNode
  status?: string
  statusClassName?: string
  style?: CSSProperties
  title: ReactNode
}

export const BoardItemRow = forwardRef<HTMLDivElement, BoardItemRowProps>(
  (
    {
      actions,
      children,
      className,
      dragHandleProps,
      isDragging,
      meta,
      status,
      statusClassName,
      style,
      title,
    },
    ref
  ) => (
    <div
      className={cn(
        'group rounded-md border border-border/60 bg-card px-2 py-1.5 shadow-xs transition-colors',
        'hover:border-border hover:bg-accent/20',
        isDragging ? 'opacity-60 shadow-md' : '',
        className
      )}
      ref={ref}
      style={style}
    >
      <div className="flex min-w-0 items-start gap-1.5">
        {dragHandleProps ? (
          <Button
            aria-label="Drag item"
            className="mt-0.5 size-6 shrink-0 cursor-grab p-0 active:cursor-grabbing"
            size="icon"
            type="button"
            variant="ghost"
            {...dragHandleProps}
          >
            <IconGripVertical className="size-3.5" />
          </Button>
        ) : null}
        {status ? (
          <Badge className={cn('mt-0.5 h-5 shrink-0 text-[10px]', statusClassName)}>
            {status}
          </Badge>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="min-w-0 text-sm leading-5">{title}</div>
          {meta ? <div className="mt-0.5 text-[11px] text-muted-foreground">{meta}</div> : null}
        </div>
        {actions ? <div className="ml-1 shrink-0">{actions}</div> : null}
      </div>
      {children ? <div className="mt-2 pl-0">{children}</div> : null}
    </div>
  )
)

BoardItemRow.displayName = 'BoardItemRow'
